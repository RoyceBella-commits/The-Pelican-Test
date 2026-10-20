# 20 code — notes (代码美学 / Code Aesthetics · 2020s · the LLM era)

## Picture
A fictional dark editor fills the panel. Title bar 「pelican.svg — 代码美学 · 2020 年代 · 大模型时代」 (PingFang 27 u ≈ 26 px),
tabs `pelican.svg` / `prompt.md` / `预览 pelican.svg`, gutter with line numbers and green "added" markers, a terminal
(`agent --prompt prompt.md`: 思考中 spinner → 正在写入 n/54 行 + tok/s → ✓ 已写入 · 54 行 · 5.4 KB, computed from the real file) and a status bar.
Code pane 0–550 (Menlo 23 u ≈ 22.3 px, no-wrap like a real editor: long rows run past the pane edge);
preview 550–1000 on a soft grey canvas. Road at y = 800: the terminal header strip (left), the SVG `road` (right).

`pelican.svg` is REAL (valid XML, 54 rows, checked by rendering it in Chrome: identical to the preview). It is generated
from the rest pose: viewBox 0 0 450 450, integers, Catmull-Rom → `C/S` paths, circles, ellipses, `<use>`, a
`<g id="plumage">` + `<use stroke="none">` union outline, gradients and `feGaussianBlur`/`feDropShadow` filters in `<defs>`
at the end. The header comment is the title (zh/en, era, the prompt).

## Gag (u)
| u | beat |
|---|---|
| −7…0 | idle: header comment, blinking cursor (on the beat), 思考中 spinner, empty preview |
| 0 | crisp dark-theme vector pelican crosses the seam on the terminal strip |
| 0.5–1.0 | `<svg viewBox…>` streams in |
| 1.0–1.5 | rider dissolves into a dashed wireframe; `road` is typed and drawn at 1.5 |
| 1.5–4.0 | token bursts end on every 8th: far leg, wheels (2.0), rims+frame, steering, drive, near leg, body (3.0), neck/head + `<use>` (outlines thin), wing/quills, pouch/bill, eye; each element's stroke grows (orange pen) as its row streams, then its fill fades in; typewriter scroll keeps the active row above the rider; the palette flips from dark to light at the pane split |
| 4.0 | `<defs>` + `</svg>`: full render (gradients, soft shadow, pouch gloss); rider brakes |
| 4.1–4.7 | editor relaxes to show the last 23 rows |
| 4.5 | toast 「✓ 渲染完成 · rendered in 0.6 s」 |
| 5.0 | rider rests at x 757 (near pedal back); 5.0–6.0 still, cursor blinks |

Cues: thinking −3 · streamStart 0.5 · dissolve 1.0 · tick 1.5/2.0/2.5/3.0/3.5 · complete 4.0 · toast 4.5 · rest 5.0.

## Ride / camera
`ride: { stopAt: 500 }` (the film camera settles on the panel centre, so the outro starts from a balanced frame; no
camera override). `path()` is the default for u ≤ 1; then the drawn rider keeps cruising to 4.0 and brakes over one
second to x = 757. The pose is rebuilt from the drawn distance, so the pedalling matches.

## Numbers
0 brush marks; ≈ 6–30 ms per still (solo/film), 0 bakes; live canvases 1100² + 520×460 (≈ 5.8 MB).
`check.mjs --quick` passes; seams verified; determinism spot-checked (pixel-identical).

## Reusable helpers
`crSegs` (Catmull-Rom → exact `C`/`S` with symmetric rounding), `sample` + `strokePartial` (stroke the first p of any
path), the full-panel screen-resolution Canvas2D pattern (pixel-aligned blit), `tokenize` (tiny XML highlighter).
