#!/usr/bin/env node
// Render film frames with several headless Chromes (frames interleaved across workers).
//
//   node tools/render.mjs                      all 4110 frames → frames/f00000.png …
//   node tools/render.mjs --from 0 --to 899    a frame range (inclusive)
//   node tools/render.mjs --draft              1280×720 JPEGs → frames_draft/ (for the preview's smooth mode)
//   --workers 6   --resume (skip existing files)   --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs } from './lib/args.mjs';

const FPS = 30, FRAMES = 4110;
const a = parseArgs(process.argv.slice(2));
const draft = !!a.draft;
const from = +(a.from ?? 0), to = Math.min(FRAMES - 1, +(a.to ?? FRAMES - 1));
const workers = +(a.workers ?? 6);
const outDir = path.resolve(ROOT, a.out || (draft ? 'frames_draft' : 'frames'));
fs.mkdirSync(outDir, { recursive: true });
const ext = draft ? 'jpg' : 'png';
const fileOf = (n) => path.join(outDir, `f${String(n).padStart(5, '0')}.${ext}`);

const todo = [];
for (let n = from; n <= to; n++) if (!(a.resume && fs.existsSync(fileOf(n)))) todo.push(n);
console.log(`rendering ${todo.length} frames (${from}–${to}) with ${workers} workers → ${path.relative(ROOT, outDir)}`);
if (!todo.length) process.exit(0);

const srv = await startServer(0);
let done = 0, failed = 0;
const t0 = Date.now();
const errors = new Map();

async function worker(k) {
  const mine = todo.filter((_, i) => i % workers === k);
  if (!mine.length) return;
  const { browser, close } = await launch();
  try {
    const { page } = await openPage(browser, `${srv.url}/film.html`);
    for (const n of mine) {
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await page.evaluate((t) => window.renderAt(t), n / FPS);
          if (res.error) errors.set(res.error.split(':')[0], res.error);
          const clip = { x: 0, y: 0, width: 1920, height: 1080, scale: draft ? 2 / 3 : 1 };
          await page.screenshot({ path: fileOf(n), type: draft ? 'jpeg' : 'png', quality: draft ? 88 : undefined, clip, optimizeForSpeed: true });
          ok = true;
        } catch (e) {
          if (attempt === 2) { console.error(`frame ${n} failed:`, e.message); failed++; }
        }
      }
      done++;
      if (done % 60 === 0 || done === todo.length) {
        const el = (Date.now() - t0) / 1000;
        const eta = (el / done) * (todo.length - done);
        console.log(`  ${done}/${todo.length}  ${(done / el).toFixed(1)} fps  eta ${Math.round(eta)} s`);
      }
    }
  } finally {
    await close();
  }
}

await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
await srv.close();
const el = (Date.now() - t0) / 1000;
console.log(`done in ${el.toFixed(0)} s (${(todo.length / el).toFixed(1)} fps), ${failed} failed`);
for (const [id, e] of errors) console.log(`  scene error — ${e}`);
process.exit(failed ? 1 : 0);
