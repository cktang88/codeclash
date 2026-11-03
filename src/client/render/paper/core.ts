// The paper-doll painter's core: the canvas (an explicit object, so workers and tests can each
// hold their own), the drawing primitives, the material table and its ramps, and the finishing
// passes. Figures (paper/<faction>.ts) draw with these; see README.md.
//
// Every part is an outline polygon or a stroke authored in sprite space, rasterised pixel-perfectly
// (a pixel is in when its centre is), and shaded by hand-placed rules: a lit band on the edge
// facing the top-left light, a shadow band on the far edge, small highlight clusters on hard
// materials, and painted details. Nothing is computed from 3D normals.

export type RGB = [number, number, number];
export type P2 = [number, number];

// ------------------------------------------------------------------ small maths

export const DEG = Math.PI / 180;
export const rot = (p: P2, a: number): P2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
export const addP = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];

/** A small deterministic hash in [0, 1). */
export function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ colour

export function hslRgb(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/**
 * The first paper ramp (HSL): five steps, darkest first; shadows slide toward `dark` hue and gain
 * saturation, lights toward `light` and lose it. Kept because the Grave Legionary's materials are
 * frozen on it; new materials use `oklchRamp`.
 */
export function hslRamp(h: number, s: number, l: number, dark: number, light: number, spread = 1): RGB[] {
  const toward = (a: number, b: number, k: number) => a + ((((b - a + 540) % 360) - 180) * k);
  const steps = [-2, -1, 0, 1, 2];
  return steps.map((k) => {
    const t = k / 2;
    const hh = t < 0 ? toward(h, dark, -t * 0.55) : toward(h, light, t * 0.45);
    const ss = Math.min(0.9, Math.max(0.04, s * (t < 0 ? 1 - t * 0.35 : 1 - t * 0.3)));
    const ll = Math.min(0.9, Math.max(0.06, l + t * 0.2 * spread * (t < 0 ? 1.15 : 0.9)));
    return hslRgb(hh, ss, ll);
  });
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0..255) to OKLab [L, a, b] (Ottosson). */
export function rgbOklab([r8, g8, b8]: RGB): [number, number, number] {
  const r = lin(r8 / 255), g = lin(g8 / 255), b = lin(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** OKLab to sRGB, pulling chroma in (hue and lightness kept) until the colour fits the gamut. */
export function oklabRgb(L: number, a: number, b: number): RGB {
  const inside = (k: number) => oklabLinear(L, a * k, b * k).every((c) => c >= -1e-4 && c <= 1 + 1e-4);
  let k = 1;
  if (!inside(1)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  const [r, g, bl] = oklabLinear(L, a * k, b * k);
  const to8 = (c: number) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, c))))) * 255);
  return [to8(r), to8(g), to8(bl)];
}

export const oklchRgb = (L: number, C: number, hDeg: number): RGB => oklabRgb(L, C * Math.cos(hDeg * DEG), C * Math.sin(hDeg * DEG));

/** The OKLCH hue of an HSL hue (the army's heraldic hue is given in HSL degrees). */
export function okHue(hslHue: number): number {
  const [, a, b] = rgbOklab(hslRgb(hslHue, 0.6, 0.45));
  return ((Math.atan2(b, a) / DEG) % 360 + 360) % 360;
}

/**
 * The light the ramps are built under (techniques guide §1.2): shadow steps mix toward the
 * ambient colour, light steps toward the key colour, in OKLab a/b.
 */
export interface LightRig {
  keyHue: number;
  keyChroma: number;
  ambientHue: number;
  ambientChroma: number;
}
/** Overcast day over a battlefield: a warm key, a cool violet ambient. */
export const DAY_RIG: LightRig = { keyHue: 85, keyChroma: 0.06, ambientHue: 290, ambientChroma: 0.045 };

export interface RampSpec {
  /** Base (middle step) OKLab lightness, 0..1; battle materials sit around 0.3-0.6. */
  l: number;
  /** Base chroma (≤ 0.07 for bone, steel, cloth and hide; ≥ 0.14 for the one accent). */
  c: number;
  /** OKLCH hue, degrees. */
  h: number;
  /** Lightness per step (default 0.085). Bigger for hard, shiny materials. */
  spread?: number;
  rig?: LightRig;
  /** Chroma multipliers for the five steps, darkest first (default peaks at the shade step). */
  chroma?: readonly [number, number, number, number, number];
}

/**
 * A five-step hue-shifted ramp built in OKLCH (techniques guide §1.1-1.3), darkest first:
 * lightness steps are unequal (the darks fall faster), chroma peaks at the shade step next to
 * the terminator and drains toward the light, shadows mix toward the rig's ambient hue and
 * lights toward its key. Never pure black or white.
 */
export function oklchRamp(spec: RampSpec): RGB[] {
  const rig = spec.rig ?? DAY_RIG;
  const spread = spec.spread ?? 0.085;
  const cm = spec.chroma ?? [0.8, 1.15, 1.0, 0.8, 0.6];
  const ha = Math.cos(spec.h * DEG), hb = Math.sin(spec.h * DEG);
  const amb: P2 = [rig.ambientChroma * Math.cos(rig.ambientHue * DEG), rig.ambientChroma * Math.sin(rig.ambientHue * DEG)];
  const key: P2 = [rig.keyChroma * Math.cos(rig.keyHue * DEG), rig.keyChroma * Math.sin(rig.keyHue * DEG)];
  return [-2, -1, 0, 1, 2].map((t, i) => {
    const L = Math.min(0.93, Math.max(0.13, spec.l + t * spread * (t < 0 ? 1.15 : 0.9)));
    let a = spec.c * cm[i]! * ha, b = spec.c * cm[i]! * hb;
    const [tx, ty, k] = t < 0 ? [amb[0], amb[1], -t * 0.17] : [key[0], key[1], t * 0.08];
    a += (tx - a) * k;
    b += (ty - b) * k;
    return oklabRgb(L, a, b);
  });
}

// ------------------------------------------------------------------ materials

/** A material: a ramp of five tones (0 darkest .. 4 lightest), possibly following the army's hue. */
export interface Material {
  name: string;
  ramp: (hue: number) => RGB[];
  /** Exempt from the small-cluster merge (inks, glows, single-pixel sparks). */
  keep?: boolean;
}
/** A material id (index into the table). Pixel codes are `mat * 8 + tone`. */
export type Mat = number;

const MATS: Material[] = [];
const BY_NAME = new Map<string, Mat>();

/**
 * Adds a material to the shared table (or returns the id it already has under that name). Name
 * faction materials `<faction>.<name>`. Registration order must be the same in every thread, so
 * call this at module top level only.
 */
export function defineMaterial(name: string, ramp: RGB[] | ((hue: number) => RGB[]), opts: { keep?: boolean } = {}): Mat {
  const had = BY_NAME.get(name);
  if (had !== undefined) return had;
  const fixed = Array.isArray(ramp) ? ramp : null;
  if (fixed && fixed.length !== 5) throw new Error(`material ${name}: a ramp has 5 tones`);
  const id = MATS.length;
  MATS.push({ name, ramp: fixed ? () => fixed : (ramp as (hue: number) => RGB[]), keep: opts.keep });
  BY_NAME.set(name, id);
  return id;
}
export const materialId = (name: string): Mat | undefined => BY_NAME.get(name);
export const materialCount = (): number => MATS.length;
export const materialNameOf = (m: Mat): string => MATS[m]?.name ?? '';
export const isKept = (m: Mat): boolean => MATS[m]?.keep === true;

const PALS = new Map<number, { n: number; pal: RGB[][] }>();
/** Every material's ramp for an army's hue (cached). */
export function palette(hue: number): RGB[][] {
  const got = PALS.get(hue);
  if (got && got.n === MATS.length) return got.pal;
  const pal = MATS.map((m) => m.ramp(hue));
  PALS.set(hue, { n: MATS.length, pal });
  return pal;
}

/**
 * The shared base materials, in OKLCH, low-key (Diablo II / Darkest Dungeon values). Factions use
 * these or define their own beside them (`defineMaterial('templar.surcoat', ...)`).
 */
export const M = {
  bone: defineMaterial('bone', oklchRamp({ l: 0.6, c: 0.045, h: 80 })),
  rust: defineMaterial('rust', oklchRamp({ l: 0.42, c: 0.075, h: 45 })),
  mail: defineMaterial('mail', oklchRamp({ l: 0.47, c: 0.012, h: 70, spread: 0.09 })),
  iron: defineMaterial('iron', oklchRamp({ l: 0.38, c: 0.012, h: 250, spread: 0.09 })),
  steel: defineMaterial('steel', oklchRamp({ l: 0.6, c: 0.015, h: 240, spread: 0.11 })),
  gold: defineMaterial('gold', oklchRamp({ l: 0.62, c: 0.1, h: 85, spread: 0.1 })),
  team: defineMaterial('team', (hue) => oklchRamp({ l: 0.44, c: 0.14, h: okHue(hue), spread: 0.09 })),
  teamDk: defineMaterial('teamDk', (hue) => oklchRamp({ l: 0.33, c: 0.1, h: okHue(hue), spread: 0.07 })),
  linen: defineMaterial('linen', oklchRamp({ l: 0.72, c: 0.025, h: 85 })),
  rag: defineMaterial('rag', oklchRamp({ l: 0.32, c: 0.03, h: 50, spread: 0.07 })),
  wood: defineMaterial('wood', oklchRamp({ l: 0.4, c: 0.06, h: 55 })),
  leather: defineMaterial('leather', oklchRamp({ l: 0.34, c: 0.06, h: 45 })),
  flesh: defineMaterial('flesh', oklchRamp({ l: 0.62, c: 0.06, h: 55 })),
  // Ink: eye sockets, mouths, deep cracks. Warm, never neutral black (a grey shadow reads dead).
  ink: defineMaterial('ink', [[24, 12, 16], [32, 17, 21], [40, 23, 26], [49, 30, 32], [60, 39, 39]], { keep: true }),
  glow: defineMaterial('glow', [[40, 90, 60], [70, 140, 80], [110, 200, 110], [160, 235, 150], [215, 255, 200]], { keep: true }),
} as const;

/** A pixel code: material and tone (clamped to 0..4). */
export const code = (m: Mat, t: number): number => m * 8 + Math.max(0, Math.min(4, t));

// ------------------------------------------------------------------ the lint rules, as data

/** The battlefield green every figure is judged against (pixel-lint FIELD). */
export const GROUND: RGB = [0x56, 0x60, 0x3a];
const GROUND_L = rgbOklab(GROUND)[0];
/** Material base tones keep at least this OKLab lightness away from the ground. */
export const GROUND_DL = 0.12;
/** Toward the key light in image space (upper left), as the lint measures it. */
export const KEY_LIGHT: P2 = (() => {
  const x = -0.75, y = 0.5 * 0.12 - (Math.sqrt(3) / 2) * 0.7;
  const n = Math.hypot(x, y);
  return [x / n, y / n];
})();
/** Outline colours never go darker than this OKLab lightness (never near-black). */
export const OUTLINE_FLOOR = 0.2;

/**
 * Colour budget per detail level: fill colours, dark outline colours, and which ramp tone each
 * painted tone becomes (level 1 keeps 3 tones, level 2 four, levels 4 and 8 all five).
 */
export interface Budget {
  fill: number;
  outline: number;
  tones: readonly [number, number, number, number, number];
}
export function budget(level: number): Budget {
  if (level <= 1) return { fill: 12, outline: 2, tones: [0, 1, 2, 2, 3] };
  if (level <= 2) return { fill: 16, outline: 3, tones: [0, 1, 2, 3, 3] };
  if (level <= 4) return { fill: 21, outline: 4, tones: [0, 1, 2, 3, 4] };
  return { fill: 33, outline: 6, tones: [0, 1, 2, 3, 4] };
}

type Lab = [number, number, number];
/**
 * Distance in OKLab with lightness weighted twice (value matters most in pixel art) and hue
 * half again (so a coloured shadow is not merged into a grey one).
 */
const labDist = (p: Lab, q: Lab): number => Math.hypot(2 * (p[0] - q[0]), 1.5 * (p[1] - q[1]), 1.5 * (p[2] - q[2]));

/**
 * Like `labDist`, but chroma is compared relative to lightness (a/L, b/L, with L held at 0.3 or
 * more): in OKLab the dark colours of every hue crowd together near the black point, so a dark
 * slate, a dark ochre and a dark madder would otherwise be the first colours merged.
 */
const chromaDist = (p: Lab, q: Lab): number => {
  const sp = 0.6 / Math.max(0.3, p[0]), sq = 0.6 / Math.max(0.3, q[0]);
  return Math.hypot(2 * (p[0] - q[0]), 1.5 * (p[1] * sp - q[1] * sq), 1.5 * (p[2] * sp - q[2] * sq));
};
/** The army-colour materials (`team`, `teamDk` and a faction's variants of them). */
const isAccent = (m: Mat): boolean => /(^|\.)team/.test(MATS[m]?.name ?? '');

/**
 * Per-faction options for building its master palette (`figurePalette`). All default off, so a
 * faction that sets none gets exactly the original palette.
 */
export interface PaletteOpts {
  /** Merge by `chromaDist` instead of `labDist`, so dark materials keep their own hues. */
  darkChroma?: boolean;
  /** At most this many fill colours for the army-colour materials, merged among themselves first. */
  accentCap?: number;
  /**
   * Colours of one family (one material, both near-neutral, or hues within 25°) closer than this
   * (in the merge distance) are merged even under the budget: near duplicates read as noise and
   * break flat clusters into stripes (mistakes guide #7). One value, or one per level (1, 2, 4, 8).
   */
  minDist?: number | readonly [number, number, number, number];
  /**
   * A coloured tone (C ≥ 0.05) does not map to a near-grey fill (C < 0.025) when a coloured fill
   * of a hue within 40° is within this much of the nearest (mistakes guide #9: no grey shadows
   * on coloured materials; a red cross's shadow stays red); nor a light near-neutral (L > 0.5,
   * C < 0.03) to a saturated fill (C ≥ 0.06) when a neutral one is (white cloth does not turn gilt).
   */
  keepChroma?: number;
  /** Weight the dark outline candidates by their material's pixels when merging them to the budget. */
  weightOutlines?: boolean;
  /**
   * The outline is the dark colour all round, the lit side too (no sel-out or lit outline): for
   * pale figures that crowd together, a dark rim is what parts one from the next (level 2 up).
   */
  litDark?: boolean;
  /**
   * With `litDark`: the lowest level it applies at (default 2). Level 1 for mid-value figures whose
   * lit-side sel-out outline averages out to the field's value (a light rim beside a dark one).
   */
  litDarkFrom?: number;
}

/** Shifts a ramp's lightness so its base tone keeps GROUND_DL away from the battlefield green. */
export function groundSafe(ramp: RGB[]): RGB[] {
  const labs = ramp.map(rgbOklab);
  const l2 = labs[2]![0];
  const d = l2 - GROUND_L;
  if (Math.abs(d) >= GROUND_DL) return ramp;
  // Darker unless clearly lighter already (figures read dark-on-ground: the mean value of a figure
  // must also clear the ground, and outlines and shadows already pull it down), whole ramp at once.
  const shift = (d > 0.05 ? GROUND_DL : -GROUND_DL - 0.03) - d;
  // The floor keeps the deepest tone coloured (at very low lightness the gamut has no chroma).
  return labs.map(([L, a, b]) => oklabRgb(Math.min(0.95, Math.max(0.17, L + shift)), a, b));
}

/**
 * A figure's colours at one level: every painted code maps to one of at most `budget.fill` fill
 * colours (the faction's master palette for that level, built in OKLab from the codes its
 * figures use), and each fill colour has a lit outline (its material's tone 1) and a dark outline
 * (one of at most `budget.outline` colours: the material's darkest tone, held above
 * OUTLINE_FLOOR, hue kept).
 */
export interface FigurePalette {
  /** Fill colours, then dark outline colours. */
  rgb: RGB[];
  fills: number;
  /** Code (mat*8+tone) → fill colour index. */
  fillOf: Int16Array;
  /** Per fill colour: exempt from cleanup (inks, glows). */
  keep: Uint8Array;
  /** Levels 1-2: the lit side keeps the part's own colour (sel-out) instead of a lit outline. */
  selOut: boolean;
  /** Per fill colour: dark-side outline colour. */
  dark: Int16Array;
  /** The lit side takes the dark outline too (PaletteOpts.litDark). */
  litDark?: boolean;
}

interface Cand {
  lab: Lab;
  rgb: RGB;
  mat: Mat;
  weight: number;
}

/** Drops the less important of the closest pair until at most `cap` remain. */
function reduce(cs: Cand[], cap: number, dist: (p: Lab, q: Lab) => number = labDist, among?: (c: Cand) => boolean): Cand[] {
  const out = cs.slice();
  const n = () => (among ? out.filter(among).length : out.length);
  while (n() > cap) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        if (among && !(among(out[i]!) && among(out[j]!))) continue;
        const d = dist(out[i]!.lab, out[j]!.lab);
        if (d < bd) [bi, bj, bd] = [i, j, d];
      }
    out.splice(out[bi]!.weight >= out[bj]!.weight ? bj : bi, 1);
  }
  return out;
}

/**
 * Two colours of one family: both near-neutral, or hues within 25° (8° within one material, whose
 * ramp's hue shift is the point of it: a shade and a light of different hue are not duplicates).
 */
function sameFamily(p: Cand, q: Cand): boolean {
  const cp = Math.hypot(p.lab[1], p.lab[2]), cq = Math.hypot(q.lab[1], q.lab[2]);
  if (cp < 0.035 && cq < 0.035) return true;
  if (cp < 0.035 || cq < 0.035) return p.mat === q.mat;
  const dh = Math.abs(Math.atan2(p.lab[2], p.lab[1]) - Math.atan2(q.lab[2], q.lab[1])) / DEG;
  return Math.min(dh, 360 - dh) < (p.mat === q.mat ? 8 : 25);
}

/** Merges near-duplicates (closer than `minDist`, of one family), the less important going first. */
function dedupe(cs: Cand[], minDist: number, dist: (p: Lab, q: Lab) => number): Cand[] {
  const out = cs.slice();
  for (;;) {
    let bi = -1, bj = -1, bd = minDist;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        if (MATS[out[i]!.mat]?.keep || MATS[out[j]!.mat]?.keep || !sameFamily(out[i]!, out[j]!)) continue;
        const d = dist(out[i]!.lab, out[j]!.lab);
        if (d < bd) [bi, bj, bd] = [i, j, d];
      }
    if (bi < 0) return out;
    out.splice(out[bi]!.weight >= out[bj]!.weight ? bj : bi, 1);
  }
}

/**
 * Builds the palette for a level from the codes a faction's figures use and how many pixels each
 * covers (see paper/index.ts): when colours must merge, the rarely used go first.
 */
export function figurePalette(hue: number, level: number, used: ReadonlyMap<number, number>, opts?: PaletteOpts): FigurePalette {
  const B = budget(level);
  const pal = palette(hue);
  const safe = pal.map((r, m) => (MATS[m]?.keep ? r : groundSafe(r)));
  const colourOf = (c: number): RGB => safe[c >> 3]![B.tones[Math.min(4, c & 7)]!]!;
  // Candidates: each painted colour, weighted by the pixels it covers (log), with a bonus for
  // inks and glows (tiny but essential) and for the army colour (the accent).
  const byRgb = new Map<string, Cand>();
  for (const c of [...used.keys()].sort((p, q) => p - q)) {
    if (c < 0 || c >> 3 >= safe.length) continue;
    const rgb = colourOf(c);
    const k = rgb.join(',');
    const m = c >> 3;
    const w = Math.log2(1 + (used.get(c) ?? 1)) + (MATS[m]?.keep ? 8 : 0) + (MATS[m]?.name.endsWith('team') ? 2 : 0);
    const had = byRgb.get(k);
    if (had) had.weight += w;
    else byRgb.set(k, { lab: rgbOklab(rgb), rgb, mat: m, weight: w });
  }
  let cands = [...byRgb.values()];
  const o = opts ?? {};
  if (o.accentCap !== undefined) cands = reduce(cands, o.accentCap, labDist, (c) => isAccent(c.mat));
  const dist = o.darkChroma ? chromaDist : labDist;
  const md = o.minDist;
  const minDist = typeof md === 'number' ? md : md ? md[level >= 8 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0] ?? 0 : 0;
  if (minDist > 0) cands = dedupe(cands, minDist, dist);
  const fills = reduce(cands, B.fill, dist);
  const nearest = (lab: Lab, list: { lab: Lab }[]): number => {
    let bi = 0, bd = Infinity;
    list.forEach((f, i) => {
      const d = labDist(lab, f.lab);
      if (d < bd) [bi, bd] = [i, d];
    });
    return bi;
  };
  const fillOf = new Int16Array(MATS.length * 8).fill(0);
  for (let c = 0; c < fillOf.length; c++) {
    if ((c & 7) > 4) continue;
    const lab = rgbOklab(colourOf(c));
    fillOf[c] = nearest(lab, fills);
    if (o.keepChroma === undefined) continue;
    const ch = (q: Lab) => Math.hypot(q[1], q[2]);
    const hueOff = (p: Lab, q: Lab) => {
      const d = Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(q[2], q[1])) / DEG;
      return Math.min(d, 360 - d);
    };
    const near = fills[fillOf[c]!]!.lab, cc = ch(lab);
    const ok: ((f: Lab) => boolean) | null =
      cc >= 0.05 && ch(near) < 0.025 ? (f) => ch(f) >= 0.035 && hueOff(f, lab) < 40 : cc < 0.03 && lab[0] > 0.5 && ch(near) >= 0.06 ? (f) => ch(f) < 0.035 : null;
    if (!ok) continue;
    const g = labDist(lab, near);
    let bi = -1, bd = g + o.keepChroma;
    fills.forEach((f, i) => {
      const d = labDist(lab, f.lab);
      if (ok(f.lab) && d <= bd) [bi, bd] = [i, d];
    });
    if (bi >= 0) fillOf[c] = bi;
  }
  // Dark outlines: one per material in use, then merged down to the budget.
  const mats = [...new Set(fills.map((f) => f.mat))].sort((p, q) => p - q);
  const darkC: Cand[] = mats.map((m) => {
    const [L, a, b] = rgbOklab(safe[m]![0]!);
    const lab: Lab = [Math.max(OUTLINE_FLOOR, L - 0.07), a * 0.85, b * 0.85];
    // (Opt-in: weighted by the pixels its material covers, so the figure's main materials keep
    // their own outline when the outline budget is small, not whichever came first.)
    const weight = o.weightOutlines ? fills.filter((f) => f.mat === m).reduce((a, f) => a + f.weight, 0) : 0;
    return { lab, rgb: oklabRgb(lab[0], lab[1], lab[2]), mat: m, weight };
  });
  const darks = reduce(darkC, B.outline);
  const rgb = [...fills.map((f) => f.rgb), ...darks.map((d) => d.rgb)];
  const n = fills.length;
  const keep = new Uint8Array(n), dark = new Int16Array(n);
  fills.forEach((f, i) => {
    keep[i] = MATS[f.mat]?.keep ? 1 : 0;
    const own = darkC.find((d) => d.mat === f.mat)!;
    dark[i] = n + nearest(own.lab, darks);
  });
  // At levels 1-2 a figure is 13-26 px tall and its parts are mostly one tone: a darker lit
  // outline would read as light from the inside, so the lit side keeps the part's own colour
  // (sel-out). From level 4 the lit outline is a step below the edge pixel, at least tone 1.
  // (Not at level 1: a 13 px figure is a third outline, and a dark ring all round makes it dark.)
  return { rgb, fills: n, fillOf, keep, dark, selOut: level <= 2, ...(o.litDark && level >= (o.litDarkFrom ?? 2) ? { litDark: true } : {}) };
}

// ------------------------------------------------------------------ the canvas

/** Canvas size in figure units (one unit ≈ one map pixel at level 1), and where the feet stand. */
export interface CanvasSize {
  /** Width in units: even, so mirroring keeps the foot point. */
  w: number;
  h: number;
  /** The foot line as a fraction of the height. */
  footY: number;
}

/** Shade callback of `poly`: return a code, or a negative number to leave the pixel. */
export type Shade = (x: number, y: number, u: number, v: number) => number;

/**
 * One painting surface: the pixel codes, the draw order of the part that painted each pixel
 * (for contact lines), and the previous frame (for anti-flicker). Not shared between threads.
 *
 * No-boil rules built in: `poly` sets a part-local origin (`lx`, `ly`, `tex`) so texture rides
 * with the part instead of the canvas grid; `q` snaps an anchor to whole pixels so rigid parts
 * move by integer offsets; each part gets its own band offset (`band`) so bands do not line up
 * across parallel parts.
 */
export class Paper {
  /** Canvas pixels per figure unit (the detail level: 1, 2, 4 or 8). */
  L = 8;
  CW = 0;
  CH = 0;
  /** The foot point in canvas pixels. */
  FX = 0;
  FY = 0;
  /** Per pixel: material*8 + tone, or -1. */
  pix = new Int16Array(0);
  ord = new Int16Array(0);
  prev = new Int16Array(0);
  order = 0;
  /** What the previous frame on this surface was (anti-flicker only follows on from it). */
  last = '';
  /** The current part's origin in canvas px (its bounding box corner, whole pixels). */
  ox = 0;
  oy = 0;
  /** The current part's band offset (-0.18..0.18), stable per part from frame to frame. */
  band = 0;
  /** Bounding box of what has been drawn (canvas px, inclusive); passes only scan it. */
  bx0 = 0;
  by0 = 0;
  bx1 = -1;
  by1 = -1;

  /** The rows and columns a pass scans: the drawn box grown by `pad`, kept `edge` px inside the canvas. */
  private box(pad: number, edge: number): [number, number, number, number] {
    return [Math.max(edge, this.bx0 - pad), Math.max(edge, this.by0 - pad), Math.min(this.CW - 1 - edge, this.bx1 + pad), Math.min(this.CH - 1 - edge, this.by1 + pad)];
  }

  /** Clears the canvas for a level and size. */
  begin(level: number, size: CanvasSize = { w: 46, h: 50, footY: 0.86 }): void {
    this.L = level;
    const cw = size.w * level, ch = size.h * level;
    this.FX = Math.round(cw / 2);
    this.FY = Math.round(ch * size.footY);
    if (cw !== this.CW || ch !== this.CH) {
      this.pix = new Int16Array(cw * ch);
      this.ord = new Int16Array(cw * ch);
      this.prev = new Int16Array(cw * ch).fill(-1);
      this.last = '';
    }
    this.CW = cw;
    this.CH = ch;
    this.pix.fill(-1);
    this.ord.fill(-1);
    this.order = 0;
    this.bx0 = cw;
    this.by0 = ch;
    this.bx1 = this.by1 = -1;
  }

  plot(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.CW || y >= this.CH || c < 0) return;
    const i = y * this.CW + x;
    this.pix[i] = c;
    this.ord[i] = this.order;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }

  /** Figure units to canvas px. */
  sx(x: number): number {
    return this.FX + x * this.L;
  }
  sy(y: number): number {
    return this.FY + y * this.L;
  }
  /** Snaps a point (figure units) to whole canvas pixels: anchors of rigid parts go through this. */
  q(p: P2): P2 {
    return [Math.round(p[0] * this.L) / this.L, Math.round(p[1] * this.L) / this.L];
  }
  /** Snaps a length or offset (figure units) to whole pixels. */
  qn(v: number): number {
    return Math.round(v * this.L) / this.L;
  }
  /** Part-local pixel coordinates (for texture: key hashes and patterns to these, never to x, y). */
  lx(x: number): number {
    return x - this.ox;
  }
  ly(y: number): number {
    return y - this.oy;
  }
  /**
   * Part-local texture noise in [0, 1): diagonal cells about `cell` px across, seeded. Diagonal,
   * not square, so the ends of neighbouring runs never line up (flat banding).
   */
  tex(x: number, y: number, seed: number, cell = 2): number {
    const lx = x - this.ox, ly = y - this.oy;
    return hash(Math.floor((lx + ly) / cell), Math.floor((lx - ly + 1000) / (cell + 1)), seed);
  }

  /**
   * Fills a polygon (canvas px): a pixel is in when its centre is. `shade(x, y, u, v)` gets the
   * pixel and its position across (u: -1 lit edge .. 1 shadow edge) and along (v: 0..1) the part's
   * axis, when one is given, and returns a code.
   */
  poly(pts: P2[], shade: Shade, axis?: { a: P2; b: P2; w: number }): void {
    this.order++;
    this.band = (hash(this.order, 7, 99) - 0.5) * 0.36;
    const CW = this.CW, CH = this.CH;
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
      x0 = Math.min(x0, p[0]);
    }
    this.ox = Math.floor(x0 + 1e-6);
    this.oy = Math.floor(y0 + 1e-6);
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(CH - 1, Math.ceil(y1));
    let ux = 0, uy = 0, vx = 0, vy = 0, len = 1;
    if (axis) {
      vx = axis.b[0] - axis.a[0];
      vy = axis.b[1] - axis.a[1];
      len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      // Across-axis unit pointing away from the light (top-left): +u is the shadow side.
      ux = -vy;
      uy = vx;
      if (ux * -1 + uy * -1 > 0) {
        ux = -ux;
        uy = -uy;
      }
    }
    const xs: number[] = [];
    for (let y = iy0; y <= iy1; y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]! - 0.5)), xb = Math.min(CW - 1, Math.floor(xs[k + 1]! - 0.5));
        for (let x = xa; x <= xb; x++) {
          let u = 0, v = 0;
          if (axis) {
            const dx = x + 0.5 - axis.a[0], dy = cy - axis.a[1];
            u = (dx * ux + dy * uy) / (axis.w / 2);
            v = (dx * vx + dy * vy) / len;
          }
          this.plot(x, y, shade(x, y, u, v));
        }
      }
    }
  }

  /** A polygon given in figure units. */
  shape(pts: P2[], shade: Shade): void {
    this.poly(pts.map((p) => [this.sx(p[0]), this.sy(p[1])] as P2), shade);
  }

  /**
   * A tapered stroke from a to b (figure units), widths wa..wb (figure units), shaded as a
   * rounded rod: a lit edge, a mid body, a shadow third and a dark edge. Thin rods (under 3 px)
   * are one tone with a shadow side only, and at levels 1-2 at least 1.4 px wide so they stay
   * 4-connected (no orphan pixels along a diagonal).
   */
  rod(a: P2, b: P2, wa: number, wb: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: Shade } = {}): void {
    const L = this.L;
    const A: P2 = [this.sx(a[0]), this.sy(a[1])], B: P2 = [this.sx(b[0]), this.sy(b[1])];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const ln = Math.hypot(dx, dy) || 1;
    const nx = -dy / ln, ny = dx / ln;
    const minH = L <= 1 ? 0.62 : L <= 2 ? 0.7 : 0.5;
    const ha = Math.max(minH, (wa * L) / 2), hb = Math.max(minH, (wb * L) / 2);
    const pts: P2[] = [
      [A[0] + nx * ha, A[1] + ny * ha],
      [B[0] + nx * hb, B[1] + ny * hb],
      [B[0] - nx * hb, B[1] - ny * hb],
      [A[0] - nx * ha, A[1] - ny * ha],
    ];
    const base = opts.tone ?? 2;
    const w = Math.max(ha, hb);
    this.poly(pts, (x, y, u, v) => {
      if (opts.detail) {
        const d = opts.detail(x, y, u, v);
        if (d >= 0) return d;
      }
      if (w < 1.5) return code(m, base);
      const px = u * w;
      // Bands in pixels, not fractions, so thin rods stay readable: 1 px lit edge, 1 px dark edge.
      // The lit edge stops short of the ends and the dark edge runs nearly full length, so the
      // bands do not end on the same row (flat banding).
      if (px < -w + 1.2 && v > 0.1 + this.band * 0.3 && v < 0.86 + this.band * 0.3) return code(m, base + (opts.shine ? 2 : 1));
      if (px > w - 1.2 && v > 0.03 && v < 0.97) return code(m, base - 2);
      if (u > 0.25 + this.band) return code(m, base - 1);
      if (opts.shine && Math.abs(u + 0.45) < 0.12 && v > 0.15 && v < 0.6) return code(m, base + 2);
      return code(m, base);
    }, { a: A, b: B, w: 2 * w });
  }

  /**
   * A disc or ellipse (figure units) shaded the pixel-art way: a light cluster offset toward the
   * top-left, a mid body, a shadow crescent on the bottom-right, a dark rim on that side only.
   * `detail(x, y, nx, ny)` gets the pixel's position in the ellipse (-1..1).
   */
  blob(c: P2, rx: number, ry: number, m: Mat, opts: { shine?: boolean; tone?: number; detail?: Shade } = {}): void {
    const L = this.L;
    const cx = this.sx(c[0]), cy = this.sy(c[1]);
    const RX = Math.max(0.6, rx * L), RY = Math.max(0.6, ry * L);
    const pts: P2[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * RX, cy + Math.sin(a) * RY]);
    }
    const base = opts.tone ?? 2;
    const small = Math.min(RX, RY) < 1.6;
    this.poly(pts, (x, y) => {
      const nx = (x + 0.5 - cx) / RX, ny = (y + 0.5 - cy) / RY;
      if (opts.detail) {
        const d = opts.detail(x, y, nx, ny);
        if (d >= 0) return d;
      }
      if (small) return code(m, base);
      const lit = Math.hypot(nx + 0.38, ny + 0.38);
      const dk = nx * 0.7 + ny * 0.7;
      if (opts.shine && lit < 0.28 + this.band * 0.5) return code(m, base + 2);
      if (lit < 0.62 + this.band) return code(m, base + 1);
      if (dk > 0.72 + this.band) return code(m, base - 2);
      if (dk > 0.32 + this.band) return code(m, base - 1);
      return code(m, base);
    });
  }

  /** A one-pixel line between two points in figure units (strings, cracks, seams). */
  line(a: P2, b: P2, c: number): void {
    const x0 = this.sx(a[0]), y0 = this.sy(a[1]), x1 = this.sx(b[0]), y1 = this.sy(b[1]);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.plot(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n), c);
  }

  /**
   * A solid smear (no blending): the sweep of a blade from angle `from` to `to` (degrees, the
   * rig's convention: 0 down, 90 forward, 180 up) about `pivot`, between radii r0 and r1, filled
   * as one pale annular sector, a lit leading edge and a darker trailing tail.
   */
  smear(pivot: P2, from: number, to: number, r0: number, r1: number, m: Mat, opts: { tone?: number } = {}): void {
    if (Math.abs(from - to) < 1) return;
    const steps = Math.max(2, Math.ceil(Math.abs(from - to) / 7.5));
    const at = (deg: number, r: number): P2 => [this.sx(pivot[0] + Math.sin(deg * DEG) * r), this.sy(pivot[1] + Math.cos(deg * DEG) * r)];
    const outer: P2[] = [], inner: P2[] = [];
    for (let k = 0; k <= steps; k++) {
      const d = from + ((to - from) * k) / steps;
      // The tail (at `from`) thins toward the tip radius, the leading edge (at `to`) is full width.
      const r0k = r1 - (r1 - r0) * (0.35 + 0.65 * (k / steps));
      outer.push(at(d, r1));
      inner.push(at(d, r0k));
    }
    const tone = opts.tone ?? 3;
    const span = Math.abs(to - from);
    this.poly([...outer, ...inner.reverse()], (x, y) => {
      const dx = (x + 0.5 - this.sx(pivot[0])) / this.L, dy = (y + 0.5 - this.sy(pivot[1])) / this.L;
      const ang = Math.atan2(dx, dy) / DEG;
      const k = Math.min(1, Math.max(0, Math.abs(((ang - from + 540) % 360) - 180) / span));
      return code(m, k > 0.75 ? tone + 1 : k < 0.3 ? tone - 1 : tone);
    });
  }

  // ---------------------------------------------------------------- passes

  /** Flips what has been drawn left-right about the foot point (south-west from south-east). */
  mirror(): void {
    const { CW, CH, pix, ord } = this;
    for (let y = 0; y < CH; y++) {
      const r = y * CW;
      pix.subarray(r, r + CW).reverse();
      ord.subarray(r, r + CW).reverse();
    }
    if (this.bx1 >= this.bx0) [this.bx0, this.bx1] = [CW - 1 - this.bx1, CW - 1 - this.bx0];
  }

  /**
   * Contact lines on the shadow side only: where a part lies in front of another, its own rim on
   * its shadow side (the pixel whose right or lower neighbour belongs to a part behind it) takes
   * a tone two steps down. Lit-side rims are left alone, so parts never get a dark line all the
   * way round (pillow shading).
   */
  contact(): void {
    const { CW, CH, pix: PIX, ord: ORD } = this;
    const mark: number[] = [];
    const [x0, y0, x1, y1] = this.box(0, 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * CW + x;
        const v = PIX[i]!;
        if (v < 0) continue;
        const o = ORD[i]!;
        const a = PIX[i + 1]!, b = PIX[i + CW]!;
        if ((a >= 0 && ORD[i + 1]! < o && a >> 3 !== v >> 3) || (b >= 0 && ORD[i + CW]! < o && b >> 3 !== v >> 3)) mark.push(i);
      }
    for (const i of mark) PIX[i] = (PIX[i]! & ~7) | Math.max(0, (PIX[i]! & 7) - 2);
  }

  /** Clusters of one colour smaller than `min` pixels take their most common same-material neighbour. */
  clusters(min: number): void {
    const { CW, CH, pix: PIX } = this;
    const seen = new Uint8Array(CW * CH);
    const stack: number[] = [], members: number[] = [];
    const [bx0, by0, bx1, by1] = this.box(0, 0);
    for (let i0 = by0 * CW + bx0; i0 <= by1 * CW + bx1; i0++) {
      const x0 = i0 % CW;
      if (x0 < bx0 || x0 > bx1) continue;
      const v = PIX[i0]!;
      if (v < 0 || seen[i0]) continue;
      stack.length = members.length = 0;
      stack.push(i0);
      seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        members.push(i);
        for (const j of [i - 1, i + 1, i - CW, i + CW]) {
          if (j < 0 || j >= CW * CH || seen[j] || PIX[j] !== v) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (members.length >= min || isKept(v >> 3)) continue;
      const count = new Map<number, number>();
      for (const i of members)
        for (const j of [i - 1, i + 1, i - CW, i + CW]) {
          const u = PIX[j];
          if (u !== undefined && u >= 0 && u !== v && u >> 3 === v >> 3) count.set(u, (count.get(u) ?? 0) + 1);
        }
      let best = -1, bn = 0;
      for (const [u, n] of count) if (n > bn) [best, bn] = [u, n];
      if (best >= 0) for (const i of members) PIX[i] = best;
    }
  }

  /**
   * Anti-flicker with hysteresis: a pixel whose tone changed since the last frame (same material)
   * keeps last frame's tone when three of its neighbours agree with it, or when the change is a
   * single step and two agree (a band edge does not creep back and forth).
   */
  steady(): void {
    const { CW, pix: PIX, prev: PREV } = this;
    const [x0, y0, x1, y1] = this.box(0, 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * CW + x;
        const v = PIX[i]!, q = PREV[i]!;
        if (v < 0 || q < 0 || v === q || v >> 3 !== q >> 3) continue;
        let agree = 0;
        if (PIX[i - 1] === q) agree++;
        if (PIX[i + 1] === q) agree++;
        if (PIX[i - CW] === q) agree++;
        if (PIX[i + CW] === q) agree++;
        if (agree >= 3 || (agree >= 2 && Math.abs((v & 7) - (q & 7)) === 1)) PIX[i] = q;
      }
  }

  /** Remembers this frame for the next one's anti-flicker. */
  keep(): void {
    this.prev.set(this.pix);
  }

  /** The codes painted and their pixel counts (to build a faction's master palette). */
  codes(into: Map<number, number> = new Map()): Map<number, number> {
    for (const v of this.pix) if (v >= 0) into.set(v, (into.get(v) ?? 0) + 1);
    return into;
  }

  /**
   * Final colours (RGBA, little-endian packed), with no ground shadow (the battle draws its own):
   * every code goes to its fill colour in `fp`; single-pixel islands of a colour (orphans) take
   * their most common neighbour (inks and glows excepted); then the outline, a pixel outside the
   * figure beside it, takes the lit outline where the edge faces the light (from the edge
   * normal) and the dark outline elsewhere.
   */
  colours(fp: FigurePalette): Uint32Array {
    const { CW, CH, pix: PIX } = this;
    const N = CW * CH;
    const ci = new Int16Array(N).fill(-1);
    const [bx0, by0, bx1, by1] = this.box(0, 0);
    for (let i = by0 * CW + bx0; i <= by1 * CW + bx1; i++) {
      const v = PIX[i]!;
      if (v >= 0) ci[i] = fp.fillOf[v]!;
    }
    // Orphans, twice (a fix can leave a new island).
    const cnt = new Int32Array(fp.fills);
    const [ix0, iy0, ix1, iy1] = this.box(0, 1);
    for (let pass = 0; pass < 2; pass++)
      for (let y = iy0; y <= iy1; y++)
        for (let x = ix0; x <= ix1; x++) {
          const i = y * CW + x;
          const v = ci[i]!;
          if (v < 0 || fp.keep[v]) continue;
          if (ci[i - 1] === v || ci[i + 1] === v || ci[i - CW] === v || ci[i + CW] === v) continue;
          cnt.fill(0);
          let best = -1, bn = 0;
          for (const j of [i - 1, i + 1, i - CW, i + CW, i - CW - 1, i - CW + 1, i + CW - 1, i + CW + 1]) {
            const u = ci[j]!;
            if (u < 0 || fp.keep[u]) continue;
            // 4-neighbours count double: that is what makes the pixel part of a cluster.
            cnt[u]! += j === i - 1 || j === i + 1 || j === i - CW || j === i + CW ? 2 : 1;
            if (cnt[u]! > bn) [best, bn] = [u, cnt[u]!];
          }
          if (best >= 0 && bn >= 2) ci[i] = best;
        }
    const out = new Uint32Array(N);
    const packed = fp.rgb.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
    const [kx, ky] = KEY_LIGHT;
    const [ox0, oy0, ox1, oy1] = this.box(1, 0);
    for (let y = oy0; y <= oy1; y++)
      for (let x = ox0; x <= ox1; x++) {
        const i = y * CW + x;
        const v = ci[i]!;
        if (v >= 0) {
          out[i] = packed[v]!;
          continue;
        }
        // Outline: outward normal from the filled 4-neighbours (the pixel it outlines is the
        // first of them found).
        let nx = 0, ny = 0, j = -1;
        if (x > 0 && ci[i - 1]! >= 0) (nx += 1, (j = i - 1));
        if (x < CW - 1 && ci[i + 1]! >= 0) (nx -= 1, (j = j < 0 ? i + 1 : j));
        if (y > 0 && ci[i - CW]! >= 0) (ny += 1, (j = j < 0 ? i - CW : j));
        if (y < CH - 1 && ci[i + CW]! >= 0) (ny -= 1, (j = j < 0 ? i + CW : j));
        if (j < 0) continue;
        const nb = ci[j]!;
        const n = Math.hypot(nx, ny);
        if (n > 0 && (nx * kx + ny * ky) / n > 0.3 && !fp.litDark) {
          // Lit side: a step below the edge pixel's tone, at least tone 1 (always lighter than
          // the dark outline, never darker than the part's own shade next to it).
          const v = PIX[j]!;
          out[i] = fp.selOut ? packed[nb]! : packed[fp.fillOf[(v & ~7) | Math.max(1, (v & 7) - 1)]!]!;
        } else out[i] = packed[fp.dark[nb]!]!;
      }
    return out;
  }
}
