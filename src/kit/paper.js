// Procedural grounds: paper, xuan paper, silk, rock, papyrus, canvas.
// Built once with Canvas2D (pixel noise + tiled grain + stains) and cached.
import { hash, rng, fbm, noise2 } from './math.js';

const cache = new Map();

/** A seamless greyscale grain tile (value noise on a periodic lattice). */
function grainTile(seed, size = 256, scale = 32, contrast = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const P = scale; // lattice period in cells
  const lat = (ix, iy) => (hash(((ix % P) + P) % P, ((iy % P) + P) % P, seed) / 4294967296);
  const fade = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
    const a = lat(ix, iy), b = lat(ix + 1, iy), cc = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
    return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy;
  };
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P, v = (y / size) * P;
      let n = vn(u, v) * 0.55 + vn(u * 2, v * 2) * 0.3 + (r() - 0.5) * 0.35;
      n = 0.5 + (n - 0.45) * contrast;
      const k = (x + y * size) * 4;
      const val = Math.max(0, Math.min(255, n * 255));
      img.data[k] = img.data[k + 1] = img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A sheet of paper-like ground as a p5.Graphics (2D).
 * opts: { w, h, base: '#rrggbb', grain: 0..1, fibers: n, stains: n, stainColor, edge: 0..1 (vignette),
 *         seed, kind: 'paper'|'xuan'|'silk'|'rock'|'papyrus'|'canvas' }
 */
export function sheet(opts) {
  const key = JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const { w, h } = opts;
  const seed = opts.seed ?? 1;
  const kind = opts.kind || 'paper';
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  const ctx = g.drawingContext;
  ctx.fillStyle = opts.base || '#efe6d2';
  ctx.fillRect(0, 0, w, h);
  const r = rng(hash('sheet', seed));

  // large soft tone variation
  const blot = opts.blotch ?? 0.5;
  for (let k = 0; k < 18; k++) {
    const x = r() * w, y = r() * h, rad = (0.15 + r() * 0.35) * Math.max(w, h);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    grd.addColorStop(0, dark ? `rgba(90,60,20,${0.05 * blot})` : `rgba(255,255,245,${0.07 * blot})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  // tiled grain (multiply-ish via overlay alpha)
  const grain = opts.grain ?? 0.5;
  if (grain > 0) {
    const tile = grainTile(hash('grain', kind, seed), 256, kind === 'rock' ? 12 : kind === 'canvas' ? 64 : 40, kind === 'rock' ? 1.6 : 1.1);
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.18 * grain;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08 * grain;
    ctx.translate(97, 53);
    ctx.fillRect(-97, -53, w, h);
    ctx.restore();
  }

  // weave for silk / canvas
  if (kind === 'silk' || kind === 'canvas') {
    ctx.save();
    ctx.globalAlpha = kind === 'silk' ? 0.05 : 0.08;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    const step = kind === 'silk' ? 3 : 4;
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    ctx.globalAlpha *= 0.7;
    for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.restore();
  }

  // fibres (xuan / paper / papyrus strips)
  const fibers = opts.fibers ?? (kind === 'xuan' ? 260 : kind === 'paper' ? 90 : 0);
  ctx.save();
  for (let k = 0; k < fibers; k++) {
    const x = r() * w, y = r() * h, L = 8 + r() * (kind === 'xuan' ? 60 : 30), a = r() * Math.PI * 2;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(80,60,30,0.10)' : 'rgba(255,255,250,0.25)';
    ctx.lineWidth = 0.5 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * L * 0.5, y + Math.sin(a + 0.6) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
    ctx.stroke();
  }
  if (kind === 'papyrus') {
    for (let y = 0; y < h; y += 6 + r() * 6) {
      ctx.strokeStyle = `rgba(110,80,30,${0.05 + r() * 0.08})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (r() - 0.5) * 4); ctx.stroke();
    }
    for (let x = 0; x < w; x += 10 + r() * 12) {
      ctx.strokeStyle = `rgba(110,80,30,${0.03 + r() * 0.05})`;
      ctx.lineWidth = 1 + r() * 3;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - 0.5) * 4, h); ctx.stroke();
    }
  }
  ctx.restore();

  // stains / foxing
  const stains = opts.stains ?? 6;
  for (let k = 0; k < stains; k++) {
    const x = r() * w, y = r() * h, rad = 6 + r() * 40;
    const grd = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    grd.addColorStop(0, opts.stainColor || 'rgba(140,95,40,0.10)');
    grd.addColorStop(0.8, 'rgba(140,95,40,0.04)');
    grd.addColorStop(1, 'rgba(140,95,40,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }

  // edge darkening
  const edge = opts.edge ?? 0.4;
  if (edge > 0) {
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(70,45,15,${0.35 * edge})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  const img = g.get();          // frozen p5.Image (has .canvas); uploads to the GPU once
  g.remove();
  cache.set(key, img);
  return img;
}

/** Fill a Canvas2D context region with fbm-modulated colour (used for rock and plaster). */
export function noiseFill(ctx, w, h, { seed = 1, scale = 0.01, colors = ['#7a5230', '#a8774a'], step = 2 } = {}) {
  const parse = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const A = parse(colors[0]), B = parse(colors[1]);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = fbm(x * scale, y * scale, seed, 4);
      const t = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
      ctx.fillStyle = `rgb(${A[0] + (B[0] - A[0]) * t | 0},${A[1] + (B[1] - A[1]) * t | 0},${A[2] + (B[2] - A[2]) * t | 0})`;
      ctx.fillRect(x, y, step, step);
    }
  }
}

export { noise2 };
