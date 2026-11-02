import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jointPositions, parseBvh } from '../../../../../scripts/mocap/bvh.ts';
import { BONE_ORDER, formatClip, project, type MotionClip as OutClip } from '../../../../../scripts/mocap/bvh-to-paper.ts';
import { Anim } from '../../contract.ts';
import { FRAMES, LOOPS } from '../../frames.ts';
import { MOTION, MOTION_FOR } from './index.ts';

const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  JOINT Knee
  {
    OFFSET 0 -10 0
    CHANNELS 3 Zrotation Yrotation Xrotation
    End Site
    {
      OFFSET 0 -10 0
    }
  }
}
MOTION
Frames: 2
Frame Time: .0083333
0 20 0 0 0 0 0 0 0
1 20 0 0 0 0 90 0 0
`;

describe('BVH reader', () => {
  const b = parseBvh(BVH);
  it('reads the hierarchy, channels and frames', () => {
    expect(b.joints.map((j) => j.name)).toEqual(['Hips', 'Knee', 'Knee_End']);
    expect(b.frames.length).toBe(2);
    expect(Math.round(1 / b.frameTime)).toBe(120);
  });
  it('runs forward kinematics with the channel order', () => {
    const p0 = jointPositions(b, 0);
    expect(p0[2]).toEqual([0, 0, 0]);
    // a 90° Z turn at the knee swings the shin from straight down to +x
    const p1 = jointPositions(b, 1);
    expect(p1[2]![0]).toBeCloseTo(11);
    expect(p1[2]![1]).toBeCloseTo(10);
  });
});

describe('isometric projection', () => {
  it('walks SE toward screen right and down, NE toward screen right and up', () => {
    const se = project(1, 0, 0, 'se'), ne = project(1, 0, 0, 'ne');
    expect(se[0]).toBeGreaterThan(0.8);
    expect(se[1]).toBeGreaterThan(0);
    expect(ne[0]).toBeGreaterThan(0.8);
    expect(ne[1]).toBeLessThan(0);
  });
  it('puts the right (weapon) side nearer the viewer: screen left in SE, screen right in NE', () => {
    const se = project(0, 1, 0, 'se'), ne = project(0, 1, 0, 'ne');
    expect(se[0]).toBeLessThan(0);
    expect(ne[0]).toBeGreaterThan(0);
    expect(se[1]).toBeGreaterThan(0);
    expect(ne[1]).toBeGreaterThan(0);
  });
  it('draws heights unsquashed', () => expect(project(0, 0, 14, 'se')[1]).toBe(-14));
});

const ANIM_BY_NAME = Anim as unknown as Record<string, number>;

describe('motion clips', () => {
  const clips = Object.values(MOTION);
  it('has clips', () => expect(clips.length).toBeGreaterThan(0));
  for (const c of clips) {
    describe(c.name, () => {
      it('fits its animation slot', () => {
        const a = ANIM_BY_NAME[c.anim];
        expect(a).toBeDefined();
        expect(c.frames).toBe(FRAMES[a!]);
        expect(c.loop).toBe(LOOPS.has(a!));
        expect(MOTION_FOR[c.anim]).toContain(c.name);
      });
      it('keys both facings at the same frames, in order, inside the clip', () => {
        const se = c.facings.se.keys.map((k) => k.f), ne = c.facings.ne.keys.map((k) => k.f);
        expect(se).toEqual(ne);
        expect([...se].sort((x, y) => x - y)).toEqual(se);
        expect(se[0]).toBe(0);
        for (const f of se) expect(f).toBeLessThan(c.frames);
        if (!c.loop) expect(se.at(-1)).toBe(c.frames - 1);
      });
      it('names every bone and rounds every number', () => {
        for (const fc of ['se', 'ne'] as const)
          for (const k of c.facings[fc].keys) {
            if (c.body !== 'horse') expect(Object.keys(k.bones)).toEqual([...BONE_ORDER]);
            for (const v of Object.values(k.bones)) expect(Number.isInteger(v * 2)).toBe(true);
            for (const v of [...k.root, k.height]) expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6);
          }
      });
      it('is written in the canonical format (deterministic output)', () => {
        const text = readFileSync(fileURLToPath(new URL(`${c.name}.json`, import.meta.url)), 'utf8');
        expect(formatClip(JSON.parse(text) as OutClip)).toBe(text);
      });
      it('credits its source and licence', () => {
        expect(String(c.meta.source)).toMatch(/CMU|Muybridge/);
        expect(String(c.meta.licence).length).toBeGreaterThan(10);
      });
    });
  }
});

describe('realism checks', () => {
  const series = (name: string, fc: 'se' | 'ne', bone: string): number[] => MOTION[name]!.facings[fc].keys.map((k) => k.bones[bone]!);
  const corr = (a: number[], b: number[]): number => {
    const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
    let n = 0, da = 0, db = 0;
    a.forEach((v, i) => {
      n += (v - ma) * (b[i]! - mb);
      da += (v - ma) ** 2;
      db += (b[i]! - mb) ** 2;
    });
    return n / Math.sqrt(da * db);
  };
  it('runs leaning forward: the spine is below 180 (rig convention)', () => {
    if (!MOTION.run) return;
    for (const fc of ['se', 'ne'] as const) for (const v of series('run', fc, 'spine')) expect(v).toBeLessThan(180);
  });
  it('swings each arm against its own leg in the walk', () => {
    if (!MOTION.walk) return;
    for (const fc of ['se', 'ne'] as const) {
      expect(corr(series('walk', fc, 'upperArmN'), series('walk', fc, 'thighN'))).toBeLessThan(-0.5);
      expect(corr(series('walk', fc, 'upperArmF'), series('walk', fc, 'thighF'))).toBeLessThan(-0.5);
    }
  });
  it('plants the near foot at walk frame 0 (contact pose)', () => {
    if (!MOTION.walk) return;
    expect(MOTION.walk.facings.se.keys[0]!.contact.N).toBe(true);
  });
  it('drops the pelvis in a fall', () => {
    for (const n of ['die-back', 'die-forward', 'die-crumple']) {
      if (!MOTION[n]) continue;
      const k = MOTION[n].facings.se.keys;
      expect(k.at(-1)!.height).toBeLessThan(k[0]!.height * 0.5);
    }
  });
});
