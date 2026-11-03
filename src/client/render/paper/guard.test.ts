// Blows from the guard (guard.ts): every melee blow of a foot kind starts and ends on the guard's
// first frame exactly, so the renderer can go guard -> blow -> guard without a pop.

import { describe, expect, it } from 'vitest';
import { Anim, type Dir } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { paintPaper, paperBlows, paperKindFor, Paper } from './index.ts';

const N = FRAMES[Anim.Attack];
const same = (a: { pixels: Uint8ClampedArray }, b: { pixels: Uint8ClampedArray }) => Buffer.from(a.pixels).equals(Buffer.from(b.pixels));
/** Kinds whose Attack is not a blow from the guard: the Wraith-Wardens' point-blank shot (docs/art-references/guards.md). */
const NOT_FROM_GUARD = new Set(['undead:3']);

describe('blows from the guard', () => {
  it("paints each foot kind's blows' first and last frames as the guard's first frame", () => {
    const bad: string[] = [];
    let n = 0;
    for (const f of ['templar', 'samurai', 'undead'])
      for (let k = 0; k < 11; k++) {
        if (paperKindFor(f, k)!.body !== 'foot' || NOT_FROM_GUARD.has(`${f}:${k}`)) continue;
        for (let b = 0; b < paperBlows(f, k); b++)
          for (const dir of [0, 1, 2, 3] as Dir[]) {
            const guard = paintPaper(f, k, 2, Anim.Brace, 0, dir, 215, new Paper())!;
            for (const fr of [0, N - 1]) {
              n++;
              if (!same(paintPaper(f, k, 2, Anim.Attack, b * N + fr, dir, 215, new Paper())!, guard)) bad.push(`${f} ${k} blow ${b} dir ${dir} frame ${fr}`);
            }
          }
      }
    expect(n).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  }, 120_000);
});
