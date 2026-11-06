import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

import { MIX, army, push, WEEK, weekOfWork, cohortsAfter, setupOf, valued, only, deadOf, winsOf } from './game-test-helpers.ts';

// Split from game.test.ts so the long battles run in parallel files.

describe('battle: the matchups', () => {
  const V = 450;
  const horse = { [U.LightCavalry]: 0.5, [U.Knights]: 0.3, [U.HeavyInfantry]: 0.2 };
  const bows = { [U.Archers]: 0.5, [U.Crossbowmen]: 0.2, [U.HeavyInfantry]: 0.3 };
  const spears = { [U.Spearmen]: 0.8, [U.HeavyInfantry]: 0.2 };
  it('horse beats bows at equal value', () => {
    // (Since v14 the horse's edge is narrower, 7-10 of the first 12 days by version against 11 in
    // v13: it breaks off from the foot among the bows to charge again. Since v17 narrower still,
    // 56% of 120 days against 62% in v16: the heavy foot beside the bows turns on horse among
    // them, and faces round to meet it when it rides off; 12 days swung 3-8 on that alone.)
    expect(winsOf(30, (seed) => fight(setupOf(seed, valued(V, horse), valued(V, bows))).winner)).toBeGreaterThanOrEqual(16);
  }, 60_000);
  it('spears hold against horse at equal value', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, valued(V, spears), valued(V, horse))).winner)).toBeGreaterThanOrEqual(5);
  }, 30_000);
  it('bows beat spears at equal value', () => {
    expect(winsOf(6, (seed) => fight(setupOf(seed, valued(V, bows), valued(V, spears))).winner)).toBeGreaterThanOrEqual(4);
  }, 30_000);
});

describe('battle: stances', () => {
  /** Knights charge a block of foot that is pinned to a stance; returns [foot dead, knights dead] after `ticks`. */
  function charge(seed: number, foot: number, footStance: Stance, knightStance: Stance | null, ticks = 450): [number, number] {
    const b = new Battle(setupOf(seed, only(foot, 120), only(U.Knights, 40)));
    b.generals[1].rashKnights = true;
    b.pinStance(0, foot, footStance);
    if (knightStance) b.pinStance(1, U.Knights, knightStance);
    for (let i = 0; i < ticks && !b.done(); i++) b.step();
    return [deadOf(b, 0), deadOf(b, 1)];
  }

  it('a pike wall breaks a frontal charge of horse', () => {
    let pikeKnights = 0;
    let lineKnights = 0;
    let pikeSpears = 0;
    let lineSpears = 0;
    for (const seed of [1, 2, 3]) {
      const p = charge(seed, U.Spearmen, 'pikewall', null);
      const l = charge(seed, U.Spearmen, 'line', null);
      pikeSpears += p[0];
      pikeKnights += p[1];
      lineSpears += l[0];
      lineKnights += l[1];
    }
    expect(pikeKnights).toBeGreaterThan(lineKnights * 1.5);
    expect(pikeSpears).toBeLessThan(lineSpears);
  }, 30_000);

  it('a wedge hits foot harder than a line of horse', () => {
    let wedge = 0;
    let line = 0;
    for (const seed of [1, 2, 3]) {
      wedge += charge(seed, U.HeavyInfantry, 'line', 'wedge', 330)[0];
      line += charge(seed, U.HeavyInfantry, 'line', 'line', 330)[0];
    }
    expect(wedge).toBeGreaterThan(line);
  }, 30_000);

  /**
   * Archers shoot at a block of heavy foot that waits for them, pinned to a stance; returns the
   * foot's dead. (90 s: since v6 the archers march into bow range at the drill's pace and loose
   * their first shafts at about 48 s, not 32 s. Since the scale rework 180 s and 300 archers, not
   * 150: the armies deploy twice as far apart, and from three times as far the shafts scatter
   * wide; 150 emptied their quivers at the waiting foot from 560 for 3 dead a battle. Since v17
   * 270 s: each block of archers takes its own spot on the ring of its range, beside the others
   * or behind an interval, where the ten blocks used to stand five deep on two spots and loose
   * from there; spread out, they take longer to come into action, and at 180 s the line had lost
   * 3 men in three days, at 270 s 199.)
   */
  function shot(seed: number, stance: Stance, ticks = 2700): number {
    const b = new Battle(setupOf(seed, only(U.Archers, 300), only(U.HeavyInfantry, 100)));
    b.generals[1].fixedPlan = 'hold';
    b.pinStance(1, U.HeavyInfantry, stance);
    for (let i = 0; i < ticks && !b.done(); i++) b.step();
    return deadOf(b, 1);
  }

  it('loose order and the shield wall lose fewer men to arrows', () => {
    let line = 0;
    let loose = 0;
    let wall = 0;
    for (const seed of [1, 2, 3]) {
      line += shot(seed, 'line');
      loose += shot(seed, 'loose');
      wall += shot(seed, 'shieldwall');
    }
    expect(line).toBeGreaterThan(10);
    expect(loose).toBeLessThan(line * 0.8);
    expect(wall).toBeLessThan(line * 0.8);
  }, 90_000);

  it('picks stances by itself and says so', () => {
    const b = new Battle(setupOf(4, army(500), army(500)));
    const seen = new Set<string>();
    while (!b.done()) {
      b.step();
      for (const r of b.regiments) seen.add(`${r.cls}:${r.stance}`);
    }
    expect(seen.has(`${U.Archers}:loose`)).toBe(true);
    expect(seen.has(`${U.Knights}:wedge`)).toBe(true);
    expect(seen.has(`${U.HeavyInfantry}:line`)).toBe(true);
    expect([...seen].some((k) => k === `${U.HeavyInfantry}:shieldwall` || k === `${U.Spearmen}:pikewall`)).toBe(true);
    expect(b.events.filter((e) => e.kind === 'stance').every((e) => e.stance !== undefined && e.reg !== undefined)).toBe(true);
  }, 30_000);
});
