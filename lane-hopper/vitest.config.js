import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The simulation layer is pure JavaScript, so the fast Node environment is
    // enough. No WebGL or DOM is required for the unit suite.
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**', 'vendor/**', 'node_modules/**'],
    reporters: 'default',
    globals: false
  },
  // Vitest is the only tool that reads this file. The game itself is served as
  // plain static files and never passes through a bundler.
  server: { watch: { ignored: ['**/vendor/**'] } }
});
