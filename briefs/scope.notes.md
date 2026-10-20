# 15 scope — notes (示波器矢量图 / Oscilloscope Vector Graphics · 1950s)

## Picture
A close-up photograph of a big round P7 CRT in a dark lab. The tube face is centred at (500, 600) with a glass radius
of 550, so the road at both frame edges sits 12 units inside the glass. Around the glass are a polished chrome trim
ring (550–567) and a moulded black bezel lip (567–580), set into a black crinkle-paint panel that shows in the corners.
The glass is deep green-black with an engraved 10 × 8 graticule (84-unit divisions, minor ticks on the centre axes),
phosphor grain, dust and a fibre. A soft reflection arc sits on top of the picture. The only light is the screen's
green spill: raking light across the crinkle paint, the glass mirrored in the chrome's inner flank, green silkscreen,
and green rims on the knobs and hand. A faint lens vignette sits over everything.

- **Title**: cream silkscreen at top left: 「示波器矢量图」 (30 u), "OSCILLOSCOPE · VECTOR GRAPHICS", "1950 年代 · 1950s".
  It is worn a little, and the screen tints it green once powered.
- **Hardware**: 辉度 INTENSITY knob (top left); 聚焦 FOCUS knob and a chicken-head 模式 MODE switch with Y-T / X-Y
  detents (top right); a brushed-aluminium **PELICATRON · TYPE 51** plate; a 电源 POWER jewel lamp; cropped knobs in
  the bottom corners.
- **Hand**: an engineer's right hand with a white cuff and a wristwatch whose radium dial glows and whose second hand
  ticks with film time. It is a soft, dark silhouette rim-lit by the screen. The forearm always comes in from an
  off-panel elbow at the lower right, so it stays above the rider's path (y < 440).
- **Pelican**: beam vectors. Every rig part is drawn as a contour, with no fills and 8 spokes (`mods`). Each vector
  gets three passes: a wide glow, a glow, then a hot core (#d8ffe4 / #39ff7a). Short vectors are brighter (beam speed),
  and dwell dots mark stroke ends and sharp corners. There is 60 Hz jitter per frame. Persistence tails in #9be86a come
  from `ctx.riderAt`: ≤ 80 ms near the seams, ≈ 0.18 s while riding inside (1, 5), and ≈ 0.4 s around the knot.

## Beat table (u)
| u | what |
|---|---|
| −7 … 0 | **standby**: beam at 30 % with a warming shimmer, defocused (wide soft glow, weak core); the sweep spot crosses once per 2 s; the beam writes "1950s"; the pilot lamp is dim; the hand idles and taps its index finger on every beat |
| **0.0** | **POWER ON**: brightness ×2.3 flash decaying with τ = 0.1 s (gone by ≈ 0.3), a faceplate haze flash, focus sharpening with τ = 0.07 s, the lamp at full, green spill on the instrument |
| 0.15 → 0.6 | the spark from panel 14 becomes a bright pulse running along the trace from x = 0 to x = 1000, with damped ringing behind it; "1950s" fades out (0.15 → 0.9) |
| 0 → | sweep spot once per beat |
| 1.3 → 1.76 | the hand reaches for FOCUS and hesitates just short of it |
| 1.76 → 1.93 | it slides over and pinches the MODE switch |
| 1.94 → **2.0** | the switch turns, clicking to X-Y exactly on 2.0; the trace flares and a small faceplate transient fires |
| **2.0 → 2.067** | the pelican twists into the 3:2 Lissajous knot (smoothstep over 2 frames); φ = 2π·(u−2)·1.5; long P7 afterglow |
| **2.5** | the pelican springs back by itself: a damped spring (ζ 0.517, ωn 18) with ≈ 15 % overshoot at 2.70, settled by 3.0; the hand flinches at 2.53 |
| 2.84 → **3.0** | the hand sheepishly turns the switch back to Y-T, clicking on 3.0; a small spike runs along the trace (3.0 → 3.42) |
| 3.3 → 3.7 | the hand finds the right knob (FOCUS) and nudges it |
| 4.2 | the hand is back at rest |
| 6 → 8.2 | the hand withdraws off the right edge; tails stay ≤ 80 ms |
| 7.6 → 8.9 | after the rider has gone, the beam re-writes "1950s" stroke by stroke with a moving pen dot |

Lissajous details: the outline is all rig vectors concatenated, resampled at ≤ 2.4 u spacing, with θ given by arclength.
The figure is x = cx + Ax·sin(2π·3θ + φ), y = cy + Ay·sin(2π·2θ), with (cx, cy, Ax, Ay) taken from the rider's
bounding box at that moment. The jumps between parts are unblanked in proportion to the blend, and each part's
brightness blends toward the knot's uniform brightness, so the switch back to per-part drawing is seamless.

Hooks: `ride {hold:[2.0,2.6], speed:0.5, ramp:0.2}`, `freezeU 2.2`; cues are powerOn 0, reachKnob 1.5, knob 2.0,
snapBack 2.5, knobBack 3.0. There is no camera override.

## Numbers
- Live p5.brush marks: **0**. Each frame makes Canvas2D path strokes: ≈ 250 while riding (57 vectors × 3 passes,
  2–5 tail copies, the trace), up to ≈ 800 around the knot (10 tail copies).
- Frame time 20–40 ms centred. The slowest still is ≈ 740 ms, the film-framing first frame that includes the
  neighbours' init. The solo first frame including init is ≈ 190 ms.
- Bakes: base 1600² + spill 1600² + refl 800² + small sprites ≈ 24 MB. Live canvases: beam 1100², two bloom levels,
  the hand canvas and three scratch canvases (≈ 12 MB, not bakes).
- `check.mjs --quick`: CHECK PASSED. I also checked determinism by rendering the same u in different orders, solo and
  in film framing: the PNGs are byte-identical.

## Deviations from the brief (on purpose)
- The circle is 550 at (500, 600), not 600 at (500, 520). That leaves usable corner pockets at the top, while the road
  still sits on glass at both edges and the rider's head clears the rim.
- The knobs and the hand are at the **upper right**, because the bottom pockets are too small for knobs or a hand.
  The forearm comes from the lower right and never crosses the rider's path.
- The 2.5 snap-back is the pelican's own doing; the hand turns the switch back at 3.0, "sheepish", as in the table.
- There are no legends on the cropped bottom-corner knobs (SWEEP, X/Y gain), because no legend fits there.
- "1950s" also comes back after the rider has gone (u ≥ 7.6), so the panel stays alive while 16 plays.

## Reusable helpers (in the scene file)
- **Beam renderer**: an opaque black Canvas2D with `'lighter'` compositing. Draw vectors in N passes, clear the
  **whole** canvas each frame (partial clears accumulate and break determinism), build bloom from 1/4 and 1/8 blurred
  mips, and add it all with `blendMode(ADD)`. This suits any glowing medium (neon, CRT, laser).
- **Rim-lit silhouette** (`paintHand`): mask → body gradient toward the light → blurred form strokes (`source-atop`) →
  rim = mask − mask shifted away from the light, blurred → a soft shadow clipped off emissive areas.
- **Per-pixel bezel** (`paintStatic`): crinkle paint as a ridged value-noise height field, with ambient plus green
  raking light from its gradient. Chrome is a reflected-ray profile (ψ across the bead) that reflects either the room
  light or the glowing screen.
