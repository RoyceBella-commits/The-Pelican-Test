// The score (stage-4 skeleton). Times are film seconds; `at(t)` maps them to the
// render context's clock (renders may start mid-film).
//
// Structure (120 BPM, bar = 2 s, downbeats on odd seconds):
//   intro 0–5 (half-bar pickup + 2 bars) · 20 panels × 3 bars · outro 6 bars
//   each panel: bar 1 statement · bar 2 space for the gag · bar 3 lead-in to the crossing downbeat
import * as TL from '../src/beat/timeline.js';
import { riderAt } from '../src/beat/ride.js';
import * as I from './instruments.js';

// ------------------------------------------------------------------ the theme (original)
// D major pentatonic. Notes: [beat offset from the panel's first downbeat, length in beats, midi, velocity]
const D4 = 62, E4 = 64, Fs4 = 66, A4 = 69, B4 = 71, D5 = 74, A3 = 57, B3 = 59;
export const THEME = {
  A: [
    [0, 1.5, D4, 0.9], [1.5, 0.5, E4, 0.7], [2, 1, Fs4, 0.8], [3, 1, A4, 0.85],
    [4, 2, B4, 0.9], [6, 0.5, A4, 0.7], [6.5, 0.5, Fs4, 0.7],
    [8, 1, E4, 0.8], [9, 0.5, Fs4, 0.7], [9.5, 0.5, E4, 0.7], [10, 1, D4, 0.8], [11, 0.5, A3, 0.75], [11.5, 0.5, B3, 0.8],
  ],
  B: [
    [0, 1.5, A4, 0.9], [1.5, 0.5, B4, 0.7], [2, 1, D5, 0.85], [3, 1, B4, 0.8],
    [4, 2, A4, 0.9], [6, 0.5, Fs4, 0.7], [6.5, 0.5, E4, 0.7],
    [8, 1, Fs4, 0.8], [9, 0.5, E4, 0.7], [9.5, 0.5, D4, 0.7], [10, 1, E4, 0.8], [11, 0.5, A3, 0.75], [11.5, 0.5, B3, 0.8],
  ],
};
// bass roots per bar (midi): A: D | G | A   B: D | Bm | A
export const ROOTS = { A: [38, 43, 45], B: [38, 47, 45] };

// ------------------------------------------------------------------ layers
const bellInst = I.bell({ partials: [[1, 1, 0.9], [2.32, 0.55, 0.5], [3.94, 0.3, 0.3], [5.1, 0.12, 0.2]], level: 0.16, strike: 0.25, strikeRatio: 2 });
const tick = I.noiseHit({ type: 'bandpass', freq: 5200, q: 3, decay: 0.012, level: 0.05, seed: 23 });
const cello = I.strings({ octave: -1, level: 0.07, lp: 1400, attack: 0.35, release: 0.6, detunes: [-5, 0, 4] });
const timp = I.drum({ freq: 73, decay: 0.6, level: 0.5, pitchFrom: 1.3, pitchTime: 0.05 });
const tempPiano = I.piano({ level: 0.16 });

/** Bicycle bell on every frame crossing (the downbeat). */
function bells(ctx, bus, at, range) {
  for (let i = 0; i < TL.N_SCENES; i++) {
    const t = TL.sceneStart(i);
    if (t < range.from - 1 || t > range.to) continue;
    bellInst(ctx, bus.input, at(t), 91, 0.4, 0.8, { pan: 0.15 });
    bellInst(ctx, bus.room, at(t), 91, 0.4, 0.25);
  }
}

/** Chain/freewheel ticks locked to the pedals: 8 per crank revolution while pedalling. */
function chain(ctx, bus, at, range, scenes) {
  const step = 1 / 480;
  let prev = null;
  for (let t = Math.max(0, range.from); t < Math.min(range.to, TL.OUTRO_START); t += step) {
    const r = riderAt(t, scenes);
    const k = Math.floor((r.crank / (2 * Math.PI)) * 8);
    if (prev !== null && k !== prev && r.v > 5) tick(ctx, bus.input, at(t), 60, 0.01, 0.4 + 0.3 * Math.min(1, r.v / TL.SPEED), { pan: -0.1, seed: k });
    prev = k;
  }
}

/** Intro: documentary low strings and a timpani pulse; the second caption lands on t = 3. */
function intro(ctx, bus, at, range) {
  if (range.from > TL.INTRO) return;
  const dest = bus.hall;
  cello(ctx, bus.input, at(0.05), 38, 4.9, 0.7); cello(ctx, dest, at(0.05), 38, 4.9, 0.3);
  cello(ctx, bus.input, at(1), 45, 3.9, 0.55);
  cello(ctx, bus.input, at(3), 50, 2.0, 0.6);
  cello(ctx, bus.input, at(3), 54, 2.0, 0.45);
  for (const t of [1, 3]) timp(ctx, bus.input, at(t), 0, 0.5, 0.8);
  for (let t = 4; t < 5; t += 0.125) timp(ctx, bus.input, at(t), 0, 0.1, 0.25 + (t - 4) * 0.5);   // roll into the first crossing
}

/** Placeholder melody for every panel until stage 4 assigns the era instruments. */
function panels(ctx, bus, at, range) {
  for (let i = 0; i < TL.N_SCENES; i++) {
    const t0 = TL.sceneStart(i);
    if (t0 > range.to || t0 + TL.SCENE_DUR < range.from) continue;
    const phrase = i % 2 ? 'B' : 'A';
    for (const [b, len, m, v] of THEME[phrase]) tempPiano(ctx, bus.input, at(t0 + b * TL.BEAT), m, len * TL.BEAT, v * 0.8);
  }
}

export async function buildScore(ctx, bus, opts = {}) {
  const range = { from: opts.from ?? 0, to: opts.to ?? TL.DURATION };
  const at = (t) => Math.max(0, t - range.from);
  // ride params come from the film's scenes (holds change when the pedals turn); fallback: plain cruising
  const scenes = opts.scenes || Array.from({ length: TL.N_SCENES }, (_, i) => (i === TL.N_SCENES - 1 ? { ride: { stopAt: 500 } } : {}));
  const want = (name) => !opts.only || opts.only.includes(name);
  if (want('bell')) bells(ctx, bus, at, range);
  if (want('chain')) chain(ctx, bus, at, range, scenes);
  if (want('intro')) intro(ctx, bus, at, range);
  if (want('panels')) panels(ctx, bus, at, range);
}
