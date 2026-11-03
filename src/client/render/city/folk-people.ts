// HD townsfolk drawn as pixel-art figures about 30 art pixels tall (a child about 22), at the HD
// city's density: a 2D rig (hip, knees, ankles, shoulders, elbows, hands, head) posed per frame,
// limbs as shaded tapered rods, the body as a lit polygon with folds that follow the legs, a face
// (eye, brow, nose, mouth, ear), hair, hats and hoods, and the tool in hand. Each clip is posed
// procedurally from a phase, angles snapped to 7.5° and joints to whole pixels, so a part is
// redrawn from the same outline every time it returns (no boil).
//
// References (docs/art-references/city-people.md): Maciejowski Bible and Tacuinum Sanitatis for
// tunics, hose, hoods, veils and gowns; Hiroshige's Tōkaidō for kasa, short kimono, gaiters and
// carrying poles; the CC0 "Slavic woman" walk (OpenGameArt) for the scale of a 30 px figure; the
// CC0 zombie and skeleton set for the undead labourers.

import type { Paper, P2 } from '../paper/core.ts';
import { dirOf, dot, ip, oval, step, type Mats } from './folk-paint.ts';
import type { Look } from './people.ts';
import { hex, mix, tone, type Col } from './pixels.ts';

export type FolkClip = 'walk' | 'idle' | 'hammer' | 'scythe' | 'dig' | 'tend' | 'saw' | 'pray' | 'sweep';
export const CLIP_FRAMES: Record<FolkClip, number> = { walk: 8, idle: 4, hammer: 8, scythe: 8, dig: 8, tend: 8, saw: 8, pray: 8, sweep: 8 };
/** Loops per second of each work clip (the walk follows the distance walked). */
export const CLIP_RATE: Record<FolkClip, number> = { walk: 1, idle: 0.35, hammer: 1.05, scythe: 0.55, dig: 0.42, tend: 0.32, saw: 1.4, pray: 0.22, sweep: 0.75 };

/** The figure canvas in art pixels and its foot point (paper/core.ts CanvasSize). */
export const PERSON_CANVAS = { w: 60, h: 66, footY: 56 / 66 };

interface Build {
  thigh: number;
  shin: number;
  torso: number;
  head: [number, number];
  upper: number;
  fore: number;
  /** Half-widths: shoulders, waist, hem (tunic), limb widths. */
  sw: number;
  ww: number;
  leg: number;
  arm: number;
}
const MAN: Build = { thigh: 7, shin: 7, torso: 9, head: [3, 3.5], upper: 5, fore: 5, sw: 3.5, ww: 3, leg: 3, arm: 2.6 };
const WOMAN: Build = { thigh: 6.5, shin: 6.5, torso: 8.5, head: [3, 3.5], upper: 4.5, fore: 4.5, sw: 3, ww: 2.6, leg: 2.6, arm: 2.3 };
const CHILD: Build = { thigh: 4.5, shin: 4.5, torso: 6, head: [2.8, 3.2], upper: 3.5, fore: 3.5, sw: 2.5, ww: 2.3, leg: 2.4, arm: 2 };
const BONES: Build = { ...MAN, leg: 1.8, arm: 1.6, sw: 3, ww: 1.6 };

/** A pose: angles in the rig's convention (0 down, 90 forward, 180 up), absolute per bone. */
interface Pose {
  lean: number;
  nT: number;
  nS: number;
  fT: number;
  fS: number;
  nU: number;
  nF: number;
  fU: number;
  fF: number;
  /** Head nod in pixels (down and forward). */
  nod: number;
  /** The tool's angle from the near hand, and how far along it the hand grips (0 = the end). */
  tool: number;
  grip: number;
  /** The far hand on the tool, this far along it from the near hand (0 = not on it). */
  two: number;
  /** Horizontal shift of the hip (a lunge or a lean back). */
  dx: number;
}

const P0: Pose = { lean: 2, nT: 4, nS: 2, fT: -4, fS: -4, nU: 6, nF: 12, fU: -4, fF: 4, nod: 0, tool: NaN, grip: 0, two: 0, dx: 0 };

const TAU = Math.PI * 2;
const sin = (p: number) => Math.sin(p * TAU);
const cos = (p: number) => Math.cos(p * TAU);

/** One leg through a step: thigh and shin at phase q (0 heel strike forward, 0.5 toe-off behind). */
function legAt(q: number, stride: number, lift: number): [number, number] {
  q = ((q % 1) + 1) % 1;
  const thigh = stride * cos(q);
  let bend: number;
  if (q < 0.5) bend = 3 + (q > 0.32 ? ((q - 0.32) / 0.18) * 17 : 0);
  else if (q < 0.68) bend = 20 + ((q - 0.5) / 0.18) * (lift - 20);
  else bend = Math.max(2, lift * (1 - (q - 0.7) / 0.27));
  return [thigh, thigh - bend];
}

function walkPose(L: Look, p: number): Pose {
  const kind = L.kind ?? 'man';
  const robe = L.robe;
  const shamble = !!L.shamble;
  const child = kind === 'child';
  const stride = shamble ? 15 : robe ? 17 : child ? 22 : 20;
  const [nT, nS] = legAt(p, stride, shamble ? 22 : 42);
  const [fT, fS] = legAt(p + 0.5, stride, shamble ? 30 : 42);
  const swing = shamble ? 4 : kind === 'skeleton' ? 24 : 20;
  const pose: Pose = {
    ...P0,
    lean: shamble ? 18 : kind === 'old' ? 12 : kind === 'skeleton' ? 8 : 5,
    nT: shamble ? nT * 0.6 : nT,
    nS: shamble ? nS * 0.6 + 2 : nS,
    fT,
    fS,
    nU: -swing * cos(p),
    nF: -swing * cos(p) + 16 + 6 * sin(p),
    fU: swing * cos(p),
    fF: swing * cos(p) + 16,
  };
  if (shamble) {
    // Arms out before it, the near one a little higher, the hands hanging.
    pose.nU = 72 + 6 * sin(p);
    pose.nF = 88 + 6 * sin(p);
    pose.fU = 64 - 6 * sin(p);
    pose.fF = 84 - 6 * sin(p);
    pose.nod = 2;
  }
  return carryArms(L, pose, p);
}

/** What is carried decides the near arm (and sometimes both). */
function carryArms(L: Look, P: Pose, p: number): Pose {
  switch (L.carry) {
    case 'sack':
    case 'plank':
    case 'bundle':
      // Up on the shoulder, steadied by the near hand.
      return { ...P, nU: 150, nF: 205 };
    case 'spade':
    case 'broom':
      return { ...P, nU: 150, nF: 240, tool: 200, grip: 0.4 };
    case 'yoke':
      // A carrying pole across the shoulder, a basket hanging at each end; the hand on the pole.
      return { ...P, nU: 120, nF: 175, lean: P.lean + 4 };
    case 'bucket':
    case 'lantern':
      return { ...P, nU: 8 + 4 * sin(p), nF: 10 + 4 * sin(p) };
    case 'basket':
      return { ...P, nU: 12, nF: 80 };
    case 'staff':
      return { ...P, nU: 28, nF: 62, tool: 180, grip: 0.42 };
    case 'book':
      return { ...P, nU: 20, nF: 100, fU: 22, fF: 98 };
    case 'parasol':
      return { ...P, nU: 32, nF: 150, tool: 180, grip: 0.3 };
    case 'tongs':
      return P;
    default:
      return P;
  }
}

/** A pose for a clip at frame f. */
export function poseFor(L: Look, clip: FolkClip, f: number): Pose {
  const n = CLIP_FRAMES[clip];
  const p = f / n;
  if (clip === 'walk') return walkPose(L, p);
  if (clip === 'idle') {
    const breathe = f >= 2 ? 1 : 0;
    const base: Pose = { ...P0, lean: L.shamble ? 16 : L.kind === 'old' ? 10 : 2, nU: 6 + breathe * 4, fU: -4 - breathe * 3 };
    if (L.shamble) Object.assign(base, { nU: 30 + breathe * 8, nF: 40 + breathe * 8, fU: 20, fF: 30, nod: 2 });
    return carryArms(L, base, p);
  }
  switch (clip) {
    case 'hammer': {
      // Wind up slow, hold at the top, strike fast, ring on the anvil, recover.
      const K: [number, number, number, number][] = [
        // lean, upper, fore, tool
        [12, 40, 72, 105],
        [9, 70, 112, 140],
        [5, 118, 160, 190],
        [2, 148, 192, 232],
        [1, 155, 200, 240],
        [6, 110, 140, 170],
        [14, 36, 68, 100],
        [13, 38, 70, 102],
      ];
      const [lean, nU, nF, tool] = K[f]!;
      return { ...P0, lean, nU, nF, tool, grip: 0, nT: 14, nS: 6, fT: -10, fS: -14, fU: 38, fF: 78, nod: f === 6 ? 1 : 0 };
    }
    case 'saw': {
      const s = sin(p);
      return { ...P0, lean: 22, nU: 48 + 22 * s, nF: 96 + 10 * s, tool: 104, grip: 0, fU: 46, fF: 70, nT: 22, nS: 10, fT: -12, fS: -18, dx: s > 0 ? 1 : 0 };
    }
    case 'dig': {
      const K: [number, number, number, number, number, number][] = [
        // lean, nU, nF, tool, nT, nS
        [14, 38, 58, 8, 20, 8],
        [12, 34, 52, 6, 40, 12],
        [10, 30, 46, 4, 46, 14],
        [26, 50, 70, 340, 20, 6],
        [22, 62, 92, 62, 14, 4],
        [8, 92, 140, 128, 8, 2],
        [6, 80, 120, 96, 8, 2],
        [12, 50, 72, 30, 14, 4],
      ];
      const [lean, nU, nF, tool, nT, nS] = K[f]!;
      return { ...P0, lean, nU, nF, tool, grip: 0.62, two: 0.35, nT, nS, fT: -12, fS: -18 };
    }
    case 'scythe': {
      const s = sin(p);
      // The swing: from behind the right foot, low across the front, the blade skimming the stubble.
      return { ...P0, lean: 14 + 4 * s, nU: 22 + 22 * s, nF: 40 + 26 * s, tool: 28 + 40 * s, grip: 0.55, two: 0.32, nT: 16, nS: 8, fT: -14, fS: -20, dx: s > 0.5 ? 1 : 0 };
    }
    case 'tend': {
      const s = f % 4 < 2 ? 0 : 1;
      return { ...P0, lean: 62, nT: 34, nS: -14, fT: -6, fS: -30, nU: 4 + s * 15, nF: 16 + s * 22, fU: -2, fF: 20, nod: 1 };
    }
    case 'pray': {
      const bow = f >= 3 && f <= 6 ? 1 : 0;
      return { ...P0, lean: 4 + bow * 6, nU: 14, nF: 138, fU: 18, fF: 136, nod: bow };
    }
    case 'sweep': {
      const s = sin(p);
      return { ...P0, lean: 14, nU: 34 + 8 * s, nF: 64 + 8 * s, tool: 22 + 22 * s, grip: 0.3, two: 0.28, nT: 12, nS: 6, fT: -8, fS: -12 };
    }
  }
  return P0;
}

/** Two-bone IK: the elbow for a hand reaching `t` from shoulder `s` (elbow bent down and back). */
function elbowFor(s: P2, t: P2, a: number, b: number): P2 {
  const dx = t[0] - s[0], dy = t[1] - s[1];
  const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
  const ca = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.atan2(dy, dx) + Math.acos(Math.max(-1, Math.min(1, ca)));
  return [s[0] + Math.cos(ang) * a, s[1] + Math.sin(ang) * a];
}

// ------------------------------------------------------------------ colours

const INK = hex('#2a1a16');
const IRON = hex('#8e949c');
const WOOD = hex('#7a5434');
const STRAW = hex('#c9a862');
const LINEN = hex('#ddd4bf');
const BONE = hex('#c4b99c');

/** Everything a figure needs to be painted. */
export interface PaintCtx {
  c: Paper;
  M: Mats;
  /** The town's skin tone (a Look may bring its own). */
  skin: Col;
  /** The faction: the dress and gear differ. */
  faction: string;
}

// ------------------------------------------------------------------ the figure

/** Paint one frame of a townsperson, facing south-east (`back`: north-east). */
export function paintPerson(ctx: PaintCtx, L: Look, clip: FolkClip, f: number, back: boolean): void {
  const { c, M } = ctx;
  const kind = L.kind ?? (L.robe && (L.head === 'veil' || L.head === 'wimple' || L.head === 'kerchief' || L.head === 'bun') ? 'woman' : 'man');
  const B = kind === 'child' ? CHILD : kind === 'woman' ? WOMAN : kind === 'skeleton' ? BONES : MAN;
  const P = poseFor(L, clip, f);
  const code = (m: number, t: number) => M.code(m, t);
  const skull = L.head === 'skull' || kind === 'skeleton';
  const skinC = kind === 'skeleton' ? BONE : L.skin ?? ctx.skin;
  const mSkin = M.of(skinC);
  const mBody = M.of(L.body);
  const mLegs = M.of(L.legs);
  const mHair = M.of(L.hair);
  const mShoe = M.of(ctx.faction === 'samurai' ? hex('#b89a62') : tone(L.legs, 0.55));
  const mInk = M.of(INK, 0.075, true);

  // --- the skeleton of the pose
  const legLen = (t: number, s: number) => B.thigh * dirOf(t)[1] + B.shin * dirOf(s)[1];
  const drop = Math.max(legLen(P.nT, P.nS), legLen(P.fT, P.fS));
  const hip: P2 = ip([P.dx, -2 - drop]);
  const kneeN = ip(step(hip, P.nT, B.thigh));
  const ankN = ip(step(kneeN, P.nS, B.shin));
  const kneeF = ip(step([hip[0] - 1, hip[1]], P.fT, B.thigh));
  const ankF = ip(step(kneeF, P.fS, B.shin));
  const up = dirOf(180 + P.lean);
  const sh: P2 = ip([hip[0] + up[0] * B.torso, hip[1] + up[1] * B.torso]);
  const waist: P2 = [hip[0] + up[0] * 3, hip[1] + up[1] * 3];
  const [rx, ry] = B.head;
  const hc: P2 = ip([sh[0] + up[0] * (ry + 1) + P.nod * 0.7 + (P.lean > 30 ? 1 : 0), sh[1] + up[1] * (ry + 1) + P.nod]);
  const shN: P2 = [sh[0] + 0.5, sh[1] + 1];
  const shF: P2 = [sh[0] - 1, sh[1] + 1];
  const elbN = ip(step(shN, P.nU, B.upper));
  const handN = ip(step(elbN, P.nF, B.fore));
  let elbF = ip(step(shF, P.fU, B.upper));
  let handF = ip(step(elbF, P.fF, B.fore));
  const toolDir = Number.isNaN(P.tool) ? null : dirOf(P.tool);
  if (toolDir && P.two) {
    // The far hand further along the tool's shaft.
    const tl = toolLen(L, clip);
    handF = ip([handN[0] + toolDir[0] * tl * P.two, handN[1] + toolDir[1] * tl * P.two]);
    elbF = ip(elbowFor(shF, handF, B.upper, B.fore));
  }
  if (L.carry === 'book' || clip === 'pray') {
    handF = [handN[0] - 1, handN[1]];
    elbF = ip(elbowFor(shF, handF, B.upper, B.fore));
  }

  const sleeveC = L.sleeves === 'wide' ? 1.6 : 1;
  const limb = (a: P2, b: P2, wa: number, wb: number, m: number, t: number) => c.rod(a, b, wa, wb, m, { tone: t });
  const hand = (h: P2, t: number) => {
    if (kind === 'skeleton') {
      dot(c, h[0], h[1], code(mSkin, t + 1));
      return;
    }
    c.blob([h[0] + 0.5, h[1] + 0.5], 1.1, 1.1, mSkin, { tone: t });
  };
  const legM = L.lower === 'bare' || kind === 'skeleton' ? mSkin : mLegs;
  const legW = L.lower === 'hakama' ? 4.4 : B.leg;
  const drawLeg = (h: P2, k: P2, a: P2, t: number) => {
    limb(h, k, legW, legW * (L.lower === 'hakama' ? 1 : 0.9), legM, t);
    limb(k, a, legW * (L.lower === 'hakama' ? 1.05 : 0.85), legW * (L.lower === 'hakama' ? 1.15 : 0.75), L.lower === 'gaiters' ? M.of(hex('#2e3a52')) : legM, t);
    if (kind === 'skeleton') dot(c, k[0], k[1], code(mSkin, t + 1));
  };
  const foot = (a: P2, t: number) => {
    if (kind === 'skeleton') {
      limb([a[0], a[1] + 1], [a[0] + 2, a[1] + 1], 1.2, 1.2, mSkin, t);
      return;
    }
    limb([a[0] - 0.5, a[1] + 1], [a[0] + 2, a[1] + 1], 2, 1.8, mShoe, t);
  };
  const drawArm = (s: P2, e: P2, h: P2, t: number) => {
    // The sleeve is the body's cloth as its own material, so a contact line parts arm from body.
    const am = kind === 'skeleton' ? mSkin : M.of(L.body, 0.076);
    if (t >= 2 && kind !== 'skeleton') {
      // The near arm lies over the body: a dark seam round it so it reads (pixel-art-craft §3).
      const mo = M.of(mix(L.body, hex('#140c10'), 0.55));
      limb(s, e, B.arm * sleeveC + 1.2, B.arm * (sleeveC > 1 ? 1.5 : 0.95) + 1.2, mo, 2);
      limb(e, h, B.arm * (sleeveC > 1 ? 1.4 : 0.9) + 1.2, B.arm * (sleeveC > 1 ? 1.1 : 0.8) + 1.2, mo, 2);
    }
    limb(s, e, B.arm * sleeveC, B.arm * (sleeveC > 1 ? 1.5 : 0.95), am, t);
    limb(e, h, B.arm * (sleeveC > 1 ? 1.4 : 0.9), B.arm * (sleeveC > 1 ? 1.1 : 0.8), L.sleeves === 'rolled' ? mSkin : am, t);
    if (L.trim && kind !== 'skeleton') dot(c, h[0], h[1] - 1, code(M.of(L.trim), t + 1));
    hand(h, t + (t >= 2 ? 0 : 0));
  };

  // --- far side: arm, leg, foot (darker)
  if (!(L.shamble && clip !== 'idle' && clip !== 'walk')) drawArm(shF, elbF, handF, 1);
  if (!L.robe) drawLeg([hip[0] - 1, hip[1]], kneeF, ankF, 1);
  // The far foot goes under the robe's hem (it shows only where it steps out ahead).
  foot(ankF, 1);
  // A tool carried behind (over the shoulder), then the body.
  if (toolDir && (L.carry === 'spade' || L.carry === 'broom') && clip === 'walk') drawTool(ctx, L, clip, handN, P, true);
  if (L.carry === 'yoke') drawYoke(ctx, sh, P, f, clip);
  if (!L.robe) {
    drawLeg(hip, kneeN, ankN, 2);
    foot(ankN, 2);
  }

  if (kind === 'skeleton') {
    paintRibs(ctx, L, hip, sh, up, back);
  } else paintBody(ctx, L, kind, B, hip, waist, sh, up, kneeN, kneeF, ankN, ankF, back, f);
  if (L.robe) {
    if (ankF[0] > ankN[0] + 1) foot(ankF, 1);
    foot(ankN, 2);
  }

  // A sack or a cloth bundle slung on the shoulder, behind the head.
  if (L.carry === 'sack' || L.carry === 'bundle') {
    const s0: P2 = [sh[0] - 4, sh[1] - 2];
    const m = M.of(L.carry === 'sack' ? hex('#b8a372') : hex('#4a5a7a'));
    c.blob(s0, 4, 3, m);
    if (L.carry === 'bundle') c.line([s0[0] - 3, s0[1] - 1], [s0[0] + 3, s0[1] + 1], code(M.of(hex('#d8ceb4')), 3));
    else c.line([s0[0] + 2, s0[1] - 3], [s0[0] + 3, s0[1] - 2], code(m, 1));
  }

  // --- head
  paintHead(ctx, L, kind, hc, rx, ry, back, skull, mSkin, mHair, mInk);

  // --- near arm and what it holds
  if (L.carry === 'plank') {
    const m = M.of(hex('#a77f50'));
    c.rod([sh[0] - 11, sh[1] - 2], [sh[0] + 10, sh[1] - 2], 2.2, 2.2, m);
  }
  if (toolDir && !((L.carry === 'spade' || L.carry === 'broom') && clip === 'walk')) drawTool(ctx, L, clip, handN, P, false);
  drawArm(shN, elbN, handN, 2);
  if (L.carry === 'bucket' || L.carry === 'basket' || L.carry === 'lantern' || L.carry === 'book') drawHeld(ctx, L.carry, handN);
}

/** How long the tool for a look and clip is (for the far hand's grip). */
function toolLen(L: Look, clip: FolkClip): number {
  if (clip === 'dig' || L.carry === 'spade') return 13;
  if (clip === 'scythe') return 18;
  if (clip === 'sweep' || L.carry === 'broom') return 14;
  return 8;
}

function drawTool(ctx: PaintCtx, L: Look, clip: FolkClip, hand: P2, P: Pose, behind: boolean): void {
  const { c, M } = ctx;
  const d = dirOf(P.tool);
  const wood = M.of(WOOD);
  const iron = M.of(IRON, 0.11);
  const at = (s: number): P2 => [hand[0] + 0.5 + d[0] * s, hand[1] + 0.5 + d[1] * s];
  const t = behind ? 1 : 2;
  const kind = clip === 'walk' || clip === 'idle' ? L.carry : clip;
  switch (kind) {
    case 'hammer': {
      c.rod(at(-1), at(6), 1.4, 1.4, wood, { tone: t });
      // The head across the end of the haft.
      const n: P2 = [-d[1], d[0]];
      const e = at(6.5);
      c.rod([e[0] - n[0] * 1.8, e[1] - n[1] * 1.8], [e[0] + n[0] * 1.8, e[1] + n[1] * 1.8], 2.4, 2.4, iron, { tone: t + 1 });
      if (clip === 'hammer' && (P.tool > 150 && P.tool < 200)) {
        // The strike: a pale arc behind the falling head.
        c.smear([hand[0] + 0.5, hand[1] + 0.5], P.tool + 40, P.tool, 5.5, 7.5, M.of(hex('#e8e0cc')), { tone: 2 });
      }
      break;
    }
    case 'saw': {
      c.rod(at(-1), at(1.5), 2, 2, wood, { tone: t });
      const a = at(1.5), b = at(10);
      c.poly(
        [a, b, [b[0] + 0.6, b[1] + 2], [a[0] + 0.4, a[1] + 3]].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2),
        (x, y) => (((x + y) & 1) === 0 && y > c.sy(Math.min(a[1], b[1])) + 1 ? M.code(iron, 1) : M.code(iron, 3)),
      );
      break;
    }
    case 'dig':
    case 'spade': {
      c.rod(at(-2), at(9.5), 1.4, 1.4, wood, { tone: t });
      // T-grip at the top, the blade at the bottom.
      const g = at(-2.5);
      dot(c, g[0] - 1, g[1], M.code(wood, t + 1));
      dot(c, g[0] + 1, g[1], M.code(wood, t));
      c.rod(at(9.5), at(13), 3.2, 2.6, iron, { tone: t });
      if (clip === 'dig' && P.tool > 40 && P.tool < 150) c.blob(at(12.5), 1.6, 1.2, M.of(hex('#5a4630')));
      break;
    }
    case 'scythe': {
      c.rod(at(-6), at(12), 1.4, 1.4, wood, { tone: t });
      const n: P2 = [-d[1], d[0]];
      const e = at(12);
      // The blade: a long shallow crescent from the heel at the snath's end, sweeping back.
      const side = d[0] >= 0 ? -1 : 1;
      const bl = (k: number, w: number): P2 => [e[0] + side * k * 1.0 + n[0] * w, e[1] + k * 0.22 * Math.sign(d[1] || 1) + n[1] * w];
      const blade: P2[] = [bl(0, -0.6), bl(3, -0.9), bl(6, -0.6), bl(9, 0.4), bl(6, 0.9), bl(3, 1.2), bl(0, 1)];
      c.poly(blade.map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), (px, py) => M.code(iron, py < c.sy(e[1]) ? 4 : 2));
      // The nib (the second grip) on the snath.
      const nb = at(4);
      dot(c, nb[0] + n[0] * 1.5, nb[1] + n[1] * 1.5, M.code(wood, t + 1));
      break;
    }
    case 'sweep':
    case 'broom': {
      c.rod(at(-2), at(11), 1.3, 1.3, wood, { tone: t });
      const e = at(11), f = at(15);
      const n: P2 = [-d[1], d[0]];
      const straw = M.of(hex('#b89a52'));
      c.poly(
        [[e[0] - n[0], e[1] - n[1]], [e[0] + n[0], e[1] + n[1]], [f[0] + n[0] * 2.6, f[1] + n[1] * 2.6], [f[0] - n[0] * 2.6, f[1] - n[1] * 2.6]].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2),
        (x, y) => M.code(straw, (x + y * 2) % 3 === 0 ? 1 : 3),
      );
      break;
    }
    case 'staff': {
      c.rod(at(-12), at(9), 1.5, 1.5, wood, { tone: t });
      if (L.eyes) {
        // The necromancer's staff: a skull on top with a coal in it.
        const s = at(-13.5);
        c.blob(s, 2, 1.8, M.of(BONE));
        dot(c, s[0] + 0.5, s[1], M.code(M.of(L.eyes, 0.075, true), 2));
        dot(c, s[0] - 0.5, s[1] + 1, M.code(M.of(INK, 0.075, true), 2));
      } else {
        const s = at(-12.5);
        dot(c, s[0], s[1], M.code(wood, 3));
      }
      break;
    }
    case 'parasol': {
      // A wagasa: oiled-paper canopy on bamboo ribs, the shaft held up beside the head.
      c.rod(at(-6), at(13), 1.1, 1.1, M.of(hex('#c9a862')), { tone: t });
      const top = at(-13);
      const col = L.trim ?? hex('#b5372b');
      const m = M.of(col);
      const pts: P2[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        pts.push([top[0] + Math.cos(a) * 8, top[1] + 3.2 + Math.sin(a) * 3.6]);
      }
      pts.push([top[0] + 7, top[1] + 3.8], [top[0] - 7, top[1] + 3.8]);
      const ox = c.sx(top[0]);
      c.poly(
        pts.map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2),
        (x, y) => {
          const dx = x + 0.5 - ox;
          const ry = y - c.sy(top[1]);
          if (ry >= 6) return M.code(m, 0);
          // Ribs: dark radial lines, lit on the left of the dome.
          if (Math.abs(dx) > 1 && Math.round(dx) % 3 === 0 && ry > 1) return M.code(m, 1);
          return M.code(m, dx < -2 ? 3 : dx > 3 ? 1 : 2);
        },
      );
      dot(c, top[0], top[1] - 0.6, M.code(m, 1));
      break;
    }
  }
}

/** Buckets, baskets, books and lanterns hang from or rest in the near hand. */
function drawHeld(ctx: PaintCtx, what: Look['carry'], h: P2): void {
  const { c, M } = ctx;
  if (what === 'bucket') {
    const m = M.of(WOOD);
    c.rod([h[0] + 0.5, h[1] + 2.5], [h[0] + 0.5, h[1] + 6], 4, 3.4, m);
    c.line([h[0] - 1, h[1] + 3], [h[0] + 2, h[1] + 3], M.code(M.of(IRON), 1));
    c.line([h[0] - 1, h[1] + 5], [h[0] + 2, h[1] + 5], M.code(M.of(IRON), 1));
    c.line([h[0] - 1, h[1] + 1], [h[0] + 2, h[1] + 1], M.code(M.of(IRON), 2));
  } else if (what === 'basket') {
    const m = M.of(hex('#a8843e'));
    c.blob([h[0] + 1, h[1] + 1.5], 3.2, 2.4, m, {
      detail: (x, y) => ((x + y) % 2 === 0 ? M.code(m, 1) : -1),
    });
    // Greens or bread in it.
    c.blob([h[0] + 1, h[1] - 0.5], 2.2, 1.2, M.of(hex('#7a9a44')));
  } else if (what === 'lantern') {
    c.line([h[0], h[1]], [h[0], h[1] + 2], M.code(M.of(IRON), 1));
    c.rod([h[0] + 0.5, h[1] + 3], [h[0] + 0.5, h[1] + 6], 3, 3, M.of(hex('#f0d890'), 0.075, true));
    dot(c, h[0], h[1] + 2, M.code(M.of(hex('#3a2a20')), 2));
  } else if (what === 'book') {
    const m = M.of(hex('#6a2420'));
    c.rod([h[0] - 1, h[1] - 0.5], [h[0] + 2.5, h[1] - 1], 2.6, 2.6, m);
    c.line([h[0] - 1, h[1] - 2], [h[0] + 2, h[1] - 2], M.code(M.of(LINEN), 3));
  }
}

/** The carrying pole: across the shoulder, a basket of goods hanging at each end. */
function drawYoke(ctx: PaintCtx, sh: P2, P: Pose, f: number, clip: FolkClip): void {
  const { c, M } = ctx;
  const bob = clip === 'walk' ? (f % 4 < 2 ? 0 : 1) : 0;
  const a: P2 = [sh[0] - 12, sh[1] - 1 + bob];
  const b: P2 = [sh[0] + 12, sh[1] - 2 + bob];
  c.rod(a, b, 1.3, 1.3, M.of(hex('#c9aa6a')));
  for (const [e, s] of [[a, 1], [b, 2]] as [P2, number][]) {
    c.line([e[0], e[1]], [e[0], e[1] + 8], M.code(M.of(hex('#8a7a52')), 1));
    const m = M.of(hex('#9a7a3a'));
    c.rod([e[0] + 0.5, e[1] + 9], [e[0] + 0.5, e[1] + 12], 5, 4.4, m, { tone: s, detail: (x, y) => ((x + y) % 2 ? M.code(m, s - 1) : -1) });
    c.blob([e[0] + 0.5, e[1] + 8.3], 2.2, 1, M.of(s === 1 ? hex('#c8b47a') : hex('#7a9a44')));
  }
  void P;
}

// ------------------------------------------------------------------ the body

function paintBody(
  ctx: PaintCtx, L: Look, kind: string, B: Build, hip: P2, waist: P2, sh: P2, up: P2, kneeN: P2, kneeF: P2, ankN: P2, ankF: P2, back: boolean, f: number,
): void {
  const { c, M } = ctx;
  const mBody = M.of(L.body);
  const r: P2 = [-up[1], up[0]];
  // Hem: a tunic stops at mid-thigh (a short kimono a little above the knee); a robe at the ankle.
  const robe = L.robe;
  const hemY = robe ? -1 : hip[1] + (kind === 'child' ? 3 : 5);
  const at = (p: P2, across: number): P2 => [p[0] + r[0] * across, p[1] + r[1] * across];
  const topB = at(sh, -B.sw), topF = at(sh, B.sw - 0.5);
  const wB = at(waist, -B.ww), wF = at(waist, B.ww);
  let hemB: P2, hemF: P2;
  if (robe) {
    const lo = Math.min(ankN[0], ankF[0]) - 2.5;
    const hi = Math.max(ankN[0], ankF[0]) + 3;
    hemB = [Math.min(lo, wB[0] - 1.5), hemY];
    hemF = [Math.max(hi, wF[0] + 1.5), hemY];
  } else {
    const spread = Math.max(0, Math.abs(kneeN[0] - kneeF[0]) - 2) * 0.5;
    hemB = [Math.min(wB[0], kneeF[0] - 2) - 0.8 - spread * 0.3, hemY];
    hemF = [Math.max(wF[0], kneeN[0] + 2) + 0.8 + spread * 0.3, hemY + 0.5];
  }
  const pts: P2[] = [topB, [topB[0] + 1, topB[1] - 1], [topF[0] - 1, topF[1] - 1], topF, wF, hemF, hemB, wB];
  const rags = !!L.rags;
  const mTrim = L.trim ? M.of(L.trim) : -1;
  const kasuri = L.pattern === 'kasuri';
  const mKasuri = M.of(mix(L.body, hex('#e8e4d8'), 0.62));
  const hemPx = c.sy(hemY);
  const axis = { a: [c.sx(waist[0]), c.sy(waist[1])] as P2, b: [c.sx(sh[0]), c.sy(sh[1])] as P2, w: 2 * B.sw + 1 };
  c.poly(
    pts.map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2),
    (x, y, u) => {
      const lx = c.lx(x), ly = c.ly(y);
      // Rags: a torn, ragged hem.
      if (rags && y >= hemPx - 2 && ((lx * 7 + ly * 3) % 5 === 0 || (y >= hemPx - 1 && lx % 3 === 1))) return -1;
      if (mTrim >= 0 && y >= hemPx - 1) return M.code(mTrim, u > 0.4 ? 1 : 2);
      let t = u < -0.5 ? 3 : u > 0.62 ? 0 : u > 0.2 ? 1 : 2;
      if (y <= c.sy(sh[1]) && t < 3) t = Math.min(3, t + 1);
      // Kasuri: small pale splashes in the weave (their own material, so cleanup keeps them).
      if (kasuri && lx % 3 === 1 && ly % 4 === 2 && u < 0.62) return M.code(mKasuri, t >= 2 ? 2 : 1);
      if (L.pattern === 'stripe' && lx % 3 === 0) t = Math.max(0, t - 1);
      return M.code(mBody, t);
    },
    axis,
  );
  // Folds: from the belt toward each knee (a robe: toward each foot), shade with a lit edge.
  const belt: P2 = [waist[0], waist[1] + 1];
  const foldTo = (target: P2, lit: boolean) => {
    const y1 = (robe ? hemY : hemY) - 1.5;
    const k = (y1 - belt[1]) / Math.max(1, target[1] - belt[1]);
    const x1 = belt[0] + (target[0] - belt[0]) * Math.min(1, k);
    c.line([belt[0] + (lit ? -1 : 0.5), belt[1] + 2], [x1 + (lit ? -1 : 0), y1], M.code(mBody, lit ? 3 : 1));
  };
  if (robe) {
    foldTo([ankF[0] - 1, ankF[1]], false);
    foldTo([ankN[0] + 1, ankN[1]], false);
    foldTo([ankN[0] - 1, ankN[1]], true);
  } else {
    foldTo([kneeN[0], kneeN[1]], false);
    if (Math.abs(kneeN[0] - kneeF[0]) > 3) foldTo([kneeF[0], kneeF[1]], true);
  }
  // Kesa: a sash worn crossways from the far shoulder to the near hip.
  if (L.kesa) {
    const m = M.of(L.kesa);
    c.rod(at(sh, -B.sw + 1), at([hip[0], hip[1] - 1], B.ww), 2.4, 2.6, m);
  }
  // Apron.
  if (L.apron && !back) {
    const m = M.of(L.apron);
    const a0 = at(sh, 0.5), a1 = at([sh[0], sh[1] + 2], B.sw - 0.5);
    const b1: P2 = [Math.max(hemF[0], kneeN[0] + 1.5), robe ? -3 : hemY + 3];
    const b0: P2 = [hip[0] - 0.5, robe ? -3 : hemY + 3];
    c.poly([a0, a1, b1, b0].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), (x, y, u) => M.code(m, u > 0.3 ? 1 : 2), { a: [c.sx(hip[0]), c.sy(hip[1])], b: [c.sx(sh[0]), c.sy(sh[1])], w: 5 });
  }
  // Belt or sash (an obi is wide, with a knot at the back).
  const sash = L.sash ?? (robe ? null : tone(L.legs, 0.35));
  if (sash) {
    const m = M.of(sash);
    const wide = kind === 'woman' && ctx.faction === 'samurai' ? 2 : 1;
    for (let k = 0; k < wide; k++) c.line(at([waist[0], waist[1] + k], -B.ww - 0.5), at([waist[0], waist[1] + k], B.ww), M.code(m, 2 - k));
    if (wide > 1) c.blob(at([waist[0], waist[1] + 0.5], -B.ww - 1.5), 1.6, 1.8, m);
    else if (!back && !robe) dot(c, ...at([waist[0], waist[1]], B.ww - 1), M.code(M.of(hex('#c8b070')), 3));
  }
  // The red cross of the Temple on the breast (or the back).
  if (L.cross) {
    const m = M.of(L.cross, 0.06);
    const cc = at([sh[0] + up[0] * -2.5, sh[1] + up[1] * -2.5], back ? -0.5 : 0);
    c.line([cc[0], cc[1] - 2], [cc[0], cc[1] + 2.5], M.code(m, 2));
    c.line([cc[0] - 2, cc[1]], [cc[0] + 2, cc[1]], M.code(m, 2));
  }
  // A collar or a hood thrown back on the shoulders.
  if (L.cape) {
    const m = M.of(L.cape);
    c.poly(
      [at([sh[0], sh[1] - 1], -B.sw - 0.5), at([sh[0], sh[1] - 1], B.sw), at([sh[0] - up[0] * 3, sh[1] - up[1] * 3], B.sw + 0.5), at([sh[0] - up[0] * 3.5, sh[1] - up[1] * 3.5], -B.sw - 1)].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2),
      (x, y, u) => M.code(m, u < -0.4 ? 3 : u > 0.4 ? 1 : 2),
      axis,
    );
  } else if (!back && !L.cross) {
    // The neckline: a small dark V at the front of the throat.
    const n = at(sh, B.sw - 2);
    dot(c, n[0], n[1], M.code(mBody, 0));
    dot(c, n[0] - 1, n[1] - 1, M.code(mBody, 1));
  }
  void f;
}

/** A skeleton's trunk: spine, a ribcage of bars with dark gaps, and a pelvis. */
function paintRibs(ctx: PaintCtx, L: Look, hip: P2, sh: P2, up: P2, back: boolean): void {
  const { c, M } = ctx;
  const m = M.of(BONE);
  const hollow = M.of(hex('#2a2428'));
  const r: P2 = [-up[1], up[0]];
  const along = (k: number, a: number): P2 => [hip[0] + up[0] * k + r[0] * a, hip[1] + up[1] * k + r[1] * a];
  // The pelvis, the spine (vertebrae as alternate light and dark knuckles), the dark hollow of
  // the chest behind the ribs, then the ribs as curved bars and the collarbones.
  c.blob([hip[0] + 0.5, hip[1] - 0.5], 2.8, 1.8, m);
  dot(c, hip[0], hip[1] - 1, M.code(hollow, 2));
  for (let k = 1; k <= 9; k++) dot(c, ...along(k, back ? 0 : -1.5), M.code(m, k % 2 ? 3 : 1));
  oval(c, M, along(6.5, 0.3), 3.4, 2.8, hollow, () => true, 2);
  for (let k = 4; k <= 8; k += 1.5) {
    const w = k < 5 ? 2.4 : k > 7.5 ? 2.6 : 3.2;
    c.line(along(k, -w), along(k - 0.8, w), M.code(m, k > 7 ? 3 : 2));
  }
  c.line(along(9, -3), along(9, 3), M.code(m, 3));
  // What is left of the clothes: a rag round the loins, a strip over a shoulder.
  if (L.body !== undefined && L.kind === 'skeleton') {
    const mr = M.of(L.body);
    c.poly([along(1.5, -3), along(1.5, 3), along(-3.5, 3.5), along(-2, 0.5), along(-4, -1), along(-2.5, -3.2)].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), (x, y, u) => M.code(mr, (x * 3 + y) % 5 === 0 ? 1 : u > 0.3 ? 1 : 2), { a: [c.sx(hip[0]), c.sy(hip[1] + 3)], b: [c.sx(hip[0]), c.sy(hip[1] - 2)], w: 7 });
    if (L.sash) c.rod(along(8.5, -2.5), along(2, 2.8), 1.6, 1.6, M.of(L.sash));
  }
}

// ------------------------------------------------------------------ the head

function paintHead(ctx: PaintCtx, L: Look, kind: string, hc: P2, rx: number, ry: number, back: boolean, skull: boolean, mSkin: number, mHair: number, mInk: number): void {
  const { c, M } = ctx;
  const [x, y] = hc;
  const code = (m: number, t: number) => M.code(m, t);
  const cx = x + 0.5, cy = y + 0.5;
  const H = L.head;
  const hairC = L.locks ?? L.hair;
  const mLocks = M.of(hairC);
  const eyes = L.eyes ? M.of(L.eyes, 0.075, true) : -1;
  // The mouth is its own material, so the small-cluster cleanup does not fill it in.
  const mLip = M.of(mix(skull ? BONE : L.skin ?? ctx.skin, hex('#5a2a26'), 0.45));
  // Neck.
  c.rod([x, y + ry - 1], [x - 0.5, y + ry + 1.5], 2.2, 2.2, skull ? M.of(BONE) : mSkin, { tone: 1 });
  // Things that hang behind the head go first.
  if (!back && (H === 'hood' || H === 'cowl' || H === 'chaperon')) c.rod([x - 2, y - 1], [x - 5, y + 6], 2, 1.4, mHair, { tone: 1 });
  if (H === 'wimple' || H === 'veil') c.poly([[x - 3.5, y - 2], [x + 1, y + 1], [x + 1, y + 6], [x - 4.5, y + 6]].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), () => code(mHair, back ? 2 : 1));
  if (kind === 'woman' && H === 'hair') c.rod([x - 2, y], [x - 2.5, y + 6], 3, 2.4, mLocks, { tone: 1 });

  // The head itself.
  c.blob([cx, cy], rx, ry, skull ? M.of(BONE) : mSkin);
  const face = !back;
  const features = (fx: number, fy: number, beard: boolean) => {
    if (skull) {
      c.line([fx + 0.5, fy], [fx + 1.5, fy], code(mInk, 2));
      dot(c, fx + 1, fy + 1, code(mInk, 2));
      if (eyes >= 0) dot(c, fx + 1, fy, code(eyes, 2));
      dot(c, fx + 3, fy + 1.5, code(mInk, 2));
      c.line([fx + 1, fy + 3], [fx + 2.5, fy + 3], code(M.of(BONE), 1));
      dot(c, fx + 2, fy + 2, code(mInk, 2));
      return;
    }
    // Eye (with a glint of white beside it on the larger heads), brow, nose, mouth, ear.
    dot(c, fx + 1, fy, eyes >= 0 ? code(eyes, 2) : code(mInk, 2));
    if (eyes >= 0) dot(c, fx, fy, code(eyes, 2));
    if (kind === 'man' || kind === 'old') dot(c, fx + 1, fy - 1, code(mLocks, 1));
    dot(c, fx + 3, fy + 1, code(mSkin, 2));
    dot(c, fx + 2, fy + 2, code(mLip, 2));
    dot(c, fx - 2, fy, code(mSkin, 1));
    if (beard && L.beard) {
      const mb = M.of(L.beard);
      // Along the jaw and the chin, below the mouth; the cheek stays bare.
      c.poly([[fx - 1.5, fy + 1.5], [fx + 1, fy + 2.6], [fx + 3, fy + 2.6], [fx + 2.6, fy + 4], [fx - 0.5, fy + 4]].map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), (px, py) => code(mb, (px + py) % 3 ? 2 : 1));
      dot(c, fx + 2, fy + 2, code(mLip, 2));
    }
  };

  switch (H) {
    case 'hair':
    case 'bun':
    case 'kerchief':
    case 'straw':
    case 'hat':
    case 'cap':
    case 'coif': {
      // Hair first: a cap of it over the crown and down the back of the head.
      const long = kind === 'woman';
      const hatted = H === 'straw' || H === 'hat' || H === 'cap' || H === 'coif';
      // The face stays clear: everything forward of the ear and below the brow (under a hat, only
      // the hair at the back of the head shows).
      oval(c, M, [cx - 0.6, cy - 1.4], rx + 0.4, ry - 0.6, mLocks, (nx, ny) => back || nx < -0.3 || (!hatted && ny < -0.3));
      c.rod([x - 2, y - 1], [x - 2, y + (long ? 3 : 1)], 2.2, 1.8, mLocks, { tone: 1 });
      if (back) c.blob([cx - 0.3, cy - 0.4], rx + 0.1, ry - 0.2, mLocks);
      if (face) features(x, y, true);
      if (back) dot(c, x + 2, y + 1, code(mSkin, 1));
      break;
    }
    case 'topknot': {
      // Sakayaki: the pate shaved, hair at the sides and back, the oiled knot laid forward on top.
      c.rod([x - 2, y - 2], [x - 2, y + 1], 2.6, 2.2, mLocks, { tone: 1 });
      if (back) c.blob([cx - 0.5, cy], rx - 0.4, ry - 0.6, mLocks);
      c.rod([x - 2, y - 4], [x + 1, y - 4.5], 1.6, 1.4, mLocks, { tone: 2 });
      if (face) features(x, y, false);
      break;
    }
    case 'shaved':
      dot(c, x - 1, y - 2, code(mSkin, 4));
      if (face) features(x, y, false);
      break;
    case 'skull':
      if (face) features(x, y, false);
      break;
    case 'tenugui':
      // A headband tied round the brow, above the eyes, the knot's ends at the back.
      oval(c, M, [cx - 0.6, cy - 1.6], rx + 0.4, ry - 0.8, mLocks, (nx, ny) => back || nx < -0.3 || ny < -0.45);
      c.line([x - 3, y - 2], [x + 2, y - 3], code(mHair, 3));
      c.line([x - 3, y - 1], [x - 1, y - 2], code(mHair, 1));
      c.rod([x - 3.5, y - 1.5], [x - 5, y + 0.5], 1.6, 1.2, mHair, { tone: 2 });
      if (face) features(x, y, false);
      break;
    case 'eboshi':
      c.rod([x - 2, y - 2], [x - 2, y + 1], 2.4, 2, mLocks, { tone: 1 });
      if (face) features(x, y, false);
      break;
    case 'hood':
    case 'chaperon':
    case 'cowl':
    case 'wimple':
    case 'veil':
      break;
    default:
      if (face) features(x, y, false);
  }

  // Headgear over the head.
  const S = (pts: P2[], shade: (px: number, py: number) => number) => c.poly(pts.map((p) => [c.sx(p[0]!), c.sy(p[1]!)] as P2), shade);
  switch (H) {
    case 'straw': {
      // A broad-brimmed straw hat (the reapers in the Tacuinum): a brim, a round crown, a band.
      const m = M.of(L.hair === L.locks ? STRAW : L.hair);
      c.blob([cx, cy - 2.6], rx + 3, 1.4, m, { detail: (px, py) => ((px + py) % 4 === 0 ? code(m, 1) : -1) });
      c.blob([cx - 0.4, cy - 4], rx - 0.2, 2, m);
      c.line([x - 2.5, y - 3], [x + 2, y - 3], code(M.of(hex('#6a4a2a')), 1));
      break;
    }
    case 'hat': {
      const m = mHair;
      c.blob([cx, cy - 2.4], rx + 2, 1.1, m, { tone: 1 });
      c.blob([cx - 0.5, cy - 3.8], rx - 0.4, 1.9, m);
      break;
    }
    case 'cap':
      c.blob([cx - 0.4, cy - 2.6], rx + 0.2, 1.8, mHair);
      c.rod([x + 2, y - 2], [x + 4, y - 1.5], 1.2, 1, mHair, { tone: 1 });
      break;
    case 'coif':
      // A linen coif: it hugs the crown and ties under the chin.
      oval(c, M, [cx - 0.6, cy - 1.6], rx + 0.5, ry - 0.6, mHair, (nx, ny) => back || nx < -0.05 || ny < -0.25);
      if (back) c.blob([cx - 0.4, cy - 0.6], rx + 0.2, ry - 0.2, mHair);
      if (face) c.line([x - 1, y + 1], [x + 1, y + 3], code(mHair, 1));
      break;
    case 'kerchief':
      oval(c, M, [cx - 0.6, cy - 1.8], rx + 0.4, ry - 1, mHair, (nx, ny) => back || nx < 0.2 || ny < -0.3);
      c.rod([x - 3, y - 1], [x - 4.5, y + 1.5], 1.8, 1.2, mHair, { tone: 1 });
      break;
    case 'bun': {
      // A shimada: the hair drawn up into a loop on the crown, a comb, a pin.
      c.blob([cx - 1.6, cy - 4.2], 2.6, 1.7, mLocks);
      c.blob([cx - 3.5, cy - 0.8], 1.6, 1.8, mLocks, { tone: 1 });
      dot(c, x, y - 4, code(M.of(L.trim ?? hex('#c8902c')), 3));
      c.line([x - 3, y - 5], [x + 1, y - 6], code(M.of(hex('#d8b860')), 3));
      break;
    }
    case 'kasa': {
      // A sedge hat: a wide, shallow cone, woven in rings, lit on its upper left.
      const m = mHair;
      S([[x - 7, y - 1.2], [x - 1, y - 6.4], [x + 1, y - 6.4], [x + 7.5, y - 1.2], [x + 6, y], [x - 6, y]], (px, py) => {
        const dx = px + 0.5 - c.sx(x);
        const ry2 = py - c.sy(y - 6);
        if (ry2 >= 5.5) return code(m, 0);
        if (ry2 >= 4.5) return code(m, 1);
        if ((ry2 | 0) % 2 === 1 && Math.abs(dx) > 1.5) return code(m, dx < 0 ? 2 : 1);
        return code(m, dx < -1 ? 4 : dx < 2.5 ? 3 : 2);
      });
      break;
    }
    case 'jingasa': {
      const m = mHair;
      S([[x - 6, y - 1.2], [x - 1, y - 4.6], [x + 1, y - 4.6], [x + 6.5, y - 1.2], [x + 5, y - 0.2], [x - 5, y - 0.2]], (px, py) => {
        const dx = px + 0.5 - c.sx(x);
        const ry2 = py - c.sy(y - 4.6);
        if (ry2 >= 3.4) return code(m, 0);
        return code(m, dx < -1 ? 3 : dx < 2 ? 2 : 1);
      });
      dot(c, x, y - 3, code(M.of(hex('#d9b24c'), 0.075, true), 2));
      break;
    }
    case 'eboshi': {
      const m = M.of(hex('#26242c'), 0.06);
      c.rod([x - 0.5, y - 2], [x - 1.5, y - 8], 4.6, 3.4, m);
      c.rod([x - 1.5, y - 8], [x - 0.5, y - 9.5], 2.4, 1.6, m, { tone: 1 });
      break;
    }
    case 'hood':
    case 'chaperon':
    case 'cowl': {
      // The hood: it frames the face and falls to the shoulders (a cowl hides the face in shadow).
      const cowl = H === 'cowl';
      c.blob([cx - 0.6, cy - 0.4], rx + 1.1, ry + 0.9, mHair);
      if (cowl) {
        S([[x - 2, y - 5], [x - 4.5, y - 7.5], [x - 0.5, y - 4.5]], () => code(mHair, 2));
      }
      if (!back) {
        // The opening: the face (or the dark inside of the cowl).
        const open = cowl ? M.of(mix(L.hair, hex('#0c0a10'), 0.75)) : mSkin;
        c.blob([cx + 1.4, cy + 0.6], 2, ry - 1.2, open, { tone: cowl ? 2 : 2 });
        if (cowl) {
          if (eyes >= 0) {
            dot(c, x + 1, y, code(eyes, 2));
            dot(c, x + 2, y, code(eyes, 2));
          }
        } else {
          dot(c, x + 2, y, code(mInk, 2));
          dot(c, x + 3, y + 1, code(mSkin, 3));
          dot(c, x + 2, y + 2, code(mLip, 2));
          if (L.beard) c.line([x + 1, y + 3], [x + 2.5, y + 3], code(M.of(L.beard), 2));
        }
        c.line([x - 1, y - 3], [x + 2, y - 3], code(mHair, 3));
      }
      if (H === 'chaperon') c.rod([x - 3, y - 3], [x - 1, y - 4.5], 2.4, 1.6, mHair, { tone: 3 });
      break;
    }
    case 'wimple':
    case 'veil': {
      // Veil and wimple: white linen round the face and over the head, falling behind.
      c.blob([cx - 0.8, cy - 0.6], rx + 0.4, ry + 0.4, mHair);
      if (!back) {
        oval(c, M, [cx + 0.9, cy + 0.5], 2.8, ry - 0.4, mSkin, () => true);
        dot(c, x + 2, y, code(mInk, 2));
        dot(c, x + 3, y + 1, code(mSkin, 3));
        dot(c, x + 2, y + 2, code(mLip, 2));
        if (H === 'veil') c.line([x - 2, y - 4], [x + 2, y - 4], code(M.of(L.trim ?? hex('#3a2e2a')), 2));
      }
      break;
    }
  }
}
