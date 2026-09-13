import { GAMEPLAY } from '../../config/gameplay.js';
import { Train } from '../../entities/Train.js';
import { Lane, LaneTypes } from '../Lane.js';

/**
 * Railway lane: a fast, telegraphed hazard.
 *
 * Phase model, exactly as specified:
 *   IDLE -> WARNING -> PASSING -> COOLDOWN -> IDLE
 *
 * The train is only created when WARNING ends, and always spawns fully
 * off-screen, so it can never appear on top of the player without the warning
 * having run to completion. Collision is only possible during PASSING.
 */

export const RailwayPhases = Object.freeze({
  IDLE: 'IDLE',
  WARNING: 'WARNING',
  PASSING: 'PASSING',
  COOLDOWN: 'COOLDOWN'
});

export const RailwayLane = {
  type: LaneTypes.RAILWAY,

  create({ id, index, seedLabel, rng, difficulty }) {
    const carCount = rng.intOf(difficulty.trainCars);
    const { carLength, carGap } = GAMEPLAY.railway;
    const trainLength = carCount * carLength + (carCount - 1) * carGap;

    const lane = new Lane({
      id,
      index,
      type: LaneTypes.RAILWAY,
      seed: seedLabel,
      // Direction is re-rolled for each train, so trains can arrive from either
      // side. The lane-level value records the direction of the next train.
      direction: rng.sign(),
      speed: rng.rangeOf(difficulty.trainSpeed),
      metadata: {
        phase: RailwayPhases.IDLE,
        /** Seconds remaining in the current phase. */
        timer: rng.rangeOf(difficulty.trainIdle),
        /** Private deterministic stream for this lane's schedule. */
        rng: rng.fork('schedule'),
        idleRange: difficulty.trainIdle,
        speedRange: difficulty.trainSpeed,
        carRange: difficulty.trainCars,
        carCount,
        trainLength,
        /** Drives the blinking warning lamps in the renderer. */
        blink: 0,
        signalActive: false,
        trainId: 0
      }
    });

    return lane;
  },

  /**
   * Advances the lane's schedule.
   * @param {Lane} lane
   * @param {number} dt seconds
   * @param {{events?: Array}} [ctx] sink for audio/visual events
   */
  update(lane, dt, ctx = {}) {
    const meta = lane.metadata;
    const events = ctx.events;
    const railway = GAMEPLAY.railway;

    if (meta.phase === RailwayPhases.WARNING || meta.phase === RailwayPhases.PASSING) {
      meta.blink += dt * railway.blinkRate;
    }

    switch (meta.phase) {
      case RailwayPhases.IDLE: {
        meta.timer -= dt;
        if (meta.timer <= 0) {
          meta.phase = RailwayPhases.WARNING;
          meta.timer = meta.rng.rangeOf(railway.warning);
          meta.blink = 0;
          meta.signalActive = true;
          // Pick the approach side and pace for the train that is about to run.
          lane.direction = meta.rng.sign();
          lane.speed = meta.rng.rangeOf(meta.speedRange);
          meta.carCount = meta.rng.intOf(meta.carRange);
          meta.trainLength =
            meta.carCount * railway.carLength + (meta.carCount - 1) * railway.carGap;
          if (events) events.push({ type: 'trainWarning', laneIndex: lane.index });
        }
        break;
      }

      case RailwayPhases.WARNING: {
        meta.timer -= dt;
        if (meta.timer <= 0) {
          meta.phase = RailwayPhases.PASSING;
          meta.trainId += 1;
          const span = GAMEPLAY.entityWrapSpan;
          // Spawn entirely outside the wrap span, i.e. well off-screen.
          const startX = -lane.direction * (span + meta.trainLength / 2 + 1);
          lane.entities.push(
            new Train({
              id: `${lane.id}:t${meta.trainId}`,
              laneIndex: lane.index,
              x: startX,
              direction: lane.direction,
              speed: lane.speed,
              length: meta.trainLength,
              width: railway.width,
              height: railway.height,
              carCount: meta.carCount
            })
          );
          if (events) events.push({ type: 'trainPass', laneIndex: lane.index });
        }
        break;
      }

      case RailwayPhases.PASSING: {
        const span = GAMEPLAY.entityWrapSpan;
        let cleared = lane.entities.length === 0;
        for (const train of lane.entities) {
          train.step(dt);
          if (train.hasCleared(span + 1)) cleared = true;
        }
        if (cleared) {
          lane.entities.length = 0;
          meta.phase = RailwayPhases.COOLDOWN;
          meta.timer = meta.rng.rangeOf(railway.cooldown);
          meta.signalActive = false;
          meta.blink = 0;
        }
        break;
      }

      case RailwayPhases.COOLDOWN: {
        meta.timer -= dt;
        if (meta.timer <= 0) {
          meta.phase = RailwayPhases.IDLE;
          meta.timer = meta.rng.rangeOf(meta.idleRange);
        }
        break;
      }

      default:
        meta.phase = RailwayPhases.IDLE;
        meta.timer = meta.rng.rangeOf(meta.idleRange);
    }
  },

  /** Trains are destroyed rather than wrapped. */
  wrap() {},

  /** True while a train occupies the lane and can kill the player. */
  isTrainActive(lane) {
    return lane.metadata.phase === RailwayPhases.PASSING && lane.entities.length > 0;
  },

  /** True while the warning lamps should read as "on" this instant. */
  isSignalLit(lane) {
    const meta = lane.metadata;
    if (!meta.signalActive) return false;
    return Math.floor(meta.blink) % 2 === 0;
  }
};
