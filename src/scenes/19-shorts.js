// 19 · 竖屏短视频 / Vertical Short Video · 2020s
//
// The picture is a golden-hour waterfront bike path painted as crisp, modern flat-vector art
// (Canvas2D gradients, baked once into framebuffers; the rider is re-painted every frame into a
// 2D canvas so it gets real gradients, rim light and anti-aliased edges).
// For u ∈ [0, 6) the overlay snaps the screen to a 9:16 phone video with the fictional app
// 「鹕视 PeliCam」: tabs, action rail, caption (= the panel title), floating hearts and comments,
// and a progress bar that is full on the last frame before the cut back at u = 6.
//
// Video time: the drawn rider is "edited" — freeze-frame at u 2.0–2.5, slow motion 2.5–4.0 —
// by drawing ctx.riderAt() at a warped time whose position is D(u). The ride profile itself
// (hold 2–4 at 0.5×) pays for the lost distance, so D(u) = true position outside (2, 4).
import { profile } from '../beat/ride.js';
import { SPEED, VIEW_W, VIEW_H, BASE_PX_PER_UNIT } from '../beat/timeline.js';
import { rng, hash, noise2, clamp, lerp, smoothstep, smootherstep, easeOut, easeIn, easeInOut, easeOutBack } from '../kit/math.js';
import { rigParts } from '../rig/parts.js';

const ID = 'shorts';
const RIDE = { hold: [2.0, 4.0], speed: 0.5, ramp: 0.04 };   // lost 0.98 s, peak 1.49×
const PROF = profile(RIDE);
const SUN = [585, 548];                 // the low sun (panel units)
const HORIZON = 600;
const C0 = 656, C1 = 1264, CW = C1 - C0, SH = VIEW_H;   // the 9:16 column on screen
const RAILX = C1 - 52;                   // action rail centre

// ------------------------------------------------------------------ video time
const X = (u) => PROF.x(u);
const X2 = X(2), X4 = X(4);
/** Drawn (edited) rider position, panel-local x. */
function D(u) {
  if (u <= 2) return X(u);
  if (u <= 2.5) return X2;                                  // freeze-frame
  if (u < 4) return X2 + (X4 - X2) * (u - 2.5) / 1.5;       // slow motion (≈0.68× cruising)
  return X(u);
}
const dD = (u) => (D(u + 0.01) - D(u - 0.01)) / 0.02;
/** The real time at which the rider stood at D(u) (drawn with ctx.riderAt). */
function vtOf(u) {
  if (u <= 2) return u;
  if (u <= 2.5) return 2;
  if (u >= 4) return u;
  const target = D(u);
  let lo = 2, hi = 4;
  for (let k = 0; k < 36; k++) { const m = (lo + hi) / 2; if (X(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** Clock for the picture's own animation (glitter, gulls): frozen, then half speed. */
function vclock(u) {
  if (u <= 2) return u;
  if (u <= 2.5) return 2;
  if (u <= 4) return 2 + (u - 2.5) * 0.5;
  return u - 1.25;
}

// ------------------------------------------------------------------ camera
const FW = (() => {
  const ds = [], ws = [];
  for (let k = 0; k < 13; k++) { const d = -0.6 + (1.2 * k) / 12; ds.push(d); ws.push(1 - (0.85 * Math.abs(d)) / 0.6); }
  return { ds, ws, sum: ws.reduce((a, b) => a + b, 0) };
})();
/** The film's follow camera (panel-local), replicated from camera.js with this panel's profile. */
function followLocal(u) {
  let s = 0;
  for (let k = 0; k < 13; k++) s += FW.ws[k] * X(u + FW.ds[k]);
  return s / FW.sum;
}
/** Blend weight of the vertical framing: exactly 0 on [0, 0.5] and [5.5, 6]. */
const camW = (u) => smootherstep(0.5, 1.0, u) * (1 - smootherstep(5.0, 5.5, u));
const halfW = (z) => CW / 2 / (BASE_PX_PER_UNIT * z);
const halfH = (z) => SH / 2 / (BASE_PX_PER_UNIT * z);

function camTarget(u) {
  const d = D(u);
  let x, y, z;
  if (u < 2.0) { x = d + 35; y = 610; z = 1.45; }
  else if (u < 2.5) {                                        // punch-in on the frozen face
    const k = easeOut((u - 2.0) / 0.14);
    x = lerp(d + 35, d + 62, k); y = lerp(610, 515, k); z = Math.exp(lerp(Math.log(1.45), Math.log(2.35), k));
  } else if (u < 4.0) {                                      // wheelie, slow push-in
    x = d + 8; y = 592; z = lerp(1.36, 1.46, smoothstep(2.5, 4.0, u));
  } else {
    const k = smootherstep(4.0, 4.35, u), k2 = smootherstep(4.35, 5.0, u);
    x = lerp(lerp(d + 8, d + 35, k), d - 20, k2); y = lerp(592, 610, k); z = 1.45;
  }
  y = clamp(y, halfH(z), 1000 - halfH(z));
  if (!(u >= 2.0 && u < 2.5)) {                              // handheld phone wobble
    const a = 2.4 * 1.45 / z;
    x += a * (noise2(u * 0.9, 0.5, 191) * 2 - 1) + 0.6 * a * (noise2(u * 3.3, 2.5, 192) * 2 - 1);
    y += 0.8 * a * (noise2(u * 0.8, 4.5, 193) * 2 - 1) + 0.5 * a * (noise2(u * 3.7, 6.5, 194) * 2 - 1);
  }
  return { x, y, z };
}

// ------------------------------------------------------------------ gag geometry
const easeOutBounce = (t) => {
  t = clamp(t);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
/** Wheelie angle (≤ 0) as a function of the rider's (warped) time v. */
function wheelie(v) {
  if (v <= 2.0 || v >= 4.0) return 0;
  const up = smootherstep(2.0, 2.28, v), down = 1 - smootherstep(3.7, 3.99, v);
  const wob = Math.sin((v - 2.28) * 7.0) * 0.014 * smoothstep(2.3, 2.5, v) * (1 - smoothstep(3.5, 3.7, v));
  return -(0.18 + wob) * up * down;
}
/** Accessories (helmet + sunglasses) in real u: drop in during the freeze, pop off after the gag. */
function accessories(u) {
  if (u < 2.0 || u > 4.6) return null;
  const off = smoothstep(4.3, 4.42, u);
  const sparkle = u >= 4.3 && u < 4.62 ? (u - 4.3) / 0.32 : -1;
  return {
    helmet: { dy: -300 * (1 - easeOutBounce((u - 2.0) / 0.3)), a: 1 - off, lift: 14 * off },
    glasses: u >= 2.1 ? { dy: -300 * (1 - easeOutBounce((u - 2.1) / 0.32)), a: 1 - off, lift: 10 * off } : null,
    sparkle,
  };
}

// ------------------------------------------------------------------ UI content
const COMMENTS = [
  [0.30, '海边路人', '前方高能'],
  [0.80, 'pelican_fan', 'W pelican'],
  [1.30, '鹕粉一号', '它真的在骑？？'],
  [1.78, 'momo', 'this one again'],
  [2.16, '骑行老张', '名场面打卡'],
  [2.68, '不吃香菜', '慢放才看清，这是 wheelie'],
  [3.00, '夜跑的猫', '鹈鹕：基操'],
  [3.06, 'Kai', 'the sunglasses lmao'],
  [3.12, '今天也要骑车', '啊啊啊啊啊啊'],
  [3.18, '小鹕', '墨镜哪来的'],
  [3.24, 'birdwatcher', 'pelican supremacy'],
  [3.30, '路过的海鸥', '前排'],
  [3.36, '阿北', '这车哪买的'],
  [3.42, 'nora', 'HOW'],
  [3.48, '教练', '教练我想学这个'],
  [4.15, '艺术史课代表', '第一次见鹈鹕骑车（假的，已经见了一万年）'],
  [4.80, '时间旅行者', '这是第几个时代了'],
  [5.30, '码农小鹕', '下一站：代码？'],
];

const HEARTS = (() => {
  const r = rng(hash(ID, 'hearts'));
  const out = [];
  const add = (s, big = 1) => out.push({ s, drift: r.range(70, 160), wob: r.range(6, 18), ph: r.range(0, 6.28), rise: r.range(270, 390),
    size: r.range(0.55, 0.95) * big, life: r.range(1.3, 1.8), col: r.int(0, 5), rot: r.range(-0.4, 0.4) });
  for (let s = 0.2; s < 2.0; s += r.range(0.32, 0.55)) add(s);
  for (let k = 0; k < 14; k++) add(2.5 + r.range(0, 0.3), 1.1);
  for (let s = 3.0; s < 3.5; s += r.range(0.03, 0.06)) add(s);
  for (let k = 0; k < 10; k++) add(3.5 + r.range(0, 0.2), 1.15);
  for (let s = 3.75; s < 5.95; s += r.range(0.18, 0.34)) add(s);
  return out;
})();
const HEART_COLS = [[255, 59, 92], [255, 122, 162], [255, 180, 107], [255, 209, 102], [179, 136, 255], [255, 255, 255]];
// double-tap hearts on the video: [u, dx, dy (screen px from the pelican), rot]
const TAPS = [[2.5, 0, -300, -0.22], [3.0, -50, -290, 0.2], [3.25, 60, -300, -0.12], [3.5, 10, -280, 0.16]];

function likes(u) {
  const steps = [[0, 92300], [0.5, 93100], [1.0, 93800], [1.5, 94600], [2.0, 95900], [2.5, 97200], [2.75, 98300], [3.0, 99120]];
  let n = steps[0][1];
  for (const [t, v] of steps) if (u >= t) n = v;
  if (u >= 3.0 && u < 3.5) return { text: Math.floor(lerp(99120, 99999, Math.pow(clamp((u - 3.0) / 0.47), 0.7))).toLocaleString('en-US'), race: true };
  if (u >= 3.5) return { text: '10万+', big: true };
  return { text: wan(n) };
}
const wan = (n) => (n >= 10000 ? `${(Math.floor(n / 1000) / 10).toFixed(1).replace(/\.0$/, '')}万` : String(n));
const beatsSince = (u, a) => Math.max(0, Math.floor((u - a) / 0.5 + 1e-9));
const commentsCount = (u) => wan(23400 + 900 * beatsSince(u, 0) + (u >= 3 ? 3100 : 0) + (u >= 3.25 ? 2200 : 0));
const savesCount = (u) => wan(11800 + 300 * beatsSince(u, 0) + (u >= 3.5 ? 1900 : 0));

// ------------------------------------------------------------------ Canvas2D helpers
const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
function poly(c, pts, close = true) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  if (close) c.closePath();
}
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }
function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function rgrad(c, x, y, r0, r1, stops) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function heartPath(c, cx, cy, w) {
  const k = w / 33;
  c.beginPath();
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const px = cx + x * k, py = cy + (y - 2.5) * k;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 };
}
/** Warm/cool edge light: stroke the shape's inside, faded by a gradient along L (clipped to the shape). */
function edgeLight(c, path, b, L, col, width) {
  c.save();
  path(); c.clip();
  const R = b.r * 1.05;
  c.strokeStyle = grad(c, b.cx - L[0] * R, b.cy - L[1] * R, b.cx + L[0] * R, b.cy + L[1] * R,
    [[0, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,0)'], [1, col]]);
  c.lineWidth = width * 2;
  c.lineJoin = 'round';
  path(); c.stroke();
  c.restore();
}
/**
 * Soft inner light/shadow: clip to the shape and let the blurred shadow of the
 * shape's surroundings (offset by dx, dy device px) bleed in from the opposite edge.
 */
function softEdge(c, trace, b, col, blurPx, dx, dy) {
  c.save();
  c.beginPath(); trace(); c.clip();
  c.shadowColor = col; c.shadowBlur = blurPx; c.shadowOffsetX = dx; c.shadowOffsetY = dy;
  const m = 60;
  c.beginPath(); c.rect(b.x0 - m, b.y0 - m, b.x1 - b.x0 + 2 * m, b.y1 - b.y0 + 2 * m); trace();
  c.fillStyle = '#000'; c.fill('evenodd');
  c.restore();
}
const tracePts = (c, pts) => () => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const traceCirc = (c, x, y, r) => () => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); c.closePath(); };

/** Stroke a polyline as a shaded cylinder (gradient across the tube, light from above). */
function tube(c, pts, w, stops) {
  const a = pts[0], b = pts[pts.length - 1];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  let nx = -dy, ny = dx;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const m = pts[Math.floor(pts.length / 2)];
  c.strokeStyle = grad(c, m[0] - nx * w / 2, m[1] - ny * w / 2, m[0] + nx * w / 2, m[1] + ny * w / 2, stops);
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

const TEAL = [[0, '#0a5a55'], [0.3, '#1ba497'], [0.58, '#36d3c4'], [0.76, '#c6fff5'], [0.88, '#3fd2c4'], [1, '#14837a']];
const BLACK = [[0, '#07060a'], [0.45, '#1c1b23'], [0.75, '#5f5e6c'], [0.88, '#2a2932'], [1, '#121117']];
const SILVER = [[0, '#6f7380'], [0.5, '#c9ccd6'], [0.75, '#f4f5f9'], [1, '#8a8e9a']];
const TUBE_W = { tube_downtube: 10, tube_toptube: 7.2, tube_seattube: 8, tube_headtube: 10.5, tube_chainstay: 5.2, tube_seatstay: 4.6 };

// ------------------------------------------------------------------ the rider (Canvas2D, every frame)
/** Paint the placed pose P in panel units into a 2D context (already transformed). */
function paintRider(c, P, o) {
  const B = P.bird;
  const L = o.L;                                   // unit vector toward the sun
  const rimC = `rgba(255,${(200 + 30 * o.rimK) | 0},${(140 + 40 * o.rimK) | 0},${(0.55 + 0.4 * o.rimK).toFixed(3)})`;
  const coolC = 'rgba(92,104,162,0.62)';
  const rimHot = `rgba(255,246,220,${(0.35 + 0.5 * o.rimK).toFixed(3)})`;
  const down = [0.15, 1];
  // one vertical gradient for every white part, so neck/head/body join without seams
  const yTop = B.head.c[1] - B.head.r, yBot = Math.max(...B.body.map((p) => p[1]));
  const white = grad(c, 0, yTop, 0, yBot + 4, [[0, '#fffefb'], [0.35, '#fbf8f7'], [0.7, '#e7e6ef'], [1, '#bcc3d8']]);
  const orange = (y0, y1) => grad(c, 0, y0, 0, y1, [[0, '#ffc95a'], [0.45, '#ff9a33'], [1, '#e9611e']]);

  // wheel contact occlusion
  for (const wh of P.bike.wheels) {
    const h = clamp(1 - (800 - (wh.c[1] + wh.r)) / 40);
    if (h <= 0) continue;
    c.save();
    c.translate(wh.c[0], 801); c.scale(1, 0.18);
    c.fillStyle = rgrad(c, 0, 0, 0, 40, [[0, `rgba(14,8,26,${0.6 * h})`], [1, 'rgba(14,8,26,0)']]);
    circ(c, 0, 0, 40); c.fill();
    c.restore();
  }

  const S = o.s;
  // form shading (cool, from below / away) and warm rim (toward the sun), both soft
  const shadeSoft = (tr, b, k = 1, dir = [0, 1]) => softEdge(c, tr, b, coolC, 9 * S * k, -dir[0] * 5 * S * k, -dir[1] * 5 * S * k);
  const rimSoft = (tr, b, k = 1) => {
    softEdge(c, tr, b, rimC, 3.5 * S * k, -L[0] * 3.2 * S * k, -L[1] * 3.2 * S * k);
    softEdge(c, tr, b, rimHot, 1.2 * S, -L[0] * 1.3 * S, -L[1] * 1.3 * S);
  };
  const fillShape = (pts, style, shade = true, rim = true, coolW = 7) => {
    c.fillStyle = style; poly(c, pts); c.fill();
    const b = bbox(pts), tr = tracePts(c, pts);
    if (shade) shadeSoft(tr, b, coolW / 7);
    if (rim) rimSoft(tr, b);
  };

  for (const part of rigParts(P)) {
    const r = part.role;
    switch (r) {
      case 'legFar': c.fillStyle = grad(c, 0, part.pts[0][1], 0, 800, [[0, '#cf8063'], [1, '#9e5743']]); poly(c, part.pts); c.fill(); break;
      case 'footFar': c.fillStyle = '#a95e48'; poly(c, part.pts); c.fill(); break;
      case 'crankFar': tube(c, part.pts, 4.2, BLACK); break;
      case 'tire': {
        c.lineWidth = 7.4; c.strokeStyle = '#1a1920';
        circ(c, part.c[0], part.c[1], part.r - 3.7); c.stroke();
        // sun-side sheen on the tread
        const a0 = Math.atan2(L[1], L[0]);
        c.lineWidth = 1.4; c.strokeStyle = rimC; c.lineCap = 'round';
        c.beginPath(); c.arc(part.c[0], part.c[1], part.r - 1.2, a0 - 0.9, a0 + 0.9); c.stroke();
        break;
      }
      case 'rim': {
        const k = +part.name.slice(3);
        const wh = P.bike.wheels[k];
        const R = wh.r;
        // deep-section carbon rim with a fixed (light-locked) sheen
        const cg = c.createConicGradient(-Math.PI / 2, wh.c[0], wh.c[1]);
        cg.addColorStop(0, '#4b4a58'); cg.addColorStop(0.18, '#22212a'); cg.addColorStop(0.45, '#2d2c37');
        cg.addColorStop(0.7, '#18171e'); cg.addColorStop(0.9, '#3d3c49'); cg.addColorStop(1, '#4b4a58');
        c.strokeStyle = cg; c.lineWidth = 0.17 * R;
        circ(c, wh.c[0], wh.c[1], 0.805 * R); c.stroke();
        // teal decals rotate with the wheel (smear when fast)
        const sm = o.spin;
        c.strokeStyle = `rgba(62,224,208,${(0.95 / (1 + sm * 2.2)).toFixed(3)})`;
        c.lineWidth = 0.07 * R; c.lineCap = 'butt';
        for (let j = 0; j < 2; j++) {
          const a = wh.angle + j * Math.PI;
          c.beginPath(); c.arc(wh.c[0], wh.c[1], 0.805 * R, a, a + 0.55 + sm * 1.1); c.stroke();
        }
        break;
      }
      case 'spoke': {
        const [a, b] = part.pts;
        const t = 0.82;
        c.strokeStyle = `rgba(214,219,234,${(0.62 - 0.32 * o.spin).toFixed(3)})`; c.lineWidth = 0.75; c.lineCap = 'round';
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], t), lerp(a[1], b[1], t)); c.stroke();
        break;
      }
      case 'hub': c.fillStyle = rgrad(c, part.c[0] - 1, part.c[1] - 1, 0, part.r * 1.4, [[0, '#ffffff'], [0.5, '#b9bcc8'], [1, '#5c5f6a']]); circ(c, part.c[0], part.c[1], part.r * 1.15); c.fill(); break;
      case 'chain': c.strokeStyle = '#3b3a46'; c.lineWidth = 1.7; c.lineJoin = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'frame': tube(c, part.pts, TUBE_W[part.name] ?? 7, TEAL); break;
      case 'fork': tube(c, part.pts, 7, TEAL); break;
      case 'stem': tube(c, part.pts, 6, BLACK); break;
      case 'bars': tube(c, part.pts, 5, BLACK); break;
      case 'seatpost': tube(c, part.pts, 5, BLACK); break;
      case 'saddle': tube(c, part.pts, 6.5, BLACK); break;
      case 'ring': {
        c.fillStyle = grad(c, part.c[0], part.c[1] - part.r, part.c[0], part.c[1] + part.r, SILVER);
        circ(c, part.c[0], part.c[1], part.r); c.fill();
        c.strokeStyle = '#2a2a33'; c.lineWidth = 1.6; c.setLineDash([1.6, 1.4]);
        circ(c, part.c[0], part.c[1], part.r + 0.4); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#26252e'; circ(c, part.c[0], part.c[1], part.r * 0.38); c.fill();
        break;
      }
      case 'tail': {
        // near leg first: it stays in front of the frame, while the plumage covers the thigh
        const LN = B.legNear;
        fillShape(LN.poly, grad(c, 0, LN.hip[1], 0, 800, [[0, '#d98663'], [0.3, '#ffbd8a'], [1, '#ea7b52']]), true, true, 3);
        c.fillStyle = '#f08a5d'; poly(c, LN.web); c.fill();
        fillShape(part.pts, white, true, true, 5);
        break;
      }
      case 'body': fillShape(part.pts, white, true, true, 10); break;
      case 'wing': {
        c.save();
        c.shadowColor = 'rgba(64,62,110,0.38)'; c.shadowBlur = 7 * o.s; c.shadowOffsetX = -1 * o.s; c.shadowOffsetY = 2.5 * o.s;
        c.fillStyle = grad(c, 0, yTop, 0, yBot + 4, [[0, '#ffffff'], [0.5, '#f4f2f6'], [1, '#c6cbdc']]);
        poly(c, part.pts); c.fill();
        c.restore();
        const b = bbox(part.pts);
        const path = () => poly(c, part.pts);
        // covert-feather scallops
        c.save(); path(); c.clip();
        c.strokeStyle = 'rgba(150,158,200,0.35)'; c.lineWidth = 1.2; c.lineCap = 'round';
        for (let j = 0; j < 3; j++) {
          const fx = lerp(b.x0 + 14, b.cx + 6, j / 2), fy = b.y1 - 9 - j * 3;
          c.beginPath(); c.moveTo(fx - 16, fy - 4 + j); c.quadraticCurveTo(fx, fy + 2, fx + 18, fy - 2); c.stroke();
        }
        c.restore();
        shadeSoft(tracePts(c, part.pts), b, 0.9);
        rimSoft(tracePts(c, part.pts), b);
        break;
      }
      case 'secondaries': c.fillStyle = '#34323f'; poly(c, taper(part.pts, 6, 1.6)); c.fill(); break;
      case 'primary': {
        c.fillStyle = grad(c, 0, part.pts[0][1] - 6, 0, part.pts[part.pts.length - 1][1] + 6, [[0, '#3b3946'], [1, '#17161d']]);
        poly(c, taper(part.pts, 5.2, 1.2)); c.fill();
        break;
      }
      case 'neck': {
        c.fillStyle = white; poly(c, part.pts); c.fill();
        const b = bbox(part.pts), tr = tracePts(c, part.pts);
        shadeSoft(tr, b, 0.7, [-0.85, 0.5]);
        rimSoft(tr, b);
        break;
      }
      case 'head': {
        const path = () => circ(c, part.c[0], part.c[1], part.r);
        c.fillStyle = white; path(); c.fill();
        const b = { cx: part.c[0], cy: part.c[1], r: part.r };
        const bb = { x0: part.c[0] - part.r, y0: part.c[1] - part.r, x1: part.c[0] + part.r, y1: part.c[1] + part.r };
        const tr = traceCirc(c, part.c[0], part.c[1], part.r);
        shadeSoft(tr, bb, 0.55, [-0.6, 0.8]);
        rimSoft(tr, bb, 0.8);
        break;
      }
      case 'crest': c.strokeStyle = '#fff1c4'; c.lineWidth = 2.6; c.lineCap = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'pouch': {
        const b = bbox(part.pts);
        const path = () => poly(c, part.pts);
        c.fillStyle = orange(b.y0, b.y1); path(); c.fill();
        // gloss: a long highlight under the jaw line
        const J = B.lowerJawLine;
        const dx = J[1][0] - J[0][0], dy = J[1][1] - J[0][1], Lj = Math.hypot(dx, dy) || 1;
        const nx = -dy / Lj, ny = dx / Lj;
        c.save(); path(); c.clip();
        c.strokeStyle = 'rgba(255,255,240,0.62)'; c.lineWidth = 3.2; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(J[0][0] + dx * 0.12 + nx * 7, J[0][1] + dy * 0.12 + ny * 7);
        c.quadraticCurveTo(J[0][0] + dx * 0.35 + nx * 11, J[0][1] + dy * 0.35 + ny * 11, J[0][0] + dx * 0.6 + nx * 8, J[0][1] + dy * 0.6 + ny * 8);
        c.stroke();
        c.restore();
        edgeLight(c, path, b, down, 'rgba(160,50,30,0.55)', 4);
        edgeLight(c, path, b, L, 'rgba(255,236,170,0.9)', 2);
        break;
      }
      case 'bill': {
        const b = bbox(part.pts);
        c.fillStyle = grad(c, 0, b.y0, 0, b.y1, [[0, '#ffe6c4'], [0.6, '#f7bf93'], [1, '#e28f6c']]);
        poly(c, part.pts); c.fill();
        c.strokeStyle = 'rgba(255,255,245,0.8)'; c.lineWidth = 1.3; c.lineCap = 'round';
        poly(c, [part.pts[0], part.pts[1], part.pts[2]], false); c.stroke();
        break;
      }
      case 'nail': c.fillStyle = '#e2462e'; poly(c, part.pts); c.fill(); break;
      case 'face': c.fillStyle = '#f7ae88'; poly(c, part.pts); c.fill(); break;
      case 'eye': c.fillStyle = '#fffaf0'; circ(c, part.c[0], part.c[1], part.r); c.fill(); c.strokeStyle = 'rgba(90,50,40,0.6)'; c.lineWidth = 0.7; c.stroke(); break;
      case 'pupil': {
        c.fillStyle = '#1b1420'; circ(c, part.c[0], part.c[1], part.r); c.fill();
        c.fillStyle = '#ffffff'; circ(c, part.c[0] - part.r * 0.35, part.c[1] - part.r * 0.4, part.r * 0.34); c.fill();
        break;
      }
      case 'eyeShut': c.strokeStyle = '#2a1f24'; c.lineWidth = 1.4; c.lineCap = 'round'; poly(c, part.pts, false); c.stroke(); break;
      case 'leg': break;                     // drawn before the body (see 'tail')
      case 'foot': break;
      case 'crank': tube(c, part.pts, 4.6, BLACK); break;
      case 'pedal': tube(c, part.pts, 4, BLACK); break;
      default: break;
    }
  }
  if (o.acc) paintAccessories(c, P, o.acc);
}

/** Helmet + sunglasses, drawn in head-local coordinates (x along the bill). */
function paintAccessories(c, P, acc) {
  const B = P.bird;
  const hc = B.head.c, hr = B.head.r;
  const ub = B.upperBill;
  const ab = Math.atan2(ub[2][1] - ub[0][1], ub[2][0] - ub[0][0]);
  const k = hr / 17;
  if (acc.helmet && acc.helmet.a > 0.01) {
    const H = acc.helmet;
    c.save();
    c.globalAlpha = H.a;
    c.translate(hc[0], hc[1] + H.dy - H.lift);
    c.rotate(ab - 0.12 - 0.08);
    c.translate(2.5, 2);
    c.scale(k * 0.94 * (0.4 + 0.6 * H.a), k * 0.94 * (0.4 + 0.6 * H.a));
    const shell = () => {
      c.beginPath();
      c.moveTo(19, -1);
      c.bezierCurveTo(18, -22, -6, -30, -20, -18);
      c.bezierCurveTo(-27, -12, -30, -4, -32, 2);    // aero tail
      c.lineTo(-17, 0);
      c.quadraticCurveTo(2, -6, 19, -1);
      c.closePath();
    };
    c.fillStyle = grad(c, 0, -28, 0, 2, [[0, '#ffffff'], [0.35, '#e9fbf8'], [0.36, '#2ec4b6'], [0.8, '#1a9d91'], [1, '#0f6f67']]);
    shell(); c.fill();
    c.save(); shell(); c.clip();
    c.fillStyle = '#16151c';
    for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(-12 + j * 9, -19 + j * 1.5, 3.4, 1.4, -0.35 + j * 0.25, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-12, -25); c.quadraticCurveTo(2, -28, 12, -18); c.stroke();
    c.restore();
    // strap
    c.strokeStyle = '#1d1c24'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-6, -2); c.quadraticCurveTo(-2, 14, 12, 19); c.stroke();
    c.restore();
  }
  if (acc.glasses && acc.glasses.a > 0.01) {
    const G = acc.glasses;
    const e = B.eye.c;
    c.save();
    c.globalAlpha = G.a;
    c.translate(e[0] + 0.5 * k, e[1] + G.dy - G.lift);
    c.rotate(ab - 0.12 + 0.05);
    c.scale(k * (0.4 + 0.6 * G.a), k * (0.4 + 0.6 * G.a));
    // temple arm back over the head
    c.strokeStyle = '#121116'; c.lineWidth = 1.9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-6, -3.5); c.lineTo(-19, -6.5); c.stroke();
    const lens = () => {
      c.beginPath();
      c.moveTo(-7.5, -5); c.lineTo(8.5, -5);
      c.quadraticCurveTo(9.5, 4.5, 2, 5.6);
      c.quadraticCurveTo(-6.5, 6, -7.6, -1);
      c.closePath();
    };
    c.fillStyle = grad(c, 0, -5, 0, 6, [[0, '#22143a'], [0.45, '#8e3a6e'], [0.8, '#ff8a5c'], [1, '#ffd08f']]);
    lens(); c.fill();
    c.save(); lens(); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(-2, 6); c.lineTo(4, -6); c.stroke();
    c.lineWidth = 0.8; c.beginPath(); c.moveTo(2, 6); c.lineTo(7, -6); c.stroke();
    c.restore();
    c.strokeStyle = '#0d0c10'; c.lineWidth = 1.6; c.lineJoin = 'round';
    lens(); c.stroke();
    c.beginPath(); c.moveTo(8.5, -4.6); c.lineTo(12, -3.2); c.stroke();     // bridge
    c.restore();
  }
  if (acc.sparkle >= 0) {
    // "poof": two four-point sparkles where the props were
    const t = acc.sparkle, a = Math.sin(Math.PI * t);
    c.save();
    c.fillStyle = `rgba(255,252,235,${a.toFixed(3)})`;
    for (const [dx, dy, R] of [[-4, -22, 11], [14, -8, 7], [-16, -4, 6]]) {
      const x = hc[0] + dx * k, y = hc[1] + dy * k - 8 * t, rr = R * k * (0.4 + 0.8 * t);
      c.beginPath();
      for (let j = 0; j < 8; j++) { const ang = (j * Math.PI) / 4; const q = j % 2 ? rr * 0.22 : rr; c.lineTo(x + q * Math.cos(ang), y + q * Math.sin(ang)); }
      c.closePath(); c.fill();
    }
    c.restore();
  }
}

/** Every rig part as plain geometry (for the cast shadow). */
function paintSilhouette(c, P) {
  for (const part of rigParts(P)) {
    const r = part.role;
    if (r === 'eye' || r === 'pupil' || r === 'face' || r === 'nail' || r === 'eyeShut' || r === 'hub') continue;
    if (part.kind === 'circle') {
      if (r === 'tire') { c.lineWidth = 7; circ(c, part.c[0], part.c[1], part.r - 3.5); c.stroke(); }
      else if (r === 'ring' || r === 'head') { circ(c, part.c[0], part.c[1], part.r); c.fill(); }
    } else if (part.kind === 'poly') { poly(c, part.pts); c.fill(); }
    else {
      c.lineWidth = r === 'spoke' ? 0.8 : r === 'frame' ? (TUBE_W[part.name] ?? 7) : 4.5;
      poly(c, part.pts, false); c.stroke();
    }
  }
}

// ------------------------------------------------------------------ static picture (Canvas2D → bakes)
function bake2d(K, key, w, h, paint) {
  w = Math.ceil(w); h = Math.ceil(h);
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  const c = g.drawingContext;
  c.clearRect(0, 0, w, h);
  c.save();
  paint(c, w, h);
  c.restore();
  const fb = K.bake(key, w, h, () => { imageMode(CORNER); image(g, 0, 0, w, h); });
  g.remove();
  return { fb, w, h };
}

const BG = { x0: 0, y0: 0, w: 1000, h: 745, s: 1.5 };
const FR = { x0: -24, y0: 560, w: 1048, h: 440, s: 2 };

function paintBackground(c, S, r) {
  c.setTransform(S, 0, 0, S, 0, 0);
  // sky
  c.fillStyle = grad(c, 0, 0, 0, HORIZON, [[0, '#33295f'], [0.22, '#55407f'], [0.45, '#9a4f88'], [0.66, '#e8616f'], [0.82, '#ff8e66'], [0.93, '#ffb46b'], [1, '#ffd79c']]);
  c.fillRect(0, 0, 1000, BG.h);
  // huge sun glow
  c.fillStyle = rgrad(c, SUN[0], SUN[1], 0, 520, [[0, 'rgba(255,226,160,0.9)'], [0.18, 'rgba(255,190,120,0.55)'], [0.5, 'rgba(255,130,110,0.18)'], [1, 'rgba(255,110,110,0)']]);
  c.fillRect(0, 0, 1000, BG.h);
  // stratus streaks, lit from below
  const cl = canvas2d(1000 * S, 640 * S), cc = cl.getContext('2d');
  cc.setTransform(S, 0, 0, S, 0, 0);
  for (let k = 0; k < 16; k++) {
    const y = r.range(70, 430), x = r.range(-100, 1050), w = r.range(160, 420), h = r.range(7, 20) * (0.6 + y / 500);
    const near = 1 - Math.min(1, Math.hypot(x - SUN[0], (y - SUN[1]) * 2) / 900);
    cc.fillStyle = grad(cc, 0, y - h, 0, y + h, [[0, 'rgba(120,70,140,0.0)'], [0.45, `rgba(${200 + 55 * near | 0},${110 + 80 * near | 0},${130 + 40 * near | 0},${0.35 + 0.25 * near})`], [0.75, `rgba(255,${170 + 60 * near | 0},150,${0.45 + 0.3 * near})`], [1, 'rgba(255,200,160,0)']]);
    cc.beginPath(); cc.ellipse(x, y, w / 2, h, r.range(-0.03, 0.03), 0, Math.PI * 2); cc.fill();
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${(6 * S) | 0}px)`; c.drawImage(cl, 0, 0); c.restore();
  c.setTransform(S, 0, 0, S, 0, 0);
  // sun disc
  c.fillStyle = rgrad(c, SUN[0], SUN[1], 0, 52, [[0, '#fffdf5'], [0.55, '#fff4d6'], [0.72, 'rgba(255,232,180,0.95)'], [1, 'rgba(255,214,150,0)']]);
  circ(c, SUN[0], SUN[1], 52); c.fill();

  // far skyline + bridge (hazy, strongly defocused)
  const far = canvas2d(1000 * S, 640 * S), fc = far.getContext('2d');
  fc.setTransform(S, 0, 0, S, 0, 0);
  fc.fillStyle = grad(fc, 0, 380, 0, HORIZON, [[0, '#e7907f'], [1, '#f6b08a']]);
  let x = -20;
  while (x < 1020) {
    const w = r.range(22, 70);
    const gap = x > 430 && x < 760;                  // the bay opens under the sun
    const h = gap ? r.range(4, 18) : r.range(40, 165) * (x < 200 || x > 850 ? 1.2 : 0.85);
    fc.fillRect(x, HORIZON - h, w + 1, h + 2);
    if (!gap && r() < 0.25) { fc.fillRect(x + w * 0.45, HORIZON - h - r.range(10, 40), 2, 40); }
    x += w + (gap ? r.range(10, 40) : r.range(0, 6));
  }
  // cable-stayed bridge across the bay
  fc.strokeStyle = '#d97f7a'; fc.fillStyle = '#d97f7a';
  fc.fillRect(380, 571, 480, 4);
  for (const px of [470, 720]) {
    fc.fillRect(px - 3, 470, 6, 104);
    fc.lineWidth = 0.9;
    for (let j = 1; j <= 7; j++) {
      fc.beginPath(); fc.moveTo(px, 478 + j * 3); fc.lineTo(px - j * 15, 572); fc.stroke();
      fc.beginPath(); fc.moveTo(px, 478 + j * 3); fc.lineTo(px + j * 15, 572); fc.stroke();
    }
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${(3.6 * S) | 0}px)`; c.globalAlpha = 0.85; c.drawImage(far, 0, 0); c.restore();

  // near skyline: dark towers with lit edges and window bokeh (less blur)
  const near = canvas2d(1000 * S, 760 * S), nc = near.getContext('2d');
  nc.setTransform(S, 0, 0, S, 0, 0);
  const towers = [];
  x = -30;
  while (x < 1040) {
    const w = r.range(40, 110);
    const inBay = x > 380 && x < 800;
    if (!inBay) towers.push({ x, w, h: r.range(90, 270) * (x < 150 || x > 880 ? 1.15 : 0.9), cap: r() });
    x += w + r.range(4, 20) + (inBay ? 60 : 0);
  }
  for (const t of towers) {
    const top = HORIZON - t.h;
    nc.fillStyle = grad(nc, t.x, 0, t.x + t.w, 0, [[0, '#3a3558'], [0.7, '#463e66'], [1, t.x + t.w < SUN[0] ? '#7a5a7e' : '#3b3658']]);
    nc.beginPath();
    if (t.cap < 0.3) { nc.moveTo(t.x, HORIZON + 4); nc.lineTo(t.x, top + 20); nc.lineTo(t.x + t.w * 0.5, top); nc.lineTo(t.x + t.w, top + 20); nc.lineTo(t.x + t.w, HORIZON + 4); }
    else if (t.cap < 0.55) { nc.moveTo(t.x, HORIZON + 4); nc.lineTo(t.x, top); nc.lineTo(t.x + t.w * 0.7, top); nc.quadraticCurveTo(t.x + t.w, top, t.x + t.w, top + 30); nc.lineTo(t.x + t.w, HORIZON + 4); }
    else { nc.rect(t.x, top, t.w, t.h + 4); }
    nc.fill();
    // sun-side lit edge
    const side = t.x + t.w < SUN[0] ? t.x + t.w - 2.5 : t.x;
    nc.fillStyle = 'rgba(255,170,120,0.45)'; nc.fillRect(side, top + 8, 2.5, t.h - 8);
    // window lights
    for (let wy = top + 14; wy < HORIZON - 8; wy += 11) {
      for (let wx = t.x + 6; wx < t.x + t.w - 6; wx += 9) {
        if (r() < 0.24) { nc.fillStyle = r() < 0.6 ? 'rgba(255,214,150,0.9)' : 'rgba(255,245,225,0.95)'; nc.fillRect(wx, wy, 3.5, 4.5); }
      }
    }
  }
  // shoreline + promenade lamps far away
  nc.fillStyle = '#2f2a48'; nc.fillRect(-30, HORIZON - 3, 1100, 9);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${(3.4 * S) | 0}px)`; c.drawImage(near, 0, 0); c.restore();
  c.setTransform(S, 0, 0, S, 0, 0);
  // big bokeh discs (defocused lights)
  for (let k = 0; k < 70; k++) {
    const t = r.pick(towers);
    if (!t) break;
    const bx = t.x + r.range(0, t.w), by = r.range(HORIZON - t.h + 10, HORIZON - 4), br = r.range(4, 12);
    c.fillStyle = rgrad(c, bx, by, br * 0.2, br, [[0, 'rgba(255,226,170,0.5)'], [0.8, 'rgba(255,200,140,0.32)'], [1, 'rgba(255,200,140,0)']]);
    circ(c, bx, by, br); c.fill();
  }

  // water
  c.fillStyle = grad(c, 0, HORIZON + 4, 0, BG.h, [[0, '#f7a873'], [0.2, '#e47b78'], [0.55, '#9a4f80'], [1, '#4b3569']]);
  c.fillRect(0, HORIZON + 4, 1000, BG.h - HORIZON - 4);
  // skyline reflection (mirrored, squashed, very soft)
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = `blur(${(5 * S) | 0}px)`;
  c.globalAlpha = 0.28;
  c.translate(0, (HORIZON + 6) * S); c.scale(1, -0.45); c.translate(0, -(HORIZON + 6) * S);
  c.drawImage(near, 0, 0);
  c.restore();
  c.setTransform(S, 0, 0, S, 0, 0);
  // sun path on the water
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = rgrad(c, 0, 0, 0, 1, [[0, 'rgba(255,214,150,0.55)'], [1, 'rgba(255,170,120,0)']]);
  c.translate(SUN[0], HORIZON + 8); c.scale(70, 150);
  circ(c, 0, 0, 1); c.fill();
  c.restore();
  c.setTransform(S, 0, 0, S, 0, 0);
  c.strokeStyle = 'rgba(255,220,190,0.10)'; c.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    const y = r.range(HORIZON + 8, BG.h), x0 = r.range(0, 1000), L = r.range(30, 160);
    c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + L, y); c.stroke();
  }
}

function paintFront(c, S, r) {
  c.setTransform(S, 0, 0, S, -FR.x0 * S, -FR.y0 * S);
  const X0 = FR.x0, X1 = FR.x0 + FR.w;
  const RAIL_T = 626, RAIL_B = 734, PATH_T = 742, PATH_B = 962;
  // glass railing panels
  c.fillStyle = grad(c, 0, RAIL_T, 0, RAIL_B, [[0, 'rgba(200,190,255,0.14)'], [1, 'rgba(120,100,170,0.22)']]);
  c.fillRect(X0, RAIL_T + 6, FR.w, RAIL_B - RAIL_T - 6);
  const posts = [];
  for (let px = X0 + 10; px < X1; px += 92) posts.push(px);
  // glass reflections
  c.save();
  c.beginPath(); c.rect(X0, RAIL_T + 6, FR.w, RAIL_B - RAIL_T - 6); c.clip();
  for (const px of posts) {
    c.fillStyle = 'rgba(255,240,230,0.10)';
    c.beginPath(); c.moveTo(px + 20, RAIL_B); c.lineTo(px + 48, RAIL_T); c.lineTo(px + 60, RAIL_T); c.lineTo(px + 32, RAIL_B); c.fill();
    c.fillStyle = 'rgba(255,240,230,0.06)';
    c.beginPath(); c.moveTo(px + 38, RAIL_B); c.lineTo(px + 66, RAIL_T); c.lineTo(px + 70, RAIL_T); c.lineTo(px + 42, RAIL_B); c.fill();
  }
  c.restore();
  // posts
  for (const px of posts) {
    const lit = px < SUN[0] ? 1 : 0;
    c.fillStyle = grad(c, px - 3.5, 0, px + 3.5, 0, lit ? [[0, '#26223a'], [0.7, '#3a3352'], [1, '#d9906e']] : [[0, '#d9906e'], [0.3, '#3a3352'], [1, '#26223a']]);
    c.fillRect(px - 3.5, RAIL_T, 7, RAIL_B - RAIL_T + 6);
  }
  // handrail + base rail
  c.fillStyle = grad(c, 0, RAIL_T - 6, 0, RAIL_T + 6, [[0, '#ffd9a6'], [0.3, '#8a6a86'], [1, '#2a253e']]);
  c.beginPath(); c.roundRect(X0, RAIL_T - 6, FR.w, 12, 6); c.fill();
  c.fillStyle = '#2a253c'; c.fillRect(X0, RAIL_B - 3, FR.w, 7);
  // far curb, lit by the low sun
  c.fillStyle = grad(c, 0, RAIL_B + 4, 0, PATH_T, [[0, '#d7a08d'], [1, '#9a7486']]);
  c.fillRect(X0, RAIL_B + 4, FR.w, PATH_T - RAIL_B - 4);
  // asphalt
  c.fillStyle = grad(c, 0, PATH_T, 0, PATH_B, [[0, '#46394f'], [0.25, '#3a3346'], [0.6, '#2f2c3b'], [1, '#272531']]);
  c.fillRect(X0, PATH_T, FR.w, PATH_B - PATH_T);
  // glare of the low sun on the asphalt
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(SUN[0], PATH_T + 18); c.scale(330, 70);
  c.fillStyle = rgrad(c, 0, 0, 0, 1, [[0, 'rgba(255,170,110,0.42)'], [0.5, 'rgba(230,110,110,0.14)'], [1, 'rgba(200,90,120,0)']]);
  circ(c, 0, 0, 1); c.fill();
  c.restore();
  c.setTransform(S, 0, 0, S, -FR.x0 * S, -FR.y0 * S);
  // grain
  for (let k = 0; k < 5200; k++) {
    const gx = r.range(X0, X1), gy = r.range(PATH_T, PATH_B);
    c.fillStyle = r() < 0.5 ? 'rgba(255,230,220,0.07)' : 'rgba(10,6,20,0.12)';
    c.fillRect(gx, gy, 1.1, 0.8);
  }
  // long golden-hour shadows of the posts, fanning away from the sun toward the viewer
  for (const px of posts) {
    const k = (px - SUN[0]) * 0.62;
    c.fillStyle = grad(c, 0, PATH_T, 0, PATH_B, [[0, 'rgba(18,10,32,0.55)'], [1, 'rgba(18,10,32,0.18)']]);
    c.beginPath();
    c.moveTo(px - 4, PATH_T); c.lineTo(px + 4, PATH_T);
    c.lineTo(px + 7 + k, PATH_B); c.lineTo(px - 9 + k, PATH_B);
    c.closePath(); c.fill();
  }
  // lane markings: dashed centre line and a solid edge line
  c.fillStyle = 'rgba(246,238,232,0.82)';
  for (let x = X0 + 6; x < X1; x += 74) c.fillRect(x, 853, 40, 4);
  // bike-lane stencils: a pelican on a bicycle (of course)
  for (const sx of [655]) {
    c.save();
    c.translate(sx, 902); c.scale(1, 0.4);
    c.strokeStyle = 'rgba(246,238,232,0.72)'; c.fillStyle = 'rgba(246,238,232,0.72)';
    c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    circ(c, -38, 0, 22); c.stroke(); circ(c, 38, 0, 22); c.stroke();
    poly(c, [[-38, 0], [-6, -2], [26, -30], [-14, -30], [-6, -2]], false); c.stroke();
    poly(c, [[26, -30], [38, 0]], false); c.stroke();
    c.beginPath(); c.ellipse(-6, -52, 22, 13, -0.2, 0, Math.PI * 2); c.fill();      // body
    circ(c, 14, -86, 8); c.fill();                                                     // head
    poly(c, [[10, -78], [18, -70], [12, -62], [6, -66]]); c.fill();                   // neck
    poly(c, [[18, -90], [62, -80], [56, -74], [20, -80]]); c.fill();                   // bill + pouch
    c.restore();
    c.fillStyle = 'rgba(246,238,232,0.6)';
    poly(c, [[sx - 16, 926], [sx + 16, 926], [sx + 16, 922], [sx + 30, 929], [sx + 16, 936], [sx + 16, 932], [sx - 16, 932]]); c.fill();
  }
  // near curb
  c.fillStyle = grad(c, 0, PATH_B, 0, PATH_B + 12, [[0, '#a88a96'], [1, '#5d4c63']]);
  c.fillRect(X0, PATH_B, FR.w, 12);
  // foreground planting, out of focus
  const fg = canvas2d(FR.w * S, 80 * S), gc = fg.getContext('2d');
  gc.setTransform(S, 0, 0, S, -X0 * S, -(PATH_B + 6) * S);
  gc.fillStyle = '#1d2b33'; gc.fillRect(X0, PATH_B + 10, FR.w, 80);
  for (let k = 0; k < 140; k++) {
    const bx = r.range(X0, X1), by = r.range(PATH_B + 8, 1000), br = r.range(6, 18);
    gc.fillStyle = r() < 0.2 ? `rgba(255,${150 + r.int(0, 60)},${140 + r.int(0, 40)},0.7)` : r() < 0.5 ? 'rgba(54,92,88,0.9)' : 'rgba(32,58,62,0.9)';
    circ(gc, bx, by, br); gc.fill();
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${(3 * S) | 0}px)`; c.drawImage(fg, 0, (PATH_B + 6 - FR.y0) * S); c.restore();
}

// ------------------------------------------------------------------ UI sprite painters (screen px)
const UIFONT = '"PingFang SC", "Hiragino Sans GB", sans-serif';
const shadowOn = (c, blur = 6, a = 0.35) => { c.shadowColor = `rgba(0,0,0,${a})`; c.shadowBlur = blur; c.shadowOffsetY = 1; };

function pelicanGlyph(c, cx, cy, sz, col = '#fff', eye = '#ff3b5c') {
  c.fillStyle = col;
  circ(c, cx - sz * 0.2, cy - sz * 0.2, sz * 0.2); c.fill();
  c.beginPath();
  c.moveTo(cx - sz * 0.22, cy - sz * 0.32);
  c.lineTo(cx + sz * 0.46, cy - sz * 0.08);
  c.quadraticCurveTo(cx + sz * 0.12, cy + sz * 0.42, cx - sz * 0.3, cy + sz * 0.22);
  c.quadraticCurveTo(cx - sz * 0.42, cy - sz * 0.05, cx - sz * 0.22, cy - sz * 0.32);
  c.closePath(); c.fill();
  c.fillStyle = eye; circ(c, cx - sz * 0.16, cy - sz * 0.24, sz * 0.055); c.fill();
}
function logoPaint(c, x, y, sz) {
  c.save();
  c.fillStyle = grad(c, x, y, x + sz, y + sz, [[0, '#ff3b5c'], [1, '#ffa25e']]);
  c.beginPath(); c.roundRect(x, y, sz, sz, sz * 0.28); c.fill();
  pelicanGlyph(c, x + sz * 0.5, y + sz * 0.52, sz * 0.78, '#fff', '#ff3b5c');
  c.restore();
}

// ------------------------------------------------------------------ the scene
export default {
  freezeU: 3.0,
  ride: RIDE,
  cues: [
    { u: 0.0, name: 'snapIn' }, { u: 2.0, name: 'freeze' }, { u: 2.5, name: 'wheelie' },
    { u: 3.0, name: 'likesBurst' }, { u: 3.5, name: 'tenK' }, { u: 4.0, name: 'rideOn' }, { u: 6.0, name: 'snapOut' },
  ],

  async init(K) {
    const r = rng(hash(ID, 'bake'));
    this.bg = bake2d(K, 'bg', BG.w * BG.s, BG.h * BG.s, (c) => paintBackground(c, BG.s, rng(hash(ID, 'bg'))));
    this.fr = bake2d(K, 'front', FR.w * FR.s, FR.h * FR.s, (c) => paintFront(c, FR.s, rng(hash(ID, 'front'))));
    // light sprites
    const S = (this.spr = {});
    S.glow = bake2d(K, 'glow', 256, 256, (c) => { c.fillStyle = rgrad(c, 128, 128, 0, 128, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, 256, 256); });
    S.ring = bake2d(K, 'ring', 256, 256, (c) => { c.fillStyle = rgrad(c, 128, 128, 0, 128, [[0, 'rgba(255,255,255,0.08)'], [0.72, 'rgba(255,255,255,0.12)'], [0.86, 'rgba(255,255,255,0.7)'], [0.93, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, 256, 256); });
    S.hex = bake2d(K, 'hex', 160, 160, (c) => {
      c.filter = 'blur(3px)';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      poly(c, Array.from({ length: 6 }, (_, k) => [80 + 66 * Math.cos(k * Math.PI / 3 + 0.3), 80 + 66 * Math.sin(k * Math.PI / 3 + 0.3)])); c.fill();
    });
    S.streak = bake2d(K, 'streak', 512, 32, (c) => {
      const g = c.createLinearGradient(0, 0, 512, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 512, 32);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = grad(c, 0, 0, 0, 32, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(0, 0, 512, 32);
    });
    S.glint = bake2d(K, 'glint', 64, 16, (c) => { c.translate(32, 8); c.scale(30, 6); c.fillStyle = rgrad(c, 0, 0, 0, 1, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); circ(c, 0, 0, 1); c.fill(); });
    // water glitter table
    this.glints = Array.from({ length: 70 }, () => {
      const y = HORIZON + 6 + Math.pow(r(), 1.3) * 130;
      const spread = 30 + (y - HORIZON) * 1.6;
      return { x: SUN[0] + r.gauss() * spread * 0.45, y, len: r.range(4, 16) * (0.5 + (y - HORIZON) / 140), f: r.range(2.5, 7), ph: r.range(0, 6.28) };
    });
    // gulls
    this.gulls = [[0.0, 250, 392, 13], [0.35, 380, 425, 10], [0.7, 150, 372, 9], [0.2, 780, 410, 11]].map(([ph, x, y, sz]) => ({ ph, x, y, sz }));
    this.initUI(K);
    // per-frame 2D canvases for the rider and its cast shadow
    this.rc = createGraphics(1400, 1400); this.rc.pixelDensity(1);
    this.sc = createGraphics(720, 130); this.sc.pixelDensity(1);
    this.mqc = createGraphics(320, 44); this.mqc.pixelDensity(1);
  },

  dispose() {
    try { this.rc?.remove(); this.sc?.remove(); this.mqc?.remove(); } catch {}
    this.rc = this.sc = this.mqc = null;
  },

  initUI(K) {
    const S = this.spr;
    S.scrimTop = bake2d(K, 'scrimTop', 8, 256, (c) => { c.fillStyle = grad(c, 0, 0, 0, 256, [[0, 'rgba(0,0,0,0.42)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(0, 0, 8, 256); });
    S.scrimBot = bake2d(K, 'scrimBot', 8, 256, (c) => { c.fillStyle = grad(c, 0, 0, 0, 256, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0.62)']]); c.fillRect(0, 0, 8, 256); });
    S.heart = bake2d(K, 'heart', 72, 72, (c) => { shadowOn(c); c.fillStyle = '#ffffff'; heartPath(c, 36, 37, 50); c.fill(); });
    S.heartRed = bake2d(K, 'heartRed', 72, 72, (c) => { shadowOn(c); c.fillStyle = grad(c, 0, 14, 0, 60, [[0, '#ff6a7f'], [1, '#ff2350']]); heartPath(c, 36, 37, 50); c.fill(); });
    S.fheart = bake2d(K, 'fheart', 64, 64, (c) => { c.fillStyle = '#ffffff'; heartPath(c, 32, 33, 50); c.fill(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(22, 20, 7, 4, -0.6, 0, 6.3); c.fill(); });
    S.bigHeart = bake2d(K, 'bigHeart', 200, 200, (c) => {
      c.shadowColor = 'rgba(120,0,30,0.35)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
      c.fillStyle = grad(c, 0, 40, 0, 170, [[0, '#ff7088'], [0.6, '#ff2e55'], [1, '#e0123f']]);
      heartPath(c, 100, 102, 150); c.fill();
      c.shadowColor = 'transparent';
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(66, 62, 20, 10, -0.6, 0, 6.3); c.fill();
    });
    S.comment = bake2d(K, 'comment', 72, 72, (c) => {
      shadowOn(c); c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(36, 33, 24, 21, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(18, 44); c.lineTo(13, 58); c.lineTo(30, 51); c.fill();
      c.shadowColor = 'transparent'; c.fillStyle = '#3a3a44';
      for (const dx of [-10, 0, 10]) { circ(c, 36 + dx, 33, 3.2); c.fill(); }
    });
    const bookmark = (c, col) => {
      shadowOn(c); c.fillStyle = col;
      c.beginPath(); c.moveTo(20, 12); c.lineTo(52, 12); c.quadraticCurveTo(55, 12, 55, 16); c.lineTo(55, 60); c.lineTo(36, 47); c.lineTo(17, 60); c.lineTo(17, 16); c.quadraticCurveTo(17, 12, 20, 12); c.fill();
    };
    S.bookmark = bake2d(K, 'bookmark', 72, 72, (c) => bookmark(c, '#ffffff'));
    S.bookmarkOn = bake2d(K, 'bookmarkOn', 72, 72, (c) => bookmark(c, '#ffc93c'));
    S.share = bake2d(K, 'share', 72, 72, (c) => {
      shadowOn(c); c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(40, 12); c.lineTo(62, 33); c.lineTo(40, 54); c.lineTo(40, 42);
      c.quadraticCurveTo(20, 41, 10, 58); c.quadraticCurveTo(12, 28, 40, 24); c.closePath(); c.fill();
    });
    S.search = bake2d(K, 'search', 56, 56, (c) => { shadowOn(c, 4); c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineCap = 'round'; circ(c, 24, 24, 13); c.stroke(); c.beginPath(); c.moveTo(34, 34); c.lineTo(44, 44); c.stroke(); });
    S.logo = bake2d(K, 'logo', 56, 56, (c) => { shadowOn(c, 5, 0.3); logoPaint(c, 6, 6, 44); });
    S.logoBig = bake2d(K, 'logoBig', 96, 96, (c) => logoPaint(c, 4, 4, 88));
    S.avatar = bake2d(K, 'avatar', 92, 92, (c) => {
      shadowOn(c, 6, 0.3);
      c.fillStyle = '#ffffff'; circ(c, 46, 44, 35); c.fill();
      c.shadowColor = 'transparent';
      c.fillStyle = grad(c, 0, 12, 0, 76, [[0, '#ffb46b'], [1, '#ff6f6f']]); circ(c, 46, 44, 32); c.fill();
      c.fillStyle = 'rgba(46,196,182,0.95)'; c.fillRect(14, 58, 64, 20);
      c.save(); circ(c, 46, 44, 32); c.clip();
      c.fillStyle = '#2e2d3a'; c.fillRect(10, 64, 72, 20);
      c.restore();
      pelicanGlyph(c, 47, 42, 44, '#ffffff', '#1d1520');
    });
    S.plus = bake2d(K, 'plus', 32, 32, (c) => { c.fillStyle = '#ff3b5c'; circ(c, 16, 16, 12); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, 16); c.lineTo(22, 16); c.moveTo(16, 10); c.lineTo(16, 22); c.stroke(); });
    S.check = bake2d(K, 'check', 32, 32, (c) => { c.fillStyle = '#ffffff'; circ(c, 16, 16, 12); c.fill(); c.strokeStyle = '#ff3b5c'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(10, 16); c.lineTo(14.5, 20.5); c.lineTo(22, 11.5); c.stroke(); });
    S.status = bake2d(K, 'status', 140, 32, (c) => {
      c.fillStyle = '#fff';
      for (let k = 0; k < 4; k++) c.fillRect(4 + k * 7, 22 - (k + 1) * 4.2, 4.5, (k + 1) * 4.2);
      c.font = `600 17px ${UIFONT}`; c.fillText('5G', 38, 22);
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(72, 7, 40, 18, 5); c.stroke();
      c.fillRect(114, 12.5, 3, 7);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(75, 10, 28, 12, 3); c.fill();
    });
    // sticker 「名场面」
    S.sticker = bake2d(K, 'sticker', 360, 170, (c) => {
      c.translate(180, 85);
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
      c.fillStyle = '#111014'; c.beginPath(); c.roundRect(-150, -58, 300, 116, 26); c.fill();
      c.shadowColor = 'transparent';
      c.fillStyle = grad(c, 0, -52, 0, 52, [[0, '#fff27a'], [1, '#ffd23c']]);
      c.beginPath(); c.roundRect(-144, -52, 288, 104, 21); c.fill();
      c.font = `800 74px "Yuanti SC", ${UIFONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 10; c.strokeStyle = '#ffffff'; c.strokeText('名场面', 0, 4);
      c.fillStyle = '#16141a'; c.fillText('名场面', 0, 4);
      c.fillStyle = '#ff3b5c';
      const star = (x, y, R) => { c.beginPath(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; const rr = k % 2 ? R * 0.35 : R; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } c.closePath(); c.fill(); };
      star(-150, -54, 18); star(152, 44, 13);
      c.fillStyle = '#ffffff'; star(132, -60, 10);
    });
    const pill = (txt, sub) => (c, w, h) => {
      c.fillStyle = 'rgba(16,14,22,0.55)'; c.beginPath(); c.roundRect(2, 2, w - 4, h - 4, (h - 4) / 2); c.fill();
      c.fillStyle = '#ffffff'; c.font = `700 30px ${UIFONT}`; c.textBaseline = 'middle'; c.fillText(txt, 20, h / 2 + 1);
      if (sub) { const tw = c.measureText(txt).width; c.font = `500 22px ${UIFONT}`; c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText(sub, 30 + tw, h / 2 + 2); }
    };
    S.slow = bake2d(K, 'slow', 190, 54, pill('0.5×', '慢动作'));
    S.normal = bake2d(K, 'normal', 86, 54, pill('1×'));
    S.note = bake2d(K, 'note', 36, 36, (c) => { shadowOn(c, 3); c.fillStyle = '#fff'; c.font = `600 26px "Apple Symbols", ${UIFONT}`; c.textBaseline = 'middle'; c.fillText('♪', 8, 19); });
    // comment bubbles
    const meas = canvas2d(4, 4).getContext('2d');
    this.pills = COMMENTS.map(([s, user, text], k) => {
      meas.font = `500 21px ${UIFONT}`; const uw = meas.measureText(user).width;
      meas.font = `500 23px ${UIFONT}`;
      const maxT = 400 - 66 - uw;
      // wrap long comments: the first part shares the row with the name, the rest goes below
      let lines = [text];
      if (meas.measureText(text).width > maxT) {
        let cut = text.length;
        while (cut > 1 && meas.measureText(text.slice(0, cut)).width > maxT) cut--;
        const br = Math.max(text.lastIndexOf(' ', cut), text.lastIndexOf('（', cut));
        if (br > cut * 0.5) cut = br;
        lines = [text.slice(0, cut).trimEnd(), text.slice(cut).trimStart()];
      }
      const twoLine = lines.length > 1;
      const w1 = 56 + uw + 10 + meas.measureText(lines[0]).width + 18;
      const w = Math.ceil(twoLine ? Math.max(w1, meas.measureText(lines[1]).width + 34) : w1), h = twoLine ? 80 : 46;
      const hue = (hash(ID, user) % 360);
      const sp = bake2d(K, 'pill' + k, w, h, (c) => {
        c.fillStyle = 'rgba(12,10,20,0.34)'; c.beginPath(); c.roundRect(0, 0, w, h, 23); c.fill();
        c.fillStyle = `hsl(${hue},70%,62%)`; circ(c, 23, 23, 15); c.fill();
        c.fillStyle = '#fff'; c.font = `600 17px ${UIFONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText([...user][0].toUpperCase(), 23, 24);
        c.textAlign = 'left';
        c.font = `500 21px ${UIFONT}`; c.fillStyle = 'rgba(255,226,160,0.95)'; c.fillText(user, 46, 24);
        c.font = `500 23px ${UIFONT}`; c.fillStyle = '#ffffff';
        c.fillText(lines[0], 56 + uw, 24);
        if (twoLine) c.fillText(lines[1], 18, 58);
      });
      return { ...sp, s, twoLine, lines };
    });
  },

  path(u, base) {
    const a = wheelie(u);
    if (!a) return base;
    const R0 = 102;                                   // pivot on the rear-wheel contact
    return { ...base, x: base.x - R0 + R0 * Math.cos(a), y: base.y + R0 * Math.sin(a), rot: a };
  },

  mods(v) {
    if (v <= 1.3 || v >= 4.6) return {};
    const m = {};
    const look = smootherstep(1.62, 1.95, v) * (1 - smootherstep(2.02, 2.3, v));
    if (look > 1e-4) m.lookBack = 0.8 * look;
    const open = smootherstep(2.05, 2.3, v) * (1 - smootherstep(3.6, 3.95, v));
    if (open > 1e-4) m.billOpen = 0.6 * open;
    if (v > 1.85 && v < 2.2) m.eye = 'wide';
    return m;
  },

  camera(u, cam) {
    const w = camW(u);
    if (w <= 0) return cam;
    const T = camTarget(u);
    return {
      cx: cam.cx + w * (T.x - followLocal(u)),
      cy: lerp(cam.cy, T.y, w),
      z: Math.exp(lerp(Math.log(cam.z), Math.log(T.z), w)),
    };
  },

  // ---------------------------------------------------------------- picture
  render(K, u, ctx) {
    const vertical = u >= 0 && u < 6;
    const vc = vclock(u);
    const w = camW(u);
    push();
    noStroke();
    imageMode(CORNER);
    image(this.bg.fb, BG.x0, BG.y0, BG.w, BG.h);
    this.drawGulls(vc, ctx);
    this.drawGlitter(vc, ctx);
    this.drawFront(u, w, ctx);
    const R = u > 2 && u < 4 ? ctx.riderAt(ctx.t + vtOf(u) - u) : ctx.rider;
    if (R.visible) this.drawRider(u, R, ctx);
    this.drawFlare(u, w, R, ctx);
    if (!vertical || ctx.freeze) this.drawBurnIn(K, ctx);
    pop();
  },

  drawGulls(vc, ctx) {
    if (ctx.view.y0 > 320) return;
    fill(58, 36, 72, 200);
    for (const g of this.gulls) {
      const x = g.x + vc * 14 + g.ph * 40, y = g.y + Math.sin(vc * 0.7 + g.ph * 3) * 6;
      const f = Math.sin(vc * 6 + g.ph * 9);
      const s = g.sz;
      beginShape();
      vertex(x - s, y - f * s * 0.5); vertex(x - s * 0.45, y - s * 0.12 - f * s * 0.2); vertex(x, y + s * 0.12);
      vertex(x + s * 0.45, y - s * 0.12 - f * s * 0.2); vertex(x + s, y - f * s * 0.5);
      vertex(x + s * 0.45, y + s * 0.05 - f * s * 0.15); vertex(x, y + s * 0.3); vertex(x - s * 0.45, y + s * 0.05 - f * s * 0.15);
      endShape(CLOSE);
    }
  },

  drawGlitter(vc, ctx) {
    const v = ctx.view;
    if (v.x1 < SUN[0] - 260 || v.x0 > SUN[0] + 260 || v.y1 < HORIZON) return;
    blendMode(ADD);
    const S = this.spr.glint;
    for (const g of this.glints) {
      const a = Math.pow(Math.max(0, Math.sin(vc * g.f + g.ph)), 3);
      if (a < 0.03) continue;
      tint(255, 214, 160, 255 * a * 0.9);
      image(S.fb, g.x - g.len / 2, g.y - 1.4, g.len, 2.8);
    }
    noTint();
    blendMode(BLEND);
  },

  drawFront(u, w, ctx) {
    const L = w > 0 ? (w * Math.abs(dD(u))) / 42 : 0;     // pan motion blur (units)
    const f = this.fr.fb;
    if (L * ctx.pxu < 1.2) { image(f, FR.x0, FR.y0, FR.w, FR.h); return; }
    const n = 4;
    for (let k = 0; k < n; k++) {
      if (k) tint(255, 255 / (k + 1));
      image(f, FR.x0 + L * (k / (n - 1) - 0.5), FR.y0, FR.w, FR.h);
    }
    noTint();
  },

  drawRider(u, R, ctx) {
    const P = R.placed;
    const px = P.place.x;
    const acc = accessories(u);
    const B = P.bird;
    // light direction (toward the sun) and its strength
    const bc = B.bodyC;
    let Lx = SUN[0] - bc[0], Ly = SUN[1] - bc[1] - 60;
    const Ld = Math.hypot(Lx, Ly) || 1; Lx /= Ld; Ly /= Ld;
    const rimK = clamp(1 - Math.abs(SUN[0] - bc[0]) / 650);
    const speed = u > 0 && u < 6 ? Math.abs(dD(u)) : SPEED;
    const spin = clamp(speed / SPEED, 0, 1.5);

    // cast shadow: the low sun is behind the rider, so it falls toward the viewer
    {
      const kx = -clamp((SUN[0] - px) / 700, -1, 1) * 0.55, ky = 0.3;
      const ss = 0.8, sx0 = px - 440;
      const g = this.sc, c = g.drawingContext;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, g.width, g.height);
      c.setTransform(ss, 0, 0, ss, -sx0 * ss, -792 * ss);
      c.transform(1, 0, -kx, -ky, 800 * kx, 800 * (1 + ky));
      c.fillStyle = c.strokeStyle = '#1a0f2e';
      c.lineCap = 'round';
      paintSilhouette(c, P);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = grad(c, 0, 0, 0, g.height, [[0, 'rgba(0,0,0,1)'], [0.25, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0.15)']]);
      c.fillRect(0, 0, g.width, g.height);
      c.globalCompositeOperation = 'source-over';
      tint(255, 128);
      image(g, sx0, 792, g.width / ss, g.height / ss, 0, 0, g.width, g.height);
      noTint();
    }

    // the rider itself
    const top = acc && (acc.helmet?.dy < -1 || acc.glasses?.dy < -1) ? 170 : 380;
    const bx0 = px - 230, by0 = top, bw = 485, bh = 818 - top;
    let s = clamp(ctx.pxu * 1.05, 0.5, 2.5);
    s = Math.min(s, this.rc.width / bw, this.rc.height / bh);
    const g = this.rc, c = g.drawingContext;
    const pw = Math.ceil(bw * s), ph = Math.ceil(bh * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(s, 0, 0, s, -bx0 * s, -by0 * s);
    paintRider(c, P, { L: [Lx, Ly], rimK, spin, s, acc });
    c.setTransform(1, 0, 0, 1, 0, 0);
    image(g, bx0, by0, pw / s, ph / s, 0, 0, pw, ph);
  },

  drawFlare(u, w, R, ctx) {
    const v = ctx.view;
    const S = this.spr;
    // how much of the sun the lens sees (inside the view, not hidden behind the bird)
    const m = 140;
    const inside = clamp(Math.min(SUN[0] - v.x0 + m, v.x1 - SUN[0] + m, SUN[1] - v.y0 + m, v.y1 - SUN[1] + m) / m);
    if (inside <= 0) return;
    let occ = 0;
    if (R.visible) {
      const B = R.placed.bird;
      const dB = Math.hypot((SUN[0] - B.bodyC[0]) / 66, (SUN[1] - B.bodyC[1]) / 42);
      const dH = Math.hypot(SUN[0] - B.head.c[0], SUN[1] - B.head.c[1]) / (B.head.r + 22);
      occ = Math.max(1 - smoothstep(0.75, 1.25, dB), 1 - smoothstep(0.8, 1.3, dH));
    }
    const I = inside * (1 - 0.65 * occ);
    const pxu = ctx.pxu;
    const lc = [lerp(500, (v.x0 + v.x1) / 2, w), lerp(500, (v.y0 + v.y1) / 2, w)];
    blendMode(ADD);
    // veiling glow over everything (wraps the rider's silhouette)
    const gsz = 560 / Math.sqrt(pxu);
    tint(255, 190, 120, 255 * 0.32 * inside);
    image(S.glow.fb, SUN[0] - gsz / 2, SUN[1] - gsz / 2, gsz, gsz);
    const core = 120 / pxu;
    tint(255, 245, 220, 255 * 0.5 * I);
    image(S.glow.fb, SUN[0] - core / 2, SUN[1] - core / 2, core, core);
    // anamorphic streak
    const sw = 1300 / pxu, sh = 22 / pxu;
    tint(255, 170, 120, 255 * 0.35 * I);
    image(S.streak.fb, SUN[0] - sw / 2, SUN[1] - sh / 2, sw, sh);
    // ghosts along sun → lens centre
    const ghosts = [
      [0.42, 70, 'hex', [255, 160, 90], 0.16], [0.68, 24, 'glow', [255, 230, 170], 0.32], [0.9, 120, 'ring', [120, 255, 205], 0.13],
      [1.28, 54, 'hex', [170, 130, 255], 0.15], [1.62, 170, 'ring', [255, 110, 140], 0.1], [2.05, 36, 'glow', [255, 200, 120], 0.25],
    ];
    for (const [k, px, spr, col, a] of ghosts) {
      const gx = SUN[0] + (lc[0] - SUN[0]) * k, gy = SUN[1] + (lc[1] - SUN[1]) * k;
      const sz = px / pxu;
      tint(col[0], col[1], col[2], 255 * a * I);
      image(S[spr].fb, gx - sz / 2, gy - sz / 2, sz, sz);
    }
    noTint();
    blendMode(BLEND);
  },

  drawBurnIn(K, ctx) {
    if (ctx.view.x0 < 520 && ctx.view.y1 > 820) {
      const sh = { color: 'rgba(0,0,0,0.55)', blur: 5, y: 2 };
      K.text({ text: '@鹈鹕骑士', font: UIFONT, weight: 600, size: 34, color: '#ffffff', shadow: sh }, 40, 864, 1);
      K.text({ text: '#竖屏短视频 #2020年代 #鹈鹕测试', font: UIFONT, weight: 500, size: 30, color: '#ffffff', shadow: sh }, 40, 904, 1);
      K.text({ text: 'Vertical Short Video · 2020s', font: UIFONT, weight: 400, size: 25, color: 'rgba(255,255,255,0.86)', shadow: sh }, 40, 946, 1);
    }
    if (ctx.view.x1 > 640 && ctx.view.y0 < 150) {
      // repost watermark of the app, top-right
      tint(255, 220);
      image(this.spr.logoBig.fb, 760, 36, 48, 48);
      noTint();
      const sh = { color: 'rgba(0,0,0,0.45)', blur: 4, y: 1 };
      K.text({ text: '鹕视 PeliCam', font: UIFONT, weight: 600, size: 26, color: 'rgba(255,255,255,0.88)', shadow: sh }, 816, 34, 1);
      K.text({ text: '@鹈鹕骑士', font: UIFONT, weight: 500, size: 20, color: 'rgba(255,255,255,0.75)', shadow: sh }, 816, 66, 1);
    }
  },

  // ---------------------------------------------------------------- the 9:16 app (screen space)
  overlay(K, u, info) {
    if (!(u >= 0 && u < 6)) return;
    const S = this.spr;
    const cam = info.cam;
    const PL = info.rider.st.wx - info.rider.st.x;
    const toScreen = (lx, ly) => [(PL + lx - cam.cx) * cam.pxu + VIEW_W / 2, (ly - cam.cy) * cam.pxu + VIEW_H / 2];
    push();
    noStroke();
    imageMode(CORNER);
    // letterbox
    fill(0);
    rect(0, 0, C0, SH);
    rect(C1, 0, VIEW_W - C1, SH);
    // legibility scrims
    image(S.scrimTop.fb, C0, 0, CW, 230);
    image(S.scrimBot.fb, C0, SH - 430, CW, 430);
    // cut flash (u = 0) and freeze flash (u = 2)
    let fl = 0.3 * (1 - smoothstep(0, 0.1, u));
    if (u >= 2 && u < 2.3) fl = Math.max(fl, 0.92 * Math.pow(1 - (u - 2) / 0.3, 2));
    if (fl > 0.003) { fill(255, 255, 255, 255 * fl); rect(C0, 0, CW, SH); }

    // ---- edit effects on the video
    const pel = toScreen(D(u) + 20, 615);
    for (const [t0, dx, dy, rot] of TAPS) {
      const age = u - t0;
      if (age < 0 || age > 0.75) continue;
      const k = easeOutBack(clamp(age / 0.16), 2.4);
      const a = 1 - smoothstep(0.4, 0.75, age);
      const sz = 150 * (0.55 + 0.45 * k) * (1 + 0.15 * smoothstep(0.4, 0.75, age));
      push();
      translate(pel[0] + dx, pel[1] + dy - 90 * easeInOut(clamp((age - 0.3) / 0.45)));
      rotate(rot);
      tint(255, 255 * a);
      image(S.bigHeart.fb, -sz / 2, -sz / 2, sz, sz);
      pop();
    }
    noTint();
    // 「名场面」 sticker: pops on the freeze, parks top-left for the gag, pops out on 4.0
    if (u >= 2.0 && u < 4.15) {
      const pop0 = easeOutBack(clamp((u - 2.0) / 0.2), 2.2);
      const park = easeInOut(clamp((u - 2.5) / 0.25));
      const out = clamp((u - 4.0) / 0.15);
      const sc = lerp(1.05, 0.56, park) * pop0 * (1 + 0.25 * Math.sin(Math.PI * out) - easeIn(out));
      const x = lerp(C0 + CW / 2, C0 + 118, park), y = lerp(330, 196, park);
      const rot = -0.12 + 0.05 * Math.sin(u * 9) * (1 - park) - 0.04 * park;
      if (sc > 0.01) {
        push(); translate(x, y); rotate(rot); scale(sc);
        image(S.sticker.fb, -S.sticker.w / 2, -S.sticker.h / 2, S.sticker.w, S.sticker.h);
        pop();
      }
    }
    // speed tag
    if (u >= 2.5 && u < 4.5) {
      const slow = u < 4.0;
      const sp = slow ? S.slow : S.normal;
      const k = slow ? easeOutBack(clamp((u - 2.5) / 0.18), 2) : easeOutBack(clamp((u - 4.0) / 0.15), 2);
      const a = slow ? 1 : 1 - smoothstep(4.3, 4.5, u);
      push(); translate(C1 - 40 - sp.w / 2, 168); scale(k); tint(255, 255 * a);
      image(sp.fb, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      pop(); noTint();
    }

    // ---- app chrome
    const sh = { color: 'rgba(0,0,0,0.45)', blur: 4, y: 1 };
    const T = (o, x, y, a = 1) => K.text({ font: UIFONT, color: '#ffffff', shadow: sh, ...o }, x, y, 1, a);
    // status bar
    T({ text: '19:19', size: 22, weight: 600 }, C0 + 30, 12);
    image(S.status.fb, C1 - 152, 12, S.status.w, S.status.h);
    // top bar: logo · tabs · search
    image(S.logo.fb, C0 + 14, 58, S.logo.w, S.logo.h);
    T({ text: '鹕视', size: 24, weight: 600 }, C0 + 70, 70);
    T({ text: '关注', size: 27, weight: 500, color: 'rgba(255,255,255,0.68)', align: 'center' }, C0 + CW / 2 - 46, 70);
    T({ text: '|', size: 22, weight: 300, color: 'rgba(255,255,255,0.4)', align: 'center' }, C0 + CW / 2, 73);
    T({ text: '推荐', size: 29, weight: 600, align: 'center' }, C0 + CW / 2 + 46, 68);
    fill(255); rect(C0 + CW / 2 + 32, 112, 28, 4, 2);
    image(S.search.fb, C1 - 64, 58, S.search.w, S.search.h);
    // ---- floating hearts from the heart button
    for (const h of HEARTS) {
      const age = u - h.s;
      if (age < 0 || age > h.life) continue;
      const t = age / h.life;
      const x = RAILX - 10 - h.drift * easeOut(t) + h.wob * Math.sin(age * 5 + h.ph) * t;
      const y = 612 - h.rise * (0.15 * t + 0.85 * easeOut(t)) * (1 + 0.1 * Math.sin(h.ph));
      const sc = h.size * easeOutBack(clamp(age / 0.16), 2) * (1 - 0.3 * t);
      const a = (1 - smoothstep(0.55, 1, t)) * 0.95;
      const col = HEART_COLS[h.col];
      push(); translate(x, y); rotate(h.rot * t); scale(sc);
      tint(col[0], col[1], col[2], 255 * a);
      image(S.fheart.fb, -32, -32, 64, 64);
      pop();
    }
    noTint();

    // action rail
    const ax = RAILX;
    image(S.avatar.fb, ax - 46, 470, 92, 92);
    const followed = u >= 4.6;
    const bk = followed ? 1 + 0.25 * (1 - easeOut(clamp((u - 4.6) / 0.2))) : 1;
    push(); translate(ax, 556); scale(bk); image((followed ? S.check : S.plus).fb, -16, -16, 32, 32); pop();
    const liked = u >= 2.5;
    const hk = liked ? 1 + 0.35 * (1 - easeOut(clamp((u - 2.5) / 0.28))) : 1;
    push(); translate(ax, 626); scale(hk); image((liked ? S.heartRed : S.heart).fb, -36, -36, 72, 72); pop();
    const L = likes(u);
    const tenK = u >= 3.5 ? 1 + 0.4 * (1 - easeOut(clamp((u - 3.5) / 0.3))) : 1;
    push(); translate(ax, 662); scale(tenK);
    T({ text: L.text, size: L.race ? 21 : 22, weight: 600, align: 'center', color: L.big ? '#ffe08a' : '#ffffff' }, 0, 0);
    pop();
    image(S.comment.fb, ax - 36, 700, 72, 72);
    T({ text: commentsCount(u), size: 22, weight: 600, align: 'center' }, ax, 770);
    const saved = u >= 3.5;
    image((saved ? S.bookmarkOn : S.bookmark).fb, ax - 36, 808, 72, 72);
    T({ text: savesCount(u), size: 22, weight: 600, align: 'center' }, ax, 878);
    image(S.share.fb, ax - 36, 914, 72, 72);
    T({ text: '分享', size: 22, weight: 600, align: 'center' }, ax, 982);
    // caption (the panel's title)
    const cx = C0 + 24;
    T({ text: '@鹈鹕骑士', size: 28, weight: 600 }, cx, 878);
    T({ text: '#竖屏短视频 #2020年代 #鹈鹕测试', size: 26, weight: 500 }, cx, 920);
    T({ text: 'Vertical Short Video · 2020s', size: 23, weight: 400, color: 'rgba(255,255,255,0.86)' }, cx, 960);
    // music marquee
    image(S.note.fb, cx - 6, 1003, 36, 36);
    const mq = K.textSprite({ text: '原创 · 鹈鹕骑行 BGM  ·  @鹈鹕骑士  ·  原创 · 鹈鹕骑行 BGM  ·  @鹈鹕骑士  ·  ', font: UIFONT, size: 22, weight: 500, color: '#ffffff', shadow: sh });
    const half = (mq.w - 2 * mq.pad) / 2;
    const off = (u * 70) % half;
    {
      const g = this.mqc, c = g.drawingContext;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, g.width, g.height);
      c.drawImage(mq.g.drawingContext.canvas, -(mq.pad + off), 0);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = grad(c, 0, 0, g.width, 0, [[0, 'rgba(0,0,0,0)'], [0.08, 'rgba(0,0,0,1)'], [0.88, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(0, 0, g.width, g.height);
      c.globalCompositeOperation = 'source-over';
      image(g, cx + 28, 1000, g.width, g.height);
    }
    // progress bar along the very bottom: full on the last frame before the cut (u = 6 − 1/30)
    const p = clamp(u / (6 - 1 / 30));
    fill(255, 255, 255, 70); rect(C0, SH - 6, CW, 4);
    fill(255, 255, 255, 235); rect(C0, SH - 6, CW * p, 4);
    fill(255); circle(C0 + CW * p, SH - 4, 10);

    // ---- comment feed drifting up the left side
    const BASE = 858, ROW = 52;
    for (let k = 0; k < this.pills.length; k++) {
      const pc = this.pills[k];
      const age = u - pc.s;
      if (age < 0) continue;
      let push_ = 0;
      for (let j = k + 1; j < this.pills.length; j++) {
        const aj = u - this.pills[j].s;
        if (aj < 0) break;
        push_ += easeOut(clamp(aj / 0.2)) * (this.pills[j].twoLine ? 1.6 : 1);
      }
      const a = smoothstep(0, 0.16, age) * (1 - smoothstep(2.2, 3.2, push_)) * (1 - smoothstep(2.6, 3.4, age));
      if (a < 0.01) continue;
      const y = BASE - pc.h - push_ * ROW - 8 * (1 - easeOut(clamp(age / 0.2)));
      const x = C0 + 16 - 24 * (1 - easeOut(clamp(age / 0.2)));
      tint(255, 255 * a);
      image(pc.fb, Math.round(x), Math.round(y), pc.w, pc.h);
    }
    noTint();
    pop();
  },
};
