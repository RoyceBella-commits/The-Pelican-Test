# STYLE.md — shared spec for every panel

《鹈鹕测试 / The Pelican Test》: a white pelican rides a bicycle along ONE continuous road through 20 framed panels,
each a different era's art. Tone: a dead-serious museum documentary. **Every panel is a refined, museum-grade
homage — the jokes come from the gags, never from sloppy drawing.** Read this file fully before writing code.

## 1. What you own
- Exactly one file: `src/scenes/NN-<id>.js` (it currently holds a placeholder). Do not edit anything else.
  You may create `briefs/<id>.notes.md` for your notes/report.
- Need a kit feature? Write it as a helper inside your scene file and mention it in your report — the
  director merges shared helpers later. The kit (`src/kit`, `src/rig`, `src/main`, `src/beat`) is frozen while you work.
- **Do not look at the reference project meme67-art-history** (its repo, scenes, frames or video). Compositions and
  gags must be designed independently.

## 2. Space and time
- You paint in **panel units**: x 0…1000 left→right, y 0…1000 top→bottom (y down). The p5 transform is already set
  up (camera × panel offset), so draw directly in these units, both with p5.brush and native p5.
- Every panel sits inside the same thin minimal frame (drawn by the film — don't draw your own museum frame).
  You may draw era-appropriate borders *inside* your picture (e.g. a codex page edge) if the art calls for it.
- **The road**: the rider's wheels touch y = 800 at both side edges. Keep the ground flat at y = 800 within 200 units
  of each side edge. Inside, the road may dip/rise/curve (bridges, paths) via your `path()` hook (see §4).
- Time: `u` = seconds since the rider crossed into your panel (local time). 120 BPM: a beat = 0.5 s, a bar = 2 s.
  Downbeats at u = 0, 2, 4, 6. Bars: **u 0–2 enter · u 2–4 the gag / highlight (may slow or freeze) · u 4–6 exit**.
  The rider crosses into the next panel at u = 6 (on a downbeat).
- **Your panel is visible for u ∈ [−7, 13]** (the camera shows the neighbouring panels at the sides). It must look
  complete and alive the whole time — before the pelican arrives and after it leaves (onlookers can still be
  turned toward where it went, smoke can still drift, etc.).
- Cruising speed ≈ 171 units/s; the bottom bracket crosses the left frame midline at u = 0 (x = −14) and the right one
  at u = 6 (x = 1014). One pedal revolution per second (2 beats).

## 3. The scene object
```js
// src/scenes/NN-id.js
export default {
  freezeU: 3.0,                       // the moment shown in the outro wall (pick the most iconic pose)
  ride: { hold: [2.3, 3.7], speed: 0.3, ramp: 0.3 },   // optional bar-2 slowdown (see below)
  cues: [{ u: 2.0, name: 'cowsTurn' }],                // optional sound cues for the composer (stage 4)
  async init(K, info) { /* bake static layers once */ },
  path(u, base) { return base; },     // optional: where the rider is drawn (see §4)
  mods(u) { return {}; },             // optional: rig pose modifiers (see §5)
  camera(u, cam) { return cam; },     // optional: camera override {cx, cy, z} in WORLD units
  overlay(K, u, info) {},             // optional: screen-space drawing (1920×1080, top-left origin)
  render(K, u, ctx) { /* paint the panel, including the pelican, in your style */ },
};
```
Titles, years and ids come from `src/scenes/index.js` (`ctx.scene.title.zh/en`, `ctx.scene.year.zh/en`).

**ride**: `{ hold: [a, b], speed: s, ramp: r }` slows the rider to `s × cruising` between u=a and u=b (s = 0 is a full
stop). The lost distance is repaid automatically by gentle boosts in bars 1 and 3. Lost time must be ≤ 1.0 s
(e.g. a full stop of ~1.2 s with ramp 0.3, or half speed for 2 s). `node tools/check.mjs --quick` verifies it.

**ctx** passed to `render`:
- `ctx.u`, `ctx.t` (film time), `ctx.i` (panel index), `ctx.scene`, `ctx.pxu` (screen px per unit — use it for LOD)
- `ctx.view` = `{x0, x1, y0, y1}` visible rect in panel units (skip work that is off-screen)
- `ctx.rider.visible`, `ctx.rider.placed` (the pose mapped into your panel units), `ctx.rider.place` ({x, y, scale, rot}),
  `ctx.rider.pose` (rig space), `ctx.rider.state` ({crank, wheel, v, ...})
- `ctx.riderAt(t)` → the rider as seen from your panel at another film time (motion trails, onion skins, sequences)
- `ctx.freeze` = true when rendering the outro wall tile

## 4. Seam contract (non-negotiable — the halves of the bike must line up at the frame)
For **u ∈ [−1, 1] ∪ [5, 7]**:
- `path()` returns the default placement (y = 800, scale 1, rot 0, x unchanged);
- `mods()` is neutral (no wind, eye 'normal', feetOff 0, …);
- no reduced frame rate, no accessories, the rig is fully drawn with every part;
- `camera()` must not change the camera for u ∈ [0, 0.5] ∪ [5.5, 6].
Special effects (low-fps GIF, jerky puppets, feet off pedals, letterbox, stroke-by-stroke drawing, …) live strictly
inside u ∈ (1, 5). Screen-level overlays (e.g. a letterbox) may switch exactly on the u = 0 / u = 6 downbeats.

## 5. The pelican in YOUR style (user requirement)
**The pelican must belong to your era's picture.** It is NOT a white sticker: use your medium's materials, palette and
technique — ochre silhouette on rock, ink line on silk, gold-outlined miniature, pixels, vector strokes… Only the
skeleton is shared, so the motion stays continuous across the frame.
- `K.rig.parts(ctx.rider.placed)` → ordered parts back→front: `{ name, role, kind: 'poly'|'line'|'circle', pts|c,r, layer }`.
  Roles: `legFar footFar crankFar | tire rim spoke hub chain frame fork stem bars seatpost saddle ring | tail body wing
  secondaries primary neck head crest pouch bill nail face eye pupil eyeShut | leg foot crank pedal`.
  Map roles → your palette and technique. Reference implementation: `src/rig/pen.js` (≈40 lines).
- Raw geometry is also available on `ctx.rider.placed.bike` / `.bird` (see `src/rig/pelican.js`).
- Pose modifiers via `mods(u)` (inside (1,5) only): `wind 0..1, eye 'normal'|'white'|'closed'|'wide', billOpen 0..1,
  feetOff 0..1, scared 0..1, lookBack 0..1, bob, spokes (≤ 12; ≤ 8 for low-fps looks)`.
- Away from the seams you may stylise further (e.g. draw extra details, accessories, a style-specific pose), as long as
  you keep the shared skeleton recognisable.
- Draw order is yours: put foreground elements over the rider when it helps depth (bushes, crowds, bridge rails).

## 6. The panel's title lives inside the artwork (user requirement)
No centred labels and no museum label cards. Each panel shows its title and era **in a form native to that medium**:
an inscription + red seal on a Chinese painting, a cartouche in Egypt, a title slip on a print, an intertitle card in a
silent film, a window title bar, a video caption/hashtag, a code comment… Chinese title required; English (small) where
it fits naturally; year/era required. It must be legible at 1080p (≥ 26 px on screen) but feel like part of the picture.

## 7. Drawing API (`K`)
- `K.brush` — p5.brush namespace (`set, line, spline, polygon, rect, circle, arc, beginShape/vertex/endShape, fill,
  fillBleed, fillTexture, wash, noWash, hatch, hatchStyle, noHatch, field, noField, add, ...`; see
  `node_modules/p5.brush/README.md`). Built-in brushes: 2B HB 2H cpencil pen rotring spray marker marker2 charcoal
  hatch_brush. Custom brushes: `K.brush.add(name, {...})` once in `init()` (names are global: prefix with your id).
- **`K.seed(...key)` before every mark or group of marks**, with a stable key (e.g. `K.seed('sahara', 'cow', k)`). Never
  rely on the order of strokes for randomness.
- `K.flush()` — brush marks are queued and composited later; call it before native p5 drawing (rect, image, text)
  that must sit ON TOP of earlier brush marks. Native p5 drawing is immediate.
- `K.bake(key, w, h, paint)` → framebuffer, painted once (only from `init()`). `paint(K, w, h)` draws in pixel units,
  top-left origin. Draw it with `image(fb, x, y, w, h)` in panel units. Budget ≤ 64 MB per scene (2048² = 16 MB).
  Bake at ≥ 2 px/unit if the camera will zoom in.
- `K.layer(key, w, h, (ctx2d, g) => …)` → cached Canvas2D layer, returned as a frozen p5.Image (its `.canvas` is
  readable). Drawing a *p5.Graphics* with `image()` re-uploads its texture every call — for anything static use
  `K.layer` or `K.bake`; for per-frame Canvas2D rasters keep one reusable graphics and accept the upload.
- `K.text(opts, x, y, scale, alpha)` — text sprite: `{ text, font, size, weight, style, color, align, letterSpacing,
  vertical (CJK columns), stroke, strokeWidth, shadow }`; `size` in sprite px, `scale` maps px → panel units.
  `K.textSprite(opts)` → `{ g, img, w, h, … }` (`g.canvas` gives the raw Canvas2D for masks/erosion).
  macOS fonts available: "Songti SC", "Kaiti SC", "Libian SC", "Xingkai SC", "Baoli SC", "Hannotate SC", "Yuanti SC",
  "PingFang SC", "Hiragino Sans GB", YuMincho, "Hiragino Mincho ProN", Baskerville, "Hoefler Text", Didot, "Bodoni 72",
  Menlo, "Courier New", Georgia, Copperplate, Papyrus, Trattatello, "Apple Chancery", Herculanum, "Marker Felt", "Chalkboard SE".
- `K.paper.sheet({ w, h, base, kind: 'paper'|'xuan'|'silk'|'rock'|'papyrus'|'canvas', grain, fibers, stains, edge, seed })`
  → procedural ground (frozen p5.Image, cached). `K.paper.noiseFill(ctx2d, w, h, {...})`.
- **Ink kit** (`import * as ink from '../kit/ink.js'`, call `ink.init(K)` in `init`): ink brushes `ink.wet / ink.dry /
  ink.fine / ink.dab`, `ink.tone(t, ground)`, `ink.line`, `ink.flat`, Canvas2D wash layers `ink.washLayer` (soft edges,
  pooling, granulation — far better than p5.brush watercolour for ink), texture strokes `ink.cun` (rain/axe/hemp),
  `ink.dots`, `ink.tree` (pine/leafy/bare/willow; `collectOnly` gathers foliage washes), `ink.seal`, `ink.silk`, `ink.blob`.
  Custom brushes are NOT affected by `scaleBrushes` — their weights are final.
- Canvas2D is a first-class technique: rasterising shapes in a 2D canvas (with masks, erosion, dithering) and drawing
  the result is fine whenever it serves the style better than p5.brush.
- Maths (deterministic): `K.rng(seed)` (`.range .int .pick .gauss`), `K.rand(...key)`, `K.hash`, `K.noise2`, `K.fbm`,
  `K.smoothstep`, `K.smootherstep`, `K.lerp`, `K.clamp`, `K.keys(t, [[t,v],...])`, `K.easeInOut/Out/In/OutBack`,
  `K.window01(a, b, x, ramp)`, `K.pulse`, `K.ribbon(pts, w)`, `K.smoothPath`, `K.smoothLoop`, `K.ellipsePts`, `K.TL` (timeline).

## 8. Determinism and performance
- Every frame is a pure function of `u` (and `t`). **Banned**: `Math.random`, `Date`, `performance.now`, frame counters,
  state carried between frames. Two renders of the same t in any order must be pixel-identical (`tools/check.mjs` tests it).
- Bake everything static in `init()`. Watercolour `brush.fill` costs ≈ 9 ms each → only in bakes. `brush.wash` (flat)
  is cheap. Lines/splines ≈ 0.1 ms each.
- Budget: **≤ 400 live brush marks per frame when your panel is centred**, worst frame (with a neighbour) ≤ 1.5 s.
  `tools/shot.mjs` prints marks and ms per still. Report your max marks.
- Use `ctx.view` / `ctx.pxu` to skip off-screen or sub-pixel detail.

## 8b. Lessons from the first three panels (reference implementations)
- `src/scenes/05-song.js` (ink on silk, two bake tiers for a 4× camera push, LOD for a tiny rider),
  `src/scenes/01-sahara.js` (pigment rasterised and eroded into a rock surface, pose states switching on beats),
  `src/scenes/19-shorts.js` (crisp vector + UI overlay, camera override, `ctx.riderAt` time-warp for freeze/slow-mo).
  Read the relevant one before you start; reuse ideas freely (copy helpers into your file — do not import scene files).
- Titles must look MADE IN THE MEDIUM (brushed, carved, printed, painted…), not like a font laid on top. Use text
  sprites as shapes/masks and then texture, erode, offset or re-stroke them.
- Thin p5.brush lines under strong zoom used to collapse into dots; that is fixed in the kit — if you still see it,
  tell the director instead of working around it.
- Hide nothing important under the minimal frame: keep 20 units of breathing room inside each edge for text.
- p5.brush draws nothing for a curved `spline` with only 2 points — use `line` (or add a midpoint).
- Every 2D canvas runs on Chrome's CPU raster path (forced for determinism): keep per-frame Canvas2D work modest
  (small live canvases, no full-panel blurs per frame); bake large static rasters once.
- Seven panels are finished — study your finished neighbours' seams: `node tools/shot.mjs --seam <id>` shows the real
  neighbour; match the road and the rider's continuity, not their style.

## 9. Workflow
```bash
node tools/shot.mjs --solo <id> --u 0.5,2,3,4,5.5      # your panel alone (1 px/unit)
node tools/shot.mjs --scene <id> --u 0,1,3,5            # film framing (with neighbours)
node tools/shot.mjs --seam <id>                         # u = −0.5, 0, 0.5, 5.5, 6, 6.5 (check the bike halves line up)
node tools/sheet.mjs --scene <id>                       # contact sheet u = −0.5…6.5
node tools/sheet.mjs --solo <id> --u0 -6 --u1 12 --step 1.5   # whole visibility window
node tools/check.mjs --quick                            # contracts must pass
```
Stills go to `work/shots/`, sheets to `work/sheets/` — prefix your files with your id (`--prefix <id>`, `--out`).
Iterate **render → look at the PNG with the Read tool → revise**, at least 3 rounds (max 6). Look hard: composition,
materials, the pelican's integration, the title, the gag timing, both seams, the before/after states.

## 10. Copyright
Homage to public-domain works only; original compositions. No real logos, app names, icons, mascots, album covers,
film frames or notification sounds. Fictional apps get fictional names and UI.

## 11. Report (your final message)
- what you built (composition, gag beat by beat with u times), the title treatment, the pelican treatment
- max live marks per frame, slowest still ms, init time, bake memory
- `check.mjs --quick` result, seams verified (y/n), and paths of your best stills/sheet
- any kit helper you wrote that others could reuse
