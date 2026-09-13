import { GAMEPLAY } from '../config/gameplay.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { getDifficulty } from './difficulty.js';
import { isStartingLane, resolveReachability } from './generation.js';
import { LaneFactory, PLAYABLE_COLUMNS } from './LaneFactory.js';
import { laneBehaviour } from './laneTypes/index.js';

/** Number of trailing lane types the selection rules look back over. */
const HISTORY_LENGTH = 8;

/**
 * The lane world: a moving window of lanes around the player.
 *
 * This module is pure logic and imports no rendering code, so it can be unit
 * tested without WebGL. The renderer observes `lanes` and builds meshes from it.
 */
export class World {
  /** @param {{seed: number|string}} options */
  constructor({ seed }) {
    this.reset(seed);
  }

  /** Rebuilds the world from scratch for a new run. */
  reset(seed) {
    // Lane ids continue climbing across runs so no id is ever reused.
    const firstId = this.factory ? this.factory.nextId : 1;
    this.seed = seed;
    this.factory = new LaneFactory(seed, firstId);
    this.repairRng = new SeededRandom(`${seed}|repair`);

    /** @type {Map<number, import('./Lane.js').Lane>} */
    this.lanes = new Map();
    /** Reachable columns per lane, used by the solvability guarantee. */
    this.reachable = new Map();
    /** Trailing lane types, newest last. */
    this.history = [];

    /**
     * The single uncollected shield token, or null.
     *
     * One slot rather than a collection, because the rules allow at most one
     * uncollected token in the world at a time. `ShieldSpawner` decides when to
     * fill it; the simulation clears it on pickup, death and run end.
     * @type {import('../entities/ShieldToken.js').ShieldToken|null}
     */
    this.shieldToken = null;

    this.minIndex = null;
    this.maxIndex = null;

    const first = -GAMEPLAY.lanesBehind;
    const last = GAMEPLAY.lanesAhead;
    for (let index = first; index <= last; index += 1) this._appendLane(index);
  }

  get laneCount() {
    return this.lanes.size;
  }

  /** Total number of live moving entities. Used by the debug panel. */
  get entityCount() {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.entities.length;
    return total;
  }

  laneAt(index) {
    return this.lanes.get(index) || null;
  }

  hasLane(index) {
    return this.lanes.has(index);
  }

  /** Places the uncollected shield token, replacing any previous one. */
  setShieldToken(token) {
    this.shieldToken = token;
    return token;
  }

  /**
   * Removes the uncollected shield token.
   * @returns {import('../entities/ShieldToken.js').ShieldToken|null} the token removed
   */
  clearShieldToken() {
    const token = this.shieldToken;
    this.shieldToken = null;
    return token;
  }

  /** Reachable columns for a lane; empty set when unknown. */
  reachableColumns(index) {
    return this.reachable.get(index) || new Set();
  }

  /**
   * Generates forward so that at least `GAMEPLAY.lanesAhead` lanes exist beyond
   * `frontLaneIndex`. Work is capped per call so a burst of progress cannot
   * cause a frame hitch.
   *
   * @returns {number} how many lanes were appended
   */
  ensureAhead(frontLaneIndex, limit = GAMEPLAY.maxLanesPerStep) {
    const target = frontLaneIndex + GAMEPLAY.lanesAhead;
    let appended = 0;
    while (this.maxIndex < target && appended < limit) {
      this._appendLane(this.maxIndex + 1);
      appended += 1;
    }
    return appended;
  }

  /**
   * Permanently discards lanes below `keepFrom`.
   *
   * The caller is responsible for never passing an index above the lane the
   * player occupies (or is hopping from).
   *
   * @returns {import('./Lane.js').Lane[]} the discarded lanes
   */
  recycleBelow(keepFrom) {
    const removed = [];
    for (const [index, lane] of this.lanes) {
      if (index >= keepFrom) continue;
      removed.push(lane);
      this.lanes.delete(index);
      this.reachable.delete(index);
    }

    // A token on a discarded lane goes with it. This is also what stops a token
    // from being reachable forever: once it has scrolled behind the live window
    // it is gone, and the spawner's lane spacing is measured from where it was.
    if (this.shieldToken && this.shieldToken.laneIndex < keepFrom) {
      this.shieldToken = null;
    }
    if (removed.length > 0) {
      let min = Infinity;
      for (const index of this.lanes.keys()) if (index < min) min = index;
      this.minIndex = Number.isFinite(min) ? min : null;
      // Drop entity references so the garbage collector can reclaim them.
      for (const lane of removed) lane.entities.length = 0;
    }
    return removed;
  }

  /**
   * Advances every lane's moving entities and phase timers.
   * Wrapping is deliberately deferred to `wrapEntities()`.
   *
   * @param {number} dt seconds
   * @param {Array} [events] sink for gameplay events such as train warnings
   */
  update(dt, events) {
    for (const lane of this.lanes.values()) {
      laneBehaviour(lane.type).update(lane, dt, {
        events,
        difficulty: getDifficulty(lane.index)
      });
    }
  }

  /** Recycles entities that have travelled past the wrap span. */
  wrapEntities() {
    for (const lane of this.lanes.values()) laneBehaviour(lane.type).wrap(lane);
  }

  /** Creates the lane at `index` and extends the reachability chain. */
  _appendLane(index) {
    const previousLane = this.laneAt(index - 1);
    const lane = this.factory.create({ index, history: this.history, previousLane });

    this.lanes.set(index, lane);
    this.minIndex = this.minIndex === null ? index : Math.min(this.minIndex, index);
    this.maxIndex = this.maxIndex === null ? index : Math.max(this.maxIndex, index);

    this.history.push(lane.type);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();

    this._resolveReachability(lane, index);
    return lane;
  }

  /**
   * Guarantees every lane exposes at least one tile reachable from the lane
   * before it, opening a blocker if generation produced a sealed layout.
   */
  _resolveReachability(lane, index) {
    // Starting lanes are completely clear, so every column is available.
    const previousReachable = isStartingLane(index)
      ? new Set(PLAYABLE_COLUMNS)
      : this.reachable.get(index - 1);

    const reachable = resolveReachability({
      lane,
      previousReachable,
      columns: PLAYABLE_COLUMNS,
      halfWidth: GAMEPLAY.playableHalfWidth,
      rng: this.repairRng
    });

    this.reachable.set(index, reachable);
    lane.metadata.reachableCount = reachable.size;
  }
}
