/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { simVersion } from './scripts/sim-version.ts';

const PROXY = {
  '/api': 'http://localhost:8787',
  '/auth': 'http://localhost:8787',
  '/hooks': 'http://localhost:8787',
  '/ws': { target: 'ws://localhost:8787', ws: true },
};

const SIM_VERSION = simVersion();

/**
 * Builds the service worker (src/client/sw/sw.ts) into /sw.js beside the page, stamped with a
 * version that changes with every build's files, so each deploy rolls its runtime cache. Not in
 * dev: the dev server never registers it (src/client/sw/register.ts).
 */
function serviceWorker(): Plugin {
  return {
    name: 'codeclash-sw',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const h = createHash('sha256').update(SIM_VERSION);
      for (const name of Object.keys(bundle).sort()) h.update(name);
      const version = `${SIM_VERSION}-${h.digest('hex').slice(0, 8)}`;
      const out = await esbuild({
        entryPoints: [fileURLToPath(new URL('./src/client/sw/sw.ts', import.meta.url))],
        bundle: true,
        format: 'iife',
        minify: true,
        write: false,
        target: 'es2020',
        define: { __SW_VERSION__: JSON.stringify(version) },
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: out.outputFiles[0]!.text });
    },
  };
}

export default defineConfig({
  root: 'src/client',
  plugins: [react(), serviceWorker()],
  define: { __SIM_VERSION__: JSON.stringify(SIM_VERSION) },
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: PROXY,
  },
  preview: { proxy: PROXY },
  test: { root: '.', include: ['src/**/*.test.ts'] },
});
