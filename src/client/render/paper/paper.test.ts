import { describe, expect, it } from 'vitest';
import { U } from '../../../game/units.ts';
import { Anim, ANIM_COUNT, type Dir } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { budget } from './core.ts';
import { paintPaper, paperKindFor, paperSupports, Paper } from './index.ts';

const opaque = (f: { pixels: Uint8ClampedArray }, i: number) => f.pixels[i * 4 + 3] === 255;

describe('paper-doll painter', () => {
  it('registers the Grave Legionary with every animation, facing and level', () => {
    expect(paperKindFor('undead', U.HeavyInfantry)).toBeDefined();
    // Every faction's kinds are drawn on paper now.
    for (const f of ['undead', 'templar', 'samurai'] as const) for (let k = 0; k < 11; k++) expect(paperKindFor(f, k), `${f} kind ${k}`).toBeDefined();
    for (let a = 0; a < ANIM_COUNT; a++)
      for (const dir of [0, 1, 2, 3] as Dir[])
        for (const level of [1, 2, 4, 8]) expect(paperSupports('undead', U.HeavyInfantry, a as Anim, dir, level)).toBe(a !== Anim.Shoot);
  });

  it('paints every frame at levels 1 and 2 with hard alpha, within the colour budget', () => {
    for (const level of [1, 2]) {
      const b = budget(level);
      for (const dir of [0, 1, 2, 3] as Dir[])
        for (let a = 0; a < ANIM_COUNT; a++) {
          if (a === Anim.Shoot) continue;
          for (let fr = 0; fr < FRAMES[a]!; fr++) {
            const f = paintPaper('undead', U.HeavyInfantry, level, a as Anim, fr, dir, 215)!;
            const colours = new Set<number>();
            let n = 0, partial = 0;
            for (let i = 0; i < f.width * f.height; i++) {
              const al = f.pixels[i * 4 + 3]!;
              if (al !== 0 && al !== 255) partial++;
              if (al === 255) {
                n++;
                colours.add((f.pixels[i * 4]! << 16) | (f.pixels[i * 4 + 1]! << 8) | f.pixels[i * 4 + 2]!);
              }
            }
            expect(partial).toBe(0);
            expect(n).toBeGreaterThan(20 * level);
            expect(colours.size).toBeLessThanOrEqual(b.fill + b.outline);
          }
        }
    }
  }, 60_000);

  it('mirrors south-east into south-west about the foot point', () => {
    const se = paintPaper('undead', U.HeavyInfantry, 4, Anim.Idle, 0, 0, 215, new Paper())!;
    const sw = paintPaper('undead', U.HeavyInfantry, 4, Anim.Idle, 0, 1, 215, new Paper())!;
    expect(sw.ax).toBe(se.ax);
    let bad = 0;
    for (let y = 0; y < se.height; y++)
      for (let x = 0; x < se.width; x++) if (opaque(sw, y * se.width + (se.width - 1 - x)) !== opaque(se, y * se.width + x)) bad++;
    expect(bad).toBe(0);
  });

  it('is deterministic and independent of the surface it paints on', () => {
    const a = paintPaper('undead', U.HeavyInfantry, 8, Anim.Attack, 5, 3, 215, new Paper())!;
    const b = paintPaper('undead', U.HeavyInfantry, 8, Anim.Attack, 5, 3, 215, new Paper())!;
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
  });

  it('draws a back view for the north facings, not the front mirrored', () => {
    const se = paintPaper('undead', U.HeavyInfantry, 8, Anim.Idle, 0, 0, 215, new Paper())!;
    const ne = paintPaper('undead', U.HeavyInfantry, 8, Anim.Idle, 0, 3, 215, new Paper())!;
    let diff = 0;
    for (let i = 0; i < se.width * se.height; i++) if (opaque(se, i) !== opaque(ne, i)) diff++;
    expect(diff).toBeGreaterThan(200);
  });
});
