#!/usr/bin/env node
// Project checks. Exit code ≠ 0 if anything fails.
//   1. banned APIs in deterministic code (Math.random, Date, performance.now)
//   2. in-page contract checks: ride profiles, seam contract (path/mods/camera), crossing table
//   3. determinism: the same frames rendered in order vs shuffled in a fresh browser must match pixel-for-pixel
// Options: --quick (skip determinism)  --frames 60 (sample size)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer, ROOT } from './server.mjs';
import { launch, openPage } from './lib/browser.mjs';
import { parseArgs } from './lib/args.mjs';
import { rng } from '../src/kit/math.js';
import * as TL from '../src/beat/timeline.js';

const a = parseArgs(process.argv.slice(2));
let failed = false;
const fail = (m) => { failed = true; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// ---------------------------------------------------------------- 1. banned APIs
console.log('1. banned APIs');
const deterministic = ['src/kit', 'src/rig', 'src/beat', 'src/scenes', 'src/main/film.js', 'src/main/camera.js', 'src/main/intro.js', 'src/main/outro.js', 'audio'];
const files = [];
const walk = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isDirectory()) { for (const f of fs.readdirSync(abs)) if (!f.startsWith('._')) walk(path.join(p, f)); }
  else if (/\.m?js$/.test(p)) files.push(p);
};
deterministic.forEach(walk);
const banned = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/, /performance\.now\s*\(/];
let hits = 0;
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((l, k) => {
    const code = l.replace(/\/\/.*$/, '');
    for (const re of banned) if (re.test(code)) { fail(`${f}:${k + 1}  ${l.trim()}`); hits++; }
  });
}
if (!hits) ok(`${files.length} files clean`);

// ---------------------------------------------------------------- 2. contracts
console.log('2. contracts');
const srv = await startServer(0);
let A = await launch();
let pageA = (await openPage(A.browser, `${srv.url}/film.html`)).page;
const rep = await pageA.evaluate(() => window.selfCheck());
rep.errors.forEach(fail);
rep.warnings.forEach((w) => console.log('  ! ' + w));
if (!rep.errors.length) ok('ride profiles, seam contract and crossings');
console.log('   crossing  t(s)   frame   x       crank°  downbeat');
for (const c of rep.crossings) console.log(`   ${String(c.i).padStart(2)}       ${c.t.toFixed(1).padStart(5)}  ${String(c.frame).padStart(5)}   ${String(c.x).padStart(6)}  ${String(c.crankDeg).padStart(6)}  ${c.downbeat ? 'yes' : 'NO'}`);

// ---------------------------------------------------------------- 3. determinism
if (!a.quick) {
  console.log('3. determinism');
  const R = rng('check');
  const frames = new Set();
  for (let i = 0; i < 20; i++) { const f = Math.round(TL.sceneStart(i) * TL.FPS); frames.add(f - 1); frames.add(f); frames.add(f + 1); }
  while (frames.size < +(a.frames ?? 80)) frames.add(Math.floor(R() * TL.FRAMES));
  const list = [...frames].sort((x, y) => x - y);
  const shot = async (page, f) => {
    await page.evaluate((t) => window.renderAt(t), f / TL.FPS);
    const buf = await page.screenshot({ type: 'png' });
    return crypto.createHash('sha1').update(buf).digest('hex');
  };
  const hA = new Map();
  for (const f of list) hA.set(f, await shot(pageA, f));
  await A.close();
  const B = await launch();
  const pageB = (await openPage(B.browser, `${srv.url}/film.html`)).page;
  const shuffled = list.slice().sort(() => R() - 0.5);
  let diff = 0;
  for (const f of shuffled) { if ((await shot(pageB, f)) !== hA.get(f)) { diff++; if (diff <= 10) fail(`frame ${f} differs between runs`); } }
  await B.close();
  if (!diff) ok(`${list.length} frames identical (in order vs shuffled, two browsers)`);
  A = null;
}
if (A) await A.close();
await srv.close();
console.log(failed ? 'CHECK FAILED' : 'CHECK PASSED');
process.exit(failed ? 1 : 0);
