import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, ballisticsOf, DOCTRINE, fireEvery, State, type ArmySpec, type Projectile, type Regiment } from './battle.ts';
import { factionStats, type FactionId } from './factions.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: [number, number][]) => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of pairs) k[c] = n;
  return k;
};

/** Shooters of `cls` (team 0, `faction`) with a block of their own spearmen standing right in front, the enemy beyond. */
const screened = (faction: FactionId, cls: number, screen = true, foeX = 840) => {
  // (Matchlocks standing behind a friendly block, as any shooters do: without the samurai's S3
  // doctrine, which sends them out before their line.)
  const out = DOCTRINE.samurai.screen;
  DOCTRINE.samurai.screen = 0;
  try {
    return screenedRun(faction, cls, screen, foeX);
  } finally {
    DOCTRINE.samurai.screen = out;
  }
};
const screenedRun = (faction: FactionId, cls: number, screen: boolean, foeX: number) => {
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
  placeRegiment(b, foe, foeX, 600, -1, 0);
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
    // (The enemy a little further off for the guns: since v17 a ball is never fired at a block
    // locked with our own men, and at 840 the enemy is at the spears before the guns have
    // stepped clear.)
    const guns = screened('samurai', U.Crossbowmen, true, 870);
    // Arrows from the first volley on, high over the spearmen, landing among the enemy. (One
    // volley of all 12 before the spearmen go in: since v17 the next comes 7.5 s later.)
    expect(bows.shots.length).toBeGreaterThanOrEqual(12);
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
    const open = screened('samurai', U.Crossbowmen, false, 870);
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
      // (400 ticks: two volleys of the undead's heavy arbalests, 29 s apart since the v17 reloads.)
      while (b.tick < 400 && !b.done()) {
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
    // Men each ball strikes (since v17 along its flight, as it reaches them, not all as it lands).
    const struckBy = new Map<Projectile, number>();
    const inside = b as unknown as { missileHit(o: number, p: Projectile): void };
    const hit0 = inside.missileHit.bind(b);
    inside.missileHit = (o, p) => {
      struckBy.set(p, (struckBy.get(p) ?? 0) + 1);
      hit0(o, p);
    };
    while (b.tick < 600 && !b.done()) {
      b.step();
      for (const p of b.projectiles) if (p.team === 0) expect(p.pen).toBeGreaterThan(1);
    }
    expect(Math.max(0, ...struckBy.values())).toBeGreaterThanOrEqual(3);
  });
});

/** The projectiles loosed since the last call. */
const shotsOf = (b: Battle) => {
  const seen = new Set<Projectile>();
  return (): Projectile[] => {
    const out: Projectile[] = [];
    for (const p of b.projectiles) if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
    return out;
  };
};

/** `men` shooters of `cls` (team 0) standing 150 from two blocks of heavy foot, both sides holding. */
const butts = (faction: FactionId, cls: number, men = 30) => {
  const b = new Battle({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [plainArmy(only(cls, men), 0, faction), plainArmy(only(U.HeavyInfantry, 60), 200)] });
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  const shooters = b.regiments.find((r) => r.team === 0)!;
  placeRegiment(b, shooters, 700, 600, 1, 0);
  // Any other block of them a little behind, out of the way (left where it deployed it would
  // stand before the butts since the field grew: docs/art-references/battle-scale.md).
  b.regiments.filter((r) => r.team === 0 && r !== shooters).forEach((r, i) => placeRegiment(b, r, 500, 600 + (i + 1) * 70, 1, 0));
  b.regiments.filter((r) => r.team === 1).forEach((r, i) => placeRegiment(b, r, 850, 560 + i * 90, -1, 0));
  return { b, shooters };
};

/** Shot ticks (sorted) split into bursts: a new burst after a pause of more than 3 ticks. */
const bursts = (ticks: number[]): number[][] => {
  const out: number[][] = [];
  for (const t of ticks) {
    const last = out[out.length - 1];
    if (last && t - last[last.length - 1]! <= 3) last.push(t);
    else out.push([t]);
  }
  return out;
};

/** Whether soldier `id` struck a blow on tick `t` (he acted, has a foe, and loosed nothing). */
const struck = (b: Battle, id: number, t: number, shots: Projectile[]) => {
  const s = b.soldiers[id]!;
  return s.state === State.Fighting && s.actedAt === t && s.target >= 0 && !shots.some((p) => p.shooter === id);
};

describe('battle: missile drill (v11)', () => {
  it('foot shooters never loose while their block walks or wheels; horse archers do', () => {
    const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
    const army = (hue: number, faction: FactionId): ArmySpec => ({ ...plainArmy(MIX.map((f) => Math.round(300 * f)), hue, faction), commander: true });
    let footShots = 0;
    let movingTicks = 0;
    let horseOnTheMove = 0;
    for (const [seed, faction] of [[1, 'templar'], [2, 'samurai']] as const) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(0, faction), army(200, faction)] });
      const fresh = shotsOf(b);
      // The tick on which each regiment last walked or wheeled. (Since v17, QA2 #2, a block of
      // foot shooters turning a little to follow its target, within 30 degrees of the front it
      // last stood to, has not wheeled: its men keep their places and shoot a little to the side.)
      const moved = new Map<number, number>();
      const rest = new Map<number, [number, number]>();
      while (!b.done() && b.tick < 1500) {
        const before = b.regiments.map((r) => [r.ax, r.ay, r.fx, r.fy]);
        b.step();
        const t = b.tick - 1;
        for (const r of b.regiments) {
          const [ax, ay, fx, fy] = before[r.id]!;
          const turned = r.fx !== fx || r.fy !== fy;
          const [rx, ry] = rest.get(r.id) ?? [fx!, fy!];
          if (!turned) rest.set(r.id, [r.fx, r.fy]);
          const tracking = r.role === 'missile' && r.fx * rx + r.fy * ry >= 0.866;
          if (r.ax === ax && r.ay === ay && (!turned || tracking)) continue;
          moved.set(r.id, t);
          if (r.role === 'missile' && r.alive > 0) movingTicks++;
        }
        for (const p of fresh()) {
          const r = b.regiments[b.soldiers[p.shooter]!.reg]!;
          if (r.role === 'horse-archer') {
            if (moved.get(r.id) === t) horseOnTheMove++;
          } else {
            footShots++;
            // Not while moving, nor in the moment after it halted.
            expect(t - (moved.get(r.id) ?? -100), `${r.role} #${r.id} shot at ${t} in mode ${r.mode}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
    expect(footShots).toBeGreaterThan(500);
    // The shooters did move about (so the rule was put to the test), and horse archers shot riding.
    expect(movingTicks).toBeGreaterThan(200);
    expect(horseOnTheMove).toBeGreaterThan(20);
  }, 60_000);

  it('formed shooters loose in volleys on the word: the loaded men together, then a pause of a reload', () => {
    // [faction, class, volley every (ticks)]: bows quickest, then crossbows, then matchlocks
    // (which after their first volley fire rank by rank, S3: a rank's volley every 300 / ranks),
    // and the undead's heavy arbalests slowest of all.
    // Since the v17 reloads: 7.5 s, 12 s, 30 s and 29.1 s (docs/art-references/missile-drill.md).
    for (const [faction, cls, cycle] of [['templar', U.Archers, 75], ['templar', U.Crossbowmen, 120], ['samurai', U.Crossbowmen, 300], ['undead', U.Crossbowmen, 291]] as const) {
      expect(fireEvery(factionStats(faction)[cls]!), `${faction} ${cls}`).toBe(cycle);
      const { b } = butts(faction, cls);
      const reg = b.regiments.find((r) => r.team === 0 && r.cls === cls)!;
      const ranks = faction === 'samurai' ? Math.min(DOCTRINE.samurai.ripple, reg.rows) : 1;
      const every = Math.ceil(cycle / ranks);
      const fresh = shotsOf(b);
      // Each regiment keeps its own volley clock.
      const ticks = new Map<number, number[]>();
      while (b.tick < 600 && !b.done()) { // (until the foe walks up and they fire at will)
        b.step();
        for (const p of fresh()) {
          if (p.team !== 0) continue;
          const reg = b.soldiers[p.shooter]!.reg;
          if (!ticks.has(reg)) ticks.set(reg, []);
          ticks.get(reg)!.push(p.born);
        }
      }
      const name = `${faction} ${cls}`;
      const all = [...ticks.values()].reduce((n, t) => n + t.length, 0);
      expect(all, name).toBeGreaterThan(cls === U.Archers ? 150 : 25);
      const gaps: number[] = [];
      let inVolleys = 0;
      for (const [reg, t] of ticks) {
        expect(b.regiments[reg]!.atWill, name).toBe(false);
        // Nearly every shot is in a volley of three or more, each loosed within half a second.
        // (A rank's volley may be small: the first after the whole block's, half its men still loading.)
        const big = bursts(t).filter((v) => v.length >= (ranks > 1 ? 2 : 3));
        inVolleys += big.reduce((n, v) => n + v.length, 0);
        for (const v of big) expect(v[v.length - 1]! - v[0]!, name).toBeLessThan(5);
        gaps.push(...big.slice(1).map((v, i) => v[0]! - big[i]![0]!));
      }
      expect(inVolleys, name).toBeGreaterThan(all * (ranks > 1 ? 0.85 : 0.9));
      // Volleys a reload and the "make ready, present" beat apart.
      gaps.sort((x, y) => x - y);
      // (Rank by rank, the rhythm is a rank's volley a share of the cycle apart, a rank missing its
      // turn now and then while its men reload after the whole block's first volley.)
      if (ranks > 1) {
        expect(gaps[gaps.length >> 1], name).toBeLessThan(cycle);
        expect(gaps[gaps.length >> 1], name).toBeGreaterThanOrEqual(every - 12);
      } else expect(gaps[gaps.length >> 1], name).toBe(every);
    }
  });

  it('under a close charge they fire at will, point-blank, then sling bows and fight', () => {
    // (Steadier than archers usually are, so that they stand to fight rather than run at once.
    // Swordsmen come at them: since v17's weapon reach, spearmen stand them off at their points
    // and the bowmen hardly strike a blow, see reach.test.ts. Even at 250-290 apart.)
    const b = new Battle({ version: BATTLE_VERSION, seed: 2, kind: 'daily', armies: [{ ...plainArmy(only(U.Archers, 20)), moraleBonus: 40 }, plainArmy(only(U.HeavyInfantry, 30), 200)] });
    b.generals[0].fixedPlan = 'hold';
    const bows = b.regiments.find((r) => r.team === 0)!;
    const foot = b.regiments.find((r) => r.team === 1)!;
    placeRegiment(b, bows, 700, 600, 1, 0);
    // (270 apart: with the v17 reloads, a volley every 7.5 s, whether a block gets its at-will shots
    // off before the foe is in among it turns on where the last volley fell in its run-in. From
    // 230-250 on this seed the last volley came as the foot broke into their charge.)
    placeRegiment(b, foot, 970, 600, -1, 0);
    const fresh = shotsOf(b);
    let volleyShots = 0;
    let atWill = 0;
    let flat = 0;
    let engagedShots = 0;
    let engaged = false;
    let blows = 0;
    while (b.tick < 600 && !b.done()) {
      b.step();
      const t = b.tick - 1;
      const shots = fresh().filter((p) => p.team === 0);
      for (const p of shots) {
        if (bows.engaged) engagedShots++;
        else if (bows.atWill) {
          atWill++;
          if (p.arc < Math.hypot(p.x1 - p.x0, p.y1 - p.y0) * 0.1) flat++;
        } else volleyShots++;
      }
      engaged ||= bows.engaged;
      for (const id of bows.members) if (struck(b, id, t, shots)) blows++;
    }
    // Volleys at range; at will as the foot came on, bows level at point-blank. (Since v14 the
    // eager foot runs in ahead of their ranks and close before a second volley at will: the
    // flat shots are those of the first, at the men out in front.)
    expect(volleyShots).toBeGreaterThan(40);
    expect(atWill).toBeGreaterThan(10);
    expect(flat).toBeGreaterThan(atWill * 0.15);
    // Locked in melee nobody shoots: they fight.
    expect(engaged).toBe(true);
    expect(engagedShots).toBe(0);
    expect(blows).toBeGreaterThan(8);
  });

  it('a man who falls in with a block of shooters mid-volley looses with its next volley', () => {
    const { b } = butts('templar', U.Archers);
    const [a, c] = b.regiments.filter((r) => r.team === 0) as [Regiment, Regiment];
    placeRegiment(b, c, 700, 600 + a.width + 8, 1, 0);
    // Between two of a's volleys, a loaded man of c (waiting for c's word) falls in with a.
    let man = -1;
    while (b.tick < 200 && man < 0) {
      b.step();
      if (b.tick < 40 || a.mode !== 'shoot' || a.volleyAt - b.tick < 3) continue;
      man = c.members.find((id) => b.soldiers[id]!.cooldown === 0 && b.soldiers[id]!.ammo > 0) ?? -1;
    }
    expect(man).toBeGreaterThanOrEqual(0);
    (b as unknown as { fallIn(i: number, from: Regiment, o: Regiment): void }).fallIn(man, c, a);
    const next = a.volleyAt;
    const fresh = shotsOf(b);
    let at = -1;
    while (b.tick < next + 10 && at < 0) {
      b.step();
      for (const p of fresh()) if (p.shooter === man) at = p.born;
    }
    // Not before the word, and in the volley's half second.
    expect(at).toBeGreaterThanOrEqual(next);
    expect(at).toBeLessThan(next + 5);
  });

  it('at-will fire runs straight into the melee, with no idle gap', () => {
    // Light horse charges archers: arrows right up to the contact, and blows at once.
    const b = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [plainArmy(only(U.Archers, 40)), plainArmy(only(U.LightCavalry, 8), 200)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].rashKnights = true;
    const bows = b.regiments.find((r) => r.team === 0)!;
    placeRegiment(b, bows, 700, 600, 1, 0);
    // (200 apart: see above; from 260 and more the last volley flies as the horse is 100 away,
    // and nobody has reloaded by the time it is in among them.)
    b.regiments.filter((r) => r.team === 1).forEach((r) => placeRegiment(b, r, 900, 600, -1, 0));
    const fresh = shotsOf(b);
    let lastAtWill = -1;
    let firstBlow = -1;
    while (b.tick < 600 && !b.done() && firstBlow < 0) {
      b.step();
      const t = b.tick - 1;
      const shots = fresh().filter((p) => p.team === 0);
      if (shots.length && bows.atWill) lastAtWill = t;
      for (const id of bows.members) if (struck(b, id, t, shots)) firstBlow = t;
    }
    expect(lastAtWill).toBeGreaterThan(0);
    expect(firstBlow).toBeGreaterThan(0);
    // (The horse's impact stuns the men it hits for a moment. At will a bowman nocks again in 5 s
    // since v17 (`BOW_BURST`): he gets one arrow off at the horse in its last 100 or so, then draws
    // as it comes in, about a second and a half at the gallop.)
    expect(firstBlow - lastAtWill).toBeLessThan(20);
  });
});

describe('battle: the volley clock (v17, QA review 2 #2)', () => {
  it('a block of archers following its target round a little keeps its volleys', () => {
    // Between two volleys the target steps 40 degrees off the archers' front: they wheel toward it
    // (`aimAt`, to within 25 degrees) and keep the rhythm of their volleys, a reload and a beat
    // apart. Until v17 the turn restarted the clock: the word came a beat after it, with most
    // men still reloading, and then a whole cycle later, 3 s late.
    const { b, shooters: a } = butts('templar', U.Archers);
    const foe = b.regiments.find((r) => r.team === 1)!;
    b.regiments.filter((r) => r.team === 1 && r !== foe).forEach((r, i) => placeRegiment(b, r, 1400, 200 + i * 90, -1, 0));
    placeRegiment(b, foe, 1050, 600, -1, 0);
    const fresh = shotsOf(b);
    const ticks: number[] = [];
    let turned = 0;
    while (b.tick < 330) {
      // (cos 40 = 0.766, sin 40 = 0.643)
      if (b.tick === 120) placeRegiment(b, foe, 700 + 350 * 0.766, 600 + 350 * 0.643, -0.766, -0.643);
      const fx = a.fx;
      const fy = a.fy;
      b.step();
      if (a.fx !== fx || a.fy !== fy) turned++;
      for (const p of fresh()) if (b.soldiers[p.shooter]!.reg === a.id) ticks.push(p.born);
    }
    expect(turned).toBeGreaterThan(3);
    expect(a.fx * 0.766 + a.fy * 0.643).toBeGreaterThan(0.9);
    const starts = bursts(ticks).filter((v) => v.length >= 3).map((v) => v[0]!);
    expect(starts.length).toBeGreaterThanOrEqual(4);
    for (let k = 1; k < starts.length; k++) expect(starts[k]! - starts[k - 1]!, `volleys at ${starts.join(', ')}`).toBeLessThanOrEqual(fireEvery(factionStats('templar')[U.Archers]!));
  });

  it('a volley most men held back from is called again a beat later, not a reload later', () => {
    const { b, shooters: a } = butts('templar', U.Archers);
    const fresh = shotsOf(b);
    // The first volley.
    let first = -1;
    while (b.tick < 300 && first < 0) {
      b.step();
      if (fresh().some((p) => b.soldiers[p.shooter]!.reg === a.id)) first = b.tick;
    }
    expect(first).toBeGreaterThan(0);
    while (b.tick < first + 10) {
      b.step();
      fresh();
    }
    // Every man is loaded again, as if he had held his shot (danger close, a friend on the line).
    for (const id of a.members) (b as unknown as { d: { cd: Int32Array } }).d.cd[id] = 0;
    const held = b.tick;
    let next = -1;
    while (b.tick < held + 80 && next < 0) {
      b.step();
      if (fresh().some((p) => b.soldiers[p.shooter]!.reg === a.id)) next = b.tick;
    }
    // The word a beat later (and its half second), not the 7.5 s cycle.
    expect(next).toBeGreaterThan(held);
    expect(next - held).toBeLessThan(15);
  });

  it('a word given while most men are still reloading waits for them', () => {
    const { b, shooters: a } = butts('templar', U.Archers);
    const fresh = shotsOf(b);
    while (b.tick < 300 && !fresh().some((p) => b.soldiers[p.shooter]!.reg === a.id)) b.step();
    // All reloading, and the word is due now: it waits until most are loaded, then they loose together.
    const d = (b as unknown as { d: { cd: Int32Array } }).d;
    for (const id of a.members) d.cd[id] = 40;
    a.volleyAt = b.tick + 1;
    const ticks: number[] = [];
    const t0 = b.tick;
    while (b.tick < t0 + 60) {
      b.step();
      for (const p of fresh()) if (b.soldiers[p.shooter]!.reg === a.id) ticks.push(p.born);
    }
    expect(ticks.length).toBeGreaterThan(8);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(t0 + 38);
    expect(Math.max(...ticks) - Math.min(...ticks)).toBeLessThan(5);
  });
});
