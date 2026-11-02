// Mocap → paper-doll motion keys.
//
//   pnpm tsx scripts/mocap/bvh-to-paper.ts                  convert every clip in clips.ts
//   pnpm tsx scripts/mocap/bvh-to-paper.ts walk run         convert some clips
//   pnpm tsx scripts/mocap/bvh-to-paper.ts --explore 35_01  print a per-frame summary of a trial
//
// Reads CMU trials (cgspeed BVH, git-ignored in references/motion/bvh/), maps the CMU skeleton to
// our rig's bones, projects each frame into the two drawn facings and writes eased key poses to
// src/client/render/paper/motion/<clip>.json in the skeleton loader's shape (see README there).
//
// The projection (render/iso.ts): the ground is turned 30° and squashed to half height. A figure
// facing SE walks along world +x (screen right and a little down) with its right (weapon) side
// toward the viewer; facing NE it walks along world (0.5, -0.866) (screen right and a little up),
// seen from behind, its right side still nearer. Heights are drawn unsquashed (a man is 14 units
// tall on screen, as the sprites are), so the camera is the sprites' stylised three-quarter view.
// Angles use the rig convention: 0 = hanging down, 90 = forward (screen right), 180 = up.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jointPositions, parseBvh, type Bvh, type V3 } from './bvh.ts';
import { CLIPS, type ClipSpec } from './clips.ts';
import { curveAt, EASE, EASE_IN, EASE_OUT, type Curve } from '../../src/client/render/paper/skeleton.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const BVH_DIR = join(ROOT, 'references/motion/bvh');
export const OUT_DIR = join(ROOT, 'src/client/render/paper/motion');

/** A man's height on screen, in figure units (rig.ts: "a man stands about 14 units tall"). */
export const REST_HEIGHT = 14;

// ------------------------------------------------------------------ skeleton map

/** Our bones, per side where they have one: [from joint, to joint] in the CMU (cgspeed) skeleton. */
const SIDE_BONES = {
  upperArm: ['Arm', 'ForeArm'],
  forearm: ['ForeArm', 'Hand'],
  hand: ['Hand', 'HandIndex1_End'],
  thigh: ['UpLeg', 'Leg'],
  shin: ['Leg', 'Foot'],
  foot: ['Foot', 'ToeBase'],
} as const;
/** Central bones. `hips` is the midpoint of the two hip joints. */
const MID_BONES = {
  pelvis: ['hips', 'Spine'],
  spine: ['Spine', 'Spine1'],
  chest: ['Spine1', 'Neck1'],
  neck: ['Neck1', 'Head'],
  head: ['Head', 'Head_End'],
} as const;
export const BONE_ORDER = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'upperArmN', 'forearmN', 'handN', 'upperArmF', 'forearmF', 'handF',
  'thighN', 'shinN', 'footN', 'thighF', 'shinF', 'footF',
] as const;
export type BoneName = (typeof BONE_ORDER)[number];

// ------------------------------------------------------------------ projection

export type DrawnFacing = 'se' | 'ne';
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** World (map plan, y toward the viewer) heading of a figure drawn in each facing. */
const HEADING: Record<DrawnFacing, [number, number]> = { se: [1, 0], ne: [0.5, -C30] };

/** Body coordinates (forward, right, up), in figure units, to screen units (x right, y down). */
export function project(f: number, r: number, u: number, facing: DrawnFacing): [number, number] {
  const [hx, hy] = HEADING[facing];
  // The right-hand side of a heading in the y-down plan: (x, y) → (-y, x).
  const mx = f * hx - r * hy, my = f * hy + r * hx;
  return [mx * C30 - my * S30, (mx * S30 + my * C30) * 0.5 - u];
}

/** Rig angle (deg) of a screen vector: 0 = down, 90 = right, 180 = up. */
const angleOf = (dx: number, dy: number): number => (Math.atan2(dx, dy) * 180) / Math.PI;

// ------------------------------------------------------------------ sampling a trial

interface Frame3 {
  /** Body coordinates [forward, right, up] (figure units) of every named point. */
  p: Map<string, V3>;
}

/** A trial prepared for one clip: joints by name, the body frame, floor and scale. */
export interface Trial {
  bvh: Bvh;
  scale: number;
  /** Mirror the motion left↔right (for a left-handed action). */
  mirror: boolean;
}

export function loadTrial(id: string): Bvh {
  return parseBvh(readFileSync(join(BVH_DIR, `${id}.bvh`), 'utf8'));
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** Raw world points of a frame by joint name, plus `hips` (the midpoint of the hip joints). */
function rawPoints(bvh: Bvh, frame: number): Map<string, V3> {
  const pos = jointPositions(bvh, frame);
  const m = new Map<string, V3>();
  bvh.joints.forEach((j, k) => m.set(j.name, pos[k]!));
  m.set('hips', mid(m.get('LeftUpLeg')!, m.get('RightUpLeg')!));
  return m;
}

/** The subject's height in the T-pose (frame 0 of a cgspeed file), BVH units. */
function standingHeight(bvh: Bvh): number {
  const p = rawPoints(bvh, 0);
  const toe = Math.min(p.get('LeftToeBase')![1], p.get('RightToeBase')![1], p.get('LeftFoot')![1], p.get('RightFoot')![1]);
  return p.get('Head_End')![1] - toe + 0.6; // + the sole under the ankle/ball markers
}

/** Unit forward vector on the ground (x, z) from the hips line: forward = left × up. */
function hipsForward(p: Map<string, V3>): [number, number] {
  const l = sub(p.get('LeftUpLeg')!, p.get('RightUpLeg')!);
  const fx = -l[2], fz = l[0];
  const n = Math.hypot(fx, fz) || 1;
  return [fx / n, fz / n];
}

/** Everything a clip needs from its trial, sampled at source frames. */
export interface Sampled {
  /** Per output frame, per facing: bone world angles (deg, unwrapped), pelvis screen point, height. */
  frames: { t: number; body: Map<string, V3> }[];
}

/** Turns raw points into body coordinates [forward, right, up] in figure units. */
function toBody(p: Map<string, V3>, origin: V3, fwd: [number, number], floor: number, scale: number, mirror: boolean): Map<string, V3> {
  const out = new Map<string, V3>();
  // The subject's right on the ground (x, z), y up: forward +z (T-pose) has its right at -x.
  const rx = -fwd[1], rz = fwd[0];
  for (const [name, v] of p) {
    const d = sub(v, origin);
    let side = name;
    let r = (d[0] * rx + d[2] * rz) * scale;
    if (mirror) {
      r = -r;
      side = name.startsWith('Left') ? 'Right' + name.slice(4) : name.startsWith('Right') ? 'Left' + name.slice(5) : name;
    }
    out.set(side, [(d[0] * fwd[0] + d[2] * fwd[1]) * scale, r, (v[1] - floor) * scale]);
  }
  return out;
}

// ------------------------------------------------------------------ one converted frame

interface Pose2 {
  bones: Record<BoneName, number>;
  /** Projected length / true length per bone (near 0: the bone points at the camera). */
  fore: Record<BoneName, number>;
  root: [number, number];
  height: number;
  twist: { pelvis: number; chest: number };
}

function boneEnds(name: BoneName): [string, string] {
  const base = name.replace(/[NF]$/, '') as keyof typeof SIDE_BONES | keyof typeof MID_BONES;
  if (base in MID_BONES) {
    const [a, b] = MID_BONES[base as keyof typeof MID_BONES];
    return [a, b];
  }
  // N (near) = the subject's right side, F (far) = the left.
  const side = name.endsWith('N') ? 'Right' : 'Left';
  const [a, b] = SIDE_BONES[base as keyof typeof SIDE_BONES];
  return [side + a, side + b];
}

function pose2(body: Map<string, V3>, facing: DrawnFacing, restHip: number): Pose2 {
  const scr = (n: string): [number, number] => {
    const v = body.get(n);
    if (!v) throw new Error(`no joint ${n}`);
    return project(v[0], v[1], v[2], facing);
  };
  const bones = {} as Record<BoneName, number>;
  const fore = {} as Record<BoneName, number>;
  for (const b of BONE_ORDER) {
    const [a, c] = boneEnds(b);
    const A = body.get(a)!, B = body.get(c)!;
    const pa = scr(a);
    // Hands and feet are drawn as profile parts: their sideways turn (toe-out, a turned wrist)
    // would read as a flip on screen, so only their forward/up direction is projected.
    const pc = /^(hand|foot)/.test(b) ? ((q: [number, number]) => [pa[0] + q[0], pa[1] + q[1]] as [number, number])(project(B[0] - A[0], 0, B[2] - A[2], facing)) : scr(c);
    bones[b] = angleOf(pc[0] - pa[0], pc[1] - pa[1]);
    fore[b] = Math.hypot(pc[0] - pa[0], pc[1] - pa[1]) / (Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) || 1);
  }
  const hp = scr('hips');
  const yaw = (l: string, r: string): number => {
    const L = body.get(l)!, R = body.get(r)!;
    // The line from the left to the right joint should point along +right; its turn is the yaw
    // (+ = the right side forward).
    return (Math.atan2(R[0] - L[0], R[1] - L[1]) * 180) / Math.PI;
  };
  return {
    bones,
    fore,
    root: [hp[0], hp[1] + restHip],
    height: body.get('hips')![2],
    twist: { pelvis: yaw('LeftUpLeg', 'RightUpLeg'), chest: yaw('LeftArm', 'RightArm') },
  };
}

// ------------------------------------------------------------------ keys

export interface MotionKey {
  f: number;
  c?: Curve;
  root: [number, number];
  height: number;
  contact: { N: boolean; F: boolean };
  bones: Record<string, number>;
  twist: { pelvis: number; chest: number };
}
export interface MotionEvent {
  f: number;
  name: string;
  len?: number;
  bone?: string;
}
export interface MotionClip {
  name: string;
  anim: string;
  frames: number;
  loop: boolean;
  angles: 'world';
  restHeight: number;
  lengths: Record<string, number>;
  facings: Record<DrawnFacing, { keys: MotionKey[] }>;
  events: MotionEvent[];
  meta: Record<string, unknown>;
}

const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const rHalf = (v: number): number => Math.round(v * 2) / 2 + 0;

const CURVES: { c: Curve | undefined; name: string }[] = [
  { c: undefined, name: 'linear' },
  { c: EASE, name: 'ease' },
  { c: EASE_IN, name: 'in' },
  { c: EASE_OUT, name: 'out' },
];

/** Channels of a sampled frame as one vector (both facings), with the weights for the error. */
function channels(p: Record<DrawnFacing, Pose2>): number[] {
  const out: number[] = [];
  for (const fc of ['se', 'ne'] as const) {
    const q = p[fc];
    for (const b of BONE_ORDER) out.push(q.bones[b] * (/^(hand|foot|head)/.test(b) ? 0.5 : 1));
    out.push(q.root[0] * ROOT_W, q.root[1] * ROOT_W, q.height * ROOT_W);
  }
  return out;
}
/** Root and height errors weigh like this many degrees per unit (0.3 units ≈ 5°). */
const ROOT_W = 16;

/**
 * Picks key frames: the fewest frames such that easing between them (each segment with its best
 * curve) reproduces every sampled frame within `tol` degrees (and 0.3 units of root). Frames listed
 * in `must` (contact changes, events) are always keys.
 */
function reduce(ch: number[][], loop: boolean, tol: number, must: Set<number>): { keys: number[]; curves: (Curve | undefined)[] } {
  const n = ch.length;
  const at = (f: number): number[] => ch[((f % n) + n) % n]!;
  const keys = new Set<number>([0, ...must]);
  if (!loop) keys.add(n - 1);
  const segErr = (a: number, b: number, c: Curve | undefined): number => {
    let worst = 0;
    const A = at(a), B = at(b);
    for (let f = a + 1; f < b; f++) {
      const u = curveAt(c, (f - a) / (b - a));
      const F = at(f);
      for (let k = 0; k < A.length; k++) worst = Math.max(worst, Math.abs(A[k]! + (B[k]! - A[k]!) * u - F[k]!));
    }
    return worst;
  };
  const fit = (): { worst: number; at: number; curves: (Curve | undefined)[] } => {
    const ks = [...keys].sort((x, y) => x - y);
    const ends = loop ? [...ks, n] : ks;
    let worst = 0, wat = -1;
    const curves: (Curve | undefined)[] = [];
    for (let i = 0; i + 1 < ends.length; i++) {
      const a = ends[i]!, b = ends[i + 1]!;
      let best = Infinity, bc: Curve | undefined;
      for (const { c } of CURVES) {
        const e = segErr(a, b, c);
        if (e < best - 1e-9) (best = e), (bc = c);
      }
      curves.push(bc);
      if (best > worst) {
        // the worst frame inside this segment
        let fw = -1, ew = -1;
        for (let f = a + 1; f < b; f++) {
          const u = curveAt(bc, (f - a) / (b - a));
          const A = at(a), B = at(b), F = at(f);
          let e = 0;
          for (let k = 0; k < A.length; k++) e = Math.max(e, Math.abs(A[k]! + (B[k]! - A[k]!) * u - F[k]!));
          if (e > ew) (ew = e), (fw = f);
        }
        worst = best;
        wat = fw % n;
      }
    }
    if (!loop) curves.push(undefined);
    return { worst, at: wat, curves };
  };
  for (;;) {
    const r = fit();
    if (r.worst <= tol || r.at < 0) return { keys: [...keys].sort((x, y) => x - y), curves: r.curves };
    keys.add(r.at);
  }
}

// ------------------------------------------------------------------ converting a clip

/** Source frame (BVH, fractional) for output frame i. */
function sourceTime(spec: ClipSpec, i: number): number {
  const n = spec.frames;
  if (spec.timing) {
    // piecewise linear: [[outFrame, srcFrame], ...]
    const tm = spec.timing;
    for (let k = 0; k + 1 < tm.length; k++) {
      const [o0, s0] = tm[k]!, [o1, s1] = tm[k + 1]!;
      if (i >= o0 && i <= o1) return s0 + ((s1 - s0) * (i - o0)) / Math.max(1e-9, o1 - o0);
    }
    return tm.at(-1)![1];
  }
  const [a, b] = spec.range;
  return spec.loop ? a + ((b - a) * i) / n : a + ((b - a) * i) / Math.max(1, n - 1);
}

export function convert(spec: ClipSpec, bvh: Bvh = loadTrial(spec.trial)): MotionClip {
  const n = spec.frames;
  const scale = REST_HEIGHT / standingHeight(bvh);
  const [a, b] = spec.range;
  // Floor: the lowest ball-of-foot over the range (markers sit about 0.6 units above the sole).
  let floor = Infinity;
  for (let f = Math.floor(a); f <= Math.ceil(b); f++) {
    const p = rawPoints(bvh, f);
    floor = Math.min(floor, p.get('LeftToeBase')![1], p.get('RightToeBase')![1]);
  }
  floor -= 0.25 / scale;
  // Heading: travel direction (locomotion) or the hips' facing at the start / averaged.
  // The first painted frame's source (a timing map may run backwards, e.g. a reversed get-up).
  const first = sourceTime(spec, 0);
  const pa = rawPoints(bvh, spec.loop ? a : first), pb = rawPoints(bvh, b);
  let fwd: [number, number];
  if (spec.heading === 'travel') {
    const d = sub(pb.get('hips')!, pa.get('hips')!);
    const l = Math.hypot(d[0], d[2]);
    fwd = [d[0] / l, d[2] / l];
  } else if (spec.heading === 'start') fwd = hipsForward(pa);
  else if (spec.heading === 'aim') {
    // the shot's line: from the draw (right) hand to the bow / support (left) hand at a frame
    const p = rawPoints(bvh, spec.aimFrame ?? a);
    const d = sub(p.get('LeftHand')!, p.get('RightHand')!);
    const l = Math.hypot(d[0], d[2]);
    fwd = [d[0] / l, d[2] / l];
  } else {
    let sx = 0, sz = 0;
    for (let f = Math.floor(a); f <= b; f += 4) {
      const h = hipsForward(rawPoints(bvh, f));
      sx += h[0];
      sz += h[1];
    }
    const l = Math.hypot(sx, sz);
    fwd = [sx / l, sz / l];
  }
  if (spec.yaw) {
    const t = (spec.yaw * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    fwd = [fwd[0] * c - fwd[1] * s, fwd[0] * s + fwd[1] * c];
  }
  // Origin: under the start pelvis; loops move with the average travel so the figure stays put.
  const h0 = pa.get('hips')!, h1 = pb.get('hips')!;
  const restHip = (() => {
    const p = rawPoints(bvh, 0);
    return (p.get('hips')![1] - Math.min(p.get('LeftToeBase')![1], p.get('RightToeBase')![1]) + 0.25 / scale) * scale;
  })();

  const facings: DrawnFacing[] = ['se', 'ne'];
  const raw: Record<DrawnFacing, Pose2>[] = [];
  const bodies: Map<string, V3>[] = [];
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = sourceTime(spec, i);
    times.push(t);
    const p = rawPoints(bvh, t);
    let origin: V3;
    if (spec.loop) {
      const u = (t - a) / (b - a);
      const m = mid(h0, h1);
      origin = [h0[0] + (h1[0] - h0[0]) * u + (m[0] - mid(h0, h1)[0]), 0, h0[2] + (h1[2] - h0[2]) * u];
      // Average pelvis over the cycle sits over the foot point: shift by the mean offset below.
    } else origin = [h0[0], 0, h0[2]];
    origin[1] = floor;
    const body = toBody(p, [origin[0], floor, origin[2]], fwd, floor, scale, !!spec.mirror);
    bodies.push(body);
    raw.push({ se: pose2(body, 'se', restHip), ne: pose2(body, 'ne', restHip) });
  }
  if (spec.loop) {
    // Centre the cycle: the mean pelvis offset (forward/right) goes to zero.
    for (const fc of facings) {
      const mx = raw.reduce((s, r) => s + r[fc].root[0], 0) / n;
      for (const r of raw) r[fc].root = [r[fc].root[0] - mx, r[fc].root[1]];
    }
  }
  // Unwrap angles over time. Between painted frames the source is walked in small steps, so a
  // fast swing (or a bone foreshortened end-on) never jumps to the wrong side of the circle.
  const anglesAt = (t: number, fc: DrawnFacing): Pose2 => pose2(toBody(rawPoints(bvh, t), [0, floor, 0], fwd, floor, scale, !!spec.mirror), fc, restHip);
  const near = (v: number, prev: number): number => v - 360 * Math.round((v - prev) / 360);
  const STEPS = 8;
  const walk = (from: number, to: number, start: Record<BoneName, number>, fc: DrawnFacing): Record<BoneName, number> => {
    const cur = { ...start };
    for (let k = 1; k <= STEPS; k++) {
      const a2 = anglesAt(from + ((to - from) * k) / STEPS, fc);
      // A bone seen end-on (shorter than 30% of its length on screen) has no reliable angle:
      // it keeps the last one until it shows again.
      for (const bn of BONE_ORDER) if (a2.fore[bn] >= 0.3) cur[bn] = near(a2.bones[bn], cur[bn]);
    }
    return cur;
  };
  // Joints that cannot spin (elbow, wrist, knee, ankle, the spine and neck) start within half a
  // turn of their parent; after that every angle moves continuously.
  const CHAIN: [BoneName, BoneName][] = [
    ['spine', 'pelvis'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
    ['forearmN', 'upperArmN'], ['handN', 'forearmN'], ['forearmF', 'upperArmF'], ['handF', 'forearmF'],
    ['shinN', 'thighN'], ['footN', 'shinN'], ['shinF', 'thighF'], ['footF', 'shinF'],
  ];

  for (const fc of facings) {
    // Rig convention: bones that point up (pelvis to head) sit near 180 (a forward lean is below
    // 180, a backward lean above); hanging limbs sit near 0 (forward is positive). The first frame
    // picks the turn and the rest follow it continuously.
    const b0 = raw[0]![fc].bones;
    for (const bn of BONE_ORDER) b0[bn] = near(b0[bn], bn in MID_BONES ? 180 : 0);
    for (const [c, p] of CHAIN) b0[c] = near(b0[c], b0[p]);
    for (let i = 1; i < n; i++) raw[i]![fc].bones = walk(times[i - 1]!, times[i]!, raw[i - 1]![fc].bones, fc);
    if (spec.loop) {
      // One source cycle after frame 0 the pose repeats: spread the closing error over the loop.
      const end = walk(times[n - 1]!, b, raw[n - 1]![fc].bones, fc);
      for (const bn of BONE_ORDER) {
        const drift = end[bn] - b0[bn];
        // a whole turn over the loop (a spinning part) is kept as it is
        const d = drift - 360 * Math.round(drift / 360);
        for (let i = 0; i < n; i++) raw[i]![fc].bones[bn] -= (d * i) / n;
      }
      const endPose = pose2(toBody(rawPoints(bvh, b), [h1[0], floor, h1[2]], fwd, floor, scale, !!spec.mirror), fc, restHip);
      const dy = endPose.root[1] - raw[0]![fc].root[1];
      const dh = endPose.height - raw[0]![fc].height;
      for (let i = 0; i < n; i++) {
        raw[i]![fc].root = [raw[i]![fc].root[0], raw[i]![fc].root[1] - (dy * i) / n];
        raw[i]![fc].height -= (dh * i) / n;
      }
    }
  }

  // Hands and feet follow their forearm and shin: a wrist or ankle never turns past half a turn,
  // so the end part is re-anchored to its parent on every frame.
  const ENDS: [BoneName, BoneName][] = [['handN', 'forearmN'], ['handF', 'forearmF'], ['footN', 'shinN'], ['footF', 'shinF']];
  for (const r of raw) for (const fc of facings) for (const [c, p] of ENDS) r[fc].bones[c] = near(r[fc].bones[c], r[fc].bones[p]);

  // Foot contact: the foot is low and slow.
  const fps = 1 / bvh.frameTime;
  const contact: { N: boolean; F: boolean }[] = [];
  // Each marker's own lowest point over the clip is its "on the ground" height (markers sit at
  // different heights on each foot and drift a little between sessions).
  const lowest = (joint: string): number => Math.min(...bodies.map((b) => b.get(joint)![2]));
  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    const dt = 2;
    const before = toBody(rawPoints(bvh, Math.max(0, t - dt)), [0, floor, 0], fwd, floor, scale, !!spec.mirror);
    const after = toBody(rawPoints(bvh, Math.min(bvh.frames.length - 1, t + dt)), [0, floor, 0], fwd, floor, scale, !!spec.mirror);
    const speed = (side: 'Right' | 'Left'): number => {
      const k = side + 'ToeBase';
      const p0 = before.get(k)!, p1 = after.get(k)!;
      return (Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) * fps) / (2 * dt);
    };
    // Planted: the heel is down (from heel strike), or the ball of the foot is down and still
    // (until toe-off). A swinging foot skims the ground with its toe but never with its heel.
    const planted = (side: 'Right' | 'Left'): boolean => {
      const b = bodies[i]!;
      const heel = b.get(side + 'Foot')![2] - lowest(side + 'Foot') < (spec.contactHeight ?? (spec.heading === 'travel' ? 0.3 : 0.6));
      const ball = b.get(side + 'ToeBase')![2] - lowest(side + 'ToeBase') < (spec.contactHeight ?? (spec.heading === 'travel' ? 0.3 : 0.6)) && speed(side) < (spec.contactSpeed ?? 10);
      return heel || ball;
    };
    contact.push({ N: planted('Right'), F: planted('Left') });
  }

  // Events: the clip's own, plus a smear while the weapon hand is fast (attacks and shots).
  const events: MotionEvent[] = (spec.events ?? []).map((e) => ({ ...e }));
  if (spec.smear) {
    const hand = spec.smear === 'F' ? 'Left' : 'Right';
    const sp: number[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = bodies[Math.max(0, i - 1)]!.get(hand + 'Hand')!, p1 = bodies[Math.min(n - 1, i + 1)]!.get(hand + 'Hand')!;
      sp.push(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
    }
    // The smear covers the fast frames leading into the strike (not the wind-up).
    const hit = events.find((e) => e.name === 'strike' || e.name === 'release');
    const lo = hit ? Math.max(0, hit.f - 4) : 0, hi = hit ? hit.f : n - 1;
    let peak = lo;
    for (let i = lo; i <= hi; i++) if (sp[i]! > sp[peak]!) peak = i;
    let first = peak, last = peak;
    while (first > lo && sp[first - 1]! >= 0.6 * sp[peak]!) first--;
    while (last < hi && sp[last + 1]! >= 0.6 * sp[peak]!) last++;
    events.push({ f: first, name: 'smear', len: last - first + 1, bone: spec.smear === 'F' ? 'handF' : 'handN' });
    const max = sp[peak]!;
    if (!hit) events.push({ f: sp.indexOf(max), name: spec.strikeName ?? 'strike' });
  }
  if (spec.loop && spec.heading === 'travel') {
    for (let i = 0; i < n; i++) {
      const p = contact[(i + n - 1) % n]!, c = contact[i]!;
      if (c.N && !p.N) events.push({ f: i, name: 'step', bone: 'footN' });
      if (c.F && !p.F) events.push({ f: i, name: 'step', bone: 'footF' });
    }
  }
  events.sort((x, y) => x.f - y.f || x.name.localeCompare(y.name));

  // Keys: contact changes and events are always keys.
  const must = new Set<number>(spec.keys ?? []);
  for (let i = 1; i < n; i++) {
    if (contact[i]!.N !== contact[i - 1]!.N || contact[i]!.F !== contact[i - 1]!.F) must.add(i);
  }
  if (spec.loop && (contact[0]!.N !== contact[n - 1]!.N || contact[0]!.F !== contact[n - 1]!.F)) must.add(0);
  for (const e of events) if (e.name !== 'step' && e.f >= 0 && e.f < n) must.add(e.f);
  if (process.env.MOCAP_DEBUG) {
    // Which channels are hardest to key: the error of dropping every odd frame (linear).
    const names = (['se', 'ne'] as const).flatMap((fc) => [...BONE_ORDER.map((b) => `${fc}.${b}`), `${fc}.rootX`, `${fc}.rootY`, `${fc}.height`]);
    const ch = raw.map(channels);
    const errs = names.map((nm, k) => {
      let e = 0;
      for (let f = 1; f < n - 1; f += 2) e = Math.max(e, Math.abs(ch[f]![k]! - (ch[f - 1]![k]! + ch[f + 1]![k]!) / 2));
      return [nm, Math.round(e)] as const;
    });
    console.log(spec.name, errs.sort((x, y) => y[1] - x[1]).slice(0, 8).map(([a, b]) => `${a}:${b}`).join(' '));
  }
  const { keys, curves } = reduce(raw.map(channels), spec.loop, spec.tolerance ?? 7.5, must);

  const lengths: Record<string, number> = {};
  const rest = toBody(rawPoints(bvh, 0), [0, floor, 0], [0, 1], floor, scale, false);
  for (const bn of BONE_ORDER) {
    if (bn.endsWith('F')) continue;
    const [p, q] = boneEnds(bn);
    const v = sub(rest.get(q)!, rest.get(p)!);
    lengths[bn.replace(/N$/, '')] = r2(Math.hypot(v[0], v[1], v[2]));
  }

  const out: MotionClip = {
    name: spec.name,
    anim: spec.anim,
    frames: n,
    loop: spec.loop,
    angles: 'world',
    restHeight: REST_HEIGHT,
    lengths,
    facings: { se: { keys: [] }, ne: { keys: [] } },
    events,
    meta: {
      source: `CMU Graphics Lab Motion Capture Database, subject ${spec.trial.split('_')[0]}, trial ${spec.trial} ("${spec.description}"), cgspeed BVH conversion`,
      licence: 'CMU: free to use, including in commercial products; the raw data may not be resold. Credit: mocap.cs.cmu.edu, NSF EIA-0196217.',
      range: [a, b],
      fps: Math.round(fps),
      seconds: r2((b - a) / fps),
      why: spec.why,
      sides: spec.mirror ? 'mirrored: the subject acts with the left hand, so N (near) = subject left' : 'N (near, weapon side) = subject right; F (far) = subject left',
      projection: 'SE: heading world +x; NE: heading (0.5, -0.866); ground turned 30° and squashed 0.5; heights unsquashed',
      keyTolerance: `${spec.tolerance ?? 7.5}° (root 0.3 units)`,
    },
  };
  keys.forEach((f, k) => {
    for (const fc of facings) {
      const p = raw[f]![fc];
      const bones: Record<string, number> = {};
      for (const bn of BONE_ORDER) bones[bn] = rHalf(p.bones[bn]);
      const key: MotionKey = {
        f,
        root: [r2(p.root[0]), r2(p.root[1])],
        height: r2(p.height),
        contact: { ...contact[f]! },
        bones,
        twist: { pelvis: Math.round(p.twist.pelvis) + 0, chest: Math.round(p.twist.chest) + 0 },
      };
      const c = curves[k];
      if (c) key.c = c;
      out.facings[fc].keys.push(key);
    }
  });
  return out;
}

/** JSON with one key pose per line: small, diffable and deterministic. */
export function formatClip(c: MotionClip): string {
  const j = (v: unknown): string => JSON.stringify(v);
  const keys = (fc: DrawnFacing): string => c.facings[fc].keys.map((k) => `    ${j(k)}`).join(',\n');
  return (
    '{\n' +
    ` "name": ${j(c.name)},\n "anim": ${j(c.anim)},\n "frames": ${c.frames},\n "loop": ${c.loop},\n "angles": ${j(c.angles)},\n` +
    ` "restHeight": ${c.restHeight},\n "lengths": ${j(c.lengths)},\n` +
    ` "facings": {\n  "se": { "keys": [\n${keys('se')}\n  ] },\n  "ne": { "keys": [\n${keys('ne')}\n  ] }\n },\n` +
    ` "events": ${j(c.events)},\n "meta": ${JSON.stringify(c.meta, null, 2).replace(/\n/g, '\n ')}\n}\n`
  );
}

// ------------------------------------------------------------------ CLI

/** A per-frame summary for choosing trims: hips height, feet heights, hand speed, facing. */
function explore(id: string, from = 1, to = Infinity, step = 4): void {
  const bvh = loadTrial(id);
  const scale = REST_HEIGHT / standingHeight(bvh);
  console.log(`${id}: ${bvh.frames.length} frames @ ${Math.round(1 / bvh.frameTime)} fps, scale ${scale.toFixed(3)}`);
  let prev: Map<string, V3> | null = null;
  for (let f = from; f < Math.min(to, bvh.frames.length); f += step) {
    const p = rawPoints(bvh, f);
    const y = (k: string): string => (p.get(k)![1] * scale).toFixed(1).padStart(5);
    const fw = hipsForward(p);
    const yawDeg = Math.round((Math.atan2(fw[0], fw[1]) * 180) / Math.PI);
    const spd = (k: string): string => (prev ? ((Math.hypot(...sub(p.get(k)!, prev.get(k)!)) * scale) / (step * bvh.frameTime)).toFixed(0) : '-').padStart(4);
    const h = p.get('hips')!;
    console.log(
      `${String(f).padStart(5)} hip ${y('hips')} @${(h[0] * scale).toFixed(0)},${(h[2] * scale).toFixed(0)} yaw${String(yawDeg).padStart(4)}` +
        ` ank ${y('LeftFoot')}${y('RightFoot')} toe ${y('LeftToeBase')}${y('RightToeBase')} handL ${y('LeftHand')}${spd('LeftHand')} handR ${y('RightHand')}${spd('RightHand')} head ${y('Head_End')}`,
    );
    prev = p;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] === '--explore') {
    explore(args[1]!, Number(args[2] ?? 1), Number(args[3] ?? Infinity), Number(args[4] ?? 4));
    return;
  }
  const want = new Set(args);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const spec of CLIPS) {
    if (want.size && !want.has(spec.name)) continue;
    const clip = convert(spec);
    writeFileSync(join(OUT_DIR, `${spec.name}.json`), formatClip(clip));
    console.log(`${spec.name}: ${clip.facings.se.keys.length} keys of ${clip.frames} frames, events ${clip.events.map((e) => `${e.name}@${e.f}`).join(' ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
