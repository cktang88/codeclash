// The Templar foot clips on the mocap (motion/*.json): the captured body (weight, hips, trunk,
// footwork) under arms authored per weapon and timed to the capture's own events. The capture
// subjects held a stick in both hands, so a sword arm, a shield arm, a spear or a bow is ours.
// Keys and reasons: docs/art-references/templar-animation.md.

import { Anim } from '../contract.ts';
import type { P2 } from './core.ts';
import type { Facing } from './facing.ts';
import { BREATH, type AnimationData, type AnimEvent, type Clip, type SkeletonData } from './skeleton.ts';
import { facingClip, lagCloth, mocapKeys, overlayKeys, restWorld, type ClipSet, type KP, type LagSpec, type MocapOpts, type Track } from './templar-rig.ts';

/** What the clips need to know of a kind (templar-foot.ts FootSpec). */
export interface ClipSpec {
  attack: 'cut' | 'thrust' | 'jab' | 'chop' | 'butt' | 'punch';
  shoot: 'javelin' | 'bow' | 'crossbow' | null;
  brace: 'shield' | 'spear' | 'ready' | 'axe';
  die: 'back' | 'crumple';
  /** The far arm carries a shield or a two-handed grip (it stays with the torso). */
  farHeld: boolean;
}

type Tracks = Parameters<typeof overlayKeys>[1];
/** Authored tracks for a facing, given the rest world angles (to start and end at rest). */
type Author = (rw: Record<string, number>) => Tracks;

/** Cloth bones driven late by the body (templar-rig.ts lagCloth). */
export function cloth(run: number): LagSpec[] {
  return [
    { bone: 'skirtN', follow: 'thighN', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'skirtF', follow: 'thighF', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'cloak', follow: 'pelvis', k: 0.35, lag: 2, bias: -9 * run, plumb: 0.55 },
  ];
}

const T = (...kv: [number, number][]): Track => kv;
/** A track from rest through the given keys and back to rest at `end`. */
const R = (rest: number, end: number, ...kv: [number, number][]): Track => [[0, rest], ...kv, [end, rest]];
const zero: [Track, Track] = [[[0, 0]], [[0, 0]]];

// ------------------------------------------------------------------ attacks

/** The cut (cut-diagonal: wind-up 3-4, strike 5-6, impact held 7-8): the blade up in front, over the shoulder, through on the diagonal with a step in. */
const CUT: Author = (rw) => ({
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
/** The overarm spear thrust (thrust: the drive 3-5, held 5-6, slower back): the point travels level along the shaft. */
const THRUST: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 150], [3, 168], [5, 112], [6, 108], [8, 128], [10, 150]),
    forearmN: R(rw.forearmN!, 11, [2, 88], [3, 112], [5, 98], [6, 98], [8, 94], [10, 90]),
    weapon: R(rw.weapon!, 11, [2, 100], [10, 100]),
  },
  dw: { upperArmF: T([0, 0], [2, 14], [3, 18], [5, 8], [10, 12], [11, 0]), forearmF: T([0, 0], [2, 16], [5, 12], [10, 14], [11, 0]) },
  tAdd: { footTargetF: [T([0, 0], [3, 0], [4, 0.4], [5, 0.8], [9, 0.6], [11, 0]), T([0, 0], [3, 0], [4, -0.4], [5, 0], [10, -0.2], [11, 0])] },
});
/** A javelin jab underarm on the same drive. */
const JAB: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [3, -30], [5, 60], [6, 64], [9, 0]),
    forearmN: R(rw.forearmN!, 11, [3, 60], [5, 88], [6, 90], [9, 70]),
    weapon: R(rw.weapon!, 11, [3, 95], [6, 95], [9, 110]),
  },
  tAdd: { footTargetF: [T([0, 0], [3, 0], [5, 0.8], [9, 0.4], [11, 0]), T([0, 0], [3, 0], [4, -0.4], [5, 0], [11, 0])] },
});
/** A lunge with the fist. */
const PUNCH: Author = (rw) => ({
  w: { upperArmN: R(rw.upperArmN!, 11, [3, -25], [5, 85], [6, 82], [9, 20]), forearmN: R(rw.forearmN!, 11, [3, 80], [5, 90], [6, 88], [9, 40]) },
});
/** The crossbow butt-stroke. */
const BUTT: Author = (rw) => ({
  w: { upperArmN: R(rw.upperArmN!, 11, [3, rw.upperArmN! - 25], [5, rw.upperArmN! + 45], [6, rw.upperArmN! + 48]), weapon: R(rw.weapon!, 11, [3, rw.weapon! - 30], [5, rw.weapon! + 40], [6, rw.weapon! + 40]) },
  dw: { upperArmF: T([0, 0], [3, -15], [5, 30], [6, 32], [11, 0]), forearmF: T([0, 0], [5, 20], [11, 0]) },
});
/** The two-handed overhead chop (chop: up past vertical 3-4, the drop 5-6, the bit lagging the hands, the strike held 7-8). */
const CHOP: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [3, 150], [4, 168], [5, 150], [6, 95], [7, 80], [8, 82]),
    forearmN: R(rw.forearmN!, 11, [3, 190], [4, 200], [5, 152], [6, 82], [7, 62], [8, 66]),
    weapon: R(rw.weapon!, 11, [3, 205], [4, 216], [5, 170], [6, 72], [7, 48], [8, 56]),
  },
});

// ------------------------------------------------------------------ missiles

/** The javelin (javelin: withdraw to 3, deliver 4-5 over the block, release 5, follow-through). */
const JAVELIN: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 200], [3, 210], [4, 172], [5, 140], [6, 70], [8, 12]),
    forearmN: R(rw.forearmN!, 11, [2, 240], [3, 250], [4, 200], [5, 120], [6, 45], [8, 20]),
    weapon: R(rw.weapon!, 11, [2, 105], [3, 105], [4, 110], [5, 115], [6, 115]),
  },
  dw: { upperArmF: T([0, 0], [3, 40], [5, -10], [8, -15], [11, 0]), forearmF: T([0, 0], [3, 55], [5, 20], [11, 0]) },
});
/** The war bow (bow: raise 1-3, draw with the back 4-6, held, loose 7 with the draw hand flying back, the follow-through held). */
const BOW: Author = (rw) => ({
  w: {
    upperArmF: R(rw.upperArmF!, 11, [2, 95], [4, 92], [7, 92], [8, 88], [10, 60]),
    forearmF: R(rw.forearmF!, 11, [2, 100], [4, 96], [7, 96], [8, 92], [10, 70]),
    itemF: R(rw.itemF!, 11, [2, 178], [4, 180], [7, 180], [8, 182], [10, 178]),
    upperArmN: R(rw.upperArmN!, 11, [2, 85], [4, 100], [6, 108], [7, 112], [8, 80], [10, 40]),
    forearmN: R(rw.forearmN!, 11, [2, 100], [4, 240], [6, 255], [7, 255], [8, 285], [10, 200]),
  },
});
/** The crossbow: shouldered, loose at 3 with a small jolt, then the reload (stoop, hook the string on the belt claw, stand to span). */
const CROSSBOW: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 70], [3, 66], [5, 20], [7, 10], [9, 5]),
    forearmN: R(rw.forearmN!, 11, [2, 120], [3, 126], [5, 60], [7, 30], [9, 25]),
    weapon: R(rw.weapon!, 11, [2, 92], [3, 98], [5, 140], [7, 175], [9, 175]),
  },
  dw: { spine: T([0, 0], [2, -4], [3, 0], [5, -4], [7, -35], [9, -12], [11, 0]), head: T([0, 0], [2, -6], [3, -4], [7, 10], [9, 4], [11, 0]), upperArmF: T([0, 0], [2, 50], [3, 48], [5, 0], [7, 20], [11, 0]), forearmF: T([0, 0], [2, 60], [3, 64], [5, 0], [11, 0]) },
  tAdd: { pelvis: [T([0, 0], [2, 0], [3, -0.15], [5, 0], [7, 0.1], [11, 0]), T([0, 0], [5, 0.1], [7, 1.2], [9, 0.4], [11, 0])] },
});

// ------------------------------------------------------------------ the rest

/** Struck: the struck shoulder and head snap back first, then the trunk; the rear foot steps back to catch the weight (over the capture's dropped hips). */
const HIT: Author = () => ({
  dw: {
    spine: T([0, 14], [1, 19], [2, 9], [4, 1]), head: T([0, 16], [1, 22], [2, 8], [4, 0]),
    upperArmN: T([0, 18], [1, 26], [2, 10], [4, 0]), forearmN: T([0, 30], [1, 40], [2, 16], [4, 0]),
    upperArmF: T([0, 12], [1, 16], [2, 6], [4, 0]), forearmF: T([0, 10], [1, 14], [2, 6], [4, 0]),
  },
  tAdd: { pelvis: [T([0, -0.3], [1, -0.6], [2, -0.45], [4, -0.1]), T([0, 0], [4, 0])], footTargetN: [T([0, 0], [1, -0.55], [2, -0.6], [4, -0.2]), T([0, 0], [1, -0.3], [2, 0], [4, 0])] },
});

/** In the fall the shield arm folds across the body and the blade drops from the hand. */
const DIE_BACK: Author = (rw) => ({
  w: { upperArmF: T([0, rw.upperArmF!], [2, rw.upperArmF! + 25], [6, 70], [11, 90]), forearmF: T([0, rw.forearmF!], [6, 70], [11, 84]), weapon: T([0, rw.weapon!], [4, 60], [8, 262], [11, 280]) },
  dw: { spine: T([0, 0], [6, 0], [8, 18], [11, 24]), chest: T([0, 0], [8, 10], [11, 16]), head: T([0, 0], [8, 0], [11, 6]) },
});
const DIE_FWD: Author = (rw) => ({
  w: { weapon: T([0, rw.weapon!], [4, 40], [8, 80], [11, 92]) },
});

/** Brace: the shield wall (shield punched forward, blade over the rim), the spear set against horse (butt at the back foot, the point at a horse's chest), a ready crouch. */
const BRACE: Record<ClipSpec['brace'], Author> = {
  shield: () => ({ dw: { spine: T([0, -12]), head: T([0, -2]), upperArmF: T([0, 24]), forearmF: T([0, 18]) }, w: { upperArmN: T([0, 70]), forearmN: T([0, 105]), weapon: T([0, 100]) } }),
  spear: () => ({ dw: { spine: T([0, -16]), head: T([0, 4]), upperArmF: T([0, 20]), forearmF: T([0, 16]) }, w: { upperArmN: T([0, 25]), forearmN: T([0, 80]), weapon: T([0, 118]) } }),
  axe: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]) }, w: { upperArmN: T([0, 40]), forearmN: T([0, 95]), weapon: T([0, 150]) } }),
  ready: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]), upperArmN: T([0, 10]), forearmN: T([0, 20]), upperArmF: T([0, 10]), forearmF: T([0, 15]) } }),
};

// ------------------------------------------------------------------ building

/** Keys for a facing from a mocap clip with authored tracks laid over it. */
function mk(skel: SkeletonData, f: Facing, clip: string, o: MocapOpts, author?: Author, extra: number[] = []): { keys: KP[]; ev: AnimEvent[] } {
  const { keys, clip: mc } = mocapKeys(skel, clip, f, o);
  const tr = author ? author(restWorld(skel, f)) : {};
  return { keys: overlayKeys(keys, tr, extra), ev: mc.events.map((e) => ({ ...e })) };
}

/** A slot shows nothing from frame `from` until `to` (a thrown weapon gone from the hand). */
function hideSlot(c: Clip, slot: string, from: number, to: number): Clip {
  const b = c as { byFacing: Record<string, AnimationData> };
  const keys = [{ f: 0, v: slot }, { f: from, v: null }, { f: to, v: slot }];
  return { byFacing: Object.fromEntries(Object.entries(b.byFacing).map(([f, a]) => [f, { ...a, slots: { ...(a.slots ?? {}), [slot]: keys } }])) };
}

/** Every Anim of a foot kind. */
export function mocapFootClips(skel: SkeletonData, s: ClipSpec): ClipSet {
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
  const gaitArms = (g: number): MocapOpts['arms'] => ({ N: sword ? g : s.attack === 'thrust' ? 0.25 : 0.35, F: s.farHeld ? 0 : s.shoot === 'bow' ? g * 0.4 : g });
  const walk = fc('walk', 12, true, (f) => mk(skel, f, 'walk', { ref: 'mean', torso: 0.5, arms: gaitArms(0.45), roll: 0.5, feet: 0.9 }), undefined, 0.3);
  const runLean: Author = () => ({ dw: { spine: T([0, -13]), head: T([0, 8]), ...(s.farHeld ? { forearmF: T([0, 12]) } : {}), ...(sword ? { forearmN: T([0, 50]) } : {}) } });
  const run = fc('run', 12, true, (f) => mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: gaitArms(0.7), roll: 0.5 }, runLean), undefined, 1);
  // Idle: the capture's slow weight shift, small (the key art must hold), and breathing.
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0.15, travel: 0.12, feet: 0 })));
  const atk = {
    cut: () => (f: Facing) => mk(skel, f, 'cut-diagonal', { torso: 0.4, travel: 0, feet: 0.3 }, CUT, [2, 10]),
    thrust: () => (f: Facing) => mk(skel, f, 'thrust', { torso: 0.6, travel: 1, feet: 1 }, THRUST, [10]),
    jab: () => (f: Facing) => mk(skel, f, 'thrust', { torso: 0.6, travel: 1, feet: 1 }, JAB),
    punch: () => (f: Facing) => mk(skel, f, 'thrust', { torso: 0.6, travel: 1, feet: 1 }, PUNCH),
    butt: () => (f: Facing) => mk(skel, f, 'thrust', { torso: 0.5, travel: 1, feet: 0.8 }, BUTT),
    chop: () => (f: Facing) => mk(skel, f, 'chop', { torso: 0.7, travel: 1, feet: 0.6 }, CHOP),
  }[s.attack]();
  const smearAt: Record<ClipSpec['attack'], AnimEvent[]> = {
    cut: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }],
    chop: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }],
    thrust: [{ f: 5, name: 'strike' }],
    jab: [{ f: 5, name: 'strike' }],
    punch: [{ f: 5, name: 'strike' }],
    butt: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }],
  };
  const attack = fc('attack', 12, false, atk, smearAt[s.attack]);
  let shoot = attack;
  // The javelin leaves the hand at the release; the last frame takes the next from the bundle.
  if (s.shoot === 'javelin') shoot = hideSlot(fc('shoot', 12, false, (f) => mk(skel, f, 'javelin', { torso: 0.7, travel: 1, feet: 1 }, JAVELIN, [2])), 'weapon', 5, 11);
  // The string comes back with the draw hand from the draw to the loose (the `draw` event).
  if (s.shoot === 'bow') shoot = fc('shoot', 12, false, (f) => mk(skel, f, 'bow', { torso: 0.5, travel: 1, feet: 0.5 }, BOW, [2, 4, 8]), [{ f: 3, name: 'draw', len: 4 }, { f: 7, name: 'release' }]);
  if (s.shoot === 'crossbow') shoot = fc('shoot', 12, false, (f) => mk(skel, f, 'brace', { ref: 'first', torso: 0, travel: 0.4, feet: 0 }, CROSSBOW, [2, 3, 5, 7, 9, 11]), [{ f: 3, name: 'release' }]);
  // A long spear stays upright in the fist while the body recoils.
  const hitA: Author = (rw) => ({ ...HIT(rw), ...(s.attack === 'thrust' ? { w: { weapon: T([0, rw.weapon! - 4], [1, rw.weapon! - 6], [4, rw.weapon!]) } } : {}) });
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, hitA, [1, 2]));
  const dieName = s.die === 'back' ? 'die-back' : 'die-forward';
  const dieKeys = (f: Facing) => mk(skel, f, dieName, { torso: 1, absHeight: true, legsFK: true, arms: { N: 1, F: s.farHeld ? 0 : 1 } }, s.die === 'back' ? DIE_BACK : DIE_FWD);
  const die = fc('die', 12, false, dieKeys, [{ f: 9, name: 'land' }]);
  const dead = fc('dead', 1, false, (f) => {
    const d = dieKeys(f);
    return { keys: [{ ...d.keys.at(-1)!, f: 0 }], ev: [] };
  });
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 0.8, torso: 0, feet: 0.4 }, BRACE[s.brace])), 0.6);
  return { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Shoot]: shoot, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
}
void (null as unknown as P2);
void zero;
