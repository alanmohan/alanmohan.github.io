import { GAMEPLAY } from '../../config/gameplay.js';
import { COLORS } from '../../config/colors.js';
import { Vehicle } from '../../entities/Vehicle.js';
import { Lane, LaneTypes } from '../Lane.js';
import { differentiateFromPrevious } from '../generation.js';

/**
 * Road lane with vehicles travelling horizontally.
 *
 * Spacing is derived from the wrap period rather than chosen per vehicle:
 * `spacing = 2 * wrapSpan / count`. Because every vehicle shares one speed and
 * the period divides evenly, wrapping preserves the spacing exactly and no two
 * vehicles can ever visually merge. The resulting gap is guaranteed to be at
 * least the difficulty band's `vehicleGap`, which keeps every road crossable.
 */

/** Minimum speed difference before two adjacent road lanes count as distinct. */
const MIN_SPEED_DELTA = 0.55;

export const RoadLane = {
  type: LaneTypes.ROAD,

  create({ id, index, seedLabel, rng, difficulty, previousLane }) {
    const kind = rng.chance(0.68) ? 'car' : 'truck';
    const body = GAMEPLAY.vehicles[kind];

    const rolledDirection = rng.sign();
    const rolledSpeed = rng.rangeOf(difficulty.vehicleSpeed);
    const { direction, speed } = differentiateFromPrevious({
      rng,
      previousLane,
      type: LaneTypes.ROAD,
      direction: rolledDirection,
      speed: rolledSpeed,
      speedRange: difficulty.vehicleSpeed,
      minSpeedDelta: MIN_SPEED_DELTA
    });

    const span = GAMEPLAY.entityWrapSpan;
    const period = span * 2;
    const minSlot = body.length + difficulty.vehicleGap;
    const count = Math.max(1, Math.floor(period / minSlot));
    const spacing = period / count;

    const lane = new Lane({
      id,
      index,
      type: LaneTypes.ROAD,
      seed: seedLabel,
      direction,
      speed,
      metadata: {
        vehicleType: kind,
        spawnSpacing: spacing,
        /** Clear space between successive vehicles. */
        gap: spacing - body.length,
        /** Deterministic dashed-line phase so lanes do not look copy-pasted. */
        dashOffset: rng.range(0, 1)
      }
    });

    const phase = rng.range(0, spacing);
    for (let i = 0; i < count; i += 1) {
      let x = -span + phase + i * spacing;
      if (x > span) x -= period;
      lane.entities.push(
        new Vehicle({
          id: `${id}:v${i}`,
          kind,
          laneIndex: index,
          x,
          direction,
          speed,
          length: body.length,
          width: body.width,
          height: body.height,
          colorIndex: rng.int(
            0,
            (kind === 'car' ? COLORS.carBodies.length : COLORS.truckCargo.length) - 1
          )
        })
      );
    }

    return lane;
  },

  update(lane, dt) {
    for (const vehicle of lane.entities) vehicle.step(dt);
  },

  wrap(lane) {
    for (const vehicle of lane.entities) vehicle.wrap(GAMEPLAY.entityWrapSpan);
  }
};
