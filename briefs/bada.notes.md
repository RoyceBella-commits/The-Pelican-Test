# 09 bada — notes

## Technique
- Everything is drawn with Canvas2D using `brushStroke()`, a bristle-brush model written inside the scene file.
  - A loaded brush is dragged along a resampled path. Each of N bristles carries its own ink, which runs out along the stroke.
  - The bristles split into clumps and catch on the paper tooth, which produces 飞白 dry streaks.
  - It also has a round brush tip, a press/lift width profile, a dark-tip side brush (`tipDark`), an optional wet core, and a blurred bleed composite into xuan paper.
- `wash()` makes soft washes with optional pooled edges and mottling. It stretches a small fbm canvas over the layer, so the mottle never tiles.
- The picture (paper, rock, myna, fish, stem, road, inscription, seal) is baked once into a 2048² `K.layer`. The lotus leaf is a separate layer that sways ±0.9° about its stem joint.
- Pupils (myna and fish) are live sprites.
- The pelican is repainted every frame with the same brush into an 800×640 p5.Image:
  - The bike goes down first.
  - Then the bird silhouette is filled with the paper texture, a "reserved white" that hides the bike behind the bird and the rock it passes.
  - Then the bird strokes.
- 0 live p5.brush marks.

## Beats
| u | |
|---|---|
| −7…1 | stillness; the myna's white eye is pressed up-right into the void |
| 1.0–1.4 | the myna's pupil slides along the rim toward the pelican (and tracks it from then on, kept in the upper half: always a white eye); the fish follows from 1.15 |
| 2.0 | stop (hold 2.1–3.4); `lookBack` + `eye:'white'`. My eye ring swells from r 5.4 to 9.4 (overshoot) and then 8.8; the pupil rolls up and presses into the top rim; the bill foreshortens by 28% as the head turns toward us |
| 2.85–3.36 | the pupil slides up-back toward the myna; myna and pelican glare at each other |
| 3.4 | hmph: `billOpen` 0.2, pupil straight up, nose in the air |
| 3.6–4.1 | rides on glancing back; the eye relaxes by 4.4 |
| 6–13 | the myna's eye follows it off to the right |

## Title
Two elongated Xingkai columns, 「八大山人写意」 and 「约公元一六九〇年」, with stretched glyphs and per-character jitter and ink load. 〇 is a brushed loop, not a glyph. The text gets dry texture and bleed. Below it sits a gourd seal 「白眼」 cut in white and printed with multiply.

## Numbers
- Init ≈ 0.5 s. Steady stills 35–50 ms. Slowest still 548 ms, which is the first frame including init.
- GPU memory: bg 16 MB + leaf 0.9 MB + live buffer 2 MB.

## Reusable helper
`brushStroke(x, pts, o)`, `wash(x, poly, o)` and `eyeLoop()`, all Canvas2D, would make a good `kit/inkbrush.js`.
