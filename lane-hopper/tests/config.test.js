import { describe, expect, it } from 'vitest';
import { DeathCauses, GAMEPLAY, MoveRejections } from '../src/config/gameplay.js';
import { COLORS } from '../src/config/colors.js';
import { DIFFICULTY_BANDS } from '../src/world/difficulty.js';
import { LANE_BEHAVIOURS, laneBehaviour } from '../src/world/laneTypes/index.js';
import { LaneTypes } from '../src/world/Lane.js';

/**
 * Every range in the configuration is consumed through
 * SeededRandom.rangeOf / intOf, which read `tuple[0]` and `tuple[1]`.
 * A range written as `{min, max}` silently yields NaN and can freeze a timer,
 * so the shape is asserted here rather than left to chance.
 */
const RANGE_PATHS = [
  ['railway.warning', GAMEPLAY.railway.warning],
  ['railway.cooldown', GAMEPLAY.railway.cooldown]
];

for (const band of DIFFICULTY_BANDS) {
  RANGE_PATHS.push([`${band.id}.vehicleSpeed`, band.vehicleSpeed]);
  RANGE_PATHS.push([`${band.id}.platformSpeed`, band.platformSpeed]);
  RANGE_PATHS.push([`${band.id}.trainIdle`, band.trainIdle]);
  RANGE_PATHS.push([`${band.id}.trainSpeed`, band.trainSpeed]);
  RANGE_PATHS.push([`${band.id}.trainCars`, band.trainCars]);
}

describe('configuration integrity', () => {
  it('expresses every range as an ascending [min, max] tuple', () => {
    for (const [name, range] of RANGE_PATHS) {
      expect(Array.isArray(range), `${name} must be an array`).toBe(true);
      expect(range, name).toHaveLength(2);
      expect(Number.isFinite(range[0]), `${name} min`).toBe(true);
      expect(Number.isFinite(range[1]), `${name} max`).toBe(true);
      expect(range[1], `${name} max >= min`).toBeGreaterThanOrEqual(range[0]);
    }
  });

  it('keeps train car counts whole', () => {
    for (const band of DIFFICULTY_BANDS) {
      expect(Number.isInteger(band.trainCars[0]), band.id).toBe(true);
      expect(Number.isInteger(band.trainCars[1]), band.id).toBe(true);
      expect(band.trainCars[0]).toBeGreaterThan(0);
    }
  });

  it('gives every lane type a weight in every band', () => {
    for (const band of DIFFICULTY_BANDS) {
      for (const type of Object.values(LaneTypes)) {
        expect(band.weights[type], `${band.id}.${type}`).toBeTypeOf('number');
        expect(band.weights[type]).toBeGreaterThanOrEqual(0);
      }
      const total = Object.values(band.weights).reduce((sum, w) => sum + w, 0);
      expect(total, band.id).toBeGreaterThan(0);
    }
  });

  it('registers a behaviour for every lane type', () => {
    for (const type of Object.values(LaneTypes)) {
      const behaviour = laneBehaviour(type);
      expect(behaviour.type).toBe(type);
      expect(behaviour.create).toBeTypeOf('function');
      expect(behaviour.update).toBeTypeOf('function');
      expect(behaviour.wrap).toBeTypeOf('function');
    }
    expect(Object.keys(LANE_BEHAVIOURS).sort()).toEqual(Object.values(LaneTypes).sort());
  });

  it('throws for an unregistered lane type instead of failing silently', () => {
    expect(() => laneBehaviour('swamp')).toThrow(/swamp/);
  });

  it('holds a coherent world geometry', () => {
    expect(GAMEPLAY.playableHalfWidth).toBeGreaterThan(0);
    // Ground must reach at least as far as the decorated border.
    expect(GAMEPLAY.visualHalfWidth).toBeGreaterThanOrEqual(GAMEPLAY.sceneryOuterWidth);
    // Border decoration sits strictly outside the playable columns.
    expect(GAMEPLAY.sceneryOuterWidth).toBeGreaterThan(GAMEPLAY.playableHalfWidth);
    // Entities recycle beyond the lethal boundary; see the river carry rules.
    expect(GAMEPLAY.entityWrapSpan).toBeGreaterThan(
      GAMEPLAY.playableHalfWidth + GAMEPLAY.river.outOfBoundsMargin
    );
    // Enough open tiles must remain for the player to route around blockers.
    expect(GAMEPLAY.blockers.minOpenColumns).toBeLessThan(
      GAMEPLAY.playableHalfWidth * 2 + 1
    );
  });

  it('keeps movement timing inside the range the spec recommends', () => {
    expect(GAMEPLAY.moveDuration).toBeGreaterThanOrEqual(0.1);
    expect(GAMEPLAY.moveDuration).toBeLessThanOrEqual(0.15);
    expect(GAMEPLAY.maxInputQueue).toBe(2);
    expect(GAMEPLAY.hopHeight).toBeGreaterThan(0);
  });

  it('holds sane loop timing', () => {
    expect(GAMEPLAY.time.fixedStep).toBeGreaterThan(0);
    expect(GAMEPLAY.time.maxDelta).toBeGreaterThan(GAMEPLAY.time.fixedStep);
    expect(GAMEPLAY.time.maxDelta).toBeLessThanOrEqual(0.05);
    expect(GAMEPLAY.time.maxSubSteps).toBeGreaterThanOrEqual(
      Math.ceil(GAMEPLAY.time.maxDelta / GAMEPLAY.time.fixedStep)
    );
  });

  it('caps the pixel ratio', () => {
    expect(GAMEPLAY.render.maxPixelRatio).toBeLessThanOrEqual(2);
    expect(GAMEPLAY.render.fogFar).toBeGreaterThan(GAMEPLAY.render.fogNear);
    // Fog must sit around the fixed orthographic camera distance to be visible.
    expect(GAMEPLAY.render.fogNear).toBeGreaterThan(GAMEPLAY.camera.distance);
  });

  it('frames the whole playable width at any aspect ratio', () => {
    const columnsWide = GAMEPLAY.playableHalfWidth * 2 * GAMEPLAY.tileSize;
    expect(GAMEPLAY.camera.requiredWidth).toBeGreaterThan(columnsWide);
    expect(GAMEPLAY.camera.lookAheadLanes).toBeGreaterThan(0);
  });

  it('generates a window wider than the camera can show', () => {
    expect(GAMEPLAY.lanesAhead).toBeGreaterThanOrEqual(20);
    expect(GAMEPLAY.lanesAhead).toBeLessThanOrEqual(30);
    expect(GAMEPLAY.lanesBehind).toBeGreaterThanOrEqual(8);
    expect(GAMEPLAY.lanesBehind).toBeLessThanOrEqual(12);
  });

  it('keeps vehicle bodies distinct and truck-aware collision meaningful', () => {
    const { car, truck } = GAMEPLAY.vehicles;
    expect(car.length).toBeGreaterThanOrEqual(1.4);
    expect(car.length).toBeLessThanOrEqual(1.8);
    expect(truck.length).toBeGreaterThanOrEqual(2.2);
    expect(truck.length).toBeLessThanOrEqual(2.8);
    expect(truck.length).toBeGreaterThan(car.length);
  });

  it('uses a player footprint close to the suggested size', () => {
    expect(GAMEPLAY.player.collisionSize).toBeGreaterThan(0.4);
    expect(GAMEPLAY.player.collisionSize).toBeLessThan(0.8);
  });

  it('names every death cause and rejection reason uniquely', () => {
    const causes = Object.values(DeathCauses);
    expect(new Set(causes).size).toBe(causes.length);
    expect(causes).toEqual(
      expect.arrayContaining(['vehicle', 'train', 'water', 'out_of_bounds', 'left_behind'])
    );

    const reasons = Object.values(MoveRejections);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('namespaces persistence keys', () => {
    expect(GAMEPLAY.storage.prefix).toBeTruthy();
    expect(GAMEPLAY.storage.bestScore).toMatch(/v\d+$/);
    expect(GAMEPLAY.storage.muted).toMatch(/v\d+$/);
  });

  it('freezes the configuration so gameplay cannot mutate tuning at runtime', () => {
    expect(Object.isFrozen(GAMEPLAY)).toBe(true);
    expect(Object.isFrozen(GAMEPLAY.player)).toBe(true);
    expect(Object.isFrozen(COLORS)).toBe(true);
    for (const band of DIFFICULTY_BANDS) expect(Object.isFrozen(band), band.id).toBe(true);
  });

  it('provides colour variation arrays the seeded RNG can index', () => {
    const palettes = [
      COLORS.grass,
      COLORS.foliage,
      COLORS.rock,
      COLORS.logBark,
      COLORS.carBodies,
      COLORS.truckCab,
      COLORS.truckCargo
    ];
    for (const palette of palettes) {
      expect(Array.isArray(palette)).toBe(true);
      expect(palette.length).toBeGreaterThan(0);
      for (const value of palette) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});
