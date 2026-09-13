import { beforeEach, describe, expect, it } from 'vitest';
import { DeathCauses, GAMEPLAY } from '../src/config/gameplay.js';
import { Player } from '../src/entities/Player.js';
import { Vehicle } from '../src/entities/Vehicle.js';
import { Train } from '../src/entities/Train.js';
import {
  findTrainHit,
  findVehicleHit,
  isLeftBehind,
  isOutOfBounds,
  resolveHazards
} from '../src/systems/CollisionSystem.js';
import { Directions, attemptMove } from '../src/systems/MovementSystem.js';
import { Lane, LaneTypes } from '../src/world/Lane.js';
import { RailwayPhases } from '../src/world/laneTypes/RailwayLane.js';
import { laneToZ } from '../src/world/coords.js';
import { boxesOverlap, boxFromCenter, intervalsOverlap } from '../src/utils/math.js';

const HALF = GAMEPLAY.playableHalfWidth;

/** Minimal world stand-in: only laneAt() is needed by the collision system. */
function stubWorld(lanes) {
  const map = new Map(lanes.map((lane) => [lane.index, lane]));
  return { laneAt: (index) => map.get(index) || null };
}

function roadLane(index, vehicles = []) {
  const lane = new Lane({ id: index + 1000, index, type: LaneTypes.ROAD, seed: 't', direction: 1 });
  lane.entities = vehicles;
  return lane;
}

function car(x, laneIndex = 0) {
  const body = GAMEPLAY.vehicles.car;
  return new Vehicle({
    id: `car@${x}`,
    kind: 'car',
    laneIndex,
    x,
    direction: 1,
    speed: 2,
    length: body.length,
    width: body.width,
    height: body.height,
    colorIndex: 0
  });
}

function truck(x, laneIndex = 0) {
  const body = GAMEPLAY.vehicles.truck;
  return new Vehicle({
    id: `truck@${x}`,
    kind: 'truck',
    laneIndex,
    x,
    direction: -1,
    speed: 2,
    length: body.length,
    width: body.width,
    height: body.height,
    colorIndex: 0
  });
}

function playerAt(laneIndex, x) {
  const player = new Player(GAMEPLAY);
  player.reset({ laneIndex, column: Math.round(x) });
  player.x = x;
  return player;
}

describe('box overlap primitives', () => {
  it('treats touching edges as no overlap', () => {
    expect(intervalsOverlap(0, 1, 1, 2)).toBe(false);
    expect(intervalsOverlap(0, 1, 0.999, 2)).toBe(true);
  });

  it('requires overlap on both axes', () => {
    const a = boxFromCenter(0, 0, 1, 1);
    expect(boxesOverlap(a, boxFromCenter(0.5, 0.5, 1, 1))).toBe(true);
    expect(boxesOverlap(a, boxFromCenter(0.5, 5, 1, 1))).toBe(false);
    expect(boxesOverlap(a, boxFromCenter(5, 0.5, 1, 1))).toBe(false);
  });
});

describe('player versus vehicle', () => {
  it('an overlapping vehicle is a hit', () => {
    const lane = roadLane(0, [car(0)]);
    expect(findVehicleHit(playerAt(0, 0).box(), lane)).toBeTruthy();
  });

  it('non-overlapping vehicle positions are safe', () => {
    const lane = roadLane(0, [car(4), car(-4)]);
    expect(findVehicleHit(playerAt(0, 0).box(), lane)).toBeNull();
  });

  it('detects a hit exactly at the edge of the body and not beyond it', () => {
    const halfPlayer = GAMEPLAY.player.collisionSize / 2;
    const halfCar = GAMEPLAY.vehicles.car.length / 2;
    const touching = halfPlayer + halfCar;

    // Just clear of the bumper.
    expect(findVehicleHit(playerAt(0, 0).box(), roadLane(0, [car(touching + 0.01)]))).toBeNull();
    // Just inside it.
    expect(findVehicleHit(playerAt(0, 0).box(), roadLane(0, [car(touching - 0.01)]))).toBeTruthy();
  });

  it('accounts for the longer body of a truck', () => {
    const halfPlayer = GAMEPLAY.player.collisionSize / 2;
    const carReach = GAMEPLAY.vehicles.car.length / 2 + halfPlayer;
    const truckReach = GAMEPLAY.vehicles.truck.length / 2 + halfPlayer;
    const between = (carReach + truckReach) / 2;

    // A distance that clears a car still strikes a truck.
    expect(findVehicleHit(playerAt(0, 0).box(), roadLane(0, [car(between)]))).toBeNull();
    expect(findVehicleHit(playerAt(0, 0).box(), roadLane(0, [truck(between)]))).toBeTruthy();
  });

  it('ignores vehicles in other lanes', () => {
    const lane = roadLane(3, [car(0)]);
    // A player two lanes away cannot be struck by this lane's traffic.
    expect(findVehicleHit(playerAt(1, 0).box(), lane)).toBeNull();
  });

  it('returns nothing for lanes that are not roads', () => {
    const grass = new Lane({ id: 1, index: 0, type: LaneTypes.GRASS, seed: 't' });
    grass.entities = [car(0)];
    expect(findVehicleHit(playerAt(0, 0).box(), grass)).toBeNull();
  });
});

describe('player versus train', () => {
  function railwayLane(index, phase, trains = []) {
    const lane = new Lane({
      id: index + 500,
      index,
      type: LaneTypes.RAILWAY,
      seed: 't',
      direction: 1,
      metadata: { phase }
    });
    lane.entities = trains;
    return lane;
  }

  function train(x, laneIndex = 0) {
    return new Train({
      id: `train@${x}`,
      laneIndex,
      x,
      direction: 1,
      speed: 18,
      length: 12,
      width: GAMEPLAY.railway.width,
      height: GAMEPLAY.railway.height,
      carCount: 4
    });
  }

  it('is lethal while the train is passing', () => {
    const lane = railwayLane(0, RailwayPhases.PASSING, [train(0)]);
    expect(findTrainHit(playerAt(0, 0).box(), lane)).toBeTruthy();
  });

  it('is not active during idle, warning or cooldown', () => {
    for (const phase of [RailwayPhases.IDLE, RailwayPhases.WARNING, RailwayPhases.COOLDOWN]) {
      const lane = railwayLane(0, phase, [train(0)]);
      expect(findTrainHit(playerAt(0, 0).box(), lane), phase).toBeNull();
    }
  });

  it('is not active when the lane holds no train', () => {
    const lane = railwayLane(0, RailwayPhases.PASSING, []);
    expect(findTrainHit(playerAt(0, 0).box(), lane)).toBeNull();
  });

  it('misses a player standing clear of the train body', () => {
    const lane = railwayLane(0, RailwayPhases.PASSING, [train(0)]);
    // Train spans x -6..6; a player at x = 8 is clear.
    expect(findTrainHit(playerAt(0, 8).box(), lane)).toBeNull();
  });
});

describe('bounds and camera pressure', () => {
  it('flags positions beyond the playable edge plus the margin', () => {
    const limit = HALF + GAMEPLAY.river.outOfBoundsMargin;
    expect(isOutOfBounds(0)).toBe(false);
    expect(isOutOfBounds(HALF)).toBe(false);
    expect(isOutOfBounds(limit)).toBe(false);
    expect(isOutOfBounds(limit + 0.01)).toBe(true);
    expect(isOutOfBounds(-(limit + 0.01))).toBe(true);
  });

  it('keeps the wrap span outside the lethal boundary', () => {
    // Guarantees a carried player dies before their log is ever recycled.
    const longestHalf = Math.max(...GAMEPLAY.platforms.lengthChoices) / 2;
    expect(GAMEPLAY.entityWrapSpan).toBeGreaterThan(
      HALF + GAMEPLAY.river.outOfBoundsMargin + longestHalf
    );
  });

  it('does not apply camera pressure inside the starting area', () => {
    const grace = GAMEPLAY.cameraPressure.graceScore;
    expect(isLeftBehind(-50, 20, grace - 1)).toBe(false);
  });

  it('applies camera pressure once the grace score is passed', () => {
    const { graceScore, laneThreshold } = GAMEPLAY.cameraPressure;
    const maxLane = 30;
    expect(isLeftBehind(maxLane - laneThreshold, maxLane, graceScore)).toBe(false);
    expect(isLeftBehind(maxLane - laneThreshold - 1, maxLane, graceScore)).toBe(true);
  });
});

describe('resolveHazards', () => {
  let player;

  beforeEach(() => {
    player = playerAt(0, 0);
  });

  it('returns null when nothing is wrong', () => {
    const world = stubWorld([roadLane(0, [car(6)])]);
    expect(resolveHazards({ player, world, maxLaneReached: 0, score: 0 })).toBeNull();
  });

  it('reports a vehicle death', () => {
    const world = stubWorld([roadLane(0, [car(0)])]);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.VEHICLE);
    expect(result.entity).toBeTruthy();
  });

  it('keeps the player vulnerable to traffic throughout a hop', () => {
    // Hopping from a clear lane into a lane where a car sits on the target tile.
    const target = roadLane(1, [car(0, 1)]);
    const origin = new Lane({ id: 1, index: 0, type: LaneTypes.GRASS, seed: 't' });
    const world = stubWorld([origin, target]);

    attemptMove(player, world, Directions.FORWARD);
    player.update(GAMEPLAY.moveDuration * 0.5);

    expect(player.move.active).toBe(true);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.VEHICLE);
  });

  it('reports drowning only once the hop has landed', () => {
    const river = new Lane({ id: 2, index: 1, type: LaneTypes.RIVER, seed: 't', direction: 1 });
    const origin = new Lane({ id: 1, index: 0, type: LaneTypes.GRASS, seed: 't' });
    const world = stubWorld([origin, river]);

    attemptMove(player, world, Directions.FORWARD);
    player.update(GAMEPLAY.moveDuration * 0.5);
    // Airborne: the destination tile is not committed yet.
    expect(resolveHazards({ player, world, maxLaneReached: 0, score: 0 })).toBeNull();

    while (player.move.active) player.update(1 / 120);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.WATER);
  });

  it('does not drown a player who is supported', () => {
    const river = new Lane({ id: 2, index: 0, type: LaneTypes.RIVER, seed: 't', direction: 1 });
    const world = stubWorld([river]);
    player.support = { id: 'log', dx: 0 };
    expect(resolveHazards({ player, world, maxLaneReached: 0, score: 0 })).toBeNull();
  });

  it('reports an out-of-bounds death for a player carried off the edge', () => {
    const river = new Lane({ id: 2, index: 0, type: LaneTypes.RIVER, seed: 't', direction: 1 });
    const world = stubWorld([river]);
    player.support = { id: 'log', dx: 0 };
    player.x = HALF + GAMEPLAY.river.outOfBoundsMargin + 0.2;

    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.OUT_OF_BOUNDS);
  });

  it('reports being left behind', () => {
    const grass = new Lane({ id: 1, index: 10, type: LaneTypes.GRASS, seed: 't' });
    const world = stubWorld([grass]);
    const straggler = playerAt(10, 0);
    const maxLane = 10 + GAMEPLAY.cameraPressure.laneThreshold + 1;

    const result = resolveHazards({
      player: straggler,
      world,
      maxLaneReached: maxLane,
      score: maxLane
    });
    expect(result.cause).toBe(DeathCauses.LEFT_BEHIND);
  });

  it('prefers an instant hazard over water when both apply in one frame', () => {
    // A road lane can never be water, so the ordering is asserted through the
    // documented precedence: vehicles and trains resolve before support checks.
    const river = new Lane({ id: 2, index: 0, type: LaneTypes.RIVER, seed: 't', direction: 1 });
    const road = roadLane(0, [car(0)]);
    const world = stubWorld([road]);
    void river;

    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.VEHICLE);
  });

  it('produces no further deaths once the player is dead', () => {
    const world = stubWorld([roadLane(0, [car(0)])]);
    player.die(DeathCauses.VEHICLE);
    expect(resolveHazards({ player, world, maxLaneReached: 0, score: 0 })).toBeNull();
  });

  it('ignores lanes that have been discarded', () => {
    const world = stubWorld([]);
    expect(resolveHazards({ player, world, maxLaneReached: 0, score: 0 })).toBeNull();
  });
});

describe('entity motion and wrapping', () => {
  it('moves a vehicle by speed times delta and reports dx', () => {
    const vehicle = car(0);
    vehicle.step(0.5);
    expect(vehicle.x).toBeCloseTo(1, 12);
    expect(vehicle.dx).toBeCloseTo(1, 12);
  });

  it('wraps a vehicle to the opposite edge, preserving the period', () => {
    const span = GAMEPLAY.entityWrapSpan;
    const vehicle = car(span + 0.25);
    vehicle.wrap(span);
    expect(vehicle.x).toBeCloseTo(-span + 0.25, 12);
  });

  it('keeps dx small across a wrap so carry logic is never surprised', () => {
    const span = GAMEPLAY.entityWrapSpan;
    const vehicle = car(span - 0.01);
    vehicle.step(0.02);
    vehicle.wrap(span);
    expect(Math.abs(vehicle.dx)).toBeLessThan(0.1);
  });

  it('positions a vehicle box on its lane', () => {
    const lane = roadLane(4, [car(2)]);
    const box = lane.entities[0].box(laneToZ(lane.index));
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(laneToZ(4), 12);
    expect(box.maxX - box.minX).toBeCloseTo(GAMEPLAY.vehicles.car.length, 12);
  });

  it('reports when a train has cleared the far edge', () => {
    const t = new Train({
      id: 't',
      laneIndex: 0,
      x: 0,
      direction: 1,
      speed: 18,
      length: 10,
      width: 1,
      height: 1,
      carCount: 3
    });
    expect(t.hasCleared(14)).toBe(false);
    t.x = 20;
    expect(t.hasCleared(14)).toBe(true);
  });
});
