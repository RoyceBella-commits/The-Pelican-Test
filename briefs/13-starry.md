# 13 starry — 星月夜 · 1889   (film t = 77–83 s; visible ≈ t 70 … 90)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/13-starry.js`.
Left neighbour: 12 Muybridge (sepia photograph). Right neighbour: 14 The Scream (blood-orange sky).

## Should look like
Vincent van Gogh's *The Starry Night* (1889, public domain) — the language, not a copy: thick impasto dashes laid in
directional rhythm, a night sky of turbulent spirals and haloed stars, a crescent moon in an orange-yellow halo, a dark
flame-like cypress, a sleeping village with a church spire, rolling blue hills. Composition must be original (different
arrangement; our road crosses the foreground).

## Picture
- **Canvas**: visible canvas weave where paint is thin; everywhere else short, thick, directional strokes (p5.brush
  with vector fields is ideal — `K.brush.field`/`addField`, bake heavily).
- **Composition**: big sky (upper 60%) with one dominant spiral centred above the middle of the panel and two smaller
  ones; 9–11 haloed stars; a crescent moon at the upper right; a tall cypress at the right edge (flame strokes); a village
  in the middle ground (white walls, blue roofs, lit windows, a spire); hills; the road in the foreground: an ochre path
  whose rider line is y = 800, with grass strokes along it.
- **The spiral turns with the wheels** (the brief's core image): render the main spiral as a disc layer (baked strokes)
  and rotate it with the bicycle's wheel angle (`ctx.rider.state.wheel`), feathering its edge into the static sky;
  smaller spirals counter-rotate. Stars' halos pulse on beats.

## The gag (beat table) — "漩涡星空随车轮一起转"
| u | what happens |
|---|---|
| −7 … 0 | the sky turns slowly (it follows the rider's wheel angle even before it arrives — the wheel keeps turning in the neighbouring panels) |
| 0 | the pelican crosses in (downbeat) |
| 2.0 | DOWNBEAT: the pelican stands on the pedals and spins them hard — the great spiral accelerates with the wheels (multiply the coupling ×4 for the bar), stars flare, the cypress flames whip, the moon's halo throbs |
| 2.5–3.5 | the village windows light up one by one on the beats; the church bell swings |
| 4.0 | DOWNBEAT: back to cruising; the sky's spin eases back to 1× coupling |
| 6 → 13 | the spiral keeps turning with the wheel (still turning in the next panel) |
(A cleaner way to "spin harder": keep the ride profile modest and instead scale the sky coupling; the wheels' real angle stays physical.)

## The pelican in this style
Painted in impasto dashes: the white body in cream/pale-blue strokes following its form (curved strokes around the
body, long strokes down the neck), cobalt and black dashes for the primaries, orange-yellow pouch strokes, a dark blue
contour line in places (Van Gogh outlines forms in Prussian blue); the bicycle in thick dark-blue strokes, wheels with
yellow highlights. Strokes for the rider are live: keep ≤ 250 by using larger dashes.

## Title inside the artwork
Painted in the lower-left corner the way Vincent signed his canvases — in a brushy blue-black script: 「星月夜 1889」
and below, smaller, "The Starry Night". (Do not imitate his signature "Vincent".)

## Palette
night blue #1d2f6b · Prussian #142a4f · cobalt #2f5fb3 · sky turquoise #6fa3b8 · star yellow #f1d35a · moon orange #e8a53a ·
cypress #1f2a1c · ochre path #b8873e · cream #efe6c4

## Hooks
- `ride: { hold: [2.3, 3.6], speed: 0.6, ramp: 0.3 }` (gentle; the drama is the sky)
- `freezeU: 2.6`
- `cues`: skySpinUp 2.0, windows 2.5/3.0/3.5, bell 3.0, spinDown 4.0

## Watch out for
- Rotating a baked disc: use `push(); translate(cx, cy); rotate(a); image(disc, -r, -r, 2r, 2r); pop();` and blend the disc
  edge with a soft alpha mask so no seam shows.
- Bake the static sky, village and hills at 2 px/unit; strokes per frame live only for the rider, stars' halos and cypress.
