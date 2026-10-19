# 08 mughal — notes

## Composition
An album page with a buff hashiya margin: gold flowering sprays, zar-afshan flecks and corner rosettes. Inside it are jadval rules in gold, lapis, white and vermilion. The picture uses several viewpoints at once:
- **Plan view (tilted up):** the charbagh. It has a cross of silver-blue channels with zigzag ripples, an octagonal lotus tank at the crossing, and four quadrants. Each quadrant holds four flower beds and a small fountain basin. Each bed is a field of small side-view plants (poppy, narcissus, rose, iris, tulip, marigold).
- **Elevation:** standing on that plan are
  - a back wall with kanguras, a peacock perched on it with its train down the wall face, cypresses (two with flowering vines) and blossom trees;
  - at the right, a red-sandstone pavilion: chhatris, a marble jharokha with a bangla roof and halo, zenana windows with jali, cusped arcades with a brocade and lamps, and a tiled terrace.
- **From directly above:** the gardener.
- **Foreground:** a carpet in plan with two musicians in profile (rudra veena and pakhawaj), plus a row of botanical specimens.
- **The walk:** rider line y 800. It runs out through the side margins, as Mughal pictures sometimes break their frame.

A warm varnish, foxing and paper grain are baked in.

## Gag (camera push to z 1.16 over u 0.7–2.0, back out over 4.1–5.4)
| u | |
|---|---|
| −7…1.5 | Court calm. Musicians play on the beat. Chowrie and morchhal wave. The gardener digs. Fountains glitter on every beat and the peacock's ocelli shimmer. A guard's spear tip shows over the parapet. |
| 1.5 | The musicians falter (heads up). The falcon bates and snaps its head round. |
| 2.0 | Every onlooker spins to face the pelican, hands to lips (the Persianate gesture of astonishment) or up. Ladies pop into the windows, the guard over the parapet, courtiers from behind three cypresses. The gardener looks straight up, his face upside-down to us. The emperor drops his rose. The pelican's eye goes wide. |
| 2.5 | The emperor raises a jewelled hand. The nisar begins: 120 gold coins and 130 rose petals, thrown from hands, windows and roof on analytic paths. He also flings his lapis turban tassel. |
| 2.95–3.5 | The tassel catches on the handlebar. The pelican lifts its bill (`lookBack` 0.5) and closes its eyes while gold rains round it during the hold. |
| 4.0 | Musicians resume at double time. Heads follow the pelican as it passes. |
| 4.55 | The tassel flies off and lands on the walk. |
| 6–13 | All heads face right. Coins lie on the walk and glint; petals settle. |

## Technique
- **Bakes:** one 2048² Canvas2D `K.layer` for the picture. Every figure is a Canvas2D sprite, one per pose state, in a 2048×4064 atlas of 127 sprites. Clip paths are baked in for figures behind cypresses, parapets and windows.
- **Pelican:** painted live in Canvas2D into a reusable 900×760 image:
  - feathers: opaque white with scalloped grey-blue feather rows, tertials, a dark secondaries wedge and individual primaries;
  - colour: a rosy blush, a saffron-to-rose pouch with veins, a garnet eye, and a gold highlight along the back and nape;
  - bicycle: a vermilion frame with gold filigree and lugs, gold rims, lacquered tyres with gold dots, a rosette chainring and a velvet saddle.
- 0 live p5.brush marks.

## Reusable helpers
`archPoly` (cusped Mughal arches), `goldText` (outlined, burnished gold lettering from a glyph mask), `cloud` (gold-edged tchi cloud band), `cypressPoly` and `cypress`, `standing` / `headPaint` (profile figure with jama, patka and turban), and an analytic nisar particle system.
