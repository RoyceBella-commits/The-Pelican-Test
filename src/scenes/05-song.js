// 05 · 宋代山水 · c. 1000 — monumental landscape in the manner of Fan Kuan
// (an original composition). The pelican rides up a winding path into the
// picture until it is a speck at the foot of the great peak; the camera holds
// on the whole painting, then pushes in ~4× to find it tagging along behind a
// mule train, and pulls back as it rides out to full size.
import * as ink from '../kit/ink.js';
import { profile } from '../beat/ride.js';
import { panelLeft } from '../beat/timeline.js';
import { rng, hash, lerp, clamp, smoothstep, smootherstep, smoothLoop, smoothPath, fbm, noise2, mix } from '../kit/math.js';

const ID = 'song';
const SILK = '#ad9168';
const G = SILK;                          // ground colour for ink tones
const RIDE = { hold: [2.3, 3.7], speed: 0.25, ramp: 0.3 };
const TINY = 0.14;                       // rider scale in the middle distance
const MID_Y = 702;                       // middle-ground path (wheel contact)
const A_END = [500, MID_Y];              // where the rider reaches the far path
const PANEL_CX = panelLeft(4) + 500;     // world centre of this panel (index 4)
const ZOOM_IN = 4.3;
const DETAIL = { x0: 300, y0: 570, x1: 780, y1: 790, pxu: 4.4 };

// ------------------------------------------------------------------ geometry
function jag(pts, amp, seed) {
  return pts.map((p, i) => [p[0] + (noise2(i * 0.7, 1, seed) - 0.5) * amp, p[1] + (noise2(i * 0.7, 2, seed) - 0.5) * amp]);
}
const bb = (poly) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return { x0, y0, x1, y1 }; };
function inRegion(b, reg) { return !reg || !(b.x1 < reg.x0 || b.x0 > reg.x1 || b.y1 < reg.y0 || b.y0 > reg.y1); }

/**
 * A massif in Fan Kuan's manner: one great silhouette (crown profile + steep flanks)
 * articulated by vertical fissures, each casting a shadow strip — columns of rock.
 */
function massif(x0, x1, crown, bottom, seed, nFis) {
  const sil = [];
  const ctop = Math.min(crown(x0 + 10), crown(x1 - 10));
  const taper = (y) => Math.max(0, 1 - (y - ctop) / 260) ** 2 * 46;     // the massif narrows toward its crown
  const flankL = [], flankR = [];
  for (let y = crown(x0 + 8); y <= bottom; y += 16) flankL.push([x0 + taper(y) + (noise2(y * 0.025, 1, seed) - 0.5) * 22 - (y - ctop) * 0.03, y]);
  for (let y = crown(x1 - 8); y <= bottom; y += 16) flankR.push([x1 - taper(y) + (noise2(y * 0.025, 2, seed) - 0.5) * 22 + (y - ctop) * 0.03, y]);
  const top = [];
  for (let x = flankL[0][0]; x <= flankR[0][0]; x += 7) top.push([x, crown(x)]);
  sil.push(...flankL.slice().reverse(), ...top, ...flankR);
  const fissures = [];
  const r = rng(hash('fis', seed));
  let fx = x0 + 26 + r() * 20;
  for (let k = 0; k < nFis * 2 && fx < x1 - 26; k++) {
    const full = r() < 0.55;
    const y0 = crown(fx) + 8 + r() * (full ? 26 : 140);
    const y1 = full ? lerp(bottom - 120, bottom - 10, r()) : y0 + 70 + r() * 160;
    const pts = [];
    const drift = (r() - 0.5) * 0.12;
    for (let y = y0; y <= y1; y += 14) pts.push([fx + (noise2(y * 0.022, k, seed) - 0.5) * 22 + (y - y0) * drift, y]);
    if (pts.length > 2) fissures.push({ pts, w: 10 + r() * 30, x: fx, wt: 0.5 + r() * 0.7 });
    fx += (x1 - x0) / nFis * (0.45 + r() * 0.9);
  }
  return { sil, fissures, crown, x0, x1, bottom };
}
const crownMain = (x) => 150 - 86 * Math.exp(-(((x - 470) / 175) ** 2)) + (fbm(x * 0.018, 7, 31, 3) - 0.5) * 34;
const MAIN = massif(236, 774, crownMain, 640, 31, 11);
const crownL = (x) => 312 - 64 * Math.exp(-(((x - 160) / 70) ** 2)) + (fbm(x * 0.03, 7, 32, 2) - 0.5) * 20;
const LEFT = massif(40, 282, crownL, 640, 32, 5);
const crownR = (x) => 270 - 70 * Math.exp(-(((x - 870) / 72) ** 2)) + (fbm(x * 0.03, 7, 33, 2) - 0.5) * 20;
const RIGHT = massif(732, 976, crownR, 640, 33, 5);
const FALL_X = 652;
// distant pale ridges behind the side peaks
const FAR_L = smoothLoop(jag([[0, 640], [0, 420], [40, 380], [90, 400], [140, 360], [210, 392], [250, 450], [250, 640]], 10, 41), 3);
const FAR_R = smoothLoop(jag([[760, 640], [760, 420], [810, 380], [880, 350], [940, 380], [1000, 360], [1000, 640]], 10, 42), 3);
// middle-ground knolls
const KNOLL_L = smoothLoop(jag([[268, 712], [282, 664], [320, 632], [372, 618], [430, 622], [478, 642], [508, 676], [520, 712]], 6, 9), 4);
const KNOLL_R = smoothLoop(jag([[548, 712], [560, 660], [600, 616], [660, 596], [724, 600], [780, 626], [812, 668], [826, 712]], 6, 11), 4);
// foreground boulders (behind the road)
// angular foreground rocks with fold lines (facets)
const BOULDER_L = jag([[-10, 806], [-10, 650], [18, 612], [62, 596], [96, 584], [128, 598], [150, 622], [184, 640], [206, 690], [214, 744], [204, 806]], 6, 13);
const BOULDER_R = jag([[800, 806], [792, 742], [808, 690], [832, 650], [866, 624], [896, 604], [934, 598], [968, 612], [1000, 640], [1010, 700], [1010, 806]], 6, 15);
const FOLDS_L = [[[62, 596], [70, 650], [58, 712], [66, 790]], [[128, 598], [120, 660], [134, 730], [128, 800]], [[184, 640], [170, 700], [180, 770]]];
const FOLDS_R = [[[866, 624], [858, 690], [872, 760], [864, 800]], [[934, 598], [924, 660], [940, 730], [930, 800]], [[808, 690], [826, 740], [818, 800]]];
const BANK = [[-20, 804], [1020, 804], [1020, 1020], [-20, 1020]];

// rider path pieces (panel units)
const PROF = profile(RIDE);
const X1 = PROF.x(1), X5 = PROF.x(5);
const bez = (p0, p1, p2, p3, s) => {
  const m = 1 - s;
  return [m * m * m * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s * s * s * p3[0],
    m * m * m * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s * s * s * p3[1]];
};
const climbA = (s) => bez([X1, 800], [X1 + 150, 800], [A_END[0] - 140, MID_Y + 20], A_END, s);
const farX = (u) => A_END[0] + (PROF.x(u) - PROF.x(2)) * TINY;    // pedals keep pace with the wheels
const descendC = (s, x0) => bez([x0, MID_Y], [x0 + 140, MID_Y + 20], [X5 - 160, 800], [X5, 800], s);
function riderPlace(u, base) {
  if (u <= 1 || u >= 5) return base;
  if (u < 2) {
    const s = smootherstep(1, 2, u);
    const [x, y] = climbA(s);
    return { ...base, x, y, scale: Math.exp(lerp(0, Math.log(TINY), s)) };
  }
  if (u <= 4) return { ...base, x: farX(u), y: MID_Y, scale: TINY };
  const s = smootherstep(4, 5, u);
  const [x, y] = descendC(s, farX(4));
  return { ...base, x, y, scale: Math.exp(lerp(Math.log(TINY), 0, s)) };
}

// mule train: walks right slowly along the far path for the whole visibility window
const MULE_V = 6;
const muleX = (u) => 440 + MULE_V * u;

// trees: [x, y, h, kind, tone, lean, weight]
const KNOLL_TREES = [
  [290, 646, 62, 'leafy', 0.9], [312, 636, 74, 'pine', 0.95], [338, 628, 56, 'leafy', 0.8], [364, 622, 70, 'leafy', 0.9],
  [392, 624, 50, 'leafy', 0.75], [420, 626, 66, 'pine', 0.9], [452, 634, 54, 'leafy', 0.85], [486, 650, 44, 'leafy', 0.8],
  [578, 626, 70, 'leafy', 0.9], [606, 612, 62, 'pine', 0.9], [636, 604, 50, 'leafy', 0.8], [728, 604, 76, 'pine', 0.95],
  [756, 612, 60, 'leafy', 0.85], [786, 630, 52, 'leafy', 0.8], [808, 652, 42, 'leafy', 0.75],
];
const FG_TREES = [
  [60, 612, 210, 'pine', 0.95, -0.05, 1.5], [128, 608, 170, 'leafy', 0.9, 0.08, 1.3], [180, 640, 120, 'bare', 0.9, 0.1, 1.1],
  [846, 616, 230, 'pine', 0.95, 0.04, 1.5], [912, 600, 190, 'leafy', 0.9, -0.06, 1.3], [968, 626, 150, 'bare', 0.9, -0.1, 1.2],
];

// ------------------------------------------------------------------ painting (static)
function buildWashes(K) {
  const W = [];
  const add = (poly, o) => W.push({ poly, ground: G, ...o });
  // distant ridges, then side massifs, then the great peak
  add(FAR_L, { t: 0.42, alpha: 0.42, soft: 6, grad: { y0: 360, y1: 640, a0: 1, a1: 0.05 }, edge: 0.2 });
  add(FAR_R, { t: 0.42, alpha: 0.42, soft: 6, grad: { y0: 340, y1: 640, a0: 1, a1: 0.05 }, edge: 0.2 });
  for (const [M, tt, al] of [[LEFT, 0.62, 0.62], [RIGHT, 0.62, 0.62], [MAIN, 0.84, 0.74]]) {
    add(M.sil, { t: tt, alpha: al, soft: 2.5, grad: { y0: M.crown((M.x0 + M.x1) / 2), y1: M.bottom, a0: 1, a1: 0.1 }, edge: 0.55, gran: 0.45 });
    // shadow strips beside each fissure give the columns their volume
    M.fissures.forEach((f) => {
      const strip = f.pts.map(([x, y]) => [x + 2, y]).concat(f.pts.slice().reverse().map(([x, y]) => [x + f.w, y + 10]));
      add(strip, { t: Math.min(1, tt + 0.15), alpha: 0.38, soft: 4, grad: { y0: f.pts[0][1], y1: f.pts[f.pts.length - 1][1], a0: 1, a1: 0 }, gran: 0.3 });
    });
  }
  // keep the waterfall cleft pale: silk-coloured veil strip
  add([[FALL_X - 7, 190], [FALL_X + 7, 190], [FALL_X + 9, 600], [FALL_X - 9, 600]], { t: 0, alpha: 0.75, soft: 3, ground: '#cdbb95' });
  // knolls
  for (const poly of [KNOLL_L, KNOLL_R]) {
    const b = bb(poly);
    add(poly, { t: 0.62, alpha: 0.6, soft: 2.5, grad: { y0: b.y0, y1: b.y1, a0: 0.95, a1: 0.45 }, edge: 0.6, gran: 0.35 });
  }
  // track and ground
  add([[255, 698], [840, 698], [840, 724], [255, 724]], { t: 0.3, alpha: 0.25, soft: 3 });
  add(BANK, { t: 0.38, alpha: 0.45, soft: 4, grad: { y0: 804, y1: 1000, a0: 0.9, a1: 0.35 }, gran: 0.5 });
  add([[150, 862], [850, 856], [880, 1010], [120, 1010]], { t: 0.25, alpha: 0.25, soft: 10 });   // stream (paler)
  // boulders: overall tone + darker lower/right mass (top facets stay light)
  for (const poly of [BOULDER_L, BOULDER_R]) {
    const b = bb(poly);
    add(poly, { t: 0.72, alpha: 0.55, soft: 2, edge: 0.7, gran: 0.4 });
    add(poly.map(([x, y]) => [x, Math.max(y, b.y0 + 46)]), { t: 0.92, alpha: 0.45, soft: 3, grad: { x0: b.x0, x1: b.x1, a0: 0.5, a1: 1 }, gran: 0.4 });
  }
  // foliage blobs from the trees (collect-only pass: same random sequence as the strokes)
  const fol = [];
  for (const [list, key] of [[KNOLL_TREES, 'kt'], [FG_TREES, 'ft']]) {
    list.forEach((tr, k) => ink.tree(K, `${key}${k}`, tr[0], tr[1], tr[2], { kind: tr[3], t: tr[4] ?? 0.85, lean: tr[5] ?? 0, ground: G, w: tr[6] ?? 1, washes: fol, collectOnly: true }));
  }
  fol.forEach((f) => W.push({ ground: G, ...f }));
  return W;
}

function paintTrees(K, key, list, reg) {
  list.forEach((tr, k) => {
    if (!inRegion({ x0: tr[0] - tr[2] * 0.5, x1: tr[0] + tr[2] * 0.5, y0: tr[1] - tr[2], y1: tr[1] }, reg)) return;
    ink.tree(K, `${key}${k}`, tr[0], tr[1], tr[2], { kind: tr[3], t: tr[4] ?? 0.85, lean: tr[5] ?? 0, ground: G, w: tr[6] ?? 1 });
  });
}

function paintMassif(K, key, M, o, reg) {
  if (!inRegion(bb(M.sil), reg)) return;
  // outline of the crown and flanks, then the fissures
  ink.line(K, `${key}:sil`, M.sil.filter((p) => p[1] < o.mistY), { t: o.t, w: o.edgeW, dry: true, ground: G, curv: 0.3 });
  M.fissures.forEach((f, k) => ink.line(K, `${key}:f${k}`, f.pts, { t: o.t, w: o.edgeW * f.wt, dry: true, ground: G, curv: 0.4 }));
  // raindrop texture: densest along the fissures and under the crown, thinning into the mist
  const nearFis = (x, y) => {
    let d = 1e9;
    for (const f of M.fissures) {
      if (y < f.pts[0][1] - 10 || y > f.pts[f.pts.length - 1][1] + 30) continue;
      const i = Math.min(f.pts.length - 1, Math.max(0, Math.round((y - f.pts[0][1]) / 16)));
      const dx = x - f.pts[i][0];
      if (dx > -6 && dx < f.w + 10) d = Math.min(d, Math.abs(dx - f.w * 0.3));
    }
    return d;
  };
  ink.cun(K, `${key}:rain`, M.sil, {
    n: o.n, kind: 'rain', size: o.size, t: o.t, w: o.w, ground: G, clump: 0.5,
    density: (x, y) => (1 - smoothstep(o.mistY - 160, o.mistY, y)) *
      clamp(0.25 + 0.75 * Math.max(1 - nearFis(x, y) / 26, smoothstep(M.crown(x) + 90, M.crown(x) + 10, y))),
  });
}

/** Angular rock: bold contour, fold lines, axe-cut strokes hanging off the folds, moss dots on top. */
function paintBoulder(K, key, poly, folds) {
  const r = rng(hash(ID, key));
  const top = poly.slice(1, poly.length - 1);
  ink.line(K, key + ':edge', top, { t: 1, w: 2.2, dry: true, ground: G, curv: 0.15 });
  folds.forEach((f, k) => ink.line(K, `${key}:fold${k}`, f, { t: 0.95, w: 1.3, dry: true, ground: G, curv: 0.3 }));
  // axe-cut strokes: short slanting dry strokes that start on a fold/contour and fall to the lower left
  const lines = [top, ...folds];
  let n = 0;
  lines.forEach((ln, li) => {
    const pts = smoothPath(ln, 6);
    for (let i = 1; i < pts.length; i += 2) {
      const p = pts[i];
      if (p[1] > 790) continue;
      for (let j = 0; j < 2; j++) {
        const L = 9 + r() * 14, a = Math.PI * (0.6 + r() * 0.12);
        const q = [p[0] + 3 + r() * 6, p[1] + 2 + r() * 8];
        K.seed(ID, key, 'axe', n++);
        K.brush.set('ink.dry', ink.tone(0.75 + r() * 0.25, G), 0.8 + r() * 0.7);
        K.brush.line(q[0], q[1], q[0] + Math.cos(a) * L, q[1] + Math.sin(a) * L);
      }
    }
  });
  // moss dots (点苔) along the top contour
  const moss = [];
  for (let i = 0; i < top.length - 1; i++) for (let j = 0; j < 4; j++) {
    const f = r(); moss.push([lerp(top[i][0], top[i + 1][0], f) + (r() - 0.5) * 6, lerp(top[i][1], top[i + 1][1], f) - 2 - r() * 6]);
  }
  ink.dots(K, key + ':moss', moss, { t: 1, size: 3.4, w: 0.7, ground: G, angle: -1.4 });
}

/** Extra texture only seen when the camera pushes in: grass tufts and pebbles along the far track. */
function paintDetailGround(K) {
  const r = rng(hash(ID, 'detailGround'));
  for (let k = 0; k < 140; k++) {
    const x = 300 + r() * 480, y = 712 + r() * 70;
    if (r() < 0.6) {
      const h = 2 + r() * 3.5;
      ink.line(K, `dg${k}a`, [[x, y], [x - 0.8, y - h]], { t: 0.8, w: 0.9, fine: true, ground: G });
      ink.line(K, `dg${k}b`, [[x + 1, y], [x + 2.2, y - h * 0.8]], { t: 0.8, w: 0.8, fine: true, ground: G });
    } else {
      const st = ink.blob(x, y, 1.6 + r() * 2, 1 + r(), hash(ID, 'peb', k), 8);
      ink.flat(K, `dgp${k}`, st, { t: 0.35, alpha: 220, ground: G });
      ink.line(K, `dgpe${k}`, st.slice(0, 5), { t: 0.9, w: 0.7, fine: true, ground: G });
    }
  }
}

function paintCrownScrub(K, key, crown, x0, x1, reg, n, h) {
  if (!inRegion({ x0, x1, y0: 40, y1: 260 }, reg)) return;
  const r = rng(hash(ID, key));
  for (let k = 0; k < n; k++) {
    const x = lerp(x0, x1, r()), y = crown(x) + 4 + r() * r() * 40;
    const hh = h * (0.6 + r() * 0.8);
    ink.line(K, `${key}:t${k}`, [[x, y], [x + (r() - 0.5) * 2, y - hh]], { t: 0.95, w: 0.35, fine: true, ground: G });
    const pts = [];
    for (let j = 0; j < 4; j++) pts.push([x + (r() - 0.5) * hh * 0.8, y - hh * (0.5 + r() * 0.6)]);
    ink.dots(K, `${key}:d${k}`, pts, { t: 1, size: 3.2, w: 0.6, ground: G, angle: -1.3 });
  }
}

function paintPainting(K, reg) {
  paintMassif(K, 'L', LEFT, { t: 0.72, n: 1600, size: 2.4, w: 0.36, edgeW: 0.8, mistY: 610 }, reg);
  paintMassif(K, 'R', RIGHT, { t: 0.72, n: 1600, size: 2.4, w: 0.36, edgeW: 0.8, mistY: 610 }, reg);
  paintMassif(K, 'M', MAIN, { t: 0.95, n: 6500, size: 2.8, w: 0.42, edgeW: 1.1, mistY: 620 }, reg);
  paintCrownScrub(K, 'scrubM', crownMain, 262, 750, reg, 300, 15);
  paintCrownScrub(K, 'scrubL', crownL, 70, 260, reg, 70, 10);
  paintCrownScrub(K, 'scrubR', crownR, 760, 950, reg, 70, 10);
  // waterfall: fine pale threads in the cleft
  if (inRegion({ x0: 630, x1: 690, y0: 160, y1: 600 }, reg)) {
    for (let k = 0; k < 3; k++) {
      const fall = [];
      for (let y = 196 + k * 30; y <= 560; y += 24) fall.push([FALL_X - 2 + k * 2.5 + Math.sin(y * 0.02 + k) * 2, y]);
      K.seed(ID, 'fall', k); K.brush.noFill(); K.brush.set('ink.fine', '#e4d8b6', 1.6 - k * 0.4); K.brush.spline(fall, 0.4);
    }
  }
  // mist band over the mountain feet
  K.flush();
  image(mistLayer(K), 0, 470, 1000, 220);
  // knolls: contours, texture, trees, temple
  for (const [key, poly] of [['knollL', KNOLL_L], ['knollR', KNOLL_R]]) {
    if (!inRegion(bb(poly), reg)) continue;
    ink.line(K, key + ':edge', poly.slice(0, Math.floor(poly.length * 0.55)), { t: 0.95, w: 1, dry: true, ground: G });
    ink.cun(K, key + ':cun', poly, { n: 700, kind: 'rain', size: 2.2, t: 0.85, w: 0.34, ground: G, clump: 0.6,
      density: (x, y) => 0.3 + 0.7 * smoothstep(bb(poly).y0 + 60, bb(poly).y0, y) });
  }
  paintTrees(K, 'kt', KNOLL_TREES, reg);
  if (inRegion({ x0: 630, x1: 725, y0: 570, y1: 625 }, reg)) {
    ink.flat(K, 'roof', [[640, 604], [652, 588], [700, 588], [714, 604], [700, 600], [654, 600]], { t: 0.9, alpha: 235, ground: G });
    ink.line(K, 'roofline', [[636, 606], [652, 588], [702, 588], [718, 606]], { t: 1, w: 0.8, fine: true, ground: G });
    ink.line(K, 'wall', [[654, 600], [654, 616]], { t: 0.9, w: 0.6, fine: true, ground: G });
    ink.line(K, 'wall2', [[698, 600], [698, 616]], { t: 0.9, w: 0.6, fine: true, ground: G });
  }
  // far track + the winding paths linking it to the foreground road
  if (inRegion({ x0: 150, x1: 900, y0: 690, y1: 812 }, reg)) {
    ink.line(K, 'trackTop', [[262, 698], [400, 696], [560, 697], [700, 695], [838, 698]], { t: 0.6, w: 0.7, dry: true, ground: G });
    ink.line(K, 'trackBot', [[270, 724], [420, 721], [580, 723], [720, 720], [830, 724]], { t: 0.55, w: 0.6, dry: true, ground: G });
    // the winding paths narrow as they recede (both edges drawn)
    for (const [key, fn] of [['pathA', (s) => climbA(s)], ['pathC', (s) => descendC(1 - s, farX(4))]]) {
      const up = [], lo = [];
      for (let s = 0; s <= 1.0001; s += 0.08) {
        const [x, y] = fn(s), hw = lerp(16, 3, s);
        up.push([x, y - hw * 0.4]); lo.push([x, y + hw]);
      }
      for (let k = 0; k + 3 < lo.length; k += 4) ink.line(K, `${key}l${k}`, lo.slice(k, k + 3), { t: 0.5, w: 0.7, dry: true, ground: G });
      for (let k = 2; k + 2 < up.length; k += 5) ink.line(K, `${key}u${k}`, up.slice(k, k + 2), { t: 0.4, w: 0.5, dry: true, ground: G });
    }
  }
  // foreground boulders, bank, stream
  for (const [key, poly, folds] of [['boulderL', BOULDER_L, FOLDS_L], ['boulderR', BOULDER_R, FOLDS_R]]) {
    if (!inRegion(bb(poly), reg)) continue;
    paintBoulder(K, key, poly, folds);
  }
  if (inRegion({ x0: 0, x1: 1000, y0: 800, y1: 1000 }, reg)) {
    ink.line(K, 'roadEdge', [[-10, 806], [250, 809], [520, 805], [780, 809], [1010, 806]], { t: 0.65, w: 0.9, dry: true, ground: G });
    const rr = rng(hash(ID, 'water'));
    for (let k = 0; k < 46; k++) {
      const x = 150 + rr() * 700, y = 872 + rr() * 120, L = 18 + rr() * 50;
      ink.line(K, `ripple${k}`, [[x, y], [x + L * 0.5, y - 2 - rr() * 2], [x + L, y]], { t: 0.5 + rr() * 0.2, w: 0.45, fine: true, ground: G, curv: 0.6 });
    }
    [[230, 900, 22], [300, 958, 14], [640, 930, 26], [720, 978, 16], [500, 990, 12]].forEach(([x, y, rad], k) => {
      const st = ink.blob(x, y, rad, rad * 0.55, hash(ID, 'stone', k), 10);
      ink.flat(K, `stone${k}`, st, { t: 0.55, alpha: 200, ground: G });
      ink.line(K, `stoneE${k}`, st.slice(0, 7), { t: 1, w: 0.9, dry: true, ground: G });
    });
    ink.cun(K, 'bankGrass', [[-10, 812], [1010, 812], [1010, 846], [-10, 846]], { n: 140, kind: 'rain', size: 6, t: 0.8, w: 0.5, ground: G });
  }
  paintTrees(K, 'ft', FG_TREES, reg);
  // the hidden signature, tucked into the trees right of the mule track (look closely)
  if (inRegion({ x0: 600, x1: 640, y0: 650, y1: 700 }, reg)) {
    K.flush();
    K.text({ text: '鹈鹕', font: '"Kaiti SC", serif', size: 40, color: ink.tone(0.8, G), vertical: true }, 612, 660, 0.16);
  }
  // inscription and seals (upper right sky)
  if (inRegion({ x0: 820, x1: 990, y0: 20, y1: 330 }, reg)) {
    K.flush();
    K.text({ text: '溪山骑行图', font: '"Kaiti SC", serif', weight: 600, size: 120, color: ink.tone(0.92, G), vertical: true, lineHeight: 1.05 }, 948, 34, 0.33);
    K.text({ text: '宋代山水\n约公元一千年', font: '"Kaiti SC", serif', size: 80, color: ink.tone(0.85, G), vertical: true, lineHeight: 1.05 }, 892, 52, 0.3);
    image(ink.seal(K, '骑', { size: 160, mode: 'white', seed: 2 }), 925, 246, 34, 34);
  }
  if (inRegion({ x0: 20, x1: 140, y0: 880, y1: 990 }, reg)) {
    image(ink.seal(K, '鹈鹕测试', { size: 220, mode: 'white', seed: 3 }), 34, 900, 62, 62);
    image(ink.seal(K, '宋', { size: 160, mode: 'red', seed: 4 }), 104, 930, 30, 30);
  }
}

function mistLayer(K) {
  return K.layer(`${ID}:mist`, 500, 110, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 110);
    g.addColorStop(0, 'rgba(184,160,118,0)');
    g.addColorStop(0.45, 'rgba(188,165,124,0.85)');
    g.addColorStop(0.7, 'rgba(184,160,118,0.6)');
    g.addColorStop(1, 'rgba(184,160,118,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 500, 110);
    const r = rng(hash(ID, 'mist'));
    for (let k = 0; k < 30; k++) {
      const x = r() * 500, y = 30 + r() * 50, rad = 20 + r() * 60;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, 'rgba(196,174,134,0.35)'); gg.addColorStop(1, 'rgba(196,174,134,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, 500, 110);
    }
  });
}

// ------------------------------------------------------------------ live figures
function drawMuleTrain(K, u, ctx) {
  if (ctx.pxu < 0.6) return;
  const fine = (key, pts, t = 0.95, w = 0.3, curv = 0.4) => ink.line(K, key, pts, { t, w: w * 4, fine: true, ground: G, curv });
  const fill = (key, pts, t) => ink.flat(K, key, pts, { t, alpha: 235, ground: G });
  const step = Math.floor(u * 4);                  // legs alternate on half-beats
  const x0 = muleX(u);
  const members = [{ kind: 'man', dx: 56 }, { kind: 'donkey', dx: 38 }, { kind: 'donkey', dx: 18 }, { kind: 'donkey', dx: -2 }, { kind: 'man', dx: -20 }];
  members.forEach((m, k) => {
    const x = x0 + m.dx, y = MID_Y + 1;
    const ph = (step + k) % 2 ? 1 : -1;
    if (m.kind === 'donkey') {
      const body = [[x - 8, y - 8], [x - 6, y - 11], [x + 2, y - 11.5], [x + 7, y - 10], [x + 8, y - 7], [x + 5, y - 5.5], [x - 6, y - 5.5]];
      fill(`mule${k}f`, body, 0.38);
      fine(`mule${k}o`, body.concat([body[0]]), 0.95, 0.32, 0.5);
      // neck, head, long ears (they perk up when the pelican rings its bell)
      const perk = k === 3 && u > 3.3 && u < 4.4 ? 1 : 0;
      fine(`mule${k}n`, [[x + 6, y - 10], [x + 9, y - 13.5], [x + 12.5, y - 12.5], [x + 12, y - 11]], 0.95, 0.3);
      fine(`mule${k}e1`, [[x + 9, y - 13.5], [x + 8.5 + perk, y - 17.5 - perk]], 0.95, 0.25);
      fine(`mule${k}e2`, [[x + 10, y - 13.5], [x + 10.5 + perk * 1.5, y - 17 - perk]], 0.95, 0.25);
      fine(`mule${k}t`, [[x - 8, y - 9], [x - 10.5, y - 6.5 + ph * 0.5]], 0.95, 0.25);
      for (const [lx, sgn] of [[x - 6, 1], [x - 4, -1], [x + 4, 1], [x + 6, -1]]) fine(`mule${k}l${lx}`, [[lx, y - 5.5], [lx + ph * sgn * 1.4, y]], 0.95, 0.25);
      // pack load with a rope
      const pack = [[x - 5, y - 11], [x + 3, y - 11], [x + 3.5, y - 15.5], [x - 4.5, y - 15.5]];
      fill(`mule${k}p`, pack, 0.22);
      fine(`mule${k}po`, pack.concat([pack[0]]), 0.9, 0.25, 0.2);
      fine(`mule${k}pr`, [[x - 1, y - 15.5], [x - 1, y - 8]], 0.8, 0.2);
    } else {
      // driver: broad hat, robe, staff; the rear one turns back to stare at u ≈ 3.3–4.6
      const look = m.dx < 0 && u > 3.3 && u < 4.6 ? -1 : 1;
      const robe = [[x - 2.6, y - 14], [x + 2.6, y - 14], [x + 3.4, y - 5.5], [x - 3.4, y - 5.5]];
      fill(`man${k}rb`, robe, 0.35);
      fine(`man${k}ro`, robe.concat([robe[0]]), 0.95, 0.3, 0.2);
      fine(`man${k}lg`, [[x - 1, y - 5.5], [x - 1 + ph * 1.6, y]], 0.95, 0.28);
      fine(`man${k}lg2`, [[x + 1, y - 5.5], [x + 1 - ph * 1.6, y]], 0.95, 0.28);
      fine(`man${k}hd`, [[x - 1.6, y - 14], [x - 1.4 + look * 0.6, y - 16.5], [x + 1.6 * look, y - 16]], 0.95, 0.3);
      fine(`man${k}hat`, [[x - 4.2, y - 16.6], [x, y - 19.5], [x + 4.2, y - 16.6]], 0.95, 0.4, 0.2);
      fine(`man${k}st`, [[x + 3 * look, y - 13], [x + 5 * look, y + 1]], 0.95, 0.25);
    }
  });
}

// ------------------------------------------------------------------ pelican in ink
const ROLE = {
  tire: { w: 1.1, t: 0.95 }, rim: { w: 0.35, t: 0.7 }, spoke: { w: 0.22, t: 0.7, lod: 0.5 }, hub: { w: 0.3, t: 0.9 },
  chain: { w: 0.3, t: 0.7, lod: 0.6 }, frame: { w: 0.8, t: 0.92 }, fork: { w: 0.8, t: 0.92 }, stem: { w: 0.7, t: 0.9 }, bars: { w: 0.7, t: 0.9 },
  seatpost: { w: 0.6, t: 0.9 }, saddle: { w: 1.2, t: 0.95 }, ring: { w: 0.4, t: 0.85, lod: 0.5 },
  tail: { fill: '#c8b089', w: 0.6, t: 0.9 }, body: { fill: '#c9b28c', w: 0.75, t: 0.92 }, wing: { fill: '#c4ab83', w: 0.55, t: 0.88 },
  secondaries: { w: 1.4, t: 0.95, dry: true }, primary: { w: 1.1, t: 1 }, neck: { fill: '#c9b28c', w: 0.6, t: 0.9 },
  head: { fill: '#cbb48e', w: 0.6, t: 0.9 }, crest: { w: 0.35, t: 0.9, lod: 0.5 }, pouch: { fill: '#b98c4e', w: 0.5, t: 0.85 },
  bill: { fill: '#c7a774', w: 0.5, t: 0.9 }, nail: { fill: '#8a5a32', w: 0 }, face: null, eye: { w: 0.3, t: 0.9 },
  pupil: { fill: ink.INK, w: 0 }, eyeShut: { w: 0.4, t: 0.9 },
  legFar: { fill: '#a98757', w: 0.4, t: 0.7 }, footFar: { fill: '#a98757', w: 0.3, t: 0.7 }, crankFar: { w: 0.5, t: 0.7 },
  leg: { fill: '#b98a55', w: 0.55, t: 0.9 }, foot: { fill: '#b98a55', w: 0.45, t: 0.9 }, crank: { w: 0.8, t: 0.95 }, pedal: { w: 1.2, t: 0.95 },
};

function drawInkPelican(K, ctx) {
  const P = ctx.rider.placed;
  const s = P.place.scale ?? 1;
  const detail = s * ctx.pxu;            // screen px per rig unit
  const ws = Math.max(s, 0.42) * 1.6;    // keep lines legible when the rider is a speck
  for (const part of K.rig.parts(P)) {
    const st = ROLE[part.role];
    if (!st) continue;
    if (st.lod && detail < st.lod) continue;
    const key = `rider:${part.name}`;
    if (part.kind === 'circle') {
      if (st.fill) { K.seed(ID, key, 'f'); K.brush.noStroke(); K.brush.wash(st.fill, 235); K.brush.circle(part.c[0], part.c[1], part.r); K.brush.noWash(); }
      if (st.w) { K.seed(ID, key); K.brush.noFill(); K.brush.set('ink.fine', ink.tone(st.t, G), st.w * ws); K.brush.circle(part.c[0], part.c[1], part.r); }
    } else if (part.kind === 'poly') {
      if (st.fill) ink.flat(K, key + ':f', part.pts, { t: 0, alpha: 235, ground: st.fill });
      if (st.w) ink.line(K, key, part.pts.concat([part.pts[0]]), { t: st.t, w: st.w * ws, fine: !st.dry, dry: st.dry, ground: G, curv: 0.3 });
    } else {
      ink.line(K, key, part.pts, { t: st.t, w: st.w * ws, fine: !st.dry, dry: st.dry, ground: G, curv: 0.3 });
    }
  }
}

// ------------------------------------------------------------------ scene
export default {
  ride: RIDE,
  freezeU: 3.4,
  cues: [{ u: 2.0, name: 'grandView' }, { u: 2.5, name: 'pushIn' }, { u: 3.3, name: 'bell' }, { u: 3.4, name: 'driverTurns' }, { u: 3.8, name: 'pullBack' }],

  async init(K) {
    ink.init(K);
    this.silk = ink.silk(K, { w: 1024, h: 1024, base: SILK, seed: 5 });
    this.washes = ink.washLayer(K, `${ID}:washes`, buildWashes(K), { pxu: 2, ground: G });
    // tier 1: the whole painting at ~2 px/unit
    this.main = K.bake('main', 2048, 2048, (K, w) => {
      push(); scale(w / 1000);
      image(this.silk, 0, 0, 1000, 1000);
      image(this.washes, 0, 0, 1000, 1000);
      paintPainting(K, null);
      K.flush();
      pop();
    });
    // tier 2: the push-in region at final zoom resolution
    const D = DETAIL;
    const dW = (D.x1 - D.x0) * D.pxu, dH = (D.y1 - D.y0) * D.pxu;
    const dWash = ink.washLayer(K, `${ID}:washesDetail`, buildWashes(K), { pxu: D.pxu, w: dW, h: dH, x0: D.x0, y0: D.y0, ground: G });
    this.detail = K.bake('detail', dW, dH, (K) => {
      push(); scale(D.pxu); translate(-D.x0, -D.y0);
      image(this.silk, 0, 0, 1000, 1000);
      image(dWash, D.x0, D.y0, D.x1 - D.x0, D.y1 - D.y0);
      paintPainting(K, D);
      paintDetailGround(K);
      K.flush();
      pop();
    });
  },

  path(u, base) { return riderPlace(u, base); },

  camera(u, cam) {
    if (u <= 0.5 || u >= 5.5) return cam;
    const w = smootherstep(0.5, 1.8, u) * (1 - smootherstep(4.6, 5.5, u));     // follow → whole painting
    const whole = { cx: PANEL_CX, cy: 500, z: 1 };
    const pin = smootherstep(2.5, 3.3, u) * (1 - smootherstep(3.8, 4.6, u));   // whole painting → the speck
    const rp = riderPlace(clamp(u, 2, 4), { x: 0, y: 800, scale: 1 });
    const target = { cx: PANEL_CX - 500 + rp.x + 4, cy: MID_Y - 44, z: ZOOM_IN };
    const lz = lerp(lerp(Math.log(cam.z), Math.log(whole.z), w), Math.log(target.z), pin);
    return {
      cx: lerp(lerp(cam.cx, whole.cx, w), target.cx, pin),
      cy: lerp(lerp(cam.cy, whole.cy, w), target.cy, pin),
      z: Math.exp(lz),
    };
  },

  render(K, u, ctx) {
    image(this.main, 0, 0, 1000, 1000);
    // sharper detail tier while the camera is pushed in
    const dz = smoothstep(1.7, 2.3, ctx.pxu / 0.97);
    if (dz > 0) {
      const D = DETAIL;
      push(); tint(255, 255 * dz);
      image(this.detail, D.x0, D.y0, D.x1 - D.x0, D.y1 - D.y0);
      pop();
    }
    // waterfall shimmer + drifting mist (live)
    const shimmer = [];
    for (let k = 0; k < 6; k++) {
      const y = 210 + ((u * 60 + k * 57) % 330);
      shimmer.push([[656 + Math.sin(y * 0.02) * 3, y], [656 + Math.sin((y + 14) * 0.02) * 3, y + 14]]);
    }
    shimmer.forEach((sg, k) => { K.seed(ID, 'sh', k); K.brush.set('ink.fine', '#e2d3ae', 0.9); K.brush.line(sg[0][0], sg[0][1], sg[1][0], sg[1][1]); });
    K.flush();
    push(); tint(255, 120);
    const md = (u * 4) % 500;
    image(mistLayer(K), -md, 520, 500, 90); image(mistLayer(K), 500 - md, 520, 500, 90); image(mistLayer(K), 1000 - md, 520, 500, 90);
    pop();
    // two birds crossing the sky
    for (let b = 0; b < 2; b++) {
      const bx = ((u + 7) * (14 + b * 5) + b * 300) % 1100 - 50, by = 250 + b * 40 + Math.sin(u * 2 + b) * 6;
      const flap = Math.sin(u * 9 + b * 2) * 2.5;
      ink.line(K, `bird${b}`, [[bx - 5, by - flap], [bx, by], [bx + 5, by - flap]], { t: 0.85, w: 0.4, fine: true, ground: G, curv: 0.4 });
    }
    drawMuleTrain(K, u, ctx);
    if (ctx.rider.visible) drawInkPelican(K, ctx);
  },
};
