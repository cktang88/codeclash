// The 3D fight playground: its own app, apart from the game's build. `pnpm playground`.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'assets',
  server: { port: 5174 },
  build: { outDir: '../dist/playground', emptyOutDir: true },
});
