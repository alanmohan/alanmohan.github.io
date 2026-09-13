import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * The smoke test runs the game exactly as a static host serves it: the real
 * files, over the dependency-free static server in tools/serve.mjs. There is no
 * build step, so what is tested is what ships.
 *
 * Test hooks are opted into with the `?e2e=1` query flag.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'off'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node tools/serve.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
