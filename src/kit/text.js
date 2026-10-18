// Text as cached Canvas2D sprites (p5's WEBGL text needs font files; we use
// macOS system fonts through Canvas2D and draw the result as an image).

const cache = new Map();
const MAX = 300;

/**
 * Get (or build) a text sprite.
 * opts: { text, font, size, weight, style, color, align ('left'|'center'|'right'),
 *         lineHeight (×size), maxWidth, letterSpacing (px), stroke, strokeWidth,
 *         shadow: {color, blur, x, y}, vertical (CJK top-to-bottom columns), pad }
 * Returns { g, w, h, ax, ay } where (ax, ay) is the anchor offset for align/baseline.
 */
export function textSprite(opts) {
  const key = JSON.stringify(opts);
  let hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  hit = build(opts);
  cache.set(key, hit);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    const o = cache.get(oldest);
    cache.delete(oldest);
    try { o.g.remove(); } catch {}
  }
  return hit;
}

function fontString(o) {
  return `${o.style || 'normal'} ${o.weight || 400} ${o.size}px ${o.font || '"Songti SC", serif'}`;
}

function build(o) {
  const size = o.size || 32;
  const lh = (o.lineHeight || 1.25) * size;
  const pad = o.pad ?? Math.ceil(size * 0.4 + (o.shadow ? (o.shadow.blur || 0) * 2 : 0) + (o.strokeWidth || 0));
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = fontString(o);
  if (o.letterSpacing) meas.letterSpacing = o.letterSpacing + 'px';
  const lines = String(o.text).split('\n');
  let w, h;
  if (o.vertical) {
    // each line becomes a column, read right-to-left
    const colW = size * 1.15;
    const maxChars = Math.max(...lines.map((l) => [...l].length));
    w = Math.ceil(colW * lines.length + pad * 2);
    h = Math.ceil(maxChars * size * (o.lineHeight || 1.08) + pad * 2);
  } else {
    const widths = lines.map((l) => meas.measureText(l).width);
    w = Math.ceil(Math.max(1, ...widths) + pad * 2);
    h = Math.ceil(lh * lines.length + pad * 2);
  }
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  const ctx = g.drawingContext;
  ctx.clearRect(0, 0, w, h);
  ctx.font = fontString(o);
  if (o.letterSpacing) ctx.letterSpacing = o.letterSpacing + 'px';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color || '#000';
  if (o.shadow) {
    ctx.shadowColor = o.shadow.color || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = o.shadow.blur || 0;
    ctx.shadowOffsetX = o.shadow.x || 0;
    ctx.shadowOffsetY = o.shadow.y || 0;
  }
  if (o.vertical) {
    const colW = size * 1.15;
    ctx.textAlign = 'center';
    lines.forEach((line, ci) => {
      const cx = w - pad - colW * (ci + 0.5);
      [...line].forEach((ch, k) => {
        const y = pad + size * (o.lineHeight || 1.08) * k + size * 0.88;
        if (o.stroke) { ctx.lineWidth = o.strokeWidth || 2; ctx.strokeStyle = o.stroke; ctx.strokeText(ch, cx, y); }
        ctx.fillText(ch, cx, y);
      });
    });
  } else {
    const align = o.align || 'left';
    ctx.textAlign = align;
    const x = align === 'center' ? w / 2 : align === 'right' ? w - pad : pad;
    lines.forEach((line, k) => {
      const y = pad + lh * k + size * 0.9;
      if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.strokeWidth || 2; ctx.strokeStyle = o.stroke; ctx.strokeText(line, x, y); }
      ctx.fillText(line, x, y);
    });
  }
  const align = o.align || 'left';
  const ax = align === 'center' ? w / 2 : align === 'right' ? w - pad : pad;
  return { g, w, h, ax, ay: pad, pad };
}

/**
 * Draw text with the current p5 transform. (x, y) is the top of the first line,
 * horizontally anchored by `align`. `scale` maps sprite pixels to current units.
 */
export function drawText(opts, x, y, scale = 1, alpha = 1) {
  const s = textSprite(opts);
  push();
  if (alpha < 1) tint(255, 255 * alpha);
  imageMode(CORNER);
  image(s.g, x - s.ax * scale, y - s.ay * scale, s.w * scale, s.h * scale);
  pop();
  return s;
}
