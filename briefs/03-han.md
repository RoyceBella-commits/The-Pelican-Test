# 03 han — 汉画像石拓片 · 约公元 100 年   (film t = 17–23 s; visible ≈ t 10 … 30)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/03-han.js`.
Ink kit: `src/kit/ink.js` (read its header; `ink.init(K)` in `init`). Reference panel for ink technique: `src/scenes/05-song.js`.
Left neighbour: 02 Egyptian tomb painting (warm ochres). Right neighbour: 04 Tang baimiao (fine ink line on pale paper).

## Should look like
An ink rubbing (拓片) taken from an Eastern Han pictorial stone relief (画像石), e.g. the Wu Liang Shrine type
(public domain): a black field made by dabbing ink over paper laid on carved stone, with the carved-away figures
showing as WHITE paper silhouettes inside the black, incised details as thin white/grey lines, and the stone's
texture (pits, cracks, chisel striations) printed into the black. Figures are flat, in strict profile, in horizontal
registers separated by border bands (geometric diamond/cloud-scroll bands). Original composition.

## Picture
- **Support**: a sheet of rubbing paper filling the panel — the black ink is not uniform: dabbed, mottled, slightly
  greyer where the pad pressed lightly, darker at edges of raised forms, with paper fibres and a few creases. The
  paper's edge/margin may show as a narrow pale strip at top or bottom (part of the sheet), with a red collector seal.
- **Registers**: three horizontal bands. Top band: a geometric ornament border + a row of birds/immortals (仙人) or
  a cloud-scroll frieze. Middle band (main): a **车马出行 procession** — horse-drawn chariots with parasols (伞盖),
  outriders on horseback, foot attendants with staffs — moving left → right along a ground line at **y = 800**
  (the road!). Bottom band below the road: ornament border (diamond lattice / 菱形纹).
- The register lines are stone bands, so the road at y = 800 is the procession's ground line; keep it flat for 200
  units at both edges.
- Everything carved = white silhouettes on black; inner details incised as fine light lines.

## Cast
The procession: 2–3 chariots (single horse each, 轺车 with parasol and driver + passenger), 2–3 mounted outriders,
2 walking attendants. They move slowly left → right through the whole visibility window, in step on the beats
(carved figures shift between 2 poses like a flip-book: legs alternate on half-beats).
**The pelican joins the procession** — as if it had always been carved there.

## The gag (beat table) — "车马出行队列里混进一辆鹈鹕自行车"
| u | what happens |
|---|---|
| −7 … 0 | the procession advances in carved flip-book steps |
| 0 | the pelican crosses in at the rear of the procession (downbeat) |
| 0–2 | it overtakes a walking attendant; the attendant's head turns |
| 2.0 | DOWNBEAT: the pelican slots in between two chariots and matches their pace (ride hold slows it to the procession's speed); everyone freezes in a formal carved pose — a perfect "official" procession tableau |
| 2.5 | a chariot passenger leans out of his carriage to look back at it |
| 3.0 | an outrider's horse rears in surprise (one flip-book pose) |
| 3.5 | an inscription cartouche next to the pelican gets its label: see Title |
| 4.0 | DOWNBEAT: the pelican pulls out and overtakes the lead chariot |
| 6 → 13 | the procession continues; the lead driver stares after it |

## The pelican in this style
A white carved silhouette like every other figure (no grey fills, no outline drawn in black): body, neck, head,
bill and pouch, wings, legs and the whole bicycle as white shapes knocked out of the black, with incised detail
lines (feather lines on the wing, spokes, chain) as thin white lines. Wheels: white rings with 8 spokes (Han
chariot wheels look similar — a lovely rhyme). Slight rubbing texture (black specks) inside the white, as on stone.

## Title inside the artwork
A carved inscription cartouche (榜题) — a small vertical rectangle beside a figure, as Han reliefs label their
figures — in clerical script (隶书, font "Libian SC"), white on black: 「汉画像石拓片」 and 「约公元一百年」.
A second, comic cartouche appears next to the pelican at u ≈ 3.5: 「鹈鹕骑者」 (as if the stone labelled it).
English small along the paper margin like a modern archive note: "Han pictorial stone rubbing · c. 100 CE".
A red square collector seal on the margin.

## Palette
ink black #141210 · grey dab #2b2825 · rubbing paper white #e9e3d6 · paper margin #d8cfbf · seal red #b4291f

## Hooks
- `ride: { hold: [2.2, 3.8], speed: 0.4, ramp: 0.3 }`
- `freezeU: 2.8`
- `cues`: attendantTurns 1.0, tableau 2.0, passengerLooks 2.5, horseRears 3.0, cartouche 3.5, overtake 4.0

## Watch out for
- Silhouettes must be crisp but organic (hand-carved): slight irregular edges, not vector-perfect.
- Bake the black field, borders and stone texture. The procession moves, so draw figures live but cheaply (flat
  white fills + a few incised lines each; ≤ 400 marks total).
- "Libian SC" is available on this Mac; check `document.fonts`.
