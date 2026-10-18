# 01 sahara — notes

## Technique
- `buildFields()` simulates the sandstone at 1.25 px/unit, aligned to the panel. It stores byte fields for micro-relief, mottle, abrasion, spalls, cracks, varnish and luminance. The same pass produces the wall colour: elongated colour patches, iron stain, patina, bedding seams, lit bulges and hollows, the y=800 ledge, varnish streaks and the soot under the shelter lip.
- `erode()` is the pigment model, used for everything painted. Shapes are rasterised with Canvas2D, blurred, then thresholded against the rock fields. This gives ragged edges, paint lost on relief peaks, abrasion, and paint missing in spalls and cracks; rock shading and varnish show through the paint, and kaolin white is more fragile.
  - Wall layers (ghosts, title, handprint) are composited straight into the wall bake.
  - Figures are pre-rendered, one sprite per painted state actually used in u∈[−8,14], into one atlas: 64 sprites, 2048×1728.
  - The pelican goes through the same `erode()` live each frame (~200k px, a few ms), so the grain stays fixed to the wall while the rider moves through it.
- 0 live p5.brush marks.

## Beats
| u | |
|---|---|
| −7…2 | herd grazes / plods (head graze↔walk per 1-s slot, legs alternate every 2 beats, tail flicks); people walk every beat; dog trots |
| 1.0 | lead cow c1 lifts its head (then tracks) |
| 1.5 | every other head goes down (calm before the downbeat) |
| 2.0 | herd freezes; all heads switch to look at the pelican (`up` = facing it, `back` = over the shoulder); child and dog turn round; herders stop |
| 2.3–3.7 | ride hold (speed 0.15), "no feet" (`feetOff` 0.75 inside 2.45–3.85) |
| 3.0 | child points; dog sits |
| 3.5 | lead herder: orant pose with the bow held aloft; c5's tail stands up (until 4.5) |
| 4.0–5.5 | heads and bodies flip to the right as the bird's head passes each figure (beat-quantised: 4.0, 4.5, 5.0, 5.5) |
| ≥6 | everyone faces right; dog wags, tails flick from 7 |

`freezeU` 3.6 (the brief's 3.2 comes before the arms go up at 3.5).

## Numbers
- Init ≈ 0.5 s
- Bakes: wall 6.0 MB + atlas 13.5 MB = 19.5 MB
- Slowest still 26 ms (film framing, with neighbours)
- Live brush marks 0
- `check.mjs --quick` and full determinism: PASSED
