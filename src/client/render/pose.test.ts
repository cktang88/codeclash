import { describe, expect, it } from 'vitest';
import { Anim, type Dir } from './contract.ts';
import { dirFor } from './iso.ts';
import { facing, RISE_SLIDE, settleTurn, stillRising, TURN_HOLD } from './pose.ts';

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

  it('keeps facing his foe while he shuffles or steps back in the melee', () => {
    // Fighting toward +x (Dir 0 is toward the foe), giving ground at a walk toward -x: he backs off, facing the foe.
    expect(facing(Anim.Walk, -6, 0, 8, 0, true, N, N, 1, 0, 0)).toBe(dirFor(8, 0, 0));
    expect(facing(Anim.Brace, -5, 2, 8, 0, true, N, N, 1, 0, 0)).toBe(dirFor(8, 0, 0));
    // Running (fleeing, a horseman riding off) he turns his back.
    expect(facing(Anim.Run, -30, 0, 8, 0, true, N, N, 1, 0, 0)).toBe(dirFor(-30, 0, 0));
    // A foe out of reach: he faces where he walks.
    expect(facing(Anim.Walk, -6, 0, 40, 0, false, N, N, 1, 0, 0)).toBe(dirFor(-6, 0, 0));
  });

  it('does not turn to the regiment front while he flinches', () => {
    // Facing NW (2), hit, no foe in reach: he recoils where he stands, not toward the front (Dir 0).
    expect(facing(Anim.Hit, 0, 0, N, N, false, N, N, 1, 0, 2)).toBe(2);
    // With his foe in reach he recoils facing the foe.
    expect(facing(Anim.Hit, 0, 0, -8, 0, true, N, N, 1, 0, 0)).toBe(dirFor(-8, 0, 0));
  });
});

describe('settleTurn', () => {
  it('holds a new facing a moment before turning again', () => {
    expect(settleTurn(1, 0, Anim.Walk, 0.5)).toBe(0);
    expect(settleTurn(1, 0, Anim.Walk, TURN_HOLD - 0.01)).toBe(0);
    expect(settleTurn(1, 0, Anim.Walk, TURN_HOLD)).toBe(1);
    expect(settleTurn(0, 0, Anim.Walk, 0)).toBe(0);
  });

  it('turns at once to strike or loose', () => {
    expect(settleTurn(2, 0, Anim.Attack, 0)).toBe(2);
    expect(settleTurn(2, 0, Anim.Shoot, 0)).toBe(2);
  });
});

describe('stillRising', () => {
  it('plays the rise while he gets up where he lay', () => {
    expect(stillRising(0, 15, 0, 0)).toBe(true);
    expect(stillRising(14.5, 15, 1, 1)).toBe(true);
    expect(stillRising(15, 15, 0, 0)).toBe(false);
  });

  it('cuts it short once the battle walks him off (no heap sliding over the field)', () => {
    expect(stillRising(3, 15, RISE_SLIDE, 0)).toBe(false);
    expect(stillRising(3, 15, 10, 20)).toBe(false);
    expect(stillRising(3, 15, NaN, NaN)).toBe(false);
  });
});
