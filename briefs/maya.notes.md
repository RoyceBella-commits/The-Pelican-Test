# 07 maya — notes

## Technique
- Everything is drawn with Canvas2D at 1.5 px/unit. It uses 0 live p5.brush marks.
- **Stucco ground** is built per pixel. It has tone, plaster smears and grain.
- **Page edges** are flaked. The bark paper and a dark backdrop show beyond them.
- **The fold:** a fold to the previous page sits at x = 86. A sliver of that darker, angled page is visible to the left of it.
- **Losses:** flaking losses show brown bark fibre, with shadowed rims and chipped-white stucco edges. There are also pits.
- **Ageing:** `agePx()` ages every painted shape:
  - a 1.25 px blur, re-thresholded against a 256² noise tile, gives hand-painted edges;
  - a page-aligned 512² wear tile adds flecks and scratches;
  - colour fills are rubbed thin, while the black line survives better;
  - Maya blue fades more than the other colours.
- **Sprites:** 38 aged sprites live in one 2048×1472 atlas (deity, scribe, stream, glyphs, numeral parts). States switch on beats.
- **Numerals:** they are assembled live from bar, dot and shell sprites.
- **The pelican** is painted live:
  - heavy black contour;
  - stucco-white body, Maya-blue scalloped wing, blue primaries with red tips;
  - yellow-orange bill with a red base band and a row of dots; red eye-ring; red legs;
  - frame tubes with red and blue bands; wheels as red-banded cartouches with 8 spokes and white studs;
  - it is worn by the same wear tile, used as a `destination-out` pattern.
- **Overlays:** two sheet overlays sit over everything.
  - MULTIPLY: grain, stains, craquelure, fold crease, edge grime.
  - Losses: drawn on top, so live paint sinks into the damage. Near the seams the rider's band keeps its losses under the paint, so the pelican stays whole at a crossing.

## Deliberate deviation: no bar-2 hold
With the brief's hold (`[2.2, 3.6]`, 0.35), the revolutions complete at u = 0.89, 1.69, 3.23, 4.32 and 5.10. Revolution 40 would then miss the 4.0 downbeat.

With no hold, crank/2π = 36 + u exactly. So:
- every dot lands on u = 1, 2, 3, 5 and 6;
- the place value rolls 39 → 40 on the u = 4 downbeat;
- the count ends at 42 exactly at the crossing.

The counter reads `⌊ctx.rider.state.crank / 2π⌋`.

## Beats
| u | |
|---|---|
| −7…0 | The rain deity on a sky band faces left, pouring a stream onto the road. The scribe dozes and snores (a speech scroll). The counter shows a shell (0). Glyphs breathe on downbeats. |
| 0–0.5 | The scribe startles. The tally races 0 → 36 = 1·20 + 16, written as a dot over three bars and a dot. |
| 1, 2, 3, 5 | Each new revolution: the scribe dabs, and a red dot pops into the units place. |
| 2.0 | The deity turns, points its jar and sprinkles the pelican, which glances back. The cut stream falls away. Four glyph blocks fuse into the pelican's name glyph: a pelican head on a wheel. |
| 2.5–3.5 | The scribe paints frantically, tongue out, and ink drops fly (a few splat). |
| 4.0 | The place roll: a fifth dot appears; five dots fuse into a bar; four bars squeeze into a dot that carries up into the twenties; the shell stamps in with an ink spatter (2·20 + 0). The scribe stamps, and the pelican's eye goes wide. |
| 6.0 | The 42nd dot is dabbed. From 6.25 the scribe turns and shows its page (42, plus a tiny pelican) toward the right edge. |

- **Title:** 「玛雅抄本 / 约公元一二〇〇年」 is painted as glyph blocks in a red-framed panel. Each character has a fat black contour and a colour core (Hannotate SC), and is aged like the rest.
- **English:** "MAYA / CODEX / c. 1200" sits in glyph cells along a vertical red band.

## Numbers
- Init: about 0.43 s.
- Bakes: 37.2 MB.
- Solo frames: ≤ 3.3 ms.
- Live marks: 0.
- `check.mjs --quick`: PASSED.
- Out-of-order renders are pixel-identical.

## Reusable helpers
- `agePx` / `rasterAged`: painted-surface ageing.
- `wearTile` / `wearCanvas`: wear as a live `destination-out` pattern.
- `cart()`: superellipse cartouche shapes.
- `drawCharBlock()`: a CJK character as a contoured, colour-filled glyph.
- `SIGNS` / `drawGlyph` / `drawDaySign` / `numeral`: a small invented-glyph library with bar-and-dot numerals.
