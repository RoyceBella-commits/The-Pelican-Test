// 10 · 爪哇皮影戏 / Wayang Kulit · c. 1800
//
// Seen from the dalang's side of the kelir: painted and gilded leather puppets pressed against a warm cotton
// screen, lit by a hanging bronze blencong lamp; their shadows fall on the cloth just behind them. A tall
// gunungan (kayon) stands at the left, a refined knight (alus) and a raksasa ogre face off at the right, and the
// banana trunk (gedebog) that the puppets are stuck into is the road. A perforated leather title tab hangs from
// the red border at the top left.
//
// Technique (0 live p5.brush marks; everything is Canvas2D):
//   • `Hide` is a small leather workshop: flat sungging colour bands, black and gold contour lines, then the tatah
//     perforation (dots, slits, crescents, diamonds, cut-out letters) punched with destination-out. Punched holes
//     are back-filled with lamp light (only inside the uncut silhouette); big lace openings stay transparent, so
//     the lit screen and the offset lace shadow show through them;
//   • every piece also yields a blurred shadow sprite, drawn scaled about the flame (k ≈ 0.04 when the puppet is
//     pressed to the screen, up to 0.4 when the gunungan is lifted toward the lamp);
//   • puppets are rigs of sprites: body on its central horn rod (gapit), arms on shoulder/elbow joints with thin
//     rods (tuding) to the hands; a puppet turns by flipping through its edge;
//   • the pelican is re-cut every frame into a 2D canvas: outside (1, 5) a painted white pelican in the wayang
//     palette; inside it a gilded, perforated leather puppet on rods, posed at 8 fps through ctx.riderAt().
import { rng, hash, lerp, clamp, smoothstep, smootherstep, smoothPath, smoothLoop, ribbon, easeOut, easeIn, easeOutBack } from '../kit/math.js';

const ID = 'wayang';
const S = 2;                          // px per unit of every puppet bake
const SB = 2.048;                     // px per unit of the screen / trunk bakes
const RIDE = { hold: [2.2, 3.7], speed: 0.4, ramp: 0.3 };
const TAU = Math.PI * 2;
const FB = [592, 150];                // the blencong's wick (flame base)
const LAMP = [592, 136];              // the flame = the light source (panel units)
const HOT = [575, 365];               // centre of the lit patch on the kelir
const GUN0 = [340, 790];              // gunungan base, planted
const KNIGHT0 = [690, 793], OGRE0 = [902, 793];
const PLAQ = [160, 66];               // where the title tab hangs
const PAL = {
  gold: '#c99a3a', goldL: '#ebcb72', goldD: '#8e6622', goldDD: '#5a3e13',
  red: '#a8322a', redL: '#d4643f', redD: '#6a1c15', pink: '#eba486', orange: '#de8a34',
  black: '#1a1410', white: '#efe6d4', cream: '#f7eed6',
  blue: '#21495f', blueM: '#3c7391', blueL: '#9cc4cf', green: '#2b5634', greenM: '#4f8650', greenL: '#acc98d',
  horn: '#3f2a1a', hornL: '#9c7650',
};
const HOLE = 'rgb(255,234,178)';
const SHADOW = 'rgb(48,29,16)';

// ------------------------------------------------------------------ small numeric helpers
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const seg = (u, a, b) => clamp((u - a) / (b - a));
const win = (a, b, x, r) => smoothstep(a, a + r, x) * (1 - smoothstep(b - r, b, x));
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const c2d = (c) => c.getContext('2d');
function toImage(cv) {
  const img = createImage(cv.width, cv.height);
  img.drawingContext.drawImage(cv, 0, 0);
  img.setModified(true);
  return img;
}
const mirror = (P) => P.map(([a, b]) => [-a, b]);
const tr = (P, dx, dy, sx = 1, sy = sx) => P.map(([a, b]) => [dx + a * sx, dy + b * sy]);
const rotAbout = (p, c, a) => { const dx = p[0] - c[0], dy = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs]; };
const mid = (p, q, t = 0.5) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function bboxOf(P) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return { x0, y0, x1, y1 }; }
function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function pathCR(x, P, closed = true) {
  const n = P.length;
  x.moveTo(P[0][0], P[0][1]);
  const L = closed ? n : n - 1;
  for (let i = 0; i < L; i++) {
    const p0 = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)];
    const p1 = P[i], p2 = P[(i + 1) % n];
    const p3 = closed ? P[(i + 2) % n] : P[Math.min(n - 1, i + 2)];
    x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) x.closePath();
}
function polyPath(x, P, closed = true) { x.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length; k++) x.lineTo(P[k][0], P[k][1]); if (closed) x.closePath(); }
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    let d = step - carry;
    while (d <= L) { const t = d / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    carry = L - (d - step);
  }
  return out;
}
/** Tapered limb polygon along a smooth spine (w0 → w1). */
function limb(pts, w0, w1, per = 6) { return ribbon(pts.length > 2 ? smoothPath(pts, per) : pts, (t) => lerp(w0, w1, t)); }
/** A stem ending in a spiral curl (scroll ornament). */
function curlPath(P, curlR, side, turn = Math.PI * 1.6) {
  const E = P[P.length - 1], Q = P[P.length - 2];
  let dx = E[0] - Q[0], dy = E[1] - Q[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const cx = E[0] + side * -dy * curlR, cy = E[1] + side * dx * curlR;
  const a0 = Math.atan2(E[1] - cy, E[0] - cx);
  const out = smoothPath(P, 5);
  for (let k = 1; k <= 14; k++) { const t = (k / 14) * turn; const R = curlR * (1 - 0.6 * (t / turn)); out.push([cx + Math.cos(a0 + side * t) * R, cy + Math.sin(a0 + side * t) * R]); }
  return out;
}
/** Pointed leaf (almond) from `base` toward angle `ang`. */
function leafPts(base, ang, L, W) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (a, b) => [base[0] + a * c - b * s, base[1] + a * s + b * c];
  return [P(0, 0), P(L * 0.28, W * 0.5), P(L * 0.68, W * 0.38), P(L, 0), P(L * 0.68, -W * 0.38), P(L * 0.28, -W * 0.5)];
}

// ------------------------------------------------------------------ the leather workshop
class Hide {
  constructor(b, s = S) {
    this.b = b; this.s = s;
    this.cv = mk((b[2] - b[0]) * s, (b[3] - b[1]) * s);
    this.w = this.cv.width / s; this.h = this.cv.height / s;
    this.x = c2d(this.cv);
    this.groups = [{ clip: null, path: new Path2D() }];
    this.cuts = []; this.texts = [];
    this.atop = false;
    this.reset();
  }
  get g() { return this.groups[this.groups.length - 1]; }
  T(x) { x.setTransform(this.s, 0, 0, this.s, -this.b[0] * this.s, -this.b[1] * this.s); }
  reset() { const x = this.x; this.T(x); x.lineJoin = 'round'; x.lineCap = 'round'; x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = this.atop ? 'source-atop' : 'source-over'; }
  path(P, smooth = true, closed = true) {
    if (P instanceof Path2D) return P;
    const p = new Path2D();
    if (smooth && P.length > 2) pathCR(p, P, closed); else polyPath(p, P, closed);
    return p;
  }
  fill(P, col, smooth = true) { this.x.fillStyle = col; this.x.fill(this.path(P, smooth)); return this; }
  stroke(P, w, col, o = {}) {
    const x = this.x;
    x.lineWidth = w; x.strokeStyle = col; x.lineCap = o.cap || 'round';
    x.stroke(this.path(P, o.smooth ?? true, o.closed ?? false));
    x.lineCap = 'round';
    return this;
  }
  edge(P, w = 1.3, col = PAL.black, smooth = true) { return this.line(P, w, col, smooth); }
  /** Contour line hugging the inside of the shape (w = visible width). */
  line(P, w = 1.3, col = PAL.black, smooth = true) {
    const x = this.x, p = this.path(P, smooth);
    x.save(); x.clip(p); x.lineWidth = w * 2; x.strokeStyle = col; x.stroke(p); x.restore();
    return this;
  }
  /** sungging: stepped colour bands from the edge (cols[0]) to the centre (last). */
  bands(P, cols, step, smooth = true) {
    const x = this.x, p = this.path(P, smooth);
    x.save(); x.clip(p);
    x.fillStyle = cols[cols.length - 1]; x.fill(p);
    for (let k = cols.length - 2; k >= 0; k--) { x.lineWidth = 2 * step * (k + 1); x.strokeStyle = cols[k]; x.stroke(p); }
    x.restore();
    return this;
  }
  clip(P, fn, smooth = true) { const x = this.x; x.save(); x.clip(this.path(P, smooth)); fn(this); x.restore(); return this; }
  holesIn(P, fn, smooth = true) { this.groups.push({ clip: this.path(P, smooth), path: new Path2D() }); fn(this); this.groups.push({ clip: null, path: new Path2D() }); return this; }
  dot(cx, cy, r) { if (this.noHoles) return this; const h = this.g.path; h.moveTo(cx + r, cy); h.arc(cx, cy, r, 0, TAU); return this; }
  oval(cx, cy, rx, ry, a = 0) { if (this.noHoles) return this; const h = this.g.path; h.moveTo(cx + rx * Math.cos(a), cy + rx * Math.sin(a)); h.ellipse(cx, cy, rx, ry, a, 0, TAU); return this; }
  slit(p, q, w) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); return this.oval((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2 + w / 2, w / 2, Math.atan2(q[1] - p[1], q[0] - p[0])); }
  crescent(cx, cy, r, a, th = 0.45) {
    if (this.noHoles) return this;
    const h = this.g.path, a0 = a - 1.3, a1 = a + 1.3;
    h.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    h.arc(cx, cy, r, a0, a1);
    const d = r * th, ccx = cx + Math.cos(a) * d, ccy = cy + Math.sin(a) * d;
    h.arc(ccx, ccy, r * 0.82, a1 - 0.15, a0 + 0.15, true);
    h.closePath();
    return this;
  }
  diamond(cx, cy, r, a = 0) {
    if (this.noHoles) return this;
    const h = this.g.path;
    for (let k = 0; k < 4; k++) { const ang = a + (k * Math.PI) / 2, rr = k % 2 ? r * 0.6 : r; const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr; if (k) h.lineTo(px, py); else h.moveTo(px, py); }
    h.closePath();
    return this;
  }
  /** Walk a path at arc-length steps: fn(point, tangentAngle, k, t). */
  along(P, step, fn, o = {}) {
    let pts = P.length > 2 && o.smooth !== false ? (o.closed ? smoothLoop(P, 8) : smoothPath(P, 8)) : P.slice();
    if (o.closed) pts = pts.concat([pts[0]]);
    const R = resample(pts, step), n = R.length;
    for (let k = o.skip ?? 0; k < n - (o.skipEnd ?? 0); k++) {
      const a = R[Math.max(0, k - 1)], b = R[Math.min(n - 1, k + 1)];
      fn(R[k], Math.atan2(b[1] - a[1], b[0] - a[0]), k, k / Math.max(1, n - 1));
    }
    return this;
  }
  dots(P, step, r, o = {}) { return this.along(P, step, (p, a, k, t) => this.dot(p[0], p[1], typeof r === 'function' ? r(t, k) : r), o); }
  slits(P, step, len, w, o = {}) {
    return this.along(P, step, (p, a) => {
      const b = a + (o.angle ?? Math.PI / 2), c = Math.cos(b) * len / 2, s = Math.sin(b) * len / 2;
      this.slit([p[0] - c, p[1] - s], [p[0] + c, p[1] + s], w);
    }, o);
  }
  /** Holes on a grid inside polygon P (centre test with margin). */
  grid(P, sp, fn, o = {}) {
    const poly = P.length > 2 ? smoothLoop(P, 5) : P, bb = bboxOf(poly), m = o.margin ?? sp * 0.45, hex = o.hex ?? true;
    for (let j = 0; ; j++) {
      const cy = bb.y0 + sp * 0.5 + j * sp * (hex ? 0.866 : 1);
      if (cy > bb.y1) break;
      for (let i = -1; ; i++) {
        const cx = bb.x0 + sp * 0.5 + i * sp + (hex && j & 1 ? sp / 2 : 0);
        if (cx > bb.x1) break;
        if (o.all || inside([cx, cy], poly) && inside([cx + m, cy], poly) && inside([cx - m, cy], poly) && inside([cx, cy + m], poly) && inside([cx, cy - m], poly)) fn(cx, cy, i, j);
      }
    }
    return this;
  }
  open(P, smooth = true) { this.cuts.push(this.path(P, smooth)); return this; }
  textHole(t) { this.texts.push(t); return this; }
  /** Knock out a raster mask (same pixel size) now, and keep painting only on the leather that is left. */
  cutRaster(cv) {
    const x = this.x;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(cv, 0, 0); x.restore();
    this.atop = true; this.reset();
    return this;
  }
  drawHoles(x, col, glow = false) {
    x.fillStyle = col;
    for (const g of this.groups) {
      if (g.clip) { x.save(); x.clip(g.clip); x.fill(g.path); x.restore(); } else x.fill(g.path);
    }
    if (glow) {
      // the cut edge of the leather shows as a thin dark rim inside every hole
      x.lineWidth = 0.5; x.strokeStyle = 'rgba(96,58,22,0.55)';
      for (const g of this.groups) x.stroke(g.path);
      x.fillStyle = col;
    }
    for (const t of this.texts) {
      x.save();
      x.translate(t.x, t.y); x.scale(t.sx ?? 1, t.sy ?? 1);
      x.font = `${t.weight ?? 700} ${t.size}px ${t.font}`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      if (t.ls) x.letterSpacing = `${t.ls}px`;
      x.fillStyle = col; x.fillText(t.text, 0, 0);
      if (t.bold) { x.lineWidth = t.bold; x.strokeStyle = col; x.lineJoin = 'round'; x.strokeText(t.text, 0, 0); }
      if (glow && t.rim) { x.lineWidth = t.rim; x.strokeStyle = 'rgba(92,50,18,0.9)'; x.lineJoin = 'round'; x.strokeText(t.text, 0, 0); }
      x.restore();
    }
  }
  /** Punch the holes and openings, keep a shadow source, back-fill the punched holes with lamp light. */
  finish() {
    const x = this.x, W = this.cv.width, H = this.cv.height;
    const sil = mk(W, H); c2d(sil).drawImage(this.cv, 0, 0);
    this.atop = false; this.reset();
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    for (const c of this.cuts) x.fill(c);
    this.drawHoles(x, '#000');
    this.shadowSrc = mk(W, H); c2d(this.shadowSrc).drawImage(this.cv, 0, 0);
    const G = mk(W, H), gx = c2d(G);
    this.T(gx); this.drawHoles(gx, HOLE, true);
    gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'destination-in'; gx.drawImage(sil, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-over'; x.drawImage(G, 0, 0);
    this.reset();
    return this;
  }
}

function spriteOf(H) { return { img: toImage(H.cv), x0: H.b[0], y0: H.b[1], w: H.w, h: H.h }; }
function shadowOf(H, res = 1, blurU = 1.6) {
  const pad = Math.ceil(blurU * 3 + 2);
  const cv = mk((H.w + 2 * pad) * res, (H.h + 2 * pad) * res), x = c2d(cv);
  x.filter = `blur(${(blurU * res).toFixed(2)}px)`;
  x.drawImage(H.shadowSrc, pad * res, pad * res, H.w * res, H.h * res);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-in'; x.fillStyle = SHADOW; x.fillRect(0, 0, cv.width, cv.height);
  return { img: toImage(cv), x0: H.b[0] - pad, y0: H.b[1] - pad, w: cv.width / res, h: cv.height / res, bytes: cv.width * cv.height * 4 };
}
const drawSp = (sp) => image(sp.img, sp.x0, sp.y0, sp.w, sp.h);
const signedArea = (P) => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]); return a; };
/** Offset a closed loop inward by d (any orientation). */
function insetLoop(P, d, smooth = true) {
  const L = smooth ? smoothLoop(P, 8) : P, n = L.length, s = signedArea(L) > 0 ? 1 : -1;
  return L.map((p, i) => {
    const a = L[(i - 1 + n) % n], b = L[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [p[0] - s * (ty / l) * d, p[1] + s * (tx / l) * d];
  });
}
function ellipseLoop(cx, cy, rx, ry, n = 16) { const o = []; for (let k = 0; k < n; k++) { const a = (k / n) * TAU; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
/** Small flame tongues standing on the edge of a closed loop (outward, leaning toward `lean` direction). */
function edgeTongues(P, step, len, o = {}) {
  const L = o.smooth === false ? P.concat([P[0]]) : (() => { const q = smoothLoop(P, 8); return q.concat([q[0]]); })();
  const s = signedArea(L) > 0 ? 1 : -1;
  const R = resample(L, step), out = [];
  for (let k = 0; k < R.length - 1; k++) {
    const a = R[k], b = R[k + 1];
    if (o.keep && !o.keep(a, b)) continue;
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    const nO = [s * (ty / l), -s * (tx / l)];
    const m = mid(a, b), lean = o.lean ? o.lean(m) : [0, 0];
    const tip = [m[0] + nO[0] * len + lean[0], m[1] + nO[1] * len + lean[1]];
    out.push({ P: [a, [m[0] + nO[0] * len * 0.35 + lean[0] * 0.2, m[1] + nO[1] * len * 0.35 + lean[1] * 0.2], tip, b], k });
  }
  return out;
}

// ------------------------------------------------------------------ the kelir (screen), its borders, the trunks
function weaveTile() {
  const N = 128, cv = mk(N, N), x = c2d(cv), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 4;
    const v = 1 - 0.045 * hash3(i, j, 5) - 0.05 * vnoise(i / 1.4, j / 9, 6) - 0.04 * vnoise(i / 9, j / 1.4, 7) - 0.03 * vnoise(i / 22, j / 22, 8);
    const c = Math.round(255 * v);
    img.data[k] = c; img.data[k + 1] = Math.round(c * 0.99); img.data[k + 2] = Math.round(c * 0.965); img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return cv;
}

function buildScreen() {
  const N = 2048, s = N / 1000, cv = mk(N, N), x = c2d(cv);
  x.setTransform(s, 0, 0, s, 0, 0);
  const g = x.createRadialGradient(HOT[0], HOT[1], 10, HOT[0], HOT[1], 900);
  [[0, '#fff2d4'], [0.15, '#f9e6bd'], [0.36, '#ead094'], [0.6, '#cfab70'], [0.82, '#a98652'], [1, '#86663f']].forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.fillRect(0, 0, 1000, 1000);
  // the stretched cloth: soft vertical folds and sags
  const R = rng(hash(ID, 'folds'));
  for (let k = 0; k < 34; k++) {
    const cx = R() * 1060 - 30, w = 12 + R() * 60, dark = R() < 0.55, a = 0.02 + R() * 0.045;
    const lg = x.createLinearGradient(cx - w, 0, cx + w, 0);
    const c = dark ? '80,50,20' : '255,248,228';
    lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(0.5, `rgba(${c},${a.toFixed(3)})`); lg.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = lg; x.fillRect(cx - w, 44, 2 * w, 730);
  }
  for (let k = 0; k < 14; k++) {
    const x0 = 30 + k * 72 + R() * 20;
    const lg = x.createLinearGradient(x0, 60, x0 + 18, 150);
    lg.addColorStop(0, 'rgba(90,60,30,0.07)'); lg.addColorStop(1, 'rgba(90,60,30,0)');
    x.strokeStyle = lg; x.lineWidth = 6;
    x.beginPath(); x.moveTo(x0, 58); x.quadraticCurveTo(x0 + 6, 100, x0 + 14, 150); x.stroke();
  }
  // soot from the lamp, age stains, a darned patch
  const soot = x.createRadialGradient(LAMP[0] - 10, 50, 4, LAMP[0] - 10, 60, 130);
  soot.addColorStop(0, 'rgba(50,32,18,0.34)'); soot.addColorStop(0.5, 'rgba(50,32,18,0.13)'); soot.addColorStop(1, 'rgba(50,32,18,0)');
  x.fillStyle = soot; x.fillRect(LAMP[0] - 150, 40, 300, 170);
  for (let k = 0; k < 9; k++) {
    const cx = R() * 1000, cy = 80 + R() * 640, r = 10 + R() * 34;
    const sg = x.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    sg.addColorStop(0, 'rgba(150,105,50,0.035)'); sg.addColorStop(0.85, 'rgba(140,95,45,0.07)'); sg.addColorStop(1, 'rgba(140,95,45,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  }
  x.strokeStyle = 'rgba(120,90,55,0.16)'; x.lineWidth = 0.5;
  for (let k = 0; k < 18; k++) { const yy = 612 + k * 1.6; x.beginPath(); x.moveTo(118, yy); x.lineTo(150, yy + 0.6); x.stroke(); }
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = x.createPattern(weaveTile(), 'repeat'); x.fillRect(0, 0, N, N);
  x.restore();
  topBand(x);
  bottomBand(x);
  return cv;
}

/** plangitan: the red border sewn along the top of the kelir, with a hanging fringe. */
function topBand(x) {
  const lg = x.createLinearGradient(0, 0, 0, 46);
  lg.addColorStop(0, '#3e0f0b'); lg.addColorStop(0.45, '#77211a'); lg.addColorStop(1, '#8c2a1e');
  x.fillStyle = lg; x.fillRect(0, 0, 1000, 46);
  const R = rng(hash(ID, 'band'));
  for (let i = 0; i < 70; i++) for (let j = 0; j < 2; j++) {
    const cx = 7 + i * 14.5 + (j ? 7.2 : 0), cy = 12 + j * 12;
    x.fillStyle = 'rgba(236,206,150,0.55)';
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; x.beginPath(); x.ellipse(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.4, 2.1, 1.1, a, 0, TAU); x.fill(); }
    x.fillStyle = 'rgba(30,10,6,0.6)'; x.beginPath(); x.arc(cx, cy, 0.9, 0, TAU); x.fill();
  }
  x.fillStyle = '#140d09'; x.fillRect(0, 33, 1000, 9);
  for (let i = 0; i < 125; i++) { x.fillStyle = 'rgba(201,154,58,0.85)'; x.fillRect(i * 8 + 2, 36.5, 4, 2); }
  x.fillStyle = PAL.gold; x.fillRect(0, 42, 1000, 2.4);
  const rg = x.createRadialGradient(LAMP[0], 44, 0, LAMP[0], 44, 420);
  rg.addColorStop(0, 'rgba(255,200,120,0.26)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = rg; x.fillRect(0, 0, 1000, 46);
  const sg = x.createLinearGradient(0, 44, 0, 84);
  sg.addColorStop(0, 'rgba(60,34,14,0.34)'); sg.addColorStop(1, 'rgba(60,34,14,0)');
  x.fillStyle = sg; x.fillRect(0, 44, 1000, 40);
  for (let k = 0; k < 72; k++) {
    const cx = k * 14 + 7 + (R() - 0.5) * 0.6, L = 13 + R() * 1.5;
    x.beginPath(); x.moveTo(cx - 6.6, 44); x.lineTo(cx + 6.6, 44); x.lineTo(cx + 0.4, 44 + L); x.closePath();
    x.fillStyle = k % 2 ? '#8c2a1e' : '#17100b'; x.fill();
    x.beginPath(); x.moveTo(cx - 3, 46); x.lineTo(cx + 3, 46); x.lineTo(cx + 0.2, 44 + L * 0.6); x.closePath();
    x.fillStyle = k % 2 ? 'rgba(225,180,90,0.9)' : 'rgba(170,40,30,0.9)'; x.fill();
  }
}

/** palemahan: the dark border at the foot of the screen, just above the trunk. */
function bottomBand(x) {
  const sg = x.createLinearGradient(0, 742, 0, 768);
  sg.addColorStop(0, 'rgba(60,34,14,0)'); sg.addColorStop(1, 'rgba(60,34,14,0.18)');
  x.fillStyle = sg; x.fillRect(0, 742, 1000, 26);
  const lg = x.createLinearGradient(0, 766, 0, 802);
  lg.addColorStop(0, '#2c1b12'); lg.addColorStop(1, '#100a07');
  x.fillStyle = lg; x.fillRect(0, 766, 1000, 36);
  x.fillStyle = '#7a2219'; x.fillRect(0, 766, 1000, 2.6);
  for (let i = 0; i < 100; i++) { x.fillStyle = 'rgba(201,154,58,0.5)'; x.beginPath(); x.arc(i * 10 + 5, 774, 1.1, 0, TAU); x.fill(); }
}

/** A banana trunk lying along the stage: pale, green-cream, fibrous, glossy on top. */
function trunkCyl(x, y0, y1, k, seed, rods) {
  const h = y1 - y0;
  const C = (r, g, b) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  const lg = x.createLinearGradient(0, y0, 0, y1);
  lg.addColorStop(0, C(222, 222, 176)); lg.addColorStop(0.1, C(206, 204, 146)); lg.addColorStop(0.34, C(172, 170, 108));
  lg.addColorStop(0.62, C(124, 118, 68)); lg.addColorStop(0.86, C(74, 68, 38)); lg.addColorStop(1, C(38, 34, 18));
  x.fillStyle = lg; x.fillRect(-10, y0, 1020, h);
  const R = rng(hash(ID, 'trunk', seed));
  // overlapping leaf sheaths: long wandering bands, each a different tone, with a dark seam
  for (let n = 0; n < 6; n++) {
    const yb = y0 + h * (0.06 + n * 0.15);
    const light = n % 2 === 0;
    const a = (light ? 0.06 : 0.07) + R() * 0.05;
    const top = [], bot = [];
    for (let xx = -40; xx <= 1040; xx += 26) {
      const off = (vnoise(xx / 210 + n * 7, seed, 41) - 0.5) * h * 0.22;
      top.push([xx, yb + off]);
      bot.push([xx, yb + off + h * (0.09 + 0.06 * vnoise(xx / 120, n + seed * 3, 42))]);
    }
    x.beginPath(); polyPath(x, top.concat(bot.slice().reverse()), true);
    x.fillStyle = light ? `rgba(250,248,205,${a.toFixed(3)})` : `rgba(64,58,20,${a.toFixed(3)})`; x.fill();
    x.beginPath(); polyPath(x, top, false); x.strokeStyle = `rgba(36,30,10,${((0.16 + R() * 0.1) * k).toFixed(3)})`; x.lineWidth = 0.7; x.stroke();
    x.beginPath(); polyPath(x, top.map(([a2, b2]) => [a2, b2 + 1.1]), false); x.strokeStyle = `rgba(255,252,225,${(0.1 * k).toFixed(3)})`; x.lineWidth = 0.6; x.stroke();
  }
  for (let n = 0; n < 1100; n++) {
    const yy = y0 + 1 + Math.pow(R(), 1.25) * (h - 2), xx = R() * 1100 - 60, L = 14 + R() * 90;
    const light = R() < 0.55;
    x.strokeStyle = light ? `rgba(255,252,225,${(0.03 + R() * 0.06).toFixed(3)})` : `rgba(48,40,14,${(0.03 + R() * 0.06).toFixed(3)})`;
    x.lineWidth = 0.3 + R() * 0.55;
    x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + L, yy + (R() - 0.5) * 1.1); x.stroke();
  }
  // dry brown patches and bruises
  for (let n = 0; n < 22; n++) {
    const cx = R() * 1000, cy = y0 + h * (0.12 + R() * 0.7), rx = 8 + R() * 46, ry = 1.6 + R() * 4;
    const bg = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
    bg.addColorStop(0, `rgba(104,64,24,${(0.1 + R() * 0.14).toFixed(3)})`); bg.addColorStop(1, 'rgba(104,64,24,0)');
    x.fillStyle = bg; x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy); x.beginPath(); x.arc(cx, cy, rx, 0, TAU); x.fill(); x.restore();
  }
  // wet gloss along the top of the cylinder
  const hl = x.createLinearGradient(0, y0, 0, y0 + h * 0.22);
  hl.addColorStop(0, 'rgba(255,255,236,0)'); hl.addColorStop(0.35, `rgba(255,255,236,${(0.24 * k).toFixed(3)})`); hl.addColorStop(1, 'rgba(255,255,236,0)');
  x.fillStyle = hl; x.fillRect(-10, y0, 1020, h * 0.22);
  for (const rx of rods) {
    x.fillStyle = 'rgba(30,20,8,0.75)'; x.beginPath(); x.ellipse(rx, y0 + 3.2, 3.6, 1.6, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(110,70,30,0.35)'; x.beginPath(); x.ellipse(rx, y0 + 5.5, 6, 2, 0, 0, TAU); x.fill();
  }
  x.fillStyle = `rgba(255,250,220,${0.35 * k})`; x.fillRect(-10, y0, 1020, 1.2);
}

function buildTrunk() {
  const W = 1000, Y0 = 795, H = 205;
  const cv = mk(W * SB, H * SB), x = c2d(cv);
  x.setTransform(SB, 0, 0, SB, 0, -Y0 * SB);
  x.fillStyle = '#1b120c'; x.fillRect(0, 940, 1000, 70);
  const R = rng(hash(ID, 'mat'));
  for (let k = 0; k < 140; k++) {
    const xx = k * 8 - 40;
    x.strokeStyle = `rgba(120,85,45,${(0.05 + R() * 0.05).toFixed(3)})`; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(xx, 946); x.lineTo(xx + 40, 1004); x.stroke();
  }
  trunkCyl(x, 880, 948, 0.55, 2, []);
  const sh = x.createLinearGradient(0, 870, 0, 888);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh; x.fillRect(0, 874, 1000, 14);
  trunkCyl(x, 800, 876, 1, 1, [GUN0[0], KNIGHT0[0] - 5, OGRE0[0] - 3, OGRE0[0] - 43, 120, 470, 610, 790]);
  const fd = x.createLinearGradient(0, 900, 0, 1000);
  fd.addColorStop(0, 'rgba(12,8,5,0)'); fd.addColorStop(1, 'rgba(12,8,5,0.55)');
  x.fillStyle = fd; x.fillRect(0, 900, 1000, 100);
  return cv;
}

function radialSprite(N, stops) {
  const cv = mk(N, N), x = c2d(cv), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return cv;
}
function vignette() {
  const N = 512, cv = mk(N, N), x = c2d(cv);
  const g = x.createRadialGradient(N * 0.56, N * 0.38, N * 0.14, N * 0.56, N * 0.44, N * 0.8);
  g.addColorStop(0, 'rgba(20,10,4,0)'); g.addColorStop(0.5, 'rgba(20,10,4,0.12)'); g.addColorStop(1, 'rgba(20,10,4,0.7)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return cv;
}
/** Horn-rod texture (across the rod: soft edges, dark sides, a warm highlight). */
function rodTexture() {
  const W = 4, H = 32, cv = mk(W, H), x = c2d(cv), img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H, r = Math.abs(v - 0.5) * 2, core = 0.6;
    const a = clamp((core - r) / 0.14 + 0.5);
    const t = Math.min(1, r / core);
    const hl = Math.exp(-(((v - 0.4) / 0.06) ** 2));
    const c = [70, 47, 29].map((q, i) => q * (1 - 0.5 * t * t) + [160, 120, 78][i] * hl * 0.85);
    for (let i = 0; i < W; i++) { const k = (j * W + i) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = Math.round(255 * a); }
  }
  x.putImageData(img, 0, 0);
  return cv;
}

// ------------------------------------------------------------------ the blencong (bronze garuda oil lamp)
function buildLamp() {
  const H = new Hide([-160, -142, 30, 26]);
  const bronze = ['#1e1208', '#45291a', '#6f4824', '#a7763a'];
  const ink = '#100804';
  const wingB = [[-70, -38], [-90, -60], [-108, -88], [-126, -126], [-112, -118], [-106, -128], [-94, -108], [-86, -116], [-76, -92], [-66, -98], [-60, -72], [-52, -46]];
  const wingF = [[-52, -40], [-50, -70], [-42, -100], [-30, -136], [-22, -122], [-12, -132], [-12, -104], [-2, -110], [-8, -80], [-18, -50]];
  const tail = [[-90, -20], [-118, -36], [-142, -32], [-154, -16], [-140, -6], [-152, 8], [-126, 6], [-100, -2]];
  const body = [[-102, -14], [-92, -32], [-68, -44], [-38, -44], [-16, -36], [-4, -22], [-6, -6], [-22, 6], [-58, 12], [-88, 6]];
  const neck = [[-26, -38], [-20, -58], [-12, -74], [0, -84], [12, -82], [10, -72], [2, -68], [-4, -54], [-8, -38]];
  const beak = [[10, -80], [24, -76], [30, -70], [20, -70], [10, -72]];
  const spout = [[-12, -18], [-2, -16], [8, -8], [9, -1], [0, 1], [-12, -4]];
  for (const P of [wingB, tail]) H.bands(P, bronze, 1.8).edge(P, 1.1, ink);
  H.bands(body, bronze, 2.6).edge(body, 1.2, ink);
  H.bands(wingF, bronze, 1.8).edge(wingF, 1.1, ink);
  H.bands(neck, bronze, 1.6).edge(neck, 1.1, ink);
  H.bands(beak, bronze.slice(1), 1.2).edge(beak, 0.9, ink);
  H.bands(spout, ['#3a2410', '#8a5e2c', '#e0ae5e'], 1.2).edge(spout, 1, ink);
  // engraving: feather lines on the wings and tail, scale rows on the body, crest, eye
  const eng = 'rgba(240,196,120,0.6)';
  for (const [P, n] of [[wingB, 5], [wingF, 4]]) {
    const root = mid(P[0], P[P.length - 1]);
    for (let k = 1; k <= n; k++) H.stroke([root, P[Math.min(P.length - 2, k * 2)]], 0.7, eng);
  }
  for (let k = 0; k < 5; k++) H.stroke([[-100, -10 + k * 2], [-146, -24 + k * 7.6]], 0.6, eng);
  H.clip(body, (h) => { for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { h.x.beginPath(); h.x.arc(-88 + k * 12 + (r % 2) * 6, -30 + r * 9, 5, 0.2, Math.PI - 0.2); h.x.lineWidth = 0.7; h.x.strokeStyle = eng; h.x.stroke(); } });
  for (let k = 0; k < 3; k++) H.stroke([[-6 - k * 5, -80 + k * 4], [-14 - k * 6, -92 + k * 3]], 1.6, '#6f4824');
  H.dot(4, -76, 1.5);
  H.stroke([[-52, -44], [-52, -54]], 2.4, '#2a1a0c');
  H.x.lineWidth = 1.8; H.x.strokeStyle = '#2a1a0c'; H.x.beginPath(); H.x.arc(-52, -58, 4.4, 0, TAU); H.x.stroke();
  H.clip(body, (h) => { const g = h.x.createRadialGradient(4, -6, 2, 4, -6, 64); g.addColorStop(0, 'rgba(255,196,96,0.6)'); g.addColorStop(1, 'rgba(255,196,96,0)'); h.x.fillStyle = g; h.x.fillRect(-110, -50, 130, 70); });
  H.clip(neck, (h) => { const g = h.x.createRadialGradient(4, -6, 2, 4, -6, 70); g.addColorStop(0, 'rgba(255,196,96,0.45)'); g.addColorStop(1, 'rgba(255,196,96,0)'); h.x.fillStyle = g; h.x.fillRect(-30, -90, 50, 60); });
  return H.finish();
}
function buildFlame() {
  const W = 64, Hh = 168, cv = mk(W, Hh), x = c2d(cv);
  const shape = (s) => { x.beginPath(); x.moveTo(32, 158); x.bezierCurveTo(32 - 20 * s, 150, 32 - 18 * s, 90, 32, 8 + (1 - s) * 60); x.bezierCurveTo(32 + 18 * s, 90, 32 + 20 * s, 150, 32, 158); x.closePath(); };
  x.filter = 'blur(4px)'; shape(1.25); x.fillStyle = 'rgba(255,120,30,0.55)'; x.fill(); x.filter = 'none';
  shape(1); const g = x.createLinearGradient(0, 160, 0, 10);
  g.addColorStop(0, 'rgba(255,170,60,1)'); g.addColorStop(0.5, 'rgba(255,200,90,1)'); g.addColorStop(1, 'rgba(255,120,40,0.2)');
  x.fillStyle = g; x.fill();
  shape(0.55); x.fillStyle = 'rgba(255,246,210,0.95)'; x.fill();
  x.beginPath(); x.ellipse(32, 150, 6, 8, 0, 0, TAU); x.fillStyle = 'rgba(120,150,255,0.5)'; x.fill();
  return cv;
}

// ------------------------------------------------------------------ the title tab
function buildPlaque() {
  const H = new Hide([-150, -36, 150, 208]);
  const outer = [[-124, 12], [-40, 12], [-18, -2], [0, -20], [18, -2], [40, 12], [124, 12], [134, 22], [134, 160], [124, 170], [36, 170], [14, 178], [0, 194], [-14, 178], [-36, 170], [-124, 170], [-134, 160], [-134, 22]];
  const frame = [[-124, 22], [124, 22], [124, 160], [-124, 160]];
  const field = [[-119, 27], [119, 27], [119, 155], [-119, 155]];
  // flame tongues around the tab, like the rim of a kayon
  const tongues = edgeTongues(outer, 10.5, 7, { smooth: false });
  tongues.forEach((t) => H.fill(t.P, PAL.gold));
  H.bands(outer, [PAL.goldD, PAL.gold, PAL.goldL], 2.2, false);
  tongues.forEach((t) => H.bands(t.P, t.k % 2 ? [PAL.redD, PAL.red] : [PAL.goldD, PAL.goldL], 1.1).edge(t.P, 0.7));
  H.edge(outer, 1.3, PAL.black, false);
  H.fill(frame, PAL.red, false).edge(frame, 0.8, PAL.black, false);
  H.fill(field, PAL.black, false);
  const crest = [[0, -18], [10, -4], [0, 8], [-10, -4]];
  H.bands(crest, [PAL.redD, PAL.red], 1.6, false).edge(crest, 0.8, PAL.black, false);
  H.dot(0, -6, 2.6);
  const drop = [[0, 192], [10, 178], [0, 172], [-10, 178]];
  H.fill(drop, PAL.red, false).edge(drop, 0.8, PAL.black, false);
  H.dot(0, 181, 2);
  H.dots([[-129, 17], [129, 17], [129, 165], [-129, 165]], 6.4, 1.45, { smooth: false, closed: true });
  H.along([[-121.5, 24.5], [121.5, 24.5], [121.5, 157.5], [-121.5, 157.5]], 8, (p) => H.diamond(p[0], p[1], 1.4, Math.PI / 4), { smooth: false, closed: true, skip: 1 });
  const x = H.x;
  x.strokeStyle = PAL.gold; x.lineWidth = 0.9;
  x.beginPath(); x.moveTo(-96, 86); x.lineTo(-14, 86); x.moveTo(14, 86); x.lineTo(96, 86); x.stroke();
  H.diamond(0, 86, 4.2, 0); H.dot(-102, 86, 1.6); H.dot(102, 86, 1.6);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) H.dot(sx * 110, 40 + k * 9, 1.4);
    for (let k = 0; k < 3; k++) H.dot(sx * 110, 120 + k * 9, 1.4);
  }
  x.font = 'italic 600 15px Baskerville, "Hoefler Text", Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = PAL.goldL;
  x.fillText('Wayang Kulit  ·  c. 1800', 0, 143);
  const font = '"Songti SC", "STSong", serif';
  H.textHole({ text: '爪哇皮影戏', x: 0, y: 57, size: 43, font, weight: 900, ls: 3, bold: 0.6, rim: 1.1 });
  H.textHole({ text: '约公元一八〇〇年', x: 0, y: 113, size: 26.5, font, weight: 900, ls: 1, bold: 0.4, rim: 0.8 });
  return H.finish();
}

// ------------------------------------------------------------------ the knight (alus) — authored facing right
// local frame: origin on the ground under the central rod; y up is negative; units = panel units
const KN = {
  tail: [[-32, -222], [-46, -188], [-56, -142], [-62, -94], [-70, -46], [-84, -12], [-98, -3], [-80, -14], [-62, -56], [-50, -108], [-40, -160], [-28, -206]],
  legB: [[-14, -150], [-18, -86], [-22, -16]],
  legF: [[12, -150], [15, -86], [18, -16]],
  footB: [[-38, -1], [-6, -1], [0, -5], [-4, -9], [-14, -12], [-20, -19], [-28, -18], [-35, -9]],
  footF: [[8, -1], [42, -1], [50, -5], [47, -9], [32, -12], [24, -19], [14, -18], [8, -9]],
  hip: [[-20, -276], [-36, -254], [-48, -216], [-48, -178], [-40, -152], [-14, -144], [14, -138], [38, -134], [42, -154], [36, -202], [27, -248], [20, -276]],
  drape: [[6, -214], [16, -170], [22, -120], [28, -70], [24, -58], [14, -60], [10, -112], [4, -168]],
  torso: [[-16, -266], [-20, -300], [-22, -336], [-32, -354], [-31, -370], [-16, -379], [-4, -384], [12, -384], [26, -377], [38, -368], [40, -352], [34, -334], [28, -302], [20, -268]],
  neck: [[-4, -380], [-2, -398], [2, -416], [16, -410], [14, -394], [12, -380]],
  face: [[2, -448], [14, -452], [24, -441], [38, -426], [53, -411], [47, -408], [45, -404], [41, -402], [42, -399], [39, -396], [34, -394], [26, -398], [16, -406], [8, -414], [0, -428]],
  hair: [[-2, -459], [10, -457], [16, -452], [4, -446], [-2, -430], [2, -414], [-2, -402], [-10, -394], [-22, -391], [-31, -399], [-33, -418], [-28, -440], [-16, -455]],
  // gelung supit urang: a claw of hair rising from the crown and hooking forward, with a smaller rear prong
  claw: [[-14, -454], [-28, -470], [-36, -492], [-31, -514], [-15, -529], [5, -535], [24, -531], [33, -521], [21, -517], [7, -519], [-5, -513], [-12, -498], [-10, -478], [0, -462]],
  prong: [[-2, -461], [8, -472], [18, -478], [14, -470], [6, -462]],
  jamang: [[16, -452], [6, -461], [-6, -465], [-17, -463], [-15, -456], [-4, -457], [8, -451]],
  sumping: [[-6, -425], [-16, -423], [-24, -411], [-29, -392], [-19, -399], [-10, -411]],
  garuda: [[-18, -457], [-31, -460], [-40, -451], [-33, -444], [-22, -447]],
  kalung: [[-10, -373], [0, -359], [14, -351], [29, -354], [36, -363], [26, -363], [14, -363], [1, -369]],
  belt: [[-19, -280], [23, -280], [24, -264], [-19, -264]],
  uncal: [[13, -266], [19, -232], [21, -196], [19, -160], [26, -140], [17, -136], [13, -158], [11, -196], [9, -232], [7, -266]],
  shF: [33, -362], shB: [-25, -366],
  gapit: [[0, -538], [1, -500], [-2, -462], [-2, -420], [0, -380], [3, -320], [1, -260], [-2, -190], [-4, -120], [-5, -50], [-5, 0], [-5, 30]],
};

function kawung(H, P, sp, col, edgeCol) {
  H.clip(P, (h) => {
    const x = h.x;
    h.grid(P, sp, (cx, cy) => {
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + Math.PI / 4;
        x.beginPath(); x.ellipse(cx + Math.cos(a) * sp * 0.27, cy + Math.sin(a) * sp * 0.27, sp * 0.26, sp * 0.14, a, 0, TAU);
        x.fillStyle = col; x.fill(); x.lineWidth = 0.5; x.strokeStyle = edgeCol; x.stroke();
      }
    }, { hex: false, all: true });
  });
}

function paintKnight(H) {
  const k = KN;
  const skin = [PAL.goldD, PAL.gold, PAL.goldL];
  H.bands(k.tail, [PAL.redD, PAL.red, PAL.redL], 2.2).edge(k.tail, 1.2);
  H.stroke([[-30, -208], [-44, -170], [-52, -120], [-60, -68], [-74, -22]], 1.1, PAL.goldL);
  H.holesIn(k.tail, (h) => h.dots([[-36, -196], [-48, -150], [-55, -100], [-63, -52], [-76, -18]], 6.5, 1.35));
  for (const [leg, foot] of [[k.legB, k.footB], [k.legF, k.footF]]) {
    const L = limb(leg, 13, 8.2);
    H.bands(L, skin, 1.5, false).edge(L, 1.1, PAL.black, false);
    H.bands(foot, skin, 1.4).edge(foot, 1.1);
    const an = leg[2];
    const band = [[an[0] - 6, an[1] - 10], [an[0] + 6, an[1] - 11], [an[0] + 6.5, an[1] - 4], [an[0] - 6.5, an[1] - 3]];
    H.bands(band, [PAL.goldD, PAL.goldL], 1, false).edge(band, 0.8, PAL.black, false);
    H.dot(an[0], an[1] - 7, 1.2);
  }
  // the wrapped hip cloth: kawung batik on black with a red hem
  H.fill(k.hip, PAL.black);
  kawung(H, k.hip, 11, PAL.gold, PAL.goldDD);
  H.clip(k.hip, (h) => { h.stroke(k.hip, 7, PAL.red, { closed: true }); h.stroke(k.hip, 2.2, PAL.goldL, { closed: true }); });
  H.edge(k.hip, 1.2);
  H.holesIn(k.hip, (h) => h.grid(k.hip, 11, (cx, cy) => h.diamond(cx, cy, 1.6), { hex: false, margin: 5 }));
  H.holesIn(k.hip, (h) => h.dots(insetLoop(k.hip, 1.9), 5.2, 1.05, { smooth: false }));
  // front drape
  H.bands(k.drape, [PAL.redD, PAL.red, PAL.redL], 1.8).edge(k.drape, 1.1);
  H.stroke([[9, -206], [17, -168], [22, -118], [26, -72]], 0.9, PAL.goldL);
  H.holesIn(k.drape, (h) => h.dots([[10, -196], [16, -160], [19, -120], [23, -80]], 6, 1.2));
  // torso, neck
  H.bands(k.torso, [PAL.goldDD, PAL.goldD, PAL.gold, PAL.goldL], 1.7).edge(k.torso, 1.3);
  H.stroke([[24, -330], [18, -318], [10, -312]], 0.8, PAL.goldDD);
  H.bands(k.neck, skin, 1.4).edge(k.neck, 1.1);
  // belt and the hanging uncal ornament
  H.fill(k.belt, PAL.red, false).edge(k.belt, 1, PAL.black, false);
  H.stroke([[-18, -276], [22, -276]], 1, PAL.goldL).stroke([[-18, -268], [22, -268]], 1, PAL.goldL);
  H.dots([[-15, -272], [21, -272]], 4.6, 1.15, { smooth: false });
  H.bands(k.uncal, [PAL.goldD, PAL.goldL], 1.4).edge(k.uncal, 1);
  for (let q = 0; q < 4; q++) { H.x.fillStyle = PAL.red; H.x.beginPath(); H.x.arc(15 - q * 0.6, -246 + q * 24, 2.2, 0, TAU); H.x.fill(); }
  H.holesIn(k.uncal, (h) => { for (let q = 0; q < 8; q++) h.dot(15 - q * 0.3, -258 + q * 12, 1.15); });
  // necklace
  H.bands(k.kalung, [PAL.goldD, PAL.goldL], 1.3).edge(k.kalung, 1);
  H.stroke([[-6, -370], [2, -362], [14, -357], [28, -358]], 1.2, PAL.red);
  H.holesIn(k.kalung, (h) => h.dots([[-4, -368], [4, -361], [15, -356], [27, -357]], 4.6, 1.1));
  // the head, bowed (luruh): every head part is rotated about the top of the neck
  const PV = [6, -410], TILT = 0.2;
  const HR = (P) => P.map((q) => rotAbout(q, PV, TILT)), hp = (px, py) => rotAbout([px, py], PV, TILT);
  const hair = HR(k.hair), claw = HR(k.claw), prong = HR(k.prong), garuda = HR(k.garuda), jamang = HR(k.jamang), sumping = HR(k.sumping), face = HR(k.face);
  H.fill(hair, PAL.black).edge(hair, 0.9, PAL.goldD);
  const ukel = HR(ellipseLoop(-27, -391, 7.5, 6.5, 12));
  H.fill(ukel, PAL.black).edge(ukel, 0.8, PAL.goldD);
  H.holesIn(hair, (h) => { h.dots(HR([[-6, -452], [-20, -449], [-28, -436], [-30, -420], [-27, -404]]), 4.8, 1.3); h.crescent(...hp(-16, -430), 3.4, Math.PI * 0.9 + TILT, 0.5).crescent(...hp(-14, -414), 3.2, Math.PI * 0.9 + TILT, 0.5); });
  H.fill(claw, PAL.black).edge(claw, 1.3, PAL.gold);
  H.clip(claw, (h) => { for (const t of [0.3, 0.55, 0.8]) { const a = Math.PI * (0.55 + t * 0.9); h.stroke(HR([[-12 + Math.cos(a) * 8, -496 + Math.sin(a) * 8], [-12 + Math.cos(a) * 34, -496 + Math.sin(a) * 34]]), 3, PAL.gold, { smooth: false }); } });
  H.holesIn(claw, (h) => { h.dots(HR([[-22, -468], [-29, -490], [-24, -510], [-10, -523], [6, -528], [22, -525]]), 4.6, 1.4); h.dots(HR([[-13, -480], [-12, -500], [-3, -513], [10, -519]]), 5, 1.2); });
  H.bands(garuda, [PAL.redD, PAL.red, PAL.goldL], 1.2).edge(garuda, 0.9);
  H.holesIn(garuda, (h) => { h.dot(...hp(-24, -452), 1.3).dot(...hp(-32, -453), 1.3); });
  // gilded face with the long nose and the rice-grain eye
  H.bands(face, [PAL.goldD, PAL.gold, PAL.goldL], 1.3, false).edge(face, 1.1, PAL.black, false);
  const ea = Math.atan2(38, 36) + TILT, ec = hp(30, -431), d = [Math.cos(ea), Math.sin(ea)], n = [-Math.sin(ea), Math.cos(ea)];
  const eye = [[ec[0] - d[0] * 7.5, ec[1] - d[1] * 7.5], [ec[0] + n[0] * -2.4, ec[1] + n[1] * -2.4], [ec[0] + d[0] * 7.5, ec[1] + d[1] * 7.5], [ec[0] + n[0] * 1.5, ec[1] + n[1] * 1.5]];
  H.fill(eye, PAL.white);
  H.stroke(eye.concat([eye[0]]), 0.75, PAL.black);
  H.x.fillStyle = PAL.black; H.x.beginPath(); H.x.arc(ec[0] + d[0] * 2.4, ec[1] + d[1] * 2.4, 1.7, 0, TAU); H.x.fill();
  H.stroke([[ec[0] - d[0] * 9 - n[0] * 5, ec[1] - d[1] * 9 - n[1] * 5], [ec[0] + d[0] * 2 - n[0] * 6.6, ec[1] + d[1] * 2 - n[1] * 6.6], [ec[0] + d[0] * 9 - n[0] * 5.4, ec[1] + d[1] * 9 - n[1] * 5.4]], 1.2, PAL.black);
  H.stroke(HR([[46, -406], [39, -404.5]]), 0.9, PAL.black).stroke(HR([[41, -401.5], [37, -400.5]]), 0.8, PAL.black);
  H.stroke(HR([[12, -414], [8, -428], [6, -440]]), 3.2, PAL.black);   // sideburn (godheg)
  // diadem with three small points, the ear ornament hanging behind the ear, an earring
  for (const [cx, cy] of [[8, -458], [0, -462], [-8, -463]]) { const sp = HR([[cx - 2.4, cy + 1], [cx, cy - 7], [cx + 2.4, cy + 1]]); H.fill(sp, PAL.goldL, false).edge(sp, 0.6, PAL.black, false); }
  H.bands(jamang, [PAL.goldD, PAL.goldL], 1.2).edge(jamang, 1);
  for (const [cx, cy] of [[6, -456], [-6, -460]]) { const c = hp(cx, cy); H.x.fillStyle = PAL.red; H.x.beginPath(); H.x.arc(c[0], c[1], 1.7, 0, TAU); H.x.fill(); }
  H.holesIn(jamang, (h) => h.dot(...hp(0, -458.5), 1.25));
  H.bands(sumping, [PAL.goldD, PAL.gold, PAL.goldL], 1.1).edge(sumping, 0.9);
  H.stroke(HR([[-8, -420], [-17, -412], [-23, -398]]), 1, PAL.red);
  H.holesIn(sumping, (h) => h.dots(HR([[-12, -418], [-19, -408], [-24, -398]]), 5, 1.2));
  const er = hp(-3, -411);
  H.x.fillStyle = PAL.goldL; H.x.beginPath(); H.x.arc(er[0], er[1], 3.2, 0, TAU); H.x.fill(); H.x.lineWidth = 0.7; H.x.strokeStyle = PAL.black; H.x.stroke();
  H.x.fillStyle = PAL.red; H.x.beginPath(); H.x.arc(er[0], er[1], 1.4, 0, TAU); H.x.fill();
}

/** One arm: upper piece (shoulder → elbow) and forearm with hand, both hanging along +y. */
function buildArm(kind) {
  const O = kind === 'ogre';
  const L1 = O ? 86 : 92, L2 = O ? 82 : 90;
  const w = O ? [30, 24, 24, 18] : [15, 10.5, 10.5, 8];
  const skin = O ? ['#070504', '#1a1410', '#33261c'] : [PAL.goldD, PAL.gold, PAL.goldL];
  const eCol = O ? PAL.gold : PAL.black;
  const up = new Hide(O ? [-24, -22, 24, L1 + 16] : [-14, -12, 14, L1 + 8]);
  // the upper arm overlaps the shoulder with a rounded end (no visible ball)
  const UA = limb([[0, -w[0] * 0.3], [0.4, L1 / 2], [0, L1]], w[0], w[1]).concat(ellipseLoop(0, -w[0] * 0.3, w[0] / 2, w[0] / 2, 12).filter((p) => p[1] < -w[0] * 0.3).sort((a, b) => b[0] - a[0]));
  up.bands(UA, skin, O ? 2.4 : 1.4, false).edge(UA, 1.1, eCol, false);
  const ab = O ? 16 : 14, aw = w[0] * 0.56;
  const band = [[-aw - 1, ab], [aw + 1, ab - 2], [aw + 1.5, ab + (O ? 14 : 10)], [-aw - 1.5, ab + (O ? 16 : 11)]];
  const flare = [[-aw, ab + 2], [-aw - (O ? 16 : 10), ab - (O ? 8 : 6)], [-aw - (O ? 10 : 7), ab - (O ? 16 : 11)], [-aw - (O ? 4 : 3), ab - (O ? 6 : 4)]];
  up.bands(flare, [PAL.redD, PAL.red, PAL.goldL], 1).edge(flare, 0.9);
  up.bands(band, [PAL.goldD, PAL.goldL], 1.2, false).edge(band, 0.9, PAL.black, false);
  up.x.fillStyle = PAL.red; up.x.beginPath(); up.x.arc(0, ab + (O ? 7 : 5), O ? 3 : 2, 0, TAU); up.x.fill();
  up.dot(-aw * 0.55, ab + (O ? 7 : 5), 1.2).dot(aw * 0.55, ab + (O ? 6 : 4.5), 1.2);
  if (O) up.dots([[-aw + 2, ab + 12], [aw - 2, ab + 10]], 4.5, 1.0, { smooth: false });
  up.finish();
  const lo = new Hide(O ? [-22, -16, 82, L2 + 50] : [-14, -10, 26, L2 + 48]);
  const FA = limb([[0, -w[2] * 0.3], [0.5, L2 / 2], [0.8, L2]], w[2], w[3]).concat(ellipseLoop(0, -w[2] * 0.3, w[2] / 2, w[2] / 2, 12).filter((p) => p[1] < -w[2] * 0.3).sort((a, b) => b[0] - a[0]));
  lo.bands(FA, skin, O ? 2 : 1.2, false).edge(FA, 1.1, eCol, false);
  if (O) {
    const palm = [[-11, L2 - 2], [11, L2 - 2], [14, L2 + 12], [8, L2 + 24], [-8, L2 + 24], [-13, L2 + 12]];
    for (const [a, b] of [[-7, 2], [-1, 6], [5, 8], [10, 6]]) {
      const F = limb([[a, L2 + 18], [a + b * 0.6, L2 + 30], [a + b, L2 + 40]], 6.5, 3.4);
      lo.bands(F, skin, 1, false).edge(F, 0.9, PAL.gold, false);
      const tip = [a + b, L2 + 40];
      const nail = [[tip[0] - 2.4, tip[1] - 2], [tip[0] + 2.4, tip[1] - 2], [tip[0] + 1.5, tip[1] + 6], [tip[0] + 0.5, tip[1] + 8]];
      lo.fill(nail, PAL.white).edge(nail, 0.6);
    }
    // a gada (club) gripped in the fist
    const club = limb([[2, L2 + 14], [36, L2 - 18], [70, L2 - 54]], 7, 15);
    lo.bands(club, [PAL.goldDD, PAL.goldD, PAL.gold, PAL.goldL], 1.6, false).edge(club, 1, PAL.black, false);
    for (const t of [0.35, 0.6, 0.85]) { const c = [lerp(2, 70, t), lerp(L2 + 14, L2 - 54, t)]; lo.stroke([[c[0] - 5, c[1] - 5], [c[0] + 5, c[1] + 5]], 2.6, PAL.red); lo.dot(c[0] + 3, c[1] - 3, 1.3); }
    lo.bands(palm, skin, 1.4, false).edge(palm, 1, PAL.gold, false);
    const th = limb([[-11, L2 + 8], [-17, L2 + 18], [-16, L2 + 28]], 6, 3);
    lo.bands(th, skin, 1, false).edge(th, 0.9, PAL.gold, false);
  } else {
    const palm = [[-4.5, L2 - 3], [5, L2 - 3], [7, L2 + 8], [5, L2 + 16], [-2, L2 + 17], [-5.5, L2 + 8]];
    const F = limb([[1, L2 + 12], [5, L2 + 26], [11, L2 + 40]], 6.4, 1.6);
    const thumb = limb([[-4, L2 + 8], [-8, L2 + 16], [-7, L2 + 24]], 3.6, 1.4);
    lo.bands(F, skin, 1, false).edge(F, 0.8, PAL.black, false);
    lo.bands(palm, skin, 1.2, false).edge(palm, 0.9, PAL.black, false);
    lo.bands(thumb, skin, 0.8, false).edge(thumb, 0.8, PAL.black, false);
    lo.stroke([[3, L2 + 17], [6, L2 + 26], [10, L2 + 36]], 0.5, PAL.goldDD);
  }
  const bw = w[3] * 0.62 + 1.5, by = L2 - (O ? 12 : 9);
  const br = [[-bw, by], [bw, by - 1], [bw + 0.5, by + (O ? 9 : 6)], [-bw - 0.5, by + (O ? 9 : 6)]];
  lo.bands(br, [PAL.goldD, PAL.goldL], 1, false).edge(br, 0.8, PAL.black, false);
  lo.dot(0, by + (O ? 4.5 : 3), 1.15);
  const pm = O ? [1, 98] : [1, 103];
  lo.x.fillStyle = PAL.goldL; lo.x.beginPath(); lo.x.arc(pm[0], pm[1], O ? 3.2 : 2.4, 0, TAU); lo.x.fill();
  lo.x.lineWidth = 0.8; lo.x.strokeStyle = PAL.black; lo.x.stroke();
  lo.finish();
  return { up, lo, L1, palm: pm };
}

// ------------------------------------------------------------------ the raksasa (ogre) — authored facing right
const OG = {
  legB: [[-32, -176], [-62, -98], [-78, -26]],
  legF: [[30, -176], [66, -100], [78, -26]],
  footB: [[-106, -1], [-52, -1], [-46, -7], [-50, -13], [-62, -20], [-70, -32], [-88, -32], [-100, -16]],
  footF: [[56, -1], [118, -1], [126, -7], [120, -13], [104, -20], [94, -34], [74, -34], [62, -16]],
  kain: [[-58, -272], [-76, -240], [-86, -196], [-80, -152], [-54, -132], [-10, -126], [34, -122], [72, -130], [92, -150], [88, -204], [72, -254]],
  sash: [[0, -196], [12, -152], [10, -102], [20, -62], [6, -56], [-4, -98], [-8, -152]],
  torso: [[-50, -262], [-60, -304], [-66, -344], [-74, -372], [-60, -392], [-30, -402], [10, -404], [42, -396], [66, -382], [78, -358], [80, -328], [92, -298], [98, -268], [90, -242], [68, -230], [40, -236], [0, -246], [-30, -256]],
  face: [[40, -478], [56, -488], [74, -491], [88, -486], [96, -477], [102, -473], [114, -477], [126, -471], [133, -459], [131, -446], [123, -438], [115, -440], [119, -433], [121, -426], [104, -426], [80, -423], [62, -421], [50, -425], [40, -440], [36, -460]],
  jaw: [[50, -425], [80, -423], [104, -426], [113, -421], [111, -409], [99, -400], [78, -397], [58, -403]],
  mouth: [[78, -424], [104, -427], [115, -423], [111, -411], [96, -405], [80, -409]],
  crown: [[42, -484], [38, -506], [38, -532], [44, -556], [54, -576], [66, -590], [78, -595], [88, -588], [94, -572], [96, -550], [100, -528], [98, -506], [100, -490]],
  garuda: [[42, -500], [28, -506], [14, -516], [4, -530], [12, -536], [20, -532], [28, -546], [38, -554], [42, -538]],
  beard: [[52, -424], [60, -404], [74, -396], [98, -398], [92, -388], [96, -378], [80, -380], [76, -368], [64, -376], [54, -364], [50, -380], [40, -386], [40, -404]],
  kalung: [[-28, -396], [-10, -372], [16, -360], [44, -364], [60, -380], [44, -378], [16, -376], [-8, -384]],
  belt: [[-52, -274], [70, -258], [72, -244], [-52, -258]],
  shF: [58, -366], shB: [-50, -372],
  gapit: [[66, -606], [70, -560], [60, -500], [40, -446], [12, -394], [6, -320], [4, -250], [0, -170], [-2, -90], [-3, 0], [-3, 30]],
  hinge: [52, -423],
};
/** Wild curly hair (rambut gimbal) flowing from under the crown down the back. */
function ogreHair() {
  const spine = smoothPath([[40, -486], [18, -482], [-10, -466], [-36, -436], [-56, -398], [-70, -356], [-78, -312]], 8);
  const n = spine.length, outer = [], inner = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const t = i / (n - 1), w = lerp(30, 12, t) * (1 + 0.28 * Math.max(0, Math.sin(i * 1.05)));
    outer.push([spine[i][0] - ty * w, spine[i][1] + tx * w]);
    inner.push([spine[i][0] + ty * w * 0.4, spine[i][1] - tx * w * 0.4]);
  }
  return { poly: outer.concat(inner.reverse()), spine };
}

function paintOgre(H, open) {
  const o = OG;
  const skin = ['#070504', '#1a1410', '#33261c'];
  const red = [PAL.redD, PAL.red, '#c94a33', PAL.redL];
  for (const [leg, foot] of [[o.legB, o.footB], [o.legF, o.footF]]) {
    const L = limb(leg, 32, 19);
    H.bands(L, skin, 2.2, false).edge(L, 1.2, PAL.gold, false);
    H.bands(foot, skin, 1.8).edge(foot, 1.1, PAL.gold);
    const an = leg[2];
    const band = [[an[0] - 11, an[1] - 14], [an[0] + 11, an[1] - 16], [an[0] + 12, an[1] - 5], [an[0] - 12, an[1] - 3]];
    H.bands(band, [PAL.goldD, PAL.goldL], 1.2, false).edge(band, 0.9, PAL.black, false);
    H.dots([[an[0] - 9, an[1] - 9], [an[0] + 9, an[1] - 10.5]], 4.5, 1.1, { smooth: false });
  }
  // short cloth: red cinde with gold rosettes, gold hem
  H.bands(o.kain, [PAL.redD, PAL.red, '#b73b2c'], 2.5);
  H.clip(o.kain, (h) => {
    const x = h.x;
    h.grid(o.kain, 15, (cx, cy) => {
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * 3.3, cy + Math.sin(a) * 3.3, 3, 1.7, a, 0, TAU); x.fillStyle = PAL.goldL; x.fill(); x.lineWidth = 0.5; x.strokeStyle = PAL.redD; x.stroke(); }
      x.beginPath(); x.arc(cx, cy, 1.6, 0, TAU); x.fillStyle = PAL.black; x.fill();
    }, { hex: true, all: true });
    h.stroke(o.kain, 9, PAL.gold, { closed: true }); h.stroke(o.kain, 4, PAL.black, { closed: true });
  });
  H.edge(o.kain, 1.3);
  H.holesIn(o.kain, (h) => { h.grid(o.kain, 15, (cx, cy) => { h.diamond(cx + 7.5, cy, 1.5); }, { hex: true, margin: 8 }); h.dots(insetLoop(o.kain, 3), 5, 1.15, { smooth: false }); });
  H.bands(o.sash, red, 1.6).edge(o.sash, 1.1);
  H.stroke([[2, -186], [10, -150], [9, -104], [16, -70]], 0.9, PAL.goldL);
  H.holesIn(o.sash, (h) => h.dots([[3, -180], [9, -146], [9, -108], [13, -76]], 6.5, 1.25));
  // the huge torso
  H.bands(o.torso, skin, 3).edge(o.torso, 1.4, PAL.gold);
  H.stroke([[66, -300], [76, -282], [80, -262]], 1.1, PAL.goldD).stroke([[18, -330], [36, -322], [50, -326]], 1, PAL.goldD);
  H.fill(o.belt, PAL.red, false).edge(o.belt, 1, PAL.black, false);
  H.stroke([[-50, -270], [70, -254]], 1.1, PAL.goldL).stroke([[-50, -262], [70, -248]], 1.1, PAL.goldL);
  H.dots([[-46, -266], [66, -251]], 5, 1.25, { smooth: false });
  // hair mass behind the head
  const hair = ogreHair();
  H.fill(hair.poly, PAL.black, false).edge(hair.poly, 1, PAL.goldD, false);
  H.holesIn(hair.poly, (h) => {
    for (let r = 0; r < 3; r++) {
      const row = hair.spine.map((p, i) => { const t = i / (hair.spine.length - 1); return [p[0] - 6 - r * 7 * (1 - t * 0.5), p[1] - 4 - r * 5 * (1 - t * 0.5)]; });
      h.along(row, 8, (p, a) => h.crescent(p[0], p[1], 3, a - Math.PI / 2, 0.55), { smooth: false, skip: 1, skipEnd: 2 });
    }
  }, false);
  // ulur-ulur: a beaded tassel hanging from the back of the crown
  H.stroke([[36, -496], [22, -470], [12, -440], [8, -410]], 2.4, PAL.red);
  for (let q = 0; q < 6; q++) { const p = [36 - q * 5.5, -490 + q * 15]; H.x.fillStyle = q % 2 ? PAL.goldL : PAL.red; H.x.beginPath(); H.x.arc(p[0] - (q > 3 ? 2 : 0), p[1], 2.4, 0, TAU); H.x.fill(); }
  // necklace
  H.bands(o.kalung, [PAL.goldD, PAL.gold, PAL.goldL], 1.4).edge(o.kalung, 1);
  H.stroke([[-22, -390], [-4, -376], [18, -369], [44, -371]], 1.4, PAL.red);
  H.holesIn(o.kalung, (h) => h.dots([[-20, -390], [-2, -376], [18, -368], [44, -371]], 5, 1.2));
  // beard (brewok)
  H.fill(o.beard, PAL.black).edge(o.beard, 0.8, PAL.goldD);
  H.holesIn(o.beard, (h) => { for (let q = 0; q < 5; q++) h.slit([48 + q * 8, -394], [52 + q * 8, -382], 1.4); });
  // lower jaw (swings open about the hinge)
  const J = (P) => (open ? P.map((p) => rotAbout(p, o.hinge, 0.42)) : P);
  const jaw = J(o.jaw);
  const cav = open ? [o.mouth[0], o.mouth[1], o.mouth[2], ...J([[111, -411], [96, -405], [80, -409]])] : o.mouth;
  H.fill(cav, '#3a0d08').edge(cav, 0.8);
  if (open) { const tongue = J([[82, -414], [100, -416], [106, -409], [92, -404]]); H.fill(tongue, PAL.redL).edge(tongue, 0.6); }
  H.bands(jaw, red, 1.6).edge(jaw, 1.1);
  const lf = J([[100, -412], [103, -424], [106, -438]]);
  H.fill(limb(lf, 5.6, 1), PAL.white, false).edge(limb(lf, 5.6, 1), 0.7, PAL.black, false);
  for (let q = 0; q < 4; q++) { const p = J([84 + q * 5, -413]); H.fill([[p[0] - 1.8, p[1]], [p[0] + 1.8, p[1]], [p[0] + 1.2, p[1] - 3.6], [p[0] - 1.2, p[1] - 3.6]], PAL.white, false); }
  // face
  H.bands(o.face, red, 1.6, false).edge(o.face, 1.2, PAL.black, false);
  for (let q = 0; q < 5; q++) H.fill([[84 + q * 5, -426], [88 + q * 5, -426], [87.5 + q * 5, -421], [84.5 + q * 5, -421]], PAL.white, false);
  const uf = [[109, -428], [110, -414], [104, -400]];
  H.fill(limb(uf, 6.4, 1), PAL.white, false).edge(limb(uf, 6.4, 1), 0.7, PAL.black, false);
  // nose
  H.stroke([[114, -442], [121, -447], [127, -444]], 1, PAL.black);
  H.x.fillStyle = PAL.black; H.x.beginPath(); H.x.arc(118, -443, 1.7, 0, TAU); H.x.fill();
  H.stroke([[100, -470], [108, -462], [112, -450]], 0.9, PAL.redD);
  // the bulging round eye
  const ec = [83, -463];
  for (const [r, c] of [[13.2, PAL.black], [12.2, PAL.goldL], [10.8, PAL.red], [8.2, PAL.white]]) { H.x.fillStyle = c; H.x.beginPath(); H.x.arc(ec[0], ec[1], r, 0, TAU); H.x.fill(); }
  H.x.fillStyle = PAL.black; H.x.beginPath(); H.x.arc(ec[0] + 2.2, ec[1] + 1, 5.9, 0, TAU); H.x.fill();
  H.x.lineWidth = 1; H.x.strokeStyle = PAL.goldL; H.x.beginPath(); H.x.arc(ec[0], ec[1], 12.7, Math.PI * 1.05, Math.PI * 1.95); H.x.stroke();
  const brow = [[64, -474], [78, -486], [96, -484], [106, -474], [92, -477], [76, -473]];
  H.fill(brow, PAL.black).edge(brow, 0.8, PAL.goldD);
  // moustache curling back over the cheek
  H.stroke([[118, -436], [104, -434], [90, -437], [80, -446], [82, -452]], 3, PAL.black);
  H.stroke([[62, -436], [72, -431]], 1, PAL.redD);
  // sungging lines: cheek, nose wings, forehead
  H.stroke([[60, -446], [66, -436], [76, -430]], 1, PAL.black).stroke([[96, -470], [104, -458], [110, -448]], 0.9, PAL.black);
  H.stroke([[52, -472], [64, -480], [80, -482]], 0.8, PAL.goldL).stroke([[44, -452], [48, -436], [54, -428]], 0.8, PAL.goldL);
  // crown (makutha) with the garuda ornament at the back
  H.bands(o.garuda, [PAL.redD, PAL.red, PAL.goldL], 1.4).edge(o.garuda, 1);
  H.holesIn(o.garuda, (h) => { h.dot(14, -526, 1.6); for (let q = 0; q < 3; q++) h.slit([32 - q * 7, -506 - q * 3], [30 - q * 7, -516 - q * 3], 1.4); });
  H.bands(o.crown, [PAL.goldD, PAL.gold, PAL.goldL], 1.8).edge(o.crown, 1.2);
  H.clip(o.crown, (h) => {
    for (const y of [-500, -526, -552]) {
      h.stroke([[30, y], [110, y - 2]], 5, PAL.red, { smooth: false });
      h.stroke([[30, y - 3], [110, y - 5]], 0.9, PAL.black, { smooth: false });
      h.stroke([[30, y + 3], [110, y + 1]], 0.9, PAL.black, { smooth: false });
    }
    h.stroke([[50, -568], [66, -582], [82, -584]], 3, PAL.goldD);
  });
  H.holesIn(o.crown, (h) => {
    for (const y of [-500, -526, -552]) h.dots([[40, y - 0.4], [102, y - 2]], 4.6, 1.3, { smooth: false });
    for (const y of [-513, -539]) h.grid([[40, y - 7], [100, y - 9], [100, y + 5], [40, y + 7]], 7, (cx, cy) => h.diamond(cx, cy, 2.1), { hex: true, margin: 2.5 });
    h.dots([[52, -562], [66, -578], [84, -580]], 5, 1.25);
  });
  for (const [cx, cy] of [[60, -500], [80, -501], [64, -526], [84, -527], [70, -552]]) { H.x.fillStyle = PAL.greenM; H.x.beginPath(); H.x.arc(cx, cy, 2, 0, TAU); H.x.fill(); }
  const jam = [[42, -478], [100, -482], [101, -491], [42, -489]];
  H.bands(jam, [PAL.goldD, PAL.goldL], 1, false).edge(jam, 0.9, PAL.black, false);
  H.dots([[46, -484], [97, -487]], 5, 1.1, { smooth: false });
  // ear ornament and earring
  const ear = [[50, -446], [36, -458], [22, -454], [12, -440], [26, -436], [40, -434]];
  H.bands(ear, [PAL.green, PAL.greenM, PAL.greenL], 1.2).edge(ear, 1);
  H.holesIn(ear, (h) => h.dots([[44, -444], [32, -447], [20, -443]], 5, 1.1));
  H.x.fillStyle = PAL.goldL; H.x.beginPath(); H.x.arc(48, -422, 5.5, 0, TAU); H.x.fill(); H.x.lineWidth = 0.9; H.x.strokeStyle = PAL.black; H.x.stroke();
  H.x.fillStyle = PAL.red; H.x.beginPath(); H.x.arc(48, -422, 2.4, 0, TAU); H.x.fill();
}

// ------------------------------------------------------------------ the gunungan (kayon)
// local frame: origin at the bottom centre of the base; y up is negative; 640 tall
const G_HALF = [[0, -640], [12, -606], [28, -560], [50, -500], [76, -436], [102, -372], [124, -310], [140, -252], [148, -200], [147, -160], [138, -122], [124, -84], [110, -46], [104, -14], [100, 0], [50, 0]];
const G_OUT = G_HALF.concat(mirror(G_HALF).reverse().slice(0, -1));
const G_ARCH = (x) => -176 + 26 * (x / 140) ** 2;          // top edge of the solid base (gate, rocks, guardians)
function gHalfW(y) {
  for (let i = 1; i < G_HALF.length; i++) { const a = G_HALF[i - 1], b = G_HALF[i]; if (y >= a[1] && y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / ((b[1] - a[1]) || 1)); }
  return 0;
}
const KC = [0, -352], KZ = 0.78;
const kz = (P) => P.map(([a, b]) => [KC[0] + a * KZ, KC[1] + b * KZ]);
const KALA_HEAD = [[-54, 28], [-60, 0], [-52, -30], [-34, -46], [0, -52], [34, -46], [52, -30], [60, 0], [54, 28], [38, 42], [18, 48], [0, 50], [-18, 48], [-38, 42]];
const BULL = {
  body: [[38, -190], [40, -204], [52, -216], [70, -212], [94, -208], [106, -198], [104, -186], [86, -181], [56, -181], [42, -184]],
  head: [[42, -204], [32, -210], [22, -207], [14, -198], [16, -189], [26, -187], [36, -190]],
  legs: [[[46, -186], [40, -168]], [[56, -184], [56, -168]], [[90, -186], [88, -168]], [[98, -190], [102, -168]]],
  horns: [[[30, -209], [24, -222], [32, -232]], [[36, -208], [40, -222], [48, -228]]],
  tail: [[104, -200], [114, -192], [112, -178]],
};
const TIGER = {
  body: [[-34, -192], [-42, -206], [-64, -212], [-88, -208], [-102, -198], [-100, -186], [-86, -181], [-58, -180], [-40, -184]],
  head: [[-34, -200], [-28, -214], [-16, -218], [-6, -212], [-2, -202], [-8, -192], [-18, -189], [-28, -192]],
  ears: [[[-26, -213], [-28, -223], [-20, -216]], [[-14, -217], [-11, -225], [-8, -214]]],
  legs: [[[-40, -186], [-30, -168]], [[-50, -184], [-48, -168]], [[-86, -186], [-88, -168]], [[-96, -188], [-102, -168]]],
  tail: [[-100, -196], [-114, -206], [-118, -224], [-108, -234], [-102, -226]],
};
const BUD = [[0, -612], [9, -598], [11, -584], [6, -572], [0, -568], [-6, -572], [-11, -584], [-9, -598]];

/** The tree of life: thirteen tiers of scrolling branches, leaves, curling twigs and flowers (mirrored). */
function gunTree() {
  const R = rng(hash(ID, 'tree'));
  const inner = insetLoop(G_OUT, 13);
  const ok = (p, m = 0) => inside(p, inner) && p[1] < G_ARCH(p[0]) - 4 - m;
  const nearKala = (p, pad = 0) => Math.hypot(p[0] / 1.12, p[1] - KC[1]) < 48 + pad;
  const branches = [], twigs = [], leaves = [], flowers = [];
  const ys = [-236, -262, -288, -314, -340, -366, -394, -422, -450, -478, -504, -530, -556];
  ys.forEach((y0, i) => {
    const x0 = Math.abs(y0 - KC[1] + 10) < 48 ? 44 : 4;
    const rise = lerp(34, 14, i / (ys.length - 1));
    const ye = y0 - rise;
    const xe = gHalfW(ye) - 26;
    if (xe - x0 < 16) return;
    const dir = i % 2 ? 1 : -1;
    const pts = [[x0, y0], [lerp(x0, xe, 0.28), y0 + 5], [lerp(x0, xe, 0.62), y0 - rise * 0.55], [xe, ye]];
    const cr = clamp((xe - x0) * 0.1, 4, 8.5);
    branches.push({ P: curlPath(pts, cr, dir), w: lerp(6.4, 3.4, i / (ys.length - 1)) });
    // a flower in the curl
    { const E = pts[3], Q = pts[2]; let dx = E[0] - Q[0], dy = E[1] - Q[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      flowers.push({ c: [E[0] + dir * -dy * cr, E[1] + dir * dx * cr], r: Math.max(3, cr * 0.55) }); }
    const sp = resample(smoothPath(pts, 6), 10);
    for (let k = 1; k < sp.length - 1; k++) {
      const a = sp[k - 1], b = sp[k + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const side = k % 2 ? -1 : 1, t = k / (sp.length - 1);
      const L = lerp(30, 18, t) * (0.9 + R() * 0.2), W = lerp(13, 9, t);
      const la = ang + side * (0.82 + R() * 0.22);
      const base = [sp[k][0] + Math.cos(la) * 2.5, sp[k][1] + Math.sin(la) * 2.5];
      const lf = leafPts(base, la, L, W);
      if (!ok(lf[3]) || !ok(lf[1]) || !ok(lf[5]) || nearKala(lf[3], 3) || nearKala(lf[2], 3) || Math.abs(lf[3][0]) < 9) continue;
      const fam = (i + k) % 7 === 0 ? 'r' : i % 3 === 0 ? 'b' : i % 3 === 1 ? 'g' : 't';
      leaves.push({ P: lf, c: fam });
    }
    for (const f of [0.34, 0.66]) {
      const q = sp[Math.floor(f * (sp.length - 1))];
      const tw = [q, [q[0] + 5, q[1] - 9], [q[0] + 13, q[1] - 15]];
      if (!ok(tw[2], 3) || nearKala(tw[2], 6)) continue;
      twigs.push({ P: curlPath(tw, 4, 1, Math.PI * 1.5), w: 2.6 });
    }
  });
  const mir = (arr) => arr.concat(arr.map((o) => ({ ...o, P: o.P ? mirror(o.P) : undefined, c: o.c && o.c.length === 2 && typeof o.c[0] === 'number' ? [-o.c[0], o.c[1]] : o.c })));
  return { branches: mir(branches), twigs: mir(twigs), leaves: mir(leaves), flowers: mir(flowers), inner };
}

function gunGeometry() {
  const T = gunTree();
  const trunk = limb([[0, -168], [0, -390], [0, -592]], 15, 5);
  const tongues = edgeTongues(G_OUT, 12.5, 8.5, { keep: (a, b) => a[1] < -30 && b[1] < -30, lean: (m) => [m[0] > 0 ? -2.6 : 2.6, -2.6] });
  const halo = [];
  for (let q = -6; q <= 6; q++) {
    const a = -Math.PI / 2 + q * 0.235, cx = 0, cy = 0;
    const base = [Math.cos(a) * 54, Math.sin(a) * 48 - 2];
    const tip = [Math.cos(a) * 72, Math.sin(a) * 68 - 4];
    halo.push(kz([rotAbout(base, [cx, cy], -0.11), mid(base, tip, 0.45).map((v, i) => v + (i ? 0 : 3 * Math.sign(q || 1))), tip, rotAbout(base, [cx, cy], 0.11)]));
  }
  return { ...T, trunk, tongues, halo };
}

function paintBase(H) {
  // the solid base: rocks (wadas) behind a gate flanked by walls and two guardian giants
  const zone = G_OUT.filter((p) => p[1] > -200);
  H.clip(G_OUT, (h) => {
    const x = h.x;
    x.save();
    x.beginPath(); for (let xx = -160; xx <= 160; xx += 8) { const y = G_ARCH(xx); if (xx === -160) x.moveTo(xx, y); else x.lineTo(xx, y); } x.lineTo(160, 10); x.lineTo(-160, 10); x.closePath(); x.clip();
    x.fillStyle = PAL.blue; x.fillRect(-170, -200, 340, 210);
    const R = rng(hash(ID, 'rocks'));
    for (let k = 0; k < 16; k++) {
      const cx = (k % 8) * 40 - 140 + R() * 10, cy = -150 + Math.floor(k / 8) * 60 + R() * 10, rx = 28 + R() * 10, ry = 20 + R() * 8;
      const lobe = [];
      for (let q = 0; q < 10; q++) { const a = (q / 10) * TAU; const bump = 1 + 0.18 * Math.sin(a * 3 + k); lobe.push([cx + Math.cos(a) * rx * bump, cy + Math.sin(a) * ry * bump]); }
      h.bands(lobe, k % 2 ? ['#16303f', PAL.blue, PAL.blueM, PAL.blueL] : ['#16301c', PAL.green, PAL.greenM, PAL.greenL], 2.6).edge(lobe, 0.9, PAL.goldD);
    }
    x.restore();
  });
  // walls with lattice
  for (const sx of [-1, 1]) {
    const W = tr([[50, -26], [104, -26], [104, -72], [50, -72]], 0, 0, sx, 1);
    H.bands(W, [PAL.redD, PAL.red, PAL.redL], 1.6, false).edge(W, 1, PAL.black, false);
    H.holesIn(W, (h) => h.grid(W, 7.5, (cx, cy) => h.diamond(cx, cy, 2.2), { hex: true, margin: 3 }), false);
    const cp = tr([[46, -72], [108, -72], [106, -80], [48, -80]], 0, 0, sx, 1);
    H.bands(cp, [PAL.goldD, PAL.goldL], 1, false).edge(cp, 0.9, PAL.black, false);
    H.dots(tr([[52, -76], [102, -76]], 0, 0, sx, 1), 5, 1.05, { smooth: false });
  }
  // plinth
  const st = [[[-104, 0], [104, 0], [100, -12], [-100, -12]], [[-90, -12], [90, -12], [88, -20], [-88, -20]], [[-74, -20], [74, -20], [72, -28], [-72, -28]]];
  st.forEach((P, i) => { H.bands(P, i === 1 ? [PAL.goldD, PAL.goldL] : [PAL.black, '#3a2a20'], 1.2, false).edge(P, 1, i === 1 ? PAL.black : PAL.goldD, false); });
  H.dots([[-96, -6], [96, -6]], 6, 1.2, { smooth: false, skip: 1, skipEnd: 1 });
  // guardians: miniature raksasa, the same leather as the big one, facing the gate
  H.noHoles = true;
  for (const sx of [-1, 1]) {
    const x = H.x;
    x.save(); x.translate(sx * 80, -27); x.scale(-sx * 0.17, 0.17);
    paintOgre(H, false);
    // arm with a club
    const arm = limb([[58, -366], [96, -300], [118, -250]], 30, 20);
    H.bands(arm, ['#070504', '#1a1410', '#33261c'], 3, false).edge(arm, 4, PAL.gold, false);
    const club = limb([[112, -236], [128, -330], [150, -500]], 22, 46);
    H.bands(club, [PAL.goldD, PAL.gold, PAL.goldL], 5, false).edge(club, 5, PAL.black, false);
    for (const y of [-300, -380, -460]) H.stroke([[118 + (y + 250) * -0.14, y], [150 + (y + 250) * -0.14, y - 6]], 6, PAL.red);
    x.restore();
  }
  H.noHoles = false;
  // gate body, doors, kala over the door
  const gb = [[-46, -28], [46, -28], [46, -112], [-46, -112]];
  H.bands(gb, [PAL.redD, PAL.red, PAL.redL], 1.6, false).edge(gb, 1, PAL.black, false);
  const door = [[-30, -28], [30, -28], [30, -92], [-30, -92]];
  H.bands(door, [PAL.goldD, PAL.gold, PAL.goldL], 1.4, false).edge(door, 1, PAL.black, false);
  const x = H.x;
  x.strokeStyle = PAL.black; x.lineWidth = 0.8;
  x.beginPath(); x.moveTo(0, -28); x.lineTo(0, -92);
  for (const sx of [-1, 1]) { x.rect(sx > 0 ? 5 : -25, -86, 20, 24); x.rect(sx > 0 ? 5 : -25, -58, 20, 24); }
  x.stroke();
  H.dot(-5, -60, 1.6).dot(5, -60, 1.6);
  H.dots([[-41, -34], [-41, -106]], 6, 1.1, { smooth: false }).dots([[41, -34], [41, -106]], 6, 1.1, { smooth: false });
  const kh = [[-14, -96], [14, -96], [18, -106], [10, -114], [-10, -114], [-18, -106]];
  H.bands(kh, [PAL.redD, PAL.red], 1.2, false).edge(kh, 0.9, PAL.black, false);
  H.dot(-6, -106, 1.6).dot(6, -106, 1.6);
  // tiered roof
  const tiers = [[[-62, -112], [62, -112], [50, -130], [-50, -130]], [[-52, -130], [52, -130], [38, -146], [-38, -146]], [[-40, -146], [40, -146], [22, -162], [-22, -162]]];
  tiers.forEach((P) => { H.bands(P, [PAL.black, '#3a2a20', PAL.goldD], 1.6, false).edge(P, 1, PAL.goldL, false); });
  H.dots([[-54, -121], [54, -121]], 6, 1.15, { smooth: false, skip: 1, skipEnd: 1 });
  H.dots([[-42, -138], [42, -138]], 6, 1.1, { smooth: false, skip: 1, skipEnd: 1 });
  H.dots([[-28, -154], [28, -154]], 6, 1.05, { smooth: false, skip: 1, skipEnd: 1 });
  const fin = [[-8, -162], [8, -162], [0, -180]];
  H.bands(fin, [PAL.goldD, PAL.goldL], 1, false).edge(fin, 0.9, PAL.black, false);
  // a gold ledge along the arch where the beasts stand
  const ledge = [];
  for (let xx = -128; xx <= 128; xx += 8) ledge.push([xx, G_ARCH(xx)]);
  H.stroke(ledge, 4.4, PAL.black).stroke(ledge, 2.6, PAL.goldL);
  return zone;
}

function paintAnimals(H) {
  for (const L of BULL.legs) { const P = limb(L, 6, 4); H.bands(P, ['#070504', '#2a1f17'], 1, false).edge(P, 0.7, PAL.gold, false); }
  H.stroke(BULL.tail, 2.4, PAL.black).stroke(BULL.tail, 1, PAL.goldD);
  H.bands(BULL.body, ['#070504', '#1a1410', '#3a2b20'], 1.6).edge(BULL.body, 1, PAL.gold);
  H.bands(BULL.head, ['#070504', '#2a1f17'], 1.2).edge(BULL.head, 0.9, PAL.gold);
  for (const h of BULL.horns) { H.stroke(h, 3.8, PAL.black).stroke(h, 2.2, PAL.white); }
  H.x.fillStyle = PAL.white; H.x.beginPath(); H.x.arc(26, -200, 1.9, 0, TAU); H.x.fill();
  H.stroke([[44, -196], [60, -206], [84, -204], [100, -196]], 0.8, PAL.goldL);
  H.holesIn(BULL.body, (h) => { h.dots([[50, -192], [70, -191], [92, -192]], 6, 1.3); h.dot(62, -204, 1.4).dot(78, -203, 1.4); });
  for (const L of TIGER.legs) { const P = limb(L, 6, 4); H.bands(P, [PAL.goldD, PAL.orange], 1, false).edge(P, 0.7, PAL.black, false); }
  H.stroke(TIGER.tail, 3.4, PAL.black).stroke(TIGER.tail, 2, PAL.orange);
  H.bands(TIGER.body, [PAL.goldD, PAL.orange, PAL.goldL], 1.5).edge(TIGER.body, 1);
  H.clip(TIGER.body, (h) => { for (let q = 0; q < 7; q++) h.stroke([[-44 - q * 8.4, -212], [-42 - q * 8.4, -200], [-46 - q * 8.4, -186]], 2.2, PAL.black); });
  for (const e of TIGER.ears) H.fill(e, PAL.orange, false).edge(e, 0.7, PAL.black, false);
  H.bands(TIGER.head, [PAL.goldD, PAL.orange, PAL.goldL], 1.2).edge(TIGER.head, 0.9);
  H.x.fillStyle = PAL.black; H.x.beginPath(); H.x.arc(-12, -207, 1.8, 0, TAU); H.x.fill();
  H.stroke([[-4, -198], [-12, -195]], 0.9, PAL.black);
  H.holesIn(TIGER.body, (h) => { for (let q = 0; q < 6; q++) h.slit([-48 - q * 8.4, -206], [-47 - q * 8.4, -194], 1.4); });
}

function paintKala(H, halo) {
  for (const sp of halo) H.bands(sp, [PAL.redD, PAL.red, PAL.goldL], 1, false).edge(sp, 0.8, PAL.black, false);
  const head = kz(KALA_HEAD);
  H.bands(head, [PAL.redD, PAL.red, '#c94a33', PAL.redL], 1.8).edge(head, 1.2);
  for (const sx of [-1, 1]) {
    const brow = kz(tr([[8, -22], [18, -34], [34, -36], [46, -26], [52, -12], [42, -20], [30, -26], [18, -24]], 0, 0, sx, 1));
    H.bands(brow, [PAL.goldD, PAL.goldL], 1).edge(brow, 0.9);
    const ec = kz([[23 * sx, -10]])[0];
    for (const [r, c] of [[11, PAL.black], [10, PAL.red], [7.6, PAL.white]]) { H.x.fillStyle = c; H.x.beginPath(); H.x.arc(ec[0], ec[1], r * KZ, 0, TAU); H.x.fill(); }
    H.x.fillStyle = PAL.black; H.x.beginPath(); H.x.arc(ec[0] - sx * 1.4, ec[1] + 1.2, 4 * KZ, 0, TAU); H.x.fill();
    const cheek = kz(tr([[40, 6], [52, 10], [54, 20], [44, 24]], 0, 0, sx, 1));
    H.bands(cheek, [PAL.goldD, PAL.goldL], 1).edge(cheek, 0.8);
    const stud = kz([[58 * sx, -6]])[0];
    H.x.fillStyle = PAL.goldL; H.x.beginPath(); H.x.arc(stud[0], stud[1], 5, 0, TAU); H.x.fill(); H.x.lineWidth = 0.8; H.x.strokeStyle = PAL.black; H.x.stroke();
    H.x.fillStyle = PAL.red; H.x.beginPath(); H.x.arc(stud[0], stud[1], 2, 0, TAU); H.x.fill();
    // claws gripping the branches
    const hand = kz(tr([[56, 26], [72, 22], [80, 30], [76, 40], [62, 40], [54, 34]], 0, 0, sx, 1));
    H.bands(hand, [PAL.redD, PAL.red], 1).edge(hand, 0.8);
    for (let q = 0; q < 3; q++) { const c = kz([[sx * (66 + q * 5), 42]])[0]; H.fill([[c[0] - 1.4, c[1] - 1], [c[0] + 1.4, c[1] - 1], [c[0] + sx * 1.2, c[1] + 4.5]], PAL.white, false).edge([[c[0] - 1.4, c[1] - 1], [c[0] + 1.4, c[1] - 1], [c[0] + sx * 1.2, c[1] + 4.5]], 0.4, PAL.black, false); }
  }
  const nose = kz([[0, -10], [8, 0], [11, 10], [6, 16], [0, 14], [-6, 16], [-11, 10], [-8, 0]]);
  H.bands(nose, [PAL.redD, PAL.redL], 1.2).edge(nose, 1);
  const mouth = kz([[-38, 20], [38, 20], [32, 36], [0, 44], [-32, 36]]);
  H.fill(mouth, '#3a0d08').edge(mouth, 1);
  for (let q = -4; q <= 4; q++) H.fill(kz([[q * 6.8 - 2.6, 20], [q * 6.8 + 2.6, 20], [q * 6.8 + 1.8, 27], [q * 6.8 - 1.8, 27]]), PAL.white, false);
  for (const sx of [-1, 1]) { const f = kz(tr([[22, 20], [24, 32], [18, 46]], 0, 0, sx, 1)); H.fill(limb(f, 5, 1), PAL.white, false).edge(limb(f, 5, 1), 0.6, PAL.black, false); }
  const tongue = kz([[-8, 34], [8, 34], [6, 48], [0, 56], [-6, 48]]);
  H.bands(tongue, [PAL.redD, PAL.redL], 1).edge(tongue, 0.8);
  H.holesIn(head, (h) => {
    h.dots(kz([[-46, 26], [-54, 0], [-46, -26], [-28, -40], [0, -45], [28, -40], [46, -26], [54, 0], [46, 26]]), 5.6, 1.15);
    for (const sx of [-1, 1]) h.crescent(...kz([[sx * 40, -2]])[0], 2.6, sx > 0 ? 0 : Math.PI, 0.5);
  });
}

function buildGunungan(G) {
  const H = new Hide([-172, -664, 172, 8]);
  // 1. the uncut leather: outline + flame tongues
  H.fill(G_OUT, PAL.gold);
  for (const t of G.tongues) H.fill(t.P, PAL.gold);
  // 2. lace: inside the border band and above the base, everything that is not tree, beast or kala is cut away
  const lace = mk(H.cv.width, H.cv.height), lx = c2d(lace);
  H.T(lx); lx.lineCap = 'round'; lx.lineJoin = 'round';
  lx.fillStyle = '#fff'; { const p = new Path2D(); polyPath(p, G.inner, true); lx.fill(p); }
  lx.globalCompositeOperation = 'destination-out'; lx.fillStyle = '#000'; lx.strokeStyle = '#000';
  { lx.beginPath(); for (let xx = -180; xx <= 180; xx += 8) { const y = G_ARCH(xx) - 2; if (xx === -180) lx.moveTo(xx, y); else lx.lineTo(xx, y); } lx.lineTo(180, 20); lx.lineTo(-180, 20); lx.closePath(); lx.fill(); }
  const fillP = (P, smooth = true) => { const p = new Path2D(); (smooth ? pathCR : polyPath)(p, P, true); lx.fill(p); };
  fillP(G.trunk, false);
  for (const b of G.branches.concat(G.twigs)) { lx.lineWidth = b.w; const p = new Path2D(); polyPath(p, b.P, false); lx.stroke(p); }
  for (const l of G.leaves) fillP(l.P);
  for (const f of G.flowers) { lx.beginPath(); lx.arc(f.c[0], f.c[1], f.r + 2.2, 0, TAU); lx.fill(); }
  fillP(kz(KALA_HEAD));
  for (const sp of G.halo) fillP(sp, false);
  for (const sx of [-1, 1]) fillP(kz(tr([[56, 26], [72, 22], [80, 30], [76, 40], [62, 40], [54, 34]], 0, 0, sx, 1)));
  for (const A of [BULL, TIGER]) {
    fillP(A.body); fillP(A.head);
    for (const L of A.legs) fillP(limb(L, 6, 4), false);
    lx.lineWidth = A === BULL ? 2.4 : 3.4; { const p = new Path2D(); pathCR(p, A.tail, false); lx.stroke(p); }
  }
  for (const h of BULL.horns) { lx.lineWidth = 3.8; const p = new Path2D(); pathCR(p, h, false); lx.stroke(p); }
  for (const e of TIGER.ears) fillP(e, false);
  fillP(BUD);
  // the field around the tree stays leather: painted black and pierced by a dense net of small holes
  const ld = lx.getImageData(0, 0, lace.width, lace.height).data, LW = lace.width;
  const field = (px, py) => { const i = Math.round((px - H.b[0]) * H.s), j = Math.round((py - H.b[1]) * H.s); return i >= 0 && j >= 0 && i < LW && j < lace.height && ld[(j * LW + i) * 4 + 3] > 200; };
  const net = [];
  for (let j = 0; ; j++) {
    const cy = -630 + j * 5.2;
    if (cy > -150) break;
    for (let i = -40; i <= 40; i++) {
      const cx = i * 6 + (j & 1 ? 3 : 0), r = 1.45;
      if (field(cx, cy) && field(cx + r + 1, cy) && field(cx - r - 1, cy) && field(cx, cy + r + 1) && field(cx, cy - r - 1)) net.push([cx, cy, r]);
    }
  }
  const black = mk(lace.width, lace.height), bx = c2d(black);
  bx.drawImage(lace, 0, 0); bx.globalCompositeOperation = 'source-in'; bx.fillStyle = '#17110d'; bx.fillRect(0, 0, black.width, black.height);
  H.leatherCv = mk(H.cv.width, H.cv.height); c2d(H.leatherCv).drawImage(H.cv, 0, 0);
  H.atop = true; H.reset();
  // 3. paint (only on the remaining leather)
  H.bands(G_OUT, [PAL.goldDD, PAL.goldD, PAL.gold, PAL.goldL], 1.6);
  G.tongues.forEach((t) => H.bands(t.P, t.k % 2 ? [PAL.redD, PAL.red] : [PAL.goldD, PAL.goldL], 1.2).edge(t.P, 0.6));
  paintBase(H);
  H.x.save(); H.x.setTransform(1, 0, 0, 1, 0, 0); H.x.drawImage(black, 0, 0); H.x.restore();
  H.stroke(G.inner, 2.2, PAL.red, { smooth: false, closed: true });
  H.edge(G_OUT, 1.2);
  // foliage first, the gold scrolls over it
  const fam = { g: [PAL.green, PAL.greenM, PAL.greenL], b: [PAL.blue, PAL.blueM, PAL.blueL], t: ['#1f5450', '#3f8a7c', '#a8d0bc'], r: [PAL.redD, PAL.red, PAL.pink] };
  for (const l of G.leaves) {
    H.bands(l.P, fam[l.c], 1.25).edge(l.P, 0.85);
    H.stroke([l.P[0], mid(l.P[0], l.P[3], 0.8)], 0.7, PAL.goldL, { smooth: false });
  }
  H.stroke(smoothPath([[0, -168], [0, -390], [0, -592]], 6), 15, PAL.black, { smooth: false });
  H.fill(limb([[0, -168], [0, -390], [0, -592]], 12.4, 3.4), PAL.gold, false);
  H.stroke([[0, -172], [0, -586]], 2.2, PAL.red, { smooth: false });
  for (const b of G.branches.concat(G.twigs)) {
    H.stroke(b.P, b.w + 0.4, PAL.black, { smooth: false });
    H.stroke(b.P, Math.max(1.1, b.w - 2.2), PAL.goldL, { smooth: false });
  }
  for (const f of G.flowers) {
    const x = H.x;
    for (let q = 0; q < 5; q++) { const a = q * TAU / 5; x.beginPath(); x.ellipse(f.c[0] + Math.cos(a) * f.r * 0.6, f.c[1] + Math.sin(a) * f.r * 0.6, f.r * 0.55, f.r * 0.36, a, 0, TAU); x.fillStyle = PAL.red; x.fill(); x.lineWidth = 0.5; x.strokeStyle = PAL.black; x.stroke(); }
    x.beginPath(); x.arc(f.c[0], f.c[1], f.r * 0.32, 0, TAU); x.fillStyle = PAL.goldL; x.fill();
  }
  H.bands(BUD, [PAL.redD, PAL.red, PAL.pink], 1.4).edge(BUD, 1);
  paintAnimals(H);
  paintKala(H, G.halo);
  // 4. tatah: border band, trunk, branch strips, leaves
  {
    const band = insetLoop(G_OUT, 6.2).filter((p) => p[1] < -24 && p[1] > -628);
    const right = band.filter((p) => p[0] >= 0).sort((a, b) => a[1] - b[1]);
    const left = band.filter((p) => p[0] < 0).sort((a, b) => a[1] - b[1]);
    H.dots(right, 6.4, 1.4, { smooth: false, skip: 1 }).dots(left, 6.4, 1.4, { smooth: false, skip: 1 });
  }
  H.dots([[0, -186], [0, -300]], 7, 1.6, { smooth: false });
  H.dots([[0, -404], [0, -580]], 7, (t) => lerp(1.4, 1.0, t), { smooth: false });
  for (const b of G.branches) if (b.w >= 4.6) H.dots(b.P.slice(2, Math.floor(b.P.length * 0.66)), 7, 1.15, { smooth: false });
  for (const l of G.leaves) H.slit(mid(l.P[0], l.P[3], 0.34), mid(l.P[0], l.P[3], 0.72), 1.5);
  for (const f of G.flowers) H.dot(f.c[0], f.c[1], Math.max(1.1, f.r * 0.24));
  for (const [cx, cy, r] of net) H.dot(cx, cy, r);
  H.finish();
  return H;
}

function buildGunBack(front) {
  const H = new Hide(front.b);
  H.x.save(); H.x.setTransform(1, 0, 0, 1, 0, 0); H.x.drawImage(front.leatherCv, 0, 0); H.x.restore();
  H.atop = true; H.reset();
  H.bands(G_OUT, [PAL.redD, PAL.red, '#c4452f'], 4);
  const R = rng(hash(ID, 'fire'));
  const flame = (bx, by, h, W, lean, curl) => {
    const c = smoothPath([[bx, by], [bx + lean * h * 0.25, by - h * 0.35], [bx + lean * h * 0.55 - curl * 4, by - h * 0.7], [bx + lean * h * 0.35 + curl * 7, by - h]], 6);
    return ribbon(c, (t) => W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75));
  };
  const rows = [];
  for (let y0 = -20; y0 > -600; y0 -= 40) rows.push(y0);
  for (const y0 of rows.slice().reverse()) {
    const hw = gHalfW(y0 - 20) - 14;
    if (hw < 10) continue;
    const n = Math.max(1, Math.round((2 * hw) / 30));
    for (let q = 0; q < n; q++) {
      const fx = n === 1 ? 0 : -hw + 12 + ((2 * hw - 24) * q) / (n - 1) + (R() - 0.5) * 4;
      const lean = clamp(fx / Math.max(40, hw), -1, 1) * 0.45 + (R() - 0.5) * 0.15;
      const h = clamp(60 + R() * 18, 20, (gHalfW(y0 - 60) > 6 ? 78 : 40)), W = 15 + R() * 5;
      const fl = flame(fx, y0, h, W, lean, fx >= 0 ? 1 : -1);
      H.bands(fl, [PAL.redD, PAL.red, PAL.orange, PAL.goldL, PAL.cream], 1.9, false).edge(fl, 0.8, PAL.black, false);
      H.slit([fx + lean * h * 0.2, y0 - h * 0.28], [fx + lean * h * 0.42, y0 - h * 0.55], 1.6);
    }
  }
  const inner = insetLoop(G_OUT, 13);
  H.stroke(inner, 6, PAL.gold, { smooth: false, closed: true });
  H.edge(G_OUT, 1.2);
  const band = insetLoop(G_OUT, 6.2).filter((p) => p[1] < -24 && p[1] > -628);
  H.dots(band.filter((p) => p[0] >= 0).sort((a, b) => a[1] - b[1]), 6.4, 1.4, { smooth: false, skip: 1 }).dots(band.filter((p) => p[0] < 0).sort((a, b) => a[1] - b[1]), 6.4, 1.4, { smooth: false, skip: 1 });
  H.finish();
  return H;
}

// ------------------------------------------------------------------ timelines (pure functions of u)
const cr1 = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
function crKeys(u, KS) {
  let i = 0;
  while (i < KS.length - 2 && u > KS[i + 1][0]) i++;
  const k0 = KS[Math.max(0, i - 1)], k1 = KS[i], k2 = KS[i + 1], k3 = KS[Math.min(KS.length - 1, i + 2)];
  const t = clamp((u - k1[0]) / (k2[0] - k1[0]));
  return k1.map((_, j) => (j === 0 ? u : cr1(k0[j], k1[j], k2[j], k3[j], t)));
}
/** Lamp brightness: a breath on every beat (stronger on downbeats) plus flame flicker. */
function lampI(u) {
  const ph = (((u % 0.5) + 0.5) % 0.5) / 0.5;
  const down = ((((u % 2) + 2) % 2) < 0.5) ? 1 : 0.55;
  const breathe = Math.exp(-ph * 4.2) * down;
  const fl = (vnoise(u * 6.3, 0.5, 11) - 0.5) * 0.14 + (vnoise(u * 17.1, 2.5, 12) - 0.5) * 0.07;
  return 0.8 + 0.2 * breathe + fl;
}
/** A flat puppet turning round: its width passes through its edge. ev = [[t, dur, slow]]. */
function flipS(u, ev, s0) {
  let s = s0;
  for (const [t, d, slow] of ev) {
    if (u <= t) break;
    if (u < t + d) { const k = (u - t) / d; return s * Math.cos(Math.PI * (slow ? smootherstep(0, 1, k) : easeOut(k) * 0.35 + k * 0.65)); }
    s = -s;
  }
  return s;
}
/** Arms flicked by the dalang on the beats: [front upper, front fore, back upper, back fore] offsets. */
function twitch(id, u, amp) {
  const b = Math.floor(u * 2 + 1e-6), f = u * 2 - b;
  const tgt = (bb) => { const r = rng(hash(ID, id, bb)); const on = r() < 0.62; return amp.map((a) => (on ? (r() - 0.5) * 2 * a : 0)); };
  const A = tgt(b - 1), B = tgt(b), e = easeOutBack(clamp(f / 0.26), 2.2);
  return A.map((v, i) => lerp(v, B[i], e));
}
function knightState(u) {
  const sx = flipS(u, [[3.0, 0.16], [4.55, 0.16]], 1);
  const a = twitch('kn', u, [0.05, 0.16, 0.04, 0.1]);
  const sur = win(3.04, 4.45, u, 0.14);
  return {
    x: KNIGHT0[0], y: KNIGHT0[1], sx, k: 0.04, body: 0,
    th: -0.035 * win(3.12, 4.5, u, 0.2),
    fu: 0.12 + a[0] + 0.66 * sur, ff: 0.34 + a[1] + 0.14 * sur,
    bu: -0.08 + a[2], bf: 0.14 + a[3],
  };
}
function ogreState(u) {
  const sx = flipS(u, [[5.1, 0.17], [9.2, 1.1, true]], -1);
  const a = twitch('og', u, [0.07, 0.14, 0.06, 0.1]);
  const shock = win(3.0, 4.6, u, 0.1);
  // the dalang draws it a little to the left as it turns to watch the pelican go, and back again
  const slide = -40 * smootherstep(5.1, 5.3, u) * (1 - smootherstep(9.2, 10.3, u));
  return {
    x: OGRE0[0] + slide, y: OGRE0[1], sx, k: 0.04, body: u >= 3.0 && u < 5.55 ? 1 : 0,
    th: -0.05 * shock,
    fu: 0.28 + a[0] - 0.25 * shock, ff: 0.95 + a[1] - 0.2 * shock,
    bu: -0.24 + a[2] - 1.4 * shock, bf: 0.2 + a[3] + 0.9 * shock,
  };
}
// gunungan: [u, x, y, rotation, scaleX, k (lift toward the lamp)]
const GUN_OUT = [[1.96, 340, 790, 0, 1, 0.035], [2.0, 342, 786, 0.0, 1, 0.04], [2.1, 380, 752, -0.3, 1, 0.1], [2.22, 470, 700, -0.12, 0.35, 0.2], [2.33, 600, 646, 0.25, -0.65, 0.27], [2.44, 760, 586, 0.55, -1, 0.32], [2.55, 930, 512, 0.82, -0.9, 0.36], [2.66, 1120, 430, 1.0, -0.6, 0.4], [2.75, 1250, 380, 1.1, -0.5, 0.42]];
const GUN_BACK = [[3.86, 1250, 380, 1.1, -1, 0.42], [3.96, 1110, 430, 1.0, -1, 0.4], [4.08, 900, 520, 0.6, -1, 0.34], [4.2, 700, 604, 0.2, -0.35, 0.27], [4.32, 540, 684, -0.16, 0.55, 0.19], [4.46, 404, 762, -0.1, 1, 0.09], [4.6, 340, 790, 0.05, 1, 0.035], [4.7, 340, 790, 0, 1, 0.035]];
function gunPose(u) {
  const idle = 0.008 * Math.sin(u * 1.3) + 0.004 * Math.sin(u * 3.1 + 1);
  if (u < 1.85 || u >= 4.6) {
    let th = idle;
    if (u >= 4.6 && u < 5.2) th += 0.05 * Math.exp(-(u - 4.6) * 7) * Math.cos((u - 4.6) * 28);
    return { vis: true, front: false, x: GUN0[0], y: GUN0[1], th, sx: 1, k: 0.035 };
  }
  if (u < 2.0) return { vis: true, front: false, x: GUN0[0], y: GUN0[1], th: idle + 0.022 * Math.sin((u - 1.85) * 75) * seg(u, 1.85, 1.92), sx: 1, k: 0.035 };
  // the turn (front → fire side → front) is a quick flick, so the kayon stays broad while it swirls
  if (u < 2.75) { const [, x, y, th, , k] = crKeys(u, GUN_OUT); return { vis: true, front: true, x, y, th, sx: Math.cos(Math.PI * smoothstep(2.27, 2.35, u)), k }; }
  if (u < 3.86) return { vis: false };
  const [, x, y, th, , k] = crKeys(u, GUN_BACK);
  return { vis: true, front: true, x, y, th, sx: -Math.cos(Math.PI * smoothstep(4.22, 4.3, u)), k };
}
function plaqueSwing(u) {
  let a = 0.012 * Math.sin(u * 1.1 + 0.4) + 0.005 * Math.sin(u * 2.7);
  if (u > 4.4) a += 0.05 * Math.exp(-(u - 4.4) * 2.2) * Math.sin((u - 4.4) * 8.5);
  return a;
}

// ------------------------------------------------------------------ the pelican puppet
/** 0 = painted rider, 1 = leather puppet (strictly inside (1, 5)). */
const pupAmount = (u) => (u <= 1 || u >= 4.95 ? 0 : Math.min(seg(u, 1.0, 1.3), 1 - seg(u, 4.5, 4.95)));
const rodsAmount = (u) => (u <= 1 || u >= 4.9 ? 0 : Math.min(easeOut(seg(u, 1.0, 1.22)), 1 - easeIn(seg(u, 4.5, 4.9))));
/** Dance (2.5–4): a jerky hop on every half-beat; a dip on the beats otherwise. Evaluated at the 8 fps time. */
function hopY(uq) {
  if (uq >= 2.5 && uq < 4.0) { const ph = ((uq - 2.5) % 0.25) / 0.25; return ph < 0.49 ? 17 : 2; }
  if (uq > 1.2 && uq < 4.8) { const ph = (uq % 0.5) / 0.5; return ph < 0.24 ? -5 : 0; }
  return 0;
}
function tiltA(uq) {
  if (uq <= 1.2 || uq >= 4.8) return 0;
  const j = (hash3(Math.round(uq * 8), 3, 77) - 0.5) * 0.02;
  if (uq >= 2.5 && uq < 4.0) { const hb = Math.floor((uq - 2.5) * 4 + 1e-6); return (hb % 2 ? 0.05 : -0.04) + j; }
  return j;
}
function puppetize(P0, uq) {
  const B0 = P0.bird;
  const dance = uq >= 2.5 && uq < 4.0;
  const hb = Math.floor((uq - 2.5) * 4 + 1e-6);
  // the wing-hands are flicked up on alternate half-beats (near, far, near, ...) and fan out when raised
  const upN = dance && hb % 2 === 0, upF = dance && hb % 2 === 1;
  const aN = dance ? (upN ? -1.75 : -0.25) : 0;
  const aF = dance ? (upF ? -1.85 : -0.35) : -0.15;
  const wr = B0.wrist;
  const near = B0.primaries.map((f, k) => f.map((p) => rotAbout(p, wr, aN + (upN ? (k - 2) * 0.13 : 0))));
  const fwr = [wr[0] - 9, wr[1] - 13];
  const farHand = B0.primaries.map((f, k) => f.map((p) => rotAbout([p[0] - 9, p[1] - 13], fwr, aF + (upF ? (k - 2) * 0.13 : 0))));
  return { ...P0, bird: { ...B0, primaries: near, farHand, farWrist: fwr } };
}

function paintPelican(x, P, pup) {
  const B = P.bird, BK = P.bike;
  const groups = [];
  const G0 = { clip: null, path: new Path2D() }; groups.push(G0);
  const dot = (g, cx, cy, r) => { g.path.moveTo(cx + r, cy); g.path.arc(cx, cy, r, 0, TAU); };
  const P2 = (pts, smooth = false, closed = true) => { const p = new Path2D(); if (smooth) pathCR(p, pts, closed); else polyPath(p, pts, closed); return p; };
  const fill = (p, col) => { x.fillStyle = col; x.fill(p); };
  const edge = (p, w, col = PAL.black) => { x.save(); x.clip(p); x.lineWidth = w * 2; x.strokeStyle = col; x.stroke(p); x.restore(); };
  const bands = (p, cols, step) => { x.save(); x.clip(p); fill(p, cols[cols.length - 1]); for (let k = cols.length - 2; k >= 0; k--) { x.lineWidth = 2 * step * (k + 1); x.strokeStyle = cols[k]; x.stroke(p); } x.restore(); };
  const line = (pts, w, col, smooth = false) => { x.lineWidth = w; x.strokeStyle = col; x.stroke(P2(pts, smooth, false)); };
  const dotsAlong = (g, pts, step, r, skip = 0) => { const R = resample(pts, step); for (let k = skip; k < R.length - skip; k++) dot(g, R[k][0], R[k][1], r); };
  const contour = (poly, inset, step, r) => { const g = { clip: P2(poly), path: new Path2D() }; groups.push(g); dotsAlong(g, insetLoop(poly, inset, false).concat([insetLoop(poly, inset, false)[0]]), step, r); };
  x.lineJoin = 'round'; x.lineCap = 'round';

  // far leg and crank
  const LF = B.legFar;
  { const p = P2(LF.poly); bands(p, ['#4e130e', '#76201a'], 2); edge(p, 0.9); const f = P2(LF.web); fill(f, '#76201a'); edge(f, 0.8); }
  line([BK.crank.bb, BK.crank.far], 5, '#2a1f18');
  // the puppet's far hand (second arm on its own rod) behind everything
  if (pup && B.farHand) for (const f of B.farHand) { const rb = P2(ribbon(smoothPath(f, 4), (t) => lerp(6.2, 1.6, t))); fill(rb, '#0c0907'); edge(rb, 0.5, PAL.goldD); }

  // wheels: black tyre, gold rim, gold spokes, rosette hub
  for (const wh of BK.wheels) {
    const [cx, cy] = wh.c, r = wh.r;
    x.lineWidth = 7.6; x.strokeStyle = PAL.black; x.beginPath(); x.arc(cx, cy, r - 3.8, 0, TAU); x.stroke();
    x.lineWidth = 0.9; x.strokeStyle = PAL.goldD; x.beginPath(); x.arc(cx, cy, r - 3.8, 0, TAU); x.stroke();
    const rr = r * 0.84;
    x.lineWidth = pup ? 5.6 : 3.4; x.strokeStyle = PAL.black; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.stroke();
    x.lineWidth = pup ? 4.0 : 2.2; x.strokeStyle = PAL.gold; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.stroke();
    for (let j = 0; j < wh.spokes; j++) {
      const a = wh.angle + (j * TAU) / wh.spokes;
      const p0 = [cx + Math.cos(a) * 6, cy + Math.sin(a) * 6], p1 = [cx + Math.cos(a) * (rr - 1), cy + Math.sin(a) * (rr - 1)];
      line([p0, p1], pup ? 3.6 : 2.2, PAL.black); line([p0, p1], pup ? 2.0 : 1.1, PAL.goldL);
    }
    x.fillStyle = PAL.black; x.beginPath(); x.arc(cx, cy, 7.4, 0, TAU); x.fill();
    x.fillStyle = PAL.gold; x.beginPath(); x.arc(cx, cy, 6.2, 0, TAU); x.fill();
    x.fillStyle = PAL.red; x.beginPath(); x.arc(cx, cy, 2.6, 0, TAU); x.fill();
    if (pup) {
      for (let j = 0; j < 24; j++) { const a = wh.angle + (j + 0.5) * TAU / 24; dot(G0, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.1); }
      for (let j = 0; j < 4; j++) { const a = wh.angle + j * TAU / 4 + 0.4; dot(G0, cx + Math.cos(a) * 4.4, cy + Math.sin(a) * 4.4, 0.85); }
    }
  }
  x.setLineDash([2.6, 1.6]); line(BK.chain.concat([BK.chain[0]]), 1.9, PAL.black); x.setLineDash([]);
  { const c = BK.crank.bb, r = BK.crank.ring;
    x.fillStyle = PAL.black; x.beginPath(); x.arc(c[0], c[1], r + 1.2, 0, TAU); x.fill();
    const g = x.createRadialGradient(c[0], c[1], 0, c[0], c[1], r); g.addColorStop(0, PAL.goldL); g.addColorStop(1, PAL.goldD);
    x.fillStyle = g; x.beginPath(); x.arc(c[0], c[1], r, 0, TAU); x.fill();
    const ca0 = Math.atan2(BK.crank.near[1] - c[1], BK.crank.near[0] - c[0]);
    if (pup) { for (let j = 0; j < 6; j++) { const a = ca0 + j * TAU / 6; const px = c[0] + Math.cos(a) * r * 0.58, py = c[1] + Math.sin(a) * r * 0.58; G0.path.moveTo(px + 2.6 * Math.cos(a), py + 2.6 * Math.sin(a)); G0.path.ellipse(px, py, 2.6, 1.3, a, 0, TAU); } dot(G0, c[0], c[1], 1.4); }
    else { x.lineWidth = 0.8; x.strokeStyle = PAL.goldDD; x.beginPath(); x.arc(c[0], c[1], r * 0.6, 0, TAU); x.stroke(); }
  }
  // frame: leather strips, red with a gold centre line
  for (const [name, sgm] of Object.entries(BK.tubes)) {
    const w = name === 'downtube' || name === 'toptube' ? 6 : 5;
    line(sgm, w + 2, PAL.black); line(sgm, w, PAL.red); line(sgm, 1.1, PAL.goldL);
    if (pup) { const L = Math.hypot(sgm[1][0] - sgm[0][0], sgm[1][1] - sgm[0][1]); const n = Math.floor(L / 7); for (let k = 1; k < n; k++) { const p = mid(sgm[0], sgm[1], k / n); dot(G0, p[0], p[1], 1.15); } }
  }
  line(BK.fork, 7.4, PAL.black); line(BK.fork, 5.2, PAL.red); line(BK.fork, 1, PAL.goldL);
  if (pup) dotsAlong(G0, BK.fork, 7, 1.1, 1);
  line(BK.stem, 6, PAL.black); line(BK.stem, 4, PAL.gold);
  line(BK.bars, 6.4, PAL.black); line(BK.bars, 4.2, PAL.gold);
  line(BK.seatpost, 5.6, PAL.black); line(BK.seatpost, 2.6, '#3a2c22');
  line(BK.saddle, 9.4, PAL.black); line(BK.saddle, 2.4, PAL.gold);

  // tail
  { const p = P2(B.tail, true); bands(p, pup ? [PAL.black, PAL.goldD, PAL.gold] : ['#cdb88c', PAL.white], 2.2); edge(p, 1.1);
    const T = B.tail; for (let k = 1; k <= 2; k++) line([mid(T[0], T[3], 0.5), mid(T[1], T[2], k / 3)], 0.8, PAL.black);
    if (pup) { const g = { clip: p, path: new Path2D() }; groups.push(g); dot(g, ...mid(mid(T[0], T[3]), mid(T[1], T[2]), 0.45), 1.5); dot(g, ...mid(mid(T[0], T[3]), mid(T[1], T[2]), 0.75), 1.3); } }
  // body
  const bodyP = P2(B.body, true);
  const ang = B.bodyAng + (P.place?.rot ?? 0), ca = Math.cos(ang), sa = Math.sin(ang), bc = B.bodyC;
  const E = (uu, vv) => [bc[0] + uu * ca - vv * sa, bc[1] + uu * sa + vv * ca];
  if (pup) {
    bands(bodyP, [PAL.goldDD, PAL.goldD, PAL.gold], 2.6);
    // three rows of large painted feather scales, each with a punched crescent
    const g = { clip: bodyP, path: new Path2D() }; groups.push(g);
    x.save(); x.clip(bodyP);
    for (let k = -4; k <= 4; k++) for (let row = -1; row <= 1; row++) {
      const uu = k * 16 + (row & 1 ? 8 : 0) - 4, vv = row * 19;
      if ((uu / 62) ** 2 + (vv / 36) ** 2 > 1.0) continue;
      const c = E(uu, vv);
      const a0 = ang + Math.PI / 2, a1 = ang + Math.PI * 1.5;
      for (const [r, col] of [[10, PAL.black], [9.2, PAL.red], [6.6, PAL.white], [3.6, PAL.gold]]) { x.beginPath(); x.arc(c[0], c[1], r, a0, a1); x.closePath(); x.fillStyle = col; x.fill(); }
      const q = E(uu - 5.2, vv);
      g.path.moveTo(q[0] + 1.35, q[1]); g.path.arc(q[0], q[1], 1.35, 0, TAU);
    }
    x.restore();
    edge(bodyP, 1.3);
    contour(B.body, 3.6, 6.2, 1.05);
  } else {
    bands(bodyP, ['#cdb88c', '#e6d6b2', PAL.white], 2.2);
    x.save(); x.clip(bodyP);
    for (let row = -1; row <= 1; row++) { const pts = []; for (let k = -4; k <= 3; k++) pts.push(E(k * 14, row * 14 + 6 + Math.abs(k) * 0.6)); line(pts, 0.7, 'rgba(140,110,60,0.55)', true); }
    x.restore();
    edge(bodyP, 1.3);
  }
  // wing
  const wingP = P2(B.wing, true);
  bands(wingP, pup ? [PAL.black, PAL.goldD, PAL.gold, PAL.goldL] : ['#cdb88c', '#e8dab8', PAL.white], pup ? 1.6 : 2);
  {
    x.save(); x.clip(wingP);
    const sc = B.secondaries;
    for (let r = 0; r < 3; r++) {
      const row = sc.map(([px, py], k) => [px + r * 4 + 4, py - 8 - r * 10]);
      if (pup) {
        const S2 = resample(smoothPath(row, 4), 10.5);
        for (let k = 0; k < S2.length; k++) {
          const c = S2[k];
          const fth = [[c[0] + 6 * ca, c[1] + 6 * sa], [c[0] - 2 * ca - 4.6 * -sa, c[1] - 2 * sa - 4.6 * ca], [c[0] - 7 * ca, c[1] - 7 * sa], [c[0] - 2 * ca + 4.6 * -sa, c[1] - 2 * sa + 4.6 * ca]];
          const fp = P2(fth, true); fill(fp, r === 1 ? PAL.red : PAL.white); x.lineWidth = 0.8; x.strokeStyle = PAL.black; x.stroke(fp);
          dot(G0, c[0] - 1.8 * ca, c[1] - 1.8 * sa, 1.0);
        }
      } else line(row, 0.8, 'rgba(140,110,60,0.6)', true);
    }
    x.restore();
  }
  edge(wingP, 1.2);
  if (pup) contour(B.wing, 2.6, 6, 0.95);
  line(B.secondaries, pup ? 5.2 : 4.6, PAL.black, true);
  if (pup) line(B.secondaries, 1.4, PAL.red, true);
  for (const f of B.primaries) {
    const rb = P2(ribbon(smoothPath(f, 4), (t) => lerp(6.4, 1.6, t)));
    fill(rb, PAL.black); if (pup) { edge(rb, 0.5, PAL.goldL); const m = smoothPath(f, 4); dot(G0, ...m[Math.floor(m.length * 0.35)], 0.95); }
  }
  // neck, head
  const neckP = P2(B.neck, true);
  bands(neckP, ['#d4be8e', PAL.white, PAL.cream], 1.8); edge(neckP, 1.1);
  if (pup) {
    const ns = B.neckSpine, n = ns.length;
    const i0 = Math.floor(n * 0.16), a0 = ns[i0], a1 = ns[Math.min(n - 1, i0 + 2)];
    const tx = a1[0] - a0[0], ty = a1[1] - a0[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    x.save(); x.clip(neckP);
    line([[a0[0] - nx * 22, a0[1] - ny * 22], [a0[0] + nx * 22, a0[1] + ny * 22]], 9, PAL.black);
    line([[a0[0] - nx * 22, a0[1] - ny * 22], [a0[0] + nx * 22, a0[1] + ny * 22]], 7, PAL.gold);
    line([[a0[0] - nx * 22, a0[1] - ny * 22], [a0[0] + nx * 22, a0[1] + ny * 22]], 1.6, PAL.red);
    x.restore();
    const gN = { clip: neckP, path: new Path2D() }; groups.push(gN);
    for (let k = -2; k <= 2; k++) dot(gN, a0[0] + nx * k * 5 - tx / tl * 2.2, a0[1] + ny * k * 5 - ty / tl * 2.2, 1.0);
    for (let k = Math.floor(n * 0.34); k < n - 2; k += 2) dot(gN, ns[k][0], ns[k][1], 1.0);
  }
  const H = B.head, headP = new Path2D(); headP.arc(H.c[0], H.c[1], H.r, 0, TAU);
  bands(headP, ['#d4be8e', PAL.white, PAL.cream], 1.6); edge(headP, 1.1);
  for (const c of B.crest) { line(c, 3.6, PAL.black); line(c, 2, PAL.gold); }
  if (pup) {
    // a little diadem (jamang) for the puppet
    x.save(); x.clip(headP);
    x.lineWidth = 6; x.strokeStyle = PAL.black; x.beginPath(); x.arc(H.c[0], H.c[1], H.r, Math.PI * 1.08, Math.PI * 1.85); x.stroke();
    x.lineWidth = 4.4; x.strokeStyle = PAL.gold; x.stroke();
    x.restore();
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (1.25 + k * 0.17), b0 = [H.c[0] + Math.cos(a) * H.r, H.c[1] + Math.sin(a) * H.r];
      const tip = [H.c[0] + Math.cos(a) * (H.r + 7), H.c[1] + Math.sin(a) * (H.r + 7)];
      const sp = [rotAbout(b0, H.c, -0.12), tip, rotAbout(b0, H.c, 0.12)];
      const p = P2(sp); fill(p, PAL.gold); edge(p, 0.6);
      x.fillStyle = PAL.red; x.beginPath(); x.arc(...mid(b0, tip, 0.35), 1.1, 0, TAU); x.fill();
    }
  }
  // pouch
  const pouchP = P2(B.pouch, true);
  bands(pouchP, pup ? [PAL.redD, PAL.red, PAL.redL, PAL.pink] : ['#9a5317', '#d27c2c', '#eca24a'], pup ? 2 : 2.2);
  edge(pouchP, 1.1);
  if (pup) {
    const g = { clip: pouchP, path: new Path2D() }; groups.push(g);
    const lo = B.pouch.slice(3, 20), J = B.lowerJawLine;
    const fold = lo.map((p, k) => { const t = k / (lo.length - 1); const q = mid(J[0], J[1], t); return mid(p, q, 0.5); });
    dotsAlong(g, fold, 6, 1.1, 1);
    line(fold, 0.7, PAL.goldL, true);
  }
  // bill and nail
  const billP = P2(B.upperBill, true);
  bands(billP, [PAL.goldD, PAL.gold, PAL.goldL], 1.3); edge(billP, 1);
  const U = B.upperBill;
  line([mid(U[0], U[7]), mid(U[1], U[6]), mid(U[2], U[5])], 1.3, PAL.red, true);
  if (pup) { const g = { clip: billP, path: new Path2D() }; groups.push(g); dotsAlong(g, [mid(U[0], U[7], 0.3), mid(U[1], U[6], 0.3), mid(U[2], U[5], 0.3)], 7, 0.9, 1); }
  const nailP = P2(B.nail); fill(nailP, PAL.red); edge(nailP, 0.7);
  // the wayang eye: a long rice-grain almond along the bill
  const Eye = B.eye;
  const ea = Math.atan2(U[2][1] - U[0][1], U[2][0] - U[0][0]);
  const d = [Math.cos(ea), Math.sin(ea)], nn = [-Math.sin(ea), Math.cos(ea)];
  const ec = [Eye.c[0] - d[0] * 1, Eye.c[1] - d[1] * 1];
  const L = pup ? 8.4 : 7, hU = 3.4, hD = 2.2;
  if (Eye.mode === 'closed') line([[ec[0] - d[0] * L, ec[1] - d[1] * L], [ec[0] + d[0] * L, ec[1] + d[1] * L]], 1.1, PAL.black);
  else {
    const eyeP = P2([[ec[0] - d[0] * L, ec[1] - d[1] * L], [ec[0] - nn[0] * hU, ec[1] - nn[1] * hU], [ec[0] + d[0] * L, ec[1] + d[1] * L], [ec[0] + nn[0] * hD, ec[1] + nn[1] * hD]], true);
    fill(eyeP, PAL.white); x.lineWidth = 0.9; x.strokeStyle = PAL.black; x.stroke(eyeP);
    const pp = [Eye.pupil[0] + d[0] * 1.2, Eye.pupil[1] + d[1] * 1.2];
    x.fillStyle = PAL.black; x.beginPath(); x.arc(pp[0], pp[1], 2.1, 0, TAU); x.fill();
    if (pup) line([[ec[0] - d[0] * (L + 1) - nn[0] * 5, ec[1] - d[1] * (L + 1) - nn[1] * 5], [ec[0] + d[0] * (L - 1) - nn[0] * 5.6, ec[1] + d[1] * (L - 1) - nn[1] * 5.6]], 1.1, PAL.red);
  }
  // near leg, foot, crank, pedal
  const LN = B.legNear;
  { const p = P2(LN.poly); bands(p, ['#5e1812', PAL.red, PAL.redL], 1.8); edge(p, 1);
    const f = P2(LN.web); bands(f, ['#8a2a1c', PAL.redL], 1.2); edge(f, 0.9);
    if (pup) { const g = { clip: p, path: new Path2D() }; groups.push(g); dotsAlong(g, [mid(LN.knee, LN.ankle, 0.15), mid(LN.knee, LN.ankle, 0.85)], 6.5, 1.0); dotsAlong(g, [mid(LN.hip, LN.knee, 0.25), mid(LN.hip, LN.knee, 0.8)], 6.5, 1.1); } }
  line([BK.crank.bb, BK.crank.near], 5.4, PAL.black); line([BK.crank.bb, BK.crank.near], 2.2, PAL.goldD);
  const pn = BK.crank.near;
  line([[pn[0] - 6.5, pn[1]], [pn[0] + 6.5, pn[1]]], 6, PAL.black);
  x.fillStyle = PAL.gold; x.beginPath(); x.arc(BK.crank.bb[0], BK.crank.bb[1], 2.6, 0, TAU); x.fill();

  // tatah: punch the holes, back-fill with lamp light
  if (pup) {
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    for (const g of groups) { if (g.clip) { x.save(); x.clip(g.clip); x.fill(g.path); x.restore(); } else x.fill(g.path); }
    x.restore();
    x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = HOLE;
    for (const g of groups) { if (g.clip) { x.save(); x.clip(g.clip); x.fill(g.path); x.restore(); } else x.fill(g.path); }
    x.restore();
  }
}

/** Silhouette for the cast shadow (low-res). */
function paintSilhouette(x, P, pup) {
  const B = P.bird, BK = P.bike;
  x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = 'round'; x.lineJoin = 'round';
  const fp = (pts, smooth = true) => { x.beginPath(); if (smooth) pathCR(x, pts, true); else polyPath(x, pts, true); x.fill(); };
  for (const wh of BK.wheels) {
    x.lineWidth = 7; x.beginPath(); x.arc(wh.c[0], wh.c[1], wh.r - 3.8, 0, TAU); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.arc(wh.c[0], wh.c[1], wh.r * 0.84, 0, TAU); x.stroke();
    x.lineWidth = pup ? 3 : 1.6;
    for (let j = 0; j < wh.spokes; j++) { const a = wh.angle + (j * TAU) / wh.spokes; x.beginPath(); x.moveTo(wh.c[0], wh.c[1]); x.lineTo(wh.c[0] + Math.cos(a) * wh.r * 0.84, wh.c[1] + Math.sin(a) * wh.r * 0.84); x.stroke(); }
  }
  x.lineWidth = 6.5;
  for (const sgm of Object.values(BK.tubes)) { x.beginPath(); x.moveTo(sgm[0][0], sgm[0][1]); x.lineTo(sgm[1][0], sgm[1][1]); x.stroke(); }
  for (const L of [BK.fork, BK.stem, BK.bars, BK.seatpost, BK.saddle]) { x.beginPath(); polyPath(x, L, false); x.stroke(); }
  x.beginPath(); x.arc(BK.crank.bb[0], BK.crank.bb[1], BK.crank.ring, 0, TAU); x.fill();
  for (const p of [B.tail, B.body, B.wing, B.neck, B.pouch, B.upperBill]) fp(p);
  fp(B.legNear.poly, false); fp(B.legFar.poly, false); fp(B.legNear.web, false); fp(B.legFar.web, false);
  x.beginPath(); x.arc(B.head.c[0], B.head.c[1], B.head.r, 0, TAU); x.fill();
  x.lineWidth = 5;
  for (const f of B.primaries.concat(pup && B.farHand ? B.farHand : [])) { x.beginPath(); polyPath(x, f, false); x.stroke(); }
}

/** Horn rod in a 2D canvas: dark core, a warm highlight, thread bindings. */
function rodC(x, pts, w, binds = []) {
  const P = pts.length > 2 ? smoothPath(pts, 6) : pts;
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = w + 0.8; x.strokeStyle = 'rgba(20,12,6,0.9)'; x.beginPath(); polyPath(x, P, false); x.stroke();
  x.lineWidth = w; x.strokeStyle = PAL.horn; x.beginPath(); polyPath(x, P, false); x.stroke();
  x.lineWidth = Math.max(0.6, w * 0.26); x.strokeStyle = 'rgba(190,150,100,0.75)';
  x.beginPath(); polyPath(x, P.map((p) => [p[0] - w * 0.18, p[1]]), false); x.stroke();
  const R = resample(P, 1);
  for (const [t, col] of binds) {
    const i = Math.min(R.length - 2, Math.floor(t * (R.length - 1))), a = R[i], b = R[i + 1];
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    x.lineWidth = 2.4; x.strokeStyle = col; x.lineCap = 'butt';
    x.beginPath(); x.moveTo(a[0] - (ty / L) * w * 0.75, a[1] + (tx / L) * w * 0.75); x.lineTo(a[0] + (ty / L) * w * 0.75, a[1] - (tx / L) * w * 0.75); x.stroke();
    x.lineCap = 'round';
  }
}
function truncate(pts, e) {
  if (e >= 1) return pts;
  let L = 0; const seglen = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seglen.push(l); L += l; }
  let want = L * e; const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (want <= seglen[i - 1]) { out.push(mid(pts[i - 1], pts[i], want / seglen[i - 1])); return out; }
    want -= seglen[i - 1]; out.push(pts[i]);
  }
  return out;
}
function paintRods(x, P, e) {
  if (e <= 0) return;
  const B = P.bird, BK = P.bike, hc = B.head.c, r = B.head.r;
  const ns = B.neckSpine, n = ns.length;
  const spine = [[BK.crank.bb[0] - 16, 1030], [BK.crank.bb[0] - 4, BK.crank.bb[1] + 30], [B.bodyC[0] + 2, B.bodyC[1] + 26], B.bodyC, ns[Math.floor(n * 0.3)], ns[Math.floor(n * 0.65)], [hc[0] - 7, hc[1] + 2], [hc[0] - 9, hc[1] - r - 12]];
  const sm = smoothPath(spine, 6);
  rodC(x, truncate(sm, e), 4.6, e > 0.95 ? [[0.62, '#7a1d16'], [0.7, '#111'], [0.86, '#7a1d16']] : []);
  if (e > 0.98) { const top = sm[sm.length - 1]; x.fillStyle = PAL.horn; x.beginPath(); x.moveTo(top[0] - 2.4, top[1] + 2); x.lineTo(top[0] + 0.5, top[1] - 7); x.lineTo(top[0] + 2.4, top[1] + 2); x.fill(); }
  const hand = B.primaries[2][B.primaries[2].length - 1];
  rodC(x, truncate([[hand[0] - 34, 1030], hand], e), 2.4);
  const fh = B.farHand ? B.farHand[2][B.farHand[2].length - 1] : null;
  if (fh) rodC(x, truncate([[fh[0] - 66, 1030], fh], e), 2.2);
  if (e > 0.98) {
    for (const h of [hand, fh].filter(Boolean)) {
      x.fillStyle = PAL.goldL; x.beginPath(); x.arc(h[0], h[1], 2.6, 0, TAU); x.fill(); x.lineWidth = 0.8; x.strokeStyle = PAL.black; x.stroke();
    }
  }
}

let LIVE = null;
function liveBuffers() {
  if (LIVE) return LIVE;
  const W = 820, H = 900, SW = 260, SH = 230;
  const img = createImage(W, H), b = mk(W, H);
  const sil = mk(SW, SH), shImg = createImage(SW, SH);
  LIVE = { W, H, img, xo: img.drawingContext, b, xb: c2d(b), SW, SH, sil, xs: c2d(sil), shImg, xso: shImg.drawingContext };
  return LIVE;
}

// ------------------------------------------------------------------ native drawing helpers (p5, panel units)
/** A horn rod as textured quads (soft edges even on an un-antialiased framebuffer). */
function rodQ(tex, pts, w) {
  let P = pts.length > 2 ? smoothPath(pts, 5) : pts;
  if (pts.length > 2) { const end = P[P.length - 1]; P = resample(P, 26); if (Math.hypot(P[P.length - 1][0] - end[0], P[P.length - 1][1] - end[1]) > 1) P.push(end); }
  const Hh = w / 0.6;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    push(); translate(a[0], a[1]); rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
    image(tex, -0.8, -Hh / 2, L + 1.6, Hh);
    pop();
  }
}
function armPalm(A, sh, a1, a2) {
  const e = [sh[0] + Math.sin(a1) * A.L1, sh[1] + Math.cos(a1) * A.L1];
  const a = a1 + a2, pa = A.palm;
  return [e[0] + pa[0] * Math.cos(a) + pa[1] * Math.sin(a), e[1] - pa[0] * Math.sin(a) + pa[1] * Math.cos(a)];
}
function drawSpAt(sp, x, y) { image(sp.img, x + sp.x0, y + sp.y0, sp.w, sp.h); }

// ------------------------------------------------------------------ scene
let BUILT = null;
function build() {
  const screen = toImage(buildScreen());
  const trunk = toImage(buildTrunk());
  const glow = toImage(radialSprite(256, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [0.7, 'rgba(255,255,255,0.1)'], [1, 'rgba(255,255,255,0)']]));
  const vign = toImage(vignette());
  const rod = toImage(rodTexture());
  const lampH = buildLamp();
  const flame = toImage(buildFlame());
  const plaqH = buildPlaque();
  const kn = new Hide([-104, -530, 60, 8]); paintKnight(kn); kn.finish();
  const og0 = new Hide([-112, -616, 140, 8]); paintOgre(og0, false); og0.finish();
  const og1 = new Hide([-112, -616, 140, 8]); paintOgre(og1, true); og1.finish();
  const armK = buildArm('knight'), armO = buildArm('ogre');
  const G = gunGeometry();
  const gunF = buildGunungan(G), gunB = buildGunBack(gunF);
  const arm = (A) => ({ L1: A.L1, palm: A.palm, up: spriteOf(A.up), lo: spriteOf(A.lo), upS: shadowOf(A.up, 1, 1.4), loS: shadowOf(A.lo, 1, 1.4) });
  const sprites = [kn, og0, og1, gunF, gunB, plaqH, lampH, armK.up, armK.lo, armO.up, armO.lo];
  const bytes = sprites.reduce((s, h) => s + h.cv.width * h.cv.height * 4, 0) + 2048 * 2048 * 4 + 2048 * 420 * 4;
  return {
    screen, trunk, glow, vign, flame, rod,
    lamp: spriteOf(lampH),
    plaque: spriteOf(plaqH), plaqueS: shadowOf(plaqH, 1, 1.6),
    knight: { body: [spriteOf(kn)], bodyS: [shadowOf(kn, 1, 1.6)], arm: arm(armK), shF: KN.shF, shB: KN.shB, gapit: KN.gapit, rodF: -36, rodB: -12 },
    ogre: { body: [spriteOf(og0), spriteOf(og1)], bodyS: [shadowOf(og0, 1, 1.6), shadowOf(og1, 1, 1.6)], arm: arm(armO), shF: OG.shF, shB: OG.shB, gapit: OG.gapit, rodF: -40, rodB: -16 },
    gun: { front: spriteOf(gunF), back: spriteOf(gunB), sh: shadowOf(gunF, 1, 1.5), soft: shadowOf(gunF, 0.3, 7) },
    stats: { bakeMB: +(bytes / 1048576).toFixed(1) },
  };
}

export default {
  freezeU: 3.5,                        // the reaction: knight turned and pointing, ogre agape, wing-hand up mid-hop
  ride: RIDE,
  cues: [
    { u: 1.0, name: 'becomePuppet' }, { u: 2.0, name: 'gununganSweep' }, { u: 2.5, name: 'dance' },
    { u: 3.0, name: 'ogreJaw' }, { u: 4.0, name: 'sweepBack' },
  ],

  async init() {
    if (!BUILT) BUILT = build();
    Object.assign(this, BUILT);
  },

  mods(u) {
    const m = { spokes: 8 };
    const w = win(1.2, 4.8, u, 0.2);
    if (w > 1e-4) m.bob = 1 + 0.9 * w;
    return m;
  },

  render(K, u, ctx) {
    const v = ctx.view;
    imageMode(CORNER); blendMode(BLEND); noStroke(); noTint();
    image(this.screen, 0, 0, 1000, 1000);
    const I = lampI(u);
    blendMode(ADD);
    tint(255, 196, 120, 255 * clamp(0.16 + 0.3 * (I - 0.8) / 0.2, 0, 0.5));
    image(this.glow, HOT[0] - 470, HOT[1] - 420, 940, 840);
    blendMode(BLEND); noTint();

    const G = gunPose(u), Kn = knightState(u), Og = ogreState(u), sw = plaqueSwing(u);
    const pel = ctx.rider.visible ? this.preparePelican(K, u, ctx) : null;
    // ---- shadows on the cloth
    this.drawPlaque(sw, true);
    this.drawPuppet(this.knight, Kn, true, v);
    this.drawPuppet(this.ogre, Og, true, v);
    if (G.vis) this.drawGun(G, true);
    if (pel) this.drawPelicanShadow(pel);
    // ---- puppets planted in the trunk
    this.drawPlaque(sw, false);
    if (G.vis && !G.front) this.drawGun(G, false);
    this.drawPuppet(this.knight, Kn, false, v);
    this.drawPuppet(this.ogre, Og, false, v);
    // ---- the trunk (the road) hides the rods' ends
    image(this.trunk, 0, 795, 1000, 205);
    // ---- the pelican, the sweeping gunungan
    if (pel) image(pel.img, pel.x0, pel.y0, pel.w, pel.h, 0, 0, pel.pw, pel.ph);
    if (G.vis && G.front) this.drawGun(G, false);
    // ---- light falloff, then the lamp itself
    image(this.vign, -24, -24, 1048, 1048);
    this.drawLamp(u, I);
  },

  drawPlaque(sw, shadow) {
    push();
    if (shadow) { translate(LAMP[0], LAMP[1]); scale(1.03); translate(-LAMP[0], -LAMP[1]); tint(255, 115); }
    else {
      const tip = [PLAQ[0] + Math.sin(sw) * 8, PLAQ[1] - 8];
      rodQ(this.rod, [[PLAQ[0], 30], tip], 1.2);
      fill(PAL.goldD); circle(PLAQ[0], 30, 4.4);
    }
    translate(PLAQ[0], PLAQ[1] - 2); rotate(sw); translate(0, 2);
    drawSp(shadow ? this.plaqueS : this.plaque);
    pop(); noTint();
  },

  drawPuppet(PP, st, shadow, v) {
    if (st.x + 160 < v.x0 || st.x - 160 > v.x1) return;
    const A = PP.arm;
    push();
    if (shadow) { translate(LAMP[0], LAMP[1]); scale(1 + st.k); translate(-LAMP[0], -LAMP[1]); tint(255, 120); }
    translate(st.x, st.y); rotate(st.th); scale(st.sx, 1);
    const arm = (sh, a1, a2) => {
      push(); translate(sh[0], sh[1]); rotate(-a1);
      drawSp(shadow ? A.upS : A.up);
      translate(0, A.L1); rotate(-a2);
      drawSp(shadow ? A.loS : A.lo);
      pop();
    };
    arm(PP.shB, st.bu, st.bf);
    drawSp(shadow ? PP.bodyS[st.body] : PP.body[st.body]);
    if (!shadow) rodQ(this.rod, PP.gapit, 4.4);
    arm(PP.shF, st.fu, st.ff);
    if (!shadow) {
      const pb = armPalm(A, PP.shB, st.bu, st.bf), pf = armPalm(A, PP.shF, st.fu, st.ff);
      rodQ(this.rod, [pb, [pb[0] + PP.rodB, 40]], 2.4);
      rodQ(this.rod, [pf, [pf[0] + PP.rodF, 40]], 2.4);
    }
    pop(); noTint();
  },

  drawGun(G, shadow) {
    const sp = G.sx < 0 ? this.gun.back : this.gun.front;
    push();
    if (shadow) { translate(LAMP[0], LAMP[1]); scale(1 + G.k); translate(-LAMP[0], -LAMP[1]); }
    translate(G.x, G.y); rotate(G.th); scale(Math.max(0.02, Math.abs(G.sx)), 1);
    if (shadow) {
      const soft = smoothstep(0.05, 0.22, G.k);
      if (soft < 1) { tint(255, 120 * (1 - soft)); drawSp(this.gun.sh); }
      if (soft > 0) { tint(255, lerp(130, 105, soft) * soft); drawSp(this.gun.soft); }
    } else {
      rodQ(this.rod, [[0, 170], [0, 60], [0, -40]], 5);
      drawSp(sp);
      rodQ(this.rod, [[0, -150], [0, -380], [0, -600]], 3.8);
    }
    pop(); noTint();
  },

  drawLamp(u, I) {
    // chain
    stroke(28, 18, 10); strokeWeight(1.5); noFill();
    for (let y = 40; y < FB[1] - 66; y += 6) ellipse(FB[0] - 52, y + 3, 3.2, 6);
    noStroke();
    drawSpAt(this.lamp, FB[0], FB[1]);
    const fl = vnoise(u * 9.1, 0.5, 21), fl2 = vnoise(u * 23.7, 1.5, 22);
    const sy = 0.9 + 0.3 * fl + 0.12 * (I - 0.8), sx = 0.92 + 0.16 * fl2, sway = (vnoise(u * 5.3, 3.5, 23) - 0.5) * 0.3;
    push(); translate(FB[0] + 2, FB[1] - 2); rotate(sway); scale(sx, sy);
    image(this.flame, -8, -40, 16, 42);
    pop();
    blendMode(ADD);
    tint(255, 170, 80, 255 * clamp(0.5 * I, 0, 1));
    image(this.glow, LAMP[0] - 46, LAMP[1] - 46, 92, 92);
    tint(255, 140, 60, 255 * clamp(0.22 * I, 0, 1));
    image(this.glow, LAMP[0] - 130, LAMP[1] - 120, 260, 240);
    blendMode(BLEND); noTint();
  },

  preparePelican(K, u, ctx) {
    const R = ctx.rider;
    let P = R.placed;
    const pup = pupAmount(u), rods = rodsAmount(u);
    if (u > 1 && u < 5) {
      const quant = u > 1.2 && u < 4.8;
      const uq = quant ? Math.floor(u * 8 + 1e-6) / 8 : u;
      const Rq = quant ? ctx.riderAt(ctx.t - u + uq) : R;
      const pose = puppetize(Rq.pose, quant ? uq : u);
      const place = { ...R.place, y: R.place.y - (quant ? hopY(uq) : 0), rot: quant ? tiltA(uq) : 0 };
      P = K.rig.placed(pose, place);
    }
    const bx = P.place.x, by = P.place.y;
    let x0 = bx - 200, x1 = bx + 228, y0 = by - 362, y1 = rods > 0 ? 1000 : by + 12;
    x0 = Math.max(x0, -2, ctx.view.x0 - 2); x1 = Math.min(x1, 1002, ctx.view.x1 + 2);
    y0 = Math.max(y0, ctx.view.y0 - 2); y1 = Math.min(y1, ctx.view.y1 + 2);
    if (x1 <= x0 || y1 <= y0) return null;
    const L = liveBuffers();
    const S2 = Math.min(clamp(ctx.pxu, 0.5, 1.6), (L.W - 4) / (x1 - x0), (L.H - 4) / (y1 - y0));
    const i0 = Math.floor(x0 * S2), j0 = Math.floor(y0 * S2);
    const pw = Math.min(L.W, Math.ceil(x1 * S2) - i0 + 1), ph = Math.min(L.H, Math.ceil(y1 * S2) - j0 + 1);
    const xo = L.xo;
    xo.setTransform(1, 0, 0, 1, 0, 0); xo.globalCompositeOperation = 'source-over'; xo.clearRect(0, 0, L.W, L.H);
    xo.setTransform(S2, 0, 0, S2, -i0, -j0);
    const xa = P.bird.tail[1][0] - 12, xbb = P.bird.upperBill[3][0] + 12;
    if (pup <= 0) paintPelican(xo, P, false);
    else if (pup >= 1) paintPelican(xo, P, true);
    else {
      // the tatah wave: the puppet look sweeps tail → bill (in), and back (out)
      paintPelican(xo, P, false);
      const xb = L.xb;
      xb.setTransform(1, 0, 0, 1, 0, 0); xb.globalCompositeOperation = 'source-over'; xb.clearRect(0, 0, L.W, L.H);
      xb.setTransform(S2, 0, 0, S2, -i0, -j0);
      paintPelican(xb, P, true);
      const goingIn = u < 3;
      const f = goingIn ? seg(u, 1.0, 1.3) : seg(u, 4.5, 4.95);
      const xf = lerp(xa, xbb, f);
      const g = xb.createLinearGradient(xf - 7, 0, xf + 7, 0);
      g.addColorStop(0, `rgba(0,0,0,${goingIn ? 1 : 0})`); g.addColorStop(1, `rgba(0,0,0,${goingIn ? 0 : 1})`);
      xb.globalCompositeOperation = 'destination-in'; xb.fillStyle = g; xb.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
      xb.globalCompositeOperation = 'source-over';
      xo.setTransform(1, 0, 0, 1, 0, 0); xo.drawImage(L.b, 0, 0); xo.setTransform(S2, 0, 0, S2, -i0, -j0);
      const gl = xo.createLinearGradient(xf - 5, 0, xf + 5, 0);
      gl.addColorStop(0, 'rgba(255,230,160,0)'); gl.addColorStop(0.5, 'rgba(255,230,160,0.4)'); gl.addColorStop(1, 'rgba(255,230,160,0)');
      xo.globalCompositeOperation = 'source-atop'; xo.fillStyle = gl; xo.fillRect(xf - 6, y0, 12, by - y0); xo.globalCompositeOperation = 'source-over';
    }
    if (rods > 0) paintRods(xo, P, rods);
    L.img.setModified(true);
    // cast shadow: soft and faint for the rider, crisp for the puppet pressed to the screen
    const rs = 0.45, sx0 = x0, sy0 = Math.max(0, by - 362), sx1 = x1, sy1 = by + 8;
    const sw = Math.min(L.SW, Math.ceil((sx1 - sx0) * rs) + 2), shh = Math.min(L.SH, Math.ceil((sy1 - sy0) * rs) + 2);
    const xs = L.xs;
    xs.setTransform(1, 0, 0, 1, 0, 0); xs.clearRect(0, 0, L.SW, L.SH);
    xs.setTransform(rs, 0, 0, rs, -sx0 * rs + 1, -sy0 * rs + 1);
    paintSilhouette(xs, P, pup > 0.5);
    const so = L.xso;
    so.setTransform(1, 0, 0, 1, 0, 0); so.clearRect(0, 0, L.SW, L.SH);
    so.filter = `blur(${lerp(3.2, 0.7, pup).toFixed(2)}px)`; so.drawImage(L.sil, 0, 0); so.filter = 'none';
    so.globalCompositeOperation = 'source-in'; so.fillStyle = SHADOW; so.fillRect(0, 0, L.SW, L.SH); so.globalCompositeOperation = 'source-over';
    L.shImg.setModified(true);
    return {
      img: L.img, x0: i0 / S2, y0: j0 / S2, w: pw / S2, h: ph / S2, pw, ph,
      sh: { x0: sx0 - 1 / rs, y0: sy0 - 1 / rs, w: sw / rs, h: shh / rs, pw: sw, ph: shh, k: lerp(0.1, 0.045, pup), a: lerp(0.16, 0.46, pup) },
    };
  },

  drawPelicanShadow(pel) {
    const s = pel.sh;
    push();
    translate(LAMP[0], LAMP[1]); scale(1 + s.k); translate(-LAMP[0], -LAMP[1]);
    tint(255, 255 * s.a);
    image(LIVE.shImg, s.x0, s.y0, s.w, s.h, 0, 0, s.pw, s.ph);
    pop(); noTint();
  },
};
