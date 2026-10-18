# 07 maya — 玛雅抄本 · 约公元 1200 年   (film t = 41–47 s; visible ≈ t 34 … 54)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/07-maya.js`.
Left neighbour: 06 Qingming scroll (ink + pale colour on silk). Right neighbour: 08 Mughal miniature (gold borders).

## Should look like
A page of a Postclassic Maya screenfold book in the manner of the Dresden Codex (public domain): bark-paper pages
coated with white lime stucco, red horizontal band divisions, figures and glyph blocks drawn with a confident black
contour line and filled with flat colours (Maya blue, red, yellow-orange, black), bar-and-dot numerals in red and
black; the stucco is cracked and flaked at the edges. Original composition and invented glyphs.

## Picture
- **Support**: one tall page of the screenfold filling the panel, with the fold edge on one side and part of the
  neighbouring page visible; cream stucco (#efe6cf) with cracks, losses showing the brown bark paper beneath; red
  framing bands divide the page into a top glyph register, a main scene, and a bottom band.
- **Main scene**: the road is a red ground band whose top is at y = 800 (flat near the edges). A seated deity
  (rain-god-like, original design: long curling nose, ear spools, headdress) holds a jar; a **monkey scribe** (a Maya
  motif) sits with a brush and a codex; glyph blocks float in the gaps.
- **The counter**: a column of bar-and-dot numerals beside the road keeps the tally (see gag) — Maya numerals: a dot
  = 1, a bar = 5, a shell = 0, stacked vertically in base-20 places.
- Ambient: the monkey scribe's brush bobs on the beats; glyphs subtly "breathe" (tiny scale pulse) on downbeats.

## The gag (beat table) — "旁边用玛雅点横数字记录踏板圈数"
| u | what happens |
|---|---|
| −7 … 0 | the monkey scribe dozes; the counter shows a shell (0) |
| 0 | the pelican crosses in (downbeat); the scribe wakes |
| 0 → 6 | the counter shows the pedal revolutions **so far in the film** (one revolution per second; compute from `ctx.rider.state.crank / 2π`, ≈ 36 at u = 0 → 42 at u = 6), written in base-20 bar-and-dot numerals with two places; each new revolution adds a dot on the beat, five dots collapse into a bar with a little flourish |
| 2.0 | DOWNBEAT: the deity turns and points its jar at the pelican; glyph blocks around it rearrange into a new block: a pelican-head glyph on a wheel glyph (the codex "names" it) |
| 2.5–3.5 | the monkey scribe frantically paints, tongue out; ink drops fly |
| 4.0 | DOWNBEAT: the place value rolls (e.g. 39 → 40 = two in the 20s place, shell in the units) with a stamp effect |
| 6 → 13 | the counter freezes at the final value; the monkey shows its page proudly toward the right edge |

## The pelican in this style
Codex figure: a heavy black contour, flat fills — body in stucco white with Maya-blue wing feathers and red-tipped
primaries, a big curved bill in yellow-orange (Maya bird glyphs have huge beaks — lean into it), a round eye with a
black dot and a red eye-ring; legs red; the bicycle in black line with red-and-blue banding, wheels drawn like
circular glyph cartouches with 8 spokes. Slightly stiff, glyph-like posture. Use `K.rig.parts()`.

## Title inside the artwork
A glyph block caption in the top register: a red-outlined panel with 「玛雅抄本」 and 「约公元一二〇〇年」 painted in
the codex's black line with colour fills (as if glyphs), and "Maya Codex · c. 1200" in small black letters along the
red band like a column of glyph blocks.

## Palette
stucco #efe6cf · bark #8a6a46 · Maya blue #4f9cb3 · red #b23a26 · yellow-orange #e0a03a · black #1c1712

## Hooks
- `ride: { hold: [2.2, 3.6], speed: 0.35, ramp: 0.3 }`
- `freezeU: 2.6`
- `cues`: scribeWakes 0, dotsOn each beat (u = 0,1,2,3,4,5 — revolutions), deityPoints 2.0, placeRoll 4.0

## Watch out for
- The numerals must be correct Maya notation (vertical places, base 20, the shell for zero).
- Keep text legible ≥ 26 px.
