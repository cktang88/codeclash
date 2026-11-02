// Templar HD figures on bones: the machinery shared by the foot and mounted kinds.
//
// The approved key art (templar-static.ts) is the rig's setup pose. Each piece of it (a thigh, the
// helm, the shield) rides one bone: the piece is drawn with the key art's own code, its points
// mapped from the key art to the bone's current transform (`partMap`), so at rest it is the key art
// pixel for pixel and in motion it is the same drawing turned and moved, re-rasterised at each
// snapped angle and never rotated as an image (README, "Animating with bones").
//
// Cloth that hangs over two bones (the tabard over the hips and thighs, the mantle from the
// shoulders) is skinned: each key-art point moves by a blend of its bones' transforms, weighted by
// where it sits (`skinMap`), and is shaded back in key-art coordinates so its folds and the cross
// ride on the cloth. The skirt and mantle bones are driven by the body *late* (`lagCloth`): their
// angles copy the thighs' and the chest's from 1-2 frames before, so cloth trails the motion.

import type { Anim } from '../contract.ts';
import type { P2, Paper } from './core.ts';
import type { Facing } from './facing.ts';
import {
  animationFromPoses, clipBase, cosStep, emptyLocals, evaluate, localsFromWorld, restPose, sampleClip, sinStep,
  type AnimationData, type AnimEvent, type BoneXf, type Clip, type Curve, type FacingClips, type Key, type PartXf, type Posed, type PoseKey, type SkeletonData,
} from './skeleton.ts';
import { SNAP_DEG } from './rig.ts';
import type { PartMap } from './templar-static.ts';

// ------------------------------------------------------------------ maps from the key art

/** An affine map: x' = a x + b y + e, y' = c x + d y + f. */
export type Aff = [number, number, number, number, number, number];
const apply = (m: Aff, p: P2): P2 => [m[0] * p[0] + m[1] * p[1] + m[4], m[2] * p[0] + m[3] * p[1] + m[5]];
function invert(m: Aff, p: P2): P2 {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const x = p[0] - m[4], y = p[1] - m[5];
  return [(m[3] * x - m[1] * y) / det, (-m[2] * x + m[0] * y) / det];
}

/** The map of a cached part (its bone's transform), for templar-static's drawing. */
export function partMap(x: PartXf): PartMap {
  const o = x.r([0, 0]), ex = x.r([1, 0]), ey = x.r([0, 1]);
  const m: Aff = [ex[0] - o[0], ey[0] - o[0], ex[1] - o[1], ey[1] - o[1], o[0], o[1]];
  return { f: (p) => apply(m, p), inv: (p) => invert(m, p), deg: x.turned * SNAP_DEG };
}

/** A bone's rigid transform from its rest pose (key-art units) to now (scale-y ignored). */
export function boneAff(b: BoneXf, rest: BoneXf, lift: P2 = [0, 0]): Aff {
  const k = b.step - rest.step;
  const s = sinStep(k), c = cosStep(k);
  // p → o + R (p − rest.o), with R the rig rotation by k steps (rotStep).
  const ox = b.x + lift[0], oy = b.y + lift[1];
  return [c, s, -s, c, ox - (c * rest.x + s * rest.y), oy - (-s * rest.x + c * rest.y)];
}

/** Weights of bones at a key-art point. */
export type Weights = (p: P2) => [string, number][];

/**
 * A skinned map: each point moves by its bones' transforms blended by `weights`. The inverse (for
 * shading) is found by fixed-point iteration on the locally linear blend.
 */
export function skinMap(posed: Posed, weights: Weights): PartMap {
  const rest = restPose(posed.skel, posed.level, posed.facing);
  const affs = new Map<string, Aff>();
  const aff = (name: string): Aff => {
    let m = affs.get(name);
    if (!m) {
      const b = posed.byName[name]!;
      affs.set(name, (m = boneAff(b, rest.bones[b.i]!)));
    }
    return m;
  };
  const blend = (p: P2): Aff => {
    const out: Aff = [0, 0, 0, 0, 0, 0];
    let tot = 0;
    for (const [n, w] of weights(p)) {
      if (w <= 0) continue;
      const m = aff(n);
      for (let i = 0; i < 6; i++) out[i] += m[i]! * w;
      tot += w;
    }
    if (tot <= 0) return [1, 0, 0, 1, 0, 0];
    for (let i = 0; i < 6; i++) out[i] /= tot;
    return out;
  };
  const deg = (posed.byName.chest ? posed.byName.chest.step - rest.byName.chest!.step : 0) * SNAP_DEG;
  return {
    f: (p) => apply(blend(p), p),
    inv: (p) => {
      let q = p;
      for (let i = 0; i < 6; i++) q = invert(blend(q), p);
      return q;
    },
    deg,
  };
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth01 = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ authoring clips

/**
 * A key pose. Angles are in the drawn facing's world frame (rig convention: 0 = hanging down,
 * + = forward on hanging limbs; upright bones point up at 180, and a forward lean is *less* than
 * 180). `w`: absolute world angles; `dw`: world angles relative to the rest pose (the bone keeps
 * its world angle however its parents move); `dl`: plain local offsets (for falls, where the
 * whole body turns); `t`: translations (units, parent frame: pelvis offset, foot targets);
 * `ik`: IK mixes.
 */
export interface KP {
  f: number;
  c?: Curve;
  w?: Record<string, number>;
  dw?: Record<string, number>;
  dl?: Record<string, number>;
  t?: Record<string, P2>;
  ik?: Record<string, number>;
}

/** The rest pose's raw world angle of every bone (FK, unsnapped) in a facing. */
export function restWorld(skel: SkeletonData, facing: Facing): Record<string, number> {
  const out: Record<string, number> = {};
  const idx = new Map(skel.bones.map((b, i) => [b.name, i] as const));
  const w: number[] = [];
  skel.bones.forEach((b, i) => {
    const rot = b.facing?.[facing]?.rot ?? b.rot;
    const p = b.parent !== undefined ? idx.get(b.parent)! : -1;
    w[i] = (p >= 0 && b.inherit !== 'translation' ? w[p]! : 0) + rot;
    out[b.name] = w[i]!;
  });
  return out;
}

/** Builds an animation for one facing from world-angle keys. */
export function buildAnim(skel: SkeletonData, facing: Facing, name: string, frames: number, loop: boolean, keys: readonly KP[], events: AnimEvent[] = []): AnimationData {
  const rw = restWorld(skel, facing);
  const poses: PoseKey[] = keys.map((k) => {
    const world: Record<string, number> = {};
    for (const [n, v] of Object.entries(k.dw ?? {})) world[n] = rw[n]! + v;
    for (const [n, v] of Object.entries(k.w ?? {})) world[n] = v;
    // Local offsets first (they turn whole chains), then world angles below them are solved on top.
    const bones: Record<string, { rot?: number; x?: number; y?: number }> = {};
    if (k.dl) {
      // World angles given for bones under a locally turned one keep their meaning in world terms
      // only if solved together: turn the parents' rest by their dl, then solve.
      const turned: SkeletonData = { ...skel, bones: skel.bones.map((b) => (k.dl![b.name] !== undefined ? { ...b, rot: (b.facing?.[facing]?.rot ?? b.rot) + k.dl![b.name]!, facing: undefined } : b)) };
      const loc = localsFromWorld(turned, world, facing);
      for (const [n, v] of Object.entries(k.dl)) bones[n] = { rot: v };
      for (const [n, v] of Object.entries(loc.bones)) bones[n] = { rot: (bones[n]?.rot ?? 0) + (v.rot ?? 0) };
    } else for (const [n, v] of Object.entries(localsFromWorld(skel, world, facing).bones)) bones[n] = { rot: v.rot ?? 0 };
    for (const [n, p] of Object.entries(k.t ?? {})) bones[n] = { ...(bones[n] ?? {}), x: p[0], y: p[1] };
    return { f: k.f, ...(k.c ? { c: k.c } : {}), bones, ...(k.ik ? { ik: k.ik } : {}) };
  });
  return animationFromPoses(name, frames, loop, poses, events);
}

/** One animation per drawn facing from the same keys (angles mean the same in both). */
export function facingClip(skel: SkeletonData, name: string, frames: number, loop: boolean, keys: (f: Facing) => readonly KP[], events: AnimEvent[] = []): FacingClips {
  return { byFacing: { se: buildAnim(skel, 'se', name, frames, loop, keys('se'), events), ne: buildAnim(skel, 'ne', name, frames, loop, keys('ne'), events) } };
}

// ------------------------------------------------------------------ cloth that trails

/** A cloth bone driven late by a body bone. */
export interface LagSpec {
  /** The cloth bone (its parent carries it). */
  bone: string;
  /** The bone whose world angle it follows… */
  follow: string;
  /** …by this much of its turn from rest (0..1)… */
  k: number;
  /** …this many frames late. */
  lag: number;
  /** A constant world-angle offset (cloth streaming back in a run: negative). */
  bias?: number;
  /** The parent's own turn is kept off by this much (1: the cloth hangs plumb whatever the parent does). */
  plumb?: number;
}

/**
 * Adds trailing keys for cloth bones to a clip (one key per frame), per drawn facing: each cloth
 * bone's world angle is its rest angle plus `k` times its leader's turn `lag` frames ago.
 */
export function lagCloth(skel: SkeletonData, clip: Clip, n: number, loop: boolean, specs: readonly LagSpec[], bias: Partial<Record<string, number>> = {}): Clip {
  const one = (anim: AnimationData, facing: Facing): AnimationData => {
    const base: Clip = anim;
    const L = 16;
    const rest = evaluate(skel, emptyLocals(), { level: L, facing, noIk: true });
    const at = (t: number): Posed => {
      const tt = loop ? t - n * Math.floor(t / n) : Math.max(0, Math.min(n - 1, t));
      return evaluate(skel, sampleClip(base, tt, n, facing), { level: L, facing });
    };
    const rw = restWorld(skel, facing);
    const bones = { ...(anim.bones ?? {}) };
    for (const s of specs) {
      const keys: Key<number>[] = [];
      const parent = skel.bones.find((b) => b.name === s.bone)!.parent!;
      for (let f = 0; f <= (loop ? n : n - 1); f++) {
        const now = at(f), was = at(f - s.lag);
        const lead = was.byName[s.follow]!.raw - rest.byName[s.follow]!.raw;
        const pTurn = now.byName[parent]!.raw - rest.byName[parent]!.raw;
        const want = rw[s.bone]! + s.k * lead + (s.bias ?? 0) + (bias[s.bone] ?? 0) - (s.plumb ?? 0) * pTurn;
        // Local offset that gives `want` under the parent as it is now.
        const local = want - now.byName[parent]!.raw - (rw[s.bone]! - rw[parent]!);
        keys.push({ f, v: Math.round(local * 100) / 100 });
      }
      bones[s.bone] = { ...(bones[s.bone] ?? {}), rotate: keys };
    }
    return { ...anim, bones };
  };
  if (Array.isArray(clip)) return clip.map((tr, i) => (i === 0 ? { ...tr, anim: one(tr.anim, 'se') } : tr));
  if ('byFacing' in clip) {
    const byFacing: FacingClips['byFacing'] = {};
    for (const [f, c] of Object.entries(clip.byFacing) as [Facing, AnimationData | { anim: AnimationData }[]][]) {
      if (Array.isArray(c)) byFacing[f] = c.map((tr, i) => (i === 0 ? { ...tr, anim: one(tr.anim, f) } : tr)) as never;
      else byFacing[f] = one(c, f);
    }
    return { byFacing };
  }
  return one(clip, 'se');
}

/** The number of painted frames of a clip's base (its own length). */
export const clipFrames = (clip: Clip): number => clipBase(clip).frames;

export type ClipSet = Partial<Record<Anim, Clip>>;
