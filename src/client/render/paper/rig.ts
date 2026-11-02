// The paper-doll rig: pose types per body type, key poses eased into frames, angle snapping, and
// secondary motion. Angles are degrees in the figure's own 2D frame, drawn facing south-east
// (screen right is forward): 0 = hanging straight down, positive = swung forward (screen right),
// 180 = straight up. Parts posed at an angle are redrawn from their outlines, never rotated
// images, and angles snap to 7.5° so a part keeps a small set of drawings.

import { Anim, ANIM_COUNT } from '../contract.ts';
import { FRAMES, LOOPS } from '../frames.ts';
import { addP, DEG, type CanvasSize, type P2 } from './core.ts';

/** Angles snap to 7.5°. */
export const SNAP_DEG = 7.5;
export const snap = (a: number): number => Math.round(a / (SNAP_DEG * DEG)) * SNAP_DEG * DEG;
/** The same, in degrees. */
export const snapDeg = (deg: number): number => Math.round(deg / SNAP_DEG) * SNAP_DEG;
/** Unit direction of a limb at an angle (degrees; 0 = down, + = forward), snapped. */
export const limb = (deg: number): P2 => [Math.sin(snap(deg * DEG)), Math.cos(snap(deg * DEG))];
/** The point `len` units from p along a limb angle. */
export const along = (p: P2, deg: number, len: number): P2 => addP(p, [limb(deg)[0] * len, limb(deg)[1] * len]);

// ------------------------------------------------------------------ body types and poses

/**
 * Body types: `foot` (a man or skeleton on two legs), `horse` (a horse with a rider), `beast`
 * (colossi, monsters: a hunched mass on two or four legs) and `engine` (a war machine and crew).
 * The body type fixes the canvas, the ground shadow and the pose fields.
 */
export type BodyType = 'foot' | 'horse' | 'beast' | 'engine';

export interface BodySpec {
  canvas: CanvasSize;
  /** Ground shadow radii in units (x across, y down the screen). */
  shadow: { rx: number; ry: number };
}

export const BODIES: Record<BodyType, BodySpec> = {
  foot: { canvas: { w: 46, h: 50, footY: 0.86 }, shadow: { rx: 2.6, ry: 1.0 } },
  horse: { canvas: { w: 64, h: 56, footY: 0.84 }, shadow: { rx: 7.0, ry: 2.4 } },
  beast: { canvas: { w: 64, h: 64, footY: 0.86 }, shadow: { rx: 5.0, ry: 1.8 } },
  engine: { canvas: { w: 72, h: 60, footY: 0.8 }, shadow: { rx: 7.5, ry: 3.0 } },
};

/** Fields every pose has. Every field but `smear` is interpolated between keys. */
export interface BasePose {
  /** Whole-figure offset (units) and tilt about the feet (degrees; falls). */
  px: number;
  py: number;
  tilt: number;
  /** 0..1: the figure comes apart or collapses (last frames of Die, Dead). */
  apart: number;
  /** A smear behind the weapon, from this angle (absolute degrees), or null. Set by `secondary`. */
  smear: number | null;
  /** Cloth swing (units), lagging the body. Set by `secondary`. */
  sway: number;
}

/** A man on foot. */
export interface FootPose extends BasePose {
  torso: number;
  head: number;
  /** Near (weapon) arm and far (shield) arm: upper and lower. */
  nu: number;
  nl: number;
  fu: number;
  fl: number;
  /** Wrist angle of the weapon relative to the forearm. */
  sw: number;
  /** Where the blade or haft points (absolute; 180 = straight up, 90 = forward, 270 = back). */
  bl: number;
  /** Near and far legs: thigh and shin. */
  nt: number;
  ns: number;
  ft: number;
  fs: number;
}

/** A horse and its rider (rider fields as FootPose; the rider's legs hang in the stirrups). */
export interface HorsePose extends FootPose {
  /** Body pitch (+ = rearing), neck and head angles. */
  pitch: number;
  neck: number;
  nod: number;
  /** Legs: fore/hind × near/far, upper and lower. */
  fnu: number;
  fnl: number;
  ffu: number;
  ffl: number;
  hnu: number;
  hnl: number;
  hfu: number;
  hfl: number;
  tail: number;
}

/** A colossus or beast: a foot pose plus a hunch and a jaw. */
export interface BeastPose extends FootPose {
  hunch: number;
  jaw: number;
}

/** A war machine and its crew. */
export interface EnginePose extends BasePose {
  /** Throwing arm or barrel angle, the sling's swing, the load (0..1) and the recoil (units). */
  arm: number;
  sling: number;
  load: number;
  recoil: number;
  /** Crew: a work cycle phase 0..1 and how far they lean in. */
  crew: number;
  lean: number;
}

const BASE0: BasePose = { px: 0, py: 0, tilt: 0, apart: 0, smear: null, sway: 0 };
export const FOOT0: FootPose = { ...BASE0, torso: 8, head: -4, nu: 18, nl: 70, fu: 12, fl: 75, sw: 20, bl: 165, nt: 8, ns: -10, ft: -16, fs: -4 };
export const HORSE0: HorsePose = { ...FOOT0, nt: 40, ns: -60, ft: 40, fs: -60, pitch: 0, neck: 35, nod: 0, fnu: 0, fnl: 0, ffu: 0, ffl: 0, hnu: 0, hnl: 0, hfu: 0, hfl: 0, tail: 20 };
export const BEAST0: BeastPose = { ...FOOT0, hunch: 20, jaw: 0 };
export const ENGINE0: EnginePose = { ...BASE0, arm: 0, sling: 0, load: 1, recoil: 0, crew: 0, lean: 0 };

/** A pose maker: `pose({ nt: 24 })` is the rest pose with those fields changed. */
export const poser = <P extends BasePose>(rest: P) => (o: Partial<P> = {}): P => ({ ...rest, ...o });

// ------------------------------------------------------------------ keys and in-betweens

/** A kind's animation: key poses per Anim, eased into the painted frames (FRAMES in frames.ts). */
export interface KeySet<P extends BasePose> {
  poses: Partial<Record<Anim, P[]>>;
  /** Easing of one segment (default: `defaultEase`). */
  ease?: (anim: Anim, k0: number, raw: number) => number;
  /** Secondary motion after the in-between: cloth sway, smears, follow-through. */
  secondary?: (out: P, anim: Anim, frame: number, n: number, k0: number, raw: number) => void;
}

export const smoothstep = (k: number): number => k * k * (3 - 2 * k);
/** Eased in and out, but the first segment of an attack accelerates (slow wind-up, fast strike). */
export const defaultEase = (anim: Anim, k0: number, raw: number): number => (anim === Anim.Attack && k0 === 0 ? raw * raw : smoothstep(raw));

/** The animations a key set can paint (Dead also from the last Die key). */
export function animsOf(keys: KeySet<BasePose>): Anim[] {
  const out: Anim[] = [];
  for (let a = 0; a < ANIM_COUNT; a++) if (keys.poses[a as Anim] || (a === Anim.Dead && keys.poses[Anim.Die])) out.push(a as Anim);
  return out;
}

/**
 * The pose of a painted frame. Looping animations spread their keys evenly around the loop; the
 * others go from the first key to the last. Missing animations fall back (Dead: the last Die key;
 * anything else: Idle).
 */
export function poseAt<P extends BasePose>(keys: KeySet<P>, anim: Anim, fr: number): P {
  let ks = keys.poses[anim];
  if (!ks && anim === Anim.Dead && keys.poses[Anim.Die]) ks = [keys.poses[Anim.Die]!.at(-1)!];
  ks ??= keys.poses[Anim.Idle]!;
  const n = FRAMES[anim] ?? 8;
  const loop = LOOPS.has(anim);
  const t = loop ? (fr * ks.length) / n : (fr * (ks.length - 1)) / Math.max(1, n - 1);
  const k0 = Math.floor(t + 1e-6) % ks.length;
  const k1 = loop ? (k0 + 1) % ks.length : Math.min(ks.length - 1, k0 + 1);
  const raw = t - Math.floor(t + 1e-6);
  const f = (keys.ease ?? defaultEase)(anim, k0, raw);
  const a = ks[k0]!, b = ks[k1]!;
  const out = {} as P;
  for (const key of Object.keys(a) as (keyof P)[]) {
    const va = a[key], vb = b[key];
    (out as Record<keyof P, unknown>)[key] = typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * f : f < 0.5 ? va : vb;
  }
  out.sway = 0;
  out.smear = null;
  keys.secondary?.(out, anim, fr, n, k0, raw);
  return out;
}

// ------------------------------------------------------------------ secondary motion

/**
 * Cloth that swings with a cycle, lagging it by `lag` frames: `cycles` swings per loop of n
 * frames, amplitude `amp` units (a tabard in a walk: amp 0.35, lag 1.5, cycles 2).
 */
export const swing = (fr: number, n: number, amp: number, lag: number, cycles: number): number => amp * Math.sin(((fr - lag) / n) * Math.PI * 2 * cycles);

/** Cloth thrown by a one-off motion (a strike), starting `lag` frames late and settling by the end. */
export const settle = (fr: number, n: number, amp: number, lag: number): number => amp * Math.sin((Math.max(0, fr - lag) / n) * Math.PI);

/**
 * A chain of `links` cloth or hair points hanging from `root`, each lagging the one above by a
 * further `lag` frames of a swing: returns the points (units), for strips, tails and pennons.
 */
export function chain(root: P2, links: number, len: number, fr: number, n: number, amp: number, lag: number, cycles: number): P2[] {
  const out: P2[] = [root];
  for (let i = 1; i <= links; i++) {
    const prev = out[i - 1]!;
    const s = swing(fr, n, amp * (i / links), lag * i, cycles);
    out.push([prev[0] - len * 0.25 + s, prev[1] + len]);
  }
  return out;
}
