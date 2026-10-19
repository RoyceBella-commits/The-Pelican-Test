#!/usr/bin/env node
// Balance the eras: render the score with unity era gains, measure each panel's RMS
// (its 6 s window, bells/chain included), and write audio/levels.json with the gain
// that brings every panel to the same target loudness (clamped to ±12 dB).
// Panels can opt to sit quieter/louder via BIAS (dB) below.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';

const BIAS = { song: -2, bada: -5, vapor: -2 };   // deliberately quieter eras (emptiness / dreaminess)
const srv = await startServer(0);
const { browser, close } = await launch({ width: 640, height: 360 });
try {
  const { page } = await openPage(browser, `${srv.url}/film.html`);
  const res = await page.evaluate(async () => {
    const { renderScore } = await import('/audio/engine.js');
    const buf = await renderScore({ scenes: window.film.scenes, levels: null, normalize: false });
    const TL = window.TL, sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1);
    return window.film.scenes.map((s, i) => {
      const a = Math.floor((TL.sceneStart(i) + 0.2) * sr), b = Math.floor((TL.sceneStart(i) + TL.SCENE_DUR) * sr);
      let sum = 0; for (let k = a; k < b; k++) sum += L[k] * L[k] + R[k] * R[k];
      return { id: s.id, rms: Math.sqrt(sum / (2 * (b - a))) };
    });
  });
  const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
  const sorted = res.map((r) => db(r.rms)).sort((a, b) => a - b);
  const target = sorted[Math.floor(sorted.length / 2)];          // median panel loudness
  const levels = {};
  for (const r of res) {
    const g = Math.max(-12, Math.min(12, target + (BIAS[r.id] ?? 0) - db(r.rms)));
    levels[r.id] = +Math.pow(10, g / 20).toFixed(3);
    console.log(`${r.id.padEnd(10)} ${db(r.rms).toFixed(1).padStart(6)} dB → gain ${g >= 0 ? '+' : ''}${g.toFixed(1)} dB`);
  }
  fs.writeFileSync(path.join(ROOT, 'audio/levels.json'), JSON.stringify(levels, null, 2) + '\n');
  console.log('wrote audio/levels.json (target', target.toFixed(1), 'dB)');
} finally { await close(); await srv.close(); }
