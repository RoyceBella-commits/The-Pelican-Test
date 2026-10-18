# 08 mughal — 莫卧儿细密画 · 约公元 1600 年   (film t = 47–53 s; visible ≈ t 40 … 60)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/08-mughal.js`.
Left neighbour: 07 Maya codex (cream stucco, red bands). Right neighbour: 09 Bada Shanren (almost empty white paper).

## Should look like
Mughal court painting of the Akbar–Jahangir period (c. 1590–1620, public domain): opaque watercolour and gold on
burnished paper; jewel colours (lapis blue, malachite green, vermilion, saffron, pink, white), single-hair-brush
precision, gold highlights; a tilted ground plane showing a palace garden (charbagh) from above while figures and
architecture are seen from the side — **several viewpoints at once**; an illuminated border (hashiya) of gold flowers
and a ruled inner frame. For the pelican, think of Ustad Mansur's exquisite natural-history bird portraits.
Original composition.

## Picture
- **Support/border**: a gold-flecked margin with gold floral arabesques (inside the panel; the film's thin frame is
  outside), ruled lines in blue/gold/red, then the painting.
- **Garden**: a red-sandstone pavilion with a white marble jharokha balcony (emperor's window) at the upper right; a
  charbagh seen from above — water channels in silver-blue with lotus fountains, flower beds in a grid, cypresses and
  flowering fruit trees (pink blossom), a patterned carpet; the walkway the pelican rides on is the garden's
  main path, a pale band whose rider line is y = 800 (flat near edges).
- Courtiers watch **from every viewpoint at once**: on the pavilion terrace (side view), from the balcony, from behind
  the trees, from the rooftop, a gardener from a flower bed (seen from above), musicians on the carpet.
- Ambient: fountains glitter (gold sparkles on beats), a peacock's tail shimmers, fans wave.

## Cast
The emperor in the jharokha window (halo of gold), 6–10 courtiers in jamas and turbans, two musicians, a gardener,
a falconer with a falcon, a peacock.

## The gag (beat table) — "宫廷花园里，宾客从多个视角同时围观"
| u | what happens |
|---|---|
| −7 … 0 | courtly calm: music, fans, a fountain's gold sparkles |
| 0 | the pelican crosses in (downbeat) |
| 1.5 | the musicians falter; the falcon's head snaps round |
| 2.0 | DOWNBEAT: every onlooker in every viewpoint turns to the pelican at once — heads pop out from the balcony, the roof, behind each cypress, and the gardener (seen from above) looks straight up |
| 2.5 | the emperor raises a jewelled hand in approval; a shower of gold coins/petals (nisar) is thrown |
| 3.0–3.5 | the pelican, flattered, rides through the falling gold, slowing to a stately pace |
| 4.0 | DOWNBEAT: it rides on; the musicians resume with gusto |
| 6 → 13 | the courtiers' heads still turned toward the right edge; petals settle |

## The pelican in this style
A Mansur-quality portrait: fine white feathers built from tiny grey-blue strokes on opaque white, delicate shading on
the pouch (saffron to rose), each primary feather drawn, a gold outline highlight along the back, a jewel-like eye.
The bicycle becomes a court object: frame in vermilion with gold filigree, wheels with gold rims, a tiny turban-tassel
on the handlebar (accessory inside (1, 5) only).

## Title inside the artwork
In a gold-ruled cartouche inside the border (top centre), in gold on lapis blue: 「莫卧儿细密画」 and below it a
smaller line 「约公元一六〇〇年」; at the bottom of the painting, a tiny attribution in the manner of Mughal
inscriptions: "Mughal Miniature · c. 1600 — work of the pelican painter".

## Palette
lapis #23408e · malachite #2f7d5b · vermilion #c63b25 · saffron #e7a33b · rose #e59aa6 · marble white #f4efe4 ·
sandstone #b5553c · gold #c9a24a (with lighter #f1d98c highlights)

## Hooks
- `ride: { hold: [2.4, 3.8], speed: 0.4, ramp: 0.3 }`
- `freezeU: 2.8`
- `cues`: musicFalters 1.5, allTurn 2.0, nisar 2.5, rideOn 4.0

## Watch out for
- Detail density is the style — bake the garden, architecture, border and static figures at ≥ 2 px/unit; animate only
  heads, hands, gold sparkles and petals live.
- Multiple viewpoints must be deliberate and legible, not messy.
