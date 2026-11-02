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
import { BLOCK, CUT, HIT, R, T, type Author, type Tracks } from './templar-clips.ts';

export type FootAttack = 'cut' | 'lunge' | 'hurl' | 'cast' | 'butt' | 'loose';
export interface FootClipSpec {
  attack: FootAttack;
  shoot: 'javelin' | 'bow' | 'crossbow' | null;
  brace: 'shield' | 'spear' | 'ready' | 'staff';
  die: 'back' | 'forward' | 'crumple';
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
}

/** Cloth trailing the body late and heavy (rot hangs): the skirt behind the near thigh, the cloak behind the hips. */
function cloth(run: number, cloak: boolean): LagSpec[] {
  const out: LagSpec[] = [{ bone: 'skirt', follow: 'thighN', k: 0.55, lag: 2, bias: -9 * run, plumb: 0.5, wave: [3 + 3 * run, 2, 0.2] }];
  if (cloak) out.push({ bone: 'cloak', follow: 'pelvis', k: 0.5, lag: 2.5, bias: -12 * run, plumb: 0.6, wave: [2 + 4 * run, 2, 0.6] });
  return out;
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
export function groundClamp(skel: SkeletonData, clip: Clip, n: number, margin = 0.7): Clip {
  const skip = (b: string) => b === 'root' || b.startsWith('drop_') || b.startsWith('footTarget') || b === 'grip2' || b === 'weapon' || b === 'itemF' || b === 'skirt' || b === 'cloak';
  return mapFacings(clip, (anim, facing) => {
    const tr: Key<[number, number]>[] = [];
    for (let f = 0; f < n; f++) {
      const l = sampleClip(anim, f, n, facing);
      const p = evaluate(skel, l, { level: 16, facing });
      let low = -Infinity;
      for (const b of p.bones) if (!skip(b.name)) low = Math.max(low, b.y, TIPS.has(b.name) ? b.ty : -Infinity);
      const lift = Math.min(0, -margin - low);
      const pv = l.bones.pelvis ?? {};
      tr.push({ f, v: [pv.x ?? 0, (pv.y ?? 0) + Math.round(lift * 100) / 100], c: 'linear' });
    }
    return { ...anim, bones: { ...(anim.bones ?? {}), pelvis: { ...(anim.bones?.pelvis ?? {}), translate: tr } } };
  });
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

const ATTACKS: Record<FootAttack, { clip: string; o: MocapOpts; a: Author; extra: number[]; ev: AnimEvent[]; warp: number[] }> = {
  cut: { clip: 'cut-diagonal', o: { torso: 0.4, travel: 0, feet: 0.3 }, a: HEAVY_CUT, extra: [2, 3, 5, 9, 10], ev: [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }], warp: [0, 1, 2, 3, 4, 4, 6, 7, 8, 9, 10, 11] },
  lunge: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: LUNGE, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }], warp: [0, 1, 2, 3, 3, 5, 6, 7, 8, 9, 10, 11] },
  hurl: { clip: 'javelin', o: { torso: 0.6, travel: 0.8, feet: 0.8 }, a: HEAVY_CUT, extra: [], ev: [], warp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  cast: { clip: 'idle', o: { torso: 0.2, travel: 0, feet: 0 }, a: HEAVY_CUT, extra: [], ev: [], warp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  butt: { clip: 'thrust', o: { torso: 0.5, travel: 1, feet: 0.8 }, a: HEAVY_CUT, extra: [], ev: [], warp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
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
export function footClips(skel: SkeletonData, s: FootClipSpec): ClipSet {
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
  const walk = fc('walk', 12, true, walkKeys, undefined, 0.3, [0, 1, 2, 3, 3, 3, 6, 7, 8, 9, 10, 11]);
  // ---- the run (a charge): the lean, a heavier hunch, the arms pumping less (the dead do not sprint well).
  const runA: Author = (rw, f) => ({ tAdd: track(f, 1.1), w: { head: T([0, rw.head! - 8 + s.tilt]) }, dw: { spine: T([0, -15 - s.hunch * 0.5]), jaw: T([0, -16]), ...(s.farHeld ? { forearmF: T([0, 12]) } : {}), ...(sword ? { forearmN: T([0, 50]) } : {}) } });
  const runKeys = (f: Facing) => {
    const m = mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: gaitArms(0.55), roll: 0.5, mirror: 12 }, runA);
    return { ...m, keys: stiffen(m.keys, s.stiff * 0.6) };
  };
  const run = fc('run', 12, true, runKeys, undefined, 1, [0, 1, 2, 2, 4, 5, 6, 7, 8, 8, 10, 11]);
  // ---- idle: the chest rises a pixel, the weight sways from foot to foot, the jaw hangs open.
  // (The skull holds still: any turn or jerk of it in the idle reads as boil at this size and
  // fails the lint's head-churn gate.)
  const idleA: Author = (rw) => ({ w: { head: T([0, rw.head! + s.tilt]) }, dw: { jaw: T([0, -8]), spine: T([0, -s.hunch * 0.6]), chest: T([0, -s.hunch * 0.4]), ...(s.idle ?? {}) }, tAdd: { pelvis: [T([0, 0], [2, 0.15], [4, 0], [6, -0.15], [8, 0]), T([0, 0])] } });
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0, travel: 0.15, feet: 0 }, idleA, [2, 4, 4.5, 6, 6.5])), 1.0);
  // ---- the blow.
  const at = ATTACKS[s.attack];
  const attack = fc('attack', 12, false, (f) => mk(skel, f, at.clip, at.o, both(at.a, posture(s, 0.5, false)), at.extra), at.ev, 0, at.warp);
  // ---- struck: the struck shoulder and the skull snap back, the jaw flaps, a half-step back to
  // catch the weight, a white flash; recovery over three frames, the skull last.
  const hitA: Author = (rw, f) => {
    const h = HIT(rw, f);
    const base: Tracks = { ...h, ...(sword ? { w: { weapon: T([0, rw.weapon! - 25], [1, rw.weapon! - 35], [3, rw.weapon! - 10], [4, rw.weapon!]) } } : {}), dw: { ...h.dw, jaw: T([0, -26], [1, -30], [2, -4], [3, -14], [4, -8]), head: T([0, 22 + s.tilt], [1, 30 + s.tilt], [2, 16], [3, 4], [4, s.tilt]) } };
    if (!s.shield) return base;
    const b = BLOCK(rw, f);
    return { ...base, dw: { ...base.dw, upperArmF: b.dw!.upperArmF!, forearmF: b.dw!.forearmF! } };
  };
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, hitA, [1, 2, 3]), [{ f: 0, name: 'flash' }]);
  // ---- the death: the fall from the capture, then it comes apart.
  const dieName = s.die === 'back' ? 'die-back' : s.die === 'forward' ? 'die-forward' : 'die-crumple';
  const fast = (f: number) => (f <= 6 ? f * 0.7 : 4.2 + ((f - 6) * 6.8) / 5);
  const dieA: Author = () => ({
    dw: (s.die === 'back' ? { spine: T([0, 0], [6, 0], [8, 18], [11, 24]), chest: T([0, 0], [8, 10], [11, 16]), head: T([0, 0], [8, 0], [11, 6]), jaw: T([0, -10], [2, -30], [6, -20], [11, -30]) } : { jaw: T([0, -10], [2, -30], [11, -30]) }) as Record<string, Track>,
    tAdd: { pelvis: [T([0, 0]), s.die === 'back' ? T([0, 0], [7, 0], [8, -0.3], [9, 0]) : T([0, 0], [8, 0], [9, -0.25], [10, 0])] },
    ik: { armF2h: T([0, 1], [2, 0]) },
  });
  // The capture's legs end lying toward the camera (below the hips on screen); ours lie flat along
  // the ground line from the landing on, so nothing reads as sinking into it.
  const flat: Record<FootClipSpec['die'], Record<string, number>> = {
    back: { thighN: 84, shinN: 92, thighF: 80, shinF: 96, upperArmN: 255, forearmN: 265, upperArmF: 105, forearmF: 95 },
    forward: { thighN: -96, shinN: -92, thighF: -100, shinF: -86, upperArmN: 100, forearmN: 95, upperArmF: 80, forearmF: 100 },
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
  const die = addDrops(skel, collapse(groundClamp(skel, fc('die', 12, false, dieKeys, [{ f: s.die === 'back' ? 7 : 9, name: 'land' }], 0), 12)), 12, drops);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  // ---- brace, by the weapon.
  const BRACE: Record<FootClipSpec['brace'], Author> = {
    // Crouched behind the shield raised to the eyes, the sword drawn back to cut over it.
    shield: () => ({ dw: { spine: T([0, -14]), head: T([0, -8]), upperArmF: T([0, 52]), forearmF: T([0, 44]), jaw: T([0, -6]) }, w: { upperArmN: T([0, 20]), forearmN: T([0, 85]), weapon: T([0, 112]) } }),
    spear: () => ({ dw: { spine: T([0, -16]), head: T([0, 4]), upperArmF: T([0, 20]), forearmF: T([0, 16]) }, w: { upperArmN: T([0, 25]), forearmN: T([0, 80]), weapon: T([0, 118]) } }),
    staff: () => ({ dw: { spine: T([0, -6]), head: T([0, -4]) } }),
    ready: () => ({ dw: { spine: T([0, -10]), head: T([0, -2]), upperArmN: T([0, 10]), forearmN: T([0, 20]), upperArmF: T([0, 10]), forearmF: T([0, 15]) } }),
  };
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 1.0, torso: 0, feet: 0.4 }, both(BRACE[s.brace], posture(s, 0.5, false)))), 0.8);
  const out: ClipSet = { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
  return out;
}
