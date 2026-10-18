// Ink-painting kit (水墨): shared by the Han rubbing, Tang baimiao, Song landscape,
// Qingming scroll and Bada Shanren panels. Everything is deterministic (keyed seeds).
//
// Two layers of technique:
//   • WASHES (墨色浓淡 / 晕染) are painted with Canvas2D into one soft layer per bake:
//       washLayer(K, key, items, {w, h, pxu}) → p5.Graphics, items = [{poly, t, alpha, soft, grad, edge, gran}]
//     (blurred fills, ink pooling at the edges, granulation; p5.brush's watercolour fill is too grey/slow for ink)
//   • STROKES are p5.brush marks with ink brushes registered by init(K):
//       line(K, key, pts, {w, t, dry, fine, ground, curv})       wet / dry (飞白) / fine (白描) lines
//       cun(K, key, poly, {n, kind:'rain'|'axe'|'hemp', size, t, w, density, ground})   texture strokes (皴)
//       dots(K, key, pts, {t, size, w, ground, angle})           moss / leaf dots (点苔)
//       tree(K, key, x, y, h, {kind:'pine'|'leafy'|'bare'|'willow', t, lean, ground, washes, collectOnly})
//   tone(t, ground) → ink colour for tone t (0 = palest … 1 = jet) over a ground colour
//   seal(K, text, {size, mode}) → red seal sprite;  silk(K, {w, h, base, seed}) → aged silk ground
import { rng, hash, lerp, clamp, smoothPath, bbox, fbm } from './math.js';

let registered = false;

/** Register the ink brushes (values are in final units: custom brushes are not affected by scaleBrushes). */
export function init(K) {
  if (registered) return;
  registered = true;
  // wet line: dense stamps, crisp edge, strong press-and-lift
  K.brush.add('ink.wet', {
    type: 'default', weight: 1.0, scatter: 0.25, sharpness: 0.95, grain: 1.4, opacity: 225, spacing: 0.1,
    pressure: { mode: 'gaussian', curve: [0.25, 0.35], min_max: [1.35, 0.55] }, rotate: 'natural', noise: 0.12,
  });
  // dry brush (飞白): scattered, grainy, broken
  K.brush.add('ink.dry', {
    type: 'default', weight: 1.2, scatter: 2.2, sharpness: 0.62, grain: 3.4, opacity: 150, spacing: 0.06,
    pressure: { mode: 'gaussian', curve: [0.15, 0.4], min_max: [1.2, 0.85] }, rotate: 'natural', noise: 0.2,
  });
  // fine even contour (白描 / 界画 / tiny figures)
  K.brush.add('ink.fine', {
    type: 'default', weight: 0.42, scatter: 0.08, sharpness: 0.85, grain: 1.0, opacity: 230, spacing: 0.12,
    pressure: { mode: 'gaussian', curve: [0.35, 0.2], min_max: [1.25, 0.95] }, rotate: 'natural', noise: 0.06,
  });
  // dab: a short loaded stroke for dots and raindrop texture
  K.brush.add('ink.dab', {
    type: 'default', weight: 1.5, scatter: 0.5, sharpness: 0.75, grain: 1.6, opacity: 205, spacing: 0.08,
    pressure: [1.35, 0.55], rotate: 'natural', noise: 0.25,
  });
}

const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
const parse = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export const INK = '#15110d';

/** Ink colour for tone t over ground (ink never reads pure black on silk: it sinks into the warm ground). */
export function tone(t, ground = '#b49a72') {
  const g = parse(ground), k = parse(INK);
  const e = Math.pow(clamp(t), 0.75);
  return '#' + hex2(lerp(g[0], k[0], e)) + hex2(lerp(g[1], k[1], e)) + hex2(lerp(g[2], k[2], e));
}

export function line(K, key, pts, o = {}) {
  K.seed('ink', key);
  const b = o.dry ? 'ink.dry' : o.fine ? 'ink.fine' : 'ink.wet';
  K.brush.noFill(); K.brush.noWash(); K.brush.noHatch();
  K.brush.set(b, tone(o.t ?? 0.85, o.ground), o.w ?? 1);
  if (pts.length === 2) { K.brush.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1]); return; }
  K.brush.spline(pts, o.curv ?? 0.5);
}

/** Fast flat fill (p5.brush wash) — figures, roofs, small solid shapes. */
export function flat(K, key, poly, o = {}) {
  K.seed('flat', key);
  K.brush.noStroke(); K.brush.noFill(); K.brush.noHatch();
  K.brush.wash(o.color || tone(o.t ?? 0.4, o.ground), o.alpha ?? 255);
  K.brush.polygon(poly);
  K.brush.noWash();
}

// point in polygon (even-odd)
export function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

// ------------------------------------------------------------------ washes (Canvas2D)
const grainCache = new Map();
function grainCanvas(seed, size = 256) {
  if (grainCache.has(seed)) return grainCache.get(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(hash('grain', seed));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / 22, y / 22, seed, 3) * 0.7 + r() * 0.3;
    const k = (x + y * size) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(clamp((n - 0.35) * 1.6) * 255);
  }
  ctx.putImageData(img, 0, 0);
  grainCache.set(seed, c);
  return c;
}

/**
 * Paint ink washes into one cached Canvas2D layer of w×h px covering panel units [x0, x0 + w/pxu]×[y0, y0 + h/pxu].
 * item: { poly, t (tone), alpha (0..1), soft (blur, units), grad: {y0, y1, a0, a1} | {x0, x1, a0, a1},
 *         edge (0..1 ink pooled along the outline), gran (0..1 granulation), ground }
 */
export function washLayer(K, key, items, o = {}) {
  const pxu = o.pxu ?? 1, w = o.w ?? 1000 * pxu, h = o.h ?? 1000 * pxu;
  const ox = o.x0 ?? 0, oy = o.y0 ?? 0;            // optional region origin (panel units)
  return K.layer(key, w, h, (ctx) => {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    items.forEach((it, idx) => {
      const col = parse(tone(it.t ?? 0.5, it.ground || o.ground));
      const rgba = (a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.clearRect(0, 0, w, h);
      tc.setTransform(pxu, 0, 0, pxu, -ox * pxu, -oy * pxu);
      const path = new Path2D();
      it.poly.forEach((p, k) => (k ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
      path.closePath();
      // body of the wash (soft edge)
      tc.filter = `blur(${(it.soft ?? 4) * pxu}px)`;
      const a = it.alpha ?? 0.5;
      if (it.grad) {
        const gr = it.grad;
        const lg = gr.y0 != null ? tc.createLinearGradient(0, gr.y0, 0, gr.y1) : tc.createLinearGradient(gr.x0, 0, gr.x1, 0);
        lg.addColorStop(0, rgba(a * (gr.a0 ?? 1)));
        lg.addColorStop(1, rgba(a * (gr.a1 ?? 0)));
        tc.fillStyle = lg;
      } else tc.fillStyle = rgba(a);
      tc.fill(path);
      // ink pools at the drying edge
      if (it.edge) {
        tc.filter = `blur(${Math.max(0.6, (it.soft ?? 4) * 0.35) * pxu}px)`;
        tc.strokeStyle = rgba(Math.min(1, a * (1 + it.edge)));
        tc.lineWidth = (1.2 + it.edge * 2.2);
        tc.stroke(path);
      }
      tc.filter = 'none';
      // granulation: knock out speckles inside the wash
      if (it.gran) {
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalCompositeOperation = 'destination-out';
        tc.globalAlpha = it.gran;
        const pat = tc.createPattern(grainCanvas(hash(key, idx) % 7), 'repeat');
        tc.fillStyle = pat;
        tc.fillRect(0, 0, w, h);
        tc.globalAlpha = 1;
        tc.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(tmp, 0, 0);
    });
  });
}

// ------------------------------------------------------------------ texture strokes
/**
 * Texture strokes scattered inside poly, clumped by noise so they read as rock structure.
 * kinds: 'rain' 雨点皴 (short near-vertical dabs), 'axe' 斧劈皴 (slanting dry strokes), 'hemp' 披麻皴 (long soft lines)
 * o.density(x, y) → 0..1 extra modulation.
 */
export function cun(K, key, poly, o = {}) {
  const r = rng(hash('cun', key));
  const b = bbox(poly);
  const n = o.n ?? 400;
  const size = o.size ?? 4;
  const kind = o.kind || 'rain';
  const clump = o.clump ?? 0.6;
  const seedN = hash(key) % 997;
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 10) {
    tries++;
    const p = [b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * (b.y1 - b.y0)];
    if (!inside(p, poly)) continue;
    const cl = fbm(p[0] * 0.03, p[1] * 0.03, seedN, 3);
    const d = (o.density ? o.density(p[0], p[1]) : 1) * (1 - clump + clump * clamp((cl - 0.35) * 2.5));
    if (r() > d) continue;
    const t = (o.t ?? 0.8) * (0.7 + 0.45 * r()) * (0.85 + 0.3 * cl);
    K.seed('cun', key, placed);
    if (kind === 'rain') {
      const L = size * (0.5 + r() * 0.9);
      const a = Math.PI / 2 + (r() - 0.5) * 0.6;
      K.brush.set('ink.dab', tone(t, o.ground), (o.w ?? 0.5) * (0.6 + r() * 0.7));
      K.brush.line(p[0], p[1], p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L);
    } else if (kind === 'axe') {
      const L = size * (1 + r() * 1.6);
      const a = (o.angle ?? Math.PI * 0.64) + (r() - 0.5) * 0.25;
      K.brush.set('ink.dry', tone(t, o.ground), (o.w ?? 0.9) * (0.6 + r() * 0.7));
      K.brush.line(p[0], p[1], p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L);
    } else {
      const L = size * (2 + r() * 3);
      const a = Math.PI / 2 + (r() - 0.5) * 0.35;
      K.brush.set('ink.dry', tone(t, o.ground), (o.w ?? 0.5) * (0.6 + r() * 0.5));
      K.brush.spline([p, [p[0] + Math.cos(a) * L * 0.5 + (r() - 0.5) * 3, p[1] + Math.sin(a) * L * 0.5], [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L]], 0.6);
    }
    placed++;
  }
  return placed;
}

export function dots(K, key, pts, o = {}) {
  const r = rng(hash('dots', key));
  pts.forEach((p, i) => {
    K.seed('dot', key, i);
    const s = (o.size ?? 3) * (0.6 + r() * 0.8);
    const a = (o.angle ?? -0.6) + (r() - 0.5) * 0.9;
    K.brush.set('ink.dab', tone((o.t ?? 0.85) * (0.75 + r() * 0.3), o.ground), (o.w ?? 0.8) * (0.6 + r() * 0.7));
    K.brush.line(p[0], p[1], p[0] + Math.cos(a) * s, p[1] + Math.sin(a) * s);
  });
}

/** Wash polygon helper: a rough blob around (cx, cy). */
export function blob(cx, cy, rx, ry, seed, n = 14) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const m = 0.75 + 0.45 * fbm(Math.cos(a) * 1.3 + 3, Math.sin(a) * 1.3 + 3, seed, 2);
    out.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
  }
  return out;
}

/**
 * A tree rooted at (x, y), height h (panel units). Strokes are drawn now; foliage
 * wash blobs are pushed into o.washes (paint the wash layer underneath first).
 * kinds: 'pine' (fan needle clusters), 'leafy' (dot-leaf masses), 'bare' (crab-claw 蟹爪枝), 'willow'
 */
export function tree(K, key, x, y, h, o = {}) {
  const r = rng(hash('tree', key));
  const co = !!o.collectOnly;              // only push foliage washes (same random sequence, no strokes)
  const line_ = (...a) => { if (!co) line(...a); };
  const dots_ = (...a) => { if (!co) dots(...a); };
  const mark = (fn) => { if (!co) fn(); };
  const kind = o.kind || 'leafy';
  const t = o.t ?? 0.85;
  const lean = (o.lean ?? 0) + (r() - 0.5) * 0.12;
  const W = o.w ?? 1;
  const g = o.ground;
  const top = [x + Math.sin(lean) * h, y - Math.cos(lean) * h * (kind === 'pine' ? 1 : 0.92)];
  const bend = (r() - 0.5) * h * 0.14;
  const spine = smoothPath([[x, y], [lerp(x, top[0], 0.35) + bend, lerp(y, top[1], 0.35)], [lerp(x, top[0], 0.7) - bend * 0.6, lerp(y, top[1], 0.7)], top], 6);
  const tw = Math.max(1.2, h * 0.04);
  const side = (sgn) => spine.map((p, i) => [p[0] + sgn * tw * (1 - (i / spine.length) * 0.75), p[1]]);
  line_(K, key + ':tl', side(-1), { w: 0.9 * W, t, ground: g, dry: true });
  line_(K, key + ':tr', side(1), { w: 0.8 * W, t: t * 0.95, ground: g });
  // bark marks
  for (let k = 0; k < Math.round(h / 22); k++) {
    const p = spine[Math.floor(r() * spine.length * 0.8)];
    mark(() => {
      K.seed('bark', key, k);
      K.brush.set('ink.dab', tone(t * 0.8, g), 0.35 * W);
      K.brush.line(p[0] - tw * 0.5, p[1], p[0] + tw * 0.3, p[1] + tw * 0.6);
    });
  }
  const nb = kind === 'pine' ? 6 : kind === 'bare' ? 6 : 5;
  const ends = [];
  for (let k = 0; k < nb; k++) {
    const f = 0.42 + 0.55 * (k / (nb - 1));
    const base = spine[Math.min(spine.length - 1, Math.floor(f * (spine.length - 1)))];
    const sd = k % 2 ? 1 : -1;
    const L = h * (kind === 'pine' ? 0.3 : 0.26) * (1.15 - f * 0.55) * (0.8 + r() * 0.4);
    const ang = -Math.PI / 2 + sd * (kind === 'willow' ? 0.95 : 0.85 + r() * 0.45) + lean;
    const droop = kind === 'pine' ? L * 0.3 : kind === 'willow' ? L * 0.2 : -L * 0.05;
    const end = [base[0] + Math.cos(ang) * L, base[1] + Math.sin(ang) * L + droop];
    const midp = [lerp(base[0], end[0], 0.55), lerp(base[1], end[1], 0.55) - L * 0.15];
    ends.push({ base, end, sd, L });
    line_(K, `${key}:b${k}`, [base, midp, end], { w: 0.55 * W, t, ground: g, dry: kind === 'bare' });
    if (kind === 'bare') {
      for (let j = 0; j < 3; j++) {
        const s = [lerp(base[0], end[0], 0.45 + j * 0.2), lerp(base[1], end[1], 0.45 + j * 0.2)];
        const a2 = ang + sd * (0.4 + r() * 0.5) - 0.3;
        const L2 = L * (0.3 + r() * 0.2);
        const e2 = [s[0] + Math.cos(a2) * L2, s[1] + Math.sin(a2) * L2];
        line_(K, `${key}:c${k}${j}`, [s, e2, [e2[0] - sd * L2 * 0.3, e2[1] + L2 * 0.25]], { w: 0.32 * W, t, ground: g, curv: 0.7 });
      }
    }
  }
  ends.push({ base: spine[spine.length - 2], end: top, sd: 0, L: h * 0.2 });
  if (kind === 'pine') {
    ends.forEach((e, k) => {
      const cx = e.end[0], cy = e.end[1];
      const R0 = h * 0.085 * (0.85 + r() * 0.4);
      o.washes?.push({ poly: blob(cx, cy + R0 * 0.1, R0 * 1.3, R0 * 0.55, hash(key, k)), t: t * 0.6, alpha: 0.55, soft: 2, edge: 0.3, gran: 0.25 });
      // two needle wheels (松针): radiating strokes over ~250° (open at the bottom)
      for (const off of [-R0 * 0.55, R0 * 0.55]) {
        const fx = cx + off, fy = cy;
        for (let j = 0; j < 13; j++) {
          const a = Math.PI * (0.82 + 1.36 * (j / 12)) + (r() - 0.5) * 0.08;
          mark(() => {
            K.seed('ndl', key, k, off > 0 ? 1 : 0, j);
            K.brush.set('ink.fine', tone(t, g), 0.55 * W);
            K.brush.line(fx, fy, fx + Math.cos(a) * R0, fy + Math.sin(a) * R0 * 0.75);
          });
        }
      }
    });
  } else if (kind === 'leafy') {
    ends.forEach((e, k) => {
      const cx = e.end[0], cy = e.end[1];
      const big = h < 90 ? 1.45 : 1;
      const rx = h * 0.17 * big * (0.8 + r() * 0.4), ry = h * 0.1 * big * (0.8 + r() * 0.4);
      o.washes?.push({ poly: blob(cx, cy, rx, ry, hash(key, 'l', k)), t: t * 0.55, alpha: 0.6, soft: 3, edge: 0.4, gran: 0.35 });
      const pts = [];
      const n = Math.round(22 + h * 0.25);
      for (let j = 0; j < n; j++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        pts.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d]);
      }
      dots_(K, `${key}:leaf${k}`, pts, { t, size: Math.max(2.5, h * 0.03), w: Math.max(0.5, h * 0.0075) * W, ground: g });
    });
  } else if (kind === 'willow') {
    ends.forEach((e, k) => {
      for (let j = 0; j < 6; j++) {
        const s = [lerp(e.base[0], e.end[0], 0.3 + j * 0.13), lerp(e.base[1], e.end[1], 0.3 + j * 0.13)];
        const L = h * (0.25 + r() * 0.25);
        const sw = o.sway ?? 0;
        line_(K, `${key}:w${k}${j}`, [s, [s[0] + sw * 0.4 + e.sd * 4, s[1] + L * 0.5], [s[0] + sw + e.sd * 3, s[1] + L]], { w: 0.3 * W, t: t * 0.75, ground: g, curv: 0.6, fine: true });
      }
    });
  }
}

// ------------------------------------------------------------------ seals & silk
/** Red seal stamp (white characters cut into red, or red characters). Returns a cached p5.Graphics. */
export function seal(K, text, o = {}) {
  const size = o.size ?? 160;
  const mode = o.mode ?? 'white';
  return K.layer(`ink:seal:${text}:${size}:${mode}:${o.seed ?? 0}`, size, size, (ctx) => {
    const r = rng(hash('seal', text, o.seed ?? 0));
    const red = o.color || '#b4291f';
    const chars = [...text];
    const cols = chars.length > 2 ? 2 : 1, rows = Math.ceil(chars.length / cols);
    const m = size * 0.06;
    ctx.save();
    if (mode === 'white') {
      ctx.fillStyle = red;
      ctx.fillRect(m, m, size - 2 * m, size - 2 * m);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      ctx.strokeStyle = red; ctx.lineWidth = size * 0.05;
      ctx.strokeRect(m * 1.5, m * 1.5, size - 3 * m, size - 3 * m);
      ctx.fillStyle = red;
    }
    const cw = (size - 2 * m) / cols, ch = (size - 2 * m) / rows;
    ctx.font = `600 ${Math.min(cw, ch) * 0.86}px "Libian SC", "Kaiti SC", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chars.forEach((c, k) => {
      const col = cols - 1 - Math.floor(k / rows), row = k % rows;   // right column first, top to bottom
      ctx.fillText(c, m + cw * (col + 0.5), m + ch * (row + 0.52));
    });
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < size * 3; k++) {
      ctx.globalAlpha = 0.3 + r() * 0.7;
      ctx.beginPath(); ctx.arc(r() * size, r() * size, r() * size * 0.012 + 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let k = 0; k < 60; k++) {
      const side = k % 4, s = r() * size, d = r() * m * 1.2;
      const [x, y] = side === 0 ? [s, d] : side === 1 ? [s, size - d] : side === 2 ? [d, s] : [size - d, s];
      ctx.beginPath(); ctx.arc(x, y, r() * m * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}

/** Aged silk ground: warm brown, darker edges, roll creases, foxing. */
export function silk(K, o = {}) {
  const w = o.w ?? 1024, h = o.h ?? 1024;
  return K.layer(`ink:silk:${w}x${h}:${o.base}:${o.seed ?? 1}`, w, h, (ctx) => {
    const base = K.paper.sheet({ w, h, base: o.base || '#b49a72', kind: 'silk', grain: 0.7, fibers: 40, stains: 26, edge: 0.75, blotch: 0.8, seed: o.seed ?? 1, stainColor: 'rgba(90,60,25,0.16)' });
    ctx.drawImage(base.elt || base.canvas || base.drawingContext.canvas, 0, 0, w, h);
    const r = rng(hash('silkcrack', o.seed ?? 1));
    ctx.save();
    for (let k = 0; k < 14; k++) {
      const x = r() * w;
      ctx.strokeStyle = `rgba(60,40,15,${0.05 + r() * 0.07})`;
      ctx.lineWidth = 0.6 + r() * 1.2;
      ctx.beginPath();
      let y = r() * h * 0.2, xx = x;
      ctx.moveTo(xx, y);
      while (y < h) { y += 12 + r() * 30; xx += (r() - 0.5) * 3; ctx.lineTo(xx, y); }
      ctx.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const y = (0.12 + 0.18 * k + (r() - 0.5) * 0.05) * h;
      ctx.strokeStyle = `rgba(250,235,200,${0.05 + r() * 0.05})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (r() - 0.5) * 8); ctx.stroke();
    }
    ctx.restore();
  });
}
