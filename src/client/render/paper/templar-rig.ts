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
import { Paper, type P2 } from './core.ts';
import type { Facing } from './facing.ts';
import {
  animationFromPoses, clipBase, cosStep, EASE_IN, EASE_OUT, emptyLocals, evaluate, localsFromWorld, restPose, sampleClip, shortest, sinStep,
  type AnimationData, type AnimEvent, type Attachment, type BoneXf, type Clip, type Curve, type DrawCtx, type FacingClips, type Key, type PartXf, type Posed, type PoseKey, type SkeletonData,
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
  // The blend of the bones' maps at a point, into b0..b5 (no arrays: it runs per pixel shaded).
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
  const blend = (p: P2): void => {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
    let tot = 0;
    for (const [n, w] of weights(p)) {
      if (w <= 0) continue;
      const m = aff(n);
      s0 = s0 + m[0] * w;
      s1 = s1 + m[1] * w;
      s2 = s2 + m[2] * w;
      s3 = s3 + m[3] * w;
      s4 = s4 + m[4] * w;
      s5 = s5 + m[5] * w;
      tot += w;
    }
    if (tot <= 0) {
      b0 = 1, b1 = 0, b2 = 0, b3 = 1, b4 = 0, b5 = 0;
      return;
    }
    b0 = s0 / tot, b1 = s1 / tot, b2 = s2 / tot, b3 = s3 / tot, b4 = s4 / tot, b5 = s5 / tot;
  };
  const deg = (posed.byName.chest ? posed.byName.chest.step - rest.byName.chest!.step : 0) * SNAP_DEG;
  return {
    f: (p) => {
      blend(p);
      return [b0 * p[0] + b1 * p[1] + b4, b2 * p[0] + b3 * p[1] + b5];
    },
    inv: (p) => {
      let q = p;
      // Two steps of the fixed point from the blend at the figure point itself: the bones of one
      // piece of cloth turn by a step or two from each other, so it has converged to well under a pixel.
      // (invert(blend(q), p), written out.)
      for (let i = 0; i < 2; i++) {
        blend(q);
        const det = b0 * b3 - b1 * b2 || 1e-9;
        const x = p[0] - b4, y = p[1] - b5;
        q = [(b3 * x - b1 * y) / det, (-b2 * x + b0 * y) / det];
      }
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
  /** A flutter on top: amplitude (deg), cycles per clip, phase (0..1). */
  wave?: [number, number, number];
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
    // Each frame is posed once (evaluate without a previous frame is a pure function of it),
    // however many cloth bones read it.
    const posed = new Map<number, Posed>();
    const at = (t: number): Posed => {
      const tt = loop ? t - n * Math.floor(t / n) : Math.max(0, Math.min(n - 1, t));
      let p = posed.get(tt);
      if (!p) posed.set(tt, (p = evaluate(skel, sampleClip(base, tt, n, facing), { level: L, facing })));
      return p;
    };
    const rw = restWorld(skel, facing);
    const bones = { ...(anim.bones ?? {}) };
    for (const s of specs) {
      const keys: Key<number>[] = [];
      const parent = skel.bones.find((b) => b.name === s.bone)!.parent!;
      for (let f = 0; f <= (loop ? n : n - 1); f++) {
        const now = at(f), was = at(f - s.lag);
        const lead = shortest(was.byName[s.follow]!.raw - rest.byName[s.follow]!.raw);
        const pTurn = shortest(now.byName[parent]!.raw - rest.byName[parent]!.raw);
        const wv = s.wave ? s.wave[0] * Math.sin(2 * Math.PI * (s.wave[1] * f / n + s.wave[2])) : 0;
        const want = rw[s.bone]! + s.k * lead + (s.bias ?? 0) + (bias[s.bone] ?? 0) - (s.plumb ?? 0) * pTurn + wv;
        // Local offset that gives `want` under the parent as it is now.
        const local = shortest(want - now.byName[parent]!.raw - (rw[s.bone]! - rw[parent]!));
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

// ------------------------------------------------------------------ mocap as the base

import { MOTION, type MotionClip, type MotionKey } from './motion/index.ts';

/** A keyed value over a clip's frames (for authored overrides sampled at the mocap keys). */
export type Track = readonly (readonly [number, number])[];
/** Samples a track at frame f, eased between keys (smoothstep), held at the ends. */
export function at(tr: Track, f: number): number {
  if (f <= tr[0]![0]) return tr[0]![1];
  for (let i = 1; i < tr.length; i++) {
    const [f1, v1] = tr[i]!, [f0, v0] = tr[i - 1]!;
    if (f <= f1) {
      const u = (f - f0) / Math.max(1e-6, f1 - f0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return tr.at(-1)![1];
}

export interface MocapOpts {
  /** Torso chain (pelvis…head) turn, times this (the subject's own posture is taken out). */
  torso?: number;
  /** Pelvis travel, times this (after scaling to our hip height). */
  travel?: number;
  /** Feet: ankle travel times this (0 = keep the stance and plant). */
  feet?: number;
  /** Arms copied (as turns from the reference pose), times this; empty = authored per kind. */
  arms?: { N?: number; F?: number };
  /** Foot roll (heel and toe), times this. */
  roll?: number;
  /** The reference pose: 'first' key (attacks, falls) or the 'mean' of a loop. */
  ref?: 'first' | 'mean';
  /** Frames to drop keys from (falls drive the body with dl instead). */
  only?: (k: MotionKey) => boolean;
  /** The hips' height is absolute (a crouch or a fall from standing), not a turn from the reference. */
  absHeight?: boolean;
  /** Legs by their mocap angles (FK) once neither foot is planted (falls); IK on while a foot is down. */
  legsFK?: boolean;
  /** Re-times the keys (painted frame → painted frame), e.g. a faster first half. */
  retime?: (f: number) => number;
  /** A gait of `n` frames: the second half-cycle is the first with the sides swapped (an even stride, no limp). */
  mirror?: number;
}

const TORSO = ['pelvis', 'spine', 'chest', 'neck', 'head'] as const;
const sinD = (d: number) => Math.sin((d * Math.PI) / 180), cosD = (d: number) => Math.cos((d * Math.PI) / 180);
const wrap = (d: number) => d - 360 * Math.floor(d / 360 + 0.5);

/**
 * Key poses from a converted mocap clip (motion/*.json) for our skeleton, as turns and offsets from
 * the subject's reference pose laid over the key art's rest: the clip brings the weight, the hip
 * travel, the trunk and the footwork; the rest pose keeps our figure's look.
 */
export function mocapKeys(skel: SkeletonData, name: string, facing: Facing, o: MocapOpts = {}): { keys: KP[]; clip: MotionClip } {
  const clip = MOTION[name];
  if (!clip) throw new Error(`no motion clip ${name}`);
  const ks = clip.facings[facing === 'ne' ? 'ne' : 'se'].keys;
  const len = (b: string) => skel.bones.find((x) => x.name === b)!.len;
  const lt = len('thighN'), ls = len('shinN');
  const hip = -(skel.bones.find((b) => b.name === 'pelvis')!.y);
  const scale = hip / (clip.restHip ?? 8.3);
  const mlt = clip.lengths.thigh ?? 3.9, mls = clip.lengths.shin ?? 3.8;
  const ankle = (k: MotionKey, s: 'N' | 'F'): P2 => {
    const t = k.bones[`thigh${s}`]!, h = k.bones[`shin${s}`]!;
    return [(mlt * sinD(t) + mls * sinD(h)) * scale + k.root[0]! * scale, (mlt * cosD(t) + mls * cosD(h)) * scale + k.root[1]! * scale];
  };
  const mean = (get: (k: MotionKey) => number) => (o.ref === 'mean' ? ks.reduce((s, k) => s + get(k), 0) / ks.length : get(ks[0]!));
  const ref: Record<string, number> = {};
  for (const b of Object.keys(ks[0]!.bones)) ref[b] = mean((k) => ks[0]!.bones[b]! + wrap(k.bones[b]! - ks[0]!.bones[b]!));
  const refRoot: P2 = [mean((k) => k.root[0]!), mean((k) => k.root[1]!)];
  const refAnk = { N: [mean((k) => ankle(k, 'N')[0]), mean((k) => ankle(k, 'N')[1])] as P2, F: [mean((k) => ankle(k, 'F')[0]), mean((k) => ankle(k, 'F')[1])] as P2 };
  const tg = o.torso ?? 1, tv = o.travel ?? 1, fg = o.feet ?? 1, rg = o.roll ?? 0.6;
  const keys: KP[] = ks.filter((k) => !o.only || o.only(k)).map((k) => {
    const dw: Record<string, number> = {};
    for (const b of TORSO) if (k.bones[b] !== undefined) dw[b] = Math.round(wrap(k.bones[b]! - ref[b]!) * tg * 10) / 10;
    for (const s of ['N', 'F'] as const) {
      const g = o.arms?.[s];
      if (!g) continue;
      for (const b of [`upperArm${s}`, `forearm${s}`]) if (k.bones[b] !== undefined) dw[b] = Math.round(wrap(k.bones[b]! - ref[b]!) * g * 10) / 10;
    }
    const py = (o.absHeight ? (clip.restHip ?? 8.3) - k.height : k.root[1]! - refRoot[1]) * scale * tv;
    const t: Record<string, P2> = {
      pelvis: [Math.round((k.root[0]! - refRoot[0]) * scale * tv * 100) / 100, Math.round(py * 100) / 100],
    };
    const fk = o.legsFK && ks.indexOf(k) > 0;
    const w: Record<string, number> = {};
    if (fk) for (const b of ['thighN', 'shinN', 'thighF', 'shinF']) w[b] = k.bones[b]!;
    const dl: Record<string, number> = {};
    for (const s of ['N', 'F'] as const) {
      const a = ankle(k, s), r = refAnk[s];
      const grounded = k.contact[s];
      const y = grounded ? 0 : Math.min(0, (a[1] - r[1]) * fg);
      t[`footTarget${s}`] = [Math.round((a[0] - r[0]) * fg * 100) / 100, Math.round(y * 100) / 100];
      const roll = wrap(k.bones[`foot${s}`]! - ref[`foot${s}`]!);
      dl[`foot${s}`] = Math.abs(roll) > 70 ? 0 : Math.round(Math.max(-35, Math.min(30, roll * rg)));
    }
    void lt;
    void ls;
    if (fk) {
      delete t.footTargetN;
      delete t.footTargetF;
    }
    const f = o.retime ? Math.round(o.retime(k.f) * 100) / 100 : k.f;
    return { f, ...(k.c ? { c: k.c as Curve } : {}), dw, t, dl, ...(fk ? { w, ik: { legN: 0, legF: 0 } } : o.legsFK ? { ik: { legN: 1, legF: 1 } } : {}) };
  });
  if (o.mirror) {
    const half = o.mirror / 2;
    const swap = (n: string) => (n.endsWith('N') ? `${n.slice(0, -1)}F` : n.endsWith('F') ? `${n.slice(0, -1)}N` : n);
    const first = keys.filter((k) => k.f < half);
    const second = first.map((k): KP => {
      const t: Record<string, P2> = {};
      for (const [n, v] of Object.entries(k.t ?? {})) t[n.startsWith('footTarget') ? swap(n) : n] = v;
      const dl: Record<string, number> = {};
      for (const [n, v] of Object.entries(k.dl ?? {})) dl[swap(n)] = v;
      const dw: Record<string, number> = {};
      // The trunk repeats; an arm's swing about its mean runs the other way.
      for (const [n, v] of Object.entries(k.dw ?? {})) dw[n] = /^(upperArm|forearm)/.test(n) ? -v : v;
      return { ...k, f: k.f + half, t, dl, dw };
    });
    return { keys: [...first, ...second], clip };
  }
  return { keys, clip };
}

/** Lays authored tracks (world angles `w`, world turns `dw`, offsets `t`) over mocap keys, sampled at the keys' frames. */
export function overlayKeys(keys: readonly KP[], o: { w?: Record<string, Track>; dw?: Record<string, Track>; t?: Record<string, [Track, Track]>; tAdd?: Record<string, [Track, Track]>; ik?: Record<string, Track> }, extra: readonly number[] = []): KP[] {
  // Extra frames (authored key times the mocap lacks) are added by interpolating the mocap keys.
  const frames = [...new Set([...keys.map((k) => k.f), ...extra])].sort((a, b) => a - b);
  const lerpKey = (f: number): KP => {
    const i = keys.findIndex((k) => k.f >= f);
    if (i < 0) return { ...keys.at(-1)!, f };
    if (keys[i]!.f === f || i === 0) return { ...keys[i]!, f };
    const a = keys[i - 1]!, b = keys[i]!, u = (f - a.f) / (b.f - a.f);
    const mix = <T extends Record<string, number>>(x?: T, y?: T) => {
      const out: Record<string, number> = {};
      for (const n of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) out[n] = (x?.[n] ?? 0) + ((y?.[n] ?? 0) - (x?.[n] ?? 0)) * u;
      return out;
    };
    const t: Record<string, P2> = {};
    for (const n of new Set([...Object.keys(a.t ?? {}), ...Object.keys(b.t ?? {})])) {
      const p = a.t?.[n] ?? [0, 0], q = b.t?.[n] ?? [0, 0];
      t[n] = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    }
    return { f, c: a.c, dw: mix(a.dw, b.dw), dl: mix(a.dl, b.dl), t };
  };
  return frames.map((f) => {
    const k = lerpKey(f);
    const out: KP = { ...k, dw: { ...(k.dw ?? {}) }, t: { ...(k.t ?? {}) }, w: { ...(k.w ?? {}) } };
    for (const [n, tr] of Object.entries(o.w ?? {})) {
      out.w![n] = Math.round(at(tr, f) * 10) / 10;
      delete out.dw![n];
    }
    for (const [n, tr] of Object.entries(o.dw ?? {})) out.dw![n] = Math.round(((out.dw![n] ?? 0) + at(tr, f)) * 10) / 10;
    for (const [n, [x, y]] of Object.entries(o.t ?? {})) out.t![n] = [at(x, f), at(y, f)];
    for (const [n, [x, y]] of Object.entries(o.tAdd ?? {})) {
      const p = out.t![n] ?? [0, 0];
      out.t![n] = [Math.round((p[0] + at(x, f)) * 100) / 100, Math.round((p[1] + at(y, f)) * 100) / 100];
    }
    if (o.ik) out.ik = { ...(out.ik ?? {}), ...Object.fromEntries(Object.entries(o.ik).map(([n, tr]) => [n, at(tr, f)])) };
    return out;
  });
}

// ------------------------------------------------------------------ things that fall

/** Something let go in a death: the `from` slot's drawing passes to `slot` on the free `bone` at frame `at`, then falls to `land`. */
export interface Drop {
  /** The bone that carried it (the forearm under a shield, the weapon bone). */
  holder: string;
  /** The free bone (a child of the root) and its slot, and the slot it leaves. */
  bone: string;
  slot: string;
  from: string;
  at: number;
  /** Where it lands (bone origin, figure units), its turn from rest there (deg), and when; it bounces a frame later. */
  land: { x: number; y: number; rot: number; f: number };
}

/** Adds the drops' keys and slot swaps to a clip (per drawn facing), so a shield slides off and a sword falls. */
export function addDrops(skel: SkeletonData, clip: Clip, n: number, drops: readonly Drop[]): Clip {
  const one = (anim: AnimationData, facing: Facing): AnimationData => {
    const L = 64;
    const rest = evaluate(skel, emptyLocals(), { level: L, facing, noIk: true });
    const at = (f: number) => evaluate(skel, sampleClip(anim, f, n, facing), { level: L, facing });
    const bones = { ...(anim.bones ?? {}) };
    const slots = { ...(anim.slots ?? {}) };
    for (const d of drops) {
      const p = at(d.at);
      const b = p.byName[d.holder]!, rb = rest.byName[d.holder]!, rd = rest.byName[d.bone]!;
      const k = b.step - rb.step;
      const s = sinStep(k), c = cosStep(k);
      const dx = rd.x - rb.x, dy = rd.y - rb.y;
      const o: P2 = [b.x + c * dx + s * dy, b.y - s * dx + c * dy];
      const turn = k * SNAP_DEG;
      const t0: [number, number] = [o[0] - rd.x, o[1] - rd.y];
      const tl: [number, number] = [d.land.x - rd.x, d.land.y - rd.y];
      const mid: [number, number] = [(t0[0] + tl[0]) / 2, Math.min(t0[1], tl[1]) - 0.2];
      const f1 = d.land.f;
      bones[d.bone] = {
        translate: [{ f: d.at, v: t0, c: EASE_IN }, { f: (d.at + f1) / 2, v: mid, c: EASE_IN }, { f: f1, v: tl, c: EASE_OUT }, { f: f1 + 1, v: [tl[0], tl[1] - 0.18], c: EASE_IN }, { f: f1 + 2, v: tl }],
        rotate: [{ f: d.at, v: turn, c: EASE_IN }, { f: f1, v: d.land.rot, c: EASE_OUT }, { f: f1 + 1, v: d.land.rot + 4 }, { f: f1 + 2, v: d.land.rot }],
      };
      slots[d.slot] = [{ f: 0, v: null }, { f: d.at, v: d.slot }];
      slots[d.from] = [{ f: 0, v: d.from }, { f: d.at, v: null }];
    }
    return { ...anim, bones, slots };
  };
  return mapFacings(clip, one);
}

/** Applies `fn` to the base animation of a clip in each facing. */
export function mapFacings(clip: Clip, fn: (a: AnimationData, f: Facing) => AnimationData): Clip {
  if (Array.isArray(clip)) return clip.map((tr, i) => (i === 0 ? { ...tr, anim: fn(tr.anim, 'se') } : tr));
  if ('byFacing' in clip) {
    const byFacing: FacingClips['byFacing'] = {};
    for (const [f, c] of Object.entries(clip.byFacing) as [Facing, AnimationData | { anim: AnimationData }[]][]) byFacing[f] = Array.isArray(c) ? (mapFacings(c as never, (a) => fn(a, f)) as never) : fn(c, f);
    return { byFacing };
  }
  return fn(clip, 'se');
}

/** A one-frame animation holding every channel's last key (Dead: the end of Die). */
export function lastFrame(anim: AnimationData, name = `${anim.name}-end`): AnimationData {
  const last = <T>(ks?: Key<T>[]): Key<T>[] | undefined => (ks?.length ? [{ f: 0, v: ks.at(-1)!.v }] : undefined);
  const bones: NonNullable<AnimationData['bones']> = {};
  for (const [n, tl] of Object.entries(anim.bones ?? {})) {
    const b: (typeof bones)[string] = {};
    const r = last(tl.rotate), t = last(tl.translate), sy = last(tl.scaleY);
    if (r) b.rotate = r;
    if (t) b.translate = t;
    if (sy) b.scaleY = sy;
    bones[n] = b;
  }
  const ik: NonNullable<AnimationData['ik']> = {};
  for (const [n, v] of Object.entries(anim.ik ?? {})) {
    const m = last(v.mix), bd = last(v.bend);
    ik[n] = { ...(m ? { mix: m } : {}), ...(bd ? { bend: bd } : {}) };
  }
  const slots: NonNullable<AnimationData['slots']> = {};
  for (const [n, v] of Object.entries(anim.slots ?? {})) slots[n] = last(v)!;
  return { name, frames: 1, loop: false, bones, ik, slots };
}

// ------------------------------------------------------------------ skinned parts, memoised

interface SkinImg {
  x0: number;
  y0: number;
  w: number;
  h: number;
  pix: Int16Array;
  ord: Int16Array | Uint8Array;
  polys: number;
  ax: number;
  ay: number;
}
const SKIN = new Map<string, SkinImg>();
let SKIN_SCRATCH: Paper | null = null;
/**
 * Forgets every memoised skin. A skin's image depends on its key alone (memoSkin draws it at a
 * fixed place), so this changes no pixels: the sheet painter calls it at the start of each sheet
 * (paperSheetStart) to keep the memo's size down.
 */
export function clearSkinMemo(): void {
  SKIN.clear();
}

/**
 * `posed` moved by whole pixels (dx, dy canvas px at level L), every bone and tip. Positions are
 * worked out from whole pixels, so a bone lands on the same number whatever pose it came from.
 */
function shifted(posed: Posed, L: number, dx: number, dy: number): Posed {
  const mv = (v: number, d: number): number => (Math.round(v * L) + d) / L;
  const bones = posed.bones.map((b) => ({ ...b, x: mv(b.x, dx), y: mv(b.y, dy), tx: mv(b.tx, dx), ty: mv(b.ty, dy) }));
  return { ...posed, bones, byName: Object.fromEntries(bones.map((b) => [b.name, b])) };
}

/**
 * A skinned part (cloth over several bones) whose image is reused while its bones keep their
 * snapped angles and their whole-pixel offsets from one another: it is drawn once on a scratch
 * surface and blitted, moved with its first bone (as the skeleton's part cache does for rigid parts).
 *
 * The image is drawn with the pose moved so that the first bone sits on its rest-pose origin,
 * not where this pose has it: the same cloth drawn at another whole-pixel place on the canvas can
 * come out a pixel different (sampling at pixel centres), so drawing it where the first pose to
 * give the key happened to stand made the pixels depend on what was painted before.
 */
export function memoSkin(id: string, bones: readonly string[], draw: (c: Paper, ctx: DrawCtx) => void): Attachment {
  return {
    cache: false,
    draw: (c, _x, ctx) => {
      const p = ctx.posed, L = c.L;
      const B0 = p.byName[bones[0]!]!;
      const R0 = restPose(p.skel, p.level, p.facing).byName[bones[0]!]!;
      const ax = Math.round(B0.x * L), ay = Math.round(B0.y * L);
      const rx = Math.round(R0.x * L), ry = Math.round(R0.y * L);
      // skinMap's shading angle follows the chest's step whether or not the chest is a skin bone.
      let key = `${id}|${p.skel.name}|${p.facing}|${L}|${c.CW}x${c.CH}${c.lightX === 1 ? '' : '|m'}|c${p.byName.chest?.step ?? ''}`;
      for (const b of bones) {
        const B = p.byName[b];
        if (B) key += `|${B.step},${Math.round(B.x * L) - ax},${Math.round(B.y * L) - ay},${B.sy}`;
      }
      let img = SKIN.get(key);
      if (!img) {
        const s = (SKIN_SCRATCH ??= new Paper());
        s.begin(L, { w: c.CW / L, h: c.CH / L, footY: c.FY / c.CH });
        s.lightX = c.lightX;
        draw(s, { ...ctx, posed: shifted(p, L, rx - ax, ry - ay), prev: undefined });
        img = { x0: 0, y0: 0, w: 0, h: 0, pix: new Int16Array(0), ord: new Int16Array(0), polys: s.order, ax: rx, ay: ry };
        if (s.bx1 >= s.bx0) {
          img.x0 = s.bx0;
          img.y0 = s.by0;
          img.w = s.bx1 - s.bx0 + 1;
          img.h = s.by1 - s.by0 + 1;
          img.pix = new Int16Array(img.w * img.h);
          img.ord = img.polys <= 255 ? new Uint8Array(img.w * img.h) : new Int16Array(img.w * img.h);
          for (let y = 0; y < img.h; y++)
            for (let x = 0; x < img.w; x++) {
              const i = (s.by0 + y) * s.CW + s.bx0 + x;
              img.pix[y * img.w + x] = s.pix[i]!;
              img.ord[y * img.w + x] = s.pix[i]! >= 0 ? s.ord[i]! : 0;
            }
        }
        if (SKIN.size > 6000) SKIN.clear();
        SKIN.set(key, img);
      }
      const dx = ax - img.ax + img.x0, dy = ay - img.ay + img.y0;
      for (let y = 0; y < img.h; y++) {
        const Y = dy + y;
        if (Y < 0 || Y >= c.CH) continue;
        for (let x = 0; x < img.w; x++) {
          const v = img.pix[y * img.w + x]!;
          const X = dx + x;
          if (v < 0 || X < 0 || X >= c.CW) continue;
          const i = Y * c.CW + X;
          c.pix[i] = v;
          c.ord[i] = c.order + img.ord[y * img.w + x]!;
          if (X < c.bx0) c.bx0 = X;
          if (X > c.bx1) c.bx1 = X;
          if (Y < c.by0) c.by0 = Y;
          if (Y > c.by1) c.by1 = Y;
        }
      }
      c.order += img.polys;
    },
  };
}
