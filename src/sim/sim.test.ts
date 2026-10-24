import { describe, expect, it } from 'vitest';
import { Cat, Kind, NEUTRAL, PlatoonState, TICKS_PER_MINUTE, type Ledger, type SimInput, type World } from './api.ts';
import { Chronicler } from './chronicle.ts';
import { dcos, dsin } from './dmath.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { applyDelta, armyFor, armyQuality, emptyLedger, purposeOf, slotsOf } from './muster.ts';
import { STATS } from './stats.ts';
import { decodeInput, encodeInput, runReplay, type Replay } from './replay.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { createWorld, step } from './world.ts';

function lines(partial: Partial<Record<keyof typeof Cat, number>>): number[] {
  const out = new Array<number>(9).fill(0);
  for (const [k, v] of Object.entries(partial)) out[Cat[k as keyof typeof Cat]] = v!;
  return out;
}

/** A scripted war: joins at tick 0, then pseudo-random pushes. */
function script(players: number, minutes: number, seed = 1): Map<number, SimInput[]> {
  const out = new Map<number, SimInput[]>();
  const add = (t: number, i: SimInput) => out.set(t, [...(out.get(t) ?? []), i]);
  for (let p = 0; p < players; p++) add(0, { kind: 'join', p, slot: p, hue: p * 50 });
  let r = seed;
  const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let t = 1; t < minutes * TICKS_PER_MINUTE; t++) {
    for (let p = 0; p < players; p++) {
      if (rand() < 1 / (2 * TICKS_PER_MINUTE)) {
        add(t, { kind: 'push', p, repo: p, commits: 1, files: 3, branches: 10, churn: 0, filler: 0, msg: 'm', lines: lines({ Code: Math.floor(rand() * 200), Test: Math.floor(rand() * 60), Comment: 12, Removed: Math.floor(rand() * 40) }) });
      }
    }
  }
  add(30, { kind: 'doctrine', p: 0, doctrine: 3 });
  add(40, { kind: 'cry', p: 1 });
  return out;
}

function run(world: World, inputs: Map<number, SimInput[]>, until: number): void {
  while (world.tick < until) step(world, inputs.get(world.tick) ?? []);
}

function newWorld(players: number, seed = 9): World {
  const params = { seed, slots: slotsFor(players), members: players };
  return createWorld(params, generateMap(params));
}

/** Nonzero counts by unit name, for readable expectations. */
function named(counts: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  counts.forEach((n, k) => {
    if (n > 0) out[STATS[k]!.name] = n;
  });
  return out;
}

function ledgerOf(parts: { lines: Partial<Record<keyof typeof Cat, number>>; files?: number; branches?: number; msg?: string; filler?: number }[]): Ledger {
  const l = emptyLedger();
  for (const d of parts) applyDelta(l, { lines: lines(d.lines), files: d.files ?? 0, branches: d.branches ?? 0, churn: 0, filler: d.filler ?? 0, purpose: purposeOf(d.msg ?? '') });
  return l;
}
const total = (counts: readonly number[]) => counts.reduce((a, b) => a + b, 0);

describe('the army a day of work is worth', () => {
  it('reads the purpose from the commit message', () => {
    expect(purposeOf('fix(parser): crash on empty input')).toBe('fix');
    expect(purposeOf('Fixes #12: off by one')).toBe('fix');
    expect(purposeOf('feat: add export')).toBe('feature');
    expect(purposeOf('refactor: split parser')).toBe('refactor');
    expect(purposeOf('perf: cache lookups')).toBe('perf');
    expect(purposeOf('Revert "fix: crash"')).toBe('revert');
    expect(purposeOf('chore(deps): bump vite from 5 to 6')).toBe('chore');
    expect(purposeOf('wip')).toBe('work');
  });

  it('grows with real code and files touched, with diminishing returns', () => {
    const small = total(armyFor(ledgerOf([{ lines: { Code: 100, Comment: 5 }, files: 2 }]), 1));
    const big = total(armyFor(ledgerOf([{ lines: { Code: 1600, Comment: 80 }, files: 32 }]), 1));
    expect(small).toBeGreaterThan(5);
    expect(big).toBeGreaterThan(small * 2);
    expect(big).toBeLessThan(small * 16);
  });

  it('raises nothing for generated or vendored code, and keeps support small', () => {
    expect(armyFor(ledgerOf([{ lines: { Generated: 1e6, Vendor: 1e6 } }]), 1)).toEqual([1, ...new Array(19).fill(0)]);
    const support = armyFor(ledgerOf([{ lines: { Test: 1e6, Comment: 1e6, Docs: 1e6, Config: 1e6 } }]), 1);
    expect(slotsOf(support)).toBeLessThanOrEqual(12);
  });

  it('lets the commit message choose specialists but never the size of the army', () => {
    const shapes = ['fix: race', 'feat: sync', 'refactor: split', 'perf: cache', 'chore: tidy', 'wip'].map((msg) =>
      armyFor(ledgerOf([{ lines: { Code: 600, Removed: 200, Comment: 20 }, files: 10, branches: 60, msg }]), 1),
    );
    const sizes = new Set(shapes.map((c) => slotsOf(c)));
    expect(sizes.size).toBe(1);
    expect(shapes[0]![Kind.Cleric]).toBeGreaterThan(0);
    expect(shapes[1]![Kind.Champion]).toBeGreaterThan(0);
    expect(shapes[2]![Kind.Outrider]).toBeGreaterThan(0);
    expect(shapes[3]![Kind.Wizard]).toBeGreaterThan(0);
  });

  it('summons a Dragon only for a legendary day of feature work', () => {
    expect(armyFor(ledgerOf([{ lines: { Code: 1000, Comment: 20 }, files: 12, branches: 100, msg: 'feat: offline' }]), 1)[Kind.Dragon]).toBe(1);
    expect(armyFor(ledgerOf([{ lines: { Code: 1000, Comment: 20 }, files: 4, branches: 100, msg: 'feat: offline' }]), 1)[Kind.Dragon]).toBe(0);
  });

  it('makes veterans of big contributors and a ragged army of test, comment and filler spam', () => {
    expect(armyQuality(ledgerOf([{ lines: { Code: 900, Test: 300, Comment: 60 }, files: 14 }])).veterancy).toBe(2);
    expect(armyQuality(ledgerOf([{ lines: { Code: 300, Test: 120, Comment: 30 }, files: 6 }])).power).toBeGreaterThan(1);
    const tests = armyQuality(ledgerOf([{ lines: { Code: 50, Test: 2000 } }]));
    expect(tests.quality).toBeLessThan(0.9);
    expect(tests.notes.some((n) => n.kind === 'tests')).toBe(true);
    expect(armyQuality(ledgerOf([{ lines: { Code: 50, Comment: 400 } }])).quality).toBeLessThan(0.95);
    expect(armyQuality(ledgerOf([{ lines: { Code: 100 }, filler: 900 }])).quality).toBeLessThan(0.9);
    expect(armyQuality(ledgerOf([{ lines: { Code: 1e6, Test: 1e9 } }])).quality).toBeGreaterThanOrEqual(0.7);
  });
});

describe('fair musters in the world', () => {
  const push = (p: number, d: Partial<Record<keyof typeof Cat, number>>, extra: Partial<Extract<SimInput, { kind: 'push' }>> = {}): SimInput =>
    ({ kind: 'push', p, repo: 0, commits: 1, msg: 'feat: work', lines: lines(d), files: 0, branches: 0, churn: 0, filler: 0, ...extra });

  it('raises the same army whether the work arrives in one push or many', () => {
    const one = newWorld(2, 3);
    step(one, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    step(one, [push(0, { Code: 1200, Test: 300, Comment: 60, Removed: 200 }, { files: 18, branches: 140 })]);
    const many = newWorld(2, 3);
    step(many, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    const parts: [number, number, number, number, number, number][] = [[400, 100, 20, 50, 6, 40], [200, 50, 10, 50, 3, 30], [300, 100, 15, 0, 5, 40], [300, 50, 15, 100, 4, 30]];
    for (const [code, test, comment, removed, files, branches] of parts) {
      step(many, [push(0, { Code: code, Test: test, Comment: comment, Removed: removed }, { files, branches })]);
      for (let i = 0; i < 40; i++) step(many, []);
    }
    expect(many.players[0]!.raised).toEqual(one.players[0]!.raised);
    expect(many.players[0]!.ledger).toEqual(one.players[0]!.ledger);
    expect(many.players[0]!.quality).toBe(one.players[0]!.quality);
    expect(many.players[0]!.veterancy).toBe(one.players[0]!.veterancy);
  });

  it('makes soldiers desert when the work that raised them is undone', () => {
    const w = newWorld(2, 3);
    step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    step(w, [push(0, { Code: 800 }, { files: 10, branches: 80 })]);
    for (let i = 0; i < 20; i++) step(w, []);
    const before = w.units.filter((u) => u.p === 0).length;
    const ev = step(w, [push(0, { Code: -800 }, { branches: -80, churn: 1600 })]);
    expect(ev.desertions[0]?.count).toBeGreaterThan(before / 2);
    expect(total(w.players[0]!.raised)).toBe(1);
  });

  it('marches a big day of work as several full platoons', () => {
    const w = newWorld(2, 3);
    step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    step(w, [push(0, { Code: 6000, Comment: 100 }, { files: 60, branches: 600 })]);
    const platoons = w.platoons.filter((pl) => pl.p === 0);
    expect(platoons.length).toBeGreaterThan(1);
    for (const pl of platoons) expect(slotsOf(pl.mustered)).toBeLessThanOrEqual(32);
  });
});

describe('deterministic trigonometry', () => {
  it('matches Math.sin and Math.cos closely', () => {
    for (let a = -10; a <= 10; a += 0.37) {
      expect(dsin(a)).toBeCloseTo(Math.sin(a), 12);
      expect(dcos(a)).toBeCloseTo(Math.cos(a), 12);
    }
  });
});

describe('map', () => {
  it('places a capital per slot on the ring and a border fort between each pair of neighbours, all reachable', () => {
    for (const slots of [3, 4, 7, 16]) {
      const map = generateMap({ seed: 5, slots, members: slots });
      const capitals = map.sites.filter((s) => s.kind === 'capital');
      const forts = map.sites.filter((s) => s.kind === 'fort');
      expect(capitals).toHaveLength(slots);
      expect(forts).toHaveLength(slots);
      expect(map.sites).toHaveLength(2 * slots);
      for (const s of map.sites) expect(Math.hypot(s.x, s.y)).toBeCloseTo(map.ring, 6);
      // Fort slots + s stands midway along the road between capital s and capital s + 1.
      for (let s = 0; s < slots; s++) {
        const a = capitals[s]!;
        const b = capitals[(s + 1) % slots]!;
        const f = map.sites[slots + s]!;
        expect(Math.hypot(f.x - a.x, f.y - a.y)).toBeCloseTo(Math.hypot(f.x - b.x, f.y - b.y), 6);
      }
    }
  });

  it('is identical for identical params', () => {
    const a = generateMap({ seed: 77, slots: 6, members: 4 });
    const b = generateMap({ seed: 77, slots: 6, members: 4 });
    expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
  });
});

describe('world', () => {
  it('is deterministic', () => {
    const inputs = script(4, 6);
    const a = newWorld(4);
    const b = newWorld(4);
    run(a, inputs, 6 * TICKS_PER_MINUTE);
    run(b, inputs, 6 * TICKS_PER_MINUTE);
    expect(checksum(a)).toBe(checksum(b));
    expect(a.units.length).toBeGreaterThan(0);
  });

  it('continues identically after a snapshot round trip', () => {
    const inputs = script(3, 6, 4);
    const a = newWorld(3, 11);
    run(a, inputs, 3 * TICKS_PER_MINUTE);
    const b = restore(JSON.parse(JSON.stringify(snapshot(a))));
    expect(checksum(b)).toBe(checksum(a));
    run(a, inputs, 6 * TICKS_PER_MINUTE);
    run(b, inputs, 6 * TICKS_PER_MINUTE);
    expect(checksum(b)).toBe(checksum(a));
  });

  it('marches platoons from the capital and fights in the middle', () => {
    const inputs = script(4, 12, 3);
    const w = newWorld(4, 21);
    let engaged = 0;
    let deaths = 0;
    let shots = 0;
    while (w.tick < 12 * TICKS_PER_MINUTE) {
      const ev = step(w, inputs.get(w.tick) ?? []);
      deaths += ev.deaths.length;
      shots += ev.shots.length;
      if (w.platoons.some((p) => p.state === PlatoonState.Engage)) engaged++;
    }
    expect(deaths).toBeGreaterThan(20);
    expect(shots).toBeGreaterThan(0);
    expect(engaged).toBeGreaterThan(0);
    expect(w.players.reduce((s, p) => s + p.renown, 0)).toBeGreaterThan(0);
    expect(w.sites.some((s) => s.owner !== NEUTRAL)).toBe(true);
  });

  it('rejects invalid and premature commands', () => {
    const w = newWorld(2);
    step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }, { kind: 'join', p: 0, slot: 1, hue: 2 }, { kind: 'join', p: 1, slot: 0, hue: 2 }]);
    expect(w.players).toHaveLength(1);
    step(w, [{ kind: 'doctrine', p: 0, doctrine: 1 }]);
    step(w, [{ kind: 'doctrine', p: 0, doctrine: 2 }]);
    expect(w.players[0]!.doctrine).toBe(1);
    step(w, [{ kind: 'cry', p: 0 }]);
    const until = w.players[0]!.cryUntil;
    step(w, [{ kind: 'cry', p: 0 }]);
    expect(w.players[0]!.cryUntil).toBe(until);
  });

  it('keeps every army under the per-player cap and the room under its cap, however much is pushed', () => {
    // One war's ledger is capped (CODE_CAP), so even a full room of maximal days fits under
    // both caps; the muster queue remains as a safety net for them.
    const w = newWorld(16);
    step(w, Array.from({ length: 16 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p * 20 })));
    const push = (p: number): SimInput => ({ kind: 'push', p, repo: 0, commits: 1, files: 300, branches: 1700, churn: 0, filler: 0, msg: 'x', lines: lines({ Code: 40_000, Removed: 40_000, Test: 4000, Comment: 1000, Docs: 3000, Config: 3000 }) });
    for (let i = 0; i < 5; i++) step(w, Array.from({ length: 16 }, (_, p) => push(p)));
    for (let p = 0; p < 16; p++) {
      const slots = slotsOf(w.units.filter((u) => u.p === p).map((u) => u.kind).reduce((c, k) => (c[k]!++, c), new Array<number>(20).fill(0)));
      expect(slots).toBeGreaterThan(100);
      expect(slots).toBeLessThanOrEqual(160);
    }
    expect(w.units.length).toBeLessThanOrEqual(2000);
  });
});

describe('regroup', () => {
  it('folds a nearby remnant into a stronger platoon of the same army', () => {
    const w = newWorld(2);
    step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    step(w, [{ kind: 'push', p: 0, repo: 0, commits: 1, files: 3, branches: 10, churn: 0, filler: 0, msg: 'big', lines: lines({ Code: 100, Test: 30 }) }]);
    step(w, [{ kind: 'push', p: 0, repo: 1, commits: 1, files: 3, branches: 10, churn: 0, filler: 0, msg: 'tiny', lines: lines({ Code: 2 }) }]);
    let regrouped = 0;
    for (let i = 0; i < 20; i++) regrouped += step(w, []).regroups.length;
    expect(regrouped).toBe(1);
    const fielded = w.platoons.filter((p) => p.p === 0 && p.state !== PlatoonState.Queued);
    expect(fielded).toHaveLength(1);
    expect(w.units.every((u) => u.platoon === fielded[0]!.id)).toBe(true);
  });
});

describe('replay', () => {
  it('round-trips inputs and rebuilds the same world', () => {
    const inputs = script(3, 4, 8);
    const world = newWorld(3, 13);
    run(world, inputs, 4 * TICKS_PER_MINUTE);
    const encoded = [...inputs.entries()].sort((a, b) => a[0] - b[0]).flatMap(([t, list]) => list.map((i) => encodeInput(t, i)));
    for (const e of encoded) expect(encodeInput(decodeInput(e).tick, decodeInput(e).input)).toEqual(e);
    const replay: Replay = {
      v: 1, seed: 13, slots: slotsFor(3), members: 3, tickMs: 200, startsAt: 0, endsAt: 24 * 3600_000,
      players: [0, 1, 2].map((p) => ({ login: `p${p}`, id: p + 1, hue: p * 50, slot: p, bot: false })),
      repos: [['a/b', null], ['c/d', 'Go'], ['e/f', null]],
      inputs: JSON.parse(JSON.stringify(encoded)),
    };
    expect(checksum(runReplay(replay, 4 * TICKS_PER_MINUTE))).toBe(checksum(world));
    expect(JSON.stringify(replay).length).toBeLessThan(40_000);
  });
});

describe('chronicle', () => {
  it('narrates musters, captures and the leader', () => {
    const inputs = script(3, 10, 2);
    const w = newWorld(3, 5);
    const ch = new Chronicler({ player: (p) => `@p${p}`, repo: (r) => `org/r${r}` });
    const kinds = new Set<string>();
    while (w.tick < 10 * TICKS_PER_MINUTE) {
      const due = inputs.get(w.tick) ?? [];
      for (const e of ch.narrate(w, due, step(w, due))) kinds.add(e.kind);
    }
    for (const k of ['join', 'muster', 'capture', 'leader', 'doctrine', 'cry']) expect(kinds).toContain(k);
  });
});
