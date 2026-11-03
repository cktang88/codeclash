// Small set pieces for tests and tools: a battle set up by hand. Not used by the sim.
import { Battle, BATTLE_VERSION, State, type ArmySpec, type Regiment, type Stance } from './battle.ts';
import type { FactionId } from './factions.ts';
import { UNIT_COUNT } from './units.ts';

export const only = (cls: number, n: number): number[] => {
  const k = new Array<number>(UNIT_COUNT).fill(0);
  k[cls] = n;
  return k;
};

export const plainArmy = (counts: number[], hue = 0, faction: FactionId = 'templar'): ArmySpec => ({
  name: faction, faction, hue, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 0, pavise: 0, stakes: false, commander: false,
});

/** Stands a regiment with its front rank's middle at (x, y), facing (fx, fy). */
export function placeRegiment(b: Battle, r: Regiment, x: number, y: number, fx: number, fy: number): void {
  r.fx = r.dfx = fx;
  r.fy = r.dfy = fy;
  (b as unknown as { formUp(r: Regiment, x: number, y: number): void }).formUp(r, x, y);
  r.homeX = r.ax;
  r.homeY = r.ay;
}

export interface ChargeRun {
  /** How far the deepest rider got past the foot's front rank (world units) in the charge. */
  deepest: number;
  /** How far past it the riders who hit got on average, at most, in the charge. */
  mean: number;
  /** The foot's depth (front rank to rear rank). */
  footDepth: number;
  battle: Battle;
}

/**
 * A frontal charge: one regiment of `horse` (team 0) launched at the front of one regiment of
 * `foot` (team 1) standing in `stance` 150 units away. Measured for 3 s from the first contact.
 */
export function frontalCharge(horse: number, foot: number, stance: Stance, men = 30, riders = 12, seed = 3): ChargeRun {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(horse, riders)), plainArmy(only(foot, men), 200)] });
  b.pinStance(1, foot, stance);
  b.generals[1].fixedPlan = 'hold';
  b.generals[0].rashKnights = true;
  const f = b.regiments.find((r) => r.team === 1)!;
  const h = b.regiments.filter((r) => r.team === 0);
  placeRegiment(b, f, 900, 600, -1, 0);
  h.forEach((r, i) => placeRegiment(b, r, 750, 600 + (i - (h.length - 1) / 2) * (r.width + 6), 1, 0));
  let deepest = -Infinity;
  let mean = -Infinity;
  let contact = -1;
  const footDepth = f.depth;
  const fx = f.fx;
  const fy = f.fy;
  while (!b.done() && b.tick < 400 && (contact < 0 || b.tick - contact < 30)) {
    b.step();
    let sum = 0;
    let n = 0;
    for (const s of b.soldiers) {
      if (s.team !== 0 || s.state !== State.Fighting) continue;
      const dx = s.x - f.ax;
      const dy = s.y - f.ay;
      if (Math.abs(-dx * fy + dy * fx) > f.width / 2 + 2) continue;
      const into = -(dx * fx + dy * fy);
      if (into > -8) {
        if (contact < 0) contact = b.tick;
        sum += into;
        n++;
      }
      deepest = Math.max(deepest, into);
    }
    if (n > 0) mean = Math.max(mean, sum / n);
  }
  return { deepest, mean, footDepth, battle: b };
}
