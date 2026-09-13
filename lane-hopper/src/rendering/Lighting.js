import * as THREE from '../../vendor/three/three.module.js';
import { COLORS } from '../config/colors.js';
import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Soft outdoor lighting: a hemisphere fill plus one shadow-casting directional
 * light. The directional light travels with the camera so its shadow frustum
 * stays tight around the visible lanes, which keeps shadow quality usable at a
 * modest 1024px shadow map.
 */
export class Lighting {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.hemisphere = new THREE.HemisphereLight(COLORS.sky, COLORS.grassEdge, 1.05);
    scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(this.ambient);

    this.directional = new THREE.DirectionalLight(0xffffff, 1.5);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(
      GAMEPLAY.render.shadowMapSize,
      GAMEPLAY.render.shadowMapSize
    );

    const shadowCamera = this.directional.shadow.camera;
    shadowCamera.left = -14;
    shadowCamera.right = 14;
    shadowCamera.top = 16;
    shadowCamera.bottom = -12;
    shadowCamera.near = 1;
    shadowCamera.far = 60;
    this.directional.shadow.bias = -0.0012;
    this.directional.shadow.normalBias = 0.02;

    // Offset from the tracked point; a shallow angle keeps shadows readable.
    this._offset = new THREE.Vector3(9, 22, 12);

    scene.add(this.directional);
    scene.add(this.directional.target);
    this.update(0);
  }

  /** Keeps the light centred on the world Z the camera is looking at. */
  update(targetZ) {
    this.directional.target.position.set(0, 0, targetZ);
    this.directional.target.updateMatrixWorld();
    this.directional.position.set(
      this._offset.x,
      this._offset.y,
      targetZ + this._offset.z
    );
  }

  dispose() {
    this.directional.shadow.map?.dispose();
    this.hemisphere.dispose?.();
    this.ambient.dispose?.();
    this.directional.dispose?.();
  }
}
