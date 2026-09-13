/** Small maths helpers shared by the simulation and the renderer. */

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Easing used by the hop animation: fast start, gentle landing. */
export function easeOutCubic(t) {
  const clamped = clamp(t, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/** Vertical arc of a hop, peaking halfway through the movement. */
export function hopArc(t, height) {
  return Math.sin(Math.PI * clamp(t, 0, 1)) * height;
}

/**
 * Frame-rate independent exponential damping.
 * `lambda` is the approach rate; larger values converge faster.
 */
export function damp(current, target, lambda, dt) {
  if (dt <= 0) return current;
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Half-open interval overlap test: touching edges do not count as a hit. */
export function intervalsOverlap(aMin, aMax, bMin, bMax) {
  return aMin < bMax && bMin < aMax;
}

/** Axis-aligned box overlap on the X (columns) and Z (lanes) axes. */
export function boxesOverlap(a, b) {
  return (
    intervalsOverlap(a.minX, a.maxX, b.minX, b.maxX) &&
    intervalsOverlap(a.minZ, a.maxZ, b.minZ, b.maxZ)
  );
}

/** Builds an axis-aligned box from a centre point and full extents. */
export function boxFromCenter(centerX, centerZ, sizeX, sizeZ) {
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;
  return {
    minX: centerX - halfX,
    maxX: centerX + halfX,
    minZ: centerZ - halfZ,
    maxZ: centerZ + halfZ
  };
}

/**
 * Wraps `value` into [-span, span] by whole multiples of the 2*span period.
 * Used by vehicles and platforms so that even spacing survives wrapping.
 */
export function wrapSpan(value, span) {
  const period = span * 2;
  let wrapped = value;
  while (wrapped > span) wrapped -= period;
  while (wrapped < -span) wrapped += period;
  return wrapped;
}

export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Inclusive integer range as an array, e.g. rangeInclusive(-2, 2). */
export function rangeInclusive(min, max) {
  const out = [];
  for (let i = min; i <= max; i += 1) out.push(i);
  return out;
}
