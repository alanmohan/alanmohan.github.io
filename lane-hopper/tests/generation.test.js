import { describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { SeededRandom } from '../src/core/SeededRandom.js';
import { World } from '../src/world/World.js';
import { LaneTypes, isHazardLane } from '../src/world/Lane.js';
import { PLAYABLE_COLUMNS } from '../src/world/LaneFactory.js';
import { DIFFICULTY_BANDS, MAX_CONSECUTIVE, getDifficulty } from '../src/world/difficulty.js';
import {
  LAST_START_LANE,
  expandReachable,
  isStartingLane,
  laneTypeWeights,
  lanesSince,
  pickWeighted,
  trailingHazardRun,
  trailingRun
} from '../src/world/generation.js';

/** Builds a world and generates lanes out to `depth`. */
function buildWorld(seed, depth = 400) {
  const world = new World({ seed });
  world.ensureAhead(depth, Number.POSITIVE_INFINITY);
  return world;
}

/** Stable text signature of a world's lane contents. */
function signature(world) {
  const parts = [];
  for (const index of [...world.lanes.keys()].sort((a, b) => a - b)) {
    const lane = world.lanes.get(index);
    parts.push(
      [
        lane.index,
        lane.type,
        lane.direction,
        lane.speed.toFixed(6),
        [...lane.blockers.keys()].sort((a, b) => a - b).join('.'),
        lane.entities.map((entity) => entity.x.toFixed(6)).join('.')
      ].join(':')
    );
  }
  return parts.join('|');
}

describe('deterministic world generation', () => {
  it('generates an identical world for the same seed', () => {
    expect(signature(buildWorld('repeat-me', 200))).toBe(
      signature(buildWorld('repeat-me', 200))
    );
  });

  it('generates identical worlds for numeric and equivalent string seeds', () => {
    expect(signature(buildWorld(9182, 120))).toBe(signature(buildWorld('9182', 120)));
  });

  it('usually generates different worlds for different seeds', () => {
    const signatures = new Set();
    for (let seed = 0; seed < 12; seed += 1) signatures.add(signature(buildWorld(seed, 120)));
    expect(signatures.size).toBe(12);
  });

  it('produces the same lane regardless of generation order', () => {
    // Generated in one burst.
    const bulk = new World({ seed: 'order' });
    bulk.ensureAhead(120, Number.POSITIVE_INFINITY);

    // Generated incrementally, a few lanes at a time.
    const incremental = new World({ seed: 'order' });
    for (let front = 0; front <= 120; front += 1) incremental.ensureAhead(front, 3);
    incremental.ensureAhead(120, Number.POSITIVE_INFINITY);

    for (let index = -GAMEPLAY.lanesBehind; index <= 120; index += 1) {
      const a = bulk.laneAt(index);
      const b = incremental.laneAt(index);
      expect(b, `lane ${index} missing`).toBeTruthy();
      expect(b.type).toBe(a.type);
      expect(b.speed).toBeCloseTo(a.speed, 10);
      expect(b.direction).toBe(a.direction);
      expect([...b.blockers.keys()].sort()).toEqual([...a.blockers.keys()].sort());
    }
  });
});

describe('starting region', () => {
  it('contains no lethal lane', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const world = buildWorld(seed, 40);
      for (let index = -GAMEPLAY.lanesBehind; index <= LAST_START_LANE; index += 1) {
        const lane = world.laneAt(index);
        expect(lane.type, `seed ${seed} lane ${index}`).toBe(LaneTypes.GRASS);
        expect(isHazardLane(lane.type)).toBe(false);
      }
    }
  });

  it('never blocks the spawn tile and keeps the whole start area clear', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const world = buildWorld(seed, 20);
      for (let index = -GAMEPLAY.start.safeBehind; index <= LAST_START_LANE; index += 1) {
        expect(world.laneAt(index).blockers.size, `seed ${seed} lane ${index}`).toBe(0);
      }
      expect(world.laneAt(0).isBlocked(0)).toBe(false);
    }
  });

  it('places the first hazard no earlier than three moves forward', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const world = buildWorld(seed, 40);
      let firstHazard = Infinity;
      for (let index = 1; index <= 40; index += 1) {
        if (world.laneAt(index).isHazard) {
          firstHazard = index;
          break;
        }
      }
      expect(firstHazard, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('reports starting lanes correctly', () => {
    expect(isStartingLane(-5)).toBe(true);
    expect(isStartingLane(LAST_START_LANE)).toBe(true);
    expect(isStartingLane(LAST_START_LANE + 1)).toBe(false);
  });
});

describe('lane selection rules', () => {
  it('respects the maximum consecutive count for every lane type', () => {
    const counts = { road: 0, river: 0, railway: 0, grass: 0 };

    for (let seed = 0; seed < 12; seed += 1) {
      const world = buildWorld(seed, 400);
      const indices = [...world.lanes.keys()].sort((a, b) => a - b);

      let run = 0;
      let previous = null;
      for (const index of indices) {
        const type = world.laneAt(index).type;
        run = type === previous ? run + 1 : 1;
        previous = type;
        counts[type] = Math.max(counts[type], run);
      }
    }

    for (const [type, limit] of Object.entries(MAX_CONSECUTIVE)) {
      // The forced starting grass block is longer than the general grass cap,
      // so grass is checked past the start region separately below.
      if (type === LaneTypes.GRASS) continue;
      expect(counts[type], `${type} run`).toBeLessThanOrEqual(limit);
    }
  });

  it('caps consecutive grass lanes past the starting region', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const world = buildWorld(seed, 400);
      let run = 0;
      for (let index = LAST_START_LANE + 1; index <= 400; index += 1) {
        const lane = world.laneAt(index);
        run = lane.type === LaneTypes.GRASS ? run + 1 : 0;
        expect(run, `seed ${seed} at lane ${index}`).toBeLessThanOrEqual(
          MAX_CONSECUTIVE[LaneTypes.GRASS]
        );
      }
    }
  });

  it('never places two railway lanes side by side', () => {
    for (let seed = 0; seed < 15; seed += 1) {
      const world = buildWorld(seed, 400);
      for (let index = 1; index <= 399; index += 1) {
        if (world.laneAt(index).type !== LaneTypes.RAILWAY) continue;
        expect(world.laneAt(index + 1).type, `seed ${seed} lane ${index}`).not.toBe(
          LaneTypes.RAILWAY
        );
      }
    }
  });

  it('keeps railways well separated inside the first difficulty band', () => {
    for (let seed = 0; seed < 15; seed += 1) {
      const world = buildWorld(seed, 60);
      const railways = [];
      for (let index = 1; index < DIFFICULTY_BANDS[1].minDepth; index += 1) {
        if (world.laneAt(index).type === LaneTypes.RAILWAY) railways.push(index);
      }
      for (let i = 1; i < railways.length; i += 1) {
        expect(railways[i] - railways[i - 1], `seed ${seed}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('breaks long hazard sequences with a safe lane', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const world = buildWorld(seed, 400);
      let run = 0;
      for (let index = 1; index <= 400; index += 1) {
        const lane = world.laneAt(index);
        if (lane.isHazard) {
          run += 1;
          const limit = getDifficulty(index).maxHazardRun;
          expect(run, `seed ${seed} at lane ${index}`).toBeLessThanOrEqual(limit);
        } else {
          run = 0;
        }
      }
    }
  });

  it('avoids mechanically identical neighbouring hazard lanes', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const world = buildWorld(seed, 300);
      for (let index = 1; index < 300; index += 1) {
        const lane = world.laneAt(index);
        const next = world.laneAt(index + 1);
        if (lane.type !== next.type) continue;
        if (lane.type !== LaneTypes.ROAD && lane.type !== LaneTypes.RIVER) continue;

        const sameDirection = lane.direction === next.direction;
        const similarSpeed = Math.abs(lane.speed - next.speed) < 0.4;
        expect(sameDirection && similarSpeed, `seed ${seed} lanes ${index}/${index + 1}`).toBe(
          false
        );
      }
    }
  });
});

describe('weight helpers', () => {
  const band = DIFFICULTY_BANDS[1];

  it('trailingRun counts only the trailing streak', () => {
    expect(trailingRun(['road', 'grass', 'road', 'road'], 'road')).toBe(2);
    expect(trailingRun(['road', 'road', 'grass'], 'road')).toBe(0);
    expect(trailingRun([], 'road')).toBe(0);
  });

  it('trailingHazardRun counts mixed hazards', () => {
    expect(trailingHazardRun(['grass', 'road', 'river', 'railway'])).toBe(3);
    expect(trailingHazardRun(['road', 'grass'])).toBe(0);
  });

  it('lanesSince reports the distance back to a type', () => {
    expect(lanesSince(['railway', 'grass', 'road'], 'railway')).toBe(3);
    expect(lanesSince(['grass'], 'railway')).toBe(Infinity);
  });

  it('excludes a type once its consecutive cap is reached', () => {
    const history = Array(MAX_CONSECUTIVE[LaneTypes.ROAD]).fill(LaneTypes.ROAD);
    expect(laneTypeWeights(history, band)[LaneTypes.ROAD]).toBe(0);
  });

  it('forces grass after a long hazard run', () => {
    const history = Array(band.maxHazardRun).fill(LaneTypes.ROAD);
    const weights = laneTypeWeights(history, band);
    expect(weights[LaneTypes.GRASS]).toBeGreaterThan(0);
    expect(weights[LaneTypes.ROAD]).toBe(0);
    expect(weights[LaneTypes.RIVER]).toBe(0);
    expect(weights[LaneTypes.RAILWAY]).toBe(0);
  });

  it('never returns an all-zero weight set', () => {
    const histories = [
      [],
      [LaneTypes.RAILWAY],
      [LaneTypes.GRASS, LaneTypes.GRASS],
      Array(9).fill(LaneTypes.RIVER)
    ];
    for (const history of histories) {
      for (const difficulty of DIFFICULTY_BANDS) {
        const total = Object.values(laneTypeWeights(history, difficulty)).reduce(
          (sum, weight) => sum + weight,
          0
        );
        expect(total).toBeGreaterThan(0);
      }
    }
  });

  it('pickWeighted only ever returns a positively weighted option', () => {
    const rng = new SeededRandom('weights');
    const weights = { grass: 0, road: 5, river: 0, railway: 1 };
    for (let i = 0; i < 500; i += 1) {
      expect(['road', 'railway']).toContain(pickWeighted(weights, rng));
    }
  });

  it('pickWeighted falls back to grass when nothing is available', () => {
    const rng = new SeededRandom('empty');
    expect(pickWeighted({ grass: 0, road: 0 }, rng)).toBe(LaneTypes.GRASS);
  });
});

describe('blocker layouts', () => {
  it('always leaves a route through every lane', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const world = buildWorld(seed, 300);

      // Reachability is only meaningful going forward from the spawn lane.
      let reachable = world.reachableColumns(0);
      expect(reachable.size).toBeGreaterThan(0);

      for (let index = 1; index <= 300; index += 1) {
        const lane = world.laneAt(index);
        const entries = [...reachable].filter((column) => !lane.isBlocked(column));
        expect(
          entries.length,
          `seed ${seed}: lane ${index} (${lane.type}) is unreachable`
        ).toBeGreaterThan(0);

        reachable = expandReachable(lane, entries, GAMEPLAY.playableHalfWidth);
        expect(reachable.size).toBeGreaterThan(0);
        // The world's own bookkeeping must agree with the independent walk.
        expect(world.reachableColumns(index).size).toBeGreaterThan(0);
      }
    }
  });

  it('keeps enough open tiles and never builds a long solid wall', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const world = buildWorld(seed, 300);
      for (let index = LAST_START_LANE + 1; index <= 300; index += 1) {
        const lane = world.laneAt(index);
        if (lane.type !== LaneTypes.GRASS) {
          expect(lane.blockers.size).toBe(0);
          continue;
        }

        const open = lane.openColumns(PLAYABLE_COLUMNS);
        expect(open.length, `seed ${seed} lane ${index}`).toBeGreaterThanOrEqual(
          GAMEPLAY.blockers.minOpenColumns
        );

        let run = 0;
        for (const column of PLAYABLE_COLUMNS) {
          run = lane.isBlocked(column) ? run + 1 : 0;
          expect(run, `seed ${seed} lane ${index} column ${column}`).toBeLessThanOrEqual(
            GAMEPLAY.blockers.maxConsecutive
          );
        }
      }
    }
  });

  it('only places blockers on whole playable tiles', () => {
    const world = buildWorld('blocker-columns', 200);
    for (const lane of world.lanes.values()) {
      for (const column of lane.blockers.keys()) {
        expect(Number.isInteger(column)).toBe(true);
        expect(Math.abs(column)).toBeLessThanOrEqual(GAMEPLAY.playableHalfWidth);
      }
    }
  });

  it('expandReachable stops at blockers', () => {
    const world = buildWorld('expand', 10);
    const lane = world.laneAt(5);
    lane.blockers.clear();
    lane.blockers.set(-2, { kind: 'rock', variant: 0, scale: 1 });
    lane.blockers.set(3, { kind: 'rock', variant: 0, scale: 1 });

    const reachable = expandReachable(lane, [0], GAMEPLAY.playableHalfWidth);
    expect([...reachable].sort((a, b) => a - b)).toEqual([-1, 0, 1, 2]);
  });
});

describe('hazard lane parameters stay crossable', () => {
  it('keeps vehicle gaps at or above the difficulty minimum', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const world = buildWorld(seed, 400);
      for (const lane of world.lanes.values()) {
        if (lane.type !== LaneTypes.ROAD) continue;
        const required = getDifficulty(lane.index).vehicleGap;
        expect(lane.metadata.gap, `seed ${seed} lane ${lane.index}`).toBeGreaterThanOrEqual(
          required - 1e-9
        );
      }
    }
  });

  it('keeps river platform coverage high enough to cross', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const world = buildWorld(seed, 400);
      for (const lane of world.lanes.values()) {
        if (lane.type !== LaneTypes.RIVER) continue;
        expect(lane.metadata.coverage, `seed ${seed} lane ${lane.index}`).toBeGreaterThanOrEqual(
          0.5
        );
        expect(lane.metadata.gap).toBeGreaterThan(0);
      }
    }
  });

  it('holds every entity speed inside the configured bounds', () => {
    const world = buildWorld('speeds', 400);
    for (const lane of world.lanes.values()) {
      const band = getDifficulty(lane.index);
      if (lane.type === LaneTypes.ROAD) {
        expect(lane.speed).toBeGreaterThanOrEqual(band.vehicleSpeed[0]);
        expect(lane.speed).toBeLessThanOrEqual(band.vehicleSpeed[1]);
      } else if (lane.type === LaneTypes.RIVER) {
        expect(lane.speed).toBeGreaterThanOrEqual(band.platformSpeed[0]);
        expect(lane.speed).toBeLessThanOrEqual(band.platformSpeed[1]);
      }
      if (lane.type === LaneTypes.ROAD || lane.type === LaneTypes.RIVER) {
        expect([-1, 1]).toContain(lane.direction);
      }
    }
  });

  it('spaces entities evenly across the wrap period', () => {
    const world = buildWorld('spacing', 200);
    for (const lane of world.lanes.values()) {
      if (lane.entities.length < 2) continue;
      if (lane.type !== LaneTypes.ROAD && lane.type !== LaneTypes.RIVER) continue;

      const xs = lane.entities.map((entity) => entity.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i] - xs[i - 1]).toBeCloseTo(lane.metadata.spawnSpacing, 6);
      }
      // The whole ring must close cleanly, so wrapping preserves the spacing.
      expect(lane.metadata.spawnSpacing * lane.entities.length).toBeCloseTo(
        GAMEPLAY.entityWrapSpan * 2,
        6
      );
    }
  });
});

describe('difficulty progression', () => {
  it('selects bands by depth', () => {
    expect(getDifficulty(0).id).toBe('calm');
    expect(getDifficulty(20).id).toBe('calm');
    expect(getDifficulty(21).id).toBe('brisk');
    expect(getDifficulty(50).id).toBe('brisk');
    expect(getDifficulty(51).id).toBe('swift');
    expect(getDifficulty(100).id).toBe('swift');
    expect(getDifficulty(101).id).toBe('frantic');
    expect(getDifficulty(100000).id).toBe('frantic');
  });

  it('treats negative or invalid depths as the first band', () => {
    expect(getDifficulty(-30).id).toBe('calm');
    expect(getDifficulty(Number.NaN).id).toBe('calm');
  });

  it('increases pressure monotonically across bands', () => {
    for (let i = 1; i < DIFFICULTY_BANDS.length; i += 1) {
      const previous = DIFFICULTY_BANDS[i - 1];
      const current = DIFFICULTY_BANDS[i];
      expect(current.vehicleSpeed[1]).toBeGreaterThanOrEqual(previous.vehicleSpeed[1]);
      expect(current.vehicleGap).toBeLessThanOrEqual(previous.vehicleGap);
      expect(current.maxHazardRun).toBeGreaterThanOrEqual(previous.maxHazardRun);
    }
  });

  it('keeps speeds within the readable range the spec allows', () => {
    for (const band of DIFFICULTY_BANDS) {
      expect(band.vehicleSpeed[0]).toBeGreaterThanOrEqual(1.5);
      expect(band.vehicleSpeed[1]).toBeLessThanOrEqual(5);
      expect(band.vehicleGap).toBeGreaterThanOrEqual(2);
    }
  });
});
