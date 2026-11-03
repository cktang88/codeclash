// The Bone Colossus and the Corpse Trebuchet on bones. Their approved key art is their
// parametric drawing (undead.ts `colossus` and `trebuchet` at the idle pose), so here the bones
// drive that drawing: each frame the bones are posed (keys, IK-planted feet, stop-motion holds,
// trailing cloth), and the figure is drawn whole from the angles they have.
//
// - The Colossus: a heap of the dead on two short legs. A lumbering gait on the walk capture
//   (the feet planted by IK, the heap rolling from foot to foot), and the femur-club smash: heaved
//   up over the hump and held, brought down to the ground, the impact held while dust bursts and
//   the heap shudders. It dies by coming apart into a mound of bones.
// - The Trebuchet: the crew haul on the trigger rope, the beam whips over and the sling lets a
//   green-burning ball of the dead fly; the crew wind it back down and load the next.
// See docs/art-references/undead-animation.md.

import { Anim } from '../contract.ts';
import { code, Paper, type P2 } from './core.ts';
import type { Facing } from './facing.ts';
import { along, poseAt, type BeastPose, type EnginePose } from './rig.ts';
import { bonesFromJoints, EASE, type AnimEvent, type AttachmentSet, type Clip, type DrawCtx, type JointDef, type SkeletonData, type SkeletonRig } from './skeleton.ts';
import { facingClip, lagCloth, lastFrame, mapFacings, mocapKeys, overlayKeys, restWorld, type ClipSet, type KP, type Track } from './templar-rig.ts';
import { R, T, type Author } from './templar-clips.ts';
import { FLASH, registerLazy, trail } from './undead-foot.ts';
import { both, jerk } from './undead-clips.ts';
import { flame, frameOf, shadeLower, UM } from './undead-parts.ts';
import { keyLight } from './undead-static.ts';
import { colossus, COLOSSUS_KEYS, trebuchet, TREBUCHET_KEYS } from './undead.ts';

const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const P6 = (p: P2): P2 => [r6(p[0]), r6(p[1])];
const fine = (): Paper => {
  const c = new Paper();
  c.begin(1024, { w: 1, h: 1, footY: 0.5 });
  return c;
};

/** A figure drawn whole from its posed bones: the pose the drawing wants, read from them. */
function wholePart(draw: (c: Paper, ctx: DrawCtx) => void): AttachmentSet[string] {
  return {
    cache: false,
    draw: (c, _x, ctx) => {
      draw(c, ctx);
      // The key art's light: the lower body in shade, then soul-fire and rims.
      shadeLower(c);
      keyLight(c);
    },
  };
}

// ================================================================== the Bone Colossus

const K = 1.75;
const COL_REST = (): BeastPose => poseAt(COLOSSUS_KEYS, Anim.Idle, 0) as BeastPose;

/** The colossus' joints in a facing, from the drawing's own frame at the key-art pose. */
function colossusJoints(back: boolean): Record<string, { from: P2; to: P2 }> {
  const c = fine();
  const p = COL_REST();
  const F = frameOf(c, p, back, { k: K, pelY: -5.3 * K, spine: 5.4 * K });
  const hipN = add(F.pel, back ? [1.5, 0.3] : [-1.3, 0.3]), hipF = add(F.pel, back ? [-1.2, 0.0] : [1.5, 0.0]);
  const leg = (hip: P2, th: number, sh: number) => {
    const knee = along(hip, th, 2.6 * K);
    return { knee, ank: along(knee, th + sh, 2.65 * K) };
  };
  const ln = leg(hipN, p.nt, p.ns), lf = leg(hipF, p.ft, p.fs);
  const elN = along(F.shN, p.nu, 2.6 * K), hN = along(elN, p.nu + p.nl, 2.6 * K);
  const elF = along(F.shF, p.fu, 2.6 * K), hF = along(elF, p.fu + p.fl, 2.6 * K);
  const out: Record<string, { from: P2; to: P2 }> = {
    root: { from: [0, 0], to: [0, 0] },
    pelvis: { from: F.pel, to: F.neck },
    head: { from: F.neck, to: along(F.neck, 180 - p.head, 1.5) },
    jaw: { from: F.neck, to: along(F.neck, 60, 1) },
    banner: { from: F.neck, to: add(F.neck, [0, 3]) },
    thighN: { from: hipN, to: ln.knee },
    shinN: { from: ln.knee, to: ln.ank },
    thighF: { from: hipF, to: lf.knee },
    shinF: { from: lf.knee, to: lf.ank },
    upperArmN: { from: F.shN, to: elN },
    forearmN: { from: elN, to: hN },
    weapon: { from: hN, to: along(hN, p.bl, 4) },
    upperArmF: { from: F.shF, to: elF },
    forearmF: { from: elF, to: hF },
    footTargetN: { from: ln.ank, to: ln.ank },
    footTargetF: { from: lf.ank, to: lf.ank },
  };
  for (const v of Object.values(out)) {
    v.from = P6(v.from);
    v.to = P6(v.to);
  }
  return out;
}
const COL_PARENT: Record<string, string> = {
  pelvis: 'root', head: 'pelvis', jaw: 'head', banner: 'pelvis', thighN: 'pelvis', shinN: 'thighN', thighF: 'pelvis', shinF: 'thighF',
  upperArmN: 'pelvis', forearmN: 'upperArmN', weapon: 'forearmN', upperArmF: 'pelvis', forearmF: 'upperArmF', footTargetN: 'root', footTargetF: 'root',
};

function colossusSkel(): SkeletonData {
  const se = colossusJoints(false), ne = colossusJoints(true);
  const defs: JointDef[] = Object.keys(se).map((n) => {
    const a = se[n]!, b = ne[n]!;
    const d: JointDef = { name: n, from: a.from, to: a.to };
    if (COL_PARENT[n]) d.parent = COL_PARENT[n];
    if (b.from[0] !== a.from[0] || b.from[1] !== a.from[1] || b.to[0] !== a.to[0] || b.to[1] !== a.to[1]) d.facing = { ne: { from: b.from, to: b.to } };
    return d;
  });
  const order = ['body', 'dust', 'flash'];
  return {
    name: 'undead-colossus',
    body: 'beast',
    bones: bonesFromJoints(defs),
    slots: [
      { name: 'body', bone: 'root', attachment: { all: 'body' } },
      { name: 'dust', bone: 'root', attachment: { all: 'dust' } },
      { name: 'flash', bone: 'root', attachment: { all: 'flash' } },
    ],
    drawOrder: { se: order, ne: order },
    ik: [
      { name: 'legN', bones: ['thighN', 'shinN'], target: 'footTargetN', bend: 1, mix: 1, ground: se.footTargetN!.from[1] },
      { name: 'legF', bones: ['thighF', 'shinF'], target: 'footTargetF', bend: 1, mix: 1, ground: se.footTargetF!.from[1] },
    ],
  };
}

/** The colossus' pose from its bones as they are now. */
function colossusPose(ctx: DrawCtx): BeastPose {
  const p = ctx.posed, b = p.byName, rest = COL_REST();
  const a = (n: string) => b[n]!.a;
  const out: BeastPose = { ...rest, tilt: 0, px: b.pelvis!.x, py: b.pelvis!.y + 5.3 * K };
  out.torso = a('pelvis') - 180;
  out.head = 180 - a('head');
  out.jaw = Math.max(0, Math.min(1, rest.jaw - trail(p, 'jaw') / 40));
  out.nt = a('thighN');
  out.ns = a('shinN') - out.nt;
  out.ft = a('thighF');
  out.fs = a('shinF') - out.ft;
  out.nu = a('upperArmN');
  out.nl = a('forearmN') - out.nu;
  out.fu = a('upperArmF');
  out.fl = a('forearmF') - out.fu;
  out.bl = a('weapon');
  out.sway = Math.max(-2, Math.min(2, Math.round((trail(p, 'banner') / 12) * 4) / 4));
  const was = ctx.prev?.byName.weapon;
  out.smear = ctx.events.some((e) => e.name === 'smear') && was && was.step !== b.weapon!.step ? was.a : null;
  out.apart = (ctx.events.find((e) => e.name === 'apart')?.int ?? 0) / 2;
  return out;
}

/** Dust bursting from the ground where the club lands (`t` 1..4), pale and spreading, settling. */
function dust(c: Paper, at: P2, t: number): void {
  const k = Math.min(1, t / 2), fade = t <= 2 ? 1 : 1 - (t - 2) / 3;
  for (const [dx, dy, r] of [[-1.6, -0.6, 1.0], [0, -1.1, 1.3], [1.7, -0.5, 1.1], [-2.8, -0.2, 0.7], [3.0, -0.2, 0.8]] as [number, number, number][]) {
    const rr = r * 1.5 * (0.6 + 0.8 * k) * (0.4 + 0.6 * fade);
    if (rr < 0.35) continue;
    c.blob([at[0] + dx * (0.6 + 0.5 * k), at[1] + dy * (0.5 + 0.8 * k)], rr, rr * 0.75, UM.rag, { tone: 3, detail: (_x, _y, nx, ny) => (ny < -0.2 && nx < 0.2 ? code(UM.bone, 3) : ny > 0.5 ? code(UM.rag, 2) : -1) });
  }
}

function colossusParts(): AttachmentSet {
  return {
    body: wholePart((c, ctx) => colossus(c, colossusPose(ctx), ctx.posed.facing, Anim.Idle, 0)),
    dust: {
      cache: false,
      draw: (c, _x, ctx) => {
        const e = ctx.events.find((q) => q.name === 'dust');
        if (!e) return;
        // Where the femur's head meets the ground.
        const w = ctx.posed.byName.weapon!;
        const head = along([w.x, w.y], w.a, 8.5);
        dust(c, [head[0], Math.min(0, head[1] + 0.8)], e.int ?? 1);
      },
    },
    flash: FLASH,
  };
}

function colossusClips(skel: SkeletonData): ClipSet {
  const fc = (name: string, n: number, loop: boolean, keys: (f: Facing) => KP[], ev: AnimEvent[] = [], warp?: number[], run = 0): Clip => {
    let c: Clip = facingClip(skel, name, n, loop, keys, ev);
    if (warp) c = mapFacings(c, (a) => jerk(a, warp, new Set(['head', 'jaw', 'upperArmN', 'forearmN', 'weapon', 'upperArmF', 'forearmF'])));
    return lagCloth(skel, c, n, loop, [{ bone: 'banner', follow: 'pelvis', k: 0.35, lag: 2, bias: -10 * run, wave: [run ? 4 : 0, 2, 0.2] }, { bone: 'jaw', follow: 'pelvis', k: 0.4, lag: 1.5 }]);
  };
  const mk = (f: Facing, clip: string, o: Parameters<typeof mocapKeys>[3], a?: Author, extra: number[] = []) => overlayKeys(mocapKeys(skel, clip, f, o).keys, a ? a(restWorld(skel, f), f) : {}, extra);
  const heavy: Author = () => ({ dw: { head: T([0, 0]) } });
  // Idle: the heap heaves (a slow breath of the whole mass), the jaw hangs.
  const idle = fc('idle', 8, true, (f) => mk(f, 'idle', { ref: 'first', torso: 0, travel: 0.1, feet: 0 }, () => ({ tAdd: { pelvis: [T([0, 0]), T([0, 0], [4, 0.25], [8, 0])] } }), [2, 4, 6]));
  // The lumbering walk: a long heavy stride on the capture, the heap rolling over each planted
  // foot (the whole torso swaying), dropping hard on each contact; the arms and the skull hold,
  // then jerk on.
  const roll: Author = () => ({ tAdd: { pelvis: [T([0, -0.2], [3, 0.15], [6, -0.2], [9, 0.15], [12, -0.2]), T([0, 0.25], [1, 0.45], [3, -0.1], [6, 0.25], [7, 0.45], [9, -0.1], [12, 0.25])] } });
  const walk = fc('walk', 12, true, (f) => mk(f, 'walk', { ref: 'mean', torso: 0, roll: 0.4, feet: 0.9, mirror: 12 }, both(roll, heavy), [0, 1, 3, 6, 7, 9]), [{ f: 0, name: 'step' }, { f: 6, name: 'step' }], [0, 1, 2, 2, 4, 5, 6, 7, 8, 8, 10, 11]);
  const charge: Author = () => ({ dw: { pelvis: T([0, -10]), head: T([0, 6]) }, w: { weapon: T([0, 110]) } });
  const run = fc('run', 12, true, (f) => mk(f, 'run', { ref: 'mean', torso: 0.4, roll: 0.4, feet: 0.8, mirror: 12 }, charge), [{ f: 0, name: 'step' }, { f: 6, name: 'step' }], [0, 1, 2, 2, 4, 5, 6, 7, 8, 8, 10, 11], 1);
  // The smash (chop: the rise, the drop, the impact held): heaved up over the hump (1-3), held at
  // the top (4), brought down (5) to the ground in front (6), the impact held three frames while
  // the dust bursts and the heap shudders down onto it (6-8); dragged back up (9-11).
  const SMASH: Author = (rw) => ({
    w: {
      upperArmN: R(rw.upperArmN!, 11, [2, 140], [3, 172], [4, 176], [5, 120], [6, 62], [8, 58], [10, 50]),
      forearmN: R(rw.forearmN!, 11, [2, 170], [3, 190], [4, 192], [5, 130], [6, 70], [8, 66], [10, 70]),
      weapon: R(rw.weapon!, 11, [2, 190], [3, 212], [4, 218], [5, 140], [6, 70], [8, 64], [10, 110]),
    },
    dw: { pelvis: T([0, 0], [3, 16], [4, 18], [5, -6], [6, -22], [8, -24], [10, -8], [11, 0]), head: T([0, 0], [4, -8], [6, 10], [8, 10], [11, 0]), jaw: T([0, 0], [3, -10], [4, -12], [5, -40], [8, -40], [10, -6], [11, 0]) },
    tAdd: { pelvis: [T([0, 0], [4, -0.3], [6, 0.6], [8, 0.65], [11, 0]), T([0, 0], [3, -0.35], [4, -0.4], [5, 0], [6, 0.7], [7, 0.85], [8, 0.7], [10, 0.2], [11, 0])] },
  });
  const attack = fc('attack', 12, false, (f) => mk(f, 'chop', { torso: 0.2, travel: 0.3, feet: 0.3 }, SMASH, [2, 3, 4, 5, 6, 7, 8, 10]), [{ f: 5, name: 'smear', len: 1 }, { f: 6, name: 'strike' }, ...[6, 7, 8, 9].map((k) => ({ f: k, name: 'dust', int: k - 5 }))], [0, 1, 2, 3, 4, 4, 6, 7, 8, 9, 10, 11]);
  const HITA: Author = () => ({ dw: { pelvis: T([0, 12], [1, 16], [2, 6], [4, 0]), head: T([0, -12], [1, -16], [4, 0]), jaw: T([0, -30], [1, -36], [3, -10], [4, 0]) }, tAdd: { pelvis: [T([0, -0.5], [1, -0.7], [2, -0.4], [4, 0]), T([0, 0.1], [1, 0.25], [4, 0])], footTargetN: [T([0, 0], [1, -0.9], [2, -1.0], [4, -0.4]), T([0, 0], [1, -0.5], [2, 0], [4, 0])] } });
  const hit = fc('hit', 5, false, (f) => mk(f, 'hit', { torso: 0, absHeight: false, travel: 0.4, feet: 0.4 }, HITA, [1, 2, 3]), []);
  // Death: it sags, the knees go and it kneels, the heap slides (5-7) and falls into a mound of bones (8-11).
  const DIE: Author = (rw) => ({
    w: { thighN: T([0, rw.thighN!], [2, 30], [4, 70], [7, 80]), shinN: T([0, rw.shinN!], [2, -60], [4, -100], [7, -110]), thighF: T([0, rw.thighF!], [2, 40], [4, 72], [7, 80]), shinF: T([0, rw.shinF!], [2, -50], [4, -95], [7, -105]), weapon: T([0, rw.weapon!], [1, 190], [3, 120], [5, 80]) },
    dw: { pelvis: T([0, 10], [2, -8], [5, -26], [7, -30]), head: T([0, -14], [3, 10], [6, 24]), jaw: T([0, -30], [2, -40], [7, -40]) },
    tAdd: { pelvis: [T([0, -0.3], [3, 0], [7, 0.4]), T([0, 0], [2, 1.6], [4, 3.6], [6, 4.4], [7, 4.4])] },
    ik: { legN: T([0, 1], [1, 0]), legF: T([0, 1], [1, 0]) },
  });
  const die = fc('die', 12, false, (f) => mk(f, 'idle', { ref: 'first', torso: 0, travel: 0, feet: 0 }, DIE, [1, 2, 3, 4, 5, 6, 7]), [{ f: 6, name: 'apart', len: 2, int: 1 }, { f: 8, name: 'apart', len: 4, int: 2 }, { f: 8, name: 'land' }]);
  const dead = mapFacings(die, (a) => ({ ...lastFrame(a, 'dead'), events: [{ f: 0, name: 'apart', int: 2 }] }));
  const BRACE: Author = () => ({ dw: { pelvis: T([0, -6]) }, w: { upperArmN: T([0, 70]), forearmN: T([0, 120]), weapon: T([0, 100]) }, tAdd: { pelvis: [T([0, 0]), T([0, 0.8])] } });
  const brace = fc('brace', 8, true, (f) => mk(f, 'brace', { ref: 'mean', torso: 0, travel: 0.3, feet: 0.3 }, BRACE));
  return { [Anim.Idle]: idle, [Anim.Walk]: walk, [Anim.Run]: run, [Anim.Attack]: attack, [Anim.Hit]: hit, [Anim.Die]: die, [Anim.Dead]: dead, [Anim.Brace]: brace };
}

let COL_RIG: SkeletonRig | undefined;
const colossusRig = (): SkeletonRig => {
  if (COL_RIG) return COL_RIG;
  const skel = colossusSkel();
  return (COL_RIG = { skel, atts: colossusParts(), clips: colossusClips(skel) });
};

// ================================================================== the Corpse Trebuchet

const ENG_REST = (): EnginePose => poseAt(TREBUCHET_KEYS, Anim.Idle, 0) as EnginePose;

/**
 * The engine's bones: the frame (root: its roll and lift), the beam on its axle (its world angle
 * is the arm's), the sling on the beam's tip (its turn from the beam), the crew's work (a turn of
 * the `crew` bone is the work cycle's phase, a sideways move of `lean` how hard they lean in), the
 * load in the pouch (a move of `load`), and a cloth bone for the rag on the frame.
 */
function engineSkel(): SkeletonData {
  const p = ENG_REST();
  const axle: P2 = [0.6, -13];
  const tip = along(axle, p.arm, 12.5);
  const defs: JointDef[] = [
    { name: 'root', from: [0, 0], to: [0, 0] },
    { name: 'frame', parent: 'root', from: [0, 0], to: [0, -1] },
    { name: 'beam', parent: 'frame', from: axle, to: P6(tip) },
    { name: 'sling', parent: 'beam', from: P6(tip), to: P6(along(tip, 0, 3.4)) },
    { name: 'crew', parent: 'root', from: [0, 0], to: [0, 1] },
    { name: 'lean', parent: 'root', from: [0, 0], to: [0, 1] },
    { name: 'load', parent: 'root', from: [0, 0], to: [0, 1] },
    { name: 'rag', parent: 'frame', from: [0.4, -12.6], to: [0.4, -8.0] },
  ];
  const order = ['engine', 'shot', 'flash'];
  return {
    name: 'undead-trebuchet',
    body: 'engine',
    bones: bonesFromJoints(defs),
    slots: [
      { name: 'engine', bone: 'root', attachment: { all: 'engine' } },
      { name: 'shot', bone: 'root', attachment: { all: 'shot' } },
      { name: 'flash', bone: 'root', attachment: { all: 'flash' } },
    ],
    drawOrder: { se: order, ne: order },
  };
}

function enginePose(ctx: DrawCtx): EnginePose {
  const p = ctx.posed, b = p.byName, rest = ENG_REST();
  const out: EnginePose = { ...rest };
  out.px = b.frame!.x;
  out.py = b.frame!.y;
  out.tilt = b.frame!.a - 180;
  out.arm = b.beam!.a - out.tilt;
  out.sling = Math.round(trail(p, 'sling') / 7.5) * 7.5;
  out.crew = (((b.crew!.raw / 360) % 1) + 1) % 1;
  out.lean = b.lean!.x;
  out.load = b.load!.x > 0.5 ? 1 : 0;
  out.recoil = 0;
  out.sway = Math.max(-2, Math.min(2, Math.round((trail(p, 'rag') / 12) * 4) / 4));
  out.apart = (ctx.events.find((e) => e.name === 'apart')?.int ?? 0) / 2;
  return out;
}

/** The green-burning ball of the dead in flight after the release (`t` frames out), a trail of soul-fire behind it. */
function shot(c: Paper, from: P2, t: number): void {
  const at: P2 = [from[0] + t * 3.6, from[1] - t * 1.2 + t * t * 0.2];
  for (let k = 3; k >= 1; k--) flame(c, [at[0] - k * 1.3, at[1] + k * 0.4], 1.2 + (3 - k) * 0.5, (t + k) * 0.25, { w: 0.5 + (3 - k) * 0.15 });
  c.blob(at, 1.2, 1.1, UM.bone, { tone: 1, detail: (x, y) => (c.tex(x, y, 335, 2) < 0.45 ? code(UM.glow, 3) : -1) });
  flame(c, [at[0], at[1] - 0.4], 1.6, t * 0.3, { w: 0.8 });
}

function engineParts(): AttachmentSet {
  return {
    engine: wholePart((c, ctx) => {
      const p = enginePose(ctx);
      // The crew's walk when the engine is hauled (the drawing turns the wheels and pumps the legs for these).
      const moving = ctx.events.some((e) => e.name === 'haul');
      trebuchet(c, p, ctx.posed.facing, moving ? Anim.Walk : Anim.Idle, 0);
    }),
    shot: {
      cache: false,
      draw: (c, _x, ctx) => {
        const e = ctx.events.find((q) => q.name === 'flight');
        if (!e) return;
        // From where the sling let it go, at the top of the beam's swing.
        const f = ctx.posed.byName.frame!;
        shot(c, along([f.x + 0.6, f.y - 13], 165, 15.4), e.int ?? 1);
      },
    },
    flash: FLASH,
  };
}

function engineClips(skel: SkeletonData): ClipSet {
  const keysFrom = (n: number, a: Author, f: Facing): KP[] => {
    const keys: KP[] = [];
    for (let i = 0; i <= n; i++) keys.push({ f: i });
    return overlayKeys(keys, a(restWorld(skel, f), f));
  };
  const fc = (name: string, n: number, loop: boolean, a: Author, ev: AnimEvent[] = []): Clip =>
    lagCloth(skel, facingClip(skel, name, n, loop, (f) => keysFrom(n, a, f), ev), n, loop, [{ bone: 'rag', follow: 'frame', k: 1.2, lag: 2, wave: [5, 2, 0.3] }, { bone: 'sling', follow: 'beam', k: 0.9, lag: 1.5 }]);
  const loaded = { load: [T([0, 1]), T([0, 0])] as [Track, Track] };
  // Idle: loaded, the crew shifting their weight at the ropes.
  const IDLE: Author = () => ({ dw: { crew: T([0, 0], [8, 90]) }, t: { ...loaded } });
  // Hauled across the field: the crew lean into the bars, the wheels turn, the frame rocks.
  const HAUL = (k: number): Author => () => ({ dw: { crew: T([0, 0], [12, 360 * k]), frame: T([0, 0], [3, 1.5], [6, 0], [9, -1.5], [12, 0]) }, t: { ...loaded, lean: [T([0, 1 * k]), T([0, 0])], frame: [T([0, 0]), T([0, 0], [3, -0.12], [6, 0], [9, -0.12], [12, 0])] } });
  // The throw: the crew haul back on the trigger rope (0-1); the counterweight drops and the beam
  // whips over (2-3), the sling trailing then whipping through, the load gone at the top (3) and
  // the green-burning shot flying on (4-8); the beam overshoots and swings back (4-5); the crew
  // heave on the winch to wind it down (6-9) and lay the next (10-11).
  const THROW: Author = (rw) => ({
    w: { beam: T([0, rw.beam!], [1, rw.beam! - 4], [2, 40], [3, 158], [4, 176], [5, 140], [6, 90], [8, 10], [10, -40], [11, rw.beam!]) },
    dw: { crew: T([0, 0], [1, 60], [3, 110], [6, 200], [9, 360], [11, 420]), frame: T([0, 0], [2, -2], [3, -4], [4, -2], [5, 0]) },
    t: { load: [T([0, 1], [2.9, 1], [3, 0], [10.9, 0], [11, 1]), T([0, 0])], lean: [T([0, 0], [1, -1.2], [2, -0.6], [3, 0], [6, 1.2], [9, 1.2], [10, 0.4], [11, 0]), T([0, 0])], frame: [T([0, 0], [3, -0.25], [4, -0.2], [6, 0]), T([0, 0])] },
  });
  const shotEv: AnimEvent[] = [{ f: 3, name: 'release' }, ...[4, 5, 6, 7, 8].map((k) => ({ f: k, name: 'flight', int: k - 3 }))];
  const throwIt = fc('shoot', 12, false, THROW, shotEv);
  // Struck: the frame jolts back, the crew stagger, a flash.
  const HIT: Author = () => ({ dw: { frame: T([0, -3], [1, -4], [3, 0], [4, 0]), crew: T([0, 30], [2, 60], [4, 60]) }, t: { ...loaded, frame: [T([0, -0.3], [1, -0.4], [3, 0], [4, 0]), T([0, 0])] } });
  // Wrecked: the frame racks and topples back, the beam driven into the ground, then the wreck.
  const WRECK: Author = (rw) => ({ dw: { frame: T([0, -3], [3, -8], [6, -20], [8, -22]) }, w: { beam: T([0, rw.beam!], [3, -20], [6, 30], [8, 30]) }, t: { frame: [T([0, 0], [6, 0.6], [8, 0.6]), T([0, 0], [3, -1.0], [6, -2.6], [8, -2.8])], load: [T([0, 1], [2, 0]), T([0, 0])] } });
  const die = fc('die', 12, false, WRECK, [{ f: 6, name: 'apart', len: 2, int: 1 }, { f: 8, name: 'apart', len: 4, int: 2 }, { f: 8, name: 'land' }]);
  const dead = mapFacings(die, (a) => ({ ...lastFrame(a, 'dead'), events: [{ f: 0, name: 'apart', int: 2 }] }));
  // The crew beat off attackers with their tools.
  const FIGHT: Author = () => ({ dw: { crew: T([0, 0], [4, 90], [7, 270], [11, 360]) }, t: { ...loaded, lean: [T([0, 0], [3, -1], [6, 2.2], [8, 2.2], [11, 0]), T([0, 0])] } });
  const haulEv = (n: number) => Array.from({ length: n }, (_, k) => ({ f: k, name: 'haul' }));
  return {
    [Anim.Idle]: fc('idle', 8, true, IDLE),
    [Anim.Walk]: fc('walk', 12, true, HAUL(1), haulEv(12)),
    [Anim.Run]: fc('run', 12, true, HAUL(2), haulEv(12)),
    [Anim.Attack]: fc('attack', 12, false, FIGHT),
    [Anim.Shoot]: throwIt,
    [Anim.Hit]: fc('hit', 5, false, HIT, []),
    [Anim.Die]: die,
    [Anim.Dead]: dead,
    [Anim.Brace]: fc('brace', 8, true, IDLE),
  };
}
void EASE;

let ENG_RIG: SkeletonRig | undefined;
const engineRig = (): SkeletonRig => {
  if (ENG_RIG) return ENG_RIG;
  const skel = engineSkel();
  return (ENG_RIG = { skel, atts: engineParts(), clips: engineClips(skel) });
};

export function registerBeasts(colossusKind: number, engineKind: number): void {
  registerLazy(colossusKind, 'beast', colossusRig, false);
  registerLazy(engineKind, 'engine', engineRig, true);
}
