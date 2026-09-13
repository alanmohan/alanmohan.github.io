import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../utils/geometry.js';
import { COLORS } from '../config/colors.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { LaneTypes } from '../world/Lane.js';
import { disposeDeep } from '../utils/dispose.js';

/**
 * Builds every visual from primitive geometry, and owns the shared geometry,
 * material and object pools.
 *
 * Three techniques keep the frame budget flat:
 *   - geometries and materials are created once, keyed by shape and colour, then
 *     reused by every object that needs them;
 *   - parts of a compound object that share a material are merged into a single
 *     geometry, so a car is five draw calls rather than eleven;
 *   - compound objects are pooled, so lanes scrolling through the generation
 *     window allocate nothing.
 *
 * Because resources are shared, discarding a lane must never dispose them.
 * `dispose()` releases everything once, when the game is torn down.
 */

const GROUND_THICKNESS = 0.5;
const WHEEL_RADIUS = 0.14;

/**
 * Resting height of a hovering shield token, above its tile.
 *
 * Low enough that the token does not visually crowd the lane in front of it at
 * the camera's elevation angle, high enough that it clearly floats.
 */
export const SHIELD_TOKEN_Y = 0.32;

/** Centre height of the shield aura, so the bubble encloses the character. */
const SHIELD_AURA_Y = 0.42;

/** Border scenery slots per lane: every shoulder column on both sides. */
const SCENERY_CAPACITY = 2 * (GAMEPLAY.sceneryOuterWidth - GAMEPLAY.playableHalfWidth);

/** Scratch objects reused when writing instance matrices. */
const DUMMY = new THREE.Object3D();
const SCRATCH_COLOR = new THREE.Color();

export class MeshFactory {
  constructor() {
    this._geometries = new Map();
    this._materials = new Map();
    this._pools = new Map();
    this.groundWidth = GAMEPLAY.visualHalfWidth * 2 + GAMEPLAY.tileSize;
  }

  // ------------------------------------------------------------ shared caches

  geometry(key, build) {
    let geo = this._geometries.get(key);
    if (!geo) {
      geo = build();
      this._geometries.set(key, geo);
    }
    return geo;
  }

  /** Shared flat-shaded material for a colour. */
  material(color, options = {}) {
    const key = `${color}|${JSON.stringify(options)}`;
    let mat = this._materials.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color, ...options });
      this._materials.set(key, mat);
    }
    return mat;
  }

  /**
   * Merges box parts that share one material into a single geometry.
   * @param {Array<{size: number[], at: number[], rotY?: number, rotZ?: number}>} parts
   */
  mergedBoxes(key, parts) {
    return this.geometry(key, () => {
      const geometries = parts.map((part) => {
        const box = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
        if (part.rotY) box.rotateY(part.rotY);
        if (part.rotZ) box.rotateZ(part.rotZ);
        box.translate(part.at[0], part.at[1], part.at[2]);
        return box;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((geo) => geo.dispose());
      return merged;
    });
  }

  // -------------------------------------------------------------------- pools

  _acquire(key, build) {
    const pool = this._pools.get(key);
    if (pool && pool.length > 0) return pool.pop();
    return build();
  }

  _release(key, object) {
    if (!object) return;
    if (object.parent) object.parent.remove(object);
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    object.visible = true;
    let pool = this._pools.get(key);
    if (!pool) {
      pool = [];
      this._pools.set(key, pool);
    }
    pool.push(object);
  }

  // ------------------------------------------------------------------- ground

  /**
   * Lane-sized slab whose top surface sits at y = 0, or at the water line for
   * river lanes.
   *
   * Returning an object to a pool clears its transform, so the lane offset is
   * re-applied on every acquire rather than only when the mesh is first built.
   */
  acquireGround(laneType, variant = 0) {
    const mesh = this._acquire(`ground:${laneType}:${variant}`, () =>
      this._buildGround(laneType, variant)
    );
    mesh.position.set(0, groundBaseY(laneType), 0);
    return mesh;
  }

  releaseGround(laneType, variant, mesh) {
    this._release(`ground:${laneType}:${variant}`, mesh);
  }

  _buildGround(laneType, variant) {
    const geo = this.geometry(
      'groundSlab',
      () => new THREE.BoxGeometry(this.groundWidth, GROUND_THICKNESS, GAMEPLAY.tileSize)
    );

    const mesh = new THREE.Mesh(geo, this.material(groundColor(laneType, variant)));
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------- road paint

  /** Dashed lane divider for a road edge, merged into one mesh. */
  acquireRoadDashes() {
    return this._acquire('roadDashes', () => {
      const parts = [];
      for (let x = -GAMEPLAY.visualHalfWidth; x <= GAMEPLAY.visualHalfWidth; x += GAMEPLAY.tileSize) {
        parts.push({ size: [0.5, 0.04, 0.09], at: [x, 0, 0] });
      }
      return new THREE.Mesh(this.mergedBoxes('dashRow', parts), this.material(COLORS.roadDash));
    });
  }

  releaseRoadDashes(mesh) {
    this._release('roadDashes', mesh);
  }

  // ------------------------------------------------------------------ railway

  /** Rails and sleepers: two merged meshes for the whole lane. */
  acquireTrack() {
    return this._acquire('track', () => {
      const group = new THREE.Group();

      const sleeperParts = [];
      for (let x = -GAMEPLAY.visualHalfWidth; x <= GAMEPLAY.visualHalfWidth; x += 0.62) {
        sleeperParts.push({ size: [0.16, 0.1, 0.84], at: [x, 0.05, 0] });
      }
      const sleepers = new THREE.Mesh(
        this.mergedBoxes('sleeperRow', sleeperParts),
        this.material(COLORS.sleeper)
      );
      sleepers.receiveShadow = true;
      group.add(sleepers);

      const rails = new THREE.Mesh(
        this.mergedBoxes('railPair', [
          { size: [this.groundWidth, 0.08, 0.09], at: [0, 0.13, -0.3] },
          { size: [this.groundWidth, 0.08, 0.09], at: [0, 0.13, 0.3] }
        ]),
        this.material(COLORS.rail)
      );
      group.add(rails);

      return group;
    });
  }

  releaseTrack(group) {
    this._release('track', group);
  }

  /**
   * Crossing signal. The lit lamps are a separate mesh toggled by visibility, so
   * blinking needs no per-lane material and no material mutation.
   */
  acquireSignal() {
    return this._acquire('signal', () => {
      const group = new THREE.Group();

      // Post, head and the striped board share one silhouette mesh each.
      const frame = new THREE.Mesh(
        this.mergedBoxes('signalFrame', [
          { size: [0.12, 1.15, 0.12], at: [0, 0.575, 0] },
          { size: [0.34, 0.3, 0.16], at: [0, 1.24, 0] }
        ]),
        this.material(COLORS.signalPost)
      );
      frame.castShadow = true;
      group.add(frame);

      // A tilted stripe board is a shape cue, so the warning is not colour-only.
      const board = new THREE.Mesh(
        this.mergedBoxes('signalBoard', [
          { size: [0.5, 0.12, 0.06], at: [0, 0.95, 0], rotZ: Math.PI / 5 }
        ]),
        this.material(COLORS.signalStripe)
      );
      group.add(board);

      const lampParts = [
        { size: [0.12, 0.12, 0.07], at: [-0.09, 1.24, -0.1] },
        { size: [0.12, 0.12, 0.07], at: [0.09, 1.24, -0.1] }
      ];
      const lampOff = new THREE.Mesh(
        this.mergedBoxes('signalLamps', lampParts),
        this.material(COLORS.signalLampOff)
      );
      const lampOn = new THREE.Mesh(
        this.mergedBoxes('signalLamps', lampParts),
        this.material(COLORS.signalLampOn, {
          emissive: COLORS.signalLampOn,
          emissiveIntensity: 0.9
        })
      );
      lampOn.visible = false;
      group.add(lampOff, lampOn);
      group.userData.lampOn = lampOn;
      group.userData.lampOff = lampOff;

      return group;
    });
  }

  releaseSignal(group) {
    if (group && group.userData.lampOn) {
      group.userData.lampOn.visible = false;
      group.userData.lampOff.visible = true;
    }
    this._release('signal', group);
  }

  // ------------------------------------------------- blockers inside the lane

  /** Tree used as a gameplay blocker: trunk plus crown, two draw calls. */
  acquireTree(variant) {
    return this._acquire(`tree:${variant}`, () => this._buildTree(variant));
  }

  releaseTree(variant, group) {
    this._release(`tree:${variant}`, group);
  }

  _buildTree(variant) {
    const group = new THREE.Group();
    const trunkHeight = 0.34 + variant * 0.06;
    const crownHeight = [0.85, 1.15, 1.5][variant % 3];
    const crownWidth = [0.74, 0.68, 0.62][variant % 3];

    const trunk = new THREE.Mesh(
      this.mergedBoxes(`treeTrunk:${variant}`, [
        { size: [0.26, trunkHeight, 0.26], at: [0, trunkHeight / 2, 0] }
      ]),
      this.material(COLORS.trunk)
    );
    group.add(trunk);

    // Two stacked blocks give a varied silhouette from one merged geometry.
    const crown = new THREE.Mesh(
      this.mergedBoxes(`treeCrown:${variant}`, [
        { size: [crownWidth, crownHeight, crownWidth], at: [0, trunkHeight + crownHeight / 2 - 0.04, 0] },
        {
          size: [crownWidth * 0.62, 0.38, crownWidth * 0.62],
          at: [0.13, trunkHeight + crownHeight * 0.92, -0.1]
        }
      ]),
      this.material(COLORS.foliage[variant % COLORS.foliage.length])
    );
    crown.castShadow = true;
    group.add(crown);

    return group;
  }

  acquireRock(variant) {
    return this._acquire(`rock:${variant}`, () => this._buildRock(variant));
  }

  releaseRock(variant, group) {
    this._release(`rock:${variant}`, group);
  }

  _buildRock(variant) {
    // Two offset blocks in one merged geometry: a single draw call per rock.
    const mesh = new THREE.Mesh(
      this.mergedBoxes(`rockBody:${variant}`, [
        { size: [0.62, 0.34, 0.58], at: [0, 0.17, 0], rotY: 0.3 + variant * 0.4 },
        { size: [0.36, 0.24, 0.34], at: [0.08, 0.42, -0.05], rotY: -0.4 - variant * 0.3 }
      ]),
      this.material(COLORS.rock[variant % COLORS.rock.length])
    );
    mesh.castShadow = true;

    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }

  // --------------------------------------------------- instanced border trees

  /**
   * Instanced scenery batch for one lane's shoulders.
   *
   * The border is the most repeated decoration in the scene, so it is drawn with
   * two instanced meshes per lane instead of two meshes per tree. Geometry
   * origins sit at the base of each block so a single Y scale sets the height.
   */
  acquireSceneryBatch() {
    return this._acquire('sceneryBatch', () => {
      const group = new THREE.Group();

      const trunkGeo = this.geometry('instTrunk', () => {
        const geo = new THREE.BoxGeometry(0.26, 1, 0.26);
        geo.translate(0, 0.5, 0);
        return geo;
      });
      const crownGeo = this.geometry('instCrown', () => {
        const geo = new THREE.BoxGeometry(0.74, 1, 0.74);
        geo.translate(0, 0.5, 0);
        return geo;
      });

      const trunks = new THREE.InstancedMesh(
        trunkGeo,
        this.material(COLORS.trunk),
        SCENERY_CAPACITY
      );
      // White base colour so per-instance colours show through unmodified.
      const crowns = new THREE.InstancedMesh(
        crownGeo,
        this.material(0xffffff, { name: 'instancedCrown' }),
        SCENERY_CAPACITY
      );

      for (const mesh of [trunks, crowns]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Distant decoration does not need to cast shadows.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.count = 0;
      }

      group.add(trunks, crowns);
      group.userData.trunks = trunks;
      group.userData.crowns = crowns;
      return group;
    });
  }

  releaseSceneryBatch(group) {
    if (group) {
      group.userData.trunks.count = 0;
      group.userData.crowns.count = 0;
    }
    this._release('sceneryBatch', group);
  }

  /**
   * Writes one lane's border props into an instanced batch.
   * @param {THREE.Group} batch from acquireSceneryBatch()
   * @param {Array<object>} props from GrassLane metadata
   */
  fillSceneryBatch(batch, props) {
    const { trunks, crowns } = batch.userData;
    const count = Math.min(props.length, SCENERY_CAPACITY);

    for (let i = 0; i < count; i += 1) {
      const prop = props[i];
      const x = prop.column * GAMEPLAY.tileSize;
      const spread = prop.scale;

      DUMMY.rotation.set(0, prop.rotation, 0);
      DUMMY.position.set(x, 0, prop.z);
      DUMMY.scale.set(spread, prop.trunkHeight, spread);
      DUMMY.updateMatrix();
      trunks.setMatrixAt(i, DUMMY.matrix);

      DUMMY.position.set(x, prop.trunkHeight, prop.z);
      DUMMY.scale.set(spread, prop.crownHeight, spread);
      DUMMY.updateMatrix();
      crowns.setMatrixAt(i, DUMMY.matrix);
      crowns.setColorAt(i, SCRATCH_COLOR.setHex(prop.color));
    }

    trunks.count = count;
    crowns.count = count;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;

    // Refresh bounds so frustum culling still works for off-screen lanes.
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- vehicles

  acquireVehicle(kind, colorIndex) {
    return this._acquire(`vehicle:${kind}:${colorIndex}`, () =>
      kind === 'truck' ? this._buildTruck(colorIndex) : this._buildCar(colorIndex)
    );
  }

  releaseVehicle(kind, colorIndex, group) {
    this._release(`vehicle:${kind}:${colorIndex}`, group);
  }

  /** Four wheels merged into one mesh, sized for the given body. */
  _wheels(kind, length, width) {
    const geo = this.geometry(`wheels:${kind}`, () => {
      const offsetX = length / 2 - 0.34;
      const offsetZ = width / 2 - 0.02;
      const parts = [];
      for (const x of [-offsetX, offsetX]) {
        for (const z of [-offsetZ, offsetZ]) {
          const wheel = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.12, 10);
          // Lay the wheel on its side so it rolls along the X axis.
          wheel.rotateX(Math.PI / 2);
          wheel.translate(x, WHEEL_RADIUS, z);
          parts.push(wheel);
        }
      }
      const merged = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      return merged;
    });
    return new THREE.Mesh(geo, this.material(COLORS.wheel));
  }

  /** Head and tail lights, one merged mesh each, making travel direction clear. */
  _lamps(kind, length, width, y) {
    const group = new THREE.Group();
    const inset = width / 2 - 0.16;

    const front = new THREE.Mesh(
      this.mergedBoxes(`headlights:${kind}`, [
        { size: [0.06, 0.1, 0.16], at: [length / 2 - 0.02, y, -inset] },
        { size: [0.06, 0.1, 0.16], at: [length / 2 - 0.02, y, inset] }
      ]),
      this.material(COLORS.headlight, { emissive: COLORS.headlight, emissiveIntensity: 0.6 })
    );

    const back = new THREE.Mesh(
      this.mergedBoxes(`taillights:${kind}`, [
        { size: [0.06, 0.1, 0.16], at: [-length / 2 + 0.02, y, -inset] },
        { size: [0.06, 0.1, 0.16], at: [-length / 2 + 0.02, y, inset] }
      ]),
      this.material(COLORS.taillight, { emissive: COLORS.taillight, emissiveIntensity: 0.45 })
    );

    group.add(front, back);
    return group;
  }

  _buildCar(colorIndex) {
    const { length, width } = GAMEPLAY.vehicles.car;
    const group = new THREE.Group();

    // Body and cabin share the paint colour, so they merge into one mesh.
    const shell = new THREE.Mesh(
      this.mergedBoxes('carShell', [
        { size: [length, 0.3, width], at: [0, 0.24, 0] },
        { size: [length * 0.56, 0.24, width * 0.86], at: [-0.06, 0.5, 0] }
      ]),
      this.material(COLORS.carBodies[colorIndex % COLORS.carBodies.length])
    );
    shell.castShadow = true;
    group.add(shell);

    const glass = new THREE.Mesh(
      this.mergedBoxes('carGlass', [
        { size: [length * 0.5, 0.14, width * 0.9], at: [-0.06, 0.52, 0] }
      ]),
      this.material(COLORS.carCabin)
    );
    group.add(glass);

    group.add(this._wheels('car', length, width));
    group.add(this._lamps('car', length, width, 0.26));
    return group;
  }

  _buildTruck(colorIndex) {
    const { length, width } = GAMEPLAY.vehicles.truck;
    const group = new THREE.Group();

    const cab = new THREE.Mesh(
      this.mergedBoxes('truckCab', [
        { size: [length * 0.32, 0.56, width], at: [length / 2 - length * 0.16, 0.36, 0] }
      ]),
      this.material(COLORS.truckCab[colorIndex % COLORS.truckCab.length])
    );
    cab.castShadow = true;
    group.add(cab);

    const cargo = new THREE.Mesh(
      this.mergedBoxes('truckCargo', [
        { size: [length * 0.64, 0.7, width * 0.98], at: [-length * 0.17, 0.47, 0] }
      ]),
      this.material(COLORS.truckCargo[colorIndex % COLORS.truckCargo.length])
    );
    cargo.castShadow = true;
    group.add(cargo);

    const glass = new THREE.Mesh(
      this.mergedBoxes('truckGlass', [
        { size: [length * 0.1, 0.2, width * 0.88], at: [length / 2 - 0.06, 0.52, 0] }
      ]),
      this.material(COLORS.carCabin)
    );
    group.add(glass);

    group.add(this._wheels('truck', length, width));
    group.add(this._lamps('truck', length, width, 0.28));
    return group;
  }

  // -------------------------------------------------------------------- logs

  acquireLog(lengthTiles, colorIndex) {
    return this._acquire(`log:${lengthTiles}:${colorIndex}`, () =>
      this._buildLog(lengthTiles, colorIndex)
    );
  }

  releaseLog(lengthTiles, colorIndex, group) {
    this._release(`log:${lengthTiles}:${colorIndex}`, group);
  }

  _buildLog(lengthTiles, colorIndex) {
    const group = new THREE.Group();
    const length = lengthTiles * GAMEPLAY.tileSize;
    const radius = GAMEPLAY.platforms.height / 2;

    const trunk = new THREE.Mesh(
      this.geometry(`logTrunk:${lengthTiles}`, () => {
        const cylinder = new THREE.CylinderGeometry(radius, radius, length, 9);
        cylinder.rotateZ(Math.PI / 2);
        // Top surface level with the ground so the player rides at y = 0.
        cylinder.translate(0, -radius, 0);
        return cylinder;
      }),
      this.material(COLORS.logBark[colorIndex % COLORS.logBark.length])
    );
    trunk.castShadow = true;
    group.add(trunk);

    // Pale end grain at both ends, merged into a single mesh.
    const caps = new THREE.Mesh(
      this.geometry(`logCaps:${lengthTiles}`, () => {
        const parts = [];
        for (const sign of [-1, 1]) {
          const cap = new THREE.CylinderGeometry(radius * 0.87, radius * 0.87, 0.06, 9);
          cap.rotateZ(Math.PI / 2);
          cap.translate(sign * (length / 2 - 0.02), -radius, 0);
          parts.push(cap);
        }
        const merged = mergeGeometries(parts);
        parts.forEach((part) => part.dispose());
        return merged;
      }),
      this.material(COLORS.logRing)
    );
    group.add(caps);

    return group;
  }

  // ------------------------------------------------------------------ trains

  acquireTrain(carCount) {
    return this._acquire(`train:${carCount}`, () => this._buildTrain(carCount));
  }

  releaseTrain(carCount, group) {
    this._release(`train:${carCount}`, group);
  }

  _buildTrain(carCount) {
    const group = new THREE.Group();
    const { carLength, carGap, width, height } = GAMEPLAY.railway;
    const total = carCount * carLength + (carCount - 1) * carGap;

    const shells = [];
    const skirts = [];
    const windows = [];
    for (let i = 0; i < carCount; i += 1) {
      const center = -total / 2 + carLength / 2 + i * (carLength + carGap);
      shells.push({ size: [carLength, height, width], at: [center, height / 2 + 0.16, 0] });
      skirts.push({ size: [carLength * 0.98, 0.18, width * 0.8], at: [center, 0.15, 0] });
      windows.push({
        size: [carLength * 0.6, 0.24, width * 1.01],
        at: [center, height * 0.72, 0]
      });
    }

    // One merged mesh per material: four draw calls for the whole train.
    const shell = new THREE.Mesh(
      this.mergedBoxes(`trainShells:${carCount}`, shells),
      this.material(COLORS.trainBody)
    );
    shell.castShadow = true;
    group.add(shell);

    group.add(
      new THREE.Mesh(
        this.mergedBoxes(`trainSkirts:${carCount}`, skirts),
        this.material(COLORS.trainAccent)
      )
    );
    group.add(
      new THREE.Mesh(
        this.mergedBoxes(`trainWindows:${carCount}`, windows),
        this.material(COLORS.trainWindow)
      )
    );

    // Bright nose blocks at both ends, so either travel direction reads clearly.
    group.add(
      new THREE.Mesh(
        this.mergedBoxes(`trainNoses:${carCount}`, [
          { size: [0.22, height * 0.7, width], at: [-(total / 2 + 0.1), height * 0.5 + 0.16, 0] },
          { size: [0.22, height * 0.7, width], at: [total / 2 + 0.1, height * 0.5 + 0.16, 0] }
        ]),
        this.material(COLORS.trainNose)
      )
    );

    return group;
  }

  // ----------------------------------------------------------- shield pickup

  acquireShieldToken() {
    return this._acquire('shieldToken', () => this._buildShieldToken());
  }

  releaseShieldToken(group) {
    this._release('shieldToken', group);
  }

  /**
   * The collectible shield token: a small emblem hovering above its tile.
   *
   * Each part is built twice, crossed at a right angle, so the token stays
   * legible from every side as it turns. Both copies merge into one geometry, so
   * the whole pickup is three draw calls no matter how it is oriented.
   */
  _buildShieldToken() {
    const group = new THREE.Group();
    const crossed = (parts) => [
      ...parts,
      ...parts.map((part) => ({ ...part, rotY: Math.PI / 2 }))
    ];

    // Sized and stacked for the camera's elevation angle, where the top face of
    // the tallest part is what the player mostly sees. The body is therefore the
    // topmost element, and the trim sits below it on the faces that are visible
    // from the front, rather than across the top where it would dominate.
    const plate = new THREE.Mesh(
      this.mergedBoxes(
        'shieldPlate',
        crossed([
          { size: [0.48, 0.36, 0.2], at: [0, 0.18, 0] },
          // Tapered foot, giving the outline a shield shape rather than a slab.
          { size: [0.3, 0.16, 0.2], at: [0, -0.05, 0] }
        ])
      ),
      this.material(COLORS.shield.plate)
    );
    plate.castShadow = true;
    group.add(plate);

    // A bright band right around the token, so it is not read by colour alone.
    const emblem = new THREE.Mesh(
      this.mergedBoxes('shieldEmblem', crossed([{ size: [0.52, 0.09, 0.24], at: [0, 0.17, 0] }])),
      this.material(COLORS.shield.emblem, {
        emissive: COLORS.shield.emblem,
        emissiveIntensity: 0.5
      })
    );
    group.add(emblem);

    // Small pale cap, catching the light so the token stands out against grass.
    const rim = new THREE.Mesh(
      this.mergedBoxes('shieldRim', [{ size: [0.16, 0.07, 0.16], at: [0, 0.39, 0] }]),
      this.material(COLORS.shield.rim)
    );
    group.add(rim);

    return group;
  }

  /**
   * Translucent bubble worn while a shield is active.
   *
   * A faceted octahedron rather than a smooth sphere, so it sits with the
   * flat-shaded look of everything else. Depth writing is off and the mesh draws
   * last, so Pip stays clearly visible inside it.
   *
   * Built once and owned by the player view, like the character itself, rather
   * than pooled: there is only ever one.
   */
  createShieldAura() {
    const mesh = new THREE.Mesh(
      this.geometry('shieldAura', () => new THREE.OctahedronGeometry(0.62, 1)),
      this.material(COLORS.shield.aura, {
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        emissive: COLORS.shield.aura,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide
      })
    );
    mesh.position.y = SHIELD_AURA_Y;
    mesh.renderOrder = 2;
    return mesh;
  }

  // ------------------------------------------------------------------ player

  /**
   * "Pip", the player character: an original block-bodied explorer.
   * Built facing -Z, which is the forward direction, so a facing angle of zero
   * needs no correction.
   */
  createPlayer() {
    const group = new THREE.Group();
    const palette = COLORS.player;

    const body = new THREE.Mesh(
      this.mergedBoxes('pipBody', [
        { size: [0.46, 0.4, 0.42], at: [0, 0.28, 0] },
        { size: [0.4, 0.32, 0.36], at: [0, 0.63, 0] }
      ]),
      this.material(palette.body)
    );
    body.castShadow = true;
    group.add(body);

    const trim = new THREE.Mesh(
      this.mergedBoxes('pipTrim', [
        { size: [0.42, 0.1, 0.38], at: [0, 0.8, 0] },
        { size: [0.14, 0.1, 0.12], at: [0, 0.6, -0.22] },
        { size: [0.13, 0.09, 0.2], at: [-0.12, 0.045, -0.04] },
        { size: [0.13, 0.09, 0.2], at: [0.12, 0.045, -0.04] }
      ]),
      this.material(palette.accent)
    );
    group.add(trim);

    const bib = new THREE.Mesh(
      this.mergedBoxes('pipBib', [{ size: [0.3, 0.24, 0.03], at: [0, 0.26, -0.215] }]),
      this.material(palette.belly)
    );
    group.add(bib);

    const eyes = new THREE.Mesh(
      this.mergedBoxes('pipEyes', [
        { size: [0.07, 0.08, 0.04], at: [-0.1, 0.69, -0.19] },
        { size: [0.07, 0.08, 0.04], at: [0.1, 0.69, -0.19] }
      ]),
      this.material(palette.eye)
    );
    group.add(eyes);

    const pack = new THREE.Mesh(
      this.mergedBoxes('pipPack', [{ size: [0.3, 0.28, 0.14], at: [0, 0.32, 0.24] }]),
      this.material(palette.pack)
    );
    pack.castShadow = true;
    group.add(pack);

    return group;
  }

  // ---------------------------------------------------------------- teardown

  /** Releases every GPU resource. Only safe once nothing is being rendered. */
  dispose() {
    for (const pool of this._pools.values()) {
      for (const object of pool) disposeDeep(object);
      pool.length = 0;
    }
    this._pools.clear();

    for (const geometry of this._geometries.values()) geometry.dispose();
    this._geometries.clear();

    for (const material of this._materials.values()) material.dispose();
    this._materials.clear();
  }
}

/**
 * Resting Y of a lane's ground slab. Walkable surfaces sit at y = 0; river lanes
 * sit lower so logs float with their tops level with the surrounding ground.
 */
export function groundBaseY(laneType) {
  return laneType === LaneTypes.RIVER
    ? GAMEPLAY.river.surfaceY - GROUND_THICKNESS / 2
    : -GROUND_THICKNESS / 2;
}

function groundColor(laneType, variant) {
  switch (laneType) {
    case LaneTypes.GRASS:
      return COLORS.grass[variant % COLORS.grass.length];
    case LaneTypes.ROAD:
      return COLORS.road;
    case LaneTypes.RIVER:
      return COLORS.water;
    case LaneTypes.RAILWAY:
      return COLORS.ballast;
    default:
      return COLORS.grass[0];
  }
}
