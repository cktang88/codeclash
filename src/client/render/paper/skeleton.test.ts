import { describe, expect, it } from 'vitest';
import {
  acosDeg, angleOf, animationFromPoses, atan2Deg, bonesFromJoints, cosStep, curveAt, EASE, emptyLocals, evaluate, mixLocals, sampleAnimation, sampleClip, sinStep, snapStep, type AnimationData, type SkeletonData,
} from './skeleton.ts';
import type { P2 } from './core.ts';

describe('skeleton: maths', () => {
  it('has an exact sine table for the 48 snapped angles', () => {
    for (let k = 0; k < 48; k++) {
      expect(Math.abs(sinStep(k) - Math.sin((k * 7.5 * Math.PI) / 180))).toBeLessThan(1e-15);
      expect(Math.abs(cosStep(k) - Math.cos((k * 7.5 * Math.PI) / 180))).toBeLessThan(1e-15);
    }
    expect([sinStep(0), sinStep(12), sinStep(24), sinStep(36), sinStep(4)]).toEqual([0, 1, 0, -1, 0.5]);
  });

  it('computes atan2 and acos by arithmetic, to well under a snap step', () => {
    for (let i = 0; i < 400; i++) {
      const y = Math.sin(i * 1.7) * (1 + i), x = Math.cos(i * 0.9) * (2 + (i % 7));
      expect(Math.abs(atan2Deg(y, x) - (Math.atan2(y, x) * 180) / Math.PI)).toBeLessThan(1e-9);
    }
    for (const c of [-1, -0.5, 0, 0.3, 0.99, 1]) expect(Math.abs(acosDeg(c) - (Math.acos(c) * 180) / Math.PI)).toBeLessThan(1e-9);
    expect(angleOf(0, 1)).toBe(0);
    expect(angleOf(1, 0)).toBe(90);
    expect(angleOf(0, -1)).toBe(180);
  });

  it('snaps angles to 7.5° with hysteresis against the previous frame', () => {
    expect(snapStep(3.7)).toBe(0);
    expect(snapStep(3.76)).toBe(1);
    // Held by the previous step until 0.6 steps (4.5°) away.
    expect(snapStep(4.4, 0)).toBe(0);
    expect(snapStep(4.6, 0)).toBe(1);
    expect(snapStep(-4.4, 0)).toBe(0);
    expect(snapStep(-4.6, 0)).toBe(47);
    // Wraps around the circle.
    expect(snapStep(358, 0)).toBe(0);
    expect(snapStep(-30)).toBe(44);
    // A raw angle wobbling across a half step never flickers.
    let prev: number | undefined;
    const got: number[] = [];
    for (let i = 0; i < 20; i++) {
      prev = snapStep(3.75 + (i % 2 ? 0.5 : -0.5), prev);
      got.push(prev);
    }
    expect(new Set(got).size).toBe(1);
  });

  it('evaluates linear, stepped and bezier curves', () => {
    expect(curveAt('linear', 0.3)).toBe(0.3);
    expect(curveAt('stepped', 0.99)).toBe(0);
    expect(curveAt(EASE, 0)).toBeCloseTo(0, 6);
    expect(curveAt(EASE, 1)).toBeCloseTo(1, 6);
    expect(curveAt(EASE, 0.5)).toBeCloseTo(0.5, 6);
    expect(curveAt(EASE, 0.1)).toBeLessThan(0.1);
    let last = -1;
    for (let u = 0; u <= 1; u += 0.05) {
      const v = curveAt([0.6, 0, 1, 1], u);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe('skeleton: evaluation', () => {
  const leg: SkeletonData = {
    name: 'leg',
    body: 'foot',
    bones: bonesFromJoints([
      { name: 'root', from: [0, 0], to: [0, 0] },
      { name: 'hip', parent: 'root', from: [0, -6], to: [0, -6] },
      { name: 'thigh', parent: 'hip', from: [0, -6], to: [0.4, -3] },
      { name: 'shin', parent: 'thigh', from: [0.4, -3], to: [0, -0.1] },
      { name: 'target', parent: 'root', from: [0, -0.1], to: [0, -0.1] },
    ]),
    slots: [],
    ik: [{ name: 'leg', bones: ['thigh', 'shin'], target: 'target', bend: 1, mix: 1 }],
  };

  it('puts every joint back on its rest position at rest, on whole pixels', () => {
    for (const L of [1, 2, 4, 8]) {
      const p = evaluate(leg, emptyLocals(), { level: L, facing: 'se', noIk: true });
      expect(p.byName.thigh!.x).toBe(0);
      expect(p.byName.shin!.x * L).toBe(Math.round(0.4 * L));
      for (const b of p.bones) for (const v of [b.x, b.y, b.tx, b.ty]) expect(Number.isInteger(Math.round(v * L * 1e9) / 1e9)).toBe(true);
    }
  });

  it('reaches an IK target within a pixel and bends the knee forward', () => {
    for (const L of [1, 2, 4, 8])
      for (const [tx, ty] of [[1, -0.5], [-1.2, -0.3], [0.5, -1.5], [2, -1]] as P2[]) {
        const p = evaluate(leg, { ...emptyLocals(), bones: { target: { x: tx, y: ty + 0.1 } } }, { level: L, facing: 'se' });
        const s = p.byName.shin!, t = p.byName.target!;
        expect(Math.hypot(s.tx - t.x, s.ty - t.y) * L).toBeLessThanOrEqual(1.5);
        expect(p.byName.thigh!.tx).toBeGreaterThan(Math.min(p.byName.thigh!.x, t.x) - 0.01);
      }
  });
});

describe('skeleton: data model', () => {
  const anim: AnimationData = {
    name: 'test',
    frames: 8,
    loop: true,
    bones: { a: { rotate: [{ f: 0, v: 0 }, { f: 4, v: 40, c: 'stepped' }], translate: [{ f: 2, v: [1, 2] }] } },
    events: [{ f: 3, name: 'smear', len: 2 }],
  };

  it('samples looping keys, wrapping from the last key back to the first', () => {
    expect(sampleAnimation(anim, 2).bones.a!.rot).toBe(20);
    expect(sampleAnimation(anim, 5).bones.a!.rot).toBe(40); // stepped
    expect(sampleAnimation(anim, 8).bones.a!.rot).toBe(0);
    expect(sampleAnimation(anim, 2).bones.a!.x).toBe(1);
    expect(sampleAnimation(anim, 4).events.map((e) => e.name)).toEqual(['smear']);
    expect(sampleAnimation(anim, 5).events).toEqual([]);
  });

  it('mixes an overlay additively or by replacing', () => {
    const base = sampleAnimation(anim, 2);
    const breath = sampleAnimation({ name: 'b', frames: 8, loop: true, bones: { a: { translate: [{ f: 0, v: [0, -1] }] }, b: { rotate: [{ f: 0, v: 10 }] } } }, 0);
    const add = mixLocals(base, breath, 0.5, 'add');
    expect(add.bones.a).toEqual({ rot: 20, x: 1, y: 1.5 });
    expect(add.bones.b).toEqual({ rot: 5 });
    const rep = mixLocals(base, breath, 1, 'replace');
    expect(rep.bones.a).toEqual({ rot: 20, x: 0, y: -1 });
    expect(sampleClip([{ anim }, { anim: { name: 'b', frames: 8, loop: true, bones: { a: { rotate: [{ f: 0, v: 1 }] } } } }], 2).bones.a!.rot).toBe(21);
  });

  it('builds bones from rest joints and authors animations from poses', () => {
    const bones = bonesFromJoints([
      { name: 'root', from: [0, 0], to: [0, 0] },
      { name: 'thigh', parent: 'root', from: [0, -6], to: [0.5, -3], facing: { ne: { from: [1, -6], to: [1.5, -3] } } },
      { name: 'shin', parent: 'thigh', from: [0.5, -3], to: [0, 0] },
    ]);
    expect(bones[1]!.len).toBeCloseTo(Math.hypot(0.5, 3), 5);
    expect(bones[1]!.facing?.ne).toEqual({ x: 1, y: -6, rot: bones[1]!.rot });
    expect(bones[2]!.parent).toBe('thigh');
    const a = animationFromPoses('walk', 12, true, [{ f: 0, bones: { thigh: { rot: 10 } } }, { f: 6, bones: { shin: { y: 1 } } }]);
    expect(a.bones!.thigh!.rotate).toEqual([{ f: 0, v: 10 }, { f: 6, v: 0 }]);
    expect(a.bones!.shin!.translate).toEqual([{ f: 0, v: [0, 0] }, { f: 6, v: [0, 1] }]);
  });
});
