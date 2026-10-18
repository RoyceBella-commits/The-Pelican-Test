#!/usr/bin/env node
// Render the score offline (same code as the preview page) → audio/mix.wav
//   node tools/audio.mjs                 full mix
//   node tools/audio.mjs --only bell --out work/bell.wav     a single layer (sync checks)
//   node tools/audio.mjs --from 0 --to 20
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(ROOT, a.out || 'audio/mix.wav');
const srv = await startServer(0);
const { browser, close } = await launch({ width: 640, height: 360 });
try {
  const { page } = await openPage(browser, `${srv.url}/film.html`);
  const t0 = Date.now();
  const info = await page.evaluate(async (o) => {
    const { renderScore } = await import('/audio/engine.js');
    const { wavBytes } = await import('/audio/dsp.js');
    const buf = await renderScore({ from: o.from, to: o.to, only: o.only, scenes: window.film.scenes });
    const bytes = wavBytes(buf);
    // peak / rms for the report
    let peak = 0, sum = 0; const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
    window.__wav = bytes;
    return { len: bytes.length, seconds: buf.duration, peak, rms: Math.sqrt(sum / d.length) };
  }, { from: a.from != null ? +a.from : undefined, to: a.to != null ? +a.to : undefined, only: a.only ? String(a.only).split(',') : undefined });
  // pull the bytes in chunks (one huge evaluate result is fragile)
  const CH = 4 * 1024 * 1024;
  const parts = [];
  for (let off = 0; off < info.len; off += CH) {
    const b64 = await page.evaluate((o, n) => {
      const sub = window.__wav.subarray(o, o + n);
      let s = ''; for (let i = 0; i < sub.length; i += 0x8000) s += String.fromCharCode.apply(null, sub.subarray(i, i + 0x8000));
      return btoa(s);
    }, off, CH);
    parts.push(Buffer.from(b64, 'base64'));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat(parts));
  console.log(`${path.relative(ROOT, out)}  ${info.seconds.toFixed(2)} s  peak ${info.peak.toFixed(3)}  rms ${info.rms.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} finally {
  await close();
  await srv.close();
}
