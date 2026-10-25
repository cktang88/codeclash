import { describe, expect, it } from 'vitest';
import { Cat, PlatoonState, Terrain, TICKS_PER_MINUTE, type SimInput, type World } from './api.ts';
import { buildDigest } from '../rules/digest.ts';
import { musterFront, sitePresence } from './council.ts';
import { cellAt } from './flowfield.ts';
import { hexRoute } from './hexroute.ts';
import { fortBetween, generateMap, seatOrder, slotsFor } from './mapgen.ts';
import { applyDelta, armyFor, emptyLedger, purposeOf, slotsOf } from './muster.ts';
import { computeRing, hostile, neighbours, stillIn } from './ring.ts';
import { scratchFor } from './scratch.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { CAPITAL_TOWER, CONQUEST_BONUS, breachPace, pacing } from './stats.ts';
import { mulberry } from '../rules/bots.ts';
import { clearPath } from './steering.ts';
import { compareStandings, contribution, createWorld, dayWinner, fieldCap, step, wallsFor } from './world.ts';
import { encodeInput, replayParams, runReplay, type EncodedInput, type Replay } from './replay.ts';
import { breachable } from './council.ts';

/** A day-long war's siege timetable. */
const DAY = pacing(undefined);
/** The tick every gate is open and walls fall at full pace. */
const FULL_PACE = DAY.full;

function ringWorld(seats: number, seed = 7): World {
  const params = { seed, slots: slotsFor(seats), members: seats };
  return createWorld(params, generateMap(params));
}

/** Seats by the war's seeded shuffle, as the server hands them out. */
function seat(w: World, seats: number): SimInput[] {
  const order = seatOrder(w.params.seed, w.map.slots);
  return Array.from({ length: seats }, (_, p) => ({ kind: 'join', p, slot: order[p]!, hue: p * 30 }));
}

const lines = (code: number, test = 0, config = 0) => {
  const l = new Array<number>(9).fill(0);
  l[Cat.Code] = code;
  l[Cat.Test] = test;
  l[Cat.Config] = config;
  return l;
};
const push = (p: number, code: number, msg = 'feat: work', files = 4, branches = 20, config = 0): SimInput => ({
  kind: 'push', p, repo: p, commits: 1, msg, files, branches, churn: 0, filler: 0, lines: lines(code, Math.floor(code / 5), config),
});

/** Hands the capital of seat `slot` to player `p` as a capture would, without a siege. */
function cede(w: World, slot: number, p: number): void {
  const st = w.structures.find((s) => w.map.sites[s.site]!.slot === slot)!;
  w.players[st.p]!.capitals--;
  if (w.players[st.p]!.capitals === 0) w.players[st.p]!.rising = true;
  st.p = p;
  st.taken++;
  w.sites[st.site]!.owner = p;
  w.players[p]!.capitals++;
}

/** The slot each player sits at, clockwise, as owners around the ring. */
const ringOrder = (w: World) => computeRing(w).order.map((s) => computeRing(w).owner[s]);

describe('the ring', () => {
  for (const seats of [3, 4, 8, 16]) {
    it(`gives each of ${seats} seats its two neighbours around an impassable centre`, () => {
      const w = ringWorld(seats, 11 + seats);
      step(w, seat(w, seats));
      const ring = computeRing(w);
      const order = ringOrder(w);
      expect(ring.owners).toBe(seats);
      for (let i = 0; i < seats; i++) {
        const p = order[i]!;
        const cw = order[(i + 1) % seats]!;
        const ccw = order[(i - 1 + seats) % seats]!;
        const fronts = ring.fronts[p]!;
        expect(fronts.map((f) => f.dir)).toEqual([1, -1]);
        expect(fronts[0]!.foe).toBe(cw);
        expect(fronts[1]!.foe).toBe(ccw);
        expect(new Set(neighbours(ring, p))).toEqual(new Set([cw, ccw]));
        // Every front has its border fort, and one fort lies beside each capital on it.
        for (const f of fronts) expect(f.forts.length).toBeGreaterThanOrEqual(1);
        // Only neighbours are foes.
        for (let q = 0; q < seats; q++) expect(hostile(ring, p, q)).toBe(q === cw || q === ccw);
      }
      // The centre is a lake or a massif: impassable, and no straight road crosses it.
      const map = w.map;
      for (let r = 0; r < map.centre - 30; r += 16) {
        for (let k = 0; k < 16; k++) {
          const c = cellAt(map, Math.cos((k * Math.PI) / 8) * r, Math.sin((k * Math.PI) / 8) * r);
          expect([Terrain.Water, Terrain.Rock]).toContain(map.terrain[c]);
        }
      }
      const a = map.sites[0]!;
      const b = map.sites[Math.floor(map.slots / 2)]!;
      expect(clearPath(map, a.x, a.y, b.x, b.y)).toBe(false);
      // Neighbours are joined by a road around the ring.
      for (let s = 0; s < map.slots; s++) {
        const from = map.sites[s]!;
        const to = map.sites[(s + 1) % map.slots]!;
        expect(hexRoute(map, from.x, from.y, to.x, to.y).length).toBeGreaterThan(0);
      }
    });
  }

  it('shuffles seats per war from its seed, the same every time', () => {
    expect(seatOrder(42, 9)).toEqual(seatOrder(42, 9));
    expect([...seatOrder(42, 9)].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const orders = new Set(Array.from({ length: 20 }, (_, seed) => seatOrder(seed, 9).join()));
    expect(orders.size).toBeGreaterThan(15);
  });

  it('recomputes neighbours as capitals change hands, down to two owners sharing both fronts', () => {
    const w = ringWorld(4, 3);
    step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
    // Seats 0..3 and a spare seat 4: 0's neighbours are 1 and 3.
    expect(neighbours(computeRing(w), 0)).toEqual([1, 3]);
    cede(w, 1, 0);
    let ring = computeRing(w);
    expect(ring.fronts[0]!.map((f) => [f.dir, f.from, f.to, f.foe])).toEqual([[1, 1, 2, 2], [-1, 0, 3, 3]]);
    // The fallen player rises against whoever holds its home, and fights no one else.
    expect(ring.fronts[1]).toEqual([{ dir: 0, from: -1, to: 1, foe: 0, forts: [] }]);
    expect(hostile(ring, 1, 0)).toBe(true);
    expect(hostile(ring, 1, 2)).toBe(false);
    expect(hostile(ring, 2, 0)).toBe(true);
    cede(w, 3, 2);
    ring = computeRing(w);
    expect(ring.owners).toBe(2);
    expect(ring.fronts[0]!.map((f) => f.foe)).toEqual([2, 2]);
    expect(ring.fronts[2]!.map((f) => f.foe)).toEqual([0, 0]);
    cede(w, 2, 0);
    cede(w, 3, 0);
    ring = computeRing(w);
    expect(ring.owners).toBe(1);
    expect(ring.fronts[0]).toEqual([]);
  });
});

describe('fighting only neighbours', () => {
  it('lets soldiers of armies that are not neighbours pass each other by, and towers spare them', () => {
    const w = ringWorld(4, 5);
    step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
    step(w, [push(0, 200), push(2, 200)]);
    for (let t = 0; t < 5; t++) step(w, []);
    // Players 0 and 2 sit across the ring: march 2's army right up to 0's walls, among 0's soldiers.
    const home = w.map.sites[0]!;
    for (const u of w.units) {
      u.x = home.x + (u.p === 0 ? 30 : 60) + (u.id % 5) * 4;
      u.y = home.y + (u.id % 3) * 4;
    }
    for (const pl of w.platoons) {
      pl.x = home.x + 40;
      pl.y = home.y;
    }
    let hits = 0;
    let towerShots = 0;
    for (let t = 0; t < 60; t++) {
      const ev = step(w, []);
      hits += ev.hits.filter((h) => h.unit >= 0).length;
      towerShots += ev.shots.filter((s) => s.from < 0).length;
      for (const u of w.units) expect(u.target <= 0 || w.units.find((v) => v.id === u.target)?.p !== (u.p === 0 ? 2 : 0)).toBe(true);
    }
    expect(hits).toBe(0);
    expect(towerShots).toBe(0);
  });

  it('sends every platoon only after its neighbours’ forts and capitals, or to its own, in rings of 3 to 16', () => {
    for (const seats of [3, 4, 8, 16]) {
      const w = ringWorld(seats, 21);
      step(w, seat(w, seats));
      w.tick = FULL_PACE;
      let r = 9;
      const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
      let deaths = 0;
      for (let t = 0; t < 6 * TICKS_PER_MINUTE; t++) {
        const inputs: SimInput[] = [];
        for (let p = 0; p < seats; p++) if (rand() < 1 / (1.5 * TICKS_PER_MINUTE)) inputs.push(push(p, 60 + Math.floor(rand() * 200)));
        const ev = step(w, inputs);
        const ring = scratchFor(w).ring;
        for (const d of ev.deaths) {
          deaths++;
          if (d.killer >= 0) expect(hostile(ring, d.killer, d.p), `p${d.killer} slew p${d.p}`).toBe(true);
        }
        if (t % 50 !== 0) continue;
        for (const pl of w.platoons) {
          if (pl.state === PlatoonState.Queued || pl.site < 0) continue;
          const def = w.map.sites[pl.site]!;
          if (def.kind === 'capital') {
            const owner = ring.owner[def.slot]!;
            expect(owner === pl.p || hostile(ring, pl.p, owner), `p${pl.p} marching on seat ${def.slot}`).toBe(true);
          } else {
            const onFront = ring.fronts[pl.p]!.some((f) => f.forts.includes(pl.site));
            const beside = ring.capitals[pl.p]!.some((c) => fortBetween(w.map.slots, c) === pl.site || fortBetween(w.map.slots, c - 1) === pl.site);
            expect(onFront || beside, `p${pl.p} marching on fort ${pl.site}`).toBe(true);
          }
        }
      }
      expect(deaths).toBeGreaterThan(10);
    }
  }, 30_000);

  it('musters toward the front under more pressure, alternating between quiet ones', () => {
    const w = ringWorld(4, 5);
    step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
    step(w, [push(0, 400), push(0, 400)]);
    for (let t = 0; t < 3; t++) step(w, []);
    const fronts = w.platoons.filter((pl) => pl.p === 0 && pl.state !== PlatoonState.Queued).map((pl) => pl.front);
    // Platoons mustered together split between the two quiet fronts.
    expect(fronts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fronts)).toEqual(new Set([1, -1]));
    // Player 3's army on the counter-clockwise fort draws the next muster there.
    step(w, [push(3, 300)]);
    const fort = fortBetween(w.map.slots, 4);
    const site = w.map.sites[fort]!;
    for (const u of w.units) if (u.p === 3) {
      u.x = site.x;
      u.y = site.y;
    }
    for (const u of w.units) if (u.p === 0) {
      u.x = w.map.sites[0]!.x;
      u.y = w.map.sites[0]!.y;
    }
    const s = scratchFor(w);
    expect(musterFront(w, s, 0, sitePresence(w))!.dir).toBe(-1);
  });
});

describe('conquest', () => {
  /** A war at the hour sieges open, with player 0 holding the approach to seat 1. */
  function siege(seats = 3) {
    const w = ringWorld(seats, 4);
    w.tick = FULL_PACE;
    step(w, Array.from({ length: seats }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p * 40 })));
    w.sites[fortBetween(w.map.slots, 0)]!.owner = 0;
    return w;
  }
  /** Brings player p's fielded army up under the walls of seat `slot`, on the road outside them, sent to storm them. */
  function atWalls(w: World, p: number, slot: number): void {
    const c = w.map.sites[slot]!;
    const d = Math.hypot(c.x, c.y);
    const x = c.x - (c.y / d) * (c.radius + 40);
    const y = c.y + (c.x / d) * (c.radius + 40);
    for (const pl of w.platoons) if (pl.p === p && pl.state !== PlatoonState.Queued) {
      pl.site = c.id;
      pl.x = x;
      pl.y = y;
      pl.trail.length = 0;
      pl.routeSite = -1;
    }
    for (const u of w.units) if (u.p === p) {
      u.x = x + ((u.id % 7) - 3) * 3;
      u.y = y + ((u.id % 5) - 2) * 3;
    }
  }
  function storm(w: World, p: number, slot: number, limit = 6 * TICKS_PER_MINUTE) {
    atWalls(w, p, slot);
    for (let t = 0; t < limit; t++) {
      const ev = step(w, []);
      const c = ev.conquests.find((x) => w.map.sites[x.site]!.slot === slot);
      if (c) return { c, ev };
      if (t === limit - 1) expect.fail(`p${p} never took seat ${slot}`);
    }
    throw new Error('unreachable');
  }

  it('captures a capital at 0 HP for the last blow: it changes hands, stands again, and its garrison dies', () => {
    const w = siege();
    step(w, [push(1, 60), push(0, 600, 'feat: siege', 8, 60, 160)]);
    for (let t = 0; t < 20; t++) step(w, []);
    w.structures[1]!.hp = 1;
    // Player 1's soldiers stand inside their walls as the last blow falls.
    const home = w.map.sites[1]!;
    atWalls(w, 0, 1);
    for (const u of w.units) if (u.p === 1) {
      u.x = home.x;
      u.y = home.y;
    }
    const inside = w.units.filter((u) => u.p === 1).length;
    expect(inside).toBeGreaterThan(0);
    const { c, ev } = storm(w, 0, 1);
    expect(c).toMatchObject({ p: 0, previous: 1, retake: false });
    const st = w.structures[1]!;
    expect(st.p).toBe(0);
    expect(st.maxHp).toBe(wallsFor(w.players[0]!));
    expect(st.hp).toBeGreaterThan(st.maxHp * 0.4);
    expect(w.sites[1]!.owner).toBe(0);
    expect(w.players[0]!.conquests).toBe(1);
    expect(w.players[0]!.capitals).toBe(2);
    expect(w.players[1]).toMatchObject({ capitals: 0, rising: true, fallen: 1 });
    // A player with no capital but soldiers raised today is still in the war.
    expect(stillIn(w.players[1]!)).toBe(true);
    expect(ev.risings).toEqual([{ p: 1 }]);
    expect(ev.deaths.filter((d) => d.p === 1).length).toBeGreaterThan(0);
    expect(w.units.filter((u) => u.p === 1 && Math.hypot(u.x - home.x, u.y - home.y) < home.radius)).toEqual([]);
    // Its gates muster for the captor now: a platoon facing the front past it marches from there.
    expect(computeRing(w).fronts[0]!.some((f) => f.from === 1)).toBe(true);
  });

  it('brings walls down no faster than the breach time allows, however many strike them', () => {
    const w = siege();
    step(w, [push(0, 3000, 'feat: siege', 40, 300, 240)]);
    for (let t = 0; t < 20; t++) step(w, []);
    const st = w.structures[1]!;
    atWalls(w, 0, 1);
    const start = st.hp;
    let ticks = 0;
    for (; ticks < 3 * TICKS_PER_MINUTE; ticks++) step(w, []);
    expect(st.p).toBe(1);
    expect(start - st.hp).toBeGreaterThan(0);
    expect(start - st.hp).toBeLessThanOrEqual((st.maxHp * ticks) / DAY.breach + 1e-6);
  });

  it('keeps its walls barred until the sieges open and its founder has had time to raise a levy', () => {
    const w = ringWorld(3, 4);
    step(w, Array.from({ length: 3 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p * 40 })));
    w.sites[fortBetween(w.map.slots, 0)]!.owner = 0;
    step(w, [push(0, 600)]);
    for (let t = 0; t < 4 * TICKS_PER_MINUTE; t++) step(w, []);
    expect(w.structures[1]!.hp).toBe(w.structures[1]!.maxHp);
    expect(w.tick).toBeLessThan(DAY.opens);
  });

  it('multiplies the army budget by each capital held beyond home, splits and squashes alike', () => {
    const ledger = emptyLedger();
    applyDelta(ledger, { lines: lines(900, 100), files: 12, branches: 120, churn: 0, filler: 0, purpose: purposeOf('feat: x') });
    const base = slotsOf(armyFor(ledger, 3));
    // The budget (in slots, before support) grows by CONQUEST_BONUS per capital; rounding moves it by a slot at most.
    const bonused = slotsOf(armyFor(ledger, 3, 2));
    expect(Math.abs(bonused - base * (1 + 2 * CONQUEST_BONUS))).toBeLessThan(base * 0.1);
    expect(slotsOf(armyFor(ledger, 3, 0))).toBe(base);

    const day = (pushes: SimInput[][]) => {
      const w = ringWorld(4, 2);
      step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
      step(w, [push(0, 50)]);
      cede(w, 1, 0);
      cede(w, 3, 0);
      for (const batch of pushes) step(w, batch);
      return w;
    };
    const split = day([[push(0, 300)], [push(0, 300)], [push(0, 300)]]);
    const squashed = day([[{ ...(push(0, 900) as Extract<SimInput, { kind: 'push' }>), files: 12, branches: 60 }]]);
    const a = split.players[0]!;
    const b = squashed.players[0]!;
    expect(a.ledger.lines[Cat.Code]).toBe(b.ledger.lines[Cat.Code]);
    expect(slotsOf(a.raised)).toBe(slotsOf(armyFor(a.ledger, a.pushes, 2)));
    expect(slotsOf(b.raised)).toBe(slotsOf(armyFor(b.ledger, b.pushes, 2)));
    expect(slotsOf(a.raised)).toBe(slotsOf(b.raised));
    expect(fieldCap(split, a)).toBe(Math.floor(320 * (1 + 2 * CONQUEST_BONUS)));
    // Losing a captured capital does not make soldiers desert while the ledger grows.
    const before = slotsOf(a.raised);
    const st = split.structures.find((x) => x.site === 3)!;
    st.p = 3;
    a.capitals--;
    split.players[3]!.capitals++;
    step(split, [push(0, 20)]);
    expect(slotsOf(a.raised)).toBeGreaterThanOrEqual(before);
  });

  it('raises a rising outside its lost home that retakes it and rejoins the ring', () => {
    const w = siege();
    step(w, [push(0, 600, 'feat: siege', 8, 60, 160)]);
    for (let t = 0; t < 20; t++) step(w, []);
    w.structures[1]!.hp = 300;
    storm(w, 0, 1);
    expect(w.players[1]!.rising).toBe(true);
    // Player 0 marches its army away; player 1 pushes and rises outside its home's walls, beyond bowshot.
    for (const u of w.units) if (u.p === 0) u.hp = -1;
    w.units = w.units.filter((u) => u.p !== 0);
    w.platoons = w.platoons.filter((pl) => pl.p !== 0);
    step(w, [push(1, 400, 'feat: rise', 6, 40, 120)]);
    step(w, []);
    const rising = w.platoons.filter((pl) => pl.p === 1 && pl.state !== PlatoonState.Queued);
    expect(rising.length).toBeGreaterThan(0);
    const home = w.map.sites[1]!;
    for (const pl of rising) {
      expect(pl.rising).toBe(true);
      expect(pl.front).toBe(0);
      expect(Math.hypot(pl.x - home.x, pl.y - home.y)).toBeGreaterThan(home.radius + CAPITAL_TOWER.range - 10);
    }
    w.structures[1]!.hp = 200;
    // It must win the approach: hand it the fort beside home, as the march there would.
    w.sites[fortBetween(w.map.slots, 1)]!.owner = 1;
    const { c } = storm(w, 1, 1);
    expect(c).toMatchObject({ p: 1, previous: 0, retake: true });
    expect(w.players[1]).toMatchObject({ rising: false, capitals: 1 });
    expect(w.players[1]!.feats.retakes).toBe(1);
    const ring = computeRing(w);
    expect(ring.fronts[1]!.map((f) => f.dir)).toEqual([1, -1]);
    expect(neighbours(ring, 1)).toContain(0);
  });

  it('ends the war when one player holds every capital, and the field stands still after', () => {
    const w = siege(3);
    step(w, [push(0, 600, 'feat: siege', 8, 60, 160)]);
    cede(w, 2, 0);
    for (let t = 0; t < 20; t++) step(w, []);
    w.structures[1]!.hp = 300;
    const { ev } = storm(w, 0, 1);
    expect(ev.victory).toEqual({ p: 0 });
    expect(w.victor).toBe(0);
    expect(w.victoryTick).toBe(w.tick - 1);
    const sum = checksum(w);
    const units = JSON.stringify(w.units);
    const after = step(w, [push(1, 500)]);
    expect(after.musters).toEqual([]);
    expect(JSON.stringify(w.units)).toBe(units);
    expect(checksum(w)).not.toBe(sum);
    expect(w.players[1]!.pushes).toBe(0);
  });

  it('is deterministic through captures, risings and a snapshot round trip', () => {
    const run = () => {
      const w = siege(4);
      const inputs = (t: number): SimInput[] =>
        t === 2 ? [push(0, 600, 'feat: siege', 8, 60, 160)] : t % 300 === 1 ? [push(Math.floor(t / 300) % 4, 300, 'feat: x', 6, 30, 80)] : [];
      w.structures[1]!.hp = 500;
      const sums: number[] = [];
      let copy: World | null = null;
      for (let t = 0; t < 5 * TICKS_PER_MINUTE; t++) {
        if (t === 200) {
          // The war council sends only the platoons it can spare at the walls, so bring them to the last stone.
          atWalls(w, 0, 1);
          w.structures[1]!.hp = 1;
        }
        step(w, inputs(t));
        if (copy) step(copy, inputs(t));
        if (t === 400) copy = restore(snapshot(w));
        if (t % 100 === 0) sums.push(checksum(w));
      }
      expect(checksum(copy!)).toBe(checksum(w));
      return { sums, w };
    };
    const a = run();
    const b = run();
    expect(a.sums).toEqual(b.sums);
    expect(a.w.players.some((p) => p.conquests > 0)).toBe(true);
  });
});

describe('the siege timetable', () => {
  const HOUR = 60 * TICKS_PER_MINUTE;

  it('scales with the war’s length: a day opens its sieges at 09:36, a short war just as far in', () => {
    const day = pacing(undefined);
    expect(day).toEqual(pacing(24 * HOUR));
    expect(day.opens).toBe(Math.floor(9.6 * HOUR));
    expect(day.full).toBe(Math.floor(16.8 * HOUR));
    expect(day.barredUntil).toBe(Math.floor(15.6 * HOUR));
    expect(day.breach).toBe(30 * TICKS_PER_MINUTE);
    for (const ticks of [24 * HOUR, 25 * HOUR, 5 * HOUR, 10 * TICKS_PER_MINUTE]) {
      const pc = pacing(ticks);
      expect(pc.opens / ticks).toBeCloseTo(0.4, 3);
      expect(pc.full / ticks).toBeCloseTo(0.7, 3);
      expect(pc.barredUntil / ticks).toBeCloseTo(0.65, 3);
      expect(pc.grace / ticks).toBeCloseTo(0.08, 3);
      expect(pc.breach / ticks).toBeCloseTo(1 / 48, 2);
      // The breach ramps up from nothing when the sieges open, as a square, to full pace.
      expect(breachPace(pc, pc.opens - 1)).toBe(0);
      expect(breachPace(pc, Math.floor((pc.opens + pc.full) / 2))).toBeCloseTo(0.25, 2);
      expect(breachPace(pc, pc.full)).toBe(1);
    }
  });

  it('bars a founder’s gates by the war’s length: until a grace after its first push, or for all at 65%', () => {
    for (const ticks of [24 * HOUR, 4 * HOUR]) {
      const params = { seed: 5, slots: 4, members: 3, ticks };
      const w = createWorld(params, generateMap(params));
      step(w, Array.from({ length: 3 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p * 40 })));
      const pc = pacing(ticks);
      // Founder 1 pushes at a fifth of the war; founder 2 never does.
      w.tick = Math.floor(ticks * 0.2);
      step(w, [push(1, 100)]);
      const walls = (p: number) => w.structures.find((st) => st.p === p)!;
      const at = (tick: number, p: number) => {
        w.tick = tick;
        return breachable(w, walls(p));
      };
      expect(at(pc.opens - 1, 1)).toBe(false);
      const graceEnds = w.players[1]!.firstPushAt + pc.grace;
      expect(graceEnds).toBeLessThan(pc.opens);
      expect(at(pc.opens, 1)).toBe(true);
      expect(at(pc.opens, 2)).toBe(false);
      expect(at(pc.barredUntil - 1, 2)).toBe(false);
      expect(at(pc.barredUntil, 2)).toBe(true);
      // A late riser has its grace, but no longer than the gates stay barred for all.
      w.players[2]!.firstPushAt = pc.opens;
      expect(at(pc.opens + pc.grace - 1, 2)).toBe(false);
      expect(at(pc.opens + pc.grace, 2)).toBe(true);
    }
  });

  it('lets a short war be conquered, the same live and in its replay', () => {
    const minutes = 60;
    const ticks = minutes * TICKS_PER_MINUTE;
    const params = { seed: 2, slots: slotsFor(3), members: 3, ticks };
    const order = seatOrder(params.seed, params.slots);
    const run = () => {
      const w = createWorld(params, generateMap(params));
      const rand = mulberry(params.seed);
      const log: EncodedInput[] = [];
      let first = -1;
      while (w.tick < ticks && w.victor < 0) {
        const inputs: SimInput[] = [];
        if (w.tick === 0) for (let p = 0; p < 3; p++) inputs.push({ kind: 'join', p, slot: order[p]!, hue: p * 50 });
        // One busy developer, two quiet ones.
        for (let p = 0; p < 3; p++) {
          if (rand() >= 1 / ((p === 0 ? 1 : 5) * TICKS_PER_MINUTE)) continue;
          const code = 40 + Math.floor(rand() * 200);
          inputs.push({ kind: 'push', p, repo: p, commits: 1, msg: 'feat: x', lines: [code, Math.floor(code / 5), 5, 0, 0, 0, 0, 0, 0], files: 3, branches: Math.floor(code / 8), churn: 0, filler: 0 });
        }
        for (const input of inputs) log.push(encodeInput(w.tick, input));
        const ev = step(w, inputs);
        if (ev.conquests.length > 0 && first < 0) first = w.tick;
      }
      return { w, log, first };
    };
    const a = run();
    // Nothing falls before the sieges open; the ring falls before the war's end.
    expect(a.first).toBeGreaterThanOrEqual(pacing(ticks).opens);
    expect(a.w.victor).toBe(0);
    expect(a.w.victoryTick).toBeLessThan(ticks);
    // A replay carries the war's length in its start and end, and rebuilds the same war.
    const replay: Replay = {
      v: 1, seed: params.seed, slots: params.slots, members: 3, tickMs: 200, startsAt: 1_000_000, endsAt: 1_000_000 + minutes * 60_000,
      players: [0, 1, 2].map((p) => ({ login: `p${p}`, id: p + 1, hue: p * 50, slot: order[p]!, bot: false })), repos: [], inputs: a.log,
    };
    expect(replayParams(replay).ticks).toBe(ticks);
    expect(checksum(runReplay(replay, a.w.tick))).toBe(checksum(a.w));
    // The same war under a day's timetable would still be waiting for its sieges to open.
    expect(a.w.tick).toBeLessThan(pacing(undefined).opens);
  }, 60_000);
});

describe('the winner', () => {
  const replay = (w: World): Replay => ({
    v: 1, seed: w.params.seed, slots: w.params.slots, members: w.params.members, tickMs: 200, startsAt: 0, endsAt: 1000,
    players: w.players.map((p) => ({ login: `p${p.p}`, id: p.p + 1, hue: p.hue, slot: p.slot, bot: false })), repos: [], inputs: [],
  });

  it('at the reset, breaks a tie on capitals by the share of the day\'s code, then renown, then first joined', () => {
    const w = ringWorld(4, 1);
    step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
    for (const pl of w.players) pl.pushes = 1;
    const code = [1200, 2600, 2600, 400];
    w.players.forEach((pl, p) => (pl.ledger.lines[Cat.Code] = code[p]!));
    w.players[0]!.renown = 5000;
    w.players[1]!.renown = 300;
    w.players[2]!.renown = 900;
    w.players[3]!.renown = 10;
    expect(w.players.map(contribution)).toEqual(code);
    // Every capital still with its founder: code decides before renown, and renown splits equal code.
    let d = buildDigest(w, replay(w), []);
    expect(d.winner).toBe(2);
    expect(d.players.map((p) => p.place)).toEqual([3, 2, 1, 4]);
    expect(d.players.map((p) => p.contribution)).toEqual(code);
    expect(d.headline).toContain('won it on renown');
    expect(dayWinner(w)).toBe(2);
    // Equal code and renown: whoever joined first.
    w.players[1]!.renown = 900;
    expect(buildDigest(w, replay(w), []).winner).toBe(1);
    // Code past the cap counts as the cap: two capped days tie on code.
    w.players[1]!.ledger.lines[Cat.Code] = 50_000;
    w.players[2]!.ledger.lines[Cat.Code] = 9000;
    w.players[2]!.renown = 901;
    expect(contribution(w.players[1]!)).toBe(contribution(w.players[2]!));
    expect(buildDigest(w, replay(w), []).winner).toBe(2);
    // A lead in code is named in the headline.
    w.players[2]!.ledger.lines[Cat.Code] = 1800;
    d = buildDigest(w, replay(w), []);
    expect(d.winner).toBe(1);
    expect(d.headline).toMatch(/won it on the day's code, 6,000 lines to 1,800 lines/);
    // Capitals still come first.
    cede(w, 0, 3);
    expect(buildDigest(w, replay(w), []).winner).toBe(3);
    // The HUD ranks by the same comparison.
    const keys = w.players.map((pl) => ({ p: pl.p, capitals: pl.capitals, contribution: contribution(pl), renown: pl.renown }));
    expect(keys.sort((a, b) => compareStandings(w.victor, a, b)).map((k) => k.p)).toEqual(buildDigest(w, replay(w), []).players.slice().sort((a, b) => a.place - b.place).map((p) => p.p));
  });

  it('is the conqueror; at the reset, the most capitals, then (with equal code) renown, then first joined', () => {
    const w = ringWorld(4, 1);
    step(w, Array.from({ length: 4 }, (_, p): SimInput => ({ kind: 'join', p, slot: p, hue: p })));
    for (const pl of w.players) pl.pushes = 1;
    w.players[0]!.renown = 50;
    w.players[1]!.renown = 900;
    w.players[2]!.renown = 900;
    w.players[3]!.renown = 10;
    // Equal capitals: renown decides, and a renown tie goes to who joined first.
    let d = buildDigest(w, replay(w), []);
    expect(d.winner).toBe(1);
    expect(d.players.map((p) => p.place)).toEqual([3, 1, 2, 4]);
    expect(d.victory).toBeNull();
    // More capitals beat more renown.
    cede(w, 1, 3);
    d = buildDigest(w, replay(w), []);
    expect(d.winner).toBe(3);
    expect(d.ring).toEqual([0, 3, 2, 3, -1]);
    expect(d.awards.find((a) => a.id === 'victor')!.p).toBe(3);
    // A conqueror wins outright.
    w.victor = 0;
    w.victoryTick = 1234;
    d = buildDigest(w, replay(w), []);
    expect(d.winner).toBe(0);
    expect(d.victory).toEqual({ p: 0, tick: 1234 });
    expect(d.players[0]!.place).toBe(1);
  });
});
