// The frame compositor. One call to draw(t) paints the whole film frame:
//   wall → each visible panel (rendered into a shared screen-sized framebuffer,
//   then only its interior rectangle is copied = the clip) → frames → scene
//   overlays → captions.
import K from '../kit/index.js';
import { flush, resetBrush, brushLib } from '../kit/brush.js';
import * as TL from '../beat/timeline.js';
import { riderAt } from '../beat/ride.js';
import { pose, placed, RIG_BOUNDS } from '../rig/pelican.js';
import { storyCamera, viewRect } from './camera.js';
import { introScene } from './intro.js';
import * as OUT from './outro.js';
import { initPress, renderPress } from './press.js';

const W = TL.VIEW_W, H = TL.VIEW_H;
const WALL = '#26221e';
const TILE = 1024;

export class Film {
  constructor(scenes) {
    this.scenes = scenes;
    this.inited = new Set();
    this.tiles = new Map();          // j → { 1024: fb, 512: fb, 256: fb }
    this.errors = new Map();
    this.debug = false;
  }

  setup() {
    this.fb = createFramebuffer({ width: W, height: H, density: 1, depth: false, antialias: false });
  }

  // ------------------------------------------------------------ panel helpers
  sceneOf(j) { return j < 0 ? introScene : this.scenes[j]; }
  leftOf(j) { return j < 0 ? TL.introLeft() : TL.panelLeft(j); }
  widthOf(j) { return j < 0 ? TL.INTRO_W : TL.PANEL; }
  localTime(j, t) { return j < 0 ? t : t - TL.sceneStart(j); }

  camera(t) {
    if (t >= TL.OUTRO_START) return OUT.outroCamera(t, storyCamera(t, this.scenes));
    return storyCamera(t, this.scenes);
  }

  /** Rider state, placement (in the owning panel) and pose at time t. */
  rider(t) {
    const st = riderAt(t, this.scenes);
    const own = this.sceneOf(st.i);
    let place = { x: st.wx - this.leftOf(st.i), y: TL.ROAD_Y, scale: 1, rot: 0 };
    let mods = {};
    try { if (own.path) place = { ...place, ...(own.path(st.u, { ...place }) || {}) }; } catch (e) { this.err(own, e); }
    try { if (own.mods) mods = own.mods(st.u) || {}; } catch (e) { this.err(own, e); }
    const P = pose({ crank: st.crank, wheel: st.wheel, t, v: st.v }, mods);
    return { st, owner: st.i, place, mods, P };
  }

  /** The rider as seen from panel j (placement converted into j's coordinates). */
  riderFor(j, R) {
    const dx = this.leftOf(R.owner) - this.leftOf(j);
    const place = { ...R.place, x: R.place.x + dx };
    const s = place.scale ?? 1;
    const visible = place.x + RIG_BOUNDS.x1 * s + 12 > 0 && place.x + RIG_BOUNDS.x0 * s - 12 < this.widthOf(j);
    let cached = null;
    return {
      visible, state: R.st, pose: R.P, place, mods: R.mods, isOwner: R.owner === j,
      get placed() { return cached || (cached = placed(R.P, place)); },
    };
  }

  err(scene, e) {
    const msg = String(e && (e.stack || e.message) || e);
    if (!this.errors.has(scene.id)) console.error(`[scene ${scene.id}]`, e);
    this.errors.set(scene.id, msg);
    window.__lastError = `${scene.id}: ${e && e.message || e}`;
  }

  // ------------------------------------------------------------ lifecycle
  async initScene(j) {
    if (this.inited.has(j)) return;
    const sc = this.sceneOf(j);
    K._state.scenePrefix = sc.id;
    try {
      if (sc.init) await sc.init(K, { index: j, scene: sc });
    } catch (e) {
      this.err(sc, e);
      sc.loadError = String(e.message || e);
      sc.render = sc.fallback || sc.render;
    }
    this.inited.add(j);
  }

  unloadFar(center) {
    for (const j of [...this.inited]) {
      if (j < 0) continue;
      if (Math.abs(j - center) > 3) {
        const sc = this.sceneOf(j);
        try { sc.dispose?.(K); } catch {}
        K.dropBakes(sc.id);
        this.inited.delete(j);
      }
    }
  }

  /** Panels whose interior intersects the view (story layout). */
  visibleStory(cam) {
    const v = viewRect(cam);
    const out = [];
    for (let j = -1; j < TL.N_SCENES; j++) {
      const x0 = this.leftOf(j) - TL.FRAME_W, x1 = this.leftOf(j) + this.widthOf(j) + TL.FRAME_W;
      if (x1 > v.x0 && x0 < v.x1 && TL.PANEL + TL.FRAME_W > v.y0 && -TL.FRAME_W < v.y1) out.push(j);
    }
    return out;
  }

  /** Async work that must happen before drawing frame t (scene init, outro tiles). */
  async prepare(t, opts = {}) {
    if (opts.solo != null) { await this.initScene(opts.solo); return; }
    const cam = this.camera(Math.min(t, TL.OUTRO_START));
    const vis = this.visibleStory(cam);
    const want = new Set(vis);
    for (const j of vis) { if (j + 1 < TL.N_SCENES) want.add(j + 1); }
    for (const j of want) await this.initScene(j);
    const ci = TL.sceneIndexAt(Math.min(t, TL.OUTRO_START - 0.01));
    if (t < TL.OUTRO_START - 1) this.unloadFar(Math.max(0, ci));
    if (t >= TL.OUTRO_START - 0.5) await this.ensureTiles();
  }

  // ------------------------------------------------------------ rendering
  /**
   * Render panel j at film time t through camera cam into framebuffer `target`
   * (tw × th px). The scene draws in panel units (0..width, 0..1000).
   */
  renderPanel(j, t, cam, target, tw, th, R, opts = {}) {
    const sc = this.sceneOf(j);
    const u = opts.u ?? this.localTime(j, t);
    const hw = tw / 2 / cam.pxu, hh = th / 2 / cam.pxu;
    const lx = this.leftOf(j);
    const ctx = {
      t, u, i: j, scene: sc,
      rider: this.riderFor(j, R),
      riderAt: (tt) => this.riderFor(j, this.rider(tt)),
      view: { x0: cam.cx - hw - lx, x1: cam.cx + hw - lx, y0: cam.cy - hh, y1: cam.cy + hh },
      pxu: cam.pxu,
      freeze: !!opts.freeze,
      error: sc.loadError,
    };
    target.begin();
    clear();
    push();
    translate(-tw / 2, -th / 2);
    translate(tw / 2, th / 2);
    scale(cam.pxu);
    translate(-cam.cx + lx, -cam.cy);
    brushLib.load(target);
    resetBrush();
    K._state.inPass = true;
    K._state.scenePrefix = sc.id;
    try {
      sc.render(K, u, ctx);
      flush();
    } catch (e) {
      this.err(sc, e);
      try { flush(); } catch {}
      resetBrush();
      try { sc.fallback?.(K, u, { ...ctx, error: e.message || String(e) }); flush(); } catch {}
    }
    K._state.inPass = false;
    pop();
    target.end();
    brushLib.load();
  }

  /** Copy the panel's interior rectangle from this.fb onto the main canvas. */
  blitInterior(j, cam, x0w, y0w, alpha = 1) {
    const sx0 = Math.max(0, Math.floor((x0w - cam.cx) * cam.pxu + W / 2));
    const sy0 = Math.max(0, Math.floor((y0w - cam.cy) * cam.pxu + H / 2));
    const sx1 = Math.min(W, Math.ceil((x0w + this.widthOf(j) - cam.cx) * cam.pxu + W / 2));
    const sy1 = Math.min(H, Math.ceil((y0w + TL.PANEL - cam.cy) * cam.pxu + H / 2));
    if (sx1 <= sx0 || sy1 <= sy0) return;
    push();
    if (alpha < 1) tint(255, 255 * alpha);
    imageMode(CORNER);
    image(this.fb, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
    pop();
  }

  withCamera(cam, fn) {
    push();
    translate(W / 2, H / 2);
    scale(cam.pxu);
    translate(-cam.cx, -cam.cy);
    fn();
    pop();
  }

  /** Main entry: paint frame t (inside p5 draw, origin at canvas centre). */
  draw(t, opts = {}) {
    window.__lastError = null;
    push();
    translate(-W / 2, -H / 2);
    background(WALL);
    if (opts.solo != null) this.drawSolo(opts.solo, opts.u ?? 3, opts);
    else if (t >= TL.OUTRO_START) this.drawOutro(t);
    else this.drawStory(t);
    if (this.debug || opts.debug) this.drawDebug(t, opts);
    if (opts.label) this.drawLabel(opts.label, opts.labelSize || 40);
    pop();
  }

  /** Burned-in label (contact sheets): dark box, top-left. */
  drawLabel(text, size) {
    const o = { text, font: '"PingFang SC", Menlo, sans-serif', weight: 600, size, color: '#ffffff' };
    const sp = K.textSprite(o);
    noStroke();
    fill(0, 0, 0, 170);
    rect(0, 0, sp.w - sp.pad + size * 0.5, sp.h - sp.pad * 0.6);
    K.text(o, size * 0.25, size * 0.1, 1);
  }

  drawStory(t) {
    const cam = this.camera(t);
    const R = this.rider(t);
    const vis = this.visibleStory(cam);
    this.wallLight(cam, vis);
    for (const j of vis) {
      if (!this.inited.has(j)) continue;          // not prepared (live preview catching up)
      this.renderPanel(j, t, cam, this.fb, W, H, R);
      this.blitInterior(j, cam, this.leftOf(j), 0);
    }
    this.withCamera(cam, () => {
      for (const j of vis) K.frames.drawFrame(this.sceneOf(j).frame, this.leftOf(j), 0, this.widthOf(j), TL.PANEL);
    });
    // screen-space overlay of the active scene (e.g. the 9:16 letterbox)
    const i = TL.sceneIndexAt(t);
    for (const j of [i - 1, i, i + 1]) {
      const sc = this.scenes[j];
      if (!sc?.overlay) continue;
      try { sc.overlay(K, t - TL.sceneStart(j), { t, cam, rider: R }); } catch (e) { this.err(sc, e); }
    }
  }

  /** Soft gallery spotlights on the wall above/below the visible frames. */
  wallLight(cam, vis) {
    this.withCamera(cam, () => {
      noStroke();
      for (const j of vis) {
        const x = this.leftOf(j), w = this.widthOf(j);
        fill(255, 240, 215, 10);
        rect(x - 60, -260, w + 120, 260 - TL.FRAME_W);
        fill(0, 0, 0, 40);
        rect(x - TL.FRAME_W, TL.PANEL + TL.FRAME_W, w + 2 * TL.FRAME_W, 24);
      }
    });
  }

  drawOutro(t) {
    const cam = this.camera(t);
    const mix = OUT.tileMix(t);
    const v = viewRect(cam);
    const R = this.rider(t);
    // preface sheet fades out (it stays where it is; the wall forms to the right)
    const ia = OUT.introSheetAlpha(t);
    if (ia > 0) {
      const x0 = this.leftOf(-1);
      if (x0 + TL.INTRO_W > v.x0 && x0 < v.x1) {
        this.renderPanel(-1, t, cam, this.fb, W, H, R);
        this.blitInterior(-1, cam, x0, 0, ia);
        this.withCamera(cam, () => K.frames.drawFrame('minimal', x0, 0, TL.INTRO_W, TL.PANEL, ia));
      }
    }
    const placedPanels = [];
    for (let j = 0; j < OUT.N_CELLS; j++) {
      const { c, k, shown } = OUT.panelCentre(j, t);
      if (!shown) continue;
      const x0 = c[0] - TL.PANEL / 2, y0 = c[1] - TL.PANEL / 2;
      if (x0 + TL.PANEL + 60 < v.x0 || x0 - 60 > v.x1 || y0 + TL.PANEL + 60 < v.y0 || y0 - 60 > v.y1) continue;
      placedPanels.push({ j, x0, y0, k });
    }
    // live panels (only while they still sit in the strip and the crossfade runs)
    if (mix < 1) {
      for (const p of placedPanels) {
        if (p.j === OUT.PRESS || p.k > 0 || !this.inited.has(p.j)) continue;
        this.renderPanel(p.j, t, cam, this.fb, W, H, R);
        this.blitInterior(p.j, cam, p.x0, p.y0);
      }
    }
    // cell 21: the press seat, drawn live (it is the camera's final subject)
    const seat = placedPanels.find((p) => p.j === OUT.PRESS);
    if (seat) {
      this.fb.begin();
      clear();
      push();
      scale(cam.pxu);
      translate(-cam.cx + seat.x0, -cam.cy + seat.y0);
      try { renderPress(K, t); } catch (e) { this.err({ id: 'press' }, e); }
      pop();
      this.fb.end();
      this.blitInterior(OUT.PRESS, cam, seat.x0, seat.y0);
    }
    this.withCamera(cam, () => {
      for (const p of placedPanels) {
        if (p.j !== OUT.PRESS) {
          const tile = this.tileFor(p.j, TL.PANEL * cam.pxu);
          if (tile) {
            push();
            const a = mix < 1 && p.k === 0 ? mix : 1;
            if (a < 1) tint(255, 255 * a);
            imageMode(CORNER);
            image(tile, p.x0, p.y0, TL.PANEL, TL.PANEL);
            pop();
          }
        }
        K.frames.drawFrame('minimal', p.x0, p.y0);
      }
    });
    OUT.drawOutroCaptions(K, t);
  }

  drawSolo(j, u, opts) {
    const sc = this.sceneOf(j);
    const t = (j < 0 ? 0 : TL.sceneStart(j)) + u;
    const cam = { cx: this.leftOf(j) + this.widthOf(j) / 2, cy: TL.PANEL / 2, z: 1, pxu: opts.pxu ?? 1.0 };
    const R = this.rider(t);
    this.renderPanel(j, t, cam, this.fb, W, H, R);
    this.blitInterior(j, cam, this.leftOf(j), 0);
    this.withCamera(cam, () => K.frames.drawFrame(sc.frame, this.leftOf(j), 0, this.widthOf(j), TL.PANEL));
  }

  // ------------------------------------------------------------ outro tiles
  async ensureTiles() {
    initPress(K);
    for (let j = 0; j < TL.N_SCENES; j++) {
      if (this.tiles.has(j)) continue;
      await this.initScene(j);
      this.bakeTile(j);
    }
  }

  bakeTile(j) {
    const sc = this.scenes[j];
    const tf = TL.sceneStart(j) + (sc.freezeU ?? 3);
    const R = this.rider(tf);
    const big = createFramebuffer({ width: TILE, height: TILE, density: 1, depth: false, antialias: false });
    const cam = { cx: this.leftOf(j) + TL.PANEL / 2, cy: TL.PANEL / 2, pxu: TILE / TL.PANEL };
    this.renderPanel(j, tf, cam, big, TILE, TILE, R, { freeze: true });
    const levels = { [TILE]: big };
    let src = big;
    for (const s of [512, 256, 128]) {
      const fb = createFramebuffer({ width: s, height: s, density: 1, depth: false, antialias: false });
      fb.begin(); clear(); push(); imageMode(CENTER); image(src, 0, 0, s, s); pop(); fb.end();
      levels[s] = fb;
      src = fb;
    }
    this.tiles.set(j, levels);
  }

  /** Pick the smallest mip level that is still ≥ the on-screen size. */
  tileFor(j, screenPx) {
    const L = this.tiles.get(j);
    if (!L) return null;
    for (const s of [128, 256, 512]) if (s >= screenPx) return L[s];
    return L[TILE];
  }

  // ------------------------------------------------------------ debug HUD
  drawDebug(t, opts) {
    const i = TL.sceneIndexAt(t);
    const u = i >= 0 && i < TL.N_SCENES ? (t - TL.sceneStart(i)).toFixed(2) : '-';
    const bar = TL.barIndex(t), beat = ((TL.beatIndex(t) % 4) + 4) % 4 + 1;
    const txt = `t ${t.toFixed(3)}  f ${Math.round(t * TL.FPS)}  scene ${i + 1} u ${u}  bar ${bar} beat ${beat}`;
    K.text({ text: txt, font: 'Menlo, monospace', size: 20, color: '#fff', shadow: { color: '#000', blur: 3 } }, 20, 16, 1);
    if (TL.beatPhase(t) < 0.12) { noStroke(); fill(TL.barPhase(t) < 0.06 ? '#ff3b30' : '#ffd60a'); circle(W - 40, 40, 36); }
  }
}
