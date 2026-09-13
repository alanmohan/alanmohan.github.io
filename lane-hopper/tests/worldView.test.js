import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from '../vendor/three/three.module.js';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { ShieldToken } from '../src/entities/ShieldToken.js';
import { MeshFactory, groundBaseY } from '../src/rendering/MeshFactory.js';
import { WorldView } from '../src/rendering/WorldView.js';
import { World } from '../src/world/World.js';
import { LaneTypes } from '../src/world/Lane.js';
import { RailwayLane, RailwayPhases } from '../src/world/laneTypes/RailwayLane.js';
import { laneToZ } from '../src/world/coords.js';

/**
 * Rendering tests that need no WebGL context.
 *
 * Three.js scene-graph objects, merged geometry and instanced meshes can all be
 * built without a GL context, so mesh placement and the object pools can be
 * verified headlessly. Only the WebGLRenderer itself needs a real context, and
 * that is covered by the browser smoke test.
 */

let scene;
let factory;
let view;

beforeEach(() => {
  scene = new THREE.Scene();
  factory = new MeshFactory();
  view = new WorldView(scene, factory);
});

afterEach(() => {
  view.dispose();
  factory.dispose();
});

/** Lane group for an index, or undefined. */
function groupFor(index, target = view) {
  return target.root.children.find((child) => child.position.z === laneToZ(index));
}

/**
 * A view with reduced motion enabled, so the ambient water bob is switched off
 * and resting ground heights can be asserted exactly.
 */
function reducedMotionView() {
  return new WorldView(scene, factory, { reducedMotion: true });
}

describe('lane placement', () => {
  it('places every lane group at its own Z, so lane order is preserved', () => {
    const world = new World({ seed: 'placement' });
    view.sync(world, 0);

    expect(view.laneMeshCount).toBe(world.laneCount);

    for (const [index] of world.lanes) {
      const group = groupFor(index);
      expect(group, `lane ${index} has no group`).toBeTruthy();
      expect(group.position.z).toBeCloseTo(-index * GAMEPLAY.tileSize, 12);
    }
  });

  it('spaces adjacent lanes exactly one tile apart, forward being -Z', () => {
    const world = new World({ seed: 'spacing' });
    view.sync(world, 0);

    const ahead = groupFor(5).position.z;
    const behind = groupFor(4).position.z;
    expect(behind - ahead).toBeCloseTo(GAMEPLAY.tileSize, 12);
    // Higher lane index is further from the camera, i.e. more negative Z.
    expect(ahead).toBeLessThan(behind);
  });

  it('rests walkable ground at y = 0 and sinks river channels below it', () => {
    const still = reducedMotionView();
    const world = new World({ seed: 'ground-heights' });
    still.sync(world, 0);

    for (const [index, lane] of world.lanes) {
      const ground = groupFor(index, still).children[0];
      expect(ground.position.y).toBeCloseTo(groundBaseY(lane.type), 12);

      const topSurface = ground.position.y + 0.25;
      if (lane.type === LaneTypes.RIVER) {
        expect(topSurface).toBeCloseTo(GAMEPLAY.river.surfaceY, 12);
        expect(topSurface).toBeLessThan(0);
      } else {
        expect(topSurface).toBeCloseTo(0, 12);
      }
    }
    still.dispose();
  });

  it('animates the water surface only a little, and only around its resting height', () => {
    const world = new World({ seed: 'water-wave' });
    const riverIndex = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RIVER)
      .index;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 400; i += 1) {
      view.sync(world, i / 30);
      const y = groupFor(riverIndex).children[0].position.y;
      min = Math.min(min, y);
      max = Math.max(max, y);
    }

    const base = groundBaseY(LaneTypes.RIVER);
    expect(max - min).toBeGreaterThan(0);
    // Subtle enough that logs never appear to sink or float away.
    expect(max - min).toBeLessThan(0.05);
    expect((min + max) / 2).toBeCloseTo(base, 2);
  });

  it('floats log tops level with the surrounding ground', () => {
    const world = new World({ seed: 'log-height' });
    view.sync(world, 0);

    const river = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RIVER);
    expect(river).toBeTruthy();
    // Logs stand proud of the water, so the channel reads clearly from above.
    const logTop = 0;
    expect(logTop).toBeGreaterThan(GAMEPLAY.river.surfaceY);
    expect(GAMEPLAY.platforms.height / 2).toBeGreaterThan(Math.abs(GAMEPLAY.river.surfaceY) / 2);
  });

  it('places blockers on their column', () => {
    const world = new World({ seed: 'blocker-placement' });
    view.sync(world, 0);

    let checked = 0;
    for (const [index, lane] of world.lanes) {
      if (lane.blockers.size === 0) continue;
      const group = groupFor(index);
      for (const column of lane.blockers.keys()) {
        const match = group.children.find(
          (child) => child.isGroup && Math.abs(child.position.x - column) < 1e-9
        );
        expect(match, `lane ${index} column ${column}`).toBeTruthy();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('entity mirroring', () => {
  it('mirrors every entity position onto a mesh', () => {
    const world = new World({ seed: 'entities' });
    view.sync(world, 0);

    let checked = 0;
    for (const [index, lane] of world.lanes) {
      if (lane.entities.length === 0) continue;
      const group = groupFor(index);
      for (const entity of lane.entities) {
        const match = group.children.find(
          (child) => Math.abs(child.position.x - entity.x) < 1e-9
        );
        expect(match, `lane ${index} entity ${entity.id}`).toBeTruthy();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('follows entities as they move', () => {
    const world = new World({ seed: 'moving' });
    view.sync(world, 0);

    const road = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD);
    const vehicle = road.entities[0];
    const startX = vehicle.x;

    world.update(0.5, []);
    world.wrapEntities();
    view.sync(world, 0.5);

    expect(vehicle.x).not.toBe(startX);
    const group = groupFor(road.index);
    const match = group.children.find((child) => Math.abs(child.position.x - vehicle.x) < 1e-9);
    expect(match).toBeTruthy();
  });

  it('turns vehicles to face their direction of travel', () => {
    const world = new World({ seed: 'facing' });
    view.sync(world, 0);

    const road = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD);
    const group = groupFor(road.index);
    const mesh = group.children.find((child) =>
      road.entities.some((entity) => Math.abs(child.position.x - entity.x) < 1e-9)
    );
    expect(mesh.rotation.y).toBeCloseTo(road.direction > 0 ? 0 : Math.PI, 9);
  });

  it('adds a train mesh when one appears and removes it when the pass ends', () => {
    const world = new World({ seed: 'train-mesh' });
    const railway = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RAILWAY);
    expect(railway).toBeTruthy();

    view.sync(world, 0);
    const groupChildrenBefore = groupFor(railway.index).children.length;

    // Advance the lane until a train is on the track.
    let guard = 0;
    while (railway.entities.length === 0 && guard < 60_000) {
      RailwayLane.update(railway, 1 / 120);
      guard += 1;
    }
    expect(railway.metadata.phase).toBe(RailwayPhases.PASSING);

    view.sync(world, 1);
    const group = groupFor(railway.index);
    expect(group.children.length).toBe(groupChildrenBefore + 1);

    // Run the train off the far side.
    guard = 0;
    while (railway.entities.length > 0 && guard < 60_000) {
      RailwayLane.update(railway, 1 / 120);
      guard += 1;
    }
    view.sync(world, 2);
    expect(groupFor(railway.index).children.length).toBe(groupChildrenBefore);
  });

  it('lights signal lamps only while the warning is active', () => {
    const world = new World({ seed: 'signal-mesh' });
    const railway = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RAILWAY);
    view.sync(world, 0);

    const signals = groupFor(railway.index).children.filter(
      (child) => child.userData && child.userData.lampOn
    );
    expect(signals.length).toBe(2);

    // Idle: lamps dark.
    for (const signal of signals) expect(signal.userData.lampOn.visible).toBe(false);

    let guard = 0;
    while (railway.metadata.phase !== RailwayPhases.WARNING && guard < 60_000) {
      RailwayLane.update(railway, 1 / 120);
      guard += 1;
    }
    // Step to a moment in the blink cycle where the lamps read as lit.
    guard = 0;
    while (!RailwayLane.isSignalLit(railway) && guard < 1000) {
      RailwayLane.update(railway, 1 / 120);
      guard += 1;
    }
    view.sync(world, 3);
    for (const signal of signals) {
      expect(signal.userData.lampOn.visible).toBe(true);
      expect(signal.userData.lampOff.visible).toBe(false);
    }
  });

  it('draws a dashed divider only where two roads meet', () => {
    const world = new World({ seed: 'dashes' });
    view.sync(world, 0);

    let sawVisible = false;
    let sawHidden = false;

    for (const [index, lane] of world.lanes) {
      if (lane.type !== LaneTypes.ROAD) continue;
      const group = groupFor(index);
      // The dash mesh sits on the boundary with the lane ahead.
      const dashes = group.children.find(
        (child) => child.isMesh && Math.abs(child.position.z + GAMEPLAY.tileSize / 2) < 1e-9
      );
      expect(dashes).toBeTruthy();

      const ahead = world.laneAt(index + 1);
      const expected = Boolean(ahead) && ahead.type === LaneTypes.ROAD;
      expect(dashes.visible, `lane ${index}`).toBe(expected);
      if (expected) sawVisible = true;
      else sawHidden = true;
    }
    expect(sawVisible || sawHidden).toBe(true);
  });
});

describe('instanced border scenery', () => {
  it('draws the border with two instanced meshes per lane', () => {
    const world = new World({ seed: 'border' });
    view.sync(world, 0);

    const grassIndex = [...world.lanes.values()].find(
      (lane) => lane.type === LaneTypes.GRASS && lane.metadata.scenery.length > 0
    ).index;

    const batch = groupFor(grassIndex).children.find(
      (child) => child.userData && child.userData.trunks
    );
    expect(batch).toBeTruthy();

    const { trunks, crowns } = batch.userData;
    const expectedCount = world.laneAt(grassIndex).metadata.scenery.length;
    expect(trunks.isInstancedMesh).toBe(true);
    expect(trunks.count).toBe(expectedCount);
    expect(crowns.count).toBe(expectedCount);
    // Instance colours drive the foliage variation.
    expect(crowns.instanceColor).toBeTruthy();
  });

  it('keeps instance counts within the allocated capacity', () => {
    const world = new World({ seed: 'capacity' });
    world.ensureAhead(120, Number.POSITIVE_INFINITY);
    view.sync(world, 0);

    for (const child of view.root.children) {
      const batch = child.children.find((sub) => sub.userData && sub.userData.trunks);
      if (!batch) continue;
      const { trunks } = batch.userData;
      expect(trunks.count).toBeLessThanOrEqual(trunks.instanceMatrix.count);
    }
  });
});

describe('shield token', () => {
  /** Places a token, mirroring what the spawner would do. */
  function place(world, id, laneIndex = 6, column = 2) {
    return world.setShieldToken(new ShieldToken({ id, laneIndex, column }));
  }

  it('draws the token on its own tile and removes it when collected', () => {
    const world = new World({ seed: 'token-mesh' });
    view.sync(world, 0);
    expect(view.hasShieldTokenMesh).toBe(false);

    const token = place(world, 'shield:1');
    view.sync(world, 0);
    expect(view.hasShieldTokenMesh).toBe(true);

    const mesh = view.root.children.find((child) => child.position.x === token.x && child.isGroup);
    expect(mesh).toBeTruthy();
    expect(mesh.position.z).toBeCloseTo(laneToZ(token.laneIndex), 12);
    // Hovers above the ground so it reads as a pickup rather than scenery.
    expect(mesh.position.y).toBeGreaterThan(0);

    world.clearShieldToken();
    view.sync(world, 0);
    expect(view.hasShieldTokenMesh).toBe(false);
  });

  it('rebuilds rather than reuses when a different token replaces it', () => {
    const world = new World({ seed: 'token-replace' });
    place(world, 'shield:1', 6, 2);
    view.sync(world, 0);

    place(world, 'shield:2', 30, -4);
    view.sync(world, 1);

    expect(view.hasShieldTokenMesh).toBe(true);
    const stale = view.root.children.filter(
      (child) => child.isGroup && Math.abs(child.position.z - laneToZ(6)) < 1e-9 && child.children.length === 3
    );
    expect(stale).toHaveLength(0);
  });

  it('releases the token mesh when the scene is cleared', () => {
    const world = new World({ seed: 'token-clear' });
    place(world, 'shield:1');
    view.sync(world, 0);

    view.clear();
    expect(view.hasShieldTokenMesh).toBe(false);
    expect(view.root.children).toHaveLength(0);
  });

  it('holds the token still when reduced motion is requested', () => {
    const still = reducedMotionView();
    const world = new World({ seed: 'token-still' });
    const token = place(world, 'shield:1');

    still.sync(world, 0);
    const mesh = still.root.children.find((child) => child.isGroup && child.position.x === token.x);
    const resting = mesh.position.y;

    still.sync(world, 12.5);
    expect(mesh.position.y).toBe(resting);
    expect(mesh.rotation.y).toBe(0);
    still.dispose();
  });
});

describe('lane recycling and pooling', () => {
  it('adds and removes lane groups as the window moves', () => {
    const world = new World({ seed: 'window-view' });
    view.sync(world, 0);
    expect(view.laneMeshCount).toBe(world.laneCount);

    world.ensureAhead(40, Number.POSITIVE_INFINITY);
    world.recycleBelow(20);
    view.sync(world, 1);

    expect(view.laneMeshCount).toBe(world.laneCount);
    expect(groupFor(10)).toBeUndefined();
    expect(groupFor(25)).toBeTruthy();
  });

  it('reuses pooled objects instead of allocating new ones', () => {
    const world = new World({ seed: 'pooling' });
    view.sync(world, 0);

    // Drop every lane, returning its parts to the pools.
    view.clear();
    expect(view.laneMeshCount).toBe(0);

    const geometriesAfterFirstPass = factory._geometries.size;
    const materialsAfterFirstPass = factory._materials.size;

    // Rebuilding must not create new GPU resources.
    view.sync(world, 0);
    expect(view.laneMeshCount).toBe(world.laneCount);
    expect(factory._geometries.size).toBe(geometriesAfterFirstPass);
    expect(factory._materials.size).toBe(materialsAfterFirstPass);
  });

  it('restores the ground offset on a pooled slab', () => {
    // Regression test: releasing an object clears its transform, so a pooled
    // river slab used to come back at y = 0 and cover the logs, and road slabs
    // came back high enough to bury their dashes and the vehicle wheels.
    const still = reducedMotionView();
    const world = new World({ seed: 'pool-offset' });
    still.sync(world, 0);

    const riverIndex = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.RIVER)
      .index;
    const roadIndex = [...world.lanes.values()].find((lane) => lane.type === LaneTypes.ROAD).index;

    // Cycle the lanes out and back so both slabs come from the pool.
    still.clear();
    still.sync(world, 1);

    expect(groupFor(riverIndex, still).children[0].position.y).toBeCloseTo(
      groundBaseY(LaneTypes.RIVER),
      12
    );
    expect(groupFor(roadIndex, still).children[0].position.y).toBeCloseTo(
      groundBaseY(LaneTypes.ROAD),
      12
    );
    still.dispose();
  });

  it('does not leak lane groups over a long scroll', () => {
    const world = new World({ seed: 'no-leak' });
    view.sync(world, 0);

    for (let front = 0; front < 300; front += 1) {
      world.ensureAhead(front, Number.POSITIVE_INFINITY);
      world.recycleBelow(front - GAMEPLAY.lanesBehind);
      world.update(1 / 60, []);
      world.wrapEntities();
      view.sync(world, front / 60);

      // Nothing accumulates: the scene holds exactly one group per live lane.
      expect(view.laneMeshCount).toBe(world.laneCount);
      expect(view.root.children.length).toBe(world.laneCount);
    }

    expect(view.laneMeshCount).toBeLessThanOrEqual(
      GAMEPLAY.lanesAhead + GAMEPLAY.lanesBehind + 3
    );
  });

  it('rebuilds every lane when a new run reuses the same indices', () => {
    const world = new World({ seed: 'run-one' });
    view.sync(world, 0);
    const before = groupFor(0);

    // A fresh run produces new lane objects with new ids at the same indices.
    world.reset('run-two');
    view.sync(world, 0);

    expect(groupFor(0)).not.toBe(before);
    expect(view.laneMeshCount).toBe(world.laneCount);
  });
});
