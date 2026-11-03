// Several melee blows per kind (contract.ts Atlas.blows): registration, slots, painting.

import { describe, expect, it } from 'vitest';
import { U } from '../../../game/units.ts';
import { Anim, ANIM_COUNT, type Dir } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { gridColOf, gridCols, paintGrid, paintSheet, slotCount, slotOf } from '../sprites128.ts';
import { M, Paper } from './core.ts';
import { paintPaper, paperBlows, registerPaperKind } from './index.ts';
import { along, FOOT0, poser, type FootPose } from './rig.ts';
import { footAnimations, footSkeleton, skeletonKind, stickParts, type SkeletonRig } from './skeleton.ts';

const N = FRAMES[Anim.Attack];
const same = (a: { pixels: Uint8ClampedArray }, b: { pixels: Uint8ClampedArray }) => Buffer.from(a.pixels).equals(Buffer.from(b.pixels));

// A bone rig with three blows: the standard attack, and two other clips standing in for a
// thrust and a backhand (what they are does not matter here, only that they differ).
const skel = footSkeleton({ name: 'blows-test' });
const clips = footAnimations();
const atts = stickParts(skel, { body: M.bone, cloth: M.rag, metal: M.steel, team: M.team, hide: M.leather, wood: M.wood });
const rig3: SkeletonRig = { skel, atts, clips, attacks: [clips[Anim.Attack]!, clips[Anim.Shoot]!, clips[Anim.Hit]!] };
const rig1: SkeletonRig = { skel, atts, clips };

// A key-set kind with three blows: the weapon arm at three different heights.
const pose = poser(FOOT0);
const swing = (bl0: number, bl1: number): FootPose[] => [pose({ bl: bl0, nu: 20 }), pose({ bl: bl1, nu: 80 }), pose({})];
const drawMan = (c: Paper, p: FootPose) => {
  c.rod([0, -1], [0, -11], 1.2, 1.0, M.bone);
  c.rod([0, -9], along([0, -9], p.bl, 8), 0.6, 0.5, M.steel);
};

describe('several melee blows', () => {
  registerPaperKind('blows-test', 0, skeletonKind(rig3));
  registerPaperKind('blows-test', 1, skeletonKind(rig1));
  registerPaperKind<FootPose>('blows-test', 2, {
    body: 'foot',
    keys: { poses: { [Anim.Idle]: [pose({})] }, attacks: [swing(160, 90), swing(200, 60), swing(120, 30)] },
    draw: (c, p) => drawMan(c, p),
  });

  it('reports the blows a kind registered', () => {
    expect(paperBlows('blows-test', 0)).toBe(3);
    expect(paperBlows('blows-test', 1)).toBe(1);
    expect(paperBlows('blows-test', 2)).toBe(3);
    // Every faction kind has one to three blows (README "Several blows": keep it to 2-3).
    for (const f of ['templar', 'samurai', 'undead'])
      for (let k = 0; k < 11; k++) {
        expect(paperBlows(f, k), `${f} ${k}`).toBeGreaterThanOrEqual(1);
        expect(paperBlows(f, k), `${f} ${k}`).toBeLessThanOrEqual(3);
      }
  });

  it('gives every blow its own slots and grid cells, blow 0 in the classic ones', () => {
    for (const kind of [U.HeavyInfantry, U.Archers]) {
      const seen = new Set<number>(), cells = new Set<string>();
      for (const dir of [0, 1, 2, 3] as Dir[])
        for (let a = 0; a < ANIM_COUNT; a++) {
          if (a === Anim.Shoot && kind !== U.Archers) continue;
          const n = a === Anim.Attack ? 3 * N : FRAMES[a]!;
          for (let f = 0; f < n; f++) {
            const s = slotOf(kind, a as Anim, f, dir, 3);
            expect(seen.has(s), `slot ${a}/${f}/${dir}`).toBe(false);
            seen.add(s);
            expect(s).toBeLessThan(slotCount(3));
            const col = gridColOf(kind, a as Anim, f, dir, 3);
            expect(col).toBeLessThan(gridCols(3));
            const cell = `${dir}:${col}`;
            expect(cells.has(cell)).toBe(false);
            cells.add(cell);
            // Blow 0 (and every other anim) is where it always was.
            if (f < FRAMES[a]!) expect(s).toBe(slotOf(kind, a as Anim, f, dir));
          }
        }
    }
  });

  it('paints different frames for each blow', () => {
    for (const kind of [0, 2])
      for (const dir of [0, 3] as Dir[]) {
        const fr = [0, 1, 2].map((b) => paintPaper('blows-test', kind, 4, Anim.Attack, b * N + 5, dir, 215, new Paper())!);
        expect(same(fr[0]!, fr[1]!), `kind ${kind} dir ${dir} blows 0/1`).toBe(false);
        expect(same(fr[0]!, fr[2]!)).toBe(false);
        expect(same(fr[1]!, fr[2]!)).toBe(false);
        // Blow 0 is the kind's plain attack.
        if (kind === 0) expect(same(fr[0]!, paintPaper('blows-test', 1, 4, Anim.Attack, 5, dir, 215, new Paper())!)).toBe(true);
      }
  });

  it('packs every blow into the sheet; a one-blow kind is unchanged', () => {
    // On a real faction's kind slot, so the sheet painter takes it (this file's registrations only).
    registerPaperKind('undead', U.HeavyInfantry, skeletonKind(rig3));
    const sheet = paintSheet('undead', 215, U.HeavyInfantry, 2);
    expect(sheet.rects.length).toBe(slotCount(3) * 6);
    const tile = (slot: number) => {
      const r = sheet.rects.subarray(slot * 6, slot * 6 + 6);
      const out: number[] = [];
      for (let y = 0; y < r[3]!; y++) for (let x = 0; x < r[2]!; x++) out.push(...sheet.pixels.subarray(((r[1]! + y) * sheet.width + r[0]! + x) * 4, ((r[1]! + y) * sheet.width + r[0]! + x) * 4 + 4));
      return [r[2], r[3], r[4], r[5], ...out].join(',');
    };
    const t = [0, 1, 2].map((b) => tile(slotOf(U.HeavyInfantry, Anim.Attack, b * N + 6, 0, 3)));
    expect(new Set(t).size).toBe(3);
    expect(paintGrid('undead', 215, U.HeavyInfantry).width).toBe(gridCols(3) * 48);

    // The same rig with its single attack, registered plainly or as a one-item `attacks`, paints
    // the very same sheet as before blows existed: same size, same slots, same pixels.
    registerPaperKind('undead', U.HeavyInfantry, skeletonKind(rig1));
    const plain = paintSheet('undead', 215, U.HeavyInfantry, 2);
    registerPaperKind('undead', U.HeavyInfantry, skeletonKind({ ...rig1, attacks: [clips[Anim.Attack]!] }));
    const listed = paintSheet('undead', 215, U.HeavyInfantry, 2);
    expect(plain.rects.length).toBe(slotCount(1) * 6);
    expect(Array.from(listed.rects)).toEqual(Array.from(plain.rects));
    expect(same(listed, plain)).toBe(true);
    expect(paintGrid('undead', 215, U.HeavyInfantry).width).toBe(gridCols(1) * 48);
  }, 60_000);
});
