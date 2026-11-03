// Templar key art: one static image per kind (idle, facing SE, level 8), drawn with the paper
// painter's primitives but placed by hand. Not registered with the painter and not used by the
// game: these are the approved looks the animated figures will be rebuilt from.
//
// The bulk brief (user targets: the D2R Paladin, the CraftPix knight): limbs are shaped volumes,
// not rods; broad shoulders and a solid layered torso; big shields held tight against the body;
// helms and mail with mass; massive horses under caparisons. At a figure height H of 14 units:
// upper arm ~0.09 H, forearm ~0.085 H, thigh ~0.11 H, shin ~0.085 H, shoulders ~0.36 H (0.45 H
// with padding or a mail cape), waist ~0.24 H; kite shield ~0.48 H x 0.3 H.

import { addP, code, DEG, defineMaterial, figurePalette, hash, oklchRgb, Paper, rot, type Mat, type P2, type RGB } from './core.ts';
import { BODIES, type BodyType } from './rig.ts';
import { at, beauseant, bow, crossbow, frameAt as frameAt0, isMail, KNIGHT_PAIRS, lerp, local, mailTex as mailRows, mul, paintAs, spear, sub, sword, TK, TM, type ValueClass } from './templar-parts.ts';

// ------------------------------------------------------------------ part maps (the rig)

/**
 * Where key-art geometry lands while an animated part draws it (templar-rig.ts): `f` takes a
 * point of the key art (rest pose, units) to the figure, `inv` takes a figure point back (for
 * shading in the part's own coordinates, so texture and folds ride on the part), and `deg` is how
 * far the part has turned (snapped). Null for the key art itself, which then draws exactly as
 * before.
 */
export interface PartMap {
  f(p: P2): P2;
  inv(p: P2): P2;
  deg: number;
}
let XF: PartMap | null = null;
/** Draws with key-art geometry mapped through `m` (nests; restores the previous map). */
export function withMap<T>(m: PartMap | null, draw: () => T): T {
  const was = XF;
  XF = m;
  try {
    return draw();
  } finally {
    XF = was;
  }
}
/** A key-art point where it lands now. */
const T = (p: P2): P2 => (XF ? XF.f(p) : p);
/** A canvas pixel's centre back in key-art units. */
const back = (c: Paper, x: number, y: number): P2 => {
  const p: P2 = [(x + 0.5 - c.FX) / c.L, (y + 0.5 - c.FY) / c.L];
  return XF ? XF.inv(p) : p;
};
/** A frame for a key-art point and angle, turned with the part. */
// frameAt turns clockwise on screen, rig angles counter-clockwise: a part turned by +d turns its frames by -d.
const frameAt = (o: P2, deg: number) => frameAt0(T(o), deg - (XF ? XF.deg : 0));
/** An ellipse at a key-art centre. */
const lineK = (c: Paper, a: P2, b: P2, cd: number): void => c.line(T(a), T(b), cd);
const blob = (c: Paper, o: P2, rx: number, ry: number, m: Mat, opts: Parameters<Paper['blob']>[4] = {}): void => c.blob(T(o), rx, ry, m, opts);
/** A polygon of key-art points, shaded with key-art units. */
const shapeK = (c: Paper, pts: P2[], shade: (x: number, y: number, ux: number, uy: number) => number): void => {
  // Under a map that bends (cloth over two bones) long edges are split so the outline follows it.
  const dense: P2[] = [];
  if (XF)
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6));
      for (let k = 0; k < n; k++) dense.push(lerp(a, b, k / n));
    });
  c.shape((XF ? dense : pts).map(T), (x, y) => {
    const q = back(c, x, y);
    return shade(x, y, q[0], q[1]);
  });
};

// ------------------------------------------------------------------ key-art materials

/**
 * Dyes for the foot that only the key art uses so far (defined here, so the live palette is
 * untouched): a ramp from five lightnesses with hue stepping toward violet in the shadows and
 * warm in the lights, over the shared umber deep tone.
 */
function dye(ls: readonly number[], cs: readonly number[], h: number): RGB[] {
  return ls.map((l, i) => oklchRgb(l, cs[i]!, h + (i - 2) * 9));
}
const KM = {
  /** The levy's padded gambeson: undyed, ochre with dirt. */
  ochre: defineMaterial('templar.k.ochre', dye([0.2, 0.34, 0.64, 0.73, 0.81], [0.03, 0.06, 0.07, 0.06, 0.05], 78)),
  /** The javelin men's madder-red tunics. */
  madder: defineMaterial('templar.k.madder', dye([0.17, 0.23, 0.3, 0.38, 0.47], [0.05, 0.075, 0.085, 0.07, 0.05], 30)),
  /** The pilgrims' undyed grey hoods and short tunics (cool, slate). */
  slate: defineMaterial('templar.k.slate', dye([0.2, 0.35, 0.6, 0.69, 0.78], [0.02, 0.025, 0.03, 0.025, 0.02], 250)),
  /** Linen hose and leg wraps. */
  wraps: defineMaterial('templar.k.wraps', dye([0.25, 0.48, 0.63, 0.72, 0.8], [0.02, 0.03, 0.035, 0.03, 0.025], 85)),
  /** The brothers' polished mail: bright silver with hard lights (the key art's heroic steel). */
  silver: defineMaterial('templar.k.silver', dye([0.66, 0.44, 0.62, 0.76, 0.9], [0.012, 0.015, 0.016, 0.014, 0.01], 240)),
  /** The Iron Brethren's black tabard on a light (white-mantled) figure: near-black, cool, with the pale deep tone of the light class. */
  sable: defineMaterial('templar.k.sable', dye([0.66, 0.2, 0.25, 0.31, 0.38], [0.01, 0.012, 0.014, 0.012, 0.01], 285)),
  /** Fur collars: grey-white wolf and fox. */
  fur: defineMaterial('templar.k.fur', dye([0.24, 0.5, 0.66, 0.78, 0.87], [0.015, 0.02, 0.022, 0.02, 0.016], 70)),
};
// The charging brothers' silver mail gets the knight class's real shadows too.
KNIGHT_PAIRS.push([KM.silver, TK.silver]);
/** Mail, including the key art's silver. */
const isMailS = (m: Mat): boolean => isMail(m) || m === KM.silver;

// ------------------------------------------------------------------ mail

/**
 * Riveted mail at key-art size: staggered rings in 4 x 3 px cells (a row offset by half a ring),
 * each ring a lit upper rim, a dark hole and dark gaps between rings; on the shadow side the
 * whole cell drops a step (Morgan Bible fol. 28r; the riveted hauberk close-up). Below level 4 it
 * falls back to the painter's row texture. `lit` is -1 lit .. 1 shadow.
 */
function mailTex(c: Paper, x: number, y: number, lit: number, base = 2, m: Mat = TM.mail): number {
  if (c.L < 4) return mailRows(c, x, y, lit, base, m);
  const lx = c.lx(x), ly = c.ly(y);
  const row = Math.floor(ly / 3);
  const cx = (((lx + (row & 1) * 2) % 4) + 4) % 4, cy = ((ly % 3) + 3) % 3;
  const b = lit > 0 ? base - 1 : base;
  if (cy === 1 && (cx === 1 || cx === 2)) return code(m, b - 1); // the ring's hole
  if ((cx === 0 || cx === 3) && cy !== 1) return code(m, b - 1); // the gap between rings
  if (cy === 0 && lit < 0) return code(m, b + 1); // lit upper rim
  if (cy === 0 && lit === 0 && cx === 1) return code(m, b + 1);
  if (c.tex(x, y, 41, 4) < 0.05) return code(TM.leather, 1); // grime and rust in the links
  return code(m, b);
}

// ------------------------------------------------------------------ volumes

/** A width profile along a part: [t (0..1 along), half width (units)]. */
type Profile = readonly (readonly [number, number])[];

const halfAt = (prof: Profile, t: number): number => {
  for (let i = 1; i < prof.length; i++) {
    const [t0, w0] = prof[i - 1]!, [t1, w1] = prof[i]!;
    if (t <= t1) return w0 + ((w1 - w0) * (t - t0)) / Math.max(1e-6, t1 - t0);
  }
  return prof.at(-1)![1];
};

interface VolOpts {
  tone?: number;
  /** Hard material: a specular strip on the lit side. */
  shine?: boolean;
  /** Painted detail first (x, y, across -1 lit .. 1 shadow, along 0..1); -1 to fall through. */
  detail?: (x: number, y: number, u: number, v: number) => number;
}

/**
 * A shaped volume from a to b: a limb, a haft, a boot. Shaded the pixel-art way on its own
 * width: a lit band on the light side, the body, a shadow band on the far side; mail gets rings.
 */
export function vol(c: Paper, a0: P2, b0: P2, prof: Profile, m: Mat, o: VolOpts = {}): void {
  const a = T(a0), b = T(b0);
  const d = sub(b, a);
  const len = Math.hypot(d[0], d[1]) || 1;
  const dir: P2 = [d[0] / len, d[1] / len];
  const n: P2 = [-dir[1], dir[0]];
  const steps = 10;
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = addP(a, mul(d, t));
    const w = halfAt(prof, t);
    left.push(addP(p, mul(n, w)));
    right.push(sub(p, mul(n, w)));
  }
  const maxW = Math.max(...prof.map(([, w]) => w));
  const base = o.tone ?? 2;
  const A: P2 = [c.sx(a[0]), c.sy(a[1])], B: P2 = [c.sx(b[0]), c.sy(b[1])];
  c.poly([...left, ...right.reverse()].map((p) => [c.sx(p[0]), c.sy(p[1])] as P2), (x, y, u, v) => {
    // Across the width (-1 lit .. 1 shadow), the terminators wandering a little along the part
    // (bands that keep a fixed distance from the outline hug it; level 4 and up).
    const ul = (u * maxW) / Math.max(0.05, halfAt(prof, Math.min(1, Math.max(0, v)))) + (c.L >= 4 ? 0.22 * Math.sin(v * 9) : 0);
    if (o.detail) {
      const r = o.detail(x, y, ul, v);
      if (r >= 0) return r;
    }
    if (isMailS(m)) {
      const r = mailTex(c, x, y, ul < -0.3 ? -1 : ul > 0.45 ? 1 : 0, ul < -0.45 ? base + 1 : ul > 0.5 ? base - 1 : base, m);
      if (r >= 0) return r;
    }
    // A crisp specular strip on hard materials, set in from the lit edge.
    if (o.shine && ul > -0.62 && ul < -0.38 && v > 0.12 && v < 0.7) return code(m, base + 2);
    // The lit band stops short of the far end and the shadow band of the near end, so the three
    // bands never start and end on the same rows (column banding; README no-boil rule 5).
    // (At level 2 a limb is 2-3 px across and the lit band a 1 px stripe beside the base: none.)
    if (ul < -0.5 + c.band && v < 0.84 && c.L !== 2) return code(m, base + 1);
    // Rim light: the shadow side's outermost sliver catches reflected light from the ground (only
    // on the middle of the limb, so it does not run the length of the outline: hugging).
    if (ul > 0.84 && v > 0.3 && v < 0.62) return code(m, base);
    if (ul > 0.4 + c.band && v > 0.1) return code(m, base - 1);
    return code(m, base);
  }, { a: A, b: B, w: 2 * maxW * c.L });
}

/** A polygon in units with a shade callback that gets units relative to an origin. */
function shapeU(c: Paper, pts: P2[], o: P2, shade: (x: number, y: number, ux: number, uy: number) => number): void {
  if (!XF) {
    c.shape(pts, (x, y) => shade(x, y, (x + 0.5 - c.sx(o[0])) / c.L, (y + 0.5 - c.sy(o[1])) / c.L));
    return;
  }
  shapeK(c, pts, (x, y, ux, uy) => shade(x, y, ux - o[0], uy - o[1]));
}

const within = (c: Paper, d: number, half: number): boolean => Math.abs(d) * c.L < Math.max(0.55, half * c.L);

// ------------------------------------------------------------------ the man

export type SHelm = 'great' | 'gilded' | 'kettle' | 'nasal' | 'cap' | 'pilgrim' | 'turban' | 'hood';

/** A static man's dress. */
export interface SKit {
  helm: SHelm;
  /** Mail (hauberk) or a padded/wool garment under everything. */
  body: Mat;
  /** Surcoat (sleeveless, to the knee) or null. */
  coat: Mat | null;
  cross?: boolean;
  /** A mail cape (camail) over the shoulders. */
  camail?: Mat | null;
  sleeve: Mat;
  hand: Mat;
  legs: Mat;
  boots: Mat;
  belt?: Mat;
  /** Quilted (gambeson) lines on the body garment. */
  quilted?: boolean;
  beard?: boolean;
  /** A short tunic to mid-thigh (light troops), not a skirt to the knee. */
  short?: boolean;
  /** A leather pouch on the belt. */
  pouch?: boolean;
  /** A cloth hood with a shoulder cape (the pilgrims), in this colour. */
  hood?: Mat;
  /** The brothers' white mantle with a fur collar. */
  cloak?: boolean;
  /** Layered steel pauldrons. */
  pauldrons?: boolean;
  /** A wide guard stance (foot). */
  wide?: boolean;
  /** The tabard's cross runs long, from the chest to the hem. */
  longCross?: boolean;
  /**
   * Where the garment's shadow plane starts across the torso, hood and cape (key-art units from
   * the centre line; default 1.35, the far flank only). A light garment on a figure that must
   * read dark against the field turns its whole far half into shade, keeping its lit and base
   * tones (and so its dye) as approved.
   */
  shadeFrom?: number;
  /** The chest cross is mostly behind a shield held across the body (the sergeants' kite). */
  coveredCross?: boolean;
}

/** The fixed key-art pose (units, feet at 0, facing SE: forward is screen right). */
const J = {
  hipN: [-0.85, -6.5] as P2,
  hipF: [0.95, -6.6] as P2,
  kneeN: [-1.15, -3.55] as P2,
  kneeF: [1.25, -3.6] as P2,
  ankN: [-1.45, -0.55] as P2,
  ankF: [1.55, -0.6] as P2,
  shN: [-2.25, -11.2] as P2,
  shF: [2.15, -11.35] as P2,
  neck: [0.0, -12.0] as P2,
  head: [0.15, -13.15] as P2,
};

/**
 * A leg's tone: the far one in shade. At level 1 the legs are the darkest of the figure (the
 * light falls from above: the chest lit, the skirt in shade, the legs and boots below it darker
 * still), else a 13 px figure reads as lit from the ground.
 */
/**
 * At level 2 the legs are drawn a little fuller so they meet: a 1 px slot between them fills with
 * outline and runs down beside both legs, row for row (column banding).
 */
const legGirth = (c: Paper): number => (c.L === 2 ? 1.25 : 1);
const legTone = (c: Paper, far: boolean): number => (c.L < 2 ? (far ? 0 : 1) : far ? 1 : 2);
/** One leg: a thigh with mass, the knee, a calf, the boot with its turned-down top, the foot. */
function legS(c: Paper, hip: P2, knee: P2, ank: P2, k: SKit, far: boolean): void {
  thighS(c, hip, knee, k, far);
  shinS(c, knee, ank, k, far);
  footS(c, ank, k, far);
}
/** The thigh and the knee. */
export function thighS(c: Paper, hip: P2, knee: P2, k: SKit, far: boolean): void {
  const t = legTone(c, far);
  const g = legGirth(c);
  vol(c, hip, knee, [[0, 0.82 * g], [0.35, 0.8 * g], [0.8, 0.66 * g], [1, 0.62 * g]], k.legs, { tone: t });
  // Knee: the mail bulges over a padded knee.
  blob(c, addP(knee, [0.05, 0.05]), 0.66, 0.6, k.legs, { tone: t, detail: isMailS(k.legs) ? (x, y, nx) => mailTex(c, x, y, nx < -0.2 ? -1 : 0, t, k.legs) : undefined });
}
/** The calf and the boot's leg with its cuff. */
export function shinS(c: Paper, knee: P2, ank: P2, k: SKit, far: boolean): void {
  const t = legTone(c, far);
  const g = legGirth(c);
  vol(c, knee, ank, [[0, 0.6 * g], [0.3, 0.66 * g], [0.7, 0.5 * g], [1, 0.45 * g]], k.legs, { tone: c.L < 2 ? t : Math.max(1, t - 1) });
  // Boot: ankle boot with a cuff.
  const top = lerp(knee, ank, 0.58);
  vol(c, top, ank, [[0, 0.55], [0.12, 0.6], [0.2, 0.53], [1, 0.5]], k.boots, { tone: t, detail: (_x, _y, _u, v) => (v < 0.14 ? code(k.boots, t + 1) : -1) });
}
/** The foot pointing forward. */
export function footS(c: Paper, ank: P2, k: SKit, far: boolean): void {
  const t = legTone(c, far);
  const pts: P2[] = [addP(ank, [-0.5, -0.35]), addP(ank, [0.45, -0.3]), addP(ank, [1.35, 0.25]), addP(ank, [1.3, 0.55]), addP(ank, [-0.55, 0.55])];
  if (!XF) {
    c.shape(pts, (_x, y) => code(k.boots, y < c.sy(ank[1] + 0.05) ? t + 1 : y > c.sy(ank[1] + 0.4) ? t - 1 : t));
    return;
  }
  shapeK(c, pts, (_x, _y, _ux, uy) => code(k.boots, uy < ank[1] + 0.05 + 0.5 / c.L ? t + 1 : uy > ank[1] + 0.4 + 0.5 / c.L ? t - 1 : t));
}

/** One arm: deltoid, upper arm, elbow, a forearm widening to the mitten or glove, the fist. */
function armS(c: Paper, sh: P2, el: P2, wr: P2, k: SKit, far: boolean): void {
  upperArmS(c, sh, el, k, far);
  forearmS(c, el, wr, k, far);
  handS(c, el, wr, k, far);
}
/** The upper arm and the elbow. */
/** An arm's tone: the far one in shade; at level 1 the near one lit (it is the top-left of the dark mass, where the light falls). */
const armTone = (c: Paper, far: boolean): number => (far ? 1 : c.L < 2 ? 4 : 2);
export function upperArmS(c: Paper, sh: P2, el: P2, k: SKit, far: boolean): void {
  const t = armTone(c, far);
  vol(c, sh, el, [[0, 0.78], [0.25, 0.72], [0.75, 0.6], [1, 0.56]], k.sleeve, { tone: t });
  blob(c, el, 0.6, 0.58, k.sleeve, { tone: t });
}
export function forearmS(c: Paper, el: P2, wr: P2, k: SKit, far: boolean): void {
  vol(c, el, wr, [[0, 0.56], [0.35, 0.62], [0.8, 0.54], [1, 0.58]], k.sleeve, { tone: armTone(c, far) });
}
/** The fist, a little past the wrist. */
export const handAt = (el: P2, wr: P2): P2 => addP(wr, mul(sub(wr, el), 0.18));
export function handS(c: Paper, el: P2, wr: P2, k: SKit, far: boolean): void {
  blob(c, handAt(el, wr), 0.55, 0.52, k.hand, { tone: armTone(c, far) });
}

/**
 * The torso: a solid mass, broad at the shoulders, the waist drawn in by the belt, the skirt of
 * the hauberk (or tunic) and the surcoat hanging to the knee with weight and folds.
 */
function torsoS(c: Paper, k: SKit, back: boolean): void {
  const garment = k.coat ?? k.body;
  // The hauberk skirt shows below the surcoat hem, split for riding.
  if (k.coat && isMailS(k.body)) {
    shapeU(c, [[-2.0, -7.2], [2.0, -7.2], [2.25, -3.0], [-2.15, -3.0]], [0, -7], (x, y, ux, uy) => mailTex(c, x, y, ux < -1.2 ? -1 : ux > 1.2 ? 1 : 0, 2, k.body) >= 0 ? mailTex(c, x, y, ux < -1.2 ? -1 : ux > 1.2 ? 1 : 0, 2, k.body) : code(k.body, ux < -1.2 ? 3 : ux > 1.2 ? 1 : 2) + (uy > 3.6 ? -1 : 0));
  }
  // The skirt flares to the knee (a short tunic stops at mid-thigh), the hem stepping down toward
  // the back.
  const hemY = k.short ? -5.2 : -3.3;
  const f = (hemY + 7.4) / 4.1;
  const sk = (x: number, y: number): P2 => [x, -7.4 + (y + 7.4) * f];
  const pts: P2[] = [
    [-0.75, -12.15], [0.85, -12.15], [2.45, -11.75], [2.6, -10.7], [2.3, -9.4], [1.75, -8.25], [1.85, -7.4],
    sk(2.35, -5.2), sk(2.55, -3.6), sk(1.35, -3.25), sk(0.35, -3.45), sk(-0.85, -3.15), sk(-2.35, -3.35), sk(-2.2, -5.3),
    [-1.9, -7.4], [-1.8, -8.25], [-2.35, -9.4], [-2.6, -10.7], [-2.5, -11.75],
  ];
  const quilt = k.quilted ?? false;
  const crossX = back ? -0.3 : -0.45;
  shapeU(c, pts, [0, 0], (x, y, ux, uy) => {
    // Light: the upper left; the chest plane faces the viewer and catches it, the far flank and
    // the skirt's underside fall away.
    // The terminators wander with the cloth's folds (straight ones would run parallel to the
    // flanks: bands hugging the outline). Keyed to key-art height, so they ride with the cloth.
    const side = ux + (uy + 9) * 0.12 + (c.L >= 4 ? 0.28 * Math.sin(uy * 2.3) : 0);
    // (At level 2 the lit flank is a 1 px column beside the base, starting under the belt with it: a stripe, so none.)
    let t = side < -1.25 && c.L !== 2 ? 3 : side > (k.shadeFrom ?? 1.35) ? 1 : 2;
    if (uy < -10.6 && ux < 1.0) t = Math.max(t, 3); // shoulders' top plane
    // At level 1 (three tones) the form is one gradient: the chest catches the light, the skirt
    // below the belt falls into shade, so the light reads from above.
    if (c.L < 2) t = uy < -9.4 && side < -0.4 ? 4 : uy < -8.45 ? 2 : 1;
    // Belt, with a buckle and a strap end hanging.
    if (uy > -8.45 && uy < -7.95) {
      if (Math.abs(ux - (back ? -0.6 : 0.45)) < 0.32) return code(TM.steel, uy < -8.2 ? 4 : 2);
      return code(k.belt ?? TM.leather, ux < -1.2 ? 3 : 2);
    }
    if (!back && Math.abs(ux - 0.7) < 0.14 && uy > -7.95 && uy < -6.6) return code(k.belt ?? TM.leather, 1);
    // The cross on the chest (or the back): a broad red cross, its arms reaching the flanks.
    // (A chest cross the kite covers shows only as a 1 px red sliver beside it at level 2: none there.)
    if (k.cross && !(c.L === 2 && k.coveredCross) && uy > -11.5 && uy < (k.longCross ? hemY - 0.2 : -8.5)) {
      const vx = ux - crossX - (k.longCross ? (uy + 8) * 0.04 : 0);
      if ((within(c, vx, k.longCross ? 0.48 : 0.42) && uy > -11.35 && !(uy > -8.45 && uy < -7.95)) || (within(c, uy + 10.25, 0.38) && Math.abs(vx) < 1.45)) return code(TM.red, vx < -0.2 ? 3 : side > 1.3 ? 1 : 2);
    }
    // Skirt folds below the belt: three hanging folds, a dark channel with a lit ridge beside it,
    // drifting toward the back as they fall.
    if (uy > -7.6) {
      const fx = ux - (uy + 7.6) * 0.08;
      // (Below level 4 a fold is a 1 px column ending on the hem row with its neighbours: banding, so none.)
      for (const f0 of c.L >= 4 ? [-1.0, 0.25, 1.35] : []) {
        const dd = fx - f0;
        // A fold: its shadowed channel, and the lit ridge beside it (a clear two-step contrast).
        // The ridge stops short of the hem, each fold at its own height, so ridge and channel do
        // not end on one row.
        if (dd > 0 && dd < 0.26 && uy > -7.0) return code(garment, t - 1);
        if (dd > -0.24 && dd <= 0 && uy > -6.8 && uy < hemY - 0.55 - f0 * 0.2) return code(garment, Math.min(4, t + 1 + (t < 3 ? 1 : 0)));
      }
      // Dirt and wear rising from the hem.
      const hem = hemY - uy;
      if (hem < 0.9 && c.tex(x, y, 47, 3) < 0.5 - hem * 0.45) return code(garment, t - 1);
      if (hem < 0.35) return code(garment, Math.max(1, t - 1));
    }
    if (quilt && uy < -8.5 && ((c.ly(y) % 6 === 0) || (uy < -9.5 && Math.abs(((ux + 5) * 1.6) % 1 - 0.5) < 0.07))) return code(garment, t - 1);
    if (isMailS(garment)) {
      const r = mailTex(c, x, y, t > 2 ? -1 : t < 2 ? 1 : 0, t, garment);
      if (r >= 0) return r;
    }
    // Under the chest and the shoulder blade: a soft shadow that shapes the torso.
    if (!back && uy > -9.6 && uy < -9.1 && ux > -0.6 && ux < 1.6) return code(garment, t - 1);
    return code(garment, t);
  });
}

/** The mail cape over the shoulders, thickening the neck (the coif's skirt). */
function camail(c: Paper, m: Mat, back: boolean): void {
  shapeU(c, [[-1.15, -13.3], [1.25, -13.3], [1.9, -12.1], [2.55, -11.45], [1.4, -10.85], [0.2, -11.0], [-1.1, -10.9], [-2.55, -11.35], [-1.85, -12.1]], [0, -12], (x, y, ux, uy) => {
    const t = ux < -0.9 ? 3 : ux > 1.2 ? 1 : 2;
    // A dagged lower edge: the rings end in a scalloped hem.
    if (uy > 0.75 + 0.18 * Math.sin(ux * 5)) return -1;
    const r = mailTex(c, x, y, t > 2 ? -1 : t < 2 ? 1 : 0, t, m);
    return r >= 0 ? r : code(m, t);
  });
  void back;
}

/**
 * The pilgrim's hood cape: cloth over the shoulders with a dagged hem, two folds, and the lead
 * scallop badge of Santiago pinned at the chest.
 */
function hoodCape(c: Paper, m: Mat, shadeFrom = 1.6): void {
  shapeU(c, [[-1.2, -13.2], [1.3, -13.2], [2.0, -12.0], [2.75, -11.2], [2.4, -10.3], [1.0, -9.9], [-0.4, -10.2], [-1.7, -9.95], [-2.75, -10.6], [-2.4, -12.2]], [0, -11.5], (_x, _y, ux, uy) => {
    if (uy > 1.2 + 0.2 * Math.sin(ux * 6)) return -1;
    if (Math.hypot(ux - 0.7, uy - 0.6) < 0.38) return code(TM.white, Math.hypot(ux - 0.6, uy - 0.5) < 0.18 ? 4 : 2); // the scallop
    const fx = ux - uy * 0.3;
    if (Math.abs(fx + 0.9) < 0.13 || Math.abs(fx - 1.6) < 0.13) return code(m, 1);
    if (Math.abs(fx + 1.15) < 0.12 || Math.abs(fx - 1.35) < 0.12) return code(m, 3);
    return code(m, ux < -1.2 ? 3 : ux > shadeFrom ? 1 : 2);
  });
}

/** A face, front three-quarter: brow shadow, eye, nose, cheek, moustache and beard. */
function faceS(c: Paper, o: P2, beard: boolean): void {
  // Pixel coordinates in the face (from its centre, 8 px per unit at level 8): the features are
  // placed by hand, the way a pixel artist builds a 12 px face.
  const ox = c.sx(T(o)[0]), oy = c.sy(T(o)[1]);
  blob(c, o, 0.78, 0.92, TM.flesh, {
    detail: (x, y, nx, ny) => {
      const px = x + 0.5 - ox, py = y + 0.5 - oy;
      const s = c.L / 8;
      // Brow ridge: a lit bar with the eye socket's shadow under it.
      if (py > -3.5 * s && py < -2.2 * s && px > -2 * s) return code(TM.flesh, 4);
      if (py >= -2.2 * s && py < -0.9 * s && px > -0.5 * s && px < 3.2 * s) return px > 0.8 * s && px < 2.4 * s ? code(TM.ink, 3) : code(TM.flesh, 1);
      // The nose: a lit ridge down from the brow, its tip, and the shadow it throws.
      if (px > 3.0 * s && px < 4.6 * s && py > -1.5 * s && py < 1.4 * s) return code(TM.flesh, py > 0.2 * s ? 1 : 2);
      if (px > 1.8 * s && px < 3.0 * s && py > 0.5 * s && py < 1.6 * s) return code(TM.flesh, 1);
      // Cheekbone catching the light; the far cheek turning away.
      if (px < -0.5 * s && px > -4 * s && py > -0.8 * s && py < 0.8 * s) return code(TM.flesh, 3);
      if (nx < -0.75) return code(TM.flesh, 1);
      if (beard) {
        // Moustache and beard: dark strands with lighter tips, the chin pushed forward.
        if (py > 1.6 * s && py < 2.6 * s && px > -0.5 * s && px < 4 * s) return code(TM.hair, (c.lx(x) & 1) === 0 ? 1 : 2);
        if (py >= 2.6 * s) return code(TM.hair, (c.lx(x) + (c.ly(y) >> 1)) % 3 === 0 ? 1 : 2);
      }
      return ny > 0.6 ? code(TM.flesh, 1) : -1;
    },
  });
}

/** Helms with mass. */
function helmS(c: Paper, h: SHelm, o: P2, back: boolean, beard: boolean, coif: Mat | null): void {
  if (h === 'great' || h === 'gilded') {
    const gild = h === 'gilded';
    // A tall flat-topped barrel, wider than the head (DHM Topfhelm): 2.5 wide, 2.9 tall.
    shapeU(c, [[-1.15, -1.6], [1.15, -1.6], [1.3, -1.25], [1.35, 0.35], [1.25, 1.35], [-1.25, 1.35], [-1.35, 0.35], [-1.3, -1.25]].map((p) => addP(o, p as P2)), o, (x, y, ux, uy) => {
      const lit = ux < -0.55 ? 1 : ux > 0.75 ? -1 : 0;
      const T = (q: number) => code(TM.steel, Math.max(0, Math.min(4, q)));
      if (uy < -1.4) return gild ? code(TM.gold, 3) : T(3);
      if (uy < -1.2) return T(2 + lit);
      if (!back) {
        const barX = 0.25;
        if (within(c, uy + 0.25, 0.12) && ux > -0.8 && ux < 1.25 && !within(c, ux - barX, 0.14)) return code(TM.ink, 0);
        if (within(c, ux - barX, 0.17) && uy > -1.2 && uy < 1.25) return gild ? code(TM.gold, lit > 0 ? 4 : 3) : T(3 + lit);
        if (within(c, uy + 0.62, 0.14) && ux > -1.2) return gild ? code(TM.gold, 3) : T(3 + lit);
        if (ux > 0.55 && ux < 1.15 && uy > 0.2 && uy < 1.0 && c.lx(x) % 3 === 0 && c.ly(y) % 3 === 1) return code(TM.ink, 1);
        if (gild && uy > 1.1) return code(TM.gold, 2);
      } else if (within(c, ux + 0.2, 0.08)) return T(1);
      // Rivets along the lower rim; a dent; scratches.
      if (uy > 1.05 && c.lx(x) % 5 === 0) return T(4);
      if (c.tex(x, y, 61, 3) < 0.05) return T(1 + lit);
      if (ux < -0.75 && uy > -1.0 && uy < 0.6) return T(4);
      return T(2 + lit);
    });
    return;
  }
  if (h === 'hood' && coif) {
    // A cloth hood drawn up over the head, its peak (the liripipe) falling behind, the face in
    // the opening; a fold runs from the crown to the cheek.
    vol(c, addP(o, [-0.6, -1.0]), addP(o, [-1.9, 0.6]), [[0, 0.42], [1, 0.16]], coif, { tone: 1 });
    blob(c, addP(o, [-0.1, -0.05]), 1.3, 1.4, coif, {
      detail: (_x, _y, nx, ny) => {
        if (Math.abs(nx + 0.35 - ny * 0.25) < 0.08 && ny > -0.6) return code(coif, 1);
        return code(coif, nx < -0.35 || ny < -0.6 ? 3 : nx > 0.55 ? 1 : 2);
      },
    });
  } else if (coif) {
    // The coif: a mail hood round the face, thick at the cheeks and throat.
    blob(c, addP(o, [-0.05, 0.1]), 1.2, 1.3, coif, { detail: (x, y, nx) => mailTex(c, x, y, nx < -0.3 ? -1 : nx > 0.4 ? 1 : 0, nx < -0.4 ? 3 : nx > 0.5 ? 1 : 2, coif) });
  } else blob(c, addP(o, [-0.15, -0.1]), 0.95, 1.0, TM.hair, { tone: 2 });
  if (!back) faceS(c, addP(o, [0.38, 0.25]), beard);
  if (h === 'kettle' || h === 'pilgrim') {
    const pil = h === 'pilgrim';
    const m = pil ? TM.wool : TM.steel;
    blob(c, addP(o, [0.05, -0.85]), 1.0, 0.72, m, { shine: !pil });
    // A wide brim, dished: the upper face lit, the underside in shadow, chewed and dented.
    shapeU(c, [[-1.9, -0.55], [-1.0, -0.85], [1.15, -0.85], [2.05, -0.5], [1.9, -0.25], [-1.75, -0.3]].map((p) => addP(o, p as P2)), o, (x, _y, ux, uy) => {
      if (uy < -0.62) return code(m, ux < 0 ? 4 : 3);
      if (!pil && hash(c.lx(x) >> 1, 1, 3) < 0.1) return code(TM.leather, 1);
      return code(m, uy > -0.38 ? 1 : 2);
    });
    if (pil && !back) blob(c, addP(o, [0.65, -0.75]), 0.28, 0.25, TM.white, { tone: 3 });
    return;
  }
  if (h === 'nasal') {
    shapeU(c, [[-1.1, -0.3], [-0.75, -1.15], [0, -1.8], [0.75, -1.15], [1.1, -0.3]].map((p) => addP(o, p as P2)), o, (_x, _y, ux, uy) =>
      code(TM.steel, uy > -0.45 ? 1 : ux < -0.3 ? 4 : ux > 0.45 ? 2 : 3));
    if (!back) vol(c, addP(o, [0.55, -0.45]), addP(o, [0.62, 0.5]), [[0, 0.14], [1, 0.12]], TM.steel, { tone: 3 });
    return;
  }
  if (h === 'turban') {
    vol(c, addP(o, [0, -1.3]), addP(o, [0.05, -2.2]), [[0, 0.22], [1, 0.06]], TM.steel, { tone: 3 });
    blob(c, addP(o, [0, -0.65]), 1.25, 0.85, TM.white, { detail: (x, y, nx, ny) => ((c.ly(y) + (c.lx(x) >> 2)) % 4 === 0 ? code(TM.white, nx < 0 ? 2 : 1) : ny > 0.6 ? code(TM.white, 1) : -1) });
    return;
  }
  if (h === 'hood') return;
  // cap (at level 1 its crown is the top of the dark mass, where the light falls)
  blob(c, addP(o, [-0.05, -0.65]), 1.05, 0.68, TM.wool, { tone: c.L < 2 ? 4 : 2 });
}

/** A big kite shield held tight against the body (team field or the Temple's arms). */
function kiteS(c: Paper, ctr: P2, w: number, h: number, back: boolean, temple: boolean, deg = -4): void {
  const F = frameAt(ctr, deg);
  const top = -h * 0.38, bot = h * 0.62;
  const outline: P2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    outline.push([-Math.cos(a) * w * 0.5, top - Math.sin(a) * h * 0.05]);
  }
  outline.push([w * 0.47, top + h * 0.3], [w * 0.3, top + h * 0.62], [0, bot], [-w * 0.3, top + h * 0.62], [-w * 0.47, top + h * 0.3]);
  // The order above runs right to left along the top; flip to one winding.
  const pts = outline.map(([x, y]) => at(F, x, y));
  c.shape(pts, (x, y) => {
    const [lx, ly] = local(c, F, x, y);
    // Half width at this height (the kite narrows below its shoulder).
    const yt = ly - top;
    const half = yt < h * 0.3 ? w * 0.48 : yt < h * 0.62 ? w * (0.48 - ((yt - h * 0.3) / (h * 0.32)) * 0.18) : w * 0.3 * (1 - (yt - h * 0.62) / (bot - top - h * 0.62));
    const edge = half - Math.abs(lx);
    const u = lx / (w * 0.5);
    // At level 1 the shield is four pixels across: rim and cross would eat it, so it is the
    // field (team colour, or the Temple's white under a black chief) lit from the left.
    if (c.L < 2) {
      if (back) return code(TM.wood, u < 0 ? 2 : 1);
      if (temple) return ly < top + h * 0.22 ? code(TM.black, 2) : code(TM.white, u < -0.2 ? 3 : 2);
      return code(TM.team, u < -0.3 ? 3 : u > 0.4 ? 1 : 2);
    }
    if (edge < 0.32 || ly < top + 0.25) return code(TM.steel, edge < 0.14 ? 1 : u < -0.3 ? 4 : u > 0.5 ? 1 : 2);
    if (back) {
      if (Math.abs(ly + 0.6) < 0.25 || Math.abs(ly - 1.2) < 0.25) return code(TM.leather, 2);
      return code(TM.wood, Math.abs(((lx + 5) * 1.2) % 1 - 0.5) > 0.44 ? 1 : u < 0 ? 3 : 2);
    }
    // The face is curved: lit on the left, a soft core shadow right of centre, reflected light
    // at the far edge.
    const t = u < -0.45 ? 3 : u > 0.35 && u < 0.8 ? 1 : 2;
    // Boss and rivets.
    if (Math.hypot(lx - 0.0, ly - (top + h * 0.33)) < 0.42) return code(TM.steel, lx < 0 && ly < top + h * 0.33 ? 4 : 2);
    if (edge < 0.55 && (c.ly(y) + c.lx(x)) % 9 === 0) return code(TM.steel, 3);
    if (temple) {
      if (ly < top + h * 0.22) return code(TM.black, t);
      return code(TM.white, t + (c.tex(x, y, 71, 3) < 0.06 ? -1 : 0));
    }
    if ((within(c, lx, 0.36) && ly > top + 0.3) || (within(c, ly - (top + h * 0.33), 0.34) && Math.abs(lx) < half - 0.3)) return code(TM.white, t);
    // Scuffs and chipped paint showing the wood.
    if (c.tex(x, y, 73, 3) < 0.05) return code(TM.wood, 2);
    return code(TM.team, t);
  });
}

/** A round shield, big, held tight: team field quartered, a rim (iron, or dark rawhide), a boss. */
function roundS(c: Paper, ctr: P2, r: number, rim: Mat = TM.steel): void {
  blob(c, ctr, r * 0.86, r, TM.team, {
    detail: (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.88) return rim === TM.steel ? code(TM.steel, nx + ny < -0.4 ? 4 : nx + ny > 0.6 ? 1 : 2) : code(rim, nx + ny < -0.4 ? 2 : 1);
      if (d < 0.22) return code(TM.steel, nx + ny < -0.1 ? 4 : 2);
      if (d < 0.3) return code(TM.steel, 1);
      if (c.tex(x, y, 79, 3) < 0.05) return code(TM.wood, 2);
      const t = nx < -0.45 ? 3 : nx > 0.4 ? 1 : 2;
      return nx * ny > 0 ? code(TM.teamDk, t) : code(TM.team, t);
    },
  });
}

/** A held item: drawn from the fist (figure units) turned by `turn` degrees from its key-art angle. */
export type SItem = (c: Paper, hand: P2, turn: number) => void;
/** The parts of a foot figure that are not the man himself. */
export interface SGear {
  /** Behind the whole figure (a pavise on the back, a quiver, javelins in the shield hand). */
  behind?: (c: Paper) => void;
  /** Between the body and the near arm (a shield held close covers the torso). */
  front?: (c: Paper) => void;
  /** In the near hand (and the near arm's pose: elbow and wrist). */
  near?: { el: P2; wr: P2; draw?: SItem };
  /** The far arm's pose when it shows (no shield). */
  far?: { el: P2; wr: P2; draw?: SItem };
  /** Last, over everything. */
  last?: (c: Paper) => void;
}

/**
 * The brothers' white mantle, heavy, hanging from both shoulders behind the body to the ankles,
 * wider than the man: deep vertical folds with lit ridges, the red cross on the far shoulder.
 */
function cloakS(c: Paper, hemY = -0.55, sweep = 0, back = false): void {
  const pts = smooth([[-2.9, -12.1], [0.2, -12.5], [3.0, -12.0], [3.6, -9.5], [4.1, -5.0], [4.5 + sweep, hemY - 0.2], [2.0, hemY + 0.15], [-0.8, hemY], [-3.6 + sweep, hemY + 0.2], [-4.1 + sweep * 0.5, -4.5], [-3.6, -9.6]], 3);
  shapeU(c, pts, [0, 0], (x, y, ux, uy) => {
    // The cross on the far shoulder, where the mantle turns toward the light.
    if (!back && ((within(c, ux - 3.15, 0.3) && Math.abs(uy + 10.4) < 0.95) || (within(c, uy + 10.55, 0.28) && Math.abs(ux - 3.15) < 0.6))) return code(TM.red, 2);
    // Folds: wide, deep, swinging out toward the hem; lit ridge then shadowed trough.
    const spread = (uy + 12.3) / 12;
    const f = (((ux / (1 + spread * 0.35)) + 8) * 0.62) % 1;
    let t = ux < -2.6 + spread ? 3 : ux > 3.0 + spread * 0.6 ? 1 : 2;
    if (f < 0.16) t -= 1;
    else if (f < 0.3) t += 1;
    if (uy > hemY - 0.9 && c.tex(x, y, 57, 3) < 0.45) t -= 1;
    // The heavy cloth turns away from the eye at its sides and hem: a shade band along the
    // silhouette, so the mantle's outline is dark all round (it never averages out to the grass).
    const left = -2.9 - spread * 1.3, right = 3.0 + spread * 1.6;
    // (Not at level 2, where it is a 1 px band hugging the outline all round.)
    if (c.L >= 4 && (ux - left < 0.5 || right - ux < 0.5 || uy > hemY - 0.45)) t = 1;
    return code(TM.white, Math.max(1, Math.min(4, t)));
  });
}

/** A fur collar over the mantle's shoulders: tufted grey-white strands. */
function furS(c: Paper): void {
  shapeU(c, smooth([[-2.7, -12.4], [-1.0, -13.2], [1.2, -13.25], [2.9, -12.4], [2.4, -11.4], [0.8, -11.8], [-0.9, -11.75], [-2.4, -11.3]], 3), [0, -12.3], (x, y, ux, uy) => {
    const strand = (c.lx(x) + (c.ly(y) >> 1) * 2) % 4;
    let t = ux < -1.3 ? 4 : ux > 1.6 ? 2 : 3;
    if (strand === 0) t -= 1;
    if (uy > 0.55 && c.tex(x, y, 77, 2) < 0.5) return -1; // ragged lower edge
    return code(KM.fur, t);
  });
}

/** Layered pauldron: three overlapping steel lames over the shoulder, bright on the lit edges. */
function pauldronS(c: Paper, sh: P2, far: boolean): void {
  for (let i = 2; i >= 0; i--) {
    const o = addP(sh, [0, -0.35 + i * 0.55]);
    blob(c, o, 1.15 - i * 0.08, 0.55, TM.steel, {
      tone: far ? 1 : 2,
      detail: (_x, _y, nx, ny) => {
        if (ny < -0.45 && nx < 0.3) return code(TM.steel, far ? 3 : 4); // lit rolled edge
        if (ny > 0.55) return code(TM.steel, 0); // the lame's lower edge, in shadow
        if (Math.abs(nx + 0.55) < 0.14 && Math.abs(ny) < 0.2) return code(TM.steel, 4); // rivet
        return -1;
      },
    });
  }
}

/** The key-art joints of a foot kind (SE, units). */
export interface ManRest {
  hipN: P2; hipF: P2; kneeN: P2; kneeF: P2; ankN: P2; ankF: P2;
  shN: P2; shF: P2; elN: P2; wrN: P2; elF: P2; wrF: P2;
  neck: P2; head: P2;
}
/** The far arm's pose when the key art hides it (behind a shield held across the body). */
const FAR_HIDDEN = { el: [2.55, -9.0] as P2, wr: [1.7, -8.25] as P2 };
const NEAR_DEFAULT = { el: [-2.65, -8.5] as P2, wr: [-2.3, -6.3] as P2 };
export function manRest(k: SKit, g: SGear): ManRest {
  const wide = k.wide ?? false;
  const ne = g.near ?? NEAR_DEFAULT, fa = g.far ?? FAR_HIDDEN;
  return {
    hipN: J.hipN, hipF: J.hipF,
    kneeN: wide ? [-1.6, -3.5] : J.kneeN, kneeF: wide ? [1.75, -3.7] : J.kneeF,
    ankN: wide ? [-2.2, -0.5] : J.ankN, ankF: wide ? [2.55, -0.6] : J.ankF,
    shN: J.shN, shF: J.shF, elN: ne.el, wrN: ne.wr, elF: fa.el, wrF: fa.wr,
    neck: J.neck, head: J.head,
  };
}

/** The pieces of a man, each drawn on its own (a rig part rides one bone). */
export type ManPiece =
  | 'cloak' | 'behind' | 'thighF' | 'shinF' | 'footF' | 'thighN' | 'shinN' | 'footN'
  | 'upperArmF' | 'forearmF' | 'handF' | 'farItem' | 'torso' | 'fur' | 'camail' | 'hood' | 'pouch'
  | 'head' | 'front' | 'upperArmN' | 'forearmN' | 'handN' | 'pauldron' | 'weapon' | 'last';
/** The key art's drawing order (SE). */
export const MAN_PIECES: readonly ManPiece[] = [
  'cloak', 'behind', 'thighF', 'shinF', 'footF', 'thighN', 'shinN', 'footN', 'upperArmF', 'forearmF', 'handF', 'farItem',
  'torso', 'fur', 'camail', 'hood', 'pouch', 'head', 'front', 'upperArmN', 'forearmN', 'handN', 'pauldron', 'weapon', 'last',
];

/**
 * Draws one piece of a man in key-art coordinates (through the current part map). `rig`: the
 * animated figure, which also draws the far arm the key art hides behind the shield; `back`: the
 * NE view (the back of the torso, helm and shield).
 */
export function manPiece(c: Paper, k: SKit, g: SGear, p: ManPiece, R: ManRest, o: { rig?: boolean; back?: boolean } = {}): void {
  const back = o.back ?? false;
  const farArm = !!g.far || !!o.rig;
  const held = (it: { el: P2; wr: P2; draw?: SItem } | undefined, el: P2, wr: P2) => {
    if (!it?.draw) return;
    const h = T(handAt(el, wr)), turn = XF ? XF.deg : 0;
    withMap(null, () => it.draw!(c, h, turn));
  };
  switch (p) {
    case 'cloak': if (k.cloak) cloakS(c, -0.55, 0, back); return;
    case 'behind': g.behind?.(c); return;
    case 'thighF': thighS(c, R.hipF, R.kneeF, k, true); return;
    case 'shinF': shinS(c, R.kneeF, R.ankF, k, true); return;
    case 'footF': footS(c, R.ankF, k, true); return;
    case 'thighN': thighS(c, R.hipN, R.kneeN, k, false); return;
    case 'shinN': shinS(c, R.kneeN, R.ankN, k, false); return;
    case 'footN': footS(c, R.ankN, k, false); return;
    case 'upperArmF': if (farArm) upperArmS(c, R.shF, R.elF, k, true); return;
    case 'forearmF': if (farArm) forearmS(c, R.elF, R.wrF, k, true); return;
    case 'handF': if (farArm) handS(c, R.elF, R.wrF, k, true); return;
    case 'farItem': held(g.far, R.elF, R.wrF); return;
    case 'torso': torsoS(c, k, back); return;
    case 'fur': if (k.cloak) furS(c); return;
    case 'camail': if (k.camail) camail(c, k.camail, back); return;
    case 'hood': if (k.hood) hoodCape(c, k.hood, k.shadeFrom === undefined ? 1.6 : k.shadeFrom + 0.2); return;
    case 'pouch': if (k.pouch) vol(c, [-1.45, -8.0], [-1.6, -6.85], [[0, 0.32], [0.6, 0.5], [1, 0.42]], TM.leather, { tone: 2, detail: (_x, _y, _u, v) => (v < 0.18 ? code(TM.leather, 3) : -1) }); return;
    case 'head': helmS(c, k.helm, R.head, back, k.beard ?? true, k.hood ?? k.camail ?? (isMailS(k.body) ? k.body : null)); return;
    case 'front': g.front?.(c); return;
    case 'upperArmN': upperArmS(c, R.shN, R.elN, k, false); return;
    case 'forearmN': forearmS(c, R.elN, R.wrN, k, false); return;
    case 'handN': handS(c, R.elN, R.wrN, k, false); return;
    case 'pauldron': if (k.pauldrons) pauldronS(c, addP(R.shN, [-0.1, 0.1]), false); return;
    case 'weapon': held(g.near, R.elN, R.wrN); return;
    case 'last': g.last?.(c); return;
  }
}

function manS(c: Paper, k: SKit, g: SGear): void {
  const R = manRest(k, g);
  for (const p of MAN_PIECES) manPiece(c, k, g, p, R);
}

// ------------------------------------------------------------------ more gear

/** A pavise slung high on the back: its painted top stands over the hat. */
function paviseS(c: Paper, ctr: P2, w: number, h: number, deg: number): void {
  const F = frameAt(ctr, deg);
  c.shape([at(F, -w / 2, -h / 2), at(F, w / 2, -h / 2 - 0.1), at(F, w / 2 - 0.05, h / 2), at(F, -w / 2 + 0.05, h / 2 + 0.1)], (x, y) => {
    const [lx, ly] = local(c, F, x, y);
    const ex = w / 2 - Math.abs(lx), ey = h / 2 - Math.abs(ly);
    const u = lx / (w / 2);
    // The rim, one band lit on the left (the figure's outline closes it: a darker line inside it
    // too would be a second outline, hugging the first).
    if (ex < 0.3 || ey < 0.3) return code(TM.white, u < 0 ? 3 : 2);
    if (within(c, lx + 0.1, 0.14)) return code(TM.team, 3); // the keel
    if ((within(c, lx + 0.1, 0.38) && Math.abs(ly + 0.2) < h * 0.32) || (within(c, ly + h * 0.12, 0.36) && Math.abs(lx + 0.1) < w * 0.3)) return code(TM.white, u < 0 ? 3 : 2);
    if (c.tex(x, y, 83, 3) < 0.05) return code(TM.wood, 2);
    return code(TM.team, u < -0.1 ? 2 : 1);
  });
}

/** A fan of spare javelins in the shield hand. */
function javelinsS(c: Paper, hand: P2, turn = 0): void {
  for (const d of [-10, 0, 10]) spear(c, addP(hand, [d * 0.01, 0]), 180 + d + turn, 7.6, 1.8, { head: 1.1, w: 0.28, wood: c.L < 2 ? TM.ink : TM.gambeson });
}

/** The Iron Brethren's ailettes: square boards on the shoulders in the army colour. */
function ailetteS(c: Paper, at0: P2, deg: number): void {
  const F = frameAt(at0, deg);
  c.shape([at(F, -0.8, -1.2), at(F, 0.8, -1.2), at(F, 0.8, 0.4), at(F, -0.8, 0.4)], (x, y) => {
    const [lx, ly] = local(c, F, x, y);
    if (Math.abs(lx) > 0.62 || ly < -1.02 || ly > 0.22) return code(TM.steel, lx < 0 ? 3 : 2);
    if (within(c, lx, 0.14) || within(c, ly + 0.4, 0.13)) return code(TM.white, 3);
    return code(TM.team, lx < 0 ? 3 : 2);
  });
}

/** A Dane axe with a long haft and a broad crescent bit. */
function daneAxeS(c: Paper, grip: P2, deg: number): void {
  const d = mul([Math.sin(deg * DEG), Math.cos(deg * DEG)], 1);
  const top = addP(grip, mul(d, 6.4)), butt = sub(grip, mul(d, 3.0));
  vol(c, butt, top, [[0, 0.2], [1, 0.18]], TM.ash, { tone: 2 });
  if (c.L < 2) lineK(c, butt, top, code(TM.ash, 2));
  const out: P2 = [d[1] * -1, d[0]]; // forward of the haft (perpendicular)
  const fwd: P2 = out[0] > 0 ? out : mul(out, -1);
  const a = sub(top, mul(d, 0.3)), b = sub(top, mul(d, 1.8));
  const e0 = addP(addP(top, mul(d, 0.6)), mul(fwd, 1.9));
  const e1 = addP(sub(top, mul(d, 2.6)), mul(fwd, 1.75));
  const mid = addP(lerp(a, b, 0.5), mul(fwd, 0.8));
  c.shape([a, e0, addP(lerp(e0, e1, 0.5), mul(fwd, 0.35)), e1, b, mid], (x, y) => {
    const q = local(c, frameAt(lerp(a, b, 0.5), 0), x, y);
    const dist = q[0] * fwd[0] + q[1] * fwd[1];
    if (dist > 1.45) return code(TM.steel, 4);
    if (dist < 0.7 && c.tex(x, y, 91, 2) < 0.2) return code(TM.leather, 1);
    return code(TM.steel, dist > 0.9 ? 3 : 2);
  });
}

// ------------------------------------------------------------------ the kinds (foot)

const SERGEANT: SKit = { helm: 'kettle', body: TM.mailDk, coat: TM.black, cross: true, camail: TM.mailDk, sleeve: TM.mailDk, hand: TM.leather, legs: TM.mailDk, boots: TM.leather, coveredCross: true };
// The four foot kinds told apart by kit and colour: the sergeant's black surcoat over mail; the
// levy's undyed ochre gambeson; the javelin men's short madder tunics, unarmoured; the pilgrims'
// slate hoods with the scallop and short tunics.
const LEVY: SKit = { helm: 'nasal', body: KM.ochre, coat: null, quilted: true, camail: null, sleeve: KM.ochre, hand: TM.flesh, legs: TM.wool, boots: TM.leather, shadeFrom: 0.0 };
const JAVELIN: SKit = { helm: 'cap', body: KM.madder, coat: null, short: true, pouch: true, camail: null, sleeve: KM.madder, hand: TM.flesh, legs: KM.wraps, boots: TM.leather, belt: TM.team };
const ARCHER: SKit = { helm: 'hood', hood: KM.slate, body: KM.slate, coat: null, short: true, camail: null, sleeve: KM.slate, hand: TM.flesh, legs: TM.wool, boots: TM.leather, shadeFrom: 0.45 };
const XBOW: SKit = { helm: 'kettle', body: TM.wool, coat: null, quilted: true, camail: TM.mailDk, sleeve: TM.wool, hand: TM.leather, legs: TM.wool, boots: TM.leather, belt: TM.team };
// The Iron Brethren as the painted Templar: a black tabard with the long red cross over silver mail
// and layered pauldrons, the heavy white mantle with a fur collar, steel gauntlets, a wide stance.
const BRETHREN: SKit = { helm: 'great', body: KM.silver, coat: KM.sable, cross: true, longCross: true, cloak: true, pauldrons: true, wide: true, camail: KM.silver, sleeve: KM.silver, hand: TM.steel, legs: KM.silver, boots: KM.silver };

export const FOOT: Record<number, { kit: SKit; gear: SGear; dark: boolean }> = {
  0: {
    kit: SERGEANT,
    dark: true,
    gear: {
      // The kite covers the torso from the shoulder to the knee, its inner edge on the centre line.
      front: (c) => kiteS(c, [1.75, -8.1], 4.3, 6.8, false, false),
      // The sword hangs point-down at his side, clear of the shield (the D2R Paladin's stance).
      near: { el: [-3.05, -8.75], wr: [-3.1, -6.5], draw: (c, h, d) => sword(c, h, 8 + d, 5.4) },
    },
  },
  1: {
    kit: LEVY,
    dark: true,
    gear: {
      // A big round shield held close; the spear grounded, half again his height.
      front: (c) => roundS(c, [1.85, -8.6], 2.75, TM.leather),
      near: { el: [-2.95, -8.9], wr: [-2.5, -7.0], draw: (c, h, d) => void spear(c, h, 180 + d, 12.5, 6.4, { head: 1.9, w: 0.34, tone: c.L >= 4 ? 1 : 2 }) }, // a dark haft beside the pale gambeson
    },
  },
  2: {
    kit: JAVELIN,
    dark: true,
    gear: {
      far: { el: [2.85, -8.9], wr: [3.35, -7.4], draw: (c, h, d) => { javelinsS(c, h, d); roundS(c, addP(h, [0.55, 0.1]), c.L < 2 ? 1.9 : 1.35); } },
      near: { el: [-2.95, -9.0], wr: [-2.2, -7.2], draw: (c, h, d) => void spear(c, h, 120 + d, 5.6, 2.4, { head: 1.15, w: 0.3, wood: c.L < 2 ? TM.ink : TM.gambeson }) },
    },
  },
  3: {
    kit: ARCHER,
    dark: true,
    gear: {
      // The quiver hangs at the near hip, in front, its fletchings standing above the belt.
      front: (c) => { vol(c, [-1.5, -8.1], [-1.0, -5.3], [[0, 0.5], [1, 0.42]], TM.leather, { tone: 2, detail: (_x, _y, _u, v) => (Math.abs(v - 0.2) < 0.04 ? code(TM.leather, 1) : -1) }); for (const k of [-0.3, 0, 0.3]) vol(c, [-1.5 + k, -8.0], [-1.7 + k * 1.4, -9.0], [[0, 0.16], [1, 0.22]], TM.white, { tone: 3 }); },
      far: { el: [2.8, -8.8], wr: [3.2, -7.0], draw: (c, h, d) => bow(c, c.L < 2 ? addP(h, [1.2, -0.5]) : h, 174 + d, c.L < 2 ? 17 : 13.4, 0, null) },
      near: { el: [-2.95, -8.8], wr: [-2.7, -6.6] },
    },
  },
  4: {
    kit: XBOW,
    dark: true,
    gear: {
      behind: (c) => paviseS(c, [-1.25, -12.0], 4.3, 8.0, -6),
      near: { el: [-2.7, -8.7], wr: [-1.0, -7.7], draw: (c, h, d) => crossbow(c, h, 118 + d, 1) },
    },
  },
  8: {
    kit: BRETHREN,
    dark: false,
    gear: {
      // The Dane axe held at the port, its great bit high and forward of the helm.
      // The Dane axe held low across the body in guard, the bit forward at the shoulder.
      near: { el: [-2.5, -8.6], wr: [-0.9, -7.4], draw: (c, h, d) => daneAxeS(c, h, 135 + d) },
    },
  },
};

// ------------------------------------------------------------------ the horse

export interface SHorse {
  coat: Mat;
  capar?: Mat | null;
  cloth?: boolean;
  /** Raise the caparison's hem by this much (units), showing more of the legs. */
  caparUp?: number;
}

/** A closed Catmull-Rom curve through control points, sampled: organic outlines from a few points. */
function smooth(ctrl: P2[], per = 5): P2[] {
  const n = ctrl.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n]!, p1 = ctrl[i]!, p2 = ctrl[(i + 1) % n]!, p3 = ctrl[(i + 2) % n]!;
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** A shading mass: an ellipse whose surface normal lights a region (units). */
interface Mass {
  o: P2;
  r: P2;
}
/**
 * Form light at a point from the nearest mass: the key light from the upper left and a little
 * toward the viewer; four bands (deep, shade, body, lit) and a crisp highlight on the crown.
 */
function formTone(ux: number, uy: number, masses: Mass[]): number {
  let best = Infinity, nx = 0, ny = 0;
  for (const m of masses) {
    const dx = (ux - m.o[0]) / m.r[0], dy = (uy - m.o[1]) / m.r[1];
    const d = Math.hypot(dx, dy);
    if (d < best) [best, nx, ny] = [d, dx, dy];
  }
  const l = Math.min(1, Math.hypot(nx, ny));
  const nz = Math.sqrt(Math.max(0, 1 - l * l));
  // Light direction (normalised): left, up, toward the viewer.
  const lam = -0.55 * nx - 0.62 * ny + 0.56 * nz;
  return lam > 0.86 ? 4 : lam > 0.55 ? 3 : lam > 0.18 ? 2 : lam > -0.2 ? 1 : 0;
}

/**
 * A heavy horse in three-quarter profile, head to screen right, built from curves: a rounded
 * barrel, a deep chest and a muscled shoulder, a round croup over the haunch, an arched neck, a
 * long head; tapering legs with the knee, the hock, the fetlock and a broad hoof; a mane and tail
 * of strands. Muybridge for the legs, the Maciejowski horses and Medieval II for the mass.
 */
/** The key art's horse joints (horse units, before HORSE_SCALE): leg tops, knees or hocks, fetlocks. */
export const HJ = {
  foreF: [[4.3, -6.6], [4.85, -3.3], [4.75, -1.25]] as [P2, P2, P2],
  hindF: [[-3.6, -7.0], [-4.3, -3.5], [-4.1, -1.25]] as [P2, P2, P2],
  foreN: [[3.9, -6.2], [4.3, -3.2], [4.15, -1.2]] as [P2, P2, P2],
  hindN: [[-4.4, -6.6], [-5.25, -3.3], [-4.95, -1.2]] as [P2, P2, P2],
  poll: [7.2, -14.9] as P2,
  /** The head's own axis (frameAt degrees, clockwise from screen right). */
  headDeg: 52,
};
/** The hoof's tip below a fetlock. */
export const hoofAt = (fet: P2): P2 => addP(fet, [0.3, 0.85]);

/** A piece of the horse, each drawn on its own (a rig part rides one bone). */
export type HorsePiece =
  | 'foreFU' | 'foreFL' | 'foreFH' | 'hindFU' | 'hindFL' | 'hindFH'
  | 'tail' | 'barrel' | 'foreNU' | 'foreNL' | 'foreNH' | 'hindNU' | 'hindNL' | 'hindNH'
  | 'neck' | 'mane' | 'head' | 'capar' | 'cloth' | 'saddle' | 'girth';
export const HORSE_FAR: readonly HorsePiece[] = ['foreFU', 'foreFL', 'foreFH', 'hindFU', 'hindFL', 'hindFH'];
export const HORSE_BODY: readonly HorsePiece[] = ['tail', 'barrel', 'foreNU', 'foreNL', 'foreNH', 'hindNU', 'hindNL', 'hindNH', 'neck', 'mane', 'head', 'capar', 'cloth', 'saddle', 'girth'];

const HORSE_MASSES: Mass[] = [
  { o: [0.2, -7.6], r: [4.6, 2.75] }, // barrel
  { o: [-3.6, -8.0], r: [3.0, 2.9] }, // haunch
  { o: [4.0, -7.9], r: [1.95, 2.5] }, // shoulder and chest
];
/** The caparison's outline (horse units): over the croup and barrel to the knees, up the neck. */
export const CAPAR_PTS: P2[] = [
  [-7.1, -8.2], [-6.6, -10.1], [-4.6, -11.05], [-2.3, -10.65], [0.3, -10.45], [2.5, -11.0], [4.2, -12.4], [5.6, -14.0], [7.0, -15.0], [7.95, -14.4], [7.6, -12.4],
  [6.9, -10.3], [6.6, -7.6], [6.5, -4.4], [5.4, -4.05], [4.1, -4.45], [2.8, -4.05], [1.5, -4.45], [0.2, -4.05], [-1.1, -4.45], [-2.4, -4.05], [-3.7, -4.45], [-5.0, -4.05], [-6.2, -4.4], [-7.2, -4.2], [-7.4, -6.2],
];

/**
 * A heavy horse in three-quarter profile, head to screen right, built from curves: a rounded
 * barrel, a deep chest and a muscled shoulder, a round croup over the haunch, an arched neck, a
 * long head; tapering legs with the knee, the hock, the fetlock and a broad hoof; a mane and tail
 * of strands. Muybridge for the legs, the Maciejowski horses and Medieval II for the mass.
 * One piece of it (horse units; the caller scales by HORSE_SCALE). `back`: the NE view.
 */
export function horsePiece(c: Paper, k: SHorse, p: HorsePiece, back = false): void {
  const m = k.coat;
  const leg = (j: [P2, P2, P2], fore: boolean, far: boolean, seg: 'U' | 'L' | 'H') => {
    const t = far ? 1 : 2;
    const [top, mid, fet] = j;
    if (seg === 'U') {
      if (fore) {
        // Forearm: muscled at the top, tapering into the flat knee.
        vol(c, top, mid, [[0, 0.95], [0.3, 0.85], [0.8, 0.52], [1, 0.5]], m, { tone: t });
        blob(c, mid, 0.52, 0.48, m, { tone: t });
      } else {
        // Gaskin: the second thigh, thick behind, narrowing to the point of the hock.
        vol(c, top, mid, [[0, 1.2], [0.4, 0.95], [0.85, 0.55], [1, 0.5]], m, { tone: t });
        blob(c, addP(mid, [-0.2, -0.05]), 0.5, 0.45, m, { tone: t + 1 });
      }
    } else if (seg === 'L') {
      // Cannon: a flat bone.
      vol(c, mid, fet, fore ? [[0, 0.42], [0.5, 0.36], [1, 0.4]] : [[0, 0.46], [0.5, 0.38], [1, 0.4]], m, { tone: t - 1 });
    } else {
      // The fetlock knob, the pastern and the hoof.
      blob(c, fet, 0.48, 0.42, m, { tone: far ? 0 : 1 });
      const hoof = hoofAt(fet);
      vol(c, fet, hoof, [[0, 0.36], [1, 0.4]], m, { tone: far ? 0 : 1 });
      const pts: P2[] = [addP(hoof, [-0.5, -0.12]), addP(hoof, [0.55, -0.15]), addP(hoof, [0.75, 0.38]), addP(hoof, [-0.55, 0.38])];
      if (!XF) c.shape(pts, (_x, y) => code(TM.mane, y < c.sy(hoof[1] + 0.1) ? 2 : 1));
      else shapeK(c, pts, (_x, _y, _ux, uy) => code(TM.mane, uy < hoof[1] + 0.1 + 0.5 / c.L ? 2 : 1));
    }
  };
  switch (p) {
    case 'foreFU': case 'foreFL': case 'foreFH': return leg(HJ.foreF, true, true, p[5] as 'U');
    case 'hindFU': case 'hindFL': case 'hindFH': return leg(HJ.hindF, false, true, p[5] as 'U');
    case 'foreNU': case 'foreNL': case 'foreNH': return leg(HJ.foreN, true, false, p[5] as 'U');
    case 'hindNU': case 'hindNL': case 'hindNH': return leg(HJ.hindN, false, false, p[5] as 'U');
    case 'tail':
      // The tail: a switch of strands from the croup, swinging slightly, lighter at the tips' edges.
      for (let i = 0; i < 6; i++) {
        const a: P2 = [-6.1 + i * 0.07, -9.5 + i * 0.05];
        const b: P2 = [-6.9 - Math.sin(i * 1.7) * 0.45 + i * 0.12, -3.6 - (i % 3) * 0.35];
        vol(c, a, lerp(a, b, 0.5), [[0, 0.32], [1, 0.3]], TM.mane, { tone: i % 2 ? 1 : 2 });
        vol(c, lerp(a, b, 0.5), b, [[0, 0.3], [1, 0.08]], TM.mane, { tone: i % 3 === 0 ? 3 : i % 2 ? 1 : 2 });
      }
      return;
    case 'barrel': {
      // Body: barrel, chest, croup and quarters in one curved outline.
      const body = smooth([
        [2.6, -10.7], [0.4, -10.1], [-2.4, -10.3], [-4.5, -10.75], [-6.2, -9.7], [-6.55, -8.1], [-6.0, -6.6], [-4.8, -5.7],
        [-2.8, -5.15], [0.2, -4.75], [2.9, -5.05], [4.5, -5.8], [5.75, -6.9], [6.15, -8.3], [5.4, -9.6], [4.2, -10.5],
      ]);
      shapeU(c, body, [0, 0], (x, y, ux, uy) => {
        let t = formTone(ux, uy, HORSE_MASSES);
        // The grooves where the masses meet: behind the shoulder, in front of the stifle.
        if (Math.abs(ux - (2.2 - (uy + 8) * 0.25)) < 0.14 && uy > -9.6 && uy < -5.6 && t > 1) t -= 1;
        if (Math.abs(Math.hypot(ux + 4.3, uy + 8.3) - 2.3) < 0.13 && ux > -3.6 && uy > -9 && t > 1) t -= 1;
        // Ribs faintly over the barrel, and dapples of grime.
        if (Math.abs(((ux + 10) * 1.1) % 1 - 0.5) < 0.05 && ux > -1.6 && ux < 1.6 && uy > -7.6 && uy < -5.6 && t > 1) t -= 1;
        if (c.tex(x, y, 21, 4) < 0.035) t -= 1;
        return code(m, t);
      });
      return;
    }
    case 'neck': {
      // The neck: arched along the crest, deep at the base; lit along the crest, shade at the throat.
      const neck = smooth([[2.3, -10.4], [3.6, -12.0], [5.2, -13.9], [6.6, -15.0], [7.6, -15.1], [8.2, -13.9], [7.6, -12.1], [6.7, -10.1], [6.1, -8.3], [4.6, -8.2]], 4);
      shapeU(c, neck, [0, 0], (x, y, ux, uy) => {
        // A curved tube: the normal from the neck's mid-line (crest to throat).
        const along = (ux - 2.6) * 0.62 + (-uy - 10.2) * 0.78;
        const mid: P2 = [2.9 + along * 0.62, -10.8 - along * 0.78 + 0.0];
        const across = ((ux - mid[0]) * 0.78 + (uy - mid[1]) * 0.62) / 1.35;
        let t = across < -0.45 ? 3 : across > 0.75 ? 1 : 2;
        if (across < -0.75 && along > 1 && along < 5) t = 4;
        if (Math.abs(across - 0.35) < 0.08 && along > 0.5 && along < 5) t -= 1; // the jugular groove
        if (c.tex(x, y, 27, 4) < 0.035) t -= 1;
        return code(m, t);
      });
      return;
    }
    case 'mane':
      // The mane: strands falling from the crest onto the near side.
      for (let i = 0; i < 10; i++) {
        const k0 = i / 9;
        const root: P2 = [2.7 + k0 * 4.4 - k0 * k0 * 0.4, -10.7 - k0 * 4.3];
        const tip: P2 = addP(root, [0.45 + (i % 3) * 0.1, 0.6 + (i % 2) * 0.25]);
        vol(c, root, tip, [[0, 0.34], [1, 0.12]], TM.mane, { tone: i % 3 === 0 ? 3 : 2 });
      }
      return;
    case 'head': {
      // The head in its own frame: along from the poll to the muzzle, across toward the jaw.
      const HF = frameAt(HJ.poll, HJ.headDeg);
      const head = smooth([[-0.3, -0.62], [1.2, -0.72], [2.9, -0.48], [3.6, -0.3], [3.75, 0.25], [3.3, 0.68], [1.7, 0.82], [0.7, 1.35], [-0.25, 1.05], [-0.5, 0.3]], 4);
      c.shape(head.map(([x, y]) => at(HF, x, y)), (x, y) => {
        const [hx, hy] = local(c, HF, x, y);
        if (!back && Math.hypot(hx - 0.75, hy + 0.15) < 0.24) return code(TM.ink, 1); // eye
        if (!back && Math.hypot(hx - 0.68, hy + 0.3) < 0.12) return code(m, 4); // its catch-light above
        if (Math.hypot(hx - 3.4, hy - 0.1) < 0.2) return code(TM.ink, 2); // nostril
        if (within(c, hx - 0.25, 0.1) || within(c, hx - 2.6, 0.1) || (hy < -0.35 && hx > 0.25 && hx < 2.6 && within(c, hy + 0.5, 0.07))) return code(TM.leather, 2); // bridle
        if (hx > 3.0) return code(m, hy < 0 ? 2 : 1); // the soft muzzle, darker
        if (hx < 1.5 && hy > 0.55) return code(m, Math.hypot(hx - 0.7, hy - 0.8) < 0.35 ? 2 : 1); // the round jowl
        if (hy < -0.45 && hx > 0.6 && hx < 2.4) return code(m, 4); // the lit nose bridge
        return code(m, hy < -0.2 ? 3 : hy > 0.45 ? 1 : 2);
      });
      c.shape([at(HF, -0.25, -0.45), at(HF, -1.3, -0.8), at(HF, 0.2, -0.75)], () => code(m, 2));
      // (at() points are already where the part map puts them; only the key-art end goes through T.)
      c.line(at(HF, 2.7, 0.45), T([3.0, -11.6]), code(TM.leather, 1));
      return;
    }
    case 'capar': {
      if (!k.capar) return;
      // The caparison drapes over the curves: over the croup and the barrel to the knees, up the
      // neck; heavy hanging folds with lit ridges, a scalloped hem, the red cross on the flank.
      const cm = k.capar;
      const up = k.caparUp ?? 0;
      const pts = up ? CAPAR_PTS.map(([px, py]): P2 => [px, py > -5 ? py - up : py]) : CAPAR_PTS; // the hem points only
      const hemY = -4.25 - up;
      shapeU(c, smooth(pts, 3), [0, 0], (x, y, ux, uy) => {
        const vx = ux + 0.6, vy = uy + 7.6;
        if ((within(c, vx, 0.62) && Math.abs(vy) < 2.2) || (within(c, vy + 0.4, 0.58) && Math.abs(vx) < 1.85)) return code(TM.red, vx < -0.25 ? 3 : 2);
        let t = Math.min(3, formTone(ux, uy - 0.6, HORSE_MASSES));
        if (uy < -12.2 + (ux - 5) * 0.0) t = Math.max(t, 2);
        // Folds hang straight down from the back, wider apart over the barrel.
        if (uy > -9.8) {
          const f = ((ux + 8) * 0.55 + Math.sin(uy * 0.9) * 0.05) % 1;
          if (f < 0.11) t = Math.max(0, t - 1);
          else if (f > 0.84 && f < 0.95) t = Math.min(4, t + 1);
        }
        if (uy > hemY - 1.05 && c.tex(x, y, 59, 3) < 0.45) t = Math.max(0, t - 1);
        // The hem turns under and away from the light: a shadow band along it (level 2 up).
        if (c.L >= 2 && uy > hemY - 0.45) t = Math.min(t, 1);
        // White cloth never drops to the deep tone: its shadow is a cool grey, not a brown hole.
        return code(cm, Math.max(1, t));
      });
      return;
    }
    case 'cloth':
      if (!k.capar && k.cloth) shapeU(c, smooth([[-1.9, -10.2], [2.1, -10.4], [2.2, -7.2], [0.2, -6.8], [-1.8, -7.0]], 3), [0, -9], (_x, _y, ux, uy) => (uy > 1.6 ? code(TM.teamDk, 1) : code(TM.team, ux < -0.8 ? 3 : 2)));
      return;
    case 'saddle':
      // Saddle: the cantle high behind, the pommel in front.
      shapeU(c, smooth([[-1.6, -11.7], [-1.0, -11.8], [-0.6, -10.6], [1.4, -10.6], [1.9, -11.3], [2.3, -11.15], [2.0, -9.9], [-1.4, -9.8]], 3), [0, -10.5], (_x, _y, ux, uy) => code(TM.leather, uy < -0.8 ? 3 : ux > 1.6 ? 1 : 2));
      return;
    case 'girth':
      if (!k.capar) vol(c, [0.5, -9.8], [0.7, -4.9], [[0, 0.18], [1, 0.18]], TM.leather, { tone: 1 });
      return;
  }
}

function horseS(c: Paper, k: SHorse, part: 'far' | 'body'): void {
  for (const p of part === 'far' ? HORSE_FAR : HORSE_BODY) horsePiece(c, k, p);
}

/** The horse is drawn a size up against the man (a destrier stands ~1.6 m at the withers). */
export const HORSE_SCALE = 1.15;
/** Draws at `k` times the size about the foot point (the canvas' pixels per unit, scaled). */
export function scaled(c: Paper, k: number, draw: () => void): void {
  const L = c.L;
  c.L = L * k;
  try {
    draw();
  } finally {
    c.L = L;
  }
}

/** A rider's mantle: from the shoulders it spills back over the cantle and the horse's croup. */
function riderCloak(c: Paper, shade?: number, back = false): void {
  const pts = smooth([[-2.8, -12.1], [0.4, -12.5], [2.7, -11.9], [1.6, -8.8], [-0.4, -5.9], [-3.4, -4.3], [-6.6, -4.1], [-6.9, -5.3], [-5.0, -7.6], [-3.6, -10.1]], 3);
  shapeU(c, pts, [0, 0], (x, y, ux, uy) => {
    if ((within(c, ux - 1.9, 0.3) && Math.abs(uy + 10.5) < 0.95) || (within(c, uy + 10.65, 0.28) && Math.abs(ux - 1.9) < 0.6)) return code(TM.red, 2);
    // Seen from behind, the brothers' cross on the mantle's left shoulder (the Rule's red cross),
    // so each rider of a packed charge carries his accent (level 2 up, the knight kits).
    if (back && shade !== undefined && c.L >= 2 && ((within(c, ux + 1.6, 0.36) && Math.abs(uy + 10.3) < 1.1) || (within(c, uy + 10.5, 0.32) && Math.abs(ux + 1.6) < 0.75))) return code(TM.red, ux < -1.7 ? 3 : 2);
    // Folds run from the shoulders down and back, fanning over the croup.
    const a = Math.atan2(uy + 12, ux - 0.5);
    const f = ((a * 4.2 + 10) % 1 + 1) % 1;
    let t = ux < -3.0 || uy < -10.8 ? 3 : uy > -5.2 ? 1 : 2;
    if (f < 0.18) t -= 1;
    else if (f < 0.32) t += 1;
    if (uy > -5.0 && c.tex(x, y, 57, 3) < 0.45) t -= 1;
    if (shade !== undefined && c.L >= 2) {
      // The side of the mantle hanging away from the light falls into shade, and its hem turns
      // under: packed riders' backs are not one flat white (the brothers in the charge).
      if (ux - (uy + 8) * 0.25 > shade) t = Math.min(t, 1);
      if (uy > -4.1 - (ux + 6.6) * 0.29 - 0.5) t = Math.min(t, 1);
    }
    return code(TM.white, Math.max(1, Math.min(4, t)));
  });
}

/** Where the rider's frame (a man's, feet at 0) sits on the horse: his pelvis in the saddle (figure units). */
export const RIDER_SHIFT: P2 = [0.3 * 1.15, -10.6 * 1.15 + 6.5];
/** The rider's own joints (his frame): the near leg along the flank to the stirrup, the far leg hidden. */
export interface RiderRest extends ManRest {}
const RIDER_NEAR = { el: [-2.65, -8.5] as P2, wr: [-1.6, -7.0] as P2 };
export function riderRest(k: SKit, g: SGear): RiderRest {
  const ne = g.near ?? RIDER_NEAR, fa = g.far ?? FAR_HIDDEN;
  return {
    hipN: [-0.4, -6.3], kneeN: [1.6, -3.9], ankN: [1.0, -1.1],
    hipF: [0.6, -6.4], kneeF: [2.5, -4.0], ankF: [1.9, -1.3],
    shN: J.shN, shF: J.shF, elN: ne.el, wrN: ne.wr, elF: fa.el, wrF: fa.wr, neck: J.neck, head: J.head,
  };
  void k;
}
export type RiderPiece =
  | 'rThighN' | 'rShinN' | 'rFootN' | 'cloak' | 'behind' | 'upperArmF' | 'forearmF' | 'handF' | 'farItem'
  | 'torso' | 'fur' | 'camail' | 'head' | 'front' | 'upperArmN' | 'forearmN' | 'handN' | 'pauldron' | 'weapon' | 'last';
export const RIDER_PIECES: readonly RiderPiece[] = [
  'rThighN', 'rShinN', 'rFootN', 'cloak', 'behind', 'upperArmF', 'forearmF', 'handF', 'farItem',
  'torso', 'fur', 'camail', 'head', 'front', 'upperArmN', 'forearmN', 'handN', 'pauldron', 'weapon', 'last',
];

/** One piece of a rider (his frame; the caller shifts it to the saddle). `rig`: also the far arm the key art hides. */
export function riderPiece(c: Paper, k: SKit, g: SGear, p: RiderPiece, R: RiderRest, o: { rig?: boolean; back?: boolean } = {}): void {
  const back = o.back ?? false;
  const farArm = !!g.far || !!o.rig;
  const held = (it: { el: P2; wr: P2; draw?: SItem } | undefined, el: P2, wr: P2) => {
    if (!it?.draw) return;
    const h = T(handAt(el, wr)), turn = XF ? XF.deg : 0;
    withMap(null, () => it.draw!(c, h, turn));
  };
  switch (p) {
    case 'rThighN':
      // The near leg: thigh forward and down along the flank…
      vol(c, R.hipN, R.kneeN, [[0, 0.85], [1, 0.62]], k.legs, { tone: 2 });
      blob(c, R.kneeN, 0.62, 0.58, k.legs, { tone: 2 });
      return;
    case 'rShinN':
      // …the shin back to the stirrup.
      vol(c, R.kneeN, R.ankN, [[0, 0.58], [0.3, 0.62], [1, 0.45]], k.legs, { tone: 1 });
      return;
    case 'rFootN': {
      const ank = R.ankN;
      shapeK(c, [addP(ank, [-0.5, -0.3]), addP(ank, [0.4, -0.3]), addP(ank, [1.25, 0.2]), addP(ank, [1.2, 0.5]), addP(ank, [-0.5, 0.5])], () => code(k.boots, 2));
      vol(c, addP(ank, [0.1, 0.55]), addP(ank, [0.1, -2.6]), [[0, 0.1], [1, 0.1]], TM.leather, { tone: 1 }); // stirrup leather
      return;
    }
    case 'cloak': if (k.cloak) riderCloak(c, k.shadeFrom, back); return;
    case 'behind': g.behind?.(c); return;
    case 'upperArmF': if (farArm) upperArmS(c, R.shF, R.elF, k, true); return;
    case 'forearmF': if (farArm) forearmS(c, R.elF, R.wrF, k, true); return;
    case 'handF': if (farArm) handS(c, R.elF, R.wrF, k, true); return;
    case 'farItem': held(g.far, R.elF, R.wrF); return;
    case 'torso': riderTorsoS(c, k, back); return;
    case 'fur': if (k.cloak) furS(c); return;
    case 'camail': if (k.camail) camail(c, k.camail, back); return;
    case 'head': helmS(c, k.helm, R.head, back, k.beard ?? true, k.camail ?? (isMailS(k.body) ? k.body : null)); return;
    case 'front': g.front?.(c); return;
    case 'upperArmN': upperArmS(c, R.shN, R.elN, k, false); return;
    case 'forearmN': forearmS(c, R.elN, R.wrN, k, false); return;
    case 'handN': handS(c, R.elN, R.wrN, k, false); return;
    case 'pauldron': if (k.pauldrons) pauldronS(c, addP(R.shN, [-0.1, 0.1]), false); return;
    case 'weapon': held(g.near, R.elN, R.wrN); return;
    case 'last': g.last?.(c); return;
  }
}

/** The rider's torso, with the coat skirt falling over the thigh. */
function riderTorsoS(c: Paper, k: SKit, back: boolean): void {
  const garment = k.coat ?? k.body;
  shapeU(c, [[-0.75, -12.15], [0.85, -12.15], [2.45, -11.75], [2.6, -10.7], [2.3, -9.4], [1.75, -8.25], [2.0, -7.0], [3.2, -5.6], [2.8, -4.9], [0.6, -5.2], [-1.6, -5.4], [-2.4, -6.2], [-1.9, -7.4], [-1.8, -8.25], [-2.35, -9.4], [-2.6, -10.7], [-2.5, -11.75]], [0, 0], (x, y, ux, uy) => {
    const side = ux + (uy + 9) * 0.12;
    let t = side < -1.25 ? 3 : side > (k.shadeFrom ?? 1.35) ? 1 : 2;
    if (uy < -10.6 && ux < 1.0) t = Math.max(t, 3);
    if (uy > -8.45 && uy < -7.95) return code(k.belt ?? TM.leather, ux < -1.2 ? 3 : 2);
    if (k.cross && uy > -11.5 && uy < -8.5) {
      const vx = ux + (back ? -0.3 : 0.2);
      if ((within(c, vx, 0.42) && uy > -11.35) || (within(c, uy + 10.25, 0.38) && Math.abs(vx) < 1.45)) return code(TM.red, vx < -0.2 ? 3 : 2);
    }
    if (uy > -7.6) {
      const fx2 = ux * 0.6 + (uy + 7.6) * 0.5;
      if (Math.abs(fx2 - 1.0) < 0.12 || Math.abs(fx2 - 2.0) < 0.12) return code(garment, t - 1);
    }
    if (isMailS(garment)) {
      const r = mailTex(c, x, y, t > 2 ? -1 : t < 2 ? 1 : 0, t, garment);
      if (r >= 0) return r;
    }
    return code(garment, t);
  });
}

function riderS(c: Paper, k: SKit, g: SGear): void {
  // Shift the man's foot frame so his pelvis sits in the saddle.
  const fx = c.FX, fy = c.FY;
  c.FX = fx + Math.round(RIDER_SHIFT[0] * c.L);
  c.FY = fy + Math.round(RIDER_SHIFT[1] * c.L);
  try {
    const R = riderRest(k, g);
    for (const p of RIDER_PIECES) riderPiece(c, k, g, p, R);
  } finally {
    c.FX = fx;
    c.FY = fy;
  }
}

const KNIGHT: SKit = { helm: 'great', body: KM.silver, coat: TM.white, cross: true, longCross: true, cloak: true, pauldrons: true, camail: KM.silver, sleeve: KM.silver, hand: TM.steel, legs: KM.silver, boots: KM.silver, shadeFrom: 0.2 };
const MARSHAL: SKit = { ...KNIGHT, helm: 'gilded', belt: TM.gold };
const TURCOPOLE: SKit = { helm: 'turban', body: TM.gambeson, coat: null, camail: TM.mailDk, sleeve: TM.gambeson, hand: TM.leather, legs: TM.wool, boots: TM.leather };
const HORSE_ARCHER: SKit = { helm: 'turban', body: TM.wool, coat: null, camail: null, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather, belt: TM.team };

export const MOUNTED: Record<number, { kit: SKit; horse: SHorse; gear: SGear; dark: boolean; cls?: ValueClass }> = {
  5: {
    kit: TURCOPOLE,
    horse: { coat: TM.dun },
    dark: false,
    gear: {
      front: (c) => roundS(c, [2.0, -9.0], 2.2),
      near: { el: [-2.8, -8.9], wr: [-2.0, -7.4], draw: (c, h, d) => void spear(c, h, 180 + d, 13.0, 4.5, { head: 1.5, pennon: 0.4, w: 0.3 }) },
    },
  },
  6: {
    kit: HORSE_ARCHER,
    horse: { coat: TM.bay, cloth: true },
    dark: true,
    gear: {
      behind: (c) => { vol(c, [-2.4, -7.6], [-3.4, -5.6], [[0, 0.45], [1, 0.4]], TM.leather, { tone: 2 }); for (const k of [-0.25, 0.05, 0.3]) vol(c, [-2.4 + k, -7.5], [-2.2 + k * 1.3, -8.4], [[0, 0.15], [1, 0.2]], TM.white, { tone: 3 }); },
      far: { el: [2.9, -9.6], wr: [3.6, -8.6], draw: (c, h, d) => bow(c, c.L < 2 ? addP(h, [1.4, -1.0]) : h, 168 + d, c.L < 2 ? 15 : 8.6, 0, null) },
      near: { el: [-2.8, -8.9], wr: [-1.6, -7.4] },
    },
  },
  7: {
    kit: KNIGHT,
    // An iron-grey destrier under a shorter caparison: its legs and head show in a mid value
    // between the white cloth and the grass, so a packed charge is not one white mass.
    horse: { coat: TK.dapple, capar: TM.white, caparUp: 0.9 },
    dark: false,
    cls: 'knight',
    gear: {
      front: (c) => kiteS(c, [2.1, -8.6], 3.8, 5.9, false, true, -6),
      near: { el: [-2.8, -8.9], wr: [-1.8, -7.3], draw: (c, h, d) => void spear(c, h, 135 + d, c.L < 2 ? 22 : 12.5, 3.5, { head: 1.3, pennon: 0.3, w: 0.36 }) },
    },
  },
  10: {
    kit: MARSHAL,
    horse: { coat: TM.grey, capar: TM.white },
    dark: false,
    cls: 'knight',
    gear: {
      far: { el: [2.7, -9.7], wr: [3.0, -11.4], draw: (c, h, d) => beauseant(c, addP(h, [0, 0]), 180 + d, 0.35, 0) },
      near: { el: [-2.9, -8.9], wr: [-2.2, -7.1], draw: (c, h, d) => sword(c, h, 135 + d, 5.4) },
    },
  },
};

// ------------------------------------------------------------------ the engine

/** The engine's crew: undyed linen, a cap. */
export const CREW_KIT: SKit = { helm: 'cap', body: KM.wraps, coat: null, short: true, camail: null, sleeve: KM.wraps, hand: TM.flesh, legs: TM.wool, boots: TM.leather };
/** The traction trebuchet's layout (units): the axle, the beam's ends, the sling's pouch, the crew's places, the ropes. */
export const ENGINE = {
  piv: [-0.4, -14.2] as P2,
  longEnd: [-9.2, -6.6] as P2,
  shortEnd: [3.8, -18.0] as P2,
  pouch: [-11.6, -1.0] as P2,
  loaderX: -8.6,
  pullerX: 7.4,
  ropes: [[-0.3, 6.8], [0, 7.6], [0.3, 9.2], [0.5, 10.0]] as [number, number][],
  loader: { near: { el: [-2.6, -9.2] as P2, wr: [-0.8, -9.0] as P2 } } as SGear,
  puller: { near: { el: [-2.3, -13.0] as P2, wr: [-0.4, -14.6] as P2 }, far: { el: [2.6, -13.2] as P2, wr: [0.9, -14.6] as P2 } } as SGear,
};

/** A crewman at an offset along the ground (his whole frame shifted). */
function crewS(c: Paper, dx: number, g: SGear): void {
  const fx = c.FX;
  c.FX = fx + Math.round(dx * c.L);
  try {
    manS(c, CREW_KIT, g);
  } finally {
    c.FX = fx;
  }
}

export type EnginePiece = 'farTimbers' | 'beam' | 'sling' | 'stone' | 'ropes' | 'nearTimbers';
// A squared timber. At level 4 (5 px across) lit, base and shadow bands would each run a pixel or
// two inside its edges, parallel to them (hugging): one plane per timber there, the grain kept.
const timberS = (c: Paper, a: P2, b: P2, w: number, t: number) =>
  vol(c, a, b, [[0, w], [1, w * 0.92]], TM.wood, { tone: t, detail: (x, y) => (c.tex(x, y, 33, 3) < 0.06 ? code(TM.wood, t - 1) : c.L === 4 ? code(TM.wood, t) : -1) });
/** One piece of the traction trebuchet (Maciejowski fol. 23v): trestle, lashed beam, sling, ropes. */
export function enginePiece(c: Paper, p: EnginePiece): void {
  const { piv, longEnd, shortEnd, pouch } = ENGINE;
  switch (p) {
    case 'farTimbers':
      // Far trestle, darker; ground sills and a cross-brace.
      timberS(c, addP(piv, [1.2, -0.6]), [-3.4, -0.3], 0.55, 1);
      timberS(c, addP(piv, [1.2, -0.6]), [4.4, -0.6], 0.55, 1);
      timberS(c, [-6.2, -0.2], [6.4, -0.6], 0.6, 1);
      return;
    case 'beam':
      // The beam: long arm resting back-down, the short arm up in front with its ropes.
      vol(c, shortEnd, longEnd, [[0, 0.55], [0.3, 0.75], [1, 0.4]], TM.wood, { tone: 2, detail: (_x, _y, _u, v) => (Math.abs(v - 0.27) < 0.02 || Math.abs(v - 0.36) < 0.02 || Math.abs(v - 0.6) < 0.015 ? code(TM.leather, 1) : -1) });
      return;
    case 'sling':
      // Sling to a pouch with the stone lying behind.
      lineK(c, longEnd, pouch, code(TM.leather, 2));
      lineK(c, addP(longEnd, [0.2, 0.1]), addP(pouch, [0.4, 0.0]), code(TM.leather, 1));
      return;
    case 'stone':
      blob(c, pouch, 0.95, 0.85, TM.wool, { tone: 2 });
      return;
    case 'ropes':
      // Ropes from the short arm down to the pullers.
      for (const [k, x] of ENGINE.ropes) lineK(c, addP(shortEnd, [k, 0]), [x, -10.8], code(TM.white, 1));
      return;
    case 'nearTimbers':
      // Near trestle and axle.
      timberS(c, piv, [-4.8, 0], 0.65, 2);
      timberS(c, piv, [3.4, 0], 0.65, 2);
      timberS(c, [-3.3, -5.0], [2.3, -5.0], 0.45, 1);
      blob(c, piv, 0.55, 0.55, TM.steel, { tone: 2 });
      return;
  }
}

/** The traction trebuchet with its loader behind and its pullers, arms up on the ropes, leaning back. */
function engineS(c: Paper): void {
  crewS(c, ENGINE.loaderX, ENGINE.loader);
  for (const p of ['farTimbers', 'beam', 'sling', 'stone', 'ropes', 'nearTimbers'] as EnginePiece[]) enginePiece(c, p);
  crewS(c, ENGINE.pullerX, ENGINE.puller);
}

// ------------------------------------------------------------------ painting

/** Draws a kind's key art (codes only) on a fresh canvas; false if it has none. */
function drawKind(c: Paper, kind: number, level: number): boolean {
  const foot = FOOT[kind], rider = MOUNTED[kind];
  if (!foot && !rider && kind !== 9) return false;
  const body: BodyType = foot ? 'foot' : rider ? 'horse' : 'engine';
  c.begin(level, BODIES[body].canvas);
  if (foot) paintAs(c, foot.dark, () => manS(c, foot.kit, foot.gear));
  else if (rider)
    paintAs(c, rider.cls ?? rider.dark, () => {
      scaled(c, HORSE_SCALE, () => horseS(c, rider.horse, 'far'));
      scaled(c, HORSE_SCALE, () => horseS(c, rider.horse, 'body'));
      riderS(c, rider.kit, rider.gear);
    });
  else paintAs(c, true, () => engineS(c));
  c.contact();
  c.clusters(level >= 8 ? 4 : 3);
  return true;
}

/**
 * The key art's own master palette at a level: built, like the live one, from the codes the
 * eleven images paint, under the same colour budget (33 colours at level 8).
 */
const PALS = new Map<string, ReturnType<typeof figurePalette>>();
function staticPalette(hue: number, level: number): ReturnType<typeof figurePalette> {
  const key = `${hue}:${level}`;
  const got = PALS.get(key);
  if (got) return got;
  const codes = new Map<number, number>();
  const c = new Paper();
  for (const k of STATIC_KINDS()) if (drawKind(c, k, level)) c.codes(codes);
  const fp = figurePalette(hue, level, codes);
  PALS.set(key, fp);
  return fp;
}

/** Paints a kind's key art at level 8 (or another level) in the army's hue. */
export function paintStatic(kind: number, hue = 215, level = 8): { width: number; height: number; pixels: Uint8ClampedArray; ax: number; ay: number } | null {
  const fp = staticPalette(hue, level);
  const c = new Paper();
  if (!drawKind(c, kind, level)) return null;
  const out = c.colours(fp);
  return { width: c.CW, height: c.CH, pixels: new Uint8ClampedArray(out.buffer), ax: c.FX, ay: c.FY };
}

/** The kinds in lineup order: the foot, the horse, the engine and the marshal. */
export const STATIC_KINDS = (): number[] => [0, 1, 2, 3, 4, 8, 5, 6, 7, 9, 10];
void rot;
