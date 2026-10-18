#!/usr/bin/env node
// Render stills. Each run uses its own server port + Chrome profile (safe to run in parallel).
//
//   node tools/shot.mjs --t 0,3,5.2              film times (s)
//   node tools/shot.mjs --f 150,300              film frames
//   node tools/shot.mjs --solo song --u 1,3,5    one panel alone, local time u
//   node tools/shot.mjs --scene song --u 0,3     film framing at sceneStart + u
//   node tools/shot.mjs --seam song              film framing at u = −0.5, 0, 0.5, 5.5, 6, 6.5
// Options: --out work/shots  --debug  --scale 0.5  --prefix name
// Prints one line per still: label, ms, brush strokes, scene errors.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs, nums } from './lib/args.mjs';

const a = parseArgs(process.argv.slice(2));
const outDir = path.resolve(ROOT, a.out || 'work/shots');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [];
const idOf = (s) => s;
if (a.t) for (const t of nums(a.t)) jobs.push({ kind: 'film', t, label: `t${t.toFixed(2)}` });
if (a.f) for (const f of nums(a.f)) jobs.push({ kind: 'film', t: f / 30, label: `f${String(f).padStart(5, '0')}` });
if (a.solo) for (const u of nums(a.u ?? '0.5,3,5.5')) jobs.push({ kind: 'solo', id: idOf(a.solo), u, label: `${a.solo}_solo_u${u.toFixed(2)}` });
if (a.scene) for (const u of nums(a.u ?? '0,1,2,3,4,5')) jobs.push({ kind: 'scene', id: a.scene, u, label: `${a.scene}_u${u.toFixed(2)}` });
if (a.seam) for (const u of [-0.5, 0, 0.5, 5.5, 6, 6.5]) jobs.push({ kind: 'scene', id: a.seam, u, label: `${a.seam}_seam_u${u.toFixed(2)}` });
if (!jobs.length) {
  console.log('nothing to render; see header of tools/shot.mjs for usage');
  process.exit(1);
}

const srv = await startServer(0);
const { browser, close } = await launch();
let failed = false;
try {
  const q = a.debug ? '?debug=1' : '';
  const { page } = await openPage(browser, `${srv.url}/film.html${q}`);
  for (const j of jobs) {
    let res;
    if (j.kind === 'film') {
      res = await page.evaluate((t, dbg) => window.renderAt(t, { debug: dbg }), j.t, !!a.debug);
    } else {
      const idx = await page.evaluate((id) => (id === 'intro' ? -1 : window.sceneIndexById(id)), j.id);
      if (idx < -1) throw new Error(`unknown scene id: ${j.id}`);
      if (j.kind === 'solo') res = await page.evaluate((i, u, dbg) => window.renderSolo(i, u, { debug: dbg }), idx, j.u, !!a.debug);
      else res = await page.evaluate((i, u, dbg) => window.renderAt(window.TL.sceneStart(i) + u, { debug: dbg }), idx, j.u, !!a.debug);
    }
    const file = path.join(outDir, `${a.prefix ? a.prefix + '_' : ''}${j.label}.png`);
    const scale = a.scale ? +a.scale : 1;
    await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080, scale } });
    const err = res.error ? `  ERROR ${res.error}` : '';
    if (res.error) failed = true;
    console.log(`${path.relative(ROOT, file)}  ${res.ms.toFixed(0)} ms  ${res.strokes} strokes${err}`);
  }
} finally {
  await close();
  await srv.close();
}
process.exit(failed ? 2 : 0);
