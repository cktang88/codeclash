import { describe, expect, it } from 'vitest';
import { expandPixels, indexPixels } from './sheet-cache.ts';
import { paintSheet } from './sprites128.ts';

describe('sheet cache packing', () => {
  it('palette-indexes a painted sheet and expands it back byte for byte', () => {
    const sh = paintSheet('templar', 215, 0, 2);
    const ix = indexPixels(sh);
    expect(ix).not.toBeNull();
    expect(ix!.palette.length).toBeLessThanOrEqual(256);
    const back = expandPixels(ix!.palette, ix!.index);
    expect(Buffer.from(back.buffer).equals(Buffer.from(sh.pixels.buffer, sh.pixels.byteOffset, sh.pixels.byteLength))).toBe(true);
  });

  it('declines more than 256 colours (stored raw instead)', () => {
    const px = new Uint32Array(300).map((_, i) => (0xff000000 | i) >>> 0);
    const sh = { level: 2, width: 300, height: 1, pixels: new Uint8ClampedArray(px.buffer), rects: new Int32Array(0), ms: 0 };
    expect(indexPixels(sh)).toBeNull();
  });
});
