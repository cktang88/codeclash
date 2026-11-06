import { describe, expect, it } from 'vitest';
import { CAT_COUNT } from '../measure/categories.ts';
import { Battle, BATTLE_VERSION, FIELD_H, FIELD_W, fight, MAX_FIGURES, State, TICKS_PER_SECOND, type ArmySpec, type BattleSetup, type Stance } from './battle.ts';
import { cityAt, grandArmy, levelOf, type WorkEvent } from './city.ts';
import { botWork } from './bots.ts';
import { honourable, pairDaily, pairGrand, weekOf, DAY_MS, walkover } from './league.ts';
import { emptyCounts, STATS, total, U, UNIT_COUNT } from './units.ts';

import { MIX, army, push, WEEK, weekOfWork, cohortsAfter, setupOf, valued, only, deadOf, winsOf } from './game-test-helpers.ts';

// Split from game.test.ts so its long battles run in a file of their own (in parallel).

describe('battle: command and morale', () => {
  it('regiments waver, break, rally and shatter; the city’s morale bonus helps', () => {
    // Over a few battles: since v10 a regiment rallies only out of contact and with something to
    // rally on, and in some battles none does (in v13, seeds 1 and 5; in v14, seed 2; with the
    // riders who think for themselves, seeds 2-6 and 8, though over 24 battles as many blocks
    // rally as before).
    const states = new Set<string>();
    const kinds = new Set<string>();
    for (const seed of [1, 2, 3, 4]) {
      const b = new Battle(setupOf(seed, army(600), army(600)));
      while (!b.done()) {
        b.step();
        for (const r of b.regiments) states.add(r.moraleState);
      }
      expect(b.events.some((e) => e.kind === 'rout')).toBe(true);
      for (const e of b.events) kinds.add(e.kind);
    }
    for (const k of ['waver', 'rout', 'shattered'] as const) expect(kinds.has(k), k).toBe(true);
    expect([...states].sort()).toEqual(['broken', 'rallying', 'shattered', 'steady', 'wavering']);
    // The Chapter House's morale bonus, on either side.
    // Clearly more often than not: 60 of 100 battles (about two in three today).
    let bonus = 0;
    for (let seed = 1; seed <= 50; seed++) {
      if (fight(setupOf(seed, army(300, { moraleBonus: 15 }), army(300))).winner === 0) bonus++;
      if (fight(setupOf(seed, army(300), army(300, { moraleBonus: 15 }))).winner === 1) bonus++;
    }
    expect(bonus).toBeGreaterThanOrEqual(60);
  }, 180_000);
});
