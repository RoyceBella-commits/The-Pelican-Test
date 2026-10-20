# 11 ukiyoe — 浮世绘 · 1830 年代 · 广重东海道风格   (film t = 65–71 s; visible ≈ t 58 … 78)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/11-ukiyoe.js`.
Left neighbour: 10 wayang kulit (warm lamp-lit screen). Right neighbour: 12 The Starry Night (swirling night blues, impasto).

## Should look like
Utagawa Hiroshige's *Fifty-three Stations of the Tōkaidō* (1833–34, public domain): colour woodblock print — a black
key-block line, flat colour areas with **bokashi** gradations (indigo sky fading to white at the horizon, a red
dawn band), Prussian ("Berlin") blue, paper grain and the slight mis-registration of a real print; travellers in
straw hats, porters with a palanquin (kago), pine trees along the road, Mt Fuji or a bay in the distance; a vertical
title cartouche and the artist's signature cartouche. Original composition (not a copy of any station).

## Picture
- **Support**: off-white washi with visible fibre grain and a printed margin; colour blocks slightly offset (1–2 px)
  from the key lines.
- **Composition**: the Tōkaidō road crosses the panel at y = 800 (flat near edges) along a low embankment; a row of
  gnarled pines with flat-topped silhouettes; a teahouse with a lantern at the right; a bay with sails and a small
  Mt Fuji in the distance; a big bokashi sky.
- Ambient: travellers walk in two-pose steps, sails drift, the teahouse lantern sways.

## Cast
2 porters carrying a kago with a passenger, a traveller in a straw cape, a pilgrim with a staff, a horse with a groom,
a teahouse woman at the door.

## The gag (beat table) — 骑行在东海道上 + a sudden shower (original twist)
| u | what happens |
|---|---|
| −7 … 0 | a fine day: travellers trudge, the kago bobs |
| 0 | the pelican crosses in (downbeat) |
| 2.0 | DOWNBEAT: a sudden shower — Hiroshige-style straight diagonal rain lines sweep across the whole print (in two grey tones), the sky darkens with a bokashi from the top, trees bend; travellers hunch, a straw cape flaps, the kago bearers run |
| 2.5 | the pelican calmly keeps pedalling — and its pouch fills with rainwater (pouch sags lower and lower, `billOpen` slight) |
| 3.5 | it lifts its bill and gulps the pouchful (a satisfied blink) |
| 4.0 | DOWNBEAT: the shower ends as abruptly as it came; the sky returns |
| 6 → 13 | travellers wring out their sleeves and stare after the pelican |

## The pelican in this style
Woodblock print figure: black key line of even weight, flat white body (paper colour) with a soft grey bokashi on the
belly, primaries solid black, pouch in a flat orange-vermilion with a bokashi, legs vermilion, eye a black dot. The
bicycle: key line black, frame in Prussian blue, tyres black. Colour blocks offset slightly from the key line.
Rain lines pass in front of everything during the shower.

## Title inside the artwork
The print's vertical title cartouche (upper right, red with a yellow inner panel, black text): 「东海道 · 浮世绘」 and
「一八三〇年代」; a smaller rectangular cartouche with "Ukiyo-e · 1830s"; the signature cartouche at the lower
left 「鹈重画」 (a playful nod to 広重画) with a small red seal; a publisher's round seal.

## Palette
paper #f1e9d6 · Prussian blue #1f3f73 → #8fb3cf (bokashi) · indigo #2b3a55 · vermilion #d0502e · pine green #4c6b3c ·
ochre ground #c9a46a · key black #1b1714

## Hooks
- `ride: { hold: [2.3, 3.7], speed: 0.5, ramp: 0.3 }`
- `mods(u)`: inside (2.4, 3.9): `billOpen` up to 0.25 and a deeper pouch (you may draw the pouch larger yourself).
- `freezeU: 2.9` (rain + full pouch)
- `cues`: shower 2.0, pouchFill 2.5, gulp 3.5, showerStops 4.0

## Watch out for
- Rain lines are straight, parallel, and printed (not blurry streaks); keep them cheap (lines, ~150).
- Flat colour + bokashi only; no painterly brushwork.
