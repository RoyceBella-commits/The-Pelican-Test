# 17 chat — 早期聊天窗口 · 2000 年代   (film t = 101–107 s; visible ≈ t 94 … 114)

**Read `briefs/STYLE.md` first — it is part of this brief.** File: `src/scenes/17-chat.js`.
Left neighbour: 16 the 8-bit pixel platformer (hard pixels, 16 colours) — keep the GIF clearly a *dithered photo-like GIF*, not another pixel-art game. Right neighbour: 18 vaporwave (pastel neon).

## Should look like
An early-2000s desktop instant-messenger conversation window — **a fictional app, fictional OS look**: glossy
gradient title bar, bevelled buttons, a buddy avatar, a contact name with a status dot, a toolbar of emoticons and a
"nudge" button, the chat log with timestamps, a two-line input box with a "发送(S)" button. Low-fi rendering:
ClearType-ish small fonts, 16-bit-colour gradients, slight JPEG/dither noise. Everything original — no real app name,
logo, mascot, icon set or sound.

## Picture
- The window fills the panel (a soft desktop wallpaper gradient peeks out around it). Title bar text: the panel's
  title (see below). Left: the conversation. Right column: two buddy avatar frames (the friend: a cartoon pelican
  avatar you design; me: a generic flower avatar).
- **The road** is the bottom input box's text baseline: the rider line y = 800 runs along the input area (flat at both
  edges — the window's input box spans the panel width).
- Chat log content before the gag (pure function of u): `鹈鹕骑士 21:03 在吗？` / `我 21:03 在` / `鹈鹕骑士 21:04 给你看个东西` …

## The gag (beat table) — "发来一张鹈鹕骑车动图 · 低帧数 256 色抖动 · 强拍窗口抖动 · 对方正在输入…"
| u | what happens |
|---|---|
| −7 … 0 | the window idles; the status bar blinks "对方正在输入…" now and then |
| 0 | the pelican rides in along the input box (downbeat) — drawn in crisp UI-icon style |
| 1.0 → 1.5 | it rides into the input text, the cursor follows it — the user presses Send: it's **sent as an animated GIF** (`发送`) |
| 1.5 → 4.5 | the GIF appears as a big image message in the chat log: the pelican riding inside a small looping GIF frame — **low frame rate (8 fps), 256-colour palette, ordered-dither noise, a little GIF loading bar** first. The real rider is hidden while it lives in the GIF (its seam presence returns by u ≥ 5) |
| 2.0 | DOWNBEAT: **窗口抖动 (nudge!)** — the whole window shakes hard (offset jitter for ~0.3 s); "鹈鹕骑士 给你发送了一个窗口抖动。" |
| 2.5 / 3.0 / 3.5 | messages pop in on the beats with the app's own (original) message sound: 「？？？」「这是啥」「鹈鹕会骑车？？」 English mixed in: "lol" "brb" |
| 3.0 | top bar: 「对方正在输入…」 with animated dots |
| 4.0 | DOWNBEAT: another nudge; the GIF "pops" and the pelican rides back out onto the input baseline |
| 6 → 13 | the friend's last message: 「下次见 :)」; the GIF keeps looping in the log, smaller |

## The pelican in this style
Two looks: (1) on the input line — a crisp 32-px-icon-style vector pelican with a 1-px dark outline and glossy
gradients, the bicycle in bright blue; (2) inside the GIF — the same rider rasterised at very low resolution
(≈ 160×120 of the GIF box), quantised to a 256-colour palette with ordered (Bayer) dithering, nearest-neighbour upscaled,
pose sampled at 8 fps (`ctx.riderAt(quantisedT)`), with a looping 1-s cycle. Use a Canvas2D layer for the raster.

## Title inside the artwork
The window title bar: 「与 鹈鹕骑士 交谈中 — 早期聊天窗口 · 2000 年代」 and the app name in the window's corner
「鹈信 PeliMsg」 (fictional), plus "Early Chat Window · 2000s" in the About strip under the toolbar.

## Palette
title bar #2f6fd6 → #8fb8f2 · window #eef3fb · bevel #c7d3e6 · text #1a1a1a · link blue #1b4fc4 · status green #3fbf3f ·
nudge red #e0453a · desktop wallpaper #5c9be0 → #aee1ff

## Hooks
- `ride: { hold: [2.2, 3.6], speed: 0.4, ramp: 0.3 }`
- `freezeU: 2.6` (GIF in the log + nudge)
- `cues`: send 1.0, gifPop 1.5, nudge 2.0, msg 2.5, msg 3.0, msg 3.5, nudge 4.0, gifOut 4.0 — the composer uses the
  message pings as percussion, so keep them on beats.

## Watch out for
- While the rider lives in the GIF, hide the normal rider only inside (1.2, 4.8); at the seams it must be the normal rig.
- Window shake = translate the whole window content; frames of the film's outer frame stay still.
- Original UI only; text legible ≥ 22 px.
