// A sheet painted in two goes (sprites128.ts paintSheetProgressive): the whole sheet is the same,
// byte for byte, as one painted in one go, and the partial one on the way has the animations seen
// most, borrows a painted frame for Run, later blows and Hit, and leaves Die and Dead to the grid.

import { describe, expect, it } from 'vitest';
import { Anim, type KindSheet } from './contract.ts';
import { FRAMES } from './frames.ts';
import { blowsOf, paintSheet, paintSheetProgressive, slotOf } from './sprites128.ts';
import { U } from '../../game/units.ts';

const rect = (s: KindSheet, slot: number): number[] => [...s.rects.subarray(slot * 6, slot * 6 + 6)];

describe('progressive sheets', () => {
  for (const [faction, kind] of [
    ['templar', U.Spearmen],
    ['undead', U.Archers],
  ] as const)
    it(`${faction} kind ${kind}: the whole sheet is unchanged; the partial one stands in`, () => {
      const one = paintSheet(faction, 200, kind, 2);
      const parts: KindSheet[] = [];
      const two = paintSheetProgressive(faction, 200, kind, 2, (p) => parts.push(p));
      expect(two.width).toBe(one.width);
      expect(two.height).toBe(one.height);
      expect(Buffer.from(two.pixels).equals(Buffer.from(one.pixels))).toBe(true);
      expect([...two.rects]).toEqual([...one.rects]);
      expect(two.partial).toBeUndefined();

      expect(parts.length).toBe(1);
      const p = parts[0]!;
      expect(p.partial).toBe(true);
      const blows = blowsOf(faction, kind);
      for (const dir of [0, 1, 2, 3] as const) {
        for (const a of [Anim.Idle, Anim.Brace, Anim.Walk, Anim.Attack])
          for (let f = 0; f < FRAMES[a]; f++) expect(rect(p, slotOf(kind, a, f, dir, blows))[2]).toBeGreaterThan(0);
        // Run is the Walk, a later blow the first, Hit the Brace.
        for (let f = 0; f < FRAMES[Anim.Run]; f++) expect(rect(p, slotOf(kind, Anim.Run, f, dir, blows))).toEqual(rect(p, slotOf(kind, Anim.Walk, f, dir, blows)));
        if (blows > 1) expect(rect(p, slotOf(kind, Anim.Attack, FRAMES[Anim.Attack] + 3, dir, blows))).toEqual(rect(p, slotOf(kind, Anim.Attack, 3, dir, blows)));
        expect(rect(p, slotOf(kind, Anim.Hit, 0, dir, blows))).toEqual(rect(p, slotOf(kind, Anim.Brace, 0, dir, blows)));
        // Die and Dead: from the grid until the whole sheet lands.
        expect(rect(p, slotOf(kind, Anim.Die, 2, dir, blows))[2]).toBe(0);
        expect(rect(p, slotOf(kind, Anim.Dead, 0, dir, blows))[2]).toBe(0);
        // Every frame it has is a frame of the whole sheet, the same pixels.
        const r = rect(p, slotOf(kind, Anim.Idle, 1, dir, blows));
        const q = rect(two, slotOf(kind, Anim.Idle, 1, dir, blows));
        const px = (s: KindSheet, [x, y, w, h]: number[]) => {
          const u = new Uint32Array(s.pixels.buffer, s.pixels.byteOffset, s.width * s.height);
          const out: number[] = [];
          for (let j = 0; j < h!; j++) out.push(...u.subarray((y! + j) * s.width + x!, (y! + j) * s.width + x! + w!));
          return out;
        };
        expect(r.slice(2)).toEqual(q.slice(2));
        expect(px(p, r)).toEqual(px(two, q));
      }
    }, 120000);
});
