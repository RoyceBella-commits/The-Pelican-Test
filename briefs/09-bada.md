# 09 bada — 八大山人写意 · 约公元 1690 年   (film t = 53–59 s; visible ≈ t 46 … 66)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/09-bada.js`.
Ink kit: `src/kit/ink.js` (read its header; `ink.init(K)` in `init`). Reference panel for ink technique: `src/scenes/05-song.js`.
Left neighbour: 08 Mughal miniature (dense, jewel-coloured, gold). Right neighbour: 10 Javanese shadow puppets (golden screen).

## Should look like
Zhu Da (八大山人, 1626–1705, public domain) — xieyi (写意) at its most radical: vast empty paper, a handful of
bold, wet, decisive strokes; birds and fish drawn with a few blots, perched precariously on top-heavy rocks or a single
withered lotus stem; and the famous **white eye (白眼)**: the eye drawn as a circle with the pupil pressed against the
top rim — a look of disdain. Everything is restraint. Original composition.

## Picture
- **Support**: off-white xuan paper (#efe9da), barely aged; LOTS of empty space (≥ 70% untouched).
- **Composition**: one top-heavy rock rising from the lower left (wet ink, a few strokes, dry-brush edges), a single
  bent lotus stem with one drooping leaf at the right, a small fish… or a small bird on the rock. The road is ONE
  dry horizontal stroke at y ≈ 806 that fades in and out (flat at the edges) — nothing else on the ground.
- Wet-ink blots with soft bleeding edges for rock and leaf (`ink.washLayer` with high `edge`), dry brush (飞白) for
  stems; tone contrasts from near-black to the palest grey.
- Ambient: almost nothing moves — the lotus leaf sways a hair; that stillness IS the style.

## Cast
A small bird (a myna or a little mandarin-duck-like bird) perched on one leg on the rock, drawn in 6–10 strokes,
with a white eye. Optional: a tiny fish at the lower right (also white-eyed).

## The gag (beat table) — "寥寥几笔，大片留白，鹈鹕翻着标志性的白眼"
| u | what happens |
|---|---|
| −7 … 0 | stillness; the bird on the rock stares into the void |
| 0 | the pelican crosses in (downbeat) — drawn in a few bold strokes |
| 1.0 | the bird's white eye slides toward the pelican |
| 2.0 | DOWNBEAT: the pelican stops dead in the emptiness, turns its head to the viewer (`lookBack`) and rolls its eye up — the white eye (`eye: 'white'`) — a perfect Bada glare. Hold. |
| 3.0 | the bird and the pelican glare at each other, both white-eyed; nothing else happens (silence is the joke) |
| 3.4 | the pelican "hmph"s — bill lifts slightly (`billOpen` 0.2) and it pushes off, nose in the air |
| 4.0 | DOWNBEAT: riding on, still glaring sideways |
| 6 → 13 | the bird's white eye follows it to the right edge |

## The pelican in this style
Reduce the rig to its essence: the body/neck/head as ONE or two loaded strokes (a pale grey wash body with a single
dark contour along the back), the primaries as one black wet blot, the bill as two strokes, the pouch as a pale wash,
the legs as two dry strokes; the bicycle as a handful of confident lines and two imperfect circles (wheels drawn as
single circular strokes, 6 spokes or none — just `mods.spokes` low and LOD). Generous paper inside the bird. Keep every
part present at the seams (simplified, but there).

## Title inside the artwork
Bada's inscriptions are short and cryptic: a two-column inscription in a strange, elongated cursive ("Xingkai SC")
in an empty upper area: 「八大山人写意」 and 「约公元一六九〇年」, followed by an odd-shaped red seal (oval or gourd
shape — draw your own variant of `ink.seal`). Chinese only.

## Palette
xuan paper #efe9da · ink #14110e (tones via `ink.tone`) · seal red #b72a20

## Hooks
- `ride: { hold: [2.1, 3.4], speed: 0.0, ramp: 0.3 }` (a full stop: lost = 1.0 s, the maximum) — the glare holds while it
  stands still; it eases away by u ≈ 3.6
- `mods(u)`: `lookBack`, `eye: 'white'`, `billOpen` only inside (1.9, 4.1); neutral outside (1, 5).
- `freezeU: 2.8` (the glare)
- `cues`: birdEye 1.0, glare 2.0, hmph 3.4, rideOn 3.6

## Watch out for
- Resist adding things. The emptiness must survive the pelican's arrival.
- The white eye must read at 1080p: eye circle ≥ 10 px on screen, pupil touching the top edge.
