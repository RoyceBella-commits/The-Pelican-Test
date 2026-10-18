# Third-party notices

## Libraries (installed via npm, not modified)

- **p5.js** 2.3.4 — LGPL-2.1 — https://p5js.org — loaded unmodified from `node_modules/p5/lib/p5.min.js`.
- **p5.brush** 2.2.3 — MIT — https://github.com/acamposuribe/p5.brush
  Copyright (c) 2023-2026 Alejandro Campos Uribe. Its ES-module source is imported unmodified from
  `node_modules/p5.brush/src/`; the full MIT license text is in `node_modules/p5.brush/LICENSE.md`.
- **simplex-noise** (dependency of p5.brush) — MIT — Copyright (c) 2018 Jonas Wagner.
- **puppeteer-core** 25.14.0 — Apache-2.0 — used only by the render tools.

## Tools (not distributed)

- **FFmpeg** — LGPL/GPL — used to encode video; not bundled.
- **Google Chrome** — used headless for frame capture; not bundled.

## Fonts

macOS system fonts (Songti SC, Kaiti SC, Libian SC, Baskerville, Bodoni 72, Menlo, PingFang SC, …) are used only
to render text into frames. They are not included in this project.

## Inspiration

The working method (shared drawing kit + one file per panel + pure `renderAt(t)` + Puppeteer frame capture +
contact sheets) was learned from **meme67-art-history** by Tunai-0511 (code MIT, media all rights reserved):
https://github.com/Tunai-0511/meme67-art-history. No code, media, art briefs, compositions or jokes from that
project are used here. If any snippet is ever reused, its MIT notice must be added to this file:

> MIT License — Copyright (c) 2026 Tunai-0511

## Homage

The panels are original procedural re-imaginings in the *style* of historical art and media. All historical works
referenced (Tassili rock art, Egyptian tomb painting, Han reliefs, Fan Kuan, Zhang Zeduan, Bada Shanren, Hiroshige,
Muybridge, Van Gogh, Munch, Méliès, *Nosferatu*, …) are in the public domain. The chat app and short-video app
shown in the film are fictional; no real logos, mascots, icons, album covers or notification sounds are used.
