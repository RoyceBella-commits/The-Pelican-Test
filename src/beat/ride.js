// Where the rider is at any time t. Pure functions of t (plus the scenes' ride params).
//
// Inside panel i the rider follows a speed profile x(u), u = t − sceneStart(i):
//   • x(0) = −FRAME_W (left frame midline), x(6) = PANEL + FRAME_W (right frame midline)
//   • speed SPEED and zero acceleration at both ends, so crossings are seamless
//   • an optional slowdown/hold in bar 2, repaid by gentle boosts in bars 1 and 3
// The crank follows distance (1 rev / CRANK_DIST) so pedalling re-locks to the beat at every crossing.
import {
  SCENE_DUR, SPEED, PANEL, FRAME_W, PITCH, INTRO, N_SCENES, OUTRO_START,
  sceneStart, panelLeft, CRANK_DIST, WHEEL_R,
} from './timeline.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sin2bump = (lo, hi, u) => (u <= lo || u >= hi ? 0 : Math.sin(Math.PI * (u - lo) / (hi - lo)) ** 2);

const STEPS = 1200;            // integration table resolution (5 ms)
const DU = SCENE_DUR / STEPS;
const cache = new Map();

/**
 * Build a speed profile.
 * params: { hold: [a, b], speed: s, ramp: r }   slow to s·SPEED between a and b (bar 2 ≈ [2, 4])
 *         { stopAt: x, stopBars: [d0, d1] }      decelerate to rest at panel-local x (last panel)
 * Returns { x(u), v(u), lost, peak } with x in panel-local units.
 */
export function profile(params = {}) {
  const key = JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);
  let vfn;
  let lost = 0;
  if (params.stopAt != null) {
    // decelerate over one bar so the rider comes to rest exactly at stopAt
    const span = params.stopSpan ?? 2;
    const d0 = (params.stopAt + FRAME_W) / SPEED - span / 2;
    vfn = (u) => SPEED * (1 - sstep(d0, d0 + span, u));
  } else if (params.hold) {
    const [a, b] = params.hold;
    const s = params.speed ?? 0;
    const r = Math.min(params.ramp ?? 0.3, (b - a) / 2);
    const dip = (u) => sstep(a, a + r, u) * (1 - sstep(b - r, b, u));
    const dipArea = (b - a) - r;
    const boostArea = a / 2 + (SCENE_DUR - b) / 2;
    const A = ((1 - s) * dipArea) / boostArea;
    const boost = (u) => sin2bump(0, a, u) + sin2bump(b, SCENE_DUR, u);
    vfn = (u) => SPEED * (1 + A * boost(u) - (1 - s) * dip(u));
    lost = (1 - s) * dipArea;
  } else {
    vfn = () => SPEED;
  }
  // integrate (trapezoid) and normalise so crossings land exactly on the frame midlines
  const xs = new Float64Array(STEPS + 1);
  let acc = 0, peak = 0;
  for (let k = 1; k <= STEPS; k++) {
    const v0 = vfn((k - 1) * DU), v1 = vfn(k * DU);
    acc += 0.5 * (v0 + v1) * DU;
    xs[k] = acc;
    peak = Math.max(peak, v1);
  }
  const travel = params.stopAt != null ? params.stopAt + FRAME_W : PITCH;
  const norm = params.stopAt != null ? 1 : travel / acc;
  const x = (u) => {
    if (u <= 0) return -FRAME_W + SPEED * u;               // extrapolate (only used for sampling)
    if (u >= SCENE_DUR) return -FRAME_W + xs[STEPS] * norm + vfn(SCENE_DUR) * (u - SCENE_DUR);
    const f = u / DU, k = Math.floor(f), w = f - k;
    return -FRAME_W + (xs[k] * (1 - w) + xs[k + 1] * w) * norm;
  };
  const v = (u) => vfn(Math.max(0, Math.min(SCENE_DUR, u))) * norm;
  const out = { x, v, lost, peak: peak * norm };
  cache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ intro
// The book-plate pelican waits on the preface sheet, pushes off on the 3 s
// downbeat and reaches cruising speed exactly as it crosses frame 0 at t = 5.
// v(w) = SPEED·(1 − (1 − w)³): brisk start, zero acceleration at the crossing.
export const INTRO_GO = 3;
const INTRO_T = INTRO - INTRO_GO;
export const INTRO_START_X = -SPEED * INTRO_T * 0.75;   // −270
function introX(t) {
  if (t <= INTRO_GO) return INTRO_START_X;
  const w = Math.min(1, (t - INTRO_GO) / INTRO_T);
  // ∫0^w 1 − (1 − s)³ ds = w − (1 − (1 − w)⁴) / 4
  return INTRO_START_X + SPEED * INTRO_T * (w - (1 - Math.pow(1 - w, 4)) / 4);
}
function introV(t) {
  if (t <= INTRO_GO) return 0;
  const w = Math.min(1, (t - INTRO_GO) / INTRO_T);
  return SPEED * (1 - Math.pow(1 - w, 3));
}

/**
 * Rider state at time t. `scenes` is the scene list (only `.ride` params are read).
 * Returns { t, i, u, wx, x, v, crank, wheel }:
 *   i  = panel index the rider is in (−1 intro), u = local time in that panel
 *   wx = world x of the bottom bracket, x = panel-local x
 *   crank / wheel = rotation angles in radians (clockwise on screen when riding right)
 */
export function riderAt(t, scenes) {
  let i, u, wx, v;
  if (t < INTRO) {
    i = -1; u = t - INTRO; wx = introX(t); v = introV(t);
  } else {
    i = Math.min(N_SCENES - 1, Math.floor((t - INTRO) / SCENE_DUR));
    u = t - sceneStart(i);                     // may exceed SCENE_DUR in the outro
    const prof = profile(scenes?.[i]?.ride || {});
    const uc = Math.min(u, SCENE_DUR);
    wx = panelLeft(i) + prof.x(uc);
    v = t >= OUTRO_START ? 0 : prof.v(uc);
  }
  const x = i >= 0 ? wx - panelLeft(i) : wx;
  return {
    t, i, u, wx, x, v,
    crank: (2 * Math.PI * wx) / CRANK_DIST,
    wheel: wx / WHEEL_R,
  };
}

/** Rider world x only (cheap; used by the camera smoother). */
export function riderX(t, scenes) {
  if (t < INTRO) return introX(t);
  const i = Math.min(N_SCENES - 1, Math.floor((t - INTRO) / SCENE_DUR));
  const prof = profile(scenes?.[i]?.ride || {});
  const u = Math.min(t - sceneStart(i), SCENE_DUR);
  return panelLeft(i) + prof.x(u);
}

export { PANEL };
