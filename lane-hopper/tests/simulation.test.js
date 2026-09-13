import { beforeEach, describe, expect, it } from 'vitest';
import { DeathCauses, GAMEPLAY } from '../src/config/gameplay.js';
import { GameStates } from '../src/core/GameState.js';
import { Simulation } from '../src/core/Simulation.js';
import { PlayerStates } from '../src/entities/Player.js';
import { Directions } from '../src/systems/MovementSystem.js';
import { LaneTypes } from '../src/world/Lane.js';

const STEP = GAMEPLAY.time.fixedStep;

function advance(sim, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) sim.update(STEP);
}

/** Queues one move and runs it to completion. */
function hop(sim, direction) {
  sim.queueMove(direction);
  advance(sim, GAMEPLAY.moveDuration + STEP * 4);
}

/**
 * Turns a lane into safe, empty grass.
 *
 * These tests exercise the run lifecycle, generation window and scoring, so the
 * player needs a corridor that cannot kill them. Hazard behaviour itself is
 * covered by the collision, river and railway suites.
 */
function neutralise(lane) {
  if (!lane) return;
  lane.type = LaneTypes.GRASS;
  lane.entities.length = 0;
  lane.blockers.clear();
}

/** Walks forward `count` lanes along a corridor cleared one lane at a time. */
function walkForward(sim, count) {
  for (let i = 0; i < count; i += 1) {
    neutralise(sim.world.laneAt(sim.player.laneIndex + 1));
    hop(sim, Directions.FORWARD);
    if (sim.state.current !== GameStates.PLAYING) return;
  }
}

function startedSim(seed = 'sim') {
  const sim = new Simulation({ seedOverride: seed });
  sim.bootToMenu();
  sim.startRun();
  return sim;
}

describe('simulation lifecycle', () => {
  it('boots into the menu with the player out of play', () => {
    const sim = new Simulation({ seedOverride: 'boot' });
    expect(sim.state.current).toBe(GameStates.BOOT);
    expect(sim.bootToMenu()).toBe(true);
    expect(sim.state.current).toBe(GameStates.MENU);
    expect(sim.player.state).toBe(PlayerStates.INACTIVE);
    expect(sim.isPlayerActive).toBe(false);
  });

  it('refuses to boot twice', () => {
    const sim = new Simulation({ seedOverride: 'boot' });
    sim.bootToMenu();
    expect(sim.bootToMenu()).toBe(false);
  });

  it('starts a run with the player on the spawn tile', () => {
    const sim = startedSim();
    expect(sim.state.current).toBe(GameStates.PLAYING);
    expect(sim.player.laneIndex).toBe(0);
    expect(sim.player.column).toBe(0);
    expect(sim.score.score).toBe(0);
    expect(sim.world.laneAt(0).type).toBe(LaneTypes.GRASS);
  });

  it('does not start a run while one is already playing', () => {
    const sim = startedSim();
    expect(sim.startRun()).toBe(false);
  });

  it('reuses a fixed seed override for every run', () => {
    const sim = startedSim('fixed');
    const firstSeed = sim.seed;
    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.1);
    sim.startRun();
    expect(sim.seed).toBe(firstSeed);
  });
});

describe('input queueing', () => {
  let sim;

  beforeEach(() => {
    sim = startedSim('queue');
  });

  it('buffers at most the configured number of moves', () => {
    for (let i = 0; i < 10; i += 1) sim.queueMove(Directions.FORWARD);
    expect(sim.queuedMoveCount).toBe(GAMEPLAY.maxInputQueue);
  });

  it('consumes one queued move per hop', () => {
    sim.queueMove(Directions.FORWARD);
    sim.queueMove(Directions.FORWARD);
    expect(sim.queuedMoveCount).toBe(2);

    advance(sim, STEP);
    expect(sim.queuedMoveCount).toBe(1);
    expect(sim.player.move.active).toBe(true);

    // The second move waits until the first hop lands.
    advance(sim, GAMEPLAY.moveDuration + STEP * 2);
    expect(sim.queuedMoveCount).toBe(0);
  });

  it('ignores input outside the playing state', () => {
    sim.pause();
    expect(sim.queueMove(Directions.FORWARD)).toBe(false);
    expect(sim.queuedMoveCount).toBe(0);
  });

  it('drops queued moves on resume so nothing fires unexpectedly', () => {
    sim.queueMove(Directions.FORWARD);
    sim.pause();
    sim.resume();
    expect(sim.queuedMoveCount).toBe(0);
  });

  it('emits an event for accepted and refused moves', () => {
    const target = sim.world.laneAt(1);
    target.blockers.set(0, { kind: 'tree', variant: 0, scale: 1 });

    sim.queueMove(Directions.FORWARD);
    advance(sim, STEP);
    const refused = sim.drainEvents().find((e) => e.type === 'moveRejected');
    expect(refused.reason).toBe('blocked');

    target.blockers.delete(0);
    sim.queueMove(Directions.FORWARD);
    advance(sim, STEP);
    expect(sim.drainEvents().some((e) => e.type === 'move')).toBe(true);
  });
});

describe('pause freezes the world', () => {
  it('stops entities, timers, score and movement', () => {
    const sim = startedSim('pause');
    walkForward(sim, 2);
    expect(sim.state.current).toBe(GameStates.PLAYING);

    // Snapshot everything that moves.
    const road = [...sim.world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD);
    const railway = [...sim.world.lanes.values()].find((lane) => lane.type === LaneTypes.RAILWAY);
    expect(road).toBeTruthy();

    const beforeVehicles = road.entities.map((entity) => entity.x);
    const beforeTimer = railway ? railway.metadata.timer : null;
    const beforePhase = railway ? railway.metadata.phase : null;
    const beforeLane = sim.player.laneIndex;
    const beforeScore = sim.score.score;
    const beforeLaneCount = sim.world.laneCount;
    const beforeMaxIndex = sim.world.maxIndex;

    expect(sim.pause()).toBe(true);
    advance(sim, 5);

    expect(road.entities.map((entity) => entity.x)).toEqual(beforeVehicles);
    if (railway) {
      expect(railway.metadata.timer).toBe(beforeTimer);
      expect(railway.metadata.phase).toBe(beforePhase);
    }
    expect(sim.player.laneIndex).toBe(beforeLane);
    expect(sim.score.score).toBe(beforeScore);
    expect(sim.world.laneCount).toBe(beforeLaneCount);
    expect(sim.world.maxIndex).toBe(beforeMaxIndex);
  });

  it('resumes exactly where it left off', () => {
    const sim = startedSim('resume');
    const road = [...sim.world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD);

    sim.pause();
    advance(sim, 3);
    const frozen = road.entities.map((entity) => entity.x);

    expect(sim.resume()).toBe(true);
    expect(road.entities.map((entity) => entity.x)).toEqual(frozen);

    advance(sim, 0.5);
    expect(road.entities.map((entity) => entity.x)).not.toEqual(frozen);
  });

  it('suspends camera pressure while paused', () => {
    const sim = startedSim('pressure-pause');
    walkForward(sim, GAMEPLAY.cameraPressure.graceScore + 2);
    if (sim.state.current !== GameStates.PLAYING) return;

    sim.pause();
    advance(sim, 30);
    expect(sim.state.current).toBe(GameStates.PAUSED);
  });

  it('freezes the world in the menu and after a game over too', () => {
    const sim = startedSim('menu-freeze');
    const road = [...sim.world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD);

    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.2);
    expect(sim.state.current).toBe(GameStates.GAME_OVER);

    const afterDeath = road.entities.map((entity) => entity.x);
    advance(sim, 3);
    expect(road.entities.map((entity) => entity.x)).toEqual(afterDeath);
  });
});

describe('death and game over', () => {
  it('moves through DYING before GAME_OVER', () => {
    const sim = startedSim('dying');
    expect(sim.forceDeath(DeathCauses.TRAIN)).toBe(true);
    expect(sim.state.current).toBe(GameStates.DYING);
    expect(sim.player.deathCause).toBe(DeathCauses.TRAIN);

    advance(sim, GAMEPLAY.player.deathDuration / 2);
    expect(sim.state.current).toBe(GameStates.DYING);

    advance(sim, GAMEPLAY.player.deathDuration);
    expect(sim.state.current).toBe(GameStates.GAME_OVER);
  });

  it('emits a death event carrying the cause and the result', () => {
    const sim = startedSim('death-event');
    walkForward(sim, 3);
    sim.drainEvents();

    sim.forceDeath(DeathCauses.WATER);
    const event = sim.drainEvents().find((e) => e.type === 'death');
    expect(event.cause).toBe(DeathCauses.WATER);
    expect(event.score).toBe(sim.score.score);
    expect(event.best).toBe(sim.score.best);
    expect(typeof event.record).toBe('boolean');
  });

  it('prevents further movement and scoring after game over', () => {
    const sim = startedSim('after-death');
    walkForward(sim, 3);
    const finalScore = sim.score.score;
    const finalLane = sim.player.laneIndex;

    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.2);

    expect(sim.queueMove(Directions.FORWARD)).toBe(false);
    advance(sim, 2);
    expect(sim.player.laneIndex).toBe(finalLane);
    expect(sim.score.score).toBe(finalScore);
  });

  it('refuses a forced death outside the playing state', () => {
    const sim = startedSim('force');
    sim.pause();
    expect(sim.forceDeath(DeathCauses.VEHICLE)).toBe(false);
  });

  it('cannot die twice in the same run', () => {
    const sim = startedSim('double');
    expect(sim.forceDeath(DeathCauses.VEHICLE)).toBe(true);
    expect(sim.forceDeath(DeathCauses.TRAIN)).toBe(false);
    expect(sim.player.deathCause).toBe(DeathCauses.VEHICLE);
  });

  it('kills a player who walks far behind their furthest progress', () => {
    const sim = startedSim('left-behind');
    walkForward(sim, GAMEPLAY.cameraPressure.graceScore + 3);
    if (sim.state.current !== GameStates.PLAYING) return;

    for (let i = 0; i < 20 && sim.state.current === GameStates.PLAYING; i += 1) {
      hop(sim, Directions.BACKWARD);
    }
    expect(sim.state.current).not.toBe(GameStates.PLAYING);
    expect(sim.player.deathCause).toBe(DeathCauses.LEFT_BEHIND);
  });
});

describe('restart clears transient state', () => {
  it('resets the player, score, queue and world', () => {
    const sim = startedSim('restart');
    walkForward(sim, 4);
    sim.queueMove(Directions.LEFT);
    const firstWorldLaneId = sim.world.laneAt(0).id;
    const bestBefore = sim.score.best;

    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.2);
    expect(sim.startRun()).toBe(true);

    expect(sim.state.current).toBe(GameStates.PLAYING);
    expect(sim.player.laneIndex).toBe(0);
    expect(sim.player.column).toBe(0);
    expect(sim.player.x).toBe(0);
    expect(sim.player.state).toBe(PlayerStates.IDLE);
    expect(sim.player.deathCause).toBeNull();
    expect(sim.player.support).toBeNull();
    expect(sim.player.move.active).toBe(false);
    expect(sim.score.score).toBe(0);
    expect(sim.score.isNewRecord).toBe(false);
    expect(sim.queuedMoveCount).toBe(0);
    expect(sim.world.minIndex).toBe(-GAMEPLAY.lanesBehind);
    expect(sim.world.maxIndex).toBe(GAMEPLAY.lanesAhead);
    // A brand new set of lane objects, so the view knows to rebuild.
    expect(sim.world.laneAt(0).id).not.toBe(firstWorldLaneId);
    // The best score survives a restart.
    expect(sim.score.best).toBe(bestBefore);
  });

  it('restarts cleanly after every death cause', () => {
    for (const cause of Object.values(DeathCauses)) {
      const sim = startedSim(`restart-${cause}`);
      walkForward(sim, 2);
      sim.forceDeath(cause);
      advance(sim, GAMEPLAY.player.deathDuration + 0.2);

      expect(sim.state.current, cause).toBe(GameStates.GAME_OVER);
      expect(sim.startRun(), cause).toBe(true);
      expect(sim.state.current, cause).toBe(GameStates.PLAYING);
      expect(sim.player.laneIndex, cause).toBe(0);

      // The fresh run is immediately playable.
      walkForward(sim, 1);
      expect(sim.player.laneIndex, cause).toBeGreaterThanOrEqual(1);
    }
  });

  it('can restart straight from a pause', () => {
    const sim = startedSim('restart-pause');
    walkForward(sim, 3);
    sim.pause();
    expect(sim.startRun()).toBe(true);
    expect(sim.player.laneIndex).toBe(0);
  });

  it('returns to the menu and takes the player out of play', () => {
    const sim = startedSim('menu');
    sim.forceDeath(DeathCauses.VEHICLE);
    advance(sim, GAMEPLAY.player.deathDuration + 0.2);

    expect(sim.returnToMenu()).toBe(true);
    expect(sim.state.current).toBe(GameStates.MENU);
    expect(sim.player.state).toBe(PlayerStates.INACTIVE);
    expect(sim.startRun()).toBe(true);
  });
});

describe('generation window', () => {
  it('generates ahead as the player advances', () => {
    const sim = startedSim('window');
    const startMax = sim.world.maxIndex;
    walkForward(sim, 12);
    expect(sim.state.current).toBe(GameStates.PLAYING);

    expect(sim.world.maxIndex).toBeGreaterThan(startMax);
    expect(sim.world.maxIndex - sim.score.maxLaneReached).toBeGreaterThanOrEqual(
      GAMEPLAY.lanesAhead - GAMEPLAY.maxLanesPerStep
    );
  });

  it('discards old terrain and keeps the window bounded', () => {
    const sim = startedSim('recycle');
    walkForward(sim, 40);
    if (sim.state.current !== GameStates.PLAYING) return;

    expect(sim.world.minIndex).toBeGreaterThan(-GAMEPLAY.lanesBehind);
    const span = sim.world.maxIndex - sim.world.minIndex;
    expect(span).toBeLessThanOrEqual(GAMEPLAY.lanesAhead + GAMEPLAY.lanesBehind + 2);
  });

  it('never discards the lane the player is standing on', () => {
    const sim = startedSim('keep-lane');
    for (let i = 0; i < 60 && sim.state.current === GameStates.PLAYING; i += 1) {
      walkForward(sim, 1);
      expect(sim.world.laneAt(sim.player.laneIndex), `lane ${sim.player.laneIndex}`).toBeTruthy();
    }
  });

  it('keeps the lane a hop started from alive until the hop lands', () => {
    const sim = startedSim('keep-from');
    walkForward(sim, 30);
    if (sim.state.current !== GameStates.PLAYING) return;

    sim.queueMove(Directions.FORWARD);
    advance(sim, STEP * 3);
    if (sim.player.move.active) {
      expect(sim.world.laneAt(sim.player.move.fromLane)).toBeTruthy();
    }
  });

  it('keeps memory bounded over a long run', () => {
    const sim = startedSim('long');
    let peakLanes = 0;
    let peakEntities = 0;

    for (let i = 0; i < 250; i += 1) {
      if (sim.state.current !== GameStates.PLAYING) {
        advance(sim, GAMEPLAY.player.deathDuration + 0.2);
        sim.startRun();
      }
      walkForward(sim, 1);
      peakLanes = Math.max(peakLanes, sim.world.laneCount);
      peakEntities = Math.max(peakEntities, sim.world.entityCount);
      sim.drainEvents();
    }

    // No unbounded growth: both stay near the size of the generation window.
    expect(peakLanes).toBeLessThanOrEqual(GAMEPLAY.lanesAhead + GAMEPLAY.lanesBehind + 3);
    expect(peakEntities).toBeLessThan(400);
  });
});

describe('scoring through the simulation', () => {
  it('scores the furthest lane reached, not the current one', () => {
    const sim = startedSim('score-run');
    walkForward(sim, 5);
    if (sim.state.current !== GameStates.PLAYING) return;
    const peak = sim.score.score;
    expect(peak).toBe(5);

    hop(sim, Directions.BACKWARD);
    expect(sim.player.laneIndex).toBe(4);
    expect(sim.score.score).toBe(peak);

    hop(sim, Directions.LEFT);
    expect(sim.score.score).toBe(peak);
  });

  it('emits score and milestone events', () => {
    const sim = startedSim('score-events');
    const seen = [];
    for (let i = 0; i < GAMEPLAY.scoreMilestone + 2; i += 1) {
      walkForward(sim, 1);
      if (sim.state.current !== GameStates.PLAYING) break;
      seen.push(...sim.drainEvents().map((e) => e.type));
    }
    expect(seen).toContain('score');
    if (sim.score.score >= GAMEPLAY.scoreMilestone) expect(seen).toContain('milestone');
  });
});

describe('snapshot', () => {
  it('reports authoritative state for the debug panel and automation', () => {
    const sim = startedSim('snapshot');
    walkForward(sim, 3);
    const snap = sim.snapshot();

    expect(snap.state).toBe(GameStates.PLAYING);
    expect(snap.seed).toBe('snapshot');
    expect(snap.score).toBe(sim.score.score);
    expect(snap.best).toBe(sim.score.best);
    expect(snap.playerLane).toBe(sim.player.laneIndex);
    expect(snap.playerColumn).toBe(sim.player.column);
    expect(snap.laneCount).toBe(sim.world.laneCount);
    expect(snap.entityCount).toBe(sim.world.entityCount);
    expect(snap.laneRange).toEqual([sim.world.minIndex, sim.world.maxIndex]);
    expect(snap.riding).toBe(false);
    expect(snap.deathCause).toBeNull();
  });
});

describe('event draining', () => {
  it('returns and clears pending events', () => {
    const sim = startedSim('events');
    walkForward(sim, 1);
    const first = sim.drainEvents();
    expect(first.length).toBeGreaterThan(0);
    expect(sim.drainEvents()).toEqual([]);
  });
});
