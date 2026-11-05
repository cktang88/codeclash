// Battle v14: looser, livelier battles (docs/art-references/battle-cohesion.md; COHESION in
// command.ts). Ragged approach (P1), cavalry that rallies and charges again (P4), files that wrap
// an overlapped flank (P6), wider gaps between blocks, and no side bias from any of it.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, DOCTRINE, FIELD_H, State, type ArmySpec, type Regiment } from './battle.ts';
import type { FactionId } from './factions.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { emptyCounts, U } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, faction: FactionId, hue = 0): ArmySpec => ({
  name: faction, faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true,
});
const battle = (seed: number, a: ArmySpec, b: ArmySpec) => new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [a, { ...b, hue: 200 }] });

interface Inside {
  d: { x: Float64Array; y: Float64Array; sx: Float64Array; sy: Float64Array; state: Uint8Array };
}
/** How far each fighting man of `r` stands from his slot. */
function slotDistances(b: Battle, r: Regiment, out: number[]): void {
  const d = (b as unknown as Inside).d;
  for (const id of r.members) {
    if (d.state[id] !== State.Fighting) continue;
    const gx = r.ax + r.fx * d.sy[id]! - r.fy * d.sx[id]!;
    const gy = r.ay + r.fy * d.sy[id]! + r.fx * d.sx[id]!;
    out.push(Math.hypot(d.x[id]! - gx, d.y[id]! - gy));
  }
}
const FIELD_MID = FIELD_H / 2;
const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;

describe('cohesion: room between blocks', () => {
  // (Since the scale rework, docs/art-references/battle-scale.md: 44-80 apart and 150 out; until then 22-34 and 60.)
  it('blocks of the line stand 44-80 apart, the horse on the wings 150 out', () => {
    for (const men of [250, 1200, 2800]) {
      const b = battle(3, army(men, 'templar'), army(men, 'samurai'));
      for (const team of [0, 1]) {
        const first = b.regiments.filter((r) => r.team === team && r.line === 1).sort((p, q) => p.ay - q.ay);
        expect(first.length).toBeGreaterThan(1);
        for (let i = 1; i < first.length; i++) {
          const gap = first[i]!.ay - first[i]!.width / 2 - (first[i - 1]!.ay + first[i - 1]!.width / 2);
          expect(gap).toBeGreaterThanOrEqual(44 - 1e-6);
          expect(gap).toBeLessThanOrEqual(80 + 1e-6);
        }
        // The horse on the wings: well clear of the line's ends, its first row a little before it.
        const top = Math.min(...first.map((r) => r.ay - r.width / 2));
        const bottom = Math.max(...first.map((r) => r.ay + r.width / 2));
        const wings = b.regiments.filter((x) => x.team === team && (x.role === 'flank' || x.role === 'shock-cav' || x.role === 'horse-archer'));
        for (const r of wings) {
          if (r.ay - r.width / 2 > FIELD_MID) expect(r.ay - r.width / 2 - bottom).toBeGreaterThanOrEqual(149);
          else expect(top - (r.ay + r.width / 2)).toBeGreaterThanOrEqual(149);
        }
        expect(Math.max(...wings.map((r) => (r.ax - first[0]!.ax) * r.fx))).toBeGreaterThan(10);
      }
    }
  });
});
describe('cohesion: a ragged approach (P1)', () => {
  it('men stride ahead of and behind their slots on the march, within bounds; the Templars least, the samurai most', () => {
    const by: Record<string, number[]> = { templar: [], samurai: [], undead: [] };
    for (const [fa, fb] of [['templar', 'samurai'], ['samurai', 'undead'], ['undead', 'templar']] as const) {
      const b = battle(7, army(600, fa), army(600, fb));
      // The approach to about contact (60 s; it was 24 s until the scale rework, when the armies
      // deployed half as far apart), blocks marching in line: on the long approach they now march
      // much of the way in column, whose men keep their files.
      while (!b.done() && b.tick < 600) {
        b.step();
        if (b.tick % 10) continue;
        for (const r of b.regiments) if (r.role === 'line' && r.mode === 'advance' && r.stance !== 'column' && !r.routed) slotDistances(b, r, by[b.setup.armies[r.team]!.faction]!);
      }
    }
    const all = [...by.templar!, ...by.samurai!, ...by.undead!];
    // Not a ruler (v13: p50 1.1, p90 4.6), not a mob.
    expect(pct(all, 0.5)).toBeGreaterThan(1.8);
    expect(pct(all, 0.5)).toBeLessThan(5);
    expect(pct(all, 0.9)).toBeGreaterThan(5);
    expect(pct(all, 0.9)).toBeLessThan(12);
    // A man never runs a rank and more ahead of his place (the lead's cap) on a steady march.
    expect(pct(all, 0.98)).toBeLessThan(25);
    // The Rule keeps the Templar front tight; the keen samurai run ahead for the first spear.
    expect(pct(by.templar!, 0.5)).toBeLessThan(pct(by.samurai!, 0.5));
  }, 60_000);
});

describe('cohesion: overlapping files wrap the flank (P6)', () => {
  /** A wide samurai block (120) against a narrow one (30), with the faction's curl times `curl`: the share of its fighters past the narrow block's frontage, and of their blows at its flank. */
  function wrap(curl: number): { past: number; flank: number } {
    let out = 0;
    let inn = 0;
    let flank = 0;
    let front = 0;
    const keep = DOCTRINE.samurai.loose.curl;
    DOCTRINE.samurai.loose.curl = keep * curl;
    try {
      for (const seed of [1, 2, 3, 4]) {
        const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 120), 0, 'samurai'), plainArmy(only(U.HeavyInfantry, 30), 200, 'templar')] });
        b.generals[1].fixedPlan = 'hold';
        const w = b.regiments.find((r) => r.team === 0)!;
        const n = b.regiments.find((r) => r.team === 1)!;
        placeRegiment(b, w, 760, 600, 1, 0);
        placeRegiment(b, n, 830, 600, -1, 0);
        let contact = -1;
        while (!b.done() && b.tick < 400) {
          b.step();
          if (contact < 0 && w.engaged) contact = b.tick;
          if (contact < 0 || b.tick < contact + 20 || b.tick > contact + 150 || b.tick % 5) continue;
          for (const id of w.members) {
            const s = b.soldiers[id]!;
            if (s.state !== State.Fighting || s.target < 0) continue;
            const t = b.soldiers[s.target]!;
            if (Math.hypot(t.x - s.x, t.y - s.y) > 8) continue;
            if (Math.abs((s.x - n.ax) * -n.fy + (s.y - n.ay) * n.fx) > n.width / 2 + 2) out++;
            else inn++;
            const ux = s.x - t.x;
            const uy = s.y - t.y;
            if ((ux * n.fx + uy * n.fy) / (Math.hypot(ux, uy) || 1) < 0.3) flank++;
            else front++;
          }
        }
      }
    } finally {
      DOCTRINE.samurai.loose.curl = keep;
    }
    return { past: out / (out + inn), flank: flank / (flank + front) };
  }

  it('the files beyond the enemy front swing round it, and take it in flank', () => {
    const curled = wrap(1);
    const square = wrap(0);
    expect(curled.past).toBeGreaterThan(0.2);
    expect(curled.past).toBeGreaterThan(square.past * 1.4);
    expect(curled.flank).toBeGreaterThan(square.flank);
  }, 60_000);
});

describe('cohesion: horse breaks off, rallies and charges again (P4)', () => {
  it('against horse: clash, break off as a loose crowd, close up on the rally point, charge again; four times at most', () => {
    let cycled = 0;
    let regs = 0;
    for (const seed of [1, 2, 3]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.LightCavalry, 30)), plainArmy(only(U.LightCavalry, 30), 200)] });
      for (const r of b.regiments) placeRegiment(b, r, r.team === 0 ? 740 : 860, 600 + ((r.id % 3) - 1) * 40, r.team === 0 ? 1 : -1, 0);
      const seq = new Map<number, string[]>();
      let looseOut = 0;
      let looseIn = 0;
      let nOut = 0;
      let nIn = 0;
      while (!b.done() && b.tick < 900) {
        b.step();
        for (const r of b.regiments) {
          const m = r.mode === 'hold' && r.reformUntil > b.tick ? 'reform' : r.mode;
          const a = seq.get(r.id) ?? [];
          if (a[a.length - 1] !== m) a.push(m);
          seq.set(r.id, a);
          if (b.tick % 5 === 0 && r.alive > 5 && (m === 'withdraw' || m === 'charge')) {
            // Riding out it is a crowd, not a block backing away: men further from their slots.
            const ds: number[] = [];
            slotDistances(b, r, ds);
            const mean = ds.reduce((x, y) => x + y, 0) / ds.length;
            if (m === 'withdraw' && b.tick - r.modeAt > 10) {
              looseOut += mean;
              nOut++;
            } else if (m === 'charge') {
              looseIn += mean;
              nIn++;
            }
          }
        }
      }
      for (const r of b.regiments) {
        regs++;
        expect(r.cycles).toBeLessThanOrEqual(4);
        const s = seq.get(r.id)!.join(' ');
        if (/melee withdraw( hold)? reform( hold)?( flank)? charge/.test(s)) cycled++;
      }
      expect(nOut).toBeGreaterThan(0);
      expect(looseOut / nOut).toBeGreaterThan((looseIn / nIn) * 1.2);
    }
    // In these clashes of horse the side that has the worst of it breaks off (the stronger seldom),
    // rallies and comes again: most of the time, one side's horse or both.
    expect(cycled).toBeGreaterThanOrEqual(regs * 0.4);
  }, 60_000);

  it('the T1 override: Templar knights breaking off from foot ride back to the Marshal', () => {
    const b = battle(2, army(600, 'templar'), army(600, 'samurai'));
    const inside = b as unknown as { rallyPoint(r: Regiment, from: Regiment, shock: boolean): void; commander: [number, number] };
    while (b.tick < 5) b.step();
    const knights = b.regiments.find((r) => r.team === 0 && r.role === 'shock-cav')!;
    const foot = b.regiments.find((r) => r.team === 1 && r.role === 'line')!;
    const horse = b.regiments.find((r) => r.team === 1 && r.role === 'flank')!;
    const m = b.soldiers[inside.commander[0]]!;
    // Within the Marshal's reach: to his banner, from foot; from horse, close by.
    placeRegiment(b, knights, m.x + 150, m.y, 1, 0);
    inside.rallyPoint(knights, foot, true);
    expect(knights.toBanner).toBe(true);
    expect(Math.hypot(knights.wx - m.x, knights.wy - m.y)).toBeLessThan(DOCTRINE.templar.recallTo + 60);
    inside.rallyPoint(knights, horse, true);
    expect(knights.toBanner).toBe(false);
  });

  it('horse sent at a block of the line that is cutting down the archers behind it does not break off', () => {
    const b = battle(3, army(600, 'templar'), army(600, 'templar'));
    const inside = b as unknown as { breaksOff(r: Regiment, o: Regiment): boolean; d: { target: Int32Array } };
    while (b.tick < 5) b.step();
    const knights = b.regiments.find((r) => r.team === 0 && r.role === 'shock-cav')!;
    const foot = b.regiments.find((r) => r.team === 1 && r.role === 'line')!;
    const bows = b.regiments.find((r) => r.team === 1 && r.role === 'missile')!;
    knights.meleeTicks = 100;
    const fightAll = (o: Regiment) => knights.members.forEach((id, k) => (inside.d.target[id] = o.members[k % o.members.length]!));
    // Its target is the foot; its men fight the foot: it breaks off to charge again.
    fightAll(foot);
    expect(inside.breaksOff(knights, foot)).toBe(true);
    // Its target is the foot, but its men are among the archers: it rides them down.
    fightAll(bows);
    expect(inside.breaksOff(knights, foot)).toBe(false);
  });
});

describe('cohesion: no side bias', () => {
  it('a samurai mirror (the loosest doctrine: lead, curl, surge) is a fair fight from either side', () => {
    let left = 0;
    for (let seed = 1; seed <= 30; seed++) if (battle(seed, army(250, 'samurai'), army(250, 'samurai')).run().winner === 0) left++;
    // 30 battles: 9-21 is a fair coin at p ~ 0.04.
    expect(left).toBeGreaterThanOrEqual(9);
    expect(left).toBeLessThanOrEqual(21);
  }, 120_000);

  it('the cohesion rules are mirrored: lead, curl and lulls look the same from either side', () => {
    // Two identical blocks set up in mirror image: each side's men stand as far from their
    // slots, and as many swing round a flank, within a few per cent.
    const b = new Battle({ version: BATTLE_VERSION, seed: 5, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 90), 0, 'samurai'), plainArmy(only(U.HeavyInfantry, 90), 200, 'samurai')] });
    const [a, c] = [b.regiments.find((r) => r.team === 0)!, b.regiments.find((r) => r.team === 1)!];
    placeRegiment(b, a, 700, 600, 1, 0);
    placeRegiment(b, c, 900, 600, -1, 0);
    const dev: [number[], number[]] = [[], []];
    while (!b.done() && b.tick < 300) {
      b.step();
      if (b.tick % 5) continue;
      slotDistances(b, a, dev[0]);
      slotDistances(b, c, dev[1]);
    }
    const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length;
    expect(Math.abs(mean(dev[0]) - mean(dev[1]))).toBeLessThan(0.25 * Math.max(mean(dev[0]), mean(dev[1])));
  });
});
