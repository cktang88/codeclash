// A production build of the app plus battle-perf.html, for the art-loading timings
// (scripts/art-loading.cjs): REPO=<tree to build> OUT=<output dir> npx vite build --config <this file>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.env.REPO;
const base = (await import(pathToFileURL(resolve(repo, 'vite.config.ts')).href)).default;
export default {
  ...base,
  root: resolve(repo, 'src/client'),
  build: {
    outDir: process.env.OUT,
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(repo, 'src/client/index.html'), perf: resolve(repo, 'src/client/battle-perf.html') } },
  },
};
