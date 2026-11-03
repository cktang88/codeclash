// The Hollow Host's mounted kinds on bones (Black Riders, Barrow Horse Archers, Death Knights),
// rebuilt from the approved key art (undead-static.ts MountArt).
//
// The skeletal horse is the key art's parametric horse (undead-parts.ts horseFrame and the leg,
// body and neck drawings), now driven by bones: the barrel, neck, head and tail, and each leg an
// upper and a lower bone reaching for its fetlock by IK, so a hoof the Muybridge plate shows down
// is planted on the ground line. Each frame the horse is drawn whole from the angles its bones
// have (`horseLegsOf`). The rider's pieces ride a man's bones on a saddle bone, as the foot
// figures' do; his hips follow the saddle a frame late and his head holds level.
//
// The dead horse moves like one: a broken-rhythm gallop (a stride that stops on a pose and
// lurches on), a mane of rotten shroud trailing. See docs/art-references/undead-animation.md.

import { Anim, COMMANDER_KIND } from '../contract.ts';
import { Paper, type P2 } from './core.ts';
import type { Facing } from './facing.ts';
import { along } from './rig.ts';
import {
  bonesFromJoints, EASE, restPose, smearPart,
  type AnimEvent, type AttachmentSet, type Clip, type DrawCtx, type JointDef, type Posed, type SkeletonData, type SkeletonRig, type SlotData,
} from './skeleton.ts';
import { at as atT, facingClip, lagCloth, lastFrame, mapFacings, overlayKeys, restWorld, addDrops, type ClipSet, type Drop, type KP, type LagSpec, type Track } from './templar-rig.ts';
import { HIT, R, T, type Author, type Tracks } from './templar-clips.ts';
import { FLASH, pieceAtt, registerLazy, trail } from './undead-foot.ts';
import { both, groundClamp, jerk } from './undead-clips.ts';
import { horseFrame, shadeLower, UM, type HorseLegs } from './undead-parts.ts';
import { keyLight } from './undead-static.ts';
import { seated, type MountArt, type PieceOpts, type UJ, type UPiece } from './undead-static.ts';
import { MOTION, type MotionKey } from './motion/index.ts';

void COMMANDER_KIND;

// ------------------------------------------------------------------ the spec of a mounted kind

export interface MountSpec {
  art: MountArt;
  /** The weapon's key-art angle in the near hand, and the item's in the far. */
  nearDeg: number;
  farDeg?: number;
  /** The jaw's hinge and chin from the seat, if the rider's skull has a jaw piece. */
  jaw?: { hinge: P2; chin: P2 };
  /** The blow from the saddle. */
  ride: 'thrust' | 'couch' | 'bow';
  /** The draw hand on the bowstring by IK. */
  nocked?: boolean;
  /** Rider's skull tilt (deg) and hunch. */
  tilt: number;
  hunch: number;
  /** Slots drawn first or last from behind. */
  neFirst?: string[];
  neLast?: string[];
  drops: { slot: string; holder: string; at: number; land: Drop['land'] }[];
  smear?: [number, number];
  /** How much of the figure is in the low shade at level 1. */
  shadeL1?: number;
}

// ------------------------------------------------------------------ the skeleton

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const P6 = (p: P2): P2 => [r6(p[0]), r6(p[1])];
const ang = (a: P2, b: P2): number => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
const LEGS = ['foreN', 'foreF', 'hindN', 'hindF'] as const;
type Leg = (typeof LEGS)[number];
const LEG_ANG: Record<Leg, [keyof HorseLegs, keyof HorseLegs]> = { foreN: ['fnu', 'fnl'], foreF: ['ffu', 'ffl'], hindN: ['hnu', 'hnl'], hindF: ['hfu', 'hfl'] };

/** A hind leg's hock and fetlock from its hip joint (horseLeg's geometry, unsnapped). */
function hindJoints(root: P2, up: number, lo: number): { hock: P2; fet: P2 } {
  const u = (p: P2, d: number, l: number): P2 => [p[0] + Math.sin((d * Math.PI) / 180) * l, p[1] + Math.cos((d * Math.PI) / 180) * l];
  const stifle = u(root, 30 + up * 0.5, 2.8);
  const hock = u(stifle, -28 + up, 3.0);
  return { hock, fet: u(hock, 4 + up * 0.4 - lo, 2.3) };
}
/** The hind `up` angle whose hip-to-hock line points at world angle `a` (inverse of hindJoints). */
const HIND_TABLE: [number, number][] = [];
for (let up = -140; up <= 140; up += 0.5) HIND_TABLE.push([ang([0, 0], hindJoints([0, 0], up, 0).hock), up]);
function hindUp(a: number): number {
  let best = 0, err = Infinity;
  for (const [x, up] of HIND_TABLE) {
    const d = Math.abs(((a - x + 540) % 360) - 180);
    if (d < err) {
      err = d;
      best = up;
    }
  }
  return best;
}

/** The horse's joints in a facing, from the key art's pose (a fine canvas so nothing snaps). */
function horseJoints(art: MountArt, back: boolean): Record<string, { from: P2; to: P2 }> {
  const c = new Paper();
  c.begin(1024, { w: 1, h: 1, footY: 0.5 });
  const p = art.pose();
  const H = horseFrame(c, p, back);
  const out: Record<string, { from: P2; to: P2 }> = {};
  const muzzle = along(H.poll, H.headDeg, 3.9 * 1.35);
  const tailRoot = H.P([-5.6, -1.6]);
  const mid: P2 = [(H.neckBase[0] + H.poll[0]) / 2, (H.neckBase[1] + H.poll[1]) / 2];
  out.horseBody = { from: H.pivot, to: H.P([4.5, 0]) };
  out.horseNeck = { from: H.neckBase, to: H.poll };
  out.horseHead = { from: H.poll, to: muzzle };
  out.tail = { from: tailRoot, to: along(tailRoot, -35 - p.tail, 1.4) };
  out.mane = { from: mid, to: add(mid, [0, 2]) };
  out.hcloth = { from: H.P([0, -2]), to: H.P([0, 0.8]) };
  for (const L of LEGS) {
    const [uk, lk] = LEG_ANG[L];
    const up = p[uk] as number, lo = p[lk] as number;
    if (L.startsWith('fore')) {
      const root = L === 'foreN' ? H.sj : H.sjF;
      const knee = along(root, up, 3.1);
      const fet = along(knee, up + lo, 2.2);
      out[`${L}Upper`] = { from: root, to: knee };
      out[`${L}Lower`] = { from: knee, to: fet };
      out[`${L}Target`] = { from: fet, to: fet };
    } else {
      const root = L === 'hindN' ? H.hj : H.hjF;
      const { hock, fet } = hindJoints(root, up, lo);
      out[`${L}Upper`] = { from: root, to: hock };
      out[`${L}Lower`] = { from: hock, to: fet };
      out[`${L}Target`] = { from: fet, to: fet };
    }
  }
  out.saddle = { from: H.seat, to: H.seat };
  for (const v of Object.values(out)) {
    v.from = P6(v.from);
    v.to = P6(v.to);
  }
  return out;
}

/** The rider's NE joints: shoulders and hips swap sides about the axis, arms move with their shoulder. */
function riderNE(R: UJ, axis: number): UJ {
  const mx = (p: P2): P2 => [r6(2 * axis - p[0]), p[1]];
  const out: UJ = { ...R };
  for (const n of ['hipN', 'hipF', 'kneeN', 'kneeF', 'ankN', 'ankF', 'shN', 'shF']) if (R[n]) out[n] = mx(R[n]!);
  for (const s of ['N', 'F'] as const) {
    const d = sub(out[`sh${s}`]!, R[`sh${s}`]!);
    for (const j of [`el${s}`, `h${s}`]) if (R[j]) out[j] = add(R[j]!, d);
  }
  return out;
}

function riderJoints(R: UJ, seat: P2, s: MountSpec): Record<string, { from: P2; to: P2 }> {
  const J = seated(R, seat);
  const pel = J.pelvis!, hN = J.hN!, hF = J.hF!;
  const waist: P2 = [pel[0] - 0.1, pel[1] - 1.7], mid: P2 = [pel[0] - 0.05, pel[1] - 3.3];
  const jaw = s.jaw ? { from: add(seat, s.jaw.hinge), to: add(seat, s.jaw.chin) } : { from: J.head!, to: add(J.head!, [0.6, 0.6]) };
  const out: Record<string, { from: P2; to: P2 }> = {
    pelvis: { from: pel, to: waist },
    spine: { from: waist, to: mid },
    chest: { from: mid, to: J.neck! },
    neck: { from: J.neck!, to: J.head! },
    head: { from: J.head!, to: add(J.head!, [0.1, -1.2]) },
    jaw,
    upperArmN: { from: J.shN!, to: J.elN! },
    forearmN: { from: J.elN!, to: hN },
    handN: { from: hN, to: along(hN, ang(J.elN!, hN), 0.5) },
    weapon: { from: hN, to: along(hN, s.nearDeg, 4) },
    grip2: { from: along(hN, s.nearDeg, 1.3), to: along(hN, s.nearDeg, 1.3) },
    upperArmF: { from: J.shF!, to: J.elF! },
    forearmF: { from: J.elF!, to: hF },
    handF: { from: hF, to: along(hF, ang(J.elF!, hF), 0.5) },
    itemF: { from: hF, to: along(hF, s.farDeg ?? 0, 3) },
    nock: { from: hN, to: hN },
    thighN: { from: J.hipN!, to: J.kneeN! },
    shinN: { from: J.kneeN!, to: J.ankN! },
    thighF: { from: J.hipF!, to: J.kneeF! },
    shinF: { from: J.kneeF!, to: J.ankF! },
    skirt: { from: add(pel, [0.2, -0.6]), to: add(pel, [0.2, 2.4]) },
    cloak: { from: add(J.neck!, [-0.2, 0.4]), to: add(J.neck!, [-0.2, 5.4]) },
  };
  for (const v of Object.values(out)) {
    v.from = P6(v.from);
    v.to = P6(v.to);
  }
  return out;
}

const RPARENT: Record<string, string> = {
  pelvis: 'saddle', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head',
  upperArmN: 'chest', forearmN: 'upperArmN', handN: 'forearmN', weapon: 'handN', grip2: 'weapon',
  upperArmF: 'chest', forearmF: 'upperArmF', handF: 'forearmF', itemF: 'handF', nock: 'itemF',
  thighN: 'pelvis', shinN: 'thighN', thighF: 'pelvis', shinF: 'thighF', skirt: 'pelvis', cloak: 'chest',
};
const HPARENT: Record<string, string> = {
  horseBody: 'root', horseNeck: 'horseBody', horseHead: 'horseNeck', tail: 'horseBody', mane: 'horseNeck', hcloth: 'horseBody', saddle: 'horseBody',
  foreNUpper: 'horseBody', foreNLower: 'foreNUpper', foreFUpper: 'horseBody', foreFLower: 'foreFUpper', hindNUpper: 'horseBody', hindNLower: 'hindNUpper', hindFUpper: 'horseBody', hindFLower: 'hindFUpper',
  foreNTarget: 'root', foreFTarget: 'root', hindNTarget: 'root', hindFTarget: 'root',
};
const EXTRA: Record<string, string> = { smear: 'weapon', light: 'root', flash: 'root' };

function mountSkel(name: string, s: MountSpec): SkeletonData {
  const art = s.art;
  const hse = horseJoints(art, false), hne = horseJoints(art, true);
  const rse = riderJoints(art.R, hse.saddle!.from, s), rne = riderJoints(riderNE(art.R, art.axis), hne.saddle!.from, s);
  const drops = (j: Record<string, { from: P2; to: P2 }>) => Object.fromEntries(s.drops.map((d) => [`drop_${d.slot}`, { ...j[d.holder]! }]));
  const se = { root: { from: [0, 0] as P2, to: [0, 0] as P2 }, ...hse, ...rse, ...drops({ ...hse, ...rse }) };
  const ne = { root: { from: [0, 0] as P2, to: [0, 0] as P2 }, ...hne, ...rne, ...drops({ ...hne, ...rne }) };
  const defs: JointDef[] = Object.keys(se).map((n) => {
    const a = se[n as keyof typeof se]!, b = ne[n as keyof typeof ne]!;
    const d: JointDef = { name: n, from: a.from, to: a.to };
    const p = n.startsWith('drop_') ? 'root' : HPARENT[n] ?? RPARENT[n];
    if (p) d.parent = p;
    if (b.from[0] !== a.from[0] || b.from[1] !== a.from[1] || b.to[0] !== a.to[0] || b.to[1] !== a.to[1]) d.facing = { ne: { from: b.from, to: b.to } };
    return d;
  });
  const pieces = art.pieces.map((p) => p.slot);
  const dropSlots = s.drops.map((d) => `${d.slot}Drop`);
  const se0 = [...pieces, ...dropSlots, 'smear', 'light', 'flash'];
  // From behind: the far side of horse and rider first, then the rest as from the front, what is on the back last.
  const first = s.neFirst ?? [], last = s.neLast ?? [];
  const mid0 = pieces.filter((n) => !first.includes(n) && !last.includes(n));
  const ne0 = [...first.filter((n) => pieces.includes(n)), ...mid0, ...last.filter((n) => pieces.includes(n)), ...dropSlots, 'smear', 'light', 'flash'];
  const bone = new Map(art.pieces.map((p) => [p.slot, p.bone] as const));
  const slots: SlotData[] = se0.map((n) =>
    dropSlots.includes(n) ? { name: n, bone: `drop_${n.slice(0, -4)}`, attachment: { all: null } } : EXTRA[n] ? { name: n, bone: EXTRA[n]!, attachment: { all: n } } : { name: n, bone: bone.get(n)!, attachment: { all: n } },
  );
  return {
    name: `undead-mount-${name}`,
    body: 'horse',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: { se: se0, ne: ne0 },
    ik: [
      ...LEGS.map((L) => ({ name: `${L}IK`, bones: [`${L}Upper`, `${L}Lower`] as [string, string], target: `${L}Target`, bend: (L.startsWith('fore') ? 1 : -1) as 1 | -1, mix: 1, ground: hse[`${L}Target`]!.from[1] })),
      { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: -1, mix: 0 },
      { name: 'armN2h', bones: ['upperArmN', 'forearmN'], target: 'nock', bend: -1, mix: s.nocked ? 1 : 0 },
    ],
  };
}

// ------------------------------------------------------------------ the parts

/** The horse's pose from the bones as they are now (the angles the parametric horse is drawn from). */
export function horseLegsOf(p: Posed, rest: HorseLegs): HorseLegs {
  const b = p.byName;
  const a = (n: string) => b[n]!.a;
  const pitch = a('horseBody') - 90;
  const out: HorseLegs = { ...rest, px: b.horseBody!.x, py: b.horseBody!.y + 9, tilt: 0, pitch };
  out.neck = 180 - a('horseNeck') - pitch;
  out.nod = a('horseHead') - 58 + pitch;
  out.tail = -35 - a('tail');
  out.fnu = a('foreNUpper');
  out.fnl = a('foreNLower') - out.fnu;
  out.ffu = a('foreFUpper');
  out.ffl = a('foreFLower') - out.ffu;
  out.hnu = hindUp(a('hindNUpper'));
  out.hnl = 4 + out.hnu * 0.4 - a('hindNLower');
  out.hfu = hindUp(a('hindFUpper'));
  out.hfl = 4 + out.hfu * 0.4 - a('hindFLower');
  out.sway = Math.max(-1.5, Math.min(1.5, Math.round((trail(p, 'mane') / 18) * 4) / 4));
  return out;
}

function mountParts(s: MountSpec): AttachmentSet {
  const art = s.art;
  const cv = new Paper();
  cv.begin(1024, { w: 1, h: 1, footY: 0.5 });
  const seatOf = (back: boolean) => horseFrame(cv, art.pose(), back).seat;
  const J: Record<Facing, UJ> = { se: seated(art.R, seatOf(false)), ne: seated(riderNE(art.R, art.axis), seatOf(true)), sw: {}, nw: {} };
  J.sw = J.se;
  J.nw = J.ne;
  const atts: AttachmentSet = {};
  const horseLive = (ctx: DrawCtx): PieceOpts => {
    const jawOpen = ctx.events.find((e) => e.name === 'neigh')?.int ?? 0;
    return { horse: horseLegsOf(ctx.posed, art.pose()), t: jawOpen };
  };
  for (const p of art.pieces) {
    const piece: UPiece = p.slot.startsWith('h') && ['hFar', 'hBody', 'hNear'].includes(p.slot) ? { ...p, live: horseLive } : p;
    if (piece.live && ['hFar', 'hBody', 'hNear'].includes(p.slot)) {
      // The horse is drawn whole, where its bones put it (no part map).
      atts[p.slot] = { cache: false, draw: (c, _x, ctx) => piece.draw(c, J[ctx.posed.facing], ctx.posed.facing === 'ne', horseLive(ctx)) };
      continue;
    }
    atts[p.slot] = pieceAtt(piece, J, art.axis);
  }
  for (const d of s.drops) {
    const p = art.pieces.find((q) => q.slot === d.slot)!;
    atts[`${d.slot}Drop`] = pieceAtt({ ...p, bone: `drop_${d.slot}`, cloth: false, live: undefined }, J, art.axis);
  }
  atts.flash = FLASH;
  // The light from above: the horse's legs and belly in shade (as the pose rig's horses were), then the key light.
  atts.light = { cache: false, draw: (c) => { keyLight(c); shadeLower(c, c.L <= 1 ? s.shadeL1 ?? 0.3 : 0.42); } };
  if (s.smear) atts.smear = smearPart('weapon', s.smear[0], s.smear[1], UM.steel);
  return atts;
}

// ------------------------------------------------------------------ the clips

const wrap = (d: number) => d - 360 * Math.floor(d / 360 + 0.5);
const sinD = (d: number) => Math.sin((d * Math.PI) / 180), cosD = (d: number) => Math.cos((d * Math.PI) / 180);
const HOOF: Record<Leg, string> = { foreN: 'FN', foreF: 'FF', hindN: 'HN', hindF: 'HF' };

/**
 * Keys from a Muybridge gait (motion/horse-*.json), after templar-horse.ts: the barrel's pitch and
 * bob and the neck's and head's nod as turns from the stride's mean; each fetlock's target from
 * the plate's leg angles scaled to our horse, pressed onto the ground while the plate shows that
 * hoof down (IK then plants it), held at or above the ground while it is up.
 */
function gaitKeys(skel: SkeletonData, name: string, facing: Facing, o: { pitch: number; neck: number; head: number; tail: number }): { keys: KP[]; bob: Track } {
  const clip = MOTION[name]!;
  const ks = clip.facings[facing === 'ne' ? 'ne' : 'se'].keys as (MotionKey & { hooves: Record<string, boolean> })[];
  const mean = (b: string) => ks.reduce((s0, k) => s0 + wrap(k.bones[b]! - ks[0]!.bones[b]!), 0) / ks.length + ks[0]!.bones[b]!;
  const ref = { barrel: mean('barrel'), neck: mean('neck'), head: mean('head'), tail: mean('tail') };
  const rest = restPose(skel, 64, facing);
  const body = rest.byName.horseBody!;
  const sc = -body.y / (clip.restHip ?? 8.6);
  const meanH = ks.reduce((s0, k) => s0 + k.height, 0) / ks.length;
  const bob: [number, number][] = [];
  const keys = ks.map((k): KP => {
    const dy = (meanH - k.height) * sc;
    bob.push([k.f, dy]);
    const t: Record<string, P2> = { horseBody: [0, Math.round(dy * 100) / 100] };
    for (const L of LEGS) {
      const type = L.startsWith('fore') ? 'fore' : 'hind', side = L.endsWith('N') ? 'N' : 'F';
      const u = k.bones[`${type}Upper${side}`]!, l = k.bones[`${type}Lower${side}`]!;
      const mu = clip.lengths[`${type}Upper`]!, ml = clip.lengths[`${type}Lower`]!;
      const top = rest.byName[`${L}Upper`]!, fet = rest.byName[`${L}Target`]!;
      const reach = fet.y - top.y; // our leg's rest drop from its root to the fetlock
      const s2 = reach / (mu + ml);
      const end: P2 = [top.x + s2 * (mu * sinD(u) + ml * sinD(l)), top.y + dy + s2 * (mu * cosD(u) + ml * cosD(l))];
      let fy = Math.min(end[1], fet.y);
      if (k.hooves[HOOF[L]]) fy = fet.y;
      t[`${L}Target`] = [Math.round((end[0] - fet.x) * 100) / 100, Math.round((fy - fet.y) * 100) / 100];
    }
    const pitch = wrap(k.bones.barrel! - ref.barrel) * o.pitch;
    return {
      f: k.f,
      ...(k.c ? { c: k.c as KP['c'] } : {}),
      t,
      dw: {
        horseBody: Math.round(pitch * 10) / 10,
        horseNeck: Math.round((wrap(k.bones.neck! - ref.neck) * o.neck - pitch * 0.6) * 10) / 10,
        horseHead: Math.round(wrap(k.bones.head! - ref.head) * o.head * 10) / 10,
        tail: Math.round((wrap(k.bones.tail! - ref.tail) * 0.5 + o.tail) * 10) / 10,
      },
    };
  });
  return { keys, bob };
}

/** The horse standing: hooves down, the barrel breathing, the tail swishing, the head nodding. */
function standKeys(n: number): KP[] {
  const keys: KP[] = [];
  for (let i = 0; i <= n; i++) keys.push({ f: i, t: Object.fromEntries(LEGS.map((L) => [`${L}Target`, [0, 0] as P2])) });
  return overlayKeys(keys, { tAdd: { horseBody: [T([0, 0]), T([0, 0], [n * 0.5, 0.12], [n, 0])] }, dw: { horseNeck: T([0, 0], [n * 0.4, -3], [n * 0.7, 0]), tail: T([0, 0], [n * 0.25, 9], [n * 0.5, 0], [n * 0.75, -5], [n, 0]) } });
}

/** The rider over a gait: his hips follow the saddle a frame late (absorbing), the head level and at its odd tilt. */
function riderGait(bob: Track, n: number, s: MountSpec, run: boolean): Author {
  return (rw) => {
    const lagged: [number, number][] = [];
    for (let f = 0; f <= n; f++) {
      const now = atT(bob, f), was = atT(bob, f - 1 < 0 ? f - 1 + n : f - 1);
      lagged.push([f, Math.round((was - now) * 0.3 * 100) / 100]);
    }
    const w: Record<string, Track> = { head: T([0, rw.head! + s.tilt - (run ? 8 : 0)]) };
    const dw: Record<string, Track> = { spine: T([0, -s.hunch - (run ? 10 : 0)]), jaw: T([0, run ? -18 : -8]) };
    if (run && s.ride === 'couch') Object.assign(w, { upperArmN: T([0, -10]), forearmN: T([0, 80]), weapon: T([0, 96]) });
    if (run && s.ride === 'thrust') Object.assign(w, { upperArmN: T([0, -6]), forearmN: T([0, 78]), weapon: T([0, 100]) });
    return { w, dw, tAdd: { pelvis: [T([0, 0]), lagged] } };
  };
}

/** The couched-lance charge (Death Knights): the lance comes down from upright into the couch, the rider leans hard into it; at the impact the shaft takes the blow and he is driven back against the cantle, held, then settles. */
const COUCH: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, -10], [4, -4], [5, 0], [6, -26], [7, -24], [9, -10]),
    forearmN: R(rw.forearmN!, 11, [2, 78], [4, 84], [5, 88], [6, 70], [7, 72], [9, 78]),
    weapon: R(rw.weapon!, 11, [2, 96], [4, 100], [5, 106], [6, 92], [7, 94], [9, 96]),
  },
  dw: { spine: T([0, 0], [2, -12], [4, -26], [5, -30], [6, 10], [7, 12], [9, -2], [11, 0]), head: T([0, 0], [4, -8], [5, -10], [6, 8], [8, 0]), jaw: T([0, -8], [4, -4], [5, -34], [7, -34], [8, -6], [11, -8]) },
});
/** The spear driven down from the saddle at the charge (Black Riders): drawn back and up, then driven down-forward as the horse lunges, the rider leaning into it. */
const RIDE_THRUST: Author = (rw) => ({
  w: {
    upperArmN: R(rw.upperArmN!, 11, [2, 140], [3, 150], [5, 70], [6, 62], [8, 30]),
    forearmN: R(rw.forearmN!, 11, [2, 130], [3, 140], [5, 95], [6, 92], [8, 80]),
    weapon: R(rw.weapon!, 11, [2, 118], [3, 122], [5, 96], [6, 94], [8, 104]),
  },
  dw: { spine: T([0, 0], [3, 10], [5, -24], [6, -26], [8, -10], [11, 0]), head: T([0, 0], [3, 6], [5, -10], [7, -10], [10, 0]), jaw: T([0, -8], [3, -4], [5, -34], [6, -34], [8, -8]) },
});
/** The bow from the saddle (Barrow Horse Archers): raised to aim, the string back past the jaw, held, the loose, the hand flicked back, the next arrow. */
const RIDE_BOW: Author = (rw) => ({
  w: {
    upperArmF: R(rw.upperArmF!, 11, [2, 84], [6, 86], [7, 82], [9, 80]),
    forearmF: R(rw.forearmF!, 11, [2, 92], [6, 92], [7, 90], [9, 90]),
    itemF: R(rw.itemF!, 11, [2, 98], [6, 98], [7, 100], [9, 98]),
    upperArmN: T([0, rw.upperArmN!], [6, rw.upperArmN!], [7, -60], [9, -64], [10, rw.upperArmN!]),
    forearmN: T([0, rw.forearmN!], [6, rw.forearmN!], [7, 210], [9, 214], [10, rw.forearmN!]),
  },
  dw: { spine: T([0, 0], [2, 4], [6, 6], [7, 8], [9, 4], [11, 0]), jaw: T([0, -8], [5, -12], [7, -30], [8, -30], [10, -8]) },
  t: { nock: [T([0, 0]), T([0, 0], [2, 0.1], [3, -0.6], [4, -1.3], [5, -1.9], [6, -2.2], [6.5, -2.2], [7, 1.6], [9, 1.6], [10, 0.4], [11, 0])] },
  ik: { armN2h: T([0, 1], [6.5, 1], [7, 0], [9.5, 0], [10, 1]) },
});

function mountClips(skel: SkeletonData, s: MountSpec): ClipSet {
  const trailing = (run: number): LagSpec[] => [
    { bone: 'mane', follow: 'horseNeck', k: 0.6, lag: 2, bias: -24 * run, wave: [4 + 4 * run, 2, 0.15] },
    { bone: 'hcloth', follow: 'horseBody', k: 0.8, lag: 2, bias: -6 - 14 * run, plumb: 0.4, wave: [3 + 5 * run, 2, 0.3] },
    { bone: 'skirt', follow: 'pelvis', k: 0.6, lag: 2, bias: -8 * run, plumb: 0.5, wave: [3, 2, 0.1] },
    { bone: 'cloak', follow: 'chest', k: 0.6, lag: 2.5, bias: -20 * run, plumb: 0.5, wave: [3 + 4 * run, 2, 0.5] },
  ];
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => KP[], ev: AnimEvent[] = [], run = 0, warp?: number[]): Clip => {
    let c: Clip = facingClip(skel, name, n, loop, keys, ev);
    // The dead horse's broken rhythm: the whole stride stops on a pose for a frame and lurches on.
    if (warp) c = mapFacings(c, (a) => jerk(a, warp, new Set(skel.bones.map((b) => b.name))));
    return lagCloth(skel, c, n, loop, trailing(run));
  };
  const breath = (c: Clip): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', never> };
    const br = { anim: { name: 'breath', frames: 8, loop: true, bones: { chest: { translate: [{ f: 0, v: [0, 0] as [number, number], c: EASE }, { f: 4, v: [0, -0.13] as [number, number], c: EASE }] } } } };
    return { byFacing: { se: [{ anim: b.byFacing.se }, br], ne: [{ anim: b.byFacing.ne }, br] } };
  };
  const posture: Author = (rw) => ({ w: { head: T([0, rw.head! + s.tilt]) }, dw: { spine: T([0, -s.hunch]), jaw: T([0, -8]) } });
  const gait = (name: string, run: boolean) => (f: Facing) => {
    const g = gaitKeys(skel, name, f, run ? { pitch: 2.2, neck: 1.4, head: 1, tail: -30 } : { pitch: 1.0, neck: 0.7, head: 0.4, tail: -4 });
    return overlayKeys(g.keys, riderGait(g.bob, 12, s, run)(restWorld(skel, f), f));
  };
  const idle = breath(fc('idle', 8, true, (f) => overlayKeys(standKeys(8), posture(restWorld(skel, f), f))));
  const walk = fc('walk', 12, true, gait('horse-walk', false), [0, 3, 6, 9].map((k) => ({ f: k, name: 'step' })), 0.3);
  const run = fc('run', 12, true, gait('horse-gallop', true), [3, 5, 6, 10].map((k) => ({ f: k, name: 'step' })), 1, [0, 1, 2, 2, 4, 5, 6, 7, 7, 9, 10, 11]);
  // The strike at the charge: the gallop under it, the horse driving into the impact (nose down,
  // a surge forward) and the rider leaning hard in.
  const drive: Author = () => ({ dw: { horseBody: T([0, 0], [4, -4], [5, -10], [6, 4], [8, 0]), horseNeck: T([0, 0], [5, 8], [7, -4], [9, 0]) }, tAdd: { horseBody: [T([0, 0], [4, 0.3], [5, 0.7], [7, 0.4], [11, 0]), T([0, 0])] } });
  const strike = (a: Author, ev: AnimEvent[]) =>
    fc('attack', 12, false, (f) => {
      const g = gaitKeys(skel, 'horse-gallop', f, { pitch: 2.2, neck: 1.4, head: 1, tail: -30 });
      const rw = restWorld(skel, f);
      return overlayKeys(overlayKeys(g.keys, drive(rw, f), [1, 2, 3, 4, 6, 7, 8, 9, 10]), both(a, posture)(rw, f));
    }, ev, 1);
  const shot = fc('shoot', 12, false, (f) => overlayKeys(standKeys(11), both(RIDE_BOW, posture)(restWorld(skel, f), f), [6.5]), [{ f: 7, name: 'release' }, { f: 7, name: 'empty', len: 3 }]);
  const attack = s.ride === 'bow' ? shot : strike(s.ride === 'couch' ? COUCH : RIDE_THRUST, [{ f: 5, name: 'strike' }]);
  // Struck: the horse shies (head up, a half-step back, the jaw gaping), the rider snaps back; a flash.
  const shy: Author = () => ({ dw: { horseNeck: T([0, 14], [1, 20], [2, 10], [4, 0]), horseBody: T([0, 3], [1, 5], [2, 2], [4, 0]), horseHead: T([0, 8], [1, 10], [4, 0]) }, tAdd: { horseBody: [T([0, -0.3], [1, -0.5], [2, -0.3], [4, 0]), T([0, 0])] } });
  const riderHit: Author = (rw, f) => {
    const h = HIT(rw, f);
    return { dw: { ...h.dw, jaw: T([0, -28], [1, -30], [2, -6], [3, -14], [4, -8]), head: T([0, 22 + s.tilt], [1, 28 + s.tilt], [2, 14], [3, 4], [4, s.tilt]) } };
  };
  const hit = fc('hit', 5, false, (f) => overlayKeys(overlayKeys(standKeys(4), shy(restWorld(skel, f), f)), riderHit(restWorld(skel, f), f), [1, 2, 3]), [{ f: 0, name: 'neigh', len: 2, int: 1 }]);
  const drops: Drop[] = s.drops.map((d) => ({ holder: d.holder, bone: `drop_${d.slot}`, slot: `${d.slot}Drop`, from: d.slot, at: d.at, land: d.land }));
  // The folded legs never go through the ground: the barrel is held up on them.
  const legBones = (b: string) => /^(fore|hind)[NF](Upper|Lower)$/.test(b);
  const die = addDrops(skel, groundClamp(skel, fc('die', 12, false, (f) => dieKeys(f), [{ f: 8, name: 'land' }, { f: 1, name: 'neigh', len: 4, int: 1 }]), 12, 0.6, 'horseBody', legBones, 1), 12, drops);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  const braceA: Author = (rw) => ({
    dw: { horseNeck: T([0, -6]), horseHead: T([0, 4]), spine: T([0, -6 - s.hunch]) },
    w: (s.ride === 'bow' ? { head: T([0, rw.head! + s.tilt]) } : { upperArmN: T([0, -8]), forearmN: T([0, 78]), weapon: T([0, s.ride === 'couch' ? 96 : 100]), head: T([0, rw.head! + s.tilt]) }) as Record<string, Track>,
  });
  const brace = breath(fc('brace', 8, true, (f) => overlayKeys(standKeys(8), braceA(restWorld(skel, f), f))));
  const out: ClipSet = { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
  if (s.ride === 'bow') out[Anim.Shoot] = shot;
  return out;

  /**
   * The dead horse goes down: the forelegs buckle and it drops onto its knees, nose down; the hind
   * legs fold and the barrel comes to the ground, the neck stretched out, the head last. The rider
   * is pitched back over the cantle, arms flung up; then the riders' pieces come apart (drops).
   */
  function dieKeys(f: Facing): KP[] {
    const off = Object.fromEntries(LEGS.map((L) => [`${L}IK`, 0]));
    const on = Object.fromEntries(LEGS.map((L) => [`${L}IK`, 1]));
    const planted = { t: Object.fromEntries(LEGS.map((L) => [`${L}Target`, [0, 0] as P2])) };
    const fold = (fu: number, fl: number, hu: number, hl: number) => ({ foreFUpper: fu, foreNUpper: fu - 4, foreFLower: fl, foreNLower: fl + 6, hindFUpper: hu, hindNUpper: hu - 4, hindFLower: hl, hindNLower: hl + 6 });
    void restWorld(skel, f);
    return [
      { f: 0, c: EASE, ik: on, ...planted, dw: { horseNeck: 14, horseHead: 8, spine: 14, head: 16, upperArmN: 30, upperArmF: 20 } },
      { f: 2, c: EASE, ik: off, t: { horseBody: [0.3, 1.4] }, dl: fold(28, -95, 4, -10), dw: { horseBody: -9, horseNeck: 6, spine: 16, head: 18, jaw: -30 }, w: { upperArmN: 140, forearmN: 160, upperArmF: 110 } },
      { f: 5, c: EASE, ik: off, t: { horseBody: [0.6, 3.0] }, dl: fold(40, -120, 24, -48), dw: { horseBody: -12, horseNeck: -12, horseHead: -8, tail: 10, spine: 30, head: 10 }, w: { upperArmN: 175, forearmN: 190, upperArmF: 150 } },
      { f: 8, c: EASE, ik: off, t: { horseBody: [0.7, 4.2], pelvis: [-3.4, 3.6] }, dl: fold(52, -135, 52, -105), dw: { horseBody: -4, horseNeck: -36, horseHead: -22, tail: -18, pelvis: 60, spine: 30, chest: 10, head: 6 }, w: { upperArmN: 205, forearmN: 220, upperArmF: 190 } },
      { f: 9, c: EASE, ik: off, t: { horseBody: [0.7, 4.0], pelvis: [-3.7, 4.1] }, dl: fold(54, -137, 54, -108), dw: { horseBody: -3, horseNeck: -40, horseHead: -24, tail: -20, pelvis: 70, spine: 30, chest: 12, head: 8 }, w: { upperArmN: 210, forearmN: 225, upperArmF: 196 } },
      { f: 11, ik: off, t: { horseBody: [0.7, 4.3], pelvis: [-3.8, 4.3] }, dl: fold(55, -138, 55, -110), dw: { horseBody: -2, horseNeck: -52, horseHead: -30, tail: -22, pelvis: 74, spine: 30, chest: 14, head: 12 }, w: { upperArmN: 214, forearmN: 230, upperArmF: 200 } },
    ];
  }
}
void (null as unknown as Tracks);

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
export function mountRig(kind: number, s: MountSpec): SkeletonRig {
  const got = RIGS.get(kind);
  if (got) return got;
  const skel = mountSkel(String(kind), s);
  const rig: SkeletonRig = { skel, atts: mountParts(s), clips: mountClips(skel, s) };
  RIGS.set(kind, rig);
  return rig;
}
export function registerMount(kind: number, spec: () => MountSpec, shoots: boolean): void {
  registerLazy(kind, 'horse', () => mountRig(kind, spec()), shoots);
}
/** A key-art skull's jaw hinge and chin (keyJaw's frame), from its centre, radius and tilt. */
export function jawOf(at: P2, r: number, deg: number): { hinge: P2; chin: P2 } {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const R = (p: P2): P2 => [r6(at[0] + (p[0] * c - p[1] * s) * r), r6(at[1] + (p[0] * s + p[1] * c) * r)];
  return { hinge: R([-0.35, 0.45]), chin: R([0.6, 1.3]) };
}
