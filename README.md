# 鹈鹕测试 · The Pelican Test

> 人类自古以来就痴迷于画鹈鹕骑自行车。——早在自行车被发明之前。

A 2:17 procedural short film. A white pelican rides a bicycle along one continuous road through 20 framed panels,
from Saharan rock art to an LLM-era code editor. Every frame is drawn by JavaScript (p5.js + p5.brush) as a pure
function of time; music is synthesised with Web Audio.

Needs macOS, Google Chrome, Node 20+, ffmpeg.

## Run

```bash
npm install
npm run dev                       # http://127.0.0.1:5180/  preview page (live render / smooth draft playback)
```

## Tools

| command | what it does |
|---|---|
| `node tools/shot.mjs --t 5,11` | stills at film times (`--solo <id> --u 1,3`, `--scene <id>`, `--seam <id>`, `--debug`) |
| `node tools/sheet.mjs --film` | contact sheet, one frame per second (`--scene <id>`, `--solo <id>`) |
| `node tools/render.mjs [--draft]` | render all 4110 frames (6 Chrome workers; `--from/--to`, `--resume`) |
| `node tools/encode.mjs [--draft]` | frames (+ `audio/mix.wav`) → `out/*.mp4` |
| `node tools/check.mjs` | banned APIs, ride/seam contracts, crossing table, determinism |
| `node tools/audio.mjs` | render the score → `audio/mix.wav` (`--only bell` for sync checks) |
| `node tools/levels.mjs` | rebalance the eras' loudness → `audio/levels.json` |

Each tool run uses its own server port and Chrome profile, so several can run at once.

## Layout

```
src/beat/     timeline.js (timing + geometry, single source of truth) · ride.js (rider position, crank, wheels)
src/kit/      drawing kit K: brush wrapper + per-stroke seeding, bakes, text sprites, paper, frames, math
src/rig/      pelican.js (parametric puppet → named outlines) · pen.js (default pen-line drawing)
src/scenes/   index.js (manifest) + one file per panel
src/main/     app.js (p5 entry, renderAt) · film.js (compositor) · camera.js · intro.js · outro.js · press.js · ui.js
tools/        server, shot, sheet, render, encode, check, audio, levels
briefs/       art briefs for each panel
audio/        Web Audio score: theme, per-era arrangements, synthesised instruments, master bus
```

## Timeline

120 BPM, one bar = 2 s, 30 fps. Intro 0–5 s, panel *i* (1–20) starts at 5 + 6(i−1) s on a downbeat
(frame 150 + 180(i−1)), outro 125–137 s. 4110 frames.

Outro: the scroll folds into a 7×3 wall — the 20 panels plus an empty press-conference seat (「鹈鹕（本人）」).
「截至目前，人类共提交了 20 份答卷。」 · the camera pushes in through camera flashes · 「鹈鹕本人对此尚未发表评论。」 ·
the pelican streaks past behind the seat with one bell, and the film holds on the empty chair.

Final render: `node tools/render.mjs && node tools/audio.mjs && node tools/encode.mjs` → `out/pelican-test_1080p.mp4`.

See `THIRD_PARTY_NOTICES.md` for licenses.
