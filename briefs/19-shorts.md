# 19 shorts — 竖屏短视频 · 2020 年代   (film t = 113–119 s; visible ≈ t 106 … 126)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/19-shorts.js`.
Left neighbour: 18 vaporwave (pink/purple/teal). Right neighbour: 20 the LLM-era code editor (dark, clean).

## Concept
The instant the pelican crosses into this panel (u = 0, a downbeat) **the whole screen snaps to a 9:16 vertical video**:
black bars left and right, the neighbouring panels vanish. Inside: a phone-shot short video of the pelican riding, with
a fictional short-video app UI on top — likes and comments float up. **The progress bar fills from u = 0 to exactly
u = 6**, completing as the pelican crosses the next frame; on that downbeat the screen snaps back to 16:9.

## Picture (the video content — `render`)
- A contemporary, crisp, slightly glossy look: **modern flat-vector illustration with soft gradients and depth**, like a
  well-shot phone video stylised as vector art. Suggested setting: a city waterfront/rooftop bike path at golden hour,
  warm low sun with lens flare, a softly blurred skyline (bake it blurred = shallow depth of field), a railing or
  bike-lane markings giving speed lines. Original design; no real city landmarks or brands.
- The road is the bike path at y = 800 at both side edges.
- When this panel is seen as a neighbour (u < 0 or u > 6) it is a normal square picture — it should still look like a
  frame from that video (no UI needed outside the vertical mode).

## The vertical mode (`overlay`, screen space 1920×1080, top-left origin)
- Only for u ∈ [0, 6): opaque black bars covering x < 656 and x > 1264 (a 607.5 px wide 9:16 column, centred).
  `overlay` is also called while you are a neighbour (u outside [0,6)) — draw nothing then.
- "突然收窄": a hard cut at u = 0 (optionally a 2–3 frame squash/flash for punch); hard cut back at u = 6.
- UI inside the column (fictional app **「鹕视 PeliCam」** — invent a simple original logo; no real icons):
  top tabs "关注 | 推荐"; right action rail (round avatar with a tiny pelican, heart + count, comment bubble + count,
  bookmark, share arrow — generic glyphs drawn with shapes); bottom-left author + caption; a music marquee line
  "♪ 原创 · 鹈鹕骑行 BGM"; the progress bar along the very bottom of the column.
- Counts tick up on beats (likes accelerate during the gag). Hearts burst and float upward from the heart button;
  comment bubbles ("弹幕") drift up the left half of the column and fade — mix of Chinese and English, e.g. 前方高能 /
  它真的在骑？？ / 鹈鹕：基操 / 这车哪买的 / W pelican / this one again / 第一次见鹈鹕骑车（假的，已经见了一万年）.
  All positions/alphas are pure functions of u (deterministic spawn tables from `K.rng`).

## The gag (beat table)
| u | what happens |
|---|---|
| 0 | DOWNBEAT: hard cut to 9:16; camera on the default framing |
| 0.5 → 1.0 | camera eases into a tight vertical framing on the rider (zoom ≈ 1.6×) |
| 2.0 | DOWNBEAT: freeze-frame + white flash + sticker 「名场面」, punch-in zoom |
| 2.5 | slow-mo tag "0.5×"; the pelican pops a wheelie (path rot ≈ −0.18 rad about the rear wheel), hearts explode |
| 3.0–3.5 | comment storm, like counter racing (e.g. 9.9万 → 10万+) |
| 4.0 | DOWNBEAT: back to 1×, wheel down, keep riding |
| 5.5 → 6.0 | camera back to default; progress bar fills completely exactly at 6.0 |
| 6 | DOWNBEAT: hard cut back to 16:9 as the pelican crosses into the code editor |

## The pelican in this style
Crisp modern vector: clean shapes, soft gradient shading, warm rim light from the sunset, glossy orange pouch, white
body with pale blue-grey shadows (white is right here — it is a "photo" of a white pelican — but give it real light
and shading, not a flat sticker). The bicycle becomes a sleek modern road bike in a bold colour (e.g. mint/teal) with
dark tyres. Accessories only inside (1, 5): small sunglasses and a helmet appear during the gag ("influencer mode").
Use `K.rig.parts()` roles to render; keep every part at the seams.

## Title inside the artwork
In the video caption (bottom-left of the column): author `@鹈鹕骑士` and caption
「#竖屏短视频 #2020年代 #鹈鹕测试 Vertical Short Video · 2020s」 — that IS the panel's title. In the plain square view
(as a neighbour) put the same text as a burned-in caption in the picture's lower-left.

## Palette
sky #ffb46b → #ff6f6f → #6a4c93 · skyline blur #3b3a5c / #e98b77 · path #2e2d3a · bike teal #2ec4b6 ·
UI white #ffffff, heart #ff3b5c, dim text #ffffffb0

## Hooks
- `ride: { hold: [2.2, 3.8], speed: 0.35, ramp: 0.3 }` (lost ≈ 0.85 s)
- `path(u, base)`: wheelie rotation inside (2.4, 3.9) only.
- `camera(u, cam)`: tight vertical framing inside (0.5, 5.5), identity outside; ease in/out.
- `mods(u)`: e.g. `billOpen` during the wheelie, all inside (1, 5).
- `overlay(K, u, info)`: letterbox + UI for u ∈ [0, 6) only.
- `freezeU: 2.6`; `cues`: snapIn 0, freeze 2.0, wheelie 2.5, likesBurst 3.0, rideOn 4.0, snapOut 6.0.

## Watch out for
- The 9:16 column is 607.5 px wide; UI must be legible there (≥ 22 px text).
- The camera override must be exactly identity at u ∈ [0, 0.5] ∪ [5.5, 6].
- No real app names, logos, icons or the TikTok spinning-record disc; everything original.
