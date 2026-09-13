import * as THREE from '../../vendor/three/three.module.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { damp, degToRad } from '../utils/math.js';
import { laneToZ } from '../world/coords.js';

/**
 * Orthographic follow camera.
 *
 * `progress` is a single smoothed value that tracks the furthest lane reached.
 * Both the camera position and its look-at target are derived from it, so the
 * camera never drifts backward for a single backward step, and it plays no part
 * in collision calculations.
 *
 * The frustum is sized so a guaranteed world-space span is always visible,
 * whatever the window aspect ratio.
 */
export class CameraController {
  /** @param {{reducedMotion?: boolean}} [options] */
  constructor({ reducedMotion = false } = {}) {
    const config = GAMEPLAY.camera;
    this.config = config;
    this.reducedMotion = reducedMotion;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, config.near, config.far);

    // Fixed elevated, slightly angled view direction.
    const yaw = degToRad(config.yawDegrees);
    const pitch = degToRad(config.pitchDegrees);
    this._offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    ).multiplyScalar(config.distance);

    this._target = new THREE.Vector3();
    this.progress = 0;
    this.reset(0);
  }

  /** Snaps the camera to `laneIndex`, avoiding a sweep across the world on restart. */
  reset(laneIndex) {
    this.progress = laneIndex;
    this._apply();
  }

  /**
   * @param {number} dt seconds
   * @param {number} targetLane the furthest lane reached this run
   */
  update(dt, targetLane) {
    const lambda = this.reducedMotion ? this.config.reducedMotionDamping : this.config.damping;
    this.progress = damp(this.progress, targetLane, lambda, dt);
    this._apply();
  }

  _apply() {
    const lookLane = this.progress + this.config.lookAheadLanes;
    this._target.set(0, 0, laneToZ(lookLane));
    this.camera.position.copy(this._target).add(this._offset);
    this.camera.lookAt(this._target);
    this.camera.updateMatrixWorld();
  }

  /** World Z the camera is aimed at. The light rig follows this. */
  get targetZ() {
    return this._target.z;
  }

  /**
   * Fits the orthographic frustum to the viewport while guaranteeing that at
   * least `requiredWidth` x `requiredHeight` world units stay visible.
   */
  resize(width, height) {
    const aspect = Math.max(0.2, width / Math.max(1, height));
    const viewHeight = Math.max(this.config.requiredHeight, this.config.requiredWidth / aspect);
    const viewWidth = viewHeight * aspect;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
  }
}
