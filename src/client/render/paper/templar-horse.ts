// The Templar mounted kinds on bones, rebuilt from the approved key art (templar-static.ts):
// Turcopoles (5), Turcopole Archers (6), Knight-Brothers (7) and the Marshal (10).
//
// The horse: barrel, neck, head, tail and four legs, each an upper and a lower bone reaching for
// its fetlock by IK, and a hoof. The gaits are Muybridge's (motion/horse-*.json): the legs follow
// the plates' angles, and a hoof the plate shows on the ground is planted (its fetlock target is
// pressed onto the ground line), so it does not slide. The rider sits on a saddle bone with a
// man's bones; his hips follow the saddle a frame late and his head stays level.

import { Anim } from '../contract.ts';
import { code, type P2, type Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { along as alongR } from './rig.ts';
import {
  BREATH, bonesFromJoints, dirStep, EASE, restPose, smearPart, skeletonKind, type Posed,
  type AnimationData, type AnimEvent, type AttachmentSet, type Clip, type DrawCtx, type JointDef, type PartXf, type SkeletonData, type SkeletonRig, type SlotData,
} from './skeleton.ts';
import { BOW, CUT, HIT, T, THRUST, cloth, type Author, type Tracks } from './templar-clips.ts';
import { joints, neRest, PARENT, type FootSpec } from './templar-foot.ts';
import { bow, paintAs, RIG_CLOTH, TM, type ValueClass } from './templar-parts.ts';
import { at as atT, facingClip, lagCloth, lastFrame, mapFacings, memoSkin, overlayKeys, partMap, restWorld, skinMap, smooth01, type ClipSet, type KP, type LagSpec, type Track, type Weights } from './templar-rig.ts';
import {
  CAPAR_PTS, HJ, hoofAt, HORSE_BODY, HORSE_FAR, HORSE_SCALE, horsePiece, MOUNTED, RIDER_PIECES, RIDER_SHIFT, riderPiece, riderRest, scaled, withMap,
  type HorsePiece, type PartMap, type RiderPiece, type RiderRest, type SGear, type SHorse, type SKit,
} from './templar-static.ts';
import { MOTION, type MotionKey } from './motion/index.ts';

void CAPAR_PTS;

// ------------------------------------------------------------------ per-kind facts

type RiderAttack = 'couch' | 'thrust' | 'cut' | 'stab';
interface HorseSpec extends FootSpec {
  ride: RiderAttack;
  /** The weapon in the charge (Run): world angle (a couched lance is level over the neck). */
  charge: number;
}
const HORSE_SPECS: Record<number, HorseSpec> = {
  5: { nearDeg: 180, front: 'forearmF', neNear: 'mirror', neFar: 'shift', attack: 'thrust', shoot: null, brace: 'spear', die: 'back', ride: 'thrust', charge: 98 },
  6: { farDeg: 168, front: 'chest', neNear: 'mirror', neFar: 'mirror', attack: 'punch', shoot: 'bow', brace: 'ready', die: 'back', ride: 'stab', charge: 0 },
  7: { nearDeg: 135, front: 'forearmF', neNear: 'mirror', neFar: 'shift', attack: 'thrust', shoot: null, brace: 'spear', die: 'back', ride: 'couch', charge: 96 },
  10: { nearDeg: 135, farDeg: 180, front: 'chest', neNear: 'mirror', neFar: 'mirror', attack: 'cut', shoot: null, brace: 'ready', die: 'back', ride: 'cut', charge: 120, smear: [2.4, 6.0] },
};

/**
 * Cloth flown from a staff, on bones of its own so it ripples (the key art's is frozen at one flap):
 * the Marshal's Beauséant and the lancers' pennons. The hoist sits `at` units up the staff from the
 * fist (on the staff bone), the fly runs `len` back (screen left, the wind of the charge) and
 * `drop` down, in `n` bones (key-art sizes: templar-parts.ts `beauseant` and `pennon`).
 */
interface Fly {
  kind: 'banner' | 'pennon';
  parent: 'itemF' | 'weapon';
  /** The staff's key-art angle (rig: 180 up) and the hoist's middle along it, from the fist. */
  deg: number;
  at: number;
  height: number;
  len: number;
  drop: number;
  n: number;
  /** How much of the staff's turn the fly takes (the rest is the wind's). */
  follow: number;
}
const FLY: Partial<Record<number, Fly>> = {
  5: { kind: 'pennon', parent: 'weapon', deg: 180, at: 11.9, height: 1.1, len: 2.8, drop: 0.5, n: 2, follow: 0.3 },
  7: { kind: 'pennon', parent: 'weapon', deg: 135, at: 11.4, height: 1.1, len: 2.8, drop: 0.45, n: 2, follow: 0.3 },
  10: { kind: 'banner', parent: 'itemF', deg: 180, at: 6.95, height: 3.4, len: 4.4, drop: 0.5, n: 3, follow: 0.35 },
};

// ------------------------------------------------------------------ the skeleton

const S = HORSE_SCALE;
const H = (p: P2): P2 => [Math.round(p[0] * S * 1e6) / 1e6, Math.round(p[1] * S * 1e6) / 1e6];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const LEGS = ['foreF', 'hindF', 'foreN', 'hindN'] as const;
type Leg = (typeof LEGS)[number];
const MUZZLE: P2 = [HJ.poll[0] + 3.6 * Math.cos((HJ.headDeg * Math.PI) / 180), HJ.poll[1] + 3.6 * Math.sin((HJ.headDeg * Math.PI) / 180)];

function horseJoints(): { name: string; parent?: string; from: P2; to: P2 }[] {
  const out: { name: string; parent?: string; from: P2; to: P2 }[] = [
    { name: 'root', from: [0, 0], to: [0, 0] },
    { name: 'horseBody', parent: 'root', from: H([0, -8.0]), to: H([4.5, -8.4]) },
    { name: 'horseNeck', parent: 'horseBody', from: H([4.4, -9.6]), to: H(HJ.poll) },
    { name: 'horseHead', parent: 'horseNeck', from: H(HJ.poll), to: H(MUZZLE) },
    { name: 'tail', parent: 'horseBody', from: H([-6.1, -9.5]), to: H([-6.9, -3.6]) },
  ];
  for (const L of LEGS) {
    const [top, mid, fet] = HJ[L];
    out.push(
      { name: `${L}Upper`, parent: 'horseBody', from: H(top), to: H(mid) },
      { name: `${L}Lower`, parent: `${L}Upper`, from: H(mid), to: H(fet) },
      { name: `${L}Hoof`, parent: `${L}Lower`, from: H(fet), to: H(hoofAt(fet)) },
      { name: `${L}Target`, parent: 'root', from: H(fet), to: H(fet) },
    );
  }
  out.push({ name: 'saddle', parent: 'horseBody', from: H([0.3, -10.6]), to: H([0.3, -10.6]) });
  // Cloth and hair that trail: the caparison's hem, front and rear, and the mane.
  out.push(
    { name: 'caparF', parent: 'horseBody', from: H([3.6, -8.2]), to: H([3.6, -4.2]) },
    { name: 'caparR', parent: 'horseBody', from: H([-3.8, -8.4]), to: H([-3.8, -4.2]) },
    { name: 'mane', parent: 'horseNeck', from: H([5.0, -13.0]), to: H([4.4, -12.0]) },
  );
  return out;
}

/** The rider's joints (figure units): a man's, set in the saddle. */
function riderJoints(R: RiderRest, s: FootSpec, k: SKit): Record<string, { from: P2; to: P2 }> {
  const j = joints(R, s, k);
  const out: Record<string, { from: P2; to: P2 }> = {};
  for (const [n, v] of Object.entries(j)) {
    if (n === 'root' || n.startsWith('footTarget')) continue;
    out[n] = { from: add(v.from, RIDER_SHIFT), to: add(v.to, RIDER_SHIFT) };
  }
  return out;
}

const HPIECE_BONE: Record<HorsePiece, string> = {
  foreFU: 'foreFUpper', foreFL: 'foreFLower', foreFH: 'foreFHoof', hindFU: 'hindFUpper', hindFL: 'hindFLower', hindFH: 'hindFHoof',
  foreNU: 'foreNUpper', foreNL: 'foreNLower', foreNH: 'foreNHoof', hindNU: 'hindNUpper', hindNL: 'hindNLower', hindNH: 'hindNHoof',
  tail: 'tail', barrel: 'horseBody', neck: 'horseNeck', mane: 'horseNeck', head: 'horseHead', capar: 'horseBody', cloth: 'horseBody', saddle: 'horseBody', girth: 'horseBody',
};
const RPIECE_BONE = (s: FootSpec): Record<RiderPiece, string> => ({
  rThighN: 'thighN', rShinN: 'shinN', rFootN: 'footN', cloak: 'chest', behind: 'chest', upperArmF: 'upperArmF', forearmF: 'forearmF', handF: 'handF', farItem: 'itemF',
  torso: 'pelvis', fur: 'chest', camail: 'chest', head: 'head', front: s.front === 'pelvis' ? 'chest' : s.front, upperArmN: 'upperArmN', forearmN: 'forearmN', handN: 'handN',
  pauldron: 'chest', weapon: 'weapon', last: 'chest',
});
const hs = (p: HorsePiece) => `h_${p}`;
const RIDER_NE: readonly string[] = ['front', 'farItem', 'upperArmF', 'forearmF', 'handF', 'rThighN', 'rShinN', 'rFootN', 'torso', 'cloak', 'fur', 'camail', 'head', 'behind', 'upperArmN', 'forearmN', 'handN', 'pauldron', 'weapon', 'smear', 'last', 'flash'];
const ORDER_SE = [...HORSE_FAR.map(hs), ...HORSE_BODY.map(hs), ...RIDER_PIECES, 'smear', 'flash'];
const ORDER_NE = [...HORSE_FAR.map(hs), ...HORSE_BODY.map(hs), ...RIDER_NE];

function horseSkel(kind: number, k: SKit, g: SGear, s: FootSpec): SkeletonData {
  const hj = horseJoints();
  const se = riderJoints(riderRest(k, g), s, k), ne = riderJoints(neRest(riderRest(k, g), s), s, k);
  const defs: JointDef[] = [...hj.map((j) => ({ ...j }) as JointDef)];
  for (const name of Object.keys(se)) {
    const d: JointDef = { name, from: se[name]!.from, to: se[name]!.to };
    const p = PARENT[name];
    d.parent = p === 'root' ? 'saddle' : p;
    if (name === 'footN' || name === 'footF') d.inherit = 'translation';
    const n = ne[name]!;
    if (n.from[0] !== d.from[0] || n.from[1] !== d.from[1] || n.to[0] !== d.to[0] || n.to[1] !== d.to[1]) d.facing = { ne: { from: n.from, to: n.to } };
    defs.push(d);
  }
  const fly = FLY[kind];
  if (fly) {
    // The fly's joints in each drawn facing: from the hoist on the staff, back and a little down.
    const joint = (j: Record<string, { from: P2 }>, i: number): P2 => {
      const h = alongR(j[fly.parent]!.from, fly.deg, fly.at);
      return [h[0] - (fly.len * i) / fly.n, h[1] + (fly.drop * i) / fly.n];
    };
    for (let i = 0; i < fly.n; i++) {
      const d: JointDef = { name: `fly${i}`, parent: i === 0 ? fly.parent : `fly${i - 1}`, from: joint(se, i), to: joint(se, i + 1) };
      const nf = joint(ne, i), nt = joint(ne, i + 1);
      if (nf[0] !== d.from[0] || nf[1] !== d.from[1] || nt[0] !== d.to[0] || nt[1] !== d.to[1]) d.facing = { ne: { from: nf, to: nt } };
      defs.push(d);
    }
  }
  // The cloth is drawn just after its staff.
  const withFly = (order: readonly string[]): string[] => (fly ? order.flatMap((n) => (n === (fly.parent === 'itemF' ? 'farItem' : 'weapon') ? [n, 'fly'] : [n])) : [...order]);
  const orderSe = withFly(ORDER_SE), orderNe = withFly(ORDER_NE);
  const rb = RPIECE_BONE(s);
  const slots: SlotData[] = orderSe.map((name) => {
    if (name === 'fly') return { name, bone: 'fly0', attachment: { all: 'fly' } };
    if (name.startsWith('h_')) return { name, bone: HPIECE_BONE[name.slice(2) as HorsePiece], attachment: { all: name } };
    if (name === 'smear') return { name, bone: 'weapon', attachment: { all: 'smear' } };
    if (name === 'flash') return { name, bone: 'root', attachment: { all: 'flash' } };
    return { name, bone: rb[name as RiderPiece], attachment: { all: name } };
  });
  const ik = LEGS.map((L) => ({ name: `${L}IK`, bones: [`${L}Upper`, `${L}Lower`] as [string, string], target: `${L}Target`, bend: (L.startsWith('fore') ? 1 : -1) as 1 | -1, mix: 1, ground: H(HJ[L][2])[1] }));
  return {
    name: `templar-horse-${kind}`,
    body: 'horse',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: { se: orderSe, ne: orderNe },
    ik: [...ik, { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: -1, mix: 0 }],
  };
}

// ------------------------------------------------------------------ the parts

const scaleMap = (m: PartMap): PartMap => ({
  f: (p) => {
    const q = m.f([p[0] * S, p[1] * S]);
    return [q[0] / S, q[1] / S];
  },
  inv: (p) => {
    const q = m.inv([p[0] * S, p[1] * S]);
    return [q[0] / S, q[1] / S];
  },
  deg: m.deg,
});
const shiftMap = (m: PartMap): PartMap => ({ f: (p) => m.f(add(p, RIDER_SHIFT)), inv: (p) => sub(m.inv(p), RIDER_SHIFT), deg: m.deg });

/** The caparison over the barrel and up the neck (horse units for the weights). */
const caparWeights: Weights = ([x, y]) => {
  const hx = x / S, hy = y / S;
  const n = smooth01((hx - 3.6) / 1.8) * smooth01((-hy - 10.2) / 1.6);
  // The skirt below the barrel hangs from it and trails: front and rear halves on their own hem bones.
  const hem = smooth01((hy + 8.6) / 4.2) * 0.95 * (1 - n);
  const front = smooth01((hx + 1.2) / 3.8);
  return [['horseBody', (1 - n) - hem], ['horseNeck', n], ['caparF', hem * front], ['caparR', hem * (1 - front)]];
};
/** The mane: the strands' roots on the crest ride the neck, their ends the trailing mane bone. */
const maneWeights: Weights = ([x, y]) => {
  const hx = x / S, hy = y / S;
  // Distance below the crest line (from [2.7, -10.7] to [7.1, -15.0]).
  const d = ((hx - 2.7) * 0.7 + (hy + 10.7) * 0.715) * 1;
  const m = smooth01(d / 0.8);
  return [['horseNeck', 1 - m], ['mane', m]];
};
/** The rider's torso: chest, spine, pelvis (rider frame for the weights). */
const riderTorsoWeights: Weights = ([, y]) => {
  const ry = y - RIDER_SHIFT[1];
  const a = smooth01((-9.3 - ry) / 1.1), b = smooth01((-7.9 - ry) / 1.0);
  return [['chest', a], ['spine', b - a], ['pelvis', 1 - b]];
};
/** The rider's mantle: from the shoulders, trailing late (cloak), spilling over the croup (it lies on the horse). */
const riderCloakWeights: Weights = ([x, y]) => {
  const rx = x - RIDER_SHIFT[0], ry = y - RIDER_SHIFT[1];
  const c = smooth01((ry + 10.6) / 5);
  const hb = smooth01((-rx - 1.5) / 2.5) * smooth01((ry + 8) / 3);
  return [['chest', 1 - c], ['cloak', c * (1 - hb)], ['horseBody', c * hb]];
};

function horseParts(k: SKit, g: SGear, horse: SHorse, s: HorseSpec, dark: ValueClass, fly?: Fly): AttachmentSet {
  const rest: Record<Facing, RiderRest> = { se: riderRest(k, g), ne: neRest(riderRest(k, g), s), sw: riderRest(k, g), nw: riderRest(k, g) };
  const atts: AttachmentSet = {};
  for (const p of [...HORSE_FAR, ...HORSE_BODY]) {
    if (p === 'capar' || p === 'mane') {
      const wts = p === 'capar' ? caparWeights : maneWeights;
      const bones = p === 'capar' ? ['horseBody', 'horseNeck', 'caparF', 'caparR'] : ['horseNeck', 'mane'];
      atts[hs(p)] = memoSkin(`horse-${p}`, bones, (c, ctx) => paintAs(c, dark, () => scaled(c, S, () => withMap(scaleMap(skinMap(ctx.posed, wts)), () => horsePiece(c, horse, p, ctx.posed.facing === 'ne')))));
      continue;
    }
    atts[hs(p)] = (c, x, ctx) => paintAs(c, dark, () => scaled(c, S, () => withMap(scaleMap(partMap(x)), () => horsePiece(c, horse, p, ctx.posed.facing === 'ne'))));
  }
  for (const p of RIDER_PIECES) {
    const draw = (c: Paper, m: PartMap, f: Facing) => {
      RIG_CLOTH.on = true;
      try {
        paintAs(c, dark, () => withMap(shiftMap(m), () => riderPiece(c, k, g, p, rest[f], { rig: true, back: f === 'ne' })));
      } finally {
        RIG_CLOTH.on = false;
      }
    };
    if (p === 'torso' || p === 'cloak') {
      const bones = p === 'torso' ? ['pelvis', 'spine', 'chest'] : ['chest', 'cloak', 'horseBody'];
      atts[p] = memoSkin(`rider-${p}`, bones, (c, ctx) => draw(c, skinMap(ctx.posed, p === 'torso' ? riderTorsoWeights : riderCloakWeights), ctx.posed.facing));
      continue;
    }
    atts[p] = (c, x, ctx) => draw(c, partMap(x), ctx.posed.facing);
  }
  if (s.shoot === 'bow') {
    atts.farItem = {
      cache: false,
      draw: (c: Paper, x: PartXf, ctx: DrawCtx) => {
        const drawing = ctx.events.some((e) => e.name === 'draw');
        const hn = ctx.posed.byName.handN!;
        const nock: P2 = [hn.tx, hn.ty];
        paintAs(c, dark, () => {
          bow(c, c.L < 2 ? [x.o[0] + 1.4, x.o[1] - 1.0] : x.o, (s.farDeg ?? 168) + x.turned * 7.5, c.L < 2 ? 15 : 8.6, drawing ? 1 : 0, drawing ? nock : null);
          if (drawing) c.rod(nock, [x.o[0] + (x.o[0] - nock[0]) * 0.25, x.o[1] + (x.o[1] - nock[1]) * 0.25], 0.14, 0.12, TM.ash, { tone: 3 });
        });
      },
    };
  }
  if (fly) atts.fly = { cache: false, draw: (c, _x, ctx) => paintAs(c, dark, () => flyCloth(c, ctx.posed, fly)) };
  if (s.smear) {
    const sm = smearPart('weapon', s.smear[0], s.smear[1], TM.steel);
    atts.smear = { cache: false, draw: (c, x, ctx) => paintAs(c, dark, () => sm.draw(c, x, ctx)) };
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
/** The hoof's rest world angle (the pastern sloping forward to the toe). */
const HOOF_REST = (Math.atan2(0.3, 0.85) * 180) / Math.PI;

/**
 * Keys from a Muybridge gait (motion/horse-*.json): the barrel's pitch and bob, the neck's and
 * head's nod and the tail as turns from the stride's mean; each leg's fetlock target from the
 * plate's angles scaled to our horse, pressed onto the ground while the plate shows that hoof
 * down; a hoof planted lies flat, a hoof in the air folds back under the fetlock.
 */
function gaitKeys(skel: SkeletonData, name: string, facing: Facing, o: { amp?: number; pitch?: number; neck?: number; head?: number; tail?: number } = {}): { keys: KP[]; bob: Track } {
  const clip = MOTION[name]!;
  const ks = clip.facings[facing === 'ne' ? 'ne' : 'se'].keys as (MotionKey & { hooves: Record<string, boolean> })[];
  const amp = o.amp ?? 1;
  const mean = (b: string) => ks.reduce((s0, k) => s0 + wrap(k.bones[b]! - ks[0]!.bones[b]!), 0) / ks.length + ks[0]!.bones[b]!;
  const ref = { barrel: mean('barrel'), neck: mean('neck'), head: mean('head'), tail: mean('tail') };
  const hip = -(H([0, -8.0])[1]);
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
      const [top, , fet] = HJ[L];
      const topF = H(top);
      const s2 = -topF[1] / (mu + ml);
      // The hoof's ground point by the plate, then the fetlock above it.
      const end: P2 = [topF[0] + s2 * (mu * sinD(u) + ml * sinD(l)), topF[1] + dy + s2 * (mu * cosD(u) + ml * cosD(l))];
      const down = k.hooves[HOOF_CODE[L]] ?? false;
      const hoofOff = sub(H(hoofAt(fet)), H(fet));
      let fx = end[0] - hoofOff[0], fy = end[1] - hoofOff[1];
      const restF = H(fet);
      if (down) fy = restF[1];
      else fy = Math.min(fy, restF[1]);
      t[`${L}Target`] = [Math.round((fx - restF[0]) * amp * 100) / 100, Math.round((fy - restF[1]) * 100) / 100];
      w[`${L}Hoof`] = down ? HOOF_REST : Math.round(l - (type === 'fore' ? 40 : 25));
    }
    // The barrel's pitch from the plate (amplified so it reads in 7.5° steps), the neck pumping
    // against it, the tail streaming back at speed.
    const pitch = wrap(k.bones.barrel! - ref.barrel) * (o.pitch ?? 1);
    const dw = {
      horseBody: Math.round(pitch * 10) / 10,
      horseNeck: Math.round((wrap(k.bones.neck! - ref.neck) * (o.neck ?? 1) - pitch * 0.6) * 10) / 10,
      horseHead: Math.round(wrap(k.bones.head! - ref.head) * (o.head ?? 1) * 10) / 10,
      tail: Math.round((wrap(k.bones.tail! - ref.tail) + (o.tail ?? 0)) * 10) / 10,
    };
    return { f: k.f, ...(k.c ? { c: k.c as KP['c'] } : {}), t, w, dw };
  });
  void skel;
  return { keys, bob };
}

/** Rider tracks over a gait: the hips follow the saddle a frame late (absorbing), the head level, the weapon carried. */
function riderGait(bob: Track, n: number, s: HorseSpec, run: boolean): Author {
  return (rw) => {
    const lagged: [number, number][] = [];
    for (let f = 0; f <= n; f++) {
      const now = atT(bob, f), was = atT(bob, f - 1 < 0 ? f - 1 + n : f - 1);
      lagged.push([f, Math.round((was - now) * 0.3 * 100) / 100]);
    }
    const w: Record<string, Track> = { head: T([0, rw.head! - (run ? 6 : 0)]) };
    const dw: Record<string, Track> = run ? { spine: T([0, -10]) } : {};
    if (run && s.ride === 'couch') Object.assign(w, { upperArmN: T([0, -12]), forearmN: T([0, 78]), weapon: T([0, s.charge]) });
    else if (run && s.ride === 'thrust') Object.assign(w, { upperArmN: T([0, -8]), forearmN: T([0, 74]), weapon: T([0, s.charge]) });
    else if (run && s.ride === 'cut') Object.assign(w, { upperArmN: T([0, 60]), forearmN: T([0, 120]), weapon: T([0, s.charge]) });
    return { w, dw, tAdd: { pelvis: [T([0, 0]), lagged] } };
  };
}

/** Rider attacks from the saddle. */
const COUCH: Author = (rw) => ({
  // The lance comes down from the slope into the couch under the arm, the rider leans into it; at
  // the impact his trunk is driven back against the cantle and the shoulder recoils; he settles.
  w: {
    upperArmN: T([0, rw.upperArmN!], [2, -10], [4, -4], [5, 0], [6, -26], [7, -24], [9, -10], [11, rw.upperArmN!]),
    forearmN: T([0, rw.forearmN!], [2, 78], [4, 84], [5, 88], [6, 70], [7, 72], [9, 78], [11, rw.forearmN!]),
    // The tip dips onto the target at the impact, then kicks up as the shaft takes the blow.
    weapon: T([0, rw.weapon!], [2, 96], [4, 100], [5, 106], [6, 92], [7, 94], [9, 96], [11, rw.weapon!]),
  },
  dw: { spine: T([0, 0], [2, -10], [4, -22], [5, -26], [6, 10], [7, 12], [9, -2], [11, 0]), head: T([0, 0], [4, -8], [5, -10], [6, 8], [8, 0]), upperArmF: T([0, 0], [4, 12], [6, -8], [11, 0]) },
});
const RIDE_THRUST: Author = (rw, f) => {
  const t = THRUST(rw, f);
  return { w: t.w, dw: { ...t.dw } };
};
const RIDE_CUT: Author = (rw, f) => {
  const t = CUT(rw, f);
  return { w: t.w, dw: { ...(t.dw ?? {}), spine: T([0, 0], [4, 8], [6, -12], [8, -14], [11, 0]) } };
};
const STAB: Author = (rw) => ({
  w: { upperArmN: T([0, rw.upperArmN!], [3, -25], [5, 80], [6, 78], [9, 20], [11, rw.upperArmN!]), forearmN: T([0, rw.forearmN!], [3, 80], [5, 90], [6, 88], [9, 40], [11, rw.forearmN!]) },
  dw: { spine: T([0, 0], [3, 6], [5, -12], [8, -4], [11, 0]) },
});
const RIDES: Record<RiderAttack, Author> = { couch: COUCH, thrust: RIDE_THRUST, cut: RIDE_CUT, stab: STAB };

/** The horse standing: hooves down, it breathes, the tail swishes, the head nods. */
function standKeys(n: number, extra?: Author): (f: Facing, skel: SkeletonData) => KP[] {
  return (f, skel) => {
    const keys: KP[] = [];
    for (let i = 0; i <= n; i++) keys.push({ f: i, t: Object.fromEntries(LEGS.map((L) => [`${L}Target`, [0, 0] as P2])), w: Object.fromEntries(LEGS.map((L) => [`${L}Hoof`, HOOF_REST])) });
    const base: Tracks = {
      tAdd: { horseBody: [T([0, 0]), T([0, 0], [n * 0.5, 0.12], [n, 0])] },
      dw: { horseNeck: T([0, 0], [n * 0.4, -3], [n * 0.7, 0]), tail: T([0, 0], [n * 0.25, 9], [n * 0.5, 0], [n * 0.75, -5], [n, 0]) },
    };
    const k1 = overlayKeys(keys, base);
    return extra ? overlayKeys(k1, extra(restWorld(skel, f), f)) : k1;
  };
}

function horseClips(skel: SkeletonData, s: HorseSpec, fly?: Fly): ClipSet {
  // The mantle, the caparison's hem and the mane trail the body 1-2 frames; at speed the hem
  // streams back off the legs and flutters, the mane flows back.
  const trail = (run: number): LagSpec[] => [
    ...cloth(run).filter((c) => c.bone === 'cloak'),
    { bone: 'caparF', follow: 'horseBody', k: 0.8, lag: 1.5, bias: -4 - 16 * run, plumb: 0.4, wave: [3 + 5 * run, 2, 0] },
    { bone: 'caparR', follow: 'horseBody', k: 0.8, lag: 2, bias: -4 - 22 * run, plumb: 0.4, wave: [3 + 6 * run, 2, 0.3] },
    { bone: 'mane', follow: 'horseNeck', k: 0.6, lag: 1.5, bias: -28 * run, wave: [4 * run, 2, 0.15] },
    ...(fly ? flyTrail(fly, run) : []),
  ];
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => KP[], ev: AnimEvent[] = [], run = 0): Clip =>
    lagCloth(skel, facingClip(skel, name, n, loop, keys, ev), n, loop, trail(run));
  const breath = (c: Clip, alpha = 1): Clip => {
    const b = c as { byFacing: Record<'se' | 'ne', AnimationData> };
    return { byFacing: { se: [{ anim: b.byFacing.se }, { anim: BREATH, alpha }], ne: [{ anim: b.byFacing.ne }, { anim: BREATH, alpha }] } };
  };
  const gait = (name: string, run: boolean) => (f: Facing) => {
    const g = gaitKeys(skel, name, f, run ? { pitch: 2.2, neck: 1.4, tail: -50 } : { pitch: 1.0, neck: 0.7, head: 0.4, tail: -6 });
    return overlayKeys(g.keys, riderGait(g.bob, 12, s, run)(restWorld(skel, f), f));
  };
  const idle = breath(fc('idle', 8, true, (f) => standKeys(8)(f, skel)));
  const walk = fc('walk', 12, true, gait('horse-walk', false), [{ f: 0, name: 'step' }, { f: 3, name: 'step' }, { f: 6, name: 'step' }, { f: 9, name: 'step' }], 0.3);
  const run = fc('run', 12, true, gait('horse-gallop', true), [{ f: 3, name: 'step' }, { f: 5, name: 'step' }, { f: 6, name: 'step' }, { f: 10, name: 'step' }], 1);
  const ride = RIDES[s.ride];
  const horseLean: Author = () => ({ dw: { horseBody: T([0, 0], [4, -2], [6, 2], [9, 0]), horseNeck: T([0, 0], [5, 6], [8, 0]) } });
  const atkEv: AnimEvent[] = s.ride === 'cut' ? [{ f: 6, name: 'smear', len: 1, bone: 'weapon' }, { f: 7, name: 'strike' }] : [{ f: 5, name: 'strike' }];
  // Lancers strike at the charge: the gallop under the couched lance, the horse driving into the
  // impact (nose down, a surge forward) and the rider leaning hard in.
  const lancer = s.ride === 'couch' || s.ride === 'thrust';
  const drive: Author = () => ({ dw: { horseBody: T([0, 0], [4, -4], [5, -10], [6, 4], [8, 0]), horseNeck: T([0, 0], [5, 8], [7, -4], [9, 0]) }, tAdd: { horseBody: [T([0, 0], [4, 0.3], [5, 0.7], [7, 0.4], [11, 0]), T([0, 0])] } });
  const attack = lancer
    ? fc('attack', 12, false, (f) => {
        const g = gaitKeys(skel, 'horse-gallop', f, { pitch: 2.2, neck: 1.4, tail: -50 });
        const rw = restWorld(skel, f);
        return overlayKeys(overlayKeys(g.keys, drive(rw, f), [1, 2, 4, 7, 9]), (s.ride === 'couch' ? COUCH : RIDE_THRUST)(rw, f));
      }, atkEv, 1)
    : fc('attack', 12, false, (f) => overlayKeys(standKeys(11, horseLean)(f, skel), ride(restWorld(skel, f), f)), atkEv);
  const shoot = s.shoot === 'bow' ? fc('shoot', 12, false, (f) => overlayKeys(standKeys(11)(f, skel), BOW(restWorld(skel, f), f)), [{ f: 3, name: 'draw', len: 4 }, { f: 7, name: 'release' }]) : attack;
  // Struck: the horse shies (head up, a half-step back), the rider snaps back; a flash.
  const shy: Author = () => ({ dw: { horseNeck: T([0, 14], [1, 20], [2, 10], [4, 0]), horseBody: T([0, 3], [1, 5], [2, 2], [4, 0]), horseHead: T([0, 8], [1, 10], [4, 0]) }, tAdd: { horseBody: [T([0, -0.3], [1, -0.5], [2, -0.3], [4, 0]), T([0, 0])] } });
  const riderHit: Author = (rw, f) => ({ dw: HIT(rw, f).dw });
  const hit = fc('hit', 5, false, (f) => overlayKeys(overlayKeys(standKeys(4, shy)(f, skel), riderHit(restWorld(skel, f), f)), {}, [1, 2, 3]), [{ f: 0, name: 'flash' }]);
  const die = fc('die', 12, false, (f) => dieKeys(f), [{ f: 8, name: 'land' }]);
  const dead = mapFacings(die, (a) => lastFrame(a, 'dead'));
  const braceA: Author = (rw) => ({
    dw: { horseNeck: T([0, 6]), horseHead: T([0, -4]), spine: T([0, -6]), ...(s.front === 'forearmF' ? { upperArmF: T([0, 18]), forearmF: T([0, 14]) } : {}) },
    w: (s.ride === 'couch' || s.ride === 'thrust' ? { upperArmN: T([0, -10]), forearmN: T([0, 76]), weapon: T([0, s.charge]) } : s.ride === 'cut' ? { upperArmN: T([0, 40]), forearmN: T([0, 110]), weapon: T([0, 130]) } : { upperArmN: T([0, rw.upperArmN! + 10]) }) as Record<string, Track>,
  });
  const brace = breath(fc('brace', 8, true, (f) => standKeys(8, braceA)(f, skel)), 0.6);
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
    const rw = restWorld(skel, f);
    const fold = (fu: number, fl: number, hu: number, hl: number) => ({ foreFUpper: fu, foreNUpper: fu - 4, foreFLower: fl, foreNLower: fl + 6, hindFUpper: hu, hindNUpper: hu - 4, hindFLower: hl, hindNLower: hl + 6 });
    return ([
      { f: 0, c: EASE, ik: on, ...planted, dw: { horseNeck: 14, horseHead: 8, spine: 14, head: 16, upperArmN: 30, upperArmF: 20 } },
      { f: 2, c: EASE, ik: off, t: { horseBody: [0.3, 1.4] }, dl: fold(28, -95, 4, -10), dw: { horseBody: -9, horseNeck: 6, spine: 16, head: 18 }, w: { upperArmN: 140, forearmN: 160, upperArmF: 110 } },
      { f: 5, c: EASE, ik: off, t: { horseBody: [0.6, 3.6] }, dl: fold(40, -120, 24, -48), dw: { horseBody: -12, horseNeck: -12, horseHead: -8, tail: 10, spine: 30, head: 10 }, w: { upperArmN: 175, forearmN: 190, upperArmF: 150 } },
      { f: 8, c: EASE, ik: off, t: { horseBody: [0.7, 5.1], pelvis: [-0.6, 0.4] }, dl: fold(52, -135, 52, -105), dw: { horseBody: -4, horseNeck: -36, horseHead: -22, tail: -18, spine: 56, chest: 10, head: 6 }, w: { upperArmN: 205, forearmN: 220, upperArmF: 190 } },
      { f: 9, c: EASE, ik: off, t: { horseBody: [0.7, 4.9], pelvis: [-0.7, 0.5] }, dl: fold(54, -137, 54, -108), dw: { horseBody: -3, horseNeck: -40, horseHead: -24, tail: -20, spine: 60, chest: 12, head: 8 }, w: { upperArmN: 210, forearmN: 225, upperArmF: 196 } },
      { f: 11, ik: off, t: { horseBody: [0.7, 5.25], pelvis: [-0.8, 0.6] }, dl: fold(55, -138, 55, -110), dw: { horseBody: -2, horseNeck: -52, horseHead: -30, tail: -22, spine: 66, chest: 14, head: 12 }, w: { upperArmN: 214, forearmN: 230, upperArmF: 200 } },
    ] as unknown) as KP[];
    void rw;
  }
}

// ------------------------------------------------------------------ the flown cloth

/**
 * The fly's bones over a clip. Each follows the staff a frame later than the one before it (the
 * cloth trails the pole), and carries a wave whose phase lags toward the tip, so a crest travels
 * from the hoist to the fly (the OpenGameArt CC0 flag strips; the stencil pennon's kink running
 * out to the tip). Whole cycles per clip, so the loops close: one at the walk, three at the gallop
 * (12 frames). Still air lets the fly droop toward the tip; at the gallop it streams back, the tip
 * lifting, and flutters harder.
 */
function flyTrail(fly: Fly, run: number): LagSpec[] {
  const cycles = run >= 1 ? 3 : 1;
  // Still air at rest; a slow wave at the walk, strongest at the tip; the full ripple at the gallop.
  // (The banner is the top of the figure, where the lint reads boil: the walk stays under it.)
  const amp = run >= 1 ? 14 : run > 0 ? 7 : 0;
  return Array.from({ length: fly.n }, (_, i) => ({
    bone: `fly${i}`,
    follow: fly.parent,
    k: fly.follow,
    lag: i,
    bias: run >= 1 ? -2 - 2 * i : (4 - 3 * run) * i,
    // The hoist panel moves least (it is held by the staff); the tip most.
    wave: [Math.round(amp * (run >= 1 ? 0.6 + 0.4 * (i / Math.max(1, fly.n - 1)) : i / Math.max(1, fly.n - 1)) * 10) / 10, cycles, -0.18 * i] as [number, number, number],
  }));
}

/**
 * Draws the flown cloth from its bones: the hoist along the staff, then one panel per fly bone,
 * its edges at the bone's joints across the cloth. A panel turned up against the one before it
 * (its far end lifted toward the light) is a step lighter, one turned down a step darker, so the
 * folds' light and shade bands travel with the wave; all from snapped angles and whole-pixel
 * joints (no boil). The banner
 * is sable over argent (a third, Matthew Paris); the pennon is a swallow-tail in the army colour.
 */
function flyCloth(c: Paper, posed: Posed, fly: Fly): void {
  const B = posed.byName;
  const rest = restPose(posed.skel, posed.level, posed.facing).byName;
  const staff = B[fly.parent]!;
  const up = dirStep(staff.step); // along the staff, toward its top (180: up)
  const J: P2[] = [[B.fly0!.x, B.fly0!.y]];
  for (let i = 0; i < fly.n; i++) J.push([B[`fly${i}`]!.tx, B[`fly${i}`]!.ty]);
  const norm = (v: P2): P2 => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };
  // Across the cloth at each joint: the staff at the hoist, then square to the fly (its upper side).
  const across: P2[] = J.map((p, i) => {
    if (i === 0) return up;
    const d = norm([J[Math.min(fly.n, i + 1)]![0] - J[i - 1]![0], J[Math.min(fly.n, i + 1)]![1] - J[i - 1]![1]]);
    return [-d[1], d[0]];
  });
  const half = (i: number) => (fly.height / 2) * (fly.kind === 'pennon' ? 1 - (0.3 * i) / fly.n : 1 - 0.04 * i);
  const top = J.map((p, i): P2 => [p[0] + across[i]![0] * half(i), p[1] + across[i]![1] * half(i)]);
  const bot = J.map((p, i): P2 => [p[0] - across[i]![0] * half(i), p[1] - across[i]![1] * half(i)]);
  const turn = (i: number) => {
    let d = B[`fly${i}`]!.step - rest[`fly${i}`]!.step;
    d -= 48 * Math.round(d / 48);
    return d;
  };
  for (let i = 0; i < fly.n; i++) {
    // A panel turned up against the one before it (the angle turned back, negative) faces the light
    // above: lit; turned down: in shade. Folds, not the whole fly, change tone as the wave passes.
    const rel = turn(i) - (i > 0 ? turn(i - 1) : 0);
    const lift = c.L >= 2 ? (rel < 0 ? 1 : rel > 0 ? -1 : 0) : 0;
    const a = J[i]!, b = J[i + 1]!;
    const seg = norm([b[0] - a[0], b[1] - a[1]]);
    const last = i === fly.n - 1;
    // The swallow-tail's notch: the last panel's free edge cut back at the middle.
    const pts: P2[] = last && fly.kind === 'pennon'
      ? [top[i]!, top[i + 1]!, [b[0] - seg[0] * 0.75, b[1] - seg[1] * 0.75], bot[i + 1]!, bot[i]!]
      : [top[i]!, top[i + 1]!, bot[i + 1]!, bot[i]!];
    c.shape(pts, (x, y) => {
      const q: P2 = [(x + 0.5 - c.FX) / c.L, (y + 0.5 - c.FY) / c.L];
      // How far up the cloth (0 bottom edge .. 1 top edge), between this panel's two joints.
      const t = Math.max(0, Math.min(1, (q[0] - a[0]) * seg[0] + (q[1] - a[1]) * seg[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1));
      const m: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const ax: P2 = norm([across[i]![0] * (1 - t) + across[i + 1]![0] * t, across[i]![1] * (1 - t) + across[i + 1]![1] * t]);
      const h = half(i) * (1 - t) + half(i + 1) * t;
      const v = 0.5 + ((q[0] - m[0]) * ax[0] + (q[1] - m[1]) * ax[1]) / (2 * h);
      if (fly.kind === 'pennon') return code(TM.team, 2 + lift - (v < 0.3 && c.L >= 4 ? 1 : 0));
      return v > 0.64 ? code(TM.black, 2 + lift) : code(TM.white, 3 + lift);
    });
  }
}

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
export function horseRig(kind: number): SkeletonRig | undefined {
  const got = RIGS.get(kind);
  if (got) return got;
  const m = MOUNTED[kind], s = HORSE_SPECS[kind];
  if (!m || !s) return undefined;
  const skel = horseSkel(kind, m.kit, m.gear, s);
  const rig: SkeletonRig = { skel, atts: horseParts(m.kit, m.gear, m.horse, s, m.cls ?? m.dark, FLY[kind]), clips: horseClips(skel, s, FLY[kind]) };
  RIGS.set(kind, rig);
  return rig;
}

/** Registers the mounted kinds drawn on bones (called by templar.ts after its own registrations). */
export function registerHorseRigs(kinds: readonly number[]): void {
  for (const k of kinds) {
    const rig = horseRig(k);
    if (rig) registerPaperKind('templar', k, skeletonKind(rig));
  }
}
