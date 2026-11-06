// No side bias between factions (QA review 2, leftover 3 / finding 11): a pairing fought with the
// sides swapped is the same battle in the mirror, and over many seeds neither side's slot wins
// more. (The review saw team 0 win about 11 points more in samurai v undead over seeds 1-300.
// A paired run on fresh seeds, 301-500 at 250 a side, gave samurai 49.0% as team 0 and 49.5% as
// team 1, and pure mirrors of each faction are fair: it was the seeds, not the sim.)
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, FIELD_W, fight, type ArmySpec, type BattleSetup } from './battle.ts';
import type { FactionId } from './factions.ts';
import { emptyCounts } from './units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, hue: number, faction: FactionId): ArmySpec => ({
  name: 'a', faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true,
});
const setup = (seed: number, men: number, a: FactionId, b: FactionId): BattleSetup => ({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(men, 0, a), army(men, 200, b)] });

describe('battle: a pairing is mirror-fair by side', () => {
  it('with the sides swapped, every block deploys, faces, and is ordered as the mirror image of its twin', () => {
    for (const [a, c] of [['samurai', 'undead'], ['samurai', 'templar'], ['undead', 'templar']] as const) {
      for (const seed of [1, 2, 3]) {
        const A = new Battle(setup(seed, 250, a, c));
        const B = new Battle(setup(seed, 250, c, a));
        // (Until the men's own draws from the shared stream part them, some 2-3 s in.)
        while (A.tick < 15) {
          A.step();
          B.step();
          for (const t of [0, 1]) {
            const ra = A.regiments.filter((r) => r.team === t);
            const rb = B.regiments.filter((r) => r.team === 1 - t);
            expect(rb.length).toBe(ra.length);
            ra.forEach((r, k) => {
              const o = rb[k]!;
              const at = `${a}-${c} seed ${seed} t${A.tick} team ${t} block ${k}`;
              expect(o.cls, at).toBe(r.cls);
              expect(Math.abs(r.ax - (FIELD_W - o.ax)) + Math.abs(r.ay - o.ay), at).toBeLessThan(1e-6);
              expect(Math.abs(r.fx + o.fx) + Math.abs(r.fy - o.fy), at).toBeLessThan(1e-6);
              expect(o.order, at).toBe(r.order);
              expect(o.ord.side, at).toBe(r.ord.side);
            });
          }
        }
      }
    }
  });

  it('samurai v undead, both ways round on every seed: team 0 wins about half', () => {
    let won0 = 0;
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const flip of [false, true]) {
        const r = fight(flip ? setup(seed, 120, 'undead', 'samurai') : setup(seed, 120, 'samurai', 'undead'));
        if (r.winner === null) continue;
        n++;
        if (r.winner === 0) won0++;
      }
    }
    // (120 battles: 48% when written. The noise is 4.6 points; the bound is 3 sigma.)
    expect(n).toBeGreaterThan(110);
    expect(won0 / n).toBeGreaterThan(0.36);
    expect(won0 / n).toBeLessThan(0.64);
  }, 120_000);
});
