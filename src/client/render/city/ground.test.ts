import { describe, expect, it } from 'vitest';
import type { BuildingKey } from '../../../game/city.ts';
import { groundKey } from './ground.ts';

const L = (v: number, over: Partial<Record<BuildingKey, number>> = {}): Record<BuildingKey, number> => ({
  barracks: v, range: v, stables: v, workshop: v, chapter: v, granary: v, hospital: v, walls: v, ...over,
});
const key = (l: Record<BuildingKey, number>) => groundKey(l, Math.max(0, ...Object.values(l)));

describe('groundKey (when the city ground must be repainted)', () => {
  it('ignores a level gained inside a tier', () => {
    expect(key(L(6, { barracks: 7 }))).toBe(key(L(6)));
    expect(key(L(11, { walls: 12, chapter: 13 }))).toBe(key(L(11)));
  });

  it('changes when a tier changes, a building rises from nothing, or more fields are sown', () => {
    expect(key(L(4, { barracks: 5 }))).not.toBe(key(L(4)));
    expect(key(L(0, { workshop: 1 }))).not.toBe(key(L(0)));
    expect(key(L(0, { stables: 1 }))).not.toBe(key(L(0)));
    // Granary 2 -> 3 sows a second field.
    expect(key(L(2, { granary: 3 }))).not.toBe(key(L(2)));
    // The keep's shadow follows the highest level's tier, even with walls at 0 (not a lot).
    expect(groundKey(L(0), 4)).not.toBe(groundKey(L(0), 5));
  });
});
