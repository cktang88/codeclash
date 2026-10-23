import { describe, expect, it } from 'vitest';
import { Kind, PlatoonState, TICKS_PER_MINUTE, type SimInput, type World } from './api.ts';
import { generateMap, slotsFor } from './mapgen.ts';
import { STATS } from './stats.ts';
import { passableAt } from './steering.ts';
import { createWorld, step } from './world.ts';

function newWorld(players: number, seed: number): World {
  const params = { seed, slots: slotsFor(players), members: players };
  return createWorld(params, generateMap(params));
}

const joins = (n: number): SimInput[] => Array.from({ length: n }, (_, p) => ({ kind: 'join', p, slot: p, hue: p * 40 }));
const push = (p: number, code: number, msg = 'Update', files = 4, branches = 10): SimInput => ({
  kind: 'push', p, repo: p, commits: 1, msg, files, branches, churn: 0, filler: 0, lines: [code, 0, 0, 0, 0, 0, 0, 0, 0],
});

describe('stragglers', () => {
  it('finds its way back to the banner around water instead of pressing against the far bank', () => {
    // On this map a band of rock and water lies between (1023, 148) and capital 4.
    const w = newWorld(8, 42);
    step(w, joins(8));
    step(w, [push(4, 200)]);
    for (let t = 0; t < 40; t++) step(w, []);
    const pl = w.platoons.find((x) => x.p === 4 && x.state !== PlatoonState.Queued)!;
    const u = w.units.find((x) => x.platoon === pl.id)!;
    expect(passableAt(w.map, 1023, 148)).toBe(true);
    u.x = 1023;
    u.y = 148;
    let closest = Infinity;
    const home = w.map.sites[4]!;
    for (let t = 0; t < 4 * TICKS_PER_MINUTE; t++) {
      // Pin the banner at its own capital, across the water from the straggler.
      pl.site = 4;
      pl.x = home.x;
      pl.y = home.y;
      step(w, []);
      const v = w.units.find((x) => x.id === u.id);
      if (!v) break;
      const banner = w.platoons.find((x) => x.id === v.platoon)!;
      closest = Math.min(closest, Math.sqrt((v.x - banner.x) ** 2 + (v.y - banner.y) ** 2));
    }
    expect(closest).toBeLessThan(80);
  });
});

describe('the Dragon cap', () => {
  it('fields at most one Dragon even when one legendary push raises two in the same platoon', () => {
    const w = newWorld(4, 1);
    step(w, joins(4));
    step(w, [push(0, 5000, 'feat: everything', 60, 1500)]);
    for (let t = 0; t < 5; t++) step(w, []);
    expect(w.players[0]!.raised[Kind.Dragon]).toBe(2);
    expect(w.units.filter((u) => u.p === 0 && u.kind === Kind.Dragon).length).toBe(1);
  });
});

describe('the muster queue', () => {
  it('never loses paid-for soldiers when a full queue folds a big push into its last platoon', () => {
    const w = newWorld(1, 2);
    step(w, joins(1));
    // Twenty-six small pushes and then a big one, all before anyone can march: the queue fills up.
    const inputs: SimInput[] = [];
    let code = 0;
    for (let k = 1; k <= 26; k++) {
      const next = (2 * k) ** 2;
      inputs.push({ ...push(0, next - code), lines: [next - code, k === 1 ? 1 : 0, 0, 0, 0, 0, 0, 0, 0] } as SimInput);
      code = next;
    }
    inputs.push({ ...push(0, 5000 - code, 'Update', 200), lines: [5000 - code, 0, 0, 0, 0, 0, 0, 0, 0] } as SimInput);
    step(w, inputs);
    const player = w.players[0]!;
    let fielded = w.units.filter((u) => u.p === 0).length;
    for (const id of player.queue) fielded += w.platoons.find((pl) => pl.id === id)!.mustered.reduce((a, b) => a + b, 0);
    expect(fielded).toBe(player.raised.reduce((a, b) => a + b, 0));
  });
});

describe('splash damage', () => {
  function duel(attacker: Kind, power: number): number {
    const w = newWorld(2, 3);
    step(w, joins(2));
    w.players[1]!.quality = power;
    const site = w.map.sites[w.map.slots]!;
    const unit = (id: number, p: number, kind: Kind, x: number) => ({
      id, p, platoon: 0, kind, x, y: site.y, hp: STATS[kind]!.hp, maxHp: STATS[kind]!.hp,
      target: 0, cooldown: 0, swingAt: -1, leavesAt: -1, fx: 0, fy: 0, run: 0, scorched: -1,
    });
    w.nextId = 100;
    w.units.push(unit(1, 0, attacker, site.x - 50), unit(2, 1, Kind.Footman, site.x + 50));
    for (let t = 0; t < 40; t++) {
      const ev = step(w, []);
      const hit = ev.hits.find((h) => h.unit === 2);
      if (hit) return hit.damage;
    }
    return 0;
  }

  it('divides by the victim army’s power once, like every other blow', () => {
    // A Wizard's fireball and an Archer's arrow both lose half their bite against an army of power 2.
    expect(duel(Kind.Wizard, 2)).toBeCloseTo(STATS[Kind.Wizard]!.damage / 2, 5);
    expect(duel(Kind.Archer, 2)).toBeCloseTo(STATS[Kind.Archer]!.damage / 2, 5);
  });
});

describe('siege leash', () => {
  it('calls soldiers off enemy walls once their banner has marched away', () => {
    const w = newWorld(4, 7);
    step(w, joins(4));
    step(w, [push(0, 100)]);
    step(w, []);
    const pl = w.platoons.find((x) => x.p === 0)!;
    const walls = w.map.sites[2]!;
    const k = w.structures.findIndex((st) => st.site === 2);
    const mine = () => w.units.filter((u) => u.platoon === pl.id);
    for (const u of mine()) {
      u.x = walls.x + (walls.x > 0 ? -90 : 90);
      u.y = walls.y;
    }
    for (let t = 0; t < 30; t++) {
      pl.site = 2;
      pl.x = walls.x + (walls.x > 0 ? -90 : 90);
      pl.y = walls.y;
      step(w, []);
    }
    expect(mine().some((u) => u.target === -(k + 1))).toBe(true);
    // The council sends the platoon home; its banner is far from these walls now.
    const home = w.map.sites[0]!;
    for (let t = 0; t < 10; t++) {
      pl.site = 0;
      pl.x = home.x;
      pl.y = home.y;
      step(w, []);
    }
    expect(mine().filter((u) => u.target === -(k + 1))).toEqual([]);
  });

  it('keeps a Trebuchet with its banner rather than shelling any wall it passes', () => {
    const w = newWorld(4, 7);
    step(w, joins(4));
    step(w, [push(0, 400, 'Update', 15, 20)]);
    step(w, []);
    const treb = w.units.find((u) => u.p === 0 && u.kind === Kind.Trebuchet)!;
    const pl = w.platoons.find((x) => x.id === treb.platoon)!;
    const walls = w.map.sites[2]!;
    const k = w.structures.findIndex((st) => st.site === 2);
    treb.x = walls.x + (walls.x > 0 ? -150 : 150);
    treb.y = walls.y;
    const home = w.map.sites[0]!;
    for (let t = 0; t < 10; t++) {
      pl.site = 0;
      pl.x = home.x;
      pl.y = home.y;
      step(w, []);
      expect(treb.target).not.toBe(-(k + 1));
    }
  });
});
