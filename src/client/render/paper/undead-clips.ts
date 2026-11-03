// The Hollow Host's foot clips: the mocap (motion/*.json) for the weight, the hips and the
// footwork, with the dead's own way of moving laid over it:
// - a hunch, the head held at an odd tilt, stiff knees and a toe that drags in the walk;
// - stop-motion holds: the trunk, arms and skull stop on a pose for a frame and then catch up,
//   while the legs plod on and the rags keep swinging (`jerk`);
// - the jaw hanging open and clacking shut on the blow;
// - rotted cloth trailing late and heavy;
// - deaths that come apart: the shield and weapon fall, the skull, helm and jaw roll off the heap.
// Keys and reasons: docs/art-references/undead-animation.md. The Templar clips (templar-clips.ts)
// were the worked example; their authored tracks are reused where a blow is the same blow.

import { Anim } from '../contract.ts';
import type { Facing } from './facing.ts';
import { BREATH, EASE_IN, evaluate, sampleAnimation, sampleClip, type AnimationData, type AnimEvent, type BoneTimeline, type Clip, type Key, type SkeletonData } from './skeleton.ts';
import { addDrops, facingClip, lagCloth, lastFrame, mapFacings, mocapKeys, overlayKeys, restWorld, type ClipSet, type Drop, type KP, type LagSpec, type MocapOpts, type Track } from './templar-rig.ts';
import { BLOCK, CUT, HIT, osc, R, T, type Author, type Tracks } from './templar-clips.ts';
import { BLOWS, runKeys as authoredKeys, type RunStyle } from './undead-blows.ts';
import { fromGuard } from './guard.ts';

export type FootAttack = 'cut' | 'lunge' | 'hurl' | 'cast' | 'butt' | 'loose';
export interface FootClipSpec {
  attack: FootAttack;
  shoot: 'javelin' | 'bow' | 'crossbow' | null;
  /** How far the body lies above its lowest joint (a heavy robe spreads wider than the bones). */
  lie?: number;
  /** It floats, bobbing above the ground (the Lich): the feet never take the weight. */
  float?: boolean;
  /** A wraith: it glides, the feet sliding under the hem. */
  glide?: boolean;
  brace: 'shield' | 'spear' | 'ready' | 'staff' | 'aim';
  die: 'back' | 'forward' | 'crumple' | 'dissolve';
  /** The far arm carries a shield or a two-handed grip (it stays with the torso). */
  farHeld: boolean;
  shield?: boolean;
  /** The off hand grips the haft this far up from the fist (units). */
  twoHand?: number;
  /** Forward hunch of the trunk (deg) and the skull's odd tilt (deg, + back). */
  hunch: number;
  tilt: number;
  /** Knee stiffness 0..1: less lift, less bend, the toe dragging. */
  stiff: number;
  /** Things that fall away in the death (by slot), where they land and when. */
  drops: { slot: string; holder: string; at: number; land: Drop['land'] }[];
  /** Extra idle tracks (world turns): a floating lich, a fidgeting hand. */
  idle?: Record<string, Track>;
  /** A long robe or cloak that trails (a cloak bone), and how far the skirt trails. */
  cloak?: boolean;
  /** The melee blows, blow 0 first (names in undead-blows.ts BLOWS, or a FootAttack); default `[attack]`. */
  blows?: string[];
  /** An authored run (undead-blows.ts runKeys) instead of the capture's, and how the weapon is carried in it. */
  run?: RunStyle;
  runArms?: (skel: SkeletonData) => Author;
  /** The upper body holds a pose at these frames of the run (stop-motion), as a jerk warp. */
  runWarp?: number[];
  /** Bows: Shoot is aimed high (deg above level) to arc over the ranks; Attack stays the level shot. */
  shootHigh?: number;
}

/** Cloth trailing the body late and heavy (rot hangs): the skirt behind the near thigh, the cloak behind the hips. */
function cloth(run: number, cloak: boolean): LagSpec[] {
  const out: LagSpec[] = [{ bone: 'skirt', follow: 'thighN', k: 0.55, lag: 2, bias: -9 * run, plumb: 0.5, wave: [3 + 3 * run, 2, 0.2] }];
  if (cloak) out.push({ bone: 'cloak', follow: 'pelvis', k: 0.5, lag: 2.5, bias: -12 * run, plumb: 0.6, wave: [2 + 4 * run, 2, 0.6] });
  return out;
}

/**
 * A wraith's end: struck, the hood snaps back and the arms fly up (0-2); then there is nothing
 * inside the robe: it sinks straight down where it stood, the coat folding in on itself (3-7),
 * and settles as an empty heap (8-11). The bow and the mask drop, and a green wisp of soul-fire
 * escapes upward (events `wisp`, 5-10).
 */
const DISSOLVE: Author = () => ({
  dw: {
    spine: T([0, 10], [2, 14], [4, 4], [6, -20], [8, -40], [11, -44]),
    head: T([0, 16], [2, 20], [5, 0], [8, -30], [11, -30]),
    upperArmN: T([0, 40], [2, 70], [5, 20], [8, -10], [11, -10]),
    forearmN: T([0, 40], [2, 60], [5, 0], [11, 0]),
    upperArmF: T([0, 30], [2, 50], [5, 0], [8, -20], [11, -20]),
  },
  tAdd: { pelvis: [T([0, -0.3], [2, -0.5], [5, -0.3], [8, 0], [11, 0]), T([0, 0.1], [2, 0.2], [3, 0.6], [5, 2.6], [7, 4.6], [8, 5.2], [9, 4.9], [10, 5.3], [11, 5.3])] },
  ik: { armF2h: T([0, 0]), armN2h: T([0, 1], [1, 0]), legN: T([0, 1], [3, 0]), legF: T([0, 1], [3, 0]) },
  w: { thighN: T([0, 0], [3, 10], [6, 70], [8, 90]), shinN: T([0, 0], [3, -20], [6, -80], [8, -95]), thighF: T([0, 0], [3, 12], [6, 75], [8, 92]), shinF: T([0, 0], [3, -25], [6, -85], [8, -100]) },
});
/** The robe collapses: the coat squashes down, and from the settle only the empty heap is left. */
function dissolve(c: Clip, skel: SkeletonData): Clip {
  const keep = new Set(['heap', 'wisp', 'smear', 'light', 'flash', 'cloak']);
  const body = skel.slots.map((s) => s.name).filter((n) => !keep.has(n) && !n.endsWith('Drop'));
  return mapFacings(c, (a) => {
    const slots: NonNullable<AnimationData['slots']> = { ...(a.slots ?? {}) };
    for (const n of body) slots[n] = [{ f: 0, v: n }, { f: 8, v: null }];
    // The long cloak folds down into the heap first (it would reach through the ground as the robe sinks).
    slots.cloak = [{ f: 0, v: 'cloak' }, { f: 5, v: null }];
    slots.heap = [{ f: 0, v: null }, { f: 5, v: 'heap' }];
    slots.wisp = [{ f: 0, v: null }, { f: 5, v: 'wisp' }];
    return { ...a, slots, bones: { ...(a.bones ?? {}), chest: { ...(a.bones?.chest ?? {}), scaleY: [{ f: 0, v: 1 }, { f: 4, v: 1 }, { f: 7, v: 0.5 }, { f: 8, v: 0.4 }] } } };
  });
}

/** The upper body: what the stop-motion holds freeze (the legs and the hips keep going). */
const UPPER = new Set(['spine', 'chest', 'neck', 'head', 'jaw', 'upperArmN', 'forearmN', 'handN', 'weapon', 'upperArmF', 'forearmF', 'handF', 'itemF']);

/**
 * Stop-motion holds: the upper body shows the pose of frame `warp[f]` at frame f (a repeated frame
 * is a hold, a skipped one the jerk that catches up), the rest keeps its own timing. Rebuilt as one
 * key per painted frame.
 */
export function jerk(anim: AnimationData, warp: readonly number[], bones: ReadonlySet<string> = UPPER): AnimationData {
  const n = anim.frames;
  const out: Record<string, BoneTimeline> = {};
  const last = anim.loop ? n : n - 1;
  for (const [name, tl] of Object.entries(anim.bones ?? {})) {
    const rot: Key<number>[] = [], tr: Key<[number, number]>[] = [], sy: Key<number>[] = [];
    for (let f = 0; f <= last; f++) {
      const t = bones.has(name) ? (warp[f % n] ?? f) + (f >= n ? n : 0) : f;
      const l = sampleAnimation(anim, t).bones[name] ?? {};
      if (tl.rotate) rot.push({ f, v: Math.round((l.rot ?? 0) * 100) / 100, c: 'linear' });
      if (tl.translate) tr.push({ f, v: [l.x ?? 0, l.y ?? 0], c: 'linear' });
      if (tl.scaleY) sy.push({ f, v: l.sy ?? 1, c: 'linear' });
    }
    out[name] = { ...(tl.rotate ? { rotate: rot } : {}), ...(tl.translate ? { translate: tr } : {}), ...(tl.scaleY ? { scaleY: sy } : {}) };
  }
  return { ...anim, bones: out };
}
/**
 * Nothing sinks into the ground: frame by frame, if any joint of the body (not the things that
 * fell, the cloth or the IK targets) is lower than `margin` above the ground line, the hips (and so
 * the body) are lifted by the difference.
 */
const TIPS = new Set(['thighN', 'shinN', 'footN', 'thighF', 'shinF', 'footF', 'upperArmN', 'forearmN', 'upperArmF', 'forearmF', 'head', 'chest']);
export function groundClamp(skel: SkeletonData, clip: Clip, n: number, margin = 0.7, liftBone = 'pelvis', only?: (b: string) => boolean, from = 0): Clip {
  const skip = (b: string) => (only ? !only(b) : b === 'root' || b.startsWith('drop_') || b.startsWith('footTarget') || b === 'grip2' || b === 'nock' || b === 'weapon' || b === 'itemF' || b === 'skirt' || b === 'cloak');
  return mapFacings(clip, (anim, facing) => {
    const tr: Key<[number, number]>[] = [];
    for (let f = 0; f < n; f++) {
      const l = sampleClip(anim, f, n, facing);
      const p = evaluate(skel, l, { level: 16, facing });
      let low = -Infinity;
      for (const b of p.bones) if (!skip(b.name)) low = Math.max(low, b.y, only || TIPS.has(b.name) ? b.ty : -Infinity);
      const lift = f < from ? 0 : Math.min(0, -margin - low);
      const pv = l.bones[liftBone] ?? {};
      tr.push({ f, v: [pv.x ?? 0, (pv.y ?? 0) + Math.round(lift * 100) / 100], c: 'linear' });
    }
    return { ...anim, bones: { ...(anim.bones ?? {}), [liftBone]: { ...(anim.bones?.[liftBone] ?? {}), translate: tr } } };
  });
}
/** A slot shows nothing from frame `from` until `to` (a thrown weapon gone from the hand). */
function hideSlot(c: Clip, slot: string, from: number, to: number): Clip {
  return mapFacings(c, (a) => ({ ...a, slots: { ...(a.slots ?? {}), [slot]: [{ f: 0, v: slot }, { f: from, v: null }, { f: to, v: slot }] } }));
}
const jerkClip = (c: Clip, warp: readonly number[]): Clip => mapFacings(c, (a) => jerk(a, warp));

/** The jaw: hangs a little open, gapes on the wind-up, clacks shut on the blow (deg, − opens). */
const jawTrack = (...kv: [number, number][]): Track => kv;

// ------------------------------------------------------------------ the blows

/** The Legionary's heavy cut: the blade up in front, over the shoulder, held there a beat (the dead gather slowly), then through on the diagonal with the whole body, the impact held, a slow recovery. */
const HEAVY_CUT: Author = (rw, f) => {
  const c = CUT(rw, f);
  return {
    w: {
      upperArmN: R(rw.upperArmN!, 11, [2, 40], [3, 150], [4, 165], [5, 120], [6, 70], [7, 52], [8, 50], [10, 15]),
      forearmN: R(rw.forearmN!, 11, [2, 150], [3, 205], [4, 218], [5, 150], [6, 60], [7, 30], [8, 28], [10, 15]),
      weapon: R(rw.weapon!, 11, [2, 176], [3, 222], [4, 236], [5, 160], [6, 64], [7, 24], [8, 20], [10, 18]),
    },
    dw: { ...c.dw, spine: T([0, 0], [3, 10], [4, 12], [5, -6], [6, -22], [8, -24], [10, -8], [11, 0]), head: T([0, 0], [4, 8], [6, -10], [8, -10], [11, 0]), jaw: jawTrack([0, -8], [3, -4], [4, -2], [5, -18], [6, -34], [7, -36], [8, -36], [9, -6], [10, -2], [11, -8]) },
    tAdd: { ...c.tAdd, pelvis: [T([0, 0], [4, -0.45], [6, 0.6], [8, 0.75], [10, 0.3], [11, 0]), T([0, 0], [4, -0.1], [6, 0.35], [8, 0.45], [11, 0])] },
  };
};

/**
 * The ghoul's hunched lunge (thrust, plus Muybridge's lunge): the spear comes down level and is
 * drawn back past the hip, the weight sinks onto the back foot (1-3); the hips drive, the front
 * foot reaches a long step and both arms shoot the point out along the shaft (4); held at full
 * reach, the back folded low over the front thigh, the jaw gaping (5-6); drawn back slower (7-11).
 */
const LUNGE: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 0], [2, -30], [3, -38], [4, 50], [5, 84], [6, 86], [8, 30], [10, 10]),
    forearmN: R(rw.forearmN!, 11, [1, 80], [2, 66], [3, 62], [4, 92], [5, 100], [6, 100], [8, 90], [10, 86]),
    weapon: R(rw.weapon!, 11, [1, 100], [2, 98], [3, 98], [4, 96], [5, 95], [6, 95], [8, 104], [10, 140]),
  },
  dw: {
    spine: T([0, 0], [2, 8], [3, 10], [4, -14], [5, -22], [6, -22], [8, -8], [11, 0]),
    head: T([0, 0], [3, 6], [5, -8], [6, -8], [9, 0]),
    jaw: T([0, -8], [3, -4], [4, -30], [5, -38], [6, -38], [7, -4], [8, -16], [10, -8]),
  },
  tAdd: {
    pelvis: [T([0, 0], [2, -0.4], [3, -0.5], [4, 0.6], [5, 0.95], [6, 1.0], [8, 0.5], [10, 0.1], [11, 0]), T([0, 0], [2, 0.1], [3, 0.15], [4, 0.35], [5, 0.5], [6, 0.5], [8, 0.2], [11, 0])],
    footTargetF: [T([0, 0], [3, 0], [4, 1.3], [5, 1.7], [6, 1.7], [8, 0.9], [10, 0.2], [11, 0]), T([0, 0], [3, 0], [3.5, -0.6], [4, 0], [7, 0], [8, -0.3], [9, 0])],
  },
});

/**
 * The bone javelin hurled overarm (javelin: withdraw, block, release at 5): the arm goes straight
 * back at shoulder height with the javelin along the forearm and the trunk leans back over the
 * bent rear leg (1-3); the front leg blocks, the hips stop and the chest whips over them (4); the
 * javelin leaves the hand high in front of the head, the jaw gaping (5); the arm comes down across
 * the body (6-8); the hand goes up behind the shoulder to the fan on the back and draws the next
 * one out point-up (9), brings it over the shoulder, turning it point-forward (10), and settles
 * into the cocked carry (11). The javelin only ever turns a quarter a frame: it used to reappear
 * point-forward in a raised fist in front of the face and swing back to the carry.
 */
const HURL: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 230], [2, 248], [3, 252], [4, 200], [5, 150], [6, 80], [8, 20], [9, -58], [10, -44]),
    forearmN: R(rw.forearmN!, 11, [1, 250], [2, 262], [3, 264], [4, 215], [5, 130], [6, 60], [8, 30], [9, 196], [10, 180]),
    // The javelin's point rises through the delivery and leaves the hand ~35° up (weapon-attacks.md T3: a 45° arc).
    weapon: R(rw.weapon!, 11, [1, 104], [3, 110], [4, 122], [5, 128], [6, 128], [8, 128], [9, 168], [10, 134]),
  },
  dw: {
    spine: T([0, 0], [2, 14], [3, 16], [4, 2], [5, -14], [6, -24], [8, -22], [10, -6], [11, 0]),
    head: T([0, 0], [3, 6], [5, -6], [7, -8], [11, 0]),
    upperArmF: T([0, 0], [2, 60], [3, 70], [5, 10], [7, -20], [11, 0]),
    forearmF: T([0, 0], [2, 50], [3, 60], [5, 20], [11, 0]),
    jaw: T([0, -8], [3, -6], [4, -24], [5, -38], [6, -38], [7, -10], [9, -20], [11, -8]),
  },
});
/** The overarm stab with the bone javelin held: a short draw back, the drive, held, drawn back. */
const STAB: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 236], [3, 240], [4, 170], [5, 128], [6, 126], [8, 190], [10, 220]),
    forearmN: R(rw.forearmN!, 11, [2, 258], [3, 260], [4, 180], [5, 110], [6, 108], [8, 200], [10, 190]),
    weapon: R(rw.weapon!, 11, [2, 100], [4, 112], [5, 128], [6, 128], [8, 110]),
  },
  dw: {
    spine: T([0, 0], [3, 10], [4, 0], [5, -18], [6, -18], [8, -6], [11, 0]),
    jaw: T([0, -8], [3, -4], [4, -26], [5, -36], [6, -36], [7, -6], [9, -14], [11, -8]),
  },
  tAdd: { pelvis: [T([0, 0], [3, -0.35], [5, 0.6], [6, 0.65], [8, 0.3], [11, 0]), T([0, 0], [5, 0.2], [11, 0])], footTargetF: [T([0, 0], [3, 0], [5, 1.0], [6, 1.0], [8, 0.5], [11, 0]), T([0, 0], [3, 0], [4, -0.5], [5, 0], [11, 0])] },
});
/**
 * The warden's slow, deliberate shot (bow: raise, draw with the back, held, loose, follow-through),
 * from its key-art stance with the bow already half drawn: the bow arm comes up to aim (1-2); the
 * string comes back slowly to the jaw over four frames, the nock sliding back along the arrow
 * (3-6), held; the loose (7): the string snaps forward, the arrow is gone, the draw hand flies
 * back past the hood and holds there (8-9); it comes back to the string with the next arrow
 * (10-11). The hand rides the string by IK except while it flies back.
 */
const bowShot = (up: number): Author => (rw) => ({
  // `up`: the aim above level (deg). The bow arm, the bow and the arrow rise together; the body
  // leans back from the hips to lift them (the shoulders stay square to the line of the arrow),
  // the skull looks up along the shaft.
  w: {
    upperArmF: R(rw.upperArmF!, 11, [2, 86 + up * 0.85], [6, 88 + up * 0.85], [7, 84 + up * 0.85], [9, 82 + up * 0.85]),
    forearmF: R(rw.forearmF!, 11, [2, 92 + up], [6, 92 + up], [7, 90 + up], [9, 90 + up]),
    itemF: R(rw.itemF!, 11, [2, 98 + up], [6, 98 + up], [7, 100 + up], [9, 98 + up]),
    upperArmN: T([0, rw.upperArmN!], [6, rw.upperArmN!], [7, -70 + up * 0.5], [9, -76 + up * 0.5], [10, rw.upperArmN!]),
    forearmN: T([0, rw.forearmN!], [6, rw.forearmN!], [7, 200 + up], [9, 206 + up], [10, rw.forearmN!]),
  },
  dw: { spine: T([0, 0], [2, 4 + up * 0.25], [6, 8 + up * 0.25], [7, 10 + up * 0.25], [9, 6 + up * 0.25], [11, 0]), head: T([0, 0], [2, -3 + up * 0.5], [6, -5 + up * 0.5], [9, -5 + up * 0.5], [11, 0]) },
  // The nock slides back along the arrow past the jaw (a full draw), held, and snaps past braced on the loose.
  t: { nock: [T([0, 0]), T([0, 0], [2, 0.1], [3, -0.8], [4, -1.8], [5, -2.8], [6, -3.3], [6.5, -3.3], [7, 2.8], [9, 2.8], [10, 0.6], [11, 0])] },
  ik: { armN2h: T([0, 1], [6.5, 1], [7, 0], [9.5, 0], [10, 1]) },
});
/**
 * The Revenant's shot and its crank-spanning reload (crossbow, cranequin variant): the stock
 * comes up to the cheek (1); the loose, a jolt up and back (2), held (3); the bow tipped nose-down
 * to the ground at the feet, the body stooping over it (4); the far hand winds the cranequin at
 * the butt, two turns, the string creeping back, the jaw clacking with the effort (5-8); the bow
 * comes up spanned (9), a bolt is laid in the groove (10), and back to the hip (11).
 */
const CRANK: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 40], [2, 36], [3, 38], [4, 30], [8, 30], [9, 10], [10, 0]),
    forearmN: R(rw.forearmN!, 11, [1, 150], [2, 156], [3, 152], [4, 70], [8, 70], [9, 90], [10, 70]),
    weapon: R(rw.weapon!, 11, [1, 90], [2, 80], [3, 86], [4, 4], [8, 4], [9, 70], [10, 86]),
  },
  dw: {
    spine: T([0, 0], [1, -4], [2, 2], [3, -2], [4, -34], [8, -34], [9, -8], [11, 0]),
    head: T([0, 0], [1, -8], [2, -2], [3, -6], [4, 14], [8, 14], [9, 0], [11, 0]),
    jaw: T([0, -8], [2, -26], [3, -10], [5, -22], [6, -2], [7, -22], [8, -2], [9, -8]),
  },
  tAdd: { pelvis: [T([0, 0], [2, -0.2], [3, -0.1], [4, 0.3], [8, 0.3], [10, 0], [11, 0]), T([0, 0], [4, 1.5], [8, 1.5], [9, 0.4], [11, 0])] },
  // The far hand leaves the fore-stock for the cranequin's handle at the butt (in the stock's own
  // frame: 4.5 back along it), and turns it a quarter a frame, twice round; then lays the bolt.
  t: { grip2: [T([0, 0], [4, 0], [5, 1.0], [6, 0], [7, -1.0], [8, 0], [9, 0.6], [10, 0], [11, 0]), T([0, 0], [3, 0], [4, -4.0], [5, -4.5], [6, -5.5], [7, -4.5], [8, -3.5], [9, -2.0], [10, -1.2], [11, 0])] },
});
/** The crossbow's butt rammed forward into a face: drawn back, the stock driven, held, recovered. */
const BUTT: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [3, rw.upperArmN! - 30], [5, rw.upperArmN! + 55], [6, rw.upperArmN! + 58], [9, rw.upperArmN! + 10]),
    forearmN: R(rw.forearmN!, 11, [3, rw.forearmN! - 20], [5, rw.forearmN! + 40], [6, rw.forearmN! + 42]),
    weapon: R(rw.weapon!, 11, [3, rw.weapon! - 40], [5, rw.weapon! + 50], [6, rw.weapon! + 52], [9, rw.weapon! + 10]),
  },
  dw: { spine: T([0, 0], [3, 10], [5, -18], [6, -18], [9, -4], [11, 0]), jaw: T([0, -8], [3, -4], [5, -34], [6, -34], [8, -6], [11, -8]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.4], [5, 0.6], [6, 0.65], [9, 0.2], [11, 0]), T([0, 0], [5, 0.2], [11, 0])], footTargetF: [T([0, 0], [3, 0], [5, 0.9], [6, 0.9], [9, 0.3], [11, 0]), T([0, 0], [3, 0], [4, -0.5], [5, 0], [11, 0])] },
});
/**
 * The Lich-Marshal's spell: the witch-hand rises up and back over the crown while the trunk
 * arches and the staff tips back, the fire in the hand swelling (1-3), held a beat (4); the hand
 * is thrust out at the enemy and the witchfire flares and streams from it, the trunk driving
 * forward over the staff (5), held (6-7); the hand sinks back, the fire dying down (8-11).
 */
const CAST: Author = (rw) => ({
  w: {
    upperArmF: R(rw.upperArmF!, 11, [1, 90], [2, 150], [3, 168], [4, 170], [5, 98], [6, 96], [7, 96], [9, 50]),
    forearmF: R(rw.forearmF!, 11, [1, 140], [2, 190], [3, 205], [4, 206], [5, 94], [6, 92], [7, 92], [9, 40]),
    weapon: R(rw.weapon!, 11, [2, 192], [4, 196], [5, 168], [7, 166], [9, 176]),
  },
  dw: {
    spine: T([0, 0], [2, 10], [4, 14], [5, -12], [7, -14], [9, -4], [11, 0]),
    head: T([0, 0], [2, 8], [4, 10], [5, -8], [7, -8], [10, 0]),
    upperArmN: T([0, 0], [2, 10], [4, 12], [5, -6], [7, -6], [10, 0]),
  },
  tAdd: { pelvis: [T([0, 0], [3, -0.2], [5, 0.35], [7, 0.4], [10, 0], [11, 0]), T([0, 0])] },
});
export const SHOOTS: Record<'javelin', { clip: string; o: MocapOpts; a: Author; extra: number[]; ev: AnimEvent[]; warp: number[]; hide?: [string, number, number] }> = {
  javelin: { clip: 'javelin', o: { torso: 0.6, travel: 0.6, feet: 0.8 }, a: HURL, extra: [1, 2, 3, 4, 5, 6, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'release' }], warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11], hide: ['weapon', 5, 9] },
};

const ATTACKS: Record<FootAttack, { clip: string; o: MocapOpts; a: Author; extra: number[]; ev: AnimEvent[]; warp: number[] }> = {
  cut: { clip: 'cut-diagonal', o: { torso: 0.4, travel: 0, feet: 0.3 }, a: HEAVY_CUT, extra: [2, 3, 5, 9, 10], ev: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }], warp: [0, 1, 2, 3, 4, 4, 6, 7, 8, 9, 10, 11] },
  lunge: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: LUNGE, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }], warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11] },
  hurl: { clip: 'thrust', o: { torso: 0.4, travel: 0.5, feet: 0.5 }, a: STAB, extra: [2, 3, 4, 5, 6, 8, 10], ev: [{ f: 5, name: 'strike' }], warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11] },
  cast: {
    clip: 'idle',
    o: { torso: 0, travel: 0, feet: 0 },
    a: CAST,
    extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    ev: [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ f: k, name: 'flare', int: [0, 1, 2, 3, 3, 4, 4, 3, 2, 1][k]! })), { f: 5, name: 'bolt', len: 2 }, { f: 5, name: 'strike' }],
    warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11],
  },
  butt: { clip: 'thrust', o: { torso: 0.4, travel: 0.5, feet: 0.5 }, a: BUTT, extra: [3, 5, 6, 9], ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }], warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11] },
  loose: { clip: 'thrust', o: { torso: 0.5, travel: 1, feet: 0.8 }, a: HEAVY_CUT, extra: [], ev: [], warp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
/** Registers a kind's own blow (ghoul lunge, hurl, cast, ...). */
export function setAttack(a: FootAttack, def: (typeof ATTACKS)[FootAttack]): void {
  ATTACKS[a] = def;
}

// ------------------------------------------------------------------ building

/** Keys for a facing from a mocap clip with authored tracks laid over it. */
export function mk(skel: SkeletonData, f: Facing, clip: string, o: MocapOpts, author?: Author, extra: number[] = []): { keys: KP[]; ev: AnimEvent[] } {
  const { keys, clip: mc } = mocapKeys(skel, clip, f, o);
  const tr = author ? author(restWorld(skel, f), f) : {};
  return { keys: overlayKeys(keys, tr, extra), ev: mc.events.map((e) => ({ ...e })) };
}

/** Undead posture over any keys: the hunch, the skull's odd tilt (held, so it never boils). */
const posture = (s: FootClipSpec, k = 1, head = true): Author => (rw) => ({ dw: { spine: T([0, -s.hunch * 0.6 * k]), chest: T([0, -s.hunch * 0.4 * k]) }, w: (head ? { head: T([0, rw.head! + s.tilt]) } : {}) as Record<string, Track> });

/** Merges two authors' tracks (b's world tracks win; turns and offsets add). */
export function both(a: Author, b: Author): Author {
  return (rw, f) => {
    const x = a(rw, f), y = b(rw, f);
    const dw: Record<string, Track> = { ...(x.dw ?? {}) };
    for (const [n, tr] of Object.entries(y.dw ?? {})) dw[n] = dw[n] ? sumTracks(dw[n]!, tr) : tr;
    const tAdd: Record<string, [Track, Track]> = { ...(x.tAdd ?? {}) };
    for (const [n, [tx, ty]] of Object.entries(y.tAdd ?? {})) tAdd[n] = tAdd[n] ? [sumTracks(tAdd[n]![0], tx), sumTracks(tAdd[n]![1], ty)] : [tx, ty];
    return { w: { ...(x.w ?? {}), ...(y.w ?? {}) }, dw, tAdd, t: { ...(x.t ?? {}), ...(y.t ?? {}) }, ik: { ...(x.ik ?? {}), ...(y.ik ?? {}) } };
  };
}
/** Two tracks added (sampled at both tracks' key frames). */
function sumTracks(a: Track, b: Track): Track {
  const fs = [...new Set([...a.map((k) => k[0]), ...b.map((k) => k[0])])].sort((p, q) => p - q);
  const at = (tr: Track, f: number): number => {
    if (f <= tr[0]![0]) return tr[0]![1];
    for (let i = 1; i < tr.length; i++) {
      const [f1, v1] = tr[i]!, [f0, v0] = tr[i - 1]!;
      if (f <= f1) {
        const u = (f - f0) / Math.max(1e-6, f1 - f0);
        return v0 + (v1 - v0) * u * u * (3 - 2 * u);
      }
    }
    return tr.at(-1)![1];
  };
  return fs.map((f) => [f, at(a, f) + at(b, f)] as [number, number]);
}

/** Every Anim of an undead foot kind. */
export function footClips(skel: SkeletonData, s: FootClipSpec): ClipSet & { attacks?: Clip[] } {
  const has = (b: string) => skel.bones.some((x) => x.name === b);
  const cl = (run: number) => cloth(run, !!s.cloak && has('cloak'));
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => { keys: KP[]; ev: AnimEvent[] }, ev?: AnimEvent[], run = 0, warp?: number[]): Clip => {
    const se = keys('se'), ne = keys('ne');
    let c: Clip = facingClip(skel, name, n, loop, (f) => (f === 'ne' ? ne.keys : se.keys), ev ?? se.ev);
    if (warp) c = jerkClip(c, warp);
    return lagCloth(skel, c, n, loop, cl(run));
  };
  const withBreath = (c: Clip, alpha = 1): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', never> };
    return { byFacing: { se: [{ anim: b.byFacing.se }, { anim: BREATH, alpha }], ne: [{ anim: b.byFacing.ne }, { anim: BREATH, alpha }] } };
  };
  const sword = s.attack === 'cut';
  // The weapon arm is carried steady (a blade swinging through the head's zone boils); the free arm swings.
  const gaitArms = (g: number): MocapOpts['arms'] => ({ N: sword ? g * 0.4 : 0, F: s.farHeld ? 0 : g });
  // The feet track close to the line of travel while walking, so the two half-strides look alike.
  const track = (f: Facing, k: number): Record<string, [Track, Track]> => {
    const sd = f === 'ne' ? -1 : 1;
    return { footTargetN: [T([0, 1.1 * k * sd]), T([0, 0])], footTargetF: [T([0, -1.1 * k * sd]), T([0, 0])] };
  };
  /**
   * Stiff legs: the swing foot lifts less (the toe scrapes the ground), and its toe hangs (drags).
   * Applied to mocap keys: foot target heights scaled, the swing foot's roll pushed toe-down.
   */
  const stiffen = (keys: KP[], k: number): KP[] =>
    keys.map((key) => {
      const t = { ...(key.t ?? {}) }, dl = { ...(key.dl ?? {}) };
      for (const sd of ['N', 'F'] as const) {
        const p = t[`footTarget${sd}`];
        if (!p) continue;
        const up = p[1] < -0.05;
        t[`footTarget${sd}`] = [p[0], Math.round(p[1] * (1 - 0.6 * k) * 100) / 100];
        if (up) dl[`foot${sd}`] = Math.round(Math.min(dl[`foot${sd}`] ?? 0, 0) - 22 * k);
      }
      return { ...key, t, dl };
    });
  // ---- the walk: a long, even stride with the hip bob and the shoulders against the hips; the
  // dead plod, stiff-kneed, the toe dragging; the trunk and arms stop on a pose and jerk on.
  const walkA: Author = (rw, f) => {
    const bob = T([0, 0.12], [1, 0.28], [2, 0.12], [3, -0.1], [4, -0.12], [5, 0], [6, 0.12], [7, 0.28], [8, 0.12], [9, -0.1], [10, -0.12], [11, 0]);
    const twist = T([0, -0.18], [3, 0], [6, 0.18], [9, 0], [11, -0.12]);
    return {
      // The blade carried low in front, the tip down and angled forward, swinging a little with the arm.
      w: (sword ? { weapon: T([0, 52], [3, 46], [6, 40], [9, 46], [12, 52]) } : {}) as Record<string, Track>,
      dw: (sword ? { forearmN: T([0, 18]), jaw: T([0, -10]) } : { jaw: T([0, -10]) }) as Record<string, Track>,
      tAdd: { pelvis: [T([0, 0]), bob], chest: [twist, T([0, 0])], ...track(f, 1) },
    };
  };
  const walkKeys = (f: Facing) => {
    const m = mk(skel, f, 'walk', { ref: 'mean', torso: 0.3, arms: gaitArms(0.5), roll: 0.5, feet: 1.25, mirror: 12 }, both(walkA, posture(s)));
    return { ...m, keys: stiffen(m.keys, s.stiff) };
  };
  // One stop-motion hold a stride: the trunk, arms and skull freeze for two frames, then jerk on.
  // A wraith glides: the feet slide under the hem with a small shuffle and never lift, the body
  // does not bob, the cloak streams behind; only the stop-motion hold breaks the glide.
  // (A floating figure glides a hand's breadth off the ground.)
  const lift = s.float ? -0.3 : 0;
  const glideA = (lean: number, shuffle: number, bob: number, bobs: number, head = 0): Author => () => ({
    dw: { spine: T([0, lean]), chest: T([0, lean * 0.4]), jaw: T([0, -6]), ...(head ? { head: T([0, head]) } : {}) },
    tAdd: {
      footTargetN: [T([0, shuffle], [6, -shuffle], [12, shuffle]), T([0, lift])],
      footTargetF: [T([0, -shuffle], [6, shuffle], [12, -shuffle]), T([0, lift])],
      pelvis: [T([0, 0]), Array.from({ length: bobs * 2 + 1 }, (_, i) => [(i * 12) / (bobs * 2), lift + (i % 2 ? -bob : 0)] as [number, number])],
    },
  });
  const glideKeys = (lean: number, shuffle: number, bob: number, bobs: number, head = 0) => (f: Facing) =>
    mk(skel, f, 'idle', { ref: 'first', torso: 0, travel: 0, feet: 0 }, both(glideA(lean, shuffle, bob, bobs, head), posture(s, 0.5, !head)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const walk = s.glide
    ? fc('walk', 12, true, glideKeys(-4, 0.3, 0.06, 2), [{ f: 0, name: 'step' }], 0.6, [0, 1, 2, 3, 3, 3, 6, 7, 8, 9, 10, 11])
    : fc('walk', 12, true, walkKeys, undefined, 0.3, [0, 1, 2, 3, 3, 3, 6, 7, 8, 9, 10, 11]);
  // ---- the run (a charge): the lean, a heavier hunch, the arms pumping less (the dead do not sprint well).
  const runA: Author = (rw, f) => ({ tAdd: track(f, 1.1), w: { head: T([0, rw.head! - 8 + s.tilt]) }, dw: { spine: T([0, -15 - s.hunch * 0.5]), jaw: T([0, -16]), ...(s.farHeld ? { forearmF: T([0, 12]) } : {}), ...(sword ? { forearmN: T([0, 50]) } : {}) } });
  const runKeys = (f: Facing) => {
    const m = mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: gaitArms(0.55), roll: 0.5, mirror: 12 }, runA);
    return { ...m, keys: stiffen(m.keys, s.stiff * 0.6) };
  };
  // The glide at speed: leaning hard into it, a quicker bob, the cloak and hem streaming back.
  // An authored run: flight, the bob reversed, the stride and carry of the body (undead-blows.ts).
  const authoredRun = (r: RunStyle) => (f: Facing) => {
    const rw = restWorld(skel, f);
    const arms = s.runArms ? s.runArms(skel)(rw, f) : {};
    const head: Author = () => ({ dw: { head: T([0, s.tilt]), jaw: T([0, -16]) } });
    // `port`: a weapon carried at the port (the arbalest's crossbow takes a lit rim).
    return { keys: overlayKeys(authoredKeys(r, f, 1), both(both(posture(s, 0.6, false), head), () => arms)(rw, f)), ev: [{ f: 0, name: 'step' }, { f: 6, name: 'step' }, { f: 0, name: 'port', len: 12 }] as AnimEvent[] };
  };
  /**
   * The wraith's run is a flight, not a faster glide (the CC0 Ars Notoria ghost and the floating
   * soul in docs/art-references/undead-animation.md): the robe lifts clear of the ground and the
   * body pitches forward over it, the legs trailing back up under the hem, the free arm swept back
   * and trailing a frame late; the robe and cloak stream straight back; it surges on twice a cycle
   * (forward and up, then settling), and leaves ghost pixels behind it (the `ghost` event, drawn by
   * the kinds' `ghost` extra).
   */
  const flyA: Author = () => {
    const up = s.float ? -1.1 : -0.8;
    const ys = (a: number): Track => T([0, up + a * 0.5], [3, up], [6, up + a * 0.5], [9, up], [12, up + a * 0.5]);
    const trailArm: Record<string, Track> = s.farHeld
      // The bow arm swept back and low, the nocked bow trailing behind the robe (the string hand
      // stays on the nock, by its IK, so both arms trail).
      ? { upperArmF: osc(-22, 5, 0, 12, 2), forearmF: osc(-8, 6, 1, 12, 2), itemF: osc(70, 4, 1.5, 12, 2) }
      // The staff carried slanting forward like a lance; the witch-hand swept back, trailing.
      : { upperArmN: T([0, 24]), forearmN: T([0, 74]), weapon: T([0, 150]), upperArmF: osc(-50, 7, 0, 12, 2), forearmF: osc(-38, 9, 1, 12, 2) };
    return {
      w: trailArm,
      dw: { spine: T([0, -36]), chest: T([0, -12]), head: T([0, -2]), jaw: T([0, -12]) },
      tAdd: {
        pelvis: [T([0, 0.15], [3, 0.55], [6, 0.15], [9, 0.55], [12, 0.15]), ys(0.35)],
        footTargetN: [T([0, -1.4], [6, -1.9], [12, -1.4]), ys(0.2).map(([f, v]) => [f, v - 0.5] as [number, number])],
        footTargetF: [T([0, -1.9], [6, -1.4], [12, -1.9]), ys(0.2).map(([f, v]) => [f, v - 0.7] as [number, number])],
      },
    };
  };
  const flyKeys = (f: Facing) =>
    mk(skel, f, 'idle', { ref: 'first', torso: 0, travel: 0, feet: 0 }, both(flyA, posture(s, 0.5, false)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const ghostEv: AnimEvent[] = [{ f: 0, name: 'step' }, ...Array.from({ length: 12 }, (_, i) => ({ f: i, name: 'ghost', int: i }))];
  const showGhost = (c: Clip): Clip => mapFacings(c, (a) => ({ ...a, slots: { ...(a.slots ?? {}), ghost: [{ f: 0, v: 'ghost' }] } }));
  const run = s.glide
    ? showGhost(fc('run', 12, true, flyKeys, ghostEv, 3.2))
    : s.run
      ? fc('run', 12, true, authoredRun(s.run), undefined, 1.4, s.runWarp)
      : fc('run', 12, true, runKeys, undefined, 1, [0, 1, 2, 2, 4, 5, 6, 7, 8, 8, 10, 11]);
  // ---- idle: the chest rises a pixel, the weight sways from foot to foot, the jaw hangs open.
  // (The skull holds still: any turn or jerk of it in the idle reads as boil at this size and
  // fails the lint's head-churn gate.)
  const idleA: Author = (rw) => ({ w: { head: T([0, rw.head! + s.tilt]) }, dw: { jaw: T([0, -8]), spine: T([0, -s.hunch * 0.6]), chest: T([0, -s.hunch * 0.4]), ...(s.idle ?? {}) }, tAdd: { pelvis: [T([0, 0], [2, 0.15], [4, 0], [6, -0.15], [8, 0]), T([0, 0])] } });
  // Floating: hovering a hand's breadth off the ground, rising and sinking slowly.
  const floatA: Author = () => {
    const y = T([0, -0.15], [4, -0.4], [8, -0.15]);
    return { tAdd: { pelvis: [T([0, 0]), y], footTargetN: [T([0, 0]), y], footTargetF: [T([0, 0]), y] } };
  };
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0, travel: s.float ? 0 : 0.15, feet: 0 }, s.float ? both(idleA, floatA) : idleA, [2, 4, 4.5, 6, 6.5])), 1.0);
  // ---- the blows (blow 0 is also the classic Attack).
  const blowClip = (name: string): Clip => {
    const nb = BLOWS[name];
    if (nb) return fc('attack', 12, false, (f) => mk(skel, f, nb.clip, nb.o, both(nb.a(skel), posture(s, 0.5, false)), nb.extra), nb.ev, 0, nb.warp);
    const at = ATTACKS[name as FootAttack];
    return fc('attack', 12, false, (f) => mk(skel, f, at.clip, at.o, both(at.a, posture(s, 0.5, false)), at.extra), at.ev, 0, at.warp);
  };
  // ---- brace, by the weapon: the guard. In a fight he stands in it, and every blow leaves it
  // and comes back to it (guard.ts).
  const BRACE: Record<FootClipSpec['brace'] | 'javelin', Author> = {
    // Crouched behind the shield raised to the eyes, the sword drawn back to cut over it.
    shield: () => ({ dw: { spine: T([0, -14]), head: T([0, -8]), upperArmF: T([0, 52]), forearmF: T([0, 44]), jaw: T([0, -6]) }, w: { upperArmN: T([0, 20]), forearmN: T([0, 85]), weapon: T([0, 112]) } }),
    spear: () => ({ dw: { spine: T([0, -16]), head: T([0, 4]), upperArmF: T([0, 20]), forearmF: T([0, 16]) }, w: { upperArmN: T([0, 25]), forearmN: T([0, 80]), weapon: T([0, 118]) } }),
    // The staff brought forward at a slant in the near fist, its fire at the enemy, the trunk over it.
    staff: () => ({ dw: { spine: T([0, -8]), head: T([0, -4]) }, w: { upperArmN: T([0, 28]), forearmN: T([0, 72]), weapon: T([0, 150]) } }),
    // Down on one knee behind the levelled crossbow, the stock at the cheek, waiting.
    aim: (rw) => ({ dw: { spine: T([0, -8]), head: T([0, -8]) }, w: { upperArmN: T([0, 40]), forearmN: T([0, 150]), weapon: T([0, 92]) }, tAdd: { pelvis: [T([0, 0]), T([0, 0.5])] } }),
    ready: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]), upperArmN: T([0, 10]), forearmN: T([0, 20]), upperArmF: T([0, 10]), forearmF: T([0, 15]) } }),
    // A javelin kept underarm at the hip, its point out at the enemy, the bundle drawn in.
    javelin: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]), upperArmF: T([0, 12]), forearmF: T([0, 18]) }, w: { upperArmN: T([0, 18]), forearmN: T([0, 88]), weapon: T([0, 100]) } }),
  };
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 1.0, torso: 0, feet: 0.4 }, both(BRACE[s.brace === 'ready' && s.shoot === 'javelin' ? 'javelin' : s.brace], posture(s, 0.5, false)))), 0.8);
  const attacks = (s.blows ?? [s.attack]).map((b) => fromGuard(skel, blowClip(b), brace));
  const attack = attacks[0]!;
  // ---- struck: the struck shoulder and the skull snap back, the jaw flaps, a half-step back to
  // catch the weight, a white flash; recovery over three frames, the skull last.
  const hitA: Author = (rw, f) => {
    const h = HIT(rw, f);
    const base: Tracks = { ...h, ...(sword ? { w: { weapon: T([0, rw.weapon! - 25], [1, rw.weapon! - 35], [3, rw.weapon! - 10], [4, rw.weapon!]) } } : {}), dw: { ...h.dw, jaw: T([0, -26], [1, -30], [2, -4], [3, -14], [4, -8]), head: T([0, 22 + s.tilt], [1, 30 + s.tilt], [2, 16], [3, 4], [4, s.tilt]) } };
    if (!s.shield) return base;
    const b = BLOCK(rw, f);
    return { ...base, dw: { ...base.dw, upperArmF: b.dw!.upperArmF!, forearmF: b.dw!.forearmF! } };
  };
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, hitA, [1, 2, 3]), []);
  // ---- the death: the fall from the capture, then it comes apart.
  const dieName = s.die === 'back' ? 'die-back' : s.die === 'forward' ? 'die-forward' : 'die-crumple';
  const fast = (f: number) => (f <= 6 ? f * 0.7 : 4.2 + ((f - 6) * 6.8) / 5);
  const dieA: Author = () => ({
    dw: (s.die === 'back' ? { spine: T([0, 0], [6, 0], [8, 18], [11, 24]), chest: T([0, 0], [8, 10], [11, 16]), head: T([0, 0], [8, 0], [11, 6]), jaw: T([0, -10], [2, -30], [6, -20], [11, -30]) } : { jaw: T([0, -10], [2, -30], [11, -30]) }) as Record<string, Track>,
    tAdd: { pelvis: [T([0, 0]), s.die === 'back' ? T([0, 0], [7, 0], [8, -0.3], [9, 0]) : T([0, 0], [8, 0], [9, -0.25], [10, 0])] },
    ik: { armF2h: T([0, 1], [2, 0]), armN2h: T([0, 1], [2, 0]) },
  });
  // The capture's legs end lying toward the camera (below the hips on screen); ours lie flat along
  // the ground line from the landing on, so nothing reads as sinking into it.
  const flat: Record<FootClipSpec['die'], Record<string, number>> = {
    back: { pelvis: 268, spine: 270, chest: 272, thighN: 84, shinN: 92, thighF: 80, shinF: 96, upperArmN: 255, forearmN: 265, upperArmF: 105, forearmF: 95 },
    forward: { pelvis: 88, spine: 90, chest: 92, thighN: -96, shinN: -92, thighF: -100, shinF: -86, upperArmN: 100, forearmN: 95, upperArmF: 80, forearmF: 100 },
    dissolve: {},
    crumple: { thighN: 60, shinN: -40, thighF: 50, shinF: -50, upperArmN: 100, forearmN: 120, upperArmF: 80, forearmF: 100 },
  };
  const dieKeys = (f: Facing) => {
    const m = mk(skel, f, dieName, { torso: 1, absHeight: true, legsFK: true, arms: { N: 1, F: 1 }, ...(s.die === 'forward' ? { retime: fast } : {}) }, dieA, [6, 7, 8, 9, 10]);
    const from = s.die === 'back' ? 6 : 8;
    return {
      ...m,
      keys: m.keys.map((k) => {
        if (k.f < from || !k.w) return k;
        const u = Math.min(1, (k.f - from + 1) / 2);
        const w = { ...k.w };
        const dw = { ...(k.dw ?? {}) };
        const rw = restWorld(skel, f);
        for (const [b, v] of Object.entries(flat[s.die])) {
          // Arms are keyed as turns (dw), legs as world angles (w).
          if (w[b] !== undefined) w[b] = Math.round(w[b]! + (v - w[b]!) * u);
          else if (dw[b] !== undefined) {
            const now = rw[b]! + dw[b]!;
            const d = ((v - now + 540) % 360) - 180;
            dw[b] = Math.round(dw[b]! + d * u);
          }
        }
        return { ...k, w, dw };
      }),
    };
  };
  const drops: Drop[] = s.drops.map((d) => ({ holder: d.holder, bone: `drop_${d.slot}`, slot: `${d.slot}Drop`, from: d.slot, at: d.at, land: d.land }));
  // The last four frames: it comes apart. The ribcage collapses under the armour (the chest
  // squashed down its length) and the body sinks into a heap as the pieces fall away.
  const collapse = (c: Clip): Clip =>
    mapFacings(c, (a) => {
      const pv = a.bones?.pelvis?.translate ?? [];
      const sink = pv.map((k) => (k.f >= 8 ? { ...k, v: [k.v[0], k.v[1] + Math.min(1, (k.f - 7) / 3) * 0.5] as [number, number] } : k));
      return { ...a, bones: { ...(a.bones ?? {}), pelvis: { ...(a.bones?.pelvis ?? {}), translate: sink }, chest: { ...(a.bones?.chest ?? {}), scaleY: [{ f: 0, v: 1 }, { f: 8, v: 1, c: EASE_IN }, { f: 10, v: 0.55 }, { f: 11, v: 0.6 }] } } };
    });
  const die = s.die === 'dissolve'
    ? addDrops(skel, dissolve(fc('die', 12, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0, feet: 0 }, DISSOLVE, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), [{ f: 8, name: 'land' }, ...[5, 6, 7, 8, 9, 10].map((k) => ({ f: k, name: 'wisp', int: k - 4 }))], 0), skel), 12, drops)
    : addDrops(skel, collapse(groundClamp(skel, fc('die', 12, false, dieKeys, [{ f: s.die === 'back' ? 7 : 9, name: 'land' }], 0), 12, s.lie ?? 0.7)), 12, drops);

  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));

  const out: ClipSet = { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
  if (s.shoot === 'bow') {
    const bowClip = (up: number) => fc('shoot', 12, false, (f) => mk(skel, f, 'brace', { ref: 'first', torso: 0, travel: 0, feet: 0 }, both(bowShot(up), posture(s, 0.5, false)), [1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9, 10, 11]), [{ f: 7, name: 'release' }, { f: 7, name: 'empty', len: 3 }], 0, [0, 1, 2, 3, 4, 5, 6, 6, 8, 9, 10, 11]);
    const level = bowClip(0);
    // Volleys go up at 30-45° and drop over the heads of the ranks in front; the point-blank shot is level.
    out[Anim.Shoot] = s.shootHigh ? bowClip(s.shootHigh) : level;
    if (s.attack === 'loose') out[Anim.Attack] = level;
  }
  if (s.shoot === 'crossbow') {
    out[Anim.Shoot] = fc('shoot', 12, false, (f) => mk(skel, f, 'brace', { ref: 'first', torso: 0, travel: 0.3, feet: 0 }, both(CRANK, posture(s, 0.5, false)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [
      { f: 2, name: 'release' },
      { f: 2, name: 'empty', len: 7 },
      ...[5, 6, 7, 8].map((k) => ({ f: k, name: 'crank', int: k - 5 })),
    ]);
  }
  if (s.shoot === 'javelin') {
    const sh = SHOOTS.javelin;
    let shoot = fc('shoot', 12, false, (f) => mk(skel, f, sh.clip, sh.o, both(sh.a, posture(s, 0.5, false)), sh.extra), sh.ev, 0, sh.warp);
    // The javelin leaves the hand at the release; the hand comes back with the next from the quiver.
    if (sh.hide) shoot = hideSlot(shoot, ...sh.hide);
    out[Anim.Shoot] = shoot;
  }
  if (s.blows && s.attack !== 'loose') return Object.assign(out, { attacks });
  return out;
}
