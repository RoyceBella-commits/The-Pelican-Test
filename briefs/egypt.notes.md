# 02 egypt — notes

## Picture
A New Kingdom tomb-chapel wall, built as an original composition:
- **Top:** a khekher frieze and a block border, with soot under the ceiling.
- **Marsh register:**
  - a fowler on a papyrus skiff, holding a throwstick and decoy birds;
  - a papyrus thicket with birds rising and butterflies;
  - a ginger cat on bent stems, holding a duck;
  - fish in zig-zag water;
  - a block of hieroglyph columns.
- **Title:** a yellow caption band reading 「埃及壁画 · 约公元前一三〇〇年」 and "EGYPTIAN TOMB PAINTING / c. 1300 BCE". The characters are filled blue/green/red with a black outline, set between ankh, sun and pelican signs.
- **Main register** (its ground line is the road):
  - three offering bearers: bread tray and basket, ducks, a jar and lotus;
  - an **unfinished gap** holding the red canon grid (18 squares, sole to crown) and a red cartoon of the freeze pose;
  - the scribe, facing the gap;
  - the noble couple, with perfume cones, staff, sekhem and lotus;
  - caption columns above them.
- **Below the road:** zig-zag water, a striped dado and a granite-speckled dado.
- **Weathering:** plaster losses (mud plaster with a chipped rim, plus two toned conservation fills) and cracks.

## Technique
- Everything is drawn crisp with Canvas2D, then passed through `paintPx()`, which applies:
  - granularity by pigment (Egyptian blue is the coarsest);
  - application mottle;
  - slightly translucent gypsum white;
  - flakes lost along a field fixed to the wall;
  - soot.
- **Static paint:** one wall bake.
- **Flip-book figures:** an atlas of 39 sprites, one per painted state, switched on beats.
- **The live pelican:** painted every frame with the same pass. Its flakes fall to the plaster colour (`solid`), never to whatever lies behind it.
- **Cracks and losses:** one overlay, drawn over everything.
- **Live p5.brush marks:** 0.
- **Rider path:** inside (1, 4.9), `path()` replaces the profile. The bird brakes to a dead stop exactly on the u=2 downbeat (Hermite curve), holds until 3.6, then bursts back onto the profile by 4.9. `reposed()` recomputes crank and wheel from the drawn path, so the pedals stop with the bird instead of skidding.
- **Freeze position:** X_F = CRANK_DIST·8.5 − panelLeft(1) ≈ 414.3. At that point the live crank is exactly π, with the far pedal forward. That is the Egyptian canon (far leg advanced), so at the snap and the dissolve the painted legs and the riding legs coincide.

## Beats
| u | |
|---|---|
| −7…2, 4… | Bearers toggle poses, one per beat in round-robin (bearer 1 on downbeats). The scribe dips and writes, the birds flap, the cat's tail flicks, the fowler throws, and the wife sniffs her lotus every 4 s. |
| 0 | The pelican rides in past the bearers. |
| 1.0–2.0 | It brakes toward its own cartoon. |
| 1.5 | The scribe raises his reed pen. |
| 2.0 | Dead stop and snap into the painted canonical pose: frontal kohl eye, both wings raised with tips curled forward (adoration), broad collar, stiff profile legs, a diagram bicycle with six-spoked chariot wheels. The canon grid flares and fades by 2.75. The wall pauses. |
| 2.5–3.0 | The cartouche is painted: rope ring from the top down the scribe's side, then the tie bar, then 「鹈鹕测试」 stroke group by stroke group (connected components ordered top→bottom, wiped along their long axis; fresh paint darker). The scribe's pen follows each character. |
| 3.0 | The noble and wife turn their heads back; the cat turns a frontal face. |
| 3.6–3.86 | The painting flakes away (wall-fixed noise) into the riding rig. |
| 4.0 | Riding on, with a light wind on the burst. |
| 5.0 | The scribe looks after it. |
| 5.5 | The couple face right; the noble extends his sekhem (the consecration gesture). |
| 6–13 | An empty red cartoon with the finished cartouche beside it. |

`freezeU` is 3.2 (the brief said 2.9). At 3.2 the outro tile also shows the couple and the cat looking.

## Numbers
- Init: ≈ 0.3 s.
- Bakes: ≈ 21 MB (wall 6.25, overlay 6.25, atlas 2048×1024 = 8, cartouche, grid).
- Solo frames: 1–7 ms. Film frames: ≤ 10 ms in steady state.
- Max live marks: 0.
- `check.mjs --quick`: PASSED.

## Reusable helpers (in the scene file)
- `paintPx` — a flat-pigment model.
- `person()` — a composite-view Egyptian figure: canon proportions, IK arms, wigs, collar, kohl eye, head that can turn back.
- `drawSign` / `layoutColumn` / `glyphBlock` — about 28 hieroglyph signs with column layout.
- The cartouche reveal-time builder — a stroke-order wipe for any text sprite.
