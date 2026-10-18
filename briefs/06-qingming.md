# 06 qingming — 清明上河图 · 约公元 1100 年   (film t = 35–41 s; visible ≈ t 28 … 48)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/06-qingming.js`.
Ink kit: `src/kit/ink.js` (read its header; `ink.init(K)` in `init`). Reference panel for ink technique: `src/scenes/05-song.js`.
Left neighbour: 05 Song landscape (dark monumental peak on brown silk). Right neighbour: 07 Maya codex (bright stucco page).

## Should look like
Zhang Zeduan's handscroll 《清明上河图》 (public domain): ink line with light colour (淡设色) on aged silk,
meticulous ruled-line architecture (界画), hundreds of lively small figures, and its most famous passage — the
wooden **Rainbow Bridge (虹桥)** arching over the Bian River, crowded with vendors and onlookers, while a big cargo
boat below struggles to lower its mast. Original composition (do not copy the scroll's figures).

## Picture
- **Support**: light-brown aged silk (lighter than the Song panel), fine weave, faint creases.
- **Composition**: the Rainbow Bridge spans the middle of the panel: a timber arch from x ≈ 180 to x ≈ 820, deck
  crest around y ≈ 610, railings, stalls with parasols on the deck. The road at y = 800 enters from the left bank,
  climbs onto the bridge, crosses the crest, and comes down to y = 800 at the right bank (use `path()`; flat for 200
  units at both edges). Below the bridge: the river (pale washes, ripple lines) with a large cargo boat whose crew
  pole and haul ropes; willows and a tea house roof on the banks; distant roofs in light ink.
- Light colour: pale ochre, muted green-blue (石青/石绿 very diluted), pale vermilion accents on a few clothes/signs.
- Ambient: crowds mill (heads/arms switch poses on beats), the boat crew poles, water ripples.

## Cast
15–30 tiny figures (porters with shoulder poles, a sedan chair, vendors under parasols, gentlemen leaning on the
railings watching the boat, children), the boat crew (5–6), a donkey.

## The gag (beat table) — "骑过虹桥，桥上路人纷纷回头围观"
| u | what happens |
|---|---|
| −7 … 0 | everyone on the bridge leans over the railing watching the boat crew fight the mast |
| 0 | the pelican crosses in on the left bank (downbeat) |
| 1–2 | it climbs the bridge; a porter flattens against the railing to let it pass |
| 2.0 | DOWNBEAT at the crest: the whole crowd turns from the boat to the pelican at once — heads snap round |
| 2.5 | the boat crew look up too, and the forgotten mast swings and bonks the bridge beam (comic beat) |
| 3.0 | a vendor's steamed buns roll off his tray; a child copies the pelican's riding pose |
| 4.0 | DOWNBEAT: the pelican rolls down the far side; heads follow it |
| 6 → 13 | the crowd is still turned toward the right edge; the boat crew scramble with the mast |

## The pelican in this style
Like the scroll's figures: crisp fine ink outline (`ink.fine`), body left as pale silk with a faint lead-white
wash, pouch in pale ochre, legs pale orange-ochre, primaries in ink; bicycle in fine ruled lines (界画 precision!)
with pale vermilion frame. Same scale as the tiny figures? No — the rider stays at the normal rig scale (it is
a giant among the crowd; that is part of the joke).

## Title inside the artwork
A shop's hanging sign / wine flag (酒旗) on the bridge stall or tea house: 「清明上河图」 on the sign board, with a
smaller board 「约公元一一〇〇年」, in regular script. Optionally a tiny English shop sign "Along the River · c. 1100"
on a stall like a tourist-friendly menu (a small joke). One collector's seal in a corner.

## Palette
silk #c8b48c · ink #1c1814 · pale ochre #c99a5b · pale green #8fa58a · pale blue #8a9fa8 · vermilion #b5543a

## Hooks
- `ride: { hold: [2.1, 3.6], speed: 0.4, ramp: 0.3 }`
- `path(u, base)`: inside (1, 5) raise `y` along the bridge deck (smooth arch, crest ≈ 610 at x ≈ 500) and tilt
  `rot` with the slope (|rot| ≤ 0.18); default outside.
- `freezeU: 2.4` (crest, crowd turned)
- `cues`: crowdTurns 2.0, mastBonk 2.5, bunsRoll 3.0, downhill 4.0

## Watch out for
- Hundreds of tiny figures is expensive live: bake bodies, animate only heads/arms (a few strokes each) and keep live
  marks ≤ 400. The crowd's "head states" can be pre-baked variants swapped on beats.
- The road on the bridge must line up with the rig's wheels (use the same arch function for drawing and `path`).
