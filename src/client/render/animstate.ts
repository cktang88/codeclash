// Which animation a battle figure plays and from which frame, frame to frame (pure: no DOM,
// testable in Node). The sim says what a man is doing each tick; this turns that into a motion that
// flows: a speed hovering around a threshold does not flip a man between walking and standing every
// tick (hysteresis, and a short least hold per animation), a man going from the walk into the run
// or into his guard-walk keeps his stride (the three gaits share one 12-frame step: the feet do not
// jump), a man coming out of a blow or a guard-walk stands in his guard from its frame 0 (where the
// blow ended), and a flinch that comes due while he is still swinging plays whole once the blow is
// done instead of from its middle. See docs/art-references/anim-blend.md.

import { Anim } from './contract.ts';

/** What the scene knows of a man this frame, for choosing his animation. Filled in place (no allocation per figure). */
export interface AnimFacts {
  /** Down (falling, then the corpse): Die from `diedAt`. */
  dead: boolean;
  /** Getting up from the dead (Die played backwards). */
  rising: boolean;
  /** Ticks since his latest blow or shot (Soldier.actedAt), the animation it plays and its length in ticks. */
  act: number;
  actAnim: Anim;
  actLen: number;
  /** Ticks since he was last wounded, and the flinch's length. */
  hit: number;
  hitLen: number;
  routing: boolean;
  /** His speed and his kind's marching speed (world units per second). */
  speed: number;
  top: number;
  /** His regiment charges or pursues. */
  charging: boolean;
  /** State.Fighting. */
  fighting: boolean;
  /** His foe is in reach (14 units, or his weapon's reach: scene.ts). */
  reach: boolean;
  /** In the fight (scene.ts: his block locked, touching, closing, or his foe near): he walks in his guard. */
  inFight: boolean;
  /** A knight in a wedge (rides at the run from 0.7 of his speed). */
  wedge: boolean;
  /** Standing, he holds his guard (a bracing stance, a foe he would strike, or in the fight). */
  guard: boolean;
}

export function blankFacts(): AnimFacts {
  return { dead: false, rising: false, act: -1, actAnim: Anim.Attack, actLen: 0, hit: 1e9, hitLen: 0, routing: false, speed: 0, top: 1, charging: false, fighting: true, reach: false, inFight: false, wedge: false, guard: false };
}

/** Walk, Run and Advance: one 12-frame step, frame for frame (paper/guard.ts guardWalk). */
export const isGait = (a: Anim): boolean => a === Anim.Walk || a === Anim.Run || a === Anim.Advance;
/** The looping clips a man holds between the one-shot ones. */
export const isLoop = (a: Anim): boolean => a === Anim.Idle || a === Anim.Brace || isGait(a);

/**
 * The animation the sim's state calls for, given the one he plays now (`prev`): the speed
 * thresholds have a band of hysteresis, so a man must slow below where he started to walk before
 * he stands again, and drop clearly under the run's speed before he walks.
 */
export function pickAnim(f: AnimFacts, prev: Anim): Anim {
  if (f.dead || f.rising) return Anim.Die;
  if (f.act >= 0 && f.act < f.actLen) return f.actAnim;
  if (f.hit >= 0 && f.hit < f.hitLen) return Anim.Hit;
  const moving = isGait(prev);
  const running = prev === Anim.Run;
  const sp = f.speed;
  const top = f.top;
  if (f.routing || sp > top * (running ? 1.1 : 1.2) || (f.charging && sp > top * (running ? 0.5 : 0.6))) return Anim.Run;
  // A man with his foe in reach who shuffles in the press stands in his guard (scene.ts).
  const shuffle = f.fighting && f.reach && sp < top * (moving ? 0.5 : 0.6);
  if (sp > (moving ? 2 : 3) && !shuffle) {
    if (f.wedge && sp > top * (running ? 0.6 : 0.7)) return Anim.Run;
    return f.inFight ? Anim.Advance : Anim.Walk;
  }
  if (f.fighting && f.guard) return Anim.Brace;
  return Anim.Idle;
}

/**
 * Ticks the sim must call for another looping clip, without a break, before it takes over from the
 * one a man plays (a blow, a flinch or a fall always cuts in at once). The sim's men pause a tick
 * every few in a march or a press (their speed drops to 0 and back), and the speed of a jostled
 * block swings from tick to tick: without this the figure flips between walking and standing.
 * Starting to move is quick; stopping, or changing gait, waits a little longer.
 */
export function settleFor(from: Anim, to: Anim): number {
  if (isGait(from)) return 1.6;
  if (isGait(to)) return 0.8;
  return 3; // Idle <-> Brace
}

/**
 * Per-man animation state across frames: the clip he plays, when it began (`at`, tick + alpha) and,
 * for a loop, the frame position it began at (`pos`, in frames, unwrapped), so a switch can carry
 * the stride over. `T` going backwards (a scene rebuilt, a replay scrubbed) starts afresh.
 */
export class AnimTrack {
  readonly anim: Uint8Array;
  readonly at: Float32Array;
  readonly pos: Float32Array;
  readonly last: Float32Array;
  /** The looping clip the sim calls for instead of his (255: none) and since when (settleFor). */
  readonly pend: Uint8Array;
  readonly pendAt: Float32Array;
  constructor(n: number) {
    this.pend = new Uint8Array(n).fill(255);
    this.pendAt = new Float32Array(n);
    this.anim = new Uint8Array(n).fill(255);
    this.at = new Float32Array(n);
    this.pos = new Float32Array(n);
    this.last = new Float32Array(n).fill(-1e9);
  }

  /** Copies another track's state (a scene rebuilt mid-battle for an art switch). */
  copy(o: AnimTrack): void {
    this.anim.set(o.anim);
    this.at.set(o.at);
    this.pos.set(o.pos);
    this.last.set(o.last);
    this.pend.set(o.pend);
    this.pendAt.set(o.pendAt);
  }

  /**
   * Man `i`'s animation at `T` (the result; his frame is then `frame()`), given the one the sim
   * calls for (`want`, from pickAnim). `start` is when a one-shot began (actedAt, hitAt, diedAt).
   * `frames` and `tpf` give frames per animation (indexed by Anim, from `base`) and ticks per frame;
   * `phase` is the man's default loop phase in ticks (a drilled block's shared step).
   */
  resolve(i: number, want: Anim, T: number, start: number, frames: ArrayLike<number>, base: number, tpf: ArrayLike<number>, phase: number): Anim {
    const anim = this.anim;
    let cur = anim[i]! as Anim | 255;
    const last = this.last[i]!;
    this.last[i] = T;
    if (T < last - 0.5 || T - last > 30) cur = 255; // time ran backwards, or he was long unseen
    if (!isLoop(want)) this.pend[i] = 255;
    if (want === Anim.Die || want === Anim.Attack || want === Anim.Shoot) {
      anim[i] = want;
      this.at[i] = start;
      return want;
    }
    if (want === Anim.Hit) {
      // A fresh wound flinches in step with the sim; one that came due while he was still swinging
      // (the blow outranks it) plays whole from now, not from its middle.
      if (cur !== Anim.Hit || start > this.at[i]! + 0.5) this.at[i] = T - start < 1 ? start : T;
      anim[i] = Anim.Hit;
      return Anim.Hit;
    }
    // A flinch begun late runs its course.
    if (cur === Anim.Hit && T - this.at[i]! < frames[base + Anim.Hit]! * tpf[Anim.Hit]!) return Anim.Hit;
    if (cur === want) {
      this.pend[i] = 255;
      return want;
    }
    if (cur !== 255 && isLoop(cur)) {
      if (this.pend[i] !== want) {
        this.pend[i] = want;
        this.pendAt[i] = T;
      }
      if (T - this.pendAt[i]! < settleFor(cur, want)) return cur;
    }
    this.pend[i] = 255;
    // Enter `want` (a loop).
    let p: number;
    if (cur !== 255 && isGait(cur) && isGait(want)) {
      // Same step: carry the stride over (as a fraction of the cycle, should the counts differ).
      const nOld = frames[base + cur]!;
      const cyc = this.pos[i]! + (T - this.at[i]!) / tpf[cur]!;
      p = (cyc / nOld) * frames[base + want]!;
    } else if (want === Anim.Brace && (cur === Anim.Attack || cur === Anim.Shoot || cur === Anim.Hit || cur === Anim.Advance)) {
      // Into the guard where the blow ended (and the guard-walk's arms are): its frame 0.
      p = 0;
    } else p = (T + phase) / tpf[want]!;
    anim[i] = want;
    this.at[i] = T;
    this.pos[i] = p;
    return want;
  }

  /** Man `i`'s frame at `T` in the animation resolve() returned (`n` frames, `tpf` ticks each). */
  frame(i: number, T: number, n: number, tpf: number): number {
    const a = this.anim[i]! as Anim;
    if (isLoop(a)) {
      const f = Math.floor(this.pos[i]! + (T - this.at[i]!) / tpf) % n;
      return f < 0 ? f + n : f;
    }
    const f = Math.floor((T - this.at[i]!) / tpf);
    return f < 0 ? 0 : f >= n ? n - 1 : f;
  }
}
