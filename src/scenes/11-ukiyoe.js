// 11 · 浮世绘 / Ukiyo-e · 1830s — a colour woodblock print in the manner of Hokusai's Fuji views (original arrangement).
//
// Picture: washi with printed top/bottom margins and border rules; a pale sky with a Prussian-blue bokashi at the top;
// a vast Mt Fuji — bare snow cone with a thin key line, deep Prussian-blue upper slopes flecked with snow — beside a
// dark wooded foothill and faint blue ranges; banded blue-grey clouds at the left; a wide pale-ochre plain banded with
// mist and dotted green scrub; a stream in Prussian-blue bokashi that runs behind the path, under a plank bridge, and
// out through the near ground; the path (y = 800) along its bank. Cast: a woman with a child on her back, a porter
// with baskets on a shoulder pole, a traveller in a kasa and straw cape, two men carrying a chest on a pole, a farmer
// hoeing on the plain, an angler on the near bank. Gag: a sudden shower at u = 2 (Fuji fades behind it), the
// pelican's pouch fills with rain, it gulps at 3.5, the shower stops on the 4.0 downbeat.
//
// Technique
//   • a small woodblock model, plate() + printPlate(): colour blocks (each with its own registration offset, wood-grain
//     and baren texture) are multiplied onto washi, then the black key block (slightly eroded) is printed on top.
//     Every static layer is printed once into a K.layer image (Canvas2D).
//   • the shower: a rainy twin of the background plate is cross-faded in; two pre-printed rain-line tiles scroll along
//     the rain direction (straight, parallel, two greys), sweeping in from the right at u = 2 and out at u = 4.
//   • the cast are pose-state sprites in one atlas (states switch on beats); grasses on the bank are live brush lines.
//   • the pelican is re-printed every frame into a small 2D canvas: even key line, washi-white body with a grey belly
//     bokashi, black primaries, vermilion pouch and legs, Prussian-blue frame, colour blocks off-register.
import { rng, hash, lerp, clamp, smoothstep, smootherstep, easeOut, ellipsePts, smoothPath, smoothLoop, ribbon } from '../kit/math.js';

const ID = 'ukiyoe';
const RIDE = { hold: [2.3, 3.7], speed: 0.5, ramp: 0.3 };
const PX = 2;                       // print resolution (px per unit)
const TOP = 22, BOT = 978;          // printed image area (border rules); bare washi margins outside
const ROAD0 = 768, ROAD1 = 836;     // road band (wheels at 800)
const BACK_H = 780, MID_Y0 = 767;
const RAIN_A = 0.27;                // rain slant from vertical (falls toward the lower left: wind from the right)
const RAIN_D = [-Math.sin(RAIN_A), Math.cos(RAIN_A)];
const KEY = '#1b1714';
const C = {
  paper: '#f1e9d6', blue: '#1f3f73', blueL: '#8fb3cf', indigo: '#2b3a55', verm: '#d0502e', pine: '#4c6b3c',
  ochre: '#c9a46a', beni: '#d8604a', red: '#c4422c', yellow: '#ebc65f', straw: '#d1b06a', skin: '#f0d5ae',
  wood: '#86664a', thatch: '#a38d5f',
};
// registration offsets of the colour blocks (units): every block is printed slightly off the key block
const REG = {
  none: [0, 0], blue: [1.5, 0.8], green: [-1.2, 1.1], red: [1.1, -1.3], ochre: [-1.0, -0.8], grey: [0.8, 1.3],
  skin: [-0.7, 1.0], beni: [-1.3, -0.6], straw: [1.0, 1.0], paper: [1.2, 0.7],
};

// ------------------------------------------------------------------ small utils
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a = 1) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const cvOf = (img) => img.canvas || img.elt || img.drawingContext?.canvas;
const RECT = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const mix2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const mod = (a, P) => ((a % P) + P) % P;
const beat = (u) => Math.floor(u * 2 + 1e-6);
const quarter = (u) => Math.floor(u * 4 + 1e-6);
function trace(c, pts, close = true) {
  c.beginPath();
  for (let i = 0; i < pts.length; i++) (i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]));
  if (close) c.closePath();
}
function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(clamp(o), col);
  return g;
}
function inside(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1 };
}
function blob(cx, cy, rx, ry, seed, n = 12) {
  const r = rng(hash(ID, 'blob', seed));
  const out = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const f = 0.84 + r() * 0.28; out.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]); }
  return smoothLoop(out, 3);
}
/** Closed tapered polygon along a polyline (feathers). */
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

// ------------------------------------------------------------------ timeline of the shower
const rainWind = (u) => smoothstep(1.96, 2.12, u) * (1 - smoothstep(3.96, 4.25, u));
/** Weight of the rainy background (sky darkens with a bokashi from the top). */
const skyRain = (u) => smoothstep(1.97, 2.07, u) * (1 - smoothstep(4.0, 4.16, u));
/** x-range of the falling rain: the front sweeps in from the right at 2.0, the tail sweeps out at 4.0. */
function rainBand(u) {
  if (u < 2.0 || u >= 4.3) return null;
  const front = lerp(700, -30, smoothstep(2.0, 2.18, u));
  const tail = lerp(1030, -30, smoothstep(4.0, 4.28, u));
  return tail > front ? [front, tail] : null;
}
const wetRoad = (u) => smoothstep(2.1, 2.7, u) * (1 - 0.9 * smoothstep(4.2, 10, u));
const puddles = (u) => smoothstep(2.5, 3.4, u) * (1 - 0.55 * smoothstep(7, 13, u));

/** The pouch gag: fill 0..1, head tilt (+ = bill down under the weight, − = bill up to gulp), neck lump 0..1. */
function gagState(u) {
  const g = { fill: 0, tilt: 0, bulge: -1 };
  if (u <= 1.5 || u >= 4.5) return g;
  const up = easeOut(clamp((u - 2.45) / 0.85));
  const drain = smoothstep(3.56, 3.8, u);
  g.fill = up * (1 - drain);
  const lift = smootherstep(3.47, 3.62, u) * (1 - smootherstep(3.8, 4.02, u));
  g.tilt = 0.13 * g.fill * (1 - lift) - 0.6 * lift;
  if (u > 3.6 && u < 3.98) g.bulge = (u - 3.6) / 0.38;
  return g;
}

// ------------------------------------------------------------------ textures (washi, wood grain + baren)
const TEX = {};
function lattice(n, seed) { const r = rng(seed); const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r(); return a; }
/** periodic value noise (lattice L of px × py cells) */
function pn(L, px, py, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = mod(ix, px), x1 = (x0 + 1) % px, y0 = mod(iy, py), y1 = (y0 + 1) % py;
  const a = L[y0 * px + x0], b = L[y0 * px + x1], c = L[y1 * px + x0], d = L[y1 * px + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function grainTile() {
  const N = 512, cv = mk(N, N), c = cv.getContext('2d'), id = c.createImageData(N, N);
  const A = lattice(4 * 90, hash(ID, 'gA')), B = lattice(9 * 150, hash(ID, 'gB')), M = lattice(26 * 26, hash(ID, 'gM'));
  const r = rng(hash(ID, 'gF'));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = pn(A, 4, 90, (x / N) * 4, (y / N) * 90);       // wood grain: long horizontal streaks
      const b = pn(B, 9, 150, (x / N) * 9, (y / N) * 150);
      const m = pn(M, 26, 26, (x / N) * 26, (y / N) * 26);     // baren mottling
      const v = 0.42 * a + 0.24 * b + 0.22 * m + 0.12 * r();
      const k = (y * N + x) * 4;
      if (v < 0.41) { id.data[k] = 34; id.data[k + 1] = 26; id.data[k + 2] = 18; id.data[k + 3] = Math.round(255 * Math.min(0.2, (0.41 - v) * 0.95)); }
      else if (v > 0.59) { id.data[k] = 252; id.data[k + 1] = 248; id.data[k + 2] = 238; id.data[k + 3] = Math.round(255 * Math.min(0.28, (v - 0.59) * 1.05)); }
    }
  }
  c.putImageData(id, 0, 0);
  return cv;
}
function buildTextures(K) {
  if (!TEX.grain) TEX.grain = grainTile();
  const img = K.layer(`${ID}:washi`, 1000 * PX, 1000 * PX, (c) => {
    const base = K.paper.sheet({ w: 1000 * PX, h: 1000 * PX, base: C.paper, kind: 'paper', grain: 0.45, fibers: 0, stains: 3, edge: 0.1, blotch: 0.3, seed: 1183 });
    c.drawImage(cvOf(base), 0, 0);
    const r = rng(hash(ID, 'kozo'));
    for (let k = 0; k < 2600; k++) {   // long kozo fibres
      const x = r() * 2000, y = r() * 2000, L = 10 + r() * 46, a = r() * Math.PI * 2, bend = (r() - 0.5) * 1.2;
      c.strokeStyle = r() < 0.62 ? `rgba(255,253,246,${0.35 + r() * 0.35})` : `rgba(128,104,70,${0.06 + r() * 0.08})`;
      c.lineWidth = 0.6 + r() * 1.1;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + bend) * L * 0.5, y + Math.sin(a + bend) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      c.stroke();
    }
  });
  TEX.washi = cvOf(img);
}
function washiPattern(c) {
  const p = c.createPattern(TEX.washi, 'repeat');
  p.setTransform(new DOMMatrix([1 / PX, 0, 0, 1 / PX, 0, 0]));
  return p;
}

// ------------------------------------------------------------------ the woodblock model
/** A plate collects colour-block fills and key-block lines in drawing order (back → front). */
function plate() {
  const ops = [];
  const P = {
    ops,
    /** colour block; col = css colour | 'paper' (unprinted) | (ctx) => gradient. knock: hide key lines beneath. */
    fill(pts, col, reg = 'none', o = {}) { ops.push({ t: 'f', pts, col, reg, a: o.a ?? 1, knock: o.knock ?? true }); return P; },
    grad(pts, col, reg = 'none', a = 1) { ops.push({ t: 'f', pts, col, reg, a, knock: false }); return P; },
    key(pts, w = 1, close = true, o = {}) { ops.push({ t: 'k', pts, w, close, col: o.col, a: o.a ?? 1 }); return P; },
    solid(pts, o = {}) { ops.push({ t: 's', pts, col: o.col }); return P; },
    shape(pts, col, reg, w = 1) { P.fill(pts, col, reg); P.key(pts, w, true); return P; },
    keyImg(img, x, y, w, h, a = 1) { ops.push({ t: 'ki', img, x, y, w, h, a }); return P; },
    colImg(img, x, y, w, h, reg = 'none', a = 1) { ops.push({ t: 'ci', img, x, y, w, h, reg, a }); return P; },
    outImg(img, x, y, w, h) { ops.push({ t: 'co', img, x, y, w, h }); return P; },
  };
  return P;
}
/** Copy the ops of sub-plate S into P, mapping points (x → dx ± x). */
function placeOps(P, S, dx, mirror = false) {
  const f = (p) => [mirror ? dx - p[0] : dx + p[0], p[1]];
  for (const op of S.ops) P.ops.push(op.pts ? { ...op, pts: op.pts.map(f) } : op);
}

/**
 * Print plate P into dst (its whole canvas). o: { x0, y0 (unit origin), s (px/unit), mode, T, seed, speck }
 *   mode 'paper'  : dst holds washi; colour and key multiply onto it; 'paper' fills erase colour.
 *   mode 'sprite' : transparent dst; 'paper' fills use the washi texture.
 */
function printPlate(dst, P, o) {
  const W = dst.canvas.width, H = dst.canvas.height, s = o.s;
  const cc = mk(W, H).getContext('2d'), kc = mk(W, H).getContext('2d');
  const T = o.T || [1, 0, 0, 1, 0, 0];
  const Z = [0, 0];
  const at = (c, off) => { c.setTransform(s, 0, 0, s, (off[0] - o.x0) * s, (off[1] - o.y0) * s); c.transform(T[0], T[1], T[2], T[3], T[4], T[5]); };
  const pat = o.mode === 'sprite' ? washiPattern(cc) : null;
  for (const op of P.ops) {
    if (op.t === 'f') {
      at(cc, REG[op.reg] || Z);
      trace(cc, op.pts);
      cc.globalAlpha = op.a;
      if (op.col === 'paper') {
        if (o.mode === 'paper') { cc.globalCompositeOperation = 'destination-out'; cc.fillStyle = '#000'; }
        else cc.fillStyle = pat;
      } else cc.fillStyle = typeof op.col === 'function' ? op.col(cc) : op.col;
      cc.fill();
      cc.globalAlpha = 1; cc.globalCompositeOperation = 'source-over';
      if (op.knock) {
        at(kc, Z); trace(kc, op.pts);
        kc.globalCompositeOperation = 'destination-out'; kc.fillStyle = '#000'; kc.fill(); kc.globalCompositeOperation = 'source-over';
      }
    } else if (op.t === 'k') {
      at(kc, Z); trace(kc, op.pts, op.close);
      kc.globalAlpha = op.a; kc.strokeStyle = op.col || KEY; kc.lineWidth = op.w; kc.lineJoin = 'round'; kc.lineCap = 'round';
      kc.stroke(); kc.globalAlpha = 1;
    } else if (op.t === 's') {
      at(kc, Z); trace(kc, op.pts); kc.fillStyle = op.col || KEY; kc.fill();
    } else {
      const c = op.t === 'ki' ? kc : cc;
      at(c, op.t === 'ci' ? (REG[op.reg] || Z) : Z);
      c.globalAlpha = op.a ?? 1;
      if (op.t === 'co') c.globalCompositeOperation = 'destination-out';
      c.drawImage(op.img, op.x, op.y, op.w, op.h);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }
  // the colour blocks take the wood grain and the baren rubbing
  cc.setTransform(1, 0, 0, 1, 0, 0);
  cc.globalCompositeOperation = 'source-atop';
  cc.fillStyle = cc.createPattern(TEX.grain, 'repeat');
  cc.fillRect(0, 0, W, H);
  cc.globalCompositeOperation = 'source-over';
  // the key block prints slightly broken where the paper grain catches less ink
  kc.setTransform(1, 0, 0, 1, 0, 0);
  kc.globalCompositeOperation = 'destination-out';
  kc.fillStyle = '#000';
  const r = rng(hash(ID, 'speck', o.seed ?? 0));
  const n = Math.round((W * H) / (o.speck ?? 230));
  for (let k = 0; k < n; k++) { kc.globalAlpha = 0.12 + r() * 0.45; kc.fillRect(r() * W, r() * H, 0.5 + r() * 1.3, 0.5 + r() * 1.1); }
  kc.globalAlpha = 1; kc.globalCompositeOperation = 'source-over';
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = o.mode === 'paper' ? 'multiply' : 'source-over';
  dst.drawImage(cc.canvas, 0, 0);
  dst.drawImage(kc.canvas, 0, 0);
  dst.restore();
}
/** A full-width print on washi covering panel rows y0 … y0 + h. */
function paperLayer(K, key, y0, h, paint) {
  return K.layer(`${ID}:${key}`, 1000 * PX, h * PX, (c) => {
    c.drawImage(TEX.washi, 0, y0 * PX, 1000 * PX, h * PX, 0, 0, 1000 * PX, h * PX);
    const P = plate();
    paint(P);
    printPlate(c, P, { x0: 0, y0, s: PX, mode: 'paper', seed: key });
  });
}
/** A transparent print (sprite) of the panel rect x0, y0, w, h. */
function spriteLayer(K, key, x0, y0, w, h, paint, s = PX) {
  const img = K.layer(`${ID}:${key}`, w * s, h * s, (c) => {
    const P = plate();
    paint(P);
    printPlate(c, P, { x0, y0, s, mode: 'sprite', seed: key });
  });
  return { img, x0, y0, w, h };
}
function glyph(K, text, o = {}) {
  const sp = K.textSprite({ text, font: o.font || '"Kaiti SC", "STKaiti", serif', weight: o.weight ?? 700, style: o.style, size: 120, color: '#000', vertical: o.vertical, lineHeight: o.lineHeight });
  return { cv: cvOf(sp.g), w: sp.w, h: sp.h, pad: sp.pad };
}
/** Place a glyph sprite with em size E (units): centred on cx, first glyph top at y. Returns the draw rect. */
function glyphRect(g, E, cx, y) {
  const k = E / 120;
  return [cx - (g.w * k) / 2, y - g.pad * k, g.w * k, g.h * k];
}

// ------------------------------------------------------------------ the background print: sky, Fuji, plain, the stream upstream
// After Hokusai's Fuji views (an original arrangement): a vast snow cone whose left flank sweeps down to the edge of
// the print, Prussian-blue upper slopes speckled with snow, a dark wooded foothill, faint blue ranges, banded clouds.
const FLANK_L = [[588, 40], [566, 49], [536, 62], [500, 79], [456, 100], [404, 124], [344, 152], [276, 183], [200, 218], [120, 254], [44, 288], [-14, 313]];
const FLANK_R = [[588, 40], [606, 50], [628, 64], [652, 82], [680, 104], [712, 130], [748, 160], [790, 196]];
const CONE = [...FLANK_L.slice().reverse(), ...FLANK_R.slice(1), [1014, 300], [1014, 340], [-14, 340]];
const FUJI_BLUE = [[574, 56], [588, 52], [602, 55], [624, 67], [650, 85], [680, 106], [712, 132], [748, 160], [702, 180], [640, 184], [586, 178], [534, 170], [486, 162], [450, 154], [472, 137], [498, 117], [526, 95], [552, 73]];
const FOOTHILL = [[596, 206], [636, 184], [680, 160], [720, 143], [758, 136], [794, 140], [838, 155], [888, 172], [944, 186], [1014, 194], [1014, 232], [596, 232]];
const RANGES = [[748, 156], [792, 136], [840, 118], [880, 109], [918, 115], [962, 127], [1014, 118], [1014, 218], [748, 218]];
const UPSTREAM_BANK = [[1014, 678], [930, 683], [850, 692], [772, 705], [704, 722], [646, 742], [604, 760], [576, 772]];
const UPSTREAM = [...UPSTREAM_BANK, [1014, 772]];
const CLOUDS = [[-14, 270, 128, 50, 1], [70, 318, 176, 36, 2], [-14, 168, 214, 28, 3]];

function paintBack(P, K, rain) {
  // rain: everything sinks into a grey bokashi, the farther the greyer
  const T = (col, depth) => (rain ? mixHex(col, depth > 0.75 ? '#7b828b' : '#6c7279', 0.2 + 0.62 * depth) : col);
  const SKY = RECT(-14, TOP, 1014, 380);
  if (!rain) {
    P.grad(SKY, rgba('#a7b5bf', 0.15), 'blue');
    P.grad(RECT(-14, TOP, 1014, TOP + 66), (c) => lin(c, 0, TOP, 0, TOP + 66, [[0, rgba(C.blue, 0.95)], [0.22, rgba(C.blue, 0.6)], [1, rgba(C.blue, 0)]]), 'blue');
    streaks(P, C.blue, TOP + 2, TOP + 50, 1);
    P.grad(RECT(-14, 64, 300, 330), (c) => lin(c, -14, 0, 280, 0, [[0, rgba('#7d97b6', 0.5)], [1, rgba('#7d97b6', 0)]]), 'blue');
    // the cone stays bare paper; its upper slopes are deep Prussian blue flecked with snow
    P.fill(CONE, 'paper', 'none', { knock: true });
    P.fill(FUJI_BLUE, (c) => lin(c, 0, 50, 0, 186, [[0, '#17305e'], [0.55, C.blue], [1, '#2f5386']]), 'blue');
    fujiSnow(P);
    P.key(FLANK_L, 1.0, false);
    P.key(FLANK_R.slice(0, 6), 1.0, false);
  } else {
    P.grad(SKY, (c) => lin(c, 0, TOP, 0, 380, [[0, rgba('#232b3d', 1)], [0.2, rgba('#323b4e', 0.94)], [0.6, rgba('#5c6472', 0.62)], [1, rgba('#9a9ea2', 0.45)]]), 'grey');
    streaks(P, '#2c323d', TOP + 3, 200, 1.4);
    // Fuji fades behind the shower: only a pale ghost of the cone remains
    P.fill(CONE, rgba('#a3a8ad', 0.32), 'grey', { knock: false });
    P.fill(FUJI_BLUE, rgba('#4d5868', 0.42), 'grey', { knock: false });
    P.key(FLANK_L, 0.8, false, { a: 0.22 });
  }
  // banded clouds at the left: scalloped tops, flat bottoms, blue-grey bokashi
  for (const [x0, x1, yb, h, k] of CLOUDS) {
    const r = rng(hash(ID, 'cloud', k));
    const pts = [[x0, yb]];
    let x = x0;
    while (x < x1 - 16) {
      const w = Math.min(x1 - x + 10, 56 + r() * 60), hh = h * (0.62 + r() * 0.38);
      for (let j = 0; j <= 12; j++) { const t = j / 12; pts.push([x + (w / 2) * (1 - Math.cos(Math.PI * t)), yb - h * 0.3 - Math.pow(Math.sin(Math.PI * t), 0.8) * (hh - h * 0.3)]); }
      x += w * (0.62 + r() * 0.12);
    }
    pts.push([x1 + 10, yb]);
    P.fill(pts, (c) => lin(c, 0, yb - h, 0, yb, [[0, rgba(T('#56709a', 1), 0.95)], [0.6, rgba(T('#7d96b6', 1), 0.85)], [1, rgba(T('#a9bbcf', 1), 0.7)]]), 'blue', { knock: false });
  }
  // distant ranges, then the dark wooded foothill in front of Fuji's right flank
  P.fill(RANGES, (c) => lin(c, 0, 108, 0, 218, [[0, rgba(T('#4f6e98', 1), 0.9)], [0.45, rgba(T('#8ea6c2', 1), 0.55)], [1, rgba(T('#b7c6d4', 1), 0.1)]]), 'blue');
  P.key(RANGES.slice(0, 7), 0.6, false, { col: T('#2b4570', 1), a: 0.7 });
  P.fill(FOOTHILL, (c) => lin(c, 0, 136, 0, 232, [[0, T('#13282a', 0.9)], [0.5, T('#203f3c', 0.9)], [1, T('#3d6457', 0.9)]]), 'green');
  speckle(P, FOOTHILL, 1300, [T('#0e1f1d', 0.9), T('#18322f', 0.9), T('#18322f', 0.9), T('#4f7465', 0.9)], 0.6, 1.5, 'fh');
  P.key(FOOTHILL.slice(0, 10), 0.8, false, { col: T('#0f1d1a', 0.9) });
  // the plain: pale ochre rising out of a mist, horizontal mist bands, rows of dotted green scrub
  const PL0 = 248;
  P.fill(RECT(-14, PL0, 1014, 776), (c) => lin(c, 0, PL0, 0, 776, [[0, rgba(T('#e6bb8a', 0.6), 0)], [0.09, rgba(T('#e6bb8a', 0.6), 0.45)], [0.28, rgba(T('#e4b683', 0.6), 0.76)], [1, rgba(T('#dfad78', 0.6), 0.9)]]), 'ochre', { knock: false });
  for (const [x0, x1, y, h, k, col] of [[470, 1014, 222, 15, 'b1', '#294a48'], [292, 1014, 252, 11, 'b2', '#2f514b'], [560, 1014, 280, 6, 'b3', '#3c5f52']]) {
    const band = hband(P, x0, x1, y, h, k, T(col, 0.85));
    speckle(P, band, Math.round((x1 - x0) * h * 0.05), [T('#16302c', 0.85), T('#5b8170', 0.85)], 0.5, 1.2, k);
  }
  const rm = rng(hash(ID, 'mist'));
  for (const [y, h, a] of [[300, 14, 0.75], [344, 10, 0.6], [412, 12, 0.5], [496, 14, 0.45], [598, 12, 0.36]]) {
    const xa = -14 + rm() * 160, xb = 1014 - rm() * 160;
    P.fill(hbandPts(xa, xb, y, h, 'm' + y), 'paper', 'none', { a: a * (rain ? 0.3 : 1), knock: false });
  }
  const rs = rng(hash(ID, 'plainSpeck'));
  for (let k = 0; k < 70; k++) {
    const y = lerp(300, 770, rs()), x = -60 + rs() * 900, L = 120 + rs() * 500, h = 1.5 + rs() * 4;
    P.grad(RECT(x, y, x + L, y + h), rgba(T('#c58d55', 0.6), 0.08 + rs() * 0.1), 'ochre');
  }
  for (let k = 0; k < 900; k++) {
    const x = rs() * 1000, y = lerp(300, 768, rs()), s = 0.5 + rs() * 0.8 * (y / 600);
    if (inside([x, y], UPSTREAM)) continue;
    P.fill(ellipsePts(x, y, s * 1.3, s, 0, 6), rgba(T('#3f6b45', 0.6), 0.5 + rs() * 0.4), 'green', { knock: false });
  }
  for (let k = 0; k < 3200; k++) {
    const x = rs() * 1000, y = lerp(290, 770, Math.pow(rs(), 0.8)), s = 0.5 + rs() * 0.9;
    if (inside([x, y], UPSTREAM)) continue;
    P.fill(ellipsePts(x, y, s * 1.6, s * 0.7, 0, 6), rgba(T('#b07c48', 0.6), 0.25 + rs() * 0.35), 'ochre', { knock: false });
  }
  const rt = rng(hash(ID, 'treeline'));
  for (let x = -10; x < 470; x += 5 + rt() * 7) {
    const y = 292 + (x / 470) * 6 + (rt() - 0.5) * 2, h = 3 + rt() * 4;
    P.fill(ellipsePts(x, y - h / 2, 2.4 + rt() * 2, h / 2, 0, 8), rgba(T('#2c4a45', 0.85), 0.75), 'green', { knock: false });
  }
  P.fill(blob(850, 652, 84, 11, 'field', 16), rgba(T('#b7865a', 0.6), 0.32), 'ochre', { knock: false });
  for (let k = 0; k < 3; k++) { const y = 646 + k * 6; P.key([[786 - k * 8, y], [910 + k * 8, y - 1]], 0.5, false, { col: T('#8a6038', 0.6), a: 0.45 }); }
  const VEG = [[318, 6, 0.8, 0.07], [368, 9, 1.1, 0.07], [440, 13, 1.5, 0.065], [478, 10, 1.7, 0.05], [526, 18, 2.0, 0.06], [600, 16, 2.4, 0.05], [716, 24, 3.2, 0.05]];
  VEG.forEach(([y, h, s, dens], k) => vegBand(P, T, y, h, s, dens, k));
  // the stream upstream of the bridge, behind the path, with grassy banks
  P.fill(UPSTREAM, T('#a3c3d8', 0.5), 'blue', { knock: true });
  P.grad(UPSTREAM, (c) => lin(c, 0, 676, 0, 772, [[0, rgba(T(C.blue, 0.5), 0.95)], [0.32, rgba(T(C.blue, 0.5), 0.3)], [0.7, rgba(T(C.blue, 0.5), 0.12)], [1, rgba(T(C.blue, 0.5), 0.55)]]), 'blue');
  const rf = rng(hash(ID, 'upflow'));
  for (let k = 0; k < 16; k++) {
    const x = 600 + rf() * 400, y = lerp(groundY(UPSTREAM_BANK, x) + 8, 766, rf()), L = 16 + rf() * 40;
    if (!inside([x + L, y - 1], UPSTREAM)) continue;
    P.fill([[x, y], [x + L * 0.5, y - 1.2], [x + L, y - 0.4], [x + L * 0.5, y - 0.2]], 'paper', 'none', { knock: false });
  }
  P.key(UPSTREAM_BANK, 1.0, false);
  shrubRow(P, T, UPSTREAM_BANK, 'ub', -4);
  shrubRow(P, T, [[-14, 760], [576, 762]], 'nb', 0);
  // the top margin stays bare washi, under a ruled border
  P.fill(RECT(-14, -14, 1014, TOP), 'paper', 'none', { knock: true });
  P.key([[-14, TOP], [1014, TOP]], 1.8, false);
}
function fujiSnow(P) {
  const r = rng(hash(ID, 'snow'));
  for (let k = 0; k < 3400; k++) {
    const x = lerp(446, 752, r()), y = lerp(50, 188, Math.pow(r(), 1.2));
    const d = clamp(1 - (y - 54) / 125);
    if (inside([x, y], FUJI_BLUE)) {
      if (r() > d * d * 0.9 + 0.035) continue;
      const s = 0.5 + r() * (0.5 + 1.1 * d);
      P.fill(ellipsePts(x, y, s, s * 0.8, r() * 3, 5), 'paper', 'none', { knock: false });
    } else if (inside([x, y], CONE) && r() < 0.25) {
      // the blue breaks up into flecks at its lower and left edges
      let near = false;
      for (const [dx, dy] of [[9, 0], [0, -9], [9, -9], [-7, -7]]) if (inside([x + dx, y + dy], FUJI_BLUE)) near = true;
      if (!near) continue;
      const s = 0.6 + r() * 1.0;
      P.fill(ellipsePts(x, y, s, s * 0.8, 0, 5), C.blue, 'blue', { knock: false });
    }
  }
  for (const [x0, L] of [[586, 46], [600, 62], [572, 40], [616, 54], [630, 40], [558, 30]]) {
    P.fill([[x0 - 1.4, 56], [x0 + 1.4, 56], [x0 + (x0 - 588) * 0.7, 56 + L]], 'paper', 'none', { knock: false });
  }
}
function hbandPts(x0, x1, y, h, seed) {
  const r = rng(hash(ID, 'hb', seed));
  const top = [], bot = [];
  const n = Math.max(4, Math.ceil((x1 - x0) / 22));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = lerp(x0, x1, t), tp = Math.min(1, t * 5, (1 - t) * 8 + (x1 > 1000 ? 1 : 0));
    top.push([x, y - (h / 2) * tp + (r() - 0.5) * 1.8]);
    bot.push([x, y + (h / 2) * tp + (r() - 0.5) * 1.2]);
  }
  return [...top, ...bot.reverse()];
}
function hband(P, x0, x1, y, h, seed, col) {
  const poly = hbandPts(x0, x1, y, h, seed);
  P.fill(poly, col, 'green', { knock: false });
  return poly;
}
/** Dots scattered inside a polygon (tree tops, scrub). */
function speckle(P, poly, n, cols, s0, s1, seed) {
  const b = bboxOf(poly), r = rng(hash(ID, 'spk', seed));
  for (let k = 0; k < n; k++) {
    const x = lerp(b.x0, b.x1, r()), y = lerp(b.y0, b.y1, r());
    if (!inside([x, y], poly)) continue;
    const s = lerp(s0, s1, r());
    P.fill(ellipsePts(x, y, s * 1.2, s, 0, 6), cols[Math.floor(r() * cols.length)], 'green', { knock: false });
  }
}
/** A horizontal band of low scrub across the plain: broken segments of green tint packed with dark dots. */
function vegBand(P, T, y, h, s, dens, k) {
  const r = rng(hash(ID, 'veg', k));
  let x = -14 - r() * 60;
  while (x < 1014) {
    const L = 140 + r() * 320, x1 = Math.min(1060, x + L);
    const yy = y + (r() - 0.5) * h * 0.6;
    const seg = hbandPts(x, x1, yy, h * (0.8 + r() * 0.5), `v${k}_${Math.round(x)}`);
    const clipped = seg.filter(([px, py]) => !inside([px, py], UPSTREAM));
    if (clipped.length > 6) {
      P.fill(clipped, rgba(T('#7f9c5c', 0.6), 0.42), 'green', { knock: false });
      speckle(P, clipped, Math.round((x1 - x) * h * dens * 1.6), [T('#2f5c3e', 0.6), T('#3d6d47', 0.6), T('#2b5450', 0.6), T('#567f4a', 0.6)], s * 0.55, s * 1.3, `vs${k}_${Math.round(x)}`);
      if (k >= 5 || k === 3) {
        for (let cx = x + 20; cx < x1 - 20; cx += 36 + r() * 60) {
          if (inside([cx, yy], UPSTREAM)) continue;
          const bl = blob(cx, yy - h * 0.1, 9 + r() * 12, 4 + r() * 4, `sh${k}_${Math.round(cx)}`, 10);
          P.fill(bl, (c) => lin(c, 0, yy - 8, 0, yy + 6, [[0, T('#22402f', 0.6)], [1, T('#4b7445', 0.6)]]), 'green');
          P.key(bl, 0.6);
        }
      }
    }
    x = x1 + 30 + r() * 140;
  }
}
/** Dark shrubs with a key outline along a bank line. */
function shrubRow(P, T, line, seed, dy) {
  const r = rng(hash(ID, 'shrubs', seed));
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = r() * 0.3; t < 1; t += (22 + r() * 30) / L) {
      const p = mix2(a, b, t);
      if (p[0] < -10 || p[0] > 1010) continue;
      const bl = blob(p[0], p[1] + dy - 4, 8 + r() * 10, 4 + r() * 3.5, `${seed}${i}_${Math.round(t * 100)}`, 10);
      P.fill(bl, (c) => lin(c, 0, p[1] - 12, 0, p[1] + 2, [[0, T('#1f3d2c', 0.5)], [1, T('#4e7848', 0.5)]]), 'green');
      P.key(bl, 0.65);
    }
  }
}
function groundY(poly, x) {
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
  }
  return poly[poly.length - 1][1];
}
/** Wiped-bokashi unevenness: faint horizontal streaks of the block colour and of bare paper. */
function streaks(P, col, y0, y1, k) {
  const r = rng(hash(ID, 'streak', col));
  for (let i = 0; i < 60; i++) {
    const y = lerp(y0, y1, Math.pow(r(), 1.4)), x = -40 + r() * 900, L = 120 + r() * 620, h = 0.8 + r() * 2.4;
    const fade = 1 - (y - y0) / (y1 - y0);
    if (r() < 0.7) P.grad(RECT(x, y, x + L, y + h), rgba(col, (0.04 + r() * 0.06) * k * fade), 'blue');
    else P.fill(RECT(x, y, x + L, y + h), 'paper', 'none', { a: (0.03 + r() * 0.05) * fade, knock: false });
  }
}

// ------------------------------------------------------------------ the near ground: path, plank bridge, the stream, a sandy bank
const BR0 = 552, BR1 = 694;      // the plank bridge where the stream passes under the path
const NEAR_BANK = [[702, 836], [692, 866], [654, 898], [592, 926], [502, 948], [382, 962], [232, 972], [62, 977], [-14, 979]];
function paintMid(P) {
  const road = RECT(-14, MID_Y0 - 1, 1014, ROAD1);
  P.fill(road, (c) => lin(c, 0, ROAD0, 0, ROAD1, [[0, '#c99d84'], [0.2, '#e2bea4'], [0.7, '#e8c6ab'], [1, '#d1a78b']]), 'red', { knock: false });
  const rp = rng(hash(ID, 'pebbles'));
  for (let k = 0; k < 60; k++) {
    const x = rp() * 1000, y = lerp(ROAD0 + 6, ROAD1 - 5, rp()), w = 1.2 + rp() * 2.4;
    if (x > BR0 - 6 && x < BR1 + 6) continue;
    P.key(ellipsePts(x, y, w, w * 0.55, 0, 8), 0.5, true, { a: 0.7 });
  }
  for (const [y, a] of [[790, 0.35], [813, 0.4], [826, 0.3]]) {
    let x = -10;
    while (x < 1010) {
      const L = 40 + rp() * 120, xb = Math.min(x + L, x < BR0 ? BR0 - 8 : 1010);
      if (!(x > BR0 - 8 && x < BR1 + 8) && xb > x) P.key([[x, y + rp() * 1.5], [xb, y + rp() * 1.5]], 0.5, false, { a, col: '#7a5844' });
      x += L + 20 + rp() * 60;
    }
  }
  // the stream flows out from under the bridge toward the lower left
  const RIV = [[-14, 836], [702, 836], ...NEAR_BANK.slice(1)];
  P.fill(RIV, '#9cbfd6', 'blue', { knock: true });
  P.grad(RIV, (c) => lin(c, 0, 836, 0, 900, [[0, rgba(C.blue, 1)], [0.35, rgba(C.blue, 0.6)], [1, rgba(C.blue, 0)]]), 'blue');
  P.grad(RIV, (c) => lin(c, 430, 962, 418, 900, [[0, rgba(C.blue, 0.95)], [0.4, rgba(C.blue, 0.5)], [1, rgba(C.blue, 0)]]), 'blue');
  P.grad(RIV, (c) => lin(c, 690, 880, 640, 870, [[0, rgba(C.blue, 0.8)], [1, rgba(C.blue, 0)]]), 'blue');
  const rf = rng(hash(ID, 'flow'));
  const d = [-0.981, 0.195];
  for (let k = 0; k < 30; k++) {
    const x = rf() * 680, y = lerp(846, 960, rf()), L = 20 + rf() * 70;
    const e = [x + d[0] * L, y + d[1] * L];
    if (!inside([x, y], RIV) || !inside(e, RIV)) continue;
    const m = [lerp(x, e[0], 0.5), lerp(y, e[1], 0.5) - 1.5];
    P.fill([[x, y], m, e, [m[0], m[1] + 1.1]], 'paper', 'none', { knock: false });
  }
  for (let k = 0; k < 22; k++) {
    const x = rf() * 680, y = lerp(846, 960, rf()), L = 8 + rf() * 18;
    const e = [x + d[0] * L, y + d[1] * L];
    if (!inside([x, y], RIV) || !inside(e, RIV)) continue;
    P.key([[x, y], [lerp(x, e[0], 0.5), lerp(y, e[1], 0.5) - 1.2], e], 0.6, false, { col: '#1a3866', a: 0.7 });
  }
  // a sandy bank, right of and below the stream
  const SAND = [...NEAR_BANK, [-14, BOT + 2], [1014, BOT + 2], [1014, 836]];
  P.fill(SAND, (c) => lin(c, 0, 836, 0, BOT, [[0, '#dcb88a'], [1, '#d0a572']]), 'ochre');
  const rsd = rng(hash(ID, 'sand'));
  for (let k = 0; k < 500; k++) {
    const x = rsd() * 1000, y = lerp(838, BOT - 2, rsd());
    if (!inside([x, y], SAND)) continue;
    P.fill(ellipsePts(x, y, 0.7 + rsd(), 0.5 + rsd() * 0.5, 0, 6), rgba('#9c7448', 0.4 + rsd() * 0.3), 'ochre', { knock: false });
  }
  for (const [cx, cy, n] of [[760, 870, 5], [880, 900, 6], [980, 862, 4], [820, 950, 3], [700, 952, 4]]) {
    for (let k = 0; k < n; k++) {
      const bl = blob(cx + (rsd() - 0.5) * 50, cy + (rsd() - 0.5) * 16, 8 + rsd() * 9, 4 + rsd() * 3.5, `sd${cx}_${k}`, 10);
      P.fill(bl, (c) => lin(c, 0, cy - 10, 0, cy + 6, [[0, '#24452f'], [1, '#55804a']]), 'green');
      P.key(bl, 0.6);
    }
  }
  P.key(NEAR_BANK, 1.1, false);
  shrubRow(P, (c) => c, NEAR_BANK.slice(0, 5), 'rb', 5);
  // grass hanging over the water along the path's edge
  const rg = rng(hash(ID, 'grass'));
  for (let x = 4; x < BR0 - 6; x += 10 + rg() * 10) {
    for (const a of [-0.6, -0.15, 0.3]) P.key([[x, ROAD1 - 1], [x + Math.sin(a) * 5, ROAD1 + 5 + Math.cos(a) * 2]], 0.55, false, { col: '#2f5233' });
  }
  bridge(P);
  P.key([[-14, ROAD0], [BR0, ROAD0]], 1.2, false); P.key([[BR1, ROAD0], [1014, ROAD0]], 1.2, false);
  P.key([[-14, ROAD1], [BR0 - 4, ROAD1]], 1.3, false); P.key([[BR1 + 4, ROAD1], [1014, ROAD1]], 1.3, false);
  // bottom margin
  P.fill(RECT(-14, BOT, 1014, 1014), 'paper', 'none', { knock: true });
  P.key([[-14, BOT], [1014, BOT]], 1.8, false);
}
function bridge(P) {
  const deck = RECT(BR0, ROAD0, BR1, 829);
  P.fill(deck, (c) => lin(c, 0, ROAD0, 0, 829, [[0, '#b18a62'], [0.35, '#d0ad84'], [1, '#c09872']]), 'ochre');
  // transverse planks laid across the stringers, slightly uneven
  const rb = rng(hash(ID, 'boards'));
  for (let x = BR0 + 2; x < BR1 - 2; x += 8.5 + rb() * 2) {
    if (rb() < 0.45) P.fill(RECT(x, ROAD0 + 0.5, Math.min(BR1, x + 8), 828.5), 'rgba(110,76,44,0.16)', 'ochre', { knock: false });
    P.key([[x, ROAD0 + rb() * 1.5], [x + (rb() - 0.5) * 1.2, 829 - rb() * 1.5]], 0.5, false, { a: 0.8 });
  }
  P.key([[BR0, ROAD0], [BR1, ROAD0]], 1.0, false);
  P.key([[BR0, 829], [BR1, 829]], 1.0, false);
  const fascia = RECT(BR0 - 4, 829, BR1 + 4, 839);
  P.fill(fascia, '#7c5b3c', 'ochre'); P.key(fascia, 1.0);
  for (const x of [568, 623, 678]) {
    const post = RECT(x - 3.6, 839, x + 3.6, 874);
    P.fill(post, '#6f5136', 'ochre'); P.key(post, 0.9);
    P.fill([[x - 9, 875], [x + 9, 875], [x + 6, 876.6], [x - 6, 876.6]], 'paper', 'none', { knock: false });
  }
  P.key([[568, 846], [623, 866]], 0.9, false); P.key([[623, 846], [678, 866]], 0.9, false);
}

// ------------------------------------------------------------------ travellers (Canvas2D sprites, woodblock style)
// local units: feet at (0, 0), y down, facing +x. Adult ≈ 106 tall with a hat (× sprite scale).
const LEGS0 = {
  stand: { hip: [0, -54], n: [[1.5, -29], [1.5, -3]], f: [[-1.5, -29], [-2.5, -3]] },
  walkA: { hip: [0, -53], n: [[6, -29], [11, -3]], f: [[-4, -28.5], [-12, -5]] },
  walkB: { hip: [0, -51.4], n: [[-4, -27.5], [-11, -5]], f: [[6.5, -28], [10.5, -3]] },
  hunchA: { hip: [-3, -47], n: [[9, -26], [8, -3]], f: [[2, -24], [-8, -4]] },
  hunchB: { hip: [-3, -46], n: [[10, -25], [10, -3]], f: [[1, -24], [-7, -4]] },
  runA: { hip: [2, -51], n: [[15, -34], [14, -10]], f: [[-6, -27], [-19, -8]] },
  runB: { hip: [2, -51], n: [[-6, -27], [-19, -8]], f: [[15, -34], [14, -10]] },
  crouch: { hip: [-10, -30], n: [[12, -26], [6, -3]], f: [[9, -25], [-2, -3]] },
  sit: { hip: [-4, -21], n: [[12, -33], [18, -4]], f: [[10, -31], [15, -4]] },
};
const LEGS = {};
for (const [k, L] of Object.entries(LEGS0)) {
  const q = ([x, y]) => [x * 0.95, y * 0.9];
  LEGS[k] = { hip: q(L.hip), n: L.n.map(q), f: L.f.map(q) };
}
// arm presets in the torso frame: [elbow, hand] offsets from the shoulder (y down along the torso)
const ARMS = {
  down: { n: [[2, 16], [3, 32]], f: [[-2, 16], [-3, 32]] },
  swingA: { n: [[6, 15], [12, 29]], f: [[-6, 15], [-11, 29]] },
  swingB: { n: [[-6, 15], [-11, 29]], f: [[6, 15], [12, 29]] },
  hat: { n: [[12, 2], [14, -14]], f: [[7, 14], [13, 24]] },
  pole: { n: [[9, 6], [12, -6]], f: [[7, 7], [10, -5]] },
  wringA: { n: [[10, 13], [19, 17]], f: [[8, 14], [17, 20]] },
  wringB: { n: [[10, 11], [18, 10]], f: [[8, 15], [16, 23]] },
  shade: { n: [[12, 2], [11, -14]], f: [[-1, 16], [-1, 32]] },
  point: { n: [[14, 2], [29, -6]], f: [[-1, 16], [-1, 32]] },
  staff: { n: [[9, 13], [14, 24]], f: [[-2, 16], [-3, 31]] },
  beckonA: { n: [[12, 4], [10, -13]], f: [[2, 16], [5, 30]] },
  beckonB: { n: [[13, 7], [20, -4]], f: [[2, 16], [5, 30]] },
  rope: { n: [[-3, 16], [-11, 28]], f: [[1, 16], [2, 31]] },
  cover: { n: [[11, -5], [5, -22]], f: [[7, -4], [-3, -20]] },
  palm: { n: [[11, 9], [25, 8]], f: [[-1, 16], [-1, 32]] },
  mouth: { n: [[11, 9], [10, -5]], f: [[3, 16], [6, 29]] },
  rod: { n: [[11, 9], [20, 5]], f: [[9, 11], [18, 8]] },
  rodUp: { n: [[10, 3], [18, -6]], f: [[8, 5], [16, -3]] },
  rodHigh: { n: [[9, -5], [13, -20]], f: [[8, -1], [14, -15]] },
  hoeA: { n: [[10, -3], [15, -17]], f: [[8, -1], [12, -14]] },
  hoeB: { n: [[12, 10], [22, 16]], f: [[10, 12], [19, 20]] },
};
const POSE = {
  stand: { legs: 'stand', arms: 'down', lean: 0.02 },
  walkA: { legs: 'walkA', arms: 'swingA', lean: 0.08, flap: 1 }, walkB: { legs: 'walkB', arms: 'swingB', lean: 0.08, flap: 2 },
  staffA: { legs: 'walkA', arms: 'staff', lean: 0.08 }, staffB: { legs: 'walkB', arms: 'staff', lean: 0.08 },
  hunchA: { legs: 'hunchA', arms: 'hat', lean: 0.5, nod: 0.25, flap: 4 }, hunchB: { legs: 'hunchB', arms: 'hat', lean: 0.56, nod: 0.3, flap: 10 },
  look: { legs: 'stand', arms: 'down', lean: -0.08, nod: -0.55 },
  wringA: { legs: 'stand', arms: 'wringA', lean: 0.2, nod: 0.35 }, wringB: { legs: 'stand', arms: 'wringB', lean: 0.24, nod: 0.42 },
  stare: { legs: 'stand', arms: 'shade', lean: 0.04, nod: -0.12 },
  point: { legs: 'stand', arms: 'point', lean: 0, nod: -0.25 },
  bearA: { legs: 'walkA', arms: 'pole', lean: 0.1 }, bearB: { legs: 'walkB', arms: 'pole', lean: 0.1 },
  runA: { legs: 'runA', arms: 'pole', lean: 0.32, nod: 0.1 }, runB: { legs: 'runB', arms: 'pole', lean: 0.36, nod: 0.12 },
  poleLook: { legs: 'stand', arms: 'pole', lean: -0.05, nod: -0.5 },
  crouch: { legs: 'crouch', arms: 'cover', lean: 0.3, nod: 0.3 },
  cover: { legs: 'hunchA', arms: 'cover', lean: 0.35, nod: 0.28 },
  leadA: { legs: 'walkA', arms: 'rope', lean: 0.1 }, leadB: { legs: 'walkB', arms: 'rope', lean: 0.1 },
  beckonA: { legs: 'stand', arms: 'beckonA', lean: 0.06 }, beckonB: { legs: 'stand', arms: 'beckonB', lean: 0.1 },
  palm: { legs: 'stand', arms: 'palm', lean: 0.02, nod: -0.32 },
  mouth: { legs: 'stand', arms: 'mouth', lean: -0.06, nod: -0.22 },
  coverA: { legs: 'hunchA', arms: 'cover', lean: 0.42, nod: 0.3 }, coverB: { legs: 'hunchB', arms: 'cover', lean: 0.48, nod: 0.35 },
  poleHunchA: { legs: 'hunchA', arms: 'pole', lean: 0.4, nod: 0.3 }, poleHunchB: { legs: 'hunchB', arms: 'pole', lean: 0.46, nod: 0.35 },
  fishA: { legs: 'sit', arms: 'rod', lean: 0.12, nod: 0.15 }, fishB: { legs: 'sit', arms: 'rod', lean: 0.16, nod: 0.22 },
  fishHunch: { legs: 'sit', arms: 'rod', lean: 0.5, nod: 0.4 }, fishLook: { legs: 'sit', arms: 'rod', lean: -0.12, nod: -0.62 },
  biteA: { legs: 'sit', arms: 'rodUp', lean: -0.12, nod: -0.15 }, biteB: { legs: 'sit', arms: 'rodUp', lean: -0.2, nod: -0.25 },
  catch: { legs: 'sit', arms: 'rodHigh', lean: -0.15, nod: -0.4 },
  hoeA: { legs: 'walkA', arms: 'hoeA', lean: 0.2, nod: 0.1 }, hoeB: { legs: 'walkA', arms: 'hoeB', lean: 0.5, nod: 0.35 },
};
const SPEC = {
  mino: { kind: 'traveller', robe: C.indigo, pattern: 'dots', legs: 'gaiter', hat: 'kasa', mino: true },
  woman: { kind: 'woman', robe: '#3d6a8e', pattern: 'dots', obi: '#8a3a2c', hat: 'scarf', child: true },
  porter: { kind: 'traveller', robe: '#36608f', pattern: 'cross', legs: 'bare', hat: 'cloth', hem: 0.55 },
  bearer: { kind: 'bearer', legs: 'bare', hat: 'band', skin: '#dda06e' },
  angler: { kind: 'traveller', robe: '#4a5d6e', legs: 'gaiter', hat: 'kasa', mino: true, hem: 0.5 },
  farmer: { kind: 'traveller', robe: '#5b7c8c', legs: 'bare', hat: 'kasa', hem: 0.6 },
};
const KW = 0.85;

function figGeom(pose) {
  const L = LEGS[pose.legs || 'stand'];
  const hip = L.hip;
  const lean = pose.lean ?? 0;
  const up = [Math.sin(lean), -Math.cos(lean)];
  const sh = [hip[0] + up[0] * 27, hip[1] + up[1] * 27];
  const nk = [sh[0] + up[0] * 3, sh[1] + up[1] * 3];
  const hr = 7;
  const na = lean + (pose.nod ?? 0);
  const hc = [nk[0] + Math.sin(na) * hr * 0.9 + 1.5, nk[1] - Math.cos(na) * hr * 0.9];
  const cs = Math.cos(lean), sn = Math.sin(lean);
  const rot = (p) => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  const A = ARMS[pose.arms || 'down'];
  const arm = (a, sx) => { const s0 = [sh[0] + sx, sh[1] + 2]; const e = rot(a[0]), h = rot(a[1]); return [s0, [s0[0] + e[0], s0[1] + e[1]], [s0[0] + h[0], s0[1] + h[1]]]; };
  return { hip, sh, nk, hc, hr, na, lean, rot, armN: arm(A.n, 1.5), armF: arm(A.f, -1.5), legN: [hip, ...L.n], legF: [hip, ...L.f] };
}
function limb(P, pts, w0, w1, col, reg) {
  const poly = ribbon(smoothPath(pts, 4), (t) => lerp(w0, w1, t));
  P.fill(poly, col, reg); P.key(poly, KW);
}
function hand(P, h, col) { const pts = ellipsePts(h[0], h[1], 2.2, 2.2, 0, 8); P.fill(pts, col || C.skin, 'skin'); P.key(pts, 0.6); }
function shadeOf(col, k = 0.2) { return col === 'paper' ? '#dcd5c5' : mixHex(col, '#14110e', k); }

function paintPerson(P, spec, pose) {
  const J = figGeom(pose);
  const robe = spec.robe, rr = robe === 'paper' ? 'none' : 'blue';
  const staffFar = spec.staff && pose.arms !== 'staff';
  if (staffFar) staffPaint(P, J.armF[2]);
  armPaint(P, J.armF, spec, shadeOf(robe ?? C.skin), rr, true);
  legPaint(P, J.legF, spec, true);
  legPaint(P, J.legN, spec, false);
  bodyPaint(P, J, spec);
  if (spec.mino) minoPaint(P, J, pose.flap ?? 0);
  if (spec.child) childPaint(P, J);
  armPaint(P, J.armN, spec, robe, rr, false);
  if (/^wring/.test(pose.arms)) {
    const a = J.armF[2], b = J.armN[2], d = [b[0] - a[0], b[1] - a[1]];
    const c0 = [a[0] - d[0] * 0.25, a[1] - d[1] * 0.25 + 1], c1 = [b[0] + d[0] * 0.45, b[1] + d[1] * 0.45 + 2.5];
    const cl = ribbon([c0, mix2(c0, c1, 0.5), c1], (t) => lerp(3.6, 2.2, t));
    const cc = spec.kind === 'bearer' ? 'paper' : robe;
    P.fill(cl, cc, cc === 'paper' ? 'none' : 'blue'); P.key(cl, 0.7);
    for (let t = 0.2; t < 0.9; t += 0.2) { const m = mix2(c0, c1, t); P.key([[m[0] - 1.2, m[1] - 1.6], [m[0] + 1.2, m[1] + 1.6]], 0.6, false); }
  }
  headPaint(P, J, spec);
  if (spec.staff && !staffFar) staffPaint(P, J.armN[2]);
  return J;
}
function armPaint(P, A, spec, col, reg, far) {
  if (spec.kind === 'bearer') { limb(P, A, 5.4, 4.2, far ? shadeOf(spec.skin, 0.15) : spec.skin, 'skin'); hand(P, A[2], spec.skin); return; }
  limb(P, A, 6.2, 5.2, col, reg);
  const s0 = A[0], e = A[1], h = A[2];
  const d = spec.kind === 'woman' ? 14 : 7.5;
  const sode = [mix2(s0, e, 0.45), e, mix2(e, h, 0.55), [lerp(e[0], h[0], 0.45), Math.max(e[1], h[1]) + d * 0.7], [e[0] - 2.5, Math.max(e[1], lerp(s0[1], e[1], 0.5)) + d]];
  P.fill(sode, col, reg); P.key(sode, KW);
  hand(P, h, spec.skin);
}
function legPaint(P, L, spec, far) {
  const a = L[2];
  if (spec.kind !== 'woman') {
    const col = spec.legs === 'gaiter' ? C.indigo : spec.legs === 'white' ? 'paper' : spec.skin || C.skin;
    const reg = spec.legs === 'gaiter' ? 'blue' : spec.legs === 'white' ? 'none' : 'skin';
    limb(P, L, 7.4, 4.9, far ? shadeOf(col, 0.15) : col, reg);
  }
  const foot = [[a[0] - 2.4, a[1] - 1.5], [a[0] + 3, a[1] - 1.2], [a[0] + 6, a[1] + 1.4], [a[0] + 5.5, a[1] + 3], [a[0] - 2.8, a[1] + 3]];
  P.fill(foot, shadeOf(spec.skin || C.skin, far ? 0.15 : 0), 'skin'); P.key(foot, 0.7);
  P.key([[a[0] - 3.2, a[1] + 3.2], [a[0] + 6.6, a[1] + 3.2]], 1.4, false);
}
function bodyPaint(P, J, spec) {
  const Rp = (dx, dy) => { const p = J.rot([dx, dy]); return [J.sh[0] + p[0], J.sh[1] + p[1]]; };
  const Hp = (dx, dy) => { const p = J.rot([dx, dy]); return [J.hip[0] + p[0], J.hip[1] + p[1]]; };
  const kneeY = Math.min(J.legN[1][1], J.legF[1][1]);
  if (spec.kind === 'bearer') {
    const torso = [Rp(-6, -1), Rp(4.5, -2), Rp(7, 7), Hp(5.5, -6), Hp(6, 0), Hp(-6, 1), Hp(-6.5, -7), Rp(-8, 8)];
    P.fill(torso, spec.skin, 'skin'); P.key(torso, KW);
    P.key([Rp(3, 9), Rp(2, 16)], 0.5, false);
    const lc = [Hp(-6.8, -4), Hp(6.4, -3), Hp(6.6, 2.5), Hp(1.5, 5), Hp(-6.6, 3)];
    P.fill(lc, 'paper', 'none'); P.key(lc, KW);
    return;
  }
  const long = spec.kind === 'woman';
  let body;
  if (long) {
    const fx = Math.max(J.legN[2][0], J.legF[2][0]) + 5, bx = Math.min(J.legN[2][0], J.legF[2][0]) - 5;
    body = [Rp(-6.5, -1), Rp(4.5, -2.5), Rp(7.5, 6), Hp(6.5, -8), Hp(7, 2), [fx, -14], [fx + 1.5, -1.5], [bx - 1.5, -1.5], [bx, -16], Hp(-8, 2), Hp(-7.5, -8), Rp(-8, 7)];
  } else {
    const hemY = lerp(J.hip[1], kneeY, spec.hem ?? 0.72);
    body = [Rp(-6.5, -1), Rp(4.5, -2.5), Rp(7.5, 6), Hp(7, -8), Hp(8.5, 2), [J.hip[0] + 9 + J.lean * 8, hemY], [J.hip[0] - 9 + J.lean * 3, hemY + 1], Hp(-8.5, 2), Hp(-7.5, -8), Rp(-8, 7)];
  }
  P.fill(body, spec.robe, spec.robe === 'paper' ? 'none' : 'blue');
  if (spec.robe === 'paper') P.grad(body, (c) => lin(c, 0, J.hip[1], 0, J.hip[1] + 40, [[0, 'rgba(120,124,134,0)'], [1, 'rgba(120,124,134,0.35)']]), 'grey');
  if (spec.pattern) robePattern(P, body, spec.pattern);
  P.key(body, KW);
  P.key([Rp(-1.5, -1.5), Rp(3.5, 6), Rp(5, 12)], 0.7, false);
  const ob = [Hp(-8, -9), Hp(7.5, -9.5), Hp(7.8, -4.5), Hp(-8.2, -4)];
  P.fill(ob, spec.obi ?? '#7a5634', spec.obi ? 'red' : 'ochre'); P.key(ob, 0.7);
  if (long) {
    const bow = [Hp(-7.5, -13), Hp(-14, -14), Hp(-15, -3), Hp(-8, -3.5)];
    P.fill(bow, spec.obi, 'red'); P.key(bow, 0.7);
    P.key([Hp(3, 0), [J.hip[0] + 5, -3]], 0.5, false);
    const apron = [Hp(4, -4), Hp(8, -4), [J.hip[0] + 10, -20], [J.hip[0] + 6, -20]];
    P.fill(apron, '#d7c48f', 'ochre'); P.key(apron, 0.6);
  }
}
function robePattern(P, body, kind) {
  const b = bboxOf(body);
  for (let y = b.y0 + 3; y < b.y1 - 2; y += 5.5) {
    for (let x = b.x0 + 2 + (Math.round(y / 5.5) % 2) * 2.75; x < b.x1 - 2; x += 5.5) {
      if (!inside([x, y], body)) continue;
      if (kind === 'cross') {
        P.fill(RECT(x - 1.5, y - 0.45, x + 1.5, y + 0.45), 'paper', 'none', { knock: false });
        P.fill(RECT(x - 0.45, y - 1.5, x + 0.45, y + 1.5), 'paper', 'none', { knock: false });
      } else P.fill(ellipsePts(x, y, 0.9, 0.9, 0, 6), 'paper', 'none', { knock: false });
    }
  }
}
function minoPaint(P, J, flap) {
  const Rp = (dx, dy) => { const p = J.rot([dx, dy]); return [J.sh[0] + p[0], J.sh[1] + p[1]]; };
  const Hp = (dx, dy) => { const p = J.rot([dx, dy]); return [J.hip[0] + p[0], J.hip[1] + p[1]]; };
  const kneeY = Math.min(J.legN[1][1], J.legF[1][1]);
  const hemY = kneeY + 3;
  const back = J.hip[0] - 15 - flap, by = hemY - 6 - flap * 0.7;
  const front = J.hip[0] + 4;
  const pts = [Rp(2, -3.5), Rp(-4, -4.5), Rp(-11, 3), Hp(-13, -6), [back, by]];
  const n = 8;
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push([lerp(back, front, t) - 1.2, lerp(by, hemY, t) + (i % 2 ? 3.4 : 0)]); }
  pts.push(Hp(4, -2), Rp(4, 9), Rp(3.5, 2));
  P.fill(pts, (c) => lin(c, 0, J.sh[1], 0, hemY, [[0, '#b9a66a'], [1, '#8b7843']]), 'straw');
  P.key(pts, KW);
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    P.key([Rp(lerp(-10, 2, t), lerp(3, 11, t)), [lerp(back + 2, front - 2, t), lerp(by - 3, hemY - 3, t)]], 0.5, false);
  }
  P.key([Rp(-6, 4), Rp(1.5, 5)], 0.7, false);
}
function headPaint(P, J, spec) {
  const { hc, na } = J;
  const HP = (x, y) => { const q = rot2([x, y], na * 0.8); return [hc[0] + q[0], hc[1] + q[1]]; };
  const H = (arr) => arr.map(([x, y]) => HP(x, y));
  const face = H([[0, -7.2], [4.2, -6], [6.4, -3], [7, -0.5], [8.8, 1.6], [7.1, 2.8], [7.3, 4.2], [6.2, 5.6], [3.5, 7], [-1, 7.2], [-5.5, 5], [-7.2, 0.5], [-6.2, -4], [-3.2, -6.6]]);
  P.fill(face, spec.skin || C.skin, 'skin'); P.key(face, 0.75);
  P.key(H([[3.6, 0.4], [5.6, 0.1]]), 0.8, false);
  if (spec.hat === 'kasa') {
    P.solid(H([[-7.2, 1], [-6.6, -3.6], [-3, -5.4], [-2, -2], [-4, 2.6]]));
    const kasa = H([[-19, -3.5], [-9, -8.6], [1, -13.6], [11, -9], [21, -4], [12, -4.8], [1, -5.2], [-10, -4.6]]);
    P.fill(kasa, (c) => lin(c, 0, hc[1] - 14, 0, hc[1] - 3, [[0, '#a98c4e'], [1, '#dcc07a']]), 'straw');
    P.key(kasa, 0.85);
    for (const p of [[-14, -4.2], [-5, -4.9], [6, -5], [16, -4.4]]) P.key(H([[1, -13.6], p]), 0.45, false);
    P.key(H([[-3, -4.6], [2.5, 7]]), 0.45, false);
  } else if (spec.hat === 'cloth') {
    const cl = H([[-7.6, 1.5], [-7.4, -4.5], [-3.5, -8], [2.5, -8.4], [6.4, -5.2], [7, -2.4], [2, -3.6], [-2, -2.8], [-5, 1.2]]);
    P.fill(cl, '#7ea3c2', 'blue'); P.key(cl, 0.7);
    for (const p of [[-3, -5], [1, -6.4], [4, -4.6]]) P.fill(ellipsePts(...HP(...p), 0.9, 0.9, 0, 6), 'paper', 'none', { knock: false });
    const tl = H([[-7.2, -3.4], [-12.5, -1.2], [-11.4, 2.2], [-7, 0]]);
    P.fill(tl, '#7ea3c2', 'blue'); P.key(tl, 0.6);
  } else if (spec.hat === 'band') {
    P.solid(H([[-7.2, 1], [-6.8, -4.5], [-2.5, -7.4], [2.5, -7.2], [0.8, -4.5], [-2.5, -2.5], [-4.2, 2]]));
    P.solid(H([[-2.5, -7.6], [0.5, -10], [3.4, -9.4], [1.2, -7.4]]));
    const bd = H([[-7.4, -2.6], [6.4, -4], [6.7, -1.8], [-7.4, -0.6]]);
    P.fill(bd, 'paper', 'none'); P.key(bd, 0.6);
    P.key(H([[-7.4, -1.6], [-11, 0.8]]), 0.9, false); P.key(H([[-7.4, -1.6], [-10.2, -4.4]]), 0.9, false);
  } else if (spec.hat === 'scarf') {
    P.solid(H([[-7.4, 1.5], [-7.6, -4], [-4, -8], [1, -8.6], [5.4, -6.4], [6.4, -3.6], [2.6, -4.6], [-1, -5], [-4.4, -3.4], [-5.2, 1.4]]));
    const sc = H([[-8.6, 3], [-8.8, -4.4], [-5, -9.8], [1.6, -10.4], [6.6, -7.6], [7.4, -4.4], [3, -6.4], [-2, -6.6], [-5.6, -2], [-6, 5], [-9.4, 6.4]]);
    P.fill(sc, '#6f97bd', 'blue'); P.key(sc, 0.7);
    for (const q of [[-4, -6], [0, -8], [-6.6, 0]]) P.fill(ellipsePts(...HP(...q), 0.8, 0.8, 0, 6), 'paper', 'none', { knock: false });
    P.fill(ellipsePts(...HP(7.2, 3.6), 0.8, 0.6, 0, 6), C.red, 'red', { knock: false });
  } else if (spec.hat === 'hair') {
    P.solid(H([[-7.6, 2], [-7.8, -4.6], [-4.2, -8.8], [1, -9.2], [5.6, -6.8], [6.8, -3.4], [3, -4.6], [-1, -5], [-4.6, -3.6], [-5.4, 1.6]]));
    P.solid(ellipsePts(...HP(-7, -9.5), 4.4, 3.6, na, 12));
    P.solid(ellipsePts(...HP(-2.5, -11.5), 3, 2.4, na, 10));
    const comb = H([[-4.6, -9.6], [-0.4, -10.4], [-0.6, -8.8], [-4.4, -8.2]]);
    P.fill(comb, '#c99a4a', 'ochre'); P.key(comb, 0.5);
    P.key(H([[-10, -12.5], [-1.5, -13.5]]), 0.7, false);
    P.fill(ellipsePts(...HP(7.2, 3.6), 0.8, 0.6, 0, 6), C.red, 'red', { knock: false });
  }
}
function staffPaint(P, g) {
  const poly = ribbon([[g[0] - 2, g[1] - 50], [g[0] + 3.5, 0]], 2.6);
  P.fill(poly, '#b48a56', 'ochre'); P.key(poly, 0.7);
  P.key(ellipsePts(g[0] - 2.2, g[1] - 53, 2.4, 3, 0, 10), 0.7);
}

/** A child bundled on the mother's back, peeking over her shoulder. */
function childPaint(P, J) {
  const Rp = (dx, dy) => { const p = J.rot([dx, dy]); return [J.sh[0] + p[0], J.sh[1] + p[1]]; };
  const hc = Rp(-8.5, -7.5);
  const head = ellipsePts(hc[0], hc[1], 5, 5.3, 0, 12);
  P.fill(head, C.skin, 'skin'); P.key(head, 0.7);
  P.solid([[hc[0] - 5.2, hc[1] + 0.5], [hc[0] - 4.6, hc[1] - 3.6], [hc[0] - 0.5, hc[1] - 5.4], [hc[0] + 3.6, hc[1] - 4.4], [hc[0] + 0.6, hc[1] - 2.6], [hc[0] - 2.6, hc[1] + 1.4]]);
  P.fill(ellipsePts(hc[0] + 2.6, hc[1] + 0.2, 0.7, 0.7, 0, 6), KEY, 'none', { knock: false });
  const wrap = [Rp(-3, -2.5), Rp(-10.5, -2), Rp(-15.5, 6), Rp(-16, 19), Rp(-11, 27), Rp(-4, 25)];
  P.fill(wrap, '#b5483a', 'red'); P.key(wrap, KW);
  for (const t of [0.3, 0.6]) P.key([Rp(-4 - t * 2, lerp(-1, 25, t)), Rp(-15.5, lerp(5, 22, t))], 0.6, false);
  hand(P, Rp(-1.5, 0.5));
}

// the porter: two baskets of greens on a shoulder pole
function basketShape(P, bx, by) {
  const b = [[bx - 14, by], [bx + 14, by], [bx + 11, by + 15], [bx - 11, by + 15]];
  P.fill(blob(bx, by - 1.5, 12, 4.5, 'greens' + Math.round(bx), 10), '#4d7a3e', 'green'); P.key(blob(bx, by - 1.5, 12, 4.5, 'greens' + Math.round(bx), 10), 0.6);
  P.fill(b, '#c49c5f', 'ochre');
  for (let x = bx - 11; x <= bx + 11; x += 3.6) P.key([[x, by + 1], [x * 0.92 + bx * 0.08, by + 14]], 0.45, false, { a: 0.75 });
  P.key([[bx - 12.5, by + 7], [bx + 12.5, by + 7]], 0.45, false, { a: 0.75 });
  P.key(b, KW);
  P.key([[bx - 15, by], [bx + 15, by]], 1.5, false);
}
function paintPorterGroup(P, pose) {
  const pn = { walkA: 'bearA', walkB: 'bearB', rainA: 'poleHunchA', rainB: 'poleHunchB', look: 'poleLook', wringA: 'wringA', wringB: 'wringB', stare: 'stare' }[pose];
  const J = figGeom(POSE[pn]);
  const S = plate();
  paintPerson(S, SPEC.porter, POSE[pn]);
  if (/^(wringA|wringB|stare)$/.test(pose)) {
    basketShape(P, -46, -15); basketShape(P, 44, -15);
    const pole = ribbon([[-72, -17], [70, -14]], 3);
    P.fill(pole, '#a0784c', 'ochre'); P.key(pole, KW);
    placeOps(P, S, 0);
    return;
  }
  const py = J.sh[1] - 3.5, cx = J.sh[0] + 2;
  const sw = { walkA: 2.5, walkB: -2.5, rainA: 8, rainB: 3 }[pose] ?? 0;
  const hang = (ex) => {
    const e = [ex, py + 2], bx = ex - sw, by = py + 32;
    P.key([e, [bx - 11, by]], 0.7, false); P.key([e, [bx + 11, by]], 0.7, false);
    basketShape(P, bx, by);
  };
  hang(cx - 52);
  placeOps(P, S, 0);
  const pole = ribbon(smoothPath([[cx - 58, py + 2.5], [cx, py - 0.8], [cx + 58, py + 2.5]], 4), 3.2);
  P.fill(pole, '#a0784c', 'ochre'); P.key(pole, KW);
  hang(cx + 52);
}

// two men carrying a chest slung from a pole
function paintPairGroup(P, pose) {
  const carried = ['walkA', 'walkB', 'startle'].includes(pose);
  const fb = {
    walkA: ['bearA', 'bearB'], walkB: ['bearB', 'bearA'], startle: ['poleLook', 'poleLook'], down: ['crouch', 'cover'],
    look: ['look', 'look'], wringA: ['wringA', 'wringB'], wringB: ['wringB', 'wringA'], stare: ['stare', 'point'],
  }[pose];
  const xr = carried ? -72 : -66, xf = carried ? 72 : 68;
  const Jr = figGeom(POSE[fb[0]]), Jf = figGeom(POSE[fb[1]]);
  const person = (pn, dx) => { const S = plate(); paintPerson(S, SPEC.bearer, POSE[pn]); placeOps(P, S, dx); };
  person(fb[0], xr);
  if (carried) {
    const yr = Jr.sh[1] - 3.5, yf = Jf.sh[1] - 3.5, pY = (yr + yf) / 2;
    const sw = pose === 'walkA' ? 1.5 : pose === 'walkB' ? -1.5 : 0;
    chest(P, pY + 14 - sw * 0.3, sw, pY);
    const pole = ribbon([[xr + Jr.sh[0] - 34, yr + 1], [xf + Jf.sh[0] + 34, yf - 1]], 3.4);
    P.fill(pole, '#a0784c', 'ochre'); P.key(pole, KW);
  } else {
    chest(P, -30, 0, null);
    const pole = ribbon([[-82, -33], [82, -33]], 3.2);
    P.fill(pole, '#a0784c', 'ochre'); P.key(pole, KW);
  }
  person(fb[1], xf);
}
function chest(P, top, sw, pY) {
  if (pY != null) { P.key([[-20, pY], [-22 - sw, top]], 1.2, false, { col: '#8a2e22' }); P.key([[20, pY], [22 - sw, top]], 1.2, false, { col: '#8a2e22' }); }
  const x0 = -30 - sw, x1 = 30 - sw;
  const box = RECT(x0, top, x1, top + 30);
  P.fill(box, '#5e4130', 'ochre');
  P.grad(box, (c) => lin(c, 0, top, 0, top + 30, [[0, 'rgba(255,240,210,0.12)'], [1, 'rgba(20,10,5,0.3)']]), 'grey');
  P.key(box, KW);
  const lid = RECT(x0 - 2, top - 2, x1 + 2, top + 6);
  P.fill(lid, '#4a3324', 'ochre'); P.key(lid, KW);
  for (const x of [x0 + 5, x1 - 5]) P.solid(RECT(x - 2, top + 6, x + 2, top + 30));
  P.solid(RECT(-4 - sw, top + 10, 4 - sw, top + 16));
  P.key([[x0, top + 18], [x1, top + 18]], 1.4, false, { col: '#8a2e22' });
}

// the angler on the near bank: rod over the stream (local +x points over the water)
function paintAngler(P, pose) {
  const pn = { fishA: 'fishA', fishB: 'fishB', hunch: 'fishHunch', look: 'fishLook', biteA: 'biteA', biteB: 'biteB', catch: 'catch' }[pose];
  const J = paintPerson(P, SPEC.angler, POSE[pn]);
  const h = J.armN[2];
  const back = [h[0] - 9, h[1] + 3];
  let rod, tip;
  if (pose === 'biteA' || pose === 'biteB') {
    const k = pose === 'biteA' ? 1 : 0.6;
    tip = [h[0] + 104, h[1] - 10 + 18 * k];
    rod = smoothPath([back, [h[0] + 40, h[1] - 32], [h[0] + 82, h[1] - 30 + 6 * k], tip], 6);
  } else if (pose === 'catch') {
    tip = [h[0] + 70, h[1] - 28];
    rod = smoothPath([back, [h[0] + 36, h[1] - 30], tip], 6);
  } else {
    const lift = pose === 'fishA' ? -26 : pose === 'fishB' ? -23 : -12;
    tip = [h[0] + 124, h[1] + lift];
    rod = [back, tip];
  }
  P.key(rod, 1.5, false, { col: '#5a3e24' });
  if (pose === 'catch') {
    const f = [tip[0] + 3, tip[1] + 30];
    P.key([tip, [f[0], f[1] - 6]], 0.5, false);
    const fish = [[f[0], f[1] - 7], [f[0] + 3.4, f[1]], [f[0] + 2, f[1] + 9], [f[0] + 5, f[1] + 13], [f[0], f[1] + 11], [f[0] - 5, f[1] + 13], [f[0] - 2, f[1] + 9], [f[0] - 3.4, f[1]]];
    P.fill(fish, '#b7c3c8', 'grey'); P.key(fish, 0.7);
    P.fill(ellipsePts(f[0], f[1] - 3, 0.8, 0.8, 0, 6), KEY, 'none', { knock: false });
  } else {
    const w = [tip[0] + 3, 6];
    P.key([tip, w], 0.45, false, { a: 0.9 });
    P.fill(ellipsePts(w[0], w[1] - 1, 1.8, 1.4, 0, 8), C.red, 'red'); P.key(ellipsePts(w[0], w[1] - 1, 1.8, 1.4, 0, 8), 0.5);
    P.key([[w[0] - 7, w[1] + 1.5], [w[0] + 7, w[1] + 1.5]], 0.5, false, { col: '#1a3866' });
  }
  // a creel beside him
  const cr = [[-20, -14], [-8, -14], [-9, 0], [-19, 0]];
  P.fill(cr, '#b58d55', 'ochre'); P.key(cr, 0.7);
  for (let y = -11; y < 0; y += 3.5) P.key([[-19.5, y], [-8.5, y]], 0.4, false, { a: 0.7 });
}

// a farmer hoeing out on the plain
function paintFarmer(P, pose) {
  const pn = { hoeA: 'hoeA', hoeB: 'hoeB', cover: 'cover', look: 'look', stare: 'stare' }[pose];
  const J = paintPerson(P, SPEC.farmer, POSE[pn]);
  const h = J.armN[2];
  if (pose === 'hoeA' || pose === 'hoeB') {
    const end = pose === 'hoeA' ? [h[0] - 18, h[1] - 26] : [h[0] + 22, -3];
    P.key([[h[0] - (end[0] - h[0]) * 0.25, h[1] - (end[1] - h[1]) * 0.25], end], 1.6, false, { col: '#6a4a2c' });
    const bl = pose === 'hoeA' ? [[end[0] - 1, end[1]], [end[0] + 7, end[1] - 3], [end[0] + 8, end[1] + 2]] : [[end[0], end[1]], [end[0] + 3, end[1] - 8], [end[0] + 7, end[1] - 7], [end[0] + 5, end[1] + 1]];
    P.solid(bl);
  }
}

// ------------------------------------------------------------------ the cast and its states
function travellerState(a, b, ra = 'hunchA', rb = 'hunchB') {
  return (u) => {
    const bt = beat(u), q = quarter(u);
    if (u < 2) return { pose: bt % 2 ? a : b, f: 1 };
    if (u < 4) return { pose: q % 2 ? ra : rb, f: 1 };
    if (u < 5) return { pose: 'look', f: 1 };
    if (u < 9) return { pose: bt % 2 ? 'wringA' : 'wringB', f: 1 };
    return { pose: 'stare', f: 1 };
  };
}
const CAST = [
  { id: 'farmer', type: 'farmer', s: 0.6, fy: 650, box: [-46, -130, 46, 6], x: () => 846,
    st: (u) => {
      const bt = beat(u);
      if (u < 2 || (u >= 5 && u < 9)) return { pose: bt % 2 ? 'hoeA' : 'hoeB', f: -1 };
      if (u < 4) return { pose: 'cover', f: -1 };
      if (u < 5) return { pose: 'look', f: -1 };
      return { pose: 'stare', f: 1 };
    } },
  { id: 'woman', type: 'person', spec: 'woman', s: 1.22, fy: 783, box: [-36, -124, 36, 6], x: (u) => 10 + 4.4 * (clamp(u, -7, 2) + 7), st: travellerState('walkA', 'walkB', 'coverA', 'coverB') },
  { id: 'porter', type: 'porter', s: 1.18, fy: 787, box: [-90, -126, 90, 6], x: (u) => 132 + 5.5 * (clamp(u, -7, 2) + 7),
    st: (u) => {
      const bt = beat(u), q = quarter(u);
      if (u < 2) return { pose: bt % 2 ? 'walkA' : 'walkB', f: 1 };
      if (u < 4) return { pose: q % 2 ? 'rainA' : 'rainB', f: 1 };
      if (u < 5) return { pose: 'look', f: 1 };
      if (u < 9) return { pose: bt % 2 ? 'wringA' : 'wringB', f: 1 };
      return { pose: 'stare', f: 1 };
    } },
  { id: 'mino', type: 'person', spec: 'mino', s: 1.3, fy: 791, box: [-42, -126, 36, 6], x: (u) => 262 + 5 * (clamp(u, -7, 2) + 7) + 1.6 * clamp(u - 2, 0, 2), st: travellerState('walkA', 'walkB') },
  { id: 'pair', type: 'pair', s: 1.18, fy: 786, box: [-142, -134, 142, 6], x: (u) => 962 - 6 * (clamp(u, -7, 2) + 7),
    st: (u) => {
      const bt = beat(u);
      if (u < 2) return { pose: bt % 2 ? 'walkA' : 'walkB', f: -1 };
      if (u < 2.25) return { pose: 'startle', f: -1 };
      if (u < 4) return { pose: 'down', f: -1 };
      if (u < 5) return { pose: 'look', f: -1 };
      if (u < 9) return { pose: bt % 2 ? 'wringA' : 'wringB', f: -1 };
      return { pose: 'stare', f: 1 };
    } },
  { id: 'angler', type: 'angler', s: 1.08, fy: 934, box: [-26, -140, 168, 14], x: () => 612,
    st: (u) => {
      const bt = beat(u);
      if (u < 2) return { pose: Math.floor(bt / 2) % 2 ? 'fishA' : 'fishB', f: -1 };
      if (u < 3.5) return { pose: 'hunch', f: -1 };
      if (u < 4.25) return { pose: 'look', f: -1 };
      if (u < 5) return { pose: 'fishA', f: -1 };
      if (u < 6.5) return { pose: bt % 2 ? 'biteA' : 'biteB', f: -1 };
      return { pose: 'catch', f: -1 };
    } },
];
function paintCast(P, c, pose) {
  if (c.type === 'porter') paintPorterGroup(P, pose);
  else if (c.type === 'pair') paintPairGroup(P, pose);
  else if (c.type === 'angler') paintAngler(P, pose);
  else if (c.type === 'farmer') paintFarmer(P, pose);
  else paintPerson(P, SPEC[c.spec], POSE[pose]);
}
const SP = 2;   // sprite px per unit
function buildAtlas(K) {
  const sprites = [];
  for (const c of CAST) {
    const keys = new Map();
    for (let i = -28; i <= 52; i++) { const st = c.st(i / 4); keys.set(`${c.id}|${st.pose}|${st.f}`, st); }
    for (const [key, st] of keys) {
      const [a0, b0, a1, b1] = c.box;
      const box = st.f < 0 ? [-a1, b0, -a0, b1] : [a0, b0, a1, b1];
      sprites.push({ key, c, st, box, w: Math.ceil((box[2] - box[0]) * c.s * SP), h: Math.ceil((box[3] - box[1]) * c.s * SP) });
    }
  }
  const AW = 2048, PAD = 2;
  let cx = PAD, cy = PAD, rowH = 0;
  for (const sp of sprites.slice().sort((a, b) => b.h - a.h)) {
    if (cx + sp.w + PAD > AW) { cx = PAD; cy += rowH + PAD; rowH = 0; }
    sp.ax = cx; sp.ay = cy; cx += sp.w + PAD; rowH = Math.max(rowH, sp.h);
  }
  const AH = Math.ceil((cy + rowH + PAD) / 16) * 16;
  const map = new Map();
  const img = K.layer(`${ID}:atlas2`, AW, AH, (x) => {
    for (const sp of sprites) {
      const cell = mk(sp.w, sp.h).getContext('2d');
      const P = plate();
      paintCast(P, sp.c, sp.st.pose);
      printPlate(cell, P, { x0: sp.box[0], y0: sp.box[1], s: SP * sp.c.s, mode: 'sprite', T: [sp.st.f, 0, 0, 1, 0, 0], seed: sp.key, speck: 300 });
      x.drawImage(cell.canvas, sp.ax, sp.ay);
    }
  });
  for (const sp of sprites) {
    const s = sp.c.s;
    map.set(sp.key, { ox: sp.box[0] * s, oy: sp.box[1] * s, w: (sp.box[2] - sp.box[0]) * s, h: (sp.box[3] - sp.box[1]) * s, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  }
  return { img, map, n: sprites.length, AW, AH };
}
/** World positions where wrung-out sleeves drip. */
function wringHands(c, st, x) {
  if (!/^wring/.test(st.pose)) return [];
  const out = [];
  const add = (pose, dx) => { const J = figGeom(POSE[pose]); const h = mix2(J.armN[2], J.armF[2], -0.4); out.push([x + st.f * (dx + h[0]) * c.s, c.fy + (h[1] + 3) * c.s]); };
  if (c.type === 'pair') { add(st.pose, -66); add(st.pose === 'wringA' ? 'wringB' : 'wringA', 68); }
  else add(st.pose, 0);
  return out;
}

// ------------------------------------------------------------------ title cartouches, signature and seals
function sealCanvas(K, text, px, kind) {
  const c = mk(px, px), x = c.getContext('2d');
  const r = rng(hash(ID, 'seal', text, kind));
  x.fillStyle = C.red; x.strokeStyle = C.red;
  if (kind === 'square') {
    x.fillRect(px * 0.05, px * 0.05, px * 0.9, px * 0.9);
    x.globalCompositeOperation = 'destination-out';
    const g = glyph(K, text, { font: '"Libian SC", "Kaiti SC", serif' });
    const k = (px * 0.72) / 120;
    x.drawImage(g.cv, px / 2 - (g.w * k) / 2, px / 2 - (g.h * k) / 2 + px * 0.02, g.w * k, g.h * k);
  } else {
    x.lineWidth = px * 0.075;
    x.beginPath(); x.ellipse(px / 2, px / 2, px * (kind === 'oval' ? 0.3 : 0.44), px * 0.44, 0, 0, Math.PI * 2); x.stroke();
    const g = glyph(K, text, { font: '"Kaiti SC", serif', vertical: true, lineHeight: 1.0 });
    const k = (px * (kind === 'oval' ? 0.29 : 0.6)) / 120;
    const tmp = mk(g.w, g.h), tx = tmp.getContext('2d');
    tx.drawImage(g.cv, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = C.red; tx.fillRect(0, 0, g.w, g.h);
    x.drawImage(tmp, px / 2 - (g.w * k) / 2, px / 2 - (g.h * k) / 2, g.w * k, g.h * k);
  }
  x.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < px * 2.2; k++) { x.globalAlpha = 0.25 + r() * 0.6; x.beginPath(); x.arc(r() * px, r() * px, 0.4 + r() * px * 0.012, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return c;
}
const TITLE_R = { x0: 778, y0: 36, w: 194, h: 336 };
const XING = '"Xingkai SC", "Kaiti SC", serif', KAI = '"Kaiti SC", serif', SERIF = 'Baskerville, "Hoefler Text", serif';
function paintTitle(P, K) {
  // the series cartouche, tall and narrow at the top right: pale panel, double key rule, the era in a sub-panel
  const X0 = 892, X1 = 962, Y0 = 44, Y1 = 362;
  P.fill(RECT(X0, Y0, X1, Y1), '#f2e3b6', 'ochre'); P.key(RECT(X0, Y0, X1, Y1), 1.6);
  P.key(RECT(X0 + 4, Y0 + 4, X1 - 4, Y1 - 4), 0.7);
  const t1 = glyph(K, '富岳・浮世绘', { font: XING, vertical: true, lineHeight: 1.04 });
  P.keyImg(t1.cv, ...glyphRect(t1, 33, (X0 + X1) / 2, Y0 + 13));
  const S0 = Y1 - 92;
  P.fill(RECT(X0 + 9, S0, X1 - 9, Y1 - 9), '#f8efd4', 'none'); P.key(RECT(X0 + 9, S0, X1 - 9, Y1 - 9), 0.8);
  const a = glyph(K, '一八三〇', { font: KAI, vertical: true, lineHeight: 1.0 });
  P.keyImg(a.cv, ...glyphRect(a, 18.5, X1 - 9 - 13, S0 + 6));
  const b = glyph(K, '年代', { font: KAI, vertical: true, lineHeight: 1.0 });
  P.keyImg(b.cv, ...glyphRect(b, 18.5, X0 + 9 + 13, S0 + 6));
  // the small cartouche in English
  const E0 = 784, E1 = 884, F0 = 44, F1 = 108;
  P.fill(RECT(E0, F0, E1, F1), '#f2e3b6', 'ochre'); P.key(RECT(E0, F0, E1, F1), 1.4);
  P.key(RECT(E0 + 4, F0 + 4, E1 - 4, F1 - 4), 0.6);
  const e1 = glyph(K, 'Ukiyo-e', { font: SERIF, weight: 600, style: 'italic' });
  P.keyImg(e1.cv, ...glyphRect(e1, 24, (E0 + E1) / 2, F0 + 9));
  const e2 = glyph(K, '1830s', { font: SERIF, weight: 600 });
  P.keyImg(e2.cv, ...glyphRect(e2, 21, (E0 + E1) / 2, F0 + 36));
}
const SIG_R = { x0: 862, y0: 838, w: 110, h: 136 };
function paintSignature(P, K) {
  // 「鹕斋画」 — a nod to Hokusai's 北斎 — in a red-ruled cartouche, with the artist's square seal
  const X0 = 914, X1 = 958, Y0 = 848, Y1 = 962;
  P.fill(RECT(X0, Y0, X1, Y1), C.red, 'red'); P.key(RECT(X0, Y0, X1, Y1), 1.1);
  P.fill(RECT(X0 + 4, Y0 + 4, X1 - 4, Y1 - 4), C.yellow, 'ochre'); P.key(RECT(X0 + 4, Y0 + 4, X1 - 4, Y1 - 4), 0.6);
  const g = glyph(K, '鹕斋画', { font: XING, vertical: true, lineHeight: 1.06 });
  P.keyImg(g.cv, ...glyphRect(g, 30, (X0 + X1) / 2, Y0 + 9));
  P.fill(RECT(876.5, 932.5, 905.5, 961.5), 'paper', 'none');
  P.colImg(sealCanvas(K, '鹕', 96, 'square'), 876, 932, 30, 30, 'red');
}
const SEAL_R = { x0: 18, y0: 326, w: 70, h: 112 };
function paintSeals(P, K) {
  // publisher's and censor's seals stamped near the left edge
  P.fill(ellipsePts(52, 360, 17.5, 26, 0, 24), 'paper', 'none');
  P.colImg(sealCanvas(K, '鹕永堂', 200, 'oval'), 22, 330, 60, 60, 'red');
  P.fill(ellipsePts(52, 414, 12.5, 12.5, 0, 20), 'paper', 'none');
  P.colImg(sealCanvas(K, '極', 120, 'round'), 38, 400, 28, 28, 'red');
}

// ------------------------------------------------------------------ live grasses on the near bank (bend in the squall)
const REEDS = [[712, 962, 7], [776, 956, 6], [842, 968, 5]];
function drawReeds(K, u, wind) {
  REEDS.forEach(([cx, by, n], i) => {
    const r = rng(hash(ID, 'reed', i));
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 34, L = 28 + r() * 28, ph = r() * 6;
      const bend = -wind * (16 + 6 * Math.sin(u * 7 + ph)) + Math.sin(u * 1.6 + ph) * 2.2 + (r() - 0.5) * 8;
      K.seed(ID, 'reed', i, k);
      K.brush.set(`${ID}.key`, '#2b4527', 1.1);
      K.brush.spline([[x, by], [x + bend * 0.3, by - L * 0.55], [x + bend, by - L]], 0.6);
    }
  });
}

// ------------------------------------------------------------------ rain lines (two printed greys, scrolling tiles)
function rainTile(K, key, P, n, o) {
  const N = Math.round(P * 1.4);
  const img = K.layer(`${ID}:${key}`, N, N, (c) => {
    c.setTransform(N / P, 0, 0, N / P, 0, 0);
    const r = rng(hash(ID, key));
    c.lineCap = 'butt';
    for (let k = 0; k < n; k++) {
      const x = r() * P, y = r() * P, L = o.L0 + Math.pow(r(), 1.4) * (o.L1 - o.L0);
      c.strokeStyle = rgba(o.col, o.a0 + r() * (o.a1 - o.a0));
      c.lineWidth = o.w0 + r() * (o.w1 - o.w0);
      for (const ox of [-P, 0, P]) {
        for (const oy of [-P, 0, P]) {
          const x0 = x + ox, y0 = y + oy, x1 = x0 + RAIN_D[0] * L, y1 = y0 + RAIN_D[1] * L;
          if (Math.max(x0, x1) < -2 || Math.min(x0, x1) > P + 2 || Math.max(y0, y1) < -2 || Math.min(y0, y1) > P + 2) continue;
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        }
      }
    }
  });
  return { img, P, s: N / P, v: o.v, ox: o.ox ?? 0, oy: o.oy ?? 0 };
}
/** Draw a periodic tile (origin ox, oy) over the panel rect, cropping with source rectangles. */
function drawTiled(T, ox, oy, X0, Y0, X1, Y1) {
  const P = T.P, s = T.s;
  for (let kx = Math.floor((X0 - ox) / P); kx <= Math.floor((X1 - ox) / P); kx++) {
    for (let ky = Math.floor((Y0 - oy) / P); ky <= Math.floor((Y1 - oy) / P); ky++) {
      const tx = ox + kx * P, ty = oy + ky * P;
      const a0 = Math.max(X0, tx), a1 = Math.min(X1, tx + P), b0 = Math.max(Y0, ty), b1 = Math.min(Y1, ty + P);
      if (a1 - a0 < 0.01 || b1 - b0 < 0.01) continue;
      image(T.img, a0, b0, a1 - a0, b1 - b0, (a0 - tx) * s, (b0 - ty) * s, (a1 - a0) * s, (b1 - b0) * s);
    }
  }
}

// ------------------------------------------------------------------ the pelican, re-printed every frame
function tiltHead(P, ang) {
  if (!ang) return P;
  const B = P.bird, hc = B.head.c;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const T = (p) => [hc[0] + (p[0] - hc[0]) * cs - (p[1] - hc[1]) * sn, hc[1] + (p[0] - hc[0]) * sn + (p[1] - hc[1]) * cs];
  const M = (arr) => arr.map(T);
  const bird = { ...B, upperBill: M(B.upperBill), nail: M(B.nail), pouch: M(B.pouch), lowerJawLine: M(B.lowerJawLine), facePatch: M(B.facePatch), crest: B.crest.map(M), eye: { ...B.eye, c: T(B.eye.c), pupil: T(B.eye.pupil) } };
  return { ...P, bird };
}
/** The pouch as a function of its sag S and fullness f, in the frame of the lower jaw (rebuilt from lowerJawLine). */
function pouchFrame(B) {
  const [J0, J1] = B.lowerJawLine;
  const dx = J1[0] - J0[0], dy = J1[1] - J0[1];
  const sc = Math.hypot(dx, dy) / Math.hypot(106, 1);
  const ang = Math.atan2(dy, dx) + Math.atan2(1, 106);
  const cs = Math.cos(ang) * sc, sn = Math.sin(ang) * sc;
  const base = [J0[0] - (cs * -2 - sn * 5), J0[1] - (sn * -2 + cs * 5)];
  return (a, o) => [base[0] + cs * a - sn * o, base[1] + sn * a + cs * o];
}
// sac outline in the jaw frame [along, depth/S]: f = 0 ≈ the rig's own pouch, f = 1 a round, heavy water bag
const SAC0 = [[-2, 0.05], [8, 0.36], [20, 0.62], [35, 0.86], [50, 1.0], [65, 0.9], [80, 0.72], [95, 0.36], [106, 0.04]];
const SAC1 = [[-2, 0.05], [-8, 0.46], [-2, 0.78], [14, 0.97], [36, 1.04], [58, 0.98], [76, 0.78], [93, 0.42], [106, 0.06]];
function pouchShape(Bf, S, f) {
  const bag = SAC0.map(([a, d], i) => { const [a1, d1] = SAC1[i]; return Bf(lerp(a, a1, f), 5 + S * lerp(d, d1, f)); });
  return smoothPath(bag, 5).concat(smoothPath([Bf(104, 3), Bf(60, 3), Bf(10, 3), Bf(-2, 5)], 3));
}

function paintRider(c, sc, P, g, o) {
  const B = P.bird, BK = P.bike;
  const kw = 1.15;
  const off = (n) => REG[n] || [0, 0];
  const fillR = (pts, style, reg, a = 1) => { c.save(); const d = off(reg); c.translate(d[0], d[1]); trace(c, pts); c.globalAlpha = a; c.fillStyle = style; c.fill(); c.restore(); };
  const line = (pts, w, close = false, col = KEY) => { trace(c, pts, close); c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); };
  const ring = (p, r, w) => { c.beginPath(); c.arc(p[0], p[1], Math.max(0.1, r), 0, Math.PI * 2); c.lineWidth = w; c.strokeStyle = KEY; c.stroke(); };
  const dot = (p, r, col = KEY) => { c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fillStyle = col; c.fill(); };
  const gradIn = (pts, reg, mkG) => { c.save(); trace(c, pts); c.clip(); const d = off(reg); c.translate(d[0], d[1]); c.fillStyle = mkG(c); c.fillRect(-3000, -3000, 7000, 7000); c.restore(); };

  // far leg and crank
  fillR(B.legFar.poly, '#a9452c', 'red'); line(B.legFar.poly, kw, true);
  fillR(B.legFar.web, '#a9452c', 'red'); line(B.legFar.web, kw * 0.9, true);
  line([BK.crank.bb, BK.crank.far], 3.2);
  // wheels: black tyres, a thin rim line, spokes
  for (const wh of BK.wheels) {
    ring(wh.c, wh.r - 2.4, 4.8);
    ring(wh.c, wh.r * 0.86, 0.9);
    for (let j = 0; j < wh.spokes; j++) {
      const a = wh.angle + (j * Math.PI * 2) / wh.spokes;
      line([[wh.c[0] + Math.cos(a) * 3, wh.c[1] + Math.sin(a) * 3], [wh.c[0] + Math.cos(a) * wh.r * 0.86, wh.c[1] + Math.sin(a) * wh.r * 0.86]], 0.55);
    }
    dot(wh.c, 3.4);
  }
  line(BK.chain.concat([BK.chain[0]]), 0.9);
  // Prussian-blue frame with one outline around the union of the tubes
  const tubes = [...Object.values(BK.tubes), BK.fork];
  c.save(); const db = off('blue'); c.translate(db[0], db[1]);
  c.strokeStyle = C.blue; c.lineWidth = 4.4; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const t of tubes) { trace(c, t, false); c.stroke(); }
  c.restore();
  unionOutline(c, sc, tubes, 'stroke', 4.4, 0.95, o);
  line(BK.stem, 3.0); line(BK.bars, 3.0); line(BK.seatpost, 3.0); line(BK.saddle, 5.0);
  const rg = ellipsePts(BK.crank.bb[0], BK.crank.bb[1], BK.crank.ring, BK.crank.ring, 0, 20);
  fillR(rg, o.pat, 'paper'); ring(BK.crank.bb, BK.crank.ring, 1.1); ring(BK.crank.bb, BK.crank.ring * 0.55, 0.7); dot(BK.crank.bb, 2.4);
  // near leg (in front of the frame, under the plumage)
  fillR(B.legNear.poly, C.verm, 'red'); line(B.legNear.poly, kw, true);
  fillR(B.legNear.web, C.verm, 'red'); line(B.legNear.web, kw * 0.9, true);
  // plumage: unprinted washi, a grey bokashi on the belly, one key line around the whole bird
  const head = ellipsePts(B.head.c[0], B.head.c[1], B.head.r, B.head.r, 0, 24);
  const plum = [B.tail, B.body, B.neck, head];
  if (g.lump) plum.push(g.lump);
  for (const p of plum) fillR(p, o.pat, 'paper');
  const by = B.bodyC[1];
  gradIn(B.body, 'grey', (cc) => lin(cc, 0, by + B.bodyRy + 2, 0, by - 8, [[0, 'rgba(108,114,128,0.66)'], [0.45, 'rgba(126,132,144,0.3)'], [1, 'rgba(140,140,150,0)']]));
  gradIn(B.tail, 'grey', (cc) => lin(cc, 0, by + 20, 0, by - 10, [[0, 'rgba(108,114,128,0.5)'], [1, 'rgba(140,140,150,0)']]));
  unionOutline(c, sc, plum, 'fill', 0, kw, o);
  // wing: washi with soft grey lower edge, covert scallops, black flight feathers
  fillR(B.wing, o.pat, 'paper');
  gradIn(B.wing, 'grey', (cc) => lin(cc, 0, by + 16, 0, by - 18, [[0, 'rgba(112,118,130,0.5)'], [1, 'rgba(130,130,140,0)']]));
  line(B.wing, kw, true);
  const w = B.wing, n = w.length;
  for (let k = 0; k < 3; k++) {
    const f = 0.28 + k * 0.17, pts = [];
    for (let j = Math.floor(n * 0.42); j < Math.floor(n * 0.82); j += 2) pts.push(mix2(w[j], [B.bodyC[0] + 6, B.bodyC[1] - 6], f));
    if (pts.length > 2) line(pts, 0.7);
  }
  c.fillStyle = KEY;
  trace(c, taper(B.secondaries, 6.5, 1.6)); c.fill();
  for (const fe of B.primaries) { trace(c, taper(fe, 5.2, 1.1)); c.fill(); }
  for (const cr of B.crest) line(cr, 1.0);
  // pouch: orange-vermilion with a bokashi; full of rain it swells, water shows through
  const pouch = g.pouch || B.pouch;
  fillR(pouch, '#e2733c', 'red');
  if (g.Bf) {
    const S = g.S, Bf = g.Bf, p0 = Bf(40, 4), p1 = Bf(40, 5 + S);
    gradIn(pouch, 'red', (cc) => lin(cc, p0[0], p0[1], p1[0], p1[1], [[0, 'rgba(208,80,46,0)'], [0.55, 'rgba(200,72,40,0.3)'], [1, 'rgba(150,44,26,0.8)']]));
    if (g.fill > 0.03) {
      // the rain it has caught shows through the skin: a Prussian-blue body of water under a rippling line
      const lv = 5 + S * (1 - 0.72 * g.fill);
      const wl = [];
      for (let a = -14; a <= 124; a += 6) wl.push(Bf(a, lv + Math.sin(a * 0.15 + o.t * 11) * 1.6));
      const water = [...wl, Bf(124, 600), Bf(-14, 600)];
      const q0 = Bf(40, lv), q1 = Bf(40, 5 + S);
      const k = smoothstep(0.03, 0.35, g.fill);
      c.save(); trace(c, pouch); c.clip();
      c.save(); c.translate(...off('blue'));
      trace(c, water); c.fillStyle = lin(c, q0[0], q0[1], q1[0], q1[1], [[0, `rgba(104,150,192,${0.95 * k})`], [0.45, `rgba(52,96,150,${0.95 * k})`], [1, `rgba(24,50,98,${0.97 * k})`]]); c.fill();
      c.restore();
      line(wl, 0.9, false, `rgba(27,23,20,${0.85 * k})`);
      // a skin of vermilion around the water, and a gloss
      trace(c, pouch); c.lineWidth = 6; c.strokeStyle = `rgba(214,92,48,${0.85 * k})`; c.lineJoin = 'round'; c.stroke();
      const hl = [Bf(10, lv + S * 0.2), Bf(26, lv + S * 0.36), Bf(44, lv + S * 0.42)];
      line(hl, 2.2, false, `rgba(246,241,226,${0.8 * k})`);
      c.restore();
    }
  } else gradIn(pouch, 'red', (cc) => lin(cc, 0, B.head.c[1] + 4, 0, B.head.c[1] + 36, [[0, 'rgba(208,80,46,0)'], [1, 'rgba(150,44,26,0.75)']]));
  line(pouch, kw, true);
  // water between the mandibles while the bill is ajar
  const ub = B.upperBill;
  if (g.fill > 0.12 && (P.mods?.billOpen ?? 0) > 0.02) {
    const gap = [B.lowerJawLine[0], B.lowerJawLine[1], ub[5], ub[6], ub[7]];
    fillR(gap, C.blue, 'blue', Math.min(1, g.fill * 1.4));
    line([mix2(B.lowerJawLine[0], ub[7], 0.5), mix2(B.lowerJawLine[1], ub[5], 0.5)], 0.8, false, 'rgba(246,241,226,0.8)');
  }
  // bill, nail, face, eye
  fillR(ub, '#ecc98a', 'ochre'); line(ub, kw, true);
  line([mix2(ub[0], ub[7], 0.42), mix2(ub[1], ub[6], 0.42), mix2(ub[2], ub[5], 0.42)], 0.6);
  fillR(B.nail, C.verm, 'red'); line(B.nail, 0.8, true);
  fillR(B.facePatch, '#efc49e', 'skin');
  const E = B.eye;
  if (E.mode === 'closed') {
    c.beginPath(); c.arc(E.c[0], E.c[1] + E.r * 0.55, E.r * 0.95, Math.PI * 1.12, Math.PI * 1.88); c.lineWidth = 1.3; c.strokeStyle = KEY; c.lineCap = 'round'; c.stroke();
  } else dot([E.c[0] + 0.5, E.c[1]], 2.7);
  // drips from the full pouch
  if (g.fill > 0.55 && g.Bf) {
    const lp = g.Bf(lerp(50, 36, g.fill), 5 + g.S * lerp(1, 1.04, g.fill));
    for (let k = 0; k < 2; k++) {
      const ph = mod(o.t * 2.2 + k * 0.5, 1);
      const p = [lp[0] - 2 + k * 5, lp[1] + 3 + ph * 70];
      const drop = [[p[0], p[1] - 3.2], [p[0] + 1.5, p[1] + 0.6], [p[0], p[1] + 1.8], [p[0] - 1.5, p[1] + 0.6]];
      fillR(drop, C.blueL, 'blue', 1 - ph); line(drop, 0.6, true, `rgba(27,23,20,${1 - ph})`);
    }
  }
  // near crank and pedal
  line([BK.crank.bb, BK.crank.near], 3.4);
  line([[BK.crank.near[0] - 6, BK.crank.near[1]], [BK.crank.near[0] + 6, BK.crank.near[1]]], 4.2);
}
/** One key line around the union of shapes (fill polygons, or stroked polylines of width w). */
function unionOutline(c, sc, shapes, mode, w, kw, o) {
  sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, o.pw + 2, o.ph + 2);
  sc.setTransform(c.getTransform());
  sc.strokeStyle = KEY; sc.fillStyle = '#000'; sc.lineJoin = 'round'; sc.lineCap = 'round';
  if (mode === 'fill') {
    sc.lineWidth = kw * 2; for (const p of shapes) { trace(sc, p); sc.stroke(); }
    sc.globalCompositeOperation = 'destination-out'; for (const p of shapes) { trace(sc, p); sc.fill(); }
  } else {
    sc.lineWidth = w + kw * 2; for (const p of shapes) { trace(sc, p, false); sc.stroke(); }
    sc.globalCompositeOperation = 'destination-out'; sc.lineWidth = w; for (const p of shapes) { trace(sc, p, false); sc.stroke(); }
  }
  sc.globalCompositeOperation = 'source-over';
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(sc.canvas, 0, 0, o.pw + 2, o.ph + 2, 0, 0, o.pw + 2, o.ph + 2); c.restore();
}

// ------------------------------------------------------------------ scene
export default {
  freezeU: 2.9,
  ride: RIDE,
  cues: [{ u: 2.0, name: 'shower' }, { u: 2.5, name: 'pouchFill' }, { u: 3.5, name: 'gulp' }, { u: 4.0, name: 'showerStops' }],

  async init(K) {
    K.brush.add(`${ID}.key`, {
      type: 'default', weight: 1, scatter: 0.02, sharpness: 1, grain: 1.2, opacity: 235, spacing: 0.12,
      pressure: [1, 1], rotate: 'natural', noise: 0.02,
    });
    buildTextures(K);
    const L = (this.L = {});
    L.back = paperLayer(K, 'back', 0, BACK_H, (P) => paintBack(P, K, false));
    L.backRain = paperLayer(K, 'backRain', 0, BACK_H, (P) => paintBack(P, K, true));
    L.mid = paperLayer(K, 'mid', MID_Y0, 1000 - MID_Y0, (P) => paintMid(P));
    L.wet = spriteLayer(K, 'wet', -10, ROAD0 - 2, 1020, ROAD1 - ROAD0 + 4, (P) => {
      P.grad(RECT(-10, ROAD0, 1010, ROAD1), (c) => lin(c, 0, ROAD0, 0, ROAD1, [[0, 'rgba(58,60,70,0.5)'], [0.5, 'rgba(66,70,80,0.32)'], [1, 'rgba(58,60,70,0.5)']]), 'grey');
    }, 1);
    L.puddles = spriteLayer(K, 'puddles', -10, ROAD0 - 2, 1020, ROAD1 - ROAD0 + 4, (P) => {
      for (const [x, y, rx, ry] of [[120, 814, 46, 6.5], [330, 826, 34, 5], [460, 812, 40, 6], [800, 816, 50, 6.5], [930, 826, 36, 5], [742, 789, 28, 3.6]]) {
        const pd = blob(x, y, rx, ry, 'pd' + x, 14);
        P.fill(pd, (c) => lin(c, 0, y - ry, 0, y + ry, [[0, '#2c4f80'], [1, '#9dbdd2']]), 'blue');
        P.fill([[x - rx * 0.5, y - ry * 0.2], [x + rx * 0.3, y - ry * 0.25], [x + rx * 0.3, y + ry * 0.05], [x - rx * 0.5, y + ry * 0.05]], 'paper', 'none', { a: 0.8, knock: false });
        P.key(pd, 0.8);
      }
    });
    L.veil = K.layer(`${ID}:veil`, 4, 256, (c) => {
      c.fillStyle = lin(c, 0, 0, 0, 256, [[0, 'rgba(36,42,54,0.42)'], [0.5, 'rgba(56,62,72,0.2)'], [1, 'rgba(60,64,70,0.12)']]);
      c.fillRect(0, 0, 4, 256);
    });
    L.title = spriteLayer(K, 'title', TITLE_R.x0, TITLE_R.y0, TITLE_R.w, TITLE_R.h, (P) => paintTitle(P, K));
    L.sig = spriteLayer(K, 'sig', SIG_R.x0, SIG_R.y0, SIG_R.w, SIG_R.h, (P) => paintSignature(P, K));
    L.seals = spriteLayer(K, 'seals', SEAL_R.x0, SEAL_R.y0, SEAL_R.w, SEAL_R.h, (P) => paintSeals(P, K));
    L.rainPale = rainTile(K, 'rainPale', 470, 100, { L0: 50, L1: 200, w0: 0.8, w1: 1.2, col: '#7a828c', a0: 0.55, a1: 0.8, v: 760, ox: 37, oy: 91 });
    L.rainDark = rainTile(K, 'rainDark', 620, 90, { L0: 70, L1: 260, w0: 0.9, w1: 1.45, col: '#26292f', a0: 0.72, a1: 0.95, v: 1080 });
    this.atlas = buildAtlas(K);
    // the pelican's per-frame print
    this.rc = createGraphics(920, 880);
    this.rc.pixelDensity(1);
    this.scr = mk(920, 880).getContext('2d');
    this.rpat = washiPattern(this.rc.drawingContext);
    this.rgrain = this.rc.drawingContext.createPattern(TEX.grain, 'repeat');
    this.stats = { sprites: this.atlas.n, atlas: [this.atlas.AW, this.atlas.AH] };
  },

  dispose() {
    try { this.rc?.remove(); } catch {}
    this.rc = null;
  },

  mods(u) {
    if (u <= 1.2 || u >= 4.8) return {};
    const m = {};
    const w = rainWind(u);
    if (w > 1e-3) m.wind = 0.4 * w;
    const open = 0.25 * smoothstep(2.5, 2.75, u) * (1 - smoothstep(3.45, 3.58, u)) + 0.12 * smoothstep(3.45, 3.58, u) * (1 - smoothstep(3.76, 3.9, u));
    if (open > 1e-3) m.billOpen = open;
    if (u >= 3.84 && u < 4.22) m.eye = 'closed';
    return m;
  },

  render(K, u, ctx) {
    const L = this.L, v = ctx.view;
    const sr = skyRain(u), wind = rainWind(u);
    // background print, and its rainy twin
    image(L.back, 0, 0, 1000, BACK_H);
    if (sr > 0.003) { tint(255, 255 * sr); image(L.backRain, 0, 0, 1000, BACK_H); noTint(); }
    // road, bridge, the near stream and its banks
    image(L.mid, 0, MID_Y0, 1000, 1000 - MID_Y0);
    const wr = wetRoad(u), pd = puddles(u);
    if (wr > 0.003) { tint(255, 255 * wr); image(L.wet.img, L.wet.x0, L.wet.y0, L.wet.w, L.wet.h); noTint(); }
    if (pd > 0.003) { tint(255, 255 * pd); image(L.puddles.img, L.puddles.x0, L.puddles.y0, L.puddles.w, L.puddles.h); noTint(); }
    if (sr > 0.003) { tint(255, 255 * sr); image(L.veil, 0, TOP, 1000, BOT - TOP); noTint(); }
    // travellers, the farmer on the plain, the angler on the bank
    const A = this.atlas;
    const drips = [];
    for (const c of CAST) {
      const st = c.st(u);
      const sp = A.map.get(`${c.id}|${st.pose}|${st.f}`);
      if (!sp) continue;
      const x = c.x(u);
      if (x + sp.ox > v.x1 || x + sp.ox + sp.w < v.x0) continue;
      image(A.img, x + sp.ox, c.fy + sp.oy, sp.w, sp.h, sp.ax, sp.ay, sp.aw, sp.ah);
      if (u >= 5 && u < 9) for (const h of wringHands(c, st, x)) drips.push([h, c.fy]);
    }
    // drips from wrung-out sleeves; grasses on the near bank bend in the squall
    K.brush.noFill(); K.brush.noWash(); K.brush.noHatch();
    drips.forEach(([h, fy], k) => {
      for (let j = 0; j < 2; j++) {
        const ph = mod((u - 5) * 2.1 + j * 0.5 + k * 0.23, 1);
        const y = lerp(h[1] + 3, fy - 2, ph * ph);
        K.seed(ID, 'drip', k, j);
        K.brush.set(`${ID}.key`, '#2a4a78', 1.4);
        K.brush.line(h[0] + j * 2.5 + 4, y, h[0] + j * 2.5 + 3.4, y + 6.5);
      }
    });
    if (v.y1 > 880) drawReeds(K, u, wind);
    K.flush();
    // the pelican
    if (ctx.rider.visible) this.drawRider(u, ctx);
    // the shower: two printed greys of straight rain lines, in front of everything
    const band = rainBand(u);
    if (band) {
      const X0 = Math.max(band[0], v.x0, -1), X1 = Math.min(band[1], v.x1, 1001);
      if (X1 > X0) {
        const t = u - 2;
        for (const R of [L.rainPale, L.rainDark]) drawTiled(R, mod(R.ox + RAIN_D[0] * R.v * t, R.P), mod(R.oy + RAIN_D[1] * R.v * t, R.P), X0, TOP + 1, X1, BOT - 1);
      }
    }
    // the cartouches are cut in the key block: the rain never crosses them
    image(L.title.img, L.title.x0, L.title.y0, L.title.w, L.title.h);
    image(L.sig.img, L.sig.x0, L.sig.y0, L.sig.w, L.sig.h);
    image(L.seals.img, L.seals.x0, L.seals.y0, L.seals.w, L.seals.h);
  },

  drawRider(u, ctx) {
    const R = ctx.rider;
    let P = R.placed;
    const gs = gagState(u);
    const g = { fill: gs.fill };
    if (gs.tilt) P = tiltHead(P, gs.tilt);
    P = { ...P, mods: R.mods };
    const B = P.bird;
    if (gs.fill > 0.001 || gs.tilt) {
      const th = R.state.crank;
      const S = 22 + 4 * Math.sin(th * 2 + 0.8) + 10 * (R.mods.billOpen ?? 0) + gs.fill * (60 + 3 * Math.sin(th * 2 + 2.4));
      g.Bf = pouchFrame(B); g.S = S;
      g.pouch = pouchShape(g.Bf, S, gs.fill);
    }
    if (gs.bulge >= 0) {
      const sp = B.neckSpine, n = sp.length;
      const i = Math.round((1 - gs.bulge) * (n - 1)), p = sp[i];
      const r = lerp(30, 19, i / (n - 1)) / 2 + 5.5;
      g.lump = ellipsePts(p[0], p[1], r, r * 0.92, 0, 18);
    }
    const s = clamp(ctx.pxu * 1.3, 0.5, 2.2);
    const bx0 = P.place.x - 192, by0 = 418, bw = 412, bh = 392;
    const G = this.rc, c = G.drawingContext;
    const pw = Math.ceil(bw * s), ph = Math.ceil(bh * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(s, 0, 0, s, -bx0 * s, -by0 * s);
    paintRider(c, this.scr, P, g, { pat: this.rpat, pw, ph, t: u });
    // the print texture over the pelican's own colour blocks
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = this.rgrain; c.fillRect(0, 0, pw, ph);
    c.restore();
    image(G, bx0, by0, pw / s, ph / s, 0, 0, pw, ph);
  },
};
