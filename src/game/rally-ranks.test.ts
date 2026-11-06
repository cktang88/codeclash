// A rallied block is the men who stopped and re-formed; men falling in are not in its ranks until
// they reach their places; the anchor closes on its men at no more than their pace; routers run
// round an enemy in their way (battle.ts `survey`, `fallIn`, `dodge`, `fleeFrom`; QA findings
// #1, #12, #16 in docs/qa/battle-realism-review.md).
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, FIELD_W, REGROUP, State, TICK_S, type Regiment } from './battle.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: Record<number, number>): number[] => {
  const c = new Array<number>(UNIT_COUNT).fill(0);
  for (const [k, v] of Object.entries(pairs)) c[Number(k)] = v;
  return c;
};
type Inner = {
  rout(r: Regiment): void;
  fallIn(i: number, from: Regiment, o: Regiment): void;
  d: { x: Float64Array; y: Float64Array; jn: Uint8Array; state: Uint8Array; hx: Float64Array; hy: Float64Array };
};
const inner = (b: Battle) => b as unknown as Inner;

function battle(seed: number, ours: Record<number, number>, theirs: Record<number, number>): Battle {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts(ours), 0, 'templar'), plainArmy(counts(theirs), 200, 'templar')] });
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  return b;
}

/** The nearest of `r`'s men standing in its ranks (Fighting) to (x, y). */
function nearestFormed(b: Battle, r: Regiment, x: number, y: number): number {
  const d = inner(b).d;
  let best = Infinity;
  for (const id of r.members) if (d.state[id] === State.Fighting) best = Math.min(best, Math.hypot(d.x[id]! - x, d.y[id]! - y));
  return best;
}

describe('rally: the block is the men who stopped', () => {
  it('runners who ran on are not in its ranks: its count, standard and reach keep to the men who stand, and it does not march back for them', () => {
    let rallied = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const b = battle(seed, { [U.HeavyInfantry]: 60 }, { [U.HeavyInfantry]: 30 });
      const [a, reserve] = b.regiments.filter((r) => r.team === 0) as [Regiment, Regiment];
      const foe = b.regiments.find((r) => r.team === 1)!;
      placeRegiment(b, a, 1000, 450, 1, 0);
      placeRegiment(b, reserve, 900, 750, 1, 0);
      placeRegiment(b, foe, 1600, 600, -1, 0);
      b.step();
      inner(b).rout(a);
      // Eight of them run on far ahead of the rest, home-ward (toward x = 0).
      const d = inner(b).d;
      const runners = a.members.slice(0, 8);
      for (const id of runners) {
        d.x[id] = 500 + (id % 4) * 6;
        d.hx[id] = -1;
        d.hy[id] = 0;
      }
      for (let t = 0; t < 500 && a.routed && !b.done(); t++) b.step();
      if (a.routed) continue;
      const left = runners.filter((id) => d.state[id] === State.Routing);
      if (left.length === 0) continue;
      rallied++;
      const ax0 = a.ax;
      for (let t = 0; t < 120 && !b.done(); t++) {
        b.step();
        if (t % 5 !== 4 || a.routed) continue;
        const formed = a.members.filter((id) => d.state[id] === State.Fighting).length;
        expect(a.alive).toBe(formed);
        // The standard (drawn at the centre) is over its men, its reach is its formation's.
        expect(nearestFormed(b, a, a.cx, a.cy)).toBeLessThan(30);
        // (Those who stopped within REGROUP.gather walk in to their places first.)
        expect(a.radius).toBeLessThan(t < 80 ? REGROUP.gather + 10 : Math.hypot(a.width, a.depth) + 60);
        // Its centre is among the men who stand, not out toward the runners.
        for (const id of left) if (d.state[id] === State.Routing) expect(Math.abs(d.x[id]! - a.cx)).toBeGreaterThan(150);
      }
      // It did not march off toward its own edge after them.
      expect(ax0 - a.ax).toBeLessThan(40);
    }
    expect(rallied).toBeGreaterThan(0);
  }, 120_000);
});

describe('fall in: a man who joins walks to his place before he counts in the ranks', () => {
  it('the anchor and the standard stay with the block while he comes up, and he takes his place', () => {
    for (const seed of [1, 2, 3]) {
      const b = battle(seed, { [U.HeavyInfantry]: 30, [U.Spearmen]: 30 }, { [U.HeavyInfantry]: 30 });
      const ours = b.regiments.filter((r) => r.team === 0);
      const block = ours.find((r) => r.cls === U.HeavyInfantry)!;
      const other = ours.find((r) => r.cls === U.Spearmen)!;
      const foe = b.regiments.find((r) => r.team === 1)!;
      placeRegiment(b, block, 1000, 600, 1, 0);
      placeRegiment(b, other, 600, 300, 1, 0);
      placeRegiment(b, foe, 1700, 600, -1, 0);
      for (let k = 0; k < 6; k++) b.kill(block.members[k]!);
      for (let t = 0; t < 30; t++) b.step();
      const d = inner(b).d;
      // Three of the other block's men, 250 u behind this one, fall in with it.
      inner(b).rout(other);
      const men = other.members.slice(0, 3);
      for (const id of men) {
        d.x[id] = 750;
        d.y[id] = 600 + (id % 3) * 8;
        inner(b).fallIn(id, other, block);
        expect(d.jn[id]).toBe(1);
      }
      const ax = block.ax;
      const ay = block.ay;
      for (let t = 0; t < 40; t++) b.step();
      // (The block stands where it stood: its anchor did not go to meet them.)
      expect(Math.hypot(block.ax - ax, block.ay - ay)).toBeLessThan(6);
      expect(nearestFormed(b, block, block.cx, block.cy)).toBeLessThan(30);
      expect(block.radius).toBeLessThan(80);
      expect(block.alive).toBe(block.members.filter((id) => d.state[id] === State.Fighting).length);
      for (let t = 0; t < 400 && men.some((id) => d.jn[id]); t++) b.step();
      for (const id of men) {
        if (d.state[id] !== State.Fighting) continue;
        expect(d.jn[id]).toBe(0);
        expect(Math.abs(d.x[id]! - block.cx)).toBeLessThan(60);
      }
    }
  }, 120_000);
});

describe('anchor: it follows its men no faster than they can run', () => {
  it('a holding block whose men are shoved off their places does not jump after them', () => {
    for (const seed of [1, 2, 3]) {
      const b = battle(seed, { [U.HeavyInfantry]: 60 }, { [U.HeavyInfantry]: 30 });
      const r = b.regiments.find((o) => o.team === 0)!;
      const foe = b.regiments.find((o) => o.team === 1)!;
      placeRegiment(b, r, 1000, 600, 1, 0);
      placeRegiment(b, foe, 1800, 600, -1, 0);
      for (let t = 0; t < 20; t++) b.step();
      // Two thirds of the men shoved 60 u forward at once: their mean place leaps ahead.
      const d = inner(b).d;
      for (const id of r.members.slice(0, 40)) d.x[id]! += 60;
      const ax0 = r.ax;
      let px = r.ax;
      let py = r.ay;
      let worst = 0;
      for (let t = 1; t <= 60; t++) {
        b.step();
        if (t % 5 !== 0) continue;
        worst = Math.max(worst, Math.hypot(r.ax - px, r.ay - py) / (5 * TICK_S));
        px = r.ax;
        py = r.ay;
      }
      // It closes on them no faster than they run (until v17 it leapt 50 u in a tick).
      expect(worst).toBeLessThanOrEqual(r.speed * 1.05);
      expect(r.ax - ax0).toBeGreaterThan(10);
    }
  }, 60_000);
});

describe('rout: routers run round an enemy between them and home', () => {
  it('a block broken with an enemy block across its line home goes round it, not into it nor off the far edge', () => {
    for (const seed of [1, 2, 3]) {
      const b = battle(seed, { [U.HeavyInfantry]: 40 }, { [U.HeavyInfantry]: 40 });
      const r = b.regiments.find((o) => o.team === 0)!;
      const foe = b.regiments.find((o) => o.team === 1)!;
      // Team 0's home is x = 0; the enemy stands at x 600, the broken block at x 760, behind it.
      placeRegiment(b, foe, 600, 1200, 1, 0);
      placeRegiment(b, r, 760, 1200, -1, 0);
      b.step();
      inner(b).rout(r);
      const d = inner(b).d;
      let samples = 0;
      let into = 0;
      for (let t = 0; t < 300 && !b.done(); t++) {
        b.step();
        for (const id of r.members) {
          if (d.state[id] !== State.Routing) continue;
          samples++;
          let ne = -1;
          let nd = 100;
          b.near(d.x[id]!, d.y[id]!, 10, (s, d2) => {
            if (s.team === 1 && s.state === State.Fighting && d2 < nd) {
              nd = d2;
              ne = s.id;
            }
          });
          if (ne >= 0 && (d.x[ne]! - d.x[id]!) * d.hx[id]! + (d.y[ne]! - d.y[id]!) * d.hy[id]! > 0.5 * Math.sqrt(nd)) into++;
          // Never headed for the enemy's side of the field.
          expect(d.hx[id]!).toBeLessThan(0.3);
        }
      }
      expect(samples).toBeGreaterThan(0);
      expect(into / samples).toBeLessThan(0.01);
      for (const id of r.members) if (d.state[id] === State.Fled) expect(d.x[id]!).toBeLessThan(FIELD_W / 2);
    }
  }, 60_000);
});
