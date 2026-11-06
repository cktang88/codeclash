import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, type ArmySpec, type BattleSetup } from './battle.ts';
import type { FactionId } from './factions.ts';
import { overlapStats, percentile } from './overlap.ts';
import { frontalCharge } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, faction: FactionId, hue = 0): ArmySpec => ({
  name: faction, faction, hue, counts: mix.map((f) => Math.round(n * f)), veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true,
});
const factions: FactionId[] = ['templar', 'samurai', 'undead'];

describe('battle: nobody walks through anybody', () => {
  it('over seeded battles, men barely overlap, friend or foe (marching, charging, in melee and running)', () => {
    const all: number[] = [];
    const enemy: number[] = [];
    for (let seed = 1; seed <= 4; seed++) {
      const setup: BattleSetup = { version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(320, factions[seed % 3]!), army(340, factions[(seed + 1) % 3]!, 200)] };
      const b = new Battle(setup);
      while (!b.done() && b.tick < 1800) {
        b.step();
        if (b.tick % 5 !== 0) continue;
        const o = overlapStats(b);
        for (const v of o.depth) all.push(v);
        for (const v of o.enemyDepth) enemy.push(v);
      }
    }
    // Overlap is measured as a share of the smaller man's radius: 1 means one man's centre is
    // at the other's edge. (Before v4: all men p95 0.8, enemy pairs p95 1.1 and p99 1.6.)
    const p = (a: number[], q: number) => Math.round(percentile(a, q) * 1000) / 1000;
    const got = { allP95: p(all, 0.95), allP99: p(all, 0.99), enemyP95: p(enemy, 0.95), enemyP99: p(enemy, 0.99) };
    expect(enemy.length).toBeGreaterThan(1000);
    expect(got.allP95).toBeLessThan(0.45);
    expect(got.allP99).toBeLessThan(0.9);
    expect(got.enemyP95).toBeLessThan(0.65);
    expect(got.enemyP99).toBeLessThan(1);
  }, 120_000);
});

describe('battle: a charge of horse into foot', () => {
  it('knights break into spearmen who are not braced, but not into a pike wall or braced spears', () => {
    const open = frontalCharge(U.Knights, U.Spearmen, 'line');
    const pikes = frontalCharge(U.Knights, U.Spearmen, 'pikewall');
    const braced = frontalCharge(U.Knights, U.Spearmen, 'braced');
    // The block is three ranks (about 14 deep): the best riders get through it, and the charge
    // as a whole carries past the front rank.
    expect(open.deepest).toBeGreaterThan(open.footDepth * 0.9);
    expect(open.mean).toBeGreaterThan(3);
    for (const stop of [pikes, braced]) {
      expect(stop.mean).toBeLessThan(1);
      expect(stop.deepest).toBeLessThan(open.deepest - 8);
    }
  });

  it('carry through a thin line of archers, and light horse goes in less deep than knights', () => {
    // (Since v17 HORSE the archers' last arrows at 150 bring down three or four of the twelve
    // horses and check others: on some days the charge goes in ragged, so this is over five days.
    // The best riders still get through, and the charge as a whole about through the line.)
    const days = [1, 2, 3, 4, 5].map((seed) => frontalCharge(U.Knights, U.Archers, 'line', 30, 12, seed));
    const archers = days[2]!;
    expect(archers.deepest).toBeGreaterThan(archers.footDepth);
    expect(days.reduce((s, d) => s + d.mean, 0) / days.length).toBeGreaterThan(archers.footDepth * 0.9);
    const knights = frontalCharge(U.Knights, U.Spearmen, 'line');
    const light = frontalCharge(U.LightCavalry, U.Spearmen, 'line');
    expect(light.mean).toBeLessThan(knights.mean);
    expect(light.deepest).toBeLessThan(knights.deepest);
  });

  it('shoves men aside rather than riding through them', () => {
    const b = frontalCharge(U.Knights, U.Spearmen, 'line').battle;
    // Run on through the melee that follows.
    let worst = 0;
    for (let t = 0; t < 60 && !b.done(); t++) {
      b.step();
      worst = Math.max(worst, percentile(overlapStats(b).enemyDepth, 0.95));
    }
    expect(worst).toBeLessThan(0.8);
  });
});
