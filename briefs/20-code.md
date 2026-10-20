# 20 code — 代码美学 · 2020 年代 · 大模型时代   (film t = 119–125 s, then the outro; visible ≈ t 112 … 125+)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/20-code.js`.
Left neighbour: 19 vertical short video (the screen returns to 16:9 at u = 0). Right: nothing — this is the end of
the road; at u = 6 the outro pulls the camera back and the scroll folds into a 7×3 wall whose 21st cell is an empty
press-conference seat; the film ends close on that seat with your frozen panel (u = 5.5) as its left neighbour.
**This is the film's finest answer.**

## The idea
The meme behind the whole film: people ask large language models to "generate an SVG of a pelican riding a bicycle".
Here the answer is written live: a clean dark code editor, an SVG file typed line by line on the left, and on the
right its preview — the pelican on its bicycle **drawn stroke by stroke as the code appears**, ending as the most
refined, elegant pelican of the film.

## Picture
- A clean, modern, fictional dark editor (no real editor branding): a tab bar with `pelican.svg`, line numbers, a
  minimal syntax-highlighting theme, a thin status bar; layout: code pane on the left ~45%, preview pane on the right
  ~55% with a subtle checkerboard-free soft grey canvas.
- **The road**: the preview's ground line and the status bar together give a rider line at y = 800 across the whole
  panel (flat at the left edge; this panel has no right seam).
- The code is REAL SVG that matches the drawing: generate it from the rig — `<circle>` for the wheels with the actual
  radius, `<line>`s for the frame tubes, `<path d="M … C …">` for body/neck/pouch from the rig outlines (rounded to
  integers), grouped with comments. Typed at a steady rate with a blinking cursor; the preview draws each element as
  its line completes (stroke animating along its path, then fill fading in).
- Typography: "Menlo" for code; UI text in "PingFang SC".

## The ride (last panel — the rider stops)
The manifest already gives this panel `ride: { stopAt: 500 }` (the rider decelerates in bar 2 and rests at the panel's
centre from u ≈ 4). You may change `stopAt` (e.g. to the preview's centre, ≈ 700) — then also check the camera: the
film camera follows the rider, and the outro starts from the camera position at u = 6.

## The gag (beat table)
| u | what happens |
|---|---|
| −7 … 0 | the editor idles: an empty `pelican.svg` with a header comment, cursor blinking |
| 0 | the rider crosses in from the vertical video (downbeat) — a crisp vector pelican on the status-bar baseline |
| 0.5 → 1.0 | it rides toward the preview pane; the code starts typing at the top: `<svg viewBox=…>` |
| 1.0 → 1.5 | entering the preview, its parts "dissolve" into dashed outlines (wireframe of the rig) |
| 1.5 → 4.0 | line by line, on the beats: wheels, frame, legs, body, neck, head, bill, pouch… each element strokes itself in over its line; the rig keeps pedalling inside the growing drawing; the rider decelerates to rest |
| 4.0 | DOWNBEAT: the last line `</svg>` — the drawing completes: gradients, soft shadow, highlight on the pouch, a perfect white pelican on a clean bicycle (the most polished rendering in the film) |
| 4.5 | a small toast slides in: 「✓ 渲染完成 · rendered in 0.6 s」 |
| 5.0 → 6.0 | still frame of the masterpiece; the cursor blinks; the camera is locked on this panel |

## The pelican in this style
Final state: a precise, beautiful flat-vector illustration — clean geometric curves, subtle linear gradients (white to
pale blue-grey on the body, peach to orange on the pouch), crisp 2-px outlines in a deep slate, a soft drop shadow, a
sleek bicycle in charcoal with a single accent colour, tidy spoked wheels. Before u ≈ 1: the same style already (so the
seam with the short-video panel is clean). The "being written" state lives inside (1, 4).

## Title inside the artwork
A header comment at the top of `pelican.svg`:
```
<!-- 代码美学 · 2020 年代 · 大模型时代 -->
<!-- Code Aesthetics · 2020s · the LLM era -->
<!-- prompt: "Generate an SVG of a pelican riding a bicycle" -->
```
and the window tab `pelican.svg`.

## Palette
editor bg #14171f · gutter #1b1f2a · line numbers #4b5263 · text #d7dae0 · keyword #c792ea · string #c3e88d ·
number #f78c6c · comment #697098 · preview bg #e9ebef · slate outline #2b3242 · accent #ff8a3d

## Hooks
- `ride`: keep `{ stopAt: … }` (see above).
- `camera(u, cam)`: optional: identity until 0.5; you may settle the camera on the panel centre during bar 3 (the outro
  starts from there).
- `freezeU: 5.5` (the finished drawing — this is what hangs in the outro wall)
- `cues`: typing ticks on every beat 1.5 → 4.0, complete 4.0, toast 4.5

## Watch out for
- The SVG text must be legible (≥ 22 px), correct, and match the drawing.
- Live typing + stroking is cheap native drawing; use p5.brush only if it adds quality (this panel should look *digital*).
