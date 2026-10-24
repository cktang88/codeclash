import { describe, expect, it } from 'vitest';
import { Terrain, type MapDef } from './api.ts';
import { buildFlowField, cellAt, isPassable } from './flowfield.ts';
import { generateMap, slotsFor } from './mapgen.ts';

/** The original binary-heap Dijkstra, kept as the reference the bucket queue must match exactly. */
function referenceField(map: MapDef, goalCell: number): { cost: Int32Array; next: Int32Array } {
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const { navCols: cols, navRows: rows, terrain } = map;
  const n = cols * rows;
  const cost = new Int32Array(n).fill(-1);
  const next = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  if (goalCell < 0 || !isPassable(terrain[goalCell]!)) return { cost, next };
  // A sorted list of [key, item] is a heap's pop order: (key, item) ascending.
  const queue: [number, number][] = [];
  const push = (item: number, key: number) => {
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const q = queue[mid]!;
      if (q[0] < key || (q[0] === key && q[1] < item)) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, [key, item]);
  };
  cost[goalCell] = 0;
  push(goalCell, 0);
  while (queue.length > 0) {
    const c = queue.shift()![1];
    if (done[c]) continue;
    done[c] = 1;
    const cx = c % cols;
    const cy = (c - cx) / cols;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]!;
      const ny = cy + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nc = ny * cols + nx;
      if (done[nc] || !isPassable(terrain[nc]!)) continue;
      const diagonal = k >= 4;
      if (diagonal && (!isPassable(terrain[cy * cols + nx]!) || !isPassable(terrain[ny * cols + cx]!))) continue;
      const forest = terrain[nc] === Terrain.Forest;
      const step = diagonal ? (forest ? 24 : 14) : forest ? 17 : 10;
      const nd = cost[c]! + step;
      if (cost[nc] === -1 || nd < cost[nc]!) {
        cost[nc] = nd;
        next[nc] = c;
        push(nc, nd);
      }
    }
  }
  return { cost, next };
}

describe('flow fields', () => {
  it('match the binary-heap Dijkstra cell for cell, ties included', () => {
    for (const [players, seed] of [[2, 1], [4, 42], [6, 7]] as const) {
      const map = generateMap({ seed, slots: slotsFor(players), members: players });
      for (const site of map.sites) {
        const goal = cellAt(map, site.x, site.y);
        const got = buildFlowField(map, goal);
        const want = referenceField(map, goal);
        expect(Buffer.from(got.cost.buffer).equals(Buffer.from(want.cost.buffer))).toBe(true);
        expect(Buffer.from(got.next.buffer).equals(Buffer.from(want.next.buffer))).toBe(true);
      }
    }
  });
});
