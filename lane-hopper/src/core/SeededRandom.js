/**
 * Deterministic pseudorandom number generation.
 *
 * All procedural generation flows through this class. `Math.random()` is only
 * used by `createRunSeed()`, which picks the seed for a brand new run, never
 * inside generation itself.
 */

/** FNV-1a style string hash with a final avalanche, returning a uint32. */
export function hashSeed(input) {
  const text = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export class SeededRandom {
  /** @param {number|string} seed */
  constructor(seed) {
    this.seed = seed;
    this.state = hashSeed(seed) || 1;
  }

  /** Uniform float in [0, 1). mulberry32. */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Uniform float inside a `[min, max]` tuple. */
  rangeOf(tuple) {
    return this.range(tuple[0], tuple[1]);
  }

  /** Uniform integer in [min, max], inclusive on both ends. */
  int(min, max) {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Integer inside a `[min, max]` tuple, inclusive. */
  intOf(tuple) {
    return this.int(tuple[0], tuple[1]);
  }

  /** True with probability `p`. */
  chance(p) {
    return this.next() < p;
  }

  /** Either -1 or 1. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Uniform element from a non-empty array. */
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Fisher-Yates shuffle on a copy of `items`. */
  shuffled(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Creates an independent generator derived from this seed plus a salt.
   * Lets each lane own a private stream that does not depend on how many
   * numbers other lanes consumed.
   */
  fork(salt) {
    return new SeededRandom(`${this.seed}|${salt}`);
  }
}

/** Picks a fresh seed for a new run. Outside generation, so Math.random is fine. */
export function createRunSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Validates a seed supplied through the URL.
 * Returns a normalised seed, or `null` when the input is missing or malformed.
 */
export function parseSeed(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text.length === 0 || text.length > 64) return null;
  // Numeric seeds normalise to numbers; short alphanumeric labels are allowed too.
  if (/^-?\d+$/.test(text)) {
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }
  if (/^[A-Za-z0-9_.:-]+$/.test(text)) return text;
  return null;
}
