// 20 · 代码美学 / Code Aesthetics · 2020s · the LLM era
//
// A clean, fictional dark code editor. Left: `pelican.svg` streams in, token burst by token burst, on the 8th notes.
// Right: a live preview on a soft grey canvas. The SVG is REAL: it is generated from the rider's rest pose
// (integers in the viewBox 0 0 450 450, origin = preview-pane x 550, panel y 400), and the preview draws exactly
// those shapes. While a row streams in, its element strokes itself in along its path (an orange pen), then its fill
// fades in; the rider keeps pedalling inside the growing drawing. On `</svg>` (u = 4.0) the "streaming preview"
// becomes the full render (gradients, the blurred ground shadow, the union outline), the rider brakes for one second
// and rests in the preview's centre (u = 5.0); a toast slides in at 4.5.
//
// Motion: the film camera follows `ride.stopAt: 500` (it settles on the panel centre, so the outro starts from a
// balanced frame), while `path()` lets the DRAWN rider keep cruising until 4.0 and brake to X_REST = 757 (near pedal
// exactly back). The pose is rebuilt from the drawn distance so the pedalling matches.
//
// Everything is painted per frame into one Canvas2D at screen resolution (crisp text and vectors), 0 brush marks.
// Over the dark code pane the rider uses a dark-theme palette (light ink), over the preview the light one.
import { SPEED, CRANK_DIST, WHEEL_R, panelLeft } from '../beat/timeline.js';
import { clamp, lerp, smoothstep, smootherstep, easeOut, easeOutBack } from '../kit/math.js';
import { pose as rigPose } from '../rig/pelican.js';

const ID = 'code';
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ layout (panel units)
const SPLIT = 550;            // code | preview
const TB = 62;                // title bar bottom
const TABS = 106;             // tab bar bottom
const CODE_Y0 = 108;          // first code row top
const LH = 30;                // code line height
const FONT = 23;              // code font size (≈ 22.3 px on screen at z = 1)
const VIS_ROWS = 23;          // rows visible in the code pane
const TX = 64;                // code text x
const GUT = 52;               // gutter width
const ROAD = 800;
const BAR1 = 834;             // bottom-panel header strip [800, 834]
const STAT = 958;             // status bar top
const PV_TOOL = 140;          // preview toolbar bottom
const VB = [SPLIT, 400];      // viewBox origin (panel units): svg (x, y) → panel (550 + x, 400 + y)
const TW_ROW = 12;            // typewriter row while the rider crosses the code pane

const UI = '"PingFang SC", "Hiragino Sans GB", sans-serif';
const MONO = 'Menlo, "PingFang SC", monospace';

const C = {
  bg: '#14171f', gutter: '#1b1f2a', chrome: '#0f1117', tabs: '#11141b', line: '#232836', lineNo: '#4b5263',
  text: '#d7dae0', keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', comment: '#697098',
  punct: '#89ddff', attr: '#a6b0d4', preview: '#e9ebef', slate: '#2b3242', accent: '#ff8a3d', ok: '#7fd88f',
};

// ------------------------------------------------------------------ motion
const RIDE = { stopAt: 500 };          // camera: the film camera follows this profile and rests on the panel centre
const X_REST = 757;                    // the drawn rider rests here (preview centre; crank exactly at π)
const BRAKE = [4.0, 5.0];
/** Drawn rider position (panel-local x of the bottom bracket). Equal to the film profile for u ≤ 2. */
function xDrawn(u) {
  if (u <= BRAKE[0]) return -14 + SPEED * u;
  if (u >= BRAKE[1]) return X_REST;
  const D = BRAKE[1] - BRAKE[0], w = (u - BRAKE[0]) / D;
  return -14 + SPEED * BRAKE[0] + SPEED * D * (w - w * w * w + (w * w * w * w) / 2);
}

// ------------------------------------------------------------------ geometry helpers
const SR = (v) => (v < 0 ? -Math.round(-v) : Math.round(v));       // symmetric rounding (keeps S reflections exact)
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subv = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mixp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const rotp = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

/** Catmull-Rom through key points → cubic segments [['M',x,y],['C',x1,y1,x2,y2,x,y,isS]...]. */
function crSegs(P, closed, q) {
  const n = P.length;
  const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const d = P.map((_, i) => { const a = at(i - 1), b = at(i + 1); return [q((b[0] - a[0]) / 6), q((b[1] - a[1]) / 6)]; });
  const segs = [['M', P[0][0], P[0][1]]];
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p1 = P[i], p2 = at(i + 1), d1 = d[i], d2 = d[(i + 1) % n];
    segs.push(['C', p1[0] + d1[0], p1[1] + d1[1], p2[0] - d2[0], p2[1] - d2[1], p2[0], p2[1], i > 0]);
  }
  if (closed) segs.push(['Z']);
  return segs;
}
const lineSegs = (pts, closed) => pts.map((p, i) => [i ? 'L' : 'M', p[0], p[1]]).concat(closed ? [['Z']] : []);

/** Ribbon key points (left side out, right side back) for a spine with widths. */
function ribbonKeys(spine, widths) {
  const n = spine.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = widths[i] / 2;
    L.push([spine[i][0] - dy * w, spine[i][1] + dx * w]);
    R.push([spine[i][0] + dy * w, spine[i][1] - dx * w]);
  }
  return L.concat(R.reverse());
}

// ------------------------------------------------------------------ the SVG model (rig space: origin = road under the BB)
// Each element ↔ exactly one code row. shapes: { k: 'path'|'circle'|'ellipse'|'dots', ... } in rig coordinates
// (svg = rig + [207, 400] at rest), except abs:true shapes (svg coordinates, static).
function buildModel(P, exact) {
  const q = exact ? (v) => v : SR;
  const p = (pt) => [q(pt[0]), q(pt[1])];
  const B = P.bird, K = P.bike;
  const els = {};
  // ---- ground
  els.road = [{ k: 'path', abs: true, segs: [['M', 0, 400], ['H', 450]] }];
  els.shadow = [{ k: 'ellipse', c: [3, 1], rx: 178, ry: 7.5, rot: 0 }];
  // ---- legs
  const leg = (L) => {
    const keys = ribbonKeys([L.hip, L.knee, L.ankle], [14, 9.5, 6.5]).map(p);
    return [{ k: 'path', segs: crSegs(keys, true, q) }, { k: 'path', segs: lineSegs(L.web.map(p), true) }];
  };
  els['far-leg'] = leg(B.legFar);
  els['crank-far'] = [{ k: 'path', segs: lineSegs([p(K.crank.bb), p(K.crank.far)], false) }];
  // ---- wheels
  K.wheels.forEach((wh, i) => { els[i ? 'front' : 'rear'] = [{ k: 'circle', c: p(wh.c), r: 58 }]; });
  {
    const segs = [];
    for (const wh of K.wheels) {
      for (let j = 0; j < 6; j++) {
        const a = wh.angle + (j * Math.PI) / 6, dx = Math.cos(a) * 53, dy = Math.sin(a) * 53;
        const A = p([wh.c[0] + dx, wh.c[1] + dy]), Bp = p([wh.c[0] - dx, wh.c[1] - dy]);
        segs.push(['M', A[0], A[1]], ['L', Bp[0], Bp[1]]);
      }
    }
    els.spokes = [{ k: 'path', segs }];
    els.hubs = [{ k: 'dots', pts: K.wheels.map((wh) => p(wh.c)), r: 4.5 }];
    els.rim = [{ k: 'circle', c: p(K.wheels[0].c), r: 51 }];
    const sh = [];
    for (const wh of K.wheels) {
      const a0 = Math.PI * 1.08, a1 = Math.PI * 1.36, am = (a0 + a1) / 2, R = 58, Rc = R / Math.cos((a1 - a0) / 2);
      const A = p([wh.c[0] + R * Math.cos(a0), wh.c[1] + R * Math.sin(a0)]), Cc = p([wh.c[0] + Rc * Math.cos(am), wh.c[1] + Rc * Math.sin(am)]), Bq = p([wh.c[0] + R * Math.cos(a1), wh.c[1] + R * Math.sin(a1)]);
      sh.push(['M', A[0], A[1]], ['Q', Cc[0], Cc[1], Bq[0], Bq[1]]);
    }
    els.sheen = [{ k: 'path', segs: sh }];
    els['rim-use'] = [{ k: 'circle', c: p(K.wheels[1].c), r: 51 }];
  }
  // ---- frame, steering, accents, drive
  {
    const t = K.tubes;
    const rear = p(t.chainstay[1]), bb = p(t.chainstay[0]), st = p(t.seattube[1]), ht = p(t.toptube[1]), hb = p(t.headtube[1]);
    els.frame = [{ k: 'path', segs: [['M', rear[0], rear[1]], ['L', bb[0], bb[1]], ['L', st[0], st[1]], ['Z'], ['M', st[0], st[1]], ['L', ht[0], ht[1]], ['L', hb[0], hb[1]], ['L', bb[0], bb[1]]] }];
    const front = p(K.wheels[1].c);
    const forkK = [hb, p(add(t.headtube[1], [8, 28])), p(add(K.wheels[1].c, [1, -4])), front];
    const stemTop = p(K.stem[1]);
    const seatTop = p(K.seatpost[0]), seatBase = p(K.seatpost[1]);
    const sad = [-32, -150];
    const saddleK = [p(add(sad, [-16, -2])), p(add(sad, [0, -4])), p(add(sad, [16, 0]))];
    const barsK = [stemTop, p(add(K.stem[1], [12, -3])), p(add(K.stem[1], [22, 2])), p(add(K.stem[1], [20, 12]))];
    els.steer = [{ k: 'path', segs: crSegs(forkK, false, q).concat([['M', ht[0], ht[1]], ['L', stemTop[0], stemTop[1]]], crSegs(barsK, false, q).slice(1), [['M', seatTop[0], seatTop[1]], ['L', seatBase[0], seatBase[1]]], crSegs(saddleK, false, q)) }];
    els.ring = [{ k: 'circle', c: bb, r: 15 }];
    els.chain = [{ k: 'path', segs: lineSegs(K.chain.map(p), true) }];
    const pn = p(K.crank.near);
    els.crank = [{ k: 'path', segs: [['M', bb[0], bb[1]], ['L', pn[0], pn[1]], ['M', pn[0] - 6, pn[1]], ['L', pn[0] + 6, pn[1]]] }];
  }
  els.leg = leg(B.legNear);
  // ---- plumage
  els.crest = [{ k: 'path', segs: B.crest.flatMap((cr) => lineSegs([p(cr[0]), p(cr[1])], false)) }];
  {
    const tl = B.tail;
    els.tail = [{ k: 'path', segs: lineSegs([p(tl[0]), p(tl[2]), p(tl[1]), p(tl[3])], true) }];
  }
  els.body = [{ k: 'ellipse', c: p(B.bodyC), rx: 64, ry: 38, rot: (-11.5 * Math.PI) / 180 }];
  {
    const sp = B.neckSpine, n = sp.length;
    const idx = [0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4));
    const spine = idx.map((i) => sp[i]);
    const keys = ribbonKeys(spine, idx.map((i) => lerp(30, 19, i / (n - 1)))).map(p);
    els.neck = [{ k: 'path', segs: crSegs(keys, true, q) }];
  }
  els.head = [{ k: 'circle', c: p(B.head.c), r: 17 }];
  // ---- wing + quills
  const bc = B.bodyC, wingBack = [bc[0] - 58, bc[1] - 4];
  {
    const W = [B.shoulder, add(bc, [-6, -32]), add(bc, [-40, -22]), wingBack, add(bc, [-30, 14]), add(bc, [10, 14]), B.wrist].map(p);
    els.wing = [{ k: 'path', segs: crSegs(W, true, q) }];
    // covert feather tips: a row of small scallops along the lower wing
    const cov = [];
    for (let k = 0; k < 4; k++) {
      const x0 = -40 + k * 19, y0 = 4 + 1.5 * Math.sin(k * 1.3);
      const a = p(add(bc, [x0, y0])), m = p(add(bc, [x0 + 9.5, y0 + 8])), b = p(add(bc, [x0 + 19, y0 + 1]));
      cov.push(['M', a[0], a[1]], ['Q', m[0], m[1], b[0], b[1]]);
    }
    els.coverts = [{ k: 'path', segs: cov }];
    // quills: the secondaries and five primaries as tapered dark feathers
    const segs = crSegs(ribbonKeys([add(bc, [-20, 12]), add(bc, [-44, 8]), wingBack], [6, 4.2, 1.2]).map(p), true, q);
    for (const f of B.primaries) {
      const s0 = f[0], s1 = f[Math.floor(f.length / 2)], s2 = f[f.length - 1];
      const keys = ribbonKeys([s0, s1, s2], [4.6, 3.1, 0.4]).map(p);
      segs.push(...crSegs(keys, true, q));
    }
    els.quills = [{ k: 'path', segs }];
  }
  // ---- bill & pouch: rebuild the bill frame from the upper mandible (Bup(40,-6) and Bup(40,2))
  {
    const U = B.upperBill;
    const dv = subv(U[6], U[1]);
    const ang = Math.atan2(-dv[0], dv[1]);
    const base = subv(U[1], rotp([40, -6], ang));
    const Bf = (along, off) => add(base, rotp([along, off], ang));
    const sag = 22 + 4 * Math.sin(P.crank2 * 2 + 0.8);
    const len = 112;
    const lower = [Bf(-2, 6), Bf(18, 10 + sag * 0.55), Bf(50, 6 + sag), Bf(80, 4 + sag * 0.7), Bf(len - 6, 5)].map(p);
    const j1 = p(Bf(len - 8, 3)), j2 = p(Bf(10, 3));
    els.pouch = [{ k: 'path', segs: crSegs(lower, false, q).concat([['L', j1[0], j1[1]], ['L', j2[0], j2[1]], ['Z']]) }];
    const g0 = p(Bf(22, 9 + sag * 0.42)), g1 = p(Bf(46, 4 + sag * 0.86)), g2 = p(Bf(72, 3 + sag * 0.56));
    els.gloss = [{ k: 'path', segs: [['M', g0[0], g0[1]], ['Q', g1[0], g1[1], g2[0], g2[1]]] }];
    els.bill = [{ k: 'path', segs: crSegs(U.map(p), true, q) }];
    const r0 = p(Bf(8, -3.6)), r1 = p(Bf(52, -4.6)), r2 = p(Bf(98, -2.6));
    els.ridge = [{ k: 'path', segs: [['M', r0[0], r0[1]], ['Q', r1[0], r1[1], r2[0], r2[1]]] }];
    els.nail = [{ k: 'path', segs: lineSegs(B.nail.map(p), true) }];
  }
  {
    const E = B.eye;
    els.face = [{ k: 'ellipse', c: p(add(E.c, [1, 1])), rx: 8, ry: 6.5, rot: 0 }];
    els.eye = [{ k: 'circle', c: p(E.c), r: 4.2 }];
    els.pupil = [{ k: 'circle', c: p(E.pupil), r: 2.3 }];
    els.glint = [{ k: 'circle', c: p(add(E.pupil, [-1, -1])), r: 0.9 }];
  }
  return els;
}

// ------------------------------------------------------------------ element styles (as written in the SVG)
// fill: colour | 'plume' (userSpaceOnUse gradient) | 'pouchG' (bbox gradient) | 'shadow'; stroke: 'ink' (root) | colour
const ST = {
  road: { stroke: 'ink', w: 2.2 },
  shadow: { fill: 'shadow' },
  'far-leg': { fill: '#c97c58', stroke: 'ink', w: 2.2 },
  'crank-far': { stroke: 'ink', w: 5 },
  rear: { stroke: 'ink', w: 8 }, front: { stroke: 'ink', w: 8 },
  spokes: { stroke: 'spoke', w: 1 },
  hubs: { dots: 'ink' },
  rim: { stroke: C.accent, w: 2 }, 'rim-use': { stroke: C.accent, w: 2 },
  sheen: { stroke: 'sheen', w: 1.8 },
  frame: { stroke: 'ink', w: 6 },
  steer: { stroke: 'ink', w: 5 },
  ring: { stroke: 'ink', w: 3, dash: [2, 1.93] },
  chain: { stroke: 'chain', w: 1.6 },
  leg: { fill: '#f59466', stroke: 'ink', w: 2.2 },
  crank: { stroke: 'ink', w: 5 },
  crest: { stroke: 'ink', w: 2.2 },
  tail: { fill: 'plume', stroke: 'ink', w: 4.4, union: true },
  body: { fill: 'plume', stroke: 'ink', w: 4.4, union: true },
  neck: { fill: 'plume', stroke: 'ink', w: 4.4, union: true },
  head: { fill: 'plume', stroke: 'ink', w: 4.4, union: true },
  wing: { fill: 'wingG', stroke: 'ink', w: 2.2, lift: true },
  coverts: { stroke: 'ink', w: 1.3, alpha: 0.42 },
  quills: { fill: 'quill', stroke: 'quill', w: 1 },
  pouch: { fill: 'pouchG', stroke: 'ink', w: 2.2 },
  gloss: { stroke: '#ffffff', w: 3, alpha: 0.65 },
  bill: { fill: '#fbe1c2', stroke: 'ink', w: 2.2 },
  ridge: { stroke: '#ffffff', w: 1.6, alpha: 0.8 },
  nail: { fill: '#e9592f', stroke: 'ink', w: 2.2 },
  face: { fill: '#ffc4a0' },
  eye: { fill: '#ffffff', stroke: 'ink', w: 1 },
  pupil: { fill: '#1d2230' },
  glint: { fill: '#ffffff' },
};
const PAL = {
  light: { sheen: '#6f7a94', ink: C.slate, spoke: '#8a93a6', chain: '#59627a', quill: C.slate, ghost: 'rgba(110,120,142,0.55)', flatPlume: '#f8f9fc', flatPouch: '#ffb27c', flatWing: '#f1f4f9' },
  dark: { sheen: '#eef2f7', ink: '#b6bfcd', spoke: '#6c7589', chain: '#7f889c', quill: '#3c4558', ghost: 'rgba(140,150,175,0.5)', flatPlume: '#eef1f6', flatPouch: '#ffad78', flatWing: '#e8ecf3' },
};
const PLUME_Y = [80 - 400, 250 - 400];          // gradient y1/y2 (svg 80 → 250) in rig space
const PLUME_STOPS = [[0, '#ffffff'], [0.55, '#f2f5f9'], [1, '#cdd6e3']];
const POUCH_STOPS = [[0, '#ffd3ab'], [1, '#ff8a3d']];
const WING_STOPS = [[0, '#ffffff'], [1, '#d9e0ea']];

// ------------------------------------------------------------------ the file
const HEADER = [
  '<!-- 代码美学 · Code Aesthetics',
  '     2020 年代 · 大模型时代',
  '     2020s · the LLM era',
  '     prompt: "Generate an SVG',
  '     of a pelican riding a',
  '     bicycle" -->',
];
// [row text template, element id or null, burst index]
function fileRows(M, off) {
  const X = (v) => v + off[0], Y = (v) => v + off[1];
  const f = (v) => String(Math.round(v * 100) / 100);
  const d = (shapes) => shapes.map((sh) => sh.segs.map((s) => {
    const ab = !!sh.abs;
    const x = (v) => f(ab ? v : X(v)), y = (v) => f(ab ? v : Y(v));
    switch (s[0]) {
      case 'M': return `M${x(s[1])} ${y(s[2])}`;
      case 'L': return `L${x(s[1])} ${y(s[2])}`;
      case 'H': return `H${x(s[1])}`;
      case 'Q': return `Q${x(s[1])} ${y(s[2])} ${x(s[3])} ${y(s[4])}`;
      case 'C': return s[7] ? `S${x(s[3])} ${y(s[4])} ${x(s[5])} ${y(s[6])}` : `C${x(s[1])} ${y(s[2])} ${x(s[3])} ${y(s[4])} ${x(s[5])} ${y(s[6])}`;
      case 'Z': return 'Z';
      default: return '';
    }
  }).join('')).join('');
  const circ = (id, sh, rest) => `<circle id="${id}" cx="${f(X(sh.c[0]))}" cy="${f(Y(sh.c[1]))}" r="${f(sh.r)}"${rest}/>`;
  const ell = (id, sh, rest) => {
    const cx = f(X(sh.c[0])), cy = f(Y(sh.c[1]));
    const rot = sh.rot ? ` transform="rotate(${f((sh.rot * 180) / Math.PI)} ${cx} ${cy})"` : '';
    return `<ellipse id="${id}" cx="${cx}" cy="${cy}" rx="${f(sh.rx)}" ry="${f(sh.ry)}"${rot}${rest}/>`;
  };
  const path = (id, rest) => `<path id="${id}" d="${d(M[id])}"${rest}/>`;
  const hubs = M.hubs[0].pts.map((pt) => `M${f(X(pt[0]))} ${f(Y(pt[1]))}h0`).join('');
  const rx = f(M['rim-use'][0].c[0] - M.rim[0].c[0]);
  return [
    ['<svg viewBox="0 0 450 450" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#2b3242" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">', null, 0],
    ['  ' + path('road', ''), 'road', 1],
    ['  ' + ell('shadow', M.shadow[0], ' fill="#2b3242" stroke="none" opacity=".3" filter="url(#soft)"'), 'shadow', 1],
    ['  <!-- 自行车 · bicycle -->', null, 2],
    ['  ' + path('far-leg', ' fill="#c97c58"'), 'far-leg', 2],
    ['  ' + path('crank-far', ' stroke-width="5"'), 'crank-far', 2],
    ['  ' + circ('rear', M.rear[0], ' stroke-width="8"'), 'rear', 3],
    ['  ' + circ('front', M.front[0], ' stroke-width="8"'), 'front', 3],
    ['  ' + path('spokes', ' stroke="#8a93a6" stroke-width="1"'), 'spokes', 3],
    ['  ' + `<path id="hubs" d="${hubs}" stroke-width="9"/>`, 'hubs', 3],
    ['  ' + circ('rim', M.rim[0], ' stroke="#ff8a3d" stroke-width="2"'), 'rim', 4],
    [`  <use href="#rim" x="${rx}"/>`, 'rim-use', 4],
    ['  ' + path('sheen', ' stroke="#6f7a94" stroke-width="1.8"'), 'sheen', 4],
    ['  ' + path('frame', ' stroke-width="6"'), 'frame', 4],
    ['  ' + path('steer', ' stroke-width="5"'), 'steer', 5],
    ['  ' + circ('ring', M.ring[0], ' stroke-width="3" stroke-dasharray="2 1.93" stroke-linecap="butt"'), 'ring', 5],
    ['  ' + path('chain', ' stroke="#59627a" stroke-width="1.6"'), 'chain', 5],
    ['  <!-- 鹈鹕 · pelican -->', null, 6],
    ['  ' + path('leg', ' fill="#f59466"'), 'leg', 6],
    ['  ' + path('crank', ' stroke-width="5"'), 'crank', 6],
    ['  ' + path('crest', ''), 'crest', 7],
    ['  <g id="plumage" fill="url(#plumeFill)" stroke-width="4.4">', null, 7],
    ['    ' + path('tail', ''), 'tail', 7],
    ['    ' + ell('body', M.body[0], ''), 'body', 7],
    ['    ' + path('neck', ''), 'neck', 8],
    ['    ' + circ('head', M.head[0], ''), 'head', 8],
    ['  </g>', null, 8],
    ['  <use href="#plumage" stroke="none"/>', 'use', 8],
    ['  ' + path('wing', ' fill="url(#wingFill)" filter="url(#lift)"'), 'wing', 9],
    ['  ' + path('coverts', ' stroke-width="1.3" opacity=".42"'), 'coverts', 9],
    ['  ' + path('quills', ' fill="#2b3242" stroke-width="1"'), 'quills', 9],
    ['  ' + path('pouch', ' fill="url(#pouchFill)"'), 'pouch', 10],
    ['  ' + path('gloss', ' stroke="#fff" stroke-width="3" opacity=".65"'), 'gloss', 10],
    ['  ' + path('bill', ' fill="#fbe1c2"'), 'bill', 10],
    ['  ' + path('ridge', ' stroke="#fff" stroke-width="1.6" opacity=".8"'), 'ridge', 10],
    ['  ' + path('nail', ' fill="#e9592f"'), 'nail', 10],
    ['  ' + ell('face', M.face[0], ' fill="#ffc4a0" stroke="none"'), 'face', 11],
    ['  ' + circ('eye', M.eye[0], ' fill="#fff" stroke-width="1"'), 'eye', 11],
    ['  ' + circ('pupil', M.pupil[0], ' fill="#1d2230" stroke="none"'), 'pupil', 11],
    ['  ' + circ('glint', M.glint[0], ' fill="#fff" stroke="none"'), 'glint', 11],
    ['  <defs>', null, 12],
    ['    <linearGradient id="plumeFill" gradientUnits="userSpaceOnUse" x1="0" y1="80" x2="0" y2="250"><stop stop-color="#fff"/><stop offset=".55" stop-color="#f2f5f9"/><stop offset="1" stop-color="#cdd6e3"/></linearGradient>', null, 12],
    ['    <linearGradient id="wingFill" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#d9e0ea"/></linearGradient>', null, 12],
    ['    <linearGradient id="pouchFill" x2="0" y2="1"><stop stop-color="#ffd3ab"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>', null, 12],
    ['    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>', null, 12],
    ['    <filter id="lift"><feDropShadow dy="2" stdDeviation="2.5" flood-color="#2b3242" flood-opacity=".2"/></filter>', null, 12],
    ['  </defs>', null, 12],
    ['</svg>', 'close', 12],
  ];
}
// burst windows (u): every element row completes on an 8th note
const BURSTS = [
  [0.50, 0.98], [1.28, 1.50], [1.54, 1.75], [1.79, 2.00], [2.04, 2.25], [2.29, 2.50], [2.54, 2.75],
  [2.79, 3.00], [3.04, 3.25], [3.29, 3.50], [3.54, 3.75], [3.78, 3.87], [3.88, 4.0],
];
const COMPLETE = 4.0;

// ------------------------------------------------------------------ syntax highlighting
function tokenize(rows) {
  let inComment = false;
  return rows.map((s) => {
    const out = [];
    const push = (t, c) => { if (t) out.push({ t, c }); };
    let i = 0;
    while (i < s.length) {
      if (inComment) {
        const j = s.indexOf('-->', i);
        if (j < 0) { push(s.slice(i), 'comment'); i = s.length; } else { push(s.slice(i, j + 3), 'comment'); i = j + 3; inComment = false; }
        continue;
      }
      if (s.startsWith('<!--', i)) { inComment = true; continue; }
      const ch = s[i];
      if (ch === ' ') { let j = i; while (j < s.length && s[j] === ' ') j++; push(s.slice(i, j), 'text'); i = j; continue; }
      if (ch === '<') {
        const close = s[i + 1] === '/';
        push(close ? '</' : '<', 'punct'); i += close ? 2 : 1;
        let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        push(s.slice(i, j), 'keyword'); i = j;
        continue;
      }
      if (s.startsWith('/>', i)) { push('/>', 'punct'); i += 2; continue; }
      if (ch === '>') { push('>', 'punct'); i++; continue; }
      if (ch === '=') { push('=', 'punct'); i++; continue; }
      if (ch === '"') {
        const j = s.indexOf('"', i + 1);
        const val = s.slice(i + 1, j);
        push('"', 'string');
        if (val.startsWith('#') || val.startsWith('url')) push(val, 'string');
        else for (const part of val.split(/(-?\d*\.?\d+)/)) if (part) push(part, /^-?\d*\.?\d+$/.test(part) ? 'number' : 'string');
        push('"', 'string');
        i = j + 1;
        continue;
      }
      let j = i; while (j < s.length && /[A-Za-z:-]/.test(s[j])) j++;
      if (j > i) { push(s.slice(i, j), 'attr'); i = j; continue; }
      push(ch, 'text'); i++;
    }
    return out;
  });
}

// ------------------------------------------------------------------ Canvas2D helpers
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function lgrad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function rgrad(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
const font = (size, weight = 400, fam = UI, style = 'normal') => `${style} ${weight} ${size}px ${fam}`;
function txt(c, s, x, y, size, col, o = {}) {
  c.font = font(size, o.weight || 400, o.fam || UI, o.style || 'normal');
  c.fillStyle = col;
  c.textAlign = o.align || 'left';
  c.textBaseline = o.base || 'middle';
  c.fillText(s, x, y);
  c.textAlign = 'left';
}

function trace(c, sh) {
  c.beginPath();
  if (sh.k === 'circle') { c.moveTo(sh.c[0] + sh.r, sh.c[1]); c.arc(sh.c[0], sh.c[1], sh.r, 0, TAU); return; }
  if (sh.k === 'ellipse') { c.ellipse(sh.c[0], sh.c[1], sh.rx, sh.ry, sh.rot, 0, TAU); return; }
  if (sh.k === 'dots') { for (const pt of sh.pts) { c.moveTo(pt[0] + sh.r, pt[1]); c.arc(pt[0], pt[1], sh.r, 0, TAU); } return; }
  let cx = 0, cy = 0;
  for (const s of sh.segs) {
    switch (s[0]) {
      case 'M': c.moveTo(s[1], s[2]); cx = s[1]; cy = s[2]; break;
      case 'L': c.lineTo(s[1], s[2]); cx = s[1]; cy = s[2]; break;
      case 'H': c.lineTo(s[1], cy); cx = s[1]; break;
      case 'Q': c.quadraticCurveTo(s[1], s[2], s[3], s[4]); cx = s[3]; cy = s[4]; break;
      case 'C': c.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]); cx = s[5]; cy = s[6]; break;
      case 'Z': c.closePath(); break;
      default: break;
    }
  }
}

/** Polyline sampling of a shape: list of subpaths (arrays of points) and their total length. */
function sample(sh) {
  const subs = [];
  if (sh.k === 'circle' || sh.k === 'ellipse') {
    const rx = sh.k === 'circle' ? sh.r : sh.rx, ry = sh.k === 'circle' ? sh.r : sh.ry, rot = sh.rot || 0;
    const pts = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU; const v = rotp([rx * Math.cos(a), ry * Math.sin(a)], rot); pts.push([sh.c[0] + v[0], sh.c[1] + v[1]]); }
    subs.push(pts);
  } else if (sh.k === 'dots') {
    for (const pt of sh.pts) { const pts = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * TAU; pts.push([pt[0] + sh.r * Math.cos(a), pt[1] + sh.r * Math.sin(a)]); } subs.push(pts); }
  } else {
    let cur = null, start = null;
    for (const s of sh.segs) {
      const last = cur ? cur[cur.length - 1] : null;
      switch (s[0]) {
        case 'M': cur = [[s[1], s[2]]]; start = cur[0]; subs.push(cur); break;
        case 'L': cur.push([s[1], s[2]]); break;
        case 'H': cur.push([s[1], last[1]]); break;
        case 'Q': for (let k = 1; k <= 10; k++) { const t = k / 10, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; cur.push([a * last[0] + b * s[1] + d * s[3], a * last[1] + b * s[2] + d * s[4]]); } break;
        case 'C': for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; cur.push([u * u * u * last[0] + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5], u * u * u * last[1] + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6]]); } break;
        case 'Z': cur.push([start[0], start[1]]); break;
        default: break;
      }
    }
  }
  let L = 0;
  for (const pts of subs) for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { subs, L };
}
/** Stroke the first fraction p of the sampled shapes (in order); returns the pen point. */
function strokePartial(c, samples, p) {
  const total = samples.reduce((a, s) => a + s.L, 0);
  let left = p * total, pen = null;
  for (const smp of samples) {
    for (const pts of smp.subs) {
      if (left <= 0) return pen;
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); pen = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L >= left) { const t = left / (L || 1); pen = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; c.lineTo(pen[0], pen[1]); left = 0; break; }
        c.lineTo(b[0], b[1]); pen = b; left -= L;
      }
      c.stroke();
    }
  }
  return pen;
}

// ------------------------------------------------------------------ the scene
export default {
  freezeU: 5.5,
  ride: RIDE,
  cues: [
    { u: -3.0, name: 'thinking' },
    { u: 0.5, name: 'streamStart' }, { u: 1.0, name: 'dissolve' }, { u: 1.5, name: 'tick' },
    { u: 2.0, name: 'tick' }, { u: 2.5, name: 'tick' }, { u: 3.0, name: 'tick' }, { u: 3.5, name: 'tick' },
    { u: 4.0, name: 'complete' }, { u: 4.5, name: 'toast' }, { u: 5.0, name: 'rest' },
  ],

  async init(K, info) {
    this.index = info?.index ?? 19;
    // the rest pose → the file
    const wx = panelLeft(this.index) + X_REST;
    const crank = (2 * Math.PI * wx) / CRANK_DIST;
    const P = rigPose({ crank, wheel: wx / WHEEL_R, t: 0, v: 0 }, {});
    P.crank2 = crank;
    this.restModel = buildModel(P, false);
    const off = [X_REST - SPLIT, 400];
    const body = fileRows(this.restModel, off);
    const rows = HEADER.map((t) => ({ text: t, el: null, burst: -1 })).concat(body.map(([text, el, burst]) => ({ text, el, burst })));
    const toks = tokenize(rows.map((r) => r.text));
    // token x offsets (units) measured at FONT px with a 1:1 context
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = font(FONT, 400, MONO);
    const measI = document.createElement('canvas').getContext('2d');
    measI.font = font(FONT, 400, MONO, 'italic');
    rows.forEach((r, i) => {
      let x = 0;
      r.tokens = toks[i].map((tk) => { const m = tk.c === 'comment' ? measI : meas; const w = m.measureText(tk.t).width; const o = { ...tk, x, w }; x += w; return o; });
      r.len = r.text.length;
      r.width = x;
      // where the drawing data starts/ends inside the row (stroke progress follows the d / attribute stream)
      const dk = r.text.indexOf(' d="');
      r.d0 = dk >= 0 ? dk + 4 : r.text.indexOf('<') + 1;
      r.d1 = dk >= 0 ? r.text.indexOf('"', r.d0) : r.len;
    });
    // typing schedule: rows of each burst share its window in proportion to their length
    for (let b = 0; b < BURSTS.length; b++) {
      const list = rows.filter((r) => r.burst === b);
      const total = list.reduce((a, r) => a + r.len, 0);
      let acc = 0;
      const [t0, t1] = BURSTS[b];
      for (const r of list) { r.t0 = t0 + ((t1 - t0) * acc) / total; acc += r.len; r.t1 = t0 + ((t1 - t0) * acc) / total; }
    }
    rows.forEach((r, i) => { r.index = i; if (r.burst < 0) { r.t0 = -1e9; r.t1 = -1e9; } });
    this.rows = rows;
    this.kb = (new TextEncoder().encode(rows.map((r) => r.text).join('\n') + '\n').length / 1024).toFixed(1);
    this.rowOf = {};
    rows.forEach((r) => { if (r.el) this.rowOf[r.el] = r; });
    this.measC = meas;
    this.measI = measI;
    // live canvases
    this.g = createGraphics(1100, 1100); this.g.pixelDensity(1);
    this.rc = document.createElement('canvas'); this.rc.width = 520; this.rc.height = 460;
  },

  dispose() {
    try { this.g?.remove(); } catch {}
    this.g = null; this.rc = null;
  },

  path(u, base) {
    if (u <= 1) return base;
    return { ...base, x: xDrawn(u) };
  },

  // ---------------------------------------------------------------- typing state
  typed(r, u) {
    if (r.burst < 0) return r.len;
    if (u <= r.t0) return 0;
    if (u >= r.t1) return r.len;
    return Math.floor(r.len * (u - r.t0) / (r.t1 - r.t0));
  },
  /** Fractional cursor row (index of the row being typed + progress). */
  cursorRow(u) {
    let last = HEADER.length - 1, f = 1;
    for (const r of this.rows) {
      if (r.burst < 0) continue;
      if (u > r.t0) { last = r.index; f = clamp((u - r.t0) / (r.t1 - r.t0)); }
    }
    return { row: last, f, idle: u < BURSTS[0][0] };
  },
  scrollTarget(u) {
    const cr = this.cursorRow(u);
    const pos = cr.idle ? HEADER.length : cr.row + cr.f;
    const tw = Math.max(0, pos - TW_ROW);
    const fin = Math.max(0, this.rows.length - VIS_ROWS);
    return lerp(tw, fin, smootherstep(4.1, 4.7, u));
  },
  scroll(u) {
    // a short backward average = an eased, deterministic follow
    let s = 0, ws = 0;
    for (let k = 0; k < 8; k++) { const w = 1 - k / 8; s += w * this.scrollTarget(u - k * 0.025); ws += w; }
    return s / ws;
  },

  // ---------------------------------------------------------------- picture
  render(K, u, ctx) {
    const v = ctx.view;
    const rx0 = Math.max(0, v.x0), rx1 = Math.min(1000, v.x1), ry0 = Math.max(0, v.y0), ry1 = Math.min(1000, v.y1);
    if (rx1 <= rx0 || ry1 <= ry0) return;
    const G = this.g;
    let S = ctx.pxu;
    let ox = v.x0 + Math.floor((rx0 - v.x0) * S) / S, oy = v.y0 + Math.floor((ry0 - v.y0) * S) / S;
    if ((rx1 - ox) * S > G.width - 2 || (ry1 - oy) * S > G.height - 2) {
      S = Math.min((G.width - 2) / (rx1 - rx0), (G.height - 2) / (ry1 - ry0));
      ox = rx0; oy = ry0;
    }
    const pw = Math.min(G.width, Math.ceil((rx1 - ox) * S) + 1), ph = Math.min(G.height, Math.ceil((ry1 - oy) * S) + 1);
    const c = G.drawingContext;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
    c.clearRect(0, 0, pw + 2, ph + 2);
    c.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    this.S = S; this.ox = ox; this.oy = oy;
    c.lineCap = 'round'; c.lineJoin = 'round';

    this.paintChrome(c, u);
    this.paintCode(c, u);
    this.paintBottom(c, u);
    this.paintPreview(c, u);
    // the rider
    const R = this.riderNow(ctx, u);
    if (R.visible) this.paintRider(c, u, R, ctx);
    this.paintToast(c, u);

    push();
    imageMode(CORNER); noTint();
    image(G, ox, oy, pw / S, ph / S, 0, 0, pw, ph);
    pop();
  },

  riderNow(ctx, u) {
    if (u <= 1) {
      const R = ctx.rider;
      const P = R.pose;
      P.crank2 = R.state.crank;
      return { P, xb: R.place.x, visible: R.visible, exact: true };
    }
    const xb = xDrawn(u);
    const wx = panelLeft(ctx.i) + xb;
    const crank = (2 * Math.PI * wx) / CRANK_DIST;
    const P = rigPose({ crank, wheel: wx / WHEEL_R, t: ctx.t, v: 0 }, {});
    P.crank2 = crank;
    return { P, xb, visible: true, exact: u < BRAKE[1] };
  },

  // ---------------------------------------------------------------- window chrome
  paintChrome(c, u) {
    // editor + gutter backgrounds
    c.fillStyle = C.bg; c.fillRect(0, 0, 1000, 1000);
    c.fillStyle = C.gutter; c.fillRect(0, TABS, GUT, ROAD - TABS);
    // title bar
    c.fillStyle = C.chrome; c.fillRect(0, 0, 1000, TB);
    c.fillStyle = '#1d212b'; c.fillRect(0, TB - 1, 1000, 1);
    for (let k = 0; k < 3; k++) { c.fillStyle = '#353a46'; circ(c, 30 + k * 23, TB / 2 + 1, 6.5); c.fill(); }
    // title: file — workspace (the panel's title)
    {
      c.font = font(27, 500); const a = 'pelican.svg', sep = '  —  ', t = '代码美学 · 2020 年代 · 大模型时代';
      const wa = c.measureText(a).width, ws = c.measureText(sep).width, wt = c.measureText(t).width;
      const x0 = 500 - (wa + ws + wt) / 2, y = TB / 2 + 2;
      txt(c, a, x0, y, 27, '#8d94a5', { weight: 500 });
      txt(c, sep, x0 + wa, y, 27, '#4d5363', { weight: 500 });
      txt(c, t, x0 + wa + ws, y, 27, '#d3d8e2', { weight: 500 });
    }
    // tab bar
    c.fillStyle = C.tabs; c.fillRect(0, TB, 1000, TABS - TB);
    c.fillStyle = '#0b0d12'; c.fillRect(0, TABS - 1, 1000, 1);
    const streaming = u >= BURSTS[0][0] && u < COMPLETE + 0.05;
    const tab = (x0, w, label, active, icon, dirty) => {
      if (active) { c.fillStyle = C.bg; c.fillRect(x0, TB, w, TABS - TB); c.fillStyle = C.accent; c.fillRect(x0, TB, w, 2); }
      c.fillStyle = '#0b0d12'; c.fillRect(x0 + w - 1, TB + 8, 1, TABS - TB - 16);
      if (icon === 'svg') {
        c.strokeStyle = active ? C.accent : '#6b7385'; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(x0 + 22, TB + 22); c.lineTo(x0 + 16, TB + 28); c.lineTo(x0 + 22, TB + 34);
        c.moveTo(x0 + 30, TB + 22); c.lineTo(x0 + 36, TB + 28); c.lineTo(x0 + 30, TB + 34); c.stroke();
      } else if (icon === 'eye') {
        c.strokeStyle = active ? '#89ddff' : '#6b7385'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(x0 + 26, TB + 28, 10, 6, 0, 0, TAU); c.stroke(); circ(c, x0 + 26, TB + 28, 2.6); c.fillStyle = c.strokeStyle; c.fill();
      } else if (icon === 'md') {
        c.fillStyle = '#6b7385'; c.font = font(15, 700, MONO); c.textBaseline = 'middle'; c.fillText('M↓', x0 + 13, TB + 29);
      }
      txt(c, label, x0 + 46, TB + 23, 21, active ? '#e2e5eb' : '#7c8394', { weight: active ? 500 : 400 });
      if (dirty != null) {
        if (dirty) { c.fillStyle = '#c8ccd4'; circ(c, x0 + w - 22, TB + 23, 4.5); c.fill(); }
        else { c.strokeStyle = '#6b7385'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x0 + w - 27, TB + 18); c.lineTo(x0 + w - 17, TB + 28); c.moveTo(x0 + w - 17, TB + 18); c.lineTo(x0 + w - 27, TB + 28); c.stroke(); }
      }
    };
    tab(0, 196, 'pelican.svg', true, 'svg', streaming);
    tab(196, 160, 'prompt.md', false, 'md', null);
    tab(SPLIT, 250, '预览 pelican.svg', true, 'eye', null);
    // pane divider
    c.fillStyle = '#0b0d12'; c.fillRect(SPLIT - 1.5, TB, 3, STAT - TB);
  },

  // ---------------------------------------------------------------- code pane
  paintCode(c, u) {
    const top = this.scroll(u);
    const first = Math.max(0, Math.floor(top)), last = Math.min(this.rows.length - 1, Math.ceil(top + VIS_ROWS));
    const yOf = (i) => CODE_Y0 + (i - top) * LH;
    const cr = this.cursorRow(u);
    const streaming = u >= BURSTS[0][0] && u < COMPLETE;
    const curRow = cr.idle ? HEADER.length : cr.row;
    c.save();
    c.beginPath(); c.rect(0, TABS, SPLIT - 1.5, ROAD - TABS); c.clip();
    // current-line band
    if (curRow >= first - 1 && curRow <= last + 1) { c.fillStyle = '#1a1e28'; c.fillRect(GUT, yOf(curRow), SPLIT - GUT, LH); }
    // burst highlight: the rows of the element being written glow faintly in the accent colour
    for (let i = first; i <= last; i++) {
      const r = this.rows[i];
      if (r.burst < 1) continue;
      const a = smoothstep(r.t0 - 0.03, r.t0, u) * (1 - smoothstep(r.t1 + 0.05, r.t1 + 0.45, u));
      if (a > 0.003) { c.fillStyle = `rgba(255,138,61,${(0.075 * a).toFixed(4)})`; c.fillRect(GUT, yOf(i), SPLIT - GUT, LH); }
    }
    // gutter: line numbers + "added" markers
    for (let i = first; i <= last; i++) {
      const r = this.rows[i], y = yOf(i);
      const n = this.typed(r, u);
      const exists = r.burst < 0 || n > 0 || (u > r.t0 && r.len === 0);
      if (!exists && i > curRow) continue;
      txt(c, String(i + 1), GUT - 12, y + LH / 2 + 1, 18, i === curRow ? '#c8ccd4' : C.lineNo, { fam: MONO, align: 'right' });
      if (r.burst >= 0 && n > 0) { c.fillStyle = 'rgba(127,216,143,0.55)'; c.fillRect(GUT - 5, y + 3, 3, LH - 6); }
    }
    // text
    c.textBaseline = 'alphabetic';
    let cursor = null;
    for (let i = first; i <= last; i++) {
      const r = this.rows[i], y = yOf(i) + 22;
      const n = this.typed(r, u);
      if (n <= 0) { if (i === curRow && !cr.idle) cursor = [TX, y]; continue; }
      let left = n, x = TX;
      for (const tk of r.tokens) {
        if (left <= 0) break;
        const xx = TX + tk.x;
        if (xx > SPLIT) { left = 0; x = Infinity; break; }
        c.font = font(FONT, 400, MONO, tk.c === 'comment' ? 'italic' : 'normal');
        c.fillStyle = C[tk.c] || C.text;
        if (left >= tk.t.length) { c.fillText(tk.t, xx, y); x = xx + tk.w; left -= tk.t.length; }
        else { const part = tk.t.slice(0, left); c.fillText(part, xx, y); x = xx + (tk.c === 'comment' ? this.measI : this.measC).measureText(part).width; left = 0; }
      }
      if (i === curRow && !cr.idle) cursor = [x, y];
    }
    // cursor: solid while streaming, blinking (on the beats) when idle
    if (cr.idle) cursor = [TX, yOf(HEADER.length) + 22];
    if (u >= COMPLETE) { const r = this.rows[this.rows.length - 1]; cursor = [TX + r.width, yOf(this.rows.length - 1) + 22]; }
    const blinkOn = streaming || ((u % 1) + 1) % 1 >= 0.5;
    if (cursor && blinkOn && cursor[0] < SPLIT - 6) {
      c.fillStyle = streaming ? C.accent : '#e8eaf0';
      c.fillRect(cursor[0] + 1, cursor[1] - 19, 2.6, 25);
    }
    c.restore();
    // scrollbar thumbs (vertical + horizontal: the long rows run past the pane)
    const total = Math.max(this.rows.length, VIS_ROWS + 0.0001);
    const vis = Math.min(1, VIS_ROWS / Math.max(VIS_ROWS, cr.idle ? HEADER.length + 1 : curRow + 1 + Math.max(0, VIS_ROWS - TW_ROW - 1)));
    if (top > 0.01) {
      const h = (ROAD - TABS) * clamp(VIS_ROWS / (top + VIS_ROWS), 0.15, 1);
      const y = TABS + (ROAD - TABS - h) * clamp(top / Math.max(1, total - VIS_ROWS));
      c.fillStyle = 'rgba(160,170,195,0.16)'; rrect(c, SPLIT - 12, y + 2, 7, h - 4, 3.5); c.fill();
    }
    if (u >= BURSTS[0][0]) { c.fillStyle = 'rgba(160,170,195,0.12)'; rrect(c, GUT + 6, ROAD - 9, 150, 5, 2.5); c.fill(); }
    void vis;
  },

  // ---------------------------------------------------------------- bottom panel + status bar
  paintBottom(c, u) {
    // bottom panel (left): header strip = the road on the code side
    c.fillStyle = C.gutter; c.fillRect(0, ROAD, SPLIT - 1.5, BAR1 - ROAD);
    c.fillStyle = '#2c3242'; c.fillRect(0, ROAD, SPLIT - 1.5, 1.6);
    c.fillStyle = '#12151c'; c.fillRect(0, BAR1, SPLIT - 1.5, STAT - BAR1);
    const tabs = [['终端', true], ['输出', false], ['问题', false]];
    let x = 24;
    for (const [t, on] of tabs) {
      txt(c, t, x, ROAD + 18, 17, on ? '#d7dae0' : '#6b7385', { weight: on ? 500 : 400 });
      if (on) { c.fillStyle = C.accent; c.fillRect(x - 2, BAR1 - 3, 40, 2); }
      x += 66;
    }
    // agent log
    const y1 = BAR1 + 28, y2 = BAR1 + 60, y3 = BAR1 + 92;
    txt(c, '❯', 24, y1, 18, C.string, { fam: MONO });
    txt(c, 'agent --prompt prompt.md', 48, y1, 18, '#aab1c0', { fam: MONO });
    const spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    if (u < BURSTS[0][0]) {
      const f = spin[Math.floor(((u % 10) + 10) % 10 * 10) % spin.length];
      txt(c, f, 24, y2, 18, C.keyword, { fam: MONO });
      txt(c, '思考中 · thinking', 48, y2, 18, '#8d94a5');
    } else if (u < COMPLETE) {
      const f = spin[Math.floor(u * 12) % spin.length];
      const cr = this.cursorRow(u);
      txt(c, f, 24, y2, 18, C.accent, { fam: MONO });
      txt(c, `正在写入 pelican.svg · ${cr.row + 1}/${this.rows.length} 行`, 48, y2, 18, '#c3c8d2');
      const tps = 180 + 40 * Math.sin(u * 7.3) + 25 * Math.sin(u * 17.1);
      txt(c, `${Math.round(tps)} tok/s`, 48, y3, 17, '#6b7385', { fam: MONO });
    } else {
      txt(c, '✓', 24, y2, 18, C.ok, { fam: MONO });
      txt(c, `已写入 pelican.svg · ${this.rows.length} 行 · ${this.kb} KB`, 48, y2, 18, '#c3c8d2');
      txt(c, '❯', 24, y3, 18, C.string, { fam: MONO });
    }
    // status bar
    c.fillStyle = '#181b24'; c.fillRect(0, STAT, 1000, 1000 - STAT);
    c.fillStyle = '#0b0d12'; c.fillRect(0, STAT, 1000, 1);
    txt(c, '⎇ main', 24, STAT + 21, 16, '#8d94a5');
    txt(c, '⊘ 0   ⚠ 0', 112, STAT + 21, 16, '#8d94a5');
    const cr = this.cursorRow(u);
    const row = u >= COMPLETE ? this.rows.length : cr.idle ? HEADER.length + 1 : cr.row + 1;
    const col = u >= COMPLETE ? 7 : cr.idle ? 1 : Math.max(1, this.typed(this.rows[cr.row], u) + 1);
    txt(c, `行 ${row}，列 ${col}    UTF-8    SVG`, 976, STAT + 21, 16, '#8d94a5', { align: 'right' });
    txt(c, '✦ 鹈鹕助手', 560, STAT + 21, 16, u >= BURSTS[0][0] && u < COMPLETE ? C.accent : '#8d94a5');
  },

  // ---------------------------------------------------------------- preview pane
  paintPreview(c, u) {
    const x0 = SPLIT + 1.5;
    // toolbar
    c.fillStyle = '#161920'; c.fillRect(x0, TABS, 1000 - x0, PV_TOOL - TABS);
    c.fillStyle = '#0b0d12'; c.fillRect(x0, PV_TOOL - 1, 1000 - x0, 1);
    txt(c, '100%', x0 + 18, (TABS + PV_TOOL) / 2, 16, '#8d94a5', { fam: MONO });
    txt(c, '450 × 450', x0 + 82, (TABS + PV_TOOL) / 2, 16, '#6b7385', { fam: MONO });
    {
      const y = (TABS + PV_TOOL) / 2;
      if (u < BURSTS[0][0]) txt(c, '等待中', 980, y, 16, '#6b7385', { align: 'right' });
      else if (u < COMPLETE) {
        const pulse = 0.55 + 0.45 * Math.cos(((u * 2) % 1) * TAU);
        c.fillStyle = `rgba(255,138,61,${pulse.toFixed(3)})`; circ(c, 868, y, 4.5); c.fill();
        txt(c, '流式渲染', 980, y, 16, '#d7b39a', { align: 'right' });
      } else { txt(c, '✓ 已渲染', 980, y, 16, C.ok, { align: 'right' }); }
    }
    // canvas
    c.fillStyle = lgrad(c, 0, PV_TOOL, 0, STAT, [[0, '#eef0f3'], [0.6, '#e9ebef'], [1, '#e2e5ea']]);
    c.fillRect(x0, PV_TOOL, 1000 - x0, STAT - PV_TOOL);
    c.fillStyle = rgrad(c, 775, 640, 0, 330, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(x0, PV_TOOL, 1000 - x0, STAT - PV_TOOL);
    // empty state
    const ea = 1 - smoothstep(0.5, 0.75, u);
    if (ea > 0.003) {
      c.globalAlpha = ea;
      c.strokeStyle = '#b9bfcb'; c.lineWidth = 1.6; c.setLineDash([6, 5]);
      rrect(c, 700, 470, 150, 120, 10); c.stroke(); c.setLineDash([]);
      txt(c, '</>', 775, 530, 30, '#b4bac6', { fam: MONO, align: 'center' });
      txt(c, 'pelican.svg 尚无内容', 775, 622, 18, '#8f96a4', { align: 'center' });
      c.globalAlpha = 1;
    }
    // the road (the first element of the drawing)
    const rr = this.rowOf.road;
    const pr = u >= COMPLETE ? 1 : clamp((this.typed(rr, u) - rr.d0) / (rr.d1 - rr.d0));
    if (pr > 0) {
      c.strokeStyle = pr < 1 && u < rr.t1 + 0.25 ? C.accent : C.slate;
      c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(VB[0] + 1, ROAD); c.lineTo(VB[0] + 1 + (450 - 2) * pr, ROAD); c.stroke();
    }
  },

  // ---------------------------------------------------------------- the rider
  paintRider(c, u, R, ctx) {
    const exact = R.exact;
    const M = buildModel(R.P, exact);
    const xb = R.xb;
    const S = this.S;
    // pixel-aligned rider box in panel units
    const bx0 = this.ox + Math.floor((xb - 200 - this.ox) * S) / S, by0 = this.oy + Math.floor((450 - this.oy) * S) / S;
    const rw = Math.min(this.rc.width, Math.ceil(420 * S)), rh = Math.min(this.rc.height, Math.ceil(380 * S));
    const rc = this.rc.getContext('2d');
    const begin = () => {
      rc.setTransform(1, 0, 0, 1, 0, 0);
      rc.globalAlpha = 1; rc.globalCompositeOperation = 'source-over'; rc.filter = 'none';
      rc.clearRect(0, 0, rw + 2, rh + 2);
      rc.setTransform(S, 0, 0, S, -bx0 * S, -by0 * S);
      rc.lineCap = 'round'; rc.lineJoin = 'round';
    };
    const blit = (a) => {
      if (a <= 0.002) return;
      c.save(); c.globalAlpha = a;
      c.setTransform(1, 0, 0, 1, Math.round((bx0 - this.ox) * S), Math.round((by0 - this.oy) * S));
      c.drawImage(this.rc, 0, 0, rw, rh, 0, 0, rw, rh);
      c.restore();
    };
    const sides = (fn) => {
      for (const side of ['dark', 'light']) {
        rc.save();
        rc.beginPath();
        if (side === 'dark') rc.rect(-400, 0, SPLIT - 1.5 + 400, ROAD + 0.5);
        else rc.rect(SPLIT + 1.5, PV_TOOL, 1000, STAT - PV_TOOL);
        rc.clip();
        rc.translate(xb, ROAD);
        fn(rc, PAL[side], side);
        rc.restore();
      }
    };
    const fullA = u < 1.5 ? 1 - smoothstep(1.0, 1.4, u) : smoothstep(COMPLETE, COMPLETE + 0.22, u);
    const progA = u < 1.0 ? 0 : 1;
    // 1. progressive drawing (ghosts, pen strokes, flat fills)
    if (progA > 0 && u < COMPLETE + 0.3) {
      begin();
      const ghostA = smoothstep(1.05, 1.45, u) * (1 - smoothstep(COMPLETE, COMPLETE + 0.2, u));
      sides((g, pal, side) => this.paintProgressive(g, u, M, pal, side, ghostA));
      blit(1);
    }
    // 2. the full render (before the dissolve and after </svg>)
    if (fullA > 0.002) {
      begin();
      sides((g, pal, side) => this.paintFull(g, M, pal, side));
      blit(fullA);
    }
    void ctx;
  },

  /** Fill style for a style key (full render). */
  fillOf(g, key, sh, pal, flat) {
    if (key === 'plume') return flat ? pal.flatPlume : lgrad(g, 0, PLUME_Y[0], 0, PLUME_Y[1], PLUME_STOPS);
    if (key === 'quill') return pal.quill;
    if (key === 'pouchG' || key === 'wingG') {
      if (flat) return key === 'pouchG' ? pal.flatPouch : pal.flatWing;
      let y0 = 1e9, y1 = -1e9;
      for (const s of sample(sh).subs) for (const pt of s) { if (pt[1] < y0) y0 = pt[1]; if (pt[1] > y1) y1 = pt[1]; }
      return lgrad(g, 0, y0, 0, y1, key === 'pouchG' ? POUCH_STOPS : WING_STOPS);
    }
    return key;
  },
  strokeOf(key, pal) { return key === 'ink' ? pal.ink : key === 'spoke' ? pal.spoke : key === 'chain' ? pal.chain : key === 'quill' ? pal.quill : key === 'sheen' ? pal.sheen : key; },

  /** The full SVG render (painter's order, exactly as the file describes it). */
  paintFull(g, M, pal, side) {
    const order = this.rows.filter((r) => r.el && r.el !== 'close').map((r) => r.el);
    const union = [];
    for (const id of order) {
      if (id === 'use') {
        // the <use> repaints the plumage fills without strokes → one clean silhouette outline
        for (const uid of union) for (const sh of M[uid]) { trace(g, sh); g.fillStyle = this.fillOf(g, 'plume', sh, pal, false); g.fill(); }
        continue;
      }
      if (id === 'road') continue;
      const st = ST[id];
      if (id === 'shadow') {
        if (side === 'dark') continue;
        const sh = M.shadow[0];
        g.save();
        g.filter = `blur(${(6 * this.S).toFixed(2)}px)`;
        g.globalAlpha = 0.3; g.fillStyle = C.slate; trace(g, sh); g.fill();
        g.restore();
        continue;
      }
      if (st.union) union.push(id);
      for (const sh of M[id]) this.paintShape(g, sh, st, pal, 1, null);
    }
  },

  paintShape(g, sh, st, pal, fillA, strokeCol, flat = false) {
    if (st.dots) { g.fillStyle = strokeCol || this.strokeOf(st.dots, pal); trace(g, sh); g.fill(); return; }
    if (st.fill && fillA > 0) {
      trace(g, sh);
      g.globalAlpha = fillA;
      g.fillStyle = this.fillOf(g, st.fill, sh, pal, flat);
      if (st.lift && !flat) {
        // feDropShadow dy=2 σ=2.5 (#2b3242 at .2): canvas shadowBlur ≈ 2σ, in device pixels
        g.save();
        g.shadowColor = 'rgba(43,50,66,0.2)'; g.shadowBlur = 5 * this.S; g.shadowOffsetY = 2 * this.S;
        g.fill();
        g.restore();
      } else g.fill();
      g.globalAlpha = 1;
    }
    if (st.stroke) {
      trace(g, sh);
      g.globalAlpha = st.alpha ?? 1;
      g.strokeStyle = strokeCol || this.strokeOf(st.stroke, pal);
      g.lineWidth = st.w;
      if (st.dash) { g.lineCap = 'butt'; g.setLineDash(st.dash); }
      g.stroke();
      if (st.dash) { g.lineCap = 'round'; g.setLineDash([]); }
      g.globalAlpha = 1;
    }
  },

  /** Streaming preview: ghosts for what is not written yet, the pen on the row being written, flat fills. */
  paintProgressive(g, u, M, pal, side, ghostA) {
    const order = this.rows.filter((r) => r.el && r.el !== 'close' && r.el !== 'road');
    const union = [];
    const pens = [];
    const accent = C.accent;
    for (const r of order) {
      const id = r.el;
      const n = this.typed(r, u);
      if (id === 'use') { if (n >= r.len) for (const uid of union) for (const sh of M[uid]) { trace(g, sh); g.fillStyle = pal.flatPlume; g.fill(); } continue; }
      if (id === 'shadow') continue;
      const st = ST[id];
      if (st.union) union.push(id);
      const p = clamp((n - r.d0) / Math.max(1, r.d1 - r.d0));
      if (p <= 0) continue;
      if (p < 1) {
        // the pen draws along the path while its data streams in
        g.strokeStyle = accent; g.lineWidth = Math.max(2, Math.min(st.w || 2.2, 6));
        const pen = strokePartial(g, M[id].map(sample), p);
        if (pen) pens.push(pen);
        continue;
      }
      const age = u - r.t1;
      const fa = smoothstep(0.02, 0.18, age);
      const k = smoothstep(0.0, 0.3, age);
      const ink = this.strokeOf(st.stroke || st.dots || 'ink', pal);
      const col = k >= 1 ? ink : mixHex(accent, ink, k);
      for (const sh of M[id]) this.paintShape(g, sh, st, pal, fa, col, true);
    }
    // ghosts of everything not written yet (dashed wireframe), on top: they are guides
    if (ghostA > 0.003) {
      g.save();
      g.globalAlpha = ghostA; g.strokeStyle = pal.ghost; g.lineWidth = 1.3; g.setLineDash([5, 4]);
      for (const r of order) {
        if (r.el === 'use') continue;
        const n = this.typed(r, u);
        if (n > r.d0) continue;
        for (const sh of M[r.el]) { if (sh.k === 'dots') continue; trace(g, sh); g.stroke(); }
      }
      g.setLineDash([]);
      g.restore();
    }
    for (const pen of pens) {
      g.fillStyle = rgrad(g, pen[0], pen[1], 0, 12, [[0, 'rgba(255,170,110,0.7)'], [1, 'rgba(255,138,61,0)']]);
      circ(g, pen[0], pen[1], 12); g.fill();
      g.fillStyle = '#fff4ea'; circ(g, pen[0], pen[1], 2.6); g.fill();
    }
  },

  // ---------------------------------------------------------------- toast
  paintToast(c, u) {
    if (u < 4.5) return;
    const k = easeOutBack(clamp((u - 4.5) / 0.32), 1.6);
    const a = smoothstep(4.5, 4.62, u);
    const w = 392, h = 62, x = 982 - w + 40 * (1 - k), y = 878;
    c.save();
    c.globalAlpha = a;
    c.shadowColor = 'rgba(20,24,34,0.35)'; c.shadowBlur = 18 * this.S; c.shadowOffsetY = 6 * this.S;
    c.fillStyle = '#232835'; rrect(c, x, y, w, h, 9); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = '#343b4c'; c.lineWidth = 1.2; rrect(c, x + 0.6, y + 0.6, w - 1.2, h - 1.2, 8.5); c.stroke();
    c.fillStyle = C.ok; circ(c, x + 30, y + h / 2, 12); c.fill();
    c.strokeStyle = '#1b2a1f'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(x + 24, y + h / 2); c.lineTo(x + 28.5, y + h / 2 + 4.5); c.lineTo(x + 36, y + h / 2 - 4.5); c.stroke();
    txt(c, '渲染完成', x + 54, y + h / 2 - 1, 22, '#e6e9ef', { weight: 500 });
    txt(c, '· rendered in 0.6 s', x + 146, y + h / 2, 18, '#9aa1b1', { fam: MONO });
    c.restore();
  },
};

/** Mix two #rrggbb colours. */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
