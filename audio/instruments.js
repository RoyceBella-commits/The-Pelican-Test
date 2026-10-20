// Instrument voices built from Web Audio nodes (and Karplus–Strong buffers).
// Every voice: play(ctx, out, t, midi, dur, vel = 0.8, opts = {}) → end time.
// `out` is any AudioNode input. Voices create and schedule their own nodes.
import { mtof, noiseBuffer, pluckBuffer, adsr, panned } from './dsp.js';

const osc = (ctx, type, f, t, stop) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; };
const gain = (ctx, v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (ctx, type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

// ------------------------------------------------------------------ plucked strings
/** Factory for plucked instruments (harp, pipa, guqin, shamisen, sitar, kora…). */
export function plucked(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const buf = pluckBuffer(ctx, f, { decay: p.decay ?? 2.5, bright: (p.bright ?? 0.6) * (0.7 + 0.3 * vel), damp: p.damp ?? 0.5, buzz: p.buzz ?? 0, seed: (o.seed ?? 0) + midi });
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // slides (吟猱 / meend): playbackRate glides from a neighbouring pitch
    if (o.slideFrom != null) {
      src.playbackRate.setValueAtTime(Math.pow(2, (o.slideFrom - midi) / 12), t);
      src.playbackRate.exponentialRampToValueAtTime(1, t + (o.slideTime ?? 0.12));
    }
    if (o.vibrato) {
      const lfo = osc(ctx, 'sine', o.vibratoRate ?? 5.5, t, t + dur + 1);
      const lg = gain(ctx, o.vibrato);
      lfo.connect(lg).connect(src.playbackRate);
    }
    const g = gain(ctx, 0);
    const end = t + Math.min(buf.duration, dur + (p.ring ?? 0.8));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * (p.level ?? 0.5), t + 0.003);
    g.gain.setValueAtTime(vel * (p.level ?? 0.5), Math.max(t + 0.004, end - 0.08));
    g.gain.linearRampToValueAtTime(0, end);
    let node = src;
    if (p.body) { const b = filt(ctx, 'peaking', p.body, 1.2); b.gain.value = 5; node.connect(b); node = b; }
    if (p.lp) { const l = filt(ctx, 'lowpass', p.lp, 0.5); node.connect(l); node = l; }
    node.connect(g).connect(panned(ctx, out, o.pan ?? p.pan ?? 0));
    src.start(t);
    src.stop(end + 0.05);
    // plectrum / bachi click
    if (p.click) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.2, 7);
      const bp = filt(ctx, 'bandpass', p.clickFreq ?? 2500, 1.2), cg = gain(ctx, 0);
      cg.gain.setValueAtTime(p.click * vel, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      n.connect(bp).connect(cg).connect(panned(ctx, out, o.pan ?? p.pan ?? 0));
      n.start(t); n.stop(t + 0.05);
    }
    return end;
  };
}

// ------------------------------------------------------------------ bells & metallophones
/** Additive inharmonic bell. partials: [[ratio, amp, decay], ...] */
export function bell(p = {}) {
  const partials = p.partials || [[1, 1, 2.5], [2.76, 0.5, 1.4], [5.4, 0.25, 0.8], [8.93, 0.12, 0.5]];
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    let end = t;
    for (const [ratio, amp, dec] of partials) {
      const D = dec * (p.decayScale ?? 1);
      const o1 = osc(ctx, 'sine', f * ratio * (1 + (p.detune ?? 0) * (ratio - 1) * 0.001), t, t + D * 3 + 0.1);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * vel * (p.level ?? 0.25), t + (p.attack ?? 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t + D * 3);
      if (p.beat) { // slow beating (gamelan ombak): a twin partial slightly detuned
        const o2 = osc(ctx, 'sine', f * ratio + p.beat, t, t + D * 3 + 0.1);
        o2.connect(g);
      }
      o1.connect(g).connect(dest);
      end = Math.max(end, t + D * 3);
    }
    if (p.strike) {   // mallet strike transient
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.2, 11);
      const bp = filt(ctx, 'bandpass', f * (p.strikeRatio ?? 3), 2), g = gain(ctx, 0);
      g.gain.setValueAtTime(p.strike * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      n.connect(bp).connect(g).connect(dest); n.start(t); n.stop(t + 0.06);
    }
    return end;
  };
}

// ------------------------------------------------------------------ winds
/** Breathy wind instrument (dizi, xiao, ocarina, flute, panpipe). */
export function wind(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + (p.release ?? 0.15) * 3 + 0.1;
    const tone = osc(ctx, p.wave ?? 'sine', f, t, stop);
    if (o.slideFrom != null) {
      tone.frequency.setValueAtTime(mtof(o.slideFrom + (p.octave ?? 0) * 12), t);
      tone.frequency.exponentialRampToValueAtTime(f, t + (o.slideTime ?? 0.1));
    }
    const vib = osc(ctx, 'sine', p.vibRate ?? 5.2, t, stop);
    const vg = gain(ctx, 0);
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * (p.vib ?? 0.008), t + Math.min(0.4, dur * 0.6));
    vib.connect(vg).connect(tone.frequency);
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: p.attack ?? 0.05, d: 0.1, s: 0.85, r: p.release ?? 0.15, peak: vel * (p.level ?? 0.3) });
    let node = tone;
    if (p.harm) { // add an octave/twelfth for brighter winds
      const h = osc(ctx, 'sine', f * 2, t, stop), hg = gain(ctx, p.harm);
      h.connect(hg).connect(g);
    }
    node.connect(g).connect(dest);
    // breath noise
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 4, 3); n.loop = true;
    const bp = filt(ctx, 'bandpass', f * (p.breathRatio ?? 2), p.breathQ ?? 1.5), ng = gain(ctx, 0);
    adsr(ng.gain, t, dur, { a: 0.03, d: 0.15, s: 0.5, r: p.release ?? 0.15, peak: vel * (p.breath ?? 0.08) });
    n.connect(bp).connect(ng).connect(dest);
    n.start(t, (midi * 0.137) % 3); n.stop(stop);
    // dizi membrane buzz (笛膜): a resonant band of bright noise
    if (p.membrane) {
      const m = ctx.createBufferSource(); m.buffer = noiseBuffer(ctx, 4, 5); m.loop = true;
      const mb = filt(ctx, 'bandpass', f * 4, 6), mg = gain(ctx, 0);
      adsr(mg.gain, t, dur, { a: 0.04, d: 0.1, s: 0.6, r: 0.1, peak: vel * p.membrane });
      m.connect(mb).connect(mg).connect(dest); m.start(t); m.stop(stop);
    }
    return end;
  };
}

// ------------------------------------------------------------------ voice
/** Formant-filtered sawtooth voice (chant / choir "ah", "oh"). */
export function voice(p = {}) {
  const FORM = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700] };
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + 0.6;
    const src = osc(ctx, 'sawtooth', f, t, stop);
    const vib = osc(ctx, 'sine', 5, t, stop), vg = gain(ctx, f * 0.012);
    vib.connect(vg).connect(src.frequency);
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: p.attack ?? 0.08, d: 0.2, s: 0.8, r: p.release ?? 0.25, peak: vel * (p.level ?? 0.12) });
    const [f1, f2, f3] = FORM[o.vowel || p.vowel || 'a'];
    for (const [ff, q, a] of [[f1, 8, 1], [f2, 10, 0.6], [f3, 12, 0.3]]) {
      const b = filt(ctx, 'bandpass', ff, q), bg = gain(ctx, a);
      src.connect(b).connect(bg).connect(g);
    }
    g.connect(dest);
    return end;
  };
}

// ------------------------------------------------------------------ strings / keys / organs / synths
export function strings(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + (p.release ?? 0.4) * 3 + 0.1;
    const lp = filt(ctx, 'lowpass', p.lp ?? 2400, 0.6);
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: p.attack ?? 0.18, d: 0.3, s: 0.85, r: p.release ?? 0.4, peak: vel * (p.level ?? 0.08) });
    for (const det of p.detunes || [-7, 0, 6]) {
      const s = osc(ctx, 'sawtooth', f, t, stop);
      s.detune.value = det + (o.detune ?? 0);
      if (o.bend) { s.detune.setValueAtTime(det, t); s.detune.linearRampToValueAtTime(det + o.bend, t + dur); }
      s.connect(lp);
    }
    const vib = osc(ctx, 'sine', 5.6, t, stop), vg = gain(ctx, 0);
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
    lp.connect(g).connect(dest);
    void vib; void vg;
    return end;
  };
}

/** Additive piano-ish voice (stretched partials, hammer thump). */
export function piano(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const dec = (p.decay ?? 3.5) * Math.pow(0.5, (midi - 60) / 24);
    let end = t;
    const parts = [[1, 1], [2, 0.5], [3, 0.28], [4, 0.16], [5, 0.09], [6, 0.05]];
    for (const [k, a] of parts) {
      const fr = f * k * Math.sqrt(1 + 0.0004 * k * k);
      if (fr > 12000) continue;
      const D = dec / Math.sqrt(k);
      const o1 = osc(ctx, 'sine', fr, t, t + Math.min(D * 3, dur + 1.2) + 0.05), g = gain(ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * vel * (p.level ?? 0.18), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + D * 3);
      g.gain.setTargetAtTime(0, t + dur, 0.08);
      o1.connect(g).connect(dest);
      end = Math.max(end, t + Math.min(D * 3, dur + 1.2));
    }
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.3, 13);
    const lp = filt(ctx, 'lowpass', 1200, 1), ng = gain(ctx, 0);
    ng.gain.setValueAtTime(0.15 * vel, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(lp).connect(ng).connect(dest); n.start(t); n.stop(t + 0.08);
    return end;
  };
}

/** Drawbar organ with tremolo (silent-film / church). */
export function organ(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + 0.4;
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: 0.03, d: 0.05, s: 1, r: 0.12, peak: vel * (p.level ?? 0.07) });
    for (const [k, a] of p.drawbars || [[0.5, 0.6], [1, 1], [2, 0.7], [3, 0.4], [4, 0.3], [6, 0.15]]) {
      const s = osc(ctx, 'sine', f * k, t, stop), sg = gain(ctx, a);
      s.connect(sg).connect(g);
    }
    const trem = osc(ctx, 'sine', p.trem ?? 6, t, stop), tg = gain(ctx, 0.25 * vel * (p.level ?? 0.07));
    trem.connect(tg).connect(g.gain);
    g.connect(dest);
    return end;
  };
}

/** Simple oscillator synth (square MIDI ringtones, saw leads, triangle bass). */
export function synth(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + (p.release ?? 0.05) * 3 + 0.05;
    const s = osc(ctx, p.wave ?? 'square', f, t, stop);
    if (p.detune) { const s2 = osc(ctx, p.wave ?? 'square', f, t, stop); s2.detune.value = p.detune; s2.connect(s.__mix || (s.__mix = gain(ctx, 1))); }
    if (o.slideFrom != null) { s.frequency.setValueAtTime(mtof(o.slideFrom + (p.octave ?? 0) * 12), t); s.frequency.exponentialRampToValueAtTime(f, t + (o.slideTime ?? 0.06)); }
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: p.attack ?? 0.005, d: p.decay ?? 0.08, s: p.sustain ?? 0.6, r: p.release ?? 0.05, peak: vel * (p.level ?? 0.06) });
    let node = s;
    if (p.lp) {
      const l = filt(ctx, 'lowpass', p.lp, p.q ?? 0.7);
      if (p.env) { l.frequency.setValueAtTime(p.lp * p.env, t); l.frequency.exponentialRampToValueAtTime(p.lp, t + (p.envTime ?? 0.2)); }
      node.connect(l); node = l;
    }
    node.connect(g).connect(dest);
    if (s.__mix) s.__mix.connect(g);
    return end;
  };
}

/** Two-operator FM electric piano (vaporwave / code). */
export function epiano(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = mtof(midi + (p.octave ?? 0) * 12);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + 1.5;
    const car = osc(ctx, 'sine', f, t, stop), mod = osc(ctx, 'sine', f * (p.ratio ?? 1), t, stop);
    const mg = gain(ctx, 0);
    mg.gain.setValueAtTime(f * (p.index ?? 2.5) * vel, t); mg.gain.exponentialRampToValueAtTime(f * 0.1 + 1, t + 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * (p.level ?? 0.15), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + (p.decay ?? 2.2));
    g.gain.setTargetAtTime(0, t + dur, 0.15);
    car.connect(g).connect(dest);
    return Math.min(stop, t + (p.decay ?? 2.2));
  };
}

// ------------------------------------------------------------------ percussion
/** Pitched membrane (frame drum, hand drum, tabla, taiko-ish, kick). */
export function drum(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f0 = p.freq ?? mtof(midi);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const D = p.decay ?? 0.35;
    const s = osc(ctx, 'sine', f0 * (p.pitchFrom ?? 2.2), t, t + D * 3 + 0.05);
    s.frequency.exponentialRampToValueAtTime(f0, t + (p.pitchTime ?? 0.03));
    if (o.bend) s.frequency.linearRampToValueAtTime(f0 * o.bend, t + D * 1.5);  // tabla bayan glide
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(vel * (p.level ?? 0.6), t); g.gain.exponentialRampToValueAtTime(0.0005, t + D * 3);
    let node = s;
    if (p.drive) { const ws = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * p.drive); } ws.curve = c; node.connect(ws); node = ws; }
    node.connect(g).connect(dest);
    if (p.ring) { // dayan ring partial
      const r = osc(ctx, 'sine', f0 * p.ring, t, t + D * 2), rg = gain(ctx, 0);
      rg.gain.setValueAtTime(vel * (p.level ?? 0.6) * 0.4, t); rg.gain.exponentialRampToValueAtTime(0.0005, t + D * 2);
      r.connect(rg).connect(dest);
    }
    if (p.slap) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.3, 17);
      const bp = filt(ctx, 'bandpass', p.slapFreq ?? 1800, 0.9), ng = gain(ctx, 0);
      ng.gain.setValueAtTime(p.slap * vel, t); ng.gain.exponentialRampToValueAtTime(0.001, t + (p.slapDecay ?? 0.05));
      n.connect(bp).connect(ng).connect(dest); n.start(t); n.stop(t + 0.1);
    }
    return t + D * 3;
  };
}

/** Filtered noise hit (snare, hat, clap, shaker, shutter, chain tick). */
export function noiseHit(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const D = p.decay ?? 0.08;
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 1, p.seed ?? 19);
    const f = filt(ctx, p.type ?? 'highpass', p.freq ?? 6000, p.q ?? 0.7), g = gain(ctx, 0);
    const reps = p.claps ?? 1;
    for (let k = 0; k < reps; k++) {
      const tk = t + k * 0.011;
      g.gain.setValueAtTime(vel * (p.level ?? 0.3) * (k === reps - 1 ? 1 : 0.6), tk);
      g.gain.exponentialRampToValueAtTime(0.0005, tk + (k === reps - 1 ? D : 0.01));
    }
    n.connect(f).connect(g).connect(dest);
    n.start(t, (Math.abs(o.seed ?? 0) * 0.0131) % 0.8); n.stop(t + D * 2 + reps * 0.012 + 0.05);
    if (p.body) { const b = drum({ freq: p.body, decay: 0.05, level: (p.level ?? 0.3) * 0.6, pitchFrom: 1.6 }); b(ctx, out, t, 60, 0.05, vel, o); }
    return t + D * 2;
  };
}

/** Gong / tam-tam (锣): inharmonic partials with a slow pitch sag. */
export function gong(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const f = p.freq ?? mtof(midi);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const D = p.decay ?? 2.5;
    for (const [r, a] of p.partials || [[1, 1], [1.48, 0.6], [2.12, 0.4], [2.89, 0.3], [3.71, 0.2]]) {
      const s = osc(ctx, 'sine', f * r, t, t + D * 2), g = gain(ctx, 0);
      if (p.sag) s.frequency.exponentialRampToValueAtTime(f * r * (1 - p.sag), t + D);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * vel * (p.level ?? 0.12), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + D * 2 * (1 / Math.sqrt(r)));
      s.connect(g).connect(dest);
    }
    return t + D * 2;
  };
}

// ------------------------------------------------------------------ chip voices (8-bit console)
const waveCache = new WeakMap();
function periodic(ctx, key, coef) {
  let m = waveCache.get(ctx); if (!m) waveCache.set(ctx, (m = new Map()));
  if (!m.has(key)) { const { re, im } = coef(); m.set(key, ctx.createPeriodicWave(re, im)); }
  return m.get(key);
}
/** Pulse wave with duty d (0.125 / 0.25 / 0.5), from its Fourier series. */
const pulseWave = (ctx, d) => periodic(ctx, 'pulse' + d, () => {
  const N = 64, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { re[n] = Math.sin(2 * Math.PI * n * d) / (n * Math.PI); im[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (n * Math.PI); }
  return { re, im };
});
/** 4-bit stepped triangle (32 steps per period), the console's bass channel. */
const triWave = (ctx) => periodic(ctx, 'tri4', () => {
  const S = 1024, N = 96, re = new Float32Array(N), im = new Float32Array(N);
  const x = (k) => { const s = Math.floor((k / S) * 32); return (s < 16 ? 15 - s : s - 16) / 7.5 - 1; };
  for (let n = 1; n < N; n++) {
    let a = 0, b = 0;
    for (let k = 0; k < S; k++) { const ph = (2 * Math.PI * n * k) / S; a += x(k) * Math.cos(ph); b += x(k) * Math.sin(ph); }
    re[n] = (a * 2) / S; im[n] = (b * 2) / S;
  }
  return { re, im };
});
/** Pulse (p.duty) or stepped-triangle (no duty) chip voice. opts.sweepTo: pitch sweep over the note. */
export function chip(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const oct = (p.octave ?? 0) * 12, f = mtof(midi + oct);
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const stop = t + dur + (p.release ?? 0.02) * 3 + 0.05;
    const s = ctx.createOscillator();
    s.setPeriodicWave(p.duty ? pulseWave(ctx, p.duty) : triWave(ctx));
    s.frequency.setValueAtTime(o.slideFrom != null ? mtof(o.slideFrom + oct) : f, t);
    if (o.slideFrom != null) s.frequency.exponentialRampToValueAtTime(f, t + (o.slideTime ?? 0.06));
    if (o.sweepTo != null) s.frequency.exponentialRampToValueAtTime(mtof(o.sweepTo + oct), t + dur);
    if (p.vib) { const l = osc(ctx, 'sine', p.vibRate ?? 6, t + (p.vibDelay ?? 0.15), stop); const lg = gain(ctx, f * p.vib); l.connect(lg).connect(s.frequency); }
    s.start(t); s.stop(stop);
    const g = gain(ctx, 0);
    const end = adsr(g.gain, t, dur, { a: p.attack ?? 0.002, d: p.decay ?? 0.1, s: p.sustain ?? 0.7, r: p.release ?? 0.02, peak: vel * (p.level ?? 0.05) });
    s.connect(g).connect(dest);
    return end;
  };
}
const lfsrCache = new WeakMap();
/** 15-bit LFSR noise held for `hold` samples; short mode (tap 6) gives the metallic periodic noise. */
function lfsrBuffer(ctx, hold, short) {
  let m = lfsrCache.get(ctx); if (!m) lfsrCache.set(ctx, (m = new Map()));
  const key = hold + (short ? 's' : 'l');
  if (m.has(key)) return m.get(key);
  const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let r = 1, v = 1;
  for (let i = 0; i < len; i++) {
    if (i % hold === 0) { const fb = (r & 1) ^ ((r >> (short ? 6 : 1)) & 1); r = (r >> 1) | (fb << 14); v = r & 1 ? -1 : 1; }
    d[i] = v;
  }
  m.set(key, buf);
  return buf;
}
/** Noise channel hit (drums, crackle). */
export function chipNoise(p = {}) {
  return (ctx, out, t, midi, dur, vel = 0.8, o = {}) => {
    const dest = panned(ctx, out, o.pan ?? p.pan ?? 0);
    const n = ctx.createBufferSource(); n.buffer = lfsrBuffer(ctx, p.hold ?? 4, !!p.short); n.loop = true;
    const D = p.decay ?? 0.06, g = gain(ctx, 0);
    g.gain.setValueAtTime(vel * (p.level ?? 0.05), t); g.gain.linearRampToValueAtTime(0, t + D);
    n.connect(g).connect(dest); n.start(t); n.stop(t + D + 0.02);
    return t + D;
  };
}
