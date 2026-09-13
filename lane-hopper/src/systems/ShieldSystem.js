import { GAMEPLAY, ShieldRejections, isShieldedCause } from '../config/gameplay.js';

/**
 * Shield charge and timer state.
 *
 * Three states rather than loose booleans, for the same reason the game itself
 * uses an explicit state machine: `active` and `coolingDown` flags can otherwise
 * contradict each other.
 */
export const ShieldStates = Object.freeze({
  /** No shield up and nothing blocking a fresh activation. */
  READY: 'ready',
  ACTIVE: 'active',
  COOLDOWN: 'cooldown'
});

/** Timer transitions reported by `update()`, so the caller can raise events. */
export const ShieldTransitions = Object.freeze({
  /** The active window ended and the cooldown began. */
  EXPIRED: 'expired',
  /** The cooldown ended, so a held charge can be spent again. */
  RECHARGED: 'recharged'
});

/**
 * The player's shield: collected charges plus the active and cooldown timers.
 *
 * Purely logical and run-scoped. It holds no world state, so it can be reset
 * outright whenever a run starts or ends.
 *
 * The rules it enforces:
 *   - charges never exceed `maxCharges`, so tokens cannot be stockpiled;
 *   - a charge can only be spent from READY, so activation is impossible with no
 *     charge, while a shield is already up, or during the cooldown;
 *   - the cooldown starts when the active window ends, not when it began, so the
 *     shield is genuinely unavailable for `cooldown` seconds afterwards;
 *   - only vehicle and train deaths are deflected.
 */
export class ShieldSystem {
  /** @param {typeof GAMEPLAY} [config] */
  constructor(config = GAMEPLAY) {
    this.config = config.shield;
    this.reset();
  }

  /**
   * Clears every piece of shield state.
   *
   * Used when a run starts, when the player dies and when a run is abandoned, so
   * charges and an in-flight shield can never survive into another run.
   */
  reset() {
    this.charges = 0;
    this.state = ShieldStates.READY;
    this.activeRemaining = 0;
    this.cooldownRemaining = 0;
    /** Hazards already deflected by the current activation, by entity id. */
    this._deflected = new Set();
  }

  get maxCharges() {
    return this.config.maxCharges;
  }

  get isActive() {
    return this.state === ShieldStates.ACTIVE;
  }

  get isCoolingDown() {
    return this.state === ShieldStates.COOLDOWN;
  }

  /** True when there is room for another charge, i.e. a token is worth spawning. */
  get canCollect() {
    return this.charges < this.config.maxCharges;
  }

  /**
   * Adds one charge, up to the cap.
   * @returns {boolean} whether the charge was accepted
   */
  addCharge() {
    if (!this.canCollect) return false;
    this.charges += 1;
    return true;
  }

  /** True when `activate()` would succeed right now. */
  canActivate() {
    return this.charges > 0 && this.state === ShieldStates.READY;
  }

  /**
   * Spends one charge and raises the shield.
   *
   * Mirrors `attemptMove`: the reason a request was refused is reported rather
   * than swallowed, so audio and tests can tell the three cases apart.
   *
   * @returns {{accepted: boolean, reason?: string}}
   */
  activate() {
    if (this.state === ShieldStates.ACTIVE) {
      return { accepted: false, reason: ShieldRejections.ALREADY_ACTIVE };
    }
    if (this.state === ShieldStates.COOLDOWN) {
      return { accepted: false, reason: ShieldRejections.COOLING_DOWN };
    }
    if (this.charges <= 0) {
      return { accepted: false, reason: ShieldRejections.NO_CHARGE };
    }

    this.charges -= 1;
    this.state = ShieldStates.ACTIVE;
    this.activeRemaining = this.config.duration;
    this.cooldownRemaining = 0;
    this._deflected.clear();
    return { accepted: true };
  }

  /**
   * Advances the active and cooldown timers by one fixed step.
   *
   * @param {number} dt seconds
   * @returns {string|null} a ShieldTransitions value when a timer ran out
   */
  update(dt) {
    if (this.state === ShieldStates.ACTIVE) {
      this.activeRemaining -= dt;
      if (this.activeRemaining > 0) return null;
      // Roll straight into the cooldown; the leftover fraction of the step is
      // dropped rather than carried, which keeps the two windows independent.
      this.activeRemaining = 0;
      this.state = ShieldStates.COOLDOWN;
      this.cooldownRemaining = this.config.cooldown;
      this._deflected.clear();
      return ShieldTransitions.EXPIRED;
    }

    if (this.state === ShieldStates.COOLDOWN) {
      this.cooldownRemaining -= dt;
      if (this.cooldownRemaining > 0) return null;
      this.cooldownRemaining = 0;
      this.state = ShieldStates.READY;
      return ShieldTransitions.RECHARGED;
    }

    return null;
  }

  /** True when an active shield prevents a death from `cause`. */
  protects(cause) {
    return this.isActive && isShieldedCause(cause);
  }

  /**
   * Records a deflected hazard.
   *
   * Collisions persist for many fixed steps while a vehicle passes over the
   * player, so the same hazard would otherwise report a deflection on every
   * step. Remembering which entities have already been deflected during this
   * activation keeps the resulting event, and its sound, to one per hazard.
   *
   * @param {{id?: string}} [entity]
   * @returns {boolean} true the first time this entity is deflected
   */
  noteDeflection(entity) {
    const id = entity && entity.id !== undefined ? entity.id : null;
    if (id === null) return true;
    if (this._deflected.has(id)) return false;
    this._deflected.add(id);
    return true;
  }

  /** Read-only view for the HUD, the debug panel and the browser smoke test. */
  status() {
    return {
      charges: this.charges,
      maxCharges: this.config.maxCharges,
      state: this.state,
      activeRemaining: this.activeRemaining,
      cooldownRemaining: this.cooldownRemaining,
      duration: this.config.duration,
      cooldown: this.config.cooldown
    };
  }
}
