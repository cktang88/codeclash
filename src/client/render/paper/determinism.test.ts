// A sheet is fully named by its army, kind and level (the persistent cache and the sheet hashes
// rely on it): its pixels must not depend on what the thread painted before it.

import { describe, expect, it } from 'vitest';
import { paintSheet, sheetFor } from '../sprites128.ts';
import type { KindSheet } from '../contract.ts';

const same = (a: KindSheet, b: KindSheet): boolean =>
  a.width === b.width &&
  a.height === b.height &&
  Buffer.from(a.pixels.buffer, a.pixels.byteOffset, a.pixels.byteLength).equals(Buffer.from(b.pixels.buffer, b.pixels.byteOffset, b.pixels.byteLength)) &&
  Buffer.from(a.rects.buffer).equals(Buffer.from(b.rects.buffer));

describe('sheet determinism', () => {
  it('paints a Templar sheet the same after other armies were painted', () => {
    const first = paintSheet('templar', 215, 1, 2);
    // Another Templar army's grids and level-2 sheets (the skinned cloth's memo fills meanwhile).
    for (const level of [1, 2]) for (let k = 0; k < 11; k++) sheetFor('templar', 0, k, level);
    const again = paintSheet('templar', 215, 1, 2);
    expect(same(first, again)).toBe(true);
  }, 180_000);
});
