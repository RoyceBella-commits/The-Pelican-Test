// One arrangement per panel. Each era plays the SAME original theme (score.js)
// on its own instruments, with its own accompaniment, percussion and tuning,
// and answers the scene's gag cues with sound effects.
//
// era(ctx, bus, E) where E = { t0, phrase, play(inst, dest, beat, lenBeats, midi, vel, opts), notes, cue(name) → u, at(t), lvl }
import * as I from './instruments.js';
import { mtof, noiseBuffer } from './dsp.js';

// ------------------------------------------------------------------ scale maps
const pc = (m) => ((Math.round(m) - 62) % 12 + 12) % 12;
export const SCALES = {
  major: (m) => m,
  minor: (m) => m + ({ 2: 1, 4: 1, 9: 1 }[pc(m)] || 0),            // D F G A C (minor pentatonic)
  yo: (m) => m + ({ 4: 1 }[pc(m)] || 0),                            // D E G A B (Japanese yo)
  slendro: (m) => m + ({ 2: 0.4, 4: 0.8, 7: 0.2, 9: 0.6 }[pc(m)] || 0),   // ≈ 240-cent steps
};

// ------------------------------------------------------------------ shared sfx
export function whoosh(ctx, dest, t, dur = 0.5, f0 = 400, f1 = 3000, level = 0.15) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 3, 41);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(bp).connect(g).connect(dest); n.start(t); n.stop(t + dur + 0.05);
}
/** Pitch slide on a pure tone (slide whistle, gulp, tape stop). */
export function slide(ctx, dest, t, dur, m0, m1, level = 0.12, wave = 'sine') {
  const o = ctx.createOscillator(); o.type = wave;
  o.frequency.setValueAtTime(mtof(m0), t); o.frequency.exponentialRampToValueAtTime(mtof(m1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.02); g.gain.setValueAtTime(level, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
const gliss = (E, inst, dest, beat, notes, step = 0.0625, vel = 0.6) => notes.forEach((m, k) => E.play(inst, dest, beat + k * step, 0.5, m, vel));
const PENTA = [57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81];
const run = (from, n, dir = 1) => { let k = PENTA.indexOf(from); if (k < 0) k = 2; const out = []; for (let j = 0; j < n; j++) out.push(PENTA[Math.max(0, Math.min(PENTA.length - 1, k + j * dir))]); return out; };

// ------------------------------------------------------------------ instruments
const V = {
  chant: I.voice({ vowel: 'a', octave: -1, level: 0.16, attack: 0.06 }),
  hum: I.voice({ vowel: 'u', octave: -2, level: 0.08, attack: 0.4, release: 0.6 }),
  frame: I.drum({ freq: 82, decay: 0.28, level: 0.55, pitchFrom: 1.6, slap: 0.15, slapFreq: 900 }),
  djembe: I.drum({ freq: 190, decay: 0.12, level: 0.35, pitchFrom: 1.4, slap: 0.35, slapFreq: 2400, slapDecay: 0.04 }),
  shaker: I.noiseHit({ type: 'highpass', freq: 6500, decay: 0.05, level: 0.06, seed: 51 }),
  harp: I.plucked({ decay: 2.2, bright: 0.85, damp: 0.25, level: 0.42, body: 900 }),
  sistrum: I.noiseHit({ type: 'highpass', freq: 7000, decay: 0.12, level: 0.07, claps: 3, seed: 53 }),
  bianzhong: I.bell({ partials: [[1, 1, 2.6], [1.19, 0.45, 1.9], [2.92, 0.28, 1.0], [5.2, 0.12, 0.5]], octave: -1, level: 0.22, strike: 0.2, strikeRatio: 2.5 }),
  qing: I.bell({ partials: [[1, 1, 0.9], [2.61, 0.4, 0.5], [4.8, 0.2, 0.3]], octave: 1, level: 0.08, strike: 0.15 }),
  jiangu: I.drum({ freq: 58, decay: 0.55, level: 0.6, pitchFrom: 1.4, slap: 0.1, slapFreq: 600 }),
  pipa: I.plucked({ decay: 1.3, bright: 0.95, damp: 0.2, buzz: 0.05, level: 0.75, click: 0.14, clickFreq: 3200, body: 1200 }),
  sheng: I.organ({ drawbars: [[1, 0.5], [2, 0.6], [3, 0.35], [4, 0.25]], level: 0.025, trem: 4 }),
  pengling: I.bell({ partials: [[1, 1, 0.8], [2.7, 0.4, 0.4]], octave: 2, level: 0.05, strike: 0.2 }),
  guqin: I.plucked({ decay: 3.6, bright: 0.38, damp: 0.72, level: 0.9, octave: -1, body: 300, lp: 3500 }),
  qinHarm: I.bell({ partials: [[1, 1, 2.2], [2, 0.15, 1.2]], octave: 1, level: 0.1, attack: 0.004 }),
  dizi: I.wind({ wave: 'triangle', octave: 1, level: 0.13, vib: 0.011, vibRate: 5.8, harm: 0.15, breath: 0.06, membrane: 0.035, attack: 0.03 }),
  gongS: I.gong({ freq: 620, decay: 0.55, level: 0.06, sag: 0.03 }),
  gongL: I.gong({ freq: 170, decay: 2.2, level: 0.1, sag: 0.02 }),
  tanggu: I.drum({ freq: 140, decay: 0.16, level: 0.45, pitchFrom: 1.5, slap: 0.3, slapFreq: 1500 }),
  bo: I.noiseHit({ type: 'bandpass', freq: 4200, q: 0.9, decay: 0.28, level: 0.1, seed: 57 }),
  ocarina: I.wind({ wave: 'sine', octave: 0, level: 0.2, vib: 0.006, breath: 0.05, breathRatio: 1.5, attack: 0.04 }),
  slit: (ctx, out, t, m, d, v, o) => I.drum({ freq: mtof(m - 12), decay: 0.18, level: 0.4, pitchFrom: 1.05, pitchTime: 0.01, slap: 0.25, slapFreq: 1800, slapDecay: 0.02 })(ctx, out, t, m, d, v, o),
  rattle: I.noiseHit({ type: 'bandpass', freq: 5200, q: 0.8, decay: 0.07, level: 0.07, claps: 2, seed: 59 }),
  conch: I.wind({ wave: 'sawtooth', octave: -1, level: 0.06, vib: 0.004, breath: 0.12, attack: 0.15, release: 0.4 }),
  sitar: I.plucked({ decay: 2.4, bright: 0.75, damp: 0.3, buzz: 0.5, level: 0.38, click: 0.08, body: 1500 }),
  tanpura: I.plucked({ decay: 3, bright: 0.5, damp: 0.5, buzz: 0.65, level: 0.12, octave: -1 }),
  dha: I.drum({ freq: 85, decay: 0.3, level: 0.45, pitchFrom: 1.2, ring: 2.9, slap: 0.1 }),
  na: I.drum({ freq: 520, decay: 0.12, level: 0.2, pitchFrom: 1.05, ring: 2.1 }),
  ghungroo: I.noiseHit({ type: 'highpass', freq: 8000, decay: 0.16, level: 0.06, claps: 4, seed: 61 }),
  xiao: I.wind({ wave: 'sine', octave: -1, level: 0.24, vib: 0.007, vibRate: 4.8, breath: 0.16, breathRatio: 1.2, breathQ: 0.9, attack: 0.09, release: 0.3 }),
  muyu: I.drum({ freq: 420, decay: 0.08, level: 0.3, pitchFrom: 1.02, slap: 0.35, slapFreq: 1600, slapDecay: 0.02 }),
  saron: I.bell({ partials: [[1, 1, 1.4], [2.01, 0.35, 0.8], [4.2, 0.15, 0.4]], level: 0.16, beat: 3, strike: 0.25, strikeRatio: 3 }),
  bonang: I.bell({ partials: [[1, 1, 0.5], [2.4, 0.3, 0.3]], octave: 1, level: 0.06, beat: 4 }),
  kendang: I.drum({ freq: 115, decay: 0.15, level: 0.4, pitchFrom: 1.3, slap: 0.4, slapFreq: 1300 }),
  gongAgeng: I.gong({ freq: 55, decay: 4, level: 0.22, partials: [[1, 1], [2.01, 0.5], [2.96, 0.2]], sag: 0.005 }),
  kempul: I.gong({ freq: 147, decay: 1.6, level: 0.1, partials: [[1, 1], [2.02, 0.4], [3.1, 0.15]] }),
  shamisen: I.plucked({ decay: 1.0, bright: 0.9, damp: 0.25, buzz: 0.35, level: 0.42, click: 0.28, clickFreq: 2800, body: 1700 }),
  taiko: I.drum({ freq: 66, decay: 0.42, level: 0.55, pitchFrom: 1.5, drive: 1.5, slap: 0.15 }),
  tsuzumi: I.drum({ freq: 330, decay: 0.2, level: 0.25, pitchFrom: 0.85, pitchTime: 0.08 }),
  musicbox: I.bell({ partials: [[1, 1, 0.9], [3.9, 0.25, 0.25], [8.2, 0.08, 0.1]], octave: 1, level: 0.12, strike: 0.1, strikeRatio: 6 }),
  playerPiano: I.piano({ level: 0.1, decay: 2.5 }),
  shutter: I.noiseHit({ type: 'bandpass', freq: 3400, q: 1.5, decay: 0.03, level: 0.22, claps: 2, seed: 67, body: 240 }),
  strings: I.strings({ level: 0.2, lp: 3000, attack: 0.12, release: 0.5 }),
  violin: I.strings({ octave: 1, level: 0.15, lp: 4200, attack: 0.08, release: 0.3, detunes: [-4, 4] }),
  celesta: I.bell({ partials: [[1, 1, 1.2], [4, 0.2, 0.3]], octave: 1, level: 0.08 }),
  church: I.bell({ partials: [[0.5, 0.7, 3], [1, 1, 2.5], [1.2, 0.5, 2], [1.5, 0.35, 1.6], [2, 0.3, 1.2]], octave: -1, level: 0.12, strike: 0.15 }),
  piano: I.piano({ level: 0.26, decay: 3 }),
  organ: I.organ({ level: 0.06, trem: 5.5 }),
  pedal: I.organ({ drawbars: [[0.5, 1], [1, 0.8], [2, 0.3]], octave: -2, level: 0.08, trem: 0.1 }),
  pizz: I.plucked({ decay: 0.6, bright: 0.5, damp: 0.6, level: 0.35, octave: -2 }),
  square: I.synth({ wave: 'square', octave: 1, level: 0.045, attack: 0.003, decay: 0.06, sustain: 0.7, release: 0.04, lp: 5000 }),
  tri: I.synth({ wave: 'triangle', octave: -1, level: 0.12, sustain: 0.8 }),
  ping: (ctx, out, t, m, d, v, o) => { I.bell({ partials: [[1, 1, 0.25], [2, 0.3, 0.15]], level: 0.1 })(ctx, out, t, 91, 0.1, v, o); I.bell({ partials: [[1, 1, 0.35], [2, 0.3, 0.2]], level: 0.1 })(ctx, out, t + 0.07, 96, 0.1, v, o); return t + 0.6; },
  epiano: I.epiano({ ratio: 1, index: 2.2, level: 0.14, decay: 2.6 }),
  pad: I.strings({ level: 0.08, lp: 1600, attack: 0.6, release: 1.2, detunes: [-12, -3, 5, 11] }),
  snare: I.noiseHit({ type: 'bandpass', freq: 1800, q: 0.6, decay: 0.18, level: 0.18, seed: 71, body: 190 }),
  kick808: I.drum({ freq: 48, decay: 0.5, level: 0.7, pitchFrom: 3, pitchTime: 0.05, drive: 2.2 }),
  clap: I.noiseHit({ type: 'bandpass', freq: 1500, q: 0.8, decay: 0.12, level: 0.2, claps: 3, seed: 73 }),
  hat: I.noiseHit({ type: 'highpass', freq: 9000, decay: 0.03, level: 0.06, seed: 79 }),
  pluck: I.synth({ wave: 'sawtooth', level: 0.06, attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.1, lp: 2400, env: 3, envTime: 0.12 }),
  sub: I.synth({ wave: 'sine', octave: -1, level: 0.16, sustain: 0.9, release: 0.08 }),
  keys: I.synth({ wave: 'triangle', octave: 1, level: 0.03, attack: 0.002, decay: 0.08, sustain: 0.3, release: 0.08 }),
  typing: I.noiseHit({ type: 'highpass', freq: 3200, decay: 0.012, level: 0.04, seed: 83 }),
  toast: I.bell({ partials: [[1, 1, 0.5], [2, 0.2, 0.3]], octave: 1, level: 0.08 }),
};
export { V };

// ------------------------------------------------------------------ helpers
const each = (from, to, step, fn) => { for (let b = from; b < to - 1e-9; b += step) fn(b); };
const chord = (E, inst, dest, beat, len, ms, vel) => ms.forEach((m) => E.play(inst, dest, beat, len, m, vel));
const ROOTS = { A: [50, 55, 57], B: [50, 59, 57] };
const triad = (root, minor = false) => [root, root + (minor ? 3 : 4), root + 7];

// ------------------------------------------------------------------ eras
export const ERAS = {
  sahara(E) {
    E.melody(V.chant, E.bus.room, { vel: 0.9 });
    E.melody(V.chant, E.bus.hall, { vel: 0.35, transpose: -5 });           // a second voice a fourth below
    E.play(V.hum, E.bus.room, 0, 12, 50, 0.7);
    each(0, 12, 1, (b) => E.play(b % 2 ? V.djembe : V.frame, E.bus.input, b, 0.3, 60, b % 4 ? 0.6 : 0.9));
    each(0.5, 12, 1, (b) => E.play(V.djembe, E.bus.input, b, 0.2, 60, 0.4));
    each(0, 12, 0.5, (b) => E.play(V.shaker, E.bus.input, b, 0.1, 60, 0.5 + 0.2 * (b % 1)));
    E.on('herdTurns', (b) => { E.play(V.frame, E.bus.input, b, 0.5, 60, 1); E.play(V.chant, E.bus.room, b, 0.5, 74, 0.8); });
    E.on('armsUp', (b) => gliss(E, V.chant, E.bus.room, b, [69, 71, 74, 76], 0.08, 0.7));
  },
  egypt(E) {
    E.melody(V.harp, E.bus.room, { vel: 0.95 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 0.5, (b) => { const r = roots[Math.floor(b / 4)]; E.play(V.harp, E.bus.input, b, 0.5, [r, r + 7, r + 12, r + 7][Math.round(b * 2) % 4] - 12, 0.32); });
    each(1, 12, 2, (b) => E.play(V.sistrum, E.bus.input, b, 0.2, 60, 0.8));
    each(0, 12, 2, (b) => E.play(V.frame, E.bus.input, b, 0.3, 60, 0.6));
    E.on('freezePose', (b) => gliss(E, V.harp, E.bus.room, b, run(62, 10), 0.04, 0.6));
    E.on('cartouche', (b) => each(0, 1, 0.125, (k) => E.play(V.sistrum, E.bus.input, b + k, 0.1, 60, 0.4)));
  },
  han(E) {
    E.melody(V.bianzhong, E.bus.hall, { vel: 0.9 });
    each(0, 12, 4, (b) => E.play(V.jiangu, E.bus.input, b, 0.5, 60, 0.9));
    each(2, 12, 4, (b) => E.play(V.jiangu, E.bus.input, b, 0.5, 60, 0.5));
    each(1.5, 12, 4, (b) => E.play(V.qing, E.bus.room, b, 0.5, [74, 78, 76][Math.floor(b / 4)], 0.6));
    E.on('tableau', (b) => { E.play(V.jiangu, E.bus.input, b, 0.5, 60, 1); chord(E, V.bianzhong, E.bus.hall, b, 2, [50, 57, 62], 0.6); });
    E.on('horseRears', (b) => each(0, 0.75, 0.0625, (k) => E.play(V.jiangu, E.bus.input, b + k, 0.1, 60, 0.3 + k * 0.5)));
    E.on('cartouche', (b) => each(0, 1, 0.25, (k) => E.play(V.qing, E.bus.input, b + k, 0.1, 86, 0.4)));
  },
  tang(E) {
    // long notes become pipa tremolo (轮指)
    E.melody(V.pipa, E.bus.room, { vel: 0.9, tremolo: { minBeats: 1.5, rate: 0.0625 } });
    const roots = ROOTS[E.phrase];
    roots.forEach((r, k) => chord(E, V.sheng, E.bus.room, k * 4, 4, [r + 12, r + 19, r + 24], 0.6));
    each(0, 12, 4, (b) => E.play(V.pengling, E.bus.room, b, 0.5, 86, 0.6));
    E.on('gust', (b) => { whoosh(E.ctx, E.bus.room, E.T(b), 1.4, 300, 4000, 0.18); gliss(E, V.pipa, E.bus.room, b, [62, 66, 69, 74], 0.03, 0.8); });
    E.on('scarf', (b) => gliss(E, V.pipa, E.bus.room, b, run(66, 8), 0.05, 0.5));
    E.on('calm', (b) => E.play(V.pengling, E.bus.room, b, 0.5, 91, 0.7));
  },
  song(E) {
    // the grand view: guqin, slides, harmonics, lots of air
    E.melody(V.guqin, E.bus.hall, { vel: 0.95, slides: true, skipBar: 1 });
    E.play(V.qinHarm, E.bus.hall, 4, 4, 74, 0.6);
    E.on('pushIn', (b) => { E.play(V.qinHarm, E.bus.hall, b, 2, 81, 0.5); E.play(V.qinHarm, E.bus.hall, b + 0.5, 2, 78, 0.4); });
    E.on('bell', (b) => E.play(V.qinHarm, E.bus.hall, b, 2, 86, 0.8));
  },
  qingming(E) {
    E.melody(V.dizi, E.bus.room, { vel: 0.9, graces: true });
    each(0, 12, 1, (b) => E.play(V.tanggu, E.bus.input, b, 0.2, 60, b % 2 ? 0.5 : 0.8));
    each(0.5, 12, 2, (b) => E.play(V.tanggu, E.bus.input, b, 0.2, 60, 0.45));
    each(1, 12, 2, (b) => E.play(V.gongS, E.bus.input, b, 0.5, 60, 0.6));
    each(0, 12, 4, (b) => E.play(V.bo, E.bus.input, b, 0.3, 60, 0.8));
    E.play(V.gongL, E.bus.room, 0, 2, 60, 0.7);
    E.on('crowdTurns', (b) => { E.play(V.bo, E.bus.input, b, 0.3, 60, 1); E.play(V.gongL, E.bus.room, b, 2, 60, 0.9); });
    E.on('mastBonk', (b) => { E.play(V.muyu, E.bus.input, b, 0.2, 60, 1); E.play(V.gongS, E.bus.input, b + 0.08, 0.5, 60, 0.8); });
    E.on('bunsRoll', (b) => each(0, 1.2, 0.15, (k) => E.play(V.muyu, E.bus.input, b + k, 0.1, 60, 0.6 - k * 0.3)));
  },
  maya(E) {
    E.melody(V.ocarina, E.bus.room, { vel: 0.95 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 0.5, (b) => E.play(V.slit, E.bus.input, b, 0.2, roots[Math.floor(b / 4)] + (Math.round(b * 2) % 3 === 1 ? 7 : 12), 0.5));
    each(0.5, 12, 1, (b) => E.play(V.rattle, E.bus.input, b, 0.1, 60, 0.7));
    E.on('deityPoints', (b) => E.play(V.conch, E.bus.hall, b, 1.5, 50, 0.9));
    E.on('placeRoll', (b) => gliss(E, V.slit, E.bus.input, b, [74, 72, 69, 67, 62], 0.08, 0.7));
    E.on('dotsOn', (b) => E.play(V.slit, E.bus.input, b, 0.1, 86, 0.5));
  },
  mughal(E) {
    E.melody(V.sitar, E.bus.room, { vel: 0.9, slides: true });
    each(0, 12, 1, (b) => E.play(V.tanpura, E.bus.room, b, 1, [57, 62, 62, 50][Math.round(b) % 4], 0.5));
    each(0, 12, 1, (b) => { const k = Math.round(b) % 4; E.play(k === 0 ? V.dha : V.na, E.bus.input, b, 0.2, 60, k === 0 ? 0.9 : 0.5); });
    each(0.5, 12, 1, (b) => E.play(V.na, E.bus.input, b, 0.1, 60, 0.3));
    E.on('allTurn', (b) => [0, 0.25, 0.5].forEach((k) => E.play(V.dha, E.bus.input, b + k, 0.2, 60, 0.8, { bend: 1.3 })));
    E.on('nisar', (b) => each(0, 1, 0.125, (k) => E.play(V.ghungroo, E.bus.input, b + k, 0.1, 60, 0.6)));
  },
  bada(E) {
    // xiao alone; bar 2 is silence — the glare is the music
    E.melody(V.xiao, E.bus.hall, { vel: 0.95, skipBar: 1 });
    E.on('glare', (b) => E.play(V.muyu, E.bus.hall, b, 0.2, 60, 0.9));
    E.on('hmph', (b) => E.play(V.xiao, E.bus.room, b, 0.25, 69, 0.4, { slideFrom: 74, slideTime: 0.2 }));
  },
  wayang(E) {
    E.melody(V.saron, E.bus.room, { vel: 0.9, scale: SCALES.slendro });
    // bonang interlocking off-beats around the melody note
    E.notes.forEach(([b, len, m]) => each(b + 0.25, b + len, 0.5, (k) => E.play(V.bonang, E.bus.input, k, 0.2, SCALES.slendro(m + 12), 0.5)));
    each(0, 12, 0.5, (b) => E.play(V.kendang, E.bus.input, b, 0.15, 60, [0.8, 0.3, 0.5, 0.35][Math.round(b * 2) % 4]));
    E.play(V.kempul, E.bus.room, 4, 2, 60, 0.8);
    E.play(V.gongAgeng, E.bus.hall, 11.5, 4, 60, 0.9);
    E.on('gununganSweep', (b) => { whoosh(E.ctx, E.bus.room, E.T(b), 0.9, 200, 1800, 0.14); E.play(V.kempul, E.bus.room, b, 2, 60, 0.9); });
    E.on('dance', (b) => each(0, 1, 0.125, (k) => E.play(V.kendang, E.bus.input, b + k, 0.1, 60, 0.6)));
    E.on('ogreJaw', (b) => E.play(V.gongAgeng, E.bus.hall, b, 2, 60, 0.6));
  },
  ukiyoe(E) {
    E.melody(V.shamisen, E.bus.room, { vel: 0.95, scale: SCALES.yo, slides: true });
    each(0, 12, 2, (b) => E.play(V.taiko, E.bus.input, b, 0.4, 60, b % 4 ? 0.5 : 0.9));
    each(1.5, 12, 2, (b) => E.play(V.tsuzumi, E.bus.input, b, 0.3, 60, 0.7));
    E.on('shower', (b) => {
      const n = E.ctx.createBufferSource(); n.buffer = noiseBuffer(E.ctx, 3, 89);
      const lp = E.ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 3000; lp.Q.value = 0.4;
      const g = E.ctx.createGain(); const t = E.T(b);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.15); g.gain.setValueAtTime(0.08, t + 1.85); g.gain.linearRampToValueAtTime(0, t + 2.05);
      n.connect(lp).connect(g).connect(E.bus.room); n.start(t); n.stop(t + 2.2);
      E.play(V.taiko, E.bus.input, b, 0.5, 60, 1);
    });
    E.on('gulp', (b) => slide(E.ctx, E.bus.input, E.T(b), 0.25, 55, 43, 0.14));
  },
  muybridge(E) {
    E.melody(V.musicbox, E.bus.room, { vel: 0.9 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 1, (b) => { const r = roots[Math.floor(b / 4)]; if (Math.round(b) % 2) chord(E, V.playerPiano, E.bus.input, b, 0.4, triad(r + 12, r === 59), 0.35); else E.play(V.playerPiano, E.bus.input, b, 0.5, r - 12, 0.5); });
    each(0, 12, 1, (b) => E.play(V.shutter, E.bus.input, b, 0.1, 60, 0.5));
    E.on('shutter', (b) => each(0, 4, 0.125, (k) => E.play(V.shutter, E.bus.input, b + k, 0.05, 60, 0.8)));
    E.on('proofCircle', (b) => whoosh(E.ctx, E.bus.input, E.T(b), 0.35, 2000, 5000, 0.08));
    E.on('banknote', (b) => E.play(V.toast, E.bus.room, b, 0.5, 88, 0.9));
  },
  starry(E) {
    E.melody(V.strings, E.bus.hall, { vel: 0.9 });
    E.notes.forEach(([b, len, m]) => each(b, b + len, 0.25, (k) => E.play(V.harp, E.bus.room, k, 0.3, m - 12 + [0, 7, 12, 16][Math.round(k * 4) % 4], 0.25)));
    each(0, 12, 2, (b) => E.play(V.celesta, E.bus.hall, b + 0.75, 0.5, 86 + (b % 4 ? 2 : 0), 0.4));
    E.on('skySpinUp', (b) => { gliss(E, V.harp, E.bus.hall, b, run(57, 10), 0.05, 0.5); E.play(V.violin, E.bus.hall, b, 4, 74, 0.6); });
    E.on('bell', (b) => E.play(V.church, E.bus.hall, b, 2, 62, 0.9));
  },
  scream(E) {
    E.melody(V.strings, E.bus.hall, { vel: 0.9, detuneFrom: E.cueBeat('silence') ?? 7, detuneCents: -70 });
    const roots = ROOTS[E.phrase];
    roots.forEach((r, k) => chord(E, V.strings, E.bus.room, k * 4, 4, [r - 12, r - 5], 0.5));
    E.on('pelicanScreams', (b) => E.play(V.violin, E.bus.hall, b, 1, 86, 0.9, { bend: 600 }));
    E.on('everybodyScreams', (b) => chord(E, V.violin, E.bus.hall, b, 1, [84, 85, 87, 90], 0.8));
  },
  moon(E) {
    E.melody(V.piano, E.bus.room, { vel: 0.95, octave: 1 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 1, (b) => { const r = roots[Math.floor(b / 4)]; if (Math.round(b) % 2) chord(E, V.piano, E.bus.input, b, 0.4, triad(r, r === 59), 0.45); else E.play(V.piano, E.bus.input, b, 0.4, r - 12, 0.6); });
    E.on('ramp', (b) => slide(E.ctx, E.bus.input, E.T(b), 0.9, 60, 84, 0.08, 'triangle'));
    E.on('splat', (b) => { E.play(V.snare, E.bus.room, b, 0.3, 60, 1); E.play(V.bo, E.bus.room, b, 0.5, 60, 1); });
    E.on('sneeze', (b) => { whoosh(E.ctx, E.bus.input, E.T(b), 0.3, 1200, 600, 0.2); chord(E, V.piano, E.bus.input, b, 0.3, [49, 50, 53, 56], 0.7); });
    E.on('land', (b) => E.play(V.kick808, E.bus.input, b, 0.4, 60, 0.6));
  },
  nosferatu(E) {
    E.melody(V.organ, E.bus.hall, { vel: 0.9, scale: SCALES.minor });
    const roots = { A: [38, 43, 45], B: [38, 46, 45] }[E.phrase];
    roots.forEach((r, k) => E.play(V.pedal, E.bus.hall, k * 4, 4, r + 24, 0.8));
    each(0, 12, 0.125, (b) => { if (Math.floor(b) % 2 === 0) E.play(V.violin, E.bus.hall, b, 0.12, 62, 0.12); });
    E.on('shadowClimbs', (b) => each(0, 4, 0.5, (k) => E.play(V.pizz, E.bus.hall, b + k, 0.3, 50 + k * 2, 0.7)));
    E.on('claw', (b) => chord(E, V.organ, E.bus.hall, b, 1.5, [62, 63, 68, 74], 0.8));
    E.on('snapBack', (b) => slide(E.ctx, E.bus.room, E.T(b), 0.3, 74, 50, 0.08, 'sawtooth'));
  },
  chat(E) {
    E.melody(V.square, E.bus.input, { vel: 0.9 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 0.5, (b) => E.play(V.tri, E.bus.input, b, 0.4, roots[Math.floor(b / 4)] + (Math.round(b * 2) % 2 ? 7 : 0), 0.7));
    each(0, 12, 0.5, (b) => E.play(V.hat, E.bus.input, b, 0.05, 60, 0.6));
    for (const n of ['msg', 'gifPop', 'send']) E.on(n, (b) => E.play(V.ping, E.bus.input, b, 0.2, 60, 0.9));
    E.on('nudge', (b) => { const t = E.T(b); const o = E.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 70; const g = E.ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.setValueAtTime(0.06, t + 0.28); g.gain.linearRampToValueAtTime(0, t + 0.32); o.connect(g).connect(E.bus.input); o.start(t); o.stop(t + 0.35); });
  },
  vapor(E) {
    // the theme slowed 0.75× and pitched down, drowned in reverb; snaps back at the crossing
    E.melody(V.epiano, E.bus.hall, { vel: 0.9, speed: 0.75, transpose: -5 });
    E.melody(V.pad, E.bus.hall, { vel: 0.6, speed: 0.75, transpose: -17 });
    each(2, 12, 4, (b) => E.play(V.snare, E.bus.hall, b, 0.3, 60, 0.6));
    each(0, 12, 4, (b) => E.play(V.kick808, E.bus.input, b, 0.4, 60, 0.4));
    E.on('speedUp', (b) => slide(E.ctx, E.bus.room, E.T(b), 0.5, 45, 57, 0.06, 'sawtooth'));
    E.on('glitch', (b) => each(0, 0.5, 0.0625, (k) => E.play(V.hat, E.bus.input, b + k, 0.03, 60, 0.9)));
  },
  shorts(E) {
    E.melody(V.pluck, E.bus.room, { vel: 0.95, octave: 1 });
    const roots = ROOTS[E.phrase];
    each(0, 12, 1, (b) => E.play(V.sub, E.bus.input, b, 0.45, roots[Math.floor(b / 4)], 0.7));
    each(0, 12, 4, (b) => { [0, 1.5, 2].forEach((k) => E.play(V.kick808, E.bus.input, b + k, 0.4, 60, 0.9)); });
    each(1, 12, 2, (b) => E.play(V.clap, E.bus.input, b, 0.2, 60, 0.9));
    each(0, 12, 0.5, (b) => E.play(V.hat, E.bus.input, b + 0.25, 0.05, 60, 0.7));
    E.on('freeze', (b) => slide(E.ctx, E.bus.input, E.T(b), 0.4, 72, 40, 0.1, 'sawtooth'));
    E.on('wheelie', (b) => whoosh(E.ctx, E.bus.room, E.T(b), 1.0, 300, 6000, 0.12));
    E.on('likesBurst', (b) => each(0, 1, 0.0625, (k) => slide(E.ctx, E.bus.input, E.T(b + k), 0.06, 84 + k * 8, 96 + k * 8, 0.04)));
  },
  code(E) {
    E.melody(V.piano, E.bus.room, { vel: 0.9 });
    const roots = ROOTS[E.phrase];
    roots.forEach((r, k) => chord(E, V.pad, E.bus.hall, k * 4, 4, triad(r + 12, r === 59), 0.5));
    each(0, 12, 0.25, (b) => { const r = roots[Math.floor(b / 4)]; E.play(V.keys, E.bus.room, b, 0.2, r + 12 + [0, 7, 12, 16][Math.round(b * 4) % 4], 0.4); });
    each(3, 8, 0.5, (b) => E.play(V.typing, E.bus.input, b, 0.02, 60, 0.6));
    E.on('complete', (b) => chord(E, V.piano, E.bus.hall, b, 4, [50, 57, 62, 66, 69, 74], 0.6));
    E.on('toast', (b) => E.play(V.toast, E.bus.room, b, 0.5, 93, 0.6));
  },
};
