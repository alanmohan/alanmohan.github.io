import { boxFromCenter } from '../utils/math.js';

/**
 * A train crossing a railway lane.
 *
 * Trains exist only while their lane is in the PASSING phase; they are created
 * off-screen after the warning phase completes and destroyed once clear, so they
 * never wrap and can never appear on top of the player unannounced.
 */
export class Train {
  constructor({ id, x, direction, speed, length, width, height, carCount, laneIndex }) {
    this.id = id;
    this.laneIndex = laneIndex;
    this.x = x;
    this.prevX = x;
    this.direction = direction;
    this.speed = speed;
    this.length = length;
    this.width = width;
    this.height = height;
    this.carCount = carCount;
  }

  get dx() {
    return this.x - this.prevX;
  }

  step(dt) {
    this.prevX = this.x;
    this.x += this.direction * this.speed * dt;
  }

  /** True once the whole train has travelled past `edge`. */
  hasCleared(edge) {
    return this.direction > 0 ? this.x - this.length / 2 > edge : this.x + this.length / 2 < -edge;
  }

  box(laneZ) {
    return boxFromCenter(this.x, laneZ, this.length, this.width);
  }
}
