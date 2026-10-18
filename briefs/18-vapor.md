# 18 vapor — 蒸汽波 · 2010 年代   (film t = 107–113 s; visible ≈ t 100 … 120)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/18-vapor.js`.
Left neighbour: 17 early chat window (bright UI). Right neighbour: 19 vertical short video (the screen snaps to 9:16 at u = 6).

## Should look like
The vaporwave aesthetic of the 2010s (a genre style, not any specific artwork): pink-purple-cyan gradient skies, a
huge striped sunset sun, an infinite neon perspective grid floor, low-poly palm trees, a classical marble bust,
chrome text, full-width Japanese/Chinese characters, VHS artefacts (scanlines, chroma shift, tracking noise, "PLAY ▶"
OSD). **No real album cover, no specific statue photograph, no real logos** — generic bust of your own low-poly design.

## Picture
- Sky: vertical gradient magenta → violet → teal; a striped sun (horizontal gaps cut out) sinking behind a low-poly
  mountain range in wireframe.
- Floor: the neon grid in perspective; the rider line y = 800 is one of the horizontal grid lines (flat edge to edge).
- Props: two low-poly palm trees (flat-shaded facets), a white marble bust (low-poly, flat-shaded, faint veins) on a
  Doric column at the right, looking left; a floating checkerboard plane; a rotating 3D wireframe dolphin? (optional).
- Overlay: scanlines, slight chromatic aberration (offset R/B copies of the bright lines), VHS OSD text at the top left
  "PLAY ▶ 2:19 AM", a tracking-noise band that rolls slowly.
- Ambient: the grid scrolls toward the viewer, the sun's stripes drift, palms sway in slow motion.

## The gag (beat table) — 主旋律放慢降调 (the whole panel lives in slow motion)
| u | what happens |
|---|---|
| −7 … 0 | everything glides in slow motion |
| 0 | the pelican crosses in (downbeat) — and immediately the world goes 0.5× (OSD switches to "SLOW ▶▶") |
| 1.0 | the marble bust slowly turns its head to follow the pelican (low-poly rotation, its blank eyes catching a glint) |
| 2.0 | DOWNBEAT: the pelican, in dreamy slow motion, lets go of the handlebar with one wing and waves; aesthetic text floats up: 「ａｅｓｔｈｅｔｉｃ」 / 「鹈鹕　ＣＹＣＬＥ」 |
| 3.0 | the bust's eyes glow cyan; a sparkle on the chrome bicycle |
| 4.0 | DOWNBEAT: tracking noise intensifies — a VHS glitch tears horizontally through the pelican for half a beat |
| 5.5 → 6 | the tape speeds back up (OSD "PLAY ▶"), right as the pelican crosses into the vertical video |

## The pelican in this style
Low-poly flat-shaded: the body as a handful of faceted triangles in pastel lilac/white with cyan rim light, pouch in
hot-pink facets, primaries in deep violet; the bicycle in chrome (gradient silver with pink/cyan reflections) and neon-
cyan wireframe wheels. Slight chroma offset applied to it too. Keep the rig silhouette (use the rig parts, facet them).

## Title inside the artwork
Chrome-and-neon logotype floating in the sky: 「蒸汽波」 large in full-width spacing, 「ＶＡＰＯＲＷＡＶＥ　２０１０年代」
below, with a katakana sub-line ヴェイパーウェイヴ, a drop shadow and a pink glow.

## Palette
magenta #ff6ad5 · violet #8b5cf6 · teal #4fd1c5 · deep purple #2d1b4e · grid cyan #3df2ff · sun #ffb86b → #ff4f9a ·
marble #f1eef2 / veins #c9c1d6 · chrome #dfe6f0

## Hooks
- `ride: { hold: [2.0, 4.0], speed: 0.6, ramp: 0.4 }` (a gentle slow-mo; lost ≈ 0.64 s)
- `mods(u)`: inside (1.9, 3.6) you may set `bob: 0.4` for dreamy motion; neutral outside (1, 5).
- `freezeU: 2.4` (the wave + bust turned)
- `cues`: slowMo 0, bustTurns 1.0, wave 2.0, glow 3.0, glitch 4.0, speedUp 5.5 — the composer plays the theme slowed and
  pitched down for this whole panel and snaps back at u = 6.

## Watch out for
- Gradients and grid are cheap native drawing; bake the bust, palms and mountains.
- Avoid the look of any specific real album cover (no bust + Windows-error-dialog + Japanese album-title combination).
