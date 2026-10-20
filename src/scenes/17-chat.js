// 17 · 早期聊天窗口 / Early Chat Window · 2000s
//
// A conversation window of the fictional instant messenger 「鹈信 PeliMsg」 on a fictional early-2000s desktop:
// glossy banded title bar, menu, a toolbar of original glossy icons, the contact strip, the chat log with
// timestamps, two avatar frames (the friend's cartoon pelican, my flower photo), a format bar with the
// 「窗口抖动」 nudge button, a two-line input box whose first text baseline IS the road (y = 800), the
// 关闭(C)/发送(S) buttons and a status bar. The whole UI is designed on a virtual screen of 2 panel units per
// pixel ("vpx"), baked once with Canvas2D at 4 px/vpx; gradients are quantised per vpx row to 16-bit colour.
//
// Gag: the pelican (a crisp glossy UI-icon rider with a navy outline and a bright-blue bike) rides along the
// input box, shoving my unsent text ahead of its front wheel; the mouse clicks 发送 on 1.0 and the rider is
// sucked up into the log, where it arrives at 1.5 as a dithered 160×120, 216-colour, 8 fps GIF (interlaced
// load). Downbeats 2.0 and 4.0 nudge the window; the friend's messages pop on the beats; on 4.0 the GIF pops
// and the rider leaps out of it back onto the input baseline (the GIF is left showing an empty road).
//
// 0 p5.brush marks: Canvas2D bakes + native p5 images; the rider is re-painted per frame into a small 2D canvas.
import { profile } from '../beat/ride.js';
import { SPEED } from '../beat/timeline.js';
import { pose as rigPose, placed as rigPlaced } from '../rig/pelican.js';
import { rigParts } from '../rig/parts.js';
import { rng, hash, noise2, clamp, lerp, smoothstep, easeOut, easeIn, easeInOut, easeOutBack } from '../kit/math.js';

const ID = 'chat';
const TAU = Math.PI * 2;
const RIDE = { hold: [2.2, 3.6], speed: 0.4, ramp: 0.3 };
const PROF = profile(RIDE);

// ------------------------------------------------------------------ virtual screen
const V = 2;                     // panel units per virtual pixel (vpx)
const PXV = 1;                   // raster pixels per vpx: the UI is painted at true low resolution…
const UP = 2;                    // …then pixel-doubled (nearest) into the layer, drawn ≈ 1:1 with linear filtering
const WX = 26, WY = 24;          // window origin on the panel (units)
const WW = 474, WH = 474;        // window size (vpx)
const WM = 8;                    // shadow margin around the window bake (vpx)
const ux = (vx) => WX + vx * V;  // window vpx → panel units
const uy = (vy) => WY + vy * V;
const BASE_V = 388;              // input text baseline (vpx) → panel y 800

const LOG = { x0: 6, y0: 115, x1: 375, y1: 348 };          // sunken log box (incl. scrollbar)
const LIN = { x0: 7, y0: 116, x1: 357, y1: 347 };          // log text viewport
const VIEW_H = LIN.y1 - LIN.y0;                             // 231
const SB = { x0: 357, x1: 374 };
const INPUT = { x0: 6, y0: 372, x1: 468, y1: 414 };
const SEND = { x0: 390, y0: 418, x1: 468, y1: 444 };
const CLOSE = { x0: 312, y0: 418, x1: 384, y1: 444 };
const NUDGE_X = 124;             // the 窗口抖动 button in the format bar (vpx)
const FONT_UI = 'Tahoma, "Songti SC", sans-serif';
const FONT_MSG = 'Tahoma, "Songti SC", serif';
const FONT_TITLE = 'Tahoma, "Hiragino Sans GB", "PingFang SC", sans-serif';

// ------------------------------------------------------------------ GIF geometry
const GIF_W = 160, GIF_H = 120;
const GIF_U = 2.0619;            // panel units per GIF pixel (exactly 2 screen px at the film's 0.97 px/unit)
const GIF_V = GIF_U / V;         // vpx per GIF pixel
const GIF_K = 0.27;              // GIF pixels per rig unit
const GIF_BB = [80, 100];        // bottom-bracket road point inside the GIF (GIF px)
const SGIF_W = 96, SGIF_H = 72, SGIF_S = SGIF_W / GIF_W;
const BOX_W = GIF_W * GIF_V + 2, BOX_H = GIF_H * GIF_V + 2;          // big GIF box incl. 1-vpx border
const SBOX_W = SGIF_W * GIF_V + 2, SBOX_H = SGIF_H * GIF_V + 2;
const BOX_HI = Math.ceil(BOX_H), SBOX_HI = Math.ceil(SBOX_H), BOX_WI = Math.ceil(BOX_W);   // layout (whole vpx)
const GIF_X = LIN.x0 + 16;       // GIF boxes are indented in the log (vpx)
const GIF_PLAY = 1.75;           // the animation starts after the interlaced load

// ------------------------------------------------------------------ the chat log (pure layout, no measuring)
const LH = 18;                   // log line height (vpx)
const DOC_PAD = 4;
const clock = (u) => { const s = 21 * 3600 + 5 * 60 + 6 + Math.floor(u); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const FRIEND = '鹈鹕骑士';
const MSGS = [
  { u: -1e9, kind: 'date', text: '———— 2004-07-16  星期五 ————' },
  { u: -1e9, who: 'friend', time: '21:03:12', text: '在吗？' },
  { u: -1e9, who: 'me', time: '21:03:20', text: '在' },
  { u: -1e9, who: 'friend', time: '21:03:41', text: '最近忙啥呢' },
  { u: -1e9, who: 'me', time: '21:03:58', text: '上网，网速好慢 >_<' },
  { u: -1e9, who: 'friend', time: '21:04:02', text: '给你看个东西' },
  { u: 1.0, who: 'me', text: '等等，你先看我这个：', gif: 'big' },
  { u: 2.0, kind: 'nudge', text: `${FRIEND} 给你发送了一个窗口抖动。` },
  { u: 2.5, who: 'friend', text: '???' },
  { u: 3.0, who: 'friend', text: '这是啥' },
  { u: 3.5, who: 'friend', text: '鹈鹕会骑车??' },
  { u: 4.0, kind: 'nudge', text: `${FRIEND} 又给你发送了一个窗口抖动！` },
  { u: 4.5, who: 'friend', text: 'lol' },
  { u: 5.0, who: 'friend', text: 'brb 我也去买辆车' },
  { u: 6.5, who: 'friend', text: '下次见 :)', gif: 'small' },
  { u: 9.0, kind: 'status', text: `${FRIEND} 的状态改为“离开”。` },
];
{
  let y = DOC_PAD;
  for (const m of MSGS) {
    if (m.who && !m.time) m.time = clock(m.u);
    m.y = y;
    m.h = m.gif === 'big' ? LH + 2 + BOX_HI + 4 : m.gif === 'small' ? LH + 2 + SBOX_HI + 4 : LH;
    y += m.h;
  }
}
const DOC_W = LIN.x1 - LIN.x0;   // 350
const DOC_H = Math.ceil(MSGS[MSGS.length - 1].y + MSGS[MSGS.length - 1].h + DOC_PAD);
const BIG = MSGS.find((m) => m.gif === 'big');
const SMALL = MSGS.find((m) => m.gif === 'small');
const FRIEND_MSGS = MSGS.filter((m) => m.who === 'friend' && m.u > -1);

const lastIdx = (u) => { let k = -1; MSGS.forEach((m, i) => { if (m.u <= u) k = i; }); return k; };
const topFor = (k) => Math.max(0, MSGS[k].y + MSGS[k].h + DOC_PAD - VIEW_H);
/** Log scroll offset (vpx) at time u: auto-scroll jumps to the newest line the instant it lands (on the beat). */
const scrollTop = (u) => topFor(lastIdx(u));
const docBottom = (u) => { const k = lastIdx(u); return MSGS[k].y + MSGS[k].h + DOC_PAD; };

// ------------------------------------------------------------------ nudge (窗口抖动)
const NUDGES = [2.0, 4.0];
/** Window offset in panel units (whole-vpx steps, a new jolt every film frame). */
function shake(u) {
  for (const t0 of NUDGES) {
    const a = u - t0;
    if (a < 0 || a >= 0.42) continue;
    const f = Math.floor(a * 30 + 1e-6);
    const r = rng(hash(ID, 'nudge', t0, f));
    const amp = 12 * (1 - a / 0.42) + 2;                  // vpx
    const ang = (f * 2.4 + r() * 1.2) % TAU;             // keeps changing direction
    return [Math.round(Math.cos(ang) * amp * (0.7 + 0.3 * r())) * V, Math.round(Math.sin(ang) * amp * 0.75) * V];
  }
  return [0, 0];
}

/** Where the GIF box sits at time u (panel units, top-left of its 1-vpx border; incl. shake). */
function gifBox(u, m = BIG) {
  const [sx, sy] = shake(u);
  return [ux(GIF_X) + sx, uy(LIN.y0 + m.y + LH + 2 - scrollTop(u)) + sy];
}
/** The GIF's pelican (bottom bracket + scale) in panel units at time u. */
function gifPelican(u) {
  const [bx, by] = gifBox(u);
  return { x: bx + V + GIF_BB[0] * GIF_U, y: by + V + GIF_BB[1] * GIF_U, s: GIF_K * GIF_U };
}

// pop-out leap (4.0 → 4.55), landing bounce to 4.75
const LEAP0 = 4.0, LEAP1 = 4.55;
const SEND0 = 1.0, SEND1 = 1.2;

// ------------------------------------------------------------------ colour helpers
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const q565 = ([r, g, b]) => { r = clamp(Math.round(r), 0, 255); g = clamp(Math.round(g), 0, 255); b = clamp(Math.round(b), 0, 255); return [(r & 0xf8) | (r >> 5), (g & 0xfc) | (g >> 6), (b & 0xf8) | (b >> 5)]; };
const css = ([r, g, b], a = 1) => (a < 1 ? `rgba(${r | 0},${g | 0},${b | 0},${a})` : `rgb(${r | 0},${g | 0},${b | 0})`);
function sampleStops(stops, t) {
  if (t <= stops[0][0]) return hex(stops[0][1]);
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const a = stops[k - 1], b = stops[k], w = (t - a[0]) / (b[0] - a[0] || 1);
      const A = hex(a[1]), B = hex(b[1]);
      return [lerp(A[0], B[0], w), lerp(A[1], B[1], w), lerp(A[2], B[2], w)];
    }
  }
  return hex(stops[stops.length - 1][1]);
}
/** Vertical gradient filled one vpx row at a time, every row quantised to RGB565 (16-bit banding). */
function band(c, x, y, w, h, stops) {
  for (let j = 0; j < h; j++) { c.fillStyle = css(q565(sampleStops(stops, (j + 0.5) / h))); c.fillRect(x, y + j, w, 1); }
}
const lg = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
const rg = (c, x, y, r0, r1, stops, fx = x, fy = y) => { const g = c.createRadialGradient(fx, fy, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
function poly(c, pts, close = true) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); }
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
function taper(pts, w0, w1) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  return L.concat(R.reverse());
}
const shadowText = (c, text, x, y, col, sh, dx = 1, dy = 1) => { c.fillStyle = sh; c.fillText(text, x + dx, y + dy); c.fillStyle = col; c.fillText(text, x, y); };

// ------------------------------------------------------------------ icons (vpx, drawn under scale(PXV))
const OUTL = '#2a3c62';
function stroke1(c, col = OUTL, w = 1) { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function gloss(c, path, x, y, w, h, a = 0.55) {
  c.save(); path(); c.clip();
  c.fillStyle = lg(c, 0, y, 0, y + h * 0.5, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]);
  c.fillRect(x, y, w, h * 0.5);
  c.restore();
}
function iconPerson(c, x, y, s, shirt) {
  c.beginPath(); c.moveTo(x + s * 0.06, y + s); c.quadraticCurveTo(x + s * 0.08, y + s * 0.5, x + s * 0.5, y + s * 0.5);
  c.quadraticCurveTo(x + s * 0.92, y + s * 0.5, x + s * 0.94, y + s); c.closePath();
  c.fillStyle = lg(c, 0, y + s * 0.5, 0, y + s, shirt); c.fill(); stroke1(c, OUTL, 0.9);
  circ(c, x + s * 0.5, y + s * 0.3, s * 0.22);
  c.fillStyle = rg(c, x + s * 0.5, y + s * 0.3, 0, s * 0.24, [[0, '#ffe9d2'], [1, '#e8a676']], x + s * 0.44, y + s * 0.22); c.fill(); stroke1(c, OUTL, 0.9);
}
function iconInvite(c, x, y) {
  iconPerson(c, x + 9, y + 1, 14, [[0, '#7fb2f0'], [1, '#2c64c4']]);
  iconPerson(c, x + 1, y + 5, 17, [[0, '#9be07a'], [1, '#2f9a3a']]);
  circ(c, x + 19, y + 18, 5); c.fillStyle = rg(c, x + 19, y + 18, 0, 5, [[0, '#9cf08c'], [1, '#2a9c2a']], x + 18, y + 16); c.fill(); stroke1(c, '#1d5a1d', 0.8);
  c.fillStyle = '#fff'; c.fillRect(x + 16.5, y + 17.3, 5, 1.4); c.fillRect(x + 18.3, y + 15.5, 1.4, 5);
}
function iconFile(c, x, y) {
  const back = () => { c.beginPath(); c.moveTo(x + 1, y + 6); c.lineTo(x + 8, y + 6); c.lineTo(x + 10, y + 4); c.lineTo(x + 21, y + 4); c.lineTo(x + 21, y + 21); c.lineTo(x + 1, y + 21); c.closePath(); };
  back(); c.fillStyle = '#e0a83a'; c.fill(); stroke1(c, '#7a5410', 0.9);
  const front = () => { c.beginPath(); c.moveTo(x + 1, y + 10); c.lineTo(x + 23, y + 10); c.lineTo(x + 21, y + 21); c.lineTo(x + 1, y + 21); c.closePath(); };
  front(); c.fillStyle = lg(c, 0, y + 10, 0, y + 21, [[0, '#fff1b8'], [1, '#f1c04a']]); c.fill(); stroke1(c, '#7a5410', 0.9);
  // blue arrow
  poly(c, [[x + 9, y + 15], [x + 16, y + 15], [x + 16, y + 12], [x + 22, y + 17], [x + 16, y + 22], [x + 16, y + 19], [x + 9, y + 19]]);
  c.fillStyle = lg(c, 0, y + 12, 0, y + 22, [[0, '#8fd0ff'], [1, '#1f6fd6']]); c.fill(); stroke1(c, '#123c80', 0.8);
}
function iconCam(c, x, y) {
  // base + neck
  c.beginPath(); c.ellipse(x + 12, y + 21.5, 7, 2, 0, 0, TAU); c.fillStyle = lg(c, 0, y + 19, 0, y + 24, [[0, '#d7dde6'], [1, '#7c8696']]); c.fill(); stroke1(c, OUTL, 0.8);
  c.fillStyle = '#7c8696'; c.fillRect(x + 11, y + 16, 2, 4);
  circ(c, x + 12, y + 10, 8.6); c.fillStyle = rg(c, x + 12, y + 10, 0, 9, [[0, '#ffffff'], [0.6, '#cfd6e2'], [1, '#8792a6']], x + 9, y + 6); c.fill(); stroke1(c, OUTL, 0.9);
  circ(c, x + 12, y + 10.5, 4.6); c.fillStyle = '#1b2235'; c.fill();
  circ(c, x + 12, y + 10.5, 3.2); c.fillStyle = rg(c, x + 12, y + 10.5, 0, 3.2, [[0, '#7fd3ff'], [1, '#1446a0']], x + 11, y + 9.5); c.fill();
  circ(c, x + 10.8, y + 9.2, 1); c.fillStyle = '#fff'; c.fill();
  circ(c, x + 17.5, y + 5, 1); c.fillStyle = '#ff4a3a'; c.fill();
}
function iconMic(c, x, y) {
  c.beginPath(); c.moveTo(x + 6, y + 11); c.quadraticCurveTo(x + 6, y + 18, x + 12, y + 18); c.quadraticCurveTo(x + 18, y + 18, x + 18, y + 11);
  stroke1(c, '#4b5568', 1.6);
  c.fillStyle = '#4b5568'; c.fillRect(x + 11.2, y + 18, 1.6, 3); c.fillRect(x + 7.5, y + 21, 9, 1.6);
  rr(c, x + 8.5, y + 1.5, 7, 13, 3.5); c.fillStyle = lg(c, x + 8.5, 0, x + 15.5, 0, [[0, '#8a95a8'], [0.4, '#eef2f8'], [1, '#6c778c']]); c.fill(); stroke1(c, OUTL, 0.9);
  c.strokeStyle = 'rgba(40,50,70,0.45)'; c.lineWidth = 0.6;
  for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x + 9, y + 4 + k * 2.2); c.lineTo(x + 15, y + 4 + k * 2.2); c.stroke(); }
}
function iconDoodle(c, x, y) {
  poly(c, [[x + 2, y + 2], [x + 15, y + 2], [x + 20, y + 7], [x + 20, y + 22], [x + 2, y + 22]]);
  c.fillStyle = lg(c, 0, y + 2, 0, y + 22, [[0, '#ffffff'], [1, '#dfe6f1']]); c.fill(); stroke1(c, OUTL, 0.9);
  poly(c, [[x + 15, y + 2], [x + 15, y + 7], [x + 20, y + 7]]); c.fillStyle = '#c3cfe0'; c.fill(); stroke1(c, OUTL, 0.7);
  c.beginPath(); c.moveTo(x + 4, y + 17); c.bezierCurveTo(x + 7, y + 9, x + 9, y + 21, x + 12, y + 13); stroke1(c, '#e0453a', 1.4);
  c.beginPath(); c.moveTo(x + 5, y + 11); c.bezierCurveTo(x + 8, y + 7, x + 10, y + 11, x + 12, y + 8); stroke1(c, '#2c7be0', 1.2);
  c.save(); c.translate(x + 16, y + 14); c.rotate(-0.85);
  rr(c, -2.2, -9, 4.4, 15, 0.8); c.fillStyle = lg(c, -2.2, 0, 2.2, 0, [[0, '#f7c531'], [0.5, '#ffe58a'], [1, '#d9a011']]); c.fill(); stroke1(c, '#6e4f05', 0.7);
  poly(c, [[-2.2, 6], [2.2, 6], [0, 10]]); c.fillStyle = '#f3d9b0'; c.fill(); stroke1(c, '#6e4f05', 0.7);
  c.fillStyle = '#ff8fa0'; c.fillRect(-2.2, -9, 4.4, 2.6);
  c.restore();
}
function iconDie(c, x, y) {
  c.save(); c.translate(x + 12, y + 12); c.rotate(-0.18);
  rr(c, -9, -9, 18, 18, 4); c.fillStyle = lg(c, 0, -9, 0, 9, [[0, '#ff8a7a'], [0.5, '#e0453a'], [1, '#a82418']]); c.fill(); stroke1(c, '#5a1008', 0.9);
  gloss(c, () => rr(c, -9, -9, 18, 18, 4), -9, -9, 18, 18, 0.6);
  c.fillStyle = '#fff';
  for (const [dx, dy] of [[-4.5, -4.5], [4.5, -4.5], [0, 0], [-4.5, 4.5], [4.5, 4.5]]) { circ(c, dx, dy, 1.7); c.fill(); }
  c.restore();
}
function iconBlock(c, x, y) {
  iconPerson(c, x + 3, y + 3, 17, [[0, '#c6ccd8'], [1, '#7c8698']]);
  circ(c, x + 12, y + 12, 9.5); stroke1(c, '#e0453a', 2.4);
  c.beginPath(); c.moveTo(x + 5.3, y + 18.7); c.lineTo(x + 18.7, y + 5.3); stroke1(c, '#e0453a', 2.4);
}
/** 「鹈信」 logo: a glossy sky-blue speech bubble with a white pelican head (s = size in vpx). */
function iconLogo(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s / 32, s / 32);
  const bubble = () => { c.beginPath(); c.moveTo(16, 2); c.bezierCurveTo(26.5, 2, 31, 8, 31, 14.5); c.bezierCurveTo(31, 21, 25.5, 26, 17, 26); c.lineTo(8.5, 30.5); c.lineTo(10.5, 24.6); c.bezierCurveTo(4.5, 22.5, 1, 18.5, 1, 14.5); c.bezierCurveTo(1, 8, 6, 2, 16, 2); c.closePath(); };
  bubble(); c.fillStyle = lg(c, 0, 2, 0, 28, [[0, '#a8e2ff'], [0.45, '#3aa0f0'], [1, '#1559c0']]); c.fill();
  c.lineWidth = 1.3; c.strokeStyle = '#0c3a86'; c.lineJoin = 'round'; c.stroke();
  // pelican: neck + head + bill + pouch
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(8, 23.5); c.quadraticCurveTo(6.5, 17, 9.5, 14); c.lineTo(13.5, 14.5); c.quadraticCurveTo(11.5, 18, 13.5, 23); c.closePath(); c.fill();
  circ(c, 11.2, 11.6, 4.6); c.fill();
  c.beginPath(); c.moveTo(13.6, 10.2); c.lineTo(27.5, 13.2); c.lineTo(26.6, 15.2); c.quadraticCurveTo(19, 21.5, 13.8, 15.4); c.closePath();
  c.fillStyle = lg(c, 0, 10, 0, 20, [[0, '#ffd77a'], [1, '#f08a1c']]); c.fill(); c.lineWidth = 0.8; c.strokeStyle = '#9a4f08'; c.stroke();
  c.beginPath(); c.moveTo(14, 12.6); c.lineTo(26.8, 14.1); c.strokeStyle = '#b8600a'; c.lineWidth = 0.6; c.stroke();
  circ(c, 11.8, 10.6, 1.2); c.fillStyle = '#0d1d3a'; c.fill();
  // gloss
  c.save(); bubble(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.42)'; c.beginPath(); c.ellipse(16, 6.5, 13, 4.6, 0, 0, TAU); c.fill(); c.restore();
  c.restore();
}
function iconSmile(c, x, y, s = 16, wink = false) {
  c.save(); c.translate(x, y); c.scale(s / 16, s / 16);
  circ(c, 8, 8, 7.2); c.fillStyle = rg(c, 8, 8, 0, 7.6, [[0, '#fff7b0'], [0.55, '#ffd83a'], [1, '#e89a08']], 6, 5); c.fill(); stroke1(c, '#8a5a00', 0.8);
  c.fillStyle = '#3a2400';
  c.beginPath(); c.ellipse(5.6, 6.4, 0.9, 1.5, 0, 0, TAU); c.fill();
  if (wink) { c.beginPath(); c.moveTo(9.4, 6.6); c.lineTo(11.6, 6.6); stroke1(c, '#3a2400', 0.9); }
  else { c.beginPath(); c.ellipse(10.4, 6.4, 0.9, 1.5, 0, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(8, 8.4, 4, 0.35, Math.PI - 0.35); stroke1(c, '#3a2400', 0.9);
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(6, 3.6, 2.6, 1.2, -0.4, 0, TAU); c.fill();
  c.restore();
}
/** Nudge glyph: a small window with shake marks either side. */
function iconNudge(c, x, y, hot = false) {
  const zig = (x0, dir) => { c.beginPath(); c.moveTo(x0, y + 3); c.lineTo(x0 + dir * 1.6, y + 5.5); c.lineTo(x0, y + 8); c.lineTo(x0 + dir * 1.6, y + 10.5); c.lineTo(x0, y + 13); stroke1(c, hot ? '#e0453a' : '#4a5a7a', 1); };
  zig(x + 1.2, -1); zig(x + 14.8, 1);
  rr(c, x + 3.5, y + 3, 9, 10, 1.2); c.fillStyle = '#ffffff'; c.fill(); stroke1(c, hot ? '#a01f14' : OUTL, 0.9);
  c.fillStyle = hot ? '#e0453a' : '#2f6fd6'; c.fillRect(x + 3.9, y + 3.4, 8.2, 2.6);
  c.fillStyle = hot ? '#f2b0a8' : '#c6d4ea'; c.fillRect(x + 5, y + 7.5, 6, 1); c.fillRect(x + 5, y + 9.5, 4.5, 1);
}
function iconFont(c, x, y) {
  c.font = `bold 13px Georgia, "Songti SC", serif`; c.textAlign = 'left';
  shadowText(c, 'A', x + 2.5, y + 12, '#1b4fc4', 'rgba(0,0,0,0.15)');
  c.fillStyle = '#e0453a'; c.fillRect(x + 1.5, y + 13.5, 13, 2);
}
function iconPicture(c, x, y) {
  rr(c, x + 1, y + 2.5, 14, 11, 1); c.fillStyle = lg(c, 0, y + 2.5, 0, y + 13.5, [[0, '#7cc4ff'], [1, '#d4eeff']]); c.fill();
  c.save(); rr(c, x + 1, y + 2.5, 14, 11, 1); c.clip();
  c.fillStyle = '#4caf3c'; c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x + 6, y + 8); c.lineTo(x + 10, y + 12); c.lineTo(x + 12, y + 10); c.lineTo(x + 16, y + 14); c.fill();
  circ(c, x + 11.5, y + 5.5, 1.6); c.fillStyle = '#ffd23a'; c.fill();
  c.restore();
  rr(c, x + 1, y + 2.5, 14, 11, 1); stroke1(c, OUTL, 0.9);
}
function iconNote(c, x, y) {
  c.fillStyle = '#2f6fd6';
  c.beginPath(); c.ellipse(x + 4.5, y + 12.5, 2.6, 1.9, -0.4, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(x + 11.5, y + 11, 2.6, 1.9, -0.4, 0, TAU); c.fill();
  c.fillRect(x + 6.4, y + 3, 1.2, 9.6); c.fillRect(x + 13.4, y + 1.6, 1.2, 9.4);
  poly(c, [[x + 6.4, y + 3], [x + 14.6, y + 1.6], [x + 14.6, y + 4], [x + 6.4, y + 5.4]]); c.fill();
}
function iconBook(c, x, y) {
  rr(c, x + 2, y + 2, 11, 13, 1); c.fillStyle = lg(c, x + 2, 0, x + 13, 0, [[0, '#2a5fc4'], [1, '#6ea0f0']]); c.fill(); stroke1(c, OUTL, 0.9);
  c.fillStyle = '#f4f1e6'; c.fillRect(x + 4, y + 13, 9, 1.4);
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x + 5, y + 5, 6, 1); c.fillRect(x + 5, y + 7.5, 5, 1);
}
function iconPencil(c, x, y) {
  c.save(); c.translate(x + 7, y + 7); c.rotate(-0.8);
  rr(c, -1.8, -7, 3.6, 11, 0.6); c.fillStyle = '#f7c531'; c.fill(); stroke1(c, '#6e4f05', 0.6);
  poly(c, [[-1.8, 4], [1.8, 4], [0, 7.4]]); c.fillStyle = '#f3d9b0'; c.fill(); stroke1(c, '#6e4f05', 0.6);
  c.restore();
}
function iconArrowDown(c, x, y, col = '#2a3c62') { poly(c, [[x, y], [x + 6, y], [x + 3, y + 3.4]]); c.fillStyle = col; c.fill(); }
function statusDot(c, x, y, r, col) {
  circ(c, x, y, r); c.fillStyle = rg(c, x, y, 0, r, [[0, '#ffffff'], [0.35, col[0]], [1, col[1]]], x - r * 0.35, y - r * 0.4); c.fill(); stroke1(c, col[2], 0.8);
}
const DOT_ON = ['#7fe36f', '#2a9e2a', '#1d6a1d'];
const DOT_AWAY = ['#ffd36a', '#e09a12', '#8a5a00'];
function cursorArrow(c) {
  poly(c, [[0, 0], [0, 16], [3.8, 12.4], [6.6, 18.6], [9.2, 17.4], [6.4, 11.4], [11.4, 11.4]]);
  c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#000'; c.lineJoin = 'miter'; c.stroke();
}

// ------------------------------------------------------------------ avatars (80 × 80 vpx)
function avatarPelican(c, x, y) {
  c.save(); c.translate(x, y);
  c.beginPath(); c.rect(0, 0, 80, 80); c.clip();
  c.fillStyle = rg(c, 40, 30, 0, 70, [[0, '#ffffff'], [0.45, '#c9ecff'], [1, '#69b8f0']]); c.fillRect(0, 0, 80, 80);
  // sun rays
  c.save(); c.translate(26, 20); c.fillStyle = 'rgba(255,255,255,0.45)';
  for (let k = 0; k < 10; k++) { c.rotate(TAU / 10); c.beginPath(); c.moveTo(0, 0); c.lineTo(60, -6); c.lineTo(60, 6); c.closePath(); c.fill(); }
  c.restore();
  // body + neck
  c.beginPath(); c.moveTo(4, 80); c.bezierCurveTo(4, 62, 14, 56, 22, 52); c.bezierCurveTo(20, 44, 18, 38, 22, 32); c.lineTo(38, 34);
  c.bezierCurveTo(34, 42, 36, 50, 44, 58); c.bezierCurveTo(54, 64, 58, 72, 58, 80); c.closePath();
  c.fillStyle = lg(c, 0, 30, 0, 80, [[0, '#ffffff'], [1, '#c8d6ea']]); c.fill(); stroke1(c, OUTL, 1.4);
  // wing hint
  c.beginPath(); c.moveTo(14, 68); c.quadraticCurveTo(26, 60, 40, 66); stroke1(c, '#9db1d0', 1.2);
  // head
  circ(c, 30, 26, 15); c.fillStyle = rg(c, 30, 26, 0, 16, [[0, '#ffffff'], [0.75, '#f1f5fb'], [1, '#c9d6ea']], 25, 20); c.fill(); stroke1(c, OUTL, 1.4);
  // pouch + bill
  c.beginPath(); c.moveTo(38, 30); c.bezierCurveTo(52, 52, 70, 46, 78, 36); c.lineTo(41, 27); c.closePath();
  c.fillStyle = lg(c, 0, 28, 0, 50, [[0, '#ffd56a'], [0.6, '#ff9a2e'], [1, '#e86a1c']]); c.fill(); stroke1(c, '#7a3a08', 1.2);
  c.beginPath(); c.moveTo(38, 22); c.lineTo(78, 30); c.quadraticCurveTo(81, 32, 78, 35); c.lineTo(41, 29); c.closePath();
  c.fillStyle = lg(c, 0, 22, 0, 35, [[0, '#ffeec4'], [1, '#f5b25e']]); c.fill(); stroke1(c, '#7a3a08', 1.2);
  c.beginPath(); c.moveTo(74, 29); c.quadraticCurveTo(80, 30, 78, 35); c.fillStyle = '#e2452c'; c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(55, 41, 7, 2, 0.3, 0, TAU); c.fill();
  // helmet (Pelican *Knight*: a little blue cycling helmet)
  c.beginPath(); c.moveTo(14, 22); c.bezierCurveTo(14, 6, 42, 2, 46, 18); c.lineTo(42, 19); c.bezierCurveTo(32, 14, 22, 16, 14, 22); c.closePath();
  c.fillStyle = lg(c, 0, 6, 0, 22, [[0, '#9fd6ff'], [0.45, '#2f7fe8'], [1, '#174fae']]); c.fill(); stroke1(c, OUTL, 1.3);
  c.fillStyle = '#10204a';
  for (const [hx, hy] of [[22, 11], [30, 8.5], [38, 10]]) { c.beginPath(); c.ellipse(hx, hy, 2.6, 1.2, -0.2, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(26, 7.5, 7, 1.6, -0.15, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(18, 21); c.quadraticCurveTo(22, 38, 34, 38); stroke1(c, '#1d2c4a', 1);
  // eye
  circ(c, 34, 24, 4.6); c.fillStyle = '#ffffff'; c.fill(); stroke1(c, OUTL, 1);
  circ(c, 35.2, 24.4, 2.5); c.fillStyle = '#0e1830'; c.fill();
  circ(c, 34.3, 23.3, 0.9); c.fillStyle = '#fff'; c.fill();
  c.beginPath(); c.ellipse(36, 30, 3.2, 1.6, 0.2, 0, TAU); c.fillStyle = 'rgba(255,140,140,0.45)'; c.fill();
  c.restore();
}
function avatarFlower(c, x, y) {
  c.save(); c.translate(x, y);
  c.beginPath(); c.rect(0, 0, 80, 80); c.clip();
  // green bokeh "photo"
  c.fillStyle = lg(c, 0, 0, 80, 80, [[0, '#3f7a2e'], [0.5, '#7fb04a'], [1, '#2a5a24']]); c.fillRect(0, 0, 80, 80);
  const r = rng(hash(ID, 'bokeh'));
  for (let k = 0; k < 14; k++) {
    const bx = r.range(0, 80), by = r.range(0, 80), br = r.range(5, 16);
    c.fillStyle = rg(c, bx, by, 0, br, [[0, `rgba(${r.int(190, 240)},${r.int(225, 255)},${r.int(150, 200)},0.45)`], [1, 'rgba(200,240,170,0)']]);
    circ(c, bx, by, br); c.fill();
  }
  // gerbera: two rings of pink petals
  const cx = 42, cy = 42;
  for (const [n, L, W, a0, cols] of [[18, 31, 6.2, 0.1, ['#ff9cc4', '#e8387a']], [16, 24, 5.4, 0.3, ['#ffc2dc', '#f2559a']]]) {
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * TAU) / n;
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.beginPath(); c.ellipse(L * 0.55, 0, L * 0.5, W, 0, 0, TAU);
      c.fillStyle = lg(c, 0, 0, L, 0, [[0, cols[1]], [0.6, cols[0]], [1, '#fff0f6']]); c.fill();
      c.strokeStyle = 'rgba(150,20,70,0.35)'; c.lineWidth = 0.6; c.stroke();
      c.restore();
    }
  }
  circ(c, cx, cy, 9.5); c.fillStyle = rg(c, cx, cy, 0, 10, [[0, '#4a2a08'], [0.55, '#8a5a10'], [0.8, '#e0b030'], [1, '#ffd84a']]); c.fill();
  c.fillStyle = '#ffe26a';
  for (let k = 0; k < 16; k++) { const a = k * 2.4; circ(c, cx + Math.cos(a) * (3 + (k % 4) * 1.5), cy + Math.sin(a) * (3 + (k % 4) * 1.5), 0.7); c.fill(); }
  // vignette
  c.fillStyle = rg(c, 40, 40, 30, 62, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,20,0,0.45)']]); c.fillRect(0, 0, 80, 80);
  c.restore();
}

// ------------------------------------------------------------------ the static window (Canvas2D bake, vpx space)
const TITLE_STOPS = [[0, '#b4d4fb'], [0.07, '#7eb0f2'], [0.2, '#4d8ae6'], [0.5, '#2f6fd6'], [0.78, '#3473da'], [0.9, '#4a86e2'], [1, '#2a5ec0']];
const BTN_STOPS = [[0, '#ffffff'], [0.45, '#f2f5fa'], [0.55, '#e3e9f3'], [1, '#cdd8ea']];
function frameShape(c) { c.beginPath(); c.moveTo(0, WH); c.lineTo(0, 8); c.arcTo(0, 0, 8, 0, 8); c.lineTo(WW - 8, 0); c.arcTo(WW, 0, WW, 8, 8); c.lineTo(WW, WH); c.closePath(); }
function sunken(c, x0, y0, x1, y1, fill = '#ffffff', border = '#8da4c6') {
  c.fillStyle = border; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.fillStyle = fill; c.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
}
function etchH(c, x0, x1, y) { c.fillStyle = '#b9c7dd'; c.fillRect(x0, y, x1 - x0, 1); c.fillStyle = '#ffffff'; c.fillRect(x0, y + 1, x1 - x0, 1); }
function etchV(c, x, y0, y1) { c.fillStyle = '#b9c7dd'; c.fillRect(x, y0, 1, y1 - y0); c.fillStyle = '#ffffff'; c.fillRect(x + 1, y0, 1, y1 - y0); }
function pushButton(c, b, label, o = {}) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  rr(c, b.x0 + 0.5, b.y0 + 0.5, w - 1, h - 1, 3);
  c.save(); c.clip();
  band(c, b.x0, b.y0, w, h, o.pressed ? [[0, '#c3d0e4'], [0.5, '#d7e0ee'], [1, '#eef2f8']] : BTN_STOPS);
  c.restore();
  rr(c, b.x0 + 0.5, b.y0 + 0.5, w - 1, h - 1, 3);
  c.lineWidth = 1; c.strokeStyle = o.hot ? '#e8902a' : '#3c5a8c'; c.stroke();
  if (o.hot) { rr(c, b.x0 + 1.5, b.y0 + 1.5, w - 3, h - 3, 2); c.strokeStyle = 'rgba(255,190,90,0.9)'; c.stroke(); }
  if (o.def && !o.hot) { rr(c, b.x0 + 1.5, b.y0 + 1.5, w - 3, h - 3, 2); c.strokeStyle = 'rgba(120,170,240,0.85)'; c.stroke(); }
  c.font = `${o.bold ? 'bold ' : ''}12px ${FONT_UI}`; c.textAlign = 'center'; c.fillStyle = '#1a1a1a';
  const d = o.pressed ? 1 : 0;
  c.fillText(label, (b.x0 + b.x1) / 2 + d, b.y0 + h / 2 + 4.5 + d);
  c.textAlign = 'left';
}
/** Text with an underlined accelerator: label like "文件(F)" → underline the letter. */
function menuItem(c, x, y, label) {
  c.fillStyle = '#1a1a1a'; c.fillText(label, x, y);
  const k = label.indexOf('(');
  if (k >= 0) {
    const a = c.measureText(label.slice(0, k + 1)).width, w = c.measureText(label[k + 1]).width;
    c.fillRect(x + a, y + 1.5, w, 1);
  }
  return x + c.measureText(label).width;
}

/** The banner ad in the right column (two-frame animated banner, flips every second). */
const AD = { x0: 381, y0: 221, x1: 467, y1: 255 };
function paintAd(c, f) {
  rr(c, AD.x0 + 0.5, AD.y0 + 0.5, AD.x1 - AD.x0 - 1, AD.y1 - AD.y0 - 1, 2);
  c.fillStyle = lg(c, 0, AD.y0, 0, AD.y1, f ? [[0, '#ff7a5c'], [1, '#d8341f']] : [[0, '#fff6c8'], [1, '#ffd36a']]); c.fill();
  c.lineWidth = 1; c.strokeStyle = f ? '#8a1a0a' : '#d08a1a'; c.stroke();
  c.textAlign = 'center';
  c.font = `bold 12px ${FONT_TITLE}`; c.fillStyle = f ? '#fff36a' : '#b8301e'; c.fillText(f ? '免费试骑！' : '鹈鹕牌自行车', 424, 236);
  c.font = `12px ${FONT_UI}`; c.fillStyle = f ? '#ffffff' : '#6a4a08'; c.fillText(f ? '点击进入 >>' : '暑期大促八折！', 424, 251);
  c.textAlign = 'left';
}
/** 16-bit colour: quantise every pixel of a lo-fi raster to RGB565 (gradients band like a 2000s desktop). */
function to565(c, w, h) {
  const id = c.getImageData(0, 0, w, h), d = id.data;
  for (let k = 0; k < d.length; k += 4) {
    const r = d[k], g = d[k + 1], b = d[k + 2];
    d[k] = (r & 0xf8) | (r >> 5); d[k + 1] = (g & 0xfc) | (g >> 6); d[k + 2] = (b & 0xf8) | (b >> 5);
  }
  c.putImageData(id, 0, 0);
}

function paintWallpaper(c, w, h) {
  const S = w / 1000;
  c.save(); c.scale(S, S);
  c.fillStyle = lg(c, 0, 0, 0, 1000, [[0, '#5c9be0'], [0.55, '#86c0f2'], [1, '#aee1ff']]); c.fillRect(0, 0, 1000, 1000);
  // soft light swooshes
  c.globalCompositeOperation = 'lighter';
  for (const [cx, cy, rx, ry, a, al] of [[300, 1150, 900, 420, -0.18, 0.16], [760, 1180, 760, 360, 0.12, 0.12], [520, -260, 900, 420, 0.1, 0.1]]) {
    c.save(); c.translate(cx, cy); c.rotate(a); c.scale(rx, ry);
    c.fillStyle = rg(c, 0, 0, 0.82, 1, [[0, 'rgba(255,255,255,0)'], [0.6, `rgba(255,255,255,${al})`], [1, 'rgba(255,255,255,0)']]);
    circ(c, 0, 0, 1); c.fill(); c.restore();
  }
  c.restore();
}

function paintWindow(c) {
  c.save();
  c.translate(WM, WM);
  // soft drop shadow on the wallpaper
  c.save(); c.shadowColor = 'rgba(8,30,80,0.45)'; c.shadowBlur = 5 * PXV; c.shadowOffsetX = 1.5 * PXV; c.shadowOffsetY = 2.5 * PXV;
  frameShape(c); c.fillStyle = '#2f6fd6'; c.fill(); c.restore();
  // frame: banded blue borders, title bar
  c.save(); frameShape(c); c.clip();
  const cols = ['#173f99', '#4f8ce8', '#3473da', '#2a62c6'];
  for (let k = 0; k < 4; k++) {
    c.fillStyle = cols[k];
    c.fillRect(k, 0, 1, WH); c.fillRect(WW - 1 - k, 0, 1, WH); c.fillRect(0, WH - 1 - k, WW, 1);
  }
  band(c, 0, 0, WW, 30, TITLE_STOPS);
  // horizontal sheen: lighter toward the right (#2f6fd6 → #8fb8f2)
  c.fillStyle = lg(c, 0, 0, WW, 0, [[0, 'rgba(143,184,242,0)'], [0.55, 'rgba(143,184,242,0.12)'], [1, 'rgba(143,184,242,0.42)']]);
  c.fillRect(0, 1, WW, 28);
  c.restore();
  frameShape(c); c.lineWidth = 1; c.strokeStyle = '#0f2f78'; c.stroke();
  // title: icon + text + caption buttons
  iconLogo(c, 7, 6, 18);
  c.font = `bold 14px ${FONT_TITLE}`; c.textAlign = 'left';
  shadowText(c, '与 鹈鹕骑士 交谈中 — 早期聊天窗口 · 2000 年代', 30, 20.5, '#ffffff', 'rgba(6,26,80,0.85)', 1, 1);
  const capBtn = (x, kind) => {
    const red = kind === 'close';
    rr(c, x + 0.5, 4.5, 21, 21, 3);
    c.fillStyle = lg(c, 0, 4, 0, 26, red ? [[0, '#f9b29e'], [0.45, '#e86a4e'], [0.55, '#e0453a'], [1, '#b8301e']] : [[0, '#a9cdfb'], [0.45, '#5f98ee'], [0.55, '#3c7be0'], [1, '#2a5fc4']]);
    c.fill(); c.lineWidth = 1; c.strokeStyle = '#ffffff'; c.stroke();
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.lineCap = 'square';
    if (kind === 'min') c.fillRect(x + 6, y0 + 15, 8, 2.4);
    else if (kind === 'max') { c.lineWidth = 1.4; c.strokeRect(x + 6, y0 + 6.5, 10, 9); c.fillRect(x + 6, y0 + 6, 10, 2.6); }
    else { c.beginPath(); c.moveTo(x + 6.5, y0 + 6.5); c.lineTo(x + 15.5, y0 + 15.5); c.moveTo(x + 15.5, y0 + 6.5); c.lineTo(x + 6.5, y0 + 15.5); c.lineWidth = 2.2; c.stroke(); }
  };
  const y0 = 4;
  capBtn(398, 'min'); capBtn(422, 'max'); capBtn(446, 'close');
  // client area
  c.fillStyle = '#eef3fb'; c.fillRect(4, 30, WW - 8, WH - 34);
  c.fillStyle = '#7aa7f0'; c.fillRect(4, 30, 1, WH - 34); c.fillRect(WW - 5, 30, 1, WH - 34);

  // menu bar
  band(c, 5, 30, WW - 10, 17, [[0, '#f8fbff'], [1, '#eaf0f9']]);
  c.font = `12px ${FONT_UI}`;
  let mx = 10;
  for (const it of ['文件(F)', '编辑(E)', '查看(V)', '动作(A)', '工具(T)', '帮助(H)']) mx = menuItem(c, mx, 43, it) + 11;
  etchH(c, 5, WW - 5, 46);

  // toolbar
  band(c, 5, 48, WW - 10, 43, [[0, '#fdfeff'], [0.5, '#eef3fb'], [1, '#d6e1f1']]);
  const tools = [['邀请', iconInvite], ['发送文件', iconFile], ['视频', iconCam], ['语音', iconMic], ['涂鸦', iconDoodle], ['游戏', iconDie], ['屏蔽', iconBlock]];
  c.font = `12px ${FONT_UI}`; c.textAlign = 'center';
  tools.forEach(([label, fn], k) => {
    const bx = 8 + k * 52;
    fn(c, bx + 14, 51);
    c.fillStyle = '#1a1a1a'; c.fillText(label, bx + 26, 87.5);
    if (k === 1 || k === 4) etchV(c, bx + 51, 52, 88);
  });
  c.textAlign = 'left';
  // brand corner: 「鹈信 PeliMsg」
  etchV(c, 377, 52, 88);
  iconLogo(c, 382, 52, 32);
  c.font = `bold 16px ${FONT_TITLE}`; shadowText(c, '鹈信', 418, 69, '#1b4fc4', 'rgba(255,255,255,0.9)');
  c.font = `italic bold 12px Tahoma, sans-serif`; c.fillStyle = '#2f6fd6'; c.fillText('PeliMsg', 418, 85);
  etchH(c, 5, WW - 5, 90);

  // contact strip ("about" strip)
  band(c, 5, 92, WW - 10, 21, [[0, '#f3f7fd'], [1, '#dde7f5']]);
  c.font = `12px ${FONT_UI}`; c.fillStyle = '#53627c'; c.fillText('收件人：', 10, 107);
  c.font = `italic 12px Tahoma, "Songti SC", sans-serif`; c.textAlign = 'right'; c.fillStyle = '#4a5a78';
  c.fillText('Early Chat Window · 2000s', WW - 9, 107);
  c.textAlign = 'left';
  etchH(c, 5, WW - 5, 113);

  // chat log box + scrollbar track and arrows
  sunken(c, LOG.x0, LOG.y0, LOG.x1, LOG.y1);
  c.fillStyle = '#f2f5fa'; c.fillRect(SB.x0, LIN.y0, SB.x1 - SB.x0, LIN.y1 - LIN.y0);
  c.fillStyle = '#e1e8f3'; c.fillRect(SB.x0, LIN.y0, 1, LIN.y1 - LIN.y0);
  const arrowBtn = (y, up) => {
    rr(c, SB.x0 + 1.5, y + 0.5, SB.x1 - SB.x0 - 2, 16, 2.5);
    c.save(); c.clip(); band(c, SB.x0 + 1, y, SB.x1 - SB.x0 - 1, 17, [[0, '#f4f8ff'], [1, '#bccfee']]); c.restore();
    rr(c, SB.x0 + 1.5, y + 0.5, SB.x1 - SB.x0 - 2, 16, 2.5); c.lineWidth = 1; c.strokeStyle = '#9fb4d8'; c.stroke();
    const cx = (SB.x0 + SB.x1) / 2 + 0.5, cy = y + 8.5;
    poly(c, up ? [[cx - 3.5, cy + 2], [cx + 3.5, cy + 2], [cx, cy - 2]] : [[cx - 3.5, cy - 2], [cx + 3.5, cy - 2], [cx, cy + 2]]);
    c.fillStyle = '#4d6185'; c.fill();
  };
  arrowBtn(LIN.y0, true); arrowBtn(LIN.y1 - 17, false);

  // right column: the friend's avatar, an ad, my avatar
  const frame = (x, y) => {
    c.fillStyle = '#8da4c6'; c.fillRect(x, y, 86, 86);
    c.fillStyle = '#ffffff'; c.fillRect(x + 1, y + 1, 84, 84);
    c.fillStyle = '#d7e1ef'; c.fillRect(x + 2, y + 2, 82, 82);
  };
  frame(381, 115); avatarPelican(c, 384, 118);
  c.font = `12px ${FONT_UI}`; c.textAlign = 'center'; c.fillStyle = '#1a1a1a'; c.fillText(FRIEND, 424, 214); c.textAlign = 'left';
  paintAd(c, 0);                                   // a little animated 2000s banner ad (frame 1 is live)
  frame(381, 262); avatarFlower(c, 384, 265);

  // format bar
  band(c, 5, 349, WW - 10, 22, [[0, '#f9fbff'], [1, '#e1e9f5']]);
  c.font = `12px ${FONT_UI}`;
  const fmt = [[8, iconFont, '字体', true], [66, (cc, x, y) => iconSmile(cc, x, y), '表情', true], [NUDGE_X, (cc, x, y) => iconNudge(cc, x, y), '窗口抖动', false], [205, iconPicture, '图片', false], [256, iconNote, '声音', false]];
  for (const [x, fn, label, drop] of fmt) {
    fn(c, x, 352);
    c.fillStyle = '#1a1a1a'; c.fillText(label, x + 19, 365);
    if (drop) iconArrowDown(c, x + 19 + c.measureText(label).width + 3, 360);
  }
  etchV(c, 198, 352, 368);
  iconBook(c, 380, 352); c.fillStyle = '#1a1a1a'; c.fillText('消息记录', 398, 365); iconArrowDown(c, 450, 360);
  // input box
  sunken(c, INPUT.x0, INPUT.y0, INPUT.x1, INPUT.y1);
  // buttons row
  c.font = `12px ${FONT_UI}`; c.fillStyle = '#6a7690'; c.fillText('按 Ctrl+Enter 发送消息', 10, 436);
  pushButton(c, CLOSE, '关闭(C)');
  pushButton(c, SEND, '发送(S)', { bold: true, def: true });
  // status bar
  etchH(c, 5, WW - 5, 446);
  band(c, 5, 448, WW - 10, 22, [[0, '#eef3fb'], [1, '#dfe7f3']]);
  sunken(c, 7, 450, 330, 468, '#f4f7fc', '#b3c3db');
  sunken(c, 333, 450, WW - 7, 468, '#f4f7fc', '#b3c3db');
  statusDot(c, 341, 459, 3.6, DOT_ON);
  c.font = `12px ${FONT_UI}`; c.fillStyle = '#3a4660'; c.fillText('鹈信 2.0 · 已连接', 348, 463.5);
  // size grip
  c.fillStyle = '#a8b8d2';
  for (const [gx, gy] of [[465, 466], [462, 466], [465, 463], [459, 466], [462, 463], [465, 460]]) c.fillRect(gx, gy, 1.5, 1.5);
  c.restore();
}

/** The chat log document (static text; GIFs are drawn live over their slots). */
function paintDoc(c) {
  c.save();
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, DOC_W, DOC_H);
  const X = 5;
  for (const m of MSGS) {
    const b = m.y + 13;
    c.textAlign = 'left';
    if (m.kind === 'date') {
      c.font = `12px ${FONT_UI}`; c.fillStyle = '#8a94a8'; c.textAlign = 'center'; c.fillText(m.text, DOC_W / 2, b); continue;
    }
    if (m.kind === 'nudge') {
      iconNudge(c, X, m.y + 1, true);
      c.font = `bold 12px ${FONT_MSG}`; c.fillStyle = '#e0453a'; c.fillText(m.text, X + 20, b); continue;
    }
    if (m.kind === 'status') {
      statusDot(c, X + 6, m.y + 9, 4, DOT_AWAY);
      c.font = `12px ${FONT_MSG}`; c.fillStyle = '#7a8296'; c.fillText(m.text, X + 15, b); continue;
    }
    const me = m.who === 'me';
    let x = X;
    c.font = `bold 12px ${FONT_MSG}`; c.fillStyle = me ? '#b8322a' : '#1b4fc4';
    const name = me ? '我' : FRIEND;
    c.fillText(name, x, b); x += c.measureText(name).width;
    c.font = `12px Tahoma, sans-serif`; c.fillStyle = '#7a8296';
    const ts = ` (${m.time}): `;
    c.fillText(ts, x, b); x += c.measureText(ts).width;
    c.font = `12px ${FONT_MSG}`; c.fillStyle = '#1a1a1a';
    // emoticon ":)" becomes the app's smiley
    const parts = m.text.split(':)');
    parts.forEach((p, i) => {
      c.fillText(p, x, b); x += c.measureText(p).width;
      if (i < parts.length - 1) { iconSmile(c, x + 1, m.y + 1, 15); x += 18; }
    });
    if (m.gif === 'big') {
      // file caption beside the image
      const gx = GIF_X - LIN.x0 + BOX_WI + 9, gy = m.y + LH + 2;
      c.font = `12px Tahoma, "Songti SC", sans-serif`; c.fillStyle = '#1b4fc4';
      c.fillText('pelican.gif', gx, gy + 14); c.fillRect(gx, gy + 15.5, c.measureText('pelican.gif').width, 1);
      c.fillStyle = '#6a7486'; c.fillText('41.6 KB · 160×120', gx, gy + 31);
      c.fillText('8 帧 · 256 色', gx, gy + 47);
      c.fillStyle = '#1b4fc4'; c.fillText('另存为…', gx, gy + 79); c.fillRect(gx, gy + 80.5, c.measureText('另存为…').width, 1);
    }
  }
  c.restore();
}

// ------------------------------------------------------------------ the rider as a glossy UI icon (Canvas2D, panel units)
const NAVY = '#13213d';
const TUBE_W = { tube_downtube: 9, tube_toptube: 7.5, tube_seattube: 8, tube_headtube: 10, tube_chainstay: 5.6, tube_seatstay: 5 };
/**
 * Paint a placed pose. o.photo = soft "photographic" shading without outlines (for the GIF); otherwise the crisp
 * glossy icon look: navy outline, bright-blue bike, chrome parts, white plumage with a specular highlight.
 */
function paintRider(c, P, o = {}) {
  const s = P.place.scale ?? 1;
  const photo = !!o.photo;
  const ow = photo ? 0 : 2.6 * s;
  const B = P.bird;
  const parts = rigParts(P);
  const yTop = B.head.c[1] - B.head.r, yBot = Math.max(...B.body.map((p) => p[1]));
  const white = lg(c, 0, yTop, 0, yBot + 6 * s, photo
    ? [[0, '#ffffff'], [0.5, '#f4f2ee'], [0.8, '#d6d6d8'], [1, '#a9adb6']]
    : [[0, '#ffffff'], [0.6, '#f7f9fd'], [0.85, '#e2e9f4'], [1, '#c4d1e5']]);
  const line = (pts, w, col, out = true) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (ow && out) { c.strokeStyle = NAVY; c.lineWidth = w + ow * 1.5; poly(c, pts, false); c.stroke(); }
    c.strokeStyle = col; c.lineWidth = w; poly(c, pts, false); c.stroke();
  };
  const fill = (pts, style, outline = true) => {
    poly(c, pts); c.fillStyle = style; c.fill();
    if (ow && outline) { c.lineWidth = ow; c.strokeStyle = NAVY; c.lineJoin = 'round'; c.stroke(); }
  };
  const ringC = (cx, cy, r, w, col, out = true) => {
    if (ow && out) { c.strokeStyle = NAVY; c.lineWidth = w + ow * 1.5; circ(c, cx, cy, r); c.stroke(); }
    c.strokeStyle = col; c.lineWidth = w; circ(c, cx, cy, r); c.stroke();
  };
  const hiOff = (pts, w, col, k = 0.24) => {           // highlight stripe on the lit (upper) side of a tube
    const a = pts[0], b = pts[pts.length - 1];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    let nx = -dy, ny = dx; if (ny > 0) { nx = -nx; ny = -ny; }
    c.strokeStyle = col; c.lineWidth = w * 0.28; c.lineCap = 'round';
    poly(c, pts.map((p) => [p[0] + nx * w * k, p[1] + ny * w * k]), false); c.stroke();
  };
  const BLUE = photo ? '#1d67d8' : '#1f7ff0', BLUE_HI = photo ? '#7fb8ff' : '#a8dcff';
  const CHROME = photo ? '#c8ccd2' : '#d9e0ea', DARK = '#2f343c';
  const frameParts = parts.filter((p) => p.role === 'frame' || p.role === 'fork');

  // ground shadow (icon look: soft navy ellipses on the input line)
  if (o.shadow > 0) {
    for (const wh of P.bike.wheels) {
      c.save(); c.translate(wh.c[0], wh.c[1] + wh.r + 1); c.scale(1, 0.16);
      c.fillStyle = rg(c, 0, 0, 0, 56 * s, [[0, `rgba(20,40,90,${0.32 * o.shadow})`], [1, 'rgba(20,40,90,0)']]);
      circ(c, 0, 0, 56 * s); c.fill(); c.restore();
    }
  }
  const legPaint = (L, far) => {
    const g = lg(c, 0, L.hip[1], 0, L.ankle[1] + 10 * s, far ? [[0, '#d86f2a'], [1, '#a84a16']] : [[0, '#ffc070'], [0.5, '#ff962e'], [1, '#e8661c']]);
    fill(L.poly, g); fill(L.web, far ? '#b8561c' : '#f08024');
  };
  for (const part of parts) {
    switch (part.role) {
      case 'legFar': legPaint(B.legFar, true); break;
      case 'footFar': break;
      case 'crankFar': line(part.pts, 5 * s, DARK); break;
      case 'tire': {
        const r = part.r - 4.6 * s;
        ringC(part.c[0], part.c[1], r, 9.2 * s, photo ? '#1e2126' : '#30353e');
        c.strokeStyle = photo ? 'rgba(160,165,175,0.5)' : '#8c97a8'; c.lineWidth = 2 * s; c.lineCap = 'round';
        c.beginPath(); c.arc(part.c[0], part.c[1], part.r - 2.6 * s, -2.7, -1.3); c.stroke();
        break;
      }
      case 'rim': ringC(part.c[0], part.c[1], part.r - 4.5 * s, 2.6 * s, CHROME, false); break;
      case 'spoke': {
        const [a, b] = part.pts;
        c.strokeStyle = photo ? 'rgba(210,214,220,0.6)' : '#b7c2d3'; c.lineWidth = 1.1 * s; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], 0.86), lerp(a[1], b[1], 0.86)); c.stroke();
        break;
      }
      case 'hub': circ(c, part.c[0], part.c[1], 4.6 * s); c.fillStyle = rg(c, part.c[0], part.c[1], 0, 5 * s, [[0, '#ffffff'], [1, '#8a94a6']], part.c[0] - s, part.c[1] - s); c.fill(); if (ow) { c.lineWidth = ow * 0.7; c.strokeStyle = NAVY; c.stroke(); } break;
      case 'chain': c.strokeStyle = '#4b525d'; c.lineWidth = 2.2 * s; c.lineJoin = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'frame': {
        if (part !== frameParts[0]) break;           // all tubes in three passes: outline, colour, highlight
        if (ow) for (const q of frameParts) { c.strokeStyle = NAVY; c.lineWidth = (TUBE_W[q.name] ?? 7) * s + ow * 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; poly(c, q.pts, false); c.stroke(); }
        for (const q of frameParts) { c.strokeStyle = BLUE; c.lineWidth = (TUBE_W[q.name] ?? 7) * s; poly(c, q.pts, false); c.stroke(); }
        for (const q of frameParts) hiOff(q.pts, (TUBE_W[q.name] ?? 7) * s, BLUE_HI);
        break;
      }
      case 'fork': break;
      case 'stem': line(part.pts, 6 * s, CHROME); break;
      case 'bars': line(part.pts, 5.6 * s, CHROME); line([part.pts[part.pts.length - 3], part.pts[part.pts.length - 1]], 6.4 * s, '#2a2e36', false); break;
      case 'seatpost': line(part.pts, 5.4 * s, CHROME); break;
      case 'saddle': line(part.pts, 7 * s, '#262a31'); hiOff(part.pts, 7 * s, '#7d8696', 0.2); break;
      case 'ring': {
        circ(c, part.c[0], part.c[1], part.r); c.fillStyle = rg(c, part.c[0], part.c[1], 0, part.r, [[0, '#ffffff'], [0.7, CHROME], [1, '#8a94a6']], part.c[0] - 4 * s, part.c[1] - 4 * s); c.fill();
        if (ow) { c.lineWidth = ow; c.strokeStyle = NAVY; c.stroke(); }
        circ(c, part.c[0], part.c[1], part.r * 0.36); c.fillStyle = DARK; c.fill();
        break;
      }
      case 'tail': legPaint(B.legNear, false); fill(part.pts, white); break;
      case 'body': {
        fill(part.pts, white);
        if (!photo) {                                   // icon gloss: a soft specular sheen on the back
          c.save(); poly(c, part.pts); c.clip();
          const bc = B.bodyC;
          c.fillStyle = rg(c, bc[0] - 8 * s, bc[1] - 22 * s, 0, 40 * s, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
          c.beginPath(); c.ellipse(bc[0] - 8 * s, bc[1] - 20 * s, 44 * s, 16 * s, -0.2, 0, TAU); c.fill();
          c.restore();
        }
        break;
      }
      case 'wing': {
        fill(part.pts, photo ? white : lg(c, 0, yTop, 0, yBot + 4 * s, [[0, '#ffffff'], [0.6, '#eef3fa'], [1, '#c4d2e6']]));
        c.save(); poly(c, part.pts); c.clip();
        let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of part.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        c.strokeStyle = photo ? 'rgba(150,150,160,0.35)' : '#a9bcd8'; c.lineWidth = 1.6 * s; c.lineCap = 'round';
        for (let j = 0; j < 3; j++) {
          const fx = lerp(x0 + 14 * s, (x0 + x1) / 2 + 6 * s, j / 2), fy = y1 - (9 + j * 3) * s;
          c.beginPath(); c.moveTo(fx - 16 * s, fy - 4 * s); c.quadraticCurveTo(fx, fy + 2 * s, fx + 18 * s, fy - 2 * s); c.stroke();
        }
        c.restore();
        break;
      }
      case 'secondaries': fill(taper(part.pts, 6.5 * s, 1.8 * s), photo ? '#2c2f38' : '#28324a', !photo); break;
      case 'primary': fill(taper(part.pts, 5.4 * s, 1.4 * s), photo ? '#22252c' : '#222b40', false); break;
      case 'neck': fill(part.pts, white); break;
      case 'head': {
        circ(c, part.c[0], part.c[1], part.r); c.fillStyle = white; c.fill();
        if (ow) { c.lineWidth = ow; c.strokeStyle = NAVY; c.stroke(); }
        if (!photo) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.ellipse(part.c[0] - 5 * s, part.c[1] - 8 * s, 7 * s, 3.4 * s, -0.4, 0, TAU); c.fill(); }
        break;
      }
      case 'crest': line(part.pts, 3 * s, '#ffffff'); break;
      case 'pouch': {
        let y0 = Infinity, y1 = -Infinity; for (const p of part.pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        fill(part.pts, lg(c, 0, y0, 0, y1, photo ? [[0, '#ffc45a'], [1, '#e2701e']] : [[0, '#ffdc7a'], [0.5, '#ff9e30'], [1, '#e8641a']]));
        if (!photo) {
          const J = B.lowerJawLine, dx = J[1][0] - J[0][0], dy = J[1][1] - J[0][1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          c.save(); poly(c, part.pts); c.clip();
          c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3 * s; c.lineCap = 'round';
          c.beginPath(); c.moveTo(J[0][0] + dx * 0.15 + nx * 7 * s, J[0][1] + dy * 0.15 + ny * 7 * s);
          c.quadraticCurveTo(J[0][0] + dx * 0.35 + nx * 10 * s, J[0][1] + dy * 0.35 + ny * 10 * s, J[0][0] + dx * 0.55 + nx * 8 * s, J[0][1] + dy * 0.55 + ny * 8 * s); c.stroke();
          c.restore();
        }
        break;
      }
      case 'bill': {
        let y0 = Infinity, y1 = -Infinity; for (const p of part.pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        fill(part.pts, lg(c, 0, y0, 0, y1, [[0, '#fff0c8'], [1, '#f2ad62']]));
        if (!photo) { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.4 * s; c.lineCap = 'round'; poly(c, [part.pts[0], part.pts[1], part.pts[2]], false); c.stroke(); }
        break;
      }
      case 'nail': fill(part.pts, '#e2452c', false); break;
      case 'face': poly(c, part.pts); c.fillStyle = '#ffb59a'; c.fill(); break;
      case 'eye': circ(c, part.c[0], part.c[1], part.r * 1.08); c.fillStyle = '#ffffff'; c.fill(); if (ow) { c.lineWidth = ow * 0.6; c.strokeStyle = NAVY; c.stroke(); } break;
      case 'pupil': {
        circ(c, part.c[0], part.c[1], part.r * 1.1); c.fillStyle = '#0d1630'; c.fill();
        if (!photo) { circ(c, part.c[0] - part.r * 0.4, part.c[1] - part.r * 0.45, part.r * 0.42); c.fillStyle = '#ffffff'; c.fill(); }
        break;
      }
      case 'eyeShut': line(part.pts, 1.8 * s, NAVY, false); break;
      case 'leg': case 'foot': break;               // painted with the tail (plumage covers the thigh)
      case 'crank': line(part.pts, 5.4 * s, DARK); break;
      case 'pedal': line(part.pts, 4.6 * s, '#22262d'); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ the GIF (8 frames, 1-s loop, 216-colour ordered dither)
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
/** Paint one GIF frame (photo-like, at 2× the GIF resolution) into c. ph ∈ [0,1) loop phase; sc = size factor. */
function paintGifFrame(c, ph, rider, sc) {
  const R = 2 * sc;                       // canvas px per GIF px of the BIG gif
  const W = GIF_W * R, H = GIF_H * R;
  const P = SPEED * GIF_K;                // ground speed, GIF px per second (= px per loop)
  c.save(); c.scale(R, R);
  // sky
  c.fillStyle = lg(c, 0, 0, 0, 66, [[0, '#2c6fcc'], [0.5, '#6aa8e6'], [1, '#d4eaf6']]); c.fillRect(0, 0, 160, 66);
  c.fillStyle = rg(c, 22, 10, 0, 70, [[0, 'rgba(255,252,226,0.95)'], [0.12, 'rgba(255,244,200,0.65)'], [0.45, 'rgba(255,240,200,0.12)'], [1, 'rgba(255,240,200,0)']]); c.fillRect(0, 0, 160, 66);
  for (const [cx, cy, s] of [[64, 18, 1], [128, 28, 0.8], [104, 9, 0.6]]) {
    for (const [dx, dy, r] of [[-12, 2, 7], [-4, -2, 9], [6, -1, 8], [14, 2, 6], [0, 4, 8]]) {
      c.fillStyle = rg(c, cx + dx * s, cy + dy * s, 0, r * s, [[0, 'rgba(255,255,255,0.95)'], [0.6, 'rgba(250,252,255,0.7)'], [1, 'rgba(240,246,255,0)']]);
      circ(c, cx + dx * s, cy + dy * s, r * s); c.fill();
    }
  }
  // far hills (static)
  c.beginPath(); c.moveTo(0, 70);
  for (let x = 0; x <= 160; x += 4) c.lineTo(x, 58 - 6 * Math.sin(x * 0.045 + 0.6) - 3 * Math.sin(x * 0.11 + 2));
  c.lineTo(160, 70); c.closePath(); c.fillStyle = lg(c, 0, 48, 0, 70, [[0, '#7fa2b6'], [1, '#a7c3b2']]); c.fill();
  // meadow
  c.fillStyle = lg(c, 0, 62, 0, 88, [[0, '#a8d468'], [1, '#5c9a32']]); c.fillRect(0, 62, 160, 26);
  // a row of trees (one loop = one period)
  const off = -ph * P;
  for (let k = -1; k < 5; k++) {
    for (const [fx, sz, sh] of [[0.18, 1, 0], [0.62, 0.8, 1]]) {
      const tx = off + (k + fx) * P, ty = 76, r = 9 * sz;
      c.fillStyle = '#5a4022'; c.fillRect(tx - 1, ty - 2, 2, 8);
      c.fillStyle = rg(c, tx, ty - r * 0.9, 0, r * 1.3, [[0, sh ? '#79b04a' : '#6aa63e'], [0.6, '#3f7a2a'], [1, '#24521c']], tx - r * 0.4, ty - r * 1.4);
      circ(c, tx, ty - r * 0.9, r); c.fill();
    }
  }
  // road
  c.fillStyle = lg(c, 0, 84, 0, 112, [[0, '#9a9da2'], [0.4, '#76797f'], [1, '#55585e']]); c.fillRect(0, 84, 160, 28);
  c.fillStyle = 'rgba(235,235,225,0.85)'; c.fillRect(0, 84, 160, 1.4);
  c.fillStyle = 'rgba(250,250,240,0.92)';
  for (let k = -1; k < 9; k++) { const dx = off * 1 + k * P / 2; c.fillRect(dx, 105.5, P / 4, 2.2); }
  // verge + grass tufts in front
  c.fillStyle = lg(c, 0, 111, 0, 120, [[0, '#4f8a2c'], [1, '#2f5e1a']]); c.fillRect(0, 111, 160, 9);
  const rT = rng(hash(ID, 'tufts'));
  const tufts = Array.from({ length: 7 }, () => [rT() * P, rT.range(2, 4.5)]);
  c.fillStyle = '#6fae3c';
  for (let k = -1; k < 5; k++) for (const [tx, th] of tufts) { const x = off * 1.15 + k * P + tx; poly(c, [[x - 1.5, 120], [x, 120 - th * 2], [x + 1.5, 120]]); c.fill(); }
  // the rider
  if (rider) {
    c.fillStyle = rg(c, 0, 0, 0, 1, [[0, 'rgba(20,20,30,0.42)'], [1, 'rgba(20,20,30,0)']]);
    c.save(); c.translate(GIF_BB[0], GIF_BB[1] + 0.5); c.scale(56, 4); circ(c, 0, 0, 1); c.fill(); c.restore();
    const crank = TAU * ph;
    const Pz = rigPose({ crank, wheel: Math.PI * ph, t: ph, v: SPEED }, { spokes: 6 });
    const Pl = rigPlaced(Pz, { x: GIF_BB[0], y: GIF_BB[1], scale: GIF_K, rot: 0 });
    paintRider(c, Pl, { photo: true });
  }
  // lens vignette
  c.fillStyle = rg(c, 80, 60, 50, 110, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,10,0.32)']]); c.fillRect(0, 0, 160, 120);
  c.restore();
}

/** Downsample, add grain, quantise to the 6×6×6 cube with 8×8 ordered dithering → RGBA ImageData. */
function ditherFrame(src, w, h, seedKey) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cc = cv.getContext('2d', { willReadFrequently: true });
  cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
  cc.drawImage(src, 0, 0, w, h);
  const id = cc.getImageData(0, 0, w, h), d = id.data;
  const r = rng(hash(ID, 'grain', seedKey));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4, t = (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
    const n = (r() - 0.5) * 14;
    for (let ch = 0; ch < 3; ch++) {
      const v = clamp(d[k + ch] + n, 0, 255);
      d[k + ch] = Math.min(5, Math.floor((v * 5) / 255 + t)) * 51;
    }
    d[k + 3] = 255;
  }
  return id;
}

// ------------------------------------------------------------------ p5 image helpers
function nearestImage(w, h, id) {
  const img = createImage(w, h);
  img.drawingContext.putImageData(id, 0, 0);
  img.setModified(true);
  try {
    const rd = (window.p5 && window.p5.instance && window.p5.instance._renderer) || window._renderer;
    rd.getTexture(img).setInterpolation(NEAREST, NEAREST);
  } catch (e) { console.warn('[chat] nearest filtering unavailable', e); }
  return img;
}
/** Draw img into the panel rect (x, y, w, h), cropped to clip {x0,y0,x1,y1}. iw/ih = source size. */
function imageClip(img, x, y, w, h, clip, iw, ih) {
  const x0 = Math.max(x, clip.x0), y0 = Math.max(y, clip.y0), x1 = Math.min(x + w, clip.x1), y1 = Math.min(y + h, clip.y1);
  if (x1 <= x0 || y1 <= y0) return;
  image(img, x0, y0, x1 - x0, y1 - y0, ((x0 - x) / w) * iw, ((y0 - y) / h) * ih, ((x1 - x0) / w) * iw, ((y1 - y0) / h) * ih);
}
function rectClip(x, y, w, h, clip) {
  const x0 = Math.max(x, clip.x0), y0 = Math.max(y, clip.y0), x1 = Math.min(x + w, clip.x1), y1 = Math.min(y + h, clip.y1);
  if (x1 > x0 && y1 > y0) rect(x0, y0, x1 - x0, y1 - y0);
}
const scratch = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.max(1, w); cv.height = Math.max(1, h); return cv; };
/**
 * The lo-fi raster: paint(c) at 1 px per vpx (true screen resolution of the fictional desktop), then
 * pixel-double it with nearest into a cached layer of 2 px per vpx (= 1 px per panel unit, drawn ≈ 1:1).
 */
function loLayer(K, key, wv, hv, paint) {
  const w = Math.ceil(wv * PXV), h = Math.ceil(hv * PXV);
  return K.layer(key, w * UP, h * UP, (ctx) => {
    const tmp = scratch(w, h), tc = tmp.getContext('2d');
    tc.save(); tc.scale(PXV, PXV); paint(tc); tc.restore();
    to565(tc, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w * UP, h * UP);
  });
}
const TXT = new Map();
let measCtx = null;
/** A lo-fi text sprite (12 px type on the virtual screen). Returns { img, w, h, base } in vpx. */
function loText(K, o) {
  const size = o.size ?? 12;
  const font = `${o.style || 'normal'} ${o.weight || 'normal'} ${size}px ${o.font || FONT_UI}`;
  const key = `txt|${font}|${o.color}|${o.text}`;
  let hit = TXT.get(key);
  if (hit) return hit;
  measCtx = measCtx || scratch(4, 4).getContext('2d');
  measCtx.font = font;
  const w = Math.ceil(measCtx.measureText(o.text).width) + 3, h = Math.ceil(size * 1.45), base = Math.round(size * 1.05);
  const img = loLayer(K, key, w, h, (c) => { c.font = font; c.fillStyle = o.color || '#1a1a1a'; c.fillText(o.text, 1, base); });
  hit = { img, w, h, base, tw: w - 3 };
  TXT.set(key, hit);
  return hit;
}
const snap = (x, x0 = WX) => x0 + Math.round((x - x0) / V) * V;
/** Live UI text: (x, baseline) in panel units, snapped to the virtual pixel grid. o.align: left|center|right. */
function uiText(K, o, x, base, alpha = 1) {
  const t = loText(K, o);
  let x0 = x - V;
  if (o.align === 'center') x0 = x - (t.tw * V) / 2 - V; else if (o.align === 'right') x0 = x - t.tw * V - V;
  if (alpha < 1) tint(255, 255 * alpha);
  image(t.img, snap(x0), snap(base, WY) - t.base * V, t.w * V, t.h * V);
  if (alpha < 1) noTint();
  return t;
}

// ------------------------------------------------------------------ timeline helpers
const typingWindows = [[-6.2, -4.6], [-3.1, -1.7], [2.25, 2.5], [2.7, 3.0], [3.0, 3.5], [4.25, 4.5], [4.65, 5.0], [6.0, 6.5]];
const isTyping = (u) => typingWindows.some(([a, b]) => u >= a && u < b);
const INPUT_TEXT = '等等，你先看我这个：';
const sendPressed = (u) => u >= 0.95 && u < 1.1;
const POINTER_REST = [690, 655];
function pointerAt(u) {
  const btn = [ux(SEND.x0 + 30), uy(SEND.y0 + 14)];
  if (u < 0.3) return [POINTER_REST[0] + 14 * Math.sin(u * 0.7), POINTER_REST[1] + 10 * Math.sin(u * 0.9 + 1)];
  if (u < 0.9) {
    const k = easeInOut((u - 0.3) / 0.6);
    const r0 = [POINTER_REST[0] + 14 * Math.sin(0.21), POINTER_REST[1] + 10 * Math.sin(1.27)];
    return [lerp(r0[0], btn[0], k), lerp(r0[1], btn[1], k) - 40 * Math.sin(Math.PI * k)];
  }
  if (u < 2.2) return btn;
  const k = easeInOut(clamp((u - 2.2) / 1.2));
  return [lerp(btn[0], ux(258), k), lerp(btn[1], uy(424), k)];
}

// ------------------------------------------------------------------ the scene
export default {
  freezeU: 2.6,
  ride: RIDE,
  cues: [
    { u: 1.0, name: 'send' }, { u: 1.5, name: 'gifPop' }, { u: 2.0, name: 'nudge' },
    { u: 2.5, name: 'msg' }, { u: 3.0, name: 'msg' }, { u: 3.5, name: 'msg' },
    { u: 4.0, name: 'nudge' }, { u: 4.0, name: 'gifOut' }, { u: 4.5, name: 'msg' }, { u: 5.0, name: 'msg' },
  ],

  async init(K) {
    this.wall = K.layer('wallpaper', 500, 500, (c) => paintWallpaper(c, 500, 500));
    this.win = loLayer(K, 'window', WW + 2 * WM, WH + 2 * WM, (c) => paintWindow(c));
    this.doc = loLayer(K, 'doc', DOC_W, DOC_H, (c) => paintDoc(c));
    const btnSprite = (key, o) => loLayer(K, key, SEND.x1 - SEND.x0 + 2, SEND.y1 - SEND.y0 + 2, (c) => {
      c.translate(-SEND.x0 + 1, -SEND.y0 + 1); c.fillStyle = '#eef3fb'; c.fillRect(SEND.x0 - 1, SEND.y0 - 1, 100, 40);
      pushButton(c, SEND, '发送(S)', { bold: true, ...o });
    });
    this.spr = {
      sendDown: btnSprite('sendDown', { pressed: true, hot: true }),
      sendHot: btnSprite('sendHot', { hot: true }),
      nudgeHot: loLayer(K, 'nudgeHot', 18, 18, (c) => { c.fillStyle = '#ffe1dc'; rr(c, 0.5, 0.5, 17, 17, 2); c.fill(); c.strokeStyle = '#e0453a'; c.lineWidth = 1; c.stroke(); iconNudge(c, 1, 1, true); }),
      dotOn: loLayer(K, 'dotOn', 10, 10, (c) => statusDot(c, 5, 5, 4, DOT_ON)),
      dotAway: loLayer(K, 'dotAway', 10, 10, (c) => statusDot(c, 5, 5, 4, DOT_AWAY)),
      pencil: loLayer(K, 'pencil', 14, 14, (c) => iconPencil(c, 0, 0)),
      cursor: loLayer(K, 'cursor', 13, 20, (c) => { c.translate(0.5, 0.5); cursorArrow(c); }),
      pic: loLayer(K, 'pic', 16, 16, (c) => iconPicture(c, 0, 0)),
      ad: loLayer(K, 'ad1', AD.x1 - AD.x0 + 1, AD.y1 - AD.y0 + 1, (c) => { c.translate(-AD.x0, -AD.y0); c.fillStyle = '#eef3fb'; c.fillRect(AD.x0, AD.y0, 90, 40); paintAd(c, 1); }),
      glow: loLayer(K, 'avatarGlow', 92, 92, (c) => {
        c.strokeStyle = '#ffb02e'; c.lineWidth = 2; c.strokeRect(2, 2, 88, 88);
        c.strokeStyle = 'rgba(255,200,90,0.55)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, 91, 91);
      }),
    };
    // GIF frames: 8 with the rider, 8 empty (after it escapes), 8 small; interlaced passes of frame 0
    const big = scratch(GIF_W * 2, GIF_H * 2), bc = big.getContext('2d');
    const small = scratch(SGIF_W * 2, SGIF_H * 2), sc = small.getContext('2d');
    this.gif = []; this.gifEmpty = []; this.gifSmall = [];
    let frame0 = null;
    for (let f = 0; f < 8; f++) {
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, big.width, big.height);
      paintGifFrame(bc, f / 8, true, 1);
      const id = ditherFrame(big, GIF_W, GIF_H, 'b' + f);
      if (f === 0) frame0 = id;
      this.gif.push(nearestImage(GIF_W, GIF_H, id));
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, big.width, big.height);
      paintGifFrame(bc, f / 8, false, 1);
      this.gifEmpty.push(nearestImage(GIF_W, GIF_H, ditherFrame(big, GIF_W, GIF_H, 'e' + f)));
      sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, small.width, small.height);
      paintGifFrame(sc, f / 8, true, SGIF_S);
      this.gifSmall.push(nearestImage(SGIF_W, SGIF_H, ditherFrame(small, SGIF_W, SGIF_H, 's' + f)));
    }
    this.gifPass = [8, 4, 2].map((step) => {
      const id = new ImageData(GIF_W, GIF_H);
      for (let y = 0; y < GIF_H; y++) {
        const sy = Math.floor(y / step) * step;
        id.data.set(frame0.data.subarray(sy * GIF_W * 4, (sy + 1) * GIF_W * 4), y * GIF_W * 4);
      }
      return nearestImage(GIF_W, GIF_H, id);
    });
    // the rider: painted at 1 px per vpx into a small canvas, pixel-doubled into a p5.Graphics
    this.lo = scratch(260, 240);
    this.rc = createGraphics(520, 480); this.rc.pixelDensity(1);
  },

  dispose() {
    try { this.rc?.remove(); } catch {}
    this.rc = null;
  },

  // ---------------------------------------------------------------- hooks
  path(u, base) {
    if (u <= 1 || u >= 5) return base;
    if (u < SEND1) {                                   // sucked up into the log as the message is sent
      const k = easeIn(clamp((u - SEND0) / (SEND1 - SEND0)));
      const T = gifPelican(SEND0 + 0.1);
      return { ...base, x: lerp(base.x, T.x, k), y: lerp(base.y, T.y, k), scale: lerp(1, T.s, k) };
    }
    if (u >= LEAP0 && u < 4.8) {                       // leaps out of the GIF back onto the input line
      if (u >= LEAP1) {                                // one small landing bounce
        const b = (u - LEAP1) / 0.16;
        return b < 1 ? { ...base, y: base.y - 14 * Math.sin(Math.PI * b) } : base;
      }
      const S = gifPelican(u);
      const k = clamp((u - LEAP0) / (LEAP1 - LEAP0));
      const x = lerp(S.x, base.x, easeInOut(k)), y = lerp(S.y, base.y, easeInOut(k)) - 60 * Math.sin(Math.PI * k);
      return { ...base, x, y, scale: lerp(S.s, 1, smoothstep(0, 1, k)), rot: -0.14 * Math.sin(Math.PI * k) };
    }
    return base;
  },

  mods(u) {
    if (u <= 1 || u >= 5) return {};
    if (u < SEND1) return { eye: 'wide' };
    if (u >= LEAP0 && u < LEAP1) return { eye: 'wide', billOpen: 0.45, feetOff: 0.7 * Math.sin(Math.PI * (u - LEAP0) / (LEAP1 - LEAP0)) };
    return {};
  },

  // ---------------------------------------------------------------- picture
  render(K, u, ctx) {
    push();
    noStroke(); noTint(); imageMode(CORNER);
    image(this.wall, 0, 0, 1000, 1000);
    const [sx, sy] = shake(u);
    push();
    translate(sx, sy);
    image(this.win, WX - WM * V, WY - WM * V, (WW + 2 * WM) * V, (WH + 2 * WM) * V);
    this.drawLog(K, u);
    this.drawChrome(K, u);
    pop();
    this.drawRider(u, ctx);
    this.drawFx(u);
    // the mouse pointer (screen level: it does not shake)
    const pt = pointerAt(u);
    image(this.spr.cursor, snap(pt[0]), snap(pt[1], WY), 13 * V, 20 * V);
    pop();
  },

  drawLog(K, u) {
    const top = scrollTop(u);
    const clip = { x0: ux(LIN.x0), y0: uy(LIN.y0), x1: ux(LIN.x1), y1: uy(LIN.y1) };
    // the document slice (only what has arrived)
    const vis = Math.min(VIEW_H, docBottom(u) - DOC_PAD - top);
    if (vis > 0) image(this.doc, clip.x0, clip.y0, DOC_W * V, vis * V, 0, top * UP, DOC_W * UP, vis * UP);
    const docY = (vy) => uy(LIN.y0 + vy - top);
    // the newest line flashes pale yellow as it lands
    const k = lastIdx(u), m = MSGS[k];
    if (m.u > 0 && u - m.u < 0.4) {
      const a = 1 - (u - m.u) / 0.4;
      blendMode(MULTIPLY); fill(255, 255 - 28 * a, 255 - 110 * a);
      rectClip(clip.x0, docY(m.y), DOC_W * V, Math.min(m.h, LH) * V, clip);
      blendMode(BLEND);
    }
    // big GIF
    if (u >= BIG.u) {
      const bx = ux(GIF_X), by = docY(BIG.y + LH + 2);
      let w = BOX_W * V, h = BOX_H * V, x = bx, y = by;
      if (u >= LEAP0 && u < LEAP0 + 0.24) {           // the GIF "pops" as the pelican leaves it
        const k = (u - LEAP0) / 0.24, sc = 1 + 0.07 * Math.sin(Math.PI * k);
        x = bx + (w - w * sc) / 2; y = by + (h - h * sc) / 2; w *= sc; h *= sc;
      }
      const f0 = w / (BOX_W * V);
      fill(160, 176, 204); rectClip(x, y, w, h, clip);
      const ix = x + V * f0, iy = y + V * f0, iw = w - 2 * V * f0, ih = h - 2 * V * f0;
      if (u < 1.5) {
        // placeholder: "sending" box with a block progress bar
        fill(244, 246, 250); rectClip(ix, iy, iw, ih, clip);
        imageClip(this.spr.pic, snap(ix + iw / 2 - 16), snap(iy + ih / 2 - 52, WY), 32, 32, clip, 32, 32);
        const p = clamp((u - 1.05) / 0.4);
        const pw = 220, px0 = snap(ix + (iw - pw) / 2), py0 = snap(iy + ih / 2 + 6, WY);
        fill(141, 164, 198); rectClip(px0, py0, pw, 22, clip);
        fill(255); rectClip(px0 + 2, py0 + 2, pw - 4, 18, clip);
        const nb = Math.floor((p * (pw - 8)) / 12);
        for (let k = 0; k < nb; k++) { fill(61, 142, 232); rectClip(px0 + 4 + k * 12, py0 + 4, 8, 14, clip); fill(150, 200, 255); rectClip(px0 + 4 + k * 12, py0 + 4, 8, 4, clip); }
        uiText(K, { text: `正在发送图片… ${Math.round(p * 100)}%`, color: '#4a5670', align: 'center' }, ix + iw / 2, py0 + 52);
      } else {
        let img;
        const f = Math.floor((u - GIF_PLAY) * 8 + 1e-6);
        if (u < 1.5625) img = this.gifPass[0];
        else if (u < 1.625) img = this.gifPass[1];
        else if (u < 1.6875) img = this.gifPass[2];
        else if (u < GIF_PLAY) img = this.gif[0];
        else img = (u >= LEAP0 ? this.gifEmpty : this.gif)[((f % 8) + 8) % 8];
        imageClip(img, ix, iy, iw, ih, clip, GIF_W, GIF_H);
      }
    }
    // small GIF (the friend sends it back as a sticker)
    if (u >= SMALL.u) {
      const bx = ux(GIF_X), by = docY(SMALL.y + LH + 2);
      fill(160, 176, 204); rectClip(bx, by, SBOX_W * V, SBOX_H * V, clip);
      const f = Math.floor((u - SMALL.u) * 8 + 1e-6);
      imageClip(this.gifSmall[((f % 8) + 8) % 8], bx + V, by + V, SGIF_W * GIF_U, SGIF_H * GIF_U, clip, SGIF_W, SGIF_H);
    }
    // "sending / sent" note in the GIF caption
    if (u >= BIG.u) {
      const gy = docY(BIG.y + LH + 2 + 63), gx = ux(GIF_X + BOX_WI + 9);
      if (gy - 24 > clip.y0 && gy + 6 < clip.y1) uiText(K, { text: u < 1.5 ? '正在发送…' : '已发送 ✓', color: u < 1.5 ? '#b06a10' : '#2a8a2a' }, gx, gy);
    }
    // scrollbar thumb
    const trackY0 = LIN.y0 + 17, trackH = VIEW_H - 34;
    const total = Math.max(docBottom(u), VIEW_H);
    const th = Math.max(16, Math.round((trackH * VIEW_H) / total)), ty = trackY0 + Math.round(((trackH - th) * top) / Math.max(1, total - VIEW_H));
    const tx = ux(SB.x0 + 2), tw = (SB.x1 - SB.x0 - 3) * V;
    fill(150, 172, 210); rect(tx, uy(ty), tw, th * V);
    fill(214, 228, 250); rect(tx + V, uy(ty + 1), tw - 2 * V, (th - 2) * V);
    fill(240, 246, 255); rect(tx + V, uy(ty + 1), tw - 2 * V, Math.round((th - 2) * 0.45) * V);
    fill(120, 142, 182);
    for (let k = -1; k <= 1; k++) rect(ux(SB.x0 + 5), uy(ty + Math.floor(th / 2) + k * 2), 7 * V, V);
  },

  drawChrome(K, u) {
    // contact strip: status dot, name, personal message / typing
    const away = u >= 9.0;
    image(away ? this.spr.dotAway : this.spr.dotOn, ux(52), uy(97), 10 * V, 10 * V);
    let t = uiText(K, { text: FRIEND, weight: 'bold' }, ux(64), uy(107));
    let x = ux(64) + t.tw * V + 2 * V;
    t = uiText(K, { text: away ? '(离开)' : '(在线)', color: away ? '#b06a10' : '#2a8a2a' }, x, uy(107));
    x += t.tw * V + 6 * V;
    if (u >= 2.0 && isTyping(u)) {
      const dots = '.'.repeat(1 + (Math.floor(u * 6) % 3));
      uiText(K, { text: `对方正在输入${dots}`, color: '#c0620a', weight: 'bold' }, x, uy(107));
    } else uiText(K, { text: '“骑行中，勿扰”', color: '#53627c' }, x, uy(107));

    // the animated banner flips every second
    if (Math.floor(u + 100) % 2 === 1) image(this.spr.ad, ux(AD.x0), uy(AD.y0), (AD.x1 - AD.x0 + 1) * V, (AD.y1 - AD.y0 + 1) * V);
    // the friend's avatar lights up as each of his messages lands (on the beat)
    for (const m of FRIEND_MSGS) if (u >= m.u && u < m.u + 0.25) image(this.spr.glow, ux(378), uy(112), 92 * V, 92 * V);

    // nudge button flashes red on the downbeats
    for (const t0 of NUDGES) if (u >= t0 && u < t0 + 0.5 && Math.floor((u - t0) * 8) % 2 === 0) image(this.spr.nudgeHot, ux(NUDGE_X - 1), uy(351), 18 * V, 18 * V);

    // input box: unsent text shoved along by the front wheel, then cleared on 发送
    const tx0 = ux(INPUT.x0 + 5);
    const caret = (xx) => { fill(16, 16, 16); rect(snap(xx), uy(BASE_V - 11), V, 14 * V); };
    const blink = Math.floor(u * 2 + 100) % 2 === 0;
    if (u < SEND0) {
      const front = PROF.x(u) + 186;
      const xx = Math.max(tx0, front);
      const tt = uiText(K, { text: INPUT_TEXT, font: FONT_MSG }, xx, uy(BASE_V));
      if (front > tx0 || blink) caret(xx + tt.tw * V + 2 * V);
    } else if (blink) caret(tx0 + V);

    // 发送(S): hover, then pressed
    const bw = (SEND.x1 - SEND.x0 + 2) * V, bh = (SEND.y1 - SEND.y0 + 2) * V;
    if (sendPressed(u)) image(this.spr.sendDown, ux(SEND.x0 - 1), uy(SEND.y0 - 1), bw, bh);
    else if (u >= 0.8 && u < 2.2) image(this.spr.sendHot, ux(SEND.x0 - 1), uy(SEND.y0 - 1), bw, bh);

    // status bar
    if (isTyping(u)) {
      image(this.spr.pencil, ux(10), uy(452), 14 * V, 14 * V);
      uiText(K, { text: `${FRIEND} 正在输入消息…`, color: '#3a4660' }, ux(27), uy(463));
    } else {
      let last = '21:04:02';
      for (const m of FRIEND_MSGS) if (m.u <= u) last = m.time;
      uiText(K, { text: `最后一条消息接收于 ${last}。`, color: '#3a4660' }, ux(12), uy(463));
    }
  },

  drawRider(u, ctx) {
    if (u >= SEND1 && u < LEAP0) return;             // it lives in the GIF
    const R = ctx.rider;
    if (!R.visible) return;
    const P = R.placed, pl = P.place, s = pl.scale ?? 1;
    const v = ctx.view;
    // raster box on the virtual pixel grid
    const bx0 = snap(pl.x - 200 * s), by0 = snap(pl.y - 352 * s, WY);
    const wv = Math.ceil((430 * s) / V) + 2, hv = Math.ceil((372 * s) / V) + 2;
    if (bx0 > v.x1 || bx0 + wv * V < v.x0) return;
    const lo = this.lo, c = lo.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, wv + 2, hv + 2);
    c.setTransform(1 / V, 0, 0, 1 / V, -bx0 / V, -by0 / V);
    const ground = clamp(1 - Math.abs(pl.y - 800) / 60) * (s > 0.95 ? 1 : 0);
    paintRider(c, P, { shadow: ground });
    const g = this.rc, gc = g.drawingContext;
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.clearRect(0, 0, wv * UP + 2, hv * UP + 2);
    gc.imageSmoothingEnabled = false;
    gc.drawImage(lo, 0, 0, wv, hv, 0, 0, wv * UP, hv * UP);
    // a single motion ghost while it is being sent
    if (u > SEND0 && u < SEND1) {
      const pb = this.path(u - 0.04, { x: PROF.x(u - 0.04), y: 800, scale: 1, rot: 0 });
      tint(255, 90);
      image(g, snap(bx0 + (pb.x - pl.x)), snap(by0 + (pb.y - pl.y), WY), wv * V, hv * V, 0, 0, wv * UP, hv * UP);
      noTint();
    }
    image(g, bx0, by0, wv * V, hv * V, 0, 0, wv * UP, hv * UP);
  },

  drawFx(u) {
    // sparkle burst where the GIF pops
    if (u >= LEAP0 && u < LEAP0 + 0.3) {
      const S = gifPelican(LEAP0);
      const k = (u - LEAP0) / 0.3;
      const a = 255 * (1 - k);
      for (const [ang, d, r] of [[-2.4, 120, 16], [-1.6, 150, 12], [-0.6, 130, 18], [0.3, 110, 11], [2.6, 100, 13], [-3.0, 95, 10]]) {
        const x = S.x + Math.cos(ang) * d * (0.6 + 0.6 * k), y = S.y - 90 + Math.sin(ang) * d * (0.6 + 0.6 * k), r0 = r * (1 - 0.5 * k);
        fill(255, 255, 255, a); stroke(31, 127, 240, a); strokeWeight(2.5);
        beginShape();
        for (let j = 0; j < 8; j++) { const q = (j * Math.PI) / 4, rad = j % 2 ? r0 * 0.3 : r0; vertex(x + rad * Math.cos(q), y + rad * Math.sin(q)); }
        endShape(CLOSE);
        noStroke();
      }
    }
    // landing marks
    if (u >= LEAP1 && u < LEAP1 + 0.22) {
      const k = (u - LEAP1) / 0.22, x = PROF.x(u);
      stroke(19, 33, 61, 255 * (1 - k)); strokeWeight(3);
      for (const wx of [x - 102, x + 106]) for (const dir of [-1, 1]) {
        const x0 = wx + dir * (40 + 30 * k), y0 = 792;
        line(x0, y0, x0 + dir * 22, y0 - 16);
      }
      noStroke();
    }
  },
};
