// Deterministic maths: PRNG, hashing, value noise, easing. No Math.random anywhere.

/** 32-bit string/number hash (FNV-1a over the joined arguments). */
export function hash(...parts) {
  const s = parts.join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // final avalanche
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 generator. rng() → [0,1). Extra helpers hang off the function. */
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.gauss = () => { let s = 0; for (let k = 0; k < 4; k++) s += r(); return (s - 2) / 0.5774; };
  r.chance = (p) => r() < p;
  return r;
}

/** Stateless random in [0,1) for a key. */
export const rand = (...key) => hash(...key) / 4294967296;

// --------------------------------------------------------------- value noise
const lattice = (ix, iy, seed) => hash(ix, iy, seed) / 4294967296;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [0,1). */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export const noise1 = (x, seed = 0) => noise2(x, 0.5, seed);

/** Fractal (fbm) value noise in ≈[0,1). */
export function fbm(x, y, seed = 0, oct = 4, lac = 2, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise2(x * f, y * f, seed + o * 101);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

// ------------------------------------------------------------------- easing
export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a, b, c, d) => c + ((x - a) / (b - a)) * (d - c);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeOutBack = (t, s = 1.4) => { t = clamp(t); const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
/** 0 → 1 → 0 window with smooth edges: rises over [a, a+r], falls over [b−r, b]. */
export const window01 = (a, b, x, r = 0.2) => smoothstep(a, a + r, x) * (1 - smoothstep(b - r, b, x));
/** Gaussian-ish pulse centred at c with half-width w. */
export const pulse = (x, c, w) => Math.exp(-((((x - c) / w)) ** 2));
export const TAU = Math.PI * 2;

/** Linear interpolation through sorted keyframes [[t, v], ...] with optional easing. */
export function keys(t, kf, ease = (x) => x) {
  if (t <= kf[0][0]) return kf[0][1];
  for (let k = 1; k < kf.length; k++) {
    if (t <= kf[k][0]) {
      const [t0, v0] = kf[k - 1], [t1, v1] = kf[k];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return kf[kf.length - 1][1];
}

// --------------------------------------------------------------- 2D helpers
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rot = (p, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
export const polar = (r, ang) => [r * Math.cos(ang), r * Math.sin(ang)];

/** Sample a closed ellipse as a polygon. */
export function ellipsePts(cx, cy, rx, ry, ang = 0, n = 32, a0 = 0, a1 = TAU) {
  const out = [];
  const closed = Math.abs(a1 - a0 - TAU) < 1e-9;
  const m = closed ? n : n + 1;
  for (let k = 0; k < m; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const p = rot([rx * Math.cos(a), ry * Math.sin(a)], ang);
    out.push([cx + p[0], cy + p[1]]);
  }
  return out;
}

/** Catmull-Rom resample of a polyline (open). */
export function smoothPath(pts, perSeg = 8) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Closed Catmull-Rom resample. */
export function smoothLoop(pts, perSeg = 6) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

/** Offset a polyline into a closed ribbon polygon with width w(t) (t ∈ [0,1] along the line). */
export function ribbon(pts, w) {
  const left = [], right = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const ww = (typeof w === 'function' ? w(i / (n - 1)) : w) / 2;
    left.push([pts[i][0] - dy * ww, pts[i][1] + dx * ww]);
    right.push([pts[i][0] + dy * ww, pts[i][1] - dx * ww]);
  }
  return left.concat(right.reverse());
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
}
