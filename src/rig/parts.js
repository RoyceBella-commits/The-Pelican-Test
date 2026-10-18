// The rig as an ordered list of drawable parts (back → front). Each style maps
// part ROLES to its own palette and technique, which keeps every era's pelican
// on the same skeleton (so the halves match at a frame crossing).
//
// part = { name, role, kind: 'poly' | 'line' | 'circle', pts?, c?, r?, layer }
//   kind 'poly'   closed outline (pts)            → fill + outline
//   kind 'line'   open polyline (pts)             → stroke only
//   kind 'circle' centre c, radius r              → fill and/or ring
//   layer: 'far' (far leg/crank), 'bike', 'bird', 'near' (near leg, crank, pedal)
// roles:  legFar footFar crankFar | tire rim spoke hub chain frame fork stem bars seatpost saddle ring |
//         tail body wing secondaries primary neck head crest pouch bill nail face eye pupil eyeShut |
//         leg foot crank pedal
export function rigParts(P) {
  const { bike, bird } = P;
  const out = [];
  const add = (name, role, kind, geo, layer) => out.push({ name, role, kind, layer, ...geo });
  const s = P.place?.scale ?? 1;

  const LF = bird.legFar;
  add('legFar', 'legFar', 'poly', { pts: LF.poly }, 'far');
  add('footFar', 'footFar', 'poly', { pts: LF.web }, 'far');
  add('crankFar', 'crankFar', 'line', { pts: [bike.crank.bb, bike.crank.far] }, 'far');

  bike.wheels.forEach((wh, k) => {
    add('tire' + k, 'tire', 'circle', { c: wh.c, r: wh.r }, 'bike');
    add('rim' + k, 'rim', 'circle', { c: wh.c, r: wh.r * 0.9 }, 'bike');
    for (let j = 0; j < wh.spokes; j++) {
      const a = wh.angle + (j * Math.PI * 2) / wh.spokes;
      add(`spoke${k}_${j}`, 'spoke', 'line', { pts: [wh.c, [wh.c[0] + Math.cos(a) * wh.r * 0.88, wh.c[1] + Math.sin(a) * wh.r * 0.88]] }, 'bike');
    }
    add('hub' + k, 'hub', 'circle', { c: wh.c, r: 4 * s }, 'bike');
  });
  add('chain', 'chain', 'line', { pts: bike.chain.concat([bike.chain[0]]) }, 'bike');
  for (const [name, seg] of Object.entries(bike.tubes)) add('tube_' + name, 'frame', 'line', { pts: seg }, 'bike');
  add('fork', 'fork', 'line', { pts: bike.fork }, 'bike');
  add('stem', 'stem', 'line', { pts: bike.stem }, 'bike');
  add('bars', 'bars', 'line', { pts: bike.bars }, 'bike');
  add('seatpost', 'seatpost', 'line', { pts: bike.seatpost }, 'bike');
  add('saddle', 'saddle', 'line', { pts: bike.saddle }, 'bike');
  add('ring', 'ring', 'circle', { c: bike.crank.bb, r: bike.crank.ring }, 'bike');

  add('tail', 'tail', 'poly', { pts: bird.tail }, 'bird');
  add('body', 'body', 'poly', { pts: bird.body }, 'bird');
  add('wing', 'wing', 'poly', { pts: bird.wing }, 'bird');
  add('secondaries', 'secondaries', 'line', { pts: bird.secondaries }, 'bird');
  bird.primaries.forEach((f, k) => add('prim' + k, 'primary', 'line', { pts: f }, 'bird'));
  add('neck', 'neck', 'poly', { pts: bird.neck }, 'bird');
  add('head', 'head', 'circle', { c: bird.head.c, r: bird.head.r }, 'bird');
  bird.crest.forEach((c, k) => add('crest' + k, 'crest', 'line', { pts: c }, 'bird'));
  add('pouch', 'pouch', 'poly', { pts: bird.pouch }, 'bird');
  add('bill', 'bill', 'poly', { pts: bird.upperBill }, 'bird');
  add('nail', 'nail', 'poly', { pts: bird.nail }, 'bird');
  add('face', 'face', 'poly', { pts: bird.facePatch }, 'bird');
  const E = bird.eye;
  if (E.mode === 'closed') add('eyeShut', 'eyeShut', 'line', { pts: [[E.c[0] - E.r, E.c[1]], [E.c[0] + E.r, E.c[1]]] }, 'bird');
  else {
    add('eye', 'eye', 'circle', { c: E.c, r: E.r }, 'bird');
    add('pupil', 'pupil', 'circle', { c: E.pupil, r: E.r * (E.mode === 'white' ? 0.35 : 0.55) }, 'bird');
  }

  const L = bird.legNear;
  add('leg', 'leg', 'poly', { pts: L.poly }, 'near');
  add('foot', 'foot', 'poly', { pts: L.web }, 'near');
  add('crank', 'crank', 'line', { pts: [bike.crank.bb, bike.crank.near] }, 'near');
  add('pedal', 'pedal', 'line', { pts: [[bike.crank.near[0] - 6 * s, bike.crank.near[1]], [bike.crank.near[0] + 6 * s, bike.crank.near[1]]] }, 'near');
  return out;
}

/** Union-ish silhouette helpers: every closed bird part (for flat silhouette styles). */
export const BIRD_FILL_ROLES = ['tail', 'body', 'wing', 'neck', 'head', 'pouch', 'bill', 'nail', 'leg', 'legFar', 'foot', 'footFar'];
