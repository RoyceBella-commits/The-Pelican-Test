// Museum frame kit. Every frame is a 40-unit ring around a panel interior.
// Styles are painted once with Canvas2D into a cached sprite and drawn with
// the camera transform, so they cost one image() per visible panel.
import { hash, rng, noise2 } from './math.js';
import { FRAME_W } from '../beat/timeline.js';

export const STYLES = ['gilt', 'wood', 'darkwood', 'stone', 'mount', 'film', 'monitor', 'phone', 'paper'];
const PXU = 1.2;            // sprite pixels per world unit
const cache = new Map();

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

// Draw one bevel band [a, b] (fractions of the ring width, 0 = outer edge)
// as four mitred trapezoids lit from the top-left.
function band(ctx, W, H, F, a, b, color, relief = 0.18) {
  const o = a * F, i = b * F;
  const sides = [
    { k: relief, pts: [[o, o], [W - o, o], [W - i, i], [i, i]] },              // top
    { k: relief * 0.45, pts: [[o, o], [i, i], [i, H - i], [o, H - o]] },       // left
    { k: -relief * 0.8, pts: [[o, H - o], [i, H - i], [W - i, H - i], [W - o, H - o]] }, // bottom
    { k: -relief * 0.5, pts: [[W - o, o], [W - o, H - o], [W - i, H - i], [W - i, i]] }, // right
  ];
  for (const s of sides) {
    ctx.fillStyle = shade(color, s.k);
    ctx.beginPath();
    s.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
  }
}

function ringClip(ctx, W, H, F) {
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(F, F, W - 2 * F, H - 2 * F);
  ctx.clip('evenodd');
}

const PAINTERS = {
  gilt(ctx, W, H, F, r) {
    band(ctx, W, H, F, 0, 0.12, '#5a3d12', 0.3);
    band(ctx, W, H, F, 0.12, 0.38, '#c9a14a', 0.35);
    band(ctx, W, H, F, 0.38, 0.62, '#9c7426', 0.3);
    band(ctx, W, H, F, 0.62, 0.84, '#d8b55e', 0.4);
    band(ctx, W, H, F, 0.84, 1.0, '#6b4a17', 0.3);
    // bead-and-reel ornament along the middle band
    ctx.save(); ringClip(ctx, W, H, F);
    const m = 0.5 * F, step = 9 * PXU;
    const bead = (x, y) => {
      const grd = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 3.2 * PXU);
      grd.addColorStop(0, '#fff2bd'); grd.addColorStop(0.5, '#caa04a'); grd.addColorStop(1, '#6d4c18');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, 2.8 * PXU, 0, Math.PI * 2); ctx.fill();
    };
    for (let x = m; x < W - m; x += step) { bead(x, m); bead(x, H - m); }
    for (let y = m + step; y < H - m; y += step) { bead(m, y); bead(W - m, y); }
    // patina speckle
    for (let k = 0; k < 2500; k++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(60,40,10,0.18)' : 'rgba(255,240,190,0.15)';
      const side = r() * 4 | 0, s = r();
      const d = r() * F;
      const [x, y] = side === 0 ? [s * W, d] : side === 1 ? [s * W, H - d] : side === 2 ? [d, s * H] : [W - d, s * H];
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.restore();
  },
  wood(ctx, W, H, F, r, dark = false) {
    const base = dark ? '#2e1d12' : '#6b4526';
    band(ctx, W, H, F, 0, 0.75, base, 0.22);
    band(ctx, W, H, F, 0.75, 0.88, dark ? '#4a3220' : '#8a6038', 0.3);
    band(ctx, W, H, F, 0.88, 1.0, dark ? '#1a100a' : '#3d2614', 0.2);
    ctx.save(); ringClip(ctx, W, H, F);
    // grain: long wavy lines following each side
    ctx.lineWidth = 1;
    for (let k = 0; k < 70; k++) {
      const d = r() * F * 0.75, a = 0.05 + r() * 0.12;
      ctx.strokeStyle = r() < 0.6 ? `rgba(20,10,0,${a})` : `rgba(255,220,170,${a * 0.6})`;
      const ph = r() * 100;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, d + Math.sin(x * 0.01 + ph) * 2 + noise2(x * 0.02, k) * 3);
      ctx.stroke();
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H - d + Math.sin(x * 0.012 + ph) * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) ctx.lineTo(d + Math.sin(y * 0.01 + ph) * 2, y);
      ctx.stroke();
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) ctx.lineTo(W - d + Math.sin(y * 0.011 + ph) * 2, y);
      ctx.stroke();
    }
    ctx.restore();
  },
  darkwood(ctx, W, H, F, r) { PAINTERS.wood(ctx, W, H, F, r, true); },
  stone(ctx, W, H, F, r) {
    // rough rock surround: irregular outer and inner edges
    ctx.save();
    ctx.fillStyle = '#5b4636';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    // jagged inner edge (counter-clockwise for the hole)
    const pts = [];
    const n = 160;
    for (let k = 0; k < n; k++) {
      const s = k / n;
      let x, y;
      if (s < 0.25) { x = F + s * 4 * (W - 2 * F); y = F; }
      else if (s < 0.5) { x = W - F; y = F + (s - 0.25) * 4 * (H - 2 * F); }
      else if (s < 0.75) { x = W - F - (s - 0.5) * 4 * (W - 2 * F); y = H - F; }
      else { x = F; y = H - F - (s - 0.75) * 4 * (H - 2 * F); }
      const j = (noise2(k * 0.35, 3) - 0.5) * F * 0.5;
      const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy);
      pts.push([x + (dx / L) * j * 0.6 - (dx / L) * 2, y + (dy / L) * j * 0.6 - (dy / L) * 2]);
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    // mottled rock tone
    for (let k = 0; k < 900; k++) {
      const x = r() * W, y = r() * H, rad = 2 + r() * 14;
      ctx.fillStyle = r() < 0.5 ? `rgba(30,20,12,${0.08 + r() * 0.12})` : `rgba(190,150,110,${0.05 + r() * 0.1})`;
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // inner shadow lip
    ctx.strokeStyle = 'rgba(15,8,4,0.55)'; ctx.lineWidth = 3 * PXU;
    ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
    ctx.restore();
  },
  mount(ctx, W, H, F, r) {
    // Chinese silk mounting: pale blue-grey silk with a thin brown inner border (隔水)
    band(ctx, W, H, F, 0, 0.08, '#3c3428', 0.2);
    band(ctx, W, H, F, 0.08, 0.78, '#b9c4bf', 0.06);
    band(ctx, W, H, F, 0.78, 0.86, '#8a6f4d', 0.05);
    band(ctx, W, H, F, 0.86, 1.0, '#e8dcc4', 0.04);
    ctx.save(); ringClip(ctx, W, H, F);
    // silk damask: faint cloud-scroll dots
    ctx.globalAlpha = 0.12;
    for (let k = 0; k < 1400; k++) {
      ctx.fillStyle = r() < 0.5 ? '#ffffff' : '#6f7d78';
      const x = r() * W, y = r() * H;
      ctx.fillRect(x, y, 2 + r() * 3, 1);
    }
    ctx.restore();
  },
  film(ctx, W, H, F, r) {
    ctx.fillStyle = '#121110';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(F, F, W - 2 * F, H - 2 * F); ctx.fill('evenodd');
    // sprocket holes top & bottom, edge-code dashes left & right
    ctx.fillStyle = '#d9d2c3';
    const hw = 9 * PXU, hh = 13 * PXU, step = 26 * PXU;
    for (let x = 12 * PXU; x < W - hw; x += step) {
      roundRect(ctx, x, F * 0.5 - hh / 2, hw, hh, 2.5 * PXU); ctx.fill();
      roundRect(ctx, x, H - F * 0.5 - hh / 2, hw, hh, 2.5 * PXU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(217,210,195,0.35)';
    for (let y = 30 * PXU; y < H - 30 * PXU; y += 60 * PXU) {
      ctx.fillRect(F * 0.35, y, 3 * PXU, 18 * PXU);
      ctx.fillRect(W - F * 0.35 - 3 * PXU, y + 20 * PXU, 3 * PXU, 18 * PXU);
    }
  },
  monitor(ctx, W, H, F, r) {
    ctx.save();
    roundRect(ctx, 0, 0, W, H, F * 0.7);
    ctx.clip();
    band(ctx, W, H, F, 0, 0.55, '#d6d0bf', 0.18);
    band(ctx, W, H, F, 0.55, 0.85, '#bdb6a3', 0.25);
    band(ctx, W, H, F, 0.85, 1.0, '#3a3a36', 0.1);
    ctx.restore();
    // power LED
    ctx.fillStyle = '#5bd36a';
    ctx.beginPath(); ctx.arc(W - F * 1.4, H - F * 0.45, 2.2 * PXU, 0, Math.PI * 2); ctx.fill();
  },
  phone(ctx, W, H, F, r) {
    ctx.save();
    roundRect(ctx, 0, 0, W, H, F * 1.2);
    ctx.clip();
    band(ctx, W, H, F, 0, 0.12, '#5d5f66', 0.4);
    band(ctx, W, H, F, 0.12, 1.0, '#0d0e11', 0.15);
    ctx.restore();
  },
  paper(ctx, W, H, F, r) {
    // simple black passe-partout frame for the preface sheet
    band(ctx, W, H, F, 0, 0.1, '#1d1a17', 0.2);
    band(ctx, W, H, F, 0.1, 0.8, '#2b2723', 0.18);
    band(ctx, W, H, F, 0.8, 1.0, '#11100e', 0.15);
  },
};

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Cached frame sprite for an interior of iw × ih world units. */
export function frameSprite(style, iw = 1000, ih = 1000) {
  const key = `${style}:${iw}x${ih}`;
  if (cache.has(key)) return cache.get(key);
  const F = FRAME_W * PXU;
  const W = Math.round((iw + 2 * FRAME_W) * PXU), H = Math.round((ih + 2 * FRAME_W) * PXU);
  const g = createGraphics(W, H);
  g.pixelDensity(1);
  const ctx = g.drawingContext;
  ctx.clearRect(0, 0, W, H);
  (PAINTERS[style] || PAINTERS.wood)(ctx, W, H, F, rng(hash('frame', style, iw, ih)));
  cache.set(key, g);
  return g;
}

/** Draw a frame ring around interior (x, y, iw, ih) in the current (world) transform. */
export function drawFrame(style, x, y, iw = 1000, ih = 1000, alpha = 1) {
  const g = frameSprite(style, iw, ih);
  push();
  if (alpha < 1) tint(255, 255 * alpha);
  imageMode(CORNER);
  image(g, x - FRAME_W, y - FRAME_W, iw + 2 * FRAME_W, ih + 2 * FRAME_W);
  pop();
}
