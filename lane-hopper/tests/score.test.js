import { beforeEach, describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { ScoreSystem } from '../src/systems/ScoreSystem.js';
import { StorageSystem } from '../src/systems/StorageSystem.js';

/** In-memory Storage stand-in. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    _data: data
  };
}

/** Storage that throws on every operation, as in hardened privacy modes. */
function hostileStorage() {
  return {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    }
  };
}

const BEST_KEY = `${GAMEPLAY.storage.prefix}.${GAMEPLAY.storage.bestScore}`;

describe('ScoreSystem', () => {
  let score;

  beforeEach(() => {
    score = new ScoreSystem(null);
    score.reset(0);
  });

  it('starts at zero', () => {
    expect(score.score).toBe(0);
    expect(score.best).toBe(0);
    expect(score.isNewRecord).toBe(false);
  });

  it('increases only on a new forward record', () => {
    expect(score.update(1).changed).toBe(true);
    expect(score.score).toBe(1);

    expect(score.update(3).changed).toBe(true);
    expect(score.score).toBe(3);

    // Revisiting a lane already reached changes nothing.
    expect(score.update(2).changed).toBe(false);
    expect(score.score).toBe(3);
    expect(score.update(3).changed).toBe(false);
    expect(score.score).toBe(3);
  });

  it('never decreases when the player moves backward', () => {
    score.update(10);
    for (let lane = 9; lane >= 0; lane -= 1) score.update(lane);
    expect(score.score).toBe(10);
  });

  it('does not change when moving sideways', () => {
    score.update(4);
    // Sideways movement leaves the lane index alone, so the same value repeats.
    for (let i = 0; i < 5; i += 1) expect(score.update(4).changed).toBe(false);
    expect(score.score).toBe(4);
  });

  it('measures progress relative to the starting lane', () => {
    score.reset(100);
    expect(score.score).toBe(0);
    score.update(105);
    expect(score.score).toBe(5);
  });

  it('never reports a negative score behind the start lane', () => {
    score.reset(0);
    score.update(-5);
    expect(score.score).toBe(0);
  });

  it('tracks the best score within a session', () => {
    score.update(7);
    expect(score.best).toBe(7);
    expect(score.isNewRecord).toBe(true);

    score.reset(0);
    expect(score.score).toBe(0);
    expect(score.best).toBe(7);
    expect(score.isNewRecord).toBe(false);

    score.update(4);
    expect(score.best).toBe(7);
    expect(score.isNewRecord).toBe(false);

    score.update(9);
    expect(score.best).toBe(9);
    expect(score.isNewRecord).toBe(true);
  });

  it('reports milestones at the configured interval, once each', () => {
    const interval = GAMEPLAY.scoreMilestone;
    const milestones = [];
    for (let lane = 1; lane <= interval * 3; lane += 1) {
      const { milestone } = score.update(lane);
      if (milestone !== null) milestones.push(milestone);
    }
    expect(milestones).toEqual([interval, interval * 2, interval * 3]);
  });

  it('persists a new record as soon as it is set', () => {
    const backend = memoryStorage();
    const storage = new StorageSystem(GAMEPLAY.storage.prefix, backend);
    const persisted = new ScoreSystem(storage);
    persisted.reset(0);

    persisted.update(12);
    expect(backend.getItem(BEST_KEY)).toBe('12');
  });

  it('loads and keeps the stored best score across runs', () => {
    const backend = memoryStorage({ [BEST_KEY]: '25' });
    const storage = new StorageSystem(GAMEPLAY.storage.prefix, backend);
    const loaded = new ScoreSystem(storage);

    expect(loaded.best).toBe(25);
    loaded.reset(0);
    loaded.update(10);
    expect(loaded.best).toBe(25);
    expect(loaded.isNewRecord).toBe(false);

    loaded.commit();
    expect(backend.getItem(BEST_KEY)).toBe('25');
  });

  it('commits the best score when a run ends', () => {
    const backend = memoryStorage();
    const storage = new StorageSystem(GAMEPLAY.storage.prefix, backend);
    const persisted = new ScoreSystem(storage);
    persisted.reset(0);
    persisted.update(6);
    persisted.commit();
    expect(backend.getItem(BEST_KEY)).toBe('6');
  });

  it('works with no storage at all', () => {
    const detached = new ScoreSystem(null);
    detached.reset(0);
    detached.update(5);
    detached.commit();
    expect(detached.best).toBe(5);
  });
});

describe('StorageSystem', () => {
  it('namespaces keys under the prefix', () => {
    const backend = memoryStorage();
    const storage = new StorageSystem('demo', backend);
    storage.setInteger('answer', 42);
    expect(backend.getItem('demo.answer')).toBe('42');
  });

  it('falls back for missing values', () => {
    const storage = new StorageSystem('demo', memoryStorage());
    expect(storage.getInteger('nothing', 7)).toBe(7);
    expect(storage.getBoolean('nothing', true)).toBe(true);
  });

  it('falls back for malformed values rather than throwing', () => {
    const backend = memoryStorage({
      'demo.a': 'not-a-number',
      'demo.b': '',
      'demo.c': '-5',
      'demo.d': '3.7',
      'demo.e': 'NaN',
      'demo.f': 'Infinity',
      'demo.g': '{"json":true}'
    });
    const storage = new StorageSystem('demo', backend);

    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      expect(storage.getInteger(key, 99), key).toBe(99);
    }
  });

  it('reads booleans in both stored forms and falls back otherwise', () => {
    const backend = memoryStorage({
      'demo.one': '1',
      'demo.zero': '0',
      'demo.true': 'true',
      'demo.false': 'false',
      'demo.junk': 'maybe'
    });
    const storage = new StorageSystem('demo', backend);

    expect(storage.getBoolean('one')).toBe(true);
    expect(storage.getBoolean('zero')).toBe(false);
    expect(storage.getBoolean('true')).toBe(true);
    expect(storage.getBoolean('false')).toBe(false);
    expect(storage.getBoolean('junk', true)).toBe(true);
  });

  it('round-trips booleans', () => {
    const storage = new StorageSystem('demo', memoryStorage());
    storage.setBoolean('muted', true);
    expect(storage.getBoolean('muted')).toBe(true);
    storage.setBoolean('muted', false);
    expect(storage.getBoolean('muted')).toBe(false);
  });

  it('clamps and truncates written integers', () => {
    const backend = memoryStorage();
    const storage = new StorageSystem('demo', backend);
    storage.setInteger('a', -12);
    expect(backend.getItem('demo.a')).toBe('0');
    storage.setInteger('b', 7.9);
    expect(backend.getItem('demo.b')).toBe('7');
    expect(storage.setInteger('c', Number.NaN)).toBe(false);
  });

  it('keeps working in memory when storage is unavailable', () => {
    const storage = new StorageSystem('demo', null);
    expect(storage.available).toBe(false);
    expect(storage.setInteger('best', 5)).toBe(false);
    // The value is still readable for the rest of the session.
    expect(storage.getInteger('best', 0)).toBe(5);
  });

  it('survives a backend that throws on every call', () => {
    const storage = new StorageSystem('demo', hostileStorage());
    expect(() => storage.setInteger('best', 3)).not.toThrow();
    expect(storage.available).toBe(false);
    // Falls back to the in-memory copy so the session keeps working.
    expect(storage.getInteger('best', 0)).toBe(3);
    expect(() => storage.remove('best')).not.toThrow();
    expect(storage.getInteger('best', 0)).toBe(0);
  });

  it('removes values', () => {
    const storage = new StorageSystem('demo', memoryStorage({ 'demo.x': '4' }));
    expect(storage.getInteger('x', 0)).toBe(4);
    storage.remove('x');
    expect(storage.getInteger('x', 0)).toBe(0);
  });
});
