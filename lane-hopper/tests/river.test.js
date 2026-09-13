import { beforeEach, describe, expect, it } from 'vitest';
import { DeathCauses, GAMEPLAY } from '../src/config/gameplay.js';
import { FloatingPlatform } from '../src/entities/FloatingPlatform.js';
import { Player } from '../src/entities/Player.js';
import { resolveHazards } from '../src/systems/CollisionSystem.js';
import {
  Directions,
  applyPlatformCarry,
  attemptMove,
  findSupportingPlatform
} from '../src/systems/MovementSystem.js';
import { SeededRandom } from '../src/core/SeededRandom.js';
import { Lane, LaneTypes } from '../src/world/Lane.js';
import { getDifficulty } from '../src/world/difficulty.js';
import { RiverLane } from '../src/world/laneTypes/RiverLane.js';

const GRACE = GAMEPLAY.platforms.supportGrace;
const SPAN = GAMEPLAY.entityWrapSpan;

function makePlatform(x, { length = 2, direction = 1, speed = 2, id = 'log' } = {}) {
  return new FloatingPlatform({
    id,
    laneIndex: 0,
    x,
    direction,
    speed,
    length,
    width: GAMEPLAY.platforms.width,
    height: GAMEPLAY.platforms.height,
    colorIndex: 0
  });
}

function riverLane(index, platforms) {
  const lane = new Lane({
    id: index + 1,
    index,
    type: LaneTypes.RIVER,
    seed: 'river-test',
    direction: 1,
    speed: 2,
    metadata: { platformLengthTiles: 2 }
  });
  lane.entities = platforms;
  return lane;
}

function stubWorld(lanes) {
  const map = new Map(lanes.map((lane) => [lane.index, lane]));
  return { laneAt: (index) => map.get(index) || null };
}

function playerOn(laneIndex, x) {
  const player = new Player(GAMEPLAY);
  player.reset({ laneIndex, column: Math.round(x) });
  player.x = x;
  return player;
}

describe('platform support', () => {
  it('supports a player standing anywhere along the log', () => {
    const platform = makePlatform(0, { length: 3 });
    expect(platform.supports(0)).toBe(true);
    expect(platform.supports(-1.4)).toBe(true);
    expect(platform.supports(1.4)).toBe(true);
  });

  it('does not support a player clearly off the log', () => {
    const platform = makePlatform(0, { length: 2 });
    expect(platform.supports(3)).toBe(false);
    expect(platform.supports(-3)).toBe(false);
  });

  it('applies the caller-supplied forgiveness band at the very edge', () => {
    const platform = makePlatform(0, { length: 2 });
    // The entity itself is exact; gameplay forgiveness is passed in by callers.
    expect(platform.supports(1.05)).toBe(false);
    expect(platform.supports(1 + GRACE * 0.5, GRACE)).toBe(true);
    expect(platform.supports(1 + GRACE * 2, GRACE)).toBe(false);
  });

  it('uses the configured grace when looked up through the movement system', () => {
    const lane = riverLane(0, [makePlatform(0, { length: 2 })]);
    // A fair landing on the very end of a log must not drown the player.
    expect(findSupportingPlatform(lane, 1 + GRACE * 0.5)).toBeTruthy();
    expect(findSupportingPlatform(lane, 1 + GRACE * 2)).toBeNull();
  });

  it('reports the correct log among several', () => {
    const lane = riverLane(0, [
      makePlatform(-6, { id: 'a' }),
      makePlatform(0, { id: 'b' }),
      makePlatform(6, { id: 'c' })
    ]);
    expect(findSupportingPlatform(lane, 0.4).id).toBe('b');
    expect(findSupportingPlatform(lane, -6.4).id).toBe('a');
    expect(findSupportingPlatform(lane, 3)).toBeNull();
  });

  it('returns nothing for lanes that are not rivers', () => {
    const grass = new Lane({ id: 1, index: 0, type: LaneTypes.GRASS, seed: 't' });
    grass.entities = [makePlatform(0)];
    expect(findSupportingPlatform(grass, 0)).toBeNull();
  });
});

describe('carry behaviour', () => {
  let lane;
  let world;
  let player;

  beforeEach(() => {
    lane = riverLane(0, [makePlatform(0, { length: 3, direction: 1, speed: 2 })]);
    world = stubWorld([lane]);
    player = playerOn(0, 0);
  });

  it('carries a supported player by the log displacement', () => {
    const platform = lane.entities[0];
    platform.step(0.25); // moves +0.5
    applyPlatformCarry(player, world);

    expect(player.x).toBeCloseTo(0.5, 12);
    expect(player.support).toBe(platform);
  });

  it('carries the player over many frames without divergence', () => {
    const platform = lane.entities[0];
    const dt = 1 / 120;
    for (let i = 0; i < 120; i += 1) {
      platform.step(dt);
      applyPlatformCarry(player, world);
    }
    // One second at 2 tiles/second.
    expect(player.x).toBeCloseTo(2, 6);
    // The player stays at the same offset within the log.
    expect(player.x - platform.x).toBeCloseTo(0, 6);
  });

  it('leaves an unsupported player alone', () => {
    lane.entities = [makePlatform(9, { length: 2 })];
    lane.entities[0].step(0.25);
    applyPlatformCarry(player, world);

    expect(player.x).toBe(0);
    expect(player.support).toBeNull();
  });

  it('clears support when the player is not on a river lane', () => {
    const grass = new Lane({ id: 9, index: 1, type: LaneTypes.GRASS, seed: 't' });
    const mixed = stubWorld([lane, grass]);
    const walker = playerOn(1, 0);
    walker.support = lane.entities[0];

    applyPlatformCarry(walker, mixed);
    expect(walker.support).toBeNull();
    expect(walker.x).toBe(0);
  });

  it('carries an in-progress sideways hop with the log', () => {
    const platform = lane.entities[0];
    player.support = platform;
    expect(attemptMove(player, world, Directions.RIGHT).accepted).toBe(true);

    platform.step(0.1); // +0.2
    applyPlatformCarry(player, world);

    // The destination moved along with the log, so the hop still spans one tile.
    expect(player.move.toX).toBeCloseTo(1.2, 12);
    expect(player.move.toX - player.move.fromX).toBeCloseTo(1, 12);
  });

  it('does not carry a hop that leaves the lane', () => {
    const platform = lane.entities[0];
    const grass = new Lane({ id: 9, index: 1, type: LaneTypes.GRASS, seed: 't' });
    const mixed = stubWorld([lane, grass]);
    player.support = platform;

    expect(attemptMove(player, mixed, Directions.FORWARD).accepted).toBe(true);
    const targetBefore = player.move.toX;
    platform.step(0.1);
    applyPlatformCarry(player, mixed);

    expect(player.move.toX).toBe(targetBefore);
  });

  it('ignores carry once the player is dead', () => {
    const platform = lane.entities[0];
    player.die(DeathCauses.WATER);
    platform.step(0.5);
    applyPlatformCarry(player, world);
    expect(player.x).toBe(0);
  });
});

describe('drowning and boundary handling', () => {
  it('drowns a player who lands in open water', () => {
    const lane = riverLane(0, [makePlatform(8, { length: 2 })]);
    const world = stubWorld([lane]);
    const player = playerOn(0, 0);

    applyPlatformCarry(player, world);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.WATER);
  });

  it('kills a player carried past the playable boundary', () => {
    const limit = GAMEPLAY.playableHalfWidth + GAMEPLAY.river.outOfBoundsMargin;
    const platform = makePlatform(limit + 0.5, { length: 3, direction: 1, speed: 2 });
    const lane = riverLane(0, [platform]);
    const world = stubWorld([lane]);
    const player = playerOn(0, limit + 0.5);

    applyPlatformCarry(player, world);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.OUT_OF_BOUNDS);
  });

  it('never teleports a supported player when logs are recycled', () => {
    // A log carries the player outward; the run must end from leaving the play
    // area before the log ever reaches the wrap span.
    const platform = makePlatform(GAMEPLAY.playableHalfWidth - 1, {
      length: 3,
      direction: 1,
      speed: 3
    });
    const lane = riverLane(0, [platform]);
    const world = stubWorld([lane]);
    const player = playerOn(0, GAMEPLAY.playableHalfWidth - 1);

    const dt = 1 / 120;
    let cause = null;
    let maxJump = 0;

    for (let i = 0; i < 2000 && !cause; i += 1) {
      const before = player.x;
      RiverLane.update(lane, dt);
      applyPlatformCarry(player, world);
      RiverLane.wrap(lane);
      maxJump = Math.max(maxJump, Math.abs(player.x - before));

      const hazard = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
      if (hazard) cause = hazard.cause;
    }

    expect(cause).toBe(DeathCauses.OUT_OF_BOUNDS);
    // Per-frame movement stayed at drift speed: no wrap-induced jump.
    expect(maxJump).toBeLessThan(0.1);
    // The log had not reached the recycle point when the run ended.
    expect(Math.abs(platform.x)).toBeLessThan(SPAN);
  });

  it('re-evaluates support after the carry step', () => {
    // Standing on the trailing edge of a log moving away from the player.
    const platform = makePlatform(0, { length: 2, direction: -1, speed: 2 });
    const lane = riverLane(0, [platform]);
    const world = stubWorld([lane]);
    const player = playerOn(0, 0);

    applyPlatformCarry(player, world);
    // The player rides with it rather than being left in the water.
    expect(player.support).toBe(platform);
    expect(player.x).toBeCloseTo(platform.x, 12);
  });
});

describe('generated river lanes', () => {
  it('keeps logs evenly spaced through thousands of wraps', () => {
    const generated = RiverLane.create({
      id: 1,
      index: 7,
      seedLabel: 'wrap-test',
      rng: new SeededRandom('wrap-test'),
      difficulty: getDifficulty(7),
      previousLane: null
    });

    const spacing = generated.metadata.spawnSpacing;
    const dt = 1 / 60;
    for (let i = 0; i < 5000; i += 1) {
      RiverLane.update(generated, dt);
      RiverLane.wrap(generated);
    }

    const xs = generated.entities.map((platform) => platform.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(spacing, 6);
    }
    for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(SPAN + 1e-9);
  });

  it('always leaves a log within reach of a crossing player', () => {
    // Coverage is enforced at generation time, so at any instant a decent share
    // of the playable width is standing room.
    const generated = RiverLane.create({
      id: 2,
      index: 40,
      seedLabel: 'coverage',
      rng: new SeededRandom('coverage'),
      difficulty: getDifficulty(40),
      previousLane: null
    });

    const columns = [];
    for (let c = -GAMEPLAY.playableHalfWidth; c <= GAMEPLAY.playableHalfWidth; c += 1) {
      columns.push(c);
    }

    let sawSupportedColumn = false;
    for (let step = 0; step < 600; step += 1) {
      RiverLane.update(generated, 1 / 60);
      RiverLane.wrap(generated);
      if (columns.some((c) => findSupportingPlatform(generated, c))) sawSupportedColumn = true;
    }
    expect(sawSupportedColumn).toBe(true);
    expect(generated.metadata.coverage).toBeGreaterThanOrEqual(0.5);
  });
});
