// Battle v17: weapon reach (docs/art-references/weapon-reach.md; REACH in battle.ts). Spears
// fence at their points; shorter arms are held there and get in only where the wall is broken.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, REACH, State, type Regiment } from './battle.ts';
import { factionStats, type FactionId } from './factions.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U } from './units.ts';

interface Inside {
  d: { x: Float64Array; y: Float64Array; rad: Float64Array; rc: Float64Array; row: Int32Array; target: Int32Array; state: Uint8Array; acted: Int32Array; ps: Int32Array };
  held(i: number, t: number): boolean;
  gapBeside(t: number): boolean;
  kill(id: number): void;
}
const inside = (b: Battle) => b as unknown as Inside;

/** Block `a` (team 0, advancing) 160 before block `b` (team 1, holding or advancing). */
function piece(a: [FactionId, number], b: [FactionId, number], hold: boolean, seed = 3, men = 48) {
  const bt = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(a[1], men), 0, a[0]), plainArmy(only(b[1], men), 200, b[0])] });
  bt.generals[0].fixedPlan = 'advance';
  bt.generals[1].fixedPlan = hold ? 'hold' : 'advance';
  const ra = bt.regiments.find((r) => r.team === 0)!;
  const rb = bt.regiments.find((r) => r.team === 1)!;
  placeRegiment(bt, ra, 1120, 1200, 1, 0);
  placeRegiment(bt, rb, 1280, 1200, -1, 0);
  return { bt, ra, rb };
}

interface Sample {
  /** Centre-to-centre distances from front-rank men to their foes. */
  gap: number[];
  /** Men of team 0 fighting a spearman, and those of them inside his point. */
  vs: number;
  in: number;
  /** Blows struck by each side. */
  blows: [number, number];
  /** Blows struck by men of the ranks behind the front. */
  rear: number;
}

/** Runs to the first blow, then samples `ticks` of the melee. */
function sample(bt: Battle, ticks: number, from = 0): Sample {
  const d = inside(bt).d;
  const out: Sample = { gap: [], vs: 0, in: 0, blows: [0, 0], rear: 0 };
  let first = -1;
  while (!bt.done() && bt.tick < 1500 && (first < 0 || bt.tick - first < from + ticks)) {
    bt.step();
    const t = bt.tick - 1;
    if (first < 0 && bt.soldiers.some((s) => s.state === State.Fighting && d.acted[s.id] === t && s.target >= 0)) first = bt.tick;
    if (first < 0 || bt.tick - first < from) continue;
    for (const s of bt.soldiers) {
      if (s.state !== State.Fighting || s.target < 0) continue;
      const f = s.target;
      const q = Math.hypot(d.x[f]! - s.x, d.y[f]! - s.y);
      if (d.acted[s.id] === t) {
        out.blows[s.team as 0 | 1]++;
        if (s.row > 0) out.rear++;
      }
      if (bt.tick % 5) continue;
      if (s.row === 0) out.gap.push(q);
      // (Front-rank men in their places: not men swinging round a flank, nor the ranks behind.)
      if (s.team === 0 && d.rc[f]! >= REACH.long && s.row === 0 && !s.curling) {
        out.vs++;
        if (q < d.rad[s.id]! + d.rad[f]! + d.rc[f]! * 0.5) out.in++;
      }
    }
  }
  return out;
}
const median = (a: number[]) => a.slice().sort((p, q) => p - q)[a.length >> 1]!;

describe('weapon reach: the table', () => {
  it('spears reach far beyond swords; the yari furthest, the ghoul spear least', () => {
    const r = (f: FactionId, c: number) => factionStats(f)[c]!.reach;
    expect(r('templar', U.HeavyInfantry)).toBe(1.6);
    expect(r('templar', U.Spearmen)).toBeGreaterThanOrEqual(REACH.long);
    expect(r('samurai', U.Spearmen)).toBeGreaterThan(r('templar', U.Spearmen));
    expect(r('undead', U.Spearmen)).toBeLessThan(r('templar', U.Spearmen));
    expect(r('samurai', U.Spearmen)).toBeGreaterThanOrEqual(REACH.support);
    expect(r('templar', U.Spearmen)).toBeLessThan(REACH.support);
  });
});

describe('weapon reach: push of pike', () => {
  it('two spear walls stall at their points and fence there', () => {
    for (const [f, reach] of [['templar', 15], ['samurai', 19.5]] as const) {
      const { bt } = piece([f, U.Spearmen], [f, U.Spearmen], false);
      const s = sample(bt, 60, 10);
      // They stand about the two bodies and three quarters of the spear apart (15.85, 19.2),
      // not body to body (4.6, as until v17).
      const g = median(s.gap);
      expect(g, f).toBeGreaterThan(4.6 + reach * 0.6);
      expect(g, f).toBeLessThan(4.6 + reach + 1);
      // (Until v17 nine in ten stood inside the other's point; the press now and then still
      // jostles a few in.)
      expect(s.in / s.vs, f).toBeLessThan(0.35);
    }
  });

  it("the yari's second rank strikes past the first; the Templar spear's does not", () => {
    const yari = sample(piece(['samurai', U.Spearmen], ['samurai', U.Spearmen], false).bt, 60, 5);
    const spear = sample(piece(['templar', U.Spearmen], ['templar', U.Spearmen], false).bt, 60, 5);
    // (A Templar of the second rank strikes only a foe come round to him, or one in a hole of
    // his front rank before he steps up into it.)
    expect(yari.rear).toBeGreaterThan(yari.blows[0] * 0.15);
    expect(yari.rear / yari.blows[0]).toBeGreaterThan((2 * spear.rear) / spear.blows[0]);
  });

});

describe('weapon reach: swords against spears', () => {
  it('sergeants coming at the front of formed spears are held at the points, and hardly strike', () => {
    const { bt } = piece(['templar', U.HeavyInfantry], ['templar', U.Spearmen], true);
    const s = sample(bt, 30);
    // In the first 3 s at the points few are in among the spears, and the spears do the striking.
    expect(s.in / s.vs).toBeLessThan(0.3);
    expect(s.blows[0]).toBeLessThan(s.blows[1] * 0.5);
    expect(median(s.gap)).toBeGreaterThan(10);
  });

  it('a man is held by a point before its front, not at its flank or rear, nor by spears re-forming', () => {
    const { bt, ra, rb } = piece(['templar', U.HeavyInfantry], ['templar', U.Spearmen], true);
    bt.step();
    const B = inside(bt);
    const sword = ra.members[0]!;
    const spear = rb.members.find((id) => B.d.row[id] === 0)!;
    const put = (x: number, y: number) => {
      B.d.x[sword] = x;
      B.d.y[sword] = y;
    };
    const sx = B.d.x[spear]!;
    const sy = B.d.y[spear]!;
    // (rb faces -x.)
    put(sx - 15, sy);
    expect(B.held(sword, spear)).toBe(true);
    put(sx, sy - 15);
    expect(B.held(sword, spear)).toBe(false);
    put(sx + 15, sy);
    expect(B.held(sword, spear)).toBe(false);
    put(sx - 15, sy);
    rb.formedAt = bt.tick + 50;
    expect(B.held(sword, spear)).toBe(false);
    rb.formedAt = -1000;
    // A spear does not hold a spear: they fence.
    const other = rb.members.find((id) => id !== spear)!;
    expect(B.held(other, spear)).toBe(false);
  });

  it('a gap in the wall: a spearman with the man beside him down', () => {
    const { bt, rb } = piece(['templar', U.HeavyInfantry], ['templar', U.Spearmen], true);
    bt.step();
    const B = inside(bt);
    const front = rb.members.filter((id) => B.d.row[id] === 0).sort((p, q) => B.d.y[p]! - B.d.y[q]!);
    const mid = front[front.length >> 1]!;
    expect(B.gapBeside(mid)).toBe(false);
    B.kill(front[(front.length >> 1) + 1]!);
    expect(B.gapBeside(mid)).toBe(true);
  });

  it('spears still re-forming (no wall yet) let the sergeants in among them', () => {
    const { bt, rb } = piece(['templar', U.HeavyInfantry], ['templar', U.Spearmen], true);
    rb.formedAt = 400;
    const s = sample(bt, 30);
    const held = sample(piece(['templar', U.HeavyInfantry], ['templar', U.Spearmen], true).bt, 30);
    expect(s.in / s.vs).toBeGreaterThan(held.in / held.vs + 0.2);
  });

  it('sergeants coming at the flank of spears locked to their front go straight in', () => {
    const bt = new Battle({ version: BATTLE_VERSION, seed: 3, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 80), 0, 'templar'), plainArmy(only(U.Spearmen, 48), 200, 'templar')] });
    bt.generals[0].fixedPlan = 'advance';
    bt.generals[1].fixedPlan = 'hold';
    const rs = bt.regiments.filter((r) => r.team === 0);
    const rb: Regiment = bt.regiments.find((r) => r.team === 1)!;
    expect(rs.length).toBeGreaterThanOrEqual(2);
    placeRegiment(bt, rb, 1280, 1200, -1, 0);
    // (The front block close, so that the spears are locked to their front before the flank block comes.)
    placeRegiment(bt, rs[0]!, 1250, 1200, 1, 0);
    rs.slice(2).forEach((r, k) => placeRegiment(bt, r, 900 - 60 * k, 1200, 1, 0));
    placeRegiment(bt, rs[1]!, 1290, 1200 - rb.width * 0.5 - 50, 0, 1);
    const B = inside(bt);
    const flank = new Set(rs[1]!.members);
    let near = 0;
    let all = 0;
    let frontNear = 0;
    let frontAll = 0;
    const front = new Set(rs[0]!.members);
    for (let k = 0; k < 400 && !bt.done(); k++) {
      bt.step();
      // (From the clash until the spears break: the chase after is another matter.)
      if (k < 20 || k % 5 || rb.routed) continue;
      for (const id of [...flank, ...front]) {
        const t = B.d.target[id]!;
        if (B.d.state[id] !== State.Fighting || t < 0 || B.d.rc[t]! < REACH.long) continue;
        const inPoint = Math.hypot(B.d.x[t]! - B.d.x[id]!, B.d.y[t]! - B.d.y[id]!) < B.d.rad[id]! + B.d.rad[t]! + B.d.rc[t]! * 0.5;
        if (flank.has(id)) {
          all++;
          if (inPoint) near++;
        } else {
          frontAll++;
          if (inPoint) frontNear++;
        }
      }
    }
    // Most of the block on the flank is in among the spears; of the block before their front, far fewer.
    expect(all).toBeGreaterThan(20);
    expect(near / all).toBeGreaterThan(0.7);
    expect(near / all).toBeGreaterThan(frontNear / Math.max(1, frontAll) + 0.15);
  });
});
