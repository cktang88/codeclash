import { describe, expect, it } from 'vitest';
import { ELBOW, FoeGrid, type FoeMan } from './foes.ts';

describe('FoeGrid', () => {
  const man = (x: number, y: number, team: number, state = 0): FoeMan => ({ x, y, team, state });

  it('finds the nearest living enemy within the radius, across cells', () => {
    const men = [man(100, 100, 0), man(110, 100, 1), man(96, 104, 1), man(101, 101, 0), man(99, 99, 1, 2), man(130, 100, 1)];
    const g = new FoeGrid(400, 400);
    g.build(men, 1);
    expect(g.nearest(100, 100, 0)).toBe(2); // 5.7 u, not the dead man at 1.4 u nor a friend
    expect(g.nearest(110, 100, 1)).toBe(3); // for a team-1 man: the nearest team-0 man (9.1 u)
    expect(g.nearest(130, 100, 1, ELBOW)).toBe(-1); // team 0 is over 18 u away
    expect(g.nearest(100, 100, 0, 4)).toBe(-1); // none within 4
  });

  it('keeps the build of a tick until the tick changes', () => {
    const men = [man(10, 10, 0), man(20, 10, 1)];
    const g = new FoeGrid(100, 100);
    g.build(men, 5);
    men[1]!.x = 90;
    g.build(men, 5);
    expect(g.nearest(10, 10, 0)).toBe(1);
    g.build(men, 6);
    expect(g.nearest(10, 10, 0)).toBe(-1);
  });

  it('clamps men off the field into the edge cells', () => {
    const g = new FoeGrid(100, 100);
    g.build([man(-3, 50, 0), man(2, 50, 1)], 0);
    expect(g.nearest(-3, 50, 0)).toBe(1);
  });
});
