// The Hollow Host's blows and runs, fitted to the weapon (docs/art-references/weapon-attacks.md
// U1-U9, running.md §3-§9; audit and rounds in undead-animation.md "Weapons and runs").
//
// - Thrusts travel on a line. A spear, a gladius or a javelin is not swung: the hand slides along
//   the shaft's own line (drawn back, driven out, held, drawn back) while the shaft keeps its
//   angle. `lineArm` places the fist on that line every frame and solves the arm for it (two-bone
//   IK in the shoulder's frame), so the point goes straight whatever the body does around it.
// - Each melee kind has two or three blows (README "Several blows"), picked per man per swing.
// - A blow starts and ends at the kind's rest pose: the weapon comes into line during the
//   anticipation and goes back to the carry in the recovery, so blows chain into each other and
//   into the gaits without a pop.
// - Runs are authored cycles with a flight phase (both feet off, the hips highest) and the bob
//   reversed from the walk's (lowest at mid-stance), per body: the armoured revenant's short heavy
//   run with the shield locked, the skeleton's long stiff lope, the ghoul's crouching bounds.

import type { P2 } from './core.ts';
import type { Facing } from './facing.ts';
import type { AnimEvent, SkeletonData } from './skeleton.ts';
import { at, type KP, type MocapOpts, type Track } from './templar-rig.ts';
import { R, T, type Author, type Tracks } from './templar-clips.ts';

const D = Math.PI / 180;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const boneLen = (skel: SkeletonData, b: string): number => skel.bones.find((x) => x.name === b)!.len;

/**
 * Two-bone arm IK in the shoulder's frame: the world angles (rig degrees: 0 down, 90 forward) of
 * the upper arm and the forearm that put the fist at `hand` (units from the shoulder, y down),
 * the elbow bent down and back. A hand out of reach is pulled in along its line.
 */
export function armIK(a: number, b: number, hand: P2): [number, number] {
  const d0 = Math.max(1e-6, Math.hypot(hand[0], hand[1]));
  const d = Math.max(Math.abs(a - b) + 0.05, Math.min((a + b) * 0.985, d0));
  const h: P2 = [(hand[0] * d) / d0, (hand[1] * d) / d0];
  const base = Math.atan2(h[0], h[1]) / D;
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))) / D;
  const u = base - al;
  const e: P2 = [a * Math.sin(u * D), a * Math.cos(u * D)];
  return [u, Math.atan2(h[0] - e[0], h[1] - e[1]) / D];
}
/** `v` moved by whole turns to lie nearest `ref` (angle tracks interpolate numerically). */
const near = (v: number, ref: number) => v - 360 * Math.round((v - ref) / 360);

/** A weapon driven along its own line. */
export interface LineSpec {
  /** The arm that holds it (N: the weapon hand). */
  arm?: 'N' | 'F';
  /** The bone that carries the weapon (its world angle is the shaft's). */
  bone?: string;
  /** The shaft's world angle: 90 level forward, more rising, less dipping. */
  deg: number | Track;
  /** The fist at s = 0, units from the shoulder (x forward, y down). */
  base: P2;
  /** The fist's travel along the shaft (− drawn back, + driven out), keyed by frame. */
  s: Track;
  /** Off the line (+ down across the shaft), keyed by frame. */
  lift?: Track;
  /** Frames on the line; before `from` and after `to` the arm eases from and back to rest. */
  from: number;
  to: number;
  n?: number;
}
/** World-angle tracks for the arm and the weapon: rest, onto the line, along it, back to rest. */
export function lineArm(skel: SkeletonData, rw: Record<string, number>, s: LineSpec): Record<string, Track> {
  const side = s.arm ?? 'N', wb = s.bone ?? (side === 'N' ? 'weapon' : 'itemF');
  const ub = `upperArm${side}`, fb = `forearm${side}`;
  const a = boneLen(skel, ub), b = boneLen(skel, fb);
  const n = s.n ?? 12;
  const U: [number, number][] = [[0, rw[ub]!]], F: [number, number][] = [[0, rw[fb]!]], W: [number, number][] = [[0, rw[wb]!]];
  let pu = rw[ub]!, pf = rw[fb]!, pw = rw[wb]!;
  for (let f = s.from; f <= s.to; f++) {
    const deg = typeof s.deg === 'number' ? s.deg : at(s.deg, f);
    const dir: P2 = [Math.sin(deg * D), Math.cos(deg * D)], perp: P2 = [-dir[1], dir[0]];
    const k = at(s.s, f), l = s.lift ? at(s.lift, f) : 0;
    const hand: P2 = [s.base[0] + k * dir[0] + l * perp[0], s.base[1] + k * dir[1] + l * perp[1]];
    const [u, fo] = armIK(a, b, hand);
    pu = near(u, pu);
    pf = near(fo, pf);
    pw = near(deg, pw);
    U.push([f, r1(pu)]);
    F.push([f, r1(pf)]);
    W.push([f, r1(pw)]);
  }
  // Back to the carry by the last frame (the shortest way round).
  if (s.to < n - 1) {
    U.push([n - 1, near(rw[ub]!, pu)]);
    F.push([n - 1, near(rw[fb]!, pf)]);
    W.push([n - 1, near(rw[wb]!, pw)]);
  }
  return { [ub]: U, [fb]: F, [wb]: W };
}

/** A blow: its mocap base (for the weight), its authored tracks, its events and stop-motion warp. */
export interface BlowDef {
  clip: string;
  o: MocapOpts;
  a: (skel: SkeletonData) => Author;
  extra: number[];
  ev: AnimEvent[];
  warp: number[];
}
const EVERY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STILL: MocapOpts = { ref: 'first', torso: 0, travel: 0, feet: 0 };
const W0 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** The stop-motion hold on the chamber: frame `h` shown twice, the next skipped (the jerk into the strike). */
const holdAt = (h: number) => W0.map((f) => (f === h + 1 ? h : f));
const jaw = (...kv: [number, number][]): Track => kv;

/** A step in with the lead (far) foot: the foot lifts, lands `dx` forward at `land`, and comes back at the end. */
const step = (lift: number, land: number, dx: number, back: number): [Track, Track] => [
  T([0, 0], [lift, 0], [land, dx], [back, dx], [11, 0]),
  T([0, 0], [lift, 0], [(lift + land) / 2, -0.6], [land, 0], [back, 0], [(back + 11) / 2, -0.3], [11, 0]),
];

// ------------------------------------------------------------------ Grave Legionaries (gladius + scutum)

/**
 * Blow 0, the shield punch and the stab (U1): the gladius comes up level at the hip, drawn back
 * behind the shield (1-2); the shield is punched out with a step in on the shield foot (3), held
 * against the enemy (4); the gladius drives out from behind its rim at the belly, the shoulder
 * behind it (5), held at full reach (6-7); drawn back behind the shield (8-9), and down (10-11).
 */
const LEG_PUNCH_STAB = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 96, base: [0.9, 3.0], s: T([2, -1.2], [3, -1.8], [4, -1.8], [5, 2.6], [6, 3.0], [7, 3.0], [9, 0.2]), from: 2, to: 9 }),
  dw: {
    upperArmF: T([0, 0], [1, 6], [2, 14], [3, 62], [4, 64], [5, 40], [7, 30], [9, 10], [11, 0]),
    forearmF: T([0, 0], [2, -4], [3, -10], [4, -10], [6, -4], [11, 0]),
    spine: T([0, 0], [2, 5], [3, -10], [4, -10], [5, -20], [7, -22], [9, -6], [11, 0]),
    head: T([0, 0], [3, -4], [5, -8], [7, -8], [10, 0]),
    jaw: jaw([0, -8], [2, -4], [3, -26], [4, -10], [5, -36], [7, -36], [8, -6], [11, -8]),
  },
  tAdd: {
    pelvis: [T([0, 0], [2, -0.3], [3, 0.6], [4, 0.6], [5, 0.95], [7, 1.0], [9, 0.35], [11, 0]), T([0, 0], [3, 0.15], [5, 0.3], [7, 0.3], [11, 0])],
    footTargetF: step(2, 3, 1.3, 9),
  },
});
/** Blow 1, the low stab under the shield's rim: the shield up and still, a short chamber at the hip, the point driven level into the belly, held, drawn back. */
const LEG_LOW_STAB = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 86, base: [0.7, 3.3], s: T([2, -1.4], [3, -1.9], [4, 2.4], [5, 2.9], [6, 2.9], [8, 0.6], [9, 0]), from: 2, to: 9 }),
  dw: {
    upperArmF: T([0, 0], [2, 16], [6, 18], [9, 8], [11, 0]),
    forearmF: T([0, 0], [2, 8], [6, 8], [11, 0]),
    spine: T([0, 0], [2, 4], [3, 6], [4, -14], [6, -18], [8, -6], [11, 0]),
    jaw: jaw([0, -8], [3, -4], [4, -32], [6, -36], [7, -6], [11, -8]),
  },
  tAdd: {
    pelvis: [T([0, 0], [3, -0.35], [4, 0.6], [6, 0.7], [8, 0.25], [11, 0]), T([0, 0], [4, 0.2], [6, 0.25], [11, 0])],
    footTargetF: step(3, 4, 0.9, 8),
  },
});

// ------------------------------------------------------------------ Ghoul Spears (two-handed spear)

/** The ghoul's body behind a thrust: a long uneven chamber with a twitch, the lunge, held low over the front thigh. */
const ghoulLunge = (chamber: number, drive: number, back: number, dx: number): Tracks => ({
  dw: {
    spine: T([0, 0], [2, 6], [chamber, 10], [chamber + 0.5, 4], [drive, -18], [drive + 2, -22], [back, -6], [11, 0]),
    head: T([0, 0], [chamber - 0.5, 6], [chamber, -6], [chamber + 0.5, 10], [drive, -8], [back, 0]),
    upperArmF: T([0, 0]),
    jaw: jaw([0, -8], [chamber, -4], [drive, -32], [drive + 2, -38], [back, -6], [11, -8]),
  },
  tAdd: {
    pelvis: [T([0, 0], [chamber, -0.5], [drive, 1.1], [drive + 2, 1.2], [back, 0.35], [11, 0]), T([0, 0], [chamber, 0.15], [drive, 0.45], [drive + 2, 0.5], [11, 0])],
    footTargetF: step(chamber, drive, dx, back),
  },
});
/** Blow 0, the rising lunge (U2): lowered into line, drawn back past the hip and held with a twitch (2-4), driven up at the belly with the long step (5), held (6-7), drawn back (8-9), raised (10-11). */
const GHOUL_LUNGE = (skel: SkeletonData): Author => (rw) => ({
  ...ghoulLunge(4, 5, 9, 1.6),
  w: lineArm(skel, rw, { deg: 102, base: [1.9, 2.3], s: T([2, -1.4], [3, -2.0], [4, -2.1], [5, 2.0], [6, 2.4], [7, 2.4], [8, 0.4], [9, 0]), from: 2, to: 9 }),
});
/** Blow 1, the overhand stab: the spear raised over the shoulder, point down at the face (2-3), held (4), driven down along the shaft (5), held (6-7), drawn back up (8-9). */
const GHOUL_HIGH = (skel: SkeletonData): Author => (rw) => ({
  ...ghoulLunge(4, 5, 9, 1.2),
  w: lineArm(skel, rw, { deg: 72, base: [1.5, -0.5], s: T([2, -0.8], [3, -1.4], [4, -1.5], [5, 2.0], [6, 2.4], [7, 2.4], [8, 0.2], [9, 0]), from: 2, to: 9 }),
});
/** Blow 2, the double jab, low: two short pokes at the knee and the groin (3 and 6), the second the deeper, no step until it. */
const GHOUL_JAB = (skel: SkeletonData): Author => (rw) => {
  const b = ghoulLunge(5, 6, 9, 1.0);
  return {
    ...b,
    dw: { ...b.dw, spine: T([0, 0], [2, 6], [3, -10], [4, 2], [5, 6], [6, -18], [8, -20], [9, -6], [11, 0]) },
    w: lineArm(skel, rw, { deg: 86, base: [1.6, 2.7], s: T([2, -0.9], [3, 1.6], [4, -0.5], [5, -0.9], [6, 2.2], [7, 2.4], [8, 2.4], [9, 0]), from: 2, to: 9 }),
  };
};

// ------------------------------------------------------------------ Bone-Throwers (javelin in hand)

/** The far (free) arm balancing a one-handed thrust: forward on the chamber, flung back on the drive. */
const freeArm = (chamber: number, drive: number, back: number): Record<string, Track> => ({
  upperArmF: T([0, 0], [chamber, 30], [drive, -30], [drive + 2, -34], [back, -8], [11, 0]),
  forearmF: T([0, 0], [chamber, 40], [drive, 10], [back, 0], [11, 0]),
});
/** Blow 0, the overhand javelin stab: the javelin over the shoulder, point dipping (2), drawn back by the ear (3), driven down along its line (4-5), held (6), back (7-9). */
const THROWER_STAB = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 80, base: [0.7, -0.6], s: T([2, -0.6], [3, -1.2], [4, 1.8], [5, 2.6], [6, 2.6], [8, 0.6], [9, 0]), from: 2, to: 9 }),
  dw: { ...freeArm(3, 5, 9), spine: T([0, 0], [3, 8], [5, -18], [6, -18], [8, -6], [11, 0]), jaw: jaw([0, -8], [3, -4], [5, -34], [6, -36], [7, -6], [11, -8]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.35], [5, 0.6], [6, 0.65], [8, 0.3], [11, 0]), T([0, 0], [5, 0.2], [11, 0])], footTargetF: step(3, 5, 1.0, 9) },
});
/** Blow 1, the underarm jab: the javelin dropped to the hip point-up (2), drawn back (3), jabbed up at the belly (4-5), held (6), back (7-9). */
const THROWER_JAB = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 104, base: [0.9, 2.5], s: T([2, -0.8], [3, -1.3], [4, 1.9], [5, 2.4], [6, 2.4], [8, 0.4], [9, 0]), from: 2, to: 9 }),
  dw: { ...freeArm(3, 5, 9), spine: T([0, 0], [3, 6], [5, -14], [6, -14], [8, -4], [11, 0]), jaw: jaw([0, -8], [3, -4], [5, -30], [6, -34], [7, -6], [11, -8]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.3], [5, 0.55], [6, 0.6], [8, 0.25], [11, 0]), T([0, 0], [5, 0.2], [11, 0])], footTargetF: step(3, 5, 0.8, 9) },
});

// ------------------------------------------------------------------ Revenant Arbalests (crossbow in melee)

/** Blow 0, the ram: the crossbow levelled at the chest in both hands and rammed out along its line, the prod's iron into the face. */
const ARB_RAM = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 94, base: [1.2, 2.2], s: T([1, -0.6], [3, -1.4], [4, 2.0], [5, 2.4], [6, 2.4], [8, 0.4], [9, 0]), from: 1, to: 9 }),
  dw: { spine: T([0, 0], [3, 8], [4, -16], [6, -18], [8, -6], [11, 0]), jaw: jaw([0, -8], [3, -4], [4, -32], [6, -34], [7, -6], [11, -8]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.4], [4, 0.6], [6, 0.65], [9, 0.2], [11, 0]), T([0, 0], [4, 0.2], [11, 0])], footTargetF: step(3, 4, 0.9, 9) },
});
/** Blow 1, the club: a crossbow is a heavy club; heaved up over the head by the stock (1-3), held (4), brought down with the whole back onto the head before it (5-6), the impact held (7), lifted back (8-11). A blunt blow, so it swings. */
const ARB_CLUB: BlowDef['a'] = () => (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 120], [3, 160], [4, 164], [5, 110], [6, 60], [7, 56], [9, 20]),
    forearmN: R(rw.forearmN!, 11, [2, 170], [3, 200], [4, 204], [5, 140], [6, 80], [7, 76], [9, 70]),
    weapon: R(rw.weapon!, 11, [2, 150], [3, 196], [4, 202], [5, 130], [6, 62], [7, 56], [9, 70]),
  },
  dw: { spine: T([0, 0], [3, 12], [4, 14], [5, -10], [6, -26], [7, -28], [9, -8], [11, 0]), head: T([0, 0], [4, 6], [6, -8], [8, 0]), jaw: jaw([0, -8], [3, -6], [4, -4], [5, -20], [6, -36], [7, -38], [9, -6], [11, -8]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.4], [5, 0.3], [6, 0.7], [7, 0.75], [9, 0.3], [11, 0]), T([0, 0], [3, -0.1], [6, 0.4], [7, 0.45], [11, 0])], footTargetF: step(4, 6, 1.0, 9) },
});

// ------------------------------------------------------------------ the Lich-Marshal's staff

/** The staff jab: the staff dropped level in the fist, its burning head driven out along its line at the face, held, raised again. */
const LICH_JAB = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 98, base: [1.4, 2.0], s: T([2, -0.8], [3, -1.4], [4, -1.4], [5, 2.2], [6, 2.6], [7, 2.6], [9, 0.2]), from: 2, to: 9 }),
  dw: { spine: T([0, 0], [3, 8], [4, 8], [5, -12], [7, -14], [9, -4], [11, 0]), upperArmF: T([0, 0], [3, 20], [5, -10], [7, -10], [10, 0]), head: T([0, 0], [3, 4], [5, -6], [8, 0]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.3], [5, 0.5], [7, 0.5], [10, 0], [11, 0]), T([0, 0])] },
});

const smear = (f: number): AnimEvent => ({ f, name: 'smear', len: 1, bone: 'weapon' });
const strike = (f: number): AnimEvent => ({ f, name: 'strike' });
export const BLOWS: Record<string, BlowDef> = {
  legPunchStab: { clip: 'idle', o: STILL, a: LEG_PUNCH_STAB, extra: EVERY, ev: [strike(3), strike(5)], warp: holdAt(3) },
  legLowStab: { clip: 'idle', o: STILL, a: LEG_LOW_STAB, extra: EVERY, ev: [strike(4)], warp: holdAt(2) },
  ghoulLunge: { clip: 'idle', o: STILL, a: GHOUL_LUNGE, extra: [...EVERY, 3.5, 4.5], ev: [strike(5)], warp: W0 },
  ghoulHigh: { clip: 'idle', o: STILL, a: GHOUL_HIGH, extra: [...EVERY, 3.5, 4.5], ev: [strike(5)], warp: W0 },
  ghoulJab: { clip: 'idle', o: STILL, a: GHOUL_JAB, extra: [...EVERY, 4.5, 5.5], ev: [strike(3), strike(6)], warp: W0 },
  throwerStab: { clip: 'idle', o: STILL, a: THROWER_STAB, extra: EVERY, ev: [strike(5)], warp: holdAt(3) },
  throwerJab: { clip: 'idle', o: STILL, a: THROWER_JAB, extra: EVERY, ev: [strike(5)], warp: holdAt(3) },
  arbRam: { clip: 'idle', o: STILL, a: ARB_RAM, extra: EVERY, ev: [strike(4)], warp: holdAt(3) },
  arbClub: { clip: 'idle', o: STILL, a: ARB_CLUB, extra: EVERY, ev: [smear(5), strike(6)], warp: holdAt(4) },
  lichJab: { clip: 'idle', o: STILL, a: LICH_JAB, extra: EVERY, ev: [strike(5)], warp: holdAt(4) },
};

// ------------------------------------------------------------------ runs

/** How a body runs (running.md §3, §8, §11). Units are the figure's (a man is ~14 tall). */
export interface RunStyle {
  /** Half the foot's travel along the ground (units). */
  stride: number;
  /** The swing foot's highest lift (heel tucked), units. */
  lift: number;
  /** Hips raised in flight (units). */
  flight: number;
  /** Hips dropped at mid-stance (units). */
  down: number;
  /** Trunk lean (deg, − forward) and the head held against it. */
  lean: number;
  head: number;
  /** Frames each foot is down per half cycle: 4 (light, 2 flight frames) or 5 (heavy, 1 flight frame), 3 (bounding, 3 in the air). */
  stance: 3 | 4 | 5;
  /** The spine folding at mid-stance and opening in flight (deg): the ghoul's bound. */
  arch?: number;
  /** The free arm's swing (deg about its rest) and how bent it is held (forearm − upper arm). */
  swing: number;
  bend: number;
  /** The free arm is the far one (the near one carries the weapon), or neither swings. */
  free: 'F' | 'N' | 'none';
}

// One foot over a 12-frame cycle (N; F is six frames on), x in strides, y in lifts (− up).
const FOOT: Record<RunStyle['stance'], { x: number[]; y: number[] }> = {
  3: { x: [1.0, 0.35, -0.35, -0.95, -1.2, -1.05, -0.6, 0.05, 0.6, 1.0, 1.15, 1.1], y: [0, 0, 0, -0.2, -0.55, -0.9, -1.0, -0.95, -0.75, -0.5, -0.3, -0.1] },
  4: { x: [1.0, 0.5, 0.0, -0.5, -0.95, -1.1, -0.8, -0.2, 0.4, 0.85, 1.1, 1.1], y: [0, 0, 0, 0, -0.18, -0.55, -0.95, -1.0, -0.8, -0.5, -0.25, -0.08] },
  5: { x: [1.0, 0.6, 0.2, -0.2, -0.6, -0.9, -0.85, -0.3, 0.3, 0.8, 1.05, 1.05], y: [0, 0, 0, 0, 0, -0.45, -0.85, -1.0, -0.8, -0.5, -0.25, -0.15] },
};
// Hips over a half cycle (+ down): down at mid-stance, up in flight.
const HIPS: Record<RunStyle['stance'], [number, number][]> = {
  3: [[0.5, 0], [1, 0], [0.4, 0], [0, -0.6], [0, -1], [0, -0.5]],
  4: [[0.35, 0], [0.85, 0], [1, 0], [0.4, 0], [0, -0.5], [0, -1]],
  5: [[0.3, 0], [0.8, 0], [1, 0], [0.75, 0], [0.25, 0], [0, -1]],
};
// The foot's roll: toe down at push-off and in the swing, flat at contact (deg).
const ROLL: Record<RunStyle['stance'], number[]> = {
  3: [6, 0, -10, -30, -30, -18, -10, -4, 0, 4, 6, 6],
  4: [6, 0, 0, -18, -32, -26, -14, -6, 0, 4, 6, 6],
  5: [6, 0, 0, -8, -24, -28, -14, -6, 0, 4, 6, 6],
};

/** A run's keys (12 frames, looping) in a facing; `track` keeps the feet near the line of travel. */
export function runKeys(r: RunStyle, f: Facing, track: number): KP[] {
  const sd = f === 'ne' ? -1 : 1;
  const ft = FOOT[r.stance], hp = HIPS[r.stance], rl = ROLL[r.stance];
  const keys: KP[] = [];
  for (let i = 0; i <= 12; i++) {
    const n = i % 12, m = (i + 6) % 12, h = hp[i % 6]!;
    const py = h[0] * r.down + h[1] * r.flight;
    // The near leg's contact is frame 0: the near arm is back then, the far one forward.
    const ph = Math.cos((i / 12) * 2 * Math.PI);
    const dw: Record<string, number> = { spine: r1(r.lean + (r.arch ? (h[0] - 0.5) * -r.arch : 0)), head: r1(r.head + (r.arch ? h[0] * 6 : 0)) };
    if (r.free !== 'none') {
      const sw = r.free === 'F' ? ph : -ph;
      dw[`upperArm${r.free}`] = r1(sw * r.swing);
      dw[`forearm${r.free}`] = r1(sw * r.swing + r.bend);
    }
    keys.push({
      f: i,
      c: 'linear',
      t: {
        pelvis: [r2(0.12 * ph), r2(py)],
        footTargetN: [r2(ft.x[n]! * r.stride + 1.1 * track * sd), r2(ft.y[n]! * r.lift)],
        footTargetF: [r2(ft.x[m]! * r.stride - 1.1 * track * sd), r2(ft.y[m]! * r.lift)],
      },
      dl: { footN: rl[n]!, footF: rl[m]! },
      dw,
    });
  }
  return keys;
}

/** An arm held still with the fist at `hand` (units from the shoulder) and the weapon at `deg`, the tip bobbing `bob` deg a frame behind the stride. */
export function holdArm(skel: SkeletonData, hand: P2, deg: number, bob = 0, arm: 'N' | 'F' = 'N'): Record<string, Track> {
  const ub = `upperArm${arm}`, fb = `forearm${arm}`, wb = arm === 'N' ? 'weapon' : 'itemF';
  const [u, fo] = armIK(boneLen(skel, ub), boneLen(skel, fb), hand);
  const tip: [number, number][] = [];
  // Lowest a frame after mid-stance (frames 3 and 9), highest a frame after flight.
  for (let f = 0; f <= 12; f++) tip.push([f, r1(deg + bob * Math.cos(((f - 6) / 6) * Math.PI * 2 - Math.PI * 0.5))]);
  return { [ub]: T([0, r1(u)]), [fb]: T([0, r1(fo)]), [wb]: tip };
}

/** The Legionary's charge: shield locked up before the chest, gladius forward at the chest, point up (running.md §4.2-4.3). */
export const LEG_RUN_ARMS = (skel: SkeletonData): Author => () => ({ w: holdArm(skel, [1.5, 1.9], 118, 3), dw: { upperArmF: T([0, 30]), forearmF: T([0, 26]) } });
/** The ghoul's spear held low and level at port in both hands, point forward, the tip dipping late. */
export const GHOUL_RUN_ARMS = (skel: SkeletonData): Author => () => ({ w: holdArm(skel, [1.7, 2.5], 98, 5) });
/** The Arbalest's crossbow at port, carried high before the chest so its prod stands clear of the body by the near shoulder, both hands on it. */
export const ARB_RUN_ARMS = (skel: SkeletonData): Author => () => ({ w: holdArm(skel, [2.2, 1.3], 116, 4) });
/** The thrower's javelin hand stays at the shoulder; the tip bobs. */
export const THROWER_RUN_ARMS = (_skel: SkeletonData): Author => (rw) => ({ w: { weapon: T([0, rw.weapon! - 4], [3, rw.weapon! - 9], [6, rw.weapon! - 4], [9, rw.weapon! - 9], [12, rw.weapon! - 4]) } });

export const RUNS = {
  /** Armoured, shield and sword: short heavy strides, one flight frame, the hips sinking hard, shield arm locked. */
  legionary: { stride: 1.5, lift: 1.7, flight: 0.35, down: 0.5, lean: -10, head: 6, stance: 5, swing: 0, bend: 0, free: 'none' } as RunStyle,
  /** The ghoul's bounds: low and long, three frames in the air, the back folding on landing and opening in flight. */
  ghoul: { stride: 2.1, lift: 2.3, flight: 0.85, down: 0.9, lean: -6, head: -2, stance: 3, arch: 16, swing: 0, bend: 0, free: 'none' } as RunStyle,
  /** The skeleton's lope: long and loose, clean flight, a shallow down, the free arm stiff and out of phase. */
  skeleton: { stride: 2.0, lift: 2.5, flight: 0.55, down: 0.2, lean: -8, head: 4, stance: 4, swing: 34, bend: 45, free: 'F' } as RunStyle,
  /** Gambeson and a crossbow at port: a heavy jog, one flight frame. */
  arbalest: { stride: 1.45, lift: 1.6, flight: 0.3, down: 0.45, lean: -8, head: 6, stance: 5, swing: 0, bend: 0, free: 'none' } as RunStyle,
};

// ------------------------------------------------------------------ from the saddle

/** The rider's weight in a blow at the charge: the trunk leaning into it, the skull down, the jaw gaping on the strike. */
const ride = (chamber: number, drive: number, back: number, lean = -24): Record<string, Track> => ({
  spine: T([0, 0], [chamber, 8], [drive, lean], [drive + 1, lean - 2], [back, -8], [11, 0]),
  head: T([0, 0], [chamber, 4], [drive, -8], [back, 0]),
  jaw: jaw([0, -8], [chamber, -4], [drive, -34], [drive + 1, -36], [back, -8]),
});
/** Black Riders, blow 0: the spear overhand, point down at a man on foot (U6, T6): drawn up and back (2-3), driven down along its line (4-5), held, drawn back (8-9). */
const RIDER_DOWN = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 66, base: [1.5, -0.6], s: T([2, -0.9], [3, -1.5], [4, 1.6], [5, 2.3], [6, 2.3], [8, 0.4], [9, 0]), from: 2, to: 9 }),
  dw: ride(3, 5, 9),
});
/** Black Riders, blow 1: the spear couched under the arm and driven level into the enemy's chest with the horse's surge. */
const RIDER_LEVEL = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 93, base: [1.0, 1.9], s: T([2, -0.8], [3, -1.2], [4, 1.6], [5, 2.1], [6, 2.1], [8, 0.3], [9, 0]), from: 2, to: 9 }),
  dw: { ...ride(3, 5, 9, -28), upperArmF: T([0, 0], [3, 10], [5, -6], [9, 0]) },
});
/** Black Riders, blow 2: the stab down past the horse's shoulder at a man under the hooves, the rider leaning far out over it. */
const RIDER_LOW = (skel: SkeletonData): Author => (rw) => ({
  w: lineArm(skel, rw, { deg: 50, base: [1.3, 1.0], s: T([2, -0.8], [3, -1.2], [4, 1.7], [5, 2.3], [6, 2.3], [8, 0.4], [9, 0]), from: 2, to: 9 }),
  dw: ride(3, 5, 9, -34),
});
/**
 * The Death Knight's sword is drawn and sheathed inside each sword blow (undead-horse.ts
 * SWORD_SLOTS): at frame 1 the near fist carries the upright lance across to the shield hand,
 * which keeps it; at 2 the fist is on the hilt at the far hip, the blade still along the scabbard
 * (back and down); then the blow. At 9 the blade goes back down the scabbard and at 10 the fist
 * takes the lance again. The arm keys of those frames: [upperArmN, forearmN, weapon].
 */
const HAND_OVER = [44, 112, 180] as const;
const AT_HIP = [16, 74, 334] as const;

/**
 * Death Knights, the sword phase, blow 1: the heavy overhead cut (U8: Zornhut, a pause at the
 * apex, the weight in the fall): the sword drawn from the hip (1-2) and heaved up and back over
 * the shoulder, held at the top two frames, the skull up (3-4); it falls through the horse's
 * shoulder line with the trunk (5-6), the follow-through held low by the stirrup (7-8); sheathed
 * and the lance taken back (9-10).
 */
const KNIGHT_OVERHEAD = (): Author => (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, HAND_OVER[0]], [2, AT_HIP[0]], [3, 166], [4, 166], [5, 128], [6, 72], [7, 30], [8, 26], [9, AT_HIP[0]], [10, HAND_OVER[0]]),
    forearmN: R(rw.forearmN!, 11, [1, HAND_OVER[1]], [2, AT_HIP[1]], [3, 228], [4, 228], [5, 160], [6, 80], [7, 30], [8, 26], [9, AT_HIP[1]], [10, HAND_OVER[1]]),
    weapon: R(rw.weapon!, 11, [1, HAND_OVER[2]], [2, AT_HIP[2]], [3, 252], [4, 252], [5, 170], [6, 76], [7, 44], [8, 40], [9, AT_HIP[2]], [10, HAND_OVER[2]]),
  },
  dw: {
    spine: T([0, 0], [2, 8], [3, 12], [4, 12], [5, -10], [6, -28], [7, -32], [8, -32], [10, -8], [11, 0]),
    head: T([0, 0], [3, 8], [4, 8], [6, -10], [8, -10], [11, 0]),
    jaw: jaw([0, -8], [3, -2], [4, -2], [5, -20], [6, -38], [8, -38], [9, -6], [11, -8]),
    upperArmF: T([0, 0], [3, 8], [6, -8], [11, 0]),
  },
});
/** Death Knights, blow 2: the diagonal forehand cut: the sword drawn from the hip (1-2) and laid back flat over the shoulder (3), held (4), cut down and across through the line of the enemy's neck (5-6), through past the horse's neck (7), held (8), sheathed and the lance taken back (9-10). */
const KNIGHT_DIAGONAL = (): Author => (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, HAND_OVER[0]], [2, AT_HIP[0]], [3, 120], [4, 120], [5, 112], [6, 80], [7, 46], [8, 44], [9, AT_HIP[0]], [10, HAND_OVER[0]]),
    forearmN: R(rw.forearmN!, 11, [1, HAND_OVER[1]], [2, AT_HIP[1]], [3, 236], [4, 236], [5, 160], [6, 96], [7, 64], [8, 60], [9, AT_HIP[1]], [10, HAND_OVER[1]]),
    weapon: R(rw.weapon!, 11, [1, HAND_OVER[2]], [2, AT_HIP[2]], [3, 268], [4, 268], [5, 170], [6, 104], [7, 58], [8, 52], [9, AT_HIP[2]], [10, HAND_OVER[2]]),
  },
  dw: { ...ride(4, 6, 10, -26), upperArmF: T([0, 0], [4, 10], [6, -8], [11, 0]) },
});

/** Rider blows by name, with their events. */
export const RIDER_BLOWS: Record<string, { a: (skel: SkeletonData) => Author; ev: AnimEvent[]; sword?: boolean }> = {
  riderDown: { a: RIDER_DOWN, ev: [strike(5)] },
  riderLevel: { a: RIDER_LEVEL, ev: [strike(5)] },
  riderLow: { a: RIDER_LOW, ev: [strike(5)] },
  knightOverhead: { a: KNIGHT_OVERHEAD, ev: [smear(5), smear(6), strike(6)], sword: true },
  knightDiagonal: { a: KNIGHT_DIAGONAL, ev: [smear(5), smear(6), strike(6)], sword: true },
};
