// Default "pen line" rendering of the placed rig (book-plate / neutral style).
// Styles in scenes can copy this structure and swap the technique.
import { brush } from '../kit/brush.js';
import { seed } from '../kit/seed.js';

const PALETTE = {
  body: '#fbfaf4', bill: '#efcf98', pouch: '#f2a640', leg: '#ef9a6e', face: '#f4c7a6',
  bike: '#b3352b', tire: '#2a2624', dark: '#24201d',
};

/**
 * Draw a placed pose P (from rig.placed) with pen strokes and flat washes.
 * opts: { ink, weight, brushName, color (bool), palette, key, far (draw far leg) }
 */
export function drawPen(P, opts = {}) {
  const ink = opts.ink ?? '#1e1a17';
  const W = opts.weight ?? 1;
  const bn = opts.brushName ?? 'HB';
  const key = opts.key ?? 'pen';
  const pal = { ...PALETTE, ...(opts.palette || {}) };
  const col = opts.color !== false;
  const s = P.place?.scale ?? 1;

  const S = (part) => seed(key, part);
  const line = (pts, part, w = W, c = ink, b = bn) => {
    S(part); brush.noFill(); brush.noWash(); brush.set(b, c, w);
    brush.spline(pts, 0);
  };
  const seg = (a, b, part, w = W, c = ink, bnm = bn) => {
    S(part); brush.noFill(); brush.noWash(); brush.set(bnm, c, w);
    brush.line(a[0], a[1], b[0], b[1]);
  };
  const shape = (pts, part, fillC, w = W, c = ink) => {
    S(part + ':f');
    if (fillC) { brush.noStroke(); brush.wash(fillC, 255); brush.polygon(pts); brush.noWash(); }
    if (w > 0) { S(part + ':o'); brush.set(bn, c, w); brush.spline(pts.concat([pts[0]]), 0); }
  };
  const circ = (c, r, part, fillC, w = W, inkc = ink) => {
    S(part + ':f');
    if (fillC) { brush.noStroke(); brush.wash(fillC, 255); brush.circle(c[0], c[1], r); brush.noWash(); }
    if (w > 0) { S(part + ':o'); brush.noFill(); brush.set(bn, inkc, w); brush.circle(c[0], c[1], r); }
  };

  const { bike, bird } = P;
  const far = '#7d736a';

  // far leg + far pedal
  if (opts.far !== false) {
    const L = bird.legFar;
    shape(L.poly, 'legFar', col ? '#d38a63' : '#e9e4dc', 0.6 * W, far);
    shape(L.web, 'footFar', col ? '#d98b62' : null, 0.6 * W, far);
    seg(bike.crank.bb, bike.crank.far, 'crankFar', 1.3 * W, far);
  }

  // wheels
  bike.wheels.forEach((wh, k) => {
    circ(wh.c, wh.r, 'tire' + k, null, 2.2 * W, col ? pal.tire : ink);
    circ(wh.c, wh.r * 0.9, 'rim' + k, null, 0.7 * W);
    for (let j = 0; j < wh.spokes; j++) {
      const a = wh.angle + (j * Math.PI * 2) / wh.spokes;
      seg(wh.c, [wh.c[0] + Math.cos(a) * wh.r * 0.88, wh.c[1] + Math.sin(a) * wh.r * 0.88], `spoke${k}_${j}`, 0.35 * W);
    }
    circ(wh.c, 4 * s, 'hub' + k, ink, 0.5 * W);
  });

  // chain + frame
  line(bike.chain.concat([bike.chain[0]]), 'chain', 0.5 * W);
  const fc = col ? pal.bike : ink;
  for (const [name, [a, b]] of Object.entries(bike.tubes)) seg(a, b, 'tube_' + name, 1.6 * W, fc);
  line(bike.fork, 'fork', 1.5 * W, fc);
  seg(bike.stem[0], bike.stem[1], 'stem', 1.3 * W);
  line(bike.bars, 'bars', 1.3 * W);
  seg(bike.seatpost[0], bike.seatpost[1], 'seatpost', 1.2 * W);
  line(bike.saddle, 'saddle', 2.2 * W);
  circ(bike.crank.bb, bike.crank.ring, 'ring', null, 0.8 * W);

  // bird
  shape(bird.tail, 'tail', col ? pal.body : '#ffffff');
  shape(bird.body, 'body', col ? pal.body : '#ffffff');
  shape(bird.wing, 'wing', col ? pal.body : '#ffffff', 0.9 * W);
  line(bird.secondaries, 'secondaries', 1.8 * W, pal.dark);
  bird.primaries.forEach((f, k) => line(f, 'prim' + k, 1.5 * W, pal.dark));
  shape(bird.neck, 'neck', col ? pal.body : '#ffffff', 0.9 * W);
  circ(bird.head.c, bird.head.r, 'head', col ? pal.body : '#ffffff', 0.9 * W);
  bird.crest.forEach((c, k) => seg(c[0], c[1], 'crest' + k, 0.6 * W));
  shape(bird.pouch, 'pouch', col ? pal.pouch : null, 0.8 * W);
  shape(bird.upperBill, 'bill', col ? pal.bill : '#ffffff', 0.8 * W);
  shape(bird.nail, 'nail', col ? '#d4693a' : ink, 0);
  if (col) shape(bird.facePatch, 'face', pal.face, 0);
  const E = bird.eye;
  if (E.mode === 'closed') {
    seg([E.c[0] - E.r, E.c[1]], [E.c[0] + E.r, E.c[1]], 'eyeShut', 0.8 * W);
  } else {
    circ(E.c, E.r, 'eye', '#ffffff', 0.5 * W);
    circ(E.pupil, E.r * (E.mode === 'white' ? 0.35 : 0.55), 'pupil', ink, 0);
  }

  // near leg + near crank + pedal
  const L = bird.legNear;
  shape(L.poly, 'legNear', col ? pal.leg : '#ffffff', 0.8 * W);
  shape(L.web, 'footNear', col ? pal.leg : '#ffffff', 0.7 * W);
  seg(bike.crank.bb, bike.crank.near, 'crankNear', 1.6 * W);
  seg([bike.crank.near[0] - 6 * s, bike.crank.near[1]], [bike.crank.near[0] + 6 * s, bike.crank.near[1]], 'pedal', 2.4 * W);
}
