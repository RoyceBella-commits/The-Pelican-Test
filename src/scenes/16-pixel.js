// 16 · 8-bit 像素游戏 / 8-bit Pixel Game · 1980s
//
// One screen of an original 1980s-style side-scrolling platformer, "STAGE 16": a black status bar (lives, coins,
// score, stage, and the stage title in a pixel font), a periwinkle sky that dithers into a pale horizon, snow-capped
// far ranges, round green hills, floating stone tiles with an engraved feather, square-holed gold coins, grass-capped
// soil tiles with a pit in the middle, a berry shrub, and a small block-shell hermit crab that patrols the right.
//
// Technique (0 p5.brush marks): the whole level is a 250 × 250 logical-pixel screen (1 px = 4 panel units) composed
// every frame as palette indices in a Uint8Array (16-colour palette), converted to RGBA and drawn as one p5.Image with
// NEAREST filtering. The rider is rasterised every frame by a tiny scanline rasteriser into its own index buffer
// (5 colours, threshold-free, then a 1-px outline pass) anchored at the rider's exact position, so the bike halves
// still meet the neighbours at the seams; inside the jump (1, 5) the placement is snapped to the level grid, so the
// sprite and the screen share one pixel grid. Effects (sparkles, +100, 1UP, dust) go to a third pixel layer on top.
//
// Gag (u): 1.5 crouch (1-px squash) · 2.0 JUMP over the pit (apex 200) · 2.25/2.5/2.75/3.0/3.25 the bill snaps a
// coin on every eighth (sparkle, "+100", counter 96…99 → rolls to ×00) · 3.5 landing squash + dust, the crab panics
// and hides in the shrub · 4.0 "1UP" pops above the pelican and blinks upward, lives ×3 → ×4 · after 6 the crab
// walks to the pit and peers in. The ride speeds up to 1.45× in the air (hold [2, 3.5], speed 1.45) and pays it back
// with a gentle slow approach and run-out: a 208-unit wheelbase must clear a 128-unit pit in 1.5 s.
import { profile } from '../beat/ride.js';
import { sceneStart, panelLeft, CRANK_DIST, WHEEL_R } from '../beat/timeline.js';
import { pose as rigPose, placed as rigPlaced } from '../rig/pelican.js';
import { rigParts } from '../rig/parts.js';

const ID = 'pixel';
const PX = 4;                       // panel units per logical pixel
const SW = 250, SH = 250;           // the screen in logical pixels
const GR = 200;                     // first ground row (y = 800)
const HUD_H = 32;                   // status bar rows 0..31
const PIT0 = 100, PIT1 = 132;       // pit columns [PIT0, PIT1) → x 400..528
const RIDE = { hold: [2.0, 3.5], speed: 1.45, ramp: 0.15 };
const PROF = profile(RIDE);
const T_UP = 2.0, T_DN = 3.5, JUMP_H = 200;
const COIN_U = [2.25, 2.5, 2.75, 3.0, 3.25];
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ palette (16 colours, original)
const HEX = [
  '#101018', // 0 ink: outlines, void, status bar
  '#fcfcfc', // 1 white
  '#a8b4ec', // 2 mist: horizon, cloud shade, tile highlight
  '#4f6fd8', // 3 sky
  '#1f6650', // 4 hill dark
  '#2f8f5a', // 5 hill
  '#46b04a', // 6 grass
  '#a4de5c', // 7 grass light
  '#b8622d', // 8 ground
  '#6e3412', // 9 soil
  '#f8c838', // 10 gold
  '#c47a10', // 11 amber
  '#f08838', // 12 orange
  '#d83830', // 13 red
  '#8a90b4', // 14 stone
  '#46467a', // 15 slate
];
const INK = 0, WHITE = 1, MIST = 2, SKY = 3, HILLD = 4, HILL = 5, GRASS = 6, GRASSL = 7, GROUND = 8, SOIL = 9,
  GOLD = 10, AMBER = 11, ORANGE = 12, RED = 13, STONE = 14, SLATE = 15, NONE = 255;
const LUT = new Uint32Array(256);
HEX.forEach((h, k) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  LUT[k] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
});
LUT[NONE] = 0;

// ------------------------------------------------------------------ index sprites
const spr = (w, h, fill = NONE) => ({ w, h, d: new Uint8Array(w * h).fill(fill) });
const ART = { k: INK, w: WHITE, m: MIST, y: SKY, H: HILLD, h: HILL, G: GRASS, L: GRASSL, b: GROUND, d: SOIL, g: GOLD, a: AMBER, o: ORANGE, r: RED, s: STONE, l: SLATE };
function art(rows, map = ART) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const s = spr(w, h);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c !== undefined) s.d[j * w + i] = c; } });
  return s;
}
function pset(s, x, y, c) { if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.d[y * s.w + x] = c; }
function pget(s, x, y) { return x >= 0 && y >= 0 && x < s.w && y < s.h ? s.d[y * s.w + x] : NONE; }
/** Copy sprite s into dst at (x, y). o: { flip, color (recolour), clip: [x0, y0, x1, y1] }. */
function blit(dst, s, x, y, o = {}) {
  const cx0 = o.clip ? o.clip[0] : 0, cy0 = o.clip ? o.clip[1] : 0, cx1 = o.clip ? o.clip[2] : dst.w, cy1 = o.clip ? o.clip[3] : dst.h;
  for (let j = 0; j < s.h; j++) {
    const yy = y + j;
    if (yy < cy0 || yy >= cy1) continue;
    for (let i = 0; i < s.w; i++) {
      const xx = x + i;
      if (xx < cx0 || xx >= cx1) continue;
      const c = s.d[j * s.w + (o.flip ? s.w - 1 - i : i)];
      if (c !== NONE) dst.d[yy * dst.w + xx] = o.color ?? c;
    }
  }
}
/** Ink outline (4-neighbour) around every non-NONE pixel of s (in place; s must have a 1-px margin). */
function outline(s, col = INK, diag = false) {
  const add = [];
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    if (s.d[j * s.w + i] !== NONE) continue;
    const n = pget(s, i - 1, j) !== NONE || pget(s, i + 1, j) !== NONE || pget(s, i, j - 1) !== NONE || pget(s, i, j + 1) !== NONE ||
      (diag && (pget(s, i - 1, j - 1) !== NONE || pget(s, i + 1, j - 1) !== NONE || pget(s, i - 1, j + 1) !== NONE || pget(s, i + 1, j + 1) !== NONE));
    if (n) add.push(j * s.w + i);
  }
  for (const k of add) s.d[k] = col;
  return s;
}
/** Ordered dither threshold (4×4 Bayer, 0..15). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// ------------------------------------------------------------------ pixel fonts (original)
// F7: chunky 7-row font, 2-px stems. F5: tiny 5-row font.
const F7 = {
  '0': ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  '1': ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  '2': ['.####.', '##..##', '....##', '..###.', '.##...', '##....', '######'],
  '3': ['.####.', '##..##', '....##', '..###.', '....##', '##..##', '.####.'],
  '4': ['...##.', '..###.', '.####.', '##.##.', '######', '...##.', '...##.'],
  '5': ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
  '6': ['..###.', '.##...', '##....', '#####.', '##..##', '##..##', '.####.'],
  '7': ['######', '##..##', '....##', '...##.', '..##..', '..##..', '..##..'],
  '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
  '9': ['.####.', '##..##', '##..##', '.#####', '....##', '...##.', '.###..'],
  A: ['..##..', '.####.', '##..##', '##..##', '######', '##..##', '##..##'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.#####'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
  N: ['##..##', '###.##', '######', '##.###', '##..##', '##..##', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  S: ['.####.', '##..##', '##....', '.####.', '....##', '##..##', '.####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  X: ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##'],
  b: ['##....', '##....', '#####.', '##..##', '##..##', '##..##', '#####.'],
  i: ['##', '..', '##', '##', '##', '##', '##'],
  t: ['.##..', '.##..', '#####', '.##..', '.##..', '.##..', '..###'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '+': ['......', '..##..', '..##..', '######', '..##..', '..##..', '......'],
  '·': ['..', '..', '..', '##', '##', '..', '..'],
  '!': ['##', '##', '##', '##', '##', '..', '##'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
const F5 = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], I: ['###', '.#.', '.#.', '.#.', '###'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], P: ['##.', '#.#', '##.', '#..', '#..'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  ' ': ['..', '..', '..', '..', '..'],
};
// hand-made 12 × 12 pixel glyphs for the title (1-px strokes)
const CJK_ART = {
  像: [
    '..#...#.....',
    '.#...#####..',
    '.#..#...#...',
    '##..#######.',
    '.#..#..#..#.',
    '.#..#######.',
    '.#.....##...',
    '.#....#..#.#',
    '.#...#..#.#.',
    '.#.....#.##.',
    '.#....#.#..#',
    '.#...#.#...#',
  ],
  素: [
    '.....#......',
    '.##########.',
    '.....#......',
    '..########..',
    '.....#......',
    '############',
    '....#.......',
    '...#...#....',
    '..#######...',
    '......#..#..',
    '.##########.',
    '.#...#...#..',
  ],
  游: [
    '#...#....#..',
    '.#..#...####',
    '..#####.#...',
    '.......#....',
    '#..####.####',
    '.#.#..#...#.',
    '...#..#..#..',
    '...#..#.####',
    '.#.#..#..#..',
    '.#.#..#..#..',
    '#.#...#..#..',
    '#....##.##..',
  ],
  戏: [
    '.......#..#.',
    '.......#...#',
    '#####..#....',
    '....#.######',
    '.#.#...#....',
    '..#....#..#.',
    '.#.#....##..',
    '#...#...#...',
    '.......#.#..',
    '......#..#..',
    '.....#....##',
    '...........#',
  ],
  年: [
    '..#.........',
    '.##########.',
    '.#....#.....',
    '#.....#.....',
    '.#########..',
    '.#....#.....',
    '.#....#.....',
    '############',
    '......#.....',
    '......#.....',
    '......#.....',
    '......#.....',
  ],
  代: [
    '..#.....#...',
    '.#......#.#.',
    '.#......#..#',
    '##.#########',
    '.#......#...',
    '.#.......#..',
    '.#.......#..',
    '.#.......#..',
    '.#........#.',
    '.#........##',
    '.#.........#',
    '.#.........#',
  ],
};
const CJK = Object.fromEntries(Object.entries(CJK_ART).map(([k, v]) => [k, art(v, { '#': 1 })]));
const glyphCache = new Map();
function glyph(font, ch) {
  const key = (font === F7 ? '7' : '5') + ch;
  if (!glyphCache.has(key)) glyphCache.set(key, art(font[ch] || font[' '], { '#': 1 }));
  return glyphCache.get(key);
}
function textW(font, str, sp = 1) { let w = 0; for (const ch of str) w += glyph(font, ch).w + sp; return Math.max(0, w - sp); }
/** Draw a string; returns the x after it. o: { sp, shadow (colour, 1 px right+down), outline (colour, 8-nbr), clip } */
function text(dst, font, str, x, y, col, o = {}) {
  const sp = o.sp ?? 1;
  let cx = x;
  for (const ch of str) {
    const g = glyph(font, ch);
    if (o.outline != null) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) blit(dst, g, cx + dx, y + dy, { color: o.outline, clip: o.clip });
    if (o.shadow != null) blit(dst, g, cx + 1, y + 1, { color: o.shadow, clip: o.clip });
    blit(dst, g, cx, y, { color: col, clip: o.clip });
    cx += g.w + sp;
  }
  return cx - sp;
}

// ------------------------------------------------------------------ small raster helpers (logical px)
function discFill(s, cx, cy, r, c) {
  for (let j = Math.floor(cy - r - 1); j <= Math.ceil(cy + r + 1); j++) for (let i = Math.floor(cx - r - 1); i <= Math.ceil(cx + r + 1); i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
    if (dx * dx + dy * dy <= r * r) pset(s, i, j, c);
  }
}
function ellFill(s, cx, cy, rx, ry, c) {
  for (let j = Math.floor(cy - ry - 1); j <= Math.ceil(cy + ry + 1); j++) for (let i = Math.floor(cx - rx - 1); i <= Math.ceil(cx + rx + 1); i++) {
    const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) pset(s, i, j, c);
  }
}
function rectFill(s, x0, y0, x1, y1, c) { for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) pset(s, i, j, c); }
function bres(s, x0, y0, x1, y1, c) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 400; n++) {
    pset(s, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// ------------------------------------------------------------------ level art
// stone tile with an engraved feather (16 × 16)
function makeBlock() {
  const s = spr(16, 16, STONE);
  for (let i = 0; i < 16; i++) { pset(s, i, 0, INK); pset(s, i, 15, INK); pset(s, 0, i, INK); pset(s, 15, i, INK); }
  for (let i = 1; i < 15; i++) { pset(s, i, 1, MIST); pset(s, 1, i, MIST); pset(s, i, 14, SLATE); pset(s, 14, i, SLATE); }
  pset(s, 14, 1, STONE); pset(s, 1, 14, STONE);
  const F = art([
    '.........ll.',
    '........lmml',
    '.......lmmml',
    '......lmmml.',
    '.....lmlml..',
    '....lmlml...',
    '...lmlml....',
    '..lmmml.....',
    '..lmml......',
    '.l.ll.......',
    'l...........',
  ]);
  blit(s, F, 2, 2);
  return s;
}

// square-holed gold coin (方孔钱), 4 spin frames (10 × 12)
function makeCoins() {
  const F0 = art([
    '...kkkk...',
    '.kkggggkk.',
    '.kgwgggak.',
    'kgwggggaak',
    'kggaaaagak',
    'kgga..agak',
    'kgga..agak',
    'kggggggaak',
    'kggggggaak',
    '.kggaaaak.',
    '.kkaaaakk.',
    '...kkkk...',
  ]);
  const F1 = art([
    '....kkk...',
    '...kgggk..',
    '..kgwggak.',
    '..kgwggak.',
    '..kgaaaak.',
    '..kga.gak.',
    '..kga.gak.',
    '..kgggaak.',
    '..kgggaak.',
    '..kggaaak.',
    '...kaaak..',
    '....kkk...',
  ]);
  const F2 = art([
    '....kk....',
    '...kgak...',
    '...kgak...',
    '...kwak...',
    '...kgak...',
    '...kgak...',
    '...kgak...',
    '...kgak...',
    '...kgak...',
    '...kgak...',
    '...kgak...',
    '....kk....',
  ]);
  const F3 = spr(10, 12);
  blit(F3, F1, 0, 0, { flip: true });
  return [F0, F1, F2, F3];
}

function makeCloud(discs, w, h) {
  const s = spr(w, h);
  const base = h - 2;
  for (const [cx, cy, r] of discs) discFill(s, cx, cy, r, WHITE);
  for (let i = 0; i < w; i++) for (let j = base; j < h; j++) pset(s, i, j, NONE);
  // underside shade: lower rows of each column → mist (dithered)
  for (let i = 0; i < w; i++) {
    let bot = -1;
    for (let j = h - 1; j >= 0; j--) if (pget(s, i, j) === WHITE) { bot = j; break; }
    if (bot < 0) continue;
    pset(s, i, bot, MIST);
    if (bayer(i, bot - 1) < 8) pset(s, i, bot - 1, MIST);
  }
  return s;
}

function makeShrub() {
  const s = spr(24, 18);
  const lobes = [[6, 11, 5.2], [12, 7.5, 6.2], [18, 10.5, 5], [9, 13, 5], [15, 13, 5.2]];
  for (const [cx, cy, r] of lobes) discFill(s, cx, cy, r, GRASS);
  for (let i = 0; i < 24; i++) pset(s, i, 17, NONE);
  for (const [cx, cy, r] of lobes) {   // highlight crescent top-left of each lobe
    for (let j = 0; j < 18; j++) for (let i = 0; i < 24; i++) {
      if (pget(s, i, j) !== GRASS) continue;
      const dx = i + 0.5 - (cx - 1.4), dy = j + 0.5 - (cy - 1.6);
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
      if (d < r - 0.4 && d > r - 1.8 && dx < 0 && dy < 0) pset(s, i, j, GRASSL);
    }
  }
  for (let j = 12; j < 17; j++) for (let i = 0; i < 24; i++) if (pget(s, i, j) === GRASS && bayer(i, j) < (j - 11) * 3) pset(s, i, j, HILLD);
  for (const [i, j] of [[8, 9], [15, 6], [18, 12], [11, 13]]) { pset(s, i, j, RED); pset(s, i + 1, j, RED); pset(s, i, j + 1, RED); pset(s, i + 1, j + 1, AMBER); pset(s, i, j, WHITE); }
  outline(s, INK);
  return s;
}

// ------------------------------------------------------------------ the hermit crab (faces right)
// An original critter: a little orange hermit crab that wears one of the level's stone tiles as its shell.
// pose: { legs: 0|1, claw: 'down'|'up', eyes: 'up'|'tall'|'peer', lean }
function makeCrab(p) {
  const s = spr(32, 31);
  const ox = 10, oy = 24;           // ground contact row = oy
  const P = (x, y, c) => pset(s, ox + x, oy + y, c);
  const ln = p.lean || 0;           // leaning forward over an edge
  // legs: three pairs of little sticks, two-frame shuffle
  for (const x of p.legs ? [0, 3, 6] : [1, 4, 7]) { P(x, -2 + ln, ORANGE); P(x + (p.legs ? -1 : 1), -1 + ln, ORANGE); P(x + (p.legs ? -1 : 1), 0, ORANGE); }
  // shell: a little stone tile on the back, with its feather
  rectFill(s, ox - 8, oy - 14, ox + 2, oy - 4, STONE);
  for (let i = -8; i < 2; i++) { P(i, -14, MIST); P(i, -5, SLATE); }
  for (let j = -14; j < -4; j++) { P(-8, j, MIST); P(1, j, SLATE); }
  P(-1, -12, SLATE); P(-2, -11, SLATE); P(-3, -10, SLATE); P(-4, -9, SLATE); P(-5, -8, SLATE); P(-6, -7, SLATE);
  P(-1, -11, MIST); P(-2, -10, MIST); P(-3, -9, MIST); P(-4, -8, MIST);
  // round body peeking out of the shell, red belly, a gold cheek
  ellFill(s, ox + 4.5 + ln, oy - 5 + ln, 4.6, 3.6, ORANGE);
  for (let i = 0; i < 10; i++) if (pget(s, ox + i + ln, oy - 2 + ln) === ORANGE) P(i + ln, -2 + ln, RED);
  P(7 + ln, -5 + ln, GOLD);
  // claw (pincer opening forward)
  const cy = (p.claw === 'up' ? -11 : -5) + ln;
  discFill(s, ox + 10.5 + ln, oy + cy + 0.5, 2.3, ORANGE);
  P(11 + ln, cy, NONE); P(12 + ln, cy, NONE);
  P(9 + ln, cy + 1, RED);
  if (p.claw === 'up') bres(s, ox + 7 + ln, oy - 5 + ln, ox + 9 + ln, oy + cy + 2, ORANGE);
  // eyes on stalks, drawn last (eyeballs white, pupils forward)
  const eye = (bx, ex, ey, look = 0) => {
    bres(s, ox + bx, oy - 8 + ln, ox + ex, oy + ey + (ey > -8 ? -1 : 1), ORANGE);
    rectFill(s, ox + ex - 1, oy + ey - 1, ox + ex + 1, oy + ey + 1, WHITE);
    P(ex, ey + look, INK);
  };
  if (p.eyes === 'peer') { eye(4 + ln, 14 + ln, 3, 0); eye(7 + ln, 18 + ln, 5, 0); }
  else {
    const ey = p.eyes === 'peek' ? -20 : p.eyes === 'tall' ? -14 : -11;
    eye(4, 4, ey, -1); eye(7, 7, ey + 1, -1);
  }
  outline(s, INK);
  return s;
}

// ------------------------------------------------------------------ effects
const SPARK = [
  art(['...g...', '...w...', '..gwg..', 'gwwwwwg', '..gwg..', '...w...', '...g...']),
  art(['w.....w', '...g...', '...w...', '.gwwwg.', '...w...', '...g...', 'w.....w']),
  art(['.......', '.w...w.', '...g...', '..gwg..', '...g...', '.w...w.', '.......']),
];
const DUST = [
  art(['..mm...', '.mwwm..', 'mwwwwm.', 'mwwwwwm', '.mmmmm.']),
  art(['...mm....', '.mmwwm.m.', 'mwwwwwmwm', 'mwwwwwwwm', '.mmmmmmm.']),
  art(['.m...w...', 'm.w.m.m.m', '.m.m...m.']),
];
const BANG = art(['kkkk', 'kggk', 'kggk', 'kggk', 'kggk', 'kkkk', 'kggk', 'kkkk']);
const QUERY = art(['.kkkkk.', 'kwwwwwk', 'kwkkkwk', 'kkk.kwk', '..kkwwk', '..kwkkk', '..kkk..', '..kwk..', '..kkk..']);

// HUD icons (drawn on the black bar, so no ink outlines)
const ICON_PEL = art([
  '..www........',
  '.wwwww.......',
  'wwwkwwooooooo',
  'wwwwwwwoooooor',
  '.wwww........',
  '..www.oooooo.',
  '..wwwwooooo..',
  '.wwwww.......',
  'wwwwww.......',
]);
const ICON_COIN = art(['.ggg.', 'gwgga', 'gg.ga', 'gg.ga', 'gggaa', 'ggaaa', '.aaa.']);
const BIG = {   // big two-tone "1UP" (9 rows, 3-px stems)
  '1': ['..###', '.####', '#####', '..###', '..###', '..###', '..###', '..###', '..###'],
  U: ['###..###', '###..###', '###..###', '###..###', '###..###', '###..###', '###..###', '.######.', '..####..'],
  P: ['######.', '###.###', '###.###', '###.###', '######.', '###....', '###....', '###....', '###....'],
};
function makeOneUp(top, bot) {
  const s = spr(26, 13);
  let x = 2;
  for (const ch of '1UP') {
    const g = BIG[ch];
    g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') pset(s, x + i, 2 + j, j < 4 ? top : bot); });
    x += g[0].length + 1;
  }
  // drop shadow then outline
  const sh = spr(26, 13);
  for (let j = 0; j < 13; j++) for (let i = 0; i < 26; i++) if (pget(s, i, j) !== NONE) pset(sh, i + 1, j + 1, INK);
  blit(sh, s, 0, 0);
  return outline(sh, INK, true);
}

// ------------------------------------------------------------------ the rider rasteriser
const RW = 140, RH = 128, AX = 66, AY = 112;     // buffer, anchor pixel corner (bottom-bracket road point)
const R_WHITE = 1, R_WING = 2, R_LEGF = 3, R_LEGN = 4, R_BILL = 5, R_POUCH = 6, R_FRAME = 7, R_WHEEL = 8, R_PART = 9, R_CREST = 10, R_EYE = 11;
const OUTLINED = new Set([R_WHITE, R_WING, R_LEGF, R_LEGN, R_BILL, R_POUCH, R_FRAME, R_PART, R_CREST, R_EYE]);

function makeRaster() {
  return { idx: new Uint8Array(RW * RH), role: new Uint8Array(RW * RH), tmp: [] };
}

function rasterRider(R, P, squashPx) {
  const { idx, role } = R;
  idx.fill(NONE); role.fill(0);
  const pl = P.place;
  const ox = pl.x - AX * PX, oy = pl.y - AY * PX, G = pl.y;
  const T = (p) => {
    const h = G - p[1];
    const f = h <= 40 ? 0 : h >= 280 ? 1 : (h - 40) / 240;
    return [(p[0] - ox) / PX, (p[1] + squashPx * PX * f - oy) / PX];
  };
  const put = (i, j, c, r) => { if (i >= 0 && j >= 0 && i < RW && j < RH) { idx[j * RW + i] = c; role[j * RW + i] = r; } };
  const fillPoly = (pts, c, r) => {
    const q = pts.map(T);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of q) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const n = q.length, xs = [];
    for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(RH - 1, Math.ceil(y1)); j++) {
      const py = j + 0.5;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const a = q[k], b = q[(k + 1) % n];
        if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.ceil(xs[k] - 0.5); i <= Math.floor(xs[k + 1] - 0.5); i++) put(i, j, c, r);
      }
    }
  };
  const thick = (pts, w, c, r) => {
    const q = pts.map(T), h = w / 2;
    for (let k = 0; k + 1 < q.length; k++) {
      const a = q[k], b = q[k + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
      for (let j = Math.floor(Math.min(a[1], b[1]) - h); j <= Math.ceil(Math.max(a[1], b[1]) + h); j++) {
        for (let i = Math.floor(Math.min(a[0], b[0]) - h); i <= Math.ceil(Math.max(a[0], b[0]) + h); i++) {
          const px = i + 0.5, py = j + 0.5;
          let t = ((px - a[0]) * dx + (py - a[1]) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - a[0] - t * dx, ey = py - a[1] - t * dy;
          if (ex * ex + ey * ey <= h * h) put(i, j, c, r);
        }
      }
    }
  };
  const thin = (pts, c, r) => {
    const q = pts.map(T);
    for (let k = 0; k + 1 < q.length; k++) {
      let x0 = Math.floor(q[k][0]), y0 = Math.floor(q[k][1]);
      const x1 = Math.floor(q[k + 1][0]), y1 = Math.floor(q[k + 1][1]);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (let n = 0; n < 300; n++) {
        put(x0, y0, c, r);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
  };
  const ring = (c0, r0, r1, c, r) => {
    const [cx, cy] = T(c0);
    for (let j = Math.floor(cy - r1 - 1); j <= Math.ceil(cy + r1 + 1); j++) for (let i = Math.floor(cx - r1 - 1); i <= Math.ceil(cx + r1 + 1); i++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 <= r1 * r1 && (r0 < 0 || d2 > r0 * r0)) put(i, j, c, r);
    }
  };
  const B = P.bird;
  const WR = WHEEL_R / PX;   // 15.5 px
  const parts = rigParts(P);
  const nearLeg = parts.filter((q) => q.role === 'leg' || q.role === 'foot');
  for (const part of parts) {
    if (part.role === 'tail') for (const q of nearLeg) fillPoly(q.pts, ORANGE, R_LEGN);   // the plumage covers the thigh
    switch (part.role) {
      case 'legFar': case 'footFar': fillPoly(part.pts, ORANGE, R_LEGF); break;
      case 'crankFar': thick(part.pts, 1.2, INK, R_PART); break;
      case 'tire': ring(part.c, WR - 2.05, WR + 0.05, INK, R_WHEEL); break;
      case 'rim': ring(part.c, WR - 3.0, WR - 2.05, STONE, R_WHEEL); break;
      case 'spoke': { const j = +part.name.split('_')[1]; if (j % 3 === 0) thin([part.pts[0], [lerp(part.pts[0][0], part.pts[1][0], 0.92), lerp(part.pts[0][1], part.pts[1][1], 0.92)]], STONE, R_WHEEL); break; }
      case 'hub': ring(part.c, -1, 1.25, INK, R_WHEEL); break;
      case 'chain': thin(part.pts, INK, R_WHEEL); break;
      case 'frame': thick(part.pts, 1.7, RED, R_FRAME); break;
      case 'fork': thick(part.pts, 1.6, RED, R_FRAME); break;
      case 'stem': case 'bars': thick(part.pts, 1.3, STONE, R_PART); break;
      case 'seatpost': thick(part.pts, 1.2, STONE, R_PART); break;
      case 'saddle': thick(part.pts, 2.1, INK, R_PART); break;
      case 'ring': ring(part.c, -1, part.r / PX, STONE, R_PART); break;
      case 'tail': case 'body': case 'neck': fillPoly(part.pts, WHITE, R_WHITE); break;
      case 'wing': fillPoly(part.pts, WHITE, R_WING); break;
      case 'secondaries': thick(part.pts, 1.8, INK, R_PART); break;
      case 'primary': thick(part.pts, 1.4, INK, R_PART); break;
      case 'head': { const c = [part.c[0] - 2, part.c[1] - 1]; ring(c, -1, part.r / PX + 1.0, WHITE, R_WHITE); break; }
      case 'crest': thin(part.pts, WHITE, R_CREST); break;
      case 'pouch': fillPoly(part.pts, ORANGE, R_POUCH); break;
      case 'bill': fillPoly(part.pts, ORANGE, R_BILL); thin(B.lowerJawLine, INK, R_BILL); break;
      case 'nail': fillPoly(part.pts, RED, R_BILL); break;
      case 'pupil': {
        const [x, y] = T(part.c);
        const ex = Math.floor(x) - 2, ey = Math.floor(y) - 1;
        put(ex, ey, INK, R_EYE);
        if (B.eye.mode === 'wide') { put(ex, ey - 1, INK, R_EYE); put(ex + 1, ey - 1, WHITE, R_EYE); }
        break;
      }
      case 'eyeShut': { const [x, y] = T(part.c ?? part.pts[0]); const ex = Math.floor(T(part.pts[0])[0]) - 1, ey = Math.floor(y) - 1; put(ex - 1, ey, INK, R_EYE); put(ex, ey + 1, INK, R_EYE); put(ex + 1, ey, INK, R_EYE); void x; break; }
      case 'leg': case 'foot': break;
      case 'crank': thick(part.pts, 1.5, INK, R_PART); break;
      case 'pedal': thick(part.pts, 1.4, INK, R_PART); break;
      default: break;
    }
  }
  // inner contours: the folded wing over the body (mist feather line), near leg over far leg (ink),
  // and a 1-px mist shade along the underside of the white plumage
  const mark = [], shade = [], sep = [];
  for (let j = 1; j < RH - 1; j++) for (let i = 1; i < RW - 1; i++) {
    const k = j * RW + i, r = role[k];
    if (r === R_WING) {
      if (role[k + RW] === R_WHITE || role[k - 1] === R_WHITE) mark.push(k);
      else if (idx[k + RW] === NONE) shade.push(k);
    } else if (r === R_WHITE && idx[k] === WHITE) {
      if (idx[k + RW] === NONE || role[k + RW] === R_LEGN || role[k + RW] === R_FRAME) shade.push(k);
    } else if (r === R_LEGF) {
      if (role[k - 1] === R_LEGN || role[k + 1] === R_LEGN || role[k - RW] === R_LEGN || role[k + RW] === R_LEGN) sep.push(k);
    }
  }
  for (const k of mark) idx[k] = MIST;
  for (const k of shade) idx[k] = MIST;
  for (const k of sep) idx[k] = INK;
  // 1-px outline around everything that is not a wheel
  mark.length = 0;
  for (let j = 1; j < RH - 1; j++) for (let i = 1; i < RW - 1; i++) {
    const k = j * RW + i;
    if (idx[k] !== NONE) continue;
    if (OUTLINED.has(role[k - 1]) || OUTLINED.has(role[k + 1]) || OUTLINED.has(role[k - RW]) || OUTLINED.has(role[k + RW])) mark.push(k);
  }
  for (const k of mark) idx[k] = INK;
  return { ox, oy };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ------------------------------------------------------------------ p5 images with nearest filtering
function nearestImage(w, h) {
  const img = createImage(w, h);
  try {
    const r = (window.p5 && window.p5.instance && window.p5.instance._renderer) || window._renderer;
    r.getTexture(img).setInterpolation(NEAREST, NEAREST);
  } catch (e) { console.warn('[pixel] nearest filtering unavailable', e); }
  return img;
}
function upload(img, buf, w, h, imgData) {
  const out = new Uint32Array(imgData.data.buffer);
  for (let k = 0; k < w * h; k++) out[k] = LUT[buf[k]];
  img.drawingContext.putImageData(imgData, 0, 0);
  img.setModified(true);
}

// ------------------------------------------------------------------ timeline helpers
const jumpH = (u) => { if (u <= T_UP || u >= T_DN) return 0; const t = (u - T_UP) / (T_DN - T_UP); return JUMP_H * 4 * t * (1 - t); };
const squashAt = (u) => (u >= 1.5 && u < 2.0 ? 1 : u >= T_DN && u < 3.62 ? 2 : u >= 3.62 && u < 3.76 ? 1 : 0);
const coinsTaken = (u) => COIN_U.filter((c) => u >= c).length;
const posMod = (a, n) => ((a % n) + n) % n;
const SPIN = [0, 1, 2, 3, 0, 0];     // coin spin: face, ¾, edge, ¾ (mirrored), face, face — 12 fps, one turn per beat

const SHRUB_X = 226;                // the berry shrub the crab hides behind
const PATROL = [212, 222];          // the crab's beat on the right-hand ground (origin columns)
const HIDE_X = 238;                 // the crab's hiding spot behind the berry shrub
/** Crab state at time u (logical px): { x (sprite left), y (sprite top), flip, pose, hidden, bang, query } */
function crabAt(u) {
  const top = GR - 25;                 // feet on row GR − 1
  const walk = Math.floor(u * 6) & 1;
  const at = (cx, faceLeft, pose, extra = {}) => ({ x: Math.round(cx) - (faceLeft ? 21 : 10), y: top + (extra.dy || 0), flip: faceLeft, pose, ox: Math.round(cx), ...extra });
  const patrol = (t) => {
    const p = posMod((t - 3.5) / 7 + 0.07, 1), fwd = p < 0.5;   // phased so it faces the landing at u = 3.5
    return { cx: fwd ? PATROL[0] + (PATROL[1] - PATROL[0]) * p * 2 : PATROL[1] - (PATROL[1] - PATROL[0]) * (p * 2 - 1), fwd };
  };
  if (u < 3.5) { const { cx, fwd } = patrol(u); return at(cx, !fwd, { legs: walk, claw: 'down', eyes: 'up' }); }
  const c35 = patrol(3.5).cx;
  if (u < 3.62) return at(c35, false, { legs: 0, claw: 'up', eyes: 'tall' }, { dy: u < 3.56 ? -3 : -1, bang: true });
  if (u < 3.84) { const k = (u - 3.62) / 0.22; return at(lerp(c35, HIDE_X, k), false, { legs: walk, claw: 'up', eyes: 'up' }, { bang: true }); }
  if (u < 5.6) return at(HIDE_X, false, { legs: 0, claw: 'down', eyes: 'up' }, { hidden: true });
  if (u < 7.0) return at(HIDE_X, false, { legs: 0, claw: 'down', eyes: 'peek' }, { hidden: true });
  const PIT_EDGE = PIT1 + 10;         // origin when its claw reaches over the pit edge (facing left)
  const t1 = 7.0 + (HIDE_X - PIT_EDGE) / 30;
  if (u < t1) return at(HIDE_X - (u - 7.0) * 30, true, { legs: walk, claw: 'down', eyes: 'up' });
  const blink = posMod(u - t1, 2.2) > 2.05;
  return at(PIT_EDGE, true, { legs: 0, claw: 'down', eyes: blink ? 'up' : 'peer', lean: 1 }, { query: u > t1 + 0.9 && u < t1 + 2.1 });
}

// ------------------------------------------------------------------ scene
export default {
  freezeU: 2.75,
  ride: RIDE,
  cues: [
    { u: 1.5, name: 'crouch' }, { u: 2.0, name: 'jump' },
    ...COIN_U.map((u) => ({ u, name: 'coin' })),
    { u: 3.5, name: 'land' }, { u: 4.0, name: 'oneUp' },
  ],

  async init(K, info) {
    this.index = info?.index ?? 15;
    this.raster = makeRaster();
    this.scr = { w: SW, h: SH, d: new Uint8Array(SW * SH) };
    this.fx = { w: SW, h: SH, d: new Uint8Array(SW * SH) };
    this.scrImg = nearestImage(SW, SH);
    this.fxImg = nearestImage(SW, SH);
    this.sprImg = nearestImage(RW, RH);
    this.scrData = new ImageData(SW, SH);
    this.fxData = new ImageData(SW, SH);
    this.sprData = new ImageData(RW, RH);
    this.block = makeBlock();
    this.coins = makeCoins();
    this.shrub = makeShrub();
    this.oneUpSpr = [makeOneUp(WHITE, GOLD), makeOneUp(GOLD, ORANGE)];
    this.clouds = [
      { s: makeCloud([[7, 9, 5], [14, 6, 6.5], [22, 7, 5.5], [29, 9.5, 4]], 34, 14), x: 18, y: 44 },
      { s: makeCloud([[6, 7, 4], [12, 5, 5], [18, 7, 4]], 23, 11), x: 112, y: 58 },
      { s: makeCloud([[7, 10, 5.5], [15, 6.5, 7], [24, 6, 6], [32, 9, 5], [38, 11, 3.5]], 43, 16), x: 168, y: 40 },
      { s: makeCloud([[5, 6, 3.5], [10, 4.5, 4.5], [15, 6.5, 3.5]], 19, 9), x: 260, y: 72 },
    ];
    const crabKeys = new Map();
    this.crab = (p) => {
      const k = JSON.stringify(p);
      if (!crabKeys.has(k)) crabKeys.set(k, makeCrab(p));
      return crabKeys.get(k);
    };
    this.buildSky();
    this.buildLevel();
    this.buildHud();
    this.plan();
  },

  dispose() {
    // free the three live textures (they are keyed by p5.Image in the renderer's texture map)
    try {
      const r = window.p5?.instance?._renderer;
      for (const img of [this.scrImg, this.fxImg, this.sprImg]) {
        const t = img && r?.textures?.get(img);
        if (t) { t.remove(); r.textures.delete(img); }
      }
    } catch {}
    this.scrImg = this.fxImg = this.sprImg = null;
  },

  // ---------------------------------------------------------------- static layers
  buildSky() {
    const S = spr(SW, SH, SKY);
    // far ranges: stone-grey peaks with snow caps and slate east faces, their feet lost in a pale haze
    const peaks = [[-12, 146, 1.0], [38, 132, 0.95], [92, 150, 1.1], [136, 128, 0.9], [188, 142, 1.0], [232, 134, 0.95], [272, 148, 1.0]];
    for (let i = 0; i < SW; i++) {
      let best = 1e9, pk = null;
      for (const p of peaks) { const y = p[1] + Math.abs(i + 0.5 - p[0]) * p[2]; if (y < best) { best = y; pk = p; } }
      const top = Math.round(best);
      const lit = i + 0.5 <= pk[0];
      const snow = pk[1] + 4 + ((i * 7) % 3) + (lit ? 0 : 1);
      for (let j = top; j < GR; j++) {
        let c = lit ? STONE : SLATE;
        if (j < snow) c = lit ? WHITE : MIST;
        else if (j === top && lit) c = MIST;
        S.d[j * SW + i] = c;
      }
    }
    for (let j = 164; j < GR; j++) {
      const lvl = j < 168 ? 4 : j < 172 ? 8 : j < 176 ? 12 : 16;
      for (let i = 0; i < SW; i++) if (bayer(i, j) < lvl) S.d[j * SW + i] = MIST;
    }
    // near hills
    const hills = [[26, 34, 26], [96, 22, 14], [166, 46, 34], [236, 30, 20]];
    for (const [cx, rw, h] of hills) {
      for (let i = cx - rw; i <= cx + rw; i++) {
        if (i < 0 || i >= SW) continue;
        const t = (i + 0.5 - cx) / rw;
        if (Math.abs(t) > 1) continue;
        const top = Math.round(GR - h * Math.pow(1 - t * t, 0.55));
        for (let j = top; j < GR; j++) {
          let c = HILL;
          if (j === top) c = HILLD;
          else if (t > 0.38 && ((i + j) & 1) === 0) c = HILLD;
          else if (t > 0.72) c = HILLD;
          else if (j === top + 1 && t < -0.1 && t > -0.75) c = GRASSL;
          S.d[j * SW + i] = c;
        }
        // side outline where the slope is steep
        const tl = (i - 0.5 - cx) / rw, tr = (i + 1.5 - cx) / rw;
        const ytl = Math.abs(tl) <= 1 ? Math.round(GR - h * Math.pow(1 - tl * tl, 0.55)) : GR;
        const ytr = Math.abs(tr) <= 1 ? Math.round(GR - h * Math.pow(1 - tr * tr, 0.55)) : GR;
        for (let j = top; j < Math.max(ytl, ytr) && j < GR; j++) S.d[j * SW + i] = HILLD;
      }
    }
    // little round trees on the big hill
    for (const [tx, ty] of [[150, 172], [158, 168], [184, 170]]) {
      const T = spr(7, 9);
      discFill(T, 3.5, 3.5, 3.2, HILL);
      pset(T, 3, 7, SOIL); pset(T, 3, 8, SOIL); pset(T, 2, 2, GRASSL); pset(T, 1, 3, GRASSL);
      for (let j = 3; j < 7; j++) for (let i = 4; i < 7; i++) if (pget(T, i, j) === HILL && ((i + j) & 1)) pset(T, i, j, HILLD);
      outline(T, HILLD);
      blit(S, T, tx - 3, ty - 8);
    }
    this.sky = S.d;
  },

  buildLevel() {
    const L = spr(SW, SH);
    this.lvl = L;
    // ground: grass cap + soil tiles, pit in the middle
    const soilTile = art([
      'bbbbbbbbbbbbbbbb',
      'bbddddbbbbbbbbbb',
      'bdaabbdbbbbbdbbb',
      'bdabbbbdbbbbbbbb',
      'bdbbbbbdbbbbbbbb',
      'bbdbbbdbbbbbbbbb',
      'bbbdddbbbbbddddb',
      'bbbbbbbbbbdaabbd',
      'bbbbdbbbbdabbbbd',
      'bbbbbbbbbdbbbbbd',
      'bbbbbbbbbbdbbbdb',
      'bddbbbbbbbbdddbb',
      'dabdbbbbbbbbbbbb',
      'dbbdbbbbbdbbbbbb',
      'bddbbbbbbbbbbbbb',
      'bbbbbbbbbbbbbbbb',
    ]);
    const grassD = [4, 5, 5, 4, 3, 3, 4, 5, 6, 5, 4, 4, 3, 4, 5, 4];
    for (let i = 0; i < SW; i++) {
      if (i >= PIT0 && i < PIT1) continue;
      const gd = grassD[i & 15];
      for (let j = GR; j < SH; j++) {
        let c;
        const rj = j - GR;
        if (rj === 0) c = GRASSL;
        else if (rj < gd) c = (rj === 1 && (i % 7 === 2)) ? GRASSL : GRASS;
        else if (rj === gd) c = INK;
        else {
          const row = Math.floor((j - GR - 6) / 16);
          const off = (row & 1) ? 8 : 0;
          c = soilTile.d[(posMod(j - GR - 6, 16)) * 16 + posMod(i + off, 16)];
          if (rj === gd + 1 && c === GROUND && (i & 3) === 1) c = SOIL;
        }
        L.d[j * SW + i] = c;
      }
    }
    // pit walls: ink edge + soil shade column, rounded grass lip
    for (let j = GR; j < SH; j++) {
      L.d[j * SW + PIT0 - 1] = INK; L.d[j * SW + PIT1] = INK;
      if (j > GR + 5) { L.d[j * SW + PIT0 - 2] = SOIL; L.d[j * SW + PIT1 + 1] = SOIL; }
    }
    for (let j = GR; j < SH; j++) for (let i = PIT0; i < PIT1; i++) L.d[j * SW + i] = INK;
    L.d[GR * SW + PIT0 - 1] = NONE; L.d[GR * SW + PIT1] = NONE;
    L.d[GR * SW + PIT0 - 2] = INK; L.d[GR * SW + PIT1 + 1] = INK;
    for (let i = 0; i < SW; i++) if (L.d[GR * SW + i] === GRASSL) L.d[(GR - 1) * SW + i] = (i >= PIT0 - 2 && i <= PIT1 + 1) ? NONE : INK;
    L.d[(GR - 1) * SW + PIT0 - 2] = NONE; L.d[(GR - 1) * SW + PIT1 + 1] = NONE;
    // grass tufts
    const tuft = art(['.k...k.', 'kLk.kLk', 'kGLkLGk', 'kGGGGGk']);
    for (const tx of [12, 70, 150, 186]) blit(L, tuft, tx, GR - 4);
    // floating stone tiles
    this.blocks = [[20, 80], [36, 80], [52, 80], [68, 80]];
    for (const [bx, by] of this.blocks) blit(L, this.block, bx, by);
    // status bar
    rectFill(L, 0, 0, SW, HUD_H, INK);
    for (let i = 0; i < SW; i++) { L.d[(HUD_H - 2) * SW + i] = (i & 1) ? SLATE : INK; L.d[(HUD_H - 1) * SW + i] = SLATE; }
  },

  buildHud() {
    const L = this.lvl;
    this.hud = {};
    const y1 = 5;
    blit(L, ICON_PEL, 6, y1 - 1);
    this.hud.lives = [6 + ICON_PEL.w + 2, y1];
    blit(L, ICON_COIN, 46, y1);
    this.hud.coins = [46 + ICON_COIN.w + 2, y1];
    const xs = text(L, F7, 'SCORE', 88, y1, GOLD);
    this.hud.score = [xs + 5, y1];
    const sw = textW(F7, 'STAGE 16');
    text(L, F7, 'STAGE', SW - 6 - sw, y1, GOLD);
    text(L, F7, '16', SW - 6 - textW(F7, '16'), y1, WHITE);
    // row 2: the stage title in pixel type (hand-made 12 × 12 CJK glyphs)
    const y2 = 16, base = y2 + 11;      // bottom row of the CJK cell
    let x = 6;
    x = text(L, F7, '8-bit', x, base - 6, WHITE) + 4;
    for (const ch of '像素游戏') { blit(L, CJK[ch], x, y2, { color: WHITE }); x += 13; }
    x += 2;
    x = text(L, F7, '·', x, base - 6, MIST) + 3;
    x = text(L, F7, '1980', x, base - 6, WHITE) + 3;
    for (const ch of '年代') { blit(L, CJK[ch], x, y2, { color: WHITE }); x += 13; }
    const en = '8-BIT PIXEL GAME';
    text(L, F5, en, SW - 6 - textW(F5, en), base - 4, MIST);
  },

  /** Positions of the gag elements, computed from the actual ride (pure, once). */
  plan() {
    const at = (u) => {
      const x = PROF.x(u), wx = panelLeft(this.index) + x;
      const st = { crank: (TAU * wx) / CRANK_DIST, wheel: wx / WHEEL_R, t: sceneStart(this.index) + u, v: PROF.v(u) };
      const place = { x, y: 800, scale: 1, rot: 0, ...this.path(u, { x, y: 800, scale: 1, rot: 0 }) };
      return rigPlaced(rigPose(st, this.mods(u)), place);
    };
    // the five coins sit exactly where the bill snaps shut on each eighth (bill mouth ≈ rig (180, −278))
    this.coinPos = COIN_U.map((uc) => {
      const pl = this.path(uc, { x: PROF.x(uc), y: 800, scale: 1, rot: 0 });
      return [Math.round((pl.x + 180) / PX) - 5, Math.round((pl.y - 278) / PX) - 6];
    });
    const P4 = at(4.0);
    const hc = P4.bird.head.c;
    this.oneUp = [Math.round(hc[0] / PX) + 4, Math.round((hc[1] - 20) / PX) - 16];
    const x35 = PROF.x(T_DN);
    this.dust = [Math.round((x35 - 102) / PX), Math.round((x35 + 106) / PX)];
    this.dust0 = Math.round((PROF.x(T_UP) - 102) / PX);
  },

  // ---------------------------------------------------------------- hooks
  path(u, base) {
    if (u <= 1 || u >= 5) return base;
    let { x, y } = base, rot = 0;
    const h = jumpH(u);
    if (h > 0) {
      y = base.y - h;
      rot = u < 2.2 ? -0.07 : u >= 3.3 ? 0.06 : 0;    // take-off / descent sprite frames
    }
    return { ...base, x: Math.round(x / PX) * PX, y: Math.round(y / PX) * PX, rot };
  },

  mods(u) {
    if (u <= 1 || u >= 5) return {};
    const m = {};
    if (u > T_UP && u < T_DN) m.bob = 0;            // mid-air: no pedalling bob, the bill holds still
    if (u >= 2.2 && u < 3.3) m.feetOff = 0.7;
    for (const c of COIN_U) if (u >= c - 0.12 && u < c) m.billOpen = 0.6;
    if (u >= 1.5 && u < 2.0) m.eye = 'wide';
    if (u >= 4.0 && u < 4.45) { m.billOpen = 0.4; m.eye = 'closed'; }
    return m;
  },

  // ---------------------------------------------------------------- picture
  render(K, u, ctx) {
    const S = this.scr, D = S.d;
    D.set(this.sky);
    // clouds drift left one pixel per beat
    const drift = Math.floor((u + 7) * 2);
    for (const c of this.clouds) blit(S, c.s, posMod(c.x - drift + 40, 300) - 40, c.y, { clip: [0, HUD_H, SW, GR] });
    // level
    const L = this.lvl.d;
    for (let k = 0; k < SW * SH; k++) if (L[k] !== NONE) D[k] = L[k];
    // coins (spin: 4 frames at 8 fps)
    const cf = this.coins[SPIN[posMod(Math.floor(u * 12) + 1, 6)]];   // one turn per beat; full face on the freeze (u = 2.75)
    for (const [cx, cy] of [[39, 66], [55, 66]]) blit(S, cf, cx, cy);
    const taken = coinsTaken(u);
    this.coinPos.forEach(([cx, cy], k) => { if (k >= taken) blit(S, cf, cx, cy); });
    // the crab (behind the shrub)
    const cr = crabAt(u);
    blit(S, this.crab(cr.pose), cr.x, cr.y, { flip: cr.flip });
    blit(S, this.shrub, SHRUB_X, GR - this.shrub.h + 1);
    if (cr.bang) blit(S, BANG, cr.ox + 4, cr.y + 2);
    if (cr.query) blit(S, QUERY, cr.ox - 6, cr.y + 2);
    this.drawHud(S, u);
    upload(this.scrImg, D, SW, SH, this.scrData);
    push();
    noStroke(); noTint(); imageMode(CORNER);
    image(this.scrImg, 0, 0, SW * PX, SH * PX);
    // the rider sprite
    if (ctx.rider.visible) {
      const P = ctx.rider.placed;
      const sq = u > 1 && u < 5 ? squashAt(u) : 0;
      const { ox, oy } = rasterRider(this.raster, P, sq);
      upload(this.sprImg, this.raster.idx, RW, RH, this.sprData);
      image(this.sprImg, ox, oy, RW * PX, RH * PX);
    }
    // effects layer
    if (this.drawFx(u)) {
      upload(this.fxImg, this.fx.d, SW, SH, this.fxData);
      image(this.fxImg, 0, 0, SW * PX, SH * PX);
    }
    pop();
  },

  drawHud(S, u) {
    const lives = u >= 4.0 ? 4 : 3;
    const lifeBlink = u >= 4.0 && u < 5.2 && (Math.floor(u * 8) & 1);
    text(S, F7, '×', this.hud.lives[0], this.hud.lives[1], WHITE);
    text(S, F7, String(lives), this.hud.lives[0] + 6, this.hud.lives[1], lifeBlink ? GOLD : WHITE);
    const n = 95 + coinsTaken(u);
    const [cx, cy] = this.hud.coins;
    text(S, F7, '×', cx, cy, WHITE);
    const dx = cx + 6;
    const flash = u >= 3.25 && u < 4.0 && (Math.floor(u * 10) & 1);
    if (n < 100) text(S, F7, String(n).padStart(2, '0'), dx, cy, WHITE);
    else {
      const k = clamp01((u - 3.25) / 0.16);
      const off = Math.floor(k * 9);
      const clip = [dx, cy, dx + 14, cy + 7];
      if (off < 9) text(S, F7, '99', dx, cy - off, WHITE, { clip });
      text(S, F7, '00', dx, cy + 9 - off, flash ? GOLD : WHITE, { clip });
    }
    const score = 12400 + 100 * coinsTaken(u);
    text(S, F7, String(score).padStart(6, '0'), this.hud.score[0], this.hud.score[1], WHITE);
  },

  drawFx(u) {
    if (u < 1.95 || u > 5.7) return false;
    const F = this.fx;
    F.d.fill(NONE);
    let any = false;
    // take-off dust
    if (u >= T_UP && u < T_UP + 0.3) { const f = Math.floor((u - T_UP) / 0.1); const s = DUST[f]; blit(F, s, this.dust0 - s.w - f * 2, GR - s.h, { flip: true }); blit(F, s, this.dust0 + 1 + f * 2, GR - s.h); any = true; }
    // coin sparkles and +100
    COIN_U.forEach((uc, k) => {
      const a = u - uc;
      if (a < 0 || a >= (k < 4 ? 0.25 : 0.5)) return;   // each +100 lives exactly one eighth (the last one longer)
      const [cx, cy] = this.coinPos[k];
      if (a < 0.24) { const s = SPARK[Math.floor(a / 0.08)]; blit(F, s, cx + 2, cy + 3); }
      const rise = Math.floor(a * 30);
      text(F, F5, '+100', cx - 2, cy - 5 - rise, a < 0.2 || (Math.floor(a * 30) & 1) ? WHITE : GOLD, { shadow: INK });
      any = true;
    });
    // landing dust
    if (u >= T_DN && u < T_DN + 0.36) {
      const f = Math.floor((u - T_DN) / 0.12), s = DUST[f], sp = f * 3;
      for (const [x, dir] of [[this.dust[0], -1], [this.dust[0], 1], [this.dust[1], -1], [this.dust[1], 1]]) blit(F, s, dir < 0 ? x - s.w - 2 - sp : x + 3 + sp, GR - s.h, { flip: dir < 0 });
      any = true;
    }
    // 1UP: pops on the downbeat, blinks through the gold palette and floats up, then flickers out
    if (u >= 4.0 && u < 5.5) {
      const a = u - 4.0;
      const vis = a < 1.15 || (Math.floor(a * 15) & 1);
      if (vis) {
        const spr1 = this.oneUpSpr[Math.floor(a * 7.5) & 1];
        const rise = Math.min(24, Math.floor(a * 20)) + (a < 0.07 ? -2 : 0);
        blit(F, spr1, this.oneUp[0] - (spr1.w >> 1), this.oneUp[1] - rise);
      }
      any = true;
    }
    return any;
  },
};
