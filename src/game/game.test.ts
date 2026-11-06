import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

import { MIX, army, push, WEEK, weekOfWork, cohortsAfter, setupOf, valued, only, deadOf, winsOf } from './game-test-helpers.ts';

// The battle suites are in game-battle, game-matchups, game-command, game-flanks and game-morale.test.ts.

describe('the week', () => {
  it('starts on Monday at the reset hour', () => {
    const w = weekOf(Date.UTC(2026, 10, 4, 3), 6);
    expect(new Date(w.weekStart).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(w.day).toBe(1);
  });
});

describe('the city', () => {
  it('levels take four times the work for twice the level', () => {
    expect(levelOf(100)).toBe(1);
    expect(levelOf(400)).toBe(2);
    expect(levelOf(399)).toBe(1);
    expect(levelOf(1e9)).toBe(20);
  });

  it('an empty week trains nobody', () => {
    const c = weekOfWork([0, 0, 0, 0, 0, 0, 0]);
    expect(total(c.produced)).toBe(0);
    expect(c.cohorts).toHaveLength(7);
  });

  it('more work raises a bigger army, with diminishing returns', () => {
    const small = total(weekOfWork([300, 300, 300, 300, 300, 300, 300]).produced);
    const big = total(weekOfWork([1200, 1200, 1200, 1200, 1200, 1200, 1200]).produced);
    expect(big).toBeGreaterThan(small * 2);
    expect(big).toBeLessThan(small * 4);
  });

  it('steady work beats the same work crammed into one day', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    const lateCram = total(weekOfWork([0, 0, 0, 0, 0, 0, 3500]).produced);
    const earlyCram = total(weekOfWork([3500, 0, 0, 0, 0, 0, 0]).produced);
    expect(steady).toBeGreaterThan(lateCram);
    expect(steady).toBeGreaterThan(earlyCram);
  });

  it('each day’s army is only what was trained since the last battle', () => {
    const c = weekOfWork([600, 600, 600, 600, 600, 600, 600]);
    expect(c.cohorts.map(total).reduce((a, b) => a + b, 0)).toBe(total(c.produced));
  });

  it('a day without a push musters only part of its garrison, and the streak speeds training', () => {
    const c = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + 1.5 * DAY_MS, events: [push(WEEK.weekStart + 3_600_000, 800)], outcomes: [] });
    expect(c.idle).toBe(true);
    expect(c.waiting).toBeGreaterThan(0);
    const steady = weekOfWork([500, 500, 500, 500, 500, 500, 500]);
    expect(steady.streak).toBe(7);
    expect(steady.granaryBonus).toBeCloseTo(0.42);
  });

  it('days before the first push do not spend the grace day, and misses never wipe out a streak', () => {
    // Joins Wednesday, then works every day but Saturday: the grace covers Saturday.
    expect(weekOfWork([0, 0, 500, 500, 500, 0, 500]).streak).toBe(4);
    // Four days on, then three misses: grace, then two halvings (4 → 2 → 1), never 0.
    expect(weekOfWork([500, 500, 500, 500, 0, 0, 0]).streak).toBe(1);
  });

  it('volume wins, with a knee: twice the work is worth well over, four times well under, twice and three times the army', () => {
    const base = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    const x2 = total(weekOfWork([1000, 1000, 1000, 1000, 1000, 1000, 1000]).produced);
    const x4 = total(weekOfWork([2000, 2000, 2000, 2000, 2000, 2000, 2000]).produced);
    expect(x2 / base).toBeGreaterThan(1.4);
    expect(x4 / base).toBeLessThan(2.3);
    expect(x4).toBeGreaterThan(x2);
  });

  it('cramming the week into one day is worth well under half of steady work', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    expect(total(weekOfWork([3500, 0, 0, 0, 0, 0, 0]).produced) / steady).toBeLessThan(0.5);
    expect(total(weekOfWork([1000, 0, 1000, 0, 1000, 0, 500]).produced) / steady).toBeLessThan(0.85);
  });


  it('the Hospital brings back part of the dead for the Grand Battle', () => {
    const events = [push(WEEK.weekStart + 3_600_000, 900)];
    const none = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [] });
    const dead = none.cohorts[0]!.map((n) => Math.floor(n / 2));
    const hurt = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [{ day: 0, won: false, dead, survivors: emptyCounts() }] });
    const g = total(grandArmy(hurt).counts);
    expect(g).toBeLessThan(total(none.produced));
    expect(g).toBeGreaterThan(total(none.produced) - total(dead));
  });

  it('a daily win lifts production for the rest of the week and makes veterans', () => {
    const events = [push(WEEK.weekStart + 3_600_000, 900), push(WEEK.weekStart + DAY_MS + 3_600_000, 900)];
    const c0 = cohortsAfter(events, false);
    const c1 = cohortsAfter(events, true);
    expect(total(c1.produced)).toBeGreaterThan(total(c0.produced));
    expect(total(c1.veterans)).toBeGreaterThan(0);
  });

  it('pushing and undoing the same work over and over earns nothing extra', () => {
    const undo = (e: WorkEvent): WorkEvent => ({
      at: e.at + 60_000,
      delta: { ...e.delta, lines: e.delta.lines.map((n) => -n), files: -e.delta.files, branches: -e.delta.branches, functions: -(e.delta.functions ?? 0), links: -(e.delta.links ?? 0) },
    });
    const t0 = WEEK.weekStart + 3_600_000;
    const now = t0 + 2 * 3_600_000;
    const once = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now, events: [push(t0, 900)], outcomes: [] });
    const events: WorkEvent[] = [];
    for (let k = 0; k < 20; k++) events.push(push(t0, 900), undo(push(t0, 900)));
    events.push(push(t0, 900));
    // All in the same minute-long window: same levels, so any difference is farmed.
    events.forEach((e, k) => (e.at = t0 + k));
    const farmed = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now, events, outcomes: [] });
    expect(farmed.buildings.map((b) => b.xp)).toEqual(once.buildings.map((b) => b.xp));
    expect(total(farmed.today)).toBeLessThanOrEqual(total(once.today) + 1);
    expect(farmed.todayLevy).toBe(once.todayLevy);
  });

  it('bots work a person’s week, deterministically', () => {
    const a = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    const b = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('every sparring bot is a fair match for a steady human (0.3x to 2.5x the army)', () => {
    const steady = total(weekOfWork([500, 500, 500, 500, 500, 500, 500]).produced);
    for (let bot = 0; bot < 7; bot++) {
      const c = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events: botWork(42, bot, WEEK.weekStart, DAY_MS, WEEK.weekEnd), outcomes: [] });
      const r = total(c.produced) / steady;
      expect(r, `bot ${bot}`).toBeGreaterThan(0.3);
      expect(r, `bot ${bot}`).toBeLessThan(2.5);
    }
  });
});

describe('pairings', () => {
  it('pairs like records and avoids rematches, with brigands for the odd one out', () => {
    const pairs = pairDaily([
      { id: 1, points: 2, produced: 10, met: [2] },
      { id: 2, points: 2, produced: 9, met: [1] },
      { id: 3, points: 1, produced: 8, met: [] },
      { id: 4, points: 0, produced: 7, met: [] },
      { id: 5, points: 0, produced: 6, met: [] },
    ], 1);
    expect(pairs).toHaveLength(3);
    const flat = pairs.flat();
    expect(flat.filter((x) => x === null)).toHaveLength(1);
    expect(pairs.some(([a, b]) => (a === 1 && b === 2) || (a === 2 && b === 1))).toBe(false);
    expect(pairGrand([5, 3, 1])).toEqual([[5, 3], [1, null]]);
  });

  it('avoids a rematch that greedy pairing from the top would force', () => {
    // Greedy pairs 1-2 and is left with 3-4, who have met; 1-3 and 2-4 are both fresh.
    const players = [
      { id: 1, points: 6, produced: 10, met: [] },
      { id: 2, points: 6, produced: 9, met: [] },
      { id: 3, points: 0, produced: 8, met: [4] },
      { id: 4, points: 0, produced: 7, met: [3] },
    ];
    const pairs = pairDaily(players, 1);
    expect(pairs).toHaveLength(2);
    expect(pairs.some(([a, b]) => (a === 3 && b === 4) || (a === 4 && b === 3))).toBe(false);
    // Odd count: the lowest who can be left out meets the brigands, and nobody meets twice.
    const odd = pairDaily([...players, { id: 5, points: 0, produced: 1, met: [] }], 2);
    expect(odd.filter(([, b]) => b === null)).toHaveLength(1);
    expect(odd.some(([a, b]) => (a === 3 && b === 4) || (a === 4 && b === 3))).toBe(false);
    expect(new Set(odd.flat().filter((x) => x !== null)).size).toBe(5);
  });

  it('a loser who lost no one but killed some of the enemy fought honourably', () => {
    const side = (dead: number) => ({ start: emptyCounts(), dead: [dead, 0, 0, 0, 0, 0, 0, 0, 0, 0], fled: emptyCounts(), alive: emptyCounts(), kills: 0, commanderFell: false });
    const r = (own: number, theirs: number) => ({ winner: 1 as const, reason: 'rout' as const, ticks: 100, scale: 1, sides: [side(own), side(theirs)] as [ReturnType<typeof side>, ReturnType<typeof side>] });
    expect(honourable(r(0, 30), 0)).toBe(true);
    expect(honourable(r(0, 0), 0)).toBe(false);
    expect(honourable(r(50, 30), 0)).toBe(true);
    expect(honourable(r(50, 29), 0)).toBe(false);
  });
});

describe('replay versions', () => {
  it('refuses a setup recorded under another version of the rules', async () => {
    const { BattleVersionError } = await import('./battle.ts');
    expect(() => new Battle({ version: BATTLE_VERSION - 1, seed: 1, kind: 'daily', armies: [army(50), army(50)] })).toThrow(BattleVersionError);
  });
});
