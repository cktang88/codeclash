// Fugitives falling in with a formed regiment of their own kind, and broken regiments re-forming
// out of contact (battle.ts `regroup`, `thinkRouted`; REGROUP in command.ts).
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import type { FactionId } from './factions.ts';
import { U, UNIT_COUNT } from './units.ts';

const counts = (pairs: Record<number, number>): number[] => {
  const c = new Array<number>(UNIT_COUNT).fill(0);
  for (const [k, v] of Object.entries(pairs)) c[Number(k)] = v;
  return c;
};
const rout = (b: Battle, r: Regiment) => (b as unknown as { rout(r: Regiment): void }).rout(r);

/** Every man on exactly one roll, his regiment's; each regiment's count of the living matches its roll. */
function consistent(b: Battle): void {
  const seen = new Uint8Array(b.soldiers.length);
  for (const r of b.regiments) {
    for (const id of r.members) {
      expect(seen[id]).toBe(0);
      seen[id] = 1;
      expect(b.soldiers[id]!.reg).toBe(r.id);
    }
  }
  expect(seen.every((v) => v === 1)).toBe(true);
}
const living = (b: Battle, r: Regiment) => r.members.filter((id) => b.soldiers[id]!.state <= State.Routing).length;

interface Scene {
  b: Battle;
  /** The regiment that breaks, and the formed one behind it. */
  broken: Regiment;
  steady: Regiment;
}

/**
 * Team 0: a regiment of `runner` that breaks at x 330, and a formed regiment of `taker` that has
 * lost a few men standing behind it (front at x 300, facing the enemy), in their path. Team 1:
 * a regiment of heavy foot, far off at x 1450, unless `engage`, when it stands against the
 * formed regiment's front.
 */
function scene(seed: number, runner: number, taker: number, faction: FactionId = 'templar', engage = false): Scene {
  const pairs: Record<number, number> = runner === taker ? { [runner]: 60 } : { [runner]: 30, [taker]: 30 };
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts(pairs), 0, faction), plainArmy(counts({ [U.HeavyInfantry]: 30 }), 200, faction)] });
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  const ours = b.regiments.filter((r) => r.team === 0);
  const broken = ours.find((r) => r.cls === runner)!;
  const steady = ours.find((r) => r.cls === taker && r !== broken)!;
  const foe = b.regiments.find((r) => r.team === 1)!;
  placeRegiment(b, steady, 300, 600, 1, 0);
  // Engaged, the broken regiment stands behind the formed one (the enemy is at its front).
  placeRegiment(b, broken, engage ? 300 - steady.depth - 12 : 330 + broken.depth, 600, 1, 0);
  placeRegiment(b, foe, 1450, 600, -1, 0);
  // Room in its ranks: a few men down some time ago (losses just taken would break it).
  for (let k = 0; k < 6; k++) b.kill(steady.members[k]!);
  for (let t = 0; t < 100; t++) b.step();
  if (engage) placeRegiment(b, foe, 306, steady.ay, -1, 0);
  b.step();
  rout(b, broken);
  return { b, broken, steady };
}

/** Runs `ticks` (or to the end) checking the rolls; returns how many of `from`'s men ended on `to`'s roll. */
function joined(s: Scene, ticks: number, check?: () => void): number {
  const { b, broken, steady } = s;
  const theirs = new Set(broken.members);
  for (let t = 0; t < ticks && !b.done(); t++) {
    b.step();
    check?.();
    if (t % 10 === 0) consistent(b);
  }
  consistent(b);
  return steady.members.filter((id) => theirs.has(id)).length;
}

describe('regroup: fugitives fall in with a formed regiment of their kind', () => {
  it('foot fugitives passing a steady regiment of their class join it, take a place in its ranks and keep their own stats', () => {
    let total = 0;
    for (const seed of [1, 2, 3]) {
      const s = scene(seed, U.HeavyInfantry, U.HeavyInfantry);
      const n = joined(s, 150);
      total += n;
      const { b, steady } = s;
      for (const id of steady.members) {
        const m = b.soldiers[id]!;
        if (m.state !== State.Fighting) continue;
        expect(m.cls).toBe(U.HeavyInfantry);
        // In formation: a slot behind the front rank, not running.
        expect(m.sy).toBeLessThanOrEqual(0);
      }
      expect(steady.alive).toBe(living(b, steady));
      expect(steady.alive).toBeLessThanOrEqual(steady.start);
      if (n > 0) {
        expect(steady.absorbed).toBeGreaterThanOrEqual(n);
        expect(b.events.some((e) => e.kind === 'joins' && e.reg === steady.id && e.from === s.broken.id)).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(0);
  }, 60_000);

  it('Templars join any regiment of their family (the Beauséant rule); others only their own class', () => {
    let templar = 0;
    let samurai = 0;
    for (const seed of [1, 2, 3]) {
      templar += joined(scene(seed, U.Spearmen, U.HeavyInfantry, 'templar'), 150);
      samurai += joined(scene(seed, U.Spearmen, U.HeavyInfantry, 'samurai'), 150);
    }
    expect(templar).toBeGreaterThan(0);
    expect(samurai).toBe(0);
  }, 60_000);

  it('foot never join horse', () => {
    for (const seed of [1, 2, 3]) expect(joined(scene(seed, U.HeavyInfantry, U.Knights), 150)).toBe(0);
  }, 60_000);

  it('nobody joins a regiment that is routing', () => {
    for (const seed of [1, 2, 3]) {
      const s = scene(seed, U.HeavyInfantry, U.HeavyInfantry);
      rout(s.b, s.steady);
      expect(joined(s, 150)).toBe(0);
    }
  }, 60_000);

  it('nobody joins a regiment locked in melee', () => {
    for (const seed of [1, 2, 3]) {
      const s = scene(seed, U.HeavyInfantry, U.HeavyInfantry, 'templar', true);
      const theirs = new Set(s.broken.members);
      // Whenever one of them is on its roll, it was not engaged when he joined.
      let before = 0;
      let engagedTicks = 0;
      joined(s, 150, () => {
        const now = s.steady.members.filter((id) => theirs.has(id)).length;
        if (s.steady.engaged) {
          engagedTicks++;
          expect(now).toBe(before);
        }
        before = now;
      });
      // (The fight lasts a while: since v17 the two blocks keep out of each other's ground, and this scene's fight ends a few ticks sooner.)
      expect(engagedTicks).toBeGreaterThan(30);
    }
  }, 60_000);

  it('undead fugitives never join anyone', () => {
    for (const seed of [1, 2, 3]) expect(joined(scene(seed, U.HeavyInfantry, U.HeavyInfantry, 'undead'), 150)).toBe(0);
  }, 60_000);
});

describe('regroup: a broken regiment re-forms out of contact', () => {
  /** Team 0: two regiments of heavy foot in the middle of the field, one of which breaks; the enemy far off. */
  function rallyScene(seed: number, faction: FactionId = 'templar') {
    const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts({ [U.HeavyInfantry]: 60 }), 0, faction), plainArmy(counts({ [U.HeavyInfantry]: 30 }), 200, faction)] });
    b.generals[0].fixedPlan = 'hold';
    b.generals[1].fixedPlan = 'hold';
    const [a, reserve] = b.regiments.filter((r) => r.team === 0);
    const foe = b.regiments.find((r) => r.team === 1)!;
    placeRegiment(b, a!, 900, 450, 1, 0);
    placeRegiment(b, reserve!, 800, 750, 1, 0);
    placeRegiment(b, foe, 1500, 600, -1, 0);
    b.step();
    rout(b, a!);
    return { b, r: a! };
  }

  it('with its men together and a formed reserve near, it rallies, re-forms and is shaken', () => {
    let rallied = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { b, r } = rallyScene(seed);
      for (let t = 0; t < 400 && r.routed && !b.done(); t++) b.step();
      consistent(b);
      if (r.routed) continue;
      rallied++;
      expect(b.events.some((e) => e.kind === 'rally' && e.reg === r.id)).toBe(true);
      expect(r.moraleState).toBe('rallying');
      expect(r.members.some((id) => b.soldiers[id]!.state === State.Fighting)).toBe(true);
      // A second rout is final (for Templars, T2: a third; see doctrine.test.ts).
      rout(b, r);
      expect(r.moraleState).toBe('broken');
      r.rallies++;
      r.routed = false;
      rout(b, r);
      expect(r.moraleState).toBe('shattered');
    }
    expect(rallied).toBeGreaterThan(0);
  }, 60_000);

  it('undead never break, so never rally (undead.test.ts)', () => {
    const { b, r } = rallyScene(1, 'undead');
    expect(r.moraleState).toBe('steady');
    expect(r.routed).toBe(false);
    for (let t = 0; t < 100 && !b.done(); t++) b.step();
    expect(b.events.some((e) => e.kind === 'rally' || e.kind === 'rout')).toBe(false);
  }, 60_000);
});
