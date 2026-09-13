import { GAMEPLAY } from '../config/gameplay.js';
import { Player, PlayerStates } from '../entities/Player.js';
import { findShieldPickup, resolveHazards } from '../systems/CollisionSystem.js';
import { applyPlatformCarry, attemptMove } from '../systems/MovementSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { ShieldSpawner } from '../systems/ShieldSpawner.js';
import { ShieldSystem, ShieldTransitions } from '../systems/ShieldSystem.js';
import { World } from '../world/World.js';
import { createRunSeed } from './SeededRandom.js';
import { GameStateMachine, GameStates } from './GameState.js';

/**
 * The headless game simulation.
 *
 * Owns every piece of authoritative gameplay state - the state machine, the lane
 * world, the player, the score and the shield - and nothing else. It imports no
 * rendering, DOM or audio code, which keeps the separation of concerns clean and
 * makes the whole simulation unit testable without WebGL.
 *
 * `Game` drives this class and mirrors its state into meshes, HUD and audio.
 */
export class Simulation {
  /**
   * @param {object} [options]
   * @param {import('../systems/StorageSystem.js').StorageSystem} [options.storage]
   * @param {number|string|null} [options.seedOverride]
   *        fixed seed for every run, used by ?seed= and by tests
   */
  constructor({ storage = null, seedOverride = null } = {}) {
    this.seedOverride = seedOverride;
    this.state = new GameStateMachine(GameStates.BOOT);
    this.score = new ScoreSystem(storage);
    this.player = new Player(GAMEPLAY);
    this.player.deactivate();

    this.seed = seedOverride ?? createRunSeed();
    this.world = new World({ seed: this.seed });

    /** The player's shield charges and timers. */
    this.shield = new ShieldSystem();
    /** Places the collectible shield tokens. */
    this.shieldSpawner = new ShieldSpawner({ seed: this.seed });

    /** Gameplay events drained each frame by the presentation layer. */
    this.events = [];
    /** Pending movement intents, capped at GAMEPLAY.maxInputQueue. */
    this._moveQueue = [];
    /** Hazards a shield deflected this step; reused so no array is allocated. */
    this._deflected = [];
    /** Set for one frame after a lane set change, so the view can resync. */
    this.worldDirty = true;
  }

  // --------------------------------------------------------------- lifecycle

  /** BOOT -> MENU. */
  bootToMenu() {
    if (this.state.current !== GameStates.BOOT) return false;
    this.player.deactivate();
    return this.state.transition(GameStates.MENU);
  }

  /**
   * Starts a fresh run from MENU, GAME_OVER or PAUSED.
   * Every run-specific system is reset; the best score is preserved.
   */
  startRun() {
    if (!this.state.canTransition(GameStates.PLAYING)) return false;

    this.seed = this.seedOverride ?? createRunSeed();
    this.world.reset(this.seed);
    this.player.reset({ laneIndex: 0, column: 0 });
    this.score.reset(0);
    // Charges, timers and token spacing are all run-scoped, so a fresh run always
    // starts with an empty shield regardless of how the previous one ended.
    this.shield.reset();
    this.shieldSpawner.reset(this.seed);
    this._moveQueue.length = 0;
    this.events.length = 0;
    this.worldDirty = true;

    return this.state.transition(GameStates.PLAYING);
  }

  /** PLAYING -> PAUSED. */
  pause() {
    return this.state.transition(GameStates.PAUSED);
  }

  /** PAUSED -> PLAYING. Queued inputs are dropped so nothing fires on resume. */
  resume() {
    if (this.state.current !== GameStates.PAUSED) return false;
    this._moveQueue.length = 0;
    return this.state.transition(GameStates.PLAYING);
  }

  /** Returns to the title screen from PAUSED or GAME_OVER. */
  returnToMenu() {
    if (!this.state.canTransition(GameStates.MENU)) return false;
    this._moveQueue.length = 0;
    this.player.deactivate();
    // Abandoning a run ends it, so the shield goes with it.
    this.shield.reset();
    this.world.clearShieldToken();
    return this.state.transition(GameStates.MENU);
  }

  // ------------------------------------------------------------------- input

  /**
   * Queues a movement intent. At most `GAMEPLAY.maxInputQueue` are buffered so
   * rapid input feels responsive without letting the player run away from
   * themselves.
   * @returns {boolean} whether the intent was buffered
   */
  queueMove(direction) {
    if (this.state.current !== GameStates.PLAYING) return false;
    if (this._moveQueue.length >= GAMEPLAY.maxInputQueue) return false;
    this._moveQueue.push(direction);
    return true;
  }

  clearQueuedMoves() {
    this._moveQueue.length = 0;
  }

  get queuedMoveCount() {
    return this._moveQueue.length;
  }

  /**
   * Spends one shield charge.
   *
   * Applied immediately rather than queued: unlike a hop it occupies no tile and
   * cannot conflict with the movement already in flight, so delaying it by a
   * frame would only make it feel unresponsive.
   *
   * Outside PLAYING the request is refused silently, matching `queueMove`, so
   * pressing the key on the title screen or after a death does nothing at all.
   *
   * @returns {boolean} whether a charge was spent
   */
  activateShield() {
    if (this.state.current !== GameStates.PLAYING) return false;

    const result = this.shield.activate();
    if (!result.accepted) {
      this.events.push({ type: 'shieldRejected', reason: result.reason });
      return false;
    }

    this.events.push({
      type: 'shieldActivated',
      charges: this.shield.charges,
      duration: this.shield.activeRemaining
    });
    return true;
  }

  // ------------------------------------------------------------------ update

  /**
   * Advances the simulation by one fixed step.
   *
   * Follows the specified update order exactly:
   *   1. read and queue input          2. advance player movement
   *   3. update vehicles/platforms/trains
   *   4. apply platform carry          5. world wrapping
   *   6. recalculate collision volumes 7. resolve lethal collisions
   *   8. resolve water support         9. update score and generation
   *
   * Steps 6-8 live inside `resolveHazards`, which rebuilds the player's box from
   * the interpolated position before testing anything.
   *
   * The shield slots into that order without disturbing it. Its timers advance
   * with the player, before hazards are resolved, so a shield whose last moment
   * runs out on this step cannot also deflect this step's hazard. Token pickup
   * and spawning happen after the score, alongside the generation window, since
   * both depend on how far the player has now reached.
   *
   * @param {number} dt seconds
   */
  update(dt) {
    const state = this.state.current;

    if (state === GameStates.DYING) {
      this.player.update(dt);
      if (this.player.deathProgress >= 1) {
        this.state.transition(GameStates.GAME_OVER);
        this.events.push({ type: 'gameOver', cause: this.player.deathCause });
      }
      return;
    }

    // PAUSED, MENU, GAME_OVER and BOOT freeze movement, hazards, timers and score.
    if (state !== GameStates.PLAYING) return;

    // 1. Consume at most one queued movement per frame.
    this._consumeMove();

    // 2. Advance the hop animation, then the shield's own timers.
    this.player.update(dt);
    this._updateShieldTimers(dt);

    // 3. Move vehicles, platforms and train schedules.
    this.world.update(dt, this.events);

    // 4. Carry the player with the log beneath them.
    applyPlatformCarry(this.player, this.world);

    // 5. Recycle wrapped entities, now that carry has been resolved.
    this.world.wrapEntities();

    // 6-8. Rebuild collision volumes and resolve every lethal hazard. An active
    // shield makes traffic and trains survivable; nothing else.
    this._deflected.length = 0;
    const hazard = resolveHazards({
      player: this.player,
      world: this.world,
      maxLaneReached: this.score.maxLaneReached,
      score: this.score.score,
      isProtected: (cause) => this.shield.protects(cause),
      deflected: this._deflected
    });
    this._reportDeflections();

    if (hazard) {
      this._kill(hazard.cause);
      // Terminal state reached: no further score or generation this frame.
      return;
    }

    // 9. Score, then the shield token, then extend and trim the generation window.
    this._updateScore();
    this._updateShieldToken();
    this._updateWindow();
  }

  _consumeMove() {
    if (this._moveQueue.length === 0) return;
    if (!this.player.canAcceptMove()) return;

    const direction = this._moveQueue.shift();
    const result = attemptMove(this.player, this.world, direction);
    this.events.push({
      type: result.accepted ? 'move' : 'moveRejected',
      direction: direction.name,
      reason: result.reason ?? null
    });
  }

  /** Advances the active and cooldown windows, announcing either running out. */
  _updateShieldTimers(dt) {
    const transition = this.shield.update(dt);
    if (transition === ShieldTransitions.EXPIRED) {
      this.events.push({ type: 'shieldExpired', cooldown: this.shield.cooldownRemaining });
    } else if (transition === ShieldTransitions.RECHARGED) {
      this.events.push({ type: 'shieldReady', charges: this.shield.charges });
    }
  }

  /**
   * Announces hazards the shield absorbed.
   *
   * A vehicle overlaps the player for many fixed steps, so only the first step
   * that meets a given hazard reports it. Without that the event, and the sound
   * the presentation layer plays for it, would repeat every step of the overlap.
   */
  _reportDeflections() {
    for (const hazard of this._deflected) {
      if (!this.shield.noteDeflection(hazard.entity)) continue;
      this.events.push({ type: 'shieldDeflect', cause: hazard.cause });
    }
  }

  /** Collects a token the player is standing on, then offers the next one. */
  _updateShieldToken() {
    if (findShieldPickup(this.player.box(), this.world.shieldToken)) {
      this.world.clearShieldToken();
      if (this.shield.addCharge()) {
        this.events.push({ type: 'shieldCollected', charges: this.shield.charges });
      }
    }

    const token = this.shieldSpawner.update({
      world: this.world,
      score: this.score.score,
      maxLaneReached: this.score.maxLaneReached,
      canCollect: this.shield.canCollect
    });
    if (token) {
      this.events.push({
        type: 'shieldSpawned',
        laneIndex: token.laneIndex,
        column: token.column
      });
    }
  }

  _updateScore() {
    const { changed, milestone } = this.score.update(this.player.laneIndex);
    if (changed) {
      this.events.push({ type: 'score', score: this.score.score, best: this.score.best });
    }
    if (milestone !== null) {
      this.events.push({ type: 'milestone', score: milestone });
    }
  }

  /** Extends generation ahead and discards lanes far behind. */
  _updateWindow() {
    const appended = this.world.ensureAhead(this.score.maxLaneReached);

    // Never discard the lane the player occupies, nor the one they are hopping
    // out of, regardless of how far behind the camera they are.
    const occupied = Math.min(
      this.player.laneIndex,
      this.player.move.active ? this.player.move.fromLane : this.player.laneIndex
    );
    const keepFrom = Math.min(occupied, this.score.maxLaneReached - GAMEPLAY.lanesBehind);
    const removed = this.world.recycleBelow(keepFrom);

    if (appended > 0 || removed.length > 0) this.worldDirty = true;
  }

  _kill(cause) {
    if (!this.state.transition(GameStates.DYING)) return;
    this.player.die(cause);
    this.score.commit();
    this._moveQueue.length = 0;
    // The run is over, so the shield comes down with the player and any
    // uncollected token leaves the world. Nothing carries into the next run.
    this.shield.reset();
    this.world.clearShieldToken();
    this.events.push({
      type: 'death',
      cause,
      score: this.score.score,
      best: this.score.best,
      record: this.score.isNewRecord
    });
  }

  /** Forces a death. Used by the death-cause effects tests and the e2e hook. */
  forceDeath(cause) {
    if (this.state.current !== GameStates.PLAYING) return false;
    this._kill(cause);
    return true;
  }

  // --------------------------------------------------------------- accessors

  /** Removes and returns every pending event. */
  drainEvents() {
    if (this.events.length === 0) return [];
    const drained = this.events.slice();
    this.events.length = 0;
    return drained;
  }

  /** Read-only snapshot for the debug panel and the browser smoke test. */
  snapshot() {
    return {
      state: this.state.current,
      seed: this.seed,
      score: this.score.score,
      best: this.score.best,
      maxLaneReached: this.score.maxLaneReached,
      playerLane: this.player.laneIndex,
      playerColumn: this.player.column,
      playerX: Number(this.player.x.toFixed(3)),
      playerState: this.player.state,
      riding: this.player.support !== null,
      deathCause: this.player.deathCause,
      laneCount: this.world.laneCount,
      entityCount: this.world.entityCount,
      laneRange: [this.world.minIndex, this.world.maxIndex],
      queuedMoves: this._moveQueue.length,
      shieldCharges: this.shield.charges,
      shieldState: this.shield.state,
      shieldActiveRemaining: Number(this.shield.activeRemaining.toFixed(3)),
      shieldCooldownRemaining: Number(this.shield.cooldownRemaining.toFixed(3)),
      shieldTokenLane: this.world.shieldToken ? this.world.shieldToken.laneIndex : null,
      shieldTokenColumn: this.world.shieldToken ? this.world.shieldToken.column : null
    };
  }

  get isDying() {
    return this.state.current === GameStates.DYING;
  }

  get isPlayerActive() {
    return this.player.state !== PlayerStates.INACTIVE;
  }
}
