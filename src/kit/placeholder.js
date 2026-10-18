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
    // placeholder only: a small, quiet tag in the corner (real panels integrate their title into the artwork)
    const n = String(meta.index + 1).padStart(2, '0');
    K.text({ text: `${n}  ${meta.title.zh}`, font: '"Songti SC", serif', weight: 600, size: 34, color: 'rgba(255,255,255,0.55)' }, 34, 30, 1);
    K.text({ text: `${meta.title.en} · ${meta.year.en}`, font: '"Baskerville", serif', style: 'italic', size: 20, color: 'rgba(255,255,255,0.45)' }, 34, 78, 1);
    if (ctx.error) {
      K.text({ text: '⚠ ' + String(ctx.error).slice(0, 60), font: 'Menlo, monospace', size: 22, color: '#ffe0e0', align: 'center' }, 500, 520, 1);
    }
    if (ctx.rider.visible) K.rig.drawPen(ctx.rider.placed, { key: meta.id + ':rider' });
  };
}
