# 15 moon — 月球旅行记 · 1902   (film t = 89–95 s; visible ≈ t 82 … 102)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/15-moon.js`.
Left neighbour: 14 The Scream (orange/blue waves). Right neighbour: 16 Nosferatu (tinted expressionist interior).

## Should look like
Georges Méliès' *A Trip to the Moon* (1902, public domain) — a frame of an early trick film: painted theatrical
flats in greyscale (stage backdrops with painted perspective, cardboard stars with faces, cut-out clouds), actors in
costume, **hand-tinting** in transparent colours (the 1902 coloured version) that wobbles slightly outside the lines,
film grain, flicker, dust and scratches, a soft vignette, 16–18 fps judder. Plus the famous image — a capsule stuck in
the eye of the Man in the Moon. Original composition (our moon face is our own design).

## Picture
- **The set**: a painted night sky backdrop with cut-out stars (some with tiny faces) and a large Moon face hanging
  above the stage centre-right (cratered, round cheeks, a placid expression). Clouds as flat cut-outs on wires.
  A rooftop/observatory flat at the left with a little launch ramp painted in perspective.
- **The road**: the stage floor boards at y = 800 (flat near edges), with footlights along the very bottom.
- Film treatment over the whole panel: greyscale + hand-tint washes (pale blue sky, yellow moon, pink faces), grain,
  1–2 vertical scratches, dust specks, gate weave (tiny frame jitter), flicker — all pure functions of u
  (quantise the "film time" to 16 fps for weave/flicker).

## The gag (beat table) — "连人带车扎进月亮"
| u | what happens |
|---|---|
| −7 … 0 | the Moon face idles (blinks on downbeats); stars twinkle |
| 0 | the pelican crosses in on the stage floor (downbeat) |
| 1.0 → 2.0 | it hits the launch ramp and flies up in a stagey parabola toward the Moon (path inside (1, 5)), pedalling in mid-air; the motion judders at 16 fps |
| 2.0 | DOWNBEAT: SPLAT — bicycle and pelican plunge into the Moon's right eye; the Moon grimaces, cream-like custard splashes out |
| 2.5–3.5 | the Moon crosses its eyes, cheeks puffed; the pelican's legs wiggle from the eye socket; a cardboard star giggles |
| 3.5 | the Moon sneezes — the pelican pops out and drops (a stagey fall with a spin) |
| 4.0 | DOWNBEAT: it lands on the stage floor with a bounce, still pedalling (path back to the road by u = 4.6) |
| 6 → 13 | the Moon wipes its eye; a bandage appears on it |

## The pelican in this style
A greyscale "costumed actor": the pelican with flat painted-costume shading (greys), then hand-tinted: a pale yellow
pouch, faint pink legs, the bicycle in grey with a hand-tinted red frame that bleeds over the lines; film grain and
judder apply to it as well inside (1, 5). At the seams: the same look without the 16 fps judder.

## Title inside the artwork
A painted stage banner/proscenium sign across the top of the set: 「月球旅行记」 and "A Trip to the Moon · 1902" in
ornate Belle-Époque lettering ("Didot"/"Bodoni 72" with flourishes), as if part of the painted flats.

## Palette
greys #f2efe6 → #1c1b19 · tint blue #9fb7cf · tint yellow #e9cf7a · tint pink #e4a39a · tint red #c4553f

## Hooks
- `ride: { hold: [2.0, 3.6], speed: 0.2, ramp: 0.3 }`
- `path(u, base)`: inside (1, 4.6) the flight: up the ramp, parabola into the eye (stuck there 2.0–3.5 — x stays, the
  ride profile's slow-down helps), fall, bounce; `rot` for the spin. Default outside (1, 5).
- `camera(u, cam)`: optional small push toward the Moon in (1.5, 4.0), identity at the seams.
- `freezeU: 2.8` (stuck in the eye)
- `cues`: ramp 1.0, splat 2.0, starGiggle 2.5, sneeze 3.5, land 4.0

## Watch out for
- Hand-tint must look applied by hand (offset, blotchy edges), not like digital colouring.
- 16 fps judder only inside (1, 5).
