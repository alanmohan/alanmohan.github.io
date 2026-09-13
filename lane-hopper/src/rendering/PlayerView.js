import { DeathCauses, GAMEPLAY } from '../config/gameplay.js';
import { PlayerStates } from '../entities/Player.js';
import { clamp, damp, lerp } from '../utils/math.js';

/**
 * Renders the player character from the logical player state.
 *
 * Reads only; the simulation owns the authoritative position. Squash, stretch
 * and the death animations live here so gameplay logic stays free of
 * presentation concerns.
 */
export class PlayerView {
  /**
   * @param {import('three').Object3D} parent
   * @param {import('./MeshFactory.js').MeshFactory} meshFactory
   * @param {{reducedMotion?: boolean}} [options]
   */
  constructor(parent, meshFactory, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.group = meshFactory.createPlayer();
    this.group.name = 'player';
    parent.add(this.group);
    this._facing = 0;

    // The aura is a child of the character, so it follows every position and
    // rotation for free and is hidden along with Pip between runs.
    this.aura = meshFactory.createShieldAura();
    this.aura.name = 'shieldAura';
    this.aura.visible = false;
    this.group.add(this.aura);
    this._shieldActive = false;
    this._auraElapsed = 0;
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
  }

  /**
   * Shows or hides the shield bubble.
   *
   * Takes a plain flag rather than the shield system itself, so the view stays
   * unaware of gameplay rules.
   * @param {boolean} active
   */
  setShieldActive(active) {
    const next = Boolean(active);
    if (next && !this._shieldActive) this._auraElapsed = 0;
    this._shieldActive = next;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  /** Snaps orientation and scale, used when a run starts. */
  reset(player) {
    this._facing = player.facing;
    this.group.rotation.set(0, player.facing, 0);
    this.group.scale.set(1, 1, 1);
    this.setShieldActive(false);
    this.aura.visible = false;
    this.aura.scale.setScalar(1);
  }

  /**
   * @param {import('../entities/Player.js').Player} player
   * @param {number} dt seconds
   */
  sync(player, dt) {
    if (player.state === PlayerStates.INACTIVE) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    this.group.position.set(player.x, player.y, player.z);

    if (player.state === PlayerStates.DEAD) {
      // A death always clears the shield, so the bubble never survives one.
      this.aura.visible = false;
      this._applyDeath(player);
      return;
    }

    this._applyFacing(player, dt);
    this._applyHop(player);
    this._applyShield(dt);
  }

  /** Pulses the bubble gently while the shield is up. */
  _applyShield(dt) {
    this.aura.visible = this._shieldActive;
    if (!this._shieldActive) return;

    if (this.reducedMotion) {
      this.aura.scale.setScalar(1);
      return;
    }
    this._auraElapsed += dt;
    // Counter-rotates the character's turn so the facets do not appear welded
    // to Pip, and breathes slightly so an active shield is obvious at a glance.
    this.aura.rotation.y = -this._facing + this._auraElapsed * 0.9;
    this.aura.scale.setScalar(1 + Math.sin(this._auraElapsed * 5.5) * 0.05);
  }

  _applyFacing(player, dt) {
    // Turn along the shortest arc so a left-to-right flip does not spin around.
    let delta = player.facing - this._facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    if (this.reducedMotion) {
      this._facing = player.facing;
    } else {
      this._facing = damp(this._facing, this._facing + delta, GAMEPLAY.player.turnSpeed, dt);
    }
    this.group.rotation.y = this._facing;
  }

  _applyHop(player) {
    if (this.reducedMotion || !player.move.active) {
      this.group.scale.set(1, 1, 1);
      return;
    }
    // Stretch upward through the middle of the hop, easing back on landing.
    const t = player.moveProgress;
    const stretch = Math.sin(Math.PI * t);
    this.group.scale.set(1 - stretch * 0.1, 1 + stretch * 0.2, 1 - stretch * 0.1);
  }

  /** Stylised, non-graphic death effects, chosen by cause. */
  _applyDeath(player) {
    const t = player.deathProgress;

    switch (player.deathCause) {
      case DeathCauses.VEHICLE:
      case DeathCauses.TRAIN: {
        // Flattened: collapse vertically and spread sideways.
        const squash = clamp(t * 3, 0, 1);
        this.group.scale.set(
          lerp(1, 1.45, squash),
          lerp(1, 0.12, squash),
          lerp(1, 1.35, squash)
        );
        this.group.position.y = 0;
        break;
      }

      case DeathCauses.WATER: {
        // Sinks below the surface with a slow spin.
        const sink = clamp(t * 1.6, 0, 1);
        this.group.position.y = lerp(0, -0.9, sink);
        this.group.scale.setScalar(lerp(1, 0.7, sink));
        if (!this.reducedMotion) this.group.rotation.y = this._facing + sink * 1.6;
        break;
      }

      case DeathCauses.OUT_OF_BOUNDS:
      case DeathCauses.LEFT_BEHIND: {
        // Carried off: lifted away and shrinking out of view.
        const lift = clamp(t * 1.3, 0, 1);
        this.group.position.y = lerp(0, 1.8, lift);
        this.group.scale.setScalar(lerp(1, 0.25, lift));
        if (!this.reducedMotion) this.group.rotation.y = this._facing + lift * 3;
        break;
      }

      default: {
        this.group.scale.setScalar(lerp(1, 0.4, clamp(t * 2, 0, 1)));
        break;
      }
    }
  }
}
