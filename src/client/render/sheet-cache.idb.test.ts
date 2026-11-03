// The persistent sheet cache (sheet-cache.ts) against a small in-memory IndexedDB: corrupt
// entries, a full disk (the browser's quota), versions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KindSheet } from './contract.ts';

// ------------------------------------------------------------------ a minimal IndexedDB

type Row = Record<string, unknown> & { id: string };
const sizeOf = (v: Row): number => {
  let n = 64;
  for (const x of Object.values(v)) n += x instanceof Blob ? x.size : ArrayBuffer.isView(x) ? x.byteLength : 16;
  return n;
};

/** Requests succeed asynchronously; a transaction commits once no request is left, all or nothing. */
class FakeDB {
  stores = new Map<string, Map<string, Row>>();
  objectStoreNames = { contains: (n: string) => this.stores.has(n) };
  constructor(public quota: number) {}
  createObjectStore(n: string): void {
    this.stores.set(n, new Map());
  }
  bytes(stores = this.stores): number {
    let n = 0;
    for (const s of stores.values()) for (const v of s.values()) n += sizeOf(v);
    return n;
  }
  transaction(names: string | string[], mode: 'readonly' | 'readwrite' = 'readonly') {
    const db = this;
    const staged = new Map([...db.stores].map(([k, v]) => [k, new Map(v)]));
    let pending = 0, ended = false;
    const t = {
      error: null as unknown,
      oncomplete: null as null | (() => void),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      objectStore(n: string) {
        if (!(Array.isArray(names) ? names : [names]).includes(n)) throw new Error(`store ${n} not in scope`);
        const s = staged.get(n)!;
        const op = <T>(f: () => T, write = false) => {
          if (ended) throw new DOMException('transaction finished', 'TransactionInactiveError');
          if (write && mode !== 'readwrite') throw new DOMException('read only', 'ReadOnlyError');
          const r = { result: undefined as T | undefined, error: null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
          pending++;
          setTimeout(() => {
            r.result = f();
            pending--;
            r.onsuccess?.();
            settle();
          }, 0);
          return r;
        };
        return {
          get: (id: string) => op(() => s.get(id)),
          getAll: () => op(() => [...s.values()]),
          getAllKeys: () => op(() => [...s.keys()]),
          put: (v: Row) => op(() => void s.set(v.id, v), true),
          delete: (id: string) => op(() => void s.delete(id), true),
        };
      },
    };
    const settle = () =>
      setTimeout(() => {
        if (ended || pending) return;
        ended = true;
        if (mode === 'readwrite') {
          if (db.bytes(staged) > db.quota && db.bytes(staged) > db.bytes()) {
            t.error = new DOMException('quota', 'QuotaExceededError');
            t.onerror?.();
            t.onabort?.();
            return;
          }
          db.stores = staged;
        }
        t.oncomplete?.();
      }, 0);
    settle();
    return t;
  }
}

function installIdb(quota: number): FakeDB {
  const db = new FakeDB(quota);
  let made = false;
  vi.stubGlobal('indexedDB', {
    open() {
      const r = { result: db, onupgradeneeded: null as null | (() => void), onsuccess: null as null | (() => void), onerror: null, onblocked: null };
      setTimeout(() => {
        if (!made) {
          made = true;
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      }, 0);
      return r;
    },
  });
  return db;
}

// ------------------------------------------------------------------ sheets

/** A level-2-like sheet: `n` slots, noisy pixels (so it gzips poorly: a known size on disk). */
function fakeSheet(seed: number, w = 64, h = 64): KindSheet {
  const px = new Uint32Array(w * h);
  let s = seed * 2654435761;
  for (let i = 0; i < px.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    px[i] = (0xff000000 | (s >>> 16) % 200) >>> 0;
  }
  const rects = new Int32Array(6 * 4);
  rects.set([0, 0, w, h, 3, 4], 0);
  return { level: 2, width: w, height: h, pixels: new Uint8ClampedArray(px.buffer), rects, ms: 1 };
}

describe('sheet cache in IndexedDB', () => {
  let cache: typeof import('./sheet-cache.ts');
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  const store = async (v: string, key: string, sh: KindSheet) => {
    const ix = cache.indexPixels(sh);
    await cache.writeSheet(v, key, sh, ix, ix ? undefined : new Uint8Array(sh.pixels.buffer));
  };

  it('stores and reads back a sheet, and lists its key', async () => {
    installIdb(1 << 30);
    cache = await import('./sheet-cache.ts');
    const sh = fakeSheet(1);
    await store('v1', 'templar:215:0:2', sh);
    expect([...(await cache.cachedKeys('v1'))]).toEqual(['templar:215:0:2']);
    const back = await cache.readSheet('v1', 'templar:215:0:2');
    expect(back && Buffer.from(back.pixels).equals(Buffer.from(sh.pixels))).toBe(true);
  });

  it('makes room when the browser says the disk is full, keeping the newest sheet', async () => {
    // A quota well under the cache's own cap: the cap alone never evicts here.
    const db = installIdb(20 * 1024);
    cache = await import('./sheet-cache.ts');
    const keys: string[] = [];
    for (let i = 0; i < 12; i++) {
      keys.push(`templar:215:${i}:2`);
      await store('v1', keys[i]!, fakeSheet(i + 1));
    }
    expect(db.bytes()).toBeLessThanOrEqual(db.quota);
    // The latest sheets are there (not the first few, which filled the disk for good).
    const last = await cache.readSheet('v1', keys.at(-1)!);
    expect(last).not.toBeNull();
    expect(await cache.readSheet('v1', keys.at(-2)!)).not.toBeNull();
    // The least recently used went first.
    expect(await cache.readSheet('v1', keys[0]!)).toBeNull();
  });

  it('drops an entry that does not unpack, so its key is no longer listed', async () => {
    const db = installIdb(1 << 30);
    cache = await import('./sheet-cache.ts');
    await store('v1', 'templar:215:0:2', fakeSheet(1));
    // A partial write: the data cut short.
    const row = db.stores.get('data')!.get('v1|templar:215:0:2')!;
    row.data = (row.data as Blob).slice(0, 20);
    expect(await cache.readSheet('v1', 'templar:215:0:2')).toBeNull();
    expect([...(await cache.cachedKeys('v1'))]).toEqual([]);
  });
});

describe('sheet cache unpacking', () => {
  it('rejects sheets that do not add up: rects off the page, palette indices past the palette, a ragged rect table', async () => {
    vi.resetModules();
    const cache = await import('./sheet-cache.ts');
    const sh = fakeSheet(3, 16, 16);
    const ix = cache.indexPixels(sh)!;
    const good = await cache.packSheet(sh, ix);
    expect(await cache.unpackSheet(good)).not.toBeNull();
    const offPage = new Int32Array(sh.rects);
    offPage.set([10, 0, 16, 16, 0, 0], 6);
    expect(await cache.unpackSheet({ ...good, rects: offPage })).toBeNull();
    expect(await cache.unpackSheet({ ...good, rects: sh.rects.subarray(0, 7) })).toBeNull();
    expect(await cache.unpackSheet({ ...good, palette: ix.palette.subarray(0, 2) })).toBeNull();
  });
});
