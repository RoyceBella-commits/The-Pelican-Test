# 15 scope — 示波器矢量图 · 1950 年代   (film t = 89–95 s; visible ≈ t 82 … 102)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/15-scope.js`.
Left neighbour: 14 Nosferatu (amber/blue tinted silent-film stairwell) — **the two panels share a transition on the
crossing downbeat, see "Entry: power on" below.** Right neighbour: 16 the 8-bit pixel platformer (bright limited palette).

## Should look like
1950s electronic graphics on a cathode-ray tube: a laboratory oscilloscope or early vector display photographed in a dark
room — a round green phosphor screen (P1/P7 phosphor) on black, figures made only of glowing lines (no fills), a faint
engraved graticule on the faceplate, beam bloom, afterglow trails, slight sweep jitter, brighter dots where the beam
dwells. Early oscilloscope art and Lissajous figures are the language; no specific artwork or instrument is copied.

## Picture
- **The screen**: a big round CRT seen close up. It must contain the whole road line from x = 0 to 1000 and the rider's
  full height at both edges, so the circle is larger than the panel — e.g. centre (500, 520), radius 600: the panel's top
  and bottom edges crop the circle and the four corners show the instrument's black crinkle-paint bezel with a chrome
  ring around the glass. Any layout that keeps the road and the rider on the glass at both edges is fine.
- **Glass**: deep green-black, a faint curved reflection (a soft highlight arc), a little dust; the graticule as thin dim
  lines (10 × 8 divisions with minor ticks on the centre axes), drawn as if engraved — not glowing.
- **The road** is the trace: a horizontal sweep line at y = 800 across the screen (flat near both edges).
- **Corners (bezel)**: silkscreened knobs and labels in cream paint — 辉度 INTENSITY, 聚焦 FOCUS, X 增益 / Y 增益,
  扫描 SWEEP, and a mode knob 模式 Y-T / X-Y. A fictional maker's plate (an invented brand, e.g. "PELICATRON · TYPE 51").
- Ambient for the whole window: the beam's sweep runs along the trace once per beat (a brighter travelling spot), tiny
  60 Hz jitter, a faint mains-hum ripple on the trace.

## Entry: power on (shared with panel 14 — user requirement)
Panel 14 ends with the pelican's wall shadow "electrified" into a green phosphor outline on the crossing downbeat
(film t = 89.0 = your u = 0), and a spark runs along its floor to your left frame edge, arriving at u ≈ 0.15.
- **u < 0: standby.** The instrument is warming up: everything at ~30 % brightness, slightly defocused (wider, softer
  glow, weaker core), the trace dim, the sweep spot slow. The rider's front half that enters before u = 0 is drawn
  (fully, every part) at this standby brightness.
- **u = 0.0 exactly: POWER ON.** Brightness snaps to 100 % with a bloom flash that decays over ~0.3 s; focus sharpens.
- **u 0.15 → 0.6**: the spark from panel 14 continues as a bright pulse running along the trace from x = 0 to the right,
  with a small damped ringing of the trace behind it.
- Colours shared with panel 14: core `#d8ffe4`, glow `#39ff7a`, persistence tail `#9be86a` (P7-like green-yellow).

## Cast
- A hand (a 1950s engineer's: white shirt cuff, a wristwatch) that rests near the bottom-right knob, lit only by the
  green spill of the screen — dark, photographic, low contrast. It is the one non-glowing figure.

## The gag (beat table) — "转错旋钮：鹈鹕扭成一团李萨如图形"
| u | what happens |
|---|---|
| −7 … 0 | standby (see above): dim trace, slow sweep spot; the hand idles near the knobs |
| 0 | DOWNBEAT: power on + the pelican crosses in, drawn by the beam |
| 1.5 | the hand reaches for the FOCUS knob… and grabs the wrong one (the X-Y mode knob) |
| 2.0 | DOWNBEAT: the knob clicks to X-Y — **the pelican instantly twists into a Lissajous figure** (a 3:2 knot centred where the rider is, moving with it), its phase rotating through the beat; the trace flares |
| 2.5 | next beat: it **springs back** into the pelican, with a damped overshoot (a little wobble of the outline until ~3.0) |
| 3.0 | the hand turns the knob back, sheepish; a small spike runs along the trace |
| 4.0 | DOWNBEAT: riding on |
| 6 → 13 | the rider's afterglow fades off the right edge; the trace sweeps on; the hand withdraws |

**The Lissajous morph**: sample the rig's outline (all line/poly contours concatenated) into N points with a normalised
parameter θ ∈ [0, 1); map each to `x = cx + Ax·sin(2π·3θ + φ)`, `y = cy + Ay·sin(2π·2θ)` with (cx, cy, Ax, Ay) taken
from the rider's bounding box and φ = 2π·(u − 2)·1.5; blend from the pelican to the figure in ~2 frames at u = 2.0, and back at
u = 2.5 with a spring (overshoot ≈ 15 %, settled by 3.0). The composer will warp the sine tones' pitch with the
same 3:2 ratio (`cues` below), so keep these timings exact.

## The pelican in this style
Pure vector outlines drawn by the beam: every rig part as a glowing stroke (contours of polys, lines as lines), no fills;
a thin bright core inside a soft wide glow (additive blending), brighter dots at stroke ends and corners (beam dwell),
the wheels as glowing circles with ≤ 8 spokes. Afterglow: draw a few earlier poses (`ctx.riderAt(ctx.t − k·dt)`) with
decaying intensity in the persistence colour — keep tails ≤ 80 ms in u ∈ [−1, 1] ∪ [5, 7] and up to ~0.4 s inside (1, 5).

## Title inside the artwork
Silkscreened on the bezel in cream paint, like an instrument's front-panel lettering: 「示波器矢量图」 and
"OSCILLOSCOPE VECTOR GRAPHICS · 1950s" in a top corner (≥ 26 px on screen), plus the fictional maker's plate.
(Optionally the beam can also write "1950s" as vector text on the screen during standby.)

## Palette
glass #04100a · graticule #1e3a2a · core #d8ffe4 · glow #39ff7a · persistence #9be86a · bezel #141414 · silkscreen #e8dfc8 · chrome #8a8f94

## Hooks
- `ride: { hold: [2.0, 2.6], speed: 0.5, ramp: 0.2 }` (optional; adjust if it reads better)
- `mods(u)`: neutral at the seams; the Lissajous is your own drawing of the outline, not a rig modifier.
- `freezeU: 2.2` (the Lissajous knot)
- `cues`: powerOn 0.0, reachKnob 1.5, knob 2.0, snapBack 2.5, knobBack 3.0

## Watch out for
- Glow cheaply: native p5 lines with `blendMode(ADD)` in two or three passes (wide/dim → thin/bright) are far cheaper
  than Canvas2D blur per frame; bake the bezel, glass and graticule once.
- Panel 14's green flash happens on the same downbeat: check `node tools/shot.mjs --seam scope` and a still at film
  t = 89.0 with `--scene scope --u 0` once panel 14 exists (it is being built at the same time; it may still be a placeholder).
- No real instrument brand, logo or model name.
