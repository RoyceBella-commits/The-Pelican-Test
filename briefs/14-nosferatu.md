# 14 nosferatu — 诺斯费拉图 · 1922   (film t = 83–89 s; visible ≈ t 76 … 96)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/14-nosferatu.js`.
Left neighbour: 13 The Scream (orange/blue waves). Right neighbour: 15 the oscilloscope (green phosphor lines on black) —
**the two panels share a transition on the crossing downbeat, see "Exit: the shadow powers on" below.**

## Should look like
F. W. Murnau's *Nosferatu* (1922, public domain) and German Expressionist cinema: a tinted black-and-white frame
(night scenes tinted deep blue, interiors amber), hard theatrical light, long distorted shadows thrown across bare walls,
oppressive architecture, grain, flicker, scratches, 18 fps judder. Its most famous image — a shadow climbing a
staircase, a clawed hand reaching for a door — is our reference *idea*; the composition must be original and Count
Orlok himself does not appear. The star is a shadow.

## Picture
- **Set**: a tall bare plaster wall of an old house, a staircase rising diagonally from lower left to a door at the
  upper right, a heavy banister; a single lamp (off-frame, low right) throws everything's shadows big and long onto the
  wall. Floor at y = 800 (flat near edges): the rider rides along the hallway floor in front of the wall.
- **Tint**: amber for the hallway with a cold blue spill from a window at the left; strong vignette; grain, scratches,
  flicker quantised to 18 fps.
- Ambient: a curtain shadow sways; the lamp flickers on beats.

## The gag (beat table) — "楼梯墙上，自行车的影子缓缓爬上去"
| u | what happens |
|---|---|
| −7 … 0 | the empty stairwell; shadows of the banister quiver |
| 0 | the pelican crosses in (downbeat); its shadow is cast on the wall behind it, enormous and elongated |
| 1.0 | the shadow lags behind the pelican, then stops following it |
| 2.0 | DOWNBEAT: the shadow peels away and **climbs the staircase on its own**, slowly, step by step on the beats — the bicycle shadow's wheels rolling up the steps, the bill stretched into a long claw, the wing-shadow fingers grotesquely long |
| 3.0 | the shadow-claw (the bill) reaches for the door handle at the top |
| 3.4 | below, the pelican notices it has no shadow, turns back in fright (`lookBack`, `scared`) |
| 3.8 | the shadow slides back down the wall at speed |
| 4.0 | DOWNBEAT: the shadow snaps back under the pelican; it rides on, hurried |
| 5.0 → 6.0 | the lamp starts to buzz and flicker faster; the shadow on the wall is huge (the rider is close to the low lamp) |
| 6.0 | DOWNBEAT, crossing out: the shadow **powers on** — see below |
| 6 → 13 | a green afterimage of the shadow's outline fades on the wall; the door at the top creaks open by itself |

## Exit: the shadow powers on (shared with panel 15 — user requirement)
On the crossing downbeat (u = 6.0, film t = 89.0 — the oscilloscope panel's u = 0) the pelican's shadow on the wall is
"electrified" and becomes the oscilloscope's world:
- **u = 6.0 exactly**: the shadow's silhouette outline flares into a crisp phosphor-green trace — a thin bright core
  `#d8ffe4` inside a soft glow `#39ff7a` (additive) — while the dark shadow fill flashes and drops out. Short electric
  arcs crawl along the outline for ~0.25 s; the lamp flares white for one frame and dies to a dim glow.
- **u 6.0 → 6.15**: a spark runs along the floor line (y ≈ 800) from under the shadow to the right frame edge, reaching
  x = 1000 at u = 6.15 — panel 15 picks it up there as a bright pulse running along its trace.
- **u 6.0 → 8.0**: phosphor persistence: the green outline (frozen at its u = 6.0 shape) decays exponentially
  (τ ≈ 0.5 s, a slight green-yellow tint as it fades), leaving a faint ghost that is gone by u ≈ 8.
- Before u = 6.0 there is NO green anywhere in the panel; the effect never touches the rider itself (the seam contract
  holds: the rig is drawn normally, full frame rate, no judder outside (1, 5)).
- Build the outline from the same silhouette canvas as the shadow (edge detect / dilate-minus-erode on the small 2D
  canvas, or stroke the rig parts' contours), so it matches the shadow exactly.

## The pelican in this style
The pelican itself: a tinted greyscale figure with hard expressionist lighting (one side lit, the other in deep shadow),
thick shadow shapes. The shadow: draw the rig's silhouette (all `poly` parts filled + `line` parts thickened) in dark
translucent tint, transformed by a shear/stretch (long and tall, as from a low lamp) — and inside (2.0, 3.9) move it along
the staircase independently (use `ctx.riderAt` to keep its pedalling).

## Title inside the artwork
An intertitle card style: a framed title painted as if it were a plaque on the wall near the door, in a Gothic-looking
decorative lettering (try "Herculanum" or "Trattatello"): 「诺斯费拉图」 / "Nosferatu · 1922".

## Palette
amber tint #c08a3e → #2a1a0c · blue spill #3c5a86 → #0d1626 · plaster highlight #e6c88f · shadow #120b06

## Hooks
- `ride: { hold: [2.2, 3.7], speed: 0.45, ramp: 0.3 }`
- `mods(u)`: `lookBack`, `scared` inside (3.3, 3.95); neutral outside (1, 5).
- `freezeU: 3.0` (shadow at the door)
- `cues`: shadowLags 1.0, shadowClimbs 2.0 (+ each step on the beats), claw 3.0, noticed 3.4, snapBack 4.0, lampBuzz 5.0, powerOn 6.0

## Watch out for
- The shadow is the star: make it graphic, crisp-edged with a slight penumbra, and properly distorted by the stairs
  (it bends where it crosses each step).
- 18 fps film judder only inside (1, 5).
