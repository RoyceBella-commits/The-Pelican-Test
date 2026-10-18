# 03 han — notes

## Technique
- Every carved shape is drawn with Canvas2D as whiteness: white means cut away, black means raised stone. Shapes are built with a small "carver" (`cr / pl / limb / ring / inc / cut`). Each white shape is first outlined by a thin uncut ridge, which gives the carved-overlap look of Han reliefs.
- `printPx()` turns whiteness into a rubbing:
  - blur, then threshold against a noise tile, so cut edges look hand-made;
  - a grey fringe where the paper sags into a cut, plus light ink haze on the sunk paper;
  - a darker ink rim on the raised stone beside each cut.
- Static stone bake at 1.25 px/unit:
  - the field takes cellular pad-dab mottle, greyer zones, chisel striations and spalls;
  - plus the bands (sawtooth, hanging swags, 穿璧纹 discs-and-ribbons, 菱形纹 lattice), the cloud frieze, the title cartouche, ragged paper margins, the pencil archive note and the red seal.
- Procession: 51 sprites, one per carved flip-book state, in a 2048×1792 atlas. Chariot wheels are separate sprites that roll.
- The pelican is carved live every frame with the same printer, about 200k px and a few ms. Its edge grain travels with the bike.
- Sheet overlays are applied over everything:
  - MULTIPLY: grit specks, haze, crease shadows, stains;
  - SCREEN: pinholes, fibres, cracks, crease ridges.
- 0 live p5.brush marks.

## Geometry decision (deviation from the brief, on purpose)
The rig is about 354 units long, and over one bar it gains only about 200–400 units on any procession. A chariot (about 265 units) can't be fully overtaken before the seams, and neither can an attendant if the pelican is to end up between two chariots. So:
- The procession glides at the hold speed: `ride {hold:[2,4], speed:0.65, ramp:0.35}`, lost 0.58 s, VP ≈ 111 u/s. In the tableau the pelican truly matches its pace.
- Chariot C rolls in from the left edge behind the pelican after it has entered (u ≈ 0.85). The pelican closes up on chariot B.
- In bar 3 the pelican chases B, its front wheel drawing level, as B leaves the stone at u ≈ 5.2. Both seams stay clean.

## Beats
| u | |
|---|---|
| −7…0 | Procession trots right; legs flip on half-beats, birds flap on beats. An empty cartouche glides in a gap of the column. |
| 0 | The pelican enters at the rear. |
| 1.0 | Attendant ahead of B turns round and points back. |
| ~0.85–2 | C appears behind the pelican, which slots in under the empty cartouche. |
| 2.0 | Everyone (including the upper-register phoenixes) freezes in formal pose. The pelican sits up stiffly (bob 0.15). |
| 2.5 | B's passenger leans out and looks back. |
| 3.0 | C's horse rears and its driver hauls back. The pelican's eye goes wide (scared 0.3) until 3.5. |
| 3.5 | 「鹈鹕骑者」 is cut one character per 1/16 note, with stone chips flicking off. |
| 4.0 | The pelican pulls out (wind 0.7) and chases B off the stone. |
| ≥6 | Procession continues. C's passenger points, its driver stares after it. The label 「鹈鹕骑者」 rides on above an empty gap. |

`freezeU` is 3.7: the full gag in one tile.

## Numbers
- Init: 343 ms.
- Bakes: 31.9 MB (stone, 2 overlays, atlas).
- Solo frames: 6–9 ms. Film frames: ≤ 80 ms with neighbours, excluding their one-time init.
- Live marks: 0.
- `check.mjs --quick`: PASSED.
