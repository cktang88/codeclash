import { Terrain, type MapDef } from './api.ts';

export interface FlowField {
  cost: Int32Array;
  next: Int32Array;
}

const STRAIGHT = 10;
const DIAGONAL = 14;
const FOREST_STRAIGHT = 17;
const FOREST_DIAGONAL = 24;

export function isPassable(t: number): boolean {
  return t === Terrain.Plain || t === Terrain.Forest;
}

export function cellAt(map: MapDef, x: number, y: number): number {
  const cx = Math.floor((x - map.originX) / map.navCell);
  const cy = Math.floor((y - map.originY) / map.navCell);
  if (cx < 0 || cy < 0 || cx >= map.navCols || cy >= map.navRows) return -1;
  return cy * map.navCols + cx;
}

export function cellCenterX(map: MapDef, cell: number): number {
  return map.originX + ((cell % map.navCols) + 0.5) * map.navCell;
}

export function cellCenterY(map: MapDef, cell: number): number {
  return map.originY + (Math.floor(cell / map.navCols) + 0.5) * map.navCell;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Shortest paths from the goal over the nav grid: `cost` to reach the goal, and `next`, the cell to
 * step to. It reproduces a binary-heap Dijkstra that settles cells in (cost, cell index) order and
 * takes the first strictly better route: `cost` is the unique shortest distance, so any exact
 * shortest-path order finds it (here a ring of buckets, one per cost; step costs are small
 * integers), and `next` is then the predecessor that order would have met first, the one with the
 * lowest (cost, index) among those that reach the cell at its cost. flowfield.test.ts checks it
 * against the heap, cell for cell.
 */
export function buildFlowField(map: MapDef, goalCell: number): FlowField {
  const { navCols: cols, navRows: rows, terrain } = map;
  const n = cols * rows;
  const cost = new Int32Array(n).fill(-1);
  const next = new Int32Array(n).fill(-1);
  if (goalCell < 0 || !isPassable(terrain[goalCell]!)) return { cost, next };
  const { moves, steps } = movesOf(map);
  const ring: number[][] = [];
  for (let k = 0; k < RING; k++) ring.push([]);
  cost[goalCell] = 0;
  ring[0]!.push(goalCell);
  let pending = 1;
  for (let d = 0; pending > 0; d++) {
    const bucket = ring[d % RING]!;
    if (bucket.length === 0) continue;
    pending -= bucket.length;
    for (let b = 0; b < bucket.length; b++) {
      const c = bucket[b]!;
      if (cost[c] !== d) continue;
      const m = moves[c]!;
      for (let k = 0; k < 8; k++) {
        if ((m & (1 << k)) === 0) continue;
        const nc = c + DX[k]! + DY[k]! * cols;
        const nd = d + steps[c * 8 + k]!;
        const old = cost[nc]!;
        if (old === -1 || nd < old) {
          cost[nc] = nd;
          ring[nd % RING]!.push(nc);
          pending++;
        }
      }
    }
    bucket.length = 0;
  }
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      const want = cost[c]!;
      if (want <= 0) continue;
      let best = -1;
      let bestCost = 0;
      for (let k = 0; k < 8; k++) {
        const px = cx - DX[k]!;
        const py = cy - DY[k]!;
        if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
        const p = py * cols + px;
        if ((moves[p]! & (1 << k)) === 0) continue;
        const pc = cost[p]!;
        if (pc < 0 || pc + steps[p * 8 + k]! !== want) continue;
        if (best < 0 || pc < bestCost || (pc === bestCost && p < best)) {
          best = p;
          bestCost = pc;
        }
      }
      next[c] = best;
    }
  }
  return { cost, next };
}

/** One bucket per cost a step can add, plus the current one. */
const RING = FOREST_DIAGONAL + 1;

/**
 * Per cell, the moves a flow field may take out of it (bit k for direction k: on the grid, onto
 * passable ground, and for a diagonal, not cutting a corner of rock or water) and what each costs.
 * The same for every goal, so it is worked out once per map instead of once per field.
 */
const movesCache = new WeakMap<MapDef, { moves: Uint8Array; steps: Uint8Array }>();

function movesOf(map: MapDef): { moves: Uint8Array; steps: Uint8Array } {
  let t = movesCache.get(map);
  if (t) return t;
  const { navCols: cols, navRows: rows, terrain } = map;
  const moves = new Uint8Array(cols * rows);
  const steps = new Uint8Array(cols * rows * 8);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      let m = 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k]!;
        const ny = cy + DY[k]!;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nc = ny * cols + nx;
        if (!isPassable(terrain[nc]!)) continue;
        const diagonal = k >= 4;
        if (diagonal && (!isPassable(terrain[cy * cols + nx]!) || !isPassable(terrain[ny * cols + cx]!))) continue;
        const forest = terrain[nc] === Terrain.Forest;
        steps[c * 8 + k] = diagonal ? (forest ? FOREST_DIAGONAL : DIAGONAL) : forest ? FOREST_STRAIGHT : STRAIGHT;
        m |= 1 << k;
      }
      moves[c] = m;
    }
  }
  t = { moves, steps };
  movesCache.set(map, t);
  return t;
}
