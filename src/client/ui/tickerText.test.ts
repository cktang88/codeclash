import { describe, expect, it } from 'vitest';
import type { ArmySpec, BattleEvent, BattleSetup } from '../../game/battle.ts';
import { tickerLine } from './tickerText.ts';

const army = (name: string, faction: ArmySpec['faction']) => ({ name, faction }) as ArmySpec;
const armies: BattleSetup['armies'] = [army('Ana', 'templar'), army('Bo', 'samurai')];
const doctrine = (note: string, team = 0): BattleEvent => ({ tick: 1, team, kind: 'doctrine', cls: 0, note });

describe('tickerLine', () => {
  it('tells the known doctrine moments', () => {
    expect(tickerLine(doctrine('banner'), armies)).toMatch(/^Ana’s .+ fall back on the banner/);
    expect(tickerLine(doctrine('first-spear', 1), armies)).toMatch(/^Bo’s .+ claim the first spear!$/);
  });

  it('never leaves a doctrine moment it does not know as an empty line', () => {
    for (const note of ['some-new-doctrine', '']) {
      const line = tickerLine(doctrine(note), armies);
      expect(line).toMatch(/^Ana’s .+ keep to their doctrine$/);
    }
    expect(tickerLine({ tick: 1, team: 1, kind: 'doctrine', cls: 0 }, armies)).toMatch(/^Bo’s /);
  });
});
