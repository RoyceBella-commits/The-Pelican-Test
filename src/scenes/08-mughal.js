// 08 · 莫卧儿细密画 · c. 1600 — a palace garden in the manner of the Akbar–Jahangir ateliers (original composition).
//
// Opaque watercolour and gold on burnished paper, seen from many viewpoints at once:
//   • the charbagh (channels, tank, flower beds) and the carpet are laid out in PLAN, tilted up the page;
//   • the pavilion, cypresses, courtiers and musicians stand on that plan in ELEVATION / profile;
//   • the gardener is seen from directly ABOVE; a guard over the roof parapet; ladies at the zenana windows.
//
// Technique
//   • one 2048² Canvas2D bake: hashiya margin (gold flowering sprays, zar-afshan flecks) and coloured rules (jadval),
//     lapis sky with gold-edged clouds, garden plan, cypresses and blossom trees, red-sandstone pavilion with a marble
//     jharokha, the paved walk (rider line y = 800, running out through the margin), flower meadow and carpet, and an
//     inset text panel with the gold-on-lapis title cartouche.
//   • every figure is a Canvas2D sprite painted once per POSE STATE into one atlas; states switch on beats.
//   • live: the pelican (Canvas2D, Mansur-style feathering) into a reusable buffer; rotating fan sprites; fountain
//     sparkles on the beats; peacock shimmer; the nisar (gold coins + rose petals on analytic trajectories); a turban
//     tassel. Zero live p5.brush marks.
import { profile } from '../beat/ride.js';
import { panelLeft } from '../beat/timeline.js';
import { rng, hash, lerp, clamp, smoothstep, fbm, noise2, window01, smoothPath, smoothLoop, ribbon } from '../kit/math.js';

const ID = 'mughal';
const RIDE = { hold: [2.4, 3.8], speed: 0.4, ramp: 0.3 };
const PROF = profile(RIDE);
const BK = 2048, PXU = BK / 1000;
const SP = 2.6;                       // sprite px per unit
const TAU = Math.PI * 2;

// palette (brief) + derived
const C = {
  lapis: '#23408e', lapisD: '#162a66', lapisL: '#5677c2',
  mal: '#2f7d5b', malD: '#1d4f3a', malL: '#63a37e',
  verm: '#c63b25', vermD: '#7d1f12',
  saffron: '#e7a33b', rose: '#e59aa6', pink: '#f3c5cc',
  marble: '#f4efe4', marbleS: '#d9cfbd',
  sand: '#b5553c', sandD: '#8a3a26', sandL: '#cc7055',
  gold: '#c9a24a', goldL: '#f1d98c', goldD: '#86651f',
  skin: '#d6a276', skinL: '#e3b98f', skinD: '#b98257',
  paper: '#ebdcb8', walk: '#e7d8b0',
  bed: '#3a6a45', water: '#8eaac7', waterD: '#57759a',
  white: '#f7f2e6',
};
const OUT = '#33251c';

// ------------------------------------------------------------------ small utils
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (h, a = 1) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
const mixHex = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const c2d = (c) => c.getContext('2d');
const R = (...k) => rng(hash(ID, ...k));

function pth(x, pts, close = true) {
  x.beginPath();
  for (let i = 0; i < pts.length; i++) (i ? x.lineTo(pts[i][0], pts[i][1]) : x.moveTo(pts[i][0], pts[i][1]));
  if (close) x.closePath();
}
function fil(x, pts, col, a = 1) { pth(x, pts); x.fillStyle = a < 1 ? rgba(col, a) : col; x.fill(); }
function lin(x, pts, col, w, a = 1, close = false) {
  pth(x, pts, close);
  x.strokeStyle = a < 1 ? rgba(col, a) : col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
  x.stroke();
}
function fo(x, pts, col, w = 0.4, oc = OUT, a = 1) { fil(x, pts, col, a); lin(x, pts, oc, w, 1, true); }
function dot(x, cx, cy, r, col, a = 1) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = a < 1 ? rgba(col, a) : col; x.fill(); }
function ring(x, cx, cy, r, col, w, a = 1) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.strokeStyle = a < 1 ? rgba(col, a) : col; x.lineWidth = w; x.stroke(); }
function ell(x, cx, cy, rx, ry, rot, col, a = 1) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); x.fillStyle = a < 1 ? rgba(col, a) : col; x.fill(); }
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function tube(x, pts, w, col, ow = 0.3, oc = OUT) { lin(x, pts, oc, w + 2 * ow); lin(x, pts, col, w); }
function clipP(x, pts) { pth(x, pts); x.clip(); }
function blob(cx, cy, rx, ry, seed, n = 16, amt = 0.4) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const m = 1 - amt / 2 + amt * fbm(Math.cos(a) * 1.3 + 3, Math.sin(a) * 1.3 + 3, seed, 2);
    out.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
  }
  return smoothLoop(out, 3);
}
/** fine stipple to imitate opaque watercolour body */
function stipple(x, x0, y0, x1, y1, n, cols, seed, size = 0.5) {
  const r = R('stip', seed);
  for (let k = 0; k < n; k++) {
    const px = lerp(x0, x1, r()), py = lerp(y0, y1, r());
    x.fillStyle = cols[Math.floor(r() * cols.length)];
    x.fillRect(px, py, size * (0.5 + r()), size * (0.5 + r()));
  }
}

// ------------------------------------------------------------------ layout (panel units)
const FR = { m: 40, p0: 50, p1: 950 };            // margin edge, painting rect
const PATH = { y0: 772, y1: 832 };                  // the main garden walk (rider line y = 800)
const WALL = { x0: 50, x1: 668, top: 292, bot: 338 };
const CH = { hy: 546, vx: 345, w: 7 };              // water channels: centre lines, half-width
const TANK = { x: 345, y: 546, r: 40 };
const QUADS = [[56, 344, 338, 539], [352, 344, 650, 539], [56, 553, 338, 766], [352, 553, 598, 766]];
const PAV = { x0: 668, x1: 946 };
const TER = { x0: 636, x1: 952, top: 556, edge: 604, bot: 664 };
const JH = { cx: 807, x0: 770, x1: 844, top: 256, spring: 280, sill: 336 };
const WINS = [{ cx: 712, x0: 696, x1: 728, top: 266, spring: 282, sill: 324 }, { cx: 902, x0: 886, x1: 918, top: 266, spring: 282, sill: 324 }];
const CHH = [706, 912];
const INSET = { x0: 316, x1: 684, y0: 50, y1: 150 };
const CART = { x0: 338, x1: 662, y0: 57, y1: 143 };
const CYP = [
  { x: 92, y: 352, h: 160, w: 17, lean: 4, seed: 1, vine: true },
  { x: 318, y: 352, h: 150, w: 16, lean: -3, seed: 2 },
  { x: 410, y: 352, h: 156, w: 16.5, lean: 3, seed: 3, vine: true },
  { x: 604, y: 352, h: 152, w: 16.5, lean: -4, seed: 4 },
];
const BLOSSOM = [{ x: 262, y: 352, h: 118, seed: 1 }, { x: 507, y: 352, h: 128, seed: 2 }];
const HALO = { x: 803.5, y: 284.5, r: 17 };

// ------------------------------------------------------------------ the margin (hashiya) and rules (jadval)
function goldSpray(x, cx, cy, s, mirror, seed, tone) {
  const r = R('spray', seed);
  const G = tone ? '#d2b060' : C.gold, GD = C.goldD, GL = C.goldL;
  x.save(); x.translate(cx, cy); x.scale(mirror ? -s : s, s);
  const stem = smoothPath([[0, 15], [-2.5, 7], [1.6, -1], [-0.6, -8], [1, -12.5]], 5);
  lin(x, stem, GD, 1.05); lin(x, stem, G, 0.55);
  const leaf = (p, ang, L, W) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([t * L, -(Math.sin(Math.PI * t) ** 0.8) * W]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10; pts.push([t * L, Math.sin(Math.PI * t) ** 0.8 * W * 0.75]); }
    x.save(); x.translate(p[0], p[1]); x.rotate(ang);
    fil(x, pts, G); lin(x, pts, GD, 0.32, 1, true);
    lin(x, [[0.6, 0], [L * 0.86, -0.2]], GD, 0.22);
    lin(x, [[L * 0.2, -W * 0.45], [L * 0.7, -W * 0.5]], GL, 0.3, 0.9);
    x.restore();
  };
  leaf(stem[4], -2.4 + (r() - 0.5) * 0.3, 8.5, 2.3);
  leaf(stem[8], -0.65 + (r() - 0.5) * 0.3, 8.5, 2.2);
  leaf(stem[13], -2.6, 7, 1.9);
  leaf(stem[16], -0.45, 6, 1.6);
  const bloom = (px, py, Rr, n = 6) => {
    for (let k = 0; k < n; k++) {
      const a = (k * TAU) / n + 0.3;
      x.beginPath(); x.ellipse(px + Math.cos(a) * Rr * 0.55, py + Math.sin(a) * Rr * 0.55, Rr * 0.56, Rr * 0.33, a, 0, TAU);
      x.fillStyle = G; x.fill(); x.strokeStyle = GD; x.lineWidth = 0.28; x.stroke();
    }
    dot(x, px, py, Rr * 0.3, GL); ring(x, px, py, Rr * 0.3, GD, 0.25);
  };
  bloom(1, -15, 5.4);
  const side = stem[10];
  lin(x, [side, [side[0] + 5, side[1] - 3], [side[0] + 7, side[1] - 6]], G, 0.45);
  bloom(side[0] + 7.5, side[1] - 7, 2.6, 5);
  const bud = stem[6];
  lin(x, [bud, [bud[0] - 4, bud[1] - 2.5]], G, 0.45);
  ell(x, bud[0] - 5.4, bud[1] - 3.4, 1.4, 2.2, -0.8, G); lin(x, [[bud[0] - 4.5, bud[1] - 2.2], [bud[0] - 6.1, bud[1] - 5]], GD, 0.25);
  x.restore();
}

function paintMargin(x) {
  x.fillStyle = C.paper; x.fillRect(0, 0, 1000, 1000);
  const r = R('margin');
  // soft unevenness of the burnished sheet
  for (let k = 0; k < 60; k++) {
    const px = r() * 1000, py = r() * 1000, rad = 20 + r() * 90;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, r() < 0.5 ? 'rgba(120,85,30,0.05)' : 'rgba(255,250,235,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  stipple(x, 0, 0, 1000, 1000, 9000, ['rgba(130,95,40,0.10)', 'rgba(255,248,230,0.18)'], 'm', 0.6);
  // zar-afshan: gold flecks
  for (let k = 0; k < 1500; k++) {
    const side = Math.floor(r() * 4), s = r() * 1000, d = 2 + r() * 36;
    const [px, py] = side === 0 ? [s, d] : side === 1 ? [s, 1000 - d] : side === 2 ? [d, s] : [1000 - d, s];
    const n = 3 + Math.floor(r() * 3), rad = 0.35 + r() * r() * 1.8, a0 = r() * TAU;
    const pts = [];
    for (let j = 0; j < n; j++) { const a = a0 + (j / n) * TAU; const rr = rad * (0.5 + r()); pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]); }
    fil(x, pts, r() < 0.35 ? C.goldL : r() < 0.6 ? C.gold : '#b38d3a', 0.65 + r() * 0.35);
  }
  // gold flowering sprays all round
  let k = 0;
  for (let px = 62; px < 960; px += 58) {
    goldSpray(x, px, 22, 0.98, k % 2, 'top' + k, k % 2); goldSpray(x, px + 29, 979, 0.98, (k + 1) % 2, 'bot' + k, (k + 1) % 2); k++;
  }
  k = 0;
  for (let py = 86; py < 960; py += 60) {
    if (py > 735 && py < 870) { k++; continue; }      // the walk runs out through the side margins
    goldSpray(x, 20, py, 0.98, k % 2, 'l' + k, k % 2); goldSpray(x, 980, py + 24, 0.98, (k + 1) % 2, 'r' + k, k % 2); k++;
  }
  // corner rosettes
  for (const [px, py] of [[20, 20], [980, 20], [20, 980], [980, 980]]) {
    for (let j = 0; j < 8; j++) { const a = (j * TAU) / 8; ell(x, px + Math.cos(a) * 5, py + Math.sin(a) * 5, 4.6, 2.2, a, C.gold); }
    dot(x, px, py, 3, C.lapis); ring(x, px, py, 3, C.goldD, 0.4); dot(x, px, py, 1.1, C.goldL);
  }
}

function goldBand(x, outer, inner) {
  // a ring between two insets, gold with burnish
  x.save();
  x.beginPath(); x.rect(outer, outer, 1000 - 2 * outer, 1000 - 2 * outer); x.rect(inner, inner, 1000 - 2 * inner, 1000 - 2 * inner);
  const g = x.createLinearGradient(0, 0, 1000, 1000);
  g.addColorStop(0, '#d9b45c'); g.addColorStop(0.3, '#b98f3a'); g.addColorStop(0.55, '#e0c069'); g.addColorStop(0.8, '#b48a36'); g.addColorStop(1, '#d6b15a');
  x.fillStyle = g; x.fill('evenodd');
  x.restore();
}
function paintRules(x) {
  const band = (a, b, col) => {
    if (col === 'gold') return goldBand(x, a, b);
    x.beginPath(); x.rect(a, a, 1000 - 2 * a, 1000 - 2 * a); x.rect(b, b, 1000 - 2 * b, 1000 - 2 * b);
    x.fillStyle = col; x.fill('evenodd');
  };
  band(39.6, 40.2, OUT); band(40.2, 43.4, 'gold'); band(43.4, 43.9, OUT); band(43.9, 45.6, C.lapis); band(45.6, 46.4, '#fbf6ea');
  band(46.4, 47.5, C.verm); band(47.5, 48.2, '#fbf6ea'); band(48.2, 49.4, 'gold'); band(49.4, 50, OUT);
  // gold highlight hairline
  x.strokeStyle = 'rgba(255,240,190,0.7)'; x.lineWidth = 0.35; x.strokeRect(41.2, 41.2, 1000 - 82.4, 1000 - 82.4);
}

// ------------------------------------------------------------------ sky
function cloud(x, cx, cy, w, seed, flip = 1) {
  // a Chinese-style cloud band (tchi), as the Mughal ateliers borrowed it: white, gold-edged, with curling ends
  const r = R('cloud', seed);
  const n = Math.max(6, Math.round(w / 3.6));
  const lobes = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = (2.4 + 6.4 * Math.pow(Math.sin(Math.PI * t), 0.75)) * (0.8 + 0.28 * Math.sin(9 * t + seed) + 0.1 * r());
    lobes.push([cx - w / 2 + t * w, cy + 2.6 * Math.sin(TAU * 1.2 * t + seed) - rr * 0.35, rr]);
  }
  const curl = (ex, ey, dir) => {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, a = dir * (Math.PI * 0.2 + t * Math.PI * 2.6), rr = 5.2 * (1 - t * 0.75); pts.push([ex + dir * 4 + Math.cos(a) * rr * dir, ey - 3 + Math.sin(a) * rr]); }
    return pts;
  };
  const cL = curl(lobes[0][0] - 2, lobes[0][1] + 1, -1 * flip), cR = curl(lobes[n][0] + 2, lobes[n][1] + 1, 1 * flip);
  for (const [px, py, rr] of lobes) ring(x, px, py, rr + 0.35, C.goldD, 1.6);
  lin(x, cL, C.goldD, 3.2); lin(x, cR, C.goldD, 3.2);
  for (const [px, py, rr] of lobes) dot(x, px, py, rr, '#f8f4ea');
  lin(x, cL, '#f8f4ea', 1.8); lin(x, cR, '#f8f4ea', 1.8);
  // gold hairlines inside, following the band
  for (const off of [-0.2, 0.25]) lin(x, lobes.slice(1, -1).map(([px, py, rr]) => [px, py + rr * off]), C.gold, 0.4, 0.75);
  for (let i = 2; i < n - 1; i += 3) { const [px, py, rr] = lobes[i]; x.beginPath(); x.arc(px, py - rr * 0.1, rr * 0.55, Math.PI * 1.05, Math.PI * 1.95); x.strokeStyle = rgba(C.gold, 0.7); x.lineWidth = 0.35; x.stroke(); }
}
function paintSky(x) {
  const g = x.createLinearGradient(0, 50, 0, 320);
  g.addColorStop(0, '#20408f'); g.addColorStop(0.32, '#3a62ae'); g.addColorStop(0.62, '#8eaacf'); g.addColorStop(0.84, '#d9dccf'); g.addColorStop(1, '#efe2bf');
  x.fillStyle = g; x.fillRect(50, 50, 900, 290);
  stipple(x, 50, 50, 950, 300, 7000, ['rgba(20,40,110,0.10)', 'rgba(255,255,255,0.08)'], 'sky', 0.7);
  // the sky is laid in with long horizontal strokes of the brush
  const rs = R('skystroke');
  for (let k = 0; k < 420; k++) {
    const y = 52 + rs() * 250, x0 = 40 + rs() * 900, L = 30 + rs() * 140;
    lin(x, [[x0, y], [x0 + L * 0.5, y + (rs() - 0.5) * 1.2], [x0 + L, y + (rs() - 0.5) * 1.5]], rs() < 0.5 ? '#ffffff' : '#10286b', 0.6 + rs() * 1.4, 0.035 + rs() * 0.05);
  }
  // gold streaks of the low sun along the horizon
  const r = R('streak');
  for (let k = 0; k < 16; k++) {
    const y = 236 + r() * 52, x0 = 50 + r() * 700, L = 40 + r() * 180;
    lin(x, [[x0, y], [x0 + L * 0.5, y - 0.8], [x0 + L, y + 0.4]], r() < 0.5 ? C.goldL : '#e9c98a', 0.5 + r() * 0.6, 0.35 + r() * 0.3);
  }
  cloud(x, 160, 108, 150, 1); cloud(x, 248, 190, 80, 2, -1); cloud(x, 118, 232, 56, 3);
  cloud(x, 806, 88, 150, 4, -1); cloud(x, 928, 170, 40, 5);
  // a skein of cranes
  const birds = [[205, 140], [218, 147], [231, 152], [196, 152], [186, 162], [244, 158], [175, 171]];
  birds.forEach(([bx, by], i) => {
    const s = 1 + (i % 3) * 0.12;
    lin(x, [[bx - 5 * s, by - 1.6 * s], [bx - 2 * s, by - 2.4 * s], [bx, by]], '#2a2433', 0.75);
    lin(x, [[bx, by], [bx + 2.4 * s, by - 2.6 * s], [bx + 5.4 * s, by - 2 * s]], '#2a2433', 0.75);
    lin(x, [[bx, by], [bx + 1.6, by + 0.4]], '#2a2433', 0.6);
  });
}

// ------------------------------------------------------------------ trees
function canopy(x, cx, cy, rx, ry, seed, o = {}) {
  const r = R('can', seed);
  const poly = blob(cx, cy, rx, ry, hash(ID, 'cb', seed), 14, 0.45);
  fil(x, poly, o.base || '#21422c');
  x.save(); clipP(x, poly);
  const n = o.n ?? Math.round(rx * ry * 0.55);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r());
    const px = cx + Math.cos(a) * rx * d * 1.08, py = cy + Math.sin(a) * ry * d * 1.08;
    const light = clamp(0.55 - ((py - cy) / ry) * 0.45 - ((px - cx) / rx) * 0.2 + (r() - 0.5) * 0.55);
    const col = light > 0.7 ? '#8cad62' : light > 0.45 ? '#5a8a50' : light > 0.25 ? '#3f6d43' : '#2c5536';
    ell(x, px, py, 2.0, 0.85, r() * TAU, col);
  }
  if (o.blossom) {
    for (let k = 0; k < o.blossom; k++) {
      const a = r() * TAU, d = Math.sqrt(r());
      const px = cx + Math.cos(a) * rx * d, py = cy + Math.sin(a) * ry * d;
      for (let j = 0; j < 5; j++) { const b = (j * TAU) / 5; dot(x, px + Math.cos(b) * 0.9, py + Math.sin(b) * 0.9, 0.7, '#f7d6dc'); }
      dot(x, px, py, 0.45, '#cf5d77');
    }
  }
  x.restore();
  lin(x, poly, '#13281a', 0.45, 0.9, true);
}

function cypressPoly(c) {
  const n = 46, Lp = [], Rp = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = c.y - 3 - t * c.h;
    const hw = c.w * (t < 0.26 ? Math.sin((Math.PI / 2) * (0.35 + 0.65 * t / 0.26)) : Math.pow(1 - (t - 0.26) / 0.74, 1.12));
    const bend = c.lean * t * t;
    const j1 = (noise2(i * 0.8, 1, c.seed * 7) - 0.5) * 2.4 * Math.min(1, hw / 3);
    const j2 = (noise2(i * 0.8, 5, c.seed * 7) - 0.5) * 2.4 * Math.min(1, hw / 3);
    Lp.push([c.x + bend - hw + j1, y]); Rp.push([c.x + bend + hw + j2, y]);
  }
  return Lp.concat(Rp.reverse());
}
const cypHW = (c, y) => {
  const t = clamp((c.y - 3 - y) / c.h);
  const hw = c.w * (t < 0.26 ? Math.sin((Math.PI / 2) * (0.35 + 0.65 * t / 0.26)) : Math.pow(1 - (t - 0.26) / 0.74, 1.12));
  return { hw, cx: c.x + c.lean * t * t };
};
function cypress(x, c) {
  const poly = cypressPoly(c);
  // trunk stub
  fo(x, [[c.x - 1.6, c.y - 6], [c.x + 1.6, c.y - 6], [c.x + 2, c.y], [c.x - 2, c.y]], '#5a3d26', 0.35);
  fil(x, poly, '#1b3a27');
  x.save(); clipP(x, poly);
  const r = R('cyp', c.seed);
  for (let y = c.y - 4; y > c.y - c.h - 6; y -= 2.4) {
    const { hw, cx } = cypHW(c, y);
    if (hw < 0.6) continue;
    const row = Math.round((c.y - y) / 2.4);
    const col = row % 3 === 0 ? '#5f9157' : row % 3 === 1 ? '#3c6c46' : '#4a7c4c';
    const k = 0.9 - (row % 2) * 0.15;
    lin(x, [[cx - hw * k, y + 1.8], [cx - hw * 0.15, y - 0.2], [cx, y - 0.6], [cx + hw * 0.15, y - 0.2], [cx + hw * k, y + 1.8]], col, 0.55, 0.9);
    if (r() < 0.6) lin(x, [[cx - hw * 0.55, y + 0.3], [cx - hw * 0.25, y - 0.9]], '#86ae6a', 0.35, 0.7);
  }
  // light along the left flank
  const g = x.createLinearGradient(c.x - c.w, 0, c.x + c.w, 0);
  g.addColorStop(0, 'rgba(160,200,120,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,15,5,0.22)');
  x.fillStyle = g; x.fillRect(c.x - c.w - 6, c.y - c.h - 8, c.w * 2 + 12, c.h + 8);
  x.restore();
  lin(x, poly, '#0f2216', 0.5, 1, true);
  if (c.vine) {
    // a flowering creeper twined round the cypress
    const pts = [];
    for (let y = c.y - 8; y > c.y - c.h * 0.72; y -= 1.5) {
      const { hw, cx } = cypHW(c, y);
      pts.push([cx + hw * 0.92 * Math.sin((c.y - y) * 0.11 + c.seed), y]);
    }
    const segs = [];
    let cur = [];
    pts.forEach((p, i) => { const front = Math.cos((c.y - p[1]) * 0.11 + c.seed) > -0.2; if (front) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    for (const sg of segs) if (sg.length > 1) lin(x, sg, '#9cbf6a', 0.55);
    const rr = R('vine', c.seed);
    for (const sg of segs) for (let i = 2; i < sg.length; i += 5) {
      const p = sg[i];
      ell(x, p[0] + 1.4, p[1] - 0.6, 1.5, 0.7, -0.5, '#7fae5e');
      if (rr() < 0.55) { for (let j = 0; j < 5; j++) { const b = (j * TAU) / 5; dot(x, p[0] - 0.8 + Math.cos(b) * 0.85, p[1] + 0.6 + Math.sin(b) * 0.85, 0.62, rr() < 0.5 ? '#fbf4ec' : '#f4b9c4'); } dot(x, p[0] - 0.8, p[1] + 0.6, 0.38, C.saffron); }
    }
  }
}

function blossomTree(x, b) {
  const r = R('bl', b.seed);
  const fork = [b.x + 3, b.y - b.h * 0.42];
  const trunk = smoothPath([[b.x, b.y], [b.x - 2.5, b.y - b.h * 0.15], [b.x + 2.4, b.y - b.h * 0.3], fork], 6);
  const tw = (t) => lerp(3.2, 1.8, t);
  fo(x, ribbon(trunk, tw), '#5c3e28', 0.45);
  lin(x, trunk.map((p, i) => [p[0] - 0.8, p[1]]), '#80593a', 0.5, 0.8);
  const ends = [];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.42 + (r() - 0.5) * 0.2;
    const L = b.h * (0.32 + r() * 0.18) * (1 - Math.abs(k - 3) * 0.06);
    const e = [fork[0] + Math.cos(a) * L * 1.1, fork[1] + Math.sin(a) * L * 0.85];
    const m = [lerp(fork[0], e[0], 0.5) + (r() - 0.5) * 6, lerp(fork[1], e[1], 0.5) - 3];
    const br = smoothPath([fork, m, e], 5);
    fo(x, ribbon(br, (t) => lerp(1.6, 0.4, t)), '#5c3e28', 0.3);
    ends.push({ e, m, br });
    // twigs
    for (let j = 0; j < 2; j++) {
      const s = br[4 + j * 3];
      const a2 = a + (j ? 0.7 : -0.7);
      lin(x, [s, [s[0] + Math.cos(a2) * 8, s[1] + Math.sin(a2) * 7]], '#5c3e28', 0.45);
      ends.push({ e: [s[0] + Math.cos(a2) * 8, s[1] + Math.sin(a2) * 7], small: true });
    }
  }
  // leaves then blossom clusters
  for (const en of ends) {
    const n = en.small ? 10 : 18;
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = Math.sqrt(r()) * (en.small ? 7 : 12);
      ell(x, en.e[0] + Math.cos(a) * d, en.e[1] + Math.sin(a) * d * 0.8, 1.7, 0.7, r() * TAU, r() < 0.5 ? '#6d9a52' : '#4f7d45');
    }
  }
  for (const en of ends) {
    const n = en.small ? 12 : 26;
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = Math.sqrt(r()) * (en.small ? 7.5 : 13);
      const px = en.e[0] + Math.cos(a) * d, py = en.e[1] + Math.sin(a) * d * 0.8;
      const pc = r() < 0.6 ? '#fbe4e6' : '#f2b2bf';
      for (let j = 0; j < 5; j++) { const q = (j * TAU) / 5 + a; dot(x, px + Math.cos(q) * 1.0, py + Math.sin(q) * 1.0, 0.78, pc); }
      dot(x, px, py, 0.42, '#c9506b');
    }
  }
}

// ------------------------------------------------------------------ back of the garden: trees beyond the wall, the wall
function paintBackTrees(x) {
  const r = R('back');
  // cypress spires beyond the wall
  for (const [px, h, w] of [[70, 118, 11], [176, 104, 10], [292, 98, 9], [386, 120, 11], [470, 96, 9], [560, 112, 10], [650, 108, 10]]) {
    cypress(x, { x: px, y: 300, h, w, lean: (r() - 0.5) * 6, seed: 50 + px });
  }
  const spots = [[100, 252, 30, 26], [140, 266, 26, 22], [212, 258, 34, 28], [258, 270, 26, 20], [330, 262, 30, 24], [430, 256, 32, 26], [516, 266, 28, 22],
    [600, 258, 30, 26], [640, 272, 24, 18], [60, 274, 22, 18], [372, 276, 24, 16], [480, 278, 24, 16]];
  spots.forEach(([cx, cy, rx, ry], k) => canopy(x, cx, cy, rx, ry, 'b' + k, { blossom: k % 3 === 1 ? 70 : 0 }));
}
function kangura(x, cx, base, s = 1, col = C.sand, oc = OUT) {
  const pts = [[-4.2, 0], [-4.2, -3.6], [-2.6, -6.4], [-1, -8.2], [0, -10.4], [1, -8.2], [2.6, -6.4], [4.2, -3.6], [4.2, 0]].map(([a, b]) => [cx + a * s, base + b * s]);
  fo(x, pts, col, 0.35, oc);
  lin(x, [[cx, base - 1.5 * s], [cx, base - 7.5 * s]], '#f3e9d6', 0.45, 0.85);
}
function paintWall(x) {
  const { x0, x1, top, bot } = WALL;
  for (let px = x0 + 4; px < x1; px += 11) kangura(x, px, top - 0.5, 0.95);
  fo(x, rect(x0, top - 1, x1, top + 5), C.marble, 0.4);
  lin(x, [[x0, top + 2], [x1, top + 2]], C.sand, 0.35);
  fil(x, rect(x0, top + 5, x1, bot), C.sand);
  const g = x.createLinearGradient(0, top + 5, 0, bot);
  g.addColorStop(0, 'rgba(255,220,190,0.12)'); g.addColorStop(1, 'rgba(70,20,10,0.25)');
  x.fillStyle = g; x.fillRect(x0, top + 5, x1 - x0, bot - top - 5);
  stipple(x, x0, top + 5, x1, bot, 1600, ['rgba(90,30,15,0.25)', 'rgba(230,150,120,0.25)'], 'wall', 0.6);
  // blind arched niches with marble inlay
  for (let px = x0 + 14; px < x1 - 24; px += 46) {
    const a = archPoly(px, px + 28, top + 10, top + 18, bot - 7, 3, 1.2);
    fil(x, a, C.sandD, 0.55);
    lin(x, a, '#f3e9d6', 0.8, 0.95, true);
    lin(x, rect(px - 3, top + 7.5, px + 31, bot - 4.5), '#f3e9d6', 0.45, 0.85, true);
  }
  lin(x, [[x0, bot - 1.5], [x1, bot - 1.5]], '#f3e9d6', 0.9);
  lin(x, [[x0, bot], [x1, bot]], OUT, 0.5);
}

// ------------------------------------------------------------------ arches
function archPoly(x0, x1, yTop, ySpring, yBot, cusps = 5, depth = 2) {
  const pts = [[x0, yBot], [x0, ySpring]];
  const N = 48;
  for (let i = 1; i < N; i++) {
    const t = i / N, s = Math.abs(2 * t - 1);
    const f = 0.6 * Math.sqrt(Math.max(0, 1 - s * s)) + 0.4 * (1 - s);
    let y = ySpring - (ySpring - yTop) * f;
    if (cusps) y += depth * (1 - Math.pow(Math.abs(Math.sin(cusps * Math.PI * t)), 0.55));
    pts.push([lerp(x0, x1, t), y]);
  }
  pts.push([x1, ySpring], [x1, yBot]);
  return pts;
}

// ------------------------------------------------------------------ the garden plan
function flowerTop(x, type, cx, cy, s = 1) {
  if (type === 'poppy') { dot(x, cx, cy, 1.7 * s, '#cf3b27'); dot(x, cx + 0.35 * s, cy - 0.35 * s, 0.75 * s, '#e96a4e'); dot(x, cx, cy, 0.5 * s, '#24150f'); }
  else if (type === 'narc') { for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; dot(x, cx + Math.cos(a) * 1.05 * s, cy + Math.sin(a) * 1.05 * s, 0.72 * s, '#fbf7ec'); } dot(x, cx, cy, 0.58 * s, '#e3a12f'); }
  else if (type === 'rose') { dot(x, cx, cy, 1.85 * s, '#e58ca0'); ring(x, cx, cy, 1.0 * s, '#bf5670', 0.4); dot(x, cx - 0.3 * s, cy - 0.3 * s, 0.45 * s, '#f8cfd8'); }
  else if (type === 'iris') { for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3 - Math.PI / 2; ell(x, cx + Math.cos(a) * 1.0 * s, cy + Math.sin(a) * 1.0 * s, 1.15 * s, 0.6 * s, a, '#5b4fa6'); } dot(x, cx, cy, 0.42 * s, '#f0c43c'); }
  else if (type === 'tulip') { dot(x, cx, cy, 1.6 * s, '#e88f2c'); ell(x, cx, cy - 0.3 * s, 0.8 * s, 1.2 * s, 0, '#d2452b'); }
  else if (type === 'mari') { for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; dot(x, cx + Math.cos(a) * 1.15 * s, cy + Math.sin(a) * 1.15 * s, 0.6 * s, '#e88d1f'); } dot(x, cx, cy, 0.9 * s, '#f4b638'); }
}
const BED_TYPES = ['poppy', 'narc', 'rose', 'iris', 'tulip', 'mari', 'rose', 'narc', 'poppy', 'iris', 'mari', 'tulip', 'narc', 'poppy', 'rose', 'iris'];
const BLOOM = { poppy: ['#d33a25', '#8e1d12'], narc: ['#fbf7ec', '#e3a12f'], rose: ['#e7889c', '#b24a64'], iris: ['#6052ad', '#f0c43c'], tulip: ['#ea8a2a', '#c4401f'], mari: ['#f2a527', '#c9661a'] };
/** a small flowering plant seen from the side, standing on a plan-view bed */
function miniPlant(x, type, px, py, s, r) {
  const h = (5.2 + r() * 2.2) * s;
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 2 + (k - 1.5) * 0.48 + (r() - 0.5) * 0.2, L = (3.2 + r() * 1.4) * s;
    ell(x, px + Math.cos(a) * L * 0.5, py + Math.sin(a) * L * 0.5, L * 0.5, 0.62 * s, a, k % 2 ? '#6aa25c' : '#3f7646');
  }
  const top = [px + (r() - 0.5) * 1.2 * s, py - h];
  lin(x, [[px, py], top], '#3f7646', 0.4 * s);
  const [c1, c2] = BLOOM[type];
  const [tx, ty] = top;
  if (type === 'iris') { ell(x, tx, ty - 1.1 * s, 0.9 * s, 1.6 * s, 0, c1); ell(x, tx - 1.2 * s, ty + 0.2 * s, 1.3 * s, 0.6 * s, 0.5, c1); ell(x, tx + 1.2 * s, ty + 0.2 * s, 1.3 * s, 0.6 * s, -0.5, c1); dot(x, tx, ty, 0.35 * s, c2); }
  else if (type === 'tulip') { fil(x, [[tx - 1.4 * s, ty + 0.6 * s], [tx - 1.5 * s, ty - 1.4 * s], [tx - 0.6 * s, ty - 2.6 * s], [tx, ty - 1.6 * s], [tx + 0.6 * s, ty - 2.6 * s], [tx + 1.5 * s, ty - 1.4 * s], [tx + 1.4 * s, ty + 0.6 * s]], c1); lin(x, [[tx, ty + 0.4 * s], [tx, ty - 1.6 * s]], c2, 0.3 * s); }
  else if (type === 'poppy') { fil(x, [[tx - 2 * s, ty], [tx - 1.6 * s, ty - 1.8 * s], [tx, ty - 2.3 * s], [tx + 1.6 * s, ty - 1.8 * s], [tx + 2 * s, ty], [tx, ty + 0.7 * s]], c1); dot(x, tx, ty - 0.5 * s, 0.45 * s, '#1d120d'); }
  else if (type === 'narc') { for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; ell(x, tx + Math.cos(a) * 0.95 * s, ty + Math.sin(a) * 0.95 * s, 0.85 * s, 0.45 * s, a, c1); } dot(x, tx, ty, 0.55 * s, c2); }
  else if (type === 'rose') { dot(x, tx, ty, 1.5 * s, c1); x.beginPath(); x.arc(tx, ty, 0.8 * s, 0.4, 5); x.strokeStyle = c2; x.lineWidth = 0.3 * s; x.stroke(); }
  else { for (let k = 0; k < 9; k++) { const a = (k * TAU) / 9; dot(x, tx + Math.cos(a) * 1.0 * s, ty + Math.sin(a) * 1.0 * s, 0.55 * s, c1); } dot(x, tx, ty, 0.7 * s, c2); }
}
function bed(x, x0, y0, x1, y1, type, seed) {
  fil(x, rect(x0, y0, x1, y1), C.bed);
  const r = R('bed', seed);
  x.save(); clipP(x, rect(x0, y0, x1, y1));
  // mottled earth-and-leaf ground
  for (let k = 0; k < 14; k++) {
    const px = lerp(x0, x1, r()), py = lerp(y0, y1, r()), rad = 10 + r() * 26;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, r() < 0.5 ? 'rgba(15,40,25,0.35)' : 'rgba(120,160,90,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  for (let k = 0; k < (x1 - x0) * (y1 - y0) * 0.035; k++) {
    const px = lerp(x0, x1, r()), py = lerp(y0, y1, r()), a = -1.4 + (r() - 0.5) * 0.9;
    lin(x, [[px, py], [px + Math.cos(a) * 2.4, py + Math.sin(a) * 2.4]], r() < 0.5 ? '#244a31' : '#4e8250', 0.4, 0.8);
  }
  // two little flowering shrubs, then rows of flowers (back rows first so the near ones overlap)
  const shrubs = [];
  const step = 9.2;
  let row = 0;
  for (let py = y0 + 8.5; py < y1 + 1; py += step * 0.82, row++) {
    for (let px = x0 + 4.5 + (row % 2) * step * 0.5; px < x1 - 2; px += step) {
      const jx = (r() - 0.5) * 2.4, jy = (r() - 0.5) * 2;
      if (shrubs.some(([sx, sy]) => Math.hypot(px - sx, (py - sy) * 1.4) < 11)) continue;
      miniPlant(x, type, px + jx, py + jy, 1.0 + r() * 0.15, r);
    }
    for (const [sx, sy] of shrubs) if (sy > py - step * 0.82 && sy <= py) {
      lin(x, [[sx, sy + 3], [sx, sy - 4]], '#5c3e28', 1.1);
      canopy(x, sx, sy - 8, 7.5, 6.5, `${seed}_${sx | 0}`, { blossom: 14, n: 40, base: '#2a5434' });
    }
  }
  x.restore();
  lin(x, rect(x0 - 1.1, y0 - 1.1, x1 + 1.1, y1 + 1.1), '#f3ecdc', 1.5, 1, true);
  lin(x, rect(x0 - 2.1, y0 - 2.1, x1 + 2.1, y1 + 2.1), '#a8442e', 0.4, 1, true);
  lin(x, rect(x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2), '#a8442e', 0.3, 0.8, true);
}
function basin(x, cx, cy, rr, jet = true) {
  dot(x, cx, cy, rr + 2.6, C.marble); ring(x, cx, cy, rr + 2.6, '#a8442e', 0.4); ring(x, cx, cy, rr + 0.2, '#a8442e', 0.35);
  dot(x, cx, cy, rr, C.water);
  x.save(); x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.clip();
  for (let k = -3; k <= 3; k++) for (let j = -3; j <= 3; j++) { x.beginPath(); x.arc(cx + j * 3.2 + (k % 2) * 1.6, cy + k * 2.6, 1.6, 0, Math.PI); x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.3; x.stroke(); }
  x.restore();
  if (jet) {
    fo(x, [[cx - 1.4, cy], [cx - 1, cy - 3], [cx, cy - 4.5], [cx + 1, cy - 3], [cx + 1.4, cy]], C.marble, 0.3);
    for (const d of [-1, 0, 1]) {
      x.beginPath(); x.moveTo(cx, cy - 4.5); x.quadraticCurveTo(cx + d * 3, cy - 17, cx + d * 6.5, cy - 6);
      x.strokeStyle = 'rgba(250,252,255,0.9)'; x.lineWidth = 0.42; x.stroke();
    }
  }
}
function quadrant(x, Q, qi) {
  const [qx0, qy0, qx1, qy1] = Q;
  const ix0 = qx0 + 5, iy0 = qy0 + 5, ix1 = qx1 - 5, iy1 = qy1 - 5;
  const mx = (ix0 + ix1) / 2, my = (iy0 + iy1) / 2, w = 5.5;
  const beds = [[ix0, iy0, mx - w, my - w], [mx + w, iy0, ix1, my - w], [ix0, my + w, mx - w, iy1], [mx + w, my + w, ix1, iy1]];
  beds.forEach((b, k) => bed(x, ...b, BED_TYPES[qi * 4 + k], `${qi}_${k}`));
  // marble edging along the cross walks
  lin(x, [[mx, iy0], [mx, iy1]], '#efe4cc', 0.5, 0.7); lin(x, [[ix0, my], [ix1, my]], '#efe4cc', 0.5, 0.7);
  basin(x, mx, my, 8.5, true);
  return { mx, my };
}
function channel(x, pts, horiz) {
  // pts = rect of water
  const [[x0, y0], , [x1, y1]] = pts;
  fil(x, pts, C.water);
  const g = horiz ? x.createLinearGradient(0, y0, 0, y1) : x.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(60,85,120,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(60,85,120,0.35)');
  x.fillStyle = g; x.fill();
  x.save(); clipP(x, pts);
  if (horiz) {
    for (const yy of [y0 + 3.5, (y0 + y1) / 2, y1 - 3.5]) {
      const z = []; for (let px = x0; px <= x1; px += 2.4) z.push([px, yy + ((Math.round((px - x0) / 2.4) % 2) ? -1.1 : 1.1)]);
      lin(x, z, '#ffffff', 0.32, 0.65);
    }
  } else {
    for (const xx of [x0 + 3.5, (x0 + x1) / 2, x1 - 3.5]) {
      const z = []; for (let py = y0; py <= y1; py += 2.4) z.push([xx + ((Math.round((py - y0) / 2.4) % 2) ? -1.1 : 1.1), py]);
      lin(x, z, '#ffffff', 0.32, 0.65);
    }
  }
  x.restore();
  // marble kerbs with red inlay
  if (horiz) {
    for (const [a, b] of [[y0 - 2.6, y0], [y1, y1 + 2.6]]) { fil(x, rect(x0, a, x1, b), C.marble); lin(x, [[x0, a], [x1, a]], '#a8442e', 0.35); lin(x, [[x0, b], [x1, b]], '#a8442e', 0.35); }
  } else {
    for (const [a, b] of [[x0 - 2.6, x0], [x1, x1 + 2.6]]) { fil(x, rect(a, y0, b, y1), C.marble); lin(x, [[a, y0], [a, y1]], '#a8442e', 0.35); lin(x, [[b, y0], [b, y1]], '#a8442e', 0.35); }
  }
}
function octagon(cx, cy, r) {
  const out = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; out.push([cx + Math.cos(a) * r / Math.cos(Math.PI / 8), cy + Math.sin(a) * r / Math.cos(Math.PI / 8)]); }
  return out;
}
function tank(x) {
  const { x: cx, y: cy, r } = TANK;
  fo(x, octagon(cx, cy, r + 6), C.marble, 0.45);
  lin(x, octagon(cx, cy, r + 4.2), '#a8442e', 0.4, 1, true);
  const inner = octagon(cx, cy, r);
  fil(x, inner, C.water);
  x.save(); clipP(x, inner);
  const g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.1);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(50,75,115,0.4)');
  x.fillStyle = g; x.fillRect(cx - r - 8, cy - r - 8, r * 2 + 16, r * 2 + 16);
  for (let k = -14; k <= 14; k++) for (let j = -12; j <= 12; j++) {
    x.beginPath(); x.arc(cx + j * 3.6 + (k % 2) * 1.8, cy + k * 2.9, 1.8, 0.1, Math.PI - 0.1);
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 0.3; x.stroke();
  }
  // lotus leaves and flowers
  const r2 = R('lotus');
  for (const [lx, ly, lr] of [[cx - 24, cy - 16, 6.5], [cx + 22, cy + 18, 7], [cx - 18, cy + 22, 5.5], [cx + 26, cy - 12, 5], [cx - 6, cy + 30, 4.5], [cx + 8, cy - 30, 5]]) {
    x.beginPath(); x.moveTo(lx, ly); x.arc(lx, ly, lr, 0.35, TAU - 0.1); x.closePath(); x.fillStyle = '#3f7a48'; x.fill();
    x.strokeStyle = '#21452b'; x.lineWidth = 0.35; x.stroke();
    for (let k = 0; k < 7; k++) { const a = 0.35 + (k / 7) * (TAU - 0.45); lin(x, [[lx, ly], [lx + Math.cos(a) * lr * 0.85, ly + Math.sin(a) * lr * 0.85]], '#6fa364', 0.25, 0.8); }
    if (r2() < 0.6) {
      const fx = lx + lr * 0.6, fy = ly - lr * 0.5;
      for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; ell(x, fx + Math.cos(a) * 1.5, fy + Math.sin(a) * 1.5, 1.5, 0.75, a, k % 2 ? '#f1a7b6' : '#f8cfd7'); }
      dot(x, fx, fy, 0.8, '#e9b73a');
    }
  }
  x.restore();
  lin(x, inner, OUT, 0.4, 1, true);
  // the lotus fountain (seen in elevation, like everything that stands up)
  const sp = [[cx - 4.4, cy + 2], [cx - 5.2, cy - 2], [cx - 3, cy - 6], [cx, cy - 9.5], [cx + 3, cy - 6], [cx + 5.2, cy - 2], [cx + 4.4, cy + 2]];
  fo(x, sp, C.marble, 0.35);
  for (const d of [-1, 0, 1]) lin(x, [[cx + d * 2.2, cy + 1.5], [cx + d * 1.6, cy - 5]], '#a8442e', 0.3, 0.8);
  for (const [d, h] of [[-3, 30], [-1.6, 37], [0, 41], [1.6, 37], [3, 30], [-4.4, 22], [4.4, 22]]) {
    x.beginPath(); x.moveTo(cx, cy - 9.5); x.quadraticCurveTo(cx + d * 4, cy - 9.5 - h * 1.25, cx + d * 9.5, cy - 9.5 - h * 0.35);
    x.strokeStyle = 'rgba(250,253,255,0.95)'; x.lineWidth = 0.5; x.stroke();
    const ex = cx + d * 9.5, ey = cy - 9.5 - h * 0.35;
    for (let k = 1; k <= 3; k++) dot(x, ex + d * k * 0.9, ey + k * 2.6, 0.4, '#ffffff', 0.85);
  }
}
const FOUNTAINS = [[TANK.x, TANK.y - 50, 1.4], ...QUADS.map(([a, b, c, d]) => [(a + c) / 2, (b + d) / 2 - 13, 0.8])];   // jet apexes

function paintGarden(x) {
  fil(x, rect(50, WALL.bot, 950, PATH.y0), C.walk);
  stipple(x, 50, WALL.bot, 950, PATH.y0, 9000, ['rgba(160,130,80,0.3)', 'rgba(255,250,235,0.35)'], 'walk', 0.6);
  QUADS.forEach((Q, k) => quadrant(x, Q, k));
  // water channels (the cross of the charbagh) and the tank at the crossing
  channel(x, rect(50, CH.hy - CH.w, TER.x0 - 30, CH.hy + CH.w), true);
  channel(x, rect(CH.vx - CH.w, WALL.bot, CH.vx + CH.w, PATH.y0), false);
  tank(x);
  // the dug patch where the gardener works (upper-left quadrant, lower-left bed)
  const dp = blob(128, 488, 17, 10, 77, 12, 0.3);
  fil(x, dp, '#7b5a3b'); stipple(x, 110, 476, 146, 500, 160, ['rgba(40,25,15,0.6)', 'rgba(170,130,90,0.5)'], 'dug', 0.7);
  lin(x, dp, '#4b3322', 0.4, 0.8, true);
  for (let k = 0; k < 4; k++) { const px = 116 + k * 7; lin(x, [[px, 498], [px - 1, 494]], '#6fa35c', 0.45); lin(x, [[px, 498], [px + 1.2, 494.5]], '#6fa35c', 0.45); }
  // lawn under the terrace: a border of irises and two flowering shrubs
  const r = R('lawn');
  for (let px = 606; px < 948; px += 7) {
    const by = TER.bot + 9 + (r() - 0.5) * 2;
    lin(x, [[px, by], [px - 1.4, by - 7]], '#4c7d48', 0.45); lin(x, [[px, by], [px + 1.6, by - 6.5]], '#3d6a3e', 0.45);
    if (r() < 0.7) { const c = r() < 0.5 ? '#5b4fa6' : '#f6f0e2'; ell(x, px - 0.3, by - 8, 1.4, 1.9, 0, c); dot(x, px - 0.3, by - 7.3, 0.4, '#e9b73a'); }
  }
  canopy(x, 640, 704, 16, 12, 'sh1', { blossom: 40, n: 120 });
  canopy(x, 770, 712, 13, 10, 'sh2', { blossom: 30, n: 100 });
  // garden trees standing on the plan
  CYP.forEach((c) => cypress(x, c));
  BLOSSOM.forEach((b) => blossomTree(x, b));
}

// ------------------------------------------------------------------ the pavilion and terrace
function sandWall(x, pts, seed) {
  fil(x, pts, C.sand);
  x.save(); clipP(x, pts);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [a, b] of pts) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  stipple(x, x0, y0, x1, y1, (x1 - x0) * (y1 - y0) * 0.12, ['rgba(95,30,15,0.28)', 'rgba(235,160,130,0.25)'], 'sw' + seed, 0.6);
  x.restore();
}
function starPanel(x, x0, y0, x1, y1) {
  // marble-inlay panel: white frame, a lattice of eight-pointed stars
  lin(x, rect(x0, y0, x1, y1), '#f3e9d6', 0.9, 1, true);
  x.save(); clipP(x, rect(x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5));
  const s = 7;
  for (let py = y0 + s / 2; py < y1 + s; py += s) for (let px = x0 + s / 2; px < x1 + s; px += s) {
    const pts = [];
    for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; const rr = k % 2 ? 1.5 : 2.7; pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]); }
    lin(x, pts, '#f3e9d6', 0.35, 0.9, true);
  }
  x.restore();
}
function marbleFrameArch(x, a, w = 2.6) {
  lin(x, a, OUT, w + 0.8, 1, false);
  lin(x, a, C.marble, w, 1, false);
  lin(x, a, '#c8b89c', 0.3, 0.9, false);
}
function paintPavilion(x) {
  const { x0, x1 } = PAV;
  // chhatris on the roof (behind the parapet)
  for (const cx of CHH) {
    fil(x, rect(cx - 13, 168, cx + 13, 197), '#3b1712');
    for (const dx of [-13, -5, 5, 13]) fo(x, rect(cx + dx - 1.4, 170, cx + dx + 1.4, 197), C.marble, 0.3);
    fo(x, [[cx - 19, 165], [cx + 19, 165], [cx + 16, 171], [cx - 16, 171]], C.marble, 0.35);
    const dome = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const a = Math.PI * t; const bul = Math.sin(a) * (1 + 0.25 * Math.sin(a)); dome.push([cx - 15 * Math.cos(a) * (1 - 0.12 * t), 165 - 26 * Math.pow(Math.sin(a / 2), 1.5) * bul * 0.86]); }
    const dm = [[cx - 15, 165]];
    for (let i = 0; i <= 30; i++) { const t = i / 30, y = 165 - t * 26; const w = 15 * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * (1 - t))), 0.7) * (t < 0.3 ? 1 + t * 0.4 : 1); dm.push([cx - w, y]); }
    for (let i = 30; i >= 0; i--) { const t = i / 30, y = 165 - t * 26; const w = 15 * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * (1 - t))), 0.7) * (t < 0.3 ? 1 + t * 0.4 : 1); dm.push([cx + w, y]); }
    void dome;
    fo(x, dm, C.marble, 0.4);
    x.save(); clipP(x, dm);
    for (let k = -4; k <= 4; k++) lin(x, [[cx + k * 3.4, 166], [cx + k * 2.2, 152], [cx + k * 0.4, 140]], '#c9bba0', 0.3, 0.8);
    const g = x.createLinearGradient(cx - 15, 0, cx + 15, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,50,0.25)');
    x.fillStyle = g; x.fillRect(cx - 16, 136, 32, 32);
    x.restore();
    // gold finial (kalash)
    fo(x, [[cx - 1, 140], [cx - 2.6, 136], [cx - 1.2, 133], [cx, 128.5], [cx + 1.2, 133], [cx + 2.6, 136], [cx + 1, 140]], C.gold, 0.3);
    dot(x, cx, 136, 1.1, C.goldL);
  }
  // upper floor
  sandWall(x, rect(x0, 210, x1, 374), 'up');
  starPanel(x, x0 + 8, 222, 750, 258); starPanel(x, 864, 222, x1 - 8, 258);
  starPanel(x, x0 + 8, 332, 750, 366); starPanel(x, 864, 332, x1 - 8, 366);
  for (const W of WINS) {
    lin(x, rect(W.x0 - 6, W.top - 6, W.x1 + 6, W.sill + 4), '#f3e9d6', 0.6, 0.9, true);
    const a = archPoly(W.x0, W.x1, W.top, W.spring, W.sill, 3, 1.4);
    fil(x, a, '#3a1611');
    const g = x.createLinearGradient(0, W.top, 0, W.sill);
    g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(120,40,20,0.25)');
    pth(x, a); x.fillStyle = g; x.fill();
    marbleFrameArch(x, a.slice(1, -1), 2.2);
    lin(x, [[W.x0, W.spring], [W.x0, W.sill]], C.marble, 2.2); lin(x, [[W.x1, W.spring], [W.x1, W.sill]], C.marble, 2.2);
    // jali screen in the lower half
    const jy = W.sill - 20;
    fil(x, rect(W.x0, jy, W.x1, W.sill), '#e9e0cd');
    x.save(); clipP(x, rect(W.x0, jy, W.x1, W.sill));
    for (let k = -8; k < 12; k++) { lin(x, [[W.x0 + k * 4, jy], [W.x0 + k * 4 + 20, W.sill]], '#5a2a1b', 0.55); lin(x, [[W.x0 + k * 4 + 20, jy], [W.x0 + k * 4, W.sill]], '#5a2a1b', 0.55); }
    x.restore();
    lin(x, rect(W.x0, jy, W.x1, W.sill), OUT, 0.4, 1, true);
    fo(x, rect(W.x0 - 4, W.sill, W.x1 + 4, W.sill + 3), C.marble, 0.35);
  }
  // jharokha: brackets, balcony slab, columns, opening, bangla roof
  for (const bx of [JH.x0 + 2, JH.cx, JH.x1 - 2]) {
    const br = [[-5, 0], [5, 0], [4.2, 5], [2.2, 10], [1.4, 16], [0, 24], [-1.4, 16], [-2.2, 10], [-4.2, 5]].map(([a, b]) => [bx + a, JH.sill + 8 + b]);
    fo(x, br, C.marble, 0.4); lin(x, [[bx, JH.sill + 9], [bx, JH.sill + 28]], '#c8b89c', 0.35);
    for (const yy of [4, 9]) lin(x, [[bx - 4 + yy * 0.25, JH.sill + 8 + yy], [bx + 4 - yy * 0.25, JH.sill + 8 + yy]], '#a8442e', 0.3, 0.8);
  }
  fo(x, rect(JH.x0 - 14, JH.sill, JH.x1 + 14, JH.sill + 8), C.marble, 0.45);
  for (let px = JH.x0 - 10; px < JH.x1 + 12; px += 6) lin(x, [[px, JH.sill + 2], [px + 3, JH.sill + 6]], '#a8442e', 0.35);
  lin(x, [[JH.x0 - 14, JH.sill + 4], [JH.x1 + 14, JH.sill + 4]], '#a8442e', 0.25, 0.6);
  fo(x, rect(JH.x0 - 12, JH.top - 12, JH.x1 + 12, JH.sill), C.marble, 0.45);
  const op = archPoly(JH.x0, JH.x1, JH.top, JH.spring, JH.sill, 5, 2.2);
  fil(x, op, '#33130f');
  const g = x.createLinearGradient(0, JH.top, 0, JH.sill);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(130,45,25,0.3)');
  pth(x, op); x.fillStyle = g; x.fill();
  // the emperor's halo and his brocade bolster (he is a sprite)
  x.save(); clipP(x, op);
  const hg = x.createRadialGradient(HALO.x, HALO.y, 2, HALO.x, HALO.y, HALO.r);
  hg.addColorStop(0, '#f6e3a0'); hg.addColorStop(0.6, '#d9b55a'); hg.addColorStop(1, '#b38a33');
  dot(x, HALO.x, HALO.y, HALO.r, '#b38a33'); x.beginPath(); x.arc(HALO.x, HALO.y, HALO.r - 0.6, 0, TAU); x.fillStyle = hg; x.fill();
  for (let k = 0; k < 48; k++) { const a = (k * TAU) / 48; lin(x, [[HALO.x + Math.cos(a) * 5, HALO.y + Math.sin(a) * 5], [HALO.x + Math.cos(a) * (HALO.r - 1.2), HALO.y + Math.sin(a) * (HALO.r - 1.2)]], k % 2 ? '#f8e7a8' : '#a98330', 0.35, 0.8); }
  ring(x, HALO.x, HALO.y, HALO.r - 0.3, '#7a5a1c', 0.5);
  for (let k = 0; k < 24; k++) { const a = (k * TAU) / 24; dot(x, HALO.x + Math.cos(a) * (HALO.r + 1.6), HALO.y + Math.sin(a) * (HALO.r + 1.6), 0.55, '#f1d98c'); }
  fo(x, [[JH.x0 + 6, JH.sill], [JH.x0 + 9, 306], [JH.x1 - 9, 306], [JH.x1 - 6, JH.sill]], '#8f2a1c', 0.4);
  for (let px = JH.x0 + 10; px < JH.x1 - 8; px += 5) for (let py = 310; py < JH.sill; py += 5) dot(x, px + ((py / 5) % 2) * 2.5, py, 0.75, C.gold);
  x.restore();
  marbleFrameArch(x, op.slice(1, -1), 2.4);
  for (const cx of [JH.x0, JH.x1]) {
    fo(x, rect(cx - 2, JH.spring - 2, cx + 2, JH.sill), C.marble, 0.35);
    fo(x, rect(cx - 3, JH.spring - 4, cx + 3, JH.spring - 1), C.gold, 0.3);
    for (let py = JH.spring + 6; py < JH.sill - 2; py += 8) lin(x, [[cx - 1.4, py], [cx + 1.4, py + 2]], '#a8442e', 0.3);
  }
  // spandrels: tiny inlay flowers
  for (const sx of [JH.x0 - 6, JH.x1 + 6]) { for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; dot(x, sx + Math.cos(a) * 2, JH.top - 4 + Math.sin(a) * 2, 1, k % 2 ? C.verm : C.lapis); } dot(x, sx, JH.top - 4, 0.8, C.gold); }
  // bangla roof
  const bw = 58, by = JH.top - 12;
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, xx = JH.cx - bw + 2 * bw * t, s = (xx - JH.cx) / bw; top.push([xx, by - 20 * Math.pow(Math.max(0, 1 - s * s), 0.75)]); bot.push([xx, by + 2 - 4 * (1 - s * s)]); }
  const roofP = top.concat(bot.slice().reverse());
  fo(x, roofP, C.marble, 0.45);
  x.save(); clipP(x, roofP);
  for (let i = 1; i < 26; i++) { const t = i / 26, xx = JH.cx - bw + 2 * bw * t, s = (xx - JH.cx) / bw; lin(x, [[xx, by - 20 * Math.pow(Math.max(0, 1 - s * s), 0.75)], [xx + s * 2, by + 2 - 4 * (1 - s * s)]], '#c9bba0', 0.35, 0.85); }
  const rg = x.createLinearGradient(0, by - 22, 0, by + 2);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(110,80,50,0.25)');
  x.fillStyle = rg; x.fillRect(JH.cx - bw, by - 24, bw * 2, 28);
  x.restore();
  lin(x, top, C.gold, 0.9);
  for (const fx of [JH.cx - bw + 2, JH.cx, JH.cx + bw - 2]) {
    const fy = fx === JH.cx ? by - 20 : by - 1;
    fo(x, [[fx - 1, fy], [fx - 2.4, fy - 3.5], [fx, fy - 8], [fx + 2.4, fy - 3.5], [fx + 1, fy]], C.gold, 0.3);
  }
  // parapet + kanguras
  fo(x, rect(x0 - 4, 196, x1 + 4, 212), C.marble, 0.45);
  for (let px = x0; px < x1; px += 12) fo(x, [[px + 2, 200], [px + 6, 197.5], [px + 10, 200], [px + 6, 208.5]], '#bf5a3e', 0.25);
  lin(x, [[x0 - 4, 209], [x1 + 4, 209]], '#a8442e', 0.35);
  for (let px = x0 + 2; px < x1 + 2; px += 11.5) kangura(x, px, 196, 0.95, C.marble);
  // chajja between the floors
  fo(x, [[x0 - 12, 372], [x1 + 12, 372], [x1 + 8, 380], [x0 - 8, 380]], C.marble, 0.45);
  fil(x, rect(x0, 380, x1, 387), '#6e2a1c');
  for (let px = x0 + 6; px < x1; px += 16) fo(x, [[px - 2.2, 380], [px + 2.2, 380], [px + 1, 388], [px - 1, 388]], C.marble, 0.3);
  // ground floor: pilasters, arches, interiors
  sandWall(x, rect(x0, 387, x1, TER.top), 'gf');
  const bays = [[682, 752, 418, 446], [764, 850, 404, 434], [862, 932, 418, 446]];
  for (const [a, b, tp, spr] of bays) {
    const ar = archPoly(a, b, tp, spr, TER.top, 5, 2.4);
    fil(x, ar, '#3e1812');
    const ig = x.createLinearGradient(0, tp, 0, TER.top);
    ig.addColorStop(0, 'rgba(10,0,0,0.4)'); ig.addColorStop(0.7, 'rgba(110,40,22,0.15)'); ig.addColorStop(1, 'rgba(150,60,30,0.35)');
    pth(x, ar); x.fillStyle = ig; x.fill();
    x.save(); clipP(x, ar);
    // inner niche on the back wall, a dado of painted flowers
    const nm = (a + b) / 2;
    lin(x, archPoly(nm - 12, nm + 12, spr + 6, spr + 16, spr + 52, 3, 1), '#c9a77a', 0.45, 0.55, true);
    fil(x, rect(a, TER.top - 22, b, TER.top), '#5c2418', 0.8);
    for (let px = a + 4; px < b; px += 8) { lin(x, [[px, TER.top - 2], [px, TER.top - 14]], '#6f9a5a', 0.4, 0.7); dot(x, px, TER.top - 15, 1.2, k2c(px), 0.8); }
    // a hanging brocade (qanat) on the back wall and a lamp on a gold chain
    fil(x, rect(nm - 9, spr + 20, nm + 9, spr + 50), '#7d2a1c', 0.9);
    for (let py = spr + 23; py < spr + 49; py += 5) for (let px = nm - 7; px < nm + 8; px += 5) dot(x, px + ((py - spr) % 10 ? 2.5 : 0), py, 0.7, C.gold, 0.85);
    lin(x, rect(nm - 9, spr + 20, nm + 9, spr + 50), C.gold, 0.5, 0.9, true);
    if (a !== 764) { lin(x, [[nm, tp + 6], [nm, spr + 10]], C.goldD, 0.35); fo(x, [[nm - 3, spr + 10], [nm + 3, spr + 10], [nm + 1.6, spr + 14], [nm - 1.6, spr + 14]], C.gold, 0.25); dot(x, nm, spr + 15.6, 1, '#f6d27a'); }
    x.restore();
    marbleFrameArch(x, ar.slice(1, -1), 2.6);
    // spandrel inlay
    for (const sx of [a + 6, b - 6]) { for (let k = 0; k < 8; k++) { const q = (k * TAU) / 8; ell(x, sx + Math.cos(q) * 2.4, tp + 2 + Math.sin(q) * 2.4, 1.6, 0.8, q, '#f3e9d6'); } dot(x, sx, tp + 2, 1, C.verm); }
  }
  // the hanging lamp in the central bay
  lin(x, [[807, 412], [807, 440]], C.goldD, 0.4);
  fo(x, [[803, 440], [811, 440], [809, 446], [805, 446]], C.gold, 0.3);
  dot(x, 807, 448, 1.3, '#f6d27a');
  for (const [a, b] of [[668, 682], [752, 764], [850, 862], [932, 946]]) {
    fo(x, rect(a, 387, b, TER.top), C.marble, 0.4);
    lin(x, rect(a + 2.5, 400, b - 2.5, TER.top - 12), '#a8442e', 0.35, 1, true);
    for (let py = 406; py < TER.top - 16; py += 10) { const cx = (a + b) / 2; fo(x, [[cx, py], [cx + 2.4, py + 3], [cx, py + 6], [cx - 2.4, py + 3]], '#c86048', 0.25); }
    fo(x, rect(a - 1.5, 387, b + 1.5, 392), C.marble, 0.35);
    fo(x, rect(a - 1.5, TER.top - 6, b + 1.5, TER.top), C.marble, 0.35);
  }
  lin(x, [[x0, 387], [x1, 387]], OUT, 0.5);
}
function k2c(px) { return ['#e59aa6', '#f6f0e2', '#e7a33b', '#5b4fa6'][Math.floor(px / 8) % 4]; }

function paintTerrace(x) {
  const { x0, x1, top, edge, bot } = TER;
  // floor (plan): marble with a red star-and-cross tiling
  fil(x, rect(x0, top, x1, edge), '#efe7d6');
  x.save(); clipP(x, rect(x0, top, x1, edge));
  for (let py = top + 6; py < edge; py += 12) for (let px = x0 + 6; px < x1; px += 12) {
    const pts = [];
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + Math.PI / 8; const rr = k % 2 ? 2.4 : 4.4; pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]); }
    fil(x, pts, '#c06a50', 0.55);
  }
  for (let py = top; py < edge; py += 12) lin(x, [[x0, py], [x1, py]], '#b9a688', 0.3, 0.7);
  for (let px = x0; px < x1; px += 12) lin(x, [[px, top], [px, edge]], '#b9a688', 0.3, 0.7);
  x.restore();
  lin(x, [[x0, top], [x1, top]], OUT, 0.4);
  // front face (elevation)
  fo(x, rect(x0 - 2, edge, x1 + 2, edge + 5), C.marble, 0.45);
  sandWall(x, rect(x0, edge + 5, x1, bot), 'ter');
  for (let px = x0 + 10; px < x1 - 30; px += 42) {
    const a = archPoly(px, px + 30, edge + 13, edge + 22, bot - 8, 3, 1.1);
    fil(x, a, C.sandD, 0.5); lin(x, a, '#f3e9d6', 0.8, 1, true);
    for (let k = 0; k < 6; k++) { const q = (k * TAU) / 6; dot(x, px + 15 + Math.cos(q) * 2.2, bot - 22 + Math.sin(q) * 2.2, 1, '#f3e9d6'); }
  }
  fo(x, rect(x0 - 2, bot - 4, x1 + 2, bot), C.marble, 0.4);
  // side stairs down to the garden
  for (let i = 0; i < 4; i++) {
    const y1 = bot - i * 15, y0 = y1 - 15, sx = x0 - 30 + i * 7.5;
    fo(x, rect(sx, y0, x0, y1), i % 2 ? '#eee6d4' : '#e4d8c0', 0.4);
    lin(x, [[sx, y0 + 2], [x0, y0 + 2]], '#a8442e', 0.3);
  }
  lin(x, [[x0 - 30, bot], [x0 - 30 + 30, bot - 60]], OUT, 0.4);
}

// ------------------------------------------------------------------ the walk (rider line y = 800) and foreground
function paintPath(x) {
  const { y0, y1 } = PATH;
  fil(x, rect(0, y0, 1000, y1), '#efe6d3');
  stipple(x, 0, y0, 1000, y1, 5000, ['rgba(150,130,95,0.25)', 'rgba(255,255,250,0.5)'], 'path', 0.6);
  // marble slabs: three runs of staggered pavers
  const runs = [[y0 + 7, 789], [789, 811], [811, y1 - 7]];
  runs.forEach(([a, b], k) => {
    lin(x, [[0, a], [1000, a]], '#bfae90', 0.35, 0.9);
    for (let px = (k % 2) * 17; px < 1000; px += 34) lin(x, [[px, a], [px, b]], '#c4b496', 0.3, 0.8);
  });
  lin(x, [[0, 811], [1000, 811]], '#bfae90', 0.35, 0.9);
  // red sandstone kerbs with marble lozenges
  for (const [a, b] of [[y0, y0 + 7], [y1 - 7, y1]]) {
    fil(x, rect(0, a, 1000, b), C.sand);
    for (let px = 5; px < 1000; px += 10) fo(x, [[px, a + 1.4], [px + 3, (a + b) / 2], [px, b - 1.4], [px - 3, (a + b) / 2]], '#f3e9d6', 0.2);
    lin(x, [[0, a], [1000, a]], OUT, 0.4); lin(x, [[0, b], [1000, b]], OUT, 0.4);
  }
}

function plantSide(x, type, px, py, h, r) {
  // a botanical specimen seen from the side, in the manner of the Jahangir-period flower studies
  const sb = h / 21;
  const lean = (r() - 0.5) * 0.22;
  const top = [px + Math.sin(lean) * h, py - h];
  const blade = (ang, L, W, col) => {
    const pts = [];
    const bend = (r() - 0.5) * 0.5;
    for (let i = 0; i <= 12; i++) { const t = i / 12, a = ang + bend * t * t; pts.push([px + Math.cos(a) * L * t - Math.sin(a) * W * Math.sin(Math.PI * Math.pow(t, 0.8)), py + Math.sin(a) * L * t + Math.cos(a) * W * Math.sin(Math.PI * Math.pow(t, 0.8))]); }
    for (let i = 12; i >= 0; i--) { const t = i / 12, a = ang + bend * t * t; pts.push([px + Math.cos(a) * L * t + Math.sin(a) * W * 0.4 * Math.sin(Math.PI * t), py + Math.sin(a) * L * t - Math.cos(a) * W * 0.4 * Math.sin(Math.PI * t)]); }
    fo(x, pts, col, 0.25, '#203f27');
  };
  const nb = type === 'poppy' || type === 'mari' ? 2 : 4;
  for (let k = 0; k < nb; k++) blade(-Math.PI / 2 + (k - (nb - 1) / 2) * 0.42 + (r() - 0.5) * 0.15, h * (0.45 + r() * 0.25), 1.5 * sb, k % 2 ? '#5d9752' : '#3f7a45');
  lin(x, [[px, py], [lerp(px, top[0], 0.5) + (r() - 0.5) * 2, py - h * 0.5], top], '#3c6a3a', 0.65 * sb);
  if (type === 'poppy' || type === 'mari') for (let k = 0; k < 3; k++) {
    const sd = k % 2 ? 1 : -1, by = py - h * (0.2 + k * 0.2), L = h * 0.26;
    const pts = [[px, by], [px + sd * L * 0.5, by - L * 0.5], [px + sd * L, by - L * 0.3], [px + sd * L * 0.45, by - L * 0.1]];
    fo(x, smoothLoop(pts, 3), '#4f8a49', 0.25, '#203f27');
  }
  x.save(); x.translate(top[0], top[1]); x.scale(sb, sb);
  if (type === 'iris') {
    ell(x, 0, -2, 1.8, 3.2, 0, '#5b4fa6'); ell(x, -2.4, 0.6, 2.6, 1.3, 0.5, '#6d5fb8'); ell(x, 2.4, 0.6, 2.6, 1.3, -0.5, '#6d5fb8');
    lin(x, [[-3.6, 1.2], [-1.2, 0.2]], '#3a2f7a', 0.3); lin(x, [[3.6, 1.2], [1.2, 0.2]], '#3a2f7a', 0.3);
    dot(x, 0, 0, 0.7, '#f0c43c'); lin(x, [[-1.4, -4.6], [0, -5.4], [1.4, -4.6]], OUT, 0.25, 0.6);
  } else if (type === 'poppy') {
    fo(x, [[-3.6, 0], [-3.2, -3.4], [0, -4.4], [3.2, -3.4], [3.6, 0], [0, 1.2]], '#d23b26', 0.25);
    lin(x, [[-1.6, -3.6], [-1, 0]], '#8e1d12', 0.3); lin(x, [[1.4, -3.4], [1.1, 0]], '#8e1d12', 0.3); dot(x, 0, -0.8, 0.8, '#211510');
  } else if (type === 'lily') {
    for (const sd of [-1, 0, 1]) fo(x, [[0, 1], [sd * 3.6 - 0.8, -3.2], [sd * 2.6, -5], [sd * 1.2, -1]], '#fbf7ec', 0.25);
    for (const sd of [-1, 1]) lin(x, [[0, 0], [sd * 1.4, -4.4]], '#c47a2a', 0.3);
  } else if (type === 'tulip') {
    fo(x, [[-2.4, 0], [-2.6, -3.4], [-1.2, -5.4], [0, -3.6], [1.2, -5.4], [2.6, -3.4], [2.4, 0], [0, 1]], '#e78a2a', 0.25);
    lin(x, [[0, 0.6], [0, -3.4]], '#c4471f', 0.35);
  } else if (type === 'narc') {
    for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6; ell(x, Math.cos(a) * 1.6, Math.sin(a) * 1.6, 1.5, 0.8, a, '#fbf7ec'); }
    dot(x, 0, 0, 1.0, '#e9a52e'); ring(x, 0, 0, 1.0, '#b86a1a', 0.25);
  } else {
    for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12; ell(x, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 1.4, 0.6, a, k % 2 ? '#ef9d22' : '#f4b638'); }
    dot(x, 0, 0, 1.1, '#c96a12');
  }
  x.restore();
}
function carpet(x, x0, y0, x1, y1) {
  // a garden carpet seen from above: red field, lapis medallion, ivory border, fringes
  for (let px = x0 + 2; px < x1 - 1; px += 2.2) { lin(x, [[px, y0], [px, y0 - 3]], '#f2e8d2', 0.45); lin(x, [[px, y1], [px, y1 + 3]], '#f2e8d2', 0.45); }
  fo(x, rect(x0, y0, x1, y1), '#f0e5cc', 0.45);
  const b = 7;
  fil(x, rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2), C.lapisD);
  x.save(); clipP(x, rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2));
  for (let px = x0 + 4; px < x1; px += 7) for (const yy of [y0 + 4.5, y1 - 4.5]) { dot(x, px, yy, 1.3, C.verm); dot(x, px, yy, 0.5, C.goldL); }
  for (let py = y0 + 4; py < y1; py += 7) for (const xx of [x0 + 4.5, x1 - 4.5]) { dot(x, xx, py, 1.3, C.verm); dot(x, xx, py, 0.5, C.goldL); }
  x.restore();
  const F = rect(x0 + b, y0 + b, x1 - b, y1 - b);
  fil(x, F, '#a02a22');
  x.save(); clipP(x, F);
  const r = R('carpet');
  for (let py = y0 + b + 6; py < y1 - b; py += 11) for (let px = x0 + b + 6 + ((py / 11) % 2) * 6; px < x1 - b; px += 12) {
    for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4 + Math.PI / 4; ell(x, px + Math.cos(a) * 1.8, py + Math.sin(a) * 1.8, 1.7, 0.8, a, k % 2 ? '#e8c46a' : '#f1e6cf'); }
    dot(x, px, py, 0.8, C.lapis);
    if (r() < 0.6) lin(x, [[px + 3, py + 1], [px + 6, py + 4]], '#5f9a58', 0.5, 0.8);
  }
  // central medallion and spandrels
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const med = [];
  for (let k = 0; k < 32; k++) { const a = (k * TAU) / 32; const rr = 1 + 0.12 * Math.cos(a * 8); med.push([mx + Math.cos(a) * 34 * rr, my + Math.sin(a) * 17 * rr]); }
  fo(x, med, C.lapis, 0.5, C.goldD);
  lin(x, med.map(([a, bb]) => [mx + (a - mx) * 0.8, my + (bb - my) * 0.8]), C.gold, 0.6, 1, true);
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; ell(x, mx + Math.cos(a) * 9, my + Math.sin(a) * 5, 4, 1.6, a, '#e8c46a'); }
  dot(x, mx, my, 3, C.verm); dot(x, mx, my, 1.2, C.goldL);
  for (const [cx, cy, sx, sy] of [[x0 + b, y0 + b, 1, 1], [x1 - b, y0 + b, -1, 1], [x0 + b, y1 - b, 1, -1], [x1 - b, y1 - b, -1, -1]]) {
    fo(x, [[cx, cy], [cx + sx * 26, cy], [cx + sx * 10, cy + sy * 6], [cx, cy + sy * 13]], C.lapis, 0.35, C.goldD);
  }
  x.restore();
  lin(x, F, C.goldD, 0.5, 1, true);
}
function paintForeground(x) {
  const y0 = PATH.y1;
  fil(x, rect(50, y0, 950, 950), '#55784a');
  const r = R('meadow');
  for (let k = 0; k < 30; k++) {
    const px = 50 + r() * 900, py = y0 + r() * 120, rad = 20 + r() * 50;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, r() < 0.5 ? 'rgba(20,50,25,0.3)' : 'rgba(170,190,110,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const g = x.createLinearGradient(0, y0, 0, 950);
  g.addColorStop(0, 'rgba(255,255,220,0.08)'); g.addColorStop(1, 'rgba(10,40,20,0.22)');
  x.fillStyle = g; x.fillRect(50, y0, 900, 950 - y0);
  for (let k = 0; k < 4200; k++) {
    const px = 50 + r() * 900, py = y0 + 2 + r() * (948 - y0), a = -Math.PI / 2 + (r() - 0.5) * 0.7, L = 2 + r() * 3.4;
    lin(x, [[px, py], [px + Math.cos(a) * L, py + Math.sin(a) * L]], r() < 0.5 ? '#355f37' : '#7aa463', 0.4, 0.85);
  }
  for (let k = 0; k < 300; k++) flowerTop(x, ['poppy', 'narc', 'rose', 'mari', 'iris'][k % 5], 52 + r() * 896, y0 + 6 + r() * 108, 0.7 + r() * 0.3);
  carpet(x, 66, 856, 372, 940);
  // two rows of botanical specimens
  const kinds = ['iris', 'poppy', 'lily', 'tulip', 'narc', 'mari'];
  let k = 0;
  for (let px = 404; px < 942; px += 40 + r() * 10) plantSide(x, kinds[(k++ * 5) % kinds.length], px, 886 + r() * 8, 26 + r() * 8, r);
  for (let px = 392 + 20; px < 930; px += 44 + r() * 12) {
    if (px > 590) break;   // room for the painter's attribution
    plantSide(x, kinds[k++ % kinds.length], px, 934 + r() * 8, 36 + r() * 12, r);
  }
  for (const px of [700, 760, 820, 880, 934]) plantSide(x, kinds[k++ % kinds.length], px + r() * 8, 912 + r() * 4, 22 + r() * 6, r);
}

// ------------------------------------------------------------------ title panel and attribution
function glyphBox(cv) {
  const d = c2d(cv).getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
  for (let y = 0; y < cv.height; y += 2) for (let xx = 0; xx < cv.width; xx += 2) {
    if (d[(y * cv.width + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1 };
}
/** Gold letters, painted: dark outline (tahrir), gold body with a burnished gradient, a few speckles of wear. */
function goldText(x, K, text, cx, cy, size, o = {}) {
  const S = 140;
  const sp = K.textSprite({ text, font: o.font || '"Kaiti SC", "STKaiti", serif', weight: o.weight || 700, size: S, color: '#ffffff', letterSpacing: o.ls || 0 });
  const src = sp.g.canvas || sp.g.elt;
  const W = src.width, H = src.height;
  const bb = glyphBox(src);
  const pad = 12;
  const out = mk(W, H), ox = c2d(out);
  // outline: the mask stamped round a circle, in dark ink
  const dark = mk(W, H), dx = c2d(dark);
  dx.drawImage(src, 0, 0); dx.globalCompositeOperation = 'source-in'; dx.fillStyle = o.edge || '#2a1608'; dx.fillRect(0, 0, W, H);
  const rr = o.outline ?? 5;
  for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; ox.drawImage(dark, Math.cos(a) * rr, Math.sin(a) * rr); }
  // gold body
  const gold = mk(W, H), gx = c2d(gold);
  gx.drawImage(src, 0, 0);
  gx.globalCompositeOperation = 'source-in';
  const gg = gx.createLinearGradient(0, bb.y0, 0, bb.y1);
  gg.addColorStop(0, '#fbeab0'); gg.addColorStop(0.35, '#e2c063'); gg.addColorStop(0.6, '#b8902f'); gg.addColorStop(0.85, '#d9b552'); gg.addColorStop(1, '#a37b26');
  gx.fillStyle = gg; gx.fillRect(0, 0, W, H);
  // burnish streaks and wear
  const r = R('gt', text);
  gx.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 40; k++) {
    const yy = bb.y0 + r() * (bb.y1 - bb.y0), xx = bb.x0 + r() * (bb.x1 - bb.x0);
    gx.strokeStyle = r() < 0.6 ? 'rgba(255,248,215,0.55)' : 'rgba(120,85,20,0.35)'; gx.lineWidth = 1 + r() * 2;
    gx.beginPath(); gx.moveTo(xx, yy); gx.lineTo(xx + 10 + r() * 30, yy - 3 - r() * 6); gx.stroke();
  }
  gx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 90; k++) { gx.globalAlpha = 0.2 + r() * 0.5; gx.beginPath(); gx.arc(bb.x0 + r() * (bb.x1 - bb.x0), bb.y0 + r() * (bb.y1 - bb.y0), 0.6 + r() * 1.6, 0, TAU); gx.fill(); }
  gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over';
  ox.drawImage(gold, 0, 0);
  const sc = size / (bb.y1 - bb.y0 + 1);
  const gw = bb.x1 - bb.x0 + 1, gh = bb.y1 - bb.y0 + 1;
  const sx0 = Math.max(0, bb.x0 - pad), sy0 = Math.max(0, bb.y0 - pad);
  const sw = Math.min(W - sx0, gw + pad * 2), sh = Math.min(H - sy0, gh + pad * 2);
  x.drawImage(out, sx0, sy0, sw, sh, cx - (gw / 2 + (bb.x0 - sx0)) * sc, cy - (gh / 2 + (bb.y0 - sy0)) * sc, sw * sc, sh * sc);
  return { w: gw * sc, h: gh * sc };
}
function cartouchePoly() {
  const { x0, x1, y0, y1 } = CART;
  const my = (y0 + y1) / 2, h = y1 - y0;
  const pts = [[x0 + 26, y0], [x1 - 26, y0], [x1 - 14, y0 + h * 0.1], [x1 - 12, y0 + h * 0.3], [x1 - 4, my - 6], [x1, my], [x1 - 4, my + 6], [x1 - 12, y1 - h * 0.3], [x1 - 14, y1 - h * 0.1],
    [x1 - 26, y1], [x0 + 26, y1], [x0 + 14, y1 - h * 0.1], [x0 + 12, y1 - h * 0.3], [x0 + 4, my + 6], [x0, my], [x0 + 4, my - 6], [x0 + 12, y0 + h * 0.3], [x0 + 14, y0 + h * 0.1]];
  return smoothLoop(pts, 4);
}
function paintTitle(x, K) {
  const { x0, x1, y0, y1 } = INSET;
  // the inset text panel: burnished gold ground with a polychrome arabesque
  const g = x.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#d6b25b'); g.addColorStop(0.4, '#c29a42'); g.addColorStop(0.7, '#dcbb66'); g.addColorStop(1, '#b8903a');
  x.fillStyle = g; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  stipple(x, x0, y0, x1, y1, 2400, ['rgba(255,240,190,0.35)', 'rgba(120,85,25,0.25)'], 'inset', 0.6);
  const r = R('arab');
  // arabesque scrolls in the field
  const scroll = (cx, cy, s, dir) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = dir * t * 5.2, rr = s * (1 - t * 0.8); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    lin(x, pts, C.vermD, 0.55, 0.9);
    for (let i = 8; i < 40; i += 8) { const p = pts[i]; ell(x, p[0], p[1], 1.8, 0.8, i * 0.3, '#3f6d4a'); }
    const e = pts[40];
    for (let k = 0; k < 5; k++) { const a = (k * TAU) / 5; dot(x, e[0] + Math.cos(a) * 1.3, e[1] + Math.sin(a) * 1.3, 0.9, k % 2 ? C.lapis : '#f3eee2'); }
    dot(x, e[0], e[1], 0.6, C.verm);
  };
  for (let px = x0 + 10; px < x1; px += 22) for (const py of [y0 + 10, y1 - 9]) scroll(px + r() * 4, py, 6 + r() * 2, r() < 0.5 ? 1 : -1);
  for (const px of [x0 + 11, x1 - 11]) for (let py = y0 + 32; py < y1 - 20; py += 20) scroll(px, py, 6, px < 500 ? 1 : -1);
  // the lobed lapis cartouche
  const cp = cartouchePoly();
  lin(x, cp, OUT, 4.6, 1, true);
  lin(x, cp, C.goldL, 3.2, 1, true);
  lin(x, cp, C.gold, 1.6, 1, true);
  const lg = x.createLinearGradient(0, CART.y0, 0, CART.y1);
  lg.addColorStop(0, '#2a4aa0'); lg.addColorStop(0.5, '#203d8a'); lg.addColorStop(1, '#172f70');
  pth(x, cp); x.fillStyle = lg; x.fill();
  x.save(); clipP(x, cp);
  stipple(x, CART.x0, CART.y0, CART.x1, CART.y1, 2200, ['rgba(10,20,60,0.35)', 'rgba(120,150,220,0.25)'], 'lapis', 0.6);
  for (let k = 0; k < 140; k++) dot(x, lerp(CART.x0, CART.x1, r()), lerp(CART.y0, CART.y1, r()), 0.25 + r() * 0.35, C.goldL, 0.5 + r() * 0.5);   // pyrite flecks
  // faint cloud-band scroll behind the letters, in a darker blue
  for (let px = CART.x0 + 20; px < CART.x1 - 10; px += 34) {
    x.beginPath(); x.arc(px, CART.y0 + 44, 9, Math.PI * 0.9, Math.PI * 2.4); x.strokeStyle = 'rgba(80,110,190,0.35)'; x.lineWidth = 0.8; x.stroke();
  }
  x.restore();
  lin(x, cp.map(([a, b]) => [500 + (a - 500) * 0.975, 100 + (b - 100) * 0.93]), C.gold, 0.5, 0.9, true);
  goldText(x, K, '莫卧儿细密画', 500, 85, 34, { font: '"Kaiti SC", "STKaiti", serif', weight: 800, outline: 6 });
  goldText(x, K, '约公元一六〇〇年', 500, 125, 19, { font: '"Kaiti SC", "STKaiti", serif', weight: 700, outline: 5, ls: 6 });
  // little gold rosettes at the lobes
  for (const px of [CART.x0 + 22, CART.x1 - 22]) {
    for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; ell(x, px + Math.cos(a) * 3, 100 + Math.sin(a) * 3, 2.6, 1.2, a, C.gold); }
    dot(x, px, 100, 1.6, C.verm); dot(x, px, 100, 0.6, C.goldL);
  }
  // rules round the inset (left, right, bottom)
  const rules = [[0, OUT, 0.5], [1.2, C.gold, 1.8], [2.6, C.lapis, 1.1], [3.6, '#fbf6ea', 0.6], [4.4, C.verm, 0.8], [5.2, OUT, 0.4]];
  for (const [d, col, w] of rules) lin(x, [[x0 - d, y0], [x0 - d, y1 + d], [x1 + d, y1 + d], [x1 + d, y0]], col, w);
}
function paintAttribution(x, K) {
  const sp = K.textSprite({ text: 'Mughal Miniature · c. 1600 — work of the pelican painter', font: '"Hoefler Text", Baskerville, serif', style: 'italic', size: 64, color: '#5a1e12' });
  const src = sp.g.canvas || sp.g.elt;
  const sc = 13.5 / 64;
  x.globalAlpha = 0.95;
  x.drawImage(src, 930 - sp.w * sc, 925 - sp.pad * sc, sp.w * sc, sp.h * sc);
  x.globalAlpha = 1;
  // the painter's tiny seal
  dot(x, 937, 934, 3, C.verm, 0.85); ring(x, 937, 934, 2.2, '#f6d8c8', 0.35, 0.8);
}

// ------------------------------------------------------------------ the whole static picture
function paintMain(K) {
  return K.layer(`${ID}:main`, BK, BK, (x) => {
    x.setTransform(PXU, 0, 0, PXU, 0, 0);
    paintMargin(x);
    paintRules(x);
    x.save();
    x.beginPath(); x.rect(FR.p0, FR.p0, FR.p1 - FR.p0, FR.p1 - FR.p0); x.clip();
    paintSky(x);
    paintBackTrees(x);
    paintWall(x);
    paintGarden(x);
    paintPavilion(x);
    paintTerrace(x);
    paintForeground(x);
    x.restore();
    paintPath(x);
    // the walk's kerbs stop the rules neatly where it runs out through the margin
    for (const xe of [[0, 50], [950, 1000]]) for (const ye of [PATH.y0, PATH.y1]) lin(x, [[xe[0], ye], [xe[1], ye]], OUT, 0.5);
    x.save();
    x.beginPath(); x.rect(FR.p0, FR.p0, FR.p1 - FR.p0, FR.p1 - FR.p0); x.clip();
    paintTitle(x, K);
    paintAttribution(x, K);
    x.restore();
    // age: a warm varnish over the picture, foxing on the margin, the sheet's edges a little darker
    x.save();
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgba(243,226,192,0.22)'; x.fillRect(FR.p0, FR.p0, FR.p1 - FR.p0, FR.p1 - FR.p0);
    x.restore();
    const fx = R('fox');
    for (let k = 0; k < 26; k++) {
      const side = Math.floor(fx() * 4), t = fx() * 1000, d = 4 + fx() * 30;
      const [px, py] = side === 0 ? [t, d] : side === 1 ? [t, 1000 - d] : side === 2 ? [d, t] : [1000 - d, t];
      if (py > PATH.y0 - 4 && py < PATH.y1 + 4) continue;
      const rad = 0.8 + fx() * fx() * 4;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(140,90,40,0.35)'); g.addColorStop(0.7, 'rgba(150,100,45,0.15)'); g.addColorStop(1, 'rgba(150,100,45,0)');
      x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    const eg = x.createRadialGradient(500, 500, 420, 500, 500, 730);
    eg.addColorStop(0, 'rgba(120,80,30,0)'); eg.addColorStop(1, 'rgba(120,80,30,0.16)');
    x.fillStyle = eg; x.fillRect(0, 0, 1000, 1000);
    // a whisper of paper grain over everything (unifies the opaque colours)
    x.setTransform(1, 0, 0, 1, 0, 0);
    const gr = mk(256, 256), gc = c2d(gr), id = gc.createImageData(256, 256), rr = R('grain');
    for (let k = 0; k < 256 * 256; k++) { const v = rr() < 0.5 ? 0 : 255; id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = Math.round(rr() * 16); }
    gc.putImageData(id, 0, 0);
    x.fillStyle = x.createPattern(gr, 'repeat'); x.fillRect(0, 0, BK, BK);
  });
}

// ------------------------------------------------------------------ figures (Canvas2D, local units)
// Standing figure: feet at (0, 0), facing +x, ≈ 96 tall to the turban crown. Head centre HC.
const HC = [2.4, -85.5];
const SH_N = [1.6, -72.6], SH_F = [-1.0, -73.2];
const FACE = [[-1.6, -3.1], [3.9, -3.3], [4.4, -2.1], [4.3, -1.25], [4.95, 0.25], [6.05, 1.85], [5.05, 2.35], [5.15, 3.0], [4.75, 3.45], [5.0, 3.95], [4.5, 4.45], [4.7, 5.2], [3.5, 6.3], [1.2, 6.5], [-0.9, 5.4], [-2.5, 3.4], [-3.4, 0.8], [-3.0, -1.6]];
const FACE_L = [[-1.6, -3.1], [3.7, -3.2], [4.1, -2.1], [4.0, -1.2], [4.5, 0.3], [5.3, 1.8], [4.55, 2.3], [4.65, 2.9], [4.35, 3.35], [4.6, 3.85], [4.15, 4.3], [4.25, 5.0], [3.2, 5.9], [1.2, 6.1], [-0.9, 5.2], [-2.5, 3.4], [-3.4, 0.8], [-3.0, -1.6]];
const TURBAN = [[-3.4, 1.2], [-5.4, -1.6], [-5.9, -5.4], [-3.8, -9.2], [0.2, -9.6], [3.6, -8.4], [5.3, -6.2], [5.1, -3.7], [3.9, -3.0], [1.0, -2.9], [-1.6, -1.8], [-2.7, -0.2]];
const BEARD = [[-2.4, 1.8], [-0.6, 3.6], [1.6, 4.6], [3.2, 4.8], [4.7, 5.2], [4.4, 7.0], [2.6, 8.4], [0.2, 7.9], [-1.7, 5.9], [-2.8, 3.4]];

function headPaint(x, o) {
  const skin = o.skin || C.skin;
  const face = o.lady ? FACE_L : FACE;
  if (o.lady) {
    // braid behind, hair cap
    lin(x, [[-3.2, 1], [-4.6, 6], [-4.8, 12]], '#1b1310', 2.2);
  }
  fo(x, face, skin, 0.32);
  // hair at the nape / sideburn
  fil(x, [[-2.8, -2.4], [-0.9, -2.7], [-1.0, 0.4], [-2.4, 1.6], [-3.4, 0.2]], '#1d1511');
  // ear
  x.beginPath(); x.arc(-1.1, 0.7, 1.05, -1.4, 1.9); x.fillStyle = skin; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke();
  if (o.beard === 'full' || o.beard === 'grey') {
    fil(x, BEARD, o.beard === 'grey' ? '#a39d93' : '#231b17');
    lin(x, [[5.0, 2.95], [3.9, 3.0], [2.4, 3.8]], o.beard === 'grey' ? '#8a847b' : '#1a1411', 0.8);
  } else if (o.beard === 'mous') {
    lin(x, [[5.0, 2.95], [3.9, 3.05], [2.6, 3.6], [1.9, 3.3]], '#1d1511', 0.75);
  }
  // eye, brow, mouth
  const ew = o.wide ? 1.25 : 1;
  fil(x, [[1.9, -0.4], [2.9, -0.95 * ew], [3.85, -0.5], [2.9, -0.02 + 0.1 * (ew - 1)]], '#fbf7ee');
  dot(x, 3.2, -0.48, o.wide ? 0.36 : 0.43, '#22170f');
  lin(x, [[1.85, -0.45], [2.9, -1.0 * ew], [3.9, -0.6]], '#1d1511', 0.3);
  lin(x, [[1.8, -1.85], [3.0, -2.25], [4.1, -1.85]], '#1d1511', 0.32);
  lin(x, [[4.7, 3.48], [4.05, 3.55]], '#7a3a2a', 0.28);
  if (o.mouthO) dot(x, 4.55, 3.55, 0.48, '#4a1c14');
  if (o.lady) {
    // hair under a transparent veil, forehead jewel, earring
    fil(x, [[-3.4, 1.0], [-4.6, -2.5], [-3.8, -6.0], [-0.5, -7.3], [3.0, -6.2], [4.0, -3.4], [3.5, -2.6], [0.8, -3.1], [-1.8, -1.4], [-2.6, 1.2]], '#1b1310');
    fil(x, [[-5.6, 9], [-5.8, -3], [-3.8, -7.8], [0.6, -8.8], [3.8, -7.4], [4.8, -4.2], [2.4, -5.0], [-1.0, -4.4], [-3.0, -0.6], [-3.6, 6], [-4.6, 12]], o.veil || '#f2a9ba', 0.5);
    lin(x, [[4.8, -4.2], [3.8, -7.4], [0.6, -8.8], [-3.8, -7.8], [-5.8, -3], [-5.6, 9]], C.gold, 0.4, 0.9);
    dot(x, 3.9, -3.5, 0.55, C.gold); dot(x, -0.9, 2.6, 0.55, C.gold); dot(x, -0.9, 3.5, 0.4, '#f6f0e2');
    return;
  }
  // turban
  const T = TURBAN;
  fil(x, T, o.turban || '#f3eee2');
  x.save(); clipP(x, T);
  const fold = mixHex(o.turban || '#f3eee2', '#3a2a20', 0.28);
  for (let k = 1; k <= 6; k++) {
    const t = k / 7;
    const a = [lerp(5.4, 3.0, t), lerp(-3.4, -9.2, t)], b = [lerp(-3.4, -5.0, t), lerp(1.0, -9.6, t)];
    x.beginPath(); x.moveTo(a[0], a[1]); x.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.2, b[0], b[1]);
    x.strokeStyle = fold; x.lineWidth = 0.32; x.stroke();
  }
  if (o.tband) { lin(x, [[5.4, -4.6], [1.0, -3.9], [-2.6, -2.2], [-5.0, -0.8]], o.tband, 1.1); lin(x, [[5.4, -4.6], [1.0, -3.9], [-2.6, -2.2], [-5.0, -0.8]], C.goldL, 0.3, 0.8); }
  x.restore();
  lin(x, T, OUT, 0.32, 1, true);
  if (o.jewel) {
    fo(x, [[4.2, -7.6], [5.0, -6.4], [4.2, -5.0], [3.4, -6.4]], C.gold, 0.22);
    dot(x, 4.2, -6.4, 0.45, '#b3142a');
  }
  if (o.plume) {
    x.beginPath(); x.moveTo(3.6, -8.2); x.bezierCurveTo(3.4, -11.5, 1.6, -13.6, -1.6, -14.6);
    x.strokeStyle = '#1b1411'; x.lineWidth = 0.55; x.stroke();
    for (let k = 0; k < 5; k++) { const t = 0.3 + k * 0.15; const px = lerp(3.4, -1.4, t), py = lerp(-9, -14.2, t); lin(x, [[px, py], [px - 1.2, py + 0.6]], '#1b1411', 0.25); }
    if (o.pearls) for (let k = 0; k < 4; k++) dot(x, lerp(4.8, -2.6, k / 3), lerp(-5.4, -1.6, k / 3) + 0.1, 0.42, '#fffaf0');
  }
}

/** One arm: tube sleeve from the shoulder through the elbow to the hand; hand blob; optional finger. */
function armPaint(x, sh, e, h, cloth, skin, o = {}) {
  const el = [sh[0] + e[0], sh[1] + e[1]], hd = [sh[0] + h[0], sh[1] + h[1]];
  const wr = [lerp(el[0], hd[0], 0.84), lerp(el[1], hd[1], 0.84)];
  tube(x, [sh, el, wr], o.w ?? 3.4, cloth, 0.3);
  // sleeve wrinkles and a gold cuff
  const m = [lerp(el[0], wr[0], 0.5), lerp(el[1], wr[1], 0.5)];
  const dxv = wr[0] - el[0], dyv = wr[1] - el[1], L = Math.hypot(dxv, dyv) || 1, nx = -dyv / L, ny = dxv / L;
  lin(x, [[m[0] - nx * 1.4, m[1] - ny * 1.4], [m[0] + nx * 1.2 + dxv / L * 0.6, m[1] + ny * 1.2 + dyv / L * 0.6]], OUT, 0.2, 0.5);
  lin(x, [[wr[0] - nx * 1.6, wr[1] - ny * 1.6], [wr[0] + nx * 1.6, wr[1] + ny * 1.6]], o.cuff || C.gold, 0.55);
  const a = Math.atan2(hd[1] - wr[1], hd[0] - wr[0]);
  x.beginPath(); x.ellipse(hd[0], hd[1], 1.55, 1.15, a, 0, TAU); x.fillStyle = skin; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke();
  if (o.finger) lin(x, [hd, [hd[0] + o.finger[0], hd[1] + o.finger[1]]], skin, 0.75);
  if (o.ring) dot(x, hd[0] + Math.cos(a) * 0.6, hd[1] + Math.sin(a) * 0.6, 0.45, '#b3142a');
  return hd;
}

const ARMS = {
  fold: [[3.2, 12.4], [8.6, 19.4]], foldF: [[2.0, 12.6], [7.6, 19.0]],
  hip: [[-5.2, 9.2], [-1.6, 17.2]], down: [[1.0, 13.5], [1.8, 26]],
  throw: [[3.6, -11], [7.6, -24.5]], present: [[6.2, 10], [14, 12]], presentF: [[5.2, 11], [13, 13]],
  point: [[8.2, -1.2], [17.5, -5]], fan: [[6.6, 4.4], [9.6, -6.2]], tray: [[6.2, 9.4], [13.6, 7.8]], trayF: [[5.2, 9.8], [12.6, 8.4]],
  fist: [[7.2, 3.6], [17.6, -3.6]], beard: [[6.4, 9], [4.6, -7.4]], rose: [[6.8, 6.8], [5.2, -10.6]], sill: [[5.2, 12], [12.6, 18.4]],
  bless: [[8.4, -6], [10.4, -21]], spear: [[6, 7], [9.6, 1.4]], up: [[5.6, -9.6], [8.4, -23]], upF: [[3.6, -9.8], [5.2, -22.6]],
};

/** A standing courtier. sp: costume; st: { arm, far, head (±1 rel. to body), tilt, prop } */
function standing(x, sp, st) {
  const jama = sp.jama || C.white;
  const dJ = mixHex(jama, '#3a2a20', 0.2);
  const skin = sp.skin || C.skin;
  const dir = st.head ?? 1;
  const hc = [HC[0], HC[1]];
  // the far arm (behind the body)
  const FA = st.far === 'fist' ? ARMS.fist : st.far === 'tray' ? ARMS.trayF : st.far === 'present' ? ARMS.presentF : st.far === 'down' ? ARMS.down : st.far === 'up' ? ARMS.upF : ARMS.foldF;
  const farHand = armPaint(x, SH_F, FA[0], FA[1], dJ, sp.skin ? mixHex(skin, '#000000', 0.1) : C.skinD, { cuff: sp.cuff, w: 3.2 });
  if (st.far === 'fist') {
    // the falconer's gauntlet
    const el = [SH_F[0] + FA[0][0], SH_F[1] + FA[0][1]];
    tube(x, [[lerp(el[0], farHand[0], 0.35), lerp(el[1], farHand[1], 0.35)], farHand], 3.6, '#8a5a32', 0.3);
    dot(x, farHand[0] + 0.6, farHand[1], 2.1, '#8a5a32'); ring(x, farHand[0] + 0.6, farHand[1], 2.1, OUT, 0.25);
  }
  if (sp.sword) {
    tube(x, [[-4, -47], [-11, -34], [-17, -24]], 1.6, '#3a2a20', 0.25);
    lin(x, [[-4, -47], [-11, -34], [-17, -24]], C.gold, 0.35, 0.8);
    fo(x, [[-3.2, -50.5], [-1.6, -52.8], [-0.2, -51], [-2, -48.6]], C.gold, 0.25);
  }
  // trousers (striped) and slippers
  const tr = sp.trousers || '#b83a2c';
  const legB = [[-5.4, -42], [-0.6, -42], [-3.2, -3.4], [-7.4, -3.4]], legF = [[-0.6, -42], [4.6, -42], [6.6, -3.4], [2.4, -3.4]];
  for (const lg of [legB, legF]) {
    fo(x, lg, lg === legB ? mixHex(tr, '#000000', 0.15) : tr, 0.3);
    x.save(); clipP(x, lg);
    for (let yy = -42; yy < 0; yy += 2.2) lin(x, [[-9, yy + 2], [8, yy - 1]], C.goldL, 0.3, 0.75);
    x.restore();
  }
  const shoe = (x0, col) => fo(x, [[x0, -3.6], [x0 + 4.6, -3.6], [x0 + 7.6, -2.4], [x0 + 9.4, -3.8], [x0 + 8.6, -1.2], [x0 + 6, 0], [x0, 0]], col, 0.28);
  shoe(-8.4, sp.shoes || '#9a2a1a'); shoe(1.6, sp.shoes || '#b43a22');
  // the muslin skirt of the jama: chakdar points, transparent, gold hem
  const hem = [[19, -12.4], [16, -15.2], [12, -12.2], [7.5, -15.4], [2.6, -11.6], [-2.5, -15.6], [-7.4, -12], [-12, -16.2], [-17, -13]];
  const skirt = [[-5.8, -50], [6.2, -50], [9.6, -38], [15, -24], ...hem, [-14, -24], [-9.2, -38]];
  fil(x, skirt, jama, sp.muslin ?? 0.8);
  x.save(); clipP(x, skirt);
  for (let k = 0; k < 9; k++) { const t = k / 8; lin(x, [[lerp(-5, 5.4, t), -49], [lerp(-15, 17, t), -13]], dJ, 0.3, 0.5); }
  x.restore();
  lin(x, skirt, OUT, 0.3, 0.9, true);
  lin(x, hem, sp.hem || C.gold, 0.6);
  // bodice
  const torso = [[-5.8, -50], [6.2, -50], [7.6, -58], [7.8, -65], [5.4, -72.4], [2.0, -74.6], [-2.6, -74.6], [-5.6, -71.6], [-6.6, -64], [-6.2, -56]];
  fo(x, torso, jama, 0.32);
  const sg = x.createLinearGradient(-6.6, 0, 7.8, 0);
  sg.addColorStop(0, 'rgba(60,40,30,0.18)'); sg.addColorStop(0.6, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(60,40,30,0.1)');
  pth(x, torso); x.fillStyle = sg; x.fill();
  // side-tied crossover and its ties
  x.beginPath(); x.moveTo(3.6, -74.2); x.quadraticCurveTo(-1.8, -68, -4.2, -59.6); x.strokeStyle = sp.hem || C.gold; x.lineWidth = 0.55; x.stroke();
  x.beginPath(); x.moveTo(3.6, -74.2); x.quadraticCurveTo(-1.8, -68, -4.2, -59.6); x.strokeStyle = rgba(OUT, 0.4); x.lineWidth = 0.2; x.stroke();
  for (const dy of [0, 3]) { x.beginPath(); x.ellipse(-4.6, -61 + dy, 1.2, 0.6, 0.5, 0, TAU); x.strokeStyle = sp.hem || C.gold; x.lineWidth = 0.4; x.stroke(); }
  // pearls / necklace for nobles
  if (sp.pearls) for (let k = 0; k < 9; k++) { const t = k / 8; dot(x, lerp(-1.4, 5.6, t), -73.6 + Math.sin(t * Math.PI) * 6.5, 0.55, '#fffaf0'); }
  // the patka (sash): wrap, then the long patterned end
  const sash = sp.sash || C.saffron;
  fo(x, [[-6.3, -52.6], [6.7, -52.6], [6.6, -47.8], [-6.0, -47.8]], sash, 0.3);
  const endP = [[2.0, -49], [6.8, -49], [8.6, -24.6], [3.4, -24.6]];
  fo(x, endP, sash, 0.3);
  x.save(); clipP(x, endP);
  for (let yy = -46; yy < -24; yy += 4.2) { lin(x, [[0, yy], [10, yy + 0.2]], C.gold, 0.6); for (let px = 3; px < 9; px += 1.6) dot(x, px + (yy % 2), yy + 2.1, 0.38, sp.sash2 || C.verm); }
  x.restore();
  for (let px = 3.6; px < 8.6; px += 0.9) lin(x, [[px, -24.6], [px + 0.2, -22.6]], C.gold, 0.3);
  // neck
  fo(x, [[0.6, -74], [4.0, -74], [4.3, -79.6], [0.8, -80]], skin, 0.25);
  // head
  x.save(); x.translate(hc[0], hc[1]); x.scale(dir, 1); x.rotate(-(st.tilt || 0));
  headPaint(x, { skin, turban: sp.turban, tband: sp.tband, beard: sp.beard, plume: sp.plume, jewel: sp.jewel, pearls: sp.pearls, lady: sp.lady, veil: sp.veil, wide: st.wide, mouthO: st.mouthO });
  x.restore();
  // near arm (over the body)
  const arm = st.arm || 'fold';
  let e, h, fing = null;
  if (arm === 'lips') {
    const mouth = [hc[0] + dir * 4.0, hc[1] + 4.2];
    h = [mouth[0] - SH_N[0] + dir * 0.6, mouth[1] - SH_N[1] + 1.4];
    e = [6.8, 8.6];
    fing = [dir * 0.8, -2.2];
  } else if (arm === 'rose') {
    h = [hc[0] + dir * 6.4 - SH_N[0], hc[1] + 3.2 - SH_N[1]]; e = [7.4, 7.2];
  } else [e, h] = ARMS[arm] || ARMS.fold;
  const hand = armPaint(x, SH_N, e, h, jama, skin, { cuff: sp.cuff, finger: fing, ring: sp.rings });
  if (arm === 'rose' || st.prop === 'rose') {
    const p = arm === 'rose' ? [hand[0] + dir * 0.6, hand[1] - 1.6] : [hand[0] + 1, hand[1] - 1.2];
    lin(x, [hand, [p[0], p[1] + 1]], '#3e6b3a', 0.35);
    dot(x, p[0], p[1], 1.4, '#d8576e'); dot(x, p[0] - 0.3, p[1] - 0.3, 0.6, '#f2a5b5');
  }
  if (arm === 'throw') for (const [dx, dy] of [[1.4, -1.6], [-1.2, -2.6], [0.2, -3.6]]) { dot(x, hand[0] + dx, hand[1] + dy, 0.9, '#e2bf5e'); ring(x, hand[0] + dx, hand[1] + dy, 0.9, C.goldD, 0.2); }
  if (arm === 'bless') { for (let k = 0; k < 4; k++) lin(x, [[hand[0], hand[1] - 0.6], [hand[0] - 1.2 + k * 0.8, hand[1] - 3.2]], skin, 0.55); dot(x, hand[0] - 0.4, hand[1] - 1.8, 0.4, '#1b8a5a'); dot(x, hand[0] + 0.6, hand[1] - 1.4, 0.4, '#b3142a'); }
  if (st.prop === 'tray') {
    const c = [hand[0] - 0.6, hand[1] - 1.2];
    fo(x, [[c[0] - 8, c[1]], [c[0] + 8, c[1]], [c[0] + 6, c[1] + 1.6], [c[0] - 6, c[1] + 1.6]], C.gold, 0.3);
    for (let k = 0; k < 7; k++) { const px = c[0] - 5 + k * 1.7, py = c[1] - 0.8 - (k % 3) * 0.9; dot(x, px, py, 1.0, '#e2bf5e'); ring(x, px, py, 1.0, C.goldD, 0.2); }
  }
  if (st.prop === 'spear') {
    lin(x, [[hand[0] + 0.4, hand[1] + 60], [hand[0] - 0.4, hand[1] - 40]], '#4a3322', 0.9);
    fo(x, [[hand[0] - 0.4, hand[1] - 40], [hand[0] - 2.2, hand[1] - 45], [hand[0] - 0.6, hand[1] - 52], [hand[0] + 1.2, hand[1] - 45]], '#c9ccd1', 0.3);
    dot(x, hand[0] - 0.4, hand[1] - 39, 1.0, '#c63b25');
  }
  return { hand, farHand };
}

/** A seated musician on the carpet (origin at the seat, facing +x). st: { inst, play: 'A'|'B'|'stop'|'look'|'gA'|'gB' } */
function seated(x, sp, st) {
  const jama = sp.jama, dJ = mixHex(jama, '#3a2a20', 0.2), skin = sp.skin || C.skin;
  const look = st.play === 'look' || st.play === 'stop';
  const g = st.play === 'gA' || st.play === 'gB';
  const sway = st.play === 'gA' ? 0.08 : st.play === 'gB' ? -0.06 : 0;
  x.save(); x.rotate(sway);
  const hc = [2.6, -47.4];
  const SHn = [1.6, -36.4], SHf = [-1.2, -37];
  // instrument parts behind the body
  if (st.inst === 'bin') {
    dot(x, -6.6, -46, 6.6, '#b07a3e'); ring(x, -6.6, -46, 6.6, OUT, 0.35);
    x.save(); x.beginPath(); x.arc(-6.6, -46, 6.6, 0, TAU); x.clip();
    for (let k = -3; k <= 3; k++) lin(x, [[-6.6 + k * 2.2, -53], [-6.6 + k * 1.6, -39]], '#8a5a2a', 0.35, 0.8);
    x.restore();
  }
  // far arm
  const play = st.play;
  let fE, fH;
  if (st.inst === 'bin') { fE = [3.2, 4.4]; fH = look ? [6.8, 8] : [7.6, 2.6 + (play === 'B' || play === 'gB' ? -1.8 : 0)]; }
  else { fE = [5.4, 9]; fH = look ? [10.6, 14.4] : play === 'B' || play === 'gB' ? [9.2, 9.6] : [7.4, 22.6]; }
  armPaint(x, SHf, fE, fH, dJ, C.skinD, { w: 3.0 });
  // folded legs under the spread skirt
  const lap = [[-15.5, 0], [17.5, 0], [17.8, -3.2], [12, -8.4], [3, -11.4], [-7.6, -12.2], [-14.2, -7.4]];
  fo(x, lap, jama, 0.3);
  x.save(); clipP(x, lap);
  for (let k = 0; k < 7; k++) lin(x, [[-12 + k * 4.4, -10], [-14 + k * 5, 0]], dJ, 0.3, 0.6);
  x.restore();
  fo(x, [[13.6, -2.6], [19.4, -2.2], [21.6, -3.6], [20.6, -0.6], [14.2, 0]], sp.shoes || '#9a2a1a', 0.25);
  lin(x, [[-15.5, 0], [17.5, 0]], sp.hem || C.gold, 0.5);
  // torso
  const torso = [[-6.4, -11.4], [7.6, -10.6], [8.2, -21], [7.4, -29], [5.2, -36.2], [1.8, -38.6], [-2.8, -38.6], [-5.8, -35.6], [-7.2, -27], [-7.2, -18]];
  fo(x, torso, jama, 0.32);
  x.beginPath(); x.moveTo(3.6, -38.2); x.quadraticCurveTo(-1.8, -32, -4.4, -23); x.strokeStyle = sp.hem || C.gold; x.lineWidth = 0.5; x.stroke();
  fo(x, [[-6.8, -15.6], [7.9, -15.2], [7.8, -11.2], [-6.5, -11.4]], sp.sash, 0.3);
  fo(x, [[0.6, -38], [4.0, -38], [4.3, -43.4], [0.8, -43.8]], skin, 0.25);
  x.save(); x.translate(hc[0], hc[1]); x.rotate(-(look ? 0.34 : st.play === 'stop' ? 0.2 : g ? 0.05 : 0)); headPaint(x, { skin, turban: sp.turban, beard: sp.beard, tband: sp.tband, mouthO: st.play === 'stop' }); x.restore();
  // the instrument in front, then the near arm
  if (st.inst === 'bin') {
    const U = [-7.4, -50.6], D = [18.6, -8.6];
    tube(x, [U, D], 2.0, '#3b2414', 0.3);
    for (let k = 1; k < 14; k++) { const t = k / 14; const p = [lerp(U[0], D[0], t), lerp(U[1], D[1], t)]; lin(x, [[p[0] - 0.9, p[1] - 1.1], [p[0] + 0.9, p[1] + 1.1]], C.gold, 0.35); }
    lin(x, [[U[0] + 0.5, U[1] - 0.8], [D[0] + 0.5, D[1] - 0.8]], '#e8e2d4', 0.18, 0.9);
    dot(x, 15.6, -7.2, 7.2, '#b07a3e'); ring(x, 15.6, -7.2, 7.2, OUT, 0.35);
    x.save(); x.beginPath(); x.arc(15.6, -7.2, 7.2, 0, TAU); x.clip();
    for (let k = -3; k <= 3; k++) lin(x, [[15.6 + k * 2.3, -15], [15.6 + k * 1.7, 0]], '#8a5a2a', 0.35, 0.8);
    const gg = x.createRadialGradient(13.6, -9.4, 0.5, 15.6, -7.2, 7.4); gg.addColorStop(0, 'rgba(255,230,180,0.4)'); gg.addColorStop(1, 'rgba(60,30,10,0.3)');
    x.fillStyle = gg; x.fillRect(8, -15, 16, 16);
    x.restore();
    fo(x, [[U[0] - 1.4, U[1] - 1.6], [U[0] + 1.6, U[1] - 2.6], [U[0] + 1.2, U[1] + 0.6]], C.gold, 0.25);
    const nh = look ? [9.4, 13.6] : play === 'A' ? [10.2, 17.6] : play === 'B' ? [12.2, 15.2] : play === 'gA' ? [9.6, 19.4] : [13.6, 13.4];
    armPaint(x, SHn, [5.4, 10.6], nh, jama, skin, { finger: look ? null : [1.6, 0.6] });
  } else {
    // pakhawaj: barrel drum across the lap
    const cy = -16.2;
    const barrel = [[-3.6, cy - 4.6], [8, cy - 6.6], [19.6, cy - 4.6], [19.6, cy + 4.6], [8, cy + 6.6], [-3.6, cy + 4.6]];
    fo(x, smoothLoop(barrel, 3), '#8a3a22', 0.35);
    for (let k = 0; k < 9; k++) { const t = k / 8; lin(x, [[lerp(-3, 19, t), cy - 5.6 + Math.abs(t - 0.5) * 2], [lerp(-3, 19, t) + (k % 2 ? 2.4 : -2.4), cy + 5.6 - Math.abs(t - 0.5) * 2]], '#e9dcc0', 0.35, 0.85); }
    for (const ex of [-3.6, 19.6]) { x.beginPath(); x.ellipse(ex, cy, 1.6, 4.8, 0, 0, TAU); x.fillStyle = '#efe4cf'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke(); dot(x, ex, cy, 1.1, '#2a201a'); }
    const up = play === 'B' || play === 'gB';
    const nh = look ? [12, 14] : up ? [19.6, 15.6 - (g ? 6 : 3)] : [19.2, 20.6];
    armPaint(x, SHn, [7.6, 10.8], nh, jama, skin);
  }
  x.restore();
}

/** The gardener seen from directly above. Origin = middle of his back; he kneels facing −y. st: { pose: 'A'|'B'|'up'|'upR' } */
function gardenerTop(x, st) {
  const cloth = '#e0b260', dC = '#b98a40', skin = '#c48c5e', turban = '#f4efe3';
  const up = st.pose === 'up' || st.pose === 'upR';
  // soles of the folded feet, the back of the jama, the sash
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 4.6, 15.2, 1.9, 3.1, s * 0.2, 0, TAU); x.fillStyle = '#9c6a46'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke(); }
  x.beginPath(); x.ellipse(0, 9.4, 10, 7.4, 0, 0, TAU); x.fillStyle = dC; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
  x.beginPath(); x.ellipse(0, 1.4, 8.8, 10.4, 0, 0, TAU); x.fillStyle = cloth; x.fill(); x.stroke();
  lin(x, [[0, -6], [0.4, 3], [0, 10.4]], dC, 0.4);
  fo(x, [[-8.4, 6.2], [8.4, 6.2], [8, 8.4], [-8, 8.4]], C.verm, 0.25);
  // arms
  let hl, hr;
  if (st.pose === 'A') { hl = [-3.2, -17.4]; hr = [3.4, -17]; }
  else if (st.pose === 'B') { hl = [-2.6, -21.6]; hr = [2.8, -21.2]; }
  else if (st.pose === 'up') { hl = [-15, -12.4]; hr = [15, -12.4]; }
  else { hl = [-12.6, -6]; hr = [17.6, -11]; }
  for (const [s, hnd] of [[-1, hl], [1, hr]]) {
    const sh = [s * 8.2, -5.6], el = [lerp(sh[0], hnd[0], 0.5) + s * 3.2, lerp(sh[1], hnd[1], 0.5) + 1];
    tube(x, [sh, el, hnd], 3.3, cloth, 0.3);
    dot(x, hnd[0], hnd[1], 1.6, skin); ring(x, hnd[0], hnd[1], 1.6, OUT, 0.25);
    if (up) for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + s * 0.4 + (k - 1.5) * 0.35; lin(x, [hnd, [hnd[0] + Math.cos(a) * 2.6, hnd[1] + Math.sin(a) * 2.6]], skin, 0.6); }
  }
  // shoulders
  x.beginPath(); x.ellipse(0, -5.4, 10.6, 4.8, 0, 0, TAU); x.fillStyle = cloth; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
  // the khurpi (hand hoe)
  if (!up) {
    const hm = [(hl[0] + hr[0]) / 2, (hl[1] + hr[1]) / 2];
    lin(x, [[hm[0], hm[1] + 1], [hm[0], hm[1] - 4]], '#7a5232', 1.1);
    fo(x, [[hm[0] - 2.4, hm[1] - 4], [hm[0] + 2.4, hm[1] - 4], [hm[0] + 1.4, hm[1] - 8.4], [hm[0] - 1.4, hm[1] - 8.4]], '#8d939b', 0.3);
  } else {
    lin(x, [[7, -24], [10, -28]], '#7a5232', 1.1);
    fo(x, [[9.6, -28.6], [12.4, -26.8], [13.6, -30.6], [11, -31.6]], '#8d939b', 0.3);
  }
  // head: the turban crown from above … or his face, turned up to us
  if (!up) {
    dot(x, 0, -9.6, 6.0, turban); ring(x, 0, -9.6, 6.0, OUT, 0.32);
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(0.3 * k, -9.6 - 0.2 * k, 5.4 - k * 1.3, 0.2 + k * 0.9, 0.2 + k * 0.9 + 4.4); x.strokeStyle = '#b9ae98'; x.lineWidth = 0.35; x.stroke(); }
    dot(x, 0.4, -9.8, 0.9, '#d8cfbc');
  } else {
    x.save(); x.translate(0, -10.2); x.rotate(st.pose === 'upR' ? 0.75 : 0);
    // turban seen edge-on behind his upturned face, then the face (chin toward −y, forehead toward +y)
    x.beginPath(); x.ellipse(0, 2.2, 7.2, 5.4, 0, -0.15, Math.PI + 0.15); x.fillStyle = turban; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
    for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(0, 2.6 + k * 0.8, 6.6 - k * 0.4, 4 - k * 0.6, 0, 0.2, Math.PI - 0.2); x.strokeStyle = '#b9ae98'; x.lineWidth = 0.3; x.stroke(); }
    x.beginPath(); x.ellipse(0, -0.6, 4.6, 5.6, 0, 0, TAU); x.fillStyle = skin; x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.32; x.stroke();
    x.beginPath(); x.ellipse(0, -3.2, 4.4, 3.4, 0, Math.PI, TAU); x.fillStyle = '#2a1f19'; x.fill();         // beard (at the chin end)
    dot(x, 0, -4.4, 0.85, '#4a1c14');                                                                          // open mouth
    for (const s of [-1, 1]) { ell(x, s * 1.9, 0.6, 1.25, 0.95, 0, '#fbf7ee'); dot(x, s * 1.9, 0.2, 0.55, '#1d1511'); lin(x, [[s * 0.9, 2.1], [s * 3.0, 1.9]], '#1d1511', 0.35); }
    fo(x, [[-0.7, -1.4], [0.7, -1.4], [0, -2.9]], mixHex(skin, '#000000', 0.12), 0.2);                       // nose, seen from below
    x.restore();
  }
}

/** The falcon on the fist (origin at its feet, facing +x). st.head: ±1 */
function falcon(x, headDir, bate) {
  const slate = '#5a6372', cream = '#efe4cf';
  if (bate) {
    // the falcon bates: both wings flung up and open
    for (const [w, col] of [[[[-1.5, -11], [-9, -20], [-16, -24], [-13, -18], [-15, -14], [-6, -8]], '#4b5262'], [[[1, -11], [5, -24], [3, -32], [0, -26], [-3, -27], [-2, -10]], '#5f6878']]) {
      fo(x, w, col, 0.3);
      for (let k = 1; k < 4; k++) lin(x, [w[0], w[k + 1]], '#2e333d', 0.25, 0.8);
    }
  }
  for (const s of [-1, 1]) lin(x, [[s * 0.8, 0], [s * 1.6, 4.6], [s * 1.2, 7.4]], '#7a4a28', 0.55);
  dot(x, -1.2, 7.6, 0.8, C.gold);
  fo(x, [[-1.8, -1], [-3.6, 3.2], [-2.6, 6.6], [-0.8, 4], [0.4, -1]], '#6c7484', 0.3);
  const body = [[-2.6, -1], [-4.2, -6.6], [-3, -12], [0.6, -14.2], [3.6, -12.4], [4.4, -7.2], [2.4, -1.6]];
  fo(x, body, cream, 0.32);
  x.save(); clipP(x, body);
  for (let yy = -11; yy < -1; yy += 1.6) lin(x, [[0, yy], [4.6, yy + 0.4]], '#6a5a4a', 0.35, 0.85);
  x.restore();
  fo(x, [[-2.8, -1.6], [-4.4, -7], [-3, -12.4], [-0.4, -13.6], [0.8, -9], [-0.4, -2.6]], slate, 0.3);
  for (let k = 0; k < 4; k++) lin(x, [[-3.6 + k * 0.6, -11 + k * 2.4], [-0.6 + k * 0.4, -10 + k * 2.4]], '#3c4350', 0.3);
  for (const s of [-1, 1]) lin(x, [[s * 0.8 + 0.4, -1.4], [s * 0.8 + 0.6, 0.2]], '#e2b43a', 0.7);
  x.save(); x.translate(0.6, -15.6); x.scale(headDir, 1);
  dot(x, 0, 0, 3.0, cream); ring(x, 0, 0, 3.0, OUT, 0.3);
  fil(x, [[-3, 0.4], [-2.6, -2], [0, -3.1], [2.6, -2], [2.2, -0.6], [0.2, -0.8]], slate);
  fil(x, [[1.0, -0.4], [1.8, -0.6], [1.6, 2.6], [0.8, 2.4]], '#3c4350');
  dot(x, 1.4, -0.9, 0.85, '#1a1412'); ring(x, 1.4, -0.9, 0.95, '#e2b43a', 0.3);
  fo(x, [[2.4, -0.8], [4.4, -0.1], [3.8, 1.4], [2.8, 0.8]], '#e2b43a', 0.25);
  fil(x, [[3.8, -0.1], [4.6, 0.6], [3.6, 1.6]], '#2a2420');
  x.restore();
}

/** The peacock on the wall top (origin at its feet, facing +x). st.head: ±1 rel. */
const OCELLI = [[-6, 18], [-12, 30], [-4, 34], [-14, 46], [-6, 50], [-15, 62], [-7, 66], [-12, 79], [-5, 82], [-10, 93], [-2, 22], [1, 46], [0, 70]];
function peacock(x, headDir) {
  // the train hanging down the wall face
  const train = [[-6, -6], [-1, -6], [3, 20], [5, 52], [4, 84], [-1, 100], [-10, 100], [-18, 84], [-20, 52], [-16, 20]];
  const tp = smoothLoop(train, 4);
  fo(x, tp, '#2f6a4a', 0.4);
  x.save(); clipP(x, tp);
  for (let k = 0; k < 26; k++) { const t = k / 25; lin(x, [[-3.5, -6], [lerp(-22, 6, t), 104]], '#b2903e', 0.35, 0.8); }
  for (const [ox, oy] of OCELLI) {
    ell(x, ox, oy, 3.0, 3.9, 0, '#c99a3a'); ell(x, ox, oy + 0.2, 2.3, 3.0, 0, '#2f8a5a'); ell(x, ox, oy + 0.3, 1.5, 2.0, 0, '#2552a6'); ell(x, ox, oy + 0.5, 0.8, 1.05, 0, '#101a40');
  }
  x.restore();
  // legs, body, folded cinnamon wing
  lin(x, [[-1, -4], [-1.4, 0]], '#7d6f62', 0.7); lin(x, [[2, -4], [2.4, 0]], '#7d6f62', 0.7);
  const body = [[-9, -6], [-5, -14], [2, -16.6], [7.6, -14], [9, -9], [5.6, -4.4], [-3, -3.6]];
  fo(x, smoothLoop(body, 3), '#1e5f92', 0.35);
  const wing = [[-8.6, -6.6], [-3, -14], [4.4, -13], [2.4, -6.6]];
  fo(x, smoothLoop(wing, 3), '#b4824e', 0.3);
  for (let k = 0; k < 5; k++) lin(x, [[-6 + k * 2.2, -12], [-5.6 + k * 2, -7.4]], '#5a3a22', 0.35);
  // neck and head
  x.save(); x.translate(6.6, -14.6); x.scale(headDir, 1);
  const neck = [[-2.4, 0.6], [2.6, 0.6], [3.4, -8], [3.0, -14], [0.2, -14.6], [-0.4, -8]];
  fo(x, smoothLoop(neck, 3), '#1f6ea8', 0.35);
  x.save(); clipP(x, smoothLoop(neck, 3)); for (let yy = -13; yy < 0; yy += 1.4) for (let xx = -2; xx < 4; xx += 1.4) dot(x, xx + (yy % 2), yy, 0.35, '#3fa0c8', 0.8); x.restore();
  dot(x, 2.0, -16, 2.5, '#1f6ea8'); ring(x, 2.0, -16, 2.5, OUT, 0.3);
  lin(x, [[1.6, -16.6], [4.0, -16.6]], '#f7f2e6', 0.6);
  dot(x, 2.8, -16.4, 0.5, '#1a1412');
  fo(x, [[4.2, -16.6], [6.4, -15.6], [4.2, -15]], '#c9b9a0', 0.2);
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 - 0.5 + k * 0.22; const e = [1.4 + Math.cos(a) * 5.4, -18 + Math.sin(a) * 5.4]; lin(x, [[1.4, -18], e], '#2a3a4a', 0.25); dot(x, e[0], e[1], 0.6, '#2c7fb5'); }
  x.restore();
}

// ------------------------------------------------------------------ the cast and its pose states
const beatOf = (u) => Math.floor(u * 2 + 1e-6);
const q4 = (u) => Math.floor(u * 4 + 1e-6) / 4;
const bbX = (u) => PROF.x(clamp(u, -8, 14));
const headX = (u) => bbX(u) + 80;
/** world direction from x toward the pelican's head at time u (after it has left: +1) */
const toward = (x, u) => (u >= 6 ? 1 : headX(u) >= x ? 1 : -1);

const COST = {
  t1: { jama: '#f4efe2', sash: '#e59aa6', sash2: C.lapis, turban: C.saffron, tband: C.gold, beard: 'full', jewel: true, trousers: '#b83a2c' },
  t2: { jama: '#cfe0c4', sash: C.gold, sash2: C.verm, turban: '#f4efe2', tband: C.verm, beard: 'grey', trousers: '#c45a3a', skin: '#d9a982' },
  t3: { jama: '#f0c27a', sash: C.mal, sash2: C.gold, turban: '#e59aa6', tband: C.gold, beard: 'mous', sword: true, trousers: '#7d2a2a', skin: '#cf9a6c' },
  t4: { jama: '#9db7de', sash: C.verm, sash2: C.gold, turban: '#f4efe2', tband: C.lapis, beard: 'full', trousers: '#b83a2c' },
  fb: { jama: '#f4efe2', sash: C.verm, sash2: C.gold, turban: C.verm, tband: C.gold, beard: 'mous', trousers: '#2f7d5b', skin: '#c28a5c' },
  n1: { jama: '#f6f1e6', sash: C.lapis, sash2: C.gold, turban: '#7fb38f', tband: C.gold, beard: 'full', jewel: true, plume: true, pearls: true, sword: true, trousers: '#c63b25', rings: true },
  s1: { jama: '#e8b4b8', sash: C.gold, sash2: C.mal, turban: '#f4efe2', beard: 'mous', trousers: '#5a6a9a', skin: '#c28a5c' },
  fc: { jama: '#c9d6a8', sash: '#b07a3e', sash2: C.verm, turban: '#d8a447', tband: C.verm, beard: 'full', trousers: '#7d2a2a', skin: '#c28a5c' },
  emp: { jama: '#f8f4ea', sash: C.gold, sash2: C.verm, turban: '#f2d58a', tband: C.verm, beard: 'mous', jewel: true, plume: true, pearls: true, rings: true, skin: '#dcae84', cuff: C.goldL },
  ladyA: { lady: true, jama: '#f3c5cc', sash: C.gold, veil: '#f6b9c6', skin: '#e3b791' },
  ladyB: { lady: true, jama: '#cfe0c4', sash: C.gold, veil: '#f7e3a3', skin: '#e0b38c' },
  guard: { jama: '#d9c9a0', sash: C.verm, turban: '#8f2a1c', tband: '#f4efe2', beard: 'full', skin: '#bb8457' },
  pk1: { jama: '#f4efe2', sash: C.saffron, turban: '#cfe0c4', tband: C.gold, beard: 'full', skin: '#cf9a6c' },
  pk2: { jama: '#f3c5cc', sash: C.mal, turban: '#f4efe2', tband: C.verm, beard: 'mous' },
  pk3: { jama: '#f0c27a', sash: C.lapis, turban: C.verm, tband: C.gold, beard: 'grey', skin: '#d9a982' },
  m1: { jama: '#f4efe2', sash: C.verm, turban: C.saffron, tband: C.gold, beard: 'full', hem: C.gold, skin: '#c99063' },
  m2: { jama: '#cfe0c4', sash: C.gold, turban: '#f4efe2', tband: C.verm, beard: 'mous', hem: C.gold, skin: '#bf8458' },
};

/** generic onlooker standing at world x, body facing f (toward the emperor); at 2.0 the whole figure spins to the pelican */
function onlooker(o) {
  return (u) => {
    const q = q4(u), b = beatOf(u);
    if (q < 2) return { f: o.f, arm: o.calm[Math.floor((b + (o.ph || 0)) / 4) % o.calm.length], far: o.calmFar || 'fold', tilt: 0.05 * ((b + (o.ph || 0)) % 2) };
    const f = toward(o.x, Math.min(q, 6.25));
    let arm = o.react || 'lips', far = o.reactFar || 'fold';
    if (o.nisar && q >= 2.5 && q < 3.75) { arm = o.nisar; far = 'fold'; }
    else if (q >= 3.75) { arm = o.after || 'fold'; far = 'fold'; }
    return { f, arm, far, tilt: q < 4 ? -0.08 : 0, wide: q < 3 };
  };
}

function buildCast() {
  const cast = [];
  const add = (c) => cast.push({ s: 1, f: 1, layer: 'mid', ...c });
  const stdBox = [-40, -118, 40, 4];
  // ---- terrace (all stand on the floor, y 599); they face the jharokha until the pelican arrives
  add({ id: 't1', x: 664, y: 599, s: 1.0, box: stdBox, paint: (x, st) => standing(x, COST.t1, st), state: onlooker({ x: 664, f: 1, calm: ['fold', 'fold', 'beard'], ph: 0, react: 'lips', after: 'fold' }) });
  add({ id: 't2', x: 708, y: 599, s: 1.0, box: stdBox, paint: (x, st) => standing(x, COST.t2, st), state: onlooker({ x: 708, f: 1, calm: ['present', 'fold'], calmFar: 'present', ph: 2, react: 'point', nisar: 'throw', after: 'fold' }) });
  add({ id: 't3', x: 752, y: 599, s: 1.0, box: stdBox, paint: (x, st) => standing(x, COST.t3, st), state: onlooker({ x: 752, f: 1, calm: ['hip', 'fold'], ph: 1, react: 'up', reactFar: 'up', nisar: 'throw', after: 'hip' }) });
  add({ id: 'fb', x: 866, y: 599, s: 1.0, box: stdBox, paint: (x, st) => standing(x, COST.fb, st), state: (u) => { const s = onlooker({ x: 866, f: -1, calm: ['fan'] })(u); return { ...s, arm: 'fan', far: q4(u) >= 2 && q4(u) < 3.75 ? 'up' : 'fold' }; } });
  add({ id: 't4', x: 918, y: 599, s: 1.0, box: stdBox, paint: (x, st) => standing(x, COST.t4, st), state: onlooker({ x: 918, f: -1, calm: ['fold', 'rose'], ph: 3, react: 'up', reactFar: 'up', nisar: 'throw', after: 'point' }) });
  // ---- below the terrace: a noble and his servant with a tray of coins (they talk until the pelican comes)
  add({ id: 'n1', x: 862, y: 768, s: 1.08, box: stdBox, paint: (x, st) => standing(x, COST.n1, st), state: onlooker({ x: 862, f: 1, calm: ['hip', 'present'], ph: 0, react: 'point', nisar: 'throw', after: 'hip' }) });
  add({ id: 's1', x: 914, y: 768, s: 1.04, box: stdBox, paint: (x, st) => standing(x, COST.s1, st), state: (u) => { const s = onlooker({ x: 914, f: -1, calm: ['tray'] })(u); return { ...s, arm: 'tray', far: 'tray', prop: 'tray' }; } });
  // ---- the falconer (left, behind the walk)
  add({ id: 'fc', x: 96, y: 768, s: 1.1, box: [-40, -130, 44, 4], paint: (x, st) => { const r = standing(x, COST.fc, st); x.save(); x.translate(r.farHand[0] + 0.6, r.farHand[1] - 1.8); x.scale(1.3, 1.3); falcon(x, st.falcon, st.bate); x.restore(); },
    state: (u) => {
      const q = q4(u);
      const falc = q >= 1.5 ? 1 : -1;
      if (q < 2) return { arm: 'hip', far: 'fist', head: 1, tilt: q >= 1.5 ? -0.12 : 0.08, falcon: falc, bate: q >= 1.5 };
      return { arm: q < 4 ? 'lips' : 'hip', far: 'fist', head: 1, tilt: q < 4 ? -0.22 : -0.05, falcon: 1, wide: q < 2.5 };
    } });
  // ---- peekers behind the cypresses (pop out at 2.0)
  const peek = (id, ci, side, cost) => {
    const c = CYP[ci];
    const yH = c.y - 82;
    const { hw, cx } = cypHW(c, yH);
    const ax = cx + side * (hw - 11);
    const poly = cypressPoly(c).map(([a, b]) => [a - ax, b - c.y]);
    add({ id, x: ax, y: c.y, s: 1.0, f: side, box: [-40, -118, 40, 4],
      clipW: (x) => { x.beginPath(); x.rect(-60, -140, 120, 160); poly.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.clip('evenodd'); x.beginPath(); x.rect(side > 0 ? 0 : -60, -140, 60, 160); x.clip(); },
      lean: side * 0.26,
      paint: (x, st) => standing(x, cost, st),
      state: (u) => {
        const q = q4(u);
        if (q < 2) return null;
        const head = toward(ax, Math.min(q, 6.25)) * side;
        return { arm: q < 2.5 ? 'lips' : q < 4 ? 'point' : 'lips', head, tilt: -0.05, wide: q < 3 };
      } });
  };
  peek('pk1', 0, 1, COST.pk1); peek('pk2', 1, 1, COST.pk2); peek('pk3', 3, -1, COST.pk3);
  // ---- the gardener, from above
  add({ id: 'gd', x: 128, y: 478, s: 1.75, box: [-36, -60, 36, 36], top: true, paint: (x, st) => gardenerTop(x, st),
    state: (u) => { const q = q4(u), b = beatOf(u); if (q < 2) return { pose: b % 2 ? 'B' : 'A' }; return { pose: q < 5.5 ? 'up' : 'upR' }; } });
  // ---- the peacock on the wall
  add({ id: 'pc', x: 210, y: 292, s: 1.0, f: -1, box: [-14, -40, 26, 106], paint: (x, st) => peacock(x, st.head),
    state: (u) => ({ head: q4(u) < 2 ? 1 : -1 }) });
  // ---- the emperor in the jharokha (half figure, clipped at the sill), ladies at the windows, the roof guard
  const E = { x: JH.cx, y: JH.sill };
  const opE = archPoly(JH.x0, JH.x1, JH.top, JH.spring, JH.sill, 5, 2.2).map(([a, b]) => [a - E.x, b - E.y]);
  add({ id: 'emp', x: E.x, y: E.y, s: 1.45, f: -1, box: [-40, -86, 40, 2], up: 50,
    clipW: (x) => { pth(x, opE); x.clip(); },
    paint: (x, st) => standing(x, COST.emp, st),
    state: (u) => {
      const q = q4(u);
      if (q < 2) return { arm: 'rose', far: 'down', head: 1, tilt: 0.16 };
      if (q < 2.5) return { arm: 'fold', far: 'down', head: 1, tilt: -0.04, wide: true };
      const head = toward(E.x, Math.min(q, 6.25)) * -1;
      if (q < 4) return { arm: 'bless', far: 'down', head, tilt: -0.02 };
      return { arm: 'rose', far: 'down', head, tilt: 0.05 };
    } });
  WINS.forEach((W, k) => {
    const opW = archPoly(W.x0, W.x1, W.top, W.spring, W.sill, 3, 1.4).map(([a, b]) => [a - W.cx, b - W.sill]);
    add({ id: 'lady' + k, x: W.cx, y: W.sill, s: 0.78, f: -1, box: [-24, -60, 24, 2], up: 44,
      clipW: (x) => { pth(x, opW); x.clip(); },
      paint: (x, st) => standing(x, k ? COST.ladyB : COST.ladyA, st),
      state: (u) => {
        const q = q4(u);
        if (q < 2) return null;
        const head = toward(W.cx, Math.min(q, 6.25)) * -1;
        return { arm: q >= 2.5 && q < 3.75 ? 'throw' : q < 2.5 ? 'lips' : 'sill', head, tilt: -0.08 };
      } });
  });
  const kangTop = [];
  for (let px = PAV.x0 + 2; px < PAV.x1 + 2; px += 11.5) for (const [a, b] of [[-4.2, 0], [-4.2, -3.6], [-2.6, -6.4], [-1, -8.2], [0, -10.4], [1, -8.2], [2.6, -6.4], [4.2, -3.6], [4.2, 0]]) kangTop.push([px + a * 0.95, 196 + b * 0.95]);
  add({ id: 'guard', x: 808, y: 196, s: 0.86, f: -1, box: [-30, -72, 30, 2],
    clipW: (x) => { x.beginPath(); x.moveTo(-200, -300); x.lineTo(200, -300); x.lineTo(200, 0); for (let i = kangTop.length - 1; i >= 0; i--) x.lineTo(kangTop[i][0] - 808, kangTop[i][1] - 196); x.lineTo(-200, 0); x.closePath(); x.clip(); },
    paint: (x, st) => standing(x, COST.guard, st),
    state: (u) => {
      const q = q4(u);
      if (q < 2) return { arm: 'spear', far: 'fold', head: 1, tilt: 0.3, prop: 'spear', dy: 94 };
      const head = toward(808, Math.min(q, 6.25)) * -1;
      return { arm: q >= 2.5 && q < 3.5 ? 'throw' : 'spear', far: 'fold', head, tilt: -0.1, prop: q >= 2.5 && q < 3.5 ? null : 'spear', dy: 62, wide: q < 2.5 };
    } });
  // ---- the musicians on the carpet (foreground)
  add({ id: 'm1', x: 150, y: 926, s: 1.36, box: [-28, -84, 36, 6], paint: (x, st) => seated(x, COST.m1, st), state: musician(0) });
  add({ id: 'm2', x: 266, y: 926, s: 1.36, box: [-28, -84, 36, 6], paint: (x, st) => seated(x, COST.m2, st), state: musician(1) });
  cast.find((c) => c.id === 'm1').inst = 'bin';
  return cast;
}
function musician(k) {
  return (u) => {
    const q = q4(u), b = beatOf(u);
    const inst = k === 0 ? 'bin' : 'drum';
    if (q < 1.5) return { inst, play: (b + k) % 2 ? 'B' : 'A' };
    if (q < 2) return { inst, play: 'stop' };
    if (q < 4) return { inst, play: 'look' };
    const h = Math.floor(u * 4 + 1e-6);                 // with gusto: double time
    return { inst, play: (h + k) % 2 ? 'gB' : 'gA' };
  };
}

// ------------------------------------------------------------------ sprite atlas
function stKey(c, st) { return `${c.id}|${JSON.stringify(st)}`; }
function buildAtlas(cast) {
  const sprites = [];
  for (const c of cast) {
    const keys = new Map();
    for (let i = -36; i <= 60; i++) { const u = i / 4; const st = c.state(u); if (!st) continue; keys.set(stKey(c, st), st); }
    for (const [key, st] of keys) {
      const [a0, b0, a1, b1] = c.box;
      sprites.push({ key, c, st, w: Math.ceil((a1 - a0) * SP), h: Math.ceil((b1 - b0) * SP) });
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
    const c = sp.c, [bx0, by0, bx1, by1] = c.box;
    x.save();
    x.beginPath(); x.rect(sp.ax, sp.ay, sp.w, sp.h); x.clip();
    x.translate(sp.ax - bx0 * SP, sp.ay - by0 * SP);
    x.scale(SP, SP);
    if (c.clipW) c.clipW(x);
    if (c.lean) x.rotate(c.lean);
    x.scale(c.s * (sp.st.f ?? c.f), c.s);
    if (c.up) x.translate(0, c.up);
    if (sp.st.dy) x.translate(0, sp.st.dy);
    c.paint(x, sp.st);
    x.restore();
    map.set(sp.key, { ox: bx0, oy: by0, w: bx1 - bx0, h: by1 - by0, ax: sp.ax, ay: sp.ay, aw: sp.w, ah: sp.h });
  }
  return { atlas, AW, AH, map, n: sprites.length };
}

// ------------------------------------------------------------------ small live sprites (coins, petals, glints, fans, tassel)
function spriteLayers(K) {
  const coin = K.layer(`${ID}:coin`, 40, 40, (x) => {
    const g = x.createRadialGradient(15, 14, 1, 20, 20, 17);
    g.addColorStop(0, '#fff6cf'); g.addColorStop(0.45, '#e6c564'); g.addColorStop(1, '#9a7426');
    x.beginPath(); x.arc(20, 20, 17, 0, TAU); x.fillStyle = g; x.fill();
    x.strokeStyle = '#4a3208'; x.lineWidth = 3; x.stroke();
    x.beginPath(); x.arc(20, 20, 12, 0, TAU); x.strokeStyle = 'rgba(110,80,20,0.6)'; x.lineWidth = 1.2; x.stroke();
    for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(110,80,20,0.55)'; x.fillRect(13 + k * 3, 18 + (k % 2) * 2, 2, 1.4); }
  });
  const petal = K.layer(`${ID}:petal`, 40, 28, (x) => {
    x.beginPath(); x.moveTo(3, 14); x.bezierCurveTo(10, 1, 30, 0, 37, 10); x.bezierCurveTo(38, 15, 36, 20, 30, 24); x.bezierCurveTo(20, 28, 9, 24, 3, 14); x.closePath();
    const g = x.createLinearGradient(3, 0, 37, 0); g.addColorStop(0, '#c9566f'); g.addColorStop(0.4, '#ec9aae'); g.addColorStop(1, '#f8cdd6');
    x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(120,30,50,0.6)'; x.lineWidth = 1; x.stroke();
    x.beginPath(); x.moveTo(6, 14); x.quadraticCurveTo(20, 11, 33, 12); x.strokeStyle = 'rgba(255,240,245,0.6)'; x.lineWidth = 0.8; x.stroke();
  });
  const glint = K.layer(`${ID}:glint`, 48, 48, (x) => {
    const g = x.createRadialGradient(24, 24, 0, 24, 24, 9); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.4, 'rgba(255,236,170,0.8)'); g.addColorStop(1, 'rgba(255,220,140,0)');
    x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    x.fillStyle = 'rgba(255,248,215,0.95)';
    for (const [a, L] of [[0, 23], [Math.PI / 2, 23], [Math.PI / 4, 11], [-Math.PI / 4, 11]]) {
      x.save(); x.translate(24, 24); x.rotate(a);
      x.beginPath(); x.moveTo(-L, 0); x.lineTo(0, -1.6); x.lineTo(L, 0); x.lineTo(0, 1.6); x.closePath(); x.fill();
      x.restore();
    }
  });
  // morchhal: a peacock-feather fan on a gold staff (pivot at the bottom centre)
  const fan = K.layer(`${ID}:fan`, 72, 180, (x) => {
    x.scale(3, 3);
    lin(x, [[12, 60], [12, 26]], OUT, 1.6); lin(x, [[12, 60], [12, 26]], C.gold, 1.0);
    dot(x, 12, 26, 1.8, C.gold);
    const fanP = smoothLoop([[12, 27], [4, 20], [2, 9], [6, 2], [12, 0.5], [18, 2], [22, 9], [20, 20]], 4);
    fo(x, fanP, '#2f6a4a', 0.4);
    x.save(); clipP(x, fanP);
    for (let k = 0; k < 15; k++) { const a = -Math.PI / 2 + (k - 7) * 0.13; lin(x, [[12, 27], [12 + Math.cos(a) * 30, 27 + Math.sin(a) * 30]], '#b2903e', 0.35, 0.85); }
    for (const [ox, oy] of [[12, 6], [7, 10], [17, 10], [9.5, 16], [14.5, 16], [5.4, 15], [18.6, 15]]) { ell(x, ox, oy, 2.4, 3, 0, '#c99a3a'); ell(x, ox, oy, 1.7, 2.2, 0, '#2f8a5a'); ell(x, ox, oy + 0.2, 1.0, 1.4, 0, '#2552a6'); ell(x, ox, oy + 0.3, 0.5, 0.7, 0, '#101a40'); }
    x.restore();
  });
  // chowrie: a yak-tail fly whisk (pivot at the handle end, bottom)
  const whisk = K.layer(`${ID}:whisk`, 60, 150, (x) => {
    x.scale(3, 3);
    fo(x, [[9, 50], [11, 50], [11.4, 38], [8.6, 38]], C.gold, 0.4);
    for (const yy of [41, 44, 47]) lin(x, [[8.8, yy], [11.2, yy]], C.goldD, 0.35);
    const r = R('whisk');
    for (let k = 0; k < 40; k++) {
      const a = (r() - 0.5) * 0.6, L = 28 + r() * 8;
      const p0 = [10 + (r() - 0.5) * 2, 38], p2 = [10 + Math.sin(a) * L, 38 - Math.cos(a) * L];
      x.beginPath(); x.moveTo(p0[0], p0[1]); x.quadraticCurveTo(p0[0] + Math.sin(a) * L * 0.4 + 2, p0[1] - L * 0.6, p2[0], p2[1]);
      x.strokeStyle = r() < 0.3 ? 'rgba(200,190,170,0.9)' : 'rgba(252,250,244,0.95)'; x.lineWidth = 0.5 + r() * 0.5; x.stroke();
    }
  });
  // the turban tassel (pivot at the top)
  const tassel = K.layer(`${ID}:tassel`, 48, 144, (x) => {
    // the emperor's turban tassel: lapis silk, gold bindings, a pearl
    x.scale(6, 6);
    lin(x, [[4, 0.4], [4, 4.6]], C.goldD, 1.0); lin(x, [[4, 0.4], [4, 4.6]], C.gold, 0.6);
    const body = [[2.6, 8.2], [5.4, 8.2], [6.6, 16], [7.2, 23.2], [0.8, 23.2], [1.4, 16]];
    fo(x, body, C.lapis, 0.35, '#0f1a40');
    x.save(); clipP(x, body);
    for (let k = 0; k < 12; k++) { const px = 1 + k * 0.55; lin(x, [[4 + (px - 4) * 0.3, 8.6], [px, 23.4]], k % 3 === 0 ? C.goldL : '#3d5fb5', 0.3, 0.9); }
    x.restore();
    for (let k = 0; k < 9; k++) { const px = 1.1 + k * 0.72; lin(x, [[px, 23], [px + (k % 2 ? 0.2 : -0.2), 23.8]], C.goldL, 0.35); }
    fo(x, [[2.2, 8.6], [2.6, 6.2], [4, 5.0], [5.4, 6.2], [5.8, 8.6]], C.gold, 0.35, C.goldD);
    lin(x, [[1.6, 11.6], [6.4, 11.6]], C.gold, 0.9); lin(x, [[1.6, 11.6], [6.4, 11.6]], C.goldL, 0.3);
    dot(x, 4, 4.4, 1.35, '#fffaf0'); ring(x, 4, 4.4, 1.35, OUT, 0.25); dot(x, 3.6, 4.0, 0.4, '#ffffff');
    dot(x, 4, 7.2, 0.6, '#b3142a');
  });
  return { coin, petal, glint, fan, whisk, tassel };
}

// ------------------------------------------------------------------ the nisar: coins and petals on analytic paths
function buildNisar() {
  const r = rng(hash(ID, 'nisar'));
  const coins = [];
  const SRC = [[699, 502], [743, 502], [909, 502], [852, 663], [796, 300], [812, 296], [712, 300], [902, 300], [806, 172]];   // terrace hands, n1, the jharokha, windows, roof
  for (let i = 0; i < 120; i++) {
    const si = i % 2 ? 4 + ((i >> 1) % 5) : (i >> 1) % 4;
    const s = SRC[si];
    const t0 = 2.5 + Math.pow(r(), 1.6) * 0.75;
    const g = si >= 4 ? 900 : 1300;
    const T = si >= 4 ? 0.7 + r() * 0.35 : 0.5 + r() * 0.3;
    const tx = 340 + Math.pow(r(), 0.9) * 420, ty = 744 + r() * 90;
    const sx = s[0] + (r() - 0.5) * 10, sy = s[1] + (r() - 0.5) * 8;
    coins.push({ sx, sy, t0, T, tx, ty, g, vx: (tx - sx) / T, vy: (ty - sy - 0.5 * g * T * T) / T, spin0: r() * TAU, w: (9 + r() * 12) * (r() < 0.5 ? -1 : 1), rad: 3.6 + r() * 1.8, front: r() < 0.45, rest: r() * TAU, gl: r() });
  }
  const petals = [];
  const PSRC = [[712, 296], [902, 296], [808, 172], [796, 300], [808, 300]];
  for (let i = 0; i < 130; i++) {
    const s = PSRC[i % PSRC.length];
    const t0 = 2.55 + r() * 1.4;
    const tau = 0.3 + r() * 0.35, vt = 46 + r() * 34;
    const vx0 = -(60 + r() * 220) * (s[0] > 860 && r() < 0.3 ? -0.5 : 1), vy0 = -30 - r() * 70;
    const A = 5 + r() * 9, om = 4 + r() * 5, ph = r() * TAU;
    const xEnd = s[0] + vx0 * tau;
    let ty = 600 + r() * 232;
    if (xEnd > 640 && ty < 664) ty = 562 + r() * 38;          // on the terrace floor
    if (xEnd > 960) ty = 760 + r() * 60;
    const p = { sx: s[0], sy: s[1], t0, tau, vt, vx0, vy0, A, om, ph, ty, rot0: r() * TAU, rw: (2 + r() * 4) * (r() < 0.5 ? -1 : 1), size: 3.4 + r() * 1.8, front: r() < 0.4 };
    // landing time (bisection on y(t) = ty)
    const yAt = (t) => p.sy + p.vt * t + (p.vy0 - p.vt) * p.tau * (1 - Math.exp(-t / p.tau));
    let lo = 0.05, hi = 30;
    if (yAt(hi) < ty) hi = 60;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (yAt(m) < ty) lo = m; else hi = m; }
    p.tl = hi;
    petals.push(p);
  }
  return { coins, petals };
}
function coinAt(c, u) {
  const t = u - c.t0;
  if (t < 0) return null;
  if (t < c.T) return { x: c.sx + c.vx * t, y: c.sy + c.vy * t + 0.5 * c.g * t * t, sx: Math.abs(Math.cos(c.spin0 + c.w * t)), a: 0, flying: true };
  const tb = t - c.T;
  const hop = tb < 0.2 ? 5 * Math.sin(Math.PI * tb / 0.2) : 0;
  return { x: c.tx + Math.min(tb, 0.2) * c.vx * 0.08, y: c.ty - hop, sx: tb < 0.2 ? Math.abs(Math.cos(c.spin0 + c.w * (c.T + tb))) : 1, a: c.rest, flying: tb < 0.2 };
}
function petalAt(p, u) {
  let t = u - p.t0;
  if (t < 0) return null;
  const landed = t >= p.tl;
  if (landed) t = p.tl;
  const e = 1 - Math.exp(-t / p.tau);
  const x = p.sx + p.vx0 * p.tau * e + p.A * Math.sin(p.om * t + p.ph) * Math.min(1, t * 2);
  const y = p.sy + p.vt * t + (p.vy0 - p.vt) * p.tau * e;
  return { x, y, a: p.rot0 + p.rw * t + 0.6 * Math.sin(p.om * t + p.ph), landed };
}

// ------------------------------------------------------------------ the pelican: a Mansur-style portrait on a court bicycle
const WH = '#f8f5ee';
const GB = '#8e9db3';            // the grey-blue of the feather strokes
const BOUT = '#3a2c24';

function goldTube(x, pts, w) { lin(x, pts, BOUT, w + 0.8); lin(x, pts, C.gold, w); lin(x, pts, C.goldL, Math.max(0.3, w * 0.25), 0.9); }
function vermTube(x, pts, w, seed) {
  lin(x, pts, '#5e170d', w + 0.9); lin(x, pts, C.verm, w);
  // highlight on the upper side + gold filigree scroll along the tube
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    let nx = -uy, ny = ux; if (ny > 0) { nx = -nx; ny = -ny; }
    lin(x, [[a[0] + nx * w * 0.28, a[1] + ny * w * 0.28], [b[0] + nx * w * 0.28, b[1] + ny * w * 0.28]], '#ec7a5c', 0.45, 0.85);
    const n = Math.max(2, Math.floor(L / 0.9));
    const wave = [];
    for (let k = 0; k <= n; k++) { const t = k / n, d = t * L; const off = Math.sin(d / 3.1 * Math.PI + seed) * w * 0.22; wave.push([a[0] + ux * d + nx * off, a[1] + uy * d + ny * off]); }
    lin(x, wave, C.goldL, 0.42, 0.95);
    for (let d = 1.55; d < L; d += 6.2) dot(x, a[0] + ux * d - nx * w * 0.22, a[1] + uy * d - ny * w * 0.22, 0.34, C.goldL);
  }
}
function wheelPaint(x, wh) {
  const [cx, cy] = wh.c, r = wh.r;
  for (let j = 0; j < wh.spokes; j++) {
    const a = wh.angle + (j * TAU) / wh.spokes;
    lin(x, [[cx + Math.cos(a) * 4, cy + Math.sin(a) * 4], [cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88]], '#a8873a', 0.55);
  }
  ring(x, cx, cy, r * 0.9, BOUT, 3.0); ring(x, cx, cy, r * 0.9, C.gold, 2.2); ring(x, cx, cy, r * 0.9 - 0.55, C.goldL, 0.45, 0.9);
  ring(x, cx, cy, r - 2.4, '#2b1e18', 4.6); ring(x, cx, cy, r - 0.1, BOUT, 0.5);
  for (let k = 0; k < 30; k++) { const a = wh.angle + (k * TAU) / 30; dot(x, cx + Math.cos(a) * (r - 2.4), cy + Math.sin(a) * (r - 2.4), 0.55, C.goldL); }
  for (let k = 0; k < 8; k++) { const a = wh.angle + (k * TAU) / 8; ell(x, cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4, 2.6, 1.2, a, C.gold); }
  dot(x, cx, cy, 2.2, C.verm); ring(x, cx, cy, 2.2, BOUT, 0.35); dot(x, cx, cy, 0.7, C.goldL);
}
function legPaint(x, L, col, far) {
  const toe = mixHex(col, '#5a2a1a', 0.25);
  fo(x, L.web, mixHex(col, '#000000', far ? 0.12 : 0.04), 0.4, BOUT);
  for (let k = 1; k < 4; k++) { lin(x, [L.web[0], L.web[k]], toe, 0.4); dot(x, L.web[k][0], L.web[k][1], 0.5, '#3a2a20'); }
  fo(x, L.poly, col, 0.45, BOUT);
  // the feathered thigh: white with fine strokes down to the knee, then the bare scaled shin
  x.save(); clipP(x, L.poly);
  const kt = [lerp(L.hip[0], L.knee[0], 0.9), lerp(L.hip[1], L.knee[1], 0.9)];
  lin(x, [[L.hip[0] - (L.knee[0] - L.hip[0]) * 0.3, L.hip[1] - (L.knee[1] - L.hip[1]) * 0.3], kt], far ? '#e6e2da' : WH, 24);
  const ka = Math.atan2(L.knee[1] - L.hip[1], L.knee[0] - L.hip[0]);
  for (let k = -2; k <= 2; k++) { const p = [kt[0] - Math.sin(ka) * k * 3.4, kt[1] + Math.cos(ka) * k * 3.4]; x.beginPath(); x.arc(p[0], p[1], 2.2, ka - Math.PI / 2, ka + Math.PI / 2); x.fillStyle = far ? '#e6e2da' : WH; x.fill(); x.strokeStyle = rgba(GB, 0.6); x.lineWidth = 0.32; x.stroke(); }
  for (let k = 0; k < 6; k++) { const t = 0.15 + k * 0.12; const p = [lerp(L.hip[0], L.knee[0], t), lerp(L.hip[1], L.knee[1], t)]; x.beginPath(); x.arc(p[0], p[1], 3.2, ka - 1.2, ka + 1.2); x.strokeStyle = rgba(GB, 0.45); x.lineWidth = 0.32; x.stroke(); }
  const sh = [lerp(L.knee[0], L.ankle[0], 0.3), lerp(L.knee[1], L.ankle[1], 0.3)];
  for (let k = 0; k < 6; k++) { const t = k / 6; const p = [lerp(sh[0], L.ankle[0], t), lerp(sh[1], L.ankle[1], t)]; lin(x, [[p[0] - 2.4, p[1]], [p[0] + 2.4, p[1] + 0.6]], toe, 0.3, 0.6); }
  x.restore();
  lin(x, L.poly, BOUT, 0.45, 1, true);
}

function paintPelican(x, P) {
  const B = P.bird, BK = P.bike;
  // far leg, far crank
  legPaint(x, B.legFar, '#d98468', true);
  goldTube(x, [BK.crank.bb, BK.crank.far], 2.0);
  // wheels
  for (const wh of BK.wheels) wheelPaint(x, wh);
  // chain: a string of gold beads
  const ch = BK.chain.concat([BK.chain[0]]);
  lin(x, ch, BOUT, 1.1);
  for (let i = 0; i < ch.length - 1; i++) { const a = ch[i], b = ch[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += 2.4) dot(x, a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L, 0.45, C.goldL); }
  // the vermilion frame with gold filigree, gold lugs at the joints
  const T = BK.tubes;
  let sd = 0;
  for (const k of ['chainstay', 'seatstay', 'seattube', 'downtube', 'toptube', 'headtube']) vermTube(x, T[k], k === 'headtube' ? 4.6 : k.includes('stay') ? 3.0 : 4.0, sd++);
  vermTube(x, BK.fork, 3.4, 7);
  for (const p of [T.seattube[1], T.toptube[1], T.headtube[1], T.chainstay[1]]) { dot(x, p[0], p[1], 2.6, C.gold); ring(x, p[0], p[1], 2.6, BOUT, 0.35); dot(x, p[0], p[1], 0.9, C.verm); }
  goldTube(x, BK.stem, 2.2);
  goldTube(x, BK.bars, 2.2);
  goldTube(x, BK.seatpost, 2.0);
  // saddle: green velvet with a gold edge
  const sad = ribbon(BK.saddle, (t) => 4.4 * (1 - 0.3 * Math.abs(t - 0.4)));
  fo(x, sad, C.mal, 0.4, BOUT);
  lin(x, BK.saddle, C.goldL, 0.5, 0.9);
  for (let i = 1; i < BK.saddle.length - 1; i += 2) dot(x, BK.saddle[i][0], BK.saddle[i][1] + 1.2, 0.4, C.goldL);
  // chainring: a gold rosette
  const bb = BK.crank.bb, rr = BK.crank.ring;
  dot(x, bb[0], bb[1], rr + 0.6, BOUT); dot(x, bb[0], bb[1], rr, C.gold);
  for (let k = 0; k < 20; k++) { const a = (k * TAU) / 20; dot(x, bb[0] + Math.cos(a) * rr, bb[1] + Math.sin(a) * rr, 0.55, C.goldD); }
  for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + 0.2; x.beginPath(); x.ellipse(bb[0] + Math.cos(a) * rr * 0.55, bb[1] + Math.sin(a) * rr * 0.55, rr * 0.36, rr * 0.17, a, 0, TAU); x.strokeStyle = C.goldD; x.lineWidth = 0.35; x.stroke(); }
  dot(x, bb[0], bb[1], 3.2, C.verm); ring(x, bb[0], bb[1], 3.2, BOUT, 0.35);

  // ---------------- the bird
  // tail
  fo(x, B.tail, WH, 0.5, BOUT);
  for (let k = 1; k <= 4; k++) { const t = k / 5; lin(x, [[lerp(B.tail[0][0], B.tail[3][0], t), lerp(B.tail[0][1], B.tail[3][1], t)], [lerp(B.tail[1][0], B.tail[2][0], t), lerp(B.tail[1][1], B.tail[2][1], t)]], GB, 0.32, 0.7); }
  // body: opaque white, cool shading below, rows of scalloped feather edges
  const ca = Math.cos(B.bodyAng), sa = Math.sin(B.bodyAng);
  const at = (u, v, rx = B.bodyRx, ry = B.bodyRy) => [B.bodyC[0] + ca * u * rx - sa * v * ry, B.bodyC[1] + sa * u * rx + ca * v * ry];
  fil(x, B.body, WH);
  x.save(); clipP(x, B.body);
  const top = at(0, -1), bot = at(0, 1);
  const bg = x.createLinearGradient(top[0], top[1], bot[0], bot[1]);
  bg.addColorStop(0, 'rgba(255,248,230,0)'); bg.addColorStop(0.5, 'rgba(160,175,195,0.05)'); bg.addColorStop(1, 'rgba(110,130,160,0.38)');
  x.fillStyle = bg; x.fillRect(B.bodyC[0] - 80, B.bodyC[1] - 60, 160, 120);
  const blush = x.createRadialGradient(B.bodyC[0] + 20, B.bodyC[1] + 6, 4, B.bodyC[0] + 10, B.bodyC[1], 60);
  blush.addColorStop(0, 'rgba(240,170,170,0.16)'); blush.addColorStop(1, 'rgba(240,170,170,0)');
  x.fillStyle = blush; x.fillRect(B.bodyC[0] - 80, B.bodyC[1] - 60, 160, 120);
  for (let iv = 0; iv < 8; iv++) {
    const v = -0.2 + iv * 0.15;
    for (let iu = 0; iu < 16; iu++) {
      const uu = -0.95 + iu * 0.125 + (iv % 2) * 0.062;
      if (uu * uu + v * v > 0.9) continue;
      const p = at(uu, v);
      x.beginPath(); x.arc(p[0], p[1], 3.1, B.bodyAng + Math.PI / 2 + 0.25, B.bodyAng + Math.PI * 1.5 - 0.25);
      x.strokeStyle = rgba(GB, 0.3 + 0.5 * clamp(v + 0.2)); x.lineWidth = 0.4; x.stroke();
    }
  }
  x.restore();
  lin(x, B.body, BOUT, 0.55, 1, true);
  // wing: coverts in overlapping rows, tertials, then the dark flight feathers
  fil(x, B.wing, '#f6f2ea');
  x.save(); clipP(x, B.wing);
  for (let iv = 0; iv < 9; iv++) {
    const v = -1.0 + iv * 0.17;
    for (let iu = 0; iu < 14; iu++) {
      const uu = -1.05 + iu * 0.13 + (iv % 2) * 0.065;
      const p = at(uu, v);
      const a0 = B.bodyAng + Math.PI / 2 + 0.35, a1 = B.bodyAng + Math.PI * 1.5 + 0.1;
      x.beginPath(); x.arc(p[0], p[1], 4.3, a0, a1); x.lineTo(p[0], p[1]); x.closePath();
      x.fillStyle = 'rgba(205,212,222,0.22)'; x.fill();
      x.beginPath(); x.arc(p[0], p[1], 4.3, a0, a1);
      x.strokeStyle = rgba(GB, 0.62 + 0.25 * (iv / 8)); x.lineWidth = 0.42; x.stroke();
      // a hair of a shaft
      lin(x, [[p[0] + ca * 1.2, p[1] + sa * 1.2], [p[0] - ca * 3.2, p[1] - sa * 3.2]], GB, 0.2, 0.35);
    }
  }
  x.restore();
  const sec = B.secondaries;
  for (let k = 0; k < 5; k++) {
    const f = (k + 0.5) / 5, i = Math.min(sec.length - 2, Math.floor(f * (sec.length - 1)));
    const p = sec[i], q = sec[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const c = [p[0] + Math.sin(a) * 3.2, p[1] - Math.cos(a) * 3.2];
    x.beginPath(); x.ellipse(c[0], c[1], 6.8, 2.5, a, 0, TAU); x.fillStyle = '#f3efe6'; x.fill(); x.strokeStyle = rgba(GB, 0.75); x.lineWidth = 0.38; x.stroke();
  }
  lin(x, B.wing, BOUT, 0.5, 1, true);
  // the gold highlight along the back
  const back = B.wing.slice(0, 16).map((p) => [lerp(p[0], B.bodyC[0], 0.04), lerp(p[1], B.bodyC[1], 0.06) + 0.6]);
  lin(x, back, C.gold, 0.95, 0.95); lin(x, back, C.goldL, 0.4, 0.9);
  // secondaries: a wedge darkening toward the tail, each feather tip scalloped
  const secR = ribbon(sec, (t) => lerp(0.6, 5.2, Math.pow(t, 0.8)));
  const sg2 = x.createLinearGradient(sec[0][0], sec[0][1], sec[sec.length - 1][0], sec[sec.length - 1][1]);
  sg2.addColorStop(0, 'rgba(120,112,105,0)'); sg2.addColorStop(0.45, 'rgba(110,102,96,0.12)'); sg2.addColorStop(0.75, 'rgba(60,54,50,0.9)'); sg2.addColorStop(1, '#2a2420');
  pth(x, secR); x.fillStyle = sg2; x.fill();
  for (let k = 3; k < 7; k++) {
    const f = (k + 0.5) / 7, i = Math.min(sec.length - 2, Math.floor(f * (sec.length - 1)));
    const p = sec[i], q = sec[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const c = [p[0] - Math.sin(a) * 1.6 * f, p[1] + Math.cos(a) * 1.6 * f];
    x.beginPath(); x.ellipse(c[0], c[1], 4.4, 1.6 + 1.2 * f, a, 0, TAU); x.fillStyle = f > 0.7 ? '#2e2824' : '#6e6660'; x.fill(); x.strokeStyle = '#a49c94'; x.lineWidth = 0.28; x.stroke();
  }
  // primaries, each feather drawn: dark vane, pale shaft
  for (let k = B.primaries.length - 1; k >= 0; k--) {
    const f = B.primaries[k];
    const rib = ribbon(f, (t) => lerp(7.2, 1.2, Math.pow(t, 0.85)));
    fo(x, rib, '#2a2420', 0.32, '#140f0c');
    lin(x, f.slice(0, -2), '#cfc6b6', 0.3, 0.9);
    lin(x, rib.slice(0, Math.floor(rib.length / 2)), '#6e655e', 0.25, 0.7);
  }
  // neck: white with fine strokes, a breath of saffron on the breast, gold along the nape
  const sp = B.neckSpine, n = sp.length;
  const front = B.neck.slice(0, n), backN = B.neck.slice(n).reverse();
  fil(x, B.neck, WH);
  x.save(); clipP(x, B.neck);
  const nb = front[2];
  const brg = x.createRadialGradient(nb[0], nb[1], 1, nb[0], nb[1], 20);
  brg.addColorStop(0, 'rgba(240,190,100,0.32)'); brg.addColorStop(1, 'rgba(240,190,100,0)');
  x.fillStyle = brg; x.fillRect(nb[0] - 22, nb[1] - 22, 44, 44);
  lin(x, backN, GB, 3.4, 0.16);
  lin(x, front.map((p, i) => [lerp(p[0], sp[i][0], 0.1), lerp(p[1], sp[i][1], 0.1)]), GB, 1.6, 0.14);
  for (let i = 1; i < n - 1; i += 2) {
    const a = sp[i - 1], b = sp[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    for (const t of [-0.55, -0.15, 0.25, 0.62]) {
      const w = lerp(15, 9.5, i / (n - 1)) * t;
      const p = [sp[i][0] - (dy / L) * w + (i % 4 ? 0.8 : -0.8), sp[i][1] + (dx / L) * w];
      lin(x, [p, [p[0] - (dx / L) * 3.4, p[1] - (dy / L) * 3.4]], GB, 0.3, 0.42);
    }
  }
  x.restore();
  lin(x, front.slice(1), BOUT, 0.5); lin(x, backN.slice(1), BOUT, 0.5);
  const nape = backN.slice(2, n - 1).map((p, i) => [lerp(p[0], sp[i + 2][0], 0.12), lerp(p[1], sp[i + 2][1], 0.12)]);
  lin(x, nape, C.gold, 0.8, 0.9); lin(x, nape, C.goldL, 0.35, 0.85);
  // head
  const H = B.head;
  dot(x, H.c[0], H.c[1], H.r, WH);
  const jn = sp[n - 1], ja = Math.atan2(jn[1] - H.c[1], jn[0] - H.c[0]);
  x.beginPath(); x.arc(H.c[0], H.c[1], H.r, ja + 0.8, ja - 0.8 + TAU); x.strokeStyle = BOUT; x.lineWidth = 0.5; x.stroke();
  for (let k = 0; k < 6; k++) { const a = ja + 1.2 + k * 0.55; const p = [H.c[0] + Math.cos(a) * H.r * 0.6, H.c[1] + Math.sin(a) * H.r * 0.6]; lin(x, [p, [p[0] - Math.cos(a + 1.4) * 2.6, p[1] - Math.sin(a + 1.4) * 2.6]], GB, 0.28, 0.45); }
  x.save(); x.beginPath(); x.arc(H.c[0], H.c[1], H.r, 0, TAU); x.clip();
  const nuch = x.createRadialGradient(H.c[0] - H.r * 0.7, H.c[1] - H.r * 0.2, 1, H.c[0] - H.r * 0.5, H.c[1], H.r * 1.1);
  nuch.addColorStop(0, 'rgba(238,205,130,0.45)'); nuch.addColorStop(1, 'rgba(238,205,130,0)');
  x.fillStyle = nuch; x.fillRect(H.c[0] - H.r, H.c[1] - H.r, H.r * 2, H.r * 2);
  x.restore();
  x.beginPath(); x.arc(H.c[0], H.c[1], H.r - 1.1, ja + 2.2, ja + 3.9); x.strokeStyle = rgba(C.gold, 0.9); x.lineWidth = 0.6; x.stroke();
  // crest: fine white plumes
  for (const c of B.crest) {
    const [a, b] = c, dx = b[0] - a[0], dy = b[1] - a[1];
    const pl = [[a[0], a[1]], [lerp(a[0], b[0], 0.5) - dy * 0.12, lerp(a[1], b[1], 0.5) + dx * 0.12], [b[0], b[1]], [lerp(a[0], b[0], 0.55) + dy * 0.12, lerp(a[1], b[1], 0.55) - dx * 0.12]];
    fo(x, pl, WH, 0.3, BOUT);
    lin(x, [a, b], GB, 0.25, 0.7);
  }
  // pouch: saffron into rose, fine veins
  const pouch = B.pouch;
  let pb = pouch[0];
  for (const p of pouch) if (p[1] > pb[1]) pb = p;
  const jaw = B.lowerJawLine;
  const pg = x.createLinearGradient(jaw[0][0], jaw[0][1] - 2, pb[0], pb[1]);
  pg.addColorStop(0, '#f2b648'); pg.addColorStop(0.55, '#ef9a72'); pg.addColorStop(1, '#e48a96');
  pth(x, pouch); x.fillStyle = pg; x.fill();
  x.save(); clipP(x, pouch);
  const nLow = Math.min(26, pouch.length - 1);
  for (let k = 1; k <= 7; k++) {
    const f = k / 8;
    const s0 = [lerp(jaw[0][0], jaw[1][0], f), lerp(jaw[0][1], jaw[1][1], f)];
    const e = pouch[Math.round(f * nLow)];
    x.beginPath(); x.moveTo(s0[0], s0[1]); x.quadraticCurveTo(lerp(s0[0], e[0], 0.5) - 2, lerp(s0[1], e[1], 0.6), e[0], e[1]);
    x.strokeStyle = 'rgba(190,90,80,0.45)'; x.lineWidth = 0.3; x.stroke();
  }
  const hl = x.createLinearGradient(jaw[0][0], jaw[0][1], jaw[1][0], jaw[1][1] + 12);
  hl.addColorStop(0, 'rgba(255,240,200,0.35)'); hl.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = hl; x.fillRect(jaw[0][0] - 10, jaw[0][1] - 10, 140, 40);
  x.restore();
  lin(x, pouch, BOUT, 0.5, 1, true);
  // bill, red cutting edge, nail
  const bill = B.upperBill;
  fo(x, bill, '#efd3b6', 0.5, BOUT);
  lin(x, [bill[7], bill[6], bill[5], bill[4]], '#c9553f', 0.55);
  lin(x, [[lerp(bill[0][0], bill[7][0], 0.4), lerp(bill[0][1], bill[7][1], 0.4)], [lerp(bill[1][0], bill[6][0], 0.38), lerp(bill[1][1], bill[6][1], 0.38)], [lerp(bill[2][0], bill[5][0], 0.4), lerp(bill[2][1], bill[5][1], 0.4)]], '#b7896a', 0.3, 0.85);
  lin(x, [[lerp(bill[0][0], bill[7][0], 0.15), lerp(bill[0][1], bill[7][1], 0.15)], [lerp(bill[1][0], bill[6][0], 0.12), lerp(bill[1][1], bill[6][1], 0.12)]], '#fff3e0', 0.35, 0.8);
  fo(x, B.nail, C.verm, 0.35, BOUT);
  // bare face around the eye, then the jewel of the eye
  fil(x, B.facePatch, '#f1c38f', 0.95);
  const E = B.eye;
  if (E.mode === 'closed') {
    x.beginPath(); x.arc(E.c[0], E.c[1] - 1.2, E.r * 0.95, 0.25 * Math.PI, 0.78 * Math.PI); x.strokeStyle = '#2a1a14'; x.lineWidth = 0.7; x.stroke();
    for (let k = 0; k < 3; k++) { const a = 0.35 * Math.PI + k * 0.17 * Math.PI; const p = [E.c[0] + Math.cos(a) * E.r * 0.95, E.c[1] - 1.2 + Math.sin(a) * E.r * 0.95]; lin(x, [p, [p[0] + Math.cos(a) * 1.3, p[1] + Math.sin(a) * 1.3]], '#2a1a14', 0.35); }
  } else {
    ring(x, E.c[0], E.c[1], E.r + 0.7, '#e7c873', 0.9);
    const eg = x.createRadialGradient(E.c[0] - E.r * 0.3, E.c[1] - E.r * 0.3, 0.2, E.c[0], E.c[1], E.r);
    eg.addColorStop(0, '#b0353a'); eg.addColorStop(1, '#4a0d10');
    x.beginPath(); x.arc(E.c[0], E.c[1], E.r, 0, TAU); x.fillStyle = eg; x.fill();
    dot(x, E.pupil[0], E.pupil[1], E.r * (E.mode === 'white' ? 0.35 : 0.52), '#0c0706');
    dot(x, E.c[0] - E.r * 0.32, E.c[1] - E.r * 0.36, E.r * 0.24, '#ffffff', 0.95);
    ring(x, E.c[0], E.c[1], E.r, BOUT, 0.4);
  }
  // near leg, crank and pedal
  legPaint(x, B.legNear, '#ee9a72', false);
  goldTube(x, [BK.crank.bb, BK.crank.near], 2.4);
  const pn = BK.crank.near;
  lin(x, [[pn[0] - 6, pn[1]], [pn[0] + 6, pn[1]]], BOUT, 3.4); lin(x, [[pn[0] - 6, pn[1]], [pn[0] + 6, pn[1]]], C.verm, 2.4);
  lin(x, [[pn[0] - 5, pn[1]], [pn[0] + 5, pn[1]]], C.goldL, 0.4);
}

let LIVE = null;
function liveBuffer() {
  if (LIVE) return LIVE;
  const W = 900, H = 760;
  const img = createImage(W, H);
  LIVE = { W, H, img, x: img.drawingContext };
  return LIVE;
}
function drawPelican(ctx) {
  const P = ctx.rider.placed;
  const B = P.bird, BK = P.bike;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (p, m = 0) => { if (p[0] - m < x0) x0 = p[0] - m; if (p[0] + m > x1) x1 = p[0] + m; if (p[1] - m < y0) y0 = p[1] - m; if (p[1] + m > y1) y1 = p[1] + m; };
  for (const wh of BK.wheels) grow(wh.c, wh.r + 2);
  for (const poly of [B.body, B.tail, B.wing, B.neck, B.pouch, B.upperBill, B.legNear.poly, B.legFar.poly, B.legNear.web, B.legFar.web]) for (const p of poly) grow(p, 2);
  for (const c of B.crest) for (const p of c) grow(p, 3);
  grow(B.head.c, B.head.r + 4);
  const M = 6;
  x0 = Math.max(x0 - M, -2, ctx.view.x0 - 2); x1 = Math.min(x1 + M, 1002, ctx.view.x1 + 2);
  y0 = Math.max(y0 - M, -2, ctx.view.y0 - 2); y1 = Math.min(y1 + M, 1002, ctx.view.y1 + 2);
  if (x1 <= x0 || y1 <= y0) return;
  const L = liveBuffer();
  const S = Math.min(clamp(ctx.pxu * 1.25, 0.6, 2.0), (L.W - 4) / (x1 - x0), (L.H - 4) / (y1 - y0));
  const i0 = Math.floor(x0 * S), j0 = Math.floor(y0 * S);
  const w = Math.min(L.W, Math.ceil(x1 * S) - i0 + 1), h = Math.min(L.H, Math.ceil(y1 * S) - j0 + 1);
  const x = L.x;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, L.W, L.H);
  x.setTransform(S, 0, 0, S, -i0, -j0);
  paintPelican(x, P);
  L.img.setModified(true);
  image(L.img, i0 / S, j0 / S, w / S, h / S, 0, 0, w, h);
}

// ------------------------------------------------------------------ the tassel's story
// u 2.55: the emperor flings his turban tassel; 2.95 it catches on the handlebar and swings;
// 4.55 it slips off as the pelican speeds away and lands on the walk, where it stays.
const TAS = { t0: 2.55, t1: 2.95, t2: 4.55, src: [796, 284] };
function tasselPos(u, ctx) {
  if (u < TAS.t0) return null;
  const riderAt = (uu) => ctx.riderAt(ctx.t - ctx.u + uu)?.placed?.bike?.grip;
  if (u < TAS.t1) {
    const g = riderAt(TAS.t1);
    if (!g) return null;
    const s = (u - TAS.t0) / (TAS.t1 - TAS.t0);
    return { x: lerp(TAS.src[0], g[0], s), y: lerp(TAS.src[1], g[1], s) - 70 * Math.sin(Math.PI * s), a: 2.4 * (1 - s) + Math.sin(s * 9) * 0.4 };
  }
  if (u < TAS.t2) {
    const g = ctx.rider.placed.bike.grip;
    const t = u - TAS.t1;
    return { x: g[0], y: g[1] + 1, a: 0.7 * Math.exp(-t * 2.2) * Math.sin(t * 9) + 0.12 * Math.sin(u * TAU) + 0.18 };
  }
  const g = riderAt(TAS.t2);
  if (!g) return null;
  const t = u - TAS.t2;
  const vx = 150, vy = -70, G = 900;
  const yl = PATH.y0 + 22;
  const tl = (-vy + Math.sqrt(vy * vy + 2 * G * (yl - g[1]))) / G;   // landing time on the walk
  if (t < tl) return { x: g[0] + vx * t, y: g[1] + vy * t + 0.5 * G * t * t, a: 0.4 + t * 9 };
  return { x: g[0] + vx * tl, y: yl, a: Math.PI / 2 - 0.25, landed: true };
}

// ------------------------------------------------------------------ scene
let CAST = null, ATLAS = null, NISAR = null;

export default {
  ride: RIDE,
  freezeU: 3.1,
  cues: [{ u: 1.5, name: 'musicFalters' }, { u: 2.0, name: 'allTurn' }, { u: 2.5, name: 'nisar' }, { u: 4.0, name: 'rideOn' }],

  async init(K, info) {
    if (info && info.index != null) this.index = info.index;
    if (!CAST) CAST = buildCast();
    if (!ATLAS) ATLAS = buildAtlas(CAST);
    if (!NISAR) NISAR = buildNisar();
    this.main = paintMain(K);
    this.atlas = K.layer(`${ID}:atlas`, ATLAS.AW, ATLAS.AH, (x) => x.drawImage(ATLAS.atlas, 0, 0));
    this.sp = spriteLayers(K);
    this.stats = { sprites: ATLAS.n, atlas: [ATLAS.AW, ATLAS.AH], MB: (BK * BK * 4 + ATLAS.AW * ATLAS.AH * 4) / 1048576 };
  },

  camera(u, cam) {
    // a gentle push toward the court for the gag bar (identity near both seams)
    if (u <= 0.5 || u >= 5.5 || this.index == null) return cam;
    const w = smoothstep(0.7, 2.0, u) * (1 - smoothstep(4.1, 5.4, u));
    if (w <= 0) return cam;
    const T = { cx: panelLeft(this.index) + 590, cy: 512, z: 1.16 };
    return { cx: lerp(cam.cx, T.cx, w), cy: lerp(cam.cy, T.cy, w), z: Math.exp(lerp(Math.log(cam.z), Math.log(T.z), w)) };
  },

  mods(u) {
    if (u <= 1.05 || u >= 4.95) return {};
    const m = {};
    if (u >= 2.0 && u < 2.45) m.eye = 'wide';
    const lb = 0.5 * window01(2.55, 4.05, u, 0.3);
    if (lb > 1e-3) m.lookBack = lb;
    if (u >= 2.95 && u < 3.5) m.eye = 'closed';
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    image(this.main, 0, 0, 1000, 1000);
    const sprite = (c) => {
      const st = c.state(u);
      if (!st) return;
      const s = ATLAS.map.get(stKey(c, st));
      if (!s) return;
      if (c.x + s.ox > v.x1 || c.x + s.ox + s.w < v.x0) return;
      const hop = !c.top && !c.clipW && c.id !== 'pc' && u >= 2 && u < 2.17 ? -2.5 : 0;
      image(this.atlas, c.x + s.ox, c.y + s.oy + hop, s.w, s.h, s.ax, s.ay, s.aw, s.ah);
    };
    // fountains glitter on the beats
    const beatT = u * 2 - Math.floor(u * 2);
    const fl = Math.exp(-beatT * 5);
    const b = beatOf(u);
    FOUNTAINS.forEach(([fx, fy, sz], i) => {
      for (let k = 0; k < 2; k++) {
        const r = rng(hash(ID, 'spk', b, i, k));
        const a = fl * (0.55 + 0.45 * r());
        if (a < 0.05) continue;
        const s = (6 + 6 * r()) * sz * (0.6 + 0.4 * fl);
        push(); tint(255, 255 * a);
        image(this.sp.glint, fx + (r() - 0.5) * 16 * sz - s, fy + (r() - 0.3) * 10 * sz - s, s * 2, s * 2);
        pop();
      }
    });
    // the peacock and its shimmering train
    const pc = CAST.find((c) => c.id === 'pc');
    sprite(pc);
    OCELLI.forEach(([ox, oy], k) => {
      const a = Math.pow(Math.max(0, Math.sin(u * 2.2 - k * 0.55)), 8);
      if (a < 0.05) return;
      push(); tint(255, 230 * a);
      const s = 3.2 + 2 * a;
      image(this.sp.glint, pc.x - ox * pc.s - s, pc.y + oy * pc.s - s, s * 2, s * 2);
      pop();
    });
    // the chowrie waves over the emperor's shoulder (it stops when he looks)
    const fanA = (u < 2 || u >= 4) ? Math.sin(u * Math.PI * (u >= 4 ? 2 : 1)) : 0.6;
    for (const c of CAST) if (['emp', 'lady0', 'lady1', 'guard', 'pk1', 'pk2', 'pk3', 'gd'].includes(c.id)) sprite(c);
    push(); translate(JH.x1 - 3, JH.sill - 4); rotate(-0.42 + 0.3 * fanA); image(this.sp.whisk, -10 * 0.72, -50 * 0.72, 20 * 0.72, 50 * 0.72); pop();
    // terrace and garden figures, the fan-bearer's morchhal
    for (const c of CAST) if (['t1', 't2', 't3', 't4', 'fb', 'n1', 's1', 'fc'].includes(c.id)) sprite(c);
    const fb = CAST.find((c) => c.id === 'fb');
    const fbSt = fb.state(u);
    const fanW = (u < 2 || u >= 4) ? 0.24 * Math.sin(u * Math.PI * (u >= 4 ? 2 : 1)) : -0.15;
    push(); translate(fb.x - 9.6 * fb.s - 1.6 * fb.s, fb.y - 78.8 * fb.s); rotate(-0.2 + fanW); image(this.sp.fan, -12 * 0.95, -60 * 0.95, 24 * 0.95, 60 * 0.95); pop();
    void fbSt;
    // the musicians
    for (const c of CAST) if (c.id === 'm1' || c.id === 'm2') sprite(c);
    // the nisar: things behind the bird, the bird, things in front
    const drawCoin = (c, p) => {
      push(); translate(p.x, p.y); rotate(p.a); scale(Math.max(0.12, p.sx), 1);
      image(this.sp.coin, -c.rad, -c.rad, c.rad * 2, c.rad * 2);
      pop();
      if (!p.flying && c.gl > 0.75) {
        const g = Math.exp(-(((u * 2 + c.gl * 7) % 4)) * 3);
        if (g > 0.08) { push(); tint(255, 255 * g); image(this.sp.glint, p.x - 5, p.y - 5, 10, 10); pop(); }
      }
    };
    const drawPetal = (p, q) => {
      push(); translate(q.x, q.y); rotate(q.a);
      image(this.sp.petal, -p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
      pop();
    };
    const coins = [], petals = [];
    if (u >= 2.5) {
      for (const c of NISAR.coins) { const p = coinAt(c, u); if (p) coins.push([c, p]); }
      for (const p of NISAR.petals) { const q = petalAt(p, u); if (q) petals.push([p, q]); }
    }
    const isFront = (o, p) => (p.flying || p.landed === false ? o.front : (p.y > 806));
    for (const [p, q] of petals) if (!isFront(p, q)) drawPetal(p, q);
    for (const [c, p] of coins) if (!isFront(c, p)) drawCoin(c, p);
    if (ctx.rider.visible) drawPelican(ctx);
    const tp = tasselPos(u, ctx);
    if (tp) { push(); translate(tp.x, tp.y); rotate(tp.a); image(this.sp.tassel, -4 * 1.5, -0.8, 8 * 1.5, 24 * 1.5); pop(); }
    for (const [p, q] of petals) if (isFront(p, q)) drawPetal(p, q);
    for (const [c, p] of coins) if (isFront(c, p)) drawCoin(c, p);
  },
};

void smoothstep; void noise2;
