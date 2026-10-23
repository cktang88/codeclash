import { describe, expect, it } from 'vitest';
import { KIND_COUNT, Kind, PlatoonState, Terrain, TICKS_PER_MINUTE, type SimInput, type World } from './api.ts';
import { cellAt, isPassable } from './flowfield.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { cleanLines, musterCounts } from './muster.ts';
import { decodeInput, encodeInput, timedInputs, type EncodedInput, type Replay } from './replay.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { MAX_ALIVE, QUEUE_LIMIT, STATS } from './stats.ts';
import { resolveMove } from './steering.ts';
import { createWorld, step } from './world.ts';

function newWorld(players: number, seed: number): World {
  const params = { seed, slots: slotsFor(players), members: players };
  return createWorld(params, generateMap(params));
}

const joins = (n: number): SimInput[] => Array.from({ length: n }, (_, p) => ({ kind: 'join', p, slot: p, hue: p * 40 }));

function onGround(w: World, x: number, y: number): boolean {
  const c = cellAt(w.map, x, y);
  return c >= 0 && isPassable(w.map.terrain[c]!);
}

/** Every invariant a war must keep after any tick, whatever its inputs. Returns the first broken one. */
function brokenInvariant(w: World): string | null {
  const ids = new Set(w.platoons.map((pl) => pl.id));
  const members = new Map<number, number>();
  const limit = w.map.radius + w.map.navCell * 1.5;
  for (const u of w.units) {
    const name = `${STATS[u.kind]!.name} ${u.id}`;
    if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) return `${name} position`;
    if (!(Number.isFinite(u.hp) && u.hp > 0 && u.hp <= u.maxHp)) return `${name} hp ${u.hp}`;
    if (u.x * u.x + u.y * u.y > limit * limit) return `${name} outside the disc`;
    if (!STATS[u.kind]!.flying && !onGround(w, u.x, u.y)) return `${name} on rock or water`;
    if (!ids.has(u.platoon)) return `${name} has no platoon`;
    members.set(u.platoon, (members.get(u.platoon) ?? 0) + 1);
  }
  for (const pl of w.platoons) {
    const n = members.get(pl.id) ?? 0;
    if (pl.state === PlatoonState.Queued) {
      if (n !== 0) return `queued platoon ${pl.id} has soldiers`;
      continue;
    }
    if (pl.alive !== n || n === 0) return `platoon ${pl.id} alive ${pl.alive}, members ${n}`;
    if (!Number.isFinite(pl.x) || !Number.isFinite(pl.y) || !Number.isFinite(pl.morale)) return `platoon ${pl.id} not finite`;
    if (pl.state !== PlatoonState.Rout && !onGround(w, pl.x, pl.y)) return `banner ${pl.id} on rock or water`;
  }
  if (w.units.length > MAX_ALIVE) return 'too many soldiers';
  for (const p of w.players) {
    if (p.queue.length > QUEUE_LIMIT) return `player ${p.p} queue`;
    if (!Number.isFinite(p.renown) || !p.lines.every(Number.isFinite) || !p.raised.every(Number.isFinite)) return `player ${p.p} stats not finite`;
  }
  for (const st of w.structures) if (!(Number.isFinite(st.hp) && st.hp >= 0)) return `structure ${st.site} hp`;
  if (w.shots.length > MAX_ALIVE * 4) return 'shots grow without bound';
  return null;
}

// Pushes shaped to raise every one of the twenty kinds.
const L = (code: number, test = 0, comment = 0, docs = 0, config = 0, removed = 0) => [code, test, comment, docs, config, removed, 0, 0, 0];
const SHAPES: { lines: number[]; msg: string; files: number; branches: number }[] = [
  { lines: L(350, 0, 10), msg: 'feat: sync', files: 6, branches: 30 },
  { lines: L(700, 50, 20), msg: 'feat: offline mode', files: 9, branches: 80 },
  { lines: L(100, 0, 5, 0, 0, 900), msg: 'refactor: drop legacy auth', files: 7, branches: 5 },
  { lines: L(400, 0, 0, 0, 0, 300), msg: 'Revert "feat: sync"', files: 6, branches: 30 },
  { lines: L(300, 0, 10), msg: 'Update scheduler', files: 4, branches: 60 },
  { lines: L(150, 0, 5), msg: 'fix: crash on resume', files: 5, branches: 12 },
  { lines: L(80, 0, 5), msg: 'perf: cache lookups', files: 2, branches: 40 },
  { lines: L(200, 0, 5), msg: 'Rename everything', files: 14, branches: 20 },
  { lines: L(0, 200, 100, 200, 200), msg: 'docs: guide', files: 0, branches: 0 },
  { lines: L(10, 0, 1), msg: 'chore(deps): bump vite', files: 5, branches: 0 },
  { lines: L(80), msg: 'wip', files: 1, branches: 6 },
];

describe('snapshot mid-battle', () => {
  it('continues bit-for-bit with every kind fighting, dragons breathing, sieges, routs, regroups, a sack and the Monolith falling', () => {
    const players = 8;
    const w = newWorld(players, 5);
    const start = 8 * TICKS_PER_MINUTE;
    const end = start + 8 * TICKS_PER_MINUTE;
    const inputsAt = (t: number): SimInput[] => {
      const out: SimInput[] = t === 0 ? joins(players) : [];
      // One opening push each, then one every 400 ticks: slow enough that no one tires, so heroes still muster.
      const i = t < 220 ? (t - 20) / 25 : t % 400 === 0 ? 3 + t / 400 : -1;
      if (i >= 0 && Number.isInteger(i)) out.push({ kind: 'push', p: i % players, repo: i % players, commits: 1, ...SHAPES[i % SHAPES.length]! });
      // A siege wave: sweeping changes raise Trebuchets alongside line troops for the march on a capital.
      if (t === start - 1200) for (let p = 1; p < 6; p++) out.push({ kind: 'push', p, repo: p, commits: 1, ...SHAPES[7]!, lines: L(400, 0, 0, 0, 200) });
      if (t === start - 1200) {
        for (let p = 1; p < players; p++) out.push({ kind: 'rally', p, site: p < 6 ? 0 : 2 * w.map.slots }, { kind: 'doctrine', p, doctrine: 3 });
      }
      if (t === start + 100) out.push({ kind: 'cry', p: 2 });
      return out;
    };
    const seen = new Array<number>(KIND_COUNT).fill(0);
    while (w.tick < start) {
      step(w, inputsAt(w.tick));
      for (const u of w.units) seen[u.kind] = 1;
    }
    // Bring the walls low so a sack and the Monolith's fall land inside the window.
    w.structures[0]!.hp = 1500;
    w.structures[1]!.hp = 200;

    const r = restore(snapshot(w));
    expect(checksum(r)).toBe(checksum(w));
    const tally = { regroups: 0, routs: 0, sacks: 0, breaths: 0, boulders: 0, fireballs: 0, heals: 0, monolith: 0 };
    while (w.tick < end) {
      const inputs = inputsAt(w.tick);
      const ev = step(w, inputs);
      step(r, inputs);
      if (checksum(r) !== checksum(w)) expect.fail(`diverged at tick ${w.tick}`);
      for (const u of w.units) seen[u.kind] = 1;
      tally.regroups += ev.regroups.length;
      tally.routs += ev.routs.length;
      tally.sacks += ev.sacks.length;
      tally.breaths += ev.breaths.length;
      tally.boulders += ev.shots.filter((s) => s.kind === 3).length;
      tally.fireballs += ev.shots.filter((s) => s.kind === 2).length;
      tally.heals += ev.heals.length;
      if (ev.monolith) tally.monolith++;
    }
    expect(seen.join('')).toBe('1'.repeat(KIND_COUNT));
    for (const [k, n] of Object.entries(tally)) expect(n, k).toBeGreaterThan(0);
    expect(w.monolithFallen).toBe(true);
    expect(JSON.stringify(snapshot(r))).toBe(JSON.stringify(snapshot(w)));
  }, 60_000);

  it('hashes -0 like the 0 it becomes through JSON', () => {
    const w = newWorld(4, 3);
    step(w, joins(4));
    step(w, [{ kind: 'push', p: 0, repo: 0, commits: 1, files: 3, branches: 10, msg: '', lines: [50, 0, 0, 0, 0, 0, 0, 0, 0] }]);
    w.platoons[0]!.hx = -0;
    expect(checksum(restore(snapshot(w)))).toBe(checksum(w));
  });
});

describe('fuzzed inputs', () => {
  const MALFORMED: unknown[] = [
    null,
    { kind: 'bogus', p: 0 },
    { kind: 'join', p: 0, slot: 5, hue: 0 },
    { kind: 'join', p: 4, slot: 1.5, hue: 0 },
    { kind: 'join', p: 4, slot: Number.NaN, hue: 0 },
    { kind: 'push', p: 99, repo: 0, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: -1, repo: 0, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: '0', repo: 0, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: 0, repo: 2.5, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: 0, repo: Number.NaN, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: 0, repo: -3, lines: [10], commits: 1, files: 3, branches: 10, msg: '' },
    { kind: 'push', p: 1, repo: 1, lines: null, commits: 1, files: 3, branches: 10, msg: 'fix' },
    { kind: 'push', p: 1, repo: 1, lines: 'abc', commits: 1, files: 3, branches: 10, msg: 42 },
    { kind: 'push', p: 1, repo: 1, lines: [Number.NaN, Infinity, -5, 1.5, '30', null], commits: 1, files: 3, branches: 10, msg: undefined },
    { kind: 'push', p: 2, repo: 7, lines: [1e300, 1e300, 1e300, 1e300, 1e300, 1e300, 1e300, 1e300, 1e300, 1e300, 1e300], commits: 1, files: 3, branches: 10, msg: 'bug' },
    { kind: 'doctrine', p: 0, doctrine: Number.NaN },
    { kind: 'doctrine', p: 0, doctrine: 2.5 },
    { kind: 'doctrine', p: 0, doctrine: 7 },
    { kind: 'rally', p: 0, site: 1.5 },
    { kind: 'rally', p: 0, site: Number.NaN },
    { kind: 'rally', p: 0, site: -1 },
    { kind: 'rally', p: 0, site: 999 },
    { kind: 'cry', p: 9 },
  ];

  function fuzz(seed: number, ticks: number, check: boolean): number[] {
    const players = 4;
    const w = newWorld(players, seed);
    let r = seed;
    const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
    const pick = (n: number) => Math.floor(rand() * n);
    const sums: number[] = [];
    for (let t = 0; t < ticks; t++) {
      const inputs: SimInput[] = t === 0 ? joins(players) : [];
      if (t === 1500) inputs.push({ kind: 'join', p: players, slot: players, hue: 99 });
      if (rand() < 0.03) inputs.push(MALFORMED[pick(MALFORMED.length)] as SimInput);
      if (rand() < 0.02) {
        const lines = SHAPES[pick(SHAPES.length)]!.lines.map((n) => (rand() < 0.5 ? n : pick(300)));
        inputs.push({ kind: 'push', p: pick(players + 2), repo: pick(4), commits: 1, files: 3, branches: 10, msg: rand() < 0.3 ? 'fix' : 'x', lines });
      }
      if (rand() < 0.002) inputs.push({ kind: 'rally', p: pick(players), site: pick(w.map.sites.length) });
      if (rand() < 0.002) inputs.push({ kind: 'doctrine', p: pick(players), doctrine: pick(5) as 0 });
      if (rand() < 0.001) inputs.push({ kind: 'cry', p: pick(players) });
      step(w, inputs);
      if (check) {
        const broken = brokenInvariant(w);
        if (broken) expect.fail(`tick ${w.tick}: ${broken}`);
      }
      if (t % 50 === 0) sums.push(checksum(w));
    }
    return sums;
  }

  it('never crashes, keeps every invariant, and is reproducible', () => {
    const a = fuzz(11, 4000, true);
    const b = fuzz(11, 4000, false);
    expect(b).toEqual(a);
  }, 60_000);
});

describe('input validation', () => {
  it('ignores malformed commands without touching the world', () => {
    const bad: unknown[] = [
      { kind: 'rally', p: 0, site: 1.5 },
      { kind: 'rally', p: 0, site: Number.NaN },
      { kind: 'doctrine', p: 0, doctrine: Number.NaN },
      { kind: 'doctrine', p: 0, doctrine: 1.5 },
      { kind: 'join', p: 2, slot: 2.5, hue: 0 },
      { kind: 'join', p: 2, slot: Number.NaN, hue: 0 },
      { kind: 'push', p: 0, repo: 0.5, lines: [100], commits: 1, files: 3, branches: 10, msg: '' },
      { kind: 'push', p: 0, repo: Number.NaN, lines: [100], commits: 1, files: 3, branches: 10, msg: '' },
      null,
    ];
    for (const input of bad) {
      const a = newWorld(2, 4);
      const b = newWorld(2, 4);
      step(a, joins(2));
      step(b, joins(2));
      expect(() => step(a, [input as SimInput])).not.toThrow();
      step(b, []);
      for (let i = 0; i < 20; i++) {
        step(a, []);
        step(b, []);
      }
      expect(JSON.stringify(snapshot(a)), JSON.stringify(input)).toBe(JSON.stringify(snapshot(b)));
    }
  });

  it('treats non-numeric, negative, fractional and runaway line counts the same live and replayed', () => {
    const raw = [12.7, Number.NaN, Infinity, -4, 3.2, 1e300, 0, 0, 5];
    expect(cleanLines(raw)).toEqual([12, 0, 1e9, 0, 3, 1e9, 0, 0, 5]);
    expect(cleanLines(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const n of musterCounts(raw, 0, 0)) expect(Number.isFinite(n)).toBe(true);

    const live = newWorld(2, 4);
    const replayed = newWorld(2, 4);
    step(live, joins(2));
    step(replayed, joins(2));
    const push: SimInput = { kind: 'push', p: 0, repo: 0, lines: raw, commits: 1, files: 3, branches: 10, msg: 'fix' };
    const encoded = JSON.parse(JSON.stringify(encodeInput(live.tick, push))) as EncodedInput;
    step(live, [push]);
    step(replayed, [decodeInput(encoded).input]);
    for (let i = 0; i < 50; i++) {
      step(live, []);
      step(replayed, []);
    }
    expect(JSON.stringify(snapshot(replayed))).toBe(JSON.stringify(snapshot(live)));
    expect(live.players[0]!.lines.every(Number.isFinite)).toBe(true);
  });
});

describe('terrain', () => {
  it('musters no ground soldier on rock or water, even in wide formations', () => {
    // Outriders on the flanks of these platoons used to land in water or rock and stay there.
    for (const [players, seed] of [[2, 4], [2, 10], [4, 2]] as const) {
      const w = newWorld(players, seed);
      step(w, joins(players));
      const wide = [100, 30, 10, 0, 0, 150, 0, 0, 0];
      step(w, Array.from({ length: players }, (_, p): SimInput => ({ kind: 'push', p, repo: p, lines: wide, commits: 1, files: 6, branches: 10, msg: 'refactor: split' })));
      expect(w.units.length).toBeGreaterThan(10 * players);
      for (const u of w.units) if (!STATS[u.kind]!.flying) expect(onGround(w, u.x, u.y), `seed ${seed} ${STATS[u.kind]!.name}`).toBe(true);
    }
  });

  it('rallies a routed platoon whose banner was left over rock or water', () => {
    const w = newWorld(2, 2);
    step(w, joins(2));
    step(w, [{ kind: 'push', p: 0, repo: 0, lines: [60, 0, 0, 0, 0, 0, 0, 0, 0], commits: 1, files: 3, branches: 10, msg: '' }]);
    const pl = w.platoons[0]!;
    const blocked = w.map.terrain.findIndex((t) => t === Terrain.Rock || t === Terrain.Water);
    expect(blocked).toBeGreaterThanOrEqual(0);
    pl.state = PlatoonState.Rout;
    pl.morale = 0;
    pl.x = w.map.originX + ((blocked % w.map.navCols) + 0.5) * w.map.navCell;
    pl.y = w.map.originY + (Math.floor(blocked / w.map.navCols) + 0.5) * w.map.navCell;
    for (let i = 0; i < 5 && pl.state === PlatoonState.Rout; i++) step(w, []);
    expect(pl.state).not.toBe(PlatoonState.Rout);
  });

  it('lets a banner creep forward below the soldiers’ jitter deadband', () => {
    const w = newWorld(2, 2);
    const out = { x: 0, y: 0 };
    const home = w.map.sites[0]!;
    resolveMove(out, w.map, home.x, home.y, 0.1, 0.1, 0.2);
    expect(out).toEqual({ x: home.x, y: home.y });
    resolveMove(out, w.map, home.x, home.y, 0.1, 0.1, 0.2, 0);
    expect(out.x).toBeGreaterThan(home.x);
  });

  it('keeps Sappers with their banner until the walls are within reach', () => {
    const w = newWorld(4, 7);
    step(w, joins(4));
    step(w, [
      { kind: 'push', p: 0, repo: 0, lines: [0, 0, 0, 0, 100, 0, 0, 0, 0], commits: 1, files: 3, branches: 10, msg: '' },
      { kind: 'rally', p: 0, site: 2 },
    ]);
    const sappers = () => w.units.filter((u) => u.kind === Kind.Sapper);
    expect(sappers().length).toBeGreaterThan(0);
    const far = w.map.sites[2]!;
    for (let i = 0; i < 40; i++) {
      step(w, []);
      for (const u of sappers()) {
        const d = Math.hypot(u.x - far.x, u.y - far.y);
        if (d > 600) expect(u.target).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('replay decoding', () => {
  it('throws on rows of the wrong shape rather than returning nothing', () => {
    expect(() => decodeInput([5, 'bogus', 0] as unknown as EncodedInput)).toThrow();
    expect(() => decodeInput(null as unknown as EncodedInput)).toThrow();
    expect(() => decodeInput([-1, 'cry', 0])).toThrow();
    expect(() => decodeInput([5, 'push', 0, 0, null, 1, 'x'] as unknown as EncodedInput)).toThrow();
    expect(decodeInput([5, 'push', 0, 0, [3, 2], 1, 7 as unknown as string] as unknown as EncodedInput).input).toMatchObject({ lines: [3, 2, 0, 0, 0, 0, 0, 0, 0], msg: '' });
  });

  it('applies inputs by tick, then by arrival, as the live war does', () => {
    const replay = { inputs: [[10, 'cry', 0], [3, 'cry', 1], [3, 'doc', 0, 1]] } as unknown as Replay;
    expect(timedInputs(replay).map((t) => [t.tick, t.seq])).toEqual([[3, 2], [3, 3], [10, 1]]);
  });
});
