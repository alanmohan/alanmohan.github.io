import * as THREE from '../../vendor/three/three.module.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { columnToX, laneToZ } from '../world/coords.js';
import { LaneTypes } from '../world/Lane.js';
import { RailwayLane } from '../world/laneTypes/RailwayLane.js';
import { SHIELD_TOKEN_Y, groundBaseY } from './MeshFactory.js';

/** Ambient motion of a shield token: turns per second and bob amplitude. */
const TOKEN_SPIN_RATE = 1.1;
const TOKEN_BOB_HEIGHT = 0.07;
const TOKEN_BOB_RATE = 2.4;

/**
 * Mirrors the logical lane world into the Three.js scene.
 *
 * This is a one-way projection: the view reads simulation state and never writes
 * to it. Lane and entity meshes come from MeshFactory pools, so scrolling
 * through the world allocates no GPU resources after the first few lanes.
 */
export class WorldView {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./MeshFactory.js').MeshFactory} meshFactory
   * @param {{reducedMotion?: boolean}} [options]
   */
  constructor(scene, meshFactory, { reducedMotion = false } = {}) {
    this.scene = scene;
    this.factory = meshFactory;
    this.reducedMotion = reducedMotion;

    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);

    /** @type {Map<number, object>} lane index to view record */
    this._lanes = new Map();
    /**
     * View record for the uncollected shield token, or null.
     *
     * Held on its own rather than inside a lane record, because the token is not
     * lane content: it is placed at runtime and can be removed by being
     * collected, so it does not share the lane's lifetime.
     * @type {{id: string, mesh: import('three').Object3D}|null}
     */
    this._shieldToken = null;
    /** Reused scratch arrays so syncing allocates nothing per frame. */
    this._laneScratch = [];
    this._entityScratch = [];
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
  }

  /**
   * Brings the scene in line with the world.
   *
   * @param {import('../world/World.js').World} world
   * @param {number} time seconds since start, for ambient animation
   */
  sync(world, time) {
    // Retire lanes that no longer exist, or whose slot was reused by a new run.
    this._laneScratch.length = 0;
    for (const [index, record] of this._lanes) {
      const lane = world.laneAt(index);
      if (!lane || lane.id !== record.laneId) this._laneScratch.push(index);
    }
    for (const index of this._laneScratch) this._removeLane(index);

    // Build newly generated lanes.
    for (const [index, lane] of world.lanes) {
      if (!this._lanes.has(index)) this._addLane(lane);
    }

    // Update per-frame state.
    for (const [index, record] of this._lanes) {
      const lane = world.laneAt(index);
      if (!lane) continue;
      this._syncEntities(lane, record, time);
      if (lane.type === LaneTypes.ROAD) this._syncRoadDashes(world, lane, record);
      if (lane.type === LaneTypes.RAILWAY) this._syncSignals(lane, record);
      if (lane.type === LaneTypes.RIVER && !this.reducedMotion) this._animateWater(lane, record, time);
    }

    this._syncShieldToken(world, time);
  }

  /** Drops every lane mesh, e.g. when returning to the title screen. */
  clear() {
    this._laneScratch.length = 0;
    for (const index of this._lanes.keys()) this._laneScratch.push(index);
    for (const index of this._laneScratch) this._removeLane(index);
    this._removeShieldToken();
  }

  dispose() {
    this.clear();
    if (this.root.parent) this.root.parent.remove(this.root);
  }

  // ------------------------------------------------------------- lane meshes

  _addLane(lane) {
    const group = new THREE.Group();
    group.position.z = laneToZ(lane.index);

    const record = {
      laneId: lane.id,
      type: lane.type,
      group,
      groundVariant: lane.metadata.groundVariant ?? 0,
      ground: null,
      groundBaseY: groundBaseY(lane.type),
      dashes: null,
      track: null,
      signals: [],
      statics: [],
      sceneryBatch: null,
      entities: new Map()
    };

    const ground = this.factory.acquireGround(lane.type, record.groundVariant);
    record.ground = ground;
    group.add(ground);

    if (lane.type === LaneTypes.ROAD) {
      const dashes = this.factory.acquireRoadDashes();
      // Sits on the boundary shared with the lane ahead.
      dashes.position.set(0, 0.015, -GAMEPLAY.tileSize / 2);
      dashes.visible = false;
      record.dashes = dashes;
      group.add(dashes);
    }

    if (lane.type === LaneTypes.RAILWAY) {
      const track = this.factory.acquireTrack();
      record.track = track;
      group.add(track);

      for (const side of [-1, 1]) {
        const signal = this.factory.acquireSignal();
        signal.position.set(side * (GAMEPLAY.playableHalfWidth + 1.1), 0, 0.3);
        // Face the play area so the lamps are visible from the camera side.
        signal.rotation.y = side > 0 ? Math.PI : 0;
        record.signals.push(signal);
        group.add(signal);
      }
    }

    // Gameplay blockers inside the playable width get individual meshes, since
    // the player must be able to read exactly which tiles are closed.
    for (const [column, blocker] of lane.blockers) {
      const mesh = this._acquireScenery(blocker.kind, blocker.variant);
      mesh.position.set(columnToX(column), 0, 0);
      mesh.scale.setScalar(blocker.scale);
      record.statics.push({ kind: blocker.kind, variant: blocker.variant, mesh });
      group.add(mesh);
    }

    // The border outside the play area is the most repeated decoration in the
    // scene, so it is drawn with two instanced meshes for the whole lane.
    const scenery = lane.metadata.scenery;
    if (scenery && scenery.length > 0) {
      const batch = this.factory.acquireSceneryBatch();
      this.factory.fillSceneryBatch(batch, scenery);
      record.sceneryBatch = batch;
      group.add(batch);
    }

    this.root.add(group);
    this._lanes.set(lane.index, record);
  }

  _removeLane(index) {
    const record = this._lanes.get(index);
    if (!record) return;
    this._lanes.delete(index);

    for (const [, entry] of record.entities) this._releaseEntityMesh(entry);
    record.entities.clear();

    for (const item of record.statics) {
      this._releaseScenery(item.kind, item.variant, item.mesh);
    }
    record.statics.length = 0;

    if (record.sceneryBatch) {
      this.factory.releaseSceneryBatch(record.sceneryBatch);
      record.sceneryBatch = null;
    }

    for (const signal of record.signals) this.factory.releaseSignal(signal);
    record.signals.length = 0;

    if (record.track) this.factory.releaseTrack(record.track);
    if (record.dashes) this.factory.releaseRoadDashes(record.dashes);
    // acquireGround re-applies the lane offset, so no reset is needed here.
    if (record.ground) {
      this.factory.releaseGround(record.type, record.groundVariant, record.ground);
    }

    this.root.remove(record.group);
  }

  // ---------------------------------------------------------------- entities

  _syncEntities(lane, record, time) {
    // Add or move meshes for live entities.
    for (const entity of lane.entities) {
      let entry = record.entities.get(entity.id);
      if (!entry) {
        entry = this._createEntityMesh(lane, entity);
        if (!entry) continue;
        record.entities.set(entity.id, entry);
        record.group.add(entry.mesh);
      }

      entry.mesh.position.x = entity.x;

      if (entry.kind === 'vehicle' || entry.kind === 'train') {
        // Face the direction of travel.
        entry.mesh.rotation.y = entity.direction > 0 ? 0 : Math.PI;
      } else if (entry.kind === 'log' && !this.reducedMotion) {
        entry.mesh.position.y = Math.sin(time * 2.1 + entry.phase) * 0.014;
      }
    }

    // Retire meshes whose entity is gone, e.g. a train that finished its pass.
    if (record.entities.size === lane.entities.length) return;
    this._entityScratch.length = 0;
    for (const id of record.entities.keys()) {
      if (!lane.entities.some((entity) => entity.id === id)) this._entityScratch.push(id);
    }
    for (const id of this._entityScratch) {
      const entry = record.entities.get(id);
      record.entities.delete(id);
      this._releaseEntityMesh(entry);
    }
  }

  _createEntityMesh(lane, entity) {
    switch (lane.type) {
      case LaneTypes.ROAD: {
        const mesh = this.factory.acquireVehicle(entity.kind, entity.colorIndex);
        return { kind: 'vehicle', mesh, vehicleKind: entity.kind, colorIndex: entity.colorIndex };
      }
      case LaneTypes.RIVER: {
        const lengthTiles = lane.metadata.platformLengthTiles;
        const mesh = this.factory.acquireLog(lengthTiles, entity.colorIndex);
        return {
          kind: 'log',
          mesh,
          lengthTiles,
          colorIndex: entity.colorIndex,
          phase: entity.x * 0.7
        };
      }
      case LaneTypes.RAILWAY: {
        const mesh = this.factory.acquireTrain(entity.carCount);
        return { kind: 'train', mesh, carCount: entity.carCount };
      }
      default:
        return null;
    }
  }

  _releaseEntityMesh(entry) {
    if (!entry) return;
    entry.mesh.position.set(0, 0, 0);
    switch (entry.kind) {
      case 'vehicle':
        this.factory.releaseVehicle(entry.vehicleKind, entry.colorIndex, entry.mesh);
        break;
      case 'log':
        this.factory.releaseLog(entry.lengthTiles, entry.colorIndex, entry.mesh);
        break;
      case 'train':
        this.factory.releaseTrain(entry.carCount, entry.mesh);
        break;
      default:
        break;
    }
  }

  // ----------------------------------------------------------- shield pickup

  /**
   * Mirrors the world's single uncollected shield token.
   *
   * Comparing token ids means a token that was collected and later replaced is
   * rebuilt rather than silently reused, the same rule the lane records follow.
   */
  _syncShieldToken(world, time) {
    const token = world.shieldToken;

    if (!token) {
      this._removeShieldToken();
      return;
    }

    if (this._shieldToken && this._shieldToken.id !== token.id) {
      this._removeShieldToken();
    }

    if (!this._shieldToken) {
      const mesh = this.factory.acquireShieldToken();
      this._shieldToken = { id: token.id, mesh };
      this.root.add(mesh);
    }

    const { mesh } = this._shieldToken;
    // The token is placed in world space directly, since it belongs to a tile
    // rather than to a lane group's transform.
    mesh.position.set(token.x, SHIELD_TOKEN_Y, token.z);

    if (this.reducedMotion) {
      mesh.rotation.y = 0;
      return;
    }
    mesh.rotation.y = time * TOKEN_SPIN_RATE;
    mesh.position.y += Math.sin(time * TOKEN_BOB_RATE) * TOKEN_BOB_HEIGHT;
  }

  _removeShieldToken() {
    if (!this._shieldToken) return;
    this.factory.releaseShieldToken(this._shieldToken.mesh);
    this._shieldToken = null;
  }

  /** True when a shield token is currently drawn. Used by the tests. */
  get hasShieldTokenMesh() {
    return this._shieldToken !== null;
  }

  // ------------------------------------------------------------ lane details

  /** A dashed divider is only drawn where two road lanes meet. */
  _syncRoadDashes(world, lane, record) {
    if (!record.dashes) return;
    const ahead = world.laneAt(lane.index + 1);
    record.dashes.visible = Boolean(ahead) && ahead.type === LaneTypes.ROAD;
  }

  _syncSignals(lane, record) {
    const lit = RailwayLane.isSignalLit(lane);
    for (const signal of record.signals) {
      signal.userData.lampOn.visible = lit;
      signal.userData.lampOff.visible = !lit;
    }
  }

  _animateWater(lane, record, time) {
    if (!record.ground) return;
    const phase = lane.metadata.wavePhase || 0;
    record.ground.position.y = record.groundBaseY + Math.sin(time * 1.7 + phase) * 0.012;
  }

  // ----------------------------------------------------------------- scenery

  _acquireScenery(kind, variant) {
    return kind === 'rock' ? this.factory.acquireRock(variant) : this.factory.acquireTree(variant);
  }

  _releaseScenery(kind, variant, mesh) {
    if (kind === 'rock') this.factory.releaseRock(variant, mesh);
    else this.factory.releaseTree(variant, mesh);
  }

  /** Number of lane groups currently in the scene. Used by the debug panel. */
  get laneMeshCount() {
    return this._lanes.size;
  }
}
