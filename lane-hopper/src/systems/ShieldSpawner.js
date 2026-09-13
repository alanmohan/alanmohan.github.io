import { GAMEPLAY } from '../config/gameplay.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { ShieldToken } from '../entities/ShieldToken.js';
import { LaneTypes } from '../world/Lane.js';

/**
 * Places shield tokens in the world.
 *
 * Kept apart from `ShieldSystem` because the two answer different questions:
 * that class owns what the player *has*, this one owns what the world *offers*.
 *
 * Placement obeys four rules, and together they are what stops the power-up from
 * being farmed:
 *   - nothing appears until the score has passed `shield.minScore`, so the
 *     opening lanes play exactly as they always did;
 *   - only one token may be uncollected at a time, enforced by the single slot
 *     on `World`;
 *   - consecutive tokens sit at least `shield.laneSpacing` lanes apart, measured
 *     from the lane the last token was placed on, which keeps climbing whether
 *     that token was collected or scrolled away;
 *   - nothing appears while the player is already holding the maximum number of
 *     charges, so a token in the world is always worth collecting.
 *
 * A token only ever lands on a grass lane, on a column the solvability pass has
 * proven reachable, and at least `shield.spawnLeadLanes` lanes beyond the
 * furthest lane reached, so one never materialises next to the player.
 *
 * Which column is chosen comes from a stream keyed by the run seed and the lane
 * index, exactly like `LaneFactory`. A given seed therefore always puts a token
 * on the same tile of a given lane, independent of when the spawn happened.
 */
export class ShieldSpawner {
  /**
   * @param {object} options
   * @param {number|string} options.seed run seed
   * @param {typeof GAMEPLAY} [options.config]
   */
  constructor({ seed, config = GAMEPLAY }) {
    this.config = config.shield;
    // Token ids keep climbing across runs, so the renderer can detect a replaced
    // token by comparing ids alone. This mirrors how lane ids behave.
    this.nextId = 1;
    this.reset(seed);
  }

  /** Clears run state for a fresh run. */
  reset(seed) {
    this.seed = seed;
    /** Lane the most recent token was placed on, or null when none has been. */
    this.lastSpawnLane = null;
  }

  /**
   * Places at most one token, if every rule allows it.
   *
   * @param {object} options
   * @param {import('../world/World.js').World} options.world
   * @param {number} options.score current score
   * @param {number} options.maxLaneReached furthest lane reached this run
   * @param {boolean} options.canCollect whether the player has room for a charge
   * @returns {import('../entities/ShieldToken.js').ShieldToken|null}
   *          the token placed this step, or null
   */
  update({ world, score, maxLaneReached, canCollect }) {
    if (!this._shouldSpawn({ world, score, canCollect })) return null;

    const site = this._findSite(world, maxLaneReached);
    if (!site) return null;

    const token = new ShieldToken({
      id: `shield:${this.nextId}`,
      laneIndex: site.laneIndex,
      column: this._pickColumn(site.laneIndex, site.columns)
    });
    this.nextId += 1;
    this.lastSpawnLane = site.laneIndex;
    return world.setShieldToken(token);
  }

  _shouldSpawn({ world, score, canCollect }) {
    if (world.shieldToken) return false;
    if (!canCollect) return false;
    // "After score 15" means the score has to be past it, not merely at it.
    return score > this.config.minScore;
  }

  /**
   * First lane at or beyond the earliest permitted index that can hold a token,
   * together with the tiles of that lane a token may sit on.
   *
   * @returns {{laneIndex: number, columns: number[]}|null}
   */
  _findSite(world, maxLaneReached) {
    if (world.maxIndex === null) return null;

    let from = maxLaneReached + this.config.spawnLeadLanes;
    if (this.lastSpawnLane !== null) {
      from = Math.max(from, this.lastSpawnLane + this.config.laneSpacing);
    }

    for (let index = from; index <= world.maxIndex; index += 1) {
      const lane = world.laneAt(index);
      if (!lane || lane.type !== LaneTypes.GRASS) continue;
      const columns = this._columnsFor(world, index);
      if (columns.length > 0) return { laneIndex: index, columns };
    }
    return null;
  }

  /** Reachable, unblocked columns of a lane, in ascending order. */
  _columnsFor(world, laneIndex) {
    const lane = world.laneAt(laneIndex);
    if (!lane) return [];
    return [...world.reachableColumns(laneIndex)]
      .filter((column) => !lane.isBlocked(column))
      .sort((a, b) => a - b);
  }

  /** Deterministic column choice: a private stream per run seed and lane. */
  _pickColumn(laneIndex, columns) {
    return new SeededRandom(`${this.seed}|shieldToken|${laneIndex}`).pick(columns);
  }
}
