import { beforeEach, describe, expect, it } from 'vitest';
import {
  DeathCauses,
  GAMEPLAY,
  SHIELDED_DEATH_CAUSES,
  ShieldRejections,
  isShieldedCause
} from '../src/config/gameplay.js';
import { GameStates } from '../src/core/GameState.js';
import { Simulation } from '../src/core/Simulation.js';
import { Player } from '../src/entities/Player.js';
import { ShieldToken } from '../src/entities/ShieldToken.js';
import { Vehicle } from '../src/entities/Vehicle.js';
import { findShieldPickup, resolveHazards } from '../src/systems/CollisionSystem.js';
import { Directions } from '../src/systems/MovementSystem.js';
import { ShieldSpawner } from '../src/systems/ShieldSpawner.js';
import { ShieldStates, ShieldSystem, ShieldTransitions } from '../src/systems/ShieldSystem.js';
import { Lane, LaneTypes } from '../src/world/Lane.js';
import { World } from '../src/world/World.js';

const SHIELD = GAMEPLAY.shield;
const STEP = GAMEPLAY.time.fixedStep;

// ---------------------------------------------------------------- helpers

function advance(sim, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) sim.update(STEP);
}

/** Runs a shield's timers forward without a whole simulation. */
function tick(shield, seconds) {
  const steps = Math.round(seconds / STEP);
  const transitions = [];
  for (let i = 0; i < steps; i += 1) {
    const transition = shield.update(STEP);
    if (transition) transitions.push(transition);
  }
  return transitions;
}

/** A shield holding `charges`, ready to be spent. */
function chargedShield(charges = 1) {
  const shield = new ShieldSystem();
  for (let i = 0; i < charges; i += 1) shield.addCharge();
  return shield;
}

/** A shield that is currently up, with `charges` still held. */
function activeShield(charges = 0) {
  const shield = chargedShield(charges + 1);
  shield.activate();
  return shield;
}

function startedSim(seed = 'shield') {
  const sim = new Simulation({ seedOverride: seed });
  sim.bootToMenu();
  sim.startRun();
  return sim;
}

/** Turns a lane into safe, empty grass, as the simulation suite does. */
function neutralise(lane) {
  if (!lane) return;
  lane.type = LaneTypes.GRASS;
  lane.entities.length = 0;
  lane.blockers.clear();
}

/** Walks forward along a corridor cleared one lane at a time. */
function walkForward(sim, count) {
  for (let i = 0; i < count; i += 1) {
    neutralise(sim.world.laneAt(sim.player.laneIndex + 1));
    sim.queueMove(Directions.FORWARD);
    advance(sim, GAMEPLAY.moveDuration + STEP * 4);
    if (sim.state.current !== GameStates.PLAYING) return;
  }
}

/** Replaces the lane under the player with a road carrying one car on their tile. */
function putCarOnPlayer(sim) {
  const lane = sim.world.laneAt(sim.player.laneIndex);
  const body = GAMEPLAY.vehicles.car;
  lane.type = LaneTypes.ROAD;
  lane.blockers.clear();
  lane.entities = [
    new Vehicle({
      id: 'test:car',
      kind: 'car',
      laneIndex: lane.index,
      x: sim.player.x,
      direction: 1,
      speed: 0,
      length: body.length,
      width: body.width,
      height: body.height,
      colorIndex: 0
    })
  ];
  return lane;
}

/** Minimal world stand-in, matching the collision suite. */
function stubWorld(lanes) {
  const map = new Map(lanes.map((lane) => [lane.index, lane]));
  return { laneAt: (index) => map.get(index) || null };
}

function playerAt(laneIndex, x) {
  const player = new Player(GAMEPLAY);
  player.reset({ laneIndex, column: Math.round(x) });
  player.x = x;
  return player;
}

/** A world generated well past the point where tokens may appear. */
function tokenWorld(seed = 'tokens', depth = 240) {
  const world = new World({ seed });
  world.ensureAhead(depth, Number.POSITIVE_INFINITY);
  return world;
}

/** Places one token, from a score comfortably past the minimum. */
function spawnToken(spawner, world, { score = SHIELD.minScore + 5, maxLaneReached = score } = {}) {
  return spawner.update({ world, score, maxLaneReached, canCollect: true });
}

// ------------------------------------------------------------------- tuning

describe('shield configuration', () => {
  it('matches the balance the power-up is documented with', () => {
    expect(SHIELD.minScore).toBe(15);
    expect(SHIELD.laneSpacing).toBe(12);
    expect(SHIELD.maxCharges).toBe(2);
    expect(SHIELD.duration).toBe(4);
    expect(SHIELD.cooldown).toBe(12);
  });

  it('keeps the shield unavailable for longer than it protects', () => {
    // Otherwise a second charge could be chained straight onto the first, and
    // the player could stay covered indefinitely.
    expect(SHIELD.cooldown).toBeGreaterThan(SHIELD.duration);
  });

  it('places tokens ahead of the player and never adjacent to each other', () => {
    expect(SHIELD.spawnLeadLanes).toBeGreaterThan(0);
    expect(SHIELD.laneSpacing).toBeGreaterThan(SHIELD.spawnLeadLanes);
  });

  it('sizes the pickup so it covers its own tile and no neighbouring one', () => {
    const reach = (SHIELD.tokenSize + GAMEPLAY.player.collisionSize) / 2;
    expect(reach).toBeGreaterThan(0);
    expect(reach).toBeLessThan(GAMEPLAY.tileSize);
  });

  it('freezes the tuning so gameplay cannot rewrite it at runtime', () => {
    expect(Object.isFrozen(SHIELD)).toBe(true);
    expect(Object.isFrozen(SHIELDED_DEATH_CAUSES)).toBe(true);
    expect(Object.isFrozen(ShieldRejections)).toBe(true);
  });

  it('protects the two instant hazards and nothing else', () => {
    expect([...SHIELDED_DEATH_CAUSES].sort()).toEqual(
      [DeathCauses.VEHICLE, DeathCauses.TRAIN].sort()
    );
    expect(isShieldedCause(DeathCauses.VEHICLE)).toBe(true);
    expect(isShieldedCause(DeathCauses.TRAIN)).toBe(true);
    expect(isShieldedCause(DeathCauses.WATER)).toBe(false);
    expect(isShieldedCause(DeathCauses.OUT_OF_BOUNDS)).toBe(false);
    expect(isShieldedCause(DeathCauses.LEFT_BEHIND)).toBe(false);
  });
});

// ------------------------------------------------------------------ charges

describe('shield charges', () => {
  let shield;

  beforeEach(() => {
    shield = new ShieldSystem();
  });

  it('starts empty and ready', () => {
    expect(shield.charges).toBe(0);
    expect(shield.state).toBe(ShieldStates.READY);
    expect(shield.isActive).toBe(false);
    expect(shield.canActivate()).toBe(false);
  });

  it('collects one charge per token', () => {
    expect(shield.addCharge()).toBe(true);
    expect(shield.charges).toBe(1);
    expect(shield.addCharge()).toBe(true);
    expect(shield.charges).toBe(2);
  });

  it('refuses charges beyond the cap, so tokens cannot be stockpiled', () => {
    for (let i = 0; i < SHIELD.maxCharges; i += 1) expect(shield.addCharge()).toBe(true);

    for (let i = 0; i < 10; i += 1) expect(shield.addCharge()).toBe(false);
    expect(shield.charges).toBe(SHIELD.maxCharges);
  });

  it('reports whether there is room for another charge', () => {
    expect(shield.canCollect).toBe(true);
    for (let i = 0; i < SHIELD.maxCharges; i += 1) shield.addCharge();
    expect(shield.canCollect).toBe(false);
  });

  it('frees room again once a charge is spent', () => {
    for (let i = 0; i < SHIELD.maxCharges; i += 1) shield.addCharge();
    shield.activate();
    expect(shield.canCollect).toBe(true);
  });
});

// --------------------------------------------------------------- activation

describe('shield activation', () => {
  it('refuses to activate without a charge', () => {
    const shield = new ShieldSystem();
    const result = shield.activate();
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(ShieldRejections.NO_CHARGE);
    expect(shield.state).toBe(ShieldStates.READY);
  });

  it('spends exactly one charge and raises the shield', () => {
    const shield = chargedShield(2);
    expect(shield.activate()).toEqual({ accepted: true });
    expect(shield.charges).toBe(1);
    expect(shield.state).toBe(ShieldStates.ACTIVE);
    expect(shield.activeRemaining).toBe(SHIELD.duration);
    expect(shield.cooldownRemaining).toBe(0);
  });

  it('refuses a second activation while a shield is already up', () => {
    const shield = activeShield(1);
    const result = shield.activate();
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(ShieldRejections.ALREADY_ACTIVE);
    // The refused attempt must not have cost the spare charge.
    expect(shield.charges).toBe(1);
    expect(shield.activeRemaining).toBe(SHIELD.duration);
  });

  it('refuses activation during the cooldown, even holding a charge', () => {
    const shield = activeShield(1);
    tick(shield, SHIELD.duration + 0.05);
    expect(shield.state).toBe(ShieldStates.COOLDOWN);

    const result = shield.activate();
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe(ShieldRejections.COOLING_DOWN);
    expect(shield.charges).toBe(1);
  });

  it('allows the next charge only once the cooldown has finished', () => {
    const shield = activeShield(1);
    tick(shield, SHIELD.duration + SHIELD.cooldown - 0.05);
    expect(shield.canActivate()).toBe(false);

    tick(shield, 0.1);
    expect(shield.state).toBe(ShieldStates.READY);
    expect(shield.canActivate()).toBe(true);
    expect(shield.activate().accepted).toBe(true);
    expect(shield.charges).toBe(0);
  });
});

// -------------------------------------------------------- active + cooldown

describe('shield timers', () => {
  it('stays up for the full duration and no longer', () => {
    const shield = activeShield();
    tick(shield, SHIELD.duration - 0.05);
    expect(shield.isActive).toBe(true);
    expect(shield.activeRemaining).toBeGreaterThan(0);
    expect(shield.activeRemaining).toBeLessThan(0.1);

    tick(shield, 0.1);
    expect(shield.isActive).toBe(false);
    expect(shield.activeRemaining).toBe(0);
  });

  it('starts the cooldown when the shield expires, not when it was raised', () => {
    const shield = activeShield();
    const transitions = tick(shield, SHIELD.duration + 0.05);

    expect(transitions).toEqual([ShieldTransitions.EXPIRED]);
    expect(shield.state).toBe(ShieldStates.COOLDOWN);
    // The whole cooldown is still ahead, so the total lockout is duration+cooldown.
    expect(shield.cooldownRemaining).toBeGreaterThan(SHIELD.cooldown - 0.1);
    expect(shield.cooldownRemaining).toBeLessThanOrEqual(SHIELD.cooldown);
  });

  it('reports both timers running out, in order and once each', () => {
    const shield = activeShield();
    const transitions = tick(shield, SHIELD.duration + SHIELD.cooldown + 1);
    expect(transitions).toEqual([ShieldTransitions.EXPIRED, ShieldTransitions.RECHARGED]);
    expect(shield.state).toBe(ShieldStates.READY);
    expect(shield.cooldownRemaining).toBe(0);
  });

  it('reports nothing while a window is still running', () => {
    const shield = activeShield();
    expect(tick(shield, SHIELD.duration / 2)).toEqual([]);
  });

  it('runs no timers while idle', () => {
    const shield = chargedShield();
    expect(tick(shield, 30)).toEqual([]);
    expect(shield.state).toBe(ShieldStates.READY);
    expect(shield.charges).toBe(1);
  });

  it('reset clears charges, state and both timers', () => {
    const shield = activeShield(1);
    tick(shield, SHIELD.duration + 1);
    shield.reset();

    expect(shield.charges).toBe(0);
    expect(shield.state).toBe(ShieldStates.READY);
    expect(shield.activeRemaining).toBe(0);
    expect(shield.cooldownRemaining).toBe(0);
    expect(shield.canActivate()).toBe(false);
  });
});

// --------------------------------------------------------------- protection

describe('what an active shield covers', () => {
  it('covers traffic and trains while it is up', () => {
    const shield = activeShield();
    expect(shield.protects(DeathCauses.VEHICLE)).toBe(true);
    expect(shield.protects(DeathCauses.TRAIN)).toBe(true);
  });

  it('never covers water, the play-area edge or falling behind', () => {
    const shield = activeShield();
    for (const cause of [
      DeathCauses.WATER,
      DeathCauses.OUT_OF_BOUNDS,
      DeathCauses.LEFT_BEHIND
    ]) {
      expect(shield.protects(cause), cause).toBe(false);
    }
  });

  it('covers nothing before activation, or once it has expired', () => {
    const held = chargedShield();
    expect(held.protects(DeathCauses.VEHICLE)).toBe(false);

    const spent = activeShield();
    tick(spent, SHIELD.duration + 0.05);
    expect(spent.isCoolingDown).toBe(true);
    expect(spent.protects(DeathCauses.VEHICLE)).toBe(false);
  });

  it('reports a given hazard once per activation, so its cue cannot repeat', () => {
    const shield = activeShield(1);
    const car = { id: 'car:1' };

    expect(shield.noteDeflection(car)).toBe(true);
    expect(shield.noteDeflection(car)).toBe(false);
    expect(shield.noteDeflection({ id: 'car:2' })).toBe(true);

    // A fresh activation is a fresh slate: the same car can be turned away again.
    tick(shield, SHIELD.duration + SHIELD.cooldown + 0.1);
    shield.activate();
    expect(shield.noteDeflection(car)).toBe(true);
  });
});

describe('hazard resolution with a shield', () => {
  function roadLane(index, vehicles) {
    const lane = new Lane({
      id: index + 1000,
      index,
      type: LaneTypes.ROAD,
      seed: 't',
      direction: 1
    });
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

  /** Protection rule matching an active shield. */
  const shielded = (cause) => isShieldedCause(cause);

  it('turns a vehicle away instead of ending the run', () => {
    const player = playerAt(0, 0);
    const world = stubWorld([roadLane(0, [car(0)])]);
    const deflected = [];

    const result = resolveHazards({
      player,
      world,
      maxLaneReached: 0,
      score: 0,
      isProtected: shielded,
      deflected
    });

    expect(result).toBeNull();
    expect(deflected).toHaveLength(1);
    expect(deflected[0].cause).toBe(DeathCauses.VEHICLE);
    expect(deflected[0].entity).toBeTruthy();
  });

  it('still ends the run in water', () => {
    const player = playerAt(0, 0);
    const river = new Lane({ id: 2, index: 0, type: LaneTypes.RIVER, seed: 't', direction: 1 });
    const world = stubWorld([river]);

    const result = resolveHazards({
      player,
      world,
      maxLaneReached: 0,
      score: 0,
      isProtected: shielded
    });
    expect(result.cause).toBe(DeathCauses.WATER);
  });

  it('still ends the run off the edge of the crossing', () => {
    const player = playerAt(0, 0);
    player.x = GAMEPLAY.playableHalfWidth + GAMEPLAY.river.outOfBoundsMargin + 0.2;
    const world = stubWorld([new Lane({ id: 1, index: 0, type: LaneTypes.GRASS, seed: 't' })]);

    const result = resolveHazards({
      player,
      world,
      maxLaneReached: 0,
      score: 0,
      isProtected: shielded
    });
    expect(result.cause).toBe(DeathCauses.OUT_OF_BOUNDS);
  });

  it('still ends the run for a player left behind', () => {
    const maxLane = 10 + GAMEPLAY.cameraPressure.laneThreshold + 1;
    const world = stubWorld([new Lane({ id: 1, index: 10, type: LaneTypes.GRASS, seed: 't' })]);

    const result = resolveHazards({
      player: playerAt(10, 0),
      world,
      maxLaneReached: maxLane,
      score: maxLane,
      isProtected: shielded
    });
    expect(result.cause).toBe(DeathCauses.LEFT_BEHIND);
  });

  it('does not let a deflected hazard hide an unprotected one in the same frame', () => {
    // Struck by a car and carried off the edge at once: the edge must still kill.
    const player = playerAt(0, 0);
    player.x = GAMEPLAY.playableHalfWidth + GAMEPLAY.river.outOfBoundsMargin + 0.2;
    const world = stubWorld([roadLane(0, [car(player.x)])]);
    const deflected = [];

    const result = resolveHazards({
      player,
      world,
      maxLaneReached: 0,
      score: 0,
      isProtected: shielded,
      deflected
    });

    expect(deflected.map((hazard) => hazard.cause)).toEqual([DeathCauses.VEHICLE]);
    expect(result.cause).toBe(DeathCauses.OUT_OF_BOUNDS);
  });

  it('behaves exactly as before when no protection is supplied', () => {
    const player = playerAt(0, 0);
    const world = stubWorld([roadLane(0, [car(0)])]);
    const result = resolveHazards({ player, world, maxLaneReached: 0, score: 0 });
    expect(result.cause).toBe(DeathCauses.VEHICLE);
  });
});

// -------------------------------------------------------------------- pickup

describe('token pickup test', () => {
  it('collects a token the player is standing on', () => {
    const token = new ShieldToken({ id: 't', laneIndex: 3, column: -2 });
    expect(findShieldPickup(playerAt(3, -2).box(), token)).toBe(true);
  });

  it('ignores a token on a neighbouring tile', () => {
    const token = new ShieldToken({ id: 't', laneIndex: 3, column: -2 });
    expect(findShieldPickup(playerAt(3, -1).box(), token)).toBe(false);
    expect(findShieldPickup(playerAt(4, -2).box(), token)).toBe(false);
  });

  it('is safe with no token in the world', () => {
    expect(findShieldPickup(playerAt(0, 0).box(), null)).toBe(false);
  });

  it('places a token on its own tile', () => {
    const token = new ShieldToken({ id: 't', laneIndex: 5, column: 3 });
    expect(token.x).toBe(3);
    expect(token.z).toBe(-5);
    const box = token.box();
    expect((box.minX + box.maxX) / 2).toBeCloseTo(3, 12);
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(-5, 12);
  });
});

// ------------------------------------------------------------------ spawning

describe('token spawning', () => {
  let world;
  let spawner;

  beforeEach(() => {
    world = tokenWorld('spawn-rules');
    spawner = new ShieldSpawner({ seed: 'spawn-rules' });
  });

  it('places nothing until the score has passed the minimum', () => {
    for (let score = 0; score <= SHIELD.minScore; score += 1) {
      const token = spawner.update({ world, score, maxLaneReached: score, canCollect: true });
      expect(token, `score ${score}`).toBeNull();
      expect(world.shieldToken).toBeNull();
    }

    expect(
      spawner.update({
        world,
        score: SHIELD.minScore + 1,
        maxLaneReached: SHIELD.minScore + 1,
        canCollect: true
      })
    ).toBeTruthy();
  });

  it('places a token on a grass lane, on a reachable tile', () => {
    const token = spawnToken(spawner, world);
    expect(token).toBeTruthy();

    const lane = world.laneAt(token.laneIndex);
    expect(lane.type).toBe(LaneTypes.GRASS);
    expect(lane.isBlocked(token.column)).toBe(false);
    expect(world.reachableColumns(token.laneIndex).has(token.column)).toBe(true);
    expect(Math.abs(token.column)).toBeLessThanOrEqual(GAMEPLAY.playableHalfWidth);
  });

  it('places it well ahead of the player, never underfoot', () => {
    const maxLaneReached = SHIELD.minScore + 5;
    const token = spawnToken(spawner, world, { score: maxLaneReached, maxLaneReached });
    expect(token.laneIndex).toBeGreaterThanOrEqual(maxLaneReached + SHIELD.spawnLeadLanes);
    expect(token.laneIndex).toBeLessThanOrEqual(world.maxIndex);
  });

  it('holds the world to one uncollected token at a time', () => {
    const first = spawnToken(spawner, world);
    expect(first).toBeTruthy();

    for (let i = 0; i < 50; i += 1) {
      expect(
        spawner.update({
          world,
          score: SHIELD.minScore + 60,
          maxLaneReached: SHIELD.minScore + 60,
          canCollect: true
        })
      ).toBeNull();
    }
    expect(world.shieldToken).toBe(first);
  });

  it('keeps consecutive tokens at least the configured spacing apart', () => {
    let previous = null;
    let progress = SHIELD.minScore + 1;

    for (let i = 0; i < 8; i += 1) {
      // Simulate collecting the previous token and pressing on.
      world.clearShieldToken();
      const token = spawner.update({
        world,
        score: progress,
        maxLaneReached: progress,
        canCollect: true
      });
      expect(token, `token ${i}`).toBeTruthy();

      if (previous !== null) {
        expect(token.laneIndex - previous, `token ${i}`).toBeGreaterThanOrEqual(
          SHIELD.laneSpacing
        );
      }
      previous = token.laneIndex;
      progress = token.laneIndex;
      world.ensureAhead(progress, Number.POSITIVE_INFINITY);
    }
  });

  it('measures the spacing from the last spawn even when a token went uncollected', () => {
    const first = spawnToken(spawner, world);
    // The token scrolls out of the window rather than being picked up.
    world.recycleBelow(first.laneIndex + 1);
    expect(world.shieldToken).toBeNull();

    const second = spawner.update({
      world,
      score: first.laneIndex,
      maxLaneReached: first.laneIndex,
      canCollect: true
    });
    expect(second.laneIndex - first.laneIndex).toBeGreaterThanOrEqual(SHIELD.laneSpacing);
  });

  it('places nothing while the player is already holding the maximum charges', () => {
    expect(
      spawner.update({
        world,
        score: SHIELD.minScore + 40,
        maxLaneReached: SHIELD.minScore + 40,
        canCollect: false
      })
    ).toBeNull();
    expect(world.shieldToken).toBeNull();

    // Spending a charge makes room, and only then does a token appear.
    expect(spawnToken(spawner, world, { score: SHIELD.minScore + 40, maxLaneReached: SHIELD.minScore + 40 })).toBeTruthy();
  });

  it('gives every token a distinct id, including across runs', () => {
    const ids = new Set();
    for (let run = 0; run < 3; run += 1) {
      spawner.reset('spawn-rules');
      const fresh = tokenWorld('spawn-rules');
      for (let i = 0; i < 4; i += 1) {
        fresh.clearShieldToken();
        const token = spawnToken(spawner, fresh, {
          score: SHIELD.minScore + 1 + i * SHIELD.laneSpacing * 2,
          maxLaneReached: SHIELD.minScore + 1 + i * SHIELD.laneSpacing * 2
        });
        ids.add(token.id);
      }
    }
    expect(ids.size).toBe(12);
  });

  it('places a token on the same tile for the same seed', () => {
    const a = spawnToken(new ShieldSpawner({ seed: 'repeat' }), tokenWorld('repeat'));
    const b = spawnToken(new ShieldSpawner({ seed: 'repeat' }), tokenWorld('repeat'));
    expect(b.laneIndex).toBe(a.laneIndex);
    expect(b.column).toBe(a.column);
  });

  it('does not depend on how many tokens were placed before it', () => {
    // The column comes from a stream keyed by lane index, so a spawner that has
    // already placed tokens agrees with one that has not.
    const busy = new ShieldSpawner({ seed: 'order' });
    const busyWorld = tokenWorld('order');
    let token = null;
    let progress = SHIELD.minScore + 1;
    for (let i = 0; i < 4; i += 1) {
      busyWorld.clearShieldToken();
      token = busy.update({ world: busyWorld, score: progress, maxLaneReached: progress, canCollect: true });
      progress = token.laneIndex;
      busyWorld.ensureAhead(progress, Number.POSITIVE_INFINITY);
    }

    const fresh = new ShieldSpawner({ seed: 'order' });
    const freshWorld = tokenWorld('order');
    freshWorld.ensureAhead(progress, Number.POSITIVE_INFINITY);
    const direct = fresh.update({
      world: freshWorld,
      score: token.laneIndex - SHIELD.spawnLeadLanes,
      maxLaneReached: token.laneIndex - SHIELD.spawnLeadLanes,
      canCollect: true
    });
    expect(direct.laneIndex).toBe(token.laneIndex);
    expect(direct.column).toBe(token.column);
  });

  it('drops a token whose lane is discarded behind the player', () => {
    const token = spawnToken(spawner, world);
    world.recycleBelow(token.laneIndex);
    expect(world.shieldToken).toBe(token);

    world.recycleBelow(token.laneIndex + 1);
    expect(world.shieldToken).toBeNull();
  });

  it('clears the token when the world is rebuilt for a new run', () => {
    spawnToken(spawner, world);
    world.reset('another-run');
    expect(world.shieldToken).toBeNull();
  });
});

// -------------------------------------------------------- through the game

describe('the shield through a run', () => {
  it('is empty when a run starts', () => {
    const sim = startedSim();
    expect(sim.shield.charges).toBe(0);
    expect(sim.shield.state).toBe(ShieldStates.READY);
    expect(sim.world.shieldToken).toBeNull();
  });

  it('collects a token the player hops onto, and reports it', () => {
    const sim = startedSim('collect');
    neutralise(sim.world.laneAt(1));
    sim.world.setShieldToken(new ShieldToken({ id: 'test:1', laneIndex: 1, column: 0 }));
    sim.drainEvents();

    walkForward(sim, 1);

    expect(sim.shield.charges).toBe(1);
    expect(sim.world.shieldToken).toBeNull();
    const event = sim.drainEvents().find((e) => e.type === 'shieldCollected');
    expect(event.charges).toBe(1);
  });

  it('offers a token of its own accord once the score is high enough', () => {
    const sim = startedSim('offer');
    walkForward(sim, SHIELD.minScore + 2);
    if (sim.state.current !== GameStates.PLAYING) return;

    expect(sim.score.score).toBeGreaterThan(SHIELD.minScore);
    expect(sim.world.shieldToken).toBeTruthy();
    expect(sim.world.shieldToken.laneIndex).toBeGreaterThan(sim.player.laneIndex);
  });

  it('offers nothing during the opening lanes', () => {
    const sim = startedSim('early');
    walkForward(sim, SHIELD.minScore - 3);
    if (sim.state.current !== GameStates.PLAYING) return;
    expect(sim.world.shieldToken).toBeNull();
  });

  it('activates a held charge and counts the window down', () => {
    const sim = startedSim('activate');
    sim.shield.addCharge();
    sim.drainEvents();

    expect(sim.activateShield()).toBe(true);
    expect(sim.shield.isActive).toBe(true);
    const event = sim.drainEvents().find((e) => e.type === 'shieldActivated');
    expect(event.charges).toBe(0);

    advance(sim, 1);
    expect(sim.shield.activeRemaining).toBeCloseTo(SHIELD.duration - 1, 3);
  });

  it('expires and then recharges as the run goes on', () => {
    const sim = startedSim('expire');
    sim.shield.addCharge();
    sim.activateShield();
    sim.drainEvents();

    advance(sim, SHIELD.duration + 0.05);
    expect(sim.drainEvents().some((e) => e.type === 'shieldExpired')).toBe(true);
    expect(sim.shield.isCoolingDown).toBe(true);

    advance(sim, SHIELD.cooldown + 0.05);
    expect(sim.drainEvents().some((e) => e.type === 'shieldReady')).toBe(true);
    expect(sim.shield.state).toBe(ShieldStates.READY);
  });

  it('reports a refused activation instead of silently doing nothing', () => {
    const sim = startedSim('refuse');
    sim.drainEvents();

    expect(sim.activateShield()).toBe(false);
    const event = sim.drainEvents().find((e) => e.type === 'shieldRejected');
    expect(event.reason).toBe(ShieldRejections.NO_CHARGE);
  });

  it('refuses activation outside a run, without queueing anything up', () => {
    const sim = new Simulation({ seedOverride: 'menu' });
    sim.bootToMenu();
    sim.shield.addCharge();

    expect(sim.activateShield()).toBe(false);
    expect(sim.shield.isActive).toBe(false);
    // Silent, like a movement request outside a run.
    expect(sim.drainEvents()).toEqual([]);
  });

  it('does not advance the timers while the game is paused', () => {
    const sim = startedSim('paused');
    sim.shield.addCharge();
    sim.activateShield();
    advance(sim, 0.5);

    const frozen = sim.shield.activeRemaining;
    sim.pause();
    advance(sim, 3);
    expect(sim.shield.activeRemaining).toBe(frozen);

    sim.resume();
    advance(sim, 0.5);
    expect(sim.shield.activeRemaining).toBeLessThan(frozen);
  });

  it('survives traffic while it is up, and reports the deflection once', () => {
    const sim = startedSim('deflect-run');
    sim.shield.addCharge();
    sim.activateShield();
    putCarOnPlayer(sim);
    sim.drainEvents();

    advance(sim, 1);

    expect(sim.state.current).toBe(GameStates.PLAYING);
    expect(sim.player.isAlive).toBe(true);
    const deflections = sim.drainEvents().filter((e) => e.type === 'shieldDeflect');
    expect(deflections).toHaveLength(1);
    expect(deflections[0].cause).toBe(DeathCauses.VEHICLE);
  });

  it('is struck by the same traffic the moment the shield expires', () => {
    const sim = startedSim('deflect-expiry');
    sim.shield.addCharge();
    sim.activateShield();
    putCarOnPlayer(sim);

    advance(sim, SHIELD.duration - 0.1);
    expect(sim.state.current).toBe(GameStates.PLAYING);

    advance(sim, 0.2);
    expect(sim.state.current).not.toBe(GameStates.PLAYING);
    expect(sim.player.deathCause).toBe(DeathCauses.VEHICLE);
  });

  it('does not save a shielded player from the water', () => {
    const sim = startedSim('drown');
    sim.shield.addCharge();
    sim.activateShield();

    const lane = sim.world.laneAt(sim.player.laneIndex);
    lane.type = LaneTypes.RIVER;
    lane.entities.length = 0;

    advance(sim, STEP * 2);
    expect(sim.player.deathCause).toBe(DeathCauses.WATER);
  });

  it('clears the shield and any token when the player dies', () => {
    const sim = startedSim('death-clears');
    sim.shield.addCharge();
    sim.shield.addCharge();
    sim.activateShield();
    sim.world.setShieldToken(new ShieldToken({ id: 'test:2', laneIndex: 5, column: 0 }));

    sim.forceDeath(DeathCauses.TRAIN);

    expect(sim.shield.charges).toBe(0);
    expect(sim.shield.state).toBe(ShieldStates.READY);
    expect(sim.shield.activeRemaining).toBe(0);
    expect(sim.world.shieldToken).toBeNull();
  });

  it('starts the next run with no charges carried over', () => {
    const sim = startedSim('restart-clears');
    sim.shield.addCharge();
    sim.activateShield();

    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.2);
    expect(sim.startRun()).toBe(true);

    expect(sim.shield.charges).toBe(0);
    expect(sim.shield.state).toBe(ShieldStates.READY);
    expect(sim.shield.cooldownRemaining).toBe(0);
    expect(sim.world.shieldToken).toBeNull();
    // Token spacing resets too, so the next run is not affected by the last one.
    expect(sim.shieldSpawner.lastSpawnLane).toBeNull();
  });

  it('clears the shield when a run is abandoned from the pause screen', () => {
    const sim = startedSim('abandon');
    sim.shield.addCharge();
    sim.activateShield();
    sim.world.setShieldToken(new ShieldToken({ id: 'test:3', laneIndex: 7, column: 1 }));

    sim.pause();
    expect(sim.returnToMenu()).toBe(true);
    expect(sim.shield.charges).toBe(0);
    expect(sim.shield.isActive).toBe(false);
    expect(sim.world.shieldToken).toBeNull();
  });

  it('cannot be farmed: a long run offers tokens at a bounded rate', () => {
    const sim = startedSim('farm');
    const lanes = new Set();

    for (let i = 0; i < 120 && sim.state.current === GameStates.PLAYING; i += 1) {
      walkForward(sim, 1);
      if (sim.world.shieldToken) lanes.add(sim.world.shieldToken.laneIndex);
      // Keep room for a charge throughout, which is the most permissive case
      // there is: nothing about the player's own state ever holds a token back.
      if (!sim.shield.canCollect) sim.shield.reset();
      sim.drainEvents();
    }

    const spawned = [...lanes].sort((a, b) => a - b);
    for (let i = 1; i < spawned.length; i += 1) {
      expect(spawned[i] - spawned[i - 1]).toBeGreaterThanOrEqual(SHIELD.laneSpacing);
    }
    // Well under one per lane travelled, which is the point of the spacing rule.
    expect(spawned.length).toBeLessThanOrEqual(
      Math.ceil(sim.score.maxLaneReached / SHIELD.laneSpacing) + 1
    );
  });

  it('reports the shield in the snapshot the debug panel and automation read', () => {
    const sim = startedSim('snapshot');
    sim.shield.addCharge();
    sim.shield.addCharge();
    sim.activateShield();
    sim.world.setShieldToken(new ShieldToken({ id: 'test:4', laneIndex: 9, column: -3 }));

    const snap = sim.snapshot();
    expect(snap.shieldCharges).toBe(1);
    expect(snap.shieldState).toBe(ShieldStates.ACTIVE);
    expect(snap.shieldActiveRemaining).toBeCloseTo(SHIELD.duration, 3);
    expect(snap.shieldCooldownRemaining).toBe(0);
    expect(snap.shieldTokenLane).toBe(9);
    expect(snap.shieldTokenColumn).toBe(-3);
  });
});
