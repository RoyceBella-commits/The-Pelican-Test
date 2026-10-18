// The single source of truth for timing and world geometry.
// Shared by the picture (src/main), the scenes, the audio score and the tools.

export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;          // 0.5 s
export const BAR = 4 * BEAT;           // 2 s

export const INTRO = 5;                // 2.5 bars: half-bar pickup, then 2 bars
export const SCENE_DUR = 3 * BAR;      // 6 s per panel
export const N_SCENES = 20;
export const OUTRO = 6 * BAR;          // 12 s
export const OUTRO_START = INTRO + N_SCENES * SCENE_DUR;  // 125
export const DURATION = OUTRO_START + OUTRO;              // 137
export const FRAMES = Math.round(DURATION * FPS);         // 4110

// Downbeats sit on odd seconds (1, 3, 5, ...): the intro starts with a half-bar pickup.
export const DOWNBEAT0 = 1;

/** Start time of scene i (0-based). Every crossing is a downbeat on a whole frame. */
export const sceneStart = (i) => INTRO + SCENE_DUR * i;

/** Index of the scene whose time window contains t (−1 = intro, N_SCENES = outro). */
export function sceneIndexAt(t) {
  if (t < INTRO) return -1;
  if (t >= OUTRO_START) return N_SCENES;
  return Math.min(N_SCENES - 1, Math.floor((t - INTRO) / SCENE_DUR));
}

/** Beat helpers (all pure). */
export const beatIndex = (t) => Math.floor((t - DOWNBEAT0) / BEAT + 1e-9);
export const beatPhase = (t) => ((((t - DOWNBEAT0) / BEAT) % 1) + 1) % 1;
export const barIndex = (t) => Math.floor((t - DOWNBEAT0) / BAR + 1e-9);
export const barPhase = (t) => ((((t - DOWNBEAT0) / BAR) % 1) + 1) % 1;
export const isDownbeat = (t) => Math.abs(((t - DOWNBEAT0) / BAR) - Math.round((t - DOWNBEAT0) / BAR)) < 1e-6;

// ---------------------------------------------------------------- geometry
// World units. Each panel interior is 1000×1000 inside a thin, uniform, minimal
// frame (FRAME_W per side); neighbouring frames touch, so panels repeat every PITCH units.
export const PANEL = 1000;
export const FRAME_W = 14;
export const PITCH = PANEL + 2 * FRAME_W;   // 1028
export const ROAD_Y = 800;                   // road height at every frame edge (panel units, y down)
export const SPEED = PITCH / SCENE_DUR;      // ≈171.3 units/s, cruising speed
export const CRANK_DIST = SPEED;             // one pedal revolution per second = 2 beats at cruising speed;
                                             // a panel is exactly 6 revolutions, so the pedals re-lock at every crossing
export const WHEEL_R = 62;

/** World x of the frame midline the rider crosses at sceneStart(i). */
export const crossingX = (i) => i * PITCH;
/** World x of the left edge of panel i's interior. */
export const panelLeft = (i) => i * PITCH + FRAME_W;
/** Panel-local x (0 = interior left edge) → world x. */
export const toWorldX = (i, x) => panelLeft(i) + x;

// Intro "preface" sheet: a wider framed panel to the left of panel 0.
export const INTRO_W = 1700;
export const introLeft = () => -FRAME_W - INTRO_W;   // interior left edge, world x

// Camera: 1000 units of panel height ≈ 970 px at 1080p.
export const VIEW_W = 1920;
export const VIEW_H = 1080;
export const BASE_PX_PER_UNIT = 0.97;
export const CAMERA_Y = PANEL / 2;
