import { describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { SeededRandom } from '../src/core/SeededRandom.js';
import { getDifficulty } from '../src/world/difficulty.js';
import { RailwayLane, RailwayPhases } from '../src/world/laneTypes/RailwayLane.js';

const STEP = 1 / 120;

function makeRailway(seed = 'railway', index = 30) {
  return RailwayLane.create({
    id: 1,
    index,
    seedLabel: seed,
    rng: new SeededRandom(seed),
    difficulty: getDifficulty(index)
  });
}

/**
 * Advances the lane until `predicate` holds, failing rather than hanging if the
 * phase machine ever stalls.
 */
function advanceUntil(lane, predicate, label) {
  const limit = Math.round(300 / STEP);
  let elapsed = 0;
  for (let i = 0; i < limit; i += 1) {
    if (predicate(lane)) return elapsed;
    RailwayLane.update(lane, STEP);
    elapsed += STEP;
  }
  throw new Error(`railway lane stalled in phase ${lane.metadata.phase} waiting for ${label}`);
}

/**
 * Advances the lane, recording the phase timeline and every emitted event.
 */
function run(lane, seconds) {
  const events = [];
  const timeline = [];
  const steps = Math.round(seconds / STEP);

  for (let i = 0; i < steps; i += 1) {
    const before = lane.metadata.phase;
    RailwayLane.update(lane, STEP, { events });
    const after = lane.metadata.phase;
    if (after !== before) timeline.push(after);
  }
  return { events, timeline };
}

describe('railway phase machine', () => {
  it('starts idle with a scheduled wait', () => {
    const lane = makeRailway();
    expect(lane.metadata.phase).toBe(RailwayPhases.IDLE);
    const [min, max] = getDifficulty(lane.index).trainIdle;
    expect(lane.metadata.timer).toBeGreaterThanOrEqual(min);
    expect(lane.metadata.timer).toBeLessThanOrEqual(max);
  });

  it('cycles idle, warning, passing, cooldown in order', () => {
    const lane = makeRailway('cycle');
    const { timeline } = run(lane, 90);

    expect(timeline.length).toBeGreaterThan(6);
    const expected = [
      RailwayPhases.WARNING,
      RailwayPhases.PASSING,
      RailwayPhases.COOLDOWN,
      RailwayPhases.IDLE
    ];
    timeline.forEach((phase, i) => {
      expect(phase, `transition ${i}`).toBe(expected[i % expected.length]);
    });
  });

  it('always warns before a train appears', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const lane = makeRailway(seed);
      const { events } = run(lane, 120);

      const warnings = events.filter((e) => e.type === 'trainWarning').length;
      const passes = events.filter((e) => e.type === 'trainPass').length;
      expect(passes, seed).toBeGreaterThan(0);
      // Every pass is preceded by its own warning; a warning may still be pending.
      expect(warnings - passes).toBeGreaterThanOrEqual(0);
      expect(warnings - passes).toBeLessThanOrEqual(1);

      // Ordering: strictly alternating, warning first.
      const ordered = events
        .filter((e) => e.type === 'trainWarning' || e.type === 'trainPass')
        .map((e) => e.type);
      ordered.forEach((type, i) => {
        expect(type).toBe(i % 2 === 0 ? 'trainWarning' : 'trainPass');
      });
    }
  });

  it('holds the warning for the configured duration', () => {
    const lane = makeRailway('duration');
    advanceUntil(lane, (l) => l.metadata.phase === RailwayPhases.WARNING, 'warning');
    expect(lane.metadata.phase).toBe(RailwayPhases.WARNING);

    const warningTime = advanceUntil(
      lane,
      (l) => l.metadata.phase !== RailwayPhases.WARNING,
      'warning to end'
    );

    const [min, max] = GAMEPLAY.railway.warning;
    expect(warningTime).toBeGreaterThanOrEqual(min - STEP);
    expect(warningTime).toBeLessThanOrEqual(max + STEP);
    expect(lane.metadata.phase).toBe(RailwayPhases.PASSING);
  });

  it('holds no train outside the passing phase', () => {
    const lane = makeRailway('entities');
    for (let i = 0; i < 120 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      if (lane.metadata.phase !== RailwayPhases.PASSING) {
        expect(lane.entities.length, lane.metadata.phase).toBe(0);
        expect(RailwayLane.isTrainActive(lane)).toBe(false);
      } else {
        expect(lane.entities.length).toBe(1);
        expect(RailwayLane.isTrainActive(lane)).toBe(true);
      }
    }
  });

  it('spawns the train fully off-screen, never on top of the player', () => {
    const lane = makeRailway('spawn');
    let spawns = 0;

    for (let i = 0; i < 240 / STEP && spawns < 6; i += 1) {
      const before = lane.entities.length;
      RailwayLane.update(lane, STEP);
      if (lane.entities.length > before) {
        const train = lane.entities[0];
        const nearEdge = Math.abs(train.x) - train.length / 2;
        // The nearest part of the train is still beyond the wrap span.
        expect(nearEdge).toBeGreaterThanOrEqual(GAMEPLAY.entityWrapSpan);
        // Approaching from the side it will travel away from.
        expect(Math.sign(train.x)).toBe(-train.direction);
        spawns += 1;
      }
    }
    expect(spawns).toBeGreaterThan(0);
  });

  it('sends trains in from both sides over time', () => {
    const directions = new Set();
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const lane = makeRailway(seed);
      for (let i = 0; i < 200 / STEP; i += 1) {
        RailwayLane.update(lane, STEP);
        if (lane.entities.length > 0) directions.add(lane.entities[0].direction);
      }
      if (directions.size === 2) break;
    }
    expect([...directions].sort()).toEqual([-1, 1]);
  });

  it('crosses much faster than ordinary road traffic', () => {
    const lane = makeRailway('speed', 30);
    const fastestCar = getDifficulty(30).vehicleSpeed[1];
    for (let i = 0; i < 200 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      if (lane.entities.length > 0) {
        expect(lane.entities[0].speed).toBeGreaterThan(fastestCar * 2);
        break;
      }
    }
  });

  it('clears the train once it has left the play area', () => {
    const lane = makeRailway('clear');
    let sawPassing = false;
    for (let i = 0; i < 200 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      if (lane.metadata.phase === RailwayPhases.PASSING) sawPassing = true;
      if (sawPassing && lane.metadata.phase === RailwayPhases.COOLDOWN) break;
    }
    expect(sawPassing).toBe(true);
    expect(lane.metadata.phase).toBe(RailwayPhases.COOLDOWN);
    expect(lane.entities.length).toBe(0);
  });

  it('lights the warning signal only while a train is due or crossing', () => {
    const lane = makeRailway('signal');
    for (let i = 0; i < 120 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      const phase = lane.metadata.phase;
      if (phase === RailwayPhases.IDLE || phase === RailwayPhases.COOLDOWN) {
        expect(lane.metadata.signalActive, phase).toBe(false);
        expect(RailwayLane.isSignalLit(lane)).toBe(false);
      } else {
        expect(lane.metadata.signalActive, phase).toBe(true);
      }
    }
  });

  it('blinks the signal rather than holding it steady', () => {
    const lane = makeRailway('blink');
    advanceUntil(lane, (l) => l.metadata.phase === RailwayPhases.WARNING, 'warning');

    const states = new Set();
    for (let i = 0; i < 2 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      states.add(RailwayLane.isSignalLit(lane));
    }
    // A blink is a motion cue, so the warning is not communicated by colour alone.
    expect(states.has(true)).toBe(true);
    expect(states.has(false)).toBe(true);
  });

  it('derives train length from its car count', () => {
    const lane = makeRailway('length');
    const { carLength, carGap } = GAMEPLAY.railway;
    for (let i = 0; i < 200 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      if (lane.entities.length > 0) {
        const { carCount, length } = lane.entities[0];
        expect(length).toBeCloseTo(carCount * carLength + (carCount - 1) * carGap, 9);
        break;
      }
    }
  });

  it('never leaves a phase timer unset, so the machine cannot stall', () => {
    // Guards against a range being written as {min,max} instead of [min,max],
    // which would make a timer NaN and freeze the lane in one phase forever.
    const lane = makeRailway('timers');
    for (let i = 0; i < 200 / STEP; i += 1) {
      RailwayLane.update(lane, STEP);
      expect(Number.isFinite(lane.metadata.timer), lane.metadata.phase).toBe(true);
    }
  });

  it('advances deterministically for an identical delta sequence', () => {
    const a = makeRailway('determinism');
    const b = makeRailway('determinism');
    for (let i = 0; i < 6000; i += 1) {
      RailwayLane.update(a, STEP);
      RailwayLane.update(b, STEP);
    }
    expect(a.metadata.phase).toBe(b.metadata.phase);
    expect(a.metadata.timer).toBeCloseTo(b.metadata.timer, 12);
    expect(a.entities.map((t) => t.x)).toEqual(b.entities.map((t) => t.x));
  });
});
