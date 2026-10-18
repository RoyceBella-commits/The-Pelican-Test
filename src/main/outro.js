// Outro (125–137 s): the scroll pulls back, folds row by row on the beat into a
// 4×5 museum wall, every panel holding its own era's frozen pelican.
import {
  OUTRO_START, DURATION, FPS, PITCH, PANEL, CAMERA_Y, BASE_PX_PER_UNIT, N_SCENES, panelLeft,
} from '../beat/timeline.js';
import { smoothstep, smootherstep, lerp, easeInOut, easeOutBack, clamp } from '../kit/math.js';

const GP = 1200;                                  // wall pitch (panel + gap)
const ANCHOR_X = 17 * PITCH + PANEL / 2 + 40;     // centre column = strip position of panel 18
const ROW3_Y = PANEL / 2;                         // bottom row stays at the scroll height

export const T_PULL = OUTRO_START;                // 125: pull back starts
export const T_STRIP = OUTRO_START + 1.6;         // whole scroll visible
export const T_SETTLE = OUTRO_START + 4;          // 129: wall complete (downbeat)
export const T_CAP1 = OUTRO_START + 6;            // 131
export const T_CAP2 = OUTRO_START + 8.5;          // 133.5
const LAST_FRAME_T = (Math.round(DURATION * FPS) - 1) / FPS;

/** Strip (story) centre of panel i. */
const stripC = (i) => [panelLeft(i) + PANEL / 2, CAMERA_Y];
/** Wall centre of panel i. */
const wallC = (i) => {
  const col = i % 5, row = Math.floor(i / 5);
  return [ANCHOR_X + (col - 2) * GP, ROW3_Y + (row - 3) * GP];
};

/** Row r starts moving on a beat; bottom row spreads first, then rows 2, 1, 0 lift in. */
// arrivals land on beats: bottom row 127.5, then rows 2 → 0 at 128.0, 128.5, 129.0
const ROW_DUR = 1.1;
const rowStart = (r) => (r === 3 ? T_STRIP - 0.2 : T_STRIP + 1.4 + (2 - r) * 0.5 - ROW_DUR);

/** Centre of panel i at time t (world units), plus its fold progress. */
export function panelCentre(i, t) {
  if (t <= T_PULL) return { c: stripC(i), k: 0 };
  const r = Math.floor(i / 5);
  const k = clamp((t - rowStart(r)) / ROW_DUR);
  const a = stripC(i), b = wallC(i);
  // x eases in-out, y lifts with a slight overshoot so rows "drop" into place on the beat
  const kx = easeInOut(k);
  const ky = easeOutBack(smoothstep(0.15, 1, k), 1.1);
  return { c: [lerp(a[0], b[0], kx), lerp(a[1], b[1], ky)], k };
}

/** Outro camera (blends from the story camera at 125). */
export function outroCamera(t, storyCam) {
  const wallMid = [ANCHOR_X, ROW3_Y - 1.5 * GP];
  const strip = { cx: (panelLeft(0) + panelLeft(N_SCENES - 1) + PANEL) / 2, cy: CAMERA_Y, z: 1920 / ((N_SCENES * PITCH + 600) * BASE_PX_PER_UNIT) };
  // final framing: 4 rows (4·GP) take ~760 px, centred at screen y 400 to leave room for captions
  const zWall = 760 / (4 * GP * BASE_PX_PER_UNIT);
  const final = { cx: wallMid[0], cy: wallMid[1] + 140 / (zWall * BASE_PX_PER_UNIT), z: zWall };
  const w1 = smootherstep(T_PULL, T_STRIP, t);
  const w2 = smootherstep(T_STRIP + 0.3, T_SETTLE + 0.2, t);
  const lz = lerp(lerp(Math.log(storyCam.z), Math.log(strip.z), w1), Math.log(final.z), w2);
  const cx = lerp(lerp(storyCam.cx, strip.cx, w1), final.cx, w2);
  const cy = lerp(lerp(storyCam.cy, strip.cy, w1), final.cy, w2);
  // a slow drift-in during the captions keeps the wall alive
  const drift = 1 + 0.035 * smoothstep(T_SETTLE, LAST_FRAME_T, t);
  const z = Math.exp(lz) * drift;
  return { cx, cy, z, pxu: BASE_PX_PER_UNIT * z };
}

/** 0..1: how much the frozen tiles replace the live panels (crossfade at 125). */
export const tileMix = (t) => smoothstep(T_PULL, T_PULL + 0.5, t);
/** Preface sheet fades away as the scroll pulls back. */
export const introSheetAlpha = (t) => 1 - smoothstep(T_PULL + 0.4, T_PULL + 1.4, t);

export function drawOutroCaptions(K, t) {
  if (t < T_CAP1 - 0.1) return;
  const ink = 'rgba(244,236,220,1)';
  const a1 = smoothstep(T_CAP1, T_CAP1 + 0.5, t);
  const a2 = smoothstep(T_CAP2, T_CAP2 + 0.35, t);
  K.text({ text: '截至目前，人类共提交了 20 份答卷。', font: '"Songti SC", serif', weight: 600, size: 40, color: ink, align: 'center', letterSpacing: 2 }, 960, 818 - 8 * (1 - a1), 1, a1);
  K.text({ text: 'To date, humankind has handed in 20 answers.', font: '"Baskerville", serif', style: 'italic', size: 22, color: ink, align: 'center' }, 960, 870 - 8 * (1 - a1), 1, a1 * 0.8);
  if (a2 > 0) {
    K.text({ text: '研究仍在继续。', font: '"Songti SC", serif', weight: 600, size: 40, color: ink, align: 'center', letterSpacing: 4 }, 960, 926 - 6 * (1 - a2), 1, a2);
    K.text({ text: 'Research is ongoing.', font: '"Baskerville", serif', style: 'italic', size: 22, color: ink, align: 'center' }, 960, 978 - 6 * (1 - a2), 1, a2 * 0.8);
  }
}

/** Final fade: fully black on the last rendered frame. */
export const fadeToBlack = (t) => smoothstep(DURATION - 0.75, LAST_FRAME_T, t);
