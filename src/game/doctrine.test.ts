// Battle doctrines (DOCTRINE in command.ts, docs/faction-doctrines.md): each faction's visible
// way of fighting, one test (or two) per doctrine.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, DOCTRINE, MORALE, REGROUP, RISE_TICKS, State, type ArmySpec, type Regiment } from './battle.ts';
import type { FactionId } from './factions.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { emptyCounts, U, UNIT_COUNT } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, faction: FactionId, hue = 0, commander = true): ArmySpec => ({
  name: faction, faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander,
});
const battle = (seed: number, a: ArmySpec, b: ArmySpec) => new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [a, { ...b, hue: 200 }] });
/** The sim's private parts that the tests poke. */
type Inside = { morale(r: Regiment): void; rout(r: Regiment): void };
const inside = (b: Battle) => b as unknown as Inside;

describe('doctrines: the Templars', () => {
  it('T1: the knights wait for the Marshal\'s signal, all ride at its one target, and ride back to his banner', () => {
    // 1000 a side: two regiments of Knight-Brothers.
    let signals = 0;
    let recalled = 0;
    // (Six days: a cycle charge of the knights from foot does not come in every battle; in v15
    // none of the first three days has one.)
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const b = battle(seed, army(1000, 'templar'), army(1000, 'samurai'));
      const g = b.generals[0];
      expect(g.rashKnights).toBe(false);
      const knights = b.regiments.filter((r) => r.team === 0 && r.role === 'shock-cav');
      expect(knights.length).toBeGreaterThanOrEqual(2);
      let checked = false;
      while (!b.done() && b.tick < 2400) {
        b.step();
        // Before the signal no knight charges anything but enemy horse.
        if (g.signalAt < 0) {
          for (const r of knights) if (r.mode === 'charge') expect(b.regiments[r.targetReg]!.role === 'flank' || b.regiments[r.targetReg]!.role === 'shock-cav' || b.regiments[r.targetReg]!.role === 'horse-archer').toBe(true);
        } else if (!checked && b.tick % 15 === 1 && g.signalTarget >= 0) {
          // On it, every knight block not busy with horse rides at the one target.
          checked = true;
          signals++;
          for (const r of knights) if (r.alive > 0 && !r.routed && r.ord.kind !== 'attack') expect(r.ord.target).toBe(g.signalTarget);
          expect(b.events.some((e) => e.kind === 'doctrine' && e.note === 'marshal-charge' && e.team === 0)).toBe(true);
        }
        for (const r of knights) {
          if (r.mode !== 'withdraw' || !r.toBanner || r.modeAt !== b.tick - 1) continue;
          // Pulling out of a cycle charge: back to the Marshal, not 120 straight back.
          const m = b.soldiers[b.commander[0]]!;
          expect(Math.hypot(r.wx - m.x, r.wy - m.y)).toBeLessThan(DOCTRINE.templar.recallTo + 60);
          recalled++;
        }
      }
    }
    expect(signals).toBe(seeds.length);
    expect(recalled).toBeGreaterThan(0);
  }, 240_000);

  it('T2: a broken Templar block may re-form after its rally; a samurai one is shattered', () => {
    for (const f of ['templar', 'samurai'] as const) {
      const b = battle(1, army(400, f), army(400, 'undead'));
      b.step();
      const r = b.regiments.find((x) => x.team === 0 && x.role === 'line')!;
      r.rallies = REGROUP.rallies;
      inside(b).rout(r);
      expect(r.moraleState).toBe(f === 'templar' ? 'broken' : 'shattered');
    }
    expect(DOCTRINE.templar.withdrawals).toBe(2);
    expect(DOCTRINE.samurai.withdrawals).toBe(1);
    // Over two dozen battles Templar blocks fall back on a banner, and some come back twice (a
    // rare sight). v17 (field at real scale, men who think for themselves): seeds 1-12 alone saw
    // neither, 13-24 saw 6 blocks come back twice and 12 banner withdrawals, so the window is 24.
    let banner = 0;
    let twice = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const b = battle(seed, army(600, 'templar'), army(600, 'samurai'));
      b.run();
      banner += b.events.filter((e) => e.kind === 'doctrine' && e.note === 'banner').length;
      twice += b.regiments.filter((x) => x.team === 0 && (x.rallies >= 2 || x.withdrawals >= 2)).length;
      expect(b.regiments.filter((x) => x.team === 1 && x.rallies >= 2).length).toBe(0);
    }
    expect(banner).toBeGreaterThan(0);
    expect(twice).toBeGreaterThan(0);
  }, 240_000);

  it('T3: Knight-Brothers and Iron Brethren do not rout while the Marshal lives', () => {
    const b = battle(2, army(400, 'templar'), army(400, 'samurai'));
    b.step();
    const brothers = b.regiments.filter((r) => r.team === 0 && (r.cls === U.Knights || r.cls === U.Shock) && r.role !== 'command');
    const sergeants = b.regiments.find((r) => r.team === 0 && r.cls === U.HeavyInfantry)!;
    expect(brothers.length).toBeGreaterThan(0);
    // (The sergeants first: their rout shakes their neighbours.)
    for (const r of [sergeants, ...brothers]) {
      r.morale = 0;
      r.baseMorale = -50;
      inside(b).morale(r);
    }
    for (const r of brothers) {
      expect(r.routed).toBe(false);
      expect(r.moraleState).toBe('wavering');
      expect(r.morale).toBe(MORALE.breakAt);
    }
    expect(sergeants.routed).toBe(true);
    expect(b.events.some((e) => e.kind === 'doctrine' && e.note === 'stand-fast')).toBe(true);
    // The Marshal falls: now they break.
    b.kill(b.commander[0]);
    for (const r of brothers) {
      r.morale = 0;
      inside(b).morale(r);
      expect(r.routed).toBe(true);
    }
  });
});

describe('doctrines: the Samurai', () => {
  it('S1: the daimyo\'s death costs his army more than a Marshal\'s, and his hatamoto charge to avenge him', () => {
    const drop = (f: FactionId) => {
      const b = battle(3, army(400, f), army(400, 'undead'));
      for (let i = 0; i < 40; i++) b.step();
      const regs = b.regiments.filter((r) => r.team === 0 && (r.cls === U.HeavyInfantry || r.cls === U.Spearmen));
      const before = regs.map((r) => r.morale);
      b.kill(b.commander[0]);
      return { b, drop: regs.reduce((s, r, k) => s + before[k]! - r.morale, 0) / regs.length };
    };
    const sam = drop('samurai');
    const tem = drop('templar');
    expect(sam.drop).toBeCloseTo(MORALE.generalDeadShock * DOCTRINE.samurai.generalDeadShock, 5);
    expect(tem.drop).toBeCloseTo(MORALE.generalDeadShock, 5);
    expect(sam.b.events.some((e) => e.kind === 'doctrine' && e.note === 'revenge')).toBe(true);
    // At the next General's think the hatamoto are sent to charge.
    while (sam.b.tick % 15 !== 1) sam.b.step();
    for (const r of sam.b.regiments) if (r.team === 0 && r.role === 'shock-cav' && r.alive > 0 && !r.routed) expect(r.ord.kind).toBe('charge');
  });

  it('S2: samurai break ranks to chase more often than Templars', () => {
    // (Twenty-four days, at 300 a side: since v16 the armies break about as often as each other and
    // the edge is narrower, a fifth to a half more chases, and over six days it swung with who won.
    // After QA review 2's three branches were merged, days 1-12 gave 107 against 101, days 13-48
    // 375 against 263: 1.06 and 1.43 times, and before the merges 1.25 and 1.5. Over twelve days
    // the edge swung too; 1-24 gave 227 against 181.)
    let sam = 0;
    let tem = 0;
    let first = 0;
    for (let seed = 1; seed <= 24; seed++) {
      for (const flip of [false, true]) {
        const b = flip ? battle(seed, army(300, 'templar'), army(300, 'samurai')) : battle(seed, army(300, 'samurai'), army(300, 'templar'));
        const s = flip ? 1 : 0;
        b.run();
        sam += b.events.filter((e) => e.kind === 'chase' && e.team === s).length;
        tem += b.events.filter((e) => e.kind === 'chase' && e.team === 1 - s).length;
        first += b.events.filter((e) => e.kind === 'doctrine' && e.note === 'first-spear' && e.team === s).length;
        expect(b.events.some((e) => e.kind === 'doctrine' && e.note === 'first-spear' && e.team !== s)).toBe(false);
      }
    }
    // (Since v17's weapon reach, 95 chases against 85 on days 1-12, against 1.15 times before:
    // the spear walls stall at their points, and which blocks break first moves with them.)
    expect(sam).toBeGreaterThan(tem * 1.1);
    expect(first).toBeGreaterThan(12);
    expect(DOCTRINE.samurai.chaseFar).toBeGreaterThan(1);
  }, 170_000);

  it('S3: after the first volley the teppo fire rank by rank, and the first volley shakes the target', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [plainArmy(only(U.Crossbowmen, 30), 0, 'samurai'), plainArmy(only(U.HeavyInfantry, 30), 200)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    const g = b.regiments.find((r) => r.team === 0)!;
    const e = b.regiments.find((r) => r.team === 1)!;
    placeRegiment(b, g, 800, 600, 1, 0);
    placeRegiment(b, e, 920, 600, -1, 0);
    expect(g.rows).toBeGreaterThanOrEqual(2);
    const seen = new Set<object>();
    const shots: { tick: number; row: number }[] = [];
    let shaken = false;
    while (!b.done() && b.tick < 400) {
      const m = e.morale;
      const was = g.firstVolley;
      b.step();
      if (!was && g.firstVolley && e.morale <= m - DOCTRINE.samurai.firstVolley + 1) shaken = true;
      for (const p of b.projectiles) {
        if (seen.has(p) || p.team !== 0) continue;
        seen.add(p);
        if (g.rippling) shots.push({ tick: p.born, row: (b as unknown as { d: { row: Int32Array } }).d.row[p.shooter]! });
      }
    }
    expect(g.rippling).toBe(true);
    expect(shaken).toBe(true);
    // Volleys a few ticks long, each of one rank, the ranks taking turns.
    const ranks = Math.min(3, g.rows);
    const volleys: number[][] = [];
    for (const s of shots) {
      const last = volleys[volleys.length - 1];
      if (last && s.tick - last[0]! < 8) last.push(s.row % ranks);
      else volleys.push([s.tick, s.row % ranks]);
    }
    expect(volleys.length).toBeGreaterThanOrEqual(3);
    // (Ranks are read after the step: a man who closed up into a dead man's rank mid-volley may
    // show under the next. Nearly all of each volley is one rank: three shots in four at least.)
    const major: number[] = [];
    for (const v of volleys.slice(1)) {
      const rows = v.slice(1);
      const top = [0, 1, 2].map((k) => rows.filter((x) => x === k).length);
      const best = Math.max(...top);
      if (rows.length >= 4) expect(best / rows.length).toBeGreaterThanOrEqual(0.75);
      major.push(top.indexOf(best));
    }
    // ...and the ranks take turns (a rank whose men are all down or reloading misses its turn).
    let turns = 0;
    for (let k = 1; k < major.length; k++) if (major[k] !== major[k - 1]) turns++;
    expect(turns).toBeGreaterThanOrEqual((major.length - 1) * 0.7);
    expect(new Set(major).size).toBe(ranks);
  });
});

describe('doctrines: the Hollow Host', () => {
  it('U1: undead foot marches slower than the living, and faster near the Lich-Marshal', () => {
    const pace = (faction: FactionId, nearLich: boolean) => {
      const b = new Battle({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [{ ...plainArmy(only(U.HeavyInfantry, 30), 0, faction), commander: true }, plainArmy(only(U.HeavyInfantry, 30), 200)] });
      b.generals[0].fixedPlan = 'advance';
      b.generals[1].fixedPlan = 'hold';
      const a = b.regiments.find((r) => r.team === 0 && r.role === 'line')!;
      const lich = b.regiments.find((r) => r.team === 0 && r.role === 'command')!;
      placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 1500, 600, -1, 0);
      placeRegiment(b, a, 200, 600, 1, 0);
      placeRegiment(b, lich, nearLich ? 170 : 150, nearLich ? 600 : 1150, 1, 0);
      while (b.tick < 80) {
        b.step();
        // Keep the general where he was put (he would otherwise ride to his line).
        if (!nearLich) for (const id of lich.members) { b.soldiers[id]!.x = 150; b.soldiers[id]!.y = 1150; }
      }
      expect(a.mode).toBe('advance');
      const x0 = a.ax;
      for (let i = 0; i < 10; i++) {
        b.step();
        if (!nearLich) for (const id of lich.members) { b.soldiers[id]!.x = 150; b.soldiers[id]!.y = 1150; }
      }
      return a.ax - x0;
    };
    const living = pace('templar', false);
    expect(pace('undead', false) / living).toBeCloseTo(DOCTRINE.undead.tide, 2);
    expect(pace('undead', true) / living).toBeCloseTo(1, 2);
    // And the dead never choose to stand and wait, or hold a wing back.
    for (let seed = 1; seed <= 20; seed++) {
      const b = battle(seed, army(300, 'undead'), army(300, 'samurai'));
      for (let i = 0; i < 20; i++) b.step();
      expect(['hold', 'refuse']).not.toContain(b.generals[0].plan);
    }
  }, 60_000);

  it('U2: a knight charge does not stun the dead, knocks them back less, and stalls sooner', () => {
    const charge = (faction: FactionId, seed: number) => {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.Knights, 12)), plainArmy(only(U.HeavyInfantry, 30), 200, faction)] });
      b.generals[1].fixedPlan = 'hold';
      b.generals[0].rashKnights = true;
      const f = b.regiments.find((r) => r.team === 1)!;
      placeRegiment(b, f, 900, 600, -1, 0);
      placeRegiment(b, b.regiments.find((r) => r.team === 0)!, 750, 600, 1, 0);
      let stunned = 0;
      let pushed = 0;
      let hits = 0;
      let contact = -1;
      const x0 = new Map<number, number>();
      while (!b.done() && b.tick < 400 && (contact < 0 || b.tick - contact < 20)) {
        for (const id of f.members) x0.set(id, b.soldiers[id]!.x);
        b.step();
        for (const id of f.members) {
          const s = b.soldiers[id]!;
          if (s.state !== State.Fighting) continue;
          if (s.stunned > 0) stunned++;
          if (s.hitAt === b.tick - 1 || s.hitAt === b.tick) {
            if (contact < 0) contact = b.tick;
            pushed += Math.max(0, s.x - x0.get(id)!);
            hits++;
          }
        }
      }
      return { stunned, pushed, hits };
    };
    // How far a man is driven back the tick he is hit, on average over five charges (one
    // charge's hardest push is one man's luck: since v14 a few riders, the eager, come in ahead
    // of the rest, and the dead swarm on a long leash).
    const over = (faction: FactionId) => [1, 2, 3, 4, 5].map((seed) => charge(faction, seed)).reduce((a, c) => ({ stunned: a.stunned + c.stunned, pushed: a.pushed + c.pushed, hits: a.hits + c.hits }));
    const dead = over('undead');
    const living = over('templar');
    expect(dead.stunned).toBe(0);
    expect(living.stunned).toBeGreaterThan(0);
    expect(dead.pushed / dead.hits).toBeLessThan((living.pushed / living.hits) * 0.6);
  });

  it('U3: the fallen near the Lich-Marshal rise, once each, and every man is still accounted for', () => {
    let risen = 0;
    for (const seed of [1, 2]) {
      const b = battle(seed, army(300, 'undead'), army(300, 'templar'));
      const team0 = b.soldiers.filter((s) => s.team === 0);
      while (!b.done()) {
        b.step();
        if (b.tick % DOCTRINE.undead.raiseEvery !== 0) continue;
        // Right after a raising: every regiment's count is its men standing or running.
        for (const r of b.regiments) {
          if (r.team !== 0) continue;
          expect(r.alive).toBe(r.members.filter((id) => b.soldiers[id]!.state <= State.Routing).length);
        }
        for (const s of team0) {
          if (s.roseAt < 0 || s.state === State.Dead) continue;
          expect([U.HeavyInfantry, U.Spearmen, U.Skirmishers]).toContain(s.cls);
          expect(s.roseAt).toBeGreaterThanOrEqual(s.diedAt + DOCTRINE.undead.raiseAfter);
        }
      }
      const r = b.result!;
      const ev = b.events.filter((e) => e.kind === 'doctrine' && e.note === 'raise' && e.team === 0);
      expect(ev.length).toBeGreaterThan(0);
      const raised = ev.reduce((s, e) => s + e.count!, 0);
      expect(r.sides[0].risen!.reduce((a, x) => a + x, 0)).toBe(raised);
      expect(r.sides[1].risen).toBeUndefined();
      expect(raised).toBe(team0.filter((s) => s.roseAt >= 0).length);
      // No more than his share of the foot who fell (v16: by the fallen, not by the clock).
      const fell = team0.filter((s) => ([U.HeavyInfantry, U.Spearmen, U.Skirmishers] as number[]).includes(s.cls) && (s.roseAt >= 0 || s.state === State.Dead)).length;
      expect(raised).toBeLessThanOrEqual(DOCTRINE.undead.raiseShare * fell);
      risen += raised;
      // Dead, fled and alive still make up the start, class by class.
      for (const side of r.sides) for (let c = 0; c < UNIT_COUNT; c++) expect(side.dead[c]! + side.fled[c]! + side.alive[c]!).toBe(side.start[c]);
      // The living never rise.
      expect(b.soldiers.some((s) => s.team === 1 && s.roseAt >= 0)).toBe(false);
    }
    expect(risen).toBeGreaterThan(5);
  }, 60_000);

  it('U3: a risen man gets up where he fell, and only then moves and fights', () => {
    const b = battle(1, army(300, 'undead'), army(300, 'templar'));
    const where = new Map<number, [number, number]>();
    let checked = 0;
    while (!b.done() && b.tick < 2400) {
      b.step();
      for (const s of b.soldiers) {
        if (s.roseAt < 0 || s.state !== State.Fighting) continue;
        const since = b.tick - s.roseAt;
        if (since === 0) where.set(s.id, [s.x, s.y]);
        const at = where.get(s.id);
        if (!at || since >= RISE_TICKS) continue;
        checked++;
        expect(Math.hypot(s.x - at[0], s.y - at[1])).toBeLessThan(1);
        expect(s.target).toBe(-1);
        expect(s.actedAt).toBeLessThan(s.roseAt);
      }
    }
    expect(checked).toBeGreaterThan(50);
  }, 60_000);

  it('U3: no raising once the Lich-Marshal has fallen', () => {
    const b = battle(1, army(300, 'undead'), army(300, 'templar'));
    while (!b.events.some((e) => e.kind === 'doctrine' && e.note === 'raise')) b.step();
    b.kill(b.commander[0]);
    const n = b.soldiers.filter((s) => s.roseAt >= 0).length;
    while (!b.done()) b.step();
    expect(b.soldiers.filter((s) => s.roseAt >= 0).length).toBe(n);
  }, 60_000);
});

describe('morale shocks and the size of the battle (v13)', () => {
  it('per-man shocks count for a block of MORALE.blockMen: unchanged at 250 a side, a third at 2800', () => {
    const k = (men: number) => (battle(1, army(men, 'templar'), army(men, 'templar')) as unknown as { shockK: number }).shockK;
    expect(k(250)).toBe(1);
    expect(k(500)).toBeLessThan(0.8);
    // The standard mix at 2800 a side is 2450 figures: blocks of 109.
    expect(k(2800)).toBeCloseTo(MORALE.blockMen / 109, 5);
  });
});
