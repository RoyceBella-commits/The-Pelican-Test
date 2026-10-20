// 12 · 星月夜 / The Starry Night · 1889 — a night landscape in Van Gogh's late language (original arrangement).
//
// Picture: a big sky (upper half) of flowing streams of dashes; one great double spiral above the middle of the
// panel (a tight coil inside a ring band), two smaller spirals (upper left, lower right), ten haloed stars, a crescent
// moon in an orange-yellow halo at the upper right; a flame-like cypress at the right edge; rolling blue hills with
// Prussian contours; a sleeping village at the left (white walls, blue roofs, a slender spire) and a few farms to the
// right; a dark field; the ochre road (rider line y = 800) with grass along it; a grassy bank with the title painted
// into the lower-left corner the way a painter signs: 「星月夜 1889」 / The Starry Night.
//
// Gag (星空随车轮一起转): the great spiral turns with the bicycle's wheel angle (coupling CB) the whole time, its ring
// band at half speed, the small spirals counter-rotating. u 2.0: the pelican stands on the pedals, the coupling ×4 for
// the bar, stars flare, the cypress flames whip, the moon halo throbs, swirls open around the wheels. u 2.5/3.0/3.5:
// village windows light up group by group; u 3.0 the church bell swings. u 4.0: back to cruising.
//
// Technique (0 live p5.brush marks; everything is a Canvas2D impasto model):
//   • a DASH is one loaded brush stroke: a body in the base colour plus 2–9 bristle streaks, each its own mix of two
//     colours (wet-in-wet), with ragged starts/ends; it also writes a HEIGHT map (body + bristle ridges + a ridge where
//     the brush lifts). The height map is lit (diffuse + gloss + cavity) → impasto relief. Under the dashes: a canvas
//     weave (height + colour) and a thin underpainting, so the weave shows wherever the paint is thin.
//   • the whole static picture is one 2 px/unit bake; the spiral coil / ring band / small spirals, stars, moon,
//     window lights and bell are small baked layers drawn with rotation/scale/alpha; the cypress and the pelican are
//     re-painted every frame with the same dash model into small reusable canvases.
import { rng, hash, lerp, clamp, smoothstep, window01, smoothPath, ribbon } from '../kit/math.js';
import { profile } from '../beat/ride.js';
import { WHEEL_R } from '../beat/timeline.js';

const ID = 'starry';
const S = 2;                                   // px per panel unit for every bake and live canvas
const RIDE = { hold: [2.3, 3.6], speed: 0.6, ramp: 0.3 };
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ fast numeric noise
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ------------------------------------------------------------------ colour
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pal = (arr) => arr.map(hx);
const pick = (p, R) => p[(R() * p.length) | 0];
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const grey = (v) => { v = v < 0 ? 0 : v > 255 ? 255 : v | 0; return `rgb(${v},${v},${v})`; };

const SKY = {
  deep: pal(['#152259', '#1b2b68', '#13264a', '#22357a', '#1a2f70', '#1d2f6b']),
  mid: pal(['#24418a', '#2f5fb3', '#27499c', '#1d2f6b', '#35609f', '#2a52a0']),
  low: pal(['#4e7db0', '#6fa3b8', '#5a8cbc', '#3f6fa8', '#86b2bd', '#5f96b4']),
  light: pal(['#9cc6c8', '#bcd9d2', '#80b4c4', '#d0e4d4', '#a6cbd8', '#6fa3b8']),
  white: pal(['#e6eedf', '#f1efd6', '#d2e4dc', '#dfeadf']),
  star: pal(['#e9e39a', '#f1d35a', '#e0e0a0', '#f4ecb8', '#f6e27a']),
  green: pal(['#a8c4a0', '#c4d4a0', '#9cc0b0', '#b8d0a8']),
  moon: pal(['#ecc45a', '#e8b84c', '#d8c070', '#f0d888', '#e8a53a']),
  dark: pal(['#101a45', '#142a4f', '#13205a']),
};
const PRUSSIAN = hx('#142a4f');

// ------------------------------------------------------------------ composition
const C0 = { x: 470, y: 255 };                 // the great spiral
const COIL_R = 104, COIL_F = 134;              // coil: solid radius, ragged-edge radius
const RING_R0 = 92, RING_R1 = 170, RING_F = 204;
const SMALL = [
  { x: 150, y: 178, r: 54, f: 76, k: 0.75, lam: 34 },
  { x: 738, y: 336, r: 44, f: 64, k: 0.9, lam: 30 },
];
const MOON = { x: 812, y: 118, r: 29, halo: 68 };
const STARS = [
  { x: 62, y: 72, r: 23 }, { x: 300, y: 56, r: 27 }, { x: 455, y: 34, r: 15 }, { x: 622, y: 76, r: 22 },
  { x: 690, y: 190, r: 17 }, { x: 852, y: 268, r: 36 }, { x: 56, y: 335, r: 19 }, { x: 246, y: 392, r: 29 },
  { x: 620, y: 448, r: 18 }, { x: 110, y: 418, r: 14 },
];
STARS.forEach((s, k) => { s.dir = k % 2 ? 1 : -1; s.R = Math.ceil(s.r * 1.3 + 6); });

/** y(x) lookup from control points (Catmull-Rom, tabulated every unit). */
function curveFn(ctrl) {
  const P = smoothPath(ctrl, 16);
  const x0 = Math.floor(P[0][0]), x1 = Math.ceil(P[P.length - 1][0]);
  const N = x1 - x0 + 1, tab = new Float32Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const x = x0 + i;
    while (k < P.length - 2 && P[k + 1][0] < x) k++;
    const a = P[k], b = P[k + 1], t = clamp((x - a[0]) / ((b[0] - a[0]) || 1));
    tab[i] = a[1] + (b[1] - a[1]) * t;
  }
  return (x) => tab[clamp(Math.round(x - x0), 0, N - 1)];
}
const ridgeFar = curveFn([[-20, 494], [60, 470], [130, 452], [210, 468], [300, 498], [380, 512], [470, 505], [560, 488],
  [650, 468], [720, 474], [800, 498], [880, 488], [960, 470], [1030, 478]]);
const ridgeNear = curveFn([[-20, 562], [90, 548], [180, 566], [280, 586], [380, 574], [480, 562], [580, 576], [690, 592],
  [790, 572], [880, 556], [1030, 566]]);
const FIELD_Y = (x) => 712 + 4 * Math.sin(x * 0.013 + 0.6);
const ROAD0 = 782, ROAD1 = 840;

// village
const HOUSES = [
  // far valley farms (tiny)
  { z: 0, x: 412, yb: 628, w: 22, h: 11, roof: 8, side: 8, type: 'long', roofC: 'blue', win: [[6, 3, 0]] },
  { z: 0, x: 506, yb: 622, w: 26, h: 12, roof: 9, side: 9, type: 'gable', roofC: 'blue', win: [[6, 4, 0], [15, 4, 9]] },
  { z: 0, x: 600, yb: 632, w: 20, h: 10, roof: 8, side: 7, type: 'long', roofC: 'red', win: [[7, 3, 9]] },
  // cluster at the left, back row
  { z: 1, x: 38, yb: 664, w: 46, h: 24, roof: 18, side: 13, type: 'gable', roofC: 'blue', win: [[9, 8, 1], [28, 8, 0]] },
  { z: 1, x: 108, yb: 660, w: 40, h: 22, roof: 16, side: 12, type: 'long', roofC: 'blue', win: [[8, 7, 9], [25, 7, 1]] },
  { z: 1, x: 292, yb: 668, w: 42, h: 22, roof: 16, side: 12, type: 'long', roofC: 'green', win: [[9, 7, 3], [27, 7, 0]] },
  // front row (drawn after the church)
  { z: 3, x: 16, yb: 700, w: 56, h: 30, roof: 20, side: 15, type: 'long', roofC: 'blue', win: [[8, 9, 1], [24, 9, 1], [40, 9, 9]], door: 30 },
  { z: 3, x: 86, yb: 703, w: 62, h: 38, roof: 22, side: 14, type: 'gable', roofC: 'blue', win: [[10, 8, 3], [42, 8, 3], [10, 22, 0], [26, 22, 9]], door: 44 },
  { z: 3, x: 160, yb: 702, w: 40, h: 26, roof: 17, side: 11, type: 'long', roofC: 'red', win: [[8, 8, 2], [24, 8, 9]] },
  { z: 3, x: 292, yb: 704, w: 50, h: 30, roof: 19, side: 13, type: 'gable', roofC: 'blue', win: [[9, 9, 3], [30, 9, 2]], door: 20 },
  // farms right of the road's middle
  { z: 3, x: 700, yb: 705, w: 58, h: 30, roof: 20, side: 14, type: 'long', roofC: 'blue', win: [[9, 9, 0], [26, 9, 9], [42, 9, 0]], door: 33 },
  { z: 3, x: 774, yb: 702, w: 42, h: 24, roof: 18, side: 12, type: 'gable', roofC: 'green', win: [[9, 8, 9], [25, 8, 0]] },
  { z: 3, x: 826, yb: 706, w: 36, h: 22, roof: 15, side: 10, type: 'long', roofC: 'red', win: [[8, 7, 0]] },
];
const CHURCH = { x: 202, yb: 700, w: 56, h: 32, roof: 20, tx: 252, tw: 24, top: 618, spire: 448,
  win: [[10, 10, 2], [28, 10, 2], [44, 10, 9]] };
const BELL = { x: CHURCH.tx + CHURCH.tw / 2, y: CHURCH.top + 9 };
const TREES = [
  { z: 0, x: 462, yb: 650, h: 22, w: 28, kind: 'round' }, { z: 0, x: 560, yb: 640, h: 20, w: 26, kind: 'round' },
  { z: 0, x: 96, yb: 664, h: 74, w: 18, kind: 'poplar' }, { z: 0, x: 278, yb: 668, h: 58, w: 16, kind: 'poplar' },
  { z: 2, x: 150, yb: 690, h: 58, w: 16, kind: 'poplar' }, { z: 2, x: 384, yb: 702, h: 70, w: 19, kind: 'poplar' },
  { z: 2, x: 356, yb: 706, h: 40, w: 42, kind: 'round' }, { z: 2, x: 648, yb: 704, h: 40, w: 44, kind: 'round' },
  { z: 2, x: 684, yb: 698, h: 62, w: 17, kind: 'poplar' }, { z: 2, x: 868, yb: 708, h: 30, w: 30, kind: 'round' },
  { z: 2, x: 480, yb: 712, h: 26, w: 40, kind: 'round' }, { z: 2, x: 560, yb: 714, h: 22, w: 34, kind: 'round' },
];
const WIN_T = [0, 2.5, 3.0, 3.5];               // group → time the windows light (0 = always lit; 9 = never)

// cypress (live): base, tip, half-width profile
const CYP = { bx: 940, by: 794, top: 58, lean: 12 };
const CYP_H = CYP.by - CYP.top;
const cypHW = (t) => 56 * (0.5 + 0.5 * smoothstep(0, 0.2, t)) * Math.pow(Math.max(0, 1 - t), 0.72);
const CYP_REG = { x0: 846, y0: 36, w: 172, h: 770 };
const FRONT = { x0: 840, y0: 738, w: 160, h: 262 };

// ------------------------------------------------------------------ timing
const PROF = profile(RIDE);
const CB = 0.22;                                // sky turns at CB × the wheel angle
const spinW = (u) => smoothstep(1.85, 2.1, u) * (1 - smoothstep(3.85, 4.35, u));
const whipW = (u) => smoothstep(1.92, 2.12, u) * (1 - smoothstep(3.8, 4.3, u));
const TAB_N = 1200;
const E_TAB = new Float64Array(TAB_N + 1), Q_TAB = new Float64Array(TAB_N + 1);
(() => {
  const du = 6 / TAB_N;
  let e = 0, q = 0;
  for (let k = 1; k <= TAB_N; k++) {
    const u0 = (k - 1) * du, u1 = k * du;
    e += 0.5 * (spinW(u0) * PROF.v(u0) + spinW(u1) * PROF.v(u1)) / WHEEL_R * du;
    q += 0.5 * (whipW(u0) + whipW(u1)) * du;
    E_TAB[k] = e; Q_TAB[k] = q;
  }
})();
const tab = (T, u) => { if (u <= 0) return 0; if (u >= 6) return T[TAB_N]; const f = (u / 6) * TAB_N, k = Math.floor(f); return T[k] + (T[k + 1] - T[k]) * (f - k); };
/** Sky rotation: the wheel angle × CB, plus 3 extra wheel-turns' worth during the spin-up bar (×4 coupling). */
const skyAngle = (u, wheel) => CB * (wheel + 3 * tab(E_TAB, u));
const standK = (u) => window01(1.92, 4.12, u, 0.22);
const flareK = (u) => smoothstep(1.95, 2.08, u) * (1 - smoothstep(3.6, 4.3, u));
const beatPulse = (u) => { const ph = (((u % 0.5) + 0.5) % 0.5) / 0.5; return Math.exp(-ph * 5); };

// ------------------------------------------------------------------ canvases
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}

/** A paint surface: colour canvas + height canvas (+ blur scratch, + optional coverage mask). Draw in panel units. */
class Painter {
  constructor(x0, y0, wU, hU, mask) {
    this.W = Math.ceil(wU * S); this.H = Math.ceil(hU * S);
    this.cv = mk(this.W, this.H); this.c = ctx2d(this.cv);
    this.hv = mk(this.W, this.H); this.h = ctx2d(this.hv);
    this.bv = mk(this.W, this.H); this.b = ctx2d(this.bv);
    if (mask) {
      this.mask = mask; this.mv = mk(mask.w * S, mask.h * S); this.m = ctx2d(this.mv);
      this.m.setTransform(S, 0, 0, S, -mask.x0 * S, -mask.y0 * S); this.m.lineCap = 'round'; this.m.lineJoin = 'round';
      this.m.fillStyle = '#fff'; this.m.strokeStyle = '#fff';
    }
    this.maskOn = false;
    this.origin(x0, y0);
  }
  origin(x0, y0) {
    this.x0 = x0; this.y0 = y0;
    for (const c of [this.c, this.h]) { c.setTransform(S, 0, 0, S, -x0 * S, -y0 * S); c.lineCap = 'round'; c.lineJoin = 'round'; }
  }
  /** Clear for live reuse: colour transparent, height opaque black (so edges blend correctly). */
  clear(w = this.W, h = this.H) {
    this.c.save(); this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.clearRect(0, 0, w + 4, h + 4); this.c.restore();
    this.h.save(); this.h.setTransform(1, 0, 0, 1, 0, 0); this.h.globalAlpha = 1; this.h.fillStyle = '#000'; this.h.fillRect(0, 0, w + 4, h + 4); this.h.restore();
  }
}

function pathOf(c, pts) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
}
function closedPath(c, pts) { pathOf(c, pts); c.closePath(); }
/** Sub-path [t0, t1] (arc length) of pts offset by `off` along the normals. */
function subPath(c, pts, L, NX, NY, off, t0, t1) {
  const n = pts.length;
  let i = 1;
  while (i < n - 1 && L[i] < t0) i++;
  let f = (t0 - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  c.beginPath();
  c.moveTo(lerp(pts[i - 1][0] + NX[i - 1] * off, pts[i][0] + NX[i] * off, f), lerp(pts[i - 1][1] + NY[i - 1] * off, pts[i][1] + NY[i] * off, f));
  while (i < n - 1 && L[i] < t1) { c.lineTo(pts[i][0] + NX[i] * off, pts[i][1] + NY[i] * off); i++; }
  f = clamp((t1 - L[i - 1]) / ((L[i] - L[i - 1]) || 1));
  c.lineTo(lerp(pts[i - 1][0] + NX[i - 1] * off, pts[i][0] + NX[i] * off, f), lerp(pts[i - 1][1] + NY[i - 1] * off, pts[i][1] + NY[i] * off, f));
}

const NOOPT = {};
/**
 * One loaded brush stroke along pts (panel units), width w. ca = base colour, cb = the second paint on the brush.
 * o: { h: base height (0–255), alpha, nb: bristles, mix: how far bristles pull toward cb, pAlt: share of mixed
 *      bristles, jit: lightness jitter, ridge: false to skip the lift ridge, noH: colour only }
 */
function dash(P, pts, w, ca, cb, R, o = NOOPT) {
  const tp = o.taper ?? 0;
  if (tp && pts.length < 6) pts = smoothPath(pts.length === 2 ? [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]] : pts, 3);
  const n = pts.length;
  if (n < 2) return;
  const L = new Array(n); L[0] = 0;
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const tot = L[n - 1];
  if (tot < 0.3) return;
  const NX = new Array(n), NY = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l; NY[i] = dx / l;
  }
  const c = P.c, h = P.h;
  const alpha = o.alpha ?? 1;
  // thin paint: in some zones the brush is nearly dry — no body, separated bristles, the weave shows between them
  let dry = false;
  if (P.thin) {
    const m = pts[n >> 1], th = P.thin(m[0], m[1]);
    if (th > 0) { const v = R(); if (v < th * 0.45) return; dry = v < th * 0.95; }
  }
  const hb = (o.h ?? 150) + (R() - 0.5) * 36 - (dry ? 45 : 0);
  if (!dry && tp) {
    c.globalAlpha = alpha; c.strokeStyle = css(ca); if (!o.noH) h.strokeStyle = grey(hb);
    for (let i = 1; i < n; i++) {
      const k = 1 - tp * Math.pow(L[i] / tot, 1.3);
      c.lineWidth = w * 0.84 * k; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
      if (!o.noH) { h.lineWidth = w * 0.9 * k; h.beginPath(); h.moveTo(pts[i - 1][0], pts[i - 1][1]); h.lineTo(pts[i][0], pts[i][1]); h.stroke(); }
    }
  } else if (!dry) {
    c.globalAlpha = alpha; c.strokeStyle = css(ca); c.lineWidth = w * 0.84; pathOf(c, pts); c.stroke();
    if (!o.noH) { h.strokeStyle = grey(hb); h.lineWidth = w * 0.9; pathOf(h, pts); h.stroke(); }
  }
  if (P.maskOn) { P.m.lineWidth = w * 0.95; pathOf(P.m, pts); P.m.stroke(); }
  const nb = o.nb ?? Math.max(2, Math.min(9, Math.round((w * S) / 2.6)));
  const mixA = o.mix ?? 0.55, jit = o.jit ?? 0.08, pAlt = o.pAlt ?? 0.45;
  for (let j = 0; j < nb; j++) {
    const f = (j + 0.5) / nb - 0.5;
    const off = (f * w * 0.9 + (R() - 0.5) * w * 0.06) * (1 - tp * 0.35);
    const t0 = R() * R() * 0.22 * tot, t1 = tot * (1 - R() * R() * 0.34) * (1 - tp * Math.abs(f) * 0.9);
    const m = R() < pAlt ? mixA * (0.35 + 0.65 * R()) : mixA * 0.16 * R();
    const k = 1 + (R() - 0.5) * 2 * jit;
    const bw = (w / nb) * (0.95 + R() * 0.75) * (dry ? 0.62 : 1);
    subPath(c, pts, L, NX, NY, off, t0, dry ? t1 * (0.7 + 0.3 * R()) : t1);
    c.globalAlpha = alpha * (0.74 + 0.26 * R()) * (dry ? 0.9 : 1);
    c.strokeStyle = `rgb(${(ca[0] + (cb[0] - ca[0]) * m) * k | 0},${(ca[1] + (cb[1] - ca[1]) * m) * k | 0},${(ca[2] + (cb[2] - ca[2]) * m) * k | 0})`;
    c.lineWidth = bw; c.stroke();
    if (!o.noH) {
      subPath(h, pts, L, NX, NY, off, t0, t1);
      h.strokeStyle = grey(hb + (j & 1 ? 18 : -14) + (R() - 0.5) * 10); h.lineWidth = bw * 0.7; h.stroke();
    }
  }
  if (!o.noH && o.ridge !== false && !tp) {
    const e = pts[n - 1], q = pts[n - 2];
    h.strokeStyle = grey(hb + 30); h.lineWidth = w * 0.5;
    h.beginPath(); h.moveTo(lerp(q[0], e[0], 0.3), lerp(q[1], e[1], 0.3)); h.lineTo(e[0], e[1]); h.stroke();
  }
  c.globalAlpha = 1;
}

/** Opaque underlayer of a shape (paint body under the dashes). */
function fillPoly(P, pts, col, hv = 90, alpha = 1) {
  P.c.globalAlpha = alpha; P.c.fillStyle = css(col); closedPath(P.c, pts); P.c.fill(); P.c.globalAlpha = 1;
  if (hv != null) { P.h.fillStyle = grey(hv); closedPath(P.h, pts); P.h.fill(); }
  if (P.maskOn) { closedPath(P.m, pts); P.m.fill(); }
}
function fillCircle(P, x, y, r, col, hv = 120) {
  P.c.fillStyle = css(col); P.c.beginPath(); P.c.arc(x, y, r, 0, TAU); P.c.fill();
  if (hv != null) { P.h.fillStyle = grey(hv); P.h.beginPath(); P.h.arc(x, y, r, 0, TAU); P.h.fill(); }
}

const LV = (() => { const x = -0.48, y = -0.62, z = 0.62, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();
const HV = (() => { const x = LV[0], y = LV[1], z = LV[2] + 1, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();
/** Light the paint: normals from the (slightly blurred) height map → diffuse + wet gloss + cavity. Returns ImageData. */
function light(P, w = P.W, h = P.H, o = NOOPT) {
  w = Math.min(w, P.W); h = Math.min(h, P.H);
  const b = P.b;
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, w + 2, h + 2);
  b.filter = `blur(${o.blur ?? 0.8}px)`; b.drawImage(P.hv, 0, 0, w, h, 0, 0, w, h); b.filter = 'none';
  const hd = b.getImageData(0, 0, w, h).data;
  const img = P.c.getImageData(0, 0, w, h), cd = img.data;
  const kz = o.relief ?? 0.022, shA = o.shade ?? 0.72, spA = o.spec ?? 60, cav = o.cav ?? 0.0035;
  const Lx = LV[0], Ly = LV[1], Lz = LV[2], Hx = HV[0], Hy = HV[1], Hz = HV[2];
  const W4 = w * 4;
  for (let j = 1; j < h - 1; j++) {
    let k = j * W4 + 4;
    for (let i = 1; i < w - 1; i++, k += 4) {
      if (cd[k + 3] === 0) continue;
      const hc = hd[k], hl = hd[k - 4], hr = hd[k + 4], hu = hd[k - W4], hn = hd[k + W4];
      const nx = -(hr - hl) * 0.5 * kz, ny = -(hn - hu) * 0.5 * kz;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      let sh = 1 + (((nx * Lx + ny * Ly + Lz) * inv) / Lz - 1) * shA;
      sh *= 1 + (4 * hc - hl - hr - hu - hn) * cav;
      sh = sh < 0.42 ? 0.42 : sh > 1.55 ? 1.55 : sh;
      let sp = ((nx * Hx + ny * Hy + Hz) * inv - Hz) / (1 - Hz);
      sp = sp > 0 ? sp * sp * spA : 0;
      cd[k] = cd[k] * sh + sp; cd[k + 1] = cd[k + 1] * sh + sp; cd[k + 2] = cd[k + 2] * sh + sp * 0.9;
    }
  }
  return img;
}
function litCanvas(P, o) { const img = light(P, P.W, P.H, o); const cv = mk(P.W, P.H); cv.getContext('2d').putImageData(img, 0, 0); return cv; }

/** Streamline of a direction field through (x, y), centred, about L long. */
function stream(x, y, L, dirFn, step = 2.6) {
  const n = Math.max(1, Math.round(L / 2 / step));
  const fw = [[x, y]], bw = [];
  const d0 = dirFn(x, y);
  for (const sgn of [1, -1]) {
    let px = x, py = y, pdx = d0[0] * sgn, pdy = d0[1] * sgn;
    for (let i = 0; i < n; i++) {
      let [ex, ey] = dirFn(px, py);
      if (ex * pdx + ey * pdy < 0) { ex = -ex; ey = -ey; }
      px += ex * step; py += ey * step; pdx = ex; pdy = ey;
      (sgn > 0 ? fw : bw).push([px, py]);
    }
  }
  return bw.reverse().concat(fw);
}
const inPoly = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const arcPts = (cx, cy, r, a0, a1, n = 6) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
const shuffleSort = (items) => items.sort((a, b) => a.k - b.k);

// ------------------------------------------------------------------ the sky's flow (stream function ψ)
const VORTS = [
  { x: C0.x, y: C0.y, R: 215, A: 520 },
  { x: SMALL[0].x, y: SMALL[0].y, R: 92, A: -150 },
  { x: SMALL[1].x, y: SMALL[1].y, R: 78, A: -120 },
  { x: MOON.x, y: MOON.y, R: 92, A: 130 },
  ...STARS.map((s) => ({ x: s.x, y: s.y, R: s.r * 1.4, A: 40 + s.r * 1.2 })),
];
// the serpentine "wind": a luminous stream that flows under the small spiral, beneath the great one and curls up into
// the right-hand spiral (a jet in the stream function: the flow runs along it, its dashes are pale)
const WIND = smoothPath([[-30, 262], [60, 256], [150, 284], [232, 334], [306, 402], [392, 456], [478, 478], [562, 470],
  [634, 438], [690, 400], [716, 372]], 8);
const WIND_W = 21;
function windAt(x, y) {
  let best = 1e9, n = 0, along = 0, acc = 0;
  for (let i = 0; i < WIND.length - 1; i++) {
    const a = WIND[i], b = WIND[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2);
    const qx = a[0] + dx * t, qy = a[1] + dy * t, d = Math.hypot(x - qx, y - qy);
    if (d < best) { best = d; n = Math.sign(dx * (y - a[1]) - dy * (x - a[0])) * d; along = acc + t * l; }
    acc += l;
  }
  return { n, d: best, along, len: acc };
}
function psiExact(x, y) {
  let v = y + 38 * Math.sin(x * 0.0095 + 0.7) + 16 * Math.sin(x * 0.024 + y * 0.012 + 1.9) + 10 * Math.sin(x * 0.05 - y * 0.02);
  for (let i = 0; i < VORTS.length; i++) {
    const q = VORTS[i], dx = x - q.x, dy = y - q.y, d2 = (dx * dx + dy * dy) / (q.R * q.R);
    if (d2 < 5) v += q.A * Math.exp(-d2 * d2);
  }
  const w = windAt(x, y);
  if (w.d < 160) v += 2.4 * WIND_W * Math.tanh(w.n / WIND_W) * smoothstep(0, 80, w.along) * smoothstep(w.len, w.len - 60, w.along) * (1 - smoothstep(90, 160, w.d));
  return v;
}
const PG = 2, PX0 = -24, PY0 = -24, PNX = 530, PNY = 310;
let PSI = null;
function psi(x, y) {
  if (!PSI) {
    PSI = new Float32Array(PNX * PNY);
    for (let j = 0; j < PNY; j++) for (let i = 0; i < PNX; i++) PSI[j * PNX + i] = psiExact(PX0 + i * PG, PY0 + j * PG);
  }
  const fx = clamp((x - PX0) / PG, 0, PNX - 1.001), fy = clamp((y - PY0) / PG, 0, PNY - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * PNX + i;
  const a = PSI[k], b = PSI[k + 1], c = PSI[k + PNX], d = PSI[k + PNX + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function skyDir(x, y) {
  const e = 0.8, gx = psi(x + e, y) - psi(x - e, y), gy = psi(x, y + e) - psi(x, y - e);
  const l = Math.hypot(gx, gy) || 1;
  return [gy / l, -gx / l];
}
/** Colour of a sky dash: height gradient, light streams along the flow, star / moon glow. */
function skyColour(x, y, R) {
  const t = clamp((y - 20) / 470);
  const z = t + (R() - 0.5) * 0.34;
  let ca = pick(z < 0.36 ? SKY.deep : z < 0.74 ? SKY.mid : SKY.low, R);
  let cb = pick(z < 0.5 ? SKY.mid : SKY.light, R);
  // streams: bands of ψ (narrower where the flow is fast), warped by noise
  const e = 0.8, g = Math.hypot(psi(x + e, y) - psi(x - e, y), psi(x, y + e) - psi(x, y - e)) / (2 * e);
  const band = Math.cos((psi(x, y) / (40 * (0.55 + 0.45 * Math.min(g, 3)))) * TAU + 5 * (vnoise(x / 130, y / 130, 3) - 0.5));
  if (band > 0.62 && R() < 0.75) {
    ca = pick(t > 0.6 || R() < 0.45 ? SKY.light : SKY.mid, R);
    cb = pick(R() < 0.5 ? SKY.white : SKY.light, R);
  } else if (band < -0.35 && R() < 0.55) {
    ca = mixC(ca, pick(SKY.dark, R), 0.5);
  }
  const wd = windAt(x, y);
  const wf = 1 - wd.d / (WIND_W * 1.15) + 0.35 * (vnoise(x / 40, y / 40, 9) - 0.5);
  if (wf > 0 && R() < 0.4 + wf) {
    ca = pick(wf > 0.45 ? (R() < 0.3 ? SKY.white : SKY.light) : SKY.light, R);
    cb = pick(R() < 0.3 ? SKY.green : SKY.white, R);
  }
  for (const s of STARS) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < s.r * 2.1) {
      const f = 1 - (d - s.r * 1.05) / (s.r * 1.05);
      if (R() < f) { ca = pick(f > 0.55 ? SKY.star : SKY.green, R); cb = pick(SKY.white, R); }
    }
  }
  const dm = Math.hypot(x - MOON.x, y - MOON.y);
  if (dm < MOON.halo * 1.6) {
    const f = 1 - (dm - MOON.halo) / (MOON.halo * 0.6);
    if (R() < f) { ca = pick(f > 0.6 ? SKY.moon : SKY.green, R); cb = pick(SKY.star, R); }
  }
  return [ca, cb];
}

// ------------------------------------------------------------------ painting: static picture
function paintGround(P, weave) {
  const { c, h } = P;
  for (const [ctx, pat] of [[c, weave.col], [h, weave.hgt]]) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ctx.createPattern(pat, 'repeat'); ctx.fillRect(0, 0, P.W, P.H);
    ctx.restore();
  }
  // thin underpainting: the weave stays visible through it
  c.globalAlpha = 0.68;
  const g = c.createLinearGradient(0, 0, 0, 520);
  g.addColorStop(0, '#16245c'); g.addColorStop(0.55, '#24428a'); g.addColorStop(1, '#4a78a6');
  c.fillStyle = g; c.fillRect(0, 0, 1000, 530);
  const band = (top, bot, col) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(-5, top(-5));
    for (let x = 0; x <= 1005; x += 10) c.lineTo(x, top(x));
    for (let x = 1005; x >= -5; x -= 10) c.lineTo(x, bot(x));
    c.closePath(); c.fill();
  };
  band(ridgeFar, ridgeNear, '#22407a');
  band(ridgeNear, () => 640, '#1d3a48');
  band(() => 600, FIELD_Y, '#1f3830');
  band(FIELD_Y, () => ROAD0, '#3a4a2c');
  band(() => ROAD0, () => ROAD1, '#9a7238');
  band(() => ROAD1, () => 1005, '#3a4f2c');
  c.globalAlpha = 1;
}

function weaveTiles() {
  const T = 96, tw = 6;                         // 16 threads of 3 units
  const col = mk(T, T), hgt = mk(T, T);
  const ci = col.getContext('2d').createImageData(T, T), hi = hgt.getContext('2d').createImageData(T, T);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const a = Math.floor(i / tw), b = Math.floor(j / tw);
    const fx = ((i % tw) + 0.5) / tw, fy = ((j % tw) + 0.5) / tw;
    const tx = Math.sin(Math.PI * fx), ty = Math.sin(Math.PI * fy);
    const over = (a + b) & 1;
    const thA = 0.78 + 0.44 * hash3(a, 0, 71), thB = 0.78 + 0.44 * hash3(0, b, 72);
    const v = over ? tx * (0.62 + 0.38 * ty) * thA : ty * (0.62 + 0.38 * tx) * thB;
    const k = (j * T + i) * 4;
    const sh = 0.8 + 0.28 * v + (hash3(i, j, 73) - 0.5) * 0.06;
    ci.data[k] = 196 * sh; ci.data[k + 1] = 182 * sh; ci.data[k + 2] = 150 * sh; ci.data[k + 3] = 255;
    const hv = 4 + 46 * v;
    hi.data[k] = hi.data[k + 1] = hi.data[k + 2] = hv; hi.data[k + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); hgt.getContext('2d').putImageData(hi, 0, 0);
  return { col, hgt };
}

function paintSky(P) {
  const items = [];
  const g = 8.6;
  for (let gy = -2; gy * g < 540; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'sky', gx, gy));
    const x = (gx + R()) * g, y = (gy + R()) * g;
    if (y > ridgeFar(x) + 6) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    let L = lerp(15, 30, R());
    for (const s of STARS) { const d = Math.hypot(x - s.x, y - s.y); if (d < s.r * 2) L = Math.min(L, 8 + d * 0.45); }
    const w = lerp(5, 7.4, R());
    const [ca, cb] = skyColour(x, y, R);
    dash(P, stream(x, y, L, skyDir), w, ca, cb, R, { h: 135 + R() * 40 });
  }
}

const HILLS = {
  far: pal(['#2a4a86', '#34589a', '#24407a', '#3a6aa0', '#1f3566', '#2c5290']),
  farHi: pal(['#7aa6c4', '#9cc0c8', '#86b0c8', '#6a96bc']),
  near: pal(['#1f4050', '#2a5060', '#1c3646', '#2e4a40', '#244a58', '#1a3040']),
  nearHi: pal(['#4f7a80', '#5a8a8a', '#46707a']),
  olive: pal(['#3a4a32', '#44583a']),
};
function paintHills(P) {
  const slope = (f, x) => (f(x + 3) - f(x - 3)) / 6;
  const items = [];
  const g = 8;
  for (let gy = 0; 440 + gy * g < 650; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'hill', gx, gy));
    const x = (gx + R()) * g, y = 440 + (gy + R()) * g;
    const yf = ridgeFar(x), yn = ridgeNear(x);
    if (y < yf - 1 || y > 648) continue;
    items.push({ k: R(), x, y, R, near: y > yn - 2 });
  }
  shuffleSort(items);
  for (const it of items) {
    const { x, y, R } = it;
    const dir = (px, py) => {
      const yf = ridgeFar(px), yn = ridgeNear(px);
      let s;
      if (py < yn) { const d = clamp((py - yf) / Math.max(8, yn - yf)); s = lerp(slope(ridgeFar, px), slope(ridgeNear, px), d); }
      else s = slope(ridgeNear, px) * (1 - clamp((py - yn) / 80));
      s += 0.12 * Math.sin(px * 0.05 + py * 0.08);
      const l = Math.hypot(1, s); return [1 / l, s / l];
    };
    const pts = stream(x, y, lerp(14, 26, R()), dir);
    let ca, cb;
    if (!it.near) {
      const d = (y - ridgeFar(x)) / Math.max(8, ridgeNear(x) - ridgeFar(x));
      ca = d < 0.18 && R() < 0.7 ? pick(HILLS.farHi, R) : pick(HILLS.far, R);
      cb = pick(d < 0.3 ? SKY.light : HILLS.farHi, R);
      if (d > 0.75 && R() < 0.5) ca = mixC(ca, PRUSSIAN, 0.4);
    } else {
      const d = y - ridgeNear(x);
      ca = d < 10 && R() < 0.55 ? pick(HILLS.nearHi, R) : R() < 0.18 ? pick(HILLS.olive, R) : pick(HILLS.near, R);
      cb = pick(HILLS.nearHi, R);
    }
    dash(P, pts, lerp(5, 7, R()), ca, cb, R, { h: 140 });
  }
  // contour lines: Prussian outline along the ridges + a pale lit line just below the far ridge
  for (const [key, f, col, cb, w, off, gap] of [
    ['cfar', ridgeFar, PRUSSIAN, hx('#2a4070'), 3.4, 0, 0.18], ['cnear', ridgeNear, hx('#0f2030'), PRUSSIAN, 3.2, 0, 0.15],
    ['lfar', ridgeFar, hx('#9cc0c8'), hx('#d0e0d8'), 2.6, 6, 0.45]]) {
    const R = rng(hash(ID, key));
    for (let x = -10; x < 1010;) {
      const L = 26 + R() * 30;
      const pts = [];
      for (let s = 0; s <= L; s += 4) pts.push([x + s, f(x + s) + off + (R() - 0.5) * 0.8]);
      if (R() > gap) dash(P, pts, w, col, cb, rng(hash(ID, key, x | 0)), { h: 175, nb: 3 });
      x += L * (0.75 + R() * 0.4);
    }
  }
}

const VILLAGE = {
  ground: pal(['#1f3a2e', '#23402f', '#2a4a36', '#1a2f2a', '#1e3550', '#253f3a']),
  groundHi: pal(['#3a5a40', '#44604a', '#3a5a5a']),
  wall: pal(['#e8e0c0', '#f0e8c8', '#ddd5b4', '#e6dcac', '#d8d4c0']),
  wallB: pal(['#c8c0a0', '#b8c8d8', '#f4ecc8']),
  side: pal(['#8c9cc0', '#a0a8c8', '#7a8ab0', '#96a2c0']),
  sideB: pal(['#c0c8d8', '#6a7aa8']),
  roof: { blue: pal(['#3a5a9a', '#2f4f8a', '#4a6aa8', '#28407a']), green: pal(['#3a6a6a', '#2f5a5a', '#4a7a70', '#2a4a58']), red: pal(['#a8583a', '#b8683a', '#985030', '#8a4a34']) },
  roofB: { blue: hx('#6a8ac0'), green: hx('#7aa0a0'), red: hx('#c88850') },
  lit: pal(['#f2c84a', '#f6d860', '#eebc40']), litB: hx('#fff0a8'),
  dark: pal(['#1c2640', '#232c48', '#1a2238']),
  tree: pal(['#16261c', '#1c3024', '#1f3a2a', '#12201a', '#1a2c34']), treeHi: pal(['#2f4a34', '#3a5a3a', '#2a4a4a']),
};

/** Fill a polygon with small dashes in a given direction (grid in the shape's own bbox). */
function dashFill(P, key, poly, o) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const gx = o.gx ?? 4.5, gy = o.gy ?? 6;
  const items = [];
  for (let j = 0; y0 + j * gy < y1 + gy; j++) for (let i = 0; x0 + i * gx < x1 + gx; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = x0 + (i + R()) * gx - gx * 0.5, y = y0 + (j + R()) * gy - gy * 0.5;
    if (!inPoly(poly, x, y)) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const [dx, dy] = o.dir(x, y, R);
    const L = lerp(o.L[0], o.L[1], R());
    const pts = [[x - dx * L / 2, y - dy * L / 2], [x + dx * L * 0.05 + (R() - 0.5) * 0.6, y + dy * L * 0.05], [x + dx * L / 2, y + dy * L / 2]];
    const [ca, cb] = o.col(x, y, R);
    dash(P, pts, lerp(o.w[0], o.w[1], R()), ca, cb, R, { h: o.h ?? 150, nb: o.nb });
  }
}

function outline(P, key, pts, w = 1.7, col = PRUSSIAN, gap = 0.2) {
  const R = rng(hash(ID, key));
  const sp = smoothPath(pts, 3);
  for (let i = 0; i < sp.length - 1;) {
    const n = 2 + ((R() * 4) | 0);
    const seg = sp.slice(i, Math.min(sp.length, i + n + 1));
    if (seg.length > 1 && R() > gap) dash(P, seg, w, col, hx('#24406a'), rng(hash(ID, key, i)), { h: 185, nb: 2, ridge: false });
    i += n;
  }
}

function windowShape(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function paintWindow(P, key, x, y, w, h, lit) {
  const R = rng(hash(ID, key));
  if (lit) {
    fillPoly(P, windowShape(x, y, w, h), pick(VILLAGE.lit, R), 170);
    dash(P, [[x + w * 0.3, y + 1], [x + w * 0.35, y + h - 1]], w * 0.55, VILLAGE.litB, pick(VILLAGE.lit, R), R, { h: 205, nb: 2 });
  } else {
    fillPoly(P, windowShape(x, y, w, h), pick(VILLAGE.dark, R), 120);
  }
}

function paintHouse(P, hs, k, litNow) {
  const { x, yb, w, h, roof, side, type, roofC } = hs;
  const key = `house${k}`;
  const sc = w < 30 ? 0.6 : 1;
  const top = yb - h, dz = side * 0.35;
  const wallCol = (px, py, R) => [pick(VILLAGE.wall, R), pick(VILLAGE.wallB, R)];
  const sideCol = (px, py, R) => [pick(VILLAGE.side, R), pick(VILLAGE.sideB, R)];
  const roofCol = (px, py, R) => [pick(VILLAGE.roof[roofC], R), VILLAGE.roofB[roofC]];
  const vert = () => [0, 1];
  const front = [[x, yb], [x, top], [x + w, top], [x + w, yb]];
  const sideW = [[x + w, yb], [x + w, top], [x + w + side, top - dz], [x + w + side, yb - dz]];
  const fw = [2.4 * sc + 0.6, 3.6 * sc], fL = [5 * sc + 2, 9 * sc + 1];
  fillPoly(P, sideW, VILLAGE.side[0]);
  dashFill(P, key + 's', sideW, { dir: vert, L: fL, w: fw, col: sideCol, gx: 3.6 * sc + 1, gy: 6 * sc });
  if (type === 'long') {
    const rf = [[x - 4 * sc, top + 1], [x + w + 3 * sc, top + 1], [x + w + side, top - dz], [x + w - 5 * sc + side * 0.3, top - roof], [x + 5 * sc, top - roof]];
    fillPoly(P, front, VILLAGE.wall[0]);
    dashFill(P, key + 'f', front, { dir: vert, L: fL, w: fw, col: wallCol, gx: 3.6 * sc + 1, gy: 6 * sc });
    fillPoly(P, rf, VILLAGE.roof[roofC][0]);
    dashFill(P, key + 'r', rf, { dir: (px, py, R) => [1, (R() - 0.5) * 0.2], L: [8 * sc + 2, 14 * sc + 2], w: fw, col: roofCol, gx: 5 * sc + 1, gy: 3.6 * sc + 0.6 });
    outline(P, key + 'o1', [[x - 4 * sc, top + 1], [x + 5 * sc, top - roof], [x + w - 5 * sc + side * 0.3, top - roof], [x + w + side, top - dz]], 1.6 * sc + 0.4);
  } else {
    const gable = [[x, top], [x + w / 2, top - roof], [x + w, top]];
    const rf = [[x + w / 2, top - roof], [x + w + 2 * sc, top + 1], [x + w + side + 2 * sc, top + 1 - dz], [x + w / 2 + side, top - roof - dz]];
    const wall = front.slice(0, 2).concat(gable.slice(1), front.slice(2));
    fillPoly(P, wall, VILLAGE.wall[0]);
    dashFill(P, key + 'f', wall, { dir: vert, L: fL, w: fw, col: wallCol, gx: 3.6 * sc + 1, gy: 6 * sc });
    fillPoly(P, rf, VILLAGE.roof[roofC][0]);
    dashFill(P, key + 'r', rf, { dir: () => [0.86, -0.5], L: [8 * sc + 2, 13 * sc + 2], w: fw, col: roofCol, gx: 4.5 * sc + 1, gy: 4 * sc + 0.6 });
    outline(P, key + 'o1', [[x - 2 * sc, top + 2], [x + w / 2, top - roof], [x + w + 2 * sc, top + 2]], 1.6 * sc + 0.4);
    outline(P, key + 'o3', [[x + w / 2, top - roof], [x + w / 2 + side, top - roof - dz]], 1.4 * sc + 0.4);
  }
  outline(P, key + 'o2', [[x, top + 2], [x, yb]], 1.4 * sc + 0.3, PRUSSIAN, 0.3);
  outline(P, key + 'o4', [[x + w, top], [x + w, yb]], 1.4 * sc + 0.3, PRUSSIAN, 0.3);
  const ww = w < 30 ? 4 : 6, wh = w < 30 ? 5 : 8;
  hs.win.forEach(([dx, dy, g], i) => paintWindow(P, `${key}w${i}`, x + dx, top + dy, ww, wh, litNow(g)));
  if (hs.door) fillPoly(P, windowShape(x + hs.door, yb - 12, 7, 12), hx('#1f2a40'), 110);
}

function paintChurch(P, litNow) {
  const C = CHURCH;
  // nave (long house)
  paintHouse(P, { x: C.x, yb: C.yb, w: C.w, h: C.h, roof: C.roof, side: 12, type: 'long', roofC: 'blue', win: C.win }, 'ch', litNow);
  // tower
  const tx = C.tx, tw = C.tw, top = C.top;
  const tower = [[tx, C.yb], [tx, top], [tx + tw, top], [tx + tw, C.yb]];
  const tside = [[tx + tw, C.yb], [tx + tw, top], [tx + tw + 8, top - 3], [tx + tw + 8, C.yb - 3]];
  fillPoly(P, tside, VILLAGE.side[0]);
  dashFill(P, 'tws', tside, { dir: () => [0, 1], L: [6, 10], w: [2.6, 3.4], col: (x, y, R) => [pick(VILLAGE.side, R), pick(VILLAGE.sideB, R)], gx: 3.4, gy: 6 });
  fillPoly(P, tower, VILLAGE.wall[0]);
  dashFill(P, 'tw', tower, { dir: () => [0, 1], L: [6, 11], w: [2.8, 3.6], col: (x, y, R) => [pick(VILLAGE.wall, R), pick(VILLAGE.wallB, R)], gx: 4, gy: 6.5 });
  fillPoly(P, windowShape(tx + 7, top + 6, 10, 13), hx('#141c30'), 100);             // belfry opening (the bell is live)
  paintWindow(P, 'tww', tx + 9, top + 40, 6, 9, false);
  // spire: dark blue-green, lit on its left flank
  const sp = [[tx - 3, top + 1], [tx + tw / 2 + 1, C.spire], [tx + tw + 9, top - 2]];
  fillPoly(P, sp, hx('#1f3a4a'));
  dashFill(P, 'sp', sp, {
    dir: (x, y) => { const dx = tx + tw / 2 - x, dy = C.spire - y, l = Math.hypot(dx, dy); return [dx / l, dy / l]; },
    L: [10, 18], w: [2.8, 3.8], gx: 4, gy: 9,
    col: (x, y, R) => (x < tx + tw / 2 - 2 ? [pick(pal(['#4a6a8a', '#3a5a7a', '#5a7a9a']), R), hx('#8aa8c0')] : [pick(pal(['#1f3a4a', '#1a2f40', '#24405a']), R), hx('#2f5070')]),
  });
  outline(P, 'spo1', [[tx - 3, top + 1], [tx + tw / 2 + 1, C.spire]], 1.8);
  outline(P, 'spo2', [[tx + tw / 2 + 1, C.spire], [tx + tw + 9, top - 2]], 1.8);
  outline(P, 'two', [[tx, top], [tx, C.yb - C.h]], 1.4, PRUSSIAN, 0.2);
}

function paintTree(P, tr, k) {
  const key = `tree${k}`;
  if (tr.kind === 'poplar') {
    // narrow flame-like poplar: dashes rising and curling inward
    const n = Math.round(tr.h / 5);
    for (let i = 0; i < n * 3; i++) {
      const R = rng(hash(ID, key, i));
      const t = R();
      const hw = tr.w * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.7);
      const s = (R() * 2 - 1);
      const x = tr.x + s * hw, y = tr.yb - t * tr.h;
      const L = lerp(8, 15, R());
      const pts = [[x, y + L * 0.5], [x - s * 1.5, y], [x - s * 3, y - L * 0.5]];
      dash(P, pts, lerp(3.2, 4.4, R()), s < -0.3 && R() < 0.6 ? pick(VILLAGE.treeHi, R) : pick(VILLAGE.tree, R), pick(VILLAGE.treeHi, R), R, { h: 155 });
    }
  } else {
    // rounded olive / bush: curling strokes around a centre
    const cx = tr.x, cy = tr.yb - tr.h * 0.5;
    const n = Math.round((tr.w * tr.h) / 28);
    for (let i = 0; i < n; i++) {
      const R = rng(hash(ID, key, i));
      const a = R() * TAU, rr = Math.sqrt(R());
      const x = cx + Math.cos(a) * rr * tr.w * 0.5, y = cy + Math.sin(a) * rr * tr.h * 0.5;
      const ta = a + Math.PI / 2 + 0.3;
      const L = lerp(7, 12, R());
      const pts = [[x - Math.cos(ta) * L / 2, y - Math.sin(ta) * L / 2], [x + Math.cos(ta + 0.3) * 0.5, y + Math.sin(ta + 0.3) * 0.5], [x + Math.cos(ta) * L / 2, y + Math.sin(ta) * L / 2]];
      const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8 > 0.3;
      dash(P, pts, lerp(3.2, 4.4, R()), lit && R() < 0.6 ? pick(VILLAGE.treeHi, R) : pick(VILLAGE.tree, R), pick(VILLAGE.treeHi, R), R, { h: 155 });
    }
  }
}

function paintVillage(P) {
  // night meadow between the hills and the field
  const items = [];
  const g = 7.5;
  for (let gy = 0; 560 + gy * g < 720; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'vg', gx, gy));
    const x = (gx + R()) * g, y = 560 + (gy + R()) * g;
    if (y < ridgeNear(x) + 22 || y > FIELD_Y(x) + 4) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const pts = stream(x, y, lerp(12, 22, R()), (px, py) => { const s = 0.15 * Math.sin(px * 0.03 + py * 0.05); const l = Math.hypot(1, s); return [1 / l, s / l]; });
    dash(P, pts, lerp(4.6, 6.4, R()), R() < 0.2 ? pick(VILLAGE.groundHi, R) : pick(VILLAGE.ground, R), pick(VILLAGE.groundHi, R), R, { h: 140 });
  }
  const litNow = (g2) => g2 === 0;
  TREES.forEach((tr, k) => { if (tr.z === 0) paintTree(P, tr, k); });
  HOUSES.forEach((hs, k) => { if (hs.z <= 1) paintHouse(P, hs, k, litNow); });
  paintChurch(P, litNow);
  TREES.forEach((tr, k) => { if (tr.z === 2 && tr.x < 600) paintTree(P, tr, k); });
  HOUSES.forEach((hs, k) => { if (hs.z === 3) paintHouse(P, hs, k, litNow); });
  TREES.forEach((tr, k) => { if (tr.z === 2 && tr.x >= 600) paintTree(P, tr, k); });
}

const FIELD = {
  base: pal(['#3a5030', '#4a6034', '#2f4a30', '#2a4038', '#3e5636', '#34482e']),
  hi: pal(['#9aa646', '#8a9a40', '#b8a24a', '#7a8a3a', '#a8b050']),
};
const ROAD = {
  base: pal(['#b8873e', '#c99a48', '#a87a38', '#b88a44', '#c09048']),
  hi: pal(['#d9b45a', '#e2cf96', '#e8d8a0', '#d8c080']),
  cool: pal(['#8d7a8a', '#9a8a90', '#7a6a7a']),
  rut: pal(['#7a5a2c', '#6a4a28']),
};
const GRASS = {
  base: pal(['#1f3524', '#26402a', '#2c4a2e', '#1e3a38', '#243a26', '#1a3030', '#2a4430']),
  hi: pal(['#5a7a34', '#6a8a3a', '#4a6a30', '#8a8a3a', '#7a9a40']),
  wheat: pal(['#94843c', '#a49246', '#867c3e', '#ae9c4e', '#8e8644', '#9c944c']),
};
function paintField(P) {
  const items = [];
  const g = 8;
  for (let gy = 0; 700 + gy * g < 790; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'fd', gx, gy));
    const x = (gx + R()) * g, y = 700 + (gy + R()) * g;
    if (y < FIELD_Y(x) - 2 || y > ROAD0 + 2) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const dir = (px, py) => { const s = 0.06 * Math.sin(px * 0.012 + 1) + 0.1 * Math.sin(px * 0.04 + py * 0.15); const l = Math.hypot(1, s); return [1 / l, s / l]; };
    const row = Math.sin(y * 0.42 + Math.sin(x * 0.01) * 2);
    const hi = row > 0.55 && R() < 0.65;
    dash(P, stream(x, y, lerp(18, 32, R()), dir), lerp(5, 6.8, R()), hi ? pick(FIELD.hi, R) : pick(FIELD.base, R), pick(FIELD.hi, R), R, { h: 145 });
  }
}

function tuft(P, key, x, y, n, H, cols, o = {}) {
  for (let k = 0; k < n; k++) {
    const R = rng(hash(ID, key, k));
    const a = -Math.PI / 2 + ((k + 0.5) / n - 0.5) * (o.spread ?? 1.1) + (R() - 0.5) * 0.25 + (o.lean ?? 0);
    const L = H * (0.6 + 0.5 * R());
    const bend = (R() - 0.5) * 0.8 + (o.lean ?? 0);
    const p0 = [x + (R() - 0.5) * 3, y];
    const p1 = [p0[0] + Math.cos(a) * L * 0.5, p0[1] + Math.sin(a) * L * 0.5];
    const p2 = [p1[0] + Math.cos(a + bend) * L * 0.5, p1[1] + Math.sin(a + bend) * L * 0.5];
    const [ca, cb] = cols(R);
    dash(P, [p0, p1, p2], lerp(3.4, 4.8, R()), ca, cb, R, { h: 170, taper: 0.75 });
  }
}
function paintRoad(P) {
  P.maskOn = true;
  closedPath(P.m, [[-5, ROAD0], [1005, ROAD0], [1005, 1005], [-5, 1005]]); P.m.fill();   // the road and bank are opaque in front
  const items = [];
  const g = 7.5;
  for (let gy = 0; ROAD0 + gy * g < ROAD1 + 4; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'rd', gx, gy));
    const x = (gx + R()) * g, y = ROAD0 + 1 + (gy + R()) * g;
    if (y > ROAD1 + 2) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const dir = (px, py) => { const s = 0.05 * Math.sin(px * 0.02 + py * 0.1); const l = Math.hypot(1, s); return [1 / l, s / l]; };
    const v = R();
    const ca = v < 0.14 ? pick(ROAD.cool, R) : v < 0.32 ? pick(ROAD.hi, R) : (Math.abs(y - 812) < 4 || Math.abs(y - 828) < 3) && R() < 0.5 ? pick(ROAD.rut, R) : pick(ROAD.base, R);
    dash(P, stream(x, y, lerp(18, 34, R()), dir), lerp(5.4, 7, R()), ca, pick(ROAD.hi, R), R, { h: 150 });
  }
  // grass along both edges of the road
  for (let x = -6, k = 0; x < 1010; k++) {
    const R = rng(hash(ID, 'tE', k));
    tuft(P, `tf${k}`, x, ROAD0 + 3 + R() * 4, 1 + ((R() * 5) | 0), 7 + R() * 16, (RR) => [RR() < 0.3 ? pick(GRASS.hi, RR) : RR() < 0.2 ? pick(FIELD.hi, RR) : pick(GRASS.base, RR), pick(GRASS.hi, RR)], { lean: (R() - 0.5) * 0.9, spread: 0.6 + R() * 0.9 });
    x += 6 + R() * 30;
  }
  P.maskOn = false;
}
function paintBank(P) {
  P.maskOn = true;
  const items = [];
  const g = 8.2;
  for (let gy = 0; ROAD1 - 6 + gy * g < 1010; gy++) for (let gx = -2; gx * g < 1014; gx++) {
    const R = rng(hash(ID, 'bk', gx, gy));
    const x = (gx + R()) * g, y = ROAD1 - 6 + (gy + R()) * g;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  // a patch of pale stubble in the lower-left corner (the painter signs on it)
  const wheatAt = (x, y) => (1.1 - x / 640 + 0.6 * (vnoise(x / 46, y / 34, 5) - 0.5)) * smoothstep(852, 892, y) - 0.12;
  for (const { x, y, R } of items) {
    const lean = 1.1 * (vnoise(x / 80, y / 60, 21) - 0.5) + 0.25 * Math.sin(x * 0.021 + y * 0.03);
    const wv = wheatAt(x, y);
    const wheat = wv > 0.1 && R() < 0.45 + wv * 1.6;
    const a = -Math.PI / 2 + lean + (R() - 0.5) * 0.35;
    const L = lerp(14, 26, R());
    const bend = lean * 0.6;
    const p0 = [x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.5];
    const p1 = [x, y];
    const p2 = [x + Math.cos(a + bend) * L * 0.5, y + Math.sin(a + bend) * L * 0.5];
    const ca = wheat ? pick(GRASS.wheat, R) : R() < 0.16 ? pick(GRASS.hi, R) : pick(GRASS.base, R);
    dash(P, [p0, p1, p2], lerp(5.4, 7.4, R()), ca, wheat ? hx('#d8c070') : pick(R() < 0.5 ? GRASS.hi : GRASS.base, R), R, { h: 150, taper: 0.7 });
  }
  for (let x = -6, k = 0; x < 1010; k++) {
    const R = rng(hash(ID, 'tB', k));
    tuft(P, `tb${k}`, x, ROAD1 + 4 + R() * 5, 2 + ((R() * 4) | 0), 10 + R() * 12, (RR) => [RR() < 0.25 ? pick(GRASS.hi, RR) : pick(GRASS.base, RR), pick(GRASS.hi, RR)], { lean: (R() - 0.5) * 0.5 });
    x += 7 + R() * 26;
  }
  P.maskOn = false;
}

/** The title, painted in the lower-left corner like a signature: brushy blue-black letters in relief. */
function paintTitle(P) {
  const reg = { x0: 26, y0: 852, w: 360, h: 132 };
  const W = reg.w * S, H = reg.h * S;
  const mcv = mk(W, H), m = mcv.getContext('2d');
  m.setTransform(S, 0, 0, S, -reg.x0 * S, -reg.y0 * S);
  m.fillStyle = '#000';
  const R = rng(hash(ID, 'title'));
  m.strokeStyle = '#000'; m.lineJoin = 'round'; m.lineCap = 'round';
  const glyph = (ch, x, y, size, font, rotA, lw) => {
    m.save(); m.translate(x, y); m.rotate(rotA + (R() - 0.5) * 0.06);
    m.font = `${size}px ${font}`; m.fillText(ch, 0, 0); m.lineWidth = lw; m.strokeText(ch, 0, 0); m.restore();
  };
  const CJ = '"Xingkai SC", "Kaiti SC", serif';
  glyph('星', 40, 928, 66, CJ, -0.04, 3.4); glyph('月', 108, 924, 66, CJ, -0.02, 3.4); glyph('夜', 172, 927, 66, CJ, 0.03, 3.4);
  const EN = '"Apple Chancery", "Snell Roundhand", "Hoefler Text", serif';
  let x;
  x = 250;
  for (const ch of '1889') { glyph(ch, x, 924 + (R() - 0.5) * 2, 42, EN, -0.05, 1.6); x += 23; }
  m.save(); m.translate(46, 968); m.rotate(-0.025); m.font = `italic 32px ${EN}`; m.fillText('The Starry Night', 0, 0); m.lineWidth = 1.1; m.strokeText('The Starry Night', 0, 0); m.restore();
  // paint: short blue-black dashes over the region, kept only inside the letters
  const T = new Painter(reg.x0, reg.y0, reg.w, reg.h);
  T.clear();
  const ink = pal(['#121a34', '#18223f', '#0f1530', '#1d2a55']);
  for (let j = 0; j < 46; j++) for (let i = 0; i < 130; i++) {
    const RR = rng(hash(ID, 'tt', i, j));
    const px = reg.x0 + (i + RR()) * 2.8, py = reg.y0 + (j + RR()) * 2.9;
    const a = -0.9 + (RR() - 0.5) * 0.8, L = 5 + RR() * 4;
    dash(T, [[px - Math.cos(a) * L / 2, py - Math.sin(a) * L / 2], [px + Math.cos(a) * L / 2, py + Math.sin(a) * L / 2]], 2.4, pick(ink, RR), hx('#2f5fb3'), RR, { h: 200, nb: 2, mix: 0.35 });
  }
  for (const ctx of [T.c, T.h]) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mcv, 0, 0); ctx.restore();
  }
  // letters sit ON the painted ground: copy colour, raise the height where the letters are
  P.c.save(); P.c.setTransform(1, 0, 0, 1, 0, 0); P.c.drawImage(T.cv, reg.x0 * S, reg.y0 * S); P.c.restore();
  const hm = mk(W, H), hmc = hm.getContext('2d');
  hmc.drawImage(T.hv, 0, 0); hmc.globalCompositeOperation = 'destination-in'; hmc.drawImage(mcv, 0, 0);
  P.h.save(); P.h.setTransform(1, 0, 0, 1, 0, 0); P.h.drawImage(hm, reg.x0 * S, reg.y0 * S); P.h.restore();
}

// ------------------------------------------------------------------ rotating layers (local coords, centre 0,0)
const COIL = {
  light: pal(['#a8d4d0', '#dfeee6', '#c6e2da', '#eef0c8', '#8cc0c8', '#b8dcd8']),
  mid: pal(['#5f8fc0', '#6fa3b8', '#4f7fb8', '#7aa8c8']),
  dark: pal(['#2f5fb3', '#1d2f6b', '#253f8f', '#24418a', '#1a2c66']),
};
function paintCoil(P, key, Rs, Rf, lam, hand) {
  const items = [];
  const g = 7;
  const n = Math.ceil(Rf / g) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = (i + R() - 0.5) * g, y = (j + R() - 0.5) * g;
    const r = Math.hypot(x, y);
    if (r > Rs + (Rf - Rs) * Math.pow(R(), 0.7)) continue;
    items.push({ k: R(), x, y, R, r });
  }
  shuffleSort(items);
  const dir = (x, y) => {
    const r = Math.hypot(x, y) || 1, ux = x / r, uy = y / r;
    const vr = (hand * lam) / TAU, vt = r;                       // along the arm r = λθ/2π
    const l = Math.hypot(vr, vt);
    return [(vr * ux - vt * uy) / l, (vr * uy + vt * ux) / l];
  };
  for (const { x, y, R, r } of items) {
    const th = Math.atan2(y, x);
    const ph = r / lam - (hand * th) / TAU + 0.06 * Math.sin(3 * th);
    const b = Math.cos(ph * TAU + (R() - 0.5) * 0.7);
    const edge = smoothstep(Rs * 0.82, Rf, r);
    let ca, cb;
    if (r < lam * 0.3) { ca = pick(R() < 0.4 ? SKY.white : COIL.light, R); cb = pick(SKY.star, R); }
    else if (b > -0.2 + edge * 0.6) { ca = pick(r < lam * 0.9 && R() < 0.3 ? SKY.white : COIL.light, R); cb = pick(R() < 0.5 ? SKY.white : COIL.mid, R); }
    else if (b < -0.62) { ca = pick(COIL.dark, R); cb = pick(COIL.mid, R); }
    else { ca = pick(COIL.mid, R); cb = pick(R() < 0.5 ? COIL.light : COIL.dark, R); }
    const L = clamp(r * 0.5, 7, 26) * (0.8 + 0.4 * R());
    dash(P, stream(x, y, L, dir, 2), lerp(4.8, 6.8, R()) * clamp(0.6 + r / 120, 0.7, 1), ca, cb, R, { h: 140 + R() * 40 });
  }
}
/** The ring band wrapped around the coil: one broad luminous band of varying radius and width. */
function paintRing(P, key, r0, r1, rf) {
  const items = [];
  const g = 7.6;
  const n = Math.ceil(rf / g) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = (i + R() - 0.5) * g, y = (j + R() - 0.5) * g;
    const r = Math.hypot(x, y);
    if (r < r0 || r > r1 + (rf - r1) * Math.pow(R(), 0.8)) continue;
    items.push({ k: R(), x, y, R, r });
  }
  shuffleSort(items);
  const dir = (x, y) => { const r = Math.hypot(x, y) || 1; return [-y / r, x / r]; };
  for (const { x, y, R, r } of items) {
    const th = Math.atan2(y, x);
    const rc = 146 + 9 * Math.sin(2 * th + 0.8) + 5 * Math.sin(5 * th), wb = 15 + 6 * Math.sin(3 * th + 2);
    const d = Math.abs(r - rc) + (R() - 0.5) * 8;
    let ca, cb;
    if (d < wb) { ca = pick(R() < 0.25 ? SKY.white : R() < 0.6 ? COIL.light : SKY.light, R); cb = pick(R() < 0.4 ? SKY.white : SKY.green, R); }
    else if (r < rc) { ca = pick(R() < 0.75 ? COIL.dark : COIL.mid, R); cb = pick(COIL.mid, R); }
    else if (d < wb + 14 && R() < 0.5) { ca = pick(COIL.mid, R); cb = pick(COIL.light, R); }
    else { ca = pick(R() < 0.6 ? SKY.mid : SKY.deep, R); cb = pick(R() < 0.3 ? SKY.light : SKY.mid, R); }
    dash(P, stream(x, y, lerp(16, 30, R()), dir, 2.6), lerp(5, 7, R()), ca, cb, R, { h: 140 + R() * 40 });
  }
}
function paintStar(P, s) {
  const core = s.r * 0.36;
  const RINGS = [pal(['#f8f2c8', '#f4ecb0', '#fbf6dc', '#f6e27a']), pal(['#d8dc8a', '#c8d49a', '#e0d870']), pal(['#f1d35a', '#f4e48a', '#ecdc90']),
    pal(['#a8c8b0', '#b8d4b8', '#9cc0b8']), pal(['#e0e0a0', '#d4dc98', '#eee6a8']), pal(['#8cb8c8', '#a0c8cc', '#7aaac0'])];
  let ri = 0;
  for (let rr = core + 3.2; rr < s.r * 1.24; rr += 4.6, ri++) {
    const f = (rr - core) / (s.r * 1.24 - core);
    const n = Math.max(4, Math.round((TAU * rr) / 9));
    const rp = RINGS[Math.min(RINGS.length - 1, ri)];
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'st', s.x, ri, k));
      if (f > 0.8 && R() < (f - 0.8) * 3.5) continue;            // ragged outer edge
      const a0 = ((k + R() * 0.5) / n) * TAU, span = Math.min(1.1, 13 / rr);
      dash(P, arcPts(0, 0, rr + (R() - 0.5) * 1.2, a0, a0 + span, 4), lerp(4, 5.2, R()), pick(rp, R), pick(f < 0.5 ? SKY.white : SKY.star, R), R, { h: 150 + (1 - f) * 40 });
    }
  }
  fillCircle(P, 0, 0, core * 1.2, hx('#fbf4cc'), 185);
  for (let k = 0; k < 6; k++) {
    const R = rng(hash(ID, 'stc', s.x, k));
    const a = R() * TAU, l = core * (0.6 + R() * 0.8);
    dash(P, [[Math.cos(a) * l * 0.6, Math.sin(a) * l * 0.6], [-Math.cos(a) * l * 0.6, -Math.sin(a) * l * 0.6]], core * 0.75, pick(pal(['#fffbe8', '#f8f2c0', '#f6e27a']), R), hx('#ffffff'), R, { h: 196, nb: 3, ridge: false });
  }
}
function paintFlare(P, s) {
  const n = 18;
  for (let k = 0; k < n; k++) {
    const R = rng(hash(ID, 'fl', s.x, k));
    const a = ((k + R() * 0.6) / n) * TAU;
    const r0 = s.r * (0.95 + R() * 0.15), r1 = s.r * (1.55 + R() * 0.3);
    const curl = 0.32 + R() * 0.16;                 // rays curl like a pinwheel (the sky's own swirl)
    const ray = []; for (let i = 0; i <= 4; i++) { const f = i / 4, rr = lerp(r0, r1, f), aa = a + curl * f * f; ray.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); }
    dash(P, ray,
      lerp(4, 5.4, R()), pick(R() < 0.4 ? SKY.white : SKY.star, R), pick(SKY.white, R), R, { h: 170 });
  }
  for (const [ri, rf] of [[0, 1.3], [1, 1.12]]) for (let k = 0; k < 16; k++) {
    const R = rng(hash(ID, 'flr', s.x, ri, k));
    const a0 = (k / 16) * TAU + R() * 0.2, rr = s.r * rf;
    dash(P, arcPts(0, 0, rr, a0, a0 + 0.34, 3), 4, pick(ri ? pal(['#fbf6dc', '#f8f0c0']) : SKY.star, R), pick(SKY.white, R), R, { h: 165 });
  }
}
function paintMoonHalo(P) {
  const H = MOON.halo;
  const RINGS = [pal(['#f8f0c0', '#f6e8a8', '#fbf4d0']), pal(['#f1d35a', '#f4e08a', '#f6e27a']), pal(['#ecc45a', '#e8b84c', '#f0c860']),
    pal(['#f4e48a', '#f0dc90', '#e8dc98']), pal(['#e8a53a', '#ecb848', '#e09a38']), pal(['#d8c070', '#e0c878', '#c8c070']),
    pal(['#b8c890', '#c8c878', '#a8c0a0']), pal(['#9cc0b0', '#a8c4a0'])];
  const INNER = pal(['#1f3f6a', '#264a72', '#2a4c62', '#1d3a5c', '#2f5a6a']);
  fillCircle(P, 0, 0, 8, INNER[0], 140);
  for (let rr = 4; rr < MOON.r + 2; rr += 4.6) {
    const n = Math.max(3, Math.round((TAU * rr) / 9));
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'mi', rr | 0, k));
      const a0 = ((k + R() * 0.5) / n) * TAU;
      dash(P, arcPts(0, 0, rr, a0, a0 + Math.min(1.6, 12 / rr), 4), 4.8, pick(INNER, R), hx('#4f7a8a'), R, { h: 140 });
    }
  }
  let ri = 0;
  for (let rr = MOON.r + 3; rr < H; rr += 4.8, ri++) {
    const f = (rr - MOON.r) / (H - MOON.r);
    const n = Math.max(5, Math.round((TAU * rr) / 10));
    const rp = RINGS[Math.min(RINGS.length - 1, ri)];
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'mh', ri, k));
      if (f > 0.78 && R() < (f - 0.78) * 3) continue;
      const a0 = ((k + R() * 0.5) / n) * TAU, span = Math.min(1, 15 / rr);
      dash(P, arcPts(0, 0, rr + (R() - 0.5), a0, a0 + span, 4), lerp(4.4, 5.8, R()), pick(rp, R), pick(SKY.star, R), R, { h: 155 });
    }
  }
}
/** The moon: a dim gold disc (earthshine) with a blazing orange crescent on its lower right. */
function paintCrescent(P) {
  const r = MOON.r;
  const off = [-13, -11], ri = r * 0.82;
  P.c.save(); P.h.save();
  for (const c of [P.c, P.h]) { c.beginPath(); c.arc(0, 0, r + 1, 0, TAU); c.arc(off[0], off[1], ri, 0, TAU, true); c.clip('evenodd'); }
  fillCircle(P, 0, 0, r + 1, hx('#f4b838'), 170);
  for (let k = 0; k < 18; k++) {
    const R = rng(hash(ID, 'cr', k));
    const rr = r - 1.5 - R() * 10, a0 = -1.0 + R() * 2.7;
    const outer = rr > r - 4;
    dash(P, arcPts(0, 0, rr, a0, a0 + 0.9 + R() * 0.6, 5), lerp(4.2, 5.6, R()), outer ? pick(pal(['#f0a030', '#e8902a', '#f4a83a']), R) : pick(pal(['#f8d860', '#f6c844', '#fbe890', '#f4b838']), R), hx('#fff4c0'), R, { h: 205 });
  }
  P.c.restore(); P.h.restore();
  dash(P, arcPts(0, 0, r + 0.6, -0.95, 2.45, 12), 2.6, hx('#d0601c'), hx('#e88a2a'), rng(hash(ID, 'crO')), { h: 195, nb: 2, ridge: false });
}

// ------------------------------------------------------------------ cypress (live)
const CYPC = {
  lit: pal(['#24382a', '#2c4430', '#34502f', '#2a3e28']), litB: pal(['#55703a', '#6a7a3a', '#4a6a3a', '#7a7a40']),
  mid: pal(['#121a14', '#18241a', '#1c2a1e', '#16201c', '#1a2618']), midB: pal(['#2a3a28', '#24342a']),
  dark: pal(['#0d1418', '#101c26', '#142430', '#0f1a1c']), darkB: pal(['#1d3050', '#142a4f']),
  brown: pal(['#3a3020', '#4a4026']),
};
const flameAng = (t, s) => 0.5 * s + 0.35 * Math.sin(t * 19 + s * 2.2 + 1.1) + 0.2 * Math.sin(t * 41 - s * 2.7);
/** Edge lobes: each flank has its own flame licks. */
const lobe = (t, side) => 1 + 0.34 * Math.max(0, Math.sin(t * (side < 0 ? 31 : 27) + (side < 0 ? 0.4 : 2.1))) ** 2 - 0.1;
function buildCypress() {
  const out = [];
  const dy = 10, dxs = 7.4;
  for (let iy = 0; iy * dy < CYP_H - 4; iy++) {
    const yy = iy * dy, t = yy / CYP_H, hw = cypHW(t);
    if (hw < 2.5) continue;
    const n = Math.max(1, Math.round((2 * hw) / dxs));
    for (let ix = 0; ix < n; ix++) {
      const R = rng(hash(ID, 'cyp', iy, ix));
      let x = -hw + (ix + R()) * ((2 * hw) / n);
      let y = yy + (R() - 0.5) * dy;
      const L = lerp(16, 30, R()) * (0.55 + 0.45 * Math.min(1, hw / 30));
      const pts = [];
      y -= L * 0.45;
      for (let st = 0; st * 3 <= L; st++) {
        const tt = clamp(y / CYP_H, 0, 1), hh = Math.max(3, cypHW(tt));
        pts.push([tt, clamp(x / hh, -1.05, 1.05)]);
        const a = flameAng(tt, x / hh);
        x += Math.sin(a) * 3; y += Math.cos(a) * 3;
      }
      const s = (-hw + (ix + 0.5) * ((2 * hw) / n)) / hw;
      const v = R();
      let ca, cb;
      if (s < -0.25 && v < 0.55) { ca = pick(CYPC.lit, R); cb = pick(CYPC.litB, R); }
      else if (s > 0.3 && v < 0.6) { ca = pick(CYPC.dark, R); cb = pick(CYPC.darkB, R); }
      else if (v > 0.94) { ca = pick(CYPC.brown, R); cb = pick(CYPC.litB, R); }
      else { ca = pick(CYPC.mid, R); cb = pick(R() < 0.3 ? CYPC.litB : CYPC.midB, R); }
      out.push({ pts, w: lerp(6.2, 8.4, R()), ca, cb, seed: hash(ID, 'cypd', iy, ix), s, k: R() });
    }
  }
  // flame tongues licking out of both flanks at the lobes
  for (const sg of [-1, 1]) for (let k = 0; k < 20; k++) {
    const R = rng(hash(ID, 'tongue', sg, k));
    const t = 0.04 + k * 0.046 + R() * 0.02;
    const o = lobe(t, sg);
    const pts = [[t - 0.012, 0.4 * sg], [t + 0.008, 0.8 * sg], [t + 0.026, 1.02 * sg], [t + 0.046, 1.1 * sg], [t + 0.066, 1.04 * sg], [t + 0.08, 0.9 * sg]];
    const lit = sg < 0 && R() < 0.6;
    void o;
    out.push({ pts, w: lerp(7, 9, R()) * (1 - t * 0.5), ca: pick(lit ? CYPC.lit : sg < 0 ? CYPC.mid : CYPC.dark, R), cb: pick(lit ? CYPC.litB : CYPC.darkB, R), seed: hash(ID, 'tg', sg, k), s: sg, k: 2 + R(), tongue: true });
  }
  out.sort((a, b) => a.k - b.k);
  return out;
}
function paintCypress(P, list, u) {
  const wk = whipW(u);
  const ph = 2.0 * u + 6.5 * tab(Q_TAB, u);
  const A = 3.5 + 13 * wk, B = 1.2 + 6 * wk;
  const xc = (t) => CYP.bx + CYP.lean * t + A * Math.pow(t, 1.7) * Math.sin(ph - 3.2 * t) + B * t * t * Math.sin(2.3 * ph - 7 * t + 1);
  const map = (t, s) => [xc(t) + s * cypHW(t) * lobe(t, s), CYP.by - t * CYP_H];
  // dark body first, so the flame never shows sky through it
  const sil = [];
  for (let i = 0; i <= 60; i++) sil.push(map(i / 60, -0.98));
  for (let i = 60; i >= 0; i--) sil.push(map(i / 60, 0.98));
  fillPoly(P, sil, hx('#141e18'), 110);
  for (const d of list) {
    const flick = d.tongue ? (0.03 + 0.09 * wk) * Math.sin(ph * 2.6 + (d.seed % 7)) : 0;
    const pts = d.pts.map(([t, s]) => map(t, s + flick * Math.abs(s)));
    dash(P, pts, d.w, d.ca, d.cb, rng(d.seed), { h: 150 });
  }
}

// ------------------------------------------------------------------ the pelican in impasto dashes (live)
const BIRD = {
  lit: pal(['#f8f4e0', '#f1e8c0', '#f6eccc', '#ece0b0', '#fbf6e4']), litB: hx('#f4e08a'),
  mid: pal(['#dcdcd0', '#d0dce0', '#e8e4d0', '#e4dcc0']), midB: hx('#a8c0dc'),
  shade: pal(['#a8c0dc', '#94b0d4', '#b4c8e0', '#8aa4cc']), shadeB: hx('#5a7ab8'),
  dark: pal(['#121a33', '#16204a', '#0f162c']), darkB: hx('#2f5fb3'),
  pouch: pal(['#e8a53a', '#f1d35a', '#ebb048']), pouchLo: pal(['#d97a2c', '#c8602a']),
  bill: pal(['#eedc96', '#e6cc80', '#f0e0a0']), billB: hx('#d9b45a'),
  leg: pal(['#e07a34', '#e8904a', '#d8742e']), legB: hx('#f0b070'), legFar: pal(['#a8562a', '#9a4c26']),
};
const BIKE = {
  tire: pal(['#121a2c', '#18213a', '#0f1626']), tireB: hx('#2f4a80'),
  rim: pal(['#c9a24a', '#b8923e']), rimB: hx('#f1d35a'),
  frame: pal(['#142a4f', '#1d2f6b', '#18306a']), frameB: hx('#2f5fb3'),
  hi: pal(['#f1d35a', '#f4e48a', '#e8c45a']),
};
function ik(hip, ankle, l1, l2) {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
  const d = Math.hypot(dx, dy) || 1;
  const dc = clamp(d, Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
  const ux = dx / d, uy = dy / d;
  const a = Math.acos(clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1));
  const k1 = [hip[0] + l1 * (ux * Math.cos(a) - uy * Math.sin(a)), hip[1] + l1 * (ux * Math.sin(a) + uy * Math.cos(a))];
  const k2 = [hip[0] + l1 * (ux * Math.cos(-a) - uy * Math.sin(-a)), hip[1] + l1 * (ux * Math.sin(-a) + uy * Math.cos(-a))];
  return { knee: k1[0] > k2[0] ? k1 : k2, ankle: d > l1 + l2 - 0.5 ? [hip[0] + ux * dc, hip[1] + uy * dc] : ankle };
}
const isPt = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number';
/** Out of the saddle: the bird moves forward/up (legs re-solved to the pedals). Only used inside (1, 5). */
function standPose(P, k) {
  if (k <= 1e-3) return P;
  const s = P.place.scale ?? 1;
  const d = [22 * k * s, -12 * k * s];
  const piv = [P.bird.legNear.hip[0] + d[0], P.bird.legNear.hip[1] + d[1]];
  const lean = 0.13 * k, cl = Math.cos(lean), sl = Math.sin(lean);
  const tr = (p) => { const x = p[0] + d[0] - piv[0], y = p[1] + d[1] - piv[1]; return [piv[0] + x * cl - y * sl, piv[1] + x * sl + y * cl]; };
  const deep = (v) => (isPt(v) ? tr(v) : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, deep(x)])) : v);
  const B = P.bird, nb = {};
  for (const key of Object.keys(B)) nb[key] = key === 'legNear' || key === 'legFar' ? B[key] : deep(B[key]);
  const leg = (L) => {
    const hip = tr(L.hip);
    const reach = Math.max(62 * s, Math.hypot(L.ankle[0] - hip[0], L.ankle[1] - hip[1]) / 2 + 1.5);   // legs straighten to keep the feet on the pedals
    const { knee, ankle } = ik(hip, L.ankle, reach, reach);
    return { ...L, hip, knee, ankle, poly: ribbon(smoothPath([hip, knee, ankle], 5), (t) => lerp(17, 7, t) * s) };
  };
  nb.legNear = leg(B.legNear); nb.legFar = leg(B.legFar);
  nb.bodyAng = B.bodyAng + lean;
  return { ...P, bird: nb };
}

function paintRider(Pn, P, parts, u, swirl) {
  const s = P.place.scale ?? 1;
  const D = (key, pts, w, ca, cb, o) => dash(Pn, pts, w * s, ca, cb, rng(hash(ID, 'rd', key)), o);
  const B = P.bird;
  const shadeOf = (nx, ny) => -(nx * 0.6 + ny * 0.8);
  const birdCol = (l, R) => (l > 0.3 ? [pick(BIRD.lit, R), BIRD.litB] : l < -0.3 ? [pick(BIRD.shade, R), BIRD.shadeB] : [pick(BIRD.mid, R), BIRD.midB]);
  // swirls opening around the wheels in the spin-up bar
  if (swirl > 0.01) {
    P.bike.wheels.forEach((wh, wi) => {
      for (const [ri, rf] of [[0, 1.16], [1, 1.32]]) {
        for (let k = 0; k < 7; k++) {
          const R = rng(hash(ID, 'sw', wi, ri, k));
          const a0 = wh.angle * (ri ? 0.7 : 1) + (k / 7) * TAU + R() * 0.3;
          dash(Pn, arcPts(wh.c[0], wh.c[1], wh.r * rf, a0, a0 + 0.55 + 0.2 * R(), 5), 4.2 * s, pick(ri ? SKY.light : SKY.star, R), pick(SKY.white, R), R, { h: 150, alpha: swirl * 0.92 });
        }
      }
    });
  }
  for (const part of parts) {
    const role = part.role, name = part.name;
    switch (role) {
      case 'legFar': case 'leg': {
        const L = role === 'leg' ? B.legNear : B.legFar;
        const far = role === 'legFar';
        const pc = far ? BIRD.legFar : BIRD.leg;
        D(name + 'a', [L.hip, [lerp(L.hip[0], L.knee[0], 0.5), lerp(L.hip[1], L.knee[1], 0.5)], L.knee], 13, far ? pc[0] : pick(pc, rng(hash(name))), far ? hx('#c87040') : BIRD.legB, { h: 140 });
        D(name + 'b', [L.knee, [lerp(L.knee[0], L.ankle[0], 0.5), lerp(L.knee[1], L.ankle[1], 0.5)], L.ankle], 7.5, far ? pc[1] : pc[0], far ? hx('#7a3a20') : hx('#c8502a'), { h: 150 });
        break;
      }
      case 'footFar': case 'foot':
        fillPoly(Pn, part.pts, role === 'foot' ? BIRD.leg[0] : BIRD.legFar[0], 120);
        D(name, [part.pts[0], part.pts[2]], 4, role === 'foot' ? BIRD.leg[1] : BIRD.legFar[1], hx('#c8502a'), { nb: 2 });
        break;
      case 'crankFar': D(name, part.pts, 5, hx('#0f1626'), hx('#1d2f6b'), { nb: 3 }); break;
      case 'tire': {
        const wi = +name.slice(4), wh = P.bike.wheels[wi];
        for (let k = 0; k < 9; k++) {
          const R = rng(hash(ID, 'tire', wi, k));
          const a0 = wh.angle + (k / 9) * TAU + R() * 0.12;
          dash(Pn, arcPts(part.c[0], part.c[1], part.r - 1 * s, a0, a0 + 0.86, 5), 6.6 * s, pick(BIKE.tire, R), BIKE.tireB, R, { h: 165, nb: 4 });
        }
        for (const [k, a0, a1] of [[0, -2.75, -2.2], [1, -2.05, -1.55], [2, 0.35, 0.65]]) {
          const R = rng(hash(ID, 'thi', wi, k));
          dash(Pn, arcPts(part.c[0], part.c[1], part.r - 0.5 * s, a0, a1, 4), (k === 2 ? 1.8 : 2.4) * s, pick(BIKE.hi, R), hx('#fff4c0'), R, { h: 200, nb: 2 });
        }
        break;
      }
      case 'rim': {
        const wi = +name.slice(3), wh = P.bike.wheels[wi];
        for (let k = 0; k < 6; k++) {
          const R = rng(hash(ID, 'rim', wi, k));
          const a0 = wh.angle + (k / 6) * TAU + 0.3;
          dash(Pn, arcPts(part.c[0], part.c[1], part.r, a0, a0 + 0.95, 5), 2.4 * s, pick(BIKE.rim, R), BIKE.rimB, R, { h: 150, nb: 2 });
        }
        break;
      }
      case 'spoke': D(name, part.pts, 1.5, hx('#1d2f6b'), hx('#41608f'), { nb: 1, h: 120, ridge: false }); break;
      case 'hub': fillCircle(Pn, part.c[0], part.c[1], part.r * 1.1, hx('#c9a24a'), 170); break;
      case 'chain': D(name, part.pts, 2.4, hx('#1a2238'), hx('#3a4a6a'), { nb: 2, h: 130 }); break;
      case 'frame': case 'fork': {
        const pts = part.pts.length > 2 ? part.pts : [part.pts[0], [lerp(part.pts[0][0], part.pts[1][0], 0.5), lerp(part.pts[0][1], part.pts[1][1], 0.5)], part.pts[1]];
        const R = rng(hash(ID, name));
        D(name, pts, role === 'fork' ? 6.2 : 7, pick(BIKE.frame, R), BIKE.frameB, { h: 160, mix: 0.6 });
        if (name === 'tube_toptube' || name === 'tube_downtube' || name === 'tube_seatstay') {
          const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
          let nx = -dy / l, ny = dx / l; if (nx * 0.6 + ny * 0.8 > 0) { nx = -nx; ny = -ny; }
          const o = 2.2 * s;
          D(name + 'h', [[a[0] + nx * o + dx * 0.12, a[1] + ny * o + dy * 0.12], [b[0] + nx * o - dx * 0.15, b[1] + ny * o - dy * 0.15]], 1.8, hx('#6f9ad0'), hx('#f1d35a'), { nb: 1, h: 200, ridge: false });
        }
        break;
      }
      case 'stem': case 'bars': case 'seatpost': {
        const pts = part.pts.length > 2 ? part.pts : [part.pts[0], [lerp(part.pts[0][0], part.pts[1][0], 0.5), lerp(part.pts[0][1], part.pts[1][1], 0.5)], part.pts[1]];
        D(name, pts, 5.4, BIKE.frame[0], BIKE.frameB, { h: 160 });
        break;
      }
      case 'saddle': D(name, part.pts, 7, hx('#2a1e1a'), hx('#5a3a2a'), { h: 170 }); break;
      case 'ring':
        for (let k = 0; k < 4; k++) dash(Pn, arcPts(part.c[0], part.c[1], part.r, (k / 4) * TAU, (k / 4) * TAU + 1.7, 4), 3.2 * s, hx('#1a2238'), hx('#3a4a6a'), rng(hash(ID, 'ring', k)), { h: 160, nb: 2 });
        dash(Pn, arcPts(part.c[0], part.c[1], part.r, -2.6, -1.8, 3), 1.8 * s, BIKE.hi[0], hx('#fff4c0'), rng(hash(ID, 'ringhi')), { h: 200, nb: 1 });
        break;
      case 'crank': case 'pedal': D(name, part.pts, role === 'pedal' ? 6 : 5.4, hx('#0f1626'), hx('#2f4a80'), { nb: 3, h: 175 }); break;
      case 'tail': {
        const p = part.pts, base = [(p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2], tip = [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2];
        fillPoly(Pn, p, BIRD.mid[1], 110);
        for (let k = 0; k < 3; k++) {
          const f = (k - 1) * 0.32, R = rng(hash(ID, 'tail', k));
          const a = [lerp(p[0][0], p[3][0], 0.5 + f), lerp(p[0][1], p[3][1], 0.5 + f)], b = [lerp(p[1][0], p[2][0], 0.5 + f * 0.8), lerp(p[1][1], p[2][1], 0.5 + f * 0.8)];
          const [ca, cb] = birdCol(k === 0 ? 0.4 : -0.1, R);
          D('tail' + k, [a, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5) + 1], b], 6.5, ca, cb, { h: 150 });
        }
        void base; void tip;
        break;
      }
      case 'body': {
        fillPoly(Pn, part.pts, hx('#d9d6c4'), 70);
        const ca = Math.cos(B.bodyAng), sa = Math.sin(B.bodyAng);
        const E = (rho, phi) => { const lx = rho * B.bodyRx * Math.cos(phi), ly = rho * B.bodyRy * Math.sin(phi); return [B.bodyC[0] + lx * ca - ly * sa, B.bodyC[1] + lx * sa + ly * ca]; };
        const avg = (B.bodyRx + B.bodyRy) / 2;
        [0.24, 0.5, 0.72, 0.93].forEach((rho, ri) => {
          const n = Math.max(3, Math.round((TAU * rho * avg) / (16 * s)));
          for (let k = 0; k < n; k++) {
            const R = rng(hash(ID, 'body', ri, k));
            const phi = ((k + R() * 0.4) / n) * TAU + ri * 0.7, span = (21 * s) / (rho * avg);
            const pts = [];
            for (let i = 0; i <= 4; i++) pts.push(E(rho + (R() - 0.5) * 0.04, phi + (span * i) / 4));
            const pm = phi + span / 2;
            const nx = Math.cos(pm) * ca - Math.sin(pm) * sa, ny = Math.cos(pm) * sa + Math.sin(pm) * ca;
            const [c1, c2] = birdCol(shadeOf(nx, ny) * Math.min(1, rho * 1.4) + 0.1, R);
            dash(Pn, pts, lerp(7, 8.6, R()) * s, c1, c2, R, { h: 160, mix: 0.62, pAlt: 0.55 });
          }
        });
        // Prussian contour along the underside
        for (let k = 0; k < 2; k++) {
          const pts = []; const a0 = 0.15 * Math.PI + k * 0.38 * Math.PI;
          for (let i = 0; i <= 6; i++) pts.push(E(1.0, a0 + (0.34 * Math.PI * i) / 6));
          D('bodyC' + k, pts, 2.6, PRUSSIAN, hx('#1d2f6b'), { h: 185, nb: 2, alpha: 0.9, ridge: false });
        }
        break;
      }
      case 'wing': {
        const p = part.pts;
        fillPoly(Pn, p, hx('#e2dcc4'), 80);
        const ca = Math.cos(B.bodyAng), sa = Math.sin(B.bodyAng);
        const toW = (lx, ly) => [B.bodyC[0] + lx * ca - ly * sa, B.bodyC[1] + lx * sa + ly * ca];
        for (let j = 0; j < 8; j++) for (let i = 0; i < 13; i++) {
          const R = rng(hash(ID, 'wing', i, j));
          const lx = (-62 + i * 10.5 + R() * 6) * s, ly = (-36 + j * 7.5 + R() * 4) * s;
          const [x, y] = toW(lx, ly);
          if (!inPoly(p, x, y)) continue;
          const L = 15 * s, droop = 0.12 + (lx < -20 * s ? 0.18 : 0);
          const pts = [toW(lx + L * 0.5, ly - L * 0.05), toW(lx, ly), toW(lx - L * 0.5, ly + L * droop)];
          const back = lx < -25 * s;
          const lv = -0.5 * (ly / (30 * s)) + (back ? -0.35 : 0.15);
          const [c1, c2] = birdCol(lv, R);
          dash(Pn, pts, lerp(5.8, 7.2, R()) * s, c1, c2, R, { h: 160, mix: 0.6, pAlt: 0.55 });
        }
        break;
      }
      case 'secondaries': D(name, part.pts, 6.6, BIRD.dark[0], BIRD.darkB, { h: 170, mix: 0.5 }); break;
      case 'primary': D(name, part.pts, 5, pick(BIRD.dark, rng(hash(name))), BIRD.darkB, { h: 175, mix: 0.6, pAlt: 0.5 }); break;
      case 'neck': {
        fillPoly(Pn, part.pts, hx('#e4e0cc'), 75);
        const sp = B.neckSpine, n = sp.length;
        const NX = [], NY = [];
        for (let i = 0; i < n; i++) { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; NX.push(-dy / l); NY.push(dx / l); }
        const at = (t, off) => { const f = clamp(t) * (n - 1), i = Math.min(n - 2, Math.floor(f)), r = f - i; const w = lerp(30, 19, t) * s * 0.5 * off; return [lerp(sp[i][0], sp[i + 1][0], r) + lerp(NX[i], NX[i + 1], r) * w, lerp(sp[i][1], sp[i + 1][1], r) + lerp(NY[i], NY[i + 1], r) * w]; };
        [-0.62, -0.2, 0.22, 0.62].forEach((off, li) => {
          for (let k = 0; k < 4; k++) {
            const R = rng(hash(ID, 'neck', li, k));
            const t1 = clamp(1.02 - k * 0.27 - li * 0.06 + R() * 0.05), t0 = clamp(t1 - 0.32);
            if (t1 - t0 < 0.08) continue;
            const pts = [at(t1, off), at((t0 + t1) / 2, off * 1.02), at(t0, off)];
            const lv = off < 0 ? 0.55 - (li === 1 ? 0.2 : 0) : off > 0.5 ? -0.45 : -0.05;
            const [c1, c2] = birdCol(lv, R);
            dash(Pn, pts, lerp(6.6, 7.8, R()) * s * (1 - 0.25 * t0), c1, c2, R, { h: 160, mix: 0.6, pAlt: 0.55 });
          }
        });
        const back = []; for (let i = 0; i <= 6; i++) back.push(at(0.12 + i * 0.12, -1.0));
        D('neckC', back, 2.4, PRUSSIAN, hx('#1d2f6b'), { h: 185, nb: 2, alpha: 0.85, ridge: false });
        break;
      }
      case 'head': {
        fillCircle(Pn, part.c[0], part.c[1], part.r, hx('#ece6d0'), 80);
        [[0.45, 4], [0.82, 7]].forEach(([rho, n], ri) => {
          for (let k = 0; k < n; k++) {
            const R = rng(hash(ID, 'head', ri, k));
            const a0 = ((k + R() * 0.3) / n) * TAU + ri, span = (9 * s) / (rho * part.r);
            const pm = a0 + span / 2;
            const [c1, c2] = birdCol(shadeOf(Math.cos(pm), Math.sin(pm)) + 0.15, R);
            dash(Pn, arcPts(part.c[0], part.c[1], rho * part.r, a0, a0 + span, 3), 5 * s, c1, c2, R, { h: 155 });
          }
        });
        D('headC', arcPts(part.c[0], part.c[1], part.r * 0.98, 2.4, 4.3, 6), 2.2, PRUSSIAN, hx('#1d2f6b'), { h: 185, nb: 2, alpha: 0.85, ridge: false });
        break;
      }
      case 'crest': D(name, part.pts, 2.6, hx('#f0ead0'), hx('#f1d35a'), { nb: 2, h: 160 }); break;
      case 'pouch': {
        fillPoly(Pn, part.pts, hx('#e09a40'), 120);
        const lo = part.pts.slice(0, 26), [j0, j1] = B.lowerJawLine;
        const nn = lo.length;
        for (const [ri, f] of [[0, 0.3], [1, 0.6], [2, 0.86]]) {
          const row = lo.map((p, i) => { const j = [lerp(j0[0], j1[0], i / (nn - 1)), lerp(j0[1], j1[1], i / (nn - 1))]; return [lerp(j[0], p[0], f), lerp(j[1], p[1], f)]; });
          for (let k = 0; k < 3; k++) {
            const R = rng(hash(ID, 'pouch', ri, k));
            const a = Math.floor((k / 3) * (nn - 1) + R() * 2), b = Math.min(nn - 1, a + Math.floor(nn / 3) + 2);
            const seg = row.slice(a, b + 1);
            if (seg.length < 2) continue;
            dash(Pn, seg, (ri === 2 ? 4.6 : 5.2) * s, ri === 2 ? pick(BIRD.pouchLo, R) : pick(BIRD.pouch, R), ri === 0 ? hx('#f6e08a') : hx('#e8a53a'), R, { h: 160 });
          }
        }
        break;
      }
      case 'bill': {
        const p = part.pts;
        fillPoly(Pn, p, hx('#e2c27a'), 125);
        const top = [p[0], p[1], p[2], p[3]], bot = [p[7], p[6], p[5], p[4]];
        for (const [ri, f] of [[0, 0.32], [1, 0.72]]) {
          const row = top.map((q, i) => [lerp(q[0], bot[i][0], f), lerp(q[1], bot[i][1], f)]);
          const R = rng(hash(ID, 'bill', ri));
          dash(Pn, smoothPath(row, 3), 3.6 * s, pick(BIRD.bill, R), BIRD.billB, R, { h: 165, nb: 3 });
        }
        D('jaw', B.lowerJawLine, 1.6, hx('#c8602a'), hx('#e8a53a'), { nb: 1, h: 170, ridge: false });
        break;
      }
      case 'nail': fillPoly(Pn, part.pts, hx('#c8502a'), 170); break;
      case 'face': fillPoly(Pn, part.pts, hx('#f0d9a6'), 130); break;
      case 'eye': {
        const r = part.r;
        fillCircle(Pn, part.c[0], part.c[1], r * 1.18, hx('#151d36'), 175);
        if (B.eye.mode === 'wide') fillCircle(Pn, part.c[0], part.c[1], r * 0.75, hx('#f4ecc8'), 180);
        fillCircle(Pn, B.eye.pupil[0], B.eye.pupil[1], r * (B.eye.mode === 'wide' ? 0.42 : 0.55), hx('#0c1020'), 185);
        fillCircle(Pn, part.c[0] - r * 0.35, part.c[1] - r * 0.4, r * 0.3, hx('#fffbe8'), 200);
        break;
      }
      case 'eyeShut': D(name, part.pts, 2.2, hx('#151d36'), PRUSSIAN, { nb: 1 }); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ scene
let BUILT = null;
function bakeImage(K, key, cv) { const img = toImage(cv); return K.bake(key, cv.width, cv.height, (K2, w, h) => { image(img, 0, 0, w, h); }); }

export default {
  ride: RIDE,
  freezeU: 2.6,
  cues: [{ u: 2.0, name: 'skySpinUp' }, { u: 2.5, name: 'windows' }, { u: 3.0, name: 'windows' }, { u: 3.0, name: 'bell' },
    { u: 3.5, name: 'windows' }, { u: 4.0, name: 'spinDown' }],

  async init(K) {
    try {
      await Promise.all(['"Xingkai SC"', '"Apple Chancery"', '"Kaiti SC"'].map((f) => document.fonts.load(`60px ${f}`, '星月夜1889The')));
    } catch {}
    if (!BUILT) {
      const B = {};
      // ---- the whole static picture
      const P = new Painter(0, 0, 1000, 1000, FRONT);
      P.thin = (x, y) => (x < 330 && y > 860 ? 0 : smoothstep(0.62, 0.8, vnoise(x / 70 + 3.1, y / 55, 33)) * (y < 470 ? 0.75 : y < 780 ? 0.85 : 0.4));
      paintGround(P, weaveTiles());
      paintSky(P);
      paintHills(P);
      paintVillage(P);
      paintField(P);
      paintRoad(P);
      paintBank(P);
      paintTitle(P);
      B.main = litCanvas(P, { relief: 0.022 });
      // the strip of road + bank that sits in front of the cypress' foot
      const fr = mk(FRONT.w * S, FRONT.h * S), fc = fr.getContext('2d');
      fc.drawImage(B.main, FRONT.x0 * S, FRONT.y0 * S, FRONT.w * S, FRONT.h * S, 0, 0, FRONT.w * S, FRONT.h * S);
      fc.globalCompositeOperation = 'destination-in'; fc.drawImage(P.mv, 0, 0);
      B.front = fr;
      // ---- rotating layers
      const disc = (rad, paint) => { const D = new Painter(-rad, -rad, rad * 2, rad * 2); D.clear(); paint(D); return litCanvas(D, { relief: 0.02 }); };
      B.ringPad = RING_F + 10; B.coilPad = COIL_F + 10;
      B.ring = disc(B.ringPad, (D) => paintRing(D, 'ring', RING_R0, RING_R1, RING_F));
      B.coil = disc(B.coilPad, (D) => paintCoil(D, 'coil', COIL_R, COIL_F, 72, 1));
      B.small = SMALL.map((sm, k) => ({ pad: sm.f + 8, cv: disc(sm.f + 8, (D) => paintCoil(D, 'small' + k, sm.r, sm.f, sm.lam, -1)) }));
      B.stars = STARS.map((st) => disc(st.R, (D) => paintStar(D, st)));
      B.flares = STARS.map((st) => disc(Math.ceil(st.r * 1.95 + 6), (D) => paintFlare(D, st)));
      B.moonHalo = disc(MOON.halo + 8, (D) => paintMoonHalo(D));
      B.crescent = disc(MOON.r + 6, (D) => paintCrescent(D));
      // ---- windows that light up (one layer per group) and the bell
      B.windows = [1, 2, 3].map((g) => {
        const list = [];
        HOUSES.forEach((hs) => hs.win.forEach(([dx, dy], i) => { if (hs.win[i][2] === g) list.push([hs.x + dx, hs.yb - hs.h + dy, hs.w < 30 ? 4 : 6, hs.w < 30 ? 5 : 8]); }));
        CHURCH.win.forEach(([dx, dy, gg]) => { if (gg === g) list.push([CHURCH.x + dx, CHURCH.yb - CHURCH.h + dy, 6, 8]); });
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [x, y, w, h] of list) { x0 = Math.min(x0, x - 18); y0 = Math.min(y0, y - 18); x1 = Math.max(x1, x + w + 18); y1 = Math.max(y1, y + h + 18); }
        const W = new Painter(x0, y0, x1 - x0, y1 - y0); W.clear();
        list.forEach(([x, y, w, h], i) => {
          const R = rng(hash(ID, 'glow', g, i));
          const cx = x + w / 2, cy = y + h / 2;
          for (const [ri, rr] of [[0, 7], [1, 10]]) for (let k = 0; k < 6; k++) {
            const a = (k / 7) * TAU + R() * 0.5 + ri * 0.4;
            dash(W, arcPts(cx, cy, rr, a, a + 0.6, 3), ri ? 2.1 : 2.5, pick(ri ? pal(['#e8b84c', '#f0c860', '#d8a040']) : pal(['#f6e27a', '#f8ec9a', '#f1d35a']), R), hx('#fff4c0'), R, { h: 150, alpha: ri ? 0.6 : 0.85, nb: 2 });
          }
          paintWindow(W, `wl${g}_${i}`, x, y, w, h, true);
        });
        return { x0, y0, w: x1 - x0, h: y1 - y0, cv: litCanvas(W, { relief: 0.02 }) };
      });
      {
        const Bl = new Painter(-8, -2, 16, 16); Bl.clear();
        fillPoly(Bl, [[-2.5, 0], [2.5, 0], [4, 7], [6, 10], [-6, 10], [-4, 7]], hx('#c9a24a'), 170);
        dash(Bl, [[-1.5, 1], [-3.5, 9]], 2, hx('#f1d35a'), hx('#fff0b0'), rng(hash(ID, 'bellhi')), { h: 200, nb: 1 });
        dash(Bl, [[-6, 10], [6, 10]], 1.6, hx('#6a4a20'), hx('#c9a24a'), rng(hash(ID, 'bellrim')), { h: 190, nb: 1 });
        B.bell = litCanvas(Bl, { relief: 0.02 });
      }
      B.cypress = buildCypress();
      BUILT = B;
    }
    const B = BUILT;
    this.main = bakeImage(K, 'main', B.main);
    this.front = bakeImage(K, 'front', B.front);
    this.ring = bakeImage(K, 'ring', B.ring);
    this.coil = bakeImage(K, 'coil', B.coil);
    this.small = B.small.map((sm, k) => ({ pad: sm.pad, img: bakeImage(K, 'small' + k, sm.cv) }));
    this.stars = B.stars.map((cv, k) => bakeImage(K, 'star' + k, cv));
    this.flares = B.flares.map((cv, k) => bakeImage(K, 'flare' + k, cv));
    this.moonHalo = bakeImage(K, 'moonHalo', B.moonHalo);
    this.crescent = bakeImage(K, 'crescent', B.crescent);
    this.windows = B.windows.map((w, k) => ({ ...w, img: bakeImage(K, 'win' + k, w.cv) }));
    this.bell = bakeImage(K, 'bell', B.bell);
    // live surfaces
    this.cyp = new Painter(CYP_REG.x0, CYP_REG.y0, CYP_REG.w, CYP_REG.h);
    this.cypImg = createImage(this.cyp.W, this.cyp.H);
    this.rid = new Painter(0, 0, 470, 420);
    this.ridImg = createImage(this.rid.W, this.rid.H);
  },

  mods(u) {
    if (u <= 1.3 || u >= 4.7) return {};
    const k = window01(1.9, 4.15, u, 0.25);
    return { wind: 0.55 * k, bob: 1 + 0.6 * k, eye: u >= 2 && u < 4 ? 'wide' : 'normal' };
  },

  render(K, u, ctx) {
    const v = ctx.view;
    const B = BUILT;
    imageMode(CORNER);
    image(this.main, 0, 0, 1000, 1000);
    const a = skyAngle(u, ctx.rider.state.wheel);
    const rot = (img, cx, cy, half, ang, sc = 1, alpha = 1) => {
      if (cx + half * sc < v.x0 || cx - half * sc > v.x1) return;
      push(); translate(cx, cy); rotate(ang); if (sc !== 1) scale(sc);
      if (alpha < 1) tint(255, 255 * alpha);
      image(img, -half, -half, 2 * half, 2 * half);
      pop();
    };
    // the great spiral: ring band at half speed, coil at full; small spirals counter-rotate
    rot(this.ring, C0.x, C0.y, B.ringPad, a * 0.5);
    rot(this.coil, C0.x, C0.y, B.coilPad, a);
    SMALL.forEach((sm, k) => rot(this.small[k].img, sm.x, sm.y, this.small[k].pad, -a * sm.k));
    // stars: slow turn, a pulse on every beat, a flare from the 2.0 downbeat
    const fl = flareK(u), bp = beatPulse(u);
    STARS.forEach((st, k) => {
      const sc = 1 + 0.035 * bp + 0.2 * fl * (0.75 + 0.25 * bp);
      if (fl > 0.01) rot(this.flares[k], st.x, st.y, Math.ceil(st.r * 1.95 + 6), -a * 0.4 * st.dir + k, sc * (1 + 0.08 * bp), fl * (0.75 + 0.25 * bp));
      rot(this.stars[k], st.x, st.y, st.R, a * 0.3 * st.dir + k * 0.7, sc);
    });
    // moon: halo throbs in the spin-up bar
    const mt = 1 + 0.025 * bp + fl * (0.05 + 0.07 * bp);
    rot(this.moonHalo, MOON.x, MOON.y, MOON.halo + 8, a * 0.15, mt);
    rot(this.crescent, MOON.x, MOON.y, MOON.r + 6, 0);
    // village: windows light up group by group; the bell swings
    this.windows.forEach((w, k) => {
      const t = WIN_T[k + 1], f = smoothstep(t - 0.02, t + 0.1, u);
      if (f <= 0.001) return;
      push(); if (f < 1) tint(255, 255 * f); image(w.img, w.x0, w.y0, w.w, w.h); pop();
    });
    const bellA = u >= 3 ? 0.55 * Math.sin(((u - 3) * TAU) / 0.5) * Math.exp(-(u - 3) * 1.1) : 0;
    push(); translate(BELL.x, BELL.y); rotate(bellA); image(this.bell, -8, -2, 16, 16); pop();
    // the cypress, re-painted every frame (it sways; it whips in the spin-up bar)
    if (v.x1 > CYP_REG.x0) {
      const Pc = this.cyp;
      Pc.clear();
      paintCypress(Pc, B.cypress, u);
      const out = light(Pc, Pc.W, Pc.H, { relief: 0.022 });
      const ic = this.cypImg.drawingContext;
      ic.clearRect(0, 0, Pc.W, Pc.H); ic.putImageData(out, 0, 0); this.cypImg.setModified(true);
      image(this.cypImg, CYP_REG.x0, CYP_REG.y0, CYP_REG.w, CYP_REG.h);
      image(this.front, FRONT.x0, FRONT.y0, FRONT.w, FRONT.h);
    }
    if (ctx.rider.visible) this.drawRider(K, u, ctx);
  },

  drawRider(K, u, ctx) {
    const sk = standK(u);
    const P = standPose(ctx.rider.placed, sk);
    const parts = K.rig.parts(P);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const ext = (p, r = 0) => { if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r; if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r; };
    for (const part of parts) { if (part.kind === 'circle') ext(part.c, part.r * 1.4 + 6); else for (const p of part.pts) ext(p, 9); }
    const v = ctx.view;
    x0 = Math.max(x0, -8, v.x0 - 4); x1 = Math.min(x1, 1008, v.x1 + 4); y0 = Math.max(y0, 0); y1 = Math.min(y1, 1000);
    if (x1 <= x0 || y1 <= y0) return;
    const Pn = this.rid;
    x1 = Math.min(x1, x0 + Pn.W / S); y1 = Math.min(y1, y0 + Pn.H / S);
    const w = Math.ceil((x1 - x0) * S), h = Math.ceil((y1 - y0) * S);
    Pn.origin(x0, y0);
    Pn.clear(w, h);
    const swirl = u > 1.5 && u < 4.6 ? spinW(u) : 0;
    paintRider(Pn, P, parts, u, swirl);
    const out = light(Pn, w, h, { relief: 0.028 });
    const ic = this.ridImg.drawingContext;
    ic.clearRect(0, 0, Pn.W, Pn.H); ic.putImageData(out, 0, 0); this.ridImg.setModified(true);
    image(this.ridImg, x0, y0, w / S, h / S, 0, 0, w, h);
  },
};
