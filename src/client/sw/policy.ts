// The service worker's caching policy, kept free of worker globals so it can be tested.
//
// - Hashed build assets (/assets/*-[hash].*) never change: served from the cache once there.
// - The app shell (every page route serves the same index.html), sprites, audio and fonts:
//   stale-while-revalidate, served at once from the cache and refreshed behind it.
// - The API, sign-in, webhooks and the websocket are never cached; nor is anything unknown.

export type Strategy = 'network' | 'immutable' | 'swr' | 'shell';

/** The cache key every page route's shell is stored under. */
export const SHELL_KEY = '/index.html';
/** Hashed assets outlive a version (they are immutable), but not forever. */
export const MAX_IMMUTABLE_ENTRIES = 160;

const FONT_CSS = 'https://fonts.googleapis.com';
const FONT_FILES = 'https://fonts.gstatic.com';

export function strategyFor(url: URL, method: string, mode: string, origin: string): Strategy {
  if (method !== 'GET') return 'network';
  if (url.origin === origin) {
    const p = url.pathname;
    if (/^\/(api|auth|ws|hooks)(\/|$)/.test(p) || p === '/sw.js') return 'network';
    if (p.startsWith('/assets/')) return 'immutable';
    if (p.startsWith('/art/') || p.startsWith('/audio/')) return 'swr';
    if (mode === 'navigate') return 'shell';
    return 'network';
  }
  if (url.origin === FONT_FILES) return 'immutable';
  if (url.origin === FONT_CSS) return 'swr';
  return 'network';
}

/** The parts of the Cache API the strategies use. */
export interface CacheLike {
  match(key: Request | string): Promise<Response | undefined>;
  put(key: Request | string, res: Response): Promise<void>;
  keys(): Promise<readonly (Request | string)[]>;
  delete(key: Request | string): Promise<boolean>;
}

type Fetch = (req: Request | string) => Promise<Response>;

/** Whether a response may be kept: whole and successful, or an opaque cross-origin font sheet. */
export function storable(res: Response): boolean {
  return (res.status === 200 && res.type !== 'error') || res.type === 'opaque';
}

/** Served from the cache when there; otherwise fetched and kept. */
export async function immutable(cache: CacheLike, req: Request, fetchFn: Fetch, maxEntries = MAX_IMMUTABLE_ENTRIES): Promise<Response> {
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetchFn(req);
  if (storable(res)) {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    // Oldest first: trim what earlier builds left behind.
    for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]!);
  }
  return res;
}

/**
 * Stale-while-revalidate: the cached copy at once if there is one, with a refresh kept for next
 * time; the network otherwise. `waitUntil` keeps the worker alive for the refresh.
 */
export async function staleWhileRevalidate(cache: CacheLike, req: Request | string, fetchFn: Fetch, waitUntil: (p: Promise<unknown>) => void, key: Request | string = req): Promise<Response> {
  const hit = await cache.match(key);
  const refresh = fetchFn(req).then(
    async (res) => {
      if (storable(res)) await cache.put(key, res.clone());
      return res;
    },
    (err: unknown) => {
      if (!hit) throw err;
      return hit;
    },
  );
  if (hit) {
    waitUntil(refresh.catch(() => undefined));
    return hit;
  }
  return refresh;
}
