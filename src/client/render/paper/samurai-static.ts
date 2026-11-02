// Samurai key art: one hand-placed static image per kind (idle, facing SE), drawn with the paper
// painter's primitives. NOT registered with the painter: the live game keeps paper/samurai.ts until
// these are approved and split into rig parts. Owned by the samurai faction agent.
//
// Round 2 of the key art (user targets: CraftPix "Fantasy Knight", Diablo II: Resurrected class
// renders; Met gusoku, Kuniyoshi, Shogun 2):
// - armour in real lacquer colours (black, red-brown, deep red) with kebiki lacing in the army
//   colour and a contrasting band, lit lame edges, gilt kanamono, agemaki cords;
// - heads a seventh of the figure, with readable faces (brow, eyes, nose, mouth) and menpō features;
// - horses built from curves: arched neck, round barrel and croup, muscle planes, tapered legs with
//   knees, hocks and fetlocks, mane and tail in strands, tack with tassels;
// - form lighting: a key from the top-left, a shadow side, a rim on hard edges, lit fold ridges.
// H ≈ 15 units (≈ 120 px at level 8).

import { addP, code, DEG, defineMaterial, figurePalette, okHue, oklchRamp, Paper, type Mat, type P2 } from './core.ts';
import { ell, gunbai, javelin, katana, lerpP, lit, mul, part, SM, teppo, yari, yumi } from './samurai-parts.ts';

const frac = (v: number) => v - Math.floor(v);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const norm = (p: P2): P2 => {
  const l = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / l, p[1] / l];
};
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];

// ------------------------------------------------------------------ materials (key art only)

/**
 * Lacquers beside the black: shu-tinged red-brown (the common ashigaru and samurai finish) and
 * the deep red of the "red armour" companies (hatamoto, the lord). Chroma held under the army
 * accent so the team lacing stays the loudest colour.
 */
const KM = {
  redBrown: defineMaterial('samurai.lacRedBrown', oklchRamp({ l: 0.34, c: 0.065, h: 38, spread: 0.075 })),
  deepRed: defineMaterial('samurai.lacDeepRed', oklchRamp({ l: 0.36, c: 0.105, h: 26, spread: 0.075 })),
  /** Bone-white lacing (the contrasting band) and sun-faded silk. */
  silk: defineMaterial('samurai.silkWhite', oklchRamp({ l: 0.8, c: 0.02, h: 90, spread: 0.06 })),
  /** Dark iron of masks and kote, a touch warmer than the field iron. */
  mask: defineMaterial('samurai.maskIron', oklchRamp({ l: 0.32, c: 0.02, h: 40, spread: 0.09 })),
  /**
   * The one accent beside the army colour: the lacing dots and the menpō rim, opposite the army's
   * hue (orange on a blue army, as in the user's blue samurai), warm and a step darker than the team.
   */
  accent: defineMaterial('samurai.accent', (hue) => oklchRamp({ l: 0.56, c: 0.13, h: (okHue(hue) + 180) % 360, spread: 0.08 })),
} as const;

/** An armour's colours: plate lacquer, the lacing, its contrasting band. */
interface Lac {
  /** The lame lacquer. */
  plate: Mat;
  /** The lacing, shown as rows of dots. */
  lace: Mat;
  /** Hems, binding, the kata-iro band. */
  band: Mat;
  /** A gilt edge on each lame instead of a lit lacquer edge (the lord's armour). */
  gildedEdge?: boolean;
}
/** The samurai's armour lacquered in the army colour, gilt, with accent lacing (the user's blue samurai). */
const TEAM_ARMOUR: Lac = { plate: SM.team, lace: KM.accent, band: SM.gold };
const BLACK_GOLD: Lac = { plate: SM.lacquer, lace: SM.team, band: SM.gold, gildedEdge: true };
const DEEPRED_TEAM: Lac = { plate: KM.deepRed, lace: SM.team, band: SM.gold };
const REDBROWN_TEAM: Lac = { plate: KM.redBrown, lace: SM.team, band: KM.silk };

// ------------------------------------------------------------------ volumes

/**
 * A shaped volume from a to b: widths w0 (at a), w1 (the swell, at 45%), w2 (at b), rounded ends;
 * form lighting across it (a lit plane on the top-left, the body, a shadow plane, a broken dark
 * edge, and on hard materials a one-pixel rim on the shadow edge); `detail(un, v)` first
 * (un: -1 lit edge .. 1 shadow edge).
 */
function vol(c: Paper, a: P2, b: P2, w0: number, w1: number, w2: number, mat: Mat, tone = 2, opt: { detail?: (un: number, v: number, x: number, y: number) => number; shine?: boolean; rim?: boolean; caps?: [number, number] } = {}): void {
  const L = c.L;
  const d = norm(sub(b, a));
  const n: P2 = [-d[1], d[0]];
  const [k0, k1] = opt.caps ?? [0.35, 0.35];
  const at = (t: number, w: number, s: number): P2 => addP(lerpP(a, b, t), mul(n, (w / 2) * s));
  const side = (s: number): P2[] => [at(0, w0, s), at(0.2, (w0 + w1) / 2, s), at(0.45, w1, s), at(0.75, (w1 + w2) / 2, s), at(1, w2, s)];
  const pts: P2[] = [addP(a, mul(d, -w0 * k0)), ...side(1), addP(b, mul(d, w2 * k1)), ...side(-1).reverse()];
  const cpts = pts.map((p) => [c.sx(p[0]), c.sy(p[1])] as P2);
  const A: P2 = [c.sx(a[0]), c.sy(a[1])], B: P2 = [c.sx(b[0]), c.sy(b[1])];
  c.poly(cpts, (x, y, u, v) => {
    const vv = clamp(v, 0, 1);
    const hw = ((vv < 0.45 ? w0 + (w1 - w0) * (vv / 0.45) : w1 + (w2 - w1) * ((vv - 0.45) / 0.55)) / 2) * L;
    const un = u / Math.max(0.5, hw);
    if (opt.detail) {
      const r = opt.detail(un, vv, x, y);
      if (r >= 0) return r;
    }
    const bd = c.band;
    if (opt.shine && un > -0.8 && un < -0.52 && vv > 0.15 && vv < 0.55) return code(mat, tone + 2);
    if (opt.rim && un > 0.9 && vv > 0.1 && vv < 0.85) return code(mat, tone);
    if (un < -0.5 + bd) return code(mat, tone + 1);
    if (un > 0.84 && vv > 0.06 && vv < 0.94 && frac(vv * 2.3 + bd) < 0.7) return code(mat, tone - 2);
    if (un > 0.38 + bd) return code(mat, tone - 1);
    return code(mat, tone);
  }, { a: A, b: B, w: 2 });
}

/** A polygon in units shaded by `shade(fx, fy)` in units relative to `o`. */
function slab(c: Paper, o: P2, pts: P2[], shade: (fx: number, fy: number) => number): void {
  part(c, o, 0, pts, shade);
}

/** A closed Catmull-Rom curve through `pts` (units), `k` points per span: organic outlines. */
function curve(pts: P2[], k = 4): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!, p1 = pts[i]!, p2 = pts[(i + 1) % n]!, p3 = pts[(i + 2) % n]!;
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, cc: number, dd: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - dd) * t2 + (-a + 3 * b - 3 * cc + dd) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ armour surfaces

/**
 * Lames as big flat bands (the user's blue samurai): each band one flat tone of the form light,
 * a crisp lit top edge (gilt on the lord's armour), a stepped shadow under it, and the lacing as a
 * row of accent dots across the band, staggered from the band above. `bandRows` rows are in the
 * band colour instead (the kata-iro).
 */
function kebiki(c: Paper, fx: number, fy: number, top: number, t: number, lac: Lac, opt: { per?: number; bandRows?: (row: number) => boolean; curve?: number } = {}): number {
  const L = c.L;
  const per = opt.per ?? 1.05;
  const r = (fy - top - (opt.curve ?? 0.04) * fx * fx) / per;
  const row = Math.floor(r);
  const k = frac(r);
  const px = 1 / (L * per);
  const plate = opt.bandRows?.(row) ? lac.band : lac.plate;
  if (k < px) return lac.gildedEdge ? code(SM.gold, t >= 2 ? 3 : 2) : code(plate, t >= 2 ? clamp(t + 2, 0, 4) : t + 1); // the lit top edge
  if (k > 1 - 1.6 * px) return code(plate, Math.max(0, t - 2)); // the step's shadow
  if (k > 1 - 3.2 * px) return code(plate, Math.max(0, t - 1));
  // Lacing: dots in a row across the band, two pixels wide, staggered from row to row.
  const q = frac((fx + 5 + (row & 1) * 0.45) / 0.9);
  if (k > 0.26 && k < 0.6 && q < (L >= 8 ? 2 : 1.4) / (0.9 * L)) return code(lac.lace, t >= 2 ? 3 : 2);
  return code(plate, t);
}

/** Okegawa-dō: riveted horizontal plates in plain lacquer with kanamono rivet heads and lit plate edges. */
function okegawa(c: Paper, fx: number, fy: number, top: number, t: number, plate: Mat, per = 0.85): number {
  const L = c.L;
  const r = (fy - top - 0.06 * fx * fx) / per;
  const k = frac(r);
  const px = 1 / (L * per);
  if (k < px) return code(plate, t >= 2 ? clamp(t + 1, 0, 4) : t);
  if (k > 1 - px) return code(plate, Math.max(0, t - 2));
  if (k > 0.35 && k < 0.35 + 1.6 * px && frac((fx + 4) / 0.62) < 0.2) return code(SM.gold, t >= 2 ? 3 : 2); // rivets
  return code(plate, t);
}

/** A gilt agemaki bow (the big tassel-knot) at `at`: two loops and two hanging tails. */
function agemaki(c: Paper, at: P2, mat: Mat = SM.team, s = 1): void {
  for (const dx of [-0.38, 0.38]) part(c, addP(at, [dx * s, -0.05 * s]), 0, ell(0.36 * s, 0.24 * s, 0, 0, 12), (fx, fy) => (Math.hypot(fx, fy) < 0.14 * s ? -1 : code(mat, fx + fy < 0 ? 3 : 1)));
  vol(c, addP(at, [-0.05 * s, 0.1 * s]), addP(at, [-0.3 * s, 1.0 * s]), 0.22 * s, 0.24 * s, 0.3 * s, mat, 2, { caps: [0, 0.2] });
  vol(c, addP(at, [0.05 * s, 0.1 * s]), addP(at, [0.35 * s, 0.95 * s]), 0.22 * s, 0.24 * s, 0.3 * s, mat, 1, { caps: [0, 0.2] });
  part(c, at, 0, ell(0.16 * s, 0.14 * s, 0, 0, 10), () => code(SM.gold, 3));
}

// ------------------------------------------------------------------ the man

interface Body {
  head: P2;
  neck: P2;
  pel: P2;
  shN: P2; elN: P2; hnN: P2;
  shF: P2; elF: P2; hnF: P2;
  hipN: P2; knN: P2; anN: P2;
  hipF: P2; knF: P2; anF: P2;
}

/** The head is a seventh of the figure: about 2.15 units tall, so the parts below scale by HS. */
const HS = 1.3;

/** The standing skeleton (feet apart, weight settled), shifted by `o`. */
function stand(o: P2 = [0, 0], over: Partial<Body> = {}): Body {
  const t = (p: P2): P2 => addP(p, o);
  const b: Body = {
    head: t([0.3, -13.35]), neck: t([0.15, -11.85]), pel: t([0, -6.6]),
    shN: t([-2.05, -10.75]), elN: t([-2.45, -8.35]), hnN: t([-2.25, -6.2]),
    shF: t([1.9, -10.65]), elF: t([2.25, -8.3]), hnF: t([2.1, -6.2]),
    hipN: t([-0.9, -6.5]), knN: t([-1.25, -3.35]), anN: t([-1.3, -0.45]),
    hipF: t([0.9, -6.55]), knF: t([1.3, -3.4]), anF: t([1.45, -0.5]),
  };
  for (const [k, v] of Object.entries(over)) (b as unknown as Record<string, P2>)[k] = t(v as P2);
  return b;
}

type Head = 'kabuto' | 'jingasa' | 'hachimaki' | 'kato' | 'kasa';

interface Dress {
  head: Head;
  crest?: 'kuwagata' | 'crescent' | 'none';
  /** Samurai mask over the lower face. */
  menpo?: boolean;
  /** 'gusoku' full laced armour; 'okegawa' ashigaru plate; 'happi' jacket; 'robe' monk. */
  body: 'gusoku' | 'okegawa' | 'happi' | 'robe';
  lac: Lac;
  sode: 'big' | 'small' | 'none';
  sleeve: Mat;
  legs: Mat;
  shin: 'suneate' | 'kyahan' | 'robe';
  /** Draw the legs (false when riding). */
  legsOn?: boolean;
  jinbaori?: boolean;
  moustache?: boolean;
}

// ---------------------------------------------------------------- heads

/** The face, 3/4 to the right, a seventh of the figure: brow, eyes with a catch-light, nose, mouth, ear, jaw. */
function face(c: Paper, h: P2, opt: { hair: 'top' | 'cap' | 'none'; moustache?: boolean; hidden?: 'lower' }): void {
  const s = HS;
  slab(c, h, ell(0.66 * s, 0.82 * s, 0.03, 0.06 * s, 18), (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    const lightS = fx * 0.55 + fy * 0.55;
    if (opt.hair === 'top' && (fy < -0.46 || (fx < -0.3 && fy < 0.15))) return code(SM.hair, fx < -0.2 && fy < -0.5 ? 3 : 2);
    if (opt.hair === 'cap' && fy < -0.45) return code(SM.hair, 2);
    // Brow: a heavy line and the shadow under it.
    if (fy > -0.24 && fy < -0.17 && fx > -0.12 && fx < 0.66) return code(SM.hair, 1);
    // Eyes: dark with a catch-light on the near one.
    for (const ex of [0.02, 0.44]) {
      if (Math.abs(fx - ex) < 0.11 && fy > -0.13 && fy < -0.02) return ex > 0.3 && fx < ex - 0.03 ? code(KM.silk, 3) : code(SM.ink, 0);
    }
    // Nose: lit ridge and the shadow under it.
    if (fx > 0.56 && fx < 0.66 && fy > -0.05 && fy < 0.22) return code(SM.flesh, 4);
    if (fx > 0.42 && fx < 0.62 && fy > 0.2 && fy < 0.28) return code(SM.flesh, 0);
    if (opt.moustache && fy > 0.33 && fy < 0.42 && fx > 0.05 && fx < 0.66) return code(SM.hair, 2);
    if (fy > 0.44 && fy < 0.5 && fx > 0.18 && fx < 0.55) return code(SM.ink, 1); // mouth
    // Ear on the near side.
    if (Math.hypot(fx + 0.42, fy - 0.02) < 0.14) return code(SM.flesh, 1);
    // Form: lit cheek and brow, the jaw and the far side in shade.
    if (fy > 0.6 || fx > 0.6) return code(SM.flesh, 1);
    return code(SM.flesh, lightS < -0.2 ? 3 : lightS > 0.35 ? 1 : 2);
  });
}

/** Menpō: a lacquered iron mask over the lower face with a nose, a mouth slit, a bristling moustache, and the yodare-kake below. */
function menpo(c: Paper, h: P2, lac: Lac): void {
  const s = HS;
  const S = (p: P2[]) => p.map((q) => [q[0] * s, q[1] * s] as P2);
  slab(c, h, S([[-0.42, 0.1], [0.72, 0.02], [0.82, 0.3], [0.7, 0.62], [0.25, 0.92], [-0.35, 0.82]]), (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    if (fx > 0.55 && fy > 0.02 && fy < 0.3) return code(KM.mask, 4); // the nose piece's lit ridge
    if (fy > 0.3 && fy < 0.38 && fx > 0.0 && fx < 0.72) return code(KM.silk, frac(fx * 9) < 0.5 ? 3 : 2); // moustache
    if (fy > 0.47 && fy < 0.53 && fx > 0.2 && fx < 0.6) return code(SM.ink, 0); // mouth slit
    if (fy > 0.62 && fx > 0.0 && fx < 0.55 && frac(fx * 8) < 0.5) return code(KM.silk, 2); // chin beard
    return code(KM.mask, lit(c, 2, fx * 0.5 + fy * 0.5, 0.35, 0.45));
  });
  // Yodare-kake: the laced throat guard hanging from the mask.
  slab(c, h, S([[-0.65, 0.78], [0.85, 0.7], [0.95, 1.25], [-0.75, 1.35]]), (fx, fy) => kebiki(c, fx, fy, 0.75 * s, lit(c, 2, fx * 0.4, 0.4, 0.45), lac, { per: 0.32, bandRows: () => false }));
}

/** The kabuto's shikoro: flared laced lames behind the head (before the face). */
function shikoro(c: Paper, h: P2, lac: Lac): void {
  const s = HS;
  const pts: P2[] = [[-0.9, -0.45], [0.2, -0.5], [1.15, -0.3], [1.55, 0.55], [1.0, 0.95], [-0.2, 1.05], [-1.6, 1.3], [-2.5, 0.95], [-1.8, -0.15]];
  slab(c, h, pts.map((q) => [q[0] * s, q[1] * s] as P2), (fx, fy) => {
    const t = lit(c, 2, fx * 0.3 + fy * 0.45, 0.45, 0.45);
    return kebiki(c, fx, fy - 0.08 * fx, -0.4 * s, t, lac, { per: 0.62, bandRows: () => false });
  });
}

/** The kabuto: a ridged bowl with gilt rivets, a lit rim, big gilt-edged fukigaeshi, and the crest. */
function kabuto(c: Paper, h: P2, lac: Lac, crest: 'kuwagata' | 'crescent' | 'none'): void {
  const s = HS;
  const L = c.L;
  const S = (p: P2[]) => p.map((q) => [q[0] * s, q[1] * s] as P2);
  // A big boxy bowl (zunari-style): a flat lit crown plane, a front plane, a side in shade, the
  // gilt koshimaki band; broad flat planes, few tones.
  slab(c, h, S([[-1.25, -0.3], [-1.2, -1.15], [-0.75, -1.6], [0.55, -1.65], [1.15, -1.3], [1.3, -0.3]]), (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    if (fy > -0.5 && fy < -0.36) return code(SM.gold, frac(fx * 3) < 0.25 ? 4 : 3); // koshimaki with rivets
    if (fy < -1.3 + Math.abs(fx - 0.0) * 0.12) return code(lac.plate, 4); // the crown catching the key light
    if (fx > 0.75) return code(lac.plate, 1); // the far side
    if (fx < -0.6) return code(lac.plate, 3); // the near side, lit
    if (L >= 8 && Math.abs(fx - 0.1) < 0.05) return code(lac.plate, 3); // a lit ridge
    return code(lac.plate, 2);
  });
  if (L >= 4) slab(c, addP(h, [0, -1.33 * s]), ell(0.22, 0.12, 0, 0, 10), () => code(SM.gold, 3)); // tehen
  slab(c, h, S([[-0.4, -0.38], [1.25, -0.42], [1.42, -0.2], [-0.2, -0.16]]), (fx) => code(lac.plate, fx < 0.6 ? 3 : 2)); // mabizashi
  // Fukigaeshi: the turned-back wings, gilt-edged, a gilt mon on the near one.
  slab(c, h, S([[-0.95, -0.42], [-1.95, -1.0], [-2.25, -0.2], [-1.85, 0.35], [-1.05, 0.0]]), (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    if (fy < -0.78 || fx < -2.1) return code(SM.gold, 3);
    if (Math.hypot(fx + 1.6, fy + 0.25) < 0.22) return code(SM.gold, 2);
    return code(lac.plate, lit(c, 3, fx * 0.5 + fy * 0.4, 0.4, 0.4));
  });
  slab(c, h, S([[0.95, -0.35], [1.6, -0.75], [1.7, -0.1], [1.15, 0.1]]), (fx0) => (fx0 / s > 1.55 ? code(SM.gold, 2) : code(lac.plate, 1)));
  const base: P2 = addP(h, [0.45 * s, -0.75 * s]);
  if (crest === 'kuwagata') {
    for (const [dx, tone] of [[-1.25, 2], [1.4, 3]] as [number, number][]) {
      const mid = addP(base, [dx * 0.45, -1.6]);
      const tip = addP(base, [dx * 0.85, -3.6]);
      vol(c, base, mid, 0.44, 0.48, 0.4, SM.gold, tone, { caps: [0.2, 0.1], rim: true });
      vol(c, mid, tip, 0.4, 0.34, 0.16, SM.gold, tone, { caps: [0.05, 0.3], shine: tone === 3, rim: true });
    }
    slab(c, base, ell(0.36, 0.32, 0, 0, 12), (fx, fy) => code(SM.gold, fx + fy < -0.1 ? 4 : 2));
  } else if (crest === 'crescent') {
    const outer = ell(2.8, 1.65, 0.45, -2.75, 16, 10, 170);
    const inner = ell(2.35, 1.05, 0.45, -2.9, 16, 170, 10);
    slab(c, h, outer.concat(inner), (fx, fy) => code(SM.gold, fx < -0.8 ? 4 : fx > 1.9 ? 1 : fy > -1.55 ? 2 : 3));
    slab(c, base, ell(0.34, 0.32, 0, 0, 12), () => code(SM.gold, 2));
  }
}

/** The jingasa: a wide shallow lacquered cone with a gilt mon; the face under its brim. */
function jingasa(c: Paper, h: P2, plate: Mat): void {
  const s = HS;
  const pts: P2[] = [[0.05, -1.4], [2.45, -0.3], [2.35, -0.04], [0.0, -0.32], [-2.35, -0.04], [-2.4, -0.3]].map((q) => [q[0]! * s, q[1]! * s] as P2);
  slab(c, h, pts, (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    if (fy > -0.27 + Math.abs(fx) * 0.1) return code(plate, 1); // the underside
    if (Math.hypot(fx - 0.25, (fy + 0.75) * 1.6) < 0.3) return code(SM.gold, fx < 0.2 ? 3 : 2);
    const top = -1.4 + Math.abs(fx) * ((1.4 - 0.3) / 2.4);
    if (fy - top < 0.08 && fx < 0.5) return code(plate, 4); // lit crest line
    if (frac((Math.atan2(fy + 1.4, fx) / DEG + 360) / 18) < 0.06) return code(plate, 2); // the ribs of the cone
    return code(plate, lit(c, 3, fx * 0.7, 0.5, 0.55));
  });
}

function hachimaki(c: Paper, h: P2): void {
  const s = HS;
  vol(c, addP(h, [-0.66 * s, -0.3 * s]), addP(h, [0.7 * s, -0.4 * s]), 0.36, 0.38, 0.34, KM.silk, 2, { caps: [0.1, 0.1] });
  vol(c, addP(h, [-0.7 * s, -0.3 * s]), addP(h, [-1.35 * s, 0.5 * s]), 0.3, 0.3, 0.2, KM.silk, 2, { caps: [0, 0.3] });
  vol(c, addP(h, [-0.7 * s, -0.25 * s]), addP(h, [-1.15 * s, 0.75 * s]), 0.26, 0.26, 0.18, KM.silk, 1, { caps: [0, 0.3] });
  vol(c, addP(h, [-0.15 * s, -0.85 * s]), addP(h, [0.35 * s, -1.1 * s]), 0.36, 0.34, 0.3, SM.hair, 2); // topknot
}

/** The katō: a white cowl wrapped round the head, an eye slit, the tail over the shoulders. */
function kato(c: Paper, h: P2): void {
  const s = HS;
  slab(c, h, ell(0.82 * s, 0.94 * s, -0.04, 0, 18), (fx0, fy0) => {
    const fx = fx0 / s, fy = fy0 / s;
    if (fy > -0.2 && fy < 0.1 && fx > 0.02 && fx < 0.85) {
      if (Math.abs(fx - 0.45) < 0.1 && fy > -0.13 && fy < 0.03) return code(SM.ink, 0);
      if (fy < -0.12 && fx > 0.1 && fx < 0.7) return code(SM.hair, 1); // brow
      return code(SM.flesh, fx > 0.65 ? 1 : 2);
    }
    if (Math.abs(fy - fx * 0.35 + 0.45) < 0.05 || Math.abs(fy - fx * 0.3 - 0.45) < 0.05) return code(KM.silk, 1); // wrap folds
    return code(KM.silk, lit(c, 2, fx * 0.7 + fy * 0.5, 0.4, 0.45));
  });
  slab(c, h, [[-0.8, 0.25], [0.7, 0.45], [0.95, 1.4], [0.1, 1.85], [-1.15, 1.55]].map((q) => [q[0]! * s, q[1]! * s] as P2), (fx, fy) => (Math.abs(fx * 0.6 - fy + 1.6) < 0.08 ? code(KM.silk, 1) : code(KM.silk, lit(c, 2, fx * 0.6 + fy * 0.3, 0.4, 0.5))));
}

/** The ayaigasa: the mounted archer's wide flat straw hat, woven in rings, with its chin cord. */
function kasa(c: Paper, h: P2): void {
  const s = HS;
  slab(c, h, ell(2.1 * s, 0.52 * s, 0.1, -0.62 * s, 22), (fx, fy) => {
    if (fy > -0.5 * s) return code(SM.straw, 1);
    if (frac(Math.hypot(fx - 0.1, (fy + 0.62 * s) * 4) / 0.45) < 0.16) return code(SM.straw, 1);
    return code(SM.straw, lit(c, 3, fx * 0.4, 0.4, 0.5));
  });
  slab(c, addP(h, [0.1, -0.95 * s]), ell(0.62 * s, 0.38 * s, 0, 0, 14), (fx, fy) => code(SM.straw, fx + fy < -0.1 ? 4 : 2));
  vol(c, addP(h, [-0.45 * s, -0.35 * s]), addP(h, [0.2 * s, 0.85 * s]), 0.14, 0.14, 0.14, SM.lacquer, 1, { caps: [0, 0] });
}

/** Head with its gear. */
function head(c: Paper, b: Body, d: Dress): void {
  const h = b.head;
  switch (d.head) {
    case 'kabuto':
      shikoro(c, h, d.lac);
      face(c, h, { hair: 'none' });
      if (d.menpo) menpo(c, h, d.lac);
      kabuto(c, h, d.lac, d.crest ?? 'none');
      break;
    case 'jingasa':
      face(c, h, { hair: 'none', moustache: d.moustache });
      jingasa(c, h, d.lac.plate);
      break;
    case 'hachimaki':
      face(c, h, { hair: 'top', moustache: d.moustache });
      hachimaki(c, h);
      break;
    case 'kato':
      kato(c, h);
      break;
    case 'kasa':
      face(c, h, { hair: 'cap', moustache: d.moustache });
      kasa(c, h);
      break;
  }
}

// ---------------------------------------------------------------- body

function fist(c: Paper, at: P2, mat: Mat, t: number): void {
  slab(c, at, ell(0.52, 0.46, 0.05, 0.1, 14), (fx, fy) => {
    if (fy < -0.12 && Math.abs(fx - 0.05) < 0.4 && frac(fx * 4 + 0.2) < 0.25) return code(mat, Math.max(0, t - 1)); // knuckles
    return code(mat, lit(c, t, fx * 0.9 + fy * 0.7, 0.3, 0.4));
  });
}

/** Arm volume: the sleeve with its crease, the kote's splints and mail, the fist. */
function arm(c: Paper, sh: P2, el: P2, hn: P2, d: Dress, far: boolean, fistMat?: Mat): void {
  const t = far ? 1 : 2;
  const armoured = d.body === 'gusoku';
  const robe = d.body === 'robe';
  const sleeve = d.sleeve;
  vol(c, sh, el, robe ? 1.9 : 1.5, robe ? 1.95 : 1.55, robe ? 1.6 : 1.2, sleeve, t, {
    detail: (un, v) => (un > -0.25 && un < 0.25 && Math.abs(frac(v * 2.2 + 0.3) - 0.5) < 0.09 ? code(sleeve, t - 1) : un < -0.2 && Math.abs(frac(v * 2.2 + 0.3) - 0.62) < 0.06 ? code(sleeve, t + 1) : -1),
  });
  vol(c, el, hn, robe ? 1.5 : 1.25, robe ? 1.4 : 1.25, 0.95, armoured ? KM.mask : sleeve, t, {
    shine: armoured,
    rim: armoured,
    detail: armoured ? (un, v) => (v > 0.1 && v < 0.85 && Math.abs(un + 0.1) < 0.24 && frac(v * 3) > 0.25 ? code(SM.gold, frac(v * 3) < 0.35 ? 3 : t) : frac(v * 3) < 0.08 ? code(KM.mask, t - 1) : -1) : undefined,
    caps: [0.25, 0.2],
  });
  fist(c, hn, fistMat ?? (armoured ? d.lac.plate : SM.flesh), t);
}

/** Leg volume: hakama'd thigh with lit fold ridges, the shin (suneate or kyahan), knee, tabi and waraji. */
function leg(c: Paper, hip: P2, kn: P2, an: P2, d: Dress, far: boolean): void {
  const t = far ? 1 : 2;
  const legs = d.legs;
  const robe = d.body === 'robe';
  vol(c, hip, kn, robe ? 2.0 : 1.85, robe ? 2.0 : 1.95, 1.45, legs, t, {
    detail: (un, v) => {
      const f = frac(v * 2.4 + un * 0.6);
      if (un > 0.05 && f < 0.14) return code(legs, t - 1); // fold valley
      if (f > 0.14 && f < 0.24 && un < 0.6) return code(legs, t + 1); // lit fold ridge
      return -1;
    },
  });
  const shin = d.shin === 'suneate' ? KM.mask : SM.black;
  vol(c, kn, an, 1.4, 1.35, 0.95, shin, t, {
    shine: d.shin === 'suneate',
    rim: d.shin === 'suneate',
    detail: (un, v) =>
      d.shin === 'suneate'
        ? Math.abs(un) < 0.14 && v > 0.1 && v < 0.9 ? code(SM.gold, 2) : frac(v * 3.2) < 0.08 ? code(KM.mask, t - 1) : -1
        : frac(v * 3) < 0.09 ? code(KM.silk, 1) : -1,
    caps: [0.3, 0.15],
  });
  slab(c, kn, ell(0.74, 0.56, 0, -0.05, 14), (fx, fy) => code(d.shin === 'suneate' ? KM.mask : legs, lit(c, t, fx * 0.8 + fy * 0.8, 0.3, 0.4)));
  const toe = addP(an, [1.2, 0.35]);
  vol(c, addP(an, [-0.25, 0.05]), toe, 0.85, 0.8, 0.6, KM.silk, t - 1, { caps: [0.2, 0.3] });
  vol(c, addP(an, [-0.35, 0.38]), addP(toe, [0.15, 0.08]), 0.32, 0.3, 0.28, SM.straw, 1);
}

const TORSO: P2[] = [[-2.2, -4.75], [-0.6, -5.05], [1.0, -5.0], [2.15, -4.65], [2.25, -2.9], [1.8, -0.1], [-1.75, -0.1], [-2.3, -2.9]];
/** Form light on the dō: lit upper-left, the front plane turning to a shaded side past x ≈ 1.1. */
const torsoTone = (c: Paper, fx: number, fy: number): number => {
  let t = lit(c, 2, fx * 0.42 + (fy + 2.4) * 0.22, 0.5, 0.45);
  if (fx > 1.15 - fy * 0.05) t = Math.min(t, 1);
  return t;
};

function torso(c: Paper, b: Body, d: Dress): void {
  const o = b.pel;
  if (d.body === 'gusoku') {
    slab(c, o, TORSO, (fx, fy) => {
      const t = torsoTone(c, fx, fy);
      if (fy < -4.2) return code(d.lac.plate, fx < 0.4 ? Math.min(4, t + 1) : t); // the munaita, a lit plate
      if (fy < -4.05) return code(SM.gold, fx < 0.4 ? 3 : 2); // gilt edge
      // Kebiki rows: the top two rows the contrasting band (kata-iro).
      return kebiki(c, fx, fy, -4.05, t, d.lac, { bandRows: (r) => r === 0 });
    });
    agemaki(c, addP(o, [1.1, -4.5]), d.lac.lace, 0.9);
  } else if (d.body === 'okegawa') {
    slab(c, o, TORSO, (fx, fy) => {
      const t = torsoTone(c, fx, fy);
      if (fy < -4.2) return code(d.lac.plate, fx < 0.4 ? Math.min(4, t + 1) : t);
      // The clan mon in gold, a thin ring with a disc.
      const m = Math.hypot(fx - 0.15, (fy + 2.95) * 1.05);
      if (m < 0.72) return m > 0.5 || m < 0.22 ? code(SM.gold, fx < 0.1 ? 3 : 2) : code(d.lac.plate, t);
      return okegawa(c, fx, fy, -4.2, t, d.lac.plate);
    });
  } else if (d.body === 'happi') {
    slab(c, o, TORSO.map((p) => [p[0] * 0.95, p[1]] as P2), (fx, fy) => {
      const t = torsoTone(c, fx, fy);
      if (Math.abs(fx - 0.2 + (fy + 4.9) * 0.32) < 0.32 && fy < -2.3) return code(KM.silk, t);
      if (fy > -0.85) return code(SM.teamDk, t);
      const f = frac((fx + 3) / 1.25 + fy * 0.08);
      if (f < 0.07) return code(SM.team, t - 1);
      if (f > 0.07 && f < 0.13) return code(SM.team, Math.min(4, t + 1));
      if (Math.hypot(fx + 0.95, fy + 2.4) < 0.55) return code(KM.silk, 2); // a white mon on the jacket
      return code(SM.team, t);
    });
  } else {
    slab(c, o, TORSO.map((p) => [p[0] * 1.08, p[1]] as P2), (fx, fy) => {
      const t = torsoTone(c, fx, fy);
      if (Math.abs(fy + 2.6 - fx * 0.85) < 0.75) {
        const f = frac((fx + 4) / 0.9);
        return code(SM.ochre, f < 0.1 ? t - 1 : f < 0.18 ? Math.min(4, t + 1) : t); // the kesa's stitched panels
      }
      const f = frac((fx + 3) / 1.1 - fy * 0.1);
      if (f < 0.08) return code(SM.black, t - 1);
      if (f < 0.15) return code(SM.black, Math.min(4, t + 1));
      return code(SM.black, t);
    });
  }
  if (d.jinbaori) {
    slab(c, o, [[-2.4, -4.9], [-0.7, -5.1], [-0.9, 0.6], [-2.6, 0.7]], (fx, fy) => (fx > -1.05 || fy > 0.35 ? code(SM.gold, 2) : code(SM.black, lit(c, 2, fx * 0.5 + fy * 0.2, 0.4, 0.5))));
    slab(c, o, [[1.0, -5.0], [2.35, -4.75], [2.55, 0.6], [1.15, 0.5]], (fx) => (fx < 1.3 ? code(SM.gold, 2) : code(SM.black, 1)));
  }
  // The obi: a sash with lit fold ridges, knotted at the front.
  const m = d.body === 'robe' ? SM.ochre : d.body === 'happi' ? SM.indigo : KM.silk;
  slab(c, o, [[-1.85, -0.45], [1.85, -0.5], [1.85, 0.15], [-1.85, 0.2]], (fx, fy) => {
    const f = frac((fx + 3) / 0.9 + fy * 0.4);
    if (f < 0.1) return code(m, 0);
    if (f < 0.18) return code(m, 2);
    return code(m, fx < -1.0 ? 2 : fx > 1.1 ? 0 : 1);
  });
}

/** The kusazuri: five panels flaring out over the thighs, bound at the hem in the band colour. */
function kusazuri(c: Paper, b: Body, d: Dress, layer: 'back' | 'front'): void {
  if (d.body === 'happi') return;
  const o = addP(b.pel, [0, 0.25]);
  const robe = d.body === 'robe';
  const long = d.body === 'gusoku' ? 2.9 : robe ? 5.6 : 2.4;
  const panels: [number, number, number][] = layer === 'back' ? [[1.5, 0.75, 1], [-1.9, -0.75, 1]] : [[-1.25, -0.55, 3], [0.1, 0.05, 2], [1.3, 0.55, 1]];
  for (const [x, flare, tone] of panels) {
    const w0 = robe ? 1.25 : 0.82, w1 = robe ? 1.55 : 1.05;
    const pts: P2[] = robe
      ? [[x - w0, 0], [x + w0, 0], [x + w1 + flare, long - 0.2], [x + flare, long + 0.15], [x - w1 + flare, long - 0.3]]
      : [[x - w0, 0], [x + w0, 0], [x + w1 + flare, long], [x - w1 + flare, long]];
    slab(c, o, pts, (fx, fy) => {
      const rel = fx - x - flare * (fy / long);
      const t = lit(c, tone === 1 ? 1 : 2, rel * 0.7 + fy * 0.18 + (tone === 1 ? 0.3 : -0.1), 0.45, 0.5);
      if (robe) {
        const pleat = frac((rel + 3) / 0.7);
        if (fy > long - 0.35) return code(SM.black, Math.max(0, t - 1));
        if (pleat < 0.12) return code(SM.black, Math.max(0, t - 1));
        if (pleat < 0.24 && rel < 0.4) return code(SM.black, Math.min(4, t + 1)); // lit pleat ridge
        return code(SM.black, t);
      }
      if (fy > long - 0.3) return code(d.lac.band, t); // the bound hem (hishinui)
      if (d.body === 'okegawa') return okegawa(c, rel, fy, 0.05, t, d.lac.plate, 0.6);
      return kebiki(c, rel, fy, 0.05, t, d.lac, { per: 0.8, bandRows: () => false, curve: 0.02 });
    });
  }
}

/** Haidate: an apron of small iron scales on cloth over the thighs (gusoku only). */
function haidate(c: Paper, b: Body, d: Dress): void {
  for (const [hip, kn, t] of [[b.hipF, b.knF, 1], [b.hipN, b.knN, 2]] as [P2, P2, number][]) {
    vol(c, lerpP(hip, kn, 0.3), lerpP(hip, kn, 0.95), 2.0, 2.1, 1.75, d.lac.plate, t, {
      caps: [0.05, 0.15],
      detail: (un, v, x) => {
        const row = Math.floor(v * 5);
        if (frac(v * 5) < 0.18) return code(d.lac.lace, t);
        if (un < 0.35 && frac((x - c.ox) / (c.L * 0.55) + row * 0.5) < 0.45) return code(KM.mask, t + (un < -0.4 ? 2 : 1));
        return -1;
      },
    });
  }
}

/** Sode: a big laced shoulder board, a lit kanmuri-ita on top with gilt rivets, the band rows, a bound hem. */
function sode(c: Paper, sh: P2, far: boolean, big: boolean, lac: Lac, ang = 0): void {
  const w = big ? (far ? 1.05 : 1.3) : far ? 0.7 : 0.85;
  const h = big ? 2.8 : 1.7;
  const dx = far ? 0.45 : -0.45;
  part(c, addP(sh, [dx, -0.1]), ang, [[-w, -0.1], [w, -0.25], [w + 0.18, h], [-w - 0.12, h + 0.1]], (fx, fy) => {
    const t = far ? 1 : lit(c, 2, fx * 0.75 + fy * 0.12, 0.35, 0.5);
    if (fy < 0.2) return Math.abs(frac((fx + 3) / 0.6) - 0.5) < 0.12 ? code(SM.gold, 3) : code(lac.plate, far ? 2 : Math.min(4, t + 1));
    if (fy > h - 0.3) return code(lac.band, t);
    return kebiki(c, fx, fy, 0.2, t, lac, { per: 0.75, bandRows: (r) => r === 0 });
  });
}

/** The sashimono: a lacquered pole, a crossbar, the tall team flag with a pale mon, folds lit. */
function sashimono(c: Paper, base: P2, height = 9.6, w = 2.0, h = 4.4): void {
  const top = addP(base, [-0.15, -height]);
  vol(c, base, top, 0.3, 0.3, 0.26, SM.lacquer, 2, { caps: [0, 0.1], rim: true });
  slab(c, top, [[0, 0.25], [-w, 0.25], [-w + 0.1, h], [0.05, h + 0.05]], (fx, fy) => {
    if (Math.hypot(fx + w / 2, fy - h * 0.36) < w * 0.27) return code(KM.silk, Math.hypot(fx + w / 2 + 0.1, fy - h * 0.36 + 0.1) < w * 0.14 ? 3 : 2);
    const f = frac((fx + 5 + fy * 0.12) / (w / 2.4));
    if (f < 0.07) return code(SM.team, 1);
    if (f < 0.13) return code(SM.team, 3); // lit fold ridge
    const sd = fx / w + (fy / h) * 0.5;
    return code(SM.team, sd > -0.05 ? 1 : sd < -0.62 ? 3 : 2);
  });
  vol(c, addP(top, [-w - 0.15, 0.2]), addP(top, [0.2, 0.2]), 0.24, 0.24, 0.24, SM.lacquer, 2, { caps: [0.1, 0.1] });
}

/** The horo: a puffed cloth balloon on a cane frame, pinned at the shoulders, its gores lit. */
function horo(c: Paper, at: P2, big = 1): void {
  const pts = curve([[0.3, -2.6], [-0.8, -3.6], [-2.4, -3.6], [-3.6, -2.5], [-4.1, -0.6], [-3.8, 1.4], [-2.8, 2.8], [-1.3, 3.2], [0.1, 2.5]].map((p) => [p[0]! * big, p[1]! * big] as P2), 3);
  slab(c, at, pts, (fx, fy) => {
    const ang = Math.atan2(fx + 0.2, fy + 3.9 * big) / DEG;
    const gore = frac((ang + 90) / 13);
    const s = (fx / big) * 0.08 + (fy / big) * 0.32 - (fx / big + 2) * 0.12;
    const t = s < -0.45 + c.band ? 3 : s > 0.42 + c.band ? 1 : 2;
    if (gore < 0.09) return code(SM.teamDk, Math.max(1, t));
    if (gore < 0.22 && t >= 2) return code(SM.team, Math.min(4, t + 1));
    const m = Math.hypot(fx + 2.2 * big, fy + 0.1);
    if (m < 0.62 * big) return code(KM.silk, m < 0.3 * big ? 2 : 3);
    return code(SM.team, t);
  });
  vol(c, addP(at, [0.2, -2.55 * big]), addP(at, [-1.6 * big, -3.65 * big]), 0.22, 0.22, 0.2, SM.wood, 2);
}

function swords(c: Paper, b: Body): void {
  const o = b.pel;
  vol(c, addP(o, [1.6, -0.3]), addP(o, [-3.3, 1.9]), 0.4, 0.4, 0.34, SM.lacquer, 2, { caps: [0.3, 0.3], rim: true });
  vol(c, addP(o, [1.6, -0.3]), addP(o, [2.6, -0.85]), 0.36, 0.36, 0.36, SM.black, 2, { detail: (_u, v) => (frac(v * 4) < 0.3 ? code(KM.silk, 2) : -1) });
  slab(c, addP(o, [1.6, -0.3]), ell(0.3, 0.26, 0, 0, 10), () => code(SM.gold, 3)); // tsuba
  vol(c, addP(o, [1.4, 0.05]), addP(o, [-2.0, 1.6]), 0.34, 0.34, 0.3, SM.lacquer, 1);
}

interface Layers {
  back?: () => void;
  behind?: () => void;
  held?: () => void;
  hipGear?: () => void;
  fistN?: Mat;
  fistF?: Mat;
}

/** A whole man, back to front, facing SE. */
function man(c: Paper, b: Body, d: Dress, layers: Layers): void {
  const legs = d.legsOn !== false;
  layers.back?.();
  if (legs) leg(c, b.hipF, b.knF, b.anF, d, true);
  arm(c, b.shF, b.elF, b.hnF, d, true, layers.fistF);
  if (d.sode !== 'none') sode(c, b.shF, true, d.sode === 'big', d.lac);
  layers.behind?.();
  kusazuri(c, b, d, 'back');
  if (legs) leg(c, b.hipN, b.knN, b.anN, d, false);
  if (legs && d.body === 'gusoku') haidate(c, b, d);
  torso(c, b, d);
  kusazuri(c, b, d, 'front');
  layers.hipGear?.();
  head(c, b, d);
  arm(c, b.shN, b.elN, b.hnN, d, false, layers.fistN);
  if (d.sode !== 'none') sode(c, b.shN, false, d.sode === 'big', d.lac, 4);
  layers.held?.();
}

// ------------------------------------------------------------------ dresses

const SAMURAI: Dress = { head: 'kabuto', crest: 'kuwagata', menpo: true, body: 'gusoku', lac: TEAM_ARMOUR, sode: 'big', sleeve: SM.teamDk, legs: SM.teamDk, shin: 'suneate' };
const ASHIGARU: Dress = { head: 'jingasa', body: 'okegawa', lac: REDBROWN_TEAM, sode: 'small', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' };

// ------------------------------------------------------------------ the foot figures

/** 0: Katana Samurai in chūdan, both hands on the hilt; black lacquer, team kebiki with a white band. */
function katanaSamurai(c: Paper): void {
  const b = stand([0, 0], { hnN: [0.75, -8.4], elN: [-1.75, -8.55], hnF: [1.3, -7.95], elF: [2.4, -8.3] });
  man(c, b, SAMURAI, {
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4])),
    hipGear: () => swords(c, b),
    held: () => {
      katana(c, b.hnN, 135, 5.0);
      fist(c, b.hnN, SM.lacquer, 2);
    },
  });
}

/** 1: Yari Ashigaru: the nagae-yari upright in both hands; red-brown okegawa-dō with the clan mon, jingasa, sashimono. */
function yariAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnN: [-1.45, -8.3], elN: [-2.75, -8.6], hnF: [-1.45, -6.6], elF: [0.5, -7.6] });
  man(c, b, { ...ASHIGARU, moustache: true }, {
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4]), 9.0, 1.8, 4.0),
    held: () => {
      yari(c, b.hnN, 180, 8.0, 15.5);
      fist(c, b.hnN, SM.flesh, 2);
    },
  });
}

/** 2: Nage-yari Skirmishers: a javelin cocked overhead, the bundle on the back, a team happi. */
function skirmisher(c: Paper): void {
  const b = stand([0, 0], { hnN: [-2.3, -13.6], elN: [-3.4, -11.5], hnF: [2.9, -8.9], elF: [2.8, -9.8] });
  man(c, b, { head: 'hachimaki', body: 'happi', lac: REDBROWN_TEAM, sode: 'none', sleeve: SM.indigo, legs: SM.indigo, shin: 'kyahan' }, {
    back: () => {
      const base = addP(b.pel, [-1.2, -1.2]);
      for (const [dx, t] of [[-2.0, 1], [-1.2, 2], [-0.4, 2], [0.3, 1]] as [number, number][]) {
        const tip = addP(base, [dx, -7.6]);
        vol(c, base, tip, 0.26, 0.26, 0.22, SM.wood, t, { caps: [0, 0] });
        vol(c, tip, addP(tip, [dx * 0.08, -1.2]), 0.42, 0.3, 0.06, SM.steel, t + 1, { caps: [0, 0.2], rim: true });
      }
      vol(c, addP(base, [-0.3, 0.2]), addP(base, [-0.9, -3.4]), 1.35, 1.45, 1.25, SM.straw, 2, { detail: (un, v) => (frac(v * 4 + un * 0.3) < 0.12 ? code(SM.straw, 1) : -1) });
    },
    held: () => {
      javelin(c, b.hnN, 110);
      fist(c, b.hnN, SM.flesh, 2);
    },
  });
}

/** 3: Yumi Ashigaru at rest: the yumi braced upright, an arrow in hand, the ebira at the hip. */
function yumiAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnF: [2.55, -7.4], elF: [2.6, -9.0], hnN: [-1.6, -6.4], elN: [-2.6, -8.3] });
  man(c, b, { ...ASHIGARU, head: 'hachimaki', lac: { ...REDBROWN_TEAM, plate: SM.lacquer } }, {
    back: () => {
      vol(c, addP(b.pel, [-2.0, 1.6]), addP(b.pel, [-3.4, -2.6]), 1.3, 1.35, 1.2, SM.lacquer, 2, { rim: true, detail: (_un, v) => (Math.abs(v - 0.3) < 0.04 ? code(SM.gold, 2) : -1) });
      for (const dx of [-0.45, 0.0, 0.45]) vol(c, addP(b.pel, [-3.4 + dx, -2.5]), addP(b.pel, [-4.0 + dx * 1.7, -4.4]), 0.34, 0.36, 0.28, KM.silk, dx > 0 ? 2 : 3);
    },
    held: () => {
      yumi(c, b.hnF, 180, 0, null, false);
      vol(c, addP(b.hnN, [0.4, 1.0]), addP(b.hnN, [1.6, -4.2]), 0.18, 0.18, 0.16, SM.wood, 3, { caps: [0, 0] });
      vol(c, addP(b.hnN, [1.6, -4.2]), addP(b.hnN, [1.8, -5.0]), 0.3, 0.2, 0.05, SM.steel, 3, { caps: [0, 0.2] });
      vol(c, addP(b.hnN, [0.45, 0.7]), addP(b.hnN, [0.6, 0.0]), 0.36, 0.4, 0.3, KM.silk, 3);
      fist(c, b.hnF, SM.flesh, 1);
      fist(c, b.hnN, SM.flesh, 2);
    },
  });
}

/** 4: Teppō Ashigaru at port arms beside a planted tate; the dōran and the coiled match. */
function teppoAshigaru(c: Paper): void {
  const b = stand([0, 0], { hnN: [-1.35, -7.6], elN: [-2.7, -8.2], hnF: [0.95, -9.25], elF: [2.15, -8.0] });
  man(c, b, { ...ASHIGARU, lac: { ...REDBROWN_TEAM, plate: SM.lacquer } }, {
    hipGear: () => {
      slab(c, b.pel, [[-2.3, -0.5], [-0.9, -0.55], [-0.9, 0.9], [-2.3, 0.95]], (fx, fy) => (fy < -0.25 ? code(KM.redBrown, 3) : Math.hypot(fx + 1.6, fy - 0.25) < 0.22 ? code(SM.gold, 3) : code(KM.redBrown, lit(c, 2, fx * 0.6, 0.4, 0.4))));
      slab(c, addP(b.pel, [1.6, 0.6]), ell(0.75, 0.55, 0, 0, 14), (fx, fy) => (Math.hypot(fx, fy * 1.3) < 0.38 ? -1 : code(SM.straw, fx + fy < 0 ? 3 : 1)));
    },
    held: () => {
      teppo(c, b.hnN, 127.5, true);
      fist(c, b.hnN, SM.flesh, 2);
      fist(c, b.hnF, SM.flesh, 1);
    },
  });
  // The tate: planks with battens and the painted mon, a lit top edge, braced by a prop.
  vol(c, [5.2, -6.6], [7.0, 0.1], 0.3, 0.3, 0.28, SM.wood, 1);
  slab(c, [3.0, 0], [[0, -7.6], [2.6, -7.2], [2.75, 0.25], [0.05, 0.1]], (fx, fy) => {
    const plank = frac((fx + 3) / 0.85);
    const mon = Math.hypot(fx - 1.35, (fy + 4.6) * 0.95);
    if (mon < 0.8) return mon < 0.38 ? code(KM.redBrown, 2) : code(SM.gold, mon < 0.5 ? 3 : 2);
    if (fy < -7.3 + fx * 0.15) return code(SM.wood, 4);
    if (plank < 0.1) return code(SM.wood, 0);
    if (plank < 0.18 && fx < 1.0) return code(SM.wood, 4);
    if (Math.abs(fy + 6.4) < 0.25 || Math.abs(fy + 1.4) < 0.25) return code(SM.wood, Math.abs(fy + 6.4) < 0.1 || Math.abs(fy + 1.4) < 0.1 ? 3 : 1);
    return code(SM.wood, fx < 0.9 ? 3 : 2);
  });
}

/** A naginata held upright: a lacquered shaft, a gilt collar, a long broad curved blade. */
function bigNaginata(c: Paper, hand: P2, butt: number, fore: number): void {
  const a = addP(hand, [butt * 0.13, butt]);
  const top = addP(hand, [-fore * 0.13, -fore]);
  vol(c, a, top, 0.36, 0.36, 0.34, SM.wood, 2, { caps: [0.1, 0], detail: (un, v) => (v < 0.06 ? code(SM.iron, 2) : un < -0.4 && frac(v * 6) < 0.1 ? code(SM.wood, 4) : -1) });
  vol(c, addP(top, [0.06, 0.55]), addP(top, [-0.02, -0.15]), 0.5, 0.5, 0.5, SM.gold, 3, { caps: [0, 0], rim: true });
  const pts: P2[] = [[-0.25, 0], [0.32, 0], [0.62, -1.4], [0.75, -2.8], [0.45, -3.9], [-0.1, -4.6], [0.05, -3.4], [-0.15, -1.8]];
  slab(c, addP(top, [-0.05, -0.1]), pts, (fx, fy) => {
    const mid = -0.05 + Math.max(0, -fy - 1.5) * 0.12;
    if (fx < mid - 0.12) return code(SM.steel, 4);
    if (Math.abs(fx - mid) < 0.06 && fy > -3.2) return code(SM.steel, 1);
    if (fx > 0.45 - fy * 0.02) return code(SM.steel, 2);
    return code(SM.steel, 3);
  });
}

/** 8: Sōhei: the naginata upright, the katō, the black koromo and ochre kesa. */
function sohei(c: Paper): void {
  const b = stand([0, 0], { hnN: [-0.9, -8.6], elN: [-2.8, -8.7], hnF: [-0.85, -6.9], elF: [1.2, -7.5], anN: [-1.0, -0.45], anF: [1.15, -0.5], knN: [-1.1, -3.4], knF: [1.15, -3.4] });
  man(c, b, { head: 'kato', body: 'robe', lac: BLACK_GOLD, sode: 'none', sleeve: SM.black, legs: SM.black, shin: 'robe' }, {
    held: () => {
      bigNaginata(c, b.hnN, 5.2, 7.4);
      fist(c, b.hnN, SM.flesh, 2);
    },
  });
}

/** 10: Daimyō: deep red lacquer and gilt, team kebiki with a gold band, the crescent, the horo, the war fan. */
function daimyo(c: Paper): void {
  const b = stand([0, 0], { hnN: [2.4, -10.9], elN: [-0.4, -10.3], hnF: [2.2, -6.9], elF: [2.55, -8.5] });
  man(c, b, { ...SAMURAI, crest: 'crescent', lac: BLACK_GOLD, sleeve: SM.black, legs: SM.black, jinbaori: true }, {
    back: () => horo(c, addP(b.pel, [-1.2, -3.6]), 1.05),
    hipGear: () => swords(c, b),
    held: () => {
      gunbai(c, b.hnN, 112.5);
      fist(c, b.hnN, KM.deepRed, 2);
    },
  });
}

// ------------------------------------------------------------------ the horse

interface Horse {
  hide: Mat;
  mane: Mat;
  socks?: boolean;
  tassels?: boolean;
  cloth?: Mat;
}

/**
 * A heavy Sengoku warhorse at rest, built from curves: a round barrel and croup, an arched neck,
 * shoulder and haunch muscle planes lit from the top-left, tapered legs with knees, hocks,
 * fetlocks and hooves, mane and tail in strands, and the tack.
 */
function horse(c: Paper, hz: Horse, layer: 'far' | 'body'): void {
  const L = c.L;
  const H = hz.hide;
  const fore = (top: P2, knee: P2, fet: P2, hoof: P2, t: number) => {
    vol(c, top, knee, 1.75, 1.45, 1.0, H, t, { caps: [0.1, 0.25] }); // forearm tapering to the knee
    slab(c, knee, ell(0.58, 0.5, 0, 0, 12), (fx, fy) => code(H, lit(c, t, fx + fy, 0.3, 0.4))); // the knee
    vol(c, knee, fet, 0.82, 0.7, 0.72, hz.socks ? SM.cotton : H, t, { caps: [0.1, 0.1] }); // cannon
    slab(c, fet, ell(0.55, 0.45, 0.05, 0, 12), (fx, fy) => code(hz.socks ? SM.cotton : H, lit(c, t, fx + fy, 0.3, 0.4))); // fetlock
    vol(c, fet, addP(hoof, [-0.2, -0.45]), 0.6, 0.55, 0.6, hz.socks ? SM.cotton : H, t, { caps: [0, 0] }); // pastern
    slab(c, hoof, [[-0.75, -0.6], [0.15, -0.65], [0.65, 0.05], [-0.85, 0.05]], (fx) => code(SM.black, fx < -0.2 ? t + 1 : t)); // hoof
  };
  const hind = (top: P2, hock: P2, fet: P2, hoof: P2, t: number) => {
    vol(c, top, hock, 2.3, 1.7, 0.95, H, t, { caps: [0.1, 0.2] }); // gaskin
    slab(c, hock, [[-0.65, -0.4], [0.4, -0.45], [0.35, 0.4], [-0.5, 0.45], [-0.85, 0.0]], (fx, fy) => code(H, lit(c, t, fx + fy, 0.3, 0.4))); // the hock and its point
    vol(c, hock, fet, 0.8, 0.7, 0.72, H, t, { caps: [0.1, 0.1] });
    slab(c, fet, ell(0.55, 0.45, 0.05, 0, 12), (fx, fy) => code(H, lit(c, t, fx + fy, 0.3, 0.4)));
    vol(c, fet, addP(hoof, [-0.2, -0.45]), 0.6, 0.55, 0.6, H, t, { caps: [0, 0] });
    slab(c, hoof, [[-0.75, -0.6], [0.15, -0.65], [0.65, 0.05], [-0.85, 0.05]], (fx) => code(SM.black, fx < -0.2 ? t + 1 : t));
  };
  if (layer === 'far') {
    fore([4.4, -6.6], [4.9, -3.6], [4.95, -1.25], [5.3, 0.0], 1);
    hind([-3.4, -7.2], [-4.0, -3.9], [-3.75, -1.25], [-3.4, 0.0], 1);
    return;
  }
  // Tail: strands falling from the dock, lit on the top-left strands.
  for (const [dx, dy, t] of [[-0.2, 0, 1], [0.2, 0.1, 2], [-0.5, 0.2, 1], [0.0, 0.25, 2]] as [number, number, number][]) {
    const root: P2 = [-5.6 + dx * 0.4, -10.0];
    const mid: P2 = [-6.5 + dx, -7.6 + dy];
    vol(c, root, mid, 0.55, 0.6, 0.55, hz.mane, t, { caps: [0.1, 0] });
    vol(c, mid, [-6.1 + dx * 1.4, -4.4 + dy], 0.55, 0.45, 0.12, hz.mane, t, { caps: [0, 0.3] });
  }
  // Barrel, chest and croup as one round mass.
  const body = curve([[5.7, -8.2], [5.1, -10.0], [3.0, -11.0], [0.6, -10.4], [-1.8, -10.6], [-4.0, -11.2], [-5.7, -10.2], [-6.1, -8.2], [-5.3, -6.3], [-3.6, -5.8], [-1.0, -5.2], [1.8, -5.3], [3.9, -5.9], [5.3, -6.8]], 4);
  slab(c, [0, 0], body, (fx, fy) => {
    // Muscle planes: the shoulder and the haunch catch the light on their upper-left; the barrel
    // turns under into shadow; a rim of light along the back.
    const sh = Math.hypot((fx - 3.4) / 1.8, (fy + 8.6) / 2.1);
    const hq = Math.hypot((fx + 3.7) / 2.2, (fy + 8.7) / 2.2);
    const belly = fy > -6.3 + Math.abs(fx) * 0.07;
    if (fy < -10.3 + Math.abs(fx + 0.8) * 0.06 && fx > -5.2 && fx < 3.4) return code(H, 4); // back rim
    if (belly) return code(H, 1);
    if (hq < 1 && (fx + 3.7) * 0.7 + (fy + 8.7) * 0.7 < -0.4) return code(H, 3);
    if (sh < 1 && (fx - 3.4) * 0.7 + (fy + 8.6) * 0.7 < -0.3) return code(H, 3);
    if (Math.abs(hq - 1) < 0.05 && fy > -9.0) return code(H, 1); // the stifle line
    if (Math.abs(sh - 1) < 0.05 && fx < 4.4) return code(H, 1); // the shoulder's back edge
    const s = (fy + 8) * 0.35 + fx * 0.05;
    return code(H, s < -0.55 ? 3 : s > 0.45 ? 1 : 2);
  });
  // Saddle-cloth, saddle, the stirrup leather.
  if (hz.cloth !== undefined) slab(c, [0, 0], curve([[-2.0, -10.4], [1.8, -10.7], [1.7, -6.9], [-2.1, -6.8]], 3), (fx, fy) => (fy > -7.35 ? code(SM.gold, fx < 0 ? 3 : 2) : code(hz.cloth!, lit(c, 2, fx * 0.4 + (fy + 8.7) * 0.4, 0.5, 0.45))));
  slab(c, [0, 0], [[-1.9, -10.9], [1.4, -11.0], [1.55, -10.2], [-2.0, -10.1]], (fx) => code(SM.lacquer, fx < -0.5 ? 3 : 2));
  vol(c, [1.2, -10.4], [1.6, -11.8], 0.65, 0.6, 0.5, SM.lacquer, 3, { rim: true });
  vol(c, [-1.8, -10.3], [-2.3, -11.6], 0.65, 0.6, 0.5, SM.lacquer, 2, { rim: true });
  vol(c, [0.2, -10.2], [0.5, -6.4], 0.22, 0.22, 0.22, SM.lacquer, 1);
  if (hz.tassels) {
    vol(c, [-2.0, -10.2], [-5.4, -8.8], 0.3, 0.3, 0.3, SM.team, 2);
    vol(c, [-2.2, -9.6], [-5.0, -6.8], 0.3, 0.3, 0.3, SM.team, 1);
    for (const [x, y] of [[-4.4, -8.2], [5.1, -8.8]] as P2[]) {
      agemaki(c, [x, y], SM.team, 0.8);
      vol(c, [x, y + 0.6], [x + 0.1, y + 2.6], 0.6, 0.9, 1.15, SM.team, 3, { detail: (un, v) => (v > 0.45 && frac(un * 2.5) < 0.22 ? code(SM.team, 1) : -1) });
    }
  }
  // Near legs.
  fore([3.9, -6.9], [4.3, -3.6], [4.35, -1.25], [4.7, 0.0], 2);
  hind([-3.9, -7.5], [-4.6, -3.9], [-4.3, -1.25], [-4.0, 0.0], 2);
  // The arched neck: a curved crest from the withers to the poll, the jugular groove, the throat.
  const neck = curve([[2.6, -10.9], [4.0, -12.8], [5.9, -14.3], [7.3, -14.4], [7.9, -13.2], [7.0, -11.5], [6.1, -9.2], [5.2, -7.9], [3.6, -8.2]], 4);
  slab(c, [0, 0], neck, (fx, fy) => {
    const crest = fy + 14.6 - (fx - 2.6) * 0.0;
    void crest;
    const s = (fx - 5) * 0.25 + (fy + 11) * 0.3;
    if (Math.abs((fy + 9.0) + (fx - 6.0) * 1.15) < 0.1 && fx > 5.6 && fx < 7.0) return code(H, 1); // jugular groove
    if (s < -0.55) return code(H, 3);
    if (s > 0.5) return code(H, 1);
    return code(H, 2);
  });
  // Mane: strands falling from the crest onto the near side, lit and dark alternating.
  for (let i = 0; i < 8; i++) {
    const k = i / 7;
    const root: P2 = [2.9 + k * 4.0, -11.2 - k * 3.0 + k * k * 0.0];
    const tip: P2 = addP(root, [-0.55 + k * 0.1, 1.5 - k * 0.25]);
    vol(c, root, tip, 0.5, 0.45, 0.12, hz.mane, i % 2 ? 1 : 2, { caps: [0.2, 0.2] });
  }
  // Head: forehead, the long face, the muzzle, the round cheek, an eye, the ears and the forelock.
  const headPts = curve([[7.0, -14.6], [8.2, -13.6], [9.2, -12.0], [10.0, -10.6], [9.8, -9.8], [9.0, -9.8], [8.2, -10.6], [7.2, -11.6], [6.6, -12.8]], 4);
  slab(c, [0, 0], headPts, (fx, fy) => {
    const cheek = Math.hypot((fx - 7.4) / 0.9, (fy + 12.0) / 0.8);
    if (Math.hypot(fx - 7.85, fy + 13.15) < 0.17) return code(SM.ink, 0); // eye
    if (Math.hypot(fx - 7.75, fy + 13.25) < 0.24 && fy < -13.2) return code(H, 4); // its lit lid
    if (Math.hypot(fx - 9.45, fy + 10.3) < 0.14) return code(SM.ink, 1); // nostril
    if (cheek < 1 && (fx - 7.4) + (fy + 12) < -0.2) return code(H, 3);
    if (Math.abs(cheek - 1) < 0.08 && fy > -12.2) return code(H, 1);
    const s = (fx - 8) * 0.3 + (fy + 12) * 0.3;
    return code(H, s < -0.5 ? 3 : s > 0.45 ? 1 : 2);
  });
  vol(c, [7.0, -14.3], [6.7, -15.6], 0.55, 0.48, 0.12, H, 2, { caps: [0, 0.3] }); // near ear
  vol(c, [7.4, -14.2], [7.3, -15.3], 0.45, 0.4, 0.1, H, 1, { caps: [0, 0.3] }); // far ear
  vol(c, [7.1, -14.3], [7.9, -13.2], 0.8, 0.7, 0.3, hz.mane, 2, { caps: [0.1, 0.3] }); // forelock
  // Bridle: headstall, noseband, the bit ring, reins back to the rider.
  if (L >= 2) {
    vol(c, [7.3, -14.2], [8.4, -10.6], 0.2, 0.2, 0.2, SM.lacquer, 1);
    vol(c, [8.6, -11.2], [9.9, -10.9], 0.2, 0.2, 0.2, SM.lacquer, 1);
    slab(c, [9.0, -10.2], ell(0.24, 0.24, 0, 0, 10), (fx, fy) => (Math.hypot(fx, fy) < 0.12 ? -1 : code(SM.gold, 3)));
    vol(c, [8.9, -10.3], [2.6, -9.0], 0.16, 0.16, 0.16, SM.lacquer, 1);
  }
}

/** A rider's body on a horse: hips at the seat, thighs over the barrel, shins to the stirrups. */
function riderBody(seat: P2, over: Partial<Body>): Body {
  const b = stand(sub(seat, [0, -6.6]), over);
  b.hipN = addP(seat, [-0.6, 0.1]);
  b.hipF = addP(seat, [0.6, 0.0]);
  b.knN = addP(seat, [1.5, 2.2]);
  b.knF = addP(seat, [1.9, 1.9]);
  b.anN = addP(seat, [0.8, 4.5]);
  b.anF = addP(seat, [1.3, 4.2]);
  return b;
}

const SEAT: P2 = [-0.2, -10.85];

function mounted(c: Paper, hz: Horse, d: Dress, over: Partial<Body>, layers: (b: Body) => Layers): void {
  horse(c, hz, 'far');
  const b = riderBody(SEAT, over);
  leg(c, b.hipF, b.knF, b.anF, d, true);
  horse(c, hz, 'body');
  man(c, b, { ...d, legsOn: false }, layers(b));
  leg(c, b.hipN, b.knN, b.anN, d, false);
  slab(c, b.anN, [[-0.4, 0.05], [1.5, 0.15], [1.4, 0.75], [-0.5, 0.65]], (fx) => code(SM.lacquer, fx < 0.4 ? 3 : 2)); // abumi
}

/** 5: Yari Cavalry: a bay; red-brown okegawa-dō, a plain kabuto, the yari upright. */
function yariCavalry(c: Paper): void {
  mounted(c, { hide: SM.bay, mane: SM.black }, { ...SAMURAI, crest: 'none', menpo: false, body: 'okegawa', lac: REDBROWN_TEAM, moustache: true }, { hnN: [-1.4, -8.6], elN: [-2.6, -8.6], hnF: [2.6, -7.0], elF: [2.4, -8.4] }, (b) => ({
    back: () => sashimono(c, addP(b.pel, [-1.6, -3.4]), 8.4, 1.8, 3.8),
    held: () => {
      yari(c, b.hnN, 180, 6.0, 13.0);
      fist(c, b.hnN, SM.flesh, 2);
    },
  }));
}

/** 6: Yabusame Archers: a chestnut with socks; the ayaigasa, the yumi braced, the yebira and mukabaki. */
function yabusame(c: Paper): void {
  mounted(c, { hide: SM.chestnut, mane: SM.straw, socks: true }, { ...ASHIGARU, head: 'kasa', lac: { plate: SM.lacquer, lace: SM.team, band: KM.silk }, sode: 'none', shin: 'suneate', moustache: true }, { hnF: [2.7, -7.6], elF: [2.7, -9.1], hnN: [-0.4, -8.0], elN: [-2.4, -8.5] }, (b) => ({
    back: () => {
      vol(c, addP(b.pel, [-2.1, -1.0]), addP(b.pel, [-2.4, -4.4]), 1.1, 1.15, 1.0, SM.lacquer, 2, { rim: true });
      for (const dx of [-0.5, -0.1, 0.3]) vol(c, addP(b.pel, [-2.4 + dx, -4.3]), addP(b.pel, [-2.9 + dx * 1.6, -5.9]), 0.3, 0.32, 0.25, KM.silk, dx > 0 ? 2 : 3);
      slab(c, b.pel, [[-1.3, 0.2], [1.4, 0.2], [2.4, 3.6], [-0.4, 3.9]], (fx, fy) => code(SM.straw, frac(fx * 0.9 + fy * 0.4) < 0.1 ? 1 : lit(c, 2, fx * 0.4 + fy * 0.15, 0.4, 0.5)));
    },
    held: () => {
      yumi(c, b.hnF, 176, 0.05, b.hnN, true);
      fist(c, b.hnF, SM.flesh, 1);
      fist(c, b.hnN, SM.flesh, 2);
    },
  }));
}

/** 7: Hatamoto Horse: a black horse with team tassels; deep red armour, kuwagata, the horo, katana raised. */
function hatamoto(c: Paper): void {
  mounted(c, { hide: SM.black, mane: SM.hair, tassels: true, cloth: SM.teamDk }, { ...SAMURAI, lac: DEEPRED_TEAM, sleeve: SM.black, legs: SM.black }, { hnN: [-1.3, -15.0], elN: [-3.2, -13.4], hnF: [2.6, -7.2], elF: [2.4, -8.6] }, (b) => ({
    back: () => horo(c, addP(b.pel, [-1.2, -3.6]), 1.1),
    held: () => {
      katana(c, b.hnN, 150, 4.3);
      fist(c, b.hnN, KM.deepRed, 2);
    },
  }));
}

// ------------------------------------------------------------------ 9: the ōzutsu

function ozutsuScene(c: Paper): void {
  const crew: Dress = { ...ASHIGARU };
  const g = stand([-4.6, -1.7], { hnN: [-1.0, -8.6], elN: [-2.6, -8.4], hnF: [2.4, -7.4], elF: [2.4, -8.8] });
  man(c, g, crew, {
    held: () => {
      vol(c, addP(g.hnN, [0.6, 2.2]), addP(g.hnN, [-0.9, -3.2]), 0.3, 0.3, 0.26, SM.wood, 2);
      slab(c, addP(g.hnN, [-0.95, -3.35]), ell(0.3, 0.3, 0, 0, 10), () => code(SM.fire, 3));
      fist(c, g.hnN, SM.flesh, 2);
    },
  });
  const l = stand([4.2, -1.9], { hnN: [-1.5, -8.3], elN: [-2.7, -8.6], hnF: [-1.5, -6.7], elF: [0.6, -7.6] });
  man(c, l, { ...crew, moustache: true }, {
    held: () => {
      vol(c, addP(l.hnN, [0, 2.6]), addP(l.hnN, [0, -4.2]), 0.3, 0.3, 0.3, SM.wood, 2);
      slab(c, addP(l.hnN, [0, -4.5]), ell(0.5, 0.42, 0, 0, 12), (fx, fy) => code(KM.silk, lit(c, 2, fx + fy, 0.3, 0.4)));
      fist(c, l.hnN, SM.flesh, 2);
    },
  });
  for (const x of [-3.0, 2.6]) slab(c, [x, 0], [[-0.8, -1.2], [0.8, -1.2], [0.85, 0.15], [-0.85, 0.15]], (fx, fy) => code(SM.wood, fy < -1.0 ? 4 : fx < -0.3 ? 2 : 1));
  slab(c, [0, 0], [[-4.6, -2.9], [4.4, -2.9], [4.6, -1.0], [-4.7, -1.0]], (fx, fy) => {
    if (fy < -2.7) return code(SM.wood, 4);
    if (frac((fx + 6) / 1.7 + fy * 0.1) < 0.05) return code(SM.wood, 0);
    return code(SM.wood, fy > -1.4 ? 1 : 2);
  });
  slab(c, [0, 0], [[-3.4, -3.1], [1.0, -3.6], [1.0, -2.8], [-3.4, -2.8]], (fx) => code(SM.wood, fx < -1 ? 3 : 2));
  const br: P2 = [-3.4, -4.3], mz: P2 = [5.2, -5.6];
  vol(c, br, mz, 2.7, 2.4, 2.15, SM.bronze, 2, {
    shine: true,
    rim: true,
    caps: [0.45, 0.1],
    detail: (un, v) => {
      if ([0.18, 0.42, 0.7].some((k) => Math.abs(v - k) < 0.03)) return code(SM.bronze, un < -0.3 ? 4 : 1);
      if ([0.3, 0.56].some((k) => Math.abs(v - k) < 0.035)) return code(SM.straw, un < 0 ? 3 : 1);
      if (Math.abs(v - 0.82) < 0.06 && Math.abs(un + 0.1) < 0.25) return code(SM.gold, 3); // a cast mon near the muzzle
      return -1;
    },
  });
  slab(c, mz, ell(1.0, 1.35, 0.05, 0, 16), (fx, fy) => (Math.hypot((fx - 0.25) / 0.55, fy / 0.8) < 1 ? code(SM.ink, 0) : code(SM.bronze, lit(c, 2, fx * 0.5 + fy * 0.6, 0.35, 0.45))));
  slab(c, br, ell(1.15, 1.25, 0, 0, 16), (fx, fy) => code(SM.bronze, Math.hypot(fx + 0.3, fy + 0.3) < 0.35 ? 4 : lit(c, 1, fx * 0.6 + fy * 0.6, 0.4, 0.4)));
  slab(c, [-6.3, 0], [[-0.9, -2.2], [0.9, -2.2], [1.0, 0.1], [-1.0, 0.1]], (fx, fy) => (Math.abs(fy + 1.6) < 0.15 || Math.abs(fy + 0.4) < 0.15 ? code(SM.iron, 2) : code(SM.wood, fx < -0.2 ? 3 : 2)));
  for (const [x, y] of [[6.5, -0.4], [7.3, -0.4], [6.9, -1.05]] as P2[]) slab(c, [x, y], ell(0.42, 0.4, 0, 0, 12), (fx, fy) => code(SM.iron, fx + fy < -0.3 ? 3 : 1));
}

// ------------------------------------------------------------------ entry point

const FIGURES: Record<number, (c: Paper) => void> = {
  0: katanaSamurai,
  1: yariAshigaru,
  2: skirmisher,
  3: yumiAshigaru,
  4: teppoAshigaru,
  5: yariCavalry,
  6: yabusame,
  7: hatamoto,
  8: sohei,
  9: ozutsuScene,
  10: daimyo,
};

export interface StaticFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  ax: number;
  ay: number;
}

/**
 * Paints one kind's key art (idle, SE) at a level in an army hue, with its own colour budget for the
 * level: contact lines, cluster merge, palette and coloured outline as in the live painter.
 */
export function paintSamuraiStatic(kind: number, level: number, hue: number, c: Paper = new Paper()): StaticFrame {
  c.begin(level, { w: 64, h: 64, footY: 0.86 });
  FIGURES[kind]?.(c);
  c.contact();
  c.clusters(level >= 8 ? 4 : 3);
  const fp = figurePalette(hue, level, c.codes());
  const out = c.colours(fp);
  return { width: c.CW, height: c.CH, pixels: new Uint8ClampedArray(out.buffer), ax: c.FX, ay: c.FY };
}

export const SAMURAI_STATIC_KINDS = Object.keys(FIGURES).map(Number);
