import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' }
  },
  resolve: {
    alias: {
      '@device-monitoring/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))
    }
  }
});
