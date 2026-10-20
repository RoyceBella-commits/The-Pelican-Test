# 17 chat — notes (早期聊天窗口 / Early Chat Window · 2000s)

## Picture
A conversation window of the fictional messenger 「鹈信 PeliMsg」 on a fictional early-2000s desktop (soft blue
wallpaper with light swooshes peeking around it). Everything is original:
- **Title bar.** Glossy title bar with 16-bit banding. It reads 「与 鹈鹕骑士 交谈中 — 早期聊天窗口 · 2000 年代」 (this is the panel title). The caption buttons are original.
- **Menu bar.** 文件(F)…帮助(H), with the accelerator letters underlined.
- **Toolbar.** Seven original glossy icons: 邀请, 发送文件, 视频 (a webcam ball), 语音, 涂鸦, 游戏, 屏蔽. The brand corner holds the 「鹈信 PeliMsg」 logo (a sky-blue speech bubble with a white pelican head).
- **Contact strip.** 收件人, status dot, 鹈鹕骑士 (在线), personal message 「骑行中，勿扰」, and "Early Chat Window · 2000s".
- **Chat log.** Timestamped log with a bevelled scrollbar.
- **Right column.** The friend's avatar (a cartoon pelican in a blue cycling helmet), an animated two-frame banner ad (鹈鹕牌自行车 ↔ 免费试骑！) and my avatar (a pink gerbera photo).
- **Format bar and input.** 字体 / 表情 / 窗口抖动 / 图片 / 声音 / 消息记录, then a two-line input box whose first baseline is the road (y = 800).
- **Bottom.** 关闭(C) and 发送(S) buttons, and a status bar.

The UI is designed on a virtual screen at 2 units per pixel and painted at that true low resolution with
Canvas2D. Every raster is then quantised to RGB565 (16-bit banding) and pixel-doubled with nearest into its layer, so
it draws at about 1:1. The result reads as a zoomed 2000s screenshot without nearest-filter crawl during camera pans.
Text is 12 px on the virtual screen (24 units, about 23 px on screen); the title is 14 px.

## Pelican
- **On the input line.** A glossy UI-icon rider: navy outline, white plumage with a specular sheen, orange gloss pouch, a bright-blue bike with highlight stripes and chrome parts. It is repainted every frame at 1 px per virtual pixel on the UI's pixel grid.
- **In the GIF.** The same rig, shaded like a photo with no outlines, over a park-road scene (sky, clouds, hills, a tree row, a dashed road). It is a 160×120 GIF and loops over 1 s:
  - 8 frames; the crank does one revolution per loop, the wheel turns π with 6 spokes, and the background scrolls by exactly one period;
  - grain is added, then each frame is quantised to the 216-colour web cube with 8×8 Bayer ordered dither;
  - it is shown with NEAREST at 2.062 units per GIF pixel, which is exactly 2 screen px.

  It loads interlaced (8/4/2/1-row passes), and a version without the rider plays after the pelican escapes. A 96×72 copy comes back as a sticker.

## Cue table
| u | event |
|---|---|
| −7…0 | Idle. The caret blinks on the beat. 「鹈鹕骑士 正在输入消息…」 shows in the status bar at −6.2…−4.6 and −3.1…−1.7. The ad flips every second |
| −0.7…1.0 | The rider shoves my unsent 「等等，你先看我这个：」 ahead of its front wheel and the caret follows. The pointer travels to 发送(S) (0.3–0.9) |
| 1.0 | **send.** The button is pressed and the input clears. My line lands in the log (yellow line flash) with a 「正在发送图片…」 placeholder and a block progress bar. The rider is sucked into the slot (1.0–1.2) and is hidden until 4.0 |
| 1.5 | **gifPop.** The interlaced GIF appears (passes at 1.5 / 1.5625 / 1.625 / 1.6875) and plays at 8 fps from 1.75 |
| 2.0 | **nudge.** The window jitters for 0.42 s (whole-vpx jolts, a new one every film frame, up to 28 units). A red system line appears and the 窗口抖动 button flashes |
| 2.5 / 3.0 / 3.5 | **msg** 「???」「这是啥」「鹈鹕会骑车??」. Each line flashes and the friend's avatar glows. 「对方正在输入…」 shows in the top strip at 2.7–3.5 |
| 4.0 | **nudge + gifOut.** The GIF pops (scale bounce, sparkles) and the rider leaps out (4.0–4.55, scale 0.557 → 1). The GIF is now an empty road. A landing bounce and impact marks run 4.55–4.75 |
| 4.5 / 5.0 | 「lol」「brb 我也去买辆车」 |
| 6.5 | 「下次见 :)」 (the :) renders as an emoticon) with the small GIF sticker looping |
| 9.0 | Status changes to 离开 |

Hooks: `ride {hold:[2.2,3.6], speed:0.4, ramp:0.3}` (lost 0.66 s), `freezeU 2.6`. `path`/`mods` act only in (1, 1.2) and (4, 4.71).

## Numbers
- 0 live brush marks (Canvas2D plus native p5). The panel's own draw takes about 1–9 ms. The slowest film still is 304 ms (u −0.5, including neighbour warm-up).
- No `K.bake` framebuffers. `K.layer` images total about 10 MB: window 980² 3.8 MB, document 2.9 MB, wallpaper 1 MB, 27 GIF frames, sprites.
- `check.mjs --quick` passes. A determinism spot-check (same frames rendered in two orders) is identical.

## Reusable helpers (in the scene file)
- `loLayer`: lo-fi raster, then RGB565, then pixel-doubled into a `K.layer`.
- `ditherFrame`: 216-colour Bayer GIF quantiser.
- `nearestImage`.
- `imageClip` / `rectClip`: cropped draws for scrolling viewports.
- The interlaced-GIF pass builder.
