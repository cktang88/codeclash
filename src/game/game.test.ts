import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, fight, type ArmySpec } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, total, UNIT_COUNT } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(n: number, over: Partial<ArmySpec> = {}): ArmySpec {
  return { name: 'a', faction: 'templar', hue: 0, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true, ...over };
}

/** A push of `code` lines with the usual seasoning. */
function push(at: number, code: number): WorkEvent {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  lines[0] = code;
  lines[1] = Math.round(code * 0.3);
  lines[2] = Math.round(code * 0.08);
  lines[3] = Math.round(code * 0.04);
  lines[4] = Math.round(code * 0.03);
  lines[5] = Math.round(code * 0.25);
  return { at, delta: { lines, files: Math.ceil(code / 40), branches: Math.round(code * 0.2), functions: Math.round(code * 0.08), links: Math.round(code * 0.02), churn: 0, filler: 0 } };
}

const WEEK = weekOf(Date.UTC(2026, 10, 3, 12), 0);

function weekOfWork(perDay: number[]): ReturnType<typeof cityAt> {
  const events: WorkEvent[] = [];
  perDay.forEach((code, d) => {
    if (code <= 0) return;
    // Three pushes in office hours.
    for (let k = 0; k < 3; k++) events.push(push(WEEK.weekStart + d * DAY_MS + (10 + 3 * k) * 3_600_000, Math.round(code / 3)));
  });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [] });
}

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

  it('a city goes idle after a day without pushes', () => {
    const c = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + 2.5 * DAY_MS, events: [push(WEEK.weekStart + 3_600_000, 800)], outcomes: [] });
    expect(c.idle).toBe(true);
    expect(c.pace).toBeLessThan(1);
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

  it('bots work a person’s week, deterministically', () => {
    const a = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    const b = botWork(7, 0, WEEK.weekStart, DAY_MS, WEEK.weekEnd);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });
});

function cohortsAfter(events: WorkEvent[], won: boolean) {
  const first = cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekStart + DAY_MS, events, outcomes: [] });
  return cityAt({ weekStart: WEEK.weekStart, dayMs: DAY_MS, now: WEEK.weekEnd, events, outcomes: [{ day: 0, won, dead: emptyCounts(), survivors: first.cohorts[0]! }] });
}

describe('battle', () => {
  it('is deterministic', () => {
    const setup = { version: BATTLE_VERSION, seed: 9, kind: 'daily' as const, armies: [army(300), army(320, { hue: 200 })] as [ArmySpec, ArmySpec] };
    const a = fight(setup);
    const b = fight(setup);
    expect(a).toEqual(b);
    const x = new Battle(setup);
    for (let i = 0; i < 300; i++) x.step();
    const y = new Battle(setup);
    for (let i = 0; i < 300; i++) y.step();
    expect(x.soldiers.map((s) => [s.x, s.y, s.hp])).toEqual(y.soldiers.map((s) => [s.x, s.y, s.hp]));
  });

  it('ends, and accounts for every man', () => {
    const r = fight({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [army(400), army(400, { hue: 200 })] });
    expect(r.ticks).toBeGreaterThan(100);
    for (const s of r.sides) for (let c = 0; c < UNIT_COUNT; c++) expect(s.dead[c]! + s.fled[c]! + s.alive[c]!).toBe(s.start[c]);
  });

  it('a much bigger army wins', () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) if (fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(200), army(400, { hue: 200 })] }).winner === 1) wins++;
    expect(wins).toBeGreaterThanOrEqual(5);
  });

  it('equal armies are a fair fight from either side', () => {
    let left = 0;
    for (let seed = 1; seed <= 10; seed++) if (fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(250), army(250, { hue: 200 })] }).winner === 0) left++;
    expect(left).toBeGreaterThanOrEqual(2);
    expect(left).toBeLessThanOrEqual(8);
  }, 30_000);

  it('a side with no soldiers loses without a fight', () => {
    expect(walkover(emptyCounts(), army(10).counts)).toBe(1);
    expect(walkover(army(10).counts, army(10).counts)).toBe(null);
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
});
