import { GAMEPLAY } from '../config/gameplay.js';
import { LaneTypes, isHazardLane } from './Lane.js';
import { DIFFICULTY_BANDS, EARLY_RAILWAY_SPACING, MAX_CONSECUTIVE } from './difficulty.js';

/**
 * Lane-sequence selection rules.
 *
 * Everything here is a pure function of the lane history plus a seeded RNG, so
 * the same seed always produces the same sequence.
 */

/** Index of the last lane that is forced to be safe grass. */
export const LAST_START_LANE = GAMEPLAY.start.safeAhead;

/** True when a lane index falls inside the guaranteed-safe starting region. */
export function isStartingLane(index) {
  return index <= LAST_START_LANE;
}

/** Length of the trailing run of `type` at the end of `history`. */
export function trailingRun(history, type) {
  let run = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] !== type) break;
    run += 1;
  }
  return run;
}

/** Length of the trailing run of hazard lanes of any kind. */
export function trailingHazardRun(history) {
  let run = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (!isHazardLane(history[i])) break;
    run += 1;
  }
  return run;
}

/** How many lanes back the most recent `type` sits; Infinity when absent. */
export function lanesSince(history, type) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] === type) return history.length - i;
  }
  return Infinity;
}

/**
 * Weights for the next lane type, after applying every safety rule.
 *
 * @param {string[]} history recent lane types, oldest first, newest last
 * @param {object} difficulty band from getDifficulty()
 * @returns {Record<string, number>} weight per lane type; zero means excluded
 */
export function laneTypeWeights(history, difficulty) {
  const weights = { ...difficulty.weights };
  const last = history.length > 0 ? history[history.length - 1] : null;

  // A long hazard sequence must be broken by a safe lane.
  if (trailingHazardRun(history) >= difficulty.maxHazardRun) {
    return {
      [LaneTypes.GRASS]: 1,
      [LaneTypes.ROAD]: 0,
      [LaneTypes.RIVER]: 0,
      [LaneTypes.RAILWAY]: 0
    };
  }

  // Per-type consecutive caps.
  for (const type of Object.keys(MAX_CONSECUTIVE)) {
    if (last === type && trailingRun(history, type) >= MAX_CONSECUTIVE[type]) {
      weights[type] = 0;
    }
  }

  // Railways are never adjacent, and stay well separated in the first band.
  const railwayGap = lanesSince(history, LaneTypes.RAILWAY);
  const minRailwayGap = difficulty === DIFFICULTY_BANDS[0] ? EARLY_RAILWAY_SPACING : 2;
  if (railwayGap < minRailwayGap) weights[LaneTypes.RAILWAY] = 0;

  // Never let every option be excluded.
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) weights[LaneTypes.GRASS] = 1;

  return weights;
}

/**
 * Weighted pick from a `{type: weight}` map.
 * @param {Record<string, number>} weights
 * @param {import('../core/SeededRandom.js').SeededRandom} rng
 */
export function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return LaneTypes.GRASS;

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return entries[entries.length - 1][0];
}

/**
 * Chooses the lane type for `index`.
 *
 * @param {object} options
 * @param {number} options.index      lane index being generated
 * @param {string[]} options.history  recent lane types, newest last
 * @param {object} options.difficulty band governing this lane
 * @param {import('../core/SeededRandom.js').SeededRandom} options.rng
 *        sequential type stream shared by the whole run
 */
export function chooseLaneType({ index, history, difficulty, rng }) {
  if (isStartingLane(index)) return LaneTypes.GRASS;
  return pickWeighted(laneTypeWeights(history, difficulty), rng);
}

/**
 * Keeps neighbouring lanes of the same type from feeling mechanically identical
 * by forcing either a direction flip or a meaningful speed difference.
 *
 * @returns {{direction: -1|1, speed: number}}
 */
export function differentiateFromPrevious({
  rng,
  previousLane,
  type,
  direction,
  speed,
  speedRange,
  minSpeedDelta
}) {
  if (!previousLane || previousLane.type !== type) return { direction, speed };
  if (direction !== previousLane.direction) return { direction, speed };
  if (Math.abs(speed - previousLane.speed) >= minSpeedDelta) return { direction, speed };

  if (rng.chance(0.6)) return { direction: -direction, speed };

  const [min, max] = speedRange;
  const faster = previousLane.speed + minSpeedDelta;
  const slower = previousLane.speed - minSpeedDelta;
  const nextSpeed = faster <= max ? faster : slower >= min ? slower : max;
  return { direction, speed: nextSpeed };
}

/**
 * Expands a set of entry columns sideways through the lane's open tiles.
 *
 * Lateral movement is only possible across tiles that are not blocked, so
 * reachability inside a lane is the union of the open runs containing each
 * entry column.
 *
 * @param {import('./Lane.js').Lane} lane
 * @param {number[]} entryColumns columns the player can step into from behind
 * @param {number} halfWidth playable half width
 * @returns {Set<number>}
 */
export function expandReachable(lane, entryColumns, halfWidth) {
  const reachable = new Set();
  for (const entry of entryColumns) {
    if (lane.isBlocked(entry)) continue;
    reachable.add(entry);
    for (let c = entry - 1; c >= -halfWidth && !lane.isBlocked(c); c -= 1) reachable.add(c);
    for (let c = entry + 1; c <= halfWidth && !lane.isBlocked(c); c += 1) reachable.add(c);
  }
  return reachable;
}

/**
 * Computes which columns of `lane` are reachable, opening a tile if the layout
 * would otherwise seal the lane off.
 *
 * Only forward moves are considered, which makes the result a conservative lower
 * bound: backward movement can only ever add options.
 *
 * @returns {Set<number>} reachable columns for this lane
 */
export function resolveReachability({ lane, previousReachable, columns, halfWidth, rng }) {
  const entries =
    previousReachable && previousReachable.size > 0 ? [...previousReachable] : columns.slice();

  let open = entries.filter((column) => !lane.isBlocked(column));

  if (open.length === 0) {
    // Guarantee a route: clear the entry column closest to the middle.
    const sorted = entries.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
    const gate = sorted.length > 0 ? sorted[0] : rng.int(-halfWidth, halfWidth);
    lane.blockers.delete(gate);
    open = [gate];
  }

  return expandReachable(lane, open, halfWidth);
}
