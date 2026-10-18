// Puppeteer helpers: every launch is fully isolated (own temp profile, pipe
// transport), so several tools / agents can run Chrome at the same time.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ width = 1920, height = 1080 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pelican-chrome-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    pipe: true,
    userDataDir: profile,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: [
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${width},${height}`,
    ],
  });
  const close = async () => {
    try { await browser.close(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { browser, close };
}

// Open a page, forward console errors, and wait for window.__ready.
export async function openPage(browser, url, { timeout = 300000, verbose = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error' || verbose) {
      const text = m.text();
      if (type === 'error') errors.push(text);
      console.log(`[page ${type}] ${text}`);
    }
  });
  page.on('pageerror', (e) => {
    errors.push(String(e));
    console.log('[pageerror]', e.message);
  });
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction('window.__ready === true || !!window.__fatal', { timeout, polling: 100 });
  const fatal = await page.evaluate(() => window.__fatal || null);
  if (fatal) throw new Error('page failed to initialise: ' + fatal);
  return { page, errors };
}
