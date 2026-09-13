import * as THREE from '../../vendor/three/three.module.js';
import { COLORS } from '../config/colors.js';
import { GAMEPLAY } from '../config/gameplay.js';

/** Thrown when WebGL cannot be initialised, so the UI can show a readable notice. */
export class WebGLUnavailableError extends Error {
  constructor(cause) {
    super('WebGL could not be initialised.');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

/**
 * Owns the WebGL renderer, the scene and resize handling.
 *
 * Created once and reused for the lifetime of the page: restarting a run never
 * rebuilds the renderer or the canvas.
 */
export class Renderer {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
      });
    } catch (error) {
      throw new WebGLUnavailableError(error);
    }

    if (!this.renderer || !this.renderer.getContext()) {
      throw new WebGLUnavailableError(new Error('No WebGL context available.'));
    }

    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Matches the colour management defaults of current Three.js releases.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(COLORS.sky, 1);

    this.domElement = this.renderer.domElement;
    this.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    // Fog hides the far generation boundary. Ranges are tuned for the fixed
    // orthographic camera distance in GAMEPLAY.camera.
    this.scene.fog = new THREE.Fog(COLORS.fog, GAMEPLAY.render.fogNear, GAMEPLAY.render.fogFar);

    this.width = 1;
    this.height = 1;
    this.resize();
  }

  _pixelRatio() {
    const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(device, GAMEPLAY.render.maxPixelRatio);
  }

  /**
   * Resizes the drawing buffer to the container.
   * @returns {{width: number, height: number, changed: boolean}}
   */
  resize() {
    // Guard against a zero-sized or collapsed container.
    const width = Math.max(1, Math.floor(this.container.clientWidth || 1));
    const height = Math.max(1, Math.floor(this.container.clientHeight || 1));
    const changed = width !== this.width || height !== this.height;
    if (changed) {
      this.width = width;
      this.height = height;
      this.renderer.setPixelRatio(this._pixelRatio());
      this.renderer.setSize(width, height, false);
    }
    return { width, height, changed };
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  get info() {
    return this.renderer.info;
  }

  dispose() {
    this.renderer.dispose();
    if (this.domElement.parentNode) this.domElement.parentNode.removeChild(this.domElement);
  }
}

/**
 * Cheap capability probe used before constructing the renderer, so a failure can
 * be reported without a half-built scene.
 */
export function isWebGLAvailable() {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGL2RenderingContext && canvas.getContext('webgl2')
    ) || Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}
