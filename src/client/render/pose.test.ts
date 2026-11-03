import { describe, expect, it } from 'vitest';
import { Anim, type Dir } from './contract.ts';
import { dirFor } from './iso.ts';
import { facing } from './pose.ts';

const N = NaN;

describe('facing', () => {
  // A regiment facing +x (army 0 advancing): Dir 0 on screen.
  const front = [1, 0] as const;

  it('faces where the shot goes, not the regiment front, while loosing', () => {
    // A horse archer of a block facing +x shoots back over his shoulder toward -x.
    const d = facing(Anim.Shoot, 0, 0, N, N, false, -40, 0, front[0], front[1], 0);
    expect(d).toBe(dirFor(-40, 0, 0));
    expect(d).not.toBe(dirFor(front[0], front[1], 0));
    // Moving while loosing: still the shot.
    expect(facing(Anim.Shoot, 30, 0, N, N, false, -40, 5, front[0], front[1], 0)).toBe(dirFor(-40, 5, 0));
  });

  it('keeps the regiment front for a shooter with no shot yet', () => {
    expect(facing(Anim.Shoot, 0, 0, N, N, false, N, N, 0, 1, 0)).toBe(dirFor(0, 1, 0));
  });

  it('faces the way he moves, else his foe, else the front', () => {
    expect(facing(Anim.Walk, 0, -20, N, N, false, -40, 0, 1, 0, 0)).toBe(dirFor(0, -20, 0));
    expect(facing(Anim.Attack, 10, 10, -5, 0, true, N, N, 1, 0, 0)).toBe(dirFor(-5, 0, 0));
    expect(facing(Anim.Brace, 0, 0, 0, -5, true, N, N, 1, 0, 0)).toBe(dirFor(0, -5, 0));
    // A guard with the foe out of reach squares to the front.
    expect(facing(Anim.Brace, 0, 0, 0, -50, false, N, N, 1, 0, 0)).toBe(dirFor(1, 0, 0));
    // An old shot does not turn an idle man.
    expect(facing(Anim.Idle, 0, 0, N, N, false, -40, 0, 1, 0, 0)).toBe(dirFor(1, 0, 0));
  });

  it('keeps the old facing for a vector with no direction', () => {
    for (const prev of [0, 1, 2, 3] as Dir[]) expect(facing(Anim.Idle, 0, 0, N, N, false, N, N, 0, 0, prev)).toBe(prev);
  });
});
