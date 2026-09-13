import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Conversions between the logical grid and world space.
 *
 * Axis convention:
 *   - X is the column axis (left/right).
 *   - Z is the lane axis. Forward progress increases the lane index, which
 *     moves toward negative Z, so the camera looks down -Z.
 *   - Y is up. Walkable surfaces sit at y = 0.
 */

/** Lane index (may be fractional mid-hop) to world Z. */
export function laneToZ(laneIndex) {
  return -laneIndex * GAMEPLAY.tileSize;
}

/** World Z back to a fractional lane index. */
export function zToLane(z) {
  return -z / GAMEPLAY.tileSize;
}

/** Column index (may be fractional while riding a log) to world X. */
export function columnToX(column) {
  return column * GAMEPLAY.tileSize;
}

/** World X to the nearest column index. */
export function xToColumn(x) {
  return Math.round(x / GAMEPLAY.tileSize);
}

/** True when `column` is inside the playable width. */
export function isInsidePlayableColumns(column) {
  return Math.abs(column) <= GAMEPLAY.playableHalfWidth;
}
