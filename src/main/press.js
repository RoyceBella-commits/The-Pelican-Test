// Cell 21 of the outro wall: an empty press-conference seat (a 2020s news photo).
// A row of microphones (blank flags — no real media marks), a name card 「鹈鹕（本人）」,
// an empty chair. Camera flashes light the chair; on the film's last beat the pelican
// streaks past behind the seat without looking back. Drawn in panel units (0..1000).
import { pose, placed } from '../rig/pelican.js';
import { rigParts } from '../rig/parts.js';
import { flashAt, T_PASS } from './outro.js';

const S = 2.048;               // layer px per unit
const PX = Math.round(1000 * S);
let L = null;                  // { back, chair, front, glow }

// ------------------------------------------------------------------ deterministic helpers
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rr = (x, a, b, c, d, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + c, b, a + c, b + d, r); x.arcTo(a + c, b + d, a, b + d, r); x.arcTo(a, b + d, a, b, r); x.arcTo(a, b, a + c, b, r); x.closePath(); };

/** A tiny line emblem of the event (our own mark: a pelican on a bicycle) for the printed backdrop. */
function emblem(x, cx, cy, k) {
  x.beginPath(); x.arc(cx - 11 * k, cy + 6 * k, 7 * k, 0, Math.PI * 2); x.arc(cx + 11 * k, cy + 6 * k, 7 * k, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(cx - 11 * k, cy + 6 * k); x.lineTo(cx - 2 * k, cy - 2 * k); x.lineTo(cx + 11 * k, cy + 6 * k); x.stroke();
  x.beginPath(); x.ellipse(cx - 3 * k, cy - 6 * k, 8 * k, 4.5 * k, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(cx + 3 * k, cy - 8 * k); x.lineTo(cx + 5 * k, cy - 17 * k); x.lineTo(cx + 16 * k, cy - 14 * k); x.stroke();
}

function paintBack(x) {
  x.scale(S, S);
  // a printed press backdrop (flat panels), lit by a soft key light
  const g = x.createLinearGradient(0, 0, 0, 660);
  g.addColorStop(0, '#17223d'); g.addColorStop(1, '#243660');
  x.fillStyle = g; x.fillRect(0, 0, 1000, 1000);
  // step-and-repeat of the event's own emblem (no real media marks)
  x.strokeStyle = 'rgba(190,210,255,0.13)'; x.fillStyle = 'rgba(190,210,255,0.13)'; x.lineWidth = 2.2;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 15px "PingFang SC", sans-serif';
  for (let r = 0; r < 5; r++) for (let c = -1; c < 7; c++) {
    const cx = c * 170 + (r % 2 ? 85 : 0) + 60, cy = 70 + r * 130;
    emblem(x, cx, cy, 1.5);
    x.fillText('鹈鹕测试', cx, cy + 34);
  }
  // panel seams
  x.fillStyle = 'rgba(0,0,0,0.18)';
  for (const sx of [250, 500, 750]) x.fillRect(sx - 1, 0, 2, 660);
  const pool = x.createRadialGradient(500, 380, 30, 500, 380, 520);
  pool.addColorStop(0, 'rgba(255,236,210,0.20)'); pool.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = pool; x.fillRect(0, 0, 1000, 700);
  // carpet
  x.fillStyle = '#2b2326'; x.fillRect(0, 900, 1000, 100);
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(255,255,255,${0.02 + hash(k) * 0.03})`; x.fillRect(hash(k + 1) * 1000, 900 + hash(k + 2) * 100, 2, 1); }
}

function paintChair(x) {
  x.scale(S, S);
  // armrests (padded), seen beside the backrest
  for (const ax of [334, 610]) {
    const ag = x.createLinearGradient(0, 572, 0, 612);
    ag.addColorStop(0, '#3a3b42'); ag.addColorStop(1, '#101012');
    x.fillStyle = ag; rr(x, ax, 572, 56, 34, 14); x.fill();
  }
  // high backrest: black leather, three padded bands, light from the front-left
  const body = new Path2D();
  body.moveTo(382, 640); body.bezierCurveTo(376, 520, 372, 420, 384, 372);
  body.bezierCurveTo(398, 318, 446, 300, 500, 300);
  body.bezierCurveTo(554, 300, 602, 318, 616, 372);
  body.bezierCurveTo(628, 420, 624, 520, 618, 640); body.closePath();
  const g = x.createLinearGradient(376, 0, 628, 0);
  g.addColorStop(0, '#2f3036'); g.addColorStop(0.3, '#3d3e46'); g.addColorStop(0.55, '#232429'); g.addColorStop(1, '#0e0e10');
  x.fillStyle = g; x.fill(body);
  x.save(); x.clip(body);
  for (const [y0, y1] of [[318, 420], [430, 530], [540, 640]]) {
    const pg = x.createLinearGradient(0, y0, 0, y1);
    pg.addColorStop(0, 'rgba(255,255,255,0.10)'); pg.addColorStop(0.5, 'rgba(255,255,255,0)'); pg.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = pg; x.fillRect(370, y0, 260, y1 - y0);
  }
  // side bolsters
  x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(590, 300, 40, 340);
  x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(372, 300, 30, 340);
  x.restore();
  // rim light along the top and the left edge
  x.strokeStyle = 'rgba(255,240,220,0.35)'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(380, 600); x.bezierCurveTo(374, 500, 372, 420, 384, 372); x.bezierCurveTo(398, 318, 446, 300, 500, 300); x.bezierCurveTo(540, 300, 572, 308, 592, 326); x.stroke();
}

function paintFront(x) {
  x.scale(S, S);
  // table: a white-clothed top seen slightly from above, and a pleated navy skirt
  const tg = x.createLinearGradient(0, 606, 0, 650);
  tg.addColorStop(0, '#d9d5cb'); tg.addColorStop(1, '#f1eee6');
  x.fillStyle = tg;
  x.beginPath(); x.moveTo(70, 606); x.lineTo(930, 606); x.lineTo(970, 650); x.lineTo(30, 650); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(30, 650, 940, 4);
  const sk = x.createLinearGradient(0, 652, 0, 905);
  sk.addColorStop(0, '#2a3d6b'); sk.addColorStop(1, '#1b2747');
  x.fillStyle = sk; x.fillRect(30, 652, 940, 253);
  for (let k = 0; k < 24; k++) {
    const cx = 40 + k * 39 + hash(k + 40) * 8;
    const pg = x.createLinearGradient(cx - 18, 0, cx + 18, 0);
    pg.addColorStop(0, 'rgba(255,255,255,0)'); pg.addColorStop(0.5, 'rgba(255,255,255,0.07)'); pg.addColorStop(0.75, 'rgba(0,0,0,0.16)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = pg; x.fillRect(cx - 18, 656, 36, 249);
  }
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(30, 902, 940, 6);
  // papers, a water glass and a plain bottle
  x.fillStyle = '#f7f5ef';
  x.beginPath(); x.moveTo(170, 640); x.lineTo(196, 616); x.lineTo(300, 616); x.lineTo(286, 640); x.closePath(); x.fill();
  x.fillStyle = 'rgba(200,220,235,0.35)'; rr(x, 752, 566, 38, 72, 5); x.fill();
  x.strokeStyle = 'rgba(235,245,255,0.75)'; x.lineWidth = 1.6; rr(x, 752, 566, 38, 72, 5); x.stroke();
  x.fillStyle = 'rgba(180,215,235,0.4)'; rr(x, 812, 524, 40, 114, 9); x.fill();
  x.strokeStyle = 'rgba(235,245,255,0.6)'; rr(x, 812, 524, 40, 114, 9); x.stroke();
  x.fillStyle = '#2c6fb3'; rr(x, 822, 506, 20, 20, 3); x.fill();
  // phones recording, lying on the table
  for (const [px, py] of [[210, 626], [680, 628]]) { x.fillStyle = '#111215'; rr(x, px, py, 52, 14, 3); x.fill(); x.fillStyle = '#e0453a'; x.fillRect(px + 7, py + 5, 4, 4); }
  // a row of microphones aimed at the empty chair (plain flags — no media marks)
  const MICS = [
    [372, 512, '#1a1a1c', 'foam', '#e4dfd2'], [410, 492, '#2f3136', 'ball', '#b8392f'], [446, 478, '#1a1a1c', 'foam', null],
    [480, 470, '#8a2020', 'foam', '#2f5fa8'], [512, 468, '#1a1a1c', 'ball', '#ece8dc'], [546, 472, '#253a74', 'foam', null],
    [580, 480, '#1a1a1c', 'foam', '#2f7a4a'], [616, 494, '#3a3a3e', 'ball', '#d88a2a'], [652, 514, '#1a1a1c', 'foam', null],
  ];
  MICS.forEach(([hx, hy, col, kind, flag], k) => {
    const bx = 400 + k * 25, by = 632;
    x.strokeStyle = '#141416'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + (hx - bx) * 0.2, hy + 90, hx, hy + 40); x.stroke();
    x.fillStyle = '#141416'; rr(x, bx - 16, by - 4, 32, 10, 4); x.fill();
    if (flag) {   // a blank mic flag: a plain coloured box
      x.fillStyle = flag; x.fillRect(hx - 22, hy + 38, 44, 36);
      x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(hx + 10, hy + 38, 12, 36);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(hx - 22, hy + 38, 44, 5);
    }
    x.fillStyle = col;
    if (kind === 'foam') {
      rr(x, hx - 19, hy - 8, 38, 52, 18); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.10)'; rr(x, hx - 13, hy - 2, 10, 38, 5); x.fill();
    } else {
      x.fillStyle = '#2a2b30'; rr(x, hx - 8, hy + 18, 16, 26, 4); x.fill();
      x.fillStyle = col; x.beginPath(); x.ellipse(hx, hy + 8, 19, 21, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 1.2;
      for (let j = -3; j <= 3; j++) { x.beginPath(); x.moveTo(hx - 17, hy + 8 + j * 5); x.lineTo(hx + 17, hy + 8 + j * 5); x.stroke(); }
    }
  });
  // the name card (a white tent card) on the front edge
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(332, 640, 340, 9);
  x.fillStyle = '#f7f5ef'; rr(x, 330, 560, 340, 84, 4); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(330, 560, 340, 7);
  x.fillStyle = '#16171a'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 46px "PingFang SC", "Hiragino Sans GB", sans-serif';
  x.fillText('鹈鹕（本人）', 500, 604);
}

function paintGlow(x) {
  x.scale(S, S);
  const g = x.createRadialGradient(500, 470, 30, 500, 470, 560);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0.15)');
  x.fillStyle = g; x.fillRect(0, 0, 1000, 1000);
}

export function initPress(K) {
  if (L) return;
  L = {
    back: K.layer('press:back', PX, PX, paintBack),
    chair: K.layer('press:chair', PX, PX, paintChair),
    front: K.layer('press:front', PX, PX, paintFront),
    glow: K.layer('press:glow', 256, 256, (x) => { x.scale(256 / PX, 256 / PX); paintGlow(x); }),
  };
}

// ------------------------------------------------------------------ the pelican streaking past
const ROLE = {
  legFar: ['#d98a5f'], footFar: ['#d98a5f'], crankFar: [null, 4, '#4a4a4e'],
  tire: [null, 7, '#18181a'], rim: [null, 2, '#9aa0a6'], spoke: [null, 0.8, '#b8bcc0'], hub: ['#333'], chain: [null, 1.5, '#444'],
  frame: [null, 6, '#c0392b'], fork: [null, 5, '#c0392b'], stem: [null, 4, '#333'], bars: [null, 4, '#333'], seatpost: [null, 4, '#555'],
  saddle: [null, 7, '#222'], ring: [null, 3, '#555'],
  tail: ['#efede6'], body: ['#f6f4ee'], wing: ['#e6e3da'], secondaries: [null, 6, '#2b2b2e'], primary: [null, 5, '#1f1f22'],
  neck: ['#f6f4ee'], head: ['#f6f4ee'], crest: [null, 2, '#d8d6cf'], pouch: ['#f0a340'], bill: ['#f2c58a'], nail: ['#d4693a'],
  face: ['#f4c7a6'], eye: ['#ffffff'], pupil: ['#111111'], eyeShut: [null, 2, '#111'],
  leg: ['#ef9a6e'], foot: ['#ef9a6e'], crank: [null, 5, '#555'], pedal: [null, 7, '#222'],
};
function drawFlat(P, alpha) {
  for (const part of rigParts(P)) {
    const st = ROLE[part.role]; if (!st) continue;
    const [fillC, w, sc] = st;
    if (part.kind === 'circle') {
      if (fillC) { noStroke(); fill(colorA(fillC, alpha)); circle(part.c[0], part.c[1], part.r * 2); }
      else { noFill(); stroke(colorA(sc, alpha)); strokeWeight(w); circle(part.c[0], part.c[1], part.r * 2); }
    } else if (part.kind === 'poly') {
      fill(colorA(fillC || '#ffffff', alpha)); stroke(colorA('#2a2a2e', alpha * 0.8)); strokeWeight(1.6);
      beginShape(); for (const p of part.pts) vertex(p[0], p[1]); endShape(CLOSE);
    } else {
      noFill(); stroke(colorA(sc, alpha)); strokeWeight(w);
      beginShape(); for (const p of part.pts) vertex(p[0], p[1]); endShape();
    }
  }
}
const colorA = (hex, a) => { const c = color(hex); c.setAlpha(255 * a); return c; };

const PASS_DUR = 0.32;
function passRider(t) {
  const k = (t - T_PASS) / PASS_DUR;
  const x = -260 + 1520 * k;
  const crank = t * Math.PI * 2 * 3.2, wheel = (x / 60);
  const P = pose({ crank, wheel, t, v: 4000 }, { spokes: 8, wind: 0.6 });
  return placed(P, { x, y: 715, scale: 1, rot: 0 });
}

/** Paint the cell at film time t (panel units; the caller clips to the cell). */
export function renderPress(K, t) {
  initPress(K);
  const f = flashAt(t);
  imageMode(CORNER);
  noTint();
  image(L.back, 0, 0, 1000, 1000);
  // the flash throws the chair's hard shadow onto the backdrop
  if (f > 0.02) { push(); tint(0, 0, 0, 150 * f); image(L.chair, 26, -14, 1000, 1000); pop(); }
  // the pelican, behind the seat, on the last beat
  const k = (t - T_PASS) / PASS_DUR;
  if (k > 0 && k < 1) {
    for (let g = 5; g >= 1; g--) { push(); translate(-g * 34, 0); drawFlat(passRider(t), 0.09 * (6 - g) / 5); pop(); }
    drawFlat(passRider(t), 0.92);
    stroke(255, 255, 255, 60); strokeWeight(2);
    for (let j = 0; j < 6; j++) { const y = 470 + j * 26 + hash(j) * 10, xe = -260 + 1520 * k - 120; line(xe - 260 - hash(j + 5) * 120, y, xe, y); }
    noStroke();
  }
  image(L.chair, 0, 0, 1000, 1000);
  image(L.front, 0, 0, 1000, 1000);
  if (f > 0.01) { push(); tint(255, 255 * Math.min(1, 0.85 * f)); image(L.glow, 0, 0, 1000, 1000); pop(); }
}
