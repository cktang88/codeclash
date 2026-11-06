// QA round 2 (docs/qa/battle-realism-review-2.md) #3, #4, #6 and leftover 5: horse that cannot get
// at its target or cannot catch it gives the charge up (`chargeSpent` in battle.ts), riders ride
// fugitives down (`move`), and two blocks on one enemy horse come at it side by side
// (`besideFriends`). Small set pieces, seconds each.
import { describe, expect, it } from 'vitest';
import { Battle, BATTLE_VERSION, State, type Regiment } from './battle.ts';
import { only, placeRegiment, plainArmy } from './testing.ts';
import { U, UNIT_COUNT } from './units.ts';
import type { FactionId } from './factions.ts';

const counts = (a: [number, number][]): number[] => {
  const c = new Array<number>(UNIT_COUNT).fill(0);
  for (const [i, n] of a) c[i] = n;
  return c;
};
const battle = (seed: number, a: [number, number][], b: [number, number][], fa: FactionId = 'templar', fb: FactionId = 'templar') =>
  new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(counts(a), 0, fa), plainArmy(counts(b), 200, fb)] });
const attack = (r: Regiment, target: number) => Object.assign(r.ord, { kind: 'attack', target, side: 0, friend: -1 });

describe('horse charges with sense (QA round 2)', () => {
  it('knights sent at horse our foot is fighting do not stand behind the foot: they ride round or take another', () => {
    // Our heavy foot locked with a few enemy knights; our knights behind the foot, told to take
    // those knights. (Until v17 they halted 30-40 u off behind the foot, in "charge", for good:
    // s1/450 K32 stood 18 s.)
    let worst = 0;
    let sum = 0;
    for (const seed of [1, 2, 3]) {
      // (Undead knights: they stand in the fight, they do not ride out of it.)
      const b = battle(seed, [[U.HeavyInfantry, 120], [U.Knights, 12]], [[U.Knights, 12], [U.HeavyInfantry, 40]], 'templar', 'undead');
      const foot = b.regiments.find((r) => r.team === 0 && r.cls === U.HeavyInfantry)!;
      const ours = b.regiments.find((r) => r.team === 0 && r.cls === U.Knights && r.role !== 'command')!;
      const prey = b.regiments.find((r) => r.team === 1 && r.cls === U.Knights && r.role !== 'command')!;
      const theirFoot = b.regiments.find((r) => r.team === 1 && r.cls === U.HeavyInfantry)!;
      placeRegiment(b, foot, 1000, 700, 1, 0);
      placeRegiment(b, prey, 1012, 700, -1, 0);
      placeRegiment(b, ours, 930, 700, 1, 0);
      placeRegiment(b, theirFoot, 1600, 300, -1, 0);
      b.generals[1]!.fixedPlan = 'hold';
      // Charging, within 80 of the prey's middle, and not one rider with a foe: ticks of it.
      let idle = 0;
      while (b.tick < 400 && !b.done() && prey.alive > 0) {
        if (ours.targetReg === prey.id || b.tick < 80) attack(ours, prey.id);
        b.step();
        const fighting = ours.members.some((id) => b.soldiers[id]!.target >= 0);
        if (ours.mode === 'charge' && !fighting && Math.hypot(ours.cx - prey.cx, ours.cy - prey.cy) < 80) idle++;
      }
      worst = Math.max(worst, idle);
      sum += idle;
    }
    // (Until v17: 8-15 s of it, 37 s over the three; now under 7 s, 17 s.)
    expect(worst).toBeLessThan(80);
    expect(sum).toBeLessThan(200);
  }, 60_000);

  it('knights give up the chase of horse they cannot catch, and leave it be a while', () => {
    // The horse archers run a wide circle ahead of the knights, faster than they ride (moved by
    // hand). (Until v17 the knights rode after them for good: s4/450 K14 for 60 s and more.)
    const b = battle(1, [[U.Knights, 12], [U.HeavyInfantry, 40]], [[U.HorseArchers, 10], [U.HeavyInfantry, 40]], 'undead', 'templar');
    const K = b.regiments.find((r) => r.team === 0 && r.cls === U.Knights && r.role !== 'command')!;
    const H = b.regiments.find((r) => r.team === 1 && r.cls === U.HorseArchers)!;
    for (const r of b.regiments) if (r !== K && r !== H && r.role !== 'command') placeRegiment(b, r, r.team === 0 ? 300 : 2100, 1300, r.team === 0 ? 1 : -1, 0);
    placeRegiment(b, K, 800, 700, 1, 0);
    placeRegiment(b, H, 1000, 700, 1, 0);
    const d = (b as unknown as { d: { x: Float64Array; y: Float64Array; state: Uint8Array } }).d;
    // A point running round (1100, 700), 220 off, at 6 u a tick; H's men are kept about it.
    let ux = -1;
    let uy = 0;
    const C = 0.99962;
    const S = 0.02727;
    let charged = 0;
    let longest = 0;
    let run = 0;
    let ended = -1;
    let again = -1;
    while (b.tick < 700 && !b.done()) {
      attack(K, H.id);
      b.step();
      const nx = ux * C - uy * S;
      uy = ux * S + uy * C;
      ux = nx;
      const cx = 1100 + ux * 220;
      const cy = 700 + uy * 220;
      const mx = H.members.reduce((a, id) => a + d.x[id]!, 0) / H.members.length;
      const my = H.members.reduce((a, id) => a + d.y[id]!, 0) / H.members.length;
      for (const id of H.members) {
        if (d.state[id] !== State.Fighting) continue;
        d.x[id] = d.x[id]! + cx - mx;
        d.y[id] = d.y[id]! + cy - my;
      }
      if (K.mode === 'charge' && !K.engaged) {
        run++;
        charged++;
      } else {
        if (run > 0 && ended < 0) ended = b.tick;
        run = 0;
      }
      if (ended >= 0 && again < 0 && K.mode === 'charge' && K.targetReg === H.id) again = b.tick;
      longest = Math.max(longest, run);
    }
    expect(charged).toBeGreaterThan(30);
    // Given up within 20 s of the first gallop, and not again for a good while.
    expect(longest).toBeLessThan(200);
    expect(ended).toBeGreaterThan(0);
    if (again >= 0) expect(again - ended).toBeGreaterThan(200);
  }, 30_000);

  it('knights pursuing routed archers ride them down and cut at them, rather than ride at their heels', () => {
    // The pursuit set piece of the review (48 Templar knights, 48 samurai archers). Until v17:
    // 27 routers cut down by riders over three seeds, riding 9-11 u behind them at 45 % of top speed.
    let kills = 0;
    for (const seed of [1, 2, 3]) {
      const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.Knights, 48), 0, 'templar'), plainArmy(only(U.Archers, 48), 200, 'samurai')] });
      const inner = b as unknown as { hurt(v: number, amount: number, a: number): void };
      const hurt0 = inner.hurt.bind(b);
      inner.hurt = (v: number, amount: number, a: number) => {
        const was = b.soldiers[v]!.state;
        hurt0(v, amount, a);
        const now = b.soldiers[v]!.state;
        if (was === State.Routing && a >= 0 && now !== State.Routing && now !== State.Fighting && b.soldiers[a]!.s.mounted) kills++;
      };
      while (!b.done() && b.tick < 1500) b.step();
    }
    expect(kills).toBeGreaterThanOrEqual(40);
  }, 60_000);

  it('two blocks of light horse charging one enemy horse come at it side by side, not into each other', () => {
    // Side by side 90-150 apart, the enemy 300 off between them. (Until v17 both aimed at its
    // middle and came together there: 6-12 % of riders knee to knee with the other block.)
    let pairs = 0;
    let knee = 0;
    for (const gap of [90, 120, 150]) {
      for (const seed of [1, 2, 3, 4]) {
        const b = battle(seed, [[U.LightCavalry, 24]], [[U.LightCavalry, 12]]);
        const ours = b.regiments.filter((r) => r.team === 0 && r.role !== 'command');
        const prey = b.regiments.find((r) => r.team === 1 && r.role !== 'command')!;
        expect(ours.length).toBe(2);
        placeRegiment(b, ours[0]!, 800, 700 - gap / 2, 1, 0);
        placeRegiment(b, ours[1]!, 800, 700 + gap / 2, 1, 0);
        placeRegiment(b, prey, 1100, 700, -1, 0);
        b.generals[1]!.fixedPlan = 'hold';
        const d = (b as unknown as { d: { x: Float64Array; y: Float64Array; state: Uint8Array; rad: Float64Array } }).d;
        const [A, B] = ours as [Regiment, Regiment];
        while (b.tick < 300 && !b.done()) {
          for (const r of ours) attack(r, prey.id);
          b.step();
          if (!['charge', 'melee'].includes(A.mode) || !['charge', 'melee'].includes(B.mode)) continue;
          for (const a of A.members) {
            if (d.state[a] !== State.Fighting) continue;
            pairs++;
            let best = 1e9;
            for (const c of B.members) if (d.state[c] === State.Fighting) best = Math.min(best, Math.hypot(d.x[a]! - d.x[c]!, d.y[a]! - d.y[c]!) / (d.rad[a]! + d.rad[c]!));
            if (best < 1.5) knee++;
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(3000);
    expect(knee / pairs).toBeLessThan(0.035);
  }, 60_000);
});
