// 04 · 唐代白描 · c. 750 —「吴带当风」(an original composition in the manner of the
// Wu Daozi school of Tang baimiao line drawing, as known from later copies).
// A procession of celestials walks right on scroll clouds: a guardian with a bannered
// halberd, a Daoist immortal with a feather fan, a heavenly lady with a tray of peonies
// and an attendant child. The pelican, drawn in the same pure ink line, overtakes them.
// On the u = 2 downbeat a great gust from ahead whips every sash, sleeve, beard and banner
// back; the lady's long scarf is torn from her shoulders and lassoes the pelican's neck,
// streaming behind it in great loops; on u = 4 the gust drops and the scarf floats back
// to her. The child points at the pelican the whole time — and after it.
import { rng, hash, lerp, clamp, smoothstep, smootherstep, smoothPath, fbm } from '../kit/math.js';

const ID = 'tang';
const PAPER = '#ece3cf';
const FILL = '#ebe2cd';             // paper knock-out (a line drawing hides what is behind it)
const BIRD_WHITE = '#f3ecdb';       // the white bird: a touch lighter than the silk
const INKC = '#1a1612';
const SEAL_RED = '#b4291f';
const RIDE = { hold: [2.3, 3.8], speed: 0.45, ramp: 0.35 };
const BP = 2;                       // bake resolution (px per panel unit)
const ROAD = 800;

// ------------------------------------------------------------------ ink tone
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const PA = hex(PAPER), IA = hex(INKC);
const toneCache = new Map();
/** ink colour for tone t (0 = paper … 1 = jet) */
function tone(t) {
  const k = Math.round(clamp(t) * 100);
  let c = toneCache.get(k);
  if (c) return c;
  const e = Math.pow(k / 100, 0.8);
  c = '#' + [0, 1, 2].map((i) => Math.round(lerp(PA[i], IA[i], e)).toString(16).padStart(2, '0')).join('');
  toneCache.set(k, c);
  return c;
}

// ------------------------------------------------------------------ time
/** the rig's wind (spec): 0 → 1 over (1.8, 2.1), back to 0 over (3.9, 4.6) */
const windU = (u) => smoothstep(1.8, 2.1, u) * (1 - smoothstep(3.9, 4.6, u));
/** the gust as the figures feel it: hits on the downbeat with a whip-crack overshoot */
const gustF = (u) => smoothstep(1.9, 2.06, u) * (1 - smoothstep(3.95, 4.7, u)) * (1 + 0.3 * Math.exp(-(((u - 2.16) / 0.14) ** 2)));
const GI = (() => {
  const a = new Float64Array(2201);
  let s = 0;
  for (let k = 1; k <= 2200; k++) { const u = -8 + k * 0.01; s += 0.005 * (gustF(u - 0.01) + gustF(u)); a[k] = s; }
  return a;
})();
/** ∫ gust du — flutter phase and cloud drift (frequency rises in the gust without phase jumps) */
function gustInt(u) {
  const f = clamp((u + 8) / 0.01, 0, 2199.999);
  const k = Math.floor(f), w = f - k;
  return GI[k] * (1 - w) + GI[k + 1] * w;
}
const flutPh = (u) => 2.1 * u + 8.5 * gustInt(u);

// ------------------------------------------------------------------ strokes
// Brushes: crisp round tips with a flat profile; the press-and-lift of every stroke comes
// from per-point pressure (the envelopes below), so each line swells and tapers like a
// loaded brush: 莼菜条 / 蘭葉描 for drapery, 铁线 for objects, 游丝 for hair.
let brushesReady = false;
function initBrushes(K) {
  if (brushesReady) return;
  brushesReady = true;
  const mk = (spacing, opacity) => ({
    type: 'default', weight: 1, scatter: 0.03, sharpness: 0.95, grain: 8, opacity, spacing,
    pressure: { type: 'custom', curve: () => 1, min_max: [0, 1], variation: { offset: 0.04, scale: 0.03, warp: 0.03, tilt: 0.05 } },
    rotate: 'natural', noise: 0.08,
  });
  K.brush.add('tang.hair', mk(0.07, 222));
  K.brush.add('tang.line', mk(0.12, 232));
  K.brush.add('tang.bold', mk(0.2, 236));
}

const ENV = {
  lan: { st: 0.3, hd: 0.07, kn: 0.2, pk: 0.32, sw: 0.26, tl: 0.6, en: 0.1, tp: 1.5 },     // water-shield drapery line
  iron: { st: 0.6, hd: 0.05, kn: 0.1, pk: 0.5, sw: 0.08, tl: 0.86, en: 0.45, tp: 1.2 },   // iron-wire: even
  hair: { st: 0.45, hd: 0.1, kn: 0, pk: 0.4, sw: 0.18, tl: 0.5, en: 0.12, tp: 1.3 },     // gossamer
  flick: { st: 0.6, hd: 0.05, kn: 0.15, pk: 0.15, sw: 0.25, tl: 0.25, en: 0.06, tp: 1.1 }, // short pressed flick
  even: { st: 0.8, hd: 0.04, kn: 0.03, pk: 0.5, sw: 0.03, tl: 0.92, en: 0.65, tp: 1 },
};
function envAt(s, e) {
  const a = s < e.hd ? e.st + (1 - e.st) * Math.sin((s / e.hd) * Math.PI / 2) : 1;
  const knot = e.kn * Math.exp(-(((s - e.hd * 0.55) / (e.hd * 0.45)) ** 2));
  const swell = 1 - e.sw + e.sw * Math.exp(-(((s - e.pk) / 0.24) ** 2));
  const t = s > e.tl ? (s - e.tl) / (1 - e.tl) : 0;
  const tail = 1 - (1 - e.en) * Math.pow(t, e.tp);
  return a * swell * tail + knot;
}
const envMemo = new Map();
function envFor(name, key) {
  const mk = typeof name === 'string' ? name + '|' + key : null;
  if (mk && envMemo.has(mk)) return envMemo.get(mk);
  const b = typeof name === 'object' ? name : ENV[name] || ENV.lan;
  const r = rng(hash(ID, 'env', key));
  const e = { ...b, pk: clamp(b.pk + (r() - 0.5) * 0.16, 0.1, 0.8), sw: b.sw * (0.8 + r() * 0.4), tl: clamp(b.tl + (r() - 0.5) * 0.1, 0.2, 0.95) };
  if (mk) { if (envMemo.size > 4000) envMemo.clear(); envMemo.set(mk, e); }
  return e;
}
function arcLen(P) {
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return L;
}

/** One brush stroke. pts: control points (smoothed unless o.dense); o = { w, t, e, hair, T (point map), seg, curv } */
function ln(K, key, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  // (p5.brush draws nothing for a curved 2-point spline: subdivide straight strokes so the envelope applies)
  let P = pts.length === 2 ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => [lerp(pts[0][0], pts[1][0], t), lerp(pts[0][1], pts[1][1], t)])
    : o.dense ? pts : smoothPath(pts, o.seg ?? 5);
  if (o.T) P = P.map(o.T);
  const L = arcLen(P), tot = L[L.length - 1];
  if (tot < 0.3) return;
  const E = envFor(o.e || 'lan', key);
  const w = o.w ?? 1.6;
  const arr = P.map((p, i) => [p[0], p[1], Math.max(0.05, envAt(L[i] / tot, E))]);
  K.seed(ID, key);
  K.brush.noFill(); K.brush.noWash(); K.brush.noHatch();
  K.brush.set(o.hair || w < 0.9 ? 'tang.hair' : w > 2.6 ? 'tang.bold' : 'tang.line', tone(o.t ?? 0.9), w);
  K.brush.spline(arr, pts.length === 2 ? 0 : o.curv ?? 0.35);
}
/** flat fill (paper knock-out or solid ink) */
function poly(K, key, pts, col, T) {
  if (!pts || pts.length < 3) return;
  K.seed(ID, 'f', key);
  K.brush.noStroke(); K.brush.noHatch(); K.brush.noFill();
  K.brush.wash(col, 255);
  K.brush.polygon(T ? pts.map(T) : pts);
  K.brush.noWash();
}

// ------------------------------------------------------------------ geometry helpers
function arcPts(cx, cy, rx, ry, a0, a1, n = 16, rot = 0) {
  const out = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
/** spiral curl: starts on the outside at angle a0, winds `turns` in direction dir (+1 = clockwise on screen) */
function spiral(cx, cy, r, turns, a0, dir = 1, shrink = 0.8, n = 28, sq = 1) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = a0 + dir * t * turns * Math.PI * 2, rr = r * (1 - shrink * t);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq]);
  }
  return out;
}
function resample(pts, n) {
  const P = pts.length > 2 ? smoothPath(pts, 6) : pts;
  const L = arcLen(P), tot = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (tot * k) / (n - 1);
    while (j < P.length - 2 && L[j + 1] < d) j++;
    const f = (d - L[j]) / Math.max(1e-6, L[j + 1] - L[j]);
    out.push([lerp(P[j][0], P[j + 1][0], f), lerp(P[j][1], P[j + 1][1], f)]);
  }
  return out;
}
function normals(P) {
  return P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  });
}
/** integrate a tangent-angle function from p0: n points spaced ds (cloth keeps its length) */
function chain(p0, n, ds, ang) {
  const out = [p0.slice()];
  let x = p0[0], y = p0[1];
  for (let k = 1; k < n; k++) {
    const a = ang((k - 0.5) / (n - 1));
    x += Math.cos(a) * ds; y += Math.sin(a) * ds;
    out.push([x, y]);
  }
  return out;
}
/**
 * Flat ribbon from a centre line: two edge lines whose separation is width·cos(twist) — where
 * cos changes sign the ribbon turns over and the edges cross (the figure-of-eight of Tang sashes).
 */
function ribbonEdges(C, width, twist) {
  const N = normals(C);
  const A = [], B = [], c = [];
  C.forEach((p, i) => {
    const s = i / (C.length - 1);
    const cs = Math.cos(twist(s));
    const h = (width(s) * cs) / 2;
    A.push([p[0] + N[i][0] * h, p[1] + N[i][1] * h]);
    B.push([p[0] - N[i][0] * h, p[1] - N[i][1] * h]);
    c.push(cs);
  });
  return [A, B, c];
}
/** draw a ribbon: knock-out fill between the twists, then the two edges (and an end cap) */
function drawRibbon(K, key, C, o) {
  const [A, B, cs] = ribbonEdges(o.T ? C.map(o.T) : C, o.width, o.twist);
  const vis = o.vis || null;
  const n = C.length;
  if (o.fill !== false) {
    let i0 = 0;
    for (let i = 1; i < n; i++) {
      const cut = i === n - 1 || Math.sign(cs[i]) !== Math.sign(cs[i - 1]) || (vis && vis[i] !== vis[i - 1]);
      if (!cut) continue;
      if (i - i0 >= 2 && (!vis || vis[i0 + 1])) poly(K, `${key}fl${i0}`, A.slice(i0, i + 1).concat(B.slice(i0, i + 1).reverse()), FILL);
      i0 = i;
    }
  }
  const opt = { w: o.w ?? 1.3, t: o.t ?? 0.9, e: o.e || 'lan', dense: true };
  const runs = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    if (!vis || vis[i]) { if (!cur) { cur = [i, i]; runs.push(cur); } cur[1] = i; } else cur = null;
  }
  const maxSeg = o.maxSeg ?? 22;
  runs.forEach(([i0, i1], r) => {
    if (i1 - i0 < 1) return;
    const nSeg = Math.ceil((i1 - i0) / maxSeg);
    for (let k = 0; k < nSeg; k++) {
      const a = i0 + Math.floor(((i1 - i0) * k) / nSeg), b = i0 + Math.floor(((i1 - i0) * (k + 1)) / nSeg);
      const a1 = Math.max(i0, a - (k ? 1 : 0));
      ln(K, `${key}a${r}_${k}`, A.slice(a1, b + 1), opt);
      ln(K, `${key}b${r}_${k}`, B.slice(a1, b + 1), { ...opt, w: opt.w * 0.85 });
    }
  });
  if (o.cap !== false) {
    if (!vis || vis[n - 1]) ln(K, `${key}c1`, [A[n - 1], B[n - 1]], { ...opt, e: 'flick', w: opt.w * 0.8 });
    if (o.cap0 && (!vis || vis[0])) ln(K, `${key}c0`, [A[0], B[0]], { ...opt, e: 'flick', w: opt.w * 0.8 });
  }
}

// ------------------------------------------------------------------ live deformation of drapery
/** displace local point p with looseness L (0 pinned … 1 free hem) by the breeze and the gust */
function blow(p, L, u, fig, k = 1) {
  if (L <= 0) return p;
  const g = gustF(u + fig.lag);
  const ph = flutPh(u + fig.lag) + fig.ph + p[1] * 0.02 + p[0] * 0.01;
  const amb = (1 - 0.6 * g) * 2.4 * Math.sin(ph * 0.9);
  const fl = g * (5 * Math.sin(ph * 1.7) + 2.6 * Math.sin(ph * 2.9 + 1.3));
  const LL = L * L * k;
  const fc = fig.facing ?? 1;
  return [p[0] + fc * (LL * (-fig.gx * g + amb * 1.4 + fl) - L * 2 * (1 - g)),
    p[1] + LL * (-fig.gy * g + 0.5 * amb + 0.45 * fl)];
}
/** a hanging free cloth end as an angle chain: rest angle → gust angle, with travelling ripples */
function sashChain(p0, len, n, u, fig, o) {
  const g = gustF(u + fig.lag) * (o.gk ?? 1);
  const ph = flutPh(u + fig.lag) * (o.speed ?? 1) + (o.ph ?? 0);
  const fc = fig.facing ?? 1;
  const mir = (a) => (fc > 0 ? a : Math.PI - a);
  return chain(p0, n, len / (n - 1), (s) => {
    const rest = lerp(o.rest0 ?? Math.PI / 2, o.rest1 ?? Math.PI / 2 + 0.4, s);
    const gust = mir(lerp(o.gust0 ?? Math.PI - 0.35, o.gust1 ?? Math.PI + 0.05, s));
    const amp = ((o.amb ?? 0.18) * (1 - g) + (o.amp ?? 0.5) * g) * (0.25 + s);
    return lerp(rest, gust, g) + amp * Math.sin(ph - s * (o.k ?? 6));
  });
}
/** swing a hanging sleeve about its pivot: rotation grows with distance, the ends flutter */
function swingRot(pts, piv, R, u, fig, th = 0.5) {
  const g = gustF(u + fig.lag);
  const ph = flutPh(u + fig.lag) + fig.ph;
  const fc = fig.facing ?? 1;
  return pts.map((p) => {
    const dx = p[0] - piv[0], dy = p[1] - piv[1];
    const L = clamp(Math.hypot(dx, dy) / R);
    const a = fc * L * (th * g + 0.06 * Math.sin(ph * 0.9) * (1 - g) + g * 0.1 * Math.sin(ph * 1.7 + L * 3));
    const c = Math.cos(a), s = Math.sin(a);
    return [piv[0] + dx * c - dy * s, piv[1] + dx * s + dy * c];
  });
}

/** a wide hanging sleeve (大袖) as a curtain: outline, inner folds, the lining band at the hem, the cuff */
function pushCurtain(out, c, key, sw, wOut = 2.0) {
  const sm = (pts) => smoothPath(sw(pts), 4);
  const top = sm(c.top), front = sm(c.front), bottom = sm(c.bottom), back = sm(c.back);
  out.push(FL(top.concat(front.slice(1), bottom.slice(1), back.slice(1))));
  out.push(S(front.concat(bottom.slice(1)), { w: wOut, key: key + 'o', dense: true }));
  out.push(S(back, { w: wOut * 0.85, key: key + 'b', dense: true }));
  out.push(S(top, { w: 1.4, key: key + 't', dense: true }));
  (c.folds || []).forEach((f, k) => out.push(S(sw(f), { w: 1.25 - k * 0.12, key: key + 'f' + k })));
  if (c.band) out.push(S(sw(c.band), { w: 0.85, e: 'hair', key: key + 'h' }));
  if (c.cuff) out.push(S(sw(c.cuff), { w: 1.0, e: 'iron', key: key + 'c' }));
}

// ================================================================== figure toolkit
// Items (local coords: feet on the cloud at y = 0, x = body axis, y down, pre-scale):
//   { pts, w, t, e }    stroke          { fill: pts }   paper knock-out      { ink: pts, t }  solid ink
//   { ribbon: C, width, twist, w }      flat sash with knock-out
const S = (pts, o = {}) => ({ pts, ...o });
const FL = (pts) => ({ fill: pts });

function drawItems(K, items, pre, T, wk) {
  items.forEach((it, k) => {
    const key = `${pre}${it.key ?? k}`;
    if (it.fill) poly(K, key, it.fill, FILL, T);
    else if (it.ink) poly(K, key, it.ink, tone(it.t ?? 1), T);
    else if (it.ribbon) drawRibbon(K, key, it.ribbon, { width: it.width, twist: it.twist, w: (it.w ?? 1.2) * wk, t: it.t, T, cap0: it.cap0, fill: it.fillR });
    else ln(K, key, it.pts, { w: (it.w ?? 1.6) * wk, t: it.t, e: it.e, T, dense: it.dense, seg: it.seg, curv: it.curv });
  });
}

/** skirt fold lines between a back and a front contour (top → hem); spec [f, k0, k1, bend, w] on 0..M−1 */
function skirtFolds(back, front, list, M = 26) {
  const Bk = resample(back, M), Fr = resample(front, M);
  return list.map(([f, k0, k1, bend, w, sb]) => {
    const pts = [];
    for (let k = k0; k <= k1; k++) {
      const t = k / (M - 1), q = (k - k0) / Math.max(1, k1 - k0);
      const ff = clamp(f + bend * Math.sin(Math.PI * q) + (sb ?? 0) * Math.sin(Math.PI * 2 * q) - 0.1 * t * t * (1 - f), 0.02, 0.98);
      pts.push([lerp(Bk[k][0], Fr[k][0], ff), lerp(Bk[k][1], Fr[k][1], ff)]);
    }
    return { pts, w: w ?? 1.7 };
  });
}
/** wavy hem from the back corner to the front: a run of shallow arcs */
function hemLine(x0, x1, y, flips, seed, lift = 6) {
  const r = rng(hash(ID, 'hem', seed));
  const pts = [];
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([lerp(x0, x1, t), y - Math.abs(Math.sin(t * Math.PI * flips)) * lift * (0.6 + r() * 0.6) - (1 - t) * 5]);
  }
  return pts;
}
/** a small cloud under the feet: lobes with curls, a flowing base (local coords) */
function footCloud(cx, w, seed) {
  const r = rng(hash(ID, 'fc', seed));
  const out = [];
  const head = cx + w * 0.38;
  out.push(S(spiral(head, -3, 13, 1.15, Math.PI * 0.6, -1, 0.75), { w: 1.6, e: 'lan' }));
  out.push(S(spiral(head - 27, 1, 10, 1.05, Math.PI * 0.4, -1, 0.75), { w: 1.3, e: 'lan' }));
  out.push(S([[head + 6, 10], [head - 12, 15], [head - 40, 13], [cx - w * 0.2, 10 + r() * 3], [cx - w * 0.6, 7], [cx - w * 0.85, 2]], { w: 1.5, e: 'lan' }));
  out.push(S([[head - 22, 19], [head - 50, 18], [cx - w * 0.3, 15], [cx - w * 0.62, 12]], { w: 1.0, e: 'hair', t: 0.72 }));
  return out;
}
const mapP = (pts, f) => pts.map(f);

// ---------------------------------------------------------------- the heavenly lady (玉女) with a tray of peonies
function buildLady() {
  const front = [], back = [];
  const add = (pts, o) => front.push(S(pts, o));
  // head knock-out (face, hair, chignon)
  front.push(FL([[13, -357], [17, -351], [20, -345], [21.5, -340], [25, -333.5], [22.5, -330.5], [23, -327.5], [21.6, -326], [23, -323.5], [21, -320], [19.5, -316], [13, -311.5], [12, -298], [-9, -298], [-12, -314], [-17, -320], [-17, -331], [-12, -343], [-11, -352], [-13, -372], [-9, -387], [3, -398], [16, -396], [21, -386], [15, -375], [9, -366]]));
  front.push(FL([[-12, -365], [-24, -371], [-30, -383], [-25, -393], [-14, -392], [-9, -385]]));
  // face (three-quarter, facing right)
  add([[13, -357], [17, -351], [20, -345], [21.5, -340], [25, -333.5], [22.5, -330.5]], { w: 1.05, e: 'iron', t: 0.92 });
  add([[23, -327.5], [21.6, -326], [23, -323.5], [21, -320], [19.5, -316], [13, -311.5], [3, -311], [-3, -313]], { w: 1.05, e: 'iron', t: 0.92 });
  add([[5, -345.5], [10, -347.6], [16, -347], [19, -345.4]], { w: 0.7, e: 'hair', t: 0.95 });
  add([[8.5, -339.6], [12.5, -341.4], [17.5, -339.6]], { w: 0.95, e: 'iron', t: 1 });
  add([[10.5, -337.8], [15.5, -337.7]], { w: 0.5, e: 'hair', t: 0.8 });
  add([[14.6, -340.3], [14.9, -338.7]], { w: 1.7, e: 'even', t: 1 });
  add([[18.2, -325.2], [21.2, -325.6]], { w: 0.65, e: 'hair', t: 0.95 });
  add([[18.5, -331.2], [20.6, -330.3]], { w: 0.5, e: 'hair', t: 0.85 });
  add([[-4, -339], [-8.5, -337], [-9, -331], [-6, -327.5], [-3, -328]], { w: 0.8, e: 'iron', t: 0.85 });
  add([[13, -311], [12, -299]], { w: 0.95, e: 'iron' });
  add([[-7, -313], [-9, -299]], { w: 0.95, e: 'iron' });
  // hair: hairline, side mass, tall chignon leaning forward, back lobe, combed strands
  add([[13, -357], [6, -360.5], [-4, -359], [-11, -352], [-12, -343], [-10, -337]], { w: 1.3, e: 'lan', t: 0.95 });
  add([[-10, -330], [-15, -327], [-17, -320], [-12, -314], [-6, -313]], { w: 1.3, e: 'lan', t: 0.95 });
  add([[-11, -350], [-16, -342], [-17, -331]], { w: 1.1, e: 'lan', t: 0.95 });
  add([[-8, -359], [-13, -372], [-9, -387], [3, -398], [16, -396], [21, -386], [15, -375], [9, -366]], { w: 1.5, e: 'lan', t: 0.96 });
  add([[-12, -365], [-24, -371], [-30, -383], [-25, -393], [-14, -392], [-9, -385]], { w: 1.3, e: 'lan', t: 0.96 });
  for (let k = 0; k < 5; k++) add([[-6 + k * 3, -361 - k * 0.5], [-8 + k * 4, -375 - k * 2], [0 + k * 4, -389 + k * 0.5]], { w: 0.42, e: 'hair', t: 0.7 });
  for (let k = 0; k < 3; k++) add([[2 - k * 5, -358], [-6 - k * 3, -352], [-9 - k * 2, -342]], { w: 0.42, e: 'hair', t: 0.7 });
  for (let k = 0; k < 3; k++) add([[-14 - k * 3, -368 - k], [-24 - k, -378], [-20 + k, -390]], { w: 0.4, e: 'hair', t: 0.65 });
  // comb, hairpins with dangling beads, a peony in the hair
  add([[-2, -363], [6, -368.5], [15, -366.5]], { w: 1.2, e: 'iron', t: 0.92 });
  add([[-6, -383], [-28, -406]], { w: 0.9, e: 'iron' });
  add([[-28, -406], [-31, -400], [-30, -392]], { w: 0.6, e: 'hair' });
  front.push({ ink: arcPts(-30, -390, 1.6, 1.6, 0, Math.PI * 2, 8), t: 0.9 });
  add([[2, -394], [-5, -416]], { w: 0.8, e: 'iron' });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 - 0.4;
    add(arcPts(20 + Math.cos(a) * 5, -388 + Math.sin(a) * 4, 4.2, 3.2, a - 1.2, a + 1.4, 6), { w: 0.7, e: 'hair', t: 0.9 });
  }
  // crossed collar, upper arms
  add([[-12, -300], [-2, -290], [12, -277], [20, -268]], { w: 1.5, e: 'lan' });
  add([[12, -301], [6, -291], [2, -282]], { w: 1.2, e: 'lan' });
  add([[30, -290], [33, -270], [31, -253], [25, -241]], { w: 1.6, e: 'lan' });
  add([[-31, -286], [-35, -264], [-36, -246]], { w: 1.4, e: 'lan' });
  // high waist sash band and bow
  front.push(FL([[-27, -254], [26, -256], [26, -246], [-25, -243]]));
  add([[-26, -253], [-6, -250], [14, -251], [26, -255]], { w: 1.5, e: 'lan' });
  add([[-25, -244], [-4, -241], [14, -243], [25, -247]], { w: 1.2, e: 'lan' });
  front.push(FL([[16, -248], [10, -257], [3, -252], [14, -246], [26, -258], [31, -251], [20, -245]]));
  add([[16, -248], [10, -257], [3, -252], [14, -246]], { w: 0.9, e: 'iron' });
  add([[18, -248], [26, -258], [31, -251], [20, -245]], { w: 0.9, e: 'iron' });
  // tray (oval dish on a foot) held at the chest, peonies heaped on it, leaves between
  front.push(FL(arcPts(64, -266, 34, 8, 0, Math.PI * 2, 24)));
  front.push(FL([[30, -268], [36, -290], [52, -302], [70, -304], [92, -294], [102, -280], [96, -266]]));
  front.push(FL([[53, -259], [55, -253], [73, -253], [76, -259]]));
  add(arcPts(64, -266, 33, 7.5, 0.05, Math.PI - 0.05, 18), { w: 1.4, e: 'iron' });
  add(arcPts(64, -266, 33, 7.5, Math.PI + 0.1, Math.PI * 2 - 0.1, 18), { w: 0.9, e: 'iron', t: 0.85 });
  add(arcPts(64, -264, 28, 5, 0.2, Math.PI - 0.2, 14), { w: 0.6, e: 'hair', t: 0.8 });
  add([[53, -259], [55, -253], [73, -253], [76, -259]], { w: 1.0, e: 'iron' });
  const leaf = (x0, y0, x1, y1, bulge) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    const nx = -dy / L * bulge, ny = dx / L * bulge;
    add([[x0, y0], [mx + nx, my + ny], [x1, y1]], { w: 0.9, e: 'lan' });
    add([[x0, y0], [mx - nx, my - ny], [x1, y1]], { w: 0.8, e: 'lan' });
    add([[x0, y0], [mx, my], [x1 - dx * 0.15, y1 - dy * 0.15]], { w: 0.4, e: 'hair', t: 0.8 });
  };
  const peony = (cx, cy, r) => {
    for (let k = 0; k < 4; k++) {
      const a0 = Math.PI * (1.05 + k * 0.24);
      add(arcPts(cx + Math.cos(a0 + 0.3) * r * 0.45, cy + Math.sin(a0 + 0.3) * r * 0.35, r * 0.6, r * 0.42, a0 - 0.9, a0 + 1.5, 8), { w: 0.9, e: 'lan', t: 0.92 });
    }
    add(arcPts(cx, cy + r * 0.25, r * 1.0, r * 0.55, 0.1, Math.PI - 0.1, 12), { w: 1.0, e: 'lan' });
    add(spiral(cx + 1, cy - r * 0.1, r * 0.32, 1.1, 0, 1, 0.7, 12), { w: 0.6, e: 'hair' });
  };
  leaf(48, -268, 32, -285, 5); leaf(80, -270, 102, -283, 5); leaf(62, -272, 70, -300, 4);
  peony(60, -285, 15); peony(43, -277, 10); peony(83, -281, 11);
  add([[46, -262], [49, -266.5], [53, -267], [55, -264]], { w: 0.9, e: 'iron' });
  add([[49, -266.5], [51, -270], [55, -270.5]], { w: 0.7, e: 'iron' });
  add([[79, -262], [83, -266], [86, -265]], { w: 0.85, e: 'iron' });
  // behind the drapery: shoes, foot cloud
  back.push(S([[40, -8], [52, -13], [59, -8], [53, -2], [42, -2]], { w: 1.1, e: 'iron' }));
  back.push(S([[52, -13], [57, -16], [60, -12]], { w: 0.8, e: 'iron' }));
  back.push(...footCloud(-20, 120, 'lady'));

  const bk = [[-29, -246], [-34, -205], [-42, -160], [-52, -116], [-66, -74], [-88, -38], [-116, -16], [-138, -10]];
  const fr = [[27, -244], [30, -205], [35, -160], [41, -115], [44, -72], [47, -32], [50, -6]];
  const folds = skirtFolds(bk, fr, [
    [0.08, 3, 25, 0.04, 1.9], [0.2, 9, 25, 0.07, 1.4, 0.03], [0.3, 1, 25, -0.05, 1.8], [0.4, 12, 25, 0.06, 1.3],
    [0.5, 4, 24, 0.08, 1.7, -0.03], [0.6, 14, 25, -0.05, 1.3], [0.7, 2, 25, 0.06, 1.6], [0.8, 10, 24, -0.04, 1.4, 0.03],
    [0.9, 5, 25, 0.03, 1.6], [0.96, 15, 25, 0.02, 1.2],
  ]);
  const hem = hemLine(-138, 50, -4, 3, 'ladyhem', 7);
  const SLV_N = {
    top: [[20, -244], [33, -252], [46, -259]], front: [[46, -259], [51, -248], [50, -224], [44, -200], [32, -182], [18, -172]],
    bottom: [[18, -172], [6, -170], [-4, -178]], back: [[-4, -178], [0, -200], [10, -226], [20, -244]],
    folds: [[[42, -254], [44, -228], [38, -204], [26, -186], [14, -178]], [[34, -250], [34, -226], [26, -204], [12, -188]], [[26, -246], [22, -224], [12, -202], [2, -188]]],
    band: [[24, -179], [8, -177], [-2, -183]],
  };
  const SLV_F = {
    top: [[56, -254], [68, -257], [79, -260]], front: [[79, -260], [83, -246], [80, -226], [72, -212]],
    bottom: [[72, -212], [62, -210], [56, -218]], back: [[56, -218], [55, -236], [56, -254]],
    folds: [[[72, -254], [74, -234], [68, -216]]],
  };
  const TORSO = [[-12, -300], [-32, -288], [-36, -262], [-30, -246], [28, -244], [32, -262], [30, -290], [12, -301]];
  return {
    id: 'lady', x0: 770, v: 3, ph: 0.4, lag: -0.02, gx: 46, gy: 10, Z: 1.12, front, back,
    live(u, under, over) {
      const F = this;
      const yL = (y) => clamp(smoothstep(-205, -10, y) ** 1.1);
      const bl = (pts, k = 1) => pts.map((p) => blow(p, yL(p[1]), u, F, k));
      const sw = (pts, piv, R, k) => swingRot(pts, piv, R, u, F, 0.55 * k);
      // hair ribbons streaming from the chignon (behind the head)
      for (const [k, len, ph] of [[0, 120, 0.3], [1, 95, 2.0]]) {
        const C = sashChain([-14, -380 + k * 6], len, 16, u, F, { rest0: Math.PI / 2 + 0.5, rest1: Math.PI / 2 + 0.2, gust0: Math.PI + 0.15, gust1: Math.PI - 0.1, amp: 0.6, amb: 0.2, ph, k: 7 });
        under.push({ ribbon: C, key: 'hr' + k, width: (s) => 4.2 * (1 - 0.4 * s), twist: (s) => 0.3 + s * 6 + ph, w: 0.8 });
      }
      under.push(FL(TORSO));
      // skirt: knock-out, contours, folds, hem
      const B = bl(smoothPath(bk, 4)), Fr = bl(smoothPath(fr, 4)), H = bl(smoothPath(hem, 3));
      under.push(FL(B.concat(H.slice(1), Fr.slice().reverse())));
      under.push(S(B, { w: 2.2, key: 'skB', dense: true }), S(Fr, { w: 2.0, key: 'skF', dense: true }));
      folds.forEach((f, k) => under.push(S(bl(f.pts), { w: f.w, key: 'skf' + k })));
      under.push(S(H, { w: 1.6, key: 'hem', dense: true }));
      under.push(S(bl([[-138, -10], [-154, -17], [-160, -30], [-150, -37], [-138, -28]], 1.15), { w: 1.4, key: 'hemcurl' }));
      under.push(S(bl([[-108, -16], [-120, -26], [-114, -34]], 1.1), { w: 0.9, key: 'hemcurl2' }));
      // the wide sleeves hang from both forearms below the tray (far one first)
      pushCurtain(under, SLV_F, 'slvF', (pts) => sw(pts, [68, -256], 75, 0.65), 1.8);
      pushCurtain(under, SLV_N, 'slvN', (pts) => sw(pts, [34, -250], 95, 0.65), 2.0);
      // two long ties from the bow down the front of the skirt
      for (const [k, ox, len, ph] of [[0, 17, 215, 0], [1, 24, 180, 1.7]]) {
        const C = sashChain([ox, -246], len, 26, u, F, { rest0: Math.PI / 2 + 0.02, rest1: Math.PI / 2 + 0.45, gust0: Math.PI / 2 + 0.7, gust1: Math.PI - 0.15, amp: 0.55, amb: 0.16, ph, k: 7 });
        over.push({ ribbon: C, key: 'rib' + k, width: (s) => 6.5 * (1 - 0.3 * s), twist: (s) => 0.4 + s * 5 + ph, w: 1.0 });
      }
    },
  };
}

// ---------------------------------------------------------------- the Daoist immortal (真人) with a feather fan
function buildImmortal() {
  const front = [], back = [];
  const add = (pts, o) => front.push(S(pts, o));
  // halo (two fine rings behind the head; the bottom hides behind the shoulders)
  back.push(S(arcPts(3, -364, 60, 60, Math.PI * 0.66, Math.PI * 2.36, 48), { w: 1.0, e: 'even', t: 0.7, dense: true }));
  back.push(S(arcPts(3, -364, 54, 54, Math.PI * 0.7, Math.PI * 2.32, 44), { w: 0.7, e: 'even', t: 0.6, dense: true }));
  // head knock-out
  front.push(FL([[16, -372], [21, -366], [22, -360], [24, -355], [29, -348], [26, -345.5], [24, -344], [25, -336], [14, -326], [-10, -322], [-14, -340], [-12, -358], [-10, -368], [-9, -392], [-4, -404], [8, -408], [18, -402], [19, -390], [16, -378]]));
  // face of an old sage: long brows, narrowed eye, nose, cheek line
  add([[16, -372], [21, -366], [22, -361], [24, -355], [29, -348.5], [26, -345.5], [23.5, -345]], { w: 1.1, e: 'iron', t: 0.92 });
  add([[3, -362], [9, -365], [16, -364.5], [21, -362]], { w: 1.0, e: 'lan', t: 0.95 });
  for (let k = 0; k < 4; k++) add([[6 + k * 3.5, -364.5], [11 + k * 3.5, -366.5 + k * 0.5], [14 + k * 3.8, -365 + k * 1.2]], { w: 0.45, e: 'hair', t: 0.8 });
  add([[8.5, -357.6], [13, -359.2], [18, -357.6]], { w: 1.0, e: 'iron', t: 1 });
  add([[11, -355.6], [16, -355.4]], { w: 0.5, e: 'hair', t: 0.75 });
  add([[14.6, -358.4], [14.9, -356.8]], { w: 1.6, e: 'even', t: 1 });
  add([[10, -352.6], [16, -352]], { w: 0.4, e: 'hair', t: 0.6 });
  add([[20, -351], [19.5, -345]], { w: 0.5, e: 'hair', t: 0.7 });
  add([[21.5, -347.6], [24, -347]], { w: 0.5, e: 'hair', t: 0.85 });
  add([[-4, -357], [-8.5, -354], [-9, -346], [-5, -342]], { w: 0.85, e: 'iron', t: 0.85 });
  // hair, crown with a long pin
  add([[16, -372], [8, -376], [-2, -375], [-10, -368], [-12, -358], [-11, -348], [-14, -338], [-12, -330]], { w: 1.3, e: 'lan', t: 0.95 });
  for (let k = 0; k < 4; k++) add([[10 - k * 5, -374 + k], [-2 - k * 4, -370 + k * 2], [-8 - k * 2, -360 + k * 3]], { w: 0.42, e: 'hair', t: 0.7 });
  add([[-8, -374], [4, -379], [17, -377]], { w: 1.3, e: 'lan' });
  add([[-6, -377], [-9, -392], [-4, -404], [8, -408], [18, -402], [19, -390], [16, -378]], { w: 1.4, e: 'lan', t: 0.95 });
  add([[-2, -380], [-3, -394], [4, -402]], { w: 0.6, e: 'hair', t: 0.8 });
  add(arcPts(13, -391, 3.6, 3.6, 0, Math.PI * 2, 10), { w: 0.8, e: 'iron', dense: true });
  add([[-20, -394.5], [8, -396.5], [31, -398]], { w: 1.0, e: 'iron', t: 0.85 });
  add([[-20, -394.5], [-23, -392], [-21, -389]], { w: 0.6, e: 'hair' }), add([[31, -398], [34, -395], [32, -392]], { w: 0.6, e: 'hair' });
  // collar band (crossed), shoulders
  front.push(FL([[-12, -326], [-2, -310], [14, -292], [26, -276], [32, -282], [20, -300], [6, -316], [-4, -328]]));
  add([[-12, -326], [-2, -310], [14, -292], [26, -276]], { w: 1.6, e: 'lan' });
  add([[-4, -328], [6, -314], [20, -298], [32, -283]], { w: 1.3, e: 'lan' });
  add([[14, -330], [11, -318], [8, -306]], { w: 1.1, e: 'lan' });
  add([[-12, -324], [-30, -317], [-44, -302]], { w: 1.8, e: 'lan' });
  add([[18, -327], [32, -318], [40, -306], [46, -287], [46, -266]], { w: 1.8, e: 'lan' });
  // belt with a knot at the front
  front.push(FL([[-36, -236], [34, -236], [34, -222], [-36, -224]]));
  add([[-36, -235], [-12, -231], [12, -231], [34, -235]], { w: 1.6, e: 'lan' });
  add([[-36, -225], [-12, -221], [12, -221], [34, -225]], { w: 1.3, e: 'lan' });
  front.push(FL([[22, -229], [16, -238], [26, -236], [32, -240], [33, -228], [26, -224]]));
  add([[24, -229], [16, -238], [22, -240], [27, -232]], { w: 1.0, e: 'iron' });
  add([[27, -230], [33, -240], [36, -232], [28, -226]], { w: 1.0, e: 'iron' });
  // hand on the fan handle; the feather fan (羽扇) before the chest: feathers fanned from the grip
  const fanBase = [64, -326];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.62 + k * 0.23, Lf = 48 + 6 * Math.sin((k / 6) * Math.PI);
    const dir = [Math.cos(a), Math.sin(a)], nrm = [-dir[1], dir[0]];
    const P = (t, o) => [fanBase[0] + dir[0] * Lf * t + nrm[0] * o, fanBase[1] + dir[1] * Lf * t + nrm[1] * o];
    const hw = (t) => 6.2 * Math.sin(Math.PI * Math.min(1, t * 0.95)) ** 0.7;
    const side1 = [0.05, 0.3, 0.55, 0.8, 0.97].map((t) => P(t, hw(t)));
    const side2 = [0.97, 0.8, 0.55, 0.3, 0.05].map((t) => P(t, -hw(t)));
    front.push(FL(side1.concat([P(1.0, 0)], side2)));
    add(side1.concat([P(1.0, 0)]), { w: 0.95, e: 'lan' });
    add([P(1.0, 0)].concat(side2), { w: 0.85, e: 'lan' });
    add([P(0.04, 0), P(0.5, 0.4), P(0.9, 0)], { w: 0.45, e: 'hair', t: 0.8 });
    for (const t of [0.45, 0.62, 0.78]) add([P(t, 0.3), P(t + 0.07, hw(t + 0.07) * 0.8)], { w: 0.3, e: 'hair', t: 0.6 });
  }
  add([[59, -323], [64, -328], [69, -323]], { w: 1.2, e: 'iron' });
  front.push(FL([[54, -307], [60, -312], [64, -308], [65, -298], [60, -292], [54, -296]]));
  add([[61, -292], [64, -324]], { w: 1.7, e: 'even' });
  add([[60, -290], [58, -282], [61, -270]], { w: 0.6, e: 'hair' }), add([[60.5, -290], [62, -280], [60, -272]], { w: 0.6, e: 'hair' });
  add([[55, -303], [59, -307], [63, -304], [64, -298], [60, -293], [55, -296]], { w: 0.95, e: 'iron' });
  add([[56, -300.5], [62.5, -300.5]], { w: 0.5, e: 'hair' });
  add([[56, -297.5], [62, -297]], { w: 0.5, e: 'hair' });
  // chest folds under the collar
  add([[-20, -312], [-26, -290], [-28, -262], [-24, -238]], { w: 1.1, e: 'lan' });
  add([[-6, -306], [-12, -282], [-12, -256], [-8, -238]], { w: 0.9, e: 'lan', t: 0.85 });
  // shoes peeking under the hem, foot cloud
  back.push(S([[48, -8], [60, -14], [68, -9], [62, -2], [49, -2]], { w: 1.1, e: 'iron' }));
  back.push(S([[60, -14], [65, -18], [69, -14]], { w: 0.8, e: 'iron' }));
  back.push(...footCloud(-24, 130, 'imm'));

  const bk = [[-36, -226], [-44, -172], [-56, -118], [-72, -70], [-96, -34], [-130, -14], [-160, -8]];
  const fr = [[34, -226], [38, -172], [44, -112], [48, -64], [52, -26], [56, -6]];
  const folds = skirtFolds(bk, fr, [
    [0.06, 2, 25, 0.04, 1.9], [0.18, 7, 25, 0.07, 1.5, 0.03], [0.3, 1, 25, -0.05, 1.8], [0.42, 11, 25, 0.06, 1.3],
    [0.55, 4, 24, 0.07, 1.7, -0.03], [0.68, 13, 25, -0.05, 1.3], [0.8, 3, 25, 0.05, 1.6], [0.92, 9, 25, 0.03, 1.4],
  ]);
  const hem = hemLine(-160, 56, -4, 3.5, 'immhem', 7);
  const SLV_N = {
    top: [[36, -264], [46, -280], [57, -290]], front: [[57, -290], [64, -280], [67, -250], [66, -210], [60, -176], [50, -156]],
    bottom: [[50, -156], [38, -146], [24, -146], [14, -154]], back: [[14, -154], [12, -180], [16, -216], [26, -246], [36, -264]],
    folds: [[[54, -278], [58, -244], [56, -206], [48, -170]], [[46, -272], [47, -236], [42, -196], [34, -160]], [[38, -264], [34, -230], [28, -194], [24, -160]]],
    band: [[56, -166], [42, -154], [26, -153], [16, -160]],
    cuff: [[52, -294], [58, -295], [64, -287], [62, -281]],
  };
  const SLV_F = {
    top: [[-22, -312], [-38, -302], [-48, -286]], front: [[-48, -286], [-58, -250], [-66, -210], [-70, -176], [-66, -156]],
    bottom: [[-66, -156], [-54, -146], [-40, -146], [-28, -154]], back: [[-28, -154], [-22, -196], [-18, -250], [-22, -312]],
    folds: [[[-42, -292], [-50, -250], [-56, -206], [-58, -164]], [[-32, -298], [-36, -250], [-40, -200], [-42, -156]]],
    band: [[-67, -162], [-54, -153], [-40, -152], [-29, -160]],
  };
  const TORSO = [[-14, -326], [-40, -306], [-44, -280], [-40, -240], [-36, -226], [34, -226], [38, -260], [42, -300], [18, -328]];
  const apronL = [[12, -222], [14, -170], [18, -116], [22, -72]], apronR = [[33, -224], [37, -170], [42, -116], [46, -74]];
  return {
    id: 'imm', x0: 236, v: 3, ph: 1.7, lag: 0.03, gx: 50, gy: 12, Z: 1.12, front, back,
    live(u, under, over) {
      const F = this;
      const yL = (y) => clamp(smoothstep(-190, -10, y) ** 1.1);
      const bl = (pts, k = 1) => pts.map((p) => blow(p, yL(p[1]), u, F, k));
      const sw = (pts, piv, R, k) => swingRot(pts, piv, R, u, F, 0.5 * k);
      // crown ribbons (behind the head)
      for (const [k, len, ph] of [[0, 110, 0.4], [1, 86, 2.2]]) {
        const C = sashChain([-6, -386 + k * 5], len, 15, u, F, { rest0: Math.PI / 2 + 0.45, rest1: Math.PI / 2 + 0.25, gust0: Math.PI + 0.42, gust1: Math.PI + 0.2, amp: 0.6, amb: 0.2, ph, k: 7 });
        under.push({ ribbon: C, key: 'cr' + k, width: (s) => 3.8 * (1 - 0.3 * s), twist: (s) => 0.3 + s * 6 + ph, w: 0.8 });
      }
      pushCurtain(under, SLV_F, 'slvF', (pts) => sw(pts, [-30, -300], 140, 0.9), 1.9);
      under.push(FL(TORSO));
      const B = bl(smoothPath(bk, 4)), Fr = bl(smoothPath(fr, 4)), H = bl(smoothPath(hem, 3));
      under.push(FL(B.concat(H.slice(1), Fr.slice().reverse())));
      under.push(S(B, { w: 2.3, key: 'skB', dense: true }), S(Fr, { w: 2.0, key: 'skF', dense: true }));
      folds.forEach((f, k) => under.push(S(bl(f.pts), { w: f.w, key: 'skf' + k })));
      under.push(S(H, { w: 1.6, key: 'hem', dense: true }));
      under.push(S(bl([[-160, -8], [-176, -17], [-180, -31], [-168, -37], [-157, -27]], 1.15), { w: 1.4, key: 'hemcurl' }));
      under.push(S(bl([[-124, -15], [-138, -27], [-131, -36]], 1.1), { w: 0.9, key: 'hemcurl2' }));
      // the ceremonial apron (蔽膝) down the front
      const aL = bl(smoothPath(apronL, 4), 0.6), aR = bl(smoothPath(apronR, 4), 0.6);
      const aB = bl([[22, -72], [34, -67], [46, -74]], 0.6);
      under.push(FL(aL.concat(aB.slice(1, 2), aR.slice().reverse())));
      under.push(S(aL, { w: 1.6, key: 'apL', dense: true }), S(aR, { w: 1.5, key: 'apR', dense: true }), S(aB, { w: 1.3, key: 'apB' }));
      under.push(S(bl([[17, -150], [28, -152], [40, -154]], 0.6), { w: 0.8, key: 'apM', e: 'iron' }));
      // the near sleeve hangs from the raised forearm like a curtain
      pushCurtain(under, SLV_N, 'slvN', (pts) => sw(pts, [44, -276], 120, 0.65), 2.1);
      // long belt ties (绅) and the beard over the chest
      for (const [k, ox, len, ph] of [[0, 25, 200, 0.5], [1, 31, 165, 2.1]]) {
        const C = sashChain([ox, -228], len, 24, u, F, { rest0: Math.PI / 2 + 0.02, rest1: Math.PI / 2 + 0.42, gust0: Math.PI / 2 + 0.75, gust1: Math.PI - 0.12, amp: 0.55, amb: 0.16, ph, k: 7 });
        over.push({ ribbon: C, key: 'tie' + k, width: (s) => 6 * (1 - 0.3 * s), twist: (s) => 0.4 + s * 5 + ph, w: 1.0 });
      }
      const beard = [[[6, -340], 44, 0.1], [[11, -338], 58, 0.0], [[16, -337], 66, -0.05], [[21, -338], 62, -0.1], [[25, -339], 50, -0.15], [[13, -339], 50, 0.05]];
      beard.forEach(([p0, len, lean], k) => {
        const C = sashChain(p0, len, 10, u, F, { rest0: Math.PI / 2 + lean, rest1: Math.PI / 2 + lean + 0.18, gust0: Math.PI - 0.95 + k * 0.05, gust1: Math.PI - 0.55, amp: 0.4, amb: 0.08, ph: k * 0.9, k: 5 });
        over.push(S(C, { w: k === 2 ? 0.9 : 0.6, e: 'hair', key: 'brd' + k, dense: false }));
      });
      over.push(S([[24, -344.5], [20, -342], [13, -341.5], [8, -343]], { w: 0.7, e: 'hair', key: 'mou1' }));
      over.push(S([[25, -344.5], [28, -340], [27.5, -334]], { w: 0.6, e: 'hair', key: 'mou2' }));
    },
  };
}

// ---------------------------------------------------------------- the guardian general (神将) with a bannered halberd
function buildGuardian() {
  const front = [], back = [];
  const add = (pts, o) => front.push(S(pts, o));
  // the sword at the far hip (behind)
  back.push(S([[-22, -246], [-48, -196], [-72, -150]], { w: 1.3, e: 'iron' }), S([[-16, -242], [-42, -192], [-66, -146]], { w: 1.2, e: 'iron' }));
  back.push(S([[-26, -252], [-12, -240]], { w: 1.6, e: 'even' }));
  // boots under the robe
  back.push(FL([[16, -44], [20, -12], [22, -2], [46, -2], [48, -7], [38, -12], [33, -44]]));
  back.push(S([[16, -44], [20, -12], [22, -2], [46, -2], [48, -7], [38, -12], [33, -18], [33, -44]], { w: 1.4, e: 'iron' }));
  back.push(S([[-26, -44], [-30, -12], [-32, -2], [-14, -2], [-12, -8], [-12, -44]], { w: 1.3, e: 'iron', t: 0.85 }));
  back.push(S([[18, -30], [33, -31]], { w: 0.8, e: 'iron' }), S([[-28, -30], [-12, -30]], { w: 0.7, e: 'iron', t: 0.8 }));
  back.push(...footCloud(-10, 120, 'grd'));
  // head knock-out: face, helmet, neck guard, crest base
  front.push(FL([[20, -366], [25, -361], [24, -356], [27, -352], [31, -347], [28, -344], [27, -336], [24, -330], [12, -326], [-6, -330], [-18, -332], [-26, -326], [-32, -330], [-24, -344], [-14, -358], [-12, -376], [-2, -388], [12, -391], [24, -383], [29, -369]]));
  // fierce face: knitted flaring brows, round glaring eye, broad nose, curled moustache
  add([[20, -365], [25, -361], [24.5, -356.5], [27.5, -352], [31.5, -347.5], [28.5, -344.5], [26, -344]], { w: 1.2, e: 'iron', t: 0.95 });
  add([[5, -360], [12, -361.5], [19, -364], [25, -369]], { w: 1.9, e: 'lan', t: 1 });
  add([[9, -362], [13, -367], [16, -368]], { w: 0.6, e: 'hair' }), add([[15, -364], [19, -370], [23, -372]], { w: 0.6, e: 'hair' });
  add([[8.5, -356.2], [13.5, -359.2], [21, -357.4]], { w: 1.35, e: 'iron', t: 1 });
  add([[10.5, -353.8], [15, -353], [19.5, -354.8]], { w: 0.7, e: 'iron', t: 0.85 });
  front.push({ ink: arcPts(16.4, -356.6, 1.7, 1.7, 0, Math.PI * 2, 8), t: 1 });
  add([[11, -362.5], [16, -361]], { w: 0.5, e: 'hair', t: 0.8 });
  add([[19.5, -350], [17.5, -344]], { w: 0.7, e: 'hair' });
  add([[26, -343.5], [22, -338]], { w: 0.7, e: 'hair' });
  add([[27, -343], [22, -341.5], [16, -340.5], [11, -337]], { w: 1.3, e: 'lan' });
  add([[27.5, -343], [30.5, -339], [29.5, -332]], { w: 1.1, e: 'lan' });
  add([[22, -337], [27, -337.5]], { w: 0.8, e: 'iron' });
  add([[-3, -354], [-7.5, -351], [-8, -344], [-4, -341]], { w: 0.9, e: 'iron' });
  add([[4, -340], [10, -333], [18, -330], [25, -332]], { w: 0.9, e: 'lan' });
  // helmet: bowl, brow plate, ear flap, flaring neck guard, cloud-scroll ornament, flame crest
  add([[-14, -358], [-12, -376], [-2, -388], [12, -391], [24, -383], [29, -369]], { w: 1.7, e: 'lan', t: 0.96 });
  add([[-12, -362], [4, -366], [20, -367], [30, -365]], { w: 1.4, e: 'lan' });
  add([[-11, -368], [4, -372], [21, -372], [29, -369]], { w: 0.9, e: 'iron', t: 0.85 });
  add(spiral(6, -380, 5, 1.2, Math.PI, 1, 0.75, 14), { w: 0.8, e: 'lan' });
  add([[-14, -358], [-20, -346], [-18, -333]], { w: 1.2, e: 'lan' });
  add([[-14, -356], [-24, -344], [-32, -330], [-26, -326], [-18, -332], [-6, -330]], { w: 1.5, e: 'lan' });
  add([[-17, -350], [-25, -337]], { w: 0.6, e: 'hair' }), add([[-11, -347], [-19, -334]], { w: 0.6, e: 'hair' });
  add([[2, -390], [-1, -404], [-7, -416], [-15, -421]], { w: 1.4, e: 'lan' });
  add([[7, -391], [9, -407], [5, -420], [-2, -428], [-11, -430]], { w: 1.5, e: 'lan' });
  add([[11, -390], [17, -401], [19, -413], [13, -424]], { w: 1.2, e: 'lan' });
  add([[-11, -430], [-14, -426], [-10, -423]], { w: 0.7, e: 'hair' });
  // neck kerchief
  front.push(FL([[-8, -330], [8, -324], [24, -326], [24, -318], [8, -315], [-8, -320]]));
  add([[-8, -329], [8, -323.5], [24, -325.5]], { w: 1.2, e: 'lan' });
  add([[-7, -320], [8, -315], [23, -318]], { w: 1.1, e: 'lan' });
  add([[22, -320], [30, -314], [27, -306]], { w: 0.9, e: 'lan' }), add([[23, -320], [34, -322], [38, -316]], { w: 0.9, e: 'lan' });
  // chest armour with two round mirror plates (明光铠)
  front.push(FL([[-22, -316], [36, -306], [40, -270], [32, -250], [-14, -252], [-24, -280]]));
  add([[-22, -316], [-24, -284], [-14, -254]], { w: 1.6, e: 'lan' });
  add([[34, -306], [39, -272], [32, -252]], { w: 1.6, e: 'lan' });
  add([[-18, -300], [4, -294], [24, -295], [37, -298]], { w: 1.3, e: 'lan' });
  add([[-18, -294], [4, -288], [24, -289], [38, -292]], { w: 0.8, e: 'iron', t: 0.8 });
  for (let row = 0; row < 3; row++) {
    const y = -280 + row * 11, xa = -20 + row * 2, xb = 37 - row * 2, n = 6;
    for (let j = 0; j < n; j++) {
      const x0 = lerp(xa, xb, j / n) + (row % 2) * 3, x1 = lerp(xa, xb, (j + 1) / n) + (row % 2) * 3;
      if (x1 > xb + 1) continue;
      add(arcPts((x0 + x1) / 2, y, (x1 - x0) / 2, 5, 0.15, Math.PI - 0.15, 6), { w: 0.55, e: 'hair', t: 0.8, dense: true });
    }
  }
  // armoured forearm (bracer) reaching to the staff
  front.push(FL([[44, -284], [57, -274], [64, -268], [62, -257], [52, -261], [40, -268]]));
  add([[44, -284], [56, -274], [64, -268]], { w: 1.3, e: 'lan' });
  add([[40, -268], [51, -262], [62, -258]], { w: 1.2, e: 'lan' });
  add([[50, -277], [47, -266]], { w: 0.6, e: 'hair' }), add([[56, -272], [54, -262]], { w: 0.6, e: 'hair' });
  // shoulder guards (披膊) with scalloped hems
  front.push(FL([[14, -322], [34, -320], [48, -310], [55, -294], [50, -280], [40, -286], [32, -298]]));
  add([[14, -322], [34, -320], [48, -310], [55, -294]], { w: 1.7, e: 'lan' });
  add([[55, -294], [52, -286], [47, -288], [44, -282], [39, -286], [34, -294], [30, -300]], { w: 1.2, e: 'lan' });
  add([[20, -316], [34, -313], [44, -303], [48, -293]], { w: 0.7, e: 'hair', t: 0.8 });
  add(spiral(36, -305, 4, 1.15, Math.PI * 0.2, 1, 0.75, 12), { w: 0.7, e: 'lan' });
  add([[-14, -322], [-30, -318], [-44, -306], [-48, -292], [-42, -286], [-36, -292]], { w: 1.5, e: 'lan' });
  // belt with a lion-mask buckle, armoured tassets with scale rows
  front.push(FL([[-28, -252], [40, -252], [46, -200], [48, -150], [-46, -150], [-36, -200]]));
  add([[-26, -251], [0, -247], [24, -247], [39, -251]], { w: 1.6, e: 'lan' });
  add([[-27, -241], [0, -237], [24, -237], [40, -241]], { w: 1.3, e: 'lan' });
  add(arcPts(25, -244, 6, 6.2, 0, Math.PI * 2, 14), { w: 1.0, e: 'iron', dense: true });
  add([[22, -245], [24, -243], [28, -245]], { w: 0.6, e: 'hair' });
  add([[40, -240], [45, -200], [48, -152]], { w: 1.6, e: 'lan' });
  add([[-28, -240], [-36, -200], [-46, -152]], { w: 1.6, e: 'lan' });
  add([[-46, -152], [-40, -147], [-34, -151], [-26, -146], [-18, -150], [-8, -145], [2, -149], [12, -145], [22, -149], [32, -145], [40, -150], [48, -152]], { w: 1.3, e: 'lan' });
  for (let row = 0; row < 5; row++) {
    const y = -226 + row * 15;
    const xa = lerp(-30, -44, (y + 240) / 90), xb = lerp(41, 47, (y + 240) / 90);
    const n = 7;
    for (let j = 0; j < n; j++) {
      const x0 = lerp(xa, xb, j / n) + (row % 2) * 4, x1 = lerp(xa, xb, (j + 1) / n) + (row % 2) * 4;
      if (x1 > xb + 1) continue;
      add(arcPts((x0 + x1) / 2, y, (x1 - x0) / 2, 6, 0.15, Math.PI - 0.15, 6), { w: 0.55, e: 'hair', t: 0.8, dense: true });
    }
  }
  // staff (two lines) with the halberd head and crossbar; the fist round it
  front.push(FL([[67, 4], [73, 4], [73, -628], [67, -628]]));
  add([[67, 4], [67, -626]], { w: 1.2, e: 'even' });
  add([[73, 4], [73, -626]], { w: 1.1, e: 'even' });
  front.push(FL([[70, -626], [65, -654], [70, -676], [75, -654]]));
  add([[70, -626], [65, -654], [70, -676], [75, -654], [70, -626]], { w: 1.2, e: 'iron', curv: 0.2 });
  add([[70, -630], [70, -668]], { w: 0.6, e: 'hair' });
  add([[73, -642], [86, -648], [93, -662], [84, -656], [74, -652]], { w: 1.1, e: 'iron' });
  add([[62, -624], [78, -624]], { w: 1.6, e: 'even' });
  add([[54, -610], [86, -610]], { w: 1.6, e: 'iron' });
  add(arcPts(54, -610, 2, 2, 0, Math.PI * 2, 8), { w: 0.8, e: 'even', dense: true });
  add(arcPts(86, -610, 2, 2, 0, Math.PI * 2, 8), { w: 0.8, e: 'even', dense: true });
  front.push(FL([[62, -270], [70, -274], [78, -270], [78, -256], [70, -252], [62, -257]]));
  add([[63, -268], [70, -273], [77.5, -269], [78, -257], [70, -252.5], [63, -257]], { w: 1.1, e: 'iron' });
  add([[64, -264.5], [77, -265]], { w: 0.5, e: 'hair' }), add([[64, -260.5], [77, -261]], { w: 0.5, e: 'hair' });

  const bk = [[-44, -150], [-56, -112], [-74, -72], [-98, -44], [-126, -32]];
  const fr = [[46, -150], [47, -110], [49, -72], [52, -40]];
  const folds = skirtFolds(bk, fr, [[0.15, 1, 21, 0.05, 1.6], [0.35, 5, 21, -0.05, 1.3], [0.55, 2, 21, 0.06, 1.5], [0.75, 7, 21, 0.04, 1.2], [0.9, 3, 21, -0.03, 1.3]], 22);
  const hem = hemLine(-126, 52, -36, 2.5, 'grdhem', 6);
  const slvN = [[58, -262], [62, -248], [56, -236], [46, -236], [40, -246], [44, -258]];
  return {
    id: 'grd', x0: 66, v: 3, ph: 3.1, lag: 0.06, gx: 40, gy: 9, Z: 1.12, front, back,
    live(u, under, over) {
      const F = this;
      const yL = (y) => clamp(smoothstep(-150, -30, y) ** 1.1);
      const bl = (pts, k = 1) => pts.map((p) => blow(p, yL(p[1]), u, F, k));
      // celestial sashes (天衣) from behind the shoulders
      for (const [k, p0, len, ph] of [[0, [-20, -318], 230, 0.2], [1, [-30, -300], 180, 1.9]]) {
        const C = sashChain(p0, len, 26, u, F, { rest0: Math.PI + 0.9, rest1: Math.PI / 2 + 0.6, gust0: Math.PI + 0.1, gust1: Math.PI - 0.08, amp: 0.65, amb: 0.22, ph, k: 7 });
        under.push({ ribbon: C, key: 'tianyi' + k, width: (s) => 9 * (1 - 0.35 * s), twist: (s) => 0.5 + s * 6 + ph, w: 1.2 });
      }
      // war robe below the tassets
      const B = bl(smoothPath(bk, 4)), Fr = bl(smoothPath(fr, 4)), H = bl(smoothPath(hem, 3));
      under.push(FL(B.concat(H.slice(1), Fr.slice().reverse(), [[0, -152]])));
      under.push(S(B, { w: 2.1, key: 'skB', dense: true }), S(Fr, { w: 1.9, key: 'skF', dense: true }));
      folds.forEach((f, k) => under.push(S(bl(f.pts), { w: f.w, key: 'skf' + k })));
      under.push(S(H, { w: 1.5, key: 'hem', dense: true }));
      under.push(S(bl([[-126, -32], [-140, -40], [-142, -52], [-132, -55], [-124, -46]], 1.1), { w: 1.3, key: 'hemcurl' }));
      // the near sleeve billows out from under the shoulder guard
      const sn = swingRot(slvN, [56, -266], 60, u, F, 0.7);
      over.push(FL(sn), S(sn, { w: 1.8, key: 'slvN' }), S(swingRot([[52, -258], [54, -246], [49, -238]], [56, -266], 60, u, F, 0.7), { w: 0.8, key: 'slvN2' }));
      // the banner on the halberd and its tassel
      const ban = sashChain([70, -606], 165, 24, u, F, { rest0: Math.PI / 2 - 0.02, rest1: Math.PI / 2 + 0.22, gust0: Math.PI - 0.2, gust1: Math.PI + 0.06, amp: 0.45, amb: 0.1, ph: 0.8, k: 6, speed: 1.1 });
      over.push({ ribbon: ban, key: 'banner', width: (s) => 26 * (1 - 0.25 * s), twist: (s) => 0.25 + s * 2.6 + 0.3 * Math.sin(u * 1.3), w: 1.5, cap0: true });
      const end = ban[ban.length - 1], pre = ban[ban.length - 2];
      const ea = Math.atan2(end[1] - pre[1], end[0] - pre[0]);
      for (const [k, off] of [[0, -6], [1, 6]]) {
        const p0 = [end[0] - Math.sin(ea) * off, end[1] + Math.cos(ea) * off];
        const C = sashChain(p0, 70, 12, u, F, { rest0: ea, rest1: Math.PI / 2 + 0.3, gust0: Math.PI - 0.05, gust1: Math.PI + 0.15 * (k ? 1 : -1), amp: 0.8, amb: 0.2, ph: 2 + k, k: 6, speed: 1.2 });
        over.push({ ribbon: C, key: 'bantail' + k, width: (s) => 7 * (1 - 0.5 * s), twist: (s) => 0.3 + s * 4 + k, w: 1.0 });
      }
      over.push(S([[56, -608], [84, -608]], { w: 1.2, e: 'iron', key: 'banrod' }));
      [[[8, -334], 30, 0.15], [[14, -331], 38, 0.05], [[20, -330], 40, 0], [[25, -332], 32, -0.08]].forEach(([p0, len, lean], k) => {
        const C = sashChain(p0, len, 8, u, F, { rest0: Math.PI / 2 + lean, rest1: Math.PI / 2 + lean + 0.25, gust0: Math.PI - 0.9, gust1: Math.PI - 0.5, amp: 0.4, amb: 0.1, ph: k, k: 5 });
        over.push(S(C, { w: k === 2 ? 0.9 : 0.65, e: 'hair', key: 'gbrd' + k }));
      });
      for (let k = 0; k < 4; k++) {
        const C = sashChain([66 + k * 2.5, -622], 26, 7, u, F, { rest0: Math.PI / 2 + 0.05 * k, rest1: Math.PI / 2 + 0.2, gust0: Math.PI - 0.5, gust1: Math.PI - 0.3, amp: 0.4, amb: 0.1, ph: k, k: 4 });
        over.push(S(C, { w: 0.5, e: 'hair', key: 'tassel' + k, dense: false }));
      }
    },
  };
}

// ---------------------------------------------------------------- the attendant child (童子) who points
const ARM = { piv: [18, -150], sleeve: [[0, -6], [16, -9], [32, -8], [37, 0], [34, 9], [22, 14], [8, 12], [0, 7]], hand: [[36, -4], [41, -5], [44, -1], [42, 3], [37, 3]], finger: [[41, -3.2], [53, -3.8]] };
function buildChild() {
  const front = [], back = [];
  const add = (pts, o) => front.push(S(pts, o));
  back.push(S([[-14, -36], [-14, -16]], { w: 1.2, e: 'iron' }), S([[-1, -36], [-2, -16]], { w: 1.1, e: 'iron' }));
  back.push(S([[7, -36], [9, -16]], { w: 1.2, e: 'iron' }), S([[21, -36], [22, -16]], { w: 1.1, e: 'iron' }));
  back.push(S([[-15, -16], [-18, -2], [-1, -2], [-1, -14]], { w: 1.1, e: 'iron' }), S([[8, -16], [7, -2], [27, -2], [24, -10], [22, -16]], { w: 1.1, e: 'iron' }));
  back.push(S([[-14, -22], [-2, -22]], { w: 0.7, e: 'iron' }), S([[9, -22], [22, -22]], { w: 0.7, e: 'iron' }));
  back.push(...footCloud(0, 80, 'child'));
  // head (big, round, shaven with two tufts)
  front.push(FL([[10, -198], [15, -193], [17, -187], [19, -182], [22, -178], [19, -176], [19, -173], [18, -170], [14, -166], [8, -158], [-5, -158], [-12, -170], [-15, -180], [-14, -190], [-8, -198], [2, -201]]));
  front.push(FL([[-9, -197], [-13, -205], [-9, -211], [-3, -208], [-3, -201]]), FL([[5, -201], [6, -209], [11, -213], [15, -208], [13, -201]]));
  add([[10, -198], [15, -193], [17, -187.5], [19, -182], [22.5, -178], [19.5, -176], [19.5, -173]], { w: 1.0, e: 'iron', t: 0.92 });
  add([[19.5, -173], [18, -169.5], [14, -166], [8, -164.5], [2, -165.5]], { w: 1.0, e: 'iron', t: 0.92 });
  add([[10, -198], [2, -201], [-8, -198], [-14, -190], [-15, -180], [-12, -170], [-6, -165]], { w: 1.3, e: 'lan' });
  add([[10.5, -184], [14, -185.6], [17.5, -184]], { w: 0.9, e: 'iron', t: 1 });
  add([[14.6, -185.1], [14.8, -183.4]], { w: 1.6, e: 'even', t: 1 });
  add([[10, -189], [13, -190.3], [16.5, -189.6]], { w: 0.6, e: 'hair' });
  add(arcPts(17.8, -171.2, 1.4, 1.1, 0, Math.PI * 2, 8), { w: 0.6, e: 'iron', dense: true });
  add([[-3, -183], [-7.5, -181], [-8, -175], [-4, -172.5]], { w: 0.8, e: 'iron' });
  add([[6, -199], [10, -196], [12, -191]], { w: 0.5, e: 'hair' }), add([[3, -199], [6, -195], [7, -191]], { w: 0.5, e: 'hair' });
  add([[-9, -197], [-13, -205], [-9, -211], [-3, -208], [-3, -201]], { w: 1.2, e: 'lan' });
  add([[5, -201], [6, -209], [11, -213], [15, -208], [13, -201]], { w: 1.2, e: 'lan' });
  add([[-11, -201], [-4, -203]], { w: 0.9, e: 'iron' }), add([[6, -204], [13, -205]], { w: 0.9, e: 'iron' });
  add([[-8, -209], [-5, -205]], { w: 0.4, e: 'hair' }), add([[9, -211], [11, -207]], { w: 0.4, e: 'hair' });
  add([[8, -165], [8, -158]], { w: 0.8, e: 'iron' }), add([[-4, -166], [-5, -158]], { w: 0.8, e: 'iron' });
  // round collar, shoulders, sash band
  front.push(FL([[-9, -160], [4, -155], [15, -160], [15, -154], [4, -149], [-9, -154]]));
  add([[-9, -159], [4, -154.5], [15, -159]], { w: 1.2, e: 'lan' });
  add([[-9, -154], [4, -149.5], [15, -154]], { w: 1.0, e: 'lan' });
  add([[-8, -157], [-20, -151], [-27, -140]], { w: 1.5, e: 'lan' });
  front.push(FL([[-22, -124], [24, -124], [24, -114], [-22, -114]]));
  add([[-22, -123], [2, -120], [24, -123]], { w: 1.3, e: 'lan' });
  add([[-22, -115], [2, -112], [24, -115]], { w: 1.1, e: 'lan' });
  add([[4, -121], [-2, -127], [-5, -121], [3, -116]], { w: 0.8, e: 'iron' });
  const bk = [[-22, -116], [-32, -80], [-48, -34]], fr = [[24, -116], [29, -80], [32, -34]];
  const folds = skirtFolds(bk, fr, [[0.2, 1, 13, 0.05, 1.3], [0.45, 3, 13, -0.06, 1.1], [0.7, 1, 13, 0.05, 1.2], [0.88, 4, 13, 0.03, 1.0]], 14);
  const hem = hemLine(-48, 32, -33, 2, 'chhem', 4);
  const torsoL = [[-20, -152], [-24, -134], [-22, -118]], torsoR = [[14, -156], [22, -140], [24, -120]];
  const slvF = [[-24, -146], [-30, -116], [-36, -94], [-24, -90], [-16, -104], [-18, -132]];
  return {
    id: 'child', x0: 915, v: 1.5, ph: 4.4, lag: -0.06, gx: 26, gy: 7, Z: 1.12, front, back,
    live(u, under, over, ctx) {
      const F = this;
      const yL = (y) => clamp(smoothstep(-118, -32, y));
      const bl = (pts, k = 1) => pts.map((p) => blow(p, yL(p[1]), u, F, k));
      for (const [k, x, ph] of [[0, -9, 0.2], [1, 12, 1.4]]) {
        const C = sashChain([x, -203], 30, 7, u, F, { rest0: Math.PI / 2 + 0.6, rest1: Math.PI / 2 + 0.3, gust0: Math.PI - 0.1, gust1: Math.PI + 0.1, amp: 0.6, amb: 0.25, ph, k: 5 });
        under.push({ ribbon: C, key: 'tuft' + k, width: (s) => 3 * (1 - 0.4 * s), twist: (s) => s * 5 + ph, w: 0.7 });
      }
      const fsl = swingRot(slvF, [-22, -146], 60, u, F, 0.5);
      under.push(FL(fsl), S(fsl, { w: 1.4, key: 'slvF' }));
      under.push(FL(torsoL.concat(torsoR.slice().reverse())), S(torsoL, { w: 1.4, key: 'trL' }), S(torsoR, { w: 1.4, key: 'trR' }));
      const B = bl(smoothPath(bk, 4)), Fr = bl(smoothPath(fr, 4)), H = bl(smoothPath(hem, 3));
      under.push(FL(B.concat(H.slice(1), Fr.slice().reverse())));
      under.push(S(B, { w: 1.7, key: 'skB', dense: true }), S(Fr, { w: 1.6, key: 'skF', dense: true }));
      folds.forEach((f, k) => under.push(S(bl(f.pts), { w: f.w, key: 'skf' + k })));
      under.push(S(H, { w: 1.3, key: 'hem', dense: true }));
      for (const [k, len, ph] of [[0, 70, 0.3], [1, 56, 1.9]]) {
        const C = sashChain([2 + k * 4, -118], len, 12, u, F, { rest0: Math.PI / 2, rest1: Math.PI / 2 + 0.3, gust0: Math.PI / 2 + 0.8, gust1: Math.PI - 0.2, amp: 0.6, amb: 0.15, ph, k: 6 });
        over.push({ ribbon: C, key: 'tie' + k, width: (s) => 4.5 * (1 - 0.3 * s), twist: (s) => s * 5 + ph, w: 0.9 });
      }
      // the pointing arm
      const a = F.armAngle;
      const c = Math.cos(a), s = Math.sin(a);
      const R = (p) => [ARM.piv[0] + p[0] * c - p[1] * s, ARM.piv[1] + p[0] * s + p[1] * c];
      // the sleeve hangs: its lower edge sags toward the ground whatever the arm does
      const sag = (p) => { const q = R(p); return p[1] > 0 ? [q[0], q[1] + p[1] * 0.35 * Math.max(0, c)] : q; };
      const sl = ARM.sleeve.map(sag);
      over.push(FL(sl), S(sl.slice(0, 4), { w: 1.4, key: 'armT' }), S(sl.slice(3).concat([sl[0]]), { w: 1.3, key: 'armB' }));
      over.push(FL(ARM.hand.map(R)), S(ARM.hand.map(R), { w: 0.9, e: 'iron', key: 'hand' }), S(ARM.finger.map(R), { w: 1.5, e: 'iron', key: 'finger' }));
    },
  };
}

// ---------------------------------------------------------------- the scarf (披帛)
// One polyline of N points (index 0 = front end, N−1 = back end). Config A: on the lady
// (her local coords → panel); config B: lassoed round the pelican's neck, streaming.
const SC = { n1: 18, nm: 16, n2: 30, ds: 10 };
SC.N = SC.n1 + SC.nm + SC.n2;
const SCARF_MID = resample([[47, -244], [40, -262], [31, -284], [14, -297], [-4, -301], [-22, -295], [-34, -281], [-42, -262], [-48, -244]], SC.nm);
const SCARF_HIDE = SCARF_MID.map((p) => p[0] > -11 && p[0] < 12 && p[1] < -293);

function scarfOnLady(u, F) {
  const e1 = sashChain(SCARF_MID[0], SC.n1 * SC.ds, SC.n1 + 1, u, F, { rest0: Math.PI / 2 + 0.02, rest1: Math.PI / 2 + 0.6, gust0: Math.PI - 0.7, gust1: Math.PI - 0.05, amp: 0.7, amb: 0.16, ph: 0.6, k: 6 });
  // the back end streams behind her — toward whatever comes up from behind
  const e2 = sashChain(SCARF_MID[SC.nm - 1], SC.n2 * SC.ds, SC.n2 + 1, u, F, { rest0: Math.PI / 2 + 0.62, rest1: Math.PI + 0.75, gust0: Math.PI - 0.15, gust1: Math.PI + 0.1, amp: 0.55, amb: 0.3, ph: 2.1, k: 4.5 });
  const pts = [];
  for (let i = SC.n1; i >= 1; i--) pts.push(e1[i]);
  pts.push(...SCARF_MID);
  for (let i = 1; i <= SC.n2; i++) pts.push(e2[i]);
  const hide = pts.map((_, i) => (i >= SC.n1 && i < SC.n1 + SC.nm ? SCARF_HIDE[i - SC.n1] : false));
  return { pts: pts.map(F.T), hide };
}

/** neck frame of the placed rider: point, tangent (toward the head), back normal, half width */
function neckFrame(P, f) {
  const sp = P.bird.neckSpine;
  const i = Math.round(f * (sp.length - 1));
  const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = P.place?.scale ?? 1;
  return { c: sp[i], t, nb: [t[1], -t[0]], hw: lerp(15, 9.5, f) * s };
}

function scarfOnPelican(u, P) {
  const N = SC.N, nl = 10, ns = 7;
  const nf = neckFrame(P, 0.32);
  const r = nf.hw + 2.5;
  const knot = [nf.c[0] + nf.nb[0] * r, nf.c[1] + nf.nb[1] * r];
  const ph = flutPh(u) * 1.2;
  const g = windU(u);
  const pts = new Array(N), hide = new Array(N).fill(false), front = new Array(N).fill(false);
  const i0 = N - ns - nl;
  for (let k = 0; k < nl; k++) {
    const a = (k / nl) * Math.PI * 2;
    pts[i0 + k] = [nf.c[0] + nf.nb[0] * r * Math.cos(a) - nf.t[0] * 5 * Math.sin(a), nf.c[1] + nf.nb[1] * r * Math.cos(a) - nf.t[1] * 5 * Math.sin(a)];
    if (Math.sin(a) < -0.05) hide[i0 + k] = true; else if (Math.sin(a) > 0.2) front[i0 + k] = true;
  }
  const st = chain(knot, ns + 1, SC.ds, (s) => Math.PI - 0.35 - 0.2 * s + (0.3 + 0.8 * s) * Math.sin(ph * 1.15 - s * 8.8 + 1.2) * (0.4 + 0.6 * g));
  for (let k = 0; k < ns; k++) pts[N - ns + k] = st[k + 1];
  // the long end streams back in great travelling loops
  // (it rises up and back into the open sky above the procession)
  const lt = chain(knot, i0 + 1, SC.ds * 0.9, (s) => Math.PI + 1.38 - 1.05 * s ** 0.75 + (0.35 + 0.8 * s) * Math.sin(ph - s * 8.2) * (0.35 + 0.65 * g) + 0.2 * s * Math.sin(ph * 0.5 - s * 4 + 1));
  for (let k = 0; k < i0; k++) pts[i0 - 1 - k] = lt[k + 1];
  return { pts, hide, front, root: i0 };
}

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** where the scarf is at time u, which samples are hidden, and who draws it */
function scarfState(u, ctx) {
  const A = scarfOnLady(u, LADY);
  const tOff = 2.46, tBack = 4.02;
  if (u < tOff || u > tBack + 0.9 || !ctx.rider.visible) return { pts: A.pts, hide: A.hide, owner: 'lady' };
  // The back end sweeps across the pelican's neck in the gust and catches there; the rest is
  // whipped off her shoulders. Both shapes are angle chains rooted at the knot, so the morph
  // keeps the cloth's length: every segment turns from its A angle to its B angle, nearest
  // the knot first (and lets go in the same order when the gust drops).
  const B = scarfOnPelican(u, ctx.rider.placed);
  const N = SC.N, r = B.root;
  const tau = (d) => smootherstep(tOff + 0.006 * d, tOff + 0.006 * d + 0.24, u) * (1 - smootherstep(tBack + 0.005 * d, tBack + 0.005 * d + 0.5, u));
  const seg = (P, i) => [Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]), Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1])];
  const pts = new Array(N);
  const tr = tau(0);
  pts[r] = [lerp(A.pts[r][0], B.pts[r][0], tr), lerp(A.pts[r][1], B.pts[r][1], tr)];
  const step = (i, t) => {
    const [aA, lA] = seg(A.pts, i), [aB, lB] = seg(B.pts, i);
    const th = aA + wrapA(aB - aA) * t, L = lerp(lA, lB, t);
    return [Math.cos(th) * L, Math.sin(th) * L];
  };
  for (let i = r; i < N - 1; i++) { const d = step(i, tau(i + 0.5 - r)); pts[i + 1] = [pts[i][0] + d[0], pts[i][1] + d[1]]; }
  for (let i = r - 1; i >= 0; i--) { const d = step(i, tau(r - i - 0.5)); pts[i] = [pts[i + 1][0] - d[0], pts[i + 1][1] - d[1]]; }
  const hide = [], front = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const t = tau(Math.abs(i - r));
    hide.push(t < 0.5 ? A.hide[i] : B.hide[i]);
    front.push(t > 0.9 && B.front[i]);
    sum += t;
  }
  return { pts, hide, front, owner: sum / N > 0.02 ? 'pelican' : 'lady' };
}
const scarfWidth = (s) => 24 * (0.4 + 0.6 * smoothstep(0, 0.06, s)) * (0.5 + 0.5 * smoothstep(1, 0.92, s));
function drawScarf(K, st, u, which) {
  const vis = st.hide.map((h, i) => (which === 'front' ? !!st.front[i] : !h));
  if (which === 'front') drawRibbon(K, 'scarffront', st.pts, { width: () => 9, twist: () => 0, w: 1.8, t: 0.96, vis, cap: false });
  else drawRibbon(K, 'scarfback', st.pts, { width: scarfWidth, twist: (s) => s * Math.PI * 2 * 1.7 - u * 3.0 + 0.7, w: 2.3, t: 0.96, vis, maxSeg: 18, cap0: true });
}

// ---------------------------------------------------------------- peony petals torn from the tray by the gust
const PETALS = Array.from({ length: 7 }, (_, k) => {
  const r = rng(hash(ID, 'petal', k));
  return { r0: 2.0 + k * 0.07 + r() * 0.05, dx: r() * 30 - 10, dy: -r() * 25, A: 150 + r() * 90, fall: 18 + r() * 14, a0: r() * 6, spin: 4 + r() * 4, s: 6 + r() * 3, ph: r() * 6 };
});
function drawPetals(K, u) {
  PETALS.forEach((P, k) => {
    if (u < P.r0) return;
    const T = LADY.T, at = LADY.X(P.r0) - LADY.X(u);           // released from where the tray was
    const o = T([62 + P.dx, -286 + P.dy]);
    const G = gustInt(u) - gustInt(P.r0);
    const x = o[0] + at - P.A * G;
    const yFree = o[1] + P.fall * (u - P.r0) + 26 * (u - P.r0) ** 2 * 0.25 - 14 * Math.sin(Math.min(G, 2.4) * 2.2 + P.ph);
    const landed = yFree >= ROAD - 3;
    const y = Math.min(yFree, ROAD - 3);
    const a = P.a0 + P.spin * Math.min(G, 2.6);
    const sq = landed ? 0.35 : 0.55 + 0.35 * Math.sin(a * 1.3);
    const pts = [];
    for (let j = 0; j <= 9; j++) {
      const t = (j / 9) * Math.PI * 2;
      const rr = P.s * (0.55 + 0.45 * Math.cos(t / 2) ** 2) * (1 + 0.15 * Math.sin(t * 3));
      const px = Math.cos(t) * rr, py = Math.sin(t) * rr * sq;
      pts.push([x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]);
    }
    poly(K, 'petalf' + k, pts, FILL);
    ln(K, 'petal' + k, pts, { w: 0.85, t: 0.9, e: 'iron', curv: 0.5 });
  });
}

// ================================================================== clouds
/** a cloud cluster (朵云): three double-lined lobes with curls inside, a flowing base drawn out into a hooked tail */
function cloudCluster(add, cx, cy, s, dir, tail, seed) {
  const r = rng(hash(ID, 'cc', seed));
  const M = (pts) => pts.map(([x, y]) => [cx + dir * x * s, cy + y * s]);
  const lobe = (x, y, rad, a0, a1, w) => {
    add(M(arcPts(x, y, rad, rad * 0.92, a0, a1, 14)), { w, e: 'lan', dense: false });
    add(M(arcPts(x, y + rad * 0.06, rad * 0.74, rad * 0.68, a0 + 0.25, a1 - 0.35, 10)), { w: w * 0.5, e: 'hair', t: 0.75 });
  };
  lobe(-44, -10, 12, Math.PI * 0.95, Math.PI * 1.85, 1.4);
  lobe(-19, -22, 16, Math.PI * 1.0, Math.PI * 1.88, 1.6);
  lobe(12, -18, 21, Math.PI * 1.02, Math.PI * 2.32, 1.9);
  add(M(spiral(12, -16, 12, 1.2, Math.PI * 0.3, -1, 0.78, 26)), { w: 1.5, e: 'lan' });
  add(M(spiral(-20, -20, 8, 1.1, Math.PI * 0.35, -1, 0.75, 20)), { w: 1.2, e: 'lan' });
  const L = tail;
  add(M([[28, -6], [20, 2], [0, 6], [-30, 7], [-62, 5], [-L * 0.62, 3 + r() * 3], [-L * 0.86, -2], [-L, -12], [-L * 0.97, -21], [-L * 0.9, -19]]), { w: 1.6, e: 'lan' });
  add(M([[12, 12], [-20, 14], [-60, 13], [-L * 0.6, 10], [-L * 0.8, 6], [-L * 0.88, 0]]), { w: 1.0, e: 'hair', t: 0.78 });
  add(M([[-50, -2], [-L * 0.5, -3], [-L * 0.72, -7]]), { w: 0.6, e: 'hair', t: 0.65 });
}

/** the cloud road: scalloped top edge resting at y = 800, rows of rolling scroll curls below */
function paintRoad(add) {
  const r = rng(hash(ID, 'road'));
  let x = -16, k = 0;
  while (x < 1016) {
    const w = 64 + r() * 46;
    const x1 = Math.min(1018, x + w);
    const arc = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; arc.push([lerp(x, x1, t), ROAD + 1 + 6 * (1 - Math.sin(Math.PI * t)) ** 1.6]); }
    add(arc, { w: 1.8, e: 'lan', t: 0.92 });
    if (r() < 0.7) add(arc.slice(1, 8).map((p) => [p[0], p[1] + 7 + r() * 2]), { w: 0.8, e: 'hair', t: 0.7 });
    x = x1; k++;
  }
  // the body of the bank: scroll curls with double lines, their tails flowing back into the next
  const unit = (cx, cy, R, tailL, t, key) => {
    const rr = rng(hash(ID, 'unit', key));
    const wv = 4 + rr() * 5;
    const curl = spiral(cx, cy, R, 1.25, Math.PI / 2, -1, 0.74, 26);
    add([[cx - tailL, cy - R * 0.2], [cx - tailL * 0.78, cy + R * 0.5 + wv], [cx - tailL * 0.5, cy + R * 1.25 + wv * 0.4], [cx - tailL * 0.22, cy + R * 0.85], [cx - R * 0.35, cy + R * 1.0]].concat(curl.slice(1)), { w: 1.7, e: 'lan', t, seg: 4 });
    const curl2 = spiral(cx, cy, R * 0.66, 0.9, Math.PI / 2 + 0.35, -1, 0.6, 18);
    add([[cx - tailL * 0.72, cy - R * 0.1], [cx - tailL * 0.48, cy + R * 0.75 + wv * 0.5], [cx - tailL * 0.2, cy + R * 0.45], [cx - R * 0.5, cy + R * 0.68]].concat(curl2.slice(1)), { w: 0.9, e: 'hair', t: t * 0.85, seg: 4 });
    add([[cx - tailL * 0.9, cy + R * 1.2], [cx - tailL * 0.6, cy + R * 1.85 + wv * 0.5], [cx - tailL * 0.25, cy + R * 1.5], [cx + R * 0.6, cy + R * 1.3]], { w: 1.2, e: 'lan', t: t * 0.9 });
  };
  [[64, 830, 15, 118], [246, 834, 17, 132], [430, 829, 15, 124], [612, 833, 17, 134], [800, 830, 15, 126], [984, 833, 16, 130]].forEach(([x, y, R, L], j) => unit(x + (r() - 0.5) * 14, y, R, L, 0.9, 'a' + j));
  // the soft underside of the bank: drooping scallops, a few trailing wisps
  let xb = -12;
  while (xb < 1012) {
    const w = 80 + r() * 50, x1 = xb + w, pts = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; pts.push([lerp(xb, x1, t), 872 + Math.sin(Math.PI * t) * (9 + r() * 2)]); }
    add(pts, { w: 1.3, e: 'lan', t: 0.8 });
    if (r() < 0.6) add(pts.slice(2, 7).map((p) => [p[0] + 4, p[1] - 6]), { w: 0.7, e: 'hair', t: 0.6 });
    xb = x1 - 4;
  }
  [[150, 905, 120], [470, 912, 150], [800, 902, 130]].forEach(([x, y, L], j) => {
    add([[x, y], [x - L * 0.4, y + 4 + r() * 3], [x - L * 0.8, y + 2], [x - L, y - 4]], { w: 0.9, e: 'hair', t: 0.62 });
    add(spiral(x + 6, y - 7, 7, 1.0, Math.PI / 2, -1, 0.7, 14), { w: 0.9, e: 'lan', t: 0.62 });
  });
}
const SKY = [
  { x: 585, y: 196, s: 1.25, dir: 1, tail: 190, seed: 'a' },
  { x: 330, y: 92, s: 0.8, dir: -1, tail: 150, seed: 'b' },
  { x: 770, y: 84, s: 0.7, dir: 1, tail: 140, seed: 'c' },
];

// ================================================================== the pelican in pure line
function circlePts(c, r, n = 24, a0 = -Math.PI / 2, span = Math.PI * 2) {
  const out = [];
  for (let k = 0; k <= n; k++) { const a = a0 + (span * k) / n; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return out;
}
function contour(K, key, pts, o, cut = 0.5) {
  const n = pts.length, c = Math.floor(n * cut);
  ln(K, key + 'a', pts.slice(0, c + 2), o);
  ln(K, key + 'b', pts.slice(c).concat(pts.slice(0, 2)), { ...o, w: (o.w ?? 1.4) * 0.9 });
}
function drawPelican(K, u, ctx, scarf) {
  const P = ctx.rider.placed;
  const s = P.place.scale ?? 1;
  const g = windU(u);
  const B = P.bike, R = P.bird;
  const fine = { w: 1.25 * s, t: 0.9, e: 'iron' };
  const W = (pts, key) => poly(K, 'pel' + key, pts, BIRD_WHITE);
  // far leg (behind the bike)
  W(R.legFar.poly, 'lf');
  contour(K, 'legF', R.legFar.poly, { w: 1.0 * s, t: 0.6, e: 'iron' });
  W(R.legFar.web, 'wf');
  ln(K, 'footF', R.legFar.web.concat([R.legFar.web[0]]), { w: 0.9 * s, t: 0.6, e: 'iron', dense: true, curv: 0.2 });
  ln(K, 'crankF', [B.crank.bb, B.crank.far], { w: 1.4 * s, t: 0.65, e: 'even' });
  // wheels: tyre as two overlapping arcs, rim, hair-fine spokes
  B.wheels.forEach((wh, k) => {
    ln(K, `tyre${k}a`, circlePts(wh.c, wh.r, 26, -Math.PI * 0.62, Math.PI * 1.15), { w: 1.9 * s, t: 0.92, e: 'lan', dense: true });
    ln(K, `tyre${k}b`, circlePts(wh.c, wh.r, 26, Math.PI * 0.45, Math.PI * 1.02), { w: 1.7 * s, t: 0.92, e: 'lan', dense: true });
    ln(K, `rim${k}`, circlePts(wh.c, wh.r * 0.9, 26, 0.3, Math.PI * 2), { w: 0.7 * s, t: 0.7, e: 'even', dense: true });
    for (let j = 0; j < wh.spokes; j++) {
      const a = wh.angle + (j * Math.PI * 2) / wh.spokes;
      K.seed(ID, 'spk', k, j);
      K.brush.set('tang.hair', tone(0.6), 0.45 * s);
      K.brush.line(wh.c[0], wh.c[1], wh.c[0] + Math.cos(a) * wh.r * 0.88, wh.c[1] + Math.sin(a) * wh.r * 0.88);
    }
    ln(K, `hub${k}`, circlePts(wh.c, 3.5 * s, 10), { w: 0.9 * s, t: 0.9, e: 'even', dense: true });
  });
  ln(K, 'chain', B.chain.concat([B.chain[0]]), { w: 0.6 * s, t: 0.6, e: 'even', dense: true, curv: 0.1 });
  for (const [name, seg] of Object.entries(B.tubes)) ln(K, 'tube' + name, seg, { ...fine, w: 1.45 * s });
  ln(K, 'fork', B.fork, { ...fine, w: 1.45 * s, dense: true });
  ln(K, 'stem', B.stem, fine);
  ln(K, 'bars', B.bars, { ...fine, dense: true });
  ln(K, 'seatpost', B.seatpost, fine);
  ln(K, 'saddle', B.saddle, { w: 2.4 * s, t: 0.95, e: 'lan', dense: true });
  ln(K, 'ring', circlePts(B.crank.bb, B.crank.ring, 16), { w: 0.8 * s, t: 0.8, e: 'even', dense: true });

  // the scarf behind the bird: the streaming ends and the far arc of the neck loop
  if (scarf) drawScarf(K, scarf, u, 'back');

  // the bird: untouched white silk inside fine modulated contours
  [R.tail, R.body, R.wing, R.neck, R.pouch, R.upperBill].forEach((pp, k) => W(pp, 'b' + k));
  W(circlePts(R.head.c, R.head.r, 18), 'head');
  contour(K, 'tail', R.tail, { w: 1.2 * s, t: 0.9, e: 'lan' }, 0.5);
  const bd = R.body, nb = bd.length;
  ln(K, 'back', bd.slice(Math.floor(nb * 0.55), nb).concat(bd.slice(0, 3)), { w: 1.6 * s, t: 0.92, e: 'lan', dense: true });
  ln(K, 'belly', bd.slice(2, Math.floor(nb * 0.6)), { w: 1.5 * s, t: 0.9, e: 'lan', dense: true });
  const wg = R.wing;
  ln(K, 'wingTop', wg.slice(0, Math.floor(wg.length * 0.5)), { w: 1.4 * s, t: 0.9, e: 'lan', dense: true });
  ln(K, 'wingBot', wg.slice(Math.floor(wg.length * 0.45)), { w: 1.3 * s, t: 0.9, e: 'lan', dense: true });
  const bc = R.bodyC;
  for (let k = 0; k < 4; k++) {
    const cx = bc[0] - 34 * s + k * 13 * s, cy = bc[1] - 6 * s + k * 1.5 * s;
    ln(K, 'cov' + k, arcPts(cx, cy, 7 * s, 5 * s, 0.2, Math.PI - 0.2, 6), { w: 0.75 * s, t: 0.8, e: 'hair', dense: true });
  }
  for (let k = 0; k < 3; k++) {
    const y0 = bc[1] + 4 * s + k * 3 * s;
    ln(K, 'sec' + k, [[bc[0] + (6 - k * 4) * s, y0], [bc[0] - (24 + k * 6) * s, y0 - 2 * s], [bc[0] - (46 + k * 3) * s, y0 - 6 * s]], { w: 0.65 * s, t: 0.75, e: 'hair' });
  }
  ln(K, 'secondaries', R.secondaries, { w: 2.6 * s, t: 1, e: 'lan', dense: true });
  R.primaries.forEach((f, k) => ln(K, 'prim' + k, f, { w: (3.2 - k * 0.25) * s, t: 1, e: 'lan', dense: true }));
  const nk = R.neck, nn = nk.length / 2;
  ln(K, 'neckA', nk.slice(0, nn), { w: 1.4 * s, t: 0.9, e: 'lan', dense: true });
  ln(K, 'neckB', nk.slice(nn), { w: 1.3 * s, t: 0.9, e: 'lan', dense: true });
  const sp = R.neckSpine;
  ln(K, 'neckF', [sp[3], sp[6], sp[8]].map((p) => [p[0] - 4 * s, p[1]]), { w: 0.5 * s, t: 0.65, e: 'hair' });
  ln(K, 'headA', circlePts(R.head.c, R.head.r, 16, Math.PI * 0.45, Math.PI * 1.35), { w: 1.4 * s, t: 0.92, e: 'lan', dense: true });
  ln(K, 'headB', circlePts(R.head.c, R.head.r, 10, -Math.PI * 0.35, Math.PI * 0.5), { w: 1.1 * s, t: 0.9, e: 'lan', dense: true });
  R.crest.forEach((c, k) => ln(K, 'crest' + k, [c[0], [lerp(c[0][0], c[1][0], 0.5), lerp(c[0][1], c[1][1], 0.5) - 1.5 * s], c[1]], { w: 0.75 * s, t: 0.9, e: 'hair' }));
  const ub = R.upperBill;
  ln(K, 'billTop', ub.slice(0, 5), { w: 1.4 * s, t: 0.92, e: 'lan', dense: true, curv: 0.2 });
  ln(K, 'billLow', ub.slice(4).concat([ub[0]]), { w: 1.0 * s, t: 0.85, e: 'iron', dense: true, curv: 0.2 });
  const pc = R.pouch;
  ln(K, 'pouch', pc.slice(0, Math.floor(pc.length * 0.62)), { w: 1.5 * s, t: 0.9, e: 'lan', dense: true });
  poly(K, 'nail', R.nail, tone(1));
  const E = R.eye;
  if (E.mode === 'closed') ln(K, 'eyeShut', [[E.c[0] - E.r, E.c[1]], [E.c[0], E.c[1] + 1.2 * s], [E.c[0] + E.r, E.c[1]]], { w: 1 * s, t: 1, e: 'iron' });
  else {
    ln(K, 'eyeO', circlePts(E.c, E.r, 12, Math.PI, Math.PI * 1.9), { w: 0.9 * s, t: 0.95, e: 'iron', dense: true });
    poly(K, 'pupil', circlePts(E.pupil, E.r * (E.mode === 'white' ? 0.35 : 0.5), 8), tone(1));
  }
  // in the gust (only inside (1, 5)): streaming crest plumes, long tail feathers, ruffled back
  if (g > 0.01) {
    const ph = flutPh(u);
    const hc = R.head.c;
    for (let k = 0; k < 4; k++) {
      const C = chain([hc[0] - 10 * s, hc[1] - 6 * s + k * 3 * s], 9, (5 + k * 1.6) * s * g, (q) => Math.PI + 0.2 - k * 0.12 + 0.5 * q * Math.sin(ph * 1.6 - q * 5 + k));
      ln(K, 'plume' + k, C, { w: 0.6 * s, t: 0.9, e: 'hair', dense: true });
    }
    const tb = R.tail[1];
    for (let k = 0; k < 3; k++) {
      const C = chain([tb[0] + 4 * s, tb[1] + k * 4 * s], 8, 4.5 * s * g, (q) => Math.PI - 0.15 + k * 0.12 + 0.45 * q * Math.sin(ph * 1.3 - q * 4 + k * 2));
      ln(K, 'tailp' + k, C, { w: 0.8 * s, t: 0.9, e: 'hair', dense: true });
    }
    for (let k = 0; k < 3; k++) {
      const b = bd[Math.floor(nb * (0.62 + k * 0.07))];
      ln(K, 'ruff' + k, [b, [b[0] - 7 * s * g, b[1] - 4 * s * g - Math.sin(ph * 2 + k) * 2 * s]], { w: 0.7 * s, t: 0.85, e: 'flick' });
    }
  }
  // near leg, foot, crank, pedal
  W(R.legNear.poly, 'ln');
  contour(K, 'legN', R.legNear.poly, { w: 1.2 * s, t: 0.9, e: 'iron' });
  W(R.legNear.web, 'wn');
  ln(K, 'footN', R.legNear.web.concat([R.legNear.web[0]]), { w: 1.0 * s, t: 0.9, e: 'iron', dense: true, curv: 0.2 });
  ln(K, 'crankN', [B.crank.bb, B.crank.near], { w: 1.8 * s, t: 0.95, e: 'even' });
  ln(K, 'pedal', [[B.crank.near[0] - 6 * s, B.crank.near[1]], [B.crank.near[0] + 6 * s, B.crank.near[1]]], { w: 2.6 * s, t: 1, e: 'even' });
  // the near arc of the loop goes over the neck
  if (scarf) drawScarf(K, scarf, u, 'front');
}

// ================================================================== paper, inscription, seal
function paperLayer(K) {
  return K.layer(`${ID}:paper`, 1000, 1000, (ctx) => {
    const W = 1000, H = 1000;
    const img = ctx.createImageData(W, H);
    const r = rng(hash(ID, 'paper'));
    const base = hex(PAPER);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const big = fbm(x / 210, y / 210, 41, 3) - 0.5;
        const mid = fbm(x / 26, y / 34, 42, 2) - 0.5;
        const g = r() - 0.5;
        const ex = Math.min(x, W - x, y, H - y);
        const edge = Math.max(0, 1 - ex / 110) ** 2;
        const v = big * 13 + mid * 5 + g * 5 - edge * 13;
        const k = (x + y * W) * 4;
        img.data[k] = base[0] + v * 0.9;
        img.data[k + 1] = base[1] + v;
        img.data[k + 2] = base[2] + v * 1.25;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // silk-like fibres, a few foxing spots, and two faint mounting creases
    ctx.save();
    for (let k = 0; k < 70; k++) {
      const x = r() * W, y = r() * H, L = 10 + r() * 40, a = r() * Math.PI * 2;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(120,95,55,0.07)' : 'rgba(255,252,240,0.18)';
      ctx.lineWidth = 0.5 + r() * 0.7;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * L * 0.5, y + Math.sin(a + 0.5) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
    for (let k = 0; k < 7; k++) {
      const x = r() * W, y = r() * H, rad = 3 + r() * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(150,105,50,0.10)'); g.addColorStop(1, 'rgba(150,105,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    for (const x of [333, 667]) {
      const gr = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
      gr.addColorStop(0, 'rgba(120,90,50,0)'); gr.addColorStop(0.5, 'rgba(120,90,50,0.035)'); gr.addColorStop(1, 'rgba(120,90,50,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 4, 0, 8, H);
    }
    ctx.restore();
  });
}

function inscriptionLayer(K) {
  const W = 300, H = 640;              // px at 2 px/unit (150 × 320 units)
  return K.layer(`${ID}:inscr`, W, H, (ctx) => {
    const cols = [
      { text: '唐人白描', size: 76, x: W - 50, y: 12, t: 0.97, wt: 600 },
      { text: '约公元七五〇年', size: 54, x: W - 128, y: 40, t: 0.88, wt: 500 },
      { text: '吴带当风', size: 54, x: W - 194, y: 40, t: 0.86, wt: 500 },
    ];
    const r = rng(hash(ID, 'inscr'));
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tc = tmp.getContext('2d');
    for (const c of cols) {
      [...c.text].forEach((ch, k) => {
        const load = 1 - 0.12 * (k / c.text.length) + (r() - 0.5) * 0.06;    // the brush dries down the column
        const col = hex(tone(c.t * load));
        tc.save();
        tc.translate(c.x + (r() - 0.5) * 2.4, c.y + c.size * 1.08 * k + c.size * 0.5 + (r() - 0.5) * 2);
        tc.rotate((r() - 0.5) * 0.05);
        tc.font = `${c.wt} ${c.size * (0.95 + r() * 0.07)}px "Kaiti SC", "STKaiti", serif`;
        tc.textAlign = 'center'; tc.textBaseline = 'middle';
        tc.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        tc.fillText(ch, 0, 0);
        // a second, slightly offset pass thickens the strokes like a soft brush
        tc.globalAlpha = 0.5;
        tc.fillText(ch, 0.6, 0.4);
        tc.restore();
      });
    }
    // ink bleeding into the fibres, then dry-brush erosion along the strokes
    ctx.save();
    ctx.filter = 'blur(1.4px)'; ctx.globalAlpha = 0.4; ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none'; ctx.globalAlpha = 0.95; ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    const id = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (x + y * W) * 4;
      if (!id.data[k + 3]) continue;
      const n = fbm(x / 3.2, y / 7, 77, 2);
      id.data[k + 3] *= clamp(0.55 + (n - 0.3) * 1.6, 0.35, 1);
    }
    ctx.putImageData(id, 0, 0);
  });
}
function sealLayer(K) {
  const size = 120;
  return K.layer(`${ID}:seal`, size, size, (ctx) => {
    const r = rng(hash(ID, 'seal'));
    const m = 6;
    ctx.fillStyle = SEAL_RED;
    ctx.beginPath();
    ctx.moveTo(m + r() * 2, m + r() * 2); ctx.lineTo(size - m - r() * 2, m + r() * 2);
    ctx.lineTo(size - m - r() * 2, size - m - r() * 2); ctx.lineTo(m + r() * 2, size - m - r() * 2);
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.font = `700 ${size * 0.4}px "Libian SC", "Kaiti SC", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // white-cut characters, read right column first: 鹈鹕 / 骑行
    [['鹈', 0.72, 0.29], ['鹕', 0.72, 0.71], ['骑', 0.28, 0.29], ['行', 0.28, 0.71]].forEach(([c, x, y]) => ctx.fillText(c, size * x, size * y));
    for (let k = 0; k < 500; k++) {
      ctx.globalAlpha = 0.2 + r() * 0.8;
      ctx.beginPath(); ctx.arc(r() * size, r() * size, 0.3 + r() * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let k = 0; k < 40; k++) {
      const side = k % 4, q = r() * size, d = r() * m * 1.4;
      const [x, y] = side === 0 ? [q, m + d - 3] : side === 1 ? [q, size - m - d + 3] : side === 2 ? [m + d - 3, q] : [size - m - d + 3, q];
      ctx.beginPath(); ctx.arc(x, y, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// ================================================================== scene
const FIGS = [buildGuardian(), buildImmortal(), buildLady(), buildChild()];
FIGS.forEach((F) => {
  F.X = (u) => F.x0 + F.v * u;
  F.bob = (u) => Math.sin(u * 1.3 + F.ph * 3) * 1.2;
  F.facing = 1;
});
const LADY = FIGS.find((f) => f.id === 'lady');
const CHILD = FIGS.find((f) => f.id === 'child');

/** set per-frame placement: X, Y, facing, T (local → panel) */
function placeFig(F, u, ctx) {
  F.facing = 1;
  if (F === CHILD) {
    // turned back toward the procession, pointing at the pelican; spins round after it passes
    F.facing = u < 5.5 ? -1 : 1;
    const raise = smoothstep(0.25, 0.75, u);
    let target = -0.35;
    if (ctx.rider.visible && u < 5.5) {
      const H = ctx.riderAt ? ctx.rider.placed.bird.head.c : [0, 0];
      const sx = F.X(u) + F.facing * ARM.piv[0] * F.Z, sy = ROAD + ARM.piv[1] * F.Z;
      const dx = (H[0] - sx) * F.facing, dy = H[1] - sy;
      target = clamp(Math.atan2(dy, Math.max(30, dx)), -1.15, 0.5);
    } else if (u >= 5.5) target = -0.55 + 0.04 * Math.sin(u * 2);
    F.armAngle = lerp(1.25, target, raise);
  }
  const X = F.X(u), Y = ROAD + F.bob(u), Z = F.Z, fc = F.facing;
  F.T = (p) => [X + p[0] * Z * fc, Y + p[1] * Z];
  F.at = { X, Y };
}

function bboxOf(items) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const it of items) for (const p of it.pts || it.fill || it.ink) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0: Math.floor(x0 - 10), y0: Math.floor(y0 - 10), x1: Math.ceil(x1 + 10), y1: Math.ceil(y1 + 10) };
}
function bakeItems(K, key, F, items) {
  if (!items.length) return null;
  const b = bboxOf(items);
  const sc = BP * F.Z;
  const fb = K.bake(key, (b.x1 - b.x0) * sc, (b.y1 - b.y0) * sc, () => {
    push(); scale(sc); translate(-b.x0, -b.y0);
    drawItems(K, items, key + ':', null, 1);
    K.flush();
    pop();
  });
  return { fb, b };
}
function drawBake(B, F) {
  if (!B) return;
  const { X, Y } = F.at, Z = F.Z;
  push();
  translate(X, Y);
  scale(F.facing, 1);
  image(B.fb, B.b.x0 * Z, B.b.y0 * Z, (B.b.x1 - B.b.x0) * Z, (B.b.y1 - B.b.y0) * Z);
  pop();
}

export default {
  ride: RIDE,
  freezeU: 3.1,
  cues: [{ u: 2.0, name: 'gust' }, { u: 2.5, name: 'scarf' }, { u: 4.0, name: 'calm' }],

  async init(K) {
    initBrushes(K);
    this.paper = paperLayer(K);
    this.inscr = inscriptionLayer(K);
    this.seal = sealLayer(K);
    this.bg = K.bake('bg', 2000, 2000, (K, w) => {
      push(); scale(w / 1000);
      image(this.paper, 0, 0, 1000, 1000);
      let n = 0;
      paintRoad((pts, o) => ln(K, 'road' + n++, pts, o));
      K.flush();
      image(this.inscr, 838, 30, 150, 320);
      push(); tint(255, 236); image(this.seal, 909, 264, 30, 30); pop();
      pop();
    });
    this.sky = SKY.map((c) => {
      const pad = 30, w = (c.tail + 110) * c.s + pad * 2, h = 100 * c.s + pad * 2;
      const x0 = c.dir > 0 ? -c.tail * c.s - pad : -60 * c.s - pad;
      const fb = K.bake('sky' + c.seed, w * BP, h * BP, () => {
        push(); scale(BP); translate(-x0, 60 * c.s + pad);
        let n = 0;
        cloudCluster((pts, o) => ln(K, `sky${c.seed}${n++}`, pts, { ...o, t: (o.t ?? 0.9) * 0.8 }), 0, 0, c.s, c.dir, c.tail, c.seed);
        K.flush();
        pop();
      });
      return { fb, x0, y0: -60 * c.s - pad, w, h, c };
    });
    this.bakes = FIGS.map((F) => ({ back: bakeItems(K, `figB-${F.id}`, F, F.back), front: bakeItems(K, `figF-${F.id}`, F, F.front) }));
  },

  mods(u) {
    if (u <= 1 || u >= 5) return {};
    const m = { wind: windU(u) };
    if (u > 2.45 && u < 2.85) m.eye = 'wide';
    return m;
  },

  render(K, u, ctx) {
    image(this.bg, 0, 0, 1000, 1000);
    // drifting clouds (pushed along by the gust)
    const drift = -2.2 * u - 26 * gustInt(u);
    for (const S of this.sky) image(S.fb, S.c.x + drift + S.x0, S.c.y + S.y0, S.w, S.h);
    FIGS.forEach((F) => placeFig(F, u, ctx));
    const scarf = scarfState(u, ctx);
    FIGS.forEach((F, i) => {
      const X = F.at.X;
      if (X + 240 < ctx.view.x0 || X - 260 > ctx.view.x1) return;
      const bk = this.bakes[i];
      const under = [], over = [];
      F.live(u, under, over, ctx);
      K.flush();
      drawBake(bk.back, F);
      drawItems(K, under, F.id + ':', F.T, F.Z);
      K.flush();
      drawBake(bk.front, F);
      drawItems(K, over, F.id + ':o', F.T, F.Z);
      if (F === LADY && scarf.owner === 'lady') drawScarf(K, scarf, u, 'back');
    });
    drawPetals(K, u);
    if (ctx.rider.visible) {
      K.flush();
      drawPelican(K, u, ctx, scarf.owner === 'pelican' ? scarf : null);
    }
  },
};
