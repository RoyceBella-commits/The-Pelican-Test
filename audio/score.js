// The score. Times are film seconds; `at(t)` maps them to the render context's
// clock (renders may start mid-film).
//
// Structure (120 BPM, bar = 2 s, downbeats on odd seconds):
//   intro 0–5 (half-bar pickup + 2 bars) · 20 panels × 3 bars · outro 6 bars
//   each panel: bar 1 statement · bar 2 space for the gag · bar 3 lead-in to the crossing downbeat
// Every panel plays the same original theme on its era's instruments (eras.js).
import * as TL from '../src/beat/timeline.js';
import { riderAt } from '../src/beat/ride.js';
import * as I from './instruments.js';
import { ERAS, V } from './eras.js';
import { FLASHES, T_PASS } from '../src/main/outro.js';

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

// ------------------------------------------------------------------ through-line layers
const bellInst = I.bell({ partials: [[1, 1, 0.9], [2.32, 0.55, 0.5], [3.94, 0.3, 0.3], [5.1, 0.12, 0.2]], level: 0.13, strike: 0.25, strikeRatio: 2 });
const tick = I.noiseHit({ type: 'bandpass', freq: 5200, q: 3, decay: 0.01, level: 0.022, seed: 23 });
const cello = I.strings({ octave: 0, level: 0.075, lp: 1500, attack: 0.35, release: 0.6, detunes: [-5, 0, 4] });
const timp = I.drum({ freq: 73, decay: 0.6, level: 0.45, pitchFrom: 1.3, pitchTime: 0.05 });
const cymbal = I.noiseHit({ type: 'highpass', freq: 5000, decay: 0.9, level: 0.06, seed: 97 });
const shutter = I.noiseHit({ type: 'bandpass', freq: 3600, q: 1.6, decay: 0.025, level: 0.12, seed: 101, body: 700 });
const flashPop = I.noiseHit({ type: 'highpass', freq: 7000, decay: 0.08, level: 0.05, seed: 103 });

/** Bicycle bell on every frame crossing (the downbeat). */
function bells(ctx, bus, at, range) {
  for (let i = 0; i < TL.N_SCENES; i++) {
    const t = TL.sceneStart(i);
    if (t < range.from - 1 || t > range.to) continue;
    bellInst(ctx, bus.input, at(t), 91, 0.4, 0.8, { pan: 0.15 });
    bellInst(ctx, bus.room, at(t), 91, 0.4, 0.25);
  }
}

/** Chain ticks locked to the pedals: 4 per crank revolution while pedalling. */
function chain(ctx, bus, at, range, scenes) {
  const step = 1 / 480;
  let prev = null;
  for (let t = Math.max(0, range.from); t < Math.min(range.to, TL.OUTRO_START); t += step) {
    const r = riderAt(t, scenes);
    const k = Math.floor((r.crank / (2 * Math.PI)) * 4);
    if (prev !== null && k !== prev && r.v > 5) tick(ctx, bus.input, at(t), 60, 0.01, 0.35 + 0.3 * Math.min(1, r.v / TL.SPEED), { pan: -0.1, seed: k });
    prev = k;
  }
}

/** Intro: documentary low strings and timpani; the second caption lands on the t = 1 downbeat. */
function intro(ctx, bus, at, range) {
  if (range.from > TL.INTRO) return;
  cello(ctx, bus.input, at(0.05), 38, 4.9, 0.6); cello(ctx, bus.hall, at(0.05), 38, 4.9, 0.25);
  cello(ctx, bus.input, at(1), 45, 3.9, 0.5);
  cello(ctx, bus.input, at(1), 50, 3.9, 0.45);
  cello(ctx, bus.input, at(3), 54, 2.0, 0.5);
  cello(ctx, bus.input, at(3), 57, 2.0, 0.4);
  for (const t of [1, 3]) timp(ctx, bus.input, at(t), 0, 0.5, 0.8);
  for (let t = 4; t < 5; t += 0.125) timp(ctx, bus.input, at(t), 0, 0.1, 0.2 + (t - 4) * 0.55);   // roll into the first crossing
}

// ------------------------------------------------------------------ the per-panel arrangement API
function makeE(ctx, mainBus, at, range, i, scene, gain = 1) {
  const t0 = TL.sceneStart(i);
  // per-era gain stage (levels.json balances the eras' loudness)
  const stage = (dest) => { const g = ctx.createGain(); g.gain.value = gain; g.connect(dest); return g; };
  const bus = { input: stage(mainBus.input), room: stage(mainBus.room), hall: stage(mainBus.hall) };
  const phrase = i % 2 ? 'B' : 'A';
  const T = (beat) => at(t0 + beat * TL.BEAT);
  const live = (beat, len) => { const t = t0 + beat * TL.BEAT; return t + len * TL.BEAT + 3 >= range.from && t <= range.to; };
  const cues = (scene?.cues || []).map((c) => ({ ...c, beat: c.u / TL.BEAT }));
  const E = {
    ctx, bus, t0, phrase, T,
    notes: THEME[phrase],
    play(inst, dest, beat, len, midi, vel = 0.8, o = {}) {
      if (!live(beat, len)) return;
      inst(ctx, dest, T(beat), midi, len * TL.BEAT, vel, o);
    },
    /** Play the theme with transforms. */
    melody(inst, dest, o = {}) {
      const sp = o.speed ?? 1, tr = (o.transpose ?? 0) + 12 * (o.octave ?? 0), map = o.scale || ((m) => m);
      let prev = null;
      for (const [b0, l0, m0, v0] of THEME[phrase]) {
        const b = b0 / sp, len = l0 / sp;
        if (b >= 12) break;
        if (o.skipBar != null && Math.floor(b0 / 4) === o.skipBar) { prev = m0; continue; }
        const m = map(m0 + tr), vel = (o.vel ?? 0.9) * v0;
        const opts = {};
        if (o.slides && prev != null && l0 >= 1 && prev !== m0) { opts.slideFrom = map(prev + tr); opts.slideTime = 0.12; }
        if (o.detuneFrom != null && b0 >= o.detuneFrom) { opts.detune = o.detuneCents ?? 0; opts.bend = (o.detuneCents ?? 0) * 0.6; }
        if (o.graces && l0 >= 1) E.play(inst, dest, b - 0.125, 0.12, map(m0 + tr + 2), vel * 0.45);
        if (o.tremolo && l0 >= o.tremolo.minBeats) {
          for (let k = 0; k < len; k += o.tremolo.rate * 2) E.play(inst, dest, b + k, o.tremolo.rate * 2, m, vel * (1 - 0.4 * k / len), opts);
        } else E.play(inst, dest, b, len, m, vel, opts);
        prev = m0;
      }
    },
    cueBeat(name) { const c = cues.find((c) => c.name === name); return c ? c.beat : null; },
    on(name, fn) { for (const c of cues) if (c.name === name && live(c.beat, 2)) fn(c.beat); },
  };
  return E;
}

function panels(ctx, bus, at, range, scenes, levels) {
  for (let i = 0; i < TL.N_SCENES; i++) {
    const t0 = TL.sceneStart(i);
    if (t0 > range.to || t0 + TL.SCENE_DUR + 4 < range.from) continue;
    const sc = scenes[i] || {};
    const era = ERAS[sc.id];
    if (!era) continue;
    era(makeE(ctx, bus, at, range, i, sc, opts_levels(levels, sc.id)));
  }
}

const opts_levels = (levels, id) => (levels && levels[id] != null ? levels[id] : 1);

// ------------------------------------------------------------------ outro: every era together
const TUTTI = [
  [V.chant, 0.12], [V.harp, 0.25], [V.bianzhong, 0.18], [V.pipa, 0.2], [V.guqin, 0.22], [V.dizi, 0.17], [V.ocarina, 0.2],
  [V.sitar, 0.18], [V.xiao, 0.15], [V.saron, 0.17], [V.shamisen, 0.18], [V.strings, 0.32], [V.violin, 0.2], [V.organ, 0.2],
  [V.beep, 0.25], [V.pulse1, 0.15], [V.vibes, 0.3], [V.epiano, 0.22], [V.pluck, 0.18], [V.marimba, 0.2],
];
function outro(ctx, bus, at, range) {
  const T0 = TL.OUTRO_START;
  if (range.to < T0) return;
  const B = (beat) => at(T0 + beat * TL.BEAT);
  // everything musical fades out during the push-in (131 → 133.6); only the bell is left at the end
  const fader = (dest) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, at(T0 + 6)); g.gain.linearRampToValueAtTime(0, at(T0 + 8.6));
    g.connect(dest); return g;
  };
  const fb = { input: fader(bus.input), room: fader(bus.room), hall: fader(bus.hall) };
  // 125–127: the scroll pulls back — phrase B, bar 1, on harp + swelling strings
  for (const [b, len, m, v] of THEME.B) if (b < 4) V.harp(ctx, fb.room, B(b), m, len * TL.BEAT, v * 0.8);
  [50, 57, 62].forEach((m) => cello(ctx, fb.hall, B(0), m, 4 * TL.BEAT, 0.45));
  // rows land on 127, 127.5, 128; the press seat on 128.5
  [4, 5, 6].forEach((b, k) => bellInst(ctx, fb.room, B(b), 86 - k * 5, 0.4, 0.6));
  timp(ctx, fb.input, B(7), 0, 0.5, 0.7);
  for (let b = 2; b < 4; b += 0.125) timp(ctx, fb.input, B(b), 0, 0.1, 0.2 + (b - 2) * 0.3);
  // 127–133: the theme, every era's instrument at once
  const TT = T0 + 2;
  const C = (beat) => at(TT + beat * TL.BEAT);
  TUTTI.forEach(([inst, lvl], k) => {
    const pan = -0.8 + (1.6 * k) / (TUTTI.length - 1);
    for (const [b, len, m, v] of THEME.A) inst(ctx, fb.room, C(b), m, len * TL.BEAT, v * lvl, { pan });
  });
  [[0, 38], [4, 43], [8, 45]].forEach(([b, m]) => { cello(ctx, fb.hall, C(b), m, 3.5 * TL.BEAT, 0.6); timp(ctx, fb.input, C(b), 0, 0.5, 0.9); });
  cymbal(ctx, fb.hall, C(0), 60, 1, 0.8);
  // camera flashes during the push: a shutter "ka-cha" and the flash's pop
  for (const [tf, k] of FLASHES) {
    shutter(ctx, bus.room, at(tf), 60, 0.05, 0.9 * k, { pan: 0.2 });
    shutter(ctx, bus.room, at(tf + 0.05), 60, 0.05, 0.6 * k, { pan: 0.2 });
    flashPop(ctx, bus.room, at(tf), 60, 0.1, 0.5 * k);
  }
  // the last beat: one bicycle bell, passing left → right behind the empty seat
  const solo = ctx.createGain(); solo.gain.value = 3; solo.connect(bus.input);    // alone in the silence: clearly present
  bellInst(ctx, solo, at(T_PASS + 0.06), 91, 0.4, 0.9, { pan: -0.3 });
  bellInst(ctx, solo, at(T_PASS + 0.18), 91, 0.4, 0.75, { pan: 0.3 });
  bellInst(ctx, bus.room, at(T_PASS + 0.06), 91, 0.4, 0.5);
}

// ------------------------------------------------------------------ build
export async function buildScore(ctx, bus, opts = {}) {
  const range = { from: opts.from ?? 0, to: opts.to ?? TL.DURATION };
  const at = (t) => Math.max(0, t - range.from);
  // ride params / cues / ids come from the film's scenes; fallback: plain cruising
  const scenes = opts.scenes || Array.from({ length: TL.N_SCENES }, (_, i) => (i === TL.N_SCENES - 1 ? { ride: { stopAt: 500 } } : {}));
  const want = (name) => !opts.only || opts.only.includes(name);
  if (want('bell')) bells(ctx, bus, at, range);
  if (want('chain')) chain(ctx, bus, at, range, scenes);
  if (want('intro')) intro(ctx, bus, at, range);
  let levels = opts.levels;
  if (levels === undefined) { try { levels = await (await fetch(new URL('./levels.json', import.meta.url))).json(); } catch { levels = null; } }
  if (want('panels')) panels(ctx, bus, at, range, scenes, levels);
  if (want('outro')) outro(ctx, bus, at, range);
  // final fade: silent on the last frame
  const end = TL.DURATION - range.from;
  if (end > 0 && end <= range.to - range.from + 0.01) {
    bus.out.gain.setValueAtTime(bus.out.gain.value, Math.max(0, end - 1.2));
    bus.out.gain.linearRampToValueAtTime(0, Math.max(0, end - 1 / TL.FPS));
  }
}
