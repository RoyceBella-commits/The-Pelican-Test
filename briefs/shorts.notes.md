# 19 shorts — notes (竖屏短视频 / Vertical Short Video · 2020s)

## Picture (`render`)
Golden-hour waterfront bike path as crisp modern vector art: purple→coral→orange sky with lit stratus, a low sun
between two pylons of a hazy cable-stayed bridge, a defocused skyline with bokeh windows, a water band with sun glitter,
a glass railing, and the asphalt path. The posts cast long shadows that fan toward the viewer. There is a pelican-on-bike
lane stencil, and blurred planting sits in the foreground. Static layers are Canvas2D paintings baked once into
framebuffers (`bake2d`). Live elements are water glints, gulls, the lens flare (bloom, anamorphic streak, ghosts along
sun → lens centre, dimmed when the bird occludes the sun), a 4-tap pan motion blur on the path layer, and the rider.
The panel uses no p5.brush marks; the crisp vector medium doesn't call for them.

**Pelican**: repainted every frame into a 2D canvas at screen resolution. White plumage uses one shared vertical
gradient (no seams between head, neck and body), soft cool form-shading and a warm sun-side rim (`softEdge`), and a
glossy orange pouch with a specular streak. The bike is a teal road bike with cylinder-shaded tubes, deep carbon rims
whose teal decals spin and smear, and a light-locked sheen. A cast shadow is skewed away from the sun. The near leg is
drawn under the body so the plumage covers the thigh. During the gag the helmet and sunglasses drop in, then vanish
with a sparkle "poof" at 4.3.

## Gag (u)
| u | beat |
|---|---|
| 0 | hard cut to the 9:16 column (black bars, 0.3 flash); 「鹕视 PeliCam」 UI appears; camera unchanged |
| 0.5→1.0 | camera eases to the vertical framing (z 1.45, follows the drawn rider, handheld wobble) |
| 0–2 | likes tick every beat 9.2万→9.6万, ambient hearts, comments 前方高能 / W pelican / 它真的在骑？？ / this one again |
| 1.6–2.0 | pelican turns toward the camera, eye wide |
| **2.0** | **freeze-frame** (picture and rider frozen) + white flash + 「名场面」 sticker pops + punch-in on the face (z 2.35); helmet then shades bounce in |
| **2.5** | cut to slow-mo (rider ≈0.68× cruising), "0.5× 慢动作" tag, **wheelie** (−0.18 rad about the rear contact, bill open), double-tap heart, heart turns red, 14-heart burst, sticker parks top-left |
| 3.0–3.5 | comment storm (9 comments in 0.5 s), counter races 99,120→99,999 |
| 3.5 | 「10万+」 pops in gold, second heart burst, bookmark turns yellow |
| **4.0** | back to 1× ("1×" tag), front wheel lands on the beat, sticker pops out |
| 4.3 | props vanish with a sparkle; 4.6 the follow "+" becomes ✓ |
| 5.0→5.5 | camera eases back to default (identity on [5.5, 6]) |
| 5.967 | progress bar full (it fills over u/(6−1/30)) |
| **6** | hard cut back to 16:9 |

Video time: the rider is drawn with `ctx.riderAt()` at a warped time vt(u) whose position is D(u): frozen on [2, 2.5],
linear X(2)→X(4) on [2.5, 4]. `path`/`mods` are therefore written in rider time (wheelie on vt ∈ (2, 4)).
The ride profile `{hold:[2.0,4.0], speed:0.5, ramp:0.04}` (lost 0.98 s, peak 1.49×) pays for the distance, so
D(u) = the true position outside (2, 4). The picture's own animation (glitter, gulls) runs on a matching clock
(frozen, then ½ speed).

## Deviations from the brief (on purpose)
- Zoom 1.45 instead of 1.6: the whole rig fits in the column and the front wheel stays clear of the action rail.
- Camera eases back over 5.0→5.5, not 5.5→6.0: STYLE.md requires identity on [5.5, 6].
- Ride hold [2.0, 4.0] at 0.5 with a sharp ramp: this delivers the freeze plus slow-mo with the beat-exact 4.0 snap.
- freezeU 3.0 instead of 2.6: full wheelie with helmet and shades in the outro tile.
- In the square view (neighbour or outro tile) the title is a burned-in caption at lower left, plus a repost watermark
  (logo + 鹕视 PeliCam + @鹈鹕骑士) at upper right. Both are hidden on [0, 6), where the app caption carries the title.

## Numbers
Live brush marks 0 (the 84 in film frames are the placeholder neighbours). Frame time is 7–32 ms centred
(GPU-synced); the first frame is 275 ms because it includes the neighbours' init. Init takes 26 ms. Bakes total
15.9 MB. Per-frame 2D canvases (rider 1400², shadow, marquee) add about 8.3 MB and are not bakes.
`check.mjs --quick` passes.

## Reusable helpers (in the scene file)
- `bake2d(K, key, w, h, paint(ctx2d))`: paint with Canvas2D (gradients, filter blur, anti-aliasing), then bake into a
  framebuffer. Note: p5 v2 re-uploads a p5.Graphics texture on **every** `image()` call, so a K.layer drawn each frame
  costs an upload each frame; a bake doesn't.
- `softEdge(ctx, trace, bbox, colour, blur, dx, dy)`: soft inner shadow or rim light (the blurred shadow of the
  even-odd surround bleeds in from the far edge).
- `tube(ctx, pts, w, stops)`: cylinder-shaded stroke (gradient across the tube, light from above).
- Video-time warp pattern: `D(u)`, `vtOf(u)` + `ctx.riderAt(t + vt − u)`, for freeze-frame and slow-mo with the
  ride hold paying the distance.
- `followLocal(u)`: replicates the film's follow camera in panel units, for camera overrides that blend from identity.
