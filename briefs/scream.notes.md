# 13 scream — notes (呐喊 / The Scream · 1893)

This is an original composition in the manner of Munch's 1893 tempera-and-crayon on cardboard. Nothing is traced.

## Picture
- **Ground:** brown cardboard (#8a6844) with mottling, grain and short fibres. Scrubby patches (a low-frequency mask that thins the strokes) let the board show through, most visibly on the deck.
- **Sky:** long orange, red and yellow ribbons that swell and pinch, ending in grey-green haze above the hills.
- **Behind the railing:**
  - a big dark blue-green hill mass at the left and the far shore below it
  - the blue-black fjord, curling into an inlet against a green-grey headland on the right
  - two tiny boats in the fjord
- **Railing:** the one hard straight element. Four ruled bars on posts; the top bar is heavy with a lit edge. It runs level from x 350 to the right edge. At the left it bends into a steep perspective diagonal toward a vanishing point at (−46, 432).
- **Deck:** lofted streaks and plank seams that converge up-left. The rider's road is at y 800, and the railing foot is at y 764.
- **Strollers:** two dark figures with a top hat and a bowler, far along the diagonal at x 62 and 104, walking away.
- **Screamer:** stands in front of the railing at x 836. He has a pale skull head (1.25× scale, greenish hollows), hands pressed to his face, and a sinuous S-curved dark coat with blue and brown streaks. He sways with the wave field.

## Gag

| u | |
|---|---|
| −7…1.4 | Classic silent scream, swaying. The bands drift. |
| 1.42–1.62 | Head turns to the pelican; the mouth shrinks to a puzzled "o". |
| 2.0 | Hop and recoil back against the railing: wide white eyes, a huge mouth. The sky spikes into jagged peaks, re-phased 10×/s. Pale arcs of sound fly at the pelican. |
| 2.5 | The pelican screams back: `billOpen` 1, `scared` 1, `eye: 'wide'`, pale feather tufts standing on end. Orange arcs fly at the screamer. |
| 3.0 | The strollers turn, hands to faces, and scream. Every band shakes violently for one beat. |
| 3.5 | Dead stop: the wave phase freezes and everything goes still. Mouths shut; the screamer stares at the pelican, blinks at 3.75, then looks away. |
| 4.0 | The world moves again and the pelican rides off. The screamer slides down into a crouch, his head following it. |
| 6…13 | Crouched, he peeks right after it, hands still on his face. The strollers walk away again. |

## Technique
- **World:** one 1668×1302 Canvas2D bake (1.5 px/unit, 56-unit margin). It is drawn as a WebGL TRIANGLE_STRIP mesh (cells of 12.5 units), with texture coordinates displaced per vertex by `warpAt()`:
  - ambient travelling sines
  - a triangle-wave jag whose peaks sit on mesh vertices
  - radial ripples from the bill
  - violent shaking
  - a time-freeze for the silence

  This costs about 1 ms.
- **Front layer:** deck and railing in a 1500×870 bake, never warped.
- **Title:** pencil inscription 「呐喊 · 1893」 / "The Scream" in Hannotate SC, eroded to a thin core, made grainy, retraced, and drawn faintly into the sky at the upper left. The Chinese line is 37 units; the English line is 28 units.
- **Characters:** the screamer, the strollers, the pelican and the scream arcs are painted live into one reusable 1000² Canvas2D image, with one upload per frame. The stroke engine is `dryStroke`.
- **Pelican:**
  - pale yellow-white (#e3d8a6) filled parts, modelled with lofted end-to-end form strokes: light on top, greenish shadow below
  - deep-blue sinuous contours
  - blue-black primaries, an orange pouch, a dark wavy bike
  - inside (1.15, 4.85) the silhouette rides the world's waves at 0.35×; neutral at both seams

## Numbers
- **Live p5.brush marks:** 0. Everything is Canvas2D: about 150–250 dry strokes per frame.
- **Frame time:** about 17–20 ms solo and 25–70 ms in film framing. The first film frame takes about 2 s, but that is mostly the neighbours initialising.
- **Init:** about 350 ms.
- **Bakes:** about 15 MB, plus a 4 MB live canvas.
- **Checks:** `check.mjs --quick` passes. Two render orders give identical pixels.

## Reusable helpers
- `dryStroke(ctx, pts, {w, col, a, dry, gap, nb, wav})`: a Canvas2D dry-brush bristle stroke.
- `makeFamily` / `paintFamily`: lofted stroke families with a scrub mask.
- `drawWorld` / `warpAt`: a cheap animated texture warp via a UV-displaced mesh.
- `splitChains`: form strokes for any closed outline.
