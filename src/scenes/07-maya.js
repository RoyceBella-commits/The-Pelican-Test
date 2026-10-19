// 07 · 玛雅抄本 / Maya Codex · c. 1200
//
// A page of a Postclassic Maya screenfold in the manner of the Dresden Codex — an original composition with
// invented glyphs. Lime stucco over bark paper, red register bands, a heavy black contour and flat Maya blue,
// red and yellow-orange. A rain deity on a sky band pours from its jar; a monkey scribe on a throne tallies the
// pelican's pedal revolutions in bar-and-dot numerals (base 20, two vertical places, a shell for zero).
//
// Technique (deterministic; everything static is built once in init):
//   • the stucco ground is per-pixel (tone, plaster smears, grain); page edges, the fold to the previous page,
//     flaking losses that show the brown bark paper, pits and a craquelure;
//   • every painted shape is drawn with Canvas2D, then AGED: blurred and re-thresholded against a noise tile
//     (hand-painted edges) and worn by a page-aligned pigment-wear tile before it is laid into the stucco;
//   • everything that moves (deity, scribe, glyphs, numeral parts, the water stream) is an aged sprite in one
//     atlas, switched on beats; the numerals are assembled live from bar / dot / shell sprites;
//   • the pelican is painted live with Canvas2D in the same palette and contour and worn by the same tile;
//   • two sheet overlays sit over everything: MULTIPLY (grain, cracks, fold crease, grime) and the losses
//     (bark + backdrop), so live paint sinks into the same damaged surface.
// The counter is exact: shown = ⌊crank / 2π⌋ (= 36 + u with no hold), so every dot lands on a beat and
// 39 → 40 rolls on the u = 4 downbeat. 0 live p5.brush marks.
import { rng, smoothPath, ribbon } from '../kit/math.js';

const ID = 'maya';
const S = 1.5;                      // px per panel unit for every raster in this panel
const N = Math.round(1000 * S);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ palette
const C = {
  stucco: '#efe6cf', bark: '#8a6a46', blue: '#4f9cb3', red: '#b23a26', yellow: '#e0a03a', black: '#1c1712',
  white: '#f6efdd', paleY: '#f0dca8', paleB: '#bcd9df', far: '#8a2c1c', backdrop: '#231c17',
};
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ layout (panel units)
const FOLD = 86;
const L = {
  bandTop: [34, 42], bandReg: [232, 240], road: [800, 830], bandBot: [946, 954],
  title: { x0: 106, y0: 54, x1: 518, y1: 220 },
  eng: { x0: 530, x1: 608, y0: 58, y1: 218 },
  vband: [618, 626],
  text: { x0: 638, x1: 988, rows: [[60, 140], [148, 228]] },
  sky: { x0: 108, x1: 346, y0: 462, y1: 490 },
  deity: { x: 236, y: 462, s: 1.14 },
  name: { cx: 412, cy: 324, size: 124 },
  counter: { x0: 612, x1: 718, y0: 258, y1: 472 },
  monkey: { x: 836, y: 604, s: 1.25 },
  bench: { x0: 760, x1: 944, y0: 604, y1: 800 },
  days: { y: 884 },
};
// the counter's two cells (20s on top, units below)
const CELL = (() => {
  const c = L.counter, pad = 6, gap = 6;
  const h = (c.y1 - c.y0 - 2 * pad - gap) / 2;
  const x0 = c.x0 + pad, x1 = c.x1 - pad;
  return {
    top: { x0, x1, y0: c.y0 + pad, y1: c.y0 + pad + h, cx: (x0 + x1) / 2, cy: c.y0 + pad + h / 2 },
    bot: { x0, x1, y0: c.y1 - pad - h, y1: c.y1 - pad, cx: (x0 + x1) / 2, cy: c.y1 - pad - h / 2 },
  };
})();

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
function fbm(x, y, s, oct = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x, y, s + o * 131); norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03; }
  return sum / norm;
}
const sm = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const win = (a, b, x, r) => sm(a, a + r, x) * (1 - sm(b - r, b, x));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t, s = 1.7) => { t = clamp01(t); const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };

/** Low-frequency field sampled every `step` px and bilinearly upsampled to w×h (fn gets px coords). */
function coarse(w, h, step, fn) {
  const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2;
  const G = new Float32Array(gw * gh);
  for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) G[gj * gw + gi] = fn(gi * step, gj * step);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const fy = j / step, gj = Math.floor(fy), ty = fy - gj;
    for (let i = 0; i < w; i++) {
      const fx = i / step, gi = Math.floor(fx), tx = fx - gi;
      const o = gj * gw + gi;
      const a = G[o], b = G[o + 1], c = G[o + gw], d = G[o + gw + 1];
      out[j * w + i] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/** 256² periodic noise tile (edge raggedness of the painted line; sampled with & 255). */
let TILE = null;
function tile() {
  if (TILE) return TILE;
  const T = 256;
  TILE = new Float32Array(T * T);
  const pv = (x, y, P, s) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const w = (a) => ((a % P) + P) % P;
    const a = hash3(w(ix), w(iy), s), b = hash3(w(ix + 1), w(iy), s), c = hash3(w(ix), w(iy + 1), s), d = hash3(w(ix + 1), w(iy + 1), s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    TILE[j * T + i] = 0.45 * pv(i / 16, j / 16, 16, 3) + 0.3 * pv(i / 6, j / 6, 43, 4) + 0.25 * hash3(i, j, 6);
  }
  return TILE;
}

/** 512² periodic pigment-wear tile (0..255): pinpoint flecks, short scratches, rubbed zones. */
let WEAR = null;
function wearTile() {
  if (WEAR) return WEAR;
  const T = 512, A = new Float32Array(T * T);
  const R = rng(`${ID}-wear`);
  for (let k = 0; k < 4200; k++) {
    const cx = R() * T, cy = R() * T, r = 0.6 + R() * R() * 3.2, v = 0.55 + R() * 0.45;
    const rr = Math.ceil(r + 1);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      const d = Math.hypot(dx + (cx % 1) - 0.5, dy + (cy % 1) - 0.5) / r;
      if (d >= 1.25) continue;
      const i = ((Math.floor(cx) + dx) % T + T) % T, j = ((Math.floor(cy) + dy) % T + T) % T;
      A[j * T + i] = Math.max(A[j * T + i], v * sm(1.25, 0.8, d));
    }
  }
  for (let k = 0; k < 220; k++) {   // short scratches
    let x = R() * T, y = R() * T; const a = (R() - 0.5) * 0.6 + (R() < 0.5 ? 0 : Math.PI / 2), L = 4 + R() * 16;
    for (let s = 0; s < L; s++) { const i = ((Math.floor(x) % T) + T) % T, j = ((Math.floor(y) % T) + T) % T; A[j * T + i] = Math.max(A[j * T + i], 0.6); x += Math.cos(a); y += Math.sin(a); }
  }
  const pv = (x, y, P, s) => { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const w = (q) => ((q % P) + P) % P; const a = hash3(w(ix), w(iy), s), b = hash3(w(ix + 1), w(iy), s), c = hash3(w(ix), w(iy + 1), s), d = hash3(w(ix + 1), w(iy + 1), s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const z = 0.65 * pv(i / 64, j / 64, 8, 21) + 0.35 * pv(i / 16, j / 16, 32, 22);
    const o = j * T + i;
    A[o] = Math.min(1, A[o] + 0.32 * sm(0.6, 0.8, z) * (0.5 + 0.5 * hash3(i, j, 23)));
  }
  WEAR = A;
  return A;
}
let WEARCV = null;
function wearCanvas() {
  if (WEARCV) return WEARCV;
  const W = wearTile(), T = 512;
  const cv = mkCanvas(T, T), x = ctx2d(cv);
  const id = x.createImageData(T, T);
  for (let k = 0; k < T * T; k++) { id.data[k * 4 + 3] = Math.round(255 * Math.min(1, W[k] * 0.85)); }
  x.putImageData(id, 0, 0);
  WEARCV = cv;
  return cv;
}

// ------------------------------------------------------------------ Canvas2D helpers
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

function pathCR(x, P, closed = true) {
  const n = P.length;
  x.moveTo(P[0][0], P[0][1]);
  const Lm = closed ? n : n - 1;
  for (let i = 0; i < Lm; i++) {
    const p0 = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)];
    const p1 = P[i], p2 = P[(i + 1) % n];
    const p3 = closed ? P[(i + 2) % n] : P[Math.min(n - 1, i + 2)];
    x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) x.closePath();
}
function polyPath(x, P, closed = true) { x.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length; k++) x.lineTo(P[k][0], P[k][1]); if (closed) x.closePath(); }
function fs(x, col, lw, lc = C.black) {
  if (col) { x.fillStyle = col; x.fill(); }
  if (lw) { x.lineWidth = lw; x.strokeStyle = lc; x.lineJoin = 'round'; x.stroke(); }
}
/** Closed shape: smooth (Catmull-Rom) or polygon, filled and contoured. */
function shp(x, P, col, lw, smooth = true) { x.beginPath(); if (smooth) pathCR(x, P, true); else polyPath(x, P, true); fs(x, col, lw); }
function circ(x, cx, cy, r, col, lw) { x.beginPath(); x.arc(cx, cy, Math.max(0.1, r), 0, TAU); fs(x, col, lw); }
function ell(x, cx, cy, rx, ry, rot, col, lw) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); fs(x, col, lw); }
/** Open stroke. */
function stroke(x, P, lw, col = C.black, smooth = true, cap = 'round') {
  x.beginPath(); if (smooth && P.length > 2) pathCR(x, P, false); else polyPath(x, P, false);
  x.lineCap = cap; x.lineJoin = 'round'; x.lineWidth = lw; x.strokeStyle = col; x.stroke(); x.lineCap = 'round';
}
/** Outlined tube (limb, band): a black stroke under a coloured one, round caps. */
function tube(x, P, w, col, lw, smooth = true) {
  stroke(x, P, w + 2 * lw, C.black, smooth);
  if (col) stroke(x, P, w, col, smooth);
}
/** Rounded "cartouche" (superellipse) outline points. */
function cart(cx, cy, hw, hh, seed = 0, n = 4.2, jit = 0.9, steps = 30) {
  const P = [];
  for (let k = 0; k < steps; k++) {
    const t = (k / steps) * TAU, c = Math.cos(t), s = Math.sin(t);
    const px = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), py = hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const j = (vnoise(k * 0.9, seed * 1.7, 5) - 0.5) * 2 * jit;
    P.push([cx + px + j * Math.sign(c) * 0.6, cy + py + j * Math.sign(s) * 0.6]);
  }
  return P;
}
/** Leaf / feather shape from base to tip (width w at the widest point). */
function leaf(base, tip, w, bend = 0.15) {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const P = [];
  const side = (s) => { const out = []; for (let k = 0; k <= 6; k++) { const t = k / 6; const wv = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * 0.5 * s; const b = Math.sin(Math.PI * t) * L * bend; out.push([base[0] + dx * t + nx * (wv + b), base[1] + dy * t + ny * (wv + b)]); } return out; };
  const a = side(1), b = side(-1).reverse();
  return a.concat(b.slice(1, -1));
}

// ------------------------------------------------------------------ glyph library (local block: −50 … 50)
const LWB = 4.2, LWI = 3.0, LWF = 2.0;

/** Bar-and-dot numeral n (1..19) in a box, horizontal bars (vertical = bars stand upright: coefficients). */
function numeral(x, n, cx, cy, w, h, vertical, col, lw = LWF) {
  const bars = Math.floor(n / 5), dots = n % 5;
  if (!vertical) {
    const bh = h * 0.16, bg = h * 0.07, dr = h * 0.085;
    const H = bars * bh + Math.max(0, bars - 1) * bg + (dots ? 2 * dr + (bars ? bg : 0) : 0);
    let y = cy - H / 2;
    if (dots) { for (let k = 0; k < dots; k++) circ(x, cx + (k - (dots - 1) / 2) * dr * 2.5, y + dr, dr, col, lw); y += 2 * dr + bg; }
    for (let b = 0; b < bars; b++) { shp(x, [[cx - w / 2, y], [cx + w / 2, y], [cx + w / 2, y + bh], [cx - w / 2, y + bh]], col, lw, false); y += bh + bg; }
  } else {
    const bw = w * 0.2, bg = w * 0.1, dr = w * 0.1;
    const W = bars * bw + Math.max(0, bars - 1) * bg + (dots ? 2 * dr + (bars ? bg : 0) : 0);
    let xx = cx - W / 2;
    if (dots) { for (let k = 0; k < dots; k++) circ(x, xx + dr, cy + (k - (dots - 1) / 2) * dr * 2.5, dr, col, lw); xx += 2 * dr + bg; }
    for (let b = 0; b < bars; b++) { shp(x, [[xx, cy - h / 2], [xx + bw, cy - h / 2], [xx + bw, cy + h / 2], [xx, cy + h / 2]], col, lw, false); xx += bw + bg; }
  }
}

/** Main signs: draw inside a cartouche centred (cx, cy) of half-size r (already clipped by the caller). */
const SIGNS = {
  kin(x, cx, cy, r, f) {
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; ell(x, cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.38, r * 0.2, a, f.a || C.yellow, LWI); }
    circ(x, cx, cy, r * 0.24, f.b || C.red, LWI);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; circ(x, cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, r * 0.075, C.black, 0); }
  },
  ik(x, cx, cy, r, f) {
    if (f.a) circ(x, cx, cy, r * 0.82, f.a, 0);
    shp(x, [[cx - 0.52 * r, cy - 0.5 * r], [cx + 0.52 * r, cy - 0.5 * r], [cx + 0.52 * r, cy - 0.2 * r], [cx + 0.17 * r, cy - 0.2 * r], [cx + 0.17 * r, cy + 0.52 * r], [cx - 0.17 * r, cy + 0.52 * r], [cx - 0.17 * r, cy - 0.2 * r], [cx - 0.52 * r, cy - 0.2 * r]], C.black, 0, false);
    circ(x, cx - 0.52 * r, cy + 0.38 * r, r * 0.11, C.black, 0); circ(x, cx + 0.52 * r, cy + 0.38 * r, r * 0.11, C.black, 0);
  },
  akbal(x, cx, cy, r, f) {
    x.beginPath(); x.moveTo(cx - r, cy - r); x.lineTo(cx + r, cy - r); x.lineTo(cx + r, cy - 0.02 * r);
    x.bezierCurveTo(cx + 0.55 * r, cy + 0.3 * r, cx + 0.2 * r, cy - 0.28 * r, cx - 0.1 * r, cy + 0.06 * r);
    x.bezierCurveTo(cx - 0.4 * r, cy + 0.36 * r, cx - 0.7 * r, cy - 0.1 * r, cx - r, cy + 0.04 * r); x.closePath();
    x.fillStyle = C.black; x.fill();
    stroke(x, [[cx - 0.55 * r, cy - 0.42 * r], [cx - 0.38 * r, cy - 0.58 * r], [cx - 0.2 * r, cy - 0.45 * r], [cx - 0.32 * r, cy - 0.32 * r]], LWF, C.stucco);
    stroke(x, [[cx + 0.18 * r, cy - 0.38 * r], [cx + 0.36 * r, cy - 0.56 * r], [cx + 0.55 * r, cy - 0.42 * r], [cx + 0.42 * r, cy - 0.3 * r]], LWF, C.stucco);
    if (f.a) { x.beginPath(); x.rect(cx - r, cy + 0.32 * r, 2 * r, r); x.fillStyle = f.a; x.fill(); }
    for (let k = -1; k <= 1; k++) circ(x, cx + k * 0.42 * r, cy + 0.58 * r, r * 0.12, C.black, 0);
  },
  kan(x, cx, cy, r, f) {   // the Kan cross: four arms flaring outward, inside a ring of four lobes
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; circ(x, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.22, f.a || C.yellow, LWF); }
    const P = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), R = (u, v) => [cx + c * u - s * v, cy + s * u + c * v];
      P.push(R(0.14 * r, -0.12 * r), R(0.66 * r, -0.3 * r), R(0.72 * r, 0), R(0.66 * r, 0.3 * r), R(0.14 * r, 0.12 * r));
    }
    shp(x, P, C.stucco, LWI, false);
    circ(x, cx, cy, r * 0.12, C.black, 0);
  },
  muluc(x, cx, cy, r, f) {
    circ(x, cx, cy - 0.1 * r, r * 0.6, f.a || C.blue, LWI);
    circ(x, cx, cy - 0.1 * r, r * 0.3, C.stucco, LWI);
    circ(x, cx, cy - 0.1 * r, r * 0.1, C.black, 0);
    for (let k = -1; k <= 1; k++) circ(x, cx + k * 0.36 * r, cy + 0.72 * r, r * 0.09, C.black, 0);
  },
  cauac(x, cx, cy, r, f) {
    for (const [px, py] of [[-0.42, -0.42], [0.42, -0.42], [0, -0.1]]) { circ(x, cx + px * r, cy + py * r, r * 0.3, f.a || C.stucco, LWI); circ(x, cx + px * r, cy + py * r, r * 0.11, C.black, 0); }
    x.save(); x.beginPath(); x.rect(cx - r, cy + 0.32 * r, 2 * r, r); x.clip();
    x.lineWidth = LWF * 0.8; x.strokeStyle = C.black;
    for (let k = -8; k <= 8; k++) { x.beginPath(); x.moveTo(cx + k * 0.18 * r, cy + 0.3 * r); x.lineTo(cx + k * 0.18 * r + r, cy + 1.3 * r); x.stroke(); x.beginPath(); x.moveTo(cx + k * 0.18 * r, cy + 0.3 * r); x.lineTo(cx + k * 0.18 * r - r, cy + 1.3 * r); x.stroke(); }
    x.restore();
    stroke(x, [[cx - r, cy + 0.32 * r], [cx + r, cy + 0.32 * r]], LWI, C.black, false);
  },
  ahau(x, cx, cy, r, f) {
    ell(x, cx, cy + 0.05 * r, r * 0.66, r * 0.62, 0, f.a || C.yellow, LWI);
    circ(x, cx - 0.28 * r, cy - 0.12 * r, r * 0.16, C.stucco, LWI); circ(x, cx + 0.28 * r, cy - 0.12 * r, r * 0.16, C.stucco, LWI);
    circ(x, cx - 0.28 * r, cy - 0.12 * r, r * 0.06, C.black, 0); circ(x, cx + 0.28 * r, cy - 0.12 * r, r * 0.06, C.black, 0);
    circ(x, cx, cy + 0.36 * r, r * 0.17, f.b || C.red, LWI);
  },
  crossed(x, cx, cy, r, f) {
    tube(x, [[cx - 0.8 * r, cy - 0.8 * r], [cx + 0.8 * r, cy + 0.8 * r]], r * 0.32, f.a || C.blue, LWI * 0.5, false);
    tube(x, [[cx + 0.8 * r, cy - 0.8 * r], [cx - 0.8 * r, cy + 0.8 * r]], r * 0.32, f.a || C.blue, LWI * 0.5, false);
    for (const [px, py] of [[0, -0.62], [0.62, 0], [0, 0.62], [-0.62, 0]]) circ(x, cx + px * r, cy + py * r, r * 0.09, C.black, 0);
  },
  spiral(x, cx, cy, r, f) {
    if (f.a) circ(x, cx, cy, r * 0.75, f.a, 0);
    const P = []; for (let k = 0; k <= 40; k++) { const t = k / 40, a = t * TAU * 1.8 + 0.4; P.push([cx + Math.cos(a) * r * 0.7 * t, cy + Math.sin(a) * r * 0.7 * t]); }
    stroke(x, P, LWI * 1.15, C.black, false);
    circ(x, cx, cy, r * 0.09, C.black, 0);
  },
  hatch(x, cx, cy, r, f) {
    x.save(); x.beginPath(); x.rect(cx - r, cy - r, r * 1.05, 2 * r); x.clip();
    x.lineWidth = LWF * 0.75; x.strokeStyle = C.black;
    for (let k = -10; k <= 10; k++) { x.beginPath(); x.moveTo(cx - r, cy + k * 0.2 * r); x.lineTo(cx + r, cy + k * 0.2 * r + 2 * r); x.stroke(); x.beginPath(); x.moveTo(cx - r, cy + k * 0.2 * r); x.lineTo(cx + r, cy + k * 0.2 * r - 2 * r); x.stroke(); }
    x.restore();
    stroke(x, [[cx + 0.05 * r, cy - r], [cx + 0.05 * r, cy + r]], LWI, C.black, false);
    stroke(x, [[cx + 0.3 * r, cy + 0.5 * r], [cx + 0.3 * r, cy - 0.2 * r], [cx + 0.55 * r, cy - 0.5 * r], [cx + 0.75 * r, cy - 0.25 * r], [cx + 0.55 * r, cy - 0.05 * r]], LWI);
    if (f.a) circ(x, cx + 0.62 * r, cy + 0.52 * r, r * 0.18, f.a, LWF);
  },
  venus(x, cx, cy, r, f) {
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; x.beginPath(); x.arc(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.24, a - Math.PI / 2, a + Math.PI / 2); x.closePath(); fs(x, f.b || C.red, LWF); }
    circ(x, cx, cy, r * 0.4, f.a || C.stucco, LWI); circ(x, cx, cy, r * 0.16, C.black, 0);
  },
  comb(x, cx, cy, r, f) {
    shp(x, [[cx - 0.75 * r, cy - 0.2 * r], [cx + 0.75 * r, cy - 0.2 * r], [cx + 0.75 * r, cy + 0.14 * r], [cx - 0.75 * r, cy + 0.14 * r]], f.a || C.red, LWI, false);
    for (let k = 0; k < 5; k++) stroke(x, [[cx - 0.6 * r + k * 0.3 * r, cy - 0.2 * r], [cx - 0.6 * r + k * 0.3 * r, cy - 0.62 * r]], LWI, C.black, false, 'butt');
    for (let k = -1; k <= 1; k++) circ(x, cx + k * 0.42 * r, cy + 0.5 * r, r * 0.11, C.black, 0);
  },
  imix(x, cx, cy, r, f) {
    circ(x, cx, cy - 0.45 * r, r * 0.26, f.a || C.blue, LWI);
    for (let k = -2; k <= 2; k++) stroke(x, [[cx + k * 0.2 * r, cy - 0.12 * r], [cx + k * 0.24 * r, cy + 0.85 * r]], LWF, C.black, false);
    stroke(x, [[cx - 0.75 * r, cy - 0.15 * r], [cx + 0.75 * r, cy - 0.15 * r]], LWI, C.black, false);
  },
  head(x, cx, cy, r, f) {   // profile head facing left (codex reading order)
    const P = (a, b) => [cx + a * r, cy + b * r];
    shp(x, [P(-0.1, -0.86), P(-0.5, -0.62), P(-0.62, -0.3), P(-0.92, -0.1), P(-0.66, 0.06), P(-0.74, 0.3), P(-0.52, 0.42), P(-0.5, 0.66), P(0.05, 0.82), P(0.66, 0.5), P(0.76, -0.24), P(0.42, -0.78)], f.a || C.yellow, LWI);
    shp(x, [P(-0.36, -0.42), P(-0.1, -0.44), P(-0.08, -0.2), P(-0.34, -0.18)], C.stucco, LWF, false);
    circ(x, cx - 0.3 * r, cy - 0.31 * r, r * 0.07, C.black, 0);
    stroke(x, [P(-0.68, 0.2), P(-0.42, 0.24)], LWF);
    circ(x, cx + 0.32 * r, cy + 0.02 * r, r * 0.17, f.b || C.red, LWF);
    circ(x, cx + 0.32 * r, cy + 0.02 * r, r * 0.06, C.black, 0);
    tube(x, [P(-0.35, -0.72), P(0.2, -0.76), P(0.62, -0.5)], r * 0.12, f.c || C.red, LWF * 0.55);
  },
};
const SIGN_NAMES = Object.keys(SIGNS);

/** Affixes: elongated elements in a box (horizontal if w > h). */
function affix(x, kind, cx, cy, hw, hh, seed, f) {
  const horiz = hw > hh;
  const P = cart(cx, cy, hw, hh, seed, 3.2, 0.6, 22);
  if (kind === 'te') {
    for (let k = -1; k <= 1; k++) {
      const q = horiz ? cart(cx + k * hw * 0.64, cy, hw * 0.28, hh * 0.9, seed + k, 3, 0.4, 14) : cart(cx, cy + k * hh * 0.64, hw * 0.9, hh * 0.28, seed + k, 3, 0.4, 14);
      shp(x, q, k === 0 ? (f.a || C.red) : C.stucco, LWI);
    }
    return;
  }
  if (kind === 'cloud') {
    for (let k = -1; k <= 1; k++) {
      if (horiz) circ(x, cx + k * hw * 0.62, cy + hh * 0.1, Math.min(hw * 0.38, hh * 0.95), C.stucco, LWI);
      else circ(x, cx - hw * 0.1, cy + k * hh * 0.62, Math.min(hh * 0.38, hw * 0.95), C.stucco, LWI);
    }
    return;
  }
  if (kind === 'num') { numeral(x, f.n || 7, cx, cy, horiz ? hw * 2 : hw * 1.9, horiz ? hh * 1.7 : hh * 2, !horiz, f.nc || C.red, LWF); return; }
  shp(x, P, kind === 'comb' ? (f.a || C.red) : f.p || C.stucco, LWI);
  if (kind === 'dots') {
    for (let k = -1; k <= 1; k++) circ(x, cx + (horiz ? k * hw * 0.55 : 0), cy + (horiz ? 0 : k * hh * 0.55), Math.min(hw, hh) * 0.3, C.black, 0);
  } else if (kind === 'comb') {
    for (let k = -1; k <= 1; k++) {
      if (horiz) stroke(x, [[cx + k * hw * 0.5, cy - hh * 0.9], [cx + k * hw * 0.5, cy + hh * 0.2]], LWF, C.black, false);
      else stroke(x, [[cx - hw * 0.9, cy + k * hh * 0.5], [cx + hw * 0.2, cy + k * hh * 0.5]], LWF, C.black, false);
    }
  } else if (kind === 'bracket') {
    if (horiz) { stroke(x, [[cx - hw * 0.6, cy - hh * 0.2], [cx, cy + hh * 0.45], [cx + hw * 0.6, cy - hh * 0.2]], LWF); circ(x, cx - hw * 0.62, cy + hh * 0.3, hh * 0.18, C.black, 0); circ(x, cx + hw * 0.62, cy + hh * 0.3, hh * 0.18, C.black, 0); }
    else { stroke(x, [[cx + hw * 0.2, cy - hh * 0.6], [cx - hw * 0.45, cy], [cx + hw * 0.2, cy + hh * 0.6]], LWF); circ(x, cx + hw * 0.3, cy - hh * 0.64, hw * 0.18, C.black, 0); circ(x, cx + hw * 0.3, cy + hh * 0.64, hw * 0.18, C.black, 0); }
  }
}

function glyphSpec(key, o = {}) {
  const R = rng(key);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const fills = [C.yellow, C.red, C.blue, null, C.yellow, null, C.blue];
  return {
    seed: Math.floor(R() * 1000),
    layout: o.layout ?? pick(['full', 'pre', 'sup', 'pre', 'sup', 'presup', 'presup']),
    main: o.main ?? pick(SIGN_NAMES),
    pre: o.pre ?? pick(['dots', 'comb', 'bracket', 'num', 'te', 'num']),
    sup: o.sup ?? pick(['dots', 'te', 'cloud', 'bracket', 'comb']),
    bg: o.bg !== undefined ? o.bg : pick([null, null, C.paleY, null, C.paleB]),
    f: { a: o.a !== undefined ? o.a : pick(fills), b: pick([C.red, C.yellow, C.blue]), c: pick([C.red, C.blue]), n: o.n ?? 1 + Math.floor(R() * 13), nc: pick([C.red, C.black]) },
  };
}

/** A glyph block centred (cx, cy), `size` units wide. */
function drawGlyph(x, g, cx, cy, size) {
  x.save(); x.translate(cx, cy); x.scale(size / 100, size / 100);
  let main = [-40, -40, 40, 40];
  if (g.layout === 'pre') { affix(x, g.pre, -36, 0, 9, 38, g.seed, g.f); main = [-22, -42, 44, 42]; }
  if (g.layout === 'sup') { affix(x, g.sup, 0, -35, 38, 9, g.seed + 1, g.f); main = [-42, -20, 42, 44]; }
  if (g.layout === 'presup') { affix(x, g.sup, 6, -36, 34, 8.5, g.seed + 1, g.f); affix(x, g.pre, -36, 8, 8.5, 32, g.seed, g.f); main = [-22, -22, 44, 44]; }
  const mcx = (main[0] + main[2]) / 2, mcy = (main[1] + main[3]) / 2, hw = (main[2] - main[0]) / 2, hh = (main[3] - main[1]) / 2;
  const P = cart(mcx, mcy, hw, hh, g.seed + 2, 4.4, 0.9, 30);
  shp(x, P, g.bg || C.stucco, 0);
  x.save(); x.beginPath(); pathCR(x, P, true); x.clip();
  SIGNS[g.main](x, mcx, mcy, Math.min(hw, hh) * 0.95, g.f);
  x.restore();
  shp(x, P, null, LWB);
  x.restore();
}

/** Day-sign cartouche: red ring on a three-lobed pedestal, a sign inside, coefficient on its left. */
function drawDaySign(x, cx, cy, r, sign, n, seed) {
  // pedestal
  for (let k = -1; k <= 1; k++) circ(x, cx + k * r * 0.42, cy + r * 1.02, r * 0.22, C.stucco, LWF);
  shp(x, [[cx - r * 0.66, cy + r * 0.85], [cx + r * 0.66, cy + r * 0.85], [cx + r * 0.6, cy + r * 1.0], [cx - r * 0.6, cy + r * 1.0]], C.red, LWF, false);
  circ(x, cx, cy, r, C.red, LWI * 1.1);
  const inner = cart(cx, cy, r * 0.74, r * 0.74, seed, 2.4, 0.5, 26);
  shp(x, inner, C.stucco, 0);
  x.save(); x.beginPath(); pathCR(x, inner, true); x.clip();
  const g = glyphSpec(`${ID}-day-${seed}`);
  SIGNS[sign](x, cx, cy, r * 0.7, g.f);
  x.restore();
  shp(x, inner, null, LWI);
  numeral(x, n, cx - r * 1.6, cy + r * 0.05, r * 1.05, r * 1.75, true, C.red, LWF);
}

/** A title character painted as a glyph: black contour, colour fill, inside a cartouche block. */
function drawCharBlock(x, ch, cx, cy, size, col, bg, seed, font, weight = 800) {
  const h = size / 2;
  const P = cart(cx, cy, h * 0.94, h * 0.92, seed, 4.2, size * 0.008, 30);
  shp(x, P, bg, size * 0.045);
  const fsz = 200;
  const m = mkCanvas(1, 1).getContext('2d');
  m.font = `${weight} ${fsz}px ${font}`;
  const mt = m.measureText(ch);
  const gw = (mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) || fsz, gh = (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) || fsz;
  const fit = Math.min((size * 0.7) / gw, (size * 0.7) / gh);
  const sx = Math.min((size * 0.7) / gw, fit * 1.22), sy = Math.min((size * 0.7) / gh, fit * 1.22);
  x.save();
  x.translate(cx, cy);
  x.scale(sx, sy);
  x.font = `${weight} ${fsz}px ${font}`;
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  const ox = -(mt.actualBoundingBoxRight - mt.actualBoundingBoxLeft) / 2, oy = (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;
  x.lineJoin = 'round';
  // painted like a glyph: a fat black contour, then the colour laid inside it with a loaded brush
  x.lineWidth = (size * 0.1) / Math.min(sx, sy);
  x.strokeStyle = C.black;
  x.strokeText(ch, ox, oy);
  x.lineWidth = (size * 0.034) / Math.min(sx, sy);
  x.strokeStyle = col;
  x.strokeText(ch, ox, oy);
  x.fillStyle = col;
  x.fillText(ch, ox, oy);
  x.restore();
}

// ------------------------------------------------------------------ numeral parts (sprites; drawn centred at 0,0)
const NUM = { bw: 70, bh: 13, dd: 15 };
function partBar(x, col) { shp(x, cart(0, 0, NUM.bw / 2, NUM.bh / 2, 3, 6, 0.5, 26), col, 2.4); }
function partDot(x, col) { circ(x, 0, 0, NUM.dd / 2, col, col === C.black ? 0 : 2.4); }
function partShell(x) {
  // the zero: an olive shell — long oval body, a coiled spire at one end, the aperture lip and growth lines
  shp(x, [[-30, 5], [-25, -7], [-10, -14], [8, -14], [22, -9], [30, 0], [26, 9], [10, 14], [-10, 14], [-24, 12]], C.white, 2.8);
  stroke(x, [[-27, 6], [-12, 9], [6, 9], [18, 5]], 1.8);
  for (const sx of [-15, -5, 5]) stroke(x, [[sx - 1, -12], [sx + 2, -2], [sx, 7]], 1.6);
  circ(x, 19, -1, 8.4, C.red, 2.2);
  stroke(x, [[19, -6.5], [24, -1], [19, 4], [15, -1], [19, -2.5]], 1.5);
  for (let k = 0; k < 3; k++) circ(x, -20 + k * 5, 11.5, 1.2, C.black, 0);
}

// ------------------------------------------------------------------ the pelican-name glyph (pelican head on a wheel)
function drawNameGlyph(x, cx, cy, size) {
  x.save(); x.translate(cx, cy); x.scale(size / 100, size / 100);
  const P = cart(0, 0, 47, 46, 77, 4.3, 0.9, 32);
  shp(x, P, C.paleY, 0);
  x.save(); x.beginPath(); pathCR(x, P, true); x.clip();
  // subfix: the wheel, a cartouche with eight spokes (the bicycle)
  const wc = [14, 25], wr = 19;
  circ(x, wc[0], wc[1], wr, C.red, LWI);
  circ(x, wc[0], wc[1], wr * 0.66, C.stucco, LWF);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2; stroke(x, [[wc[0] + Math.cos(a) * 3, wc[1] + Math.sin(a) * 3], [wc[0] + Math.cos(a) * wr * 0.64, wc[1] + Math.sin(a) * wr * 0.64]], 2.0, C.black, false); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2 + Math.PI / 8; circ(x, wc[0] + Math.cos(a) * wr * 0.83, wc[1] + Math.sin(a) * wr * 0.83, 1.7, C.white, 0); }
  circ(x, wc[0], wc[1], 3.6, C.blue, LWF);
  // main sign: the pelican's head facing left — crest plumes, ringed eye, the huge bill and its pouch
  const hc = [24, -14];
  for (const [dx, dy, col] of [[16, -24, C.red], [24, -16, C.blue]]) { stroke(x, [[hc[0] + 4, hc[1] - 10], [hc[0] + dx * 0.6, hc[1] + dy * 0.9], [hc[0] + dx, hc[1] + dy]], 6.2, C.black); stroke(x, [[hc[0] + 4, hc[1] - 10], [hc[0] + dx * 0.6, hc[1] + dy * 0.9], [hc[0] + dx, hc[1] + dy]], 3, col); }
  shp(x, [[hc[0] - 8, hc[1] + 6], [-12, hc[1] + 12], [-34, hc[1] + 20], [-44, hc[1] + 18], [-40, hc[1] + 28], [-20, hc[1] + 36], [-2, hc[1] + 34], [hc[0] - 6, hc[1] + 22]], C.yellow, LWI);   // pouch
  stroke(x, [[-28, hc[1] + 24], [-12, hc[1] + 30], [4, hc[1] + 26]], 1.4);
  shp(x, [[hc[0] - 12, hc[1] - 6], [-8, hc[1] - 4], [-30, hc[1] + 2], [-46, hc[1] + 8], [-48, hc[1] + 16], [-40, hc[1] + 15], [-26, hc[1] + 12], [-6, hc[1] + 10], [hc[0] - 10, hc[1] + 8]], C.yellow, LWI);  // upper bill
  shp(x, [[-46, hc[1] + 8], [-52, hc[1] + 15], [-47, hc[1] + 21], [-42, hc[1] + 15]], C.red, LWF);  // hooked nail
  for (let k = 0; k < 5; k++) circ(x, 2 - k * 8.5, hc[1] + 2 + k * 1.6, 1.15, C.black, 0);
  stroke(x, [[hc[0] - 10, hc[1] + 9], [-26, hc[1] + 13], [-42, hc[1] + 16]], 1.4);
  circ(x, hc[0], hc[1], 15, C.white, LWI);
  circ(x, hc[0] - 4, hc[1] - 2, 6.4, C.red, LWF);
  circ(x, hc[0] - 4, hc[1] - 2, 3.6, C.white, 0);
  circ(x, hc[0] - 5, hc[1] - 2, 2.1, C.black, 0);
  x.restore();
  shp(x, P, null, LWB);
  x.restore();
}

// ------------------------------------------------------------------ figures: the rain deity
// local frame: origin = seat on the sky band, facing right, y up negative. pose: 'hold' | 'pour' | 'point'
function deityJar(pose) {
  if (pose === 'pour') return { c: [50, -56], t: 1.9 };
  if (pose === 'point') return { c: [62, -66], t: 2.25 };
  return { c: [38, -76], t: 0 };
}
function jarMouth(j) { const a = j.t - Math.PI / 2, d = 21; return [j.c[0] + Math.cos(a) * d, j.c[1] + Math.sin(a) * d]; }

function drawJar(x, j) {
  x.save(); x.translate(j.c[0], j.c[1]); x.rotate(j.t);
  shp(x, [[-7, -12], [7, -12], [8, -18], [-8, -18]], C.yellow, LWF, false);       // neck
  ell(x, 0, -19, 10, 3.6, 0, C.red, LWF);                                          // rim
  ell(x, 0, 0, 16, 13.5, 0, C.yellow, LWI * 0.9);                                    // body
  x.save(); x.beginPath(); x.ellipse(0, 0, 16, 13.5, 0, 0, TAU); x.clip();
  x.beginPath(); x.rect(-20, -4, 40, 8); x.fillStyle = C.blue; x.fill();
  stroke(x, [[-20, -4], [20, -4]], LWF, C.black, false); stroke(x, [[-20, 4], [20, 4]], LWF, C.black, false);
  for (let k = -2; k <= 2; k++) circ(x, k * 6.5, 0, 1.5, C.black, 0);
  x.restore();
  stroke(x, [[-10, 9], [-4, 12], [4, 12], [10, 9]], 1.4);
  x.restore();
}

function drawDeity(x, pose) {
  // plumes behind the headdress
  const plumes = [[[-4, -150], [-58, -166], C.blue], [[-2, -154], [-52, -180], C.red], [[0, -157], [-38, -190], C.yellow], [[2, -158], [-16, -193], C.blue]];
  for (const [b, t, col] of plumes) { shp(x, leaf(b, t, 13, -0.08), col, LWF); stroke(x, [b, [lerp(b[0], t[0], 0.85), lerp(b[1], t[1], 0.85)]], 1.4); circ(x, lerp(b[0], t[0], 0.78), lerp(b[1], t[1], 0.78), 2.6, C.black, 0); }
  // hair lock at the back of the head
  shp(x, [[-12, -140], [-24, -126], [-28, -104], [-18, -98], [-12, -114]], C.black, 0);
  const J = deityJar(pose);
  // far arm (behind the torso)
  if (pose === 'point') tube(x, [[-6, -96], [18, -110], [44, -112]], 11, C.blue, LWF);
  else if (pose === 'pour') tube(x, [[-6, -96], [2, -66], [40, -46]], 11, C.blue, LWF);
  else tube(x, [[-6, -96], [0, -66], [28, -62]], 11, C.blue, LWF);
  if (pose === 'point') { // open pointing hand
    shp(x, [[42, -118], [52, -116], [58, -112], [50, -108], [42, -106]], C.blue, LWF);
    stroke(x, [[52, -114], [64, -114]], 4.4, C.black); stroke(x, [[52, -114], [64, -114]], 2, C.blue);
  }
  // shin + foot (folded under), thigh
  tube(x, [[42, -18], [26, -9], [8, -6]], 16, C.blue, LWF);
  shp(x, [[2, -13], [30, -8], [38, -1], [2, 0]], C.blue, LWF);
  stroke(x, [[16, -10], [20, 0]], 3, C.red, false);
  tube(x, [[-8, -20], [18, -24], [42, -22]], 22, C.blue, LWF);
  // torso
  shp(x, [[-14, -24], [-20, -50], [-20, -78], [-14, -98], [0, -106], [12, -104], [20, -92], [21, -72], [17, -52], [12, -34], [4, -24]], C.blue, LWF);
  stroke(x, [[4, -82], [10, -70], [8, -58]], 1.4);
  // loincloth: belt + front flap with yellow fringe
  tube(x, [[-20, -40], [0, -43], [18, -40]], 8, C.red, LWF);
  shp(x, [[8, -40], [22, -38], [30, -10], [26, -3], [14, -5], [10, -28]], C.red, LWF);
  for (let k = 0; k < 4; k++) stroke(x, [[16 + k * 3.4, -7], [17 + k * 3.4, 0]], 2, C.yellow, false);
  for (let k = 0; k < 4; k++) circ(x, -14 + k * 9, -41.5, 1.5, C.yellow, 0);
  // neck + head (tilted a little toward the pelican when pointing)
  x.save();
  if (pose === 'point') { x.translate(4, -104); x.rotate(0.12); x.translate(-4, 104); }
  tube(x, [[2, -100], [6, -114]], 14, C.blue, LWF);
  shp(x, [[-14, -118], [-12, -140], [4, -152], [22, -148], [28, -138], [30, -128], [31, -120], [33, -115], [25, -111], [31, -107], [25, -100], [10, -101], [-4, -106]], C.blue, LWF);
  // the long curling nose
  shp(x, [[26, -137], [42, -140], [56, -134], [64, -122], [64, -110], [59, -104], [52, -106], [53, -113], [49, -118], [40, -123], [29, -125]], C.blue, LWF);
  stroke(x, [[59, -118], [61, -111], [56, -108], [55, -112]], 1.6);
  stroke(x, [[34, -132], [46, -132]], 1.4);
  // eye + scroll under it, fang, barbel
  shp(x, [[10, -141], [22, -141], [23, -130], [10, -130]], C.white, LWF, false);
  shp(x, [[17, -140], [22, -140], [22, -131], [17, -131]], C.black, 0, false);
  stroke(x, [[11, -126], [13, -120], [19, -121], [17, -125]], 1.6);
  shp(x, [[27, -115], [31, -108], [25, -111]], C.white, 1.4, false);
  stroke(x, [[24, -110], [19, -102], [23, -95], [28, -98]], 3.6, C.black); stroke(x, [[24, -110], [19, -102], [23, -95], [28, -98]], 1.7, C.red);
  // ear spool with a dangling bead
  stroke(x, [[-3, -118], [-5, -104]], 1.6);
  circ(x, -5, -102, 3.2, C.blue, 1.4);
  circ(x, -3, -125, 8.5, C.yellow, LWF);
  circ(x, -3, -125, 3.6, C.red, 1.4);
  // headband, knot, jade disc
  tube(x, [[-13, -141], [5, -151], [26, -149]], 8, C.red, LWF);
  for (let k = 0; k < 4; k++) circ(x, -6 + k * 9, -146.5 - (k < 2 ? k * 2.4 : 4 - (k - 2) * 1.2), 1.5, C.yellow, 0);
  ell(x, 26, -156, 5, 7, -0.5, C.yellow, LWF); ell(x, 34, -152, 5, 7, 0.6, C.yellow, LWF); circ(x, 29, -151, 3.2, C.red, 1.4);
  circ(x, 8, -163, 7.5, C.blue, LWF); circ(x, 8, -163, 2.6, C.red, 0);
  x.restore();
  // collar of beads + jade pectoral
  for (let k = 0; k < 6; k++) { const t = k / 5; circ(x, lerp(-9, 18, t), -99 + Math.sin(Math.PI * t) * 7 + t * 3, 3.6, k % 2 ? C.red : C.yellow, 1.3); }
  circ(x, 19, -86, 5, C.blue, LWF); circ(x, 19, -86, 1.6, C.black, 0);
  // jar + near arm
  if (pose !== 'point') drawJar(x, J);
  if (pose === 'point') { tube(x, [[6, -98], [30, -86], [54, -74]], 11.5, C.blue, LWF); drawJar(x, J); shp(x, [[50, -80], [60, -78], [60, -68], [50, -68]], C.blue, LWF); }
  else if (pose === 'pour') { tube(x, [[6, -98], [18, -76], [52, -66]], 11.5, C.blue, LWF); shp(x, [[48, -72], [59, -71], [60, -61], [49, -60]], C.blue, LWF); }
  else { tube(x, [[6, -98], [-2, -70], [24, -70]], 11.5, C.blue, LWF); shp(x, [[22, -76], [32, -75], [32, -65], [22, -65]], C.blue, LWF); }
  // wristlets
  const wr = pose === 'point' ? [[46, -82], [44, -72]] : pose === 'pour' ? [[43, -73], [44, -62]] : [[16, -75], [17, -65]];
  stroke(x, wr, 5.4, C.black, false); stroke(x, wr, 2.6, C.yellow, false);
}

// ------------------------------------------------------------------ figures: the monkey scribe
// local frame: origin = seat, facing right; drawn mirrored when it faces left. st.pose:
//   doze | startle | awake | frantic | stamp | proud ; st.k = variant 0..2
const MPOSE = {
  doze: [{ el: [22, -54], hd: [36, -34], tip: [52, -16] }],
  startle: [{ el: [30, -74], hd: [52, -108], tip: [66, -134] }, { el: [32, -66], hd: [60, -94], tip: [82, -112] }],
  awake: [{ el: [30, -66], hd: [58, -98], tip: [78, -122] }, { el: [30, -62], hd: [58, -90], tip: [80, -108] }],
  frantic: [{ el: [46, -90], hd: [84, -118], tip: [104, -138] }, { el: [48, -82], hd: [90, -102], tip: [112, -114] }, { el: [42, -96], hd: [78, -128], tip: [94, -152] }],
  stamp: [{ el: [48, -88], hd: [90, -112], tip: [114, -128] }],
  dab: [{ el: [48, -86], hd: [88, -106], tip: [108, -120] }],
};

function drawCodexProp(x, open) {
  if (!open) {   // closed screenfold with jaguar-pelt cover, lying on the bench
    shp(x, [[-74, -13], [-36, -13], [-34, 0], [-76, 0]], C.white, LWF, false);
    for (let k = 1; k < 4; k++) stroke(x, [[-74 + k * 9, -13], [-74 + k * 9 + 1, 0]], 1.0);
    shp(x, [[-76, -19], [-34, -19], [-34, -13], [-76, -13]], C.yellow, LWF, false);
    for (let k = 0; k < 5; k++) circ(x, -70 + k * 8.5, -16, 1.6, C.black, 0);
    return;
  }
  // held up open: two pages facing the viewer, the tally 42 on it (2 dots over 2 dots) and a tiny pelican
  shp(x, [[40, -168], [92, -164], [92, -104], [40, -108]], C.white, LWF, false);
  stroke(x, [[66, -166], [66, -106]], 1.4);
  stroke(x, [[42, -150], [64, -150]], 1.8, C.red, false); stroke(x, [[68, -148], [90, -148]], 1.8, C.red, false);
  circ(x, 49, -158, 3, C.black, 0); circ(x, 57, -158, 3, C.black, 0);
  circ(x, 49, -142, 3, C.red, 1); circ(x, 57, -142, 3, C.red, 1);
  // tiny pelican on a wheel
  circ(x, 79, -122, 6, null, 1.4); circ(x, 79, -138, 4, C.white, 1.2);
  shp(x, [[76, -138], [70, -134], [76, -134]], C.yellow, 1, false);
  stroke(x, [[79, -134], [79, -128]], 1.2);
  shp(x, [[38, -112], [94, -108], [94, -100], [38, -104]], C.yellow, LWF, false);
  for (let k = 0; k < 6; k++) circ(x, 44 + k * 9, -105, 1.5, C.black, 0);
}

function drawMonkey(x, st) {
  const pose = st.pose;
  const proud = pose === 'proud';
  const doze = pose === 'doze';
  const wide = pose === 'startle' || pose === 'frantic';
  // tail hanging over the bench edge (curled up when proud)
  const tail = proud
    ? [[-20, -14], [-38, -16], [-50, -34], [-50, -60], [-40, -74], [-28, -70], [-30, -58], [-38, -56]]
    : [[-20, -12], [-38, -4], [-46, 18], [-44, 50], [-36, 70], [-24, 76], [-18, 68], [-24, 60]];
  if (proud && st.k) for (const p of tail) if (p[1] < -40) p[0] -= 4;
  tube(x, tail, 8, C.yellow, LWF);
  if (!proud) drawCodexProp(x, false);
  // far arm
  if (proud) tube(x, [[-6, -84], [16, -112], [44, -150]], 10, C.yellow, LWF);
  else tube(x, [[-6, -82], [6, -56], [26, -34]], 10, C.yellow, LWF);
  // shin, foot, thigh
  tube(x, [[36, -16], [20, -8], [4, -6]], 14, C.yellow, LWF);
  shp(x, [[0, -11], [26, -9], [36, -3], [30, 0], [0, 0]], C.yellow, LWF);
  for (let k = 0; k < 3; k++) stroke(x, [[24 + k * 4, -6], [26 + k * 4, 0]], 1.2);
  tube(x, [[-8, -14], [14, -18], [36, -18]], 20, C.yellow, LWF);
  // torso (hunched), belly patch, fur strokes along the back
  shp(x, [[-14, -16], [-24, -40], [-25, -66], [-15, -86], [2, -93], [14, -85], [20, -66], [18, -40], [10, -18]], C.yellow, LWF);
  ell(x, 9, -50, 8, 17, 0.12, C.white, 1.6);
  for (let k = 0; k < 5; k++) stroke(x, [[-22 + k * 0.5, -36 - k * 9], [-17 + k * 0.5, -40 - k * 9]], 1.3, C.black, false);
  // loincloth
  tube(x, [[-24, -22], [0, -21], [18, -23]], 7, C.red, LWF);
  shp(x, [[10, -21], [21, -20], [25, -4], [14, -4]], C.white, LWF, false);
  stroke(x, [[16, -16], [19, -6]], 1.6, C.red, false);
  // necklace of beads
  for (let k = 0; k < 5; k++) { const t = k / 4; circ(x, lerp(-8, 14, t), -88 + Math.sin(Math.PI * t) * 6 + t * 2, 3, k % 2 ? C.red : C.blue, 1.2); }
  // head (droops when dozing)
  x.save();
  if (doze) { x.translate(4, -94); x.rotate(0.42); x.translate(-4, 94); }
  if (proud) { x.translate(4, -94); x.rotate(-0.12); x.translate(-4, 94); }
  circ(x, 2, -116, 24, C.yellow, LWF);
  for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.32; stroke(x, [[2 + Math.cos(a) * 22, -116 + Math.sin(a) * 22], [2 + Math.cos(a) * 29, -116 + Math.sin(a) * 29]], 1.6, C.black, false); }
  shp(x, [[6, -131], [20, -130], [29, -120], [39, -114], [42, -103], [35, -94], [22, -92], [11, -98], [5, -112]], C.white, LWF);
  // ear
  circ(x, -7, -112, 8, C.yellow, LWF); stroke(x, [[-9, -116], [-4, -114], [-6, -108]], 1.4);
  // eye
  if (doze) stroke(x, [[13, -118], [18, -115], [24, -118]], 2.2);
  else if (pose === 'stamp') { stroke(x, [[12, -122], [24, -117], [12, -113]], 2.2, C.black, false); }
  else if (proud) stroke(x, [[12, -115], [18, -121], [25, -115]], 2.4);
  else {
    const er = wide ? 7.6 : 6.4;
    circ(x, 18, -117, er, C.white, 2.2);
    circ(x, 20, -117, wide ? 2.6 : 3.2, C.black, 0);
  }
  stroke(x, [[9, -127], [18, -129], [27, -126]], 2.8);
  // muzzle: nostril, mouth (tongue out when frantic, grin when stamping or proud), snore scroll
  circ(x, 37, -108, 1.4, C.black, 0);
  if (pose === 'frantic') {
    shp(x, [[30, -100], [42, -100], [47, -92], [44, -86], [38, -90]], C.red, LWF);
    stroke(x, [[24, -98], [40, -101]], 1.8);
  } else if (proud || pose === 'stamp') {
    shp(x, [[22, -100], [40, -102], [36, -95], [26, -95]], C.red, 1.8);
  } else if (pose === 'startle') {
    ell(x, 33, -99, 4, 3.4, 0, C.red, 1.8);
  } else stroke(x, [[24, -98], [40, -101]], 1.8);
  if (doze) {
    const big = st.k === 1;
    const sc = big ? 1.25 : 0.9;
    stroke(x, [[44, -98], [52 * sc + 2, -104], [58 * sc + 2, -112 * (big ? 1.02 : 1)], [52 * sc + 2, -118], [48 * sc + 2, -112]], 2.2);
    circ(x, 62 * sc + 2, -100, 2.4, C.black, 0);
  }
  // headband with a spare brush tucked in (the scribe's mark)
  stroke(x, [[-12, -131], [-34, -154]], 2.6);
  shp(x, [[-33, -151], [-42, -160], [-35, -156], [-31, -157]], C.black, 0, false);
  tube(x, [[-20, -124], [-4, -136], [18, -133]], 6, C.red, LWF);
  x.restore();
  // writing arm with the brush (or both arms up holding the open codex)
  if (proud) {
    drawCodexProp(x, true);
    tube(x, [[6, -84], [26, -98], [42, -118]], 10, C.yellow, LWF);
    circ(x, 42, -120, 6, C.yellow, LWF); circ(x, 45, -152, 6, C.yellow, LWF);
  } else {
    const A = (MPOSE[pose] || MPOSE.awake)[st.k || 0] || MPOSE.awake[0];
    stroke(x, [A.hd, A.tip], 2.8);
    const d = [A.tip[0] - A.hd[0], A.tip[1] - A.hd[1]], dl = Math.hypot(d[0], d[1]) || 1, ux = d[0] / dl, uy = d[1] / dl;
    shp(x, [[A.tip[0] - ux * 7 - uy * 3.2, A.tip[1] - uy * 7 + ux * 3.2], [A.tip[0] + ux * 5, A.tip[1] + uy * 5], [A.tip[0] - ux * 7 + uy * 3.2, A.tip[1] - uy * 7 - ux * 3.2]], C.black, 0);
    tube(x, [[6, -84], A.el, A.hd], 10, C.yellow, LWF);
    circ(x, A.hd[0], A.hd[1], 6.2, C.yellow, LWF);
    stroke(x, [[A.el[0] + (A.hd[0] - A.el[0]) * 0.72, A.el[1] + (A.hd[1] - A.el[1]) * 0.72 - 6], [A.el[0] + (A.hd[0] - A.el[0]) * 0.72, A.el[1] + (A.hd[1] - A.el[1]) * 0.72 + 6]], 3.6, C.red, false);
  }
}
/** Brush tip of a monkey state in PANEL units. */
function monkeyTip(pose, k) {
  const A = (MPOSE[pose] || MPOSE.awake)[k || 0] || MPOSE.awake[0];
  const M = L.monkey;
  return [M.x - A.tip[0] * M.s, M.y + A.tip[1] * M.s];
}

// ------------------------------------------------------------------ the water stream (pour pose)
function streamGeom() {
  const D = L.deity, J = deityJar('pour'), m = jarMouth(J);
  const M = [D.x - m[0] * D.s, D.y + m[1] * D.s];
  const spine = smoothPath([M, [M[0] - 12, M[1] + 2], [M[0] - 21, M[1] + 14], [M[0] - 25, M[1] + 44], [M[0] - 27, 560], [M[0] - 26, 690], [M[0] - 25, L.road[0] + 1]], 7);
  return { top: M, bottom: spine[spine.length - 1], spine };
}
function drawStream(x, k) {
  const { spine, bottom } = streamGeom();
  const n = spine.length;
  const wAt = (t) => lerp(9, 22, Math.pow(t, 0.55));
  const body = ribbon(spine, (t) => wAt(t) * (1 + 0.2 * Math.sin(t * 40 - k * 2.1) + 0.12 * Math.sin(t * 97 + k * 1.7)));
  shp(x, body, C.blue, LWF, false);
  // flowing highlights: a wavy line down the middle, bubbles riding it
  const wave = spine.map((p, i) => { const t = i / (n - 1); return [p[0] + Math.sin(t * 34 - k * 2.1) * wAt(t) * 0.22, p[1]]; });
  stroke(x, wave.slice(2), 1.4, C.white);
  const wave2 = spine.map((p, i) => { const t = i / (n - 1); return [p[0] - Math.sin(t * 30 - k * 2.1 + 1.3) * wAt(t) * 0.26 + wAt(t) * 0.12, p[1]]; });
  stroke(x, wave2.slice(6), 1.1, '#2f6f85');
  for (let i = 0; i < 10; i++) {
    const t = 0.08 + ((i + k / 3) / 10) * 0.88, j = Math.min(n - 1, Math.round(t * (n - 1))), p = spine[j];
    circ(x, p[0] + (i % 2 ? 1 : -1) * wAt(t) * 0.25, p[1], 1.5, C.white, 0);
  }
  // droplets spinning off the edges
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + ((i * 0.13 + k * 0.045) % 0.8), j = Math.min(n - 1, Math.round(t * (n - 1))), p = spine[j];
    const side = i % 2 ? 1 : -1;
    circ(x, p[0] + side * (wAt(t) * 0.5 + 5 + (i % 3) * 2), p[1] + 4, 2.1, C.blue, 1.1);
  }
  // splash at the bottom: water scrolls and drops
  const b = bottom;
  for (const sd of [-1, 1]) {
    const P = [[b[0] + sd * 8, b[1] - 1], [b[0] + sd * 18, b[1] - 13 - (k === 1 ? 3 : 0)], [b[0] + sd * 28, b[1] - 8], [b[0] + sd * 23, b[1] - 2], [b[0] + sd * 19, b[1] - 6]];
    tube(x, P, 3, C.blue, 1.2);
  }
  for (let i = 0; i < 4; i++) circ(x, b[0] + (i - 1.5) * 14 + (k - 1) * 3, b[1] - 22 - ((i + k) % 3) * 6, 2.2, C.blue, 1.1);
}

// ------------------------------------------------------------------ static paint: the page
function drawBand(x, x0, x1, y0, y1, seed, col = C.red) {
  const P = [], n = Math.ceil((x1 - x0) / 12);
  for (let k = 0; k <= n; k++) { const xx = lerp(x0, x1, k / n); P.push([xx, y0 + (vnoise(xx / 30, seed, 41) - 0.5) * 1.6]); }
  for (let k = n; k >= 0; k--) { const xx = lerp(x0, x1, k / n); P.push([xx, y1 + (vnoise(xx / 30, seed + 0.5, 42) - 0.5) * 1.6]); }
  shp(x, P, col, 0, false);
}

function drawSkyBand(x) {
  const s = L.sky, n = 6, w = (s.x1 - s.x0) / n;
  shp(x, [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]], C.stucco, 0, false);
  const signs = ['kin', 'akbal', 'crossed', 'venus', 'muluc', 'kin'];
  const bgs = [C.red, null, C.blue, C.paleY, C.red, C.paleB];
  for (let k = 0; k < n; k++) {
    const x0 = s.x0 + k * w;
    if (bgs[k]) { x.beginPath(); x.rect(x0, s.y0, w, s.y1 - s.y0); x.fillStyle = bgs[k]; x.fill(); }
    x.save(); x.beginPath(); x.rect(x0, s.y0, w, s.y1 - s.y0); x.clip();
    SIGNS[signs[k]](x, x0 + w / 2, (s.y0 + s.y1) / 2, 11, { a: k === 3 ? C.stucco : null });
    x.restore();
    if (k) stroke(x, [[x0, s.y0], [x0, s.y1]], LWF, C.black, false);
  }
  shp(x, [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]], null, LWI, false);
  // the sky band's hanging ends (serpent-like scrolls)
  for (const [ex, dir] of [[s.x0, -1], [s.x1, 1]]) {
    stroke(x, [[ex, s.y0 + 6], [ex + dir * 12, s.y0 + 2], [ex + dir * 18, s.y0 + 14], [ex + dir * 10, s.y1 + 2], [ex + dir * 4, s.y1 - 4]], 5.2, C.black);
    stroke(x, [[ex, s.y0 + 6], [ex + dir * 12, s.y0 + 2], [ex + dir * 18, s.y0 + 14], [ex + dir * 10, s.y1 + 2], [ex + dir * 4, s.y1 - 4]], 2.4, C.red);
  }
}

function drawThrone(x) {
  const b = L.bench;
  // jaguar-pelt cushion
  shp(x, [[b.x0 + 6, b.y0 - 2], [b.x0 + 18, b.y0 - 12], [b.x1 - 18, b.y0 - 12], [b.x1 - 6, b.y0 - 2], [b.x1 - 6, b.y0 + 6], [b.x0 + 6, b.y0 + 6]], C.yellow, LWF, false);
  const R = rng(`${ID}-pelt`);
  for (let k = 0; k < 16; k++) { const px = lerp(b.x0 + 16, b.x1 - 16, k / 15) + (R() - 0.5) * 6, py = b.y0 - 4 + (R() - 0.5) * 6; circ(x, px, py, 2.4 + R() * 1.4, null, 1.4); circ(x, px, py, 0.9, C.black, 0); }
  // the throne block: red slab, blue front panel with a glyph band, black base
  shp(x, [[b.x0, b.y0 + 6], [b.x1, b.y0 + 6], [b.x1, b.y0 + 24], [b.x0, b.y0 + 24]], C.red, LWI, false);
  shp(x, [[b.x0 + 10, b.y0 + 24], [b.x1 - 10, b.y0 + 24], [b.x1 - 10, b.y1], [b.x0 + 10, b.y1]], C.blue, LWI, false);
  shp(x, [[b.x0 + 22, b.y0 + 40], [b.x1 - 22, b.y0 + 40], [b.x1 - 22, b.y0 + 108], [b.x0 + 22, b.y0 + 108]], C.stucco, LWI, false);
  const gw = (b.x1 - b.x0 - 44) / 3;
  for (let k = 0; k < 3; k++) drawGlyph(x, glyphSpec(`${ID}-throne-${k}`, { bg: null }), b.x0 + 22 + gw * (k + 0.5), b.y0 + 74, 58);
  for (let k = 0; k < 7; k++) circ(x, lerp(b.x0 + 28, b.x1 - 28, k / 6), b.y0 + 132, 4.2, C.yellow, LWF);
  stroke(x, [[b.x0 + 10, b.y0 + 150], [b.x1 - 10, b.y0 + 150]], LWI, C.black, false);
  for (let k = 0; k < 9; k++) { const xx = lerp(b.x0 + 18, b.x1 - 18, k / 8); stroke(x, [[xx - 7, b.y0 + 178], [xx, b.y0 + 160], [xx + 7, b.y0 + 178]], LWF, C.black, false); }
}

function drawCounterFrame(x) {
  const c = L.counter;
  for (const cl of [CELL.top, CELL.bot]) shp(x, [[cl.x0, cl.y0], [cl.x1, cl.y0], [cl.x1, cl.y1], [cl.x0, cl.y1]], null, 1.3, false);
  shp(x, [[c.x0 + 4, (CELL.top.y1 + CELL.bot.y0) / 2 - 1.6], [c.x1 - 4, (CELL.top.y1 + CELL.bot.y0) / 2 - 1.6], [c.x1 - 4, (CELL.top.y1 + CELL.bot.y0) / 2 + 1.6], [c.x0 + 4, (CELL.top.y1 + CELL.bot.y0) / 2 + 1.6]], C.red, 0, false);
  x.lineJoin = 'round';
  x.strokeStyle = C.red; x.lineWidth = 5; x.strokeRect(c.x0 + 1.5, c.y0 + 1.5, c.x1 - c.x0 - 3, c.y1 - c.y0 - 3);
  x.strokeStyle = C.black; x.lineWidth = 1.6; x.strokeRect(c.x0 - 1, c.y0 - 1, c.x1 - c.x0 + 2, c.y1 - c.y0 + 2);
  // caption beside the tally: "wheel-turns" — a wheel sign under a count superfix
  drawWheelGlyph(x, c.x1 + 46, c.y0 + 34, 56);
}
function drawWheelGlyph(x, cx, cy, size) {
  x.save(); x.translate(cx, cy); x.scale(size / 100, size / 100);
  affix(x, 'dots', 0, -36, 36, 9, 61, {});
  const P = cart(0, 10, 44, 36, 62, 4.3, 0.8, 30);
  shp(x, P, C.paleB, LWB);
  circ(x, 0, 10, 27, C.red, LWI);
  circ(x, 0, 10, 18, C.stucco, LWF);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; stroke(x, [[Math.cos(a) * 4, 10 + Math.sin(a) * 4], [Math.cos(a) * 17, 10 + Math.sin(a) * 17]], 2.6, C.black, false); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; circ(x, Math.cos(a) * 22.5, 10 + Math.sin(a) * 22.5, 2.2, C.white, 0); }
  circ(x, 0, 10, 4.5, C.blue, LWF);
  x.restore();
}

function drawTitle(x) {
  const T = L.title;
  shp(x, [[T.x0, T.y0], [T.x1, T.y0], [T.x1, T.y1], [T.x0, T.y1]], '#f3e8c8', 0, false);
  x.strokeStyle = C.red; x.lineWidth = 6; x.strokeRect(T.x0 + 3, T.y0 + 3, T.x1 - T.x0 - 6, T.y1 - T.y0 - 6);
  x.strokeStyle = C.black; x.lineWidth = 1.6; x.strokeRect(T.x0 - 0.5, T.y0 - 0.5, T.x1 - T.x0 + 1, T.y1 - T.y0 + 1);
  x.strokeStyle = C.black; x.lineWidth = 1.2; x.strokeRect(T.x0 + 7, T.y0 + 7, T.x1 - T.x0 - 14, T.y1 - T.y0 - 14);
  const font = '"Hannotate SC", "Yuanti SC", "PingFang SC", sans-serif';
  const big = [...'玛雅抄本'], bc = [C.red, C.blue, C.yellow, C.red], bb = [C.stucco, C.paleY, C.stucco, C.paleB];
  const bs = 90, bgap = 6, bw = big.length * bs + (big.length - 1) * bgap, bx0 = (T.x0 + T.x1) / 2 - bw / 2;
  big.forEach((ch, k) => drawCharBlock(x, ch, bx0 + bs / 2 + k * (bs + bgap), T.y0 + 14 + bs / 2, bs, bc[k], bb[k], 300 + k, font, 800));
  const sm2 = [...'约公元一二〇〇年'];
  const ss = 44, sgap = 3.6, sw = sm2.length * ss + (sm2.length - 1) * sgap, sx0 = (T.x0 + T.x1) / 2 - sw / 2;
  sm2.forEach((ch, k) => drawCharBlock(x, ch, sx0 + ss / 2 + k * (ss + sgap), T.y0 + 14 + bs + 10 + ss / 2, ss, k % 2 ? C.blue : C.red, k % 3 === 1 ? C.paleY : C.stucco, 400 + k, font, 800));
}

function drawEnglish(x) {
  const E = L.eng, words = ['MAYA', 'CODEX', 'c. 1200'];
  const h = (E.y1 - E.y0 - 2 * 6) / 3;
  words.forEach((wd, k) => {
    const y0 = E.y0 + k * (h + 6);
    const P = cart((E.x0 + E.x1) / 2, y0 + h / 2, (E.x1 - E.x0) / 2, h / 2, 500 + k, 5, 0.6, 26);
    shp(x, P, k === 1 ? C.paleY : C.stucco, LWI);
    x.save();
    x.font = `600 ${k === 2 ? 22 : 21}px "Copperplate", "Herculanum", "Baskerville", serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = C.black;
    const tw = x.measureText(wd).width, mw = E.x1 - E.x0 - 12;
    x.translate((E.x0 + E.x1) / 2, y0 + h / 2 + 1);
    if (tw > mw) x.scale(mw / tw, 1);
    x.fillText(wd, 0, 0);
    x.restore();
  });
}

function drawGlyphText(x) {
  const T = L.text;
  const cols = 4, bw = 80, gap = (T.x1 - T.x0 - cols * bw) / (cols - 1);
  T.rows.forEach(([y0, y1], r) => {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const MAIN = ['ahau', 'muluc', 'cauac', 'head', 'kin', 'kan', 'akbal', 'venus'];
      const LAY = ['pre', 'sup', 'presup', 'pre', 'sup', 'pre', 'presup', 'sup'];
      const o = { main: MAIN[k], layout: LAY[k] };
      if (k === 0) Object.assign(o, { pre: 'num', n: 9, a: C.yellow });
      if (k === 5) Object.assign(o, { pre: 'num', n: 13 });
      if (k === 3) Object.assign(o, { pre: 'dots' });
      drawGlyph(x, glyphSpec(`${ID}-text-${k}`, o), T.x0 + bw / 2 + c * (bw + gap), (y0 + y1) / 2, bw);
    }
  });
}

function drawDays(x) {
  const signs = ['ik', 'akbal', 'kan', 'muluc', 'cauac', 'ahau', 'imix', 'kin', 'venus'];
  const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let k = 0; k < 9; k++) drawDaySign(x, 160 + k * 100, L.days.y - 6, 27, signs[k], nums[k], 600 + k);
}

function drawFootprints(x) {
  for (let k = 0; k < 15; k++) {
    const fx = 110 + k * 62 + (k % 2) * 8, fy = 815 + (k % 2 ? 5 : -4);
    ell(x, fx, fy, 7.5, 3.6, 0.05, C.black, 0);
    for (let t = 0; t < 4; t++) circ(x, fx + 8.5 + t * 0.3, fy - 3 + t * 2, 1.1, C.black, 0);
  }
}

function drawNeighbour(x) {
  // fragments of the previous page (its right part is visible beyond the fold)
  drawGlyph(x, glyphSpec(`${ID}-nb-0`, { main: 'venus' }), 34, 100, 78);
  drawGlyph(x, glyphSpec(`${ID}-nb-1`, { main: 'cauac', layout: 'sup' }), 34, 188, 78);
  numeral(x, 12, 52, 330, 34, 52, false, C.red, LWF);
  numeral(x, 6, 52, 396, 34, 52, false, C.black, LWF);
  drawGlyph(x, glyphSpec(`${ID}-nb-2`, { main: 'head' }), 40, 520, 80);
  numeral(x, 17, 48, 640, 40, 66, false, C.red, LWF);
  numeral(x, 8, 48, 724, 40, 40, false, C.black, LWF);
  drawDaySign(x, 52, L.days.y - 6, 27, 'kan', 1, 650);
}

function paintStatic(x, K) {
  // red register bands, main page (with a small offset on the previous page: the screenfold is not perfectly aligned)
  for (const [y0, y1, k] of [[L.bandTop[0], L.bandTop[1], 1], [L.bandReg[0], L.bandReg[1], 2], [L.bandBot[0], L.bandBot[1], 4]]) {
    drawBand(x, FOLD + 2, 1004, y0, y1, k);
    drawBand(x, -4, FOLD - 2, y0 + 2, y1 + 2, k + 10);
  }
  // the road: red ground band with a contour, flat from edge to edge
  shp(x, [[-6, L.road[0]], [1006, L.road[0]], [1006, L.road[1]], [-6, L.road[1]]], C.red, 0, false);
  stroke(x, [[-6, L.road[0]], [1006, L.road[0]]], 1.8, C.black, false);
  stroke(x, [[-6, L.road[1]], [1006, L.road[1]]], 1.4, C.black, false);
  drawFootprints(x);
  // vertical red band of the top register (the English column runs along it)
  shp(x, [[L.vband[0], L.bandTop[1]], [L.vband[1], L.bandTop[1]], [L.vband[1], L.bandReg[0]], [L.vband[0], L.bandReg[0]]], C.red, 0, false);
  drawTitle(x);
  drawEnglish(x);
  drawGlyphText(x);
  drawSkyBand(x);
  drawThrone(x);
  drawCounterFrame(x);
  drawDays(x);
  drawNeighbour(x);
  void K;
}

// ------------------------------------------------------------------ ageing (hand-painted edges + pigment wear)
// P: edge raggedness, wear (flecks), blue (extra fading of Maya blue), dens (max opacity)
const P_PAGE = { edge: 0.85, wear: 0.95, blue: 0.32, rub: 0.42, dens: 0.96 };
const P_NEIGH = { edge: 0.95, wear: 1.0, blue: 0.45, rub: 0.6, dens: 0.84 };
const P_SPR = { edge: 0.8, wear: 0.9, blue: 0.3, rub: 0.35, dens: 0.96 };

/** dA sharp RGBA, dB blurred RGBA (w×h at page px offset i0, j0) → aged straight-alpha RGBA in out. */
function agePx(dA, dB, w, h, i0, j0, P, out) {
  const T = tile(), W = wearTile();
  for (let j = 0; j < h; j++) {
    const gj = j0 + j, tj = (gj & 255) * 256, wj = (gj & 511) * 512;
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const ab = dB[k + 3] / 255;
      if (ab < 0.02) { out[k + 3] = 0; continue; }
      const gi = i0 + i;
      const n = T[tj + (gi & 255)];
      const cov = sm(0.32, 0.68, ab + (n - 0.5) * P.edge);
      if (cov <= 0) { out[k + 3] = 0; continue; }
      let r, g, b;
      if (dA[k + 3] > 110) { r = dA[k]; g = dA[k + 1]; b = dA[k + 2]; } else { r = dB[k]; g = dB[k + 1]; b = dB[k + 2]; }
      const wv = W[wj + (gi & 511)];
      const blueish = b > r + 25 ? 1 : 0;
      const dark = r + g + b < 150 ? 1 : 0;
      let a = cov * P.dens * (1 - P.wear * wv * (dark ? 0.75 : 1));
      if (blueish) a *= 1 - P.blue * (0.4 + 0.6 * n);
      if (!dark) {   // colour fills are rubbed thin in places (the black line survives better)
        const rb = sm(0.52, 0.78, 0.62 * vnoise(gi / 150, gj / 150, 61) + 0.38 * vnoise(gi / 36, gj / 36, 62));
        a *= 1 - P.rub * rb * (0.6 + 0.4 * n);
      }
      // pigment unevenness
      const t = 0.94 + 0.12 * n;
      out[k] = r * t; out[k + 1] = g * t; out[k + 2] = b * (blueish ? t : 2 - t);
      out[k + 3] = Math.max(0, a) * 255;
    }
  }
}

/** Rasterise paint(ctx) over a panel-unit region, age it; returns {i0, j0, w, h, px}. */
function rasterAged(region, paint, P, blurPx = 1.25) {
  const i0 = Math.floor(region[0] * S), j0 = Math.floor(region[1] * S);
  const w = Math.ceil(region[2] * S) - i0, h = Math.ceil(region[3] * S) - j0;
  const cA = mkCanvas(w, h), xA = ctx2d(cA);
  xA.setTransform(S, 0, 0, S, -i0, -j0);
  xA.lineCap = 'round'; xA.lineJoin = 'round';
  paint(xA);
  const cB = mkCanvas(w, h), xB = ctx2d(cB);
  xB.filter = `blur(${blurPx}px)`;
  xB.drawImage(cA, 0, 0);
  const dA = xA.getImageData(0, 0, w, h).data, dB = xB.getImageData(0, 0, w, h).data;
  const px = new Uint8ClampedArray(w * h * 4);
  agePx(dA, dB, w, h, i0, j0, P, px);
  return { i0, j0, w, h, px };
}

// ------------------------------------------------------------------ the page: stucco, edges, fold, losses
const topEdge = (x) => 15 + 5 * (fbm(x / 90, 0.5, 71, 3) - 0.5) * 2 + 1.2 * (vnoise(x / 6, 1.5, 72) - 0.5);
const botEdge = (x) => 979 + 5 * (fbm(x / 90, 2.5, 73, 3) - 0.5) * 2 + 1.2 * (vnoise(x / 6, 3.5, 74) - 0.5);
const LOSSES = [   // interior / edge flakes: x, y, r, seed
  { x: 1006, y: 150, r: 24, k: 1 }, { x: 598, y: 926, r: 15, k: 2 }, { x: 236, y: 990, r: 30, k: 3 },
  { x: 100, y: 316, r: 12, k: 4 }, { x: 472, y: 20, r: 22, k: 5 }, { x: 926, y: 742, r: 12, k: 6 },
  { x: 536, y: 664, r: 7, k: 7 }, { x: 352, y: 912, r: 9, k: 8 }, { x: 34, y: 392, r: 15, k: 9 },
  { x: 816, y: 20, r: 18, k: 10 }, { x: 1004, y: 548, r: 14, k: 11 },
];

/** Loss value at (x, y) panel units: > 0 = stucco lost (bark shows), magnitude ~ units inside the loss. */
function lossAt(x, y) {
  let v = -99;
  const det = (vnoise(x / 3.2, y / 3.2, 81) - 0.5) * 2.4 + (vnoise(x / 9, y / 9, 82) - 0.5) * 3;
  const dt = y - topEdge(x);
  if (dt < 50) { const th = 3 + 20 * sm(0.48, 0.82, fbm(x / 70, 1.3, 31, 3)) + 6 * fbm(x / 20, 3.1, 32, 2); v = Math.max(v, th - dt + det); }
  const db = botEdge(x) - y;
  if (db < 50) { const th = 3 + 18 * sm(0.46, 0.8, fbm(x / 70, 5.3, 33, 3)) + 6 * fbm(x / 20, 6.1, 34, 2); v = Math.max(v, th - db + det); }
  const df = Math.abs(x - FOLD);
  if (df < 40) {
    const band = y > 455 && y < 838 ? 0.12 : 1;
    const th = 1.6 + band * (14 * sm(0.42, 0.8, fbm(y / 60, 7.7, 35, 3)) + 4 * fbm(y / 15, 8.1, 36, 2));
    v = Math.max(v, th - df + det * band);
  }
  for (const L0 of LOSSES) {
    const dx = x - L0.x, dy = y - L0.y;
    if (Math.abs(dx) > L0.r * 2 || Math.abs(dy) > L0.r * 2) continue;
    const a = Math.atan2(dy, dx);
    const rr = L0.r * (0.7 + 0.6 * fbm(Math.cos(a) * 1.3 + L0.k * 5, Math.sin(a) * 1.3, 90 + L0.k, 3));
    v = Math.max(v, rr - Math.hypot(dx, dy) + det * 0.6);
  }
  return v;
}

let BUILT = null;

function buildPage(K) {
  const NN = N * N;
  // ---- loss field (only evaluated where it can matter)
  const LV = new Float32Array(NN).fill(-99);
  const zones = [[0, 0, 1000, 80], [0, 920, 1000, 1000], [FOLD - 42, 0, FOLD + 42, 1000]];
  for (const L0 of LOSSES) zones.push([L0.x - L0.r * 2, L0.y - L0.r * 2, L0.x + L0.r * 2, L0.y + L0.r * 2]);
  for (const [x0, y0, x1, y1] of zones) {
    const i0 = Math.max(0, Math.floor(x0 * S)), i1 = Math.min(N, Math.ceil(x1 * S)), j0 = Math.max(0, Math.floor(y0 * S)), j1 = Math.min(N, Math.ceil(y1 * S));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const o = j * N + i; if (LV[o] > -99) continue; LV[o] = lossAt((i + 0.5) / S, (j + 0.5) / S); }
  }
  // pits: tiny round losses scattered over the page
  const RP = rng(`${ID}-pits`);
  const pits = [];
  for (let k = 0; k < 46; k++) {
    const px = RP() * 1000, py = 30 + RP() * 940;
    const insideKeep = (px > L.counter.x0 - 8 && px < L.counter.x1 + 8 && py > L.counter.y0 - 8 && py < L.counter.y1 + 8) || (px > L.title.x0 && px < L.title.x1 && py > L.title.y0 && py < L.title.y1);
    if (insideKeep) continue;
    pits.push([px, py, 1.2 + RP() * RP() * 3.4]);
  }
  for (const [px, py, r] of pits) {
    for (let j = Math.floor((py - r - 2) * S); j <= Math.ceil((py + r + 2) * S); j++) for (let i = Math.floor((px - r - 2) * S); i <= Math.ceil((px + r + 2) * S); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const x = (i + 0.5) / S, y = (j + 0.5) / S;
      const v = r - Math.hypot(x - px, y - py) + (vnoise(x / 1.5, y / 1.5, 83) - 0.5) * 1.2;
      const o = j * N + i; if (v > LV[o]) LV[o] = v;
    }
  }
  // ---- low-frequency stucco fields
  const tone = coarse(N, N, 10, (px, py) => fbm(px / (S * 320), py / (S * 280), 11, 3));
  const mott = coarse(N, N, 4, (px, py) => fbm(px / (S * 36), py / (S * 36), 12, 3));
  const smear = coarse(N, N, 5, (px, py) => fbm(px / (S * 160), py / (S * 7), 13, 2));
  const fib = coarse(N, N, 3, (px, py) => fbm(px / (S * 60), py / (S * 1.6), 14, 2));
  const ST = hexRGB(C.stucco), BK = hexRGB(C.bark), BD = hexRGB(C.backdrop);
  const base = new Uint8ClampedArray(NN * 4);     // stucco / bark / backdrop
  const loss = new Uint8ClampedArray(NN * 4);     // overlay: bark + backdrop + chipped rims (alpha)
  const edgeD = new Float32Array(NN);             // distance-ish to the page edge (for grime)
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) / S;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / S;
      const o = j * N + i, q = o * 4;
      const yt = topEdge(x), yb = botEdge(x);
      const barkT = yt - 3 - 3.5 * vnoise(x / 14, 0.5, 75), barkB = yb + 3 + 3.5 * vnoise(x / 14, 4.5, 76);
      const de = Math.min(y - yt, yb - y, Math.abs(x - FOLD) * 1.4);
      edgeD[o] = de;
      const lv = LV[o];
      let r, g, b, la = 0;
      if (y < barkT || y > barkB) {
        const n = 0.85 + 0.3 * vnoise(x / 40, y / 40, 77) + 0.06 * (hash3(i, j, 78) - 0.5);
        r = BD[0] * n; g = BD[1] * n; b = BD[2] * n; la = 255;
        // soft shadow cast by the page onto the backdrop
        const dd = y < barkT ? barkT - y : y - barkB;
        const sh = 0.55 + 0.45 * sm(0, 10, dd);
        r *= sh; g *= sh; b *= sh;
      } else if (lv > 0 || y < yt || y > yb) {
        // bark paper: warm brown with fibres running along the strip
        const fv = fib[o];
        const n = 0.8 + 0.42 * fv + 0.08 * (hash3(i, j, 79) - 0.5) + 0.1 * (mott[o] - 0.5);
        r = BK[0] * n; g = BK[1] * n; b = BK[2] * n;
        // the stucco edge shadows the bark just inside the loss
        const sh = lv > 0 ? 0.62 + 0.38 * sm(0, 3.2, lv) : 1;
        r *= sh; g *= sh; b *= sh;
        la = 255;
      } else {
        const t = tone[o], m = mott[o];
        let br = 0.985 + 0.06 * (t - 0.5) + 0.035 * (m - 0.5) + 0.02 * (smear[o] - 0.5) + 0.03 * (hash3(i, j, 80) - 0.5);
        // yellowing and grime toward the edges and the fold
        const yl = 1 - sm(0, 70, de);
        br *= 1 - 0.07 * yl;
        r = ST[0] * br; g = ST[1] * br * (1 - 0.02 * yl); b = ST[2] * br * (1 - 0.07 * yl - 0.03 * (t - 0.5));
        // the previous page is angled away: darker, warmer
        if (x < FOLD) { const f = 0.84 + 0.06 * sm(0, 80, FOLD - x); r *= f; g *= f * 0.99; b *= f * 0.96; }
        // chipped rim: fresh stucco is lighter right at the edge of a loss
        if (lv > -2.2) { const hi = sm(-2.2, 0, lv); r += (250 - r) * 0.45 * hi; g += (246 - g) * 0.45 * hi; b += (232 - b) * 0.45 * hi; la = 120 * hi; }
      }
      base[q] = r; base[q + 1] = g; base[q + 2] = b; base[q + 3] = 255;
      // near the seams the rider's band keeps its losses UNDER the paint (the pelican stays whole at a crossing)
      if (y > 452 && y < 842 && (x < 236 || x > 764)) la = 0;
      if (la > 0) { loss[q] = r; loss[q + 1] = g; loss[q + 2] = b; loss[q + 3] = la; }
    }
  }
  // ---- static paint, aged and laid into the stucco (the previous page more worn)
  const paint = (P, clipFn, region) => {
    const r = rasterAged(region, (x) => { x.save(); clipFn(x); paintStatic(x, K); x.restore(); }, P);
    for (let j = 0; j < r.h; j++) {
      const gj = r.j0 + j; if (gj < 0 || gj >= N) continue;
      for (let i = 0; i < r.w; i++) {
        const gi = r.i0 + i; if (gi < 0 || gi >= N) continue;
        const k = (j * r.w + i) * 4, a = r.px[k + 3] / 255;
        if (a <= 0.003) continue;
        const o = gj * N + gi, q = o * 4;
        if (LV[o] > 0) continue;
        // paint sits in the stucco: it takes the ground's tone variation
        const gt = base[q + 1] / ST[1];
        base[q] += (r.px[k] * gt - base[q]) * a;
        base[q + 1] += (r.px[k + 1] * gt - base[q + 1]) * a;
        base[q + 2] += (r.px[k + 2] * gt - base[q + 2]) * a;
      }
    }
  };
  paint(P_PAGE, (x) => { x.beginPath(); x.rect(FOLD + 1.5, -10, 1020, 1020); x.clip(); }, [0, 0, 1000, 1000]);
  paint(P_NEIGH, (x) => { x.beginPath(); x.rect(-10, -10, FOLD - 8.5, 1020); x.clip(); }, [0, 0, FOLD + 2, 1000]);
  // ---- multiply overlay: grain, craquelure, fold crease, grime (white = no effect)
  const mult = new Uint8ClampedArray(NN * 4);
  for (let o = 0; o < NN; o++) {
    const q = o * 4, i = o % N, j = (o / N) | 0;
    let v = 1 - 0.06 * hash3(i, j, 91) - 0.05 * (mott[o] > 0.55 ? (mott[o] - 0.55) * 2.2 : 0);
    v *= 0.955 + 0.06 * tone[o];
    v *= 1 - 0.14 * (1 - sm(0, 34, edgeD[o]));
    const xu = (i + 0.5) / S;
    const fd = xu - FOLD;
    if (fd > -6 && fd < 22) v *= 1 - 0.18 * Math.exp(-Math.abs(fd - 1) / (fd > 0 ? 6 : 2));
    // warm patina: multiply leans yellow-brown
    mult[q] = 255 * v; mult[q + 1] = 255 * v * (0.992 - 0.02 * (1 - v)); mult[q + 2] = 255 * v * (0.975 - 0.05 * (1 - v)); mult[q + 3] = 255;
  }
  const mc = mkCanvas(N, N), mx = ctx2d(mc);
  mx.putImageData(new ImageData(mult, N, N), 0, 0);
  mx.setTransform(S, 0, 0, S, 0, 0);
  mx.lineCap = 'round'; mx.lineJoin = 'round';
  // stains: tide-marked water stains and foxing
  const RS = rng(`${ID}-stains`);
  for (let k = 0; k < 16; k++) {
    const cx = RS() * 1000, cy = RS() < 0.5 ? (RS() < 0.5 ? 40 + RS() * 160 : 840 + RS() * 120) : RS() * 1000, rad = 30 + RS() * 110;
    const g = mx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    const a = 0.05 + RS() * 0.07;
    g.addColorStop(0, `rgba(170,125,70,${a * 0.7})`); g.addColorStop(0.7, `rgba(165,118,62,${a})`); g.addColorStop(0.88, `rgba(150,106,56,${a * 1.15})`); g.addColorStop(1, 'rgba(160,120,70,0)');
    mx.fillStyle = g; mx.beginPath(); mx.arc(cx, cy, rad, 0, TAU); mx.fill();
  }
  for (let k = 0; k < 70; k++) {
    const cx = RS() * 1000, cy = RS() * 1000, rad = 1.5 + RS() * 6;
    const g = mx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(150,100,50,${0.12 + RS() * 0.15})`); g.addColorStop(1, 'rgba(150,100,50,0)');
    mx.fillStyle = g; mx.beginPath(); mx.arc(cx, cy, rad, 0, TAU); mx.fill();
  }
  const RC = rng(`${ID}-cracks`);
  const crack = (x0, y0, a0, len, w) => {
    const walk = (px, py, a, Lm, ww, depth) => {
      const pts = [[px, py]]; let d = 0;
      while (d < Lm) { const st = 2.2 + RC() * 4; a += (RC() - 0.5) * 0.7; px += Math.cos(a) * st; py += Math.sin(a) * st; d += st; pts.push([px, py]); if (depth < 2 && RC() < 0.06) walk(px, py, a + (RC() < 0.5 ? -1 : 1) * (0.7 + RC() * 0.8), Lm * (0.2 + RC() * 0.3), ww * 0.7, depth + 1); }
      for (let k = 1; k < pts.length; k++) {
        mx.strokeStyle = `rgba(92,70,44,${0.55 + RC() * 0.3})`; mx.lineWidth = ww * (0.5 + 0.8 * vnoise(k * 0.3, x0, 92));
        mx.beginPath(); mx.moveTo(pts[k - 1][0], pts[k - 1][1]); mx.lineTo(pts[k][0], pts[k][1]); mx.stroke();
      }
    };
    walk(x0, y0, a0, len, w, 0);
  };
  // craquelure: many short cracks near the edges and the fold, a few long ones across the page
  for (let k = 0; k < 70; k++) {
    const side = RC();
    let x0, y0, a0;
    if (side < 0.35) { x0 = RC() * 1000; y0 = topEdge(x0) + 4 + RC() * 40; a0 = Math.PI / 2 + (RC() - 0.5) * 1.6; }
    else if (side < 0.7) { x0 = RC() * 1000; y0 = botEdge(x0) - 4 - RC() * 40; a0 = -Math.PI / 2 + (RC() - 0.5) * 1.6; }
    else { x0 = FOLD + (RC() - 0.3) * 30; y0 = RC() * 1000; a0 = (RC() < 0.5 ? 0 : Math.PI) + (RC() - 0.5) * 1.4; }
    crack(x0, y0, a0, 14 + RC() * 50, 0.6 + RC() * 0.6);
  }
  crack(1004, 380, Math.PI * 0.94, 260, 1.0);
  crack(560, 1004, -Math.PI * 0.55, 160, 0.9);
  crack(300, -2, Math.PI * 0.42, 150, 0.8);
  crack(700, 236, Math.PI * 0.62, 120, 0.7);
  // fold crease: a dark line with a lit ridge beside it
  mx.strokeStyle = 'rgba(60,44,30,0.8)'; mx.lineWidth = 1.3;
  mx.beginPath(); mx.moveTo(FOLD - 0.5, -2); mx.lineTo(FOLD + 0.5, 1002); mx.stroke();
  // ---- canvases
  const bc = mkCanvas(N, N); ctx2d(bc).putImageData(new ImageData(base, N, N), 0, 0);
  const lc = mkCanvas(N, N); ctx2d(lc).putImageData(new ImageData(loss, N, N), 0, 0);
  return { base: bc, mult: mc, loss: lc };
}

// ------------------------------------------------------------------ sprites
const D = L.deity, M = L.monkey;
const placeDeity = (x, facing) => { x.translate(D.x, D.y); x.scale(D.s * (facing === 'L' ? -1 : 1), D.s); };
const placeMonkey = (x, facing) => { x.translate(M.x, M.y); x.scale(M.s * (facing === 'L' ? -1 : 1), M.s); };

const FLOAT = [   // floating glyph blocks of the main register (they breathe on downbeats)
  { key: 'fl0', cx: 537, cy: 290, size: 60, o: { layout: 'sup', main: 'venus' } },
  { key: 'fl1', cx: 537, cy: 356, size: 60, o: { layout: 'pre', pre: 'num', n: 4, main: 'muluc' } },
  { key: 'fl2', cx: 537, cy: 422, size: 60, o: { main: 'head', layout: 'sup', sup: 'te' } },
  { key: 'fl3', cx: 478, cy: 586, size: 54, o: { main: 'spiral', layout: 'sup', sup: 'dots' } },
  { key: 'fl4', cx: 478, cy: 646, size: 54, o: { main: 'imix', layout: 'pre', pre: 'num', n: 3 } },
  { key: 'fl5', cx: 966, cy: 300, size: 46, o: { main: 'kin', layout: 'sup' } },
];
const NAMEC = [   // the four blocks that rearrange into the pelican's name glyph at u = 2
  { key: 'nc0', dx: -32, dy: -32, o: { main: 'ik', layout: 'sup' } },
  { key: 'nc1', dx: 32, dy: -32, o: { main: 'crossed' } },
  { key: 'nc2', dx: -32, dy: 32, o: { main: 'akbal', layout: 'pre' } },
  { key: 'nc3', dx: 32, dy: 32, o: { main: 'kan', layout: 'pre', pre: 'num', n: 1 } },
];

function spriteList() {
  const list = [];
  const deityRegion = [D.x - 92, D.y - 214, D.x + 92, D.y + 6];
  for (const [key, pose, facing] of [['deity:L', 'pour', 'L'], ['deity:Rp', 'point', 'R'], ['deity:R', 'hold', 'R']]) {
    list.push({ key, region: deityRegion, P: P_SPR, paint: (x) => { x.save(); placeDeity(x, facing); drawDeity(x, pose); x.restore(); } });
  }
  const sg = streamGeom();
  for (let k = 0; k < 3; k++) list.push({ key: `stream:${k}`, region: [sg.top[0] - 70, sg.top[1] - 10, sg.top[0] + 30, L.road[0] + 6], P: P_SPR, paint: (x) => drawStream(x, k) });
  const mReg = [M.x - 160, M.y - 230, M.x + 165, M.y + 116];
  const mStates = [['doze', 0, 'L'], ['doze', 1, 'L'], ['startle', 0, 'L'], ['startle', 1, 'L'], ['awake', 0, 'L'], ['awake', 1, 'L'],
    ['frantic', 0, 'L'], ['frantic', 1, 'L'], ['frantic', 2, 'L'], ['stamp', 0, 'L'], ['dab', 0, 'L'], ['proud', 0, 'R'], ['proud', 1, 'R']];
  for (const [pose, k, facing] of mStates) list.push({ key: `monkey:${pose}:${k}`, region: mReg, P: P_SPR, paint: (x) => { x.save(); placeMonkey(x, facing); drawMonkey(x, { pose, k }); x.restore(); } });
  for (const f of FLOAT) list.push({ key: f.key, region: [f.cx - f.size * 0.6, f.cy - f.size * 0.6, f.cx + f.size * 0.6, f.cy + f.size * 0.6], P: P_SPR, paint: (x) => drawGlyph(x, glyphSpec(`${ID}-${f.key}`, f.o), f.cx, f.cy, f.size) });
  for (const c of NAMEC) { const cx = L.name.cx + c.dx, cy = L.name.cy + c.dy; list.push({ key: c.key, region: [cx - 38, cy - 38, cx + 38, cy + 38], P: P_SPR, paint: (x) => drawGlyph(x, glyphSpec(`${ID}-${c.key}`, c.o), cx, cy, 60) }); }
  list.push({ key: 'name', region: [L.name.cx - 72, L.name.cy - 72, L.name.cx + 72, L.name.cy + 72], P: P_SPR, paint: (x) => drawNameGlyph(x, L.name.cx, L.name.cy, L.name.size) });
  // numeral parts, centred at a fixed page spot (aged with that spot's wear)
  const at = (cx, cy, fn) => (x) => { x.save(); x.translate(cx, cy); fn(x); x.restore(); };
  list.push({ key: 'barR', region: [CELL.bot.cx - 40, CELL.bot.cy - 10, CELL.bot.cx + 40, CELL.bot.cy + 10], P: P_SPR, paint: at(CELL.bot.cx, CELL.bot.cy, (x) => partBar(x, C.red)) });
  list.push({ key: 'dotR', region: [CELL.bot.cx - 10, CELL.bot.cy - 10, CELL.bot.cx + 10, CELL.bot.cy + 10], P: P_SPR, paint: at(CELL.bot.cx, CELL.bot.cy, (x) => partDot(x, C.red)) });
  list.push({ key: 'barK', region: [CELL.top.cx - 40, CELL.top.cy - 10, CELL.top.cx + 40, CELL.top.cy + 10], P: P_SPR, paint: at(CELL.top.cx, CELL.top.cy, (x) => partBar(x, C.black)) });
  list.push({ key: 'dotK', region: [CELL.top.cx - 10, CELL.top.cy - 10, CELL.top.cx + 10, CELL.top.cy + 10], P: P_SPR, paint: at(CELL.top.cx, CELL.top.cy, (x) => partDot(x, C.black)) });
  list.push({ key: 'shell', region: [CELL.bot.cx - 42, CELL.bot.cy - 26, CELL.bot.cx + 42, CELL.bot.cy + 26], P: P_SPR, paint: at(CELL.bot.cx, CELL.bot.cy, (x) => { x.scale(1.25, 1.25); partShell(x); }) });
  // ink splats (the scribe's mess)
  for (let k = 0; k < 3; k++) list.push({ key: `splat${k}`, region: [-10, -10, 10, 10], P: P_SPR, paint: (x) => { const R = rng(`${ID}-splat-${k}`); circ(x, 0, 0, 3.2 + k * 0.6, C.black, 0); for (let q = 0; q < 5; q++) { const a = R() * TAU, d = 4 + R() * 4; circ(x, Math.cos(a) * d, Math.sin(a) * d, 0.8 + R() * 1.1, C.black, 0); } } });
  return list;
}

function buildAll(K) {
  const page = buildPage(K);
  const sprites = [];
  for (const it of spriteList()) {
    const r = rasterAged(it.region, it.paint, it.P);
    let a0 = r.w, a1 = -1, b0 = r.h, b1 = -1;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (r.px[(j * r.w + i) * 4 + 3] > 2) { if (i < a0) a0 = i; if (i > a1) a1 = i; if (j < b0) b0 = j; if (j > b1) b1 = j; }
    if (a1 < 0) continue;
    const tw = a1 - a0 + 1, th = b1 - b0 + 1;
    const px = new Uint8ClampedArray(tw * th * 4);
    for (let j = 0; j < th; j++) px.set(r.px.subarray(((j + b0) * r.w + a0) * 4, ((j + b0) * r.w + a0 + tw) * 4), j * tw * 4);
    sprites.push({ key: it.key, i0: r.i0 + a0, j0: r.j0 + b0, w: tw, h: th, px });
  }
  const AW = 2048, PAD = 2;
  const order = sprites.slice().sort((p, q) => q.h - p.h);
  let cx = PAD, cy = PAD, rowH = 0;
  for (const sp of order) {
    if (cx + sp.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
    sp.ax = cx; sp.ay = cy; cx += sp.w + PAD; rowH = Math.max(rowH, sp.h);
  }
  const AH = Math.ceil((cy + rowH + PAD) / 64) * 64;
  const atlas = mkCanvas(AW, AH), ax = ctx2d(atlas);
  for (const sp of sprites) ax.putImageData(new ImageData(sp.px, sp.w, sp.h), sp.ax, sp.ay);
  const map = new Map();
  for (const sp of sprites) map.set(sp.key, { x: sp.i0 / S, y: sp.j0 / S, w: sp.w / S, h: sp.h / S, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  BUILT = { page, atlas, AW, AH, map, n: sprites.length };
}

function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}

// ------------------------------------------------------------------ the pelican, painted live as a codex figure
const BIKE_LINES = new Set(['frame', 'fork', 'stem', 'bars', 'seatpost']);
function paintPelican(x, P, parts) {
  const B = P.bird;
  const LW = 2.4;
  const bikeLines = parts.filter((p) => BIKE_LINES.has(p.role));
  let bikeDone = false;
  const drawBike = () => {
    // banded tubes: black contour, red core, blue bands
    for (const p of bikeLines) stroke(x, p.pts, 7.6, C.black, false);
    for (const p of bikeLines) stroke(x, p.pts, 3.6, C.red, false);
    x.setLineDash([6, 7]);
    bikeLines.forEach((p, k) => { x.lineDashOffset = k * 3; stroke(x, p.pts, 3.6, C.blue, false, 'butt'); });
    x.setLineDash([]); x.lineDashOffset = 0;
    bikeDone = true;
  };
  for (const part of parts) {
    const r = part.role;
    if (BIKE_LINES.has(r)) { if (!bikeDone) drawBike(); continue; }
    switch (r) {
      case 'legFar': shp(x, part.pts, C.far, LW * 0.9, false); break;
      case 'footFar': shp(x, part.pts, C.far, LW * 0.8, false); break;
      case 'crankFar': stroke(x, part.pts, 4.6, C.black, false); break;
      case 'tire': {
        const k = +part.name.slice(4), wh = P.bike.wheels[k];
        const c = part.c, rr = part.r;
        x.beginPath(); x.arc(c[0], c[1], rr - 4.2, 0, TAU); x.lineWidth = 8.4; x.strokeStyle = C.black; x.stroke();
        x.beginPath(); x.arc(c[0], c[1], rr - 4.2, 0, TAU); x.lineWidth = 4.6; x.strokeStyle = C.red; x.stroke();
        for (let j = 0; j < 8; j++) { const a = wh.angle + (j + 0.5) * Math.PI / 4; circ(x, c[0] + Math.cos(a) * (rr - 4.2), c[1] + Math.sin(a) * (rr - 4.2), 1.5, C.white, 0); }
        break;
      }
      case 'rim': x.beginPath(); x.arc(part.c[0], part.c[1], part.r * 0.86, 0, TAU); x.lineWidth = 1.6; x.strokeStyle = C.black; x.stroke(); break;
      case 'spoke': stroke(x, part.pts, 2.0, C.black, false); break;
      case 'hub': circ(x, part.c[0], part.c[1], 5.4, C.blue, 2); circ(x, part.c[0], part.c[1], 1.6, C.black, 0); break;
      case 'chain': x.setLineDash([2.6, 2.4]); stroke(x, part.pts, 1.8, C.black, false, 'butt'); x.setLineDash([]); break;
      case 'saddle': stroke(x, part.pts, 7.6, C.black); stroke(x, part.pts, 3.4, C.red); break;
      case 'ring': circ(x, part.c[0], part.c[1], part.r, C.yellow, 2.4); circ(x, part.c[0], part.c[1], part.r * 0.45, C.red, 1.6); break;
      case 'tail': shp(x, part.pts, C.white, LW, false); stroke(x, [part.pts[1], part.pts[2]], 4, C.blue, false); break;
      case 'body': {
        shp(x, part.pts, C.white, LW, true);
        // breast feathers: little scallops
        const bc = B.bodyC;
        for (let k = 0; k < 4; k++) { const px = bc[0] + 26 + k * 7, py = bc[1] + 18 - k * 5; x.beginPath(); x.arc(px, py, 3.2, 0.2, Math.PI - 0.2); x.lineWidth = 1.3; x.strokeStyle = C.black; x.stroke(); }
        break;
      }
      case 'wing': {
        shp(x, part.pts, C.blue, LW, true);
        x.save(); x.beginPath(); pathCR(x, part.pts, true); x.clip();
        const sc = B.secondaries;
        for (const off of [8, 17, 26]) {
          for (let k = 0; k < sc.length - 1; k += 2) { const p = sc[k]; x.beginPath(); x.arc(p[0] + off * 0.25, p[1] - off, 4.2, 0.1, Math.PI - 0.1); x.lineWidth = 1.4; x.strokeStyle = C.black; x.stroke(); }
        }
        // a red covert band along the leading edge
        stroke(x, [B.shoulder, [B.bodyC[0] - 4, B.bodyC[1] - 30], [B.bodyC[0] - 36, B.bodyC[1] - 22]], 5, C.red);
        x.restore();
        shp(x, part.pts, null, LW, true);
        break;
      }
      case 'secondaries': {
        stroke(x, part.pts, 2.4);
        for (let k = 1; k < part.pts.length - 1; k += 2) { const p = part.pts[k]; x.beginPath(); x.arc(p[0], p[1] + 2, 3.6, 0, Math.PI); x.lineWidth = 1.6; x.strokeStyle = C.black; x.stroke(); }
        break;
      }
      case 'primary': {
        const n = part.pts.length, cut = Math.floor(n * 0.62);
        stroke(x, part.pts, 7.2, C.black);
        stroke(x, part.pts.slice(0, cut + 1), 3.6, C.blue);
        stroke(x, part.pts.slice(cut), 3.6, C.red);
        break;
      }
      case 'neck': {
        shp(x, part.pts, C.white, 0, false);
        const n = part.pts.length / 2;
        stroke(x, part.pts.slice(0, n), LW, C.black, false);
        stroke(x, part.pts.slice(n), LW, C.black, false);
        break;
      }
      case 'head': circ(x, part.c[0], part.c[1], part.r, C.white, LW); break;
      case 'crest': stroke(x, part.pts, 5.4, C.black, false); stroke(x, part.pts, 2.4, C.red, false); break;
      case 'pouch': {
        shp(x, part.pts, C.yellow, LW, false);
        const J = B.lowerJawLine;
        stroke(x, [[lerp(J[0][0], J[1][0], 0.15), lerp(J[0][1], J[1][1], 0.15) + 8], [lerp(J[0][0], J[1][0], 0.45), lerp(J[0][1], J[1][1], 0.45) + 13], [lerp(J[0][0], J[1][0], 0.75), lerp(J[0][1], J[1][1], 0.75) + 8]], 1.3);
        break;
      }
      case 'bill': {
        shp(x, part.pts, C.yellow, LW, false);
        const U = part.pts;
        // a red band at the base and a row of dots along the culmen (bird-glyph beak)
        stroke(x, [[lerp(U[0][0], U[1][0], 0.18), lerp(U[0][1], U[1][1], 0.18)], [lerp(U[7][0], U[6][0], 0.18), lerp(U[7][1], U[6][1], 0.18)]], 4.4, C.red, false, 'butt');
        for (let k = 1; k <= 5; k++) { const t = 0.2 + k * 0.12; const p = [lerp(U[1][0], U[2][0], t), lerp(U[1][1], U[2][1], t)], q = [lerp(U[6][0], U[5][0], t), lerp(U[6][1], U[5][1], t)]; circ(x, lerp(p[0], q[0], 0.4), lerp(p[1], q[1], 0.4), 1.1, C.black, 0); }
        stroke(x, B.lowerJawLine, 1.4, C.black, false);
        break;
      }
      case 'nail': shp(x, part.pts, C.red, 1.6, false); break;
      case 'face': break;
      case 'eye': circ(x, part.c[0], part.c[1], part.r + 2.4, C.red, 1.4); circ(x, part.c[0], part.c[1], part.r, C.white, 1.4); break;
      case 'pupil': circ(x, part.c[0], part.c[1], Math.max(1.4, part.r), C.black, 0); break;
      case 'eyeShut': stroke(x, part.pts, 2.2); break;
      case 'leg': shp(x, part.pts, C.red, LW, false); break;
      case 'foot': shp(x, part.pts, C.red, LW * 0.9, false); break;
      case 'crank': stroke(x, part.pts, 5.2, C.black, false); break;
      case 'pedal': stroke(x, part.pts, 6.4, C.black, false); stroke(x, part.pts, 2.4, C.yellow, false); break;
      default: break;
    }
  }
}

let PEL = null;
function pelBuffers() {
  if (PEL) return PEL;
  const PW = 640, PH = 560;
  const img = createImage(PW, PH);
  const pat = img.drawingContext.createPattern(wearCanvas(), 'repeat');
  PEL = { PW, PH, img, pat };
  return PEL;
}

function drawPelican(K, rider, view) {
  const P = rider.placed;
  const parts = K.rig.parts(P);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const ext = (p, r = 0) => { if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r; if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r; };
  for (const part of parts) { if (part.kind === 'circle') ext(part.c, part.r + 4); else for (const p of part.pts) ext(p, 6); }
  x0 = Math.max(x0 - 6, 0, view.x0 - 4); y0 = Math.max(y0 - 6, 0); x1 = Math.min(x1 + 6, 1000, view.x1 + 4); y1 = Math.min(y1 + 6, 1000);
  if (x1 <= x0 || y1 <= y0) return;
  const B = pelBuffers();
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(B.PW, Math.ceil(x1 * S) - i0), h = Math.min(B.PH, Math.ceil(y1 * S) - j0);
  const x = B.img.drawingContext;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, B.PW, B.PH);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  paintPelican(x, P, parts);
  // pigment wear, fixed to the page
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  B.pat.setTransform(new DOMMatrix([1, 0, 0, 1, -i0, -j0]));
  x.fillStyle = B.pat;
  x.globalAlpha = 0.8;
  x.fillRect(0, 0, w, h);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  B.img.setModified(true);
  image(B.img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

// ------------------------------------------------------------------ the counter
const NUMLAY = { bh: 13, bg: 6, dd: 15, dg: 3.6, gap: 8 };
/** Positions of bar / dot parts for `bars` bars and `dots` dots centred in a cell. */
function placeLayout(bars, dots, cx, cy) {
  const Lq = NUMLAY;
  const hB = bars ? bars * Lq.bh + (bars - 1) * Lq.bg : 0, hD = dots ? Lq.dd : 0, g = bars && dots ? Lq.gap : 0;
  let y = cy - (hB + hD + g) / 2;
  const out = [];
  if (dots) { const W = dots * Lq.dd + (dots - 1) * Lq.dg; for (let k = 0; k < dots; k++) out.push({ k: 'dot', x: cx - W / 2 + Lq.dd / 2 + k * (Lq.dd + Lq.dg), y: y + Lq.dd / 2, i: k }); y += Lq.dd + g; }
  for (let b = 0; b < bars; b++) { out.push({ k: 'bar', x: cx, y: y + Lq.bh / 2, i: b }); y += Lq.bh + Lq.bg; }
  return out;
}

// ------------------------------------------------------------------ states on the beat
const beatOf = (u) => Math.floor(u * 2 + 1e-6);
function deityKey(u) { return u < 2 ? 'deity:L' : u < 4.5 ? 'deity:Rp' : 'deity:R'; }
function monkeyKey(u) {
  if (u < 0) return `monkey:doze:${beatOf(u) & 1}`;
  if (u < 0.5) return `monkey:startle:${Math.floor(u * 16) & 1}`;
  if (u >= 2.5 && u < 3.5) return `monkey:frantic:${Math.floor((u - 2.5) * 16) % 3}`;
  if (u >= 4 && u < 4.3) return 'monkey:stamp:0';
  if (u >= 6.25) return `monkey:proud:${beatOf(u) & 1}`;
  if (u >= 0.5 && u - Math.floor(u) < 0.2) return 'monkey:dab:0';   // each new revolution: dab a dot
  return `monkey:awake:${beatOf(u) & 1}`;
}
/** Downbeat breath: a quick swell after every downbeat (bars of 2 s). */
function breath(u) { const ph = ((u % 2) + 2) % 2; return Math.exp(-ph / 0.22) * (1 - Math.exp(-ph / 0.04)); }

// ------------------------------------------------------------------ scene
export default {
  freezeU: 2.6,
  // No hold: the crank is then exactly 36 + u revolutions, so each tally dot lands on a beat and the place
  // value rolls (39 → 40) on the u = 4 downbeat. (With a bar-2 hold the 40th turn would complete at u ≈ 4.3.)
  ride: {},
  cues: [
    { u: 0, name: 'scribeWakes' }, { u: 0, name: 'dotsOn' }, { u: 1, name: 'dotsOn' }, { u: 2, name: 'dotsOn' }, { u: 2, name: 'deityPoints' },
    { u: 2.15, name: 'nameGlyph' }, { u: 2.5, name: 'scribeFrantic' }, { u: 3, name: 'dotsOn' }, { u: 4, name: 'placeRoll' },
    { u: 5, name: 'dotsOn' }, { u: 6, name: 'dotsOn' }, { u: 6, name: 'scribeProud' },
  ],

  async init(K) {
    if (!BUILT) buildAll(K);
    const pg = toImage(BUILT.page.base), at = toImage(BUILT.atlas), mu = toImage(BUILT.page.mult), lo = toImage(BUILT.page.loss);
    this.page = K.bake('page', N, N, (K2, w, h) => { image(pg, 0, 0, w, h); });
    this.atlas = K.bake('atlas', BUILT.AW, BUILT.AH, (K2, w, h) => { image(at, 0, 0, w, h); });
    this.mult = K.bake('mult', N, N, (K2, w, h) => { image(mu, 0, 0, w, h); });
    this.loss = K.bake('loss', N, N, (K2, w, h) => { image(lo, 0, 0, w, h); });
    this.map = BUILT.map;
    this.stats = { sprites: BUILT.n, atlas: [BUILT.AW, BUILT.AH], bakeMB: (3 * N * N * 4 + BUILT.AW * BUILT.AH * 4) / 1048576 };
  },

  mods(u) {
    const m = { spokes: 8 };
    const st = win(1.2, 4.8, u, 0.3);
    if (st > 1e-4) m.bob = 1 - 0.65 * st;                                // sits up stiffly, glyph-like
    const lb = win(2.1, 2.95, u, 0.15);
    if (lb > 1e-4) m.lookBack = 0.85 * lb;                               // glances back at the pointing deity
    if (u >= 4.0 && u < 4.4) m.eye = 'wide';                             // the stamp right above its head
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    const map = this.map, atlas = this.atlas;
    imageMode(CORNER);
    image(this.page, 0, 0, 1000, 1000);
    const spr = (key, s = 1, ox = 0, oy = 0, pcx = null, pcy = null, alpha = 1) => {
      const sp = map.get(key);
      if (!sp) return;
      const cx = pcx ?? sp.x + sp.w / 2, cy = pcy ?? sp.y + sp.h / 2;
      const X = cx + (sp.x - cx) * s + ox, Y = cy + (sp.y - cy) * s + oy;
      if (X > v.x1 || X + sp.w * s < v.x0) return;
      if (alpha < 1) { push(); tint(255, 255 * alpha); }
      image(atlas, X, Y, sp.w * s, sp.h * s, sp.ax, sp.ay, sp.aw, sp.ah);
      if (alpha < 1) pop();
    };
    const br = breath(u);
    // ---- the deity's water stream (cut at the spout when it turns, the rest falls)
    if (u < 2.45) {
      const sp = map.get(`stream:${Math.floor(u * 8 + 64) % 3}`);
      if (sp) {
        const fall = u < 2 ? 0 : 14 + 260 * (u - 2) + 0.5 * 2600 * (u - 2) * (u - 2);
        const cut = Math.min(sp.h, fall);
        if (cut < sp.h - 2) image(atlas, sp.x, sp.y + cut, sp.w, sp.h - cut, sp.ax, sp.ay + cut * S, sp.aw, sp.ah - cut * S);
      }
    }
    // ---- floating glyphs (breathing on downbeats)
    for (const f of FLOAT) spr(f.key, 1 + 0.045 * br, 0, 0, f.cx, f.cy);
    // ---- the name cluster → the pelican's name glyph
    const tN = u - 2;
    if (tN < 0.32) {
      for (const c of NAMEC) {
        const k = clamp01(tN / 0.3), e = k * k;
        const s = (1 + 0.045 * br) * (1 - 0.55 * e);
        spr(c.key, s, -c.dx * e * 0.9, -c.dy * e * 0.9, L.name.cx + c.dx, L.name.cy + c.dy, 1 - e * 0.7);
      }
    }
    if (tN >= 0.18) spr('name', easeOutBack((tN - 0.18) / 0.3) * (1 + 0.045 * br * (tN > 0.6 ? 1 : 0)), 0, 0, L.name.cx, L.name.cy);
    // ---- the deity
    spr(deityKey(u));
    // ---- the counter
    this.drawCounter(u, ctx, spr);
    // ---- ink splats left by the frantic scribe
    for (const d of DROPS) if (d.splat && u >= d.land) spr(`splat${d.k % 3}`, 0.8, d.lx, d.ly, 0, 0);
    // ---- the monkey scribe
    spr(monkeyKey(u));
    // ---- the pelican
    if (ctx.rider.visible) drawPelican(K, ctx.rider, v);
    // ---- flying ink drops and the deity's sprinkle (in front)
    noStroke();
    for (const d of DROPS) {
      const a = u - d.t0;
      if (a < 0 || u >= d.land) continue;
      const px = d.x0 + d.vx * a, py = d.y0 + d.vy * a + 0.5 * 900 * a * a;
      fill(28, 23, 18, d.splat ? 255 : 255 * (1 - sm(d.land - d.t0 - 0.12, d.land - d.t0, a)));
      ellipse(px, py, 3.4, 4.6);
    }
    if (u >= 2 && u < 2.75) {
      for (const d of SPRAY) {
        const a = u - d.t0;
        if (a < 0 || a > 0.42) continue;
        const px = d.x0 + d.vx * a, py = d.y0 + d.vy * a + 0.5 * 700 * a * a;
        fill(C.black); ellipse(px, py, 6.4, 6.4);
        fill(C.blue); ellipse(px, py, 3.8, 3.8);
      }
    }
    // ---- the sheet: grain, cracks and crease (multiply), then the losses over everything
    blendMode(MULTIPLY); image(this.mult, 0, 0, 1000, 1000);
    blendMode(BLEND);
    image(this.loss, 0, 0, 1000, 1000);
  },

  drawCounter(u, ctx, spr) {
    const T = CELL.top, Bc = CELL.bot;
    const revs = ctx.rider.state.crank / TAU;
    const draw = (lay, place, pop = null) => {
      for (const p of lay) {
        const key = (p.k === 'bar' ? 'bar' : 'dot') + (place === 'top' ? 'K' : 'R');
        const cell = place === 'top' ? T : Bc;
        let s = 1;
        if (pop && pop(p)) s = pop(p);
        spr(key, s, p.x - cell.cx, p.y - cell.cy, cell.cx, cell.cy);
      }
    };
    const showValue = (val, popNewest) => {
      const hi = Math.floor(val / 20), lo = val % 20;
      if (val >= 20) draw(placeLayout(Math.floor(hi / 5), hi % 5, T.cx, T.cy), 'top');
      if (lo === 0) spr('shell');
      else {
        const lay = placeLayout(Math.floor(lo / 5), lo % 5, Bc.cx, Bc.cy);
        const dots = lo % 5;
        draw(lay, 'bot', popNewest ? (p) => (p.k === 'dot' && p.i === dots - 1 ? popNewest : 0) : null);
      }
    };
    if (u < 0) { spr('shell'); return; }
    if (u < 0.5) { showValue(Math.floor(36 * easeOut(u / 0.5) + 1e-6), null); return; }
    const val = Math.min(42, Math.floor(revs + 1e-6));
    const age = u >= 6 ? 9 : revs - Math.floor(revs);          // seconds since the newest revolution (1 rev / s)
    // the place-value roll at u = 4: a fifth dot, five dots fuse into a bar, four bars carry up as a dot
    const a4 = u - 4;
    if (val === 40 && a4 >= 0 && a4 < 0.5) {
      if (a4 < 0.1) {
        draw(placeLayout(0, 1, T.cx, T.cy), 'top');
        draw(placeLayout(3, 5, Bc.cx, Bc.cy), 'bot', (p) => (p.k === 'dot' && p.i === 4 ? 1 + 1.2 * Math.exp(-a4 / 0.03) : 0));
        return;
      }
      if (a4 < 0.22) {   // dots slide together into a bar
        const k = sm(0.1, 0.22, a4);
        draw(placeLayout(0, 1, T.cx, T.cy), 'top');
        const lay = placeLayout(3, 5, Bc.cx, Bc.cy);
        const dotY = lay[0].y;
        for (const p of lay) {
          if (p.k === 'bar') spr('barR', 1, p.x - Bc.cx, p.y - Bc.cy, Bc.cx, Bc.cy);
          else spr('dotR', 1, lerp(p.x, Bc.cx, k) - Bc.cx, dotY - Bc.cy, Bc.cx, Bc.cy, 1 - k);
        }
        spr('barR', 0.3 + 0.7 * k, 0, dotY - Bc.cy, Bc.cx, Bc.cy, k);
        return;
      }
      if (a4 < 0.36) {   // four bars squeeze into one dot and fly up into the twenties
        const k = sm(0.22, 0.36, a4);
        draw(placeLayout(0, 1, T.cx, T.cy), 'top');
        const lay4 = placeLayout(4, 0, Bc.cx, Bc.cy);
        for (const p of lay4) spr('barR', 1 - 0.75 * k, 0, lerp(p.y, Bc.cy, k) - Bc.cy, Bc.cx, Bc.cy, 1 - k * 0.6);
        const tgt = placeLayout(0, 2, T.cx, T.cy)[1];
        spr('dotK', 1 + 0.5 * k, lerp(Bc.cx, tgt.x, k) - T.cx, lerp(Bc.cy, tgt.y, k) - T.cy, T.cx, T.cy, Math.min(1, 0.35 + k * 2));
        return;
      }
      // stamp: two dots above, the shell slams in
      const k = (a4 - 0.36) / 0.14;
      draw(placeLayout(0, 2, T.cx, T.cy), 'top', (p) => (p.i === 1 ? 1 + 0.6 * Math.exp(-k * 3) : 0));
      spr('shell', 1 + 0.9 * Math.exp(-k * 3.2));
      // the stamp: ink spatters out of the cell
      const ag = a4 - 0.36;
      noStroke(); fill(28, 23, 18, 255 * (1 - sm(0.06, 0.14, ag)));
      for (let q = 0; q < 10; q++) {
        const ang = (q / 10) * TAU + 0.3, d = 42 + 90 * ag + (q % 3) * 6;
        ellipse(Bc.cx + Math.cos(ang) * d * 0.9, Bc.cy + Math.sin(ang) * d * 0.75, 3.4 - (q % 2), 3.4 - (q % 2));
      }
      return;
    }
    showValue(val, age < 0.14 && u < 6.2 ? 1 + 1.3 * Math.exp(-age / 0.04) : null);
  },
};

// ------------------------------------------------------------------ drops (deterministic tables)
const DROPS = (() => {   // ink flicked off the frantic brush, 2.5 … 3.5; some land as splats
  const out = [];
  const R = rng(`${ID}-drops`);
  for (let k = 0; k < 16; k++) {
    const t0 = 2.5 + k * 0.0625;
    const st = Math.floor(k % 3);
    const tip = monkeyTip('frantic', st);
    const vx = 50 + R() * 230, vy = -110 - R() * 200;
    // land on the page surface after ~0.45 s
    const T = 0.38 + R() * 0.2;
    const lx = tip[0] + vx * T, ly = tip[1] + vy * T + 0.5 * 900 * T * T;
    out.push({ k, t0, x0: tip[0], y0: tip[1], vx, vy, land: t0 + T, lx, ly: Math.min(ly, 795), splat: k % 3 === 1 });
  }
  return out;
})();
const SPRAY = (() => {   // the deity sprinkles the pelican as it points its jar
  const out = [];
  const R = rng(`${ID}-spray`);
  const J = deityJar('point'), m = jarMouth(J);
  const mx = L.deity.x + m[0] * L.deity.s, my = L.deity.y + m[1] * L.deity.s;
  for (let k = 0; k < 18; k++) out.push({ t0: 2.0 + R() * 0.3, x0: mx, y0: my, vx: 120 + R() * 200, vy: 120 + R() * 160 });
  return out;
})();
