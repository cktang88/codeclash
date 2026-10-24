// The page's side of the service worker: register it, or remove it (kill switch), and the version
// handshake that keeps an old cached build from ever sticking after a deploy that changed the
// simulation (whose checksums must match the server's).
import type { VersionResponse } from '../../protocol.ts';
import { SIM_VERSION, mustReload } from '../../version.ts';

const RELOADED_KEY = 'pf:reloaded-for';
const KILL_KEY = 'pf:no-sw';

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function dropServiceWorker(): Promise<void> {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (typeof caches !== 'undefined') for (const key of await caches.keys()) if (key.startsWith('pf-')) await caches.delete(key);
  } catch {
    /* nothing to remove */
  }
}

/**
 * The server runs a different simulation than this build: purge the cached build and reload,
 * once per server version (a second mismatch for the same version means the reload did not
 * help, e.g. a CDN still serving the old page: then the worker is removed instead of looping).
 */
export async function reloadForVersion(server: string): Promise<void> {
  const store = storage();
  if (store?.getItem(RELOADED_KEY) === server) {
    await dropServiceWorker();
    return;
  }
  store?.setItem(RELOADED_KEY, server);
  const ctl = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (ctl) {
    await new Promise<void>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ctl.postMessage({ type: 'purge' }, [ch.port2]);
      setTimeout(resolve, 1500);
    });
  } else if (typeof caches !== 'undefined') {
    for (const key of await caches.keys()) if (key.startsWith('pf-')) await caches.delete(key);
  }
  location.reload();
}

/** Called with the server's version from every hello: a long-open tab learns of a deploy too. */
export function noteServerVersion(server: string | undefined): void {
  if (typeof window === 'undefined' || !mustReload(SIM_VERSION, server)) return;
  void reloadForVersion(server!);
}

/** Registers the worker (production builds only), after the version handshake. */
export async function bootServiceWorker(): Promise<void> {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const q = new URLSearchParams(location.search);
  // The viewer's own kill switch: ?nosw turns it off on this browser, ?sw back on.
  try {
    if (q.has('nosw')) localStorage.setItem(KILL_KEY, '1');
    if (q.has('sw')) localStorage.removeItem(KILL_KEY);
    if (localStorage.getItem(KILL_KEY)) {
      await dropServiceWorker();
      return;
    }
  } catch {
    /* storage blocked: carry on */
  }
  let v: VersionResponse | null = null;
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (res.ok) v = (await res.json()) as VersionResponse;
  } catch {
    // Offline: keep whatever worker is installed; it serves the cached shell.
    return;
  }
  if (!v) return;
  if (!v.sw) {
    await dropServiceWorker();
    return;
  }
  if (mustReload(SIM_VERSION, v.sim)) {
    await reloadForVersion(v.sim);
    return;
  }
  storage()?.removeItem(RELOADED_KEY);
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    /* unsupported (private mode, file://): the page works without it */
  }
}
