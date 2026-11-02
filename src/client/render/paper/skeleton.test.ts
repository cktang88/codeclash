import { describe, expect, it, vi } from 'vitest';
import { Anim, ANIM_COUNT } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { M, Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { paintPaper } from './index.ts';
import { registerPaperKind } from './registry.ts';
import { BODIES } from './rig.ts';
import { rotSprite, scale2x } from './rotsprite.ts';
import { skull, UM } from './undead-parts.ts';
import { plate, vol } from './undead-static.ts';
import { restJoints, type AttachmentSet, type DrawCtx, type PartXf } from './skeleton.ts';
import {
  animationsFor, bakeClip, drawSkeleton, footAnimations, footSkeleton, horseSkeleton, loadMotion, paintSkeleton, partDrawCount, posedNumbers, resolveBone, skeletonFor, skeletonKind, stickParts,
  type Clip, type FacingClips, type MotionJson, type Posed, type SkeletonRig,
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

describe('skeleton: README worked example (static key art split into bone parts)', () => {
  // Points of the Grave Legionary's static key art (undead-static.ts `B`), in its rest stance.
  const B = { neck: [0.4, -12.0], head: [0.75, -13.15], hipN: [-0.75, -6.5], kneeN: [-1.05, -3.65], ankN: [-1.15, -0.75], hipF: [1.05, -6.6], kneeF: [1.55, -3.75], ankF: [1.85, -0.8] } satisfies Record<string, P2>;
  const sabaton = (ank: P2): P2[] => [[ank[0] - 0.7, ank[1] - 0.35], [ank[0] + 0.5, ank[1] - 0.45], [ank[0] + 1.35, ank[1] + 0.35], [ank[0] + 1.3, ank[1] + 0.75], [ank[0] - 0.75, ank[1] + 0.75]];
  const skel = footSkeleton({ name: 'legionary-bones' });
  const parts: AttachmentSet = {
    ...stickParts(skel, { body: UM.bone, cloth: UM.rag, metal: UM.steel, team: M.team, hide: UM.leather }),
    thighF: (c, x) => vol(c, x.r(B.hipF), x.r(B.kneeF), 1.55, 1.25, UM.mail, { tone: 1 }),
    shinF: (c, x) => vol(c, x.r(B.kneeF), x.r(B.ankF), 0.95, 1.0, UM.rust, { tone: 2, caps: false }),
    footF: (c, x) => plate(c, sabaton(B.ankF).map(x.r), UM.rust, { tone: 1 }),
    thighN: (c, x) => vol(c, x.r(B.hipN), x.r(B.kneeN), 1.55, 1.25, UM.mail),
    shinN: (c, x) => vol(c, x.r(B.kneeN), x.r(B.ankN), 0.95, 1.0, UM.rust, { tone: 3, caps: false }),
    footN: (c, x) => plate(c, sabaton(B.ankN).map(x.r), UM.rust),
    head: (c, x) => skull(c, x.r(B.head), x.turn(0), true),
  };
  const rig: SkeletonRig = { skel, atts: parts, clips: footAnimations() };

  it('draws the split parts at rest exactly as the static drawing does', () => {
    for (const L of [2, 8]) {
      const direct = new Paper(), boned = new Paper();
      direct.begin(L, BODIES.foot.canvas);
      boned.begin(L, BODIES.foot.canvas);
      const posed = evaluate(skel, emptyLocals(), { level: L, facing: 'se', noIk: true });
      drawSkeleton(boned, posed, parts, { only: (s) => ['thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN', 'head'].includes(s) });
      for (const s of ['thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN', 'head']) {
        const b = posed.byName[s]!;
        const att = parts[s] as (c: Paper, x: PartXf, ctx: DrawCtx) => void;
        // Band offsets are seeded per slot (its index · 32), so the shading does not depend on what
        // was drawn before; seed the direct drawing the same way.
        direct.order = skel.slots.findIndex((x) => x.name === s) * 32;
        att(direct, { bone: b, o: [b.x, b.y], tip: [b.tx, b.ty], turned: 0, at: (p) => p, r: (p) => p, turn: (d) => d }, { posed, events: [] });
      }
      let diff = 0;
      for (let i = 0; i < direct.pix.length; i++) if (direct.pix[i] !== boned.pix[i]) diff++;
      expect(diff, `level ${L}`).toBe(0);
    }
  });

  it('plays walk and attack with the split parts', () => {
    for (const a of [Anim.Walk, Anim.Attack]) {
      const paper = new Paper();
      for (let f = 0; f < 12; f++) {
        const fr = paintSkeleton(rig, a, f, { level: 8, facing: 'se', paper });
        expect(fr.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
      }
    }
    expect(Object.keys(restJoints(skel)).length).toBe(skel.bones.length);
  });
});

describe('rotsprite', () => {
  // A 7 x 7 arrow pointing down: a 1 px shaft and a head.
  const w = 7, h = 7;
  const pix = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < 6; y++) pix[y * w + 3] = 10;
  pix[4 * w + 2] = pix[4 * w + 4] = pix[5 * w + 1] = pix[5 * w + 5] = 11;
  const bmp = { w, h, pix };

  it('scale2x keeps a flat image flat and doubles it', () => {
    const s = scale2x({ w: 2, h: 2, pix: Int16Array.from([5, 5, 5, 5]) });
    expect([s.w, s.h, ...s.pix]).toEqual([4, 4, ...new Array(16).fill(5)]);
  });

  it('turns by whole quarter turns exactly and by 7.5° steps without breaking the line', () => {
    const r0 = rotSprite(bmp, 0, [3.5, 0.5]);
    expect([...r0.img.pix]).toEqual([...pix]);
    // A quarter turn: the downward shaft points forward (screen right) from the pivot.
    const r12 = rotSprite(bmp, 12, [3.5, 0.5]);
    const [px, py] = r12.pivot.map(Math.floor) as [number, number];
    for (let i = 0; i < 6; i++) expect(r12.img.pix[py * r12.img.w + px + i]).toBe(10);
    // At 30° the shaft stays 8-connected (nearest rotation would leave gaps) and the same twice.
    const r4 = rotSprite(bmp, 4, [3.5, 0.5]);
    expect([...rotSprite(bmp, 4, [3.5, 0.5]).img.pix]).toEqual([...r4.img.pix]);
    const shaft: P2[] = [];
    for (let y = 0; y < r4.img.h; y++) for (let x = 0; x < r4.img.w; x++) if (r4.img.pix[y * r4.img.w + x] === 10) shaft.push([x, y]);
    expect(shaft.length).toBeGreaterThanOrEqual(5);
    for (const [x, y] of shaft) expect(shaft.some(([u, v]) => (u !== x || v !== y) && Math.abs(u - x) <= 1 && Math.abs(v - y) <= 1)).toBe(true);
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

describe('skeleton: standard bodies and clips', () => {
  const skel = footSkeleton();
  const clips = footAnimations();
  const parts = stickParts(skel, { body: M.bone, cloth: M.rag, metal: M.steel, team: M.team, hide: M.leather });
  const rig: SkeletonRig = { skel, atts: parts, clips };

  it('bakes the same numbers and bytes twice, and with Math trig sabotaged', () => {
    const clipsCopy = (a: Anim) => JSON.parse(JSON.stringify(clips[a])) as Clip;
    const run = () => [Anim.Walk, Anim.Attack, Anim.Die].flatMap((a) => bakeClip(footSkeleton(), clipsCopy(a), 8, 'se').flatMap(posedNumbers));
    const a = run();
    const spies = (['sin', 'cos', 'tan', 'atan', 'atan2', 'acos', 'asin'] as const).map((f) => vi.spyOn(Math, f).mockImplementation(() => NaN));
    let b: number[];
    try {
      b = run();
    } finally {
      for (const s of spies) s.mockRestore();
    }
    expect(b).toEqual(a);
    const p1 = paintSkeleton(rig, Anim.Attack, 5, { level: 8, facing: 'ne', paper: new Paper() });
    const p2 = paintSkeleton({ ...rig }, Anim.Attack, 5, { level: 8, facing: 'ne', paper: new Paper() });
    expect(Buffer.from(p1.pixels).equals(Buffer.from(p2.pixels))).toBe(true);
  });

  it('keeps idle to breathing: no angle changes, the chest moves at most a pixel', () => {
    for (const L of [1, 2, 4, 8])
      for (const f of ['se', 'ne'] as Facing[]) {
        const frames = bakeClip(skel, clips[Anim.Idle]!, L, f, 8, true);
        for (const p of frames)
          for (const b of p.bones) {
            expect(b.step, `${b.name} L${L}`).toBe(frames[0]!.bones[b.i]!.step);
            expect(Math.abs(b.y - frames[0]!.bones[b.i]!.y) * L).toBeLessThanOrEqual(1);
          }
      }
  });

  it('does not boil: a bone whose angle is unchanged draws identical pixels at its origin', () => {
    const frames = bakeClip(skel, clips[Anim.Idle]!, 8, 'se', 8, true);
    const shot = (p: Posed, slot: string) => {
      const c = new Paper();
      c.begin(8, BODIES.foot.canvas);
      drawSkeleton(c, p, parts, { only: (s) => s === slot });
      const b = p.byName[skel.slots.find((s) => s.name === slot)!.bone]!;
      const ox = c.FX + Math.round(b.x * 8), oy = c.FY + Math.round(b.y * 8);
      const out: number[] = [];
      for (let y = c.by0; y <= c.by1; y++) for (let x = c.bx0; x <= c.bx1; x++) out.push(x - ox, y - oy, c.pix[y * c.CW + x]!);
      return out.join(',');
    };
    for (const slot of ['head', 'chest', 'thighN', 'weapon', 'upperArmF']) {
      const first = shot(frames[0]!, slot);
      for (const p of frames) expect(shot(p, slot), slot).toBe(first);
    }
    // And the part cache drew each (part, angle) once only.
    const full = (p: Posed) => {
      const c = new Paper();
      c.begin(8, BODIES.foot.canvas);
      drawSkeleton(c, p, parts);
    };
    full(frames[0]!);
    const n0 = partDrawCount();
    for (const p of frames) {
      const c = new Paper();
      c.begin(8, BODIES.foot.canvas);
      drawSkeleton(c, p, parts);
    }
    expect(partDrawCount()).toBe(n0);
  });

  it('keeps the planted foot on the ground line through a walk and a run', () => {
    for (const a of [Anim.Walk, Anim.Run])
      for (const L of [1, 2, 4, 8])
        for (const f of ['se', 'ne'] as Facing[]) {
          const frames = bakeClip(skel, clips[a]!, L, f, 12, true);
          let planted = 0;
          frames.forEach((p, fr) => {
            const feet = (['N', 'F'] as const).map((s) => ({ s, t: p.byName[`footTarget${s}`]!, end: p.byName[`shin${s}`]!, g: Math.round(skel.ik!.find((k) => k.name === `leg${s}`)!.ground! * L) / L }));
            const down = feet.filter((x) => x.t.y >= x.g - 0.01);
            for (const x of feet) expect((x.end.ty - x.g) * L, `anim ${a} L${L} ${f} fr${fr} ${x.s} below ground`).toBeLessThanOrEqual(0.5);
            if (down.length) {
              planted++;
              expect(Math.min(...down.map((x) => Math.abs(x.end.ty - x.t.y) * L)), `anim ${a} L${L} ${f} fr${fr}`).toBeLessThanOrEqual(0.5);
            }
          });
          expect(planted).toBeGreaterThanOrEqual(a === Anim.Walk ? 12 : 6);
        }
  });

  it('grips a two-handed weapon with the off hand by IK', () => {
    const s2 = footSkeleton({ twoHanded: true, name: 'foot2h' });
    for (const fr of [0, 3, 5, 7]) {
      const p = bakeClip(s2, clips[Anim.Attack]!, 8, 'se')[fr]!;
      const u = p.byName.upperArmF!, w = p.byName.forearmF!, g = p.byName.grip2!;
      // As close as the arm's reach allows.
      const short = Math.max(0, Math.hypot(g.x - u.x, g.y - u.y) - (u.len + w.len));
      expect(Math.hypot(w.tx - g.x, w.ty - g.y) * 8, `frame ${fr}`).toBeLessThanOrEqual(2 + short * 8);
    }
  });

  it('round-trips a skeleton and an animation through JSON', () => {
    for (const body of ['foot', 'horse', 'beast', 'engine'] as const) {
      const s = skeletonFor(body);
      const s2 = JSON.parse(JSON.stringify(s)) as SkeletonData;
      expect(s2).toEqual(s);
      const set = animationsFor(body);
      for (const a of [Anim.Walk, Anim.Attack]) {
        const c2 = JSON.parse(JSON.stringify(set[a])) as Clip;
        expect(c2).toEqual(set[a]);
        expect(bakeClip(s2, c2, 4, 'se').map(posedNumbers)).toEqual(bakeClip(s, set[a]!, 4, 'se').map(posedNumbers));
      }
    }
  });

  it('paints every body type in every animation and facing, through the paper registry too', () => {
    const bodies = ['foot', 'horse', 'beast', 'engine'] as const;
    for (const body of bodies) {
      const s = skeletonFor(body);
      const r: SkeletonRig = { skel: s, clips: animationsFor(body), atts: stickParts(s, { body: M.bone, cloth: M.rag, metal: M.steel, team: M.team, hide: M.leather, wood: M.wood }) };
      for (let a = 0; a < ANIM_COUNT; a++)
        for (const facing of ['se', 'sw', 'ne', 'nw'] as Facing[]) {
          const f = paintSkeleton(r, a as Anim, Math.min(3, FRAMES[a]! - 1), { level: 2, facing });
          let n = 0;
          for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i] === 255) n++;
          expect(n, `${body} ${a} ${facing}`).toBeGreaterThan(60);
        }
      registerPaperKind('bones-test', bodies.indexOf(body), skeletonKind(r));
      const pf = paintPaper('bones-test', bodies.indexOf(body), 4, Anim.Walk, 2, 1, 215)!;
      expect(pf.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
  });

  it('resolves mocap bone names', () => {
    expect(['LeftUpLeg', 'RightForeArm', 'upperArm.R', 'thigh_l', 'Hips', 'Spine', 'thighN', 'hand.L', 'Head', 'shin_r'].map((n) => resolveBone(n))).toEqual([
      'thighF', 'forearmN', 'upperArmN', 'thighF', 'pelvis', 'spine', 'thighN', 'handF', 'head', 'shinN',
    ]);
    // Horse names only resolve to the horse within a horse skeleton.
    const horse = horseSkeleton();
    expect(['barrel', 'neck', 'head', 'tail', 'foreUpperN', 'hindLowerF', 'fore_upper_l', 'foreNUpper', 'riderHead', 'upperArm.R'].map((n) => resolveBone(n, horse))).toEqual([
      'horseBody', 'horseNeck', 'horseHead', 'tail', 'foreNUpper', 'hindFLower', 'foreFUpper', 'foreNUpper', 'head', 'upperArmN',
    ]);
    expect(resolveBone('neck', skel)).toBe('neck');
  });

  it('loads a horse clip in the mocap naming (barrel, neck, foreUpperN …), ignoring twist', () => {
    const horse = horseSkeleton();
    const legs = ['foreUpperN', 'foreLowerN', 'foreUpperF', 'foreLowerF', 'hindUpperN', 'hindLowerN', 'hindUpperF', 'hindLowerF'];
    const json: MotionJson = {
      name: 'horse-walk', frames: 12, loop: true, ease: EASE, lengths: { foreUpper: 6.4, foreLower: 6.2 },
      keys: [0, 3, 6, 9].map((f, i) => ({
        f, height: 16.0 + (i % 2) * 0.3, twist: { pelvis: 4, chest: -3 },
        bones: { barrel: 93 + (i % 2), neck: 150 - i, head: 45, tail: 15, ...Object.fromEntries(legs.map((l, j) => [l, (j % 2 ? -5 : 10) * (i % 2 ? 1 : -1)])) },
      })),
    };
    const a = loadMotion(json, horse) as AnimationData;
    for (const b of ['horseBody', 'horseNeck', 'horseHead', 'tail', 'foreNUpper', 'foreFLower', 'hindNUpper', 'hindFLower']) expect(a.bones![b]?.rotate?.length, b).toBe(4);
    expect(a.bones!.neck).toBeUndefined(); // the rider's neck is untouched
    expect(a.bones!.horseBody!.translate!.length).toBe(4); // height drives the barrel
    const frames = bakeClip(horse, a, 4, 'se', 12, true);
    expect(frames.length).toBe(12);
    const fk = evaluate(horse, sampleClip(a, 0, 12), { level: 8, facing: 'se', noIk: true });
    expect(fk.byName.horseNeck!.a).toBe(150);
    expect(fk.byName.foreNUpper!.a).toBe(352.5); // -10 degrees snaps to -7.5
  });

  it('loads mocap key JSON: retargets, eases, and plants the feet by IK on top', () => {
    // A source man twice our size, walking: thighs and shins swing, the pelvis bobs.
    const swing = [24, 0, -20, 0];
    const json: MotionJson = {
      facings: {
        se: {
          name: 'mocap-walk', frames: 12, loop: true, ease: EASE, lengths: { thigh: 5.9, shin: 5.9 },
          keys: swing.map((s, i) => ({
            f: i * 3, height: 11.0 - (i % 2 ? 0 : 0.6), contact: { N: i !== 3, F: i !== 1 },
            bones: { 'thigh.R': s, 'shin.R': s - 10, LeftUpLeg: -s, LeftLeg: -s - 10, Spine: 183, 'upperArm.L': -s / 2 },
          })),
        },
      },
    };
    const clip = loadMotion(json, skel) as FacingClips;
    const a = clip.byFacing.se as AnimationData;
    expect(a.bones!.thighN!.rotate!.length).toBe(4);
    expect(a.bones!.pelvis!.translate![0]!.v[1]).toBeGreaterThan(0); // crouched lower than rest at contact
    expect(a.bones!.footTargetN!.translate).toBeDefined();
    expect(a.ik!.legN).toBeDefined();
    const frames = bakeClip(skel, clip, 8, 'se', 12, true);
    for (const p of frames) {
      const lows = (['N', 'F'] as const).map((s) => (p.byName[`shin${s}`]!.ty - skel.ik!.find((k) => k.name === `leg${s}`)!.ground!) * 8);
      expect(Math.max(...lows)).toBeLessThanOrEqual(0.5);
      expect(Math.max(...lows)).toBeGreaterThanOrEqual(-0.5);
    }
    // World angles come through (snapped): the near thigh at 24 degrees on key 0, before IK.
    const fk = evaluate(skel, sampleClip(clip, 0, 12, 'se'), { level: 8, facing: 'se', noIk: true });
    expect(fk.byName.thighN!.a).toBe(22.5);
  });
});
