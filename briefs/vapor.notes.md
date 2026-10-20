# 18 vapor — notes (蒸汽波 / Vaporwave · 2010s)

## Picture (`render`, 0 live p5.brush marks)
Generic 2010s vaporwave key art played back from a worn VHS tape.
- **Sky**: a teal → indigo → violet → magenta gradient with a teal veil high up, a soft halo, faint haze streaks and dim stars. A few twinkling 4-point stars are drawn live.
- **Sun** (500, 505), r 205: yellow → orange → hot pink, with baked R/B chroma fringes. It is drawn as horizontal slices of a baked disc, so the 8 gaps (thicker toward the horizon) drift downward on the tape clock.
- **Mountains**: two triangulated low-poly ranges (far range with magenta wire, near range with cyan wire). They are low in the middle so the sun sinks between them.
- **Floor**: a glossy dark plane. The vertical neon lines converge on the sun and are baked with glow, a red chroma copy and a hot core. The horizontal lines are live sprites at y = 610 + 190/z that scroll toward the viewer. The **road y = 800 is the brightest grid line** (white core, cyan, magenta outer glow). The rider and the column are reflected in the floor.
- **Props**: two low-poly palms (faceted trunk, pinnate two-tone fronds) that sway on the tape clock. A floating checkerboard tile spins slowly. A **low-poly marble bust of our own design** stands on a Doric column (fluted 20-gon shaft, echinus, abacus). The bust is a real mesh: a sculpted head ring mesh with faceted curls, Greek nose, brow, sockets, lips, chin and ears, plus chest, socle and column. It is rendered every frame with flat shading (key light, cyan rim from the right, pink rim from the left), back-face culling and a painter's sort. Head and chest are sorted together so the neck merges cleanly. The chest has faint veins.
- **Title**: chrome logotype 「蒸　汽　波」 (Songti Black, italic). It has a sky-blue → horizon line → pink chrome face, streaks, a bevel, a 9-step extrusion and a pink glow; glints run over it. Below it, 「ＶＡＰＯＲＷＡＶＥ　２０１０年代」 is neon with R/B chroma, and ヴェイパーウェイヴ is cyan Mincho between rules.
- **VHS layer**: a pixel-font OSD (`PLAY ▶` / `SLOW ▶`, `AM 2:19`, a tape counter that ticks slowly in slow motion, and `TRACKING` with a bar). There are screen-locked scanlines (1 texel per screen pixel), grain, a vignette, a rolling tracking-noise band, head-switching noise along the bottom edge, and tears. A tear re-composes the whole picture inside a band with a horizontal offset (`blit()`).

## Pelican
Every rig part is faceted: "dome" facets (outline at z 0, a lifted inner ring and apex) for body, wing, head, pouch and tail, and "ribbon" facets for neck, legs, bill and feathers. Facets are flat-shaded from the upper left, with a cyan underglow from the grid. The plumage is pastel lilac/white, the pouch hot-pink, the primaries deep violet, the legs coral, with a dark silhouette outline. The bike has chrome tubes (sky / horizon line / pink reflections, dark under-stroke) and neon wireframe wheels (18-gon cyan tyre, magenta rim). Inside (1, 5) only, it gets R/B chroma copies and pink/cyan motion echoes (`ctx.riderAt`). The wave is a rig-space pose edit: the covert's front lobe folds in, an arm rises behind the neck with trailing feathers, and the primaries fan out and wave.

## Gag (u)
| u | beat | cue |
|---|---|---|
| −7…0 | dreamy 1× tape: grid glides, stripes drift, palms sway; the bust gazes off to the right | |
| 0 | OSD blinks to `SLOW ▶`, and the tape clock drops to 0.5× | slowMo |
| 1.0→2.5 | the bust turns its head through frontal view to the pelican, with a glint in its blank eye at 1.6, then follows it out | bustTurns |
| 1.85→2.12 | the wing rises; it waves 2.12→3.35 (0.6 s period) and lowers 3.4→3.68. 「ａｅｓｔｈｅｔｉｃ」 (2.0) and 「鹈鹕　ＣＹＣＬＥ」 (2.15) float up | wave 2.0 |
| 3.0 | the bust's eyes glow cyan (flare and lens streaks); a sparkle runs up the chrome down tube, then winks on the front rim at 3.4 | glow |
| 4.0→4.25 | `TRACKING`: 8 random bands tear the picture and the pelican apart (±95 u), with strong chroma, a noise bar and a magenta flash; an aftershock at 4.36 | glitch |
| 5.5→6 | OSD blinks `PLAY ▶`; the tape clock ramps 0.5→1×; tracking bands rush up the picture | speedUp |
| > 6 | the bust keeps looking right, where the pelican went; its eyes fade | |

Hooks: `ride {hold:[2,4], speed 0.6, ramp 0.4}` (lost 0.64 s, peak 1.32×); `mods` sets bob 1→0.4 over 1.5–4.0 and lookBack 0.3 over 2.0–3.6 (neutral outside (1.2, 4.2)); `freezeU 2.4`; no camera override.

## Numbers
- Live marks: 0. Frames centred take 15–45 ms (glitch frames are the slowest). The slowest still is 312 ms (u −0.5, includes neighbour init). Init ≈ 80 ms.
- Bakes ≈ 19 MB. Per-frame 2D canvases (rider, reflection, head + chest, palms, checker) ≈ 13.5 MB, not bakes.
- `check.mjs --quick` passes. Order-shuffled renders are pixel-identical: all Canvas2D state is reset per frame, and `facets()` sets its own lineWidth.

## Reusable helpers (in the scene file)
- `blit()` + `compose()`: route every image draw through a band clip, so a VHS tear/tracking band = re-run the compose inside a band with dx.
- `domeTris` / `ribbonTris` / `facets`: low-poly faceting of any rig polygon or ribbon (fake height → flat shading).
- `ringMesh` / `cylMesh` / `renderMeshes`: a tiny Canvas2D flat-shaded mesh renderer (cull + depth sort, multi-mesh).
- `osdCanvas` + `nearestImageFrom`: crisp pixel-font OSD sprites (thresholded, outlined, nearest-neighbour upscale).
