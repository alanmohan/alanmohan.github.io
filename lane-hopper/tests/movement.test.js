import { beforeEach, describe, expect, it } from 'vitest';
import { GAMEPLAY, MoveRejections } from '../src/config/gameplay.js';
import { Facing, Player, PlayerStates } from '../src/entities/Player.js';
import { Directions, attemptMove } from '../src/systems/MovementSystem.js';
import { World } from '../src/world/World.js';
import { LaneTypes } from '../src/world/Lane.js';

const HALF = GAMEPLAY.playableHalfWidth;
const STEP = 1 / 120;

/** Runs a started movement to completion. */
function finishMove(player) {
  let guard = 0;
  while (player.move.active && guard < 1000) {
    player.update(STEP);
    guard += 1;
  }
  expect(player.move.active).toBe(false);
}

describe('tile-based movement', () => {
  let world;
  let player;

  beforeEach(() => {
    world = new World({ seed: 'movement' });
    player = new Player(GAMEPLAY);
    player.reset({ laneIndex: 0, column: 0 });
  });

  it('moves exactly one tile forward', () => {
    expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(true);
    finishMove(player);
    expect(player.laneIndex).toBe(1);
    expect(player.column).toBe(0);
    expect(player.x).toBe(0);
  });

  it('moves exactly one tile in each direction', () => {
    const cases = [
      [Directions.FORWARD, { laneIndex: 1, column: 0 }],
      [Directions.BACKWARD, { laneIndex: -1, column: 0 }],
      [Directions.LEFT, { laneIndex: 0, column: -1 }],
      [Directions.RIGHT, { laneIndex: 0, column: 1 }]
    ];

    for (const [direction, expected] of cases) {
      player.reset({ laneIndex: 0, column: 0 });
      expect(attemptMove(player, world, direction).accepted).toBe(true);
      finishMove(player);
      expect(player.laneIndex).toBe(expected.laneIndex);
      expect(player.column).toBe(expected.column);
    }
  });

  it('faces the direction of travel', () => {
    const cases = [
      [Directions.FORWARD, Facing.FORWARD],
      [Directions.BACKWARD, Facing.BACKWARD],
      [Directions.LEFT, Facing.LEFT],
      [Directions.RIGHT, Facing.RIGHT]
    ];
    for (const [direction, facing] of cases) {
      player.reset({ laneIndex: 0, column: 0 });
      attemptMove(player, world, direction);
      expect(player.facing).toBe(facing);
    }
  });

  it('animates rather than teleporting, and snaps exactly on landing', () => {
    attemptMove(player, world, Directions.FORWARD);

    player.update(GAMEPLAY.moveDuration / 2);
    expect(player.move.active).toBe(true);
    expect(player.laneFloat).toBeGreaterThan(0);
    expect(player.laneFloat).toBeLessThan(1);
    // Still logically on the origin lane until the hop completes.
    expect(player.laneIndex).toBe(0);
    expect(player.y).toBeGreaterThan(0);

    finishMove(player);
    expect(player.laneIndex).toBe(1);
    expect(player.laneFloat).toBe(1);
    expect(player.y).toBe(0);
  });

  it('follows a hop arc that returns to the ground', () => {
    attemptMove(player, world, Directions.FORWARD);
    let peak = 0;
    while (player.move.active) {
      player.update(STEP);
      peak = Math.max(peak, player.y);
    }
    expect(peak).toBeGreaterThan(GAMEPLAY.hopHeight * 0.8);
    expect(peak).toBeLessThanOrEqual(GAMEPLAY.hopHeight + 1e-9);
    expect(player.y).toBe(0);
  });

  it('does not drift over many repeated moves', () => {
    for (let i = 0; i < 200; i += 1) {
      world.ensureAhead(player.laneIndex, Number.POSITIVE_INFINITY);
      // Clear the tile straight ahead so this test measures drift alone, not
      // the blocker rules that are covered separately.
      world.laneAt(player.laneIndex + 1).blockers.delete(0);

      expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(true);
      finishMove(player);
    }
    expect(player.laneIndex).toBe(200);
    // Exact integers, not accumulated floating point offsets.
    expect(player.x).toBe(0);
    expect(player.laneFloat).toBe(200);
  });

  it('survives rapid alternating input without corrupting position', () => {
    const pattern = [Directions.LEFT, Directions.RIGHT, Directions.FORWARD, Directions.BACKWARD];
    for (let i = 0; i < 120; i += 1) {
      attemptMove(player, world, pattern[i % pattern.length]);
      finishMove(player);
    }
    expect(Number.isInteger(player.column)).toBe(true);
    expect(Number.isInteger(player.laneIndex)).toBe(true);
    expect(player.x).toBe(player.column);
    expect(Math.abs(player.column)).toBeLessThanOrEqual(HALF);
  });

  it('refuses a second move while one is in progress', () => {
    expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(true);
    const second = attemptMove(player, world, Directions.FORWARD);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe(MoveRejections.BUSY);
  });

  it('refuses movement once dead', () => {
    player.die('vehicle');
    const result = attemptMove(player, world, Directions.FORWARD);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(MoveRejections.BUSY);
  });
});

describe('bounds and blockers', () => {
  let world;
  let player;

  beforeEach(() => {
    world = new World({ seed: 'bounds' });
    player = new Player(GAMEPLAY);
  });

  it('rejects sideways movement past the playable edge', () => {
    player.reset({ laneIndex: 0, column: HALF });
    const result = attemptMove(player, world, Directions.RIGHT);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(MoveRejections.BOUNDS);
    expect(player.column).toBe(HALF);
    expect(player.x).toBe(HALF);

    player.reset({ laneIndex: 0, column: -HALF });
    expect(attemptMove(player, world, Directions.LEFT).reason).toBe(MoveRejections.BOUNDS);
  });

  it('still allows movement inward from the edge', () => {
    player.reset({ laneIndex: 0, column: HALF });
    expect(attemptMove(player, world, Directions.LEFT).accepted).toBe(true);
    finishMove(player);
    expect(player.column).toBe(HALF - 1);
  });

  it('blocked movement leaves the position untouched', () => {
    player.reset({ laneIndex: 0, column: 0 });
    const target = world.laneAt(1);
    target.blockers.set(0, { kind: 'tree', variant: 0, scale: 1 });

    const result = attemptMove(player, world, Directions.FORWARD);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(MoveRejections.BLOCKED);
    expect(player.laneIndex).toBe(0);
    expect(player.column).toBe(0);
    expect(player.x).toBe(0);
    expect(player.move.active).toBe(false);
    expect(player.state).toBe(PlayerStates.IDLE);
  });

  it('allows stepping around a blocker', () => {
    player.reset({ laneIndex: 0, column: 0 });
    const target = world.laneAt(1);
    target.blockers.clear();
    target.blockers.set(0, { kind: 'tree', variant: 0, scale: 1 });

    expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(false);
    expect(attemptMove(player, world, Directions.RIGHT).accepted).toBe(true);
    finishMove(player);
    expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(true);
    finishMove(player);
    expect(player.laneIndex).toBe(1);
    expect(player.column).toBe(1);
  });

  it('refuses to enter a discarded lane', () => {
    player.reset({ laneIndex: 5, column: 0 });
    world.recycleBelow(5);
    expect(world.laneAt(4)).toBeNull();

    const result = attemptMove(player, world, Directions.BACKWARD);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(MoveRejections.DISCARDED);
    expect(player.laneIndex).toBe(5);
  });

  it('allows backward movement while the lane behind still exists', () => {
    player.reset({ laneIndex: 5, column: 0 });
    expect(attemptMove(player, world, Directions.BACKWARD).accepted).toBe(true);
    finishMove(player);
    expect(player.laneIndex).toBe(4);
  });
});

describe('movement while riding a log', () => {
  let world;
  let player;
  let river;

  beforeEach(() => {
    world = new World({ seed: 'riding' });
    player = new Player(GAMEPLAY);
    river = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RIVER);
    expect(river, 'seed should generate a river lane').toBeTruthy();
  });

  it('anchors a sideways hop to the nearest column, not the drifting position', () => {
    player.reset({ laneIndex: river.index, column: 3 });
    player.x = 3.4;
    player.support = river.entities[0];

    expect(attemptMove(player, world, Directions.RIGHT).accepted).toBe(true);
    finishMove(player);
    // round(3.4) + 1 = 4
    expect(player.column).toBe(4);
    expect(player.x).toBe(4);
  });

  it('snaps to the nearest column when hopping out of a river', () => {
    player.reset({ laneIndex: river.index, column: 2 });
    player.x = 2.62;

    expect(attemptMove(player, world, Directions.FORWARD).accepted).toBe(true);
    finishMove(player);
    expect(player.column).toBe(3);
    expect(player.x).toBe(3);
  });

  it('clamps a forward hop back inside bounds when carried past the edge', () => {
    player.reset({ laneIndex: river.index, column: HALF });
    player.x = HALF + 0.7;

    const result = attemptMove(player, world, Directions.FORWARD);
    expect(result.accepted).toBe(true);
    finishMove(player);
    expect(player.column).toBe(HALF);
  });

  it('marks a same-lane hop for carry but not a lane change', () => {
    player.reset({ laneIndex: river.index, column: 0 });
    player.support = river.entities[0];

    attemptMove(player, world, Directions.LEFT);
    expect(player.move.carryPlatformId).toBe(river.entities[0].id);

    player.reset({ laneIndex: river.index, column: 0 });
    player.support = river.entities[0];
    attemptMove(player, world, Directions.FORWARD);
    expect(player.move.carryPlatformId).toBeNull();
  });

  it('shiftMove moves the whole trajectory, keeping the hop length intact', () => {
    player.reset({ laneIndex: river.index, column: 0 });
    player.support = river.entities[0];
    attemptMove(player, world, Directions.RIGHT);

    const span = player.move.toX - player.move.fromX;
    player.shiftMove(0.25);
    expect(player.move.toX - player.move.fromX).toBeCloseTo(span, 12);
    expect(player.move.toX).toBeCloseTo(1.25, 12);
  });
});

describe('player state', () => {
  it('starts inactive before a run and reports lanes it occupies', () => {
    const player = new Player(GAMEPLAY);
    player.deactivate();
    expect(player.state).toBe(PlayerStates.INACTIVE);
    expect(player.isAlive).toBe(false);
    expect(player.canAcceptMove()).toBe(false);

    player.reset({ laneIndex: 4, column: 1 });
    expect(player.occupiedLanes()).toEqual([4]);

    const world = new World({ seed: 'occupied' });
    attemptMove(player, world, Directions.FORWARD);
    expect(player.occupiedLanes().sort()).toEqual([4, 5]);
  });

  it('reports a collision footprint centred on the interpolated position', () => {
    const player = new Player(GAMEPLAY);
    player.reset({ laneIndex: 2, column: -3 });
    const box = player.box();
    const size = GAMEPLAY.player.collisionSize;

    expect(box.maxX - box.minX).toBeCloseTo(size, 12);
    expect(box.maxZ - box.minZ).toBeCloseTo(size, 12);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(-3, 12);
    // Forward progress is -Z, so lane 2 sits at z = -2.
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(-2, 12);
  });

  it('advances the death timer and stops moving once dead', () => {
    const player = new Player(GAMEPLAY);
    player.reset({ laneIndex: 0, column: 0 });
    const world = new World({ seed: 'death' });
    attemptMove(player, world, Directions.FORWARD);

    player.die('train');
    expect(player.move.active).toBe(false);
    expect(player.deathCause).toBe('train');
    expect(player.deathProgress).toBe(0);

    player.update(GAMEPLAY.player.deathDuration / 2);
    expect(player.deathProgress).toBeCloseTo(0.5, 6);
    player.update(GAMEPLAY.player.deathDuration);
    expect(player.deathProgress).toBe(1);
  });

  it('ignores a second death so a cause cannot be overwritten', () => {
    const player = new Player(GAMEPLAY);
    player.reset();
    player.die('water');
    player.die('vehicle');
    expect(player.deathCause).toBe('water');
  });
});
