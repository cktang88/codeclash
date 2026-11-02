/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Anchored patterns: a bare '/api' prefix would also swallow the client module '/api.ts'.
const PROXY = {
  '^/api/': 'http://localhost:8787',
  '^/auth/': 'http://localhost:8787',
  '^/hooks/': 'http://localhost:8787',
};

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: { port: 5173, proxy: PROXY },
  preview: { proxy: PROXY },
  test: { root: '.', include: ['src/**/*.test.ts'] },
});
