// Low-level synthesis helpers for the Web Audio score. Everything deterministic:
// noise and plucked-string buffers come from a seeded PRNG and are cached.
import { rng, hash } from '../src/kit/math.js';

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const bufCache = new Map();
function cached(ctx, key, make) {
  const k = `${ctx.sampleRate}:${key}`;
  let b = bufCache.get(k);
  if (!b) { b = make(); bufCache.set(k, b); }
  return b;
}

/** Mono white-noise buffer (seconds). */
export function noiseBuffer(ctx, seconds = 2, seed = 1) {
  return cached(ctx, `noise:${seconds}:${seed}`, () => {
    const n = Math.ceil(seconds * ctx.sampleRate);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0), r = rng(hash('noise', seed));
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return b;
  });
}

/**
 * Karplus–Strong plucked string with a fractional (allpass) delay for exact tuning.
 * opts: { decay (s to −60 dB), bright (0..1 initial brightness), damp (0..1 loop lowpass), buzz (0..1 sitar/shamisen sawari), seed }
 */
export function pluckBuffer(ctx, freq, opts = {}) {
  const sr = ctx.sampleRate;
  const dur = opts.dur ?? Math.min(6, (opts.decay ?? 2.5) * 1.1);
  const key = `pluck:${freq.toFixed(3)}:${opts.decay}:${opts.bright}:${opts.damp}:${opts.buzz}:${opts.seed}:${dur}`;
  return cached(ctx, key, () => {
    const n = Math.ceil(dur * sr);
    const b = ctx.createBuffer(1, n, sr);
    const out = b.getChannelData(0);
    const r = rng(hash('ks', freq, opts.seed ?? 0));
    const P = sr / freq;                         // period in samples
    const N = Math.floor(P - 0.5);              // integer delay (the 2-tap average adds 0.5)
    const frac = P - N - 0.5;
    const ap = (1 - frac) / (1 + frac);          // first-order allpass for the fractional part
    const line = new Float32Array(N + 2);
    const bright = opts.bright ?? 0.6;
    let lp = 0;
    for (let i = 0; i < line.length; i++) {      // excitation: noise, low-passed for darker plucks
      const w = r() * 2 - 1;
      lp = lp + (w - lp) * (0.15 + 0.85 * bright);
      line[i] = lp;
    }
    // loop gain from decay time (−60 dB after `decay` s)
    const g = Math.pow(10, -3 / ((opts.decay ?? 2.5) * freq));
    const damp = opts.damp ?? 0.5;
    const buzz = opts.buzz ?? 0;
    let idx = 0, prev = 0, apX = 0, apY = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      out[i] = cur;
      // two-tap average weighted by damping
      let y = g * ((1 - damp * 0.5) * cur + damp * 0.5 * prev);
      // fractional delay allpass
      const yy = ap * y + apX - ap * apY;
      apX = y; apY = yy;
      let v = yy;
      if (buzz > 0) v = v + buzz * 0.35 * (Math.abs(v) > 0.08 ? Math.sign(v) * (Math.abs(v) - 0.08) * 0.5 : 0);   // bridge buzz
      prev = cur;
      line[idx] = v;
      idx = (idx + 1) % line.length;
    }
    // gentle normalisation
    let peak = 0;
    for (let i = 0; i < Math.min(n, sr * 0.2); i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
    return b;
  });
}

/** Reverb impulse response: decaying stereo noise with a pre-delay and a darkening tail. */
export function reverbIR(ctx, seconds = 2.4, opts = {}) {
  return cached(ctx, `ir:${seconds}:${opts.damp}:${opts.pre}:${opts.seed}`, () => {
    const sr = ctx.sampleRate, n = Math.ceil(seconds * sr), pre = Math.floor((opts.pre ?? 0.012) * sr);
    const b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch), r = rng(hash('ir', seconds, ch, opts.seed ?? 0));
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const k = (i - pre) / (n - pre);
        const env = Math.pow(1 - k, 2.2) * Math.exp(-k * 3);
        const a = 0.65 - 0.5 * k * (opts.damp ?? 0.6);          // tail gets darker
        lp = lp + ((r() * 2 - 1) - lp) * a;
        d[i] = lp * env;
      }
    }
    return b;
  });
}

/** Schedule an ADSR on an AudioParam. */
export function adsr(param, t, dur, { a = 0.01, d = 0.1, s = 0.6, r = 0.2, peak = 1 } = {}) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(peak * s, t + a, d / 3);
  const off = t + Math.max(dur, a + 0.001);
  param.setTargetAtTime(0, off, r / 3);
  return off + r * 2;          // when the voice can be stopped
}

/** Equal-power stereo placement helper: returns a node to connect into. */
export function panned(ctx, out, pan = 0) {
  if (!pan) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

/** 16-bit PCM WAV from an AudioBuffer. */
export function wavBytes(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
  const bytes = 44 + n * ch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Uint8Array(v.buffer);
}
