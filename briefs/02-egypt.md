# 02 egypt — 埃及壁画 · 约公元前 1300 年   (film t = 11–17 s; visible ≈ t 4 … 24)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/02-egypt.js`.
Left neighbour: 01 Saharan rock art (ochre pigments on sandstone). Right neighbour: 03 Han rubbing (white on black).

## Should look like
New Kingdom tomb painting (18th–19th Dynasty, public domain): e.g. the tomb-chapel paintings of Nebamun and the
tomb of Sennedjem. Flat mineral colours (Egyptian blue, malachite green, red and yellow ochre, carbon black, gypsum
white) on a smooth plastered wall with a buff/greyish ground; crisp black or red outlines; figures in the canonical
composite view (head in profile, eye frontal, shoulders frontal, legs in profile, striding); registers separated by
ground lines; columns of hieroglyphs between figures; papyrus marshes with birds (Egyptians painted pelicans — the
pelican is a real hieroglyph). Original composition.

## Picture
- **Support**: plastered wall, warm buff ground (#d9c39a), fine plaster cracks, a few losses showing mud plaster,
  slight soot darkening near the top. A painted frieze of khekher ornaments along the top; a coloured band border.
- **Registers**: upper register — a marsh scene (papyrus thicket, birds rising, a cat among the reeds, fish in
  zig-zag water); main register — the road is the register's ground line at y = 800, along which a procession of
  offering bearers and a noble couple stand (striding left → right); lower register below the road — a band of
  zig-zag water / a dado of coloured stripes.
- Columns of hieroglyphs (draw your own simple glyph shapes: owl, reed, water line, bread loaf, eye, feather…) fill
  the gaps above figures. All colour flat, outlines confident and even.
- Ambient: almost static — but on each downbeat a figure "updates" between two painted poses (raising an offering,
  turning the head) as if the wall were a flip-book.

## Cast
A noble and his wife (seated or standing, larger scale = higher rank), 3 offering bearers (bread, ducks, a jar), a
scribe with a palette, a cat in the marsh, birds.

## The gag (beat table) — "象形文字框写着「鹈鹕测试」，在此放慢定格摆出壁画标准姿势"
| u | what happens |
|---|---|
| −7 … 0 | the offering procession shuffles between painted poses on the downbeats |
| 0 | the pelican crosses in (downbeat) |
| 1.5 | the scribe raises his reed pen |
| 2.0 | DOWNBEAT: the pelican stops dead and snaps into the canonical pose — composite view: frontal eye with kohl line, the near wing raised flat in the Egyptian "adoration" gesture, legs in strict profile stride, the bicycle flattened into a perfectly side-on diagram with two six-spoked chariot wheels (rhyme with Egyptian chariots). Hold — it is now a wall painting. |
| 2.5 | the scribe paints a cartouche beside it, stroke by stroke over one beat: 「鹈鹕测试」 |
| 3.0 | the noble and his wife turn their heads (still in profile) to look; the cat in the reeds turns too |
| 3.6 | the pose dissolves back into the riding rig |
| 4.0 | DOWNBEAT: riding on |
| 6 → 13 | the cartouche stays on the wall; the noble keeps looking right |

## The pelican in this style
Egyptian painted bird: gypsum-white body with a thin red-ochre outline, wings with blue-and-green feather bands and
black primaries, the bill and pouch in yellow ochre with a red outline, legs red ochre, a frontal kohl-lined eye. The
bicycle in Egyptian blue with black outline; wheels with **6 spokes** (`mods: { spokes: 6 }` is fine everywhere —
it doesn't change the silhouette). In the freeze pose you may draw a stylised variant of the parts (keep the skeleton
recognisable); outside (1, 5) draw the normal rig in this palette.

## Title inside the artwork
A painted hieroglyphic text band (a horizontal yellow band with blue/black signs, like the captions in tombs) at the
top of the main register: Chinese 「埃及壁画 · 约公元前一三〇〇年」 painted as if glyphs (colour-filled characters
with black outline), and a short English line in the same manner "Egyptian Tomb Painting · c. 1300 BCE".
The cartouche 「鹈鹕测试」 (oval rope ring with a base bar) is the gag's payoff.

## Palette
plaster #d9c39a · Egyptian blue #2f6fa3 · malachite #3f8f6a · red ochre #a6402a · yellow ochre #d6a23e ·
black #1d1a17 · white #f2ead8

## Hooks
- `ride: { hold: [2.05, 3.35], speed: 0, ramp: 0.3 }` (a full stop; lost = 1.0 s, the maximum)
- `mods(u)`: inside (1.9, 3.7) you may set `lookBack: 0.6` and `feetOff: 0.3` to stiffen the pose; neutral outside (1, 5).
- `freezeU: 2.9` (the pose + finished cartouche)
- `cues`: scribe 1.5, freezePose 2.0, cartouche 2.5, nobleTurns 3.0, rideOn 3.6

## Watch out for
- Flat colour, no gradients, no shading — Egyptian painting has none.
- Composite-view pose is the joke; make it unmistakable.
