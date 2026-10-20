// 13 · 呐喊 · 1893 — an original composition in the manner of Edvard Munch's *The Scream*
// (tempera and crayon on cardboard, 1893; public domain). Nothing is traced: the bridge, the fjord,
// the hills, the two strollers and the screamer are my own drawing of the type.
//
// Picture
//   • brown cardboard; thin scrubby tempera strokes and crayon lines that follow long serpentine band
//     "families" (lofted between two boundary curves), the board showing through every gap
//   • sky in orange-red-yellow ribbons, blue-black fjord curling into an inlet, a green-grey headland
//   • the bridge railing — the one hard straight element — level across the middle, bending into a
//     steep perspective diagonal at the far left, where two dark strollers walk away
// Technique
//   • the world (sky / hills / fjord / land) is ONE baked Canvas2D texture drawn as a WebGL mesh whose
//     texture coordinates are displaced per vertex every frame → the whole painting undulates
//     (ambient drift, jagged spikes, scream ripples, violent shaking, a dead stop) for ~1 ms of maths
//   • deck + railing + pencil inscription: static bakes on top (never warped)
//   • the screamer, the strollers and the pelican are painted live in Canvas2D with the same dry-brush
//     stroke engine into one reusable panel-sized canvas (one texture upload per frame); they ride
//     the same wave field (the pelican only inside u ∈ (1, 5))
import { lerp, clamp, smoothstep, smootherstep, smoothPath, easeInOut } from '../kit/math.js';

const ID = 'scream';
const RIDE = { hold: [2.3, 3.8], speed: 0.3, ramp: 0.3 };

// ------------------------------------------------------------------ palette
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${+a.toFixed(3)})`;
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const H_ = (h) => hexRGB(h);
const COL = {
  blood: H_('#d4542b'), yellow: H_('#e6b54a'), red: H_('#b33a28'), fjord: H_('#2a3b66'), deep: H_('#18203a'),
  land: H_('#5c6b4b'), face: H_('#e3d8a6'), board: H_('#8c6a45'),
  ink: H_('#151a2c'), coat: H_('#1b2136'), shade: H_('#98a06c'), shade2: H_('#7f8c62'), pale: H_('#f1e8c2'),
  rail: H_('#9c4527'), railHi: H_('#d0733a'), railDk: H_('#3a1d16'), graphite: H_('#2c2629'),
};
function palette(stops) {
  const S = stops.map(([c, h]) => [c, hexRGB(h)]);
  return (c) => {
    if (c <= S[0][0]) return S[0][1];
    for (let i = 1; i < S.length; i++) {
      if (c <= S[i][0]) { const t = (c - S[i - 1][0]) / (S[i][0] - S[i - 1][0]); return mixC(S[i - 1][1], S[i][1], t); }
    }
    return S[S.length - 1][1];
  };
}

// ------------------------------------------------------------------ fast deterministic noise
function ih(i, s) {
  let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(((s | 0) + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const vn1 = (x, s) => { const i = Math.floor(x); let f = x - i; f = f * f * (3 - 2 * f); const a = ih(i, s); return a + (ih(i + 1, s) - a) * f; };
function vn2(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const k0 = Math.imul(iy, 0x27d4eb2d), k1 = Math.imul(iy + 1, 0x27d4eb2d);
  const a = ih(ix + k0, s), b = ih(ix + 1 + k0, s), c = ih(ix + k1, s), d = ih(ix + 1 + k1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fb2(x, y, s, o = 4) { let v = 0, a = 1, n = 0, f = 1; for (let k = 0; k < o; k++) { v += a * vn2(x * f, y * f, s + k * 131); n += a; a *= 0.5; f *= 2; } return v / n; }
function sh(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ------------------------------------------------------------------ geometry helpers
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
function pathPoly(x, pts, close = true) {
  x.beginPath();
  for (let i = 0; i < pts.length; i++) (i ? x.lineTo(pts[i][0], pts[i][1]) : x.moveTo(pts[i][0], pts[i][1]));
  if (close) x.closePath();
}
function arcLen(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; }
/** resample a polyline to N points equally spaced along its length */
function resampleN(P, N) {
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = L[L.length - 1] || 1, out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const d = (tot * k) / (N - 1);
    while (j < P.length - 2 && L[j + 1] < d) j++;
    const f = clamp((d - L[j]) / Math.max(1e-6, L[j + 1] - L[j]), 0, 1);
    out.push([lerp(P[j][0], P[j + 1][0], f), lerp(P[j][1], P[j + 1][1], f)]);
  }
  return out;
}
/** densify to roughly one point every ds units */
function dense(P, ds = 3, closed = false) {
  const Q = closed ? P.concat([P[0]]) : P;
  const n = Math.max(2, Math.ceil(arcLen(Q) / ds) + 1);
  return resampleN(Q, n);
}
function centroid(P) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; }
const shrink = (P, c, f) => P.map((p) => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
function ellipse(cx, cy, rx, ry, n = 20, a = 0) {
  const out = [], ca = Math.cos(a), sa = Math.sin(a);
  for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2, X = Math.cos(t) * rx, Y = Math.sin(t) * ry; out.push([cx + X * ca - Y * sa, cy + X * sa + Y * ca]); }
  return out;
}
/** closed ribbon around a spine with half-width w(s) */
function ribbonPts(sp, w) {
  const L = [], R = [], n = sp.length;
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const hw = w(i / (n - 1));
    L.push([sp[i][0] - dy * hw, sp[i][1] + dx * hw]); R.push([sp[i][0] + dy * hw, sp[i][1] - dx * hw]);
  }
  return L.concat(R.reverse());
}

// ------------------------------------------------------------------ the dry-brush stroke
// A stroke is a bundle of bristles along a dense polyline; each bristle runs dry in places (value
// noise along the length, drier toward the end) so the brown board shows through the paint.
// o = { w, col:[r,g,b], a, dry 0..1, gap (units per noise cell), nb, seed, cj (colour jitter), taper, wav, wl, wph }
function dryStroke(x, P, o) {
  if (P.length < 2) return;
  if (P.length < 12) P = resampleN(P, 12);          // short marks need samples for the bristle trims and dry gaps
  const n = P.length;
  const L = new Float32Array(n);
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const tot = L[n - 1];
  if (tot < 0.6) return;
  const NX = new Float32Array(n), NY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = P[i > 0 ? i - 1 : 0], p1 = P[i < n - 1 ? i + 1 : n - 1];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l; NY[i] = dx / l;
  }
  const w = o.w, seed = o.seed | 0;
  const nb = o.nb ?? Math.max(1, Math.min(7, Math.round(w / 1.7)));
  const dry = o.dry ?? 0.3, gap = o.gap ?? 16, a = o.a ?? 0.85, cj = o.cj ?? 12, tp = o.taper ?? 0.22;
  const col = o.col;
  const wav = o.wav || 0, wl = o.wl || 30, wph = o.wph || 0;
  for (let j = 0; j < nb; j++) {
    const r = (m) => ih(j * 11 + m, seed);
    const off = nb === 1 ? 0 : ((j + 0.5) / nb - 0.5) * w + (r(1) - 0.5) * (w / nb) * 0.6;
    const bw = nb === 1 ? w : (w / nb) * (1.2 + r(2) * 0.7);
    const al = a * (0.62 + 0.38 * r(4));
    const s0 = r(5) * 0.1, s1 = 1 - r(6) * 0.12;
    const ns = r(7) * 500;
    x.beginPath();
    let on = false, cnt = 0;
    for (let i = 0; i < n; i++) {
      const s = L[i] / tot;
      if (s < s0 || s > s1) { on = false; continue; }
      if (dry > 0) {
        const thr = dry * (0.5 + 0.9 * s);
        if (vn1(L[i] / gap + ns, seed + j * 7) < thr) { on = false; continue; }
      }
      const env = Math.min(1, s / tp, (1 - s) / tp);
      let ox = off * (0.3 + 0.7 * env);
      if (wav) ox += wav * Math.sin((L[i] / wl) * 6.2832 + wph);
      const px = P[i][0] + NX[i] * ox, py = P[i][1] + NY[i] * ox;
      if (!on) { x.moveTo(px, py); on = true; } else { x.lineTo(px, py); cnt++; }
    }
    if (!cnt) continue;
    x.strokeStyle = rgba([col[0] + (r(3) - 0.5) * cj, col[1] + (r(8) - 0.5) * cj, col[2] + (r(9) - 0.5) * cj], al);
    x.lineWidth = bw;
    x.stroke();
  }
}

// ------------------------------------------------------------------ band families
/** lines lofted between two boundary curves A (c = 0) and B (c = 1), plus a vertical wave */
function makeFamily(Araw, Braw, wave, N = 260) {
  const A = resampleN(Araw, N), B = resampleN(Braw, N);
  const Lf = Math.max(arcLen(A), arcLen(B));
  const at = (c, t) => {
    const f = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)), w = f - i;
    const ax = A[i][0] + (A[i + 1][0] - A[i][0]) * w, ay = A[i][1] + (A[i + 1][1] - A[i][1]) * w;
    const bx = B[i][0] + (B[i + 1][0] - B[i][0]) * w, by = B[i][1] + (B[i + 1][1] - B[i][1]) * w;
    const X = ax + (bx - ax) * c;
    let Y = ay + (by - ay) * c;
    if (wave) Y += wave(c, t, X);
    return [X, Y];
  };
  return { A, B, at, L: Lf };
}
function famLine(fam, c, t0, t1, ds = 3.2) {
  t0 = clamp(t0, 0, 1); t1 = clamp(t1, 0, 1);
  const n = Math.max(2, Math.ceil(((t1 - t0) * fam.L) / ds));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(fam.at(c, t0 + ((t1 - t0) * i) / n));
  return out;
}
/** paint a family with several passes of strokes, clipped to a region */
function paintFamily(x, fam, clipPoly, passes, base) {
  x.save();
  if (clipPoly) { pathPoly(x, clipPoly); x.clip(); }
  passes.forEach((ps, pi) => {
    for (let k = 0; k < ps.n; k++) {
      const s = (base + pi * 100003 + k * 7919) | 0;
      const R = (m) => ih(k * 37 + m, s ^ (pi * 7907));
      const c = lerp(ps.c0 ?? -0.03, ps.c1 ?? 1.03, R(1));
      const lenU = lerp(ps.len[0], ps.len[1], R(2));
      const dt = lenU / fam.L;
      const t0 = lerp(-dt * 0.6, 1 - dt * 0.4, R(3));
      const pts = famLine(fam, c, t0, t0 + dt);
      if (pts.length < 3) continue;
      if (ps.scrub) {
        const m = pts[pts.length >> 1];
        const f = fb2(m[0] / 190 + 3.1, m[1] / 120 + 7.7, 404, 3);
        if (f < ps.scrub + 0.18 * R(13)) continue;
      }
      let cc = c + (R(6) - 0.5) * 0.035;
      if (R(4) < (ps.mix ?? 0.15)) cc = c + (R(5) - 0.5) * (ps.mixW ?? 0.3);
      const col = ps.col ? ps.col(clamp(cc, 0, 1), R, pts) : ps.pal(clamp(cc, 0, 1));
      if (!col) continue;
      dryStroke(x, pts, {
        w: lerp(ps.w[0], ps.w[1], R(7)), col, a: ps.a * (0.78 + 0.22 * R(8)), dry: ps.dry, gap: ps.gap,
        seed: s, cj: ps.cj ?? 16, taper: ps.taper, nb: ps.nb, wav: ps.wav, wl: ps.wl, wph: R(9) * 6,
      });
    }
  });
  x.restore();
}

// ================================================================== the picture's geometry
const MG = 56;                       // warp margin (units) around the world texture
const WY1 = 812;                     // world texture bottom (units); the deck covers everything below the railing foot
const WPX = 1.5;                     // world texture px per unit
const TW = 1000 + 2 * MG, TH = WY1 + MG;
const CELL = 12.5;                   // warp mesh cell (units)
const FPX = 1.5;                     // front layer (deck + railing) px per unit
const FY0 = 420;                     // front layer top (units)

// the bridge: level railing across the middle, a perspective diagonal to the vanishing point at the left
const VP = [-46, 432];
const XB = 350;
const RAIL = { top: 604, foot: 764 };
function railY(y0, x) {
  const s = (XB - x) / (XB - VP[0]);
  const e = 0.04;
  return y0 + (VP[1] - y0) * ((s + Math.sqrt(s * s + e * e)) / 2);
}
const footY = (x) => railY(RAIL.foot, x);
const topY = (x) => railY(RAIL.top, x);
const rsc = (x) => (footY(x) - topY(x)) / (RAIL.foot - RAIL.top);

// horizon (hill tops) and the far shore
const HZ = (x) => 396 - 92 * gauss(x, 150, 210) - 28 * gauss(x, 610, 150) - 16 * gauss(x, 905, 120) + 5 * Math.sin(x / 47 + 1);
const FS = (x) => HZ(x) + 44 + 10 * Math.sin(x / 130 + 0.7) + 40 * gauss(x, 170, 210) + 14 * gauss(x, 560, 120);
// the headland shore: from the hills at the right edge, sweeping down-left under the railing
const SHORE = smoothPath([[1075, 448], [995, 461], [912, 489], [836, 529], [764, 574], [702, 622], [651, 670], [613, 722], [592, 790]], 8);

const curveX = (f, x0, x1, n = 120) => { const o = []; for (let i = 0; i <= n; i++) { const X = lerp(x0, x1, i / n); o.push([X, f(X)]); } return o; };

function buildFamilies() {
  const X0 = -MG - 4, X1 = 1000 + MG + 4;
  // sky: flat top → horizon; ribbons swell and pinch in long serpentine waves
  const sky = makeFamily(curveX(() => -MG - 6, X0, X1), curveX((X) => HZ(X) + 8, X0, X1), (c, t, X) => {
    const env = Math.pow(Math.sin(Math.PI * clamp(c, 0, 1)), 0.75);
    return env * (34 * Math.sin(X * 0.0084 + 2.7 * c + 0.4) + 15 * Math.sin(X * 0.019 - 4.4 * c + 1.1) + 6 * Math.sin(X * 0.043 + 9 * c));
  });
  const skyClip = [[X0, -MG - 8], [X1, -MG - 8]].concat(curveX((X) => HZ(X) + 10, X1, X0));
  // hills between the horizon and the far shore
  const hills = makeFamily(curveX((X) => HZ(X) - 2, X0, X1), curveX((X) => FS(X) + 4, X0, X1), (c, t, X) => 3 * Math.sin(X * 0.03 + c * 5) * Math.sin(Math.PI * c));
  const hillClip = curveX((X) => HZ(X) - 3, X0, X1).concat(curveX((X) => FS(X) + 6, X1, X0));
  // fjord: from the far shore (c = 0) to a bottom boundary that runs under the railing and up the headland shore
  const fjB = [[X0, 830], [560, 830]].concat(SHORE.slice().reverse().map((p) => [p[0] - 2, p[1] + 2]));
  const fjord = makeFamily(curveX((X) => FS(X) - 2, X0, X1), fjB, (c, t, X) => {
    const env = Math.sin(Math.PI * clamp(c, 0, 1));
    return env * (17 * Math.sin(X * 0.0105 + c * 6.5 + 0.8) + 7 * Math.sin(X * 0.027 - c * 9));
  });
  const fjClip = curveX((X) => FS(X) - 3, X0, X1).concat(fjB.slice().reverse());
  // land: lines parallel to the shore, flattening toward the railing
  const landA = SHORE.slice().reverse();
  const land = makeFamily(landA, [[575, 840], [X1 + 10, 840]], (c, t, X) => 6 * Math.sin(X * 0.022 + c * 9) * Math.sin(Math.PI * clamp(c, 0, 1)));
  const landClip = landA.concat([[X1 + 10, 448], [X1 + 10, 850], [575, 850]]);
  return { sky, skyClip, hills, hillClip, fjord, fjClip, land, landClip };
}

// palettes (c = 0 at the top of each family)
const SKY_PAL = palette([
  [0.0, '#bf452b'], [0.06, '#d4542b'], [0.11, '#e0703a'], [0.16, '#d4542b'], [0.2, '#b33a28'], [0.26, '#b33a28'], [0.3, '#d65e2e'],
  [0.37, '#e39a3e'], [0.44, '#e6b54a'], [0.5, '#e9a842'], [0.55, '#d4542b'], [0.59, '#b33a28'], [0.63, '#d86a33'], [0.7, '#e6b54a'],
  [0.78, '#edc862'], [0.85, '#e3a246'], [0.9, '#d9b866'], [0.95, '#a7ac80'], [1.0, '#6f8a7c'],
]);
const HILL_PAL = palette([[0, '#2c4652'], [0.35, '#283c50'], [0.65, '#35514a'], [1, '#1f2e46']]);
const FJORD_PAL = palette([[0, '#2a3b66'], [0.2, '#223058'], [0.45, '#18203a'], [0.62, '#24345e'], [0.8, '#2a3b66'], [0.92, '#35507a'], [1, '#3e5a6a']]);
const LAND_PAL = palette([[0, '#4e6b5c'], [0.12, '#5c6b4b'], [0.3, '#7b8b52'], [0.45, '#5c6b4b'], [0.6, '#9d9455'], [0.75, '#687a4e'], [1, '#4c5c42']]);
const DECK_PAL = palette([[0, '#4e3024'], [0.06, '#8c5230'], [0.18, '#c27a3e'], [0.38, '#b06c38'], [0.55, '#cf8d4b'], [0.75, '#b5703a'], [1, '#9c5c30']]);

// ================================================================== bakes
function boardCanvas() {
  // cardboard for units x ∈ [−MG, 1000+MG], y ∈ [−MG, 1000] at WPX
  const W = Math.round(TW * WPX), H = Math.round((1000 + MG) * WPX);
  const c = mk(W, H), x = c.getContext('2d');
  x.fillStyle = '#8a6844'; x.fillRect(0, 0, W, H);
  // mottling (low resolution, smoothed up)
  const lw = Math.ceil(W / 6), lh = Math.ceil(H / 6);
  const lo = mk(lw, lh), lx = lo.getContext('2d');
  const id = lx.createImageData(lw, lh);
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    const n = fb2(i / 34, j / 34, 11, 4) - 0.5, m = fb2(i / 7, j / 9, 12, 2) - 0.5;
    const v = n * 34 + m * 12;
    const k = (i + j * lw) * 4;
    id.data[k] = 138 + v; id.data[k + 1] = 104 + v * 0.9; id.data[k + 2] = 68 + v * 0.7; id.data[k + 3] = 255;
  }
  lx.putImageData(id, 0, 0);
  x.imageSmoothingEnabled = true;
  x.drawImage(lo, 0, 0, W, H);
  // grain
  const g = mk(192, 192), gx = g.getContext('2d'), gd = gx.createImageData(192, 192);
  for (let k = 0; k < 192 * 192; k++) { const v = ih(k, 77) * 255; gd.data[k * 4] = v; gd.data[k * 4 + 1] = v * 0.85; gd.data[k * 4 + 2] = v * 0.7; gd.data[k * 4 + 3] = 255; }
  gx.putImageData(gd, 0, 0);
  x.save(); x.globalAlpha = 0.1; x.fillStyle = x.createPattern(g, 'repeat'); x.fillRect(0, 0, W, H); x.restore();
  // short fibres
  x.save();
  x.lineCap = 'round';
  for (let k = 0; k < 2600; k++) {
    const px = ih(k, 21) * W, py = ih(k, 22) * H, L = (3 + ih(k, 23) * 12) * WPX, a = ih(k, 24) * Math.PI * 2;
    x.strokeStyle = ih(k, 25) < 0.55 ? `rgba(60,38,20,${0.1 + ih(k, 26) * 0.14})` : `rgba(205,170,120,${0.08 + ih(k, 26) * 0.14})`;
    x.lineWidth = (0.4 + ih(k, 27) * 0.7) * WPX;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
  }
  x.restore();
  return c;
}

let BOARD = null;
function board() { return BOARD || (BOARD = boardCanvas()); }

function paintWorld(x) {
  // x: transform maps units (origin at −MG, −MG) → px
  const F = buildFamilies();
  // sky: underwash, body ribbons, streaks, crayon
  const skyCrayon = (c, R) => { const b = SKY_PAL(c); return R(11) < 0.5 ? mixC(b, [255, 236, 170], 0.35) : mixC(b, [120, 30, 24], 0.35); };
  paintFamily(x, F.sky, F.skyClip, [
    { scrub: 0.4, n: 230, w: [16, 28], len: [220, 620], a: 0.52, dry: 0.08, gap: 60, pal: SKY_PAL, mix: 0.1 },
    { scrub: 0.27, n: 640, w: [6, 12], len: [160, 520], a: 0.8, dry: 0.16, gap: 46, pal: SKY_PAL, mix: 0.16 },
    { scrub: 0.2, n: 480, w: [2.4, 4.8], len: [110, 380], a: 0.85, dry: 0.24, gap: 30, pal: SKY_PAL, mix: 0.35, mixW: 0.25 },
    { n: 220, w: [1.0, 1.8], len: [80, 300], a: 0.75, dry: 0.34, gap: 20, col: skyCrayon, nb: 1, cj: 6 },
  ], sh('sky'));
  // hills
  paintFamily(x, F.hills, F.hillClip, [
    { scrub: 0.36, n: 70, w: [12, 20], len: [140, 380], a: 0.75, dry: 0.08, gap: 50, pal: HILL_PAL },
    { scrub: 0.24, n: 200, w: [4, 8], len: [90, 260], a: 0.85, dry: 0.16, gap: 36, pal: HILL_PAL, mix: 0.3 },
    { n: 70, w: [1.2, 2.2], len: [60, 200], a: 0.7, dry: 0.3, gap: 22, col: (c, R) => (R(11) < 0.5 ? H_('#5d7a64') : H_('#121a2c')), nb: 1 },
  ], sh('hills'));
  // fjord
  const fjCrayon = (c, R) => (R(11) < 0.55 ? H_('#6c8ab4') : R(11) < 0.8 ? H_('#0f1424') : H_('#8aa0b8'));
  paintFamily(x, F.fjord, F.fjClip, [
    { scrub: 0.38, n: 170, w: [14, 26], len: [160, 520], a: 0.72, dry: 0.08, gap: 56, pal: FJORD_PAL },
    { scrub: 0.25, n: 520, w: [5, 10], len: [110, 380], a: 0.82, dry: 0.16, gap: 42, pal: FJORD_PAL, mix: 0.25 },
    { scrub: 0.2, n: 240, w: [2.2, 4], len: [80, 280], a: 0.8, dry: 0.24, gap: 28, col: (c, R) => (R(12) < 0.4 ? H_('#4a6d9c') : FJORD_PAL(c)), mix: 0.3 },
    { n: 170, w: [1.0, 1.8], len: [60, 260], a: 0.72, dry: 0.32, gap: 20, col: fjCrayon, nb: 1, cj: 8 },
  ], sh('fjord'));
  // land (headland)
  const landCol = (c, R) => (R(12) < 0.12 ? H_('#c49a52') : R(12) < 0.22 ? H_('#3e5272') : LAND_PAL(c));
  paintFamily(x, F.land, F.landClip, [
    { scrub: 0.38, n: 80, w: [14, 24], len: [140, 420], a: 0.72, dry: 0.08, gap: 50, pal: LAND_PAL },
    { scrub: 0.26, n: 300, w: [5, 10], len: [90, 320], a: 0.82, dry: 0.16, gap: 38, col: landCol, mix: 0.3 },
    { n: 110, w: [1.0, 2.0], len: [60, 220], a: 0.75, dry: 0.3, gap: 20, col: (c, R) => (R(11) < 0.5 ? H_('#c9b46a') : H_('#26301f')), nb: 1 },
  ], sh('land'));
  // crayon contours that carry the serpentine shapes
  x.save();
  const contour = (pts, w, col, a, seed, dryv = 0.25) => dryStroke(x, dense(pts, 3), { w, col, a, dry: dryv, gap: 14, seed, nb: w > 2.5 ? 2 : 1, cj: 6 });
  contour(curveX((X) => HZ(X) - 1, -MG, 1000 + MG, 160), 2.4, H_('#1c2638'), 0.7, 901);
  contour(curveX((X) => FS(X), -MG, 1000 + MG, 160), 2.0, H_('#16203a'), 0.75, 902);
  contour(SHORE, 2.6, H_('#26341f'), 0.8, 903);
  contour(SHORE.map((p) => [p[0] + 9, p[1] + 6]), 1.4, H_('#c3a25a'), 0.6, 904, 0.4);
  for (let k = 0; k < 7; k++) {                // swirling water lines that echo the shore
    const c = 0.55 + k * 0.06;
    contour(famLine(F.fjord, c, 0.32 + k * 0.03, 0.98), 1.3, k % 2 ? H_('#7d97bf') : H_('#0f1528'), 0.6, 910 + k, 0.35);
  }
  for (let k = 0; k < 6; k++) {                // a few long sky crayon lines
    const c = 0.15 + k * 0.13;
    contour(famLine(F.sky, c, 0.05 + 0.1 * (k % 3), 0.75 + 0.05 * (k % 2)), 1.4, k % 2 ? H_('#f2d27a') : H_('#8e2a20'), 0.55, 930 + k, 0.45);
  }
  // two small boats in the fjord
  for (const [bx, by, s] of [[388, 506, 1], [455, 528, 0.8]]) {
    x.fillStyle = 'rgba(14,16,26,0.85)';
    pathPoly(x, [[bx - 9 * s, by], [bx + 9 * s, by], [bx + 6 * s, by + 3.5 * s], [bx - 6 * s, by + 3.5 * s]]); x.fill();
    dryStroke(x, [[bx, by], [bx + 0.5, by - 9 * s]], { w: 1.2, col: H_('#0e101a'), a: 0.8, dry: 0, seed: 950 + bx, nb: 1 });
  }
  x.restore();
}

function paintDeck(x) {
  // x: transform maps panel units → px (front layer), origin at (0, FY0)
  const X0 = -24, X1 = 1024;
  const footLine = curveX((X) => footY(X) + 1, X0, X1, 160);
  const fam = makeFamily(footLine, curveX(() => 1016, X0, X1, 160), (c, t, X) => 1.2 * Math.sin(X * 0.02 + c * 13) * Math.sin(Math.PI * c));
  const clip = footLine.concat([[X1, 1016], [X0, 1016]]);
  x.save();
  pathPoly(x, clip); x.clip();
  x.drawImage(board(), -MG, -MG, TW, 1000 + MG);
  x.restore();
  const deckAccent = (c, R) => (R(12) < 0.1 ? H_('#6c7f8c') : R(12) < 0.18 ? H_('#e2aa64') : R(12) < 0.24 ? H_('#4a2c20') : DECK_PAL(c));
  paintFamily(x, fam, clip, [
    { scrub: 0.46, n: 120, w: [16, 28], len: [280, 720], a: 0.55, dry: 0.1, gap: 64, pal: DECK_PAL },
    { scrub: 0.34, n: 360, w: [5, 10], len: [180, 560], a: 0.74, dry: 0.2, gap: 44, col: deckAccent, mix: 0.3 },
    { scrub: 0.24, n: 220, w: [1.2, 3.0], len: [140, 520], a: 0.7, dry: 0.3, gap: 26, col: (c, R) => (R(11) < 0.45 ? H_('#3c2219') : R(11) < 0.75 ? H_('#e0a35e') : H_('#5e6f7e')), nb: 1 },
  ], sh('deck'));
  // plank seams: long ruled lines converging toward the far end of the bridge
  for (let k = 0; k < 16; k++) {
    const c = Math.pow((k + 0.6) / 16, 1.25);
    dryStroke(x, famLine(fam, c, 0, 1, 4), { w: 1.3 + c * 1.2, col: k % 3 ? H_('#4a2a1e') : H_('#5d6e7c'), a: 0.5, dry: 0.3, gap: 46, seed: 2000 + k, nb: 1, taper: 0.01 });
  }
  // the shadow under the railing
  dryStroke(x, dense(curveX((X) => footY(X) + 4, X0, X1, 160), 3), { w: 7, col: H_('#2b1a16'), a: 0.6, dry: 0.15, gap: 20, seed: 970 });
}

function paintRailing(x) {
  const X1 = 1024;
  const wsc = (X) => 0.42 + 0.58 * rsc(X);                         // the far rails stay heavy enough to read
  const xs = [];
  for (let X = -24; X <= X1; X += 4) xs.push(X);
  /** a bar at fraction f of the railing height (0 = top): a crisp ruled band, then dry streaks inside it */
  const bar = (f, w0, col, seed, hi = 0.6) => {
    const mid = (X) => lerp(topY(X), footY(X), f) + (f === 0 ? 0.5 * w0 * wsc(X) : 0);
    const T = xs.map((X) => [X, mid(X) - 0.5 * w0 * wsc(X)]), B = xs.map((X) => [X, mid(X) + 0.5 * w0 * wsc(X)]);
    const poly = T.concat(B.slice().reverse());
    pathPoly(x, poly); x.fillStyle = rgba(col, 0.96); x.fill();
    x.save(); pathPoly(x, poly); x.clip();
    for (let k = 0; k < 4; k++) {
      const q = (k + 0.5) / 4;
      const line = xs.map((X) => [X, mid(X) + (q - 0.5) * w0 * wsc(X)]);
      const c = k % 2 ? mixC(col, [236, 150, 80], 0.45) : mixC(col, [50, 18, 12], 0.4);
      dryStroke(x, line, { w: w0 * 0.42, col: c, a: 0.7, dry: 0.36, gap: 44, seed: seed + k, nb: 2, cj: 14, taper: 0.01 });
    }
    x.restore();
    dryStroke(x, T, { w: 1.6 + 0.8 * hi, col: COL.railHi, a: 0.55 + 0.35 * hi, dry: 0.2, gap: 70, seed: seed + 10, nb: 1, taper: 0.01 });
    dryStroke(x, B, { w: 1.8, col: COL.railDk, a: 0.85, dry: 0.08, gap: 70, seed: seed + 11, nb: 1, taper: 0.01 });
  };
  // posts: evenly spaced along the level part, receding in perspective on the diagonal
  const posts = [];
  for (let X = 990; X > XB + 20; X -= 158) posts.push(X);
  let d = XB - VP[0];
  for (let k = 1; k < 30; k++) { d *= 0.72; const X = VP[0] + d; if (X < -10) break; posts.push(X); }
  posts.forEach((X, k) => {
    const s = wsc(X), y0 = topY(X), y1 = footY(X) + 2;
    const P = [[X - 3.6 * s, y0], [X + 3.6 * s, y0], [X + 3.6 * s, y1], [X - 3.6 * s, y1]];
    pathPoly(x, P); x.fillStyle = rgba(H_('#5e2b1c'), 0.96); x.fill();
    dryStroke(x, [[X - 1 * s, y0], [X - 1 * s, y1]], { w: 2.2 * s, col: H_('#9a4a2a'), a: 0.6, dry: 0.3, gap: 30, seed: 980 + k, nb: 1, taper: 0.01 });
    dryStroke(x, [[X + 3.6 * s, y0], [X + 3.6 * s, y1]], { w: 1.4, col: COL.railDk, a: 0.8, dry: 0.1, gap: 30, seed: 1080 + k, nb: 1, taper: 0.01 });
  });
  bar(0.86, 9, H_('#7a3622'), 1200, 0.2);
  bar(0.66, 10, H_('#82381f'), 1240, 0.3);
  bar(0.45, 10, H_('#8a3c21'), 1280, 0.4);
  bar(0.24, 11, H_('#94411f'), 1320, 0.5);
  bar(0, 22, COL.rail, 1400, 1);
}

function titleLayer(K) {
  const S = 2, W = 340, H = 132;
  return K.layer(`${ID}:title`, W * S, H * S, (x) => {
    const t = mk(W * S, H * S), tx = t.getContext('2d');
    tx.fillStyle = '#000';
    tx.save(); tx.translate(8 * S, 50 * S); tx.rotate(-0.035);
    tx.font = `400 ${37 * S}px "Hannotate SC", "Kaiti SC", serif`;
    tx.fillText('呐喊 · 1893', 0, 0);
    tx.restore();
    tx.save(); tx.translate(18 * S, 100 * S); tx.rotate(-0.025);
    tx.font = `400 ${28 * S}px "Hannotate SC", "Apple Chancery", serif`;
    tx.fillText('The Scream', 0, 0);
    tx.restore();
    // a pencil line, not a font: erode the glyphs to a thin core
    const e = mk(W * S, H * S), ex = e.getContext('2d');
    ex.drawImage(t, 0, 0);
    ex.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) ex.drawImage(t, dx, dy);
    tx.clearRect(0, 0, W * S, H * S);
    tx.drawImage(e, 0, 0);
    // graphite: grainy, broken, retraced twice
    const id = tx.getImageData(0, 0, W * S, H * S);
    for (let j = 0; j < H * S; j++) for (let i = 0; i < W * S; i++) {
      const k = (i + j * W * S) * 4;
      if (!id.data[k + 3]) continue;
      const g = 0.45 + 0.75 * vn2(i / 1.3, j / 2.4, 5) - 0.25 * vn2(i / 9, j / 6, 6);
      id.data[k] = COL.graphite[0]; id.data[k + 1] = COL.graphite[1]; id.data[k + 2] = COL.graphite[2];
      id.data[k + 3] = clamp(id.data[k + 3] * g, 0, 255);
    }
    tx.putImageData(id, 0, 0);
    x.globalAlpha = 0.86; x.drawImage(t, 0, 0);
    x.globalAlpha = 0.4; x.drawImage(t, 1.3, 0.9);
    x.globalAlpha = 1;
  });
}

// ================================================================== the wave field
// u-dependent state for one frame, then D(x, y) = displacement of the painted world at (x, y).
function warpState(u, ctx, opts = {}) {
  const tau = u - clamp(u - 3.5, 0, 0.5);                       // the world stops dead during the silence
  const jag = u >= 1.97 && u < 3.5 ? smoothstep(1.97, 2.04, u) * (u < 3.0 ? 1 - 0.25 * smoothstep(2.5, 2.9, u) : 0.55) : 0;
  const vio = u >= 3.0 && u < 3.5 ? smoothstep(3.0, 3.03, u) : 0;
  const ring = u >= 2.5 && u < 3.5 ? smoothstep(2.5, 2.56, u) : 0;
  let rc = null;
  if (ring > 0 && ctx.rider.visible) { const ub = ctx.rider.placed.bird.upperBill; rc = [ub[3][0] + 6, ub[3][1] + 10]; }
  return { u, tau, jag, vio, ring, rc, jph: Math.floor(u * 10), noRing: !!opts.noRing };
}
function warpAt(W, x, y, out) {
  const t = W.tau;
  const ay = y < 400 ? 9.5 - 3.5 * (y / 400) : y < 470 ? 4.5 : y < 720 ? 6 : 6 - (y - 720) / 30;
  let dy = Math.max(0, ay) * (Math.sin(x * 0.0118 - 1.55 * t + y * 0.0093) + 0.55 * Math.sin(x * 0.0257 + 2.15 * t - y * 0.0171 + 1.7));
  let dx = 2.6 * Math.sin(y * 0.021 + 1.1 * t) + 1.4 * Math.sin(x * 0.009 - 0.8 * t);
  if (W.jag > 0) {
    // jagged spikes: a triangle wave peaking exactly on mesh vertices, re-phased 10× a second
    const f = x / (8 * CELL) + 0.125 * (W.jph % 8) + (y < 470 ? 0 : 0.5);
    const tri = 1 - Math.abs(2 * (f - Math.floor(f)) - 1);
    const env = 0.55 + 0.45 * Math.sin(x * 0.0097 + y * 0.004 + 1.3 * Math.floor(W.jph / 3));
    const A = (y < 420 ? 40 - 16 * (y / 420) : y < 720 ? 9 : 3) * env;
    dy -= W.jag * A * tri * tri * tri;
  }
  if (W.vio > 0) {
    dy += W.vio * (12 * Math.sin(x * 0.083 + 47 * W.u) * Math.cos(y * 0.047 - 29 * W.u) + 7 * Math.sin(x * 0.011 - 23 * W.u + y * 0.01));
    dx += W.vio * 7 * Math.sin(y * 0.061 + 41 * W.u);
  }
  if (W.ring > 0 && W.rc && !W.noRing) {
    const rx = x - W.rc[0], ry = y - W.rc[1], r = Math.hypot(rx, ry);
    if (r > 1 && r < 700) {
      const a = W.ring * 11 * Math.exp(-r / 330) * Math.sin(((r - 190 * (W.u - 2.5)) / 64) * Math.PI * 2) * smoothstep(0, 40, r);
      dx += (a * rx) / r; dy += (a * ry) / r;
    }
  }
  out[0] = dx; out[1] = dy;
  return out;
}

function drawWorld(tex, W, view) {
  const x0 = clamp(Math.floor(view.x0 / CELL) * CELL, 0, 1000), x1 = clamp(Math.ceil(view.x1 / CELL) * CELL, 0, 1000);
  const y1 = Math.min(WY1, Math.ceil(view.y1 / CELL) * CELL), y0 = clamp(Math.floor(view.y0 / CELL) * CELL, 0, WY1);
  if (x1 <= x0 || y1 <= y0) return;
  const nx = Math.round((x1 - x0) / CELL) + 1;
  let prev = new Float32Array(nx * 2), cur = new Float32Array(nx * 2);
  const o = [0, 0];
  for (let i = 0; i < nx; i++) { warpAt(W, x0 + i * CELL, y0, o); prev[i * 2] = o[0]; prev[i * 2 + 1] = o[1]; }
  push();
  noStroke();
  textureMode(NORMAL);
  texture(tex);
  for (let y = y0; y < y1; y += CELL) {
    const yb = y + CELL;
    for (let i = 0; i < nx; i++) { warpAt(W, x0 + i * CELL, yb, o); cur[i * 2] = o[0]; cur[i * 2 + 1] = o[1]; }
    beginShape(TRIANGLE_STRIP);
    for (let i = 0; i < nx; i++) {
      const X = x0 + i * CELL;
      vertex(X, y, (X - prev[i * 2] + MG) / TW, (y - prev[i * 2 + 1] + MG) / TH);
      vertex(X, yb, (X - cur[i * 2] + MG) / TW, (yb - cur[i * 2 + 1] + MG) / TH);
    }
    endShape();
    const tmp = prev; prev = cur; cur = tmp;
  }
  textureMode(IMAGE);
  pop();
}

// ================================================================== the screamer
const SCR = { X: 836, Y: RAIL.foot + 7 };
const HS = 1.25;                     // the screamer's head is oversized, as it should be
const HEAD = [[0, -47], [15, -45], [26, -37], [31, -24], [32, -10], [30, 4], [26, 16], [20, 27], [11, 37], [0, 42],
  [-11, 37], [-20, 27], [-26, 16], [-30, 4], [-32, -10], [-31, -24], [-26, -37], [-15, -45]];

/** pose of the screamer as a function of local time */
function screamerState(u, ctx) {
  const st = { X: SCR.X, Y: SCR.Y, sway: 1, lean: 0, crouch: 0, turn: 0, mouth: 0.8, eyes: 'dark', look: [0, 0], hop: 0, trem: 0 };
  // head turn toward the pelican (1.42 → 1.62), then follows it past (4.3 → 6), then peeks after it
  const hx = ctx.rider.visible ? ctx.rider.placed.bird.head.c[0] : 2000;
  if (u < 1.42) st.turn = 0;
  else if (u < 4.3) st.turn = -easeInOut(clamp((u - 1.42) / 0.2));
  else st.turn = clamp((hx - SCR.X) / 110, -1, 1);
  if (u >= 7) st.turn = 1;
  // mouth
  if (u < 1.42) st.mouth = 0.8 + 0.07 * Math.sin(u * 1.9);
  else if (u < 1.97) st.mouth = lerp(0.8, 0.32, smoothstep(1.42, 1.58, u));
  else if (u < 3.5) st.mouth = lerp(0.32, 1.32, smoothstep(1.97, 2.05, u)) + (u >= 3 ? 0.12 : 0);
  else if (u < 4.05) st.mouth = 0;
  else if (u < 4.9) st.mouth = 0.45;
  else st.mouth = 0.3;
  // eyes
  const toward = [-1, 0.1];
  if (u < 1.42) { st.eyes = 'dark'; st.look = [0, 0]; }
  else if (u < 1.97) { st.eyes = 'dark'; st.look = toward; }
  else if (u < 3.5) { st.eyes = 'wide'; st.look = toward; }
  else if (u < 3.72) { st.eyes = 'dark'; st.look = toward; }
  else if (u < 3.8) { st.eyes = 'shut'; }
  else if (u < 4.0) { st.eyes = 'dark'; st.look = [0.7, -0.7]; }
  else if (u < 6) { st.eyes = 'wide'; st.look = [st.turn, 0.2]; }
  else { st.eyes = 'dark'; st.look = [1, 0.2]; }
  // the leap back against the railing, the slide down, the peek
  const leap = u < 1.97 ? 0 : u < 4.0 ? smoothstep(1.97, 2.1, u) : 1;
  st.lean = leap * (1 - 0.7 * smoothstep(4.0, 4.8, u));
  st.X = SCR.X + 16 * leap;
  st.Y = SCR.Y - 5 * leap;
  if (u >= 1.97 && u < 2.27) st.hop = -30 * Math.sin((Math.PI * (u - 1.97)) / 0.3);
  st.crouch = u < 4.0 ? 0 : easeInOut(clamp((u - 4.0) / 0.85));
  if (u >= 6.2) st.crouch = 1 - 0.1 * smoothstep(6.2, 7.2, u) - 0.03 * Math.sin((u - 6.2) * 1.3);
  // sway (ambient), shivering terror, rigid silence
  if (u < 1.42) st.sway = 1;
  else if (u < 1.97) st.sway = 0.6;
  else if (u < 3.5) { st.sway = 0.2; st.trem = 1; }
  else if (u < 4.0) st.sway = 0;
  else if (u < 6) { st.sway = 0.35; st.trem = 0.35; }
  else { st.sway = 0.55; st.trem = 0.25; }
  return st;
}

function screamerGeom(st, W) {
  const hk = 1 - 0.42 * st.crouch;
  const NB = 206 * hk;
  const spine = (h) => {
    const base = 16 * Math.sin(Math.PI * 1.8 * h - 0.3) * (1 - 0.45 * st.crouch);
    const sw = base + st.sway * (8 * Math.sin(5.2 * h - 1.35 * W.tau) * h + 3.5 * Math.sin(2.3 * h + 0.9 * W.tau + 1) * h);
    const ln = st.lean * 30 * Math.pow(h, 1.6);
    const tr = st.trem * 2.0 * Math.sin(57 * W.u + h * 2.6) * h;
    return [sw + ln + tr, -NB * h];
  };
  const NS = 18, sp = [];
  for (let i = 0; i <= NS; i++) sp.push(spine(i / NS));
  const hwBase = (h) => {
    const k = [[0, 29], [0.1, 31], [0.3, 26], [0.5, 21], [0.72, 21], [0.9, 23], [1, 17]];
    for (let i = 1; i < k.length; i++) if (h <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (h - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
    return 16;
  };
  const hw = (h) => hwBase(h) * (1 + 0.75 * st.crouch * (1 - smoothstep(0, 0.45, h)));
  const coat = ribbonPts(sp, (s) => hw(s));
  // hem: a wavy bottom edge
  const nb = spine(1);
  const neck = ribbonPts([[nb[0], nb[1] + 4], [nb[0] + st.lean * 4, nb[1] - 9], [nb[0] + st.lean * 6 + st.turn * 1.5, nb[1] - 18]], () => 4.2);
  const hc = [nb[0] + st.lean * 9 + st.turn * 3, nb[1] - 72];
  const tq = Math.abs(st.turn);
  const head = HEAD.map(([px, py]) => {
    let X = px * (px * st.turn > 0 ? 1 - 0.1 * tq : 1 + 0.04 * tq);
    X += st.turn * 5 * Math.max(0, py / 42);
    return [hc[0] + X * HS, hc[1] + py * HS];
  });
  const arms = [-1, 1].map((s) => {
    const sh0 = [nb[0] + s * 19, nb[1] + 8];
    const el = [nb[0] + s * (54 + 6 * st.crouch) + st.lean * 2, nb[1] + 36 - 10 * st.crouch];
    const wr = [hc[0] + (s * 27 + st.turn * 4) * HS, hc[1] + 26 * HS];
    const m1 = [lerp(sh0[0], el[0], 0.5) - s * 2, lerp(sh0[1], el[1], 0.5) + 5];
    const m2 = [lerp(el[0], wr[0], 0.5) + s * 5, lerp(el[1], wr[1], 0.5)];
    return { s, sh: sh0, el, wr, sleeve: ribbonPts(smoothPath([sh0, m1, el, m2, wr], 5), (q) => lerp(11.5, 8, q) * (1 + 0.12 * Math.sin(q * 9))) };
  });
  const hands = [-1, 1].map((s) => {
    const pc = [hc[0] + (s * 29 + st.turn * 4) * HS, hc[1] + 3 * HS];
    const ang = -Math.PI / 2 + s * 0.12;
    const palm = ellipse(pc[0], pc[1], 15 * HS, 7.4 * HS, 16, ang);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const bx = pc[0] + s * (f - 1.5) * 2.4 * HS, by = pc[1] - 11 * HS;
      fingers.push([[bx, by], [bx + s * (0.5 + f * 0.6) * HS, by - (14 - Math.abs(f - 1.5) * 2.5) * HS]]);
    }
    return { s, pc, palm, fingers };
  });
  return { sp, coat, neck, hc, head, arms, hands, nb };
}

function paintScreamer(x, st, W) {
  const G = screamerGeom(st, W);
  const off = [st.X, st.Y + st.hop];
  const o = [0, 0];
  const T = (p) => { const X = off[0] + p[0], Y = off[1] + p[1]; warpAt(W, X, Y, o); return [X + 0.45 * o[0], Y + 0.45 * o[1]]; };
  const M = (P) => P.map(T);
  const seed = 5000;
  // coat: dark fill, long streaks that follow the spine, a sinuous outline
  const coat = M(G.coat);
  pathPoly(x, coat); x.fillStyle = rgba(COL.coat, 0.97); x.fill();
  x.save(); pathPoly(x, coat); x.clip();
  const sp = M(G.sp);
  const streak = ['#26355c', '#3b2a24', '#2e3f66', '#121624', '#3b2a24'];
  for (let k = 0; k < 5; k++) {
    const d = (k - 2) * 10 + (k % 2 ? 2 : -2);
    const line = sp.map((p, i) => [p[0] + d * (1 + st.crouch * 0.6 * (1 - i / sp.length)) * (0.75 + 0.25 * Math.sin(i * 0.4 + k)), p[1]]);
    dryStroke(x, dense(line, 3), { w: 8, col: H_(streak[k]), a: 0.55, dry: 0.2, gap: 40, seed: seed + k, nb: 3 });
  }
  x.restore();
  dryStroke(x, dense(coat, 3, true), { w: 2.6, col: COL.ink, a: 0.9, dry: 0.12, gap: 18, seed: seed + 20, nb: 2, wav: 0.7, wl: 34 });
  // feet
  if (st.crouch < 0.5) for (const s of [-1, 1]) { const f = M(ellipse(s * 9, -2, 9, 3.6, 10)); pathPoly(x, f); x.fillStyle = rgba(COL.ink, 0.9); x.fill(); }
  // neck
  const neck = M(G.neck);
  pathPoly(x, neck); x.fillStyle = rgba(COL.shade2, 0.95); x.fill();
  dryStroke(x, dense(neck, 2.5, true), { w: 1.4, col: COL.ink, a: 0.8, dry: 0.1, seed: seed + 21, nb: 1 });
  // sleeves
  for (const a of G.arms) {
    const sl = M(a.sleeve);
    pathPoly(x, sl); x.fillStyle = rgba(COL.coat, 0.97); x.fill();
    dryStroke(x, dense(M(smoothPath([a.sh, a.el, a.wr], 6)), 3), { w: 4, col: H_('#2a3b66'), a: 0.6, dry: 0.3, seed: seed + 30 + a.s, nb: 2 });
    dryStroke(x, dense(sl, 3, true), { w: 2.0, col: COL.ink, a: 0.9, dry: 0.12, seed: seed + 32 + a.s, nb: 1, wav: 0.5, wl: 28 });
  }
  // the head: pale skull with greenish hollows
  const head = M(G.head);
  const hc = T(G.hc);
  pathPoly(x, head); x.fillStyle = rgba(COL.face, 0.98); x.fill();
  x.save(); pathPoly(x, head); x.clip();
  const ring = (f) => dense(shrink(head, hc, f), 3, true);
  dryStroke(x, ring(0.62), { w: 7, col: COL.pale, a: 0.5, dry: 0.3, gap: 12, seed: seed + 40, nb: 3 });
  // hollow cheeks and temples (both sides, below the eyes) and the top of the skull
  for (const s of [-1, 1]) {
    const side = [];
    for (let k = 0; k <= 8; k++) {
      const q = k / 8, py = lerp(-16, 34, q);
      side.push(T([G.hc[0] + (s * (27 - 12 * q) + st.turn * 4 * q) * HS, G.hc[1] + py * HS]));
    }
    dryStroke(x, side, { w: 11, col: s * st.turn > 0 ? COL.shade2 : COL.shade, a: 0.62, dry: 0.25, gap: 10, seed: seed + 42 + s, nb: 3 });
  }
  dryStroke(x, ring(0.9).slice(0, 18), { w: 5, col: COL.shade, a: 0.4, dry: 0.3, seed: seed + 45, nb: 2 });
  x.restore();
  dryStroke(x, dense(head, 2.5, true), { w: 2.0, col: H_('#2a2a30'), a: 0.9, dry: 0.08, gap: 20, seed: seed + 46, nb: 1, wav: 0.4, wl: 22 });
  // face: eyes, nostrils, mouth (features slide with the head turn)
  const ft = st.turn * 9;
  const F = (px, py) => T([G.hc[0] + (px + ft) * HS, G.hc[1] + py * HS]);
  for (const s of [-1, 1]) {
    const far = s * st.turn > 0 ? 1 - 0.32 * Math.abs(st.turn) : 1;
    const ec = [s * 12.5 * (s * st.turn > 0 ? 0.85 : 1), -9];
    const E = ellipse(ec[0], ec[1], 6.4 * far, 8.4, 14).map(([a, b]) => F(a, b));
    if (st.eyes === 'shut') {
      dryStroke(x, [F(ec[0] - 6 * far, ec[1] + 1), F(ec[0], ec[1] + 3), F(ec[0] + 6 * far, ec[1] + 1)], { w: 2, col: COL.ink, a: 0.9, dry: 0, seed: seed + 50 + s, nb: 1 });
      continue;
    }
    pathPoly(x, E);
    if (st.eyes === 'wide') {
      x.fillStyle = rgba(H_('#f4ecd0'), 0.98); x.fill();
      dryStroke(x, dense(E, 2, true), { w: 2.2, col: COL.ink, a: 0.95, dry: 0, seed: seed + 52 + s, nb: 1 });
      const pp = F(ec[0] + st.look[0] * 3.5 * far, ec[1] + st.look[1] * 3.5);
      pathPoly(x, ellipse(pp[0], pp[1], 1.9, 1.9, 8)); x.fillStyle = rgba(COL.ink, 1); x.fill();
    } else {
      x.fillStyle = rgba(H_('#22232e'), 0.95); x.fill();
      const pp = F(ec[0] + st.look[0] * 3 * far, ec[1] + st.look[1] * 3);
      pathPoly(x, ellipse(pp[0], pp[1], 1.6, 1.6, 8)); x.fillStyle = rgba(H_('#cfc59c'), 0.9); x.fill();
    }
  }
  for (const s of [-1, 1]) { const n = F(s * 3 + st.turn * 2, 9); pathPoly(x, ellipse(n[0], n[1], 1.5, 2, 8)); x.fillStyle = rgba(COL.ink, 0.85); x.fill(); }
  const mouthAt = F(st.turn * 2, 26);
  if (st.mouth < 0.08) {
    dryStroke(x, [F(-7, 25), F(-2, 24.4), F(3, 25.4), F(7, 24.6)], { w: 2.2, col: COL.ink, a: 0.95, dry: 0, seed: seed + 60, nb: 1 });
  } else {
    const m = st.mouth;
    const mc = [st.turn * 2, 23 + 2.5 * m];
    const MO = ellipse(mc[0], mc[1], 3.8 + 2.8 * m, 2 + 10.5 * m, 16).map(([a, b]) => F(a, b));
    pathPoly(x, MO); x.fillStyle = rgba(H_('#2a1719'), 0.97); x.fill();
    dryStroke(x, dense(MO, 2, true), { w: 1.6, col: COL.shade2, a: 0.7, dry: 0.1, seed: seed + 61, nb: 1 });
  }
  // hands pressed to the face
  for (const h of G.hands) {
    const palm = M(h.palm);
    for (const f of h.fingers) {
      const fp = M(f);
      dryStroke(x, dense(fp, 1.5), { w: 4.2, col: H_('#d8cb96'), a: 0.98, dry: 0, seed: seed + 70, nb: 1 });
    }
    pathPoly(x, palm); x.fillStyle = rgba(H_('#dccf9a'), 0.98); x.fill();
    dryStroke(x, dense(shrink(palm, T(h.pc), 0.55), 2, true), { w: 4, col: COL.shade, a: 0.45, dry: 0.3, seed: seed + 72 + h.s, nb: 2 });
    dryStroke(x, dense(palm, 2, true), { w: 1.5, col: COL.ink, a: 0.85, dry: 0.08, seed: seed + 74 + h.s, nb: 1 });
    for (const f of h.fingers) {
      const fp = M(f);
      dryStroke(x, [fp[0], fp[1]], { w: 0.9, col: COL.ink, a: 0.6, dry: 0, seed: seed + 76, nb: 1 });
    }
  }
  return mouthAt;
}

// ================================================================== the two strollers far along the bridge
const STROLL = [{ x: 62, k: 0, hat: 'top' }, { x: 104, k: 1, hat: 'bowler' }];
function strollerState(u, k) {
  const lag = k * 0.04;
  if (u < 2.95 + lag) return { face: false, arms: 0, mouth: 0, bob: Math.sin((u + k * 0.37) * Math.PI * 2) };
  if (u < 3.5) return { face: true, arms: smoothstep(2.97 + lag, 3.06 + lag, u), mouth: 1, bob: 0 };
  if (u < 4.0) return { face: true, arms: 1, mouth: 0, bob: 0 };
  if (u < 4.4 + lag) return { face: true, arms: 1 - smoothstep(4.0, 4.3, u), mouth: 0, bob: 0 };
  return { face: false, arms: 0, mouth: 0, bob: Math.sin((u + k * 0.37) * Math.PI * 2) };
}
function paintStroller(x, S, st, W) {
  const s = rsc(S.x) * 1.8;
  const fx = S.x, fy = footY(S.x) + 5 * s;
  const o = [0, 0];
  const T = (p) => { const X = fx + p[0] * s, Y = fy + p[1] * s; warpAt(W, X, Y, o); return [X + 0.3 * o[0], Y + 0.3 * o[1]]; };
  const M = (P) => P.map(T);
  const b = st.bob * 1.2;
  const seed = 6000 + S.k * 100;
  const dark = COL.coat;
  // legs
  for (const side of [-1, 1]) dryStroke(x, M([[side * 5, -50 + b], [side * 6 + (st.face ? 0 : side * b * 1.5), 0]]), { w: 7 * s, col: dark, a: 0.95, dry: 0.05, seed: seed + side, nb: 1 });
  // coat
  const coat = M(smoothPath([[-5, -158 + b], [5, -158 + b], [16, -150 + b], [20, -128 + b], [18, -100 + b], [22, -70 + b], [26, -42 + b], [8, -38 + b],
    [-8, -40 + b], [-25, -43 + b], [-20, -74 + b], [-17, -102 + b], [-20, -130 + b], [-16, -150 + b], [-5, -158 + b]], 3));
  pathPoly(x, coat); x.fillStyle = rgba(dark, 0.97); x.fill();
  dryStroke(x, dense(M([[-6, -146 + b], [-8, -48 + b]]), 2), { w: 6 * s, col: H_('#2a3b66'), a: 0.6, dry: 0.3, seed: seed + 3, nb: 1 });
  dryStroke(x, dense(coat, 2, true), { w: 1.6 * s, col: COL.ink, a: 0.9, dry: 0.1, seed: seed + 4, nb: 1 });
  // arms (raised to the face when they scream)
  for (const side of [-1, 1]) {
    const a = st.arms;
    const pts = [[side * 13, -142 + b], [side * lerp(17, 30, a), lerp(-104, -150, a) + b], [side * lerp(15, 15, a), lerp(-74, -176, a) + b]];
    dryStroke(x, dense(M(pts), 2), { w: 8 * s, col: dark, a: 0.95, dry: 0.05, seed: seed + 10 + side, nb: 1 });
    if (st.face && a > 0.4) { const h = T(pts[2]); pathPoly(x, ellipse(h[0], h[1], 4.5 * s, 6 * s, 10)); x.fillStyle = rgba(H_('#d8cb96'), 0.98); x.fill(); }
  }
  // head
  const hcl = [0, -172 + b];
  const hp = M(ellipse(hcl[0], hcl[1], 13, 17, 16));
  pathPoly(x, hp); x.fillStyle = rgba(st.face ? COL.face : H_('#3a2a24'), 0.97); x.fill();
  dryStroke(x, dense(hp, 2, true), { w: 1.4 * s, col: COL.ink, a: 0.85, dry: 0.1, seed: seed + 20, nb: 1 });
  if (st.face) {
    for (const side of [-1, 1]) { const e = T([side * 5, -176 + b]); pathPoly(x, ellipse(e[0], e[1], 2.2 * s, 2.8 * s, 8)); x.fillStyle = rgba(COL.ink, 0.95); x.fill(); }
    const m = T([0, -162 + b]);
    if (st.mouth > 0.5) { pathPoly(x, ellipse(m[0], m[1], 3.2 * s, 6 * s, 10)); x.fillStyle = rgba(H_('#2a1719'), 0.97); x.fill(); }
    else dryStroke(x, [T([-4, -163 + b]), T([4, -163 + b])], { w: 1.6 * s, col: COL.ink, a: 0.9, dry: 0, seed: seed + 22, nb: 1 });
  }
  // hat
  const hat = S.hat === 'top'
    ? M([[-11, -186 + b], [11, -186 + b], [10, -214 + b], [-10, -214 + b]])
    : M(ellipse(0, -190 + b, 12, 7, 12).filter((p, i) => i >= 6).concat([[12, -188 + b], [-12, -188 + b]]));
  pathPoly(x, hat); x.fillStyle = rgba(H_('#10131f'), 0.98); x.fill();
  dryStroke(x, M([[-17, -186 + b], [17, -186 + b]]), { w: 3.2 * s, col: H_('#10131f'), a: 0.98, dry: 0, seed: seed + 30, nb: 1 });
}

// ================================================================== the pelican, Munch's way
const PEL = {
  legFar: { fill: '#a8673a', ow: 1.6, inner: 0 }, footFar: { fill: '#a8673a', ow: 1.3, inner: 0 }, crankFar: { lw: 3.4, c: '#2a2a38' },
  tire: { ring: 6.2, c: '#191a26' }, rim: { ring: 1.6, c: '#3b3a4c' }, spoke: { lw: 1.0, c: '#2e2c3c', a: 0.6 }, hub: { dot: '#1b1c28' },
  chain: { lw: 1.2, c: '#3a3446', a: 0.75 }, frame: { lw: 4.8, c: '#1a2238' }, fork: { lw: 4.4, c: '#1a2238' }, stem: { lw: 3.8, c: '#1a2238' },
  bars: { lw: 3.8, c: '#1a2238' }, seatpost: { lw: 3.6, c: '#1a2238' }, saddle: { lw: 5.6, c: '#2a1d1a' }, ring: { ring: 1.8, c: '#2a2a38' },
  tail: { fill: '#e3d8a6', shade: COL.shade, ow: 2.8, inner: 1, oc: '#1c2a52' }, body: { fill: '#e3d8a6', shade: COL.shade, ow: 4, inner: 5, oc: '#1c2a52' },
  wing: { fill: '#d6ca94', shade: COL.shade2, ow: 2.6, inner: 3, oc: '#1c2a52' }, secondaries: { lw: 5.6, c: '#18203a' }, primary: { lw: 4.6, c: '#18203a' },
  neck: { fill: '#e3d8a6', shade: COL.shade, ow: 3, inner: 2, oc: '#1c2a52' }, head: { fill: '#e9dfb0', shade: COL.shade, ow: 2.6, inner: 1, oc: '#1c2a52' },
  crest: { lw: 1.7, c: '#18203a' }, pouch: { fill: '#d4602e', shade: '#a8321f', ow: 1.8, inner: 2 },
  bill: { fill: '#e6b54a', shade: '#c98a3a', ow: 1.6, inner: 1 }, nail: { fill: '#b33a28', ow: 0 }, face: { fill: '#e8c48e', ow: 0 },
  eye: { eye: true }, pupil: { pupil: true }, eyeShut: { lw: 1.8, c: '#18203a' },
  leg: { fill: '#d0843f', shade: '#9a5a30', ow: 1.8, inner: 1 }, foot: { fill: '#d0843f', ow: 1.5, inner: 0 },
  crank: { lw: 4.2, c: '#1a2238' }, pedal: { lw: 5.2, c: '#1b1c28' },
};
for (const k of Object.keys(PEL)) for (const f of ['fill', 'shade', 'hi', 'c', 'dot', 'oc']) if (typeof PEL[k][f] === 'string') PEL[k][f] = H_(PEL[k][f]);

function circlePts(c, r, n = 32, a0 = 0) { const o = []; for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2; o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; }

function paintPelican(K, x, P, scared, detail) {
  const s = P.place.scale ?? 1;
  const parts = K.rig.parts(P);
  const seedOf = (name) => sh('pel' + name);
  for (const part of parts) {
    const st = PEL[part.role];
    if (!st) continue;
    const seed = seedOf(part.name);
    if (part.kind === 'circle') {
      if (st.ring) {
        const pts = circlePts(part.c, part.r, Math.max(16, Math.round(part.r * 0.9)), ih(seed, 1) * 6);
        dryStroke(x, pts.concat([pts[0], pts[1]]), { w: st.ring * s, col: st.c, a: 0.92, dry: part.role === 'tire' ? 0.08 : 0.15, gap: 20, seed, nb: st.ring > 3 ? 2 : 1, wav: 0.7, wl: 40, cj: 8 });
      } else if (st.dot) {
        pathPoly(x, circlePts(part.c, part.r * 0.9, 10)); x.fillStyle = rgba(st.dot, 0.95); x.fill();
      } else if (st.eye) {
        const wide = P.bird.eye.mode === 'wide' || scared > 0.5;
        pathPoly(x, circlePts(part.c, part.r * (wide ? 1.25 : 1), 14)); x.fillStyle = rgba(wide ? H_('#f6efd6') : H_('#2a2420'), 1); x.fill();
        dryStroke(x, circlePts(part.c, part.r * (wide ? 1.25 : 1), 16).concat([]), { w: 1.4 * s, col: COL.ink, a: 0.95, dry: 0, seed, nb: 1 });
      } else if (st.pupil) {
        const wide = P.bird.eye.mode === 'wide' || scared > 0.5;
        pathPoly(x, circlePts(part.c, wide ? 1.6 * s : part.r * 0.9, 10)); x.fillStyle = rgba(wide ? COL.ink : H_('#e9dfb0'), 1); x.fill();
      } else if (st.fill) {
        const pts = circlePts(part.c, part.r, 22);
        paintFilled(x, pts, st, seed, s, detail);
      }
      continue;
    }
    if (part.kind === 'poly') {
      if (st.fill) paintFilled(x, part.pts, st, seed, s, detail);
      continue;
    }
    // lines
    if (st.lw) {
      if (part.role === 'spoke' && detail < 0.45) continue;
      const pts = part.pts.length === 2 ? dense(part.pts, 3) : dense(part.pts, 2.5);
      dryStroke(x, pts, { w: st.lw * s, col: st.c, a: st.a ?? 0.92, dry: part.role === 'spoke' ? 0.15 : 0.1, gap: 18, seed, nb: st.lw > 3.2 ? 2 : 1, wav: part.layer === 'bike' && st.lw > 2 ? 0.5 : 0, wl: 36, cj: 8, taper: 0.12 });
    }
  }
  // feathers on end (fright): short dark spikes along the back of the neck and the top of the body
  if (scared > 0.3) {
    const B = P.bird, k = (scared - 0.3) / 0.7;
    const spikes = [];
    const bd = B.body, nb = bd.length;
    for (let i = Math.floor(nb * 0.55); i < nb; i += 2) spikes.push([bd[i], B.bodyC]);
    const sp = B.neckSpine;
    for (let i = 2; i < sp.length - 3; i += 3) {
      const hw = lerp(15, 9.5, i / (sp.length - 1)) * s;
      const e = [sp[i][0] - hw, sp[i][1] - 1.5 * s];
      spikes.push([e, [e[0] + 30, e[1] + 6]]);
    }
    spikes.forEach(([p, c], i) => {
      const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
      const L = (7 + 5 * ih(i, 3)) * k * s;
      const p0 = [p[0] - (dx / l) * 3 * s, p[1] - (dy / l) * 3 * s];
      const q = [p[0] + (dx / l) * L - 2 * s, p[1] + (dy / l) * L - 2 * s];
      const m = [lerp(p0[0], q[0], 0.5) + (i % 2 ? 1 : -1) * s, lerp(p0[1], q[1], 0.5)];
      dryStroke(x, [p0, m, q], { w: 3.4 * s, col: COL.pale, a: 0.95, dry: 0, seed: 7000 + i, nb: 1, taper: 0.5 });
      dryStroke(x, [p, m, q], { w: 1.1 * s, col: COL.ink, a: 0.8, dry: 0, seed: 7100 + i, nb: 1, taper: 0.5 });
    });
  }
}
/** split a closed outline at the two extremes of its long axis into two chains running the same way */
function splitChains(pts) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const horiz = x1 - x0 >= y1 - y0;
  let i0 = 0, i1 = 0;
  pts.forEach((p, i) => {
    const v = horiz ? p[0] : p[1];
    if (v < (horiz ? pts[i0][0] : pts[i0][1])) i0 = i;
    if (v > (horiz ? pts[i1][0] : pts[i1][1])) i1 = i;
  });
  const n = pts.length, A = [], B = [];
  for (let i = i0; ; i = (i + 1) % n) { A.push(pts[i]); if (i === i1) break; }
  for (let i = i0; ; i = (i - 1 + n) % n) { B.push(pts[i]); if (i === i1) break; }
  if (A.length < 2 || B.length < 2) return null;
  const M = 28;
  const Ar = resampleN(A, M), Br = resampleN(B, M);
  const ma = Ar.reduce((t, p) => t + p[1], 0), mb = Br.reduce((t, p) => t + p[1], 0);
  return { top: ma <= mb ? Ar : Br, bot: ma <= mb ? Br : Ar, thick: horiz ? y1 - y0 : x1 - x0 };
}
function paintFilled(x, pts, st, seed, s, detail) {
  pathPoly(x, pts); x.fillStyle = rgba(st.fill, 0.96); x.fill();
  if (detail > 0.45 && st.inner) {
    // long form strokes that follow the body from end to end (Munch's sinuous modelling)
    const ch = splitChains(pts);
    if (ch) {
      x.save(); pathPoly(x, pts); x.clip();
      const n = st.inner + 2;
      for (let k = 0; k < n; k++) {
        const c = (k + 0.5) / n;
        const line = [];
        for (let i = 2; i < ch.top.length - 2; i++) line.push([lerp(ch.top[i][0], ch.bot[i][0], c), lerp(ch.top[i][1], ch.bot[i][1], c)]);
        const col = c < 0.3 ? mixC(st.fill, [255, 252, 232], 0.55) : c > 0.62 && st.shade ? mixC(st.fill, st.shade, 0.35 + 0.6 * (c - 0.62) / 0.38) : mixC(st.fill, [205, 200, 150], 0.18);
        dryStroke(x, dense(line, 3), { w: Math.max(2.2, (ch.thick / n) * 1.6), col, a: 0.8, dry: 0.1, gap: 50, seed: seed + k * 3 + 1, nb: 3, wav: 0.8, wl: 30, wph: k });
      }
      x.restore();
    }
  }
  if (st.ow) dryStroke(x, dense(pts, 2.5, true), { w: st.ow * s, col: st.oc || COL.ink, a: 0.92, dry: 0.06, gap: 40, seed: seed + 13, nb: st.ow > 2.3 ? 2 : 1, wav: 0.7, wl: 34, cj: 6, taper: 0.06 });
}

/** displace every point of a placed pose (the silhouette rides the picture's waves) */
function mapPose(P, f) {
  const isPt = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
  const walk = (v) => {
    if (isPt(v)) return f(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = k === 'place' || k === 'mods' ? v[k] : walk(v[k]); return o; }
    return v;
  };
  return walk(P);
}

// ================================================================== the screams themselves
/** expanding wavy arcs from a mouth toward a target (Munch's lines of sound), u0 = onset */
function screamArcs(x, c, target, u, u0, u1, col, edge, seed, spread = 0.78) {
  if (u < u0 || u >= u1) return;
  const th = Math.atan2(target[1] - c[1], target[0] - c[0]);
  const D = Math.max(60, 0.82 * Math.hypot(target[0] - c[0], target[1] - c[1]));
  const t = u - u0;
  for (let k = 0; k < 3; k++) {
    const r = ((t * 260 + (k * D) / 3) % D) + 14;
    const fade = Math.min(1, t / 0.06) * (1 - smoothstep(0.55 * D, D, r)) * smoothstep(14, 30, r);
    if (fade <= 0.02) continue;
    const pts = [];
    const sp = spread * (0.6 + 0.4 * Math.min(1, r / 90));
    for (let i = 0; i <= 22; i++) {
      const a = th - sp + (2 * sp * i) / 22;
      const rr = r + 0.07 * r * Math.sin((i / 22) * 6.283 + k * 1.7 + t * 9);
      pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
    dryStroke(x, pts, { w: 6.4, col: edge, a: 0.6 * fade, dry: 0.06, gap: 60, seed: seed + k, nb: 2, taper: 0.4 });
    dryStroke(x, pts, { w: 3.4, col, a: 0.97 * fade, dry: 0.08, gap: 60, seed: seed + 10 + k, nb: 2, taper: 0.4 });
  }
}

// ================================================================== live canvas
let LIVE = null;
function liveCanvas() {
  if (LIVE) return LIVE;
  const img = createImage(1000, 1000);
  LIVE = { img, x: img.drawingContext };
  return LIVE;
}

// ================================================================== scene
export default {
  ride: RIDE,
  freezeU: 2.8,
  cues: [
    { u: 1.5, name: 'headTurn' }, { u: 2.0, name: 'screamerFright' }, { u: 2.5, name: 'pelicanScreams' },
    { u: 3.0, name: 'everybodyScreams' }, { u: 3.5, name: 'silence' },
  ],

  async init(K) {
    const B = board();
    this.world = K.layer(`${ID}:world`, Math.round(TW * WPX), Math.round(TH * WPX), (x) => {
      x.drawImage(B, 0, 0, B.width, Math.round(TH * WPX), 0, 0, B.width, Math.round(TH * WPX));
      x.setTransform(WPX, 0, 0, WPX, MG * WPX, MG * WPX);
      paintWorld(x);
    });
    this.front = K.layer(`${ID}:front`, Math.round(1000 * FPX), Math.round((1000 - FY0) * FPX), (x) => {
      x.setTransform(FPX, 0, 0, FPX, 0, -FY0 * FPX);
      paintDeck(x);
      paintRailing(x);
    });
    this.title = titleLayer(K);
    BOARD = null;                       // the cardboard raster lives on inside the two layers
    this.stats = { bakeMB: ((TW * WPX * TH * WPX) + (1000 * FPX * (1000 - FY0) * FPX) + 680 * 264 + 1e6) * 4 / 1048576 };
  },

  mods(u) {
    if (u <= 1 || u >= 5) return {};
    const m = {};
    if (u > 2.3 && u < 3.9) {
      m.eye = u < 3.52 ? 'wide' : 'normal';
      m.scared = u < 2.5 ? 0.55 * smoothstep(2.3, 2.4, u) : u < 3.5 ? 0.55 + 0.45 * smoothstep(2.5, 2.58, u) : 0.7 * (1 - smoothstep(3.5, 3.88, u));
      const open = smoothstep(2.46, 2.56, u) * (1 - smoothstep(3.5, 3.55, u));
      if (open > 1e-3) m.billOpen = open;
    }
    return m;
  },

  render(K, u, ctx) {
    const W = warpState(u, ctx);
    drawWorld(this.world, W, ctx.view);
    image(this.title, 30, 34, 340, 132);
    image(this.front, 0, FY0, 1000, 1000 - FY0);

    const L = liveCanvas(), x = L.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, 1000, 1000);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const v = ctx.view;
    if (v.x0 < 140) for (const S of STROLL) paintStroller(x, S, strollerState(u, S.k), W);
    this.mouth = null;
    if (v.x1 > 700) this.mouth = paintScreamer(x, screamerState(u, ctx), W);
    if (ctx.rider.visible) {
      let P = ctx.rider.placed;
      const wob = smoothstep(1.15, 1.5, u) * (1 - smoothstep(4.5, 4.85, u));
      if (wob > 0) {
        const Wp = { ...W, noRing: true };
        const o = [0, 0];
        P = mapPose(P, (p) => { warpAt(Wp, p[0], p[1], o); return [p[0] + 0.35 * wob * o[0], p[1] + 0.35 * wob * o[1]]; });
      }
      const sc = u > 1 && u < 5 ? (ctx.rider.mods?.scared ?? 0) : 0;
      paintPelican(K, x, P, sc, (P.place.scale ?? 1) * ctx.pxu);
      // the screams: his at the pelican (2.0 →), the pelican's back at him (2.5 →); both cut dead at 3.5
      if (u >= 1.98 && u < 3.5) {
        const S = this.mouth;
        const bill = P.bird.upperBill, pouch = P.bird.pouch;
        const bm = [lerp(bill[3][0], pouch[Math.floor(pouch.length * 0.45)][0], 0.5) + 4, lerp(bill[3][1], pouch[Math.floor(pouch.length * 0.45)][1], 0.5)];
        if (S) screamArcs(x, [S[0] - 14, S[1]], bm, u, 1.98, 2.62, H_('#f2d27a'), COL.ink, 8000);
        if (S) screamArcs(x, [bm[0] + 6, bm[1]], [S[0], S[1]], u, 2.5, 3.5, H_('#e8742f'), H_('#3a120c'), 8100);
      }
    }
    L.img.setModified(true);
    image(L.img, 0, 0, 1000, 1000);
  },
};
