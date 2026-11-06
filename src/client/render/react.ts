// How a battle figure's body answers the fight, frame to frame (pure: no DOM, testable in Node).
// The painted clips say what a man's limbs do; this says where his whole body is, a little off
// the spot the sim puts him on: he steps into his blow and back out of it, is driven back a pace
// by a blow that lands, jolts on his guard when one is parried, the second rank leans into the
// men in front, and a man struck down staggers back away from the blow as he goes down. Every
// shift is a few world units at most and is gone again within a second (a corpse keeps where it
// fell). See docs/art-references/melee-reaction.md.
//
// The sim says who struck whom and when (Soldier.actedAt and target), and whose hp fell this
// tick: a blow at a man whose hp did not fall was parried or turned by his shield (battle.ts
// `strike`: most blows miss). The scene records both per man (`Reactions.blow` / `parry`).

/** How far each motion carries a man (world units; a man is about 14 tall, a rank 8-10 deep). */
export const REACT = {
  /** Into his blow at the strike, and a little back in the chamber (lunge). */
  lunge: 2.2,
  lungeMounted: 0.8,
  /** Driven back by a blow that lands, a missile or a charge. */
  recoil: 1.9,
  recoilMounted: 0.6,
  /** Rocked back on his guard by a blow parried or taken on the shield. */
  parry: 0.9,
  /** Staggered back away from the death blow as he falls (the corpse lies there). */
  slide: 2.6,
  slideMounted: 1.2,
  /** In the fight: in and out at his foe, leaning on the backs in front (weave). */
  weave: 0.9,
} as const;

const sm = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const out2 = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) * (1 - u));

/**
 * His body along the line of his blow, `u` (0..1) of the way through it: a little back as he
 * chambers, in at the strike (frames 4-7 of 12, docs/art-references/weapon-attacks.md), home by
 * the recovery's end where the blow meets the guard again (paper/guard.ts FROM_GUARD).
 */
export function lunge(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.25) return -0.22 * sm(u / 0.25);
  if (u < 0.55) return -0.22 + 1.22 * sm((u - 0.25) / 0.3);
  return 1 - sm((u - 0.55) / 0.45);
}

/** Driven back by a blow `t` ticks ago: out fast (by 0.7 tick), then a slower step back in (by `back`). */
export function recoil(t: number, peak = 0.7, back = 4.5): number {
  if (t < 0 || t >= back) return 0;
  if (t < peak) return out2(t / peak);
  return 1 - sm((t - peak) / (back - peak));
}

/**
 * Die playback: the first STAGGER frames (the blow, the stagger, the knees going: every Die clip
 * keeps the man upright through its frames 0-4) play at STAGGER_RATE of their speed, so the hit
 * reads before he goes down; the topple and the landing play as painted.
 */
export const STAGGER = 5;
export const STAGGER_RATE = 0.65;

/** Ticks a Die of `frames` frames at `tpf` ticks each takes, retimed (dieFrame). */
export function dieLen(frames: number, tpf: number): number {
  const a = Math.min(frames, STAGGER);
  return tpf * (a / STAGGER_RATE + (frames - a));
}

/** The Die frame `t` ticks into the fall (the last once down). */
export function dieFrame(t: number, frames: number, tpf: number): number {
  if (t <= 0) return 0;
  const a = Math.min(frames, STAGGER);
  const ta = (tpf * a) / STAGGER_RATE;
  const f = t < ta ? Math.floor((t / ta) * a) : a + Math.floor((t - ta) / tpf);
  return Math.min(frames - 1, f);
}

/** How far through his stagger-and-fall a man is carried back (0..1), `t` ticks into a fall `len` long. */
export function slide(t: number, len: number): number {
  if (t <= 0) return 0;
  const u = t / Math.max(1e-6, len);
  // Most of it in the stagger (the blow's push), the rest as he topples; still by the landing.
  return out2(Math.min(1, u / 0.7));
}

/**
 * In the fight: a man weaves in and out at his foe and leans on the backs in front of him
 * (-0.3..1 of REACT.weave, toward his foe or his front), each on a cycle of his own (`phase`,
 * 0..1) whose reach swells and fades on a slower beat, so a rank never pulses as one and the line
 * is never ruler-straight. `T` in ticks. Laid under every clip he plays in the fight (his blows'
 * lunges add to it), so a blow or a flinch starting never jumps him off it.
 */
export function weave(T: number, phase: number): number {
  const p = 22 + phase * 8;
  const a = ((T / p + phase) % 1) * Math.PI * 2;
  return 0.35 + 0.65 * Math.sin(a) * (0.7 + 0.3 * Math.sin((T / p) * 0.37 * Math.PI * 2 + phase * 7));
}

/**
 * The death fall's facing: toward the man who struck him (he was fighting him, and every fall
 * that goes back then goes away from the blow), a quarter turn either way for one man in four
 * (a hash of who he is) so a rank cut down together does not lie as one stamp repeated
 * (docs/art-references/battle-dead.md). `toward` is the facing toward the blow's source; -1 when
 * no one is known to have struck him (the old way: his facing turned by the hash).
 */
export function fallFacing(i: number, toward: number, own: number): number {
  const h = Math.imul((i + 1) * 0x9e3779b1, 0x85ebca6b) >>> 0;
  if (toward < 0) return own ^ ((h >>> 13) & 3);
  const k = (h >>> 13) & 7;
  return k === 0 ? toward ^ 1 : k === 1 ? toward ^ 3 : toward;
}

/** Per-man reaction state (the scene's): who struck him last and from where, and his fall. */
export class Reactions {
  /** Tick of the latest blow that landed on him (or missile, or charge), and its direction (unit, from the striker toward him). */
  readonly blowAt: Float32Array;
  readonly blowX: Float32Array;
  readonly blowY: Float32Array;
  /** Tick of the latest blow at him that did not land (parried, or taken on the shield), and its direction. */
  readonly parryAt: Float32Array;
  readonly parryX: Float32Array;
  readonly parryY: Float32Array;
  /** Where his fall carries him (world units off where he died): the corpse lies there. */
  readonly fallX: Float32Array;
  readonly fallY: Float32Array;
  /** The latest blow of his the scene has looked at (actedAt), so each is counted once. */
  readonly seen: Float32Array;
  constructor(n: number) {
    const f = (v: number) => new Float32Array(n).fill(v);
    this.blowAt = f(-100);
    this.blowX = f(0);
    this.blowY = f(0);
    this.parryAt = f(-100);
    this.parryX = f(0);
    this.parryY = f(0);
    this.fallX = f(0);
    this.fallY = f(0);
    this.seen = f(-100);
  }
  copy(o: Reactions): void {
    for (const k of ['blowAt', 'blowX', 'blowY', 'parryAt', 'parryX', 'parryY', 'fallX', 'fallY', 'seen'] as const) this[k].set(o[k]);
  }
  /** A blow (or a missile, a charge) landed on `t` at `tick`, struck from (dx, dy) relative to him (toward the striker). */
  hurt(t: number, tick: number, dx: number, dy: number): void {
    const m = Math.sqrt(dx * dx + dy * dy);
    if (!(m > 1e-6)) return;
    this.blowAt[t] = tick;
    this.blowX[t] = -dx / m;
    this.blowY[t] = -dy / m;
  }
  /** A blow at `t` at `tick`, from (dx, dy) relative to him, did not land. */
  parried(t: number, tick: number, dx: number, dy: number): void {
    const m = Math.sqrt(dx * dx + dy * dy);
    if (!(m > 1e-6)) return;
    this.parryAt[t] = tick;
    this.parryX[t] = -dx / m;
    this.parryY[t] = -dy / m;
  }
  /** He falls now: where the fall carries him, from the latest blow if it was this tick or the last (else nowhere). */
  fall(i: number, tick: number, mounted: boolean): boolean {
    const fresh = Math.abs(tick - this.blowAt[i]!) <= 1.5;
    const d = fresh ? (mounted ? REACT.slideMounted : REACT.slide) : 0;
    this.fallX[i] = this.blowX[i]! * d;
    this.fallY[i] = this.blowY[i]! * d;
    return fresh;
  }
  /** He rose: his next fall starts afresh. */
  rise(i: number): void {
    this.fallX[i] = this.fallY[i] = 0;
  }
}
