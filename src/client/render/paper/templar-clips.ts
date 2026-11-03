// The Templar foot clips on the mocap (motion/*.json): the captured body (weight, hips, trunk,
// footwork) under arms authored per weapon and timed to the capture's own events. The capture
// subjects held a stick in both hands, so a sword arm, a shield arm, a spear or a bow is ours.
// Keys and reasons: docs/art-references/templar-animation.md (and weapon-attacks.md, running.md).

import { Anim } from '../contract.ts';
import type { P2 } from './core.ts';
import type { Facing } from './facing.ts';
import { acosDeg, angleOf, BREATH, restJoints, type AnimationData, type AnimEvent, type Clip, type SkeletonData } from './skeleton.ts';
import { fromGuard } from './guard.ts';
import { addDrops, facingClip, lagCloth, lastFrame, mapFacings, mocapKeys, overlayKeys, restWorld, type ClipSet, type Drop, type KP, type LagSpec, type MocapOpts, type Track } from './templar-rig.ts';

/** A melee blow (one Attack clip). A kind lists 1-3 of them (`blows`), blow 0 first. */
export type Blow =
  // sword and shield
  | 'cut' | 'swordThrust' | 'bash'
  // spear and shield
  | 'thrust' | 'underhand' | 'shove'
  // a javelin kept in the hand
  | 'jab' | 'stab'
  // the Dane axe, two hands
  | 'chop' | 'axeCut' | 'axeThrust'
  // the missile men's last resort
  | 'butt' | 'punch' | 'staveJab' | 'stirrupJab';

/** How a kind carries its gear at the run (docs/art-references/running.md §4-6). */
export type RunCarry = 'sword' | 'spear' | 'javelin' | 'bow' | 'crossbow' | 'axe';

/** What the clips need to know of a kind (templar-foot.ts FootSpec). */
export interface ClipSpec {
  attack: Blow;
  /** Every melee blow, blow 0 first (default: just `attack`). */
  blows?: readonly Blow[];
  shoot: 'javelin' | 'bow' | 'crossbow' | null;
  brace: 'shield' | 'spear' | 'ready' | 'axe';
  die: 'back' | 'crumple';
  /** The far arm carries a shield or a two-handed grip (it stays with the torso). */
  farHeld: boolean;
  /** A shield on the far forearm: Hit is the shield block. */
  shield?: boolean;
  /** The weapon's key-art angle (for where it lies when dropped). */
  nearDeg?: number;
  /** What the run carries, and whether heavy armour shortens it. */
  carry?: RunCarry;
  heavy?: boolean;
}

export type Tracks = Parameters<typeof overlayKeys>[1];

/** Arm lengths (units, the fist a little past the wrist) and the far shoulder seen from the near one. */
export interface Arms {
  uN: number;
  fN: number;
  uF: number;
  fF: number;
  /** Far shoulder minus near shoulder at rest (units, this facing). */
  sh: P2;
}
/** Authored tracks for a facing, given the rest world angles (to start and end at rest) and the arms (Templar `mk` passes them; other callers may not). */
export type Author = (rw: Record<string, number>, f: Facing, arms?: Arms) => Tracks;
/** Arms when a caller passes none (a Templar foot soldier's). */
export const ARMS0: Arms = { uN: 2.5, fN: 2.4, uF: 2.4, fF: 1.25, sh: [3.0, 0.2] };

/** The arms of a skeleton in a facing (the man's bones, on foot or in the saddle). */
export function armsOf(skel: SkeletonData, facing: Facing): Arms {
  const len = (n: string) => skel.bones.find((b) => b.name === n)?.len ?? 2.3;
  const j = restJoints(skel, facing === 'ne' ? 'ne' : 'se');
  const sN = j.upperArmN!.from, sF = j.upperArmF!.from;
  return { uN: len('upperArmN'), fN: len('forearmN') + 0.6 * len('handN'), uF: len('upperArmF'), fF: len('forearmF') + 0.6 * len('handF'), sh: [sF[0] - sN[0], sF[1] - sN[1]] };
}

const shortTurn = (d: number): number => d - 360 * Math.floor(d / 360 + 0.5);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Two-bone IK for authoring: the world angles of an upper arm and forearm that put the fist at
 * (dx, dy) units from the shoulder (x forward, y down). `elbow` +1 drops the elbow below the
 * shoulder-to-fist line (a jab, an underhand thrust), -1 raises it (an overhand grip: elbow back
 * and up, the fist by the ear). Out of reach is clamped to a nearly straight arm. Deterministic
 * (skeleton.ts series trig), rounded to 0.1°.
 */
export function reach(u: number, f: number, dx: number, dy: number, elbow: 1 | -1): [number, number] {
  const want = Math.hypot(dx, dy) || 1e-6;
  const d = Math.max(Math.abs(u - f) + 0.05, Math.min(u + f - 0.03, want));
  const base = angleOf(dx, dy);
  const a = acosDeg((u * u + d * d - f * f) / (2 * u * d));
  const up = base - elbow * a;
  const ux = u * sinD(up), uy = u * cosD(up);
  const k = d / want;
  return [r1(up), r1(angleOf(dx * k - ux, dy * k - uy))];
}
const sinD = (d: number) => Math.sin((d * Math.PI) / 180), cosD = (d: number) => Math.cos((d * Math.PI) / 180);

/** A fist `t` units along the rig angle `deg` from `p` (a fist travelling along a shaft). */
export const on = (p: P2, deg: number, t: number): P2 => [r2(p[0] + sinD(deg) * t), r2(p[1] + cosD(deg) * t)];

/** One fist key: frame, fist from its shoulder, elbow side, and the weapon's world angle (or undefined: leave it). */
export type Fist = readonly [number, P2, 1 | -1, number?];

/**
 * World-angle tracks for an arm (and its weapon) from fist keys, from rest at 0 to rest at `end`:
 * every key solved by `reach`, each angle unwrapped from the key before so it turns the short way.
 */
export function fistPath(rw: Record<string, number>, A: Arms, end: number, keys: readonly Fist[], side: 'N' | 'F' = 'N', item = side === 'N' ? 'weapon' : 'itemF'): Record<string, Track> {
  const U = `upperArm${side}`, F = `forearm${side}`;
  const tr: Record<string, [number, number][]> = { [U]: [[0, rw[U]!]], [F]: [[0, rw[F]!]], [item]: [[0, rw[item]!]] };
  const push = (n: string, fr: number, v: number) => {
    const t = tr[n]!;
    const prev = t.at(-1)![1];
    t.push([fr, r1(prev + shortTurn(v - prev))]);
  };
  for (const [fr, p, e, w] of keys) {
    const [a, b] = reach(side === 'N' ? A.uN : A.uF, side === 'N' ? A.fN : A.fF, p[0], p[1], e);
    push(U, fr, a);
    push(F, fr, b);
    if (w !== undefined) push(item, fr, w);
  }
  push(U, end, rw[U]!);
  push(F, end, rw[F]!);
  push(item, end, rw[item]!);
  if (tr[item]!.length === 2 && keys.every((k) => k[3] === undefined)) delete tr[item];
  return tr;
}

/** Cloth bones driven late by the body (templar-rig.ts lagCloth). */
export function cloth(run: number): LagSpec[] {
  return [
    { bone: 'skirtN', follow: 'thighN', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'skirtF', follow: 'thighF', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'cloak', follow: 'pelvis', k: 0.35, lag: 2, bias: -9 * run, plumb: 0.55 },
  ];
}

export const T = (...kv: [number, number][]): Track => kv;
/** A track from rest through the given keys and back to rest at `end`. */
export const R = (rest: number, end: number, ...kv: [number, number][]): Track => [[0, rest], ...kv, [end, rest]];

/** Tracks merged (later wins per bone). */
export function merge(...ts: Tracks[]): Tracks {
  const out: { w: Record<string, Track>; dw: Record<string, Track>; tAdd: Record<string, [Track, Track]>; ik: Record<string, Track> } = { w: {}, dw: {}, tAdd: {}, ik: {} };
  for (const t of ts) {
    Object.assign(out.w, t.w ?? {});
    Object.assign(out.dw, t.dw ?? {});
    Object.assign(out.tAdd, t.tAdd ?? {});
    Object.assign(out.ik, t.ik ?? {});
  }
  return out;
}

/**
 * The body under a straight blow (thrust, shove, bash): the weight rocks back onto the rear foot
 * at the chamber (c), the hips drive forward and the lead (shield-side, far) foot steps in at the
 * strike (s), held to h, drawn back by r, at rest at 11. `lean` is the trunk at the strike
 * (negative: forward), `coil` at the chamber (positive: back).
 */
export function lunge(o: { c: number; s: number; h: number; r: number; back: number; fwd: number; step: number; lean: number; coil: number; low?: number }): Tracks {
  const low = o.low ?? 0.25;
  return {
    dw: {
      spine: T([0, 0], [o.c, o.coil], [o.s, o.lean], [o.h, o.lean], [o.r, o.lean * 0.35], [11, 0]),
      head: T([0, 0], [o.c, -o.coil * 0.3], [o.s, -o.lean * 0.45], [o.h, -o.lean * 0.45], [11, 0]),
    },
    tAdd: {
      pelvis: [T([0, 0], [o.c, -o.back], [o.s, o.fwd], [o.h, o.fwd], [o.r, o.fwd * 0.4], [11, 0]), T([0, 0], [o.c, 0.08], [o.s, low], [o.h, low], [o.r, low * 0.4], [11, 0])],
      footTargetF: [T([0, 0], [o.c, 0], [o.s - 1, o.step * 0.55], [o.s, o.step], [o.r, o.step], [10, o.step * 0.3], [11, 0]), T([0, 0], [o.c, 0], [o.s - 1, -0.5], [o.s, 0], [o.r, 0], [10, -0.3], [11, 0])],
    },
  };
}

// ------------------------------------------------------------------ attacks
//
// Every blow: 12 frames, rest at 0 and 11; anticipation ~35 %, a 1-2 frame strike, the impact
// held a frame, a long recover (weapon-attacks.md "Frame-count quick reference"). A thrust's fist
// runs along the shaft's own line (the point never arcs) and is pulled straight back after the
// hit; the shield stays on the chest except in a shield blow.

/** The diagonal forehand cut (cut-diagonal: wind-up 3-4, strike 5-6, impact held 7-8): the blade up in front, over the shoulder, through on the diagonal with a step in. (Shared: the undead use it as is.) */
export const CUT: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 40], [4, 160], [5, 138], [6, 95], [7, 62], [8, 56], [10, 20]),
    forearmN: R(rw.forearmN!, 11, [2, 150], [4, 212], [5, 165], [6, 92], [7, 42], [8, 34], [10, 20]),
    weapon: R(rw.weapon!, 11, [2, 176], [4, 228], [5, 172], [6, 92], [7, 40], [8, 30], [10, 22]),
  },
  dw: { upperArmF: T([0, 0], [4, 16], [6, -6], [8, -12], [11, 0]), forearmF: T([0, 0], [4, 18], [6, 8], [11, 0]) },
  tAdd: {
    pelvis: [T([0, 0], [4, -0.35], [6, 0.5], [8, 0.65], [10, 0.3], [11, 0]), T([0, 0], [4, 0.1], [7, 0.4], [11, 0])],
    footTargetF: [T([0, 0], [4, 0], [5, 0.5], [6, 0.95], [9, 0.9], [11, 0]), T([0, 0], [4, 0], [5, -0.5], [6, 0], [9, 0], [10, -0.3], [11, 0])],
  },
});
/** The Templar cut: the same, but the shield stays on the chest through it (it firms up as the arm goes over, never swings out and back). */
const CUT_TIGHT: Author = (rw, f, A) => ({ ...CUT(rw, f, A), dw: { upperArmF: T([0, 0], [4, 8], [6, 4], [8, 2], [11, 0]), forearmF: T([0, 0], [4, 10], [6, 8], [11, 0]) } });

/**
 * The sword thrust over the shield rim (the high guard of the sword-and-shield man, Maciejowski
 * and I.33: the fist at the shoulder, the blade laid level over the shield's top edge, the point
 * at the face); driven straight out along the blade with a step, while the shield is eased down
 * and turned edge-on so the blade clears it in every facing; pulled straight back.
 */
const SWORD_THRUST: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [0.3, -0.55], d = 92;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.4, fwd: 0.75, step: 1.0, lean: -12, coil: 5 }), {
    w: fistPath(rw, A, 11, [[1, [0.1, 1.2], 1, 120], [2, P, 1, d], [3, on(P, d + 180, 0.5), 1, d], [4, on(P, d, 2.0), 1, d], [5, on(P, d, 3.8), 1, d], [6, on(P, d, 3.7), 1, d], [7, on(P, d, 1.3), 1, d], [8, P, 1, d], [9, [0.1, 1.1], 1, 110], [10, [-0.1, 2.4], 1, 40]]),
    // The shield lowered a touch and drawn in against the chest as the blade goes over it.
    dw: { upperArmF: T([0, 0], [2, -4], [5, -14], [6, -14], [8, -4], [11, 0]), forearmF: T([0, 0], [2, -6], [5, -16], [6, -16], [8, -6], [11, 0]) },
  });
};

/** The shield bash: the blade cocked over the shoulder, the shield driven out with the body behind it; the cut that would follow is held. */
const BASH: Author = (rw) =>
  merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.45, fwd: 1.1, step: 1.25, lean: -16, coil: 6 }), {
    w: {
      upperArmN: R(rw.upperArmN!, 11, [2, 60], [3, 140], [5, 150], [7, 150], [8, 130], [9, 80], [10, 30]),
      forearmN: R(rw.forearmN!, 11, [2, 150], [3, 200], [5, 205], [7, 205], [8, 175], [9, 100], [10, 30]),
      weapon: R(rw.weapon!, 11, [2, 170], [3, 215], [5, 222], [7, 222], [8, 190], [9, 110], [10, 40]),
    },
    dw: { upperArmF: T([0, 0], [3, -8], [4, 22], [5, 40], [6, 42], [8, 14], [11, 0]), forearmF: T([0, 0], [3, -4], [5, 30], [6, 30], [8, 10], [11, 0]) },
  });

/** The overhand spear thrust over the shield rim: the spear brought level over the shoulder, the fist by the ear, then driven straight out and down along the shaft at face height; pulled straight back to the chamber, then shouldered. */
export const THRUST: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-1.0, -1.25], d = 84;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.45, fwd: 0.8, step: 1.05, lean: -14, coil: 6 }), {
    w: fistPath(rw, A, 11, [[1, [-0.3, -0.4], -1, 130], [2, P, -1, d], [3, on(P, d + 180, 0.45), -1, d], [4, on(P, d, 2.3), -1, d], [5, on(P, d, 4.6), -1, d], [6, on(P, d, 4.5), -1, d], [7, on(P, d, 1.5), -1, d], [8, P, -1, d], [9, [-0.5, -0.6], -1, 125], [10, [-0.2, 0.6], 1, 165]]),
    dw: { upperArmF: T([0, 0], [3, 10], [5, 6], [8, 10], [11, 0]), forearmF: T([0, 0], [3, 10], [5, 8], [8, 10], [11, 0]) },
  });
};

/** The underhand spear thrust: the spear dropped to the hip, point at the belly, then driven forward and up along the shaft; pulled back to the hip and brought upright. */
export const UNDERHAND: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-1.25, 2.9], d = 101;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.4, fwd: 0.75, step: 1.0, lean: -10, coil: 3, low: 0.45 }), {
    w: fistPath(rw, A, 11, [[1, [-0.7, 2.3], 1, 145], [2, P, 1, d], [3, on(P, d + 180, 0.35), 1, d], [4, on(P, d, 2.1), 1, d], [5, on(P, d, 4.2), 1, d], [6, on(P, d, 4.1), 1, d], [7, on(P, d, 1.4), 1, d], [8, P, 1, d], [9, [-0.8, 2.4], 1, 140], [10, [-0.4, 2.2], 1, 168]]),
    dw: { upperArmF: T([0, 0], [3, 10], [5, 8], [8, 10], [11, 0]), forearmF: T([0, 0], [3, 12], [5, 10], [8, 12], [11, 0]) },
  });
};

/** The shield shove: the spear held back upright, the round shield punched into the enemy's with a step and the whole weight. */
const SHOVE: Author = (rw) =>
  merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.55, fwd: 1.45, step: 1.5, lean: -18, coil: 6 }), {
    w: { weapon: R(rw.weapon!, 11, [3, 172], [5, 168], [7, 168], [9, 176]) },
    dw: {
      upperArmF: T([0, 0], [3, -10], [4, 30], [5, 62], [6, 64], [8, 22], [11, 0]), forearmF: T([0, 0], [3, -6], [5, 36], [6, 36], [8, 12], [11, 0]),
      upperArmN: T([0, 0], [3, -6], [5, -22], [6, -22], [8, -8], [11, 0]), forearmN: T([0, 0], [5, 18], [6, 18], [11, 0]),
    },
  });

/** A javelin jab underarm: the fist at the hip, the point driven straight out and up. */
const JAB: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-1.0, 2.5], d = 98;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.35, fwd: 0.65, step: 0.85, lean: -11, coil: 4 }), {
    w: fistPath(rw, A, 11, [[2, P, 1, d], [3, on(P, d + 180, 0.35), 1, d], [4, on(P, d, 1.9), 1, d], [5, on(P, d, 3.7), 1, d], [6, on(P, d, 3.6), 1, d], [7, on(P, d, 1.2), 1, d], [8, P, 1, d], [10, [-0.4, 2.3], 1, 112]]),
  });
};
/** A javelin stabbed overhand: the fist by the ear, the point driven down at the face. */
const STAB: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-0.9, -1.15], d = 80;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.4, fwd: 0.7, step: 0.9, lean: -13, coil: 5 }), {
    w: fistPath(rw, A, 11, [[1, [-0.4, 0.2], -1, 115], [2, P, -1, d], [3, on(P, d + 180, 0.4), -1, d], [4, on(P, d, 2.1), -1, d], [5, on(P, d, 4.2), -1, d], [6, on(P, d, 4.1), -1, d], [7, on(P, d, 1.3), -1, d], [8, P, -1, d], [9, [-0.5, 0.3], -1, 110]]),
  });
};
/** A lunge with the fist. */
const PUNCH: Author = (rw) => ({
  w: { upperArmN: R(rw.upperArmN!, 11, [3, -25], [5, 85], [6, 82], [9, 20]), forearmN: R(rw.forearmN!, 11, [3, 80], [5, 90], [6, 88], [9, 40]) },
});
/** The crossbow butt-stroke. */
const BUTT: Author = (rw) => ({
  w: { upperArmN: R(rw.upperArmN!, 11, [3, rw.upperArmN! - 25], [5, rw.upperArmN! + 45], [6, rw.upperArmN! + 48]), weapon: R(rw.weapon!, 11, [3, rw.weapon! - 30], [5, rw.weapon! + 40], [6, rw.weapon! + 40]) },
  dw: { upperArmF: T([0, 0], [3, -15], [5, 30], [6, 32], [11, 0]), forearmF: T([0, 0], [5, 20], [11, 0]) },
});
/**
 * The bow-stave jab (the archer's second resort): the bow turned from upright to point its upper
 * limb at the enemy's face, then rammed straight out along the stave from the far shoulder with a
 * step, like a short staff; pulled back and stood upright again. The near hand comes up to guard.
 */
export const STAVE_JAB: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-0.2, 1.6], d = 98;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.45, fwd: 0.9, step: 1.1, lean: -14, coil: 5 }), {
    w: fistPath(rw, A, 11, [[1, [0.1, 2.0], 1, 150], [2, P, 1, d], [3, on(P, d + 180, 0.5), 1, d], [4, on(P, d, 1.8), 1, d], [5, on(P, d, 3.6), 1, d], [6, on(P, d, 3.5), 1, d], [7, on(P, d, 1.2), 1, d], [8, P, 1, d], [9, [0.1, 2.0], 1, 140]], 'F'),
    dw: { upperArmN: T([0, 0], [3, 20], [5, 34], [6, 34], [8, 14], [11, 0]), forearmN: T([0, 0], [3, 40], [5, 60], [6, 60], [8, 24], [11, 0]) },
  });
};
/**
 * The crossbow's stirrup-end jab (after the butt-stroke): the bow levelled at the belly, the near
 * fist on the stock at the hip and the far hand under the prod, then rammed straight out along the
 * stock so the iron stirrup takes the blow; pulled back and brought up to the carry.
 */
const STIRRUP_JAB: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-0.5, 2.3], d = 93;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.45, fwd: 0.85, step: 1.05, lean: -14, coil: 5, low: 0.35 }), {
    w: fistPath(rw, A, 11, [[1, [-0.3, 2.4], 1, 108], [2, P, 1, d], [3, on(P, d + 180, 0.45), 1, d], [4, on(P, d, 1.7), 1, d], [5, on(P, d, 3.3), 1, d], [6, on(P, d, 3.2), 1, d], [7, on(P, d, 1.1), 1, d], [8, P, 1, d], [10, [-0.3, 2.4], 1, 110]]),
    // The far hand forward under the prod, travelling with the stock.
    dw: { upperArmF: T([0, 0], [2, 22], [3, 18], [5, 42], [6, 42], [7, 28], [8, 22], [11, 0]), forearmF: T([0, 0], [2, 10], [3, 8], [5, 14], [6, 14], [8, 10], [11, 0]) },
  });
};
/** The two-handed overhead chop (chop: up past vertical 3-4, the drop 5-6, the bit lagging the hands, the strike held 7-8). */
const CHOP: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [3, 150], [4, 168], [5, 150], [6, 95], [7, 80], [8, 82]),
    forearmN: R(rw.forearmN!, 11, [3, 190], [4, 200], [5, 152], [6, 82], [7, 62], [8, 66]),
    weapon: R(rw.weapon!, 11, [3, 205], [4, 216], [5, 170], [6, 72], [7, 48], [8, 56]),
  },
});
/**
 * The axe's diagonal from the shoulder (a Zornhau with a Dane axe): the haft laid over the near
 * shoulder at shoulder height, the bit behind the head; the hips turn in with a step and the bit
 * comes down through the level and on, low across the front, the trunk folding after it.
 */
const AXE_CUT: Author = (rw) =>
  merge(lunge({ c: 3, s: 5, h: 7, r: 9, back: 0.4, fwd: 0.8, step: 1.0, lean: -20, coil: 8, low: 0.5 }), {
    w: {
      upperArmN: R(rw.upperArmN!, 11, [2, 40], [3, 60], [4, 62], [5, 84], [6, 62], [7, 30], [8, 26], [10, 20]),
      forearmN: R(rw.forearmN!, 11, [2, 130], [3, 158], [4, 160], [5, 108], [6, 64], [7, 24], [8, 22], [10, 40]),
      weapon: R(rw.weapon!, 11, [2, 200], [3, 242], [4, 248], [5, 150], [6, 76], [7, 26], [8, 22], [10, 90]),
    },
  });
/** The axe's top spike rammed forward along the haft, both fists low, the body behind it. */
const AXE_THRUST: Author = (rw, _f, A = ARMS0) => {
  const P: P2 = [-1.3, 2.6], d = 95;
  return merge(lunge({ c: 3, s: 5, h: 6, r: 8, back: 0.45, fwd: 0.95, step: 1.1, lean: -14, coil: 5, low: 0.4 }), {
    w: fistPath(rw, A, 11, [[1, [-0.9, 2.2], 1, 118], [2, P, 1, d], [3, on(P, d + 180, 0.4), 1, d], [4, on(P, d, 1.7), 1, d], [5, on(P, d, 3.4), 1, d], [6, on(P, d, 3.3), 1, d], [7, on(P, d, 1.1), 1, d], [8, P, 1, d], [10, [-1.0, 2.2], 1, 125]]),
  });
};

// ------------------------------------------------------------------ missiles

/** The javelin (javelin: withdraw to 3, deliver 4-5 over the block, released at 5 rising ~35°, follow-through). */
const JAVELIN: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 200], [3, 210], [4, 172], [5, 140], [6, 70], [8, 12]),
    forearmN: R(rw.forearmN!, 11, [2, 240], [3, 250], [4, 200], [5, 120], [6, 45], [8, 20]),
    weapon: R(rw.weapon!, 11, [2, 108], [3, 110], [4, 118], [5, 125], [6, 125]),
  },
  dw: { upperArmF: T([0, 0], [3, 40], [5, -10], [8, -15], [11, 0]), forearmF: T([0, 0], [3, 55], [5, 20], [11, 0]) },
});

/** How high the archers aim (degrees above level): over the heads of their own front ranks. */
export const BOW_ELEVATION = 35;

/**
 * The war bow aimed high (bow: raise 1-3, draw with the back 4-6, held, loose 7 with the draw hand
 * flying back, the follow-through held). The whole T of the draw tilts up `elev` degrees: the bow
 * arm straight along the arrow, the stave square to it, the draw fist at the jaw on the arrow's
 * line, the draw elbow back and down behind it, the trunk leaning back a little from the hips.
 */
export function bowAuthor(elev: number): Author {
  return (rw, _f, A = ARMS0) => {
    const a = 90 + elev;
    const reachF = A.uF + A.fF;
    // The bow fist at full reach along the arrow; the nock a draw-length back along the same line.
    const grip: P2 = [A.sh[0] + sinD(a) * reachF, A.sh[1] + cosD(a) * reachF];
    const draw = reachF + 0.2;
    const nock: P2 = [grip[0] - sinD(a) * draw, grip[1] - cosD(a) * draw];
    const [uF, fF] = reach(A.uF, A.fF, grip[0] - A.sh[0], grip[1] - A.sh[1], 1);
    const [uN0, fN0] = reach(A.uN, A.fN, nock[0] + sinD(a) * 2.2, nock[1] + cosD(a) * 2.2 + 0.3, -1);
    const [uN, fN] = reach(A.uN, A.fN, nock[0], nock[1], -1);
    const [uN2, fN2] = reach(A.uN, A.fN, nock[0] - sinD(a) * 1.2, nock[1] - cosD(a) * 1.2 + 0.5, -1);
    const up = elev * 0.25;
    return {
      w: {
        upperArmF: R(rw.upperArmF!, 11, [2, uF - 6], [4, uF], [7, uF], [8, uF - 3], [10, (uF + rw.upperArmF!) / 2]),
        forearmF: R(rw.forearmF!, 11, [2, fF - 4], [4, fF], [7, fF], [8, fF - 3], [10, (fF + rw.forearmF!) / 2]),
        itemF: R(rw.itemF!, 11, [2, 180 + elev - 4], [4, 180 + elev], [7, 180 + elev], [8, 182 + elev], [10, 180 + elev / 2]),
        upperArmN: R(rw.upperArmN!, 11, [2, uN0], [4, uN], [6, uN], [7, uN], [8, uN2], [10, (uN2 + rw.upperArmN!) / 2]),
        forearmN: R(rw.forearmN!, 11, [2, fN0], [4, fN], [6, fN], [7, fN], [8, fN2], [10, (fN2 + rw.forearmN!) / 2]),
        head: R(rw.head!, 11, [3, rw.head! - up], [8, rw.head! - up]),
      },
      dw: { spine: T([0, 0], [3, up], [8, up], [11, 0]) },
    };
  };
}
/** The foot archers' shot. */
export const BOW: Author = bowAuthor(BOW_ELEVATION);

/**
 * The crossbow (direct, flat shooting): shouldered and aimed level, loosed at 3 with a kick back
 * into the shoulder; then the span: the bow swung point-down onto its stirrup at the near foot,
 * the man stoops to hook the string on his belt claw, and straightening his back draws it to the
 * nut; then it comes back up to the carry.
 */
const CROSSBOW: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 64], [2, 70], [3, 62], [4, 30], [5, 4], [6, 2], [7, 4], [8, 6], [9, 10], [10, 16]),
    forearmN: R(rw.forearmN!, 11, [1, 112], [2, 120], [3, 128], [4, 80], [5, 30], [6, 22], [7, 26], [8, 40], [9, 60]),
    weapon: R(rw.weapon!, 11, [1, 94], [2, 93], [3, 100], [4, 50], [5, 6], [6, 4], [7, 6], [8, 8], [9, 60], [10, 100]),
  },
  dw: {
    spine: T([0, 0], [2, -4], [3, 2], [4, -10], [5, -30], [6, -42], [7, -22], [8, -6], [11, 0]),
    head: T([0, 0], [2, -6], [3, -4], [5, 12], [6, 18], [7, 10], [8, 2], [11, 0]),
    upperArmF: T([0, 0], [1, 46], [2, 50], [3, 48], [4, 20], [5, 10], [6, 6], [8, 4], [11, 0]),
    forearmF: T([0, 0], [1, 56], [2, 60], [3, 64], [4, 30], [6, 10], [11, 0]),
  },
  tAdd: {
    pelvis: [T([0, 0], [2, 0], [3, -0.2], [4, 0], [6, 0.2], [8, 0.05], [11, 0]), T([0, 0], [4, 0.1], [5, 0.7], [6, 1.15], [7, 0.6], [8, 0.1], [11, 0])],
    // The near foot steps into the stirrup in front and back out.
    footTargetN: [T([0, 0], [4, 0.2], [5, 0.9], [7, 0.9], [9, 0.2], [11, 0]), T([0, 0], [4, -0.5], [5, 0], [7, 0], [8, -0.4], [9, 0], [11, 0])],
  },
});

// ------------------------------------------------------------------ the rest

/** Struck: the struck shoulder and head snap back first, then the trunk; the rear foot steps back to catch the weight (over the capture's dropped hips). */
export const HIT: Author = () => ({
  dw: {
    spine: T([0, 16], [1, 20], [2, 12], [3, 5], [4, 0]), head: T([0, 18], [1, 24], [2, 14], [3, 6], [4, 0]),
    upperArmN: T([0, 18], [1, 26], [2, 10], [4, 0]), forearmN: T([0, 30], [1, 40], [2, 16], [4, 0]),
    upperArmF: T([0, 12], [1, 16], [2, 6], [4, 0]), forearmF: T([0, 10], [1, 14], [2, 6], [4, 0]),
  },
  tAdd: { pelvis: [T([0, -0.35], [1, -0.7], [2, -0.6], [4, -0.2]), T([0, 0.05], [1, 0.15], [4, 0])], footTargetN: [T([0, 0], [1, -0.7], [2, -0.8], [4, -0.3]), T([0, 0], [1, -0.35], [2, 0], [4, 0])] },
});

/** The shield block (Hit for shielded kinds): punch the shield out to meet the blow, the head ducks behind the rim; the blow jolts it back, the weight rocks onto the rear foot; back to guard. */
export const BLOCK: Author = () => ({
  dw: {
    upperArmF: T([0, 0], [1, 30], [2, 18], [4, 0]), forearmF: T([0, 0], [1, 24], [2, 14], [4, 0]),
    spine: T([0, 0], [1, -6], [2, 5], [4, 0]), head: T([0, 0], [1, -8], [2, 2], [4, 0]),
    upperArmN: T([0, 0], [1, 8], [2, 12], [4, 0]),
  },
  tAdd: { pelvis: [T([0, 0], [1, 0.15], [2, -0.35], [4, 0]), T([0, 0], [2, 0.1], [4, 0])], footTargetN: [T([0, 0], [1, 0], [2, -0.4], [4, -0.15]), T([0, 0], [1, -0.3], [2, 0], [4, 0])] },
});

/** The fall back: the trunk ends flat, with a bounce of the hips as the back lands (frame 8); the off hand lets go of a two-handed haft. */
const DIE_BACK: Author = () => ({
  dw: { spine: T([0, 0], [6, 0], [8, 18], [11, 24]), chest: T([0, 0], [8, 10], [11, 16]), head: T([0, 0], [8, 0], [11, 6]) },
  tAdd: { pelvis: [T([0, 0]), T([0, 0], [7, 0], [8, -0.3], [9, 0])] },
  ik: { armF2h: T([0, 1], [2, 0]) },
});
const DIE_FWD: Author = () => ({
  tAdd: { pelvis: [T([0, 0]), T([0, 0], [8, 0], [9, -0.25], [10, 0])] },
  ik: { armF2h: T([0, 1], [2, 0]) },
});

/** A held fist: the arm's world angles that put the fist at `p` from its shoulder (and the item at `deg`). */
export function holdFist(A: Arms, p: P2, elbow: 1 | -1, deg?: number, side: 'N' | 'F' = 'N'): Record<string, Track> {
  const [u, f] = reach(side === 'N' ? A.uN : A.uF, side === 'N' ? A.fN : A.fF, p[0], p[1], elbow);
  const out: Record<string, Track> = { [`upperArm${side}`]: T([0, u]), [`forearm${side}`]: T([0, f]) };
  if (deg !== undefined) out[side === 'N' ? 'weapon' : 'itemF'] = T([0, deg]);
  return out;
}
/** The fighting crouch under every guard: knees bent (hips down), the trunk forward over the lead foot, the head up. */
export const crouch = (lean: number, low = 0.12): Tracks => ({ dw: { spine: T([0, lean]), head: T([0, -lean * 0.45]) }, tAdd: { pelvis: [T([0, 0.1]), T([0, low])] } });

/**
 * Brace is the man's **guard** (weapon-attacks.md "Guards"): what he stands in when the enemy is in
 * reach and what every blow leaves from and comes back to (guard.ts). The shield wall, the spear
 * set against horse and the crossbowman's crouch are guards already; the rest are the weapon's
 * own ready stance.
 */
export type Guard = ClipSpec['brace'] | 'javelin' | 'bow' | 'crossbow';
const BRACE: Record<Guard, Author> = {
  // The high guard behind the shield (Maciejowski, I.33): the kite up to the chin covering the
  // trunk, the sword fist cocked at the shoulder over the rim, the blade sloped up at the enemy.
  shield: (_rw, _f, A = ARMS0) => merge(crouch(-12), { w: holdFist(A, [0.75, -0.35], 1, 114), dw: { upperArmF: T([0, 40]), forearmF: T([0, 34]) } }),
  // The spear levelled underhand at the hip, point at a horse's chest, the shield forward.
  spear: (_rw, _f, A = ARMS0) => merge(crouch(-14, 0.15), { w: holdFist(A, [-1.1, 2.55], 1, 106), dw: { upperArmF: T([0, 24]), forearmF: T([0, 20]) } }),
  // The Dane axe across the body, the bit up by the near shoulder, both fists low and forward.
  axe: (_rw, _f, A = ARMS0) => merge(crouch(-12, 0.15), { w: holdFist(A, [0.2, 1.6], 1, 146) }),
  ready: () => merge(crouch(-10), { dw: { upperArmN: T([0, 10]), forearmN: T([0, 20]), upperArmF: T([0, 10]), forearmF: T([0, 15]) } }),
  // A javelin kept underarm at the hip, point out; the buckler and the bundle forward.
  javelin: (_rw, _f, A = ARMS0) => merge(crouch(-12, 0.12), { w: holdFist(A, [-0.9, 2.4], 1, 100), dw: { upperArmF: T([0, 24]), forearmF: T([0, 22]) } }),
  // The bow held out before him in the bow hand, the upper limb leaning at the enemy; the free fist up.
  bow: (_rw, _f, A = ARMS0) => merge(crouch(-10, 0.12), { w: { upperArmN: T([0, 34]), forearmN: T([0, 128]), ...holdFist(A, [1.2, 1.5], 1, 146, 'F') } }),
  // The crossbow levelled at the belly like a club, the far hand under the prod (the stirrup jab's chamber).
  crossbow: (_rw, _f, A = ARMS0) => merge(crouch(-12, 0.15), { w: holdFist(A, [-0.45, 2.3], 1, 100), dw: { upperArmF: T([0, 22]), forearmF: T([0, 10]) } }),
};

// ------------------------------------------------------------------ the run

/** A cycle over 12 frames (13 keys): amp × −cos, `lag` frames late; the near leg is forward at frame 0, so the near arm is back. */
export function osc(base: number, amp: number, lag = 0, n = 12, cycles = 1): Track {
  return Array.from({ length: n + 1 }, (_, f) => [f, r1(base - amp * cosD((360 * cycles * (f - lag)) / n))] as [number, number]);
}

/**
 * The arms and trunk at the run, per carry (running.md §4-6 and §11). Not a quick walk: the trunk
 * leans from the hips, the head stays level, the arms are bent and driven, or held still where
 * they carry something:
 * - sword: the shield arm locked across the chest (no counter-swing on the shield side), the blade
 *   carried forward at shoulder height, elbow bent ~110°, rocking a little a frame late;
 * - spear: the shield locked; the spear sloped forward at the port in the near fist, its tip
 *   bobbing two frames behind the body;
 * - javelin: the bundle and buckler held to the chest; one javelin poised at the shoulder;
 * - bow: the bow held low and forward in the bow hand; the free arm pumps, elbow at ~90°;
 * - crossbow: the crossbow held across the chest at the port in both arms, the pavise on the back;
 * - axe: the Dane axe across the body at the port in both fists, the bit up by the near shoulder.
 */
function runArms(carry: RunCarry, heavy: boolean): Author {
  const lean = heavy ? -10 : -14;
  return (rw) => {
    const base: Tracks = { w: { head: T([0, rw.head! - 5]) }, dw: { spine: T([0, lean]) } };
    const shieldLock: Record<string, Track> = { upperArmF: osc(20, 3, 2), forearmF: T([0, 38]) };
    switch (carry) {
      case 'sword':
        return merge(base, { w: { ...base.w, upperArmN: osc(18, 9), forearmN: osc(118, 7, 1), weapon: osc(132, 6, 1.5) }, dw: { ...base.dw, ...shieldLock } });
      case 'spear':
        return merge(base, { w: { ...base.w, upperArmN: osc(8, 6), forearmN: osc(96, 5, 1), weapon: osc(126, 4, 2) }, dw: { ...base.dw, ...shieldLock } });
      case 'javelin':
        return merge(base, { w: { ...base.w, upperArmN: osc(-6, 10), forearmN: osc(98, 8, 1), weapon: osc(118, 4, 2) }, dw: { ...base.dw, upperArmF: osc(14, 6, 1), forearmF: T([0, 34]) } });
      case 'bow':
        return merge(base, { w: { ...base.w, upperArmN: osc(rw.upperArmN!, 34), forearmN: osc(rw.upperArmN! + 82, 26, 1) }, dw: { ...base.dw, upperArmF: osc(14, 5, 1), forearmF: T([0, 26]) } });
      case 'crossbow':
        return merge(base, { w: { ...base.w, upperArmN: osc(14, 4), forearmN: osc(104, 4, 1), weapon: osc(132, 3, 2) }, dw: { ...base.dw, upperArmF: osc(34, 3, 1), forearmF: T([0, 52]) } });
      case 'axe':
        return merge(base, { w: { ...base.w, upperArmN: osc(8, 4), forearmN: osc(92, 4, 1), weapon: osc(148, 4, 2) } });
    }
  };
}

// ------------------------------------------------------------------ building

/** Keys for a facing from a mocap clip with authored tracks laid over it. */
function mk(skel: SkeletonData, f: Facing, clip: string, o: MocapOpts, author?: Author, extra: number[] = []): { keys: KP[]; ev: AnimEvent[] } {
  const { keys, clip: mc } = mocapKeys(skel, clip, f, o);
  const tr = author ? author(restWorld(skel, f), f, armsOf(skel, f)) : {};
  return { keys: overlayKeys(keys, tr, extra), ev: mc.events.map((e) => ({ ...e })) };
}

/** A slot shows nothing from frame `from` until `to` (a thrown weapon gone from the hand). */
function hideSlot(c: Clip, slot: string, from: number, to: number): Clip {
  const b = c as { byFacing: Record<string, AnimationData> };
  const keys = [{ f: 0, v: slot }, { f: from, v: null }, { f: to, v: slot }];
  return { byFacing: Object.fromEntries(Object.entries(b.byFacing).map(([f, a]) => [f, { ...a, slots: { ...(a.slots ?? {}), [slot]: keys } }])) };
}

const EVERY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Each blow: its author, the capture under it, and its events (a smear only on a cut's fastest frame; `strike` on the impact). */
const BLOWS: Record<Blow, { author: Author; clip: string; o: MocapOpts; ev: AnimEvent[]; x?: number[] }> = {
  cut: { author: CUT_TIGHT, clip: 'cut-diagonal', o: { torso: 0.4, travel: 0, feet: 0.3 }, ev: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }], x: [2, 10] },
  swordThrust: { author: SWORD_THRUST, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  bash: { author: BASH, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  thrust: { author: THRUST, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  underhand: { author: UNDERHAND, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  shove: { author: SHOVE, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  jab: { author: JAB, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  stab: { author: STAB, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  punch: { author: PUNCH, clip: 'thrust', o: { torso: 0.6, travel: 1, feet: 1 }, ev: [{ f: 5, name: 'strike' }], x: [] },
  butt: { author: BUTT, clip: 'thrust', o: { torso: 0.5, travel: 1, feet: 0.8 }, ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }], x: [] },
  chop: { author: CHOP, clip: 'chop', o: { torso: 0.7, travel: 1, feet: 0.6 }, ev: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }], x: [] },
  axeCut: { author: AXE_CUT, clip: 'cut-diagonal', o: { torso: 0.3, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 6, name: 'strike' }] },
  staveJab: { author: STAVE_JAB, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  stirrupJab: { author: STIRRUP_JAB, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
  axeThrust: { author: AXE_THRUST, clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, ev: [{ f: 5, name: 'strike' }] },
};

/** Every Anim of a foot kind, and its melee blows (blow 0 is also the Attack clip). */
export function mocapFootClips(skel: SkeletonData, s: ClipSpec): { clips: ClipSet; attacks: Clip[] } {
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => { keys: KP[]; ev: AnimEvent[] }, ev?: AnimEvent[], run = 0): Clip => {
    const se = keys('se'), ne = keys('ne');
    const c = facingClip(skel, name, n, loop, (f) => (f === 'ne' ? ne.keys : se.keys), ev ?? se.ev);
    return lagCloth(skel, c, n, loop, cloth(run));
  };
  const withBreath = (c: Clip, alpha = 1): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', never> };
    return { byFacing: { se: [{ anim: b.byFacing.se }, { anim: BREATH, alpha }], ne: [{ anim: b.byFacing.ne }, { anim: BREATH, alpha }] } };
  };
  const sword = s.attack === 'cut' || s.attack === 'punch';
  // Locomotion: the march (drilled troops) and the run; the arm that carries the weapon swings from the capture, the shield arm rides with the trunk.
  // A tall thing carried (a spear, a javelin bundle, a bow, an axe) is held steady against the
  // body: it would sweep through the head's zone and boil (README no-boil rule 4).
  const tallN = !sword, tallF = s.shoot === 'bow' || s.shoot === 'javelin';
  const gaitArms = (g: number): MocapOpts['arms'] => ({ N: tallN ? 0 : g, F: s.farHeld || tallF ? 0 : g });
  // The walk: a long stride (feet 0.3 H apart at contact), the hips down 1-2 px just after each
  // contact, the shoulders counter-swinging against the hips, the sword carried angled up.
  // In the stance the feet stand 3 units apart across the body; walking, they track close to the
  // line of travel, so the two half-strides look alike.
  const track = (f: Facing, k: number): Record<string, [Track, Track]> => {
    const sd = f === 'ne' ? -1 : 1;
    return { footTargetN: [T([0, 1.1 * k * sd]), T([0, 0])], footTargetF: [T([0, -1.1 * k * sd]), T([0, 0])] };
  };
  const walkA: Author = (rw, f) => {
    const bob = T([0, 0.12], [1, 0.25], [2, 0.12], [3, -0.12], [4, -0.15], [5, 0], [6, 0.12], [7, 0.25], [8, 0.12], [9, -0.12], [10, -0.15], [11, 0]);
    const twist = T([0, -0.15], [3, 0], [6, 0.15], [9, 0], [11, -0.1]);
    return {
      // The sword rides at the near hip, its blade angled up and back: clear of the shield face and
      // below the head (the lint's head zone).
      w: (sword ? { head: T([0, rw.head!]), weapon: T([0, 236]) } : { head: T([0, rw.head!]) }) as Record<string, Track>,
      dw: sword ? { forearmN: T([0, 18]) } : ({} as Record<string, Track>),
      tAdd: { pelvis: [T([0, 0]), bob], chest: [twist, T([0, 0])], ...track(f, 1) },
    };
  };
  const walk = fc('walk', 12, true, (f) => mk(skel, f, 'walk', { ref: 'mean', torso: tallF ? 0.2 : 0.5, arms: gaitArms(0.55), roll: 0.6, feet: 1.25, mirror: 12 }, walkA), undefined, 0.3);
  // The run (CMU 09_02: flight at 4-5 and 10-11, the hips lowest in mid-stance, highest in
  // flight). Heavy armour: a shorter stride and less lift (running.md §3.4); light men: a longer
  // stride and more flight. The arms are the carry's.
  const carry: RunCarry = s.carry ?? (sword ? 'sword' : 'spear');
  const heavy = !!s.heavy;
  const runA: Author = (rw, f, A) => merge({ tAdd: track(f, heavy ? 1.0 : 1.1) }, runArms(carry, heavy)(rw, f, A));
  const light = carry === 'bow' || carry === 'javelin';
  const run = fc('run', 12, true, (f) => mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: { N: 0, F: 0 }, roll: 0.5, mirror: 12, feet: heavy ? 0.78 : light ? 1.12 : 1, travel: heavy ? 0.7 : light ? 1.15 : 1 }, runA, EVERY), undefined, 1);
  // Idle: the capture's slow weight shift, small (the key art must hold), and breathing.
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0.1, travel: 0.16, feet: 0 })));
  const blowClip = (b: Blow): Clip => {
    const d = BLOWS[b];
    return fc('attack', 12, false, (f) => mk(skel, f, d.clip, d.o, d.author, d.x ?? EVERY), d.ev);
  };
  // In a fight a man stands in his guard (the Brace clip) and every blow leaves it and comes back to it.
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 1.0, torso: 0, feet: 0.4 }, BRACE[s.brace === 'ready' && s.shoot ? s.shoot : s.brace])), 0.6);
  const attacks = (s.blows ?? [s.attack]).map((b) => fromGuard(skel, blowClip(b), brace));
  const attack = attacks[0]!;
  let shoot = attack;
  // The javelin leaves the hand at the release; the last frame takes the next from the bundle.
  if (s.shoot === 'javelin') shoot = hideSlot(fc('shoot', 12, false, (f) => mk(skel, f, 'javelin', { torso: 0.7, travel: 1, feet: 1 }, JAVELIN, [2])), 'weapon', 5, 11);
  // The string comes back with the draw hand from the draw to the loose (the `draw` event).
  if (s.shoot === 'bow') shoot = fc('shoot', 12, false, (f) => mk(skel, f, 'bow', { torso: 0.5, travel: 1, feet: 0.5 }, BOW, [2, 4, 8]), [{ f: 3, name: 'draw', len: 4 }, { f: 7, name: 'release' }]);
  if (s.shoot === 'crossbow') shoot = fc('shoot', 12, false, (f) => mk(skel, f, 'brace', { ref: 'first', torso: 0, travel: 0.4, feet: 0 }, CROSSBOW, EVERY), [{ f: 3, name: 'release' }]);
  // A long spear stays upright in the fist while the body recoils.
  const hitA: Author = (rw, f, A) => ({ ...HIT(rw, f, A), ...(s.attack === 'thrust' ? { w: { weapon: T([0, rw.weapon! - 4], [1, rw.weapon! - 6], [4, rw.weapon!]) } } : {}) });
  // Shielded men snap back like anyone, and punch the shield out against the blow as they do.
  const hitS: Author = (rw, f, A) => {
    const h = hitA(rw, f, A), b = BLOCK(rw, f, A);
    return { ...h, dw: { ...h.dw, upperArmF: b.dw!.upperArmF!, forearmF: b.dw!.forearmF! } };
  };
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, s.shield ? hitS : hitA, [1, 2, 3]), []);
  const dieName = s.die === 'back' ? 'die-back' : 'die-forward';
  // die-forward is a get-up played backwards: its first half is too slow for a man losing his legs.
  const fast = (f: number) => (f <= 6 ? f * 0.7 : 4.2 + ((f - 6) * 6.8) / 5);
  const dieKeys = (f: Facing) => mk(skel, f, dieName, { torso: 1, absHeight: true, legsFK: true, arms: { N: 1, F: 1 }, ...(s.die === 'back' ? {} : { retime: fast }) }, s.die === 'back' ? DIE_BACK : DIE_FWD, [8, 9]);
  // The shield slides off the arm and the weapon falls from the hand: they land beside him and bounce.
  const back = s.die === 'back';
  const nd = s.nearDeg ?? 20;
  const drops: Drop[] = [{ holder: 'weapon', bone: 'dropW', slot: 'weaponDrop', from: 'weapon', at: back ? 3 : 4, land: back ? { x: -6.2, y: -0.25, rot: 270 - nd, f: 6 } : { x: 4.6, y: -0.25, rot: 90 - nd, f: 7 } }];
  if (s.shield) drops.push({ holder: 'forearmF', bone: 'dropF', slot: 'frontDrop', from: 'front', at: back ? 5 : 5, land: back ? { x: 4.4, y: -0.45, rot: 84, f: 8 } : { x: -2.6, y: -0.45, rot: -80, f: 9 } });
  const die = addDrops(skel, fc('die', 12, false, dieKeys, [{ f: back ? 7 : 9, name: 'land' }]), 12, drops);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  return { clips: { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Shoot]: shoot, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace }, attacks };
}
