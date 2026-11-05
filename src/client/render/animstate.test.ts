import { describe, expect, it } from 'vitest';
import { Anim, ANIM_COUNT } from './contract.ts';
import { FRAMES, TICKS } from './frames.ts';
import { AnimTrack, blankFacts, pickAnim, settleFor, type AnimFacts } from './animstate.ts';

const frames = Uint16Array.from(FRAMES);
const tpf = Float32Array.from(TICKS);
const len = (a: Anim) => FRAMES[a] * TICKS[a];
const facts = (o: Partial<AnimFacts>): AnimFacts => ({ ...blankFacts(), top: 10, actLen: len(Anim.Attack), hitLen: len(Anim.Hit), ...o });

/** Drives a track for one man through `want(T)` at 4 draws a tick; returns [anim, frame] per draw. */
function run(want: (T: number) => Anim, from: number, to: number, start: (T: number) => number = () => 0, phase = 0, track = new AnimTrack(1)): [Anim, number][] {
  const out: [Anim, number][] = [];
  for (let T = from; T < to; T += 0.25) {
    const a = track.resolve(0, want(T), T, start(T), frames, 0, tpf, phase);
    out.push([a, track.frame(0, T, frames[a]!, tpf[a]!)]);
  }
  return out;
}

describe('pickAnim', () => {
  it('has a band of hysteresis on the walk and the run', () => {
    expect(pickAnim(facts({ speed: 2.5 }), Anim.Idle)).toBe(Anim.Idle);
    expect(pickAnim(facts({ speed: 2.5 }), Anim.Walk)).toBe(Anim.Walk);
    expect(pickAnim(facts({ speed: 11.5 }), Anim.Walk)).toBe(Anim.Walk);
    expect(pickAnim(facts({ speed: 11.5 }), Anim.Run)).toBe(Anim.Run);
    expect(pickAnim(facts({ speed: 12.5 }), Anim.Walk)).toBe(Anim.Run);
  });
  it('puts blows, flinches and falls first, and walks a man in the fight in his guard', () => {
    expect(pickAnim(facts({ act: 1, speed: 20 }), Anim.Run)).toBe(Anim.Attack);
    expect(pickAnim(facts({ hit: 0.5 }), Anim.Brace)).toBe(Anim.Hit);
    expect(pickAnim(facts({ dead: true, act: 1 }), Anim.Idle)).toBe(Anim.Die);
    expect(pickAnim(facts({ speed: 5, inFight: true }), Anim.Brace)).toBe(Anim.Advance);
    expect(pickAnim(facts({ guard: true }), Anim.Advance)).toBe(Anim.Brace);
    expect(pickAnim(facts({ guard: true, fighting: false }), Anim.Advance)).toBe(Anim.Idle);
  });
});

describe('AnimTrack', () => {
  it('keeps walking through the sim pausing a man one tick in four', () => {
    // Speed 0 every 4th tick (the sim's march), as replayed from demo battles.
    const seq = run((T) => (Math.floor(T) % 4 === 3 ? Anim.Idle : Anim.Walk), 0, 40);
    expect(seq.every(([a]) => a === Anim.Walk)).toBe(true);
  });
  it('stops once the stop is called for long enough', () => {
    const seq = run((T) => (T < 10 ? Anim.Walk : Anim.Idle), 0, 20);
    const firstIdle = seq.findIndex(([a]) => a === Anim.Idle) * 0.25;
    expect(firstIdle).toBeGreaterThanOrEqual(10 + settleFor(Anim.Walk, Anim.Idle) - 0.25);
    expect(firstIdle).toBeLessThan(10 + settleFor(Anim.Walk, Anim.Idle) + 0.5);
  });
  it('carries the stride from walk to run to guard-walk: no frame is skipped or repeated backwards', () => {
    const want = (T: number) => (T < 10 ? Anim.Walk : T < 20 ? Anim.Run : Anim.Advance);
    const seq = run(want, 0, 30, () => 0, 3.3);
    for (let k = 1; k < seq.length; k++) {
      const d = (seq[k]![1] - seq[k - 1]![1] + 12) % 12;
      expect(d === 0 || d === 1, `draw ${k}: ${seq[k - 1]} -> ${seq[k]}`).toBe(true);
    }
    expect(seq.some(([a]) => a === Anim.Run) && seq.some(([a]) => a === Anim.Advance)).toBe(true);
  });
  it('enters the guard at its frame 0 when a blow ends', () => {
    const want = (T: number) => (T >= 5 && T < 5 + len(Anim.Attack) ? Anim.Attack : Anim.Brace);
    const seq = run(want, 0, 15, () => 5, 2.7);
    const k = seq.findIndex(([a], j) => j > 0 && a === Anim.Brace && seq[j - 1]![0] === Anim.Attack);
    expect(k).toBeGreaterThan(0);
    expect(seq[k]![1]).toBe(0);
    expect(seq[k - 1]![1]).toBe(FRAMES[Anim.Attack] - 1);
  });
  it('plays a flinch that came due during a blow whole, from its first frame', () => {
    const blowEnd = 5 + len(Anim.Attack);
    const hitAt = blowEnd - 1;
    const want = (T: number) => (T >= 5 && T < blowEnd ? Anim.Attack : T - hitAt < len(Anim.Hit) ? Anim.Hit : Anim.Brace);
    const seq = run(want, 0, 15, (T) => (T < blowEnd ? 5 : hitAt));
    const hits = seq.filter(([a]) => a === Anim.Hit);
    expect(hits[0]![1]).toBe(0);
    expect(hits.length * 0.25).toBeGreaterThanOrEqual(len(Anim.Hit) - 0.25);
    expect(hits.at(-1)![1]).toBe(FRAMES[Anim.Hit] - 1);
  });
  it('keeps a loop phase of its own when entered from rest (a drilled block steps together)', () => {
    const t = new AnimTrack(2);
    run(() => Anim.Walk, 0, 3, () => 0, 1.5, t);
    const a = t.frame(0, 2.75, 12, TICKS[Anim.Walk]);
    expect(a).toBe(Math.floor((2.75 + 1.5) / TICKS[Anim.Walk]) % 12);
  });
  it('starts afresh when time runs backwards', () => {
    const t = new AnimTrack(1);
    run(() => Anim.Walk, 10, 20, () => 0, 0, t);
    expect(t.resolve(0, Anim.Idle, 2, 0, frames, 0, tpf, 0)).toBe(Anim.Idle);
  });
  it('reads the frame tables from a kind offset', () => {
    const t = new AnimTrack(1);
    const many = new Uint16Array(ANIM_COUNT * 2);
    many.set(FRAMES, ANIM_COUNT);
    expect(t.resolve(0, Anim.Brace, 0, 0, many, ANIM_COUNT, tpf, 0)).toBe(Anim.Brace);
  });
});
