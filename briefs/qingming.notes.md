# 06 qingming — notes

## Composition
On aged silk (#c8b48c, with a few long faint warp and weft threads), a river recedes up the picture under a woven-timber Rainbow Bridge (虹桥).
- **Left bank:** a two-storey wine house with a 彩楼欢门 pole gateway. In front stand the title flag and a standing signboard.
- **Right bank:** shops, a big willow and a tea stall under a parasol.
- **Far banks:** overlapping roofs, groves, moored boats and tiny static walkers. Behind them is a misty treeline with the city wall and gate tower.
- **Near river:** the big grain boat, with its counterweighted mast lowered along the cabin roof.
- **Sky:** a collector's poem (虹桥人似蚁 / 白鹕踏轮来 / 举城皆回首 / 炊饼滚尘埃) with its seal.
- **Collector's seal:** 鹈鹕珍藏, top left.

## The bridge and the wheels
- `deckY(x)` is the single source for both drawing and `path()`. It is a hump of 70 units from x 302 to 702 (crest at y 730), shaped (1−t^2.4)^1.6.
- The deck can only roll between those x values: at u = 1 the front wheel is at x ≈ 298, and at u = 5 the rear wheel is at x ≈ 706.
- `placeOnDeck()` does an exact circle-contact solve. Each tyre rests on the lowest centre whose circle clears the deck, and the rotation comes from the two wheel centres. The tyres are therefore tangent to the deck's wheel-line plank.
- Max |rot| is 0.34. The brief's ≤ 0.18 with a crest at 610 is geometrically impossible with a 208-unit wheelbase inside that window.
- The deck band runs from the wheel line −30 to +34, so the near railing (top at +14) sits below the tyres.

## Ride and camera
- `ride {hold:[2.2,3.8], speed:0.25, ramp:0.3}`: 0.97 s lost. The hold is centred on the crest (bb x 446→554).
- `camera`: a push to z 1.2 toward the bridge, easing in over u 0.6–2.0 and out over 4.2–5.4. It is the identity in the seam windows.

## Beats
| u | |
|---|---|
| −7…2 | Bridge folk lean over the railings or crane toward the boat (front views, alternating every 2 beats). The crew haul the mast down (jerk per beat) and pole. The sedan chair approaches. |
| 0.75–2 | The porter flattens against the far railing, load upright, and the front wheel rolls past his nose. |
| 2.0 | Whole crowd snaps round to profile, faces up, arms up or pointing, with a startle hop for a third of a beat. Cue `crowdTurns`. |
| 2.25 | The boat crew look up and the ropes go slack. |
| 2.5 | The mast springs up and BONKs the arch soffit: splinters, falling chips, rebound. The pelican's eye goes wide. Cue `mastBonk`. |
| 3.0 | The bun seller's tray tips. Five buns pop out, bounce and roll down the far slope. The child starts "riding" (pedals per beat) and drifts right. The pelican's bill opens toward the buns. Cue `bunsRoll`. |
| 3.5 | Arms come down: look, shade, hands on hips. |
| 4.0 | The bird rolls downhill and every head it has passed flips to follow it. Cue `downhill`. |
| 6 → 13 | Everyone faces the right edge. The buns lie on the right street. The crew haul the mast down in jerks. |

`freezeU` is 3.1: arms up, mast jammed, buns popping, child riding.

## Technique
- **One bake (2048², 16 MB):**
  - silk
  - `ink.washLayer`: water, far banks, mist bands, willow canopies, grove foliage
  - brush trees and ripples
  - a Canvas2D ruled-line layer: bridge, shops, boat, far houses, background figures
  - brush willows, reeds and the cart track
  - title layer
- **Figures:** a small Canvas2D figure painter (skeleton + pose presets, side and front views, five hat types, props). One sprite per pose state, drawn into an atlas: 132 sprites, 2048×2064, 16 MB. Live there is only `image()` per figure and no brush marks.
- **Near railing:** redrawn as a small overlay above the near-side figures and the buns.
- **Live brush marks:** the pelican (~85), mast, ropes, buns, ripples and bonk. Max 122 when the panel is centred.
- **Init:** ~1.4 s. Bakes total 32 MB.

## Reusable helpers (inside the scene)
- `placeOnDeck` / `wheelCY`: rest the rig on any deck curve.
- `paintFigure` / `paintFront`: tiny ink-and-wash figures.
- `buildAtlas`: pose-state sprite atlas, mirrored cells.
- `roof`, `lattice`, `blind`, `posts`: 界画 helpers.
- `willowGeom` / `paintWillow`: Qingming willows.
- `brushedText`: glyph masks with ink bleed, uneven loading, dry streaks.
