/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Anchored patterns: a bare '/api' prefix would also swallow the client module '/api.ts'.
const PROXY = {
  '^/api/': 'http://localhost:8787',
  '^/auth/': 'http://localhost:8787',
  '^/hooks/': 'http://localhost:8787',
};

/**
 * The HD painter's version: a hash of every source file that decides a painted sheet's pixels.
 * The sprite workers key their persistent sheet cache (src/client/render/sheet-cache.ts) on it,
 * so any change to the art paints afresh. A build bakes it in (__ART_VERSION__); the dev server
 * answers /__art-version with the hash of the files as they are now, edits included.
 */
const ROOT = import.meta.dirname;
export const ART_SOURCES = [
  'src/client/render/paper',
  'src/client/render/sprites128.ts',
  'src/client/render/downscale.ts',
  'src/client/render/frames.ts',
  'src/client/render/contract.ts',
  'src/client/render/sprite-worker.ts',
  'src/client/render/sheet-cache.ts',
  'src/game/units.ts',
  'src/game/factions.ts',
];
function artVersion(): string {
  const files: string[] = [];
  const walk = (p: string): void => {
    if (statSync(p).isDirectory()) for (const n of readdirSync(p).sort()) walk(join(p, n));
    else if (!/\.test\.ts$/.test(p)) files.push(p);
  };
  for (const s of ART_SOURCES) walk(join(ROOT, s));
  const h = createHash('sha256');
  for (const f of files) h.update(relative(ROOT, f)).update('\0').update(readFileSync(f)).update('\0');
  return h.digest('hex').slice(0, 16);
}
function artVersionPlugin(): Plugin {
  return {
    name: 'art-version',
    config: (_, env) => ({ define: { __ART_VERSION__: JSON.stringify(env.command === 'build' ? artVersion() : 'dev') } }),
    configureServer(server) {
      server.middlewares.use('/__art-version', (_req, res) => {
        res.setHeader('content-type', 'text/plain');
        res.setHeader('cache-control', 'no-store');
        res.end(artVersion());
      });
    },
  };
}

export default defineConfig({
  root: 'src/client',
  plugins: [react(), artVersionPlugin()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  // Module workers, so the sprite worker can load the painter only when it has to paint.
  worker: { format: 'es' },
  server: { port: 5173, proxy: PROXY },
  preview: { proxy: PROXY },
  test: { root: '.', include: ['src/**/*.test.ts'] },
});
