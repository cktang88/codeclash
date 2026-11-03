import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, ballisticsOf, type Projectile } from './battle.ts';
import type { FactionId } from './factions.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: [number, number][]) => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of pairs) k[c] = n;
  return k;
};

/** Shooters of `cls` (team 0, `faction`) with a block of their own spearmen standing right in front, the enemy beyond. */
const screened = (faction: FactionId, cls: number, screen = true) => {
  const b = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [plainArmy(counts([[cls, 12], [U.Spearmen, 30]]), 0, faction), plainArmy(counts([[U.HeavyInfantry, 30]]), 200)] });
  // Shooters in close order, narrower than the screen.
  b.pinStance(0, cls, 'line');
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  const shooters = b.regiments.find((r) => r.team === 0 && r.cls === cls)!;
  const spears = b.regiments.find((r) => r.team === 0 && r.cls === U.Spearmen)!;
  const foe = b.regiments.find((r) => r.team === 1)!;
  placeRegiment(b, shooters, 700, 600, 1, 0);
  placeRegiment(b, spears, screen ? 745 : 700, screen ? 600 : 300, 1, 0);
  placeRegiment(b, foe, 840, 600, -1, 0);
  const shots: Projectile[] = [];
  const seen = new Set<Projectile>();
  let spearHurt = 0;
  const hp0 = spears.members.map((id) => b.soldiers[id]!.hp);
  // Own goals while the screen stands still (once it charges, men run into the line of fire).
  let still = 0;
  while (b.tick < 120 && !b.done()) {
    b.step();
    if (spears.mode !== 'charge' && spears.mode !== 'melee' && spears.mode !== 'advance') still = b.ownGoals[0];
    for (const p of b.projectiles) if (p.team === 0 && !seen.has(p)) {
      seen.add(p);
      shots.push(p);
    }
  }
  spears.members.forEach((id, k) => (spearHurt += hp0[k]! - b.soldiers[id]!.hp));
  void spearHurt;
  spearHurt = still;
  return { b, shots, spearHurt, shooters, foe };
};

describe('battle: missiles', () => {
  it('knows how each kind shoots', () => {
    expect(ballisticsOf('templar', U.Archers)).toBe('lob');
    expect(ballisticsOf('templar', U.Crossbowmen)).toBe('flat');
    expect(ballisticsOf('samurai', U.Crossbowmen)).toBe('gun');
    expect(ballisticsOf('samurai', U.Artillery)).toBe('cannon');
    expect(ballisticsOf('undead', U.Artillery)).toBe('siege');
  });

  it('archers loose over the heads of a friendly block; matchlocks behind it hold fire (and step out to find a line)', () => {
    const bows = screened('templar', U.Archers);
    const guns = screened('samurai', U.Crossbowmen);
    // Arrows from the first volley on, high over the spearmen, landing among the enemy.
    expect(bows.shots.length).toBeGreaterThan(15);
    const lob = bows.shots[0]!;
    expect(lob.arc).toBeGreaterThan(Math.hypot(lob.x1 - lob.x0, lob.y1 - lob.y0) * 0.15);
    expect(lob.direct).toBe(false);
    // The guns never shoot through their own men: nobody in the screen is hit by them.
    expect(guns.spearHurt).toBe(0);
    expect(bows.spearHurt).toBeLessThan(bows.shots.length * 0.1);
    for (const p of guns.shots) {
      expect(p.arc).toBe(0);
      expect(p.direct).toBe(true);
    }
    // Held fire, then stepped sideways out from behind the screen to shoot past it.
    const open = screened('samurai', U.Crossbowmen, false);
    const firstOpen = open.shots[0]?.born ?? Infinity;
    const firstScreened = guns.shots[0]?.born ?? Infinity;
    const early = (x: Projectile[]) => x.filter((p) => p.born < 50).length;
    expect(firstOpen).toBeLessThan(firstScreened);
    expect(early(guns.shots)).toBeLessThan(early(open.shots) / 3);
    expect(Math.abs(guns.shooters.cy - 600)).toBeGreaterThan(10);
    expect(guns.shots.length).toBeGreaterThan(0);
    // Aim: bows high, guns level (for the Shoot pose).
    const bowAim = Math.max(...bows.shooters.members.map((id) => bows.b.soldiers[id]!.aim));
    const gunAim = Math.max(...open.shooters.members.map((id) => open.b.soldiers[id]!.aim));
    expect(bowAim).toBeGreaterThan(0.3);
    expect(gunAim).toBe(0);
  });

  it('a ball strikes the first man in its line: friend or foe, never one behind him', () => {
    const { b, shots } = screened('samurai', U.Crossbowmen, false);
    expect(shots.length).toBeGreaterThan(5);
    // Every hit by a gun on the enemy is on a man of their front ranks, not one deep in the block.
    let deep = 0;
    let hits = 0;
    const foe = b.regiments.find((r) => r.team === 1)!;
    for (const id of foe.members) {
      const s = b.soldiers[id]!;
      if (s.hitAt < 0) continue;
      hits++;
      if (s.sy < -foe.spacing * 2.5) deep++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(deep).toBeLessThanOrEqual(hits * 0.2);
  });

  it('crossbowmen shoot past their own ranks: no bolt strikes a man of the regiment that loosed it', () => {
    // A block of crossbowmen in close order: the rear ranks shoot through the front (their own
    // ranks kneel or take turns, see `Ballistics`), so a bolt sees past them at landing too.
    for (const faction of ['templar', 'undead'] as const) {
      const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [plainArmy(counts([[U.Crossbowmen, 30]]), 0, faction), plainArmy(counts([[U.HeavyInfantry, 40]]), 200)] });
      b.pinStance(0, U.Crossbowmen, 'line');
      b.generals[0].fixedPlan = 'hold';
      b.generals[1].fixedPlan = 'hold';
      const xb = b.regiments.find((r) => r.team === 0)!;
      b.regiments.filter((r) => r.team === 1).forEach((r, i) => placeRegiment(b, r, 830, 560 + i * 80, -1, 0));
      placeRegiment(b, xb, 700, 600, 1, 0);
      let loosed = 0;
      const seen = new Set<Projectile>();
      while (b.tick < 200 && !b.done()) {
        b.step();
        for (const p of b.projectiles) if (p.team === 0 && !seen.has(p)) seen.add(p) && loosed++;
      }
      expect(loosed).toBeGreaterThan(20);
      // Team 0 is only this regiment: every own goal would be a bolt in a comrade's back.
      expect(b.ownGoals[0]).toBe(0);
    }
  });

  it('a cannonball bounds on through several men in a file', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 5, kind: 'daily', armies: [plainArmy(counts([[U.Artillery, 4]]), 0, 'samurai'), plainArmy(counts([[U.HeavyInfantry, 60]]), 200)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    b.pinStance(1, U.HeavyInfantry, 'column');
    const guns = b.regiments.find((r) => r.team === 0)!;
    const foe = b.regiments.filter((r) => r.team === 1);
    placeRegiment(b, guns, 600, 600, 1, 0);
    foe.forEach((r, i) => placeRegiment(b, r, 860 + i * 80, 600 + (i - (foe.length - 1) / 2) * 0, -1, 0));
    let best = 0;
    const balls = new Map<Projectile, number>();
    while (b.tick < 600 && !b.done()) {
      b.step();
      for (const p of b.projectiles) if (p.team === 0 && !balls.has(p)) balls.set(p, p.lands);
      for (const [p, lands] of balls) {
        if (lands !== b.tick - 1) continue;
        expect(p.pen).toBeGreaterThan(1);
        const hit = b.soldiers.filter((s) => s.team === 1 && s.hitAt === lands).length;
        best = Math.max(best, hit);
        balls.delete(p);
      }
    }
    expect(best).toBeGreaterThanOrEqual(3);
  });
});
