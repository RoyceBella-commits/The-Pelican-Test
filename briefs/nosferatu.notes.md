# 14 nosferatu — notes

## Picture
An amber-tinted stairwell from a 1922 film, lit by one low lamp off-frame at the lower right (`LAMP = [1150, 905]`), with moonlight from a casement at the left.
- **Staircase**: a solid plastered flight with 14 steps rises from (40, 752) to a landing at y = 332.
- **Banister**: heavy, with a foot newel, a handrail, a turned baluster on every other step, and a landing post.
- **Door**: a pale, pointed door on the landing.
- **Arch**: a black round arch under the landing.
- **Window**: leaded, with a gabled town and a spire outside. A sheer curtain sways across it, and its moonlight patch falls on the floor, cut by the curtain.
- **Title**: a black lacquer plaque with a gilt double rule, corner ornaments and worn gilt lettering. It reads 「诺斯费拉图」 (Songti 900) and "Nosferatu · 1922" (Trattatello). It hangs on the wall like an intertitle card.

## Technique (0 live p5.brush marks; Canvas2D only)
- **The set** is painted once as layers: albedo, lamp shading, moonlight, emission and depth class. It is then lit per pixel with lamp falloff (wall, stair face and floor sit at different depths) and mapped through tint LUTs: amber #120b06 → #c08a3e → #e6c88f, and blue #0d1626 → #3c5a86.
  - The result is two images. `set_lit` has the lamp on. `set_dark` has moonlight only.
  - Lamp flicker cross-fades between them. A light lens blur is baked in.
- **Shadows** are masks drawn in one 0.6 px/unit canvas, then filled `source-in` with `set_dark`. A shadow is the lamp's light taken away, so moonlit areas stay blue. The low resolution gives the penumbra.
  - The wall uses one projection. The stair face is nearer the lamp, so it uses that projection shrunk 3.5 % toward the lamp. As a result, every shadow breaks at each step of the sawtooth edge.
- **The pelican's shadow** is the rig, rebuilt every frame with fixed point counts so poses can be blended. Each point goes through `mapper()`: stretch, keystone, lean, and a shear onto the stair slope.
  - While it climbs, the shadow hunches.
  - `clawWarp` bends the bill and pouch into a hooked claw whose tip lands exactly on the door handle.
  - `fingerPts` stretches the primaries into long tapered fingers.
  - It pedals with its own `rigPose`, whose crank turns with the distance it has climbed.
- **The rider** is painted every frame in a 2D canvas.
  - Each part gets three bands: lit crescent, half-tone and deep shadow, built from offset clips toward the lamp.
  - Values are orthochromatic: orange and red render dark.
  - A cold moon rim appears near the window.
  - Grain and vignette are applied `source-atop`, so the phosphor can be drawn before the rider and the rider stays on top of it.
- **Film effects**:
  - Only inside (1, 5): 18 fps judder (`ctx.riderAt(t − u + uq)`) and gate weave.
  - Everywhere: grain, dust, hairs, drifting scratches, projector flicker, vignette and rounded aperture corners.

## Beats
| u | |
|---|---|
| −7…0 | Empty stairwell. The banister's shadow quivers, the curtain sways, and the lamp dips on every beat (deeper on downbeats). |
| 0 | The pelican rides in. Its tall, keystoned shadow leans over the window and the stair behind it. |
| 1.0–1.75 | The shadow lags (its source time slows), leans back, and stops at the foot of the stair. At 1.85 it looks up the flight. |
| 2.0 / 2.25 / 2.5 / 2.75 | It peels onto the slope and climbs in four hops, wheels rolling up the steps. |
| 2.5–3.0 | The fingers stretch, and the claw reaches the door handle at 3.0. |
| 3.1–3.45 | The handle rattles. |
| 3.4 | The pelican looks back in fright (`lookBack`, `scared`, wide eye). |
| 3.8–4.0 | The shadow slides down the wall, with a smear. |
| 4.0 | It snaps back under the pelican with an elastic bounce. The pelican rides on, hurried (bob). |
| 5–6 | The lamp buzzes, and the shadow grows huge across the stair and the door. |
| 6.2–13 | The lamp stays dim. The door creaks open by itself onto a cold light. |

## Exit timings (shared with panel 15)
- **u = 6.0 exactly** (film t 89.0, one frame):
  - The lamp flares white (set brightness ×2.3 plus a white glow), then dies to 0.15.
  - The dark shadow fill disappears and is replaced, for this frame only, by a 35 % additive green fill flash.
  - The phosphor outline appears at full strength: core #d8ffe4, additive glow #39ff7a, plus a bloom that decays with τ = 0.12 s.
- **u 6.0 → 8.0**: The outline is frozen at its u = 6 shape. It decays as exp(−(u−6)/0.5) and shifts toward #9be86a as it fades. It is gone by 8.0.
- **u 6.0 → 6.26**: About 11 jagged arcs per frame crawl along ordered runs of the outline, struck again every frame.
- **u 6.0 → 6.15**: A spark runs along y = 800 from x = 614 (under the shadow's bottom bracket) to x = 1000, at a constant ≈ 2570 units/s. Its trail then persists with τ = 0.18 s.
- There is no green anywhere before 6.0. The rider is drawn after the phosphor, so the green never touches it.
- The outline is the ring `mask − erode(mask)` of the same silhouette mask: wall and face clips, 1.1 px/unit. It is built once at the first frame with u ≥ 6.

## Numbers
| Item | Value |
|---|---|
| Live brush marks | 0 |
| Solo frame time | 6–9 ms |
| Frame time with neighbours | 22–61 ms |
| First frame with u ≥ 6 (phosphor built once) | ~100 ms |
| Init | ~150 ms |
| GPU images | ≈ 40 MB: lit/dark set 1153² ×2, grain 1024² ×2, phosphor rings, aperture, vignette, live canvases |

The first frame of a `--scene` still takes ~1.9 s; neighbour inits account for nearly all of it (scream's own first frame takes the same time).

## Reusable helpers
- `shadowGeo` / `mapper` / `lerpGeo` / `drawSil`: a cast shadow of the rig made of fixed-count polygons. They allow any point-wise projection, blending between poses, and region-dependent projections.
- `clawWarp`: bends a polygon so a chosen tip lands on a target point.
- The erosion-ring outline plus ordered edge runs, used for glow outlines.
- The per-pixel "lit set" bake (albedo, shade, moon, emission, depth → tint LUT).
