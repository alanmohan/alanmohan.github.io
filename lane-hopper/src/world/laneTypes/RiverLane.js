import { GAMEPLAY } from '../../config/gameplay.js';
import { COLORS } from '../../config/colors.js';
import { FloatingPlatform } from '../../entities/FloatingPlatform.js';
import { Lane, LaneTypes } from '../Lane.js';
import { differentiateFromPrevious } from '../generation.js';

/**
 * River lane the player must cross by riding floating logs.
 *
 * Logs use the same exact-division spacing scheme as road vehicles, so spacing
 * survives wrapping and the surface coverage is known at generation time. A
 * minimum coverage ratio is enforced so a crossing always exists.
 */

const MIN_SPEED_DELTA = 0.45;

/** At least this share of the lane must be covered by logs at any moment. */
const MIN_COVERAGE = 0.5;

export const RiverLane = {
  type: LaneTypes.RIVER,

  create({ id, index, seedLabel, rng, difficulty, previousLane }) {
    const lengthTiles = rng.pick(GAMEPLAY.platforms.lengthChoices);
    const length = lengthTiles * GAMEPLAY.tileSize;

    const rolledDirection = rng.sign();
    const rolledSpeed = rng.rangeOf(difficulty.platformSpeed);
    const { direction, speed } = differentiateFromPrevious({
      rng,
      previousLane,
      type: LaneTypes.RIVER,
      direction: rolledDirection,
      speed: rolledSpeed,
      speedRange: difficulty.platformSpeed,
      minSpeedDelta: MIN_SPEED_DELTA
    });

    const span = GAMEPLAY.entityWrapSpan;
    const period = span * 2;

    // Start from the difficulty gap, then add logs until coverage is viable.
    const maxSlot = length / MIN_COVERAGE;
    const requestedSlot = length + difficulty.platformGap;
    const slot = Math.min(requestedSlot, maxSlot);
    const count = Math.max(1, Math.floor(period / slot));
    const spacing = period / count;

    const lane = new Lane({
      id,
      index,
      type: LaneTypes.RIVER,
      seed: seedLabel,
      direction,
      speed,
      metadata: {
        platformLengthTiles: lengthTiles,
        spawnSpacing: spacing,
        gap: spacing - length,
        coverage: length / spacing,
        /** Phase offset for the subtle water shimmer in the renderer. */
        wavePhase: rng.range(0, Math.PI * 2)
      }
    });

    const phase = rng.range(0, spacing);
    for (let i = 0; i < count; i += 1) {
      let x = -span + phase + i * spacing;
      if (x > span) x -= period;
      lane.entities.push(
        new FloatingPlatform({
          id: `${id}:p${i}`,
          laneIndex: index,
          x,
          direction,
          speed,
          length,
          width: GAMEPLAY.platforms.width,
          height: GAMEPLAY.platforms.height,
          colorIndex: rng.int(0, COLORS.logBark.length - 1)
        })
      );
    }

    return lane;
  },

  update(lane, dt) {
    for (const platform of lane.entities) platform.step(dt);
  },

  /**
   * Wrapping runs after the simulation has already carried the player, and the
   * wrap span is far enough outside the playable area that a carried player
   * always dies from leaving the play area before their log is recycled. A
   * supported player can therefore never be teleported by a wrap.
   */
  wrap(lane) {
    for (const platform of lane.entities) platform.wrap(GAMEPLAY.entityWrapSpan);
  }
};
