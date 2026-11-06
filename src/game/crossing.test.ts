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

  it('over grand battles, horse and the household ride round friendly blocks (not through them, at the charge or riding out)', () => {
    const horse = (r: Regiment) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' || r.role === 'command';
    let samples = 0;
    let through = 0;
    let household = 0;
    for (const [seed, men] of [[1, 2800], [2, 4000], [4, 1500]] as const) {
      const b = new Battle(demoSetup(seed, men));
      while (!b.done() && b.tick < 1500) {
        b.step();
        if (b.tick % 10) continue;
        samples++;
        for (const c of blockCrossings(b)) {
          const p = b.regiments[c.a]!;
          const q = b.regiments[c.b]!;
          // Through a quarter of a block or more, with horse in the pair, neither locked in a fight
          // (a melee of horse and foot about one enemy block mingles at its edges).
          if (c.share >= 0.25 && (horse(p) || horse(q)) && !(p.engaged && q.engaged)) through++;
          if (p.role === 'command' || q.role === 'command') household++;
        }
      }
    }
    // (Before v17's `rideRound`: 0.11 a second sampled, and the household stood in its archers from the start.)
    expect(through / samples).toBeLessThan(0.04);
    expect(household / samples).toBeLessThan(0.05);
  }, 300_000);

  it('a line of horse behind another charges round it, not through it, and hits as soon', () => {
    for (const seed of [1, 2, 3, 4]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.LightCavalry, 30)), plainArmy(only(U.LightCavalry, 30), 200)] });
      const ours = b.regiments.filter((r) => r.team === 0);
      const theirs = b.regiments.filter((r) => r.team === 1);
      // Three blocks in column, 45 apart, the enemy's three abreast 200 off.
      ours.forEach((r, i) => placeRegiment(b, r, 800 - i * 45, 600 + (i - 1) * 12, 1, 0));
      theirs.forEach((r, i) => placeRegiment(b, r, 1000, 560 + i * 40, -1, 0));
      let worst = 0;
      let hit = -1;
      while (b.tick < 400 && !b.done()) {
        b.step();
        for (const c of blockCrossings(b, 2)) if (b.regiments[c.a]!.team === 0) worst = Math.max(worst, c.share);
        if (hit < 0) for (const r of ours) for (const id of r.members) if (b.soldiers[id]!.target >= 0) hit = b.tick;
      }
      // (Before `rideRound` the blocks behind galloped through the one before: 40-70% of a block's men in it.)
      expect(worst).toBeLessThan(0.1);
      // The charge is not held up: the first blows land when they did (tick 75-76).
      expect(hit).toBeGreaterThan(0);
      expect(hit).toBeLessThan(85);
      expect(theirs.reduce((a, r) => a + r.start - r.alive, 0)).toBeGreaterThan(4);
    }
  }, 120_000);
});
