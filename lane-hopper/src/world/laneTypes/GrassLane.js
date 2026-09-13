import { GAMEPLAY } from '../../config/gameplay.js';
import { COLORS } from '../../config/colors.js';
import { Lane, LaneTypes } from '../Lane.js';
import { isStartingLane } from '../generation.js';

/**
 * Safe grass lane.
 *
 * Contains no moving hazards. Static blockers (trees, rocks, shrubs) occupy
 * whole tiles and prevent movement rather than killing the player.
 */

/** Longest solid run of blockers permitted, so lateral detours stay short. */
const MAX_RUN = GAMEPLAY.blockers.maxConsecutive;

export const GrassLane = {
  type: LaneTypes.GRASS,

  /**
   * @param {object} ctx
   * @param {number} ctx.id
   * @param {number} ctx.index
   * @param {string} ctx.seedLabel
   * @param {import('../../core/SeededRandom.js').SeededRandom} ctx.rng
   * @param {object} ctx.difficulty
   * @param {number[]} ctx.columns playable columns
   */
  create({ id, index, seedLabel, rng, difficulty, columns }) {
    const lane = new Lane({
      id,
      index,
      type: LaneTypes.GRASS,
      seed: seedLabel,
      direction: 0,
      speed: 0,
      metadata: {
        /** Deterministic ground shade variation. */
        groundVariant: rng.int(0, COLORS.grass.length - 1),
        scenery: []
      }
    });

    // The starting region is always completely clear, which also guarantees the
    // player's initial tile is never blocked.
    const density = isStartingLane(index) ? 0 : difficulty.blockerDensity;
    if (density > 0) {
      placeBlockers(lane, columns, density, rng);
    }

    lane.metadata.scenery = buildOuterScenery(rng);
    return lane;
  },

  /** No moving parts. */
  update() {},
  wrap() {}
};

/**
 * Fills the lane with blockers, then relaxes the layout until it satisfies the
 * lane-local safety rules: enough open tiles and no long solid runs.
 */
function placeBlockers(lane, columns, density, rng) {
  for (const column of columns) {
    if (rng.chance(density)) {
      lane.blockers.set(column, {
        kind: rng.chance(0.68) ? 'tree' : 'rock',
        variant: rng.int(0, 2),
        scale: rng.range(0.86, 1.16)
      });
    }
  }

  breakLongRuns(lane, columns);
  ensureMinimumOpen(lane, columns, rng);
}

/** Clears the middle of any blocker run longer than MAX_RUN. */
function breakLongRuns(lane, columns) {
  let run = 0;
  for (const column of columns) {
    if (lane.isBlocked(column)) {
      run += 1;
      if (run > MAX_RUN) {
        lane.blockers.delete(column);
        run = 0;
      }
    } else {
      run = 0;
    }
  }
}

/** Opens tiles until at least `minOpenColumns` are free. */
function ensureMinimumOpen(lane, columns, rng) {
  const minOpen = GAMEPLAY.blockers.minOpenColumns;
  const order = rng.shuffled(columns);
  let openCount = columns.length - lane.blockers.size;
  for (const column of order) {
    if (openCount >= minOpen) break;
    if (lane.blockers.delete(column)) openCount += 1;
  }
}

/**
 * Decorative border trees outside the playable width.
 *
 * Purely visual: they frame the play area and are never consulted for
 * collisions. Each entry carries everything the renderer needs to place one
 * instance, because the border is drawn with instanced meshes rather than one
 * object per tree.
 */
function buildOuterScenery(rng) {
  const scenery = [];
  const first = GAMEPLAY.playableHalfWidth + 1;
  const last = GAMEPLAY.sceneryOuterWidth;

  for (let column = first; column <= last; column += 1) {
    // Density ramps up away from the play area so the border reads as a wall.
    const depth = (column - first) / Math.max(1, last - first);
    const density = 0.62 + depth * 0.36;
    for (const side of [-1, 1]) {
      if (!rng.chance(density)) continue;
      const scale = rng.range(0.9, 1.35);
      scenery.push({
        column: column * side,
        // Slight offsets keep the border from looking like a grid.
        z: rng.range(-0.2, 0.2),
        rotation: rng.range(-0.5, 0.5),
        scale,
        trunkHeight: rng.range(0.36, 0.62) * scale,
        crownHeight: rng.range(0.9, 1.7) * scale,
        color: rng.pick(COLORS.foliage)
      });
    }
  }
  return scenery;
}
