/**
 * Central gameplay configuration.
 *
 * Every tunable number the simulation depends on lives here so that balance can
 * be adjusted in one place. Gameplay modules must not introduce their own
 * unexplained numeric constants.
 *
 * Units:
 *   - Distances are in tiles (1 tile === 1 world unit).
 *   - Times are in seconds.
 *   - Speeds are in tiles per second.
 */

export const GAMEPLAY = Object.freeze({
  /** One logical tile equals one Three.js world unit. */
  tileSize: 1,

  /** Playable columns run from -playableHalfWidth to +playableHalfWidth (13 columns). */
  playableHalfWidth: 6,

  /**
   * Ground meshes reach this far sideways so lanes never look like they stop.
   * Sized to just cover the widest visible world X at the far end of the
   * frustum, which keeps off-screen geometry to a minimum.
   */
  visualHalfWidth: 12,

  /** Decorative scenery is placed from playableHalfWidth + 1 up to this column. */
  sceneryOuterWidth: 12,

  /**
   * Moving entities live inside [-entityWrapSpan, +entityWrapSpan] and wrap at
   * the edges. Must stay comfortably larger than
   * playableHalfWidth + outOfBoundsMargin + half of the longest entity so that a
   * carried player always dies from leaving the play area *before* the platform
   * beneath them is recycled.
   */
  entityWrapSpan: 14,

  /** Fixed simulation step and safety limits for the main loop. */
  time: Object.freeze({
    fixedStep: 1 / 120,
    maxSubSteps: 8,
    maxDelta: 0.05
  }),

  /** Player movement feel. */
  moveDuration: 0.13,
  hopHeight: 0.35,
  maxInputQueue: 2,

  player: Object.freeze({
    /** Square collision footprint, in tiles. */
    collisionSize: 0.55,
    /** Visual body height, used by the renderer and for shadow sizing. */
    bodyHeight: 0.72,
    /** How long the death animation plays before the game-over screen appears. */
    deathDuration: 0.9,
    /** Facing turn speed in radians per second. */
    turnSpeed: 18
  }),

  /** Generation window kept alive around the player. */
  lanesAhead: 24,
  lanesBehind: 10,
  /** Upper bound on lanes appended per simulation step, to avoid frame hitches. */
  maxLanesPerStep: 6,

  /** Guaranteed-safe region around the spawn point. */
  start: Object.freeze({
    /** Safe lanes generated behind the player. */
    safeBehind: 2,
    /** Safe lanes generated ahead of the player; the first hazard sits beyond this. */
    safeAhead: 2
  }),

  /** Static blocker layout rules for grass lanes. */
  blockers: Object.freeze({
    /** Never leave fewer than this many open columns in a lane. */
    minOpenColumns: 6,
    /** Never allow a solid run of blockers longer than this. */
    maxConsecutive: 2
  }),

  /** Vehicle body dimensions per kind. */
  vehicles: Object.freeze({
    car: Object.freeze({ length: 1.6, width: 0.9, height: 0.56 }),
    truck: Object.freeze({ length: 2.6, width: 0.94, height: 0.9 })
  }),

  /**
   * Floating river platforms (logs). A log's top surface sits at y = 0 so the
   * player stands at the same height whether on grass or riding.
   */
  platforms: Object.freeze({
    /** Candidate log lengths in whole tiles. */
    lengthChoices: Object.freeze([2, 3]),
    width: 0.94,
    height: 0.44,
    /** Extra forgiveness when deciding whether the player is standing on a log. */
    supportGrace: 0.2
  }),

  river: Object.freeze({
    /**
     * Water surface height. Low enough that a useful slice of each log stands
     * clear of the water, but shallow enough that neighbouring lanes do not
     * occlude much of the channel at the camera's elevation angle.
     */
    surfaceY: -0.22,
    /** How far past the playable edge a carried player may drift before dying. */
    outOfBoundsMargin: 1
  }),

  railway: Object.freeze({
    // Ranges are [min, max] tuples, matching every other range in this file so
    // they can be read with SeededRandom.rangeOf / intOf.
    warning: Object.freeze([1.3, 2]),
    cooldown: Object.freeze([1, 3]),
    /** Length of a single train car and the coupling gap between cars. */
    carLength: 3,
    carGap: 0.24,
    width: 1,
    height: 1.15,
    /** Warning lamps toggle this many times per second. */
    blinkRate: 3.2
  }),

  /**
   * Camera pressure: falling too far behind the furthest point reached ends the
   * run, which keeps an endless runner tense. The pressure line is derived from
   * the score rather than the smoothed camera so that it stays deterministic.
   */
  cameraPressure: Object.freeze({
    enabled: true,
    /**
     * Lanes the player may sit behind their own record before being left behind.
     * Kept inside the vertical span the camera shows, so the player can always
     * see the edge they are being pushed against.
     */
    laneThreshold: 4,
    /** Disabled until the player has made this much forward progress. */
    graceScore: 6
  }),

  /**
   * Shield power-up.
   *
   * A collectible token grants one charge; a charge can be spent to survive
   * traffic and trains for a short window. Every bound here exists to keep the
   * power-up from removing the tension the rest of the game relies on: tokens
   * start well after the opening lanes, only one can ever be uncollected at a
   * time, consecutive spawns are widely spaced, and charges do not stack past
   * two. The shield deliberately covers only the two instant hazards, so
   * reading the road remains a skill and water, the play-area edge and camera
   * pressure stay lethal.
   */
  shield: Object.freeze({
    /** Tokens only begin appearing once the score has passed this value. */
    minScore: 15,
    /** Minimum lanes between one token's lane and the next token's lane. */
    laneSpacing: 12,
    /**
     * A token appears at least this many lanes beyond the furthest lane
     * reached, so one never materialises next to the player.
     */
    spawnLeadLanes: 4,
    /** Charges the player may hold at once. */
    maxCharges: 2,
    /** How long an activated shield protects the player. */
    duration: 4,
    /** Enforced wait after a shield expires before another charge can be spent. */
    cooldown: 12,
    /** Square pickup footprint of a token, in tiles. */
    tokenSize: 0.6
  }),

  /**
   * Orthographic camera framing.
   *
   * `requiredWidth` and `requiredHeight` are the world-space spans that must
   * stay visible at any aspect ratio. The frustum grows to satisfy whichever
   * constraint binds, so the 13 playable columns are always in frame and a wide
   * window shows more lanes rather than stretching the view sideways.
   */
  camera: Object.freeze({
    yawDegrees: 12,
    pitchDegrees: 46,
    /** Orthographic, so distance only affects clipping planes. */
    distance: 60,
    requiredWidth: 16,
    requiredHeight: 11,
    /** Look-at point sits this many lanes ahead, keeping the player low on screen. */
    lookAheadLanes: 2.8,
    damping: 6,
    reducedMotionDamping: 16,
    near: 0.1,
    far: 220
  }),

  /**
   * Renderer limits.
   *
   * Fog distances are measured from the orthographic camera, which sits a fixed
   * `camera.distance` away from its look-at point. A lane N steps beyond that
   * point is at depth `distance + N * cos(yaw) * cos(pitch)`, so the fog band
   * below fades roughly the last third of the visible lanes and hides the
   * generation boundary.
   */
  render: Object.freeze({
    maxPixelRatio: 2,
    shadowMapSize: 1024,
    fogNear: 64,
    fogFar: 80
  }),

  /** Score milestone interval used for the audio cue. */
  scoreMilestone: 10,

  /** Only play positional audio for lanes this close to the player. */
  audioLaneRange: 12,

  /** localStorage keys. */
  storage: Object.freeze({
    prefix: 'endless-crossing',
    bestScore: 'bestScore.v1',
    muted: 'muted.v1'
  })
});

/** Death causes, kept explicit so effects and tests can branch on them. */
export const DeathCauses = Object.freeze({
  VEHICLE: 'vehicle',
  TRAIN: 'train',
  WATER: 'water',
  OUT_OF_BOUNDS: 'out_of_bounds',
  LEFT_BEHIND: 'left_behind'
});

/**
 * Death causes an active shield deflects.
 *
 * Deliberately limited to the two instant hazards. Water, leaving the playable
 * area and falling too far behind are consequences of the player's own
 * positioning rather than of traffic timing, so the shield never covers them.
 */
export const SHIELDED_DEATH_CAUSES = Object.freeze([DeathCauses.VEHICLE, DeathCauses.TRAIN]);

/** True when an active shield would prevent a death from `cause`. */
export function isShieldedCause(cause) {
  return SHIELDED_DEATH_CAUSES.includes(cause);
}

/** Reasons a movement request can be refused. Useful for audio and tests. */
export const MoveRejections = Object.freeze({
  BUSY: 'busy',
  BLOCKED: 'blocked',
  BOUNDS: 'bounds',
  DISCARDED: 'discarded',
  NOT_PLAYING: 'not_playing'
});

/** Reasons a shield activation can be refused. Useful for audio and tests. */
export const ShieldRejections = Object.freeze({
  NO_CHARGE: 'no_charge',
  ALREADY_ACTIVE: 'already_active',
  COOLING_DOWN: 'cooling_down'
});
