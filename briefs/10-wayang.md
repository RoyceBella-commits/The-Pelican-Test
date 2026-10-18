# 10 wayang — 爪哇皮影戏 Wayang Kulit · 约公元 1800 年   (film t = 59–65 s; visible ≈ t 52 … 72)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/10-wayang.js`.
Left neighbour: 09 Bada Shanren (empty white xuan paper). Right neighbour: 11 ukiyo-e (Hiroshige blues).

## Should look like
Javanese wayang kulit (public-domain tradition): flat leather puppets with extraordinarily fine openwork perforation
(tatah) and painted/gilded decoration (sungging), elongated stylised profiles, arms on thin horn rods (gapit and
tuding), stuck into a banana-trunk stage (gedebog) in front of a white cotton screen (kelir) lit by an oil lamp
(blencong). We look from the dalang's side: colourful puppets against the glowing screen, rods visible.
The central **gunungan / kayon** (mountain-tree puppet) marks the scene. Original puppet designs.

## Picture
- **Screen**: a warm-white cloth screen filling the panel, with a red/black border band at the top, lit unevenly by a
  flickering lamp (a warm hot spot that breathes on the beats); soft dark shadows of the puppets fall on the screen,
  offset slightly and blurred (they move with the puppets).
- **Stage**: a long banana trunk lying along the bottom — its top surface is the road at y = 800 (flat near edges);
  puppets' central rods are stuck into it.
- **Puppets**: the gunungan at the left-centre (tall leaf/mountain shape full of perforated trees, animals, a gate),
  a refined knight (alus, slender, downcast face) and a big ogre (raksasa, bulging eyes, fangs) facing each other at the
  right; each has jointed arms on rods.
- **Perforation**: the signature craft — rows of tiny holes and slits through which the screen light shines (bake the
  perforation patterns as alpha masks; light shows through as glowing dots).

## The gag (beat table) — "镂空皮影鹈鹕和自行车，能看到操纵杆，车轮动得一顿一顿"
| u | what happens |
|---|---|
| −7 … 0 | the knight and the ogre face off, arms twitching on their rods on the beats |
| 0 | the pelican crosses in (downbeat) — still riding normally |
| 1.0 → 5.0 | it becomes a PUPPET: rendered as perforated, gilded leather; a central rod (gapit) visible running down into the trunk and two thin arm rods to the wings; the wheels rotate in **jerky steps** (pose quantised to 8 fps), the whole puppet bobs on the beats as if hand-operated |
| 2.0 | DOWNBEAT: the gunungan swirls across the screen (the dalang's "scene change" gesture), sweeping in front of the pelican |
| 2.5 | the pelican puppet "dances": a jerky hop on each half-beat, wing-rods waving |
| 3.0 | the knight and the ogre both turn (flipped puppets) to face the pelican; the ogre's jaw drops |
| 4.0 | DOWNBEAT: the gunungan sweeps back; the pelican rides on |
| 4.5 → 5.0 | the puppet look fades back to the riding rig (keep everything present at u ≥ 5) |
| 6 → 13 | knight and ogre still facing right, then slowly turning back to each other |

## The pelican in this style
Inside (1, 5): a leather puppet — gilded body with red/black/white painted feather patterning, perforation dots and
crescents, a stylised wayang eye (almond, white with black), bill in gold with a black outline, legs red; the bicycle
as a perforated leather cut-out with gold wheels (8 spokes, `mods.spokes = 8` everywhere is fine). Rods in dark horn
colour. Quantise the pose: use `ctx.riderAt(quantisedT)` (8 fps) for the puppet drawing inside (1.2, 4.8) only.
Outside (1, 5): the normal rig painted in the same gold/red palette (no rods, no quantisation).

## Title inside the artwork
Perforated into a small leather plaque hanging from the top border (as if a puppet tab): 「爪哇皮影戏」 with
「约公元一八〇〇年」 below, the letters cut out so the lamp light shines through; "Wayang Kulit · c. 1800" smaller.

## Palette
screen #f3e3c2 (lit) / #b89a68 (edges) · leather gold #c99a3a · red #a8322a · black #1a1410 · white #efe6d4 ·
horn rod #4a3424 · lamp glow #ffcf7a

## Hooks
- `ride: { hold: [2.2, 3.7], speed: 0.4, ramp: 0.3 }`
- `mods(u)`: inside (1, 5) only; e.g. `bob` exaggerated.
- `freezeU: 2.6`
- `cues`: becomePuppet 1.0, gununganSweep 2.0, dance 2.5, ogreJaw 3.0, sweepBack 4.0

## Watch out for
- Perforation must read at 1080p (holes ≥ 3 px) — bake it.
- The jerky motion only inside (1, 5); at the seams it must be the smooth rig.
