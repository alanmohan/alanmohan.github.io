import { GAMEPLAY, MoveRejections } from '../config/gameplay.js';
import { Facing } from '../entities/Player.js';
import { LaneTypes } from '../world/Lane.js';
import { clamp } from '../utils/math.js';

/**
 * Movement directions. `lane` is forward progress, `column` is sideways.
 */
export const Directions = Object.freeze({
  FORWARD: Object.freeze({ lane: 1, column: 0, facing: Facing.FORWARD, name: 'forward' }),
  BACKWARD: Object.freeze({ lane: -1, column: 0, facing: Facing.BACKWARD, name: 'backward' }),
  LEFT: Object.freeze({ lane: 0, column: -1, facing: Facing.LEFT, name: 'left' }),
  RIGHT: Object.freeze({ lane: 0, column: 1, facing: Facing.RIGHT, name: 'right' })
});

/**
 * Validates and starts a single tile movement.
 *
 * Rules enforced here:
 *   - one accepted movement advances exactly one tile;
 *   - blocked tiles and out-of-bounds columns are refused;
 *   - a lane that has already been discarded cannot be entered, which is what
 *     limits backward movement;
 *   - a player riding a log snaps to the nearest column, so a sideways hop is
 *     measured from `round(x)` rather than the drifting continuous position.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../world/World.js').World} world
 * @param {typeof Directions.FORWARD} direction
 * @returns {{accepted: boolean, reason?: string, toLane?: number, toColumn?: number}}
 */
export function attemptMove(player, world, direction) {
  if (!player.canAcceptMove()) {
    return { accepted: false, reason: MoveRejections.BUSY };
  }

  const half = GAMEPLAY.playableHalfWidth;
  // Riding a log leaves the player between columns; anchor to the nearest tile.
  const anchorColumn = clamp(Math.round(player.x), -half, half);
  const toColumn = anchorColumn + direction.column;
  const toLane = player.laneIndex + direction.lane;

  if (Math.abs(toColumn) > half) {
    return { accepted: false, reason: MoveRejections.BOUNDS };
  }

  const lane = world.laneAt(toLane);
  if (!lane) {
    return { accepted: false, reason: MoveRejections.DISCARDED };
  }

  if (lane.isBlocked(toColumn)) {
    return { accepted: false, reason: MoveRejections.BLOCKED };
  }

  // A sideways hop that stays on the same log is carried along with it.
  const carryPlatformId =
    direction.lane === 0 && player.support ? player.support.id : null;

  player.startMove({
    toLane,
    toX: toColumn,
    facing: direction.facing,
    carryPlatformId
  });

  return { accepted: true, toLane, toColumn };
}

/**
 * Applies platform carry movement.
 *
 * Follows the specified river update order: platforms have already moved, so
 * here support is detected, the supporting platform's frame displacement is
 * applied, and support is then re-evaluated for the new position.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../world/World.js').World} world
 */
export function applyPlatformCarry(player, world) {
  if (!player.isAlive) return;

  if (player.move.active) {
    // Mid-hop: only a same-lane hop that began on a log is carried, and the
    // whole trajectory is shifted so the landing point moves with the log.
    if (player.move.carryPlatformId === null) return;
    const lane = world.laneAt(player.move.fromLane);
    if (!lane) return;
    const platform = lane.entities.find((entity) => entity.id === player.move.carryPlatformId);
    if (!platform) return;
    player.shiftMove(platform.dx);
    return;
  }

  const lane = world.laneAt(player.laneIndex);
  if (!lane || lane.type !== LaneTypes.RIVER) {
    player.support = null;
    return;
  }

  const grace = GAMEPLAY.platforms.supportGrace;
  const carrier = findSupportingPlatform(lane, player.x, grace);
  if (carrier) {
    player.x += carrier.dx;
    // Re-evaluate support at the new position; a log can only stop supporting
    // the player here if it was already at the very edge of its surface.
    player.support = findSupportingPlatform(lane, player.x, grace) || carrier;
  } else {
    player.support = null;
  }
}

/**
 * @returns {import('../entities/FloatingPlatform.js').FloatingPlatform|null}
 */
export function findSupportingPlatform(lane, x, grace = GAMEPLAY.platforms.supportGrace) {
  if (!lane || lane.type !== LaneTypes.RIVER) return null;
  for (const platform of lane.entities) {
    if (platform.supports(x, grace)) return platform;
  }
  return null;
}
