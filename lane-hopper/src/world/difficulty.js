import { LaneTypes } from './Lane.js';

/**
 * Difficulty progression.
 *
 * Difficulty is a pure function of a lane's depth (its index relative to the
 * start lane). Because the score equals the furthest lane reached, lane depth is
 * exactly the score at which the player meets that lane - so this both matches
 * the specification's score bands and keeps generation fully deterministic for a
 * given seed, independent of how or when the lane was generated.
 *
 * Every band states firm bounds so the game stays readable at any depth.
 */
export const DIFFICULTY_BANDS = Object.freeze([
  Object.freeze({
    id: 'calm',
    minDepth: 0,
    weights: Object.freeze({
      [LaneTypes.GRASS]: 34,
      [LaneTypes.ROAD]: 36,
      [LaneTypes.RIVER]: 22,
      [LaneTypes.RAILWAY]: 8
    }),
    vehicleSpeed: Object.freeze([1.9, 2.9]),
    /** Minimum clear space between vehicles, in tiles. */
    vehicleGap: 3.2,
    platformSpeed: Object.freeze([1.2, 2]),
    platformGap: 1.5,
    blockerDensity: 0.16,
    /** Longest run of consecutive hazard lanes allowed. */
    maxHazardRun: 3,
    trainIdle: Object.freeze([5.5, 9.5]),
    trainSpeed: Object.freeze([13, 16]),
    trainCars: Object.freeze([3, 4])
  }),
  Object.freeze({
    id: 'brisk',
    minDepth: 21,
    weights: Object.freeze({
      [LaneTypes.GRASS]: 30,
      [LaneTypes.ROAD]: 35,
      [LaneTypes.RIVER]: 25,
      [LaneTypes.RAILWAY]: 10
    }),
    vehicleSpeed: Object.freeze([2.4, 3.6]),
    vehicleGap: 2.8,
    platformSpeed: Object.freeze([1.5, 2.4]),
    platformGap: 1.35,
    blockerDensity: 0.19,
    maxHazardRun: 4,
    trainIdle: Object.freeze([4.5, 8]),
    trainSpeed: Object.freeze([15, 18]),
    trainCars: Object.freeze([3, 5])
  }),
  Object.freeze({
    id: 'swift',
    minDepth: 51,
    weights: Object.freeze({
      [LaneTypes.GRASS]: 26,
      [LaneTypes.ROAD]: 36,
      [LaneTypes.RIVER]: 26,
      [LaneTypes.RAILWAY]: 12
    }),
    vehicleSpeed: Object.freeze([2.9, 4.3]),
    vehicleGap: 2.5,
    platformSpeed: Object.freeze([1.8, 2.8]),
    platformGap: 1.2,
    blockerDensity: 0.22,
    maxHazardRun: 5,
    trainIdle: Object.freeze([3.5, 7]),
    trainSpeed: Object.freeze([17, 20]),
    trainCars: Object.freeze([4, 5])
  }),
  Object.freeze({
    id: 'frantic',
    minDepth: 101,
    weights: Object.freeze({
      [LaneTypes.GRASS]: 24,
      [LaneTypes.ROAD]: 36,
      [LaneTypes.RIVER]: 26,
      [LaneTypes.RAILWAY]: 14
    }),
    /** Upper speed ceiling; kept at the spec's 5.0 tiles/second maximum. */
    vehicleSpeed: Object.freeze([3.4, 5]),
    vehicleGap: 2.2,
    platformSpeed: Object.freeze([2.1, 3.2]),
    platformGap: 1.1,
    blockerDensity: 0.24,
    maxHazardRun: 6,
    trainIdle: Object.freeze([3, 6]),
    trainSpeed: Object.freeze([18, 22]),
    trainCars: Object.freeze([4, 6])
  })
]);

/** Hard caps on consecutive lanes of one type (spec 7.3). */
export const MAX_CONSECUTIVE = Object.freeze({
  [LaneTypes.ROAD]: 4,
  [LaneTypes.RIVER]: 3,
  [LaneTypes.RAILWAY]: 1,
  /** Three grass lanes in a row is dull rather than unsafe, so it is capped too. */
  [LaneTypes.GRASS]: 2
});

/**
 * Railways stay rare and never near-adjacent while the player is still in the
 * first band. Beyond it they may not be adjacent, but a single lane gap is fine.
 */
export const EARLY_RAILWAY_SPACING = 3;

/**
 * @param {number} depth lane index relative to the start lane
 * @returns {object} the frozen difficulty band that governs that lane
 */
export function getDifficulty(depth) {
  const clamped = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  let band = DIFFICULTY_BANDS[0];
  for (const candidate of DIFFICULTY_BANDS) {
    if (clamped >= candidate.minDepth) band = candidate;
  }
  return band;
}

/** Zero-based index of the band governing `depth`. Handy for the debug panel. */
export function getDifficultyBandIndex(depth) {
  const band = getDifficulty(depth);
  return DIFFICULTY_BANDS.indexOf(band);
}
