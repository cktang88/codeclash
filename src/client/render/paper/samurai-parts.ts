// The Samurai clans' shared paper parts: materials, armour pieces (kabuto, jingasa, laced dō,
// kusazuri, sode), weapons (katana, nagae-yari, naginata, yumi, teppō, nage-yari, gunbai), flags
// (sashimono, horo), a man built from them, a horse with its tack, and the ōzutsu with its crew.
// Owned by the samurai faction agent; see README.md. References: docs/art-references/hd-sprites.md
// ("Samurai on paper").
//
// Conventions (rig.ts): figure units, feet at (0, 0), y down, drawn facing SE (forward = screen
// right); the near (weapon, right) side is toward the viewer: screen left in SE, screen right in NE.
// Body-frame helpers below lean with the torso: positive torso = leaning forward.

import { addP, code, DEG, defineMaterial, hash, M, oklchRamp, oklchRgb, okHue, rot, type Mat, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { along, limb, snapDeg, type EnginePose, type FootPose, type HorsePose } from './rig.ts';

// ------------------------------------------------------------------ materials

/**
 * Low-key Sengoku palette: near-black scuffed lacquer, dull iron, worn indigo and undyed cotton,
 * straw; the army colour (sashimono, horo, lacing) is the one saturated accent. Base tones sit
 * clear of the battlefield green (L ≈ 0.47) so the core does not have to shift them.
 */
/**
 * An army-colour ramp whose hue steps toward violet in the shadows and toward the warm key in the
 * lights (`step`° a tone), whatever the army's hue: never a straight ramp (pixel-art-craft §ramps).
 */
export function armyRamp(hue: number, ls: readonly number[], cs: readonly number[], step = 8): [number, number, number][] {
  const h = okHue(hue);
  const toward = (to: number, by: number) => h + Math.sign(((to - h + 540) % 360) - 180) * by;
  return ls.map((l, i) => oklchRgb(l, cs[i]!, i < 2 ? toward(295, (2 - i) * step) : i > 2 ? toward(75, (i - 2) * step) : h));
}

export const SM = {
  lacquer: defineMaterial('samurai.lacquer', oklchRamp({ l: 0.29, c: 0.02, h: 40, spread: 0.1 })),
  /** The red-brown undercoat that shows where lacquer is scuffed, and the dull shu of a war fan. */
  shu: defineMaterial('samurai.shu', oklchRamp({ l: 0.34, c: 0.07, h: 32, spread: 0.065 })),
  iron: defineMaterial('samurai.iron', oklchRamp({ l: 0.33, c: 0.014, h: 250, spread: 0.1 })),
  steel: defineMaterial('samurai.steel', oklchRamp({ l: 0.66, c: 0.014, h: 235, spread: 0.11 })),
  gold: defineMaterial('samurai.gold', oklchRamp({ l: 0.64, c: 0.09, h: 82, spread: 0.1 })),
  team: defineMaterial('samurai.team', (hue) => armyRamp(hue, [0.42, 0.51, 0.6, 0.68, 0.76], [0.12, 0.17, 0.15, 0.12, 0.09])),
  teamDk: defineMaterial('samurai.teamDk', (hue) => armyRamp(hue, [0.24, 0.29, 0.34, 0.39, 0.45], [0.07, 0.1, 0.1, 0.085, 0.07], 14)),
  indigo: defineMaterial('samurai.indigo', oklchRamp({ l: 0.34, c: 0.05, h: 262, spread: 0.06 })),
  cotton: defineMaterial('samurai.cotton', oklchRamp({ l: 0.76, c: 0.018, h: 85, spread: 0.07 })),
  flesh: defineMaterial('samurai.flesh', oklchRamp({ l: 0.62, c: 0.06, h: 55 })),
  hair: defineMaterial('samurai.hair', oklchRamp({ l: 0.22, c: 0.016, h: 40, spread: 0.06 })),
  wood: defineMaterial('samurai.wood', oklchRamp({ l: 0.34, c: 0.055, h: 58, spread: 0.065 })),
  straw: defineMaterial('samurai.straw', oklchRamp({ l: 0.63, c: 0.06, h: 85 })),
  bay: defineMaterial('samurai.bay', oklchRamp({ l: 0.34, c: 0.065, h: 45, spread: 0.065 })),
  /** A chestnut (kurige) horse, red-brown, for the mounted archers. */
  chestnut: defineMaterial('samurai.chestnut', oklchRamp({ l: 0.35, c: 0.075, h: 38, spread: 0.065 })),
  black: defineMaterial('samurai.black', oklchRamp({ l: 0.25, c: 0.016, h: 285, spread: 0.07 })),
  bronze: defineMaterial('samurai.bronze', oklchRamp({ l: 0.6, c: 0.06, h: 70, spread: 0.1 })),
  smoke: defineMaterial('samurai.smoke', oklchRamp({ l: 0.74, c: 0.01, h: 250, spread: 0.06 })),
  /** Kesa (monk's stole): faded ochre. */
  ochre: defineMaterial('samurai.ochre', oklchRamp({ l: 0.62, c: 0.07, h: 72 })),
  /** Muzzle flash and the glowing slow-match: emissive, exempt from cleanup. */
  fire: defineMaterial('samurai.fire', [[120, 40, 20], [190, 80, 30], [235, 140, 50], [250, 200, 110], [255, 240, 190]], { keep: true }),
  ink: M.ink,
} as const;

// ------------------------------------------------------------------ small helpers

/** Held wood and lacquer: a step darker at level 1, where a weapon held forward sits on the figure's shadow side. */
export const WT = (c: Paper): number => (c.L <= 1 ? 1 : 2);

/**
 * A long thin prop (shaft, pole, bow limb): at level 1 an exact one-pixel line (a rod would cover
 * two pixel columns and, with its outline, read as a four-pixel bar); a tapered rod above.
 */
export function stick(c: Paper, a: P2, b: P2, w: number, mat: Mat, tone: number): void {
  if (c.L <= 1 && w < 0.45) c.line(a, b, code(mat, tone));
  else c.rod(a, b, w, w * 0.9, mat, { tone });
}

/** Fire and the match glow are one flat tone (an emissive cluster, no shading). */
export const FIRE = (): number => code(SM.fire, 3);

export const mul = (p: P2, k: number): P2 => [p[0] * k, p[1] * k];
export const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
export const lerpP = (a: P2, b: P2, k: number): P2 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
export const len = (p: P2): number => Math.hypot(p[0], p[1]);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const frac = (v: number) => v - Math.floor(v);

/** An ellipse outline (units), `n` points. */
export function ell(rx: number, ry: number, cx = 0, cy = 0, n = 18, a0 = 0, a1 = 360): P2[] {
  const out: P2[] = [];
  const full = a1 - a0 >= 360;
  const steps = full ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/**
 * A rigid part: a polygon in its own frame (units, relative to `at`, rotated by `ang` degrees,
 * snapped; positive turns clockwise on screen), shaded by `shade(fx, fy, x, y)` with the pixel's
 * position back in the part's frame. Texture keyed to fx, fy rides with the part (no boil).
 */
export function part(c: Paper, at: P2, ang: number, pts: P2[], shade: (fx: number, fy: number, x: number, y: number) => number): void {
  const a = snapDeg(ang) * DEG;
  const o = c.q(at);
  const L = c.L;
  const cx = c.sx(o[0]), cy = c.sy(o[1]);
  const cp = pts.map((p) => {
    const r = rot(p, a);
    return [cx + r[0] * L, cy + r[1] * L] as P2;
  });
  c.poly(cp, (x, y) => {
    const f = rot([(x + 0.5 - cx) / L, (y + 0.5 - cy) / L], -a);
    return shade(f[0], f[1], x, y);
  });
}

/** Tone of a flat plate lit from the top-left: `s` runs across it, -1 on the lit side to 1 on the shadow side. */
export const lit = (c: Paper, base: number, s: number, hi = 0.45, lo = 0.4): number => {
  return s < -hi + c.band ? base + 1 : s > lo + c.band ? base - 1 : base;
};

/** A part-local hash (pixel cell of the part's own frame). */
const ph = (c: Paper, fx: number, fy: number, seed: number, cell = 1): number => hash(Math.floor((fx * c.L) / cell), Math.floor((fy * c.L) / cell), seed);

/** Two-bone IK: the elbow (or knee) and the reached point, from `s` toward `t` with bone lengths a, b, bending toward `bend` (+1 down, -1 up). */
export function ik(c: Paper, s: P2, t: P2, a: number, b: number, bend = 1): [P2, P2] {
  const dx = t[0] - s[0], dy = t[1] - s[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const dm = clamp(d, Math.abs(a - b) + 0.05, (a + b) * 0.999);
  const ux = dx / d, uy = dy / d;
  const reach: P2 = [s[0] + ux * dm, s[1] + uy * dm];
  const A = Math.acos(clamp((a * a + dm * dm - b * b) / (2 * a * dm), -1, 1));
  const e1: P2 = [s[0] + a * (ux * Math.cos(A) - uy * Math.sin(A)), s[1] + a * (ux * Math.sin(A) + uy * Math.cos(A))];
  const e2: P2 = [s[0] + a * (ux * Math.cos(-A) - uy * Math.sin(-A)), s[1] + a * (ux * Math.sin(-A) + uy * Math.cos(-A))];
  const el = (e1[1] - e2[1]) * bend >= 0 ? e1 : e2;
  return [c.q(el), c.q(reach)];
}

// ------------------------------------------------------------------ armour surfaces

/**
 * Lacquered lames with lacing (kebiki / sugake odoshi): rows of plate `per` units tall, each with
 * a lit top edge, a lacing line (mimi-ito) along its foot, and from level 4 vertical stitch pairs
 * in the army colour; scuffs show the red-brown undercoat. Below level 2 it is plain lacquer.
 */
export function lames(c: Paper, fx: number, fy: number, top: number, t: number, opt: { mat?: Mat; per?: number; stitch?: boolean; seed?: number; laceDk?: boolean } = {}): number {
  const L = c.L;
  const mat = opt.mat ?? SM.lacquer;
  // At levels 1-2 the lames are too small to stripe: plain lacquer (the lacing shows at 4 and up).
  if (L <= 2) return code(mat, t);
  const per = L <= 4 ? Math.max(0.9, opt.per ?? 0.62) : (opt.per ?? 0.62);
  // Rows curve round the body (they dip toward the edges), so their ends never line up with a
  // neighbouring part's rows.
  const r = (fy - top - 0.07 * fx * fx) / per;
  const k = frac(r);
  const row = Math.floor(r);
  const px = 1 / (L * per);
  const lace = opt.laceDk ? SM.teamDk : SM.team;
  // Level 4: the lacing shows as single stitches, staggered row to row and three or more pixels
  // apart, on plain lacquer (full rows would stripe the dō, their ends lining up).
  if (L <= 4) {
    if (k > 0.35 && k < 0.35 + 1.5 * px && frac((fx * L + row * 2.3) / 4) < 0.25) return code(lace, t);
    if (ph(c, fx, fy, (opt.seed ?? 77) + row, 1) < 0.02) return code(SM.shu, 2);
    return code(mat, t);
  }
  if (k < px && t >= 2) return code(mat, t + 1);
  if (k > 1 - px) return code(lace, t - (opt.laceDk ? 0 : 1));
  if (L >= 8 && opt.stitch !== false && k > 2 * px) {
    const q = frac((fx + 5) / 0.8);
    const w = 1 / (L * 0.8);
    if (q < w || (q > 2.5 * w && q < 3.5 * w)) return code(lace, t);
  }
  if (L >= 4 && ph(c, fx, fy, (opt.seed ?? 77) + row, 1) < 0.03) return code(SM.shu, 2);
  return code(mat, t);
}

/** Riveted iron or lacquer plates (okegawa dō): seams every `per` units, rivet heads from level 8. */
export function plates(c: Paper, fx: number, fy: number, top: number, t: number, mat: Mat, per = 0.85): number {
  const L = c.L;
  if (L <= 2) return code(mat, t);
  if (L <= 4) per = Math.max(per, 1.1);
  const r = (fy - top - 0.08 * fx * fx) / per;
  const k = frac(r);
  if (L <= 4) {
    // Seams as short staggered dashes, rivet-like, not full rows.
    if (k > 1 - 1 / (L * per) && frac((fx * L + Math.floor(r) * 2.3) / 5) < 0.4) return code(mat, Math.max(0, t - 1));
    return code(mat, t);
  }
  if (k > 1 - 1 / (L * per)) return code(mat, Math.max(0, t - 2));
  if (k < 1 / (L * per) && t >= 2) return code(mat, t + 1);
  if (L >= 8 && k > 0.3 && k < 0.45 && frac((fx + 4) / 0.55) < 0.22) return code(mat, t + 2);
  if (L >= 4 && ph(c, fx, fy, 91 + Math.floor(r), 1) < 0.025) return code(SM.shu, 2);
  return code(mat, t);
}

// ------------------------------------------------------------------ the man: rig

/** Where a man's parts are this frame (units), in one facing. */
export interface ManRig {
  back: boolean;
  tilt: number;
  /** Torso angle (degrees, + forward) and head angle (absolute). */
  ta: number;
  ha: number;
  pel: P2;
  neck: P2;
  head: P2;
  shN: P2;
  shF: P2;
  hipN: P2;
  hipF: P2;
  /** Body frame: x across (screen right), h up from the pelvis. */
  B: (x: number, h: number) => P2;
  /** Mirror of a lateral offset for the back view. */
  sx: (x: number) => number;
}

export const ARM_U = 2.35, ARM_L = 2.2, LEG_U = 3.1, LEG_L = 3.0;

/** The rig of a standing man whose pelvis is at `pel` (already offset and tilted). */
export function manRig(c: Paper, p: FootPose, facing: Facing, pel: P2): ManRig {
  const back = isBack(facing);
  const tilt = p.tilt;
  const ta = snapDeg(p.torso + tilt);
  const pq = c.q(pel);
  const B = (x: number, h: number): P2 => addP(pq, rot([x, -h], ta * DEG));
  const sx = (x: number) => (back ? -x : x);
  const neck = c.q(B(0.1, 4.75));
  const ha = snapDeg(p.torso + p.head + tilt);
  const head = c.q(addP(neck, rot([0.12, -1.05], ha * DEG)));
  return {
    back, tilt, ta, ha, pel: pq, neck, head,
    shN: B(sx(-1.35), 4.25), shF: B(sx(1.35), 4.3),
    hipN: B(sx(-0.6), 0.05), hipF: B(sx(0.6), 0.1),
    B, sx,
  };
}

/** What a man wears. */
export interface Kit {
  head: 'kabuto' | 'jingasa' | 'hachimaki' | 'kato' | 'kasa';
  crest?: 'kuwagata' | 'crescent' | 'none';
  /** Menpō (face mask). */
  mask?: boolean;
  body: 'gusoku' | 'okegawa' | 'happi' | 'robe';
  sode?: boolean;
  /** What rides on his back. */
  back?: 'sashimono' | 'horo' | 'javelins' | 'none';
  quiver?: boolean;
  /** Sleeves and trousers. */
  sleeve: Mat;
  legs: Mat;
  /** Shins: iron suneate or cotton kyahan. */
  shin: 'suneate' | 'kyahan' | 'robe';
  /** A wakizashi/katana at the hip. */
  sword?: boolean;
  /** Jinbaori over the armour (daimyō). */
  jinbaori?: boolean;
}

// ------------------------------------------------------------------ heads

/** The face, 3/4 to the right: eyes, brow, nose; with a menpō the lower face is an iron mask with a pale moustache. */
export function face(c: Paper, r: ManRig, mask: boolean, hair: 'cap' | 'top' | 'none'): void {
  const L = c.L;
  part(c, r.head, r.ha, [...ell(0.66, 0.82, 0.02, 0.05, 14), ], (fx, fy) => {
    const s = fx * 0.9 + fy * 0.4;
    if (hair === 'top' && (fy < -0.42 || (fx < -0.35 && fy < 0.25))) return code(SM.hair, fx < -0.2 && fy < -0.5 ? 3 : 2);
    if (hair === 'cap' && fy < -0.45) return code(SM.hair, 2);
    if (mask && fy > 0.12) {
      if (L >= 4 && fy > 0.26 && fy < 0.38 && fx > -0.1) return code(SM.cotton, 3); // moustache
      return code(SM.iron, lit(c, 2, s));
    }
    if (L >= 2) {
      const ey = Math.abs(fy + 0.02) < (L >= 8 ? 0.09 : 0.13);
      if (ey && (Math.abs(fx - 0.38) < 0.12 || (L >= 4 && Math.abs(fx + 0.05) < 0.1))) return code(SM.ink, 1);
      if (L >= 4 && fy > -0.22 && fy < -0.12 && fx > -0.2 && fx < 0.55) return code(SM.flesh, 1); // brow shadow
      if (L >= 8 && fy > 0.36 && fy < 0.44 && fx > 0.08 && fx < 0.4) return code(SM.flesh, 0); // mouth
    }
    return code(SM.flesh, c.L <= 1 ? 2 : lit(c, 2, s, 0.35, 0.35));
  });
  // Nose: one bump on the forward edge.
  if (L >= 4) c.blob(addP(r.head, rot([0.62, 0.15], r.ha * DEG)), 0.14, 0.16, mask ? SM.iron : SM.flesh, { tone: 2 });
}

/** The back of the head: hair and the nape. */
function headBack(c: Paper, r: ManRig, hair: boolean): void {
  part(c, r.head, r.ha, ell(0.68, 0.84, 0.0, 0.05, 14), (fx, fy) => {
    if (hair && fy < 0.3) return code(SM.hair, fx < -0.2 && fy < -0.4 ? 3 : 2);
    return code(SM.flesh, lit(c, 1, fx * 0.8 + fy * 0.4));
  });
}

/** Kabuto: a ridged bowl (suji at level 4+), a flaring laced shikoro, fukigaeshi, and the crest. */
function kabuto(c: Paper, r: ManRig, crest: Kit['crest']): void {
  const L = c.L;
  const back = r.back;
  const flip = back ? -1 : 1;
  // Crest behind the bowl from the back.
  if (back) kabutoCrest(c, r, crest);
  // Shikoro: the neck guard, laced lames flaring out and down, widest at the back of the head.
  const sh: P2[] = back
    ? [[-1.0, -0.35], [1.0, -0.35], [1.55, 0.55], [1.25, 0.95], [-1.25, 0.95], [-1.55, 0.55]]
    : [[-0.55, -0.4], [0.55, -0.3], [0.8, 0.25], [0.25, 0.55], [-1.05, 0.9], [-1.55, 0.6], [-1.1, -0.2]];
  part(c, r.head, r.ha, sh, (fx, fy) => lames(c, fx, fy, -0.35, lit(c, 2, fx * 0.6 * flip + fy * 0.5), { per: 0.42, stitch: true, seed: 31 }));
  // Bowl.
  part(c, r.head, r.ha, ell(0.86, 0.72, 0.05, -0.38, 16, 180, 360).concat([[0.91, -0.25], [-0.81, -0.25]]), (fx, fy) => {
    const s = (fx - 0.05) * 0.85 + (fy + 0.6) * 0.6;
    const t = lit(c, 2, s * 1.3, 0.45, 0.45);
    if (L >= 4) {
      const ang = Math.atan2(fy + 0.25, fx - 0.05) / DEG;
      if (frac((ang + 400) / 14) < (L >= 8 ? 0.22 : 0.3)) return code(SM.iron, Math.max(1, t - 1)); // suji ridges
      if (L >= 8 && s < -0.5 && frac((ang + 400) / 14) < 0.45) return code(SM.iron, 4);
    }
    return code(SM.iron, t);
  });
  // Tehen (crown fitting) at the top.
  if (L >= 4) c.blob(addP(r.head, rot([0.05, -1.07], r.ha * DEG)), 0.14, 0.08, SM.gold, { tone: 3 });
  if (!back) {
    // Mabizashi: the peak over the brow.
    part(c, r.head, r.ha, [[-0.1, -0.32], [1.0, -0.3], [1.1, -0.18], [0.1, -0.18]], (fx) => code(SM.lacquer, fx < 0.4 ? 3 : 2));
    // Fukigaeshi: the turned-back wing on the near side.
    part(c, r.head, r.ha, [[-0.75, -0.35], [-1.15, -0.65], [-1.25, -0.1], [-0.85, 0.05]], (fx, fy) => (L >= 4 && fy < -0.45 ? code(SM.gold, 2) : code(SM.lacquer, fx < -1.0 ? 3 : 2)));
    kabutoCrest(c, r, crest);
  }
}

function kabutoCrest(c: Paper, r: ManRig, crest: Kit['crest']): void {
  if (!crest || crest === 'none') return;
  const at = (p: P2) => addP(r.head, rot(p, r.ha * DEG));
  const base = r.back ? at([0.0, -0.75]) : at([0.35, -0.55]);
  if (crest === 'kuwagata') {
    // Gilt horns in a V from the brow.
    const lean = r.back ? 0 : 0.25;
    for (const [dx, tone] of [[-1.0, 2], [1.1, 3]] as [number, number][]) {
      const mid = at([(r.back ? 0 : 0.35) + dx * 0.6 + lean * 0.3, -1.6]);
      const tip = at([(r.back ? 0 : 0.35) + dx + lean, -2.7]);
      c.rod(base, mid, 0.34, 0.3, SM.gold, { tone });
      c.rod(mid, tip, 0.3, 0.16, SM.gold, { tone: tone - (dx < 0 ? 1 : 0) });
    }
    c.blob(base, 0.24, 0.2, SM.gold, { tone: 3, shine: true });
  } else {
    // The daimyō's crescent maedate: a broad gilt arc opening upward.
    const cx = r.back ? 0.0 : 0.35;
    const outer = ell(2.3, 1.35, cx, -2.25, 14, 12, 168);
    const inner = ell(1.95, 0.9, cx, -2.4, 14, 168, 12);
    part(c, r.head, r.ha, outer.concat(inner), (fx, fy) => code(SM.gold, fx < cx - 0.4 ? 3 : fx > cx + 0.9 ? 1 : fy > -1.0 ? 2 : 3));
    c.blob(base, 0.24, 0.22, SM.gold, { tone: 2 });
  }
}

/** Jingasa: the ashigaru's wide, shallow lacquered cone, a gold mon on the crown. */
function jingasa(c: Paper, r: ManRig): void {
  const L = c.L;
  const pts: P2[] = [[0.05, -1.35], [2.4, -0.28], [2.3, -0.02], [0.0, -0.3], [-2.3, -0.02], [-2.35, -0.28]];
  part(c, r.head, r.ha, pts, (fx, fy) => {
    // Underside of the brim: the lower edge band.
    const topEdge = -1.35 + Math.abs(fx) * ((1.35 - 0.28) / 2.35);
    const d = fy - topEdge;
    if (L >= 2 && fy > -0.26 + Math.abs(fx) * 0.1 && !r.back) return code(SM.lacquer, 1);
    if (L >= 2 && !r.back && Math.hypot(fx - 0.25, (fy + 0.72) * 1.6) < (L >= 4 ? 0.26 : 0.38)) return code(SM.gold, L >= 4 && fx < 0.2 ? 3 : 2);
    if (L >= 4 && d < 1 / L && fx < 0.4) return code(SM.lacquer, 4);
    if (L >= 4 && ph(c, fx, fy, 41, 1) < 0.02) return code(SM.shu, 2);
    // The crown faces the sky: a step lighter than the rest of the lacquer.
    return code(SM.lacquer, lit(c, 3, fx * 0.8 + (r.back ? 0.3 : 0), 0.5, 0.55));
  });
}

/** Hachimaki: a white band round the brow, knot tails behind. */
function hachimaki(c: Paper, r: ManRig, sway: number): void {
  const at = (p: P2) => addP(r.head, rot(p, r.ha * DEG));
  if (c.L <= 1) {
    // At 13 px the band is a stray light row: only the topknot is kept.
  } else if (r.back) {
    c.rod(at([-0.68, -0.32]), at([0.68, -0.32]), 0.3, 0.3, SM.cotton, { tone: 2 });
    c.rod(at([0.1, -0.3]), at([-0.25 + sway, 0.75]), 0.22, 0.18, SM.cotton, { tone: 2 });
    c.rod(at([0.15, -0.3]), at([0.35 + sway, 0.65]), 0.2, 0.16, SM.cotton, { tone: 1 });
  } else {
    c.rod(at([-0.62, -0.28]), at([0.66, -0.38]), 0.3, 0.28, SM.cotton, { tone: 3 });
    c.rod(at([-0.65, -0.28]), at([-1.15 + sway, 0.45]), 0.22, 0.16, SM.cotton, { tone: 2 });
  }
  // Topknot.
  c.rod(at([-0.1, -0.8]), at([0.35, -1.05]), 0.3, 0.24, SM.hair, { tone: 2 });
}

/** The sōhei's katō: a white cowl wrapped round the head, an eye slit, falling to the shoulders. */
function kato(c: Paper, r: ManRig): void {
  const L = c.L;
  part(c, r.head, r.ha, ell(0.78, 0.9, -0.05, 0.0, 16), (fx, fy) => {
    if (!r.back && fy > -0.2 && fy < 0.08 && fx > 0.05 && fx < 0.85) return L >= 4 && Math.abs(fx - 0.45) < 0.1 && fy > -0.15 ? code(SM.ink, 1) : code(SM.flesh, 1);
    const s = fx * 0.8 + fy * 0.5;
    if (L >= 4 && Math.abs(fy - fx * 0.35 + 0.45) < 0.06) return code(SM.cotton, 1); // a wrap fold
    // From behind the cowl is turned from the light: a step down, with a fold down the back.
    if (r.back && L >= 4 && Math.abs(fx + fy * 0.25) < 0.07) return code(SM.cotton, 1);
    return code(SM.cotton, lit(c, r.back ? 1 : 2, r.back ? s + 0.2 : s));
  });
  // The cowl's tail falls over the shoulders and chest.
  const drape: P2[] = r.back ? [[-0.8, 0.2], [0.8, 0.2], [1.05, 1.5], [0, 1.85], [-1.05, 1.5]] : [[-0.8, 0.25], [0.7, 0.45], [0.95, 1.4], [0.1, 1.8], [-1.15, 1.5]];
  part(c, r.head, r.ha * 0.4 + r.ta * 0.6, drape, (fx, fy) => (L >= 4 && Math.abs(fx * 0.6 - fy + 1.2) < 0.08 ? code(SM.cotton, 1) : code(SM.cotton, lit(c, 2, fx * 0.7 + fy * 0.3 + (r.back ? 0.2 : 0)))));
}

/** Ayaigasa: the mounted archer's wide flat straw hat. */
function kasa(c: Paper, r: ManRig): void {
  const L = c.L;
  part(c, r.head, r.ha, ell(2.0, 0.5, 0.1, -0.55, 18).concat([]), (fx, fy) => {
    if (fy > -0.45 && !r.back) return code(SM.straw, 1);
    if (L >= 4 && frac(Math.hypot(fx - 0.1, (fy + 0.55) * 4) / 0.4) < 0.18) return code(SM.straw, 1); // woven rings
    return code(SM.straw, lit(c, 2, fx * 0.7, 0.4, 0.5));
  });
  c.blob(addP(r.head, rot([0.1, -0.85], r.ha * DEG)), 0.55, 0.35, SM.straw, { tone: 2 });
}

/** The head with whatever covers it, front or back. */
export function headgear(c: Paper, r: ManRig, kit: Kit, sway: number): void {
  const hairTop = kit.head === 'hachimaki';
  if (kit.head === 'kato') return kato(c, r);
  if (r.back) headBack(c, r, kit.head !== 'kabuto');
  else face(c, r, !!kit.mask, hairTop ? 'top' : kit.head === 'kasa' ? 'cap' : 'none');
  if (kit.head === 'kabuto') kabuto(c, r, kit.crest);
  else if (kit.head === 'jingasa') jingasa(c, r);
  else if (kit.head === 'hachimaki') hachimaki(c, r, sway);
  else if (kit.head === 'kasa') kasa(c, r);
}

// ------------------------------------------------------------------ torso, skirt, shoulders

/** The dō (or jacket, or robe) from the waist to the neck, front or back. */
export function torso(c: Paper, r: ManRig, kit: Kit): void {
  const L = c.L;
  const back = r.back;
  const f = back ? -1 : 1;
  const pts: P2[] = [[-1.6, -4.6], [1.65, -4.65], [1.7, -2.7], [1.35, -0.15], [-1.25, -0.15], [-1.5, -2.7]].map((q) => [q[0]! * f, q[1]!] as P2);
  const s = (fx: number, fy: number) => fx * 0.5 + (fy + 2.4) * 0.3;
  if (kit.body === 'gusoku') {
    part(c, r.pel, r.ta, pts, (fx, fy) => {
      const t = lit(c, 2, s(fx, fy));
      // Munaita (breastplate top) plain; the agemaki knot on the back.
      if (fy < -3.9) return code(SM.lacquer, L >= 4 && fy < -4.45 ? 3 : t);
      if (back && L >= 2 && Math.hypot(fx * 1.1, fy + 3.2) < 0.42) return code(SM.team, Math.hypot(fx, fy + 3.2) < 0.15 ? 1 : 3);
      return lames(c, fx, fy, -3.9, t, { seed: back ? 13 : 11 });
    });
  } else if (kit.body === 'okegawa') {
    part(c, r.pel, r.ta, pts.map((q) => [q[0] * 0.94, q[1]] as P2), (fx, fy) => {
      const t = lit(c, 2, s(fx, fy));
      if (!back && L >= 2 && Math.hypot(fx - 0.25, (fy + 2.9) * 1.05) < (L >= 4 ? 0.42 : 0.55)) {
        // The clan mon in gold on the breastplate.
        if (L >= 8 && Math.hypot(fx - 0.25, fy + 2.9) < 0.18) return code(SM.lacquer, 2);
        return code(SM.gold, fx < 0.2 ? 3 : 2);
      }
      return plates(c, fx, fy, -4.55, t, SM.lacquer, 0.8);
    });
  } else if (kit.body === 'happi') {
    // A short team-dyed jacket over an undershirt: open collar, a darker band at the hem and cuffs.
    part(c, r.pel, r.ta, pts.map((q) => [q[0] * 0.92, q[1]] as P2), (fx, fy) => {
      const t = lit(c, 2, s(fx, fy));
      if (!back && Math.abs(fx - 0.2 + (fy + 4.6) * 0.3) < 0.22 && fy < -2.6) return code(SM.cotton, t); // collar
      if (fy > -0.75 && L >= 2) return code(SM.teamDk, t);
      if (L >= 4 && Math.abs(fx - 0.6 * f) < 0.06 && fy > -2.5) return code(SM.team, t - 1); // a fold
      if (back && L >= 2 && Math.hypot(fx, fy + 3.0) < 0.5) return code(SM.cotton, 2); // mon on the back
      return code(SM.team, t);
    });
  } else {
    // The monk's black koromo with the ochre kesa across the chest.
    part(c, r.pel, r.ta, pts.map((q) => [q[0] * 1.08, q[1]] as P2), (fx, fy) => {
      const t = lit(c, 2, s(fx, fy));
      const band = Math.abs(fy + 2.4 - fx * 0.9 * f) < 0.65;
      if (band) return code(SM.ochre, L >= 4 && frac((fx + 3) / 0.9) < 0.12 ? t - 1 : t);
      if (L >= 4 && Math.abs(fx + 0.4 * f + (fy + 1) * 0.25) < 0.06) return code(SM.black, t - 1);
      return code(SM.black, t);
    });
  }
  // The waist sash (obi).
  // The sash stops short of the body's edges (a full-width band lines up with the rows above).
  if (L >= 2) c.rod(r.B(r.sx(-0.85), 0.35), r.B(r.sx(1.0), 0.28), 0.45, 0.45, kit.body === 'robe' ? SM.ochre : kit.body === 'happi' ? SM.indigo : SM.cotton, { tone: 2 });
  if (kit.jinbaori) {
    // A sleeveless surcoat: team-coloured flaps falling over the shoulders and down the back/sides.
    const jp: P2[] = (back
      ? [[-1.55, -4.65], [1.55, -4.65], [1.85, 0.6], [-1.85, 0.6]]
      : [[-1.6, -4.6], [-0.4, -4.4], [-0.7, 0.4], [-1.85, 0.5]]) as P2[];
    part(c, r.pel, r.ta, jp, (fx, fy) => {
      if (L >= 2 && back && Math.hypot(fx, fy + 3.1) < 0.65) return Math.hypot(fx, fy + 3.1) < 0.4 ? code(SM.gold, 3) : code(SM.black, 1);
      if (fy > 0.2 || (!back && fx > -0.65)) return code(SM.team, 1);
      return code(SM.black, lit(c, 2, fx * 0.6, 0.4, 0.4));
    });
    if (!back) part(c, r.pel, r.ta, [[0.85, -4.55], [1.7, -4.5], [1.95, 0.5], [1.0, 0.4]], (fx) => (fx < 1.05 ? code(SM.team, 1) : code(SM.black, fx > 1.5 ? 1 : 2)));
  }
}

/** The kusazuri (tassets), or the skirt of a robe: panels hanging from the waist that follow the thighs. */
export function skirt(c: Paper, r: ManRig, p: FootPose, kit: Kit, layer: 'far' | 'near'): void {
  const L = c.L;
  const f = r.back ? -1 : 1;
  if (kit.body === 'happi') return;
  const robe = kit.body === 'robe';
  const long = kit.body === 'gusoku' ? 2.85 : robe ? 4.9 : 2.2;
  const panels: [number, number, number][] = layer === 'far'
    ? [[1.1, p.ft * 0.55, 1]]
    : robe ? [[-0.75, p.nt * 0.55, 3]] : [[-1.0, p.nt * 0.55, 3], [0.15, (p.nt + p.ft) * 0.25, 2]];
  for (const [x, ang0, tone] of panels) {
    const ang = robe ? ang0 * 0.6 : ang0;
    const at = r.B(x * f, 0.15);
    const w0 = robe ? 1.05 : 0.72, w1 = robe ? 1.55 : 1.0;
    const hem = robe ? [[w1, long - 0.2], [w1 * 0.4, long + 0.1], [-w1 * 0.4, long + 0.05], [-w1, long - 0.25]] as P2[] : [[w1, long], [-w1, long]] as P2[];
    part(c, at, ang + r.tilt, [[-w0, 0], [w0, 0], ...hem], (fx, fy) => {
      const t = lit(c, tone === 1 ? 1 : 2, fx * 0.6 + fy * 0.3 + (tone === 2 ? 0.25 : 0), 0.55, 0.5);
      if (robe) {
        // Pleats fanning from the waist; the hem turns up a lighter lining.
        const pleat = frac((fx * (1.3 - fy / (long * 2.2)) + 3) / 0.75);
        if (fy > long - 0.3) return code(SM.black, Math.max(0, t - 1));
        if (L >= 2 && pleat < (L >= 8 ? 0.12 : 0.22)) return code(SM.black, Math.max(0, t - 1));
        if (L >= 4 && pleat > 0.2 && pleat < 0.3 && fx < 0) return code(SM.black, t + 1);
        return code(SM.black, t);
      }
      return lames(c, fx, fy, 0.25 + x * 0.13, t, { per: kit.body === 'gusoku' ? 0.52 : 0.62, seed: 50 + x * 10, laceDk: kit.body !== 'gusoku' });
    });
  }
}

/** A sode: the flat laced shoulder board hanging over the upper arm. */
export function sode(c: Paper, sh: P2, ang: number, far: boolean, back: boolean): void {
  const w = far ? 0.72 : 0.88;
  part(c, addP(sh, [0, -0.15]), clamp(ang * 0.45, -25, 50), [[-w, -0.15], [w, -0.25], [w + 0.1, 2.05], [-w - 0.05, 2.15]], (fx, fy) => {
    const t = far ? 1 : lit(c, 2, fx * 0.9 * (back ? -1 : 1), 0.4, 0.45);
    if (fy < 0.15) return code(SM.lacquer, far ? 1 : 3);
    return lames(c, fx, fy, 0.15, t, { per: 0.48, seed: far ? 23 : 21 });
  });
}

// ------------------------------------------------------------------ limbs

/** An arm: sleeve, armoured or cloth forearm, the hand. Returns the hand. */
export function armFK(c: Paper, sh: P2, ua: number, la: number, kit: Kit, far: boolean): P2 {
  const el = c.q(along(sh, ua, ARM_U));
  const hand = c.q(along(el, ua + la, ARM_L));
  drawArm(c, sh, el, hand, kit, far);
  return hand;
}

export function drawArm(c: Paper, sh: P2, el: P2, hand: P2, kit: Kit, far: boolean): void {
  const tone = far ? 1 : 2;
  const L = c.L;
  const robe = kit.body === 'robe';
  c.rod(sh, el, robe ? 1.25 : 1.0, robe ? 1.05 : 0.8, kit.sleeve, { tone });
  const armoured = kit.body === 'gusoku';
  c.rod(el, lerpP(el, hand, 0.88), robe ? 0.95 : 0.74, 0.58, armoured ? SM.iron : kit.sleeve, {
    tone,
    detail: armoured && L >= 4 ? (_x, _y, u, v) => (frac(v * 3.2) < 0.18 && u < 0.4 ? code(SM.iron, tone + 1) : -1) : undefined,
  });
  c.blob(hand, 0.34, 0.3, SM.flesh, { tone });
}

/** A leg: thigh (hakama or haidate), shin (suneate or kyahan), and the straw sandal. */
export function leg(c: Paper, hip: P2, th: number, sh: number, tilt: number, kit: Kit, far: boolean, riding = false): void {
  const L = c.L;
  // At level 1 the legs are a step darker than the body: the light reads from above.
  const tone = far || L <= 1 ? 1 : 2;
  const knee = c.q(along(hip, th + tilt, LEG_U));
  const ank = c.q(along(knee, th + sh + tilt, LEG_L));
  const robe = kit.shin === 'robe';
  // Cloth folds break the shadow side into a zig-zag (a straight dark edge would hug the outline).
  const folds = (m: Mat) => (u: number, v: number): number => (u > 0.35 ? code(m, frac(v * 2.6 + u * 0.8) < 0.5 ? tone - 1 : tone) : -1);
  const thighFold = folds(kit.legs);
  c.rod(hip, knee, robe ? 1.1 : 1.32, 0.95, kit.legs, {
    tone,
    detail: L >= 4 ? (_x, _y, u, v) => (kit.body === 'gusoku' && v > 0.25 && frac(v * 4) < 0.2 && u < 0.5 ? code(SM.lacquer, tone) : thighFold(u, v)) : undefined,
  });
  const shinMat = kit.shin === 'suneate' ? SM.iron : kit.shin === 'kyahan' ? SM.black : SM.black;
  c.rod(knee, ank, 0.8, 0.6, shinMat, {
    tone,
    detail: L >= 4 && kit.shin === 'suneate' ? (_x, _y, u, v) => (Math.abs(u) < 0.18 && v > 0.1 ? code(SM.iron, tone + 1) : folds(SM.iron)(u, v)) : L >= 4 && kit.shin === 'kyahan' ? (_x, _y, u, v) => (frac(v * 3) < 0.15 ? code(SM.cotton, 1) : folds(SM.black)(u, v)) : undefined,
  });
  if (!riding) {
    const toe = c.q(addP(ank, rot([0.95, 0.22], tilt * DEG)));
    c.rod(ank, toe, 0.55, 0.42, SM.straw, { tone: L <= 1 ? 2 : tone - 1 });
  } else c.blob(ank, 0.32, 0.26, SM.straw, { tone: L <= 1 ? 2 : tone - 1 });
}

// ------------------------------------------------------------------ things on the back

/** A sashimono: a pole from the back with a tall narrow team flag and a pale mon. */
export function sashimono(c: Paper, r: ManRig, sway: number, scale = 1): void {
  const L = c.L;
  const base = r.B(r.sx(-0.85), 2.6);
  const top = c.q(addP(base, rot([-0.1, -9.0 * scale], r.ta * DEG * 0.5)));
  stick(c, base, top, 0.24, SM.lacquer, 2);
  const w = 1.75 * scale, h = 4.0 * scale;
  const sw = c.qn(sway);
  // The flag hangs off the pole's back edge from a short crossbar, lagging the body (sway).
  const pts: P2[] = [[top[0], top[1] + 0.2], [top[0] - w, top[1] + 0.2], [top[0] - w + sw, top[1] + h], [top[0] + sw * 0.4, top[1] + h]];
  c.shape(pts, (x, y) => {
    const fx = (x + 0.5 - c.sx(top[0])) / L, fy = (y + 0.5 - c.sy(top[1])) / L;
    if (L >= 2 && Math.hypot(fx + w / 2 - sw * fy / h * 0.5, (fy - h * 0.38) * 1.0) < w * 0.27) return code(SM.cotton, 3);
    if (L >= 8 && frac((fx + 5 - sw * fy / h * 0.7 + fy * 0.12) / (w / 2.2)) < 0.1) return code(SM.team, 1); // folds
    // Shading planes cut diagonally, so their edges do not run the flag's full height.
    const sd = fx / w + (fy / h) * 0.55;
    return code(SM.team, sd > -0.05 ? 1 : sd < -0.62 ? 3 : 2);
  });
  c.rod([top[0] - w - 0.1, top[1] + 0.15], [top[0] + 0.1, top[1] + 0.15], 0.18, 0.18, SM.lacquer, { tone: 2 });
}

/** Horo: the cloth balloon on a cane frame that billows behind a mounted retainer or a lord. */
export function horo(c: Paper, r: ManRig, sway: number, big = 1): void {
  const L = c.L;
  // Pinned at the shoulders and the waist, it puffs out behind and above like a sail.
  const at = r.back ? r.B(0, 2.6) : r.B(-0.5, 2.6);
  const sw = c.qn(-sway * 0.5);
  const side: P2[] = [[0.2, -2.9], [-1.0, -3.6], [-2.4, -3.3], [-3.3, -2.0], [-3.6, -0.2], [-3.2, 1.4], [-2.2, 2.4], [-0.8, 2.6], [0.2, 2.0]];
  const pts: P2[] = r.back
    ? [[-1.3, -3.4], [-0.5, -3.8], [0.5, -3.8], [1.3, -3.4], [2.3, -1.6], [2.7, 0.6], [2.2, 2.1], [1.0, 2.7], [-1.0, 2.7], [-2.2, 2.1], [-2.7, 0.6], [-2.3, -1.6]]
    : side;
  part(c, addP(at, [sw, 0]), r.ta * 0.5, pts.map((q) => [q[0] * big, q[1] * big] as P2), (fx, fy) => {
    // Gores of cloth fan down from the top pin like a sail's panels; each seam is a dark crease
    // with a lit ridge beside it, and the lower back of the balloon falls into shadow.
    const ax = r.back ? 0 : -0.3 * big, ay = -3.4 * big;
    const ang = Math.atan2(fx - ax, fy - ay) / DEG;
    const gore = frac((ang + 90) / (r.back ? 16 : 14));
    const s = (fx / big) * 0.3 + (fy / big) * 0.35 + (r.back ? 0 : -fx / big * 0.25);
    const t = s < -0.45 + c.band ? 3 : s > 0.5 + c.band ? 1 : 2;
    if (L >= 2 && gore < (L >= 8 ? 0.1 : 0.16)) return code(SM.teamDk, Math.max(1, t));
    if (L >= 4 && gore > 0.12 && gore < 0.24 && t >= 2) return code(SM.team, Math.min(4, t + 1));
    if (r.back && L >= 2 && Math.hypot(fx, fy + 1.4) < 0.45 * big) return code(SM.cotton, 2);
    return code(SM.team, t);
  });
}

/** A bundle of nage-yari on the back, fanned out above the shoulder. */
export function javelinBundle(c: Paper, r: ManRig): void {
  const base = r.B(r.sx(-0.4), 1.4);
  for (const [dx, tone] of [[-1.3, 1], [-0.6, 2], [0.1, 2]] as [number, number][]) {
    const tip = c.q(addP(base, [r.sx(dx), -6.8]));
    c.rod(base, tip, 0.2, 0.18, SM.wood, { tone });
    c.rod(tip, addP(tip, [r.sx(dx) * 0.12, -0.9]), 0.26, 0.08, SM.steel, { tone: tone + 1 });
  }
}

/** An ebira/yazutsu quiver at the hip with the fletchings showing. */
export function quiver(c: Paper, r: ManRig): void {
  const a = r.B(r.sx(1.0), 0.6), b = r.B(r.sx(1.6), 3.4);
  c.rod(a, b, 0.75, 0.85, SM.lacquer, { tone: 2 });
  for (const dx of [-0.25, 0.1, 0.4]) c.rod(b, addP(b, [r.sx(0.35 + dx), -1.0]), 0.3, 0.2, SM.cotton, { tone: dx > 0 ? 2 : 3 });
}

/** A sheathed sword at the left hip. */
export function scabbard(c: Paper, r: ManRig): void {
  c.rod(r.B(r.sx(0.4), 0.55), r.B(r.sx(-2.6), -1.1), 0.3, 0.26, SM.lacquer, { tone: 2 });
  c.rod(r.B(r.sx(0.4), 0.55), r.B(r.sx(1.3), 1.0), 0.28, 0.26, SM.cotton, { tone: 2 });
}

// ------------------------------------------------------------------ weapons

/**
 * Katana: a long blade with its sori (the curve toward the back), drawn as one shape: a bright
 * cutting edge, the lit flat, a dark back (mune); the habaki, a gilt-rimmed tsuba, and the tsuka in
 * black with the white diamond wrap. `deg` = where the tip points. Below level 4 a plain tapered rod
 * (a shape would only add stair-steps at 1-2 px a unit).
 */
export function katana(c: Paper, grip: P2, deg: number, length = 3.5): void {
  const d = limb(deg);
  const n: P2 = [-d[1], d[0]];
  const L = c.L;
  const g0 = addP(grip, mul(d, 0.55));
  const off = (t: number) => 0.34 * t * t; // the sori: the back bows out toward the tip
  const half = (t: number) => 0.2 * (1 - t * 0.45) + (t > 0.9 ? -(t - 0.9) * 1.4 : 0);
  if (L < 4) {
    const mid = addP(addP(grip, mul(d, 0.55 + length * 0.55)), mul(n, off(0.55)));
    const tip = addP(addP(grip, mul(d, 0.55 + length)), mul(n, off(1)));
    c.rod(g0, mid, 0.3, 0.26, SM.steel, { shine: true });
    c.rod(mid, tip, 0.26, 0.12, SM.steel, { shine: true });
  } else {
    const at = (t: number, side: number): P2 => addP(addP(g0, mul(d, length * t)), mul(n, off(t) + side * Math.max(0.02, half(t))));
    const ts = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 0.95, 1];
    const pts: P2[] = [...ts.map((t) => at(t, 1)), ...ts.slice().reverse().map((t) => at(t, -1))];
    c.shape(pts, (x, y) => {
      const p: P2 = [(x + 0.5 - c.FX) / L, (y + 0.5 - c.FY) / L];
      const rel = sub(p, g0);
      const t = Math.max(0, Math.min(1, (rel[0] * d[0] + rel[1] * d[1]) / length));
      const across = (rel[0] * n[0] + rel[1] * n[1] - off(t)) / Math.max(0.05, half(t));
      // The edge is on the -n side: a bright line; the back (+n) dark; the flat lit between.
      if (across < -0.45) return code(SM.steel, 4);
      if (across > 0.45) return code(SM.iron, 1);
      return code(SM.steel, t > 0.92 ? 4 : 3);
    });
  }
  // Habaki and tsuba.
  c.rod(addP(grip, mul(d, 0.45)), addP(grip, mul(d, 0.7)), 0.3, 0.3, SM.gold, { tone: 3 });
  c.blob(addP(grip, mul(d, 0.42)), L >= 4 ? 0.46 : 0.32, L >= 4 ? 0.46 : 0.32, SM.iron, { tone: 2, detail: L >= 4 ? (_x, _y, nx, ny) => (Math.hypot(nx, ny) > 0.72 ? code(SM.gold, nx + ny < 0 ? 3 : 2) : -1) : undefined });
  // The tsuka: long enough for both hands, the wrap in diamonds.
  c.rod(addP(grip, mul(d, -1.25)), addP(grip, mul(d, 0.3)), 0.34, 0.32, SM.black, { tone: 2, detail: L >= 4 ? (_x, _y, u, v) => (Math.abs(frac(v * 5) - 0.5) * 2 < 0.55 - Math.abs(u) * 0.5 ? code(SM.cotton, 2) : -1) : undefined });
  c.blob(addP(grip, mul(d, -1.3)), 0.2, 0.2, SM.gold, { tone: 2 }); // the kashira
}

/** A pole weapon along `deg` through the grip: shaft from `butt` (units behind the grip) to `fore` (ahead). */
export function shaft(c: Paper, grip: P2, deg: number, butt: number, fore: number, mat: Mat = SM.lacquer, w = 0.24): [P2, P2] {
  const d = limb(deg);
  const a = c.q(addP(grip, mul(d, -butt))), b = c.q(addP(grip, mul(d, fore)));
  // An upright pole rises over the figure, where the light is: it keeps the base tone.
  const upright = Math.abs(((deg % 360) + 360) % 360 - 180) < 35;
  stick(c, a, b, w, mat, upright ? (c.L <= 2 ? 3 : 2) : WT(c));
  return [a, b];
}

/** Nagae-yari: a very long lacquered shaft, a gilt collar and a narrow straight blade. */
export function yari(c: Paper, grip: P2, deg: number, butt = 7, fore = 13): void {
  const [, b] = shaft(c, grip, deg, butt, fore, SM.wood, 0.24);
  const d = limb(deg);
  c.rod(addP(b, mul(d, -0.5)), b, 0.32, 0.3, SM.gold, { tone: 2 });
  c.rod(b, addP(b, mul(d, 1.6)), 0.3, 0.06, SM.steel, { shine: true });
}

/** Naginata: a long shaft with a broad curved blade; the gilt habaki and a dark collar. */
export function naginata(c: Paper, grip: P2, deg: number, butt = 3.5, fore = 6.0): void {
  const [, b] = shaft(c, grip, deg, butt, fore, SM.wood, 0.26);
  const d = limb(deg);
  const n: P2 = [-d[1], d[0]];
  c.rod(addP(b, mul(d, -0.35)), b, 0.36, 0.34, SM.gold, { tone: 2 });
  // The blade: a broad, curved shape (edge on the far side), lit on its flat.
  const pts: P2[] = [b, addP(addP(b, mul(d, 1.2)), mul(n, -0.42)), addP(addP(b, mul(d, 2.5)), mul(n, -0.25)), addP(addP(b, mul(d, 3.0)), mul(n, 0.35)), addP(addP(b, mul(d, 1.5)), mul(n, 0.22)), addP(b, mul(n, 0.2))];
  const L = c.L;
  c.shape(pts, (x, y) => {
    const fx = (x + 0.5 - c.sx(b[0])) / L, fy = (y + 0.5 - c.sy(b[1])) / L;
    const across = fx * n[0] + fy * n[1];
    return code(SM.steel, across < -0.15 ? 4 : across > 0.12 ? 2 : 3);
  });
}

/** A nage-yari (javelin) in the hand. */
export function javelin(c: Paper, grip: P2, deg: number): void {
  // At 13 px the javelin is held up in the light: a pale one-pixel line, not the dark of a weapon held low.
  if (c.L <= 1) {
    // (Snapped to a clean 1:1 or level line: a shallow one-pixel diagonal stair-steps.)
    const d0 = limb(Math.round(deg / 45) * 45);
    c.line(c.q(addP(grip, mul(d0, -2.4))), c.q(addP(grip, mul(d0, 3.6))), code(SM.wood, 3));
    c.line(c.q(addP(grip, mul(d0, 3.6))), c.q(addP(grip, mul(d0, 4.6))), code(SM.steel, 3));
    return;
  }
  const [, b] = shaft(c, grip, deg, 2.4, 3.6, SM.wood, 0.2);
  c.rod(b, addP(b, mul(limb(deg), 1.0)), 0.3, 0.06, SM.steel, { shine: true });
}

/**
 * The yumi: a very tall asymmetric bow, gripped a third of the way up; black lacquer with pale
 * rattan bindings. `axis` is the bow's long direction (180 = upright), `bend` how far it is drawn
 * (0..1); with `nock` the string is pulled to that point and an arrow lies along it.
 */
export function yumi(c: Paper, grip: P2, axis: number, bend: number, nock: P2 | null, arrow: boolean, pale = false): void {
  const L = c.L;
  const up = limb(axis);
  const fwd: P2 = [-up[1], up[0]]; // toward the target for an upright bow (screen right)
  const lo = 5.2, hi = 10.4;
  const pts: P2[] = [];
  const bulge = 1.15 + bend * 0.9;
  for (let i = 0; i <= 10; i++) {
    const s = -lo + ((hi + lo) * i) / 10;
    const k = s < 0 ? s / lo : s / hi;
    const off = bulge * (1 - k * k) - (Math.abs(k) > 0.85 ? (Math.abs(k) - 0.85) * 2.2 : 0);
    pts.push(c.q(addP(addP(grip, mul(up, s * (1 - bend * 0.06))), mul(fwd, off - 0.75))));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    // The rattan bindings from level 8; below, the bow is one unbroken line (two-pixel limbs cut
    // into segments at the same rows read as banding).
    const bind = L >= 8 && (i === 2 || i === 6 || i === 8);
    // (`pale`: at 13 px the horse archer's bow is a pale bamboo line: a black one standing high over
    // the horse reads as the figure's shadow side.)
    if (L <= 4) c.line(pts[i]!, pts[i + 1]!, L <= 1 && pale ? code(SM.wood, 4) : code(SM.black, WT(c)));
    else stick(c, pts[i]!, pts[i + 1]!, 0.26, bind ? SM.shu : SM.black, bind ? 3 : WT(c)); // lacquered rattan bindings
  }
  const top = pts[pts.length - 1]!, bot = pts[0]!;
  // The hemp string, dark with wax: a pale line along the bow's edge would light the silhouette's rim.
  const sc = c.L <= 1 ? code(SM.black, 1) : code(SM.wood, 2);
  // The braced string at rest from level 8 only: below, a one-pixel line beside the limb, ending where
  // it ends, reads as a band.
  if (L <= 4 && !nock) return;
  if (nock) {
    c.line(top, nock, sc);
    c.line(nock, bot, sc);
    if (arrow) {
      const dir = sub(grip, nock);
      const n = len(dir) || 1;
      const tip = addP(grip, mul(dir, 1.2 / n));
      c.rod(nock, tip, 0.14, 0.14, SM.wood, { tone: 3 });
      c.rod(tip, addP(tip, mul(dir, 0.5 / n)), 0.2, 0.06, SM.steel, { tone: 3 });
      c.rod(nock, addP(nock, mul(dir, 0.7 / n)), 0.32, 0.26, SM.cotton, { tone: 2 });
    }
  } else c.line(top, bot, sc);
  // The grip wrap.
  c.rod(addP(grip, mul(up, -0.35)), addP(grip, mul(up, 0.45)), 0.32, 0.32, SM.shu, { tone: 2 });
}

/** The teppō: a long octagonal iron barrel in a short wooden stock, brass bands, the lock, a slow match. */
export function teppo(c: Paper, grip: P2, deg: number, lit_: boolean): P2 {
  const d = limb(deg);
  const n: P2 = [-d[1], d[0]];
  const butt = c.q(addP(addP(grip, mul(d, -1.6)), mul(n, 0.15)));
  const fore = c.q(addP(grip, mul(d, 3.6)));
  // At level 1 the gun is drawn long: it is the gunner's signature at 13 px.
  const muzzle = c.q(addP(grip, mul(d, c.L <= 1 ? 9.6 : 7.1)));
  c.rod(butt, fore, 0.5, 0.36, SM.wood, { tone: WT(c) });
  if (c.L <= 1) stick(c, addP(grip, mul(d, 0.3)), muzzle, 0.28, SM.iron, 1);
  else c.rod(addP(grip, mul(d, 0.3)), muzzle, 0.28, 0.26, SM.iron, { shine: true });
  if (c.L >= 2) for (const k of [2.2, 4.6]) c.rod(addP(grip, mul(d, k)), addP(grip, mul(d, k + 0.25)), 0.44, 0.44, SM.gold, { tone: 2 });
  c.rod(addP(grip, mul(d, 0.2)), addP(grip, mul(d, 0.95)), 0.42, 0.4, SM.gold, { tone: 3 });
  c.blob(muzzle, 0.2, 0.2, SM.iron, { tone: 1 });
  // The serpentine and its glowing match.
  if (lit_ && c.L >= 2) c.blob(addP(addP(grip, mul(d, 0.55)), mul(n, -0.35)), 0.14, 0.14, SM.fire, { tone: 3, detail: FIRE });
  return muzzle;
}

/** Gunbai: the commander's lacquered war fan (shu face, gilt rim and sun disc) on its handle. */
export function gunbai(c: Paper, grip: P2, deg: number): void {
  const d = limb(deg);
  const neck = addP(grip, mul(d, 1.2));
  c.rod(addP(grip, mul(d, -0.5)), neck, 0.24, 0.24, SM.iron, { tone: 3 });
  const ctr = addP(grip, mul(d, 2.3));
  part(c, ctr, deg - 180, ell(0.95, 1.2, 0, 0, 16), (fx, fy) => {
    const rr = Math.hypot(fx / 0.95, fy / 1.2);
    if (rr > 0.8) return code(SM.gold, fx < 0 ? 3 : 2);
    if (c.L >= 2 && Math.hypot(fx, fy) < 0.38) return code(SM.gold, 3);
    return code(SM.shu, lit(c, 2, fx * 0.8 + fy * 0.3));
  });
}

/** A puff of powder smoke: a few grey clusters growing and drifting with `k` (0..1). */
export function smoke(c: Paper, at: P2, k: number, seed: number, size = 1): void {
  if (k <= 0 || k > 1) return;
  for (let i = 0; i < 4; i++) {
    const a = hash(i, seed, 5) * 2 - 1;
    const r = (0.5 + hash(i, seed, 7) * 0.5) * (0.6 + k * 1.4) * size;
    const p = c.q(addP(at, [(i * 0.7 * (0.4 + k) + a * 0.3) * size, (-k * (0.6 + i * 0.35) + a * 0.4) * size]));
    c.blob(p, r, r * 0.85, SM.smoke, { tone: k > 0.7 ? 1 : 2 });
  }
}

/** The muzzle flash: a short star of fire. */
export function flash(c: Paper, at: P2, deg: number, size = 1): void {
  const d = limb(deg);
  c.blob(addP(at, mul(d, 0.5 * size)), 0.75 * size, 0.55 * size, SM.fire, { tone: 3, detail: FIRE });
  c.rod(at, addP(at, mul(d, 1.8 * size)), 0.5 * size, 0.1, SM.fire, { tone: 3, detail: FIRE });
}

// ------------------------------------------------------------------ the man

/** What a man holds: drawn last, with the near hand; may also say where the far hand grips. */
export interface Held {
  /** The far hand's target (two-handed weapons), or null to pose it from fu/fl. */
  far?: (hand: P2, r: ManRig) => P2 | null;
  /** Draws the weapon from the near hand (and the far hand, if it grips). */
  draw: (c: Paper, hand: P2, farHand: P2, r: ManRig) => void;
  /** Drawn before the body (a bow held in the far hand, seen from behind). */
  behind?: boolean | ((back: boolean) => boolean);
}

/** Everything for one man, back to front. `pel` is where his pelvis is (feet stand at pel + 6.3 down). */
export function drawMan(c: Paper, p: FootPose, facing: Facing, kit: Kit, held: Held, opts: { pel?: P2; riding?: boolean; sway?: number } = {}): ManRig {
  const T = (q: P2): P2 => rot(q, p.tilt * DEG);
  const pel = opts.pel ?? T([p.px, -6.3 + p.py]);
  const r = manRig(c, p, facing, pel);
  const sway = opts.sway ?? p.sway;
  const behind = typeof held.behind === 'function' ? held.behind(r.back) : !!held.behind;
  const handN0 = c.q(along(c.q(along(r.shN, p.nu + r.tilt, ARM_U)), p.nu + p.nl + r.tilt, ARM_L));
  const farT = held.far?.(handN0, r) ?? null;
  const farArm = (): P2 => {
    if (farT) {
      const [el, h] = ik(c, r.shF, farT, ARM_U, ARM_L, 1);
      drawArm(c, r.shF, el, h, kit, true);
      return h;
    }
    return armFK(c, r.shF, p.fu + r.tilt, p.fl, kit, true);
  };
  const backThing = () => {
    if (kit.back === 'sashimono') sashimono(c, r, sway);
    else if (kit.back === 'horo') horo(c, r, sway, opts.riding ? 1.1 : 1);
    else if (kit.back === 'javelins') javelinBundle(c, r);
  };
  let handF: P2;
  if (!r.back) {
    backThing();
    if (kit.quiver) quiver(c, r);
    if (!opts.riding) leg(c, r.hipF, p.ft, p.fs, r.tilt, kit, true);
    handF = farArm();
    if (kit.sode) sode(c, r.shF, p.fu, true, false);
    if (behind) held.draw(c, handN0, handF, r);
    skirt(c, r, p, kit, 'far');
    torso(c, r, kit);
    if (kit.sword) scabbard(c, r);
    if (!opts.riding) leg(c, r.hipN, p.nt, p.ns, r.tilt, kit, false);
    skirt(c, r, p, kit, 'near');
    headgear(c, r, kit, sway * 0.6);
  } else {
    if (!opts.riding) leg(c, r.hipF, p.ft, p.fs, r.tilt, kit, true);
    handF = farArm();
    if (kit.sode) sode(c, r.shF, p.fu, true, true);
    if (behind) held.draw(c, handN0, handF, r);
    skirt(c, r, p, kit, 'far');
    torso(c, r, kit);
    if (kit.sword) scabbard(c, r);
    if (kit.quiver) quiver(c, r);
    if (!opts.riding) leg(c, r.hipN, p.nt, p.ns, r.tilt, kit, false);
    skirt(c, r, p, kit, 'near');
    headgear(c, r, kit, sway * 0.6);
    backThing();
  }
  const handN = armFK(c, r.shN, p.nu + r.tilt, p.nl, kit, false);
  if (kit.sode) sode(c, r.shN, p.nu, false, r.back);
  if (!behind) held.draw(c, handN, handF, r);
  // Fists close over what they hold.
  c.blob(handN, 0.34, 0.3, SM.flesh, { tone: 2 });
  return r;
}

// ------------------------------------------------------------------ the horse

export interface Coat {
  hide: Mat;
  mane: Mat;
  /** Socks (white lower legs). */
  socks?: boolean;
  /** Team crupper cords and tassels over the rump (shirikake). */
  tassels?: boolean;
  /** A lacquered saddle and a team saddle-cloth. */
  cloth?: Mat;
}

/** Where the horse put the rider this frame. */
export interface Mount {
  seat: P2;
  stirrupN: P2;
  stirrupF: P2;
}

/**
 * A small, deep-chested Sengoku horse in 3/4 (SE) or from behind (NE), legs posed per HorsePose,
 * mane and tail, lacquered saddle, the team crupper tassels. `layer` 'far' draws the far legs
 * (behind the rider's far leg), 'body' the rest.
 */
export function horse(c: Paper, p: HorsePose, facing: Facing, coat: Coat, layer: 'far' | 'body'): Mount {
  const L = c.L;
  const back = isBack(facing);
  const tilt = p.tilt;
  const T = (q: P2): P2 => rot(q, tilt * DEG);
  const pitch = snapDeg(p.pitch + tilt);
  const ctr = c.q(T([p.px, -6.3 + p.py]));
  const H = (x: number, y: number): P2 => addP(ctr, rot([x, y], -pitch * DEG));
  const hide = coat.hide;
  const legAt = (root: P2, u: number, l: number, far: boolean, hind: boolean) => {
    const tone = far || L <= 2 ? 1 : 2;
    const knee = c.q(along(root, u + tilt, hind ? 2.3 : 2.2));
    const fet = c.q(along(knee, u + l + tilt, hind ? 2.4 : 2.3));
    const hoof = c.q(along(fet, u + l * 0.6 + tilt + (hind ? 8 : 12), 0.75));
    c.rod(root, knee, hind ? 1.4 : 1.15, 0.62, hide, { tone });
    const sock = coat.socks && !hind && L >= 2;
    c.rod(knee, fet, 0.48, 0.4, sock ? SM.cotton : hide, { tone });
    if (L >= 4) c.blob(knee, 0.34, 0.3, hide, { tone: tone - 1 });
    c.rod(fet, hoof, 0.42, 0.5, SM.black, { tone: tone - 1 });
  };
  const fN = H(back ? 2.9 : 3.0, 1.0), fF = H(back ? 2.4 : 2.5, 0.8), hN = H(-3.0, 0.9), hF = H(-3.4, 0.7);
  const mount: Mount = { seat: H(-0.3, -2.55), stirrupN: H(0.1, 0.6), stirrupF: H(0.3, 0.4) };
  if (layer === 'far') {
    legAt(fF, p.ffu, p.ffl, true, false);
    legAt(hF, p.hfu, p.hfl, true, true);
    return mount;
  }
  const neckRoot = H(3.0, -1.1);
  const neckDir = snapDeg(180 - p.neck - pitch);
  const poll = c.q(along(neckRoot, neckDir, 3.3));
  const headDir = snapDeg(55 + p.nod - pitch * 0.5);
  const muzzle = c.q(along(poll, headDir, 2.9));
  const tailRoot = H(-4.1, -1.3);
  const tail = (front: boolean) => {
    const t1 = c.q(along(tailRoot, -p.tail + tilt - 10, 2.0));
    const t2 = c.q(along(t1, -p.tail * 0.4 + tilt - 4, 2.2));
    c.rod(tailRoot, t1, 0.65, 0.75, coat.mane, { tone: front || L <= 2 ? 2 : 1 });
    c.rod(t1, t2, 0.75, 0.35, coat.mane, { tone: front || L <= 2 ? 2 : 1 });
  };
  const headNeck = (dim0: number) => {
    // The head and neck reach forward, away from the light: a step darker at the small levels.
    const dim = dim0 + (L <= 2 && dim0 === 0 ? 1 : 0);
    // Neck: a deep tapered shape with the mane along its crest.
    c.rod(neckRoot, poll, 2.5, 1.3, hide, { tone: 2 - dim });
    c.rod(addP(neckRoot, [-0.45, -0.75]), addP(poll, [-0.35, -0.2]), 0.42, 0.34, coat.mane, { tone: 2 - dim });
    // Head: a long wedge from poll to muzzle, a cheek, an eye, an ear.
    c.rod(poll, muzzle, 1.15, 0.7, hide, { tone: 2 - dim, detail: L >= 4 ? (_x, _y, u, v) => (v > 0.15 && v < 0.3 && u < -0.1 && u > -0.55 ? code(SM.ink, 1) : -1) : undefined });
    c.blob(lerpP(poll, muzzle, 0.25), 0.62, 0.55, hide, { tone: 2 - dim });
    c.rod(poll, addP(poll, [-0.25, -0.75]), 0.32, 0.14, hide, { tone: 2 - dim });
    if (L >= 2) c.rod(lerpP(poll, muzzle, 0.3), muzzle, 0.18, 0.18, SM.lacquer, { tone: 1 }); // bridle
    if (coat.tassels) c.blob(addP(lerpP(poll, muzzle, 0.25), [0, 0.5]), 0.3, 0.25, SM.team, { tone: 2 });
  };
  if (back) {
    headNeck(1);
    legAt(fN, p.fnu, p.fnl, false, false);
  }
  // Barrel, chest, haunch.
  const bodyPts: P2[] = [H(4.4, -1.0), H(3.6, -2.2), H(1.8, -2.45), H(-0.5, -2.2), H(-2.5, -2.5), H(-4.3, -1.9), H(-4.8, -0.4), H(-4.1, 1.2), H(-2.4, 1.75), H(0.8, 1.9), H(3.0, 1.75), H(4.5, 0.5)];
  c.shape(bodyPts, (x, y) => {
    const fx = (x + 0.5 - c.sx(ctr[0])) / L, fy = (y + 0.5 - c.sy(ctr[1])) / L;
    const [bx, by] = rot([fx, fy], pitch * DEG);
    const s = by * 0.5 + bx * 0.12 + (back ? 0.15 : 0);
    // Broad satin highlights on the shoulder and the rump (craft guide: horse hide).
    const hl = Math.hypot((bx + 3.0) / 1.3, (by + 1.1) / 0.85) < 1 || (by < (L <= 2 ? -1.1 : -1.75) + c.band * 0.5 && bx < 2.4);
    if (hl && L >= 2) return code(hide, 3);
    if ((by > (L <= 2 ? 0.5 : 1.2) && L >= 2) || (L <= 1 && hide === SM.black)) return code(hide, 1);
    if (L >= 4 && Math.abs(bx - 1.9 + by * 0.35) < 0.1 && by > -1 && by < 1) return code(hide, 1); // shoulder line
    return code(hide, lit(c, 2, s));
  });
  // The saddle and its cloth.
  if (coat.cloth !== undefined) part(c, H(-0.4, -0.6), -pitch, [[-1.5, -1.0], [1.4, -1.1], [1.2, 1.3], [-1.3, 1.4]], (fx, fy) => (fy > 1.0 ? code(SM.gold, 2) : code(coat.cloth!, lit(c, 2, fx * 0.6 + fy * 0.3))));
  c.rod(H(-1.5, -2.5), H(1.2, -2.6), 0.6, 0.6, SM.lacquer, { tone: 3 });
  c.rod(H(1.15, -2.65), H(1.35, -3.2), 0.4, 0.3, SM.lacquer, { tone: 2 });
  c.rod(H(-1.45, -2.55), H(-1.7, -3.15), 0.4, 0.3, SM.lacquer, { tone: 2 });
  if (coat.tassels) {
    // Shirikake: cords over the rump, a big tassel hanging on the haunch.
    c.rod(H(-1.6, -2.1), H(-3.9, -1.2), 0.24, 0.24, SM.team, { tone: 2 });
    c.rod(H(-1.6, -1.9), H(-3.7, 0.2), 0.24, 0.24, SM.team, { tone: 1 });
    c.rod(H(-3.3, -0.6), H(-3.3 + c.qn(p.sway * 0.4), 1.2), 0.5, 0.65, SM.team, { tone: 3 });
  }
  if (!back) {
    legAt(fN, p.fnu, p.fnl, false, false);
    legAt(hN, p.hnu, p.hnl, false, true);
    tail(false);
    headNeck(0);
  } else {
    legAt(hN, p.hnu, p.hnl, false, true);
    tail(true);
  }
  return mount;
}

// ------------------------------------------------------------------ the ōzutsu

/**
 * The ōzutsu: a short, thick bronze barrel lashed to a low wooden bed, wedged up by `arm`
 * degrees, recoiling `recoil` units. Returns the muzzle point.
 */
export function ozutsu(c: Paper, p: EnginePose, facing: Facing): P2 {
  const L = c.L;
  const back = isBack(facing);
  const rec = c.qn(-p.recoil);
  const base = c.q([rec, -1.0]);
  // The bed: a heavy timber sled on two blocks, with a wedge under the barrel.
  for (const x of [-2.6, 2.2]) c.rod(addP(base, [x - 0.5, 0.5]), addP(base, [x + 0.5, 0.5]), 1.2, 1.2, SM.wood, { tone: 1 });
  c.rod(addP(base, [-3.8, -0.6]), addP(base, [3.4, -0.6]), 1.4, 1.4, SM.wood, { tone: back || L <= 1 ? 1 : 2, detail: L >= 4 ? (_x, _y, _u, v) => (frac(v * 5) < 0.06 ? code(SM.wood, 0) : -1) : undefined });
  c.rod(addP(base, [-3.0, -1.5]), addP(base, [1.0, -1.8]), 1.0, 0.6, SM.wood, { tone: 3 });
  const elev = snapDeg(90 - p.arm);
  const breech = c.q(addP(base, [-2.8, -2.4]));
  const d = limb(elev);
  const muzzle = c.q(addP(breech, mul(d, 7.4)));
  // Barrel: a thick bronze tube, flared at the muzzle, reinforcing rings, lashings to the bed.
  c.rod(breech, muzzle, 2.1, 1.7, SM.bronze, { shine: true, detail: L >= 2 ? (_x, _y, _u, v) => (Math.abs(v - 0.3) < 0.035 || Math.abs(v - 0.62) < 0.035 ? code(SM.bronze, 1) : -1) : undefined });
  c.blob(muzzle, 1.0, 1.05, SM.bronze, { tone: 2, detail: L >= 2 ? (_x, _y, nx, ny) => (Math.hypot(nx - 0.35, ny) < 0.4 ? code(SM.ink, 1) : -1) : undefined });
  c.blob(breech, 1.1, 1.1, SM.bronze, { tone: L <= 1 ? 2 : 1 });
  for (const k of [0.25, 0.55]) {
    const q = addP(breech, mul(d, 7.4 * k));
    if (L >= 2) c.rod(addP(q, [0, -1.1]), addP(q, [0.2, 1.7]), 0.36, 0.36, SM.straw, { tone: 1 });
  }
  return muzzle;
}

/** A crewman's kit: jingasa, plain dō, indigo. */
export const CREW: Kit = { head: 'jingasa', body: 'okegawa', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan', back: 'none' };

