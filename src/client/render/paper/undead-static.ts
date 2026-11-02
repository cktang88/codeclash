// The Hollow Host's key art: one static image per kind (idle, facing SE, level 8), drawn with the
// paper painter's primitives but placed by hand, not posed by the rig. These set the look the
// animated figures in undead.ts will be rebuilt from once approved; nothing in the game draws
// them yet (see scripts that render `undeadStatic`).
//
// Brief (the user's targets: the craftpix knight sheet and the Diablo II: Resurrected class
// renders): bulk comes from volumes, not rods. Limbs are shaped masses (upper arm about 0.09 H
// thick, thigh 0.11 H, boots wider), shoulders 0.36 H (0.45 H with pauldrons), a solid torso in
// layered armour, a waist of 0.24 H, large shields held tight to the body over the torso. The dead
// keep thin bones only where the armour gaps: the face, the neck, a forearm, a shin. Figure height
// H is about 14.5 units (116 px at level 8).

import { addP, code, DEG, defineMaterial, hash, isKept, oklchRamp, rot, type P2, type Paper } from './core.ts';
import { Anim } from '../contract.ts';
import { along, limb, poseAt, snapDeg, type KeySet } from './rig.ts';
import { bone, bow, crossbow, flame, frameOf, helm, hood, horseBody, horseFar, horseFrame, horseNear, lance, withHorseBulk, mul, pavise, planeLight, quiver, rag, robe, skull, spear, UM } from './undead-parts.ts';
import {
  BLACK_RIDER_KEYS, boneJavelin, COLOSSUS_KEYS, colossus, DEATH_KNIGHT_KEYS, ghoulHead, greatHelm, HORSE_ARCHER_KEYS, collar, lichChest, LICH_KEYS, spineCrown, lit, TREBUCHET_KEYS, trebuchet,
} from './undead.ts';

// ------------------------------------------------------------------ volumes

/**
 * A limb mass: a tapered stroke with rounded ends (a blob at each end), shaded as a rounded
 * volume, lit top-left. The core of every armoured arm and leg.
 */
export function vol(c: Paper, a: P2, b: P2, wa: number, wb: number, m: number, o: { tone?: number; shine?: boolean; detail?: (x: number, y: number, u: number, v: number) => number; caps?: boolean } = {}): void {
  const tone = o.tone ?? 2;
  if (o.caps !== false) {
    c.blob(a, wa / 2, wa / 2, m, { tone });
    c.blob(b, wb / 2, wb / 2, m, { tone: tone - 1 });
  }
  c.rod(a, b, wa, wb, m, { tone, shine: o.shine, detail: o.detail });
}

/**
 * A plate or a panel: any outline (units) filled with one plane of light across its bounding
 * box (lit top-left, a shade band bottom-right), rust creeping in at `rust`, a pale rim along
 * its top edge when `rim`.
 */
export function plate(c: Paper, pts: P2[], m: number, o: { tone?: number; rust?: number; rim?: boolean; k?: number; seed?: number; detail?: (x: number, y: number, rx: number, ry: number) => number } = {}): void {
  const xs = pts.map((p) => c.sx(p[0])), ys = pts.map((p) => c.sy(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const tone = o.tone ?? 2;
  c.shape(pts, (x, y) => {
    const rx = ((x + 0.5 - x0) / Math.max(1, x1 - x0)) * 2 - 1, ry = ((y + 0.5 - y0) / Math.max(1, y1 - y0)) * 2 - 1;
    if (o.detail) {
      const d = o.detail(x, y, rx, ry);
      if (d >= 0) return d;
    }
    if (o.rim && y - y0 < Math.max(1, c.L * 0.2)) return code(m, tone + 1);
    if (o.rust && c.tex(x, y, o.seed ?? 401, 3) < o.rust * (0.5 + ry * 0.5)) return code(UM.rust, tone - (ry > 0.3 ? 1 : 0));
    const lt = planeLight(rx, ry, o.k ?? 0.4);
    // Hard metals catch a crisp specular: a short streak in the lit plane.
    if ((m === UM.iron || m === UM.rust || m === UM.steel) && lt > 0 && Math.abs(rx + ry * 0.5 + 0.55) < 0.06) return code(m, 4);
    return code(m, tone + lt);
  });
}

/** Rivets along a line. */
function rivets(c: Paper, a: P2, b: P2, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = addP(a, mul([b[0] - a[0], b[1] - a[1]], (i + 0.5) / n));
    c.blob(p, 0.16, 0.16, UM.steel, { tone: 3 });
  }
}

// ------------------------------------------------------------------ the armoured dead: shared body

/** The standing SE idle frame every foot kind is drawn on (units, feet at 0). */
const B = {
  neck: [0.4, -12.0] as P2,
  head: [0.75, -13.15] as P2,
  shN: [-1.75, -11.0] as P2,
  shF: [2.15, -11.25] as P2,
  waistY: -7.7,
  hipN: [-0.75, -6.5] as P2,
  hipF: [1.05, -6.6] as P2,
  kneeN: [-1.05, -3.65] as P2,
  kneeF: [1.55, -3.75] as P2,
  ankN: [-1.15, -0.75] as P2,
  ankF: [1.85, -0.8] as P2,
};

/** A mail hauberk: ring rows every third pixel row, a checker of light in the lit plane only, rust. */
function mailShade(c: Paper, x: number, y: number, rx: number, ry: number, tone = 2): number {
  const lt = planeLight(rx, ry, 0.35);
  if (c.tex(x, y, 411, 4) < 0.05 + Math.max(0, ry) * 0.07) return code(UM.rust, 1 + (lt > 0 ? 1 : 0));
  if (c.L < 8) {
    if (c.ly(y) % 3 === 0) return code(UM.mail, tone - 1 + Math.min(0, lt));
    if (lt > 0 && (c.lx(x) + ((c.ly(y) / 3) | 0)) % 2 === 0) return code(UM.mail, tone + 1);
    return code(UM.mail, tone + Math.min(0, lt));
  }
  // Rings: rows of small links, each a 3 x 3 cell with a dark hole, offset row to row; in the lit
  // plane each ring catches a point of light on its upper left, in the shade the rings go flat.
  const row = Math.floor(c.ly(y) / 3);
  const cx = (c.lx(x) + (row % 2) * 2) % 4, cy = c.ly(y) % 3;
  if (cx === 3) return code(UM.mail, tone - 1 + Math.min(0, lt)); // the gap between links
  if (cx === 1 && cy === 1) return code(UM.mail, tone - 2 + Math.max(0, lt)); // the hole
  if (cx === 0 && cy === 0 && lt >= 0) return code(UM.mail, tone + 1 + lt);
  return code(UM.mail, tone + Math.min(0, lt));
}

/** A greave and boot leg: the thigh in mail, a poleyn on the knee, an iron shin, a heavy sabaton. */
function armouredLeg(c: Paper, hip: P2, knee: P2, ank: P2, far: boolean, o: { thigh?: number; shin?: number } = {}): void {
  const t = far ? 1 : 2;
  vol(c, hip, knee, 1.55, 1.25, UM.mail, { tone: t, detail: (x, y, u, v) => mailShade(c, x, y, u, v * 2 - 1, t) });
  // The shin: a bare bone gap under the poleyn, then the greave.
  bone(c, knee, addP(knee, mul([ank[0] - knee[0], ank[1] - knee[1]], 0.45)), 0.45, 0.4, t);
  const g0 = addP(knee, mul([ank[0] - knee[0], ank[1] - knee[1]], 0.38));
  vol(c, g0, ank, 0.95, 1.0, UM.rust, { tone: t + 1, caps: false });
  c.blob(knee, 0.7, 0.62, UM.rust, { tone: t + 1, detail: (_x, _y, nx, ny) => (ny < -0.55 && !far ? code(UM.rust, 4) : ny > 0.5 ? code(UM.rust, 0) : -1) });
  // The sabaton: a broad iron foot, toe forward.
  const sab: P2[] = [addP(ank, [-0.7, -0.35]), addP(ank, [0.5, -0.45]), addP(ank, [1.35, 0.35]), addP(ank, [1.3, 0.75]), addP(ank, [-0.75, 0.75])];
  plate(c, sab, UM.rust, { tone: t });
  void o;
}

/**
 * A gauntleted arm: a mail sleeve to the elbow, a rusted couter, the bare forearm bones (radius
 * and ulna, pale against the armour), a rusted gauntlet and fist.
 */
function armouredArm(c: Paper, sh: P2, el: P2, hand: P2, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, sh, el, 1.25, 1.0, UM.mail, { tone: t, caps: false, detail: (x, y, u, v) => mailShade(c, x, y, u, v * 2 - 1, t) });
  const g0 = addP(el, mul([hand[0] - el[0], hand[1] - el[1]], 0.5));
  c.rod(el, g0, 0.42, 0.36, UM.bone, { tone: t + 1 });
  c.rod(addP(el, [0.22, 0.05]), addP(g0, [0.2, 0.0]), 0.24, 0.22, UM.bone, { tone: t });
  vol(c, g0, hand, 0.8, 1.0, UM.rust, { tone: t + 1, caps: false });
  c.blob(el, 0.6, 0.52, UM.rust, { tone: t + 1, detail: (_x, _y, _nx, ny) => (ny > 0.5 ? code(UM.rust, 0) : -1) });
  c.blob(hand, 0.62, 0.55, UM.rust, { tone: t, detail: (_x, _y, nx, ny) => (Math.abs(nx * 0.8 + ny) < 0.12 ? code(UM.rust, 0) : -1) });
}

/** Pauldrons: three rusted lames stepping down over the shoulder, a lit top rim, rivets. */
function pauldron(c: Paper, sh: P2, far: boolean, s = 1): void {
  const t = far ? 1 : 2;
  for (const [dy, rx, ry] of [[0.95, 1.05, 0.5], [0.45, 1.25, 0.6], [-0.15, 1.35, 0.78]] as [number, number, number][]) {
    c.blob(addP(sh, [0, dy * s]), rx * s, ry * s, UM.rust, {
      tone: t + 1,
      detail: (x, y, nx, ny) => {
        if (ny < -0.62 && nx < 0.3 && !far) return code(UM.steel, 3);
        if (ny > 0.6) return code(UM.rust, 0);
        if (c.tex(x, y, 421, 3) < 0.04 + (ny + 1) * 0.08) return code(UM.iron, ny > 0.2 ? 1 : 2);
        return -1;
      },
    });
  }
  if (!far) rivets(c, addP(sh, [-0.8 * s, -0.1]), addP(sh, [0.8 * s, -0.25]), 3);
}

/** The torso of the armoured dead: a mail hauberk over the ribs, holes showing the bone. */
function hauberk(c: Paper, hem: number, o: { team?: boolean } = {}): void {
  const pts: P2[] = [[-2.45, -11.1], [-1.2, -11.85], [1.7, -11.95], [2.75, -11.1], [2.55, -9.0], [2.05, B.waistY], [2.6, hem], [-2.35, hem + 0.15], [-1.65, B.waistY], [-2.15, -9.0]];
  const L = c.L;
  const y0 = c.sy(-11.95), y1 = c.sy(hem);
  plate(c, pts, UM.mail, {
    detail: (x, y, rx, ry) => {
      // A ragged hem.
      if (y1 - y < L * 0.9 && hash(Math.floor(c.lx(x) / Math.max(2, L * 0.55)), 3, 431) * L * 0.9 > y1 - y) return -2;
      // Rotted through: the ribs show in a hole under the far breast.
      const hx = (x - c.sx(1.1)) / L, hy = (y - c.sy(-9.8)) / L;
      if (Math.hypot(hx / 1.0, hy / 1.25) < 1) {
        if (Math.hypot(hx / 1.0, hy / 1.25) > 0.82) return code(UM.rust, 1);
        return Math.abs(((hy + 2) % 0.62) - 0.31) < 0.14 ? code(UM.bone, hx < 0 ? 3 : 2) : code(UM.ink, 1);
      }
      void y0;
      return mailShade(c, x, y, rx, ry);
    },
  });
  void o;
}

/** A belt with a buckle and a hanging pouch. */
function belt(c: Paper, y: number, x0: number, x1: number): void {
  c.rod([x0, y - 0.1], [x1, y + 0.05], 0.55, 0.55, UM.leather, { tone: 2, detail: (x, _y, _u, v) => (Math.abs(v - 0.55) < 0.06 ? code(UM.steel, 3) : (c.lx(x) & 3) === 0 && v < 0.4 ? code(UM.leather, 1) : -1) });
  plate(c, [[x0 + 0.5, y + 0.2], [x0 + 1.3, y + 0.2], [x0 + 1.25, y + 1.3], [x0 + 0.55, y + 1.3]], UM.leather, { tone: 1, rim: true });
}

/** The big kite shield held tight across the body: team field, a painted skull, a rusted rim and rivets, scars. */
function kiteShield(c: Paper, at: P2, h: number, w: number, tilt: number): void {
  tilt = snapDeg(tilt);
  const R = (p: P2): P2 => addP(at, rot(p, tilt * DEG));
  const top = -h * 0.42, bot = h * 0.58;
  const pts: P2[] = [R([-w / 2, top]), R([0, top - 0.25]), R([w / 2, top]), R([w * 0.47, top + h * 0.35]), R([0, bot]), R([-w * 0.47, top + h * 0.35])];
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.shape(pts, (x, y) => {
    const [lx, ly] = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -tilt * DEG);
    const half = ly < top + h * 0.35 ? w / 2 : (w * 0.47) * (1 - (ly - top - h * 0.35) / (bot - top - h * 0.35));
    const edge = Math.min(half - Math.abs(lx), ly - top + 0.25 - Math.abs(lx) * 0.1);
    const rx = lx / (w / 2), ry = ((ly - top) / h) * 2 - 1;
    const lt = planeLight(rx, ry, 0.3);
    if (edge < 0.32) return code(UM.rust, 2 + lt);
    if (edge < 0.55 && Math.abs((((ly - top) * 1.4) % 1) - 0.5) < 0.12 && edge > 0.38) return code(UM.steel, 3);
    // The painted skull, a third of the field.
    const sd = Math.hypot(lx * 1.05, (ly + h * 0.04) * 1.0);
    const sr = w * 0.27;
    if (sd < sr || (Math.abs(lx) < sr * 0.62 && ly > 0 && ly < sr * 1.35)) {
      if (Math.hypot(Math.abs(lx) - sr * 0.38, ly + h * 0.05) < sr * 0.28) return code(UM.ink, 1);
      if (Math.abs(lx) < sr * 0.12 && ly > sr * 0.15 && ly < sr * 0.5) return code(UM.ink, 1);
      if (ly > sr * 0.8 && (c.lx(x) & 1) === 0) return code(UM.ink, 2);
      return code(UM.bone, 2 + (lt > 0 ? 1 : 0));
    }
    // Scars and chipped paint showing the boards.
    if (hash(c.lx(x) >> 1, c.ly(y) >> 2, 441) < 0.05) return code(UM.wood, 1);
    if (Math.abs(lx + ly * 0.4 - 0.8) < 0.08 && ly > 0.5) return code(UM.teamDk, 1);
    return code(UM.team, 2 + lt);
  });
}

/** A rusted arming sword held at `grip`, blade toward `deg`. */
function bigSword(c: Paper, grip: P2, deg: number, len: number): void {
  const g0 = along(grip, deg, 0.55);
  const tip = along(g0, deg, len);
  c.rod(g0, tip, 0.8, 0.3, UM.steel, {
    shine: true,
    detail: (x, y, u, v) => {
      if (v > 0.25 && v < 0.9 && hash(Math.round(v * 16), 0, 451) < 0.22 && u > 0.4) return -1; // chips
      if (c.tex(x, y, 453) < 0.14 && v > 0.1) return code(UM.rust, 2);
      if (Math.abs(u) < 0.1 && v < 0.75) return code(UM.steel, 1); // the fuller
      return -1;
    },
  });
  const side = limb(deg + 90);
  c.rod(addP(g0, mul(side, 1.0)), addP(g0, mul(side, -1.0)), 0.36, 0.36, UM.iron, { tone: 2 });
  c.rod(grip, along(grip, deg + 180, 1.0), 0.34, 0.3, UM.leather, { tone: 2 });
  c.blob(along(grip, deg + 180, 1.15), 0.34, 0.34, UM.iron, { shine: true });
}

// ------------------------------------------------------------------ kinds

/**
 * The Grave Legionary (after the user's armoured-undead target): one dominant armour colour,
 * rusted iron, in big chunky plates with clear lit and shadow planes (a breastplate with a
 * ridge, a fauld of lames, tassets, couters, greaves); mail only at the sleeves; a dark team
 * cloth front skirt with a rope belt; the skull face pale and plain under the kettle hat; the
 * long blade held low and back; the big skull kite shield tight on the far arm.
 */
function legionary(c: Paper): void {
  // Far leg: dark cloth over the thigh, a rust tasset, the greave and sabaton.
  plateLeg(c, B.hipF, B.kneeF, B.ankF, true);
  armouredArm(c, B.shF, [2.9, -8.9], [2.6, -7.4], true);
  // The front skirt: dark team cloth hanging from the belt to the knees, torn.
  rag(c, [-1.4, -7.6], [2.0, -7.7], 4.6, 0.1, UM.teamDk, UM.teamDk, 541, { tear: 0.3 });
  // The breastplate: a ridge down the middle, the lit plane left of it, the shadow plane right.
  const bp: P2[] = [[-2.4, -11.0], [-1.1, -11.85], [1.7, -11.95], [2.7, -11.0], [2.5, -9.2], [1.9, -7.7], [-1.5, -7.7], [-2.1, -9.2]];
  plate(c, bp, UM.rust, {
    tone: 2,
    detail: (x, y, rx, ry) => {
      const ridge = rx + ry * 0.12 + 0.05;
      if (Math.abs(ridge) < 0.05) return code(UM.rust, 4);
      if (c.tex(x, y, 543, 3) < 0.05) return code(UM.iron, 1); // pitting
      if (ry > 0.75) return code(UM.rust, 1); // the lower edge turned under
      return code(UM.rust, ridge < 0 ? (ry < -0.2 ? 3 : 3) : ry < 0 ? 2 : 1);
    },
  });
  rivets(c, [-1.9, -11.0], [2.3, -11.1], 5);
  // The fauld: three lames under the breastplate, each lit on its upper edge.
  for (let i = 0; i < 3; i++) {
    const y = -7.7 + i * 0.55;
    plate(c, [[-1.8 - i * 0.12, y], [2.1 + i * 0.1, y - 0.05], [2.2 + i * 0.12, y + 0.6], [-1.9 - i * 0.14, y + 0.65]], UM.rust, { tone: 2, rim: true });
  }
  // A rope belt over it, its knot hanging.
  c.rod([-1.9, -7.55], [2.3, -7.65], 0.34, 0.34, UM.bone, { tone: 1, detail: (x) => ((c.lx(x) >> 1) & 1 ? code(UM.bone, 2) : -1) });
  c.rod([0.4, -7.5], [0.2, -6.0], 0.26, 0.22, UM.bone, { tone: 1 });
  plateLeg(c, B.hipN, B.kneeN, B.ankN, false);
  // A gorget, the neck bones, the skull bright under the hat's brim.
  // An open bascinet in rusted iron, its mail aventail over the shoulders, the skull grinning out.
  bascinet(c, addP(B.head, [0, 0.0]), UM.rust);
  pauldron(c, B.shF, true, 1.1);
  kiteShield(c, [1.55, -8.2], 6.9, 4.3, -4);
  pauldron(c, B.shN, false, 1.15);
  // The sword held low and back, the long blade slanting past the near leg.
  const hand: P2 = [-2.85, -6.8];
  bigSword(c, hand, -40, 7.4);
  armouredArm(c, B.shN, [-3.0, -9.0], hand, false);
}

/** A plated leg: dark cloth at the thigh under a rust tasset, a poleyn, a rust greave, a sabaton. */
function plateLeg(c: Paper, hip: P2, knee: P2, ank: P2, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, hip, knee, 1.5, 1.25, UM.teamDk, { tone: t - 1, caps: false });
  // The tasset: a rust plate hanging over the upper thigh.
  const tp = addP(hip, [0, 0.4]);
  plate(c, [addP(tp, [-0.9, -0.3]), addP(tp, [0.85, -0.35]), addP(tp, [0.95, 1.5]), addP(tp, [-0.8, 1.6])], UM.rust, { tone: t + 1, rim: !far });
  const g0 = addP(knee, mul([ank[0] - knee[0], ank[1] - knee[1]], 0.22));
  vol(c, g0, ank, 1.15, 1.0, UM.rust, { tone: t + 1, caps: false });
  c.blob(knee, 0.78, 0.68, UM.rust, { tone: t + 1, detail: (_x, _y, nx, ny) => (ny < -0.5 && nx < 0.3 && !far ? code(UM.rust, 4) : ny > 0.5 ? code(UM.rust, 0) : -1) });
  const sab: P2[] = [addP(ank, [-0.7, -0.35]), addP(ank, [0.5, -0.45]), addP(ank, [1.35, 0.35]), addP(ank, [1.3, 0.75]), addP(ank, [-0.75, 0.75])];
  plate(c, sab, UM.rust, { tone: t });
}

/**
 * A skull drawn for key art at radius `r`: a pale cranium lit from the top-left, deep sockets
 * with a point of green, the nasal hole, the cheekbones, the teeth, the jaw; with a hat or not.
 */
function keySkull(c: Paper, at: P2, r: number, ang: number, hat: 'kettle' | null): void {
  ang = snapDeg(ang);
  const R = (p: P2): P2 => addP(at, rot(mul(p, r), ang * DEG));
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.blob(at, r, r * 0.88, UM.bone, {
    tone: 3,
    detail: (x, y) => {
      const [fx, fy] = rot([(x + 0.5 - cx) / (L * r), (y + 0.5 - cy) / (L * r)], -ang * DEG);
      for (const ox of [-0.18, 0.42]) {
        const e = Math.hypot(fx - ox, (fy - 0.05) * 1.15);
        if (e < 0.27) return e < 0.1 && ox > 0 ? code(UM.glow, 4) : code(UM.ink, 0);
      }
      if (Math.abs(fx - 0.14) < 0.09 && fy > 0.25 && fy < 0.48) return code(UM.ink, 1);
      if (fy > 0.3 && fx < -0.3) return code(UM.bone, 1); // the cheek turned from the light
      if (fx > 0.65 && fy > -0.1) return code(UM.bone, 2);
      return -1;
    },
  });
  // The jaw, hung a little open: the upper teeth, a dark gap, the lower teeth on the jawbone.
  c.shape([R([-0.4, 0.42]), R([0.8, 0.38]), R([0.78, 1.2]), R([0.35, 1.32]), R([-0.35, 1.2])], (x, y) => {
    const ly = c.ly(y) / (c.L * r);
    const tooth = (c.lx(x) % 3) !== 2;
    if (ly < 0.22) return tooth ? code(UM.bone, 4) : code(UM.ink, 0);
    if (ly < 0.36) return code(UM.ink, 0);
    if (ly < 0.55) return tooth ? code(UM.bone, 4) : code(UM.ink, 0);
    return code(UM.bone, ly > 0.68 ? 1 : 2);
  });
  if (hat === 'kettle') {
    // The kettle hat: a low rusted crown, a wide brim tilted to show the face.
    // The kettle hat: a round bowl, a riveted band at its foot, a broad straight brim angled a
    // little down all round (its far side in shade, its near edge catching the light).
    const brim: P2[] = [R([-1.75, -0.3]), R([-1.2, -0.62]), R([1.3, -0.66]), R([1.85, -0.36]), R([1.7, -0.18]), R([-1.6, -0.12])];
    plate(c, brim, UM.rust, { tone: 2, detail: (_x, _y, rx, ry) => (ry > 0.45 ? code(UM.rust, 1) : ry < -0.4 && rx < 0.4 ? code(UM.rust, 4) : -1) });
    c.blob(R([0.05, -1.15]), 1.0 * r, 0.62 * r, UM.rust, {
      tone: 2,
      detail: (x, y, nx, ny) => {
        if (ny > 0.1) return -2; // the lower half of the ellipse is under the brim
        if (Math.hypot(nx + 0.4, ny + 0.55) < 0.28) return code(UM.rust, 4);
        if (c.tex(x, y, 561, 3) < 0.1) return code(UM.iron, 1);
        return -1;
      },
    });
    c.rod(R([-0.95, -0.72]), R([1.05, -0.74]), 0.3, 0.3, UM.iron, { tone: 1 });
    rivets(c, R([-0.8, -0.73]), R([0.95, -0.75]), 4);
  }
}

/** A leg in rag breeches bound with pale linen wraps from knee to ankle, a leather boot. */
function wrappedLeg(c: Paper, hip: P2, knee: P2, ank: P2, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, hip, knee, 1.45, 1.2, UM.rag, { tone: t, caps: false });
  vol(c, knee, ank, 1.05, 0.9, UM.bone, {
    tone: t,
    caps: false,
    detail: (_x, y, u) => ((c.ly(y) % Math.max(3, Math.round(c.L * 0.45))) === 0 ? code(UM.bone, t - 1) : u < -0.3 ? code(UM.bone, t + 1) : -1),
  });
  c.blob(knee, 0.62, 0.55, UM.rag, { tone: t });
  plate(c, [addP(ank, [-0.7, -0.4]), addP(ank, [0.5, -0.45]), addP(ank, [1.3, 0.35]), addP(ank, [1.25, 0.75]), addP(ank, [-0.75, 0.75])], UM.leather, { tone: t });
}

/**
 * An open bascinet: a rounded, pointed black-iron skull-cap with a riveted brow band, a mail
 * aventail falling to the shoulders, and the face open so the skull grins out of it.
 */
function bascinet(c: Paper, at: P2, m: number = UM.iron): void {
  // The aventail: mail from the helm's rim over the neck and shoulders.
  plate(c, [addP(at, [-1.5, 0.0]), addP(at, [1.7, 0.0]), addP(at, [2.0, 1.9]), addP(at, [-1.7, 2.0])], UM.mail, { detail: (x, y, rx, ry) => mailShade(c, x, y, rx, ry) });
  keySkull(c, addP(at, [0.1, 0.2]), 1.1, -4, null);
  // The bowl: rounded, rising to a point at the back, lit top-left, a specular streak.
  plate(c, [addP(at, [-1.35, -0.1]), addP(at, [-1.3, -1.0]), addP(at, [-0.5, -1.9]), addP(at, [-0.2, -2.6]), addP(at, [0.6, -1.7]), addP(at, [1.4, -0.9]), addP(at, [1.5, -0.25]), addP(at, [0.9, -0.55]), addP(at, [-0.6, -0.5])], m, { tone: 2, k: 0.3 });
  c.rod(addP(at, [-1.3, -0.35]), addP(at, [1.45, -0.5]), 0.32, 0.32, UM.rust, { tone: 2 });
  rivets(c, addP(at, [-1.1, -0.38]), addP(at, [1.3, -0.5]), 4);
}

/** A mail coif framing the skull's face to the shoulders, under a dented iron skullcap. */
function coif(c: Paper, at: P2): void {
  plate(c, [addP(at, [-1.5, -0.6]), addP(at, [-0.8, -1.55]), addP(at, [0.7, -1.6]), addP(at, [1.6, -0.8]), addP(at, [1.9, 1.9]), addP(at, [-1.8, 2.0])], UM.mail, { detail: (x, y, rx, ry) => mailShade(c, x, y, rx, ry) });
  keySkull(c, addP(at, [0.15, 0.2]), 1.08, -4, null);
  // The skullcap: a low dome with a dent and a rivet at the brow.
  c.blob(addP(at, [0.05, -0.95]), 1.3, 0.75, UM.iron, {
    tone: 2,
    detail: (_x, _y, nx, ny) => {
      if (ny > 0.25) return -2;
      if (Math.hypot(nx + 0.35, ny + 0.5) < 0.22) return code(UM.iron, 4);
      if (Math.hypot(nx - 0.35, ny + 0.2) < 0.2) return code(UM.iron, 0); // the dent
      return -1;
    },
  });
  c.rod(addP(at, [-1.25, -0.82]), addP(at, [1.3, -0.86]), 0.3, 0.3, UM.rust, { tone: 2 });
}

/** A skull scaled up for key art (r ≈ 1.15 units): the Legionary's skull and kettle hat, larger. */
function bigSkull(c: Paper, at: P2, ang: number, hat: boolean): void {
  // The shared skull is r = 1; draw it, then the hat a little wider.
  skull(c, at, ang, false);
  if (hat) helm(c, addP(at, [0, -0.05]), ang);
}

// ------------------------------------------------------------------ registry

export const STATIC_KINDS: Record<number, { body: 'foot' | 'horse' | 'beast' | 'engine'; draw: (c: Paper) => void }> = {
  0: { body: 'foot', draw: legionary },
};


/** A gaunt limb of grey dead flesh, as a volume: sinew over bone, a knob at the joint. */
function fleshVol(c: Paper, a: P2, b: P2, wa: number, wb: number, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, a, b, wa, wb, UM.flesh, { tone: t + 1, caps: false, detail: (x, y, u) => (u > -0.2 && c.tex(x, y, 471, 3) < 0.1 ? code(UM.flesh, t) : -1) });
  c.blob(b, wb * 0.62, wb * 0.58, UM.flesh, { tone: t });
}

/** The Ghoul Spearman: a hunched, sinewy corpse-eater with a long spear and a rag tied under the blade. */
function ghoulStatic(c: Paper): void {
  const neck: P2 = [1.6, -10.0], pel: P2 = [-0.3, -5.9];
  // The far leg and the far arm on the haft.
  fleshVol(c, [0.6, -5.8], [2.2, -3.2], 1.35, 0.95, true);
  fleshVol(c, [2.2, -3.2], [1.6, -0.6], 0.9, 0.7, true);
  c.rod([1.6, -0.6], [2.9, -0.2], 0.5, 0.3, UM.flesh, { tone: 1 });
  fleshVol(c, [2.5, -9.6], [3.6, -7.6], 1.0, 0.8, true);
  fleshVol(c, [3.6, -7.6], [2.6, -6.4], 0.8, 0.65, true);
  // The loincloth.
  rag(c, [-1.6, -6.4], [1.2, -6.3], 2.7, 0.2, UM.rag, UM.rag, 473, { tear: 0.4 });
  // The torso: a hunched mass, the spine's knobs along the back, ribs standing out.
  const s: P2 = [neck[0] - pel[0], neck[1] - pel[1]];
  const n: P2 = mul([-s[1], s[0]], 1 / Math.hypot(...s));
  const at = (t: number, w: number): P2 => addP(addP(pel, mul(s, t)), mul(n, w));
  const ts = [0, 0.25, 0.5, 0.75, 1.0];
  const back = [1.05, 1.25, 1.55, 1.65, 1.2];
  const front = [1.15, 0.95, 1.2, 1.5, 1.3];
  const pts: P2[] = [...ts.map((t, i) => at(t, front[i]!)), at(1.12, 0.3), ...ts.map((t, i) => at(t, -back[i]!)).reverse()];
  plate(c, pts, UM.flesh, {
    tone: 2,
    detail: (x, y, rx, ry) => {
      const dx = (x + 0.5 - c.sx(pel[0])) / c.L, dy = (y + 0.5 - c.sy(pel[1])) / c.L;
      const t = (dx * s[0] + dy * s[1]) / Math.hypot(...s) ** 2, w = dx * n[0] + dy * n[1];
      if (t > 0.4 && t < 0.88 && w > -0.4) {
        const r = (t * Math.hypot(...s)) % 0.68;
        if (r < 0.14) return code(UM.flesh, 1);
        if (r < 0.28) return code(UM.flesh, 3);
      }
      if (w > 0.6 && t < 0.4) return code(UM.flesh, 1);
      const lt = planeLight(rx, ry, 0.35);
      return code(UM.flesh, 2 + lt);
    },
  });
  for (let i = 1; i < 6; i++) c.blob(at(i / 6, -back[Math.min(4, Math.round((i / 6) * 4))]! + 0.1), 0.3, 0.26, UM.flesh, { tone: 3 });
  // The near leg: a bent, sinewy thigh, a long shin, a clawed foot.
  fleshVol(c, [-1.0, -5.8], [-0.3, -3.1], 1.45, 1.0, false);
  fleshVol(c, [-0.3, -3.1], [-1.1, -0.6], 0.95, 0.7, false);
  c.rod([-1.1, -0.6], [0.4, -0.15], 0.6, 0.3, UM.flesh, { tone: 2 });
  // The head, thrust forward.
  ghoulHead(c, [2.6, -10.7], -10, false);
  // The spear, upright, and the near arm gripping it.
  const hand: P2 = [3.3, -7.3];
  spear(c, hand, 174, 9.5, 5.6, { blade: 2.0, rag: true, sway: 0 });
  fleshVol(c, [0.9, -9.7], [2.0, -7.5], 1.1, 0.85, false);
  fleshVol(c, [2.0, -7.5], hand, 0.85, 0.7, false);
  c.blob(hand, 0.55, 0.5, UM.flesh, { tone: 2 });
  for (const d of [-20, 10]) c.rod(hand, along(hand, 120 + d, 0.7), 0.2, 0.08, UM.bone, { tone: 3 });
}

/** A skeleton's bone for key art: never under three pixels at level 8, knobbed at the joint. */
function stout(c: Paper, a: P2, b: P2, w: number, far: boolean): void {
  bone(c, a, b, w, w * 0.95, far ? 1 : 2);
}

/** The Bone-Thrower: a gaunt hooded skeleton in a rotted jerkin and cape, a fan of bone javelins on the back. */
function throwerStatic(c: Paper): void {
  // The cape behind and the fan of javelins over the shoulder.
  rag(c, [-2.4, -11.3], [1.0, -11.5], 8.4, -0.4, UM.rag, UM.rag, 481, { tear: 0.3, folds: true, spread: 0.6 });
  quiver(c, [-1.4, -9.8], 195, { shafts: 3, len: 2.6, bone: true });
  // Far leg and arm.
  stout(c, [1.0, -6.4], [1.6, -3.5], 0.6, true);
  stout(c, [1.6, -3.5], [1.7, -0.7], 0.5, true);
  c.rod([1.7, -0.7], [2.6, -0.3], 0.5, 0.3, UM.bone, { tone: 1 });
  stout(c, [2.1, -11.0], [2.9, -8.7], 0.55, true);
  stout(c, [2.9, -8.7], [3.0, -6.8], 0.48, true);
  // The pelvis and the jerkin over the ribs, a team sash and loincloth.
  c.blob([0.2, -6.4], 1.4, 0.7, UM.bone, { tone: 2 });
  plate(c, [[-2.0, -11.2], [-0.8, -11.8], [1.6, -11.8], [2.5, -11.0], [2.2, -8.0], [1.8, -6.6], [-1.4, -6.6], [-1.8, -8.4]], UM.leather, {
    detail: (x, y, rx, ry) => {
      // Rotted open over the ribs.
      const hx = (x - c.sx(0.6)) / c.L, hy = (y - c.sy(-9.6)) / c.L;
      if (Math.hypot(hx / 0.9, hy / 1.4) < 1) return Math.abs(((hy + 2) % 0.62) - 0.31) < 0.15 ? code(UM.bone, hx < 0 ? 3 : 2) : code(UM.ink, 1);
      if (c.ly(y) % Math.max(3, Math.round(c.L * 0.7)) === 0) return code(UM.leather, 1);
      return code(UM.leather, 2 + planeLight(rx, ry, 0.35));
    },
  });
  rag(c, [-1.4, -6.9], [1.9, -7.0], 3.0, 0.2, UM.team, UM.teamDk, 483, { tear: 0.45 });
  c.rod([-1.7, -11.0], [1.7, -7.0], 0.6, 0.6, UM.team, { tone: 2 });
  // The near leg.
  stout(c, [-0.6, -6.3], [-0.9, -3.5], 0.62, false);
  stout(c, [-0.9, -3.5], [-1.1, -0.7], 0.52, false);
  c.rod([-1.1, -0.7], [0.0, -0.25], 0.55, 0.32, UM.bone, { tone: 2 });
  // The hooded skull.
  c.rod([0.3, -11.9], [0.5, -12.5], 0.5, 0.45, UM.bone, { tone: 1 });
  hood(c, [0.8, -13.2], -4, false, UM.rag, { skullFace: true });
  // The near arm, cocked with a javelin over the shoulder.
  const hand: P2 = [-2.6, -10.6];
  boneJavelin(c, hand, 100, 6.4);
  stout(c, [-1.7, -11.0], [-2.9, -9.0], 0.58, false);
  stout(c, [-2.9, -9.0], hand, 0.5, false);
  c.blob(hand, 0.5, 0.45, UM.bone, { tone: 2 });
}

/** The Wraith Bow: a tall hooded shroud with a skull's grin in the dark, a man-high war bow. */
function wraithStatic(c: Paper): void {
  // The far sleeve and bony hand reaching to the bow's grip.
  const grip: P2 = [4.0, -8.8];
  vol(c, [2.2, -11.0], [3.4, -9.4], 1.4, 1.2, UM.shroud, { tone: 1, caps: false });
  c.rod([3.4, -9.4], grip, 0.45, 0.4, UM.bone, { tone: 1 });
  // The shroud: broad at the shoulders, falling in heavy folds to torn wisps over the ground.
  robe(c, [0.3, -11.3], 4.6, 5.6, 10.6, 0.3, UM.shroud, 491, { wisp: true });
  // The team stole over the shoulders.
  rag(c, [-2.3, -11.3], [2.6, -11.4], 2.4, 0.1, UM.team, UM.teamDk, 493, { tear: 0.55 });
  // The cowl.
  hood(c, [0.8, -12.9], -4, false, UM.shroud, { skullFace: true });
  // The bow, and the near arm drawing to the cheek.
  const nock = bow(c, grip, 96, 1.6, 10, { arrow: true, mat: UM.wood });
  vol(c, [-1.9, -11.0], [-1.0, -9.3], 1.45, 1.25, UM.shroud, { tone: 2, caps: false });
  c.rod([-1.0, -9.3], nock, 0.45, 0.4, UM.bone, { tone: 2 });
  c.blob(nock, 0.42, 0.38, UM.bone, { tone: 2 });
}

/** The Revenant Arbalest: a quilted, rotted gambeson, a kettle hat, the great skull pavise on the back, a crossbow. */
function arbalestStatic(c: Paper): void {
  pavise(c, [-1.4, -10.4], -6, false, 1.35);
  // The far leg and arm (to the fore-stock).
  wrappedLeg(c, B.hipF, B.kneeF, B.ankF, true);
  const grip: P2 = [-0.4, -7.8];
  const deg = 88;
  vol(c, B.shF, [3.0, -9.0], 1.35, 1.15, UM.rag, { tone: 1, caps: false });
  c.rod([3.0, -9.0], along(grip, deg, 2.6), 0.5, 0.45, UM.bone, { tone: 1 });
  // The gambeson: quilted channels, rotted through in places, a belt with a bolt case.
  const pts: P2[] = [[-2.5, -11.1], [-1.2, -11.9], [1.7, -11.9], [2.8, -11.1], [2.6, -8.6], [2.4, -5.3], [-2.4, -5.2], [-2.2, -8.6]];
  const y1 = c.sy(-5.2);
  plate(c, pts, UM.rag, {
    detail: (x, y, rx, ry) => {
      if (y1 - y < c.L * 0.8 && hash(Math.floor(c.lx(x) / Math.max(2, c.L * 0.6)), 5, 495) * c.L * 0.8 > y1 - y) return -2;
      const hx = (x - c.sx(1.3)) / c.L, hy = (y - c.sy(-9.6)) / c.L;
      if (Math.hypot(hx / 0.7, hy / 1.0) < 1) return Math.abs(((hy + 2) % 0.62) - 0.31) < 0.14 ? code(UM.bone, 2) : code(UM.ink, 1);
      const lt = planeLight(rx, ry, 0.35);
      // Quilted channels running down, stitched across every few rows (not a plaid).
      if (c.lx(x) % Math.max(3, Math.round(c.L * 0.75)) === 0) return code(UM.rag, 1 + Math.min(0, lt));
      if (c.ly(y) % Math.max(4, Math.round(c.L * 1.2)) === 0 && (c.lx(x) & 1) === 0) return code(UM.rag, 1 + Math.min(0, lt));
      return code(UM.rag, 2 + lt);
    },
  });
  belt(c, B.waistY, -2.2, 2.5);
  quiver(c, [-2.2, -6.4], 160, { shafts: 3, len: 2.0 });
  wrappedLeg(c, B.hipN, B.kneeN, B.ankN, false);
  coif(c, B.head);
  // The crossbow levelled at the hip, the near arm on the stock.
  crossbow(c, grip, deg, true, 1.45);
  vol(c, B.shN, [-2.6, -9.0], 1.35, 1.15, UM.rag, { tone: 2, caps: false });
  c.rod([-2.6, -9.0], grip, 0.52, 0.46, UM.bone, { tone: 2 });
  c.blob(grip, 0.55, 0.5, UM.bone, { tone: 2 });
}

/** The Death Knight: full black plate on a bone-barded horse, a great helm, the big kite shield, a lance. */
function deathKnightStatic(c: Paper): void {
  const p = { ...poseAt(DEATH_KNIGHT_KEYS, Anim.Idle, 0), neck: 47, nod: -16 };
  const H = horseFrame(c, p, false);
  const S = H.seat;
  const at = (q: P2): P2 => addP(S, q);
  horseFar(c, H, p, { bard: true });
  // The far leg in plate (mostly hidden by the horse).
  vol(c, at([0.9, -0.2]), at([2.4, 2.0]), 1.4, 1.1, UM.iron, { tone: 1 });
  horseBody(c, H, p, { bard: true });
  // The kite shield on the far arm, held tight before the chest.
  const shF = at([2.0, -4.6]);
  vol(c, shF, at([3.0, -2.6]), 1.4, 1.2, UM.iron, { tone: 1 });
  // The body: a broad black cuirass, a fauld of lames, a team surcoat skirt over the saddle.
  rag(c, at([-1.2, -1.2]), at([2.0, -1.2]), 2.8, 0.1, UM.team, UM.teamDk, 501, { tear: 0.35 });
  plate(c, [at([-1.9, -4.7]), at([-0.7, -5.6]), at([2.0, -5.6]), at([2.9, -4.7]), at([2.5, -2.4]), at([2.2, -0.9]), at([-1.2, -0.9]), at([-1.6, -2.4])], UM.iron, {
    detail: (x, y, rx, ry) => {
      if (ry > 0.45) return c.ly(y) % Math.max(3, Math.round(c.L * 0.5)) === 0 ? code(UM.iron, 0) : code(UM.iron, 2 + Math.min(0, planeLight(rx, ry)));
      if (Math.abs(rx + 0.1 + ry * 0.1) < 0.06) return code(UM.iron, 3); // the ridge
      if (c.tex(x, y, 503, 3) < 0.06) return code(UM.rust, 1);
      return -1;
    },
    k: 0.3,
  });
  // The great helm with a team crest, the visor slit glowing.
  bascinet(c, at([0.75, -6.95]));
  // Pauldrons.
  pauldron(c, at([2.1, -4.9]), true, 1.05);
  kiteShield(c, at([2.5, -2.7]), 6.0, 3.8, -6);
  // The near leg in plate over the barding.
  vol(c, at([-0.6, -0.2]), at([1.0, 2.3]), 1.55, 1.2, UM.iron, { tone: 2, shine: true });
  vol(c, at([1.0, 2.3]), at([0.4, 4.6]), 1.1, 1.0, UM.iron, { tone: 2 });
  c.blob(at([1.0, 2.3]), 0.7, 0.62, UM.iron, { tone: 2 });
  horseNear(c, H, p, { bard: true });
  // The lance, upright with its pennon, and the armoured near arm.
  const hand = at([-1.0, -2.0]);
  lance(c, hand, 174, 10.5, 3.0, { pennon: true, sway: 0.3, vamplate: true });
  pauldron(c, at([-1.4, -4.6]), false, 1.15);
  vol(c, at([-1.4, -4.4]), at([-2.0, -2.8]), 1.3, 1.1, UM.iron, { tone: 2 });
  vol(c, at([-2.0, -2.8]), hand, 1.05, 1.1, UM.iron, { tone: 2, shine: true });
}


// ------------------------------------------------------------------ the Wraith-Warden (Wraith Bows, recast)
//
// After the user's hooded wraith-knight target, made our own: a tall, gaunt warden of the barrow
// in deep violet with bronze trim (a new note in the Undead palette beside rust and soul-fire
// green), a pointed hood framing a cracked bone death-mask with one vertical slit of green fire,
// swept bone horns rising from layered pauldrons, a bronze-buckled belt with a hanging tabard,
// violet gauntlets and greaves, a ragged cloak to the ground, and a bone longbow with a
// green-fire arrow on the string.

const VIOLET = defineMaterial('undead.violet', oklchRamp({ l: 0.36, c: 0.11, h: 300, spread: 0.085 }));
const BRONZE = defineMaterial('undead.bronze', oklchRamp({ l: 0.6, c: 0.1, h: 68, spread: 0.11 }));

/** Bronze trim along a line (a 1-2 px band, lit on its upper side). */
function trim(c: Paper, a: P2, b: P2, w = 0.28): void {
  c.rod(a, b, w, w, BRONZE, { tone: 3 });
}

/** A layered violet pauldron, three lames edged in bronze, and a swept bone horn rising from it. */
function hornedPauldron(c: Paper, sh: P2, far: boolean, horn: number): void {
  const t = far ? 1 : 2;
  // The horn first (it rises behind the plates): a curved, tapering spike of bone.
  const h0 = addP(sh, [far ? 0.4 : -0.4, -0.3]);
  const h1 = addP(h0, [horn * 0.5, -1.6]), h2 = addP(h1, [horn * 0.9, -1.2]), h3 = addP(h2, [horn * 0.2, -1.0]);
  c.rod(h0, h1, 0.7, 0.5, UM.bone, { tone: far ? 2 : 3 });
  c.rod(h1, h2, 0.5, 0.32, UM.bone, { tone: far ? 2 : 3 });
  c.rod(h2, h3, 0.32, 0.08, UM.bone, { tone: far ? 1 : 2 });
  for (const [dy, rx, ry] of [[0.9, 1.05, 0.45], [0.42, 1.25, 0.55], [-0.12, 1.4, 0.72]] as [number, number, number][]) {
    c.blob(addP(sh, [0, dy]), rx, ry, VIOLET, {
      tone: t + 1,
      detail: (_x, _y, nx, ny) => {
        if (ny > 0.62) return code(BRONZE, far ? 1 : 2); // the bronze edge of each lame
        if (ny < -0.55 && nx < 0.2 && !far) return code(VIOLET, 4);
        return -1;
      },
    });
  }
}

/** The death-mask: a pale cracked bone visor, oval, with a single vertical slit of green fire. */
function deathMask(c: Paper, at: P2, r: number): void {
  const cx = c.sx(at[0]), cy = c.sy(at[1]), L = c.L;
  c.blob(at, r * 0.78, r, UM.bone, {
    tone: 3,
    detail: (x, y) => {
      const fx = (x + 0.5 - cx) / (L * r), fy = (y + 0.5 - cy) / (L * r);
      // The slit, burning.
      if (Math.abs(fx - 0.08) < 0.09 && fy > -0.55 && fy < 0.45) return code(UM.glow, Math.abs(fy + 0.05) < 0.25 ? 4 : 3);
      if (Math.abs(fx - 0.08) < 0.17 && fy > -0.6 && fy < 0.5) return code(UM.ink, 0);
      // Cracks: a jagged line across the brow and one down the cheek.
      if (Math.abs(fy + 0.35 - Math.abs(fx + 0.3) * 0.5) < 0.05 && fx < 0.0) return code(UM.ink, 1);
      if (Math.abs(fx + 0.38 - fy * 0.25) < 0.05 && fy > 0.05 && fy < 0.7) return code(UM.ink, 1);
      // Light from the top-left, the far cheek in shade.
      if (fx > 0.45 || fy > 0.7) return code(UM.bone, 1);
      if (fx < -0.2 && fy < -0.2) return code(UM.bone, 4);
      return -1;
    },
  });
}

function wardenStatic(c: Paper): void {
  const neck: P2 = [0.4, -12.6];
  // The cloak behind: from the shoulders, falling to the ground, ragged.
  robe(c, [0.3, -12.0], 5.6, 7.2, 12.0, -0.2, VIOLET, 551, {});
  // The far leg: dark cloth, a violet greave with a bronze rim, a boot.
  vol(c, [1.0, -6.6], [1.5, -3.6], 1.2, 1.0, UM.shroud, { tone: 1, caps: false });
  vol(c, [1.5, -3.6], [1.7, -0.6], 1.05, 0.95, VIOLET, { tone: 2, caps: false });
  trim(c, [1.0, -3.6], [2.0, -3.6]);
  plate(c, [[1.1, -0.9], [2.3, -0.9], [2.9, -0.05], [1.0, -0.05]], UM.leather, { tone: 1 });
  // The far arm holding out the bow: a violet sleeve and a gauntlet with a bronze cuff.
  const grip: P2 = [4.7, -8.6];
  vol(c, [2.3, -11.3], [3.5, -9.7], 1.25, 1.05, VIOLET, { tone: 1, caps: false });
  vol(c, [3.5, -9.7], grip, 1.0, 0.95, VIOLET, { tone: 2, caps: false });
  trim(c, addP(grip, [-0.9, -0.15]), addP(grip, [-0.75, 0.55]), 0.3);
  // The body: a violet coat narrow at the waist, a high collar, layered lames at the chest.
  plate(c, [[-1.9, -11.6], [-0.8, -12.3], [1.6, -12.3], [2.5, -11.5], [2.0, -9.2], [1.4, -7.3], [-0.9, -7.3], [-1.5, -9.2]], VIOLET, {
    detail: (x, y, rx, ry) => {
      if (ry < 0.2 && ry > -0.7 && (c.ly(y) % Math.max(3, Math.round(c.L * 0.8))) === 0) return code(VIOLET, 1);
      if (Math.abs(rx + 0.05) < 0.05) return code(BRONZE, 2); // the clasp line
      return code(VIOLET, 2 + planeLight(rx, ry, 0.35));
    },
  });
  // The belt and its bronze buckle; the tabard hanging from it.
  c.rod([-1.4, -7.45], [1.9, -7.5], 0.6, 0.6, UM.leather, { tone: 1 });
  plate(c, [[-0.1, -7.85], [1.1, -7.85], [1.1, -7.0], [-0.1, -7.0]], BRONZE, { tone: 3, detail: (x, y, rx, ry) => (Math.abs(rx) < 0.4 && Math.abs(ry) < 0.4 ? code(UM.leather, 1) : -1) });
  rag(c, [-0.3, -7.1], [1.3, -7.1], 5.0, 0.15, VIOLET, VIOLET, 553, { tear: 0.25, folds: false });
  trim(c, [-0.3, -7.0], [-0.25, -3.2], 0.22);
  trim(c, [1.3, -7.0], [1.35, -3.2], 0.22);
  c.rod([0.5, -6.9], [0.55, -3.4], 0.32, 0.3, UM.team, { tone: 2 });
  // The near leg.
  vol(c, [-0.7, -6.6], [-0.9, -3.6], 1.3, 1.05, UM.shroud, { tone: 2, caps: false });
  vol(c, [-0.9, -3.6], [-1.0, -0.6], 1.15, 1.0, VIOLET, { tone: 3, caps: false });
  trim(c, [-1.55, -3.6], [-0.35, -3.6]);
  plate(c, [[-1.6, -0.9], [-0.4, -0.9], [0.4, -0.05], [-1.7, -0.05]], UM.leather, { tone: 2 });
  // The pauldrons with their horns, the far one first.
  hornedPauldron(c, [2.2, -11.6], true, 1);
  // The hood: tall and pointed, deep violet, its rim lit, the death-mask inside.
  const hd: P2 = [0.75, -13.7];
  plate(c, [addP(hd, [-1.6, 1.6]), addP(hd, [-1.7, 0.0]), addP(hd, [-1.0, -1.5]), addP(hd, [0.1, -2.6]), addP(hd, [1.1, -1.6]), addP(hd, [1.7, -0.2]), addP(hd, [1.7, 1.6])], VIOLET, {
    detail: (x, y, rx, ry) => {
      const fx = (x + 0.5 - c.sx(hd[0] + 0.15)) / c.L, fy = (y + 0.5 - c.sy(hd[1] + 0.2)) / c.L;
      const e = Math.hypot(fx / 1.05, fy / 1.35);
      if (e < 1) return code(UM.ink, 0); // the dark inside of the hood
      if (e < 1.18) return code(VIOLET, fx < 0.3 && fy < 0.6 ? 4 : 2); // the lit rim
      return code(VIOLET, 2 + planeLight(rx, ry, 0.3));
    },
  });
  deathMask(c, addP(hd, [0.15, 0.25]), 1.05);
  hornedPauldron(c, [-1.6, -11.4], false, -1);
  // The bone longbow, a green-fire arrow on the string, the near arm drawing to the cheek.
  const nock = bow(c, grip, 93, 1.5, 9.5, { arrow: true, mat: UM.bone });
  flame(c, along(grip, 93, 1.6), 1.0, 0.25, { w: 0.4 });
  vol(c, [-1.4, -11.0], [-0.5, -9.4], 1.25, 1.05, VIOLET, { tone: 2, caps: false });
  vol(c, [-0.5, -9.4], nock, 1.0, 0.95, VIOLET, { tone: 3, caps: false });
  trim(c, addP(nock, [-0.55, -0.5]), addP(nock, [-0.75, 0.3]), 0.3);
  void neck;
}

/** Kinds whose animated drawing already carries its bulk: their idle frame is the key art. */
function idleOf<P>(keys: KeySet<P & import('./rig.ts').BasePose>, draw: (c: Paper, p: P, facing: 'se', anim: Anim, frame: number) => void): (c: Paper) => void {
  return (c) => lit(c, () => draw(c, poseAt(keys, Anim.Idle, 0) as P, 'se', Anim.Idle, 0));
}

/** The Barrow Horse Archer: a gaunt skeleton in a rotted leather jerkin, a quiver at the hip, a war bow. */
function horseArcherStatic(c: Paper): void {
  const p = { ...poseAt(HORSE_ARCHER_KEYS, Anim.Idle, 0), neck: 47, nod: -16 };
  const H = horseFrame(c, p, false);
  const at = (q: P2): P2 => addP(H.seat, q);
  horseFar(c, H, p, { cloth: true, mane: true });
  stout(c, at([0.9, -0.2]), at([2.2, 2.1]), 0.6, true);
  horseBody(c, H, p, { cloth: true, mane: true });
  // The pennon pole on the back.
  c.rod(at([-1.6, -3.2]), at([-2.4, -10.0]), 0.28, 0.24, UM.wood, { tone: 2 });
  c.shape([at([-2.4, -10.0]), at([-5.6, -9.4]), at([-4.6, -9.0]), at([-5.4, -8.5]), at([-2.4, -8.6])], (x, y) => (c.ly(y) < c.L * 0.5 ? code(UM.team, 3) : code(UM.team, 2)));
  // The far arm holding the bow out, the quiver at the hip.
  const grip = at([3.6, -3.6]);
  stout(c, at([1.9, -4.6]), at([2.9, -3.8]), 0.55, true);
  stout(c, at([2.9, -3.8]), grip, 0.5, true);
  quiver(c, at([-1.2, -0.6]), 215, { shafts: 4, len: 2.4 });
  // The pelvis, a rag skirt, the jerkin over the ribs, a team sash.
  c.blob(at([0.2, 0.2]), 1.4, 0.7, UM.bone, { tone: 2 });
  rag(c, at([-1.3, -0.5]), at([1.8, -0.6]), 2.4, 0.1, UM.rag, UM.rag, 511, { tear: 0.45 });
  plate(c, [at([-1.7, -4.6]), at([-0.6, -5.4]), at([1.6, -5.4]), at([2.4, -4.6]), at([2.0, -1.6]), at([1.7, -0.4]), at([-1.2, -0.4]), at([-1.5, -1.8])], UM.leather, {
    detail: (x, y, rx, ry) => {
      const hx = (x - c.sx(at([0.5, 0])[0])) / c.L, hy = (y - c.sy(at([0, -3.1])[1])) / c.L;
      if (Math.hypot(hx / 0.8, hy / 1.3) < 1) return Math.abs(((hy + 2) % 0.62) - 0.31) < 0.15 ? code(UM.bone, hx < 0 ? 3 : 2) : code(UM.ink, 1);
      if (c.ly(y) % Math.max(3, Math.round(c.L * 0.7)) === 0) return code(UM.leather, 1);
      return code(UM.leather, 2 + planeLight(rx, ry, 0.35));
    },
  });
  c.rod(at([-1.5, -4.5]), at([1.8, -0.7]), 0.55, 0.55, UM.team, { tone: 2 });
  stout(c, at([-0.5, -0.2]), at([1.0, 2.3]), 0.62, false);
  stout(c, at([1.0, 2.3]), at([0.3, 4.6]), 0.52, false);
  horseNear(c, H, p, { cloth: true, mane: true });
  c.rod(at([0.4, -5.4]), at([0.55, -6.0]), 0.5, 0.45, UM.bone, { tone: 1 });
  skull(c, at([0.8, -6.9]), -4, false);
  // The bow, half drawn, the near arm at the string.
  const nock = bow(c, grip, 96, 1.2, 7, { arrow: true });
  stout(c, at([-1.5, -4.6]), at([-0.9, -2.9]), 0.58, false);
  stout(c, at([-0.9, -2.9]), nock, 0.5, false);
  c.blob(nock, 0.48, 0.42, UM.bone, { tone: 2 });
}

/** The Black Rider: a hooded rider in a heavy grave-shroud that falls over the horse's flanks, a couched spear. */
function blackRiderStatic(c: Paper): void {
  const p = { ...poseAt(BLACK_RIDER_KEYS, Anim.Idle, 0), neck: 47, nod: -16 };
  const H = horseFrame(c, p, false);
  const at = (q: P2): P2 => addP(H.seat, q);
  horseFar(c, H, p, { mane: true });
  horseBody(c, H, p, { mane: true });
  // The far sleeve to the reins.
  vol(c, at([1.9, -4.5]), at([3.2, -2.6]), 1.4, 1.2, UM.shroud, { tone: 1, caps: false });
  c.rod(at([3.2, -2.6]), at([4.4, -2.0]), 0.42, 0.38, UM.bone, { tone: 1 });
  // The shroud: broad over the shoulders, a heavy fall over the flank, tatters streaming back.
  const pts: P2[] = [at([-2.0, -4.7]), at([-0.6, -5.6]), at([1.6, -5.6]), at([2.6, -4.6]), at([2.8, -1.0]), at([2.2, 2.6]), at([0.2, 3.3]), at([-1.8, 2.9]), at([-3.6, 3.2]), at([-3.1, 1.8]), at([-5.0, 1.6]), at([-3.0, -1.0])];
  plate(c, pts, UM.shroud, {
    detail: (x, y, rx, ry) => {
      // Heavy folds falling from the shoulders, the lit ridge beside each.
      const f = rx * 3 + ry * 0.6;
      const r = ((f % 1) + 1) % 1;
      if (ry > -0.5 && r < 0.12) return code(UM.shroud, 1);
      if (ry > -0.5 && r < 0.22) return code(UM.shroud, 3);
      if (c.tex(x, y, 521, 3) < 0.05) return -2;
      return code(UM.shroud, 2 + planeLight(rx, ry, 0.35));
    },
  });
  // A team sash across the chest and its knot.
  c.rod(at([-1.6, -4.6]), at([1.8, -1.6]), 0.7, 0.7, UM.team, { tone: 2 });
  rag(c, at([1.4, -1.9]), at([2.2, -1.9]), 2.6, -0.5, UM.team, UM.teamDk, 523, { folds: false, tear: 0.4 });
  hood(c, at([0.7, -7.0]), -4, false, UM.shroud, { eyes: false });
  // The skull plain in the hood's dark, a black-iron gorget under it.
  keySkull(c, at([1.0, -6.9]), 0.82, -6, null);
  plate(c, [at([-0.6, -5.75]), at([1.9, -5.8]), at([1.7, -5.25]), at([-0.4, -5.2])], UM.iron, { tone: 2, rim: true });
  pauldron(c, at([2.0, -5.0]), true, 0.95);
  horseNear(c, H, p, { mane: true });
  // The spear couched under the near arm, the arm in its sleeve.
  const hand = at([1.6, -2.6]);
  spear(c, hand, 116, 8.2, 3.6, { blade: 1.8 });
  vol(c, at([-1.7, -4.4]), at([-0.5, -2.6]), 1.5, 1.3, UM.shroud, { tone: 2, caps: false });
  vol(c, at([-0.5, -2.6]), hand, 1.3, 1.0, UM.shroud, { tone: 2, caps: false });
  // A black-iron gauntlet on the spear, and the near pauldron over the shroud.
  vol(c, addP(hand, [-0.9, -0.2]), hand, 0.9, 1.05, UM.iron, { tone: 2, shine: true, caps: false });
  c.blob(hand, 0.55, 0.5, UM.iron, { tone: 1 });
  pauldron(c, at([-1.6, -4.7]), false, 1.0);
}

/** A skull worn as a pauldron (the Necromancer's): a big pale skull over the shoulder, its jaw a lip. */
function skullPauldron(c: Paper, at: P2, r: number, far: boolean): void {
  c.blob(addP(at, [0.1, r * 0.55]), r * 1.05, r * 0.45, UM.bone, { tone: far ? 1 : 2 });
  c.blob(at, r, r * 0.85, UM.bone, {
    tone: far ? 2 : 3,
    detail: (_x, _y, nx, ny) => {
      for (const ox of [-0.3, 0.35]) if (Math.hypot(nx - ox, ny + 0.05) < 0.24) return code(UM.ink, 0);
      if (Math.abs(nx - 0.02) < 0.08 && ny > 0.2 && ny < 0.45) return code(UM.ink, 1);
      if (ny > 0.62) return code(UM.bone, 1);
      return -1;
    },
  });
}

/** The Lich-Marshal: broad in a heavy mantle with skull pauldrons, robed to the ground, the crown, the bone staff. */
function lichStatic(c: Paper): void {
  const p = poseAt(LICH_KEYS, Anim.Idle, 0);
  const F = frameOf(c, p, false, { k: 1.12 });
  // The far hand, witchfire curling in it.
  const fh: P2 = [3.6, -6.9];
  vol(c, [2.6, -11.2], [3.5, -8.8], 1.5, 1.3, UM.shroud, { tone: 1, caps: false });
  c.rod([3.5, -8.8], fh, 0.45, 0.4, UM.bone, { tone: 1 });
  flame(c, addP(fh, [0.1, -0.2]), 1.6, 0.25, { w: 0.65 });
  collar(c, F, 0);
  // The robe: broad shoulders, heavy folds, a flared, torn hem on the ground.
  robe(c, [0.4, -11.4], 5.0, 6.4, 11.3, 0.2, UM.shroud, 531);
  lichChest(c, F, 0, 0.25);
  c.rod([-1.6, -6.9], [2.3, -7.0], 0.42, 0.42, UM.rust, { tone: 2 });
  // The mantle over the shoulders in team cloth, skull pauldrons on top.
  // The mantle: one heavy team-coloured cape over both shoulders, open at the chest, its
  // planes lit at the near shoulder and shaded down the far side, the hem torn.
  const mantleSide = (pts: P2[], seed: number) =>
    plate(c, pts, UM.team, {
      seed,
      detail: (x, y, rx, ry) => {
        const ys = c.sy(pts.reduce((m, q) => Math.max(m, q[1]), -99));
        if (ys - y < c.L * 0.9 && hash(Math.floor(c.lx(x) / Math.max(3, c.L * 0.7)), 2, seed) * c.L * 0.9 > ys - y) return -2;
        const f = ((rx * 2.2 + ry * 0.3) % 1 + 1) % 1;
        if (ry > -0.4 && f < 0.1) return code(UM.teamDk, 1);
        if (ry > -0.4 && f < 0.2) return code(UM.team, 3);
        const lt = planeLight(rx, ry, 0.3);
        return lt < 0 ? code(UM.teamDk, 2) : code(UM.team, 2 + lt);
      },
    });
  mantleSide([[-3.1, -11.2], [-1.7, -12.2], [-0.4, -12.0], [-0.6, -9.2], [-1.0, -6.4], [-3.4, -6.6]], 533);
  mantleSide([[1.5, -12.0], [2.9, -12.0], [3.8, -11.0], [3.7, -6.8], [1.7, -6.9], [1.8, -9.3]], 535);
  skullPauldron(c, [2.7, -11.4], 1.05, true);
  c.rod([0.4, -12.2], [0.6, -12.8], 0.55, 0.5, UM.bone, { tone: 1 });
  skull(c, [0.9, -13.4], -6, false);
  spineCrown(c, [0.9, -13.4], -6, false, 1.1);
  skullPauldron(c, [-2.1, -11.2], 1.2, false);
  // The staff of bone at the near side, its caged skull and witchfire; the sleeved arm on it.
  const hand: P2 = [-2.9, -7.0];
  const top = along(hand, 178, 7.4), foot = along(hand, -2, 7.0);
  c.rod(foot, top, 0.45, 0.38, UM.bone, { tone: 2, detail: (_x, _y, u, v) => (Math.abs(v - 0.72) < 0.02 || Math.abs(v - 0.8) < 0.02 ? code(UM.rust, 2) : u > -0.5 && Math.floor(v * 34) % 2 === 0 ? code(UM.bone, 1) : -1) });
  for (const d of [-35, 0, 35]) c.rod(along(top, -2, 0.4), along(along(top, 178 + d * 0.6, 1.4), 178 + d * 1.4, 0.55), 0.24, 0.08, UM.bone, { tone: d < 0 ? 3 : 2 });
  const sk = along(top, 178, 0.45);
  c.blob(sk, 0.7, 0.62, UM.bone, { tone: 3, detail: (_x, _y, nx, ny) => (Math.hypot(Math.abs(nx) - 0.35, ny - 0.05) < 0.28 ? code(UM.glow, 3) : ny > 0.55 ? code(UM.ink, 1) : -1) });
  flame(c, along(sk, 178, 0.45), 2.2, 0.25);
  vol(c, [-2.1, -10.8], [-3.4, -8.6], 1.6, 1.4, UM.shroud, { tone: 2, caps: false });
  vol(c, [-3.4, -8.6], hand, 1.4, 1.2, UM.shroud, { tone: 2, caps: false });
  c.blob(hand, 0.52, 0.46, UM.bone, { tone: 2 });
}

const bulky = (draw: (c: Paper) => void) => (c: Paper): void => withHorseBulk(1.45, () => draw(c));

Object.assign(STATIC_KINDS, {
  1: { body: 'foot', draw: ghoulStatic },
  2: { body: 'foot', draw: throwerStatic },
  3: { body: 'foot', draw: wardenStatic },
  4: { body: 'foot', draw: arbalestStatic },
  5: { body: 'horse', draw: bulky(blackRiderStatic) },
  6: { body: 'horse', draw: bulky(horseArcherStatic) },
  7: { body: 'horse', draw: bulky(deathKnightStatic) },
  8: { body: 'beast', draw: idleOf(COLOSSUS_KEYS, colossus) },
  9: { body: 'engine', draw: idleOf(TREBUCHET_KEYS, trebuchet) },
  10: { body: 'foot', draw: lichStatic },
});

// ------------------------------------------------------------------ key-art light

/** Bone washed in the green of the soul-fire: the light that the glow throws on bone and flesh nearby. */
const FIRELIT = defineMaterial('undead.firelit', oklchRamp({ l: 0.6, c: 0.05, h: 140, spread: 0.1 }));

/**
 * The key art's finishing light, after the figure is drawn:
 * - the soul-fire is a light source: bone, charred bone and flesh within reach of a glow pixel
 *   take its green (a tone lighter close to it);
 * - a rim light on hard edges turned from the key: metal and bone pixels on the bottom-right
 *   silhouette edge go a step lighter, so the figure separates from the dark field there too.
 */
export function keyLight(c: Paper): void {
  const { CW } = c;
  const glow: number[] = [];
  // Light sources are the bodies of fire (flames, the burning chest), not the eye points: a glow
  // pixel counts only inside a 5 x 5 patch of glow.
  const isGlow = (i: number) => c.pix[i]! >= 0 && c.pix[i]! >> 3 === UM.glow;
  for (let y = c.by0 + 2; y <= c.by1 - 2; y++)
    for (let x = c.bx0 + 2; x <= c.bx1 - 2; x++) {
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isGlow((y + dy) * CW + x + dx)) n++;
      if (n >= 22) glow.push(x, y);
    }
  const R = 2.2 * c.L;
  const lit = new Set([UM.bone, UM.char, UM.flesh]);
  const out = c.pix.slice();
  for (let y = c.by0; y <= c.by1; y++)
    for (let x = c.bx0; x <= c.bx1; x++) {
      const i = y * CW + x;
      const v = c.pix[i]!;
      if (v < 0) continue;
      const m = v >> 3;
      if (glow.length && lit.has(m)) {
        let d2 = Infinity;
        for (let k = 0; k < glow.length; k += 2) {
          const dx = glow[k]! - x, dy = glow[k + 1]! - y;
          const dd = dx * dx + dy * dy;
          if (dd < d2) d2 = dd;
        }
        if (d2 < R * R) {
          const near = d2 < (R * 0.45) ** 2;
          out[i] = code(FIRELIT, (v & 7) + (near ? 1 : 0));
          continue;
        }
      }
      if (isKept(m)) continue;
      const hard = m === UM.iron || m === UM.rust || m === UM.steel || m === UM.bone || m === UM.mail;
      const edge = (x + 1 <= c.bx1 && c.pix[i + 1]! < 0) || (y + 1 <= c.by1 && c.pix[i + CW]! < 0);
      const inner = c.pix[i - 1]! >= 0 && c.pix[i - CW]! >= 0;
      if (hard && edge && inner && (v & 7) <= 2) out[i] = (v & ~7) | ((v & 7) + 1);
    }
  c.pix.set(out);
}
