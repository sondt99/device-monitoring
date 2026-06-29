import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
  resolve: {
    alias: {
      '@device-monitoring/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))
    }
  }
});
