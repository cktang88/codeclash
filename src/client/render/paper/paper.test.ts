import { describe, expect, it } from 'vitest';
import { U } from '../../../game/units.ts';
import { Anim, ANIM_COUNT, type Dir } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { budget, code, M } from './core.ts';
import { drawFacing } from './facing.ts';
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

  it('lights the mirrored facings from the top-left too', () => {
    // A part drawn for a mirror and then mirrored is the same part drawn where the mirror puts it,
    // lit as seen: the primitives follow Paper.lightX.
    const parts = (c: Paper, s: 1 | -1) => {
      c.rod([-2.37 * s, -9.13], [1.61 * s, -3.29], 0.9, 0.7, M.steel, { shine: true });
      c.rod([0.43 * s, -12.1], [-3.17 * s, -10.33], 0.8, 0.8, M.wood);
      c.blob([0.71 * s, -6.17], 1.63, 1.21, M.bone, { shine: true });
    };
    const viaMirror = new Paper();
    viaMirror.begin(8);
    expect(drawFacing(viaMirror, 'sw', ['se', 'ne'], () => parts(viaMirror, 1))).toBe(true);
    expect(viaMirror.lightX).toBe(1);
    const direct = new Paper();
    direct.begin(8);
    parts(direct, -1);
    expect(Array.from(viaMirror.pix)).toEqual(Array.from(direct.pix));
    // And the light is on the left of each part: its lit tone sits left of its shade.
    const at = (c: Paper, t: number) => {
      let sx = 0, n = 0;
      for (let i = 0; i < c.pix.length; i++) if (c.pix[i] === code(M.bone, t)) (sx += i % c.CW, n++);
      return sx / n;
    };
    expect(at(viaMirror, 3)).toBeLessThan(at(viaMirror, 1));
    // A whole figure: the SW frame is not SE's colours mirrored any more, only its silhouette.
    const se = paintPaper('templar', U.Archers, 8, Anim.Idle, 0, 0, 215, new Paper())!;
    const sw = paintPaper('templar', U.Archers, 8, Anim.Idle, 0, 1, 215, new Paper())!;
    let same = 0, n = 0;
    for (let y = 0; y < se.height; y++)
      for (let x = 0; x < se.width; x++) {
        const i = (y * se.width + x) * 4, j = (y * se.width + (se.width - 1 - x)) * 4;
        if (se.pixels[j + 3] !== 255) continue;
        n++;
        if (se.pixels[j] === sw.pixels[i] && se.pixels[j + 1] === sw.pixels[i + 1] && se.pixels[j + 2] === sw.pixels[i + 2]) same++;
      }
    expect(same / n).toBeLessThan(0.8);
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
