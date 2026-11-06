// Battle v17 HORSE (docs/art-references/horse-wounds.md): arrows that strike a rider mostly strike
// his horse; a horse shot down, or one that bolts, leaves its rider on foot, dazed and slower, who
// then fights beside his mates, falls in with our foot or goes back. Small set pieces, seconds each.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State } from './battle.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { STATS, U, UNIT_COUNT } from './units.ts';

const counts = (pairs: [number, number][]) => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of pairs) k[c] = n;
  return k;
};
type Inside = { d: { dm: Uint8Array; hh: Float64Array; spd: Float64Array }; horseHit(i: number, raw: number, pierce: number, front: boolean, by: number): void };

/** `riders` of `cls` (side A) ride at `bows` archers standing `gap` off (side B holds), the duel's way. */
function horseAtBows(cls: number, riders: number, bows: number, gap: number, seed: number): Battle {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[cls, riders]]), 0), plainArmy(counts([[U.Archers, bows]]), 200)] });
  b.generals[1].fixedPlan = 'hold';
  for (const team of [0, 1]) {
    const regs = b.regiments.filter((r) => r.team === team);
    let y = 1200 - regs.reduce((s, r) => s + r.width + 20, -20) / 2;
    for (const r of regs) {
      placeRegiment(b, r, team === 0 ? 1200 - gap / 2 : 1200 + gap / 2, y + r.width / 2, team === 0 ? 1 : -1, 0);
      y += r.width + 20;
    }
  }
  return b;
}

describe('horse wounds', () => {
  it('massed bows wreck a charge of knights across the open: unhorsed, dead, broken', () => {
    // (Until v17 HORSE the armour soaked every arrow: 20 knights reached 120 bows untouched and
    // rode them down. Round 2: the bows shoot fast and flat as the horse closes, a horse falling at
    // the gallop may crush its rider, and the bows go out to finish the fallen and the running.)
    for (const seed of [1, 2, 3]) {
      const b = horseAtBows(U.Knights, 20, 120, 600, seed);
      while (!b.done() && b.tick < 600) b.step();
      expect(b.unhorsed[0], `seed ${seed}`).toBeGreaterThanOrEqual(10);
      expect(b.soldiers.filter((s) => s.team === 0 && s.state === State.Dead).length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(b.result?.winner, `seed ${seed}`).toBe(1);
      const d = (b as unknown as Inside).d;
      for (const s of b.soldiers) {
        if (!s.dismounted) continue;
        // On foot: no horse, his class's stats on foot, a man's pace.
        expect(s.mounted).toBe(false);
        expect(s.s.mounted).toBe(false);
        expect(d.hh[s.id]).toBe(0);
        expect(d.spd[s.id]).toBeLessThan(STATS[U.Knights]!.speed / 2);
      }
    }
  });

  it('against a smaller body of bows the charge mostly gets home, at a heavy price', () => {
    let wins = 0;
    let dead = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = horseAtBows(U.Knights, 20, 60, 600, seed);
      while (!b.done() && b.tick < 900) b.step();
      if (b.result?.winner === 0) wins++;
      dead += b.soldiers.filter((s) => s.team === 0 && s.state === State.Dead).length;
      expect(b.unhorsed[0], `seed ${seed}`).toBeGreaterThanOrEqual(5);
    }
    // (6 of 8 days, 15 dead and 78 unhorsed of 160 knights.)
    expect(wins).toBeGreaterThanOrEqual(4);
    expect(wins).toBeLessThan(8);
    expect(dead).toBeGreaterThanOrEqual(5);
  });

  it('bows locked in a fight with foot are still ridden down by horse', () => {
    for (const seed of [1, 2, 3]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[U.Knights, 20], [U.HeavyInfantry, 60]]), 0), plainArmy(counts([[U.Archers, 60], [U.HeavyInfantry, 60]]), 200)] });
      b.generals[1].fixedPlan = 'hold';
      b.generals[0].fixedPlan = 'advance';
      const of = (t: number, k: number) => b.regiments.filter((r) => r.team === t && r.cls === k);
      let y = 1100;
      for (const r of of(1, U.Archers)) {
        placeRegiment(b, r, 1300, y, -1, 0);
        y += r.width + 20;
      }
      placeRegiment(b, of(0, U.HeavyInfantry)[0]!, 1290, 1100 + (y - 1100) / 2, 1, 0);
      placeRegiment(b, of(1, U.HeavyInfantry)[0]!, 1500, 1100, -1, 0);
      of(0, U.Knights).forEach((r, i) => placeRegiment(b, r, 1000, 1100 + i * 60, 1, 0));
      const bows = b.soldiers.filter((s) => s.team === 1 && s.cls === U.Archers);
      while (!b.done() && b.tick < 600) b.step();
      expect(bows.filter((s) => s.state === State.Fighting).length, `seed ${seed}`).toBe(0);
      expect(bows.filter((s) => s.state === State.Dead).length, `seed ${seed}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('barding turns some of what would kill a bare horse', () => {
    const b = horseAtBows(U.Knights, 20, 20, 2000, 1);
    const inside = b as unknown as Inside;
    const ids = b.soldiers.filter((s) => s.team === 0).map((s) => s.id);
    const [a, c] = [ids[0]!, ids[1]!];
    const before = inside.d.hh[a]!;
    inside.horseHit(a, 10, 0, true, -1);
    inside.horseHit(c, 10, 0, false, -1);
    const front = before - inside.d.hh[a]!;
    const side = before - inside.d.hh[c]!;
    // Barding 30 at the front: about 50 / 80 of the blow (with the roll's 0.75-1.25); half as much barding at the side.
    expect(front).toBeGreaterThan(10 * (50 / 80) * 0.74);
    expect(front).toBeLessThan(10 * (50 / 80) * 1.26);
    expect(side).toBeGreaterThan(10 * (50 / 65) * 0.74);
  });

  it('a rider on foot does not stand about: he fights, goes back, or falls in with our foot', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 1, kind: 'daily', armies: [plainArmy(counts([[U.Knights, 20], [U.HeavyInfantry, 60]]), 0), plainArmy(counts([[U.Archers, 120]]), 200)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    const of = (t: number, k: number) => b.regiments.filter((r) => r.team === t && r.cls === k);
    placeRegiment(b, of(0, U.HeavyInfantry)[0]!, 700, 1200, 1, 0);
    placeRegiment(b, of(0, U.Knights)[0]!, 760, 1100, 1, 0);
    let y = 1050;
    for (const r of of(1, U.Archers)) {
      placeRegiment(b, r, 1250, y, -1, 0);
      y += r.width + 20;
    }
    const d = (b as unknown as Inside).d;
    let afoot = 0;
    let idle = 0;
    let joined = 0;
    while (!b.done() && b.tick < 400) {
      b.step();
      for (const s of b.soldiers) {
        if (s.state !== State.Fighting || !s.dismounted) continue;
        if (d.dm[s.id] === 2) {
          joined++;
          expect(b.regiments[s.reg]!.cls).toBe(U.HeavyInfantry);
          continue;
        }
        afoot++;
        if (s.target < 0 && s.stunned === 0 && Math.hypot(s.vx, s.vy) < 1) idle++;
      }
    }
    expect(b.unhorsed[0]).toBeGreaterThan(3);
    expect(joined).toBeGreaterThan(0);
    expect(idle / Math.max(1, afoot)).toBeLessThan(0.1);
  });

  it('spears put their points into the horses of a charge they stop', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [plainArmy(counts([[U.Knights, 20]]), 0), plainArmy(counts([[U.Spearmen, 60]]), 200, 'samurai')] });
    for (const team of [0, 1]) for (const r of b.regiments.filter((o) => o.team === team)) placeRegiment(b, r, team === 0 ? 1160 : 1240, 1200, team === 0 ? 1 : -1, 0);
    while (!b.done() && b.tick < 900) b.step();
    expect(b.unhorsed[0]).toBeGreaterThan(5);
    expect(b.result?.winner).not.toBe(0);
  });
});
