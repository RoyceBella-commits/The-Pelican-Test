# 16 nosferatu — 诺斯费拉图 · 1922   (film t = 95–101 s; visible ≈ t 88 … 108)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/16-nosferatu.js`.
Left neighbour: 15 A Trip to the Moon (greyscale + hand tint). Right neighbour: 17 the early chat window (bright UI).

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
| 6 → 13 | the door at the top creaks open by itself |

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
- `cues`: shadowLags 1.0, shadowClimbs 2.0 (+ each step on the beats), claw 3.0, noticed 3.4, snapBack 4.0

## Watch out for
- The shadow is the star: make it graphic, crisp-edged with a slight penumbra, and properly distorted by the stairs
  (it bends where it crosses each step).
- 18 fps film judder only inside (1, 5).
