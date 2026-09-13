import { describe, expect, it } from 'vitest';
import { SeededRandom, createRunSeed, hashSeed, parseSeed } from '../src/core/SeededRandom.js';

describe('SeededRandom', () => {
  it('produces a repeatable sequence for the same seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);

    const first = Array.from({ length: 64 }, () => a.next());
    const second = Array.from({ length: 64 }, () => b.next());

    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 32 }, (_, i) => new SeededRandom(i).next());
    // With 32 distinct seeds a repeated first value would indicate a weak hash.
    expect(new Set(a).size).toBe(a.length);
  });

  it('treats numeric and string seeds consistently', () => {
    const fromNumber = new SeededRandom(777);
    const fromString = new SeededRandom('777');
    expect(fromNumber.next()).toBe(fromString.next());
  });

  it('stays inside the unit interval', () => {
    const rng = new SeededRandom('bounds');
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('range and int respect their bounds', () => {
    const rng = new SeededRandom('ranges');
    for (let i = 0; i < 2000; i += 1) {
      const float = rng.range(2, 5);
      expect(float).toBeGreaterThanOrEqual(2);
      expect(float).toBeLessThan(5);

      const integer = rng.int(-3, 3);
      expect(Number.isInteger(integer)).toBe(true);
      expect(integer).toBeGreaterThanOrEqual(-3);
      expect(integer).toBeLessThanOrEqual(3);
    }
  });

  it('int covers both inclusive endpoints', () => {
    const rng = new SeededRandom('endpoints');
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) seen.add(rng.int(0, 2));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('sign returns only -1 or 1', () => {
    const rng = new SeededRandom('signs');
    const values = new Set(Array.from({ length: 200 }, () => rng.sign()));
    expect([...values].sort()).toEqual([-1, 1]);
  });

  it('fork derives an independent but deterministic stream', () => {
    const parent = new SeededRandom('run');
    const childA = parent.fork('lane:3');
    const childB = new SeededRandom('run').fork('lane:3');
    const childC = new SeededRandom('run').fork('lane:4');

    expect(childA.next()).toBe(childB.next());
    expect(new SeededRandom('run').fork('lane:3').next()).not.toBe(childC.next());
  });

  it('fork does not depend on how much the parent has consumed', () => {
    const untouched = new SeededRandom('run').fork('salt').next();
    const consumed = new SeededRandom('run');
    for (let i = 0; i < 50; i += 1) consumed.next();
    expect(consumed.fork('salt').next()).toBe(untouched);
  });

  it('shuffled returns a permutation without mutating the input', () => {
    const rng = new SeededRandom('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const output = rng.shuffled(input);

    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(output).toHaveLength(input.length);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });

  it('hashSeed returns a stable uint32', () => {
    const value = hashSeed('lane-hopper');
    expect(value).toBe(hashSeed('lane-hopper'));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });

  it('createRunSeed yields a valid uint32', () => {
    for (let i = 0; i < 20; i += 1) {
      const seed = createRunSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('parseSeed', () => {
  it('accepts integers and normalises them to numbers', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('-42')).toBe(-42);
    expect(parseSeed('0')).toBe(0);
  });

  it('accepts short alphanumeric labels', () => {
    expect(parseSeed('demo-run_1')).toBe('demo-run_1');
  });

  it('rejects missing or malformed input rather than throwing', () => {
    expect(parseSeed(null)).toBeNull();
    expect(parseSeed(undefined)).toBeNull();
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    expect(parseSeed('has spaces')).toBeNull();
    expect(parseSeed('<script>')).toBeNull();
    expect(parseSeed('x'.repeat(65))).toBeNull();
  });
});
