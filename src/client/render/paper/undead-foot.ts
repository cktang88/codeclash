// The Hollow Host's foot kinds on bones, rebuilt from the approved key art (undead-static.ts):
// the key art's pieces ride a man's bones (undead-rig.ts `mapped`), and the clips are the mocap
// with the undead's own way of moving laid over it (undead-clips.ts). See
// docs/art-references/undead-animation.md.

import type { P2, Paper } from './core.ts';
import type { Facing } from './facing.ts';
import { Anim } from '../contract.ts';
import type { BasePose } from './rig.ts';
import { registerPaperKind } from './registry.ts';
import { bonesFromJoints, drawRigFrame, restPose, smearPart, type Attachment, type AttachmentSet, type DrawCtx, type JointDef, type PartXf, type Posed, type SkeletonData, type SkeletonRig, type SlotData } from './skeleton.ts';
import { boneAff, type Aff } from './templar-rig.ts';
import { boneMap, mapped, type UMap } from './undead-rig.ts';
import { keyLight, type FootArt, type UJ, type UPiece } from './undead-static.ts';
import { shadeLower, UM } from './undead-parts.ts';
import { footClips, type FootClipSpec } from './undead-clips.ts';

// ------------------------------------------------------------------ the spec of a kind

export interface FootSpec extends FootClipSpec {
  art: FootArt;
  /** The weapon's key-art angle in the near hand and the item's in the far (rig degrees). */
  nearDeg: number;
  farDeg?: number;
  /** The skull the jaw hangs from: centre, radius and tilt as the key art draws it. */
  skull: { at: P2; r: number; ang: number };
  /** The jaw's hinge and chin, where the skull's frame does not give them. */
  jaw?: { hinge: P2; chin: P2 };
  /** Weapon reach for the smear (units from the fist), and its material. */
  smear?: [number, number];
  smearMat?: number;
  /** Slots drawn first from behind (held in front of the body: the shield, a bow), then the rest. */
  neFirst?: string[];
  /** Slots drawn last from behind (on the back: a quiver, a pavise, a cloak). */
  neLast?: string[];
  /** The draw hand stays on the bowstring (the nock bone) by IK. */
  nocked?: boolean;
  /** Slots not drawn from behind (a far arm reaching across, hidden by the body). */
  neHide?: string[];
}

// ------------------------------------------------------------------ the skeleton

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const along = (p: P2, deg: number, len: number): P2 => [r6(p[0] + Math.sin((deg * Math.PI) / 180) * len), r6(p[1] + Math.cos((deg * Math.PI) / 180) * len)];
const angOf = (a: P2, b: P2): number => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;

/** The NE rest joints: hips, legs and shoulders swap sides about the axis; arms mirror or move with their shoulder. */
export function neJoints(art: FootArt): UJ {
  const J = art.J, ax = art.axis;
  const mx = (p: P2): P2 => [r6(2 * ax - p[0]), p[1]];
  const out: UJ = { ...J };
  for (const n of ['hipN', 'hipF', 'kneeN', 'kneeF', 'ankN', 'ankF', 'shN', 'shF']) if (J[n]) out[n] = mx(J[n]!);
  for (const s of ['N', 'F'] as const) {
    const mode = art.ne?.[s] ?? 'shift';
    const sh = J[`sh${s}`]!, sh1 = out[`sh${s}`]!;
    for (const j of [`el${s}`, `h${s}`]) if (J[j]) out[j] = mode === 'mirror' ? mx(J[j]!) : add(J[j]!, sub(sh1, sh));
  }
  // A second grip on the weapon moves with the weapon hand.
  if (J.grip) out.grip = add(J.grip, sub(out.hN!, J.hN!));
  return out;
}

function joints(J: UJ, s: FootSpec): Record<string, { from: P2; to: P2 }> {
  const pel = J.pelvis ?? [(J.hipN![0] + J.hipF![0]) / 2, (J.hipN![1] + J.hipF![1]) / 2 - 0.05];
  const hN = J.hN!, hF = J.hF!;
  const sk = s.skull;
  // The jaw hinges under the ear and runs to the chin (the skull's own frame), or as the spec says.
  const hinge = s.jaw?.hinge ?? add(sk.at, rot([-0.35 * sk.r, 0.45 * sk.r], sk.ang));
  const chin = s.jaw?.chin ?? add(sk.at, rot([0.6 * sk.r, 1.3 * sk.r], sk.ang));
  // A hunched back runs its spine bones along the hunch.
  const waist: P2 = J.waist ?? [pel[0] - 0.1, pel[1] - 1.65];
  const mid: P2 = J.mid ?? [pel[0] - 0.05, pel[1] - 3.25];
  const grip = J.grip;
  return {
    root: { from: [0, 0], to: [0, 0] },
    pelvis: { from: pel, to: waist },
    spine: { from: waist, to: mid },
    chest: { from: mid, to: J.neck! },
    neck: { from: J.neck!, to: J.head! },
    head: { from: J.head!, to: add(J.head!, [0.1, -1.2]) },
    jaw: { from: hinge, to: chin },
    upperArmN: { from: J.shN!, to: J.elN! },
    forearmN: { from: J.elN!, to: hN },
    handN: { from: hN, to: along(hN, angOf(J.elN!, hN), 0.5) },
    weapon: { from: hN, to: along(hN, s.nearDeg, 4) },
    grip2: grip ? { from: grip, to: grip } : { from: along(hN, s.nearDeg, s.twoHand ?? 1.3), to: along(hN, s.nearDeg, s.twoHand ?? 1.3) },
    upperArmF: { from: J.shF!, to: J.elF! },
    forearmF: { from: J.elF!, to: hF },
    handF: { from: hF, to: along(hF, angOf(J.elF!, hF), 0.5) },
    itemF: { from: hF, to: along(hF, s.farDeg ?? 0, 3) },
    thighN: { from: J.hipN!, to: J.kneeN! },
    shinN: { from: J.kneeN!, to: J.ankN! },
    footN: { from: J.ankN!, to: add(J.ankN!, [1.1, 0.4]) },
    thighF: { from: J.hipF!, to: J.kneeF! },
    shinF: { from: J.kneeF!, to: J.ankF! },
    footF: { from: J.ankF!, to: add(J.ankF!, [1.1, 0.4]) },
    // Cloth that trails: the skirt from the belt and the cloak from the shoulders.
    skirt: { from: [pel[0] + 0.2, pel[1] - 1.0], to: [pel[0] + 0.2, -2.6] },
    cloak: { from: [J.neck![0] - 0.2, J.neck![1] + 0.4], to: [J.neck![0] - 0.2, -0.6] },
    // The bowstring's nock: the draw hand reaches it by IK, and it slides back along the arrow.
    nock: { from: hN, to: hN },
    footTargetN: { from: J.ankN!, to: J.ankN! },
    footTargetF: { from: J.ankF!, to: J.ankF! },
  };
}
/** The joints with a free bone for each thing that falls away in the death, at rest where its holder is. */
function withDrops(j: Record<string, { from: P2; to: P2 }>, s: FootSpec): Record<string, { from: P2; to: P2 }> {
  const out = { ...j };
  for (const d of s.drops) out[`drop_${d.slot}`] = { ...j[d.holder]! };
  return out;
}
const rot = (p: P2, deg: number): P2 => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [r6(p[0] * c - p[1] * s), r6(p[0] * s + p[1] * c)];
};
export const PARENT: Record<string, string | undefined> = {
  root: undefined, pelvis: 'root', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head',
  upperArmN: 'chest', forearmN: 'upperArmN', handN: 'forearmN', weapon: 'handN', grip2: 'weapon',
  upperArmF: 'chest', forearmF: 'upperArmF', handF: 'forearmF', itemF: 'handF',
  thighN: 'pelvis', shinN: 'thighN', footN: 'shinN', thighF: 'pelvis', shinF: 'thighF', footF: 'shinF',
  skirt: 'pelvis', cloak: 'chest', nock: 'itemF', footTargetN: 'root', footTargetF: 'root',
};

/** Slots that are not key-art pieces: smears, what falls in a death, the key light and the hit flash. */
const EXTRA: Record<string, { bone: string; att: string | null }> = {
  smear: { bone: 'weapon', att: 'smear' },
  light: { bone: 'root', att: 'light' },
  flash: { bone: 'root', att: 'flash' },
};

export function footSkel(name: string, s: FootSpec): SkeletonData {
  const se = withDrops(joints(s.art.J, s), s), ne = withDrops(joints(neJoints(s.art), s), s);
  const defs: JointDef[] = Object.keys(se).map((n) => {
    const d: JointDef = { name: n, from: se[n]!.from, to: se[n]!.to };
    const p = n.startsWith('drop_') ? 'root' : PARENT[n];
    if (p) d.parent = p;
    if (n === 'footN' || n === 'footF') d.inherit = 'translation';
    const b = ne[n]!;
    if (b.from[0] !== d.from[0] || b.from[1] !== d.from[1] || b.to[0] !== d.to[0] || b.to[1] !== d.to[1]) d.facing = { ne: { from: b.from, to: b.to } };
    return d;
  });
  const pieces = s.art.pieces.map((p) => p.slot);
  const dropSlots = s.drops.map((d) => `${d.slot}Drop`);
  // What falls in a death lies beside the heap: drawn over it.
  const se0 = [...pieces, ...dropSlots, 'smear', 'light', 'flash'];
  const first = s.neFirst ?? ['front'], last = s.neLast ?? [];
  const legs = ['thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN'];
  const nearArm = ['weapon', 'upperArmN', 'forearmN', 'handN'];
  const has = (n: string) => pieces.includes(n);
  const body = pieces.filter((n) => !first.includes(n) && !last.includes(n) && !legs.includes(n) && !nearArm.includes(n) && !/F$/.test(n));
  const farArm = pieces.filter((n) => /F$/.test(n) && !legs.includes(n) && !first.includes(n) && !last.includes(n));
  const ne0 = [...first.filter(has), ...farArm, ...legs.filter(has), ...body, ...last.filter(has), ...nearArm.filter(has), ...dropSlots, 'smear', 'light', 'flash'];
  const bone = new Map(s.art.pieces.map((p) => [p.slot, p.bone] as const));
  const slots: SlotData[] = se0.map((n) => (dropSlots.includes(n) ? { name: n, bone: `drop_${n.slice(0, -4)}`, attachment: { all: null } } : EXTRA[n] ? { name: n, bone: EXTRA[n]!.bone, attachment: { all: EXTRA[n]!.att } } : { name: n, bone: bone.get(n)!, attachment: s.neHide?.includes(n) ? { all: n, ne: '' } : { all: n } }));
  return {
    name: `undead-foot-${name}`,
    body: 'foot',
    bones: bonesFromJoints(defs),
    slots,
    drawOrder: { se: se0, ne: ne0 },
    ik: [
      { name: 'legN', bones: ['thighN', 'shinN'], target: 'footTargetN', bend: 1, mix: 1, ground: s.art.J.ankN![1] },
      { name: 'legF', bones: ['thighF', 'shinF'], target: 'footTargetF', bend: 1, mix: 1, ground: s.art.J.ankF![1] },
      { name: 'armF2h', bones: ['upperArmF', 'forearmF'], target: 'grip2', bend: -1, mix: s.twoHand ? 1 : 0 },
      { name: 'armN2h', bones: ['upperArmN', 'forearmN'], target: 'nock', bend: -1, mix: s.nocked ? 1 : 0 },
    ],
  };
}

// ------------------------------------------------------------------ the parts

const affMap = (m: Aff): UMap => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return {
    f: (p) => [m[0] * p[0] + m[1] * p[1] + m[4], m[2] * p[0] + m[3] * p[1] + m[5]],
    inv: (p) => {
      const x = p[0] - m[4], y = p[1] - m[5];
      return [(m[3] * x - m[1] * y) / det, (-m[2] * x + m[0] * y) / det];
    },
  };
};

/** A bone's map from the rest pose to now, read from the posed frame (for parts drawn on the frame). */
export function posedMap(p: Posed, bone: string): UMap {
  const rest = restPose(p.skel, p.level, p.facing);
  const b = p.byName[bone]!;
  return affMap(boneAff(b, rest.bones[b.i]!));
}

/** How far a trailing bone hangs off its parent's line now, from rest (deg). */
export function trail(p: Posed, bone: string): number {
  const rest = restPose(p.skel, p.level, p.facing);
  const b = p.byName[bone]!, parent = p.skel.bones[b.i]!.parent!;
  const q = p.byName[parent]!;
  const rb = rest.byName[bone]!, rq = rest.byName[parent]!;
  return b.raw - q.raw - (rb.raw - rq.raw);
}

/** A piece as a part: cached on its bone, or (cloth) drawn on the frame from its parent's map with the trail's sway. */
export function pieceAtt(p: UPiece, J: Record<Facing, UJ>, axis: number, clothLen = 4.6): Attachment {
  if (p.cloth) {
    return {
      cache: false,
      draw: (c, _x, ctx) => {
        const f = ctx.posed.facing, back = f === 'ne';
        const parent = ctx.posed.skel.bones.find((b) => b.name === p.bone)!.parent!;
        // The hem's swing in units (whole pixels, so it does not crawl), + forward.
        const sway = c.qn(Math.max(-2.2, Math.min(2.2, Math.sin((trail(ctx.posed, p.bone) * Math.PI) / 180) * (p.clothLen ?? clothLen))));
        mapped(c, posedMap(ctx.posed, parent), p.mirror && back ? axis : false, () => p.draw(c, J[f], back, { sway }));
      },
    };
  }
  if (p.live) {
    // Read from the frame (a bow's draw from where the string hand is): drawn on the frame.
    const live = p.live;
    return {
      cache: false,
      draw: (c, _x, ctx) => {
        const f = ctx.posed.facing, back = f === 'ne';
        mapped(c, posedMap(ctx.posed, p.bone), p.mirror && back ? axis : false, () => p.draw(c, J[f], back, live(ctx, J[f])));
      },
    };
  }
  return {
    draw: (c: Paper, x: PartXf, ctx: DrawCtx) => {
      const f = ctx.posed.facing, back = f === 'ne';
      mapped(c, boneMap(x), p.mirror && back ? axis : false, () => p.draw(c, J[f], back, {}));
    },
  };
}

/** The hit flash: on the impact frame every pixel of the figure goes two tones lighter. */
export const FLASH: Attachment = {
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
/** The key art's light: soul-fire lights the bone near it, a rim on hard edges turned from the key. */
export const LIGHT: Attachment = {
  cache: false,
  draw: (c) => {
    keyLight(c);
    // At levels 1-2 a figure is 13-26 px tall: the light from above has to show as a darker
    // lower body, or each part's light reads from the side (the lint's light direction).
    if (c.L <= 2) shadeLower(c, c.L <= 1 ? 0.36 : 0.42);
  },
};

function footParts(s: FootSpec): AttachmentSet {
  const J: Record<Facing, UJ> = { se: s.art.J, ne: neJoints(s.art), sw: s.art.J, nw: s.art.J };
  const atts: AttachmentSet = {};
  for (const p of s.art.pieces) atts[p.slot] = pieceAtt(p, J, s.art.axis);
  // Dropped in a death: the same drawings on free bones.
  for (const d of s.drops) {
    const p = s.art.pieces.find((q) => q.slot === d.slot)!;
    atts[`${d.slot}Drop`] = pieceAtt({ ...p, bone: `drop_${d.slot}`, cloth: false }, J, s.art.axis);
  }
  atts.flash = FLASH;
  atts.light = LIGHT;
  if (s.smear) atts.smear = smearPart('weapon', s.smear[0], s.smear[1], s.smearMat ?? UM.steel);
  return atts;
}

// ------------------------------------------------------------------ registration

const RIGS = new Map<number, SkeletonRig>();
export function footRig(kind: number, s: FootSpec): SkeletonRig {
  const got = RIGS.get(kind);
  if (got) return got;
  const skel = footSkel(String(kind), s);
  const rig: SkeletonRig = { skel, atts: footParts(s), clips: footClips(skel, s) };
  RIGS.set(kind, rig);
  return rig;
}
/**
 * Registers a kind drawn on bones. The rig is built on first use, not here: undead.ts (which
 * registers) and undead-static.ts (the key art) import each other, and the key art's constants are
 * not initialised yet while undead.ts runs if the key art was imported first.
 */
/** The rig of a kind already built (after its first draw). */
export const builtRig = (kind: number): SkeletonRig | undefined => RIGS.get(kind);
export function registerFoot(kind: number, spec: () => FootSpec, shoots: boolean): void {
  registerLazy(kind, 'foot', () => footRig(kind, spec()), shoots);
}
export function registerLazy(kind: number, body: SkeletonData['body'], rig: () => SkeletonRig, shoots: boolean): void {
  const anims = [Anim.Idle, Anim.Walk, Anim.Run, Anim.Attack, Anim.Hit, Anim.Die, Anim.Dead, Anim.Brace, ...(shoots ? [Anim.Shoot] : [])];
  const rest: BasePose = { px: 0, py: 0, tilt: 0, apart: 0, smear: null, sway: 0 };
  registerPaperKind('undead', kind, {
    body,
    keys: { poses: Object.fromEntries(anims.map((a) => [a, [rest]])) },
    draw: (c, _p, facing, anim, frame) => void drawRigFrame(c, rig(), anim, frame, facing),
  });
}
