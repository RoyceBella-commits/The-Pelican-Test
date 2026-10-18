// Per-stroke seeding: every mark gets its own seed from a stable key, so a
// stroke looks the same no matter which other strokes were drawn (or culled).
import { hash } from './math.js';
import { brushLib } from './brush.js';

export function seed(...key) {
  const h = hash(...key);
  brushLib.seed(h);
  brushLib.noiseSeed(h ^ 0x5bd1e995);
  return h;
}
