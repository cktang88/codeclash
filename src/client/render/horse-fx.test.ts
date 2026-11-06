import { describe, expect, it } from 'vitest';
import { HORSE_COATS, HORSE_FRAMES, horseDead, horseRun } from './horse-fx.ts';

describe('riderless horse sprites', () => {
  for (const L of [1, 2, 8]) {
    it(`paints every gallop frame and the fallen horse, anchored inside, at level ${L}`, () => {
      for (let c = 0; c < HORSE_COATS; c++)
        for (const left of [false, true]) {
          for (const h of [...Array.from({ length: HORSE_FRAMES }, (_, f) => horseRun(c, f, left, L)), horseDead(c, left, L)]) {
            expect(h.px.length).toBe(h.w * h.h);
            expect(h.ax >= 0 && h.ax < h.w && h.ay >= 0 && h.ay < h.h).toBe(true);
            expect(h.px.filter(Boolean).length).toBeGreaterThan(L * L * 12);
          }
        }
    });
  }

  it('mirrors a horse facing left', () => {
    const r = horseRun(1, 0, false, 4);
    const l = horseRun(1, 0, true, 4);
    expect(l.w).toBe(r.w);
    const row = Math.floor(r.h * 0.6);
    const right = r.px.slice(row * r.w, (row + 1) * r.w).map((c) => (c ? 1 : 0));
    const leftRow = l.px.slice(row * l.w, (row + 1) * l.w).map((c) => (c ? 1 : 0));
    // The mass of a horse facing right lies further right than the mirrored one's.
    const mass = (a: number[]) => a.reduce((s, v, i) => s + v * i, 0) / Math.max(1, a.reduce((s, v) => s + v, 0));
    expect(mass(right)).not.toBeCloseTo(mass(leftRow), 0);
  });
});
