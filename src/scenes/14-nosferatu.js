// 14 · 诺斯费拉图 / Nosferatu · 1922
//
// A tinted frame of a 1922 German Expressionist film: the bare plaster stairwell of an old house, lit by one low
// lamp standing off-frame at the lower right (amber tint) and by moonlight from a casement window at the left
// (blue). A solid plastered staircase climbs from the lower left to a pointed door on the landing, a heavy
// banister throws its long shadow onto the wall, a dark arch opens under the landing. The title is painted in
// gilt on a black lacquered plaque, like an intertitle card hung on the wall.
//
// Technique (0 live p5.brush marks; Canvas2D throughout):
//   • the set is painted as physical layers (albedo, lamp shading, moonlight, emission, depth class) and lit per
//     pixel once in init(): set_lit (lamp on) and set_dark (moonlight only) are cross-faded by the lamp's flicker;
//   • every cast shadow is a mask in one small live canvas, filled 'source-in' with set_dark — a shadow is simply
//     "the lamp's light removed". The wall and the (nearer) stair face get different projections about the lamp,
//     so each shadow breaks at every step of the stair's sawtooth edge;
//   • the pelican's shadow is the rig re-built every frame (fixed point counts, so poses can be blended) and
//     mapped point by point: stretched, keystoned and sheared from the low lamp; while it climbs it is sheared onto
//     the stair slope, hunched, and its bill and primaries are warped into a claw and long fingers;
//   • the rider is re-painted every frame in a 2D canvas with hard key light (lit crescent / half-tone / deep
//     shadow per part, orthochromatic values: orange and red go dark), a cold moon rim near the window, and its
//     own film grain and vignette;
//   • film: 18 fps judder + gate weave inside (1, 5), grain, dust, scratches, projector flicker, vignette and
//     rounded aperture corners;
//   • exit (u = 6.0, film t = 89.0): the wall shadow's outline (erosion ring of the same mask, frozen at u = 6)
//     flares into a phosphor trace (core #d8ffe4, additive glow #39ff7a, persistence #9be86a, τ = 0.5 s), arcs
//     crawl along it for 0.25 s, a spark runs along y = 800 to x = 1000 by u = 6.15, the lamp flares white for one
//     frame and dies to a dim glow; later the door creaks open by itself.
import { hash, rng, clamp, lerp, smoothstep, easeInOut, easeOut, fbm, keys } from '../kit/math.js';
import { rigParts } from '../rig/parts.js';
import { pose as rigPose } from '../rig/pelican.js';

const ID = 'nosferatu';
const RIDE = { hold: [2.2, 3.7], speed: 0.45, ramp: 0.3 };
const TAU = Math.PI * 2;
const PAD = 24, SPAN = 1000 + 2 * PAD;    // bakes cover the panel plus a margin (gate weave)
const SR = 1.1;                           // px per unit of the set bakes
const SS = 0.6;                           // px per unit of the live shadow canvas (soft penumbra)
const SP = 1.1;                           // px per unit of the phosphor trace
const LAMP = [1150, 905];                 // the off-frame lamp, low right (its foot on the wall plane)
const P_LAMP = 2.6, R0 = 540;
const D_WALL = 520, D_FACE = 380, D_FLOOR = 190;
const AMB = 0.05, MOON = 0.55, EMIT = 1.0;
const YB = 752;                           // wall base
const ST = { x0: 40, T: 40, R: 30, n: 14 };
const LAND_Y = YB - ST.n * ST.R;          // 332
const LAND_X = ST.x0 + ST.n * ST.T;       // 600
const SLOPE = ST.R / ST.T;
const RAIL = 96;
const DOOR = { x0: 702, x1: 810, y0: 72, y1: LAND_Y, spring: 128 };
const HANDLE = [720, 234];
const WIN = { x0: 52, x1: 172, y0: 124, y1: 408, ox0: 36, ox1: 188, oy0: 106, oy1: 428 };
const ARCH = { cx: 805, r: 96, spring: 574 };
const PLAQ = { x0: 206, y0: 44, x1: 474, y1: 170 };
const KB = 1.07;                          // banister shadow magnification about the lamp
const EPS_F = 0.035;                      // the stair face is nearer the lamp: its shadows shrink toward it
const AX_END = 350;                       // where the climbing shadow's bottom bracket ends up
const PH = { core: [216, 255, 228], glow: [57, 255, 122], tail: [155, 232, 106] };

// ------------------------------------------------------------------ small helpers
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const c2d = (c) => c.getContext('2d');
function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}
function liveImg(w, h) { const img = createImage(Math.ceil(w), Math.ceil(h)); return { img, c: img.drawingContext, w: img.width, h: img.height }; }
function poly(x, P, close = true) { x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]); if (close) x.closePath(); }
const grey = (v) => { const c = Math.round(clamp(v) * 255); return `rgb(${c},${c},${c})`; };
const sv = (v) => grey(v / 1.5);                     // lamp-shading canvas: 1.0 ≙ 170
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rotAbout = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const toLamp = (p, k) => [LAMP[0] + (p[0] - LAMP[0]) * k, LAMP[1] + (p[1] - LAMP[1]) * k];
function circ(c, r, n) { const o = []; for (let k = 0; k < n; k++) { const a = (k / n) * TAU; o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; }
function rectP(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
function quadB(a, c, b, n) { const o = []; for (let k = 0; k <= n; k++) { const t = k / n, s = 1 - t; o.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]); } return o; }
function resampleN(P, N) {
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = L[L.length - 1] || 1, out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / (N - 1)) * tot;
    while (j < P.length - 2 && L[j + 1] < s) j++;
    const sg = L[j + 1] - L[j] || 1, t = clamp((s - L[j]) / sg);
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t]);
  }
  return out;
}
function sub2(P) { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; o.push(a, mid(a, b)); } return o; }
function taper(pts, w0, w1, pw = 1) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = lerp(w0, w1, Math.pow(i / (n - 1), pw)) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  return L.concat(R.reverse());
}

// ------------------------------------------------------------------ tint ramps (tinted b/w film)
const AMBER = [[0, [4, 2, 1]], [0.08, [18, 11, 6]], [0.25, [42, 26, 12]], [0.45, [104, 70, 32]], [0.62, [160, 112, 50]],
  [0.74, [192, 138, 62]], [0.88, [230, 200, 143]], [1, [250, 238, 208]]];
const BLUE = [[0, [2, 4, 8]], [0.1, [13, 22, 38]], [0.35, [32, 50, 82]], [0.6, [60, 90, 134]], [0.82, [128, 158, 198]], [1, [214, 226, 240]]];
function makeLUT(stops, n = 1024) {
  const L = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1], t = clamp((v - a) / (b - a));
    for (let j = 0; j < 3; j++) L[i * 3 + j] = ca[j] + (cb[j] - ca[j]) * t;
  }
  return L;
}
const LA = makeLUT(AMBER), LB = makeLUT(BLUE);
/** Exposure → print density (high-contrast film stock). */
function curve(E) { const v = 1 - Math.exp(-2 * Math.max(0, E)); const s = v * v * (3 - 2 * v); return v + 0.38 * (s - v); }
const CURVE = new Uint16Array(4096);
for (let i = 0; i < 4096; i++) CURVE[i] = Math.min(1023, Math.round(curve((i / 4095) * 4) * 1023));
function toneRGB(E, f = 0) {
  const i = Math.min(1023, Math.round(curve(E) * 1023)) * 3;
  return [LA[i] + (LB[i] - LA[i]) * f, LA[i + 1] + (LB[i + 1] - LA[i + 1]) * f, LA[i + 2] + (LB[i + 2] - LA[i + 2]) * f];
}
function lampAt(x, y, D) { const dx = x - LAMP[0], dy = y - LAMP[1]; return P_LAMP / (1 + (dx * dx + dy * dy + D * D) / (R0 * R0)); }

// ------------------------------------------------------------------ set geometry
const yN = (x) => YB - ST.R - (x - ST.x0) * SLOPE;       // stair nosing line
const yR = (x) => yN(x) - RAIL;                           // handrail centre line
function sawPts() {
  const P = [[ST.x0, YB]];
  for (let k = 0; k < ST.n; k++) { const y = YB - (k + 1) * ST.R; P.push([ST.x0 + k * ST.T, y], [ST.x0 + (k + 1) * ST.T, y]); }
  P.push([1000 + PAD, LAND_Y]);
  return P;
}
const SAW = sawPts();
const FACE = SAW.concat([[1000 + PAD, YB]]);
function doorShape(o) {      // pointed (four-centred) door head, offset outward by o
  const x0 = DOOR.x0 - o, x1 = DOOR.x1 + o, s = DOOR.spring, cx = (x0 + x1) / 2, top = DOOR.y0 - o;
  return [[x0, DOOR.y1], ...quadB([x0, s], [x0 + 2, s - 40], [cx, top], 10), ...quadB([cx, top], [x1 - 2, s - 40], [x1, s], 10).slice(1), [x1, DOOR.y1]];
}
function archShape(o) {
  const P = [[ARCH.cx - ARCH.r - o, YB]];
  for (let k = 0; k <= 24; k++) { const a = Math.PI + (k / 24) * Math.PI; P.push([ARCH.cx + Math.cos(a) * (ARCH.r + o), ARCH.spring + Math.sin(a) * (ARCH.r + o)]); }
  P.push([ARCH.cx + ARCH.r + o, YB]);
  return P;
}
/** Heavy banister: foot newel, handrail, turned balusters, landing post (polygons, panel units). */
function banisterPolys() {
  const out = [];
  out.push(rectP(14, 626, 46, YB), rectP(10, 612, 50, 627), rectP(22, 604, 38, 613), circ([30, 592], 13, 18));
  const xa = 46, xb = 590;
  out.push([[xa, yR(xa) - 7], [xb, yR(xb) - 7], [xb, yR(xb) + 7], [xa, yR(xa) + 7]]);
  for (let k = 0; k < ST.n - 1; k += 2) {
    const xc = ST.x0 + k * ST.T + ST.T / 2, yb = YB - (k + 1) * ST.R, yt = yR(xc) + 6;
    const L = [], Rr = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, y = lerp(yb, yt, t);
      const w = 3.8 + 3.2 * Math.exp(-(((t - 0.3) / 0.12) ** 2)) + 1.3 * Math.exp(-(((t - 0.74) / 0.05) ** 2)) + (t < 0.07 ? 1.8 : 0) + (t > 0.93 ? 1.5 : 0);
      L.push([xc - w, y]); Rr.push([xc + w, y]);
    }
    out.push(L.concat(Rr.reverse()));
  }
  out.push(rectP(580, 214, 600, LAND_Y), rectP(576, 202, 604, 216), circ([590, 190], 11, 16));
  return out;
}
const BAN = banisterPolys();
const PANE_X = [[WIN.x0 + 4, 110], [114, WIN.x1 - 4]];
const PANE_Y = [[WIN.y0 + 4, 216], [221, 311], [316, WIN.y1 - 4]];
function paths() {
  const face = new Path2D(); poly(face, FACE);
  const wall = new Path2D(); wall.rect(-PAD, -PAD, SPAN, YB + PAD); poly(wall, FACE);
  const floor = new Path2D(); floor.rect(-PAD, YB, SPAN, 1000 + PAD - YB);
  return { face, wall, floor };
}

// ------------------------------------------------------------------ the set (painted as light layers, lit per pixel)
function noiseCv(w, h, sc, seed, lo, hi, oct = 4) {
  const cv = mk(w, h), x = c2d(cv), id = x.createImageData(cv.width, cv.height), d = id.data;
  for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) {
    const v = lerp(lo, hi, clamp(fbm(i / sc, j / sc, seed, oct) * 1.25 - 0.12));
    const k = (j * cv.width + i) * 4, c = Math.round(clamp(v) * 255);
    d[k] = d[k + 1] = d[k + 2] = c; d[k + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return cv;
}
function stain(x, cx, cy, rx, ry, v) {
  x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, grey(v)); g.addColorStop(0.6, grey(lerp(v, 1, 0.6))); g.addColorStop(1, '#fff');
  x.fillStyle = g; x.fillRect(-rx, -rx, 2 * rx, 2 * rx); x.restore();
}
function crack(x, r, p, a, len, w) {
  let [px, py] = p, ang = a, l = 0;
  x.strokeStyle = grey(0.36); x.lineCap = 'round';
  while (l < len) {
    const s = r.range(4, 11);
    const nx = px + Math.cos(ang) * s, ny = py + Math.sin(ang) * s;
    x.lineWidth = w * (1 - (l / len) * 0.7);
    x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
    px = nx; py = ny; l += s; ang += r.range(-0.55, 0.55);
    if (r() < 0.09 && len - l > 30) crack(x, r, [px, py], ang + r.range(-1, 1), (len - l) * 0.5, w * 0.6);
  }
}

function paintAlbedo(x, nz) {
  const r = rng(hash(ID, 'albedo'));
  // ---- wall plaster
  x.fillStyle = grey(0.74); x.fillRect(-PAD, -PAD, SPAN, YB + PAD);
  x.save();
  x.globalCompositeOperation = 'multiply';
  x.drawImage(nz.big, -PAD, -PAD, SPAN, YB + PAD);
  x.drawImage(nz.fine, -PAD, -PAD, SPAN, YB + PAD);
  stain(x, 10, 720, 150, 70, 0.72); stain(x, 960, 140, 120, 160, 0.8); stain(x, 640, 40, 220, 60, 0.82);
  stain(x, 300, 520, 160, 90, 0.88); stain(x, 900, 420, 90, 60, 0.84);
  for (const [sx, w] of [[70, 9], [104, 14], [146, 7]]) {          // water streaks under the sill
    const g = x.createLinearGradient(0, 434, 0, 620);
    g.addColorStop(0, grey(0.78)); g.addColorStop(1, '#fff');
    x.fillStyle = g; x.fillRect(sx - w / 2, 434, w, 186);
  }
  x.restore();
  crack(x, r, [858, 0], 1.75, 210, 1.5); crack(x, r, [520, 0], 1.45, 120, 1.2); crack(x, r, [960, 236], 2.6, 160, 1.3);
  crack(x, r, [230, 300], 2.2, 90, 1.1);
  // cornice / ceiling beam
  x.fillStyle = grey(0.2); x.fillRect(-PAD, -PAD, SPAN, PAD + 16);
  x.fillStyle = grey(0.5); x.fillRect(-PAD, 13, SPAN, 3);
  x.fillStyle = grey(0.12); x.fillRect(-PAD, 16, SPAN, 6);
  // ---- window: splayed reveal, sill, casement
  x.fillStyle = grey(0.72); x.fillRect(WIN.ox0, WIN.oy0, WIN.ox1 - WIN.ox0, WIN.oy1 - WIN.oy0);
  x.fillStyle = grey(0.62); x.fillRect(WIN.ox0 - 6, WIN.oy1 - 2, WIN.ox1 - WIN.ox0 + 12, 9);
  x.fillStyle = grey(0.04); x.fillRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
  // curtain rod
  x.fillStyle = grey(0.14); x.fillRect(20, 95, 104, 5); x.beginPath(); x.arc(20, 97.5, 5, 0, TAU); x.fill(); x.beginPath(); x.arc(124, 97.5, 5, 0, TAU); x.fill();
  // ---- plaque (title card)
  x.fillStyle = grey(0.3); x.fillRect(PLAQ.x0 - 6, PLAQ.y0 - 6, PLAQ.x1 - PLAQ.x0 + 12, PLAQ.y1 - PLAQ.y0 + 12);
  x.fillStyle = grey(0.06); x.fillRect(PLAQ.x0, PLAQ.y0, PLAQ.x1 - PLAQ.x0, PLAQ.y1 - PLAQ.y0);
  x.drawImage(nz.title, PLAQ.x0, PLAQ.y0, PLAQ.x1 - PLAQ.x0, PLAQ.y1 - PLAQ.y0);
  // ---- door: architrave, pointed leaf, panels
  x.fillStyle = grey(0.56); x.beginPath(); poly(x, doorShape(13)); x.fill();
  x.fillStyle = grey(0.2); x.beginPath(); poly(x, doorShape(3)); x.fill();
  x.fillStyle = grey(0.44); x.beginPath(); poly(x, doorShape(0)); x.fill();
  for (const [a, b, c, d] of [[712, 140, 752, 224], [760, 140, 800, 224], [712, 238, 752, 320], [760, 238, 800, 320]]) {
    x.fillStyle = grey(0.58); x.fillRect(a, b, c - a, d - b);
    x.fillStyle = grey(0.22); x.fillRect(a, b, c - a, 3); x.fillRect(a, b, 3, d - b);
    x.fillStyle = grey(0.48); x.fillRect(a + 6, b + 6, c - a - 12, d - b - 12);
  }
  x.fillStyle = grey(0.12); x.fillRect(714, 248, 11, 18);          // keyhole plate
  x.fillStyle = grey(0.02); x.beginPath(); x.arc(719.5, 254, 2.2, 0, TAU); x.fill(); x.fillRect(718.6, 254, 1.8, 6);
  x.fillStyle = grey(0.4); x.fillRect(692, LAND_Y - 6, 128, 6);      // threshold
  // ---- stair face (solid plastered staircase + landing)
  x.save();
  x.beginPath(); poly(x, FACE); x.clip();
  x.fillStyle = grey(0.8); x.fillRect(-PAD, LAND_Y - 2, SPAN, YB - LAND_Y + 4);
  x.globalCompositeOperation = 'multiply';
  x.drawImage(nz.fine, -PAD, -PAD, SPAN, YB + PAD);
  x.drawImage(nz.big, 300, 0, SPAN, YB + PAD);
  stain(x, 520, 740, 200, 50, 0.82);
  x.globalCompositeOperation = 'source-over';
  // string moulding following the flight, then the landing beam
  const sm = []; for (let k = 0; k <= 20; k++) { const xx = lerp(ST.x0, LAND_X, k / 20); sm.push([xx, yN(xx) + 34]); }
  x.strokeStyle = grey(0.58); x.lineWidth = 9; x.beginPath(); poly(x, sm, false); x.stroke();
  x.strokeStyle = grey(0.38); x.lineWidth = 1.6; x.beginPath(); poly(x, sm.map((p) => [p[0], p[1] - 4.5]), false); x.stroke();
  x.strokeStyle = grey(0.9); x.lineWidth = 1.2; x.beginPath(); poly(x, sm.map((p) => [p[0], p[1] + 4.5]), false); x.stroke();
  x.fillStyle = grey(0.22); x.fillRect(LAND_X - 8, LAND_Y, 1040 - LAND_X, 28);
  x.fillStyle = grey(0.5); x.fillRect(LAND_X - 8, LAND_Y + 26, 1040 - LAND_X, 2.5);
  x.fillStyle = grey(0.22); x.beginPath(); x.moveTo(LAND_X - 8, LAND_Y + 28); x.lineTo(LAND_X + 26, LAND_Y + 28); x.lineTo(LAND_X - 8, LAND_Y + 70); x.fill();
  // arch under the landing
  x.fillStyle = grey(0.66); x.beginPath(); poly(x, archShape(17)); x.fill();
  x.strokeStyle = grey(0.42); x.lineWidth = 1.2;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI + (k / 10) * Math.PI;
    x.beginPath(); x.moveTo(ARCH.cx + Math.cos(a) * ARCH.r, ARCH.spring + Math.sin(a) * ARCH.r);
    x.lineTo(ARCH.cx + Math.cos(a) * (ARCH.r + 17), ARCH.spring + Math.sin(a) * (ARCH.r + 17)); x.stroke();
  }
  x.fillStyle = grey(0.03); x.beginPath(); poly(x, archShape(0)); x.fill();
  for (let k = 0; k < 6; k++) { x.fillStyle = grey(0.1 - k * 0.012); x.fillRect(ARCH.cx - 40 + k * 8, 690 + k * 12, 120 - k * 14, 4); }
  // skirting
  x.fillStyle = grey(0.24); x.fillRect(-PAD, YB - 20, SPAN, 20);
  x.fillStyle = grey(0.45); x.fillRect(-PAD, YB - 21, SPAN, 2);
  x.restore();
  x.fillStyle = grey(0.24); x.fillRect(-PAD, YB - 20, ST.x0 + PAD, 20);
  x.fillStyle = grey(0.45); x.fillRect(-PAD, YB - 21, ST.x0 + PAD, 2);
  x.fillStyle = grey(0.03); x.beginPath(); poly(x, archShape(0)); x.fill();
  // crisp contact line where the flight meets the wall
  x.strokeStyle = grey(0.3); x.lineWidth = 1.4; x.beginPath(); poly(x, SAW.slice(0, -1), false); x.stroke();
  for (let k = 0; k < ST.n; k++) { const y = YB - (k + 1) * ST.R; x.fillStyle = grey(0.92); x.fillRect(ST.x0 + k * ST.T, y, ST.T, 1.6); }
  // ---- banister (dark oak)
  x.fillStyle = grey(0.15);
  for (const p of BAN) { x.beginPath(); poly(x, p); x.fill(); }
  x.strokeStyle = grey(0.42); x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(46, yR(46) + 6); x.lineTo(590, yR(590) + 6); x.stroke();
  for (let k = 0; k < ST.n - 1; k += 2) {
    const xc = ST.x0 + k * ST.T + ST.T / 2;
    x.beginPath(); x.moveTo(xc + 3.6, YB - (k + 1) * ST.R - 2); x.lineTo(xc + 3.2, yR(xc) + 8); x.stroke();
  }
  // ---- floor: dark boards in forced perspective
  x.fillStyle = grey(0.28); x.fillRect(-PAD, YB, SPAN, 1000 + PAD - YB);
  const VP = [520, 250], Y1 = 1000 + PAD;
  const pr = (xx, yy) => VP[0] + (xx - VP[0]) * (yy - VP[1]) / (YB - VP[1]);
  for (let i = -4; i < 34; i++) {
    const xa = -60 + i * 34, xb = xa + 34;
    x.fillStyle = grey(0.24 + 0.1 * r());
    x.beginPath(); poly(x, [[xa, YB], [xb, YB], [pr(xb, Y1), Y1], [pr(xa, Y1), Y1]]); x.fill();
    x.strokeStyle = grey(0.18); x.lineWidth = 0.7;
    for (let q = 0; q < 3; q++) { const f = 0.2 + 0.3 * q + r.range(-0.05, 0.05); x.beginPath(); x.moveTo(lerp(xa, xb, f), YB); x.lineTo(lerp(pr(xa, Y1), pr(xb, Y1), f), Y1); x.stroke(); }
    const yj = r.range(800, 980);
    x.strokeStyle = grey(0.08); x.lineWidth = 1.2; x.beginPath(); x.moveTo(pr(xa, yj), yj); x.lineTo(pr(xb, yj), yj); x.stroke();
    x.strokeStyle = grey(0.07); x.lineWidth = 1.5; x.beginPath(); x.moveTo(xa, YB); x.lineTo(pr(xa, Y1), Y1); x.stroke();
  }
  x.fillStyle = grey(0.1); x.fillRect(-PAD, YB, SPAN, 2.5);
}

function paintShade(x) {
  x.fillStyle = sv(1); x.fillRect(-PAD, -PAD, SPAN, SPAN);
  // the flight's own cast shadow on the wall, then the face itself fully lit (a touch brighter: nearer the lamp)
  x.fillStyle = sv(0.62); x.beginPath(); poly(x, FACE.map((p) => toLamp(p, 1.012))); x.fill();
  x.fillStyle = sv(1.06); x.beginPath(); poly(x, FACE); x.fill();
  // architrave and plaque throw small shadows up-left
  x.fillStyle = sv(0.58); x.beginPath(); poly(x, doorShape(13).map((p) => toLamp(p, 1.02))); x.fill();
  x.fillStyle = sv(1.02); x.beginPath(); poly(x, doorShape(13)); x.fill();
  x.fillStyle = sv(0.6); x.beginPath(); poly(x, doorShape(0)); x.fill();
  x.fillStyle = sv(0.95); x.beginPath(); poly(x, doorShape(0).map((p) => [p[0] + 7, p[1] + 6])); x.fill();
  x.fillStyle = sv(1.06); x.fillRect(692, LAND_Y - 6, 128, 6);
  const pq = rectP(PLAQ.x0 - 6, PLAQ.y0 - 6, PLAQ.x1 + 6, PLAQ.y1 + 6);
  x.fillStyle = sv(0.6); x.beginPath(); poly(x, pq.map((p) => toLamp(p, 1.012))); x.fill();
  x.fillStyle = sv(1.3); x.beginPath(); poly(x, pq); x.fill();                 // lacquer & gilt catch the lamp
  // window reveal: jambs facing the lamp lit, the others in shade; the sill catches little lamp light
  x.fillStyle = sv(1.12); x.fillRect(WIN.ox0, WIN.oy0, WIN.x0 - WIN.ox0, WIN.oy1 - WIN.oy0);
  x.fillStyle = sv(0.5); x.fillRect(WIN.x1, WIN.oy0, WIN.ox1 - WIN.x1, WIN.oy1 - WIN.oy0);
  x.fillStyle = sv(1.08); x.fillRect(WIN.ox0, WIN.oy0, WIN.ox1 - WIN.ox0, WIN.y0 - WIN.oy0);
  x.fillStyle = sv(0.62); x.fillRect(WIN.ox0, WIN.y1, WIN.ox1 - WIN.ox0, WIN.oy1 - WIN.y1);
  // arch: the soffit and the left jamb face the lamp; the passage is black
  x.fillStyle = sv(0.12); x.beginPath(); poly(x, archShape(0)); x.fill();
  x.fillStyle = sv(0.45); x.beginPath(); poly(x, archShape(0).map((p) => [p[0] + 14, p[1] + 8])); x.fill();
  x.fillStyle = sv(0.06); x.beginPath(); poly(x, archShape(-12).map((p) => [p[0] + 18, p[1] + 10])); x.fill();
  // banister fully lit (it stands in front of the stair's shadow band)
  x.fillStyle = sv(1.05); for (const p of BAN) { x.beginPath(); poly(x, p); x.fill(); }
  // occlusion along the wall base and under the cornice
  let g = x.createLinearGradient(0, YB - 70, 0, YB); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  x.fillStyle = g; x.fillRect(-PAD, YB - 70, SPAN, 70);
  g = x.createLinearGradient(0, YB, 0, YB + 50); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(-PAD, YB, SPAN, 50);
  g = x.createLinearGradient(0, 22, 0, 90); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(-PAD, 22, SPAN, 68);
}

function paintMoon(x) {
  x.fillStyle = '#000'; x.fillRect(-PAD, -PAD, SPAN, SPAN);
  x.save();
  const wall = new Path2D(); wall.rect(-PAD, -PAD, SPAN, YB + PAD); poly(wall, FACE);
  x.clip(wall, 'evenodd');
  const g = x.createRadialGradient(112, 270, 60, 112, 270, 300);
  g.addColorStop(0, grey(0.3)); g.addColorStop(0.5, grey(0.1)); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(-PAD, -PAD, 500, 760);
  x.restore();
  x.fillStyle = grey(0.42); x.fillRect(WIN.x1, WIN.oy0, WIN.ox1 - WIN.x1, WIN.oy1 - WIN.oy0);
  x.fillStyle = grey(0.26); x.fillRect(WIN.ox0, WIN.oy0, WIN.x0 - WIN.ox0, WIN.oy1 - WIN.oy0);
  x.fillStyle = grey(0.9); x.fillRect(WIN.ox0 - 6, WIN.y1, WIN.ox1 - WIN.ox0 + 12, WIN.oy1 - WIN.y1 + 2);
}

function paintEmit(x) {
  x.fillStyle = '#000'; x.fillRect(-PAD, -PAD, SPAN, SPAN);
  x.save();
  x.beginPath(); x.rect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0); x.clip();
  let g = x.createLinearGradient(0, WIN.y0, 0, WIN.y1);
  g.addColorStop(0, grey(0.5)); g.addColorStop(0.7, grey(0.62)); g.addColorStop(1, grey(0.7));
  x.fillStyle = g; x.fillRect(WIN.x0, WIN.y0, 200, 300);
  g = x.createRadialGradient(150, 160, 4, 150, 160, 90);
  g.addColorStop(0, grey(1)); g.addColorStop(0.12, grey(0.92)); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(WIN.x0, WIN.y0, 200, 300);
  x.globalCompositeOperation = 'source-over';
  // gabled roofs and a spire of the town outside
  x.fillStyle = grey(0.05);
  x.beginPath(); x.moveTo(WIN.x0, WIN.y1);
  const roof = [[52, 330], [70, 312], [86, 332], [92, 300], [104, 270], [116, 300], [122, 318], [134, 296], [146, 318], [150, 250], [153, 196], [156, 250], [160, 326], [172, 318]];
  for (const p of roof) x.lineTo(p[0], p[1]);
  x.lineTo(WIN.x1, WIN.y1); x.closePath(); x.fill();
  x.fillStyle = grey(0.35); x.fillRect(96, 316, 3, 4); x.fillRect(138, 330, 3, 4);
  x.restore();
  // casement frame, mullion and transoms, leaded quarries
  x.fillStyle = '#000';
  x.fillRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, 5); x.fillRect(WIN.x0, WIN.y1 - 5, WIN.x1 - WIN.x0, 5);
  x.fillRect(WIN.x0, WIN.y0, 5, WIN.y1 - WIN.y0); x.fillRect(WIN.x1 - 5, WIN.y0, 5, WIN.y1 - WIN.y0);
  x.fillRect(109, WIN.y0, 6, WIN.y1 - WIN.y0); x.fillRect(WIN.x0, 215, WIN.x1 - WIN.x0, 6); x.fillRect(WIN.x0, 310, WIN.x1 - WIN.x0, 6);
  x.strokeStyle = '#000'; x.lineWidth = 0.9;
  for (const [a, b] of PANE_X) for (const [c, d] of PANE_Y) {
    for (let k = 1; k < 3; k++) { const yy = lerp(c, d, k / 3); x.beginPath(); x.moveTo(a, yy); x.lineTo(b, yy); x.stroke(); }
    const xx = (a + b) / 2; x.beginPath(); x.moveTo(xx, c); x.lineTo(xx, d); x.stroke();
  }
}

function paintRegion(x) {
  x.fillStyle = 'rgb(0,0,0)'; x.fillRect(-PAD, -PAD, SPAN, SPAN);
  x.fillStyle = 'rgb(128,0,0)'; x.beginPath(); poly(x, FACE); x.fill();
  for (const p of BAN) { x.beginPath(); poly(x, p); x.fill(); }
  x.fillStyle = 'rgb(255,0,0)'; x.fillRect(-PAD, YB, SPAN, 1000 + PAD - YB);
}

function titleCv() {
  // the plaque face (albedo): gilt double rule, corner ornaments and lettering, worn
  const W = Math.ceil((PLAQ.x1 - PLAQ.x0) * SR * 2), H = Math.ceil((PLAQ.y1 - PLAQ.y0) * SR * 2), s = SR * 2;
  const cv = mk(W, H), x = c2d(cv);
  x.setTransform(s, 0, 0, s, 0, 0);
  const w = PLAQ.x1 - PLAQ.x0, h = PLAQ.y1 - PLAQ.y0;
  x.fillStyle = grey(0.06); x.fillRect(0, 0, w, h);
  x.strokeStyle = grey(0.86); x.lineWidth = 1.6; x.strokeRect(9, 9, w - 18, h - 18);
  x.lineWidth = 0.8; x.strokeRect(13, 13, w - 26, h - 26);
  for (const [cx, cy, sx, sy] of [[13, 13, 1, 1], [w - 13, 13, -1, 1], [13, h - 13, 1, -1], [w - 13, h - 13, -1, -1]]) {
    x.save(); x.translate(cx, cy); x.scale(sx, sy);
    x.lineWidth = 1.3; x.beginPath(); x.moveTo(0, 16); x.quadraticCurveTo(2, 2, 16, 0); x.stroke();
    x.beginPath(); x.moveTo(5, 22); x.quadraticCurveTo(6, 6, 22, 5); x.stroke();
    x.fillStyle = grey(0.86); x.beginPath(); x.moveTo(4, 4); x.lineTo(10, 6); x.lineTo(6, 10); x.closePath(); x.fill();
    x.restore();
  }
  x.fillStyle = grey(0.9); x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.font = '900 46px "Songti SC", serif';
  x.letterSpacing = '7px';
  x.fillText('诺斯费拉图', w / 2 + 3.5, 76);
  x.letterSpacing = '1px';
  x.font = '28px Trattatello, "Apple Chancery", serif';
  x.fillText('Nosferatu · 1922', w / 2, 108);
  x.fillRect(w / 2 - 70, 86, 140, 1); x.beginPath(); x.arc(w / 2, 86.5, 2.2, 0, TAU); x.fill();
  // paint wear: flaked gilt
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  const r = rng(hash(ID, 'wear'));
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(0,0,0,${r.range(0.2, 0.8).toFixed(2)})`; x.beginPath(); x.arc(r() * W, r() * H, r.range(0.5, 2.2), 0, TAU); x.fill(); }
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = grey(0.06); x.fillRect(0, 0, W, H);
  return cv;
}

function buildSet() {
  const W = Math.ceil(SPAN * SR), H = W;
  const cv = [0, 1, 2, 3, 4].map(() => mk(W, H)), xs = cv.map(c2d);
  for (const x of xs) x.setTransform(SR, 0, 0, SR, PAD * SR, PAD * SR);
  const nz = { big: noiseCv(160, 130, 22, 5, 0.8, 1.02), fine: noiseCv(420, 330, 3.2, 9, 0.86, 1.03, 3), title: titleCv() };
  paintAlbedo(xs[0], nz); paintShade(xs[1]); paintMoon(xs[2]); paintEmit(xs[3]); paintRegion(xs[4]);
  const D = xs.map((x) => x.getImageData(0, 0, W, H).data);
  const out = (P) => {
    const id = new ImageData(W, H), o = id.data, R2 = R0 * R0;
    const dA = D[0], dS = D[1], dM = D[2], dE = D[3], dR = D[4];
    for (let j = 0; j < H; j++) {
      const dy = j / SR - PAD - LAMP[1], dy2 = dy * dy;
      for (let i = 0; i < W; i++) {
        const k = (j * W + i) * 4;
        const a = dA[k] / 255, dc = dR[k], Dd = dc < 64 ? D_WALL : dc < 192 ? D_FACE : D_FLOOR;
        const dx = i / SR - PAD - LAMP[0];
        const lamp = P * (dS[k] / 170) / (1 + (dx * dx + dy2 + Dd * Dd) / R2);
        const moonE = a * (dM[k] / 255) * MOON + (dE[k] / 255) * EMIT;
        const tot = a * (AMB + lamp) + moonE;
        const f = moonE / (tot + 1e-4);
        const vi = CURVE[Math.min(4095, (tot * 1023.75) | 0)] * 3;
        o[k] = LA[vi] + (LB[vi] - LA[vi]) * f;
        o[k + 1] = LA[vi + 1] + (LB[vi + 1] - LA[vi + 1]) * f;
        o[k + 2] = LA[vi + 2] + (LB[vi + 2] - LA[vi + 2]) * f;
        o[k + 3] = 255;
      }
    }
    const raw = mk(W, H); c2d(raw).putImageData(id, 0, 0);
    const c = mk(W, H), y = c2d(c);
    y.filter = 'blur(0.55px)'; y.drawImage(raw, 0, 0); y.filter = 'none';
    return c;
  };
  const litC = out(P_LAMP), darkC = out(0);
  // small set_dark copy in the live shadow canvas' frame: the colour of "no lamp light"
  const sm = mk(SPAN * SS, SPAN * SS); c2d(sm).drawImage(darkC, 0, 0, sm.width, sm.height);
  // door leaf sprites (for the door that opens by itself)
  const leaf = (src) => {
    const x0 = DOOR.x0 - 1, y0 = DOOR.y0 - 1, w = DOOR.x1 - DOOR.x0 + 2, h = DOOR.y1 - DOOR.y0 + 1;
    const c = mk(w * SR, h * SR), x = c2d(c);
    x.setTransform(SR, 0, 0, SR, -x0 * SR, -y0 * SR);
    x.beginPath(); poly(x, doorShape(0)); x.clip();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(src, (x0 + PAD) * SR, (y0 + PAD) * SR, c.width, c.height, 0, 0, c.width, c.height);
    return toImage(c);
  };
  return { lit: toImage(litC), dark: toImage(darkC), darkSmall: sm, leafLit: leaf(litC), leafDark: leaf(darkC) };
}

// ------------------------------------------------------------------ film sprites
function grainCv(N, seed, dark) {
  const cv = mk(N, N), x = c2d(cv), id = x.createImageData(N, N), d = id.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = hash3(i, j, seed) * 0.45 + hash3(i >> 1, j >> 1, seed + 7) * 0.35 + hash3(i >> 2, j >> 2, seed + 13) * 0.2;
    const a = dark ? Math.max(0, v - 0.56) / 0.44 : Math.max(0, 0.4 - v) / 0.4;
    const k = (j * N + i) * 4;
    d[k] = dark ? 10 : 255; d[k + 1] = dark ? 6 : 240; d[k + 2] = dark ? 3 : 212; d[k + 3] = Math.round(a * a * 255);
  }
  x.putImageData(id, 0, 0);
  return cv;
}
function vignetteCv() {
  const N = 512, cv = mk(N, N), x = c2d(cv), s = N / SPAN;
  x.setTransform(s, 0, 0, s, PAD * s, PAD * s);
  x.save(); x.translate(500, 500); x.scale(1, 1.04);
  const g = x.createRadialGradient(0, -30, 260, 0, -30, 760);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(4,2,1,0.22)'); g.addColorStop(0.8, 'rgba(4,2,1,0.62)'); g.addColorStop(1, 'rgba(4,2,1,0.85)');
  x.fillStyle = g; x.fillRect(-600, -600, 1200, 1200);
  x.restore();
  const t = x.createLinearGradient(0, -PAD, 0, 260); t.addColorStop(0, 'rgba(4,2,1,0.45)'); t.addColorStop(1, 'rgba(4,2,1,0)');
  x.fillStyle = t; x.fillRect(-PAD, -PAD, SPAN, 284);
  return cv;
}
function apertureCv() {
  const N = 640, cv = mk(N, N), x = c2d(cv), s = N / SPAN;
  x.setTransform(s, 0, 0, s, PAD * s, PAD * s);
  x.fillStyle = 'rgb(3,2,1)'; x.fillRect(-PAD, -PAD, SPAN, SPAN);
  x.globalCompositeOperation = 'destination-out';
  x.filter = `blur(${(3 * s).toFixed(2)}px)`;
  x.beginPath(); x.roundRect(2, 2, 996, 996, 74); x.fill();
  x.filter = 'none';
  return cv;
}
function radialCv(N) {
  const cv = mk(N, N), x = c2d(cv), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return cv;
}
function streakCv() {
  const cv = mk(256, 16), x = c2d(cv);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 16);
  x.globalCompositeOperation = 'destination-in';
  const v = x.createLinearGradient(0, 0, 0, 16); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = v; x.fillRect(0, 0, 256, 16);
  return cv;
}
function dustCv() {
  // 8 cells of 64 px: specks, blobs, hairs (dark)
  const cv = mk(512, 64), x = c2d(cv), r = rng(hash(ID, 'dust'));
  x.fillStyle = x.strokeStyle = 'rgb(8,5,2)'; x.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    x.save(); x.translate(k * 64 + 32, 32);
    if (k < 4) {
      x.beginPath();
      const n = 9, R = 6 + k * 3;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = R * r.range(0.55, 1); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fill();
    } else {
      x.lineWidth = 1.6; x.beginPath(); x.moveTo(-26, r.range(-10, 10));
      x.bezierCurveTo(r.range(-20, 0), r.range(-30, 30), r.range(0, 20), r.range(-30, 30), 26, r.range(-14, 14)); x.stroke();
    }
    x.restore();
  }
  return cv;
}
function handleCv() {
  const s = 4, cv = mk(36 * s, 20 * s), x = c2d(cv);
  x.setTransform(s, 0, 0, s, 8 * s, 10 * s);       // rosette at (0, 0)
  x.fillStyle = 'rgb(24,15,8)'; x.beginPath(); x.arc(0, 0, 6, 0, TAU); x.fill();
  x.fillStyle = 'rgb(20,12,6)'; x.beginPath(); x.roundRect(-1, -2.4, 25, 4.8, 2.4); x.fill();
  x.fillStyle = 'rgb(150,104,48)'; x.fillRect(1, 1.2, 22, 1.1); x.beginPath(); x.arc(1.5, 2, 3.5, 0, Math.PI); x.fill();
  return cv;
}
function beyondCv() {
  // what lies behind the door: a cold corridor light, masked to the pointed doorway
  const W = DOOR.x1 - DOOR.x0, H = DOOR.y1 - DOOR.y0, s = 2, cv = mk(W * s, H * s), x = c2d(cv);
  x.setTransform(s, 0, 0, s, -DOOR.x0 * s, -DOOR.y0 * s);
  x.beginPath(); poly(x, doorShape(0)); x.clip();
  x.setTransform(s, 0, 0, s, 0, 0);
  x.fillStyle = 'rgb(3,5,10)'; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W * 0.55, H * 0.55, 6, W * 0.55, H * 0.55, 130);
  g.addColorStop(0, 'rgba(200,214,236,0.95)'); g.addColorStop(0.18, 'rgba(110,140,184,0.7)'); g.addColorStop(0.55, 'rgba(26,40,66,0.5)'); g.addColorStop(1, 'rgba(3,5,10,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(2,3,6,0.9)'; x.fillRect(0, H - 40, W, 40);
  return cv;
}

// ------------------------------------------------------------------ lamp, exposure, time
const frameOf = (u) => Math.floor((u + 40) * 18 + 1e-6);          // 18 fps film frame index
function lampI(u) {
  const fr = frameOf(u);
  if (u >= 6) {
    if (u < 6.02) return 2.3;                                       // the flare: one frame
    return 0.15 + 0.035 * (hash3(fr, 3, 71) - 0.5) + 0.25 * Math.exp(-(u - 6.03) / 0.07);
  }
  let I = 1 + 0.06 * (hash3(fr, 1, 71) - 0.5);
  const b = (u + 40) * 2, bi = Math.floor(b + 1e-6), dt = (b - bi) * 0.5;
  I -= (bi % 4 === 0 ? 0.24 : 0.12) * Math.exp(-((dt / 0.045) ** 2));
  const bz = smoothstep(4.9, 5.85, u);
  if (bz > 0) {
    I += bz * 0.55 * (hash3(fr, 2, 71) - 0.6);
    if (hash3(fr, 4, 71) < 0.2 * bz) I *= 0.4;
  }
  return clamp(I, 0.22, 1.12);
}
const exposureOf = (fr) => 1 + 0.045 * (hash3(fr, 9, 72) - 0.5);
/** Lag of the shadow's source time while it slows to a stop (u 1 → 1.75). */
function lagTau(u) {
  const a = 1, b = 1.75;
  if (u <= a) return u;
  const t = clamp((u - a) / (b - a));
  return u - (b - a) * (t * t * t - (t * t * t * t) / 2) - Math.max(0, u - b);
}
const TAU_END = lagTau(1.75);
const LAG_LEAN = (u) => 0.04 - 0.16 * smoothstep(1.0, 1.6, u) + 0.06 * smoothstep(1.75, 2.0, u);
const HOPS = [2.0, 2.25, 2.5, 2.75];
function hops(u) { let p = 0; for (const h of HOPS) p += easeOut(clamp((u - h) / 0.15)); return p; }
function hopLift(u) { let l = 0; for (const h of HOPS) { const e = clamp((u - h) / 0.15); l += Math.sin(Math.PI * e) * 9; } return l; }

// the sheer curtain's swaying inner edge (pure function of u; also cuts the moonlight patch on the floor)
const curtainSway = (u) => 13 * Math.sin(TAU * u / 3.3) + 5 * Math.sin(TAU * u / 1.37 + 1.2);
function curtainEdge(u) {
  const sway = curtainSway(u);
  return (y) => { const t = clamp((y - 100) / 330); return 96 + 6 * Math.sin(1.1 + y / 64) * (0.4 + t) + sway * t * t; };
}

// ------------------------------------------------------------------ the pelican's shadow (geometry)
const LINE_W = { crankFar: 4.5, spoke: 1.5, chain: 2.2, frame: 6.5, fork: 6, stem: 5, bars: 5, seatpost: 5, saddle: 7, crest: 2.6, secondaries: 7, crank: 4.5, pedal: 5 };
const BIRD_UP = new Set(['tail', 'body', 'wing', 'secondaries', 'primary', 'neck', 'head', 'crest', 'pouch', 'bill', 'nail']);
const HEADG = new Set(['head', 'crest', 'pouch', 'bill', 'nail']);
/** Rig-space silhouette pieces with fixed point counts (poses can be blended point by point). */
function rigSil(P) {
  const out = [];
  for (const part of rigParts(P)) {
    const r = part.role;
    if (r === 'eye' || r === 'pupil' || r === 'face' || r === 'eyeShut' || r === 'hub') continue;
    if (part.kind === 'circle') {
      if (r === 'tire') out.push({ r, kind: 'ring', pts: circ(part.c, part.r - 3.5, 44), w: 7 });
      else if (r === 'rim') out.push({ r, kind: 'ring', pts: circ(part.c, part.r, 32), w: 2.2 });
      else out.push({ r, kind: 'poly', pts: circ(part.c, part.r, r === 'head' ? 22 : 14) });
    } else if (part.kind === 'poly') out.push({ r, kind: 'poly', pts: sub2(part.pts) });
    else if (r === 'primary') out.push({ r, kind: 'feather', pts: resampleN(part.pts, 10) });
    else out.push({ r, kind: 'line', pts: resampleN(part.pts, r === 'spoke' ? 2 : part.pts.length > 2 ? 8 : 3), w: LINE_W[r] ?? 4 });
  }
  return out;
}
/** Shadow projection: stretched and keystoned from the low lamp, leaning, sheared onto a slope m through (ax, ay). */
function mapper(S) {
  return (q) => {
    const h = -q[1], kx = S.sx * (1 + S.key * h / 330);
    return [S.ax + kx * q[0] + S.lean * S.sy * h, S.ay - S.m * S.sx * q[0] - S.sy * h];
  };
}
function attParams(bx) {
  const g = smoothstep(450, 1014, bx);
  return { ax: bx - 70 - 330 * g, ay: YB, sx: 1.15 + 0.4 * g, sy: 1.55 + 0.75 * g, lean: 0.04, m: 0, key: 0.25 };
}
/** Warp the bill (and nail, pouch) into a claw whose hooked tip lands on H. */
function clawWarp(pts, F, e) {
  if (e <= 0) return pts;
  const { b0, b1, H } = F;
  const vx = b1[0] - b0[0], vy = b1[1] - b0[1], L0 = Math.hypot(vx, vy) || 1, ux = vx / L0, uy = vy / L0;
  const a0 = Math.atan2(vy, vx);
  let da = Math.atan2(H[1] - b0[1], H[0] - b0[0]) - a0;
  while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  const k = lerp(1, Math.hypot(H[0] - b0[0], H[1] - b0[1]) / L0, e), CURL = 0.6;
  return pts.map((p) => {
    const rx = p[0] - b0[0], ry = p[1] - b0[1];
    const al = rx * ux + ry * uy, pe = -rx * uy + ry * ux, t = clamp(al / L0, -0.2, 1.3);
    const along = al * k, perp = pe * (1 - 0.3 * e * clamp(t));
    const ang = a0 + e * (da - CURL) + e * CURL * t * t;
    const c = Math.cos(ang), s = Math.sin(ang);
    return [b0[0] + along * c - perp * s, b0[1] + along * s + perp * c];
  });
}
/** A primary feather stretched into a long hooked finger toward Hf (full extension; blended by e). */
function fingerPts(pts, k, D) {
  const N = pts.length, r0 = pts[0];
  const aT = Math.atan2(D.Hf[1] - r0[1], D.Hf[0] - r0[0]) + (k - 2) * 0.17 + (D.twitch ? D.twitch[k] : 0);
  const LT = Math.hypot(D.Hf[0] - r0[0], D.Hf[1] - r0[1]) * (0.8 + 0.07 * k - 0.12 * Math.abs(k - 2));
  const out = [];
  let x = r0[0], y = r0[1];
  const st = LT / (N - 1);
  for (let i = 0; i < N; i++) { const t = i / (N - 1); out.push([x, y]); const a = aT - 0.32 + 0.9 * t * t; x += Math.cos(a) * st; y += Math.sin(a) * st; }
  const e = D.fingers;
  return pts.map((p, i) => [lerp(p[0], out[i][0], e), lerp(p[1], out[i][1], e)]);
}
const NOD = {};
/** The shadow's geometry in wall space: list of { kind: 'poly'|'ring'|'line', pts, w }. */
function shadowGeo(P, S, D = NOD) {
  const map = mapper(S), sc = Math.sqrt(S.sx * S.sy);
  const hip = P.bird.legNear.hip, hc = P.bird.head.c;
  const hunch = D.hunch || 0, look = D.look || 0;
  const pre = (p, r) => {
    let q = p;
    if (look && HEADG.has(r)) q = rotAbout(q, hc, -look);
    if (hunch && BIRD_UP.has(r)) q = rotAbout(q, hip, hunch);
    return map(q);
  };
  let F = null;
  if (D.reach > 0) { const ub = P.bird.upperBill; F = { b0: pre(mid(ub[0], ub[7]), 'bill'), b1: pre(ub[3], 'bill'), H: D.H }; }
  const out = [];
  let fk = 0;
  for (const s of rigSil(P)) {
    let pts = s.pts.map((p) => pre(p, s.r));
    if (F && (s.r === 'bill' || s.r === 'nail')) pts = clawWarp(pts, F, D.reach);
    else if (F && s.r === 'pouch') pts = clawWarp(pts, F, D.reach);
    if (s.kind === 'feather') {
      if (D.fingers > 0) pts = fingerPts(pts, fk, D);
      fk++;
      const ext = D.fingers || 0;
      out.push({ kind: 'poly', pts: taper(pts, lerp(6, 15, ext) * sc, lerp(1.6, 1.2, ext) * sc, lerp(1, 2.2, ext)) });
    } else out.push({ kind: s.kind, pts, w: (s.w || 0) * sc });
  }
  return out;
}
function lerpGeo(A, B, w) {
  return A.map((s, i) => {
    const t = B[i];
    return { kind: s.kind, w: lerp(s.w || 0, t.w || 0, w), pts: s.pts.map((p, j) => [lerp(p[0], t.pts[j][0], w), lerp(p[1], t.pts[j][1], w)]) };
  });
}
function fillGeo(x, G) {
  x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 2.4;
  for (const s of G) if (s.kind === 'poly') { x.beginPath(); poly(x, s.pts); x.fill(); x.stroke(); }
  for (const s of G) {
    if (s.kind === 'poly') continue;
    x.lineWidth = s.w; x.beginPath(); poly(x, s.pts, s.kind === 'ring'); x.stroke();
  }
}
/** Draw a shadow mask: wall projection above the stair's sawtooth, the nearer face's projection below it. */
function drawSil(x, G, PT) {
  x.save(); x.clip(PT.wall, 'evenodd'); fillGeo(x, G); x.restore();
  x.save(); x.clip(PT.face);
  x.translate(LAMP[0], LAMP[1]); x.scale(1 - EPS_F, 1 - EPS_F); x.translate(-LAMP[0], -LAMP[1]);
  fillGeo(x, G); x.restore();
}

// ------------------------------------------------------------------ the pelican (tonal, hard expressionist light)
const ALB = {
  legFar: 0.26, footFar: 0.24, crankFar: 0.3, tire: 0.05, rim: 0.55, spoke: 0.62, hub: 0.5, chain: 0.25,
  frame: 0.13, fork: 0.13, stem: 0.45, bars: 0.45, seatpost: 0.45, saddle: 0.08, ring: 0.5,
  tail: 0.88, body: 0.92, wing: 0.9, secondaries: 0.1, primary: 0.08, neck: 0.92, head: 0.92, crest: 0.85,
  pouch: 0.32, bill: 0.5, nail: 0.18, face: 0.42, eye: 0.95, pupil: 0.02, leg: 0.3, foot: 0.28, crank: 0.4, pedal: 0.2,
};
const CRES = { tail: 16, body: 44, wing: 26, neck: 15, head: 12, pouch: 13, bill: 6, nail: 3, legFar: 7, footFar: 4, leg: 9, foot: 4, face: 4, ring: 6 };
function centroid(P) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; }
function dirTo(p, q) { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
function shadePoly(c, pts, cols, d, L) {
  c.fillStyle = cols[0]; c.beginPath(); poly(c, pts); c.fill();
  if (d <= 0) return;
  c.save(); c.beginPath(); poly(c, pts); c.clip();
  c.fillStyle = cols[2]; c.fill();
  c.fillStyle = cols[1]; c.beginPath(); poly(c, pts.map((p) => [p[0] - L[0] * d * 0.24, p[1] - L[1] * d * 0.24])); c.fill();
  c.fillStyle = cols[0]; c.beginPath(); poly(c, pts.map((p) => [p[0] - L[0] * d, p[1] - L[1] * d])); c.fill();
  c.restore();
}
function rimPoly(c, pts, col, d, M) {
  c.save(); c.beginPath(); poly(c, pts); c.clip();
  c.fillStyle = col; c.beginPath(); c.rect(-5000, -5000, 10000, 10000); poly(c, pts.map((p) => [p[0] - M[0] * d, p[1] - M[1] * d])); c.fill('evenodd');
  c.restore();
}
function paintRider(c, P, o) {
  const tone = (al, k) => rgba(toneRGB(al * (AMB + k) * o.E));
  const moonC = rgba(toneRGB(o.moon * 1.1 * o.E, 1), 0.95);
  for (const part of rigParts(P)) {
    const r = part.role, al = ALB[r] ?? 0.5, far = part.layer === 'far';
    const ref = part.kind === 'circle' ? part.c : centroid(part.pts);
    const L = dirTo(ref, LAMP), M = dirTo(ref, [112, 250]);
    const key = o.key * (far ? 0.32 : 1) * lampAt(ref[0], ref[1], 300) / P_LAMP;
    const cols = [tone(al, o.fill), tone(al, o.fill + 0.45 * key), tone(al, key)];
    if (part.kind === 'poly' || r === 'head' || r === 'ring') {
      const pts = part.kind === 'poly' ? part.pts : circ(part.c, part.r, 24);
      shadePoly(c, pts, cols, CRES[r] ?? 3, L);
      if (o.moon > 0.02 && !far && (BIRD_UP.has(r) || r === 'leg')) rimPoly(c, pts, moonC, 2.6, M);
      continue;
    }
    if (part.kind === 'circle') {
      const [cx, cy] = part.c, aL = Math.atan2(L[1], L[0]);
      if (r === 'tire') {
        c.lineWidth = 7.4; c.strokeStyle = cols[0]; c.beginPath(); c.arc(cx, cy, part.r - 3.7, 0, TAU); c.stroke();
        c.lineWidth = 2; c.strokeStyle = tone(0.5, key); c.beginPath(); c.arc(cx, cy, part.r - 1.4, aL - 1.1, aL + 1.1); c.stroke();
        if (o.moon > 0.02) { const aM = Math.atan2(M[1], M[0]); c.lineWidth = 1.6; c.strokeStyle = moonC; c.beginPath(); c.arc(cx, cy, part.r - 1.2, aM - 0.7, aM + 0.7); c.stroke(); }
      } else if (r === 'rim') {
        c.lineWidth = 1.8; c.strokeStyle = tone(al, o.fill + 0.25 * key); c.beginPath(); c.arc(cx, cy, part.r, 0, TAU); c.stroke();
        c.lineWidth = 1.2; c.strokeStyle = cols[2]; c.beginPath(); c.arc(cx, cy, part.r, aL - 0.9, aL + 0.9); c.stroke();
      } else if (r === 'hub') { c.fillStyle = cols[1]; c.beginPath(); c.arc(cx, cy, part.r * 1.1, 0, TAU); c.fill(); }
      else if (r === 'eye') { c.fillStyle = tone(0.95, o.fill + 0.75 * key + 0.15); c.beginPath(); c.arc(cx, cy, part.r, 0, TAU); c.fill(); }
      else if (r === 'pupil') { c.fillStyle = 'rgb(6,3,2)'; c.beginPath(); c.arc(cx, cy, part.r, 0, TAU); c.fill(); }
      continue;
    }
    // lines: dark stroke + a lit edge on the side facing the lamp
    const pts = part.pts, w = r === 'spoke' ? 0.8 : (LINE_W[r] ?? 3) * (r === 'frame' ? 1 : 0.95);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (r === 'spoke') { c.lineWidth = 0.75; c.strokeStyle = tone(al, o.fill + 0.5 * key); c.beginPath(); poly(c, pts, false); c.stroke(); continue; }
    if (r === 'crest' || r === 'eyeShut') { c.lineWidth = r === 'crest' ? 2.4 : 1.3; c.strokeStyle = r === 'crest' ? cols[1] : 'rgb(6,3,2)'; c.beginPath(); poly(c, pts, false); c.stroke(); continue; }
    c.lineWidth = w; c.strokeStyle = cols[0]; c.beginPath(); poly(c, pts, false); c.stroke();
    if (r === 'chain' || r === 'secondaries' || r === 'primary') continue;
    const a = pts[0], b = pts[pts.length - 1];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (nx * L[0] + ny * L[1] < 0) { nx = -nx; ny = -ny; }
    c.lineWidth = Math.max(0.8, w * 0.36); c.strokeStyle = cols[2];
    c.beginPath(); poly(c, pts.map((p) => [p[0] + nx * w * 0.3, p[1] + ny * w * 0.3]), false); c.stroke();
  }
}

// ------------------------------------------------------------------ build
let BUILT = null;
function build() {
  const set = buildSet();
  const PT = paths();
  const SWP = Math.ceil(SPAN * SS);
  // the banister's lamp shadow source (mask in the shadow canvas frame)
  const ban = mk(SWP, SWP), bx = c2d(ban);
  bx.setTransform(SS, 0, 0, SS, PAD * SS, PAD * SS); bx.fillStyle = '#000';
  for (const p of BAN) { bx.beginPath(); poly(bx, p); bx.fill(); }
  const vigCv = vignetteCv();
  const g = {
    ...set, PT, ban, SWP,
    grainD: toImage(grainCv(1024, 11, true)), grainL: toImage(grainCv(1024, 23, false)),
    patD: grainCv(256, 31, true), patL: grainCv(256, 37, false),
    vigCv, vig: toImage(vigCv), aper: toImage(apertureCv()), glow: toImage(radialCv(256)), streak: toImage(streakCv()),
    dust: toImage(dustCv()), handle: toImage(handleCv()), beyond: toImage(beyondCv()),
    shadow: liveImg(SWP, SWP),
    rider: liveImg(620, 520),
    curtain: liveImg(Math.ceil(120 * SR), Math.ceil(400 * SR)),
    moon: liveImg(Math.ceil(260 * 0.55), Math.ceil(250 * 0.55)),
    arcs: null, ph: null,
  };
  return g;
}

// ------------------------------------------------------------------ scene
export default {
  freezeU: 3.0,                      // the shadow's claw on the door handle, the pelican still unaware
  ride: RIDE,
  cues: [
    { u: 1.0, name: 'shadowLags' }, { u: 2.0, name: 'shadowClimbs' }, { u: 2.25, name: 'step' }, { u: 2.5, name: 'step' },
    { u: 2.75, name: 'step' }, { u: 3.0, name: 'claw' }, { u: 3.4, name: 'noticed' }, { u: 3.8, name: 'slideDown' },
    { u: 4.0, name: 'snapBack' }, { u: 5.0, name: 'lampBuzz' }, { u: 6.0, name: 'powerOn' }, { u: 8.7, name: 'doorCreak' },
  ],

  async init() {
    try {
      await Promise.all(['900 46px "Songti SC"', '28px Trattatello'].map((f) => document.fonts.load(f, '诺斯费拉图 Nosferatu 1922')));
    } catch { /* fonts are system fonts; loading is only a warm-up */ }
    if (!BUILT) BUILT = build();
    Object.assign(this, BUILT);
  },

  mods(u) {
    if (u <= 3.3 || u >= 4.95) return {};
    const m = {};
    const w = smoothstep(3.36, 3.5, u) * (1 - smoothstep(3.76, 3.92, u));
    if (w > 1e-4) { m.lookBack = 0.9 * w; m.scared = 0.85 * w; if (w > 0.5) m.eye = 'wide'; }
    const hurry = smoothstep(4.0, 4.15, u) * (1 - smoothstep(4.5, 4.9, u));
    if (hurry > 1e-4) m.bob = 1 + 0.45 * hurry;
    return m;
  },

  render(K, u, ctx) {
    const quant = u > 1 && u < 5;
    const uq = quant ? 1 + Math.floor((u - 1) * 18 + 1e-6) / 18 : u;
    const fr = frameOf(u);
    const R = quant ? ctx.riderAt(ctx.t - u + uq) : ctx.rider;
    const I = lampI(quant ? uq : u), E = exposureOf(fr);
    push();
    if (u > 1.1 && u < 4.9) translate((hash3(fr, 1, 73) - 0.5) * 1.8, (hash3(fr, 2, 73) - 0.5) * 2.4);   // gate weave
    imageMode(CORNER); noStroke(); blendMode(BLEND);
    // ---- the set: moonlight only, plus the lamp's light (flickering)
    tint(255 * E); image(this.dark, -PAD, -PAD, SPAN, SPAN);
    tint(255 * E, 255 * clamp(I)); image(this.lit, -PAD, -PAD, SPAN, SPAN);
    if (I > 1) { blendMode(ADD); tint(255 * E, 255 * clamp(I - 1)); image(this.lit, -PAD, -PAD, SPAN, SPAN); blendMode(BLEND); }
    noTint();
    this.drawDoor(u, I, E);
    this.drawHandle(quant ? uq : u, I, E);
    this.drawCurtain(quant ? uq : u, I, E, ctx);
    this.drawMoonPatch(quant ? uq : u, E, ctx);
    // ---- cast shadows (banister, the pelican)
    this.drawShadows(u, uq, I, E, R, ctx);
    // ---- light: the lamp's glow at the lower right, halation round the window
    blendMode(ADD);
    tint(255, 160, 80, 255 * 0.3 * clamp(I, 0, 1.2) * E); image(this.glow, 1080 - 560, 940 - 560, 1120, 1120);
    if (I > 1.5) { tint(255, 246, 228, 255 * 0.85); image(this.glow, 1080 - 900, 900 - 900, 1800, 1800); }
    tint(70, 110, 180, 255 * 0.2 * E); image(this.glow, 112 - 210, 266 - 260, 420, 520);
    blendMode(BLEND); noTint();
    image(this.vig, -PAD, -PAD, SPAN, SPAN);
    this.drawGrain(fr);
    // ---- exit: the shadow powers on (u ≥ 6 only)
    if (u >= 6 && u < 8.05) this.drawPhosphor(u, ctx);
    // ---- the pelican
    if (R.visible) this.drawRider(u, R, I, E, fr, ctx);
    // ---- film damage, aperture
    this.drawDamage(u, fr);
    image(this.aper, -PAD, -PAD, SPAN, SPAN);
    pop();
  },

  // ---------------------------------------------------------------- live set elements
  drawDoor(u, I, E) {
    if (u < 8.2) return;
    const o = keys(u, [[8.2, 0], [8.55, 0.13], [9.1, 0.16], [9.9, 0.52], [10.9, 0.74], [13, 0.82]], easeInOut);
    const th = o * Math.PI / 2, W = DOOR.x1 - DOOR.x0, cw = Math.cos(th), xf = DOOR.x1 - W * cw, dy = 10 * Math.sin(th);
    tint(255 * E); image(this.beyond, DOOR.x0, DOOR.y0, W, DOOR.y1 - DOOR.y0);
    noTint();
    blendMode(ADD); tint(110, 140, 190, 255 * 0.5 * o * E); image(this.glow, DOOR.x0 - 60, 120, 230, 260); blendMode(BLEND); noTint();
    const quad = (img, a) => {
      tint(255 * E * (1 - 0.35 * Math.sin(th)), 255 * a);
      textureMode(NORMAL); texture(img);
      beginShape(); vertex(xf, DOOR.y0 - 1 + dy, 0, 0); vertex(DOOR.x1 + 1, DOOR.y0 - 1, 1, 0); vertex(DOOR.x1 + 1, DOOR.y1, 1, 1); vertex(xf, DOOR.y1 - dy * 0.6, 0, 1); endShape(CLOSE);
      textureMode(IMAGE);
    };
    quad(this.leafDark, 1); quad(this.leafLit, clamp(I)); noTint();
  },

  drawHandle(u, I, E, open) {
    let a = 0, xo = 0;
    if (u > 3.1 && u < 3.45) a = 0.22 * Math.sin((u - 3.1) * TAU * 7) * (1 - (u - 3.1) / 0.35);
    if (u >= 8.2) { const o = keys(u, [[8.2, 0], [8.55, 0.13], [9.1, 0.16], [9.9, 0.52], [10.9, 0.74], [13, 0.82]], easeInOut); xo = (DOOR.x1 - HANDLE[0]) * (1 - Math.cos(o * Math.PI / 2)); }
    const b = lerp(0.18, 1, clamp(I)) * E;
    push(); translate(HANDLE[0] + xo, HANDLE[1]); rotate(a); tint(255 * b); image(this.handle, -8, -10, 36, 20); pop(); noTint();
  },

  drawCurtain(u, I, E, ctx) {
    // a sheer curtain over the left half of the casement, glowing with moonlight, swaying in a draught
    if (ctx.view.x0 > 140) return;
    const L = this.curtain, c = L.c, s = SR, X0 = 16, Y0 = 92;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, L.w, L.h);
    c.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    const sway = curtainSway(u), edge = curtainEdge(u);
    const outer = (y) => { const t = clamp((y - 100) / 330); return 40 + 0.3 * sway * t * t; };
    const N = 24, Yb = (x) => 428 + 4 * Math.sin(x / 9 + u * 1.7);
    const lft = [], rgt = [];
    for (let k = 0; k <= N; k++) { const y = lerp(98, 428, k / N); lft.push([outer(y), y]); rgt.push([edge(y), y]); }
    const shape = lft.concat(rgt.reverse().map(([x, y], i) => (i === 0 ? [x, Yb(x)] : [x, y])));
    shape[N] = [lft[N][0], Yb(lft[N][0])];
    const veil = rgba(toneRGB(0.85 * (AMB + lampAt(60, 290, D_WALL) * clamp(I)) * E), 0.16);
    c.fillStyle = veil; c.beginPath(); poly(c, shape); c.fill();
    c.save(); c.beginPath(); poly(c, shape); c.clip();
    c.fillStyle = rgba(toneRGB(0.95 * E, 1), 0.55); c.fillRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
    c.fillStyle = 'rgba(225,235,250,0.22)'; c.fillRect(0, 412, 200, 20);
    // folds: soft vertical streaks that follow the swaying edge
    for (let f = 1; f < 7; f++) {
      c.strokeStyle = f % 2 ? 'rgba(10,14,24,0.22)' : 'rgba(220,232,250,0.16)'; c.lineWidth = f % 2 ? 3 : 2;
      c.beginPath();
      for (let k = 0; k <= N; k++) { const y = lerp(98, 430, k / N), x = lerp(outer(y), edge(y), f / 7); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }
    c.restore();
    L.img.setModified(true);
    image(L.img, X0, Y0, L.w / s, L.h / s);
  },

  drawMoonPatch(u, E, ctx) {
    if (ctx.view.x0 > 330) return;
    const edge = curtainEdge(u);
    const L = this.moon, c = L.c, s = 0.55, X0 = 60, Y0 = 748;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, L.w, L.h);
    c.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    const F = (wx, wy) => [wx + (WIN.y1 - wy) * 0.26 + 26, YB + 4 + (WIN.y1 - wy) * 0.78];
    for (const [a, b] of PANE_X) for (const [cc, d] of PANE_Y) {
      c.fillStyle = 'rgba(255,255,255,0.42)';
      c.beginPath(); poly(c, [F(a, cc), F(b, cc), F(b, d), F(a, d)]); c.fill();
      const lft = [], rgt = [];
      for (let k = 0; k <= 8; k++) {
        const wy = lerp(cc, d, k / 8), xl = Math.max(a, edge(wy));
        if (xl >= b) continue;
        lft.push(F(xl, wy)); rgt.push(F(b, wy));
      }
      if (lft.length < 2) continue;
      c.fillStyle = '#fff'; c.beginPath(); poly(c, lft.concat(rgt.reverse())); c.fill();
    }
    L.img.setModified(true);
    blendMode(ADD); tint(70, 104, 165, 255 * 0.42 * E);
    image(L.img, X0, Y0, L.w / s, L.h / s);
    blendMode(BLEND); noTint();
  },

  // ---------------------------------------------------------------- shadows
  /** The pelican's wall shadow at (quantised) time uu: list of { G, a }. */
  pelicanShadow(u, uu, R, ctx) {
    if (u < -1.3 || u >= 6) return [];
    const t0 = ctx.t - u;
    if (uu <= 1 || uu >= 4) {
      const S = attParams(R.place.x);
      if (uu >= 4 && uu < 4.4) {
        const k = uu - 4;
        S.sy *= 1 + 0.12 * Math.cos(k * 48) * Math.exp(-k / 0.08);
        S.lean += 0.1 * Math.exp(-k / 0.06);
      }
      return [{ G: shadowGeo(R.pose, S), a: 1 }];
    }
    const lagLean = LAG_LEAN(uu);
    const look = 0.32 * smoothstep(1.8, 1.95, uu);
    if (uu < 2) {
      const Rs = ctx.riderAt(t0 + lagTau(uu));
      const S = attParams(Rs.place.x); S.lean = lagLean;
      return [{ G: shadowGeo(Rs.pose, S, { look }), a: 1 }];
    }
    const Rs = ctx.riderAt(t0 + TAU_END);
    const S0 = attParams(Rs.place.x); S0.lean = LAG_LEAN(2.0);
    const climb = (v) => {
      const p = hops(v), pn = p / 4, pe = clamp(p);
      const ax = lerp(S0.ax, AX_END, pn);
      const S = {
        ax, ay: lerp(YB, yN(ax), pe) - hopLift(v), sx: lerp(S0.sx, 1.22, pn), sy: lerp(S0.sy, 1.2, pn),
        lean: lerp(S0.lean, 0.15, pe), m: SLOPE * pe, key: lerp(S0.key, 0.14, pn),
      };
      const dist = ((ax - S0.ax) / 1.2) * 1.25;
      const P = rigPose({ crank: Rs.state.crank + (dist * TAU) / 171.33, wheel: Rs.state.wheel + dist / 62, t: t0 + TAU_END, v: 0 }, {});
      const hold = smoothstep(3.0, 3.1, v);
      const tap = 9 * (Math.exp(-(((v - 3.18) / 0.04) ** 2)) + Math.exp(-(((v - 3.32) / 0.04) ** 2)));
      const D = {
        hunch: 0.26 * smoothstep(0, 1.6, p), look: 0.32 * (1 - smoothstep(0, 1.2, p)) + 0.06 * hold,
        reach: easeInOut(clamp((v - 2.62) / 0.38)), fingers: easeInOut(clamp((v - 2.5) / 0.5)),
        H: [HANDLE[0] - tap, HANDLE[1] + 1], Hf: [HANDLE[0] - 8, HANDLE[1] + 40],
        twitch: [0, 1, 2, 3, 4].map((k) => hold * 0.07 * Math.sin(v * 23 + k * 1.9)),
      };
      return shadowGeo(P, S, D);
    };
    if (uu < 3.8) return [{ G: climb(uu), a: 1 }];
    // slide back down the wall at speed (3.8 → 4.0), with a motion smear
    const Gc = climb(3.8);
    const Ga = shadowGeo(R.pose, attParams(R.place.x));
    const w = clamp((uu - 3.8) / 0.2) ** 2;
    const out = [{ G: lerpGeo(Gc, Ga, w), a: 1 }];
    if (w > 0.04) { out.push({ G: lerpGeo(Gc, Ga, Math.max(0, w - 0.22)), a: 0.4 }); out.push({ G: lerpGeo(Gc, Ga, Math.max(0, w - 0.45)), a: 0.18 }); }
    return out;
  },

  drawShadows(u, uq, I, E, R, ctx) {
    if (u >= 6.0) return;
    const L = this.shadow, c = L.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, L.w, L.h);
    c.setTransform(SS, 0, 0, SS, PAD * SS, PAD * SS);
    c.fillStyle = c.strokeStyle = '#000';
    // banister: its long shadow quivers with the flame
    const fr = frameOf(u);
    const q = 0.004 * (hash3(fr, 5, 74) - 0.5) + 0.003 * Math.sin(u * 7.3);
    c.save(); c.clip(this.PT.wall, 'evenodd');
    c.translate(LAMP[0] + (hash3(fr, 6, 74) - 0.5) * 1.6, LAMP[1]); c.scale(KB + q, KB + q); c.translate(-LAMP[0], -LAMP[1]);
    c.drawImage(this.ban, -PAD, -PAD, SPAN, SPAN);
    c.restore();
    // the pelican's shadow
    const uu = u > 1 && u < 5 ? uq : u;
    for (const s of this.pelicanShadow(u, uu, R, ctx)) { c.globalAlpha = s.a; drawSil(c, s.G, this.PT); }
    c.globalAlpha = 1;
    // fill the mask with "no lamp light"
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in';
    c.drawImage(this.darkSmall, 0, 0, L.w, L.h);
    c.globalCompositeOperation = 'source-over';
    L.img.setModified(true);
    tint(255 * E, 255 * 0.93 * clamp(I));
    image(L.img, -PAD, -PAD, SPAN, SPAN);
    noTint();
  },

  // ---------------------------------------------------------------- exit: phosphor
  buildPhosphor(ctx, u) {
    const R6 = ctx.riderAt(ctx.t - u + 6);
    const S6 = attParams(R6.place.x);
    const G = shadowGeo(R6.pose, S6);
    const N = Math.ceil(SPAN * SP), cv = mk(N, N), x = c2d(cv);
    x.setTransform(SP, 0, 0, SP, PAD * SP, PAD * SP); x.fillStyle = x.strokeStyle = '#000';
    drawSil(x, G, this.PT);
    const erode = (r) => {
      const e = mk(N, N), y = c2d(e);
      y.drawImage(cv, 0, 0);
      y.globalCompositeOperation = 'destination-in';
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; y.drawImage(cv, Math.cos(a) * r, Math.sin(a) * r); }
      const ring = mk(N, N), z = c2d(ring);
      z.drawImage(cv, 0, 0); z.globalCompositeOperation = 'destination-out'; z.drawImage(e, 0, 0);
      return ring;
    };
    const core = erode(1.3), wide = erode(2.6);
    const tinted = (src, col, scale, blur) => {
      const w = Math.ceil(N * scale), t = mk(w, w), y = c2d(t);
      if (blur) y.filter = `blur(${blur}px)`;
      y.drawImage(src, 0, 0, w, w); y.filter = 'none';
      if (blur) { y.globalCompositeOperation = 'lighter'; y.drawImage(t, 0, 0); }
      y.globalCompositeOperation = 'source-in'; y.fillStyle = rgba(col); y.fillRect(0, 0, w, w);
      return toImage(t);
    };
    // outline runs (ordered points on the outer edge) for the crawling arcs
    const ed = c2d(wide).getImageData(0, 0, N, N).data;
    const on = (p) => {
      const i0 = Math.round((p[0] + PAD) * SP), j0 = Math.round((p[1] + PAD) * SP);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i >= 0 && j >= 0 && i < N && j < N && ed[(j * N + i) * 4 + 3] > 60) return true;
      }
      return false;
    };
    const runs = [];
    const fp = (p) => toLamp(p, 1 - EPS_F);
    const fx = c2d(mk(2, 2));
    for (const s of G) {
      if (s.kind === 'line') continue;
      let cur = [];
      const pts = s.kind === 'poly' ? s.pts : s.pts.map((p) => p);
      for (const p of pts) {
        const cand = fx.isPointInPath(this.PT.face, p[0], p[1]) ? null : p;
        const pf = fp(p), candF = fx.isPointInPath(this.PT.face, pf[0], pf[1]) ? pf : null;
        const q = cand && on(cand) ? cand : candF && on(candF) ? candF : null;
        const near = q && cur.length && Math.hypot(q[0] - cur[cur.length - 1][0], q[1] - cur[cur.length - 1][1]) < 22;
        if (q && q[0] > -10 && q[0] < 1010 && q[1] > -10 && (near || !cur.length)) cur.push(q);
        else { if (cur.length >= 4) runs.push(cur); cur = q ? [q] : []; }
      }
      if (cur.length >= 4) runs.push(cur);
    }
    const mask = tinted(cv, [190, 255, 210], 0.5, 0);
    const xs = S6.ax;
    this.ph = {
      core: tinted(core, PH.core, 1, 0), glow: tinted(wide, PH.glow, 0.5, 2.2), bloom: tinted(wide, PH.glow, 0.25, 3.5),
      mask, runs, xs,
    };
    return this.ph;
  },

  drawPhosphor(u, ctx) {
    const ph = this.ph || this.buildPhosphor(ctx, u);
    const a = u - 6;
    const I = Math.exp(-a / 0.5) * (1 - smoothstep(7.3, 8.0, u));
    const fade = 1 - I;
    const gcol = PH.glow.map((v, k) => lerp(v, PH.tail[k], clamp(fade * 1.2)));
    const ccol = PH.core.map((v, k) => lerp(v, PH.tail[k], clamp(fade * 1.1)));
    blendMode(ADD);
    if (a < 0.02) { tint(PH.glow[0], PH.glow[1], PH.glow[2], 255 * 0.35); image(ph.mask, -PAD, -PAD, SPAN, SPAN); }
    const bl = 0.6 * Math.exp(-a / 0.12) + 0.35 * I;
    tint(gcol[0], gcol[1], gcol[2], 255 * clamp(bl)); image(ph.bloom, -PAD, -PAD, SPAN, SPAN);
    tint(gcol[0], gcol[1], gcol[2], 255 * clamp(I * 1.1)); image(ph.glow, -PAD, -PAD, SPAN, SPAN);
    blendMode(BLEND);
    tint(ccol[0], ccol[1], ccol[2], 255 * clamp(I * 1.5)); image(ph.core, -PAD, -PAD, SPAN, SPAN);
    noTint();
    // electric arcs crawl along the outline (0.25 s): jagged, re-struck every frame
    if (a < 0.26 && ph.runs.length) {
      const fr = Math.round(a * 30);
      blendMode(ADD); noFill();
      for (let k = 0; k < 11; k++) {
        const run = ph.runs[Math.floor(hash3(k, 1, 75) * ph.runs.length)];
        const n = run.length, len = Math.min(n - 1, 4 + Math.floor(hash3(k, 2, 75) * 8));
        const st = Math.floor(hash3(k, 3, 75) * n + a * 70) % Math.max(1, n - len);
        const pts = [];
        for (let i = 0; i < len; i++) {
          const p = run[st + i], q = run[st + i + 1];
          const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, m = Math.max(1, Math.round(l / 5));
          for (let j = 0; j < m; j++) {
            const t = j / m, jit = (hash3(k * 97 + i * 13 + j, fr, 76) - 0.5) * 7;
            pts.push([p[0] + dx * t - (dy / l) * jit, p[1] + dy * t + (dx / l) * jit]);
          }
        }
        if (pts.length < 2) continue;
        const al = (1 - a / 0.26) * (0.55 + 0.45 * hash3(k, fr, 78));
        stroke(PH.glow[0], PH.glow[1], PH.glow[2], 110 * al); strokeWeight(4);
        beginShape(); for (const p of pts) vertex(p[0], p[1]); endShape();
        stroke(PH.core[0], PH.core[1], PH.core[2], 255 * al); strokeWeight(1.2);
        beginShape(); for (const p of pts) vertex(p[0], p[1]); endShape();
      }
      noStroke();
      blendMode(BLEND);
    }
    // the spark along the floor line: under the shadow at 6.0 → the right frame edge at 6.15
    if (a < 0.45) {
      const x0 = ph.xs, xh = x0 + (1000 - x0) * (a / 0.15);
      blendMode(ADD);
      if (a < 0.2) {
        const tail = Math.min(220, xh - x0);
        tint(PH.glow[0], PH.glow[1], PH.glow[2], 255 * 0.85); image(this.streak, xh - tail, 800 - 6, tail, 12);
        tint(PH.core[0], PH.core[1], PH.core[2], 255); image(this.streak, xh - tail * 0.6, 800 - 1.6, tail * 0.6, 3.2);
        tint(PH.glow[0], PH.glow[1], PH.glow[2], 255 * 0.9); image(this.glow, xh - 34, 800 - 34, 68, 68);
        tint(PH.core[0], PH.core[1], PH.core[2], 255); image(this.glow, xh - 9, 800 - 9, 18, 18);
        if (a < 0.04) { tint(PH.glow[0], PH.glow[1], PH.glow[2], 255 * 0.7); image(this.glow, x0 - 50, YB - 50, 100, 100); }
      }
      // persistence of the trail along the floor line
      const pe = Math.exp(-Math.max(0, a - 0.15) / 0.18) * smoothstep(0, 0.06, a);
      const xe = Math.min(1000, xh);
      if (xe > x0) { tint(PH.tail[0], PH.tail[1], PH.tail[2], 255 * 0.5 * pe); image(this.streak, x0, 800 - 2.5, xe - x0, 5); }
      blendMode(BLEND); noTint();
    }
  },

  // ---------------------------------------------------------------- the rider
  drawRider(u, R, I, E, fr, ctx) {
    const P = R.placed, bx = P.place.x;
    const x0 = bx - 196, y0 = 452, w = 430, h = 368;
    const L = this.rider, c = L.c;
    const s = Math.min(clamp(ctx.pxu, 0.5, 1.3), (L.w - 2) / w, (L.h - 2) / h);
    const pw = Math.ceil(w * s), ph = Math.ceil(h * s);
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    // floor contact shadows
    c.fillStyle = 'rgba(8,5,2,0.55)';
    for (const wh of P.bike.wheels) { c.beginPath(); c.ellipse(wh.c[0] - 12, 801, 30, 4.5, 0, 0, TAU); c.fill(); }
    const Ir = u >= 6 ? Math.max(I, 0.5) : Math.min(I, 1.15);
    const moon = 0.55 * (1 - smoothstep(150, 480, bx));
    paintRider(c, P, { key: 2.1 * P_LAMP * Ir, fill: 0.16, moon, E });
    // film: the same vignette and grain as the picture
    c.globalCompositeOperation = 'source-atop';
    c.drawImage(this.vigCv, -PAD, -PAD, SPAN, SPAN);
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const [pc, k] of [[this.patD, 1], [this.patL, 2]]) {
      const pat = c.createPattern(pc, 'repeat');
      pat.setTransform(new DOMMatrix().translate(Math.floor(hash3(fr, k, 79) * 256), Math.floor(hash3(fr, k + 2, 79) * 256)));
      c.globalAlpha = k === 1 ? 0.55 : 0.22; c.fillStyle = pat; c.fillRect(0, 0, pw, ph);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    L.img.setModified(true);
    image(L.img, x0, y0, pw / s, ph / s, 0, 0, pw, ph);
  },

  // ---------------------------------------------------------------- film
  drawGrain(fr) {
    const tile = (img, ox, oy, a) => {
      tint(255, 255 * a);
      // a 1024-unit tile at a random offset, wrapped over the picture
      for (const [dx, sx, w] of [[-PAD, ox, Math.min(SPAN, 1024 - ox)], [-PAD + 1024 - ox, 0, SPAN - (1024 - ox)]]) {
        if (w <= 0) continue;
        for (const [dy, sy, hh] of [[-PAD, oy, Math.min(SPAN, 1024 - oy)], [-PAD + 1024 - oy, 0, SPAN - (1024 - oy)]]) {
          if (hh <= 0) continue;
          image(img, dx, dy, w, hh, sx, sy, w, hh);
        }
      }
    };
    tile(this.grainD, Math.floor(hash3(fr, 1, 80) * 1024), Math.floor(hash3(fr, 2, 80) * 1024), 0.55);
    tile(this.grainL, Math.floor(hash3(fr, 3, 80) * 1024), Math.floor(hash3(fr, 4, 80) * 1024), 0.18);
    noTint();
  },

  drawDamage(u, fr) {
    // dust and hairs: a few per film frame
    const nd = Math.floor(hash3(fr, 1, 81) * 4.2) - 1;
    for (let k = 0; k < nd; k++) {
      const cell = Math.floor(hash3(fr, k, 82) * 8), sz = lerp(4, cell < 4 ? 12 : 26, hash3(fr, k, 83));
      const x = hash3(fr, k, 84) * 1000, y = hash3(fr, k, 85) * 1000;
      push(); translate(x, y); rotate(hash3(fr, k, 86) * TAU);
      tint(255, 255 * lerp(0.35, 0.85, hash3(fr, k, 87)));
      image(this.dust, -sz / 2, -sz / 2, sz, sz, cell * 64, 0, 64, 64);
      pop();
    }
    noTint();
    // scratches: long vertical lines that live for a while and drift
    for (let j = 0; j < 3; j++) {
      const span = 1.3 + j * 0.45, i = Math.floor((u + 40) / span + j * 0.37);
      if (hash3(i, j, 88) > 0.55) continue;
      const t0 = (i - j * 0.37) * span - 40, age = u - t0;
      const x = 30 + hash3(i, j, 89) * 940 + age * (hash3(i, j, 90) - 0.5) * 30 + (hash3(fr, j, 91) - 0.5) * 1.2;
      const bright = hash3(i, j, 92) < 0.7;
      const a = (0.12 + 0.2 * hash3(fr, j, 93)) * (bright ? 1 : 0.8);
      fill(bright ? color(244, 226, 186, 255 * a) : color(10, 6, 3, 255 * a));
      const y0 = hash3(i, j, 94) * 300 - 40, y1 = 1040 - hash3(i, j, 95) * 300;
      rect(x, y0, lerp(0.8, 1.7, hash3(i, j, 96)), y1 - y0);
    }
    noFill();
  },
};
