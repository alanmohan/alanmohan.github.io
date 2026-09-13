import { LaneTypes } from '../Lane.js';
import { GrassLane } from './GrassLane.js';
import { RoadLane } from './RoadLane.js';
import { RiverLane } from './RiverLane.js';
import { RailwayLane } from './RailwayLane.js';

/**
 * Registry of lane behaviours, keyed by lane type.
 *
 * Adding a new lane type means writing one module with `create`, `update` and
 * `wrap`, registering it here, and giving it a weight in the difficulty bands.
 */
export const LANE_BEHAVIOURS = Object.freeze({
  [LaneTypes.GRASS]: GrassLane,
  [LaneTypes.ROAD]: RoadLane,
  [LaneTypes.RIVER]: RiverLane,
  [LaneTypes.RAILWAY]: RailwayLane
});

export function laneBehaviour(type) {
  const behaviour = LANE_BEHAVIOURS[type];
  if (!behaviour) throw new Error(`No behaviour registered for lane type "${type}"`);
  return behaviour;
}

export { GrassLane, RoadLane, RiverLane, RailwayLane };
export { RailwayPhases } from './RailwayLane.js';
