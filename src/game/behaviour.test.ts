import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, MAX_TICKS, State, type ArmySpec, type BattleSetup } from './battle.ts';
import type { FactionId } from './factions.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, faction: FactionId, hue = 0): ArmySpec => ({
  name: faction, faction, hue, counts: mix.map((f) => Math.round(n * f)), veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true,
});
const factions: FactionId[] = ['templar', 'samurai', 'undead'];
const battles = (n: number, f: (b: Battle) => void): void => {
  for (let seed = 1; seed <= n; seed++) {
    const setup: BattleSetup = { version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(500, factions[seed % 3]!), army(520, factions[(seed + 1) % 3]!, 200)] };
    f(new Battle(setup));
  }
};

/** One block of foot of `cls` (team 0) facing one of `foe` (team 1) 140 apart (or `back` more); returns the battle. */
const footFight = (cls: number, foe: number, seed = 2, back = 0) => {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(cls, 30)), plainArmy(only(foe, 30), 200)] });
  b.generals[1].fixedPlan = 'hold';
  b.generals[0].fixedPlan = 'advance';
  const a = b.regiments.find((r) => r.team === 0)!;
  const e = b.regiments.find((r) => r.team === 1)!;
  placeRegiment(b, e, 900, 600, -1, 0);
  placeRegiment(b, a, 760 - back, 600, 1, 0);
  return { b, a, e };
};

describe('battle: the march', () => {
  it('all formed foot marches at the drill’s pace, the heaviest included (formations.md 7.11: 11 u/s)', () => {
    // Anchor speed over a second of a straight march toward an enemy far off, per class.
    const pace = (cls: number) => {
      const b = new Battle({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [plainArmy(only(cls, 30)), plainArmy(only(U.HeavyInfantry, 30), 200)] });
      b.generals[0].fixedPlan = 'advance';
      b.generals[1].fixedPlan = 'hold';
      const a = b.regiments.find((r) => r.team === 0)!;
      placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 1500, 600, -1, 0);
      placeRegiment(b, a, 200, 600, 1, 0);
      while (b.tick < 80) b.step();
      expect(a.mode).toBe('advance');
      const x0 = a.ax;
      while (b.tick < 90) b.step();
      return a.ax - x0;
    };
    const heavy = pace(U.HeavyInfantry);
    expect(heavy).toBeGreaterThan(10);
    // (Line foot: missiles march in loose order, which sets its own pace.)
    for (const cls of [U.Spearmen, U.Shock]) expect(Math.abs(pace(cls) / heavy - 1)).toBeLessThan(0.005);
  });
});

describe('battle: infantry charges', () => {
  it('foot closes the last stretch at a run, gaining impetus, and the run is drawn as a run', () => {
    const { b, a } = footFight(U.HeavyInfantry, U.Spearmen);
    let fastest = 0;
    let impetus = 0;
    let charged = false;
    while (!b.done() && b.tick < 300 && !a.engaged) {
      b.step();
      if (a.mode !== 'charge') continue;
      charged = true;
      for (const id of a.members) {
        const s = b.soldiers[id]!;
        fastest = Math.max(fastest, Math.hypot(s.vx, s.vy) / s.s.speed);
        impetus = Math.max(impetus, s.impetus);
      }
    }
    expect(charged).toBe(true);
    expect(b.events.some((e) => e.kind === 'charge' && e.cls === U.HeavyInfantry)).toBe(true);
    // The renderer draws a man faster than 1.2x his walking speed with the run clip.
    expect(fastest).toBeGreaterThan(1.25);
    expect(impetus).toBeGreaterThan(0.6);
  });

  it('a charge of shock troops hits harder than heavy foot, heavy foot harder than spears, and horse hardest', () => {
    // The shock: morale the defenders lose in the second after the first blow lands.
    const shock = (cls: number, seed: number, back: number) => {
      const { b, a, e } = cls === U.Knights
        ? (() => {
          const x = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(cls, 12)), plainArmy(only(U.HeavyInfantry, 30), 200)] });
          x.generals[1].fixedPlan = 'hold';
          x.generals[0].rashKnights = true;
          const h = x.regiments.find((r) => r.team === 0)!;
          const f = x.regiments.find((r) => r.team === 1)!;
          placeRegiment(x, f, 900, 600, -1, 0);
          placeRegiment(x, h, 760 - back, 600, 1, 0);
          return { b: x, a: h, e: f };
        })()
        : footFight(cls, U.HeavyInfantry, seed, back);
      void a;
      let first = -1;
      let before = 0;
      let stunned = 0;
      while (!b.done() && b.tick < 400) {
        b.step();
        if (first < 0 && b.soldiers.some((s) => s.team === 1 && s.hitAt === b.tick - 1)) {
          first = b.tick;
          before = e.morale;
        }
        if (first >= 0) {
          for (const id of e.members) if (b.soldiers[id]!.stunned > 0 && b.soldiers[id]!.state === State.Fighting) stunned++;
          if (b.tick - first >= 10) break;
        }
      }
      return { drop: before - e.morale, stunned };
    };
    // Morale the defenders (heavy foot) lose in the second after the first blow, over 48 fights:
    // 4 seeds, each from 12 starting distances a few units apart. The seed alone barely changes
    // these set pieces; what does is on which tick, relative to the captains' half-second looks,
    // the blocks meet (whether a charge is still a charge when it lands). Over one distance, v5
    // timing changes alone swapped heavy foot and spears, and v6's slower march swapped shock
    // troops and heavy foot.
    const drop = (cls: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 4; seed++) for (let k = 0; k < 12; k++) sum += shock(cls, seed, k * 3).drop;
      return sum / 48;
    };
    const knights = drop(U.Knights);
    const sh = drop(U.Shock);
    const heavy = drop(U.HeavyInfantry);
    const spears = drop(U.Spearmen);
    expect(knights).toBeGreaterThan(sh);
    expect(sh).toBeGreaterThan(heavy);
    expect(heavy).toBeGreaterThan(spears);
  });

  it('generals order infantry charges: at wavering blocks, archers caught in the open, and a general charge', () => {
    let foot = 0;
    let general = 0;
    let ragged = 0;
    battles(6, (b) => {
      const seen = new Set<number>();
      while (!b.done()) {
        b.step();
        for (const r of b.regiments) if (r.ragged && !seen.has(r.id)) seen.add(r.id);
      }
      ragged += seen.size;
      foot += b.events.filter((e) => e.kind === 'charge' && (e.cls === U.HeavyInfantry || e.cls === U.Spearmen || e.cls === U.Shock)).length;
      general += b.events.filter((e) => e.kind === 'general-order' && e.order === 'charge').length;
    });
    expect(foot).toBeGreaterThan(30);
    expect(general).toBeGreaterThan(0);
    // Charging from too far is the exception (a fleeing target), not the rule.
    expect(ragged).toBeLessThan(foot / 4);
  }, 60_000);
});

describe('battle: routs are a scatter, not a march', () => {
  it('broken men run each his own way and pace, and the block dissolves', () => {
    const spread: number[] = [];
    const paces: number[] = [];
    const growth: number[] = [];
    battles(4, (b) => {
      const track = new Map<number, { t0: number; r0: number }>();
      while (!b.done()) {
        b.step();
        for (const r of b.regiments) {
          if (r.routed && r.alive > 12 && r.role === 'line' && !track.has(r.id)) track.set(r.id, { t0: b.tick, r0: r.radius });
        }
        for (const [id, { t0, r0 }] of track) {
          if (b.tick - t0 !== 25) continue;
          const r = b.regiments[id]!;
          let sx = 0;
          let sy = 0;
          const v: number[] = [];
          for (const m of r.members) {
            const s = b.soldiers[m]!;
            if (s.state !== State.Routing) continue;
            const q = Math.hypot(s.vx, s.vy) || 1;
            sx += s.vx / q;
            sy += s.vy / q;
            v.push(q / s.s.speed);
          }
          if (v.length < 6) continue;
          spread.push(1 - Math.hypot(sx, sy) / v.length);
          const mean = v.reduce((x, y) => x + y, 0) / v.length;
          paces.push(Math.sqrt(v.reduce((x, y) => x + (y - mean) ** 2, 0) / v.length) / mean);
          growth.push(r.radius / r0);
        }
      }
    });
    const median = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1]!;
    expect(spread.length).toBeGreaterThan(10);
    // Headings fan out (1 - mean resultant length; a block marching off is ~0.01).
    expect(median(spread)).toBeGreaterThan(0.06);
    // Paces differ man to man.
    expect(median(paces)).toBeGreaterThan(0.08);
    // The block spreads out as it runs.
    expect(median(growth)).toBeGreaterThan(1.3);
  }, 60_000);
});

describe('battle: breaking ranks to chase', () => {
  it('eager troops chase fugitives on their own, the disciplined seldom, and they are called back', () => {
    const chases: Record<string, number> = {};
    const regs: Record<string, number> = {};
    let farthest = 0;
    let longest = 0;
    let loose = 0;
    let tight = 0;
    // 18 days: a light horse regiment chases on a 30% chance at each half-second look while
    // fugitives are near, so over 9 the count swung from 0.17 to 0.66 a regiment on timing alone.
    battles(18, (b) => {
      for (const r of b.regiments) {
        const k = `${b.setup.armies[r.team]!.faction}/${r.cls}`;
        regs[k] = (regs[k] ?? 0) + 1;
      }
      while (!b.done()) {
        b.step();
        for (const r of b.regiments) {
          if (r.chaseAt < 0 || r.ord.kind === 'pursue' || r.alive < 8) continue;
          farthest = Math.max(farthest, Math.hypot(r.ax - r.chaseX, r.ay - r.chaseY) / (isHorse(r.cls) ? 200 + 400 * r.eager : 120 + 260 * r.eager));
          const L = (b.tick - r.chaseAt) / (isHorse(r.cls) ? 120 + 300 * r.eager : 80 + 220 * r.eager);
          longest = Math.max(longest, L);
          // Loose: the men stand further apart than in their ranks.
          if (r.mode === 'pursue' && !isHorse(r.cls) && b.tick % 10 === 0) {
            if (r.radius > Math.hypot(r.width, r.depth) * 0.5 * 1.25) loose++;
            else tight++;
          }
        }
      }
      for (const e of b.events) {
        if (e.kind !== 'chase') continue;
        const k = `${b.setup.armies[e.team]!.faction}/${e.cls}`;
        chases[k] = (chases[k] ?? 0) + 1;
      }
    });
    const rate = (k: string) => (chases[k] ?? 0) / (regs[k] ?? 1);
    // Ghoul spears and the Templars' spear levy chase; the Templar knights (the Rule) and the
    // hatamoto do not leave their banner.
    expect(rate('undead/1')).toBeGreaterThan(0.15);
    expect(rate('templar/1')).toBeGreaterThan(0.1);
    expect(rate('templar/7')).toBeLessThan(rate('templar/1') / 3);
    expect(rate('samurai/7')).toBeLessThan(rate('undead/1') / 3);
    expect(rate('undead/5') + rate('templar/5') + rate('samurai/5')).toBeGreaterThan(0.3);
    // Called back: no chase runs much past its leash (a few strides' slack for the half-second thinks).
    expect(farthest).toBeLessThan(1.25);
    expect(longest).toBeLessThan(1.15);
    expect(loose).toBeGreaterThan(tight);
  }, 120_000);

  it('a regiment that breaks in the middle of a chase is no longer chasing (and does not chase on when it rallies)', () => {
    const { b, a } = footFight(U.Spearmen, U.HeavyInfantry);
    for (let i = 0; i < 20; i++) b.step();
    // Off after fugitives on its own, then its nerve goes.
    a.chaseAt = b.tick;
    a.chaseX = a.ax;
    a.chaseY = a.ay;
    a.morale = 0;
    while (!a.routed && b.tick < 60) b.step();
    expect(a.routed).toBe(true);
    expect(a.chaseAt).toBe(-1);
  });
});

const isHorse = (cls: number) => cls === U.LightCavalry || cls === U.HorseArchers || cls === U.Knights;

describe('battle: a handful of horse against horse', () => {
  // Until v8 these rode round each other at about 40 units until the time limit: the charge aimed
  // 40 past its target, and a rider at a canter could not turn inside it (formations.md 7.11).
  const cases: [string, number[], number[]][] = [
    ['1 knight against 1 knight', only(U.Knights, 1), only(U.Knights, 1)],
    ['1 light horse against 1 light horse', only(U.LightCavalry, 1), only(U.LightCavalry, 1)],
    ['3 knights against 1 light horse', only(U.Knights, 3), only(U.LightCavalry, 1)],
    ['2 knights against 1 light horse', only(U.Knights, 2), only(U.LightCavalry, 1)],
    ['1 knight against 1 light horse', only(U.Knights, 1), only(U.LightCavalry, 1)],
  ];
  for (const [name, a, e] of cases) {
    it(`${name}: they close, fight and finish well before the time limit`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(a), plainArmy(e, 200)] });
        // The first blow (a charge may unhorse a lone rider before its block counts as engaged).
        let melee = -1;
        while (!b.done() && b.tick < MAX_TICKS) {
          b.step();
          if (melee < 0 && (b.regiments.some((r) => r.engaged) || b.soldiers.some((s) => s.hitAt >= 0))) melee = b.tick;
        }
        expect(melee, `seed ${seed}: never came to blows`).toBeGreaterThan(0);
        expect(melee, `seed ${seed}: the first blow`).toBeLessThan(600);
        expect(b.result!.reason, `seed ${seed}`).toBe('rout');
        expect(b.result!.ticks, `seed ${seed}`).toBeLessThan(MAX_TICKS / 2);
      }
    });
  }
});
