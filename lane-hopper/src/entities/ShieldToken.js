import { GAMEPLAY } from '../config/gameplay.js';
import { boxFromCenter } from '../utils/math.js';
import { columnToX, laneToZ } from '../world/coords.js';

/**
 * A collectible shield token resting on a grass tile.
 *
 * Static, unlike vehicles and logs: it never moves, so it owns its own world
 * position rather than being handed a lane Z each frame. Purely logical, like
 * every other entity here - the renderer reads it and never writes to it.
 *
 * A token exists only while uncollected. Collecting it, or letting it scroll out
 * of the live lane window, removes it from the world entirely.
 */
export class ShieldToken {
  /**
   * @param {object} options
   * @param {string} options.id        unique for the lifetime of the page
   * @param {number} options.laneIndex lane the token sits on
   * @param {number} options.column    playable column the token sits on
   */
  constructor({ id, laneIndex, column }) {
    this.id = id;
    this.laneIndex = laneIndex;
    this.column = column;
    this.x = columnToX(column);
  }

  /** World Z of the tile the token rests on. */
  get z() {
    return laneToZ(this.laneIndex);
  }

  /** Axis-aligned pickup footprint, in the same space as the player's box. */
  box() {
    const size = GAMEPLAY.shield.tokenSize;
    return boxFromCenter(this.x, this.z, size, size);
  }
}
