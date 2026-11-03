// Paints HD sprite sheets off the main thread (see sprites128.ts): one kind at one level per message.
// With a painter version, a sheet already in the persistent cache (sheet-cache.ts) is read from
// it instead, and a freshly painted one is stored there after it has been sent back.
//
// The painter itself (sprites128.ts and the paper figures: seconds of rig building at start-up)
// is loaded on the first miss only, so a worker that finds everything cached answers at once.

import { readSheet, writeSheet, indexPixels } from './sheet-cache.ts';
import type { KindSheet } from './contract.ts';

interface Req {
  faction: string;
  hue: number;
  kind: number;
  level: number;
  /** HD 64: paint level 2×level and halve it with the pixel-art reduction (downscale.ts). */
  half?: boolean;
  /** HD 64: the level-2×level sheet, already painted: only halve it. */
  from?: KindSheet;
  /** The painter's version (persistent cache key), or null: no cache. */
  version?: string | null;
  /** The sheet's name in the cache. */
  key?: string;
  /** Whether the cache holds it (else it is painted without a lookup). */
  cached?: boolean;
  /** Only load the painter now: sheets are coming that the cache does not hold. */
  warm?: boolean;
}

const post = (sheet: KindSheet): void =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(sheet, [sheet.pixels.buffer, sheet.rects.buffer]);
/** A job that could not be painted: the main thread frees this worker and reports it (sprites128.ts). */
export interface PaintError {
  error: string;
  key?: string;
}
const postError = (err: unknown, key?: string): void =>
  (self as unknown as { postMessage(m: PaintError): void }).postMessage({ error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), key });

let painter: Promise<[typeof import('./sprites128.ts'), typeof import('./downscale.ts')]> | null = null;
const loadPainter = () =>
  (painter ??= Promise.all([import('./sprites128.ts'), import('./downscale.ts')]).catch((e: unknown) => {
    // A chunk that failed to load (a network blip, a deploy): try again on the next miss.
    painter = null;
    throw e;
  }));

self.onmessage = async (e: MessageEvent<Req>) => {
  if (e.data.warm) return void loadPainter().catch(() => {});
  const { faction, hue, kind, level, half, from, version, key, cached } = e.data;
  let sheet: KindSheet;
  try {
    if (version && key && cached) {
      const hit = await readSheet(version, key);
      if (hit) return post(hit);
    }
    const [{ sheetFor }, { halveSheet }] = await loadPainter();
    // Level 1 is the classic-size grid strip; the rest are packed hi-res sheets.
    sheet = from ? halveSheet(from) : sheetFor(faction, hue, kind, level, half);
  } catch (err) {
    // Every job is answered: one that is not leaves its pool slot busy for good.
    return postError(err, key);
  }
  if (!version || !key) return post(sheet);
  // Send it at once; pack and store a copy afterwards.
  const pixels = sheet.pixels.slice();
  const meta = { level: sheet.level, width: sheet.width, height: sheet.height, rects: sheet.rects.slice(), ms: sheet.ms };
  post(sheet);
  const ix = indexPixels({ ...meta, pixels });
  await writeSheet(version, key, meta, ix, ix ? undefined : new Uint8Array(pixels.buffer));
};
