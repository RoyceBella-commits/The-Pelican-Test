// Score renderer. One code path for both uses:
//   • the preview page renders the whole film's audio once (OfflineAudioContext) and plays the buffer
//   • tools/audio.mjs renders the same buffer to audio/mix.wav
import { DURATION } from '../src/beat/timeline.js';
import { reverbIR } from './dsp.js';

export const SR = 48000;

/** Master bus: dry + reverb sends → bus compressor → soft limiter → destination. */
export function makeBus(ctx) {
  const input = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
  const out = ctx.createGain(); out.gain.value = 0.9;
  input.connect(dry).connect(comp);
  // shared reverbs: a room and a hall
  const mkVerb = (sec, damp, seed) => {
    const send = ctx.createGain(); send.gain.value = 1;
    const cv = ctx.createConvolver(); cv.buffer = reverbIR(ctx, sec, { damp, seed }); cv.normalize = true;
    const ret = ctx.createGain(); ret.gain.value = 0.35;
    send.connect(cv).connect(ret).connect(comp);
    return send;
  };
  const room = mkVerb(1.2, 0.5, 1), hall = mkVerb(3.2, 0.7, 2);
  comp.connect(lim).connect(out).connect(ctx.destination);
  return { input, room, hall, comp, out };
}

/**
 * Render the score between [from, to] seconds of film time into an AudioBuffer.
 * opts.only: optional list of layer names to render (e.g. ['bell'] for sync checks).
 */
export async function renderScore(opts = {}) {
  const from = opts.from ?? 0, to = opts.to ?? DURATION;
  const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * SR), SR);
  const bus = makeBus(ctx);
  const { buildScore } = await import('./score.js');
  await buildScore(ctx, bus, { from, to, only: opts.only, scenes: opts.scenes });
  return ctx.startRendering();
}
