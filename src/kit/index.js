// K — the shared drawing kit handed to every scene.
//
//   K.brush            p5.brush namespace (counted)        K.seed(...key)   seed the next marks
//   K.flush()          composite queued brush marks now (call before native p5 drawing that must go on top)
//   K.bake(key,w,h,fn) offscreen framebuffer painted once (call from init only)
//   K.layer(key,w,h,fn) cached Canvas2D layer: fn(ctx2d, g)
//   K.text(opts,x,y,scale,alpha)  draw a text sprite;  K.textSprite(opts)
//   K.paper.sheet(opts) procedural paper/silk/rock ground (p5.Graphics)
//   K.rig.pose / placed / drawPen      the pelican puppet
//   + all of math.js (rng, hash, noise2, fbm, smoothstep, lerp, keys, ribbon, ...)
//   + K.TL (timeline constants)
import * as M from './math.js';
import { brush, brushLib, flush, stats, resetStats, resetBrush } from './brush.js';
import { seed } from './seed.js';
import { textSprite, drawText } from './text.js';
import * as paper from './paper.js';
import * as frames from './frames.js';
import * as rigMod from '../rig/pelican.js';
import { drawPen } from '../rig/pen.js';
import * as TL from '../beat/timeline.js';

// ------------------------------------------------------------------ bakes (LRU)
const bakes = new Map();
const BUDGET = 1400 * 1024 * 1024;     // total GPU bytes we allow for baked layers
const SCENE_BUDGET = 64 * 1024 * 1024;  // per scene-prefix soft limit (warned)
let total = 0;
const state = { inPass: false, scenePrefix: '' };

function evict() {
  while (total > BUDGET && bakes.size > 1) {
    const [k, v] = bakes.entries().next().value;
    bakes.delete(k);
    total -= v.bytes;
    try { v.fb.remove(); } catch {}
  }
}

/**
 * Bake a static layer once into a framebuffer (w×h px). paint(K, w, h) draws
 * with brush or native p5 in a top-left origin, pixel-unit space. Call from init().
 */
function bake(key, w, h, paint) {
  if (!key.includes(':')) key = `${state.scenePrefix}:${key}`;   // scope to the calling scene
  const hit = bakes.get(key);
  if (hit) { bakes.delete(key); bakes.set(key, hit); return hit.fb; }
  if (state.inPass) throw new Error(`K.bake('${key}') called during render(); bake in init() instead`);
  w = Math.round(w); h = Math.round(h);
  const fb = createFramebuffer({ width: w, height: h, density: 1, depth: false, antialias: false });
  fb.begin();
  clear();
  push();
  translate(-w / 2, -h / 2);
  brushLib.load(fb);
  resetBrush();
  paint(K, w, h);
  flush();
  pop();
  fb.end();
  brushLib.load();
  const bytes = w * h * 4;
  bakes.set(key, { fb, bytes });
  total += bytes;
  const prefix = key.split(':')[0];
  let sum = 0;
  for (const [k, v] of bakes) if (k.split(':')[0] === prefix) sum += v.bytes;
  if (sum > SCENE_BUDGET) console.warn(`[kit] bakes for "${prefix}" use ${(sum / 1048576).toFixed(0)} MB (> 64 MB budget)`);
  evict();
  return fb;
}

/** Drop all bakes whose key starts with prefix + ':' (scene unload). */
function dropBakes(prefix) {
  for (const [k, v] of [...bakes]) {
    if (k.startsWith(prefix + ':')) { bakes.delete(k); total -= v.bytes; try { v.fb.remove(); } catch {} }
  }
}

const layers = new Map();
/** Cached Canvas2D layer (p5.Graphics). paint(ctx, g) runs once. */
function layer(key, w, h, paint) {
  if (!key.includes(':')) key = `${state.scenePrefix}:${key}`;
  if (layers.has(key)) return layers.get(key);
  const g = createGraphics(Math.round(w), Math.round(h));
  g.pixelDensity(1);
  paint(g.drawingContext, g);
  layers.set(key, g);
  return g;
}

export const K = {
  ...M,
  brush, flush, seed, stats, resetStats, resetBrush,
  bake, dropBakes, layer,
  text: drawText, textSprite,
  paper, frames,
  rig: { ...rigMod, drawPen },
  TL,
  _state: state,
  bakeBytes: () => total,
};

export default K;
