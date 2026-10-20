#!/usr/bin/env node
// Cover still: one big pelican sliced into vertical strips, each strip rendered by a different
// era's panel (same pose, same placement, so the slices line up into one bird), next to a title panel.
//
//   node tools/cover.mjs                 → out/pelican-test_cover.png (1920×1080)
//   --aspect 4:3                         → out/pelican-test_cover_4x3.png (1440×1080, title on top)
//   --scale 2                            → twice the pixels (text and outline only get sharper)
// The per-era renders are kept in work/cover/<id>.png.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs(process.argv.slice(2));
const scale = +(a.scale ?? 1);
// Two presets. styles: chronological [id, local time u]; a strip the pelican does not cross is
// "background-only": the rider is parked out of sight and the strip frames FOCUS[id] instead.
const PRESETS = {
  '16:9': {
    W: 1920, layout: 'left', band0: 730, top: 0, pxu: 1.9, X0: 500, anchorX: 1296, roadY: 985, out: 'pelican-test_cover',
    styles: [['sahara', 0.6], ['egypt', 4.5], ['han', 0.6], ['song', 0.6], ['ukiyoe', 0.6], ['starry', 0.6],
      ['scream', 0.6], ['nosferatu', 0.6], ['scope', 0.8], ['pixel', 0.6], ['vapor', 0.6], ['code', 5.5]],
  },
  '4:3': {
    W: 1440, layout: 'top', band0: 0, top: 250, pxu: 2.1, X0: 500, anchorX: 733, roadY: 990, out: 'pelican-test_cover_4x3',
    focus: { sahara: [758, 600] },   // the archer (the herd sits above the band here)
    styles: [['sahara', 0.6], ['egypt', 4.5], ['han', 0.6], ['song', 0.6], ['qingming', 0.6], ['maya', 0.6], ['mughal', 0.6],
      ['wayang', 0.6], ['ukiyoe', 0.6], ['starry', 0.6], ['scream', 0.6], ['nosferatu', 0.6], ['scope', 0.8], ['pixel', 0.6],
      ['vapor', 0.6], ['code', 5.5]],
  },
};
const FOCUS = { sahara: [500, 560], egypt: [130, 560], han: [805, 600], song: [500, 600], pixel: [560, 600], vapor: [457, 560], code: [250, 540] };
const aspect = String(a.aspect ?? '16:9');
const L0 = PRESETS[aspect];
if (!L0) { console.log(`unknown --aspect ${aspect}; use one of ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }
const LAYOUT = { ...L0, off: (1920 - L0.W) / 2 };
const n = LAYOUT.styles.length;
const edge = (k) => LAYOUT.band0 + ((LAYOUT.W - LAYOUT.band0) * k) / n;
const bird = [LAYOUT.anchorX - 175 * LAYOUT.pxu - 6, LAYOUT.anchorX + 205 * LAYOUT.pxu + 6];
const STYLES = LAYOUT.styles.map(([id, u], k) => {
  const crossed = edge(k + 1) > bird[0] && edge(k) < bird[1];
  return [id, u, crossed ? null : (L0.focus || {})[id] || FOCUS[id] || [500, 560]];
});

const workDir = path.join(ROOT, 'work/cover');
fs.mkdirSync(workDir, { recursive: true });
const srv = await startServer(0);
const { browser, close } = await launch();
try {
  const { page } = await openPage(browser, `${srv.url}/film.html`);
  for (const [id, U, focus] of STYLES) {
    const res = await page.evaluate(async (id, U, L, focus) => {
      const j = window.sceneIndexById(id);
      const TL = window.TL, film = window.film;
      const { pose, GEOM } = await import('/src/rig/pelican.js');
      const { riderAt } = await import('/src/beat/ride.js');
      // the same rider in every panel: neutral pose, fixed crank and wheel, standing at x = X0
      const crank = (2 * Math.PI * (L.X0 + TL.FRAME_W)) / TL.CRANK_DIST, wheel = (L.X0 + TL.FRAME_W) / GEOM.R;
      // a background-only strip parks the rider far away (invisible) and frames the panel's best part
      const X = focus ? -5000 : L.X0;
      const P0 = pose({ crank, wheel, t: 0, v: TL.SPEED }, {});
      film.rider = (tt) => {
        const st = { ...riderAt(tt, film.scenes), i: j, u: tt - TL.sceneStart(j), wx: TL.panelLeft(j) + X, crank, wheel, v: TL.SPEED };
        return { st, owner: j, place: { x: X, y: TL.ROAD_Y, scale: 1, rot: 0 }, mods: {}, P: P0 };
      };
      // renders are 1920 wide; the cover uses the middle L.W columns (offset L.off)
      const cx = L.X0 + 15 - (L.anchorX + L.off - 960) / L.pxu, cy = TL.ROAD_Y - (L.roadY - 540) / L.pxu;
      // a framed strip shows its focus point at the strip's own centre column
      const stripMid = L.off + L.band0 + ((L.W - L.band0) * (L.k + 0.5)) / L.n;
      const f = focus ? [focus[0] - (stripMid - 960) / L.pxu, focus[1]] : [cx, cy];
      return window.renderAt(TL.sceneStart(j) + U, { solo: j, u: U, pxu: L.pxu, focus: f });
    }, id, U, { ...LAYOUT, k: STYLES.findIndex((s) => s[0] === id), n: STYLES.length }, focus || null);
    const file = path.join(workDir, `${aspect.replace(':', 'x')}_${id}.png`);
    await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log(`${path.relative(ROOT, file)}  ${res.ms.toFixed(0)} ms${res.error ? '  ERROR ' + res.error : ''}`);
  }
  await page.close();
  // compose
  const p2 = await browser.newPage();
  await p2.setViewport({ width: LAYOUT.W, height: 1080, deviceScaleFactor: scale });
  const { styles, ...flat } = LAYOUT;
  const qs = new URLSearchParams({ ids: STYLES.map((s) => s[0]).join(','), outline: STYLES.map((s) => (s[2] ? 0 : 1)).join(','),
    prefix: aspect.replace(':', 'x'), ...Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, String(v)])) });
  await p2.goto(`${srv.url}/tools/cover.html?${qs}`, { waitUntil: 'load' });
  await p2.waitForFunction('window.__coverDone === true || !!window.__coverError', { timeout: 120000 });
  const err = await p2.evaluate(() => window.__coverError || null);
  if (err) throw new Error(err);
  const out = path.join(ROOT, 'out', `${LAYOUT.out}${scale > 1 ? '@' + scale + 'x' : ''}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p2.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: LAYOUT.W, height: 1080 } });
  console.log(path.relative(ROOT, out));
} finally {
  await close();
  await srv.close();
}
