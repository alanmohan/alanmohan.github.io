import { GAMEPLAY } from '../config/gameplay.js';
import { CameraController } from '../rendering/CameraController.js';
import { Lighting } from '../rendering/Lighting.js';
import { MeshFactory } from '../rendering/MeshFactory.js';
import { PlayerView } from '../rendering/PlayerView.js';
import { Renderer } from '../rendering/Renderer.js';
import { WorldView } from '../rendering/WorldView.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { InputActions, InputSystem } from '../systems/InputSystem.js';
import { StorageSystem } from '../systems/StorageSystem.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { UIActions, UIController } from '../ui/UIController.js';
import { GameLoop } from './GameLoop.js';
import { GameStates } from './GameState.js';
import { Simulation } from './Simulation.js';

/**
 * Application shell.
 *
 * Wires the headless `Simulation` to presentation and platform concerns:
 * rendering, camera, input, audio, HUD and persistence. All gameplay rules live
 * in the simulation; this class only translates between it and the browser.
 */
export class Game {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container element the canvas is appended to
   * @param {number|string|null} [options.seedOverride] fixed run seed
   * @param {boolean} [options.debug] show the diagnostics panel
   * @param {boolean} [options.reducedMotion]
   */
  constructor({ container, seedOverride = null, debug = false, reducedMotion = false }) {
    this.container = container;
    this.reducedMotion = reducedMotion;

    this.storage = new StorageSystem(GAMEPLAY.storage.prefix);
    this.audio = new AudioSystem(this.storage);
    this.simulation = new Simulation({ storage: this.storage, seedOverride });

    // Rendering. Created once; a restart never rebuilds any of it.
    this.renderer = new Renderer(container);
    this.lighting = new Lighting(this.renderer.scene);
    this.camera = new CameraController({ reducedMotion });
    this.meshFactory = new MeshFactory();
    this.worldView = new WorldView(this.renderer.scene, this.meshFactory, { reducedMotion });
    this.playerView = new PlayerView(this.worldView.root, this.meshFactory, { reducedMotion });

    this.ui = new UIController(document);
    this.debugPanel = new DebugPanel(document.getElementById('debug-panel'));
    this.debugPanel.setEnabled(debug);

    this.input = new InputSystem();

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render()
    });

    this._elapsed = 0;
    this._teardown = [];

    this._wireInput();
    this._wireUI();
    this._wirePlatformEvents();

    this.ui.setBest(this.simulation.score.best);
    this.ui.setMuted(this.audio.muted);
    this.ui.setScore(0);
    this.ui.setShield(this.simulation.shield.status());
    this._syncStateToUI();
    this.resize();
  }

  // ------------------------------------------------------------------ startup

  /** Enters the title screen and starts the animation loop. */
  start() {
    this.simulation.bootToMenu();
    this._syncStateToUI();
    this.camera.reset(0);
    this.loop.start();
  }

  // -------------------------------------------------------------------- wiring

  _wireInput() {
    this.input.onInput((intent) => this._handleInput(intent));
    this.input.attach();
    this._teardown.push(() => this.input.detach());
  }

  _handleInput(intent) {
    // Any key press counts as the user gesture that unlocks audio.
    this.audio.unlock();
    const state = this.simulation.state.current;

    switch (intent.type) {
      case InputActions.MOVE:
        this.simulation.queueMove(intent.direction);
        break;

      case InputActions.PAUSE:
        if (state === GameStates.PLAYING) this._pause();
        else if (state === GameStates.PAUSED) this._resume();
        break;

      case InputActions.CONFIRM:
        // Enter and Space start a run from the menu and restart after a death.
        if (state === GameStates.MENU || state === GameStates.GAME_OVER) this._startRun();
        else if (state === GameStates.PAUSED) this._resume();
        break;

      case InputActions.RESTART:
        if (state === GameStates.GAME_OVER || state === GameStates.PAUSED) this._startRun();
        break;

      case InputActions.MUTE:
        this._toggleMute();
        break;

      case InputActions.SHIELD:
        // Refusals are reported as simulation events, like a blocked move, so
        // the feedback for them lives in one place.
        this.simulation.activateShield();
        break;

      default:
        break;
    }
  }

  _wireUI() {
    this.ui.onAction((action) => {
      this.audio.unlock();
      switch (action) {
        case UIActions.START:
        case UIActions.RESTART:
          this.audio.menu();
          this._startRun();
          break;
        case UIActions.PAUSE:
          this._pause();
          break;
        case UIActions.RESUME:
          this._resume();
          break;
        case UIActions.MENU:
          this.audio.menu();
          this._returnToMenu();
          break;
        case UIActions.MUTE:
          this._toggleMute();
          break;
        default:
          break;
      }
    });
    this._teardown.push(() => this.ui.destroy());
  }

  _wirePlatformEvents() {
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this._teardown.push(() => window.removeEventListener('resize', onResize));

    // A hidden tab or an unfocused window must not let hazards keep moving.
    const onVisibility = () => {
      if (document.hidden) this._pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this._teardown.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onBlur = () => {
      this.input.reset();
      this._pause();
    };
    window.addEventListener('blur', onBlur);
    this._teardown.push(() => window.removeEventListener('blur', onBlur));

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motionQuery) {
      const onMotionChange = (event) => this.setReducedMotion(event.matches);
      motionQuery.addEventListener?.('change', onMotionChange);
      this._teardown.push(() => motionQuery.removeEventListener?.('change', onMotionChange));
    }
  }

  // ---------------------------------------------------------------- commands

  _startRun() {
    // Refused mid-run; the state machine rejects PLAYING -> PLAYING anyway.
    if (!this.simulation.startRun()) return;

    // Reset presentation to match the fresh run.
    this.worldView.clear();
    this.playerView.reset(this.simulation.player);
    this.camera.reset(0);
    this.ui.setScore(0);
    this.ui.setBest(this.simulation.score.best);
    this.ui.setShield(this.simulation.shield.status());
    this.audio.resume();
    this._syncStateToUI();
  }

  _pause() {
    if (!this.simulation.pause()) return;
    this.input.reset();
    this.audio.suspend();
    this._syncStateToUI();
  }

  _resume() {
    if (!this.simulation.resume()) return;
    this.audio.resume();
    this._syncStateToUI();
  }

  _returnToMenu() {
    if (!this.simulation.returnToMenu()) return;
    this.audio.resume();
    this._syncStateToUI();
  }

  _toggleMute() {
    const muted = this.audio.toggleMute();
    this.ui.setMuted(muted);
    if (!muted) this.audio.menu();
  }

  _syncStateToUI() {
    this.ui.setState(this.simulation.state.current);
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    const before = this.simulation.state.current;

    this.simulation.update(dt);
    this._processEvents();

    if (this.simulation.state.current !== before) this._syncStateToUI();

    // Freezing the camera during a pause keeps the whole world visually still.
    if (this.simulation.state.current !== GameStates.PAUSED) {
      this._elapsed += dt;
      this.camera.update(dt, this.simulation.score.maxLaneReached);
      this.lighting.update(this.camera.targetZ);
    }

    this.playerView.setShieldActive(this.simulation.shield.isActive);
    this.playerView.sync(this.simulation.player, dt);
    this.ui.setScore(this.simulation.score.score);
    this.ui.setBest(this.simulation.score.best);
    this.ui.setShield(this.simulation.shield.status());

    if (this.debugPanel.enabled) {
      this.debugPanel.update(dt, {
        ...this.simulation.snapshot(),
        fps: this.loop.fps,
        drawCalls: this.renderer.info.render.calls
      });
    }
  }

  /** Turns simulation events into sound and UI updates. */
  _processEvents() {
    const events = this.simulation.drainEvents();
    if (events.length === 0) return;

    const playerLane = this.simulation.player.laneIndex;

    for (const event of events) {
      switch (event.type) {
        case 'move':
          this.audio.hop();
          break;
        case 'moveRejected':
          this.audio.blocked();
          break;
        case 'milestone':
          this.audio.milestone();
          break;
        case 'trainWarning':
          // Only audible for railways near the player, not the whole window.
          if (Math.abs(event.laneIndex - playerLane) <= GAMEPLAY.audioLaneRange) {
            this.audio.trainWarning();
          }
          break;
        case 'trainPass':
          if (Math.abs(event.laneIndex - playerLane) <= GAMEPLAY.audioLaneRange) {
            this.audio.trainPass();
          }
          break;
        case 'shieldCollected':
          this.audio.shieldPickup();
          break;
        case 'shieldActivated':
          this.audio.shieldUp();
          break;
        case 'shieldRejected':
          // The same refusal cue a blocked hop uses, so "that did nothing" reads
          // consistently whatever the player tried.
          this.audio.blocked();
          break;
        case 'shieldExpired':
          this.audio.shieldDown();
          break;
        case 'shieldDeflect':
          this.audio.shieldDeflect();
          break;
        case 'death':
          this._playDeathSound(event.cause);
          this.ui.showResult(event);
          break;
        default:
          break;
      }
    }
  }

  _playDeathSound(cause) {
    if (cause === 'water') this.audio.splash();
    else this.audio.vehicleImpact();
  }

  render() {
    const { changed, width, height } = this.renderer.resize();
    if (changed) this.camera.resize(width, height);

    this.worldView.sync(this.simulation.world, this._elapsed);
    this.renderer.render(this.camera.camera);
  }

  resize() {
    const { width, height } = this.renderer.resize();
    this.camera.resize(width, height);
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
    this.camera.setReducedMotion(enabled);
    this.worldView.setReducedMotion(enabled);
    this.playerView.setReducedMotion(enabled);
  }

  // ---------------------------------------------------------------- teardown

  destroy() {
    this.loop.stop();
    for (const undo of this._teardown) undo();
    this._teardown.length = 0;
    this.worldView.dispose();
    this.meshFactory.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
    this.audio.dispose();
    this.simulation.state.clearListeners();
  }
}
