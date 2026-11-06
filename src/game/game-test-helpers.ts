// Shared armies, work weeks and battle helpers for the game tests (split from game.test.ts so
// the battle-heavy suites run in parallel files).
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

export const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
export function army(n: number, over: Partial<ArmySpec> = {}): ArmySpec {
  return { name: 'a', faction: 'templar', hue: 0, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true, ...over };
}

/** A push of `code` lines with the usual seasoning. */
export function push(at: number, code: number): WorkEvent {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  lines[0] = code;
  lines[1] = Math.round(code * 0.3);
  lines[2] = Math.round(code * 0.08);
  lines[3] = Math.round(code * 0.04);
  lines[4] = Math.round(code * 0.03);
  lines[5] = Math.round(code * 0.25);
  return { at, delta: { lines, files: Math.ceil(code / 40), branches: Math.round(code * 0.2), functions: Math.round(code * 0.08), links: Math.round(code * 0.02), churn: 0, filler: 0 } };
}

export const WEEK = weekOf(Date.UTC(2026, 10, 3, 12), 0);

export function weekOfWork(perDay: number[]): ReturnType<typeof cityAt> {
  const events: WorkEvent[] = [];
  perDay.forEach((code, d) => {
    if (code <= 0) return;
    // Three pushes in office hours.
    for (let k = 0; k < 3; k++) events.push(push(WEEK.weekStart + d * DAY_MS + (10 + 3 * k) * 3_600_000, Math.round(code / 3)));
  });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [] });
}

export function cohortsAfter(events: WorkEvent[], won: boolean) {
  const first = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + DAY_MS, events, outcomes: [] });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [{ day: 0, won, dead: emptyCounts(), survivors: first.cohorts[0]! }] });
}

export const setupOf = (seed: number, a: ArmySpec, b: ArmySpec): BattleSetup => ({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [a, { ...b, hue: 200 }] });
/** An army of about `value` worth, split between classes by weight. */
export function valued(value: number, weights: Partial<Record<number, number>>, over: Partial<ArmySpec> = {}): ArmySpec {
  const counts = emptyCounts();
  let w = 0;
  for (const [k, v] of Object.entries(weights)) w += v! * STATS[Number(k)]!.value;
  for (const [k, v] of Object.entries(weights)) counts[Number(k)] = Math.round((value * v!) / w);
  return army(0, { counts, ...over });
}
export function only(cls: number, n: number, over: Partial<ArmySpec> = {}): ArmySpec {
  const counts = emptyCounts();
  counts[cls] = n;
  return army(0, { counts, commander: false, ...over });
}
export const deadOf = (b: Battle, team: number) => b.soldiers.filter((s) => s.team === team && s.state === State.Dead).length;
export const winsOf = (seeds: number, f: (seed: number) => 0 | 1): number => {
  let w = 0;
  for (let s = 1; s <= seeds; s++) if (f(s) === 0) w++;
  return w;
};
