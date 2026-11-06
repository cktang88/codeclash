// Small set pieces for tests and tools: a battle set up by hand. Not used by the sim.
import { Battle, BATTLE_VERSION, State, type ArmySpec, type Regiment, type Stance } from './battle.ts';
import type { FactionId } from './factions.ts';
import { UNIT_COUNT } from './units.ts';
import type { TerrainSpec } from './terrain.ts';

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
  /** How far the deepest rider got past the foot's front rank (world units) in the charge, through its front (not round its end). */
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
  // Riders who rode round the end of the foot (out past its flank, level with it) and came at
  // it from the side or behind: they did not get into it through its front, and are not counted.
  const round = new Uint8Array(b.soldiers.length);
  while (!b.done() && b.tick < 400 && (contact < 0 || b.tick - contact < 30)) {
    b.step();
    let sum = 0;
    let n = 0;
    // (The charge and the melee it ends in; not the ride out, when the last riders to turn
    // away are a handful of stragglers, nor whatever comes after.)
    if (contact >= 0 && h.every((r) => r.mode !== 'charge' && r.mode !== 'melee')) break;
    for (const s of b.soldiers) {
      if (s.team !== 0 || s.state !== State.Fighting) continue;
      const dx = s.x - f.ax;
      const dy = s.y - f.ay;
      const into = -(dx * fx + dy * fy);
      if (Math.abs(-dx * fy + dy * fx) > f.width / 2 + 2) {
        if (into > -8) round[s.id] = 1;
        continue;
      }
      if (round[s.id]) continue;
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

/**
 * Ground for a set piece about (cx, cy), side A standing to the west (fronts `gap` apart, A
 * facing east), as `scripts/duel.ts --ground=` lays it:
 * - 'hillA' / 'hillB': a hill (45 high, 340 across) under that side's block: the other comes up at it.
 * - 'woodA' / 'woodB': a wood about that side's block; 'woodMid': a wood between them.
 * - 'stream': a stream between them with no ford; 'ford': the same with a ford before them.
 */
export function groundPreset(name: string, cx: number, cy: number, gap: number): TerrainSpec | 'flat' {
  const ax = cx - gap / 2;
  const bx = cx + gap / 2;
  const hill = (x: number) => ({ hills: [{ x, y: cy, r: 340, k: 1.6, h: 45, ax: 0, ay: 1 }] });
  const wood = (x: number) => ({ woods: [{ blobs: [{ x, y: cy, r: 90 }, { x, y: cy - 80, r: 80 }, { x, y: cy + 80, r: 80 }, { x: x + 40, y: cy, r: 70 }] }] });
  const stream = (ford: boolean) => ({ stream: { pts: [cx, 0, cx, 4000], width: 28, bank: 10, fords: ford ? [{ x: cx, y: cy, r: 70 }] : [] } });
  switch (name) {
    case 'hillA': return hill(ax - 40);
    case 'hillB': return hill(bx + 40);
    case 'woodA': return wood(ax - 50);
    case 'woodB': return wood(bx + 50);
    case 'woodMid': return wood(cx);
    case 'stream': return stream(false);
    case 'ford': return stream(true);
    default: return 'flat';
  }
}
