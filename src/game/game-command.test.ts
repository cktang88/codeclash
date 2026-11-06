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
  it('a committed reserve changes the battle', () => {
    let changed = 0;
    let committed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const a = new Battle(setupOf(seed, army(400), army(400)));
      const b = new Battle(setupOf(seed, army(400), army(400)));
      b.generals[0].useReserve = false;
      const ra = a.run();
      const rb = b.run();
      // (Since v17 a reserve also goes in on its own for an open flank close by: the General's
      // leave to use the reserve covers that too, and it is as much a committed reserve.)
      const reserveIn = (x: Battle) => x.events.some((e) => e.kind === 'general-order' && e.team === 0 && (e.order === 'support' || (e.order === 'flank' && (e.note ?? '').includes('on its own'))));
      if (reserveIn(a)) committed++;
      expect(reserveIn(b)).toBe(false);
      if (ra.winner !== rb.winner || ra.ticks !== rb.ticks || ra.sides[1].dead.join() !== rb.sides[1].dead.join()) changed++;
    }
    expect(committed).toBeGreaterThanOrEqual(2);
    expect(changed).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('the general’s death matters', () => {
    const b = new Battle(setupOf(2, army(300), army(300)));
    for (let i = 0; i < 300; i++) b.step();
    const before = b.regiments.filter((r) => r.team === 1 && r.alive > 0).map((r) => r.morale);
    b.kill(b.commander[1]);
    const after = b.regiments.filter((r) => r.team === 1 && r.alive > 0).map((r) => r.morale);
    expect(b.commanderFell[1]).toBe(true);
    expect(b.events.some((e) => e.kind === 'commander' && e.team === 1)).toBe(true);
    for (let i = 0; i < before.length; i++) expect(after[i]!).toBeLessThanOrEqual(before[i]! - 15);
    // Over several battles, the side that lost its general early loses most of them (about 82%
    // of 60 seeds in v7 and v8; 6 seeds were too few to ask 5 of: v8 drew 3 of its first 6).
    const lost = winsOf(20, (seed) => {
      const x = new Battle(setupOf(seed, army(300), army(300)));
      for (let i = 0; i < 300; i++) x.step();
      x.kill(x.commander[1]);
      return x.run().winner;
    });
    expect(lost).toBeGreaterThanOrEqual(14);
  }, 60_000);

});
