// 03 · 汉画像石拓片 / Han Stone-Relief Rubbing · c. 100 CE
//
// An ink rubbing (拓片) taken from an Eastern Han pictorial stone (画像石) — an original composition
// in the manner of the Shandong shrine reliefs: a 车马出行 chariot procession in the main register,
// a cloud frieze with phoenixes and feathered immortals above, Han ornament bands between.
//
// Technique (deterministic, built once in init; 0 live p5.brush marks):
//   • every carved shape is drawn with Canvas2D as WHITENESS (white = cut away, black = raised stone),
//     then "printed" by printPx(): blurred and thresholded against a noise tile (hand-cut edges), the paper
//     sagging into the cut takes a grey fringe, the raised surface takes dabbed ink (cellular pad mottle,
//     greyer zones, darker rims beside the cuts, chisel striations);
//   • the static stone (bands, cloud frieze, title cartouche, paper margins, seal, archive note) is one bake;
//     the procession is a sprite atlas (one sprite per carved flip-book state); chariot wheels are separate
//     sprites that roll; the pelican is carved live every frame with the same printer;
//   • sheet-level effects (grit specks, creases, fibres, pinholes, cracks) are two static overlays composited
//     with MULTIPLY / SCREEN over everything, so the moving figures share the paper's texture.
import { profile } from '../beat/ride.js';
import { SPEED } from '../beat/timeline.js';
import { rng, smoothPath, ribbon } from '../kit/math.js';
import * as ink from '../kit/ink.js';

const ID = 'han';
const S = 1.25;                       // px per panel unit for every raster in this panel
const N = Math.round(1000 * S);
const TAU = Math.PI * 2;
const RIDE = { hold: [2.0, 4.0], speed: 0.65, ramp: 0.35 };
const VP = RIDE.speed * SPEED;        // procession pace = the pelican's pace in the tableau
let PROF = null;
const riderX = (u) => (PROF || (PROF = profile(RIDE))).x(u);

const INK = [20, 18, 16], PAPER = [233, 227, 214], MARGIN = [216, 207, 191];

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

/** 256² periodic noise tile (edge raggedness of the cuts; sampled with & 255). */
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
    TILE[j * T + i] = 0.4 * pv(i / 16, j / 16, 16, 3) + 0.3 * pv(i / 8, j / 8, 32, 4) + 0.2 * pv(i / 4, j / 4, 64, 5) + 0.1 * hash3(i, j, 6);
  }
  return TILE;
}

/** Separable box blur (radius r px, `passes` times ≈ gaussian). */
function blur(src, w, h, r, passes = 1) {
  let cur = src;
  const tmp = new Float32Array(w * h);
  const d = (2 * r + 1) * (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      const o = j * w;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += cur[o + (i < 0 ? 0 : i >= w ? w - 1 : i)];
      for (let i = 0; i < w; i++) {
        tmp[o + i] = acc;
        const ia = i - r, ib = i + r + 1;
        acc += cur[o + (ib >= w ? w - 1 : ib)] - cur[o + (ia < 0 ? 0 : ia)];
      }
    }
    for (let i = 0; i < w; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[(j < 0 ? 0 : j >= h ? h - 1 : j) * w + i];
      for (let j = 0; j < h; j++) {
        dst[j * w + i] = acc / d;
        const ja = j - r, jb = j + r + 1;
        acc += tmp[(jb >= h ? h - 1 : jb) * w + i] - tmp[(ja < 0 ? 0 : ja) * w + i];
      }
    }
    cur = dst;
  }
  return cur;
}

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
function lumOf(data, n) { const L = new Float32Array(n); for (let k = 0; k < n; k++) L[k] = data[k * 4] / 255; return L; }

// ------------------------------------------------------------------ the printer (whiteness → rubbing)
// P: edge (raggedness), rim (dark ink halo next to the cuts), haze (ink on the sunk paper), fringe (grey where
// the paper bends into the cut), ink (ink coverage of the raised surface inside a sprite)
const P_FIG = { edge: 0.55, rim: 0.9, haze: 0.045, fringe: 0.3, ink: 0.965 };
const P_RIDER = { edge: 0.5, rim: 0.9, haze: 0.04, fringe: 0.3, ink: 0.965 };

/** Print whiteness L (w×h, Float32 0..1; values < 1 inside white = rough/damaged) into RGBA `out`. */
function printPx(L, w, h, nx, ny, out, P) {
  const B1 = blur(L, w, h, 1, 1), B2 = blur(L, w, h, 2, 1), F = blur(L, w, h, 3, 2);
  const T = tile();
  for (let j = 0; j < h; j++) {
    const tj = ((j + ny) & 255) * 256;
    for (let i = 0; i < w; i++) {
      const k = j * w + i, o = k * 4;
      const f = F[k];
      if (f < 0.003) { out[o + 3] = 0; continue; }
      const n = T[tj + ((i + nx) & 255)];
      const wv = sm(0.38, 0.62, B1[k] + (n - 0.5) * P.edge);
      const a = Math.max(wv, sm(0.01, 0.2, f) * P.rim);
      if (a < 0.004) { out[o + 3] = 0; continue; }
      const g = clamp01(P.haze + (n - 0.5) * 0.07 + P.fringe * (1 - B2[k]) + (1 - L[k]) * 0.7 * (L[k] > 0.3 ? 1 : 0));
      const A = P.ink * (1 - wv) + g * wv;
      out[o] = PAPER[0] + (INK[0] - PAPER[0]) * A;
      out[o + 1] = PAPER[1] + (INK[1] - PAPER[1]) * A;
      out[o + 2] = PAPER[2] + (INK[2] - PAPER[2]) * A;
      out[o + 3] = a * 255;
    }
  }
}

// ------------------------------------------------------------------ Canvas2D shape helpers
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
/** Tapered limb polygon along a smooth spine. W: number or [[t, w], ...]. */
function limbPoly(pts, W, per = 6) {
  const sp = pts.length > 2 ? smoothPath(pts, per) : [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]];
  const f = keyW(W);
  return { poly: ribbon(sp, f), sp, a: sp[0], b: sp[sp.length - 1], w0: f(0), w1: f(1) };
}
const rotAbout = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };
/** Hand-cut wobble (deterministic, position-keyed). */
const jit = (P, a = 0.6, s = 7) => P.map(([px, py]) => [px + (vnoise(px * 0.23, py * 0.23, s) - 0.5) * 2 * a, py + (vnoise(px * 0.23 + 57, py * 0.23, s + 1) - 0.5) * 2 * a]);
const ell = (cx, cy, rx, ry, rot = 0, n = 14) => { const o = []; for (let k = 0; k < n; k++) { const a = (k / n) * TAU; const px = Math.cos(a) * rx, py = Math.sin(a) * ry; o.push([cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)]); } return o; };

/** The carver: white shapes knocked out of the black, each outlined by a thin uncut ridge (separation). */
function carver(x) {
  const sepStroke = (sep) => { if (sep > 0) { x.lineWidth = 2 * sep; x.strokeStyle = '#000'; x.lineJoin = 'round'; x.stroke(); } };
  const line = (P, smooth) => { x.beginPath(); if (smooth && P.length > 2) pathCR(x, P, false); else polyPath(x, P, false); };
  const C = {
    x,
    cr(P, sep = 1) { x.beginPath(); pathCR(x, P, true); sepStroke(sep); x.fillStyle = '#fff'; x.fill(); },
    pl(P, sep = 1) { x.beginPath(); polyPath(x, P, true); sepStroke(sep); x.fillStyle = '#fff'; x.fill(); },
    limb(L, sep = 1, caps = true) {
      x.beginPath(); polyPath(x, L.poly, true);
      if (caps) { x.moveTo(L.a[0] + L.w0 / 2, L.a[1]); x.arc(L.a[0], L.a[1], L.w0 / 2, 0, TAU); x.moveTo(L.b[0] + L.w1 / 2, L.b[1]); x.arc(L.b[0], L.b[1], L.w1 / 2, 0, TAU); }
      sepStroke(sep);
      x.fillStyle = '#fff';
      x.beginPath(); polyPath(x, L.poly, true); x.fill();
      if (caps) { x.beginPath(); x.arc(L.a[0], L.a[1], L.w0 / 2, 0, TAU); x.fill(); x.beginPath(); x.arc(L.b[0], L.b[1], L.w1 / 2, 0, TAU); x.fill(); }
    },
    disc(cx, cy, r, sep = 1) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); sepStroke(sep); x.fillStyle = '#fff'; x.fill(); },
    ring(cx, cy, r0, r1, sep = 1) {
      x.beginPath(); x.arc(cx, cy, r1, 0, TAU); x.moveTo(cx + r0, cy); x.arc(cx, cy, r0, 0, TAU, true);
      sepStroke(sep); x.fillStyle = '#fff'; x.fill('evenodd');
    },
    /** white incised line */
    inc(P, w = 2.2, sep = 0.8, smooth = true, cap = 'round') {
      x.lineCap = cap; line(P, smooth);
      if (sep > 0) { x.lineWidth = w + 2 * sep; x.strokeStyle = '#000'; x.stroke(); }
      x.lineWidth = w; x.strokeStyle = '#fff'; x.stroke(); x.lineCap = 'round';
    },
    /** black reserved line on a white figure */
    cut(P, w = 1.6, smooth = true, closed = false) {
      x.lineCap = 'round'; x.beginPath();
      if (smooth && P.length > 2) pathCR(x, P, closed); else polyPath(x, P, closed);
      x.lineWidth = w; x.strokeStyle = '#000'; x.stroke();
    },
    circ(cx, cy, r, w = 1.4) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.lineWidth = w; x.strokeStyle = '#000'; x.stroke(); },
    dot(cx, cy, r, white = false) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = white ? '#fff' : '#000'; x.fill(); },
    blk(P) { x.beginPath(); polyPath(x, P, true); x.fillStyle = '#000'; x.fill(); },
    grey(P, v = 0.75) { const g = Math.round(v * 255); x.beginPath(); pathCR(x, P, true); x.fillStyle = `rgb(${g},${g},${g})`; x.fill(); },
    rect(x0, y0, w, h) { x.fillStyle = '#fff'; x.fillRect(x0, y0, w, h); },
  };
  return C;
}

/** Draw one CJK glyph centred at (cx, cy), `size` units tall (white). */
function glyph(x, K, ch, cx, cy, size, font = '"Libian SC", "Kaiti SC", serif', weight = 400, stroke = 0) {
  const fs = 160;
  const sp = K.textSprite({ text: ch, font, weight, size: fs, color: '#ffffff', stroke: stroke ? '#ffffff' : undefined, strokeWidth: stroke });
  const src = sp.g.canvas || sp.g.elt;
  const sc = size / fs;
  x.save(); x.translate(cx, cy); x.scale(sc, sc);
  x.drawImage(src, -sp.w / 2, -(sp.pad + 0.5 * fs));
  x.restore();
}

// ------------------------------------------------------------------ heads, people
/** Profile head with a hat; face = +1 looks right, −1 looks left. */
function head(C, cx, cy, r, face = 1, hat = 'wu', sep = 0.9) {
  const M = (P) => P.map(([a, b]) => [cx + face * a * r, cy + b * r]);
  if (hat === 'jx') C.pl(jit(M([[-0.9, -0.5], [-0.55, -1.15], [0.05, -1.3], [0.55, -2.15], [0.95, -2.0], [0.8, -1.1], [0.95, -0.6]]), 0.3), sep);
  C.disc(cx, cy, r, sep);
  C.pl(M([[0.55, -0.6], [1.34, 0.08], [0.95, 0.3], [0.62, 0.55]]), 0);   // nose and chin
  if (hat === 'wu') C.cr(jit(M([[-1.08, -0.15], [-1.05, -0.95], [-0.5, -1.55], [0.35, -1.55], [0.92, -0.95], [0.6, -0.62], [-0.2, -0.75], [-0.75, -0.2]]), 0.25), sep);
  if (hat === 'ze') C.cr(jit(M([[-1.05, -0.1], [-1.15, -1.0], [-0.75, -1.55], [-0.1, -1.4], [0.8, -1.05], [0.95, -0.55], [0.1, -0.7]]), 0.25), sep);
  if (hat === 'jx') C.cut(M([[-0.95, -0.55], [0.85, -0.85]]), 1.3, false);
  if (hat === 'wu') { C.cut(M([[-0.95, -0.25], [0.7, -0.7]]), 1.2, false); C.inc(M([[-0.9, -0.1], [-1.25, 0.9]]), 1.3, 0.5); }
  if (hat === 'ze') C.cut(M([[-1.0, -0.3], [0.75, -0.75]]), 1.2, false);
  C.dot(cx + face * r * 0.45, cy - r * 0.15, Math.max(1.1, r * 0.15));
  C.cut(M([[-0.15, 0.1], [0.05, 0.4]]), 1.0, false);   // ear
}

// ------------------------------------------------------------------ the Han horse
// tall, arched neck, small bridled head, barrel body, long thin legs, the near foreleg lifted high
const HORSE = {
  body: [[-66, -110], [-42, -114], [-12, -108], [12, -112], [26, -124], [35, -142], [43, -160], [53, -174], [63, -181],
    [72, -178], [81, -167], [89, -154], [95, -146], [96, -139], [90, -134], [80, -137], [71, -146],
    [65, -136], [65, -120], [68, -106], [64, -91], [54, -80], [36, -74], [6, -70], [-24, -71], [-46, -76],
    [-60, -84], [-70, -96], [-72, -106]],
  ear: [[61, -178], [63, -190], [68, -179]],
  tops: { NF: [50, -88], FF: [42, -88], NH: [-50, -92], FH: [-42, -94] },
  legs: {
    A: { NF: [[74, -76], [76, -54], [67, -47]], FF: [[44, -46], [36, -14], [38, 0]], NH: [[-66, -50], [-58, -14], [-54, 0]], FH: [[-58, -56], [-42, -32], [-34, -26]] },
    B: { NF: [[54, -46], [50, -14], [52, 0]], FF: [[68, -76], [70, -54], [61, -47]], NH: [[-62, -58], [-48, -32], [-40, -26]], FH: [[-56, -50], [-48, -14], [-45, 0]] },
    F: { NF: [[79, -84], [81, -60], [72, -53]], FF: [[44, -46], [38, -14], [40, 0]], NH: [[-66, -50], [-60, -14], [-57, 0]], FH: [[-50, -52], [-40, -15], [-37, 0]] },
    R: { NF: [[74, -80], [72, -58], [62, -50]], FF: [[68, -72], [66, -52], [56, -46]] },
  },
  tail: [[-68, -104], [-86, -112], [-100, -102], [-108, -82], [-106, -62]],
  knot: [[-68, -104], [-82, -112], [-92, -102], [-88, -90]],
};
const W_FORE = [[0, 17], [0.35, 9], [0.5, 6.4], [0.75, 5.2], [0.9, 5.8], [1, 5.4]];
const W_HIND = [[0, 26], [0.3, 12], [0.5, 7], [0.8, 5.4], [1, 5.4]];

function hoof(C, L) {
  const sp = L.sp, b = L.b, p = sp[Math.max(0, sp.length - 4)];
  let dx = b[0] - p[0], dy = b[1] - p[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const nx = -dy, ny = dx;
  C.pl([[b[0] + nx * 3 - dx, b[1] + ny * 3 - dy], [b[0] + nx * 3.8 + dx * 4.5, b[1] + ny * 3.8 + dy * 4.5], [b[0] - nx * 3.6 + dx * 5, b[1] - ny * 3.6 + dy * 5], [b[0] - nx * 3 - dx, b[1] - ny * 3 - dy]], 0.7);
}

/** Draw a horse at local x offset ox. Returns key points (mouth, withers, back) after the pose transform. */
function drawHorse(C, ox, pose, o = {}) {
  const rear = pose === 'R';
  const th = rear ? -0.42 : 0, piv = [-56, -10];
  const T = (p) => { const q = th ? rotAbout(p, piv, th) : p; return [ox + q[0], q[1]]; };
  const A = (p) => [ox + p[0], p[1]];
  const Lg = HORSE.legs[rear ? 'F' : pose];
  const leg = (name, joints, abs = false) => limbPoly([T(HORSE.tops[name]), ...joints.map((p) => (abs ? A(p) : T(p)))], name[1] === 'F' ? W_FORE : W_HIND, 5);
  let legs;
  if (rear) {
    legs = {
      NF: leg('NF', HORSE.legs.R.NF), FF: leg('FF', HORSE.legs.R.FF),
      NH: leg('NH', [[-72, -44], [-62, -12], [-59, 0]], true), FH: leg('FH', [[-60, -46], [-49, -12], [-46, 0]], true),
    };
  } else legs = { NF: leg('NF', Lg.NF), FF: leg('FF', Lg.FF), NH: leg('NH', Lg.NH), FH: leg('FH', Lg.FH) };
  // far legs, tail
  C.limb(legs.FF, 0.9); hoof(C, legs.FF);
  C.limb(legs.FH, 0.9); hoof(C, legs.FH);
  const tl = o.knot ? HORSE.knot : HORSE.tail.map((p, k) => [p[0] - (pose === 'B' ? k * 1.2 : 0), p[1] + (pose === 'B' ? k * 1.4 : 0)]);
  C.limb(limbPoly(tl.map(T), o.knot ? [[0, 11], [0.6, 9], [1, 6]] : [[0, 11], [0.4, 9], [0.8, 5], [1, 2.2]], 5), 0.9);
  if (o.knot) C.limb(limbPoly([T([-90, -96]), T([-96, -84]), T([-95, -68])], [[0, 6], [1, 2.2]], 4), 0.7);
  // body
  C.cr(jit(HORSE.body.map(T), 0.5, 11), 1.1);
  C.pl(HORSE.ear.map(T), 0.8);
  // near legs
  C.limb(legs.NH, 1.0); hoof(C, legs.NH);
  C.limb(legs.NF, 1.0); hoof(C, legs.NF);
  // incised details: mane, eye, bridle, nostril, haunch and chest lines
  for (let k = 0; k < 8; k++) {
    const t = 0.06 + k * 0.12;
    const p = [lerp(26, 62, t), lerp(-122, -178, t)];
    C.cut([T([p[0] - 1, p[1] + 3]), T([p[0] - 8, p[1] + 10])], 1.3, false);
  }
  C.dot(...T([77, -166]), 2.3);
  C.cut([T([69, -175]), T([81, -157]), T([92, -142])], 1.4);
  C.cut([T([86, -152]), T([95, -145])], 1.3, false);
  C.cut([T([93, -140]), T([90, -137])], 1.0, false);
  C.cut([T([-36, -108]), T([-48, -96]), T([-52, -86])], 1.2);
  C.cut([T([58, -128]), T([60, -110]), T([56, -96])], 1.1);
  if (o.harness) {
    C.cut([T([28, -122]), T([50, -112]), T([64, -98])], 1.9);
    C.cut([T([22, -112]), T([21, -92]), T([22, -72])], 1.9);
  }
  if (o.saddle) {
    C.cut([T([-30, -110]), T([-31, -90]), T([16, -90]), T([18, -113])], 1.6, false);
    C.cut([T([-26, -96]), T([12, -96])], 1.0, false);
  }
  return { mouth: T([92, -137]), withers: T([24, -123]), back: T([-6, -109]), T };
}

// ------------------------------------------------------------------ procession figures
// local frames: ground y = 0, facing right. Chariot: origin under the wheel hub.
const CH = { r: 46, hx: 112 };

function canopy(C) {
  C.inc([[-8, -84], [-8, -240]], 4.0, 0.9, false);
  const outer = [[-64, -228], [-50, -248], [-8, -262], [34, -249], [50, -228]];
  const inner = [[46, -222], [20, -230], [-8, -234], [-36, -230], [-60, -222]];
  C.cr(jit(outer.concat(inner), 0.4, 21), 1.1);
  C.cut([[-58, -228], [-40, -242], [-8, -250], [26, -243], [44, -229]], 1.4);
  C.cut([[-54, -226], [-34, -235], [-8, -239], [22, -235], [42, -226]], 1.1);
  C.disc(-8, -266, 4.4, 0.8);
  for (const [bx, by] of [[-62, -225], [48, -225]]) {
    C.limb(limbPoly([[bx, by], [bx - 1, by + 12], [bx - 2, by + 24]], [[0, 4.6], [1, 2.6]], 3), 0.7);
    C.disc(bx - 2, by + 27, 3.6, 0.6);
  }
  for (let k = 1; k < 7; k++) { const xm = lerp(-58, 44, k / 7); C.limb(limbPoly([[xm, -224], [xm, -214]], [[0, 2.6], [1, 1.6]], 2), 0.5); }
}

function passenger(C, pose) {
  const hip = [-14, -86];
  const robe = [[-33, -84], [-32, -108], [-28, -126], [-19, -134], [-9, -133], [-3, -124], [1, -104], [3, -84]];
  const sleeve = [[-12, -124], [3, -121], [12, -113], [11, -102], [0, -97], [-11, -103]];
  if (pose === 'lean') {
    const R = (p) => rotAbout(p, hip, -0.45);
    C.cr(jit(robe.map(R), 0.4, 31), 1);
    C.cut([R([-21, -131]), R([-15, -120]), R([-9, -131])], 1.2);
    C.limb(limbPoly([R([-8, -124]), [-38, -106], [-44, -90]], [[0, 9], [0.7, 6.5], [1, 5]], 4), 0.9);   // arm on the rail
    const hc = R([-15, -144]);
    head(C, hc[0] - 4, hc[1] + 3, 9.6, -1, 'jx');
  } else if (pose === 'point') {
    C.cr(jit(robe.map(([a, b]) => [a, b - 4]), 0.4, 31), 1);
    C.cut([[-21, -135], [-15, -124], [-9, -135]], 1.2);
    head(C, -15, -148, 9.6, 1, 'jx');
    C.limb(limbPoly([[-9, -128], [8, -141], [28, -154]], [[0, 9], [0.6, 6.5], [1, 5]], 4), 0.9);
    C.inc([[28, -154], [39, -161]], 2.6, 0.6, false);
  } else {
    C.cr(jit(robe, 0.4, 31), 1);
    C.cut([[-21, -131], [-15, -120], [-9, -131]], 1.2);
    C.cr(jit(sleeve, 0.3, 32), 1.0);
    C.cut([[-6, -118], [6, -108]], 1.1, false);
    head(C, -15, -144, 9.6, 1, 'jx');
  }
}

function driver(C, pose) {
  const hip = [20, -86];
  const th = pose === 'pull' ? -0.36 : pose === 'stare' ? 0.22 : 0;
  const R = (p) => (th ? rotAbout(p, hip, th) : p);
  C.cr(jit([[10, -84], [11, -104], [16, -117], [26, -119], [32, -108], [34, -94], [32, -84]].map(R), 0.35, 41), 1);
  const hc = R([24, -127]);
  head(C, hc[0], hc[1] - (pose === 'stare' ? 2 : 0), 7.8, 1, 'ze');
  const hand = pose === 'pull' ? R([32, -126]) : R([44, -108]);
  C.limb(limbPoly([R([26, -114]), pose === 'pull' ? R([37, -112]) : R([36, -104]), hand], [[0, 7], [1, 4.6]], 4), 0.9);
  if (pose !== 'pull') C.limb(limbPoly([R([22, -112]), R([30, -100]), R([42, -103])], [[0, 6], [1, 4.2]], 4), 0.8);
  return hand;
}

function boxPanel(C) {
  C.pl(jit([[-35, -48], [-36, -85], [22, -87], [30, -97], [38, -99], [41, -89], [40, -48]], 0.4, 51), 1.1);
  C.cut([[-31, -53], [-31, -81], [24, -82]], 1.2, false);
  for (let k = 0; k < 5; k++) C.cut([[-23 + k * 12, -54], [-23 + k * 12, -78]], 1.0, false);
}

/** 轺车 (parasol chariot), 斧车 (axe chariot) or 軿车 (covered carriage); the near wheel is a separate sprite. */
function drawChariot(C, st) {
  const kind = st.kind || 'parasol';
  if (kind === 'parasol') canopy(C);
  if (kind === 'axe') {
    C.inc([[-16, -84], [-16, -222]], 3.6, 0.9, false);
    C.cr(jit([[-16, -222], [8, -236], [30, -222], [32, -194], [18, -180], [-16, -194]], 0.4, 61), 1.1);
    C.cut([[4, -226], [24, -212], [22, -190]], 1.3);
    C.limb(limbPoly([[-16, -216], [-40, -222], [-58, -210]], [[0, 6], [1, 2.2]], 4), 0.7);   // pennon
  }
  if (kind === 'carriage') {
    // cabin wall with a lattice window, under an arched roof whose awning sweeps down behind
    C.pl(jit([[-60, -48], [-62, -112], [30, -116], [32, -48]], 0.4, 71), 1.1);
    C.blk([[-44, -70], [-6, -72], [-6, -104], [-44, -102]]);
    for (let k = 1; k < 4; k++) C.inc([[-44 + k * 9.5, -71], [-44 + k * 9.5, -103]], 1.6, 0, false, 'butt');
    C.inc([[-44, -87], [-6, -88]], 1.6, 0, false, 'butt');
    C.cr(jit([[-84, -78], [-74, -112], [-46, -138], [-6, -150], [28, -142], [42, -124], [36, -116], [22, -128], [-6, -136], [-42, -126], [-66, -106], [-74, -80]], 0.4, 72), 1.1);
    C.cut([[-74, -96], [-50, -124], [-6, -140], [30, -132]], 1.3);
    C.inc([[30, -118], [30, -84]], 3, 0.8, false);
  }
  if (kind === 'parasol') passenger(C, st.pass);
  if (kind === 'axe') {
    C.cr(jit([[-28, -84], [-27, -116], [-21, -130], [-9, -131], [-4, -118], [-3, -84]], 0.4, 33), 1);
    head(C, -15, -140, 8.6, 1, 'wu');
    C.limb(limbPoly([[-9, -122], [-13, -110], [-16, -168]], [[0, 7], [1, 4.5]], 3), 0.8);
  }
  const hand = driver(C, st.drv);
  boxPanel(C);
  const H = drawHorse(C, CH.hx, st.legs, { harness: true, knot: true });
  // shaft from the box over the horse to the yoke, yoke saddle, reins
  C.inc([[36, -54], [70, -62], [100, -88], [H.withers[0] - 4, H.withers[1] - 1]], 4.6, 1.0);
  C.cr([[H.withers[0] - 10, H.withers[1] + 2], [H.withers[0] - 7, H.withers[1] - 8], [H.withers[0] + 7, H.withers[1] - 9], [H.withers[0] + 11, H.withers[1] + 1]], 0.8);
  const mid = [(hand[0] + H.mouth[0]) / 2, (hand[1] + H.mouth[1]) / 2 + 7];
  C.inc([hand, mid, H.mouth], 1.6, 0.6);
}

function chariotWheel(C, r = CH.r, n = 12) {
  C.ring(0, 0, r - 6, r + 1.4, 1.1);
  C.circ(0, 0, r - 2.4, 1.1);
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; C.inc([[Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * (r - 5.4), Math.sin(a) * (r - 5.4)]], 2.1, 0.5, false, 'butt'); }
  C.disc(0, 0, 8, 0.9); C.circ(0, 0, 4.6, 1.1); C.dot(0, 0, 1.7);
}

/** 骑吏 outrider: horse + rider with a halberd, a banner or a bow. */
function drawRider(C, st) {
  const H = drawHorse(C, 0, st.legs, { saddle: true });
  if (st.prop === 'halberd') {
    C.inc([[-40, -80], [-16, -170], [12, -276]], 3.2, 0.9, false);
    C.pl(jit([[10, -276], [17, -302], [19, -275]], 0.2, 81), 0.7);
    C.cr(jit([[7, -262], [-9, -269], [-18, -256], [-9, -253]], 0.2, 82), 0.7);
    C.limb(limbPoly([[13, -268], [30, -258], [37, -242]], [[0, 4.4], [1, 1.6]], 4), 0.6);
  } else if (st.prop === 'banner') {
    C.inc([[-10, -122], [-10, -292]], 3.0, 0.9, false);
    C.pl([[-14, -292], [-10, -306], [-6, -292]], 0.6);
    const f = st.legs === 'B' ? 1 : st.legs === 'F' ? 0.4 : 0;
    const top = [[-10, -286], [-30, -283 + 3 * f], [-52, -279 - 2 * f], [-72, -274 + 3 * f]];
    const bot = [[-72, -258 + 3 * f], [-52, -262 - 2 * f], [-30, -266 + 3 * f], [-10, -266]];
    for (const [ty, dy] of [[-271, -8], [-265, 2], [-259, 12]]) C.limb(limbPoly([[-70, ty + 3 * f], [-86, ty + dy * 0.5 - 2 * f], [-104, ty + dy + 3 * f]], [[0, 6], [1, 1.6]], 4), 0.7);
    C.cr(jit(top.concat(bot), 0.3, 85), 0.9);
    for (let k = 1; k < 4; k++) { const xx = -10 - k * 15; C.cut([[xx, -282 + (k === 2 ? -2 : 1) * f * 2], [xx, -266 + f]], 1.2, false); }
  } else {
    C.cr(jit([[-34, -140], [-25, -153], [-16, -147], [-23, -118], [-32, -116]], 0.3, 83), 0.9);   // bow case
  }
  C.limb(limbPoly([[-6, -116], [15, -100], [10, -74]], [[0, 12], [0.55, 8], [1, 6]], 4), 1.0);
  C.pl([[7, -76], [17, -72], [18, -67], [6, -68]], 0.7);
  C.cr(jit([[-15, -111], [-17, -133], [-12, -159], [2, -164], [10, -150], [12, -126], [9, -111]], 0.4, 84), 1);
  C.cut([[-16, -123], [11, -125]], 1.3, false);
  head(C, -1, -173, 8.4, 1, st.prop === 'bow' ? 'ze' : 'wu');
  C.limb(limbPoly([[3, -154], [15, -139], [29, -136]], [[0, 7.5], [1, 5]], 4), 0.9);
  if (st.prop === 'halberd') C.limb(limbPoly([[-6, -152], [-17, -137], [-22, -125]], [[0, 6.5], [1, 4.5]], 3), 0.8);
  C.inc([[29, -136], [66, -132], H.mouth], 1.5, 0.6);
}

/** 伍伯 foot attendant with a staff or a shield; look = ±1. Drawn 1.12× (taller than the old stick men). */
function drawWalker(C, st) {
  C.x.save(); C.x.scale(1.12, 1.12);
  const look = st.look;
  const P = st.legs === 'A' ? { n: [[11, -34], [17, -5]], f: [[-7, -33], [-17, -8]] } : st.legs === 'B' ? { n: [[-6, -33], [-15, -8]], f: [[10, -34], [15, -5]] } : { n: [[4, -33], [6, -4]], f: [[-3, -33], [-5, -4]] };
  const hip = [0, -62];
  const legL = (J) => limbPoly([hip, ...J], [[0, 11], [0.5, 7], [1, 5.2]], 4);
  const foot = (J) => { const a = J[1]; C.pl([[a[0] - 3, a[1] - 3], [a[0] + 9, a[1] + 1], [a[0] + 9, a[1] + 5], [a[0] - 4, a[1] + 5]], 0.8); };
  if (st.prop === 'staff') C.inc([[-24, -40], [4, -104], [32, -168]], 3.2, 0.9, false);
  C.limb(legL(P.f), 0.9); foot(P.f);
  C.limb(legL(P.n), 1.0); foot(P.n);
  C.cr(jit([[-9, -114], [-12, -92], [-16, -66], [-21, -48], [-4, -45], [15, -47], [12, -66], [10, -92], [8, -114]], 0.4, 91), 1.1);
  C.cut([[-18, -52], [-4, -49], [13, -51]], 1.3);
  C.cut([[-11, -86], [10, -88]], 1.6, false);
  C.cut([[-2, -112], [2, -96], [6, -88]], 1.1);
  head(C, 0, -122, 7.4, look, 'wu');
  if (st.prop === 'shield') {
    C.limb(limbPoly([[1, -106], [9, -96], [14, -98]], [[0, 6], [1, 4]], 3), 0.8);
    C.cr(jit([[10, -112], [24, -116], [27, -78], [14, -70], [8, -84]], 0.3, 92), 1);
    C.cut([[14, -106], [22, -108], [21, -82], [14, -78]], 1.1, false);
  } else if (look < 0) {
    C.limb(limbPoly([[1, -106], [-10, -112], [-22, -124]], [[0, 6], [1, 4]], 3), 0.8);   // turns round and points back
    C.inc([[-22, -124], [-28, -129]], 2.0, 0.5, false);
  } else {
    C.limb(limbPoly([[1, -106], [8, -92], [11, -98]], [[0, 6], [1, 4]], 3), 0.8);
  }
  C.x.restore();
}

// ------------------------------------------------------------------ upper register figures
function drawPhoenix(C, st) {
  const plumes = [
    [[-20, -2], [-46, -10], [-74, -8], [-96, -20], [-100, -36], [-90, -44], [-80, -38], [-82, -29]],
    [[-20, 3], [-50, 6], [-82, 10], [-108, 2], [-116, -12], [-108, -22], [-98, -16], [-100, -8]],
    [[-18, 7], [-42, 20], [-66, 30], [-88, 30], [-98, 20], [-94, 8], [-84, 10], [-86, 18]],
  ];
  const sway = st === 'B' ? 3 : 0;
  plumes.forEach((P, k) => {
    const Q = P.map(([a, b], i) => [a, b + (i > 2 ? sway * (k - 1) : 0)]);
    C.limb(limbPoly(Q, [[0, 7], [0.5, 5.5], [0.8, 3.6], [1, 2]], 5), 0.9);
    C.dot(Q[3][0], Q[3][1], 3.2); C.dot(Q[3][0], Q[3][1], 1.2, true);
  });
  const wingFan = (a0, a1, base, L0, sep) => {
    for (let k = 0; k < 6; k++) {
      const t = k / 5, a = lerp(a0, a1, t), L = L0 * (0.78 + 0.3 * Math.sin(t * Math.PI));
      const tip = [base[0] + Math.cos(a) * L, base[1] + Math.sin(a) * L];
      const mid = [base[0] + Math.cos(a + 0.12) * L * 0.55, base[1] + Math.sin(a + 0.12) * L * 0.55];
      C.limb(limbPoly([base, mid, tip], [[0, 10], [0.6, 7], [1, 2.4]], 4), sep);
    }
  };
  const far = st === 'A' ? [-1.95, -1.45] : [2.2, 2.75];
  wingFan(far[0], far[1], [10, -6], 44, 0.8);
  C.cr(jit(ell(0, 0, 27, 12, -0.12, 12), 0.4, 101), 1);
  C.limb(limbPoly([[16, -6], [28, -20], [32, -34], [40, -42]], [[0, 13], [0.6, 8], [1, 6.5]], 5), 0);
  C.disc(42, -44, 7, 0);
  C.pl([[47, -48], [61, -43], [48, -40]], 0.7);
  [[[40, -50], [34, -62], [24, -67]], [[42, -50], [41, -64], [33, -73]], [[38, -48], [28, -55], [18, -55]]].forEach((P) => C.limb(limbPoly(P, [[0, 3.2], [1, 1.3]], 4), 0.6));
  C.dot(45, -46, 1.7);
  const near = st === 'A' ? [-2.35, -1.75] : [2.45, 3.0];
  wingFan(near[0], near[1], [2, -4], 54, 1.0);
  C.cr(jit(ell(-2, -2, 14, 8, -0.4, 10), 0.3, 102), 0.9);
  C.cut([[-12, 2], [-2, -6], [10, -10]], 1.2);
  C.limb(limbPoly([[-6, 8], [-14, 18], [-23, 18]], [[0, 4], [1, 2.5]], 3), 0.6);
  for (let k = 0; k < 3; k++) C.cut([[-14 + k * 8, 6], [-10 + k * 8, -2]], 1.0, false);
}

function drawKneeler(C) {   // an official kneeling before the title cartouche, raising a 笏 tablet (facing left)
  // robe: kneeling, the hem spread on the ground behind
  C.cr(jit([[-14, -2], [-18, -26], [-14, -52], [-10, -74], [-4, -86], [8, -88], [14, -74], [16, -48], [26, -24], [40, -8], [42, 0]], 0.4, 121), 1.1);
  C.cut([[-13, -40], [14, -38]], 1.6, false);
  C.cut([[-15, -16], [32, -12]], 1.2);
  C.cut([[-6, -84], [-1, -72], [4, -84]], 1.1);
  // wide sleeves raised in front holding the tablet
  C.cr(jit([[-6, -80], [-22, -82], [-34, -76], [-36, -64], [-24, -60], [-10, -66]], 0.3, 122), 1.0);
  C.cut([[-26, -78], [-28, -64]], 1.1, false);
  C.limb(limbPoly([[-34, -74], [-40, -96]], [[0, 5], [1, 4]], 2), 0.8);
  head(C, 0, -97, 8.4, -1, 'jx');
}

/** 羽人 feathered immortal leaping across the clouds (local origin at the feet), offering a sprig of 灵芝. */
function drawRunner(C, st) {
  const A = st === 'A';
  [[[6, -84], [-12, -100], [-34, -110], [-46, -108]], [[4, -80], [-16, -90], [-38, -94], [-50, -90]]].forEach((P) => C.limb(limbPoly(P, [[0, 10], [0.7, 6], [1, 1.8]], 5), 0.8));
  C.limb(limbPoly([[10, -82], [0, -72], [-10, -66]], [[0, 6], [1, 3.6]], 4), 0.8);
  const far = A ? [[-14, -34], [-36, -30]] : [[-6, -28], [-20, -10]];
  const near = A ? [[16, -36], [24, -8]] : [[12, -34], [4, -6]];
  C.limb(limbPoly([[-2, -48], ...far], [[0, 9], [0.6, 5.5], [1, 3]], 4), 0.9);
  C.pl([[far[1][0] + 2, far[1][1] - 3], [far[1][0] - 9, far[1][1] - 1], [far[1][0] + 1, far[1][1] + 3]], 0.6);
  C.limb(limbPoly([[0, -48], ...near], [[0, 10], [0.6, 6], [1, 3.2]], 4), 1);
  C.pl([[near[1][0] - 2, near[1][1] - 3], [near[1][0] + 10, near[1][1] + 1], [near[1][0] - 2, near[1][1] + 3]], 0.6);
  C.cr(jit([[-10, -42], [-7, -60], [3, -80], [13, -91], [22, -86], [19, -66], [12, -44]], 0.3, 111), 1);
  const sk = []; for (let k = 0; k <= 6; k++) sk.push([-13 + k * 4.5, k % 2 ? -36 : -46]);
  C.pl([[-14, -48], ...sk, [14, -48]], 0.8);
  for (let k = 0; k < 3; k++) C.cut([[-2 + k * 5, -58 - k * 6], [5 + k * 5, -64 - k * 6]], 1.0, false);
  C.limb(limbPoly([[22, -100], [10, -106], [-2, -104], [-10, -98]], [[0, 5], [1, 1.4]], 4), 0.7);
  C.disc(25, -97, 6.6, 0.9);
  C.pl([[29, -101], [36, -97], [30, -94]], 0);
  C.pl([[21, -102], [18, -114], [25, -103]], 0.6);
  C.dot(28, -99, 1.3);
  C.limb(limbPoly([[15, -86], [30, -80], [44, -88]], [[0, 6.5], [1, 4]], 4), 0.8);
  C.inc([[44, -88], [49, -102]], 2.0, 0.6, false);
  C.cr(jit([[41, -103], [48, -113], [59, -108], [55, -99]], 0.2, 112), 0.7);
  C.cut([[45, -105], [55, -105]], 1.0, false);
}

function drawSunCrow(C, cx, cy) {
  C.disc(cx, cy, 36, 1.2);
  C.circ(cx, cy, 31, 1.4);
  const P = (pts) => pts.map(([a, b]) => [cx + a, cy + b]);
  C.blk(P([[-16, 2], [-6, -6], [8, -5], [15, -11], [21, -10], [25, -7], [19, -5], [13, 2], [4, 7], [-8, 8]]));
  C.blk(P([[24, -9], [30, -7], [24, -6]]));
  C.blk(P([[-4, -4], [-20, -24], [-10, -22], [-6, -28], [-1, -19], [3, -26], [6, -8]]));
  C.blk(P([[-15, 2], [-26, -3], [-27, 4], [-24, 9]]));
  for (const dx of [-3, 2, 7]) C.cut(P([[dx, 7], [dx - 2, 17], [dx + 1, 19]]), 1.7);
  C.dot(cx + 18, cy - 9, 1.1, true);
}

// cloud scrolls (云气纹): a stem ending in a spiral curl, drawn as a swelling, tapering ribbon
function curlPath(P, curlR, side, turn = Math.PI * 1.55) {
  const E = P[P.length - 1], Q = P[P.length - 2];
  let dx = E[0] - Q[0], dy = E[1] - Q[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const cx = E[0] + side * -dy * curlR, cy = E[1] + side * dx * curlR;
  const a0 = Math.atan2(E[1] - cy, E[0] - cx);
  const out = P.slice();
  for (let k = 1; k <= 12; k++) { const t = (k / 12) * turn; const R = curlR * (1 - 0.62 * (t / turn)); out.push([cx + Math.cos(a0 + side * t) * R, cy + Math.sin(a0 + side * t) * R]); }
  return out;
}
function scrollPts(x0, y0, len, dir, amp, curlR, side, ph = 0) {
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([x0 + dir * len * t, y0 + amp * Math.sin(t * Math.PI * 1.15 + ph)]); }
  return curlPath(pts, curlR, side);
}
const W_SCROLL = [[0, 2], [0.12, 7], [0.55, 5.6], [0.85, 3.4], [1, 1.4]];
function cloud(C, s) {
  // an S-shaped double curl (卷云): a short swelling stem curling at both ends
  const half = scrollPts(s[0], s[1], s[2] * 0.5, s[3], s[4] * 0.5, s[5], s[6], s[7] || 0);
  const other = scrollPts(s[0], s[1], s[2] * 0.45, -s[3], -s[4] * 0.4, s[5] * 0.8, s[6], (s[7] || 0) + 1);
  const P = other.slice().reverse().concat(half.slice(1));
  C.limb(limbPoly(P, [[0, 1.4], [0.18, 3.6], [0.5, 7], [0.82, 3.6], [1, 1.4]], 3), 0.8);
  return;
  C.limb(limbPoly(P, W_SCROLL, 3), 0.8);
  if (s[2] > 60) {
    const b = P[3];
    const T = scrollPts(b[0], b[1], s[2] * 0.34, s[3], -s[4] * 0.4, s[5] * 0.6, -s[6], 0.6);
    C.limb(limbPoly(T, [[0, 4.5], [0.5, 3.8], [1, 1.3]], 3), 0.7);
  }
}
const bandY = (xx) => 326 + 8 * Math.sin((xx - 200) / 46) + 4 * Math.sin((xx - 200) / 17);
const bbOf = (P) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x0, y0, x1, y1]; };
const hits = (b, boxes) => boxes.some((q) => !(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]));

// ------------------------------------------------------------------ static stone layout
const UPPER_FIGS = [   // animated sprites in the upper register: anchor (x, y), kind, scale, phase
  { id: 'ph1', kind: 'phoenix', x: 395, y: 214, s: 1.28, phase: 0 },
  { id: 'run', kind: 'runner', x: 562, y: 322, s: 1.15, phase: 1 },
  { id: 'ph2', kind: 'phoenix', x: 792, y: 206, s: 1.28, phase: 1 },
];
const RESERVED = [[20, 74, 130, 352], [118, 200, 232, 352], [228, 100, 490, 256], [500, 176, 640, 326], [636, 92, 886, 250], [888, 160, 974, 248]];
const SPALLS = [
  { x: 990, y: 34, r: 40, k: 1 }, { x: 14, y: 930, r: 36, k: 2 }, { x: 612, y: 902, r: 13, k: 3 },
  { x: 236, y: 373, r: 11, k: 4 }, { x: 842, y: 84, r: 14, k: 5 }, { x: 404, y: 868, r: 9, k: 6 },
];
const TITLE = { x0: 24, y0: 84, w: 100, h: 262 };

/** The cloud frieze: one long undulating band along the register floor, sprouting scrolls, plus free scrolls. */
function cloudFrieze() {
  const paths = [];   // { P, W, sep }
  const band = [];
  for (let xx = 1014; xx >= 242; xx -= 10) band.push([xx, bandY(xx)]);
  paths.push({ P: curlPath(band, 12, 1), W: [[0, 8], [0.5, 9.5], [0.9, 7], [1, 2.4]], sep: 0.9 });
  const boxes = RESERVED.map((b) => b.slice());
  const hard = [RESERVED[0], RESERVED[1], RESERVED[5]];   // sprouts may pass behind the animated figures
  const R = rng(`${ID}-sprouts`);
  for (let k = 0; ; k++) {
    const xx = 262 + k * 37 + (R() - 0.5) * 8;
    if (xx > 1000) break;
    const yb = bandY(xx);
    const up = k % 2 === 0;
    let P;
    if (up) {
      const len = (k % 4 === 0 ? 70 : 36) + R() * 34;
      const back = R() < 0.3 ? -1 : 1;
      P = curlPath(smoothPath([[xx, yb], [xx + back * len * 0.22, yb - len * 0.45], [xx + back * len * 0.55, yb - len * 0.76], [xx + back * len * 0.85, yb - len * 0.86]], 3), 7 + R() * 6, back);
    } else {
      P = curlPath(smoothPath([[xx, yb], [xx + 9, yb + 7], [xx + 19, yb + 10]], 3), 4.5 + R() * 2, 1);
    }
    const b = bbOf(P);
    if (b[3] > 350 || b[1] < 78 || (up && hits([b[0], b[1], b[2], yb - 12], hard))) continue;
    paths.push({ P, W: [[0, 7.5], [0.5, 6], [0.85, 3.6], [1, 1.5]], sep: 0.7 });
  }
  for (const p of paths) { const b = bbOf(p.P); boxes.push([b[0] - 6, b[1] - 6, b[2] + 6, b[3] + 6]); }
  const free = [];
  for (let tries = 0; tries < 1200 && free.length < 7; tries++) {
    const len = 70 + R() * 60, dir = R() < 0.6 ? 1 : -1, amp = (R() - 0.5) * 16, cr = 7 + R() * 6, side = R() < 0.5 ? 1 : -1;
    const x0 = 130 + R() * 890, y0 = 86 + R() * 230;
    const s = [x0, y0, len, dir, amp, cr, side, R() * 2];
    const b = bbOf(scrollPts(...s));
    if (b[1] < 76 || b[3] > 344 || b[2] > 1010 || b[0] < 132) continue;
    if (hits([b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5], boxes)) continue;
    free.push(s); boxes.push([b[0] - 6, b[1] - 6, b[2] + 6, b[3] + 6]);
  }
  return { paths, free };
}

function drawBands(C) {
  const x = C.x;
  // top border: line, sawtooth, line, hanging swags (垂幛纹)
  C.rect(-6, 23, 1012, 3.2);
  for (let k = -1; k < 50; k++) { const cx = k * 21 + 11; C.pl(jit([[cx - 8.6, 29.5], [cx + 8.6, 29.5], [cx, 45.5]], 0.35, 201), 0); }
  C.rect(-6, 48.5, 1012, 2.6);
  for (let k = -1; k < 23; k++) {
    const x0 = k * 46 + 8;
    C.limb(limbPoly([[x0, 54], [x0 + 12, 62], [x0 + 23, 65], [x0 + 34, 62], [x0 + 46, 54]], 3.0, 4), 0.6);
    C.cr(jit([[x0 - 2.6, 54], [x0 + 2.6, 54], [x0 + 1.4, 63], [x0, 66], [x0 - 1.4, 63]], 0.2, 202), 0.5);
  }
  // middle band: 穿璧纹 (discs threaded by crossing ribbons)
  C.rect(-6, 356, 1012, 3);
  C.rect(-6, 391, 1012, 3);
  for (let k = -1; k < 18; k++) {
    const xa = 31 + k * 62, xb = xa + 62;
    C.inc([[xa + 9, 364], [xb - 9, 386]], 2.6, 0.6, false);
    C.inc([[xa + 9, 386], [xb - 9, 364]], 2.6, 0.8, false);
  }
  for (let k = -1; k < 18; k++) { const xa = 31 + k * 62; C.ring(xa, 375, 7.2, 11.2, 0.9); C.dot(xa, 375, 2.2, true); }
  // ground line (the road) and the lower bands: sawtooth, diamond lattice (菱形纹)
  C.rect(-6, 800, 1012, 4);
  for (let k = -1; k < 50; k++) { const cx = k * 21 + 11; C.pl(jit([[cx - 8.6, 826], [cx + 8.6, 826], [cx, 809.5]], 0.35, 203), 0); }
  C.rect(-6, 829, 1012, 2.6);
  for (let k = -2; k < 19; k++) {
    C.inc([[k * 60, 835], [k * 60 + 60, 913]], 3.0, 0, false, 'butt');
  }
  for (let k = -2; k < 19; k++) C.inc([[k * 60 + 60, 835], [k * 60, 913]], 3.0, 0.8, false, 'butt');
  for (let k = -1; k < 18; k++) {
    const cx = k * 60 + 30;
    C.pl(jit([[cx, 862], [cx + 9, 874], [cx, 886], [cx - 9, 874]], 0.3, 204), 0);
    C.dot(cx, 874, 2.4);
    for (const cy of [835, 913]) C.pl([[cx - 30, cy], [cx - 24, cy + (cy < 874 ? 8 : -8)], [cx - 36, cy + (cy < 874 ? 8 : -8)]], 0);
  }
  x.save();
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#000'; x.fillRect(-10, 913.5, 1020, 2.4); x.fillRect(-10, 832, 1020, 3);
  x.restore();
  C.rect(-6, 916, 1012, 2.6);
}

function drawUpperStatic(C, K) {
  const fr = cloudFrieze();
  for (const p of fr.paths) C.limb(limbPoly(p.P, p.W, 3), p.sep);
  for (const sc of fr.free) cloud(C, sc);
  const x = C.x;
  x.save(); x.translate(176, 350); x.scale(1.25, 1.25); drawKneeler(C); x.restore();
  drawSunCrow(C, 930, 204);
  // title cartouche (榜题): raised smooth panel, incised frame and clerical-script characters
  const T = TITLE;
  x.save();
  x.lineWidth = 2.4; x.strokeStyle = '#fff';
  x.strokeRect(T.x0 + 2, T.y0 + 2, T.w - 4, T.h - 4);
  x.lineWidth = 1.2; x.strokeRect(T.x0 + 6, T.y0 + 6, T.w - 12, T.h - 12);
  x.restore();
  const colR = T.x0 + T.w * 0.7, colL = T.x0 + T.w * 0.3;
  [...'汉画像石拓片'].forEach((ch, k) => glyph(x, K, ch, colR, T.y0 + 29 + k * 40.5, 37, '"Libian SC", "Kaiti SC", serif', 400, 7));
  [...'约公元一百年'].forEach((ch, k) => glyph(x, K, ch, colL, T.y0 + 31 + k * 40.5, 31, '"Libian SC", "Kaiti SC", serif', 400, 6));
}

function drawSpalls(C) {
  for (const sp of SPALLS) {
    const P = [];
    for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; const m = 0.7 + 0.55 * fbm(Math.cos(a) * 1.4 + sp.k * 3, Math.sin(a) * 1.4, 300 + sp.k, 3); P.push([sp.x + Math.cos(a) * sp.r * m, sp.y + Math.sin(a) * sp.r * m * 0.8]); }
    C.grey(jit(P, 1.2, 310 + sp.k), 0.72);
  }
}

// ------------------------------------------------------------------ the stone (bake)
function topEdge(xu) { return 17 + 2.6 * (fbm(xu / 37, 0.5, 91, 3) - 0.5) * 2 + 0.9 * (vnoise(xu / 3.5, 1.5, 92) - 0.5); }
function botEdge(xu) { return 946 + 3.2 * (fbm(xu / 41, 2.5, 93, 3) - 0.5) * 2 + 0.9 * (vnoise(xu / 3.5, 4.5, 94) - 0.5); }

/** Tileable cellular "pad dab" texture (512²): overlapping soft stamps of the ink pad. */
function dabTile() {
  const T = 512, D = new Float32Array(T * T);
  const R = rng(`${ID}-dabs`);
  for (let k = 0; k < 9000; k++) {
    const cx = R() * T, cy = R() * T, r = 2.5 + R() * 6.5, s = (R() - 0.45) * 2;
    const r2 = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const q = (dx * dx + dy * dy) / r2;
      if (q >= 1) continue;
      const i = ((Math.floor(cx) + dx) % T + T) % T, j = ((Math.floor(cy) + dy) % T + T) % T;
      D[j * T + i] += s * (1 - q) * (1 - q);
    }
  }
  let mn = 1e9, mx = -1e9;
  for (let k = 0; k < T * T; k++) { mn = Math.min(mn, D[k]); mx = Math.max(mx, D[k]); }
  for (let k = 0; k < T * T; k++) D[k] = (D[k] - mn) / (mx - mn);
  return D;
}

function buildStone(K) {
  const NN = N * N;
  const cv = mkCanvas(N, N), x = ctx2d(cv);
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  x.setTransform(S, 0, 0, S, 0, 0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const C = carver(x);
  drawBands(C);
  drawUpperStatic(C, K);
  drawSpalls(C);
  const L = lumOf(x.getImageData(0, 0, N, N).data, NN);
  const B1 = blur(L, N, N, 1, 1), B2 = blur(L, N, N, 2, 1), F = blur(L, N, N, 3, 2);
  const big = coarse(N, N, 10, (px, py) => fbm(px / (S * 260), py / (S * 230), 11, 3));
  const mid = coarse(N, N, 4, (px, py) => fbm(px / (S * 45), py / (S * 45), 12, 3));
  const striZ = coarse(N, N, 8, (px, py) => fbm(px / (S * 140), py / (S * 160), 13, 3));
  const dab = dabTile();
  const T = tile();
  const out = new Uint8ClampedArray(NN * 4);
  for (let j = 0; j < N; j++) {
    const yu = (j + 0.5) / S;
    for (let i = 0; i < N; i++) {
      const xu = (i + 0.5) / S;
      const k = j * N + i, o = k * 4;
      // ink on the raised surface: pad stamps, greyer zones, paper grain, chisel striations
      const d = dab[(j & 511) * 512 + (i & 511)];
      let A = 0.955 + 0.075 * (d - 0.5) - 0.1 * sm(0.5, 0.8, big[k]) + 0.03 * (mid[k] - 0.5) + 0.03 * (hash3(i, j, 7) - 0.5);
      const st = (xu * 0.94 + yu * 0.34) / 3.1 + 0.7 * vnoise(xu / 23, yu / 23, 8);
      const sf = st - Math.floor(st);
      A -= 0.045 * sm(0.55, 0.75, striZ[k]) * sm(0.78, 0.95, sf) * (1 - sm(0.95, 1, sf));
      A += 0.05 * sm(0.01, 0.3, F[k]);   // the pad leaves more ink right beside a cut
      // carved (sunk) areas: paper white with a grey fringe; damaged areas mottled
      const n = T[(j & 255) * 256 + (i & 255)];
      const wv = sm(0.38, 0.62, B1[k] + (n - 0.5) * 0.52);
      let g = 0.04 + (n - 0.5) * 0.07 + 0.3 * (1 - B2[k]);
      if (L[k] > 0.3 && L[k] < 0.95) g += 0.18 + 0.5 * sm(0.45, 0.8, fbm(xu / 6, yu / 6, 14, 2)) + 0.12 * (d - 0.5);
      let cov = Math.max(0, Math.min(1, A)) * (1 - wv) + clamp01(g) * wv;
      // the stone's edges: ink fades where the pad met the paper over the edge; the margin is bare paper
      const yt = topEdge(xu), yb = botEdge(xu);
      let base = PAPER;
      if (yu < yt + 7 || yu > yb - 7) {
        const din = Math.min(yu - yt, yb - yu);    // > 0 inside the stone
        const ragged = 1.6 * (fbm(xu / 5, yu / 5, 15, 2) - 0.5);
        const inside = sm(-0.8, 0.8, din + ragged);
        const fade = 0.8 + 0.2 * sm(0, 6, din + ragged * 2);
        const smudge = 0.18 * (1 - sm(0, 5, -din)) * sm(0.5, 0.75, fbm(xu / 9, yu / 4, 16, 2));
        cov = cov * fade * inside + smudge * (1 - inside);
        base = inside > 0.5 ? PAPER : MARGIN;
        if (inside < 1) {
          const mg = 1 + 0.03 * (hash3(i, j, 17) - 0.5) + 0.04 * (fbm(xu / 60, yu / 30, 18, 2) - 0.5);
          const pr = lerp(MARGIN[0] * mg, PAPER[0], inside), pg = lerp(MARGIN[1] * mg, PAPER[1], inside), pb = lerp(MARGIN[2] * mg, PAPER[2], inside);
          out[o] = pr + (INK[0] - pr) * cov; out[o + 1] = pg + (INK[1] - pg) * cov; out[o + 2] = pb + (INK[2] - pb) * cov; out[o + 3] = 255;
          continue;
        }
      }
      out[o] = base[0] + (INK[0] - base[0]) * cov;
      out[o + 1] = base[1] + (INK[1] - base[1]) * cov;
      out[o + 2] = base[2] + (INK[2] - base[2]) * cov;
      out[o + 3] = 255;
    }
  }
  const res = mkCanvas(N, N), rx = ctx2d(res);
  rx.putImageData(new ImageData(out, N, N), 0, 0);
  // the archive note (pencil) and the collector's seal on the bottom margin
  rx.setTransform(S, 0, 0, S, 0, 0);
  const note = K.textSprite({ text: 'Han pictorial stone rubbing · c. 100 CE', font: 'Baskerville, "Hoefler Text", Georgia, serif', style: 'italic', size: 64, color: '#4d463e' });
  const ns = 21 / 64;
  rx.globalAlpha = 0.88;
  rx.drawImage(note.g.canvas || note.g.elt, 40 - note.pad * ns, 954 - note.pad * ns, note.w * ns, note.h * ns);
  const no = K.textSprite({ text: 'No. 03', font: 'Baskerville, "Hoefler Text", Georgia, serif', style: 'italic', size: 64, color: '#4d463e' });
  rx.drawImage(no.g.canvas || no.g.elt, 760 - no.pad * ns, 954 - no.pad * ns, no.w * ns, no.h * ns);
  rx.globalAlpha = 1;
  const seal = ink.seal(K, '鹈鹕审定', { size: 220, mode: 'white', seed: 31 });
  rx.globalCompositeOperation = 'multiply';
  rx.globalAlpha = 0.92;
  rx.drawImage(seal.canvas || seal.elt, 908, 950, 31, 31);
  rx.globalAlpha = 1;
  rx.globalCompositeOperation = 'source-over';
  return res;
}

// ------------------------------------------------------------------ sheet overlays
function buildOverlays() {
  const R = rng(`${ID}-sheet`);
  // MULTIPLY (white = no effect): grit specks, haze where the pad touched sunk paper, crease shadows, stains
  const m = mkCanvas(N, N), mx = ctx2d(m);
  mx.fillStyle = '#fff'; mx.fillRect(0, 0, N, N);
  for (let k = 0; k < 230; k++) {
    const cx = R() * N, cy = R() * N, rad = (5 + R() * 24) * S;
    const g = mx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(60,55,50,${0.06 + R() * 0.1})`); g.addColorStop(1, 'rgba(60,55,50,0)');
    mx.fillStyle = g; mx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  for (let k = 0; k < 14000; k++) {
    const cx = R() * N, cy = R() * N;
    const big = R() < 0.06;
    const rad = big ? 0.9 + R() * 1.2 : 0.35 + R() * 0.6;
    const a = big ? 0.35 + R() * 0.4 : 0.25 + R() * 0.5;
    mx.fillStyle = `rgba(25,22,20,${a})`;
    mx.beginPath(); mx.arc(cx, cy, rad, 0, TAU); mx.fill();
  }
  for (let k = 0; k < 7; k++) {
    const cx = R() * N, cy = (R() < 0.6 ? 950 + R() * 45 : R() * 1000) * S, rad = (5 + R() * 16) * S;
    const g = mx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    g.addColorStop(0, 'rgba(150,110,60,0.10)'); g.addColorStop(0.8, 'rgba(150,110,60,0.05)'); g.addColorStop(1, 'rgba(150,110,60,0)');
    mx.fillStyle = g; mx.beginPath(); mx.arc(cx, cy, rad, 0, TAU); mx.fill();
  }
  // SCREEN (black = no effect): pinholes, paper fibres, cracks, crease ridges
  const s = mkCanvas(N, N), sx = ctx2d(s);
  sx.fillStyle = '#000'; sx.fillRect(0, 0, N, N);
  for (let k = 0; k < 7000; k++) {
    const cx = R() * N, cy = R() * N;
    if (fbm(cx / 70, cy / 70, 19, 3) < 0.56 || R() < 0.45) continue;
    const rad = R() < 0.08 ? 0.8 + R() * 0.9 : 0.3 + R() * 0.45;
    const v = 45 + R() * 85;
    sx.fillStyle = `rgb(${v | 0},${(v * 0.97) | 0},${(v * 0.93) | 0})`;
    sx.beginPath(); sx.arc(cx, cy, rad, 0, TAU); sx.fill();
  }
  sx.lineCap = 'round';
  for (let k = 0; k < 520; k++) {
    const cx = R() * N, cy = R() * N, L = (6 + R() * 22) * S, a = R() * TAU;
    sx.strokeStyle = `rgba(255,250,240,${0.04 + R() * 0.06})`; sx.lineWidth = 0.6 + R() * 0.6;
    sx.beginPath(); sx.moveTo(cx, cy); sx.quadraticCurveTo(cx + Math.cos(a + 0.5) * L * 0.5, cy + Math.sin(a + 0.5) * L * 0.5, cx + Math.cos(a) * L, cy + Math.sin(a) * L); sx.stroke();
  }
  const crack = (x0, y0, a0, len, w, seed) => {
    const Rc = rng(`${ID}-crack-${seed}`);
    const walk = (px, py, a, L, ww, depth) => {
      let done = 0;
      sx.beginPath(); sx.moveTo(px * S, py * S);
      const pts = [[px, py]];
      while (done < L) {
        const st = 2 + Rc() * 4; a += (Rc() - 0.5) * 0.6;
        px += Math.cos(a) * st; py += Math.sin(a) * st; done += st;
        pts.push([px, py]);
        if (depth < 2 && Rc() < 0.035) walk(px, py, a + (Rc() < 0.5 ? -1 : 1) * (0.5 + Rc() * 0.7), L * (0.15 + Rc() * 0.2), ww * 0.6, depth + 1);
      }
      for (let k = 1; k < pts.length; k++) {
        sx.strokeStyle = `rgb(${150 + (Rc() * 60) | 0},${150 + (Rc() * 50) | 0},${140 + (Rc() * 50) | 0})`;
        sx.lineWidth = ww * S * (0.5 + 0.8 * vnoise(k * 0.3, seed, 20));
        sx.beginPath(); sx.moveTo(pts[k - 1][0] * S, pts[k - 1][1] * S); sx.lineTo(pts[k][0] * S, pts[k][1] * S); sx.stroke();
      }
    };
    walk(x0, y0, a0, len, w, 0);
  };
  crack(1004, 268, 2.55, 260, 1.5, 1);
  crack(-4, 610, -0.32, 150, 1.2, 2);
  crack(452, 1004, -1.75, 150, 1.4, 3);
  crack(160, -4, 1.4, 110, 1.1, 4);
  // creases where the sheet was folded: a light ridge (screen) beside a shadow (multiply)
  const crease = (P, seed) => {
    const Rk = rng(`${ID}-crease-${seed}`);
    for (let k = 1; k < P.length; k++) {
      const a = P[k - 1], b = P[k];
      sx.strokeStyle = `rgba(255,250,240,${0.1 + Rk() * 0.08})`; sx.lineWidth = 1.4;
      sx.beginPath(); sx.moveTo(a[0] * S, a[1] * S); sx.lineTo(b[0] * S, b[1] * S); sx.stroke();
      mx.strokeStyle = `rgba(30,25,20,${0.1 + Rk() * 0.06})`; mx.lineWidth = 1.2;
      mx.beginPath(); mx.moveTo(a[0] * S + 1.6, a[1] * S + 1); mx.lineTo(b[0] * S + 1.6, b[1] * S + 1); mx.stroke();
    }
  };
  const vline = [], hline = [];
  for (let y = -5; y <= 1005; y += 40) vline.push([668 + 5 * Math.sin(y * 0.004) + (vnoise(y / 60, 0, 21) - 0.5) * 3, y]);
  for (let xx = -5; xx <= 1005; xx += 40) hline.push([xx, 562 + 4 * Math.sin(xx * 0.003) + (vnoise(xx / 60, 0, 22) - 0.5) * 3]);
  crease(vline, 1); crease(hline, 2);
  return { mult: m, scr: s };
}

// ------------------------------------------------------------------ cast, column and states
// X3 = anchor x (panel units) at u = 3, the tableau; the column glides right at VP.
const MEMBERS = [
  { id: 'O3', kind: 'rider', prop: 'banner', X3: 2130, phase: 1 },
  { id: 'W2', kind: 'walker', prop: 'staff', X3: 1960, phase: 0 },
  { id: 'O2', kind: 'rider', prop: 'halberd', X3: 1800, phase: 1 },
  { id: 'A', kind: 'axe', X3: 1440, phase: 0, label: '游徼车' },
  { id: 'O1', kind: 'rider', prop: 'banner', X3: 1232, phase: 1 },
  { id: 'WB', kind: 'walker', prop: 'staff', X3: 1072, phase: 0 },
  { id: 'B', kind: 'parasol', X3: 800, phase: 1, label: '主簿车' },
  { id: 'C', kind: 'parasol', X3: 17, phase: 0, label: '功曹车' },
  { id: 'WC', kind: 'walker', prop: 'shield', X3: -95, phase: 1 },
  { id: 'D', kind: 'carriage', X3: -370, phase: 0, label: '主记车' },
  { id: 'O4', kind: 'rider', prop: 'bow', X3: -580, phase: 1 },
  { id: 'E', kind: 'parasol', X3: -930, phase: 1, label: '贼曹车' },
  { id: 'W3', kind: 'walker', prop: 'staff', X3: -1040, phase: 0 },
  { id: 'O5', kind: 'rider', prop: 'halberd', X3: -1190, phase: 0 },
  { id: 'b1', kind: 'bird', X3: 618, y: 438, phase: 0 }, { id: 'b2', kind: 'bird', X3: 1110, y: 436, phase: 1 },
  { id: 'b3', kind: 'bird', X3: 236, y: 444, phase: 1 }, { id: 'b4', kind: 'bird', X3: -210, y: 440, phase: 0 },
  { id: 'b5', kind: 'bird', X3: -700, y: 442, phase: 1 }, { id: 'b6', kind: 'bird', X3: 1660, y: 438, phase: 0 },
  { id: 'b7', kind: 'bird', X3: -1120, y: 436, phase: 1 },
];
const SLOT_X3 = 452;                     // the empty cartouche gliding in the gap between C and B
const memberX = (m, u) => m.X3 + VP * (u - 3);
const isChariot = (m) => m.kind === 'parasol' || m.kind === 'axe' || m.kind === 'carriage';

function memberKey(m, u) {
  const hb = Math.floor(u * 4 + 1e-6);   // legs alternate on half-beats
  const alt = ((hb + m.phase) & 1) ? 'B' : 'A';
  const frz = u >= 2 && u < 4;           // the formal tableau
  let legs = frz ? 'F' : alt;
  if (isChariot(m)) {
    let pass = 'sit', drv = 'fwd';
    if (m.id === 'B' && u >= 2.5 && u < 4.5) pass = 'lean';
    if (m.id === 'C') {
      if (u >= 3 && u < 4) { legs = 'R'; drv = 'pull'; }
      if (u >= 4) { pass = 'point'; drv = 'stare'; }
    }
    return `${m.kind}:${legs}:${pass}:${drv}`;
  }
  if (m.kind === 'bird') return `bird:${frz ? 'F' : ((Math.floor(u * 2 + 1e-6) + m.phase) & 1) ? 'B' : 'A'}`;
  if (m.kind === 'walker') {
    const look = m.id === 'WB' && u >= 1.0 ? -1 : 1;
    return `walker:${m.prop}:${legs}:${look}`;
  }
  return `rider:${m.prop}:${legs}`;
}
/** A small bird flying with the procession (Han reliefs fill the sky above a 车马出行 with birds). */
function drawBird(C, st) {
  const up = st === 'A' ? 1 : st === 'F' ? 0.4 : -0.7;
  C.limb(limbPoly([[-2, -2], [-12, -6 - 16 * up], [-20, -10 - 22 * up]], [[0, 8], [0.6, 5], [1, 1.6]], 4), 0.7);
  C.limb(limbPoly([[-8, 0], [-20, -2], [-30, -6]], [[0, 6], [1, 2]], 3), 0.7);
  C.limb(limbPoly([[-8, 2], [-20, 4], [-29, 8]], [[0, 5], [1, 1.8]], 3), 0.7);
  C.cr(jit(ell(0, 0, 12, 5.2, -0.1, 10), 0.2, 131), 0.9);
  C.disc(12, -4, 4.4, 0);
  C.pl([[15, -6], [23, -3], [15, -2]], 0.5);
  C.dot(13, -5, 1.1);
  C.limb(limbPoly([[2, -3], [-4, -8 - 18 * up], [-6, -12 - 26 * up]], [[0, 8], [0.6, 5.5], [1, 1.8]], 4), 0.8);
  C.cut([[-2, -3 - 10 * up], [2, -2 - 6 * up]], 1, false);
}
function drawMemberKey(C, key) {
  const p = key.split(':');
  if (p[0] === 'bird') return drawBird(C, p[1]);
  if (p[0] === 'walker') return drawWalker(C, { prop: p[1], legs: p[2], look: +p[3] });
  if (p[0] === 'rider') return drawRider(C, { prop: p[1], legs: p[2] });
  return drawChariot(C, { kind: p[0], legs: p[1], pass: p[2], drv: p[3] });
}
const REGION = { bird: [-40, -46, 32, 22], walker: [-52, -210, 56, 10], rider: [-124, -316, 124, 10], parasol: [-76, -286, 232, 10], axe: [-70, -250, 232, 10], carriage: [-84, -204, 232, 10] };

function upperKey(f, u) {
  const frz = u >= 2 && u < 4;
  const b = Math.floor(u * 2 + 1e-6) + f.phase;   // wings beat once per beat
  return `${f.kind}:${frz ? 'A' : (b & 1) ? 'B' : 'A'}`;
}

/** Slot cartouche: blank until 3.5, then 「鹈鹕骑者」 is cut one character per 1/16 note. */
const slotChars = (u) => (u < 3.5 ? 0 : Math.min(4, 1 + Math.floor((u - 3.5) / 0.0625 + 1e-6)));

function drawCartouche(C, K, text, nShow, size) {
  const chars = [...text];
  const h = chars.length * size * 0.98 + 14, w = size + 14;
  const x = C.x;
  x.save(); x.lineWidth = 2.2; x.strokeStyle = '#fff'; x.strokeRect(-w / 2, -h, w, h); x.restore();
  chars.slice(0, nShow).forEach((ch, k) => glyph(x, K, ch, 0.5, -h + 7 + size * 0.49 + k * size * 0.98, size, '"Libian SC", "Kaiti SC", serif', 400, 5));
}
/** Two-column cartouche (right column first, top to bottom). */
function drawCartouche2(C, K, text, nShow, size) {
  const chars = [...text];
  const h = 2 * size * 0.98 + 14, w = 2 * size + 18;
  const x = C.x;
  x.save(); x.lineWidth = 2.2; x.strokeStyle = '#fff'; x.strokeRect(-w / 2, -h, w, h); x.restore();
  chars.slice(0, nShow).forEach((ch, k) => glyph(x, K, ch, (k < 2 ? 1 : -1) * (size * 0.5 + 2), -h + 7 + size * 0.49 + (k % 2) * size * 0.98, size, '"Libian SC", "Kaiti SC", serif', 400, 6));
}
const LABEL_SIZE = 23, SLOT_SIZE = 30;
const LABEL_BOTTOM = 522, SLOT_BOTTOM = 474;

// ------------------------------------------------------------------ sprite atlas
function rasterSprite(region, paint, P, seed) {
  const i0 = Math.floor(region[0] * S), j0 = Math.floor(region[1] * S);
  const w = Math.ceil(region[2] * S) - i0, h = Math.ceil(region[3] * S) - j0;
  const cv = mkCanvas(w, h), x = ctx2d(cv);
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  paint(carver(x), x);
  const L = lumOf(x.getImageData(0, 0, w, h).data, w * h);
  const out = new Uint8ClampedArray(w * h * 4);
  printPx(L, w, h, (seed * 37) & 255, (seed * 91) & 255, out, P);
  let a0 = w, a1 = -1, b0 = h, b1 = -1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (out[(j * w + i) * 4 + 3] > 2) { if (i < a0) a0 = i; if (i > a1) a1 = i; if (j < b0) b0 = j; if (j > b1) b1 = j; }
  if (a1 < 0) return null;
  const tw = a1 - a0 + 1, th = b1 - b0 + 1;
  const px = new Uint8ClampedArray(tw * th * 4);
  for (let j = 0; j < th; j++) px.set(out.subarray(((j + b0) * w + a0) * 4, ((j + b0) * w + a0 + tw) * 4), j * tw * 4);
  return { w: tw, h: th, px, dx: (i0 + a0) / S, dy: (j0 + b0) / S };
}

let BUILT = null;
function buildAll(K) {
  const sprites = [];
  const keys = new Map();   // key → { region, paint, P }
  const want = (key, region, paint) => { if (!keys.has(key)) keys.set(key, { region, paint }); };
  for (const m of MEMBERS) {
    for (let q = -9 * 16; q <= 15 * 16; q++) {
      const u = q / 16;
      const k = memberKey(m, u);
      want(k, REGION[m.kind], (C) => drawMemberKey(C, k));
    }
    if (m.label) want(`label:${m.label}`, [-24, -110, 24, 4], (C) => drawCartouche(C, K, m.label, 3, LABEL_SIZE));
  }
  for (let n = 0; n <= 4; n++) want(`slot:${n}`, [-48, -84, 48, 4], (C) => drawCartouche2(C, K, '鹈鹕骑者', n, SLOT_SIZE));
  want('wheel', [-54, -54, 54, 54], (C) => chariotWheel(C));
  for (const f of UPPER_FIGS) for (const st of ['A', 'B']) {
    const k = `${f.kind}:${st}`;
    const R0 = f.kind === 'phoenix' ? [-134, -92, 76, 48] : [-62, -130, 68, 10];
    want(k, R0.map((v) => v * f.s), (C) => { C.x.save(); C.x.scale(f.s, f.s); if (f.kind === 'phoenix') drawPhoenix(C, st); else drawRunner(C, st); C.x.restore(); });
  }
  let seed = 1;
  for (const [key, it] of keys) {
    const sp = rasterSprite(it.region, it.paint, P_FIG, seed++);
    if (sp) sprites.push({ key, ...sp });
  }
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
  for (const sp of sprites) map.set(sp.key, { dx: sp.dx, dy: sp.dy, w: sp.w / S, h: sp.h / S, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  const stone = buildStone(K);
  const ov = buildOverlays();
  BUILT = { stone, atlas, AW, AH, map, ov, nSprites: sprites.length };
}

function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}

// ------------------------------------------------------------------ the pelican, carved live
function paintPelican(C, P, parts) {
  const B = P.bird;
  const x = C.x;
  let wing = null;
  for (const part of parts) {
    const r = part.role;
    switch (r) {
      case 'legFar': C.pl(part.pts, 1.0); break;
      case 'footFar': C.pl(part.pts, 0.8); break;
      case 'crankFar': C.inc(part.pts, 5.2, 1.0, false); break;
      case 'tire': C.ring(part.c[0], part.c[1], part.r - 7.2, part.r + 2.0, 1.1); C.circ(part.c[0], part.c[1], part.r - 3.0, 1.2); break;
      case 'spoke': C.inc(part.pts, 2.1, 0.6, false, 'butt'); break;
      case 'hub': C.disc(part.c[0], part.c[1], 6, 0.8); C.dot(part.c[0], part.c[1], 1.8); break;
      case 'chain': x.setLineDash([2.4, 1.7]); C.inc(part.pts, 1.9, 0, false, 'butt'); x.setLineDash([]); break;
      case 'frame': C.inc(part.pts, 6.2, 1.1, false); break;
      case 'fork': C.inc(part.pts, 5.4, 1.0, false); break;
      case 'stem': C.inc(part.pts, 5.2, 1.0, false); break;
      case 'bars': C.inc(part.pts, 4.6, 1.0, false); break;
      case 'seatpost': C.inc(part.pts, 5.0, 1.0, false); break;
      case 'saddle': C.inc(part.pts, 8.6, 1.0, false); break;
      case 'ring': C.disc(part.c[0], part.c[1], part.r + 0.5, 1.0); C.circ(part.c[0], part.c[1], part.r * 0.62, 1.4); C.dot(part.c[0], part.c[1], 2.4); break;
      case 'tail': C.pl(part.pts, 1.0); break;
      case 'body': C.pl(part.pts, 1.1); break;
      case 'wing': {
        C.pl(part.pts, 1.4); wing = part.pts;
        // covert rows: scalloped cuts following the trailing edge, clipped to the wing
        x.save(); x.beginPath(); polyPath(x, wing, true); x.clip();
        const sc = B.secondaries;
        for (const off of [9, 18]) {
          const row = sc.map(([px, py], k) => [px + 2 * off * 0.15, py - off + Math.abs(Math.sin(k * 1.3)) * 2.5]);
          C.cut(row, 1.4);
        }
        x.restore();
        break;
      }
      case 'secondaries': {
        C.cut(part.pts, 2.4);
        for (let k = 1; k < part.pts.length - 1; k += 2) { const p = part.pts[k]; C.cut([[p[0], p[1] - 1], [p[0] - 4, p[1] + 6]], 1.3, false); }
        break;
      }
      case 'primary': C.inc(part.pts, 3.0, 1.0, true); break;
      case 'neck': C.pl(part.pts, 0); break;
      case 'head': C.disc(part.c[0], part.c[1], part.r, 0); break;
      case 'crest': C.inc(part.pts, 2.4, 0.6, false); break;
      case 'pouch': {
        C.pl(part.pts, 0);
        const lo = part.pts.slice(2, 24), J = B.lowerJawLine;
        const fold = lo.map((p, k) => { const t = k / (lo.length - 1); const q = [lerp(J[0][0], J[1][0], t), lerp(J[0][1], J[1][1], t)]; return [lerp(p[0], q[0], 0.42), lerp(p[1], q[1], 0.42)]; });
        C.cut(fold.slice(3, 18), 1.2);
        break;
      }
      case 'bill': {
        C.pl(part.pts, 1.0);
        const U = part.pts;
        C.cut([[(U[0][0] + U[7][0]) / 2, (U[0][1] + U[7][1]) / 2], [(U[1][0] + U[6][0]) / 2, (U[1][1] + U[6][1]) / 2], [(U[2][0] + U[5][0]) / 2, (U[2][1] + U[5][1]) / 2]], 1.1);
        break;
      }
      case 'nail': C.pl(part.pts, 0.7); break;
      case 'eye': C.dot(part.c[0], part.c[1], part.r * 0.95); break;
      case 'pupil': C.dot(part.c[0], part.c[1], Math.max(1.1, part.r * 0.5), true); break;
      case 'eyeShut': C.cut(part.pts, 2.0, false); break;
      case 'leg': C.pl(part.pts, 1.1); break;
      case 'foot': C.pl(part.pts, 0.9); break;
      case 'crank': C.inc(part.pts, 6.0, 1.1, false); break;
      case 'pedal': C.inc(part.pts, 7.0, 1.0, false); break;
      default: break;
    }
  }
  // breast feathers: a few short cuts on the body below the wing
  const bc = B.bodyC;
  for (let k = 0; k < 4; k++) C.cut([[bc[0] + 30 + k * 7, bc[1] + 14 - k * 4], [bc[0] + 36 + k * 7, bc[1] + 20 - k * 4]], 1.1, false);
}

let PEL = null;
function pelBuffers() {
  if (PEL) return PEL;
  const PW = 560, PH = 520;
  const cv = mkCanvas(PW, PH);
  PEL = { PW, PH, cv, x: ctx2d(cv), img: createImage(PW, PH) };
  return PEL;
}

function drawPelican(K, rider, view) {
  const P = rider.placed;
  const parts = K.rig.parts(P);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const ext = (p, r = 0) => { if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r; if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r; };
  for (const part of parts) { if (part.kind === 'circle') ext(part.c, part.r + 4); else for (const p of part.pts) ext(p, 6); }
  x0 = Math.max(x0 - 8, 0, view.x0 - 4); y0 = Math.max(y0 - 8, 0); x1 = Math.min(x1 + 8, 1000, view.x1 + 4); y1 = Math.min(y1 + 8, 1000);
  if (x1 <= x0 || y1 <= y0) return;
  const B = pelBuffers();
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(B.PW, Math.ceil(x1 * S) - i0), h = Math.min(B.PH, Math.ceil(y1 * S) - j0);
  const x = B.x;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  paintPelican(carver(x), P, parts);
  const L = lumOf(x.getImageData(0, 0, w, h).data, w * h);
  const out = new ImageData(w, h);
  const ox = Math.round(P.place.x * S);    // the cut's grain travels with the bicycle
  printPx(L, w, h, (i0 - ox) & 255, j0 & 255, out.data, P_RIDER);
  const ic = B.img.drawingContext;
  ic.clearRect(0, 0, B.PW, B.PH);
  ic.putImageData(out, 0, 0);
  B.img.setModified(true);
  image(B.img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

// ------------------------------------------------------------------ scene
export default {
  ride: RIDE,
  freezeU: 3.7,   // the full gag in one tile: formal tableau, passenger looking back, horse rearing, label cut
  cues: [
    { u: 1.0, name: 'attendantTurns' }, { u: 2.0, name: 'tableau' }, { u: 2.5, name: 'passengerLooks' },
    { u: 3.0, name: 'horseRears' }, { u: 3.5, name: 'cartouche' }, { u: 4.0, name: 'overtake' },
  ],

  async init(K) {
    ink.init(K);
    if (!BUILT) buildAll(K);
    const st = toImage(BUILT.stone), at = toImage(BUILT.atlas), mu = toImage(BUILT.ov.mult), sc = toImage(BUILT.ov.scr);
    this.stone = K.bake('stone', N, N, (K2, w, h) => { image(st, 0, 0, w, h); });
    this.atlas = K.bake('atlas', BUILT.AW, BUILT.AH, (K2, w, h) => { image(at, 0, 0, w, h); });
    this.mult = K.bake('mult', N, N, (K2, w, h) => { image(mu, 0, 0, w, h); });
    this.scr = K.bake('scr', N, N, (K2, w, h) => { image(sc, 0, 0, w, h); });
    this.map = BUILT.map;
    this.stats = { sprites: BUILT.nSprites, atlas: [BUILT.AW, BUILT.AH], bakeMB: (3 * N * N * 4 + BUILT.AW * BUILT.AH * 4) / 1048576 };
  },

  mods(u) {
    const m = { spokes: 8 };
    const f = win(1.85, 4.15, u, 0.3);
    if (f > 1e-4) m.bob = 1 - 0.85 * f;                           // sits up stiffly for the formal tableau
    if (u >= 3.0 && u < 3.5) { m.eye = 'wide'; m.scared = 0.3; }   // the horse behind rears
    const w = win(4.0, 4.95, u, 0.25);
    if (w > 1e-4) m.wind = 0.7 * w;                                // pulls out at speed
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    imageMode(CORNER);
    image(this.stone, 0, 0, 1000, 1000);
    const spr = (key, x, y) => {
      const sp = this.map.get(key);
      if (!sp) return;
      if (x + sp.dx > v.x1 || x + sp.dx + sp.w < v.x0) return;
      image(this.atlas, x + sp.dx, y + sp.dy, sp.w, sp.h, sp.ax, sp.ay, sp.aw, sp.ah);
    };
    for (const f of UPPER_FIGS) spr(upperKey(f, u), f.x, f.y);
    // the procession (labels ride with their chariots)
    const wsp = this.map.get('wheel');
    for (const m of MEMBERS) {
      const X = memberX(m, u);
      if (X + 230 < v.x0 - 10 || X - 130 > v.x1 + 10 || X + 230 < -10 || X - 130 > 1010) continue;
      spr(memberKey(m, u), X, m.y ?? 800);
      if (isChariot(m) && wsp) {
        const a = X / CH.r;
        push(); translate(X, 800 - CH.r); rotate(a);
        image(this.atlas, wsp.dx, wsp.dy, wsp.w, wsp.h, wsp.ax, wsp.ay, wsp.aw, wsp.ah);
        pop();
      }
      if (m.label) spr(`label:${m.label}`, X - 4, LABEL_BOTTOM);
    }
    const sx = SLOT_X3 + VP * (u - 3);
    spr(`slot:${slotChars(u)}`, sx, SLOT_BOTTOM);
    // stone chips flick off each character as it is cut (3.5, 3.5625, 3.625, 3.6875)
    if (u >= 3.5 && u < 3.95) {
      noStroke();
      for (let c = 0; c < 4; c++) {
        const age = u - (3.5 + c * 0.0625);
        if (age < 0 || age > 0.22) continue;
        const cx = sx + (c < 2 ? 1 : -1) * (SLOT_SIZE * 0.5 + 2), cy = SLOT_BOTTOM - 2 * SLOT_SIZE * 0.98 - 7 + SLOT_SIZE * 0.49 + (c % 2) * SLOT_SIZE * 0.98;
        const rr = rng(`${ID}-chips-${c}`);
        for (let k = 0; k < 11; k++) {
          const a = -Math.PI * (0.1 + rr() * 0.8) + (rr() < 0.3 ? Math.PI : 0), sp = 90 + rr() * 150, sz = 2.2 + rr() * 2.8;
          const d = sp * age, fall = 260 * age * age;
          fill(PAPER[0], PAPER[1], PAPER[2], 255 * (1 - age / 0.22));
          rect(cx + Math.cos(a) * (8 + d), cy + Math.sin(a) * (8 + d) + fall, sz, sz * (0.6 + rr() * 0.8));
        }
      }
    }
    if (ctx.rider.visible) drawPelican(K, ctx.rider, v);
    // the sheet: grit and creases (multiply), pinholes, fibres and cracks (screen)
    blendMode(MULTIPLY); image(this.mult, 0, 0, 1000, 1000);
    blendMode(SCREEN); image(this.scr, 0, 0, 1000, 1000);
    blendMode(BLEND);
  },
};
