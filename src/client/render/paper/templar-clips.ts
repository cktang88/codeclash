// The Templar foot clips on the mocap (motion/*.json): the captured body (weight, hips, trunk,
// footwork) under arms authored per weapon and timed to the capture's own events. The capture
// subjects held a stick in both hands, so a sword arm, a shield arm, a spear or a bow is ours.
// Keys and reasons: docs/art-references/templar-animation.md.

import { Anim } from '../contract.ts';
import type { P2 } from './core.ts';
import type { Facing } from './facing.ts';
import { BREATH, type AnimationData, type AnimEvent, type Clip, type SkeletonData } from './skeleton.ts';
import { addDrops, facingClip, lagCloth, lastFrame, mapFacings, mocapKeys, overlayKeys, restWorld, type ClipSet, type Drop, type KP, type LagSpec, type MocapOpts, type Track } from './templar-rig.ts';

/** What the clips need to know of a kind (templar-foot.ts FootSpec). */
export interface ClipSpec {
  attack: 'cut' | 'thrust' | 'jab' | 'chop' | 'butt' | 'punch';
  shoot: 'javelin' | 'bow' | 'crossbow' | null;
  brace: 'shield' | 'spear' | 'ready' | 'axe';
  die: 'back' | 'crumple';
  /** The far arm carries a shield or a two-handed grip (it stays with the torso). */
  farHeld: boolean;
  /** A shield on the far forearm: Hit is the shield block. */
  shield?: boolean;
  /** The weapon's key-art angle (for where it lies when dropped). */
  nearDeg?: number;
}

type Tracks = Parameters<typeof overlayKeys>[1];
/** Authored tracks for a facing, given the rest world angles (to start and end at rest). */
type Author = (rw: Record<string, number>, f: Facing) => Tracks;

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
    spine: T([0, 16], [1, 20], [2, 12], [3, 5], [4, 0]), head: T([0, 18], [1, 24], [2, 14], [3, 6], [4, 0]),
    upperArmN: T([0, 18], [1, 26], [2, 10], [4, 0]), forearmN: T([0, 30], [1, 40], [2, 16], [4, 0]),
    upperArmF: T([0, 12], [1, 16], [2, 6], [4, 0]), forearmF: T([0, 10], [1, 14], [2, 6], [4, 0]),
  },
  tAdd: { pelvis: [T([0, -0.35], [1, -0.7], [2, -0.6], [4, -0.2]), T([0, 0.05], [1, 0.15], [4, 0])], footTargetN: [T([0, 0], [1, -0.7], [2, -0.8], [4, -0.3]), T([0, 0], [1, -0.35], [2, 0], [4, 0])] },
});

/** The shield block (Hit for shielded kinds): punch the shield out to meet the blow, the head ducks behind the rim; the blow jolts it back, the weight rocks onto the rear foot; back to guard. */
const BLOCK: Author = () => ({
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

/** Brace: the shield wall (shield punched forward, blade over the rim), the spear set against horse (butt at the back foot, the point at a horse's chest), a ready crouch. */
const BRACE: Record<ClipSpec['brace'], Author> = {
  // Crouched behind the shield raised to the eyes, the sword drawn back ready to cut over or under it.
  shield: () => ({ dw: { spine: T([0, -14]), head: T([0, -8]), upperArmF: T([0, 52]), forearmF: T([0, 44]) }, w: { upperArmN: T([0, 20]), forearmN: T([0, 85]), weapon: T([0, 112]) } }),
  spear: () => ({ dw: { spine: T([0, -16]), head: T([0, 4]), upperArmF: T([0, 20]), forearmF: T([0, 16]) }, w: { upperArmN: T([0, 25]), forearmN: T([0, 80]), weapon: T([0, 118]) } }),
  axe: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]) }, w: { upperArmN: T([0, 40]), forearmN: T([0, 95]), weapon: T([0, 150]) } }),
  ready: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]), upperArmN: T([0, 10]), forearmN: T([0, 20]), upperArmF: T([0, 10]), forearmF: T([0, 15]) } }),
};

// ------------------------------------------------------------------ building

/** Keys for a facing from a mocap clip with authored tracks laid over it. */
function mk(skel: SkeletonData, f: Facing, clip: string, o: MocapOpts, author?: Author, extra: number[] = []): { keys: KP[]; ev: AnimEvent[] } {
  const { keys, clip: mc } = mocapKeys(skel, clip, f, o);
  const tr = author ? author(restWorld(skel, f), f) : {};
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
  // A tall thing carried (a spear, a javelin bundle, a bow, an axe) is held steady against the
  // body: it would sweep through the head's zone and boil (README no-boil rule 4).
  const tallN = !sword, tallF = s.shoot === 'bow' || s.shoot === 'javelin';
  const gaitArms = (g: number): MocapOpts['arms'] => ({ N: tallN ? 0 : g, F: s.farHeld || tallF ? 0 : g });
  // The head stays level and looking ahead whatever the trunk does (and a held angle never boils).
  const level: Author = (rw) => ({ w: { head: T([0, rw.head!]) } });
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
  const walk = fc('walk', 12, true, (f) => mk(skel, f, 'walk', { ref: 'mean', torso: 0.5, arms: gaitArms(0.55), roll: 0.6, feet: 1.25, mirror: 12 }, walkA), undefined, 0.3);
  const runLean: Author = (rw, f) => ({ tAdd: track(f, 1.1), w: { head: T([0, rw.head! - 6]) }, dw: { spine: T([0, -13]), ...(s.farHeld ? { forearmF: T([0, 12]) } : {}), ...(sword ? { forearmN: T([0, 50]) } : {}) } });
  const run = fc('run', 12, true, (f) => mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: gaitArms(0.7), roll: 0.5, mirror: 12 }, runLean), undefined, 1);
  // Idle: the capture's slow weight shift, small (the key art must hold), and breathing.
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0.1, travel: 0.16, feet: 0 })));
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
  const hitA: Author = (rw, f) => ({ ...HIT(rw, f), ...(s.attack === 'thrust' ? { w: { weapon: T([0, rw.weapon! - 4], [1, rw.weapon! - 6], [4, rw.weapon!]) } } : {}) });
  // Shielded men snap back like anyone, and punch the shield out against the blow as they do.
  const hitS: Author = (rw, f) => {
    const h = hitA(rw, f), b = BLOCK(rw, f);
    return { ...h, dw: { ...h.dw, upperArmF: b.dw!.upperArmF!, forearmF: b.dw!.forearmF! } };
  };
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, s.shield ? hitS : hitA, [1, 2, 3]), [{ f: 0, name: 'flash' }]);
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
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 1.0, torso: 0, feet: 0.4 }, BRACE[s.brace])), 0.6);
  return { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Shoot]: shoot, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
}
void (null as unknown as P2);
void zero;
