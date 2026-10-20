// 18 · 蒸汽波 / Vaporwave · 2010s
//
// Generic 2010s vaporwave key art, played back from a worn VHS tape. A teal→violet→magenta gradient sky, a huge
// striped sunset sun sinking behind a low-poly wireframe mountain range, an infinite neon perspective grid (the road
// y = 800 is its brightest line), two low-poly palms, a floating checkerboard tile, and on the right a flat-shaded
// low-poly marble bust of our own design on a Doric column. The chrome-and-neon logotype 「蒸　汽　波」 with
// ＶＡＰＯＲＷＡＶＥ　２０１０年代 and ヴェイパーウェイヴ floats in the sky. Over everything: a VCR on-screen display
// (PLAY ▶ / SLOW ▶ / TRACKING, a slow tape counter), screen-locked scanlines, grain, a rolling tracking-noise band,
// head-switching noise at the bottom, and horizontal tears.
//
// Time: the picture runs on a tape clock wc(u) (1× before the crossing, 0.5× from u = 0, ramping back to 1× over
// 5.5 → 6). The rider is the shared rig drawn as a faceted low-poly bird (fake-height "dome" and "ribbon" facets,
// flat shading, cyan underglow from the grid) on a chrome bicycle with neon wireframe wheels.
//
// Technique: 0 live p5.brush marks. Static layers are Canvas2D paintings baked once (sky, sun, mountains, floor,
// title, column + chest). Live layers (rider, bust head, palms, checkerboard) are repainted every frame into small 2D
// canvases. The bust is a real (tiny) 3D mesh: rings of a sculpted head, rotated, back-face culled, depth sorted and
// flat shaded every frame. Every layer is drawn through `blit()`, so a horizontal VHS tear simply re-composes the
// whole picture inside a band with a horizontal offset.
import { VIEW_H } from '../beat/timeline.js';
import { hash, rng, clamp, lerp, smoothstep, smootherstep, easeInOut, smoothPath } from '../kit/math.js';
import { rigParts } from '../rig/parts.js';
import { placed as placePose } from '../rig/pelican.js';

const ID = 'vapor';
const TAU = Math.PI * 2;
const HZN = 610;                       // horizon
const ROAD = 800;
const VX = 500;                        // vanishing point (under the sun)
const FH = ROAD - HZN;                 // perspective constant: a floor line at depth z sits at y = HZN + FH / z
const SUN = { x: 500, y: 505, r: 205 };
const RIDE = { hold: [2.0, 4.0], speed: 0.6, ramp: 0.4 };
const BUST = { x: 838, y: 338, hu: 54 };       // head centre (panel units) and the head unit
const GRID_SP = 96;                    // vertical grid spacing on the road line
const rnd = (...k) => hash(ID, ...k) / 4294967296;

// ------------------------------------------------------------------ time
/** Tape clock: the picture's own time. 1× before the crossing, 0.5× from u = 0, back to 1× over 5.5 → 6. */
function wclock(u) {
  if (u < 0) return u;
  if (u < 5.5) return 0.5 * u;
  if (u < 6) { const x = (u - 5.5) / 0.5; return 2.75 + 0.5 * (u - 5.5) + 0.25 * (x * x * x - x * x * x * x / 2); }
  return 3.125 + (u - 6);
}
/** Rider effects (echoes, chroma, tears through the bird) live strictly inside (1, 5). */
const fxIn = (u) => smoothstep(1.1, 1.6, u) * (1 - smoothstep(4.45, 4.9, u));
function glitchAmt(u) {
  if (u >= 4.0 && u < 4.25) return u < 4.17 ? 1 : 1 - (u - 4.17) / 0.08;
  if (u >= 4.36 && u < 4.43) return 0.3;
  return 0;
}
/** The wave: raise 1.85 → 2.12, wave 2.12 → 3.35 (dreamy, 0.6 s period), lower 3.4 → 3.68. */
function waveW(u) { return u <= 1.85 || u >= 3.68 ? 0 : smootherstep(1.85, 2.12, u) * (1 - smootherstep(3.4, 3.68, u)); }
function waveOsc(u) {
  const a = smoothstep(2.05, 2.35, u) * (1 - smoothstep(3.1, 3.4, u));
  return 0.36 * Math.sin(TAU * (u - 2.2) / 0.6) * a;
}
/** The bust's eyes: cyan glow from 3.0, flickering through the glitch, fading after the rider has gone by. */
function eyeGlow(u) {
  if (u < 2.96) return 0;
  let g = smoothstep(2.96, 3.06, u) * (1 + 0.6 * Math.exp(-Math.max(0, u - 3.06) / 0.12));
  g *= 1 - 0.75 * smoothstep(4.7, 5.6, u);
  if (u >= 4.0 && u < 4.3) g *= 0.35 + 0.65 * rnd('eyefl', Math.round(u * 30));
  if (u > 6.4) g *= 1 - smoothstep(6.4, 7.2, u);
  return g;
}

// ------------------------------------------------------------------ colour helpers
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
function rampAt(st, t) {
  t = clamp(t) * (st.length - 1);
  const i = Math.min(st.length - 2, Math.floor(t));
  return mixc(st[i], st[i + 1], t - i);
}
const R_WHITE = ['#4c3b86', '#8f7cc8', '#cdbff0', '#f3edff', '#ffffff'].map(hx);
const R_WING = ['#5a4a96', '#9c8ad2', '#d2c6f2', '#f0eaff', '#ffffff'].map(hx);
const R_POUCH = ['#7a0f52', '#c4247a', '#ff4f9a', '#ff86c8', '#ffc4e8'].map(hx);
const R_BILL = ['#9a5a8e', '#d08cbc', '#f2bddc', '#ffe0f0', '#fff4fa'].map(hx);
const R_PRIM = ['#170c30', '#2a1650', '#43277a', '#6a46a8'].map(hx);
const R_LEG = ['#8a2a5e', '#d24c80', '#ff7f9e', '#ffb0c0'].map(hx);
const R_FAR = ['#4a2050', '#7a3a72', '#a85a90'].map(hx);
const R_TRUNK = ['#2a1440', '#4e2a66', '#7a4a88', '#a7739f'].map(hx);
const R_FROND = ['#082f3c', '#0f5f66', '#17958c', '#33c9b0', '#8ff3d9'].map(hx);
const CYAN = hx('#3df2ff'), PINK = hx('#ff6ad5');
const MB = { shadow: hx('#45367f'), mid: hx('#a594d4'), lit: hx('#f6f2fb'), hair: hx('#d2c6ea') };

// ------------------------------------------------------------------ Canvas2D helpers
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
function poly(c, pts, close = true) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); }
function grad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function rgrad(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function bake2d(K, key, w, h, paint) {
  w = Math.ceil(w); h = Math.ceil(h);
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  const c = g.drawingContext;
  c.clearRect(0, 0, w, h);
  c.save(); paint(c, w, h); c.restore();
  const fb = K.bake(key, w, h, () => { imageMode(CORNER); image(g, 0, 0, w, h); });
  g.remove();
  return fb;
}
/** Stroke a polyline as a chrome tube (gradient across it). */
function tube(c, pts, w, stops) {
  const a = pts[0], b = pts[pts.length - 1];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  let nx = -dy, ny = dx;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const m = pts[Math.floor(pts.length / 2)];
  c.strokeStyle = grad(c, m[0] + nx * w / 2, m[1] + ny * w / 2, m[0] - nx * w / 2, m[1] - ny * w / 2, stops);
  c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  poly(c, pts, false); c.stroke();
}
function taper(pts, w0, w1) {
  const n = pts.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  return left.concat(right.reverse());
}
const CHROME = [[0, '#2a1a52'], [0.14, '#8fa6d8'], [0.32, '#ffffff'], [0.46, '#cfe6ff'], [0.5, '#1a0b3a'], [0.58, '#c0308e'], [0.74, '#ff7fd0'], [0.88, '#ffd0f0'], [1, '#3a1650']];
const CHROME_D = [[0, '#140a26'], [0.35, '#4a3d6e'], [0.5, '#d6d0f0'], [0.62, '#3a2d5e'], [1, '#0e0820']];

// ------------------------------------------------------------------ low-poly facets (2D shapes with fake height)
function resampleClosed(pts, n) {
  const m = pts.length, L = [0];
  for (let i = 1; i <= m; i++) L.push(L[i - 1] + Math.hypot(pts[i % m][0] - pts[i - 1][0], pts[i % m][1] - pts[i - 1][1]));
  const T = L[m], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * T;
    while (j < m - 1 && L[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % m], t = (s - L[j]) / ((L[j + 1] - L[j]) || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
/** Outline ring at z = 0, an inner ring lifted to ~0.72 h, an apex at h: a faceted dome. */
function domeTris(outline, nIn, kIn, h, key) {
  const n = outline.length;
  let cx = 0, cy = 0;
  for (const p of outline) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  const A = outline.map((p) => [p[0], p[1], 0]);
  const C = [cx, cy, h];
  const tris = [];
  if (nIn <= 0) { for (let i = 0; i < n; i++) tris.push([A[i], A[(i + 1) % n], C]); return tris; }
  const B = [];
  for (let j = 0; j < nIn; j++) {
    const p = outline[Math.round((j * n) / nIn) % n];
    const jz = (rnd('dz', key, j) - 0.5) * 0.36, jx = (rnd('dx', key, j) - 0.5) * 0.12;
    B.push([cx + (p[0] - cx) * (kIn + jx), cy + (p[1] - cy) * (kIn + jx), h * (0.72 + jz)]);
  }
  let i = 0, j = 0;
  while (i < n || j < nIn) {
    if (j >= nIn || (i < n && (i + 1) / n <= (j + 1) / nIn)) { tris.push([A[i % n], A[(i + 1) % n], B[j % nIn]]); i++; }
    else { tris.push([A[i % n], B[(j + 1) % nIn], B[j % nIn]]); j++; }
  }
  for (let k = 0; k < nIn; k++) tris.push([B[k], B[(k + 1) % nIn], C]);
  return tris;
}
/** A ribbon polygon (left side + right side reversed) as a faceted tube: two facet rows meeting on a lifted spine. */
function ribbonTris(pol, m, hk) {
  const n = pol.length >> 1;
  const Lf = pol.slice(0, n), Rt = pol.slice(n).reverse();
  const at = (arr, t) => { const f = t * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(f)), w = f - i; return [lerp(arr[i][0], arr[i + 1][0], w), lerp(arr[i][1], arr[i + 1][1], w)]; };
  const Ls = [], Rs = [], Cs = [];
  for (let k = 0; k < m; k++) {
    const t = k / (m - 1), l = at(Lf, t), r = at(Rt, t);
    const w = Math.hypot(l[0] - r[0], l[1] - r[1]);
    Ls.push([l[0], l[1], 0]); Rs.push([r[0], r[1], 0]);
    Cs.push([(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, w * 0.5 * hk]);
  }
  const tris = [];
  for (let k = 0; k < m - 1; k++) {
    tris.push([Ls[k], Ls[k + 1], Cs[k + 1]], [Ls[k], Cs[k + 1], Cs[k]], [Cs[k], Cs[k + 1], Rs[k + 1]], [Cs[k], Rs[k + 1], Rs[k]]);
  }
  return tris;
}
const LK = (() => { const v = [-0.5, -0.72, 0.48], l = Math.hypot(...v); return v.map((x) => x / l); })();   // key, upper left
const LC = (() => { const v = [0.25, 0.92, 0.3], l = Math.hypot(...v); return v.map((x) => x / l); })();    // cyan grid underglow
/** Fill facets with flat shading: key light → ramp, plus a cyan underglow from the grid. */
function facets(c, tris, ramp, o = {}) {
  const rim = o.rim ?? 0.55, gain = o.gain ?? 1, bias = o.bias ?? 0;
  c.lineWidth = 0.7; c.lineJoin = 'round';          // closes the anti-aliasing seams between facets
  for (const t of tris) {
    const [a, b, d] = t;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const k = clamp((nx * LK[0] + ny * LK[1] + nz * LK[2]) * 1.32 * gain + bias + 0.02);
    const kc = clamp(nx * LC[0] + ny * LC[1] + nz * LC[2] - 0.1);
    let col = rampAt(ramp, k);
    if (rim > 0) col = mixc(col, CYAN, rim * kc * kc);
    c.fillStyle = c.strokeStyle = css(col);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath();
    c.fill(); c.stroke();
  }
}

// ------------------------------------------------------------------ the wave (rig space)
/** Raise the near wing and wave: the covert's front lobe folds in, an arm rises from the shoulder, primaries fan. */
function wavePose(P0, w, osc) {
  if (w <= 1e-4) return P0;
  const B = P0.bird, S = B.shoulder, W0 = B.wrist;
  const v0 = [W0[0] - S[0], W0[1] - S[1]], L0 = Math.hypot(v0[0], v0[1]);
  const a0 = Math.atan2(v0[1], v0[0]);
  const aR = -2.12 + osc;                                     // raised: straight up, waving fore and aft
  const a = a0 + (aR - a0) * w;
  const len = L0 * (1 + 0.5 * w);
  const wrist = [S[0] + Math.cos(a) * len, S[1] + Math.sin(a) * len];
  const ux = v0[0] / L0, uy = v0[1] / L0;
  const wing = B.wing.map((p) => {
    const pr = ((p[0] - S[0]) * ux + (p[1] - S[1]) * uy) / L0;
    const om = smoothstep(0.05, 0.9, pr) * w;
    const tx = S[0] + (p[0] - S[0]) * 0.4, ty = S[1] + (p[1] - S[1]) * 0.4 + 6;
    return [lerp(p[0], tx, om), lerp(p[1], ty, om)];
  });
  // primaries: same point count, re-anchored at the moving wrist and fanned around the arm
  const primaries = B.primaries.map((f, k) => {
    const n = f.length;
    const fanA = a + (-0.62 + k * 0.27) * w + 0.25 * osc * (k / 4);
    const flen = 50 + 8 * (2 - Math.abs(k - 2));
    return f.map((p, j) => {
      const t = j / (n - 1);
      const rel0 = [p[0] - W0[0], p[1] - W0[1]];
      const rel1 = [Math.cos(fanA) * flen * t + Math.cos(fanA + 1.57) * 4 * Math.sin(Math.PI * t), Math.sin(fanA) * flen * t + Math.sin(fanA + 1.57) * 4 * Math.sin(Math.PI * t)];
      return [wrist[0] + lerp(rel0[0], rel1[0], w), wrist[1] + lerp(rel0[1], rel1[1], w)];
    });
  });
  const mid = [(S[0] + wrist[0]) / 2, (S[1] + wrist[1]) / 2];
  const elbow = [mid[0] + Math.cos(a - 1.57) * 7 * w, mid[1] + Math.sin(a - 1.57) * 7 * w];
  const spine = smoothPath([[S[0] - Math.cos(a) * 6, S[1] - Math.sin(a) * 6], elbow, wrist], 4);
  const arm = taper(spine, 32, 17);
  // trailing secondaries along the back edge of the raised arm
  let bx = Math.cos(a + 1.57), by = Math.sin(a + 1.57);
  if (bx > 0) { bx = -bx; by = -by; }
  const armF = [0.35, 0.55, 0.75, 0.92].map((t, k) => {
    const p = spine[Math.round(t * (spine.length - 1))];
    const L = (16 + 4 * k) * w;
    const q0 = [p[0] + bx * 8, p[1] + by * 8];
    return [q0, [q0[0] + bx * L * 0.7 + Math.cos(a) * L * 0.55, q0[1] + by * L * 0.7 + Math.sin(a) * L * 0.55], [q0[0] + bx * L + Math.cos(a) * L * 0.9, q0[1] + by * L + Math.sin(a) * L * 0.9]];
  });
  return { ...P0, bird: { ...B, wing, primaries, wrist, arm, armF, waveW: w } };
}

// ------------------------------------------------------------------ the pelican (Canvas2D, every frame)
const TUBE_W = { tube_downtube: 10.5, tube_toptube: 8, tube_seattube: 9, tube_headtube: 11, tube_chainstay: 6, tube_seatstay: 5.2 };
function neonWheel(c, wh, spin) {
  const N = 18, cx = wh.c[0], cy = wh.c[1], r = wh.r;
  const ring = (R, a0) => { const pts = []; for (let k = 0; k < N; k++) { const a = a0 + (k * TAU) / N; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } return pts; };
  const tire = ring(r - 2, wh.angle), rim = ring(r * 0.8, wh.angle + Math.PI / N);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round'; c.lineCap = 'round';
  // spokes
  c.beginPath();
  for (let j = 0; j < wh.spokes; j++) {
    const a = wh.angle + (j * TAU) / wh.spokes;
    c.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
    c.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
  }
  c.strokeStyle = `rgba(120,240,255,${(0.5 - 0.15 * spin).toFixed(3)})`; c.lineWidth = 1.1; c.stroke();
  // rim (magenta) and tyre (cyan): wide glow, glow, hot core
  for (const [pts, col, core, ws] of [[rim, '255,106,213', '255,214,246', [6, 3, 1.3]], [tire, '61,242,255', '214,255,255', [11, 5, 2.2]]]) {
    poly(c, pts, true);
    c.strokeStyle = `rgba(${col},0.10)`; c.lineWidth = ws[0]; c.stroke();
    c.strokeStyle = `rgba(${col},0.42)`; c.lineWidth = ws[1]; c.stroke();
    c.strokeStyle = `rgba(${core},0.95)`; c.lineWidth = ws[2]; c.stroke();
  }
  // vertices of the tyre polygon: little glints
  c.fillStyle = 'rgba(220,255,255,0.8)';
  for (const p of tire) { circ(c, p[0], p[1], 1.6); c.fill(); }
  c.restore();
  // hub
  c.fillStyle = '#ff6ad5';
  poly(c, Array.from({ length: 6 }, (_, k) => [cx + 5.5 * Math.cos(k * TAU / 6 + wh.angle), cy + 5.5 * Math.sin(k * TAU / 6 + wh.angle)])); c.fill();
  c.fillStyle = '#ffe6fa'; circ(c, cx, cy, 2); c.fill();
}

function birdOutline(c, P) {
  const B = P.bird;
  c.save();
  c.fillStyle = c.strokeStyle = 'rgba(22,8,44,0.92)';
  c.lineWidth = 3.2; c.lineJoin = 'round'; c.lineCap = 'round';
  const shapes = [B.tail, B.body, B.wing, B.neck, B.pouch, B.upperBill, B.legNear.poly, B.legNear.web];
  if (B.arm) shapes.push(B.arm);
  for (const s of shapes) { poly(c, s, true); c.stroke(); c.fill(); }
  circ(c, B.head.c[0], B.head.c[1], B.head.r); c.stroke(); c.fill();
  for (const f of B.primaries) { poly(c, taper(f, 5.6, 1.4), true); c.stroke(); }
  c.restore();
}

function paintPelican(c, P, o) {
  const B = P.bird;
  const waving = (B.waveW ?? 0) > 0.02;
  const drawArm = () => {
    if (!waving) return;
    B.armF.forEach((f) => facets(c, ribbonTris(taper(f, 7, 1.5), 3, 0.5), R_PRIM, { rim: 0.3 }));
    facets(c, ribbonTris(B.arm, 5, 0.9), R_WING, { rim: 0.5 });
    B.primaries.forEach((f, k) => facets(c, ribbonTris(taper(f, 6.2, 1.4), 4, 0.6), R_PRIM, { rim: 0.35, bias: 0.05 * k }));
  };
  for (const part of rigParts(P)) {
    const r = part.role;
    switch (r) {
      case 'legFar': facets(c, ribbonTris(part.pts, 5, 0.8), R_FAR, { rim: 0.2 }); break;
      case 'footFar': c.fillStyle = css(R_FAR[1]); poly(c, part.pts); c.fill(); break;
      case 'crankFar': tube(c, part.pts, 4.2, CHROME_D); break;
      case 'tire': neonWheel(c, P.bike.wheels[+part.name.slice(4)], o.spin); break;
      case 'rim': case 'spoke': case 'hub': break;
      case 'chain': {
        // a dark under-stroke so the chrome tubes read against the grid
        c.save(); c.strokeStyle = 'rgba(16,6,34,0.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [k, seg] of Object.entries(P.bike.tubes)) { c.lineWidth = (TUBE_W['tube_' + k] ?? 7) + 2.6; poly(c, seg, false); c.stroke(); }
        c.lineWidth = 9.6; poly(c, P.bike.fork, false); c.stroke();
        c.restore();
      }
      // falls through
      case 'chainLine': c.strokeStyle = '#5b4a92'; c.lineWidth = 1.6; c.lineJoin = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'frame': tube(c, part.pts, TUBE_W[part.name] ?? 7, CHROME); break;
      case 'fork': tube(c, part.pts, 7.2, CHROME); break;
      case 'stem': tube(c, part.pts, 6, CHROME_D); break;
      case 'bars': tube(c, part.pts, 5, CHROME_D); break;
      case 'seatpost': tube(c, part.pts, 5, CHROME); break;
      case 'saddle': tube(c, part.pts, 6.5, [[0, '#6a46a8'], [0.4, '#2a1650'], [1, '#120826']]); break;
      case 'ring': {
        const n = 10, pts = [];
        const a0 = o.crank ?? 0;
        for (let k = 0; k < n; k++) { const a = a0 + (k * TAU) / n; pts.push([part.c[0] + part.r * Math.cos(a), part.c[1] + part.r * Math.sin(a)]); }
        c.fillStyle = grad(c, part.c[0], part.c[1] - part.r, part.c[0], part.c[1] + part.r, CHROME); poly(c, pts); c.fill();
        c.strokeStyle = 'rgba(61,242,255,0.9)'; c.lineWidth = 1.2; poly(c, pts); c.stroke();
        c.fillStyle = '#2a1650'; circ(c, part.c[0], part.c[1], part.r * 0.36); c.fill();
        break;
      }
      case 'tail': {
        birdOutline(c, P);
        const LN = B.legNear;
        facets(c, ribbonTris(LN.poly, 5, 0.8), R_LEG, { rim: 0.4 });
        facets(c, [[[...LN.web[0], 0], [...LN.web[1], 0], [...LN.web[2], 3]], [[...LN.web[0], 0], [...LN.web[2], 3], [...LN.web[3], 0]]], R_LEG, { rim: 0.3 });
        facets(c, domeTris(part.pts, 0, 0, 10, 'tail'), R_WHITE);
        break;
      }
      case 'body': facets(c, domeTris(resampleClosed(part.pts, 18), 8, 0.55, 34, 'body'), R_WHITE); break;
      case 'wing': facets(c, domeTris(resampleClosed(part.pts, 16), 7, 0.5, 15, 'wing'), R_WING, { rim: 0.45 }); break;
      case 'secondaries': facets(c, ribbonTris(taper(part.pts, 7, 1.8), 4, 0.5), R_PRIM, { rim: 0.2 }); drawArm(); break;
      case 'primary': if (!waving) facets(c, ribbonTris(taper(part.pts, 6.2, 1.4), 4, 0.6), R_PRIM, { rim: 0.35 }); break;
      case 'neck': facets(c, ribbonTris(part.pts, 7, 0.9), R_WHITE); break;
      case 'head': {
        const pts = [];
        for (let k = 0; k < 11; k++) { const a = (k / 11) * TAU - 1.2; pts.push([part.c[0] + part.r * Math.cos(a), part.c[1] + part.r * Math.sin(a)]); }
        facets(c, domeTris(pts, 5, 0.5, 15, 'head'), R_WHITE);
        break;
      }
      case 'crest': c.strokeStyle = '#d8ccff'; c.lineWidth = 2.4; c.lineCap = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'pouch': facets(c, domeTris(resampleClosed(part.pts, 14), 6, 0.48, 16, 'pouch'), R_POUCH, { rim: 0.4 }); break;
      case 'bill': {
        const p = part.pts;
        facets(c, ribbonTris([p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]], 4, 0.7), R_BILL, { rim: 0.2 });
        break;
      }
      case 'nail': c.fillStyle = '#ff3d8b'; poly(c, part.pts); c.fill(); break;
      case 'face': c.fillStyle = '#ff9fd2'; poly(c, part.pts); c.fill(); break;
      case 'eye': c.fillStyle = '#fff8ff'; circ(c, part.c[0], part.c[1], part.r); c.fill(); break;
      case 'pupil': {
        c.fillStyle = '#1a0b2e'; circ(c, part.c[0], part.c[1], part.r); c.fill();
        c.fillStyle = '#7ff7ff'; circ(c, part.c[0] - part.r * 0.3, part.c[1] - part.r * 0.35, part.r * 0.38); c.fill();
        break;
      }
      case 'eyeShut': c.strokeStyle = '#1a0b2e'; c.lineWidth = 1.4; poly(c, part.pts, false); c.stroke(); break;
      case 'leg': break;
      case 'foot': break;
      case 'crank': tube(c, part.pts, 4.6, CHROME_D); break;
      case 'pedal': tube(c, part.pts, 4, CHROME_D); break;
      default: break;
    }
  }
}

/** One flat-colour silhouette of the bird (motion echoes). */
function paintSilhouette(c, P) {
  for (const part of rigParts(P)) {
    const r = part.role;
    if (part.layer !== 'bird') continue;
    if (r === 'eye' || r === 'pupil' || r === 'face' || r === 'eyeShut' || r === 'hub' || r === 'chain') continue;
    if (part.kind === 'circle') {
      if (r === 'tire') { c.lineWidth = 3; circ(c, part.c[0], part.c[1], part.r - 2); c.stroke(); }
      else if (r === 'head' || r === 'ring') { circ(c, part.c[0], part.c[1], part.r); c.fill(); }
    } else if (part.kind === 'poly') { poly(c, part.pts); c.fill(); }
    else if (r !== 'spoke') { c.lineWidth = r === 'frame' ? (TUBE_W[part.name] ?? 6) : 4; poly(c, part.pts, false); c.stroke(); }
  }
  if (P.bird.arm) { poly(c, P.bird.arm); c.fill(); }
}

// ------------------------------------------------------------------ 3D: the bust and its column
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const VIEW_PITCH = -0.1;               // we look up at the bust a little
const n3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const M_KEY = n3([-0.55, 0.5, 0.67]), M_CY = n3([0.95, -0.05, -0.12]), M_PK = n3([-0.85, 0.3, -0.25]);

/** Ring mesh: ring j, index i (angles increasing) → faces wound outward. tags: per-face tag function. */
function ringMesh(ringPts, capTop, capBot, tagFn) {
  const R = ringPts.length, M = ringPts[0].length;
  const v = [], f = [];
  for (const ring of ringPts) for (const p of ring) v.push(p);
  const id = (j, i) => j * M + (((i % M) + M) % M);
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < M; i++) {
      const A = id(j, i), Bq = id(j, i + 1), C = id(j + 1, i + 1), D = id(j + 1, i);
      const tag = tagFn ? tagFn(j, i) : 0;
      if ((i + j) % 2) { f.push([A, D, C, tag], [A, C, Bq, tag]); }
      else { f.push([A, D, Bq, tag], [D, C, Bq, tag]); }
    }
  }
  if (capTop) { const T = v.length; v.push(capTop); for (let i = 0; i < M; i++) f.push([T, id(0, i), id(0, i + 1), tagFn ? tagFn(-1, i) : 0]); }
  if (capBot) { const T = v.length; v.push(capBot); for (let i = 0; i < M; i++) f.push([T, id(R - 1, i + 1), id(R - 1, i), tagFn ? tagFn(R, i) : 'cut']); }
  return { v, f };
}
/** Cylinder-ish mesh from a profile [[y, r], ...] (top → bottom), M sides starting at angle a0. */
function cylMesh(prof, M, a0, flute = 0, tag = 0) {
  const rings = prof.map(([y, r], j) => Array.from({ length: M }, (_, i) => {
    const a = a0 + (i * TAU) / M;
    const rr = r * (flute && j > 0 && j < prof.length - 1 && i % 2 ? 1 - flute : 1);
    return [rr * Math.sin(a), y, rr * Math.cos(a)];
  }));
  return ringMesh(rings, [0, prof[0][0], 0], [0, prof[prof.length - 1][0], 0], () => tag);
}

// head sculpt (y up, z toward the viewer when yaw = 0; units ≈ head half-height). Rings top → bottom.
const HR = [
  { y: 0.97, W: 0.36, Df: 0.3, Db: 0.4 },
  { y: 0.86, W: 0.56, Df: 0.47, Db: 0.64 },
  { y: 0.7, W: 0.72, Df: 0.62, Db: 0.8 },
  { y: 0.52, W: 0.8, Df: 0.7, Db: 0.9, fringe: 0.07 },
  { y: 0.34, W: 0.81, Df: 0.71, Db: 0.92, brow: 0.05 },
  { y: 0.19, W: 0.8, Df: 0.69, Db: 0.9, socket: -0.12, nose: 0.035, ear: 0.08 },
  { y: 0.05, W: 0.78, Df: 0.69, Db: 0.84, socket: -0.045, nose: 0.11, cheek: 0.035, ear: 0.11 },
  { y: -0.09, W: 0.75, Df: 0.68, Db: 0.76, nose: 0.19, cheek: 0.035, ear: 0.11 },
  { y: -0.23, W: 0.72, Df: 0.67, Db: 0.67, nose: 0.29, nostril: 0.035, ear: 0.07 },
  { y: -0.37, W: 0.68, Df: 0.65, Db: 0.58, nose: 0.045, nostril: 0.02 },
  { y: -0.5, W: 0.63, Df: 0.63, Db: 0.53, lip: 0.055 },
  { y: -0.63, W: 0.57, Df: 0.61, Db: 0.5, lip: 0.012, jaw: 0.02 },
  { y: -0.76, W: 0.51, Df: 0.59, Db: 0.49, lip: -0.04, jaw: 0.035 },
  { y: -0.9, W: 0.41, Df: 0.56, Db: 0.49, lip: 0.055, jaw: 0.02 },
  { y: -1.02, W: 0.42, Df: 0.4, Db: 0.49 },
  { y: -1.14, W: 0.46, Df: 0.33, Db: 0.49 },
  { y: -1.36, W: 0.5, Df: 0.35, Db: 0.49 },
  { y: -1.64, W: 0.54, Df: 0.38, Db: 0.49 },
];
const HA = [-2.65, -2.15, -1.7, -1.32, -0.98, -0.68, -0.42, -0.2, 0, 0.2, 0.42, 0.68, 0.98, 1.32, 1.7, 2.15, 2.65, Math.PI];
const EYE_RING = 5;
const gss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function hairAmt(y, a) {
  const aa = Math.abs(a);
  const yh = aa < 0.5 ? 0.45 : aa < 1.4 ? lerp(0.45, 0.28, (aa - 0.5) / 0.9) : lerp(0.28, -0.5, (aa - 1.4) / (Math.PI - 1.4));
  return smoothstep(yh - 0.1, yh + 0.08, y);
}
function headPoint(R, a, j, i) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const sx = Math.sign(sa) * Math.pow(Math.abs(sa), 0.85), cz = Math.sign(ca) * Math.pow(Math.abs(ca), 0.85);
  let x = R.W * sx, z = (ca >= 0 ? R.Df : R.Db) * cz;
  const aa = Math.abs(a), front = ca > 0;
  if (front) {
    if (R.nose) z += R.nose * gss(a, 0, 0.2);
    if (R.brow) z += R.brow * gss(a, 0, 0.75);
    if (R.socket) z += R.socket * gss(aa, 0.42, 0.2);
    if (R.cheek) z += R.cheek * gss(aa, 0.8, 0.3);
    if (R.nostril) z += R.nostril * gss(aa, 0.25, 0.12);
    if (R.lip) z += R.lip * gss(a, 0, 0.32);
  }
  if (R.jaw) x += Math.sign(sa) * R.jaw * gss(aa, 1.2, 0.3);
  if (R.ear) x += Math.sign(sa) * R.ear * gss(aa, 1.57, 0.22);
  // hair: a cap of faceted curls
  const h = hairAmt(R.y, a);
  let yy = R.y;
  if (h > 0) {
    const curl = rnd('curl', j, i), alt = (i + j) % 2 ? 1 : 0.35;
    let off = h * (0.08 + 0.13 * curl * alt);
    if (front && R.fringe) off += R.fringe * gss(aa, 0, 0.8);     // a fringe of curls over the brow
    const l = Math.hypot(x, z) || 1;
    x += (x / l) * off; z += (z / l) * off;
    yy += off * 0.25 * Math.max(0, R.y) + (alt < 1 ? -0.03 : 0.02) * h;
  }
  const jit = (rnd('hj', j, i) - 0.5) * 0.024;
  const l = Math.hypot(x, z) || 1;
  return { p: [x + (x / l) * jit, yy, z + (z / l) * jit], hair: h };
}
function buildHead() {
  const hairOf = [];
  const rings = HR.map((R, j) => HA.map((a, i) => { const q = headPoint(R, a, j, i); hairOf.push(q.hair); return q.p; }));
  const M = HA.length;
  return ringMesh(rings, [0, 1.06, -0.04], [0, -1.64, -0.08], (j, i) => {
    if (j < 0) return 'hair';
    if (j >= HR.length) return 'cut';
    const k = j * M + i, k2 = Math.min(HR.length - 1, j + 1) * M + ((i + 1) % M);
    return (hairOf[k] + hairOf[k2]) / 2 > 0.5 ? 'hair' : 'skin';
  });
}
function buildChest() {
  // y (front centre), half-width, depth, centre z, lift of the sides (the U-shaped cut)
  const RG = [
    [-1.45, 0.52, 0.42, -0.08, 0], [-1.62, 0.82, 0.46, -0.08, 0], [-1.8, 1.24, 0.5, -0.07, 0],
    [-1.98, 1.52, 0.54, -0.05, 0], [-2.18, 1.58, 0.56, -0.02, 0], [-2.42, 1.5, 0.58, 0, 0.14],
    [-2.68, 1.34, 0.56, 0, 0.34], [-2.95, 1.12, 0.5, 0, 0.6],
  ];
  const M = 16;
  const rings = RG.map(([Y, W, D, ZC, lift], j) => Array.from({ length: M }, (_, i) => {
    const a = -Math.PI + ((i + 0.5) * TAU) / M;
    const ca = Math.cos(a), sa = Math.sin(a), aa = Math.abs(a);
    const sx = Math.sign(sa) * Math.pow(Math.abs(sa), 0.75), cz = Math.sign(ca) * Math.pow(Math.abs(ca), 0.9);
    let x = W * sx, z = D * cz + ZC;
    if (ca > 0) {
      if (j === 5 || j === 6) z += 0.08 * gss(aa, 0.55, 0.35);   // pectorals
      if (j >= 4 && j <= 6) z -= 0.035 * gss(aa, 0, 0.22);        // sternum
      if (j === 2) z += 0.045 * gss(aa, 0.7, 0.35);               // clavicles
      if (j === 1) z -= 0.05 * gss(aa, 0, 0.3);                   // throat notch
    }
    const y = Y + lift * sa * sa + (rnd('cy', j, i) - 0.5) * 0.03;
    const jit = 1 + (rnd('cj', j, i) - 0.5) * 0.025;
    return [x * jit, y, z * jit];
  }));
  return ringMesh(rings, null, [0, -2.7, 0.02], (j) => (j >= RG.length ? 'cut' : 'skin'));
}
function marbleColor(n, tag, key) {
  const k = Math.max(0, n[0] * M_KEY[0] + n[1] * M_KEY[1] + n[2] * M_KEY[2]);
  const cy = Math.max(0, n[0] * M_CY[0] + n[1] * M_CY[1] + n[2] * M_CY[2]);
  const pk = Math.max(0, n[0] * M_PK[0] + n[1] * M_PK[1] + n[2] * M_PK[2]);
  let col = k < 0.5 ? mixc(MB.shadow, MB.mid, k / 0.5) : mixc(MB.mid, MB.lit, (k - 0.5) / 0.5);
  if (tag === 'hair') col = mixc(col, mixc(hx('#3e2f74'), MB.hair, Math.min(1, k * 1.05)), 0.55);
  if (tag === 'cut') col = mixc(col, hx('#e8e0f4'), 0.3);
  const j = 1 + (rnd('mj', key) - 0.5) * 0.07;
  col = [col[0] * j, col[1] * j, col[2] * j];
  col = mixc(col, CYAN, 0.75 * cy * cy * cy);
  col = mixc(col, PINK, 0.55 * pk * pk);
  return col;
}
/**
 * Render a mesh into c. xf(p) → view-space point (x right, y up, z toward the viewer); proj(q) → [px, py].
 * Returns the projected vertices (for eye positions, veins).
 */
function renderMesh(c, mesh, xf, proj, keyBase) {
  const V = mesh.v.map(xf);
  const Pj = V.map(proj);
  const list = [];
  mesh.f.forEach((f, fi) => {
    const a = V[f[0]], b = V[f[1]], d = V[f[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz <= 0) return;
    const L = Math.hypot(nx, ny, nz);
    list.push({ f, fi, z: a[2] + b[2] + d[2], n: [nx / L, ny / L, nz / L] });
  });
  list.sort((p, q) => p.z - q.z);
  c.lineJoin = 'round';
  for (const it of list) {
    const col = css(marbleColor(it.n, it.f[3], keyBase + it.fi));
    c.fillStyle = c.strokeStyle = col;
    const a = Pj[it.f[0]], b = Pj[it.f[1]], d = Pj[it.f[2]];
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath();
    c.fill(); c.stroke();
  }
  return { V, Pj };
}
/** Several meshes, depth-sorted together: items [{ mesh, xf, key }]. */
function renderMeshes(c, items, proj) {
  const list = [];
  const P = [];
  items.forEach((it, mi) => {
    const V = it.mesh.v.map(it.xf);
    const Pj = V.map(proj);
    P.push(Pj);
    it.mesh.f.forEach((f, fi) => {
      const a = V[f[0]], b = V[f[1]], d = V[f[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz <= 0) return;
      const L = Math.hypot(nx, ny, nz);
      list.push({ f, mi, key: it.key + fi, z: a[2] + b[2] + d[2], n: [nx / L, ny / L, nz / L] });
    });
  });
  list.sort((p, q) => p.z - q.z);
  c.lineJoin = 'round';
  for (const it of list) {
    c.fillStyle = c.strokeStyle = css(marbleColor(it.n, it.f[3], it.key));
    const Pj = P[it.mi], a = Pj[it.f[0]], b = Pj[it.f[1]], d = Pj[it.f[2]];
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.closePath();
    c.fill(); c.stroke();
  }
}
const HEAD_PIV = [0, -1.2, -0.08];
function headXf(yaw, nod) {
  return (p) => {
    let q = [p[0] - HEAD_PIV[0], p[1] - HEAD_PIV[1], p[2] - HEAD_PIV[2]];
    q = rotY(rotX(q, nod), yaw);
    return rotX([q[0] + HEAD_PIV[0], q[1] + HEAD_PIV[1], q[2] + HEAD_PIV[2]], VIEW_PITCH);
  };
}
const CHEST_YAW = -0.38, COL_YAW = 0.42;
/** Head yaw/nod: gazes off to the right, turns (1.0 →) to find the pelican and follows it out of the picture. */
function bustLook(u, riderX) {
  const Y0 = 0.78;
  const hx_ = riderX + 70;
  const target = clamp(Math.atan2((hx_ - BUST.x) / BUST.hu, 4.2), -1.12, 1.0);
  const w = smootherstep(1.0, 2.5, u);
  const yaw = lerp(Y0, target, w);
  const nod = lerp(0.02, 0.17, w) - 0.05 * smoothstep(5.2, 7, u);
  return { yaw, nod };
}

// ------------------------------------------------------------------ static paintings
const SKY = { y0: 0, h: HZN + 4, s: 1.5 };
const SUNB = { pad: 30, s: 1.6 };
const MTN = { y0: HZN - 150, h: 156, s: 1.5 };
const FLR = { y0: HZN - 2, h: 1000 - HZN + 2, s: 1.5 };
const TTL = { x0: 170, y0: 22, w: 660, h: 290, s: 2 };
const BST = { x0: BUST.x - 130, y0: BUST.y + 60, w: 260, h: 420, s: 2 };

function paintSky(c, S) {
  c.setTransform(S, 0, 0, S, 0, 0);
  c.fillStyle = grad(c, 0, 0, 0, HZN, [[0, '#071a33'], [0.16, '#16234f'], [0.34, '#2f1b5c'], [0.55, '#4b1e76'], [0.74, '#6a2286'], [0.88, '#86288e'], [0.96, '#b23596'], [1, '#f05fae']]);
  c.fillRect(0, 0, 1000, SKY.h);
  // a teal veil high up
  c.fillStyle = rgrad(c, 180, -60, 0, 520, [[0, 'rgba(79,209,197,0.30)'], [1, 'rgba(79,209,197,0)']]);
  c.fillRect(0, 0, 1000, SKY.h);
  // sun halo
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = rgrad(c, SUN.x, SUN.y + 20, SUN.r * 0.8, SUN.r * 2.6, [[0, 'rgba(255,120,170,0.22)'], [0.3, 'rgba(255,90,190,0.10)'], [1, 'rgba(255,80,200,0)']]);
  c.fillRect(0, 0, 1000, SKY.h);
  c.globalCompositeOperation = 'source-over';
  // thin horizontal haze bands near the horizon
  const r = rng(hash(ID, 'haze'));
  for (let k = 0; k < 9; k++) {
    const y = r.range(360, 590), w = r.range(180, 520), x = r.range(-80, 1000), h = r.range(2, 6);
    c.fillStyle = `rgba(255,${(150 + r.range(0, 60)) | 0},230,${r.range(0.05, 0.12).toFixed(3)})`;
    c.beginPath(); c.ellipse(x, y, w / 2, h, 0, 0, TAU); c.fill();
  }
  // dim static stars
  for (let k = 0; k < 110; k++) {
    const x = r.range(0, 1000), y = Math.pow(r(), 1.6) * 420;
    c.fillStyle = `rgba(230,240,255,${(0.15 + 0.4 * r() * (1 - y / 460)).toFixed(3)})`;
    c.fillRect(x, y, 1.1, 1.1);
  }
}

function paintSun(c, S, R) {
  const P = SUNB.pad, cx = R + P, cy = R + P;
  c.setTransform(S, 0, 0, S, 0, 0);
  // chroma fringes (red to the left, cyan to the right), then the disc
  c.fillStyle = 'rgba(255,40,90,0.55)'; circ(c, cx - 2.2, cy, R); c.fill();
  c.fillStyle = 'rgba(60,240,255,0.45)'; circ(c, cx + 2.2, cy, R); c.fill();
  c.fillStyle = grad(c, 0, cy - R, 0, cy + R, [[0, '#fff3a6'], [0.2, '#ffd27a'], [0.42, '#ffa36b'], [0.62, '#ff6f86'], [0.8, '#ff4f9a'], [1, '#e8378f']]);
  circ(c, cx, cy, R); c.fill();
  // a soft inner glow toward the top
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = rgrad(c, cx, cy - R * 0.55, 0, R * 0.9, [[0, 'rgba(255,255,220,0.35)'], [1, 'rgba(255,255,220,0)']]);
  circ(c, cx, cy, R); c.fill();
  c.globalCompositeOperation = 'source-over';
}

function paintMountains(c, S) {
  c.setTransform(S, 0, 0, S, 0, -MTN.y0 * S);
  const range = (seed, x0, x1, step, hFn, fillR, wire, wireA) => {
    const r = rng(hash(ID, seed));
    const top = [], mid = [], bot = [];
    for (let x = x0; x <= x1 + 1e-6; x += step) {
      const h = hFn(x) * r.range(0.55, 1.15);
      top.push([x + r.range(-step * 0.2, step * 0.2), HZN - h]);
      mid.push([x + step * 0.5 + r.range(-6, 6), HZN - h * r.range(0.25, 0.5)]);
      bot.push([x, HZN + 2]);
    }
    // facets: top row ↔ mid row ↔ base
    const tris = [];
    for (let k = 0; k < top.length - 1; k++) {
      tris.push([top[k], top[k + 1], mid[k]], [top[k], mid[k], bot[k]], [mid[k], top[k + 1], bot[k + 1]], [mid[k], bot[k + 1], bot[k]]);
    }
    for (const t of tris) {
      // which way does the facet face? toward the sun = lighter
      const cxm = (t[0][0] + t[1][0] + t[2][0]) / 3;
      const hiP = t.reduce((m, p) => (p[1] < m[1] ? p : m), t[0]);
      const face = Math.sign(cxm - hiP[0]) * Math.sign(VX - cxm);
      const k = clamp(0.45 + 0.3 * face + (r() - 0.5) * 0.2);
      c.fillStyle = css(rampAt(fillR, k));
      c.strokeStyle = c.fillStyle; c.lineWidth = 0.6;
      poly(c, t); c.fill(); c.stroke();
    }
    // neon wireframe
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineJoin = 'round';
    for (const [lw, a] of [[3.2, 0.12 * wireA], [1.0, 0.75 * wireA]]) {
      c.strokeStyle = css(wire, a); c.lineWidth = lw;
      c.beginPath();
      for (const t of tris) { c.moveTo(t[0][0], t[0][1]); c.lineTo(t[1][0], t[1][1]); c.lineTo(t[2][0], t[2][1]); c.closePath(); }
      c.stroke();
    }
    // ridge line brighter
    c.strokeStyle = css(wire, 0.95 * wireA); c.lineWidth = 1.6; poly(c, top, false); c.stroke();
    c.restore();
  };
  const env = (lo, hi, p) => (x) => lo + (hi - lo) * Math.pow(Math.min(1, Math.abs(x - VX) / 520), p);
  range('far', -40, 1040, 46, env(34, 118, 0.9), ['#2a1050', '#4a1f72', '#6c2f8c'].map(hx), hx('#ff6ad5'), 0.55);
  range('near', -60, 1060, 74, env(10, 92, 1.4), ['#140828', '#2a1048', '#46196a'].map(hx), hx('#3df2ff'), 0.85);
  // the horizon line itself
  c.fillStyle = 'rgba(255,170,230,0.9)'; c.fillRect(0, HZN - 0.8, 1000, 1.6);
}

function paintFloor(c, S) {
  const W = 1000 * S, H = FLR.h * S;
  c.setTransform(S, 0, 0, S, 0, -FLR.y0 * S);
  c.fillStyle = grad(c, 0, HZN, 0, 1000, [[0, '#5a1660'], [0.06, '#3a0f52'], [0.25, '#200a3c'], [0.5, '#140728'], [1, '#09031a']]);
  c.fillRect(0, HZN - 2, 1000, 1000 - HZN + 2);
  // horizon glow and the sun's reflection
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = grad(c, 0, HZN, 0, HZN + 90, [[0, 'rgba(255,110,200,0.55)'], [0.4, 'rgba(255,90,190,0.12)'], [1, 'rgba(255,90,190,0)']]);
  c.fillRect(0, HZN, 1000, 90);
  c.save(); c.translate(SUN.x, HZN + 6); c.scale(1, 0.22);
  c.fillStyle = rgrad(c, 0, 0, 0, 300, [[0, 'rgba(255,150,170,0.45)'], [0.5, 'rgba(255,90,170,0.12)'], [1, 'rgba(255,90,170,0)']]);
  circ(c, 0, 0, 300); c.fill(); c.restore();
  c.globalCompositeOperation = 'source-over';
  // contact shadows: column, palms
  for (const [x, y, rx] of [[BUST.x, 744, 90], [62, 772, 46], [292, 668, 26]]) {
    c.save(); c.translate(x, y); c.scale(1, 0.18);
    c.fillStyle = rgrad(c, 0, 0, 0, rx, [[0, 'rgba(8,2,20,0.75)'], [1, 'rgba(8,2,20,0)']]);
    circ(c, 0, 0, rx); c.fill(); c.restore();
  }
  // vertical grid lines: sharp lines in a scratch canvas → glow, chroma, core
  const L = mk(W, H), lc = L.getContext('2d');
  lc.setTransform(S, 0, 0, S, 0, -FLR.y0 * S);
  lc.fillStyle = '#fff';
  for (let k = -14; k <= 14; k++) {
    const xr = VX + k * GRID_SP;
    const at = (y) => VX + (xr - VX) * (y - HZN) / FH;
    const wAt = (y) => 0.25 + 1.5 * (y - HZN) / FH;
    const y1 = 1004;
    lc.beginPath();
    lc.moveTo(at(HZN) - 0.12, HZN); lc.lineTo(at(HZN) + 0.12, HZN);
    lc.lineTo(at(y1) + wAt(y1) / 2, y1); lc.lineTo(at(y1) - wAt(y1) / 2, y1);
    lc.closePath(); lc.fill();
  }
  // fade into the horizon haze
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'destination-in';
  lc.fillStyle = grad(lc, 0, 0, 0, H, [[0, 'rgba(0,0,0,0.05)'], [(40 * S) / H, 'rgba(0,0,0,0.45)'], [0.35, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,1)']]);
  lc.fillRect(0, 0, W, H);
  const tinted = (col) => { const t = mk(W, H), tc = t.getContext('2d'); tc.drawImage(L, 0, 0); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = col; tc.fillRect(0, 0, W, H); return t; };
  const cyan = tinted('#3df2ff'), red = tinted('#ff3a8c'), core = tinted('#d8ffff');
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'lighter';
  c.filter = `blur(${(7 * S).toFixed(1)}px)`; c.globalAlpha = 0.9; c.drawImage(cyan, 0, 0);
  c.filter = `blur(${(2.2 * S).toFixed(1)}px)`; c.globalAlpha = 0.8; c.drawImage(cyan, 0, 0);
  c.filter = 'none';
  c.globalAlpha = 0.35; c.drawImage(red, -1.6 * S, 0);
  c.globalAlpha = 0.85; c.drawImage(core, 0, 0);
  c.restore();
}

const TITLE_FONT = '"Songti SC", "STSong", serif';
function paintTitle(c, S) {
  c.setTransform(S, 0, 0, S, -TTL.x0 * S, -TTL.y0 * S);
  const cx = 500;
  // --- 蒸　汽　波 : chrome with an extruded drop shadow and a pink glow
  const size = 116, base = 166;
  const txt = '蒸汽波';
  c.font = `900 ${size}px ${TITLE_FONT}`;
  c.letterSpacing = `${size * 0.42}px`;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const tw = c.measureText(txt).width - size * 0.42;
  const x0 = cx - tw / 2;
  const skew = (cc) => cc.transform(1, 0, -0.12, 1, base * 0.12, 0);
  // pink glow + extrusion
  c.save(); skew(c);
  c.shadowColor = 'rgba(255,80,200,0.9)'; c.shadowBlur = 26 * S;
  c.fillStyle = '#3a0f5a';
  c.fillText(txt, x0 + 9, base + 9);
  c.shadowBlur = 0; c.shadowColor = 'transparent';
  for (let k = 9; k >= 1; k--) { c.fillStyle = css(mixc(hx('#2a0b48'), hx('#b0278c'), 1 - k / 9)); c.fillText(txt, x0 + k, base + k); }
  c.restore();
  // chrome face in its own canvas (so streaks clip to it)
  const Wc = TTL.w * S, Hc = TTL.h * S;
  const cv = mk(Wc, Hc), cc = cv.getContext('2d');
  cc.setTransform(S, 0, 0, S, -TTL.x0 * S, -TTL.y0 * S);
  skew(cc);
  cc.font = c.font; cc.letterSpacing = c.letterSpacing; cc.textBaseline = 'alphabetic';
  const top = base - size * 0.86, bot = base + size * 0.1;
  cc.fillStyle = grad(cc, 0, top, 0, bot, [[0, '#ffffff'], [0.18, '#d6f2ff'], [0.4, '#7cc4f2'], [0.5, '#3a5fb8'], [0.515, '#1a0b3a'], [0.56, '#5a1f7a'], [0.72, '#ff5fc8'], [0.88, '#ffc7ee'], [1, '#fff4fb']]);
  cc.fillText(txt, x0, base);
  cc.globalCompositeOperation = 'source-atop';
  cc.setTransform(S, 0, 0, S, -TTL.x0 * S, -TTL.y0 * S);
  cc.strokeStyle = 'rgba(255,255,255,0.55)'; cc.lineWidth = 7;
  for (const sx of [cx - 150, cx + 20, cx + 190]) { cc.beginPath(); cc.moveTo(sx, top - 10); cc.lineTo(sx - 60, bot + 10); cc.stroke(); }
  cc.strokeStyle = 'rgba(255,255,255,0.3)'; cc.lineWidth = 2.5;
  for (const sx of [cx - 128, cx + 42, cx + 212]) { cc.beginPath(); cc.moveTo(sx, top - 10); cc.lineTo(sx - 60, bot + 10); cc.stroke(); }
  // bevel: lighter top-left edge, darker lower-right edge
  cc.globalCompositeOperation = 'source-over';
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(cv, 0, 0);
  c.restore();
  c.save(); skew(c);
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.4; c.strokeText(txt, x0 - 0.5, base - 0.5);
  c.strokeStyle = 'rgba(40,10,70,0.8)'; c.lineWidth = 1.1; c.strokeText(txt, x0 + 0.6, base + 0.6);
  c.restore();
  c.letterSpacing = '0px';

  // --- ＶＡＰＯＲＷＡＶＥ　２０１０年代 : neon, pink glow, chroma
  const sub = 'ＶＡＰＯＲＷＡＶＥ　２０１０年代';
  c.font = `600 34px "PingFang SC", "Hiragino Sans GB", sans-serif`;
  c.textAlign = 'center';
  c.letterSpacing = '3px';
  const sy = 232;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,60,120,0.75)'; c.fillText(sub, cx - 2, sy);
  c.fillStyle = 'rgba(60,240,255,0.75)'; c.fillText(sub, cx + 2, sy);
  c.restore();
  c.save();
  c.shadowColor = 'rgba(255,90,210,0.95)'; c.shadowBlur = 12 * S;
  c.fillStyle = '#fff0fb'; c.fillText(sub, cx, sy);
  c.shadowBlur = 0;
  c.fillText(sub, cx, sy);
  c.restore();
  // --- ヴェイパーウェイヴ : katakana in cyan
  c.font = `600 29px "Hiragino Mincho ProN", "Hiragino Sans GB", serif`;
  c.letterSpacing = '9px';
  const ky = 277;
  c.save();
  c.shadowColor = 'rgba(61,242,255,0.95)'; c.shadowBlur = 10 * S;
  c.fillStyle = '#c8fdff'; c.fillText('ヴェイパーウェイヴ', cx, ky);
  c.shadowBlur = 0; c.fillStyle = '#e8ffff'; c.fillText('ヴェイパーウェイヴ', cx, ky);
  c.restore();
  // thin rules either side of the katakana
  const kw = c.measureText('ヴェイパーウェイヴ').width;
  c.fillStyle = 'rgba(61,242,255,0.85)';
  c.fillRect(cx - kw / 2 - 70, ky - 10, 52, 1.6);
  c.fillRect(cx + kw / 2 + 18, ky - 10, 52, 1.6);
  c.letterSpacing = '0px';
}

/** Column, socle and chest (static), baked. */
function paintBustStatic(c, S, meshes) {
  const proj = (q) => [(BUST.x + q[0] * BUST.hu - BST.x0) * S, (BUST.y - q[1] * BUST.hu - BST.y0) * S];
  c.lineWidth = 0.9;
  renderMesh(c, meshes.stylobate, (p) => rotX(rotY(p, COL_YAW), VIEW_PITCH), proj, 100000);
  renderMesh(c, meshes.shaft, (p) => rotX(rotY(p, COL_YAW + 0.08), VIEW_PITCH), proj, 200000);
  renderMesh(c, meshes.echinus, (p) => rotX(rotY(p, COL_YAW), VIEW_PITCH), proj, 300000);
  renderMesh(c, meshes.abacus, (p) => rotX(rotY(p, COL_YAW), VIEW_PITCH), proj, 400000);
  renderMesh(c, meshes.socleBase, (p) => rotX(rotY(p, COL_YAW), VIEW_PITCH), proj, 500000);
  renderMesh(c, meshes.socle, (p) => rotX(rotY(p, CHEST_YAW), VIEW_PITCH), proj, 600000);
  // faint veins, only where marble was painted
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const r = rng(hash(ID, 'veins'));
  for (let k = 0; k < 7; k++) {
    let x = r.range(50, 210) * S, y = r.range(130, 400) * S;
    c.strokeStyle = `rgba(140,120,185,${r.range(0.25, 0.5).toFixed(2)})`;
    c.lineWidth = r.range(0.5, 1.2) * S;
    c.beginPath(); c.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += r.range(-24, 30) * S; y += r.range(8, 30) * S; c.lineTo(x, y); }
    c.stroke();
  }
  c.restore();
}

// ------------------------------------------------------------------ palms
function makePalm(seed, base, top, sc, nF) {
  const r = rng(hash(ID, 'palm', seed));
  const fronds = [];
  for (let k = 0; k < nF; k++) {
    const side = k % 2 ? 1 : -1;
    const ang = -Math.PI / 2 + side * (0.35 + (Math.floor(k / 2) / Math.ceil(nF / 2)) * 1.65) + r.range(-0.12, 0.12);
    fronds.push({ ang, len: r.range(150, 200) * sc, droop: r.range(0.5, 0.85), w: r.range(30, 38) * sc, front: r() < 0.45, ph: r.range(0, TAU), k });
  }
  fronds.sort((a, b) => (a.front === b.front ? Math.abs(b.ang + Math.PI / 2) - Math.abs(a.ang + Math.PI / 2) : a.front ? 1 : -1));
  return { base, top, sc, fronds, ph: r.range(0, TAU) };
}
function paintPalm(c, P, wc) {
  const sway = Math.sin(wc * 0.55 + P.ph) * 6 * P.sc + Math.sin(wc * 1.3 + P.ph * 2) * 1.5 * P.sc;
  const top = [P.top[0] + sway, P.top[1] + Math.abs(sway) * 0.1];
  const b = P.base;
  const ctrl = [lerp(b[0], top[0], 0.5) + (top[0] - b[0]) * -0.35 + 26 * P.sc, lerp(b[1], top[1], 0.55)];
  const n = 11;
  const spine = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, it = 1 - t;
    spine.push([it * it * b[0] + 2 * it * t * ctrl[0] + t * t * top[0], it * it * b[1] + 2 * it * t * ctrl[1] + t * t * top[1]]);
  }
  const frond = (f, back) => {
    const a = f.ang + 0.05 * Math.sin(wc * 0.8 + f.ph) * (1 + Math.abs(f.ang + Math.PI / 2));
    const dr = f.droop * (1 + 0.05 * Math.sin(wc * 0.9 + f.ph));
    const m = 10, pts = [];
    for (let j = 0; j <= m; j++) {
      const t = j / m;
      pts.push([top[0] + Math.cos(a) * f.len * t, top[1] + Math.sin(a) * f.len * t + dr * f.len * t * t]);
    }
    const towardSun = clamp(0.5 - 0.5 * Math.cos(a) * Math.sign(top[0] - SUN.x));
    for (let j = 0; j < m; j++) {
      const p0 = pts[j], p1 = pts[j + 1];
      let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      let ux = -dy, uy = dx;
      if (uy > 0) { ux = -ux; uy = -uy; }                 // the side facing up
      const t = (j + 0.5) / m;
      const ll = f.w * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.92 + 0.1)), 0.55);
      const up = [p1[0] + (dx * 0.62 + ux * 0.78) * ll * 0.72, p1[1] + (dy * 0.62 + uy * 0.78) * ll * 0.72];
      const dn = [p1[0] + (dx * 0.5 - ux * 0.86) * ll, p1[1] + (dy * 0.5 - uy * 0.86) * ll + ll * 0.18];
      const jit = (rnd('fr', P.ph, f.k, j) - 0.5) * 0.12;
      const kU = clamp(0.74 + 0.16 * towardSun - (back ? 0.26 : 0) + jit);
      const kD = clamp(0.36 + 0.12 * towardSun - (back ? 0.2 : 0) - jit);
      c.fillStyle = c.strokeStyle = css(rampAt(R_FROND, kD)); poly(c, [p0, p1, dn]); c.fill(); c.stroke();
      c.fillStyle = c.strokeStyle = css(rampAt(R_FROND, kU)); poly(c, [p0, p1, up]); c.fill(); c.stroke();
    }
    c.strokeStyle = css(rampAt(R_FROND, back ? 0.3 : 0.6)); c.lineWidth = 2.2 * P.sc;
    poly(c, pts, false); c.stroke();
    c.lineWidth = 0.6;
  };
  c.lineJoin = 'round'; c.lineWidth = 0.6;
  for (const f of P.fronds) if (!f.front) frond(f, true);
  // trunk: stacked faceted segments, each a little wider at its top (the leaf scars)
  for (let k = 0; k < n; k++) {
    const p0 = spine[k], p1 = spine[k + 1];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const nx = -dy, ny = dx;
    const w0 = lerp(17, 10, k / n) * P.sc, w1 = lerp(17, 10, (k + 1) / n) * P.sc * 1.16;
    const Lb = [p0[0] - nx * w0, p0[1] - ny * w0], Rb = [p0[0] + nx * w0, p0[1] + ny * w0];
    const Lt = [p1[0] - nx * w1, p1[1] - ny * w1], Rt = [p1[0] + nx * w1, p1[1] + ny * w1];
    const Mb = [p0[0] - nx * w0 * 0.15, p0[1] - ny * w0 * 0.15], Mt = [p1[0] - nx * w1 * 0.15, p1[1] - ny * w1 * 0.15];
    const lightLeft = nx < 0;   // the left side (toward the sun-ish key light) is lit
    const kL = lightLeft ? 0.78 : 0.3, kR = lightLeft ? 0.3 : 0.78;
    c.fillStyle = c.strokeStyle = css(rampAt(R_TRUNK, kL + (rnd('tr', P.ph, k) - 0.5) * 0.1)); poly(c, [Lb, Mb, Mt, Lt]); c.fill(); c.stroke();
    c.fillStyle = c.strokeStyle = css(rampAt(R_TRUNK, kR)); poly(c, [Mb, Rb, Rt, Mt]); c.fill(); c.stroke();
    c.fillStyle = c.strokeStyle = css(rampAt(R_TRUNK, 0.12)); poly(c, [Lt, Rt, [Rt[0] - dx * 2.2 * P.sc, Rt[1] - dy * 2.2 * P.sc], [Lt[0] - dx * 2.2 * P.sc, Lt[1] - dy * 2.2 * P.sc]]); c.fill();
  }
  // coconuts
  for (const [dx, dy, rr] of [[-7, 9, 7], [5, 11, 6.5], [-1, 15, 6]]) {
    const x = top[0] + dx * P.sc, y = top[1] + dy * P.sc, R = rr * P.sc;
    const hex6 = Array.from({ length: 6 }, (_, k) => [x + R * Math.cos(k * TAU / 6 + 0.3), y + R * Math.sin(k * TAU / 6 + 0.3)]);
    c.fillStyle = '#2a1440'; poly(c, hex6); c.fill();
    c.fillStyle = '#6a3f8c'; poly(c, [hex6[3], hex6[4], hex6[5], [x, y]]); c.fill();
  }
  for (const f of P.fronds) if (f.front) frond(f, false);
}

// ------------------------------------------------------------------ OSD (pixel font, nearest-neighbour upscale)
function nearestImageFrom(cv) {
  const img = createImage(cv.width, cv.height);
  try {
    const rr = (window.p5 && window.p5.instance && window.p5.instance._renderer) || window._renderer;
    rr.getTexture(img).setInterpolation(NEAREST, NEAREST);
  } catch (e) { /* linear fallback */ }
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}
function osdCanvas(text, px = 11) {
  const meas = mk(4, 4).getContext('2d');
  meas.font = `bold ${px}px Menlo, monospace`;
  const parts = text.split('▶');
  const tri = Math.round(px * 0.8);
  let w = 4;
  parts.forEach((pt, k) => { w += Math.ceil(meas.measureText(pt).width) + (k < parts.length - 1 ? tri + 1 : 0); });
  const h = px + 6;
  const a = mk(w, h), ac = a.getContext('2d');
  ac.font = meas.font; ac.textBaseline = 'alphabetic'; ac.fillStyle = '#fff';
  let x = 2;
  parts.forEach((pt, k) => {
    ac.fillText(pt, x, px + 1);
    x += Math.ceil(meas.measureText(pt).width);
    if (k < parts.length - 1) {
      const y0 = Math.round(px * 0.18) + 1, y1 = y0 + tri;
      for (let yy = y0; yy < y1; yy++) { const half = Math.min(yy - y0 + 0.5, y1 - yy - 0.5); ac.fillRect(x, yy, Math.max(1, Math.round(half * 1.15)), 1); }
      x += tri + 1;
    }
  });
  const id = ac.getImageData(0, 0, w, h), d = id.data;
  const on = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) on[k] = d[k * 4 + 3] > 110 ? 1 : 0;
  const out = mk(w, h), oc = out.getContext('2d'), od = oc.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, o = k * 4;
    if (on[k]) { od.data[o] = 248; od.data[o + 1] = 246; od.data[o + 2] = 255; od.data[o + 3] = 255; continue; }
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h && on[yy * w + xx]) { near = true; break; } }
    if (near) { od.data[o] = 10; od.data[o + 1] = 4; od.data[o + 2] = 24; od.data[o + 3] = 200; }
  }
  oc.putImageData(od, 0, 0);
  return out;
}

// ------------------------------------------------------------------ the scene
export default {
  freezeU: 2.4,
  ride: RIDE,
  cues: [
    { u: 0.0, name: 'slowMo' }, { u: 1.0, name: 'bustTurns' }, { u: 2.0, name: 'wave' },
    { u: 3.0, name: 'glow' }, { u: 4.0, name: 'glitch' }, { u: 5.5, name: 'speedUp' },
  ],

  async init(K) {
    this.sky = bake2d(K, 'sky', 1000 * SKY.s, SKY.h * SKY.s, (c) => paintSky(c, SKY.s));
    const SR = SUN.r + SUNB.pad;
    this.sun = bake2d(K, 'sun', 2 * SR * SUNB.s, 2 * SR * SUNB.s, (c) => paintSun(c, SUNB.s, SUN.r));
    this.mtn = bake2d(K, 'mtn', 1000 * MTN.s, MTN.h * MTN.s, (c) => paintMountains(c, MTN.s));
    this.floor = bake2d(K, 'floor', 1000 * FLR.s, FLR.h * FLR.s, (c) => paintFloor(c, FLR.s));
    this.title = bake2d(K, 'title', TTL.w * TTL.s, TTL.h * TTL.s, (c) => paintTitle(c, TTL.s));
    // the bust: meshes
    const sq = (y0, y1, half) => cylMesh([[y0, half * Math.SQRT2], [y1, half * Math.SQRT2]], 4, Math.PI / 4);
    this.meshes = {
      head: buildHead(),
      chest: buildChest(),
      socle: cylMesh([[-2.74, 0.6], [-2.86, 0.62], [-2.92, 0.46], [-3.06, 0.42], [-3.12, 0.54], [-3.2, 0.64]], 14, 0.1),
      socleBase: sq(-3.2, -3.36, 0.68),
      abacus: sq(-3.36, -3.58, 1.04),
      echinus: cylMesh([[-3.58, 1.0], [-3.66, 0.96], [-3.76, 0.84], [-3.82, 0.8]], 18, 0.05),
      shaft: cylMesh([[-3.82, 0.79], [-3.88, 0.76], [-3.93, 0.79], [-5.5, 0.83], [-7.1, 0.87]], 20, 0.0, 0.045),
      stylobate: sq(-7.1, -7.42, 1.14),
    };
    this.bust = bake2d(K, 'bust', BST.w * BST.s, BST.h * BST.s, (c) => paintBustStatic(c, BST.s, this.meshes));
    {
      // the column's reflection in the glossy floor (mirrored about its foot)
      const S = BST.s, cv = mk(BST.w * S, BST.h * S);
      paintBustStatic(cv.getContext('2d'), S, this.meshes);
      const foot = BUST.y + 7.42 * BUST.hu, RH = ROAD + 20 - foot;
      this.bustReflY = foot;
      this.bustReflH = RH;
      this.bustRefl = bake2d(K, 'bustRefl', BST.w * S, RH * S, (c) => {
        const sy = (foot - BST.y0) * S, h = RH * S;
        c.save(); c.translate(0, h); c.scale(1, -1);
        c.drawImage(cv, 0, sy - h, BST.w * S, h, 0, 0, BST.w * S, h);
        c.restore();
        c.globalCompositeOperation = 'destination-in';
        c.fillStyle = grad(c, 0, 0, 0, h, [[0, 'rgba(0,0,0,0.42)'], [0.5, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(0, 0, BST.w * S, h);
      });
    }
    {
      const r = rng(hash(ID, 'chestveins'));
      this.veins = Array.from({ length: 6 }, () => {
        let x = BUST.x + r.range(-75, 70), y = BUST.y + r.range(2.0, 2.6) * BUST.hu;
        const pts = [[x, y]];
        for (let j = 0; j < 5; j++) { x += r.range(-9, 12); y += r.range(3, 9); pts.push([x, y]); }
        return { pts, a: r.range(0.25, 0.45).toFixed(2), w: r.range(0.4, 0.9) };
      });
    }
    // sprites
    const sp = (this.spr = {});
    sp.glow = bake2d(K, 'glow', 128, 128, (c) => { c.fillStyle = rgrad(c, 64, 64, 0, 64, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, 128, 128); });
    sp.star = bake2d(K, 'star', 64, 64, (c) => {
      c.translate(32, 32);
      c.fillStyle = rgrad(c, 0, 0, 0, 30, [[0, 'rgba(255,255,255,0.9)'], [0.25, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
      circ(c, 0, 0, 30); c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; const rr = k % 2 ? 2.4 : 30; c.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
      c.closePath(); c.fill();
    });
    sp.hline = bake2d(K, 'hline', 4, 96, (c) => {
      c.fillStyle = grad(c, 0, 0, 0, 96, [[0, 'rgba(255,255,255,0)'], [0.3, 'rgba(255,255,255,0.08)'], [0.44, 'rgba(255,255,255,0.35)'], [0.48, 'rgba(255,255,255,1)'], [0.52, 'rgba(255,255,255,1)'], [0.56, 'rgba(255,255,255,0.35)'], [0.7, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(0, 0, 4, 96);
    });
    sp.streak = bake2d(K, 'streak', 256, 16, (c) => {
      c.fillStyle = grad(c, 0, 0, 256, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(0, 0, 256, 16);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = grad(c, 0, 0, 0, 16, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(0, 0, 256, 16);
    });
    // VHS textures
    sp.noise = bake2d(K, 'noise', 512, 256, (c) => {
      const r = rng(hash(ID, 'noise'));
      for (let y = 0; y < 256; y++) {
        const n = r.int(2, 14);
        for (let k = 0; k < n; k++) {
          const x = r.range(-20, 512), L = Math.pow(r(), 2) * 90 + 3, a = r.range(0.15, 0.95);
          c.fillStyle = r() < 0.7 ? `rgba(255,255,255,${a.toFixed(2)})` : r() < 0.5 ? `rgba(255,140,220,${a.toFixed(2)})` : `rgba(140,250,255,${a.toFixed(2)})`;
          c.fillRect(x, y, L, 1);
        }
      }
    });
    sp.grain = bake2d(K, 'grain', 256, 256, (c) => {
      const id = c.createImageData(256, 256), d = id.data;
      const r = rng(hash(ID, 'grain'));
      for (let k = 0; k < 256 * 256; k++) { const v = r() < 0.5 ? 0 : 255; d[k * 4] = v; d[k * 4 + 1] = v; d[k * 4 + 2] = v; d[k * 4 + 3] = (r() * 255) | 0; }
      c.putImageData(id, 0, 0);
    });
    sp.scan = bake2d(K, 'scan', 4, VIEW_H, (c) => { for (let y = 0; y < VIEW_H; y++) { const m = y % 3; if (m === 2) continue; c.fillStyle = `rgba(6,0,18,${m === 0 ? 0.26 : 0.08})`; c.fillRect(0, y, 4, 1); } });
    sp.vign = bake2d(K, 'vign', 256, 256, (c) => { c.fillStyle = rgrad(c, 128, 128, 70, 190, [[0, 'rgba(10,0,25,0)'], [0.6, 'rgba(10,0,25,0.12)'], [1, 'rgba(10,0,25,0.5)']]); c.fillRect(0, 0, 256, 256); });
    // OSD sprites
    this.osd = new Map();
    for (const t of ['PLAY ▶', 'SLOW ▶', 'TRACKING', 'AM 2:19']) this.osdSprite(t);
    // palms, checkerboard, stars, floating texts
    this.palms = [makePalm('B', [292, 668], [266, 468], 0.62, 9), makePalm('A', [62, 772], [118, 318], 1.0, 11)];
    const r = rng(hash(ID, 'stars'));
    this.stars = Array.from({ length: 18 }, () => ({ x: r.range(20, 980), y: Math.pow(r(), 1.3) * 330 + 20, s: r.range(7, 16), f: r.range(0.6, 1.6), ph: r.range(0, TAU) }));
    // live canvases
    this.rg = createGraphics(1300, 1000); this.rg.pixelDensity(1);
    this.fg = createGraphics(1300, 400); this.fg.pixelDensity(1);
    this.hg = createGraphics(560, 560); this.hg.pixelDensity(1);
    this.pg = createGraphics(1000, 1150); this.pg.pixelDensity(1);
    this.cg = createGraphics(300, 300); this.cg.pixelDensity(1);
  },

  dispose() {
    for (const g of [this.rg, this.fg, this.hg, this.pg, this.cg]) try { g?.remove(); } catch {}
    this.rg = this.fg = this.hg = this.pg = this.cg = null;
  },

  osdSprite(text) {
    let s = this.osd.get(text);
    if (!s) { const cv = osdCanvas(text); s = { img: nearestImageFrom(cv), w: cv.width, h: cv.height }; this.osd.set(text, s); }
    return s;
  },

  mods(u) {
    if (u <= 1.2 || u >= 4.2) return {};
    const m = {};
    const d = smootherstep(1.5, 2.0, u) * (1 - smootherstep(3.6, 4.0, u));
    if (d > 1e-4) m.bob = 1 - 0.6 * d;
    const lb = smootherstep(2.0, 2.4, u) * (1 - smootherstep(3.2, 3.6, u));
    if (lb > 1e-4) m.lookBack = 0.3 * lb;
    return m;
  },

  // ---------------------------------------------------------------- picture
  render(K, u, ctx) {
    const wc = wclock(u);
    const S = clamp(ctx.pxu, 0.35, 2.2);
    const st = { u, wc, S, ctx, gl: glitchAmt(u), fx: fxIn(u) };
    // live layers (painted once, composed possibly several times)
    st.rider = ctx.rider.visible ? this.paintRider(u, ctx, S, st) : null;
    st.head = this.paintHead(u, ctx, S);
    st.palms = this.paintPalms(wc, ctx, S);
    st.check = this.paintCheck(wc, ctx, S);
    st.lines = this.gridLines(wc);
    push();
    imageMode(CORNER); noStroke(); noTint(); blendMode(BLEND);
    this.band = null;
    this.compose(K, st);
    this.vhs(K, st);
    pop();
  },

  /** Image draw through the current tear band (clip to rows, shift by dx). */
  blit(img, x, y, w, h, sx = 0, sy = 0, sw = img.width, sh = img.height, dxk = 'dx') {
    const B = this.band;
    if (!B) { image(img, x, y, w, h, sx, sy, sw, sh); return; }
    const y0 = Math.max(y, B.y0), y1 = Math.min(y + h, B.y1);
    if (y1 <= y0) return;
    const k0 = (y0 - y) / h, k1 = (y1 - y) / h;
    image(img, x + B[dxk], y0, w, y1 - y0, sx, sy + k0 * sh, sw, (k1 - k0) * sh);
  },

  /** The whole picture (also re-run inside tear bands). */
  compose(K, st) {
    const { u, wc, ctx } = st;
    const v = ctx.view;
    blendMode(BLEND); noTint();
    // sky, stars, sun, mountains, floor
    this.blit(this.sky, 0, 0, 1000, SKY.h);
    blendMode(ADD);
    for (const s of this.stars) {
      const a = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(wc * s.f + s.ph)), 3);
      tint(255, 240, 255, 255 * a * 0.85);
      this.blit(this.spr.star, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
    }
    noTint(); blendMode(BLEND);
    this.drawSun(wc);
    this.blit(this.mtn, 0, MTN.y0, 1000, MTN.h);
    this.blit(this.floor, 0, FLR.y0, 1000, FLR.h);
    // horizontal grid lines + the road (the rider's reflection lies on the glossy floor under them)
    blendMode(ADD);
    this.blit(this.bustRefl, BST.x0, this.bustReflY, BST.w, this.bustReflH);
    if (st.rider) { const F = st.rider.refl; this.blit(F.g, F.x0, F.y0, F.w, F.h, 0, 0, F.pw, F.ph, 'dxR'); }
    const hl = this.spr.hline;
    for (const L of st.lines) {
      tint(61, 242, 255, 255 * L.a);
      this.blit(hl, 0, L.y - L.g / 2, 1000, L.g);
    }
    tint(255, 90, 200, 150); this.blit(hl, 0, ROAD - 16, 1000, 32);
    tint(120, 250, 255, 255); this.blit(hl, 0, ROAD - 7, 1000, 14);
    tint(255, 255, 255, 200); this.blit(hl, 0, ROAD - 3, 1000, 6);
    noTint(); blendMode(BLEND);
    // title (with glints running over the chrome), checkerboard
    this.blit(this.title, TTL.x0, TTL.y0, TTL.w, TTL.h);
    blendMode(ADD);
    for (const [k, x, y, sz] of [[0, 318, 74, 40], [1, 553, 158, 30], [2, 706, 66, 44], [3, 420, 168, 26]]) {
      const a = Math.pow(Math.max(0, Math.sin(wc * 1.25 + k * 1.9)), 10);
      if (a < 0.02) continue;
      tint(255, 236, 250, 255 * a);
      this.blit(this.spr.star, x - sz / 2, y - sz / 2, sz, sz);
    }
    noTint(); blendMode(BLEND);
    if (st.check) this.blit(st.check.g, st.check.x0, st.check.y0, st.check.w, st.check.h, 0, 0, st.check.pw, st.check.ph);
    // palms
    if (st.palms) this.blit(st.palms.g, st.palms.x0, st.palms.y0, st.palms.w, st.palms.h, 0, 0, st.palms.pw, st.palms.ph);
    // bust: column + chest, head, eye glow
    this.blit(this.bust, BST.x0, BST.y0, BST.w, BST.h);
    if (st.head) this.blit(st.head.g, st.head.x0, st.head.y0, st.head.w, st.head.h, 0, 0, st.head.pw, st.head.ph);
    this.drawEyes(u, st);
    // the rider
    if (st.rider) this.drawRider(u, st);
    this.drawFloatText(K, u, st);
  },

  drawSun(wc) {
    const R = SUN.r, P = SUNB.pad, S = SUNB.s, SR = R + P;
    const x0 = SUN.x - SR, y0 = SUN.y - SR;
    // stripes: gaps in the lower part, thicker toward the bottom, drifting down with the tape
    const ya = SUN.y - R * 0.3, yb = HZN + 2;
    const phase = (wc * 0.16) % 1;
    const N = 8;
    const gaps = [];
    for (let k = -1; k <= N; k++) {
      const t = (k + phase) / N;
      if (t < 0 || t > 1) continue;
      const yc = ya + (yb - ya) * t;
      const g = 1.6 + 15 * Math.pow(t, 1.25);
      gaps.push([yc - g / 2, yc + g / 2]);
    }
    let y = y0;
    const yEnd = Math.min(SUN.y + SR, HZN + 2);
    const slice = (a, b) => { if (b - a < 0.05) return; this.blit(this.sun, x0, a, 2 * SR, b - a, 0, (a - y0) * S, 2 * SR * S, (b - a) * S); };
    for (const [g0, g1] of gaps) { if (g0 > y) slice(y, Math.min(g0, yEnd)); y = Math.max(y, g1); }
    if (y < yEnd) slice(y, yEnd);
  },

  gridLines(wc) {
    const out = [];
    const DZ = 0.25;
    const psi = ((wc * 0.42) % 1 + 1) % 1;
    for (let n = 1; n < 60; n++) {
      const z = DZ * (n - psi);
      if (z <= 0) continue;
      const y = HZN + FH / z;
      if (y > 1012) continue;
      if (y < HZN + 6) break;
      const core = 2.1 / z;
      const a = smoothstep(HZN + 4, HZN + 70, y) * clamp(0.35 + core * 0.45);
      out.push({ y, g: Math.max(3, core * 12), a });
    }
    return out;
  },

  // ---------------------------------------------------------------- live canvases
  paintRider(u, ctx, S, st) {
    const R = ctx.rider;
    const w = waveW(u), osc = waveOsc(u);
    const P = w > 0 ? placePose(wavePose(R.pose, w, osc), R.place) : R.placed;
    const px = R.place.x;
    const fx = st.fx;
    const bx0 = px - 320, by0 = 400, bw = 560, bh = 422;
    const g = this.rg, c = g.drawingContext;
    const s = Math.min(S, g.width / bw, g.height / bh);
    const pw = Math.ceil(bw * s), ph = Math.ceil(bh * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(s, 0, 0, s, -bx0 * s, -by0 * s);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 1;
    // slow-motion echoes (inside (1, 5) only)
    if (fx > 0.01) {
      const cols = ['#ff6ad5', '#3df2ff'];
      for (let k = 2; k >= 1; k--) {
        const dt = 0.17 * k;
        const Rk = ctx.riderAt(ctx.t - dt);
        if (!Rk.visible) continue;
        const uk = u - dt;
        const wk = waveW(uk);
        const Pk = wk > 0 ? placePose(wavePose(Rk.pose, wk, waveOsc(uk)), Rk.place) : Rk.placed;
        c.globalAlpha = fx * (k === 1 ? 0.3 : 0.17);
        c.fillStyle = c.strokeStyle = cols[k - 1];
        paintSilhouette(c, Pk);
      }
      c.globalAlpha = 1;
    }
    const spin = clamp(Math.abs(R.state.v) / 171, 0, 1.4);
    paintPelican(c, P, { spin, crank: R.state.crank });
    c.setTransform(1, 0, 0, 1, 0, 0);
    // its reflection in the glossy floor (mirrored about the road line, fading with depth)
    const RH = 170, rg = this.fg, rc = rg.drawingContext;
    const rph = Math.ceil(RH * s);
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = 'source-over';
    rc.clearRect(0, 0, pw + 2, rph + 2);
    const sy0 = (ROAD - by0) * s;
    rc.save(); rc.translate(0, rph); rc.scale(1, -1);
    rc.drawImage(c.canvas, 0, sy0 - rph, pw, rph, 0, 0, pw, rph);
    rc.restore();
    rc.globalCompositeOperation = 'destination-in';
    rc.fillStyle = grad(rc, 0, 0, 0, rph, [[0, 'rgba(0,0,0,0.5)'], [0.35, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
    rc.fillRect(0, 0, pw, rph);
    rc.globalCompositeOperation = 'source-over';
    const refl = { g: rg, x0: bx0, y0: ROAD, w: pw / s, h: rph / s, pw, ph: rph };
    return { g, x0: bx0, y0: by0, w: pw / s, h: ph / s, pw, ph, P, refl };
  },

  paintHead(u, ctx, S) {
    const v = ctx.view;
    if (v.x1 < BUST.x - 90 || v.x0 > BUST.x + 90) return null;
    const rx = ctx.rider.place.x;
    const look = bustLook(u, rx);
    this.look = look;
    const x0 = BUST.x - 100, y0 = BUST.y - 68, w = 200, h = 238;
    const g = this.hg, c = g.drawingContext;
    const s = Math.min(S * 1.25, g.width / w, g.height / h);
    const pw = Math.ceil(w * s), ph = Math.ceil(h * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.lineWidth = 0.9;
    const proj = (q) => [(BUST.x + q[0] * BUST.hu - x0) * s, (BUST.y - q[1] * BUST.hu - y0) * s];
    const xf = headXf(look.yaw, look.nod);
    renderMeshes(c, [{ mesh: this.meshes.chest, xf: (p) => rotX(rotY(p, CHEST_YAW), VIEW_PITCH), key: 700000 }, { mesh: this.meshes.head, xf, key: 0 }], proj);
    // faint veins in the chest's marble
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const vn of this.veins) {
      c.strokeStyle = `rgba(130,110,180,${vn.a})`; c.lineWidth = vn.w * s;
      c.beginPath(); vn.pts.forEach((p, k) => (k ? c.lineTo((p[0] - x0) * s, (p[1] - y0) * s) : c.moveTo((p[0] - x0) * s, (p[1] - y0) * s))); c.stroke();
    }
    c.restore();
    // eye positions (panel units) and how much of each eye faces us
    const eyes = [-1, 1].map((sd) => {
      const a = 0.42 * sd;
      const q = headPoint(HR[EYE_RING], a, EYE_RING, 0).p;
      const p = xf([q[0], q[1] - 0.01, q[2] + 0.05]);
      const nrm = xf([Math.sin(a) * 0.7, 0, Math.cos(a)]), o = xf([0, 0, 0]);
      const vis = clamp(((nrm[2] - o[2]) - 0.05) / 0.4);
      return { x: BUST.x + p[0] * BUST.hu, y: BUST.y - p[1] * BUST.hu, vis };
    });
    this.eyes = eyes;
    return { g, x0, y0, w: pw / s, h: ph / s, pw, ph };
  },

  paintPalms(wc, ctx, S) {
    const v = ctx.view;
    const x0 = -70, y0 = 220, w = 470, h = 560;
    if (v.x1 < x0 || v.x0 > x0 + w) return null;
    const g = this.pg, c = g.drawingContext;
    const s = Math.min(S, g.width / w, g.height / h);
    const pw = Math.ceil(w * s), ph = Math.ceil(h * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    for (const P of this.palms) paintPalm(c, P, wc);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return { g, x0, y0, w: pw / s, h: ph / s, pw, ph };
  },

  paintCheck(wc, ctx, S) {
    const v = ctx.view;
    const cx = 902, cy = 168 + 7 * Math.sin(wc * 0.7), half = 58;
    const x0 = cx - 95, y0 = 168 - 100, w = 190, h = 200;
    if (v.x1 < x0 || v.x0 > x0 + w) return null;
    const g = this.cg, c = g.drawingContext;
    const s = Math.min(S, g.width / w, g.height / h);
    const pw = Math.ceil(w * s), ph = Math.ceil(h * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw + 2, ph + 2);
    const spin = 0.5 + wc * 0.32, tilt = 0.95;
    const xf = (p) => rotX(rotX(rotY(p, spin), tilt), -0.05);
    const proj = (q) => [(cx + q[0] * half - x0) * s, (cy - q[1] * half - y0) * s];
    const nrm = xf([0, 1, 0]);
    const facing = nrm[2] >= 0 ? 1 : -1;
    const lit = clamp(0.55 + 0.45 * (nrm[0] * M_KEY[0] + nrm[1] * M_KEY[1] + nrm[2] * M_KEY[2]) * facing);
    const N = 6;
    c.lineJoin = 'round';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = -1 + (2 * i) / N, b = -1 + (2 * j) / N, d = 2 / N;
      const q = [[a, 0, b], [a + d, 0, b], [a + d, 0, b + d], [a, 0, b + d]].map((p) => proj(xf(p)));
      const white = (i + j) % 2 === 0;
      const col = white ? mixc(hx('#5b4a92'), hx('#fbf6ff'), lit) : mixc(hx('#0c0418'), hx('#3a1f5c'), lit);
      c.fillStyle = c.strokeStyle = css(col); c.lineWidth = 0.8;
      poly(c, q); c.fill(); c.stroke();
    }
    const edge = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]].map((p) => proj(xf(p)));
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(61,242,255,0.25)'; c.lineWidth = 6 * s; poly(c, edge); c.stroke();
    c.strokeStyle = 'rgba(200,255,255,0.95)'; c.lineWidth = 1.6 * s; poly(c, edge); c.stroke();
    c.globalCompositeOperation = 'source-over';
    return { g, x0, y0, w: pw / s, h: ph / s, pw, ph };
  },

  // ---------------------------------------------------------------- picture pieces
  drawEyes(u, st) {
    if (!this.eyes || !st.head) return;
    const S = this.spr;
    blendMode(ADD);
    // a glint as the head turns (1.45 → 1.85)
    if (u > 1.45 && u < 1.9) {
      const k = Math.sin(Math.PI * (u - 1.45) / 0.45);
      const e = this.eyes.reduce((a, b) => (b.vis > a.vis ? b : a));
      const sz = 34 * k;
      tint(255, 255, 255, 255 * k);
      this.blit(S.star, e.x - sz / 2 + 2, e.y - sz / 2 - 1, sz, sz);
    }
    const g = eyeGlow(u);
    if (g > 0.003) {
      for (const e of this.eyes) {
        const a = g * (0.25 + 0.75 * e.vis);
        tint(61, 242, 255, 255 * clamp(a * 0.55)); this.blit(S.glow, e.x - 26, e.y - 26, 52, 52);
        tint(200, 255, 255, 255 * clamp(a)); this.blit(S.glow, e.x - 7, e.y - 7, 14, 14);
        tint(61, 242, 255, 255 * clamp(a * 0.75)); this.blit(S.streak, e.x - 90 * g, e.y - 3, 180 * g, 6);
      }
    }
    noTint(); blendMode(BLEND);
  },

  drawRider(u, st) {
    const Rr = st.rider, fx = st.fx;
    const gl = st.gl;
    const off = (2.2 + 10 * gl) * fx;
    if (off > 0.3) {
      tint(255, 40, 110, 115 * fx); this.blit(Rr.g, Rr.x0 - off, Rr.y0, Rr.w, Rr.h, 0, 0, Rr.pw, Rr.ph, 'dxR');
      tint(40, 230, 255, 115 * fx); this.blit(Rr.g, Rr.x0 + off, Rr.y0, Rr.w, Rr.h, 0, 0, Rr.pw, Rr.ph, 'dxR');
      noTint();
    }
    this.blit(Rr.g, Rr.x0, Rr.y0, Rr.w, Rr.h, 0, 0, Rr.pw, Rr.ph, 'dxR');
    // a sparkle runs up the chrome down tube (3.0 → 3.5), then winks on the front rim
    const spark = (x, y, sz, a) => {
      blendMode(ADD);
      tint(255, 120, 220, 200 * a); this.blit(this.spr.glow, x - sz * 0.7, y - sz * 0.7, sz * 1.4, sz * 1.4, 0, 0, 128, 128, 'dxR');
      tint(255, 255, 255, 255 * a); this.blit(this.spr.star, x - sz / 2, y - sz / 2, sz, sz, 0, 0, 64, 64, 'dxR');
      noTint(); blendMode(BLEND);
    };
    if (u > 2.98 && u < 3.5) {
      const k = (u - 2.98) / 0.52;
      const T = Rr.P.bike.tubes.downtube;
      const e = easeInOut(k);
      spark(lerp(T[0][0], T[1][0], e), lerp(T[0][1], T[1][1], e), 74 * Math.sin(Math.PI * k), 1);
    }
    if (u > 3.4 && u < 3.7) {
      const k = (u - 3.4) / 0.3, W = Rr.P.bike.wheels[1];
      spark(W.c[0] + W.r * 0.62, W.c[1] - W.r * 0.62, 50 * Math.sin(Math.PI * k), 0.9);
    }
  },

  drawFloatText(K, u, st) {
    if (u < 1.95 || u > 4.6 || this.band) return;
    const items = [
      { t0: 2.0, text: 'ａｅｓｔｈｅｔｉｃ', font: '"Hiragino Mincho ProN", "Songti SC", serif', size: 46, x: 520, y: 346 },
      { t0: 2.15, text: '鹈鹕　ＣＹＣＬＥ', font: '"Songti SC", serif', size: 40, x: 540, y: 398 },
    ];
    for (const it of items) {
      const age = u - it.t0;
      if (age < 0) continue;
      const a = smoothstep(0, 0.25, age) * (1 - smoothstep(1.9, 2.4, age)) * (1 - st.gl * 0.7);
      if (a < 0.01) continue;
      const y = it.y - 22 * age;
      const sp = K.textSprite({ text: it.text, font: it.font, size: it.size * 2, weight: 600, color: '#ffffff', letterSpacing: 4, pad: 16 });
      const ol = K.textSprite({ text: it.text, font: it.font, size: it.size * 2, weight: 600, color: '#2a0b48', letterSpacing: 4, pad: 16, stroke: '#2a0b48', strokeWidth: 6 });
      const w = sp.w / 2, h = sp.h / 2, x = it.x - w / 2;
      tint(255, 255 * a * 0.75); image(ol.img, x + 5, y + 5, w, h);
      tint(255, 255 * a * 0.9); image(ol.img, x, y, w, h);
      blendMode(ADD);
      tint(255, 40, 140, 200 * a); image(sp.img, x - 3, y, w, h);
      tint(40, 230, 255, 200 * a); image(sp.img, x + 3, y, w, h);
      blendMode(BLEND);
      tint(255, 240, 252, 255 * a); image(sp.img, x, y, w, h);
      noTint();
    }
  },

  // ---------------------------------------------------------------- the VHS layer
  vhs(K, st) {
    const { u, wc, ctx } = st;
    const v = ctx.view;
    const f = Math.round(ctx.t * 30);
    const S = this.spr;
    const tearRider = st.fx > 0.5;
    const bands = [];
    // the slow rolling tracking band
    const yT = 1060 - (((wc * 46 + 420) % 1250) + 1250) % 1250;
    for (let k = 0; k < 3; k++) bands.push({ y0: yT + k * 12, y1: yT + k * 12 + 12, dx: (rnd('tb', f, k) - 0.5) * 7, noise: 0.28 });
    // the tape speeding back up: fast bands rush up the picture (5.5 → 6)
    if (u > 5.5 && u < 6) {
      for (let k = 0; k < 3; k++) {
        const y = 1000 - ((u - 5.5) / 0.5) * 1300 + k * 300;
        bands.push({ y0: y, y1: y + 16 + 8 * k, dx: (rnd('fb', f, k) - 0.5) * 28, noise: 0.6 });
      }
    }
    // head-switching noise along the bottom edge
    bands.push({ y0: 979, y1: 1000, dx: 4 + 8 * rnd('hs', f), noise: 0.45 });
    // the glitch at 4.0 tears through the pelican
    if (st.gl > 0) {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const y0 = 440 + rnd('gy', f, k) * 380, hgt = 10 + rnd('gh', f, k) * 48;
        const dx = (rnd('gx', f, k) - 0.5) * 2 * 95 * st.gl;
        bands.push({ y0, y1: y0 + hgt, dx, noise: 0.35 * st.gl });
      }
    }
    for (const b of bands) {
      if (b.y1 < v.y0 || b.y0 > v.y1) continue;
      this.band = { y0: b.y0, y1: b.y1, dx: b.dx, dxR: tearRider ? b.dx : 0 };
      this.compose(K, st);
      this.band = null;
      // noise streaks in the band
      blendMode(ADD);
      tint(255, 255 * b.noise);
      const sy = Math.floor(rnd('ns', f, b.y0) * 200);
      image(S.noise, 0, b.y0, 1000, b.y1 - b.y0, Math.floor(rnd('nx', f, b.y0) * 100), sy, 400, Math.min(56, (b.y1 - b.y0) * 1.2));
      noTint(); blendMode(BLEND);
    }
    // glitch: a bright noise bar across the bird and a colour flash
    if (st.gl > 0) {
      blendMode(ADD);
      const y = 560 + rnd('gb', f) * 120;
      tint(255, 255 * 0.7 * st.gl); image(S.noise, 0, y, 1000, 42, 0, Math.floor(rnd('gbs', f) * 200), 512, 42);
      tint(255, 60, 200, 60 * st.gl); image(S.glow, -200, 380, 1400, 520);
      noTint(); blendMode(BLEND);
    }
    // grain, vignette, screen-locked scanlines
    blendMode(BLEND);
    const gx = Math.floor(rnd('gx', f) * 128), gy = Math.floor(rnd('gy', f) * 128);
    tint(255, 20); image(S.grain, 0, 0, 1000, 1000, gx, gy, 128, 128);
    noTint();
    image(S.vign, 0, 0, 1000, 1000);
    image(S.scan, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    this.drawOSD(u, wc, st);
  },

  drawOSD(u, wc, st) {
    const px = 3.1;                                   // panel units per OSD pixel
    const put = (text, x, y, a = 1, k = px) => {
      const s = this.osdSprite(text);
      tint(255, 255 * a); image(s.img, x, y, s.w * k, s.h * k); noTint();
    };
    const f = Math.round(st.ctx.t * 30);
    // mode
    let mode = 'PLAY ▶';
    if (u >= 0 && u < 5.5) mode = 'SLOW ▶';
    const blinkIn = (t0) => (u >= t0 && u < t0 + 0.5 ? (Math.floor((u - t0) * 8) % 2 ? 0.35 : 1) : 1);
    let a = 1;
    if (u >= 0 && u < 0.5) a = blinkIn(0);
    if (u >= 5.5 && u < 6.0) a = blinkIn(5.5);
    if (st.gl > 0) a *= 0.5 + 0.5 * rnd('osd', f);
    put(mode, 34, 30, a);
    put('AM 2:19', 34, 84, 0.92, 2.6);
    // TRACKING during the glitch
    if (u >= 3.98 && u < 4.7) {
      const k = 1 - smoothstep(4.45, 4.7, u);
      put('TRACKING', 370, 896, k);
      const bars = 12, on = Math.round(lerp(3, 9, smoothstep(4.0, 4.4, u)) + (rnd('tr', f) < 0.3 ? 1 : 0));
      fill(248, 246, 255, 255 * k); noStroke();
      for (let i = 0; i < bars; i++) {
        const x = 374 + i * 22;
        if (i < on) rect(x, 950, 16, 14); else { rect(x, 961, 16, 3); }
      }
    }
    // tape counter (slow during slow motion)
    const sec = Math.floor(18 * 60 + 24 + wc);
    const cnt = `SP ${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    put(cnt, 34, 936, 0.92, 2.6);
  },
};
