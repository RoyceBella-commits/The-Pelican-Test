// Parametric puppet: a white pelican on a modern diamond-frame bicycle.
//
// pose(state, mods) → named outlines in RIG space:
//   origin = road point under the bottom bracket, x forward (right), y down (negative = up)
//   units  = panel units at scale 1 (rig is ≈ 320 tall, wheels r = 62)
// placed(pose, place) maps every point to panel space: place = { x, y, scale, rot, flip }.
//
// Every style draws the SAME outlines with its own technique, so the motion is
// continuous when the rider crosses a frame from one style into the next.
import { WHEEL_R } from '../beat/timeline.js';
import { TAU, lerp, mix, rot, ellipsePts, smoothPath, smoothLoop, ribbon, clamp } from '../kit/math.js';

export const GEOM = {
  R: WHEEL_R,
  rear: [-102, -WHEEL_R],
  front: [106, -WHEEL_R],
  bb: [0, -54],
  seatTop: [-26, -140],
  saddle: [-32, -150],
  headTop: [80, -138],
  headBot: [88, -110],
  crank: 24,
  ring: 15,
  cog: 7,
  thigh: 62,
  shin: 62,
};

export const DEFAULT_MODS = {
  wind: 0,          // 0..1 feathers & tail flutter (吴带当风)
  eye: 'normal',    // 'normal' | 'white' (rolled-up white eye) | 'closed' | 'wide'
  billOpen: 0,      // 0..1
  feetOff: 0,       // 0..1 both feet lift off the pedals
  scared: 0,        // 0..1 neck pulls back, eye wide, feathers ruffle
  lookBack: 0,      // 0..1 head turns toward the viewer / back
  bob: 1,           // head/body bob amount
  spokes: 12,       // ≤ 12 (≤ 8 in low-fps scenes) to avoid wagon-wheel aliasing
};

// two-bone IK: returns the knee for hip→ankle, bending forward (+x)
function ik(hip, ankle, l1, l2) {
  let dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
  let d = Math.hypot(dx, dy);
  const dmax = l1 + l2 - 0.5, dmin = Math.abs(l1 - l2) + 1;
  const dc = clamp(d, dmin, dmax);
  const ux = dx / d, uy = dy / d;
  const a = Math.acos(clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1));
  // two candidates; pick the one whose knee points forward (larger x)
  const k1 = [hip[0] + l1 * (ux * Math.cos(a) - uy * Math.sin(a)), hip[1] + l1 * (ux * Math.sin(a) + uy * Math.cos(a))];
  const k2 = [hip[0] + l1 * (ux * Math.cos(-a) - uy * Math.sin(-a)), hip[1] + l1 * (ux * Math.sin(-a) + uy * Math.cos(-a))];
  const knee = k1[0] > k2[0] ? k1 : k2;
  // if out of reach, the ankle slides to the reachable point (foot hovers above pedal)
  const reach = [hip[0] + ux * dc, hip[1] + uy * dc];
  return { knee, ankle: d > dmax ? reach : ankle };
}

/**
 * state: { crank, wheel, t, v }  (angles in radians; t for secondary motion)
 * mods:  see DEFAULT_MODS
 */
export function pose(state, mods = {}) {
  const m = { ...DEFAULT_MODS, ...mods };
  const G = GEOM;
  const th = state.crank, t = state.t ?? 0;
  const bobA = m.bob * (1 - 0.6 * m.feetOff);
  const bob = Math.sin(2 * th) * 2.2 * bobA;           // two pushes per revolution
  const sway = Math.sin(th) * 1.5 * bobA;

  // ---------------------------------------------------------------- bicycle
  const wheels = [
    { c: G.rear, r: G.R, angle: state.wheel, spokes: m.spokes },
    { c: G.front, r: G.R, angle: state.wheel, spokes: m.spokes },
  ];
  const tubes = {
    chainstay: [G.bb, G.rear],
    seatstay: [G.seatTop, G.rear],
    seattube: [G.bb, G.seatTop],
    toptube: [G.seatTop, G.headTop],
    downtube: [G.bb, G.headBot],
    headtube: [G.headTop, G.headBot],
  };
  const fork = smoothPath([G.headBot, [G.headBot[0] + 8, G.headBot[1] + 28], [G.front[0] + 1, G.front[1] - 4], G.front], 6);
  const stemTop = [G.headTop[0] - 4, G.headTop[1] - 16];
  const bars = smoothPath([stemTop, [stemTop[0] + 12, stemTop[1] - 3], [stemTop[0] + 22, stemTop[1] + 2], [stemTop[0] + 20, stemTop[1] + 12]], 5);
  const grip = bars[bars.length - 3];
  const seatpost = [G.seatTop, [G.saddle[0] + 2, G.saddle[1] + 4]];
  const saddle = smoothPath([[G.saddle[0] - 16, G.saddle[1] - 2], [G.saddle[0], G.saddle[1] - 4], [G.saddle[0] + 16, G.saddle[1]]], 4);
  const pedNear = [G.bb[0] + G.crank * Math.cos(th), G.bb[1] + G.crank * Math.sin(th)];
  const pedFar = [G.bb[0] - G.crank * Math.cos(th), G.bb[1] - G.crank * Math.sin(th)];
  const crank = { bb: G.bb, near: pedNear, far: pedFar, ring: G.ring };
  // chain loop: top and bottom runs between chainring and cog
  const chain = [
    [G.bb[0], G.bb[1] - G.ring], [G.rear[0], G.rear[1] - G.cog],
    [G.rear[0] - G.cog, G.rear[1]], [G.rear[0], G.rear[1] + G.cog],
    [G.bb[0], G.bb[1] + G.ring], [G.bb[0] + G.ring, G.bb[1]],
  ];

  // ----------------------------------------------------------------- pelican
  const lift = m.feetOff;
  const hip = [G.saddle[0] - 4, G.saddle[1] - 10 + bob * 0.4];
  const footOffset = [-3, -13];
  const legFor = (ped, side) => {
    let target = [ped[0] + footOffset[0], ped[1] + footOffset[1]];
    if (lift > 0) {
      // feet leave the pedals: legs tuck up and splay forward/back
      const tuck = side > 0 ? [hip[0] + 58, hip[1] + 46] : [hip[0] - 22, hip[1] + 62];
      target = mix(target, tuck, lift);
    }
    const { knee, ankle } = ik(hip, target, G.thigh, G.shin);
    const toeDir = lift > 0 ? lerp(0.15, side > 0 ? -0.5 : 0.6, lift) : 0.15;
    const toe = [ankle[0] + 19 * Math.cos(toeDir), ankle[1] + 19 * Math.sin(toeDir) + 4];
    // webbed foot: three toes fanned around toeDir
    const web = [ankle, [ankle[0] + 18 * Math.cos(toeDir - 0.35), ankle[1] + 18 * Math.sin(toeDir - 0.35) + 3], toe,
      [ankle[0] + 17 * Math.cos(toeDir + 0.35), ankle[1] + 17 * Math.sin(toeDir + 0.35) + 5]];
    // tapered leg outline (thigh feathered and thick, shin thinner)
    const poly = ribbon(smoothPath([hip, knee, ankle], 5), (u) => lerp(17, 7, u));
    return { hip, knee, ankle, toe, web, poly };
  };
  const legNear = legFor(pedNear, 1);
  const legFar = legFor(pedFar, -1);

  const sc = m.scared;
  const bodyC = [-6 + sway * 0.3, -186 + bob];
  const bodyAng = -0.2 - 0.06 * sc;
  const bodyRx = 64, bodyRy = 38;
  const body = ellipsePts(bodyC[0], bodyC[1], bodyRx, bodyRy, bodyAng, 36);
  // tail: short wedge at the back, flutters with wind
  const flut = m.wind * Math.sin(t * 9.0) * 0.18 + m.wind * 0.12;
  const tailBase = [bodyC[0] - 56, bodyC[1] + 6];
  const tailAng = Math.PI - 0.05 + flut - 0.25 * sc;
  const tail = [
    [tailBase[0] + 4, tailBase[1] - 14],
    [tailBase[0] + 30 * Math.cos(tailAng - 0.12), tailBase[1] + 30 * Math.sin(tailAng - 0.12)],
    [tailBase[0] + 32 * Math.cos(tailAng + 0.08), tailBase[1] + 32 * Math.sin(tailAng + 0.08)],
    [tailBase[0] + 6, tailBase[1] + 12],
  ];

  // wing: folded covert shape on the body + primaries reaching for the handlebar grip
  const shoulder = [bodyC[0] + 22, bodyC[1] - 22];
  const wingBack = [bodyC[0] - 58, bodyC[1] - 4 + flut * 20];
  const wrist = mix(shoulder, grip, 0.55);
  wrist[1] += 10;
  const wing = smoothLoop([
    shoulder, [bodyC[0] - 6, bodyC[1] - 32], [bodyC[0] - 40, bodyC[1] - 22], wingBack,
    [bodyC[0] - 30, bodyC[1] + 14], [bodyC[0] + 10, bodyC[1] + 14], wrist,
  ], 5);
  // primaries: 5 dark feathers fanning from wrist to grip
  const primaries = [];
  for (let k = 0; k < 5; k++) {
    const f = k / 4;
    const tip = [grip[0] - 2 + f * 6, grip[1] - 2 + f * 9];
    const flutter = m.wind * Math.sin(t * 11 + k) * 3;
    const mid = mix(wrist, tip, 0.5);
    primaries.push(smoothPath([[wrist[0] - 14 + f * 4, wrist[1] - 6 + f * 6], [mid[0], mid[1] + flutter], tip], 4));
  }
  // secondaries trailing edge (dark) at the back of the folded wing
  const secondaries = smoothPath([[bodyC[0] - 20, bodyC[1] + 12], [bodyC[0] - 44, bodyC[1] + 8], wingBack], 5);

  // neck: S-curve from the front of the body to the head
  const back = sc * 14 + m.lookBack * 6;
  const neckBase = [bodyC[0] + 46, bodyC[1] - 20];
  const headC = [bodyC[0] + 72 - back, bodyC[1] - 112 + bob * 0.8 + sc * 6];
  const neckSpine = smoothPath([
    neckBase,
    [neckBase[0] + 15, neckBase[1] - 24],
    [neckBase[0] + 8 - back * 0.5, neckBase[1] - 52],
    [headC[0] - 4, headC[1] + 14],
  ], 10);
  const neck = ribbon(neckSpine, (u) => lerp(30, 19, u));
  const headR = 17;
  // crest feathers at the back of the head, ruffled by wind / fright
  const crest = [];
  for (let k = 0; k < 3; k++) {
    const a0 = Math.PI * 1.08 + k * 0.18 + m.wind * 0.25 * Math.sin(t * 10 + k * 2) - sc * 0.3;
    const base = [headC[0] - 10, headC[1] - 8 + k * 3];
    crest.push([base, [base[0] + (14 + sc * 8) * Math.cos(a0), base[1] + (14 + sc * 8) * Math.sin(a0)]]);
  }
  // bill: long upper mandible with hooked nail; the pouch hangs underneath
  const billAng = 0.12 + 0.08 * Math.sin(th) * m.bob - 0.25 * m.lookBack;
  const billLen = 112;
  const billBase = [headC[0] + 10, headC[1] + 2];
  const B = (along, off) => {
    const p = rot([along, off], billAng);
    return [billBase[0] + p[0], billBase[1] + p[1]];
  };
  const open = m.billOpen * 0.32;
  const Bup = (along, off) => {
    const p = rot([along, off], billAng - open);
    return [billBase[0] + p[0], billBase[1] + p[1]];
  };
  const upperBill = [Bup(-4, -7), Bup(40, -6), Bup(billLen - 6, -4), Bup(billLen + 2, -1), Bup(billLen + 1, 4), Bup(billLen - 8, 3), Bup(40, 2), Bup(-2, 5)];
  const nail = [Bup(billLen - 6, -4), Bup(billLen + 4, 0), Bup(billLen, 5)];
  const pouchSag = 22 + 4 * Math.sin(th * 2 + 0.8) * m.bob + 10 * m.billOpen;
  const pouch = smoothPath([
    B(-2, 6), B(18, 10 + pouchSag * 0.55), B(50, 6 + pouchSag), B(80, 4 + pouchSag * 0.7), B(billLen - 6, 5), B(billLen - 6, 4),
  ], 5).concat(smoothPath([B(billLen - 8, 3), B(60, 3), B(10, 3), B(-2, 5)], 3));
  const lowerJawLine = [B(-2, 5), B(billLen - 8, 4)];

  // eye
  const eyeC = [headC[0] + 5, headC[1] - 3];
  const pupilOff = m.eye === 'white' ? [0, -3.2] : m.lookBack > 0.5 ? [-1.5, 0] : [1.2, 0];
  const eye = { c: eyeC, r: m.eye === 'wide' || sc > 0.5 ? 5.2 : 4.2, pupil: [eyeC[0] + pupilOff[0], eyeC[1] + pupilOff[1]], mode: m.eye };
  const facePatch = ellipsePts(eyeC[0] + 1, eyeC[1] + 1, 8, 6.5, 0, 14);

  return {
    mods: m,
    bike: { wheels, tubes, fork, stem: [G.headTop, stemTop], bars, grip, seatpost, saddle, crank, chain },
    bird: {
      body, bodyC, bodyAng, bodyRx, bodyRy, tail, wing, primaries, secondaries, shoulder, wrist,
      neck, neckSpine, head: { c: headC, r: headR }, crest, upperBill, nail, pouch, lowerJawLine,
      eye, facePatch, legNear, legFar,
    },
  };
}

// ----------------------------------------------------------------- placement
/** Map a rig-space point to panel space. */
export function placer(place) {
  const s = place.scale ?? 1, a = place.rot ?? 0, f = place.flip ? -1 : 1;
  const c = Math.cos(a), sn = Math.sin(a);
  const ox = place.x, oy = place.y;
  return (p) => {
    const x = p[0] * s * f, y = p[1] * s;
    return [ox + x * c - y * sn, oy + x * sn + y * c];
  };
}

/** Deep-map every point of a pose into panel space (numbers like radii are scaled). */
export function placed(P, place) {
  const T = placer(place);
  const s = place.scale ?? 1;
  const isPt = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number';
  const walk = (v, k) => {
    if (isPt(v)) return T(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const o = {};
      for (const key of Object.keys(v)) {
        const x = v[key];
        if (key === 'r' || key === 'ring' || key === 'bodyRx' || key === 'bodyRy') o[key] = x * s;
        else if (key === 'angle') o[key] = x + (place.rot ?? 0);
        else if (key === 'mods' || key === 'mode' || key === 'spokes') o[key] = x;
        else o[key] = walk(x, key);
      }
      return o;
    }
    return v;
  };
  const out = walk(P);
  out.place = place;
  return out;
}

/** Rough bounding box of the rig in rig space (for culling / clipping). */
export const RIG_BOUNDS = { x0: -175, x1: 205, y0: -330, y1: 4 };
