import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: '/home/user/gh-autobattler/src/client',
  plugins: [react()],
  server: { port: 5193, strictPort: true, hmr: false, watch: null },
});
