// 06 · 清明上河图 · c. 1100 — the Rainbow Bridge passage, an original composition after Zhang Zeduan.
// Ink line with light colour (淡设色) on aged silk; ruled-line (界画) architecture; a crowd of tiny figures.
//
// Technique
//   • one 2048² bake: silk → ink washes (ink.washLayer) → p5.brush trees/ripples → Canvas2D ruled architecture
//     (bridge, shops, boat, stalls, background figures) → brush willows/ripples → title flag + seal
//   • every live figure is a Canvas2D sprite painted once per POSE STATE into one atlas (bake); states switch on beats
//   • the pelican is drawn live with p5.brush ink lines (fine outline, lead-white body, pale vermilion ruled frame)
//   • the bridge deck is ONE function deckY(x); path() rests both wheels on it with an exact circle-contact solve
import * as ink from '../kit/ink.js';
import { profile } from '../beat/ride.js';
import { panelLeft } from '../beat/timeline.js';
import { rng, hash, lerp, clamp, smoothstep, smootherstep, fbm, noise2 } from '../kit/math.js';

const ID = 'qingming';
const SILK = '#c8b48c';
const G = SILK;
const BK = 2048;                 // bake size (px) for the 1000-unit panel
const PXU = BK / 1000;
const SP = 2;                    // sprite px per unit
const RIDE = { hold: [2.2, 3.8], speed: 0.25, ramp: 0.3 };
const PROF = profile(RIDE);

// palette (brief) + derived
const C = {
  ink: '#1c1814', ochre: '#c99a5b', green: '#8fa58a', blue: '#8a9fa8', verm: '#b5543a',
  white: '#e7dfcc', skin: '#e3d3b2', wood: '#b99a6c', roof: '#7f8584',
};
const LINE = ink.tone(0.93, G);  // ink line colour sunk into the silk

// ------------------------------------------------------------------ small utils
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a = 1) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
const tn = (t) => ink.tone(t, G);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const c2d = (c) => c.getContext('2d');

function poly(x, pts, close = true) {
  x.beginPath();
  pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
  if (close) x.closePath();
}
function fillP(x, pts, col, a = 1) { poly(x, pts); x.fillStyle = rgba(col, a); x.fill(); }
/** ruled ink line (界画): even, crisp; t = ink tone, w in units */
function rl(x, pts, w = 0.55, t = 0.88, a = 1) {
  poly(x, pts, false);
  x.strokeStyle = rgba(tn(t), a); x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
  x.stroke();
}
function outl(x, pts, w = 0.55, t = 0.88, a = 1) { poly(x, pts, true); x.strokeStyle = rgba(tn(t), a); x.lineWidth = w; x.lineJoin = 'round'; x.stroke(); }
function curve(f, x0, x1, n = 40) { const out = []; for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); out.push([x, f(x)]); } return out; }

// ------------------------------------------------------------------ the bridge deck (shared by drawing and path)
const DECK = { c: 502, a: 200, h: 70 };      // crest x, half-span, rise → deck rolls from x 302 to 702, crest y 730
function deckY(x) {
  const t = Math.abs(x - DECK.c) / DECK.a;
  if (t >= 1) return 800;
  return 800 - DECK.h * Math.pow(1 - Math.pow(t, 2.4), 1.6);
}
const FAR = -30, NEAR = 34, RAIL = 20;         // deck band (far / near edge) relative to the wheel line; railing height
const ARCH = { c: 502, top: 774, k: 0.00175, th: 19, water: 890 };
const archTop = (x) => ARCH.top + ARCH.k * (x - ARCH.c) ** 2;
const soffit = (x) => archTop(x) + ARCH.th;
const SPRING = Math.sqrt((ARCH.water - ARCH.top - ARCH.th) / ARCH.k);   // half-span at the waterline

// wheel centre height over the deck (lowest centre whose circle clears the deck)
const WR = 62;
function wheelCY(xc) {
  let m = 1e9;
  for (let dx = -WR; dx <= WR; dx += 1) {
    const y = deckY(xc + dx) - Math.sqrt(WR * WR - dx * dx);
    if (y < m) m = y;
  }
  return m;
}
/** Placement with both tyres resting on the deck: bottom-bracket x fixed, solve rot + y. */
function placeOnDeck(xo) {
  let a = 0, yr = 738;
  for (let it = 0; it < 7; it++) {
    const c = Math.cos(a), s = Math.sin(a);
    const xr = xo - 102 * c + 62 * s, xf = xo + 106 * c + 62 * s;
    yr = wheelCY(xr);
    const yf = wheelCY(xf);
    a = Math.asin(clamp((yf - yr) / 208, -0.9, 0.9));
  }
  const c = Math.cos(a), s = Math.sin(a);
  yr = wheelCY(xo - 102 * c + 62 * s);
  return { y: yr + 102 * s + 62 * c, rot: a };
}
function riderPlace(u, base) {
  if (u <= 1 || u >= 5) return base;
  const p = placeOnDeck(base.x);
  return { ...base, y: p.y, rot: p.rot };
}
const bbX = (u) => PROF.x(clamp(u, -8, 14));
const headX = (u) => bbX(u) + 70;

// ------------------------------------------------------------------ the boat and its mast
const HULL = { x0: 300, x1: 842 };
const gun = (x) => 932 - 19 * ((x - 571) / 271) ** 2;          // near gunwale (sheer rises to bow and stern)
const MAST = { px: 700, py: 869, L: 300, th0: 0.07 };
function mastTip(th) { return [MAST.px - MAST.L * Math.cos(th), MAST.py - MAST.L * Math.sin(th)]; }
const TH_HIT = (() => {   // angle at which the tip meets the arch soffit
  let lo = MAST.th0, hi = 0.8;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; const t = mastTip(m); if (t[1] < soffit(t[0])) hi = m; else lo = m; }
  return lo;
})();
function mastAngle(u) {
  const beat = Math.floor(u * 2 + 1e-6);
  if (u < 2.3) return MAST.th0 + (beat % 2 ? 0.022 : 0);                 // crew fight it down, jerk per beat
  if (u < 2.5) { const s = (u - 2.3) / 0.2; return lerp(MAST.th0, TH_HIT, s * s); }   // released: swings up
  if (u < 2.75) { const s = (u - 2.5) / 0.25; return TH_HIT - 0.045 * Math.sin(Math.PI * s) * (1 - s); }   // BONK + rebound
  if (u < 4.5) return TH_HIT;
  // the crew scramble: hauled down in jerks on each beat, never quite back
  const k = Math.floor((u - 4.5) * 2 + 1e-6);
  const f = 1 - Math.exp(-k * 0.16);
  return lerp(TH_HIT, MAST.th0 + 0.05, f) + (k % 2 ? 0.012 : 0);
}

// ------------------------------------------------------------------ silk
function silkLayer(K) {
  const base = ink.silk(K, { w: 1024, h: 1024, base: SILK, seed: 61 });
  return K.layer(`${ID}:silk`, BK, BK, (x) => {
    x.drawImage(base.canvas, 0, 0, BK, BK);
    const r = rng(hash(ID, 'threads'));
    // irregular warp/weft threads (long and faint: no moiré)
    for (let k = 0; k < 160; k++) {
      const horiz = k % 2 === 0;
      const p = r() * BK;
      x.strokeStyle = r() < 0.5 ? `rgba(255,246,224,${0.025 + r() * 0.035})` : `rgba(70,50,25,${0.02 + r() * 0.03})`;
      x.lineWidth = 0.8 + r() * 1.6;
      x.beginPath();
      if (horiz) { x.moveTo(0, p); x.lineTo(BK, p + (r() - 0.5) * 6); } else { x.moveTo(p, 0); x.lineTo(p + (r() - 0.5) * 6, BK); }
      x.stroke();
    }
    // a lighter, cleaner silk than the Song panel: lift the middle a touch
    const g = x.createRadialGradient(BK * 0.5, BK * 0.45, BK * 0.1, BK * 0.5, BK * 0.5, BK * 0.75);
    g.addColorStop(0, 'rgba(240,226,190,0.10)'); g.addColorStop(1, 'rgba(240,226,190,0)');
    x.fillStyle = g; x.fillRect(0, 0, BK, BK);
  });
}

// ------------------------------------------------------------------ landscape layout
const STREET = { far: 800 + FAR, near: 800 + NEAR, curb: 800 + NEAR + 9 };   // 770 / 834 / 843
const FAR_RIVER = [[262, 770], [742, 770], [712, 718], [672, 668], [640, 626], [604, 590], [586, 560], [556, 530], [520, 506], [486, 486], [446, 472], [404, 468], [372, 484], [348, 512], [320, 548], [302, 600], [282, 652], [270, 712]];
const WATER = [[292, STREET.curb], [712, STREET.curb], [858, 1004], [150, 1004]];
const LAND_L = [[-6, STREET.far], [302, STREET.far], [302, STREET.curb], [296, STREET.curb], [150, 1004], [-6, 1004]];
const LAND_R = [[702, STREET.far], [1006, STREET.far], [1006, 1004], [858, 1004], [712, STREET.curb], [702, STREET.curb]];
// far banks: left (behind the wine house) and right (behind the shops), ground lines at the river
const FARBANK_L = [[-6, 372], [140, 362], [300, 400], [404, 468], [372, 484], [348, 512], [320, 548], [302, 600], [282, 652], [270, 712], [262, 770], [-6, 770]];
const FARBANK_R = [[404, 468], [446, 472], [486, 486], [520, 506], [556, 530], [586, 560], [604, 590], [640, 626], [672, 668], [712, 718], [742, 770], [1006, 770], [1006, 350], [860, 344], [700, 362], [540, 404]];

// trees: [x, y, h, kind, tone, lean, weight]  (kind 'leafy' via the ink kit; willows use willow())
const GROVE = [
  // distant belt along the far shore (pale)
  [30, 372, 58, 'leafy', 0.4, 0.05, 0.6], [92, 364, 74, 'leafy', 0.43, -0.06, 0.6], [196, 374, 52, 'leafy', 0.38, 0.04, 0.55],
  [520, 398, 62, 'leafy', 0.4, -0.05, 0.6], [598, 380, 80, 'leafy', 0.44, 0.06, 0.62], [680, 372, 58, 'leafy', 0.4, 0.0, 0.58],
  [940, 352, 70, 'leafy', 0.42, -0.04, 0.6], [995, 360, 54, 'leafy', 0.38, 0.05, 0.55],
  // far banks (mid tone)
  [356, 452, 92, 'leafy', 0.58, 0.06, 0.82], [226, 430, 84, 'leafy', 0.55, -0.05, 0.8], [118, 444, 70, 'leafy', 0.52, 0.04, 0.75],
  [604, 488, 100, 'leafy', 0.6, -0.04, 0.84], [790, 470, 90, 'leafy', 0.58, 0.05, 0.8], [920, 462, 76, 'leafy', 0.55, -0.03, 0.78],
];
// willows: [x, y, h, lean, tone, seed]
const WILLOWS = [
  [296, 600, 150, 0.2, 0.68, 1],     // far-left bank, leaning over the river
  [688, 640, 140, -0.22, 0.66, 2],   // far-right bank
  [470, 470, 96, 0.08, 0.46, 3],     // distant
  [60, 600, 270, 0.1, 0.8, 5],       // left bank, behind the wine house
  [858, 766, 250, -0.08, 0.88, 4],   // right bank, between the shops (in front of them)
];
const N_BACK_WILLOWS = 4;

/** A Qingming willow: leaning trunk, limbs into a domed crown, curtains of long hanging fronds. */
function willowGeom(x, y, h, lean, seed) {
  const r = rng(hash(ID, 'willow', seed));
  const fork = [x + Math.sin(lean) * h * 0.42, y - h * 0.42];
  const trunk = [[x, y], [lerp(x, fork[0], 0.34) + (r() - 0.5) * h * 0.05, lerp(y, fork[1], 0.34)], [lerp(x, fork[0], 0.68) - (r() - 0.5) * h * 0.05, lerp(y, fork[1], 0.68)], fork];
  const C = [fork[0] + Math.sin(lean) * h * 0.12, y - h * 0.66];
  const rx = h * 0.4, ry = h * 0.26;
  const limbs = [];
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI * (0.88 - 0.76 * (k / 3)) + (r() - 0.5) * 0.2;
    const end = [C[0] + Math.cos(a) * rx * 0.55, C[1] + Math.sin(a) * ry * 0.6];
    const mid = [lerp(fork[0], end[0], 0.5) + Math.cos(a) * h * 0.04, lerp(fork[1], end[1], 0.5) - h * 0.05];
    limbs.push([fork, mid, end]);
  }
  const fronds = [];
  const n = Math.round(h * 0.55);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * r(), f = 0.25 + 0.75 * Math.sqrt(r());
    const p = [C[0] + Math.cos(a) * rx * f, C[1] + Math.sin(a) * ry * f];
    const bottom = C[1] + ry * (0.55 + r() * 0.75);
    const L = Math.max(h * 0.08, bottom - p[1]);
    const sw = lean * 10 + (r() - 0.5) * 7;
    fronds.push([p, [p[0] + sw * 0.25 + (r() - 0.5) * 2, p[1] + L * 0.45], [p[0] + sw, p[1] + L]]);
  }
  const blobs = [ink.blob(C[0], C[1] + ry * 0.35, rx * 1.05, ry * 1.1, hash(ID, 'wb', seed, 0), 16), ink.blob(C[0] - rx * 0.3, C[1] + ry * 0.8, rx * 0.6, ry * 0.7, hash(ID, 'wb', seed, 1), 12), ink.blob(C[0] + rx * 0.35, C[1] + ry * 0.75, rx * 0.6, ry * 0.7, hash(ID, 'wb', seed, 2), 12)];
  return { trunk, limbs, fronds, blobs, tw: Math.max(1.6, h * 0.028) };
}
function paintWillow(K, key, W, tone) {
  const g = willowGeom(...W);
  const side = (s) => g.trunk.map((p, i) => [p[0] + s * g.tw * (1 - (i / 3) * 0.55), p[1]]);
  ink.flat(K, key + ':tf', [...side(-1), ...side(1).reverse()], { t: tone * 0.3, alpha: 200, ground: G });
  ink.line(K, key + ':tl', side(-1), { w: Math.min(1.3, Math.max(0.6, g.tw * 0.2)), t: tone * 0.9, dry: true, ground: G });
  ink.line(K, key + ':tr', side(1), { w: Math.min(0.9, Math.max(0.45, g.tw * 0.14)), t: tone * 0.75, ground: G });
  g.limbs.forEach((b, k) => ink.line(K, `${key}:b${k}`, b, { w: Math.min(0.7, Math.max(0.4, g.tw * 0.08)), t: tone * 0.6, ground: G, curv: 0.6 }));
  g.fronds.forEach((f, k) => ink.line(K, `${key}:f${k}`, f, { w: 0.42, t: tone * 0.58, fine: true, ground: '#6c8667', curv: 0.55 }));
  const r = rng(hash(ID, 'bark', key));
  for (let k = 0; k < 5; k++) {
    const i = Math.floor(r() * 3), p = [lerp(g.trunk[i][0], g.trunk[i + 1][0], r()), lerp(g.trunk[i][1], g.trunk[i + 1][1], r())];
    K.seed(ID, key, 'bark', k); K.brush.set('ink.dab', ink.tone(tone * 0.9, G), 0.35); K.brush.line(p[0] - g.tw * 0.5, p[1], p[0] + g.tw * 0.2, p[1] + g.tw * 0.5);
  }
}

// ------------------------------------------------------------------ washes (ink kit, Canvas2D)
function buildWashes(K) {
  const W = [];
  const add = (p, o) => W.push({ poly: p, ground: G, ...o });
  // distant treeline in the mist (one soft band with a bumpy top), fading up and down
  const band = [];
  for (let x = -10; x <= 1010; x += 20) band.push([x, 318 - 26 * fbm(x * 0.012, 3, 71, 3) - 14 * Math.sin(x * 0.021)]);
  band.push([1010, 400], [-10, 400]);
  add(band, { t: 0.22, alpha: 0.42, soft: 6, grad: { y0: 270, y1: 400, a0: 1, a1: 0.12 }, gran: 0.35, ground: '#7f9083' });
  const band2 = [];
  for (let x = -10; x <= 1010; x += 24) band2.push([x, 236 - 22 * fbm(x * 0.01, 9, 72, 3) - 10 * Math.sin(x * 0.017 + 1)]);
  band2.push([1010, 300], [-10, 300]);
  add(band2, { t: 0.16, alpha: 0.3, soft: 9, grad: { y0: 190, y1: 300, a0: 1, a1: 0 }, gran: 0.3, ground: '#8a988a' });
  // far banks
  add(FARBANK_L, { t: 0.14, alpha: 0.42, soft: 4, grad: { y0: 370, y1: 770, a0: 0.3, a1: 1 }, gran: 0.4, ground: '#c09d68' });
  add(FARBANK_R, { t: 0.14, alpha: 0.42, soft: 4, grad: { y0: 350, y1: 770, a0: 0.3, a1: 1 }, gran: 0.4, ground: '#c09d68' });
  // far river: pale blue-green, paler into the distance
  add(FAR_RIVER, { t: 0.1, alpha: 0.6, soft: 3, grad: { y0: 456, y1: 770, a0: 0.4, a1: 1 }, edge: 0.18, ground: '#8ba1a2' });
  // near river
  add(WATER, { t: 0.13, alpha: 0.62, soft: 3, grad: { y0: 843, y1: 1004, a0: 1, a1: 0.75 }, edge: 0.2, gran: 0.25, ground: '#8a9fa2' });
  // shadow under the arch
  const under = curve(soffit, ARCH.c - SPRING, ARCH.c + SPRING, 30).concat([[ARCH.c + SPRING, 902], [ARCH.c - SPRING, 902]]);
  add(under, { t: 0.6, alpha: 0.6, soft: 4, grad: { y0: 790, y1: 905, a0: 1, a1: 0.2 }, gran: 0.35 });
  // streets and near banks: pale earth
  add(LAND_L, { t: 0.18, alpha: 0.3, soft: 4, gran: 0.45, ground: '#bf9965' });
  add(LAND_R, { t: 0.18, alpha: 0.3, soft: 4, gran: 0.45, ground: '#bf9965' });
  // willow canopies (pale green) and grove foliage (collected from the ink kit)
  for (const Wl of WILLOWS) {
    const g = willowGeom(...Wl);
    g.blobs.forEach((b) => add(b, { t: 0.2, alpha: 0.32 * (Wl[4] + 0.2), soft: 7, gran: 0.4, ground: '#7f9877' }));
  }
  const fol = [];
  GROVE.forEach((tr, k) => ink.tree(K, `${ID}:gr${k}`, tr[0], tr[1], tr[2], { kind: tr[3], t: tr[4], lean: tr[5], ground: G, w: tr[6], washes: fol, collectOnly: true }));
  fol.forEach((f) => W.push({ ...f, ground: '#7d8f78', alpha: (f.alpha ?? 0.5) * 0.7 }));
  return W;
}

// ------------------------------------------------------------------ static brush passes (trees, ripples)
function paintBrushBack(K) {
  GROVE.forEach((tr, k) => ink.tree(K, `${ID}:gr${k}`, tr[0], tr[1], tr[2], { kind: tr[3], t: tr[4], lean: tr[5], ground: G, w: tr[6] }));
  WILLOWS.slice(0, N_BACK_WILLOWS).forEach((Wl, k) => paintWillow(K, `${ID}:wl${k}`, Wl, Wl[4]));
  // far river ripples: long, fine, slightly arched
  const rr = rng(hash(ID, 'farRipple'));
  let n = 0;
  for (let k = 0; k < 220 && n < 56; k++) {
    const y = 470 + rr() * 294, x = lerp(290, 720, rr());
    const L = 10 + rr() * 30 * (y - 440) / 330;
    if (!ink.inside([x, y], FAR_RIVER) || !ink.inside([x + L, y], FAR_RIVER)) continue;
    ink.line(K, `${ID}:frp${n++}`, [[x, y], [x + L * 0.5, y - 1.1], [x + L, y]], { t: 0.34 + rr() * 0.1, w: 0.5, fine: true, ground: G, curv: 0.6 });
  }
}

function paintBrushFront(K) {
  WILLOWS.slice(N_BACK_WILLOWS).forEach((Wl, k) => paintWillow(K, `${ID}:wn${k}`, Wl, Wl[4]));
  // reeds at the near banks (low: they never reach the road)
  const r = rng(hash(ID, 'reeds'));
  for (const [rx0, ry0, n] of [[892, 990, 14], [118, 996, 10]]) {
    for (let k = 0; k < n; k++) {
      const bx = rx0 + (r() - 0.5) * 40, by = ry0 + r() * 8, L = 22 + r() * 30, b = (r() - 0.5) * 12;
      ink.line(K, `${ID}:reed${rx0}_${k}`, [[bx, by], [bx + b * 0.4, by - L * 0.6], [bx + b, by - L]], { t: 0.6, w: 0.45, fine: true, ground: '#6f876a', curv: 0.5 });
    }
  }
  // worn cart track along the streets (the wheel line, as on the Song road at the seam)
  ink.line(K, `${ID}:trackL`, [[-8, 801.5], [120, 802.5], [240, 801.2], [306, 801.8]], { t: 0.45, w: 0.7, dry: true, ground: G });
  ink.line(K, `${ID}:trackR`, [[698, 801.8], [800, 802.4], [900, 801.2], [1008, 802]], { t: 0.45, w: 0.7, dry: true, ground: G });
  // near-river ripples (keep off the boat)
  const rr = rng(hash(ID, 'ripple'));
  let n = 0;
  for (let k = 0; k < 260 && n < 80; k++) {
    const y = 924 + rr() * 76, x = lerp(160, 850, rr());
    const L = 14 + rr() * 30;
    if (!ink.inside([x, y], WATER) || !ink.inside([x + L, y], WATER)) continue;
    if (x + L > HULL.x0 - 4 && x < HULL.x1 + 20 && y < gun(clamp(x, HULL.x0, HULL.x1)) + 46) continue;
    ink.line(K, `${ID}:rp${n++}`, [[x, y], [x + L * 0.33, y - 1.4], [x + L * 0.66, y + 0.6], [x + L, y - 0.4]], { t: 0.4 + rr() * 0.14, w: 0.5, fine: true, ground: G, curv: 0.6 });
  }
  // water under the bridge (in shadow)
  for (let k = 0; k < 14; k++) {
    const y = 858 + rr() * 30, x = lerp(290, 680, rr()), L = 24 + rr() * 46;
    if (y < soffit(x) + 6 || y < soffit(x + L) + 6) continue;
    ink.line(K, `${ID}:urp${k}`, [[x, y], [x + L / 2, y - 1], [x + L, y]], { t: 0.72, w: 0.45, fine: true, ground: G });
  }
  // grass along the bank edges and at the foot of the far banks
  const gr = rng(hash(ID, 'grass'));
  const tufts = [];
  for (let k = 0; k < 50; k++) {
    const left = k % 2 === 0;
    const s = gr();
    tufts.push(left ? [lerp(296, 150, s) - 8 - gr() * 36, lerp(846, 1000, s)] : [lerp(712, 858, s) + 8 + gr() * 36, lerp(846, 1000, s)]);
  }
  ink.dots(K, `${ID}:moss`, tufts, { t: 0.62, size: 2.4, w: 0.45, ground: '#6f876a', angle: -1.3 });
}

// ------------------------------------------------------------------ tiny figures (Canvas2D)
// local units: feet at (0, 0), y down, facing +x. Adult ≈ 44 tall.
const LEGS = {
  stand: { hip: [0, -21], n: [[0.6, -11], [0.9, -1]], f: [[-0.6, -11], [-1.0, -1]] },
  flat: { hip: [0, -21], n: [[0.3, -11], [0.5, -1]], f: [[-0.3, -11], [-0.5, -1]] },
  walkA: { hip: [0, -20.6], n: [[2.7, -11], [5.4, -1]], f: [[-2, -10.8], [-5.4, -2.2]] },
  walkB: { hip: [0, -20.6], n: [[-2, -10.8], [-5.4, -2.2]], f: [[2.7, -11], [5.4, -1]] },
  tip: { hip: [0, -22.6], n: [[0.5, -12.6], [0.7, -2.8]], f: [[-0.5, -12.6], [-0.6, -2.8]] },
  brace: { hip: [-2.8, -19.4], n: [[2, -10.5], [5.6, -1]], f: [[-4.2, -10], [-4.8, -1]] },
  lunge: { hip: [1.4, -19.4], n: [[5.2, -10.4], [6.8, -1]], f: [[-3, -10], [-8.2, -1.6]] },
  crouch: { hip: [-1, -15.5], n: [[4.6, -10], [3.4, -1]], f: [[3.2, -10.5], [1.8, -1]] },
  rideA: { hip: [-1.5, -15.5], n: [[5.6, -11], [4.6, -1]], f: [[6.4, -17.5], [5.2, -8]] },
  rideB: { hip: [-1.5, -15.5], n: [[6.4, -17.5], [5.2, -8]], f: [[5.6, -11], [4.6, -1]] },
};
// arm presets in the torso frame: [elbow, hand] offsets from the shoulder (y down)
const ARMS = {
  down: { n: [[0.7, 7.4], [1.1, 14.2]], f: [[-0.7, 7.4], [-0.9, 14.2]] },
  swingA: { n: [[2.2, 7.1], [4.4, 13.5]], f: [[-2.2, 7.1], [-3.8, 13.7]] },
  swingB: { n: [[-2.0, 7.1], [-3.6, 13.7]], f: [[2.2, 7.1], [4.2, 13.5]] },
  rail: { n: [[2.4, 6.8], [8.8, 8.6]], f: [[1.8, 7.0], [8.2, 9.4]] },
  pointDown: { n: [[4.8, 5.0], [11, 9.6]], f: [[1.6, 7.2], [7.6, 9.4]] },
  pointUp: { n: [[5.0, -3.6], [9.2, -9.8]], f: [[-0.6, 7.4], [-0.4, 14]] },
  pointFwd: { n: [[6.4, 1.4], [13.2, 0.2]], f: [[-0.6, 7.4], [-0.4, 14]] },
  handsUp: { n: [[4.2, -5.2], [5.4, -12.6]], f: [[2.4, -5.6], [2.6, -13]] },
  shade: { n: [[5.6, -1.4], [3.2, -6.6]], f: [[-0.6, 7.4], [-0.6, 14]] },
  hips: { n: [[3.6, 5.0], [1.8, 10.4]], f: [[-3.4, 5.2], [-1.6, 10.4]] },
  pole: { n: [[3.0, 4.6], [4.2, -0.6]], f: [[-2.6, 4.8], [-4.0, -0.4]] },
  hold: { n: [[3.2, 6.0], [4.8, 2.2]], f: [[2.6, 6.2], [4.6, 3.4]] },
  tray: { n: [[2.6, 6.6], [7.6, 8.6]], f: [[2.0, 6.8], [6.6, 9.2]] },
  reach: { n: [[5.2, 3.0], [11.4, 4.8]], f: [[3.6, 4.0], [9.6, 6.4]] },
  haul: { n: [[4.6, 2.2], [9.6, -1.2]], f: [[4.0, 2.6], [8.8, -0.2]] },
  punt: { n: [[4.2, 4.4], [7.0, 0.6]], f: [[3.0, 5.0], [6.0, 3.4]] },
  duck: { n: [[3.2, -4.0], [-0.6, -7.6]], f: [[2.2, -4.2], [-1.8, -7.0]] },
  cup: { n: [[3.4, 5.4], [4.4, -1.2]], f: [[1.0, 7.2], [3.4, 11]] },
  ride: { n: [[4.8, 3.6], [10.2, 3.4]], f: [[4.2, 4.0], [9.6, 4.2]] },
  oar: { n: [[4.0, 4.6], [8.2, 6.4]], f: [[3.2, 5.0], [7.4, 7.4]] },
  staff: { n: [[2.8, 6.4], [5.2, 12.4]], f: [[-0.7, 7.4], [-0.9, 14.2]] },
  wave: { n: [[3.6, -4.6], [6.6, -11.2]], f: [[1.6, 7.0], [3.0, 13.4]] },
};
// front view (facing the viewer): offsets for the RIGHT arm (screen right), mirrored for the left
const FARMS = {
  down: { r: [[1.0, 7.3], [1.3, 14]], l: null },
  rail: { r: [[1.6, 7.0], [-2.2, 10.6]], l: null },
  flat: { r: [[3.6, 6.0], [7.0, 11.0]], l: null },
  pointF: { r: [[3.4, 5.4], [7.6, 10.4]], l: [[-1.0, 7.3], [-1.3, 14]] },
  wave: { r: [[3.6, -4.6], [5.2, -11.6]], l: [[-1.0, 7.3], [-1.3, 14]] },
  hold: { r: [[1.4, 6.6], [-1.4, 3.2]], l: [[-1.4, 6.6], [1.2, 2.0]] },
  tray: { r: [[1.6, 6.6], [-1.6, 9.4]], l: null },
};

const POSES = {
  stand: { legs: 'stand', arms: 'down', lean: 0.02, nod: 0.08 },
  walkA: { legs: 'walkA', arms: 'swingA', lean: 0.06 }, walkB: { legs: 'walkB', arms: 'swingB', lean: 0.06 },
  poleA: { legs: 'walkA', arms: 'pole', lean: 0.1, prop: 'pole' }, poleB: { legs: 'walkB', arms: 'pole', lean: 0.1, prop: 'pole' },
  poleStand: { legs: 'stand', arms: 'pole', lean: 0.02, nod: -0.35, prop: 'pole' },
  look: { legs: 'stand', arms: 'down', lean: -0.08, nod: -0.55 },
  lookHips: { legs: 'stand', arms: 'hips', lean: -0.1, nod: -0.55 },
  point: { legs: 'stand', arms: 'pointUp', lean: -0.06, nod: -0.5 },
  pointFwd: { legs: 'walkA', arms: 'pointFwd', lean: 0.04, nod: -0.25 },
  wow: { legs: 'stand', arms: 'handsUp', lean: -0.14, nod: -0.6 },
  shade: { legs: 'stand', arms: 'shade', lean: -0.08, nod: -0.5 },
  leanRail: { legs: 'stand', arms: 'rail', lean: 0.62, nod: 0.5 },
  leanPoint: { legs: 'stand', arms: 'pointDown', lean: 0.55, nod: 0.6 },
  crane: { legs: 'tip', arms: 'pointDown', lean: 0.3, nod: 0.4 },
  craneB: { legs: 'tip', arms: 'hips', lean: 0.2, nod: 0.35 },
  tray: { legs: 'stand', arms: 'tray', lean: 0.1, nod: 0.4, prop: 'tray' },
  trayLook: { legs: 'stand', arms: 'tray', lean: -0.1, nod: -0.55, prop: 'tray' },
  trayTilt: { legs: 'stand', arms: 'tray', lean: -0.12, nod: -0.5, prop: 'trayTilt' },
  reach: { legs: 'walkA', arms: 'reach', lean: 0.3, nod: 0.2, prop: 'trayHang' },
  haulA: { legs: 'brace', arms: 'haul', lean: -0.32, nod: -0.05 }, haulB: { legs: 'brace', arms: 'haul', lean: -0.44, nod: 0.05 },
  haulLook: { legs: 'stand', arms: 'down', lean: -0.12, nod: -0.65 },
  puntA: { legs: 'lunge', arms: 'punt', lean: 0.42, nod: 0.1, prop: 'punt' },
  puntB: { legs: 'stand', arms: 'punt', lean: 0.12, nod: 0, prop: 'puntUp' },
  puntLook: { legs: 'stand', arms: 'hold', lean: -0.1, nod: -0.6, prop: 'puntV' },
  duck: { legs: 'crouch', arms: 'duck', lean: 0.35, nod: 0.5 },
  shoutA: { legs: 'stand', arms: 'wave', lean: 0.08, nod: 0.1 }, shoutB: { legs: 'walkA', arms: 'pointFwd', lean: 0.12, nod: 0.15 },
  steer: { legs: 'lunge', arms: 'oar', lean: 0.2, nod: 0.05, prop: 'oar' },
  steerLook: { legs: 'stand', arms: 'oar', lean: -0.1, nod: -0.6, prop: 'oar' },
  rideA: { legs: 'rideA', arms: 'ride', lean: 0.38, nod: -0.2 }, rideB: { legs: 'rideB', arms: 'ride', lean: 0.42, nod: -0.15 },
  staff: { legs: 'stand', arms: 'staff', lean: 0.12, nod: 0.1, prop: 'staff' },
  staffLook: { legs: 'stand', arms: 'staff', lean: -0.04, nod: -0.5, prop: 'staff' },
  cup: { legs: 'stand', arms: 'cup', lean: 0.04, nod: -0.1, prop: 'cup' },
  // front views
  fWatch: { front: true, arms: 'rail', bow: 0.75 },
  fWatchB: { front: true, arms: 'pointF', bow: 0.55 },
  fStand: { front: true, arms: 'down', bow: 0.1 },
  fFlat: { front: true, arms: 'flat', bow: -0.2, prop: 'poleV', wide: true, tip: true },
  fTray: { front: true, arms: 'tray', bow: 0.45, prop: 'trayF' },
  fCrane: { front: true, arms: 'pointF', bow: 0.25, tip: true },
  fWave: { front: true, arms: 'wave', bow: 0 },
};

function figGeom(spec, P) {
  const k = spec.kind === 'kid' ? 0.68 : 1;
  const L = LEGS[P.legs || 'stand'];
  const lean = P.lean ?? 0;
  const hip = [L.hip[0] * k, L.hip[1] * k];
  const up = [Math.sin(lean), -Math.cos(lean)];
  const T = 13.4 * k;
  const sh = [hip[0] + up[0] * T, hip[1] + up[1] * T];
  const nk = [sh[0] + up[0] * 2.0 * k, sh[1] + up[1] * 2.0 * k];
  const hr = spec.kind === 'kid' ? 3.05 : 3.05;
  const na = lean + (P.nod ?? 0);
  const hc = [nk[0] + Math.sin(na) * hr * 0.95, nk[1] - Math.cos(na) * hr * 0.95];
  const cs = Math.cos(lean), sn = Math.sin(lean);
  const rot = (p) => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  const A = ARMS[P.arms || 'down'];
  const arm = (a, sx) => {
    const s0 = [sh[0] + sx * k, sh[1] + 0.9 * k];
    const e = rot(a[0]), h = rot(a[1]);
    return [s0, [s0[0] + e[0] * k, s0[1] + e[1] * k], [s0[0] + h[0] * k, s0[1] + h[1] * k]];
  };
  const leg = (j) => [hip, [j[0][0] * k, j[0][1] * k], [j[1][0] * k, j[1][1] * k]];
  return { k, hip, sh, nk, hc, hr, na, lean, rot, armN: arm(A.n, 0.7), armF: arm(A.f, -0.7), legN: leg(L.n), legF: leg(L.f) };
}

/** Outlined tube (sleeve, trouser, limb): ink edge then cloth. */
function tube(x, pts, w, col, lw = 0.6) {
  poly(x, pts, false);
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = LINE; x.lineWidth = w + lw * 2; x.stroke();
  x.strokeStyle = col; x.lineWidth = w; x.stroke();
}
function dot(x, p, r, col, edge = true) {
  x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2);
  x.fillStyle = col; x.fill();
  if (edge) { x.strokeStyle = LINE; x.lineWidth = 0.45; x.stroke(); }
}

function drawHead(x, spec, hc, hr, na, view) {
  // face
  x.beginPath(); x.arc(hc[0], hc[1], hr, 0, Math.PI * 2);
  x.fillStyle = C.skin; x.fill();
  x.strokeStyle = LINE; x.lineWidth = 0.55; x.stroke();
  const hat = spec.hat || 'futou';
  const hair = '#211a14';
  x.save();
  x.translate(hc[0], hc[1]);
  x.rotate(view === 'side' ? na * 0.9 : 0);
  const bowY = view === 'front' ? 0 : 0;
  if (hat === 'straw') {
    x.beginPath(); x.ellipse(0, -hr * 0.55 + bowY, hr * 2.25, hr * 0.5, 0, 0, Math.PI * 2);
    x.fillStyle = rgba('#cfae74', 0.95); x.fill(); x.strokeStyle = LINE; x.lineWidth = 0.5; x.stroke();
    x.beginPath(); x.moveTo(-hr * 1.1, -hr * 0.65); x.lineTo(0, -hr * 1.75); x.lineTo(hr * 1.1, -hr * 0.65); x.closePath();
    x.fillStyle = rgba('#c9a56a', 0.95); x.fill(); x.stroke();
  } else if (view === 'back') {
    x.beginPath(); x.arc(0, 0, hr * 1.02, 0, Math.PI * 2); x.fillStyle = hair; x.fill();
    if (hat === 'futou') { x.beginPath(); x.arc(0, -hr * 0.9, hr * 0.55, 0, Math.PI * 2); x.fill(); }
  } else {
    // cap / hair over the top (and the back, in profile)
    x.beginPath();
    if (view === 'side') x.arc(0, 0, hr * 1.04, Math.PI * 0.62, Math.PI * 1.92);
    else x.arc(0, 0, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98);
    x.closePath();
    x.fillStyle = hat === 'cap' ? '#5a4a38' : hair; x.fill();
    if (hat === 'futou') {
      x.beginPath(); x.arc(view === 'side' ? -hr * 0.25 : 0, -hr * 1.0, hr * 0.58, 0, Math.PI * 2); x.fill();
      if (view === 'side') {   // soft ribbons hanging behind
        x.strokeStyle = hair; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(-hr * 0.9, -hr * 0.3); x.quadraticCurveTo(-hr * 1.6, hr * 0.4, -hr * 1.5, hr * 1.4); x.stroke();
      }
    } else if (hat === 'bun') {
      x.beginPath(); x.arc(view === 'side' ? -hr * 0.3 : 0, -hr * 1.1, hr * 0.45, 0, Math.PI * 2); x.fill();
    } else if (hat === 'kid') {
      x.beginPath(); x.arc(-hr * 0.7, -hr * 0.85, hr * 0.38, 0, Math.PI * 2); x.arc(hr * 0.7, -hr * 0.85, hr * 0.38, 0, Math.PI * 2); x.fill();
    }
  }
  // eye / face hint
  if (view === 'side') {
    x.fillStyle = hair;
    x.beginPath(); x.arc(hr * 0.55, -hr * 0.05, 0.42, 0, Math.PI * 2); x.fill();
    if (spec.beard) { x.strokeStyle = '#3a3128'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(hr * 0.5, hr * 0.7); x.lineTo(hr * 0.2, hr * 1.9); x.stroke(); }
  } else if (view === 'front') {
    x.fillStyle = hair;
    x.fillRect(-hr * 0.5, -hr * 0.05, 0.7, 0.42); x.fillRect(hr * 0.5 - 0.7, -hr * 0.05, 0.7, 0.42);
  }
  x.restore();
}

function drawProp(x, spec, P, J, stage) {
  const prop = P.prop;
  if (!prop) return;
  const hn = J.armN[2], hf = J.armF[2];
  if (stage === 'back') {
    if (prop === 'punt') rl(x, [[hn[0] + 9, hn[1] - 10], [hn[0] - 22, 40]], 0.9, 0.8);
    if (prop === 'puntUp') rl(x, [[hn[0] + 6, hn[1] - 26], [hn[0] - 10, 22]], 0.9, 0.8);
    if (prop === 'puntV') rl(x, [[hn[0] + 1, hn[1] - 34], [hn[0] - 1, 26]], 0.9, 0.8);
    if (prop === 'oar') rl(x, [[hn[0] + 4, hn[1] - 2], [-44, 34]], 1.3, 0.85);
    return;
  }
  if (prop === 'pole') {
    const y = J.sh[1] - 1.2, cx = J.sh[0];
    const L = 18;
    rl(x, [[cx - L, y + 1.2], [cx, y], [cx + L, y + 1.2]], 0.85, 0.85);
    for (const s of [-1, 1]) {
      const ex = cx + s * L, ey = y + 1.2;
      rl(x, [[ex, ey], [ex - 2.5, ey + 9]], 0.35, 0.8); rl(x, [[ex, ey], [ex + 2.5, ey + 9]], 0.35, 0.8);
      const b = [[ex - 3.6, ey + 9], [ex + 3.6, ey + 9], [ex + 2.8, ey + 15], [ex - 2.8, ey + 15]];
      fillP(x, b, '#b4925e', 0.9); outl(x, b, 0.45);
      rl(x, [[ex - 3.2, ey + 11.5], [ex + 3.2, ey + 11.5]], 0.3, 0.7);
    }
  } else if (prop === 'tray' || prop === 'trayTilt' || prop === 'trayHang') {
    const a = prop === 'trayTilt' ? 0.45 : prop === 'trayHang' ? 1.2 : 0;
    const c = [lerp(hn[0], hf[0], 0.5) + 1, lerp(hn[1], hf[1], 0.5) - 0.6];
    const d = [Math.cos(a), Math.sin(a)];
    const p0 = [c[0] - d[0] * 9, c[1] - d[1] * 9], p1 = [c[0] + d[0] * 9, c[1] + d[1] * 9];
    if (prop === 'tray') for (let i = 0; i < 5; i++) dot(x, [c[0] - 6.4 + i * 3.2, c[1] - 2.4 - (i % 2) * 1.6], 1.8, '#f0e8d6');
    x.lineCap = 'round';
    x.strokeStyle = LINE; x.lineWidth = 1.6; poly(x, [p0, p1], false); x.stroke();
    x.strokeStyle = '#a07e52'; x.lineWidth = 0.9; poly(x, [p0, p1], false); x.stroke();
  } else if (prop === 'staff') {
    rl(x, [[hn[0] + 0.4, hn[1] - 3], [hn[0] + 2.4, 0]], 0.75, 0.85);
  } else if (prop === 'cup') {
    dot(x, [hn[0] + 0.8, hn[1] - 0.6], 0.9, '#d9d2c0');
  }
}

/** Paint a figure (side, front or back view) at the current transform: feet at (0, 0). */
function paintFigure(x, spec, P) {
  if (P.front) return paintFront(x, spec, P);
  const J = figGeom(spec, P);
  const cloth = spec.robe || C.white;
  const k = J.k;
  const long = spec.kind === 'robe';
  const lw = 0.62;
  drawProp(x, spec, P, J, 'back');
  // far arm
  tube(x, J.armF, long ? 2.9 * k : 2.1 * k, mixHex(cloth, '#7d6d55', 0.18), lw);
  dot(x, J.armF[2], 0.9 * k, C.skin);
  // legs
  const trou = spec.trousers || '#ddd4c0';
  const legDraw = (L, shade) => {
    const knee = L[1], ank = L[2];
    if (long) { // only the shoe shows below the robe
      x.fillStyle = '#2a221b'; poly(x, [[ank[0] - 1.2, ank[1] - 0.2], [ank[0] + 2.4, ank[1] - 0.4], [ank[0] + 2.6, ank[1] + 0.9], [ank[0] - 1.2, ank[1] + 0.9]]); x.fill();
      return;
    }
    tube(x, [L[0], knee, [lerp(knee[0], ank[0], 0.35), lerp(knee[1], ank[1], 0.35)]], 2.6 * k, mixHex(trou, '#7d6d55', shade), lw);
    tube(x, [[lerp(knee[0], ank[0], 0.3), lerp(knee[1], ank[1], 0.3)], ank], 1.3 * k, C.skin, 0.5);
    x.fillStyle = '#2a221b'; poly(x, [[ank[0] - 1.0, ank[1] - 0.3], [ank[0] + 2.2, ank[1] - 0.2], [ank[0] + 2.3, ank[1] + 0.8], [ank[0] - 1.0, ank[1] + 0.8]]); x.fill();
  };
  legDraw(J.legF, 0.2);
  legDraw(J.legN, 0);
  // robe / tunic
  const R = (dx, dy) => { const p = J.rot([dx * k, dy * k]); return [J.sh[0] + p[0], J.sh[1] + p[1]]; };
  const H = (dx, dy) => { const p = J.rot([dx * k, dy * k]); return [J.hip[0] + p[0], J.hip[1] + p[1]]; };
  let body;
  if (long) {
    const fx = Math.max(J.legN[2][0], J.legF[2][0]), bx = Math.min(J.legN[2][0], J.legF[2][0]);
    body = [R(-2.4, -0.6), R(1.6, -0.9), R(3.0, 3.5), H(2.8, -2.4), H(3.4, 1.5), [fx + 2.6, -1.6], [lerp(bx, fx, 0.5), -0.8], [bx - 2.6, -1.4], H(-3.6, 1.5), H(-3.0, -2.6), R(-3.2, 4)];
  } else {
    const kneeY = Math.min(J.legN[1][1], J.legF[1][1]);
    const hemY = lerp(J.hip[1], kneeY, 0.75) + 0.5;
    body = [R(-2.2, -0.6), R(1.6, -0.9), R(2.8, 3.5), H(2.6, -2.4), [J.hip[0] + 4.2 * k, hemY], [J.hip[0] - 4.0 * k, hemY + 0.4], H(-2.8, -2.6), R(-3.0, 4)];
  }
  fillP(x, body, cloth, 0.95);
  outl(x, body, lw);
  // fold lines + belt
  rl(x, [H(-2.8, -1.4), H(2.6, -1.2)], 0.5, 0.85);
  if (long) rl(x, [H(0.6, 0), H(1.0, 8)], 0.35, 0.7, 0.8);
  // near arm (sleeve over the body)
  tube(x, J.armN, long ? 3.0 * k : 2.2 * k, cloth, lw);
  if (long) { // wide sleeve hanging under the forearm
    const e = J.armN[1], h = J.armN[2];
    const m = [lerp(e[0], h[0], 0.55), lerp(e[1], h[1], 0.55) + 2.4 * k];
    poly(x, [e, m, [lerp(e[0], h[0], 0.85), lerp(e[1], h[1], 0.85)]]); x.fillStyle = cloth; x.fill(); x.strokeStyle = LINE; x.lineWidth = 0.45; x.stroke();
  }
  dot(x, J.armN[2], 0.95 * k, C.skin);
  drawHead(x, spec, J.hc, J.hr * (spec.kind === 'kid' ? 1.05 : 1), J.na, P.back ? 'back' : 'side');
  drawProp(x, spec, P, J, 'front');
  return J;
}

function paintFront(x, spec, P) {
  const k = spec.kind === 'kid' ? 0.68 : 1;
  const cloth = spec.robe || C.white;
  const long = spec.kind === 'robe';
  const lw = 0.62;
  const bow = P.bow ?? 0;
  const lift = P.tip ? 1.6 : 0;
  const shY = (-34.4 + bow * 5.5 - lift) * k, hipY = (-21 - lift) * k;
  const shW = (P.wide ? 4.9 : 4.4) * k;
  const A = FARMS[P.arms || 'down'];
  const armPts = (side) => {
    const a = side > 0 ? A.r : (A.l || A.r.map((p) => [-p[0], p[1]]));
    const s0 = [side * shW * 0.92, shY + 1];
    return [s0, [s0[0] + a[0][0] * k * (side > 0 || A.l ? 1 : 1), s0[1] + a[0][1] * k], [s0[0] + a[1][0] * k, s0[1] + a[1][1] * k]];
  };
  const armR = armPts(1), armL = armPts(-1);
  if (P.prop === 'poleV') {
    rl(x, [[2.0, 6], [2.4, -62]], 0.9, 0.85);
    for (const [yy, sz] of [[-60, 1], [-12, 1]]) {
      const b = [[2.2 - 5, yy], [2.2 + 5, yy], [2.2 + 4, yy + 8 * sz], [2.2 - 4, yy + 8 * sz]];
      fillP(x, b, '#b4925e', 0.92); outl(x, b, 0.45);
    }
  }
  // legs / feet
  if (!long) {
    for (const s of [-1, 1]) {
      tube(x, [[s * 1.8 * k, hipY], [s * 1.9 * k, hipY + 8 * k]], 2.6 * k, spec.trousers || '#ddd4c0', lw);
      tube(x, [[s * 1.9 * k, hipY + 7.5 * k], [s * 2.0 * k, -1 - lift]], 1.3 * k, C.skin, 0.5);
    }
  }
  for (const s of [-1, 1]) { x.fillStyle = '#2a221b'; x.beginPath(); x.ellipse(s * 2.1 * k, -0.6 - lift, 1.5 * k, 0.8, 0, 0, Math.PI * 2); x.fill(); }
  // body
  const hemY = long ? -1.4 - lift : (hipY + 8.5 * k);
  const body = [[-shW, shY], [shW, shY], [3.6 * k, (shY + hipY) / 2], [3.3 * k, hipY], [long ? 5.6 * k : 4.3 * k, hemY], [long ? -5.6 * k : -4.3 * k, hemY], [-3.3 * k, hipY], [-3.6 * k, (shY + hipY) / 2]];
  fillP(x, body, cloth, 0.95); outl(x, body, lw);
  rl(x, [[-3.3 * k, hipY + 0.8], [3.3 * k, hipY + 0.8]], 0.5, 0.85);
  rl(x, [[0, shY + 0.5], [0.4, hipY]], 0.35, 0.7, 0.8);       // robe overlap
  // arms
  for (const a of [armL, armR]) { tube(x, a, long ? 2.9 * k : 2.1 * k, cloth, lw); dot(x, a[2], 0.95 * k, C.skin); }
  if (P.prop === 'trayF') {
    const c = [0, armR[2][1] - 1];
    x.lineCap = 'round'; x.strokeStyle = LINE; x.lineWidth = 1.7; poly(x, [[c[0] - 9.5, c[1]], [c[0] + 9.5, c[1]]], false); x.stroke();
    x.strokeStyle = '#a07e52'; x.lineWidth = 1.0; x.stroke();
    for (let i = 0; i < 5; i++) dot(x, [c[0] - 6.4 + i * 3.2, c[1] - 2.4 - (i % 2) * 1.6], 1.8, '#f0e8d6');
  }
  // head: bowed heads sink between the shoulders and show the cap
  const hr = 3.05 * (spec.kind === 'kid' ? 1.05 : 1);
  const hc = [0, shY - hr * 0.95 + bow * 1.6];
  drawHead(x, spec, hc, hr, 0, bow > 0.5 ? 'back' : 'front');
  return { hc, armR, armL };
}

// ------------------------------------------------------------------ special figures: donkey, sedan chair
function paintDonkey(x, P) {
  const walk = P.legs || 'A';
  const body = [[-10, -17], [-4, -19.5], [6, -19.5], [11, -17], [11.5, -13], [7, -11], [-6, -11], [-10.5, -13]];
  const sw = walk === 'A' ? 1 : walk === 'B' ? -1 : 0;
  for (const [lx, s, far] of [[-7, 1, true], [7, -1, true], [-5, -1, false], [9, 1, false]]) {
    const top = [lx, -12], bot = [lx + sw * s * 1.8, 0];
    tube(x, [top, [lerp(top[0], bot[0], 0.5), -6], bot], 1.5, far ? '#8f8476' : '#a39887', 0.5);
  }
  fillP(x, body, '#a39887', 0.95); outl(x, body, 0.6);
  // packs
  const pk = [[-6, -19], [4, -19], [5, -24], [-6, -24]];
  fillP(x, pk, '#c4a670', 0.95); outl(x, pk, 0.5);
  rl(x, [[-1, -24], [-1, -12]], 0.4, 0.8);
  // neck + head (up when alert)
  const up = P.head === 'up';
  const nb = [10, -17.5], hd = up ? [16, -27] : [17.5, -21];
  tube(x, [nb, [lerp(nb[0], hd[0], 0.5), lerp(nb[1], hd[1], 0.5) - 1], hd], 4.4, '#a39887', 0.6);
  const head = up ? [[14.5, -29], [20.5, -26.5], [21, -24.5], [15.5, -24.5]] : [[16, -23.5], [22.5, -20], [22, -18], [15.5, -19]];
  fillP(x, head, '#a39887'); outl(x, head, 0.55);
  const ear = up ? [[15, -29], [14, -36], [16.5, -30]] : [[16.4, -23.5], [13.5, -30], [17.6, -24]];
  fillP(x, ear, '#a39887'); outl(x, ear, 0.5);
  const ear2 = up ? [[16, -29], [17.6, -35.5], [17.2, -29.2]] : [[17, -23.6], [16.4, -30.4], [18.2, -23.8]];
  fillP(x, ear2, '#9a8f7f'); outl(x, ear2, 0.5);
  dot(x, up ? [17.6, -27.5] : [18.8, -21.6], 0.45, '#211a14', false);
  rl(x, [[-10, -16], [-12.5, -9 + sw]], 0.6, 0.85);
}

function paintSedan(x, P) {
  // two bearers and a curtained chair on long poles; P.step 'A' | 'B' | 'stop'
  const st = P.step;
  const bearer = (bx, pose) => { x.save(); x.translate(bx, 0); paintFigure(x, { kind: 'tunic', robe: '#cdb486', hat: 'straw' }, pose); x.restore(); };
  const pa = st === 'stop' ? POSES.poleStand : st === 'A' ? POSES.poleA : POSES.poleB;
  const pb = st === 'stop' ? { ...POSES.poleStand, nod: -0.55 } : st === 'A' ? POSES.poleB : POSES.poleA;
  bearer(-24, { ...pa, prop: null });
  // chair
  const ch = [[-9, -46], [9, -46], [9.5, -18], [-9.5, -18]];
  fillP(x, ch, '#9d6a48', 0.95); outl(x, ch, 0.6);
  const roof = [[-12, -46], [0, -52], [12, -46]];
  fillP(x, roof, '#5c4c3d'); outl(x, roof, 0.6);
  const cur = [[-5.5, -42], [5.5, -42], [5.5, -22], [-5.5, -22]];
  fillP(x, cur, st === 'stop' ? '#3a3027' : '#d7c49c', 0.95); outl(x, cur, 0.45);
  if (st === 'stop') { // the passenger peeks out
    drawHead(x, { hat: 'futou' }, [1.5, -35], 2.6, -0.4, 'side');
  } else for (let i = -4; i <= 4; i += 2) rl(x, [[i, -41.5], [i, -22.5]], 0.25, 0.6);
  rl(x, [[-34, -34.5], [34, -34.5]], 1.0, 0.88);
  bearer(24, { ...pb, prop: null });
}

// ------------------------------------------------------------------ the cast
// side: 'far' (behind the rider) | 'near' (in front). y(u) gives the foot line.
const farY = (x) => deckY(x) + FAR + 4;
const nearY = (x) => deckY(x) + NEAR - 5;
const beatOf = (u) => Math.floor(u * 2 + 1e-6);
const q4 = (u) => Math.floor(u * 4 + 1e-6) / 4;            // half-beat quantised time
const faceTo = (x, tx) => (tx >= x ? 1 : -1);

// generic onlooker: watches the boat (two alternating states), snaps round at 2.0, follows the bird
function onlooker(o) {
  return (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: Math.floor((b + o.ph) / 2) % 2 ? o.pre[1] : o.pre[0], f: o.preF ?? -1 };
    const hx = headX(Math.min(q, 6));
    let f = faceTo(o.x, hx);
    let pose = o.turn[0];                                   // 2.0: arms up, heads snap round
    if (q >= 3.5 && o.turn[1]) pose = o.turn[1];
    if (q >= 4 && hx > o.x) {                               // 4.0: heads follow the bird down the far side
      f = 1;
      pose = o.after ? (Math.floor(b / 4) % 2 ? o.after[1] ?? o.after[0] : o.after[0]) : pose;
    }
    if (q >= 6) f = 1;
    return { pose, f };
  };
}

function buildCast() {
  const cast = [];
  const add = (c) => { cast.push({ s: 1, side: 'far', box: [-30, -64, 30, 6], ...c }); };
  // ---- bridge, far railing (behind the rider)
  add({ id: 'f1', x: 268, y: () => 789, s: 0.95, spec: { kind: 'tunic', robe: C.ochre, hat: 'straw' }, state: onlooker({ x: 268, ph: 1, pre: ['fStand', 'fWave'], turn: ['point', 'look'], after: ['pointFwd', 'look'] }) });
  add({ id: 'f3', x: 400, s: 0.95, spec: { kind: 'robe', robe: C.white, hat: 'futou' }, state: onlooker({ x: 400, ph: 0, pre: ['fCrane', 'fStand'], turn: ['wow', 'point'], after: ['look', 'pointFwd'] }) });
  add({ id: 'f4', x: 452, s: 0.93, spec: { kind: 'robe', robe: C.blue, hat: 'futou', beard: true }, state: onlooker({ x: 452, ph: 2, pre: ['fWatchB', 'fCrane'], turn: ['point', 'lookHips'], after: ['lookHips'] }) });
  add({ id: 'f5', x: 556, s: 0.95, spec: { kind: 'robe', robe: '#b9b1a1', hat: 'futou', beard: true }, state: onlooker({ x: 556, ph: 1, pre: ['fStand', 'fCrane'], turn: ['wow', 'shade'], after: ['shade'] }) });
  add({ id: 'f6', x: 606, s: 0.95, spec: { kind: 'tunic', robe: C.green, hat: 'bun' }, state: onlooker({ x: 606, ph: 3, pre: ['fCrane', 'fWave'], turn: ['point', 'look'], after: ['pointFwd', 'look'] }) });
  add({ id: 'f7', x: 662, s: 0.95, spec: { kind: 'tunic', robe: C.white, hat: 'straw' }, state: onlooker({ x: 662, ph: 0, pre: ['fStand', 'fCrane'], turn: ['wow', 'look'], after: ['look', 'point'] }) });
  add({ id: 'f8', x: 744, y: () => 789, s: 0.95, spec: { kind: 'tunic', robe: '#c9b38c', hat: 'bun' }, state: onlooker({ x: 744, ph: 2, pre: ['fWave', 'fStand'], turn: ['wow', 'lookHips'], after: ['pointFwd', 'look'] }) });
  // the porter who flattens himself against the far railing
  add({
    id: 'porter', x: 330, s: 0.97, spec: { kind: 'tunic', robe: C.blue, hat: 'straw', trousers: '#ddd3bd' }, box: [-32, -72, 32, 6],
    pos: (u) => (u < 0.75 ? 330 + 9 * (0.75 - Math.max(u, -6)) : u < 7 ? 330 : 330 - 7 * (u - 7)),
    state: (u) => {
      const q = q4(u), b = beatOf(u);
      if (q < 0.75) return { pose: b % 2 ? 'poleA' : 'poleB', f: -1 };
      if (q < 2) return { pose: 'fFlat', f: 1 };
      if (q < 4.5) return { pose: 'poleStand', f: faceTo(330, headX(q)) };
      if (q < 7) return { pose: 'poleStand', f: 1 };
      return { pose: b % 2 ? 'poleA' : 'poleB', f: -1 };
    },
  });
  // ---- bridge, near railing (in front of the rider)
  const nearOn = (id, x, s, spec, o) => add({ id, x, s, side: 'near', spec, state: onlooker({ x, ...o }) });
  nearOn('n1', 332, 1, { kind: 'robe', robe: C.green, hat: 'futou' }, { ph: 0, pre: ['fWatch', 'fWatchB'], preF: 1, turn: ['point', 'look'], after: ['pointFwd', 'look'] });
  nearOn('n3', 688, 1, { kind: 'robe', robe: C.white, hat: 'futou', beard: true }, { ph: 1, pre: ['fWatchB', 'fWatch'], turn: ['wow', 'shade'], after: ['look'] });
  nearOn('n4', 466, 1, { kind: 'kid', robe: C.verm, hat: 'kid' }, { ph: 2, pre: ['fWatch', 'fWatchB'], turn: ['wow', 'point'], after: ['point', 'look'] });
  // the bun seller at the crest
  add({
    id: 'buns', x: 506, side: 'near', spec: { kind: 'tunic', robe: C.ochre, hat: 'cap' },
    state: (u) => {
      const q = q4(u), b = beatOf(u);
      if (q < 2) return { pose: 'fTray', f: 1 };
      if (q < 3) return { pose: 'trayLook', f: faceTo(506, headX(q)) };
      if (q < 3.5) return { pose: 'trayTilt', f: faceTo(506, headX(q)) };
      return { pose: q < 6 || b % 4 < 2 ? 'reach' : 'look', f: 1 };
    },
  });
  // ---- left bank (behind the rider's road)
  add({ id: 'waiter', x: 34, y: () => 784, spec: { kind: 'tunic', robe: C.white, hat: 'bun' }, state: onlooker({ x: 34, ph: 0, pre: ['stand', 'lookHips'], preF: 1, turn: ['wow', 'shade'], after: ['look'] }) });
  add({ id: 'leader', x: 112, y: () => 790, spec: { kind: 'tunic', robe: C.blue, hat: 'straw' }, state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: b % 4 < 2 ? 'walkA' : 'walkB', f: -1 };
    return { pose: q < 3 ? 'look' : 'point', f: 1 };
  } });
  add({ id: 'donkey', x: 146, y: () => 788, special: 'donkey', box: [-16, -40, 26, 4], state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: b % 4 < 2 ? 'A' : 'B', f: -1 };
    return { pose: 'up', f: 1 };
  } });
  add({ id: 'chatA', x: 224, y: () => 782, s: 0.98, spec: { kind: 'robe', robe: C.ochre, hat: 'futou' }, state: onlooker({ x: 224, ph: 0, pre: ['stand', 'hipsStand'], preF: 1, turn: ['point', 'look'], after: ['look'] }) });
  add({ id: 'chatB', x: 246, y: () => 785, s: 0.96, spec: { kind: 'robe', robe: C.white, hat: 'futou' }, state: onlooker({ x: 246, ph: 1, pre: ['stand', 'stand'], preF: -1, turn: ['wow', 'look'], after: ['look'] }) });
  // balcony drinkers (upper floor of the wine house; only the upper body shows)
  add({ id: 'drinkA', x: 124, y: () => 668, s: 0.92, clip: -14.5, spec: { kind: 'robe', robe: C.white, hat: 'futou' }, state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: b % 4 < 2 ? 'cup' : 'stand', f: 1 };
    return { pose: q < 3.5 ? 'point' : 'look', f: 1 };
  } });
  add({ id: 'drinkB', x: 182, y: () => 668, s: 0.92, clip: -14.5, spec: { kind: 'robe', robe: C.green, hat: 'futou', beard: true }, state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: b % 4 < 2 ? 'stand' : 'cup', f: -1 };
    return { pose: q < 3 ? 'wow' : 'look', f: 1 };
  } });
  // ---- right bank
  add({ id: 'sedan', x: 808, y: () => 790, special: 'sedan', box: [-46, -58, 46, 6], pos: (u) => 806 - 5 * Math.min(Math.max(u, -7), 2) + 10, state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { pose: b % 2 ? 'A' : 'B', f: -1 };
    return { pose: 'stop', f: -1 };
  } });
  add({ id: 'child', x: 868, y: () => 788, spec: { kind: 'kid', robe: C.verm, hat: 'kid', trousers: '#e1d7c2' }, box: [-24, -44, 24, 4],
    pos: (u) => (u < 3 ? 868 : 868 + 14 * Math.min(u - 3, 6)),
    state: (u) => {
      const q = q4(u), b = beatOf(u);
      if (q < 2) return { pose: b % 4 < 2 ? 'stand' : 'walkA', f: -1 };
      if (q < 3) return { pose: 'look', f: -1 };
      return { pose: b % 2 ? 'rideA' : 'rideB', f: 1 };
    } });
  add({ id: 'teaman', x: 916, y: () => 776, s: 0.96, spec: { kind: 'tunic', robe: C.white, hat: 'bun' }, state: onlooker({ x: 916, ph: 1, pre: ['stand', 'lookHips'], turn: ['wow', 'point'], after: ['pointFwd', 'look'] }) });
  add({ id: 'elder', x: 966, y: () => 790, spec: { kind: 'robe', robe: '#b5ab98', hat: 'futou', beard: true }, state: (u) => {
    const q = q4(u);
    if (q < 2) return { pose: 'staff', f: -1 };
    return { pose: 'staffLook', f: q < 5.5 ? -1 : 1 };
  } });
  // ---- boat crew
  const crew = (c) => add({ side: 'boat', box: [-50, -68, 50, 46], s: 1.02, ...c });
  crew({ id: 'h1', x: 352, y: () => gun(352) - 11, spec: { kind: 'tunic', robe: '#d8cdb3', hat: 'bun' }, state: (u) => haulerState(u, 0) });
  crew({ id: 'h2', x: 386, y: () => gun(386) - 12, spec: { kind: 'tunic', robe: C.blue, hat: 'straw' }, state: (u) => haulerState(u, 1) });
  crew({ id: 'capt', x: 548, y: () => 873, spec: { kind: 'tunic', robe: C.white, hat: 'futou' }, state: (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2.25) return { pose: b % 2 ? 'shoutA' : 'shoutB', f: -1 };
    if (q < 2.5) return { pose: 'look', f: faceTo(548, headX(q)) };
    if (q < 3) return { pose: 'duck', f: -1 };
    if (q < 4.5) return { pose: q < 3.5 ? 'wow' : 'look', f: faceTo(548, headX(q)) };
    return { pose: b % 2 ? 'shoutA' : 'shoutB', f: -1 };
  } });
  crew({ id: 'p1', x: 590, y: () => gun(590) - 2, spec: { kind: 'tunic', robe: '#cdbf9f', hat: 'straw' }, state: (u) => polerState(u, 0) });
  crew({ id: 'p2', x: 640, y: () => gun(640) - 2, spec: { kind: 'tunic', robe: C.green, hat: 'bun' }, state: (u) => polerState(u, 1) });
  crew({ id: 'helm', x: 806, y: () => gun(806) - 10, spec: { kind: 'tunic', robe: C.ochre, hat: 'straw' }, state: (u) => {
    const q = q4(u);
    if (q < 2.25 || q >= 6) return { pose: 'steer', f: 1 };
    return { pose: 'steerLook', f: -1 };
  } });
  for (const c of cast) c.s *= c.side === 'boat' ? 1.1 : 1.2;    // the crowd at a size that reads on screen
  return cast;
}
function haulerState(u, ph) {
  const q = q4(u), b = beatOf(u);
  if (q < 2.25) return { pose: (b + ph) % 2 ? 'haulA' : 'haulB', f: 1 };
  if (q < 2.75) return { pose: 'haulLook', f: 1 };
  if (q < 4.5) return { pose: (b + ph) % 2 ? 'wow' : 'haulLook', f: 1 };
  const h = Math.floor(u * 4 + 1e-6);
  return { pose: (h + ph) % 2 ? 'haulA' : 'haulB', f: 1 };   // scrambling: double time
}
function polerState(u, ph) {
  const q = q4(u), b = beatOf(u);
  if (q < 2.25 || q >= 5) return { pose: Math.floor((b + ph) / 2) % 2 ? 'puntA' : 'puntB', f: 1 };
  return { pose: 'puntLook', f: -1 };
}
POSES.hipsStand = { legs: 'stand', arms: 'hips', lean: 0, nod: 0.05 };

// hands of a hauler (for the live rope)
function haulerHand(c, u) {
  const st = c.state(u);
  const P = POSES[st.pose];
  if (!P || P.front) return null;
  const J = figGeom(c.spec, P);
  const h = J.armN[2];
  return [c.x + st.f * h[0] * c.s, c.y() + h[1] * c.s];
}

// ------------------------------------------------------------------ sprite atlas
function spriteKey(c, st) { return `${c.id}|${st.pose}|${st.f}`; }

function paintCastSprite(x, c, st) {
  x.save();
  x.scale(st.f, 1);
  if (c.special === 'donkey') paintDonkey(x, { legs: st.pose === 'up' ? 'S' : st.pose, head: st.pose === 'up' ? 'up' : 'down' });
  else if (c.special === 'sedan') paintSedan(x, { step: st.pose });
  else {
    const P = POSES[st.pose];
    if (P) paintFigure(x, c.spec, P);
  }
  x.restore();
}

function buildAtlas(cast) {
  const sprites = [];
  for (const c of cast) {
    const keys = new Map();
    for (let i = -36; i <= 60; i++) { const u = i / 4; const st = c.state(u); keys.set(spriteKey(c, st), st); }
    for (const [key, st] of keys) {
      const [a0, by0, a1, by1] = c.box;
      const box = st.f < 0 ? [-a1, by0, -a0, by1] : [a0, by0, a1, by1];   // mirrored figures need the mirrored cell
      const w = Math.ceil((box[2] - box[0]) * c.s * SP), h = Math.ceil((box[3] - box[1]) * c.s * SP);
      sprites.push({ key, c, st, w, h, box });
    }
  }
  const AW = 2048, PAD = 2;
  const order = sprites.slice().sort((a, b) => b.h - a.h);
  let cx = PAD, cy = PAD, rowH = 0;
  for (const sp of order) {
    if (cx + sp.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
    sp.ax = cx; sp.ay = cy; cx += sp.w + PAD; rowH = Math.max(rowH, sp.h);
  }
  const AH = Math.ceil((cy + rowH + PAD) / 16) * 16;
  const atlas = mk(AW, AH), x = c2d(atlas);
  const map = new Map();
  for (const sp of sprites) {
    const c = sp.c, [bx0, by0, bx1, by1] = sp.box;
    x.save();
    x.beginPath(); x.rect(sp.ax, sp.ay, sp.w, sp.h); x.clip();
    x.translate(sp.ax - bx0 * c.s * SP, sp.ay - by0 * c.s * SP);
    x.scale(SP * c.s, SP * c.s);
    if (c.clip != null) { x.beginPath(); x.rect(bx0, by0, bx1 - bx0, c.clip - by0); x.clip(); }
    paintCastSprite(x, c, sp.st);
    x.restore();
    map.set(sp.key, { ox: bx0 * c.s, oy: by0 * c.s, w: (bx1 - bx0) * c.s, h: (by1 - by0) * c.s, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  }
  // sink the sprites into the silk a touch (light colour on silk, never pure white)
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(200,180,140,0.12)'; x.fillRect(0, 0, AW, AH);
  x.globalCompositeOperation = 'source-over';
  return { atlas, AW, AH, map, n: sprites.length };
}

// ------------------------------------------------------------------ architecture (Canvas2D, panel units)
function roof(x, x0, x1, eaveY, ridgeY, o = {}) {
  // hip-and-gable roof seen slightly from above: eave curve lifting at the corners, tiles, ridge with end ornaments
  const lift = o.lift ?? 6, inset = o.inset ?? 28;
  const eave = (t) => [lerp(x0, x1, t), eaveY - lift * (Math.pow(Math.abs(t - 0.5) * 2, 4))];
  const E = []; for (let i = 0; i <= 24; i++) E.push(eave(i / 24));
  const R0 = [x0 + inset, ridgeY], R1 = [x1 - inset, ridgeY];
  const shape = [...E, [x1 - inset * 0.55, lerp(eaveY, ridgeY, 0.55)], R1, R0, [x0 + inset * 0.55, lerp(eaveY, ridgeY, 0.55)]];
  fillP(x, shape, o.col || '#8b8f8a', o.alpha ?? 0.42);
  // tile rows
  const n = Math.round((x1 - x0) / (o.tile ?? 3.2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const e = eave(t);
    const rx = lerp(R0[0] - inset * 0.3, R1[0] + inset * 0.3, t);
    const top = t < 0.12 || t > 0.88 ? lerp(eaveY, ridgeY, 0.55 + (0.12 - Math.min(t, 1 - t)) * 2) : ridgeY + 1;
    rl(x, [[e[0], e[1] - 0.6], [lerp(e[0], rx, 0.4), lerp(e[1], top, 0.4)], [rx, top]], o.tw ?? 0.32, o.tt ?? 0.62, 0.9);
  }
  rl(x, E, o.ew ?? 0.9, 0.92);
  rl(x, [E[0], [x0 + inset * 0.55, lerp(eaveY, ridgeY, 0.55)], R0, R1, [x1 - inset * 0.55, lerp(eaveY, ridgeY, 0.55)], E[E.length - 1]], 0.7, 0.9);
  // ridge
  rl(x, [[R0[0] - 2, ridgeY - 1.5], [R1[0] + 2, ridgeY - 1.5]], 1.6, 0.92);
  for (const [px, s] of [[R0[0] - 2, -1], [R1[0] + 2, 1]]) rl(x, [[px, ridgeY - 1.5], [px + s * 1.5, ridgeY - 6], [px - s * 1.2, ridgeY - 7.5]], 0.9, 0.92);
  // eave board + rafter ends
  rl(x, E.map(([a, b]) => [a, b + 2.4]), 0.45, 0.8);
  for (let i = 1; i < 24; i += 1) { const e = eave(i / 24); rl(x, [[e[0], e[1] + 2.4], [e[0], e[1] + 4.6]], 0.35, 0.75); }
}

function posts(x, xs, y0, y1, w = 0.6) { for (const px of xs) { rl(x, [[px - 1.1, y0], [px - 1.1, y1]], w, 0.9); rl(x, [[px + 1.1, y0], [px + 1.1, y1]], w, 0.9); } }

function lattice(x, x0, y0, x1, y1, step = 3.2, t = 0.7) {
  for (let px = x0 + step; px < x1 - 0.5; px += step) rl(x, [[px, y0], [px, y1]], 0.3, t);
  for (let py = y0 + step; py < y1 - 0.5; py += step) rl(x, [[x0, py], [x1, py]], 0.3, t);
  outl(x, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 0.55, 0.88);
}

function blind(x, x0, y0, x1, y1) {
  fillP(x, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], '#c7aa74', 0.55);
  for (let px = x0 + 1.2; px < x1; px += 1.4) rl(x, [[px, y0], [px, y1]], 0.22, 0.55, 0.8);
  rl(x, [[x0, y1], [x1, y1]], 0.7, 0.85);
  rl(x, [[x0 + 3, y0], [x0 + 3, y1 + 4]], 0.3, 0.7); rl(x, [[x1 - 3, y0], [x1 - 3, y1 + 4]], 0.3, 0.7);
}

function wineHouse(x) {
  // 酒楼 on the left bank: two storeys, balcony, blinds, a big roof
  const X0 = 4, X1 = 246, base = STREET.far;
  // ground floor interior + counter
  fillP(x, [[X0, 676], [X1, 676], [X1, base], [X0, base]], tn(0.55), 0.5);
  fillP(x, [[X0, 676], [X1, 676], [X1, 700], [X0, 700]], tn(0.7), 0.35);
  const cnt = [[60, 746], [190, 746], [190, 770], [60, 770]];
  fillP(x, cnt, C.wood, 0.85); outl(x, cnt, 0.6);
  for (let px = 66; px < 190; px += 9) rl(x, [[px, 744], [px, 764]], 0.35, 0.75);
  // jars on the counter
  for (const jx of [78, 96, 160]) { const jar = [[jx - 4, 742], [jx - 5, 734], [jx - 2.5, 730], [jx + 2.5, 730], [jx + 5, 734], [jx + 4, 742]]; fillP(x, jar, '#6f665a', 0.9); outl(x, jar, 0.5); }
  posts(x, [X0 + 3, 66, 128, 190, X1 - 3], 676, base);
  blind(x, 8, 680, 62, 700); blind(x, 194, 680, 242, 706);
  // lower pent roof between floors
  const pent = [[X0 - 8, 668], [X1 + 8, 668], [X1 + 2, 676], [X0 - 2, 676]];
  fillP(x, pent, '#8b8f8a', 0.45); outl(x, pent, 0.6);
  for (let px = X0 - 4; px < X1 + 6; px += 3) rl(x, [[px, 668.5], [px - 1, 675.5]], 0.28, 0.62);
  // upper floor
  fillP(x, [[X0 + 8, 590], [X1 - 8, 590], [X1 - 8, 668], [X0 + 8, 668]], tn(0.5), 0.45);
  for (let i = 0; i < 6; i++) { const lx = X0 + 14 + i * 37; lattice(x, lx, 602, lx + 30, 640, 3.4, 0.62); }
  posts(x, [X0 + 9, 86, 166, X1 - 9], 590, 668, 0.55);
  // balcony rail
  rl(x, [[X0 + 2, 652], [X1 - 2, 652]], 1.1, 0.9); rl(x, [[X0 + 2, 660], [X1 - 2, 660]], 0.6, 0.85);
  for (let px = X0 + 4; px < X1; px += 7) rl(x, [[px, 652], [px, 667]], 0.4, 0.82);
  // roof
  roof(x, X0 - 22, X1 + 24, 590, 536, { lift: 9, inset: 40, col: '#848a88' });
  // brackets under the eave
  for (let px = X0 + 12; px < X1; px += 24) { const b = [[px - 4, 592], [px + 4, 592], [px + 2.5, 596], [px - 2.5, 596]]; fillP(x, b, C.wood, 0.8); outl(x, b, 0.4); }
  // 彩楼欢门: the festive pole gateway over the entrance
  const gx0 = 120, gx1 = 196;
  for (const px of [gx0, gx1]) rl(x, [[px, base], [px, 640]], 0.9, 0.9);
  rl(x, [[gx0 - 6, 646], [gx1 + 6, 646]], 0.8, 0.9); rl(x, [[gx0 - 3, 638], [gx1 + 3, 638]], 0.7, 0.9);
  for (let i = 0; i < 7; i++) { const px = lerp(gx0, gx1, i / 6); rl(x, [[px, 638], [px + (i % 2 ? 4 : -4), 626], [px, 616]], 0.55, 0.85); }
  for (let i = 0; i < 6; i++) { const px = lerp(gx0, gx1, (i + 0.5) / 6); rl(x, [[px - 5, 646], [px, 652], [px + 5, 646]], 0.45, 0.8); }
}

function rightShops(x) {
  const base = STREET.far;
  // a run of single-storey shops with awnings
  const shops = [[704, 790, 668], [790, 880, 676], [880, 1004, 662]];
  shops.forEach(([a, b, eave], k) => {
    fillP(x, [[a + 4, eave + 6], [b - 4, eave + 6], [b - 4, base], [a + 4, base]], tn(0.5), 0.42);
    posts(x, [a + 6, (a + b) / 2, b - 6], eave + 6, base, 0.55);
    if (k === 1) blind(x, a + 10, eave + 10, (a + b) / 2 - 3, eave + 32);
    if (k === 2) lattice(x, a + 14, eave + 14, a + 50, eave + 44, 3.4, 0.6);
  });
  roof(x, 694, 800, 668, 630, { lift: 6, inset: 22 });
  roof(x, 780, 894, 676, 640, { lift: 6, inset: 22, col: '#878b86' });
  roof(x, 870, 1014, 662, 618, { lift: 7, inset: 26 });
  // tea stall: parasol, table, the English menu board (a small joke)
  const px = 930;
  rl(x, [[px, 776], [px + 2, 686]], 0.8, 0.9);
  const can = [[px - 30, 696], [px - 10, 682], [px + 12, 680], [px + 34, 692], [px + 2, 688]];
  const canopy = [[px - 32, 698], [px - 14, 682], [px + 2, 678], [px + 18, 680], [px + 36, 694]];
  fillP(x, canopy, '#ddd2b8', 0.92); outl(x, canopy, 0.6);
  for (let i = 0; i < 5; i++) rl(x, [[px + 2, 679], [canopy[0][0] + i * 17, 697 - Math.abs(i - 2) * 1.2]], 0.32, 0.7);
  void can;
  const tb = [[px - 26, 760], [px + 24, 760], [px + 24, 764], [px - 26, 764]];
  fillP(x, tb, C.wood, 0.9); outl(x, tb, 0.5);
  rl(x, [[px - 22, 764], [px - 22, 782]], 0.6, 0.85); rl(x, [[px + 20, 764], [px + 20, 782]], 0.6, 0.85);
  for (const bx of [px - 16, px - 6, px + 10]) dot(x, [bx, 757.5], 2.2, '#d8d0bf');
}

function stall(x, cx, footY, w = 34, color = '#ddd3bb') {
  // parasol stall: pole, canopy, low table with goods
  rl(x, [[cx + 2, footY], [cx + 3, footY - 74]], 0.75, 0.88);
  const cy = footY - 72;
  const cv = [[cx - w * 0.95, cy + 10], [cx - w * 0.45, cy], [cx + 3, cy - 4], [cx + w * 0.5, cy - 1], [cx + w * 1.05, cy + 9]];
  fillP(x, cv, color, 0.92); outl(x, cv, 0.6);
  for (let i = 0; i < 6; i++) rl(x, [[cx + 3, cy - 3.5], [lerp(cv[0][0], cv[4][0], i / 5), lerp(cv[0][1], cv[4][1], i / 5) - Math.sin(Math.PI * i / 5) * 2]], 0.3, 0.7);
  const tb = [[cx - 14, footY - 16], [cx + 16, footY - 16], [cx + 16, footY - 13], [cx - 14, footY - 13]];
  fillP(x, tb, C.wood, 0.9); outl(x, tb, 0.5);
  rl(x, [[cx - 12, footY - 13], [cx - 12, footY]], 0.5, 0.85); rl(x, [[cx + 14, footY - 13], [cx + 14, footY]], 0.5, 0.85);
  for (let i = 0; i < 4; i++) dot(x, [cx - 9 + i * 7, footY - 18], 1.8, i % 2 ? '#c8a467' : '#a9b49c');
}

function deckBand(x) {
  const X = curve(deckY, 302, 702, 80);
  // deck surface (timber), a touch darker at the far edge
  const top = X.map(([px, py]) => [px, py + FAR]), bot = X.map(([px, py]) => [px, py + NEAR]).reverse();
  fillP(x, [...top, ...bot], '#c9ab79', 0.6);
  const top2 = X.map(([px, py]) => [px, py + FAR + 9]);
  fillP(x, [...top, ...top2.slice().reverse()], tn(0.4), 0.18);
  // deck boards: long runs following the arch; the middle run (the wheel line) is the strongest
  for (const [o, w, t] of [[-21, 0.3, 0.5], [-12, 0.3, 0.52], [-4, 0.32, 0.55], [0, 0.62, 0.78], [8, 0.32, 0.55], [17, 0.3, 0.5], [26, 0.3, 0.48]]) rl(x, X.map(([px, py]) => [px, py + o]), w, t, 0.9);
  for (let px = 318; px < 690; px += 31) { const y = deckY(px); rl(x, [[px, y + FAR + 1], [px + 0.8, y - 0.5]], 0.25, 0.45, 0.6); rl(x, [[px + 15, y + 0.5], [px + 15.6, y + NEAR - 1]], 0.25, 0.45, 0.6); }
  // far railing: posts, mid and top rails, tall end posts with knobs
  const farTop = X.map(([px, py]) => [px, py + FAR - RAIL]), farMid = X.map(([px, py]) => [px, py + FAR - RAIL * 0.5]);
  for (let px = 312; px < 696; px += 17) { const y = deckY(px) + FAR; rl(x, [[px, y], [px, y - RAIL]], 0.55, 0.86); }
  rl(x, farMid, 0.45, 0.8); rl(x, farTop, 0.95, 0.9); rl(x, farTop.map(([a, b]) => [a, b + 1.4]), 0.35, 0.75);
  for (const px of [302, 702]) { const y = deckY(px) + FAR; rl(x, [[px - 1.4, y], [px - 1.4, y - RAIL - 8]], 0.6, 0.9); rl(x, [[px + 1.4, y], [px + 1.4, y - RAIL - 8]], 0.6, 0.9); dot(x, [px, y - RAIL - 10], 2.4, C.wood); }
  rl(x, X.map(([px, py]) => [px, py + FAR]), 0.65, 0.82);
}

function nearRailing(x) {
  const X = curve(deckY, 302, 702, 80);
  // fascia beam along the near edge of the deck
  const f0 = X.map(([px, py]) => [px, py + NEAR]), f1 = X.map(([px, py]) => [px, py + NEAR + 9]).reverse();
  fillP(x, [...f0, ...f1], '#b39062', 0.92);
  rl(x, f0, 0.75, 0.9); rl(x, f1.slice().reverse(), 0.75, 0.9);
  rl(x, X.map(([px, py]) => [px, py + NEAR + 4.5]), 0.28, 0.65);
  for (let px = 330; px < 690; px += 46) { const y = deckY(px); rl(x, [[px, y + NEAR], [px, y + NEAR + 9]], 0.42, 0.82); }
  // posts and rails (light: the deck behind must read)
  const top = NEAR - RAIL;
  for (let px = 308; px < 698; px += 21) { const y = deckY(px); rl(x, [[px - 0.8, y + NEAR], [px - 0.8, y + top]], 0.5, 0.86); rl(x, [[px + 0.8, y + NEAR], [px + 0.8, y + top]], 0.5, 0.86); }
  rl(x, X.map(([px, py]) => [px, py + top + RAIL * 0.55]), 0.45, 0.78);
  rl(x, X.map(([px, py]) => [px, py + top]), 1.05, 0.88);
  rl(x, X.map(([px, py]) => [px, py + top + 1.6]), 0.3, 0.7);
  for (const px of [302, 702]) {
    const y = deckY(px);
    const p = [[px - 3, y + NEAR], [px + 3, y + NEAR], [px + 3, y + top - 5], [px - 3, y + top - 5]];
    fillP(x, p, C.wood, 0.95); outl(x, p, 0.6);
    dot(x, [px, y + top - 7.5], 3, '#b39466');
  }
}

function archFace(x) {
  // the woven-timber arch (虹桥): straight beams jointed into a polygonal arch, log ends at the joints
  const n = 10, xs = [];
  for (let i = 0; i <= n; i++) xs.push(lerp(ARCH.c - SPRING, ARCH.c + SPRING, i / n));
  const top = xs.map((px) => [px, archTop(px)]), bot = xs.map((px) => [px, soffit(px)]);
  // the far face of the arch, in the shadow beneath the deck
  const ftop = xs.map((px) => [px, archTop(px) - 30]), fbot = xs.map((px) => [px, soffit(px) - 30]);
  fillP(x, [...ftop, ...fbot.slice().reverse()], '#8d7350', 0.5);
  rl(x, fbot, 0.5, 0.8, 0.8);
  xs.forEach((px, i) => { if (i > 0 && i < n) rl(x, [[px, soffit(px) - 30], [px, soffit(px)]], 0.6, 0.8, 0.7); });
  fillP(x, [...top, ...bot.slice().reverse()], '#ad8a5b', 0.94);
  rl(x, top, 0.85, 0.93); rl(x, bot, 0.85, 0.93);
  rl(x, xs.map((px) => [px, archTop(px) + ARCH.th * 0.5]), 0.42, 0.8);
  xs.forEach((px, i) => {
    if (i === 0 || i === n) return;
    rl(x, [[px, archTop(px)], [px, soffit(px)]], 0.55, 0.9);
    dot(x, [px - 2.8, archTop(px) + ARCH.th * 0.27], 2.2, '#caa977');
    dot(x, [px + 2.8, archTop(px) + ARCH.th * 0.73], 2.2, '#caa977');
  });
  // short struts between the arch and the deck fascia
  for (let px = 330; px < 690; px += 24) {
    const y0 = deckY(px) + NEAR + 9, y1 = archTop(px);
    if (y1 - y0 > 2.5) rl(x, [[px, y0], [px, y1]], 0.5, 0.84);
  }
  // stone footings at the springing
  for (const sx of [ARCH.c - SPRING, ARCH.c + SPRING]) {
    const f = [[sx - 16, 882], [sx + 16, 882], [sx + 18, 898], [sx - 18, 898]];
    fillP(x, f, '#a8a194', 0.92); outl(x, f, 0.6);
    rl(x, [[sx - 17, 890], [sx + 17, 890]], 0.4, 0.8); rl(x, [[sx, 882], [sx, 890]], 0.4, 0.8); rl(x, [[sx - 8, 890], [sx - 8, 898]], 0.4, 0.8); rl(x, [[sx + 9, 890], [sx + 9, 898]], 0.4, 0.8);
  }
}

function embankments(x) {
  // street curbs and stone embankments along the river
  for (const [a, b] of [[-6, 302], [702, 1006]]) {
    const curb = [[a, STREET.near], [b, STREET.near], [b, STREET.curb], [a, STREET.curb]];
    fillP(x, curb, '#b4a891', 0.6); rl(x, [[a, STREET.near], [b, STREET.near]], 0.7, 0.88); rl(x, [[a, STREET.curb], [b, STREET.curb]], 0.5, 0.8);
    for (let px = a + 14; px < b; px += 26) rl(x, [[px, STREET.near], [px, STREET.curb]], 0.35, 0.72);
  }
  // diagonal walls toward the viewer
  for (const [top, botP, s] of [[[296, STREET.curb], [150, 1004], -1], [[712, STREET.curb], [858, 1004], 1]]) {
    const W = 9;
    const face = [top, botP, [botP[0] - s * W, botP[1]], [top[0] - s * W, top[1]]];
    fillP(x, face, '#b8ad98', 0.75); rl(x, [top, botP], 0.8, 0.9); rl(x, [[top[0] - s * W, top[1]], [botP[0] - s * W, botP[1]]], 0.5, 0.8);
    for (let t = 0.06; t < 1; t += 0.07) { const p = [lerp(top[0], botP[0], t), lerp(top[1], botP[1], t)]; rl(x, [p, [p[0] - s * W, p[1]]], 0.35, 0.72); }
  }
}

function boat(x) {
  // the big grain boat: hull, side deck, cabin with lattice windows, mat roof, stern house, bow windlass
  const X0 = HULL.x0, X1 = HULL.x1;
  const G0 = curve(gun, X0 + 10, X1 - 10, 40);
  const farG = G0.map(([px, py]) => [px, py - 20]);
  const wl = (px) => gun(px) + 30 - 8 * ((px - 571) / 271) ** 2;
  // hull side
  const side = [[X0, gun(X0 + 10) - 8], ...G0, [X1, gun(X1 - 10) - 10], [X1 - 22, wl(X1 - 30)], ...curve(wl, X1 - 40, X0 + 40, 30), [X0 + 20, wl(X0 + 30)]];
  fillP(x, side, '#a3835a', 0.9);
  outl(x, side, 0.85);
  for (let k = 1; k <= 3; k++) rl(x, curve((px) => lerp(gun(px), wl(px), k / 4), X0 + 22, X1 - 24, 30), 0.35, 0.72);
  for (let px = X0 + 60; px < X1 - 40; px += 54) rl(x, [[px, gun(px) + 1], [px - 2, wl(px) - 2]], 0.3, 0.65);
  // deck (seen from above) between far and near gunwales
  fillP(x, [...farG, ...G0.slice().reverse()], '#c6a676', 0.9);
  rl(x, farG, 0.6, 0.85);
  for (let px = X0 + 22; px < X1 - 20; px += 8) rl(x, [[px, gun(px) - 20], [px + 2, gun(px)]], 0.22, 0.55);
  // cabin
  const c0 = 432, c1 = 728;
  const wallTop = (px) => gun(px) - 44, wallBot = (px) => gun(px) - 6;
  const wall = [...curve(wallTop, c0, c1, 12), ...curve(wallBot, c1, c0, 12)];
  fillP(x, wall, '#b8976b', 0.94); outl(x, wall, 0.7);
  for (let px = c0 + 6; px < c1 - 30; px += 30) lattice(x, px, wallTop(px) + 7, px + 22, wallTop(px) + 26, 3.2, 0.6);
  // mat roof: a low barrel vault
  const crest = (px) => wallTop(px) - 15 - 3 * Math.sin(Math.PI * (px - c0) / (c1 - c0));
  const rf0 = curve((px) => wallTop(px) - 3, c0 - 8, c1 + 8, 16), rf1 = curve(crest, c1 + 4, c0 - 4, 16);
  fillP(x, [...rf0, ...rf1], '#ad966e', 0.94); outl(x, [...rf0, ...rf1], 0.7);
  for (let px = c0; px < c1; px += 4.2) rl(x, [[px, wallTop(px) - 3], [px + 3, crest(px)]], 0.22, 0.6);
  for (let k = 0; k < 3; k++) rl(x, curve((px) => wallTop(px) - 6 - k * 4 - 1.5 * k * Math.sin(Math.PI * (px - c0) / (c1 - c0)), c0, c1, 16), 0.28, 0.66);
  // stern house
  const st = [[742, gun(742) - 30], [800, gun(800) - 34], [802, gun(802) - 4], [742, gun(742) - 4]];
  fillP(x, st, '#b18f63', 0.94); outl(x, st, 0.65); lattice(x, 752, gun(752) - 26, 790, gun(790) - 10, 3.2, 0.58);
  // bow: windlass, coiled rope
  rl(x, [[322, gun(322) - 12], [338, gun(338) - 12]], 2.2, 0.9);
  x.beginPath(); x.ellipse(410, gun(410) - 10, 7, 2.6, 0, 0, Math.PI * 2); x.strokeStyle = rgba(tn(0.85)); x.lineWidth = 0.6; x.stroke();
  x.beginPath(); x.ellipse(410, gun(410) - 10, 4, 1.4, 0, 0, Math.PI * 2); x.stroke();
  // waterline ripples hugging the hull
  for (let k = 0; k < 9; k++) { const px = X0 + 40 + k * 56; rl(x, [[px, wl(px) + 3], [px + 16, wl(px) + 1.8], [px + 30, wl(px) + 3.4]], 0.4, 0.52, 0.9); }
}

function cityGate(x) {
  // the distant city wall and its gate tower, in pale ruled lines through the mist
  const wy0 = 286, wy1 = 316;
  fillP(x, [[600, wy0 + 4], [1006, wy0 - 2], [1006, wy1], [600, wy1 + 4]], '#a69e8c', 0.32);
  rl(x, [[600, wy0 + 4], [1006, wy0 - 2]], 0.5, 0.5, 0.8);
  for (let px = 606; px < 1000; px += 9) rl(x, [[px, wy0 + 4 - (px - 600) * 0.015], [px, wy0 + 1 - (px - 600) * 0.015]], 0.4, 0.45, 0.7);
  // gate passage
  const gx = 860;
  x.beginPath(); x.moveTo(gx - 10, wy1); x.lineTo(gx - 10, wy0 + 14); x.quadraticCurveTo(gx, wy0 + 6, gx + 10, wy0 + 14); x.lineTo(gx + 10, wy1); x.closePath();
  x.fillStyle = rgba(tn(0.45), 0.4); x.fill();
  // tower: platform, hall, two roofs
  fillP(x, [[gx - 46, wy0 - 2], [gx + 46, wy0 - 2], [gx + 46, wy0 + 6], [gx - 46, wy0 + 6]], '#a39b89', 0.4);
  fillP(x, [[gx - 34, 250], [gx + 34, 250], [gx + 34, wy0 - 2], [gx - 34, wy0 - 2]], tn(0.35), 0.25);
  posts(x, [gx - 30, gx - 10, gx + 10, gx + 30], 252, wy0 - 2, 0.4);
  roof(x, gx - 52, gx + 52, 252, 232, { lift: 6, inset: 22, col: '#959a96', alpha: 0.32, tt: 0.42, ew: 0.6, tw: 0.24 });
  roof(x, gx - 40, gx + 40, 228, 210, { lift: 5, inset: 18, col: '#959a96', alpha: 0.32, tt: 0.42, ew: 0.55, tw: 0.24 });
  // veil of mist over the wall foot
  const g = x.createLinearGradient(0, 298, 0, 340);
  g.addColorStop(0, 'rgba(205,188,150,0)'); g.addColorStop(0.6, 'rgba(205,188,150,0.55)'); g.addColorStop(1, 'rgba(205,188,150,0)');
  x.fillStyle = g; x.fillRect(590, 294, 420, 50);
}

function farBank(x) {
  // houses on the far banks (pale, smaller), moored boats with masts, a few people
  // drawn back to front so nearer roofs overlap the ones behind
  const roofs = [[930, 1012, 380, 362, 0.26, 18], [846, 936, 386, 366, 0.26, 18], [756, 842, 396, 376, 0.27, 18], [20, 100, 388, 370, 0.26, 18], [140, 226, 394, 376, 0.27, 18],
    [664, 760, 424, 400, 0.3, 22], [862, 978, 430, 404, 0.3, 24], [236, 330, 426, 404, 0.3, 22],
    [600, 690, 462, 438, 0.32, 22], [740, 846, 470, 442, 0.33, 26], [92, 196, 452, 428, 0.32, 24],
    [900, 1010, 474, 446, 0.34, 26], [560, 640, 500, 478, 0.33, 20], [612, 716, 536, 508, 0.36, 26]];
  for (const [a, b, e, r, al, hh] of roofs) {
    fillP(x, [[a + 8, e + 2], [b - 8, e + 2], [b - 8, e + hh], [a + 8, e + hh]], '#b8a27c', 0.55);
    fillP(x, [[a + 8, e + 2], [b - 8, e + 2], [b - 8, e + hh], [a + 8, e + hh]], tn(0.45), 0.18);
    posts(x, [a + 10, (a + b) / 2, b - 10], e + 3, e + hh, 0.35);
    rl(x, [[a + 8, e + hh], [b - 8, e + hh]], 0.4, 0.55);
    roof(x, a, b, e, r, { lift: 4, inset: 16, col: '#949a95', alpha: al, tt: 0.45, ew: 0.6, tw: 0.24 });
  }

  // embankment edge of the far banks along the river
  rl(x, FARBANK_L.slice(3, 9), 0.6, 0.6, 0.8);
  rl(x, FARBANK_R.slice(0, 6), 0.6, 0.6, 0.8);
  // moored boats along the far banks
  for (const [bx, by, L, mast] of [[292, 672, 66, 60], [612, 640, 78, 84], [526, 560, 52, 46], [668, 704, 60, 0], [360, 520, 46, 36], [450, 480, 40, 0]]) {
    const h = [[bx, by], [bx + L, by - 3], [bx + L - 6, by + 8], [bx + 8, by + 9]];
    fillP(x, h, '#9b8462', 0.62); outl(x, h, 0.42, 0.62);
    const cab = [[bx + L * 0.3, by - 1], [bx + L * 0.75, by - 2], [bx + L * 0.72, by - 9], [bx + L * 0.33, by - 9]];
    fillP(x, cab, '#a69373', 0.62); outl(x, cab, 0.38, 0.62);
    if (mast) { rl(x, [[bx + L * 0.5, by - 9], [bx + L * 0.52, by - 9 - mast]], 0.6, 0.62); rl(x, [[bx + L * 0.52, by - 9 - mast], [bx + L * 0.1, by - 2]], 0.25, 0.5); }
  }
  // far-bank pedestrians (static, tiny)
  const r = rng(hash(ID, 'farFolk'));
  const spots = [[340, 500], [312, 560], [548, 520], [578, 556], [640, 530], [724, 516], [770, 524], [860, 512], [966, 508], [96, 480], [120, 410], [200, 486], [262, 500], [628, 604], [664, 640], [420, 446], [540, 444], [730, 420], [860, 410]];
  const poses = ['walkA', 'walkB', 'stand', 'poleA', 'staff', 'walkB', 'stand'];
  spots.forEach(([px, py], k) => {
    x.save(); x.translate(px, py); x.scale((r() < 0.5 ? -1 : 1) * 0.56, 0.56);
    x.globalAlpha = 0.78;
    paintFigure(x, { kind: r() < 0.5 ? 'robe' : 'tunic', robe: [C.white, C.ochre, C.blue, C.green, '#c8bda5'][k % 5], hat: ['futou', 'straw', 'bun'][k % 3] }, POSES[poses[k % poses.length]]);
    x.restore();
  });
}

function foreground(x) {
  // near banks: a small moored skiff, rocks
  const sk = [[182, 968], [262, 960], [254, 974], [192, 980]];
  fillP(x, sk, '#9c7f56', 0.85); outl(x, sk, 0.6);
  rl(x, [[198, 962], [246, 958]], 0.4, 0.75);
  rl(x, [[222, 960], [212, 916]], 0.6, 0.85);
  for (const [rx, ry, rr] of [[40, 940, 16], [96, 982, 11], [962, 864, 12], [918, 992, 13]]) {
    const st = ink.blob(rx, ry, rr, rr * 0.5, hash(ID, 'rock', rx), 9);
    fillP(x, st, '#a49a87', 0.6); outl(x, st.slice(0, 6), 0.7, 0.88);
  }
}

function paintArchitecture(K) {
  return K.layer(`${ID}:arch`, BK, BK, (x) => {
    x.setTransform(PXU, 0, 0, PXU, 0, 0);
    cityGate(x);
    farBank(x);
    wineHouse(x);
    rightShops(x);
    deckBand(x);
    stall(x, 284, 794, 30, '#e0d6bf');
    stall(x, 682, farY(682) + 3, 32, '#d9cfb6');
    embankments(x);
    archFace(x);
    nearRailing(x);
    boat(x);
    foreground(x);
  });
}

// the near railing again, as an overlay above the near-side figures
function railOverlay(K) {
  const R = { x0: 290, y0: 720, x1: 716, y1: 850 };
  const s = 2;
  const img = K.layer(`${ID}:rail`, (R.x1 - R.x0) * s, (R.y1 - R.y0) * s, (x) => {
    x.setTransform(s, 0, 0, s, -R.x0 * s, -R.y0 * s);
    nearRailing(x);
  });
  return { img, R };
}

// ------------------------------------------------------------------ titles and seal
function titleLayer(K) {
  // the wine flag 「清明上河图」 and a signboard 「约公元一一〇〇年」, painted into the cloth / board
  return K.layer(`${ID}:title`, BK, BK, (x) => {
    x.setTransform(PXU, 0, 0, PXU, 0, 0);
    // flag pole and cross bar
    const px = 214;
    rl(x, [[px, 770], [px + 1.5, 226]], 1.6, 0.9);
    rl(x, [[px - 50, 236], [px + 2, 232]], 1.1, 0.9);
    dot(x, [px + 1.5, 224], 2.4, C.wood);
    // cloth: a long white banner with a blue-green heading band, gently waving
    const fx0 = 160, fx1 = 206, fy0 = 238, fy1 = 470;
    const wav = (y) => Math.sin((y - fy0) * 0.025) * 2.4;
    const cloth = [...curve((y) => fx0 + wav(y), fy0, fy1, 20).map(([a, b]) => [b, a]), ...curve((y) => fx1 + wav(y), fy1, fy0, 20).map(([a, b]) => [b, a])];
    const fixed = cloth.map(([a, b]) => [a, b]);
    fillP(x, fixed, '#ebe3d0', 0.95);
    for (const [fx, fw, fa] of [[fx0 + 9, 7, 0.12], [fx0 + 24, 5, 0.08], [fx1 - 8, 6, 0.13]]) {   // soft folds in the cloth
      const fold = [...curve((y) => fx + wav(y) * 1.3, fy0 + 18, fy1, 16).map(([a, b]) => [b, a]), ...curve((y) => fx + fw + wav(y) * 1.3, fy1, fy0 + 18, 16).map(([a, b]) => [b, a])];
      fillP(x, fold, '#8d7a5c', fa);
    }
    const band = [[fx0, fy0], [fx1, fy0], [fx1 + wav(fy0 + 18), fy0 + 18], [fx0 + wav(fy0 + 18), fy0 + 18]];
    fillP(x, band, '#7f998d', 0.9);
    outl(x, fixed, 0.7, 0.9);
    // tails of the flag
    for (const [a, b] of [[fx0 + wav(fy1), fx0 + 16], [fx1 - 16 + wav(fy1), fx1 + wav(fy1)]]) {
      const t = [[a, fy1], [b, fy1], [(a + b) / 2 + 2, fy1 + 22]];
      fillP(x, t, '#ebe3d0', 0.95); outl(x, t, 0.6, 0.88);
    }
    rl(x, [[fx0 - 1, fy0 - 2], [fx1 + 1, fy0 - 2]], 0.8, 0.9);
    for (const tx of [fx0 + 6, fx1 - 6]) rl(x, [[tx, fy0 - 2], [tx + 6, 234]], 0.5, 0.85);
    brushedText(x, K, '清明上河图', (fx0 + fx1) / 2, fy0 + 26, 38, { wav, color: '#1f1915' });
    // signboard on a stand
    const b0 = [22, 548], b1 = [92, 724];
    const board = [[b0[0], b0[1]], [b1[0], b0[1]], [b1[0], b1[1]], [b0[0], b1[1]]];
    fillP(x, board, '#d8c49b', 0.95);
    outl(x, board, 0.9, 0.92);
    outl(x, [[b0[0] + 4, b0[1] + 4], [b1[0] - 4, b0[1] + 4], [b1[0] - 4, b1[1] - 4], [b0[0] + 4, b1[1] - 4]], 0.5, 0.85);
    const roofB = [[b0[0] - 6, b0[1]], [(b0[0] + b1[0]) / 2, b0[1] - 12], [b1[0] + 6, b0[1]]];
    fillP(x, roofB, '#7d817d', 0.8); outl(x, roofB, 0.7, 0.9);
    rl(x, [[30, 724], [30, 770]], 1.0, 0.9); rl(x, [[84, 724], [84, 770]], 1.0, 0.9);
    brushedText(x, K, '约公元', 72, b0[1] + 12, 27, { color: '#2a2018' });
    brushedText(x, K, '一一〇〇年', 42, b0[1] + 12, 27, { color: '#2a2018' });
    // a later collector's poem in the empty sky (running script), with his seal
    const poem = ['虹桥人似蚁', '白鹕踏轮来', '举城皆回首', '炊饼滚尘埃'];
    poem.forEach((col, i) => brushedText(x, K, col, 742 - i * 25, 104, 19.5, { color: ink.tone(0.86, G), font: '"Xingkai SC", "Kaiti SC", serif', loss: 30 }));
    brushedText(x, K, '上河散人题', 642, 118, 13, { color: ink.tone(0.8, G), font: '"Xingkai SC", "Kaiti SC", serif', loss: 12 });
    const seal3 = ink.seal(K, '散人', { size: 120, mode: 'red', seed: 13 });
    x.globalAlpha = 0.85; x.drawImage(seal3.canvas, 634, 196, 17, 17); x.globalAlpha = 1;
    // collector's seal, lower left corner
    const seal = ink.seal(K, '鹈鹕珍藏', { size: 220, mode: 'white', seed: 7 });
    x.globalAlpha = 0.86;
    x.drawImage(seal.canvas, 40, 44, 50, 50);
    const seal2 = ink.seal(K, '汴京', { size: 160, mode: 'red', seed: 9 });
    x.drawImage(seal2.canvas, 946, 44, 30, 30);
    x.globalAlpha = 1;
  });
}

/** Vertical script painted onto cloth/board: ink bleed, uneven loading, dry-brush streaks, speckle loss. */
function brushedText(x, K, text, cx, y0, size, o = {}) {
  const r = rng(hash(ID, 'txt', text, size));
  [...text].forEach((ch, i) => {
    const sp = K.textSprite({ text: ch, font: o.font || '"Kaiti SC", "STKaiti", serif', weight: 600, size: 160, color: o.color || '#1f1915' });
    const src = sp.g.canvas || sp.g.elt;
    const sc = size / 160;
    const yy = y0 + i * size * 1.06;
    const dx = o.wav ? o.wav(yy + size / 2) : 0;
    const W = sp.w, H = sp.h;
    const tmp = mk(W, H), tx = c2d(tmp);
    // ink bleeding into the weave, then the stroke itself
    tx.filter = 'blur(3px)'; tx.globalAlpha = 0.3; tx.drawImage(src, 0, 0);
    tx.filter = 'none'; tx.globalAlpha = 1; tx.drawImage(src, 0, 0);
    // uneven loading of the brush: a soft density field
    const nz = mk(24, 24), nx = c2d(nz), id = nx.createImageData(24, 24);
    for (let k = 0; k < 24 * 24; k++) { id.data[k * 4 + 3] = Math.round(255 * (0.6 + 0.4 * r())); }
    nx.putImageData(id, 0, 0);
    tx.globalCompositeOperation = 'destination-in';
    tx.imageSmoothingEnabled = true; tx.drawImage(nz, 0, 0, W, H);
    // dry-brush streaks and speckle loss
    tx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < (o.streaks ?? 5); k++) {
      const yS = r() * H, xS = r() * W, L = 20 + r() * 40, a = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.3;
      tx.globalAlpha = 0.35 + r() * 0.4; tx.lineWidth = 0.8 + r() * 1.6; tx.strokeStyle = '#000';
      tx.beginPath(); tx.moveTo(xS, yS); tx.lineTo(xS + Math.cos(a) * L, yS + Math.sin(a) * L); tx.stroke();
    }
    for (let k = 0; k < (o.loss ?? 90); k++) { tx.globalAlpha = 0.25 + r() * 0.5; tx.beginPath(); tx.arc(r() * W, r() * H, 0.6 + r() * 2.2, 0, Math.PI * 2); tx.fill(); }
    tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
    x.save();
    x.translate(cx + dx, yy + size / 2);
    x.rotate((r() - 0.5) * 0.05);
    x.transform(1, 0, (r() - 0.5) * 0.06, 1, 0, 0);
    x.globalAlpha = o.alpha ?? 0.93;
    x.drawImage(tmp, -W / 2 * sc, -H / 2 * sc, W * sc, H * sc);
    x.restore();
  });
}

// ------------------------------------------------------------------ the pelican in ink and light colour
const PEL = {
  tire: { w: 1.6, t: 0.95 }, rim: { w: 0.55, t: 0.78 }, spoke: { w: 0.32, t: 0.72, lod: 0.45 }, hub: { w: 0.5, t: 0.9 },
  chain: { w: 0.45, t: 0.75, lod: 0.5 }, frame: { w: 1.5, c: C.verm }, fork: { w: 1.3, c: C.verm }, stem: { w: 1.0, t: 0.9 }, bars: { w: 1.0, t: 0.9 },
  seatpost: { w: 0.9, t: 0.88 }, saddle: { w: 2.0, t: 0.95 }, ring: { w: 0.6, t: 0.85 },
  tail: { fill: '#e2d9c4', w: 0.7, t: 0.9 }, body: { fill: '#e8e0cd', w: 0.85, t: 0.92 }, wing: { fill: '#e2dac6', w: 0.75, t: 0.9 },
  secondaries: { w: 0.95, t: 0.82 }, primary: { w: 1.15, t: 0.97 }, neck: { fill: '#e8e0cd', w: 0.75, t: 0.92 },
  head: { fill: '#ebe3d1', w: 0.75, t: 0.92 }, crest: { w: 0.5, t: 0.9, lod: 0.5 }, pouch: { fill: '#d6a86a', w: 0.65, t: 0.88 },
  bill: { fill: '#dcc28e', w: 0.65, t: 0.9 }, nail: { fill: '#b9603f', w: 0 }, face: { fill: '#e7c4a4', w: 0 }, eye: { w: 0.45, t: 0.9 },
  pupil: { fill: '#1c1814', w: 0 }, eyeShut: { w: 0.6, t: 0.92 },
  legFar: { fill: '#c49a74', w: 0.5, t: 0.72 }, footFar: { fill: '#c49a74', w: 0.45, t: 0.72 }, crankFar: { w: 0.8, t: 0.72 },
  leg: { fill: '#d3a77c', w: 0.65, t: 0.9 }, foot: { fill: '#d3a77c', w: 0.55, t: 0.9 }, crank: { w: 1.1, t: 0.95 }, pedal: { w: 1.6, t: 0.95 },
};

function drawPelican(K, ctx) {
  const P = ctx.rider.placed;
  const s = P.place.scale ?? 1;
  const detail = s * ctx.pxu;
  drawRig(K, P, detail);
  // covert feathers on the folded wing (白描 detail): short arcs following the wing's lower edge
  const B = P.bird, w = B.wing, n = w.length;
  for (let k = 0; k < 3; k++) {
    const f = 0.3 + k * 0.17;
    const pts = [];
    for (let j = Math.floor(n * 0.42); j < Math.floor(n * 0.82); j += 2) {
      const p = w[j];
      pts.push([lerp(p[0], B.bodyC[0] + 6, f), lerp(p[1], B.bodyC[1] - 6, f)]);
    }
    if (pts.length > 2) ink.line(K, `${ID}:covert${k}`, pts, { t: 0.62, w: 0.55, fine: true, ground: G, curv: 0.5 });
  }
}

function drawRig(K, P, detail) {
  for (const part of K.rig.parts(P)) {
    const st = PEL[part.role];
    if (!st) continue;
    if (st.lod && detail < st.lod) continue;
    const key = `rider:${part.name}`;
    const col = st.c || ink.tone(st.t ?? 0.9, G);
    if (part.kind === 'circle') {
      if (st.fill) { K.seed(ID, key, 'f'); K.brush.noStroke(); K.brush.wash(st.fill, 238); K.brush.circle(part.c[0], part.c[1], part.r); K.brush.noWash(); }
      if (st.w) { K.seed(ID, key); K.brush.noFill(); K.brush.set(part.role === 'tire' ? 'ink.fine' : `${ID}.rule`, col, st.w * 1.6); K.brush.circle(part.c[0], part.c[1], part.r); }
    } else if (part.kind === 'poly') {
      if (st.fill) ink.flat(K, `${ID}:${key}:f`, part.pts, { color: st.fill, alpha: 238 });
      if (st.w) ink.line(K, `${ID}:${key}`, part.pts.concat([part.pts[0]]), { t: st.t ?? 0.9, w: st.w * 1.6, fine: true, ground: G, curv: 0.3 });
    } else {
      const bike = part.layer === 'bike' || part.role === 'crank' || part.role === 'crankFar' || part.role === 'pedal';
      K.seed(ID, key);
      K.brush.noFill(); K.brush.noWash(); K.brush.noHatch();
      if (bike) {
        K.brush.set(`${ID}.rule`, col, st.w * 1.6);
        if (part.pts.length === 2) K.brush.line(part.pts[0][0], part.pts[0][1], part.pts[1][0], part.pts[1][1]);
        else K.brush.spline(part.pts, 0.2);
      } else {
        ink.line(K, `${ID}:${key}`, part.pts, { t: st.t ?? 0.9, w: st.w * 1.6, fine: !st.dry, dry: st.dry, ground: G, curv: 0.3 });
      }
    }
  }
}

// ------------------------------------------------------------------ live pieces
function bunPos(i, u) {
  // five buns pop off the tray at u = 3, bounce and roll down the far slope, coming to rest on the right bank
  const t = u - 3 - i * 0.08;
  const x0 = 510 + i * 3;
  if (t <= 0) return null;
  const xs = 726 + i * 22 + (i % 2) * 10;
  const T = 2.0 + i * 0.14;
  const s = Math.min(1, t / T);
  const f = s < 0.55 ? 0.6 * Math.pow(s / 0.55, 1.5) : 0.6 + 0.4 * (1 - (1 - (s - 0.55) / 0.45) ** 2);
  const x = lerp(x0, xs, f);
  const bounce = 9 * Math.abs(Math.sin(Math.PI * t * 2.6)) * Math.exp(-t * 2.2);
  const y = (x < 702 ? deckY(x) : 800) + 10 + (i % 3) * 1.8 - bounce;
  return [x, y, (x - x0) / 4];
}

function drawBuns(K, u) {
  if (u < 3) return;
  for (let i = 0; i < 5; i++) {
    const p = bunPos(i, u);
    if (!p) continue;
    const [bx, by, ang] = p;
    K.seed(ID, 'bun', i);
    const R = 3.4;
    K.brush.noStroke(); K.brush.wash('#f1eadb', 252); K.brush.circle(bx, by - R, R); K.brush.noWash();
    K.seed(ID, 'bunE', i);
    K.brush.noFill(); K.brush.set('ink.fine', LINE, 1.2); K.brush.circle(bx, by - R, R);
    K.seed(ID, 'bunF', i);
    K.brush.set('ink.fine', LINE, 0.9);
    K.brush.spline([[bx + Math.cos(ang) * 2.6, by - R + Math.sin(ang) * 2.6], [bx + Math.cos(ang + 1.2) * 1.0, by - R + Math.sin(ang + 1.2) * 1.0], [bx - Math.cos(ang) * 1.4, by - R - Math.sin(ang) * 1.4]], 0.6);
  }
}

function drawMast(K, u, cast) {
  const th = mastAngle(u);
  const tip = mastTip(th);
  const foot = [MAST.px + 34 * Math.cos(th), MAST.py + 34 * Math.sin(th)];
  const d = [Math.cos(th), Math.sin(th)], nrm = [-d[1], d[0]];
  const w0 = 3.2, w1 = 1.6;
  const pl = [[foot[0] + nrm[0] * w0, foot[1] + nrm[1] * w0], [tip[0] + nrm[0] * w1, tip[1] + nrm[1] * w1], [tip[0] - nrm[0] * w1, tip[1] - nrm[1] * w1], [foot[0] - nrm[0] * w0, foot[1] - nrm[1] * w0]];
  ink.flat(K, `${ID}:mastF`, pl, { color: '#b08c5c', alpha: 245 });
  ink.line(K, `${ID}:mastA`, [pl[0], pl[1]], { t: 0.95, w: 1.1, fine: true, ground: G });
  ink.line(K, `${ID}:mastB`, [pl[3], pl[2]], { t: 0.95, w: 1.1, fine: true, ground: G });
  // yard near the top and a counterweight block at the foot
  const ym = [lerp(foot[0], tip[0], 0.82), lerp(foot[1], tip[1], 0.82)];
  ink.line(K, `${ID}:yard`, [[ym[0] + nrm[0] * 9, ym[1] + nrm[1] * 9], [ym[0] - nrm[0] * 9, ym[1] - nrm[1] * 9]], { t: 0.9, w: 1.3, fine: true, ground: G });
  const cw = [[foot[0] - 4, foot[1] - 4], [foot[0] + 7, foot[1] - 4], [foot[0] + 7, foot[1] + 6], [foot[0] - 4, foot[1] + 6]];
  ink.flat(K, `${ID}:cw`, cw, { color: '#8d877b', alpha: 245 });
  ink.line(K, `${ID}:cwE`, cw.concat([cw[0]]), { t: 0.95, w: 0.9, fine: true, ground: G, curv: 0 });
  // ropes from the tip to the haulers' hands: taut while hauling, slack when they look up
  const haulers = cast.filter((c) => c.id === 'h1' || c.id === 'h2');
  const anchor = [lerp(foot[0], tip[0], 0.96), lerp(foot[1], tip[1], 0.96)];
  haulers.forEach((c, k) => {
    const h = haulerHand(c, u);
    const st = c.state(u);
    const slack = st.pose === 'haulA' || st.pose === 'haulB' ? 0 : 1;
    const end = h && !slack ? h : [c.x + 6, c.y() - 4];
    const mid = [lerp(anchor[0], end[0], 0.5), lerp(anchor[1], end[1], 0.5) + (slack ? 16 : 1.5)];
    ink.line(K, `${ID}:rope${k}`, [anchor, mid, end], { t: 0.85, w: 0.6, fine: true, ground: G, curv: 0.5 });
  });
  // the bonk: splinters and a dust puff at the beam
  if (u >= 2.5 && u < 3.3) {
    const a = 1 - (u - 2.5) / 0.8;
    const hit = mastTip(TH_HIT);
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI * (0.15 + 0.7 * k / 5);
      const r0 = 6 + (u - 2.5) * 30, r1 = r0 + 6 * a + 3;
      K.seed(ID, 'bonk', k);
      K.brush.set('ink.fine', ink.tone(0.9 * a + 0.1, G), 0.9);
      K.brush.line(hit[0] + Math.cos(ang) * r0, hit[1] + Math.sin(ang) * r0 + 8, hit[0] + Math.cos(ang) * r1, hit[1] + Math.sin(ang) * r1 + 8);
    }
    for (let k = 0; k < 4; k++) {   // chips falling
      const t = u - 2.5;
      const cx = hit[0] + (k - 1.5) * 7, cy = hit[1] + 4 + t * t * 160 + k * 3;
      K.seed(ID, 'chip', k);
      K.brush.set('ink.fine', tn(0.8), 0.9);
      K.brush.line(cx, cy, cx + 2.4, cy + 1.2 * (k % 2 ? 1 : -1));
    }
  }
}

function drawWaterLive(K, u) {
  // a few ripples drifting downstream (toward the viewer-left)
  for (let k = 0; k < 10; k++) {
    const ph = (u * 0.12 + k * 0.137) % 1;
    const y = 948 + (k % 5) * 10 + ph * 6;
    const x = 190 + ((k * 89 + u * 9) % 620);
    if (!ink.inside([x, y], WATER) || !ink.inside([x + 26, y], WATER)) continue;
    if (x + 26 > HULL.x0 && x < HULL.x1 + 20 && y < gun(clamp(x, HULL.x0, HULL.x1)) + 46) continue;
    const a = Math.sin(Math.PI * ph);
    K.seed(ID, 'wl', k);
    K.brush.set('ink.fine', ink.tone(0.25 + 0.3 * a, G), 0.9);
    K.brush.spline([[x, y], [x + 9, y - 1.3], [x + 18, y + 0.5], [x + 26, y - 0.3]], 0.6);
  }
}

// ------------------------------------------------------------------ scene
let CAST = null, ATLAS = null;

export default {
  ride: RIDE,
  freezeU: 3.1,
  cues: [{ u: 2.0, name: 'crowdTurns' }, { u: 2.5, name: 'mastBonk' }, { u: 3.0, name: 'bunsRoll' }, { u: 4.0, name: 'downhill' }],

  async init(K) {
    ink.init(K);
    K.brush.add(`${ID}.rule`, {
      type: 'default', weight: 0.42, scatter: 0.02, sharpness: 0.95, grain: 1.0, opacity: 235, spacing: 0.1,
      pressure: { mode: 'gaussian', curve: [0.35, 0.1], min_max: [1.08, 0.96] }, rotate: 'natural', noise: 0.03,
    });
    if (!CAST) CAST = buildCast();
    if (!ATLAS) ATLAS = buildAtlas(CAST);
    const silk = silkLayer(K);
    const washes = ink.washLayer(K, `${ID}:washes`, buildWashes(K), { pxu: PXU, ground: G });
    const arch = paintArchitecture(K);
    const title = titleLayer(K);
    this.main = K.bake('main', BK, BK, (K2, w) => {
      push(); scale(w / 1000);
      image(silk, 0, 0, 1000, 1000);
      image(washes, 0, 0, 1000, 1000);
      paintBrushBack(K2);
      K2.flush();
      image(arch, 0, 0, 1000, 1000);
      paintBrushFront(K2);
      K2.flush();
      image(title, 0, 0, 1000, 1000);
      pop();
    });
    const ai = createImage(ATLAS.AW, ATLAS.AH);
    ai.drawingContext.drawImage(ATLAS.atlas, 0, 0);
    ai.setModified(true);
    this.atlas = K.bake('atlas', ATLAS.AW, ATLAS.AH, (K2, w, h) => { image(ai, 0, 0, w, h); });
    this.rail = railOverlay(K);
    this.stats = { sprites: ATLAS.n, atlas: [ATLAS.AW, ATLAS.AH], bakeMB: (BK * BK * 4 + ATLAS.AW * ATLAS.AH * 4) / 1048576 };
  },

  path(u, base) { return riderPlace(u, base); },

  camera(u, cam) {
    // a slow push toward the bridge for the gag bar (identity near both seams)
    if (u <= 0.5 || u >= 5.5) return cam;
    const w = smootherstep(0.6, 2.0, u) * (1 - smootherstep(4.2, 5.4, u));
    if (w <= 0) return cam;
    const T = { cx: panelLeft(5) + 500, cy: 556, z: 1.2 };
    return { cx: lerp(cam.cx, T.cx, w), cy: lerp(cam.cy, T.cy, w), z: Math.exp(lerp(Math.log(cam.z), Math.log(T.z), w)) };
  },

  mods(u) {
    if (u <= 1.05 || u >= 4.95) return {};
    const wide = K_win(2.45, 3.0, u, 0.06);
    const open = 0.4 * K_win(3.0, 3.9, u, 0.2);
    const m = {};
    if (wide > 0.5) m.eye = 'wide';
    if (open > 1e-3) m.billOpen = open;
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    image(this.main, 0, 0, 1000, 1000);
    drawWaterLive(K, u);
    const sprite = (c) => {
      const st = c.state(u);
      const sp = ATLAS.map.get(spriteKey(c, st));
      if (!sp) return;
      const cx = c.pos ? c.pos(u) : c.x;
      const hop = c.side !== 'boat' && u >= 2 && u < 2.17 ? -3.5 : 0;     // a startled hop on the downbeat
      const cy = (c.y ? c.y(u) : (c.side === 'near' ? nearY(cx) : farY(cx))) + hop;
      if (cx + sp.ox > v.x1 || cx + sp.ox + sp.w < v.x0) return;
      image(this.atlas, cx + sp.ox, cy + sp.oy, sp.w, sp.h, sp.ax, sp.ay, sp.aw, sp.ah);
    };
    // the boat: mast first, then the crew
    drawMast(K, u, CAST);
    K.flush();
    for (const c of CAST) if (c.side === 'boat') sprite(c);
    for (const c of CAST) if (c.side === 'far') sprite(c);
    if (ctx.rider.visible) drawPelican(K, ctx);
    K.flush();
    for (const c of CAST) if (c.side === 'near') sprite(c);
    drawBuns(K, u);
    K.flush();
    const R = this.rail.R;
    image(this.rail.img, R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
  },
};

function K_win(a, b, x, r) { return smoothstep(a, a + r, x) * (1 - smoothstep(b - r, b, x)); }
void noise2;
