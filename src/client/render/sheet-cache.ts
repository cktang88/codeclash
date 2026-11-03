// A persistent cache of painted HD sheets (IndexedDB), so a second visit, a reload or an art switch
// back finds them painted. The art is deterministic: a sheet is fully named by the painter's
// version (a hash of its source, see vite.config.ts) and the army, kind and level it shows.
//
// Used from the sprite workers (sprite-worker.ts): a hit is read and unpacked there, a miss is
// painted and then packed and stored there, so the main thread never touches the bytes. Sheets
// are stored palette-indexed (one byte a pixel: the art has a few dozen colours) and gzipped,
// about 1/50 of their size in memory. Old versions and the least recently used sheets over the
// byte cap are deleted.

import type { KindSheet } from './contract.ts';

const DB = 'codeclash-sheets';
const INDEX = 'index';
const DATA = 'data';
/** Bytes of packed sheets kept on disk, every version and army together. */
export const DISK_CAP_BYTES = 192 * 1024 * 1024;

/** What the index holds per sheet (small: read whole for eviction). */
interface Entry {
  id: string;
  version: string;
  bytes: number;
  used: number;
}

/** A packed sheet. */
interface Packed {
  id: string;
  level: number;
  width: number;
  height: number;
  rects: Int32Array;
  ms: number;
  /** RGBA (little-endian packed) per palette index, or null: `data` is raw RGBA. */
  palette: Uint32Array | null;
  /** The pixels (palette indices, or RGBA), gzipped. */
  data: Blob;
}

export const cacheSupported = (): boolean =>
  typeof indexedDB !== 'undefined' && typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined';

let opened: Promise<IDBDatabase | null> | null = null;
let purged = '';

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
const done = (t: IDBTransaction): Promise<void> =>
  new Promise((ok, no) => {
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
    t.onabort = () => no(t.error);
  });

function open(): Promise<IDBDatabase | null> {
  if (opened) return opened;
  opened = new Promise<IDBDatabase | null>((ok) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(INDEX)) db.createObjectStore(INDEX, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: 'id' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
  return opened;
}

/** Deletes sheets of other painter versions and, over the cap, the least recently used. */
async function evict(db: IDBDatabase, version: string, extra = 0): Promise<void> {
  const t = db.transaction([INDEX, DATA], 'readwrite');
  const idx = t.objectStore(INDEX), data = t.objectStore(DATA);
  const all = (await req(idx.getAll())) as Entry[];
  let total = extra;
  const keep: Entry[] = [];
  for (const e of all) {
    if (e.version !== version) {
      idx.delete(e.id);
      data.delete(e.id);
    } else {
      keep.push(e);
      total += e.bytes;
    }
  }
  keep.sort((a, b) => a.used - b.used);
  for (const e of keep) {
    if (total <= DISK_CAP_BYTES) break;
    idx.delete(e.id);
    data.delete(e.id);
    total -= e.bytes;
  }
  await done(t);
}

const idOf = (version: string, key: string): string => `${version}|${key}`;

/**
 * The keys of every sheet cached for a painter version (read once, on the main thread, so the
 * workers try the cache only for sheets it holds: a lookup that misses can wait seconds behind
 * another worker's write, and a miss needs no lookup at all).
 */
export async function cachedKeys(version: string): Promise<Set<string>> {
  try {
    const db = await open();
    if (!db) return new Set();
    const ids = (await req(db.transaction(INDEX, 'readonly').objectStore(INDEX).getAllKeys())) as string[];
    const pre = `${version}|`;
    return new Set(ids.filter((id) => id.startsWith(pre)).map((id) => id.slice(pre.length)));
  } catch {
    return new Set();
  }
}

async function gzip(bytes: Uint8Array): Promise<Blob> {
  const s = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(s).blob();
}

async function gunzip(b: Blob): Promise<ArrayBuffer> {
  return new Response(b.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** A cached sheet, or null (not cached, another version, or storage unavailable). */
export async function readSheet(version: string, key: string): Promise<KindSheet | null> {
  try {
    const db = await open();
    if (!db) return null;
    const id = idOf(version, key);
    // Read-only, so the workers read side by side.
    const t = db.transaction([INDEX, DATA], 'readonly');
    const e = (await req(t.objectStore(INDEX).get(id))) as Entry | undefined;
    if (!e) return null;
    const p = (await req(t.objectStore(DATA).get(id))) as Packed | undefined;
    if (!p) return null;
    // Recently used: the last to go.
    db.transaction(INDEX, 'readwrite').objectStore(INDEX).put({ ...e, used: Date.now() });
    return await unpackSheet(p);
  } catch {
    return null;
  }
}

/** A sheet packed for storage: palette-indexed when it can be, gzipped. */
export async function packSheet(sh: Omit<KindSheet, 'pixels'>, ix: { palette: Uint32Array; index: Uint8Array } | null, raw?: Uint8Array): Promise<Omit<Packed, 'id'>> {
  const data = await gzip(ix ? ix.index : raw!);
  return { level: sh.level, width: sh.width, height: sh.height, rects: sh.rects, ms: sh.ms, palette: ix ? ix.palette : null, data };
}

/** The sheet back from packSheet(), or null if it does not add up. */
export async function unpackSheet(p: Omit<Packed, 'id'>): Promise<KindSheet | null> {
  const raw = await gunzip(p.data);
  const pixels = p.palette ? expandPixels(p.palette, new Uint8Array(raw)) : new Uint8ClampedArray(raw);
  if (pixels.byteLength !== p.width * p.height * 4) return null;
  return { level: p.level, width: p.width, height: p.height, pixels, rects: p.rects, ms: p.ms };
}

/**
 * The pixels palette-indexed (one byte each), or null over 256 colours. Synchronous, so the caller
 * can take it before handing the pixels on (transferring them away).
 */
export function indexPixels(sh: KindSheet): { palette: Uint32Array; index: Uint8Array } | null {
  const u = new Uint32Array(sh.pixels.buffer, sh.pixels.byteOffset, sh.pixels.byteLength >> 2);
  const pal: number[] = [0];
  const index = new Uint8Array(u.length);
  let last = 0, lastI = 0;
  for (let i = 0; i < u.length; i++) {
    const v = u[i]!;
    if (v === last) {
      index[i] = lastI;
      continue;
    }
    let j = pal.indexOf(v);
    if (j < 0) {
      if (pal.length >= 256) return null;
      j = pal.push(v) - 1;
    }
    index[i] = j;
    last = v;
    lastI = j;
  }
  return { palette: Uint32Array.from(pal), index };
}

/** RGBA pixels back from indexPixels(). */
export function expandPixels(palette: Uint32Array, index: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) out[i] = palette[index[i]!]!;
  return new Uint8ClampedArray(out.buffer);
}

/**
 * Stores a sheet. `ix` is its indexPixels() (taken before its pixels were transferred); without
 * it (over 256 colours) `raw` must be the RGBA pixels.
 */
export async function writeSheet(version: string, key: string, sh: Omit<KindSheet, 'pixels'>, ix: { palette: Uint32Array; index: Uint8Array } | null, raw?: Uint8Array): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const packed: Packed = { id: idOf(version, key), ...(await packSheet(sh, ix, raw)) };
    const id = packed.id;
    const bytes = packed.data.size + sh.rects.byteLength + 256;
    if (purged !== version) {
      purged = version;
      await evict(db, version, bytes);
    }
    const t = db.transaction([INDEX, DATA], 'readwrite');
    t.objectStore(DATA).put(packed);
    t.objectStore(INDEX).put({ id, version, bytes, used: Date.now() } satisfies Entry);
    await done(t);
    writes += bytes;
    // Every so often (and the first time per version, above): drop what is over the cap.
    if (writes > 16 * 1024 * 1024) {
      writes = 0;
      await evict(db, version);
    }
  } catch {
    // Storage full or unavailable: the sheet is simply painted again next time.
  }
}
let writes = 0;

declare const __ART_VERSION__: string | undefined;

/**
 * The painter version the cache is keyed on, or null for no cache (no IndexedDB or streams, a
 * script run outside Vite, or `?sheetcache=0`). A build bakes it in; the dev server is asked
 * (`/__art-version`, the hash of the art's source as it is now, so edits paint afresh).
 */
export async function artVersion(): Promise<string | null> {
  if (!cacheSupported()) return null;
  try {
    if (typeof location !== 'undefined' && /[?&]sheetcache=0\b/.test(location.search)) return null;
  } catch {
    // No location: carry on.
  }
  const v = typeof __ART_VERSION__ === 'string' ? __ART_VERSION__ : null;
  if (v !== 'dev') return v;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch('/__art-version', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    const s = r.ok ? (await r.text()).trim() : '';
    return /^[0-9a-f]{8,64}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}
