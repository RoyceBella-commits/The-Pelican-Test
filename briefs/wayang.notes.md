# 10 wayang — notes

## Technique (0 live p5.brush marks, all Canvas2D)
- **`Hide`** is a small leather workshop written inside the scene file. It works in this order:
  - paint flat **sungging** bands (stepped colour from edge to centre);
  - add black and gold contour lines;
  - punch the **tatah**: dots, slits, crescents, diamonds and cut-out letters, using `destination-out`;
  - back-fill the punched holes with lamp light, clipped to the uncut silhouette, with a thin dark cut-edge rim.

  Every piece keeps a shadow source (holes let light through) for blurred shadow sprites.
- **Shadows** are drawn scaled about the flame by `1 + k`:
  - k ≈ 0.04 when a puppet is pressed to the screen;
  - k up to 0.42 (with a soft 0.3 px/unit sprite) when the gunungan is lifted toward the lamp.
- **Puppets** are sprite rigs:
  - the body sits on its gapit, and arms hang on shoulder/elbow joints;
  - rods (tuding) run to the palms. They are textured quads, because thin native polygons alias on the un-antialiased framebuffer;
  - a puppet turns by flipping through its edge.
- **Gunungan**:
  - the tree is generated: 13 tiers of S-curved scroll branches, a few hundred sungging leaves, curled twigs, flowers, a kala with a flame halo, a bull and a tiger;
  - the base is solid: rocks, a gate, and two guardians, which are the ogre painter re-used at 0.17 scale with holes disabled;
  - the field around the tree is black leather pierced by a dense hex dot-net (holes kept only where a raster mask of the field allows);
  - the back is the same leather painted with flame tongues. It is shown during the swirl.
- **Pelican**: re-cut every frame into an 820×900 canvas at 1 px per screen px.
  - Outside (1, 5) it is a painted white pelican in the wayang palette.
  - Inside, a gilded, perforated leather puppet. It has scale feathers, contour hole rows, a collar and a jamang diadem, and a far "hand" on its own rod.
  - The puppet look sweeps on and off as a tail→bill wave (1.0–1.3 and 4.5–4.95).
  - The pose comes from `ctx.riderAt(t − u + ⌊8u⌋/8)` inside (1.2, 4.8). Position stays smooth, so the wheels click round in 8 fps steps.
  - Hop and tilt are quantised too.
  - Its cast shadow is a 0.45 px/unit silhouette. It sharpens from soft and faint to crisp as the puppet is "pressed" to the screen.

## Beats
| u | |
|---|---|
| −7…1 | knight (alus, gilded, bowed) and raksasa (club) face off; arms flick on the beats; the lamp hot spot breathes on every beat (stronger on downbeats) |
| 1.0–1.3 | tatah wave punches the pelican into leather; gapit and two tuding rods slide up from below |
| 1.85–2.0 | gunungan quivers |
| 2.0–2.75 | gunungan swirls: it is lifted (shadow balloons), sweeps across in front of the pelican, flicks to its fire side and exits top-right |
| 2.5–4.0 | dance: hop on every half-beat; the wing-hands flick up alternately on their rods |
| 3.0 | knight flips to face the pelican, points and bows; ogre's jaw drops, it leans and raises its arms |
| 3.86–4.6 | gunungan sweeps back over the pelican (fire side → front) and replants with a wobble; the title tab swings |
| 4.55 / 5.1 | knight, then ogre, turn to watch it go (ogre slid 40 left) |
| 4.5–4.95 | back to the painted rider |
| 9.2–10.3 | ogre slowly turns back to face the knight |

## Numbers
- Max live marks: 0.
- Frames take 4–12 ms solo and ≤ 71 ms with neighbours.
- The first still takes ~235 ms including this panel's init. The 2.4 s seam/scene first frame is mostly the neighbours' inits.
- Bakes ≈ 45 MB as p5.Images: screen 2048², trunk, 2 gunungan sides, knight, 2 ogre states, arms, plaque, lamp and shadows. Live buffers add ≈ 6 MB.

## Reusable helpers
- `Hide`: Canvas2D leather with bands, edge, holes, cut text and shadow.
- `edgeTongues`, `insetLoop`, `curlPath`.
- `rodQ`: anti-aliased textured rods on a no-AA framebuffer.
