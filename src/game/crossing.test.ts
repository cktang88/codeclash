// Battle v17: friendly blocks do not pass through each other as rigid shapes (`giveWay`,
// `crowded`, `rightOfWay` in battle.ts; the measure is `blockCrossings` in overlap.ts). Men may
// squeeze past at the edges; skirmishers and shooters falling back through their line, and chases,
// are drill and loose crowds and are not counted.
import { describe, expect, it } from 'vitest';
import { demoSetup } from '../client/demo.ts';
import { Battle, BATTLE_VERSION, type Regiment } from './battle.ts';
import { blockCrossings } from './overlap.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U } from './units.ts';

const isFoot = (r: Regiment) => r.role === 'line' || r.role === 'missile';

describe('friendly blocks keep out of each other', () => {
  it('over grand battles, no block of foot marches through a friend', () => {
    let samples = 0;
    let through = 0;
    for (const [seed, men] of [[1, 2800], [2, 4000], [4, 1500]] as const) {
      const b = new Battle(demoSetup(seed, men));
      while (!b.done() && b.tick < 1500) {
        b.step();
        if (b.tick % 10) continue;
        samples++;
        for (const c of blockCrossings(b)) {
          // Foot against foot, through a quarter of a block or more (v17 before this: 1.2 a second sampled).
          if (c.share >= 0.25 && isFoot(b.regiments[c.a]!) && isFoot(b.regiments[c.b]!)) through++;
        }
      }
    }
    expect(samples).toBeGreaterThan(300);
    expect(through / samples).toBeLessThan(0.1);
  }, 300_000);

  it("two friendly blocks sent across each other's path: one waits or goes round, neither goes through", () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 60)), plainArmy(only(U.HeavyInfantry, 10), 200)] });
    const [p, q] = b.regiments.filter((r) => r.team === 0) as [Regiment, Regiment];
    const foe = b.regiments.find((r) => r.team === 1)!;
    placeRegiment(b, foe, 2300, 100, -1, 0);
    // p marches north to south across q's road, q west to east across p's: the roads cross at (1200, 1200).
    placeRegiment(b, p, 1200, 1050, 0, 1);
    placeRegiment(b, q, 1050, 1200, 1, 0);
    const inside = b as unknown as { think(r: Regiment): void; survey(r: Regiment): void };
    const think = inside.think.bind(b);
    inside.think = (r: Regiment) => {
      if (r.team === 1) return think(r);
      inside.survey(r);
      r.mode = 'advance';
      if (r === p) {
        r.tx = 1200;
        r.ty = 1400;
        r.dfx = 0;
        r.dfy = 1;
      } else {
        r.tx = 1400;
        r.ty = 1200;
        r.dfx = 1;
        r.dfy = 0;
      }
    };
    let worst = 0;
    while (b.tick < 700) {
      b.step();
      for (const c of blockCrossings(b, 2)) worst = Math.max(worst, c.share);
    }
    // (Without giving way, a fifth of one block's men stood in the other as they crossed.)
    expect(worst).toBeLessThan(0.05);
    // Both got where they were going (the one that gave way went round or waited, then marched on).
    expect(Math.hypot(p.ax - 1200, p.ay - 1400)).toBeLessThan(40);
    expect(Math.hypot(q.ax - 1400, q.ay - 1200)).toBeLessThan(40);
  }, 60_000);

  it('blocks of archers sent at the same enemy each take their own spot, and all of them shoot', () => {
    // Ten blocks of archers against heavy foot standing to receive them: until this fix they
    // stood five deep on two spots. Now each takes its own on the ring of its range.
    let worst = 0;
    let shooting = 0;
    let blocks = 0;
    for (const seed of [1, 2]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [{ ...plainArmy(only(U.Archers, 300)), commander: true }, { ...plainArmy(only(U.HeavyInfantry, 100), 200), commander: true }] });
      b.generals[1].fixedPlan = 'hold';
      const bows = b.regiments.filter((r) => r.team === 0 && r.role === 'missile');
      expect(bows.length).toBeGreaterThan(6);
      while (b.tick < 2400) {
        b.step();
        if (b.tick % 20 || b.tick < 900) continue;
        // (Where they stand: archers in open order may pass through each other on the march. Since
        // the v17 bow reloads two blocks walking up past each other to their spots crossed 0.3 deep
        // for a moment on seed 1, both still with every arrow.)
        for (const c of blockCrossings(b, 2)) {
          const A = b.regiments[c.a]!;
          const B = b.regiments[c.b]!;
          if (A.role === 'missile' && B.role === 'missile' && A.mode !== 'advance' && B.mode !== 'advance') worst = Math.max(worst, c.share);
        }
      }
      blocks += bows.length;
      shooting += bows.filter((r) => r.mode === 'shoot').length;
    }
    expect(worst).toBeLessThan(0.25);
    expect(shooting).toBeGreaterThanOrEqual(blocks * 0.7);
  }, 120_000);
});
