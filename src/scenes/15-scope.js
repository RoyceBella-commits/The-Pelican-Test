// 15 · 示波器矢量图 / Oscilloscope Vector Graphics · 1950s
//
// A close-up photograph of a big round P7-phosphor cathode-ray tube in a dark laboratory: deep green-black glass
// with an engraved 10 × 8 graticule, a polished chrome trim ring and a moulded bezel lip set into a black
// crinkle-paint front panel; cream silkscreen (title, knob legends), a fictional maker's plate
// (PELICATRON · TYPE 51) and a jewel pilot lamp. The instrument is lit only by the green spill of its own screen.
// The road is the trace; the pelican is drawn by the beam. An engineer's hand (white cuff, wristwatch) rests by
// the knobs at the upper right, turns the wrong one on the 2.0 downbeat, and the pelican twists into a 3:2
// Lissajous knot — then springs back by itself on the next beat.
//
// Technique (0 live p5.brush marks):
//   • static layers are Canvas2D paintings baked once: `base` (the instrument under faint room light: per-pixel
//     crinkle paint, chrome and bezel profiles, glass, graticule, silkscreen), `spill` (the screen's green light
//     on the instrument — crinkle under raking light, the glass mirrored in the chrome, silkscreen, knob rims —
//     added × screen brightness) and `refl` (the glass's soft reflection arc, added on top of the picture);
//   • the beam is painted every frame into an opaque black 2D canvas with 'lighter' compositing (crossings add up
//     like real phosphor): three passes per vector (wide glow → glow → hot core), dwell dots at corners and stroke
//     ends, persistence tails = earlier poses (ctx.riderAt) in P7 green-yellow; two blurred mip levels of that
//     canvas are the bloom; all three are added onto the panel with blendMode(ADD);
//   • the hand and the two knobs it touches are repainted every frame into a small 2D canvas.
import { hash, clamp, lerp, smoothstep, smootherstep, easeOut, easeIn, easeInOut, smoothPath, ellipsePts, smoothLoop } from '../kit/math.js';
import { rigParts } from '../rig/parts.js';

const ID = 'scope';
const TAU = Math.PI * 2;
const CX = 500, CY = 600;            // centre of the tube face (panel units)
const RG = 550;                      // phosphor / glass radius (the road at the frame edges sits 12 units inside)
const RCH = 567;                     // chrome trim ring, outer radius
const RBZ = 580;                     // moulded bezel lip, outer radius
const ROAD = 800;
const BS = 1.6;                      // px per unit of the static bakes
const RIDE = { hold: [2.0, 2.6], speed: 0.5, ramp: 0.2 };
const CORE = [216, 255, 228], GLOW = [57, 255, 122], PERS = [155, 232, 106];
const LIGHT_T = [470, 700];          // centroid of what glows on the screen (trace + rider): where the spill comes from
const GRAT = 84;                     // graticule division
const KN = {
  intensity: { x: 62, y: 158, r: 17 },
  focus: { x: 790, y: 58, r: 16 },
  mode: { x: 868, y: 96, r: 17 },
};
const MODE_YT = Math.PI, MODE_XY = Math.PI * 1.25;   // chicken-head pointer: left → up-left (a clockwise click)
const FOCUS_A0 = 0.55;
const LAMP = [958, 86];
const PLATE = { x: 888, y: 18, w: 94, h: 30 };
const HR = { x0: 660, y0: 0, x1: 1000, y1: 500 };   // live canvas for the hand + touched knobs

// ------------------------------------------------------------------ small helpers
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const c2d = (c) => c.getContext('2d');
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a).toFixed(4)})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
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
const rnd = (...k) => hash(ID, ...k) / 4294967296;
function prng(seed) {
  let a = hash(ID, seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgrad(c, x0, y0, r0, x1, y1, r1, stops) {
  const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function lgrad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
function poly(c, pts, close) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}
const ridge = (n) => 1 - Math.abs(2 * n - 1);
const crinkle = (x, y) => 0.62 * ridge(vnoise(x * 0.62, y * 0.62, 7)) + 0.38 * ridge(vnoise(x * 1.45 + 17.3, y * 1.45 - 4.1, 8));
/** How bright the screen looks from the rim at angle th (lower half carries the trace and the rider). */
function screenAngular(th) {
  const lower = Math.max(0, Math.sin(th));
  const g = (d) => Math.exp(-(d * d) / 0.05);
  return 0.28 + 0.55 * lower + 0.9 * (g(angDiff(th, 0.38)) + g(angDiff(th, Math.PI - 0.38)));
}

// ------------------------------------------------------------------ time
/** Screen state: B brightness (1 = powered), foc defocus 0..1, flash, lamp (pilot jewel). */
function power(u) {
  if (u < 0) {
    const w = 0.9 + 0.1 * vnoise(u * 2.3 + 40, 0.7, 31);
    return { B: 0.3 * w, foc: 1, flash: 0, lamp: 0.36 + 0.06 * vnoise(u * 5.1 + 40, 1.3, 32) };
  }
  const flash = Math.exp(-u / 0.1);
  return { B: 1 + 1.3 * flash, foc: 0.8 * Math.exp(-u / 0.07), flash, lamp: 1 + 0.5 * flash };
}
const MORPH_IN = 2 / 30;
/** Pelican → Lissajous blend: 2 frames in at 2.0, spring back from 2.5 (≈15 % overshoot, settled by 3.0). */
function morphAmt(u) {
  if (u <= 2.0 || u >= 3.1) return 0;
  if (u < 2.5) return smoothstep(2.0, 2.0 + MORPH_IN, u);
  const s = u - 2.5, z = 0.517, wn = 18, wd = wn * Math.sqrt(1 - z * z);
  return Math.exp(-z * wn * s) * (Math.cos(wd * s) + (z * wn / wd) * Math.sin(wd * s)) * (1 - smoothstep(2.9, 3.1, u));
}
const lisPhase = (u) => TAU * (u - 2) * 1.5;
/** Mode knob pointer: clicks to X-Y exactly on 2.0, the hand turns it back (clicking home on 3.0). */
function modeAngle(u) {
  if (u < 1.94) return MODE_YT;
  if (u < 2.0) return lerp(MODE_YT, MODE_XY, easeIn((u - 1.94) / 0.06));
  if (u < 2.84) return MODE_XY + 0.05 * Math.exp(-(u - 2.0) / 0.05) * Math.sin((u - 2.0) * 60);
  if (u < 3.0) return lerp(MODE_XY, MODE_YT, easeIn((u - 2.84) / 0.16));
  return MODE_YT - 0.04 * Math.exp(-(u - 3.0) / 0.05) * Math.sin((u - 3.0) * 60);
}
function focusAngle(u) { return FOCUS_A0 + 0.32 * smootherstep(3.42, 3.62, u); }
/** Persistence tails: ≤ 80 ms at the seams, up to 0.4 s inside the gag. */
function trailSpec(u) {
  const w = smoothstep(1.05, 1.5, u) * (1 - smoothstep(4.5, 4.95, u));
  const k = smoothstep(1.9, 2.05, u) * (1 - smoothstep(3.0, 3.4, u));      // long P7 persistence around the knot
  const n = Math.round(lerp(2, 5, w) + 5 * k);
  return { n, dt: (lerp(0.08, 0.18, w) + 0.22 * k) / n, tau: lerp(0.04, 0.07, w) + 0.08 * k };
}
/** Trace flare on the click, and when the pelican springs back. */
const flare = (u) => (u >= 2.0 ? 1.4 * Math.exp(-(u - 2.0) / 0.14) : 0) + (u >= 2.5 ? 0.5 * Math.exp(-(u - 2.5) / 0.12) : 0);

// ------------------------------------------------------------------ the beam picture (geometry)
const ROLE_A = {
  legFar: 0.32, footFar: 0.34, crankFar: 0.42,
  tire: 1.0, rim: 0.4, spoke: 0.36, chain: 0.38, frame: 0.92, fork: 0.92, stem: 0.8, bars: 0.85, seatpost: 0.8, saddle: 0.95, ring: 0.5,
  tail: 0.95, body: 1, wing: 0.78, secondaries: 0.7, primary: 0.6, neck: 1, head: 1, crest: 0.8, pouch: 0.9, bill: 1, nail: 1.1,
  eye: 1.1, eyeShut: 1.1, leg: 0.72, foot: 0.85, crank: 0.95, pedal: 0.95,
};
function circlePts(c, r) {
  const n = Math.round(clamp(r * 0.9, 10, 60));
  const out = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return out;
}
function polyLen(pts, closed) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return L;
}
/** The placed rig as beam vectors: [{ pts, closed, a }] + dwell dots [x, y, a]. */
function riderVectors(P) {
  const strokes = [], dots = [];
  for (const part of rigParts(P)) {
    const role = part.role;
    if (role === 'hub') { dots.push([part.c[0], part.c[1], 0.9]); continue; }
    if (role === 'pupil') { dots.push([part.c[0], part.c[1], 1.25]); continue; }
    const a0 = ROLE_A[role];
    if (!a0) continue;
    let pts, closed;
    if (part.kind === 'circle') { pts = circlePts(part.c, part.r); closed = true; }
    else if (part.kind === 'poly') { pts = part.pts; closed = true; }
    else { pts = part.pts; closed = false; }
    if (pts.length < 2) continue;
    // beam-speed brightness: short vectors are drawn slower → brighter
    const L = polyLen(pts, closed);
    const a = a0 * clamp(Math.pow(120 / Math.max(8, L), 0.16), 0.8, 1.3);
    strokes.push({ pts, closed, a, role });
    // dwell: the beam rests where a vector starts, ends or turns sharply
    if (!closed) {
      if (role !== 'spoke') dots.push([pts[0][0], pts[0][1], 0.5]);
      dots.push([pts[pts.length - 1][0], pts[pts.length - 1][1], role === 'spoke' ? 0.32 : 0.55]);
    } else if (part.kind === 'poly') {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
        const ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la < 0.5 || lb < 0.5) continue;
        const turn = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
        if (turn > 0.95) dots.push([p1[0], p1[1], 0.25 + 0.35 * clamp((turn - 0.95) / 1.5)]);
      }
    }
  }
  return { strokes, dots };
}
/** Resample a polyline at spacing ≤ step; returns points and their arclength from the start. */
function resample(pts, closed, step) {
  const src = closed ? pts.concat([pts[0]]) : pts;
  const out = [[src[0][0], src[0][1]]], s = [0];
  let acc = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); s.push(acc + L * k / n); }
    acc += L;
  }
  return { pts: out, s, L: acc };
}
/**
 * The pelican's outline (every vector, concatenated) blended toward a 3:2 Lissajous figure:
 * x = cx + Ax·sin(2π·3θ + φ), y = cy + Ay·sin(2π·2θ), θ = arclength / total length.
 */
function lissajousVectors(V, u, m) {
  const parts = V.strokes.map((st) => resample(st.pts, st.closed, 2.4));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, total = 0;
  for (const p of parts) {
    for (const q of p.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    total += p.L;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 4, Ax = (x1 - x0) / 2 * 0.95, Ay = (y1 - y0) / 2 * 0.93;
  const ph = lisPhase(u), am = Math.abs(m);
  const strokes = [], jumps = [];
  let base = 0, prev = null;
  parts.forEach((p, j) => {
    const out = p.pts.map((q, k) => {
      const th = (base + p.s[k]) / total;
      const lx = cx + Ax * Math.sin(TAU * 3 * th + ph), ly = cy + Ay * Math.sin(TAU * 2 * th);
      return [q[0] + (lx - q[0]) * m, q[1] + (ly - q[1]) * m];
    });
    strokes.push({ pts: out, closed: false, a: lerp(V.strokes[j].a, 1.0, clamp(am)) });
    if (prev && m > 0) jumps.push({ pts: [prev, out[0]], closed: false, a: clamp(m * 1.4) });
    prev = out[out.length - 1];
    base += p.L;
  });
  if (m > 0 && strokes.length) jumps.push({ pts: [prev, strokes[0].pts[0]], closed: false, a: clamp(m * 1.4) });
  return { strokes: strokes.concat(jumps), dots: V.dots.map((d) => [d[0], d[1], d[2] * (1 - clamp(am * 4))]) };
}
/** Beam vectors of the rider at sample time uS (rider pose R from ctx.rider / ctx.riderAt). */
function beamAt(R, uS) {
  const V = riderVectors(R.placed);
  const m = morphAmt(uS);
  return Math.abs(m) > 1e-4 ? lissajousVectors(V, uS, m) : V;
}

// ---- the trace (the road)
function traceY(x, u, t) {
  let y = ROAD + 0.55 * Math.sin(TAU * (x / 347 + 0.37 * t));             // mains-hum ripple
  if (u > 0.15 && u < 1.4) {                                               // ringing behind the power-on pulse
    const xp = (u - 0.15) / 0.45 * 1000, d = xp - x;
    if (d > 0) y += 4.5 * Math.exp(-d / 130) * Math.sin(d / 13) * Math.exp(-Math.max(0, u - 0.6) / 0.22);
  }
  if (u > 3.0 && u < 3.5) {                                                // the small spike of the knob click
    const xs = -20 + (u - 3.0) / 0.42 * 1040, d = x - xs;
    const k = 1 - smoothstep(3.32, 3.48, u);
    y -= k * (13 * Math.exp(-(d * d) / 40) - 4 * Math.exp(-((d + 9) * (d + 9)) / 60));
  }
  return y;
}
/** Trace brightness along x (sweep spot tail, pulse, spike, flare). */
function traceA(x, u) {
  const P = power(u);
  const xy = u >= 2.0 && u < 3.0;                                          // X-Y mode: no sweep
  let a = (u < 0 ? 0.16 : 0.44) * (1 + 2.4 * flare(u));
  if (!xy) {
    const period = u < 0 ? 2.0 : 0.5, D = u < 0 ? 330 : 240;
    const ph = ((u / period) % 1 + 1) % 1, xs = -20 + 1040 * ph;
    const back = ((xs - x) % 1040 + 1040) % 1040;
    a += (u < 0 ? 0.75 : 0.5) * Math.exp(-back / D);
  }
  if (u > 0.15 && u < 0.85) {
    const xp = (u - 0.15) / 0.45 * 1000, d = xp - x;
    if (d > 0) a += 1.6 * Math.exp(-d / 90) * (1 - smoothstep(0.6, 0.85, u));
  }
  if (u > 3.0 && u < 3.5) {
    const xs = -20 + (u - 3.0) / 0.42 * 1040, d = xs - x;
    if (d > -10) a += 0.8 * Math.exp(-Math.max(0, d) / 60) * (1 - smoothstep(3.32, 3.48, u));
  }
  return a * P.B;
}

// ---- standby test lettering "1950s" (a little stroke font, cell 4 × 6)
const GLYPHS = {
  '1': [[[0.9, 1.3], [2.1, 0.1], [2.1, 6]], [[1.0, 6], [3.2, 6]]],
  '9': [ellipsePts(2.0, 1.95, 1.55, 1.85, 0, 22).concat([ellipsePts(2.0, 1.95, 1.55, 1.85, 0, 22)[0]]),
    smoothPath([[3.55, 1.9], [3.5, 3.9], [2.9, 5.5], [1.8, 6.05], [0.8, 5.6]], 5)],
  '5': [[[3.4, 0.1], [0.95, 0.1], [0.65, 2.75]], smoothPath([[0.65, 2.75], [1.6, 2.3], [2.9, 2.55], [3.55, 3.8], [3.35, 5.25], [2.2, 6.05], [1.0, 5.85], [0.35, 5.1]], 5)],
  '0': [ellipsePts(2.0, 3.05, 1.65, 2.98, 0, 30).concat([ellipsePts(2.0, 3.05, 1.65, 2.98, 0, 30)[0]]), [[1.0, 4.9], [3.0, 1.2]]],
  's': [smoothPath([[3.1, 3.35], [2.3, 2.85], [1.2, 2.9], [0.75, 3.6], [1.35, 4.25], [2.65, 4.6], [3.25, 5.3], [2.65, 6.0], [1.4, 6.05], [0.6, 5.55]], 5)],
};
function textVectors(str, x, y, k) {
  const out = [];
  let cx = x;
  for (const ch of str) {
    for (const st of GLYPHS[ch] || []) out.push({ pts: st.map((p) => [cx + p[0] * k, y + p[1] * k]), closed: false, a: 1 });
    cx += 4.7 * k;
  }
  return out;
}
const TEXT_1950 = textVectors('1950s', 500 - 4.7 * 11 * 2.5 + 3, 300, 11);
const TEXT_LEN = TEXT_1950.map((st) => polyLen(st.pts, false));
/** The lettering written up to fraction f (the beam draws it stroke by stroke); returns strokes + the pen. */
function writeText(f) {
  const total = TEXT_LEN.reduce((a, b) => a + b, 0);
  let left = f * total, pen = null;
  const out = [];
  TEXT_1950.forEach((st, k) => {
    if (left <= 0) return;
    if (left >= TEXT_LEN[k]) { out.push(st); left -= TEXT_LEN[k]; pen = st.pts[st.pts.length - 1]; return; }
    const pts = [st.pts[0]];
    let acc = 0;
    for (let i = 1; i < st.pts.length; i++) {
      const a = st.pts[i - 1], b = st.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + L >= left) { const t = (left - acc) / L; pen = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; pts.push(pen); break; }
      pts.push(b); acc += L;
    }
    if (pts.length > 1) out.push({ ...st, pts });
    left = 0;
  });
  return { strokes: out, pen: f < 1 ? pen : null };
}

// ------------------------------------------------------------------ the hand
// Hand-local frame: origin at the wrist, +x toward the fingertips, the thumb on the −y side (a right hand seen
// from the back). Fingers are chains of three phalanges with per-phalanx foreshortening (a finger curling toward
// the panel gets shorter in the picture); poses blend RELAX / POINT / GRIP. HS scales the whole hand.
const HS = 1.2;
const ELBOW = [1180, 700];          // the (off-panel) elbow: the forearm always comes in from the lower right
const HG = {
  knuckles: [[76, -21.5], [82, -7], [78, 7.5], [70, 21]],
  fingers: [{ L: [34, 21, 17], w: 17 }, { L: [38, 24, 18], w: 17.5 }, { L: [35, 22, 17], w: 16.5 }, { L: [28, 17, 15], w: 14.5 }],
  thumbBase: [14, -24], thumb: { L: [42, 30, 24], w: 19 },
};
// finger: [spread, [bend × 3], [foreshortening × 3]]; thumb: [angle, [bend × 2], [fs × 3]]
const POSES = {
  relax: {
    f: [[-0.04, [0.04, 0.1, 0.1], [0.9, 0.58, 0.4]], [0.0, [0.03, 0.1, 0.1], [0.88, 0.55, 0.38]],
      [0.045, [0.03, 0.1, 0.1], [0.85, 0.52, 0.36]], [0.1, [0.04, 0.12, 0.1], [0.82, 0.5, 0.36]]],
    t: [-0.44, [0.3, 0.2], [0.9, 0.9, 0.85]],
  },
  point: {
    f: [[-0.05, [0.0, 0.03, 0.03], [1.0, 1.0, 0.98]], [0.02, [0.05, 0.1, 0.1], [0.84, 0.45, 0.3]],
      [0.07, [0.05, 0.1, 0.1], [0.82, 0.42, 0.3]], [0.14, [0.06, 0.1, 0.1], [0.8, 0.42, 0.3]]],
    t: [-0.34, [0.36, 0.25], [0.9, 0.9, 0.8]],
  },
  grip: {
    f: [[-0.1, [-0.1, -0.32, -0.32], [1.0, 0.86, 0.72]], [-0.03, [-0.06, -0.22, -0.2], [0.88, 0.55, 0.4]],
      [0.06, [0.05, 0.1, 0.1], [0.74, 0.34, 0.22]], [0.13, [0.06, 0.1, 0.1], [0.7, 0.32, 0.2]]],
    t: [-0.55, [0.1, 0.3], [1.0, 1.0, 0.95]],
  },
};
function blendPose(w, tap) {
  const KEYS = ['relax', 'point', 'grip'];
  const f = [0, 1, 2, 3].map((i) => {
    let sp = 0;
    const b = [0, 0, 0], fs = [0, 0, 0];
    for (const k of KEYS) {
      const P = POSES[k].f[i], q = w[k];
      sp += P[0] * q;
      for (let j = 0; j < 3; j++) { b[j] += P[1][j] * q; fs[j] += P[2][j] * q; }
    }
    if (i === 0 && tap) { fs[1] -= 0.25 * tap; fs[2] -= 0.2 * tap; b[0] += 0.04 * tap; }
    return [sp, b, fs];
  });
  let ta = 0;
  const tb = [0, 0], tf = [0, 0, 0];
  for (const k of KEYS) {
    const P = POSES[k].t, q = w[k];
    ta += P[0] * q; tb[0] += P[1][0] * q; tb[1] += P[1][1] * q;
    for (let j = 0; j < 3; j++) tf[j] += P[2][j] * q;
  }
  return { f, t: [ta, tb, tf] };
}
function chain(base, dir0, Ls, bends, fs) {
  const pts = [base];
  let a = dir0, p = base;
  for (let k = 0; k < Ls.length; k++) {
    a += bends[k];
    const q = [p[0] + Math.cos(a) * Ls[k] * fs[k], p[1] + Math.sin(a) * Ls[k] * fs[k]];
    pts.push(q); p = q;
  }
  return pts;
}
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
/** Where the gripped knob sits in the hand frame: between the index and thumb tips of the GRIP pose. */
const GRIP_K = (() => {
  const P = POSES.grip, i = chain(HG.knuckles[0], P.f[0][0], HG.fingers[0].L, P.f[0][1], P.f[0][2]).pop();
  const t = chain(HG.thumbBase, P.t[0], HG.thumb.L, [0, P.t[1][0], P.t[1][1]], P.t[2]).pop();
  return [(i[0] + t[0]) / 2 + 2, (i[1] + t[1]) / 2];
})();
const easeSeg = (u, a, b) => smootherstep(a, b, u);

/** The hand over time: wrist (x, y), direction a, pose weights, index tap. */
function handState(u) {
  const K = KN.mode, F = KN.focus;
  const placeAt = (P, local, a) => { const o = rot2([local[0] * HS, local[1] * HS], a); return { x: P[0] - o[0], y: P[1] - o[1], a }; };
  const gripAt = (ka) => placeAt([K.x, K.y], GRIP_K, GA + (ka - MODE_YT) * 0.35);
  const TIP = [146, -25];                                   // index fingertip (pointing pose) in the hand frame
  const GA = -1.85;
  const REST = { x: 968, y: 338, a: -2.14 };
  const PT = placeAt([F.x + 24, F.y + 30], TIP, -2.06);     // reaching for FOCUS...
  const PT2 = placeAt([F.x + 14, F.y + 20], TIP, -2.0);     // ...hesitates just short of it
  const FT = placeAt([F.x + 3, F.y + 5], TIP, -2.0);        // later: the right knob after all
  const G0 = gripAt(MODE_YT);
  const lerpS = (A, B, k) => ({ x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), a: lerp(A.a, B.a, k) });
  let S, w;
  if (u < 1.3) { S = REST; w = { relax: 1, point: 0, grip: 0 }; }
  else if (u < 1.62) { const k = easeSeg(u, 1.3, 1.62); S = lerpS(REST, PT, k); w = { relax: 1 - k, point: k, grip: 0 }; }
  else if (u < 1.76) { const k = easeSeg(u, 1.62, 1.76); S = lerpS(PT, PT2, k); w = { relax: 0, point: 1, grip: 0 }; }
  else if (u < 1.93) { const k = easeSeg(u, 1.76, 1.93); S = lerpS(PT2, G0, k); w = { relax: 0, point: 1 - k, grip: k }; }
  else if (u < 3.3) {
    S = gripAt(modeAngle(u));
    // a flinch when the pelican springs back by itself
    const fl = u > 2.5 ? Math.exp(-(u - 2.53) * (u - 2.53) / 0.01) : 0;
    w = { relax: 0.6 * fl, point: 0, grip: 1 - 0.6 * fl };
    S = { ...S, x: S.x + 9 * fl, y: S.y + 6 * fl };
  } else if (u < 3.5) {
    const k = easeSeg(u, 3.3, 3.5);
    S = lerpS(gripAt(MODE_YT), FT, k); w = { relax: 0, point: k, grip: 1 - k };
  } else if (u < 3.7) {
    S = { ...FT, a: FT.a + 0.06 * smootherstep(3.42, 3.62, u) }; w = { relax: 0, point: 1, grip: 0 };
  } else {
    const k = easeSeg(u, 3.7, 4.25);
    S = lerpS({ ...FT, a: FT.a + 0.06 }, REST, k); w = { relax: k, point: 1 - k, grip: 0 };
  }
  // breathing / idle sway, and the withdrawal after the rider has gone
  const sway = Math.sin(u * 1.7) * 1.2, bob = Math.sin(u * 1.1 + 0.6) * 1.0;
  const out = smootherstep(6.0, 8.2, u);
  const tap = u < 1.0 ? Math.max(0, Math.sin(Math.PI * (((u % 0.5) + 0.5) % 0.5) / 0.5)) ** 6 * (u < 0 ? 1 : 1 - smoothstep(0, 0.6, u)) : 0;
  return { x: S.x + sway + 300 * out, y: S.y + bob + 40 * out, a: S.a + 0.08 * out, w, tap, ex: ELBOW[0] + 300 * out, ey: ELBOW[1] + 40 * out };
}

/** Hand shapes in the hand frame. */
function handShapes(H) {
  const pose = blendPose(H.w, H.tap);
  const fingers = pose.f.map((P, i) => ({ pts: chain(HG.knuckles[i], P[0], HG.fingers[i].L, P[1], P[2]), w: HG.fingers[i].w, fs: P[2] }));
  const tp = pose.t;
  const thumb = { pts: chain(HG.thumbBase, tp[0], HG.thumb.L, [0, tp[1][0], tp[1][1]], tp[2]), w: HG.thumb.w };
  const palm = smoothLoop([[-6, -25], [20, -28], [50, -29.5], [74, -30], [86, -16], [88, 0], [84, 15], [76, 29], [48, 30], [18, 28], [-6, 25]], 4);
  return { fingers, thumb, palm };
}
function traceHand(c, sh, fat = 0) {
  // silhouette: palm + wrist + thumb + fingers (thick round lines)
  poly(c, sh.palm, true); c.fill();
  c.beginPath(); c.ellipse(2, 0, 14 + fat, 25.5 + fat, 0, 0, TAU); c.fill();
  const lineChain = (pts, w0, w1) => {
    for (let k = 0; k < pts.length - 1; k++) {
      c.lineWidth = lerp(w0, w1, k / (pts.length - 2)) + fat * 2;
      c.beginPath(); c.moveTo(pts[k][0], pts[k][1]); c.lineTo(pts[k + 1][0], pts[k + 1][1]); c.stroke();
    }
  };
  lineChain(sh.thumb.pts, sh.thumb.w, sh.thumb.w * 0.78);
  for (const f of sh.fingers) lineChain(f.pts, f.w, f.w * 0.84);
}

/**
 * Paint the hand (with cuff and watch) into the 2D context `out` (pixel space of the hand canvas). The scene
 * transform is given as T = [S, ox, oy] (px per unit, panel origin of the canvas). g = green spill strength.
 */
function paintHand(out, scratch, T, H, g, t) {
  const [S, ox, oy] = T;
  const W = out.canvas.width, Hh = out.canvas.height;
  const [m, col, rim] = scratch.map((cv) => c2d(cv));
  const sh = handShapes(H);
  const local = (c) => { c.setTransform(S, 0, 0, S, -ox * S, -oy * S); c.translate(H.x, H.y); c.rotate(H.a); c.scale(HS, HS); c.lineCap = 'round'; c.lineJoin = 'round'; };
  const fa = Math.atan2(H.y - H.ey, H.x - H.ex);          // forearm direction (elbow → wrist)
  const localF = (c) => { c.setTransform(S, 0, 0, S, -ox * S, -oy * S); c.translate(H.x, H.y); c.rotate(fa); c.scale(HS, HS); c.lineCap = 'round'; c.lineJoin = 'round'; };
  const LF = rot2([LIGHT_T[0] - H.x, LIGHT_T[1] - H.y].map((v, i, arr) => v / Math.hypot(arr[0], arr[1])), -fa);
  const wristBlock = (c) => { c.beginPath(); c.moveTo(-46, -25); c.lineTo(2, -25.5); c.lineTo(2, 25.5); c.lineTo(-46, 26); c.closePath(); c.fill(); };
  // light direction (toward the bright part of the screen), in hand-local and in screen space
  let Lx = LIGHT_T[0] - H.x, Ly = LIGHT_T[1] - H.y;
  const Ll = Math.hypot(Lx, Ly); Lx /= Ll; Ly /= Ll;
  const L = rot2([Lx, Ly], -H.a);
  for (const c of [m, col, rim]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.globalAlpha = 1; c.clearRect(0, 0, W, Hh); }

  // 1. mask
  localF(m); m.fillStyle = '#fff'; wristBlock(m);
  local(m); m.fillStyle = '#fff'; m.strokeStyle = '#fff'; traceHand(m, sh);
  // 2. body colour: one broad gradient toward the screen, a faint warm room light from the upper left
  localF(col);
  {
    const ny = LF[1] < 0 ? -1 : 1;
    col.fillStyle = lgrad(col, 0, -26 * ny, 0, 26 * ny, [[0, 'rgb(8,7,7)'], [0.5, 'rgb(17,15,14)'], [0.85, rgba([22 + 20 * g, 24 + 70 * g, 20 + 36 * g], 1)], [1, rgba([22 + 22 * g, 24 + 78 * g, 20 + 40 * g], 1)]]);
    wristBlock(col);
  }
  local(col);
  const cx = 52, cy = 0;
  const dark = [8, 7, 7], midc = [17, 15, 14], lit = [22 + 22 * g, 24 + 78 * g, 20 + 40 * g];
  col.fillStyle = lgrad(col, cx - L[0] * 70, cy - L[1] * 70, cx + L[0] * 70, cy + L[1] * 70,
    [[0, rgba(dark, 1)], [0.45, rgba(midc, 1)], [0.8, rgba(mixc(midc, lit, 0.55), 1)], [1, rgba(lit, 1)]]);
  col.strokeStyle = col.fillStyle;
  traceHand(col, sh);
  // form: each finger is a cylinder — a soft lighter band along its lit side, darker between fingers
  // (painted sharp into the `rim` scratch, then blurred once onto the body)
  local(rim);
  for (let i = 0; i < 4; i++) {
    const f = sh.fingers[i];
    for (let k = 0; k < 3; k++) {
      const p = f.pts[k], q = f.pts[k + 1];
      let nx = -(q[1] - p[1]), ny = q[0] - p[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const s = nx * L[0] + ny * L[1] > 0 ? 1 : -1;
      const o = f.w * 0.28;
      rim.strokeStyle = rgba(mixc(midc, lit, 0.9), 0.55); rim.lineWidth = f.w * 0.3;
      rim.beginPath(); rim.moveTo(p[0] + nx * o * s, p[1] + ny * o * s); rim.lineTo(q[0] + nx * o * s, q[1] + ny * o * s); rim.stroke();
      rim.strokeStyle = 'rgba(0,0,0,0.55)'; rim.lineWidth = f.w * 0.22;
      rim.beginPath(); rim.moveTo(p[0] - nx * f.w * 0.5 * s, p[1] - ny * f.w * 0.5 * s); rim.lineTo(q[0] - nx * f.w * 0.5 * s, q[1] - ny * f.w * 0.5 * s); rim.stroke();
    }
    // knuckle: a soft highlight on the back of the hand
    const kn = f.pts[0];
    rim.fillStyle = rgba(mixc(midc, lit, 0.7), 0.6);
    rim.beginPath(); rim.ellipse(kn[0] - 3, kn[1] + L[1] * 2, 6.5, f.w * 0.36, 0, 0, TAU); rim.fill();
    // joint creases
    rim.strokeStyle = 'rgba(0,0,0,0.5)'; rim.lineWidth = 1.1;
    for (const k of [1, 2]) {
      const p = f.pts[k], a = Math.atan2(f.pts[k + 1][1] - f.pts[k - 1][1], f.pts[k + 1][0] - f.pts[k - 1][0]) + Math.PI / 2;
      rim.beginPath(); rim.moveTo(p[0] - Math.cos(a) * f.w * 0.3, p[1] - Math.sin(a) * f.w * 0.3); rim.lineTo(p[0] + Math.cos(a) * f.w * 0.3, p[1] + Math.sin(a) * f.w * 0.3); rim.stroke();
    }
  }
  // tendons fanning from the wrist to the knuckles
  rim.strokeStyle = rgba(mixc(midc, lit, 0.5), 0.35); rim.lineWidth = 3;
  for (const kn of HG.knuckles) { rim.beginPath(); rim.moveTo(6, kn[1] * 0.45); rim.quadraticCurveTo(kn[0] * 0.55, kn[1] * 0.85, kn[0] - 7, kn[1]); rim.stroke(); }
  // the thumb's shadowed underside
  {
    const P = sh.thumb.pts;
    rim.strokeStyle = 'rgba(0,0,0,0.45)'; rim.lineWidth = 5;
    rim.beginPath(); rim.moveTo(P[0][0] + 6, P[0][1] + 6); rim.lineTo(P[1][0], P[1][1] + 6); rim.stroke();
  }
  col.setTransform(1, 0, 0, 1, 0, 0);
  col.globalCompositeOperation = 'source-atop';
  col.filter = `blur(${(1.7 * S).toFixed(1)}px)`;
  col.drawImage(rim.canvas, 0, 0);
  col.filter = 'none';
  rim.setTransform(1, 0, 0, 1, 0, 0); rim.clearRect(0, 0, W, Hh);
  local(col);
  // nails (only where a fingertip points along the picture plane)
  for (const f of sh.fingers.concat([{ pts: sh.thumb.pts, w: sh.thumb.w, fs: [1, 1, sh.thumb.pts ? 0.9 : 0] }])) {
    const vis = clamp((f.fs[2] - 0.45) / 0.45);
    if (vis <= 0.02) continue;
    const p = f.pts[2], q = f.pts[3], a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    col.save(); col.translate(lerp(p[0], q[0], 0.6), lerp(p[1], q[1], 0.6)); col.rotate(a);
    col.fillStyle = rgba(mixc([34, 32, 30], lit, 0.45), 0.75 * vis);
    col.beginPath(); col.ellipse(0, 0, Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.36, f.w * 0.28, 0, 0, TAU); col.fill();
    col.fillStyle = rgba(mixc(lit, [255, 255, 255], 0.2), 0.35 * vis * clamp(g * 1.5));
    col.beginPath(); col.ellipse(-1, L[1] > 0 ? 1.5 : -1.5, 3, 1.2, 0, 0, TAU); col.fill();
    col.restore();
  }
  col.globalCompositeOperation = 'source-over';
  // 3. rim light: the part of the silhouette that faces the screen
  col.globalCompositeOperation = 'source-over';
  rim.setTransform(1, 0, 0, 1, 0, 0);
  rim.drawImage(m.canvas, 0, 0);
  rim.globalCompositeOperation = 'destination-out';
  const d = 3.2 * S * HS;
  rim.drawImage(m.canvas, -Lx * d, -Ly * d);
  rim.globalCompositeOperation = 'source-in';
  rim.fillStyle = rgba([50 + 110 * g, 70 + 170 * g, 56 + 110 * g], 0.2 + 0.6 * clamp(g * 1.4));
  rim.fillRect(0, 0, W, Hh);
  rim.globalCompositeOperation = 'source-over';
  col.setTransform(1, 0, 0, 1, 0, 0);
  col.globalCompositeOperation = 'source-atop';
  col.filter = `blur(${(0.9 * S).toFixed(2)}px)`;
  col.drawImage(rim.canvas, 0, 0);
  col.filter = 'none';
  col.globalCompositeOperation = 'source-over';

  // 4. watch (strap across the wrist, case facing the camera) and the shirt cuff over the forearm
  localF(col);

  {
    col.fillStyle = '#0b0807';
    col.beginPath(); col.moveTo(-26, -29); col.quadraticCurveTo(-16, -31, -7, -29); col.lineTo(-7, 29); col.quadraticCurveTo(-16, 31, -26, 29); col.closePath(); col.fill();
    col.strokeStyle = rgba(mixc([30, 24, 20], lit, 0.3), 0.55); col.lineWidth = 0.6; col.setLineDash([1.4, 1.6]);
    col.beginPath(); col.moveTo(-24.5, -27); col.lineTo(-24.5, 27); col.moveTo(-8.5, -27); col.lineTo(-8.5, 27); col.stroke(); col.setLineDash([]);
    const wc = [-16.5, 1];
    col.fillStyle = rgrad(col, wc[0] + LF[0] * 8, wc[1] + LF[1] * 8, 1, wc[0], wc[1], 14, [[0, rgba(mixc([70, 72, 70], [90, 220, 140], g), 1)], [0.55, rgba([30, 32, 31], 1)], [1, rgba([12, 12, 12], 1)]]);
    circ(col, wc[0], wc[1], 13.5); col.fill();
    col.fillStyle = '#060908'; circ(col, wc[0], wc[1], 10.6); col.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, rr = k % 3 === 0 ? 1.2 : 0.75;
      col.fillStyle = `rgba(150,226,140,${k % 3 === 0 ? 0.8 : 0.55})`;
      circ(col, wc[0] + Math.cos(a) * 8.4, wc[1] + Math.sin(a) * 8.4, rr); col.fill();
    }
    const hand = (a, l, w, cc) => { col.strokeStyle = cc; col.lineWidth = w; col.beginPath(); col.moveTo(wc[0], wc[1]); col.lineTo(wc[0] + Math.cos(a) * l, wc[1] + Math.sin(a) * l); col.stroke(); };
    const a12 = Math.PI;                                   // 12 o'clock points up the forearm
    hand(a12 + TAU * (9.2 / 12), 5.2, 1.6, 'rgba(150,226,140,0.75)');
    hand(a12 + TAU * (21 / 60), 7.8, 1.2, 'rgba(150,226,140,0.75)');
    hand(a12 + TAU * (Math.floor(t) % 60) / 60, 8.6, 0.5, 'rgba(200,200,190,0.6)');
    const la = Math.atan2(LF[1], LF[0]);
    col.strokeStyle = rgba([110, 240, 160], 0.55 * clamp(g * 1.6)); col.lineWidth = 1.5;
    col.beginPath(); col.arc(wc[0], wc[1], 9.6, la - 0.7, la + 0.45); col.stroke();
    col.fillStyle = rgba([220, 255, 230], 0.35 * clamp(g * 1.6));
    circ(col, wc[0] + Math.cos(la - 0.2) * 12.8, wc[1] + Math.sin(la - 0.2) * 12.8, 1.1); col.fill();
  }
  {
    const ny = LF[1] < 0 ? -1 : 1;
    const W0 = [36, 38, 35], W1 = [52 + 95 * g, 70 + 150 * g, 60 + 105 * g];
    // sleeve beyond the cuff (out of frame soon)
    col.fillStyle = lgrad(col, 0, -46 * ny, 0, 46 * ny, [[0, rgba([12, 12, 12], 1)], [0.5, rgba([26, 27, 25], 1)], [0.9, rgba(mixc([26, 27, 25], W1, 0.45), 1)], [1, rgba([20, 21, 20], 1)]]);
    col.beginPath(); col.moveTo(-64, -38); col.lineTo(-320, -48); col.lineTo(-320, 52); col.lineTo(-64, 39); col.closePath(); col.fill();
    const cuff = smoothLoop([[-25, -31], [-45, -35.5], [-66, -37], [-67, 0], [-66, 38], [-45, 36.5], [-25, 32], [-23, 0]], 4);
    col.fillStyle = lgrad(col, 0, -37 * ny, 0, 37 * ny, [[0, rgba([18, 18, 17], 1)], [0.42, rgba(W0, 1)], [0.8, rgba(mixc(W0, W1, 0.55), 1)], [0.95, rgba(W1, 1)], [1, rgba(mixc(W1, W0, 0.5), 1)]]);
    poly(col, cuff, true); col.fill();
    col.strokeStyle = 'rgba(0,0,0,0.4)'; col.lineWidth = 0.9;
    col.beginPath(); col.moveTo(-29, -31.5); col.quadraticCurveTo(-27, 0, -29, 32.5); col.stroke();
    col.strokeStyle = 'rgba(0,0,0,0.22)'; col.lineWidth = 1.6;
    for (const yy of [-16, 4, 19]) { col.beginPath(); col.moveTo(-62, yy); col.quadraticCurveTo(-50, yy + 3, -36, yy - 1); col.stroke(); }
    col.fillStyle = rgba(mixc(W0, W1, 0.5), 1); circ(col, -46, 25 * ny, 3.4); col.fill();
    col.fillStyle = 'rgba(0,0,0,0.45)'; circ(col, -47, 25 * ny - 0.8, 0.7); col.fill(); circ(col, -45, 25 * ny + 0.8, 0.7); col.fill();
  }

  // 5. composite: a soft shadow on the panel (never on the glowing glass), then the hand, slightly soft
  out.save();
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.beginPath(); out.rect(0, 0, W, Hh); out.arc((CX - ox) * S, (CY - oy) * S, RG * S, 0, TAU, true); out.clip('evenodd');
  out.filter = `brightness(0) blur(${(6 * S).toFixed(1)}px)`;
  out.globalAlpha = 0.55;
  out.drawImage(col.canvas, 7 * S, 9 * S);
  out.restore();
  out.save();
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.filter = `blur(${(0.5 * S).toFixed(2)}px)`;
  out.drawImage(col.canvas, 0, 0);
  out.restore();
}

// ------------------------------------------------------------------ knobs (Canvas2D; 'amb' = room light, 'green' = screen light only)
function knobRound(c, k, ang, mode, g = 1) {
  const { x, y, r } = k;
  const lx = LIGHT_T[0] - x, ly = LIGHT_T[1] - y, la = Math.atan2(ly, lx);
  if (mode === 'amb') {
    c.fillStyle = rgrad(c, x + 3, y + 4, r * 0.8, x + 3, y + 4, r * 1.75, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    circ(c, x + 3, y + 4, r * 1.75); c.fill();
    // skirt
    c.fillStyle = rgrad(c, x - r * 0.5, y - r * 0.6, r * 0.2, x, y, r * 1.34, [[0, '#2c2c2c'], [0.7, '#171717'], [1, '#0b0b0b']]);
    circ(c, x, y, r * 1.34); c.fill();
    c.strokeStyle = 'rgba(232,223,200,0.55)'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 1.02, y + Math.sin(ang) * r * 1.02); c.lineTo(x + Math.cos(ang) * r * 1.3, y + Math.sin(ang) * r * 1.3); c.stroke();
    // fluted body
    c.fillStyle = rgrad(c, x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r, [[0, '#3a3a3a'], [0.55, '#1b1b1b'], [1, '#0a0a0a']]);
    circ(c, x, y, r); c.fill();
    c.lineWidth = 0.9;
    for (let j = 0; j < 22; j++) {
      const a = ang + (j / 22) * TAU;
      const lit = 0.5 + 0.5 * Math.cos(a - (-2.2));
      c.strokeStyle = `rgba(0,0,0,0.65)`;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84); c.lineTo(x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0); c.stroke();
      c.strokeStyle = `rgba(120,120,120,${(0.1 + 0.22 * lit).toFixed(3)})`;
      const b = a + 0.07;
      c.beginPath(); c.moveTo(x + Math.cos(b) * r * 0.85, y + Math.sin(b) * r * 0.85); c.lineTo(x + Math.cos(b) * r * 0.98, y + Math.sin(b) * r * 0.98); c.stroke();
    }
    // top face + its sheen, pointer line
    c.fillStyle = rgrad(c, x - r * 0.3, y - r * 0.35, 0, x, y, r * 0.78, [[0, '#2e2e2e'], [1, '#151515']]);
    circ(c, x, y, r * 0.78); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r * 0.74, -2.9, -1.3); c.stroke();
    c.strokeStyle = 'rgba(232,223,200,0.75)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 0.25, y + Math.sin(ang) * r * 0.25); c.lineTo(x + Math.cos(ang) * r * 0.7, y + Math.sin(ang) * r * 0.7); c.stroke();
  } else {
    const G = (a) => rgba(GLOW, a * g);
    c.lineCap = 'round';
    c.strokeStyle = G(0.55); c.lineWidth = 1.6;
    c.beginPath(); c.arc(x, y, r * 1.31, la - 1.0, la + 1.0); c.stroke();
    c.strokeStyle = G(0.8); c.lineWidth = 1.4;
    c.beginPath(); c.arc(x, y, r * 0.96, la - 0.9, la + 0.9); c.stroke();
    c.strokeStyle = G(0.35); c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r * 0.76, la - 0.7, la + 0.7); c.stroke();
    c.strokeStyle = rgba(GLOW, 0.3 * g); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 0.25, y + Math.sin(ang) * r * 0.25); c.lineTo(x + Math.cos(ang) * r * 0.7, y + Math.sin(ang) * r * 0.7); c.stroke();
  }
}
/** Chicken-head pointer knob (rotary switch). */
function knobPointer(c, k, ang, mode, g = 1) {
  const { x, y, r } = k;
  const lx = LIGHT_T[0] - x, ly = LIGHT_T[1] - y, la = Math.atan2(ly, lx);
  const shape = () => {
    const tip = r * 2.0, tail = r * 1.05;
    const pts = [[tip, -r * 0.16], [tip + r * 0.12, 0], [tip, r * 0.16], [r * 0.5, r * 0.6], [0, r * 0.82], [-tail, r * 0.5], [-tail - r * 0.15, 0], [-tail, -r * 0.5], [0, -r * 0.82], [r * 0.5, -r * 0.6]];
    return smoothLoop(pts, 4).map((p) => { const q = rot2(p, ang); return [x + q[0], y + q[1]]; });
  };
  if (mode === 'amb') {
    const S = shape();
    c.save(); c.translate(3, 4);
    c.fillStyle = 'rgba(0,0,0,0.5)'; poly(c, S, true); c.fill();
    c.restore();
    // round skirt/base under the pointer
    c.fillStyle = rgrad(c, x - r * 0.4, y - r * 0.5, 0, x, y, r * 1.0, [[0, '#262626'], [1, '#0c0c0c']]);
    circ(c, x, y, r * 0.98); c.fill();
    c.fillStyle = lgrad(c, x - r, y - r, x + r, y + r, [[0, '#3a3a3a'], [0.45, '#1a1a1a'], [1, '#090909']]);
    poly(c, S, true); c.fill();
    // ridge sheen and the inlaid cream line
    const t1 = rot2([r * 1.75, 0], ang);
    c.strokeStyle = 'rgba(232,223,200,0.8)'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + rot2([r * 0.3, 0], ang)[0], y + rot2([r * 0.3, 0], ang)[1]); c.lineTo(x + t1[0], y + t1[1]); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1;
    poly(c, S.slice(0, Math.floor(S.length * 0.45)), false); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.08)'; circ(c, x - r * 0.15, y - r * 0.2, r * 0.3); c.fill();
  } else {
    const S = shape();
    c.save();
    poly(c, S, true); c.clip();
    c.strokeStyle = rgba(GLOW, 0.75 * g); c.lineWidth = 3.2;
    c.translate(-Math.cos(la) * 1.5, -Math.sin(la) * 1.5);
    poly(c, S, true); c.stroke();
    c.restore();
    c.fillStyle = rgba(GLOW, 0.12 * g); circ(c, x + Math.cos(la) * r * 0.3, y + Math.sin(la) * r * 0.3, r * 0.4); c.fill();
  }
}

// ------------------------------------------------------------------ static painting
const SANS = '"Hiragino Sans GB", "PingFang SC", sans-serif';
const ENG = 'Copperplate, "Copperplate Gothic", Didot, serif';
/** Every silkscreened marking (drawn as white into a mask). */
function paintSilk(c) {
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  c.textBaseline = 'alphabetic';
  const T = (txt, x, y, size, font, weight = 600, align = 'left', ls = 0) => {
    c.font = `${weight} ${size}px ${font}`; c.textAlign = align;
    c.letterSpacing = `${ls}px`;
    c.fillText(txt, x, y);
    c.letterSpacing = '0px';
  };
  // title block, top left
  T('示波器矢量图', 28, 52, 30, SANS, 600, 'left', 3);
  T('OSCILLOSCOPE · VECTOR GRAPHICS', 29, 70, 10.5, ENG, 700, 'left', 0.6);
  T('1950 年代  ·  1950s', 29, 87, 12, SANS, 500, 'left', 0.5);
  c.fillRect(29, 58, 176, 1.1);
  // knob legends + scales
  const scale = (k, a0, a1, n, rr) => {
    c.lineWidth = 1;
    for (let j = 0; j <= n; j++) {
      const a = lerp(a0, a1, j / n), L = j % 5 === 0 ? 5 : 3;
      c.beginPath(); c.moveTo(k.x + Math.cos(a) * rr, k.y + Math.sin(a) * rr); c.lineTo(k.x + Math.cos(a) * (rr + L), k.y + Math.sin(a) * (rr + L)); c.stroke();
    }
  };
  const I = KN.intensity;
  scale(I, Math.PI * 0.75, Math.PI * 2.25, 10, I.r * 1.45);
  T('辉度', I.x + 2, I.y - I.r * 1.45 - 16, 12, SANS, 600, 'center');
  T('INTENSITY', I.x + 2, I.y - I.r * 1.45 - 6.5, 7.5, ENG, 700, 'center', 0.4);
  const F = KN.focus;
  scale(F, Math.PI * 0.75, Math.PI * 2.25, 10, F.r * 1.45);
  T('聚焦 FOCUS', F.x - F.r * 1.45 - 8, F.y - 6, 11, SANS, 600, 'right');
  const M = KN.mode;
  T('模式', M.x + 46, M.y - 1, 12, SANS, 600, 'center');
  T('MODE', M.x + 46, M.y + 9, 7.5, ENG, 700, 'center', 0.5);
  for (const [a, lab] of [[MODE_YT, 'Y-T'], [MODE_XY, 'X-Y']]) {
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(M.x + Math.cos(a) * M.r * 2.25, M.y + Math.sin(a) * M.r * 2.25); c.lineTo(M.x + Math.cos(a) * M.r * 2.55, M.y + Math.sin(a) * M.r * 2.55); c.stroke();
    T(lab, M.x + Math.cos(a) * M.r * 3.0, M.y + Math.sin(a) * M.r * 3.0 + 3.5, 9, ENG, 700, 'center', 0.3);
  }
  T('电源', LAMP[0], LAMP[1] + 24, 10, SANS, 600, 'center');
  T('POWER', LAMP[0], LAMP[1] + 32.5, 6.5, ENG, 700, 'center', 0.4);
}
function paintPlate(c, mode) {
  const { x, y, w, h } = PLATE;
  if (mode === 'amb') {
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 2.5); c.fill();
    c.fillStyle = lgrad(c, x, y, x + w, y + h, [[0, '#6c6f70'], [0.45, '#55585a'], [0.55, '#606365'], [1, '#3e4143']]);
    c.beginPath(); c.roundRect(x, y, w, h, 2.5); c.fill();
    // brushed lines
    const r = prng('plate');
    c.lineWidth = 0.35;
    for (let k = 0; k < 60; k++) { const yy = y + 1 + r() * (h - 2); c.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${(0.04 + 0.06 * r()).toFixed(3)})`; c.beginPath(); c.moveTo(x + 1, yy); c.lineTo(x + w - 1, yy); c.stroke(); }
    c.fillStyle = '#121314';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = `700 11px ${ENG}`; c.letterSpacing = '0.6px'; c.fillText('PELICATRON', x + w / 2, y + 15); c.letterSpacing = '0px';
    c.font = `600 7px ${ENG}`; c.fillText('TYPE 51 · 示波器', x + w / 2, y + 26);
    c.fillRect(x + 12, y + 18.5, w - 24, 0.6);
    for (const sx of [x + 5, x + w - 5]) {
      c.fillStyle = rgrad(c, sx - 0.6, y + h / 2 - 0.6, 0, sx, y + h / 2, 2.4, [[0, '#9a9d9e'], [1, '#2a2c2d']]);
      circ(c, sx, y + h / 2, 2.3); c.fill();
    }
  } else {
    c.fillStyle = lgrad(c, x, y + h, x + w * 0.4, y, [[0, rgba(GLOW, 0.32)], [0.6, rgba(GLOW, 0.08)], [1, rgba(GLOW, 0)]]);
    c.beginPath(); c.roundRect(x, y, w, h, 2.5); c.fill();
    c.strokeStyle = rgba(GLOW, 0.4); c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x + 2, y + h); c.lineTo(x + w - 2, y + h); c.stroke();
  }
}
function paintLampHousing(c, mode) {
  const [x, y] = LAMP;
  if (mode === 'amb') {
    c.fillStyle = 'rgba(0,0,0,0.6)'; circ(c, x + 2, y + 3, 11); c.fill();
    c.fillStyle = rgrad(c, x - 3, y - 4, 0, x, y, 10, [[0, '#b9bcbd'], [0.5, '#505354'], [1, '#1a1b1c']]);
    circ(c, x, y, 9.5); c.fill();
    c.fillStyle = rgrad(c, x - 1.5, y - 2, 0, x, y, 6.5, [[0, '#5a1a0c'], [0.7, '#2a0904'], [1, '#160402']]);
    circ(c, x, y, 6.3); c.fill();
    // facets
    c.strokeStyle = 'rgba(255,190,150,0.12)'; c.lineWidth = 0.5;
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.stroke(); }
  } else {
    const la = Math.atan2(LIGHT_T[1] - y, LIGHT_T[0] - x);
    c.strokeStyle = rgba(GLOW, 0.5); c.lineWidth = 1.4;
    c.beginPath(); c.arc(x, y, 9, la - 1, la + 1); c.stroke();
  }
}
function graticuleLines() {
  const d = GRAT, x0 = CX - 5 * d, x1 = CX + 5 * d, y0 = CY - 4 * d, y1 = CY + 4 * d;
  const L = [];
  for (let i = 0; i <= 10; i++) L.push([x0 + i * d, y0, x0 + i * d, y1]);
  for (let j = 0; j <= 8; j++) L.push([x0, y0 + j * d, x1, y0 + j * d]);
  for (let k = -25; k <= 25; k++) if (k % 5) { const x = CX + (k * d) / 5; L.push([x, CY - 3.6, x, CY + 3.6]); }
  for (let k = -20; k <= 20; k++) if (k % 5) { const y = CY + (k * d) / 5; L.push([CX - 3.6, y, CX + 3.6, y]); }
  return L;
}

function paintStatic() {
  const S = BS, W = Math.round(1000 * S), H = W;
  const base = mk(W, H), spill = mk(W, H);
  const bc = c2d(base), sc = c2d(spill);
  // ---- per pixel: chrome ring, bezel lip, crinkle panel (glass is painted with gradients afterwards)
  const bimg = bc.createImageData(W, H), simg = sc.createImageData(W, H);
  const bd = bimg.data, sd = simg.data;
  const AL = [-0.42, -0.62, 0.66];             // room light (top left, toward the camera)
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / S, dy = y - CY;
    for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4;
      const x = (i + 0.5) / S, dx = x - CX;
      const r = Math.sqrt(dx * dx + dy * dy);
      sd[o + 3] = 255; bd[o + 3] = 255;
      if (r < RG - 2) continue;
      const rx = dx / r, ry = dy / r, th = Math.atan2(dy, dx);
      const ang = screenAngular(th);
      let b, sg;
      if (r < RCH) {                          // chrome trim: a polished bead
        const q = clamp((r - RG) / (RCH - RG));
        const psi = lerp(-1.25, 1.2, q), s2 = Math.sin(2 * psi), c2 = Math.cos(2 * psi);
        const spec = Math.pow(Math.max(0, s2 * rx * AL[0] + s2 * ry * AL[1] + c2 * AL[2]), 16);
        const v = 0.86 + 0.14 * vnoise(th * 160, q * 2, 5);
        const gg = (0.06 + 0.04 * c2 + 0.85 * spec) * v;
        b = [138 * gg + 9, 143 * gg + 9, 148 * gg + 10];
        const inward = clamp(-s2) * (1 - 0.35 * Math.abs(c2));
        const e = inward * inward * ang * v;
        sg = [57 * e + 60 * e * e, 255 * e, 122 * e + 50 * e * e];
      } else if (r < RBZ) {                   // moulded black lip
        const q = (r - RCH) / (RBZ - RCH);
        const psi = lerp(-0.85, 1.0, q), s2 = Math.sin(2 * psi), c2 = Math.cos(2 * psi);
        const spec = Math.pow(Math.max(0, s2 * rx * AL[0] + s2 * ry * AL[1] + c2 * AL[2]), 7);
        const l = 13 + 70 * spec + 6 * c2;
        b = [l, l, l * 1.02];
        const e = 0.45 * clamp(-s2) * ang;
        sg = [57 * e, 255 * e, 122 * e];
      } else {                                // black crinkle paint
        const h0 = crinkle(x, y), hx = crinkle(x + 0.3, y), hy = crinkle(x, y + 0.3);
        const gx = (hx - h0) / 0.3, gy = (hy - h0) / 0.3;
        const sh = clamp(0.5 + 0.55 * (gx * AL[0] + gy * AL[1]), 0, 1);
        const ao = 0.5 + 0.5 * smoothstep(RBZ, RBZ + 16, r);
        const l = (12 + 15 * sh + 5 * h0) * ao;
        b = [l, l, l * 1.03];
        const lx = LIGHT_T[0] - x, ly = LIGHT_T[1] - y, ll = Math.hypot(lx, ly);
        const rake = Math.max(0, (gx * lx + gy * ly) / ll * 0.75 + 0.12);
        const fall = Math.exp(-(r - RBZ) / 70) * (0.55 + 0.45 * ang);
        const e = (0.42 * rake + 0.06) * fall;
        sg = [57 * e, 255 * e, 122 * e];
      }
      bd[o] = b[0]; bd[o + 1] = b[1]; bd[o + 2] = b[2];
      sd[o] = sg[0]; sd[o + 1] = sg[1]; sd[o + 2] = sg[2];
    }
  }
  bc.putImageData(bimg, 0, 0);
  sc.putImageData(simg, 0, 0);
  bc.setTransform(S, 0, 0, S, 0, 0);
  sc.setTransform(S, 0, 0, S, 0, 0);

  // ---- the glass
  bc.save();
  circ(bc, CX, CY, RG + 0.3); bc.clip();
  bc.fillStyle = rgrad(bc, CX - 40, CY - 60, 0, CX, CY, RG, [[0, '#05140c'], [0.55, '#04100a'], [0.85, '#030b06'], [0.97, '#020704'], [1, '#010402']]);
  bc.fillRect(0, 0, 1000, 1000);
  {
    const r = prng('grain');
    for (let k = 0; k < 14000; k++) {
      const a = r() * TAU, rr = Math.sqrt(r()) * RG;
      bc.fillStyle = r() < 0.5 ? 'rgba(40,80,55,0.07)' : 'rgba(0,0,0,0.12)';
      bc.fillRect(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 0.7, 0.7);
    }
  }
  // engraved graticule: groove shadow, then the engraving catching a little light
  const GL = graticuleLines();
  bc.lineCap = 'butt';
  bc.strokeStyle = 'rgba(0,0,0,0.55)'; bc.lineWidth = 1.4;
  for (const l of GL) { bc.beginPath(); bc.moveTo(l[0] + 0.5, l[1] + 0.6); bc.lineTo(l[2] + 0.5, l[3] + 0.6); bc.stroke(); }
  bc.strokeStyle = 'rgba(30,58,42,0.85)'; bc.lineWidth = 0.95;
  for (const l of GL) { bc.beginPath(); bc.moveTo(l[0], l[1]); bc.lineTo(l[2], l[3]); bc.stroke(); }
  bc.strokeStyle = 'rgba(90,140,110,0.16)'; bc.lineWidth = 0.4;
  for (const l of GL) { bc.beginPath(); bc.moveTo(l[0] - 0.3, l[1] - 0.3); bc.lineTo(l[2] - 0.3, l[3] - 0.3); bc.stroke(); }
  // dust and a fibre
  {
    const r = prng('dust');
    for (let k = 0; k < 70; k++) {
      const a = r() * TAU, rr = Math.sqrt(r()) * (RG - 10);
      bc.fillStyle = `rgba(110,140,120,${(0.05 + 0.12 * r()).toFixed(3)})`;
      circ(bc, CX + Math.cos(a) * rr, CY + Math.sin(a) * rr, 0.35 + r() * 0.9); bc.fill();
    }
    bc.strokeStyle = 'rgba(120,150,130,0.10)'; bc.lineWidth = 0.6;
    bc.beginPath(); bc.moveTo(642, 352); bc.bezierCurveTo(660, 340, 668, 361, 690, 349); bc.stroke();
  }
  // phosphor edge: the coating darkens toward the rim
  bc.strokeStyle = rgrad(bc, CX, CY, RG - 26, CX, CY, RG, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);
  bc.lineWidth = 26; circ(bc, CX, CY, RG - 13); bc.stroke();
  bc.restore();
  // grooves between glass, chrome, lip and panel
  for (const [rr, w, a] of [[RG, 1.6, 0.9], [RCH, 1.0, 0.7], [RBZ, 1.3, 0.6]]) { bc.strokeStyle = `rgba(0,0,0,${a})`; bc.lineWidth = w; circ(bc, CX, CY, rr); bc.stroke(); }
  // glass glow in the spill layer (the coating scatters the beam's light a little everywhere)
  sc.save();
  circ(sc, CX, CY, RG); sc.clip();
  sc.fillStyle = rgrad(sc, LIGHT_T[0], LIGHT_T[1] + 40, 0, LIGHT_T[0], LIGHT_T[1] + 40, 700, [[0, rgba(GLOW, 0.055)], [0.5, rgba(GLOW, 0.02)], [1, rgba(GLOW, 0.005)]]);
  sc.fillRect(0, 0, 1000, 1000);
  sc.strokeStyle = rgba(GLOW, 0.022); sc.lineWidth = 1;
  for (const l of GL) { sc.beginPath(); sc.moveTo(l[0], l[1]); sc.lineTo(l[2], l[3]); sc.stroke(); }
  sc.restore();

  // ---- silkscreen (mask → cream in room light, green in screen light), worn a little
  const silk = mk(W, H), mc = c2d(silk);
  mc.setTransform(S, 0, 0, S, 0, 0);
  paintSilk(mc);
  {
    mc.globalCompositeOperation = 'destination-out';
    const r = prng('wear');
    for (let k = 0; k < 2600; k++) {
      const x = r() * 1000, y = r() < 0.85 ? r() * 200 : 900 + r() * 100;
      mc.fillStyle = `rgba(0,0,0,${(0.3 + 0.7 * r()).toFixed(2)})`;
      circ(mc, x, y, 0.25 + r() * 0.5); mc.fill();
    }
    mc.globalCompositeOperation = 'source-over';
  }
  const tinted = (style) => {
    const t = mk(W, H), tc = c2d(t);
    tc.drawImage(silk, 0, 0);
    tc.globalCompositeOperation = 'source-in';
    tc.setTransform(S, 0, 0, S, 0, 0);
    tc.fillStyle = style(tc); tc.fillRect(0, 0, 1000, 1000);
    return t;
  };
  bc.save(); bc.setTransform(1, 0, 0, 1, 0, 0);
  bc.globalAlpha = 0.6; bc.drawImage(tinted(() => '#e8dfc8'), 0, 0);
  bc.restore();
  sc.save(); sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalCompositeOperation = 'lighter';
  sc.drawImage(tinted((tc) => rgrad(tc, CX, CY, RBZ, CX, CY, RBZ + 300, [[0, 'rgba(120,255,160,0.55)'], [0.4, 'rgba(90,255,140,0.22)'], [1, 'rgba(70,255,130,0.05)']])), 0, 0);
  sc.restore();

  // ---- hardware: static knob, plate, lamp housing
  knobRound(bc, KN.intensity, Math.PI * 1.35, 'amb');
  sc.save(); sc.globalCompositeOperation = 'lighter'; knobRound(sc, KN.intensity, Math.PI * 1.35, 'green', 0.7); sc.restore();
  paintPlate(bc, 'amb');
  sc.save(); sc.globalCompositeOperation = 'lighter'; paintPlate(sc, 'green'); sc.restore();
  paintLampHousing(bc, 'amb');
  sc.save(); sc.globalCompositeOperation = 'lighter'; paintLampHousing(sc, 'green'); sc.restore();
  // cropped knobs peeking at the bottom corners (SWEEP, X/Y gain)
  for (const k of [{ x: 12, y: 1000, r: 22 }, { x: 988, y: 1000, r: 22 }]) {
    knobRound(bc, k, -1.2, 'amb');
    sc.save(); sc.globalCompositeOperation = 'lighter'; knobRound(sc, k, -1.2, 'green', 0.8); sc.restore();
  }
  return { base, spill };
}

function paintReflection(c, S) {
  c.setTransform(S, 0, 0, S, 0, 0);
  c.save();
  circ(c, CX, CY, RG); c.clip();
  // a soft highlight arc: the window of the lab, mirrored in the curved faceplate
  c.filter = `blur(${(16 * S).toFixed(1)}px)`;
  c.strokeStyle = 'rgba(190,215,205,0.085)'; c.lineWidth = 40;
  c.beginPath(); c.arc(CX + 24, CY + 34, RG - 78, Math.PI * 1.06, Math.PI * 1.43); c.stroke();
  c.filter = `blur(${(5 * S).toFixed(1)}px)`;
  c.strokeStyle = 'rgba(225,240,232,0.07)'; c.lineWidth = 9;
  c.beginPath(); c.arc(CX + 24, CY + 34, RG - 66, Math.PI * 1.09, Math.PI * 1.38); c.stroke();
  c.filter = 'none';
  c.fillStyle = rgrad(c, 300, 230, 0, 300, 230, 520, [[0, 'rgba(150,180,165,0.03)'], [1, 'rgba(150,180,165,0)']]);
  c.fillRect(0, 0, 1000, 1000);
  c.restore();
}

// ------------------------------------------------------------------ the scene
const PASSES_ON = [
  { w: 6, a: 0.04, col: GLOW },
  { w: 2.5, a: 0.15, col: GLOW },
  { w: 1.0, a: 1.0, col: CORE },
];
const PASSES_OFF = [
  { w: 12, a: 0.035, col: GLOW },
  { w: 5.5, a: 0.11, col: GLOW },
  { w: 2.4, a: 0.3, col: CORE },
];

export default {
  freezeU: 2.2,
  ride: RIDE,
  cues: [
    { u: 0.0, name: 'powerOn' }, { u: 1.5, name: 'reachKnob' }, { u: 2.0, name: 'knob' },
    { u: 2.5, name: 'snapBack' }, { u: 3.0, name: 'knobBack' },
  ],

  async init(K) {
    const { base, spill } = paintStatic();
    const toFb = (key, cv) => {
      const g = createGraphics(cv.width, cv.height); g.pixelDensity(1);
      g.drawingContext.drawImage(cv, 0, 0);
      const fb = K.bake(key, cv.width, cv.height, () => { imageMode(CORNER); image(g, 0, 0, cv.width, cv.height); });
      g.remove();
      return fb;
    };
    this.base = toFb('base', base);
    this.spill = toFb('spill', spill);
    const rs = 0.8, rc = mk(1000 * rs, 1000 * rs);
    paintReflection(c2d(rc), rs);
    this.refl = toFb('refl', rc);
    // dwell-dot sprite and a soft haze sprite
    const dot = mk(64, 64), dc = c2d(dot);
    dc.fillStyle = rgrad(dc, 32, 32, 0, 32, 32, 32, [[0, 'rgba(235,255,240,1)'], [0.12, 'rgba(200,255,215,0.9)'], [0.32, 'rgba(57,255,122,0.32)'], [0.65, 'rgba(57,255,122,0.07)'], [1, 'rgba(57,255,122,0)']]);
    dc.fillRect(0, 0, 64, 64);
    this.dot = dot;
    const hz = mk(256, 256), hc = c2d(hz);
    hc.fillStyle = rgrad(hc, 128, 128, 0, 128, 128, 128, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    hc.fillRect(0, 0, 256, 256);
    this.haze = toFb('haze', hz);
    const vg = mk(512, 512), vc = c2d(vg);
    vc.fillStyle = rgrad(vc, 256, 270, 150, 256, 270, 400, [[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0.42)']]);
    vc.fillRect(0, 0, 512, 512);
    this.vign = toFb('vign', vg);
    // live canvases
    this.beamG = createGraphics(1100, 1100); this.beamG.pixelDensity(1);
    this.bloomA = createGraphics(280, 280); this.bloomA.pixelDensity(1);
    this.bloomB = createGraphics(140, 140); this.bloomB.pixelDensity(1);
    this.handG = createGraphics(Math.ceil((HR.x1 - HR.x0) * 1.6) + 4, Math.ceil((HR.y1 - HR.y0) * 1.6) + 4); this.handG.pixelDensity(1);
    this.scratch = [0, 1, 2].map(() => mk(this.handG.width, this.handG.height));
  },

  dispose() {
    for (const g of [this.beamG, this.bloomA, this.bloomB, this.handG]) try { g?.remove(); } catch {}
    this.beamG = this.bloomA = this.bloomB = this.handG = null;
  },

  mods() { return { spokes: 8 }; },

  render(K, u, ctx) {
    const P = power(u);
    const spill = clamp(0.55 * P.B * (1 + 0.45 * flare(u)), 0, 1);
    push();
    imageMode(CORNER); noStroke();
    blendMode(BLEND); noTint();
    image(this.base, 0, 0, 1000, 1000);
    blendMode(ADD);
    tint(255, 255 * spill);
    image(this.spill, 0, 0, 1000, 1000);
    // pilot lamp
    tint(255, 110, 40, 255 * clamp(0.55 * P.lamp));
    image(this.haze, LAMP[0] - 16, LAMP[1] - 16, 32, 32);
    tint(255, 200, 150, 255 * clamp(0.5 * P.lamp));
    image(this.haze, LAMP[0] - 5, LAMP[1] - 5, 10, 10);
    tint(255, 120, 60, 255 * clamp(0.12 * P.lamp));
    image(this.haze, LAMP[0] - 60, LAMP[1] - 60, 120, 120);
    noTint();
    this.drawBeam(K, u, ctx, P);
    // power-on flash (the whole faceplate lights up for a moment), and a smaller one when the switch clicks to X-Y
    const hz = 0.42 * P.flash + (u >= 2.0 ? 0.16 * Math.exp(-(u - 2.0) / 0.09) : 0);
    if (hz > 0.004) {
      tint(GLOW[0], GLOW[1], GLOW[2], 255 * clamp(hz));
      image(this.haze, CX - 640, CY - 560, 1280, 1120);
    }
    noTint();
    image(this.refl, 0, 0, 1000, 1000);
    blendMode(BLEND);
    this.drawHand(K, u, ctx, spill);
    image(this.vign, 0, 0, 1000, 1000);
    pop();
  },

  // ---------------------------------------------------------------- the beam
  drawBeam(K, u, ctx, P) {
    const v = ctx.view;
    const rx0 = Math.max(0, v.x0), rx1 = Math.min(1000, v.x1), ry0 = Math.max(0, v.y0), ry1 = Math.min(1000, v.y1);
    if (rx1 <= rx0 || ry1 <= ry0) return;
    const G = this.beamG;
    let S = ctx.pxu;
    let ox = v.x0 + Math.floor((rx0 - v.x0) * S) / S, oy = v.y0 + Math.floor((ry0 - v.y0) * S) / S;
    if ((rx1 - ox) * S > G.width - 2 || (ry1 - oy) * S > G.height - 2) {
      S = Math.min((G.width - 2) / (rx1 - rx0), (G.height - 2) / (ry1 - ry0));
      ox = rx0; oy = ry0;
    }
    const pw = Math.min(G.width, Math.ceil((rx1 - ox) * S) + 1), ph = Math.min(G.height, Math.ceil((ry1 - oy) * S) + 1);
    const c = G.drawingContext;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, G.width, G.height);                 // the whole canvas: nothing may accumulate between frames
    c.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    c.save();
    circ(c, CX, CY, RG - 0.5); c.clip();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round'; c.lineJoin = 'round';

    const f = Math.round(ctx.t * 30);
    const jx = (rnd('jx', f) - 0.5) * 0.7, jy = (rnd('jy', f) - 0.5) * 0.5;
    const flick = 0.96 + 0.08 * rnd('fl', f);
    const B = P.B * flick;
    const foc = P.foc;
    const passes = PASSES_ON.map((p, k) => ({
      w: lerp(p.w, PASSES_OFF[k].w, foc), a: lerp(p.a, PASSES_OFF[k].a, foc), col: p.col,
    }));
    c.translate(jx, jy);

    const strokeSet = (list, pass, gain, jit) => {
      c.lineWidth = pass.w;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const a = s.a * pass.a * gain;
        if (a < 0.003) continue;
        c.strokeStyle = rgba(pass.col, a);
        if (jit) { const dx = (rnd('px', f, i) - 0.5) * 0.45, dy = (rnd('py', f, i) - 0.5) * 0.45; c.translate(dx, dy); poly(c, s.pts, s.closed); c.stroke(); c.translate(-dx, -dy); }
        else { poly(c, s.pts, s.closed); c.stroke(); }
      }
    };
    const dots = (list, gain, size) => {
      for (const d of list) {
        const a = d[2] * gain;
        if (a < 0.01) continue;
        const sz = size * (0.7 + 0.5 * Math.min(1, a));
        c.globalAlpha = clamp(a);
        c.drawImage(this.dot, d[0] - sz / 2, d[1] - sz / 2, sz, sz);
      }
      c.globalAlpha = 1;
    };

    // ---- test lettering: on screen in standby, fades after power-on, re-written by the beam once the rider has gone
    if (v.y0 < 380) {
      const textA = u < 0 ? 0.55 : (u < 1.0 ? 0.55 * (1 + 2.5 * P.flash) * (1 - smoothstep(0.15, 0.9, u)) : 0);
      if (textA > 0.004) for (const pass of passes) strokeSet(TEXT_1950, pass, textA * B, false);
      if (u > 7.5) {
        const W = writeText(clamp((u - 7.6) / 1.3));
        for (const pass of passes) strokeSet(W.strokes, pass, 0.42 * B, false);
        if (W.pen) dots([[W.pen[0], W.pen[1], 0.9]], B, 12);
      }
    }

    // ---- the trace
    {
      const N = 33, pts = [];
      for (let x = -20; x <= 1020; x += 4) pts.push([x, traceY(x, u, ctx.t)]);
      for (const pass of passes) {
        const g = c.createLinearGradient(-20, 0, 1020, 0);
        for (let k = 0; k < N; k++) {
          const x = -20 + (1040 * k) / (N - 1);
          g.addColorStop(k / (N - 1), rgba(pass.col, traceA(x, u) * pass.a * flick));
        }
        c.strokeStyle = g; c.lineWidth = pass.w;
        poly(c, pts, false); c.stroke();
      }
      // sweep spot, pulse, spike heads
      const heads = [];
      if (!(u >= 2.0 && u < 3.0)) {
        const period = u < 0 ? 2.0 : 0.5, ph = ((u / period) % 1 + 1) % 1, xs = -20 + 1040 * ph;
        heads.push([xs, traceY(xs, u, ctx.t), 0.7 * B]);
      }
      if (u > 0.15 && u < 0.62) { const xp = (u - 0.15) / 0.45 * 1000; heads.push([xp, traceY(xp, u, ctx.t), 1.8 * B]); heads.push([xp - 6, traceY(xp - 6, u, ctx.t), 1.0 * B]); }
      if (u > 3.0 && u < 3.45) { const xs = -20 + (u - 3.0) / 0.42 * 1040; heads.push([xs, traceY(xs, u, ctx.t), 0.9]); }
      dots(heads, 1, u < 0 ? 22 : 16);
    }

    // ---- the rider: persistence tails first, then the fresh vectors
    const T = trailSpec(u);
    for (let k = T.n; k >= 1; k--) {
      const dt = k * T.dt, uS = u - dt;
      const R = ctx.riderAt(ctx.t - dt);
      if (!R.visible) continue;
      const Vk = beamAt(R, uS);
      const PS = power(uS);
      const gain = 0.32 * Math.exp(-dt / T.tau) * PS.B;
      strokeSet(Vk.strokes, { w: lerp(1.8, 5, PS.foc), a: 1, col: PERS }, gain, false);
    }
    if (ctx.rider.visible) {
      const V = beamAt(ctx.rider, u);
      for (const pass of passes) strokeSet(V.strokes, pass, B, true);
      dots(V.dots, B, lerp(9, 16, foc));
    }
    c.restore();

    // ---- bloom: two blurred mip levels of the beam canvas
    const A = this.bloomA, Bb = this.bloomB;
    const wa = Math.ceil(pw / 4), ha = Math.ceil(ph / 4), wb = Math.ceil(pw / 8), hb = Math.ceil(ph / 8);
    const ac = A.drawingContext, bc = Bb.drawingContext;
    ac.setTransform(1, 0, 0, 1, 0, 0); ac.globalCompositeOperation = 'source-over'; ac.filter = 'none';
    ac.fillStyle = '#000'; ac.fillRect(0, 0, A.width, A.height);
    ac.imageSmoothingQuality = 'high';
    ac.filter = 'blur(1.3px)';
    ac.globalCompositeOperation = 'lighter';
    ac.drawImage(c.canvas, 0, 0, pw, ph, 0, 0, wa, ha);
    ac.drawImage(c.canvas, 0, 0, pw, ph, 0, 0, wa, ha);
    ac.filter = 'none'; ac.globalCompositeOperation = 'source-over';
    bc.setTransform(1, 0, 0, 1, 0, 0); bc.globalCompositeOperation = 'source-over'; bc.filter = 'none';
    bc.fillStyle = '#000'; bc.fillRect(0, 0, Bb.width, Bb.height);
    bc.imageSmoothingQuality = 'high';
    bc.filter = 'blur(2px)';
    bc.globalCompositeOperation = 'lighter';
    bc.drawImage(ac.canvas, 0, 0, wa, ha, 0, 0, wb, hb);
    bc.drawImage(ac.canvas, 0, 0, wa, ha, 0, 0, wb, hb);
    bc.filter = 'none'; bc.globalCompositeOperation = 'source-over';

    // ---- add everything onto the panel
    image(G, ox, oy, pw / S, ph / S, 0, 0, pw, ph);
    const kb = lerp(1, 1.6, foc);
    tint(255, 255 * clamp(0.6 * kb));
    image(A, ox, oy, (wa * 4) / S, (ha * 4) / S, 0, 0, wa, ha);
    tint(255, 255 * clamp(0.5 * kb));
    image(Bb, ox, oy, (wb * 8) / S, (hb * 8) / S, 0, 0, wb, hb);
    noTint();
  },

  // ---------------------------------------------------------------- hand + knobs it touches
  drawHand(K, u, ctx, g) {
    const v = ctx.view;
    if (v.x1 < HR.x0 || v.y0 > HR.y1) return;
    const S = Math.min(1.6, Math.max(0.5, ctx.pxu));
    const G = this.handG, c = G.drawingContext;
    const pw = Math.ceil((HR.x1 - HR.x0) * S), ph = Math.ceil((HR.y1 - HR.y0) * S);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.clearRect(0, 0, G.width, G.height);
    c.setTransform(S, 0, 0, S, -HR.x0 * S, -HR.y0 * S);
    // knobs
    const fa = focusAngle(u), ma = modeAngle(u);
    knobRound(c, KN.focus, fa, 'amb');
    knobPointer(c, KN.mode, ma, 'amb');
    c.save(); c.globalCompositeOperation = 'lighter';
    knobRound(c, KN.focus, fa, 'green', g * 0.9);
    knobPointer(c, KN.mode, ma, 'green', g * 0.9);
    c.restore();
    // the hand (nearer the lens than the panel: soft, dark, rim-lit by the screen)
    const H = handState(u);
    if (H.x < HR.x1 + 140) paintHand(c, this.scratch, [S, HR.x0, HR.y0], H, g, ctx.t);
    image(G, HR.x0, HR.y0, pw / S, ph / S, 0, 0, pw, ph);
  },
};
