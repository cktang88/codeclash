import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type ArmySpec, type BattleSetup } from './battle.ts';
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

/** One block of foot of `cls` (team 0) facing one of `foe` (team 1) 140 apart; returns the battle. */
const footFight = (cls: number, foe: number, seed = 2) => {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(cls, 30)), plainArmy(only(foe, 30), 200)] });
  b.generals[1].fixedPlan = 'hold';
  b.generals[0].fixedPlan = 'advance';
  const a = b.regiments.find((r) => r.team === 0)!;
  const e = b.regiments.find((r) => r.team === 1)!;
  placeRegiment(b, e, 900, 600, -1, 0);
  placeRegiment(b, a, 760, 600, 1, 0);
  return { b, a, e };
};

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
    const shock = (cls: number, seed: number) => {
      const { b, a, e } = cls === U.Knights
        ? (() => {
          const x = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(cls, 12)), plainArmy(only(U.HeavyInfantry, 30), 200)] });
          x.generals[1].fixedPlan = 'hold';
          x.generals[0].rashKnights = true;
          const h = x.regiments.find((r) => r.team === 0)!;
          const f = x.regiments.find((r) => r.team === 1)!;
          placeRegiment(x, f, 900, 600, -1, 0);
          placeRegiment(x, h, 760, 600, 1, 0);
          return { b: x, a: h, e: f };
        })()
        : footFight(cls, U.HeavyInfantry, seed);
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
    // Morale the defenders (heavy foot) lose in the second after the first blow, over 12 fights
    // (heavy foot and spears are close: over 4, v5 timing changes alone swapped them).
    const drop = (cls: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((sum, seed) => sum + shock(cls, seed).drop, 0) / 12;
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
    battles(9, (b) => {
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
});

const isHorse = (cls: number) => cls === U.LightCavalry || cls === U.HorseArchers || cls === U.Knights;
