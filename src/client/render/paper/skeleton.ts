// Bone ("skeletal") animation for the paper-doll painter. See README.md, "Animating with bones",
// and docs/art-references/skeletal-animation.md for the research behind it.
//
// A skeleton is plain, JSON-serialisable data modelled on Spine / DragonBones semantics (bones
// with a rest transform, slots with a draw order per facing, two-bone IK constraints, animations
// as keyed timelines with bezier or stepped curves, events and a loop flag). Nothing here is a
// runtime library: skeletons are evaluated at bake time, deterministically, and the parts are
// re-rasterised from their outlines at each snapped angle, never rotated as images.
//
// Conventions (as rig.ts): units are figure units (one unit = L px at level L), measured from the
// foot point, y down. Angles are degrees in the figure's frame drawn facing SE: 0 = hanging
// straight down, + = swung forward (screen right), 180 = straight up. A bone at world angle a
// points along dir(a) = (sin a, cos a).
//
// Determinism: snapped angles use a fixed sine table built from closed forms with only sqrt and
// arithmetic (correctly rounded in IEEE 754), and atan2/acos are evaluated by series, so a bake
// gives the same bytes in every browser and in Node. Math.sin / Math.cos / Math.atan2 are never
// called while posing.

import { Anim } from '../contract.ts';
import { FRAMES, LOOPS } from '../frames.ts';
import { figurePalette, Paper, type FigurePalette, type Mat, type P2 } from './core.ts';
import { DRAWN_DEFAULT, planFacing, type Facing } from './facing.ts';
import type { PaperKindDef } from './registry.ts';
import { BODIES, SNAP_DEG, type BasePose, type BodyType } from './rig.ts';

// ------------------------------------------------------------------ deterministic trig

/** Snapped angle steps in a full turn (360 / 7.5). */
export const STEPS = 48;
const SIN_T = new Float64Array(STEPS);
const COS_T = new Float64Array(STEPS);
{
  // cos(m·15°) for m = 0..12 in closed form, then sin(k·7.5°) = sqrt((1 - cos(k·15°)) / 2).
  const r2 = Math.sqrt(2), r3 = Math.sqrt(3), r6 = Math.sqrt(6);
  const c15 = (r6 + r2) / 4, s15 = (r6 - r2) / 4;
  const C = [1, c15, r3 / 2, r2 / 2, 0.5, s15, 0, -s15, -0.5, -r2 / 2, -r3 / 2, -c15, -1];
  const q = C.map((c) => Math.sqrt((1 - c) / 2));
  for (let k = 0; k < STEPS; k++) SIN_T[k] = k <= 12 ? q[k]! : k <= 24 ? q[24 - k]! : k <= 36 ? -q[k - 24]! : -q[48 - k]!;
  for (let k = 0; k < STEPS; k++) COS_T[k] = SIN_T[(k + 12) % STEPS]!;
}
/** A step index wrapped to 0..47. */
export const wrapStep = (k: number): number => ((k % STEPS) + STEPS) % STEPS;
/** sin and cos of a snapped angle (step k = k · 7.5°), from the table. */
export const sinStep = (k: number): number => SIN_T[wrapStep(k)]!;
export const cosStep = (k: number): number => COS_T[wrapStep(k)]!;
/** Unit direction of a bone at step k (rig convention: 0 = down, + = forward). */
export const dirStep = (k: number): P2 => [sinStep(k), cosStep(k)];
/** A vector in a frame turned by step k, to world (the frame's +y runs along dir(k)). */
export const rotStep = (p: P2, k: number): P2 => {
  const s = sinStep(k), c = cosStep(k);
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
};
/** The inverse of rotStep. */
export const unrotStep = (p: P2, k: number): P2 => {
  const s = sinStep(k), c = cosStep(k);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

const R2D = 180 / Math.PI;
/** atan(t) for |t| ≤ tan(22.5°), radians: the Maclaurin series, a fixed number of terms. */
function atanSmall(t: number): number {
  const t2 = t * t;
  let p = t, s = 0;
  for (let n = 0; n < 26; n++) {
    s += (n & 1 ? -p : p) / (2 * n + 1);
    p *= t2;
  }
  return s;
}
/** atan(z) for z in [0, 1], radians. */
const atan01 = (z: number): number => (z > 0.41421356237309503 ? Math.PI / 4 + atanSmall((z - 1) / (z + 1)) : atanSmall(z));
/** Like Math.atan2(y, x) but in degrees and built from arithmetic only (the same bits everywhere). */
export function atan2Deg(y: number, x: number): number {
  if (y === 0 && x === 0) return 0;
  const ay = Math.abs(y), ax = Math.abs(x);
  let r = (ay <= ax ? atan01(ay / ax) : Math.PI / 2 - atan01(ax / ay)) * R2D;
  if (x < 0) r = 180 - r;
  return y < 0 ? -r : r;
}
/** acos in degrees, from atan2Deg. */
export const acosDeg = (x: number): number => {
  const c = Math.max(-1, Math.min(1, x));
  return atan2Deg(Math.sqrt(1 - c * c), c);
};
/** The rig angle of a vector (0 = down, 90 = forward/right, 180 = up), degrees in (-180, 180]. */
export const angleOf = (dx: number, dy: number): number => atan2Deg(dx, dy);
/** The shortest signed turn from a to b, degrees in [-180, 180). */
export const shortest = (d: number): number => d - 360 * Math.floor(d / 360 + 0.5);

// ------------------------------------------------------------------ snapping

/**
 * How far past the half step a raw angle must go before a bone leaves its previous snapped angle
 * (in steps): 0.1, so the switch happens 0.6 steps (4.5°) away. A slowly turning arm then never
 * flickers between two drawings.
 */
export const HYSTERESIS = 0.1;

/** The snapped step (0..47) of an angle in degrees, sticking to `prev` unless clearly past it. */
export function snapStep(deg: number, prev?: number): number {
  const s = deg / SNAP_DEG;
  if (prev !== undefined) {
    let d = s - prev;
    d -= STEPS * Math.floor(d / STEPS + 0.5);
    if (Math.abs(d) <= 0.5 + HYSTERESIS) return wrapStep(prev);
  }
  return wrapStep(Math.floor(s + 0.5));
}

// ------------------------------------------------------------------ the data model

/**
 * A bone. Its rest transform is given in its parent's frame: the offset (x, y) is where the bone
 * starts, measured in the parent's frame (at parent angle 0 that frame is the screen's: x right,
 * y down), and `rot` its rotation on top of the parent's. The root's offset is from the foot point.
 */
export interface BoneData {
  name: string;
  parent?: string;
  /** Length (units). */
  len: number;
  x: number;
  y: number;
  rot: number;
  /**
   * 'all' (default): the bone turns with its parent. 'translation': the parent carries it but its
   * angle is its own (a planted foot that stays flat, a banner held upright).
   */
  inherit?: 'all' | 'translation';
  /** Rest transform overrides per facing (from behind the shoulders and hips swap sides). */
  facing?: Partial<Record<Facing, { x?: number; y?: number; rot?: number }>>;
}

/** A slot: where a bone's part is drawn. Draw order is the skeleton's `drawOrder` per facing. */
export interface SlotData {
  name: string;
  bone: string;
  /** The attachment (a name in the AttachmentSet) per facing, or `all`; null or missing = nothing. */
  attachment: Partial<Record<Facing | 'all', string | null>>;
}

/** Two-bone IK: the chain bones[0] → bones[1] reaches for the target bone's origin. */
export interface IkData {
  name: string;
  bones: [string, string];
  target: string;
  /** +1: the middle joint bends forward (knees); -1: backward (elbows). */
  bend: 1 | -1;
  /** 0 = FK only, 1 = IK only. */
  mix: number;
  /**
   * A foot: the target's y when it stands on the ground. While its target is on the ground, the
   * figure is moved in whole pixels so the lowest planted foot stands exactly on it.
   */
  ground?: number;
}

export interface SkeletonData {
  name: string;
  body: BodyType;
  /** Parents before children. */
  bones: BoneData[];
  slots: SlotData[];
  /** Back-to-front slot names per drawn facing (default: the slots in order). */
  drawOrder?: Partial<Record<Facing, string[]>>;
  /** Applied after FK, in this order. */
  ik?: IkData[];
}

/** An interpolation curve to the next key: linear, stepped, or a cubic bezier (Spine's cx1, cy1, cx2, cy2). */
export type Curve = 'linear' | 'stepped' | [number, number, number, number];
export const EASE: Curve = [0.42, 0, 0.58, 1];
export const EASE_IN: Curve = [0.42, 0, 1, 1];
export const EASE_OUT: Curve = [0, 0, 0.58, 1];

/** A key at frame `f` (may be fractional), with the curve toward the next key. */
export interface Key<T> {
  f: number;
  v: T;
  c?: Curve;
}

/** Per-bone channels, all relative to the rest transform: rotate (deg, added), translate (units, added, in the parent's frame), scale-y (squash along the bone, multiplied). */
export interface BoneTimeline {
  rotate?: Key<number>[];
  translate?: Key<[number, number]>[];
  scaleY?: Key<number>[];
}

/**
 * An event: something the drawing or the game reacts to (`smear` behind a weapon, `release` of an
 * arrow, `step` of a foot). Active on frames f ≤ t < f + len (len defaults to 1).
 */
export interface AnimEvent {
  f: number;
  name: string;
  len?: number;
  bone?: string;
  int?: number;
  str?: string;
}

export interface AnimationData {
  name: string;
  /** Length in frames (keys run from 0 to frames; a loop wraps back to its first key). */
  frames: number;
  loop: boolean;
  bones?: Record<string, BoneTimeline>;
  ik?: Record<string, { mix?: Key<number>[]; bend?: Key<1 | -1>[] }>;
  /** Attachment swaps (stepped): an open hand to a fist, a weapon dropped. */
  slots?: Record<string, Key<string | null>[]>;
  /** Draw order changes (stepped). */
  drawOrder?: Key<Partial<Record<Facing, string[]>>>[];
  events?: AnimEvent[];
}

// ------------------------------------------------------------------ curves and sampling

const bez = (t: number, p1: number, p2: number): number => {
  const m = 1 - t;
  return 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t;
};

/** A curve's eased value at u in [0, 1] (bezier solved by a fixed bisection: the same bits everywhere). */
export function curveAt(c: Curve | undefined, u: number): number {
  if (!c || c === 'linear') return u;
  if (c === 'stepped') return u >= 1 ? 1 : 0;
  const [x1, y1, x2, y2] = c;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    if (bez(t, x1, x2) < u) lo = t;
    else hi = t;
  }
  return bez((lo + hi) / 2, y1, y2);
}

/** The two keys around time t and the eased fraction between them (null for no keys). */
function segment<T>(keys: readonly Key<T>[] | undefined, t: number, frames: number, loop: boolean): [Key<T>, Key<T>, number] | null {
  if (!keys || keys.length === 0) return null;
  const first = keys[0]!, last = keys[keys.length - 1]!;
  if (keys.length === 1) return [first, first, 0];
  if (loop) {
    const tt = t - frames * Math.floor(t / frames);
    if (tt < first.f || tt >= last.f) {
      const a = last.f, b = first.f + frames;
      const x = tt < first.f ? tt + frames : tt;
      return [last, first, curveAt(last.c, b > a ? (x - a) / (b - a) : 0)];
    }
    t = tt;
  } else {
    if (t <= first.f) return [first, first, 0];
    if (t >= last.f) return [last, last, 0];
  }
  let i = 0;
  while (i + 2 < keys.length && keys[i + 1]!.f <= t) i++;
  const a = keys[i]!, b = keys[i + 1]!;
  return [a, b, curveAt(a.c, b.f > a.f ? (t - a.f) / (b.f - a.f) : 0)];
}

const sampleNum = (keys: readonly Key<number>[] | undefined, t: number, frames: number, loop: boolean): number | undefined => {
  const s = segment(keys, t, frames, loop);
  return s ? s[0].v + (s[1].v - s[0].v) * s[2] : undefined;
};
const sampleStep = <T>(keys: readonly Key<T>[] | undefined, t: number, frames: number, loop: boolean): T | undefined => {
  const s = segment(keys, t, frames, loop);
  return s ? (s[2] >= 1 ? s[1].v : s[0].v) : undefined;
};

/** A bone's channels at one instant (missing = unchanged from rest). */
export interface BoneLocal {
  rot?: number;
  x?: number;
  y?: number;
  sy?: number;
}

/** A sampled animation: channel values relative to the rest pose, before FK and IK. */
export interface Locals {
  bones: Record<string, BoneLocal>;
  ik: Record<string, { mix?: number; bend?: 1 | -1 }>;
  slots: Record<string, string | null>;
  drawOrder?: Partial<Record<Facing, string[]>>;
  /** Events active at this instant. */
  events: AnimEvent[];
}

export const emptyLocals = (): Locals => ({ bones: {}, ik: {}, slots: {}, events: [] });

/** Samples an animation at time t (frames). Only the keyed channels are present. */
export function sampleAnimation(anim: AnimationData, t: number): Locals {
  const { frames, loop } = anim;
  const out = emptyLocals();
  for (const [name, tl] of Object.entries(anim.bones ?? {})) {
    const b: BoneLocal = {};
    const r = sampleNum(tl.rotate, t, frames, loop);
    if (r !== undefined) b.rot = r;
    const tr = segment(tl.translate, t, frames, loop);
    if (tr) {
      b.x = tr[0].v[0] + (tr[1].v[0] - tr[0].v[0]) * tr[2];
      b.y = tr[0].v[1] + (tr[1].v[1] - tr[0].v[1]) * tr[2];
    }
    const s = sampleNum(tl.scaleY, t, frames, loop);
    if (s !== undefined) b.sy = s;
    out.bones[name] = b;
  }
  for (const [name, tl] of Object.entries(anim.ik ?? {})) {
    const k: { mix?: number; bend?: 1 | -1 } = {};
    const m = sampleNum(tl.mix, t, frames, loop);
    if (m !== undefined) k.mix = m;
    const b = sampleStep(tl.bend, t, frames, loop);
    if (b !== undefined) k.bend = b;
    out.ik[name] = k;
  }
  for (const [name, keys] of Object.entries(anim.slots ?? {})) {
    const v = sampleStep(keys, t, frames, loop);
    if (v !== undefined) out.slots[name] = v;
  }
  const order = sampleStep(anim.drawOrder, t, frames, loop);
  if (order) out.drawOrder = order;
  const tt = loop ? t - frames * Math.floor(t / frames) : t;
  for (const e of anim.events ?? []) if (tt >= e.f && tt < e.f + (e.len ?? 1)) out.events.push(e);
  return out;
}

/**
 * Layers one sampled animation over another (Spine's track mixing). 'add' adds the overlay's
 * channels scaled by alpha (a breathing overlay on any stance); 'replace' moves the channels the
 * overlay keys toward its values by alpha (an attack's arms over a walk's legs). IK mixes blend,
 * slot swaps, draw order and bends take over from alpha ≥ 0.5, events add up.
 */
export function mixLocals(base: Locals, over: Locals, alpha = 1, mode: 'add' | 'replace' = 'add'): Locals {
  const out: Locals = { bones: {}, ik: { ...base.ik }, slots: { ...base.slots }, drawOrder: base.drawOrder, events: [...base.events, ...over.events] };
  for (const [n, b] of Object.entries(base.bones)) out.bones[n] = { ...b };
  for (const [n, o] of Object.entries(over.bones)) {
    const b = (out.bones[n] ??= {});
    for (const ch of ['rot', 'x', 'y'] as const) {
      const v = o[ch];
      if (v === undefined) continue;
      b[ch] = mode === 'add' ? (b[ch] ?? 0) + v * alpha : (b[ch] ?? 0) + (v - (b[ch] ?? 0)) * alpha;
    }
    if (o.sy !== undefined) b.sy = mode === 'add' ? (b.sy ?? 1) * (1 + (o.sy - 1) * alpha) : (b.sy ?? 1) + (o.sy - (b.sy ?? 1)) * alpha;
  }
  for (const [n, o] of Object.entries(over.ik)) {
    const k = { ...(out.ik[n] ?? {}) };
    if (o.mix !== undefined) k.mix = (k.mix ?? o.mix) + (o.mix - (k.mix ?? o.mix)) * alpha;
    if (o.bend !== undefined && alpha >= 0.5) k.bend = o.bend;
    out.ik[n] = k;
  }
  if (alpha >= 0.5) {
    Object.assign(out.slots, over.slots);
    if (over.drawOrder) out.drawOrder = over.drawOrder;
  }
  return out;
}

/** One layer of a clip: an animation, its weight and how it combines with the layers under it. */
export interface Track {
  anim: AnimationData;
  alpha?: number;
  mode?: 'add' | 'replace';
}
/** A clip authored per drawn facing (mocap projected for SE and for NE). Missing facings use SE. */
export interface FacingClips {
  byFacing: Partial<Record<Facing, AnimationData | Track[]>>;
}
/** What plays for an Anim: one animation, or layers (the first is the base, e.g. a stance plus breathing), or either per facing. */
export type Clip = AnimationData | Track[] | FacingClips;

const tracksOf = (clip: Clip, facing: Facing = 'se'): Track[] => {
  if (Array.isArray(clip)) return clip;
  if ('byFacing' in clip) {
    const c = clip.byFacing[facing] ?? clip.byFacing.se ?? Object.values(clip.byFacing)[0];
    if (!c) throw new Error('clip: byFacing is empty');
    return tracksOf(c);
  }
  return [{ anim: clip }];
};
/** The base animation of a clip (for a facing). */
export const clipBase = (clip: Clip, facing: Facing = 'se'): AnimationData => tracksOf(clip, facing)[0]!.anim;

/**
 * Samples a clip at painted frame `fr` of `n`: every track's time is scaled so the track spans the
 * clip (an 8-frame breathing loop over a 12-frame walk breathes once per stride).
 */
export function sampleClip(clip: Clip, fr: number, n: number = clipBase(clip).frames, facing: Facing = 'se'): Locals {
  const tracks = tracksOf(clip, facing);
  let out: Locals | null = null;
  for (const tr of tracks) {
    const l = sampleAnimation(tr.anim, (fr * tr.anim.frames) / n);
    out = out ? mixLocals(out, l, tr.alpha ?? 1, tr.mode ?? 'add') : l;
  }
  return out ?? emptyLocals();
}

// ------------------------------------------------------------------ authoring helpers

/** A rest joint for `bonesFromJoints`: the bone runs from `from` to `to` (world units, SE facing). */
export interface JointDef {
  name: string;
  parent?: string;
  from: P2;
  to: P2;
  inherit?: 'all' | 'translation';
  /** The same bone's rest joints in another drawn facing (NE: shoulders and hips swap sides). */
  facing?: Partial<Record<Facing, { from: P2; to: P2 }>>;
}

/**
 * Bones from world-space rest joints (the way key art is drawn: points on the figure). Lengths,
 * local rotations and offsets are worked out so that FK at rest puts every joint back where it was
 * given. Parents first.
 */
export function bonesFromJoints(defs: readonly JointDef[]): BoneData[] {
  const solve = (pick: (d: JointDef) => { from: P2; to: P2 }): { len: number; x: number; y: number; rot: number }[] => {
    const world = new Map<string, { from: P2; raw: number; step: number }>();
    return defs.map((d) => {
      const { from, to } = pick(d);
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const raw = len > 0 ? angleOf(dx, dy) : 0;
      const p = d.parent ? world.get(d.parent) : undefined;
      if (d.parent && !p) throw new Error(`bone ${d.name}: parent ${d.parent} must come first`);
      const inherit = (d.inherit ?? 'all') === 'all';
      const rot = p && inherit ? raw - p.raw : raw;
      const off: P2 = p ? unrotStep([from[0] - p.from[0], from[1] - p.from[1]], p.step) : [from[0], from[1]];
      world.set(d.name, { from, raw, step: snapStep(raw) });
      return { len, x: off[0], y: off[1], rot };
    });
  };
  const se = solve((d) => d);
  const others = (['sw', 'ne', 'nw'] as Facing[]).filter((f) => defs.some((d) => d.facing?.[f]));
  const per = others.map((f) => [f, solve((d) => d.facing?.[f] ?? d)] as const);
  return defs.map((d, i) => {
    const b: BoneData = { name: d.name, len: round6(se[i]!.len), x: round6(se[i]!.x), y: round6(se[i]!.y), rot: round6(se[i]!.rot) };
    if (d.parent) b.parent = d.parent;
    if (d.inherit === 'translation') b.inherit = 'translation';
    for (const [f, vals] of per) {
      const v = vals[i]!;
      if (round6(v.x) !== b.x || round6(v.y) !== b.y || round6(v.rot) !== b.rot) (b.facing ??= {})[f] = { x: round6(v.x), y: round6(v.y), rot: round6(v.rot) };
    }
    return b;
  });
}
/** Rounds authored numbers so skeletons read cleanly as JSON (and survive a round trip exactly). */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;

/** A pose key for `animationFromPoses`: per-bone channels at a frame, with the curve to the next pose. */
export interface PoseKey {
  f: number;
  c?: Curve;
  bones: Record<string, BoneLocal>;
  ik?: Record<string, number>;
}

/**
 * Builds an animation from whole poses (the way the paper rig authors keys): every channel any
 * pose mentions gets a key in every pose, defaulting to rest (0, or 1 for scale-y), so poses read
 * like the old KeySet entries.
 */
export function animationFromPoses(name: string, frames: number, loop: boolean, poses: readonly PoseKey[], events: AnimEvent[] = []): AnimationData {
  const bones: Record<string, BoneTimeline> = {};
  const used = new Map<string, Set<'rot' | 'xy' | 'sy'>>();
  for (const p of poses)
    for (const [n, b] of Object.entries(p.bones)) {
      const s = used.get(n) ?? new Set();
      if (b.rot !== undefined) s.add('rot');
      if (b.x !== undefined || b.y !== undefined) s.add('xy');
      if (b.sy !== undefined) s.add('sy');
      used.set(n, s);
    }
  const key = <T>(p: PoseKey, v: T): Key<T> => (p.c ? { f: p.f, v, c: p.c } : { f: p.f, v });
  for (const [n, chans] of used) {
    const tl: BoneTimeline = {};
    if (chans.has('rot')) tl.rotate = poses.map((p) => key(p, p.bones[n]?.rot ?? 0));
    if (chans.has('xy')) tl.translate = poses.map((p) => key(p, [p.bones[n]?.x ?? 0, p.bones[n]?.y ?? 0] as [number, number]));
    if (chans.has('sy')) tl.scaleY = poses.map((p) => key(p, p.bones[n]?.sy ?? 1));
    bones[n] = tl;
  }
  const ikNames = new Set(poses.flatMap((p) => Object.keys(p.ik ?? {})));
  const out: AnimationData = { name, frames, loop, bones };
  if (ikNames.size) out.ik = Object.fromEntries([...ikNames].map((n) => [n, { mix: poses.map((p) => key(p, p.ik?.[n] ?? 1)) }]));
  if (events.length) out.events = events;
  return out;
}

/** The painted frame count and loop flag of an Anim (frames.ts). */
export const animFrames = (a: Anim): { frames: number; loop: boolean } => ({ frames: FRAMES[a] ?? 8, loop: LOOPS.has(a) });

// ------------------------------------------------------------------ evaluation: FK, then IK

/** A bone posed for one frame: its origin and tip on whole pixels and its snapped world angle. */
export interface BoneXf {
  name: string;
  i: number;
  /** Origin (units, whole pixels at the level). */
  x: number;
  y: number;
  /** Unsnapped world angle (deg); children inherit this. */
  raw: number;
  /** Snapped world angle step (0..47) and the angle in degrees (step · 7.5). */
  step: number;
  a: number;
  /** Length (units, after scale-y) and scale-y (in 1/16ths). */
  len: number;
  sy: number;
  /** Tip (units, whole pixels). */
  tx: number;
  ty: number;
}

/** A skeleton posed for one frame at one level and drawn facing. */
export interface Posed {
  skel: SkeletonData;
  level: number;
  facing: Facing;
  bones: BoneXf[];
  byName: Record<string, BoneXf>;
  /** The attachment shown in each slot this frame. */
  slots: Record<string, string | null>;
  /** Slots back to front. */
  order: string[];
  events: AnimEvent[];
  /** How far the ground correction moved the figure this frame (canvas px, + = down). */
  lift: number;
}

interface Compiled {
  idx: Map<string, number>;
  parent: Int32Array;
  /** Ground-IK target bones: they stay put when the ground correction moves the figure. */
  groundTarget: Uint8Array;
  ik: { d: IkData; i1: number; i2: number; it: number }[];
}
const COMPILED = new WeakMap<SkeletonData, Compiled>();

function compile(skel: SkeletonData): Compiled {
  const got = COMPILED.get(skel);
  if (got) return got;
  const idx = new Map<string, number>();
  const parent = new Int32Array(skel.bones.length).fill(-1);
  skel.bones.forEach((b, i) => {
    if (idx.has(b.name)) throw new Error(`skeleton ${skel.name}: bone ${b.name} twice`);
    if (b.parent !== undefined) {
      const p = idx.get(b.parent);
      if (p === undefined) throw new Error(`skeleton ${skel.name}: bone ${b.name}'s parent ${b.parent} must come before it`);
      parent[i] = p;
    }
    idx.set(b.name, i);
  });
  const need = (n: string, what: string): number => {
    const i = idx.get(n);
    if (i === undefined) throw new Error(`skeleton ${skel.name}: ${what} names unknown bone ${n}`);
    return i;
  };
  for (const s of skel.slots) need(s.bone, `slot ${s.name}`);
  const groundTarget = new Uint8Array(skel.bones.length);
  const ik = (skel.ik ?? []).map((d) => {
    const c = { d, i1: need(d.bones[0], `ik ${d.name}`), i2: need(d.bones[1], `ik ${d.name}`), it: need(d.target, `ik ${d.name}`) };
    if (parent[c.i2] !== c.i1) throw new Error(`skeleton ${skel.name}: ik ${d.name}: ${d.bones[1]} must be a child of ${d.bones[0]}`);
    if (d.ground !== undefined) groundTarget[c.it] = 1;
    return c;
  });
  const out = { idx, parent, groundTarget, ik };
  COMPILED.set(skel, out);
  return out;
}

export interface EvaluateOptions {
  level: number;
  /** The drawn facing (se or ne; mirrored facings are drawn from their partner). */
  facing: Facing;
  /** The previous frame of the same clip, for angle hysteresis. */
  prev?: Posed;
  /** Skip IK and the ground correction (the rest pose for key art). */
  noIk?: boolean;
}

/**
 * Poses a skeleton for one frame, deterministically:
 * 1. FK, parents first: each bone's raw world angle is its parent's raw angle plus its own (rest +
 *    keyed); the angle snaps to 7.5° with hysteresis against `prev`; its origin is placed from the
 *    parent's *rounded* origin and *snapped* angle and rounded to whole pixels.
 * 2. IK, in the skeleton's order: two-bone analytic IK (law of cosines, reach clamped to 0.999),
 *    blended with FK by mix, then snapped by searching the neighbouring angle steps for the pair
 *    whose pixel end lands nearest the target; the chain's descendants are placed again.
 * 3. Ground: if a foot IK's target is on the ground, the figure (not the targets) moves by whole
 *    pixels so the lowest planted foot stands exactly on its target.
 */
export function evaluate(skel: SkeletonData, locals: Locals, opts: EvaluateOptions): Posed {
  const C = compile(skel);
  const { level: L, facing } = opts;
  const q = (v: number): number => Math.round(v * L) / L;
  const bones = skel.bones;
  const n = bones.length;
  const prev = opts.prev && opts.prev.skel === skel && opts.prev.facing === facing && opts.prev.level === L ? opts.prev : undefined;
  const lrot = new Float64Array(n), ox = new Float64Array(n), oy = new Float64Array(n), sy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bones[i]!, f = b.facing?.[facing], l = locals.bones[b.name];
    lrot[i] = (f?.rot ?? b.rot) + (l?.rot ?? 0);
    ox[i] = (f?.x ?? b.x) + (l?.x ?? 0);
    oy[i] = (f?.y ?? b.y) + (l?.y ?? 0);
    sy[i] = Math.round((l?.sy ?? 1) * 16) / 16;
  }
  const out: BoneXf[] = new Array(n);
  const fixed = new Uint8Array(n);
  const place = (i: number): void => {
    const b = bones[i]!, p = C.parent[i]!;
    let raw: number, x: number, y: number;
    if (p < 0) {
      raw = fixed[i] ? out[i]!.raw : lrot[i]!;
      x = q(ox[i]!);
      y = q(oy[i]!);
    } else {
      const P = out[p]!;
      raw = fixed[i] ? out[i]!.raw : (b.inherit === 'translation' ? 0 : P.raw) + lrot[i]!;
      const w = rotStep([ox[i]!, oy[i]! * P.sy], P.step);
      x = q(P.x + w[0]);
      y = q(P.y + w[1]);
    }
    const step = fixed[i] ? out[i]!.step : snapStep(raw, prev?.bones[i]?.step);
    const len = b.len * sy[i]!;
    out[i] = { name: b.name, i, x, y, raw, step, a: step * SNAP_DEG, len, sy: sy[i]!, tx: q(x + sinStep(step) * len), ty: q(y + cosStep(step) * len) };
  };
  for (let i = 0; i < n; i++) place(i);

  const isUnder = (j: number, root: number): boolean => {
    for (let k = j; k >= 0; k = C.parent[k]!) if (k === root) return true;
    return false;
  };
  const mixOf = (d: IkData): number => locals.ik[d.name]?.mix ?? d.mix;
  if (!opts.noIk)
    for (const { d, i1, i2, it } of C.ik) {
      const mix = Math.max(0, Math.min(1, mixOf(d)));
      if (mix <= 0) continue;
      const bend = locals.ik[d.name]?.bend ?? d.bend;
      const B1 = out[i1]!, B2 = out[i2]!, T = out[it]!;
      const l1 = B1.len, l2 = B2.len;
      const dx = T.x - B1.x, dy = T.y - B1.y;
      const d0 = Math.sqrt(dx * dx + dy * dy);
      if (d0 < 1e-9 || l1 <= 0 || l2 <= 0) continue;
      const dd = Math.max(Math.abs(l1 - l2) + 1e-6, Math.min((l1 + l2) * 0.999, d0));
      const ux = dx / d0, uy = dy / d0;
      const cosA = Math.max(-1, Math.min(1, (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd)));
      const sb = bend * Math.sqrt(1 - cosA * cosA);
      // The middle joint: the target direction turned by ±alpha (no trig: a rotation by cos/sin).
      const ex = B1.x + l1 * (ux * cosA + uy * sb), ey = B1.y + l1 * (uy * cosA - ux * sb);
      const a1 = angleOf(ex - B1.x, ey - B1.y);
      const a2 = angleOf(B1.x + ux * dd - ex, B1.y + uy * dd - ey);
      const m1 = B1.raw + shortest(a1 - B1.raw) * mix, m2 = B2.raw + shortest(a2 - B2.raw) * mix;
      let s1 = snapStep(m1, prev?.bones[i1]?.step), s2 = snapStep(m2, prev?.bones[i2]?.step);
      if (mix >= 1) {
        // Pixel-exact reach: of the neighbouring snapped pairs, the one whose end lands nearest
        // the target (the hysteresis choice wins ties and near-ties).
        let best = Infinity, b1 = s1, b2 = s2;
        for (const e1 of [0, -1, 1])
          for (const e2 of [0, -1, 1]) {
            const k1 = wrapStep(s1 + e1), k2 = wrapStep(s2 + e2);
            const w = rotStep([ox[i2]!, oy[i2]! * B1.sy], k1);
            const jx = q(B1.x + w[0]), jy = q(B1.y + w[1]);
            const fx = q(jx + sinStep(k2) * l2), fy = q(jy + cosStep(k2) * l2);
            const err = ((fx - T.x) * L) ** 2 + ((fy - T.y) * L) ** 2 * 1.5;
            const cost = err + 0.35 * (Math.abs(e1) + Math.abs(e2));
            if (cost < best) [best, b1, b2] = [cost, k1, k2];
          }
        s1 = b1;
        s2 = b2;
      }
      out[i1] = { ...B1, raw: s1 * SNAP_DEG, step: s1, a: s1 * SNAP_DEG };
      out[i2] = { ...B2, raw: s2 * SNAP_DEG, step: s2, a: s2 * SNAP_DEG };
      fixed[i1] = fixed[i2] = 1;
      for (let j = i1; j < n; j++) if (isUnder(j, i1)) place(j);
    }

  // Ground: the lowest planted foot stands exactly on its target.
  let lift = 0;
  if (!opts.noIk) {
    let lowest = -Infinity;
    for (const { d, i2, it } of C.ik) {
      if (d.ground === undefined || mixOf(d) < 1) continue;
      const T = out[it]!, F = out[i2]!;
      if (T.y < d.ground - 0.02) continue;
      if (F.ty > lowest) {
        lowest = F.ty;
        lift = Math.round((T.y - F.ty) * L);
      }
    }
    if (lift !== 0)
      for (let i = 0; i < n; i++) {
        if (C.groundTarget[i]) continue;
        const b = out[i]!;
        out[i] = { ...b, y: q(b.y + lift / L), ty: q(b.ty + lift / L) };
      }
  }

  const byName: Record<string, BoneXf> = {};
  for (const b of out) byName[b.name] = b;
  const slots: Record<string, string | null> = {};
  for (const s of skel.slots) slots[s.name] = s.name in locals.slots ? locals.slots[s.name]! : (s.attachment[facing] ?? s.attachment.all ?? null);
  const order = locals.drawOrder?.[facing] ?? skel.drawOrder?.[facing] ?? skel.slots.map((s) => s.name);
  return { skel, level: L, facing, bones: out, byName, slots, order, events: locals.events, lift };
}

const RESTS = new WeakMap<SkeletonData, Map<string, Posed>>();
/** The rest (setup) pose at a level and facing: FK only (cached). */
export function restPose(skel: SkeletonData, level: number, facing: Facing): Posed {
  let m = RESTS.get(skel);
  if (!m) RESTS.set(skel, (m = new Map()));
  const key = `${level}|${facing}`;
  let p = m.get(key);
  if (!p) m.set(key, (p = evaluate(skel, emptyLocals(), { level, facing, noIk: true })));
  return p;
}

const BAKES = new WeakMap<SkeletonData, WeakMap<object, Map<string, Posed[]>>>();
/**
 * Every frame of a clip, posed in order (frame f's hysteresis follows on from frame f-1). A loop is
 * run twice and the second pass kept, so frame 0 follows on from the last frame too. Cached per
 * skeleton, clip, level and facing.
 */
export function bakeClip(skel: SkeletonData, clip: Clip, level: number, facing: Facing, n: number = clipBase(clip, facing).frames, loop: boolean = clipBase(clip, facing).loop): Posed[] {
  let bySkel = BAKES.get(skel);
  if (!bySkel) BAKES.set(skel, (bySkel = new WeakMap()));
  let byClip = bySkel.get(clip);
  if (!byClip) bySkel.set(clip, (byClip = new Map()));
  const key = `${level}|${facing}|${n}|${loop}`;
  const got = byClip.get(key);
  if (got) return got;
  let prev: Posed | undefined;
  const run = (): Posed[] => {
    const out: Posed[] = [];
    for (let f = 0; f < n; f++) {
      prev = evaluate(skel, sampleClip(clip, f, n, facing), { level, facing, prev });
      out.push(prev);
    }
    return out;
  };
  let frames = run();
  if (loop && n > 1) frames = run();
  byClip.set(key, frames);
  return frames;
}

/** The positions and angles of a posed skeleton as numbers (for hashing and comparing bakes). */
export const posedNumbers = (p: Posed): number[] => p.bones.flatMap((b) => [b.x, b.y, b.step, b.tx, b.ty, b.sy]).concat(p.lift);

/**
 * Rotation offsets (Locals) that put the bones at the given world angles (deg), e.g. to drive a
 * skeleton from an old FootPose. Bones not named keep their rest angle relative to their parent.
 */
export function localsFromWorld(skel: SkeletonData, world: Record<string, number>, facing: Facing = 'se'): Locals {
  const C = compile(skel);
  const out = emptyLocals();
  const w = new Float64Array(skel.bones.length);
  skel.bones.forEach((b, i) => {
    const rest = b.facing?.[facing]?.rot ?? b.rot;
    const p = C.parent[i]!;
    const base = p >= 0 && b.inherit !== 'translation' ? w[p]! : 0;
    const want = world[b.name];
    w[i] = want ?? base + rest;
    if (want !== undefined) out.bones[b.name] = { rot: want - base - rest };
  });
  return out;
}

// ------------------------------------------------------------------ drawing: parts on bones

/**
 * Where a part is drawn: its bone's snapped transform, with maps from bone-local coordinates and
 * from the rest pose (key-art coordinates). While a part is being cached its origin is (0, 0):
 * draw only through `at`, `r` and `tip`, never from absolute positions.
 */
export interface PartXf {
  bone: BoneXf;
  /** The bone origin (units, whole pixels). */
  o: P2;
  /** The bone tip. */
  tip: P2;
  /** Snapped steps the bone has turned since rest (0 at rest). */
  turned: number;
  /** A bone-local point (x across, y along the bone, units; y is squashed by scale-y) to figure units. */
  at(p: P2): P2;
  /** A point of the rest pose (static key art, same facing) to figure units: it rides on the bone. */
  r(p: P2): P2;
  /** A rest-pose angle (deg, rig convention: a blade's `bl`, a skull's tilt) turned with the bone. */
  turn(deg: number): number;
}

/** What a drawing pass knows about the frame (uncached parts only; cached parts must not use it). */
export interface DrawCtx {
  posed: Posed;
  /** The previous frame of the clip (smears sweep from there). */
  prev?: Posed;
  events: AnimEvent[];
}

export type DrawPart = (c: Paper, x: PartXf, ctx: DrawCtx) => void;
/**
 * A part. `cache` (default true): its pixels depend only on its bone's snapped angle, scale-y and
 * the level, so they are drawn once per angle and reused (an unchanged angle gives identical
 * pixels: no boil). Set false for parts that read the context (smears, cloth that follows two
 * bones), which are drawn straight onto the frame.
 */
export interface Attachment {
  draw: DrawPart;
  cache?: boolean;
}
export type AttachmentSet = Record<string, Attachment | DrawPart>;

function partXf(bone: BoneXf, rest: BoneXf, o: P2): PartXf {
  const turned = wrapStep(bone.step - rest.step);
  const same = turned === 0 && bone.sy === 1;
  return {
    bone,
    o,
    tip: [o[0] + (bone.tx - bone.x), o[1] + (bone.ty - bone.y)],
    turned: turned > STEPS / 2 ? turned - STEPS : turned,
    at: (p) => {
      const w = rotStep([p[0], p[1] * bone.sy], bone.step);
      return [o[0] + w[0], o[1] + w[1]];
    },
    r: (p) => {
      const dx = p[0] - rest.x, dy = p[1] - rest.y;
      if (same) return [o[0] + dx, o[1] + dy];
      const l = unrotStep([dx, dy], rest.step);
      const w = rotStep([l[0], l[1] * bone.sy], bone.step);
      return [o[0] + w[0], o[1] + w[1]];
    },
    turn: (deg) => deg + (bone.step - rest.step) * SNAP_DEG,
  };
}

interface PartImg {
  x0: number;
  y0: number;
  w: number;
  h: number;
  pix: Int16Array;
  ord: Int16Array;
  polys: number;
}
const PARTS = new WeakMap<object, Map<string, PartImg>>();
let SCRATCH: Paper | null = null;
let partDraws = 0;
/** How many part images have been drawn (cache misses), for tests and benches. */
export const partDrawCount = (): number => partDraws;

function partImage(att: Attachment, key: string, slotIndex: number, posed: Posed, bone: BoneXf, rest: BoneXf): PartImg {
  let m = PARTS.get(att);
  if (!m) PARTS.set(att, (m = new Map()));
  const got = m.get(key);
  if (got) return got;
  partDraws++;
  const s = (SCRATCH ??= new Paper());
  const cv = BODIES[posed.skel.body].canvas;
  s.begin(posed.level, { w: cv.w * 2, h: cv.h * 2, footY: 0.5 });
  // A stable order base per slot: the part's band offsets are the same whatever is drawn before it.
  const base = slotIndex * 32;
  s.order = base;
  att.draw(s, partXf(bone, rest, [0, 0]), { posed, events: [] });
  const img: PartImg = { x0: 0, y0: 0, w: 0, h: 0, pix: new Int16Array(0), ord: new Int16Array(0), polys: s.order - base };
  if (s.bx1 >= s.bx0) {
    img.x0 = s.bx0 - s.FX;
    img.y0 = s.by0 - s.FY;
    img.w = s.bx1 - s.bx0 + 1;
    img.h = s.by1 - s.by0 + 1;
    img.pix = new Int16Array(img.w * img.h);
    img.ord = new Int16Array(img.w * img.h);
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < img.w; x++) {
        const i = (s.by0 + y) * s.CW + s.bx0 + x;
        img.pix[y * img.w + x] = s.pix[i]!;
        img.ord[y * img.w + x] = s.pix[i]! >= 0 ? s.ord[i]! - base : 0;
      }
  }
  m.set(key, img);
  return img;
}

function blit(c: Paper, img: PartImg, o: P2): void {
  const bx = c.FX + Math.round(o[0] * c.L) + img.x0, by = c.FY + Math.round(o[1] * c.L) + img.y0;
  for (let y = 0; y < img.h; y++) {
    const Y = by + y;
    if (Y < 0 || Y >= c.CH) continue;
    for (let x = 0; x < img.w; x++) {
      const v = img.pix[y * img.w + x]!;
      const X = bx + x;
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
}

const asAtt = (a: Attachment | DrawPart): Attachment => (typeof a === 'function' ? { draw: a } : a);

/**
 * Draws a posed skeleton's slots back to front on `c` (already begun at the posed level): each
 * attachment at its bone's snapped transform, cached parts from their image per (part, angle step,
 * scale-y, level). Codes only; the finishing passes (contact, clusters, steady, colours with the
 * one outline round the whole figure) run afterwards, as for any paper figure.
 */
export function drawSkeleton(c: Paper, posed: Posed, atts: AttachmentSet, opts: { prev?: Posed; only?: (slot: string) => boolean } = {}): void {
  const skel = posed.skel;
  const rest = restPose(skel, posed.level, posed.facing);
  const slotIdx = new Map(skel.slots.map((s, i) => [s.name, i] as const));
  const ctx: DrawCtx = { posed, prev: opts.prev, events: posed.events };
  for (const name of posed.order) {
    if (opts.only && !opts.only(name)) continue;
    const si = slotIdx.get(name);
    const an = posed.slots[name];
    if (si === undefined || !an) continue;
    const raw = atts[an];
    if (!raw) continue;
    const att = asAtt(raw);
    const bone = posed.byName[skel.slots[si]!.bone]!;
    const rb = rest.bones[bone.i]!;
    if (att.cache === false) {
      att.draw(c, partXf(bone, rb, [bone.x, bone.y]), ctx);
      continue;
    }
    const key = `${skel.name}|${posed.facing}|${name}|${an}|${bone.step}|${bone.sy}|${posed.level}`;
    blit(c, partImage(att, key, si, posed, bone, rb), [bone.x, bone.y]);
  }
}

/** Forgets every cached part image (after editing a part's drawing at run time). */
export function clearPartCache(atts: AttachmentSet): void {
  for (const a of Object.values(atts)) if (typeof a !== 'function') PARTS.delete(a);
}

/** A smear behind a weapon bone while a `smear` event is active: from last frame's angle to this one's. */
export function smearPart(bone: string, r0: number, r1: number, mat: Mat): Attachment {
  return {
    cache: false,
    draw: (c, x, ctx) => {
      if (!ctx.events.some((e) => e.name === 'smear')) return;
      const now = ctx.posed.byName[bone], was = ctx.prev?.byName[bone];
      if (!now || !was || was.step === now.step) return;
      c.smear([now.x, now.y], was.a, was.a + shortest(now.a - was.a), r0, r1, mat);
      void x;
    },
  };
}

export interface SkeletonFrame {
  width: number;
  height: number;
  /** RGBA. */
  pixels: Uint8ClampedArray;
  ax: number;
  ay: number;
  /** The pose drawn (in the drawn facing; mirrored facings are flipped after drawing). */
  posed: Posed;
  mirror: boolean;
}

/** A skeleton with its parts and clips: everything needed to paint it. */
export interface SkeletonRig {
  skel: SkeletonData;
  atts: AttachmentSet;
  clips: Partial<Record<Anim, Clip>>;
  /** Facings drawn by hand (default SE and NE). */
  facings?: readonly Facing[];
}

/** The clip, frame count and loop flag that paint an Anim (Dead: Die's last frame; missing: Idle). */
export function clipOf(rig: SkeletonRig, anim: Anim, frame: number): { clip: Clip; n: number; loop: boolean; frame: number } {
  const c = rig.clips[anim];
  if (c) return { clip: c, n: animFrames(anim).frames, loop: animFrames(anim).loop, frame };
  if (anim === Anim.Dead && rig.clips[Anim.Die]) {
    const n = FRAMES[Anim.Die]!;
    return { clip: rig.clips[Anim.Die]!, n, loop: false, frame: n - 1 };
  }
  const idle = rig.clips[Anim.Idle];
  if (!idle) throw new Error(`skeleton ${rig.skel.name}: no clip for anim ${anim} and no Idle`);
  const f = animFrames(Anim.Idle);
  return { clip: idle, n: f.frames, loop: f.loop, frame: frame % f.frames };
}

/** Draws an Anim's frame of a rig, codes only, on `c` (begun), in a drawn facing. */
export function drawRigFrame(c: Paper, rig: SkeletonRig, anim: Anim, frame: number, facing: Facing): Posed {
  const { clip, n, loop, frame: fr } = clipOf(rig, anim, frame);
  const frames = bakeClip(rig.skel, clip, c.L, facing, n, loop);
  const posed = frames[fr % frames.length]!;
  const prev = fr > 0 ? frames[fr - 1] : loop ? frames[frames.length - 1] : undefined;
  drawSkeleton(c, posed, rig.atts, { prev });
  return posed;
}

/**
 * Paints one frame of a rig, finished: drawn (and mirrored for SW and NW), contact lines, cluster
 * merge, anti-flicker against the previous frame painted on the same surface, the palette (`fp`, or
 * one built from this frame) and the coloured outline round the whole figure.
 */
export function paintSkeleton(rig: SkeletonRig, anim: Anim, frame: number, opts: { level: number; facing?: Facing; hue?: number; paper?: Paper; fp?: FigurePalette }): SkeletonFrame {
  const c = opts.paper ?? new Paper();
  const facing = opts.facing ?? 'se';
  const plan = planFacing(facing, rig.facings ?? DRAWN_DEFAULT);
  if (!plan) throw new Error(`skeleton ${rig.skel.name}: facing ${facing} is not drawn`);
  c.begin(opts.level, BODIES[rig.skel.body].canvas);
  const posed = drawRigFrame(c, rig, anim, frame, plan.draw);
  if (plan.mirror) c.mirror();
  c.contact();
  c.clusters(opts.level >= 8 ? 4 : 3);
  const id = `skel:${rig.skel.name}:${opts.level}:${anim}:${facing}`;
  if (frame > 0 && c.last === `${id}:${frame - 1}`) c.steady();
  c.keep();
  c.last = `${id}:${frame}`;
  const fp = opts.fp ?? figurePalette(opts.hue ?? 215, opts.level, c.codes());
  const out = c.colours(fp);
  return { width: c.CW, height: c.CH, pixels: new Uint8ClampedArray(out.buffer), ax: c.FX, ay: c.FY, posed, mirror: plan.mirror };
}

/**
 * A paper kind drawn by a skeleton, for `registerPaperKind(faction, kind, skeletonKind(rig))`: the
 * existing painter (index.ts) then paints it with its faction palette and the usual passes.
 */
export function skeletonKind(rig: SkeletonRig, opts: Omit<PaperKindDef<BasePose>, 'body' | 'keys' | 'draw' | 'facings'> = {}): PaperKindDef<BasePose> {
  const rest: BasePose = { px: 0, py: 0, tilt: 0, apart: 0, smear: null, sway: 0 };
  const poses: Partial<Record<Anim, BasePose[]>> = {};
  for (const a of Object.keys(rig.clips)) poses[Number(a) as Anim] = [rest];
  return {
    ...opts,
    body: rig.skel.body,
    facings: rig.facings,
    keys: { poses },
    draw: (c, _p, facing, anim, frame) => void drawRigFrame(c, rig, anim, frame, facing),
  };
}
