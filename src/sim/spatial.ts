import type { MapDef, Unit } from './api.ts';

/**
 * Buckets soldiers by nav cell. It also keeps a packed copy of each soldier's position, owner and
 * kind, indexed like world.units, so neighbour scans read flat arrays instead of chasing objects.
 * The copy is exact (the same doubles), so results are bit-identical to reading the units.
 */
export interface SpatialHash {
  cols: number;
  rows: number;
  cell: number;
  originX: number;
  originY: number;
  head: Int32Array;
  next: Int32Array;
  ux: Float64Array;
  uy: Float64Array;
  up: Int32Array;
  uk: Int32Array;
  /** Buckets made non-empty by the last rebuild, so the next one clears only those. */
  touched: Int32Array;
  touchedN: number;
}

export function createSpatialHash(map: MapDef, capacity: number): SpatialHash {
  return {
    cols: map.navCols,
    rows: map.navRows,
    cell: map.navCell,
    originX: map.originX,
    originY: map.originY,
    head: new Int32Array(map.navCols * map.navRows).fill(-1),
    next: new Int32Array(capacity),
    ux: new Float64Array(capacity),
    uy: new Float64Array(capacity),
    up: new Int32Array(capacity),
    uk: new Int32Array(capacity),
    touched: new Int32Array(capacity),
    touchedN: 0,
  };
}

export function rebuildSpatialHash(hash: SpatialHash, units: readonly Unit[]): void {
  // An idle or thinly held field touches a handful of buckets: clear those, not the whole grid.
  for (let k = 0; k < hash.touchedN; k++) hash.head[hash.touched[k]!] = -1;
  hash.touchedN = 0;
  if (hash.next.length < units.length) {
    const n = units.length * 2;
    hash.next = new Int32Array(n);
    hash.ux = new Float64Array(n);
    hash.uy = new Float64Array(n);
    hash.up = new Int32Array(n);
    hash.uk = new Int32Array(n);
    hash.touched = new Int32Array(n);
  }
  const { ux, uy, up, uk, next, head, touched } = hash;
  let touchedN = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i]!;
    ux[i] = u.x;
    uy[i] = u.y;
    up[i] = u.p;
    uk[i] = u.kind;
    const c = bucketOf(hash, u.x, u.y);
    const h = head[c]!;
    if (h < 0) touched[touchedN++] = c;
    next[i] = h;
    head[c] = i;
  }
  hash.touchedN = touchedN;
}

export function bucketX(hash: SpatialHash, x: number): number {
  return Math.min(hash.cols - 1, Math.max(0, Math.floor((x - hash.originX) / hash.cell)));
}

export function bucketY(hash: SpatialHash, y: number): number {
  return Math.min(hash.rows - 1, Math.max(0, Math.floor((y - hash.originY) / hash.cell)));
}

function bucketOf(hash: SpatialHash, x: number, y: number): number {
  return bucketY(hash, y) * hash.cols + bucketX(hash, x);
}
