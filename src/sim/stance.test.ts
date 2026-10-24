import { describe, expect, it } from 'vitest';
import { Cat, Kind, PlatoonState, TICKS_PER_SECOND, type Platoon, type SimInput, type World } from './api.ts';
import { generateMap, slotAngle, slotsFor } from './mapgen.ts';
import { computeRing } from './ring.ts';
import { checksum, restore, snapshot } from './snapshot.ts';
import { STAGING_MARGIN, Wait, keepOut, platoonWait, towerReach, waitContext } from './stance.ts';
import { CAPITAL_TOWER, STATS, pacing } from './stats.ts';
import { passableAt } from './steering.ts';
import { createWorld, step } from './world.ts';

const DAY = pacing(undefined);

function duel(seed = 5): World {
  const params = { seed, slots: slotsFor(2), members: 2 };
  const w = createWorld(params, generateMap(params));
  step(w, [
    { kind: 'join', p: 0, slot: 0, hue: 0 },
    { kind: 'join', p: 1, slot: 1, hue: 200 },
  ]);
  return w;
}

const lines = (code: number) => {
  const l = new Array<number>(9).fill(0);
  l[Cat.Code] = code;
  l[Cat.Test] = Math.floor(code / 5);
  return l;
};
const push = (p: number, code: number, files = 4, branches = 20, msg = 'feat: work'): SimInput => ({ kind: 'push', p, repo: p, commits: 1, msg, files, branches, churn: 0, filler: 0, lines: lines(code) });

/** Steps until every pushed platoon has marched out of its gate. */
function muster(w: World, inputs: SimInput[]): void {
  step(w, inputs);
  for (let t = 0; t < 30 && w.platoons.some((pl) => pl.state === PlatoonState.Queued); t++) step(w, []);
  for (let t = 0; t < 5; t++) step(w, []);
}

/** Moves a platoon (banner and soldiers) so its banner stands at (x, y), facing (hx, hy). */
function place(w: World, pl: Platoon, x: number, y: number, hx = pl.hx, hy = pl.hy): void {
  const dx = x - pl.x;
  const dy = y - pl.y;
  for (const u of w.units) {
    if (u.platoon !== pl.id) continue;
    u.x += dx;
    u.y += dy;
    u.target = 0;
    // Nobody lands in rock or water.
    if (!STATS[u.kind]!.flying && !passableAt(w.map, u.x, u.y)) {
      u.x = x;
      u.y = y;
    }
  }
  pl.x = x;
  pl.y = y;
  pl.hx = hx;
  pl.hy = hy;
  pl.trail.length = 0;
  pl.route = [];
  pl.routeSite = -1;
}

const site = (w: World, k: number) => w.map.sites[k]!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mine = (w: World, p: number) => w.platoons.filter((pl) => pl.p === p && pl.state !== PlatoonState.Queued);

describe('under fire', () => {
  it('a platoon shelled by a trebuchet in the field goes after it', () => {
    const w = duel();
    // p0: a company of foot and riders; p1: a sweeping change, its Trebuchets alone in the field.
    muster(w, [push(0, 600, 4, 120), push(1, 300, 45, 10)]);
    const ours = mine(w, 0)[0]!;
    const theirs = mine(w, 1)[0]!;
    for (const u of w.units) if (u.platoon === theirs.id && u.kind !== Kind.Trebuchet) u.hp = 0.0001;
    step(w, []);
    expect(w.units.some((u) => u.platoon === theirs.id && u.kind === Kind.Trebuchet)).toBe(true);
    // Out on the road at the border fort, well clear of either tower; the engines 170 off.
    const fort = site(w, w.map.slots);
    const a = slotAngle(0, w.map.slots) + 0.5 * (slotAngle(1, w.map.slots) - slotAngle(0, w.map.slots));
    const rx = -Math.sin(a);
    const ry = Math.cos(a);
    place(w, ours, fort.x, fort.y, rx, ry);
    place(w, theirs, fort.x + rx * 170, fort.y + ry * 170, -rx, -ry);
    const trebuchets = new Set(w.units.filter((u) => u.platoon === theirs.id).map((u) => u.id));
    let shelled = false;
    let answered = false;
    let fighting = false;
    for (let t = 0; t < 60 * TICKS_PER_SECOND && !answered; t++) {
      // Keep the engines where they stand: they bombard, the platoon must come to them.
      if (t % 5 === 0) for (const u of w.units) if (u.platoon === theirs.id) theirs.site = w.map.slots;
      step(w, []);
      if (ours.hitAt >= 0 && trebuchets.has(ours.hitBy)) shelled = true;
      if (shelled && platoonWait(waitContext(w), ours).kind === Wait.Fighting && platoonWait(waitContext(w), ours).by === Kind.Trebuchet) fighting = true;
      answered = w.units.some((u) => u.platoon === ours.id && trebuchets.has(u.target)) || !w.units.some((u) => trebuchets.has(u.id));
    }
    expect(shelled).toBe(true);
    expect(fighting).toBe(true);
    expect(answered).toBe(true);
  });

  it('a platoon under a tower it may not storm yet backs out of its reach', () => {
    const w = duel();
    muster(w, [push(0, 600, 4, 120), push(1, 200)]);
    const ours = mine(w, 0)[0]!;
    const walls = w.structures.find((st) => st.p === 1)!;
    const cap = site(w, walls.site);
    expect(w.tick).toBeLessThan(DAY.opens);
    // Pushed up under p1's walls, inside the tower's reach.
    const fort = site(w, w.map.slots);
    const ux = (fort.x - cap.x) / dist(fort, cap);
    const uy = (fort.y - cap.y) / dist(fort, cap);
    place(w, ours, cap.x + ux * 140, cap.y + uy * 140, -ux, -uy);
    let struck = false;
    let pulling = false;
    for (let t = 0; t < 45 * TICKS_PER_SECOND; t++) {
      step(w, []);
      if (ours.towerAt >= 0) struck = true;
      if (platoonWait(waitContext(w), ours).kind === Wait.PullBack) pulling = true;
    }
    expect(struck).toBe(true);
    expect(pulling).toBe(true);
    const reach = towerReach(cap.radius);
    expect(dist(ours, cap)).toBeGreaterThan(reach);
    for (const u of w.units) if (u.platoon === ours.id) expect(dist(u, cap)).toBeGreaterThan(reach);
    // Out of reach, the tower has stopped striking it.
    expect(w.tick - ours.towerAt).toBeGreaterThan(10 * TICKS_PER_SECOND);
    expect(platoonWait(waitContext(w), ours).kind).not.toBe(Wait.PullBack);
  });
});

describe('staging', () => {
  it('border forts stand outside every tower’s reach, with room to spare, at every ring size', () => {
    for (let seats = 2; seats <= 15; seats++) {
      const params = { seed: 3, slots: slotsFor(seats), members: seats };
      const map = generateMap(params);
      for (const fort of map.sites.filter((s) => s.kind === 'fort')) {
        for (const cap of map.sites.filter((s) => s.kind === 'capital')) {
          // The fort's far edge (where a line holding it may stand) is clear of the keep-out ring.
          expect(dist(fort, cap) - fort.radius, `${seats} seats`).toBeGreaterThan(keepOut(cap.radius) + 20);
        }
      }
    }
  });

  it('keeps out further than the tower reaches, and a rising musters outside it', () => {
    const r = 70;
    expect(keepOut(r)).toBe(towerReach(r) + STAGING_MARGIN);
    expect(towerReach(r)).toBe(CAPITAL_TOWER.range + r / 2);
    // The rising gate lies keepOut along the ring road: its chord from the walls still clears the tower.
    for (let seats = 2; seats <= 15; seats++) {
      const map = generateMap({ seed: 3, slots: slotsFor(seats), members: seats });
      const arc = keepOut(r) / map.ring;
      const chord = 2 * map.ring * Math.sin(arc / 2);
      expect(chord).toBeGreaterThan(towerReach(r) + STAGING_MARGIN * 0.9);
    }
    // A Trebuchet outranges the walls' tower only by standing inside the keep-out ring.
    expect(STATS[Kind.Trebuchet]!.range + r * 0.75).toBeGreaterThan(towerReach(r));
    expect(STATS[Kind.Trebuchet]!.range + r * 0.75).toBeLessThan(keepOut(r));
  });

  it('the war council takes the fort, not walls that cannot be stormed yet', () => {
    const w = duel();
    muster(w, [push(0, 600, 4, 120), push(1, 200)]);
    for (let t = 0; t < 4 * TICKS_PER_SECOND; t++) step(w, []);
    for (const pl of mine(w, 0)) expect(site(w, pl.site).kind).toBe('fort');
  });
});

describe('why a platoon waits', () => {
  /** p0's platoon holding the border fort toward p1. */
  function holding(): { w: World; pl: Platoon } {
    const w = duel();
    muster(w, [push(0, 120, 2, 10), push(1, 200)]);
    const pl = mine(w, 0)[0]!;
    const ring = computeRing(w);
    const front = ring.fronts[0]!.find((f) => f.to === 1)!;
    const fort = front.forts[front.forts.length - 1]!;
    w.sites[fort]!.owner = 0;
    pl.site = fort;
    pl.front = front.dir;
    pl.state = PlatoonState.Hold;
    place(w, pl, site(w, fort).x, site(w, fort).y);
    return { w, pl };
  }

  it('waits for the sieges to open, then for barred gates, then for the fort, then masses', () => {
    const { w, pl } = holding();
    let why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.Sieges);
    expect(why.eta).toBe(DAY.opens - w.tick);
    // The sieges open; p1's first push was moments ago, so its gates stay barred a while longer.
    w.tick = DAY.opens + 10;
    w.players[1]!.firstPushAt = DAY.opens;
    why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.Barred);
    expect(why.eta).toBe(DAY.opens + DAY.grace - w.tick);
    // Gates open; the fort before the walls is lost: it must be won first.
    w.players[1]!.firstPushAt = 0;
    w.sites[pl.site]!.owner = 1;
    why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.NeedFort);
    // The fort held, but one platoon is not an army: it masses.
    w.sites[pl.site]!.owner = 0;
    why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.Massing);
    expect(why.n).toBeLessThan(why.m);
    expect(why.m).toBe(25);
  });

  it('besieges walls it was sent to storm, with a breach time; routs; pulls back', () => {
    const { w, pl } = holding();
    w.tick = DAY.full + 10;
    w.players[1]!.firstPushAt = 0;
    pl.site = 1;
    const cap = site(w, 1);
    place(w, pl, cap.x + 120, cap.y);
    let why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.Besieging);
    const walls = w.structures.find((st) => st.site === 1)!;
    expect(why.eta).toBe(Math.ceil(walls.hp / (walls.maxHp / DAY.breach)));
    expect(why.foe).toBe(1);
    // The same platoon sent elsewhere, struck by that tower a moment ago: it pulls back.
    pl.site = w.map.slots;
    pl.towerBy = -(w.structures.indexOf(walls) + 1);
    pl.towerAt = w.tick - 1;
    why = platoonWait(waitContext(w), pl);
    expect(why.kind).toBe(Wait.PullBack);
    pl.state = PlatoonState.Rout;
    expect(platoonWait(waitContext(w), pl).kind).toBe(Wait.Routing);
  });
});

describe('determinism', () => {
  it('fire, hunting and pulling back replay to the same checksum, and survive a snapshot', () => {
    const run = (cut: number) => {
      let w = duel(11);
      const inputs: SimInput[][] = [];
      for (let t = 0; t < 4 * 60 * TICKS_PER_SECOND; t++) inputs.push(t % 300 === 1 ? [push(0, 500, 20, 90), push(1, 500, 30, 60)] : []);
      for (let t = 0; t < inputs.length; t++) {
        if (t === cut) w = restore(snapshot(w));
        step(w, inputs[t]!);
      }
      return { sum: checksum(w), hit: w.platoons.some((pl) => pl.hitAt >= 0 || pl.towerAt >= 0) };
    };
    const a = run(-1);
    const b = run(-1);
    const c = run(700);
    expect(a.hit).toBe(true);
    expect(b.sum).toBe(a.sum);
    expect(c.sum).toBe(a.sum);
  });
});
