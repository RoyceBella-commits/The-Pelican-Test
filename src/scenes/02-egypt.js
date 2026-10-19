// 02 · 埃及壁画 / Egyptian Tomb Painting · c. 1300 BCE
//
// A New Kingdom (18th–19th Dynasty) tomb-chapel wall — an original composition in the manner of the
// Theban paintings (Nebamun, Sennedjem): khekher frieze and block border, a marsh register (a fowler on a
// papyrus skiff, the thicket, birds rising, a cat, fish in zig-zag water), a yellow caption band carrying
// the title, and the main register — offering bearers, a scribe and the noble couple — whose ground line
// is the road; zig-zag water and a striped dado below.
//
// The gag: the procession has an UNFINISHED gap — the draughtsman's red canon grid (18 squares, sole to
// crown) and a red cartoon of a pelican on a bicycle. At u = 2 the rider stops dead and snaps into that
// cartoon, painted in the canonical composite view (frontal kohl eye, both wings raised in adoration,
// stiff profile legs, the bicycle flattened to a diagram with six-spoked chariot wheels). The scribe paints
// its cartouche 「鹈鹕测试」 stroke by stroke (2.5–3.0); the noble couple and the cat turn to look (3.0);
// at 3.6 the paint flakes back into the riding rig, which rides on.
//
// Technique (deterministic, built once in init; 0 live p5.brush marks):
//   • the plaster is a per-pixel field (tone, mottle, grain, soot under the ceiling, grime) at S px/unit;
//   • every painted shape is drawn crisp with Canvas2D (flat mineral colours, even outlines) and then
//     "painted" by paintPx(): pigment-specific granularity (Egyptian blue is a coarse frit), application
//     mottle, gypsum white slightly translucent, flakes lost along a wall-fixed field, soot;
//   • static paint → one wall bake; flip-book figures → one sprite atlas (a sprite per painted state);
//     the pelican is painted live each frame with the same pass (its grain stays fixed to the wall);
//   • cracks and plaster losses are one overlay drawn over everything, the pelican included.
import { profile } from '../beat/ride.js';
import { CRANK_DIST, WHEEL_R, panelLeft } from '../beat/timeline.js';
import { rng, smoothPath, ribbon } from '../kit/math.js';

const ID = 'egypt';
const S = 1.25;                       // px per panel unit for every raster of this panel
const N = Math.round(1000 * S);
const TAU = Math.PI * 2;
const RIDE = { hold: [2.05, 3.35], speed: 0, ramp: 0.3 };
// bottom bracket of the painted pelican during the freeze: chosen so the live crank stands at exactly half a
// turn there (far pedal forward) — the painted legs and the riding legs coincide at the snap and the dissolve
const X_F = CRANK_DIST * 8.5 - panelLeft(1);
const T_SNAP = 2.0, T_MELT = 3.6, T_MELT_END = 3.86;
const CART = { cx: 668, y0: 487, y1: 683, w: 64, size: 37 };    // the cartouche (painted 2.5 → 3.0)

// ------------------------------------------------------------------ palette
const C = {
  plaster: '#d9c39a', blue: '#2f6fa3', blueDk: '#234f78', green: '#3f8f6a', greenDk: '#2c6a4d',
  red: '#a6402a', redDk: '#7c2c1b', yellow: '#d6a23e', yellowLt: '#e5c070', black: '#1d1a17', white: '#f2ead8',
  skinM: '#a9502f', skinF: '#dcae62', skinOl: '#4e1d12', linen: '#eee6d2', sketch: '#b24a2e', pot: '#b2532f',
};
const LW = 1.2;

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

/** Low-frequency field sampled every `step` px and bilinearly upsampled to N×N (fn gets panel units). */
function coarseField(step, fn) {
  const gw = Math.ceil(N / step) + 2;
  const G = new Float32Array(gw * gw);
  for (let gj = 0; gj < gw; gj++) for (let gi = 0; gi < gw; gi++) G[gj * gw + gi] = fn((gi * step) / S, (gj * step) / S);
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const fy = j / step, gj = Math.floor(fy), ty = fy - gj;
    for (let i = 0; i < N; i++) {
      const fx = i / step, gi = Math.floor(fx), tx = fx - gi;
      const o = gj * gw + gi;
      const a = G[o], b = G[o + 1], c = G[o + gw], d = G[o + gw + 1];
      out[j * N + i] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

// ------------------------------------------------------------------ geometry helpers
function pathCR(x, P, closed = true) {
  const n = P.length;
  x.moveTo(P[0][0], P[0][1]);
  const L = closed ? n : n - 1;
  for (let i = 0; i < L; i++) {
    const p0 = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)];
    const p1 = P[i], p2 = P[(i + 1) % n];
    const p3 = closed ? P[(i + 2) % n] : P[Math.min(n - 1, i + 2)];
    x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) x.closePath();
}
function polyPath(x, P, closed = true) { x.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length; k++) x.lineTo(P[k][0], P[k][1]); if (closed) x.closePath(); }
const keyW = (W) => (t) => {
  if (typeof W === 'number') return W;
  if (t <= W[0][0]) return W[0][1];
  for (let k = 1; k < W.length; k++) if (t <= W[k][0]) return lerp(W[k - 1][1], W[k][1], (t - W[k - 1][0]) / (W[k][0] - W[k - 1][0]));
  return W[W.length - 1][1];
};
/** Tapered limb along a smooth spine; the far end can be rounded (capB). Outline it open (no line at the root). */
function limbPoly(pts, W, per = 6, capB = true) {
  const sp = pts.length > 2 ? smoothPath(pts, per) : [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]];
  const f = keyW(W);
  const n = sp.length;
  const rib = ribbon(sp, f);
  const left = rib.slice(0, n), right = rib.slice(n);
  let poly = left.concat(right);
  if (capB) {
    const b = sp[n - 1], a = sp[n - 2];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), r = f(1) / 2;
    const cap = [];
    for (let k = 1; k < 6; k++) { const t = ang + Math.PI / 2 - (k * Math.PI) / 6; cap.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]); }
    poly = left.concat(cap, right);
  }
  return { poly, sp, n, a: sp[0], b: sp[n - 1] };
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const nrm = (a) => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; };
const mixP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function ik2(sh, tgt, l1, l2, bend = 1) {
  const dx = tgt[0] - sh[0], dy = tgt[1] - sh[1];
  const d = Math.hypot(dx, dy) || 1;
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.5), l1 + l2 - 0.5);
  const ux = dx / d, uy = dy / d;
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc))));
  const ang = Math.atan2(uy, ux) + bend * a;
  return { el: [sh[0] + Math.cos(ang) * l1, sh[1] + Math.sin(ang) * l1], wr: [sh[0] + ux * dc, sh[1] + uy * dc] };
}
function halfDisc(cx, cy, rx, ry, n = 12) { const o = []; for (let k = 0; k <= n; k++) { const a = Math.PI + (k / n) * Math.PI; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
function ellPts(cx, cy, rx, ry, rot = 0, n = 24) { const o = []; const c = Math.cos(rot), s = Math.sin(rot); for (let k = 0; k < n; k++) { const a = (k / n) * TAU; const px = Math.cos(a) * rx, py = Math.sin(a) * ry; o.push([cx + px * c - py * s, cy + px * s + py * c]); } return o; }
function almond(cx, cy, hw, hh, n = 10) {
  const o = [];
  for (let k = 0; k <= n; k++) { const t = k / n; o.push([cx - hw + 2 * hw * t, cy - 0.15 * hh * t - hh * Math.pow(Math.sin(Math.PI * t), 0.85)]); }
  for (let k = n - 1; k > 0; k--) { const t = k / n; o.push([cx - hw + 2 * hw * t, cy - 0.15 * hh * t + 0.78 * hh * Math.pow(Math.sin(Math.PI * t), 0.9)]); }
  return o;
}

/** A tiny Canvas2D painter: flat fills, even outlines. All sizes in the current units. */
function painter(x) {
  const stroke = (lw, col) => { x.lineWidth = lw; x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke(); };
  return {
    x,
    poly(pts, fill, o = {}) {
      x.beginPath(); if (o.smooth) pathCR(x, pts, true); else polyPath(x, pts, true);
      if (fill) { x.fillStyle = fill; x.fill(); }
      const lw = o.lw ?? LW; if (lw > 0) stroke(lw, o.ol || C.black);
    },
    open(pts, col, lw, smooth = false) { x.beginPath(); if (smooth && pts.length > 2) pathCR(x, pts, false); else polyPath(x, pts, false); stroke(lw, col); },
    limb(L, fill, o = {}) {
      x.beginPath(); polyPath(x, L.poly, true);
      if (fill) { x.fillStyle = fill; x.fill(); }
      const lw = o.lw ?? LW; if (lw <= 0) return;
      x.beginPath(); polyPath(x, L.poly, false); stroke(lw, o.ol || C.black);
    },
    disc(cx, cy, r, fill, o = {}) {
      x.beginPath(); x.arc(cx, cy, r, 0, TAU);
      if (fill) { x.fillStyle = fill; x.fill(); }
      const lw = o.lw ?? LW; if (lw > 0) stroke(lw, o.ol || C.black);
    },
    rect(x0, y0, w, h, fill, o = {}) {
      x.beginPath(); x.rect(x0, y0, w, h);
      if (fill) { x.fillStyle = fill; x.fill(); }
      const lw = o.lw ?? 0; if (lw > 0) stroke(lw, o.ol || C.black);
    },
  };
}

// ------------------------------------------------------------------ the wall fields and the paint model
let F = null;   // { GRN, MOT, FLK, SOOT, DIS, W }

function buildFields() {
  const NN = N * N;
  const GRN = new Uint8Array(NN), MOT = new Uint8Array(NN), FLK = new Uint8Array(NN), SOOT = new Uint8Array(NN), DIS = new Uint8Array(NN);
  const W = new Float32Array(NN * 3);
  const tone = coarseField(10, (x, y) => fbm(x / 240, y / 170, 11, 3));
  const mot = coarseField(3, (x, y) => fbm(x / 11, y / 8, 12, 3));
  const flkA = coarseField(2, (x, y) => fbm(x / 3.4, y / 3.1, 13, 2));
  const flkB = coarseField(6, (x, y) => fbm(x / 60, y / 44, 14, 3));
  const sootF = coarseField(8, (x, y) => fbm(x / 110, y / 46, 15, 3));
  const dis = coarseField(3, (x, y) => 0.7 * fbm(x / 6, y / 6, 16, 2) + 0.3 * vnoise(x / 1.6, y / 1.6, 17));
  const P0 = [217, 195, 154];
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) / S;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / S, o = j * N + i;
      const g = hash3(i, j, 17), g2 = vnoise(x * 0.8, y * 0.8, 18);
      GRN[o] = clamp01(0.62 * g + 0.38 * g2) * 255;
      MOT[o] = mot[o] * 255;
      FLK[o] = clamp01(0.6 * flkA[o] + 0.4 * flkB[o] + 0.08 * sm(900, 1000, y) + 0.05 * sm(60, 0, y)) * 255;
      DIS[o] = clamp01((dis[o] - 0.5) * 2.4 + 0.5) * 255;
      // soot under the ceiling (plumes reaching down), a little grime along the floor and the edges
      let s = (1 - sm(0, 100 + 200 * sootF[o], y)) * (0.45 + 0.65 * sootF[o]);
      s += 0.16 * sm(925, 1000, y) * (0.5 + sootF[o]);
      s += 0.1 * (1 - sm(0, 30, x)) + 0.1 * sm(970, 1000, x);
      SOOT[o] = clamp01(s) * 255;
      // the plaster: tone, mottle, grain, faint horizontal float marks
      const br = 1 + 0.07 * (tone[o] - 0.5) + 0.035 * (mot[o] - 0.5) + 0.05 * (g - 0.5) + 0.025 * (vnoise(x / 150, y / 2.4, 19) - 0.5);
      const warm = (tone[o] - 0.5) * 0.05;
      W[o * 3] = P0[0] * br * (1 + warm); W[o * 3 + 1] = P0[1] * br; W[o * 3 + 2] = P0[2] * br * (1 - warm);
    }
  }
  F = { GRN, MOT, FLK, SOOT, DIS, W, PL: W.slice() };
}

const SOOTC = [48, 38, 30], SOOT_K = 0.74;
/**
 * The pigment model. src: crisp RGBA raster (w×h) whose pixel (0,0) is field pixel (i0, j0).
 * mode 'wall': composite into the plaster F.W (soot is applied to the whole wall later);
 * mode 'sprite': write painted RGBA into out (soot included).
 */
function paintPx(src, w, h, i0, j0, out, mode, flkBias = 0, solid = false) {
  const { GRN, MOT, FLK, SOOT, W, PL } = F;
  for (let j = 0; j < h; j++) {
    const fj = j0 + j;
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const fi = i0 + i;
      const a0 = src[k + 3];
      if (a0 < 3 || fj < 0 || fj >= N || fi < 0 || fi >= N) { if (out) out[k + 3] = 0; continue; }
      let r = src[k], g = src[k + 1], b = src[k + 2];
      const o = fj * N + fi;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b, mx = r > g ? (r > b ? r : b) : g > b ? g : b;
      const kb = sm(22, 70, b - r), kg = sm(6, 30, g - r) * (1 - kb), kw = sm(185, 220, mn), kk = 1 - sm(50, 95, mx);
      const gr = GRN[o] / 255 - 0.5, mt = MOT[o] / 255 - 0.5;
      const f = 1 + 0.07 * mt + (0.05 + 0.22 * kb + 0.1 * kg - 0.04 * kk) * gr;
      r *= f; g *= f; b *= f * (1 + 0.05 * kb * gr);
      const fl = FLK[o] / 255 + 0.045 * kb + 0.035 * kg + 0.02 * kw - 0.07 * kk + flkBias;
      const loss = sm(0.775, 0.8, fl);
      let a;
      if (solid) {   // the paint flakes down to the plaster (never to whatever lies behind)
        const q = o * 3, l = 0.96 * loss + 0.07 * kw;
        r += (PL[q] - r) * l; g += (PL[q + 1] - g) * l; b += (PL[q + 2] - b) * l;
        a = a0 / 255;
      } else a = (a0 / 255) * (1 - 0.96 * loss) * (1 - 0.07 * kw);
      if (mode === 'wall') {
        const q = o * 3;
        W[q] += (r - W[q]) * a; W[q + 1] += (g - W[q + 1]) * a; W[q + 2] += (b - W[q + 2]) * a;
      } else {
        const s = (SOOT[o] / 255) * SOOT_K;
        out[k] = r + (SOOTC[0] - r) * s; out[k + 1] = g + (SOOTC[1] - g) * s; out[k + 2] = b + (SOOTC[2] - b) * s; out[k + 3] = a * 255;
      }
    }
  }
}

/** Rasterise draw(painter) over a panel-unit region; returns crisp RGBA. */
function raster(region, draw) {
  const i0 = Math.floor(region[0] * S), j0 = Math.floor(region[1] * S);
  const w = Math.ceil(region[2] * S) - i0, h = Math.ceil(region[3] * S) - j0;
  const cv = mkCanvas(w, h), x = ctx2d(cv);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  draw(painter(x), x);
  return { i0, j0, w, h, data: x.getImageData(0, 0, w, h).data };
}

// ------------------------------------------------------------------ hieroglyphs (grid units, y down)
// [w, h, parts]: part = [type, fill, data, lw?]  types: p polygon, c smooth closed, L thick line (outlined),
// l thin black line, e ellipse [cx, cy, rx, ry], o ring [cx, cy, rx, ry, thickness]
const FILLS = { b: C.blue, g: C.green, r: C.red, y: C.yellow, k: C.black, w: C.white, s: C.skinM };
const zig = (n, w, y0, y1) => { const o = []; for (let k = 0; k <= n; k++) o.push([(k / n) * w, k % 2 ? y0 : y1]); return o; };
const SIGNS = {
  reed: [8, 20, [['c', 'g', [[4, 0], [6.2, 3], [7.2, 8], [6.6, 14], [5.6, 20], [2.6, 20], [1.8, 14], [2.4, 8], [3, 3]]], ['l', 0, [[3.8, 2.8], [6.2, 6.4]]]]],
  water: [22, 6, [['L', 'b', zig(8, 22, 1.2, 4.8), 1.7]]],
  bread: [14, 7, [['p', 'b', halfDisc(7, 7, 7, 7)]]],
  owl: [12, 20, [['c', 'y', [[6, 7], [9.5, 9], [10.5, 13], [9.5, 17], [8, 20], [3.5, 20], [1.5, 16], [1.5, 11], [3, 8]]], ['e', 'y', [6, 5, 4.6, 4.4]],
    ['e', 'w', [4.2, 4.6, 1.6, 1.6]], ['e', 'w', [7.8, 4.6, 1.6, 1.6]], ['e', 'k', [4.2, 4.6, 0.7, 0.7]], ['e', 'k', [7.8, 4.6, 0.7, 0.7]], ['l', 0, [[4, 12], [7, 17]]]]],
  maat: [7, 20, [['c', 'g', [[3.2, 20], [3.4, 12], [4, 6], [5.6, 1.5], [7, 0], [6.8, 3], [6, 8], [5.4, 14], [5, 20]]], ['l', 0, [[4.2, 20], [4.6, 8], [6.2, 2]]]]],
  eye: [20, 9, [['c', 'w', [[2, 5], [6, 2.6], [11, 2], [16, 3], [19, 5], [15, 6.8], [10, 7.2], [5, 6.6]]], ['e', 'k', [10, 4.6, 2.2, 2.2]], ['L', 'k', [[2, 1.2], [10, 0], [18, 1]], 1.1]]],
  chick: [11, 15, [['c', 'y', [[3, 6], [7, 5], [10, 7], [10.5, 10], [8, 12.5], [4, 12.5], [1.5, 10]]], ['e', 'y', [8.5, 4, 2.6, 2.6]], ['p', 'k', [[10.8, 3.6], [11, 4.6], [12.2, 4]]], ['l', 0, [[5, 12.5], [4.5, 15]]], ['l', 0, [[7, 12.5], [7.5, 15]]]]],
  mouth: [16, 6, [['c', 'r', [[0, 3], [4, 0.7], [8, 0], [12, 0.7], [16, 3], [12, 5.3], [8, 6], [4, 5.3]]]]],
  basket: [18, 9, [['p', 'g', [[0, 1], [16, 1], [15.2, 4], [13, 6.6], [10, 8.3], [6, 8.3], [3, 6.6], [0.8, 4]]], ['L', 'g', [[15.4, 1.8], [18, 1.4], [18.2, 4.2], [15.4, 4.6]], 1]]],
  viper: [20, 8, [['c', 'y', [[0, 7.5], [3, 6], [6, 6.6], [9, 5], [12, 4.6], [15, 3.6], [17, 2], [19, 1.4], [20, 2.6], [19, 4], [16.5, 5.4], [13, 6.6], [9, 7.8], [5, 8], [1.5, 8]]],
    ['l', 0, [[17.6, 1.8], [17.2, 0]]], ['e', 'k', [6, 7, 0.6, 0.5]], ['e', 'k', [11, 5.8, 0.6, 0.5]]]],
  ankh: [10, 20, [['o', 'b', [5, 4.2, 3.4, 4.2, 1.8]], ['p', 'b', [[0, 8.6], [10, 8.6], [10, 10.8], [0, 10.8]]], ['p', 'b', [[4, 10], [6, 10], [6.4, 20], [3.6, 20]]]]],
  sun: [10, 10, [['e', 'r', [5, 5, 5, 5]], ['e', 'y', [5, 5, 1.4, 1.4]]]],
  arm: [20, 7, [['c', 's', [[0, 2.4], [8, 1.8], [13, 1.2], [15.5, 0], [18.5, 0.6], [20, 2], [19.6, 3.6], [16, 4.2], [14.4, 5.8], [12.6, 5.4], [13, 4.4], [8, 4.6], [0, 5]]]]],
  bolt: [20, 5, [['p', 'g', [[0, 1.2], [14, 1.2], [14, 0], [16.5, 0], [16.5, 1.2], [20, 1.2], [20, 3.8], [16.5, 3.8], [16.5, 5], [14, 5], [14, 3.8], [0, 3.8]]]]],
  cloth: [7, 16, [['c', 'r', [[1.2, 0], [5.8, 0], [6, 8], [4.4, 10.6], [7, 16], [1.4, 16], [0.8, 10.6], [1, 8]]]]],
  mat: [10, 9, [['p', 'b', [[0, 0], [10, 0], [10, 9], [0, 9]]], ['l', 0, [[3.3, 0], [3.3, 9]]], ['l', 0, [[6.6, 0], [6.6, 9]]]]],
  pelican: [18, 16, [['p', 'w', [[2, 9.8], [0, 9], [0.4, 11], [1.8, 11]]], ['c', 'w', [[2, 9.6], [6, 7.6], [11, 7.4], [13.6, 9], [13, 11.8], [9, 13.4], [4.6, 13], [1.6, 11.4]]],
    ['c', 'w', [[11, 8], [12, 5], [12.6, 2.6], [14.2, 1.2], [15.4, 2.4], [14.4, 4.6], [13.8, 8.6]]], ['c', 'y', [[15, 3.4], [17.6, 3.2], [16, 5.6], [14.6, 5]]],
    ['p', 'y', [[15, 1.6], [18, 2.4], [17.8, 3.2], [15, 3.6]]], ['e', 'k', [14.4, 2, 0.5, 0.5]], ['l', 0, [[7, 13.2], [6.6, 16]]], ['l', 0, [[9.6, 13.2], [10, 16]]], ['l', 0, [[4, 10], [10, 9.6]]]]],
  jar: [10, 10, [['c', 'r', [[2, 0.6], [8, 0.6], [8.4, 1.8], [10, 4.6], [9, 8.4], [5, 10], [1, 8.4], [0, 4.6], [1.6, 1.8]]], ['p', 'r', [[1.6, 0], [8.4, 0], [8.4, 1.4], [1.6, 1.4]]]]],
  djed: [8, 20, [['p', 'b', [[2.4, 6], [5.6, 6], [5.8, 20], [2.2, 20]]], ['p', 'g', [[0, 1], [8, 1], [8, 2.3], [0, 2.3]]], ['p', 'g', [[0, 3.2], [8, 3.2], [8, 4.5], [0, 4.5]]], ['p', 'g', [[0, 5.4], [8, 5.4], [8, 6.7], [0, 6.7]]], ['p', 'b', [[2, 0], [6, 0], [6, 1], [2, 1]]]]],
  house: [16, 10, [['p', 'g', [[0, 0], [16, 0], [16, 10], [9.5, 10], [9.5, 8], [14, 8], [14, 2], [2, 2], [2, 8], [6.5, 8], [6.5, 10], [0, 10]]]]],
  cobra: [12, 16, [['c', 'g', [[1, 16], [1, 13], [3, 11], [7, 10.4], [10, 9], [10, 6], [8, 4.6], [7, 2.5], [8, 0.6], [10, 0.4], [11, 2], [10.6, 4], [12, 6], [12, 10], [9, 12.6], [4, 13.6], [3.4, 16]]], ['e', 'k', [9.4, 1.6, 0.5, 0.5]]]],
  hand: [18, 6, [['c', 's', [[0, 2], [10, 1.2], [15, 0.6], [18, 1.6], [17.4, 3], [13, 3.4], [12.6, 4.6], [10, 5.4], [8.6, 4.2], [0, 4.4]]]]],
  leg: [10, 18, [['c', 's', [[2, 0], [5, 0], [5.6, 6], [5, 11], [5.4, 14.6], [10, 16], [10, 18], [1.8, 18], [2, 14], [1.4, 10], [1.6, 5]]]]],
  htp: [18, 11, [['p', 'g', [[0, 8], [18, 8], [18, 11], [0, 11]]], ['p', 'b', halfDisc(9, 8, 5.6, 7)]]],
  duck: [18, 14, [['p', 'k', [[1.4, 8], [0, 6.4], [0, 9.4]]], ['c', 'y', [[1, 8], [5, 6], [11, 6.4], [14.6, 7.6], [15, 10], [11, 12.6], [5, 12.4], [1.6, 10.6]]],
    ['c', 'g', [[12, 7], [13, 4], [14.6, 2.2], [16.6, 2.6], [17, 4], [15.6, 4.4], [14.6, 7.6]]], ['p', 'k', [[16.8, 3], [18.4, 3.6], [16.8, 4.2]]], ['p', 'b', [[4, 8], [11, 8], [9, 10.4], [3, 10]]], ['l', 0, [[8, 12.5], [7.4, 14]]]]],
  nfr: [7, 20, [['c', 'r', [[1, 12], [3.5, 10.6], [6, 12], [6.4, 15.4], [5, 18.6], [3.5, 20], [2, 18.6], [0.6, 15.4]]], ['p', 'g', [[2.8, 0], [4.2, 0], [4.2, 11], [2.8, 11]]], ['p', 'g', [[1.4, 3], [5.6, 3], [5.6, 4.2], [1.4, 4.2]]], ['p', 'g', [[1.8, 6], [5.2, 6], [5.2, 7], [1.8, 7]]]]],
  ka: [16, 12, [['p', 's', [[0, 12], [0, 2], [1, 0], [3, 0], [3.2, 2], [3.2, 9], [12.8, 9], [12.8, 2], [13, 0], [15, 0], [16, 2], [16, 12]]]]],
  neb: [16, 7, [['c', 'g', [[0, 0], [16, 0], [15, 3], [12.6, 5.6], [8, 7], [3.4, 5.6], [1, 3]]]]],
  loaf: [6, 12, [['c', 'y', [[3, 0], [5, 3], [6, 12], [0, 12], [1, 3]]]]],
};
const SIGN_KIND = {
  tall: ['reed', 'owl', 'maat', 'ankh', 'cloth', 'djed', 'cobra', 'leg', 'nfr', 'chick', 'reed', 'owl', 'loaf'],
  flat: ['water', 'bread', 'mouth', 'basket', 'viper', 'arm', 'bolt', 'hand', 'htp', 'neb', 'eye', 'house', 'water', 'bread'],
  square: ['sun', 'mat', 'jar', 'pelican', 'duck', 'ka', 'jar', 'sun'],
};

function drawSign(P, name, x0, y0, k, mirror = false) {
  const [sw, , parts] = SIGNS[name];
  const x = P.x;
  x.save(); x.translate(x0, y0);
  if (mirror) { x.translate(sw * k, 0); x.scale(-1, 1); }
  x.scale(k, k);
  const lw = 0.85 / k;
  for (const [t, f, d, extra] of parts) {
    const fill = f ? FILLS[f] : null;
    if (t === 'p') P.poly(d, fill, { lw });
    else if (t === 'c') P.poly(d, fill, { lw, smooth: true });
    else if (t === 'l') P.open(d, C.black, lw * 1.1);
    else if (t === 'L') { P.open(d, C.black, extra + lw * 2); P.open(d, fill, extra); }
    else if (t === 'e') { x.beginPath(); x.ellipse(d[0], d[1], d[2], d[3], 0, 0, TAU); x.fillStyle = fill; x.fill(); if (f !== 'k') { x.lineWidth = lw; x.strokeStyle = C.black; x.stroke(); } }
    else if (t === 'o') {
      x.beginPath(); x.ellipse(d[0], d[1], d[2], d[3], 0, 0, TAU); x.moveTo(d[0] + d[2] - d[4], d[1]); x.ellipse(d[0], d[1], d[2] - d[4], d[3] - d[4], 0, 0, TAU, true);
      x.fillStyle = fill; x.fill('evenodd'); x.lineWidth = lw; x.strokeStyle = C.black; x.stroke();
    }
  }
  x.restore();
}

/** Lay out one column of signs (top → bottom) in a box; returns placed signs. */
function layoutColumn(R, cw, ch) {
  const items = [];
  const pad = cw * 0.1, gap = cw * 0.14;
  let y = pad;
  const pick = (kind) => SIGN_KIND[kind][Math.floor(R() * SIGN_KIND[kind].length)];
  for (let guard = 0; guard < 40; guard++) {
    const r = R();
    const rows = [];
    if (r < 0.36) rows.push([pick('tall')]);
    else if (r < 0.6) rows.push([pick('flat')]);
    else if (r < 0.78) rows.push([pick('flat')], [pick('flat')]);
    else rows.push([pick('square'), pick('square')]);
    const placed = [];
    let gy = 0;
    for (const row of rows) {
      const n = row.length;
      let rowH = 0;
      const cells = row.map((name) => {
        const [sw, sh] = SIGNS[name];
        let k;
        if (n === 2) k = Math.min((cw * 0.44) / sw, (cw * 0.46) / sh);
        else if (sh / sw > 1.25) k = Math.min((cw * 1.05) / sh, (cw * 0.8) / sw);
        else if (sw / sh > 1.5) k = (cw * 0.84) / sw;
        else k = Math.min((cw * 0.62) / sw, (cw * 0.62) / sh);
        rowH = Math.max(rowH, sh * k);
        return { name, k, w: sw * k, h: sh * k };
      });
      const tot = cells.reduce((s, c) => s + c.w, 0) + (n - 1) * cw * 0.06;
      let cx = (cw - tot) / 2;
      for (const c of cells) { placed.push({ ...c, x: cx, y: gy + (rowH - c.h) / 2 }); cx += c.w + cw * 0.06; }
      gy += rowH + gap * 0.6;
    }
    gy -= gap * 0.6;
    if (y + gy > ch - pad) { if (guard > 30) break; continue; }
    for (const p of placed) items.push({ ...p, y: p.y + y });
    y += gy + gap;
    if (y > ch - pad - cw * 0.3) break;
  }
  // vertical justification
  const last = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const slack = ch - pad - last;
  if (slack > 0 && items.length > 1) {
    const ys = [...new Set(items.map((it) => it.y))].sort((a, b) => a - b);
    for (const it of items) it.y += (slack * ys.indexOf(it.y)) / (ys.length - 1 || 1);
  }
  return items;
}

/** A block of hieroglyph columns with divider lines. */
function glyphBlock(P, R, x0, y0, ncol, cw, ch, o = {}) {
  const x = P.x;
  for (let c = 0; c < ncol; c++) {
    const cx = x0 + c * cw;
    for (const it of layoutColumn(R, cw, ch)) drawSign(P, it.name, cx + it.x, y0 + it.y, it.k, o.mirror);
  }
  x.lineCap = 'butt';
  for (let c = 0; c <= ncol; c++) P.open([[x0 + c * cw, y0], [x0 + c * cw, y0 + ch]], o.rule || C.blue, 1.4);
  if (o.top !== false) P.open([[x0, y0], [x0 + ncol * cw, y0]], o.rule || C.blue, 1.4);
  x.lineCap = 'round';
}

// ------------------------------------------------------------------ people
// local frame: facing right, ground y = 0, scale 1 ≈ a bearer (hairline at 18 squares of 14 units)
const LEGS = {
  walk: { F: [[7, -132], [14, -82], [21, -11]], R: [[-7, -132], [-21, -82], [-37, -11]], hF: 15, hR: -43 },
  stand: { F: [[6, -132], [11, -82], [15, -11]], R: [[-6, -132], [-10, -82], [-13, -11]], hF: 9, hR: -19 },
  wide: { F: [[8, -132], [20, -82], [32, -11]], R: [[-8, -132], [-26, -82], [-44, -11]], hF: 26, hR: -50 },
};
const W_LEG_M = [[0, 25], [0.4, 15.5], [0.5, 14.2], [0.64, 15.6], [0.9, 9.6], [1, 9]];
const W_LEG_F = [[0, 22], [0.4, 14], [0.5, 13], [0.64, 14], [0.9, 8.6], [1, 8]];
const W_ARM_M = [[0, 15], [0.48, 10.5], [0.56, 10.2], [1, 8]];
const W_ARM_F = [[0, 13], [0.5, 9.2], [1, 7.2]];
const footPts = (h) => { const t = h + 46; return [[h - 1, 0], [t, 0], [t - 0.6, -3.2], [t - 11, -5.6], [h + 16, -10.4], [h + 8, -13.6], [h + 2, -11], [h - 1.5, -5]]; };
const TORSO_M = [[-38, -218], [-32, -226], [-12, -229], [14, -229], [33, -226], [39, -219], [32, -209], [27, -197], [23, -182], [18, -166], [16, -152], [-18, -152], [-21, -170], [-27, -194], [-34, -209]];
const TORSO_F = [[-31, -216], [-25, -224], [-8, -227], [12, -227], [26, -224], [31, -217], [27, -209], [27, -201], [31, -193], [30, -185], [24, -181], [17, -170], [14, -152], [-15, -152], [-18, -172], [-24, -196], [-28, -208]];
const NECK_M = [[-5, -224], [-6, -241], [10, -241], [12, -224]];
const NECK_F = [[-4, -222], [-5, -241], [9, -241], [10, -222]];
const KILT = [[-19, -157], [18, -158], [22, -138], [30, -118], [44, -96], [28, -93], [-24, -96], [-27, -118], [-23, -142]];
const LONGKILT = [[-19, -157], [18, -158], [24, -122], [30, -72], [-24, -70], [-26, -112], [-23, -142]];
const OVERKILT = [[-21, -162], [21, -162], [30, -124], [44, -76], [54, -46], [-30, -42], [-32, -90], [-27, -132]];
const SHEATH = [[-17, -193], [22, -193], [19, -176], [15, -160], [19, -136], [21, -100], [19, -60], [24, -14], [-21, -14], [-19, -60], [-24, -104], [-23, -140], [-17, -162]];
const SH = { m: { F: [31, -218], R: [-31, -218] }, f: { F: [26, -216], R: [-26, -216] } };
// head-local (origin at the top of the neck, (2, −238)), facing right
const FACE_M = [[-6, 3], [7, 3.5], [13, 1], [16, -3], [17.5, -7], [16.8, -9.5], [18.8, -11.5], [19, -14.5], [23.8, -17.5], [21.5, -20.5], [18.6, -25.5], [18.8, -29], [16, -35], [9, -41], [-4, -42], [-14, -35], [-17, -22], [-13, -8]];
const FACE_F = [[-6, 3], [6, 3.5], [12, 1], [15, -3], [16.5, -7], [15.8, -9.3], [17.6, -11.2], [17.8, -14], [22, -17], [20, -20], [17.8, -25.5], [18, -29], [15.5, -35], [9, -41], [-4, -42], [-14, -35], [-17, -22], [-13, -8]];
const WIGS = {
  short: [[[17.5, -32], [14, -39.5], [6, -45], [-6, -46], [-17, -40.5], [-22.5, -30], [-23.5, -16], [-21, -4], [-12, -2.5], [-3, -7], [1, -13], [2.5, -21], [5, -28], [11, -31.5]]],
  duplex: [[[17.5, -32], [14, -40], [5, -46], [-8, -47], [-19, -41], [-25, -30], [-27, -12], [-27, 8], [-24, 18], [-14, 20], [-8, 12], [-4, 2], [0, -8], [2, -17], [4.5, -26], [11, -31]],
    [[2, -20], [7, -11], [10, 4], [11.5, 17], [3.5, 20], [0.5, 8], [-2.5, -6]]],
  long: [[[17, -32], [13.5, -40], [4, -46.5], [-9, -47], [-20, -41], [-26, -29], [-28, -10], [-28, 14], [-26, 38], [-17, 42], [-12, 26], [-8, 10], [-4, -2], [0, -10], [2, -18], [4.5, -26], [10.5, -31]],
    [[3, -22], [8, -12], [10.5, 6], [12, 26], [13, 42], [4, 44], [2, 26], [0, 8], [-1.5, -8]]],
};

function kohlEye(P, cx, cy, hw, hh, pup, kohl = 6, mode = 'normal') {
  const x = P.x;
  if (mode === 'closed') {
    P.open([[cx - hw, cy], [cx, cy + hh * 0.5], [cx + hw, cy]], C.black, 1.4, true);
  } else {
    const pts = almond(cx, cy, hw, hh);
    P.poly(pts, C.white, { lw: 0 });
    x.save(); x.beginPath(); polyPath(x, pts); x.clip();
    P.disc(pup[0], pup[1], hh * 0.92, C.black, { lw: 0 });
    x.restore();
    P.poly(pts, null, { lw: 1.0 });
  }
  P.open([[cx - hw + 0.4, cy + 0.2], [cx - hw - kohl * 0.55, cy + 0.15], [cx - hw - kohl, cy - 0.7]], C.black, 1.5, true);
  P.open([[cx - hw - 1.2, cy - hh - 2.2], [cx - 0.5, cy - hh - 3.5], [cx + hw + 0.5, cy - hh - 2.0]], C.black, 1.35, true);
}

function wigStrands(P, poly, cx, cy) {
  const x = P.x;
  x.save(); x.beginPath(); polyPath(x, poly); x.clip();
  x.strokeStyle = '#41414c'; x.lineWidth = 0.45;
  for (let a = -0.2; a < Math.PI * 1.25; a += 0.13) {
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - Math.cos(a) * 80, cy + Math.sin(a) * 80 - 10); x.stroke();
  }
  x.restore();
}

function head(P, f, turned) {
  const x = P.x;
  x.save(); x.translate(2, -238); if (turned) x.scale(-1, 1);
  const fem = f.sex === 'f';
  const so = { ol: C.skinOl, smooth: true, lw: 1.05 };
  P.poly(fem ? FACE_F : FACE_M, f.skin, so);
  if (f.wig === 'shaved') {
    P.poly(ellPts(-3.5, -14, 3.4, 5.4), f.skin, { ol: C.skinOl, lw: 0.9 });
    P.open([[-2.5, -17.5], [-5, -15], [-3, -11]], C.skinOl, 0.7, true);
    P.open([[15, -33], [6, -40.5], [-6, -41.5], [-14, -35]], '#6a4a3e', 0.6, true);   // the shaven scalp line
  } else {
    const W = WIGS[f.wig];
    for (const poly of W) { P.poly(poly, C.black, { lw: 0.8, smooth: true }); wigStrands(P, poly, 2, -44); }
    if (f.wig === 'short') { P.poly(ellPts(-4, -12.5, 3.4, 5.4), f.skin, { ol: C.skinOl, lw: 0.9 }); P.open([[-3, -16], [-5.5, -13.5], [-3.6, -9.6]], C.skinOl, 0.7, true); }
  }
  if (f.band) {   // fillet with a lotus bud over the brow
    P.poly([[17, -33.5], [11, -37.5], [0, -41.5], [-12, -41], [-22, -35], [-23.5, -31], [-12, -37], [0, -38], [10, -34.5], [16, -30.5]], C.blue, { lw: 0.7, smooth: true });
    P.poly([[15, -36], [21, -42], [24, -39], [19, -33]], C.green, { lw: 0.6 });
    P.poly([[21, -42], [27, -47], [26, -40], [24, -39]], C.blue, { lw: 0.6 });
  }
  if (f.cone) {
    P.poly([[-12, -44], [5, -45.5], [3, -60], [-4, -63], [-10, -59]], '#ede0b6', { lw: 0.9, smooth: true });
    P.open([[-6, -61], [-7, -50]], '#b06a3a', 0.8); P.open([[0, -61], [1, -50]], '#b06a3a', 0.8);
  }
  kohlEye(P, 12, -24.6, 6, 2.7, [12.8, -25.1], 7);
  P.open([[17.2, -10], [14.6, -9.4]], '#5a1a10', 0.9);
  x.restore();
}

function collar(P, cx, cy, s = 1) {
  const x = P.x;
  const bands = [[7.5, 11.5, C.green], [11.5, 15.5, C.blue], [15.5, 19, C.red], [19, 21.5, C.yellow]];
  for (const [r0, r1, col] of bands) {
    x.beginPath(); x.arc(cx, cy, r1 * s, 0, Math.PI); x.arc(cx, cy, r0 * s, Math.PI, 0, true); x.closePath();
    x.fillStyle = col; x.fill(); x.lineWidth = 0.65; x.strokeStyle = C.black; x.stroke();
  }
  for (let k = 0; k <= 12; k++) {
    const a = 0.06 * Math.PI + (k / 12) * 0.88 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 21.5 * s, r1 = 26 * s, hw = 1.7 * s;
    P.poly([[cx + ca * r0 - sa * hw, cy + sa * r0 + ca * hw], [cx + ca * (r0 + 2.2 * s) - sa * hw * 1.2, cy + sa * (r0 + 2.2 * s) + ca * hw * 1.2], [cx + ca * r1, cy + sa * r1],
      [cx + ca * (r0 + 2.2 * s) + sa * hw * 1.2, cy + sa * (r0 + 2.2 * s) - ca * hw * 1.2], [cx + ca * r0 + sa * hw, cy + sa * r0 - ca * hw]], k % 2 ? C.blue : C.green, { lw: 0.55 });
  }
}

function handPts(wr, dir, kind) {
  const [dx, dy] = dir, nx = -dy, ny = dx;
  const Q = (a, b) => [wr[0] + dx * a + nx * b, wr[1] + dy * a + ny * b];
  if (kind === 'open') return [Q(-1, 4.2), Q(9, 4.5), Q(16.5, 3.8), Q(20, 2), Q(20.2, -0.6), Q(16.5, -2.6), Q(9.5, -3.4), Q(10.5, -7.6), Q(8, -8.4), Q(3, -4.8), Q(-1, -4.2)];
  return [Q(-1, 4.3), Q(6, 5), Q(11, 4), Q(12.6, 0.5), Q(11, -3), Q(7, -5.4), Q(1, -5), Q(-1, -4.3)];
}

/** Arm from a shoulder to a hand target (two-bone IK). Returns the joints. */
function arm(P, f, side, tgt, o = {}) {
  const fem = f.sex === 'f';
  const sh = SH[fem ? 'f' : 'm'][side];
  const { el, wr } = ik2(sh, tgt, fem ? 50 : 54, fem ? 44 : 48, o.bend ?? 1);
  P.limb(limbPoly([sh, el, wr], fem ? W_ARM_F : W_ARM_M, 5, false), f.skin, { ol: C.skinOl, lw: 1.05 });
  const dir = o.hdir ? nrm(o.hdir) : nrm(sub(wr, el));
  P.poly(handPts(wr, dir, o.hand || 'fist'), f.skin, { ol: C.skinOl, lw: 1.0 });
  if (o.bangle !== false) {   // bracelet
    const b0 = sub(wr, mul(dir, 5)), n = [-dir[1], dir[0]];
    P.open([add(b0, mul(n, 4.6)), add(b0, mul(n, -4.6))], C.blue, 2.2);
  }
  return { el, wr, dir };
}

/** A person: f = { x, y, s, dir, sex, skin, wig, legs, garment, band, cone, big }, st = { turned, armF, armR, props } */
function person(P, f, st) {
  const x = P.x;
  const fem = f.sex === 'f';
  x.save(); x.translate(f.x, f.y ?? 800); x.scale(f.s * (f.dir ?? 1), f.s);
  const props = st.props || [];
  const so = { ol: C.skinOl, lw: 1.05 };
  for (const pr of props) if (pr.z === 0) pr.draw(P);
  const Lg = LEGS[f.legs || 'walk'], WL = fem ? W_LEG_F : W_LEG_M;
  P.limb(limbPoly(Lg.F, WL, 6, false), f.skin, so);
  P.poly(footPts(Lg.hF), f.skin, so);
  P.limb(limbPoly(Lg.R, WL, 6, false), f.skin, so);
  P.poly(footPts(Lg.hR), f.skin, so);
  if (fem) {
    P.poly(TORSO_F, f.skin, so);
    P.poly(SHEATH, 'rgba(240,233,214,0.66)', { lw: 1.0 });
    P.open([[12, -150], [16, -100], [14, -60], [18, -16]], 'rgba(150,130,100,0.35)', 0.6);
    P.open([[-9, -192], [-8, -224]], 'rgba(240,233,214,0.95)', 3.2); P.open([[13, -192], [11, -224]], 'rgba(240,233,214,0.95)', 3.2);
  } else {
    P.poly(TORSO_M, f.skin, so);
    P.disc(23, -196, 1.5, C.skinOl, { lw: 0 });
    if (f.garment === 'overkilt') {
      P.poly(KILT, C.linen, { lw: 1.0 });
      P.poly(OVERKILT, 'rgba(242,235,218,0.62)', { lw: 1.0 });
      for (let k = 0; k < 6; k++) P.open([[2 + k * 3, -158], [8 + k * 8, -50]], 'rgba(150,130,100,0.45)', 0.6);
      P.poly([[-4, -162], [10, -162], [12, -150], [16, -128], [10, -128], [6, -150]], C.linen, { lw: 0.9 });
    } else if (f.garment === 'longkilt') {
      P.poly(LONGKILT, C.linen, { lw: 1.0 });
      for (let k = 0; k < 4; k++) P.open([[-12 + k * 8, -150], [-14 + k * 11, -74]], 'rgba(150,130,100,0.4)', 0.6);
    } else {
      P.poly(KILT, C.linen, { lw: 1.0 });
      for (let k = 0; k < 5; k++) P.open([[12 + k * 1.5, -150], [24 + k * 4.5, -96]], 'rgba(150,130,100,0.5)', 0.6);
    }
    P.poly([[-19, -158], [18, -159], [18.6, -151], [-19.6, -150]], f.big ? C.red : C.linen, { lw: 0.9 });
  }
  P.poly(fem ? NECK_F : NECK_M, f.skin, so);
  collar(P, 3, -227, f.big ? 1.12 : 1);
  head(P, f, !!st.turned);
  for (const pr of props) if (pr.z === 1) pr.draw(P);
  if (st.armF) arm(P, f, 'F', st.armF.t, st.armF);
  if (st.armR) arm(P, f, 'R', st.armR.t, st.armR);
  for (const pr of props) if (pr.z === 2) pr.draw(P);
  x.restore();
}

// ------------------------------------------------------------------ props
function lotus(P, cx, cy, ang, s = 1) {
  const x = P.x;
  x.save(); x.translate(cx, cy); x.rotate(ang); x.scale(s, s);
  P.poly([[-6, 0], [-8, -9], [-3, -6], [0, -13], [3, -6], [8, -9], [6, 0]], C.blue, { lw: 0.8 });
  P.poly([[-3.5, 0], [-2.4, -5], [0, -8], [2.4, -5], [3.5, 0]], C.white, { lw: 0.6 });
  P.poly([[-6, 0], [6, 0], [3, 3.5], [-3, 3.5]], C.green, { lw: 0.8 });
  x.restore();
}
function duckProp(P, cx, cy, ang, pal, o = {}) {
  const x = P.x;
  x.save(); x.translate(cx, cy); x.rotate(ang); x.scale(o.s ?? 1, o.s ?? 1);
  if (o.hang) P.open([[-8, 4], [-17, 3], [-27, 1]], C.red, 2);
  P.poly([[-14, -2], [-24, -6], [-25, 2], [-14, 3]], C.black, { lw: 0.8 });
  P.poly(ellPts(0, 0, 15.5, 7.2, -0.05, 20), pal.body, { lw: 1 });
  P.poly([[-12, -3], [6, -4.5], [2, 2.5], [-12, 2.4]], pal.wing, { lw: 0.8 });
  P.poly([[-12, -1], [-1, -1.2], [-3, 2.4], [-12, 2.4]], C.black, { lw: 0 });
  P.limb(limbPoly([[11, -3], [16, -7], [18.5, -11]], [[0, 7], [1, 5.2]], 4, false), pal.head, { lw: 0.9 });
  P.disc(19.5, -12.5, 4.6, pal.head, { lw: 0.9 });
  P.poly([[23, -14], [29.5, -12.6], [23, -10.8]], C.yellow, { lw: 0.8 });
  P.disc(20.5, -13.4, 0.9, C.black, { lw: 0 });
  if (!o.hang) P.open([[-2, 6], [-4, 12]], C.red, 1.8);
  x.restore();
}
const DUCK1 = { body: '#c79a62', wing: C.blue, head: C.green };
const DUCK2 = { body: C.white, wing: C.red, head: '#b07a48' };
function jarProp(P, cx, cy, ang) {
  const x = P.x;
  x.save(); x.translate(cx, cy); x.rotate(ang);
  P.poly([[-7, -22], [7, -22], [8, -16], [17, -6], [19, 8], [14, 22], [6, 29], [-6, 29], [-14, 22], [-19, 8], [-17, -6], [-8, -16]], C.pot, { smooth: true, lw: 1.1 });
  P.rect(-9.5, -27, 19, 5.5, C.pot, { lw: 1 });
  P.poly([[-9.5, -27], [-7, -35], [0, -38], [7, -35], [9.5, -27]], '#8f8a7a', { lw: 1, smooth: false });   // mud stopper
  x.save(); x.beginPath(); pathCR(x, [[-7, -22], [7, -22], [8, -16], [17, -6], [19, 8], [14, 22], [6, 29], [-6, 29], [-14, 22], [-19, 8], [-17, -6], [-8, -16]]); x.clip();
  P.rect(-22, -6, 44, 7, C.blue, { lw: 0 });
  P.open([[-22, -6], [22, -6]], C.black, 0.8); P.open([[-22, 1], [22, 1]], C.black, 0.8);
  x.restore();
  lotus(P, -12, -16, -0.7, 0.8);
  x.restore();
}
function trayProp(P, cx, cy) {
  P.poly([[cx - 31, cy], [cx - 24, cy - 30], [cx - 16, cy]], '#b8642e', { lw: 1 });
  P.poly([[cx - 20, cy], [cx - 12, cy - 37], [cx - 4, cy]], C.red, { lw: 1 });
  P.poly(halfDisc(cx + 7, cy, 11, 12), C.yellow, { lw: 1 });
  for (const [dx, dy] of [[3, -5], [8, -8], [12, -4], [6, -2]]) P.disc(cx + dx, cy + dy, 0.9, C.black, { lw: 0 });
  for (const [dx, dy] of [[21, -6], [25, -6], [29, -6], [23, -10], [27, -10], [25, -14], [19, -2.5], [23, -2.5], [27, -2.5], [31, -2.5]]) P.disc(cx + dx, cy + dy, 2.3, C.blue, { lw: 0.6 });
  P.poly([[cx - 10, cy - 1], [cx + 2, cy - 4], [cx + 16, cy - 3], [cx + 4, cy]], C.green, { lw: 0.8, smooth: true });
  P.poly([[cx - 38, cy - 1], [cx + 38, cy - 1], [cx + 33, cy + 5], [cx - 33, cy + 5]], C.yellow, { lw: 1.1 });
}
function basketProp(P, fist) {
  const [fx, fy] = fist;
  const top = fy + 16;
  P.open([[fx - 14, top], [fx - 3, fy + 2]], C.black, 1.1); P.open([[fx + 14, top], [fx + 3, fy + 2]], C.black, 1.1);
  for (const [dx, dy] of [[-8, -1], [-2, -3], [4, -2], [9, 0], [-5, 1], [2, 1]]) P.disc(fx + dx, top + dy, 2.6, C.red, { lw: 0.6 });
  const pts = [[fx - 17, top], [fx + 17, top], [fx + 14, top + 11], [fx + 8, top + 19], [fx - 8, top + 19], [fx - 14, top + 11]];
  P.poly(pts, C.yellow, { lw: 1.1 });
  const x = P.x;
  x.save(); x.beginPath(); polyPath(x, pts); x.clip();
  for (let k = -4; k < 6; k++) { P.open([[fx - 20 + k * 6, top], [fx - 12 + k * 6, top + 20]], C.redDk, 0.6); P.open([[fx - 12 + k * 6, top], [fx - 20 + k * 6, top + 20]], C.redDk, 0.6); }
  x.restore();
}
function staffProp(P, a, b, col = '#b5873d') { P.open([a, b], C.black, 4.6); P.open([a, b], col, 2.6); }
function sekhem(P, fist, dir) {
  const d = nrm(dir), n = [-d[1], d[0]];
  const Q = (u, v) => [fist[0] + d[0] * u + n[0] * v, fist[1] + d[1] * u + n[1] * v];
  P.open([Q(-6, 0), Q(22, 0)], C.black, 3.6); P.open([Q(-6, 0), Q(22, 0)], C.yellow, 1.8);
  P.poly([Q(20, -2), Q(26, -6.5), Q(38, -7), Q(42, 0), Q(38, 7), Q(26, 6.5), Q(20, 2)], C.yellow, { lw: 1 });
  P.open([Q(27, -4), Q(27, 4)], C.blue, 1.4); P.open([Q(32, -5), Q(32, 5)], C.blue, 1.4);
}
function palette(P, a, b) {
  const d = nrm(sub(b, a)), n = [-d[1], d[0]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const Q = (u, v) => [a[0] + d[0] * u + n[0] * v, a[1] + d[1] * u + n[1] * v];
  P.poly([Q(0, -3.6), Q(L, -3.6), Q(L, 3.6), Q(0, 3.6)], '#e7dab4', { lw: 1 });
  P.disc(...Q(L - 5, 0), 1.9, C.red, { lw: 0.6 }); P.disc(...Q(L - 10.5, 0), 1.9, C.black, { lw: 0.6 });
  P.open([Q(3, 0), Q(L - 16, 0)], '#8a7a5a', 0.8);
}

// ------------------------------------------------------------------ the cast
const SKIN = { m: C.skinM, f: C.skinF };
const CAST = {
  b1: { x: 50, s: 0.94, sex: 'm', skin: SKIN.m, wig: 'short', legs: 'walk', garment: 'kilt', phase: 0 },
  b2: { x: 130, s: 0.94, sex: 'm', skin: SKIN.m, wig: 'short', legs: 'walk', garment: 'kilt', phase: 1 },
  b3: { x: 210, s: 0.94, sex: 'm', skin: SKIN.m, wig: 'short', legs: 'walk', garment: 'kilt', phase: 2 },
  scribe: { x: 760, s: 0.98, dir: -1, sex: 'm', skin: SKIN.m, wig: 'shaved', legs: 'stand', garment: 'longkilt' },
  wife: { x: 852, s: 1.04, sex: 'f', skin: SKIN.f, wig: 'long', legs: 'stand', band: true, cone: true },
  noble: { x: 916, s: 1.1, sex: 'm', skin: SKIN.m, wig: 'duplex', legs: 'walk', garment: 'overkilt', big: true, cone: true },
  fowler: { x: 318, y: 262, s: 0.53, sex: 'm', skin: SKIN.m, wig: 'short', legs: 'wide', garment: 'kilt' },
};

function bearerState(id, st) {
  if (id === 'b1') {
    const up = st === 'B';
    const tc = up ? [14, -306] : [8, -290];
    return {
      armF: { t: up ? [40, -300] : [32, -284], hand: 'open', hdir: [0.25, -1], bend: 1 },
      armR: { t: up ? [-24, -138] : [-33, -134], hand: 'fist' },
      props: [{ z: 1, draw: (P) => trayProp(P, tc[0], tc[1]) }, { z: 2, draw: (P) => basketProp(P, up ? [-18, -132] : [-28, -128]) }],
    };
  }
  if (id === 'b2') {
    const up = st === 'B';
    const fist = up ? [60, -238] : [52, -170];
    return {
      armF: { t: fist, hand: 'fist', bend: 1 },
      armR: { t: [-32, -134], hand: 'fist' },
      props: [{ z: 2, draw: (P) => {
        duckProp(P, -37, -101, Math.PI / 2 + 0.1, DUCK1, { hang: true, s: 0.9 });
        duckProp(P, -27, -99, Math.PI / 2 - 0.12, DUCK1, { hang: true, s: 0.9 });
        duckProp(P, fist[0] + 3, fist[1] + 34, Math.PI / 2 - 0.05, DUCK2, { hang: true });
      } }],
    };
  }
  // b3: the jar
  if (st === 'B') {
    return {
      armF: { t: [72, -176], hand: 'open', hdir: [1, -0.05], bend: 1 },
      armR: { t: [52, -222], hand: 'fist', bend: 1 },
      props: [{ z: 1, draw: (P) => jarProp(P, 66, -208, 0) }],
    };
  }
  return {
    armF: { t: [46, -150], hand: 'fist', bend: 1 },
    armR: { t: [-47, -246], hand: 'open', hdir: [-0.1, -1], bend: -1 },
    props: [{ z: 0, draw: (P) => jarProp(P, -30, -264, -0.3) },
      { z: 2, draw: (P) => { for (const [dx, a] of [[-6, 0.15], [0, 0], [6, -0.15]]) { P.open([[46, -150], [48 + dx, -128], [48 + dx * 1.6, -114]], C.green, 1.6, true); lotus(P, 48 + dx * 1.6, -112, Math.PI + a, 0.9); } } }],
  };
}

/** Where the scribe's pen tip goes while he paints the cartouche (world coords). */
const CHAR_Y = (k) => CART.y0 + 15 + CART.size * 0.5 + k * (CART.size + 6);
function scribeState(st) {
  const f = CAST.scribe;
  const toLocal = (wx, wy) => [(f.x - wx) / f.s, (wy - 800) / f.s];   // the scribe faces left
  const pal = { z: 2, draw: (P) => palette(P, [12, -184], [66, -178]) };
  const penAt = (tip) => {
    const sh = SH.m.F;
    const d = nrm(sub(tip, sh));
    const pd = nrm([d[0] + 0.25, d[1] - 0.45]);
    const hand = sub(tip, mul(pd, 20));
    return { armF: { t: hand, hand: 'fist', bend: 1, hdir: pd }, pen: [add(hand, mul(pd, 4)), tip] };
  };
  let A;
  if (st === 'idle' || st === 'look') A = penAt([46, -196]);
  else if (st === 'dip') A = penAt([58, -184]);
  else if (st === 'raise') A = penAt([34, -306]);
  else if (st === 'penR') A = penAt(toLocal(CART.cx + CART.w / 2 + 2, CART.y0 + 70));
  else A = penAt(toLocal(CART.cx + 15, CHAR_Y(+st.slice(3) - 1) - 4));
  return {
    turned: st === 'look',
    armF: A.armF,
    armR: { t: [20, -178], hand: 'fist', bend: 1 },
    props: [pal, { z: 2, draw: (P) => { P.open(A.pen, C.black, 2.4); P.open(A.pen, '#c9a560', 1.2); } }],
  };
}

function nobleState(st) {
  const staff = { z: 1, draw: (P) => staffProp(P, [61, -2], [49, -312]) };
  const armF = { t: [55, -172], hand: 'fist', bend: 1 };
  if (st === 'bye') {
    return { armF, armR: { t: [66, -206], hand: 'fist', bend: 1 }, props: [staff, { z: 2, draw: (P) => sekhem(P, [66, -206], [0.85, -0.5]) }] };
  }
  return { turned: st === 'back', armF, armR: { t: [-35, -128], hand: 'fist' }, props: [staff, { z: 2, draw: (P) => sekhem(P, [-35, -128], [0.62, 0.78]) }] };
}

function wifeState(st) {
  const sniff = st === 'sniff';
  const fist = sniff ? [27, -226] : [30, -150];
  return {
    turned: st === 'back',
    armF: { t: fist, hand: 'fist', bend: sniff ? 1 : -1 },
    armR: { t: [-26, -134], hand: 'open', hdir: [0.1, 1] },
    props: [{ z: 2, draw: (P) => { const top = sniff ? [31, -254] : [40, -118]; P.open([add(fist, [2, 0]), top], C.green, 1.6); lotus(P, top[0], top[1], sniff ? 0.25 : 2.4, 1.05); } }],
  };
}

function fowlerState(st) {
  const thrown = st === 'B';
  return {
    armF: { t: [58, -206], hand: 'fist', bend: 1 },
    armR: thrown ? { t: [64, -248], hand: 'open', bend: 1 } : { t: [-22, -292], hand: 'fist', bend: -1 },
    props: [
      { z: 2, draw: (P) => { for (const [dx, a] of [[0, 0.1], [6, 0.35], [-6, -0.15]]) { P.x.save(); P.x.translate(58 + dx, -206); P.x.rotate(-Math.PI / 2 + a); duckProp(P, 30, 0, 0, DUCK2, { s: 0.95 }); P.x.restore(); } } },
      { z: 2, draw: (P) => {
        const at = thrown ? [118, -300] : [-22, -292];
        const ang = thrown ? 0.6 : -2.2;
        P.x.save(); P.x.translate(at[0], at[1]); P.x.rotate(ang);
        P.limb(limbPoly([[-4, 0], [14, -6], [32, -4], [42, 4]], [[0, 5], [1, 4]], 4, true), C.yellow, { lw: 1 });
        P.disc(42, 4, 3.6, C.red, { lw: 0.8 });
        P.x.restore();
      } },
    ],
  };
}

// ------------------------------------------------------------------ animals
function bandWing(P, org, ang, L, Wd, pal) {
  // a spread wing seen flat: x along the wing; leading edge +y; coverts → blue → green → black primaries
  const x = P.x;
  x.save(); x.translate(org[0], org[1]); x.rotate(ang);
  const pts = [[0, Wd * 0.45], [L * 0.35, Wd * 0.55], [L * 0.7, Wd * 0.38], [L, 0]];
  const nf = 6;
  for (let k = 1; k <= nf; k++) {
    const t = k / nf, xx = L * (1 - 0.62 * t), yy = -Wd * (0.12 + 0.5 * Math.sin(t * Math.PI * 0.55));
    pts.push([xx + 3, yy + 2.2], [xx, yy]);
  }
  pts.push([L * 0.2, -Wd * 0.62], [0, -Wd * 0.45]);
  x.beginPath(); polyPath(x, pts); x.save(); x.clip();
  P.rect(-2, -Wd * 2, L * 0.36 + 2, Wd * 4, pal.cov);
  for (let k = 0; k < 6; k++) for (let r = 0; r < 2; r++) P.disc(3 + k * L * 0.055 + r * 2, (r - 0.5) * Wd * 0.45, 0.9, C.red, { lw: 0 });
  P.rect(L * 0.36, -Wd * 2, L * 0.16, Wd * 4, C.blue);
  P.rect(L * 0.52, -Wd * 2, L * 0.12, Wd * 4, C.green);
  P.rect(L * 0.64, -Wd * 2, L * 0.4, Wd * 4, C.black);
  for (const xx of [L * 0.36, L * 0.52, L * 0.64]) P.open([[xx, -Wd * 2], [xx, Wd * 2]], C.black, 0.7);
  for (let k = 1; k < 4; k++) P.open([[L * 0.66, (k / 4 - 0.5) * Wd], [L * 0.98, (k / 4 - 0.5) * Wd * 0.25]], '#56606a', 0.5);
  x.restore();
  P.poly(pts, null, { lw: 0.9 });
  x.restore();
}
const BIRD_PAL = {
  duck: { body: '#c99d64', head: C.green, cov: '#e9dcc0', bill: C.yellow },
  goose: { body: C.white, head: '#a8653a', cov: '#d8b080', bill: C.red },
  shrike: { body: '#d8c8a0', head: C.blue, cov: C.yellow, bill: C.black },
};
function flyBird(P, sp, up) {
  const pal = BIRD_PAL[sp];
  const far = { ...pal, cov: '#cbb58c' };
  bandWing(P, [0, -3], up ? -1.95 : 2.7, 44, 10, far);
  P.poly([[-16, -3], [-29, -8], [-30, 3], [-16, 4]], C.black, { lw: 0.8 });
  P.poly(ellPts(0, 0, 18, 7.2, -0.08, 20), pal.body, { lw: 1 });
  P.limb(limbPoly([[14, -3], [20, -6], [24, -7]], [[0, 7], [1, 5.6]], 3, false), pal.head, { lw: 0.9 });
  P.disc(25.5, -7.5, 5, pal.head, { lw: 0.9 });
  P.poly([[29.5, -9], [38, -7.4], [29.5, -5.4]], pal.bill, { lw: 0.8 });
  P.disc(26.6, -8.6, 1, C.black, { lw: 0 });
  P.open([[-6, 6], [-15, 9]], C.red, 1.6);
  bandWing(P, [4, -2], up ? -1.42 : 2.45, 50, 12, pal);
}

function drawCat(P, st) {
  const CAT = '#d4993f', DK = '#b7782f', STR = '#7e3418';
  const tail = st === 'B' ? [[-30, -30], [-48, -34], [-62, -27], [-68, -12]] : [[-30, -30], [-44, -46], [-46, -64], [-37, -78]];
  P.limb(limbPoly(tail, [[0, 7.5], [1, 4.8]], 6, true), CAT, { lw: 1 });
  const tl = smoothPath(tail, 6);
  for (let k = 8; k < tl.length - 2; k += 5) { const p = tl[k], q = tl[k + 1], d = nrm(sub(q, p)), n = [-d[1], d[0]]; P.open([add(p, mul(n, 3.6)), add(p, mul(n, -3.6))], STR, 1.4); }
  P.limb(limbPoly([[-26, -28], [-33, -14], [-27, 0]], [[0, 11], [1, 5]], 5, true), DK, { lw: 1 });
  P.limb(limbPoly([[22, -44], [36, -60], [47, -70]], [[0, 9], [1, 5]], 4, true), DK, { lw: 1 });
  // the bird caught in the paws
  P.x.save(); P.x.translate(54, -74); P.x.rotate(-0.5); flyBird(P, 'duck', true); P.x.restore();
  const body = [[-36, -30], [-22, -42], [2, -47], [22, -51], [34, -46], [32, -34], [16, -27], [-6, -23], [-26, -20], [-38, -24]];
  P.poly(body, CAT, { lw: 1.1, smooth: true });
  P.x.save(); P.x.beginPath(); pathCR(P.x, body); P.x.clip();
  for (let k = 0; k < 9; k++) P.open([[-30 + k * 7.5, -50], [-34 + k * 7.5, -18]], STR, 1.6);
  P.x.restore();
  P.limb(limbPoly([[-18, -26], [-11, -12], [-17, 0]], [[0, 13], [1, 5.5]], 5, true), CAT, { lw: 1 });
  P.limb(limbPoly([[18, -40], [34, -52], [49, -58]], [[0, 10], [1, 5.5]], 4, true), CAT, { lw: 1 });
  if (st === 'front') {
    const hc = [31, -60];
    P.poly([[hc[0] - 10, hc[1] - 4], [hc[0] - 9, hc[1] - 19], [hc[0] - 2, hc[1] - 9]], CAT, { lw: 1 });
    P.poly([[hc[0] + 10, hc[1] - 4], [hc[0] + 9, hc[1] - 19], [hc[0] + 2, hc[1] - 9]], CAT, { lw: 1 });
    P.poly(ellPts(hc[0], hc[1], 11.5, 10.5, 0, 20), CAT, { lw: 1.1 });
    for (const sx of [-1, 1]) {
      const e = [hc[0] + sx * 4.6, hc[1] - 2];
      P.poly(almond(e[0], e[1], 3.2, 2.2, 8), C.yellowLt, { lw: 0.8 });
      P.open([[e[0], e[1] - 2], [e[0], e[1] + 1.6]], C.black, 1.1);
    }
    P.poly([[hc[0] - 2, hc[1] + 3], [hc[0] + 2, hc[1] + 3], [hc[0], hc[1] + 5.4]], C.red, { lw: 0.6 });
    P.open([[hc[0], hc[1] + 5.4], [hc[0] - 3, hc[1] + 7.4]], C.black, 0.7); P.open([[hc[0], hc[1] + 5.4], [hc[0] + 3, hc[1] + 7.4]], C.black, 0.7);
    for (const sx of [-1, 1]) for (const dy of [-1, 1.4]) P.open([[hc[0] + sx * 5, hc[1] + 5 + dy * 0.6], [hc[0] + sx * 15, hc[1] + 3 + dy * 2.4]], C.black, 0.5);
    for (let k = 0; k < 3; k++) P.open([[hc[0] - 3 + k * 3, hc[1] - 10], [hc[0] - 3 + k * 3, hc[1] - 6]], STR, 1.1);
  } else {
    const hc = [35, -58];
    P.poly([[hc[0] - 7, hc[1] - 6], [hc[0] - 6, hc[1] - 19], [hc[0] + 1, hc[1] - 9]], CAT, { lw: 1 });
    P.poly([[hc[0] - 10, hc[1] + 2], [hc[0] - 9, hc[1] - 8], [hc[0] + 2, hc[1] - 11], [hc[0] + 10, hc[1] - 6], [hc[0] + 14, hc[1]], [hc[0] + 13, hc[1] + 4], [hc[0] + 6, hc[1] + 7], [hc[0] - 4, hc[1] + 8]], CAT, { lw: 1.1, smooth: true });
    P.poly(almond(hc[0] + 4, hc[1] - 3, 3, 2, 8), C.yellowLt, { lw: 0.8 });
    P.open([[hc[0] + 4.4, hc[1] - 5], [hc[0] + 4.4, hc[1] - 1.2]], C.black, 1);
    P.open([[hc[0] + 10, hc[1] + 3], [hc[0] + 20, hc[1] + 1]], C.black, 0.5); P.open([[hc[0] + 10, hc[1] + 4], [hc[0] + 19, hc[1] + 5.4]], C.black, 0.5);
    for (let k = 0; k < 3; k++) P.open([[hc[0] - 4 + k * 3, hc[1] - 9], [hc[0] - 6 + k * 3, hc[1] - 4]], STR, 1.1);
  }
}

function fish(P, cx, cy, s, flip, pal = 0) {
  const x = P.x;
  x.save(); x.translate(cx, cy); x.scale(s * (flip ? -1 : 1), s);
  const body = pal ? '#d9d2bd' : '#c8d2cf';
  P.poly([[-18, 0], [-28, -9], [-27, 9]], C.red, { lw: 0.9 });
  P.poly([[-12, -9], [-6, -16], [4, -17], [12, -12], [13, -9]], C.red, { lw: 0.8 });
  P.poly([[-6, 9], [0, 14], [6, 11], [4, 8]], C.red, { lw: 0.8 });
  P.poly([[-19, 0], [-12, -9], [0, -12], [12, -9], [20, -2], [19, 3], [10, 8], [-2, 10], [-14, 6]], body, { lw: 1, smooth: true });
  for (let k = 0; k < 4; k++) P.open([[-10 + k * 6, -7], [-12 + k * 6, 7]], 'rgba(60,80,90,0.55)', 0.6);
  P.open([[10, -7], [8, 0], [10, 6]], C.black, 0.8);
  P.disc(14, -3, 1.6, C.white, { lw: 0.6 }); P.disc(14.3, -3, 0.8, C.black, { lw: 0 });
  x.restore();
}
function butterfly(P, cx, cy, s, a) {
  const x = P.x;
  x.save(); x.translate(cx, cy); x.rotate(a); x.scale(s, s);
  P.poly([[0, 0], [-5, -12], [-12, -11], [-10, -2]], C.yellow, { lw: 0.8 });
  P.poly([[0, 0], [5, -13], [12, -12], [10, -2]], '#e0a33a', { lw: 0.8 });
  P.poly([[0, 1], [-8, 3], [-7, 9], [-1, 6]], C.red, { lw: 0.7 });
  P.poly([[0, 1], [8, 3], [7, 9], [1, 6]], C.red, { lw: 0.7 });
  P.open([[0, -3], [0, 6]], C.black, 1.4);
  P.disc(-7, -7, 1.3, C.black, { lw: 0 }); P.disc(7, -8, 1.3, C.black, { lw: 0 });
  x.restore();
}

// ------------------------------------------------------------------ the static wall
const WATER_UP = [268, 312], WATER_LO = [816, 866];
function water(P, y0, y1) {
  P.rect(-4, y0, 1008, y1 - y0, C.blue);
  const rows = 3, h = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const yc = y0 + h * (r + 0.5), pts = [];
    for (let k = -1; k <= 1008 / 7 + 1; k++) pts.push([k * 7 + (r % 2 ? 3.5 : 0), yc + (k % 2 ? -h * 0.26 : h * 0.26)]);
    P.open(pts, C.black, 1.3);
  }
  P.open([[-4, y0], [1004, y0]], C.black, 1.6); P.open([[-4, y1], [1004, y1]], C.black, 1.6);
}

function frieze(P) {
  // khekher ornaments (bound reed bundles) along the top
  const cols = [C.blue, C.red, C.green];
  for (let k = -1; k < 43; k++) {
    const cx = 12 + k * 24, c1 = cols[(k + 3) % 3], c2 = cols[(k + 4) % 3];
    P.poly([[cx - 8.5, 70], [cx + 8.5, 70], [cx + 6, 42], [cx - 6, 42]], c1, { lw: 1 });
    P.poly([[cx - 2.4, 69], [cx + 2.4, 69], [cx + 1.8, 43], [cx - 1.8, 43]], C.yellow, { lw: 0.6 });
    P.rect(cx - 7.5, 36.5, 15, 3, C.yellow, { lw: 0.8 });
    P.rect(cx - 6.5, 39.5, 13, 2.5, C.black);
    P.poly(ellPts(cx, 25, 6.8, 11, 0, 18), c2, { lw: 1 });
    P.poly(ellPts(cx, 26, 2.6, 6.5, 0, 12), C.yellow, { lw: 0.6 });
    P.disc(cx, 11, 2.6, C.red, { lw: 0.8 });
  }
  P.rect(-4, 70, 1008, 3.2, C.black);
  // block border
  const bc = [C.blue, C.white, C.red, C.white, C.green, C.white];
  for (let k = -1; k < 80; k++) P.rect(k * 13 + 2, 73.2, 13, 11.6, bc[(k + 6) % 6], { lw: 0.8 });
  P.rect(-4, 84.8, 1008, 2.6, C.black);
}

function papyrus(P) {
  const R = rng(`${ID}-papyrus`);
  const stems = [];
  const n = 66;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const bx = 448 + t * 470 + (R() - 0.5) * 8;
    if (bx > 520 && bx < 600 && R() < 0.5) continue;   // a gap where the cat climbs
    const back = R() < 0.5;
    const top = (back ? 150 : 166) + 48 * ((t - 0.5) * 2) ** 2 + (R() - 0.5) * 26;
    const lean = (t - 0.5) * 56 + (R() - 0.5) * 12;
    stems.push({ bx, tx: bx + lean, ty: top, kind: R() < 0.64 ? 'umbel' : 'bud', back, sc: 1.08 + R() * 0.34 });
  }
  // the stems bent down by the cat
  for (const [bx, tx, ty] of [[540, 556, 236], [556, 574, 232], [574, 594, 236]]) stems.push({ bx, tx, ty, kind: 'none', back: false });
  const umbel = (s) => {
    const d = nrm([s.tx - s.bx, s.ty - WATER_UP[0]]), ang = Math.atan2(d[1], d[0]) + Math.PI / 2;
    const x = P.x, sc = s.sc, col = s.back ? C.greenDk : C.green, dk = s.back ? '#1f4a36' : C.greenDk;
    x.save(); x.translate(s.tx, s.ty); x.rotate(ang); x.scale(sc, sc);
    if (s.kind === 'umbel') {
      const fan = [[-2.6, 0], [-14.5, -14.5], [-16, -18.5], [-10, -22], [0, -23.2], [10, -22], [16, -18.5], [14.5, -14.5], [2.6, 0]];
      P.poly(fan, col, { lw: 0.9 / sc });
      for (let k = -4; k <= 4; k++) P.open([[0, -2], [k * 3.5, -21.4 + Math.abs(k) * 0.35]], dk, 0.5 / sc);
      for (let k = -3; k <= 3; k++) P.disc(k * 4.4, -22.6 + Math.abs(k) * 0.5, 0.95, C.red, { lw: 0 });
      P.poly([[-2.6, 0.5], [-8, -6], [-1.2, -3.5]], dk, { lw: 0.5 / sc }); P.poly([[2.6, 0.5], [8, -6], [1.2, -3.5]], dk, { lw: 0.5 / sc });
    } else if (s.kind === 'bud') {
      P.poly([[-2.4, 1], [-5.6, -8], [-4.2, -17], [0, -24], [4.2, -17], [5.6, -8], [2.4, 1]], col, { lw: 0.9 / sc, smooth: true });
      P.poly([[-2.4, 1], [-4.6, -5], [0, -3], [4.6, -5], [2.4, 1]], dk, { lw: 0.5 / sc });
    }
    x.restore();
  };
  for (const pass of [true, false]) {
    for (const s of stems) {
      if (s.back !== pass) continue;
      const pts = s.kind === 'none' ? [[s.bx, WATER_UP[0]], [s.bx + 6, 250], [s.tx, s.ty]] : [[s.bx, WATER_UP[0]], [s.tx, s.ty]];
      P.open(pts, '#1c3d2c', 2.9, true);
      P.open(pts, s.back ? C.greenDk : C.green, 1.5, true);
    }
    for (const s of stems) if (s.back === pass) umbel(s);
  }
}

function skiff(P, cx, cy) {
  const top = [[cx - 136, cy - 46], [cx - 120, cy - 24], [cx - 92, cy - 12], [cx, cy - 9], [cx + 92, cy - 12], [cx + 120, cy - 24], [cx + 136, cy - 46]];
  const bot = [[cx + 128, cy - 40], [cx + 106, cy - 6], [cx + 60, cy + 6], [cx, cy + 8], [cx - 60, cy + 6], [cx - 106, cy - 6], [cx - 128, cy - 40]];
  const pts = top.concat(bot);
  P.poly(pts, C.green, { lw: 1.3, smooth: true });
  const x = P.x;
  x.save(); x.beginPath(); pathCR(x, pts); x.clip();
  P.open([[cx - 130, cy - 30], [cx - 100, cy - 4], [cx, cy], [cx + 100, cy - 4], [cx + 130, cy - 30]], C.greenDk, 1.1, true);
  for (let k = -8; k <= 8; k++) {
    const xx = cx + k * 15, tilt = k * 0.9;
    for (const d of [0, 3.4]) P.open([[xx + d - tilt, cy - 26], [xx + d + tilt * 0.3, cy + 12]], C.black, 1.1);
  }
  x.restore();
  for (const sx of [-1, 1]) {   // the bundle ends splay like umbels
    const e = [cx + sx * 134, cy - 44];
    P.poly([[e[0] - sx * 2, e[1] + 4], [e[0] + sx * 3, e[1] - 12], [e[0] + sx * 9, e[1] - 14], [e[0] + sx * 13, e[1] - 8], [e[0] + sx * 4, e[1] + 4]], C.green, { lw: 0.9 });
    for (const t of [0.3, 0.6]) P.open([[e[0], e[1] + 2], [e[0] + sx * (4 + t * 9), e[1] - 12 + t * 3]], C.greenDk, 0.6);
  }
}

function titleBand(P, K) {
  const y0 = 326, y1 = 392;
  P.rect(-4, y0, 1008, y1 - y0, C.yellow);
  P.open([[-4, y0], [1004, y0]], C.black, 1.8); P.open([[-4, y1], [1004, y1]], C.black, 1.8);
  P.open([[-4, y0 + 4], [1004, y0 + 4]], C.red, 1.1); P.open([[-4, y1 - 4], [1004, y1 - 4]], C.red, 1.1);
  const x = P.x;
  const glyph = (ch, cx, cy, size, fill, font, weight = 700, sw = 0.1) => {
    const fs = 160;
    const sp = K.textSprite({ text: ch, font, weight, size: fs, color: fill, stroke: C.black, strokeWidth: Math.round(fs * sw) });
    const src = sp.g.canvas || sp.g.elt;
    const sc = size / fs;
    x.drawImage(src, cx - (sp.w / 2) * sc, cy - (sp.pad + 0.47 * fs) * sc, sp.w * sc, sp.h * sc);
  };
  const ZH = '"Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif';
  const cy = (y0 + y1) / 2 + 1;
  drawSign(P, 'ankh', 24, cy - 21, 2.1);
  let cx = 80;
  [...'埃及壁画'].forEach((ch, k) => { glyph(ch, cx, cy, 46, k % 2 ? C.green : C.blue, ZH); cx += 50; });
  drawSign(P, 'sun', cx - 9, cy - 7, 1.4);
  cx += 30;
  [...'约公元前一三〇〇年'].forEach((ch, k) => { glyph(ch, cx, cy + 2, 33, k % 2 ? C.blue : C.red, ZH); cx += 35; });
  drawSign(P, 'pelican', cx - 6, cy - 14, 1.75);
  // English, two lines
  const EN = 'Optima, "Gill Sans", "Avenir Next", sans-serif';
  const line = (txt, lx, ly, size) => {
    const fs = 120;
    const sp = K.textSprite({ text: txt, font: EN, weight: 700, size: fs, color: C.blue, stroke: C.black, strokeWidth: 10, letterSpacing: 4 });
    const src = sp.g.canvas || sp.g.elt, sc = size / fs;
    x.drawImage(src, lx - sp.pad * sc, ly - (sp.pad + 0.47 * fs) * sc, sp.w * sc, sp.h * sc);
    return (sp.w - 2 * sp.pad) * sc;
  };
  const ex = 682;
  line('EGYPTIAN TOMB PAINTING', ex, cy - 11, 20);
  line('c. 1300 BCE', ex, cy + 13, 20);
}

const GRID_R = [X_F - 9 * 17.5 - 2, 800 - 22 * 17.5 - 2, X_F + 11 * 17.5 + 2, 802];
function canonGrid(P, alpha = 0.42) {
  const g = 17.5;
  const x0 = X_F - 9 * g, x1 = X_F + 11 * g, y0 = 800 - 22 * g;
  const x = P.x;
  x.save(); x.globalAlpha = alpha; x.lineCap = 'butt';
  for (let k = 0; k <= 22; k++) P.open([[x0, 800 - k * g], [x1, 800 - k * g]], C.sketch, k === 18 ? 1.3 : 0.7);
  for (let k = 0; k <= 20; k++) P.open([[x0 + k * g, y0], [x0 + k * g, 800]], C.sketch, 0.7);
  x.restore();
}

function lowerBands(P) {
  P.rect(-4, 800, 1008, 5, C.black);
  P.rect(-4, 805, 1008, 6, C.red);
  P.rect(-4, 811, 1008, 1.6, C.black);
  water(P, WATER_LO[0], WATER_LO[1]);
  const st = [[870, 881, C.yellow], [881, 884, C.black], [884, 896, C.red], [896, 899, C.black], [899, 909, C.white], [909, 912, C.black]];
  for (const [a, b, c] of st) P.rect(-4, a, 1008, b - a, c);
  P.rect(-4, 912, 1008, 92, '#7c3a26');
  const R = rng(`${ID}-granite`);
  for (let k = 0; k < 1500; k++) {
    const cx = R() * 1004, cy = 914 + R() * 88, r = 0.45 + R() * 1.2;
    P.disc(cx, cy, r, R() < 0.62 ? '#2a1a14' : '#c9b593', { lw: 0 });
  }
}

/** Every static painted element of the wall (one Canvas2D pass, panel units). */
function paintStatic(P, K, FZ) {
  frieze(P);
  // ---- upper register: marsh
  glyphBlock(P, rng(`${ID}-glyphs-up`), 18, 96, 6, 28, 164);
  papyrus(P);
  water(P, WATER_UP[0], WATER_UP[1]);
  skiff(P, 318, 270);
  fish(P, 96, 292, 0.85, false); fish(P, 470, 288, 0.8, true, 1); fish(P, 690, 294, 0.9, false, 1); fish(P, 905, 290, 0.8, true);
  butterfly(P, 466, 186, 1, -0.3); butterfly(P, 780, 104, 0.9, 0.2); butterfly(P, 905, 136, 0.85, -0.1);
  P.rect(-4, 312, 1008, 2.4, C.black); P.rect(-4, 314.4, 1008, 6, C.blue); P.rect(-4, 320.4, 1008, 2.4, C.black);
  titleBand(P, K);
  // ---- main register: captions, the unfinished gap
  glyphBlock(P, rng(`${ID}-glyphs-bearers`), 16, 396, 8, 29.5, 76);
  glyphBlock(P, rng(`${ID}-glyphs-noble`), 806, 396, 6, 30.5, 76);
  glyphBlock(P, rng(`${ID}-glyphs-scribe`), 712, 396, 3, 29, 70, { mirror: true });
  canonGrid(P);
  drawFreeze(P, FZ, true);
  lowerBands(P);
}

// ------------------------------------------------------------------ the pelican: the painted freeze pose
function featherWing(P, org, ang, L, pal, sk, curl = 0.4) {
  // a raised wing, flat: leading edge (+y) smooth, trailing edge serrated, bands along the wing; the outer
  // third curls forward like a palm raised in adoration
  const x = P.x;
  x.save(); x.translate(org[0], org[1]); x.rotate(ang);
  const x0 = L * 0.55;
  const warp = ([px, py]) => {
    if (px <= x0) return [px, py];
    const th = curl * ((px - x0) / (L - x0)) ** 1.4, dx = px - x0, c = Math.cos(th), sn = Math.sin(th);
    return [x0 + dx * c - py * sn, dx * sn + py * c];
  };
  const strip = (y0, y1) => { const top = [], bot = []; for (let k = 0; k <= 16; k++) { const xx = -4 + ((L + 10) * k) / 16; top.push(warp([xx, y0])); bot.push(warp([xx, y1])); } return top.concat(bot.reverse()); };
  const lineW = (pts) => pts.map(warp);
  const lead = [[0, 10], [L * 0.2, 15], [L * 0.45, 18], [L * 0.62, 17], [L * 0.8, 12], [L * 0.94, 6], [L, 1]];
  const trail = [];
  const nf = 9;
  for (let k = 0; k <= nf; k++) {
    const t = k / nf, xx = L * (1 - 0.72 * t);
    const yy = -lerp(4, 34, Math.sin(Math.min(1, t * 1.25) * Math.PI / 2)) * (1 - 0.1 * t);
    trail.push([xx - 4, yy + 4], [xx, yy]);
  }
  trail.push([L * 0.15, -26], [0, -16]);
  const poly = lead.concat(trail).map(warp);
  if (sk) { P.poly(poly, null, { lw: 1, ol: C.sketch }); for (const yy of [6, -4, -14]) P.open(lineW([[L * 0.06, yy], [L * 0.5, yy * 0.7], [L * 0.88, yy * 0.4]]), C.sketch, 0.7, true); x.restore(); return; }
  x.beginPath(); polyPath(x, poly); x.save(); x.clip();
  P.poly(strip(6, 40), pal.cov, { lw: 0 });
  for (let r = 0; r < 2; r++) for (let k = 0; k < 24; k++) { const c = warp([4 + k * 7 + r * 3.5, 9 + r * 5]); x.beginPath(); x.arc(c[0], c[1], 3.3, 0, Math.PI); x.lineWidth = 0.8; x.strokeStyle = C.red; x.stroke(); }
  P.poly(strip(-4, 6), pal.a, { lw: 0 });
  P.poly(strip(-15, -4), pal.b, { lw: 0 });
  P.poly(strip(-60, -15), C.black, { lw: 0 });
  for (const yy of [6, -4, -15]) { const ln = []; for (let k = 0; k <= 16; k++) ln.push(warp([-4 + ((L + 10) * k) / 16, yy])); P.open(ln, C.black, 0.8); }
  for (let k = 0; k < 18; k++) { const xx = 6 + k * 9; P.open(lineW([[xx, -4], [xx + 3, 6]]), C.black, 0.7); P.open(lineW([[xx + 4, -15], [xx + 7, -4]]), C.black, 0.7); }
  for (let k = 0; k < 12; k++) { const xx = 12 + k * 12.5; P.open(lineW([[xx, -15], [xx + 4.5, -27], [xx + 9, -40]]), '#4c5560', 0.6); }
  x.restore();
  P.poly(poly, null, { lw: 1.1 });
  x.restore();
}

function chariotWheel(P, c, R, sk) {
  const x = P.x;
  const angs = []; for (let k = 0; k < 6; k++) angs.push(-Math.PI / 2 + (k * Math.PI) / 3);
  if (sk) {
    P.disc(c[0], c[1], R, null, { lw: 1, ol: C.sketch }); P.disc(c[0], c[1], R - 12, null, { lw: 0.8, ol: C.sketch }); P.disc(c[0], c[1], 10, null, { lw: 0.8, ol: C.sketch });
    for (const a of angs) P.open([[c[0] + Math.cos(a) * 10, c[1] + Math.sin(a) * 10], [c[0] + Math.cos(a) * (R - 12), c[1] + Math.sin(a) * (R - 12)]], C.sketch, 0.8);
    x.save(); x.globalAlpha = 0.5; P.disc(c[0] + 1.2, c[1] - 0.8, R + 0.5, null, { lw: 0.7 }); x.restore();
    return;
  }
  P.disc(c[0], c[1], R - 2, null, { lw: 4.2 });
  x.beginPath(); x.arc(c[0], c[1], R - 4, 0, TAU); x.moveTo(c[0] + R - 12.5, c[1]); x.arc(c[0], c[1], R - 12.5, 0, TAU, true);
  x.fillStyle = C.yellow; x.fill('evenodd'); x.lineWidth = 1; x.strokeStyle = C.black; x.stroke();
  P.disc(c[0], c[1], R - 9.5, null, { lw: 1.6, ol: C.red });
  for (const a of angs) {
    const d = [Math.cos(a), Math.sin(a)];
    P.limb(limbPoly([add(c, mul(d, 8)), add(c, mul(d, R - 12))], [[0, 7.5], [1, 4.2]], 2, false), C.red, { lw: 1 });
    P.open([add(c, mul(d, 15)), add(c, mul(d, 19))], C.yellow, 5.4);
  }
  P.disc(c[0], c[1], 10.5, C.yellow, { lw: 1.1 });
  P.disc(c[0], c[1], 5.4, C.red, { lw: 0.9 });
  P.disc(c[0], c[1], 1.8, C.black, { lw: 0 });
}

function bikeLines(P, lines, sk, s = 1) {
  if (sk) { for (const pts of lines) P.open(pts, C.sketch, 0.9); return; }
  for (const pts of lines) P.open(pts, C.black, 7.6 * s);
  for (const pts of lines) P.open(pts, C.blue, 4.8 * s);
}

function birdEye(P, c, hw, hh, pupil, mode, kohl) {
  kohlEye(P, c[0], c[1], hw, hh, pupil, kohl, mode);
}

/** The canonical pose, from the placed freeze rig FZ. sk = the red cartoon on the wall. */
function drawFreeze(P, FZ, sk) {
  const x = P.x;
  const B = FZ.bird, K = FZ.bike;
  const OL = sk ? C.sketch : C.red;
  const fill = (c) => (sk ? null : c);
  const lw = (w) => (sk ? 0.9 : w);
  const sh = B.shoulder;
  const WP_NEAR = { cov: C.white, a: C.blue, b: C.green }, WP_FAR = { cov: '#e3d3ad', a: C.blueDk, b: C.greenDk };
  // far wing raised behind, far leg, far crank
  featherWing(P, add(sh, [-26, 8]), -1.92, 150, WP_FAR, sk, 0.32);
  const legLine = (L, col) => {
    const hip = L.hip, an = L.ankle;
    const poly = limbPoly([hip, mixP(hip, an, 0.5), an], [[0, 17], [0.55, 10], [1, 7]], 2, true);
    P.limb(poly, fill(col), { lw: lw(1.1), ol: sk ? C.sketch : C.black });
    const py = an[1] + 13;
    P.poly([[an[0] - 5, an[1] + 2], [an[0] + 4, an[1] - 1], [an[0] + 23, py - 1.6], [an[0] + 24, py + 1.4], [an[0] - 4, py + 1.4]], fill(col), { lw: lw(1), ol: sk ? C.sketch : C.black });
  };
  legLine(B.legFar, C.redDk);
  P.open([K.crank.bb, K.crank.far], sk ? C.sketch : C.black, sk ? 0.9 : 3.8);
  // the bicycle as a diagram
  for (const wh of K.wheels) chariotWheel(P, wh.c, wh.r, sk);
  if (!sk) { x.setLineDash([2.2, 2.2]); P.open(K.chain.concat([K.chain[0]]), C.black, 1.2); x.setLineDash([]); }
  bikeLines(P, [...Object.values(K.tubes), K.fork, K.stem, K.bars, K.seatpost], sk);
  P.open(K.saddle, sk ? C.sketch : C.black, sk ? 0.9 : 6.4);
  P.disc(K.crank.bb[0], K.crank.bb[1], K.crank.ring + 1, fill(C.yellow), { lw: lw(1.1), ol: sk ? C.sketch : C.black });
  if (!sk) P.disc(K.crank.bb[0], K.crank.bb[1], 6, null, { lw: 0.9 });
  // the bird: tail feathers, body, neck and head as one white silhouette with a red-ochre outline
  const tb = add(B.bodyC, [-52, 6]);
  const tails = [-0.18, 0, 0.18].map((a) => {
    const ang = Math.PI + a, L = a === 0 ? 40 : 34, d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
    return [add(tb, mul(n, 6)), add(add(tb, mul(d, L * 0.6)), mul(n, 6)), add(tb, mul(d, L)), add(add(tb, mul(d, L * 0.6)), mul(n, -6)), add(tb, mul(n, -6))];
  });
  const sil = [...tails, B.body, B.neck];
  if (sk) {
    for (const p of sil) P.poly(p, null, { lw: 0.9, ol: C.sketch });
    P.disc(B.head.c[0], B.head.c[1], B.head.r, null, { lw: 0.9, ol: C.sketch });
  } else {
    for (const p of sil) P.poly(p, null, { lw: 2.6, ol: OL });
    P.disc(B.head.c[0], B.head.c[1], B.head.r, null, { lw: 2.6, ol: OL });
    for (const t of tails) { P.poly(t, C.white, { lw: 0 }); P.open([t[1], t[2], t[3]], C.black, 1.4); }
    P.poly(B.body, C.white, { lw: 0 }); P.poly(B.neck, C.white, { lw: 0 }); P.disc(B.head.c[0], B.head.c[1], B.head.r, C.white, { lw: 0 });
    // body feathering: rows of red scallops
    x.save(); x.beginPath(); polyPath(x, B.body); x.clip();
    for (let r = 0; r < 3; r++) for (let k = 0; k < 13; k++) {
      const cx = B.bodyC[0] - 52 + k * 9 + (r % 2) * 4.5, cy = B.bodyC[1] + 6 + r * 8 - k * 0.9;
      x.beginPath(); x.arc(cx, cy, 4, 0.15, Math.PI - 0.15); x.lineWidth = 0.8; x.strokeStyle = C.red; x.stroke();
    }
    x.restore();
    // a broad collar at the base of the neck
    const n0 = B.neckSpine[0], n1 = B.neckSpine[4];
    const d = nrm(sub(n1, n0));
    x.save(); x.translate(n0[0] + d[0] * 6, n0[1] + d[1] * 6); x.rotate(Math.atan2(d[1], d[0]) + Math.PI / 2); x.scale(1.05, 0.7);
    collar(P, 0, 0, 0.95);
    x.restore();
  }
  // the near wing raised in adoration
  featherWing(P, add(sh, [-8, 2]), -1.66, 168, WP_NEAR, sk, 0.46);
  // head details
  for (const c of B.crest) P.open(c, sk ? C.sketch : C.red, sk ? 0.8 : 1.4);
  P.poly(B.pouch, fill(C.yellow), { lw: lw(1.2), ol: OL });
  if (!sk) { const pp = B.pouch; for (let k = 3; k < 22; k += 3) P.open([pp[k], mixP(pp[k], B.lowerJawLine[0], 0.25)], 'rgba(166,64,42,0.6)', 0.6); }
  P.poly(B.upperBill, fill(C.yellowLt), { lw: lw(1.2), ol: OL });
  if (!sk) { P.open(B.lowerJawLine, C.red, 1.1); P.poly(B.nail, C.red, { lw: 0 }); }
  if (sk) P.poly(almond(B.eye.c[0], B.eye.c[1], 8.6, 4), null, { lw: 0.8, ol: C.sketch });
  else birdEye(P, B.eye.c, 8.6, 4, [B.eye.c[0] + 1.2, B.eye.c[1] - 0.5], 'normal', 11);
  // near leg, crank and pedal
  legLine(B.legNear, C.red);
  P.open([K.crank.bb, K.crank.near], sk ? C.sketch : C.black, sk ? 0.9 : 4.2);
  P.open([[K.crank.near[0] - 7, K.crank.near[1]], [K.crank.near[0] + 7, K.crank.near[1]]], sk ? C.sketch : C.black, sk ? 0.9 : 5);
}

// ------------------------------------------------------------------ the pelican: the riding rig in this palette
const BIKE_ROLES = new Set(['frame', 'fork', 'stem', 'bars', 'seatpost']);
function paintRig(P, pose, parts) {
  const x = P.x;
  const B = pose.bird;
  const s = pose.place?.scale ?? 1;
  let bikeDone = false, birdDone = false, neckDone = false;
  const sideStroke = (pts, col, w) => { const n = pts.length / 2; P.open(pts.slice(0, n), col, w); P.open(pts.slice(n), col, w); };
  for (const part of parts) {
    const r = part.role;
    switch (r) {
      case 'legFar': P.poly(part.pts, C.redDk, { lw: 0 }); sideStroke(part.pts, C.black, 1.1); break;
      case 'leg': P.poly(part.pts, C.red, { lw: 0 }); sideStroke(part.pts, C.black, 1.1); break;
      case 'footFar': P.poly(part.pts, C.redDk, { lw: 1 }); break;
      case 'foot': P.poly(part.pts, C.red, { lw: 1 }); break;
      case 'crankFar': P.open(part.pts, C.black, 3.4 * s); break;
      case 'crank': P.open(part.pts, C.black, 3.8 * s); break;
      case 'pedal': P.open(part.pts, C.black, 5 * s); break;
      case 'tire': P.disc(part.c[0], part.c[1], part.r - 2 * s, null, { lw: 4.2 * s }); break;
      case 'rim': P.disc(part.c[0], part.c[1], part.r - 1 * s, null, { lw: 2.6 * s, ol: C.blue }); P.disc(part.c[0], part.c[1], part.r - 2.8 * s, null, { lw: 0.7 }); break;
      case 'spoke': P.open(part.pts, C.black, 1.3 * s); break;
      case 'hub': P.disc(part.c[0], part.c[1], 5 * s, C.yellow, { lw: 1 }); break;
      case 'chain': x.setLineDash([2.2, 2.2]); P.open(part.pts, C.black, 1.2); x.setLineDash([]); break;
      case 'frame': case 'fork': case 'stem': case 'bars': case 'seatpost':
        if (!bikeDone) { bikeDone = true; bikeLines(P, parts.filter((p) => BIKE_ROLES.has(p.role)).map((p) => p.pts), false, s); }
        break;
      case 'saddle': P.open(part.pts, C.black, 6.4 * s); break;
      case 'ring': P.disc(part.c[0], part.c[1], part.r + 1, C.yellow, { lw: 1.1 }); P.disc(part.c[0], part.c[1], part.r * 0.4, null, { lw: 0.9 }); break;
      case 'tail': case 'body': {
        if (birdDone) break;
        birdDone = true;
        const tail = parts.find((p) => p.role === 'tail'), body = parts.find((p) => p.role === 'body');
        P.poly(tail.pts, null, { lw: 2.6, ol: C.red }); P.poly(body.pts, null, { lw: 2.6, ol: C.red });
        P.poly(tail.pts, C.white, { lw: 0 }); P.poly(body.pts, C.white, { lw: 0 });
        P.open([tail.pts[1], tail.pts[2]], C.black, 1.6);
        break;
      }
      case 'wing': {
        const pts = part.pts;
        x.save(); x.beginPath(); polyPath(x, pts); x.clip();
        x.save(); x.translate(B.bodyC[0], B.bodyC[1]); x.rotate(B.bodyAng);
        P.rect(-80, -60, 160, 42, C.white);
        for (let rr = 0; rr < 2; rr++) for (let k = 0; k < 18; k++) { x.beginPath(); x.arc(-70 + k * 8 + rr * 4, -24 + rr * 4.5, 3.2, 0, Math.PI); x.lineWidth = 0.75; x.strokeStyle = C.red; x.stroke(); }
        P.rect(-80, -18, 160, 12, C.blue);
        P.rect(-80, -6, 160, 11, C.green);
        P.rect(-80, 5, 160, 40, C.black);
        for (const yy of [-18, -6, 5]) P.open([[-80, yy], [80, yy]], C.black, 0.8);
        for (let k = 0; k < 14; k++) P.open([[-74 + k * 11, 6], [-70 + k * 11, 24]], '#4c5560', 0.6);
        for (let k = 0; k < 20; k++) { const xx = -76 + k * 8; P.open([[xx, -18], [xx - 3, -7]], C.black, 0.6); P.open([[xx + 4, -7], [xx + 1, 3]], C.black, 0.6); }
        x.restore();
        x.restore();
        P.poly(pts, null, { lw: 1.1 });
        break;
      }
      case 'secondaries': P.open(part.pts, C.black, 3 * s, true); break;
      case 'primary': P.open(part.pts, C.black, 3.6 * s, true); break;
      case 'neck': case 'head': {
        if (neckDone) break;
        neckDone = true;
        const neck = parts.find((p) => p.role === 'neck'), hd = parts.find((p) => p.role === 'head');
        const body = parts.find((p) => p.role === 'body');
        // outline only outside the body (no seam where the neck joins it)
        x.save(); x.beginPath(); x.rect(-2000, -2000, 5000, 5000); polyPath(x, body.pts); x.clip('evenodd');
        P.poly(neck.pts, null, { lw: 2.6, ol: C.red }); P.disc(hd.c[0], hd.c[1], hd.r, null, { lw: 2.6, ol: C.red });
        x.restore();
        P.poly(neck.pts, C.white, { lw: 0 }); P.disc(hd.c[0], hd.c[1], hd.r, C.white, { lw: 0 });
        break;
      }
      case 'crest': P.open(part.pts, C.red, 1.3 * s); break;
      case 'pouch': P.poly(part.pts, C.yellow, { lw: 1.2, ol: C.red }); break;
      case 'bill': P.poly(part.pts, C.yellowLt, { lw: 1.2, ol: C.red }); P.open(B.lowerJawLine, C.red, 1.1); break;
      case 'nail': P.poly(part.pts, C.red, { lw: 0 }); break;
      case 'eye': {
        const E = B.eye, wide = E.mode === 'wide';
        const pup = E.mode === 'white' ? [E.c[0], E.c[1] - 2.4 * s] : [E.pupil[0] + 0.4 * s, E.pupil[1]];
        kohlEye(P, E.c[0], E.c[1], (wide ? 8 : 7) * s, (wide ? 4 : 3.2) * s, pup, 8 * s, E.mode === 'white' ? 'normal' : E.mode);
        break;
      }
      case 'eyeShut': kohlEye(P, B.eye.c[0], B.eye.c[1], 7 * s, 3.2 * s, B.eye.c, 8 * s, 'closed'); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ cartouche
function drawCartouche(P, K, which) {
  // which: 'ring' | 'bar' | k (char index) | 'all'
  const x = P.x;
  const { cx, y0, y1, w } = CART;
  const r = w / 2;
  const ring = () => {
    x.beginPath(); x.moveTo(cx - r, y0 + r); x.arc(cx, y0 + r, r, Math.PI, 0); x.lineTo(cx + r, y1 - r); x.arc(cx, y1 - r, r, 0, Math.PI); x.closePath();
    x.lineWidth = 8.2; x.strokeStyle = C.black; x.stroke(); x.lineWidth = 5; x.strokeStyle = C.red; x.stroke();
    // rope twists
    const n = 54;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const per = 2 * (y1 - y0 - 2 * r) + 2 * Math.PI * r;
      let d = t * per, p, tn;
      const sL = y1 - y0 - 2 * r, aL = Math.PI * r;
      if (d < aL) { const a = Math.PI + d / r; p = [cx + Math.cos(a) * r, y0 + r + Math.sin(a) * r]; tn = [-Math.sin(a), Math.cos(a)]; }
      else if ((d -= aL) < sL) { p = [cx + r, y0 + r + d]; tn = [0, 1]; }
      else if ((d -= sL) < aL) { const a = d / r; p = [cx + Math.cos(a) * r, y1 - r + Math.sin(a) * r]; tn = [-Math.sin(a), Math.cos(a)]; }
      else { d -= aL; p = [cx - r, y1 - r - d]; tn = [0, -1]; }
      const nn = [-tn[1], tn[0]];
      P.open([add(p, add(mul(nn, 2.2), mul(tn, -1.4))), add(p, add(mul(nn, -2.2), mul(tn, 1.4)))], C.black, 0.7);
    }
  };
  if (which === 'ring' || which === 'all') ring();
  if (which === 'bar' || which === 'all') P.poly([[cx - r - 4, y1 + 1], [cx + r + 4, y1 + 1], [cx + r + 4, y1 + 9], [cx - r - 4, y1 + 9]], C.red, { lw: 1.4 });
  const chars = [...'鹈鹕测试'];
  chars.forEach((ch, k) => {
    if (which !== 'all' && which !== k) return;
    const fs = 160;
    const sp = K.textSprite({ text: ch, font: '"Yuanti SC", "PingFang SC", sans-serif', weight: 700, size: fs, color: k % 2 ? C.green : C.blue, stroke: C.black, strokeWidth: 15 });
    const src = sp.g.canvas || sp.g.elt, sc = CART.size / fs;
    x.drawImage(src, cx - (sp.w / 2) * sc, CHAR_Y(k) - (sp.pad + 0.47 * fs) * sc, sp.w * sc, sp.h * sc);
  });
}

/**
 * Build the cartouche sprite + a per-pixel reveal time (0..1 over the painting beat): the rope ring is drawn
 * round from the top, then the tie bar, then each character stroke group by stroke group (components ordered
 * top→bottom, left→right, each wiped along its long axis).
 */
function buildCartouche(K) {
  const region = [CART.cx - CART.w / 2 - 10, CART.y0 - 8, CART.cx + CART.w / 2 + 10, CART.y1 + 14];
  const full = raster(region, (P) => drawCartouche(P, K, 'all'));
  const { w, h, i0, j0 } = full;
  const key = new Float32Array(w * h).fill(9);
  const set = (rs, fn) => {
    for (let o = 0; o < w * h; o++) if (rs.data[o * 4 + 3] > 30 && key[o] > 8) key[o] = fn(o);
  };
  const r = CART.w / 2;
  const ringR = raster(region, (P) => drawCartouche(P, K, 'ring'));
  set(ringR, (o) => {
    // arc length along the rope from the top (measured anticlockwise; the brush runs clockwise from the top)
    const px = (i0 + (o % w) + 0.5) / S, py = (j0 + Math.floor(o / w) + 0.5) / S;
    const sL = CART.y1 - CART.y0 - 2 * r, per = TAU * r + 2 * sL, q = (Math.PI * r) / 2;
    let d;
    if (py < CART.y0 + r) {
      const a = Math.atan2(py - CART.y0 - r, px - CART.cx);
      d = a <= -Math.PI / 2 ? (-Math.PI / 2 - a) * r : per - (a + Math.PI / 2) * r;
    } else if (py > CART.y1 - r) {
      const a = Math.atan2(py - CART.y1 + r, px - CART.cx);
      d = q + sL + (Math.PI - Math.max(0, a)) * r;
    } else d = px < CART.cx ? q + (py - CART.y0 - r) : q + sL + Math.PI * r + (CART.y1 - r - py);
    return 0.02 + 0.2 * Math.min(1, Math.max(0, 1 - d / per));   // clockwise: down the scribe's side first
  });
  const barR = raster(region, (P) => drawCartouche(P, K, 'bar'));
  set(barR, (o) => 0.22 + 0.03 * ((o % w) / w));
  const slot = 0.75 / 4;
  for (let k = 0; k < 4; k++) {
    const cr = raster(region, (P) => drawCartouche(P, K, k));
    // connected components of the glyph mask
    const lab = new Int32Array(w * h).fill(-1);
    const comps = [];
    for (let o = 0; o < w * h; o++) {
      if (cr.data[o * 4 + 3] <= 30 || lab[o] >= 0) continue;
      const id = comps.length, stack = [o];
      const c = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0, px: [] };
      lab[o] = id;
      while (stack.length) {
        const q = stack.pop(), qx = q % w, qy = (q / w) | 0;
        c.n++; c.px.push(q);
        if (qx < c.x0) c.x0 = qx; if (qx > c.x1) c.x1 = qx; if (qy < c.y0) c.y0 = qy; if (qy > c.y1) c.y1 = qy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nq = ny * w + nx;
          if (lab[nq] < 0 && cr.data[nq * 4 + 3] > 30) { lab[nq] = id; stack.push(nq); }
        }
      }
      comps.push(c);
    }
    comps.sort((a, b) => (a.y0 + 0.4 * a.x0) - (b.y0 + 0.4 * b.x0));
    const weight = comps.map((c) => Math.max(c.x1 - c.x0, c.y1 - c.y0) + 4);
    const tot = weight.reduce((s, v) => s + v, 0);
    let t0 = 0.25 + k * slot;
    comps.forEach((c, ci) => {
      const dt = (slot * weight[ci]) / tot;
      const horiz = c.x1 - c.x0 > c.y1 - c.y0;
      for (const q of c.px) {
        const f = horiz ? ((q % w) - c.x0) / (c.x1 - c.x0 + 1) : (((q / w) | 0) - c.y0) / (c.y1 - c.y0 + 1);
        if (key[q] > 8) key[q] = t0 + dt * f;
      }
      t0 += dt;
    });
  }
  // stray antialiased pixels left without a key belong to the last thing painted nearby: give them 0.999
  for (let o = 0; o < w * h; o++) if (full.data[o * 4 + 3] > 0 && key[o] > 8) key[o] = 0.999;
  const px = new Uint8ClampedArray(w * h * 4);
  paintPx(full.data, w, h, i0, j0, px, 'sprite');
  return { i0, j0, w, h, px, key };
}

// ------------------------------------------------------------------ flip-book states
const beatIdx = (u) => Math.floor(u * 2 + 1e-6);
const wallBeat = (u) => (u >= 2 && u < 4 ? 3 : beatIdx(u));     // the wall pauses while the gag plays
const mod = (a, n) => ((a % n) + n) % n;
function penStage(u) {
  const p = (u - 2.5) / 0.5;
  if (p < 0.25) return 'penR';
  return 'pen' + Math.min(4, 1 + Math.floor((p - 0.25) / (0.75 / 4) + 1e-6));
}
const BIRDS = [
  { id: 'f1', x: 492, y: 128, sp: 'duck', phase: 0, a: -0.12 },
  { id: 'f2', x: 622, y: 112, sp: 'goose', phase: 1, a: 0.05 },
  { id: 'f3', x: 742, y: 138, sp: 'shrike', phase: 0, a: -0.2, s: 0.8 },
  { id: 'f4', x: 846, y: 116, sp: 'duck', phase: 1, a: 0.1 },
  { id: 'f5', x: 952, y: 160, sp: 'goose', phase: 0, a: -0.25, s: 0.85 },
  { id: 'f6', x: 688, y: 196, sp: 'shrike', phase: 1, a: 0.15, s: 0.75 },
];
const FIGS = [
  ...BIRDS.map((b) => ({
    id: b.id, region: [b.x - 52, b.y - 58, b.x + 52, b.y + 50],
    key: (u) => `${b.id}:${mod(wallBeat(u) + b.phase, 2) ? 'dn' : 'up'}`,
    draw: (P, key) => { const x = P.x; x.save(); x.translate(b.x, b.y); x.rotate(b.a); x.scale(b.s ?? 1, b.s ?? 1); flyBird(P, b.sp, key.endsWith('up')); x.restore(); },
  })),
  { id: 'cat', region: [486, 100, 684, 242], key: (u) => (u >= 3 && u < 5.5 ? 'cat:front' : `cat:${Math.floor(wallBeat(u) / 4) % 2 ? 'B' : 'A'}`),
    draw: (P, key) => { const x = P.x; x.save(); x.translate(566, 236); drawCat(P, key.split(':')[1]); x.restore(); } },
  { id: 'fowler', region: [240, 78, 430, 266], key: (u) => `fowler:${Math.floor((wallBeat(u) + 2) / 4) % 2 ? 'B' : 'A'}`,
    draw: (P, key) => person(P, CAST.fowler, fowlerState(key.split(':')[1])) },
  ...['b1', 'b2', 'b3'].map((id) => ({
    id, region: [CAST[id].x - 52, 470, CAST[id].x + 100, 806],
    key: (u) => `${id}:${Math.floor((wallBeat(u) + 64 + CAST[id].phase) / 4) % 2 ? 'B' : 'A'}`,
    draw: (P, key) => person(P, CAST[id], bearerState(id, key.split(':')[1])),
  })),
  { id: 'scribe', region: [CAST.scribe.x - 110, 470, CAST.scribe.x + 60, 806],
    key: (u) => {
      let st;
      if (u >= 5) st = 'look';
      else if (u >= 4) st = mod(wallBeat(u), 4) < 2 ? 'idle' : 'dip';
      else if (u >= 3) st = 'idle';
      else if (u >= 2.5) st = penStage(u);
      else if (u >= 1.5) st = 'raise';
      else st = mod(wallBeat(u), 4) < 2 ? 'idle' : 'dip';
      return `scribe:${st}`;
    },
    draw: (P, key) => person(P, CAST.scribe, scribeState(key.split(':')[1])) },
  { id: 'wife', region: [CAST.wife.x - 60, 470, CAST.wife.x + 60, 806],
    key: (u) => {
      let st;
      if (u >= 5.5) st = 'sniff';
      else if (u >= 3) st = 'back';
      else st = Math.floor((wallBeat(u) + 64) / 8) % 2 ? 'sniff' : 'fwd';
      return `wife:${st}`;
    },
    draw: (P, key) => person(P, CAST.wife, wifeState(key.split(':')[1])) },
  { id: 'noble', region: [CAST.noble.x - 64, 440, Math.min(1000, CAST.noble.x + 90), 806],
    key: (u) => `noble:${u >= 5.5 ? 'bye' : u >= 3 ? 'back' : 'fwd'}`,
    draw: (P, key) => person(P, CAST.noble, nobleState(key.split(':')[1])) },
];

// ------------------------------------------------------------------ cracks and losses (overlay)
const LOSSES = [
  { x: 968, y: 30, r: 52, k: 1, fill: false }, { x: 6, y: 960, r: 70, k: 2, fill: false }, { x: 596, y: 986, r: 40, k: 3, fill: true },
  { x: 994, y: 846, r: 17, k: 5, fill: false }, { x: 420, y: 92, r: 16, k: 6, fill: false },
  { x: 742, y: 900, r: 22, k: 7, fill: true },
];
const CRACKS = [
  { x: 586, y: -4, a: 1.52, len: 300, w: 1.2, k: 1 }, { x: 1004, y: 430, a: 2.4, len: 170, w: 1.0, k: 2 }, { x: 470, y: 1004, a: -1.6, len: 190, w: 1.2, k: 3 },
  { x: -4, y: 520, a: 0.35, len: 110, w: 0.9, k: 4 }, { x: 160, y: -4, a: 1.7, len: 90, w: 0.9, k: 5 }, { x: 860, y: 1004, a: -1.9, len: 130, w: 1.0, k: 6 },
];
function buildOverlay() {
  const NN = N * N;
  // loss mask
  const mc = mkCanvas(N, N), mx = ctx2d(mc);
  mx.setTransform(S, 0, 0, S, 0, 0);
  const fillMask = mkCanvas(N, N), fx = ctx2d(fillMask);
  fx.setTransform(S, 0, 0, S, 0, 0);
  for (const L of LOSSES) {
    const P = [];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU;
      const m = 0.62 + 0.75 * fbm(Math.cos(a) * 1.3 + L.k * 7, Math.sin(a) * 1.3, 200 + L.k, 4) + 0.12 * (vnoise(k * 1.7, L.k, 210) - 0.5);
      P.push([L.x + Math.cos(a) * L.r * m, L.y + Math.sin(a) * L.r * m * 0.85]);
    }
    const c = L.fill ? fx : mx;
    c.fillStyle = '#000'; c.beginPath(); polyPath(c, P); c.fill();
  }
  const M = mx.getImageData(0, 0, N, N).data, FM = fx.getImageData(0, 0, N, N).data;
  // cracks
  const cc = mkCanvas(N, N), cx2 = ctx2d(cc);
  cx2.setTransform(S, 0, 0, S, 0, 0); cx2.lineCap = 'round'; cx2.lineJoin = 'round';
  for (const c of CRACKS) {
    const R = rng(`${ID}-crack-${c.k}`);
    const walk = (x, y, a, len, w, depth) => {
      const pts = [[x, y]];
      let L = 0;
      while (L < len) { const st = 3 + R() * 5; a += (R() - 0.5) * 0.6; x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push([x, y]); if (depth < 2 && R() < 0.05) walk(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), len * (0.2 + R() * 0.25), w * 0.6, depth + 1); }
      for (let k = 1; k < pts.length; k++) {
        const tw = w * (1 - 0.6 * (k / pts.length)) * (0.6 + 0.8 * vnoise(k * 0.35, c.k, 220));
        cx2.strokeStyle = '#000'; cx2.lineWidth = tw;
        cx2.beginPath(); cx2.moveTo(pts[k - 1][0], pts[k - 1][1]); cx2.lineTo(pts[k][0], pts[k][1]); cx2.stroke();
      }
    };
    walk(c.x, c.y, c.a, c.len, c.w, 0);
  }
  const CK = cx2.getImageData(0, 0, N, N).data;
  const out = new Uint8ClampedArray(NN * 4);
  const at = (A, i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : A[(j * N + i) * 4 + 3]);
  const off = Math.round(2 * S), rim = Math.round(3 * S);
  const MUD = [128, 100, 72], FILLC = [196, 178, 146];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i, k = o * 4;
    const x = (i + 0.5) / S, y = (j + 0.5) / S;
    const m = M[k + 3] / 255, fm = FM[k + 3] / 255;
    if (m > 0) {   // mud plaster: straw, grit, shadow under the upper-left lip
      const n = fbm(x / 6, y / 6, 230, 3), g = hash3(i, j, 231);
      let br = 0.86 + 0.25 * (n - 0.5) + 0.12 * (g - 0.5);
      const straw = vnoise(x * 0.7 + y * 0.15, y * 0.09 - x * 0.05, 232);
      if (straw > 0.82) br *= 1.22;
      const ul = at(M, i - off, j - off) / 255;
      br *= 1 - 0.38 * (1 - ul) * m;
      out[k] = MUD[0] * br; out[k + 1] = MUD[1] * br; out[k + 2] = MUD[2] * br; out[k + 3] = 255 * Math.min(1, m * 1.2);
      continue;
    }
    if (fm > 0) {   // a conservator's toned fill, flush, slightly smoother
      const n = fbm(x / 14, y / 14, 233, 2);
      const br = 0.97 + 0.06 * (n - 0.5);
      out[k] = FILLC[0] * br; out[k + 1] = FILLC[1] * br; out[k + 2] = FILLC[2] * br; out[k + 3] = 255 * fm;
      continue;
    }
    // the broken edge of the painted plaster around a loss: a pale, chipped margin
    let near = 0;
    for (const [dx, dy] of [[rim, 0], [-rim, 0], [0, rim], [0, -rim], [rim, rim], [-rim, -rim], [rim, -rim], [-rim, rim]]) near = Math.max(near, at(M, i + dx, j + dy));
    if (near > 0 && hash3(i >> 1, j >> 1, 234) < 0.85) {
      const lr = at(M, i - off, j - off) / 255;
      out[k] = 236 - 30 * lr; out[k + 1] = 222 - 30 * lr; out[k + 2] = 192 - 30 * lr; out[k + 3] = 220 * (near / 255);
      continue;
    }
    const ck = CK[k + 3] / 255;
    if (ck > 0) { out[k] = 58; out[k + 1] = 44; out[k + 2] = 34; out[k + 3] = 235 * ck; continue; }
    const lip = at(CK, i - 1, j - 1) / 255;
    if (lip > 0) { out[k] = 238; out[k + 1] = 226; out[k + 2] = 198; out[k + 3] = 90 * lip; }
  }
  const cv = mkCanvas(N, N);
  ctx2d(cv).putImageData(new ImageData(out, N, N), 0, 0);
  return cv;
}

// ------------------------------------------------------------------ build everything (init)
let BUILT = null;
function trimSprite(r, out, key) {
  let a0 = r.w, a1 = -1, b0 = r.h, b1 = -1;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (out[(j * r.w + i) * 4 + 3] > 2) { if (i < a0) a0 = i; if (i > a1) a1 = i; if (j < b0) b0 = j; if (j > b1) b1 = j; }
  if (a1 < 0) return null;
  const tw = a1 - a0 + 1, th = b1 - b0 + 1;
  const px = new Uint8ClampedArray(tw * th * 4);
  for (let j = 0; j < th; j++) px.set(out.subarray(((j + b0) * r.w + a0) * 4, ((j + b0) * r.w + a0 + tw) * 4), j * tw * 4);
  return { key, i0: r.i0 + a0, j0: r.j0 + b0, w: tw, h: th, px };
}

function buildAll(K) {
  buildFields();
  const FZ = freezeGeo(K);
  // the static wall
  const wall = mkCanvas(N, N), wx = ctx2d(wall);
  wx.setTransform(S, 0, 0, S, 0, 0); wx.lineCap = 'round'; wx.lineJoin = 'round';
  paintStatic(painter(wx), K, FZ);
  paintPx(wx.getImageData(0, 0, N, N).data, N, N, 0, 0, null, 'wall');
  const { W, SOOT } = F;
  const wallPx = new Uint8ClampedArray(N * N * 4);
  for (let o = 0; o < N * N; o++) {
    const s = (SOOT[o] / 255) * SOOT_K;
    wallPx[o * 4] = W[o * 3] + (SOOTC[0] - W[o * 3]) * s;
    wallPx[o * 4 + 1] = W[o * 3 + 1] + (SOOTC[1] - W[o * 3 + 1]) * s;
    wallPx[o * 4 + 2] = W[o * 3 + 2] + (SOOTC[2] - W[o * 3 + 2]) * s;
    wallPx[o * 4 + 3] = 255;
  }
  ctx2d(wall).setTransform(1, 0, 0, 1, 0, 0);
  ctx2d(wall).putImageData(new ImageData(wallPx, N, N), 0, 0);
  // flip-book sprites
  const sprites = [];
  for (const f of FIGS) {
    const keys = new Set();
    for (let q = -8 * 16; q <= 14 * 16; q++) keys.add(f.key(q / 16));
    for (const key of keys) {
      const r = raster(f.region, (P) => f.draw(P, key));
      const out = new Uint8ClampedArray(r.w * r.h * 4);
      paintPx(r.data, r.w, r.h, r.i0, r.j0, out, 'sprite');
      const sp = trimSprite(r, out, key);
      if (sp) sprites.push(sp);
    }
  }
  // the painted freeze pose
  const fr = raster([X_F - 200, 400, X_F + 215, 806], (P) => drawFreeze(P, FZ, false));
  const frOut = new Uint8ClampedArray(fr.w * fr.h * 4);
  paintPx(fr.data, fr.w, fr.h, fr.i0, fr.j0, frOut, 'sprite', -0.01);
  const frz = trimSprite(fr, frOut, 'freeze');
  sprites.push(frz);
  // shelf-pack into one atlas
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
  const cart = buildCartouche(K);
  const overlay = buildOverlay();
  BUILT = { wall, atlas, AW, AH, map, frz, cart, overlay, nSprites: sprites.length };
}

function freezeGeo(K) {
  const pose = K.rig.pose({ crank: Math.PI, wheel: 0, t: 0, v: 0 }, { spokes: 6, bob: 0 });
  return K.rig.placed(pose, { x: X_F, y: 800, scale: 1, rot: 0 });
}

function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}

// ------------------------------------------------------------------ live pelican
let PB = null;
function pelBuf() {
  if (PB) return PB;
  const PW = 560, PH = 540;
  const cv = mkCanvas(PW, PH);
  PB = { PW, PH, cv, x: ctx2d(cv), img: createImage(PW, PH), img2: createImage(PW, PH) };
  return PB;
}

/** Paint the riding rig live; mask(o) → keep pixel (used by the dissolve). */
function drawRig(K, rider, view, keep) {
  const P = rider.placed;
  const parts = K.rig.parts(P);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const ext = (p, r = 0) => { if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r; if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r; };
  for (const part of parts) { if (part.kind === 'circle') ext(part.c, part.r + 4); else for (const p of part.pts) ext(p, 6); }
  x0 = Math.max(x0 - 8, 0, view.x0 - 4); y0 = Math.max(y0 - 8, 0); x1 = Math.min(x1 + 8, 1000, view.x1 + 4); y1 = Math.min(y1 + 8, 1000);
  if (x1 <= x0 || y1 <= y0) return;
  const B = pelBuf();
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(B.PW, Math.ceil(x1 * S) - i0), h = Math.min(B.PH, Math.ceil(y1 * S) - j0);
  const x = B.x;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, B.PW, B.PH);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  paintRig(painter(x), P, parts);
  const src = x.getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  paintPx(src, w, h, i0, j0, out.data, 'sprite', -0.015, true);
  if (keep) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j0 + j) * N + i0 + i; if (!keep(o)) out.data[(j * w + i) * 4 + 3] = 0; }
  const ic = B.img.drawingContext;
  ic.clearRect(0, 0, B.PW, B.PH);
  ic.putImageData(out, 0, 0);
  B.img.setModified(true);
  image(B.img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

/** The freeze sprite with a per-pixel keep mask (dissolve). */
function drawFreezeMasked(keep) {
  const f = BUILT.frz, B = pelBuf();
  const out = new ImageData(f.w, f.h);
  const d = out.data;
  d.set(f.px);
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) { const o = (f.j0 + j) * N + f.i0 + i; if (!keep(o)) d[(j * f.w + i) * 4 + 3] = 0; }
  const ic = B.img2.drawingContext;
  ic.clearRect(0, 0, B.PW, B.PH);
  ic.putImageData(out, 0, 0);
  B.img2.setModified(true);
  image(B.img2, f.i0 / S, f.j0 / S, f.w / S, f.h / S, 0, 0, f.w, f.h);
}

let CB = null;
function drawCartoucheLive(p) {
  const c = BUILT.cart;
  if (!CB) CB = { img: createImage(c.w, c.h), out: new ImageData(c.w, c.h) };
  const d = CB.out.data;
  for (let o = 0; o < c.w * c.h; o++) {
    const k = o * 4, t = c.key[o];
    if (t > p) { d[k + 3] = 0; continue; }
    const wet = t > p - 0.05 ? 0.78 : 1;   // fresh paint is darker for a moment
    d[k] = c.px[k] * wet; d[k + 1] = c.px[k + 1] * wet; d[k + 2] = c.px[k + 2] * wet; d[k + 3] = c.px[k + 3];
  }
  const ic = CB.img.drawingContext;
  ic.putImageData(CB.out, 0, 0);
  CB.img.setModified(true);
  image(CB.img, c.i0 / S, c.j0 / S, c.w / S, c.h / S);
}

// ------------------------------------------------------------------ the rider's path: stop dead on the downbeat
const herm = (p0, m0, p1, m1, t) => { const t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1; };
const U_IN = 1.0, U_OUT = 4.9;
function drawnX(u) {
  const p = profile(RIDE);
  if (u <= U_IN || u >= U_OUT) return p.x(u);
  if (u < T_SNAP) { const T = T_SNAP - U_IN; return herm(p.x(U_IN), p.v(U_IN) * T, X_F, 0, (u - U_IN) / T); }
  if (u < T_MELT) return X_F;
  const T = U_OUT - T_MELT;
  return herm(X_F, 0, p.x(U_OUT), p.v(U_OUT) * T, (u - T_MELT) / T);
}

/** Inside (1, 4.9) the bird is drawn on its own path: re-pose it so pedals and wheels follow that path. */
function reposed(K, u, rider, mods) {
  const pl = rider.place, st = rider.state;
  const dx = pl.x - profile(RIDE).x(u);
  if (Math.abs(dx) < 1e-6) return rider;
  const pose = K.rig.pose({ crank: st.crank + (TAU * dx) / CRANK_DIST, wheel: st.wheel + dx / WHEEL_R, t: st.t, v: st.v }, mods);
  return { ...rider, placed: K.rig.placed(pose, pl) };
}

// ------------------------------------------------------------------ scene
export default {
  freezeU: 3.2,   // the painted pose, the finished cartouche, the noble couple and the cat looking
  ride: RIDE,
  cues: [{ u: 1.5, name: 'scribe' }, { u: 2.0, name: 'freezePose' }, { u: 2.5, name: 'cartouche' }, { u: 3.0, name: 'nobleTurns' }, { u: 3.6, name: 'rideOn' }],

  async init(K) {
    if (!BUILT) buildAll(K);
    const wi = toImage(BUILT.wall), ai = toImage(BUILT.atlas), oi = toImage(BUILT.overlay);
    this.wall = K.bake('wall', N, N, (K2, w, h) => { image(wi, 0, 0, w, h); });
    this.atlas = K.bake('atlas', BUILT.AW, BUILT.AH, (K2, w, h) => { image(ai, 0, 0, w, h); });
    this.ov = K.bake('overlay', N, N, (K2, w, h) => { image(oi, 0, 0, w, h); });
    const c = BUILT.cart;
    const full = mkCanvas(c.w, c.h);
    ctx2d(full).putImageData(new ImageData(c.px, c.w, c.h), 0, 0);
    const ci = toImage(full);
    this.cartFull = K.bake('cart', c.w, c.h, (K2, w, h) => { image(ci, 0, 0, w, h); });
    const gr = raster(GRID_R, (P) => canonGrid(P, 0.85));
    const gc = mkCanvas(gr.w, gr.h); ctx2d(gc).putImageData(new ImageData(gr.data, gr.w, gr.h), 0, 0);
    const gi = toImage(gc);
    this.grid = K.bake('grid', gr.w, gr.h, (K2, w, h) => { image(gi, 0, 0, w, h); });
    this.gridR = [gr.i0 / S, gr.j0 / S, gr.w / S, gr.h / S];
    this.map = BUILT.map;
    this.stats = { sprites: BUILT.nSprites, atlas: [BUILT.AW, BUILT.AH], bakeMB: (2 * N * N * 4 + BUILT.AW * BUILT.AH * 4 + c.w * c.h * 4) / 1048576 };
  },

  path(u, base) {
    if (u <= U_IN || u >= U_OUT) return base;
    const p = profile(RIDE);
    return { ...base, x: base.x + (drawnX(u) - p.x(u)) };
  },

  mods(u) {
    const m = { spokes: 6 };
    const w = win(3.75, 4.9, u, 0.3);
    if (w > 1e-4) m.wind = 0.45 * w;     // the burst away after the freeze
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    imageMode(CORNER);
    image(this.wall, 0, 0, 1000, 1000);
    // the cartouche (wall paint, under the figures)
    const c = BUILT.cart;
    if (u >= 3.0 || ctx.freeze) image(this.cartFull, c.i0 / S, c.j0 / S, c.w / S, c.h / S);
    else if (u >= 2.5) drawCartoucheLive((u - 2.5) / 0.5);
    // the canon grid flares on the snap downbeat
    if (u >= T_SNAP && u < T_SNAP + 0.75 && !ctx.freeze) {
      push(); tint(255, 255 * (1 - (u - T_SNAP) / 0.75) ** 2);
      image(this.grid, ...this.gridR);
      pop();
    }
    for (const f of FIGS) {
      const sp = this.map.get(f.key(u));
      if (!sp || sp.x > v.x1 || sp.x + sp.w < v.x0) continue;
      image(this.atlas, sp.x, sp.y, sp.w, sp.h, sp.ax, sp.ay, sp.aw, sp.ah);
    }
    // the pelican
    const rider = ctx.rider.visible && u > U_IN && u < U_OUT ? reposed(K, u, ctx.rider, this.mods(u)) : ctx.rider;
    const fz = this.map.get('freeze');
    const frozen = ctx.freeze || (u >= T_SNAP && u < T_MELT);
    if (frozen) image(this.atlas, fz.x, fz.y, fz.w, fz.h, fz.ax, fz.ay, fz.aw, fz.ah);
    else if (u >= T_MELT && u < T_MELT_END) {
      const p = (u - T_MELT) / (T_MELT_END - T_MELT);
      const th = 255 * p;
      const DIS = F.DIS;
      drawFreezeMasked((o) => DIS[o] >= th);
      if (rider.visible) drawRig(K, rider, v, (o) => DIS[o] < th);
    } else if (rider.visible) drawRig(K, rider, v, null);
    image(this.ov, 0, 0, 1000, 1000);
  },
};
