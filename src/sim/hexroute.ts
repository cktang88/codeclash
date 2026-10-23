// The strategic layer's road map: a coarse hex graph over the battlefield and a
// deterministic A* across it. Hexes are pointy-topped, HEX_SIZE from centre to
// corner, so neighbouring centres lie HEX_STEP apart. A hex whose centre is rock
// or water is impassable, and so is any step between two hexes that crosses rock
// or water; forest steps cost more. The graph and every route are pure
// functions of the map, so they are derived (cached outside the world) and
// every client finds the same roads.

import type { MapDef } from './api.ts';
import { Terrain } from './api.ts';
import { cellAt, isPassable } from './flowfield.ts';
import { clearPath } from './steering.ts';

export const HEX_SIZE = 30;
const SQ3 = Math.sqrt(3);
export const HEX_STEP = HEX_SIZE * SQ3;
const PLAIN_COST = 10;
const FOREST_COST = 17;
/** Axial neighbour offsets, in a fixed order: the tie-break for equal routes. */
const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];
const CACHE_LIMIT = 1024;

export interface HexGrid {
  q0: number;
  r0: number;
  cols: number;
  rows: number;
  cx: Float64Array;
  cy: Float64Array;
  /** Per hex: 0 impassable, else the cost of stepping into it. */
  cost: Uint8Array;
  /** Per hex: bit d set when the step toward neighbour d is open. */
  open: Uint8Array;
  // A* working memory, reused across searches.
  g: Int32Array;
  parent: Int32Array;
  stamp: Int32Array;
  closed: Int32Array;
  search: number;
  heap: Int32Array;
  heapF: Int32Array;
  heapH: Int32Array;
  routes: Map<number, Int32Array>;
}

const grids = new WeakMap<MapDef, HexGrid>();

function terrainAt(map: MapDef, x: number, y: number): number {
  const c = cellAt(map, x, y);
  return c < 0 ? Terrain.Void : map.terrain[c]!;
}

export function hexGrid(map: MapDef): HexGrid {
  let grid = grids.get(map);
  if (grid) return grid;
  const span = map.radius + HEX_STEP;
  const r0 = Math.floor(-span / (1.5 * HEX_SIZE)) - 1;
  const r1 = -r0;
  const q0 = Math.floor(-span / HEX_STEP - r1 / 2) - 1;
  const q1 = -q0;
  const cols = q1 - q0 + 1;
  const rows = r1 - r0 + 1;
  const n = cols * rows;
  grid = {
    q0, r0, cols, rows,
    cx: new Float64Array(n), cy: new Float64Array(n),
    cost: new Uint8Array(n), open: new Uint8Array(n),
    g: new Int32Array(n), parent: new Int32Array(n), stamp: new Int32Array(n), closed: new Int32Array(n), search: 0,
    heap: new Int32Array(n * 6 + 8), heapF: new Int32Array(n * 6 + 8), heapH: new Int32Array(n * 6 + 8),
    routes: new Map(),
  };
  for (let r = r0; r <= r1; r++) {
    for (let q = q0; q <= q1; q++) {
      const id = (r - r0) * cols + (q - q0);
      const x = HEX_SIZE * SQ3 * (q + r / 2);
      const y = HEX_SIZE * 1.5 * r;
      grid.cx[id] = x;
      grid.cy[id] = y;
      const t = terrainAt(map, x, y);
      if (!isPassable(t) || x * x + y * y > map.radius * map.radius) continue;
      grid.cost[id] = t === Terrain.Forest ? FOREST_COST : PLAIN_COST;
    }
  }
  for (let id = 0; id < n; id++) {
    if (grid.cost[id] === 0) continue;
    let bits = 0;
    for (let d = 0; d < 6; d++) {
      const m = neighbour(grid, id, d);
      if (m < 0 || grid.cost[m] === 0) continue;
      // The step between the centres must stay on open ground all the way.
      if (clearPath(map, grid.cx[id]!, grid.cy[id]!, grid.cx[m]!, grid.cy[m]!)) bits |= 1 << d;
    }
    grid.open[id] = bits;
  }
  grids.set(map, grid);
  return grid;
}

function neighbour(grid: HexGrid, id: number, d: number): number {
  const q = (id % grid.cols) + DQ[d]!;
  const r = Math.floor(id / grid.cols) + DR[d]!;
  if (q < 0 || r < 0 || q >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + q;
}

/** The hex containing (x, y), or -1 off the grid. */
export function hexAt(grid: HexGrid, x: number, y: number): number {
  const fq = ((SQ3 / 3) * x - y / 3) / HEX_SIZE;
  const fr = ((2 / 3) * y) / HEX_SIZE;
  const fs = -fq - fr;
  let q = Math.floor(fq + 0.5);
  let r = Math.floor(fr + 0.5);
  const s = Math.floor(fs + 0.5);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const col = q - grid.q0;
  const row = r - grid.r0;
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

/** The passable hex nearest (x, y): its own, or the closest open neighbour. */
function passableHex(grid: HexGrid, x: number, y: number): number {
  const h = hexAt(grid, x, y);
  if (h < 0) return -1;
  if (grid.cost[h]! > 0) return h;
  let best = -1;
  let bestD = Infinity;
  for (let d = 0; d < 6; d++) {
    const m = neighbour(grid, h, d);
    if (m < 0 || grid.cost[m] === 0) continue;
    const dx = grid.cx[m]! - x;
    const dy = grid.cy[m]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = m;
    }
  }
  return best;
}

function hexDistance(grid: HexGrid, a: number, b: number): number {
  const aq = (a % grid.cols) + grid.q0;
  const ar = Math.floor(a / grid.cols) + grid.r0;
  const bq = (b % grid.cols) + grid.q0;
  const br = Math.floor(b / grid.cols) + grid.r0;
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Min-heap ordered by f, then h, then hex id: a fixed tie-break. */
function less(grid: HexGrid, i: number, j: number): boolean {
  const fi = grid.heapF[i]!;
  const fj = grid.heapF[j]!;
  if (fi !== fj) return fi < fj;
  const hi = grid.heapH[i]!;
  const hj = grid.heapH[j]!;
  if (hi !== hj) return hi < hj;
  return grid.heap[i]! < grid.heap[j]!;
}

function swap(grid: HexGrid, i: number, j: number): void {
  let t = grid.heap[i]!;
  grid.heap[i] = grid.heap[j]!;
  grid.heap[j] = t;
  t = grid.heapF[i]!;
  grid.heapF[i] = grid.heapF[j]!;
  grid.heapF[j] = t;
  t = grid.heapH[i]!;
  grid.heapH[i] = grid.heapH[j]!;
  grid.heapH[j] = t;
}

/** A* from hex `start` to hex `goal`. Returns the hexes after `start`, ending at `goal`, or null. */
function astar(grid: HexGrid, start: number, goal: number): Int32Array | null {
  const stamp = ++grid.search;
  let size = 0;
  const pushHeap = (id: number, f: number, h: number) => {
    let i = size++;
    grid.heap[i] = id;
    grid.heapF[i] = f;
    grid.heapH[i] = h;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(grid, i, p)) break;
      swap(grid, i, p);
      i = p;
    }
  };
  grid.stamp[start] = stamp;
  grid.g[start] = 0;
  grid.parent[start] = -1;
  pushHeap(start, hexDistance(grid, start, goal) * PLAIN_COST, 0);
  while (size > 0) {
    const id = grid.heap[0]!;
    size--;
    if (size > 0) {
      grid.heap[0] = grid.heap[size]!;
      grid.heapF[0] = grid.heapF[size]!;
      grid.heapH[0] = grid.heapH[size]!;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < size && less(grid, a, m)) m = a;
        if (b < size && less(grid, b, m)) m = b;
        if (m === i) break;
        swap(grid, i, m);
        i = m;
      }
    }
    if (grid.closed[id] === stamp) continue;
    grid.closed[id] = stamp;
    if (id === goal) break;
    const bits = grid.open[id]!;
    for (let d = 0; d < 6; d++) {
      if ((bits & (1 << d)) === 0) continue;
      const m = neighbour(grid, id, d);
      if (grid.closed[m] === stamp) continue;
      const g = grid.g[id]! + grid.cost[m]!;
      if (grid.stamp[m] === stamp && grid.g[m]! <= g) continue;
      grid.stamp[m] = stamp;
      grid.g[m] = g;
      grid.parent[m] = id;
      const h = hexDistance(grid, m, goal) * PLAIN_COST;
      if (size >= grid.heap.length) return null;
      pushHeap(m, g + h, h);
    }
  }
  if (grid.closed[goal] !== stamp) return null;
  let n = 0;
  for (let id = goal; id !== start; id = grid.parent[id]!) n++;
  const path = new Int32Array(n);
  for (let id = goal, k = n - 1; id !== start; id = grid.parent[id]!, k--) path[k] = id;
  return path;
}

/**
 * The hex route from (x, y) to (gx, gy): hex ids after the start hex, ending at
 * the goal's. Empty when already there or when no route exists (the flow field
 * then steers). Cached per start and goal hex.
 */
export function hexRoute(map: MapDef, x: number, y: number, gx: number, gy: number): number[] {
  const grid = hexGrid(map);
  const start = passableHex(grid, x, y);
  const goal = passableHex(grid, gx, gy);
  if (start < 0 || goal < 0 || start === goal) return [];
  const key = start * grid.cols * grid.rows + goal;
  let path = grid.routes.get(key);
  if (!path) {
    path = astar(grid, start, goal) ?? new Int32Array(0);
    // The cache holds derived data only: clearing it never changes a route.
    if (grid.routes.size >= CACHE_LIMIT) grid.routes.clear();
    grid.routes.set(key, path);
  }
  const out = new Array<number>(path.length);
  for (let k = 0; k < path.length; k++) out[k] = path[k]!;
  return out;
}

export function hexCenterX(map: MapDef, id: number): number {
  return hexGrid(map).cx[id]!;
}

export function hexCenterY(map: MapDef, id: number): number {
  return hexGrid(map).cy[id]!;
}

export function hexPassable(map: MapDef, id: number): boolean {
  return hexGrid(map).cost[id]! > 0;
}
