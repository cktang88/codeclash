// Battle v17: friendly blocks do not pass through each other as rigid shapes (`giveWay`,
// `crowded`, `rightOfWay` in battle.ts; the measure is `blockCrossings` in overlap.ts). Men may
// squeeze past at the edges; skirmishers and shooters falling back through their line, and chases,
// are drill and loose crowds and are not counted.
import { describe, expect, it } from 'vitest';
import { demoSetup } from '../client/demo.ts';
import { Battle, BATTLE_VERSION, type Regiment } from './battle.ts';
import { blockCrossings } from './overlap.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const isFoot = (r: Regiment) => r.role === 'line' || r.role === 'missile';

describe('friendly blocks keep out of each other', () => {
  it('over big battles, no block of foot marches through a friend', () => {
    let samples = 0;
    let through = 0;
    // (Eight battles of 1,000-1,500 a side: until QA review 2, three grand ones, 2,800, 4,000 and
    // 1,500, where one melee of two friendly blocks pressing on one enemy could carry the whole
    // count across the bound. The rate is bimodal, near 0 or 0.1-0.17 a battle; over these eight
    // it is 0.04, over seeds 1-8 at 1,000 / 1,200 / 1,500 each 0.05 / 0.06 / 0.03.)
    for (const [seed, men] of [[1, 1000], [2, 1500], [3, 1200], [4, 1500], [5, 1000], [6, 1200], [7, 1500], [8, 1000]] as const) {
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
    expect(samples).toBeGreaterThan(1000);
    expect(through / samples).toBeLessThan(0.1);
  }, 170_000);

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

  it("a rider does not go for a man our own foot is fighting at its front from behind that foot, and one in its ranks rides out", () => {
    const counts = new Array<number>(UNIT_COUNT).fill(0);
    counts[U.Knights] = 16;
    counts[U.HeavyInfantry] = 40;
    const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [plainArmy(counts), plainArmy(only(U.HeavyInfantry, 40), 200)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    const k = b.regiments.find((r) => r.team === 0 && r.cls === U.Knights)!;
    const f = b.regiments.find((r) => r.team === 0 && r.cls === U.HeavyInfantry)!;
    const e = b.regiments.find((r) => r.team === 1)!;
    placeRegiment(b, e, 1004, 600, -1, 0);
    placeRegiment(b, f, 1000, 600, 1, 0);
    // The knights stand in our foot's ranks, half in and half out of its right end.
    placeRegiment(b, k, 990, 600 + f.width * 0.5, 1, 0);
    const inside = b as unknown as { covered(j: number, i: number): boolean; amongFoot(i: number): boolean };
    f.engaged = true;
    // The enemy man straight before our foot's middle, and two riders: one behind our foot's
    // front, within its frontage; one out past its end.
    const foe = e.members.reduce((a, id) => (Math.abs(b.soldiers[id]!.y - 600) < Math.abs(b.soldiers[a]!.y - 600) && b.soldiers[id]!.x <= b.soldiers[a]!.x ? id : a));
    const riders = k.members.slice().sort((x, y) => b.soldiers[x]!.y - b.soldiers[y]!.y);
    const behind = riders.find((id) => b.soldiers[id]!.y < 600 + f.width * 0.5 - 4)!;
    const beyond = riders.find((id) => b.soldiers[id]!.y > 600 + f.width * 0.5 + 6)!;
    expect(inside.covered(foe, behind)).toBe(true);
    expect(inside.covered(foe, beyond)).toBe(false);
    expect(inside.amongFoot(behind)).toBe(true);
    expect(inside.amongFoot(beyond)).toBe(false);
    // Left to it, the riders in our ranks ride out of them within a few seconds.
    let last = 0;
    while (b.tick < 60) {
      b.step();
      last = 0;
      for (const c of blockCrossings(b, 1)) if (c.a === f.id && c.b === k.id) last = c.inA;
    }
    expect(last).toBeLessThanOrEqual(1);
  }, 60_000);
});
