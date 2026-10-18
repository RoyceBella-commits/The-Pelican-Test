// p5.brush access for the whole project.
// We import the library's ES-module source (served by tools/server.mjs, which
// turns its .vert/.frag files into modules) so we can reach its internal
// compositor flush. The library itself is used unmodified.
import * as lib from '/node_modules/p5.brush/src/index.p5.js';
import { flushActiveComposite } from '/node_modules/p5.brush/src/core/color.js';

// p5.brush 2.2.3 bug workaround (runtime override, library files untouched):
// Position.isInCanvas() adds the transform's translation to an UNSCALED position,
// so under a zoomed camera or a high-resolution bake on-screen points are judged
// "outside" and the stroke stops advancing (every stamp lands on its first point).
// Our scenes cull off-screen work themselves, so we simply treat every point as inside.
lib.Position.prototype.isInCanvas = function () { return true; };

export const stats = { strokes: 0, fills: 0, flushes: 0 };
export function resetStats() { stats.strokes = 0; stats.fills = 0; stats.flushes = 0; }

// Count every geometry call so agents can report deterministic stroke budgets.
const COUNTED = ['line', 'flowLine', 'spline', 'endStroke', 'rect', 'circle', 'arc', 'endShape', 'polygon'];
const wrapped = {};
for (const k of Object.keys(lib)) {
  const f = lib[k];
  if (typeof f === 'function' && COUNTED.includes(k)) {
    wrapped[k] = function (...a) { stats.strokes++; return f.apply(this, a); };
  } else {
    wrapped[k] = f;
  }
}
/** The brush namespace (counted). Use this instead of a global `brush`. */
export const brush = Object.freeze(wrapped);

/** Composite all queued brush strokes/fills into the current target NOW. */
export function flush() { stats.flushes++; flushActiveComposite(); }

/** Reset brush drawing state between scenes so nothing leaks. */
export function resetBrush() {
  lib.noFill(); lib.noHatch(); lib.noWash(); lib.noField(); lib.noClip(); lib.noStroke();
  if (lib.noMass) lib.noMass();
}

export { lib as brushLib };
