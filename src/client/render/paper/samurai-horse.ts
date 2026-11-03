// The Samurai mounted kinds on bones, rebuilt from the approved key art (samurai-static.ts): Yari
// Cavalry (5), Yabusame Archers (6) and Hatamoto Horse (7).
//
// The horse: barrel, neck, head, tail and four legs, each an upper and a lower bone reaching for its
// fetlock by IK, and a hoof. The gaits are Muybridge's (motion/horse-*.json), with the hooves the
// plates show on the ground planted (the Templar horse's method, templar-horse.ts). The rider sits
// on a saddle bone with a man's bones (samurai-rig.ts); his hips follow the saddle a frame late and
// his head stays level. The mane trails the neck, the horo balloons at the gallop.

import { Anim } from '../contract.ts';
import type { P2, Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { SM, yumi } from './samurai-parts.ts';
import {
  BRACE, crescentPart, joints, KESA, KYUDO, lagCloth, neBody, PARENT, PIECE_BONE, PUNCH, R, samuraiKind, torsoWeightsAt,
  type Author, type SSpec, type Tracks,
} from './samurai-rig.ts';
import {
  abumi, HJ, HORSE_BODY, HORSE_FAR, horsePiece, LEG_PIECES, manOrder, manPiece, mapPoint, MOUNTED, mountedBody, RIDER_FAR_LEG, RIDER_NEAR_LEG, withMap,
  type Body, type HorsePiece, type ManPiece, type SMounted,
} from './samurai-static.ts';
import {
  BREATH, bonesFromJoints, EASE,
  type AnimationData, type AnimEvent, type AttachmentSet, type Clip, type JointDef, type SkeletonData, type SkeletonRig, type SlotData,
} from './skeleton.ts';
import { HIT, T } from './templar-clips.ts';
import { addDrops, at as atT, facingClip, lastFrame, mapFacings, overlayKeys, partMap, restWorld, skinMap, smooth01, type ClipSet, type Drop, type KP, type LagSpec, type Track, type Weights } from './templar-rig.ts';
import { MOTION, type MotionKey } from './motion/index.ts';

// ------------------------------------------------------------------ per-kind facts

type Ride = 'couch' | 'cut' | 'stab';
interface HorseSpec extends SSpec {
  ride: Ride;
  /** The weapon in the charge (Run): world angle (a couched yari is level over the neck). */
  charge: number;
}
const HORSE_SPECS: Record<number, HorseSpec> = {
  5: {
    nearDeg: 180, twoHand: false, neNear: 'mirror', neFar: 'mirror', backBone: 'banner', attack: 'thrust', shoot: null, brace: 'yari', die: 'back',
    walk: {}, run: {}, ride: 'couch', charge: 97, smear: [9, 13],
  },
  6: {
    nearDeg: 160, farDeg: 176, neNear: 'mirror', neFar: { el: [-0.6, -9.1], hn: [2.0, -7.6] }, backBone: 'pelvis', attack: 'punch', shoot: 'kyudo', brace: 'ready', die: 'back',
    walk: {}, run: {}, ride: 'stab', charge: 0,
  },
  7: {
    nearDeg: 150, neNear: { el: [0.4, -13.4], hn: [1.6, -15.0] }, neFar: 'mirror', backBone: 'horo', attack: 'kesa', shoot: null, brace: 'chudan', die: 'back',
    walk: {}, run: {}, ride: 'cut', charge: 160, smear: [1.4, 5.0],
  },
};

// ------------------------------------------------------------------ the skeleton

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const LEGS = ['foreF', 'hindF', 'foreN', 'hindN'] as const;
type Leg = (typeof LEGS)[number];

function horseJoints(): { name: string; parent?: string; from: P2; to: P2 }[] {
  const out: { name: string; parent?: string; from: P2; to: P2 }[] = [
    { name: 'root', from: [0, 0], to: [0, 0] },
    { name: 'horseBody', parent: 'root', from: [0, -8.0], to: [4.5, -8.4] },
    { name: 'horseNeck', parent: 'horseBody', from: HJ.withers, to: HJ.poll },
    { name: 'horseHead', parent: 'horseNeck', from: HJ.poll, to: HJ.muzzle },
    { name: 'tail', parent: 'horseBody', from: HJ.tailRoot, to: HJ.tailTip },
  ];
  for (const L of LEGS) {
    const [top, mid, fet, hoof] = HJ[L] as [P2, P2, P2, P2];
    out.push(
      { name: `${L}Upper`, parent: 'horseBody', from: top, to: mid },
      { name: `${L}Lower`, parent: `${L}Upper`, from: mid, to: fet },
      { name: `${L}Hoof`, parent: `${L}Lower`, from: fet, to: hoof },
      { name: `${L}Target`, parent: 'root', from: fet, to: fet },
    );
  }
  out.push({ name: 'saddle', parent: 'horseBody', from: [-0.2, -10.85], to: [-0.2, -10.85] });
  out.push({ name: 'mane', parent: 'horseNeck', from: [5.0, -13.0], to: [4.4, -11.6] });
  return out;
}

const HPIECE_BONE: Record<HorsePiece, string> = {
  foreFU: 'foreFUpper', foreFL: 'foreFLower', foreFH: 'foreFHoof', hindFU: 'hindFUpper', hindFL: 'hindFLower', hindFH: 'hindFHoof',
  foreNU: 'foreNUpper', foreNL: 'foreNLower', foreNH: 'foreNHoof', hindNU: 'hindNUpper', hindNL: 'hindNLower', hindNH: 'hindNHoof',
  tail: 'tail', barrel: 'horseBody', cloth: 'horseBody', saddle: 'horseBody', tassels: 'horseBody', neck: 'horseNeck', mane: 'horseNeck', head: 'horseHead',
};
const hs = (p: HorsePiece) => `h_${p}`;
const RIDER_SKIP = new Set(['root', 'footTargetN', 'footTargetF', 'scene']);

function riderPieces(m: SMounted): ManPiece[] {
  return manOrder(m.gear).filter((p) => !LEG_PIECES.has(p));
}

function orders(s: HorseSpec, m: SMounted): { se: string[]; ne: string[] } {
  const rider = riderPieces(m);
  const se = ['weaponDrop', 'farDrop', ...HORSE_FAR.map(hs), ...RIDER_FAR_LEG, ...HORSE_BODY.map(hs), ...rider, ...RIDER_NEAR_LEG, 'abumi', 'flash'];
  se.splice(se.indexOf('weapon'), 0, 'smear');
  const nearArm = ['forearmN', 'handN', 'smear', 'weapon', 'gripN'];
  const front = s.neFront ?? false;
  const neRider = ['farItem', 'gripF', 'upperArmF', 'forearmF', 'handF', 'sodeF', ...(front ? nearArm : []), 'kusaFF', 'kusaFM', 'kusaFN', 'hipGear', 'torso', 'kusaBN', 'kusaBF', 'head', 'back', 'upperArmN', 'sodeN', ...(front ? [] : nearArm)];
  // From behind, what the far hand holds (the yumi) is on the horse's far side: behind its body.
  const neFar = rider.includes('farItem') ? ['farItem', 'gripF'] : [];
  const ne = ['weaponDrop', 'farDrop', ...HORSE_FAR.map(hs), ...RIDER_FAR_LEG, ...neFar, ...HORSE_BODY.map(hs), ...neRider.filter((p) => (rider.includes(p as ManPiece) || p === 'smear') && !neFar.includes(p)), ...RIDER_NEAR_LEG, 'abumi', 'flash'];
  // A sword rider's hand and blade work outside his near leg (kiri-age starts low along the flank):
  // over the leg and the stirrup, not under them.
  if (s.ride === 'cut') {
    for (const order of [se, ne]) {
      const arm = nearArm.filter((p) => order.includes(p));
      for (const p of arm) order.splice(order.indexOf(p), 1);
      order.splice(order.indexOf('flash'), 0, ...arm);
    }
  }
  return { se, ne };
}

function horseSkel(kind: number, m: SMounted, s: HorseSpec): SkeletonData {
  const hj = horseJoints();
  const b = mountedBody(kind);
  const kit = { d: m.d, over: m.over, gear: m.gear };
  const se = joints(b, s, kit), ne = joints(neBody(b, s), s, kit);
  const defs: JointDef[] = hj.map((j) => ({ ...j }) as JointDef);
  for (const name of Object.keys(se)) {
    if (RIDER_SKIP.has(name)) continue;
    const d: JointDef = { name, from: se[name]!.from, to: se[name]!.to };
    const p = PARENT[name];
    d.parent = p === 'root' && !name.startsWith('drop') ? 'saddle' : p;
    const n = ne[name]!;
    if (n.from[0] !== d.from[0] || n.from[1] !== d.from[1] || n.to[0] !== d.to[0] || n.to[1] !== d.to[1]) d.facing = { ne: { from: n.from, to: n.to } };
    defs.push(d);
  }
  const pb = PIECE_BONE(s);
  const ord = orders(s, m);
  const slots: SlotData[] = ord.se.map((name) => {
    if (name.startsWith('h_')) return { name, bone: HPIECE_BONE[name.slice(2) as HorsePiece], attachment: { all: name } };
    if (name === 'smear') return { name, bone: 'weapon', attachment: { all: 'smear' } };
    if (name === 'flash') return { name, bone: 'root', attachment: { all: 'flash' } };
    if (name === 'abumi') return { name, bone: 'footN', attachment: { all: 'abumi' } };
    if (name === 'weaponDrop') return { name, bone: 'dropW', attachment: { all: null } };
    if (name === 'farDrop') return { name, bone: 'dropF', attachment: { all: null } };
    return { name, bone: pb[name as ManPiece], attachment: { all: name } };
  });
  const ik = LEGS.map((L) => ({ name: `${L}IK`, bones: [`${L}Upper`, `${L}Lower`] as [string, string], target: `${L}Target`, bend: (L.startsWith('fore') ? 1 : -1) as 1 | -1, mix: 1, ground: HJ[L][2]![1] }));
  return {
    name: `samurai-horse-${kind}`,
    body: 'horse',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: ord,
    ik: [...ik, { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: -1, mix: 0 }],
  };
}

// ------------------------------------------------------------------ the parts

/** The mane: the strands' roots on the crest ride the neck, their ends the trailing mane bone. */
const maneWeights: Weights = ([x, y]) => {
  // Distance below the crest line (from [2.9, -11.2] to [6.9, -14.2]).
  const d = (x - 2.9) * 0.6 + (y + 11.2) * 0.8;
  const m = smooth01(d / 1.0);
  return [['horseNeck', 1 - m], ['mane', m]];
};

function horseParts(kind: number, m: SMounted, s: HorseSpec): AttachmentSet {
  const rest: Record<Facing, Body> = { se: mountedBody(kind), ne: neBody(mountedBody(kind), s), sw: mountedBody(kind), nw: mountedBody(kind) };
  const atts: AttachmentSet = {};
  for (const p of [...HORSE_FAR, ...HORSE_BODY]) {
    if (p === 'mane') {
      atts[hs(p)] = { cache: false, draw: (c, _x, ctx) => withMap(skinMap(ctx.posed, maneWeights), () => horsePiece(c, m.horse, p)) };
      continue;
    }
    atts[hs(p)] = (c, x) => withMap(partMap(x), () => horsePiece(c, m.horse, p));
  }
  const dRide = { ...m.d, legsOn: false };
  const torsoW = torsoWeightsAt(rest.se.pel[1] + 6.6);
  for (const p of [...riderPieces(m), ...RIDER_FAR_LEG, ...RIDER_NEAR_LEG]) {
    if (p === 'torso') {
      atts[p] = { cache: false, draw: (c, _x, ctx) => withMap(skinMap(ctx.posed, torsoW), () => manPiece(c, rest[ctx.posed.facing], dRide, m.gear, p, ctx.posed.facing === 'ne')) };
      continue;
    }
    atts[p] = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], LEG_PIECES.has(p) ? m.d : dRide, m.gear, p, ctx.posed.facing === 'ne'));
  }
  atts.abumi = (c, x, ctx) => withMap(partMap(x), () => abumi(c, rest[ctx.posed.facing].anN));
  atts.weaponDrop = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], dRide, m.gear, 'weapon', ctx.posed.facing === 'ne'));
  atts.farDrop = (c, x, ctx) => withMap(partMap(x), () => manPiece(c, rest[ctx.posed.facing], dRide, m.gear, 'farItem', ctx.posed.facing === 'ne'));
  if (s.smear) atts.smear = crescentPart('weapon', s.smear[1], SM.steel);
  if (s.shoot === 'kyudo') {
    // The yumi held across the horse's neck, the arrow nocked: its string runs to the draw hand,
    // and while the `draw` event runs the bow bends with the draw's length.
    atts.farItem = {
      cache: false,
      draw: (c, x, ctx) => {
        const f = ctx.posed.facing;
        const drawing = ctx.events.some((e) => e.name === 'draw');
        const hn = ctx.posed.byName.handN!;
        const nock: P2 = [hn.tx, hn.ty];
        const grip = withMap(partMap(x), () => mapPoint(rest[f].hnF));
        const len = Math.hypot(nock[0] - grip[0], nock[1] - grip[1]);
        const bend = drawing ? Math.max(0.05, Math.min(1, (len - 1.6) / 4.2)) : 0.05;
        // The arrow is on the string at rest and through the draw; on the march and the gallop the
        // bow is carried braced (a string following the bobbing hand would churn the top of the sprite).
        const nocked = drawing || ctx.events.some((e) => e.name === 'nocked');
        yumi(c, grip, (s.farDeg ?? 176) + x.turned * 7.5, bend, nocked ? nock : null, nocked, true);
      },
    };
  }
  atts.flash = {
    cache: false,
    draw: (c, _x, ctx) => {
      if (!ctx.events.some((e) => e.name === 'flash')) return;
      for (let y = c.by0; y <= c.by1; y++)
        for (let xx = c.bx0; xx <= c.bx1; xx++) {
          const i = y * c.CW + xx, v = c.pix[i]!;
          if (v >= 0) c.pix[i] = v - (v & 7) + Math.min(4, (v & 7) + 2);
        }
    },
  };
  return atts;
}

// ------------------------------------------------------------------ the clips

const wrap = (d: number) => d - 360 * Math.floor(d / 360 + 0.5);
const sinD = (d: number) => Math.sin((d * Math.PI) / 180), cosD = (d: number) => Math.cos((d * Math.PI) / 180);
const HOOF_CODE: Record<Leg, string> = { foreF: 'FF', hindF: 'HF', foreN: 'FN', hindN: 'HN' };
const hoofRest = (L: Leg): number => {
  const [, , fet, hoof] = HJ[L] as [P2, P2, P2, P2];
  return (Math.atan2(hoof[0] - fet[0], hoof[1] - fet[1]) * 180) / Math.PI;
};

/**
 * Keys from a Muybridge gait (motion/horse-*.json), as the Templar horse: the barrel's pitch and
 * bob, the neck's and head's nod and the tail as turns from the stride's mean; each leg's fetlock
 * target from the plate's angles scaled to our horse, pressed onto the ground while the plate shows
 * that hoof down; a hoof planted lies flat, a hoof in the air folds back under the fetlock.
 */
function gaitKeys(name: string, facing: Facing, o: { amp?: number; pitch?: number; neck?: number; tail?: number } = {}): { keys: KP[]; bob: Track } {
  const clip = MOTION[name]!;
  const ks = clip.facings[facing === 'ne' ? 'ne' : 'se'].keys as (MotionKey & { hooves: Record<string, boolean> })[];
  const amp = o.amp ?? 1;
  const mean = (b: string) => ks.reduce((s0, k) => s0 + wrap(k.bones[b]! - ks[0]!.bones[b]!), 0) / ks.length + ks[0]!.bones[b]!;
  const ref = { barrel: mean('barrel'), neck: mean('neck'), head: mean('head'), tail: mean('tail') };
  const hip = 8.0;
  const sc = hip / (clip.restHip ?? 8.6);
  const meanH = ks.reduce((s0, k) => s0 + k.height, 0) / ks.length;
  const bob: [number, number][] = [];
  const keys = ks.map((k): KP => {
    const dy = (meanH - k.height) * sc;
    bob.push([k.f, dy]);
    const t: Record<string, P2> = { horseBody: [0, Math.round(dy * 100) / 100] };
    const w: Record<string, number> = {};
    for (const L of LEGS) {
      const type = L.startsWith('fore') ? 'fore' : 'hind', side = L.endsWith('N') ? 'N' : 'F';
      const u = k.bones[`${type}Upper${side}`]!, l = k.bones[`${type}Lower${side}`]!;
      const mu = clip.lengths[`${type}Upper`]!, ml = clip.lengths[`${type}Lower`]!;
      const [top, , fet, hoof] = HJ[L] as [P2, P2, P2, P2];
      const s2 = -top[1] / (mu + ml);
      const end: P2 = [top[0] + s2 * (mu * sinD(u) + ml * sinD(l)), top[1] + dy + s2 * (mu * cosD(u) + ml * cosD(l))];
      const down = k.hooves[HOOF_CODE[L]] ?? false;
      const hoofOff = sub(hoof, fet);
      const fx = end[0] - hoofOff[0];
      let fy = end[1] - hoofOff[1];
      if (down) fy = fet[1];
      else fy = Math.min(fy, fet[1]);
      t[`${L}Target`] = [Math.round((fx - fet[0]) * amp * 100) / 100, Math.round((fy - fet[1]) * 100) / 100];
      w[`${L}Hoof`] = down ? hoofRest(L) : Math.round(l - (type === 'fore' ? 40 : 25));
    }
    const pitch = wrap(k.bones.barrel! - ref.barrel) * (o.pitch ?? 1);
    const dw = {
      horseBody: Math.round(pitch * 10) / 10,
      horseNeck: Math.round((wrap(k.bones.neck! - ref.neck) * (o.neck ?? 1) - pitch * 0.6) * 10) / 10,
      horseHead: Math.round(wrap(k.bones.head! - ref.head) * 10) / 10,
      tail: Math.round((wrap(k.bones.tail! - ref.tail) + (o.tail ?? 0)) * 10) / 10,
    };
    return { f: k.f, ...(k.c ? { c: k.c as KP['c'] } : {}), t, w, dw };
  });
  return { keys, bob };
}

/** Rider tracks over a gait: the hips follow the saddle a frame late (absorbing), the head level, the weapon carried. */
function riderGait(bob: Track, n: number, s: HorseSpec, run: boolean): Author {
  return (rw) => {
    const lagged: [number, number][] = [];
    for (let f = 0; f <= n; f++) {
      const now = atT(bob, f), was = atT(bob, f - 1 < 0 ? f - 1 + n : f - 1);
      lagged.push([f, Math.round((was - now) * 0.6 * 100) / 100]);
    }
    const w: Record<string, Track> = { head: T([0, rw.head! - (run ? 6 : 0)]) };
    // The rider sits plumb whatever the barrel's pitch (Plate 626: the horse moves under him), so the
    // tall things he carries do not swing at the top of the sprite.
    const dw: Record<string, Track> = run ? { pelvis: T([0, 0]), spine: T([0, -12]) } : { pelvis: T([0, 0]) };
    // At the charge: the yari couched level over the neck; the katana raised high; the bow held.
    if (run && s.ride === 'couch') Object.assign(w, { upperArmN: T([0, -10]), forearmN: T([0, 76]), weapon: T([0, s.charge]) });
    else if (run && s.ride === 'cut') Object.assign(w, { upperArmN: T([0, 150]), forearmN: T([0, 175]), weapon: T([0, s.charge]) });
    return { w, dw, tAdd: { pelvis: [T([0, 0]), lagged] } };
  };
}

/**
 * The mounted yari thrust (weapon-attacks.md S6; bajutsu): the reins in the far hand, the yari in
 * the near hand with its butt anchored at the hip. 1-3 the spear comes down from the upright carry,
 * level, and is drawn back to the hip (the chamber); 4-5 the arm drives it straight out along its
 * own line as the rider leans in over the neck, the point travelling level (no swing); 6 held at
 * full reach; 7-9 withdrawn to the hip; 10-11 back up to the carry.
 */
const MOUNTED_THRUST: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 10], [2, -25], [3, -30], [4, 30], [5, 62], [6, 62], [7, 30], [8, -10], [9, -12], [10, 20]),
    forearmN: R(rw.forearmN!, 11, [1, 80], [2, 70], [3, 66], [4, 86], [5, 92], [6, 92], [7, 84], [8, 76], [9, 76], [10, 120]),
    weapon: R(rw.weapon!, 11, [1, 112], [2, 97], [3, 97], [4, 95], [5, 94], [6, 94], [7, 96], [8, 97], [9, 100], [10, 150]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, 4], [3, 6], [4, -12], [5, -22], [6, -22], [8, -8], [11, 0]), upperArmF: T([0, 0], [4, 10], [6, 10], [9, 0]) },
});
/**
 * The yari's second blow from the saddle: an overhand stab down at a man on foot. The spear is
 * lifted over the head, point forward and down (1-3), then driven down past the horse's shoulder
 * as the rider leans out (5-6), held, and drawn back up to the carry (8-11).
 */
const MOUNTED_DOWN: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 100], [2, 150], [3, 160], [4, 150], [5, 112], [6, 100], [7, 100], [9, 60], [10, 40]),
    forearmN: R(rw.forearmN!, 11, [1, 140], [2, 170], [3, 175], [4, 150], [5, 96], [6, 80], [7, 82], [9, 90], [10, 120]),
    weapon: R(rw.weapon!, 11, [1, 124], [2, 82], [3, 72], [4, 68], [5, 54], [6, 48], [7, 50], [9, 80], [10, 140]),
    head: T([0, rw.head!], [5, rw.head! - 8], [7, rw.head! - 8], [9, rw.head!]),
  },
  dw: { spine: T([0, 0], [3, 6], [5, -18], [6, -24], [8, -20], [10, -4], [11, 0]) },
});
/** The cut from the saddle at the charge: the katana high over the near shoulder, the rider leaning out over the neck, the blade falling down the horse's near side, held, back up. */
const SADDLE_CUT: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 172], [3, 176], [4, 160], [5, 115], [6, 70], [7, 48], [8, 46], [10, 120]),
    forearmN: R(rw.forearmN!, 11, [2, 212], [3, 216], [4, 180], [5, 110], [6, 55], [7, 30], [8, 28], [10, 150]),
    weapon: R(rw.weapon!, 11, [2, 236], [3, 244], [4, 205], [5, 120], [6, 60], [7, 34], [8, 32], [10, 120]),
    head: T([0, rw.head!], [3, rw.head! + 4], [6, rw.head! - 12], [8, rw.head! - 12], [10, rw.head!]),
  },
  dw: { spine: T([0, 0], [2, 8], [3, 10], [4, 2], [5, -12], [6, -24], [8, -24], [10, -6], [11, 0]) },
  tAdd: { chest: [T([0, 0], [3, -0.35], [6, 0.35], [8, 0.35], [11, 0]), T([0, 0])] },
});
/**
 * Kiri-age from the saddle (the hatamoto's second blow), a rising cut of about 160°: the point is
 * dropped (1) and the blade let fall back low along the horse's near flank, hand at the hip, the
 * rider stooping out over the near side (2-4: low and back, under the horo, never over the
 * shoulder); then it rises forward and up past the horse's shoulder in one arc (5-6), the rider
 * straightening into it, and ends high and forward (7), held (8), back to the raised carry. The
 * arm never swings over the top, so the horo never hides it. One-handed: the far hand keeps the reins.
 */
const SADDLE_RISE: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 70], [2, 8], [3, -22], [4, -26], [5, 14], [6, 70], [7, 118], [8, 122], [10, 140]),
    forearmN: R(rw.forearmN!, 11, [1, 52], [2, -4], [3, -22], [4, -26], [5, 30], [6, 92], [7, 130], [8, 134], [10, 160]),
    weapon: R(rw.weapon!, 11, [1, 14], [2, -18], [3, -34], [4, -38], [5, 40], [6, 96], [7, 124], [8, 128], [10, 150]),
    head: T([0, rw.head!], [3, rw.head! - 10], [4, rw.head! - 10], [6, rw.head!], [7, rw.head! + 4], [8, rw.head! + 4], [10, rw.head!]),
  },
  dw: { spine: T([0, 0], [1, -4], [3, -16], [4, -18], [5, -10], [6, -2], [7, 6], [8, 6], [10, 0], [11, 0]) },
});
/** Tsuki from the saddle (the third blow): the raised blade brought level and driven straight forward over the horse's neck as the rider leans in; held; back up. */
const SADDLE_THRUST: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [1, 120], [2, 40], [3, 20], [4, 70], [5, 86], [6, 86], [8, 60], [10, 120]),
    forearmN: R(rw.forearmN!, 11, [1, 130], [2, 80], [3, 70], [4, 90], [5, 94], [6, 94], [8, 90], [10, 150]),
    weapon: R(rw.weapon!, 11, [1, 130], [2, 96], [3, 94], [4, 92], [5, 92], [6, 92], [8, 100], [10, 140]),
    head: T([0, rw.head!]),
  },
  dw: { spine: T([0, 0], [3, 4], [4, -14], [5, -20], [6, -20], [8, -8], [11, 0]) },
});
/** Yabusame's shot at the gallop: the bow raised over the head, drawn to the ear while lowered, loosed with the hand flying back, held; the next arrow from the ebira. */
const YABUSAME: Author = (rw, f) => KYUDO(rw, f);

/** The horse standing: hooves down, it breathes, the tail swishes, the head nods. */
function standKeys(n: number, skel: SkeletonData, extra?: Author): (f: Facing) => KP[] {
  return (f) => {
    const keys: KP[] = [];
    for (let i = 0; i <= n; i++) keys.push({ f: i, t: Object.fromEntries(LEGS.map((L) => [`${L}Target`, [0, 0] as P2])), w: Object.fromEntries(LEGS.map((L) => [`${L}Hoof`, hoofRest(L)])) });
    const base: Tracks = {
      tAdd: { horseBody: [T([0, 0]), T([0, 0], [n * 0.5, 0.12], [n, 0])] },
      dw: { horseNeck: T([0, 0], [n * 0.4, -3], [n * 0.7, 0]), tail: T([0, 0], [n * 0.25, 9], [n * 0.5, 0], [n * 0.75, -5], [n, 0]) },
    };
    const k1 = overlayKeys(keys, base);
    return extra ? overlayKeys(k1, extra(restWorld(skel, f), f)) : k1;
  };
}

function horseClips(skel: SkeletonData, s: HorseSpec, m: SMounted, blowsOut?: Clip[]): ClipSet {
  // The mane trails the neck, streams back at the gallop; the sashimono and horo trail the trunk.
  const trail = (run: number, fall = false): LagSpec[] => [
    { bone: 'mane', follow: 'horseNeck', k: 0.6, lag: 1.5, bias: -28 * run, ...(run >= 1 ? { wave: [5, 2, 0.15] as [number, number, number] } : {}) },
    { bone: 'skirtN', follow: 'thighN', k: 0.3, lag: 1.5, plumb: 0.5, bias: -6 * run },
    { bone: 'skirtF', follow: 'thighF', k: 0.3, lag: 1.5, plumb: 0.5, bias: -6 * run },
    { bone: 'sodeN', follow: 'upperArmN', k: 0.35, lag: 1, plumb: 0.35 },
    { bone: 'sodeF', follow: 'upperArmF', k: 0.2, lag: 1, plumb: 0.55 },
    fall ? { bone: 'banner', follow: 'chest', k: 1, lag: 1, plumb: 0 } : { bone: 'banner', follow: 'chest', k: run >= 1 ? 0.9 : 0.6, lag: 1.5, bias: run >= 1 ? 14 : 0, plumb: 0.25, ...(run >= 1 ? { wave: [7, 2, 0] as [number, number, number] } : {}) },
    fall ? { bone: 'horo', follow: 'chest', k: 1, lag: 1, plumb: 0 } : { bone: 'horo', follow: 'chest', k: 0.6, lag: 2, bias: run >= 1 ? 8 : 0, plumb: 0.3, ...(run >= 1 ? { wave: [5, 2, 0.25] as [number, number, number] } : {}) },
  ];
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => KP[], ev: AnimEvent[] = [], run = 0): Clip =>
    lagCloth(skel, facingClip(skel, name, n, loop, keys, ev), n, loop, trail(run, name === 'die' || name === 'dead'));
  const breath = (c: Clip, alpha = 1): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', AnimationData> };
    return { byFacing: { se: [{ anim: b.byFacing.se }, { anim: BREATH, alpha }], ne: [{ anim: b.byFacing.ne }, { anim: BREATH, alpha }] } };
  };
  // The horo balloons as the horse gallops (its frame's bone stretched back, fluttering).
  const billow = (c: Clip, n: number, amt: number): Clip =>
    mapFacings(c, (a) => {
      const keys = [];
      for (let f = 0; f <= n; f++) keys.push({ f, v: Math.round((1 + amt * (0.85 + 0.15 * Math.sin((2 * Math.PI * 2 * f) / n))) * 100) / 100 });
      return { ...a, bones: { ...(a.bones ?? {}), horo: { ...(a.bones?.horo ?? {}), scaleY: keys } } };
    });
  const horo = s.backBone === 'horo';
  const gait = (name: string, run: boolean) => (f: Facing) => {
    const g = gaitKeys(name, f, run ? { pitch: 2.2, neck: 1.4, tail: -50 } : { pitch: 1.5, neck: 1.2, tail: -6 });
    return overlayKeys(g.keys, riderGait(g.bob, 12, s, run)(restWorld(skel, f), f));
  };
  const idle = breath(fc('idle', 8, true, standKeys(8, skel), s.shoot ? [{ f: 0, name: 'nocked', len: 9 }] : []));
  let walk = fc('walk', 12, true, gait('horse-walk', false), [{ f: 0, name: 'step' }, { f: 3, name: 'step' }, { f: 6, name: 'step' }, { f: 9, name: 'step' }], 0.3);
  let run = fc('run', 12, true, gait('horse-gallop', true), [{ f: 3, name: 'step' }, { f: 5, name: 'step' }, { f: 6, name: 'step' }, { f: 10, name: 'step' }], 1);
  if (horo) {
    walk = billow(walk, 12, 0.08);
    run = billow(run, 12, 0.35);
  }
  // Attacks at the charge: the gallop under the rider's blow, the horse driving into it (nose
  // down, a surge forward) and the rider leaning in.
  const drive: Author = () => ({ dw: { horseBody: T([0, 0], [4, -4], [5, -10], [6, 4], [8, 0]), horseNeck: T([0, 0], [5, 8], [7, -4], [9, 0]) }, tAdd: { horseBody: [T([0, 0], [4, 0.3], [5, 0.7], [7, 0.4], [11, 0]), T([0, 0])] } });
  const galloping = (author: Author, extra: Author = drive) => (f: Facing) => {
    const g = gaitKeys('horse-gallop', f, { pitch: 2.2, neck: 1.4, tail: -50 });
    const rw = restWorld(skel, f);
    return overlayKeys(overlayKeys(g.keys, extra(rw, f), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), author(rw, f));
  };
  // The blows at the gallop (README "Several blows"), blow 0 first.
  const riding: { a: Author; ev: AnimEvent[] }[] =
    s.ride === 'couch'
      ? [
          { a: MOUNTED_THRUST, ev: [{ f: 5, name: 'strike' }] },
          { a: MOUNTED_DOWN, ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 6, name: 'strike' }] },
        ]
      : s.ride === 'cut'
        ? [
            { a: SADDLE_CUT, ev: [{ f: 5, name: 'smear', len: 2, bone: 'weapon' }, { f: 7, name: 'strike' }] },
            { a: SADDLE_RISE, ev: [{ f: 5, name: 'smear', len: 2, bone: 'weapon' }, { f: 6, name: 'strike' }] },
            { a: SADDLE_THRUST, ev: [{ f: 5, name: 'strike' }] },
          ]
        : [];
  const blowClip = (b: { a: Author; ev: AnimEvent[] }): Clip => {
    const c = fc('attack', 12, false, galloping(b.a), b.ev, 1);
    return horo ? billow(c, 12, 0.35) : c;
  };
  const attack: Clip = riding.length ? blowClip(riding[0]!) : fc('attack', 12, false, (f) => overlayKeys(standKeys(11, skel)(f), PUNCH(restWorld(skel, f), f)), [{ f: 5, name: 'strike' }]);
  if (blowsOut && riding.length > 1) blowsOut.push(attack, ...riding.slice(1).map(blowClip));
  // Yabusame: the shot at the gallop.
  const shoot = s.shoot === 'kyudo'
    ? fc('shoot', 12, false, galloping(YABUSAME, () => ({})), [{ f: 0, name: 'nocked', len: 1 }, { f: 1, name: 'draw', len: 6 }, { f: 7, name: 'release' }], 1)
    : attack;
  // Struck: the horse shies (head up, a half-step back), the rider snaps back; a flash.
  const shy: Author = () => ({ dw: { horseNeck: T([0, 14], [1, 20], [2, 10], [4, 0]), horseBody: T([0, 3], [1, 5], [2, 2], [4, 0]), horseHead: T([0, 8], [1, 10], [4, 0]) }, tAdd: { horseBody: [T([0, -0.3], [1, -0.5], [2, -0.3], [4, 0]), T([0, 0])] } });
  const riderHit: Author = (rw, f) => ({ dw: HIT(rw, f).dw });
  const hit = fc('hit', 5, false, (f) => overlayKeys(overlayKeys(standKeys(4, skel, shy)(f), riderHit(restWorld(skel, f), f)), {}, [1, 2, 3]), []);
  const drops: Drop[] = m.gear.near?.draw ? [{ holder: 'weapon', bone: 'dropW', slot: 'weaponDrop', from: 'weapon', at: 3, land: { x: -7.0, y: -0.25, rot: 270 - s.nearDeg, f: 7 } }] : [];
  if (m.gear.far?.draw) drops.push({ holder: 'itemF', bone: 'dropF', slot: 'farDrop', from: 'farItem', at: 3, land: { x: 9.0, y: -0.3, rot: 90 - (s.farDeg ?? 180), f: 7 } });
  const die = addDrops(skel, fc('die', 12, false, (f) => dieKeys(f), [{ f: 8, name: 'land' }]), 12, drops);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  // Brace: the horse standing to receive, the rider's weapon levelled as for his foot cousin.
  const braceA: Author = (rw, f) => ({
    dw: { horseNeck: T([0, 6]), horseHead: T([0, -4]), spine: T([0, -6]) },
    w: (s.ride === 'couch' ? { upperArmN: T([0, -10]), forearmN: T([0, 76]), weapon: T([0, s.charge]) } : s.ride === 'cut' ? { upperArmN: T([0, 40]), forearmN: T([0, 100]), weapon: T([0, 120]) } : { upperArmN: T([0, rw.upperArmN! + 10]) }) as Record<string, Track>,
    ...(void BRACE, void f, {}),
  });
  const brace = breath(fc('brace', 8, true, standKeys(8, skel, braceA)), 0.6);
  return { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Shoot]: shoot, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };

  /**
   * The horse goes down: the forelegs buckle first and it drops onto its knees, nose down; then the
   * hind legs fold and the barrel comes to the ground, the neck stretches out and the head lands
   * last. The rider is pitched back over the cantle with his arms flung up, and lies across it.
   */
  function dieKeys(f: Facing): KP[] {
    const off = Object.fromEntries(LEGS.map((L) => [`${L}IK`, 0]));
    const on = Object.fromEntries(LEGS.map((L) => [`${L}IK`, 1]));
    const planted = { t: Object.fromEntries(LEGS.map((L) => [`${L}Target`, [0, 0] as P2])) };
    const fold = (fu: number, fl: number, hu: number, hl: number) => ({ foreFUpper: fu, foreNUpper: fu - 4, foreFLower: fl, foreNLower: fl + 6, hindFUpper: hu, hindNUpper: hu - 4, hindFLower: hl, hindNLower: hl + 6 });
    void f;
    return [
      { f: 0, c: EASE, ik: on, ...planted, dw: { horseNeck: 14, horseHead: 8, spine: 14, head: 16, upperArmN: 30, upperArmF: 20 } },
      { f: 2, c: EASE, ik: off, t: { horseBody: [0.3, 1.4] }, dl: fold(28, -95, 4, -10), dw: { horseBody: -9, horseNeck: 6, spine: 16, head: 18 }, w: { upperArmN: 140, forearmN: 160, upperArmF: 110 } },
      { f: 5, c: EASE, ik: off, t: { horseBody: [0.6, 3.6] }, dl: fold(40, -120, 24, -48), dw: { horseBody: -12, horseNeck: -12, horseHead: -8, tail: 10, spine: 30, head: 10 }, w: { upperArmN: 175, forearmN: 190, upperArmF: 150 } },
      { f: 8, c: EASE, ik: off, t: { horseBody: [0.7, 5.1], pelvis: [-0.6, 0.4] }, dl: fold(52, -135, 52, -105), dw: { horseBody: -4, horseNeck: -36, horseHead: -22, tail: -18, spine: 56, chest: 10, head: 6 }, w: { upperArmN: 205, forearmN: 220, upperArmF: 190 } },
      { f: 9, c: EASE, ik: off, t: { horseBody: [0.7, 4.9], pelvis: [-0.7, 0.5] }, dl: fold(54, -137, 54, -108), dw: { horseBody: -3, horseNeck: -40, horseHead: -24, tail: -20, spine: 60, chest: 12, head: 8 }, w: { upperArmN: 210, forearmN: 225, upperArmF: 196 } },
      { f: 11, ik: off, t: { horseBody: [0.7, 5.25], pelvis: [-0.8, 0.6] }, dl: fold(55, -138, 55, -110), dw: { horseBody: -2, horseNeck: -52, horseHead: -30, tail: -22, spine: 66, chest: 14, head: 12 }, w: { upperArmN: 214, forearmN: 230, upperArmF: 200 } },
    ] as unknown as KP[];
  }
}

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
export function horseRig(kind: number): SkeletonRig | undefined {
  const got = RIGS.get(kind);
  if (got) return got;
  const m = MOUNTED[kind], s = HORSE_SPECS[kind];
  if (!m || !s) return undefined;
  const skel = horseSkel(kind, m, s);
  const blows: Clip[] = [];
  const rig: SkeletonRig = { skel, atts: horseParts(kind, m, s), clips: horseClips(skel, s, m, blows), ...(blows.length > 1 ? { attacks: blows } : {}) };
  RIGS.set(kind, rig);
  return rig;
}

/** Registers the mounted kinds drawn on bones (samurai.ts calls this after its own registrations, so these win). */
export function registerHorseRigs(kinds: readonly number[]): void {
  for (const k of kinds) {
    const rig = horseRig(k);
    if (rig) registerPaperKind('samurai', k, samuraiKind(rig));
  }
}

void KESA;
void add;
void (null as unknown as Paper);
