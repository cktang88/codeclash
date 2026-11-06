import { describe, expect, it } from 'vitest';
import { dieFrame, dieLen, fallFacing, lunge, Reactions, recoil, slide, STAGGER, weave } from './react.ts';

describe('react: the body answers the fight', () => {
  it('a blow leaves the guard and comes home: back in the chamber, in at the strike, 0 at both ends', () => {
    expect(lunge(0)).toBe(0);
    expect(lunge(1)).toBe(0);
    expect(lunge(0.2)).toBeLessThan(0);
    expect(lunge(0.55)).toBeCloseTo(1, 5);
    // No jumps: neighbouring frames of a 12-frame blow differ by less than half the lunge.
    for (let f = 0; f < 48; f++) expect(Math.abs(lunge((f + 1) / 48) - lunge(f / 48))).toBeLessThan(0.5);
  });

  it('a recoil goes out fast and comes back slowly, and is gone', () => {
    expect(recoil(-1)).toBe(0);
    expect(recoil(0)).toBe(0);
    expect(recoil(0.7)).toBeCloseTo(1, 5);
    expect(recoil(2)).toBeGreaterThan(0);
    expect(recoil(4.5)).toBe(0);
  });

  it('the fall: the stagger frames are held longer, every frame shown in order, the last held', () => {
    const n = 12, tpf = 0.42;
    const len = dieLen(n, tpf);
    expect(len).toBeGreaterThan(n * tpf);
    let prev = 0;
    const seen = new Set<number>();
    for (let t = 0; t <= len + 2; t += 0.05) {
      const f = dieFrame(t, n, tpf);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
      seen.add(f);
    }
    expect(seen.size).toBe(n);
    expect(dieFrame(len + 1, n, tpf)).toBe(n - 1);
    // The stagger takes longer than the topple's first frames would at painted speed.
    const tStag = [...Array(200).keys()].map((k) => k * 0.05).find((t) => dieFrame(t, n, tpf) >= STAGGER)!;
    expect(tStag).toBeGreaterThan(STAGGER * tpf);
    expect(slide(0, len)).toBe(0);
    expect(slide(len, len)).toBe(1);
  });

  it('a falling man faces the man who struck him, but not every man of a rank', () => {
    const toward = 2;
    let same = 0;
    for (let i = 0; i < 400; i++) {
      const d = fallFacing(i, toward, 0);
      expect(d === toward || d === (toward ^ 1) || d === (toward ^ 3)).toBe(true);
      if (d === toward) same++;
    }
    expect(same).toBeGreaterThan(260);
    expect(same).toBeLessThan(380);
  });

  it('records blows from the striker and carries the dead back from the blow struck', () => {
    const r = new Reactions(3);
    r.hurt(1, 10, 3, 4); // the striker stands at (+3, +4) of him
    expect(r.blowX[1]).toBeCloseTo(-0.6);
    expect(r.blowY[1]).toBeCloseTo(-0.8);
    expect(r.fall(1, 10, false)).toBe(true);
    expect(Math.hypot(r.fallX[1]!, r.fallY[1]!)).toBeGreaterThan(1);
    // Long after the blow: he falls where he stands.
    expect(r.fall(1, 40, false)).toBe(false);
    expect(r.fallX[1]).toBeCloseTo(0);
    r.parried(2, 5, 0, 0); // no direction: nothing recorded
    expect(r.parryAt[2]).toBe(-100);
  });

  it('the press: front-rankers weave both ways, the ranks behind only lean in', () => {
    let lo = 1, hi = -1, rlo = 1;
    for (let t = 0; t < 200; t += 0.25) {
      lo = Math.min(lo, weave(t, 0.3, true));
      hi = Math.max(hi, weave(t, 0.3, true));
      rlo = Math.min(rlo, weave(t, 0.3, false));
    }
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0.6);
    expect(rlo).toBeGreaterThanOrEqual(0);
  });
});
