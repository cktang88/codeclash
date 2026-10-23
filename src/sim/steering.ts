import type { MapDef, Unit } from './api.ts';
import { cellAt, cellCenterX, cellCenterY, isPassable, type FlowField } from './flowfield.ts';
import { bucketX, bucketY, type SpatialHash } from './spatial.ts';
import { STATS } from './stats.ts';

export interface Vec {
  x: number;
  y: number;
}

const SEPARATION_RADIUS = 10;
const SEPARATION_GAIN = 1.5;
const SIZE_SPACING = 0.85;
const MAX_PUSH_FACTOR = 1.4;
const DEADBAND2 = 0.25 * 0.25;

export function towards(out: Vec, fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-9) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = dx / d;
    out.y = dy / d;
  }
  return d;
}

export function flowDirection(out: Vec, map: MapDef, field: FlowField, x: number, y: number, goalX: number, goalY: number): void {
  const c = cellAt(map, x, y);
  if (c >= 0 && field.cost[c]! < 0) {
    // Off the field (rock, water, or a cut-off pocket): step to the cheapest neighbor on it.
    const step = escapeCell(map, field, c);
    if (step >= 0) towards(out, x, y, cellCenterX(map, step), cellCenterY(map, step));
    else towards(out, x, y, goalX, goalY);
    return;
  }
  const n1 = c < 0 ? -1 : field.next[c]!;
  if (n1 < 0) {
    towards(out, x, y, goalX, goalY);
    return;
  }
  const n2 = field.next[n1]!;
  const aim = n2 >= 0 ? n2 : n1;
  towards(out, x, y, cellCenterX(map, aim), cellCenterY(map, aim));
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

/** The neighboring cell with the lowest path cost, or -1 if none is on the field. */
function escapeCell(map: MapDef, field: FlowField, c: number): number {
  const cx = c % map.navCols;
  const cy = (c - cx) / map.navCols;
  let best = -1;
  for (let k = 0; k < 8; k++) {
    const nx = cx + NX[k]!;
    const ny = cy + NY[k]!;
    if (nx < 0 || ny < 0 || nx >= map.navCols || ny >= map.navRows) continue;
    const n = ny * map.navCols + nx;
    const cost = field.cost[n]!;
    if (cost >= 0 && (best < 0 || cost < field.cost[best]!)) best = n;
  }
  return best;
}

/** Pushes soldiers apart in proportion to their sizes; fliers only jostle other fliers. */
export function separation(out: Vec, units: readonly Unit[], hash: SpatialHash, i: number): void {
  const u = units[i]!;
  const su = STATS[u.kind]!;
  let px = 0;
  let py = 0;
  const bx = bucketX(hash, u.x);
  const by = bucketY(hash, u.y);
  const reach = su.size > 9 ? 2 : 1;
  for (let y = Math.max(0, by - reach); y <= Math.min(hash.rows - 1, by + reach); y++) {
    for (let x = Math.max(0, bx - reach); x <= Math.min(hash.cols - 1, bx + reach); x++) {
      for (let j = hash.head[y * hash.cols + x]!; j >= 0; j = hash.next[j]!) {
        if (j === i) continue;
        const v = units[j]!;
        const sv = STATS[v.kind]!;
        if (sv.flying !== su.flying) continue;
        const radius = Math.max(SEPARATION_RADIUS, (su.size + sv.size) * SIZE_SPACING);
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) continue;
        if (d2 < 1e-6) {
          px += u.id < v.id ? 0.5 : -0.5;
          py += (u.id & 1) === 0 ? 0.3 : -0.3;
          continue;
        }
        const d = Math.sqrt(d2);
        // Small soldiers give way to big ones more than the other way round.
        const give = (2 * sv.size) / (su.size + sv.size);
        const w = ((radius - d) / (radius * d)) * give;
        px += dx * w;
        py += dy * w;
      }
    }
  }
  out.x = px * SEPARATION_GAIN;
  out.y = py * SEPARATION_GAIN;
}

/** Moves a flier freely, kept inside the map's disc. */
export function flyMove(out: Vec, map: MapDef, x: number, y: number, vx: number, vy: number, speed: number): void {
  const max = speed * MAX_PUSH_FACTOR;
  const m2 = vx * vx + vy * vy;
  if (m2 > max * max) {
    const k = max / Math.sqrt(m2);
    vx *= k;
    vy *= k;
  }
  let nx = x + vx;
  let ny = y + vy;
  const limit = map.radius * 0.97;
  const r2 = nx * nx + ny * ny;
  if (r2 > limit * limit) {
    const k = limit / Math.sqrt(r2);
    nx *= k;
    ny *= k;
  }
  out.x = nx;
  out.y = ny;
}

/** `deadband2`: squared step below which a soldier stands still rather than jitter; banners pass 0. */
export function resolveMove(out: Vec, map: MapDef, x: number, y: number, vx: number, vy: number, speed: number, deadband2 = DEADBAND2): void {
  const max = speed * MAX_PUSH_FACTOR;
  const m2 = vx * vx + vy * vy;
  if (m2 < deadband2 || m2 === 0) {
    out.x = x;
    out.y = y;
    return;
  }
  if (m2 > max * max) {
    const k = max / Math.sqrt(m2);
    vx *= k;
    vy *= k;
  }
  if (passableAt(map, x + vx, y + vy)) {
    out.x = x + vx;
    out.y = y + vy;
  } else if (passableAt(map, x + vx, y)) {
    out.x = x + vx;
    out.y = y;
  } else if (passableAt(map, x, y + vy)) {
    out.x = x;
    out.y = y + vy;
  } else {
    out.x = x;
    out.y = y;
  }
}

export function passableAt(map: MapDef, x: number, y: number): boolean {
  const c = cellAt(map, x, y);
  return c >= 0 && isPassable(map.terrain[c]!);
}
