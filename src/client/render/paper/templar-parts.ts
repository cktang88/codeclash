// The Templar Order on paper: materials and the parts its figures share (the man, helms, shields,
// weapons, the horse, the engine). Owned by the templar faction agent; see README.md.
//
// Period: the Order in the Latin East, 1150-1300. References (docs/art-references/hd-sprites.md,
// "Templar paper figures"): the Maciejowski Bible (mail head to toe under plain surcoats, kettle
// hats beside flat-topped great helms, long-necked horses, the traction trebuchet), Matthew Paris
// (the Templar pair on one horse, the Beauséant), museum mail and great helms (DHM Topfhelm,
// riveted hauberks), and Medieval II for proportions and grime. Grounded and weathered: adult
// proportions, dull grimy mail drawn as rows of rings, dirty linen, steel lit only on hard edges.
// The one saturated accent is the red cross and the army colour.

import { addP, code, DEG, defineMaterial, hash, materialCount, oklabRgb, oklchRamp, oklchRgb, okHue, rgbOklab, rot, type Mat, type P2, type Paper, type RGB } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { along, limb, snapDeg, type EnginePose, type FootPose, type HorsePose } from './rig.ts';

// ------------------------------------------------------------------ materials

/**
 * A ramp from oklchRamp's hues and chromas, with the five lightnesses set by hand. Every material
 * keeps its base tone clear of the battlefield green (OKLab L 0.47 ± 0.12): the light ones (linen,
 * mail, steel, the grey and dun horses) sit above it with a deep tone far below it, so their dark
 * outline still separates from the grass; the dark ones (wool, leather, the black surcoat) sit
 * below it. A figure then reads clearly light or clearly dark on the field.
 */
function ramp(ls: readonly [number, number, number, number, number], c: number, h: number, chroma?: readonly [number, number, number, number, number]): RGB[] {
  return oklchRamp({ l: ls[2], c, h, chroma }).map((rgb, i) => {
    const [, a, b] = rgbOklab(rgb);
    return oklabRgb(ls[i]!, a, b);
  });
}
/** Chroma held up in the shadows, so a dull material's shade never reads as dead grey. */
const WARM_SHADOW = [1.7, 1.35, 1.0, 0.8, 0.6] as const;
/**
 * The dark browns (wool, leather, wood, hair, bay, mane, the black surcoat) share their two
 * deepest tones exactly: one warm umber shadow family. The faction's small palettes (12 colours
 * at level 1) then spend one slot on it instead of scattering these shades into the red cross
 * or the cold steel darks.
 */
const UMBER: readonly [RGB, RGB] = [oklchRgb(0.17, 0.022, 28), oklchRgb(0.235, 0.026, 58)];
const umber = (r: RGB[]): RGB[] => [UMBER[0], UMBER[1], r[2]!, r[3]!, r[4]!];
/**
 * The light materials (linen, mail, steel, skin, the pale horses, gilt, ash) share one pale deep
 * tone, which is also their dark outline. A white-clad brother on a grey destrier is a light
 * figure on the dark field, separated from the grass by the value of his whole mass (ΔL ≈ 0.3),
 * the way the Maciejowski knights read against a blue ground; a near-black ring round him would
 * pull his edge back down to the field's value. So light parts get a short, compressed ramp.
 */
const PALE: RGB = oklchRgb(0.61, 0.022, 65);
const deep = (r: RGB[]): RGB[] => [PALE, r[1]!, r[2]!, r[3]!, r[4]!];

/** Turns hue `h` toward `to` by the fraction k, the short way round. */
const toward = (h: number, to: number, k: number): number => h + ((((to - h + 540) % 360) - 180) * k);
/** The army colour's ramp for an HSL heraldic hue: shadows lean violet, lights lean warm. */
function teamRamp(hue: number, ls: readonly number[], cs: readonly number[]): RGB[] {
  const h = okHue(hue);
  return ls.map((l, i) => oklchRgb(l, cs[i]!, i < 2 ? toward(h, 300, (2 - i) * 0.14) : toward(h, 85, (i - 2) * 0.08)));
}

/** Templar ramps (OKLCH, low-key). Only `red` and the army colour are saturated. */
export const TM = {
  /** The brothers' riveted mail: a dull steel grey. */
  mail: defineMaterial('templar.mail', deep(ramp([0.61, 0.645, 0.69, 0.76, 0.83], 0.016, 70, WARM_SHADOW))),
  /** The sergeants' grimier, darker mail (oiled and rusted, under a black surcoat). */
  mailDk: defineMaterial('templar.mailDk', umber(ramp([0.19, 0.25, 0.35, 0.45, 0.55], 0.02, 245))),
  /** Helm steel: cold lights, a wide ramp (hard material). */
  steel: defineMaterial('templar.steel', deep(ramp([0.61, 0.65, 0.72, 0.81, 0.9], 0.02, 235, WARM_SHADOW))),
  /** The brothers' white habit, dirty: warm off-white linen. */
  white: defineMaterial('templar.white', deep(ramp([0.61, 0.69, 0.79, 0.86, 0.92], 0.024, 88, WARM_SHADOW))),
  /** The sergeants' black-brown surcoat. */
  black: defineMaterial('templar.black', umber(ramp([0.17, 0.22, 0.27, 0.34, 0.42], 0.022, 45))),
  /** The red cross: the faction accent. */
  red: defineMaterial('templar.red', ramp([0.22, 0.28, 0.36, 0.45, 0.53], 0.14, 27, [0.85, 1.1, 1.0, 0.85, 0.7])),
  /** Quilted gambeson: dirty pale linen (the turcopoles). */
  gambeson: defineMaterial('templar.gambeson', deep(ramp([0.61, 0.65, 0.71, 0.78, 0.84], 0.04, 80, WARM_SHADOW))),
  /** Undyed wool tunics and hose: dark brown-grey. */
  wool: defineMaterial('templar.wool', umber(ramp([0.18, 0.24, 0.31, 0.38, 0.46], 0.035, 60))),
  /** The levy's padded jack, russet with dirt. */
  russet: defineMaterial('templar.russet', umber(ramp([0.18, 0.24, 0.33, 0.41, 0.49], 0.055, 45))),
  /** Sun-dark skin. */
  flesh: defineMaterial('templar.flesh', deep(ramp([0.61, 0.64, 0.68, 0.75, 0.8], 0.06, 50))),
  /** Beards and hair: dark brown. */
  hair: defineMaterial('templar.hair', umber(ramp([0.18, 0.24, 0.3, 0.38, 0.47], 0.04, 55))),
  leather: defineMaterial('templar.leather', umber(ramp([0.18, 0.24, 0.31, 0.4, 0.48], 0.055, 50))),
  wood: defineMaterial('templar.wood', umber(ramp([0.2, 0.26, 0.33, 0.42, 0.51], 0.06, 65))),
  /** Ash: pale spear shafts, lance staves and axe hafts. */
  ash: defineMaterial('templar.ashwood', deep(ramp([0.61, 0.645, 0.69, 0.75, 0.81], 0.045, 75))),
  /** Horse coats: a grey (the brothers' white destriers), a bay and a dun. */
  grey: defineMaterial('templar.grey', deep(ramp([0.61, 0.66, 0.75, 0.82, 0.89], 0.016, 80, WARM_SHADOW))),
  bay: defineMaterial('templar.bay', umber(ramp([0.19, 0.25, 0.32, 0.41, 0.5], 0.07, 45))),
  dun: defineMaterial('templar.dun', deep(ramp([0.61, 0.645, 0.69, 0.76, 0.82], 0.05, 72))),
  /** Manes, tails, hooves. */
  mane: defineMaterial('templar.mane', umber(ramp([0.15, 0.2, 0.26, 0.32, 0.39], 0.03, 50))),
  /** Gilt: the marshal's helm and belt, the banner finial. */
  gold: defineMaterial('templar.gold', deep(ramp([0.61, 0.645, 0.7, 0.78, 0.86], 0.1, 85))),
  /** The army colour (the accent): hue-stepped, shadows toward violet and lights toward warm. */
  team: defineMaterial('templar.team', (hue) => teamRamp(hue, [0.2, 0.27, 0.34, 0.43, 0.52], [0.08, 0.12, 0.14, 0.12, 0.09])),
  teamDk: defineMaterial('templar.teamDk', (hue) => teamRamp(hue, [0.17, 0.22, 0.27, 0.33, 0.4], [0.06, 0.09, 0.1, 0.09, 0.07])),
  /** Eye slits, sights, nostrils: a warm near-black that steps in hue (never neutral). */
  ink: defineMaterial('templar.ink', [oklchRgb(0.14, 0.03, 15), oklchRgb(0.17, 0.035, 28), oklchRgb(0.2, 0.035, 40), oklchRgb(0.24, 0.035, 52), oklchRgb(0.28, 0.035, 64)], { keep: true }),
} as const;

/** Pale materials as worn by a dark figure: the same lights over the umber deep tone. */
const ud = (r: RGB[]): RGB[] => [UMBER[0], r[1]!, r[2]!, r[3]!, r[4]!];
const TD = {
  steel: defineMaterial('templar.steelD', ud(ramp([0.2, 0.48, 0.66, 0.78, 0.88], 0.02, 235, WARM_SHADOW))),
  flesh: defineMaterial('templar.fleshD', ud(ramp([0.2, 0.47, 0.62, 0.71, 0.79], 0.06, 50))),
  white: defineMaterial('templar.whiteD', ud(ramp([0.2, 0.55, 0.74, 0.83, 0.9], 0.024, 88, WARM_SHADOW))),
  gambeson: defineMaterial('templar.gambesonD', ud(ramp([0.2, 0.5, 0.66, 0.75, 0.83], 0.04, 80, WARM_SHADOW))),
  gold: defineMaterial('templar.goldD', ud(ramp([0.2, 0.48, 0.64, 0.75, 0.85], 0.1, 85))),
  dun: defineMaterial('templar.dunD', ud(ramp([0.2, 0.48, 0.63, 0.72, 0.8], 0.05, 72))),
};
/** Dark materials as worn by a light figure: the grey destrier's pale mane and tail. */
const TL = {
  mane: defineMaterial('templar.maneL', deep(ramp([0.61, 0.645, 0.69, 0.76, 0.83], 0.015, 70, WARM_SHADOW))),
  /** Whitened buff leather: the brothers' belts, sword grips and saddles. */
  leather: defineMaterial('templar.leatherL', deep(ramp([0.61, 0.64, 0.67, 0.73, 0.79], 0.05, 62))),
  /** The Beauséant's sable half carried by a white brother: black cloth with the pale edge. */
  black: defineMaterial('templar.sable', deep(ramp([0.61, 0.21, 0.25, 0.31, 0.38], 0.025, 45))),
  /** The army colour on a light figure (a pale levy's shield): its outline is the pale deep tone too. */
  team: defineMaterial('templar.teamL', (hue) => deep(teamRamp(hue, [0.2, 0.27, 0.34, 0.43, 0.52], [0.08, 0.12, 0.14, 0.12, 0.09]))),
  teamDk: defineMaterial('templar.teamDkL', (hue) => deep(teamRamp(hue, [0.17, 0.22, 0.27, 0.33, 0.4], [0.06, 0.09, 0.1, 0.09, 0.07]))),
};

/**
 * Every figure is one value class on the field: dark (sergeants, levies, archers, crossbowmen,
 * turcopoles, the engine crew) or light (the white-clad brothers on grey destriers). Its parts
 * are painted in that class's version of each material, so the whole silhouette and its outline
 * stay on one side of the grass's value: pale steel on a dark figure keeps a dark deep tone,
 * and a light figure's wooden lance is pale ash.
 */
const REMAP = new Map<string, Int16Array>();
function remapFor(dark: boolean, level: number): Int16Array {
  const key = `${dark}:${Math.min(level, 4)}`;
  let t = REMAP.get(key);
  if (t && t.length >= materialCount() * 8) return t;
  t = new Int16Array(materialCount() * 8).map((_, i) => i);
  const pairs: [Mat, Mat][] = dark && level <= 1
    ? // At level 1 the pale bits of a dark figure (a helm, a face: 2-3 px) keep the pale
      // materials: the 12-colour palette has no room for a second set of lights.
      // Oiled mail under a black surcoat is one dark mass at 13 px; as one material, the arm
      // across the chest gets no contact line (which would black out a 1 px limb).
      [[TM.mail, TM.black], [TM.mailDk, TM.black], [TM.ash, TM.black], [TM.wood, TM.black], [TM.wool, TM.black], [TM.russet, TM.black], [TM.leather, TM.black], [TM.bay, TM.black], [TM.hair, TM.black], [TM.mane, TM.black]]
    : dark
    ? [[TM.steel, TD.steel], [TM.flesh, TD.flesh], [TM.white, TD.white], [TM.gambeson, TD.gambeson], [TM.gold, TD.gold], [TM.dun, TD.dun], [TM.mail, TM.mailDk], [TM.ash, TM.wood], [TM.grey, TD.white]]
    : level <= 2
      ? // At 13-26 px mail, helm steel, ash and buff leather are one pale grey mass (and the
        // small palettes have no room to tell them apart).
        [[TM.mane, TL.mane], [TM.wood, TL.mane], [TM.ash, TL.mane], [TM.mailDk, TM.grey], [TM.mail, TM.grey], [TM.steel, TM.grey], [TM.leather, TL.mane], [TM.black, TL.black], [TM.team, TL.team], [TM.teamDk, TL.teamDk]]
      : [[TM.mane, TL.mane], [TM.wood, TM.ash], [TM.mailDk, TM.mail], [TM.leather, TL.leather], [TM.black, TL.black], [TM.team, TL.team], [TM.teamDk, TL.teamDk]];
  for (const [a, b] of pairs) for (let k = 0; k < 8; k++) t[a * 8 + k] = b * 8 + k;
  REMAP.set(key, t);
  return t;
}
/** Paints `draw` on `c` in a value class (see REMAP). */
export function paintAs(c: Paper, dark: boolean, draw: () => void): void {
  const t = remapFor(dark, c.L);
  const plot = c.plot;
  c.plot = (x: number, y: number, cd: number) => plot.call(c, x, y, cd >= 0 && cd < t.length ? t[cd]! : cd);
  try {
    draw();
  } finally {
    Reflect.deleteProperty(c, 'plot');
  }
}

// ------------------------------------------------------------------ small helpers

export const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
export const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
export const lerp = (a: P2, b: P2, k: number): P2 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** A local frame (units): origin, forward axis (x) and down axis (y), both unit vectors. */
export interface Frame2 {
  o: P2;
  f: P2;
  d: P2;
}
export const frameAt = (o: P2, deg: number): Frame2 => {
  const a = snapDeg(deg) * DEG;
  return { o, f: [Math.cos(a), Math.sin(a)], d: [-Math.sin(a), Math.cos(a)] };
};
/** A point given in a frame's local units. */
export const at = (F: Frame2, x: number, y: number): P2 => [F.o[0] + F.f[0] * x + F.d[0] * y, F.o[1] + F.f[1] * x + F.d[1] * y];
/** A canvas pixel (its centre) in a frame's local units. */
export function local(c: Paper, F: Frame2, x: number, y: number): P2 {
  const dx = (x + 0.5 - c.sx(F.o[0])) / c.L, dy = (y + 0.5 - c.sy(F.o[1])) / c.L;
  return [dx * F.f[0] + dy * F.f[1], dx * F.d[0] + dy * F.d[1]];
}
/** A polygon given in a frame's local units, shaded with local coordinates. */
export function fshape(c: Paper, F: Frame2, pts: P2[], shade: (x: number, y: number, lx: number, ly: number) => number): void {
  c.shape(pts.map(([x, y]) => at(F, x, y)), (x, y) => {
    const [lx, ly] = local(c, F, x, y);
    return shade(x, y, lx, ly);
  });
}
/** Half-width test in pixels with a 1 px floor (thin painted bands survive at level 1). */
const within = (c: Paper, d: number, half: number): boolean => Math.abs(d) * c.L < Math.max(0.55, half * c.L);

/**
 * Mail rings on the pixel grid (craft guide: a dark row every third pixel row, a checker of light
 * in the lit plane only, the shadow kept flat). Part-local, so the rings ride with the part.
 * `lit` is -1 (lit side) .. 1 (shadow side). Returns -1 to leave the part's own shading.
 */
export function mailTex(c: Paper, x: number, y: number, lit: number, base = 2, m: Mat = TM.mail): number {
  if (c.L < 2) return -1;
  const ly = c.ly(y), lx = c.lx(x);
  if (c.L >= 4) {
    if (ly % 3 === 0) return code(m, base - 1 - (lit > 0.3 ? 1 : 0));
    if (lit < -0.1 && (lx + ((ly / 3) | 0)) % 2 === 0) return code(m, base + 1);
    if (lit > 0.45) return code(m, base - 1);
    // Grime and rust in the links.
    if (c.tex(x, y, 41, 3) < 0.1) return code(TM.leather, 1);
    return -1;
  }
  // Level 2: a lighter checker on the lit side only.
  if (lit < -0.2 && (lx + ly) % 3 === 0) return code(m, base + 1);
  return -1;
}
/**
 * The lit band's tone: 3, or 4 at level 1, where the budget folds tones 2 and 3 into one colour
 * and the light would otherwise vanish from a 13 px figure.
 */
export const hiTone = (c: Paper): number => (c.L <= 1 ? 4 : 3);

/** Whether a material is mail (gets the ring texture). */
export const isMail = (m: Mat): boolean => m === TM.mail || m === TM.mailDk;

// ------------------------------------------------------------------ the man

export type Helm = 'great' | 'gilded' | 'kettle' | 'nasal' | 'coif' | 'cap' | 'turban' | 'pilgrim';

/** What a man wears. */
export interface Kit {
  helm: Helm;
  /** The garment under the coat (shows at the arms and below the coat): mail, gambeson, wool. */
  body: Mat;
  /** Surcoat over it (sleeveless), or null. */
  coat: Mat | null;
  /** Red cross on the coat (front and back). */
  cross: boolean;
  /** Hem of the outer garment below the pelvis (units). */
  hem: number;
  sleeve: Mat;
  hand: Mat;
  legs: Mat;
  boots: Mat;
  beard?: boolean;
  /** Ailettes (small shoulder boards in the army colour), late 13th century. */
  ailettes?: boolean;
  /** Body size (the Iron Brethren are bigger men). */
  scale?: number;
  /** A belt colour (leather by default). */
  belt?: Mat;
  /** The mail coif under the helm (default: the body's mail, or light mail under a helm). */
  coif?: Mat | null;
}

/** Where the posed man's joints ended up, for gear and riders. */
export interface Rig {
  back: boolean;
  tilt: number;
  /** Torso angle (snapped, + forward) and its frame at the neck. */
  tor: number;
  T: Frame2;
  pel: P2;
  neck: P2;
  head: P2;
  shN: P2;
  shF: P2;
  elbowN: P2;
  elbowF: P2;
  handN: P2;
  handF: P2;
  kneeN: P2;
  kneeF: P2;
  p: FootPose;
  s: number;
}

/** Gear drawn in the man's draw order (each gets the rig). */
export interface Gear {
  /** Slung on the back: behind everything from the front, over the back from behind. */
  back?: (c: Paper, r: Rig) => void;
  /** In or on the far (shield) hand. */
  far?: (c: Paper, r: Rig) => void;
  /** In the near (weapon) hand, drawn last. */
  near?: (c: Paper, r: Rig) => void;
  /** Drawn before anything else (a planted pavise behind a crouching man from the back, etc.). */
  first?: (c: Paper, r: Rig) => void;
}

export interface ManOpts {
  /** The pelvis (units, before px/py), default standing. */
  pelvis?: P2;
  /** The point falls tilt about (default the feet). */
  pivot?: P2;
  /** Seated on a horse: legs hang (the far leg is hidden behind the horse). */
  seated?: boolean;
}

/** Computes the rig of a posed man (no drawing). */
export function rigOf(c: Paper, p: FootPose, facing: Facing, kit: Kit, o: ManOpts = {}): Rig {
  const back = isBack(facing);
  const s = kit.scale ?? 1;
  const tilt = p.tilt;
  const piv = o.pivot ?? [0, 0];
  const Tr = (q: P2): P2 => addP(piv, rot(sub(q, piv), snapDeg(tilt) * DEG));
  const base = o.pelvis ?? [0, -6.5 * s];
  const pel = c.q(Tr([base[0] + p.px, base[1] + p.py]));
  const tor = snapDeg(p.torso + tilt);
  const up = limb(180 - tor);
  const neck = c.q(addP(pel, mul(up, 4.9 * s)));
  const T = frameAt(neck, tor);
  const shN = at(T, back ? 0.95 * s : -0.85 * s, 0.55 * s);
  const shF = at(T, back ? -0.8 * s : 1.2 * s, 0.4 * s);
  const hipN = addP(pel, rot(back ? [0.5 * s, 0.2] : [-0.45 * s, 0.2], tilt * DEG));
  const hipF = addP(pel, rot(back ? [-0.4 * s, 0.05] : [0.5 * s, 0.05], tilt * DEG));
  const elbowN = along(shN, p.nu + tilt, 2.35 * s);
  const handN = along(elbowN, p.nu + p.nl + tilt, 2.15 * s);
  const elbowF = along(shF, p.fu + tilt, 2.35 * s);
  const handF = along(elbowF, p.fu + p.fl + tilt, 2.15 * s);
  const kneeN = along(hipN, p.nt + tilt, 3.2 * s);
  const kneeF = along(hipF, p.ft + tilt, 3.2 * s);
  const head = c.q(at(T, 0.15 * s, -1.2 * s));
  return { back, tilt, tor, T, pel, neck, head, shN, shF, elbowN, elbowF, handN, handF, kneeN, kneeF, p, s };
}

/** One leg: thigh, knee, shin, boot and foot. */
function leg(c: Paper, hip: P2, knee: P2, sh: number, tilt: number, kit: Kit, far: boolean, s: number, seated: boolean): void {
  const ank = along(knee, sh + tilt, (seated ? 2.7 : 3.0) * s);
  // The light falls from above: thighs at the body's tone, shins (under the skirt's shadow) and
  // boots a step darker, the far leg a step darker again.
  const tone = far ? 1 : 2;
  const shin = Math.max(1, tone - 1);
  const legMat = kit.legs;
  const det = (t: number) => (isMail(legMat) ? (x: number, y: number, u: number) => mailTex(c, x, y, u, t, legMat) : undefined);
  c.rod(hip, knee, 1.1 * s, 0.85 * s, legMat, { tone, detail: det(tone) });
  c.rod(knee, ank, 0.82 * s, 0.6 * s, legMat, { tone: shin, detail: det(shin) });
  // Knee: a small cap (mail knees bulge; a poleyn on the brothers is too late for the period).
  if (c.L >= 2) c.blob(knee, 0.48 * s, 0.42 * s, legMat, { tone });
  // Boot (turnshoe or ankle boot) and the foot.
  const bootTop = lerp(knee, ank, 0.62);
  c.rod(bootTop, ank, 0.68 * s, 0.62 * s, kit.boots, { tone: shin });
  const toe = addP(ank, rot([0.95 * s, 0.22], (seated ? 25 : 0) * DEG + tilt * DEG));
  c.rod(ank, toe, 0.6 * s, 0.42 * s, kit.boots, { tone: shin });
}

/** One arm: sleeve, elbow, forearm and hand (mail mitten or bare). */
function arm(c: Paper, sh: P2, el: P2, hand: P2, kit: Kit, far: boolean, s: number): void {
  // At level 2 the near (lit) arm takes the lit tone: a 2 px limb has no room for a lit edge.
  const tone = far ? 1 : c.L === 2 ? 3 : 2;
  const m = kit.sleeve;
  const det = isMail(m) ? (x: number, y: number, u: number) => mailTex(c, x, y, u, tone, m) : undefined;
  c.rod(sh, el, 0.95 * s, 0.78 * s, m, { tone, detail: det });
  c.rod(el, hand, 0.78 * s, 0.6 * s, m, { tone, detail: det });
  c.blob(hand, 0.4 * s, 0.38 * s, kit.hand, { tone });
}

/** The body: torso and skirt in one outline, the coat with its cross, the belt. */
function torso(c: Paper, r: Rig, kit: Kit, sway: number): void {
  const { T, pel, kneeN, kneeF, s, back } = r;
  const mat = kit.coat ?? kit.body;
  const hem = kit.hem;
  const L = c.L;
  const kx0 = Math.min(kneeN[0], kneeF[0], pel[0] - 1.25 * s) - 0.3 * s + sway;
  const kx1 = Math.max(kneeN[0], kneeF[0], pel[0] + 1.25 * s) + 0.3 * s + sway;
  const hy = pel[1] + hem * s;
  // The shoulders are narrower than the sleeves (a sleeveless surcoat), wider for a hauberk.
  const sw = kit.coat ? 1.0 : 1.25;
  const pts: P2[] = [
    at(T, -1.1 * s * sw, -0.1 * s), at(T, 1.05 * s * sw, -0.1 * s), at(T, 1.45 * s, 0.7 * s), at(T, 1.25 * s, 2.6 * s), at(T, 1.12 * s, 3.7 * s),
    // The hem dips at the back and rises toward the striding front leg: never one level row.
    [kx1, hy - 0.55 * s], [kx1 - (kx1 - kx0) * 0.35, hy - 0.05 * s], [(kx0 + kx1) / 2 - 0.3, hy + 0.3 * s], [kx0, hy + 0.1 * s],
    at(T, -1.2 * s, 3.7 * s), at(T, -1.35 * s, 2.6 * s), at(T, -1.55 * s, 0.7 * s),
  ];
  const hyPx = c.sy(hy);
  const crossX = back ? -0.15 : 0.2;
  const mailBody = isMail(mat);
  const quilt = mat === TM.gambeson;
  c.poly(pts.map((q) => [c.sx(q[0]), c.sy(q[1])] as P2), (x, y) => {
    const [lx, ly] = local(c, T, x, y);
    const lit = lx < -0.5 * s ? -1 : lx > 0.8 * s ? 1 : 0;
    // The cross: a vertical bar and a cross-bar on the chest (or the back).
    if (kit.cross && kit.coat && ly > 0.55 * s && ly < 3.1 * s) {
      const vx = lx - crossX * s;
      if ((within(c, vx, 0.3 * s) && ly > 0.65 * s) || (within(c, ly - 1.45 * s, 0.27 * s) && Math.abs(vx) < 1.0 * s)) return code(TM.red, lit < 0 ? 3 : lit > 0 ? 1 : 2);
    }
    // Belt at the waist.
    if (within(c, ly - 3.65 * s, 0.2 * s)) {
      if (L >= 4 && Math.abs(lx - (back ? -0.6 : 0.55) * s) < 0.2) return code(TM.steel, 3);
      return code(kit.belt ?? TM.leather, lit < 0 ? 2 : 1);
    }
    const fromHem = (hyPx - y) / L;
    // At level 1 the light falls across a diagonal (upper left to lower right), so the lit and
    // shaded clusters end on different rows and columns rather than in parallel stripes.
    const diag = (lx + 0.45 * ly) / s;
    let tone = L <= 1 ? (diag < 0.1 ? hiTone(c) : diag > 2.6 ? 1 : 2) : lit < 0 ? 3 : lit > 0 ? 1 : 2;
    if (mailBody) {
      const m = mailTex(c, x, y, lit, tone, mat);
      if (m >= 0) return m;
    }
    if (L >= 4 && ly > 3.9 * s) {
      // Skirt folds: dark channels with a lit ridge beside each, slanting with the stride.
      const fx = lx + (ly - 4) * 0.12 + sway * 0.4;
      for (const f0 of [-0.35, 0.5]) {
        if (Math.abs(fx - f0 * s) < 0.11) return code(mat, tone - 1);
        if (Math.abs(fx - (f0 - 0.2) * s) < 0.09) return code(mat, Math.min(4, tone + 1));
      }
    }
    if (quilt && L >= 4 && ly < 3.5 * s && (c.ly(y) % Math.max(3, L)) === 0) return code(mat, tone - 1);
    // Dirt rising from the hem and grime at the armpits.
    if (L >= 4 && fromHem < 1.1 && c.tex(x, y, 47, 3) < 0.42 - fromHem * 0.3) return code(mat, tone - 1);
    if (L >= 2 && fromHem < 0.45) tone = Math.max(1, tone - 1);
    return code(mat, tone);
  });
}

/** A man, posed, facing SE (front) or NE (back), with his gear. */
export function man(c: Paper, p: FootPose, facing: Facing, kit: Kit, gear: Gear = {}, o: ManOpts = {}): Rig {
  const r = rigOf(c, p, facing, kit, o);
  const { back, tilt, s } = r;
  const hipN = addP(r.pel, rot(back ? [0.5 * s, 0.2] : [-0.45 * s, 0.2], tilt * DEG));
  const hipF = addP(r.pel, rot(back ? [-0.4 * s, 0.05] : [0.5 * s, 0.05], tilt * DEG));
  const sway = c.qn(p.sway);
  gear.first?.(c, r);
  if (back) gear.far?.(c, r);
  else gear.back?.(c, r);
  if (!o.seated) leg(c, hipF, r.kneeF, p.fs, tilt, kit, true, s, false);
  leg(c, hipN, r.kneeN, p.ns, tilt, kit, false, s, !!o.seated);
  // At level 1 the head is two or three pixels: drawn before the body, so the contact line where
  // it sits on the shoulders falls on nothing (drawn after, it would darken the whole head).
  const small = c.L <= 1;
  const neckAndHead = () => {
    c.rod(r.neck, at(r.T, 0.1 * s, -0.6 * s), 0.8 * s, 0.75 * s, coifOf(kit) ?? TM.flesh, { tone: 1 });
    head(c, r, kit);
  };
  if (small) neckAndHead();
  arm(c, r.shF, r.elbowF, r.handF, kit, true, s);
  if (!back) gear.far?.(c, r);
  torso(c, r, kit, sway);
  if (!small) neckAndHead();
  if (back) gear.back?.(c, r);
  arm(c, r.shN, r.elbowN, r.handN, kit, false, s);
  if (kit.ailettes) ailette(c, r);
  gear.near?.(c, r);
  return r;
}

/**
 * An ailette: a small square board standing on the near shoulder in the army colour with a pale
 * cross (the far one is hidden by the head).
 */
function ailette(c: Paper, r: Rig): void {
  const F = frameAt(addP(r.shN, [0, -0.3 * r.s]), r.tor - 10);
  const w = 0.72 * r.s;
  fshape(c, F, [[-w, -1.0 * r.s], [w, -1.0 * r.s], [w, 0.35 * r.s], [-w, 0.35 * r.s]], (_x, _y, lx, ly) => {
    if (within(c, lx, 0.13 * r.s) || within(c, ly + 0.3 * r.s, 0.12 * r.s)) return code(TM.white, 3);
    return code(TM.team, lx < 0 ? 3 : 2);
  });
}

// ------------------------------------------------------------------ heads

/** The mail coif a man wears under his helm (his body's mail, else the kit's), or null. */
function coifOf(kit: Kit): Mat | null {
  if (kit.coif !== undefined) return kit.coif;
  if (isMail(kit.body)) return kit.body;
  if (isMail(kit.sleeve)) return kit.sleeve;
  return kit.helm === 'kettle' || kit.helm === 'nasal' || kit.helm === 'coif' || kit.helm === 'great' || kit.helm === 'gilded' ? TM.mail : null;
}

/** The face (front three-quarter) or the back of the head, then the helm over it. */
export function head(c: Paper, r: Rig, kit: Kit): void {
  const ang = snapDeg(r.p.head + r.tor * 0.5);
  const F = frameAt(r.head, ang);
  const s = r.s;
  const h = kit.helm;
  const closed = h === 'great' || h === 'gilded';
  if (!closed) {
    // Mail coif round the face for armoured men; a cloth hood or bare head for the rest.
    const hood = coifOf(kit) ?? (h === 'cap' ? TM.wool : null);
    if (hood !== null) {
      c.blob(at(F, -0.05 * s, 0.05 * s), 1.05 * s, 1.15 * s, hood, { tone: 2, detail: isMail(hood) ? (x, y, nx) => mailTex(c, x, y, nx, 2, hood) : undefined });
    }
    if (!r.back) face(c, F, s, kit, hood !== null);
    else if (hood === null) c.blob(F.o, 0.9 * s, 1.0 * s, TM.hair, { tone: 2 });
  }
  helm(c, F, s, h, r.back);
}

/** The face: brow shadow, the eye, a nose, a beard. */
function face(c: Paper, F: Frame2, s: number, kit: Kit, framed: boolean): void {
  const o = at(F, framed ? 0.32 * s : 0.12 * s, 0.12 * s);
  const rx = (framed ? 0.62 : 0.85) * s, ry = (framed ? 0.75 : 0.95) * s;
  const Fo = { ...F, o };
  c.blob(o, rx, ry, TM.flesh, {
    detail: (x, y) => {
      const [lx, ly] = local(c, Fo, x, y);
      const nx = lx / rx, ny = ly / ry;
      // The eye: a small dark socket under the brow, forward of centre (2x2 px at level 8).
      if (c.L >= 2 && Math.abs(nx - 0.3) * rx * c.L < Math.max(0.6, c.L * 0.14) && Math.abs(ny + 0.1) * ry * c.L < Math.max(0.6, c.L * 0.12)) return code(TM.ink, 2);
      // Brow shadow and the lit nose ridge and cheek, from level 4.
      if (c.L >= 4 && ny < -0.3 && ny > -0.45 && nx > 0.0) return code(TM.flesh, 1);
      if (c.L >= 4 && nx > 0.6 && ny > -0.15 && ny < 0.25) return code(TM.flesh, 3);
      if (c.L >= 4 && nx < -0.1 && nx > -0.6 && ny > -0.05 && ny < 0.2) return code(TM.flesh, 3);
      // Beard: the jaw and chin, rough-edged, a grizzled brown (the Rule forbade shaving).
      if (kit.beard !== false && ny > 0.42 + (c.L >= 4 ? hash(c.lx(x) >> 1, 0, 5) * 0.15 : 0)) return code(TM.hair, nx < 0 ? 4 : 3);
      return -1;
    },
  });
}

/** Helms: the flat-topped great helm, the kettle hat, the conical nasal helm, cloth caps, the pilgrim hat. */
function helm(c: Paper, F: Frame2, s: number, h: Helm, back: boolean): void {
  const L = c.L;
  if (h === 'great' || h === 'gilded') {
    const gild = h === 'gilded';
    // Flat-topped great helm (DHM Topfhelm, Met 468633): a slightly tapered barrel, a flat crown.
    fshape(c, F, [[-0.95 * s, -1.25 * s], [0.9 * s, -1.25 * s], [1.08 * s, 0.1 * s], [1.0 * s, 1.15 * s], [-1.0 * s, 1.15 * s], [-1.08 * s, 0.1 * s]], (_x, _y, lx, ly) => {
      const lit = lx < -0.55 * s ? 2 : lx > 0.6 * s ? -1 : 0;
      const t = (q: number) => code(TM.steel, Math.max(0, Math.min(4, q)));
      // Crown plate: a lit rim on top.
      if (ly < -1.05 * s) return gild ? code(TM.gold, 3) : t(3);
      if (!back) {
        const barX = 0.3 * s;
        // The cross-shaped reinforcement: a vertical bar and the brow band (gilt on the marshal's).
        const onBar = within(c, lx - barX, 0.15 * s) && ly > -1.0 * s && ly < 0.95 * s;
        const onBrow = within(c, ly + 0.5 * s, 0.13 * s) && lx > -0.85 * s;
        // The sights: two dark slits either side of the bar.
        if (within(c, ly + 0.15 * s, 0.11 * s) && lx > -0.55 * s && lx < 1.0 * s && !within(c, lx - barX, 0.12 * s)) return code(TM.ink, 0);
        if (onBar || onBrow) return gild ? code(TM.gold, lit > 0 ? 4 : 3) : t(3 + (lit > 0 ? 1 : 0));
        // Breaths: a grid of holes on the forward cheek.
        if (L >= 4 && lx > 0.5 * s && lx < 0.95 * s && ly > 0.25 * s && ly < 0.85 * s && c.lx(_x) % 3 === 0 && c.ly(_y) % 3 === 0) return code(TM.ink, 1);
      } else {
        // The back: a riveted seam down the centre and a lower rim.
        if (within(c, lx + 0.1 * s, 0.08 * s) && ly > -1.0 * s) return t(1);
        if (L >= 4 && ly > 0.85 * s && c.lx(_x) % 4 === 0) return t(4);
        if (gild && within(c, ly + 0.5 * s, 0.12 * s)) return code(TM.gold, 3);
      }
      // A dent and scratches; the lower rim darker.
      if (L >= 4 && c.tex(_x, _y, 61, 3) < 0.07) return t(1 + lit);
      if (ly > 0.95 * s) return t(1);
      return t(2 + lit);
    });
    return;
  }
  if (h === 'kettle' || h === 'pilgrim') {
    const pil = h === 'pilgrim';
    const m = pil ? TM.wool : TM.steel;
    // Crown (a low dome, or the pilgrim's felt crown), then the wide brim.
    c.blob(at(F, 0.05 * s, -0.75 * s), 0.9 * s, (pil ? 0.62 : 0.6) * s, m, { tone: pil ? 2 : 2, shine: !pil });
    // The pilgrim brim is turned up behind and shades the eyes in front (it reaches forward).
    const b = at(F, (pil ? 0.35 : 0.05) * s, -0.5 * s);
    c.blob(b, (pil ? 1.75 : 1.55) * s, 0.3 * s, m, {
      tone: pil ? 1 : 2,
      detail: (x, _y, _nx, ny) => {
        if (ny < -0.3) return code(m, pil ? 3 : 4);
        if (!pil && L >= 4 && hash(c.lx(x) >> 1, 1, 3) < 0.12) return code(TM.leather, 1);
        return -1;
      },
    });
    // The pilgrim's scallop badge on the turned-up brim.
    if (pil && !back && L >= 2) c.blob(at(F, 0.45 * s, -0.62 * s), 0.25 * s, 0.22 * s, TM.white, { tone: 3 });
    return;
  }
  if (h === 'nasal') {
    fshape(c, F, [[-0.95 * s, -0.25 * s], [-0.6 * s, -1.0 * s], [0.0, -1.55 * s], [0.6 * s, -1.0 * s], [0.95 * s, -0.25 * s]], (_x, _y, lx) => code(TM.steel, lx < -0.3 * s ? 3 : lx > 0.4 * s ? 1 : 2));
    if (!back) c.rod(at(F, 0.55 * s, -0.4 * s), at(F, 0.6 * s, 0.45 * s), 0.25 * s, 0.22 * s, TM.steel, { tone: 3 });
    return;
  }
  if (h === 'turban') {
    // A spiked cap wrapped in a linen turban: banded folds, the spike on top.
    c.rod(at(F, 0, -1.2 * s), at(F, 0, -1.95 * s), 0.35 * s, 0.12 * s, TM.steel, { tone: 3 });
    c.blob(at(F, 0, -0.55 * s), 1.05 * s, 0.72 * s, TM.white, {
      tone: 2,
      detail: (x, y, nx, ny) => (L >= 4 && (c.ly(y) + (c.lx(x) >> 2)) % 4 === 0 ? code(TM.white, nx < 0 ? 2 : 1) : ny > 0.6 ? code(TM.white, 1) : -1),
    });
    return;
  }
  if (h === 'cap') {
    // A cloth arming cap tied under the chin.
    c.blob(at(F, -0.05 * s, -0.55 * s), 0.95 * s, 0.6 * s, TM.wool, { tone: 2 });
    return;
  }
  // 'coif': the mail hood alone, already drawn.
}

// ------------------------------------------------------------------ shields

const KITE: P2[] = [[-1.55, -2.35], [1.55, -2.35], [1.45, -0.3], [0, 2.95], [-1.45, -0.3]];

/** The kite shield, face on (team field, a pale cross, iron rim, scars) or from behind (planks, straps). */
export function kite(c: Paper, ctr: P2, tilt: number, back: boolean, size = 1, squash = 0.82, temple = false): void {
  tilt = snapDeg(tilt);
  const field = temple ? TM.white : TM.team, charge = temple ? TM.red : TM.white;
  const k = size * (c.L === 1 ? 1.15 : 1);
  const F = frameAt(ctr, tilt);
  fshape(c, F, KITE.map(([x, y]) => [x * squash * k, y * k] as P2), (x, y, lx0, ly0) => {
    const lx = lx0 / (squash * k), ly = ly0 / k;
    const half = ly < -0.3 ? 1.55 : 1.45 * (1 - (ly + 0.3) / 3.25);
    const edge = half - Math.abs(lx);
    // The iron rim (at 13 px it would be a pale ring round a dark shield: the field runs out).
    if ((edge < 0.3 || ly < -2.1) && c.L >= 2) return code(TM.steel, edge < 0.14 || ly < -2.22 ? 1 : lx < 0 ? 3 : 2);
    if (back) {
      if (Math.abs(ly + 1.0) < 0.2 || Math.abs(ly - 0.4) < 0.2) return code(TM.leather, 2);
      const plank = (lx + 3) * 1.4;
      if (c.L >= 4 && Math.abs((plank % 1) - 0.5) > 0.42) return code(TM.wood, 0);
      return code(TM.wood, 1);
    }
    // The brothers' shield, as Matthew Paris draws it: argent, a chief sable.
    if (temple && ly < -1.15) return code(TM.black, lx < -0.4 ? 3 : 2);
    // The sergeants' pale cross on the army colour.
    // (At 13 px the shield is three pixels wide: the plain field reads, a cross would fill it.)
    if (!temple && c.L >= 2 && ((within(c, lx, 0.24) && ly > -2.0 && ly < 2.3) || (within(c, ly + 0.85, 0.22) && Math.abs(lx) < 1.3))) return code(charge, lx < 0 ? 3 : 2);
    if (c.L >= 4 && hash(c.lx(x) >> 1, c.ly(y) >> 2, 71) < 0.06) return code(temple ? TM.white : TM.teamDk, 1);
    return code(field, lx < -0.4 ? 3 : lx > 0.6 ? 1 : 2);
  });
}

/** A round shield: team field, a dark boss, a rim (face on), or planks and the grip (back). */
export function round(c: Paper, ctr: P2, r: number, back: boolean, squash = 0.8): void {
  const k = c.L === 1 ? 1.15 : 1;
  c.blob(ctr, r * squash * k, r * k, back ? TM.wood : TM.team, {
    detail: (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.82) return code(TM.leather, nx + ny < 0 ? 2 : 1);
      if (back) return Math.abs(ny) < 0.16 ? code(TM.leather, 2) : -1;
      if (d < 0.26) return code(TM.steel, nx + ny < -0.1 ? 4 : 2);
      // Quartered: two quarters a darker shade (bold two-colour charge, Met 23346).
      if (c.L >= 2 && nx * ny > 0) return code(TM.teamDk, nx < 0 ? 2 : 1);
      if (c.L >= 4 && c.tex(x, y, 77, 3) < 0.06) return code(TM.wood, 1);
      return -1;
    },
  });
}

/** The pavise: a tall board with a keel, team field, a pale cross and a painted border. */
export function pavise(c: Paper, ctr: P2, tilt: number, back: boolean, size = 1): void {
  const k = size * (c.L === 1 ? 1.2 : 1);
  const F = frameAt(ctr, snapDeg(tilt));
  const w = 1.75 * k, h = 3.2 * k;
  fshape(c, F, [[-w, -h], [w, -h * 0.95], [w * 0.95, h], [-w * 0.95, h * 1.02]], (x, y, lx, ly) => {
    const ex = w - Math.abs(lx), ey = h - Math.abs(ly);
    if (back) {
      if (ex < 0.25 || ey < 0.25) return code(TM.wood, 1);
      if (Math.abs(ly + 0.6 * k) < 0.18 || Math.abs(ly - 1.2 * k) < 0.18) return code(TM.leather, 2);
      return code(TM.wood, c.L >= 4 && Math.abs(((lx + 5) * 1.3) % 1 - 0.5) > 0.43 ? 1 : lx < 0 ? 3 : 2);
    }
    if (ex < 0.28 || ey < 0.28) return code(TM.white, ex < 0.12 || ey < 0.12 ? 1 : 2);
    // The keel down the middle catches the light on its left face.
    if (within(c, lx, 0.12)) return code(TM.team, 3);
    if ((within(c, lx, 0.3) && Math.abs(ly + 0.3 * k) < 1.7 * k) || (within(c, ly + 0.8 * k, 0.28) && Math.abs(lx) < 1.1 * k)) return code(TM.white, lx < 0 ? 3 : 2);
    if (c.L >= 4 && c.tex(x, y, 83, 3) < 0.07) return code(TM.teamDk, 1);
    return code(TM.team, lx < 0 ? 2 : 1);
  });
}

// ------------------------------------------------------------------ weapons

/** An arming sword from the grip along `deg` (absolute; 180 = up): blade, cross-guard, pommel. */
export function sword(c: Paper, grip: P2, deg: number, len = 5.4): void {
  const tip = along(grip, deg, len);
  const g0 = along(grip, deg, 0.45);
  c.rod(g0, tip, 0.42, 0.16, TM.steel, { shine: true, detail: (x, y, _u, v) => (c.L >= 4 && v > 0.05 && v < 0.75 && c.tex(x, y, 63) < 0.08 ? code(TM.steel, 1) : -1) });
  const side = mul(limb(deg + 90), 0.75);
  c.rod(addP(g0, side), sub(g0, side), 0.26, 0.26, TM.steel, { tone: 1 });
  c.rod(grip, along(grip, deg + 180, 0.75), 0.26, 0.24, TM.leather, { tone: 1 });
  c.blob(along(grip, deg + 180, 0.95), 0.27, 0.27, TM.steel, { tone: 2 });
}

/** A spear or lance from the grip: haft `fwd` ahead and `aft` behind along `deg`, a leaf head. */
export function spear(c: Paper, grip: P2, deg: number, fwd: number, aft: number, opts: { head?: number; pennon?: number | null; w?: number; wood?: Mat } = {}): P2 {
  const tip = along(grip, deg, fwd);
  const butt = along(grip, deg + 180, aft);
  const w = opts.w ?? 0.3;
  c.rod(butt, tip, w, w * 0.85, opts.wood ?? TM.ash, { tone: 2 });
  if (c.L < 2) c.line(butt, tip, code(opts.wood ?? TM.ash, 2));
  // Leaf head with a midrib and a socket (Met 26470), oversized to read.
  const hl = opts.head ?? 1.5;
  const h0 = along(tip, deg + 180, 0.35);
  const h1 = along(tip, deg, hl);
  const side = limb(deg + 90);
  const mid = lerp(h0, h1, 0.35);
  c.shape([h0, addP(mid, mul(side, 0.42)), h1, sub(mid, mul(side, 0.42))], (x, y) => {
    const q = local(c, frameAt(h0, deg - 90), x, y);
    if (c.L >= 4 && Math.abs(q[1]) < 0.08) return code(TM.steel, 1);
    return code(TM.steel, q[1] < 0 ? 4 : 2);
  });
  c.rod(along(tip, deg + 180, 0.6), h0, 0.3, 0.3, TM.steel, { tone: 1 });
  if (opts.pennon !== undefined && opts.pennon !== null) pennon(c, along(tip, deg + 180, 0.55), deg, opts.pennon);
  return tip;
}

/** A swallow-tailed pennon in the army colour, streaming back from a staff point. */
export function pennon(c: Paper, p0: P2, deg: number, flap: number): void {
  const down = along(p0, deg + 180, 1.1);
  const back: P2 = [-1, 0];
  const len = 2.8;
  const t1: P2 = addP(p0, addP(mul(back, len), [0, 0.3 + flap * 0.4]));
  const t2: P2 = addP(down, addP(mul(back, len), [0.2, 0.2 + flap * 0.5]));
  const notch = lerp(lerp(p0, down, 0.5), lerp(t1, t2, 0.5), 0.7);
  c.shape([p0, t1, notch, t2, down], (x) => code(TM.team, c.sx(p0[0]) - x < (len * c.L) / 2 ? 2 : 1));
}

/** A Dane axe: a long haft and a wide crescent head (Bayeux; the Iron Brethren's arm). */
export function daneAxe(c: Paper, grip: P2, deg: number, smear: number | null): void {
  const top = along(grip, deg, 5.8);
  const butt = along(grip, deg + 180, 2.4);
  if (smear !== null) c.smear(grip, smear, deg, 3.6, 6.6, TM.steel);
  c.rod(butt, top, 0.34, 0.3, TM.ash, { tone: 2 });
  // The head: a thin crescent blade forward of the haft near the top, the bit flaring.
  const a = along(top, deg + 180, 0.2), b = along(top, deg + 180, 1.5);
  const out = limb(deg + 90); // forward of the haft
  const e0 = addP(along(top, deg, 0.5), mul(out, 1.55));
  const e1 = addP(along(top, deg + 180, 2.2), mul(out, 1.45));
  const mid = addP(lerp(a, b, 0.5), mul(out, 0.7));
  c.shape([a, e0, addP(lerp(e0, e1, 0.5), mul(out, 0.25)), e1, b, mid], (x, y) => {
    const q = local(c, frameAt(lerp(a, b, 0.5), deg - 90), x, y);
    // The cutting edge is lit, the cheek darker, a rust bloom near the eye.
    if (q[1] > 1.1) return code(TM.steel, 4);
    if (c.L >= 4 && q[1] < 0.6 && c.tex(x, y, 91, 2) < 0.2) return code(TM.leather, 1);
    return code(TM.steel, q[1] > 0.6 ? 3 : 2);
  });
}

/** A bow held at `grip`, its limbs along `deg` (the stave's axis, 180 = up), bent by `draw` 0..1. */
export function bow(c: Paper, grip: P2, deg: number, len: number, draw: number, nock: P2 | null): void {
  const ax = limb(deg), side = limb(deg - 90); // bow belly bends toward the archer (back)
  const bend = 0.7 + draw * 0.9;
  const pts: P2[] = [];
  for (let i = -4; i <= 4; i++) {
    const t = i / 4;
    pts.push(addP(addP(grip, mul(ax, (t * len) / 2)), mul(side, -(1 - t * t) * bend + bend * 0.6)));
  }
  const tipA = pts[0]!, tipB = pts[8]!;
  // The string: to the nock when drawn, else straight between the tips.
  if (nock) {
    c.line(tipA, nock, code(TM.white, 2));
    c.line(nock, tipB, code(TM.white, 2));
  } else c.line(tipA, tipB, code(TM.white, 1));
  for (let i = 0; i < 8; i++) c.rod(pts[i]!, pts[i + 1]!, i === 3 || i === 4 ? 0.36 : 0.3, i === 3 || i === 4 ? 0.36 : 0.26, TM.ash, { tone: i < 4 ? 2 : 1 });
  // At level 1 the stave is thinner than a pixel: a 1 px line keeps the bow, the archer's signature.
  if (c.L < 2) for (let i = 0; i < 8; i++) c.line(pts[i]!, pts[i + 1]!, code(TM.ash, 2));
  c.blob(grip, 0.3, 0.3, TM.leather, { tone: 1 });
}

/** An arrow from nock along deg. */
export function arrow(c: Paper, nock: P2, deg: number, len = 4.6): void {
  const tip = along(nock, deg, len);
  c.rod(nock, tip, 0.18, 0.18, TM.ash, { tone: 3 });
  c.rod(along(tip, deg + 180, 0.4), tip, 0.3, 0.12, TM.steel, { tone: 2 });
  c.rod(nock, along(nock, deg, 0.7), 0.42, 0.3, TM.white, { tone: 2 });
}

/** A quiver on the hip or back: a leather tube with fletchings. */
export function quiver(c: Paper, top: P2, deg: number): void {
  const bot = along(top, deg + 180, 3.0);
  c.rod(top, bot, 0.8, 0.65, TM.leather, { tone: 2 });
  for (const k of [-0.25, 0.05, 0.3]) c.rod(addP(top, [k, 0.1]), along(addP(top, [k, 0.1]), deg + (k * 30), 0.9), 0.3, 0.3, TM.white, { tone: k < 0 ? 3 : 2 });
}

/** A crossbow: a stock along deg from the grip, the steel prod across its front, the string. */
export function crossbow(c: Paper, grip: P2, deg: number, spanned: number): void {
  const nose = along(grip, deg, 2.0);
  const butt = along(grip, deg + 180, 1.6);
  const side = limb(deg + 90);
  const prodC = along(nose, deg + 180, 0.15);
  const pa = addP(prodC, mul(side, 1.5)), pb = sub(prodC, mul(side, 1.5));
  const bendK = 0.25 + spanned * 0.35;
  const pa2 = along(pa, deg + 180, bendK), pb2 = along(pb, deg + 180, bendK);
  const nut = along(grip, deg, 0.2 + (1 - spanned) * 1.5);
  c.line(pa2, nut, code(TM.white, 2));
  c.line(nut, pb2, code(TM.white, 2));
  c.rod(butt, nose, 0.5, 0.42, TM.wood, { tone: 3 });
  c.rod(pa2, prodC, 0.34, 0.4, TM.steel, { tone: 3 });
  c.rod(prodC, pb2, 0.4, 0.34, TM.steel, { tone: 2 });
  // The stirrup at the nose.
  c.rod(along(nose, deg, 0.1), along(nose, deg, 0.7), 0.3, 0.3, TM.steel, { tone: 1 });
}

/** The Beauséant: a tall staff, the banner black over white, with a red cross at level 4 and up. */
export function beauseant(c: Paper, grip: P2, deg: number, flap: number, fr: number): void {
  const top = along(grip, deg, 9.0);
  const butt = along(grip, deg + 180, 2.0);
  c.rod(butt, top, 0.3, 0.26, TM.ash, { tone: 2 });
  c.blob(along(top, deg, 0.25), 0.3, 0.3, TM.gold, { tone: 3 });
  const h = 3.4, w = 4.4;
  const p0 = along(top, deg + 180, 0.35);
  const p1 = along(p0, deg + 180, h);
  // The fly ripples: three points along the free edge swing with a lag.
  const wav = (k: number) => Math.sin(fr * 0.9 + k * 2.1) * 0.35 * flap;
  const q0: P2 = [p0[0] - w * 0.5, p0[1] + 0.2 + wav(1)];
  const q1: P2 = [p0[0] - w, p0[1] + 0.5 + wav(2)];
  const q2: P2 = [p1[0] - w, p1[1] + 0.5 + wav(3)];
  const q3: P2 = [p1[0] - w * 0.5, p1[1] + 0.2 + wav(1)];
  // Matthew Paris draws it sable over argent: a black chief over about a third of the cloth.
  const chief = h * 0.36;
  c.shape([p0, q0, q1, q2, q3, p1], (x, y) => {
    const uy = (y + 0.5 - c.sy(p0[1])) / c.L, ux = (c.sx(p0[0]) - x - 0.5) / c.L;
    const black = uy - ux * 0.06 < chief;
    // Ripple shading: bands across the fly.
    const ripple = Math.sin(ux * 1.6 - fr * 0.9) > 0.55 ? -1 : 0;
    return black ? code(TM.black, 2 + (ripple < 0 ? -1 : 0)) : code(TM.white, 3 + ripple);
  });
}

// ------------------------------------------------------------------ the horse

export interface HorseKit {
  coat: Mat;
  /** A caparison (trapper) to the knees with a red cross, over neck and body. */
  capar?: Mat | null;
  /** A saddle cloth in the army colour. */
  cloth?: boolean;
  /** Body size (destriers are bigger). */
  scale?: number;
}

export interface HorseRig {
  /** The rider's seat (units) and the reins' bit. */
  seat: P2;
  bit: P2;
  back: boolean;
}

/**
 * A horse in profile three-quarter, head to screen right: body, haunch and shoulder masses, a
 * long neck with mane (Maciejowski), a head with the bridle, legs with knee, cannon, fetlock and
 * hoof (Muybridge). From behind (NE) the body is pitched head-up and the rump comes forward.
 */
export function horse(c: Paper, p: HorsePose, facing: Facing, kit: HorseKit, layer: 'far' | 'body' | 'all' = 'all'): HorseRig {
  const back = isBack(facing);
  // A horse stands ~1.5 m at the withers against a 1.75 m man: the base horse is 1.12 units.
  const s = (kit.scale ?? 1) * 1.12;
  const pitch = snapDeg(p.pitch + (back ? 6 : -2));
  const B = c.q([p.px, -7.0 * s + p.py]);
  const F = frameAt(B, -pitch); // forward axis tilted up by pitch
  const P = (x: number, y: number): P2 => at(F, x * s, y * s);
  const coat = kit.coat;
  const capar = kit.capar ?? null;
  const legDef = (attach: P2, u: number, l: number, hind: boolean, far: boolean) => {
    const tone = far ? 1 : 2;
    const up = hind ? 12 + u : u;
    const k = along(attach, up - pitch, (hind ? 2.75 : 2.6) * s);
    const lo = hind ? up - 24 + l : up + l;
    const f = along(k, lo - pitch, (hind ? 2.35 : 2.3) * s);
    const hoof = along(f, lo - pitch + 18, 0.55 * s);
    c.rod(attach, k, (hind ? 1.45 : 1.15) * s, 0.62 * s, coat, { tone });
    if (c.L >= 2) c.blob(k, 0.4 * s, 0.38 * s, coat, { tone: tone - 1 });
    c.rod(k, f, 0.5 * s, 0.44 * s, coat, { tone: 1 });
    if (c.L >= 2) c.blob(f, 0.33 * s, 0.3 * s, coat, { tone: tone - 1 });
    c.rod(f, hoof, 0.42 * s, 0.5 * s, coat, { tone: 1 });
    c.rod(hoof, along(hoof, lo - pitch + 18, 0.3 * s), 0.6 * s, 0.66 * s, TM.mane, { tone: 1 });
  };
  const legs = (far: boolean) => {
    if (far) {
      legDef(P(3.4, 0.7), p.ffu, p.ffl, false, true);
      legDef(P(-2.9, 0.6), p.hfu, p.hfl, true, true);
    } else {
      legDef(P(2.9, 1.2), p.fnu, p.fnl, false, false);
      legDef(P(-3.4, 1.1), p.hnu, p.hnl, true, false);
    }
  };
  // Neck and head.
  const neckDeg = snapDeg(p.neck + 8 - pitch);
  const nd = limb(180 - neckDeg);
  const nbase = P(3.0, -1.6);
  const poll = addP(nbase, mul(nd, 4.0 * s));
  const perp: P2 = [nd[1], -nd[0]]; // toward the crest (back and up)
  const hdDeg = snapDeg(18 + neckDeg + p.nod);
  const hd = limb(hdDeg);
  const hlen = (back ? 2.5 : 3.2) * s;
  const muzzle = addP(poll, mul(hd, hlen));
  const bit = addP(poll, mul(hd, hlen * 0.8));
  const tail = () => {
    const root = P(-4.55, -1.0);
    let prev = root;
    for (let i = 1; i <= 4; i++) {
      const a = snapDeg(-20 - p.tail * 0.6 + i * 8 + Math.sin(i + p.tail * 0.1) * 4);
      const nx = along(prev, a - pitch * 0.5, 1.3 * s);
      c.rod(prev, nx, (1.0 - i * 0.12) * s, (0.9 - i * 0.14) * s, TM.mane, { tone: i === 1 ? 2 : 1 });
      prev = nx;
    }
  };
  const body = () => {
    const pts: P2[] = [
      [-3.6, -2.0], [-1.6, -1.75], [0.5, -1.6], [2.0, -1.95], [2.9, -2.25], [3.9, -1.2], [4.45, 0.0], [4.0, 1.2], [3.0, 1.85],
      [0.5, 2.05], [-2.0, 1.85], [-3.6, 1.55], [-4.55, 0.6], [-4.75, -0.6], [-4.4, -1.55],
    ];
    fshape(c, F, pts.map(([x, y]) => [x * s, y * s] as P2), (x, y, lx, ly) => {
      const tone = ly < -1.25 * s || (lx < -3.4 * s && ly < 0.8 * s) ? hiTone(c) : ly > 1.25 * s || lx > 3.6 * s ? 1 : 2;
      if (c.L >= 4 && c.tex(x, y, 21, 4) < 0.06) return code(coat, tone - 1);
      return code(coat, tone);
    });
    // Haunch and shoulder masses: no pale spot, only a shadow crescent under each (the muscle's
    // lower edge) and a lit top that merges into the back.
    const mass = (o: P2, rx: number, ry: number) =>
      c.blob(o, rx, ry, coat, { tone: 2, detail: (_x, _y, nx, ny) => code(coat, nx * 0.5 + ny > 0.62 ? 1 : ny < -0.55 ? hiTone(c) : 2) });
    mass(P(-3.1, -0.3), 1.85 * s, 1.85 * s);
    mass(P(2.9, -0.15), 1.45 * s, 1.85 * s);
    // Neck: a deep arched slab from the shoulders to the poll; the mane along the crest.
    const NF = frameAt(nbase, neckDeg - 90);
    c.shape([P(1.6, -2.0), lerp(P(1.6, -2.0), addP(poll, mul(perp, 0.6 * s)), 0.5), addP(addP(poll, mul(perp, 0.6 * s)), mul(nd, -0.2 * s)), addP(poll, mul(perp, -0.75 * s)), lerp(addP(poll, mul(perp, -0.75 * s)), P(4.45, -0.2), 0.55), P(4.45, -0.2)], (x, y) => {
      const q = local(c, NF, x, y);
      return code(coat, q[1] < -0.5 * s ? hiTone(c) : q[1] > 0.75 * s || c.L <= 1 ? 1 : 2);
    });
    c.rod(P(1.9, -2.15), addP(poll, mul(perp, 0.5 * s)), 0.65 * s, 0.5 * s, TM.mane, {
      tone: 2,
      detail: (x, y) => (c.L >= 4 && (c.lx(x) * 2 + c.ly(y)) % 5 === 0 ? code(TM.mane, 1) : -1),
    });
    // Head (in its own frame: x from poll to muzzle, y toward the jaw): forehead, nose, muzzle,
    // chin, the round jowl; the eye, the nostril, the bridle; the ears.
    const HF = frameAt(poll, 90 - hdDeg);
    const k = hlen / 2.9;
    const head: P2[] = [[-0.3, -0.55], [0.9, -0.62], [2.3, -0.42], [2.9, -0.3], [3.0, 0.25], [2.6, 0.52], [1.4, 0.62], [0.55, 1.0], [-0.15, 0.85], [-0.35, 0.3]];
    fshape(c, HF, head.map(([x, y]) => [x * k, y * s] as P2), (_x, _y, lx, ly) => {
      const hx = lx / k, hy = ly / s;
      if (!back && c.L >= 2 && Math.abs(hx - 0.75) * c.L * k < Math.max(0.6, 0.22 * c.L) && Math.abs(hy + 0.22) * c.L * s < Math.max(0.6, 0.16 * c.L)) return code(TM.ink, 1);
      if (c.L >= 2 && hx > 2.6 && hy > -0.05 && hy < 0.3) return code(TM.ink, 2);
      // Bridle: the cheek strap behind the eye and the noseband.
      if (c.L >= 2 && (within(c, hx - 0.25, 0.09) || within(c, hx - 2.15, 0.09))) return code(TM.leather, 1);
      // The jowl's round shadow, the lit forehead and nose bridge.
      if (hx < 1.2 && hy > 0.45) return code(coat, 1);
      return code(coat, c.L <= 1 ? 1 : hy < -0.25 ? 3 : hy > 0.35 ? 1 : 2);
    });
    // Ears, pricked forward.
    c.shape([at(HF, -0.1 * k, -0.45 * s), at(HF, -0.1 * k + 0.25, -1.35 * s), at(HF, 0.45 * k, -0.5 * s)], () => code(coat, 2));
  };
  const caparison = () => {
    if (capar === null) return;
    // A trapper from the neck to the knees, scalloped hem, folds; the red cross on the flank.
    const hemY = 2.85;
    const pts: P2[] = [
      [-4.7, -1.7], [-1.6, -1.95], [0.6, -1.8], [2.2, -2.15], [3.1, -2.35], [4.25, -1.0], [4.75, 0.4], [4.55, hemY],
      [3.6, hemY + 0.25], [2.4, hemY], [1.2, hemY + 0.3], [0.0, hemY], [-1.2, hemY + 0.3], [-2.4, hemY], [-3.6, hemY + 0.3], [-4.6, hemY], [-5.05, 0.3], [-5.0, -1.0],
    ];
    fshape(c, F, pts.map(([x, y]) => [x * s, y * s] as P2), (x, y, lx, ly) => {
      const cx = back ? -2.4 : 0.6, cy = 0.45;
      const vx = lx / s - cx, vy = ly / s - cy;
      if ((within(c, vx, 0.42) && Math.abs(vy) < 1.55) || (within(c, vy + 0.1, 0.4) && Math.abs(vx) < 1.25)) return code(TM.red, vx < -0.15 ? 3 : 2);
      let tone = ly < -1.3 * s || (lx < -3.6 * s && ly < 1.2 * s) ? hiTone(c) : ly > 1.6 * s || lx > 3.9 * s ? 1 : 2;
      if (c.L >= 4) {
        // Vertical folds hanging from the back, a dirty hem.
        const f = ((lx / s + 6) * 0.85) % 1;
        if (ly > -0.6 * s && f < 0.1) tone -= 1;
        else if (ly > -0.6 * s && f > 0.9) tone = Math.min(4, tone + 1);
        if (ly > (hemY - 0.7) * s && c.tex(x, y, 59, 3) < 0.4) tone -= 1;
      }
      return code(capar, tone);
    });
    // The crinet: cloth over the neck to the poll.
    c.shape([P(1.9, -2.25), addP(poll, mul(perp, 0.65 * s)), addP(poll, mul(perp, -0.55 * s)), P(4.6, -0.2)], (x, y) => {
      const q = local(c, frameAt(nbase, neckDeg - 90), x, y);
      return code(capar, q[1] < -0.5 * s ? hiTone(c) : q[1] > 0.7 * s || c.L <= 1 ? 1 : 2);
    });
  };
  const saddle = () => {
    if (kit.cloth) {
      fshape(c, F, [[-1.3 * s, -1.85 * s], [1.6 * s, -1.95 * s], [1.5 * s, 0.6 * s], [-1.2 * s, 0.7 * s]], (_x, y, lx) => {
        if (c.L >= 2 && c.sy(F.o[1] + 0.45 * s) - y < c.L * 0.35) return code(TM.teamDk, 1);
        return code(TM.team, lx < -0.6 * s ? 3 : 2);
      });
    }
    // Saddle: one war saddle, a high cantle curving up behind, a lower pommel in front.
    fshape(c, F, [[-1.25, -2.85], [-0.75, -2.9], [-0.55, -2.15], [1.0, -2.1], [1.35, -2.6], [1.7, -2.5], [1.55, -1.65], [-1.1, -1.55]].map(([x, y]) => [x! * s, y! * s] as P2), (_x, _y, lx, ly) =>
      code(TM.leather, ly < -2.45 * s ? 3 : lx > 1.3 * s || ly > -1.8 * s ? 1 : 2));
    // Girth and stirrup leather.
    if (capar === null) c.rod(P(0.5, -1.6), P(0.6, 1.95), 0.3 * s, 0.3 * s, TM.leather, { tone: 1 });
  };
  if (layer === 'far' || layer === 'all') {
    if (back) tail();
    legs(true);
  }
  if (layer === 'body' || layer === 'all') {
    if (!back) tail();
    body();
    legs(false);
    caparison();
    if (back && capar !== null) tail();
    saddle();
  }
  return { seat: P(0.3, -2.25), bit, back };
}

// ------------------------------------------------------------------ the engine

/**
 * A traction trebuchet (the Maciejowski "mangonel"): a trestle of squared timbers, a long beam on
 * an axle, the sling on the long arm and pulling ropes on the short arm. `arm` is the long arm's
 * angle in rig degrees (315 = resting back-down, 180 = straight up, ~150 = released forward).
 */
export function trebuchet(c: Paper, p: EnginePose, back: boolean): { ropeEnd: P2; pivot: P2; tip: P2 } {
  const base = c.q([p.recoil * 0.3, p.py]);
  const pivot = c.q(addP(base, [-0.5, -10.5]));
  // Trestle legs: two A-frames, far one darker and offset up-right.
  const frame = (off: P2, tone: number) => {
    const top = addP(pivot, off);
    for (const dx of [-3.2, 2.8]) c.rod(top, addP(base, [off[0] + dx - 0.5, off[1] * 0.4]), 0.75, 0.85, TM.wood, { tone });
    c.rod(addP(base, [off[0] - 2.4, -3.0 + off[1] * 0.4]), addP(base, [off[0] + 1.6, -3.0 + off[1] * 0.4]), 0.55, 0.55, TM.wood, { tone: tone - 1 });
  };
  frame([1.4, -1.0], 1);
  // Ground sills.
  c.rod(addP(base, [-4.6, 0.1]), addP(base, [4.4, -0.4]), 0.8, 0.8, TM.wood, { tone: 1 });
  const armDeg = snapDeg(p.arm);
  const tip = along(pivot, armDeg, 9.5);
  const short = along(pivot, armDeg + 180, 4.2);
  // The beam: a bundle of poles lashed together, thick at the axle.
  c.rod(short, tip, 0.95, 0.5, TM.wood, {
    tone: 2,
    detail: (_x, _y, _u, v) => (c.L >= 2 && (Math.abs(v - 0.25) < 0.02 || Math.abs(v - 0.45) < 0.02) ? code(TM.leather, 1) : -1),
  });
  // The pulling ropes from the short arm: drawn to the crew (below, forward) or slack.
  const ropeEnd = addP(base, [5.0, -2.2 + p.crew * 0.8]);
  for (const k of [-0.25, 0.25]) c.line(addP(short, [k, 0]), addP(ropeEnd, [k * 2, 0]), code(TM.white, 1));
  // The sling: two cords from the tip to the pouch, with the stone while loaded.
  const slingDeg = snapDeg(armDeg + p.sling);
  const pouch = along(tip, slingDeg, 3.4);
  c.line(tip, pouch, code(TM.leather, 2));
  c.line(addP(tip, [0.2, 0]), addP(pouch, [0.25, 0.1]), code(TM.leather, 1));
  if (p.load > 0.5) c.blob(pouch, 0.7, 0.65, TM.wool, { tone: 2 });
  c.blob(pivot, 0.6, 0.6, TM.steel, { tone: 2 });
  // The near A-frame in front of the beam.
  frame([0, 0], 2);
  void back;
  return { ropeEnd, pivot, tip };
}
