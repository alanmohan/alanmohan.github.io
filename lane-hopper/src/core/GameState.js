/**
 * Explicit game state machine.
 *
 * A single `current` value replaces loose booleans such as isDead / isPaused /
 * isPlaying, which can otherwise contradict one another. UI visibility and
 * update permissions are both derived from this value.
 */

export const GameStates = Object.freeze({
  BOOT: 'BOOT',
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  DYING: 'DYING',
  GAME_OVER: 'GAME_OVER'
});

/**
 * Allowed transitions.
 *
 * PAUSED -> MENU is included in addition to the transitions listed in the
 * specification's diagram because the pause overlay is required to offer a
 * return-to-menu action (spec 13.3). Every other edge matches the spec exactly.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [GameStates.BOOT]: Object.freeze([GameStates.MENU]),
  [GameStates.MENU]: Object.freeze([GameStates.PLAYING]),
  [GameStates.PLAYING]: Object.freeze([GameStates.PAUSED, GameStates.DYING]),
  [GameStates.PAUSED]: Object.freeze([GameStates.PLAYING, GameStates.MENU]),
  [GameStates.DYING]: Object.freeze([GameStates.GAME_OVER]),
  [GameStates.GAME_OVER]: Object.freeze([GameStates.PLAYING, GameStates.MENU])
});

export class GameStateMachine {
  constructor(initial = GameStates.BOOT) {
    if (!ALLOWED_TRANSITIONS[initial]) {
      throw new Error(`Unknown initial game state: ${initial}`);
    }
    this._current = initial;
    this._listeners = new Set();
  }

  get current() {
    return this._current;
  }

  /** True when the current state is any of the supplied states. */
  is(...states) {
    return states.includes(this._current);
  }

  /** True when `to` is reachable from the current state. */
  canTransition(to) {
    const allowed = ALLOWED_TRANSITIONS[this._current];
    return Boolean(allowed) && allowed.includes(to);
  }

  /**
   * Attempts a transition.
   * @returns {boolean} true when the transition was applied, false when rejected.
   */
  transition(to) {
    if (!this.canTransition(to)) return false;
    const from = this._current;
    this._current = to;
    for (const listener of this._listeners) listener(to, from);
    return true;
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Drops every listener. Used on teardown so restarts cannot leak handlers. */
  clearListeners() {
    this._listeners.clear();
  }
}
