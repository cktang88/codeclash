// The fearless dead (battle.ts `fearless`, `crumble`; UNDEAD in command.ts): undead regiments
// never waver, rout or rally, and no morale rule touches them; when the Lich-Marshal falls the
// whole host crumbles; and an undead army can still lose, in good time.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, fight, MAX_TICKS, State, UNDEAD, type ArmySpec, type Regiment } from './battle.ts';
import { COLOSSUS_HP, DEAD_HP, factionStats, type FactionId } from './factions.ts';
import { placeRegiment, plainArmy } from './testing.ts';
import { emptyCounts, STATS, U, UNIT_COUNT } from './units.ts';

const counts = (pairs: Record<number, number>): number[] => {
  const c = new Array<number>(UNIT_COUNT).fill(0);
  for (const [k, v] of Object.entries(pairs)) c[Number(k)] = v;
  return c;
};
const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, faction: FactionId, hue = 0, commander = true): ArmySpec => ({
  name: faction, faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander,
});
const MORALE_EVENTS = new Set(['waver', 'rout', 'shattered', 'rally', 'reform', 'joins']);

/** Undead (or `faction`) heavy foot, 30 (one regiment), standing at x 800 facing right; enemy heavy foot far off. */
function standing(faction: FactionId, seed = 1): { b: Battle; r: Regiment } {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts({ [U.HeavyInfantry]: 30 }), 0, faction), plainArmy(counts({ [U.HeavyInfantry]: 30 }), 200)] });
  b.generals[0].fixedPlan = 'hold';
  b.generals[1].fixedPlan = 'hold';
  const r = b.regiments.find((x) => x.team === 0)!;
  placeRegiment(b, r, 800, 600, 1, 0);
  placeRegiment(b, b.regiments.find((x) => x.team === 1)!, 1500, 600, -1, 0);
  b.step();
  expect(b.regiments.filter((x) => x.team === 0)).toEqual([r]);
  return { b, r };
}

describe('the fearless dead', () => {
  it('have much lower hit points; the Colossus a little more, the engines none less', () => {
    const dead = factionStats('undead');
    for (let k = 0; k < UNIT_COUNT; k++) {
      const want = k === U.Shock ? COLOSSUS_HP : k === U.Artillery ? 1 : DEAD_HP;
      expect(dead[k]!.hp).toBeCloseTo(STATS[k]!.hp * want);
    }
    expect(DEAD_HP).toBeLessThanOrEqual(0.75);
  });

  it('an undead regiment taking heavy losses never routs', () => {
    for (const seed of [1, 2]) {
      const { b, r } = standing('undead', seed);
      // Three quarters of them cut down in a moment: any living regiment breaks (see the control).
      for (const id of r.members.slice(0, 22)) b.kill(id);
      expect(r.alive).toBe(8);
      for (let t = 0; t < 200 && !b.done(); t++) {
        b.step();
        expect(r.routed).toBe(false);
        expect(r.moraleState).toBe('steady');
        expect(r.morale).toBe(100);
      }
      expect(r.members.filter((id) => b.soldiers[id]!.state === State.Routing)).toEqual([]);
      expect(b.events.some((e) => e.team === 0 && MORALE_EVENTS.has(e.kind))).toBe(false);
    }
    // The control: Templars losing as many break.
    const { b, r } = standing('templar');
    for (const id of r.members.slice(0, 22)) b.kill(id);
    for (let t = 0; t < 200 && !r.routed; t++) b.step();
    expect(r.routed).toBe(true);
  }, 60_000);

  it('no morale rule touches them: charges, missiles, routs nearby, the general falling', () => {
    // Whole battles against both other factions: every undead regiment stays at 100 and steady
    // through charges into it, arrows and stones, its neighbours dying and its Lich-Marshal falling.
    let sawCharges = 0;
    for (const foe of ['templar', 'samurai'] as const) {
      for (const seed of [1, 2, 3]) {
        const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(200, 'undead'), army(200, foe, 200)] });
        expect(b.fearless).toEqual([true, false]);
        while (!b.done()) {
          b.step();
          for (const r of b.regiments) {
            if (r.team !== 0) continue;
            expect(r.morale).toBe(100);
            expect(r.moraleState).toBe('steady');
            expect(r.routed).toBe(false);
          }
        }
        expect(b.events.some((e) => e.team === 0 && MORALE_EVENTS.has(e.kind))).toBe(false);
        // The other side's morale works as before.
        expect(b.events.some((e) => e.team === 1 && (e.kind === 'waver' || e.kind === 'rout'))).toBe(true);
        sawCharges += b.events.filter((e) => e.team === 1 && e.kind === 'charge').length;
      }
    }
    expect(sawCharges).toBeGreaterThan(0);
  }, 120_000);

  it('when the Lich-Marshal falls the whole host crumbles (and fights worse)', () => {
    const b = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [army(150, 'undead'), army(150, 'templar', 200)] });
    b.step();
    expect(b.crumbling).toEqual([false, false]);
    const lich = b.commander[0];
    b.kill(lich);
    expect(b.commanderFell[0]).toBe(true);
    expect(b.crumbling[0]).toBe(true);
    expect(b.events.some((e) => e.kind === 'crumble' && e.team === 0 && e.note === 'commander')).toBe(true);
    // Out of contact (the armies are still far apart), ten seconds take about 20% of every man's hit points.
    const before = b.soldiers.map((s) => s.hp);
    for (let t = 0; t < 100; t++) b.step();
    for (const s of b.soldiers) {
      if (s.state !== State.Fighting) continue;
      const lost = (before[s.id]! - s.hp) / s.s.hp;
      if (s.team === 0) expect(lost).toBeCloseTo(10 * UNDEAD.crumble, 5);
      else expect(lost).toBe(0);
    }
    // A Templar commander's death crumbles nobody.
    const c = new Battle({ version: BATTLE_VERSION, seed: 4, kind: 'daily', armies: [army(150, 'undead'), army(150, 'templar', 200)] });
    c.step();
    c.kill(c.commander[1]);
    expect(c.crumbling).toEqual([false, false]);
    // Left alone, a crumbled host falls to dust and loses.
    while (!b.done()) b.step();
    expect(b.result!.winner).toBe(1);
  }, 60_000);

  it('an undead army can still lose, and the battle ends in good time', () => {
    for (const seed of [1, 2, 3]) {
      const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(150, 'undead', 0, false), army(300, 'templar', 200)] });
      expect(r.winner).toBe(1);
      expect(r.reason).toBe('rout');
      expect(r.ticks).toBeLessThan(MAX_TICKS);
      // They did not run: those not cut down were still standing at the end.
      expect(r.sides[0].fled.reduce((a, x) => a + x, 0)).toBe(0);
    }
    // Two fearless hosts fight it out within the time limit too.
    for (const seed of [1, 2]) {
      const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(200, 'undead'), army(200, 'undead', 200)] });
      expect(r.reason).toBe('rout');
      expect(r.ticks).toBeLessThan(MAX_TICKS);
    }
  }, 120_000);
});
