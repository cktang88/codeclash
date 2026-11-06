// QA round 3 (docs/qa/battle-realism-review-3.md): single men doing what no real man would, in
// small set pieces. Each test stages a few blocks by hand and measures the men one by one.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State } from './battle.ts';
import { U, UNIT_COUNT } from './units.ts';
import type { FactionId } from './factions.ts';
import { placeRegiment, plainArmy } from './testing.ts';

type Side = [cls: number, men: number][];
const counts = (side: Side): number[] => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  for (const [c, n] of side) k[c]! += n;
  return k;
};

/** Two sides' blocks of a class side by side, fronts `gap` apart, facing each other across x = 1200. */
function faceOff(a: Side, fa: FactionId, bSide: Side, fb: FactionId, seed: number, gap = 80): Battle {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts(a), 0, fa), plainArmy(counts(bSide), 200, fb)] });
  for (const team of [0, 1] as const) {
    const regs = b.regiments.filter((r) => r.team === team);
    let y = 1200 - regs.reduce((s, r) => s + r.width + 8, -8) / 2;
    for (const r of regs) {
      placeRegiment(b, r, team === 0 ? 1200 - gap / 2 : 1200 + gap / 2, y + r.width / 2, team === 0 ? 1 : -1, 0);
      y += r.width + 8;
    }
  }
  return b;
}

interface D { x: Float64Array; y: Float64Array; rad: Float64Array; rc: Float64Array; target: Int32Array; state: Uint8Array; row: Int32Array; wd: Int32Array }

/**
 * Share of man-ticks (men still fighting) in which a man has no foe of his own while an enemy who
 * has him as his foe stands within that enemy's reach of him: struck at, and not answering.
 */
function struckIdle(b: Battle, ticks: number): number {
  const d = (b as unknown as { d: D }).d;
  const n = b.soldiers.length;
  let men = 0;
  let idle = 0;
  while (!b.done() && b.tick < ticks) {
    b.step();
    if (b.tick % 2) continue;
    for (let j = 0; j < n; j++) {
      if (d.state[j] === State.Fighting) men++;
      const i = d.target[j]!;
      if (i < 0 || d.state[j] !== State.Fighting || d.state[i] !== State.Fighting || d.target[i]! >= 0 || b.tick < d.wd[i]!) continue;
      if (Math.hypot(d.x[j]! - d.x[i]!, d.y[j]! - d.y[i]!) <= d.rad[i]! + d.rad[j]! + d.rc[j]! + 2) idle++;
    }
  }
  return idle / Math.max(1, men);
}

describe('QA3: each man fights like a man', () => {
  it('spear on spear: the front ranks fence; the ranks behind them are not speared where they cannot answer (#1)', () => {
    // Until QA3 a man of a spear's front rank (and the pikes striking past it) took as his foe the
    // man behind the enemy's front rank as readily as the man before him: in this set piece 3.9 %
    // of the men's time was spent stabbed at by a foe they could not reach, nearly all of it in
    // the second and third ranks.
    let sum = 0;
    for (const seed of [1, 2, 3]) sum += struckIdle(faceOff([[U.Spearmen, 48]], 'templar', [[U.Spearmen, 48]], 'samurai', seed), 600);
    expect(sum / 3).toBeLessThan(0.02);
  });

  it('spears go in at horse locked in a fight with the foot beside them, not stand braced against it (#2)', () => {
    // 30 Templar spears 30 u beside 30 heavy foot, 16 knights charging the heavy foot. Until QA3
    // the spears stood braced while the knights hacked at their friends 30 u off: 4.9 s on each of
    // these seeds (in the demo battles, a third of all the time spears stood braced, up to 14 s).
    for (const seed of [2, 3, 4]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[U.HeavyInfantry, 30], [U.Spearmen, 30]])), plainArmy(counts([[U.Knights, 16]]), 200, 'samurai')] });
      b.generals[0]!.fixedPlan = 'hold';
      b.generals[1]!.rashKnights = true;
      const H = b.regiments.find((r) => r.team === 0 && r.cls === U.HeavyInfantry)!;
      const S = b.regiments.find((r) => r.team === 0 && r.cls === U.Spearmen)!;
      const K = b.regiments.filter((r) => r.team === 1);
      placeRegiment(b, H, 1200, 1200, 1, 0);
      placeRegiment(b, S, 1200, 1200 + H.width / 2 + S.width / 2 + 30, 1, 0);
      K.forEach((r, k) => placeRegiment(b, r, 1300, 1190 + k * 20, -1, 0));
      let braced = 0;
      while (b.tick < 400 && !b.done()) {
        b.step();
        // (Braced against a block of the knights riding at the spears themselves is right: since
        // v17 HORSE, on seed 2 one of the two blocks charges them while the other fights the
        // heavy foot. Counted only while none does.)
        const coming = K.some((r) => !r.routed && r.alive > 0 && r.targetReg === S.id && (r.mode === 'charge' || r.mode === 'flank'));
        if (H.engaged && S.mode === 'brace' && !coming && K.some((r) => r.mode === 'melee' && r.targetReg === H.id)) braced++;
      }
      expect(braced, `seed ${seed}`).toBeLessThan(15);
    }
  });

  it('skirmishers with no line of their own give ground before slower foot, throwing, not stand to be caught (#3)', () => {
    // 30 samurai skirmishers, nothing else, 140 u from 48 undead spears. Until QA3 they stood and
    // threw until the spears were on them: 48 of 120 over these days cut down with javelins still
    // in hand (357 thrown, 18 spears felled); now they back off, halt, throw and back off again.
    let caught = 0;
    let thrown = 0;
    for (const seed of [1, 2, 3, 4]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts([[U.Skirmishers, 30]]), 0, 'samurai'), plainArmy(counts([[U.Spearmen, 48]]), 200, 'undead')] });
      const A = b.regiments.filter((r) => r.team === 0);
      const B = b.regiments.filter((r) => r.team === 1);
      A.forEach((r, k) => placeRegiment(b, r, 1130, 1180 + k * 40, 1, 0));
      B.forEach((r, k) => placeRegiment(b, r, 1270, 1170 + k * 60, -1, 0));
      const men = A.flatMap((r) => r.members);
      const ammo = new Map<number, number>();
      while (b.tick < 600 && !b.done()) {
        for (const i of men) if (b.soldiers[i]!.state !== State.Dead) ammo.set(i, b.soldiers[i]!.ammo);
        b.step();
        for (const i of men) {
          if (b.soldiers[i]!.state !== State.Dead || !ammo.has(i)) continue;
          if (ammo.get(i)! > 0) caught++;
          ammo.delete(i);
        }
      }
      for (const i of men) thrown += 4 - b.soldiers[i]!.ammo;
    }
    expect(caught).toBeLessThan(8);
    expect(thrown).toBeGreaterThan(420);
  });
});
