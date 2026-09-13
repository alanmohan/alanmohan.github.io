import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Score tracking and best-score persistence.
 *
 * The score is the highest forward lane index reached during the run, relative
 * to the starting lane. Moving backward or sideways can never reduce it.
 */
export class ScoreSystem {
  /**
   * @param {import('./StorageSystem.js').StorageSystem} [storage]
   */
  constructor(storage = null) {
    this.storage = storage;
    this.bestKey = GAMEPLAY.storage.bestScore;
    this._best = storage ? storage.getInteger(this.bestKey, 0) : 0;
    this.reset();
  }

  /** Clears run state. The best score survives. */
  reset(startLane = 0) {
    this.startLane = startLane;
    this.maxLaneReached = startLane;
    this._score = 0;
    this.isNewRecord = false;
    this._lastMilestone = 0;
  }

  get score() {
    return this._score;
  }

  get best() {
    return this._best;
  }

  /**
   * Records forward progress.
   *
   * @param {number} laneIndex the player's current logical lane
   * @returns {{changed: boolean, milestone: number|null, record: boolean}}
   */
  update(laneIndex) {
    if (laneIndex <= this.maxLaneReached) {
      return { changed: false, milestone: null, record: false };
    }

    this.maxLaneReached = laneIndex;
    this._score = Math.max(0, laneIndex - this.startLane);

    let record = false;
    if (this._score > this._best) {
      this._best = this._score;
      this.isNewRecord = true;
      record = true;
      // Persist as soon as a new record is set, so a crash cannot lose it.
      this._persistBest();
    }

    let milestone = null;
    const interval = GAMEPLAY.scoreMilestone;
    if (interval > 0 && Math.floor(this._score / interval) > this._lastMilestone) {
      this._lastMilestone = Math.floor(this._score / interval);
      milestone = this._lastMilestone * interval;
    }

    return { changed: true, milestone, record };
  }

  /** Called when a run ends, to make sure the best score is stored. */
  commit() {
    if (this._score > this._best) this._best = this._score;
    this._persistBest();
  }

  _persistBest() {
    if (this.storage) this.storage.setInteger(this.bestKey, this._best);
  }
}
