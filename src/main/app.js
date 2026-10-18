// p5 entry point (global mode). Exposes a small API on window for the preview
// UI and the Puppeteer tools:
//   await renderAt(t, opts)      paint film time t           → { ms, strokes, error }
//   await renderSolo(j, u, opts) paint panel j alone at local time u
//   window.film, window.TL, window.__ready
import K from '../kit/index.js';
import { brushLib, stats, resetStats } from '../kit/brush.js';
import * as TL from '../beat/timeline.js';
import { loadScenes } from '../scenes/index.js';
import { Film } from './film.js';
import { profile, riderAt } from '../beat/ride.js';

const FONTS = ['"Songti SC"', '"Kaiti SC"', '"Libian SC"', '"Xingkai SC"', '"Yuanti SC"', '"PingFang SC"', '"Hiragino Sans GB"',
  'YuMincho', 'Baskerville', '"Hoefler Text"', 'Didot', '"Bodoni 72"', 'Menlo', '"Courier New"', 'Georgia', '"Times New Roman"', 'Copperplate', 'Papyrus'];

let film = null;
let T = 0;
let OPTS = {};
const params = new URLSearchParams(location.search);

window.setup = async () => {
  try {
    pixelDensity(1);
    createCanvas(TL.VIEW_W, TL.VIEW_H, WEBGL);
    pixelDensity(1);           // createCanvas resets density to the display's (2 on Retina): force 1 again
    noLoop();
    brushLib.load();
    brushLib.scaleBrushes(2);
    await Promise.all(FONTS.map((f) => document.fonts.load(`40px ${f}`, '鹈鹕测试Aa').catch(() => null)));
    const scenes = await loadScenes();
    film = new Film(scenes);
    film.setup();
    film.debug = params.has('debug');
    window.film = film;
    window.K = K;
    window.TL = TL;
    // warm-up: one throwaway frame initialises brush shaders/compositor
    await window.renderAt(params.has('t') ? +params.get('t') : 0);
    window.__ready = true;
    document.dispatchEvent(new Event('film-ready'));
  } catch (e) {
    console.error(e);
    window.__fatal = String(e && (e.stack || e.message) || e);
  }
};

window.draw = () => {
  if (!film) return;
  film.draw(T, OPTS);
};

let busy = Promise.resolve();
/** Paint film time t. Calls are serialised. */
window.renderAt = (t, opts = {}) => {
  busy = busy.then(async () => {
    T = Math.max(0, Math.min(TL.DURATION - 1e-6, t));
    OPTS = opts;
    const t0 = performance.now();
    await film.prepare(T, opts);
    resetStats();
    await redraw();
    return { t: T, ms: performance.now() - t0, strokes: stats.strokes, error: window.__lastError || null };
  });
  return busy;
};

/** Paint panel j (−1 = preface) alone, centred at 1 px/unit, at local time u. */
window.renderSolo = (j, u, opts = {}) => {
  const t = (j < 0 ? 0 : TL.sceneStart(j)) + u;
  return window.renderAt(t, { ...opts, solo: j, u });
};

window.sceneIndexById = (id) => film.scenes.findIndex((s) => s.id === id);

/** In-page contract checks used by tools/check.mjs. */
window.selfCheck = () => {
  const out = { errors: [], warnings: [], crossings: [] };
  const N = TL.N_SCENES;
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  film.scenes.forEach((sc, i) => {
    const tag = `${String(i + 1).padStart(2, '0')} ${sc.id}`;
    const p = profile(sc.ride || {});
    if (i < N - 1) {
      if (!near(p.x(0), -TL.FRAME_W, 0.01) || !near(p.x(TL.SCENE_DUR), TL.PANEL + TL.FRAME_W, 0.05))
        out.errors.push(`${tag}: ride must go from x=-40 to x=1040 (got ${p.x(0).toFixed(2)} → ${p.x(6).toFixed(2)})`);
      if (!near(p.v(0), TL.SPEED, 0.5) || !near(p.v(TL.SCENE_DUR), TL.SPEED, 0.5))
        out.errors.push(`${tag}: speed at the seams must be ${TL.SPEED} (got ${p.v(0).toFixed(1)} / ${p.v(6).toFixed(1)})`);
      const acc0 = (p.v(0.05) - p.v(0)) / 0.05, acc6 = (p.v(6) - p.v(5.95)) / 0.05;
      if (Math.abs(acc0) > 30 || Math.abs(acc6) > 30) out.errors.push(`${tag}: acceleration at the seams must be ~0 (${acc0.toFixed(0)}, ${acc6.toFixed(0)})`);
      if (p.lost > 1.05) out.errors.push(`${tag}: bar-2 hold loses ${p.lost.toFixed(2)} s of travel (max 1.0)`);
      if (p.peak > 1.7 * TL.SPEED) out.warnings.push(`${tag}: peak speed ${(p.peak / TL.SPEED).toFixed(2)}× cruising`);
    }
    const seamUs = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1, 5, 5.25, 5.5, 5.75, 6, 6.5, 7].filter((u) => i < N - 1 || u <= 1);
    for (const u of seamUs) {
      if (sc.path) {
        const base = { x: 500, y: TL.ROAD_Y, scale: 1, rot: 0 };
        let pl; try { pl = { ...base, ...(sc.path(u, { ...base }) || {}) }; } catch (e) { out.errors.push(`${tag}: path(${u}) threw ${e.message}`); continue; }
        if (!near(pl.y, TL.ROAD_Y, 0.5) || !near(pl.scale ?? 1, 1, 0.001) || !near(pl.rot ?? 0, 0, 0.001) || !near(pl.x, 500, 0.5))
          out.errors.push(`${tag}: path(u=${u}) must be the default placement at the seams`);
      }
      if (sc.mods) {
        let m; try { m = sc.mods(u) || {}; } catch (e) { out.errors.push(`${tag}: mods(${u}) threw ${e.message}`); continue; }
        const bad = Object.entries(m).filter(([k, v]) => {
          if (k === 'eye') return v !== 'normal';
          if (k === 'bob') return v !== 1;
          if (k === 'spokes') return false;
          return typeof v === 'number' ? Math.abs(v) > 1e-3 : !!v;
        });
        if (bad.length) out.errors.push(`${tag}: mods(u=${u}) must be neutral at the seams: ${bad.map(([k, v]) => k + '=' + v).join(', ')}`);
      }
    }
    if (sc.camera) {
      for (const u of [0, 0.1, 0.25, 0.4, 0.5, 5.5, 5.6, 5.75, 5.9, 6].filter((u) => i < N - 1 || u <= 0.5)) {
        const base = { cx: 1234, cy: 500, z: 1 };
        let c; try { c = { ...base, ...(sc.camera(u, { ...base }) || {}) }; } catch (e) { out.errors.push(`${tag}: camera(${u}) threw ${e.message}`); continue; }
        if (!near(c.cx, base.cx, 0.5) || !near(c.cy, base.cy, 0.5) || !near(c.z, 1, 1e-3)) out.errors.push(`${tag}: camera(u=${u}) must not change the camera near the seams`);
      }
    }
    if (sc.loadError) out.errors.push(`${tag}: failed to load: ${sc.loadError}`);
  });
  for (let i = 0; i < N; i++) {
    const t = TL.sceneStart(i), r = riderAt(t, film.scenes);
    out.crossings.push({ i: i + 1, t, frame: Math.round(t * TL.FPS), x: +r.wx.toFixed(3), expect: TL.crossingX(i), crankDeg: +((((Math.round((r.crank * 180) / Math.PI * 100) / 100) % 360) + 360) % 360).toFixed(2), downbeat: TL.isDownbeat(t) });
    if (!near(r.wx, TL.crossingX(i), 0.05)) out.errors.push(`crossing ${i + 1}: rider at x=${r.wx.toFixed(2)}, expected ${TL.crossingX(i)}`);
    if (!TL.isDownbeat(t)) out.errors.push(`crossing ${i + 1} at t=${t} is not a downbeat`);
  }
  return out;
};
