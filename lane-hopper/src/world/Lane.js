import { laneToZ } from './coords.js';

export const LaneTypes = Object.freeze({
  GRASS: 'grass',
  ROAD: 'road',
  RIVER: 'river',
  RAILWAY: 'railway'
});

/** Lane types that can kill the player, used by generation safety rules. */
export const HAZARD_LANE_TYPES = Object.freeze([
  LaneTypes.ROAD,
  LaneTypes.RIVER,
  LaneTypes.RAILWAY
]);

export function isHazardLane(type) {
  return HAZARD_LANE_TYPES.includes(type);
}

/**
 * A single row of the world.
 *
 * This object is the authoritative gameplay state for the lane. Meshes are
 * built from it by the rendering layer and are never read back.
 */
export class Lane {
  /**
   * @param {object} options
   * @param {number} options.id            unique, monotonically increasing
   * @param {number} options.index         lane index; forward progress increases it
   * @param {string} options.type          one of LaneTypes
   * @param {string} options.seed          the seed string this lane was generated from
   * @param {-1|0|1} [options.direction]   horizontal travel direction of entities
   * @param {number} [options.speed]       entity speed in tiles per second
   * @param {object} [options.metadata]    per-type extra state
   */
  constructor({ id, index, type, seed, direction = 0, speed = 0, metadata = {} }) {
    this.id = id;
    this.index = index;
    this.type = type;
    this.seed = seed;
    this.direction = direction;
    this.speed = speed;

    /** Moving entities: vehicles, floating platforms, or the active train. */
    this.entities = [];

    /**
     * Static blockers keyed by column. Presence of a key means the tile cannot
     * be entered. The value carries render hints only.
     * @type {Map<number, {kind: string, variant: number, scale: number}>}
     */
    this.blockers = new Map();

    this.metadata = metadata;
  }

  /** World Z of the lane centre. */
  get z() {
    return laneToZ(this.index);
  }

  get isHazard() {
    return isHazardLane(this.type);
  }

  /** True when the tile at `column` cannot be entered. */
  isBlocked(column) {
    return this.blockers.has(column);
  }

  /** Columns of this lane that are free of static blockers. */
  openColumns(columns) {
    return columns.filter((column) => !this.blockers.has(column));
  }
}
