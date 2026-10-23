import { Cat, Kind, KIND_COUNT, type Lines } from './api.ts';
import { PLATOON_MAX, STATS } from './stats.ts';

// Per category: coefficient on sqrt(lines), the line count that guarantees one
// soldier, the per-platoon cap, and the line count at which soldiers start to
// be promoted to that category's elite. Indexed by Cat; Blank raises nothing.
const COEF = [0.6, 0.7, 0.6, 0.45, 0.4, 0.45, 0.15, 0.12, 0];
const THRESHOLD = [1, 1, 3, 5, 5, 10, 50, 50, Infinity];
const CAP = [12, 10, 8, 6, 6, 8, 6, 4, 0];
const ELITE = [120, 60, 30, 60, 60, 80, 5000, 4000, Infinity];
/** Base soldiers given up for one elite. */
export const PROMOTION = 3;

export const HOURLY_FREE_PUSHES = 3;
export const DAILY_FREE_PUSHES = 12;

const FIX = /\b(fix(e[sd])?|bug|hotfix|patch)\b/i;

const BASE_OF: number[] = [];
const ELITE_OF: number[] = [];
for (let k = 0; k < KIND_COUNT; k++) {
  const s = STATS[k]!;
  if (s.raisedBy < 0) continue;
  if (s.tier === 'base') BASE_OF[s.raisedBy] = k;
  if (s.tier === 'elite') ELITE_OF[s.raisedBy] = k;
}

const at = (lines: Lines, c: number) => Math.max(0, lines[c] ?? 0);

export function isBalanced(lines: Lines): boolean {
  return at(lines, Cat.Code) >= 20 && at(lines, Cat.Test) >= 1 && at(lines, Cat.Comment) + at(lines, Cat.Docs) >= 1;
}

/** A push worthy of a Dragon: large, tested, and explained. */
export function isLegendary(lines: Lines): boolean {
  return isBalanced(lines) && at(lines, Cat.Code) >= 150 && at(lines, Cat.Test) >= 50 && at(lines, Cat.Comment) + at(lines, Cat.Docs) >= 30;
}

export function isFix(msg: string): boolean {
  return FIX.test(msg);
}

export function slotsOf(counts: readonly number[]): number {
  let n = 0;
  for (let k = 0; k < KIND_COUNT; k++) n += (counts[k] ?? 0) * STATS[k]!.slots;
  return n;
}

/**
 * Soldiers raised by one push, by kind. `pushesLastHour` and `pushesToday`
 * count this player's earlier pushes, excluding this one.
 */
export function musterCounts(lines: Lines, pushesLastHour: number, pushesToday: number, msg = ''): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  let factor = 1;
  if (pushesToday >= DAILY_FREE_PUSHES) factor = 1 / 3;
  else if (pushesLastHour >= HOURLY_FREE_PUSHES) factor = 0.5;
  for (let cat = 0; cat < Cat.Blank; cat++) {
    const n = at(lines, cat);
    let c = Math.floor(COEF[cat]! * Math.sqrt(n));
    if (c === 0 && n >= THRESHOLD[cat]!) c = 1;
    c = Math.floor(Math.min(CAP[cat]!, c) * factor);
    let elite = 0;
    if (n >= ELITE[cat]!) {
      elite = Math.floor(c / PROMOTION);
      c -= elite * PROMOTION;
    }
    counts[BASE_OF[cat]!] = c;
    counts[ELITE_OF[cat]!] = elite;
  }
  const code = at(lines, Cat.Code);
  if (code >= 30 && at(lines, Cat.Test) === 0 && at(lines, Cat.Comment) === 0) {
    const berserk = Math.floor(counts[Kind.Footman]! / 2);
    counts[Kind.Footman]! -= berserk;
    counts[Kind.Berserker] = berserk;
  }
  if (isFix(msg)) counts[Kind.Cleric] = at(lines, Cat.Removed) >= 40 ? 2 : 1;
  if (factor === 1 && isBalanced(lines)) counts[isLegendary(lines) ? Kind.Dragon : Kind.Champion] = 1;

  // Trim the cheapest soldiers first until the platoon fits; heroes stay.
  let slots = slotsOf(counts);
  while (slots > PLATOON_MAX) {
    let cheap = -1;
    for (let k = 0; k < KIND_COUNT; k++) {
      if (counts[k] === 0 || k === Kind.Champion || k === Kind.Dragon) continue;
      if (cheap < 0 || STATS[k]!.value < STATS[cheap]!.value || (STATS[k]!.value === STATS[cheap]!.value && counts[k]! > counts[cheap]!)) cheap = k;
    }
    if (cheap < 0) break;
    counts[cheap]!--;
    slots -= STATS[cheap]!.slots;
  }
  if (slots === 0) counts[Kind.Footman] = 1;
  return counts;
}
