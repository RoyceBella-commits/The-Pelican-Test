// Placeholder panel used until a scene is built (and as the fallback when a
// scene file fails to load or throws). Shows the panel's name and the pen rider.
export function placeholderRender(meta) {
  return function render(K, u, ctx) {
    const c = meta.color || '#777777';
    noStroke();
    fill(c);
    rect(0, 0, 1000, 1000);
    // soft horizon + ground
    fill(255, 255, 255, 22);
    rect(0, 0, 1000, 520);
    fill(0, 0, 0, 30);
    rect(0, 800, 1000, 200);
    // road line
    stroke(0, 0, 0, 90);
    strokeWeight(3);
    line(0, 800, 1000, 800);
    noStroke();
    const n = String(meta.index + 1).padStart(2, '0');
    K.text({ text: n, font: '"Bodoni 72", "Didot", serif', size: 150, color: 'rgba(255,255,255,0.22)', align: 'left' }, 40, 30, 1);
    K.text({ text: meta.title.zh, font: '"Kaiti SC", "Songti SC", serif', size: 92, color: 'rgba(255,255,255,0.92)', align: 'center',
      shadow: { color: 'rgba(0,0,0,0.25)', blur: 6, y: 2 } }, 500, 250, 1);
    K.text({ text: meta.title.en, font: '"Baskerville", serif', style: 'italic', size: 40, color: 'rgba(255,255,255,0.85)', align: 'center' }, 500, 370, 1);
    K.text({ text: `${meta.year.zh}  ·  ${meta.year.en}`, font: '"Songti SC", serif', size: 30, color: 'rgba(255,255,255,0.7)', align: 'center' }, 500, 430, 1);
    if (ctx.error) {
      K.text({ text: '⚠ ' + String(ctx.error).slice(0, 60), font: 'Menlo, monospace', size: 22, color: '#ffe0e0', align: 'center' }, 500, 520, 1);
    }
    if (ctx.rider.visible) K.rig.drawPen(ctx.rider.placed, { key: meta.id + ':rider' });
  };
}
