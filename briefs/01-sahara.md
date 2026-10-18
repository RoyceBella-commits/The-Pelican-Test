# 01 sahara — 撒哈拉岩画 · 约公元前 4000 年   (film t = 5–11 s; visible ≈ t 0 … 18)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/01-sahara.js`.
Left neighbour: the exhibition's preface sheet (cream paper, pen-line pelican). Right neighbour: 02 Egyptian tomb painting.
This is the FIRST real panel the audience sees — it sets the quality bar for the whole film.

## Should look like
Pastoral ("Bovidian") period rock paintings of Tassili n'Ajjer, Algeria (public domain, c. 5000–2000 BCE): herds of
long-horned cattle painted in red/brown ochre with white (kaolin) piebald patches, slender herders in profile with bows
and staffs, women, children, dogs; fluid contour lines, overlapping groups, figures walking in procession. Older,
faded white "Round Head" figures sometimes show through underneath (superimposition). Original composition only.

## Picture
- **Support**: a sandstone rock-shelter wall filling the whole panel. Warm salmon/ochre stone with horizontal bedding
  planes, a few fissures, dark desert-varnish streaks running down, spalled patches (lighter, rougher, where paint has
  flaked away), fine grain everywhere. It is a surface, not a landscape: no sky, no horizon.
- **Paint**: matte, dry, powdery pigment; rock grain shows through every painted shape (modulate pigment opacity by
  rock texture), small losses and abrasion, edges slightly soft. Bake the wall and the static paint layers in `init()`.
- **The road**: a natural ledge/ground line in the rock (a darker bedding seam or a painted ground line) at y = 800,
  flat for 200 units at both edges; the painted figures stand on it or on short painted ground strokes.
- Composition: a procession of the herd moving right to left (toward the viewer's left, i.e. *against* the rider's
  direction, so they meet), herders among them; a faint older layer of 2–3 ghostly white figures behind (low alpha).
  Keep the centre band (x 300–700, y 450–800) readable for the gag.
- Ambient life during the whole window: figures move between a few painted "states" (discrete poses, as if the
  painting itself shifts), on beats — never smooth tweening. E.g. heads dip to graze, a tail flicks, a herder steps.

## Cast
6–9 cattle (different sizes and hide patterns, lyre-shaped horns, some overlapping), 3–4 herders (bow, staff,
a child), 1 dog. Before the pelican arrives (u < 0): grazing procession. After it leaves (u > 6): everybody remains
turned toward the right edge, looking where it went.

## The gag (beat table) — "牧人和牛群停下来围观"
| u | what happens |
|---|---|
| −7 … 0 | the herd grazes / plods leftward on the beats |
| 0 | pelican crosses in from the preface sheet (downbeat) |
| ~1.0 | the nearest cow lifts its head (first notices) |
| 2.0 | DOWNBEAT: the whole painted herd freezes and turns toward the pelican at once (heads switch to "looking" states) |
| 2.3–3.7 | the pelican coasts almost to a stop in the middle, showing off (ride hold) |
| 3.0 | the child herder points; the dog sits |
| 3.5 | the lead herder raises both arms (classic rock-art "orant" pose); a cow's tail stands up |
| 4.0 | DOWNBEAT: the pelican pedals off; heads track it in steps |
| 6 → 13 | all heads stay turned toward the right edge |

## The pelican in this style
Painted in the same pigments as the cattle — **not white-by-default**: body/neck/head as a red-ochre silhouette with
white kaolin patches (like a piebald cow), black (manganese) primaries and bill nail, yellow-ochre pouch, legs in red
ochre. The bicycle in thin dark-red painted lines; wheels as painted double rings with 8 spokes (`mods: { spokes: 8 }`
is allowed everywhere because it does not change the silhouette — keep it the same for u inside and outside (1,5)).
Same pigment texture/abrasion as the rest of the painting (rock grain showing through). Use `K.rig.parts()`.

## Title inside the artwork
Painted on the rock as a later "inscription" in finger-applied ochre, rough-edged and slightly abraded like the rest:
「撒哈拉岩画」 large, 「约公元前 4000 年」 smaller, and "Saharan Rock Art · c. 4000 BCE" small in white pigment.
Upper-left area, away from the gag. Add a single positive ochre handprint beside it as the "artist's signature".
Text sprites from `K.text` can be used as a mask/shape source, but the result must look painted on stone
(texture, uneven coverage), never like clean typography.

## Palette
rock #c98a5a · #b8744a · light stone #dcab7f · varnish #5a3a26 · red ochre #8e2f1c / #a5432a · yellow ochre #c98b2b ·
kaolin white #efe4cf · manganese black #2b1f1a

## Hooks
- `ride: { hold: [2.3, 3.7], speed: 0.15, ramp: 0.35 }`
- `freezeU: 3.2` (arms raised, everyone watching)
- `cues: [{u:1.0,name:'cowNotices'},{u:2.0,name:'herdTurns'},{u:3.0,name:'childPoints'},{u:3.5,name:'armsUp'},{u:4.0,name:'rideOn'}]`
- no camera override, no overlay.

## Watch out for
- The figures must read as *paintings on rock*, not cartoons: elegant Tassili contours, flat pigment, no outlines in
  black unless the style calls for it.
- Discrete pose states change on beats (u multiples of 0.5) for the "painting comes alive" feel.
- The preface sheet is on the left; your panel must look complete while it is only half on screen (u −7 … 0).
