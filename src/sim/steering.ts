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

/**
 * Per pair of kinds (u's kind * KINDS + v's kind): the separation radius, its square, and how much
 * u gives way to v. Each is computed with exactly the expression the scan used inline, so the
 * table holds the same doubles.
 */
const KINDS = STATS.length;
const SEP_RADIUS = new Float64Array(KINDS * KINDS);
const SEP_RADIUS2 = new Float64Array(KINDS * KINDS);
const SEP_GIVE = new Float64Array(KINDS * KINDS);
/** 1 where the two kinds jostle at all (fliers only jostle fliers). */
const SEP_MEET = new Uint8Array(KINDS * KINDS);
for (let a = 0; a < KINDS; a++) {
  for (let b = 0; b < KINDS; b++) {
    const sa = STATS[a]!;
    const sb = STATS[b]!;
    const radius = Math.max(SEPARATION_RADIUS, (sa.size + sb.size) * SIZE_SPACING);
    SEP_RADIUS[a * KINDS + b] = radius;
    SEP_RADIUS2[a * KINDS + b] = radius * radius;
    SEP_GIVE[a * KINDS + b] = (2 * sb.size) / (sa.size + sb.size);
    SEP_MEET[a * KINDS + b] = sa.flying === sb.flying ? 1 : 0;
  }
}

/** Pushes soldiers apart in proportion to their sizes; fliers only jostle other fliers. */
export function separation(out: Vec, units: readonly Unit[], hash: SpatialHash, i: number): void {
  const { ux, uy, uk, head, next, cols } = hash;
  const x0 = ux[i]!;
  const y0 = uy[i]!;
  const row = uk[i]! * KINDS;
  let px = 0;
  let py = 0;
  const bx = bucketX(hash, x0);
  const by = bucketY(hash, y0);
  const reach = STATS[uk[i]!]!.size > 9 ? 2 : 1;
  const xa = Math.max(0, bx - reach);
  const xb = Math.min(cols - 1, bx + reach);
  for (let y = Math.max(0, by - reach); y <= Math.min(hash.rows - 1, by + reach); y++) {
    for (let x = xa; x <= xb; x++) {
      for (let j = head[y * cols + x]!; j >= 0; j = next[j]!) {
        if (j === i) continue;
        const pair = row + uk[j]!;
        if (SEP_MEET[pair] === 0) continue;
        const dx = x0 - ux[j]!;
        const dy = y0 - uy[j]!;
        const d2 = dx * dx + dy * dy;
        if (d2 >= SEP_RADIUS2[pair]!) continue;
        if (d2 < 1e-6) {
          const u = units[i]!;
          const v = units[j]!;
          px += u.id < v.id ? 0.5 : -0.5;
          py += (u.id & 1) === 0 ? 0.3 : -0.3;
          continue;
        }
        const radius = SEP_RADIUS[pair]!;
        const d = Math.sqrt(d2);
        // Small soldiers give way to big ones more than the other way round.
        const w = ((radius - d) / (radius * d)) * SEP_GIVE[pair]!;
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

/** Whether a soldier could walk the straight line from (x0, y0) to (x1, y1), sampled every half cell. */
export function clearPath(map: MapDef, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.floor(Math.sqrt(dx * dx + dy * dy) / (map.navCell * 0.5)) + 1;
  for (let k = 1; k <= steps; k++) if (!passableAt(map, x0 + (dx * k) / steps, y0 + (dy * k) / steps)) return false;
  return true;
}

export function passableAt(map: MapDef, x: number, y: number): boolean {
  const c = cellAt(map, x, y);
  return c >= 0 && isPassable(map.terrain[c]!);
}
