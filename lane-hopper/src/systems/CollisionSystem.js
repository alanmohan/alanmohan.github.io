import { DeathCauses, GAMEPLAY } from '../config/gameplay.js';
import { LaneTypes } from '../world/Lane.js';
import { laneToZ } from '../world/coords.js';
import { RailwayLane } from '../world/laneTypes/RailwayLane.js';
import { boxesOverlap } from '../utils/math.js';

/**
 * Collision and hazard resolution.
 *
 * Every test is an axis-aligned box or interval overlap in world coordinates.
 * All functions are pure so they can be unit tested without a renderer, and the
 * camera never participates in these calculations.
 */

/** @returns {import('../entities/Vehicle.js').Vehicle|null} the vehicle hit, if any */
export function findVehicleHit(playerBox, lane) {
  if (!lane || lane.type !== LaneTypes.ROAD) return null;
  const laneZ = laneToZ(lane.index);
  for (const vehicle of lane.entities) {
    if (boxesOverlap(playerBox, vehicle.box(laneZ))) return vehicle;
  }
  return null;
}

/**
 * @returns {import('../entities/Train.js').Train|null} the train hit, if any
 * Only active while the lane is in its PASSING phase.
 */
export function findTrainHit(playerBox, lane) {
  if (!lane || lane.type !== LaneTypes.RAILWAY) return null;
  if (!RailwayLane.isTrainActive(lane)) return null;
  const laneZ = laneToZ(lane.index);
  for (const train of lane.entities) {
    if (boxesOverlap(playerBox, train.box(laneZ))) return train;
  }
  return null;
}

/**
 * @returns {boolean} whether the player's footprint overlaps a shield token
 *
 * Uses the interpolated player box, like the hazard tests, so a token is picked
 * up as soon as the player reaches over its tile rather than only on landing.
 */
export function findShieldPickup(playerBox, token) {
  if (!token) return false;
  return boxesOverlap(playerBox, token.box());
}

/** True when the player has been carried past the edge of the play area. */
export function isOutOfBounds(x) {
  const limit = GAMEPLAY.playableHalfWidth + GAMEPLAY.river.outOfBoundsMargin;
  return Math.abs(x) > limit;
}

/**
 * Camera pressure. The pressure line is derived from the furthest lane reached,
 * which is exactly what the camera tracks, so it stays deterministic.
 */
export function isLeftBehind(playerLaneIndex, maxLaneReached, score) {
  const pressure = GAMEPLAY.cameraPressure;
  if (!pressure.enabled) return false;
  if (score < pressure.graceScore) return false;
  return playerLaneIndex < maxLaneReached - pressure.laneThreshold;
}

/**
 * Resolves every lethal hazard for the current frame.
 *
 * Order matters: instant hazards (vehicles, trains) are checked first, then
 * water support, then the play-area boundary and camera pressure. The first
 * cause found wins, so a single frame can never produce two deaths.
 *
 * A protected cause is skipped rather than returned, and the search carries on.
 * That matters: a shielded player who is simultaneously struck by a car and
 * carried off the edge of the crossing must still die from the edge, so the
 * remaining hazards cannot be short-circuited by the deflected one.
 *
 * @param {object} options
 * @param {import('../entities/Player.js').Player} options.player
 * @param {import('../world/World.js').World} options.world
 * @param {number} options.maxLaneReached
 * @param {number} options.score
 * @param {((cause: string) => boolean)|null} [options.isProtected]
 *        reports whether a cause is currently survivable; defaults to nothing
 *        being protected, which is the behaviour without a shield
 * @param {Array|null} [options.deflected]
 *        optional sink that receives every skipped hazard, in the style of the
 *        `events` array `World.update` fills
 * @returns {{cause: string, entity?: object}|null}
 */
export function resolveHazards({
  player,
  world,
  maxLaneReached,
  score,
  isProtected = null,
  deflected = null
}) {
  if (!player.isAlive) return null;

  const playerBox = player.box();

  /** Records a survivable hazard and reports that it must not end the run. */
  const isDeflected = (hazard) => {
    if (!isProtected || !isProtected(hazard.cause)) return false;
    if (deflected) deflected.push(hazard);
    return true;
  };

  // Vehicles and trains: the player stays vulnerable for the whole hop, so both
  // the lane being left and the lane being entered are tested.
  for (const laneIndex of player.occupiedLanes()) {
    const lane = world.laneAt(laneIndex);
    if (!lane) continue;

    const vehicle = findVehicleHit(playerBox, lane);
    if (vehicle) {
      const hazard = { cause: DeathCauses.VEHICLE, entity: vehicle };
      if (!isDeflected(hazard)) return hazard;
    }

    const train = findTrainHit(playerBox, lane);
    if (train) {
      const hazard = { cause: DeathCauses.TRAIN, entity: train };
      if (!isDeflected(hazard)) return hazard;
    }
  }

  // Water: only resolved once the hop has landed. Mid-air the player has not
  // committed to the destination tile yet.
  if (!player.move.active) {
    const lane = world.laneAt(player.laneIndex);
    if (lane && lane.type === LaneTypes.RIVER && !player.support) {
      const hazard = { cause: DeathCauses.WATER };
      if (!isDeflected(hazard)) return hazard;
    }
  }

  // These last two run through the same predicate as everything above, so what
  // is survivable is decided in exactly one place - the caller's protection
  // rule - rather than being implied by which checks were written where.
  if (isOutOfBounds(player.x)) {
    const hazard = { cause: DeathCauses.OUT_OF_BOUNDS };
    if (!isDeflected(hazard)) return hazard;
  }

  if (isLeftBehind(player.laneIndex, maxLaneReached, score)) {
    const hazard = { cause: DeathCauses.LEFT_BEHIND };
    if (!isDeflected(hazard)) return hazard;
  }

  return null;
}
