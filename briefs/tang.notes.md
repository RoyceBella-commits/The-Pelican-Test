# 04 tang — notes / report

## Built
Pale warm silk ground (own Canvas2D paper) with a cloud road: a scalloped top line at y = 800, a row of double-lined scroll curls, and drooping undersides. Four celestials walk right at 1.5–3 u/s. From the left they are a guardian with a bannered halberd (cropped by the frame, like a scroll fragment), a Daoist immortal with a halo, crown and feather fan, a heavenly lady with a tray of peonies, and an attendant child. The child is turned back toward the procession and points at the pelican. Three scroll clouds drift and are pushed along by the gust. Everything is ink line. Paper-coloured knock-out fills give occlusion.

Gag (u):
- −7…0: the procession glides, sashes, sleeves, hems and beards ripple, and the lady's long scarf floats behind her.
- 0.25–0.75: the child raises its arm and from then on tracks the pelican's head.
- 2.0 (downbeat): the gust (whip overshoot) blows everything left: hems, sleeves (rotating curtains), ties, beards, the banner. In my reading the gust comes from the front, not the back. That way the scarf can stream *behind* the pelican and match the rig's `wind`. Seven peony petals tear off the tray.
- 2.46–3.1: the scarf's back end sweeps across the pelican's neck and catches. The rest whips off the lady's shoulders. Both shapes are angle chains rooted at the knot, so the cloth keeps its length while it morphs.
- 2.8–4.0: a loop round the neck, a short end, and a long end rising in travelling S-loops into the open sky (freezeU 3.1). Eye goes 'wide' at 2.45–2.85.
- 4.02–4.8: the gust drops and the scarf lets go knot-first, floating back onto her shoulders.
- 5.5: the child spins round and keeps pointing after the pelican to u = 13. The petals stay where they landed on the road.

## Title
A three-column inscription in regular script (Kaiti), set character by character with jitter. The brush "dries" down each column, ink bleeds, and the edges are eroded with noise. Columns: 唐人白描 / 约公元七五〇年 / 吴带当风. Below it sits one red seal 「鹈鹕骑行」 with white-cut characters. Title glyphs ≈ 37 px and small glyphs ≈ 27 px on screen.

## Pelican
White bird = paper (a slightly lighter knock-out). Contours are split into overlapping press-and-lift strokes. It has scalloped coverts, a dark secondaries line, solid-ink primaries and nail, an iron-wire bicycle and hair-fine spokes. In the gust it gains streaming crest plumes, tail feathers and ruffles (only inside (1, 5)).

## Numbers
- Max live marks 361 (centred), 502 with Song in view.
- Frames take ≈ 35–55 ms solo and ≈ 70 ms in film framing.
- Init 0.62 s.
- Bakes 24.5 MB (bg 2048², 3 sky clouds, 2 layers per figure at 2.24 px/unit).
- `check.mjs --quick` passes. Seams were checked at u = 0 and 6: the bike halves line up.

## Reusable helpers (in the scene file)
- `ln()`: a stroke with a per-point pressure envelope (water-shield / iron-wire / gossamer / flick) over flat-profile custom brushes. Note: p5.brush draws nothing for a curved 2-point spline; `ln` subdivides those.
- `ribbonEdges` / `drawRibbon`: a flat sash with twist crossings, knock-out fill per twist segment, and visibility runs.
- `chain` / `sashChain`: hanging cloth as an integrated angle chain going from rest to gust.
- `swingRot`: sleeves swinging as curtains.
- `blow`: a drapery displacement field.
- `gustInt`: a tabulated integral that keeps flutter phase continuous.
