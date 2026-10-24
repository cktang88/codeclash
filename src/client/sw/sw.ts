/// <reference lib="webworker" />
// Pushfront's service worker: instant repeat loads of the shell, fonts, sprites and audio.
// Built into /sw.js by vite.config.ts (swPlugin) with its version stamped in; see policy.ts for
// what is cached how, and src/client/sw/register.ts for the version handshake and kill switch.
import { SHELL_KEY, immutable, staleWhileRevalidate, strategyFor } from './policy.ts';

declare const self: ServiceWorkerGlobalScope;
declare const __SW_VERSION__: string;

const VERSION = __SW_VERSION__;
/** Shell, sprites, audio and font sheets: replaced with each version. */
const RUNTIME = `pf-runtime-${VERSION}`;
/** Hashed assets and font files: immutable, so kept across versions (trimmed by count). */
const IMMUTABLE = 'pf-immutable-v1';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('pf-runtime-') && key !== RUNTIME) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // A page found its build out of date: drop everything so the reload fetches the new one.
  if ((event.data as { type?: string } | null)?.type === 'purge') {
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) if (key.startsWith('pf-')) await caches.delete(key);
        event.ports[0]?.postMessage('purged');
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const strategy = strategyFor(url, req.method, req.mode, self.location.origin);
  if (strategy === 'network') return;
  const wait = (p: Promise<unknown>) => event.waitUntil(p);
  event.respondWith(
    (async () => {
      try {
        if (strategy === 'immutable') return await immutable(await caches.open(IMMUTABLE), req, fetch);
        // Every page route is the same app shell: keep one copy, refreshed by whichever route loads.
        if (strategy === 'shell') return await staleWhileRevalidate(await caches.open(RUNTIME), req, fetch, wait, SHELL_KEY);
        return await staleWhileRevalidate(await caches.open(RUNTIME), req, fetch, wait);
      } catch {
        return fetch(req);
      }
    })(),
  );
});
