import { GAMEPLAY } from '../config/gameplay.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { rangeInclusive } from '../utils/math.js';
import { getDifficulty } from './difficulty.js';
import { chooseLaneType } from './generation.js';
import { laneBehaviour } from './laneTypes/index.js';

/** The playable columns, computed once and shared read-only. */
export const PLAYABLE_COLUMNS = Object.freeze(
  rangeInclusive(-GAMEPLAY.playableHalfWidth, GAMEPLAY.playableHalfWidth)
);

/**
 * Builds lanes for a run.
 *
 * Two independent random streams keep generation deterministic:
 *   - a sequential "type" stream that walks the lane sequence in order, so the
 *     consecutive-run rules can be applied;
 *   - one private stream per lane index, so a lane's contents depend only on the
 *     run seed and its own index, never on how many numbers other lanes drew.
 */
export class LaneFactory {
  /**
   * @param {number|string} seed
   * @param {number} [firstId]
   *        Starting lane id. The World carries this across restarts so lane ids
   *        stay unique for the lifetime of the page, which lets the renderer
   *        detect a reused lane slot by comparing ids alone.
   */
  constructor(seed, firstId = 1) {
    this.seed = seed;
    this.typeRng = new SeededRandom(`${seed}|laneTypes`);
    this.nextId = firstId;
  }

  /**
   * Creates the lane at `index`.
   *
   * @param {object} options
   * @param {number} options.index
   * @param {string[]} options.history recent lane types, newest last
   * @param {import('./Lane.js').Lane|null} options.previousLane
   * @returns {import('./Lane.js').Lane}
   */
  create({ index, history, previousLane }) {
    const difficulty = getDifficulty(index);
    const type = chooseLaneType({ index, history, difficulty, rng: this.typeRng });

    const seedLabel = `${this.seed}|lane|${index}`;
    const rng = new SeededRandom(seedLabel);

    const lane = laneBehaviour(type).create({
      id: this.nextId,
      index,
      seedLabel,
      rng,
      difficulty,
      previousLane,
      columns: PLAYABLE_COLUMNS
    });

    this.nextId += 1;
    return lane;
  }
}
