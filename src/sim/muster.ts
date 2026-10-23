import { Cat, Kind, KIND_COUNT, type Lines } from './api.ts';
import { PLATOON_MAX, STATS } from './stats.ts';

// Per category: coefficient on sqrt(lines), the line count that guarantees one
// soldier, and the per-platoon cap. Indexed by Cat; Blank raises nothing.
const COEF = [0.6, 0.7, 0.6, 0.45, 0.4, 0.45, 0.15, 0.12, 0];
const THRESHOLD = [1, 1, 3, 5, 5, 10, 50, 50, Infinity];
const CAP = [12, 10, 8, 6, 6, 8, 6, 4, 0];

export const HOURLY_FREE_PUSHES = 3;
export const DAILY_FREE_PUSHES = 12;

export function isBalanced(lines: Lines): boolean {
  return (lines[Cat.Code] ?? 0) >= 20 && (lines[Cat.Test] ?? 0) >= 1 && (lines[Cat.Comment] ?? 0) + (lines[Cat.Docs] ?? 0) >= 1;
}

/**
 * Soldiers raised by one push, by kind. `pushesLastHour` and `pushesToday`
 * count this player's earlier pushes, excluding this one.
 */
export function musterCounts(lines: Lines, pushesLastHour: number, pushesToday: number): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  let factor = 1;
  if (pushesToday >= DAILY_FREE_PUSHES) factor = 1 / 3;
  else if (pushesLastHour >= HOURLY_FREE_PUSHES) factor = 0.5;
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    const cat = STATS[kind]!.raisedBy;
    if (cat < 0) continue;
    const n = Math.max(0, lines[cat] ?? 0);
    let c = Math.floor(COEF[cat]! * Math.sqrt(n));
    if (c === 0 && n >= THRESHOLD[cat]!) c = 1;
    c = Math.min(CAP[cat]!, c);
    counts[kind] = Math.floor(c * factor);
  }
  if (isBalanced(lines) && factor === 1) counts[Kind.Champion] = 1;
  let total = 0;
  for (const c of counts) total += c;
  // Trim the largest groups first until the platoon fits.
  while (total > PLATOON_MAX) {
    let big = 0;
    for (let k = 1; k < KIND_COUNT; k++) if (counts[k]! > counts[big]!) big = k;
    counts[big]!--;
    total--;
  }
  if (total === 0) counts[Kind.Legionary] = 1;
  return counts;
}
