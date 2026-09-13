import { GAMEPLAY } from '../config/gameplay.js';
import { boxFromCenter, clamp, easeOutCubic, hopArc, lerp } from '../utils/math.js';
import { laneToZ } from '../world/coords.js';

export const PlayerStates = Object.freeze({
  /** Before a run starts; the character is not in the world yet. */
  INACTIVE: 'inactive',
  IDLE: 'idle',
  MOVING: 'moving',
  RIDING: 'riding',
  DEAD: 'dead'
});

/** Facing angles in radians, used by the renderer to turn the character. */
export const Facing = Object.freeze({
  FORWARD: 0,
  LEFT: Math.PI / 2,
  BACKWARD: Math.PI,
  RIGHT: -Math.PI / 2
});

/**
 * The player character, "Pip".
 *
 * Purely logical: no Three.js involvement. Positions are authoritative here and
 * the renderer only reads them.
 *
 * `x` is continuous (a ridden log drifts the player between columns) while
 * `column` and `laneIndex` are the logical grid tile, updated only when a
 * movement completes. `laneFloat` carries the fractional lane position during a
 * hop so collision volumes track the animation.
 */
export class Player {
  constructor(config = GAMEPLAY) {
    this.config = config;
    this.reset();
  }

  reset({ laneIndex = 0, column = 0 } = {}) {
    this.laneIndex = laneIndex;
    this.column = column;
    this.x = column;
    this.laneFloat = laneIndex;
    /** Hop height above the surface. */
    this.y = 0;
    this.facing = Facing.FORWARD;
    this.state = PlayerStates.IDLE;

    this.move = {
      active: false,
      fromLane: laneIndex,
      toLane: laneIndex,
      fromX: column,
      toX: column,
      elapsed: 0,
      duration: this.config.moveDuration,
      /** Platform the player was riding when a same-lane hop began, if any. */
      carryPlatformId: null
    };

    /** The platform currently under the player, or null. */
    this.support = null;
    this.deathCause = null;
    this.deathElapsed = 0;
  }

  /** Removes the character from play, e.g. while the title screen is showing. */
  deactivate() {
    this.state = PlayerStates.INACTIVE;
    this.move.active = false;
  }

  get isAlive() {
    return this.state !== PlayerStates.DEAD && this.state !== PlayerStates.INACTIVE;
  }

  /** True when a new movement command may be accepted. */
  canAcceptMove() {
    return this.isAlive && !this.move.active;
  }

  /** World Z of the player, interpolated during a hop. */
  get z() {
    return laneToZ(this.laneFloat);
  }

  /** Lanes whose entities must be tested this frame. */
  occupiedLanes() {
    if (this.move.active && this.move.fromLane !== this.move.toLane) {
      return [this.move.fromLane, this.move.toLane];
    }
    return [this.laneIndex];
  }

  /** Axis-aligned collision footprint at the current interpolated position. */
  box() {
    const size = this.config.player.collisionSize;
    return boxFromCenter(this.x, this.z, size, size);
  }

  /**
   * Begins a hop. Start and target are fixed up front and the position is
   * derived from them each frame, so no floating-point drift accumulates.
   */
  startMove({ toLane, toX, facing, carryPlatformId = null }) {
    this.move.active = true;
    this.move.fromLane = this.laneIndex;
    this.move.toLane = toLane;
    this.move.fromX = this.x;
    this.move.toX = toX;
    this.move.elapsed = 0;
    this.move.duration = this.config.moveDuration;
    this.move.carryPlatformId = carryPlatformId;
    if (facing !== undefined) this.facing = facing;
    this.state = PlayerStates.MOVING;
  }

  /**
   * Shifts an in-progress hop sideways so a player hopping along a moving log is
   * carried with it instead of snapping back to the log's old position.
   */
  shiftMove(dx) {
    if (!this.move.active || dx === 0) return;
    this.move.fromX += dx;
    this.move.toX += dx;
    this.x += dx;
  }

  /** Advances the hop animation, or the death timer once dead. */
  update(dt) {
    if (this.state === PlayerStates.DEAD) {
      this.deathElapsed += dt;
      return;
    }
    if (this.state === PlayerStates.INACTIVE) return;

    if (!this.move.active) {
      this.y = 0;
      this.state = this.support ? PlayerStates.RIDING : PlayerStates.IDLE;
      return;
    }

    this.move.elapsed += dt;
    const t = clamp(this.move.elapsed / this.move.duration, 0, 1);
    const eased = easeOutCubic(t);

    this.x = lerp(this.move.fromX, this.move.toX, eased);
    this.laneFloat = lerp(this.move.fromLane, this.move.toLane, eased);
    this.y = hopArc(t, this.config.hopHeight);

    if (t >= 1) {
      // Snap precisely to the destination tile.
      this.move.active = false;
      this.move.carryPlatformId = null;
      this.x = this.move.toX;
      this.laneIndex = this.move.toLane;
      this.laneFloat = this.move.toLane;
      this.column = Math.round(this.move.toX);
      this.y = 0;
      this.state = PlayerStates.IDLE;
    }
  }

  /** Normalised progress through the current hop, 0 when standing still. */
  get moveProgress() {
    if (!this.move.active) return 0;
    return clamp(this.move.elapsed / this.move.duration, 0, 1);
  }

  die(cause) {
    if (this.state === PlayerStates.DEAD) return;
    this.state = PlayerStates.DEAD;
    this.deathCause = cause;
    this.deathElapsed = 0;
    this.move.active = false;
    this.support = null;
    this.y = 0;
  }

  /** Normalised progress through the death animation. */
  get deathProgress() {
    return clamp(this.deathElapsed / this.config.player.deathDuration, 0, 1);
  }
}
