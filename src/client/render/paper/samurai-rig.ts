// The Samurai foot kinds on bones, rebuilt from the approved key art (samurai-static.ts): Katana
// Samurai (0), Yari Ashigaru (1), Nage-yari Skirmishers (2), Yumi Ashigaru (3), Teppō Ashigaru (4),
// Sōhei (8) and the Daimyō (10).
//
// Every key-art piece (a thigh, a kusazuri panel, the dō, the kabuto, the katana) rides one bone and
// is drawn with the key art's own code through a part map (samurai-static `withMap`): at rest the
// pieces make the key art, in motion each is the same drawing turned and moved, re-rasterised at
// every snapped angle (README, "Animating with bones"). The dō is skinned over the pelvis, spine and
// chest; the kusazuri panels and sode hang on bones of their own that trail the thighs and the
// arms; the sashimono and horo trail the chest. The machinery (part and skin maps, clips from the
// mocap, trailing cloth, things that fall) is the Templar's (templar-rig.ts), imported as is.
//
// Motion: the CMU captures and Muybridge (motion/*.json) bring the weight, the hips and the footwork;
// the weapon arms are authored per kind to docs/art-references/motion-reference.md §9 and the
// kind's own martial art (kenjutsu's kesa-giri, sōjutsu's thrust, kyūdō's shooting form, hōjutsu,
// naginata-jutsu, the gunbai's signals). Notes and critique rounds: docs/art-references/samurai-animation.md.

import { Anim } from '../contract.ts';
import { addP, code, type P2, type Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { flash as muzzleFlash, smoke, SM, stick, yumi } from './samurai-parts.ts';
import { footBody, FOOT, KUSA_TOP, manOrder, manPiece, mapPoint, withMap, type Body, type ManPiece, type SFoot } from './samurai-static.ts';
import {
  BREATH, bonesFromJoints, EASE, EASE_IN, EASE_OUT, emptyLocals, evaluate, sampleClip, shortest, skeletonKind, smearPart,
  type AnimationData, type FacingClips, type Key, type Posed, type AnimEvent, type AttachmentSet, type Clip, type JointDef, type SkeletonData, type SkeletonRig, type SlotData,
} from './skeleton.ts';
import { HIT, T } from './templar-clips.ts';
import {
  addDrops, facingClip, lastFrame, mapFacings, mocapKeys, overlayKeys, partMap, restWorld, skinMap, smooth01,
  type ClipSet, type Drop, type KP, type LagSpec, type MocapOpts, type Track, type Weights,
} from './templar-rig.ts';

// ------------------------------------------------------------------ per-kind rig facts

type Attack = 'kesa' | 'thrust' | 'jab' | 'punch' | 'butt' | 'sweep' | 'fan';
type Shoot = 'javelin' | 'kyudo' | 'teppo' | null;
type Brace = 'chudan' | 'yari' | 'ready' | 'kneel' | 'naginata' | 'command';
type ArmNE = 'mirror' | 'shift' | { el: P2; hn: P2 };
/** Carried in the gait: world angles of the weapon arm and the item, whether the far hand stays on it. */
interface Carry {
  upperArmN?: number;
  forearmN?: number;
  weapon?: number;
  /** The far hand keeps its grip (a two-handed carry). */
  both?: boolean;
  /** The far arm (bow arm) held: world angles. */
  upperArmF?: number;
  forearmF?: number;
  itemF?: number;
  /** In NE the near hand is at the side, in view (not in front of the body). */
  side?: boolean;
  /** The free far arm's base pose (world angles) under the capture's swing. */
  farBase?: [number, number];
  /** The far arm holds its key-art pose (a bow carried upright). */
  holdF?: boolean;
}
export interface SSpec {
  /** The near item's key-art angle (rig degrees: 0 down, 90 forward, 180 up). */
  nearDeg: number;
  farDeg?: number;
  /** The far hand grips the near weapon (grip2 sits where the key art's far hand is). */
  twoHand?: boolean;
  /** The NE rest of the arms. */
  neNear: ArmNE;
  neFar: ArmNE;
  /** In NE the near hand and its weapon work in front of the body (hidden behind it). */
  neFront?: boolean;
  /** The bone the back gear rides. */
  backBone: 'banner' | 'horo' | 'pelvis';
  attack: Attack;
  shoot: Shoot;
  brace: Brace;
  die: 'back' | 'forward';
  /** Weapon reach for the smear (units from the fist). */
  smear?: [number, number];
  walk: Carry;
  run: Carry;
}

export const FOOT_SPECS: Record<number, SSpec> = {
  0: {
    nearDeg: 135, twoHand: true, neNear: { el: [2.45, -8.7], hn: [1.0, -8.4] }, neFar: { el: [-0.7, -8.4], hn: [1.55, -7.95] }, backBone: 'banner',
    attack: 'kesa', shoot: null, brace: 'chudan', die: 'back', smear: [1.4, 6.0],
    // The blade carried in the near hand at the hip, point up and back, clear of the body and below the head.
    walk: { upperArmN: -8, forearmN: 25, weapon: 230, side: true },
    // Charging: both hands on the hilt, the blade raised high.
    run: { upperArmN: 95, forearmN: 150, weapon: 165, both: true },
  },
  1: {
    nearDeg: 180, twoHand: true, neNear: 'mirror', neFar: { el: [-0.2, -7.7], hn: [1.45, -6.6] }, backBone: 'banner',
    attack: 'thrust', shoot: null, brace: 'yari', die: 'forward', smear: [6.0, 15.0],
    // The yari carried upright at the shoulder, steady (a tall pole sweeping would boil), the far arm free.
    walk: { weapon: 177, side: true },
    // The charge: levelled at the hip in both hands, the point forward and a little down.
    run: { upperArmN: -12, forearmN: 74, weapon: 97, both: true },
  },
  4: {
    nearDeg: 127.5, twoHand: true, neNear: 'mirror', neFar: { el: [-0.9, -8.4], hn: [3.6, -9.33] }, neFront: true, backBone: 'pelvis',
    attack: 'butt', shoot: 'teppo', brace: 'kneel', die: 'back', smear: [4.0, 7.0],
    // Port arms, both hands on the gun, steady.
    walk: { both: true },
    run: { both: true, upperArmN: 10, forearmN: 100, weapon: 118 },
  },
  8: {
    nearDeg: 187.5, twoHand: true, neNear: 'mirror', neFar: { el: [-1.0, -7.6], hn: [0.95, -6.9] }, backBone: 'pelvis',
    attack: 'sweep', shoot: null, brace: 'naginata', die: 'forward', smear: [5.4, 8.6],
    // Carried upright in the near hand, steady; the far arm free.
    walk: { weapon: 186, side: true },
    run: { upperArmN: -10, forearmN: 70, weapon: 104, both: true },
  },
  10: {
    nearDeg: 112.5, neNear: { el: [2.9, -9.8], hn: [3.4, -11.2] }, neFar: 'mirror', backBone: 'horo',
    attack: 'fan', shoot: null, brace: 'command', die: 'back', smear: [1.2, 3.6],
    // The fan held at the chest on the march; pointing ahead at the run.
    walk: { upperArmN: 25, forearmN: 120, weapon: 140, side: true },
    run: { upperArmN: 70, forearmN: 95, weapon: 110, side: true },
  },
  3: {
    nearDeg: 167, farDeg: 180, neNear: 'mirror', neFar: { el: [-0.6, -9.0], hn: [2.0, -7.4] }, backBone: 'pelvis',
    attack: 'punch', shoot: 'kyudo', brace: 'ready', die: 'back',
    // The yumi carried upright and steady in the bow hand; the arrow hand at the side.
    walk: { holdF: true, side: true },
    run: { holdF: true, side: true },
  },
  2: {
    nearDeg: 110, neNear: { el: [2.6, -11.6], hn: [0.4, -13.6] }, neFar: { el: [-0.9, -9.8], hn: [1.3, -8.9] }, backBone: 'banner',
    attack: 'jab', shoot: 'javelin', brace: 'ready', die: 'back', smear: [1.5, 4.5],
    // The javelin at the shoulder, sloped forward and up, held steady; the free arm swings low.
    walk: { upperArmN: 25, forearmN: 165, weapon: 140, farBase: [8, 30], side: true },
    run: { upperArmN: 30, forearmN: 160, weapon: 120, farBase: [10, 80], side: true },
  },
};

// ------------------------------------------------------------------ the skeleton

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const mx = (p: P2): P2 => [-p[0], p[1]];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const along = (p: P2, deg: number, len: number): P2 => [r6(p[0] + Math.sin((deg * Math.PI) / 180) * len), r6(p[1] + Math.cos((deg * Math.PI) / 180) * len)];
const handTip = (el: P2, hn: P2): P2 => {
  const d = sub(hn, el), l = Math.hypot(d[0], d[1]) || 1;
  return add(hn, [(d[0] / l) * 0.45, (d[1] / l) * 0.45]);
};

/** The NE rest body: hips, legs and shoulders swap sides; arms mirror, shift with the shoulder, or are given. */
export function neBody(b: Body, s: SSpec): Body {
  const shN = mx(b.shN), shF = mx(b.shF);
  const arm = (mode: ArmNE, sh0: P2, sh1: P2, el: P2, hn: P2): [P2, P2] =>
    mode === 'mirror' ? [mx(el), mx(hn)] : mode === 'shift' ? [add(el, sub(sh1, sh0)), add(hn, sub(sh1, sh0))] : [mode.el, mode.hn];
  const [elN, hnN] = arm(s.neNear, b.shN, shN, b.elN, b.hnN);
  const [elF, hnF] = arm(s.neFar, b.shF, shF, b.elF, b.hnF);
  return { ...b, hipN: mx(b.hipN), hipF: mx(b.hipF), knN: mx(b.knN), knF: mx(b.knF), anN: mx(b.anN), anF: mx(b.anF), shN, shF, elN, hnN, elF, hnF };
}

/** How far the kusazuri (or the robe's skirt) hangs below its top. */
const kusaLong = (k: SFoot): number => (k.d.body === 'gusoku' ? 2.9 : k.d.body === 'robe' ? 5.6 : 2.4);

function joints(b: Body, s: SSpec, k: SFoot): Record<string, { from: P2; to: P2 }> {
  const hem = b.pel[1] + KUSA_TOP + kusaLong(k);
  const sodeLen = k.d.sode === 'big' ? 2.8 : 1.7;
  return {
    root: { from: [0, 0], to: [0, 0] },
    pelvis: { from: [(b.hipN[0] + b.hipF[0]) / 2, -6.55], to: [0, -8.3] },
    spine: { from: [0, -8.3], to: [0.05, -9.9] },
    chest: { from: [0.05, -9.9], to: b.neck },
    neck: { from: b.neck, to: b.head },
    head: { from: b.head, to: add(b.head, [0.1, -1.2]) },
    upperArmN: { from: b.shN, to: b.elN },
    forearmN: { from: b.elN, to: b.hnN },
    handN: { from: b.hnN, to: handTip(b.elN, b.hnN) },
    weapon: { from: b.hnN, to: along(b.hnN, s.nearDeg, 4) },
    grip2: { from: s.twoHand ? b.hnF : along(b.hnN, s.nearDeg, 1.3), to: s.twoHand ? b.hnF : along(b.hnN, s.nearDeg, 1.3) },
    upperArmF: { from: b.shF, to: b.elF },
    forearmF: { from: b.elF, to: b.hnF },
    handF: { from: b.hnF, to: handTip(b.elF, b.hnF) },
    itemF: { from: b.hnF, to: along(b.hnF, s.farDeg ?? 180, 3) },
    sodeN: { from: b.shN, to: add(b.shN, [0, sodeLen]) },
    sodeF: { from: b.shF, to: add(b.shF, [0, sodeLen]) },
    thighN: { from: b.hipN, to: b.knN },
    shinN: { from: b.knN, to: b.anN },
    footN: { from: b.anN, to: add(b.anN, [1.1, 0.4]) },
    thighF: { from: b.hipF, to: b.knF },
    shinF: { from: b.knF, to: b.anF },
    footF: { from: b.anF, to: add(b.anF, [1.1, 0.4]) },
    skirtN: { from: [b.hipN[0], b.pel[1] + KUSA_TOP], to: [b.hipN[0] - 0.1, hem] },
    skirtF: { from: [b.hipF[0], b.pel[1] + KUSA_TOP], to: [b.hipF[0] + 0.15, hem] },
    // The sashimono stands in its holder on the back; the horo's frame reaches back from the shoulders.
    banner: { from: add(b.pel, [-1.6, -3.4]), to: add(b.pel, [-1.75, -13.0]) },
    horo: { from: add(b.pel, [-0.6, -3.6]), to: add(b.pel, [-4.6, -3.6]) },
    footTargetN: { from: b.anN, to: b.anN },
    footTargetF: { from: b.anF, to: b.anF },
    // What falls from the hands in a death, free of the arms.
    dropW: { from: b.hnN, to: along(b.hnN, s.nearDeg, 4) },
    dropF: { from: b.hnF, to: along(b.hnF, s.farDeg ?? 180, 3) },
    scene: { from: [3.0, 0], to: [3.0, -1] },
  };
}
const PARENT: Record<string, string | undefined> = {
  root: undefined, pelvis: 'root', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmN: 'chest', forearmN: 'upperArmN', handN: 'forearmN', weapon: 'handN', grip2: 'weapon',
  upperArmF: 'chest', forearmF: 'upperArmF', handF: 'forearmF', itemF: 'handF', sodeN: 'chest', sodeF: 'chest',
  thighN: 'pelvis', shinN: 'thighN', footN: 'shinN', thighF: 'pelvis', shinF: 'thighF', footF: 'shinF',
  skirtN: 'pelvis', skirtF: 'pelvis', banner: 'chest', horo: 'chest', footTargetN: 'root', footTargetF: 'root', dropW: 'root', dropF: 'root', scene: 'root',
};

const PIECE_BONE = (s: SSpec): Record<ManPiece, string> => ({
  back: s.backBone, thighF: 'thighF', shinF: 'shinF', footF: 'footF', upperArmF: 'upperArmF', forearmF: 'forearmF', handF: 'handF', sodeF: 'sodeF',
  kusaBF: 'skirtF', kusaBN: 'skirtN', thighN: 'thighN', shinN: 'shinN', footN: 'footN', haidateF: 'thighF', haidateN: 'thighN', torso: 'pelvis',
  kusaFN: 'skirtN', kusaFM: 'pelvis', kusaFF: 'skirtF', hipGear: 'pelvis', head: 'head', upperArmN: 'upperArmN', forearmN: 'forearmN', handN: 'handN',
  sodeN: 'sodeN', farItem: 'itemF', weapon: 'weapon', gripF: 'handF', gripN: 'handN',
});
/** Slots that are not key-art pieces. */
const EXTRA: Record<string, { bone: string; att: string | null }> = {
  smear: { bone: 'weapon', att: 'smear' },
  weaponDrop: { bone: 'dropW', att: null },
  farDrop: { bone: 'dropF', att: null },
  scene: { bone: 'scene', att: 'scene' },
  fx: { bone: 'root', att: 'fx' },
  ramrod: { bone: 'handF', att: null },
  flash: { bone: 'root', att: 'flash' },
};

function orders(s: SSpec, k: SFoot, front = s.neFront): { se: string[]; ne: string[] } {
  const se = ['weaponDrop', 'farDrop', ...manOrder(k.gear)];
  se.splice(se.indexOf('weapon') + 1, 0, 'smear', 'ramrod');
  se.push('scene', 'fx', 'flash');
  const nearArm = ['forearmN', 'handN', 'weapon', 'gripN', 'smear', 'ramrod'];
  const ne = ['scene', 'weaponDrop', 'farDrop', 'farItem', 'gripF', 'upperArmF', 'forearmF', 'handF', 'sodeF'];
  if (front) ne.push(...nearArm);
  ne.push('kusaFF', 'kusaFM', 'kusaFN', 'thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN', 'haidateF', 'haidateN', 'hipGear', 'torso', 'kusaBN', 'kusaBF', 'head', 'back', 'upperArmN', 'sodeN');
  // The weapon over the near sode: from behind it is the thing to see.
  if (!front) ne.push(...nearArm);
  ne.push('fx', 'flash');
  return { se, ne };
}

export function footSkel(kind: number, k: SFoot, s: SSpec): SkeletonData {
  const b = footBody(kind);
  const se = joints(b, s, k), ne = joints(neBody(b, s), s, k);
  const defs: JointDef[] = Object.keys(se).map((name) => {
    const d: JointDef = { name, from: se[name]!.from, to: se[name]!.to };
    const p = PARENT[name];
    if (p) d.parent = p;
    if (name === 'footN' || name === 'footF') d.inherit = 'translation';
    const n = ne[name]!;
    if (n.from[0] !== d.from[0] || n.from[1] !== d.from[1] || n.to[0] !== d.to[0] || n.to[1] !== d.to[1]) d.facing = { ne: { from: n.from, to: n.to } };
    return d;
  });
  const pb = PIECE_BONE(s);
  const ord = orders(s, k);
  // The far arm reaches the grip with its elbow bent the way the key art bends it.
  const cross = (sh: P2, el: P2, hn: P2) => (hn[0] - sh[0]) * (el[1] - sh[1]) - (hn[1] - sh[1]) * (el[0] - sh[0]);
  const farBend: 1 | -1 = cross(b.shF, b.elF, b.hnF) > 0 ? -1 : 1;
  const slots: SlotData[] = ord.se.map((name) => (EXTRA[name] ? { name, bone: EXTRA[name]!.bone, attachment: { all: EXTRA[name]!.att } } : { name, bone: pb[name as ManPiece], attachment: { all: name } }));
  return {
    name: `samurai-foot-${kind}`,
    body: 'foot',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: ord,
    ik: [
      { name: 'legN', bones: ['thighN', 'shinN'], target: 'footTargetN', bend: 1, mix: 1, ground: b.anN[1] },
      { name: 'legF', bones: ['thighF', 'shinF'], target: 'footTargetF', bend: 1, mix: 1, ground: b.anF[1] },
      { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: farBend, mix: s.twoHand ? 1 : 0 },
    ],
  };
}

// ------------------------------------------------------------------ the parts

/** The dō over the pelvis, spine and chest (key-art y): rigid plates, bending at the waist. */
const torsoWeights: Weights = ([, y]) => {
  const a = smooth01((-9.2 - y) / 1.0);
  const b = smooth01((-7.7 - y) / 1.0);
  return [['chest', a], ['spine', b - a], ['pelvis', 1 - b]];
};

export function footParts(kind: number, k: SFoot, s: SSpec): AttachmentSet {
  const rest: Record<Facing, Body> = { se: footBody(kind), ne: neBody(footBody(kind), s), sw: footBody(kind), nw: footBody(kind) };
  const atts: AttachmentSet = {};
  const pieces = new Set<string>(manOrder(k.gear));
  for (const p of pieces) {
    const piece = p as ManPiece;
    if (piece === 'torso') {
      atts[p] = { cache: false, draw: (c, _x, ctx) => withMap(skinMap(ctx.posed, torsoWeights), () => manPiece(c, rest[ctx.posed.facing], k.d, k.gear, piece, ctx.posed.facing === 'ne')) };
      continue;
    }
    atts[p] = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], k.d, k.gear, piece, ctx.posed.facing === 'ne'));
  }
  // Dropped in a death: the same drawing on a bone of its own.
  atts.weaponDrop = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], k.d, k.gear, 'weapon', ctx.posed.facing === 'ne'));
  atts.farDrop = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], k.d, k.gear, 'farItem', ctx.posed.facing === 'ne'));
  atts.scene = (c, x) => withMap(partMap(x), () => k.gear.scene?.(c));
  // The hit flash: on the impact frame every pixel of the figure goes two tones lighter.
  atts.flash = {
    cache: false,
    draw: (c, _x, ctx) => {
      if (!ctx.events.some((e) => e.name === 'flash')) return;
      for (let y = c.by0; y <= c.by1; y++)
        for (let x = c.bx0; x <= c.bx1; x++) {
          const i = y * c.CW + x, v = c.pix[i]!;
          if (v >= 0) c.pix[i] = v - (v & 7) + Math.min(4, (v & 7) + 2);
        }
    },
  };
  if (s.smear) atts.smear = smearPart('weapon', s.smear[0], s.smear[1], SM.steel);
  if (s.shoot === 'teppo') {
    // The shot: the pan flashes a beat before the muzzle (frame 6), the muzzle flash on 6-7, and
    // the smoke where the muzzle was, swelling and drifting up and back as he reloads. Each
    // `smoke` event carries the puff's age (int) and the muzzle point (str, figure units).
    atts.fx = {
      cache: false,
      draw: (c, _x, ctx) => {
        for (const e of ctx.events) {
          if (!e.str) continue;
          const [mx0, my0, deg] = e.str.split(',').map(Number) as [number, number, number];
          const m: P2 = [mx0, my0];
          if (e.name === 'pan') muzzleFlash(c, m, deg - 90, 0.55);
          if (e.name === 'muzzle') muzzleFlash(c, m, deg, e.int ? 1.4 : 2.4);
          if (e.name === 'smoke') smoke(c, [m[0] + 1.2, m[1] - 0.3], (e.int! + 1) / 7, 9, 1.8);
        }
      },
    };
    // The ramrod in the far hand, pushed down the barrel.
    atts.ramrod = (c, x) => {
      const top = x.at([0, -0.6]);
      stick(c, top, [top[0], top[1] + 4.2], 0.18, SM.wood, 3);
    };
  }
  if (s.shoot === 'kyudo') {
    // The yumi, drawn on the frame: while the `draw` event runs the string goes to the draw hand,
    // the bow bends with the draw's length and the arrow lies on it; after the loose the bow has
    // turned in the hand (yugaeri), the string on the outside.
    atts.farItem = {
      cache: false,
      draw: (c, x, ctx) => {
        const f = ctx.posed.facing;
        const drawing = ctx.events.some((e) => e.name === 'draw');
        const hn = ctx.posed.byName.handN!;
        const nock: P2 = [hn.tx, hn.ty];
        const grip = withMap(partMap(x), () => mapPoint(rest[f].hnF));
        const len = Math.hypot(nock[0] - grip[0], nock[1] - grip[1]);
        const bend = drawing ? Math.max(0, Math.min(1, (len - 1.6) / 4.2)) : 0;
        yumi(c, grip, (s.farDeg ?? 180) + x.turned * 7.5, bend, drawing ? nock : null, drawing);
      },
    };
  }
  return atts;
}

// ------------------------------------------------------------------ authoring clips

type Tracks = Parameters<typeof overlayKeys>[1];
type Author = (rw: Record<string, number>, f: Facing) => Tracks;
/** A track from rest through the given keys and back to rest at `end`. */
const R = (rest: number, end: number, ...kv: [number, number][]): Track => [[0, rest], ...kv, [end, rest]];

/** Keys for a facing from a mocap clip with authored tracks laid over it. */
function mk(skel: SkeletonData, f: Facing, clip: string, o: MocapOpts, author?: Author, extra: number[] = []): { keys: KP[]; ev: AnimEvent[] } {
  const { keys, clip: mc } = mocapKeys(skel, clip, f, o);
  const tr = author ? author(restWorld(skel, f), f) : {};
  return { keys: overlayKeys(keys, tr, extra), ev: mc.events.map((e) => ({ ...e })) };
}

/**
 * templar-rig's lagCloth, with the leader's and the parent's turns taken the short way round: a
 * bone solved by IK can come back a full turn from its rest (358° for -2°), which the Templar
 * version reads as a 360° swing of the cloth.
 */
function lagCloth(skel: SkeletonData, clip: Clip, n: number, loop: boolean, specs: readonly LagSpec[]): Clip {
  const one = (anim: AnimationData, facing: Facing): AnimationData => {
    const L = 16;
    const rest = evaluate(skel, emptyLocals(), { level: L, facing, noIk: true });
    const at = (t: number): Posed => {
      const tt = loop ? t - n * Math.floor(t / n) : Math.max(0, Math.min(n - 1, t));
      return evaluate(skel, sampleClip(anim, tt, n, facing), { level: L, facing });
    };
    const rw = restWorld(skel, facing);
    const bones = { ...(anim.bones ?? {}) };
    for (const sp of specs) {
      const keys: Key<number>[] = [];
      const parent = skel.bones.find((b) => b.name === sp.bone)!.parent!;
      for (let f = 0; f <= (loop ? n : n - 1); f++) {
        const now = at(f), was = at(f - sp.lag);
        const lead = shortest(was.byName[sp.follow]!.raw - rest.byName[sp.follow]!.raw);
        const pTurn = shortest(now.byName[parent]!.raw - rest.byName[parent]!.raw);
        const wv = sp.wave ? sp.wave[0] * Math.sin(2 * Math.PI * (sp.wave[1] * f / n + sp.wave[2])) : 0;
        const want = rw[sp.bone]! + sp.k * lead + (sp.bias ?? 0) - (sp.plumb ?? 0) * pTurn + wv;
        const local = shortest(want - now.byName[parent]!.raw - (rw[sp.bone]! - rw[parent]!));
        keys.push({ f, v: Math.round(local * 100) / 100 });
      }
      bones[sp.bone] = { ...(bones[sp.bone] ?? {}), rotate: keys };
    }
    return { ...anim, bones };
  };
  const fc = clip as FacingClips;
  return mapFacings(fc, (a, f) => one(a, f));
}

/** Cloth and gear driven late by the body. */
function trail(run: number, fall = false, swing = false): LagSpec[] {
  // In a fall the flag pole and the horo frame go down with the body (no hanging plumb).
  if (fall)
    return [
      { bone: 'skirtN', follow: 'thighN', k: 0.45, lag: 1.5, plumb: 0.2 },
      { bone: 'skirtF', follow: 'thighF', k: 0.45, lag: 1.5, plumb: 0.2 },
      { bone: 'sodeN', follow: 'upperArmN', k: 0.3, lag: 1, plumb: 0.2 },
      { bone: 'sodeF', follow: 'upperArmF', k: 0.2, lag: 1, plumb: 0.2 },
      { bone: 'banner', follow: 'chest', k: 1, lag: 1, plumb: 0 },
      { bone: 'horo', follow: 'chest', k: 1, lag: 1, plumb: 0 },
    ];
  return [
    { bone: 'skirtN', follow: 'thighN', k: 0.45, lag: 1.5, bias: -5 * run, plumb: 0.35 },
    { bone: 'skirtF', follow: 'thighF', k: 0.45, lag: 1.5, bias: -5 * run, plumb: 0.35 },
    { bone: 'sodeN', follow: 'upperArmN', k: 0.35, lag: 1, plumb: 0.35 },
    { bone: 'sodeF', follow: 'upperArmF', k: 0.2, lag: 1, plumb: 0.55 },
    // The sashimono's pole whips after the trunk (more than the trunk moves, then back: a flexing
    // cane), streams back and flutters at the run.
    { bone: 'banner', follow: 'chest', k: swing ? 1.5 : run >= 1 ? 0.8 : 0.6, lag: swing ? 2 : 1.5, bias: run >= 1 ? 12 : 0, plumb: 0.2, ...(run >= 1 ? { wave: [7, 2, 0] as [number, number, number] } : {}) },
    { bone: 'horo', follow: 'chest', k: 0.5, lag: 2, bias: run >= 1 ? 6 : 0, plumb: 0.3, ...(run >= 1 ? { wave: [4, 2, 0.25] as [number, number, number] } : {}) },
  ];
}

// ------------------------------------------------------------------ attacks

/**
 * Kesa-giri (the katana's diagonal cut, from the cut-diagonal capture: wind-up 1-4, the strike 5-6,
 * the impact held 7-8, the recovery 9-11): both hands lift the blade from chūdan to hassō at the
 * near shoulder, the hips turn first, then the arms, and the blade falls on the diagonal from the
 * near shoulder through the far hip, ending low in front with the weight on the front foot.
 */
const KESA: Author = (rw) => ({
  // 1-4: both hands climb over the near (right) shoulder to hassō/jōdan, the blade back over the
  // head, the hips and shoulders coiled back; 5: the hips turn first, the hands still high; 6-7 the
  // blade falls through the whole diagonal, shoulder height to past the far knee; 8 zanshin.
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 80], [2, 150], [3, 172], [4, 176], [5, 150], [6, 100], [7, 42], [8, 40], [9, 30], [10, 18]),
    forearmN: R(rw.forearmN!, 11, [1, 170], [2, 200], [3, 214], [4, 214], [5, 168], [6, 96], [7, 22], [8, 20], [9, 40], [10, 70]),
    weapon: R(rw.weapon!, 11, [1, 190], [2, 220], [3, 238], [4, 242], [5, 186], [6, 102], [7, 26], [8, 28], [9, 60], [10, 100]),
    head: T([0, rw.head!], [3, rw.head! + 6], [5, rw.head!], [7, rw.head! - 14], [8, rw.head! - 14], [10, rw.head! - 4], [11, rw.head!]),
  },
  // The trunk arches back in the coil, then folds over the front thigh at the impact.
  dw: { spine: T([0, 0], [2, 6], [3, 10], [4, 10], [5, 2], [6, -16], [7, -30], [8, -29], [10, -8], [11, 0]) },
  tAdd: {
    // The long driving step (the kenjutsu photographs): the front foot lands far forward as the
    // hands arrive, the hips drop into a deep stance, the rear leg straightens behind.
    pelvis: [T([0, 0], [3, -0.4], [4, -0.45], [5, 0.2], [6, 0.8], [7, 1.15], [8, 1.12], [10, 0.4], [11, 0]), T([0, 0], [3, -0.15], [4, -0.15], [6, 0.4], [7, 0.75], [8, 0.75], [10, 0.25], [11, 0])],
    // The shoulders' turn, which the side-on views show as the chest swinging back, then through.
    chest: [T([0, 0], [3, -0.35], [4, -0.4], [5, -0.1], [6, 0.25], [7, 0.45], [8, 0.42], [10, 0.1], [11, 0]), T([0, 0])],
    footTargetF: [T([0, 0], [4, 0], [5, 0.8], [6, 1.7], [9, 1.65], [10, 0.7], [11, 0]), T([0, 0], [4, -0.3], [5, -0.65], [6, 0], [9, 0], [10, -0.35], [11, 0])],
    footTargetN: [T([0, 0], [6, 0], [7, -0.3], [9, -0.3], [11, 0]), T([0, 0])],
  },
});

/**
 * The yari thrust (sōjutsu, underarm in both hands; the thrust capture's timing with the lunge the
 * brief adds): 0-1 the spear comes down level at the hip; 2 chamber, the rear hand drawn back and
 * the weight on the rear foot; 3-4 the drive, hips first, the front foot lunging, the arms shooting
 * the shaft out along its own line (the point travels straight, the angle never changes); 5-6 held
 * at full reach; 7-11 drawn back slower, the step recovered, the spear raised to the slope.
 */
const THRUST: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, -8], [2, -36], [3, -18], [4, 44], [5, 56], [6, 56], [8, 4], [9, -8], [10, 20]),
    forearmN: R(rw.forearmN!, 11, [1, 72], [2, 52], [3, 70], [4, 94], [5, 97], [6, 97], [8, 80], [9, 72], [10, 100]),
    weapon: R(rw.weapon!, 11, [1, 97], [9, 97], [10, 140]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, 8], [3, 0], [4, -12], [6, -13], [8, -4], [11, 0]) },
  tAdd: {
    pelvis: [T([0, 0], [1, -0.1], [2, -0.55], [3, 0.25], [4, 1.1], [6, 1.15], [8, 0.5], [10, 0.1], [11, 0]), T([0, 0], [1, 0.2], [2, 0.3], [4, 0.55], [6, 0.55], [8, 0.25], [11, 0])],
    footTargetF: [T([0, 0], [2, 0], [3, 0.8], [4, 1.7], [6, 1.7], [8, 0.8], [10, 0.1], [11, 0]), T([0, 0], [2, 0], [3, -0.55], [4, 0], [6, 0], [7, -0.3], [8, 0], [9, -0.2], [10, 0])],
  },
});

/**
 * The nage-yari jab: from the cocked javelin overhead, the weight back, then an overhand stab
 * forward and down along the shaft with a step, held, and back up to the cock.
 */
const JAB: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 200], [3, 196], [4, 120], [5, 100], [6, 100], [8, 150], [10, 180]),
    forearmN: R(rw.forearmN!, 11, [2, 215], [3, 210], [4, 130], [5, 108], [6, 108], [8, 160], [10, 190]),
    weapon: R(rw.weapon!, 11, [2, 112], [3, 112], [4, 104], [5, 102], [6, 102], [8, 108]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, 8], [3, 6], [4, -12], [6, -14], [8, -4], [11, 0]) },
  tAdd: {
    pelvis: [T([0, 0], [2, -0.45], [3, -0.3], [4, 0.6], [6, 0.65], [8, 0.3], [11, 0]), T([0, 0], [2, 0.1], [4, 0.3], [6, 0.3], [11, 0])],
    footTargetF: [T([0, 0], [2, 0], [3, 0.5], [4, 1.2], [7, 1.2], [9, 0.4], [11, 0]), T([0, 0], [2, 0], [3, -0.5], [4, 0], [11, 0])],
  },
});

/**
 * The javelin throw (the javelin capture: withdraw 0-3, the block and delivery 4-5 over the
 * planted front leg, release on 5, follow-through 6-8 with the throwing arm coming down across the
 * body; recover 9-11, the hand reaching back to the bundle for the next).
 */
const THROW: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 215], [2, 225], [3, 228], [4, 185], [5, 140], [6, 70], [8, 10], [10, 120]),
    forearmN: R(rw.forearmN!, 11, [1, 245], [2, 255], [3, 258], [4, 210], [5, 125], [6, 50], [8, 15], [10, 200]),
    weapon: R(rw.weapon!, 11, [1, 100], [3, 98], [4, 104], [5, 112], [6, 112]),
    head: T([0, rw.head!]),
  },
  // The free arm (far) points at the target through the withdraw, then pulls in to the chest; the
  // trunk leans back 16° over the bent rear leg, whips forward over the planted front leg and folds
  // over it in the follow-through, the rear foot lifting behind; then he steps back to the stance.
  dw: {
    upperArmF: T([0, 0], [3, 10], [4, 0], [5, -40], [7, -60], [9, -20], [11, 0]), forearmF: T([0, 0], [4, 10], [5, 30], [7, 40], [11, 0]),
    spine: T([0, 0], [2, 12], [3, 16], [4, 4], [5, -14], [6, -24], [8, -22], [10, -6], [11, 0]),
  },
  tAdd: {
    pelvis: [T([0, 0], [2, -0.5], [3, -0.6], [4, 0.2], [5, 0.7], [7, 0.9], [9, 0.4], [11, 0]), T([0, 0], [3, 0.35], [4, 0.15], [6, 0.35], [8, 0.3], [11, 0])],
    footTargetF: [T([0, 0], [2, 0.2], [3, 0.9], [4, 1.4], [9, 1.4], [10, 0.6], [11, 0]), T([0, 0], [2, -0.4], [3, -0.3], [4, 0], [9, 0], [10, -0.3], [11, 0])],
    footTargetN: [T([0, 0], [5, 0], [6, 0.4], [8, 0.6], [9, 0.3], [11, 0]), T([0, 0], [5, 0], [6, -0.6], [7, -0.9], [8, -0.4], [9, 0], [11, 0])],
  },
});

/**
 * Kyūdō's shot (the hassetsu on the bow capture's timing): 0 the stance; 1 the arrow nocked, the
 * draw hand on the string; 2-3 uchiokoshi, both arms raise the bow above the head; 4-5 hikiwake,
 * the bow comes down to the target while the arms open, the draw hand to behind the ear with the
 * elbow high and back; 6 kai, held; 7 hanare, the draw hand flies back and down along the arrow's
 * line, the bow turns in the hand (yugaeri); 8-9 zanshin, held; 10-11 the bow lowered, the hand
 * goes to the ebira for the next arrow.
 */
const KYUDO: Author = (rw) => ({
  w: {
    upperArmF: R(rw.upperArmF!, 11, [1, 60], [2, 140], [3, 150], [4, 120], [5, 96], [6, 94], [7, 94], [8, 90], [9, 90], [10, 50]),
    forearmF: R(rw.forearmF!, 11, [1, 70], [2, 150], [3, 158], [4, 120], [5, 96], [6, 94], [7, 94], [8, 92], [9, 92], [10, 60]),
    itemF: R(rw.itemF!, 11, [1, 180], [6, 180], [7, 168], [9, 166], [10, 175]),
    upperArmN: R(rw.upperArmN!, 11, [1, 60], [2, 150], [3, 165], [4, 190], [5, 205], [6, 206], [7, 262], [8, 266], [9, 266], [10, 120]),
    forearmN: R(rw.forearmN!, 11, [1, 100], [2, 150], [3, 150], [4, 120], [5, 100], [6, 98], [7, 250], [8, 262], [9, 262], [10, 60]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [3, 3], [6, 2], [8, 3], [11, 0]) },
});
/** The archer's last resort: a stab with the arrow in the fist, on a step. */
const PUNCH: Author = (rw) => ({
  w: { upperArmN: R(rw.upperArmN!, 11, [3, -25], [5, 80], [6, 78], [9, 20]), forearmN: R(rw.forearmN!, 11, [3, 80], [5, 92], [6, 90], [9, 40]), head: T([0, rw.head!]) },
  dw: { spine: T([0, 0], [3, 6], [5, -12], [6, -12], [9, -3], [11, 0]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.35], [5, 0.55], [6, 0.55], [9, 0.2], [11, 0]), T([0, 0], [5, 0.25], [11, 0])], footTargetF: [T([0, 0], [3, 0], [5, 0.9], [8, 0.9], [10, 0.3], [11, 0]), T([0, 0], [4, -0.4], [5, 0], [11, 0])] },
});

/**
 * Hōjutsu's shot and the first of the reload (the gun capture's timing; the Edo manuals' stance):
 * 0-2 the gun comes up, the short butt to the cheek, the far hand under the barrel, the head down
 * along it; 3-5 the aim, still; 6 fire (the pan, then the muzzle and the smoke); 7 the recoil, the
 * muzzle kicking up 15° and the head and shoulders rocking back; 8 settle; 9-10 the gun stood
 * muzzle-up at the hip and the ramrod driven down the barrel; 11 back to port arms.
 */
const TEPPO: Author = (rw, f) => ({
  w: {
    // (The reload: the gun stood upright low at the near hip, the muzzle at the chin, the far hand
    // over it driving the ramrod down.)
    upperArmN: R(rw.upperArmN!, 11, [2, 138], [5, 140], [6, 140], [7, 148], [8, 142], [9, -5], [10, -5]),
    forearmN: R(rw.forearmN!, 11, [2, 86], [5, 88], [6, 88], [7, 100], [8, 90], [9, 10], [10, 10]),
    weapon: R(rw.weapon!, 11, [2, 93], [5, 92], [6, 92], [7, 108], [8, 96], [9, 165], [10, 165]),
    // (From behind the far shoulder is on the other side of the gun: the arm reaches up and forward.)
    upperArmF: T([0, rw.upperArmF!], [8.5, rw.upperArmF!], [9, f === 'ne' ? 158 : 200], [10, f === 'ne' ? 150 : 192], [11, rw.upperArmF!]),
    forearmF: T([0, rw.forearmF!], [8.5, rw.forearmF!], [9, f === 'ne' ? 150 : 212], [10, f === 'ne' ? 140 : 198], [11, rw.forearmF!]),
    head: T([0, rw.head!], [2, rw.head! - 8], [6, rw.head! - 8], [7, rw.head! + 2], [8, rw.head! - 4], [9, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, -6], [6, -6], [7, 4], [8, -2], [9, -4], [11, 0]) },
  tAdd: { pelvis: [T([0, 0], [2, 0.1], [6, 0.15], [7, -0.35], [8, -0.1], [11, 0]), T([0, 0], [2, 0.2], [6, 0.2], [7, 0.15], [9, 0.25], [11, 0])] },
  // The far hand leaves the stock for the ramrod.
  ik: { armF2h: T([0, 1], [8.4, 1], [8.6, 0], [10.4, 0], [10.6, 1]) },
});
/** The gunner's melee: the teppō levelled at the hip and rammed muzzle-first into the enemy, two-handed, on a step. */
const BUTT: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, -10], [3, -24], [5, 46], [6, 48], [9, 0]),
    forearmN: R(rw.forearmN!, 11, [2, 70], [3, 62], [5, 92], [6, 92], [9, 75]),
    weapon: R(rw.weapon!, 11, [2, 98], [3, 98], [5, 95], [6, 95], [9, 105]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [3, 8], [5, -14], [6, -14], [9, -4], [11, 0]) },
  tAdd: { pelvis: [T([0, 0], [3, -0.35], [5, 0.55], [6, 0.55], [9, 0.2], [11, 0]), T([0, 0], [5, 0.25], [11, 0])], footTargetF: [T([0, 0], [3, 0], [5, 0.9], [8, 0.9], [10, 0.3], [11, 0]), T([0, 0], [4, -0.4], [5, 0], [11, 0])] },
});

/**
 * The naginata sweep (naginata-jutsu's furikaeshi/yokogiri, on the chop capture's rise and drop):
 * 1-3 the naginata swung back and up over the near shoulder, the blade high behind, the trunk
 * coiled back; 4 the top, the hips turning; 5-6 the blade sweeps round in a wide arc forward and
 * down, the far hand sliding the shaft through, the body stepping and sinking into it (smear);
 * 7 the blade low and forward past the far knee, held; 8 it carries a little further; 9-11 back up.
 */
const SWEEP: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 70], [2, 130], [3, 150], [4, 140], [5, 110], [6, 75], [7, 50], [8, 46], [10, 30]),
    forearmN: R(rw.forearmN!, 11, [1, 150], [2, 190], [3, 205], [4, 180], [5, 120], [6, 80], [7, 55], [8, 50], [10, 70]),
    weapon: R(rw.weapon!, 11, [1, 215], [2, 245], [3, 262], [4, 236], [5, 160], [6, 95], [7, 58], [8, 50], [10, 120]),
    head: T([0, rw.head!], [3, rw.head! + 6], [5, rw.head!], [7, rw.head! - 10], [8, rw.head! - 10], [10, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, 8], [3, 12], [4, 6], [5, -6], [6, -16], [7, -24], [8, -24], [10, -6], [11, 0]) },
  tAdd: {
    pelvis: [T([0, 0], [3, -0.45], [4, -0.3], [5, 0.3], [6, 0.8], [7, 1.0], [8, 1.0], [10, 0.35], [11, 0]), T([0, 0], [3, -0.1], [5, 0.2], [7, 0.65], [8, 0.65], [10, 0.2], [11, 0])],
    chest: [T([0, 0], [3, -0.35], [4, -0.3], [6, 0.25], [7, 0.4], [8, 0.4], [10, 0.1], [11, 0]), T([0, 0])],
    footTargetF: [T([0, 0], [4, 0], [5, 0.7], [6, 1.5], [9, 1.45], [10, 0.6], [11, 0]), T([0, 0], [4, -0.2], [5, -0.6], [6, 0], [9, 0], [10, -0.3], [11, 0])],
  },
});

/**
 * The gunbai's command: the lord raises the war fan high over his head (1-3), holds it there while
 * the line looks to him (4), then sweeps it forward and down to point at the enemy with a step and
 * a lean (5-6), holds the point (7-8), and brings it back to his chest (9-11).
 */
const FAN: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 130], [2, 165], [3, 172], [4, 172], [5, 130], [6, 96], [7, 92], [8, 92], [10, 100]),
    forearmN: R(rw.forearmN!, 11, [1, 150], [2, 175], [3, 182], [4, 182], [5, 120], [6, 92], [7, 90], [8, 90], [10, 80]),
    weapon: R(rw.weapon!, 11, [1, 160], [2, 180], [3, 188], [4, 188], [5, 140], [6, 98], [7, 92], [8, 92], [10, 105]),
    head: T([0, rw.head!], [3, rw.head! + 4], [5, rw.head!], [7, rw.head! - 4], [9, rw.head!]),
  },
  dw: { spine: T([0, 0], [3, 6], [4, 6], [5, 0], [6, -10], [8, -10], [10, -3], [11, 0]), upperArmF: T([0, 0], [3, -6], [6, 10], [9, 0]) },
  tAdd: {
    pelvis: [T([0, 0], [3, -0.2], [4, -0.2], [6, 0.55], [8, 0.55], [10, 0.15], [11, 0]), T([0, 0], [6, 0.2], [8, 0.2], [11, 0])],
    footTargetF: [T([0, 0], [4, 0], [5, 0.5], [6, 1.0], [9, 1.0], [10, 0.4], [11, 0]), T([0, 0], [4, -0.2], [5, -0.5], [6, 0], [11, 0])],
  },
});

const ATTACKS: Record<Attack, { clip: string; o: MocapOpts; a: Author; extra: number[]; ev: AnimEvent[] }> = {
  kesa: { clip: 'cut-diagonal', o: { torso: 0.5, travel: 0, feet: 0.3 }, a: KESA, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 5, name: 'smear', len: 3, bone: 'weapon' }, { f: 7, name: 'strike' }] },
  thrust: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: THRUST, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }] },
  jab: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: JAB, extra: [2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }] },
  punch: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: PUNCH, extra: [3, 5, 6, 9], ev: [{ f: 5, name: 'strike' }] },
  butt: { clip: 'thrust', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: BUTT, extra: [3, 5, 6, 9], ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'strike' }] },
  sweep: { clip: 'chop', o: { torso: 0.3, travel: 0.3, feet: 0.3 }, a: SWEEP, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 5, name: 'smear', len: 3, bone: 'weapon' }, { f: 7, name: 'strike' }] },
  fan: { clip: 'brace', o: { ref: 'first', torso: 0, travel: 0, feet: 0 }, a: FAN, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 5, name: 'smear', len: 2, bone: 'weapon' }, { f: 6, name: 'strike' }] },
};

/** Missiles: clip, capture options, authored arms, events, and a slot hidden while the missile is away. */
const SHOOTS: Record<Exclude<Shoot, null>, { clip: string; o: MocapOpts; a: Author; extra: number[]; ev: AnimEvent[]; hide?: [string, number, number] }> = {
  javelin: { clip: 'thrust', o: { torso: 0.2, travel: 0, feet: 0 }, a: THROW, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'release' }], hide: ['weapon', 5, 11] },
  kyudo: { clip: 'bow', o: { torso: 0.4, travel: 0.6, feet: 0.4 }, a: KYUDO, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 1, name: 'draw', len: 6 }, { f: 7, name: 'release' }], hide: ['weapon', 1, 11] },
  teppo: { clip: 'gun', o: { ref: 'first', torso: 0.3, travel: 0.4, feet: 0.3 }, a: TEPPO, extra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ev: [{ f: 6, name: 'release' }] },
};

// ------------------------------------------------------------------ the rest

/** Brace poses (held; the breathing is laid over). */
const BRACE: Record<Brace, Author> = {
  // Chūdan no kamae, settled low: the blade forward at the enemy's throat, the far hand on the pommel.
  // A deep chūdan: knees well bent, the front foot forward and the weight on it, the trunk over
  // the front thigh, the blade levelled at the enemy's throat.
  chudan: (rw) => ({
    dw: { spine: T([0, -16]) },
    w: { head: T([0, rw.head! - 4]), upperArmN: T([0, 34]), forearmN: T([0, 88]), weapon: T([0, 100]) },
    tAdd: { pelvis: [T([0, 0.3]), T([0, 0.9])], footTargetF: [T([0, 1.0]), T([0, 0])], footTargetN: [T([0, -0.7]), T([0, 0])] },
  }),
  // Set against horse: crouched, the butt planted behind the rear foot, the point rising at a horse's chest.
  yari: (rw) => ({
    dw: { spine: T([0, -16]) },
    w: { head: T([0, rw.head! + 4]), upperArmN: T([0, 14]), forearmN: T([0, 62]), weapon: T([0, 126]) },
    tAdd: { pelvis: [T([0, -0.1]), T([0, 1.1])], footTargetF: [T([0, 1.1]), T([0, 0])], footTargetN: [T([0, -0.8]), T([0, 0])] },
  }),
  // A ready crouch, the weapon held as it is, the weight forward.
  ready: (rw) => ({ dw: { spine: T([0, -10]) }, w: { head: T([0, rw.head! - 2]) }, tAdd: { pelvis: [T([0, 0.2]), T([0, 0.8])], footTargetF: [T([0, 0.9]), T([0, 0])], footTargetN: [T([0, -0.6]), T([0, 0])] } }),
  // The volley behind the tate (the Edo manuals): crouched low on a long stance, the gun at the cheek, aiming.
  kneel: (rw) => ({
    dw: { spine: T([0, -10]) },
    w: { head: T([0, rw.head! - 8]), upperArmN: T([0, 138]), forearmN: T([0, 86]), weapon: T([0, 93]) },
    tAdd: { pelvis: [T([0, -0.3]), T([0, 1.5])], footTargetF: [T([0, 1.0]), T([0, 0])], footTargetN: [T([0, -1.1]), T([0, 0])] },
  }),
  // Gedan: deep and low, the naginata held forward with the blade down at the enemy's knee (the fighting-monk photograph).
  naginata: (rw) => ({
    dw: { spine: T([0, -14]) },
    w: { head: T([0, rw.head! - 2]), upperArmN: T([0, 20]), forearmN: T([0, 70]), weapon: T([0, 78]) },
    tAdd: { pelvis: [T([0, 0.2]), T([0, 1.0])], footTargetF: [T([0, 1.0]), T([0, 0])], footTargetN: [T([0, -0.8]), T([0, 0])] },
  }),
  // Planted wide, the fan held out over the line, pointing.
  command: (rw) => ({
    dw: { spine: T([0, -6]) },
    w: { head: T([0, rw.head!]), upperArmN: T([0, 110]), forearmN: T([0, 100]), weapon: T([0, 110]) },
    tAdd: { pelvis: [T([0, 0.15]), T([0, 0.6])], footTargetF: [T([0, 0.9]), T([0, 0])], footTargetN: [T([0, -0.7]), T([0, 0])] },
  }),
};

/** The fall back (die-back): the trunk ends flat, the hips bounce as the back lands (frame 8); the off hand lets go. */
const DIE_BACK: Author = () => ({
  dw: { spine: T([0, 0], [6, 0], [8, 18], [11, 24]), chest: T([0, 0], [8, 10], [11, 16]), head: T([0, 0], [8, 0], [11, 6]) },
  tAdd: { pelvis: [T([0, 0]), T([0, 0], [7, 0], [8, -0.3], [9, 0])] },
  ik: { armF2h: T([0, 1], [1, 0]) },
});
const DIE_FWD: Author = () => ({
  tAdd: { pelvis: [T([0, 0]), T([0, 0], [8, 0], [9, -0.25], [10, 0])] },
  ik: { armF2h: T([0, 1], [1, 0]) },
});

/** A slot shows nothing from frame `from` until `to` (a thrown weapon gone from the hand). */
function hideSlot(c: Clip, slot: string, from: number, to: number): Clip {
  return mapFacings(c, (a) => ({ ...a, slots: { ...(a.slots ?? {}), [slot]: [{ f: 0, v: slot }, { f: from, v: null }, { f: to, v: slot }] } }));
}
/** A slot shows its attachment from `from` until `to`. */
function showSlot(c: Clip, slot: string, att: string, from: number, to: number): Clip {
  return mapFacings(c, (a) => ({ ...a, slots: { ...(a.slots ?? {}), [slot]: [{ f: 0, v: null }, { f: from, v: att }, { f: to, v: null }] } }));
}
void showSlot;

/** Every Anim of a foot kind. */
export function footClips(skel: SkeletonData, s: SSpec, k: SFoot): ClipSet {
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => { keys: KP[]; ev: AnimEvent[] }, ev?: AnimEvent[], run = 0): Clip => {
    const se = keys('se'), ne = keys('ne');
    const c = facingClip(skel, name, n, loop, (f) => (f === 'ne' ? ne.keys : se.keys), ev ?? se.ev);
    return lagCloth(skel, c, n, loop, trail(run, name === 'die' || name === 'dead', name === 'attack' || name === 'shoot' || name === 'hit'));
  };
  const withBreath = (c: Clip, alpha = 1): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', never> };
    return { byFacing: { se: [{ anim: b.byFacing.se }, { anim: BREATH, alpha }], ne: [{ anim: b.byFacing.ne }, { anim: BREATH, alpha }] } };
  };
  // The horo balloons as the man runs (its frame's bone stretched back), and swells a little in a walk.
  const billow = (c: Clip, n: number, amt: number): Clip =>
    mapFacings(c, (a) => {
      const keys = [];
      for (let f = 0; f <= n; f++) keys.push({ f, v: Math.round((1 + amt * (0.85 + 0.15 * Math.sin((2 * Math.PI * 2 * f) / n))) * 100) / 100 });
      return { ...a, bones: { ...(a.bones ?? {}), horo: { ...(a.bones?.horo ?? {}), scaleY: keys } } };
    });
  // Feet: in the stance they stand 3 units apart across the body; walking, they track close to the line of travel.
  const track = (f: Facing, kk: number): Record<string, [Track, Track]> => {
    const sd = f === 'ne' ? -1 : 1;
    return { footTargetN: [T([0, 1.1 * kk * sd]), T([0, 0])], footTargetF: [T([0, -1.1 * kk * sd]), T([0, 0])] };
  };
  const carry = (c: Carry, rw: Record<string, number>): { w: Record<string, Track>; dw: Record<string, Track>; ik: Record<string, Track> } => {
    const w: Record<string, Track> = {};
    for (const b of ['upperArmN', 'forearmN', 'weapon', 'upperArmF', 'forearmF', 'itemF'] as const) if (c[b] !== undefined) w[b] = T([0, c[b]!]);
    const dw: Record<string, Track> = c.farBase ? { upperArmF: T([0, c.farBase[0] - rw.upperArmF!]), forearmF: T([0, c.farBase[1] - rw.forearmF!]) } : {};
    return { w, dw, ik: { armF2h: T([0, s.twoHand && c.both ? 1 : 0]) } };
  };
  const freeF = (c: Carry) => !(s.twoHand && c.both) && c.upperArmF === undefined && !c.holdF;
  // The walk: a long even stride (feet ~0.3 H apart at contact), the hips down 1-2 px just after
  // each contact, the shoulders counter-swinging, the weapon carried clear of the body.
  const walkA = (rw: Record<string, number>, f: Facing): Tracks => {
    const bob = T([0, 0.12], [1, 0.25], [2, 0.12], [3, -0.12], [4, -0.15], [5, 0], [6, 0.12], [7, 0.25], [8, 0.12], [9, -0.12], [10, -0.15], [11, 0]);
    const twist = T([0, -0.15], [3, 0], [6, 0.15], [9, 0], [11, -0.1]);
    const cw = carry(s.walk, rw);
    return { w: { head: T([0, rw.head!]), ...cw.w }, dw: cw.dw, ik: cw.ik, tAdd: { pelvis: [T([0, 0]), bob], chest: [twist, T([0, 0])], ...track(f, 1) } };
  };
  let walk = fc('walk', 12, true, (f) => mk(skel, f, 'walk', { ref: 'mean', torso: 0.5, arms: { N: 0, F: freeF(s.walk) ? 0.55 : 0 }, roll: 0.6, feet: 1.25, mirror: 12 }, walkA), [{ f: 0, name: 'step', str: 'N' }, { f: 6, name: 'step', str: 'F' }], 0.3);
  const runA = (rw: Record<string, number>, f: Facing): Tracks => {
    const cw = carry(s.run, rw);
    return { tAdd: track(f, 1.1), w: { head: T([0, rw.head! - 6]), ...cw.w }, ik: cw.ik, dw: { spine: T([0, -13]), ...cw.dw } };
  };
  let run = fc('run', 12, true, (f) => mk(skel, f, 'run', { ref: 'mean', torso: 0.5, arms: { N: 0, F: freeF(s.run) ? 0.7 : 0 }, roll: 0.5, mirror: 12 }, runA), [{ f: 0, name: 'step', str: 'N' }, { f: 6, name: 'step', str: 'F' }], 1);
  // Idle: the capture's slow weight shift, small (the key art must hold), and breathing.
  const idle = withBreath(fc('idle', 8, true, (f) => mk(skel, f, 'idle', { ref: 'first', torso: 0.1, travel: 0.16, feet: 0 })));
  const at = ATTACKS[s.attack];
  const attack = fc('attack', 12, false, (f) => mk(skel, f, at.clip, at.o, at.a, at.extra), at.ev);
  let shoot = attack;
  if (s.shoot) {
    const sh = SHOOTS[s.shoot];
    shoot = fc('shoot', 12, false, (f) => mk(skel, f, sh.clip, sh.o, sh.a, sh.extra), sh.ev);
    if (sh.hide) shoot = hideSlot(shoot, sh.hide[0], sh.hide[1], sh.hide[2]);
    if (s.shoot === 'teppo') {
      // The muzzle where it fired (per facing), for the flash and the smoke that stays there.
      shoot = mapFacings(shoot, (a, f) => {
        const p = evaluate(skel, sampleClip(a, 6, 12, f), { level: 16, facing: f });
        const w = p.byName.weapon!;
        const deg = w.step * 7.5;
        const mz: P2 = [Math.round((w.x + Math.sin((deg * Math.PI) / 180) * 7.1) * 100) / 100, Math.round((w.y + Math.cos((deg * Math.PI) / 180) * 7.1) * 100) / 100];
        const pan: P2 = [Math.round((w.x + Math.sin((deg * Math.PI) / 180) * 0.6) * 100) / 100, Math.round((w.y + Math.cos((deg * Math.PI) / 180) * 0.6 - 0.35) * 100) / 100];
        const ev: AnimEvent[] = [
          { f: 6, name: 'pan', str: `${pan[0]},${pan[1]},${deg}` },
          { f: 6, name: 'muzzle', int: 0, str: `${mz[0]},${mz[1]},${deg}` },
          { f: 7, name: 'muzzle', int: 1, str: `${mz[0]},${mz[1]},${deg}` },
          ...[6, 7, 8, 9, 10, 11].map((fr) => ({ f: fr, name: 'smoke', int: fr - 6, str: `${mz[0]},${mz[1]},${deg}` })),
        ];
        return { ...a, events: [...(a.events ?? []), ...ev], slots: { ...(a.slots ?? {}), ramrod: [{ f: 0, v: null }, { f: 9, v: 'ramrod' }, { f: 10.6, v: null }] } };
      });
    }
  }
  if (k.gear.scene) {
    // The tate stays planted where it stood: not carried on the march.
    const noScene = (c: Clip): Clip => mapFacings(c, (a) => ({ ...a, slots: { ...(a.slots ?? {}), scene: [{ f: 0, v: null }] } }));
    walk = noScene(walk);
    run = noScene(run);
  }
  // Struck: the shoulder and head snap back, the trunk follows, the rear foot steps back; a flash.
  const hitA: Author = (rw, f) => ({ ...HIT(rw, f), ...(s.nearDeg >= 160 ? { w: { weapon: T([0, rw.weapon! - 4], [1, rw.weapon! - 6], [4, rw.weapon!]) } } : {}) });
  const hit = fc('hit', 5, false, (f) => mk(skel, f, 'hit', { torso: 0, absHeight: true, travel: 0.55, feet: 0.6 }, hitA, [1, 2, 3]), [{ f: 0, name: 'flash' }]);
  const back = s.die === 'back';
  const fast = (f: number) => (f <= 6 ? f * 0.7 : 4.2 + ((f - 6) * 6.8) / 5);
  const dieK = (f: Facing) => mk(skel, f, back ? 'die-back' : 'die-forward', { torso: 1, absHeight: true, legsFK: true, arms: { N: 1, F: 1 }, ...(back ? {} : { retime: fast }) }, back ? DIE_BACK : DIE_FWD, [8, 9]);
  const nd = s.nearDeg;
  const drops: Drop[] = [{ holder: 'weapon', bone: 'dropW', slot: 'weaponDrop', from: 'weapon', at: back ? 3 : 4, land: back ? { x: -6.0, y: -0.25, rot: 270 - nd, f: 6 } : { x: 4.6, y: -0.25, rot: 90 - nd, f: 7 } }];
  if (k.gear.far?.draw) drops.push({ holder: 'itemF', bone: 'dropF', slot: 'farDrop', from: 'farItem', at: back ? 4 : 5, land: back ? { x: 4.0, y: -0.3, rot: 90 - (s.farDeg ?? 180), f: 7 } : { x: -2.6, y: -0.3, rot: -90 - (s.farDeg ?? 180), f: 8 } });
  const die = addDrops(skel, fc('die', 12, false, dieK, [{ f: back ? 7 : 9, name: 'land' }]), 12, drops);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  const brace = withBreath(fc('brace', 8, true, (f) => mk(skel, f, 'brace', { ref: 'mean', absHeight: true, travel: 1.0, torso: 0, feet: 0.4 }, BRACE[s.brace])), 0.6);
  const horo = k.gear.back && s.backBone === 'horo';
  // A weapon carried at the side shows in NE (drawn after the body, not behind it).
  const sideOrder = (c: Clip, cr: Carry): Clip => (s.neFront && cr.side ? mapFacings(c, (a, f) => (f === 'ne' ? { ...a, drawOrder: [{ f: 0, v: { ne: orders(s, k, false).ne } }] } : a)) : c);
  walk = sideOrder(walk, s.walk);
  run = sideOrder(run, s.run);
  return {
    [Anim.Idle]: idle,
    [Anim.Walk]: horo ? billow(walk, 12, 0.08) : walk,
    [Anim.Run]: horo ? billow(run, 12, 0.3) : run,
    [Anim.Attack]: attack,
    [Anim.Shoot]: shoot,
    [Anim.Hit]: hit,
    [Anim.Die]: die,
    [Anim.Dead]: dead,
    [Anim.Brace]: brace,
  };
}

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
/** The rig of a Samurai foot kind (built once). */
export function footRig(kind: number): SkeletonRig | undefined {
  const got = RIGS.get(kind);
  if (got) return got;
  const k = FOOT[kind], s = FOOT_SPECS[kind];
  if (!k || !s) return undefined;
  const skel = footSkel(kind, k, s);
  const rig: SkeletonRig = { skel, atts: footParts(kind, k, s), clips: footClips(skel, s, k) };
  RIGS.set(kind, rig);
  return rig;
}

/** Registers the foot kinds drawn on bones (samurai.ts calls this after its own registrations, so these win). */
export function registerFootRigs(kinds: readonly number[]): void {
  for (const kd of kinds) {
    const rig = footRig(kd);
    if (rig) registerPaperKind('samurai', kd, skeletonKind(rig));
  }
}

void addP;
void code;
void EASE;
void EASE_IN;
void EASE_OUT;
void evaluate;
void sampleClip;
void stick;
void muzzleFlash;
void smoke;
void (null as unknown as Paper);
void (null as unknown as AnimationData);
