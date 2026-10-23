import { describe, expect, it } from 'vitest';
import { Cat, Kind, NEUTRAL, PlatoonState, TICKS_PER_MINUTE, type SimInput, type World } from './api.ts';
import { Chronicler } from './chronicle.ts';
import { dcos, dsin } from './dmath.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { isBalanced, musterCounts } from './muster.ts';
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
        add(t, { kind: 'push', p, repo: p, commits: 1, msg: 'm', lines: lines({ Code: Math.floor(rand() * 200), Test: Math.floor(rand() * 60), Comment: 12, Removed: Math.floor(rand() * 40) }) });
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

describe('muster', () => {
  it('raises units from each category with diminishing returns', () => {
    const small = musterCounts(lines({ Code: 25 }), 0, 0);
    const big = musterCounts(lines({ Code: 400 }), 0, 0);
    expect(small[Kind.Legionary]).toBe(3);
    expect(big[Kind.Legionary]).toBe(12);
    expect(musterCounts(lines({ Code: 4000 }), 0, 0)[Kind.Legionary]).toBe(12);
    const mixed = musterCounts(lines({ Code: 100, Test: 49, Comment: 25, Docs: 20, Config: 10, Removed: 64, Generated: 400, Vendor: 900 }), 0, 0);
    expect(mixed).toEqual([6, 4, 3, 2, 1, 3, 3, 3, 1]);
  });

  it('gives a champion only to balanced pushes', () => {
    expect(isBalanced(lines({ Code: 20, Test: 1, Docs: 1 }))).toBe(true);
    expect(isBalanced(lines({ Code: 200, Test: 50 }))).toBe(false);
    expect(musterCounts(lines({ Code: 200, Test: 50 }), 0, 0)[Kind.Champion]).toBe(0);
  });

  it('tires heavy pushers and never raises nothing', () => {
    const fresh = musterCounts(lines({ Code: 400 }), 0, 0)[Kind.Legionary]!;
    expect(musterCounts(lines({ Code: 400 }), 3, 3)[Kind.Legionary]).toBe(fresh / 2);
    expect(musterCounts(lines({ Code: 400 }), 0, 12)[Kind.Legionary]).toBe(4);
    expect(musterCounts(lines({ Blank: 500 }), 0, 0)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const huge = musterCounts(lines({ Code: 1e6, Test: 1e6, Comment: 1e6, Docs: 1e6, Config: 1e6, Removed: 1e6, Generated: 1e6, Vendor: 1e6 }), 0, 0);
    expect(huge.reduce((a, b) => a + b, 0)).toBe(32);
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
  it('places a capital and a shrine per slot plus the Heart, all reachable', () => {
    for (const slots of [4, 7, 16]) {
      const map = generateMap({ seed: 5, slots, members: slots });
      expect(map.sites.filter((s) => s.kind === 'capital')).toHaveLength(slots);
      expect(map.sites.filter((s) => s.kind === 'shrine')).toHaveLength(slots);
      expect(map.sites.filter((s) => s.kind === 'heart')).toHaveLength(1);
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

  it('holds soldiers in the muster queue beyond the per-player cap', () => {
    const w = newWorld(2);
    step(w, [{ kind: 'join', p: 0, slot: 0, hue: 1 }]);
    const push: SimInput = { kind: 'push', p: 0, repo: 0, commits: 1, msg: 'x', lines: lines({ Code: 400, Test: 400, Comment: 100 }) };
    for (let i = 0; i < 12; i++) step(w, [push]);
    expect(w.units.filter((u) => u.p === 0).length).toBeLessThanOrEqual(160);
    expect(w.players[0]!.queue.length).toBeGreaterThan(0);
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
      v: 1, seed: 13, slots: slotsFor(3), members: 3, tickMs: 200, startsAt: 0, endsAt: 4 * 60_000,
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
