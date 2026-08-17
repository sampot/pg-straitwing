export const TAU = Math.PI * 2;

export function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

export function length(x, y) {
  return Math.hypot(x, y);
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(x, y) {
  const l = Math.hypot(x, y);
  if (l < 1e-6) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

/** Fold an angle into (-PI, PI]. */
export function wrapAngle(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/** Shortest signed rotation from `from` to `to`. */
export function angleDiff(from, to) {
  return wrapAngle(to - from);
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from, to, maxStep) {
  const d = angleDiff(from, to);
  return wrapAngle(from + clamp(d, -maxStep, maxStep));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Deterministic 32-bit PRNG; returns [0,1) and advances `holder.rngSeed`. */
export function rand(holder) {
  let t = (holder.rngSeed = (holder.rngSeed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(holder, lo, hi) {
  return lo + rand(holder) * (hi - lo);
}
