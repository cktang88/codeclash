// Passage of lines (battle v17, QA3 #4; `letsPass` in battle.ts): formed foot or horse sent
// forward through a gap between two friendly blocks of loose shooters too narrow for it marches
// through, the shooters stepping aside out of its lane, instead of shuffling in the gap. Formed
// blocks still never pass through each other (crossing.test.ts).
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import { blockCrossings } from './overlap.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';

/** Two blocks of 40 archers holding at x 1000, `gap` apart; block `cls` 120 u behind the gap sent to x 1150 (or `goalX`). */
function passage(seed: number, cls: number, men: number, opts: { gap?: number; shooters?: number; goalX?: number } = {}) {
  const gap = opts.gap ?? 29;
  const k = new Array<number>(UNIT_COUNT).fill(0);
  k[opts.shooters ?? U.Archers] = 80;
  k[cls] = men;
  const e = new Array<number>(UNIT_COUNT).fill(0);
  e[U.HeavyInfantry] = 40;
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(k), plainArmy(e, 200)] });
  const [p, q] = b.regiments.filter((r) => r.team === 0 && r.cls === (opts.shooters ?? U.Archers)) as [Regiment, Regiment];
  const foot = b.regiments.find((r) => r.team === 0 && r.cls === cls)!;
  b.generals[1]!.fixedPlan = 'hold';
  placeRegiment(b, b.regiments.find((r) => r.team === 1)!, 2200, 1200, -1, 0);
  placeRegiment(b, p, 1000, 1200 - gap / 2 - p.width / 2, 1, 0);
  placeRegiment(b, q, 1000, 1200 + gap / 2 + q.width / 2, 1, 0);
  placeRegiment(b, foot, 880, 1200, 1, 0);
  const inside = b as unknown as { think(r: Regiment): void; survey(r: Regiment): void };
  const think = inside.think.bind(b);
  inside.think = (r: Regiment) => {
    if (r.team === 1) return think(r);
    inside.survey(r);
    r.dfx = 1;
    r.dfy = 0;
    if (r === foot) {
      r.mode = 'advance';
      r.tx = opts.goalX ?? 1150;
      r.ty = 1200;
    } else {
      r.mode = 'hold';
      r.tx = r.homeX;
      r.ty = r.homeY;
    }
  };
  const bows = [...p.members, ...q.members];
  let past = -1;
  let shotIn = 0;
  let worstFormed = 0;
  while (b.tick < 450) {
    b.step();
    if (past < 0 && foot.ax - foot.depth > 1005) past = b.tick;
    for (const c of blockCrossings(b, 2)) worstFormed = Math.max(worstFormed, c.share);
    // Shooters standing in the passer's own ranks.
    let n = 0;
    for (const id of bows) {
      const s = b.soldiers[id]!;
      if (s.state !== State.Fighting) continue;
      const dx = s.x - foot.ax;
      const dy = s.y - foot.ay;
      const fwd = dx * foot.fx + dy * foot.fy;
      if (Math.abs(-dx * foot.fy + dy * foot.fx) < foot.width / 2 - 2 && fwd < -2 && fwd > -foot.depth + 2) n++;
    }
    shotIn = Math.max(shotIn, n);
  }
  return { past, shotIn, worstFormed, foot, p, q, b };
}

describe('passage of lines', () => {
  it('formed foot marches through a gap between loose archers too narrow for it, the archers stepping aside', () => {
    for (const seed of [1, 2]) {
      const r = passage(seed, U.HeavyInfantry, 30);
      // (Before: it stood in the gap, held up by one block and then the other, and never got past.)
      expect(r.past).toBeGreaterThan(0);
      expect(r.past).toBeLessThan(180);
      expect(Math.hypot(r.foot.ax - 1150, r.foot.ay - 1200)).toBeLessThan(10);
      // Nobody walks through anybody: the archers stand clear of its ranks, and keep their spot.
      expect(r.shotIn).toBeLessThanOrEqual(2);
      expect(r.worstFormed).toBe(0);
      expect(Math.hypot(r.p.ax - 1000, r.p.ay - (1200 - 14.5 - r.p.width / 2))).toBeLessThan(10);
      // Once it has gone by, the archers stand closed up again.
      expect(r.p.passUntil).toBeLessThan(r.b.tick);
    }
  });

  it('knights ride through too', () => {
    const r = passage(1, U.Knights, 16);
    expect(r.past).toBeGreaterThan(0);
    expect(r.shotIn).toBeLessThanOrEqual(2);
  });

  it('a block whose goal is in the archers\' place does not stand in them', () => {
    const r = passage(1, U.HeavyInfantry, 30, { goalX: 1000 });
    // (Its goal moves beside them, as before: `clearGoal`.)
    expect(r.shotIn).toBeLessThanOrEqual(2);
    // It stops short of them: it does not march on through.
    expect(r.past).toBe(-1);
  });
});
