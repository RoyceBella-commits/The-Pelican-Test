#!/usr/bin/env node
// Encode rendered frames (+ optional audio) with ffmpeg.
//
//   node tools/encode.mjs                 frames/*.png (+ audio/mix.wav if present) → out/pelican-test_1080p.mp4
//   node tools/encode.mjs --draft         frames_draft/*.jpg → out/draft.mp4 (720p, silent unless --audio)
//   --no-audio   --audio <wav>   --out <file>   --crf 16
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './server.mjs';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs(process.argv.slice(2));
const draft = !!a.draft;
const dir = path.resolve(ROOT, a.frames || (draft ? 'frames_draft' : 'frames'));
const pattern = path.join(dir, draft ? 'f%05d.jpg' : 'f%05d.png');
const out = path.resolve(ROOT, a.out || (draft ? 'out/draft.mp4' : 'out/pelican-test_1080p.mp4'));
const wav = a.audio ? path.resolve(ROOT, a.audio) : path.resolve(ROOT, 'audio/mix.wav');
const useAudio = !a['no-audio'] && fs.existsSync(wav) && (!draft || a.audio);
fs.mkdirSync(path.dirname(out), { recursive: true });

const args = ['-y', '-loglevel', 'error', '-stats', '-framerate', '30', '-i', pattern];
if (useAudio) args.push('-i', wav);
args.push(
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'slow', '-crf', String(a.crf ?? (draft ? 22 : 16)),
  '-r', '30', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
);
if (useAudio) args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest');
args.push('-movflags', '+faststart', out);
console.log(`ffmpeg → ${path.relative(ROOT, out)}${useAudio ? ' (with ' + path.relative(ROOT, wav) + ')' : ' (silent)'}`);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames,sample_rate', '-of', 'compact', out], { encoding: 'utf8' });
console.log(probe.stdout.trim());
