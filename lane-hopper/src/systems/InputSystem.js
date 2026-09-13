import { Directions } from './MovementSystem.js';

/**
 * Non-movement actions emitted by the input system.
 * `CONFIRM` covers Enter and Space, whose meaning depends on the game state.
 */
export const InputActions = Object.freeze({
  MOVE: 'move',
  PAUSE: 'pause',
  CONFIRM: 'confirm',
  RESTART: 'restart',
  MUTE: 'mute',
  /** Spend a shield charge. */
  SHIELD: 'shield'
});

/** Keys whose default behaviour would scroll the page. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  ' ',
  'Spacebar'
]);

const MOVE_KEYS = new Map([
  ['ArrowUp', Directions.FORWARD],
  ['KeyW', Directions.FORWARD],
  ['ArrowDown', Directions.BACKWARD],
  ['KeyS', Directions.BACKWARD],
  ['ArrowLeft', Directions.LEFT],
  ['KeyA', Directions.LEFT],
  ['ArrowRight', Directions.RIGHT],
  ['KeyD', Directions.RIGHT]
]);

const ACTION_KEYS = new Map([
  ['Escape', InputActions.PAUSE],
  ['KeyP', InputActions.PAUSE],
  ['Enter', InputActions.CONFIRM],
  ['NumpadEnter', InputActions.CONFIRM],
  ['Space', InputActions.CONFIRM],
  ['KeyR', InputActions.RESTART],
  ['KeyM', InputActions.MUTE],
  ['KeyF', InputActions.SHIELD]
]);

/**
 * Keyboard input.
 *
 * Responsibilities are deliberately narrow: translate key events into intents
 * and hand them to a listener. Queueing and validation belong to the simulation.
 *
 * Held-key auto-repeat is ignored via `event.repeat`, and a key must be released
 * before it can fire again, so leaning on a key cannot flood the queue.
 */
export class InputSystem {
  /**
   * @param {object} options
   * @param {EventTarget} [options.target] keyboard event source
   * @param {EventTarget} [options.blurTarget] source of focus-loss events
   */
  constructor({ target, blurTarget } = {}) {
    const scope = typeof window !== 'undefined' ? window : null;
    this.target = target || scope;
    this.blurTarget = blurTarget || scope;

    this._listener = null;
    this._held = new Set();
    this._attached = false;

    this._onKeyDown = (event) => this._handleKeyDown(event);
    this._onKeyUp = (event) => this._held.delete(keyOf(event));
    this._onBlur = () => this.reset();
  }

  /** Registers the single listener that receives every intent. */
  onInput(listener) {
    this._listener = listener;
  }

  attach() {
    if (this._attached || !this.target) return;
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    if (this.blurTarget) this.blurTarget.addEventListener('blur', this._onBlur);
    this._attached = true;
  }

  /** Removes every listener. Restarting the game never re-attaches twice. */
  detach() {
    if (!this._attached || !this.target) return;
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    if (this.blurTarget) this.blurTarget.removeEventListener('blur', this._onBlur);
    this._attached = false;
    this.reset();
  }

  /** Clears held-key state, e.g. when the window loses focus. */
  reset() {
    this._held.clear();
  }

  _handleKeyDown(event) {
    const key = keyOf(event);

    if (SCROLL_KEYS.has(key) || SCROLL_KEYS.has(event.key)) {
      event.preventDefault();
    }

    // Browser auto-repeat is discarded; a real keyup is required first.
    if (event.repeat || this._held.has(key)) return;
    this._held.add(key);

    if (!this._listener) return;

    const direction = MOVE_KEYS.get(key);
    if (direction) {
      this._listener({ type: InputActions.MOVE, direction });
      return;
    }

    const action = ACTION_KEYS.get(key);
    if (action) this._listener({ type: action });
  }
}

/** Normalises to `event.code`, falling back to `event.key` in older browsers. */
function keyOf(event) {
  if (event.code) return event.code;
  if (event.key === ' ') return 'Space';
  return event.key;
}
