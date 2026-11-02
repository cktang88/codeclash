// The week: seven daily battles and the Grand Battle, pairings and standings.

import { BATTLE_VERSION, type ArmySpec, type BattleResult, type BattleSetup } from './battle.ts';
import { DAYS_PER_WEEK } from './city.ts';
import { mixSeed, Rng } from './rng.ts';
import { emptyCounts, total, U, UNIT_COUNT, type Counts } from './units.ts';

export const DAY_MS = 86_400_000;
/** 1970-01-05 was a Monday: weeks start on Mondays at the league's reset hour (UTC). */
const MONDAY_EPOCH = 4 * DAY_MS;

/** Standing points for a daily win and for winning the Grand Battle. */
export const DAILY_POINTS = 1;
export const GRAND_POINTS = 3;

export interface WeekClock {
  weekStart: number;
  weekEnd: number;
  dayMs: number;
  /** 0..6 */
  day: number;
}

/**
 * The week `now` falls in. With real days a week starts Monday at `resetHour` UTC; with a test
 * cycle (`dayMs` shorter than a day) weeks are seven cycles long, counted from the epoch.
 */
export function weekOf(now: number, resetHour: number, dayMs = DAY_MS): WeekClock {
  const week = DAYS_PER_WEEK * dayMs;
  const origin = dayMs === DAY_MS ? MONDAY_EPOCH + resetHour * 3_600_000 : 0;
  const weekStart = origin + Math.floor((now - origin) / week) * week;
  return { weekStart, weekEnd: weekStart + week, dayMs, day: Math.min(DAYS_PER_WEEK - 1, Math.floor((now - weekStart) / dayMs)) };
}

/** When daily battle `day` (0..6) is fought; the Grand Battle follows the last one. */
export function battleAt(weekStart: number, day: number, dayMs: number): number {
  return weekStart + (day + 1) * dayMs;
}

export interface Contender {
  id: number;
  points: number;
  /** Soldiers trained so far this week: the tiebreak. */
  produced: number;
  /** Opponents already met this week. */
  met: readonly number[];
}

/**
 * Swiss pairing: players with like records meet, and no one meets the same opponent twice while
 * someone new is left. Returns pairs; a lone player is paired with null (brigands).
 */
export function pairDaily(players: readonly Contender[], seed: number): [number, number | null][] {
  const rng = new Rng(seed);
  // Shuffle first so ties break differently each day, then sort by record.
  const list = players.map((p) => ({ p, r: rng.next() }));
  list.sort((a, b) => b.p.points - a.p.points || b.p.produced - a.p.produced || a.r - b.r);
  const left = list.map((x) => x.p);
  const pairs: [number, number | null][] = [];
  while (left.length > 1) {
    const a = left.shift()!;
    let j = left.findIndex((b) => !a.met.includes(b.id));
    if (j < 0) j = 0;
    const b = left.splice(j, 1)[0]!;
    pairs.push([a.id, b.id]);
  }
  if (left.length === 1) pairs.push([left[0]!.id, null]);
  return pairs;
}

/** The Grand Battle: first against second, third against fourth, and so on. */
export function pairGrand(ranked: readonly number[]): [number, number | null][] {
  const pairs: [number, number | null][] = [];
  for (let i = 0; i < ranked.length; i += 2) pairs.push([ranked[i]!, ranked[i + 1] ?? null]);
  return pairs;
}

export interface Standing {
  id: number;
  points: number;
  wins: number;
  losses: number;
  produced: number;
  grand: 'won' | 'lost' | null;
}

export function rank(rows: readonly Standing[]): Standing[] {
  return rows.slice().sort((a, b) => b.points - a.points || b.produced - a.produced || a.id - b.id);
}

/**
 * Brigands: a warband that fights whoever is left without an opponent. About as strong as the
 * player's own army, mostly foot.
 */
export function brigands(of: ArmySpec, seed: number): ArmySpec {
  const rng = new Rng(seed);
  const n = Math.max(20, Math.round(total(of.counts) * (0.8 + rng.next() * 0.25)));
  const mix: Partial<Record<number, number>> = {
    [U.HeavyInfantry]: 0.14, [U.Spearmen]: 0.3, [U.Skirmishers]: 0.16, [U.Archers]: 0.2, [U.LightCavalry]: 0.12, [U.HorseArchers]: 0.08,
  };
  const counts = emptyCounts();
  for (let c = 0; c < UNIT_COUNT; c++) counts[c] = Math.round(n * (mix[c] ?? 0));
  return { name: 'Brigands', faction: of.faction, hue: 30, counts, veterans: emptyCounts(), moraleBonus: -5, pavise: 0, stakes: false, commander: false };
}

export function battleSetup(seed: number, kind: 'daily' | 'grand', a: ArmySpec, b: ArmySpec): BattleSetup {
  return { version: BATTLE_VERSION, seed, kind, armies: [a, b] };
}

export function battleSeed(leagueSeed: number, weekStart: number, day: number, a: number, b: number, grand: boolean): number {
  return mixSeed(leagueSeed, Math.floor(weekStart / 60_000), day, a, b, grand ? 1 : 0);
}

/** A battle neither side could fight, or only one: decided without a fight. */
export function walkover(a: Counts, b: Counts): 0 | 1 | null {
  const na = total(a);
  const nb = total(b);
  if (na > 0 && nb > 0) return null;
  return na >= nb ? 0 : 1;
}

/** The result of a walkover: nobody fought, so nobody fell. */
export function walkoverResult(winner: 0 | 1, a: Counts, b: Counts): BattleResult {
  const side = (c: Counts) => ({ start: c.slice(), dead: emptyCounts(), fled: emptyCounts(), alive: c.slice(), kills: 0, commanderFell: false });
  return { winner, reason: 'rout', ticks: 0, scale: 1, sides: [side(a), side(b)] };
}
