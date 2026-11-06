// Battle v17, QA review 2026-11-06 (#2, #3, #5, #7, #11): nobody shoots into his own men, engines
// stand behind the line and lift their fire, spent skirmishers stay back, archers keep out of our
// own blocks' ranks. Small set pieces, a few hundred ticks each.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, FIELD_W, type Projectile, type Regiment } from './battle.ts';
import { demoSetup } from '../client/demo.ts';
import type { FactionId } from './factions.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: [number, number][]) => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of pairs) k[c] = n;
  return k;
};

/**
 * Shooters of `cls` behind our heavy foot, which is locked in melee with theirs; the enemy's
 * spearmen stand in reserve, clear of the fight. Hits on men by team 0's shooters: on our own
 * men, on the enemy in the melee, on the reserve.
 */
function overMelee(cls: number, faction: FactionId, seed: number) {
  const n = cls === U.Artillery ? 8 : 30;
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[cls, n], [U.HeavyInfantry, 60]]), 0, faction), plainArmy(counts([[U.HeavyInfantry, 60], [U.Spearmen, 60]]), 200)] });
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  const of = (team: number, c: number) => b.regiments.find((r) => r.team === team && r.cls === c)!;
  const shooters = of(0, cls);
  const reserve = of(1, U.Spearmen);
  placeRegiment(b, shooters, cls === U.Artillery ? 300 : 800, 600, 1, 0);
  placeRegiment(b, of(0, U.HeavyInfantry), 950, 600, 1, 0);
  placeRegiment(b, of(1, U.HeavyInfantry), 962, 600, -1, 0);
  placeRegiment(b, reserve, cls === U.Artillery ? 1250 : 1170, 600, -1, 0);
  const hits = { own: 0, melee: 0, reserve: 0 };
  const inside = b as unknown as { missileHit(o: number, p: Projectile): void };
  const hit0 = inside.missileHit.bind(b);
  inside.missileHit = (o, p) => {
    const s = b.soldiers[o]!;
    if (p.team === 0) {
      if (s.team === 0) hits.own++;
      else if (s.reg === reserve.id) hits.reserve++;
      else hits.melee++;
    }
    hit0(o, p);
  };
  while (b.tick < 450 && !b.done()) b.step();
  return hits;
}

describe('battle: danger close (v17)', () => {
  // Until v17: archers 4 own hits in these three battles, bombards 38, crossbows 5.
  for (const [cls, faction, name] of [
    [U.Archers, 'templar', 'archers'],
    [U.Crossbowmen, 'templar', 'crossbows'],
    [U.Crossbowmen, 'samurai', 'teppō'],
    [U.Artillery, 'templar', 'trebuchets'],
    [U.Artillery, 'samurai', 'bombards'],
  ] as const) {
    it(`${name} behind a melee shoot at the enemy's reserve, not into their own men`, () => {
      let own = 0;
      let reserve = 0;
      for (const seed of [1, 2, 3]) {
        const h = overMelee(cls, faction, seed);
        own += h.own;
        reserve += h.reserve;
      }
      expect(reserve, name).toBeGreaterThan(10);
      // (A ball four seconds on its way may still find a man who stepped into it.)
      expect(own, name).toBeLessThanOrEqual(cls === U.Artillery ? 3 : 1);
    }, 30_000);
  }

  it('a blocked crossbow never lofts its bolt: it holds or steps aside', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [plainArmy(counts([[U.Crossbowmen, 12], [U.Spearmen, 30]])), plainArmy(counts([[U.HeavyInfantry, 30]]), 200)] });
    b.pinStance(0, U.Crossbowmen, 'line');
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    const xb = b.regiments.find((r) => r.team === 0 && r.cls === U.Crossbowmen)!;
    placeRegiment(b, xb, 700, 600, 1, 0);
    placeRegiment(b, b.regiments.find((r) => r.team === 0 && r.cls === U.Spearmen)!, 745, 600, 1, 0);
    placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 900, 600, -1, 0);
    const seen = new Set<Projectile>();
    while (b.tick < 200 && !b.done()) {
      b.step();
      for (const p of b.projectiles) {
        if (p.team !== 0 || seen.has(p)) continue;
        seen.add(p);
        expect(p.direct).toBe(true);
      }
    }
    expect(b.ownGoals[0]).toBe(0);
  });

  it('engines deploy behind the second line and well off the edge of the field, even in a big battle', () => {
    for (const men of [450, 2800]) {
      const b = new Battle(demoSetup(1, men));
      for (const team of [0, 1]) {
        const dir = team === 0 ? 1 : -1;
        const regs = b.regiments.filter((r) => r.team === team);
        const second = regs.filter((r) => r.role === 'line' && r.line === 2);
        const back = Math.min(...second.map((r) => (r.ax - dir * r.depth) * dir));
        for (const r of regs.filter((r) => r.role === 'siege')) {
          const x = r.ax * dir;
          expect(team === 0 ? r.ax : FIELD_W - r.ax, `${men} t${team}`).toBeGreaterThanOrEqual(80);
          // (Until v17 the engines stood at x 18 at 2800 a side: 160 behind the second line.)
          expect(back - x, `${men} t${team}`).toBeLessThanOrEqual(80);
          expect(back - x).toBeGreaterThan(0);
        }
      }
    }
  });

  it('skirmishers with a javelin or so a man left stay behind the line', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [plainArmy(counts([[U.Skirmishers, 20], [U.Spearmen, 60]])), plainArmy(counts([[U.Spearmen, 60]]), 200)] });
    const sk = b.regiments.find((r) => r.role === 'skirmish')!;
    const d = (b as unknown as { d: { ammo: Int32Array | Float64Array | Uint8Array } }).d;
    placeRegiment(b, sk, 520, 600, 1, 0);
    placeRegiment(b, b.regiments.find((r) => r.team === 0 && r.cls === U.Spearmen)!, 600, 600, 1, 0);
    placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 1200, 600, -1, 0);
    // Spent but for a fugitive's two javelins and one more here and there (1 a man in all).
    sk.members.forEach((id, k) => (d.ammo[id] = k < sk.members.length / 2 ? 2 : 0));
    sk.retired = true;
    (b as unknown as { setMode(r: Regiment, m: string): void }).setMode(sk, 'reserve');
    let out = 0;
    while (b.tick < 300 && !b.done()) {
      b.step();
      if (sk.mode === 'advance' || (sk.ax > 610 && sk.mode !== 'pursue')) out++;
    }
    expect(out).toBe(0);
  });

  it('archers do not stand in the ranks of a block of our own foot: they take a spot beside it', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 1, kind: 'daily', armies: [plainArmy(counts([[U.Archers, 30], [U.HeavyInfantry, 40]])), plainArmy(counts([[U.HeavyInfantry, 40]]), 200)] });
    const bows = b.regiments.find((r) => r.team === 0 && r.cls === U.Archers)!;
    const foot = b.regiments.find((r) => r.team === 0 && r.cls === U.HeavyInfantry)!;
    placeRegiment(b, bows, 600, 600, 1, 0);
    placeRegiment(b, foot, 605, 610, 1, 0);
    const inside = b as unknown as { inFriends(r: Regiment, x: number, y: number): number; freeSpot(r: Regiment, x: number, y: number): void; tmp: Float64Array };
    expect(inside.inFriends(bows, 600, 600)).toBe(foot.id);
    inside.freeSpot(bows, 600, 600);
    expect(inside.inFriends(bows, inside.tmp[0]!, inside.tmp[1]!)).toBe(-1);
    expect(Math.abs(inside.tmp[1]! - 600)).toBeLessThanOrEqual((bows.width + foot.width) / 2 + 30);
  });
});
