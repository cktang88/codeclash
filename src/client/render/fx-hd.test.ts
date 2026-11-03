import { describe, expect, it } from 'vitest';
import { ANGLES, buildFxHd, fxId, PUFF_SIZES, PUFF_VARIANTS } from './fx-hd.ts';
import { HdField } from './field-hd.ts';
import type { Ground } from './ground.ts';

describe('HD effects sheet', () => {
  for (const L of [1, 2, 4, 8]) {
    it(`paints every sprite inside the sheet with hard alpha at level ${L}`, () => {
      const s = buildFxHd(L);
      expect(s.pixels.length).toBe(s.w * s.h * 4);
      for (const r of s.regions) {
        expect(r.u >= 0 && r.v >= 0 && r.u + r.w <= s.w && r.v + r.h <= s.h).toBe(true);
        expect(r.ax >= 0 && r.ax < r.w && r.ay >= 0 && r.ay < r.h).toBe(true);
      }
      // Count, then assert once: one expect per pixel took seconds at level 8 and timed out under load.
      let soft = 0;
      for (let i = 3; i < s.pixels.length; i += 4) if (s.pixels[i] !== 0 && s.pixels[i] !== 255) soft++;
      expect(soft).toBe(0);
    });
  }

  it('scales sprites with the level, not by upscaling', () => {
    const a = buildFxHd(2).regions[fxId('arrow3')]!;
    const b = buildFxHd(8).regions[fxId('arrow3')]!;
    expect(b.w).toBeGreaterThan(a.w * 3);
  });

  it('keeps the ids the scene addresses by offset in order', () => {
    expect(fxId(`arrow${ANGLES - 1}`)).toBe(fxId('arrow0') + ANGLES - 1);
    expect(fxId(`puff${PUFF_SIZES[2]}_1`)).toBe(fxId(`puff${PUFF_SIZES[0]}_0`) + 2 * PUFF_VARIANTS + 1);
    expect(fxId('stake1')).toBe(fxId('stake0') + 1);
  });
});

describe('HD field marks', () => {
  const ground = { w: 200, h: 100, ox: 0, oy: 0, props: [], road: () => 0, noise: { salts: [1, 2, 3, 4], roadY0: 0, roadBend: 0, roadPhase: 0, seed: 1 } } as unknown as Ground;

  it('soaks blood into a flattened ellipse and remembers when', () => {
    const f = new HdField(ground);
    f.mark(50, 50, 4, 0.5, 0, 30);
    expect(f.bloodAt(50, 50)).toBeGreaterThan(0.4);
    expect(f.bloodAt(50, 53)).toBe(0); // half as tall as wide
    expect(f.bloodAt(53, 50)).toBeGreaterThan(0);
    expect(f.marks[(50 * 200 + 50) * 4 + 3]).toBe(15);
    f.mark(50, 50, 4, 1, 0, 30);
    expect(f.bloodAt(50, 50)).toBe(1);
  });

  it('ignores marks and decals off the ground', () => {
    const f = new HdField(ground);
    f.mark(-50, -50, 3, 1, 1, 0);
    f.decal('splat0', -5, 10, 0, true);
    expect(f.decalCount).toBe(0);
    f.decal('splat0', 5, 10, 0, true);
    expect(f.decalCount).toBe(1);
  });
});
