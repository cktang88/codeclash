// Measures men standing inside each other: for tests and tools (the sim never calls it).
import { State, type Battle } from './battle.ts';

export interface Overlap {
  /** Per living man, his deepest overlap with anyone, as a share of the smaller radius (0 when clear). */
  depth: number[];
  /** The same counting only enemies, for each man who touches an enemy. */
  enemyDepth: number[];
  /** Counting only friends where both stand (neither is running), for each man who touches one. */
  friendDepth: number[];
  /** Counting only pairs where someone is running. */
  routDepth: number[];
  max: number;
  maxEnemy: number;
}

/** A sweep over x, fine for tests. */
export function overlapStats(b: Battle): Overlap {
  const men = b.soldiers.filter((s) => s.state === State.Fighting || s.state === State.Routing);
  const n = men.length;
  const order = men.map((_, i) => i).sort((a, c) => men[a]!.x - men[c]!.x || a - c);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const rs = new Float64Array(n);
  const ts = new Uint8Array(n);
  const ru = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const s = men[order[k]!]!;
    xs[k] = s.x;
    ys[k] = s.y;
    rs[k] = s.s.radius;
    ts[k] = s.team;
    ru[k] = s.state === State.Routing ? 1 : 0;
  }
  const deep = new Float64Array(n);
  const deepE = new Float64Array(n);
  const touchE = new Uint8Array(n);
  const deepF = new Float64Array(n);
  const touchF = new Uint8Array(n);
  const deepR = new Float64Array(n);
  const touchR = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx > 10) break;
      const dy = ys[j]! - ys[i]!;
      const m = rs[i]! + rs[j]!;
      const d2 = dx * dx + dy * dy;
      if (d2 >= m * m) continue;
      const v = (m - Math.sqrt(d2)) / Math.min(rs[i]!, rs[j]!);
      if (v > deep[i]!) deep[i] = v;
      if (v > deep[j]!) deep[j] = v;
      if (ts[i] !== ts[j]) {
        touchE[i] = touchE[j] = 1;
        if (v > deepE[i]!) deepE[i] = v;
        if (v > deepE[j]!) deepE[j] = v;
      } else if (!ru[i] && !ru[j]) {
        touchF[i] = touchF[j] = 1;
        if (v > deepF[i]!) deepF[i] = v;
        if (v > deepF[j]!) deepF[j] = v;
      }
      if (ru[i] || ru[j]) {
        touchR[i] = touchR[j] = 1;
        if (v > deepR[i]!) deepR[i] = v;
        if (v > deepR[j]!) deepR[j] = v;
      }
    }
  }
  const depth = Array.from(deep);
  const enemyDepth: number[] = [];
  const friendDepth: number[] = [];
  const routDepth: number[] = [];
  for (let i = 0; i < n; i++) {
    if (touchE[i]) enemyDepth.push(deepE[i]!);
    if (touchF[i]) friendDepth.push(deepF[i]!);
    if (touchR[i]) routDepth.push(deepR[i]!);
  }
  let max = 0;
  let maxEnemy = 0;
  for (const v of depth) if (v > max) max = v;
  for (const v of enemyDepth) if (v > maxEnemy) maxEnemy = v;
  return { depth, enemyDepth, friendDepth, routDepth, max, maxEnemy };
}

/** The share of `a` at or below which `p` of it lies. */
export function percentile(a: readonly number[], p: number): number {
  if (a.length === 0) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
}

/** Two friendly formed blocks passing through each other (see `blockCrossings`). */
export interface Crossing {
  a: number;
  b: number;
  /** Men of each standing inside the other's footprint. */
  inA: number;
  inB: number;
  /** The larger of the shares of each block's men standing in the other. */
  share: number;
}

/**
 * Formed blocks of one side standing in each other: for each pair of friendly blocks, neither
 * routed, the men of one standing inside the other's footprint (the rectangle its places cover,
 * from its anchor, facing, width and depth, less a man's breadth at the edges). Skirmishers and
 * blocks passing through their own line on purpose (`slip`, falling back as skirmishers) are left
 * out: that is drill; so are blocks chasing, a loose crowd. A pair counts when at least `min` men of either stand in the other.
 */
export function blockCrossings(b: Battle, min = 4): Crossing[] {
  const regs = b.regiments.filter((r) => r.alive >= 6 && !r.routed && r.role !== 'skirmish' && r.role !== 'siege' && !r.slip && r.mode !== 'skirmish' && r.mode !== 'pursue');
  const out: Crossing[] = [];
  const inside = (r: (typeof regs)[number], x: number, y: number): boolean => {
    const dx = x - r.ax;
    const dy = y - r.ay;
    const lat = -dx * r.fy + dy * r.fx;
    const fwd = dx * r.fx + dy * r.fy;
    const m = r.rad * 1.5;
    return Math.abs(lat) < r.width / 2 - m && fwd < -m && fwd > -r.depth + m;
  };
  for (let i = 0; i < regs.length; i++) {
    const p = regs[i]!;
    for (let j = i + 1; j < regs.length; j++) {
      const q = regs[j]!;
      if (p.team !== q.team) continue;
      const dx = p.cx - q.cx;
      const dy = p.cy - q.cy;
      const rr = p.radius + q.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      let inA = 0;
      let inB = 0;
      for (const id of q.members) {
        const s = b.soldiers[id]!;
        if (s.state === State.Fighting && inside(p, s.x, s.y)) inA++;
      }
      for (const id of p.members) {
        const s = b.soldiers[id]!;
        if (s.state === State.Fighting && inside(q, s.x, s.y)) inB++;
      }
      if (inA >= min || inB >= min) out.push({ a: p.id, b: q.id, inA, inB, share: Math.max(inA / q.alive, inB / p.alive) });
    }
  }
  return out;
}
