# 12 muybridge — 迈布里奇连拍 · 1878   (film t = 71–77 s; visible ≈ t 64 … 84)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/12-muybridge.js`.
Left neighbour: 11 ukiyo-e (bright woodblock colours). Right neighbour: 13 The Starry Night (swirling blues).

## Should look like
Eadweard Muybridge's 1878 sequential photographs (public domain), above all "The Horse in Motion" cabinet card: a grid
of small sepia albumen photographs on a printed mount card, each frame numbered, the subject dark against a white
backdrop ruled with numbered vertical lines; a printed caption and credits below. The bet it famously settled —
whether all four hooves leave the ground at once — becomes ours: **do both feet leave the pedals at once?**

## Picture
- Default view (all the time except inside (1, 5)): ONE big sepia photograph filling the panel — the race track in the
  open air: a whitewashed backdrop fence with vertical lines numbered 1–20 (in black stencil numerals), the dirt track,
  the sky blown out to warm white; albumen-print tone (sepia with slightly greenish shadows), grain, a soft vignette,
  dust specks, a faint silver mirroring at the edges. The road is the track; the rider line is y = 800.
- A row of cameras (wooden boxes on a shed) peeks at the far left edge; tripwires across the track (thin white threads).
- Ambient: dust drifts; the photograph "breathes" (tiny exposure flicker on beats).

## The gag (beat table) — "鹈鹕版赌局：双脚是否同时离开踏板"
| u | what happens |
|---|---|
| −7 … 0 | an empty track; a gentleman in a top hat and a bookmaker wait at the right with a pocket watch |
| 0 | the pelican crosses in (downbeat) — a sepia photograph of a pelican on a bicycle |
| 1.0 | it hits the first tripwire: SNAP — a shutter flash |
| 1.2 → 2.0 | the picture breaks into a **contact grid of 12 numbered frames** (3 rows × 4), each a successive photo of the rider 0.06 s apart (render each cell from `ctx.riderAt(...)`), with shutter clicks on every eighth-beat |
| 2.0 | DOWNBEAT: the grid freezes; frame No. 7 shows **both feet off the pedals** (`feetOff: 1` for that cell only) |
| 2.5 | a red pencil circle is scrawled around frame 7; the bookmaker drops his hat |
| 3.0 | the gentleman holds up a banknote "¥25,000"; caption types: "PROVED." |
| 3.8 → 4.4 | the grid reassembles into the single photograph |
| 4.0 | DOWNBEAT: riding on |
| 6 → 13 | the gentleman still holding the note, the bookmaker scratching his head |

## The pelican in this style
A monochrome sepia photograph of a white bird: body pale, softly modelled with tonal gradients (not outlines), dark
primaries, slightly motion-blurred wheels (radial blur of spokes), the bicycle frame dark; the subject a bit darker
than the backdrop overall (photographic silhouette quality). Same grain as the rest. `feetOff` only in the proof cell.

## Title inside the artwork
Printed on the mount card under the photographs (Victorian typography — "Bodoni 72"/"Didot"):
"THE PELICAN IN MOTION." / 「迈布里奇连拍 · 鹈鹕的运动」 / "Illustrated by sequential photographs · 1878" /
"Patent applied for." In the single-photo view, the same caption is printed on the card margin at the bottom.

## Palette
albumen highlight #e9dcc0 · mid sepia #a8875e · shadow #3e2f22 · mount card #d9cbb0 · print black #231a12 · red pencil #b33a2a

## Hooks
- `ride: { hold: [2.0, 3.6], speed: 0.3, ramp: 0.3 }`
- `mods(u)`: neutral at the seams; inside cells you control `feetOff` per cell via `ctx.riderAt` + your own pose call
  (`K.rig.pose(state, mods)` + `K.rig.placed`).
- `freezeU: 2.8` (grid with the circled frame 7)
- `cues`: shutter 1.0 then shutters every 0.0625 s until 2.0, proofCircle 2.5, banknote 3.0, reassemble 3.8

## Watch out for
- 12 rider renders per frame are expensive: draw cells with a simplified rig (≤ 25 marks per cell) and the full one
  outside the grid.
- The grid only inside (1, 5).
