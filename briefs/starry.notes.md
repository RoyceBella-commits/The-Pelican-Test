# 12 starry — notes (星月夜 / The Starry Night · 1889)

## Picture (original arrangement)
- Big sky: a great double spiral above the middle of the panel (a tight one-arm coil inside a broad wrapping ring band); two small counter-rotating spirals (upper left, lower right); a serpentine pale "wind" stream flowing under the small spiral, beneath the great one and curling up into the right spiral; ten haloed stars of mixed sizes (the largest beside the cypress); a crescent moon at the upper right (orange-lemon crescent, a night-blue interior, concentric yellow/orange halo).
- A dark flame cypress at the right edge, re-painted every frame; it stands behind the road, so the rider passes in front of it.
- Rolling blue hills with Prussian contours and a pale lit line. On the left, a village (white walls, blue/green/red roofs, Prussian outlines, a slender spire with a belfry); a few farms in the valley and to the right; poplars and olive clumps.
- Dark field rows, the ochre road (wheels at y = 800, flat across the panel), grass tufts on both edges. In front, a grass bank with pale stubble that fades out toward the right.
- Title painted into the lower-left corner like a signature: 「星月夜 1889」 and *The Starry Night*, in blue-black impasto lettering. The glyph masks are filled with short dashes and raised in relief.

## Gag (beat by beat)
| u | what happens |
|---|---|
| −7…13 | sky angle = 0.22 × wheel angle; ring band 0.5×, small spirals −0.75× / −0.9×; halos turn slowly and pulse on every beat |
| 2.0 | the pelican stands on the pedals (body forward and up, leaning, legs straightened); coupling ×4 for the bar; stars flare into pinwheel coronas; the cypress whips; the moon halo throbs; swirl dashes open around both wheels |
| 2.5 / 3.0 / 3.5 | window groups light up, each with lamp halos |
| 3.0 | the church bell swings |
| 4.0 | back to cruising |

Cues: skySpinUp 2.0, windows 2.5/3.0/3.5, bell 3.0, spinDown 4.0. Ride: hold [2.3, 3.6] at 0.6, ramp 0.3. freezeU 2.6.

## Technique: a Canvas2D impasto model
- `dash()` paints one loaded brush stroke: a body, plus 2–9 bristle streaks, each its own two-colour mix (wet-in-wet), with ragged ends.
  - It also writes a height map: the body, ridges along the bristles, and a ridge where the brush lifts.
  - `taper` gives flicked grass strokes.
  - In the low-frequency "thin" zones, dashes are skipped or painted dry-brush, so the canvas weave shows (a weave pattern for both height and colour, under a thin underpainting).
- `light()` turns the height map into normals and shades with diffuse light, wet gloss and a cavity term. The result is the impasto relief.
- The sky directions come from a cached stream function ψ: a base flow, quartic vortex bumps, and a jet along the wind curve. Streamlines give the dash paths, and ψ-bands drive the colour streams.
- Rotating layers are whole-dash discs with ragged edges, so no disc edge is visible.

## Numbers
- 0 live p5.brush marks. Live Canvas2D dashes: ≈540 for the cypress and ≈260 for the rider.
- Frames 52–70 ms solo; ≤ 220 ms in film framing (that includes a neighbour's init).
- Init ≈ 1.2 s. Bakes ≈ 25 MB.
- Deterministic: the same frames rendered in a different order produce identical PNGs.

## Reusable helpers
`Painter` + `dash()` + `light()` (a general impasto/oil-paint engine), `stream()`, `curveFn()`, `standPose()` (out-of-the-saddle pose with leg IK that stretches the legs to reach the pedals).
