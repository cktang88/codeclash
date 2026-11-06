import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

import { MIX, army, push, WEEK, weekOfWork, cohortsAfter, setupOf, valued, only, deadOf, winsOf } from './game-test-helpers.ts';

// Split from game-morale.test.ts: the 200-battle morale-bonus check alone runs about as long as a
// file may (see fast-sim), so it gets a file of its own and runs in parallel.

describe('battle: command and morale', () => {
  it('the city’s morale bonus helps, on either side', () => {
    // The bonus steadies the men: the side that has it wavers and breaks less often than the same
    // army without it, on the same day against the same foe. This used to be a win-rate check
    // (200 battles, at least 110 won with the bonus); with the horse now waiting out of bowshot
    // those battles last long enough that the check alone outran the time limit, and a win rate
    // tests balance, not the rule. Days 1-20 at 300 a side: 254 waverings and routs with the
    // bonus against 338 without (team 0).
    const shaken = (seed: number, team: 0 | 1, bonus: number) => {
      const a = team === 0 ? army(300, { moraleBonus: bonus }) : army(300);
      const z = team === 1 ? army(300, { moraleBonus: bonus }) : army(300);
      const b = new Battle(setupOf(seed, a, z));
      while (!b.done() && b.tick < 1800) b.step();
      return b.events.filter((e) => e.team === team && (e.kind === 'rout' || e.kind === 'waver')).length;
    };
    for (const team of [0, 1] as const) {
      let withBonus = 0;
      let without = 0;
      for (let seed = 1; seed <= 10; seed++) {
        withBonus += shaken(seed, team, 15);
        without += shaken(seed, team, 0);
      }
      expect(withBonus, `team ${team}`).toBeLessThan(without * 0.9);
    }
  }, 170_000);
});
