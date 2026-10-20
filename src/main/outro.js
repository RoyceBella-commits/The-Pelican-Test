// Outro (125–137 s, 6 bars): the scroll pulls back and folds row by row on the beat into a
// 7 × 3 wall — cells 1–20 hold the panels, each with its own era's frozen pelican; cell 21
// is an empty press-conference seat (press.js). Then:
//   128.5  wall complete; wide shot, caption 1
//   131    the camera pushes slowly into cell 21; camera flashes on the strong beats
//   134    it stops; caption 2
//   136.5  last beat: the pelican streaks past behind the seat; the film ends on the empty seat
import {
  OUTRO_START, DURATION, FPS, PITCH, PANEL, CAMERA_Y, BASE_PX_PER_UNIT, N_SCENES, VIEW_W, VIEW_H, panelLeft,
} from '../beat/timeline.js';
import { smoothstep, smootherstep, lerp, easeInOut, easeOutBack, clamp } from '../kit/math.js';

export const COLS = 7, ROWS = 3;
export const N_CELLS = N_SCENES + 1;              // 20 panels + the press seat
export const PRESS = N_SCENES;                    // cell index of the press seat
const GP = 1200;                                  // wall pitch (panel + gap)
const ROW_LAST_Y = PANEL / 2;                     // the bottom row stays at the scroll height
// panel 20 (cell 19, bottom row, column 5) stays where the story left it
const ANCHOR_X = panelLeft(N_SCENES - 1) + PANEL / 2 - 2 * GP;   // x of the middle column

export const T_PULL = OUTRO_START;                // 125: pull back starts
export const T_STRIP = OUTRO_START + 1.2;         // whole scroll visible
export const T_ROW = [OUTRO_START + 3, OUTRO_START + 2.5, OUTRO_START + 2];   // rows 0, 1, 2 land (128, 127.5, 127)
export const T_SEAT = OUTRO_START + 3.5;          // 128.5: the press seat slides in; wall complete
export const T_CAP1 = OUTRO_START + 3.5;          // 128.5
export const T_PUSH0 = OUTRO_START + 6;           // 131: push-in starts
export const T_PUSH1 = OUTRO_START + 9;           // 134: stopped on the seat
export const T_CAP2 = OUTRO_START + 9;            // 134
// camera flashes: [t, strength] — the strong beats, each answered by a second photographer
export const FLASHES = [[131, 1], [131.1, 0.55], [132, 1], [133, 1], [133.12, 0.6], [133.25, 0.8]];
export const T_PASS = DURATION - 0.5;             // 136.5: the pelican streaks past
const ROW_DUR = 1.1, SEAT_DUR = 0.9;
export const LAST_FRAME_T = (Math.round(DURATION * FPS) - 1) / FPS;

/** Strip (story) centre of cell i (the seat would continue the scroll to the right). */
const stripC = (i) => [panelLeft(i) + PANEL / 2, CAMERA_Y];
/** Wall centre of cell i. */
export const wallC = (i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  return [ANCHOR_X + (col - 3) * GP, ROW_LAST_Y + (row - (ROWS - 1)) * GP];
};

/** Centre of cell i at time t (world units), its fold progress k, and whether it is in place. */
export function panelCentre(i, t) {
  if (i === PRESS) {
    // the seat arrives last: it slides in from the right and lands on the beat
    const k = clamp((t - (T_SEAT - SEAT_DUR)) / SEAT_DUR);
    const b = wallC(i);
    return { c: [b[0] + 1900 * (1 - easeOutBack(k, 0.9)), b[1]], k: Math.max(k, 1e-6), shown: k > 0 };
  }
  if (t <= T_PULL) return { c: stripC(i), k: 0, shown: true };
  const r = Math.floor(i / COLS);
  const k = clamp((t - (T_ROW[r] - ROW_DUR)) / ROW_DUR);
  const a = stripC(i), b = wallC(i);
  // x eases in-out, y lifts with a slight overshoot so rows "drop" into place on the beat
  const kx = easeInOut(k);
  const ky = easeOutBack(smoothstep(0.15, 1, k), 1.1);
  return { c: [lerp(a[0], b[0], kx), lerp(a[1], b[1], ky)], k, shown: true };
}

// wide framing: the wall spans ~90 % of the frame width, centred a little high so the captions fit below
const WALL_W = COLS * PANEL + (COLS - 1) * (GP - PANEL);
const Z_WIDE = (0.9 * VIEW_W) / (WALL_W * BASE_PX_PER_UNIT);
const WALL_MID = [ANCHOR_X, ROW_LAST_Y - GP];
const WIDE = { cx: WALL_MID[0], cy: WALL_MID[1] + (VIEW_H / 2 - 425) / (Z_WIDE * BASE_PX_PER_UNIT), z: Z_WIDE };
// close framing: cell 21 about 720 px tall, its centre at screen y 450
const Z_SEAT = 720 / (PANEL * BASE_PX_PER_UNIT);
const SEAT = { cx: wallC(PRESS)[0], cy: wallC(PRESS)[1] + (VIEW_H / 2 - 450) / (Z_SEAT * BASE_PX_PER_UNIT), z: Z_SEAT };

/** Outro camera (blends from the story camera at 125). */
export function outroCamera(t, storyCam) {
  const strip = { cx: (panelLeft(0) + panelLeft(N_SCENES - 1) + PANEL) / 2, cy: CAMERA_Y, z: VIEW_W / ((N_SCENES * PITCH + 600) * BASE_PX_PER_UNIT) };
  const w1 = smootherstep(T_PULL, T_STRIP, t);
  const w2 = smootherstep(T_STRIP + 0.2, T_SEAT + 0.1, t);
  const w3 = smootherstep(T_PUSH0, T_PUSH1, t);
  const mix = (k) => {
    const a = lerp(lerp(storyCam[k], strip[k], w1), WIDE[k], w2);
    return lerp(a, SEAT[k], w3);
  };
  const lz = lerp(lerp(lerp(Math.log(storyCam.z), Math.log(strip.z), w1), Math.log(WIDE.z), w2), Math.log(SEAT.z), w3);
  const z = Math.exp(lz);
  return { cx: mix('cx'), cy: mix('cy'), z, pxu: BASE_PX_PER_UNIT * z };
}

/** 0..1: how much the frozen tiles replace the live panels (crossfade at 125). */
export const tileMix = (t) => smoothstep(T_PULL, T_PULL + 0.5, t);
/** Preface sheet fades away as the scroll pulls back. */
export const introSheetAlpha = (t) => 1 - smoothstep(T_PULL + 0.4, T_PULL + 1.4, t);

/** Captions, centred below the wall. */
export function drawOutroCaptions(K, t) {
  const ink = 'rgba(244,236,220,1)';
  const a1 = smoothstep(T_CAP1, T_CAP1 + 0.5, t) * (1 - smoothstep(T_PUSH0 - 0.15, T_PUSH0 + 0.35, t));
  const a2 = smoothstep(T_CAP2, T_CAP2 + 0.4, t);
  if (a1 > 0) {
    K.text({ text: '截至目前，人类共提交了 20 份答卷。', font: '"Songti SC", serif', weight: 600, size: 44, color: ink, align: 'center', letterSpacing: 2 }, 960, 852 - 8 * (1 - a1), 1, a1);
    K.text({ text: 'To date, humankind has handed in 20 answers.', font: '"Baskerville", serif', style: 'italic', size: 24, color: ink, align: 'center' }, 960, 910 - 8 * (1 - a1), 1, a1 * 0.8);
  }
  if (a2 > 0) {
    K.text({ text: '鹈鹕本人对此尚未发表评论。', font: '"Songti SC", serif', weight: 600, size: 44, color: ink, align: 'center', letterSpacing: 2 }, 960, 852 - 6 * (1 - a2), 1, a2);
    K.text({ text: 'The pelican itself has yet to comment.', font: '"Baskerville", serif', style: 'italic', size: 24, color: ink, align: 'center' }, 960, 910 - 6 * (1 - a2), 1, a2 * 0.8);
  }
}

/** Flash intensity at t (0..1): a hard pop decaying in ~0.1 s. */
export function flashAt(t) {
  let f = 0;
  for (const [tf, k] of FLASHES) if (t >= tf && t < tf + 0.6) f = Math.max(f, k * Math.exp(-(t - tf) / 0.06));
  return f;
}
