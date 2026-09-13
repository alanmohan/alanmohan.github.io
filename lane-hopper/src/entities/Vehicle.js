import { boxFromCenter, wrapSpan } from '../utils/math.js';

/**
 * A car or truck travelling horizontally along a road lane.
 *
 * Motion is split into `step()` and `wrap()` so the simulation can follow the
 * required update order: everything moves first, wrapping happens later.
 */
export class Vehicle {
  constructor({ id, kind, x, direction, speed, length, width, height, colorIndex, laneIndex }) {
    this.id = id;
    this.kind = kind;
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

  /** Horizontal distance covered since the previous step. */
  get dx() {
    return this.x - this.prevX;
  }

  step(dt) {
    this.prevX = this.x;
    this.x += this.direction * this.speed * dt;
  }

  /** Recycles the vehicle to the far side, preserving even spacing exactly. */
  wrap(span) {
    const wrapped = wrapSpan(this.x, span);
    if (wrapped !== this.x) {
      // Keep dx meaningful after a wrap by shifting the previous position too.
      this.prevX += wrapped - this.x;
      this.x = wrapped;
    }
  }

  /** Axis-aligned collision box in world coordinates. */
  box(laneZ) {
    return boxFromCenter(this.x, laneZ, this.length, this.width);
  }
}
