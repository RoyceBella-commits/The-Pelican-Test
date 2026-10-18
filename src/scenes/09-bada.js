// 09 · 八大山人写意 · c. 1690 — xieyi after Zhu Da (八大山人), an original composition.
//
// Vast empty xuan paper. A top-heavy rock rises from the lower left with a white-eyed myna
// perched on one leg; a single bent lotus stem with one drooping leaf at the right; a small
// fish floating in the void; the road is one dry stroke. Everything is painted with a
// Canvas2D bristle-brush model (飞白 dry streaks, ink bleeding into the paper): the picture is
// baked once, the pelican is re-painted every frame with the same brush.
//
// Gag: the bird's white eye slides toward the pelican (u 1); the pelican stops dead (u 2),
// turns its head and rolls its eye up — the Bada glare; bird and pelican glare at each other
// in silence; "hmph" (u 3.4) and it rides on, nose in the air; the bird's eye follows it out.
import * as ink from '../kit/ink.js';
import { rng, hash, lerp, clamp, smoothstep, smoothPath, smoothLoop, noise2, fbm, keys, window01 } from '../kit/math.js';

const ID = 'bada';
const PAPER = '#efe9da';
const INK = '20,17,14';                 // #14110e
const SEAL_RED = '#b72a20';
const RIDE = { hold: [2.1, 3.4], speed: 0.0, ramp: 0.3 };
const BG = 2048, PS = BG / 1000;        // background bake: px per panel unit
const TAU = Math.PI * 2;
const ROAD_Y = 805;

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const c2d = (c) => c.getContext('2d');
const deg = (d) => (d * Math.PI) / 180;

// ------------------------------------------------------------------ bristle brush (Canvas2D)
const DEF_PRESS = [[0, 0.7], [0.07, 1.05], [0.3, 1], [0.75, 0.88], [1, 0.3]];
function prof(kf, s) {
  if (s <= kf[0][0]) return kf[0][1];
  for (let k = 1; k < kf.length; k++) {
    if (s <= kf[k][0]) {
      const [s0, v0] = kf[k - 1], [s1, v1] = kf[k];
      const t = (s - s0) / (s1 - s0), e = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * e;
    }
  }
  return kf[kf.length - 1][1];
}

/** Resample a polyline at a fixed arc-length step. */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    let d = step - carry;
    while (d <= L) { const t = d / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    carry = L - (d - step);
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.3) out.push(last);
  return out;
}

/**
 * A loaded brush dragged along pts (panel units, current ctx transform). Bristles run side by side;
 * each carries its own ink, which runs out along the stroke, breaks up with noise and only catches
 * on the paper's tooth when it is low — the dry-brush streaks (飞白) of a xieyi stroke.
 * o: { S (device px per unit), w (width), a (alpha), dry (0..1), press [[s, f]...], seed, load(s, p),
 *      grain (streak length, units), tooth, edgeDry, splay, wet (0..1 soft solid core), raw (no smoothing) }
 */
function brushStroke(x, pts, o = {}) {
  const S = o.S ?? 1;
  const step = o.step ?? Math.max(0.3, 0.75 / S);
  const path = o.raw || pts.length < 3 ? pts : smoothPath(pts, o.per ?? 6);
  const P = resample(path, step);
  const n = P.length;
  if (n < 2) return;
  const T = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  });
  const W = o.w ?? 3, A = o.a ?? 0.9, dry = o.dry ?? 0.3;
  const kf = o.press || DEF_PRESS;
  const sd = hash(ID, 'brush', o.seed ?? 0);
  const r = rng(sd);
  const ns0 = sd % 9973;
  const wv = new Float32Array(n);
  for (let i = 0; i < n; i++) wv[i] = W * prof(kf, i / (n - 1)) * (1 + (noise2((i * step) / 13, 0.5, ns0) - 0.5) * (o.tremor ?? 0.11) * 2);
  // wet core: a soft solid body under the bristles (ink soaking into the paper)
  if (o.wet) {
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const h = wv[i] * 0.44;
      left.push([P[i][0] - T[i][1] * h, P[i][1] + T[i][0] * h]);
      right.push([P[i][0] + T[i][1] * h, P[i][1] - T[i][0] * h]);
    }
    const rib = left.concat(right.reverse());
    x.save();
    x.filter = `blur(${(0.9 * S * (o.wetSoft ?? 1)).toFixed(2)}px)`;
    x.fillStyle = `rgba(${INK},${A * o.wet * (1 - (o.tipDark ?? 0) * 0.5)})`;
    polyPath(x, rib); x.fill();
    x.restore();
  }
  const B = o.bristles ?? Math.max(5, Math.min(72, Math.round(W * S * 1.8 + 3)));
  const spread = o.spread ?? 1.5;
  const glen = o.grain ?? Math.max(5, W * 0.6);
  const tooth = o.tooth ?? 0.7;
  const edgeDry = o.edgeDry ?? 0.5;
  const splayA = ((o.splay ?? 0.7) / B) * 2;
  const tipDark = o.tipDark ?? 0, tip = o.tip ?? 1, round = o.round ?? 1;
  const len = (n - 1) * step;
  // bristles split into clumps as the brush dries (the big white gaps of 飞白)
  const clump = new Int32Array(B), clumpNs = [];
  for (let b = 0, c = 0; b < B; c++) {
    const sz = 2 + Math.floor(r() * 5);
    for (let k = 0; k < sz && b < B; k++, b++) clump[b] = c;
    clumpNs.push(Math.floor(r() * 100000));
  }
  x.save();
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = `rgb(${INK})`;
  for (let b = 0; b < B; b++) {
    const ob = ((b + 0.5) / B) * 2 - 1 + (r() - 0.5) * (1.2 / B);
    const e = Math.min(1, Math.abs(ob));
    const load0 = 1 - edgeDry * e * e + (r() - 0.5) * 0.3;
    const rate = dry * (0.4 + r() * 1.2) * (0.7 + 0.6 * e);
    const ns = Math.floor(r() * 100000), cns = clumpNs[clump[b]];
    const gl = glen * (0.6 + r() * 0.8);
    x.lineWidth = Math.max(0.5 / S, (W / B) * spread * (0.8 + r() * 0.4));
    const aB = A * (0.86 + r() * 0.14) * lerp(1 - tipDark, 1, (tip * ob + 1) / 2);
    const ty = ob * W * 0.85 + 50;
    // a round brush tip: edge bristles touch down later and lift earlier
    const rim = 1 - Math.sqrt(Math.max(0, 1 - e * e));
    const t0 = (wv[0] / 2) * rim * round, t1 = len - (wv[n - 1] / 2) * rim * round;
    let vis = false, faint = false, open = false;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), dist = i * step;
      let inkv = load0 * (o.load ? o.load(s, P[i]) : 1) - rate * Math.pow(s, o.dryPow ?? 1.3) * 2.1
        + (noise2(dist / gl, b * 3.7, ns) - 0.5) * (0.1 + dry) * 1.0
        + (noise2(dist / (glen * 2.2), clump[b] * 5.1, cns) - 0.5) * dry * 1.6;
      if (dist < t0 || dist > t1) inkv = -1;
      const wander = (noise2(dist / 17, b * 1.3, ns + 11) - 0.5) * splayA * (1.2 - clamp(inkv));
      const off = ((ob + wander) * wv[i]) / 2;
      const px = P[i][0] - T[i][1] * off, py = P[i][1] + T[i][0] * off;
      // paper tooth: a drying brush only prints on the raised fibres (texture sticks to the stroke)
      if (inkv < 0.65 && inkv > -1) inkv -= (noise2(dist * 0.85, ty, 77) - 0.45) * tooth * (0.65 - inkv) * 2.2;
      const v = inkv > 0.12, f = inkv < 0.32;
      if (v !== vis || (v && f !== faint)) {
        if (open) { x.lineTo(px, py); x.stroke(); open = false; }
        if (v) { x.globalAlpha = Math.min(1, aB * (f ? 0.6 : 1)); x.beginPath(); x.moveTo(px, py); open = true; }
        vis = v; faint = f;
      } else if (open) x.lineTo(px, py);
    }
    if (open) x.stroke();
  }
  x.restore();
}

/** Short loaded dab (moss dot, nail, claw). */
function dab(x, p, ang, len, w, o = {}) {
  const q = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
  brushStroke(x, [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], q], { w, a: 0.95, dry: 0.15, press: [[0, 0.75], [0.4, 1], [1, 0.45]], wet: 0.6, ...o });
}

function polyPath(x, poly) { x.beginPath(); poly.forEach((q, k) => (k ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); }

const noiseCache = new Map();
/** A small fbm canvas, stretched over a whole layer to mottle washes (no tiling). */
function mottleCanvas(seed) {
  if (noiseCache.has(seed)) return noiseCache.get(seed);
  const N = 256, c = mkCanvas(N, N), x = c2d(c), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = fbm(i / 11, j / 11, seed * 13 + 5, 4);
    const k = (i + j * N) * 4;
    img.data[k + 3] = Math.round(clamp((v - 0.38) * 2.6) * 255);
  }
  x.putImageData(img, 0, 0);
  noiseCache.set(seed, c);
  return c;
}

let SCR = null;
/** Soft ink wash (晕染): blurred fill, optional gradient [x0,y0,x1,y1,a0,a1], pooled edge and mottling. */
function wash(x, poly, o = {}) {
  const S = o.S ?? 1, a = o.a ?? 0.3;
  let t = x;
  if (o.mottle) {
    const c = x.canvas;
    if (!SCR || SCR.width !== c.width || SCR.height !== c.height) SCR = mkCanvas(c.width, c.height);
    t = c2d(SCR);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, SCR.width, SCR.height);
    t.setTransform(x.getTransform());
  }
  t.save();
  t.filter = `blur(${((o.soft ?? 3) * S).toFixed(2)}px)`;
  if (o.grad) {
    const g = o.grad, lg = t.createLinearGradient(g[0], g[1], g[2], g[3]);
    lg.addColorStop(0, `rgba(${INK},${a * g[4]})`);
    lg.addColorStop(1, `rgba(${INK},${a * g[5]})`);
    t.fillStyle = lg;
  } else t.fillStyle = `rgba(${INK},${a})`;
  polyPath(t, poly);
  t.fill();
  if (o.edge) {
    t.filter = `blur(${(Math.max(0.4, (o.soft ?? 3) * 0.3) * S).toFixed(2)}px)`;
    t.strokeStyle = `rgba(${INK},${Math.min(1, a * o.edge)})`;
    t.lineWidth = o.edgeW ?? 1.4;
    t.stroke();
  }
  t.restore();
  if (o.mottle) {
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    t.globalAlpha = o.mottle;
    t.imageSmoothingQuality = 'high';
    t.drawImage(mottleCanvas(o.mseed ?? 1), 0, 0, SCR.width, SCR.height);
    t.restore();
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(SCR, 0, 0);
    x.restore();
  }
}

/** Rough blob outline around (cx, cy). */
function blobPts(cx, cy, rx, ry, ang, seed, n = 18, amp = 0.16) {
  const out = [];
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const m = 1 + amp * (fbm(Math.cos(a) * 1.4 + 5, Math.sin(a) * 1.4 + 5, seed, 2) - 0.5) * 2;
    const px = Math.cos(a) * rx * m, py = Math.sin(a) * ry * m;
    out.push([cx + px * c - py * s, cy + px * s + py * c]);
  }
  return smoothLoop(out, 3);
}

function circlePts(c, R, a0, sweep, n, wob = 0, seed = 0) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    const rr = R * (1 + wob * (noise2(Math.cos(a) * 1.2 + 3, Math.sin(a) * 1.2 + 3, seed) - 0.5) * 2);
    out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
  }
  return out;
}

/** Bada's eye: a rounded-square loop of ink (superellipse), drawn in one turn of the brush. */
function eyeLoop(c, R, a0, sweep, n, rotA = 0.12, q = 3.2) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    const ca = Math.abs(Math.cos(a - rotA)), sa = Math.abs(Math.sin(a - rotA));
    const rr = R / Math.pow(Math.pow(ca, q) + Math.pow(sa, q), 1 / q);
    out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
  }
  return out;
}

const grainCache = new Map();
/** Paper-fibre grain tile used to knock speckles out of the ink (ink sits in the fibres). */
function grainTile(seed) {
  if (grainCache.has(seed)) return grainCache.get(seed);
  const N = 256, c = mkCanvas(N, N), x = c2d(c);
  const img = x.createImageData(N, N), r = rng(hash(ID, 'grain', seed));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const n = fbm(i / 9, j / 3.2, seed, 3) * 0.65 + r() * 0.35;
    const k = (i + j * N) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 0;
    img.data[k + 3] = Math.round(clamp((n - 0.42) * 2.4) * 255);
  }
  x.putImageData(img, 0, 0);
  grainCache.set(seed, c);
  return c;
}
function granulate(x, w, h, amount, seed) {
  x.save();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  x.globalAlpha = amount;
  x.fillStyle = x.createPattern(grainTile(seed), 'repeat');
  x.fillRect(0, 0, w, h);
  x.restore();
}

// ------------------------------------------------------------------ the picture (panel units)
// top-heavy rock: a narrow foot on the road, a bulging overhang on the left, a tilted top plane
// (authored large, then shrunk about its foot so the void stays vast)
const RK = (p) => [180 + (p[0] - 180) * 0.9, 806 + (p[1] - 806) * 0.93];
const ROCK = [
  [146, 806], [132, 760], [118, 716], [104, 676], [86, 636], [66, 598], [52, 558], [46, 520], [50, 480], [64, 448],
  [84, 430], [100, 428], [128, 416], [162, 404], [196, 398], [224, 392], [250, 392], [276, 384], [306, 386], [326, 400],
  [344, 424], [352, 460], [346, 494], [330, 520], [322, 548], [324, 576], [306, 612], [282, 648], [262, 688], [246, 728],
  [230, 766], [214, 806],
].map(RK);
const BIRD_O = RK([284, 386]), BIRD_S = 1.12;   // the myna's foot on the rock top, its scale
const BIRD_EYE = [BIRD_O[0] + 17 * BIRD_S, BIRD_O[1] - 65 * BIRD_S], BIRD_ER = 5.6 * BIRD_S;
const FISH_O = [652, 914], FISH_S = 0.9;
const FISH_EYE = [FISH_O[0] - 29 * FISH_S, FISH_O[1] - 3 * FISH_S], FISH_ER = 4.6 * FISH_S;
const STEM = [[858, 1016], [849, 880], [836, 740], [814, 600], [786, 500], [760, 440], [749, 380], [746, 322]];
const LEAF_A = [746, 318], LEAF_ROT = 0.34;     // leaf attachment (sway pivot) and tilt of the drooping bell
const LEAF_R = { x0: 590, y0: 268, x1: 812, y1: 496 };
const INSCR = [
  { text: '八大山人写意', cx: 934, y0: 62, size: 45, sx: 0.88, sy: 1.22, gap: 0.96, a: 0.95 },
  { text: '约公元一六九〇年', cx: 882, y0: 86, size: 30, sx: 0.88, sy: 1.24, gap: 0.98, a: 0.9 },
];
const SEAL_C = [882, 422], SEAL_H = 60;

function paintRock(x, S) {
  const st = (pts, o, k) => brushStroke(x, pts.map(RK), { S, seed: 'rk' + k, tremor: 0.12, ...o });
  // a pale, mottled tone in the lower half; the top plane and the front stay bare paper
  wash(x, smoothLoop(ROCK, 3), { S, a: 0.2, soft: 4, grad: [0, 480, 0, 760, 0.0, 1], mottle: 0.7, mseed: 2 });
  // inner shadow of the overhang: one heavy wet sweep; a dry scumble across the right lobe
  st([[100, 476], [90, 534], [98, 598], [114, 658], [130, 716]], { w: 28, a: 0.62, dry: 0.55, wet: 0.35, wetSoft: 2.5, press: [[0, 0.5], [0.2, 1], [0.7, 0.85], [1, 0.3]] }, 'SH');
  st([[312, 446], [300, 510], [282, 572], [258, 636]], { w: 30, a: 0.36, dry: 0.95, press: [[0, 0.6], [0.2, 1], [1, 0.5]] }, 'SC');
  // the silhouette in three broad side-brush strokes, the outer edge darkest, drying as they go
  st([[328, 402], [306, 386], [276, 384], [250, 392], [224, 392], [196, 398], [162, 404], [128, 416], [100, 428], [80, 434]], { w: 21, a: 0.93, dry: 0.42, tipDark: 0.35, tip: 1, wet: 0.3, press: [[0, 0.7], [0.07, 1.15], [0.45, 0.85], [0.8, 1.1], [1, 0.9]] }, 'C1');
  st([[86, 430], [64, 448], [50, 480], [46, 520], [52, 558], [66, 598], [86, 636], [104, 676], [118, 716], [132, 760], [146, 804]], { w: 23, a: 0.84, dry: 0.7, tipDark: 0.45, tip: -1, wet: 0.15, press: [[0, 1.1], [0.1, 0.9], [0.3, 1.1], [0.8, 0.85], [1, 0.45]] }, 'C2');
  st([[324, 398], [344, 424], [352, 460], [346, 494], [330, 520], [322, 548], [324, 576], [306, 612], [282, 648], [262, 688], [246, 728], [230, 766], [214, 806]], { w: 25, a: 0.88, dry: 0.62, tipDark: 0.4, tip: 1, wet: 0.2, press: [[0, 0.8], [0.06, 1.15], [0.3, 0.85], [0.42, 1.1], [0.8, 0.9], [1, 0.4]] }, 'C3');
  // two folds of the front face, in a drier, paler brush
  st([[238, 404], [214, 440], [184, 482], [158, 530], [150, 580]], { w: 11, a: 0.55, dry: 0.85, press: [[0, 1.1], [0.4, 0.85], [1, 0.3]] }, 'F1');
  st([[292, 466], [282, 516], [272, 566]], { w: 9, a: 0.5, dry: 0.85, press: [[0, 1], [1, 0.3]] }, 'F2');
  // accents in jet ink: a few loose moss dots on the top, a hard touch at the foot
  [[140, 410, -0.3], [186, 398, 0.25], [236, 389, -0.15], [96, 426, 0.6]].map(([px, py, a]) => [...RK([px, py]), a])
    .forEach(([px, py, a], k) => dab(x, [px - 5, py - 4], a, 10, 9, { S, seed: 'moss' + k, tremor: 0.3 }));
  dab(x, [148, 800], 0.05, 15, 9, { S, seed: 'foot1', a: 0.95 });
  dab(x, [201, 801], -0.15, 11, 8, { S, seed: 'foot2', a: 0.9 });
}

function paintBird(x, S) {
  x.save();
  x.translate(BIRD_O[0], BIRD_O[1]);
  x.scale(BIRD_S, BIRD_S);
  S *= BIRD_S;
  const st = (pts, o, k) => brushStroke(x, pts, { S, seed: 'bird' + k, ...o });
  // tail: three broad strokes cocked up behind
  st([[-30, -38], [-46, -52], [-62, -70]], { w: 9, a: 0.96, dry: 0.45, press: [[0, 1], [0.6, 0.75], [1, 0.12]], wet: 0.35 }, 't1');
  st([[-28, -34], [-48, -45], [-68, -58]], { w: 8, a: 0.92, dry: 0.55, press: [[0, 1], [0.6, 0.7], [1, 0.12]] }, 't2');
  st([[-27, -31], [-44, -36], [-60, -42]], { w: 5.5, a: 0.8, dry: 0.65, press: [[0, 1], [0.6, 0.6], [1, 0.1]] }, 't3');
  // body: a wet blot, darkest along the back, the breast paler
  const body = blobPts(-8, -39, 27.5, 19, -0.3, hash(ID, 'bbody'), 20, 0.12);
  wash(x, body, { S, a: 0.6, soft: 1.2, grad: [-4, -58, 6, -20, 1, 0.45], mottle: 0.35, mseed: 5 });
  st([[16, -38], [4, -24], [-14, -22], [-30, -30]], { w: 11, a: 0.62, dry: 0.65, press: [[0, 0.6], [0.3, 1], [1, 0.4]], tipDark: 0.5, tip: -1 }, 'belly');
  // back and wing: one broad loaded stroke, wet in wet
  st([[18, -55], [0, -58], [-20, -50], [-36, -36]], { w: 15, a: 0.97, dry: 0.35, press: [[0, 0.45], [0.25, 1], [0.8, 0.8], [1, 0.3]], wet: 0.55 }, 'w');
  st([[2, -40], [-14, -36], [-28, -28]], { w: 6, a: 0.85, dry: 0.6, press: [[0, 0.5], [0.4, 1], [1, 0.3]] }, 'w2');
  // head: a dark blot with the white eye reserved
  const head = blobPts(15, -63, 13.2, 12.2, 0.2, hash(ID, 'bhead'), 16, 0.1);
  wash(x, head, { S, a: 0.93, soft: 0.6, edge: 1.1, edgeW: 1.2 });
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.filter = `blur(${(0.35 * S).toFixed(2)}px)`;
  x.beginPath(); x.arc(17, -65, 5.6 + 1.3, 0, TAU); x.fillStyle = '#000'; x.fill();
  x.restore();
  st(eyeLoop([17, -65], 5.6, deg(-125), deg(385), 30), { w: 1.9, a: 0.97, dry: 0.1, press: [[0, 0.8], [0.3, 1], [1, 0.75]], raw: true }, 'eye');
  // beak: two short sharp strokes
  st([[26, -69], [36, -70], [46, -69]], { w: 4.2, a: 0.97, dry: 0.15, press: [[0, 1], [1, 0.12]], wet: 0.3 }, 'bk1');
  st([[26, -61], [36, -64], [45, -68.5]], { w: 3.2, a: 0.95, dry: 0.2, press: [[0, 1], [1, 0.12]] }, 'bk2');
  // one leg, three claws gripping the rock
  st([[-5, -24], [-2, -12], [0, -1]], { w: 2.6, a: 0.92, dry: 0.45, press: [[0, 1], [1, 0.8]] }, 'leg');
  st([[0, -1], [5, 0], [10, 2]], { w: 2.1, a: 0.9, dry: 0.3, press: [[0, 1], [1, 0.3]] }, 'c1');
  st([[0, -1], [4, 2], [7, 5]], { w: 1.9, a: 0.85, dry: 0.3, press: [[0, 1], [1, 0.3]] }, 'c2');
  st([[0, -1], [-4, 0], [-8, 2]], { w: 1.9, a: 0.85, dry: 0.3, press: [[0, 1], [1, 0.3]] }, 'c3');
  x.restore();
}

function paintFish(x, S) {
  x.save();
  x.translate(FISH_O[0], FISH_O[1]);
  x.scale(FISH_S, FISH_S);
  const SS = S * FISH_S;
  const st = (pts, o, k) => brushStroke(x, pts, { S: SS, seed: 'fish' + k, ...o });
  wash(x, smoothLoop([[-36, -4], [-20, -10], [0, -12], [20, -8], [28, -3], [10, -1], [-12, -2]], 3), { S: SS, a: 0.45, soft: 1.6 });
  st([[-40, -1], [-28, -9], [-8, -12.5], [12, -9], [27, -3]], { w: 6, a: 0.95, dry: 0.4, press: [[0, 0.5], [0.2, 1], [0.7, 0.8], [1, 0.35]], wet: 0.35 }, 'back');
  st([[-38, 2], [-22, 8], [0, 9.5], [18, 5.5], [27, 1]], { w: 2.2, a: 0.55, dry: 0.6 }, 'belly');
  st([[26, -2], [37, -9], [48, -16]], { w: 6, a: 0.95, dry: 0.35, press: [[0, 0.8], [0.4, 1], [1, 0.15]], wet: 0.3 }, 'tail1');
  st([[26, 1], [37, 6], [47, 13]], { w: 5.4, a: 0.92, dry: 0.4, press: [[0, 0.8], [0.4, 1], [1, 0.15]] }, 'tail2');
  st([[-5, -12], [3, -18], [12, -17]], { w: 4, a: 0.9, dry: 0.35, press: [[0, 1], [1, 0.3]] }, 'dorsal');
  st([[-20, 4], [-15, 10], [-9, 13]], { w: 3.4, a: 0.85, dry: 0.35, press: [[0, 1], [1, 0.25]] }, 'pect');
  st([[10, 6], [14, 9.5], [18, 11]], { w: 2.6, a: 0.75, dry: 0.45, press: [[0, 1], [1, 0.3]] }, 'anal');
  st([[-21, -8], [-23.5, -2], [-21, 5]], { w: 1.9, a: 0.75, dry: 0.35 }, 'gill');
  // white eye
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(-29, -3, 4.6 + 1, 0, TAU); x.fillStyle = '#000'; x.fill();
  x.restore();
  st(eyeLoop([-29, -3], 4.6, deg(-110), deg(380), 26), { w: 1.6, a: 0.95, dry: 0.1, press: [[0, 0.8], [0.3, 1], [1, 0.75]], raw: true }, 'eye');
  x.restore();
}

function paintStem(x, S) {
  // one pull from the leaf joint down to the bottom edge, running dry as it goes
  brushStroke(x, STEM.slice().reverse(), { S, seed: 'stem', w: 5, a: 0.92, dry: 0.5, press: [[0, 1], [0.08, 1.1], [0.85, 0.85], [1, 0.6]], grain: 8, splay: 0.3, tipDark: 0.3 });
  // little thorns along the stem
  const pts = smoothPath(STEM.slice().reverse(), 8);
  for (let k = 0; k < 11; k++) {
    const i = Math.floor(pts.length * (0.1 + k * 0.07));
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)];
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + (k % 2 ? 1 : -1) * 1.15;
    dab(x, [p[0] + Math.cos(ang) * 2, p[1] + Math.sin(ang) * 2], ang, 2.8, 2, { S, seed: 'thorn' + k, a: 0.85 });
  }
}

function paintLeaf(x, S) {
  // a withered leaf hanging over the top of its stem like a collapsed umbrella (local frame: axis down the bell)
  const c = Math.cos(LEAF_ROT), sn = Math.sin(LEAF_ROT);
  const L = (pts) => pts.map(([lx, ly]) => [LEAF_A[0] + lx * c - ly * sn, LEAF_A[1] + lx * sn + ly * c]);
  const st = (pts, o, k) => brushStroke(x, L(pts), { S, seed: 'leaf' + k, ...o });
  const bell = [[-86, 138], [-82, 92], [-66, 48], [-40, 16], [-4, 0], [30, 9], [54, 32], [68, 66], [72, 102],
    [56, 110], [44, 98], [30, 114], [6, 120], [-14, 112], [-36, 130], [-60, 124]];
  wash(x, smoothLoop(L(bell), 3), { S, a: 0.36, soft: 3.5, mottle: 0.8, mseed: 4 });
  // a dark wet flank that hangs longest, a pale dry middle, a broken right flank
  st([[-10, 2], [-46, 26], [-70, 70], [-82, 128]], { w: 36, a: 0.95, dry: 0.4, wet: 0.45, wetSoft: 2, tipDark: 0.3, tip: 1, press: [[0, 0.3], [0.2, 1], [0.8, 1], [1, 0.55]] }, 'L1');
  st([[-2, 6], [-24, 50], [-38, 92], [-46, 124]], { w: 40, a: 0.48, dry: 0.75, press: [[0, 0.25], [0.3, 1], [0.85, 0.9], [1, 0.6]] }, 'L2');
  st([[-62, 64], [-30, 74], [6, 70], [44, 58]], { w: 24, a: 0.62, dry: 0.7, press: [[0, 0.6], [0.2, 1], [1, 0.4]] }, 'L3');
  st([[6, 4], [30, 30], [50, 64], [62, 100]], { w: 26, a: 0.85, dry: 0.55, wet: 0.25, tipDark: 0.35, tip: -1, press: [[0, 0.3], [0.25, 1], [0.8, 0.9], [1, 0.4]] }, 'L5');
  // the torn hem, and two veins put in when the leaf is half dry
  st([[-84, 134], [-62, 126], [-40, 132], [-18, 114], [4, 121], [28, 115]], { w: 7, a: 0.92, dry: 0.75, press: [[0, 1.1], [0.5, 0.7], [1, 0.5]], tremor: 0.35 }, 'hem');
  st([[0, 2], [-30, 44], [-52, 92], [-62, 126]], { w: 2.4, a: 0.95, dry: 0.45, press: [[0, 1], [1, 0.35]] }, 'v0');
  st([[2, 3], [14, 46], [16, 90], [12, 118]], { w: 2.2, a: 0.9, dry: 0.5, press: [[0, 1], [1, 0.35]] }, 'v1');
}

function roadLoad(X) { return 1 - 0.8 * smoothstep(170, 430, X) * (1 - smoothstep(560, 840, X)); }
function paintRoad(x, S) {
  const pts = [];
  for (let X = -40; X <= 1040; X += 16) {
    const mid = smoothstep(200, 320, X) * (1 - smoothstep(680, 800, X));
    pts.push([X, ROAD_Y + mid * (Math.sin(X * 0.011) * 1.2 + Math.sin(X * 0.031) * 0.5)]);
  }
  brushStroke(x, pts, { S, seed: 'road', w: 5.2, a: 0.8, dry: 0.2, raw: true, grain: 14, tooth: 0.9, load: (s, p) => roadLoad(p[0]), press: [[0, 1], [0.5, 0.9], [1, 1]] });
}

function paintInscription(x, S) {
  const r = rng(hash(ID, 'inscr'));
  INSCR.forEach((col) => {
    let y = col.y0;
    [...col.text].forEach((ch, k) => {
      const sz = col.size * (0.95 + r() * 0.1);
      const load = 1 - 0.14 * ((k % 4) / 3) + (r() - 0.5) * 0.06;     // the brush runs drier, then is re-dipped
      x.save();
      x.translate(col.cx + (r() - 0.5) * col.size * 0.08, y + sz * col.sy * 0.5);
      x.rotate((r() - 0.5) * 0.06);
      x.scale(col.sx, col.sy);
      if (ch === '〇') {
        // the zero is a small brushed loop, not a type glyph
        brushStroke(x, circlePts([0, 0], sz * 0.3, deg(-100), deg(372), 26, 0.06, 9), { S: S * col.sy, seed: 'zero', w: sz * 0.075, a: col.a * load, dry: 0.4, raw: true, press: [[0, 1], [0.6, 0.85], [1, 0.4]] });
      } else {
        x.font = `${sz.toFixed(2)}px "Xingkai SC", "Kaiti SC", serif`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = `rgba(${INK},${(col.a * load).toFixed(3)})`;
        x.strokeStyle = x.fillStyle; x.lineWidth = col.size * 0.055; x.lineJoin = 'round'; x.lineCap = 'round';
        x.strokeText(ch, 0, 0);
        x.fillText(ch, 0, 0);
      }
      x.restore();
      y += sz * col.sy * col.gap;
    });
  });
  // dry-brush texture inside the characters
  x.save();
  x.beginPath(); x.rect(850, 40, 120, 340); x.clip();
  x.globalCompositeOperation = 'destination-out';
  x.globalAlpha = 0.35;
  const pat = x.createPattern(grainTile(8), 'repeat');
  pat.setTransform(new DOMMatrix([0.6, 0.25, 0, 0.6, 0, 0]));
  x.fillStyle = pat;
  x.fillRect(850, 40, 120, 340);
  x.restore();
}

/** Gourd-shaped seal (葫芦印), white characters cut into red. Painted straight onto the final picture. */
function paintGourdSeal(dst, cx, cy, h, chars) {
  const px = Math.ceil(h * PS * 0.9) + 8, py = Math.ceil(h * PS) + 8;
  const c = mkCanvas(px, py), x = c2d(c);
  const k = (py - 8) / h;                 // seal px per unit
  x.translate(px / 2, 4);
  x.scale(k, k);
  const rb = h * 0.29, rt = h * 0.2;
  const cb = [0, h - rb], ct = [0, rt];
  x.fillStyle = SEAL_RED;
  x.beginPath(); x.arc(cb[0], cb[1], rb, 0, TAU); x.fill();
  x.beginPath(); x.arc(ct[0], ct[1], rt, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(-rt * 0.62, rt * 1.55); x.quadraticCurveTo(-rt * 0.42, h * 0.5, -rb * 0.7, h - rb * 1.6);
  x.lineTo(rb * 0.7, h - rb * 1.6); x.quadraticCurveTo(rt * 0.42, h * 0.5, rt * 0.62, rt * 1.55); x.closePath(); x.fill();
  // carved characters (white)
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = '#000';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `600 ${(rt * 1.25).toFixed(2)}px "Libian SC", "Kaiti SC", serif`;
  x.fillText(chars[0], ct[0], ct[1] + rt * 0.04);
  x.font = `600 ${(rb * 1.25).toFixed(2)}px "Libian SC", "Kaiti SC", serif`;
  x.fillText(chars[1], cb[0], cb[1] + rb * 0.04);
  // a thin carved border inside the outline
  x.lineWidth = h * 0.018;
  x.strokeStyle = '#000';
  x.beginPath(); x.arc(cb[0], cb[1], rb * 0.88, deg(-58), deg(238)); x.stroke();
  x.beginPath(); x.arc(ct[0], ct[1], rt * 0.84, deg(122), deg(418)); x.stroke();
  // wear: speckles and chipped edges
  const r = rng(hash(ID, 'seal'));
  x.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < px * py * 0.02; i++) {
    x.globalAlpha = 0.25 + r() * 0.75;
    x.beginPath(); x.arc(r() * px, r() * py, 0.3 + r() * r() * 1.6, 0, TAU); x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  // seal paste is uneven: a darker and a lighter mottling
  x.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 40; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(90,10,6,0.10)' : 'rgba(255,190,170,0.10)';
    x.beginPath(); x.arc(r() * px, r() * py, 3 + r() * 10, 0, TAU); x.fill();
  }
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = 'multiply';
  dst.globalAlpha = 0.95;
  dst.drawImage(c, cx * PS - px / 2, cy * PS - 4 - (h * PS) / 2, px, py);
  dst.restore();
}

/** Composite an ink canvas onto dst with a soft bleed underneath (ink spreading into xuan fibres). */
function bleedOnto(dst, src, blurPx, alpha) {
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.filter = `blur(${blurPx.toFixed(2)}px)`;
  dst.globalAlpha = alpha;
  dst.drawImage(src, 0, 0);
  dst.filter = 'none';
  dst.globalAlpha = 1;
  dst.drawImage(src, 0, 0);
  dst.restore();
}

let BUILT = null;
function build(K) {
  const paperImg = K.paper.sheet({ w: BG, h: BG, base: PAPER, kind: 'xuan', grain: 0.55, fibers: 520, stains: 3, edge: 0.14, blotch: 0.35, seed: 9, stainColor: 'rgba(150,120,70,0.06)' });
  const paperCv = paperImg.canvas;
  // ink layer of the whole picture (minus the leaf, which sways)
  const inkCv = mkCanvas(BG, BG), xi = c2d(inkCv);
  xi.setTransform(PS, 0, 0, PS, 0, 0);
  paintRock(xi, PS);
  paintStem(xi, PS);
  paintBird(xi, PS);
  paintFish(xi, PS);
  paintRoad(xi, PS);
  paintInscription(xi, PS);
  granulate(xi, BG, BG, 0.22, 3);
  const bg = K.layer(`${ID}:bg`, BG, BG, (ctx) => {
    ctx.drawImage(paperCv, 0, 0, BG, BG);
    bleedOnto(ctx, inkCv, 2.6, 0.6);
    paintGourdSeal(ctx, SEAL_C[0], SEAL_C[1], SEAL_H, ['白', '眼']);
  });
  // the leaf on its own layer
  const R = LEAF_R, lw = Math.ceil((R.x1 - R.x0) * PS), lh = Math.ceil((R.y1 - R.y0) * PS);
  const leafInk = mkCanvas(lw, lh), xl = c2d(leafInk);
  xl.setTransform(PS, 0, 0, PS, -R.x0 * PS, -R.y0 * PS);
  paintLeaf(xl, PS);
  granulate(xl, lw, lh, 0.25, 4);
  const leaf = K.layer(`${ID}:leaf`, lw, lh, (ctx) => bleedOnto(ctx, leafInk, 2.6, 0.6));
  // pupil sprite: a soft-edged ink dot (disc radius 6 px in a 16 px sprite)
  const pupil = K.layer(`${ID}:pupil`, 16, 16, (ctx) => {
    ctx.filter = 'blur(0.5px)';
    ctx.fillStyle = `rgba(${INK},0.97)`;
    ctx.beginPath(); ctx.arc(8, 8, 6, 0, TAU); ctx.fill();
  });
  SCR = null;                            // free the wash scratch canvas
  return { bg, leaf, pupil, paperCv };
}

// ------------------------------------------------------------------ eyes (live)
const lerpA = (a, b, t) => a + (b - a) * t;
function birdGaze(u, head) {
  const look = clamp(Math.atan2(head[1] - BIRD_EYE[1], head[0] - BIRD_EYE[0]), deg(-178), deg(-6));
  return lerpA(deg(-62), look, smoothstep(1.0, 1.4, u));       // −62°: staring up into the void
}
function fishGaze(u, head) {
  const look = clamp(Math.atan2(head[1] - FISH_EYE[1], head[0] - FISH_EYE[0]), deg(-178), deg(-2));
  return lerpA(deg(-118), look, smoothstep(1.15, 1.6, u));
}
function drawPupil(img, c, R, ang, prFac = 0.42) {
  const pr = R * prFac, d = R - pr - 0.25;
  const x = c[0] + Math.cos(ang) * d, y = c[1] + Math.sin(ang) * d;
  const s = (pr * 16) / 6;
  image(img, x - s / 2, y - s / 2, s, s);
}

/** The pelican's own eye: ring radius, pupil roll (0 centred … 1 pressed to the rim) and direction. */
function pelicanEye(u) {
  if (u <= 1.95 || u >= 4.45) return { R: 5.4, m: 0.22, ang: 0, pr: 0.52 };
  const R = keys(u, [[2.0, 5.4], [2.16, 9.4], [2.3, 8.8], [4.0, 8.8], [4.4, 5.4]]);
  const m = keys(u, [[2.0, 0.22], [2.2, 1], [4.02, 1], [4.4, 0.22]]);
  const ang = deg(keys(u, [[2.0, 0], [2.2, -90], [2.55, -92], [2.85, -116], [3.36, -116], [3.5, -88], [3.78, -92], [3.98, -128], [4.15, -128], [4.4, 0]]));
  const pr = keys(u, [[2.0, 0.52], [2.2, 0.4], [4.0, 0.4], [4.4, 0.52]]);
  return { R, m, ang, pr };
}

// ------------------------------------------------------------------ the pelican in a few strokes
function ellipsePt(B, a, grow = 0) {
  const c = Math.cos(B.bodyAng), s = Math.sin(B.bodyAng);
  const px = (B.bodyRx + grow) * Math.cos(a), py = (B.bodyRy + grow) * Math.sin(a);
  return [B.bodyC[0] + px * c - py * s, B.bodyC[1] + px * s + py * c];
}
function arcPts(fn, a0, a1, n) { const out = []; for (let k = 0; k <= n; k++) out.push(fn(a0 + ((a1 - a0) * k) / n)); return out; }
function signedArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a; }

function paintPelican(x, P, u, S, paperCv) {
  const B = P.bird, BK = P.bike;
  const sc = P.place?.scale ?? 1;
  const st = (pts, o, key) => brushStroke(x, pts, { S: S * sc, seed: 'pel:' + key, ...o, w: (o.w ?? 3) * sc });
  const lb = P.mods?.lookBack ?? 0;
  const mid = (p, q, dy = 0) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + dy];

  // the head turns toward us: the bill and pouch foreshorten a little
  const bb0 = B.upperBill[0], bb7 = B.upperBill[7];
  const base = mid(bb0, bb7);
  const kb = 1 - 0.28 * lb;
  const F = (p) => [base[0] + (p[0] - base[0]) * kb, base[1] + (p[1] - base[1]) * kb];
  const bill = B.upperBill.map(F), pouch = B.pouch.map(F), nail = B.nail.map(F), jaw = B.lowerJawLine.map(F);

  // legs: a broad pale thigh, a dry shin, a dab for the webbed foot
  const leg = (L, f, key) => {
    st([L.hip, mid(L.hip, L.knee, -2), L.knee], { w: 15, a: 0.2 * f, dry: 0.7, press: [[0, 1], [1, 0.6]] }, key + 'th');
    st([L.knee, mid(L.knee, L.ankle), L.ankle], { w: 3.8, a: 0.9 * f, dry: 0.5, press: [[0, 0.9], [0.5, 1], [1, 0.8]] }, key + 'sh');
    st([L.ankle, mid(L.ankle, L.toe, 1), L.toe], { w: 6, a: 0.92 * f, dry: 0.2, press: [[0, 0.5], [0.45, 1], [1, 0.35]], wet: 0.45 }, key + 'ft');
  };
  leg(B.legFar, 0.45, 'lf');
  st([BK.crank.bb, BK.crank.far], { w: 3, a: 0.42, dry: 0.3, press: [[0, 1], [1, 0.9]] }, 'crankFar');

  // wheels: each tyre a single circular stroke (an ensō) that turns with the wheel
  BK.wheels.forEach((wh, k) => {
    const a0 = wh.angle + k * 2.1;
    st(circlePts(wh.c, wh.r, a0, TAU + 0.5, 48, 0.012, 11 + k), { w: 7.2, a: 0.93, dry: 0.55, edgeDry: 0.3, raw: true, tipDark: 0.3, tip: -1, press: [[0, 0.8], [0.06, 1.08], [0.5, 0.85], [0.8, 0.95], [1, 0.4]], grain: 8 }, 'tire' + k);
    st(circlePts(wh.c, wh.r * 0.89, a0 + 2.4, deg(220), 30, 0.01, 21 + k), { w: 1.2, a: 0.28, dry: 0.6, raw: true, press: [[0, 1], [1, 0.6]] }, 'rim' + k);
    for (let j = 0; j < 6; j++) {
      const a = wh.angle + (j * Math.PI) / 3;
      st([wh.c, [wh.c[0] + Math.cos(a) * wh.r * 0.86, wh.c[1] + Math.sin(a) * wh.r * 0.86]], { w: 1, a: 0.2, dry: 0.55, press: [[0, 1], [1, 0.7]] }, `sp${k}_${j}`);
    }
    x.save(); x.fillStyle = `rgba(${INK},0.9)`; x.beginPath(); x.arc(wh.c[0], wh.c[1], 3 * sc, 0, TAU); x.fill(); x.restore();
  });
  // chain, chainring
  st(BK.chain.concat([BK.chain[0]]), { w: 1.3, a: 0.3, dry: 0.65, raw: true, press: [[0, 1], [1, 1]] }, 'chain');
  st(circlePts(BK.crank.bb, BK.crank.ring, 0.4, deg(320), 20, 0, 0), { w: 2, a: 0.62, dry: 0.35, raw: true, press: [[0, 1], [1, 0.6]] }, 'ring');
  // frame: a handful of confident lines, the rear stays paler and drier
  const tube = (seg, w, a, dry, key) => {
    const [p, q] = seg, m = [(p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.015, (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.015];
    st([p, m, q], { w, a, dry, edgeDry: 0.25, press: [[0, 1.15], [0.12, 0.82], [0.86, 0.85], [1, 1.1]], tremor: 0.15 }, key);
  };
  const T = BK.tubes;
  tube(T.chainstay, 3.4, 0.55, 0.7, 'cs');
  tube(T.seatstay, 3.1, 0.5, 0.75, 'ss');
  tube(T.seattube, 4.4, 0.85, 0.45, 'st');
  tube(T.downtube, 5.4, 0.94, 0.4, 'dt');
  tube(T.toptube, 5, 0.92, 0.45, 'tt');
  tube(T.headtube, 5.6, 0.96, 0.3, 'ht');
  st(BK.fork, { w: 4, a: 0.9, dry: 0.45, press: [[0, 1.1], [0.2, 0.9], [1, 0.6]] }, 'fork');
  st([BK.stem[0], BK.stem[1]], { w: 3.6, a: 0.88, dry: 0.3 }, 'stem');
  st(BK.bars, { w: 3.6, a: 0.9, dry: 0.4, press: [[0, 1.1], [0.3, 0.9], [1, 0.55]] }, 'bars');
  st(BK.seatpost, { w: 3.4, a: 0.8, dry: 0.35 }, 'post');
  st(BK.saddle, { w: 6.5, a: 0.95, dry: 0.2, press: [[0, 0.55], [0.25, 1], [1, 0.45]], wet: 0.45 }, 'saddle');

  // the bird's silhouette is reserved paper (it hides the bike behind it and the rock it passes)
  const headPoly = arcPts((a) => [B.head.c[0] + Math.cos(a) * B.head.r, B.head.c[1] + Math.sin(a) * B.head.r], 0, TAU, 20);
  const sil = [B.tail, B.body, B.wing, B.neck, pouch, bill, headPoly];
  const pat = x.createPattern(paperCv, 'no-repeat');
  pat.setTransform(new DOMMatrix([1 / PS, 0, 0, 1 / PS, 0, 0]));
  x.save();
  x.fillStyle = pat; x.strokeStyle = pat; x.lineWidth = 2.6 * sc; x.lineJoin = 'round';
  for (const poly of sil) {
    const pp = signedArea(poly) < 0 ? poly.slice().reverse() : poly;
    polyPath(x, pp); x.fill(); x.stroke();
  }
  x.restore();

  // washes: pale grey body, deeper along the back; the pouch a pale wash
  const by0 = B.bodyC[1] - B.bodyRy, by1 = B.bodyC[1] + B.bodyRy;
  wash(x, B.body, { S, a: 0.2, soft: 1.8, grad: [0, by0, 0, by1, 1, 0.04] });
  wash(x, B.tail, { S, a: 0.12, soft: 1.2 });
  wash(x, B.neck, { S, a: 0.05, soft: 1.5 });
  wash(x, pouch, { S, a: 0.12, soft: 1.2 });
  // a broad pale side-brush stroke across the folded wing (most of the bird stays paper)
  st([[B.bodyC[0] - 46 * sc, B.bodyC[1] - 6 * sc], [B.bodyC[0] - 10 * sc, B.bodyC[1] - 14 * sc], [B.shoulder[0] + 4 * sc, B.shoulder[1] + 8 * sc]], { w: 30, a: 0.2, dry: 0.85, press: [[0, 0.6], [0.3, 1], [1, 0.5]], grain: 6 }, 'wingWash');
  // tail + back: one loaded stroke
  const tailTip = mid(B.tail[1], B.tail[2]);
  const ns = B.neckSpine, nN = ns.length;
  const edge = (sgn) => ns.map((p, i) => {
    const a = ns[Math.max(0, i - 1)], b = ns[Math.min(nN - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const hw = (lerp(30, 19, i / (nN - 1)) / 2) * sc * sgn;
    return [p[0] + dy * hw, p[1] - dx * hw];
  });
  const neckBack = edge(1), neckFront = edge(-1);
  const backArc = arcPts((a) => ellipsePt(B, a, 0.5 * sc), Math.PI + 0.25, Math.PI * 1.62, 10);
  st([tailTip, B.tail[0], ...backArc, neckBack[1]], { w: 13, a: 0.86, dry: 0.5, tipDark: 0.55, tip: -1, press: [[0, 0.45], [0.12, 1.05], [0.55, 0.72], [1, 0.55]], wet: 0.4 }, 'back');
  // nape and crown: the second stroke
  const H = B.head;
  const crown = arcPts((a) => [H.c[0] + Math.cos(a) * (H.r + 0.6 * sc), H.c[1] + Math.sin(a) * (H.r + 0.6 * sc)], deg(150), deg(314), 9);
  st([...neckBack.slice(2).filter((_, i) => i % 2 === 0), ...crown], { w: 9, a: 0.84, dry: 0.55, tipDark: 0.55, tip: -1, press: [[0, 0.7], [0.25, 1], [0.7, 0.8], [1, 0.45]] }, 'nape');
  // belly: a faint broken line; throat: a pale hint
  st(arcPts((a) => ellipsePt(B, a, -2 * sc), Math.PI * 0.2, Math.PI * 0.86, 8), { w: 12, a: 0.4, dry: 0.8, tipDark: 0.6, tip: -1, press: [[0, 0.5], [0.4, 1], [1, 0.4]] }, 'belly');
  st(neckFront.slice(1, Math.floor(nN * 0.62)), { w: 7, a: 0.38, dry: 0.75, tipDark: 0.6, tip: 1, press: [[0, 0.5], [0.5, 1], [1, 0.4]] }, 'throat');
  // crest flicks
  B.crest.forEach((c, k) => st([c[0], mid(c[0], c[1], -0.5), c[1]], { w: 1.9, a: 0.75, dry: 0.45, press: [[0, 1], [1, 0.15]] }, 'crest' + k));
  // secondaries (dry) and the primaries: one black wet blot reaching for the bars
  st(B.secondaries, { w: 5, a: 0.75, dry: 0.75, press: [[0, 0.6], [0.4, 1], [1, 0.5]] }, 'sec');
  const pm = B.primaries[2];
  st([[B.wrist[0] - 16 * sc, B.wrist[1] - 5 * sc], ...pm], { w: 16, a: 0.97, dry: 0.3, press: [[0, 0.55], [0.22, 1], [0.6, 0.72], [1, 0.12]], wet: 0.75, wetSoft: 1.6 }, 'prim');
  st(B.primaries[0], { w: 2.8, a: 0.8, dry: 0.45, press: [[0, 0.6], [0.4, 1], [1, 0.15]] }, 'prim0');
  st(B.primaries[4], { w: 2.6, a: 0.78, dry: 0.5, press: [[0, 0.6], [0.4, 1], [1, 0.15]] }, 'prim4');
  // bill: two strokes and the hooked nail; the pouch's sagging line
  st([bill[0], bill[1], bill[2], bill[3]], { w: 4.6, a: 0.92, dry: 0.4, tipDark: 0.45, tip: -1, press: [[0, 0.8], [0.3, 1], [0.85, 0.7], [1, 0.5]] }, 'bill1');
  st([jaw[0], mid(jaw[0], jaw[1]), jaw[1]], { w: 2, a: 0.72, dry: 0.45, press: [[0, 1], [1, 0.55]] }, 'bill2');
  st([nail[0], nail[1], nail[2]], { w: 4, a: 0.97, dry: 0.1, press: [[0, 0.7], [0.5, 1], [1, 0.4]], wet: 0.5 }, 'nail');
  st(pouch.slice(0, 26), { w: 4.2, a: 0.6, dry: 0.55, tipDark: 0.6, tip: 1, press: [[0, 0.5], [0.3, 1], [1, 0.4]] }, 'pouch');

  // the eye: a bold rounded-square loop; the pupil rolls up against the rim for the glare
  const E = B.eye, ev = pelicanEye(u);
  const ec = [E.c[0] + 1.6 * lb * sc, E.c[1] - 0.6 * lb * sc];
  const R = ev.R * sc, ringW = (2.3 + 0.3 * (ev.R - 5.4)) * sc;
  x.save();
  x.fillStyle = pat;
  x.beginPath(); x.arc(ec[0], ec[1], R + 1.2 * sc, 0, TAU); x.fill();
  x.restore();
  st(eyeLoop(ec, R, deg(-125), deg(388), 30, 0.2, 2.3), { w: ringW / sc, a: 0.97, dry: 0.12, raw: true, press: [[0, 0.8], [0.3, 1], [1, 0.75]] }, 'eye');
  const pr = R * ev.pr, d = (R - ringW * 0.45 - pr * 0.62) * ev.m;
  x.save();
  x.fillStyle = `rgba(${INK},0.97)`;
  x.filter = `blur(${(0.3 * S).toFixed(2)}px)`;
  x.beginPath(); x.arc(ec[0] + Math.cos(ev.ang) * d, ec[1] + Math.sin(ev.ang) * d, pr, 0, TAU); x.fill();
  x.restore();

  // near leg, crank and pedal (in front of everything)
  leg(B.legNear, 1, 'ln');
  st([BK.crank.bb, BK.crank.near], { w: 3.8, a: 0.93, dry: 0.3, press: [[0, 1], [1, 0.85]] }, 'crank');
  const pn = BK.crank.near;
  st([[pn[0] - 6.5 * sc, pn[1]], [pn[0] + 6.5 * sc, pn[1]]], { w: 5, a: 0.94, dry: 0.15, press: [[0, 0.8], [0.5, 1], [1, 0.8]] }, 'pedal');
}

let LIVE = null;
function liveBuffers() {
  if (LIVE) return LIVE;
  const W = 800, H = 640;
  const a = mkCanvas(W, H);
  const img = createImage(W, H);
  LIVE = { W, H, a, xa: c2d(a), img, xo: img.drawingContext };
  return LIVE;
}

function drawPelican(ctx, u, paperCv) {
  const P = ctx.rider.placed;
  const parts = [];
  const B = P.bird, BK = P.bike;
  for (const wh of BK.wheels) { parts.push([wh.c[0] - wh.r, wh.c[1] - wh.r], [wh.c[0] + wh.r, wh.c[1] + wh.r]); }
  const all = [B.body, B.tail, B.wing, B.neck, B.pouch, B.upperBill, B.legNear.poly, B.legFar.poly, B.legNear.web, B.legFar.web, B.crest.flat()];
  for (const poly of all) for (const p of poly) parts.push(p);
  parts.push([B.head.c[0] - B.head.r, B.head.c[1] - B.head.r - 10]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const M = 10;
  x0 = Math.max(x0 - M, -2, ctx.view.x0 - 2); x1 = Math.min(x1 + M, 1002, ctx.view.x1 + 2);
  y0 = Math.max(y0 - M, -2, ctx.view.y0 - 2); y1 = Math.min(y1 + M, 1002, ctx.view.y1 + 2);
  if (x1 <= x0 || y1 <= y0) return;
  const L = liveBuffers();
  const S = Math.min(clamp(ctx.pxu, 0.5, 1.6), (L.W - 4) / (x1 - x0), (L.H - 4) / (y1 - y0));
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(L.W, Math.ceil(x1 * S) - i0 + 1), h = Math.min(L.H, Math.ceil(y1 * S) - j0 + 1);
  const { xa, xo, a, img } = L;
  xa.setTransform(1, 0, 0, 1, 0, 0);
  xa.clearRect(0, 0, L.W, L.H);
  xa.setTransform(S, 0, 0, S, -i0, -j0);
  paintPelican(xa, P, u, S, paperCv);
  granulate(xa, w, h, 0.16, 6);
  xo.setTransform(1, 0, 0, 1, 0, 0);
  xo.clearRect(0, 0, L.W, L.H);
  bleedOnto(xo, a, 1.5 * S, 0.6);
  img.setModified(true);
  image(img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

// ------------------------------------------------------------------ scene
export default {
  ride: RIDE,
  freezeU: 2.8,
  cues: [{ u: 1.0, name: 'birdEye' }, { u: 2.0, name: 'glare' }, { u: 3.4, name: 'hmph' }, { u: 3.6, name: 'rideOn' }],

  async init(K) {
    ink.init(K);
    if (!BUILT) BUILT = build(K);
    Object.assign(this, { bg: BUILT.bg, leaf: BUILT.leaf, pupil: BUILT.pupil, paperCv: BUILT.paperCv });
  },

  mods(u) {
    if (u <= 1.95 || u >= 4.1) return {};
    return {
      lookBack: window01(2.0, 4.1, u, 0.24),
      eye: u >= 2.0 && u < 4.05 ? 'white' : 'normal',
      billOpen: 0.2 * window01(3.36, 3.86, u, 0.12),
    };
  },

  render(K, u, ctx) {
    image(this.bg, 0, 0, 1000, 1000);
    // the leaf sways a hair
    const sway = 0.011 * Math.sin((u / 7.3) * TAU + 0.6) + 0.004 * Math.sin((u / 3.1) * TAU + 2.0);
    push();
    translate(LEAF_A[0], LEAF_A[1]); rotate(sway); translate(-LEAF_A[0], -LEAF_A[1]);
    image(this.leaf, LEAF_R.x0, LEAF_R.y0, LEAF_R.x1 - LEAF_R.x0, LEAF_R.y1 - LEAF_R.y0);
    pop();
    // white eyes: the myna and the fish watch the pelican
    const head = ctx.rider.placed.bird.head.c;
    drawPupil(this.pupil, BIRD_EYE, BIRD_ER, birdGaze(u, head), 0.42);
    drawPupil(this.pupil, FISH_EYE, FISH_ER, fishGaze(u, head), 0.44);
    if (ctx.rider.visible) drawPelican(ctx, u, this.paperCv);
  },
};
