# 16 pixel — 8-bit 像素游戏 · 1980 年代   (film t = 95–101 s; visible ≈ t 88 … 108)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/16-pixel.js`.
Left neighbour: 15 the oscilloscope (green phosphor lines on black). Right neighbour: 17 the early chat window (bright UI).

## Should look like
A screen from a 1980s 8-bit side-scrolling platformer: a hard pixel grid, a small fixed palette, tiles and sprites with
1-pixel dark outlines, flat colour with simple dithering, a HUD across the top. The *genre's* language only: **do not
imitate any real game's characters, levels, tiles, items, enemies, HUD layout, fonts or sound effects** (no plumbers,
no question-mark blocks, no green pipes, no mushrooms or star power-ups, no flagpole, no recognisable enemies).

## Picture
- **Pixel grid**: 1 logical pixel = 4 panel units (a 250 × 250 screen). Everything snaps to that grid — except the
  rider, which is rasterised into its own pixel grid anchored at its exact position, so the bike halves line up at the
  seams (see Watch out).
- **Composition**: a sky with an original palette (not the famous light blue of a certain game), pixel clouds,
  dithered far hills, a row of floating original blocks (e.g. a stone tile with a small feather emblem), a few coins.
- **The road**: the top of the ground tiles is y = 800 (flat near both edges); 50 logical pixels of ground below it
  (grass edge + soil tiles). **A pit** in the middle (about x 400–540): a gap in the ground showing a dark void.
- **HUD** across the top (keep 20 units of breathing room inside the frame): lives, a coin counter, a score, a stage
  number — in an original chunky pixel font. Starts at lives ×3, coins ×95.
- Ambient for the whole window: coins spin (a 4-frame cycle), clouds drift by whole pixels, a small original critter
  (your design, e.g. a little crab or snail) patrols on the right-hand ground.

## The gag (beat table) — "跳过坑洞，吃到金币，强拍弹出 1UP"
| u | what happens |
|---|---|
| −7 … 0 | the level idles: coins spin, the critter patrols, HUD ×3 / ×95 |
| 0 | the pelican crosses in (downbeat) as a pixel sprite |
| 1.5 | it crouches (a 1-pixel squash of the sprite) before the pit |
| 2.0 | DOWNBEAT: JUMP — bicycle and pelican leap in a parabola over the pit (apex ≈ 200 units up) |
| 2.25 · 2.5 · 2.75 · 3.0 · 3.25 | it collects a coin on each eighth: a sparkle, a floating "+100", the counter 96 … 100 → rolls to ×00 |
| 3.5 | it lands past the pit with a squash and a pixel dust puff |
| 4.0 | DOWNBEAT: **"1UP"** pops up above the pelican in a blinking pixel font and floats up; lives ×3 → ×4 |
| 6 → 13 | "1UP" has faded; HUD shows ×4 / ×00; the critter peers into the pit |
(Check the coin x-positions against the real ride: without a hold the rider is at x ≈ −14 + 171·u.)

## The pelican in this style
A pixel sprite: rasterise the rig parts into a small Canvas2D at 1 px = 4 units with no anti-aliasing (threshold the
alpha), then draw it nearest-neighbour. 1-pixel dark outline, a 4–5 colour sprite: white body, black primaries and
outline, orange pouch and bill, a red or grey bicycle, wheels with ≤ 8 spokes (or a 2-frame spoke animation). During the
jump you may use a jump pose (`feetOff`, a tilted bill) — neutral again by u = 5.

## Title inside the artwork
In the HUD or as a stage-title strip in the same pixel font: 「8-bit 像素游戏 · 1980 年代」 and "8-BIT PIXEL GAME".
Chinese in a pixel style: render small, threshold to the grid (no smooth edges), ≥ 26 px on screen.

## Palette
An original limited palette of ≤ 16 colours, e.g. sky #4f6fd8 · cloud #f4f4f4 · hills #2f8f5a · ground #b8622d ·
soil dark #6e3412 · grass #3fae49 · coin #f8c838 / #c47a10 · outline #101018 · HUD white #fcfcfc

## Hooks
- `ride`: none needed (keep the jump on the beat); add a mild hold only if the coin timing needs it.
- `path(u, base)`: the jump inside (1.9, 3.6) (take-off squash at 1.5–2.0, landing squash at 3.5); default elsewhere.
- `mods(u)`: optional jump pose inside the jump; neutral outside (1, 5).
- `freezeU: 2.75` (mid-jump among the coins)
- `cues`: crouch 1.5, jump 2.0, coin 2.25 / 2.5 / 2.75 / 3.0 / 3.25, land 3.5, oneUp 4.0

## Watch out for
- Nearest-neighbour upscaling in p5 2.x WEBGL: textures filter linearly by default — set nearest filtering on the
  texture (e.g. `_renderer.getTexture(img).setInterpolation(NEAREST, NEAREST)`; verify it in a zoomed still), or draw
  pixels as rects. Bake the static level once.
- Rider grid: snapping the rider to the level grid would offset its half against panel 15's vector half by up to 2
  units at the seam; anchor the rider's pixel grid at its exact position instead.
- Every 2D canvas is CPU-rastered: keep live canvases small (a 250 × 250 screen or a sprite-sized canvas).
