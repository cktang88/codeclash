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

describe('HD ground cache window', () => {
  const ground = { w: 4000, h: 2000, ox: 0, oy: 0, props: [], road: () => 0, noise: { salts: [1, 2, 3, 4], roadY0: 0, roadBend: 0, roadPhase: 0, seed: 1 } } as unknown as Ground;
  // The view's tiles, in CT-texel tiles: [x0, x1] × [y0, y1].
  const viewTiles = (camX: number, camY: number, bw: number, bh: number, m: number, t: number) => [Math.floor((camX * m) / t), Math.floor((camX * m + bw - 1) / t), Math.floor((camY * m) / t), Math.floor((camY * m + bh - 1) / t)] as const;

  it('always holds the view, with a margin on every side when the ground goes on', () => {
    const f = new HdField(ground);
    for (const [cx, cy, m] of [[1000, 500, 2], [0, 0, 1], [3000, 1500, 4], [1234.5, 777.25, 2], [1999, 999, 8]] as const) {
      f.plan(cx, cy, 1600, 900, m);
      const w = f.cacheWindow;
      const [x0, x1, y0, y1] = viewTiles(cx, cy, 1600, 900, m, w.tile);
      expect(w.wx0 <= x0 && w.wx0 + w.nx > x1 && w.wy0 <= y0 && w.wy0 + w.ny > y1).toBe(true);
      // A static view in the middle of the field: margin both ways.
      if (cx === 1000) expect(x0 - w.wx0 > 0 && w.wx0 + w.nx - 1 - x1 > 0 && y0 - w.wy0 > 0 && w.wy0 + w.ny - 1 - y1 > 0).toBe(true);
      expect(w.nx * w.ny * w.tile * w.tile).toBeLessThanOrEqual(16 * 1024 * 1024);
    }
  });

  it('leans the margin toward the way the view scrolls, and holds the view throughout', () => {
    const f = new HdField(ground);
    let lead = 0;
    for (let i = 0; i < 40; i++) {
      const cx = 1000 + i * 8;
      f.plan(cx, 600, 1600, 900, 2);
      const w = f.cacheWindow;
      const [x0, x1] = viewTiles(cx, 600, 1600, 900, 2, w.tile);
      expect(w.wx0 <= x0 && w.wx0 + w.nx > x1).toBe(true);
      lead = w.wx0 + w.nx - 1 - x1 - (x0 - w.wx0);
    }
    // Scrolling east: more tiles ahead (east) than behind.
    expect(lead).toBeGreaterThan(0);
  });

  it('covers no more than the ground and the view when zoomed far out', () => {
    const f = new HdField(ground);
    f.plan(0, 0, 4200, 2100, 1);
    const w = f.cacheWindow;
    expect(w.nx).toBeLessThanOrEqual(Math.ceil(4200 / w.tile) + 1);
    expect(w.ny).toBeLessThanOrEqual(Math.ceil(2100 / w.tile) + 1);
  });
});
