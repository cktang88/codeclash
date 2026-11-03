import { describe, expect, it } from 'vitest';
import { feature, halveSheet, HALVERS, type HalfTile } from './downscale.ts';
import { paintSheet } from './sprites128.ts';

const C = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const FIELD = C(200, 190, 170);
const LINE = C(40, 30, 20);
const EDGE = C(20, 15, 10);

function tile(w: number, h: number, f: (x: number, y: number) => number, ax = 0, ay = 0): HalfTile {
  const px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = f(x, y);
  return { px, w, h, ax, ay };
}

describe('HD 64 reduction', () => {
  it('only uses colours of its source, for every candidate', () => {
    const t = tile(20, 20, (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 0 : C((x * 13) & 255, (y * 29) & 255, ((x + y) * 5) & 255)), 10, 18);
    const src = new Set(t.px);
    for (const how of Object.values(HALVERS)) for (const v of how(t).px) expect(src.has(v)).toBe(true);
  });

  it('keeps the foot point on the foot (anchor halves, grid laid from the foot)', () => {
    const t = tile(21, 31, () => FIELD, 11, 29);
    const o = feature(t);
    expect(o.ax).toBe(Math.floor(11 / 2) + (11 % 2));
    expect(o.ay).toBe(15);
    expect(o.w).toBeGreaterThanOrEqual(10);
    expect(o.w).toBeLessThanOrEqual(12);
  });

  it('keeps a 1-px diagonal spear connected', () => {
    // A 45° shaft one pixel wide on transparency: half its blocks hold only one of its pixels.
    const t = tile(32, 32, (x, y) => (x === y ? LINE : 0));
    const o = feature(t);
    let n = 0;
    for (let i = 0; i < 16; i++) if (o.px[i * o.w + i] === LINE) n++;
    expect(n).toBe(16);
  });

  it('keeps a 1-px line crossing a flat field', () => {
    const t = tile(16, 16, (x) => (x === 7 ? LINE : FIELD));
    const o = feature(t);
    for (let y = 1; y < o.h - 1; y++) expect(o.px[y * o.w + 3]).toBe(LINE);
  });

  it('keeps the dark outline on the silhouette', () => {
    // A 12×12 square: a 1-px dark rim around a light fill, on transparency.
    const t = tile(16, 16, (x, y) => (x < 2 || y < 2 || x > 13 || y > 13 ? 0 : x === 2 || y === 2 || x === 13 || y === 13 ? EDGE : FIELD));
    const o = feature(t);
    for (let i = 1; i < 7; i++) {
      expect(o.px[1 * o.w + i]).toBe(EDGE);
      expect(o.px[i * o.w + 1]).toBe(EDGE);
    }
    expect(o.px[3 * o.w + 3]).toBe(FIELD);
  });

  it('halves a real level-8 sheet into level 4 with every slot', () => {
    const s8 = paintSheet('undead', 215, 0, 8);
    const s4 = halveSheet(s8);
    expect(s4.level).toBe(4);
    expect(s4.rects.length).toBe(s8.rects.length);
    const colours8 = new Set(new Uint32Array(s8.pixels.buffer));
    for (const v of new Uint32Array(s4.pixels.buffer)) expect(colours8.has(v)).toBe(true);
    for (let s = 0; s < s8.rects.length / 6; s++) {
      const w8 = s8.rects[s * 6 + 2]!, w4 = s4.rects[s * 6 + 2]!;
      expect(w4 > 0).toBe(w8 > 0);
      if (w8) expect(Math.abs(w4 - w8 / 2)).toBeLessThanOrEqual(1.5);
    }
  }, 60000);
});
