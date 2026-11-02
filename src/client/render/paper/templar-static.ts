// Templar key art: one static image per kind (idle, facing SE, level 8), drawn with the paper
// painter's primitives but placed by hand. Not registered with the painter and not used by the
// game: these are the approved looks the animated figures will be rebuilt from.
//
// The bulk brief (user targets: the D2R Paladin, the CraftPix knight): limbs are shaped volumes,
// not rods; broad shoulders and a solid layered torso; big shields held tight against the body;
// helms and mail with mass; massive horses under caparisons. At a figure height H of 14 units:
// upper arm ~0.09 H, forearm ~0.085 H, thigh ~0.11 H, shin ~0.085 H, shoulders ~0.36 H (0.45 H
// with padding or a mail cape), waist ~0.24 H; kite shield ~0.48 H x 0.3 H.

import { addP, code, DEG, hash, Paper, rot, type Mat, type P2 } from './core.ts';
import { factionPalette } from './index.ts';
import { BODIES, type BodyType } from './rig.ts';
import { at, beauseant, bow, crossbow, frameAt, isMail, lerp, local, mailTex, mul, paintAs, spear, sub, sword, TM } from './templar-parts.ts';

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
function vol(c: Paper, a: P2, b: P2, prof: Profile, m: Mat, o: VolOpts = {}): void {
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
    const ul = (u * maxW) / Math.max(0.05, halfAt(prof, Math.min(1, Math.max(0, v))));
    if (o.detail) {
      const r = o.detail(x, y, ul, v);
      if (r >= 0) return r;
    }
    if (isMail(m)) {
      const r = mailTex(c, x, y, ul < -0.3 ? -1 : ul > 0.45 ? 1 : 0, ul < -0.45 ? base + 1 : ul > 0.5 ? base - 1 : base, m);
      if (r >= 0) return r;
    }
    if (o.shine && ul > -0.62 && ul < -0.38 && v > 0.12 && v < 0.7) return code(m, base + 2);
    if (ul < -0.5 + c.band) return code(m, base + 1);
    if (ul > 0.48 + c.band) return code(m, base - 1);
    return code(m, base);
  }, { a: A, b: B, w: 2 * maxW * c.L });
}

/** A polygon in units with a shade callback that gets units relative to an origin. */
function shapeU(c: Paper, pts: P2[], o: P2, shade: (x: number, y: number, ux: number, uy: number) => number): void {
  c.shape(pts, (x, y) => shade(x, y, (x + 0.5 - c.sx(o[0])) / c.L, (y + 0.5 - c.sy(o[1])) / c.L));
}

const within = (c: Paper, d: number, half: number): boolean => Math.abs(d) * c.L < Math.max(0.55, half * c.L);

// ------------------------------------------------------------------ the man

export type SHelm = 'great' | 'gilded' | 'kettle' | 'nasal' | 'cap' | 'pilgrim' | 'turban';

/** A static man's dress. */
interface SKit {
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

/** One leg: a thigh with mass, the knee, a calf, the boot with its turned-down top, the foot. */
function legS(c: Paper, hip: P2, knee: P2, ank: P2, k: SKit, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, hip, knee, [[0, 0.82], [0.35, 0.8], [0.8, 0.66], [1, 0.62]], k.legs, { tone: t });
  // Knee: the mail bulges over a padded knee.
  c.blob(addP(knee, [0.05, 0.05]), 0.66, 0.6, k.legs, { tone: t, detail: isMail(k.legs) ? (x, y, nx) => mailTex(c, x, y, nx < -0.2 ? -1 : 0, t, k.legs) : undefined });
  vol(c, knee, ank, [[0, 0.6], [0.3, 0.66], [0.7, 0.5], [1, 0.45]], k.legs, { tone: Math.max(1, t - 1) });
  // Boot: ankle boot with a cuff, and the foot pointing forward.
  const top = lerp(knee, ank, 0.58);
  vol(c, top, ank, [[0, 0.55], [0.12, 0.6], [0.2, 0.53], [1, 0.5]], k.boots, { tone: t, detail: (_x, _y, _u, v) => (v < 0.14 ? code(k.boots, t + 1) : -1) });
  c.shape([addP(ank, [-0.5, -0.35]), addP(ank, [0.45, -0.3]), addP(ank, [1.35, 0.25]), addP(ank, [1.3, 0.55]), addP(ank, [-0.55, 0.55])], (_x, y) =>
    code(k.boots, y < c.sy(ank[1] + 0.05) ? t + 1 : y > c.sy(ank[1] + 0.4) ? t - 1 : t));
}

/** One arm: deltoid, upper arm, elbow, a forearm widening to the mitten or glove, the fist. */
function armS(c: Paper, sh: P2, el: P2, wr: P2, k: SKit, far: boolean): void {
  const t = far ? 1 : 2;
  vol(c, sh, el, [[0, 0.78], [0.25, 0.72], [0.75, 0.6], [1, 0.56]], k.sleeve, { tone: t });
  c.blob(el, 0.6, 0.58, k.sleeve, { tone: t });
  vol(c, el, wr, [[0, 0.56], [0.35, 0.62], [0.8, 0.54], [1, 0.58]], k.sleeve, { tone: t });
  c.blob(addP(wr, mul(sub(wr, el), 0.18)), 0.55, 0.52, k.hand, { tone: t });
}

/**
 * The torso: a solid mass, broad at the shoulders, the waist drawn in by the belt, the skirt of
 * the hauberk (or tunic) and the surcoat hanging to the knee with weight and folds.
 */
function torsoS(c: Paper, k: SKit, back: boolean): void {
  const garment = k.coat ?? k.body;
  // The hauberk skirt shows below the surcoat hem, split for riding.
  if (k.coat && isMail(k.body)) {
    shapeU(c, [[-2.0, -7.2], [2.0, -7.2], [2.25, -3.0], [-2.15, -3.0]], [0, -7], (x, y, ux, uy) => mailTex(c, x, y, ux < -1.2 ? -1 : ux > 1.2 ? 1 : 0, 2, k.body) >= 0 ? mailTex(c, x, y, ux < -1.2 ? -1 : ux > 1.2 ? 1 : 0, 2, k.body) : code(k.body, ux < -1.2 ? 3 : ux > 1.2 ? 1 : 2) + (uy > 3.6 ? -1 : 0));
  }
  const pts: P2[] = [
    [-0.75, -12.15], [0.85, -12.15], [2.45, -11.75], [2.6, -10.7], [2.3, -9.4], [1.75, -8.25], [1.85, -7.4],
    // Skirt: flares to the knee, the hem stepping down toward the back.
    [2.35, -5.2], [2.55, -3.6], [1.35, -3.25], [0.35, -3.45], [-0.85, -3.15], [-2.35, -3.35], [-2.2, -5.3],
    [-1.9, -7.4], [-1.8, -8.25], [-2.35, -9.4], [-2.6, -10.7], [-2.5, -11.75],
  ];
  const quilt = k.quilted ?? false;
  const crossX = back ? -0.3 : -0.45;
  shapeU(c, pts, [0, 0], (x, y, ux, uy) => {
    // Light: the upper left; the chest plane faces the viewer and catches it, the far flank and
    // the skirt's underside fall away.
    const side = ux + (uy + 9) * 0.12;
    let t = side < -1.25 ? 3 : side > 1.35 ? 1 : 2;
    if (uy < -10.6 && ux < 1.0) t = Math.max(t, 3); // shoulders' top plane
    // Belt, with a buckle and a strap end hanging.
    if (uy > -8.45 && uy < -7.95) {
      if (Math.abs(ux - (back ? -0.6 : 0.45)) < 0.32) return code(TM.steel, uy < -8.2 ? 4 : 2);
      return code(k.belt ?? TM.leather, ux < -1.2 ? 3 : 2);
    }
    if (!back && Math.abs(ux - 0.7) < 0.14 && uy > -7.95 && uy < -6.6) return code(k.belt ?? TM.leather, 1);
    // The cross on the chest (or the back): a broad red cross, its arms reaching the flanks.
    if (k.cross && uy > -11.5 && uy < -8.5) {
      const vx = ux - crossX;
      if ((within(c, vx, 0.42) && uy > -11.35) || (within(c, uy + 10.25, 0.38) && Math.abs(vx) < 1.45)) return code(TM.red, vx < -0.2 ? 3 : side > 1.3 ? 1 : 2);
    }
    // Skirt folds below the belt: three hanging folds, a dark channel with a lit ridge beside it,
    // drifting toward the back as they fall.
    if (uy > -7.6) {
      const fx = ux - (uy + 7.6) * 0.08;
      for (const f0 of [-1.0, 0.25, 1.35]) {
        const dd = fx - f0;
        if (dd > 0 && dd < 0.22 && uy > -7.0) return code(garment, t - 1);
        if (dd > -0.22 && dd <= 0 && uy > -6.6) return code(garment, Math.min(4, t + 1));
      }
      // Dirt and wear rising from the hem.
      const hem = -3.3 - uy;
      if (hem < 0.9 && c.tex(x, y, 47, 3) < 0.5 - hem * 0.45) return code(garment, t - 1);
      if (hem < 0.35) return code(garment, Math.max(1, t - 1));
    }
    if (quilt && uy < -8.5 && ((c.ly(y) % 6 === 0) || (uy < -9.5 && Math.abs(((ux + 5) * 1.6) % 1 - 0.5) < 0.07))) return code(garment, t - 1);
    if (isMail(garment)) {
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

/** A face, front three-quarter: brow shadow, eye, nose, cheek, moustache and beard. */
function faceS(c: Paper, o: P2, beard: boolean): void {
  c.blob(o, 0.72, 0.85, TM.flesh, {
    detail: (_x, _y, nx, ny) => {
      if (Math.abs(nx - 0.3) < 0.2 && Math.abs(ny + 0.08) < 0.12) return code(TM.ink, 2);
      if (ny < -0.22 && ny > -0.42 && nx > -0.1) return code(TM.flesh, 1);
      if (nx > 0.62 && ny > -0.1 && ny < 0.3) return code(TM.flesh, 3);
      if (nx < -0.1 && nx > -0.6 && ny > -0.05 && ny < 0.22) return code(TM.flesh, 3);
      if (beard && ny > 0.34 && Math.abs(nx - 0.2) < 0.4 && ny < 0.46) return code(TM.hair, 3);
      if (beard && ny > 0.5) return code(TM.hair, nx < 0 ? 4 : 3);
      return -1;
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
  if (coif) {
    // The coif: a mail hood round the face, thick at the cheeks and throat.
    c.blob(addP(o, [-0.05, 0.1]), 1.2, 1.3, coif, { detail: (x, y, nx) => mailTex(c, x, y, nx < -0.3 ? -1 : nx > 0.4 ? 1 : 0, nx < -0.4 ? 3 : nx > 0.5 ? 1 : 2, coif) });
  } else c.blob(addP(o, [-0.15, -0.1]), 0.95, 1.0, TM.hair, { tone: 2 });
  if (!back) faceS(c, addP(o, [0.38, 0.25]), beard);
  if (h === 'kettle' || h === 'pilgrim') {
    const pil = h === 'pilgrim';
    const m = pil ? TM.wool : TM.steel;
    c.blob(addP(o, [0.05, -0.85]), 1.0, 0.72, m, { shine: !pil });
    // A wide brim, dished: the upper face lit, the underside in shadow, chewed and dented.
    shapeU(c, [[-1.9, -0.55], [-1.0, -0.85], [1.15, -0.85], [2.05, -0.5], [1.9, -0.25], [-1.75, -0.3]].map((p) => addP(o, p as P2)), o, (x, _y, ux, uy) => {
      if (uy < -0.62) return code(m, ux < 0 ? 4 : 3);
      if (!pil && hash(c.lx(x) >> 1, 1, 3) < 0.1) return code(TM.leather, 1);
      return code(m, uy > -0.38 ? 1 : 2);
    });
    if (pil && !back) c.blob(addP(o, [0.65, -0.75]), 0.28, 0.25, TM.white, { tone: 3 });
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
    c.blob(addP(o, [0, -0.65]), 1.25, 0.85, TM.white, { detail: (x, y, nx, ny) => ((c.ly(y) + (c.lx(x) >> 2)) % 4 === 0 ? code(TM.white, nx < 0 ? 2 : 1) : ny > 0.6 ? code(TM.white, 1) : -1) });
    return;
  }
  // cap
  c.blob(addP(o, [-0.05, -0.65]), 1.05, 0.68, TM.wool, { tone: 2 });
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

/** A round shield, big, held tight: team field quartered, iron rim, a boss. */
function roundS(c: Paper, ctr: P2, r: number): void {
  c.blob(ctr, r * 0.86, r, TM.team, {
    detail: (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.88) return code(TM.steel, nx + ny < -0.4 ? 4 : nx + ny > 0.6 ? 1 : 2);
      if (d < 0.22) return code(TM.steel, nx + ny < -0.1 ? 4 : 2);
      if (d < 0.3) return code(TM.steel, 1);
      if (c.tex(x, y, 79, 3) < 0.05) return code(TM.wood, 2);
      const t = nx < -0.45 ? 3 : nx > 0.4 ? 1 : 2;
      return nx * ny > 0 ? code(TM.teamDk, t) : code(TM.team, t);
    },
  });
}

/** The parts of a foot figure that are not the man himself. */
interface SGear {
  /** Behind the whole figure (a pavise on the back, a quiver, javelins in the shield hand). */
  behind?: (c: Paper) => void;
  /** Between the body and the near arm (a shield held close covers the torso). */
  front?: (c: Paper) => void;
  /** In the near hand (and the near arm's pose: elbow and wrist). */
  near?: { el: P2; wr: P2; draw?: (c: Paper, hand: P2) => void };
  /** The far arm's pose when it shows (no shield). */
  far?: { el: P2; wr: P2; draw?: (c: Paper, hand: P2) => void };
  /** Last, over everything. */
  last?: (c: Paper) => void;
}

function manS(c: Paper, k: SKit, g: SGear): void {
  g.behind?.(c);
  legS(c, J.hipF, J.kneeF, J.ankF, k, true);
  legS(c, J.hipN, J.kneeN, J.ankN, k, false);
  if (g.far) {
    armS(c, J.shF, g.far.el, g.far.wr, k, true);
    g.far.draw?.(c, addP(g.far.wr, mul(sub(g.far.wr, g.far.el), 0.18)));
  }
  torsoS(c, k, false);
  if (k.camail) camail(c, k.camail, false);
  helmS(c, k.helm, J.head, false, k.beard ?? true, k.camail ?? (isMail(k.body) ? k.body : null));
  g.front?.(c);
  const ne = g.near ?? { el: [-2.65, -8.5] as P2, wr: [-2.3, -6.3] as P2 };
  armS(c, J.shN, ne.el, ne.wr, k, false);
  ne.draw?.(c, addP(ne.wr, mul(sub(ne.wr, ne.el), 0.18)));
  g.last?.(c);
}

// ------------------------------------------------------------------ more gear

/** A pavise slung high on the back: its painted top stands over the hat. */
function paviseS(c: Paper, ctr: P2, w: number, h: number, deg: number): void {
  const F = frameAt(ctr, deg);
  c.shape([at(F, -w / 2, -h / 2), at(F, w / 2, -h / 2 - 0.1), at(F, w / 2 - 0.05, h / 2), at(F, -w / 2 + 0.05, h / 2 + 0.1)], (x, y) => {
    const [lx, ly] = local(c, F, x, y);
    const ex = w / 2 - Math.abs(lx), ey = h / 2 - Math.abs(ly);
    const u = lx / (w / 2);
    if (ex < 0.3 || ey < 0.3) return code(TM.white, ex < 0.13 || ey < 0.13 ? 1 : u < 0 ? 3 : 2);
    if (within(c, lx + 0.1, 0.14)) return code(TM.team, 3); // the keel
    if ((within(c, lx + 0.1, 0.38) && Math.abs(ly + 0.2) < h * 0.32) || (within(c, ly + h * 0.12, 0.36) && Math.abs(lx + 0.1) < w * 0.3)) return code(TM.white, u < 0 ? 3 : 2);
    if (c.tex(x, y, 83, 3) < 0.05) return code(TM.wood, 2);
    return code(TM.team, u < -0.1 ? 2 : 1);
  });
}

/** A fan of spare javelins in the shield hand. */
function javelinsS(c: Paper, hand: P2): void {
  for (const d of [-10, 0, 10]) spear(c, addP(hand, [d * 0.01, 0]), 180 + d, 7.6, 1.8, { head: 1.1, w: 0.28 });
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

const SERGEANT: SKit = { helm: 'kettle', body: TM.mailDk, coat: TM.black, cross: true, camail: TM.mailDk, sleeve: TM.mailDk, hand: TM.leather, legs: TM.mailDk, boots: TM.leather };
const LEVY: SKit = { helm: 'nasal', body: TM.russet, coat: null, quilted: true, camail: null, sleeve: TM.russet, hand: TM.flesh, legs: TM.wool, boots: TM.leather };
const JAVELIN: SKit = { helm: 'cap', body: TM.wool, coat: null, camail: null, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather, belt: TM.team };
const ARCHER: SKit = { helm: 'pilgrim', body: TM.russet, coat: null, quilted: true, camail: null, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather };
const XBOW: SKit = { helm: 'kettle', body: TM.wool, coat: null, quilted: true, camail: TM.mailDk, sleeve: TM.wool, hand: TM.leather, legs: TM.wool, boots: TM.leather, belt: TM.team };
const BRETHREN: SKit = { helm: 'great', body: TM.mail, coat: TM.white, cross: true, camail: TM.mail, sleeve: TM.mail, hand: TM.mail, legs: TM.mail, boots: TM.mail };

const FOOT: Record<number, { kit: SKit; gear: SGear; dark: boolean }> = {
  0: {
    kit: SERGEANT,
    dark: true,
    gear: {
      // The kite covers the torso from the shoulder to the knee, its inner edge on the centre line.
      front: (c) => kiteS(c, [1.75, -8.1], 4.3, 6.8, false, false),
      // The sword hangs point-down at his side, clear of the shield (the D2R Paladin's stance).
      near: { el: [-3.05, -8.75], wr: [-3.1, -6.5], draw: (c, h) => sword(c, h, 8, 5.4) },
    },
  },
  1: {
    kit: LEVY,
    dark: true,
    gear: {
      // A big round shield held close; the spear grounded, half again his height.
      front: (c) => roundS(c, [1.85, -8.6], 2.75),
      near: { el: [-2.95, -8.9], wr: [-2.5, -7.0], draw: (c, h) => spear(c, h, 180, 12.5, 6.4, { head: 1.9, w: 0.34 }) },
    },
  },
  2: {
    kit: JAVELIN,
    dark: true,
    gear: {
      far: { el: [2.85, -8.9], wr: [3.35, -7.4], draw: (c, h) => { javelinsS(c, h); roundS(c, addP(h, [0.55, 0.1]), 1.35); } },
      near: { el: [-2.95, -9.0], wr: [-2.2, -7.2], draw: (c, h) => spear(c, h, 150, 5.6, 2.4, { head: 1.15, w: 0.28 }) },
    },
  },
  3: {
    kit: ARCHER,
    dark: true,
    gear: {
      behind: (c) => { vol(c, [-2.6, -8.2], [-3.1, -5.6], [[0, 0.5], [1, 0.42]], TM.leather, { tone: 2 }); for (const k of [-0.3, 0, 0.3]) vol(c, [-2.6 + k, -8.1], [-2.5 + k * 1.4, -9.0], [[0, 0.16], [1, 0.22]], TM.white, { tone: 3 }); },
      far: { el: [2.8, -8.8], wr: [3.2, -7.0], draw: (c, h) => bow(c, h, 174, 13.4, 0, null) },
      near: { el: [-2.95, -8.8], wr: [-2.7, -6.6] },
    },
  },
  4: {
    kit: XBOW,
    dark: true,
    gear: {
      behind: (c) => paviseS(c, [-0.9, -10.9], 4.0, 7.2, -6),
      near: { el: [-2.7, -8.7], wr: [-1.0, -7.7], draw: (c, h) => crossbow(c, h, 118, 1) },
    },
  },
  8: {
    kit: BRETHREN,
    dark: false,
    gear: {
      // The Dane axe held at the port, its great bit high and forward of the helm.
      near: { el: [-2.75, -8.9], wr: [-1.2, -7.6], draw: (c, h) => daneAxeS(c, h, 140) },
      last: (c) => ailetteS(c, [-2.3, -11.6], -8),
    },
  },
};

// ------------------------------------------------------------------ the horse

interface SHorse {
  coat: Mat;
  capar?: Mat | null;
  cloth?: boolean;
}

/**
 * A heavy horse in three-quarter profile, head to screen right: a deep barrel, a broad chest,
 * a thick arched neck, a long head, legs with real forearms and gaskins, feathered fetlocks and
 * broad hooves. Withers ~10.5 units (a destrier against a 14-unit man).
 */
function horseS(c: Paper, k: SHorse, part: 'far' | 'body'): void {
  const m = k.coat;
  const leg = (top: P2, knee: P2, fet: P2, hind: boolean, far: boolean) => {
    const t = far ? 1 : 2;
    vol(c, top, knee, hind ? [[0, 1.15], [0.45, 0.85], [1, 0.48]] : [[0, 0.9], [0.5, 0.72], [1, 0.5]], m, { tone: t });
    c.blob(knee, 0.55, 0.5, m, { tone: t - 1 });
    vol(c, knee, fet, [[0, 0.42], [0.7, 0.38], [1, 0.45]], m, { tone: 1 });
    c.blob(fet, 0.5, 0.42, m, { tone: 1 });
    const hoof = addP(fet, [0.25, 0.9]);
    vol(c, fet, hoof, [[0, 0.4], [1, 0.55]], m, { tone: 1 });
    c.shape([addP(hoof, [-0.55, -0.15]), addP(hoof, [0.65, -0.15]), addP(hoof, [0.8, 0.35]), addP(hoof, [-0.6, 0.35])], () => code(TM.mane, 1));
  };
  if (part === 'far') {
    leg([4.2, -6.4], [4.6, -3.2], [4.4, -1.25], false, true);
    leg([-3.8, -6.8], [-3.9, -3.6], [-4.4, -1.25], true, true);
    return;
  }
  // Tail: a thick switch from the croup, hanging.
  vol(c, [-6.0, -9.3], [-6.9, -4.2], [[0, 0.5], [0.3, 0.75], [1, 0.4]], TM.mane, { tone: 2, detail: (x, y) => ((c.lx(x) + c.ly(y)) % 5 === 0 ? code(TM.mane, 1) : -1) });
  // Barrel, chest and quarters.
  shapeU(c, [[-5.6, -9.9], [-3.0, -10.15], [0.2, -9.7], [2.6, -10.3], [4.3, -10.4], [5.6, -8.9], [6.0, -7.3], [5.4, -5.9], [3.6, -5.1], [0.5, -4.85], [-2.6, -5.1], [-4.6, -5.6], [-6.1, -6.8], [-6.4, -8.5]], [0, -7.5], (x, y, ux, uy) => {
    let t = uy < -1.75 || (ux < -4.6 && uy < 0.6) ? 3 : uy > 1.5 || ux > 5.2 ? 1 : 2;
    // Muscle: the shoulder's back edge and the stifle's curve as soft shadows.
    if (Math.abs(ux - (3.0 - (uy + 1) * 0.3)) < 0.18 && uy > -1.6 && uy < 1.8) t -= 1;
    if (Math.abs(Math.hypot(ux + 3.2, uy + 0.3) - 2.3) < 0.16 && ux > -3.2) t -= 1;
    if (c.tex(x, y, 21, 4) < 0.04) t -= 1;
    return code(m, t);
  });
  // The neck: deep at the base, arched along the crest; the mane.
  shapeU(c, [[2.6, -10.4], [4.0, -11.6], [5.4, -13.4], [6.6, -14.7], [7.6, -14.4], [8.0, -12.9], [7.2, -11.2], [6.1, -8.4], [4.8, -7.6]], [6, -11], (_x, _y, ux, uy) => code(m, ux - uy * 0.5 < -0.6 ? 3 : ux > 1.2 ? 1 : 2));
  vol(c, [2.9, -10.6], [6.7, -14.7], [[0, 0.35], [0.5, 0.55], [1, 0.35]], TM.mane, { tone: 2, detail: (x, y) => ((c.lx(x) * 2 + c.ly(y)) % 5 === 0 ? code(TM.mane, 1) : -1) });
  // The head: a long wedge with the jowl, ears up, the bridle.
  shapeU(c, [[6.7, -15.2], [7.8, -15.0], [9.9, -12.4], [10.15, -11.6], [9.6, -11.2], [8.6, -11.9], [7.4, -12.4], [6.6, -13.4]], [8, -13], (x, y, ux, uy) => {
    if (Math.hypot(ux - 0.0, uy + 1.35) < 0.22) return code(TM.ink, 1); // eye
    if (ux > 1.75 && uy > 1.2) return code(TM.ink, 2); // nostril
    if (within(c, ux + uy * 0.8 - 1.3, 0.1) || within(c, ux - 0.0 + (uy + 1.0) * 0.1 - 0.5, 0.08)) return code(TM.leather, 1);
    return code(m, uy - ux * 0.6 < -1.7 ? 3 : ux + uy > 1.4 ? 1 : 2);
  });
  c.shape([[6.8, -15.0], [7.0, -16.1], [7.45, -15.0]], () => code(m, 2));
  leg([3.8, -6.0], [4.0, -3.0], [3.8, -1.2], false, false);
  leg([-4.2, -6.4], [-4.0, -3.4], [-4.7, -1.2], true, false);
  if (k.capar) {
    // The caparison: from the neck to the knees, heavy folds, a scalloped hem, the red cross.
    const capPts: P2[] = [[-6.6, -10.4], [-3.0, -10.6], [0.2, -10.2], [2.6, -10.8], [4.4, -11.9], [5.8, -13.6], [7.3, -14.2], [7.9, -12.8], [7.0, -11.0], [6.5, -8.6], [6.4, -4.6],
      [5.2, -4.2], [4.0, -4.6], [2.8, -4.2], [1.6, -4.6], [0.4, -4.2], [-0.8, -4.6], [-2.0, -4.2], [-3.2, -4.6], [-4.4, -4.2], [-5.6, -4.6], [-6.7, -4.4], [-7.0, -7.0]];
    const cm = k.capar;
    shapeU(c, capPts, [0, -7.5], (x, y, ux, uy) => {
      if ((within(c, ux + 0.4, 0.65) && Math.abs(uy - 0.3) < 2.3) || (within(c, uy - 0.0, 0.6) && Math.abs(ux + 0.4) < 1.95)) return code(TM.red, ux < -0.6 ? 3 : 2);
      let t = uy < -2.2 || (ux < -5.2 && uy < 1.5) ? 3 : uy > 2.2 || ux > 5.6 ? 1 : 2;
      const f = ((ux + 8) * 0.62) % 1;
      if (uy > -1.6 && f < 0.12) t -= 1;
      else if (uy > -1.6 && f > 0.86) t = Math.min(4, t + 1);
      if (uy > 2.4 && c.tex(x, y, 59, 3) < 0.45) t -= 1;
      return code(cm, t);
    });
  } else if (k.cloth) {
    shapeU(c, [[-1.8, -10.1], [2.0, -10.3], [2.1, -7.2], [-1.7, -7.0]], [0, -9], (_x, _y, ux, uy) => (uy > 1.6 ? code(TM.teamDk, 1) : code(TM.team, ux < -0.8 ? 3 : 2)));
  }
  // Saddle: the cantle high behind, the pommel in front; girth and stirrup leather.
  shapeU(c, [[-1.6, -11.6], [-1.0, -11.7], [-0.6, -10.5], [1.4, -10.5], [1.9, -11.2], [2.3, -11.05], [2.0, -9.9], [-1.4, -9.8]], [0, -10.5], (_x, _y, ux, uy) => code(TM.leather, uy < -0.8 ? 3 : ux > 1.6 ? 1 : 2));
  if (!k.capar) vol(c, [0.5, -9.8], [0.7, -5.0], [[0, 0.18], [1, 0.18]], TM.leather, { tone: 1 });
}

/** A rider seated on the horse: thighs along its flank, a solid torso, his arms and head. */
function riderS(c: Paper, k: SKit, g: SGear): void {
  // Shift the man's foot frame so his pelvis sits in the saddle.
  const pel: P2 = [0.3, -10.6];
  const dx = pel[0] - 0, dy = pel[1] - -6.5;
  const fx = c.FX, fy = c.FY;
  c.FX = fx + Math.round(dx * c.L);
  c.FY = fy + Math.round(dy * c.L);
  try {
    // The near leg: thigh forward and down along the flank, the shin back to the stirrup.
    const hip: P2 = [-0.4, -6.3], knee: P2 = [1.6, -3.9], ank: P2 = [1.0, -1.1];
    vol(c, hip, knee, [[0, 0.85], [1, 0.62]], k.legs, { tone: 2 });
    c.blob(knee, 0.62, 0.58, k.legs, { tone: 2 });
    vol(c, knee, ank, [[0, 0.58], [0.3, 0.62], [1, 0.45]], k.legs, { tone: 1 });
    c.shape([addP(ank, [-0.5, -0.3]), addP(ank, [0.4, -0.3]), addP(ank, [1.25, 0.2]), addP(ank, [1.2, 0.5]), addP(ank, [-0.5, 0.5])], () => code(k.boots, 2));
    vol(c, addP(ank, [0.1, 0.55]), addP(ank, [0.1, -2.6]), [[0, 0.1], [1, 0.1]], TM.leather, { tone: 1 }); // stirrup leather
    g.behind?.(c);
    if (g.far) armS(c, J.shF, g.far.el, g.far.wr, k, true);
    if (g.far?.draw) g.far.draw(c, addP(g.far.wr, mul(sub(g.far.wr, g.far.el), 0.18)));
    // Torso, with the coat skirt falling over the thigh.
    const garment = k.coat ?? k.body;
    shapeU(c, [[-0.75, -12.15], [0.85, -12.15], [2.45, -11.75], [2.6, -10.7], [2.3, -9.4], [1.75, -8.25], [2.0, -7.0], [3.2, -5.6], [2.8, -4.9], [0.6, -5.2], [-1.6, -5.4], [-2.4, -6.2], [-1.9, -7.4], [-1.8, -8.25], [-2.35, -9.4], [-2.6, -10.7], [-2.5, -11.75]], [0, 0], (x, y, ux, uy) => {
      const side = ux + (uy + 9) * 0.12;
      let t = side < -1.25 ? 3 : side > 1.35 ? 1 : 2;
      if (uy < -10.6 && ux < 1.0) t = Math.max(t, 3);
      if (uy > -8.45 && uy < -7.95) return code(k.belt ?? TM.leather, ux < -1.2 ? 3 : 2);
      if (k.cross && uy > -11.5 && uy < -8.5) {
        const vx = ux + 0.2;
        if ((within(c, vx, 0.42) && uy > -11.35) || (within(c, uy + 10.25, 0.38) && Math.abs(vx) < 1.45)) return code(TM.red, vx < -0.2 ? 3 : 2);
      }
      if (uy > -7.6) {
        const fx2 = ux * 0.6 + (uy + 7.6) * 0.5;
        if (Math.abs(fx2 - 1.0) < 0.12 || Math.abs(fx2 - 2.0) < 0.12) return code(garment, t - 1);
      }
      if (isMail(garment)) {
        const r = mailTex(c, x, y, t > 2 ? -1 : t < 2 ? 1 : 0, t, garment);
        if (r >= 0) return r;
      }
      return code(garment, t);
    });
    if (k.camail) camail(c, k.camail, false);
    helmS(c, k.helm, J.head, false, k.beard ?? true, k.camail ?? (isMail(k.body) ? k.body : null));
    g.front?.(c);
    const ne = g.near ?? { el: [-2.65, -8.5] as P2, wr: [-1.6, -7.0] as P2 };
    armS(c, J.shN, ne.el, ne.wr, k, false);
    ne.draw?.(c, addP(ne.wr, mul(sub(ne.wr, ne.el), 0.18)));
    g.last?.(c);
  } finally {
    c.FX = fx;
    c.FY = fy;
  }
}

const KNIGHT: SKit = { helm: 'great', body: TM.mail, coat: TM.white, cross: true, camail: TM.mail, sleeve: TM.mail, hand: TM.mail, legs: TM.mail, boots: TM.mail };
const MARSHAL: SKit = { ...KNIGHT, helm: 'gilded', belt: TM.gold };
const TURCOPOLE: SKit = { helm: 'turban', body: TM.gambeson, coat: null, camail: TM.mailDk, sleeve: TM.gambeson, hand: TM.leather, legs: TM.wool, boots: TM.leather };
const HORSE_ARCHER: SKit = { helm: 'turban', body: TM.wool, coat: null, camail: null, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather, belt: TM.team };

const MOUNTED: Record<number, { kit: SKit; horse: SHorse; gear: SGear; dark: boolean }> = {
  5: {
    kit: TURCOPOLE,
    horse: { coat: TM.bay },
    dark: true,
    gear: {
      front: (c) => roundS(c, [2.0, -9.0], 2.2),
      near: { el: [-2.8, -8.9], wr: [-2.0, -7.4], draw: (c, h) => spear(c, h, 180, 13.0, 4.5, { head: 1.5, pennon: 0.4, w: 0.3 }) },
    },
  },
  6: {
    kit: HORSE_ARCHER,
    horse: { coat: TM.mane, cloth: true },
    dark: true,
    gear: {
      behind: (c) => { vol(c, [-2.4, -7.6], [-3.4, -5.6], [[0, 0.45], [1, 0.4]], TM.leather, { tone: 2 }); for (const k of [-0.25, 0.05, 0.3]) vol(c, [-2.4 + k, -7.5], [-2.2 + k * 1.3, -8.4], [[0, 0.15], [1, 0.2]], TM.white, { tone: 3 }); },
      far: { el: [2.9, -9.6], wr: [3.6, -8.6], draw: (c, h) => bow(c, h, 168, 8.6, 0, null) },
      near: { el: [-2.8, -8.9], wr: [-1.6, -7.4] },
    },
  },
  7: {
    kit: KNIGHT,
    horse: { coat: TM.grey, capar: TM.white },
    dark: false,
    gear: {
      front: (c) => kiteS(c, [2.1, -8.6], 3.8, 5.9, false, true, -6),
      near: { el: [-2.8, -8.9], wr: [-1.8, -7.3], draw: (c, h) => spear(c, h, 135, 12.5, 3.5, { head: 1.3, pennon: 0.3, w: 0.36 }) },
    },
  },
  10: {
    kit: MARSHAL,
    horse: { coat: TM.grey, capar: TM.white },
    dark: false,
    gear: {
      far: { el: [2.7, -9.7], wr: [3.0, -11.4], draw: (c, h) => beauseant(c, addP(h, [0, 0]), 180, 0.35, 0) },
      near: { el: [-2.9, -8.9], wr: [-2.2, -7.1], draw: (c, h) => sword(c, h, 135, 5.4) },
    },
  },
};

// ------------------------------------------------------------------ the engine

/** A crewman at an offset along the ground (his whole frame shifted). */
function crewS(c: Paper, dx: number, g: SGear): void {
  const fx = c.FX;
  c.FX = fx + Math.round(dx * c.L);
  try {
    manS(c, { helm: 'cap', body: TM.wool, coat: null, quilted: true, camail: null, sleeve: TM.wool, hand: TM.flesh, legs: TM.wool, boots: TM.leather }, g);
  } finally {
    c.FX = fx;
  }
}

/** The traction trebuchet (Maciejowski fol. 23v): trestle, lashed beam, sling, ropes, crew. */
function engineS(c: Paper): void {
  const S = 0.85; // the crew stand a little smaller, behind and beside the timbers
  void S;
  crewS(c, -8.6, { near: { el: [-2.6, -9.2], wr: [-0.8, -9.0] } });
  // Far trestle, darker.
  const timber = (a: P2, b: P2, w: number, t: number) => vol(c, a, b, [[0, w], [1, w * 0.92]], TM.wood, { tone: t, detail: (x, y) => (c.tex(x, y, 33, 3) < 0.06 ? code(TM.wood, t - 1) : -1) });
  const piv: P2 = [-0.4, -14.2];
  timber(addP(piv, [1.2, -0.6]), [-3.4, -0.3], 0.55, 1);
  timber(addP(piv, [1.2, -0.6]), [4.4, -0.6], 0.55, 1);
  // Ground sills and a cross-brace.
  timber([-6.2, -0.2], [6.4, -0.6], 0.6, 1);
  // The beam: long arm resting back-down, the short arm up in front with its ropes.
  const longEnd: P2 = [-9.2, -6.6], shortEnd: P2 = [3.8, -18.0];
  vol(c, shortEnd, longEnd, [[0, 0.55], [0.3, 0.75], [1, 0.4]], TM.wood, { tone: 2, detail: (_x, _y, _u, v) => (Math.abs(v - 0.27) < 0.02 || Math.abs(v - 0.36) < 0.02 || Math.abs(v - 0.6) < 0.015 ? code(TM.leather, 1) : -1) });
  // Sling to a pouch with the stone lying behind.
  const pouch: P2 = [-11.6, -1.0];
  c.line(longEnd, pouch, code(TM.leather, 2));
  c.line(addP(longEnd, [0.2, 0.1]), addP(pouch, [0.4, 0.0]), code(TM.leather, 1));
  c.blob(pouch, 0.95, 0.85, TM.wool, { tone: 2 });
  // Ropes from the short arm down to the pullers.
  for (const [k, x] of [[-0.3, 6.8], [0, 7.6], [0.3, 9.2], [0.5, 10.0]] as [number, number][]) c.line(addP(shortEnd, [k, 0]), [x, -10.8], code(TM.white, 1));
  // Near trestle and axle.
  timber(piv, [-4.8, 0], 0.65, 2);
  timber(piv, [3.4, 0], 0.65, 2);
  timber([-3.3, -5.0], [2.3, -5.0], 0.45, 1);
  c.blob(piv, 0.55, 0.55, TM.steel, { tone: 2 });
  // The pullers, arms up on the ropes, leaning back.
  crewS(c, 7.4, { near: { el: [-2.3, -13.0], wr: [-0.4, -14.6] }, far: { el: [2.6, -13.2], wr: [0.9, -14.6] } });
}

// ------------------------------------------------------------------ painting

/** Paints a kind's key art at level 8 (or another level) in the army's hue. */
export function paintStatic(kind: number, hue = 215, level = 8): { width: number; height: number; pixels: Uint8ClampedArray; ax: number; ay: number } | null {
  const foot = FOOT[kind], rider = MOUNTED[kind];
  if (!foot && !rider && kind !== 9) return null;
  const body: BodyType = foot ? 'foot' : rider ? 'horse' : 'engine';
  const c = new Paper();
  c.begin(level, BODIES[body].canvas);
  if (foot) paintAs(c, foot.dark, () => manS(c, foot.kit, foot.gear));
  else if (rider)
    paintAs(c, rider.dark, () => {
      horseS(c, rider.horse, 'far');
      horseS(c, rider.horse, 'body');
      riderS(c, rider.kit, rider.gear);
    });
  else paintAs(c, true, () => engineS(c));
  c.contact();
  c.clusters(level >= 8 ? 4 : 3);
  const out = c.colours(factionPalette('templar', hue, level));
  return { width: c.CW, height: c.CH, pixels: new Uint8ClampedArray(out.buffer), ax: c.FX, ay: c.FY };
}

/** The kinds in lineup order: the foot, the horse, the engine and the marshal. */
export const STATIC_KINDS = (): number[] => [0, 1, 2, 3, 4, 8, 5, 6, 7, 9, 10];
void rot;
