// Intro: the exhibition's preface sheet (leftmost "panel" of the scroll) plus
// the documentary subtitles, which live in screen space.
import { INTRO_W } from '../beat/timeline.js';
import { smoothstep, easeOutBack } from '../kit/math.js';
import { INTRO_CAM } from './camera.js';
import { BASE_PX_PER_UNIT } from '../beat/timeline.js';

export const introScene = {
  id: 'intro',
  index: -1,
  frame: 'paper',
  width: INTRO_W,
  title: { zh: '序', en: 'Preface' },
  year: { zh: '', en: '' },
  init(K) {
    this.sheet = K.paper.sheet({ w: 1200, h: 706, base: '#f3e8cd', kind: 'paper', grain: 0.55, fibers: 140, stains: 12, edge: 0.4, blotch: 0.35, seed: 7 });
  },
  render(K, u, ctx) {
    // paper
    image(this.sheet, 0, 0, INTRO_W, 1000);
    // printed page furniture: double rule, running head, folio
    stroke(60, 45, 30, 150); strokeWeight(1.6); noFill();
    rect(70, 70, INTRO_W - 140, 860);
    strokeWeight(0.8);
    rect(80, 80, INTRO_W - 160, 840);
    noStroke();
    K.text({ text: '鹈鹕骑行艺术通史 · 卷一', font: '"Songti SC", serif', size: 24, color: 'rgba(60,45,30,0.75)', align: 'center', letterSpacing: 6 }, INTRO_W / 2, 100, 1);
    K.text({ text: 'A GENERAL HISTORY OF PELICAN CYCLING IN ART · VOL. I', font: '"Baskerville", serif', size: 15, color: 'rgba(60,45,30,0.6)', align: 'center', letterSpacing: 3 }, INTRO_W / 2, 136, 1);
    K.text({ text: '— 一 —', font: '"Songti SC", serif', size: 22, color: 'rgba(60,45,30,0.6)', align: 'center' }, INTRO_W / 2, 880, 1);
    // plate rule (the "road" starts as the plate's baseline)
    stroke(50, 38, 26, 200); strokeWeight(1.4);
    line(1180, 800, INTRO_W, 800);
    noStroke();
    K.text({ text: '图一　鹈鹕骑行图（摹本）', font: '"Songti SC", serif', size: 20, color: 'rgba(50,38,26,0.8)', align: 'center' }, 1460, 822, 1);
    K.text({ text: 'Fig. 1 — Pelican on a bicycle (copy)', font: '"Baskerville", serif', style: 'italic', size: 15, color: 'rgba(50,38,26,0.65)', align: 'center' }, 1460, 852, 1);
    if (ctx.rider.visible) K.rig.drawPen(ctx.rider.placed, { key: 'intro:rider', color: false, ink: '#2a2118', weight: 0.9 });
    // the subtitles are printed on the sheet: laid out in screen pixels for the
    // opening camera, so they scroll away with the paper when the camera moves
    K.flush();
    const s = INTRO_CAM.z * BASE_PX_PER_UNIT;
    push();
    translate(INTRO_W / 2, 500);
    scale(1 / s);
    translate(-960, -540);
    drawIntroCaptions(K, u);
    pop();
  },
};

/** Subtitles of the intro, in the opening camera's screen pixels. */
export function drawIntroCaptions(K, t) {
  const out = 1;
  const ink = 'rgba(38,28,18,1)';
  const a1 = smoothstep(0.15, 0.75, t) * out;
  const aSrc = smoothstep(1.0, 1.5, t) * out;
  const a2 = smoothstep(2.96, 3.12, t) * out;
  const popS = 1 + 0.06 * (1 - easeOutBack(smoothstep(3.0, 3.35, t)));
  const cx = 960;
  if (a1 > 0) {
    K.text({ text: '人类自古以来就痴迷于画鹈鹕骑自行车。', font: '"Songti SC", serif', weight: 600, size: 58, color: ink, align: 'center', letterSpacing: 2 }, cx, 300 - 12 * (1 - a1), 1, a1);
    K.text({ text: 'Since time immemorial, humankind has been obsessed with drawing pelicans riding bicycles.', font: '"Baskerville", serif', style: 'italic', size: 27, color: ink, align: 'center' }, cx, 386 - 12 * (1 - a1), 1, a1 * 0.85);
  }
  if (a2 > 0) {
    push();
    translate(cx, 500);
    scale(popS);
    K.text({ text: '——早在自行车被发明之前。', font: '"Songti SC", serif', weight: 600, size: 52, color: ink, align: 'center', letterSpacing: 2 }, 0, -30, 1, a2);
    K.text({ text: '— long before the bicycle was invented.', font: '"Baskerville", serif', style: 'italic', size: 27, color: ink, align: 'center' }, 0, 46, 1, a2 * 0.85);
    pop();
  }
  if (aSrc > 0) {
    K.text({ text: '——《鹈鹕骑行艺术通史》，卷一', font: '"Songti SC", serif', size: 24, color: 'rgba(60,45,30,0.85)', align: 'right' }, 1500, 640, 1, aSrc);
    K.text({ text: 'A General History of Pelican Cycling in Art, Vol. I', font: '"Baskerville", serif', style: 'italic', size: 18, color: 'rgba(60,45,30,0.7)', align: 'right' }, 1500, 676, 1, aSrc);
  }
}
