# 16 pixel — notes (8-bit 像素游戏 / 8-bit Pixel Game · 1980s)

## Picture
One screen of an original side-scroller, "STAGE 16". It is a 250 × 250 logical-pixel screen (1 px = 4 units) in an
original 16-colour palette:
- **Status bar.** Black, with a pelican-head icon ×3, a square-holed coin ×95, SCORE 012400, and STAGE 16.
- **Sky.** Periwinkle, with drifting pixel clouds.
- **Far ranges.** Stone-grey peaks with snow caps and slate east faces, fading into a dithered haze.
- **Hills.** Round green hills with dither shading and small trees.
- **Floating tiles.** Four stone tiles engraved with a feather, with two spare coins on top.
- **Ground.** Grass-capped soil tiles laid in staggered courses, with a black pit at x 400–528.
- **Shrub and crab.** A berry shrub, and an original critter: a hermit crab that wears a small stone tile as its shell.
- **Coins.** 方孔钱 coins with a square hole. They spin through 4 frames (face, ¾, edge, mirrored ¾), one turn per beat.

The panel uses no p5.brush. Each frame is built as palette indices in a `Uint8Array`, mapped to RGBA through a LUT, and
uploaded into one `p5.Image` whose texture uses NEAREST filtering (`p5.instance._renderer.getTexture(img).setInterpolation(NEAREST, NEAREST)`).
Effects (sparkles, +100, 1UP, dust) go in a second screen layer drawn over the rider.

## Title
The status bar's second row reads 「8-bit 像素游戏 · 1980 年代」, with the CJK glyphs drawn by hand at 12 × 12 with
1-px strokes. The English title "8-BIT PIXEL GAME" is set in a tiny 5-row font. All type comes from original
pixel fonts (F7: chunky, 7 rows with 2-px stems; F5: 5 rows).

## Pelican
Every frame a small scanline rasteriser fills the rig parts into a 140 × 128 index buffer at 4 units/px. It does no
anti-aliasing:
- **Fills.** Polygons, discs and rings are filled by the pixel-centre rule; thick lines by distance; thin lines by Bresenham.
- **Outline.** A 1-px ink outline runs around everything except the wheels.
- **Inner lines.** A mist feather line separates the wing from the body, a mist shade runs along the underside, and the
  plumage covers the thigh.
- **Palette.** White, ink, orange (pouch and bill, with an ink jaw line), and a red nail, plus a red frame and grey rims.
  Only 4 of the 12 spokes are drawn, at the same angles the neighbours use.

The sprite's grid is anchored to the rider's own position, so the seams line up. Inside (1, 5) `path()` snaps x and y
to the level grid, so the sprite and the screen share one pixel grid.

## Gag timing
Ride: `{ hold: [2, 3.5], speed: 1.45, ramp: 0.15 }`. This is a speed-up: lost = −0.61 s and the peak is 1.45×. The
bike's 208-unit wheelbase has to clear a 128-unit pit in 1.5 s. The ride pays for it with a 0.73× approach around
u ≈ 1 and a run-out around u ≈ 4.75.

| u | x (BB) | event |
|---|---|---|
| 1.5 | 201 | crouch: 1-px squash, eye wide |
| 2.0 | 282 | JUMP. Front wheel at 388, at the pit lip. Nose-up frame to 2.2, take-off dust, bob 0 in the air |
| 2.25 | 339 | coin 1 at (520, 411): the bill opens 0.12 s before and snaps shut on the beat. Sparkle, "+100", ×96 |
| 2.5 | 401 | coin 2 at (580, 344), ×97. "No-footer" legs 2.2–3.3 |
| 2.75 | 463 | coin 3 at (644, 322), apex at 200 up, ×98 (freeze) |
| 3.0 | 525 | coin 4 at (704, 344), ×99 |
| 3.25 | 587 | coin 5 at (768, 411). The counter rolls 99 → 00 like an odometer (3.25–3.41) and flashes |
| 3.5 | 643 | land. Rear wheel at 541; 2-px then 1-px squash; four dust puffs. The crab shows "!" and hops |
| 3.62–3.84 | | the crab dashes behind the shrub |
| 4.0 | 726 | "1UP" (big two-tone glyphs) pops over the head, blinks and floats up, flickers out by 5.5. Lives ×3 → ×4 |
| 5.6–7.0 | | the crab's eyes peek over the shrub |
| 7.0–10.2 | | the crab walks to the pit |
| 10.2–13 | | it peers in, eyes dangling into the void; "?" at 11.1–12.3 |

## Numbers
- 0 live brush marks.
- Draw cost about 4–5 ms per frame on its own, about 20 ms with neighbours.
- Init a few ms.
- Bakes: 0 MB. Three live textures: 250², 250², 140 × 128.

## Reusable helpers
`nearestImage()` / `upload()` (index buffer → LUT → NEAREST p5.Image), `rasterRider()` (role-mapped pixel
rasteriser with outline), and the F7/F5 pixel fonts.
