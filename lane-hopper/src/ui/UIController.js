import { DeathCauses } from '../config/gameplay.js';
import { GameStates } from '../core/GameState.js';
import { ShieldStates } from '../systems/ShieldSystem.js';

/** Player-facing action names emitted by the UI. */
export const UIActions = Object.freeze({
  START: 'start',
  RESUME: 'resume',
  RESTART: 'restart',
  PAUSE: 'pause',
  MENU: 'menu',
  MUTE: 'mute'
});

/** Short, plain-language explanation of each death cause. */
const CAUSE_MESSAGES = Object.freeze({
  [DeathCauses.VEHICLE]: 'Flattened by traffic.',
  [DeathCauses.TRAIN]: 'Caught out on the tracks.',
  [DeathCauses.WATER]: 'Missed the log and went under.',
  [DeathCauses.OUT_OF_BOUNDS]: 'Drifted off the edge of the crossing.',
  [DeathCauses.LEFT_BEHIND]: 'Left behind. Keep pushing forward.'
});

/**
 * Owns every DOM overlay: title screen, HUD, pause and game-over panels.
 *
 * Visibility is derived entirely from the game state, never from independent
 * flags. The controller reports intent through `onAction` and never touches
 * world entities directly.
 */
export class UIController {
  /** @param {Document|HTMLElement} [root] */
  constructor(root = document) {
    const query = (id) => root.getElementById(id);

    this.el = {
      fatal: query('fatal-error'),
      fatalMessage: query('fatal-error-message'),

      title: query('title-screen'),
      titleBest: query('title-best'),
      titleMute: query('btn-title-mute'),
      titleMuteState: query('title-mute-state'),
      start: query('btn-start'),

      hud: query('hud'),
      hudScore: query('hud-score'),
      hudBest: query('hud-best'),
      hudMute: query('btn-mute'),
      hudMuteState: query('hud-mute-state'),
      hudPause: query('btn-pause'),

      hudShield: query('hud-shield'),
      hudShieldCharges: query('hud-shield-charges'),
      hudShieldStatus: query('hud-shield-status'),
      hudShieldMeter: query('hud-shield-meter'),
      hudShieldFill: query('hud-shield-fill'),

      pause: query('pause-overlay'),
      resume: query('btn-resume'),
      pauseRestart: query('btn-pause-restart'),
      pauseMenu: query('btn-pause-menu'),

      gameOver: query('gameover-overlay'),
      gameOverCause: query('gameover-cause'),
      gameOverRecord: query('gameover-record'),
      gameOverScore: query('gameover-score'),
      gameOverBest: query('gameover-best'),
      restart: query('btn-restart'),
      menu: query('btn-menu'),

      live: query('live-region')
    };

    this._listener = null;
    this._bound = [];
    // Cached last-written values, so the DOM is only touched when data changes.
    this._shown = { score: null, best: null, muted: null, state: null, shield: null };

    this._bindButtons();
  }

  onAction(listener) {
    this._listener = listener;
  }

  _emit(action) {
    if (this._listener) this._listener(action);
  }

  _bindButtons() {
    const bind = (element, action) => {
      if (!element) return;
      const handler = () => this._emit(action);
      element.addEventListener('click', handler);
      this._bound.push({ element, handler });
    };

    bind(this.el.start, UIActions.START);
    bind(this.el.titleMute, UIActions.MUTE);
    bind(this.el.hudMute, UIActions.MUTE);
    bind(this.el.hudPause, UIActions.PAUSE);
    bind(this.el.resume, UIActions.RESUME);
    bind(this.el.pauseRestart, UIActions.RESTART);
    bind(this.el.pauseMenu, UIActions.MENU);
    bind(this.el.restart, UIActions.RESTART);
    bind(this.el.menu, UIActions.MENU);
  }

  /** Removes every listener, so repeated setup can never double-bind. */
  destroy() {
    for (const { element, handler } of this._bound) {
      element.removeEventListener('click', handler);
    }
    this._bound.length = 0;
    this._listener = null;
  }

  // ------------------------------------------------------------- visibility

  /**
   * Shows exactly the overlays that belong to `state`.
   * @param {string} state a GameStates value
   */
  setState(state) {
    if (this._shown.state === state) return;
    this._shown.state = state;

    show(this.el.title, state === GameStates.MENU);
    show(this.el.hud, state === GameStates.PLAYING || state === GameStates.PAUSED || state === GameStates.DYING);
    show(this.el.pause, state === GameStates.PAUSED);
    show(this.el.gameOver, state === GameStates.GAME_OVER);

    // Move focus to the primary control of whichever panel just opened, so the
    // keyboard path works without reaching for the mouse.
    if (state === GameStates.MENU) focus(this.el.start);
    else if (state === GameStates.PAUSED) focus(this.el.resume);
    else if (state === GameStates.GAME_OVER) focus(this.el.restart);

    this._announce(state);
  }

  /** Readable notice when the game cannot start at all. */
  showFatalError(message) {
    if (this.el.fatalMessage && message) this.el.fatalMessage.textContent = message;
    show(this.el.fatal, true);
    show(this.el.title, false);
    show(this.el.hud, false);
    show(this.el.pause, false);
    show(this.el.gameOver, false);
  }

  // ------------------------------------------------------------------ values

  setScore(score) {
    if (this._shown.score === score) return;
    this._shown.score = score;
    setText(this.el.hudScore, score);
  }

  setBest(best) {
    if (this._shown.best === best) return;
    this._shown.best = best;
    setText(this.el.hudBest, best);
    setText(this.el.titleBest, best);
  }

  setMuted(muted) {
    if (this._shown.muted === muted) return;
    this._shown.muted = muted;
    const label = muted ? 'off' : 'on';
    setText(this.el.hudMuteState, label);
    setText(this.el.titleMuteState, label);
    // aria-pressed communicates state to assistive technology, and the text
    // label means the state is never conveyed by colour alone.
    if (this.el.hudMute) this.el.hudMute.setAttribute('aria-pressed', String(muted));
    if (this.el.titleMute) this.el.titleMute.setAttribute('aria-pressed', String(muted));
  }

  /**
   * Updates the shield indicator: charges held, and the active or cooldown
   * window still to run.
   *
   * Called every frame, so the whole reading is reduced to one signature string
   * and the DOM is only touched when that changes.
   *
   * @param {object} shield a `ShieldSystem.status()` reading
   */
  setShield(shield) {
    if (!shield) return;

    const reading = describeShield(shield);
    const signature = `${shield.charges}/${shield.maxCharges}|${reading.text}|${reading.fill ?? 'x'}`;
    if (this._shown.shield === signature) return;
    this._shown.shield = signature;

    this._renderShieldPips(shield);
    setText(this.el.hudShieldStatus, reading.text);

    if (this.el.hudShield) {
      // A data attribute rather than a class, so the styling hook and the state
      // it reflects cannot drift apart.
      this.el.hudShield.dataset.shieldState = reading.tone;
    }

    show(this.el.hudShieldMeter, reading.fill !== null);
    if (this.el.hudShieldFill && reading.fill !== null) {
      this.el.hudShieldFill.style.transform = `scaleX(${reading.fill})`;
    }
  }

  /**
   * Draws one pip per possible charge, filling those the player holds.
   *
   * The pips are built from the configured maximum rather than written into the
   * markup, so the cap lives in exactly one place.
   */
  _renderShieldPips({ charges, maxCharges }) {
    const container = this.el.hudShieldCharges;
    if (!container) return;

    if (container.childElementCount !== maxCharges) {
      container.textContent = '';
      for (let i = 0; i < maxCharges; i += 1) {
        const pip = container.ownerDocument.createElement('span');
        pip.className = 'hud__pip';
        container.appendChild(pip);
      }
    }

    for (let i = 0; i < container.children.length; i += 1) {
      container.children[i].classList.toggle('hud__pip--filled', i < charges);
    }

    // The pips are decorative; this label is what assistive technology reads.
    container.setAttribute(
      'aria-label',
      charges === 0 ? 'No shield charges' : `${charges} of ${maxCharges} shield charges`
    );
  }

  /**
   * Fills in the game-over panel.
   * @param {{score: number, best: number, record: boolean, cause: string}} result
   */
  showResult({ score, best, record, cause }) {
    setText(this.el.gameOverScore, score);
    setText(this.el.gameOverBest, best);
    setText(this.el.gameOverCause, CAUSE_MESSAGES[cause] || 'The run ended.');
    show(this.el.gameOverRecord, Boolean(record));
  }

  _announce(state) {
    if (!this.el.live) return;
    const messages = {
      [GameStates.MENU]: 'Title screen. Press Enter to start a run.',
      [GameStates.PLAYING]: 'Run started.',
      [GameStates.PAUSED]: 'Game paused.',
      [GameStates.GAME_OVER]: 'Run over. Press Enter to try again.'
    };
    const message = messages[state];
    if (message) this.el.live.textContent = message;
  }
}

/**
 * Turns a shield reading into the three things the HUD shows: a short status
 * line in words, an optional 0..1 meter fill, and a styling tone.
 *
 * The meter is only meaningful while a window is running down, so it reports
 * `null` when the shield is simply sitting there waiting to be used.
 */
function describeShield({
  charges,
  state,
  activeRemaining,
  cooldownRemaining,
  duration,
  cooldown
}) {
  if (state === ShieldStates.ACTIVE) {
    return {
      text: `Up ${seconds(activeRemaining)}s`,
      fill: fraction(activeRemaining / duration),
      tone: 'active'
    };
  }

  if (state === ShieldStates.COOLDOWN) {
    return {
      // Counts the cooldown down rather than up, matching the active reading.
      text: `Recharging ${seconds(cooldownRemaining)}s`,
      fill: fraction(1 - cooldownRemaining / cooldown),
      tone: 'cooldown'
    };
  }

  return charges > 0
    ? { text: 'Ready', fill: null, tone: 'ready' }
    : { text: 'None held', fill: null, tone: 'empty' };
}

/** One decimal place, so a countdown reads as moving without flickering. */
function seconds(value) {
  return Math.max(0, value).toFixed(1);
}

/** Clamped to 0..1 and rounded, which also keeps the change signature stable. */
function fraction(value) {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * 100) / 100;
}

function show(element, visible) {
  if (!element) return;
  element.hidden = !visible;
}

function setText(element, value) {
  if (!element) return;
  element.textContent = String(value);
}

function focus(element) {
  if (!element || typeof element.focus !== 'function') return;
  // Deferred so the element is visible before focus moves, which keeps the
  // focus ring from being painted on a hidden node.
  requestAnimationFrame(() => {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  });
}
