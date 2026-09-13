import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  GameStateMachine,
  GameStates
} from '../src/core/GameState.js';
import { GameLoop } from '../src/core/GameLoop.js';
import { GAMEPLAY } from '../src/config/gameplay.js';

const ALL_STATES = Object.values(GameStates);

describe('GameStateMachine', () => {
  it('starts in BOOT by default', () => {
    expect(new GameStateMachine().current).toBe(GameStates.BOOT);
  });

  it('rejects an unknown initial state', () => {
    expect(() => new GameStateMachine('NOPE')).toThrow();
  });

  it('accepts every allowed transition', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        const machine = new GameStateMachine(from);
        expect(machine.canTransition(to)).toBe(true);
        expect(machine.transition(to)).toBe(true);
        expect(machine.current).toBe(to);
      }
    }
  });

  it('rejects every disallowed transition and keeps the current state', () => {
    for (const from of ALL_STATES) {
      const allowed = ALLOWED_TRANSITIONS[from];
      for (const to of ALL_STATES) {
        if (allowed.includes(to)) continue;
        const machine = new GameStateMachine(from);
        expect(machine.canTransition(to), `${from} -> ${to}`).toBe(false);
        expect(machine.transition(to), `${from} -> ${to}`).toBe(false);
        expect(machine.current).toBe(from);
      }
    }
  });

  it('rejects self transitions', () => {
    for (const state of ALL_STATES) {
      const machine = new GameStateMachine(state);
      expect(machine.transition(state), state).toBe(false);
    }
  });

  it('covers the whole run lifecycle', () => {
    const machine = new GameStateMachine();
    const path = [
      GameStates.MENU,
      GameStates.PLAYING,
      GameStates.PAUSED,
      GameStates.PLAYING,
      GameStates.DYING,
      GameStates.GAME_OVER,
      GameStates.PLAYING,
      GameStates.DYING,
      GameStates.GAME_OVER,
      GameStates.MENU,
      GameStates.PLAYING
    ];
    for (const state of path) {
      expect(machine.transition(state), `to ${state}`).toBe(true);
    }
  });

  it('cannot skip the dying state on the way to game over', () => {
    const machine = new GameStateMachine(GameStates.PLAYING);
    expect(machine.transition(GameStates.GAME_OVER)).toBe(false);
    expect(machine.transition(GameStates.DYING)).toBe(true);
    expect(machine.transition(GameStates.GAME_OVER)).toBe(true);
  });

  it('cannot pause from the menu or after a game over', () => {
    expect(new GameStateMachine(GameStates.MENU).transition(GameStates.PAUSED)).toBe(false);
    expect(new GameStateMachine(GameStates.GAME_OVER).transition(GameStates.PAUSED)).toBe(false);
  });

  it('offers a route from pause back to the menu, as the pause overlay requires', () => {
    const machine = new GameStateMachine(GameStates.PAUSED);
    expect(machine.transition(GameStates.MENU)).toBe(true);
  });

  it('reports membership with is()', () => {
    const machine = new GameStateMachine(GameStates.PLAYING);
    expect(machine.is(GameStates.PLAYING)).toBe(true);
    expect(machine.is(GameStates.PAUSED, GameStates.PLAYING)).toBe(true);
    expect(machine.is(GameStates.MENU)).toBe(false);
  });

  it('notifies listeners with the new and previous state', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    machine.onChange(listener);

    machine.transition(GameStates.MENU);
    expect(listener).toHaveBeenCalledWith(GameStates.MENU, GameStates.BOOT);

    // A rejected transition must not notify.
    machine.transition(GameStates.GAME_OVER);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes listeners and can drop them all', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    const off = machine.onChange(listener);

    off();
    machine.transition(GameStates.MENU);
    expect(listener).not.toHaveBeenCalled();

    const second = vi.fn();
    machine.onChange(second);
    machine.clearListeners();
    machine.transition(GameStates.PLAYING);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('GameLoop', () => {
  function makeLoop(overrides = {}) {
    const updates = [];
    const renders = [];
    const loop = new GameLoop({
      update: (dt) => updates.push(dt),
      render: (alpha) => renders.push(alpha),
      requestFrame: () => 1,
      cancelFrame: () => {},
      ...overrides
    });
    return { loop, updates, renders };
  }

  it('renders once on the first tick without simulating', () => {
    const { loop, updates, renders } = makeLoop();
    loop.tick(0);
    expect(updates).toHaveLength(0);
    expect(renders).toHaveLength(1);
  });

  it('advances in fixed steps only', () => {
    const { loop, updates } = makeLoop();
    loop.tick(0);
    loop.tick(1000 / 30); // one thirtieth of a second

    expect(updates.length).toBeGreaterThan(0);
    for (const dt of updates) expect(dt).toBe(GAMEPLAY.time.fixedStep);
    // 1/30 s of accumulated time at a 1/120 s step is four updates.
    expect(updates).toHaveLength(4);
  });

  it('carries leftover time into the next frame instead of losing it', () => {
    const { loop, updates } = makeLoop();
    loop.tick(0);
    loop.tick(12); // 12 ms: one step of 8.33 ms, 3.67 ms remaining
    expect(updates).toHaveLength(1);
    loop.tick(17); // another 5 ms, so the remainder completes a second step
    expect(updates).toHaveLength(2);
  });

  it('clamps a huge frame gap so it cannot simulate hundreds of steps', () => {
    const { loop, updates } = makeLoop();
    loop.tick(0);
    // Ten seconds, as after a tab switch or a paused debugger.
    loop.tick(10_000);
    const maxSteps = Math.ceil(GAMEPLAY.time.maxDelta / GAMEPLAY.time.fixedStep);
    expect(updates.length).toBeLessThanOrEqual(maxSteps);
  });

  it('never exceeds the sub-step ceiling', () => {
    const { loop, updates } = makeLoop({ maxSubSteps: 3, maxDelta: 10 });
    loop.tick(0);
    loop.tick(5000);
    expect(updates).toHaveLength(3);
  });

  it('ignores a timestamp that goes backwards', () => {
    const { loop, updates } = makeLoop();
    loop.tick(1000);
    loop.tick(500);
    expect(updates).toHaveLength(0);
  });

  it('renders exactly once per tick', () => {
    const { loop, renders } = makeLoop();
    loop.tick(0);
    loop.tick(16);
    loop.tick(32);
    loop.tick(48);
    expect(renders).toHaveLength(4);
  });

  it('start and stop are idempotent and track running state', () => {
    let requested = 0;
    let cancelled = 0;
    const { loop } = makeLoop({
      requestFrame: () => {
        requested += 1;
        return requested;
      },
      cancelFrame: () => {
        cancelled += 1;
      }
    });

    expect(loop.running).toBe(false);
    loop.start();
    loop.start();
    expect(loop.running).toBe(true);
    expect(requested).toBe(1);

    loop.stop();
    loop.stop();
    expect(loop.running).toBe(false);
    expect(cancelled).toBe(1);
  });

  it('reports a frame rate after enough samples', () => {
    const { loop } = makeLoop();
    loop.tick(0);
    for (let frame = 1; frame <= 80; frame += 1) loop.tick(frame * (1000 / 60));
    expect(loop.fps).toBeGreaterThan(45);
    expect(loop.fps).toBeLessThan(75);
  });
});
