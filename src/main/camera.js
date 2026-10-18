// Camera = pure function of t.
//   • follows the rider with a symmetric window average (exact on constant speed)
//   • intro: holds on the preface sheet, then eases into the follow camera by t = 5
//   • a small push-in on every frame crossing (downbeat)
//   • scenes may override inside their own time window (identity near the seams)
//   • the outro supplies its own camera (see outro.js)
import {
  INTRO, N_SCENES, SCENE_DUR, OUTRO_START, CAMERA_Y, BASE_PX_PER_UNIT, VIEW_W, VIEW_H,
  sceneStart, sceneIndexAt, introLeft, INTRO_W,
} from '../beat/timeline.js';
import { riderX } from '../beat/ride.js';
import { smootherstep, lerp } from '../kit/math.js';

const HALF = 0.6;    // follow window half-width (s)
const NS = 13;
export const INTRO_CAM = { cx: introLeft() + INTRO_W / 2, cy: CAMERA_Y, z: 1.16 };

export function followX(t, scenes) {
  let s = 0, ws = 0;
  for (let k = 0; k < NS; k++) {
    const d = -HALF + (2 * HALF * k) / (NS - 1);
    const w = 1 - 0.85 * Math.abs(d) / HALF;   // triangular-ish weights
    s += w * riderX(t + d, scenes);
    ws += w;
  }
  return s / ws;
}

const bumpShape = (d) => (d < 0 ? Math.exp(-((d / 0.1) ** 2)) : Math.exp(-((d / 0.32) ** 2)));

export function crossingBump(t) {
  // nearest crossing (scene starts 0..N_SCENES-1); the first is the intro → panel 1 crossing at t = 5
  const k = Math.round((t - INTRO) / SCENE_DUR);
  if (k < 0 || k > N_SCENES - 1) return 0;
  return bumpShape(t - sceneStart(k));
}

/** Story camera before the outro takes over. Returns { cx, cy, z, pxu }. */
export function storyCamera(t, scenes) {
  let cam = { cx: followX(t, scenes), cy: CAMERA_Y, z: 1 };
  if (t < INTRO) {
    const w = smootherstep(2.6, INTRO, t);
    cam.cx = lerp(INTRO_CAM.cx, cam.cx, w);
    cam.z = Math.exp(lerp(Math.log(INTRO_CAM.z), 0, w));
  }
  const i = sceneIndexAt(t);
  if (i >= 0 && i < N_SCENES && scenes[i]?.camera) {
    const u = t - sceneStart(i);
    try {
      const o = scenes[i].camera(u, { ...cam });
      if (o) cam = { ...cam, ...o };
    } catch (e) { /* a broken override must not break the film */ }
  }
  cam.z *= 1 + 0.04 * crossingBump(t);
  cam.pxu = BASE_PX_PER_UNIT * cam.z;
  return cam;
}

/** World rect visible through a camera. */
export function viewRect(cam) {
  const hw = VIEW_W / 2 / cam.pxu, hh = VIEW_H / 2 / cam.pxu;
  return { x0: cam.cx - hw, x1: cam.cx + hw, y0: cam.cy - hh, y1: cam.cy + hh };
}

export const worldToScreen = (cam, x, y) => [
  (x - cam.cx) * cam.pxu + VIEW_W / 2,
  (y - cam.cy) * cam.pxu + VIEW_H / 2,
];

/** Apply a camera to the current p5 matrix (origin assumed top-left of a VIEW_W×VIEW_H target). */
export function applyCamera(cam) {
  translate(VIEW_W / 2, VIEW_H / 2);
  scale(cam.pxu);
  translate(-cam.cx, -cam.cy);
}

export { OUTRO_START };
