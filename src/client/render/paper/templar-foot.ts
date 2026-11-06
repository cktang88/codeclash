// The Templar foot kinds on bones, rebuilt from the approved key art (templar-static.ts).
// See templar-rig.ts for the machinery and docs/art-references/templar-animation.md for the
// motion reference behind the clips.

import { Anim } from '../contract.ts';
import { type P2, type Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import {
  ALL_ANIMS, WITH_ADVANCE, BREATH, bonesFromJoints, EASE, EASE_IN, EASE_OUT, lazySkeletonKind, smearPart,
  type AnimationData, type AnimEvent, type AttachmentSet, type DrawCtx, type FacingClips, type PartXf, type Track, type Clip, type JointDef, type SkeletonData, type SkeletonRig, type SlotData,
} from './skeleton.ts';
import { bow, paintAs, TM, type ValueClass } from './templar-parts.ts';
import { buildAnim, facingClip, lagCloth, memoSkin, partMap, skinMap, smooth01, weightSlots, type ClipSet, type KP, type LagSpec, type Weights } from './templar-rig.ts';
import { mocapFootClips, type Blow, type RunCarry } from './templar-clips.ts';
import { FOOT, handAt, manPiece, manRest, withMap, type ManPiece, type ManRest, type SGear, type SKit } from './templar-static.ts';

// ------------------------------------------------------------------ per-kind rig facts

type Bone = 'forearmF' | 'pelvis' | 'chest' | 'handF';
type Attack = 'cut' | 'thrust' | 'jab' | 'chop' | 'butt' | 'punch';
type Shoot = 'javelin' | 'bow' | 'crossbow' | null;
type Brace = 'shield' | 'spear' | 'ready' | 'axe';
export interface FootSpec {
  /** The item's key-art angle in each hand (rig degrees: 0 down, 90 forward, 180 up). */
  nearDeg?: number;
  farDeg?: number;
  /** The bone the `front` gear rides (a shield on the forearm, a quiver on the hips). */
  front: Bone;
  /** NE rest of the arms: hanging arms mirror across the body, arms holding a thing forward shift with the shoulder. */
  neNear: 'mirror' | 'shift';
  neFar: 'mirror' | 'shift';
  attack: Attack;
  shoot: Shoot;
  brace: Brace;
  die: 'back' | 'crumple';
  /** The off hand grips the weapon too (grip2 along the haft, units from the fist). */
  twoHand?: number;
  /** Weapon reach for the smear (units from the fist). */
  smear?: [number, number];
  /** Every melee blow, blow 0 first (templar-clips.ts BLOWS; default: just `attack`). */
  blows?: readonly Blow[];
  /** What the run carries, and whether heavy armour shortens it (templar-clips.ts runArms). */
  carry?: RunCarry;
  heavy?: boolean;
}

export const FOOT_SPECS: Record<number, FootSpec> = {
  0: { nearDeg: -36, front: 'forearmF', neNear: 'mirror', neFar: 'shift', attack: 'cut', blows: ['cut', 'swordThrust', 'bash'], carry: 'sword', heavy: true, shoot: null, brace: 'shield', die: 'back', smear: [4.0, 7.4] },
  1: { nearDeg: 180, front: 'forearmF', neNear: 'mirror', neFar: 'shift', attack: 'thrust', blows: ['thrust', 'underhand', 'spearButt'], carry: 'spear', shoot: null, brace: 'spear', die: 'crumple', smear: [7.0, 14.5] },
  2: { nearDeg: 120, farDeg: 180, front: 'pelvis', neNear: 'shift', neFar: 'mirror', attack: 'jab', blows: ['jab', 'stab'], carry: 'javelin', shoot: 'javelin', brace: 'ready', die: 'crumple', smear: [3.4, 7.6] },
  3: { farDeg: 174, front: 'pelvis', neNear: 'mirror', neFar: 'mirror', attack: 'punch', blows: ['punch', 'staveJab'], carry: 'bow', shoot: 'bow', brace: 'ready', die: 'back' },
  4: { nearDeg: 118, front: 'pelvis', neNear: 'shift', neFar: 'shift', attack: 'butt', blows: ['butt', 'stirrupJab'], carry: 'crossbow', shoot: 'crossbow', brace: 'ready', die: 'crumple', smear: [1.4, 3.6] },
  8: { nearDeg: 135, front: 'pelvis', neNear: 'shift', neFar: 'shift', attack: 'chop', blows: ['chop', 'axeRise', 'axeThrust'], carry: 'axe', heavy: true, shoot: null, brace: 'axe', die: 'back', twoHand: 2.6, smear: [5.0, 8.4] },
};

// ------------------------------------------------------------------ the skeleton

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const mx = (p: P2): P2 => [-p[0], p[1]];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** A point `len` along a rig angle (degrees), rounded so bakes match everywhere. */
const along = (p: P2, deg: number, len: number): P2 => [r6(p[0] + Math.sin((deg * Math.PI) / 180) * len), r6(p[1] + Math.cos((deg * Math.PI) / 180) * len)];

/** The NE rest joints: hips, legs and shoulders swap sides; arms mirror or shift with their shoulder. */
export function neRest(R: ManRest, s: FootSpec): ManRest {
  const shN = mx(R.shN), shF = mx(R.shF);
  const arm = (mode: 'mirror' | 'shift', sh0: P2, sh1: P2, el: P2, wr: P2): [P2, P2] =>
    mode === 'mirror' ? [mx(el), mx(wr)] : [add(el, sub(sh1, sh0)), add(wr, sub(sh1, sh0))];
  const [elN, wrN] = arm(s.neNear, R.shN, shN, R.elN, R.wrN);
  const [elF, wrF] = arm(s.neFar, R.shF, shF, R.elF, R.wrF);
  return { ...R, hipN: mx(R.hipN), hipF: mx(R.hipF), kneeN: mx(R.kneeN), kneeF: mx(R.kneeF), ankN: mx(R.ankN), ankF: mx(R.ankF), shN, shF, elN, wrN, elF, wrF };
}

/** The skirt's hem (key-art y) for a kit. */
const hemOf = (k: SKit): number => (k.short ? -5.2 : -3.3);

export function joints(R: ManRest, s: FootSpec, k: SKit): Record<string, { from: P2; to: P2 }> {
  const hN = handAt(R.elN, R.wrN), hF = handAt(R.elF, R.wrF);
  const pel: P2 = [(R.hipN[0] + R.hipF[0]) / 2, -6.55];
  const nd = s.nearDeg ?? 20, fd = s.farDeg ?? 0;
  const hem = hemOf(k);
  return {
    root: { from: [0, 0], to: [0, 0] },
    pelvis: { from: pel, to: [0, -8.2] },
    spine: { from: [0, -8.2], to: [0.05, -9.8] },
    chest: { from: [0.05, -9.8], to: R.neck },
    neck: { from: R.neck, to: R.head },
    head: { from: R.head, to: add(R.head, [0.1, -1.2]) },
    upperArmN: { from: R.shN, to: R.elN },
    forearmN: { from: R.elN, to: R.wrN },
    handN: { from: R.wrN, to: hN },
    weapon: { from: hN, to: along(hN, nd, 4) },
    grip2: { from: along(hN, nd, s.twoHand ?? 1.3), to: along(hN, nd, s.twoHand ?? 1.3) },
    upperArmF: { from: R.shF, to: R.elF },
    forearmF: { from: R.elF, to: R.wrF },
    handF: { from: R.wrF, to: hF },
    itemF: { from: hF, to: along(hF, fd, 3) },
    thighN: { from: R.hipN, to: R.kneeN },
    shinN: { from: R.kneeN, to: R.ankN },
    footN: { from: R.ankN, to: add(R.ankN, [1.1, 0.4]) },
    thighF: { from: R.hipF, to: R.kneeF },
    shinF: { from: R.kneeF, to: R.ankF },
    footF: { from: R.ankF, to: add(R.ankF, [1.1, 0.4]) },
    skirtN: { from: R.hipN, to: [R.hipN[0] - 0.15, hem] },
    skirtF: { from: R.hipF, to: [R.hipF[0] + 0.25, hem] },
    cloak: { from: [0.3, -12.0], to: [0.3, -1.0] },
    footTargetN: { from: R.ankN, to: R.ankN },
    footTargetF: { from: R.ankF, to: R.ankF },
    // What falls from the hands in a death: the shield and the weapon, free of the arms.
    dropF: { from: [1.75, -8.1], to: [1.75, -7.1] },
    dropW: { from: hN, to: along(hN, nd, 4) },
  };
}
export const PARENT: Record<string, string | undefined> = {
  root: undefined, pelvis: 'root', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmN: 'chest', forearmN: 'upperArmN', handN: 'forearmN', weapon: 'handN', grip2: 'weapon',
  upperArmF: 'chest', forearmF: 'upperArmF', handF: 'forearmF', itemF: 'handF',
  thighN: 'pelvis', shinN: 'thighN', footN: 'shinN', thighF: 'pelvis', shinF: 'thighF', footF: 'shinF',
  skirtN: 'pelvis', skirtF: 'pelvis', cloak: 'chest', footTargetN: 'root', footTargetF: 'root', dropF: 'root', dropW: 'root',
};

/** The rig's slots: every key-art piece rides one bone. */
const PIECE_BONE = (s: FootSpec): Record<ManPiece, string> => ({
  cloak: 'chest', behind: 'chest', thighF: 'thighF', shinF: 'shinF', footF: 'footF', thighN: 'thighN', shinN: 'shinN', footN: 'footN',
  upperArmF: 'upperArmF', forearmF: 'forearmF', handF: 'handF', farItem: 'itemF', torso: 'pelvis', fur: 'chest', camail: 'chest', hood: 'chest',
  pouch: 'pelvis', head: 'head', front: s.front, upperArmN: 'upperArmN', forearmN: 'forearmN', handN: 'handN', pauldron: 'chest', weapon: 'weapon', last: 'chest',
});
const ORDER_SE: string[] = [
  'frontDrop', 'weaponDrop', 'cloak', 'behind', 'thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN', 'upperArmF', 'forearmF', 'handF', 'farItem',
  'torso', 'fur', 'camail', 'hood', 'pouch', 'head', 'front', 'upperArmN', 'forearmN', 'handN', 'pauldron', 'weapon', 'smear', 'last', 'flash',
];
/** From behind: what is held in front goes first; the mantle and a slung pavise cover the back. */
const ORDER_NE: string[] = [
  'frontDrop', 'weaponDrop', 'front', 'farItem', 'upperArmF', 'forearmF', 'handF', 'thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN',
  'torso', 'pouch', 'cloak', 'fur', 'camail', 'hood', 'head', 'behind', 'upperArmN', 'forearmN', 'handN', 'pauldron', 'weapon', 'smear', 'last', 'flash',
];
/** Slots that are not key-art pieces on their own bone. */
const EXTRA_SLOTS: Record<string, { bone: string; att: string | null }> = {
  smear: { bone: 'weapon', att: 'smear' },
  frontDrop: { bone: 'dropF', att: null },
  weaponDrop: { bone: 'dropW', att: null },
  flash: { bone: 'root', att: 'flash' },
};

export function footSkel(kind: number, k: SKit, g: SGear, s: FootSpec): SkeletonData {
  const se = joints(manRest(k, g), s, k), ne = joints(neRest(manRest(k, g), s), s, k);
  const defs: JointDef[] = Object.keys(se).map((name) => {
    const d: JointDef = { name, from: se[name]!.from, to: se[name]!.to };
    const p = PARENT[name];
    if (p) d.parent = p;
    if (name.startsWith('foot') && !name.startsWith('footTarget')) d.inherit = 'translation';
    const n = ne[name]!;
    if (n.from[0] !== d.from[0] || n.from[1] !== d.from[1] || n.to[0] !== d.to[0] || n.to[1] !== d.to[1]) d.facing = { ne: { from: n.from, to: n.to } };
    return d;
  });
  const R = manRest(k, g);
  const pb = PIECE_BONE(s);
  const slots: SlotData[] = ORDER_SE.map((name) => (EXTRA_SLOTS[name] ? { name, bone: EXTRA_SLOTS[name]!.bone, attachment: { all: EXTRA_SLOTS[name]!.att } } : { name, bone: pb[name as ManPiece], attachment: { all: name } }));
  return {
    name: `templar-foot-${kind}`,
    body: 'foot',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: { se: ORDER_SE, ne: ORDER_NE },
    ik: [
      { name: 'legN', bones: ['thighN', 'shinN'], target: 'footTargetN', bend: 1, mix: 1, ground: R.ankN[1] },
      { name: 'legF', bones: ['thighF', 'shinF'], target: 'footTargetF', bend: 1, mix: 1, ground: R.ankF[1] },
      { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: -1, mix: s.twoHand ? 1 : 0 },
    ],
  };
}

// ------------------------------------------------------------------ the parts

/** Torso and skirt weights: chest above the ribs, spine, the belt on the pelvis, the skirt following the thighs late. */
function torsoWeights(k: SKit, facing: Facing): Weights {
  const hem = hemOf(k);
  const sg = facing === 'ne' ? -1 : 1;
  const w = weightSlots(['chest', 'spine', 'pelvis', 'skirtN', 'skirtF']);
  return ([x, y]) => {
    const a = smooth01((-9.3 - y) / 1.1);
    const b = smooth01((-7.9 - y) / 1.0);
    const sk = smooth01((y + 7.1) / (hem + 7.1 - 0.2)) * 0.95;
    // One sheet over both legs: the sides blend across the whole width, so the hem never pinches.
    const nside = 0.5 + 0.5 * Math.max(-1, Math.min(1, (0.3 - x * sg) / 2.6));
    const low = 1 - b;
    return w(a, b - a, low * (1 - sk), low * sk * nside, low * sk * (1 - nside));
  };
}
const CLOAK_W = weightSlots(['chest', 'cloak']);
const cloakWeights: Weights = ([, y]) => {
  const c = smooth01((y + 10.6) / 7.5) * 0.92;
  return CLOAK_W(1 - c, c);
};

function footParts(k: SKit, g: SGear, s: FootSpec, dark: ValueClass): AttachmentSet {
  const rest: Record<Facing, ManRest> = { se: manRest(k, g), ne: neRest(manRest(k, g), s), sw: manRest(k, g), nw: manRest(k, g) };
  const atts: AttachmentSet = {};
  for (const p of ORDER_SE) {
    if (EXTRA_SLOTS[p]) continue;
    const piece = p as ManPiece;
    if (piece === 'torso' || piece === 'cloak') {
      const bones = piece === 'torso' ? ['pelvis', 'spine', 'chest', 'skirtN', 'skirtF'] : ['chest', 'cloak'];
      atts[p] = memoSkin(`foot-${piece}`, bones, (c, ctx) => {
        const f = ctx.posed.facing;
        const m = skinMap(ctx.posed, piece === 'torso' ? torsoWeights(k, f) : cloakWeights);
        paintAs(c, dark, () => withMap(m, () => manPiece(c, k, g, piece, rest[f], { rig: true, back: f === 'ne' })));
      });
      continue;
    }
    atts[p] = (c, x, ctx) => {
      const f = ctx.posed.facing;
      paintAs(c, dark, () => withMap(partMap(x), () => manPiece(c, k, g, piece, rest[f], { rig: true, back: f === 'ne' })));
    };
  }
  // Dropped in a death: the same drawings on bones of their own.
  const dropped = (piece: ManPiece) => (c: Paper, x: PartXf, ctx: DrawCtx) => {
    const f = ctx.posed.facing;
    paintAs(c, dark, () => withMap(partMap(x), () => manPiece(c, k, g, piece, rest[f], { rig: true, back: f === 'ne' })));
  };
  atts.frontDrop = dropped('front');
  atts.weaponDrop = dropped('weapon');
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
  if (s.shoot === 'bow') {
    // The bow, drawn on the frame: from the `draw` event to the loose its string runs to the draw
    // hand, the stave bends and an arrow lies on it.
    atts.farItem = {
      cache: false,
      draw: (c, x, ctx) => {
        const drawing = ctx.events.some((e) => e.name === 'draw');
        const hn = ctx.posed.byName.handN!;
        const nock: P2 = [hn.tx, hn.ty];
        const deg = (s.farDeg ?? 174) + x.turned * 7.5;
        paintAs(c, dark, () => {
          bow(c, c.L < 2 ? [x.o[0] + 1.2, x.o[1] - 0.5] : x.o, deg, c.L < 2 ? 17 : 13.4, drawing ? 1 : 0, drawing ? nock : null);
          if (drawing) c.rod(nock, [x.o[0] + (x.o[0] - nock[0]) * 0.25, x.o[1] + (x.o[1] - nock[1]) * 0.25], 0.14, 0.12, TM.ash, { tone: 3 });
        });
      },
    };
  }
  if (s.smear) {
    const sm = smearPart('weapon', s.smear[0], s.smear[1], TM.steel);
    atts.smear = { cache: false, draw: (c, x, ctx) => paintAs(c, dark, () => sm.draw(c, x, ctx)) };
  }
  return atts;
}

// ------------------------------------------------------------------ the clips

const TAU = Math.PI * 2;
const cosT = (u: number) => Math.cos(u * TAU);
const sinT = (u: number) => Math.sin(u * TAU);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A planted-foot cycle: the stance slides the foot back along the ground (no slip against the ground as the unit moves), the swing lifts it forward. */
function footCycle(u: number, stride: number, duty: number, lift: number): { x: number; y: number; roll: number } {
  const h = stride / 2;
  const t = u - Math.floor(u);
  if (t < duty) {
    const s = t / duty;
    // Heel strike (toe up) at contact, flat through the stance, heel peeling at toe-off.
    const roll = s < 0.12 ? 14 * (1 - s / 0.12) : s > 0.8 ? -22 * ((s - 0.8) / 0.2) : 0;
    return { x: h - stride * s, y: 0, roll };
  }
  const s = (t - duty) / (1 - duty);
  const e = s * s * (3 - 2 * s);
  // The swing: toe hangs after push-off, the foot lifts highest early (heel kick), reaches forward late.
  const arc = Math.sin(Math.PI * Math.min(1, s * 1.15)) * (s < 0.87 ? 1 : 0.3);
  return { x: -h + stride * e, y: -lift * Math.max(0, arc), roll: s < 0.4 ? -22 * (1 - s / 0.4) + 6 * (s / 0.4) : 6 + 8 * ((s - 0.4) / 0.6) };
}

/** A walk (or run) for one facing: 8 keys a loop. */
function gaitKeys(f: Facing, o: { run: boolean; s: FootSpec; armN: (u: number) => Record<string, number>; armF: (u: number) => Record<string, number> }): KP[] {
  const run = o.run;
  const stride = run ? 3.6 : 2.4, duty = run ? 0.36 : 0.62, lift = run ? 1.7 : 0.75;
  const side = f === 'ne' ? 1 : -1; // where the near foot stands (screen x)
  const narrow = run ? 0.7 : 0.45; // feet track closer to the line of travel than in the stance
  const keys: KP[] = [];
  for (let i = 0; i < 8; i++) {
    const u = i / 8;
    const fn = footCycle(u, stride, duty, lift), ff = footCycle(u + 0.5, stride, duty, lift);
    // Body: lowest just after each contact (the down), highest at passing/push-off; hips over the stance foot.
    const bob = run ? 0.42 * cosT(2 * (u - 0.05)) : 0.2 * cosT(2 * (u - 0.08));
    const sway = (run ? 0.08 : 0.14) * side * sinT(u);
    keys.push({
      f: i * 1.5,
      c: EASE,
      t: {
        pelvis: [r2(sway + (run ? 0.35 : 0.05)), r2(bob + (run ? 0.25 : 0.05))],
        footTargetN: [r2(fn.x - side * narrow), r2(fn.y)],
        footTargetF: [r2(ff.x + side * narrow), r2(ff.y)],
      },
      dl: { footN: r2(fn.roll), footF: r2(ff.roll) },
      dw: {
        spine: run ? -15 : -3,
        head: run ? -6 : 0,
        ...o.armN(u),
        ...o.armF(u),
      },
    });
  }
  return keys;
}

/** The arms in the gait, per attack style (what the near hand carries). */
function gaitArms(s: FootSpec, run: boolean): { armN: (u: number) => Record<string, number>; armF: (u: number) => Record<string, number> } {
  // The near leg is forward at u = 0, so the near arm is back (counter-swing), and the forearm lags.
  const A = run ? 26 : 11;
  const swingN = (u: number) => -A * cosT(u);
  const lag = (u: number) => -A * 1.25 * cosT(u - 0.07);
  const freeArmF = (u: number) => ({ upperArmF: r2(A * cosT(u)), forearmF: r2(A * 1.25 * cosT(u - 0.07) + (run ? 55 : 6)) });
  const shieldF = (u: number) => ({ upperArmF: r2((run ? 4 : 2) * cosT(u)), forearmF: r2(run ? 10 : 0) });
  const armF = s.front === 'forearmF' || s.twoHand || s.shoot === 'crossbow' ? shieldF : freeArmF;
  let armN: (u: number) => Record<string, number>;
  switch (s.attack) {
    case 'cut':
    case 'punch':
      armN = (u) => ({ upperArmN: r2(swingN(u)), forearmN: r2(lag(u) + (run ? 60 : 0)), weapon: r2(run ? 95 + 8 * cosT(u) : lag(u) * 0.7) });
      break;
    case 'thrust':
      // The spear carried upright at the slope, bobbing with the step.
      armN = (u) => ({ upperArmN: r2(swingN(u) * 0.35), forearmN: r2(lag(u) * 0.35), weapon: run ? -40 : 0 });
      break;
    default:
      // Two-handed or a weapon carried across the body: it rides with the torso.
      armN = (u) => ({ upperArmN: r2(swingN(u) * 0.3), forearmN: r2(lag(u) * 0.3 + (run ? 20 : 0)) });
  }
  return { armN, armF };
}

// Attacks. Times: anticipation ~40%, the strike in 1-2 frames (smear), the impact held 2 frames
// (hit-stop), follow-through 2-3, the settle the rest (docs/art-references/motion-reference.md §6).

/** A one-handed cut from the shoulder (Zornhau): weight back, blade over the shoulder; hips turn, then the arm whips through; a step in with the front foot. */
function cutKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      // The blade comes up in front of the body, hilt to the chest…
      { f: 1.5, c: EASE, t: { pelvis: [-0.15, 0.05] }, w: { upperArmN: 40, forearmN: 150, weapon: 176 }, dw: { spine: 4, upperArmF: 8, forearmF: 10 } },
      // …and over the shoulder (vom Tag): weight back, the shield out.
      { f: 3, c: EASE_IN, t: { pelvis: [-0.35, 0.1] }, w: { upperArmN: 160, forearmN: 210, weapon: 228 }, dw: { spine: 9, head: 4, upperArmF: 16, forearmF: 18 } },
      { f: 4, c: 'linear', t: { pelvis: [0.05, 0.2], footTargetF: [0.45, -0.45] }, w: { upperArmN: 140, forearmN: 160, weapon: 170 }, dw: { spine: 0, head: 0, upperArmF: 12, forearmF: 12 } },
      { f: 5, c: EASE_OUT, t: { pelvis: [0.55, 0.32], footTargetF: [0.95, 0] }, w: { upperArmN: 95, forearmN: 92, weapon: 92 }, dw: { spine: -15, head: -6, upperArmF: -6, forearmF: 8 } },
      { f: 6, c: EASE, t: { pelvis: [0.7, 0.42], footTargetF: [0.95, 0] }, w: { upperArmN: 62, forearmN: 42, weapon: 40 }, dw: { spine: -20, head: -8, upperArmF: -12, forearmF: 4 } },
      { f: 7, c: EASE, t: { pelvis: [0.7, 0.44], footTargetF: [0.95, 0] }, w: { upperArmN: 56, forearmN: 34, weapon: 30 }, dw: { spine: -21, head: -8, upperArmF: -12, forearmF: 4 } },
      { f: 9, c: EASE, t: { pelvis: [0.35, 0.2], footTargetF: [0.5, -0.3] }, w: { upperArmN: 20, forearmN: 20, weapon: 22 }, dw: { spine: -8, head: -3 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 6, name: 'hit' }],
  };
}

/** An overarm spear thrust over the shield, driven from the back foot: the point travels straight along the shaft, fast out, slow back. */
function thrustKeys(): { keys: KP[]; ev: AnimEvent[] } {
  // Spear levelled at ~100° (forward, a little down), the fist above the shoulder.
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 2, c: EASE, t: { pelvis: [-0.1, 0.05] }, w: { upperArmN: 150, forearmN: 88, weapon: 100 }, dw: { spine: 3, upperArmF: 14, forearmF: 16 } },
      { f: 4, c: EASE_IN, t: { pelvis: [-0.45, 0.15] }, w: { upperArmN: 168, forearmN: 112, weapon: 100 }, dw: { spine: 8, head: 2, upperArmF: 18, forearmF: 18 } },
      { f: 6, c: EASE_OUT, t: { pelvis: [0.6, 0.35], footTargetF: [0.8, 0] }, w: { upperArmN: 112, forearmN: 98, weapon: 100 }, dw: { spine: -16, head: -6, upperArmF: 8, forearmF: 12 } },
      { f: 7, c: EASE, t: { pelvis: [0.65, 0.38], footTargetF: [0.8, 0] }, w: { upperArmN: 108, forearmN: 98, weapon: 100 }, dw: { spine: -17, head: -6, upperArmF: 8, forearmF: 12 } },
      { f: 10, c: EASE, t: { pelvis: [0.15, 0.1], footTargetF: [0.3, -0.25] }, w: { upperArmN: 150, forearmN: 90, weapon: 100 }, dw: { spine: -2, upperArmF: 12, forearmF: 14 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 5, name: 'smear', len: 1, bone: 'weapon' }, { f: 6, name: 'hit' }],
  };
}

/** A javelin jab underarm. */
function jabKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 3, c: EASE_IN, t: { pelvis: [-0.4, 0.15] }, w: { upperArmN: -30, forearmN: 60, weapon: 95 }, dw: { spine: 6 } },
      { f: 5, c: EASE_OUT, t: { pelvis: [0.55, 0.3], footTargetF: [0.8, 0] }, w: { upperArmN: 60, forearmN: 88, weapon: 95 }, dw: { spine: -14, head: -5 } },
      { f: 6, c: EASE, t: { pelvis: [0.6, 0.32], footTargetF: [0.8, 0] }, w: { upperArmN: 64, forearmN: 90, weapon: 95 }, dw: { spine: -15, head: -5 } },
      { f: 9, c: EASE, t: { pelvis: [0.2, 0.1], footTargetF: [0.3, -0.2] }, w: { upperArmN: 0, forearmN: 70, weapon: 110 }, dw: { spine: -4 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'hit' }],
  };
}

/** The two-handed overhead chop (Muybridge's woodchopper): rise up and back, drop the body into it, the bit lagging the hands, the trunk folding, knees bending. */
function chopKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 4, c: EASE_IN, t: { pelvis: [-0.3, -0.25] }, w: { upperArmN: 168, forearmN: 200, weapon: 215 }, dw: { spine: 12, head: 6 } },
      { f: 5, c: 'linear', t: { pelvis: [0.1, 0.15] }, w: { upperArmN: 150, forearmN: 150, weapon: 160 }, dw: { spine: 0, head: 0 } },
      { f: 6, c: EASE_OUT, t: { pelvis: [0.55, 0.65], footTargetF: [0.6, 0] }, w: { upperArmN: 92, forearmN: 80, weapon: 70 }, dw: { spine: -24, head: -10 } },
      { f: 7, c: EASE, t: { pelvis: [0.6, 0.75], footTargetF: [0.6, 0] }, w: { upperArmN: 80, forearmN: 62, weapon: 48 }, dw: { spine: -28, head: -12 } },
      { f: 8, c: EASE, t: { pelvis: [0.58, 0.72], footTargetF: [0.6, 0] }, w: { upperArmN: 82, forearmN: 66, weapon: 56 }, dw: { spine: -26, head: -11 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 5, name: 'smear', len: 2, bone: 'weapon' }, { f: 7, name: 'hit' }],
  };
}

/** A crossbow butt-stroke: the stock rammed forward. */
function buttKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 3, c: EASE_IN, t: { pelvis: [-0.35, 0.1] }, dw: { spine: 8, upperArmN: -25, forearmN: -10, weapon: -30, upperArmF: -15 } },
      { f: 5, c: EASE_OUT, t: { pelvis: [0.5, 0.3], footTargetF: [0.7, 0] }, dw: { spine: -14, upperArmN: 45, forearmN: 30, weapon: 40, upperArmF: 30, forearmF: 20 } },
      { f: 6, c: EASE, t: { pelvis: [0.55, 0.32], footTargetF: [0.7, 0] }, dw: { spine: -15, upperArmN: 48, forearmN: 32, weapon: 40, upperArmF: 32, forearmF: 20 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 4, name: 'smear', len: 1, bone: 'weapon' }, { f: 5, name: 'hit' }],
  };
}

/** A lunging blow with the near fist (archers' last resort). */
function punchKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 3, c: EASE_IN, t: { pelvis: [-0.3, 0.1] }, w: { upperArmN: -25, forearmN: 80 }, dw: { spine: 6 } },
      { f: 5, c: EASE_OUT, t: { pelvis: [0.5, 0.3], footTargetF: [0.7, 0] }, w: { upperArmN: 85, forearmN: 90 }, dw: { spine: -14, head: -4 } },
      { f: 6, c: EASE, t: { pelvis: [0.5, 0.3], footTargetF: [0.7, 0] }, w: { upperArmN: 82, forearmN: 88 }, dw: { spine: -14, head: -4 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0] } },
    ],
    ev: [{ f: 5, name: 'hit' }],
  };
}

/** Struck: frame 0 is the impact (no wind-up): the struck shoulder and head snap back, the trunk follows, the rear foot steps back to catch the weight, then he recovers. */
function hitKeys(): KP[] {
  return [
    { f: 0, c: EASE_OUT, t: { pelvis: [-0.3, 0.1] }, dw: { spine: 14, head: 16, upperArmN: 18, forearmN: 30, upperArmF: 12, forearmF: 10 } },
    { f: 1, c: EASE, t: { pelvis: [-0.6, 0.25], footTargetN: [-0.55, -0.3] }, dw: { spine: 19, head: 22, upperArmN: 26, forearmN: 40, upperArmF: 16, forearmF: 14 } },
    { f: 2, c: EASE, t: { pelvis: [-0.45, 0.2], footTargetN: [-0.6, 0] }, dw: { spine: 9, head: 8, upperArmN: 10, forearmN: 16, upperArmF: 6, forearmF: 6 } },
    { f: 4, t: { pelvis: [-0.1, 0], footTargetN: [-0.2, 0] }, dw: { spine: 1 } },
  ];
}

/**
 * Death. 'back' (Muybridge's knock-down): the head snaps back, the knees buckle under an upright
 * trunk, the arms fly up, the seat lands, then the back, the legs swing up and drop. 'crumple':
 * the knees go first, then a hip, then a shoulder, face down.
 */
function dieKeys(kind: 'back' | 'crumple'): { keys: KP[]; ev: AnimEvent[] } {
  const on = { legN: 1, legF: 1 }, off = { legN: 0, legF: 0 };
  if (kind === 'back')
    return {
      keys: [
        { f: 0, c: EASE_OUT, ik: on, t: { pelvis: [-0.25, 0.05] }, dw: { spine: 14, head: 20, upperArmN: 30, forearmN: 40, upperArmF: 20 } },
        { f: 2, c: EASE_IN, ik: on, t: { pelvis: [-0.55, 1.9] }, dw: { spine: 10, head: 16, upperArmN: 90, forearmN: 110, upperArmF: 26, forearmF: 30, weapon: 40 } },
        { f: 4, c: EASE_IN, ik: off, t: { pelvis: [-1.1, 4.6] }, dl: { pelvis: 30 }, w: { thighN: 70, shinN: 5, thighF: 78, shinF: 10, upperArmN: 150, forearmN: 150, upperArmF: 62, forearmF: 84 } },
        { f: 6, c: EASE_OUT, ik: off, t: { pelvis: [-1.7, 5.3] }, dl: { pelvis: 70, head: 10 }, w: { thighN: 100, shinN: 60, thighF: 110, shinF: 70, upperArmN: 222, forearmN: 232, upperArmF: 74, forearmF: 70, weapon: 230 } },
        { f: 8, c: EASE, ik: off, t: { pelvis: [-2.0, 5.55] }, dl: { pelvis: 88, head: 12 }, w: { thighN: 112, shinN: 86, thighF: 120, shinF: 96, upperArmN: 262, forearmN: 272, upperArmF: 84, forearmF: 76, weapon: 262 } },
        { f: 11, ik: off, t: { pelvis: [-2.0, 5.75] }, dl: { pelvis: 90, head: 6 }, w: { thighN: 84, shinN: 92, thighF: 92, shinF: 98, upperArmN: 272, forearmN: 282, upperArmF: 90, forearmF: 84, weapon: 280 } },
      ],
      ev: [{ f: 6, name: 'land' }],
    };
  return {
    keys: [
      { f: 0, c: EASE_OUT, ik: on, t: { pelvis: [-0.2, 0.1] }, dw: { spine: 10, head: 14, upperArmN: 14, upperArmF: 10 } },
      { f: 2, c: EASE_IN, ik: on, t: { pelvis: [0.2, 2.2] }, dw: { spine: -20, head: -10, upperArmN: -10, forearmN: 20, upperArmF: 20, forearmF: 20 } },
      { f: 4, c: EASE, ik: off, t: { pelvis: [0.5, 4.4] }, dl: { pelvis: -18 }, w: { thighN: 80, shinN: -10, thighF: 75, shinF: -15, upperArmN: 40, forearmN: 60, upperArmF: 50, forearmF: 70 } },
      { f: 7, c: EASE_IN, ik: off, t: { pelvis: [1.0, 5.0] }, dl: { pelvis: -55, head: -8 }, w: { thighN: 70, shinN: -30, thighF: 60, shinF: -35, upperArmN: 80, forearmN: 100, upperArmF: 90, forearmF: 110 } },
      { f: 9, c: EASE_OUT, ik: off, t: { pelvis: [1.4, 5.6] }, dl: { pelvis: -86, head: -12 }, w: { thighN: 20, shinN: -60, thighF: 10, shinF: -70, upperArmN: 120, forearmN: 100, upperArmF: 130, forearmF: 110 } },
      { f: 11, ik: off, t: { pelvis: [1.4, 5.75] }, dl: { pelvis: -90, head: -6 }, w: { thighN: -10, shinN: -80, thighF: -20, shinF: -85, upperArmN: 110, forearmN: 90, upperArmF: 125, forearmF: 100 } },
    ],
    ev: [{ f: 9, name: 'land' }],
  };
}

/** Brace: the shield wall (crouched behind the shield punched forward, blade over the rim), the spear set against horse (butt at the back foot, point at the horse's chest), a ready crouch. */
function braceKeys(b: Brace): KP[] {
  const low = (dy: number, x = 0.1) => ({ pelvis: [x, dy] as P2, footTargetN: [-0.55, 0] as P2, footTargetF: [0.5, 0] as P2 });
  switch (b) {
    case 'shield':
      return [{ f: 0, t: low(0.65), dw: { spine: -12, head: -2, upperArmF: 24, forearmF: 18 }, w: { upperArmN: 70, forearmN: 105, weapon: 100 } }];
    case 'spear':
      return [{ f: 0, t: low(0.85, -0.2), dw: { spine: -16, head: 4, upperArmF: 20, forearmF: 16 }, w: { upperArmN: 25, forearmN: 80, weapon: 118 } }];
    case 'axe':
      return [{ f: 0, t: low(0.6), dw: { spine: -10, head: -2 }, w: { upperArmN: 40, forearmN: 95, weapon: 150 } }];
    default:
      return [{ f: 0, t: low(0.55), dw: { spine: -10, head: -2, upperArmN: 10, forearmN: 20, upperArmF: 10, forearmF: 15 } }];
  }
}

/** Javelin: withdraw (arm straight back at shoulder height, body leaning back over the bent rear leg), block (front leg planted straight), deliver over it, follow through. */
function javelinKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 4, c: EASE_IN, t: { pelvis: [-0.6, 0.35] }, w: { upperArmN: 210, forearmN: 250, weapon: 105 }, dw: { spine: 16, head: 2, upperArmF: 40, forearmF: 60 } },
      { f: 6, c: EASE_OUT, t: { pelvis: [0.3, 0.1], footTargetF: [0.9, 0] }, w: { upperArmN: 140, forearmN: 120, weapon: 115 }, dw: { spine: -12, head: -5, upperArmF: -10, forearmF: 20 } },
      { f: 7, c: EASE, t: { pelvis: [0.7, 0.3], footTargetF: [0.9, 0] }, w: { upperArmN: 60, forearmN: 40 }, dw: { spine: -24, head: -10, upperArmF: -20, forearmF: 10 } },
      { f: 9, c: EASE, t: { pelvis: [0.55, 0.22], footTargetF: [0.9, 0], footTargetN: [0.4, -0.6] }, w: { upperArmN: 10, forearmN: 20 }, dw: { spine: -18, head: -6 } },
      { f: 11, t: { pelvis: [0, 0], footTargetF: [0, 0], footTargetN: [0, 0] } },
    ],
    ev: [{ f: 6, name: 'release' }],
  };
}

/** The war bow: raise, draw with the back to the jaw, hold, loose (the draw hand flies back), follow-through held. */
function bowKeys(): { keys: KP[]; ev: AnimEvent[] } {
  // The bow arm (far) out forward at shoulder height; the draw hand (near) comes back to the jaw.
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 3, c: EASE, w: { upperArmF: 95, forearmF: 100, itemF: 178, upperArmN: 85, forearmN: 100 }, dw: { spine: 2, head: -2 } },
      { f: 6, c: 'stepped', w: { upperArmF: 92, forearmF: 96, itemF: 180, upperArmN: 105, forearmN: 255 }, dw: { spine: 4, head: -3 } },
      { f: 7, c: EASE_OUT, w: { upperArmF: 92, forearmF: 96, itemF: 180, upperArmN: 112, forearmN: 255 }, dw: { spine: 4, head: -3 } },
      { f: 8, c: EASE, w: { upperArmF: 88, forearmF: 92, itemF: 182, upperArmN: 80, forearmN: 285 }, dw: { spine: 6, head: -3 } },
      { f: 11 },
    ],
    ev: [{ f: 7, name: 'release' }],
  };
}

/** The crossbow: shoulder it, aim, loose at frame 3 (a small jolt), then the reload: stoop, hook the string on the belt claw, stand to span it. */
function crossbowKeys(): { keys: KP[]; ev: AnimEvent[] } {
  return {
    keys: [
      { f: 0, c: EASE },
      { f: 2, c: 'stepped', w: { upperArmN: 70, forearmN: 120, weapon: 92 }, dw: { spine: -4, head: -6, upperArmF: 50, forearmF: 60 } },
      { f: 3, c: EASE_OUT, t: { pelvis: [-0.15, 0] }, w: { upperArmN: 66, forearmN: 126, weapon: 98 }, dw: { spine: 0, head: -4, upperArmF: 48, forearmF: 64 } },
      { f: 5, c: EASE, t: { pelvis: [0, 0.1] }, w: { upperArmN: 20, forearmN: 60, weapon: 140 }, dw: { spine: -4 } },
      { f: 7, c: EASE, t: { pelvis: [0.1, 1.2] }, w: { upperArmN: 10, forearmN: 30, weapon: 175 }, dw: { spine: -35, head: 10, upperArmF: 20 } },
      { f: 9, c: EASE, t: { pelvis: [0.05, 0.4] }, w: { upperArmN: 5, forearmN: 25, weapon: 175 }, dw: { spine: -12, head: 4 } },
      { f: 11 },
    ],
    ev: [{ f: 3, name: 'release' }],
  };
}

const ATTACKS: Record<Attack, () => { keys: KP[]; ev: AnimEvent[] }> = { cut: cutKeys, thrust: thrustKeys, jab: jabKeys, chop: chopKeys, butt: buttKeys, punch: punchKeys };
const SHOOTS: Record<Exclude<Shoot, null>, () => { keys: KP[]; ev: AnimEvent[] }> = { javelin: javelinKeys, bow: bowKeys, crossbow: crossbowKeys };

/** Cloth bones driven late by the body. */
function cloth(run: number): LagSpec[] {
  return [
    { bone: 'skirtN', follow: 'thighN', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'skirtF', follow: 'thighF', k: 0.4, lag: 1.5, bias: -6 * run, plumb: 0.35 },
    { bone: 'cloak', follow: 'pelvis', k: 0.35, lag: 2, bias: -9 * run, plumb: 0.55 },
  ];
}

/** A per-facing clip with an overlay track (breathing) on each facing. */
export function overlay(c: Clip, over: Track): Clip {
  const fc = c as FacingClips;
  return { byFacing: { se: [{ anim: fc.byFacing.se as AnimationData }, over], ne: [{ anim: fc.byFacing.ne as AnimationData }, over] } };
}

export function footClips(skel: SkeletonData, s: FootSpec): ClipSet {
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => readonly KP[], ev: AnimEvent[] = [], run = 0): Clip =>
    lagCloth(skel, facingClip(skel, name, n, loop, keys, ev), n, loop, cloth(run));
  const idleBase = fc('idle', 8, true, () => [{ f: 0 }]);
  const idle = overlay(idleBase, { anim: BREATH });
  const walk = fc('walk', 12, true, (f) => gaitKeys(f, { run: false, s, ...gaitArms(s, false) }), [{ f: 0, name: 'step', str: 'N' }, { f: 6, name: 'step', str: 'F' }], 0.3);
  const run = fc('run', 12, true, (f) => gaitKeys(f, { run: true, s, ...gaitArms(s, true) }), [{ f: 0, name: 'step', str: 'N' }, { f: 6, name: 'step', str: 'F' }], 1);
  const at = ATTACKS[s.attack]();
  const attack = fc('attack', 12, false, () => at.keys, at.ev);
  const sh = s.shoot ? SHOOTS[s.shoot]() : null;
  const shoot = sh ? fc('shoot', 12, false, () => sh.keys, sh.ev) : attack;
  const hit = fc('hit', 5, false, () => hitKeys());
  const d = dieKeys(s.die);
  const die = fc('die', 12, false, () => d.keys, d.ev);
  const last = d.keys.at(-1)!;
  const dead = fc('dead', 1, false, () => [{ ...last, f: 0 }]);
  const braceBase = fc('brace', 8, true, () => braceKeys(s.brace));
  const brace = overlay(braceBase, { anim: BREATH, alpha: 0.6 });
  return { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Shoot]: shoot, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
}

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
/** The rig of a Templar foot kind (built once). */
export function footRig(kind: number): SkeletonRig | undefined {
  const got = RIGS.get(kind);
  if (got) return got;
  const f = FOOT[kind], s = FOOT_SPECS[kind];
  if (!f || !s) return undefined;
  const skel = footSkel(kind, f.kit, f.gear, s);
  const R = manRest(f.kit, f.gear);
  const { clips, attacks } = mocapFootClips(skel, { ...s, farHeld: s.front === 'forearmF' || !!s.twoHand || s.shoot === 'crossbow', shield: s.front === 'forearmF', stance: R.ankF[0] - R.ankN[0] });
  const rig: SkeletonRig = { skel, atts: footParts(f.kit, f.gear, s, f.cls ?? f.dark), clips, ...(attacks.length > 1 ? { attacks } : {}) };
  RIGS.set(kind, rig);
  return rig;
}

/** Registers the foot kinds drawn on bones (called by templar.ts after its own registrations, so these win). */
export function registerFootRigs(kinds: readonly number[]): void {
  for (const k of kinds) {
    const s = FOOT_SPECS[k];
    if (!FOOT[k] || !s) continue;
    // Built on the kind's first frame (mocapFootClips: one attack per blow).
    registerPaperKind('templar', k, lazySkeletonKind({ body: 'foot', anims: s.shoot ? ALL_ANIMS : WITH_ADVANCE, blows: (s.blows ?? [s.attack]).length }, () => footRig(k)!));
  }
}
void buildAnim;
