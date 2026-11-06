import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

import { MIX, army, push, WEEK, weekOfWork, cohortsAfter, setupOf, valued, only, deadOf, winsOf } from './game-test-helpers.ts';

// Split from game.test.ts so the long battles run in parallel files.

describe('battle', () => {
  it('is deterministic, step by step', () => {
    const setup = setupOf(9, army(300), army(320));
    const a = fight(setup);
    const b = fight(setup);
    expect(a).toEqual(b);
    const x = new Battle(setup);
    const y = new Battle(setup);
    for (let i = 0; i < 400; i++) {
      x.step();
      y.step();
    }
    expect(x.soldiers.map((s) => [s.x, s.y, s.hp, s.state, s.target, s.hitAt])).toEqual(y.soldiers.map((s) => [s.x, s.y, s.hp, s.state, s.target, s.hitAt]));
    expect(x.regiments.map((r) => [r.ax, r.ay, r.fx, r.mode, r.stance, r.order, r.morale, r.moraleState])).toEqual(y.regiments.map((r) => [r.ax, r.ay, r.fx, r.mode, r.stance, r.order, r.morale, r.moraleState]));
    expect(x.events).toEqual(y.events);
    expect(x.run()).toEqual(a);
  }, 30_000);

  it('ends, and accounts for every man', () => {
    const r = fight(setupOf(3, army(400), army(400)));
    expect(r.ticks).toBeGreaterThan(100);
    for (const s of r.sides) for (let c = 0; c < UNIT_COUNT; c++) expect(s.dead[c]! + s.fled[c]! + s.alive[c]!).toBe(s.start[c]);
  });

  it('lasts a minute and a half to four minutes, with an approach, a clash and a rout', () => {
    // Over a dozen days, not one seed that happens to land in range: the typical battle (the
    // median) runs 80 s to 5 min, and none is over in under 50 s or runs to the time limit.
    const ticks: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const b = new Battle(setupOf(seed, army(500), army(500)));
      const r = b.run();
      ticks.push(r.ticks);
      expect(r.reason).toBe('rout');
      expect(r.ticks).toBeGreaterThan(50 * TICKS_PER_SECOND);
      // (Since v13 Templar blocks re-form on the banner twice and the brothers die where they stand
      // (T2, T3): a Templar mirror's long grind can run past five minutes, short of the limit.)
      // (Since the v17 reloads, a bow volley every 5 s rather than 2.1, battles run a fifth longer,
      // median about 205 s against 175; a battle whose lines fall apart after the first clash and
      // come on again across the field ran 438 s. The time limit is 600 s.)
      expect(r.ticks).toBeLessThan(450 * TICKS_PER_SECOND);
      const contact = b.events.find((e) => e.kind === 'contact')!.tick;
      expect(contact).toBeGreaterThan(15 * TICKS_PER_SECOND);
      expect(b.events.some((e) => e.kind === 'general-order')).toBe(true);
      expect(b.events.some((e) => e.kind === 'stance')).toBe(true);
      expect(b.events.some((e) => e.kind === 'charge')).toBe(true);
      expect(b.events.filter((e) => e.kind === 'rout' || e.kind === 'shattered').length).toBeGreaterThan(3);
    }
    ticks.sort((a, b) => a - b);
    const median = (ticks[5]! + ticks[6]!) / 2;
    expect(median).toBeGreaterThan(80 * TICKS_PER_SECOND);
    expect(median).toBeLessThan(300 * TICKS_PER_SECOND);
  }, 60_000);

  it('a much bigger army wins', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, army(200), army(400))).winner)).toBeLessThanOrEqual(1);
  }, 60_000);

  it('equal armies are a fair fight from either side', () => {
    // Mirror matches at two sizes (the side favoured by a timing bias used to depend on the
    // armies' size). Until v5 the left side won 33 of these 40 at 250 a side; over 800 seeds v5
    // gives it 48% at 250 and 120 a side. 13-27 of 40 is a fair coin at p ~ 0.04.
    for (const n of [250, 120]) {
      const left = winsOf(40, (seed) => fight(setupOf(seed, army(n), army(n))).winner);
      expect(left).toBeGreaterThanOrEqual(13);
      expect(left).toBeLessThanOrEqual(27);
    }
    // (240 s: since the scale rework a battle runs about 1.6 times as long.)
  }, 240_000);

  it('a tenth more men usually wins, but not always', () => {
    const wins = winsOf(20, (seed) => fight(setupOf(seed, army(330), army(300))).winner);
    expect(wins).toBeGreaterThanOrEqual(11);
    expect(wins).toBeLessThanOrEqual(19);
  }, 60_000);

  it('a side with no soldiers loses without a fight', () => {
    expect(walkover(emptyCounts(), army(10).counts)).toBe(1);
    expect(walkover(army(10).counts, army(10).counts)).toBe(null);
  });
});

describe('battle: scale', () => {
  it('fights a grand battle of thousands quickly enough', () => {
    const b = new Battle({ ...setupOf(1, army(2800), army(2800)), kind: 'grand' });
    expect(b.soldiers.length).toBeGreaterThan(4800);
    expect(b.scale).toBe(1);
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) b.step();
    const perStep = (performance.now() - t0) / 300;
    // Loose for CI: the target on a dev machine is under 4 ms.
    expect(perStep).toBeLessThan(25);
    const big = new Battle({ ...setupOf(1, army(20000), army(18000)), kind: 'grand' });
    expect(big.scale).toBeGreaterThan(1);
    expect(big.soldiers.length).toBeLessThanOrEqual(2 * MAX_FIGURES + 20);
    for (const s of b.soldiers) {
      expect(s.x).toBeGreaterThanOrEqual(-10);
      expect(s.x).toBeLessThanOrEqual(FIELD_W + 10);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(FIELD_H);
    }
  }, 60_000);
});
