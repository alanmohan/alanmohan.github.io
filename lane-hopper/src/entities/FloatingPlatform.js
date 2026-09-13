import { boxFromCenter, wrapSpan } from '../utils/math.js';

/**
 * A floating log the player can ride across a river lane.
 *
 * `dx` is read by the simulation to carry a supported player, so the platform
 * must be stepped before support is evaluated and wrapped only afterwards.
 */
export class FloatingPlatform {
  constructor({ id, x, direction, speed, length, width, height, colorIndex, laneIndex }) {
    this.id = id;
    this.laneIndex = laneIndex;
    this.x = x;
    this.prevX = x;
    this.direction = direction;
    this.speed = speed;
    this.length = length;
    this.width = width;
    this.height = height;
    this.colorIndex = colorIndex;
  }

  get dx() {
    return this.x - this.prevX;
  }

  get left() {
    return this.x - this.length / 2;
  }

  get right() {
    return this.x + this.length / 2;
  }

  step(dt) {
    this.prevX = this.x;
    this.x += this.direction * this.speed * dt;
  }

  wrap(span) {
    const wrapped = wrapSpan(this.x, span);
    if (wrapped !== this.x) {
      this.prevX += wrapped - this.x;
      this.x = wrapped;
    }
  }

  /**
   * True when `x` rests on this platform. `grace` widens the platform slightly
   * so the player never drowns while visually standing on the log.
   */
  supports(x, grace = 0) {
    return x >= this.left - grace && x <= this.right + grace;
  }

  box(laneZ) {
    return boxFromCenter(this.x, laneZ, this.length, this.width);
  }
}
