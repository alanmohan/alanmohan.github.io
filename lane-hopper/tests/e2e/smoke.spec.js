import { expect, test } from '@playwright/test';

/**
 * Browser smoke test.
 *
 * Runs against the production build served by `vite preview`, so it verifies the
 * built artefact rather than only the dev server. `?e2e=1` opts into the
 * automation hook, and a fixed seed keeps the run reproducible.
 *
 * Covers the full lifecycle: title screen, start, HUD, movement, pause, resume,
 * a controlled game over, and restart.
 */

const GAME_URL = '/index.html?e2e=1&seed=20260101';

/** Reads the authoritative simulation snapshot. */
async function snapshot(page) {
  return page.evaluate(() => window.__LANE_HOPPER__.snapshot());
}

/** Collects console errors and uncaught exceptions for the whole test. */
function watchForErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  return errors;
}

test.describe('Lane Hopper', () => {
  test('plays through a full run lifecycle', async ({ page }) => {
    const errors = watchForErrors(page);

    // 1. Open the game.
    await page.goto(GAME_URL);

    // 2. Confirm the title screen is visible.
    const title = page.locator('#title-screen');
    await expect(title).toBeVisible();
    await expect(page.getByRole('heading', { name: /lane\s*hopper/i })).toBeVisible();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('#scene canvas')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).state).toBe('MENU');

    // 3. Start a run.
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');
    await expect(title).toBeHidden();

    // 4. Confirm the HUD appears.
    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();
    await expect(page.locator('#hud-score')).toHaveText('0');
    await expect(page.locator('#hud-best')).toBeVisible();

    // 5 & 6. Send a movement key and confirm the player state changes.
    const before = await snapshot(page);
    expect(before.playerLane).toBe(0);

    await page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => (await snapshot(page)).playerLane, { timeout: 5000 })
      .toBe(1);
    await expect(page.locator('#hud-score')).toHaveText('1');

    // Sideways movement changes the column without changing the score.
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await snapshot(page)).playerColumn).toBe(1);
    await expect(page.locator('#hud-score')).toHaveText('1');

    // WASD must work as well as the arrow keys.
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyA');
    await expect.poll(async () => (await snapshot(page)).playerColumn).toBe(0);

    // 7. Pause and resume.
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PAUSED');

    // The world must be frozen while paused.
    const pausedA = await snapshot(page);
    await page.waitForTimeout(600);
    const pausedB = await snapshot(page);
    expect(pausedB.playerLane).toBe(pausedA.playerLane);
    expect(pausedB.playerX).toBe(pausedA.playerX);
    expect(pausedB.score).toBe(pausedA.score);

    await page.locator('#btn-resume').click();
    await expect(page.locator('#pause-overlay')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');

    // 8. Trigger a controlled game over.
    const scoreBeforeDeath = (await snapshot(page)).score;
    await page.evaluate(() => window.__LANE_HOPPER__.kill('vehicle'));

    const gameOver = page.locator('#gameover-overlay');
    await expect(gameOver).toBeVisible({ timeout: 5000 });
    await expect.poll(async () => (await snapshot(page)).state).toBe('GAME_OVER');
    await expect(page.locator('#gameover-score')).toHaveText(String(scoreBeforeDeath));
    await expect(page.locator('#gameover-cause')).toContainText(/traffic/i);

    // Movement must not be accepted after the run ends.
    const dead = await snapshot(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    const stillDead = await snapshot(page);
    expect(stillDead.playerLane).toBe(dead.playerLane);
    expect(stillDead.score).toBe(dead.score);

    // 9. Restart successfully.
    await page.locator('#btn-restart').click();
    await expect(gameOver).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');

    const restarted = await snapshot(page);
    expect(restarted.playerLane).toBe(0);
    expect(restarted.playerColumn).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.deathCause).toBeNull();
    await expect(page.locator('#hud-score')).toHaveText('0');

    // The restarted run is immediately playable.
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await snapshot(page)).playerLane).toBe(1);

    expect(errors, `browser reported errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('honours a seed from the URL and reproduces the same world', async ({ page }) => {
    const startSeededRun = async (query) => {
      await page.goto(`/index.html?e2e=1&${query}`);
      await page.locator('#btn-start').click();
      await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');
      return snapshot(page);
    };

    const first = await startSeededRun('seed=777');
    expect(first.seed).toBe(777);

    const second = await startSeededRun('seed=777');
    expect(second.seed).toBe(777);
    expect(second.laneCount).toBe(first.laneCount);
    expect(second.entityCount).toBe(first.entityCount);
    expect(second.laneRange).toEqual(first.laneRange);

    // A malformed seed is ignored rather than breaking the page.
    const malformed = await startSeededRun('seed=not%20a%20seed');
    expect(malformed.state).toBe('PLAYING');
    expect(malformed.seed).not.toBe('not a seed');
  });

  test('persists the best score and the mute preference across a reload', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(GAME_URL);

    // Mute, then confirm the label reflects it.
    await page.keyboard.press('KeyM');
    await expect(page.locator('#title-mute-state')).toHaveText('off');

    // Score a few lanes, then end the run so the best score is committed.
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');

    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(220);
    }
    const reached = (await snapshot(page)).score;
    expect(reached).toBeGreaterThan(0);

    await page.evaluate(() => window.__LANE_HOPPER__.kill('train'));
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    await expect(page.locator('#gameover-best')).toHaveText(String(reached));

    await page.reload();
    await expect(page.locator('#title-screen')).toBeVisible();
    await expect(page.locator('#title-best')).toHaveText(String(reached));
    await expect(page.locator('#title-mute-state')).toHaveText('off');

    expect(errors, `browser reported errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('adapts to a resized window without page scrolling', async ({ page }) => {
    await page.goto(GAME_URL);
    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');

    for (const viewport of [
      { width: 800, height: 600 },
      { width: 1600, height: 900 },
      { width: 1024, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);

      const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('#scene canvas');
        const rect = canvas.getBoundingClientRect();
        return {
          canvasWidth: Math.round(rect.width),
          canvasHeight: Math.round(rect.height),
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight
        };
      });

      // The canvas fills the viewport and introduces no scrollbars.
      expect(metrics.canvasWidth).toBe(viewport.width);
      expect(metrics.canvasHeight).toBe(viewport.height);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);

      // Still playable at this size.
      await expect(page.locator('#hud')).toBeVisible();
      expect((await snapshot(page)).state).toBe('PLAYING');
    }
  });

  test('shows the shield in the HUD and spends a charge on F', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(GAME_URL);

    // The controls legend advertises the key.
    await expect(page.locator('#title-screen')).toContainText(/shield/i);

    await page.locator('#btn-start').click();
    await expect.poll(async () => (await snapshot(page)).state).toBe('PLAYING');

    const status = page.locator('#hud-shield-status');
    const charges = page.locator('#hud-shield-charges');
    await expect(page.locator('#hud-shield')).toBeVisible();
    await expect(status).toHaveText('None held');
    await expect(charges).toHaveAttribute('aria-label', 'No shield charges');

    // Pressing F with nothing held must not raise a shield.
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await snapshot(page)).shieldState).toBe('ready');
    await expect(status).toHaveText('None held');

    // With a charge, the HUD says so and the pips fill in.
    await page.evaluate(() => window.__LANE_HOPPER__.grantShield());
    await expect(status).toHaveText('Ready');
    await expect(charges).toHaveAttribute('aria-label', '1 of 2 shield charges');

    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await snapshot(page)).shieldState).toBe('active');
    await expect(status).toContainText(/^Up \d+\.\d+s$/);
    await expect(charges).toHaveAttribute('aria-label', 'No shield charges');
    // The countdown meter only appears while a window is running.
    await expect(page.locator('#hud-shield-meter')).toBeVisible();

    // The shield expires on its own and hands over to the cooldown.
    await expect
      .poll(async () => (await snapshot(page)).shieldState, { timeout: 8000 })
      .toBe('cooldown');
    await expect(status).toContainText(/^Recharging \d+\.\d+s$/);

    // A charge cannot be spent during the cooldown.
    await page.evaluate(() => window.__LANE_HOPPER__.grantShield());
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);
    const cooling = await snapshot(page);
    expect(cooling.shieldState).toBe('cooldown');
    expect(cooling.shieldCharges).toBe(1);

    // Ending the run clears the shield entirely.
    await page.evaluate(() => window.__LANE_HOPPER__.kill('vehicle'));
    await expect(page.locator('#gameover-overlay')).toBeVisible();
    const dead = await snapshot(page);
    expect(dead.shieldCharges).toBe(0);
    expect(dead.shieldState).toBe('ready');

    expect(errors, `browser reported errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('hides the automation hook and debug panel on a normal page load', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#title-screen')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__LANE_HOPPER__)).toBe('undefined');
    await expect(page.locator('#debug-panel')).toBeHidden();
  });
});
