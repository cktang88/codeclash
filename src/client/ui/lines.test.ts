import { describe, expect, it } from 'vitest';
import { Cat } from '../../sim/api.ts';
import { CAT_GROUP, groupLines } from './lines.ts';

describe('lines grouping', () => {
  it('puts code first and presents tests, comments, docs and config as support', () => {
    const lines = new Array<number>(9).fill(0);
    lines[Cat.Test] = 500;
    lines[Cat.Code] = 100;
    lines[Cat.Docs] = 20;
    lines[Cat.Vendor] = 900;
    const groups = groupLines(lines);
    expect(groups.map((g) => g.group)).toEqual(['army', 'support', 'inert']);
    expect(groups[0]!.cats).toEqual([{ cat: Cat.Code, n: 100 }]);
    expect(groups[1]).toEqual({ group: 'support', total: 520, cats: [{ cat: Cat.Test, n: 500 }, { cat: Cat.Docs, n: 20 }] });
    expect(CAT_GROUP[Cat.Comment]).toBe('support');
    expect(CAT_GROUP[Cat.Config]).toBe('support');
    expect(CAT_GROUP[Cat.Removed]).toBe('army');
  });

  it('drops empty groups', () => {
    expect(groupLines([0, 3, 0, 0, 0, 0, 0, 0, 0]).map((g) => g.group)).toEqual(['support']);
    expect(groupLines([])).toEqual([]);
  });
});
