import { Game } from './core/Game.js';
import { parseSeed } from './core/SeededRandom.js';
import { isWebGLAvailable } from './rendering/Renderer.js';
import { UIController } from './ui/UIController.js';

/**
 * Entry point.
 *
 * Reads optional URL parameters, constructs the game, and reports a readable
 * message if the browser cannot provide WebGL.
 *
 * The stylesheet is linked from index.html rather than imported here, because
 * importing CSS from JavaScript is a bundler feature and this game ships as
 * plain ES modules with no build step.
 *
 * Supported parameters:
 *   ?seed=12345   run a specific deterministic world
 *   ?debug=1      show the diagnostics panel
 *   ?e2e=1        expose the automation hook used by the browser smoke test
 *
 * Both diagnostic flags are opt-in, so a normal page load never exposes them.
 */

const params = new URLSearchParams(window.location.search);

// A malformed seed is ignored rather than treated as an error.
const seedOverride = parseSeed(params.get('seed'));
const debugRequested = params.get('debug') === '1';
const testHooksRequested = params.get('e2e') === '1';

const reducedMotion = Boolean(
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

function boot() {
  const container = document.getElementById('scene');
  if (!container) throw new Error('Missing #scene container element.');

  if (!isWebGLAvailable()) {
    reportFatal(
      'This browser could not create a WebGL context, which Lane Hopper needs in order to draw the world.'
    );
    return;
  }

  let game;
  try {
    game = new Game({ container, seedOverride, debug: debugRequested, reducedMotion });
  } catch (error) {
    console.error('Lane Hopper failed to start.', error);
    reportFatal(
      'Something went wrong while starting the 3D scene. Your browser or graphics driver may not support the features the game needs.'
    );
    return;
  }

  game.start();

  // Audio must not begin before a user gesture; a pointer press counts as one.
  const unlockAudio = () => game.audio.unlock();
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  if (testHooksRequested) {
    installTestHooks(game);
  }
}

/** Renders the fatal-error overlay without needing a working renderer. */
function reportFatal(message) {
  try {
    new UIController(document).showFatalError(message);
  } catch {
    // Last resort if the overlay markup is missing.
    document.body.textContent = message;
  }
}

/**
 * Controlled automation surface for the browser smoke test.
 *
 * Only installed for dev builds or when `?e2e=1` is present, so it is absent
 * from a normal production page load.
 */
function installTestHooks(game) {
  window.__LANE_HOPPER__ = {
    /** Read-only view of authoritative simulation state. */
    snapshot: () => game.simulation.snapshot(),
    /** Ends the current run with an explicit cause, for a controlled game over. */
    kill: (cause = 'vehicle') => game.simulation.forceDeath(cause),
    /**
     * Grants one shield charge, so the HUD and the power-up can be exercised
     * without first playing far enough for a token to appear.
     */
    grantShield: () => game.simulation.shield.addCharge()
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
