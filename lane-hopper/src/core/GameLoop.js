import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Fixed-timestep game loop with an accumulator.
 *
 * Gameplay advances in constant `fixedStep` slices, which keeps the simulation
 * stable and repeatable regardless of display refresh rate. Rendering happens
 * once per animation frame.
 *
 * `tick()` is separated from `requestAnimationFrame` so the loop can be driven
 * directly by tests.
 */
export class GameLoop {
  constructor({
    update,
    render,
    fixedStep = GAMEPLAY.time.fixedStep,
    maxDelta = GAMEPLAY.time.maxDelta,
    maxSubSteps = GAMEPLAY.time.maxSubSteps,
    requestFrame,
    cancelFrame
  }) {
    this.update = update;
    this.render = render;
    this.fixedStep = fixedStep;
    this.maxDelta = maxDelta;
    this.maxSubSteps = maxSubSteps;

    const globalScope = typeof globalThis !== 'undefined' ? globalThis : {};
    this._requestFrame =
      requestFrame ||
      (globalScope.requestAnimationFrame
        ? globalScope.requestAnimationFrame.bind(globalScope)
        : (cb) => setTimeout(() => cb(Date.now()), 16));
    this._cancelFrame =
      cancelFrame ||
      (globalScope.cancelAnimationFrame
        ? globalScope.cancelAnimationFrame.bind(globalScope)
        : clearTimeout);

    this._frameId = null;
    this._lastTime = null;
    this._accumulator = 0;
    this._running = false;

    this.fps = 0;
    this._fpsFrames = 0;
    this._fpsElapsed = 0;

    this._onFrame = (timestampMs) => {
      if (!this._running) return;
      this._frameId = this._requestFrame(this._onFrame);
      this.tick(timestampMs);
    };
  }

  get running() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = null;
    this._accumulator = 0;
    this._frameId = this._requestFrame(this._onFrame);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._frameId !== null) this._cancelFrame(this._frameId);
    this._frameId = null;
  }

  /**
   * Advances the simulation to `timestampMs` and renders once.
   * @param {number} timestampMs high-resolution timestamp in milliseconds
   */
  tick(timestampMs) {
    if (this._lastTime === null) {
      this._lastTime = timestampMs;
      this.render(0);
      return;
    }

    // Large gaps happen after tab switches or breakpoints; clamp so the
    // simulation never tries to catch up through hundreds of steps.
    const rawDelta = (timestampMs - this._lastTime) / 1000;
    this._lastTime = timestampMs;
    const delta = Math.min(Math.max(rawDelta, 0), this.maxDelta);

    this._accumulator += delta;
    let steps = 0;
    while (this._accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.update(this.fixedStep);
      this._accumulator -= this.fixedStep;
      steps += 1;
    }
    // Drop any leftover time we could not simulate rather than letting it grow.
    if (steps >= this.maxSubSteps) this._accumulator = 0;

    this._trackFps(delta);
    this.render(this._accumulator / this.fixedStep);
  }

  _trackFps(delta) {
    this._fpsFrames += 1;
    this._fpsElapsed += delta;
    if (this._fpsElapsed >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsElapsed);
      this._fpsFrames = 0;
      this._fpsElapsed = 0;
    }
  }
}
