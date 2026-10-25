import { describe, expect, it } from 'vitest';
import { Kind, KIND_COUNT, PURPOSES, ShotKind, type Ledger, type Purpose, type SimInput, type Unit, type World } from './api.ts';
import { boltDamage, computeAuras, mitigated } from './combat.ts';
import { columnFormation, lineFormation, pitch } from './formation.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { applyDelta, armyFor, budgetOf, emptyLedger, fixWork, PAY_ORDER } from './muster.ts';
import { AURA_SHIELD, indexWorld, scratchFor } from './scratch.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { BALLISTA_BIG, BALLISTA_CLOSE, BALLISTA_CLOSE_FACTOR, BALLISTA_FLIER, CLERIC_UNDEAD, STATS, isBig, matchup } from './stats.ts';
import { pickTarget, roleOf, Role } from './tactics.ts';
import { createWorld, step } from './world.ts';

function newWorld(players: number, seed: number): World {
  const params = { seed, slots: slotsFor(players), members: players };
  return createWorld(params, generateMap(params));
}
const joins = (n: number): SimInput[] => Array.from({ length: n }, (_, p) => ({ kind: 'join', p, slot: p, hue: p * 40 }));

/** A world with hand-placed soldiers beside the border fort. */
function skirmish(units: [p: number, kind: Kind, x: number, y: number, hp?: number][]): { w: World; idx: (id: number) => number } {
  const w = newWorld(2, 3);
  step(w, joins(2));
  const site = w.map.sites[w.map.slots]!;
  w.nextId = 100;
  w.units = units.map(([p, kind, x, y, hp], k) => ({
    id: k + 1, p, platoon: 0, kind, x: site.x + x, y: site.y + y, hp: hp ?? STATS[kind]!.hp, maxHp: STATS[kind]!.hp,
    target: 0, cooldown: 0, swingAt: -1, leavesAt: -1, fx: 0, fy: 0, run: 0, scorched: -1,
  } satisfies Unit));
  const s = scratchFor(w);
  indexWorld(w, s, (k) => STATS[k]!.speed);
  computeAuras(w, s);
  return { w, idx: (id) => s.unitIndex.get(id)! };
}

const open = (x: number, y: number, radius = 200) => ({ radius, ax: x, ay: y, leash: 1e6, sx: x, sy: y, reach: Infinity, hx: 0, hy: 0 });

/** A ledger from pushes of [code, bonus, purpose, removed?, branches?, files?]. */
function ledgerOf(pushes: [code: number, bonus: number, purpose: Purpose, removed?: number, branches?: number, files?: number][]): Ledger {
  const l = emptyLedger();
  for (const [code, bonus, purpose, removed, branches, files] of pushes) {
    applyDelta(l, { lines: [code, 0, 0, 0, 0, removed ?? 0, 0, 0, 0], files: files ?? 2, branches: branches ?? Math.floor(code / 8), functions: 0, links: 0, bonus, churn: 0, filler: 0, purpose });
  }
  return l;
}

describe('the Ballista', () => {
  it('is the 21st kind, a two-slot siege-light missile troop between the Ranger and the Trebuchet in range', () => {
    expect(Kind.Ballista).toBe(20);
    expect(KIND_COUNT).toBe(21);
    const b = STATS[Kind.Ballista]!;
    expect(b.slots).toBe(2);
    expect(b.ranged).toBe(true);
    expect(b.range).toBeGreaterThan(STATS[Kind.Ranger]!.range);
    expect(b.range).toBeLessThan(STATS[Kind.Trebuchet]!.range);
    expect(b.speed).toBeLessThan(STATS[Kind.Footman]!.speed);
    expect(b.cooldown).toBeGreaterThan(STATS[Kind.Ranger]!.cooldown);
    expect(roleOf(Kind.Ballista)).toBe(Role.Ranged);
  });

  it('ignores Warden and Paladin shield auras (armour-piercing), where an arrow does not', () => {
    const { w, idx } = skirmish([[0, Kind.Ballista, -120, 0], [1, Kind.Footman, 0, 0], [1, Kind.Warden, 10, 0], [1, Kind.Footman, 0, 200]]);
    const s = scratchFor(w);
    const shielded = idx(2);
    const bare = idx(4);
    expect(s.aura[shielded]! & AURA_SHIELD).not.toBe(0);
    expect(s.aura[bare]! & AURA_SHIELD).toBe(0);
    // An arrow loses 30% to the tower shield; the bolt loses nothing to it.
    expect(mitigated(w, s, shielded, 100, true)).toBeCloseTo(mitigated(w, s, bare, 100, true) * 0.7, 6);
    expect(boltDamage(w, s, shielded, 100, 120)).toBeCloseTo(boltDamage(w, s, bare, 100, 120), 6);
    expect(boltDamage(w, s, shielded, 100, 120)).toBeCloseTo(mitigated(w, s, bare, 100, true), 6);
    // Nor is it halved against Wardens and Paladins as arrows are.
    expect(matchup(Kind.Ranger, Kind.Paladin)).toBe(0.5);
    expect(matchup(Kind.Ballista, Kind.Warden)).toBe(1);
    expect(matchup(Kind.Ballista, Kind.Paladin)).toBe(BALLISTA_BIG);
  });

  it('deals double to big soldiers and more to fliers, little at point blank', () => {
    for (const k of [Kind.Troll, Kind.BoneGolem, Kind.Knight, Kind.Champion, Kind.Trebuchet, Kind.Paladin]) expect(matchup(Kind.Ballista, k), STATS[k]!.name).toBe(BALLISTA_BIG);
    for (const k of [Kind.Dragon, Kind.GriffinRider]) expect(matchup(Kind.Ballista, k), STATS[k]!.name).toBe(BALLISTA_FLIER);
    for (const k of [Kind.Footman, Kind.Archer, Kind.Skeleton, Kind.Berserker, Kind.Outrider]) expect(matchup(Kind.Ballista, k), STATS[k]!.name).toBe(1);
    expect(BALLISTA_BIG).toBeGreaterThanOrEqual(2);
    expect(BALLISTA_FLIER).toBeGreaterThan(BALLISTA_BIG);
    const { w, idx } = skirmish([[0, Kind.Ballista, -150, 0], [1, Kind.Troll, 0, 0], [1, Kind.Footman, 0, 0], [1, Kind.Dragon, 0, 0]]);
    const s = scratchFor(w);
    const foot = boltDamage(w, s, idx(3), 100, 120);
    expect(boltDamage(w, s, idx(2), 100, 120) / foot).toBeCloseTo(BALLISTA_BIG, 6);
    expect(boltDamage(w, s, idx(4), 100, 120) / foot).toBeCloseTo(BALLISTA_FLIER, 6);
    expect(boltDamage(w, s, idx(3), 100, BALLISTA_CLOSE - 1) / foot).toBeCloseTo(BALLISTA_CLOSE_FACTOR, 6);
    // Weak in melee and ridden down by lancers.
    expect(matchup(Kind.Knight, Kind.Ballista)).toBeGreaterThan(1);
    expect(matchup(Kind.Outrider, Kind.Ballista)).toBeGreaterThan(1);
  });

  it('aims at the biggest, most valuable foe in range rather than the nearest', () => {
    const { w, idx } = skirmish([[0, Kind.Ballista, 0, 0], [1, Kind.Footman, 40, 0], [1, Kind.Troll, 130, 10], [1, Kind.Knight, 80, -20]]);
    const s = scratchFor(w);
    const u = w.units[idx(1)]!;
    expect(pickTarget(w, s, idx(1), open(u.x, u.y))).toBe(idx(3));
    // A Dragon in range outranks everything.
    const d = skirmish([[0, Kind.Ballista, 0, 0], [1, Kind.Troll, 60, 0], [1, Kind.Champion, 70, 10], [1, Kind.Dragon, 140, -20]]);
    const b = d.w.units[d.idx(1)]!;
    expect(pickTarget(d.w, scratchFor(d.w), d.idx(1), open(b.x, b.y))).toBe(d.idx(4));
    // An archer, by contrast, takes the nearer, weaker foe.
    const a = skirmish([[0, Kind.Archer, 0, 0], [1, Kind.Footman, 40, 0], [1, Kind.Troll, 90, 10]]);
    const au = a.w.units[a.idx(1)]!;
    expect(pickTarget(a.w, scratchFor(a.w), a.idx(1), open(au.x, au.y))).toBe(a.idx(2));
  });

  it('stands in the missile rank of the line, behind the foot, and near the tail of the column with the siege', () => {
    const c = new Array<number>(KIND_COUNT).fill(0);
    c[Kind.Footman] = 10;
    c[Kind.Cleric] = 2;
    c[Kind.Ranger] = 2;
    c[Kind.Ballista] = 2;
    c[Kind.Trebuchet] = 2;
    const line = lineFormation(c);
    const f = (k: Kind, slots = line) => slots.filter((s) => s.kind === k).map((s) => s.f);
    expect(Math.max(...f(Kind.Ballista))).toBeLessThan(Math.min(...f(Kind.Footman)));
    expect(Math.max(...f(Kind.Ballista))).toBeLessThan(Math.min(...f(Kind.Cleric)));
    // In the same rank as the Rangers, ahead of the Trebuchets.
    const front = (k: Kind) => Math.max(...f(k)) + pitch(k) / 2;
    expect(front(Kind.Ballista)).toBeCloseTo(front(Kind.Ranger), 6);
    expect(Math.min(...f(Kind.Ballista))).toBeGreaterThan(Math.max(...f(Kind.Trebuchet)));
    const col = columnFormation(c);
    expect(Math.max(...f(Kind.Ballista, col))).toBeLessThan(Math.min(...f(Kind.Ranger, col)));
    expect(Math.min(...f(Kind.Ballista, col))).toBeGreaterThan(Math.max(...f(Kind.Trebuchet, col)));
  });
});

describe('fix work raises a mix of fixers', () => {
  it('counts a fix’s difficulty bonus as fix work, and only a fix’s', () => {
    const fix = ledgerOf([[300, 900, 'fix']]);
    const feat = ledgerOf([[300, 900, 'feature']]);
    expect(fixWork(fix)).toBe(1200);
    expect(fixWork(feat)).toBe(0);
    // Mixed: the bonus is shared by the purpose that earned it.
    const mixed = ledgerOf([[200, 600, 'fix'], [200, 200, 'refactor']]);
    expect(fixWork(mixed)).toBe(800);
  });

  it('raises Ballistae from fix code, with Clerics, Paladins and Rangers beside them', () => {
    const army = armyFor(ledgerOf([[600, 1800, 'fix', 300]]), 1);
    expect(army[Kind.Ballista]).toBeGreaterThan(0);
    expect(army[Kind.Cleric]).toBeGreaterThan(0);
    expect(army[Kind.Paladin]).toBeGreaterThan(0);
    expect(army[Kind.Ranger]).toBeGreaterThan(0);
    const fixers = [Kind.Ballista, Kind.Cleric, Kind.Paladin, Kind.Ranger];
    const slots = (k: Kind) => army[k]! * STATS[k]!.slots;
    const share = slots(Kind.Ballista) / fixers.reduce((n, k) => n + slots(k), 0);
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.55);
    // The same work under another message raises none: purpose picks the specialists.
    expect(armyFor(ledgerOf([[600, 1800, 'feature', 300]]), 1)[Kind.Ballista]).toBe(0);
    // ... never the size of the army.
    expect(budgetOf(ledgerOf([[600, 1800, 'fix', 300]]))).toBe(budgetOf(ledgerOf([[600, 1800, 'feature', 300]])));
    // A fix's bonus raises more Ballistae than its code alone.
    expect(army[Kind.Ballista]!).toBeGreaterThan(armyFor(ledgerOf([[600, 0, 'fix', 300]]), 1)[Kind.Ballista]!);
  });

  it('still raises Clerics for a small fix, though its complexity asks for Knights', () => {
    for (const code of [60, 100, 160]) {
      const army = armyFor(ledgerOf([[code, 0, 'fix', 20, Math.floor(code / 4)]]), 1);
      expect(army[Kind.Cleric], `${code} lines`).toBeGreaterThan(0);
    }
    expect(PAY_ORDER.indexOf(Kind.Cleric)).toBeLessThan(PAY_ORDER.indexOf(Kind.Knight));
    expect(PAY_ORDER.indexOf(Kind.Ballista)).toBeLessThan(PAY_ORDER.indexOf(Kind.Paladin));
  });

  it('raises exactly the same army from a day of small fix pushes as from one squashed push', () => {
    const parts: [number, number, Purpose, number, number, number][] = [[12, 40, 'fix', 8, 2, 1], [30, 120, 'fix', 20, 4, 1], [8, 0, 'fix', 5, 1, 0], [55, 200, 'fix', 30, 7, 2], [140, 380, 'fix', 90, 18, 3], [20, 60, 'fix', 12, 3, 1], [40, -60, 'fix', 25, 5, 0]];
    const split = ledgerOf(parts);
    const sum = (i: 0 | 1 | 3 | 4 | 5) => parts.reduce((n, p) => n + p[i], 0);
    const squash = ledgerOf([[sum(0), sum(1), 'fix', sum(3), sum(4), sum(5)]]);
    expect(split.purposeBonus).toEqual(squash.purposeBonus);
    expect(armyFor(split, parts.length)).toEqual(armyFor(squash, 1));
    expect(armyFor(split, parts.length)[Kind.Ballista]).toBeGreaterThan(0);
  });

  it('reads a ledger from before the bonus was kept by purpose by sharing the bonus like the code', () => {
    const l = ledgerOf([[300, 600, 'fix'], [300, 0, 'feature']]);
    delete l.purposeBonus;
    expect(fixWork(l)).toBe(300 + 300);
    expect(PURPOSES[0]).toBe('fix');
  });
});

describe('the Cleric', () => {
  it('is a battle priest: a short-range smite, double and more against the undead', () => {
    const c = STATS[Kind.Cleric]!;
    expect(c.ranged).toBe(true);
    expect(c.heal).toBeGreaterThan(0);
    expect(c.range).toBeLessThan(STATS[Kind.Archer]!.range);
    expect(roleOf(Kind.Cleric)).toBe(Role.Healer);
    expect(matchup(Kind.Cleric, Kind.Skeleton)).toBe(CLERIC_UNDEAD);
    expect(matchup(Kind.Cleric, Kind.BoneGolem)).toBe(CLERIC_UNDEAD);
    expect(matchup(Kind.Cleric, Kind.Footman)).toBe(1);
  });

  it('cleanses fire from allies around it and smites a foe in reach', () => {
    const { w } = skirmish([[0, Kind.Cleric, 0, 0], [0, Kind.Troll, 20, 0], [0, Kind.Footman, 0, 25], [1, Kind.Skeleton, 45, 0]]);
    for (const u of w.units) if (u.p === 0 && u.kind !== Kind.Cleric) u.scorched = w.tick + 1000;
    let cleansed = 0;
    let smites = 0;
    for (let t = 0; t < 12; t++) {
      const ev = step(w, []);
      cleansed += ev.cleanses.reduce((n, c) => n + c.n, 0);
      smites += ev.shots.filter((s) => s.kind === ShotKind.Smite).length;
    }
    expect(cleansed).toBe(2);
    for (const u of w.units) if (u.p === 0) expect(u.scorched).toBeLessThanOrEqual(w.tick);
    expect(smites).toBeGreaterThan(0);
  });
});

describe('determinism with Ballistae in the field', () => {
  it('two runs of fix-heavy armies against a Dragon end on the same checksum, and a restored snapshot continues bit for bit', () => {
    const inputs = (t: number): SimInput[] => {
      if (t === 0) return joins(2);
      if (t === 1) return [{ kind: 'push', p: 1, repo: 1, commits: 1, msg: 'feat: wyrm', lines: [1500, 40, 60, 0, 0, 100, 0, 0, 0], files: 14, branches: 200, churn: 0, filler: 0 }];
      if (t >= 2 && t < 250 && t % 30 === 2) return [{ kind: 'push', p: 0, repo: 0, commits: 1, msg: 'fix: crash', lines: [90, 5, 4, 0, 0, 60, 0, 0, 0], files: 2, branches: 8, churn: 0, filler: 0, bonus: 260 }];
      return [];
    };
    const run = (ticks: number, w = newWorld(2, 3), from = 0) => {
      let bolts = 0;
      let pierces = 0;
      for (let t = from; t < ticks; t++) {
        const ev = step(w, inputs(t));
        bolts += ev.shots.filter((s) => s.kind === ShotKind.Bolt).length;
        pierces += ev.blasts.filter((b) => b.kind === 8).length;
      }
      return { w, bolts, pierces };
    };
    const a = run(1500);
    const b = run(1500);
    expect(a.bolts).toBeGreaterThan(0);
    expect(a.w.players[0]!.raised[Kind.Ballista]).toBeGreaterThan(0);
    expect(checksum(a.w)).toBe(checksum(b.w));
    const mid = run(700);
    const copy = restore(snapshot(mid.w));
    expect(checksum(copy)).toBe(checksum(mid.w));
    run(1500, mid.w, 700);
    run(1500, copy, 700);
    expect(checksum(copy)).toBe(checksum(mid.w));
    expect(checksum(copy)).toBe(checksum(a.w));
    expect(isBig(Kind.Dragon)).toBe(true);
  }, 60_000);

  it('restores a snapshot from before the Ballista, padding its tallies by kind', () => {
    const w = newWorld(2, 3);
    step(w, joins(2));
    step(w, [{ kind: 'push', p: 0, repo: 0, commits: 1, msg: 'fix: x', lines: [200, 0, 0, 0, 0, 0, 0, 0, 0], files: 3, branches: 20, churn: 0, filler: 0 }]);
    const snap = snapshot(w);
    const old = snap.world as { players: { raised: number[]; slain: number[]; feats: { bigDamage?: number } }[]; platoons: { mustered: number[] }[] };
    for (const p of old.players) {
      p.raised.length = 20;
      p.slain.length = 20;
      delete p.feats.bigDamage;
    }
    for (const pl of old.platoons) pl.mustered.length = 20;
    const r = restore(snap);
    for (const p of r.players) expect(p.raised).toHaveLength(KIND_COUNT);
    for (let t = 0; t < 50; t++) step(r, []);
    expect(Number.isFinite(checksum(r))).toBe(true);
  });
});
