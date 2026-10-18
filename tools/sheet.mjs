#!/usr/bin/env node
// Contact sheets: render thumbnails and tile them into one labelled image.
//
//   node tools/sheet.mjs --film                       whole film, one frame per second
//   node tools/sheet.mjs --scene song                 that panel's window, u = −0.5 … 6.5 every 0.5 s (film framing)
//   node tools/sheet.mjs --solo song                  the panel alone, u = 0 … 6 every 0.5 s
//   node tools/sheet.mjs --from 120 --to 137 --step 0.5
// Options: --cols 6  --thumb 480  --out work/sheets/<name>.jpg  --frames dir (use rendered frames instead of rendering)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs(process.argv.slice(2));
const FPS = 30;
let items = [];   // { t?, solo?, u?, label }
let name = 'sheet';
let cols = +(a.cols ?? 6);
const thumb = +(a.thumb ?? 480);

const range = (x0, x1, st) => { const r = []; for (let x = x0; x <= x1 + 1e-9; x += st) r.push(+x.toFixed(4)); return r; };

const srv = await startServer(0);
const { browser, close } = await launch();
const { page } = await openPage(browser, `${srv.url}/film.html`);
const meta = await page.evaluate(() => window.film.scenes.map((s) => ({ id: s.id, zh: s.title.zh, i: s.index })));
const sceneIdx = (id) => { const m = meta.find((s) => s.id === id); if (!m) throw new Error('unknown scene ' + id); return m.i; };
const nameAt = (t) => {
  if (t < 5) return '序';
  if (t >= 125) return '尾声';
  const i = Math.floor((t - 5) / 6);
  return `${String(i + 1).padStart(2, '0')} ${meta[i].zh}`;
};

if (a.film) {
  name = 'film';
  cols = +(a.cols ?? 10);
  items = range(0, 136.9, +(a.step ?? 1)).map((t) => ({ t, label: `${t.toFixed(1)}s  ${nameAt(t)}` }));
} else if (a.scene) {
  name = a.scene;
  const i = sceneIdx(a.scene), T0 = 5 + 6 * i;
  items = range(+(a.u0 ?? -0.5), +(a.u1 ?? 6.5), +(a.step ?? 0.5)).map((u) => ({ t: T0 + u, label: `u ${u.toFixed(2)}   t ${(T0 + u).toFixed(2)}` }));
} else if (a.solo) {
  name = a.solo + '_solo';
  const i = sceneIdx(a.solo);
  items = range(+(a.u0 ?? 0), +(a.u1 ?? 6), +(a.step ?? 0.5)).map((u) => ({ solo: i, u, label: `${a.solo}  u ${u.toFixed(2)}` }));
} else {
  name = `t${a.from}-${a.to}`;
  items = range(+(a.from ?? 0), +(a.to ?? 137), +(a.step ?? 1)).map((t) => ({ t, label: `${t.toFixed(2)}s  ${nameAt(t)}` }));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pelican-sheet-'));
let worst = { ms: 0 }, maxStrokes = 0;
const errs = new Set();
for (let k = 0; k < items.length; k++) {
  const it = items[k];
  const labelSize = Math.round(17 * 1920 / thumb);
  const res = it.solo != null
    ? await page.evaluate((i, u, label, labelSize) => window.renderSolo(i, u, { label, labelSize }), it.solo, it.u, it.label, labelSize)
    : await page.evaluate((t, label, labelSize) => window.renderAt(t, { label, labelSize }), it.t, it.label, labelSize);
  if (res.ms > worst.ms) worst = { ms: res.ms, label: it.label };
  maxStrokes = Math.max(maxStrokes, res.strokes);
  if (res.error) errs.add(res.error);
  await page.screenshot({ path: path.join(tmp, `${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: thumb / 1920 } });
}
await close();
await srv.close();

// tile with labels (one ffmpeg graph)
const rows = Math.ceil(items.length / cols);
const outFile = path.resolve(ROOT, a.out || `work/sheets/${name}.jpg`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const args = ['-loglevel', 'error', '-y'];
items.forEach((_, k) => args.push('-i', path.join(tmp, `${String(k).padStart(4, '0')}.jpg`)));
let fc = '';
items.forEach((_, k) => { fc += `[${k}]null[v${k}];`; });
// pad to a full grid with black frames
const blanks = rows * cols - items.length;
for (let b = 0; b < blanks; b++) fc += `color=c=#111111:s=${thumb}x${Math.round((thumb * 9) / 16)}:d=1[b${b}];`;
const all = items.map((_, k) => `[v${k}]`).join('') + Array.from({ length: blanks }, (_, b) => `[b${b}]`).join('');
fc += `${all}concat=n=${items.length + blanks}:v=1:a=0,tile=${cols}x${rows}:padding=4:margin=4:color=#111111[out]`;
args.push('-filter_complex', fc, '-map', '[out]', '-frames:v', '1', '-q:v', '3', outFile);
const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(`${path.relative(ROOT, outFile)}  (${items.length} thumbs, slowest ${worst.ms.toFixed(0)} ms at ${worst.label}, max ${maxStrokes} strokes)`);
for (const e of errs) console.log('  ERROR', e);
process.exit(errs.size ? 2 : 0);
