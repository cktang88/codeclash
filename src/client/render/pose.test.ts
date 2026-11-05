import { describe, expect, it } from 'vitest';
import { Anim, type Dir } from './contract.ts';
import { dirFor } from './iso.ts';
import { facesRear, type Regiment } from '../../game/battle.ts';
import { facing, ownFront, RISE_SLIDE, settleTurn, stillRising, turnVia, TURN_HOLD, TURN_STEP, type Vec } from './pose.ts';

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

  it('walking in his guard, keeps his front to his foe even as he gives ground', () => {
    // Backing off toward -x from a foe at +x (out of reach): he still faces the foe.
    expect(facing(Anim.Advance, -20, 0, 30, 0, false, N, N, front[0], front[1], 0)).toBe(dirFor(30, 0, 0));
    // No foe of his own: the way he moves.
    expect(facing(Anim.Advance, 0, 20, N, N, false, N, N, front[0], front[1], 0)).toBe(dirFor(0, 20, 0));
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

describe('turnVia and turning back', () => {
  it('passes a half turn through a quarter beside both facings', () => {
    for (const prev of [0, 1, 2, 3] as const) {
      const next = ((prev + 2) & 3) as 0 | 1 | 2 | 3;
      const v = turnVia(prev, next, 1, 0.3);
      expect(((v - prev) & 3) % 2).toBe(1);
      expect(((v - next) & 3) % 2).toBe(1);
    }
    expect(turnVia(0, 1, 1, 0)).toBe(1);
    expect(turnVia(0, 0, 1, 0)).toBe(0);
  });
  it('holds longer before turning back to the facing just left', () => {
    expect(settleTurn(1, 0, Anim.Walk, TURN_HOLD, 1)).toBe(0);
    expect(settleTurn(1, 0, Anim.Walk, 2 * TURN_HOLD, 1)).toBe(1);
    expect(settleTurn(3, 0, Anim.Walk, TURN_HOLD, 1)).toBe(3);
  });
});

describe('ownFront: each man faces where he himself faces', () => {
  const out: Vec = { x: 0, y: 0 };
  // A block facing +x, locked to its front, with an enemy at its back until tick 110.
  const reg = { fx: 1, fy: 0, rows: 6, rearUntil: 110 } as unknown as Regiment;

  it("is the regiment's front for a man of the front half, or with no enemy behind", () => {
    expect(facesRear(reg, 2, false, 100)).toBe(false);
    expect(ownFront(1, 0, false, false, N, N, out)).toEqual({ x: 1, y: 0 });
    // Once the threat behind has passed (rearUntil), the rear half faces the front again.
    expect(facesRear(reg, 5, false, 110)).toBe(false);
  });

  it('turns the rear half about, foot only, as the sim does (battle.ts seek)', () => {
    expect(facesRear(reg, 3, false, 100)).toBe(true);
    expect(facesRear(reg, 5, false, 100)).toBe(true);
    expect(facesRear(reg, 3, true, 100)).toBe(false);
    // A two-rank block turns its second rank; a single rank turns nobody but rank 1 and on.
    expect(facesRear({ ...reg, rows: 2 } as Regiment, 1, false, 100)).toBe(true);
    expect(facesRear({ ...reg, rows: 1 } as Regiment, 0, false, 100)).toBe(false);
    const f = ownFront(1, 0, facesRear(reg, 4, false, 100), false, N, N, out);
    expect([f.x, f.y + 0]).toEqual([-1, 0]);
    // An idle or bracing rear-ranker with no foe of his own is drawn facing the rear...
    expect(facing(Anim.Idle, 0, 0, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(-1, 0, 0));
    expect(facing(Anim.Brace, 0, 0, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(-1, 0, 0));
    // Stepping in his guard (closing on the press behind him) he keeps facing the rear...
    expect(facing(Anim.Advance, 6, 0, N, N, false, N, N, f.x, f.y, 0, true)).toBe(dirFor(-1, 0, 0));
    expect(facing(Anim.Advance, 6, 0, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(6, 0, 0));
    // ...but one walking still faces his way, and one with a foe in reach faces him.
    expect(facing(Anim.Walk, 0, 20, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(0, 20, 0));
    expect(facing(Anim.Brace, 0, 0, 0, 6, true, N, N, f.x, f.y, 0)).toBe(dirFor(0, 6, 0));
  });

  it('faces the enemy block a man swings round the flank of, standing', () => {
    const f = ownFront(1, 0, false, true, 0, 30, out);
    expect(facing(Anim.Idle, 0, 0, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(0, 30, 0));
    // Swinging round, the way he goes.
    expect(facing(Anim.Walk, 20, -10, N, N, false, N, N, f.x, f.y, 0)).toBe(dirFor(20, -10, 0));
    // No block known (or on top of it): his own front.
    expect(ownFront(1, 0, false, true, N, N, out)).toEqual({ x: 1, y: 0 });
    const g = ownFront(1, 0, true, true, 0, 0, out);
    expect([g.x, g.y + 0]).toEqual([-1, 0]);
  });

  it('turns a rear-ranker about through a quarter, then holds (a lapse of the threat behind does not flick him back)', () => {
    // Drawn facing the front, the rear half turns about at T = 0: settleTurn then turnVia, as scene.ts does.
    const front = dirFor(1, 0, 0);
    let dir = front;
    let turnAt = -100;
    const seen: number[] = [];
    for (let T = 0; T < 4 * TURN_HOLD; T += 0.25) {
      // The threat behind lapses for a tick and a half just after he turned.
      const rear = T < 2 || T >= 3.5;
      const f = ownFront(1, 0, rear, false, N, N, out);
      const next = settleTurn(facing(Anim.Idle, 0, 0, N, N, false, N, N, f.x, f.y, dir), dir, Anim.Idle, T - turnAt);
      if (next !== dir) {
        const via = turnVia(dir, next, f.x, f.y);
        turnAt = via === next ? T : T - (TURN_HOLD - TURN_STEP);
        dir = via;
        seen.push(dir);
      }
    }
    // A quarter, then the rear: never straight from front to rear.
    expect(seen[0]).not.toBe(dirFor(-1, 0, 0));
    expect(((seen[0]! - front) & 3) % 2).toBe(1);
    expect(seen[1]).toBe(dirFor(-1, 0, 0));
    // And no more turns: the lapse fell within his hold.
    expect(seen.length).toBe(2);
  });
});
