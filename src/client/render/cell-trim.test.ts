// Trimmed cells (contract.ts Atlas.trim, cellBoxes): each grid cell's box holds every pixel it
// paints and nothing more, so drawing the box shows what the whole cell showed.

import { describe, expect, it } from 'vitest';
import { cellBoxes, cellQuad, cellTrims, type Atlas } from './contract.ts';
import { CELL_H, CELL_W, paintGrid } from './sprites128.ts';

describe('cell boxes', () => {
  it('bound the painted pixels of each cell, empty cells are 0 × 0', () => {
    const w = 3 * 4, h = 2 * 4;
    const px = new Uint32Array(w * h);
    const put = (x: number, y: number, a = 255) => (px[y * w + x] = (a << 24) >>> 0 | 0x123456);
    put(1, 1);
    put(2, 3, 1); // any alpha counts
    put(4 + 3, 0);
    put(8 + 0, 4 + 2);
    const b = cellBoxes(px, w, 4, 4, 3, 2);
    expect(Array.from(b.subarray(0, 4))).toEqual([1, 1, 2, 3]);
    expect(Array.from(b.subarray(4, 8))).toEqual([3, 0, 1, 1]);
    expect(Array.from(b.subarray(8, 12))).toEqual([0, 0, 0, 0]);
    expect(Array.from(b.subarray(12, 16))).toEqual([0, 0, 0, 0]);
    expect(Array.from(b.subarray(20, 24))).toEqual([0, 2, 1, 1]);
  });

  it('answer null until a strip lands, and only inside it', () => {
    const t = cellTrims(4, 4);
    const px = new Uint32Array(8 * 16).fill(0xff000000);
    expect(t.trim(0, 4 * 4)).toBeNull();
    t.land(1, px, 8);
    expect(t.trim(4, 4 * 4 + 4)).toEqual([0, 0, 4, 4]);
    expect(t.trim(8, 4 * 4)).toBeNull();
    expect(t.trim(0, 0)).toBeNull();
  });

  it('give the quad and foot point inside it (cellQuad)', () => {
    const atlas = { cellW: 48, cellH: 48, footX: 24, footY: 38, trim: () => [10, 5, 20, 36] } as unknown as Atlas;
    expect(cellQuad(atlas, 96, 48)).toEqual([106, 53, 20, 36, 14, 33]);
    const whole = { cellW: 48, cellH: 48, footX: 24, footY: 38 } as unknown as Atlas;
    expect(cellQuad(whole, 96, 48)).toEqual([96, 48, 48, 48, 24, 38]);
  });

  it('are tight on a painted HD grid strip, and most of each cell is outside them', () => {
    const g = paintGrid('templar', 30, 0);
    const cols = g.width / CELL_W;
    const b = cellBoxes(g.pixels, g.width, CELL_W, CELL_H, cols, 4);
    const px = new Uint32Array(g.pixels.buffer, g.pixels.byteOffset, g.pixels.byteLength >> 2);
    let boxArea = 0, cells = 0;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < cols; c++) {
        const o = (r * cols + c) * 4;
        const [bx, by, bw, bh] = [b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!];
        let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
        for (let y = 0; y < CELL_H; y++)
          for (let x = 0; x < CELL_W; x++)
            if (px[(r * CELL_H + y) * g.width + c * CELL_W + x]! >>> 24) {
              x0 = Math.min(x0, x);
              y0 = Math.min(y0, y);
              x1 = Math.max(x1, x);
              y1 = Math.max(y1, y);
            }
        if (x1 < 0) expect([bw, bh]).toEqual([0, 0]);
        else expect([bx, by, bw, bh]).toEqual([x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
        if (bw) {
          boxArea += bw * bh;
          cells++;
        }
      }
    expect(cells).toBeGreaterThan(0);
    expect(boxArea / (cells * CELL_W * CELL_H)).toBeLessThan(0.6);
  });
});
