# 11 ukiyoe — notes (浮世绘 / Ukiyo-e · 1830s)

Revision 2 follows the director's request and the user's reference, Hokusai's *Nakahara in Sagami Province*. It is an original arrangement in that style, not a copy.

## Picture
The print is on washi with kozo fibres, with bare-paper margins at top and bottom under black border rules (y 22 / 978).

**Sky and mountains:**
- A pale sky with a Prussian-blue bokashi at the top, and puffy blue-grey cloud bands at the left.
- A vast Mt Fuji, peak at (588, 40). It is a bare-paper snow cone with a thin key line, and its left flank sweeps down to the left edge. The upper slopes are deep Prussian blue flecked with snow; the snow is dense at the top, thins out lower down, and breaks into blue flecks at the edges.
- A dark wooded foothill beside Fuji, faint blue ranges behind it, and long dark bands of distant woods.

**Plain:** a wide pale-apricot plain rising out of a mist. It has cream mist bands, rows of dotted green scrub with hedges, a distant tree line and a tilled patch around the farmer.

**Stream:** in Prussian-blue bokashi. It runs behind the path on the right, passes under a plank bridge on posts, and flows out through the near ground to the lower left. There are grassy banks, a sandy bank on the right, and grasses that bend in the squall (live brush lines).

**Path:** pinkish beige, at y 800.

**Cast** (pose-state sprites; steps switch on beats):

| who | where | behaviour |
|---|---|---|
| woman with a child on her back | path, left, walking right | |
| porter with two baskets of greens on a shoulder pole | path, left, walking right | baskets sway, and swing in the wind |
| traveller in a kasa and straw cape | path, left, walking right | |
| two men with a chest on a pole | entering from the right | |
| farmer | out on the plain | hoeing |
| angler | sandy bank | rod over the stream |

## Gag
The u timings and cue names are unchanged.

| u | |
|---|---|
| 2.0 | **Shower.** Rain lines sweep in from the right and the sky goes grey. Fuji fades to a pale ghost behind the rain, and the mist bands dull. Travellers hunch with capes flapping; the woman shields the child. The porter hunches while the baskets swing. The chest-bearers look up, set the chest down and crouch. The farmer covers his head and the angler huddles. The grasses bend. |
| 2.45–3.3 | The pouch fills: a round sac with water showing through, water in the open bill, drips. The head tips under the weight. |
| 3.5 | **Gulp**, as the rider rolls onto the bridge: bill up, the sac drains, a lump travels down the neck. The angler looks up. A happy blink follows (3.84–4.2). |
| 4.0 | The rain's tail sweeps out to the left. Puddles stay. |
| 4–13 | Everyone looks up (4–5), then wrings out sleeves with drips (5–9); the porter and the pair set their loads down first. The angler gets a bite (5–6.5) and lands a fish. From 9 everyone stares after the pelican. |

## Titles
- **Series cartouche** (top right, tall and narrow, pale with a double key rule, like the reference): 「富岳・浮世绘」, with 「一八三〇 / 年代」 in a sub-panel.
- **English cartouche:** "Ukiyo-e / 1830s".
- **Signature** (lower right): 「鹕斋画」 (a nod to 北斎) in a red-ruled cartouche, with a square seal 「鹕」.
- **Seals at the left edge:** the publisher's oval 「鹕永堂」 and the censor's 「極」.

## Technique and numbers
- The woodblock model, the rain tiles and the per-frame pelican print are unchanged.
- **Live marks:** max 28 per frame (drips plus about 18 grass blades).
- **Speed:** stills take 4–20 ms (5–27 ms with neighbours). Init ≈ 0.45 s.
- **Memory:** `K.bake` uses 0 MB. GPU textures from `K.layer` are about 50 MB: two 2000×1560 backgrounds, the road and foreground, the atlas, the cartouches, and the rain tiles.

## Reusable helpers (inside the scene)
- `plate` / `printPlate` / `paperLayer` / `spriteLayer`: the woodblock model.
- `unionOutline`: one outline around a union of shapes.
- `rainTile` / `drawTiled`: cropped scrolling tiles.
- `pouchFrame` / `pouchShape` / `tiltHead`: custom pouch and head tilt on the shared rig.
- `hbandPts` / `vegBand` / `speckle` / `shrubRow`: banded Hokusai-style plains.
- `childPaint`: a child carried on someone's back.
- `paintPorterGroup` / `paintPairGroup` / `paintAngler`: figures with loads and props.
