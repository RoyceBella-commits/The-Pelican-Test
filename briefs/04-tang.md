# 04 tang — 唐代白描 · 约公元 750 年 ·「吴带当风」   (film t = 23–29 s; visible ≈ t 16 … 36)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/04-tang.js`.
Ink kit: `src/kit/ink.js` (read its header; `ink.init(K)` in `init`). Reference panel for ink technique: `src/scenes/05-song.js`.
Left neighbour: 03 Han rubbing (white on black). Right neighbour: 05 Song landscape (brown silk, monumental peak).

## Should look like
Baimiao (白描) figure painting in the manner associated with Wu Daozi (吴道子, "吴带当风 — Wu's sashes fill with
wind"), as known from public-domain works like the Song-dynasty copy 《送子天王图》 and Wu Zongyuan's 《朝元仙仗图》:
pure ink line on pale paper/silk, no colour; long, swelling-and-tapering "water-shield" lines (莼菜条) that describe
billowing robes; sashes and ribbons streaming in the wind; hair and beards in fine strands. Original composition.

## Picture
- **Support**: pale, slightly warm paper/silk (#ece3cf), very light ageing; generous empty space.
- **Composition**: a procession of 3–4 celestial figures (a Daoist immortal with a fan, a heavenly lady holding a
  flower tray, a guardian with a staff) walking right along a few drifting cloud-scroll bands (祥云) at road level;
  a few more cloud scrolls above. The road is a soft cloud band whose top edge is at y = 800 (flat for 200 units at
  both side edges) — the procession walks on clouds.
- The lines are everything: modulate thickness along each stroke (press-and-lift), keep a few long confident strokes
  per robe rather than many timid ones. `ink.line` with `pressure`-style variation (the `ink.wet` brush already swells).
- Ambient: the figures' sashes ripple continuously (drapery curves are functions of u), clouds drift slowly.

## Cast
3–4 celestial figures (left→right procession, gliding slowly), a small attendant child. They are elegant, serene,
dignified — the gag is how seriously they take the pelican.

## The gag (beat table) — "鹈鹕的羽毛和飘带随风翻飞"
| u | what happens |
|---|---|
| −7 … 0 | the immortals glide, sashes rippling gently |
| 0 | the pelican crosses in (downbeat) — drawn in the same line |
| 2.0 | DOWNBEAT: a great gust: every sash, robe hem, beard and ribbon whips to the right; the pelican's feathers, crest and tail fly (`mods.wind` → 1) |
| 2.5 | the heavenly lady's long scarf flies off and wraps around the pelican's neck, streaming behind it like a pennant |
| 3.0–3.5 | the pelican rides on, scarf streaming in magnificent baimiao loops (the most beautiful lines in the panel) |
| 4.0 | DOWNBEAT: the gust drops; the scarf slips free and floats back to the lady |
| 6 → 13 | serenity returns; the attendant child is still pointing after it |

## The pelican in this style
Pure ink line on the pale ground — no fills except leaving the paper (white bird = untouched paper), the primaries
and bill nail in solid ink, a few fine strokes for feather texture. Bicycle in fine even lines (`ink.fine`). During
the gust the rig's `wind` mod animates the feathers; add extra flowing feather/ribbon lines of your own inside (1, 5).

## Title inside the artwork
A small inscription column in regular script (楷书, "Kaiti SC") in an empty corner: 「唐人白描」 then smaller
「约公元七五〇年 · 吴带当风」, with one red seal. Chinese only (it is a painting inscription).

## Palette
paper #ece3cf · ink #1a1612 (vary tone with `ink.tone`) · seal red #b4291f — nothing else.

## Hooks
- `ride: { hold: [2.3, 3.8], speed: 0.45, ramp: 0.35 }`
- `mods(u)`: `wind` ramps 0 → 1 over (1.8, 2.1), holds, back to 0 over (3.9, 4.6); 0 outside (1, 5).
- `freezeU: 3.1` (scarf streaming)
- `cues`: gust 2.0, scarf 2.5, calm 4.0

## Watch out for
- Live line count: the sashes animate, so keep each figure to ~30–50 live strokes; bake faces/hands/static robe parts.
- Never colour fills; tonal variation only through line weight and ink tone.
