import { defineConfig } from 'vitest/config';

/**
 * Separate from `vite.config.ts` on purpose: that config loads the Cloudflare
 * and Sites plugins, which build a Worker bundle. Tests here run in plain Node
 * and must not depend on the deploy target being configurable.
 */
export default defineConfig({
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], environment: 'node' },
});
