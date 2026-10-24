import { describe, expect, it } from 'vitest';
import { mustReload } from '../../version.ts';
import { SHELL_KEY, immutable, staleWhileRevalidate, strategyFor, type CacheLike } from './policy.ts';

const ORIGIN = 'https://pushfront.example';
const at = (path: string, method = 'GET', mode = 'cors') => strategyFor(new URL(path, ORIGIN), method, mode, ORIGIN);

class FakeCache implements CacheLike {
  store = new Map<string, Response>();
  private key(k: Request | string): string {
    return typeof k === 'string' ? new URL(k, ORIGIN).href : k.url;
  }
  async match(k: Request | string) {
    return this.store.get(this.key(k))?.clone();
  }
  async put(k: Request | string, res: Response) {
    this.store.delete(this.key(k));
    this.store.set(this.key(k), res);
  }
  async keys() {
    return [...this.store.keys()];
  }
  async delete(k: Request | string) {
    return this.store.delete(this.key(k));
  }
}

describe('service worker policy', () => {
  it('never caches the API, sign-in, webhooks, the websocket or the worker itself', () => {
    for (const p of ['/api/me', '/api/version', '/api/rooms/x/replay/3', '/auth/github', '/hooks/github/1', '/ws', '/ws?room=a', '/sw.js']) expect(at(p, 'GET', 'navigate')).toBe('network');
    expect(at('/api/rooms', 'POST')).toBe('network');
    expect(at('/assets/index-abc123.js', 'POST')).toBe('network');
  });

  it('serves hashed assets and font files from the cache, and the shell, sprites, audio and font sheets stale-while-revalidate', () => {
    expect(at('/assets/render-D_WqGQna.js')).toBe('immutable');
    expect(at('/assets/index-CYL5MvA0.css')).toBe('immutable');
    expect(strategyFor(new URL('https://fonts.gstatic.com/s/alegreya/v1/a.woff2'), 'GET', 'cors', ORIGIN)).toBe('immutable');
    expect(strategyFor(new URL('https://fonts.googleapis.com/css2?family=Alegreya'), 'GET', 'no-cors', ORIGIN)).toBe('swr');
    expect(at('/art/kenney-fx/fx.png')).toBe('swr');
    expect(at('/audio/kenney/clash-1.ogg')).toBe('swr');
    expect(at('/r/commons', 'GET', 'navigate')).toBe('shell');
    expect(at('/', 'GET', 'navigate')).toBe('shell');
    // Anything else, and anyone else's content (avatars), goes to the network.
    expect(at('/favicon.ico')).toBe('network');
    expect(strategyFor(new URL('https://avatars.githubusercontent.com/u/1'), 'GET', 'no-cors', ORIGIN)).toBe('network');
  });

  it('fetches an immutable asset once, then serves it from the cache, trimming old builds by count', async () => {
    const cache = new FakeCache();
    let fetches = 0;
    const fetchFn = async () => (fetches++, new Response('body', { status: 200 }));
    const req = new Request(`${ORIGIN}/assets/a-1.js`);
    expect(await (await immutable(cache, req, fetchFn)).text()).toBe('body');
    expect(await (await immutable(cache, req, fetchFn)).text()).toBe('body');
    expect(fetches).toBe(1);
    for (let i = 2; i <= 5; i++) await immutable(cache, new Request(`${ORIGIN}/assets/a-${i}.js`), fetchFn, 3);
    expect((await cache.keys()).length).toBe(3);
    expect(await cache.match(req)).toBeUndefined();
  });

  it('does not keep failures or partial responses', async () => {
    const cache = new FakeCache();
    await immutable(cache, new Request(`${ORIGIN}/assets/x-1.js`), async () => new Response('no', { status: 404 }));
    await immutable(cache, new Request(`${ORIGIN}/assets/x-2.js`), async () => new Response('part', { status: 206 }));
    expect((await cache.keys()).length).toBe(0);
  });

  it('answers stale-while-revalidate from the cache at once and refreshes it behind', async () => {
    const cache = new FakeCache();
    let version = 1;
    const fetchFn = async () => new Response(`v${version}`, { status: 200 });
    const pending: Promise<unknown>[] = [];
    const wait = (p: Promise<unknown>) => void pending.push(p);
    // First visit: the network, kept under the shell key.
    expect(await (await staleWhileRevalidate(cache, `${ORIGIN}/r/a`, fetchFn, wait, SHELL_KEY)).text()).toBe('v1');
    version = 2;
    // Next visit, any route: the cached shell at once; the new one lands behind it.
    expect(await (await staleWhileRevalidate(cache, `${ORIGIN}/r/b`, fetchFn, wait, SHELL_KEY)).text()).toBe('v1');
    await Promise.all(pending);
    expect(await (await cache.match(SHELL_KEY))!.text()).toBe('v2');
    // Offline: the cached copy still answers.
    const offline = async (): Promise<Response> => Promise.reject(new TypeError('offline'));
    expect(await (await staleWhileRevalidate(cache, `${ORIGIN}/`, offline, wait, SHELL_KEY)).text()).toBe('v2');
    await Promise.all(pending);
  });

  it('reloads a build whose simulation differs from the server’s, never a dev build, never on a missing version', () => {
    expect(mustReload('abc', 'def')).toBe(true);
    expect(mustReload('abc', 'abc')).toBe(false);
    expect(mustReload('dev', 'def')).toBe(false);
    expect(mustReload('abc', 'dev')).toBe(false);
    expect(mustReload('abc', undefined)).toBe(false);
  });
});
