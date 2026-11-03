import { describe, expect, it } from 'vitest';
import { expandPixels, indexPixels, packSheet, unpackSheet } from './sheet-cache.ts';
import { paintSheet } from './sprites128.ts';
import type { KindSheet } from './contract.ts';

const same = (a: KindSheet, b: KindSheet): boolean =>
  a.level === b.level &&
  a.width === b.width &&
  a.height === b.height &&
  Buffer.from(a.pixels.buffer, a.pixels.byteOffset, a.pixels.byteLength).equals(Buffer.from(b.pixels.buffer, b.pixels.byteOffset, b.pixels.byteLength)) &&
  Buffer.from(a.rects.buffer, a.rects.byteOffset, a.rects.byteLength).equals(Buffer.from(b.rects.buffer, b.rects.byteOffset, b.rects.byteLength));

describe('sheet cache packing', () => {
  const sh = paintSheet('templar', 215, 0, 2);

  it('palette-indexes a painted sheet and expands it back byte for byte', () => {
    const ix = indexPixels(sh);
    expect(ix).not.toBeNull();
    expect(ix!.palette.length).toBeLessThanOrEqual(256);
    const back = expandPixels(ix!.palette, ix!.index);
    expect(Buffer.from(back.buffer).equals(Buffer.from(sh.pixels.buffer, sh.pixels.byteOffset, sh.pixels.byteLength))).toBe(true);
  });

  it('packs (indexed, gzipped) and unpacks a sheet unchanged, and much smaller', async () => {
    const p = await packSheet(sh, indexPixels(sh));
    expect(p.data.size).toBeLessThan(sh.pixels.byteLength / 10);
    const back = await unpackSheet(p);
    expect(back && same(back, sh)).toBe(true);
  });

  it('declines more than 256 colours, and stores those raw', async () => {
    const px = new Uint32Array(300).map((_, i) => (0xff000000 | i) >>> 0);
    const many = { level: 2, width: 300, height: 1, pixels: new Uint8ClampedArray(px.buffer), rects: new Int32Array([1, 0, 3, 1, 5, 6]), ms: 0 };
    expect(indexPixels(many)).toBeNull();
    const back = await unpackSheet(await packSheet(many, null, new Uint8Array(many.pixels.buffer)));
    expect(back && same(back, many)).toBe(true);
  });
});
