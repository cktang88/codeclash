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
  it('a general who sends his horse round the flanks beats one who keeps it at home', () => {
    let good = 0;
    for (let seed = 1; seed <= 50; seed++) {
      for (const side of [0, 1] as const) {
        const b = new Battle(setupOf(seed, army(300), army(300)));
        b.generals[1 - side]!.useCavalry = false;
        if (b.run().winner === side) good++;
      }
    }
    // Clearly more often than not, from either side: 60 of 100 battles (about 70 today). A run
    // of 20 battles swings by several wins on the seeds alone, too much to tell 55% from 70%.
    expect(good).toBeGreaterThanOrEqual(60);
  }, 180_000);

});
