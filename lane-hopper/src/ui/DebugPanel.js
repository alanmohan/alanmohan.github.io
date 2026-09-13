import { getDifficulty } from '../world/difficulty.js';

/**
 * Development-only diagnostics overlay.
 *
 * Disabled by default in production; enabled by a dev build or `?debug=1`.
 * Text is rebuilt at a low rate so it never competes with the frame budget.
 */
export class DebugPanel {
  /** @param {HTMLElement|null} element */
  constructor(element) {
    this.element = element;
    this.enabled = false;
    this._elapsed = 0;
    this._interval = 0.2;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.element) this.element.hidden = !enabled;
  }

  /**
   * @param {number} dt seconds
   * @param {object} data snapshot plus renderer statistics
   */
  update(dt, data) {
    if (!this.enabled || !this.element) return;
    this._elapsed += dt;
    if (this._elapsed < this._interval) return;
    this._elapsed = 0;

    const band = getDifficulty(data.maxLaneReached);
    const lines = [
      `fps            ${data.fps}`,
      `state          ${data.state}`,
      `seed           ${data.seed}`,
      `score / best   ${data.score} / ${data.best}`,
      `player lane    ${data.playerLane}`,
      `player column  ${data.playerColumn}  (x ${data.playerX})`,
      `player state   ${data.playerState}${data.riding ? ' (riding)' : ''}`,
      `lanes active   ${data.laneCount}  [${data.laneRange[0]} .. ${data.laneRange[1]}]`,
      `entities       ${data.entityCount}`,
      `difficulty     ${band.id}`,
      `draw calls     ${data.drawCalls}`,
      `queued moves   ${data.queuedMoves}`,
      `shield         ${data.shieldCharges}x ${data.shieldState} ` +
        `(${data.shieldActiveRemaining}s / cd ${data.shieldCooldownRemaining}s)`,
      `shield token   ${formatToken(data)}`
    ];
    this.element.textContent = lines.join('\n');
  }
}

/** Lane and column of the uncollected shield token, if there is one. */
function formatToken({ shieldTokenLane, shieldTokenColumn }) {
  if (shieldTokenLane === null || shieldTokenLane === undefined) return 'none';
  return `lane ${shieldTokenLane}, column ${shieldTokenColumn}`;
}
