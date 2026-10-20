# 13 scream — 呐喊 · 1893   (film t = 77–83 s; visible ≈ t 70 … 90)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/13-scream.js`.
Left neighbour: 12 The Starry Night (night blues, impasto). Right neighbour: 14 Nosferatu (amber/blue tinted silent-film stairwell).

## Should look like
Edvard Munch's *The Scream* (1893, public domain): long undulating bands of colour (blood-orange and yellow sky, deep
blue-black fjord, green-grey land), the bridge with its railing as a hard straight diagonal against all the waves,
two dark distant figures on the bridge, and the skull-faced figure with hands to its face in the foreground. Thin,
scrubby tempera/crayon-like strokes on cardboard, letting the ground show. Original composition.

## Picture
- **Support**: brownish cardboard showing through thin paint in places.
- **Composition**: the bridge railing runs as a straight band across the lower third — but our road must be level at
  y = 800 at both edges: use a railing that is horizontal in the panel's middle and bends to the diagonal at the far
  left (perspective), deck at y = 800. Behind: the fjord curling in serpentine waves, hills, the sky in orange-red
  horizontal ribbons. Two dark figures far along the bridge at the left.
- **The screamer** stands at the right on the bridge, hands to its face, swaying — in the original pose before the gag.
- Ambient: every wavy band undulates slowly (phase drift of the wave functions) — the whole world vibrates.

## The gag (beat table) — "骑过那座桥，呐喊者变成被吓到的路人"
| u | what happens |
|---|---|
| −7 … 0 | the screamer screams silently at the world as usual; bands ripple |
| 0 | the pelican crosses in (downbeat) |
| 1.5 | the screamer's head turns toward the pelican; its hands still on its cheeks |
| 2.0 | DOWNBEAT: the screamer is properly terrified — it leaps back against the railing, the scream is now AT the pelican; the waves of the sky spike into jagged peaks |
| 2.5 | the pelican screams back: bill wide open (`billOpen: 1`, `scared: 1`, `eye: 'wide'`), feathers on end |
| 3.0 | the two distant figures turn and scream too; for one beat every band in the picture vibrates violently |
| 3.5 | both stop, look at each other, awkward silence |
| 4.0 | DOWNBEAT: the pelican pedals away; the screamer slides down the railing |
| 6 → 13 | the screamer peeks after it, hands still on its face |

## The pelican in this style
Munch's wavy line: the pelican's contours drawn as long sinuous strokes, its body in the pale yellow-white of the
screamer's face with greenish shadows, the primaries in the fjord's blue-black, the pouch in the sky's orange; the
bicycle in dark wavy strokes. Its silhouette may wobble slightly with the picture's waves inside (1, 5) — never at the seams.

## Title inside the artwork
Munch pencilled a tiny inscription into his sky. Do the same: in faint pencil-like handwriting in the sky at the upper
left: 「呐喊 · 1893」 and "The Scream". Small, scratchy, half-hidden in the colour bands but readable (≥ 26 px).

## Palette
blood orange #d4542b · sky yellow #e6b54a · red ribbon #b33a28 · fjord blue #2a3b66 · deep blue-black #18203a ·
green-grey land #5c6b4b · face pale #e3d8a6 · cardboard #8c6a45

## Hooks
- `ride: { hold: [2.3, 3.8], speed: 0.3, ramp: 0.3 }`
- `mods(u)`: inside (2.3, 3.9): `billOpen`, `scared`, `eye: 'wide'`; neutral outside (1, 5).
- `freezeU: 2.8` (mutual scream)
- `cues`: headTurn 1.5, screamerFright 2.0, pelicanScreams 2.5, everybodyScreams 3.0, silence 3.5 (the composer will make the strings go out of tune here)

## Watch out for
- The bands must be animated cheaply: bake several horizontal band textures and offset/warp them, or draw bands as
  polygons with sinusoidal edges (Canvas2D layer re-rendered per frame at low resolution, then scaled).
- Keep the screamer clearly the famous figure's type, but drawn by you.
