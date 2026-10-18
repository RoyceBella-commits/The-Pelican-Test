// 01 · 撒哈拉岩画 / Saharan Rock Art · c. 4000 BCE
//
// A Tassili n'Ajjer "Bovidian" pastoral frieze on a sandstone rock-shelter wall.
// Technique (all deterministic, built once in init):
//   • the wall is a per-pixel sandstone simulation (bedding, grain, varnish streaks, spalls, fissures)
//     held as a few byte FIELDS at S px/unit, panel-aligned;
//   • every painted shape (herd, herders, ghosts, title, handprint, AND the live pelican) is rasterised
//     with Canvas2D and then "eroded" by the same fields — pigment sits in the rock: edges break up along the
//     grain, peaks of the relief lose paint, abraded patches/spalls/cracks remove it, the rock's own
//     shading shows through. Because the fields are fixed to the wall, the moving pelican is painted in the
//     very same stone.
//   • figures live as discrete painted STATES (sprites in one atlas), switched on beats — never tweened.
import { profile } from '../beat/ride.js';
import { rng, smoothPath, ribbon } from '../kit/math.js';

const ID = 'sahara';
const S = 1.25;                     // px per panel unit for fields, wall and sprites
const N = Math.round(1000 * S);     // field size (px)
const RIDE = { hold: [2.3, 3.7], speed: 0.15, ramp: 0.35 };
let PROF = null;
const riderBB = (u) => (PROF || (PROF = profile(RIDE))).x(u);
const birdHeadX = (u) => riderBB(u) + 70;

// ------------------------------------------------------------------ palette
const C = {
  rock: '#c98a5a', rock2: '#b8744a', stone: '#dcab7f', varnish: '#5a3a26',
  red: '#8e2f1c', red2: '#a5432a', yellow: '#c98b2b', white: '#efe4cf', black: '#2b1f1a',
  dark: '#62261a', horn: '#6b2617', bike: '#6a2416',
};
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const VARN = hexRGB(C.varnish);
const VARN_AMT = 0.62;

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

/** Low-frequency field sampled every `step` px and bilinearly upsampled to N×N. */
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

// ------------------------------------------------------------------ the wall: layout
const SEAMS = [   // bedding seams (y, half-width, strength, waviness)
  { y: 118, w: 1.2, s: 0.34, warp: 1 },
  { y: 300, w: 1.6, s: 0.5, warp: 1 },
  { y: 460, w: 2.0, s: 0.62, warp: 0.2 },    // the upper register's ground line
  { y: 642, w: 1.3, s: 0.36, warp: 1 },
  { y: 886, w: 1.8, s: 0.55, warp: 1 },
];
const STREAKS = [ // desert varnish running down: x, start y, length, half-width, strength
  { x: 14, y0: -20, len: 620, w: 26, s: 0.9 },
  { x: 478, y0: -10, len: 230, w: 12, s: 0.7 },
  { x: 918, y0: -20, len: 700, w: 30, s: 0.75 },
  { x: 996, y0: 150, len: 420, w: 14, s: 0.6 },
  { x: 270, y0: 300, len: 140, w: 8, s: 0.55 },
  { x: 612, y0: 642, len: 150, w: 9, s: 0.45 },
  { x: 744, y0: -10, len: 160, w: 13, s: 0.6 },
  { x: 150, y0: 806, len: 200, w: 26, s: 0.7 },
  { x: 560, y0: 806, len: 200, w: 34, s: 0.6 },
  { x: 860, y0: 806, len: 200, w: 18, s: 0.55 },
];
const SPALLS = [ // flaked patches (fresh, lighter, no paint): x, y, radius, rotation, seed
  { x: 830, y: 40, r: 26, a: 0.3, k: 5 },
  { x: 400, y: 918, r: 36, a: -0.2, k: 6 },
  { x: 980, y: 874, r: 24, a: 0.6, k: 7 },
  { x: 20, y: 326, r: 16, a: 0.1, k: 4 },
];
const CRACKS = [ // fissures: start, heading (rad, y down), length, width, seed
  { x: 458, y: -4, a: 1.62, len: 250, w: 2.0, k: 1 },
  { x: 1004, y: 300, a: 1.95, len: 280, w: 1.9, k: 2 },
  { x: 612, y: 802, a: 1.45, len: 210, w: 2.4, k: 3 },
  { x: -4, y: 350, a: 0.25, len: 120, w: 1.5, k: 4 },
  { x: 700, y: 1004, a: -1.7, len: 120, w: 1.8, k: 6 },
  { x: 116, y: -4, a: 1.25, len: 80, w: 1.3, k: 7 },
];

function crackPaths() {
  const out = [];
  for (const c of CRACKS) {
    const R = rng(`${ID}-crack-${c.k}`);
    const walk = (x, y, a, len, w, depth) => {
      const pts = [[x, y]];
      let L = 0;
      while (L < len) {
        const st = 3 + R() * 5;
        a += (R() - 0.5) * 0.55;
        x += Math.cos(a) * st; y += Math.sin(a) * st; L += st;
        pts.push([x, y]);
        if (depth < 2 && R() < 0.04) walk(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), len * (0.2 + R() * 0.25), w * 0.6, depth + 1);
      }
      out.push({ pts, w });
    };
    walk(c.x, c.y, c.a, c.len, c.w, 0);
  }
  return out;
}

// ------------------------------------------------------------------ fields + wall
let FIELDS = null;   // { REL, MOT, LOS, SPL, CRK, CRB, VRN, LUM, W }

function buildFields() {
  const NN = N * N;
  const REL = new Uint8Array(NN), MOT = new Uint8Array(NN), LOS = new Uint8Array(NN);
  const SPL = new Uint8Array(NN), CRK = new Uint8Array(NN), CRB = new Uint8Array(NN), VRN = new Uint8Array(NN), LUM = new Uint8Array(NN);
  const W = new Float32Array(NN * 3);

  // low-frequency fields
  const tone = coarseField(8, (x, y) => fbm(x / 380, y / 380, 51, 3));
  const warp = coarseField(8, (x, y) => fbm(x / 230, y / 150, 52, 3) - 0.5);
  const bump = coarseField(3, (x, y) => fbm(x / 14, y / 10, 53, 3));
  const mott = coarseField(3, (x, y) => 0.65 * fbm(x / 20, y / 20, 54, 3) + 0.35 * vnoise(x / 6, y / 6, 58));
  const abr = coarseField(6, (x, y) => fbm(x / 95, y / 70, 55, 4));
  const patchA = coarseField(6, (x, y) => fbm(x / 120, y / 50, 61, 4));
  const patchL = coarseField(8, (x, y) => fbm(x / 260, y / 90, 62, 3));
  const patina = coarseField(8, (x, y) => fbm(x / 210, y / 260, 63, 4));
  const iron = coarseField(4, (x, y) => fbm(x / 40, y / 28, 64, 3));
  const hgt = coarseField(4, (x, y) => fbm(x / 150, y / 110, 65, 3) + 0.14 * fbm(x / 48, y / 40, 67, 2));
  const LOff = Math.round(5 * S);
  const pres = SEAMS.map((sd, k) => { const a = new Float32Array(1000); for (let x = 0; x < 1000; x++) a[x] = sm(0.36, 0.58, fbm(x / 55, k * 7.3, 56, 4)); return a; });
  const meander = STREAKS.map((st, k) => { const a = new Float32Array(1100); for (let y = 0; y < 1100; y++) a[y] = (fbm(y / 70, k * 3.1, 57, 3) - 0.5) * 2 * (6 + st.w * 0.4); return a; });

  // spall mask (sharp-edged flakes)
  for (const sp of SPALLS) {
    const x0 = Math.max(0, Math.floor((sp.x - sp.r * 1.9) * S)), x1 = Math.min(N, Math.ceil((sp.x + sp.r * 1.9) * S));
    const y0 = Math.max(0, Math.floor((sp.y - sp.r * 1.6) * S)), y1 = Math.min(N, Math.ceil((sp.y + sp.r * 1.6) * S));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
      const x = (i + 0.5) / S, y = (j + 0.5) / S;
      const ca = Math.cos(sp.a), sa = Math.sin(sp.a);
      const rx = ((x - sp.x) * ca + (y - sp.y) * sa) / 1.45, ry = -(x - sp.x) * sa + (y - sp.y) * ca;
      const d = (0.55 * Math.max(Math.abs(rx), Math.abs(ry)) + 0.45 * Math.hypot(rx, ry)) / sp.r;
      const v = 1 - d + 0.7 * (fbm(x / 13, y / 13, 60 + sp.k, 2) - 0.5) + 0.25 * (vnoise(x / 3.5, y / 3.5, 66) - 0.5);
      const m = sm(0, 0.05, v);
      const o = j * N + i;
      SPL[o] = Math.max(SPL[o], Math.round(m * 255));
    }
  }

  // crack mask (rasterised polylines) + a soft halo
  const CR = crackPaths();
  {
    const cv = mkCanvas(N, N), x = ctx2d(cv);
    x.setTransform(S, 0, 0, S, 0, 0);
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#000';
    for (const c of CR) {
      for (let k = 1; k < c.pts.length; k++) {
        x.lineWidth = c.w * (0.55 + 0.9 * vnoise(k * 0.4, c.w * 10, 59));
        x.beginPath(); x.moveTo(c.pts[k - 1][0], c.pts[k - 1][1]); x.lineTo(c.pts[k][0], c.pts[k][1]); x.stroke();
      }
    }
    const d = x.getImageData(0, 0, N, N).data;
    for (let o = 0; o < NN; o++) CRK[o] = d[o * 4 + 3];
    const cb = mkCanvas(N, N), xb = ctx2d(cb);
    xb.filter = 'blur(3px)'; xb.drawImage(cv, 0, 0);
    const db = xb.getImageData(0, 0, N, N).data;
    for (let o = 0; o < NN; o++) CRB[o] = db[o * 4 + 3];
  }

  const A = hexRGB(C.rock), B = hexRGB(C.rock2), L = hexRGB(C.stone), PAT = hexRGB('#8c5944'), IRON = hexRGB('#c6763a');
  const FR = hexRGB('#e6a676'), LOW = hexRGB('#9b6241');
  let lumSum = 0;
  const lumTmp = new Float32Array(NN);
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) / S;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / S;
      const o = j * N + i;
      // micro relief: sand grains + clusters + bumps
      const g1 = vnoise(x * 0.7, y * 0.7, 11), g2 = vnoise(x * 0.26, y * 0.34, 12);
      let rel = 0.36 * g1 + 0.26 * g2 + 0.38 * bump[o] + (hash3(i, j, 14) - 0.5) * 0.14;
      rel = clamp01((rel - 0.5) * 1.35 + 0.5);
      REL[o] = rel * 255;
      const mot = clamp01((mott[o] - 0.5) * 1.8 + 0.5);
      MOT[o] = mot * 255;
      LOS[o] = clamp01(sm(0.57, 0.72, abr[o]) * (0.5 + 0.5 * mott[o])) * 255;

      // stone colour: elongated patches, lighter beds, iron stain, purple-brown patina
      const t1 = sm(0.3, 0.7, patchA[o]);
      let r = lerp(B[0], A[0], t1), g = lerp(B[1], A[1], t1), b = lerp(B[2], A[2], t1);
      const t2 = sm(0.56, 0.82, patchL[o]) * 0.55;
      r = lerp(r, L[0], t2); g = lerp(g, L[1], t2); b = lerp(b, L[2], t2);
      const t3 = sm(0.64, 0.8, iron[o]) * 0.32;
      r = lerp(r, IRON[0], t3); g = lerp(g, IRON[1], t3); b = lerp(b, IRON[2], t3);
      const t4 = sm(0.58, 0.78, patina[o]) * 0.42;
      r = lerp(r, PAT[0], t4); g = lerp(g, PAT[1], t4); b = lerp(b, PAT[2], t4);
      // bedding laminae (subtle, amplitude varies along x)
      const yb = y + warp[o] * 26;
      const band = 0.6 * vnoise(yb * 0.05, 0.5, 41) + 0.4 * vnoise(yb * 0.17, 3.5, 42);
      let br = 1 + (band - 0.5) * 2 * (0.025 + 0.06 * tone[o]);
      br *= 0.98 + 0.16 * (tone[o] - 0.5);
      br *= 0.8 + 0.4 * rel;
      const hh = hash3(i, j, 16);
      if (hh < 0.03) br *= 0.84; else if (hh > 0.982) br *= 1.12;
      br *= 1.08 - 0.15 * (x * 0.0004 + y * 0.0006);   // raking light from the upper left
      {   // bulges and hollows of the wall, lit from the upper left
        const ia = Math.max(0, i - LOff), ib = Math.min(N - 1, i + LOff), ja = Math.max(0, j - LOff), jb = Math.min(N - 1, j + LOff);
        br *= 1 + 1.25 * (hgt[ja * N + ia] - hgt[jb * N + ib]);
      }
      const vx = (x - 500) / 520, vy = (y - 470) / 540;
      br *= 1 - 0.16 * (vx * vx + vy * vy);
      // seams
      const xi = Math.min(999, Math.max(0, x | 0));
      for (let k = 0; k < SEAMS.length; k++) {
        const sd = SEAMS[k];
        const d = y + warp[o] * 26 * sd.warp + (vnoise(x / 9, k, 47) - 0.5) * 1.6 - sd.y;
        if (d < -8 || d > 6) continue;
        const p = pres[k][xi] * sd.s;
        const sw = sd.w * (0.45 + 1.1 * vnoise(x / 26, k + 0.5, 48));
        br *= 1 - 0.5 * p * Math.exp(-((d / sw) ** 2));
        br *= 1 + 0.13 * p * Math.exp(-(((d + sw * 2.2) / (sw * 1.3)) ** 2));
        if (d > 0) br *= 1 - 0.035 * p * Math.exp(-d / 5);
      }
      // the ledge = road (flat at y = 800)
      const dl = y - 800;
      if (dl > -7) {
        if (dl < 0) br *= 1 + 0.12 * sm(-7, -1, dl);
        else if (dl < 4.5) br *= 0.55 + 0.12 * (dl / 4.5);
        else {
          const tL = sm(4.5, 30, dl);
          r = lerp(r, LOW[0], 0.35 * tL); g = lerp(g, LOW[1], 0.35 * tL); b = lerp(b, LOW[2], 0.35 * tL);
          br *= 0.82 + 0.08 * sm(5, 26, dl) + 0.05 * sm(26, 140, dl) + 0.06 * (vnoise(x / 80, y / 2.4, 44) - 0.5);
        }
      }
      // spalls: fresh, lighter, rougher stone
      const spv = SPL[o] / 255;
      if (spv > 0) {
        r = lerp(r, FR[0], 0.42 * spv); g = lerp(g, FR[1], 0.42 * spv); b = lerp(b, FR[2], 0.42 * spv);
        br *= 1 + spv * (0.06 + 0.24 * (g1 - 0.5) + 0.2 * (g2 - 0.5));
      }
      lumTmp[o] = br;
      lumSum += br;
      W[o * 3] = r * br; W[o * 3 + 1] = g * br; W[o * 3 + 2] = b * br;

      // varnish streaks
      let v = 0;
      for (let k = 0; k < STREAKS.length; k++) {
        const st = STREAKS[k];
        const t = (y - st.y0) / st.len;
        if (t < 0 || t > 1.2) continue;
        const yy = Math.min(1099, Math.max(0, (y | 0)));
        const dx = (x - st.x - meander[k][yy]) / (st.w * (1 - 0.45 * t));
        if (dx < -2.4 || dx > 2.4) continue;
        const ragged = 0.55 + 0.9 * vnoise(x * 0.16, y * 0.022, 70 + k);
        const across = Math.exp(-dx * dx * 1.4 * ragged);
        const along = sm(0, 0.04, t) * (1 - sm(0.45, 1.15, t + 0.25 * (vnoise(x * 0.08, 3.3, 80 + k) - 0.5)));
        v += st.s * across * along * (0.5 + 0.5 * vnoise(x * 0.35, y * 0.045, 90 + k));
      }
      // soot/varnish under the shelter's lip at the very top
      v += 0.45 * (1 - sm(0, 60 + 40 * warp[o], y));
      VRN[o] = clamp01(v) * 255;
    }
  }
  const lumMean = lumSum / NN;
  for (let o = 0; o < NN; o++) LUM[o] = Math.max(0, Math.min(255, Math.round((lumTmp[o] / lumMean) * 128)));
  FIELDS = { REL, MOT, LOS, SPL, CRK, CRB, VRN, LUM, W };
}

/** Final wall: varnish over everything, spall relief edges, fissures → RGBA bytes. */
function finishWall() {
  const { W, VRN, REL, SPL, CRK, CRB } = FIELDS;
  const out = new Uint8ClampedArray(N * N * 4);
  const at = (A, i, j) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : A[j * N + i]);
  const off = Math.round(2.4 * S);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i;
    let r = W[o * 3], g = W[o * 3 + 1], b = W[o * 3 + 2];
    const v = (VRN[o] / 255) * VARN_AMT * (0.7 + 0.6 * REL[o] / 255);
    r += (VARN[0] - r) * v; g += (VARN[1] - g) * v; b += (VARN[2] - b) * v;
    // spall rim: shadow on the upper-left inner edge, light on the lower-right
    const sp = SPL[o];
    if (sp || at(SPL, i - off, j - off) || at(SPL, i + off, j + off)) {
      const ul = at(SPL, i - off, j - off), lr = at(SPL, i + off, j + off);
      const sh = (sp - ul) / 255, hi = (sp - lr) / 255;
      const f = 1 - 0.42 * Math.max(0, sh) + 0.14 * Math.max(0, hi);
      r *= f; g *= f; b *= f;
    }
    // fissures: soft shadow halo, dark core, lit lower-right lip
    const c = CRK[o] / 255, cb = CRB[o] / 255;
    if (c > 0 || cb > 0) {
      const lip = at(CRK, i - 1, j - 1) / 255 * (1 - c);
      const f = (1 - 0.5 * c) * (1 - 0.16 * cb) * (1 + 0.14 * lip);
      r *= f; g *= f * 0.97; b *= f * 0.94;
    }
    out[o * 4] = r; out[o * 4 + 1] = g; out[o * 4 + 2] = b; out[o * 4 + 3] = 255;
  }
  return out;
}

// ------------------------------------------------------------------ pigment erosion
// Shared by the bake (mode 'wall': composite into W) and sprites/pelican (mode 'sprite': RGBA out).
// dens: max opacity · edge: edge raggedness · h0/h1/hole: paint lost on relief peaks · mot: application unevenness
// loss: abrasion · kw: extra fragility of kaolin white · kfade: kaolin fading · shade: rock shading through paint
const P_FIG = { dens: 0.94, edge: 0.75, h0: 0.58, h1: 0.86, hole: 0.62, mot: 0.62, loss: 0.55, kw: 1, kfade: 0.1, shade: 0.75 };
const P_GHOST = { dens: 0.3, edge: 1.1, h0: 0.42, h1: 0.8, hole: 0.7, mot: 0.9, loss: 0.9, kw: 0, kfade: 0, shade: 0.8, gap: 0.42 };
const P_TITLE = { dens: 0.92, edge: 0.8, h0: 0.62, h1: 0.92, hole: 0.5, mot: 0.55, loss: 0.2, kw: 0.2, kfade: 0, shade: 0.7 };
const P_TITLE_W = { dens: 0.94, edge: 0.74, h0: 0.66, h1: 0.92, hole: 0.42, mot: 0.5, loss: 0.1, kw: 0, kfade: 0, shade: 0.65 };
const P_HAND = { dens: 0.88, edge: 1.0, h0: 0.5, h1: 0.82, hole: 0.75, mot: 0.9, loss: 0.3, kw: 0, kfade: 0, shade: 0.75 };
const P_RIDER = { dens: 0.95, edge: 0.72, h0: 0.58, h1: 0.88, hole: 0.58, mot: 0.7, loss: 0.45, kw: 0.8, kfade: 0.08, shade: 0.75 };

function erode(dA, dB, w, h, i0, j0, P, outRGBA, varnish) {
  const { REL, MOT, LOS, SPL, CRK, VRN, LUM, W } = FIELDS;
  for (let j = 0; j < h; j++) {
    const fj = j0 + j;
    if (fj < 0 || fj >= N) continue;
    for (let i = 0; i < w; i++) {
      const fi = i0 + i;
      if (fi < 0 || fi >= N) continue;
      const k = (j * w + i) * 4;
      const ab = dB[k + 3] / 255;
      if (ab < 0.015) continue;
      const a0 = dA[k + 3] / 255;
      let r, g, b;
      if (a0 > 0.4) { r = dA[k]; g = dA[k + 1]; b = dA[k + 2]; } else { r = dB[k]; g = dB[k + 1]; b = dB[k + 2]; }
      const o = fj * N + fi;
      const rel = REL[o] / 255, mot = MOT[o] / 255;
      const e = ab + (rel - 0.5) * P.edge + (mot - 0.5) * P.edge * 0.55;
      const cov = sm(0.36, 0.64, e);
      if (cov <= 0) continue;
      const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
      const kao = sm(140, 200, mn);
      const hole = sm(P.h0, P.h1, rel) * (P.hole + kao * 0.2 * P.kw);
      let a = cov * P.dens * (1 - hole) * Math.min(1, 0.9 + P.mot * (mot - 0.5));
      a *= 1 - (LOS[o] / 255) * Math.min(1, P.loss + kao * 0.25 * P.kw);
      a *= (1 - SPL[o] / 255) * (1 - CRK[o] / 255);
      a *= 1 - kao * P.kfade;
      if (P.gap) a *= sm(P.gap - 0.12, P.gap + 0.12, 0.6 * vnoise(fi / (60 * S), fj / (60 * S), 99) + 0.4 * mot);
      if (a <= 0.004) continue;
      const sh = 1 + (LUM[o] / 128 - 1) * P.shade;
      const tn = 0.96 + 0.08 * mot;
      r *= sh * tn; g *= sh; b *= sh * (2 - tn);
      if (outRGBA) {
        if (varnish) {
          const v = (VRN[o] / 255) * VARN_AMT * (0.75 + 0.5 * rel);
          r += (VARN[0] - r) * v; g += (VARN[1] - g) * v; b += (VARN[2] - b) * v;
        }
        outRGBA[k] = r; outRGBA[k + 1] = g; outRGBA[k + 2] = b; outRGBA[k + 3] = a * 255;
      } else {
        const q = o * 3;
        W[q] += (r - W[q]) * a; W[q + 1] += (g - W[q + 1]) * a; W[q + 2] += (b - W[q + 2]) * a;
      }
    }
  }
}

/** Rasterise draw(ctx) (panel units) over a panel-unit region; returns sharp + blurred pixels. */
function rasterize(region, draw, blurPx) {
  const i0 = Math.floor(region[0] * S), j0 = Math.floor(region[1] * S);
  const w = Math.ceil(region[2] * S) - i0, h = Math.ceil(region[3] * S) - j0;
  const cA = mkCanvas(w, h), xA = ctx2d(cA);
  xA.setTransform(S, 0, 0, S, -i0, -j0);
  xA.lineCap = 'round'; xA.lineJoin = 'round';
  draw(xA);
  const cB = mkCanvas(w, h), xB = ctx2d(cB);
  xB.filter = `blur(${blurPx}px)`;
  xB.drawImage(cA, 0, 0);
  return { i0, j0, w, h, dA: xA.getImageData(0, 0, w, h).data, dB: xB.getImageData(0, 0, w, h).data };
}

function paintWall(region, draw, blurPx, P) {
  const r = rasterize(region, draw, blurPx);
  erode(r.dA, r.dB, r.w, r.h, r.i0, r.j0, P, null, false);
}

// ------------------------------------------------------------------ drawing helpers (Canvas2D)
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
function polyPath(x, P) { x.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length; k++) x.lineTo(P[k][0], P[k][1]); x.closePath(); }
const keyW = (W) => (t) => {
  if (typeof W === 'number') return W;
  if (t <= W[0][0]) return W[0][1];
  for (let k = 1; k < W.length; k++) if (t <= W[k][0]) return lerp(W[k - 1][1], W[k][1], (t - W[k - 1][0]) / (W[k][0] - W[k - 1][0]));
  return W[W.length - 1][1];
};
/** Tapered limb polygon along a smooth spine. W: number or [[t, w], ...]. */
function limbPoly(pts, W, per = 6) {
  const sp = pts.length > 2 ? smoothPath(pts, per) : [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]];
  return { poly: ribbon(sp, keyW(W)), a: sp[0], b: sp[sp.length - 1], w0: keyW(W)(0), w1: keyW(W)(1) };
}
function limbPath(x, L) {
  polyPath(x, L.poly);
  x.moveTo(L.a[0] + L.w0 / 2, L.a[1]); x.arc(L.a[0], L.a[1], L.w0 / 2, 0, Math.PI * 2);
  x.moveTo(L.b[0] + L.w1 / 2, L.b[1]); x.arc(L.b[0], L.b[1], L.w1 / 2, 0, Math.PI * 2);
}
function blob(R, cx, cy, rx, ry, rot = 0, n = 9, jit = 0.28) {
  const pts = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const f = 1 + (R() - 0.5) * 2 * jit;
    const px = Math.cos(a) * rx * f, py = Math.sin(a) * ry * f;
    pts.push([cx + px * c - py * s, cy + px * s + py * c]);
  }
  return pts;
}
const rotAbout = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };

// ------------------------------------------------------------------ cattle
const HIDES = {
  red: { body: C.red, patch: C.white, outline: '#5e1d10', horn: C.horn },
  pie: { body: C.red2, patch: C.white, outline: '#6a2414', horn: C.horn },
  dark: { body: C.dark, patch: C.white, outline: '#3a160d', horn: '#3e1a10' },
  white: { body: C.white, patch: C.red, outline: C.red, horn: '#7a2a18' },
  yellow: { body: C.yellow, patch: C.red, outline: C.red, horn: '#7a2a18' },
};
const COW_BODY = [
  [22, -103], [48, -98], [92, -96], [128, -100], [146, -95], [155, -84], [156, -70], [150, -58], [140, -51],
  [118, -47], [80, -45], [44, -48], [24, -50], [8, -55], [-2, -64], [-6, -76], [0, -90], [10, -99],
];
const COW_HEAD = [[-3, -12.5], [7, -14.5], [19, -13], [30, -10.5], [38, -8.5], [43.5, -4.5], [45, 2], [43, 8.5], [35, 11.5], [23, 12.5], [10, 13.5], [-3, 12.5]];
const COW_EAR = [[3, -5], [-9, -13], [-17, -11], [-7, -1]];
const NECKS = {
  walk: { A: [12, -80], M: [-5, -90], B: [-20, -90], th: 2.45 },
  graze: { A: [12, -80], M: [-2, -68], B: [-14, -46], th: 1.95 },
  up: { A: [12, -84], M: [-5, -101], B: [-18, -112], th: 2.72 },
  back: { A: [20, -88], M: [24, -114], B: [40, -123], th: 0.24, mirror: true },
};
const TAILS = {
  hang: [[146, -93], [155, -80], [159, -56], [158, -32]],
  flick: [[146, -93], [160, -87], [176, -72], [188, -54]],
  up: [[146, -94], [156, -112], [161, -136], [156, -160]],
};
const LEGS = { // swing angles: nearFore, farFore, nearHind, farHind (+ = hoof forward)
  A: [0.2, -0.13, -0.15, 0.16], B: [-0.13, 0.2, 0.16, -0.15], S: [0.02, -0.02, 0.0, 0.03],
};

function headXf(B, th, mirror) {
  const dx = Math.cos(th), dy = Math.sin(th);
  const ux = mirror ? dy : -dy, uy = mirror ? -dx : dx;
  return (p) => [B[0] + p[0] * dx - p[1] * ux, B[1] + p[0] * dy - p[1] * uy];
}

function cowGeometry(cw, st) {
  const parts = [];   // {k: 'poly'|'limb', g, role}
  const sw = LEGS[st.legs];
  const leg = (top, joints, W, ang) => {
    let pts = [top, ...joints].map((p) => rotAbout(p, top, ang));
    const dy = -pts[pts.length - 1][1];
    pts = pts.map((p) => [p[0], p[1] + dy]);
    return limbPoly(pts, W, 5);
  };
  const FW = [[0, 14], [0.55, 7.2], [0.85, 5.4], [1, 5]], HW = [[0, 24], [0.45, 8.4], [0.62, 6.8], [0.86, 5.4], [1, 5]];
  const hoof = (L) => { const b = L.b; return [[b[0] + 3, b[1] - 3], [b[0] - 6, b[1] - 1], [b[0] - 5, b[1] + 0.6], [b[0] + 3, b[1] + 0.6]]; };
  const farFore = leg([32, -62], [[31, -27], [30, -8], [28, 0]], FW, sw[1]);
  const farHind = leg([122, -64], [[134, -30], [130, -8], [128, 0]], HW, sw[3]);
  const nearFore = leg([20, -62], [[18, -27], [17, -8], [15, 0]], FW, sw[0]);
  const nearHind = leg([134, -64], [[147, -30], [143, -8], [141, 0]], HW, sw[2]);
  const tail = limbPoly(TAILS[st.tail], [[0, 3.6], [1, 2.2]], 6);
  const tp = smoothPath(TAILS[st.tail], 6), te = tp[tp.length - 1], tq = tp[tp.length - 3];
  const td = [te[0] - tq[0], te[1] - tq[1]], tl = Math.hypot(td[0], td[1]) || 1;
  const tuft = limbPoly([te, [te[0] + (td[0] / tl) * 8, te[1] + (td[1] / tl) * 8], [te[0] + (td[0] / tl) * 17, te[1] + (td[1] / tl) * 17]], [[0, 2.6], [0.45, 7], [1, 1.5]], 4);
  parts.push({ k: 'limb', g: farFore, role: 'leg' }, { k: 'limb', g: farHind, role: 'leg' }, { k: 'poly', g: hoof(farFore), role: 'hoof' }, { k: 'poly', g: hoof(farHind), role: 'hoof' });
  parts.push({ k: 'limb', g: tail, role: 'tail' }, { k: 'limb', g: tuft, role: 'tuft' });
  const body = COW_BODY.map((p) => [p[0], p[1] + (p[0] > 5 && p[0] < 40 && p[1] < -90 ? -cw.hump : 0)]);
  parts.push({ k: 'cr', g: body, role: 'body' });
  if (cw.udder) {
    const ud = [[103, -48], [110, -40], [117, -39], [123, -47]];
    parts.push({ k: 'cr', g: ud, role: 'body' });
  }
  // neck + head
  const NK = NECKS[st.head];
  const d = [Math.cos(NK.th), Math.sin(NK.th)];
  const xf = headXf(NK.B, NK.th, NK.mirror);
  const neck = limbPoly([NK.A, NK.M, [NK.B[0] - d[0] * 9, NK.B[1] - d[1] * 9], [NK.B[0] + d[0] * 8, NK.B[1] + d[1] * 8]], [[0, 50], [0.55, 34], [1, 25]], 6);
  parts.push({ k: 'limb', g: neck, role: 'neck' });
  if (st.head === 'back') parts.push({ k: 'cr', g: [[4, -97], [16, -114], [34, -125], [52, -122], [64, -108], [62, -96], [30, -94]], role: 'neck' });
  const head = COW_HEAD.map(xf);
  parts.push({ k: 'cr', g: head, role: 'head' });
  parts.push({ k: 'cr', g: COW_EAR.map(xf), role: 'ear' });
  parts.push({ k: 'limb', g: nearFore, role: 'leg' }, { k: 'limb', g: nearHind, role: 'leg' }, { k: 'poly', g: hoof(nearFore), role: 'hoof' }, { k: 'poly', g: hoof(nearHind), role: 'hoof' });
  // horns: a frontal lyre on the profile head (twisted perspective)
  const [hl, hs, ht] = cw.horn;
  const root = [8, -13];
  const ax = [-0.22, -1], an = Math.hypot(ax[0], ax[1]);
  const axis = [ax[0] / an, ax[1] / an], lat = [-axis[1], axis[0]];
  const F = ht === 'wide' ? [0.08, 0.62, 0.95, 1.12, 1.18] : ht === 'fwd' ? [0.05, 0.5, 0.8, 0.7, 0.45] : [0.06, 0.62, 0.98, 0.78, 0.98];
  const T = [0, 0.22, 0.48, 0.74, 1];
  for (const side of [-1, 1]) {
    const pts = T.map((t, k) => {
      const al = hl * t * (ht === 'wide' ? 0.82 : 1);
      const lt = hs * F[k] * side;
      return xf([root[0] + axis[0] * al + lat[0] * lt, root[1] + axis[1] * al + lat[1] * lt]);
    });
    parts.push({ k: 'limb', g: limbPoly(pts, [[0, 8.5], [0.45, 5], [1, 1.3]], 6), role: 'horn' });
  }
  return { parts, head, body, xf };
}

function drawCow(x, cw, st) {
  const H = HIDES[cw.hide];
  const { parts, head, body, xf } = cowGeometry(cw, st);
  x.save();
  x.translate(cw.x, cw.y);
  x.scale(cw.s, cw.s);
  const path = (p) => { x.beginPath(); if (p.k === 'limb') limbPath(x, p.g); else if (p.k === 'cr') pathCR(x, p.g); else polyPath(x, p.g); };
  if (H.outline) {
    x.strokeStyle = H.outline; x.lineWidth = 3.4 / cw.s * 1.1; x.lineJoin = 'round';
    for (const p of parts) if (p.role !== 'horn') { path(p); x.stroke(); }
  }
  for (const p of parts) {
    if (p.role === 'horn') continue;
    x.fillStyle = p.role === 'hoof' ? H.horn : H.body;
    path(p); x.fill();
  }
  // hide patches, clipped to the animal
  x.save();
  x.beginPath();
  for (const p of parts) if (p.role === 'body' || p.role === 'neck' || p.role === 'head' || p.role === 'leg') { if (p.k === 'limb') limbPath(x, p.g); else if (p.k === 'cr') pathCR(x, p.g); else polyPath(x, p.g); }
  x.clip();
  x.fillStyle = H.patch;
  const R = rng(`${ID}-hide-${cw.id}`);
  for (const pt of cw.patches) { x.beginPath(); pathCR(x, blob(R, pt[0], pt[1], pt[2], pt[3], pt[4] || 0, 9, 0.3)); x.fill(); }
  if (cw.blaze) { x.beginPath(); pathCR(x, [[30, -8], [44, -4], [30, 3], [16, -3]].map(xf)); x.fill(); }
  if (cw.socks) { x.fillRect(-20, -22, 200, 30); }
  x.restore();
  // horns + eye on top
  x.fillStyle = H.horn;
  for (const p of parts) if (p.role === 'horn') { x.beginPath(); limbPath(x, p.g); x.fill(); }
  const e = xf([14, -4]);
  x.fillStyle = cw.hide === 'white' || cw.hide === 'yellow' ? H.outline : C.white;
  x.beginPath(); x.arc(e[0], e[1], 2.2, 0, Math.PI * 2); x.fill();
  x.restore();
}

// ------------------------------------------------------------------ people
const MAN = {
  head: [-2, -149], neck: [0, -139], sh: [1, -131], hip: [2, -88],
  legs: {
    stand: [[[-2, -47], [0, -7], [-11, -1]], [[4, -47], [6, -7], [-5, -1]]],
    walkA: [[[-13, -50], [-20, -7], [-31, -1]], [[8, -46], [17, -9], [8, 0]]],
    walkB: [[[8, -46], [17, -9], [8, 0]], [[-13, -50], [-20, -7], [-31, -1]]],
    apart: [[[-9, -47], [-11, -7], [-22, -1]], [[9, -47], [12, -7], [1, -1]]],
  },
  arms: {
    down: [[[-3, -106], [-4, -83]], [[5, -106], [7, -83]]],
    swingA: [[[6, -107], [14, -86]], [[-7, -107], [-15, -87]]],
    swingB: [[[-7, -107], [-15, -87]], [[6, -107], [14, -86]]],
    orant: [[[-23, -140], [-27, -167]], [[20, -141], [25, -168]]],
    point: [[[-19, -137], [-38, -149]], [[5, -106], [7, -83]]],
    pointFar: [[[-21, -129], [-42, -131]], [[5, -106], [7, -83]]],
    clasp: [[[-12, -112], [-9, -139]], [[-3, -113], [-5, -141]]],
    staff: [[[-9, -109], [-17, -117]], [[5, -106], [7, -83]]],
    staffW: [[[-10, -108], [-19, -114]], [[6, -107], [14, -86]]],
  },
};
const POSES = {   // pose → [legs, arms]
  walkA: ['walkA', 'swingA'], walkB: ['walkB', 'swingB'], stand: ['stand', 'down'], orant: ['apart', 'orant'],
  point: ['apart', 'point'], pointFar: ['apart', 'pointFar'], clasp: ['stand', 'clasp'], look: ['stand', 'down'],
};

function drawHuman(x, hm, pose, faceRight) {
  const [lk, ak] = POSES[pose];
  let arms = MAN.arms[ak];
  if (hm.prop === 'staff') arms = [(pose === 'walkA' || pose === 'walkB' ? MAN.arms.staffW : MAN.arms.staff)[0], arms[1]];
  const legs = MAN.legs[lk];
  const body = hm.body || C.red;
  const child = hm.kind === 'child';
  x.save();
  x.translate(hm.x, hm.y);
  x.scale(hm.s * (faceRight ? -1 : 1), hm.s);
  const fillL = (L, c) => { x.fillStyle = c; x.beginPath(); limbPath(x, L); x.fill(); };
  const legL = (L) => limbPoly([MAN.hip, ...L.slice(0, 2)], [[0, child ? 12 : 12], [0.3, 9], [0.47, 6.4], [0.6, 8], [0.8, 5.2], [1, 3.8]], 6);
  const footL = (L) => limbPoly([L[1], L[2]], [[0, 4], [1, 1.8]], 3);
  const armL = (A) => limbPoly([MAN.sh, ...A], [[0, 7], [0.3, 5.6], [0.5, 4.4], [0.7, 4.6], [1, 3.2]], 6);
  // far side
  fillL(armL(arms[1]), body);
  fillL(legL(legs[1]), body); fillL(footL(legs[1]), body);
  // torso
  x.fillStyle = body;
  x.beginPath();
  pathCR(x, [[-8.5, -134], [-11.5, -124], [-7, -111], [-3.4, -101], [-6, -91], [8.5, -87], [10, -96], [4.5, -104], [6.5, -118], [9, -129], [6.5, -136]]);
  x.fill();
  // garment
  if (hm.kind === 'woman') {
    const sway = pose === 'walkA' ? -4 : pose === 'walkB' ? 4 : 0;
    x.fillStyle = hm.skirt;
    x.beginPath(); pathCR(x, [[-5, -103], [-11, -60], [-17 + sway, -12], [0 + sway, -9], [19 + sway, -11], [12, -60], [6, -104]]); x.fill();
    x.strokeStyle = body; x.lineWidth = 2;
    for (const yy of [-70, -46, -24]) { x.beginPath(); x.moveTo(-13 + sway * (yy + 103) / 92, yy); x.lineTo(15 + sway * (yy + 103) / 92, yy + 1); x.stroke(); }
  } else {
    x.fillStyle = body;
    if (!child) { x.beginPath(); pathCR(x, [[-4.5, -102], [-11, -79], [-1, -75], [13, -77], [6, -104]]); x.fill(); }
    if (hm.kind === 'man') { x.strokeStyle = body; x.lineWidth = 2.2; x.beginPath(); x.moveTo(8, -94); x.quadraticCurveTo(16, -80, 14, -62); x.stroke(); }
    x.strokeStyle = C.white; x.lineWidth = 2.2;                      // kaolin belt
    x.beginPath(); x.moveTo(-4.8, -100.5); x.lineTo(6.2, -102); x.stroke();
  }
  // props held in the far hand: bow
  if (hm.prop === 'bow') {
    const wr = arms[1][1];
    const up = pose === 'orant';
    const bx = wr[0] + (up ? 6 : 0), by = wr[1] - (up ? 8 : 0), bulge = up ? 17 : -17;   // held aloft: bow bellies outward
    const c0 = [bx, by - 34], c1 = [bx, by + 28];
    x.strokeStyle = C.black; x.lineWidth = 3.4;
    x.beginPath(); x.moveTo(c0[0], c0[1]); x.bezierCurveTo(bx + bulge, by - 22, bx + bulge, by + 18, c1[0], c1[1]); x.stroke();
    x.lineWidth = 1.3; x.beginPath(); x.moveTo(c0[0], c0[1]); x.lineTo(c1[0], c1[1]); x.stroke();
  }
  // head + neck
  const hr = child ? 1.3 : 1;
  fillL(limbPoly([MAN.neck, [MAN.head[0] + 1, MAN.head[1] + 4]], [[0, 5.2], [1, 4.6]], 2), body);
  x.fillStyle = body;
  x.beginPath(); x.ellipse(MAN.head[0], MAN.head[1] - (hr - 1) * 6, 7 * hr, 8.4 * hr, -0.15, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(-8 * hr, MAN.head[1] - 2); x.lineTo(-11.5 * hr, MAN.head[1] + 1.5); x.lineTo(-7 * hr, MAN.head[1] + 3.5); x.fill();   // nose
  if (hm.hair === 'feather') { x.strokeStyle = body; x.lineWidth = 2.4; x.beginPath(); x.moveTo(3, -156); x.quadraticCurveTo(10, -168, 20, -170); x.stroke(); x.beginPath(); x.ellipse(5, -155, 5, 4, 0.4, 0, Math.PI * 2); x.fill(); }
  if (hm.hair === 'cap') { x.beginPath(); pathCR(x, [[-7, -154], [0, -162], [9, -158], [8, -150]]); x.fill(); }
  if (hm.kind === 'woman') { x.beginPath(); pathCR(x, [[-2, -158], [8, -156], [13, -138], [10, -122], [5, -134], [3, -146]]); x.fill(); }
  if (child) { x.beginPath(); x.arc(4, -162, 4.5, 0, Math.PI * 2); x.fill(); }
  // near side
  fillL(legL(legs[0]), body); fillL(footL(legs[0]), body);
  fillL(armL(arms[0]), body);
  if (!child) {   // kaolin armlet on the near upper arm
    const el = arms[0][0], m = [lerp(MAN.sh[0], el[0], 0.55), lerp(MAN.sh[1], el[1], 0.55)];
    const dx = el[0] - MAN.sh[0], dy = el[1] - MAN.sh[1], L = Math.hypot(dx, dy);
    x.strokeStyle = C.white; x.lineWidth = 1.8;
    x.beginPath(); x.moveTo(m[0] - (dy / L) * 3.2, m[1] + (dx / L) * 3.2); x.lineTo(m[0] + (dy / L) * 3.2, m[1] - (dx / L) * 3.2); x.stroke();
  }
  const wr = arms[0][1];
  if (ak === 'point' || ak === 'pointFar') {
    const el = arms[0][0], dx = wr[0] - el[0], dy = wr[1] - el[1], L = Math.hypot(dx, dy);
    x.strokeStyle = body; x.lineWidth = 2;
    x.beginPath(); x.moveTo(wr[0], wr[1]); x.lineTo(wr[0] + (dx / L) * 9, wr[1] + (dy / L) * 9); x.stroke();
  }
  if (ak === 'orant') {   // open hands, fingers splayed
    x.strokeStyle = body; x.lineWidth = 1.6;
    for (const A of arms) for (const f of [-0.5, 0, 0.5]) { const w2 = A[1]; x.beginPath(); x.moveTo(w2[0], w2[1]); x.lineTo(w2[0] + Math.sin(f) * 8, w2[1] - Math.cos(f) * 8); x.stroke(); }
  }
  if (hm.prop === 'staff') {
    x.strokeStyle = C.dark; x.lineWidth = 2.6;
    const h0 = arms[0][1];
    x.beginPath(); x.moveTo(h0[0] - 6, 0); x.lineTo(h0[0] + 2, -176); x.stroke();
  }
  x.restore();
}

// ------------------------------------------------------------------ dog
function drawDog(x, dg, pose, faceRight) {
  x.save();
  x.translate(dg.x, dg.y);
  x.scale(dg.s * (faceRight ? -1 : 1), dg.s);
  const col = C.red2;
  const F = (L) => { x.fillStyle = col; x.beginPath(); limbPath(x, L); x.fill(); };
  const sit = pose === 'sitA' || pose === 'sitB';
  if (!sit) {
    const sw = pose === 'trotA' ? [0.32, -0.28, -0.3, 0.3] : pose === 'trotB' ? [-0.28, 0.32, 0.3, -0.3] : [0.04, -0.04, 0, 0.04];
    const leg = (top, joints, W, a) => { let p = [top, ...joints].map((q) => rotAbout(q, top, a)); const dy = -p[p.length - 1][1]; p = p.map((q) => [q[0], q[1] + dy]); return limbPoly(p, W, 4); };
    F(leg([14, -28], [[16, -13], [15, 0]], [[0, 6], [1, 2.8]], sw[1]));
    F(leg([50, -32], [[57, -15], [53, 0]], [[0, 9], [0.5, 4], [1, 2.8]], sw[3]));
    x.fillStyle = col; x.beginPath();
    pathCR(x, [[0, -41], [16, -44], [40, -42], [58, -43], [66, -38], [64, -31], [55, -28], [44, -28], [30, -25], [14, -23], [2, -27], [-4, -34]]);
    x.fill();
    const tail = pose === 'alert' ? [[63, -41], [74, -54], [70, -68], [62, -66], [62, -58]] : [[63, -41], [73, -50], [71, -61], [63, -61], [61, -54]];
    F(limbPoly(tail, [[0, 4.2], [1, 2]], 5));
    const hy = pose === 'alert' ? -8 : 0;
    F(limbPoly([[2, -38], [-4, -48 + hy * 0.5], [-8, -55 + hy]], [[0, 12], [1, 7.5]], 4));
    x.beginPath(); x.ellipse(-9, -56 + hy, 7.5, 6, -0.2, 0, Math.PI * 2); x.fill();
    F(limbPoly([[-12, -56 + hy], [-27, -51 + hy]], [[0, 6.5], [1, 2.6]], 2));
    x.beginPath(); x.moveTo(-9, -60 + hy); x.lineTo(-7, -75 + hy); x.lineTo(-3, -60 + hy); x.fill();
    x.beginPath(); x.moveTo(-5, -60 + hy); x.lineTo(-1, -73 + hy); x.lineTo(1, -58 + hy); x.fill();
    F(leg([8, -28], [[7, -13], [5, 0]], [[0, 6.5], [1, 2.8]], sw[0]));
    F(leg([56, -32], [[64, -15], [60, 0]], [[0, 10], [0.5, 4.2], [1, 2.8]], sw[2]));
  } else {
    F(limbPoly([[12, -30], [13, -14], [12, 0]], [[0, 6], [1, 2.8]], 3));
    x.fillStyle = col; x.beginPath();
    pathCR(x, [[-2, -47], [12, -50], [28, -40], [44, -26], [56, -14], [60, -5], [52, -1], [38, -3], [22, -14], [10, -26], [0, -33]]);
    x.fill();
    x.beginPath(); x.ellipse(46, -10, 13, 9, -0.5, 0, Math.PI * 2); x.fill();
    F(limbPoly([[40, -2], [26, 0]], [[0, 4.5], [1, 2.4]], 2));
    const tail = pose === 'sitA' ? [[58, -10], [68, -20], [72, -33], [66, -38]] : [[58, -8], [70, -5], [83, -6]];
    F(limbPoly(tail, [[0, 4], [1, 2]], 5));
    F(limbPoly([[2, -44], [-3, -55], [-6, -64]], [[0, 12], [1, 7.5]], 4));
    x.beginPath(); x.ellipse(-7, -66, 7.5, 6, -0.25, 0, Math.PI * 2); x.fill();
    F(limbPoly([[-10, -66], [-25, -62]], [[0, 6.5], [1, 2.6]], 2));
    x.beginPath(); x.moveTo(-7, -70); x.lineTo(-5, -85); x.lineTo(-1, -70); x.fill();
    x.beginPath(); x.moveTo(-3, -70); x.lineTo(1, -83); x.lineTo(3, -68); x.fill();
    F(limbPoly([[6, -30], [5, -14], [4, 0]], [[0, 6.5], [1, 2.8]], 3));
  }
  x.restore();
}

// ------------------------------------------------------------------ cast + states
const COWS = [ // back row first (drawn first), then front row; rows staggered like a Tassili herd
  { id: 'c2', x: 436, y: 408, s: 1.0, hide: 'white', horn: [42, 21, 'lyre'], hump: 0, udder: true, phase: 1, patches: [[92, -78, 30, 16, 0.1], [36, -86, 15, 10], [140, -70, 11, 15]] },
  { id: 'c4', x: 640, y: 406, s: 1.02, hide: 'yellow', horn: [34, 23, 'wide'], hump: 0, udder: true, phase: 3, patches: [[60, -78, 24, 16, 0.3], [128, -72, 14, 18]] },
  { id: 'c6', x: 842, y: 408, s: 1.0, hide: 'dark', horn: [46, 19, 'lyre'], hump: 2, udder: false, phase: 2, patches: [[82, -50, 44, 7]] },
  { id: 'c1', x: 336, y: 461, s: 1.2, hide: 'pie', horn: [42, 21, 'lyre'], hump: 0, udder: true, phase: 0, lead: true, patches: [[72, -74, 28, 18, 0.25], [130, -82, 16, 13], [26, -62, 13, 9]], blaze: true, socks: true },
  { id: 'c3', x: 548, y: 462, s: 1.25, hide: 'red', horn: [48, 22, 'lyre'], hump: 5, udder: false, phase: 2, patches: [[104, -58, 15, 8, -0.2]] },
  { id: 'c5', x: 758, y: 461, s: 1.2, hide: 'pie', horn: [38, 22, 'fwd'], hump: 0, udder: true, phase: 1, tailUp: true, patches: [[84, -76, 40, 21, 0.1], [20, -78, 12, 14]], blaze: true },
];
const PEOPLE = [
  { id: 'staff', kind: 'man', x: 972, y: 462, s: 1.1, prop: 'staff', hair: 'cap', body: C.dark, phase: 1 },
  { id: 'lead', kind: 'man', x: 768, y: 800, s: 1.25, prop: 'bow', hair: 'feather', body: C.red, phase: 0 },
  { id: 'woman', kind: 'woman', x: 878, y: 800, s: 1.2, skirt: C.yellow, body: C.red2, phase: 1 },
  { id: 'child', kind: 'child', x: 196, y: 800, s: 0.78, body: C.red, phase: 1 },
];
const DOG = { id: 'dog', x: 64, y: 800, s: 1.35 };

const beatQ = (u) => Math.floor(Math.max(-8, Math.min(14, u)) * 2 + 1e-6) / 2;
const passBeat = (fx) => { for (let q = 0; q <= 8; q += 0.5) if (birdHeadX(q) > fx) return q; return 99; };
const rnd = (...k) => { let h = 2166136261; const s = k.join('|'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };

function cowState(cw, u) {
  const q = beatQ(u), b = Math.round(q * 2);
  const bl = Math.min(b, 3);
  const legs = Math.floor((bl + cw.phase) / 2) % 2 === 0 ? 'A' : 'B';
  let head, tail = 'hang';
  const eyeX = cw.x - 26 * cw.s;
  if (q < 2) {
    const slot = Math.floor((b + 40 + cw.phase) / 2);
    head = rnd(ID, 'graze', cw.id, slot) < 0.64 ? 'graze' : 'walk';
    if (q >= 1.5) head = 'graze';
    if (cw.lead && q >= 1) head = birdHeadX(q) > eyeX ? 'back' : 'up';
    if (q < 1 && rnd(ID, 'flick', cw.id, b) < 0.16) tail = 'flick';
  } else {
    head = q >= 6 || birdHeadX(q) > eyeX ? 'back' : 'up';
    if (cw.tailUp && q >= 3.5 && q < 4.5) tail = 'up';
    else if (q >= 7 && rnd(ID, 'flick2', cw.id, b) < 0.14) tail = 'flick';
  }
  return { head, tail, legs: q >= 2 ? (Math.floor((3 + cw.phase) / 2) % 2 === 0 ? 'A' : 'B') : legs };
}
function personState(hm, u) {
  const q = beatQ(u), b = Math.round(q * 2);
  const walk = (b + hm.phase) % 2 === 0 ? 'walkA' : 'walkB';
  if (q < 2) return { pose: walk, R: false };
  const pass = passBeat(hm.x);
  switch (hm.id) {
    case 'child': return { pose: q < 3 ? 'look' : q < 4.5 ? 'point' : 'pointFar', R: true };
    case 'lead':
      if (q < 3.5) return { pose: 'stand', R: false };
      if (q < pass) return { pose: 'orant', R: false };
      return { pose: q < 6 ? 'orant' : 'stand', R: true };
    case 'woman': return q < pass ? { pose: 'clasp', R: false } : { pose: q < 6.5 ? 'clasp' : 'stand', R: true };
    default: return { pose: 'stand', R: q >= pass };
  }
}
function dogState(u) {
  const q = beatQ(u), b = Math.round(q * 2);
  if (q < 2) return { pose: b % 2 === 0 ? 'trotA' : 'trotB', R: false };
  if (q < 3) return { pose: 'alert', R: true };
  if (q < 6) return { pose: 'sitA', R: true };
  return { pose: b % 2 === 0 ? 'sitA' : 'sitB', R: true };
}

// figure list in draw order; key(u) → sprite key, draw(ctx, key)
const FIGS = [
  ...COWS.map((cw) => ({ id: cw.id, region: [cw.x - 80 * cw.s, cw.y - 190 * cw.s, cw.x + 200 * cw.s, cw.y + 4], key: (u) => { const s = cowState(cw, u); return `${cw.id}:${s.head}:${s.tail}:${s.legs}`; }, draw: (x, key) => { const [, head, tail, legs] = key.split(':'); drawCow(x, cw, { head, tail, legs }); } })),
  ...PEOPLE.map((hm) => ({ id: hm.id, region: [hm.x - 60 * hm.s, hm.y - 220 * hm.s, hm.x + 60 * hm.s, hm.y + 4], key: (u) => { const s = personState(hm, u); return `${hm.id}:${s.pose}:${s.R ? 'R' : 'L'}`; }, draw: (x, key) => { const [, pose, f] = key.split(':'); drawHuman(x, hm, pose, f === 'R'); } })),
  { id: 'dog', region: [DOG.x - 45 * DOG.s, DOG.y - 95 * DOG.s, DOG.x + 95 * DOG.s, DOG.y + 4], key: (u) => { const s = dogState(u); return `dog:${s.pose}:${s.R ? 'R' : 'L'}`; }, draw: (x, key) => { const [, pose, f] = key.split(':'); drawDog(x, DOG, pose, f === 'R'); } },
];

// ------------------------------------------------------------------ ghosts, title, handprint (baked into the wall)
function drawGhosts(x) {
  // the older "Round Head" layer: massive floating figures, faded kaolin under the herd
  const fig = (cx, cy, s, rot, arms, seed) => {
    const R = rng(`${ID}-ghost-${seed}`);
    x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
    x.fillStyle = '#ede0c6';
    x.beginPath(); pathCR(x, blob(R, 0, -152, 36, 34, 0, 10, 0.06)); x.fill();
    x.beginPath(); pathCR(x, [[-44, -110], [0, -120], [44, -110], [30, -50], [34, -4], [0, 6], [-34, -4], [-30, -50]]); x.fill();
    const L = (pts, w) => { x.beginPath(); limbPath(x, limbPoly(pts, w, 6)); x.fill(); };
    if (arms === 'up') { L([[-38, -106], [-86, -124], [-96, -178]], [[0, 22], [1, 12]]); L([[38, -106], [86, -126], [98, -180]], [[0, 22], [1, 12]]); }
    else { L([[-38, -106], [-76, -72], [-50, -40]], [[0, 20], [1, 12]]); L([[38, -106], [76, -72], [50, -40]], [[0, 20], [1, 12]]); }
    L([[-20, -6], [-48, 54], [-38, 116]], [[0, 28], [1, 13]]);
    L([[20, -6], [54, 50], [46, 112]], [[0, 28], [1, 13]]);
    x.globalAlpha = 0.5; x.strokeStyle = C.red; x.lineWidth = 3;   // remnants of a red contour
    x.beginPath(); pathCR(x, blob(R, 0, -152, 37, 35, 0, 10, 0.06)); x.stroke();
    x.globalAlpha = 1;
    x.restore();
  };
  fig(640, 262, 1.12, 0.05, 'up', 1);
  fig(896, 182, 0.58, -0.1, 'akimbo', 2);
  fig(118, 486, 0.82, 0.22, 'up', 3);
}

/**
 * Finger-painted lettering: each glyph is used only as a mask, then re-painted as
 * overlapping round pigment dabs with jitter and a few dry gaps — the way ochre
 * applied with a fingertip looks (the erosion pass then sinks it into the rock).
 */
function fingerText(x, K, R, text, x0, cy, size, color, o = {}) {
  const font = o.font || '"Yuanti SC", "PingFang SC", sans-serif';
  const step = o.step ?? 2.1, rMin = o.rMin ?? 1.8, rVar = o.rVar ?? 1.5, jit = o.jit ?? 1.3, drop = o.drop ?? 0.07;
  let cx = x0;
  x.fillStyle = color;
  for (const ch of text) {
    if (ch === ' ') { cx += size * 0.28; continue; }
    const sp = K.textSprite({ text: ch, font, weight: o.weight ?? 700, size: 120, color: '#000' });
    const src = sp.g.canvas || sp.g.elt;
    const sc = (size / 120) * (1 + (R() - 0.5) * 0.08);
    const mw = Math.ceil(sp.w * sc), mh = Math.ceil(sp.h * sc);
    const m = document.createElement('canvas'); m.width = mw; m.height = mh;
    const mc = m.getContext('2d'); mc.drawImage(src, 0, 0, mw, mh);
    const data = mc.getImageData(0, 0, mw, mh).data;
    const tilt = (R() - 0.5) * 0.08, lift = (R() - 0.5) * size * 0.08;
    const ox = cx - sp.pad * sc, oy = cy - mh / 2 + lift;
    for (let yy = 0; yy < mh; yy += step) {
      for (let xx = 0; xx < mw; xx += step) {
        if (data[((yy | 0) * mw + (xx | 0)) * 4 + 3] < 120 || R() < drop) continue;
        const px = ox + xx + (R() - 0.5) * jit + (yy - mh / 2) * tilt;
        const py = oy + yy + (R() - 0.5) * jit;
        x.globalAlpha = 0.82 + R() * 0.18;
        x.beginPath(); x.arc(px, py, rMin + R() * rVar, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalAlpha = 1;
    const cjk = ch.charCodeAt(0) > 255;
    cx += (sp.w - 2 * sp.pad) * sc * (cjk ? 1.05 : 1.0) + (cjk ? 3 : 1);
  }
  return cx;
}

function drawTitle(x, K) {
  const R = rng(`${ID}-title`);
  fingerText(x, K, R, '撒哈拉岩画', 52, 84, 76, C.red, { weight: 500, step: 1.7, rMin: 1.7, rVar: 1.1, jit: 1.1, drop: 0.06 });
  fingerText(x, K, R, '约公元前 4000 年', 56, 152, 38, C.red2, { weight: 500, step: 1.3, rMin: 1.15, rVar: 0.7, jit: 0.7 });
}

function drawTitleEn(x, K) {
  const R = rng(`${ID}-title-en`);
  fingerText(x, K, R, 'SAHARAN ROCK ART · c. 4000 BCE', 56, 198, 27, C.white,
    { font: 'Optima, "Avenir Next", "Gill Sans", sans-serif', step: 1.1, rMin: 0.8, rVar: 0.6, jit: 0.6, drop: 0.05 });
}

function drawHand(x) {
  x.save();
  x.translate(532, 92); x.rotate(-0.22);
  x.fillStyle = C.red;
  x.beginPath(); pathCR(x, [[-19, -6], [-6, -16], [12, -14], [21, -2], [19, 22], [8, 34], [-10, 33], [-20, 18]]); x.fill();
  const finger = (bx, by, ang, len, w) => { const tip = [bx + Math.sin(ang) * len, by - Math.cos(ang) * len]; x.beginPath(); limbPath(x, limbPoly([[bx, by], tip], [[0, w], [1, w * 0.86]], 2)); x.fill(); };
  finger(-15, -6, -0.28, 30, 9.5);
  finger(-5, -12, -0.08, 37, 10);
  finger(6, -12, 0.08, 34, 9.8);
  finger(15, -6, 0.26, 27, 8.6);
  finger(19, 16, 1.05, 27, 10.5);   // thumb
  x.restore();
}

// ------------------------------------------------------------------ pelican (live, same pigments)
const RS = { // role → [fill, stroke, width]
  legFar: [C.red, null], footFar: [C.red, null], crankFar: [null, '#5a1e12', 3.2],
  tire: [null, C.bike, 4.6], rim: [null, C.bike, 2.0], spoke: [null, C.bike, 1.5], hub: ['#4a1a10', null],
  chain: [null, C.bike, 1.4], frame: [null, C.bike, 3.9], fork: [null, C.bike, 3.6], stem: [null, C.bike, 3.2], bars: [null, C.bike, 3.2],
  seatpost: [null, C.bike, 3.2], saddle: [null, '#5a1e12', 6], ring: [null, C.bike, 2.2],
  tail: [C.red, null], body: [C.red, null], wing: [C.white, C.red, 1.7], secondaries: [null, C.black, 3.2], primary: [null, C.black, 4.4],
  neck: [C.red, null], head: [C.red, null], crest: [null, C.red, 2.4], pouch: [C.yellow, null], bill: [C.yellow, null],
  nail: [C.black, null], face: [null, null], eye: [C.white, null], pupil: [C.black, null], eyeShut: [null, C.black, 1.6],
  leg: [C.red, null], foot: [C.red, null], crank: [null, '#5a1e12', 3.4], pedal: [null, '#5a1e12', 4.2],
};
const BREAST = [[1, 0], [0.8, 0.62], [0.2, 1.05], [-0.5, 0.86], [-1, 0.3], [-0.9, -0.42], [-0.3, -0.95], [0.45, -0.8]];

function paintPelican(x, P, parts) {
  const B = P.bird;
  let bodyPoly = null, neckPoly = null;
  for (const part of parts) {
    const st = RS[part.role] || [C.red, null];
    if (part.kind === 'circle') {
      const rr = part.role === 'rim' ? part.r * 0.94 : part.role === 'eye' ? part.r * 0.9 : part.role === 'pupil' ? part.r * 0.8 : part.r;
      x.beginPath(); x.arc(part.c[0], part.c[1], rr, 0, Math.PI * 2);
      if (st[0]) { x.fillStyle = st[0]; x.fill(); }
      if (st[1]) { x.strokeStyle = st[1]; x.lineWidth = st[2]; x.stroke(); }
    } else if (part.kind === 'poly') {
      x.beginPath(); polyPath(x, part.pts);
      if (st[0]) { x.fillStyle = st[0]; x.fill(); }
      if (st[1]) { x.strokeStyle = st[1]; x.lineWidth = st[2]; x.stroke(); }
      if (part.role === 'body') bodyPoly = part.pts;
      if (part.role === 'neck') {
        neckPoly = part.pts;
        // piebald breast patch, kaolin white, clipped to body + neck
        x.save(); x.beginPath(); polyPath(x, bodyPoly || part.pts); polyPath(x, part.pts); x.clip();
        const n0 = B.neckSpine[0], n1 = B.neckSpine[Math.floor(B.neckSpine.length * 0.45)];
        const c = [lerp(B.bodyC[0], n0[0], 0.72) + 4, lerp(B.bodyC[1], n0[1], 0.72) + 12];
        const ang = Math.atan2(n1[1] - c[1], n1[0] - c[0]);
        x.fillStyle = C.white; x.beginPath();
        pathCR(x, BREAST.map(([a, bb]) => { const px = a * 34, py = bb * 15; return [c[0] + px * Math.cos(ang) - py * Math.sin(ang), c[1] + px * Math.sin(ang) + py * Math.cos(ang)]; }));
        x.fill();
        x.restore();
      }
      if (part.role === 'bill') { x.strokeStyle = C.red; x.lineWidth = 1.5; x.beginPath(); x.moveTo(B.lowerJawLine[0][0], B.lowerJawLine[0][1]); x.lineTo(B.lowerJawLine[1][0], B.lowerJawLine[1][1]); x.stroke(); }
    } else {
      x.strokeStyle = st[1] || C.red; x.lineWidth = st[2] || 2;
      if (part.role === 'chain') x.setLineDash([2.2, 3.2]);
      x.beginPath(); x.moveTo(part.pts[0][0], part.pts[0][1]);
      for (let k = 1; k < part.pts.length; k++) x.lineTo(part.pts[k][0], part.pts[k][1]);
      x.stroke();
      if (part.role === 'chain') x.setLineDash([]);
    }
  }
  void neckPoly;
}

let PEL = null;   // live buffers
function pelicanBuffers() {
  if (PEL) return PEL;
  const PW = 640, PH = 560;
  const cA = mkCanvas(PW, PH), cB = mkCanvas(PW, PH);
  const img = createImage(PW, PH);
  PEL = { PW, PH, cA, xA: ctx2d(cA), cB, xB: ctx2d(cB), img, out: new ImageData(PW, PH) };
  return PEL;
}

function drawPelican(K, rider, view) {
  const P = rider.placed;
  const parts = K.rig.parts(P);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const ext = (p, r = 0) => { if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r; if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r; };
  for (const part of parts) { if (part.kind === 'circle') ext(part.c, part.r + 3); else for (const p of part.pts) ext(p, 3); }
  x0 = Math.max(x0 - 6, 0, view.x0 - 4); y0 = Math.max(y0 - 6, 0); x1 = Math.min(x1 + 6, 1000, view.x1 + 4); y1 = Math.min(y1 + 6, 1000);
  if (x1 <= x0 || y1 <= y0) return;
  const B = pelicanBuffers();
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(B.PW, Math.ceil(x1 * S) - i0), h = Math.min(B.PH, Math.ceil(y1 * S) - j0);
  const { xA, xB, cA } = B;
  xA.setTransform(1, 0, 0, 1, 0, 0); xA.clearRect(0, 0, B.PW, B.PH);
  xA.setTransform(S, 0, 0, S, -i0, -j0);
  xA.lineCap = 'round'; xA.lineJoin = 'round';
  paintPelican(xA, P, parts);
  xB.setTransform(1, 0, 0, 1, 0, 0); xB.clearRect(0, 0, B.PW, B.PH);
  xB.filter = 'blur(1.4px)'; xB.drawImage(cA, 0, 0); xB.filter = 'none';
  const dA = xA.getImageData(0, 0, w, h).data, dB = xB.getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  erode(dA, dB, w, h, i0, j0, P_RIDER, out.data, true);
  const ic = B.img.drawingContext;
  ic.clearRect(0, 0, B.PW, B.PH);
  ic.putImageData(out, 0, 0);
  B.img.setModified(true);
  image(B.img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

// ------------------------------------------------------------------ init: bake wall + sprite atlas
let BUILT = null;

function buildAll(K) {
  buildFields();
  // older layer: faint white Round-Head figures
  paintWall([0, 0, 1000, 800], drawGhosts, 3.5, P_GHOST);
  // the "later inscription": title + handprint
  paintWall([20, 30, 600, 200], (x) => drawTitle(x, K), 2.2, P_TITLE);
  paintWall([20, 170, 620, 230], (x) => drawTitleEn(x, K), 1.5, P_TITLE_W);
  paintWall([470, 36, 600, 175], drawHand, 2.4, P_HAND);
  const wallPx = finishWall();

  // sprites for every painted state used in the visibility window
  const sprites = [];
  for (const f of FIGS) {
    const keys = new Set();
    for (let b = -18; b <= 30; b++) keys.add(f.key(b / 2));
    for (const key of keys) {
      const r = rasterize(f.region, (x) => f.draw(x, key), 1.6);
      const out = new Uint8ClampedArray(r.w * r.h * 4);
      erode(r.dA, r.dB, r.w, r.h, r.i0, r.j0, P_FIG, out, true);
      // trim to the painted pixels
      let a0 = r.w, a1 = -1, b0 = r.h, b1 = -1;
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (out[(j * r.w + i) * 4 + 3] > 2) { if (i < a0) a0 = i; if (i > a1) a1 = i; if (j < b0) b0 = j; if (j > b1) b1 = j; }
      if (a1 < 0) continue;
      const tw = a1 - a0 + 1, th = b1 - b0 + 1;
      const px = new Uint8ClampedArray(tw * th * 4);
      for (let j = 0; j < th; j++) px.set(out.subarray(((j + b0) * r.w + a0) * 4, ((j + b0) * r.w + a0 + tw) * 4), j * tw * 4);
      sprites.push({ key, fig: f.id, i0: r.i0 + a0, j0: r.j0 + b0, w: tw, h: th, px });
    }
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
  for (const sp of sprites) map.set(sp.key, { x: sp.i0 / S, y: sp.j0 / S, w: sp.w / S, h: sp.h / S, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  const wallCanvas = mkCanvas(N, N);
  ctx2d(wallCanvas).putImageData(new ImageData(wallPx, N, N), 0, 0);
  BUILT = { wallCanvas, atlas, AW, AH, map, nSprites: sprites.length };
}

function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}

// ------------------------------------------------------------------ scene
export default {
  freezeU: 3.6,   // arms raised (3.5), tail up, child pointing, dog sitting, pelican coasting
  ride: RIDE,
  cues: [{ u: 1.0, name: 'cowNotices' }, { u: 2.0, name: 'herdTurns' }, { u: 3.0, name: 'childPoints' }, { u: 3.5, name: 'armsUp' }, { u: 4.0, name: 'rideOn' }],

  async init(K) {
    if (!BUILT) buildAll(K);
    const wi = toImage(BUILT.wallCanvas), ai = toImage(BUILT.atlas);
    this.wall = K.bake('wall', N, N, (K2, w, h) => { image(wi, 0, 0, w, h); });
    this.atlas = K.bake('atlas', BUILT.AW, BUILT.AH, (K2, w, h) => { image(ai, 0, 0, w, h); });
    this.map = BUILT.map;
    this.stats = { sprites: BUILT.nSprites, atlas: [BUILT.AW, BUILT.AH], bakeMB: (N * N * 4 + BUILT.AW * BUILT.AH * 4) / 1048576 };
  },

  mods(u) {
    // "look, no feet!" while coasting through the hold (strictly inside (1, 5))
    const f = 0.75 * K_win(2.45, 3.85, u, 0.3);
    return f > 1e-4 ? { spokes: 8, feetOff: f } : { spokes: 8 };
  },

  render(K, u, ctx) {
    const v = ctx.view;
    imageMode(CORNER);
    image(this.wall, 0, 0, 1000, 1000);
    for (const f of FIGS) {
      const sp = this.map.get(f.key(u));
      if (!sp || sp.x > v.x1 || sp.x + sp.w < v.x0) continue;
      image(this.atlas, sp.x, sp.y, sp.w, sp.h, sp.ax, sp.ay, sp.aw, sp.ah);
    }
    if (ctx.rider.visible) drawPelican(K, ctx.rider, v);
  },
};

function K_win(a, b, x, r) { return sm(a, a + r, x) * (1 - sm(b - r, b, x)); }
