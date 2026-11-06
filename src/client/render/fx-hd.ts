// The HD effects sheet: the battle's missiles, puffs of dust and smoke, blood splatter, stuck
// arrows, craters, hoofprints, stakes and the mangonel's stone, painted natively at a detail
// level L (one map pixel = L texels), the way the paper-doll painter paints the soldiers. Nothing
// here is an upscale: each texel is decided from the shape's geometry at that level, so a level-8
// arrow has a forged head, a grained shaft and two feather vanes, where the classic sheet has six
// pixels. Light comes from the upper left, as on the figures.
//
// See docs/art-references/battlefield-hd.md for the references these follow.

import { U } from '../../game/units.ts';
import { HORSE_COATS, HORSE_FRAMES, horseDead, horseRun, type HorseImg } from './horse-fx.ts';

/** A sprite on an HD sheet, in texels; (ax, ay) is the texel that lands on the map point. */
export interface HdRegion {
  u: number;
  v: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface HdSheet {
  /** Texels per map pixel. */
  L: number;
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  /** Regions by id (see `fxId`). */
  regions: HdRegion[];
}

export type MissileLook = 'arrow' | 'bolt' | 'jav';
/** Angles per missile look (in flight). */
export const ANGLES = 32;
/** Sizes of the puffs (map px) and the variants of each. */
export const PUFF_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14] as const;
export const PUFF_VARIANTS = 3;
export const SPLATS = 6;
export const HOOVES = 4;
/** Angles of a missile standing in a man or his shield (its tip's screen direction). */
export const PIN_ANGLES = 8;

/** Every sprite name, in a fixed order, so the scene can address regions by number. */
const NAMES: string[] = [];
const ID = new Map<string, number>();
const name = (n: string) => {
  ID.set(n, NAMES.length);
  NAMES.push(n);
};
for (const look of ['arrow', 'bolt', 'jav']) for (let a = 0; a < ANGLES; a++) name(`${look}${a}`);
for (const look of ['arrow', 'bolt', 'jav']) for (let k = 0; k < 3; k++) name(`stuck_${look}${k}`);
for (const d of PUFF_SIZES) for (let v = 0; v < PUFF_VARIANTS; v++) name(`puff${d}_${v}`);
for (let k = 0; k < SPLATS; k++) name(`splat${k}`);
for (let k = 0; k < 2; k++) name(`crater${k}`);
for (let k = 0; k < HOOVES; k++) name(`hoof${k}`);
for (let k = 0; k < 2; k++) name(`stake${k}`);
name('stone');
name('dot');
for (const look of ['arrow', 'bolt', 'jav']) for (let a = 0; a < PIN_ANGLES; a++) name(`pin_${look}${a}`);
// A riderless horse: id horse_run0_0_0 + (coat * 2 + left) * HORSE_FRAMES + frame; down: horse_dead0_0 + coat * 2 + left.
for (let c = 0; c < HORSE_COATS; c++) for (let l = 0; l < 2; l++) for (let f = 0; f < HORSE_FRAMES; f++) name(`horse_run${c}_${l}_${f}`);
for (let c = 0; c < HORSE_COATS; c++) for (let l = 0; l < 2; l++) name(`horse_dead${c}_${l}`);

/** The id of a sprite name on every HD sheet. */
export function fxId(n: string): number {
  const id = ID.get(n);
  if (id === undefined) throw new Error(`fx-hd: no ${n}`);
  return id;
}

/** The look of a missile by its shooter's class. */
export const lookOf = (cls: number, splash: number): MissileLook | 'stone' =>
  splash > 0 ? 'stone' : cls === U.Crossbowmen ? 'bolt' : cls === U.Skirmishers ? 'jav' : 'arrow';

// ---------------------------------------------------------------------------- pixels

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

/** '#rrggbb' as a little-endian RGBA word. */
/** A hashed lattice value in 0..1. */
function hash2(x: number, y: number, k: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise over cells of `cell` texels: dither that comes in clusters, not a checker. */
function clump(x: number, y: number, cell: number, k: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const a = hash2(ix, iy, k);
  const b = hash2(ix + 1, iy, k);
  const c = hash2(ix, iy + 1, k);
  const d = hash2(ix + 1, iy + 1, k);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function rgba(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
}

class Img {
  readonly px: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(Math.max(1, w * h));
  }
  set(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x]!;
  }
  /** A one-texel rim of `c` around everything painted (4-neighbours). */
  outline(c: number): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
      }
    for (const i of add) this.px[i] = c;
  }
}

function rngOf(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Screen light from the upper left.
const LX = -0.62;
const LY = -0.78;

// ---------------------------------------------------------------------------- missiles

const C = {
  iron: rgba('#2b2a2c'),
  ironLit: rgba('#8c8a86'),
  ironDark: rgba('#161518'),
  wood: rgba('#7a5a36'),
  woodLit: rgba('#a8824e'),
  woodDark: rgba('#4c3420'),
  feather: rgba('#e9e1cc'),
  featherShade: rgba('#b4aa92'),
  featherBarb: rgba('#8e846e'),
  featherCock: rgba('#9c3a2a'),
  vane: rgba('#8a6a44'),
  vaneShade: rgba('#5c4430'),
  wrap: rgba('#3a2a1c'),
  out: rgba('#1a120c'),
};

interface ShaftSpec {
  /** Map px: whole length, head length and half-width, fletching length and half-width. */
  len: number;
  head: number;
  headW: number;
  fl: number;
  flW: number;
}
const SPEC: Record<MissileLook, ShaftSpec> = {
  arrow: { len: 6.5, head: 1.0, headW: 0.36, fl: 1.7, flW: 0.42 },
  bolt: { len: 4.6, head: 0.9, headW: 0.34, fl: 1.1, flW: 0.34 },
  jav: { len: 8.5, head: 1.5, headW: 0.3, fl: 0, flW: 0 },
};

/**
 * Paints a missile into `img`: tip at texel point (px, py), pointing along (dx, dy) (unit), from
 * its tail `from` map px behind the tip to `to` map px behind it (a stuck arrow shows only the
 * part above the ground). The head is painted when `to` is 0.
 */
function paintMissile(img: Img, px: number, py: number, dx: number, dy: number, look: MissileLook, L: number, from: number, to = 0, vane = 1): void {
  const s = { ...SPEC[look], flW: SPEC[look].flW * vane };
  // Perpendicular, and which side of the shaft faces the light.
  const nx = -dy;
  const ny = dx;
  const litSide = nx * LX + ny * LY >= 0 ? 1 : -1;
  const shaftHalf = Math.max(0.5, 0.11 * L);
  const pad = Math.ceil((Math.max(s.flW, s.headW) + 0.6) * L);
  const x0 = Math.floor(Math.min(px, px - dx * from * L) - pad);
  const x1 = Math.ceil(Math.max(px, px - dx * from * L) + pad);
  const y0 = Math.floor(Math.min(py, py - dy * from * L) - pad);
  const y1 = Math.ceil(Math.max(py, py - dy * from * L) + pad);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const rx = x + 0.5 - px;
      const ry = y + 0.5 - py;
      // Distance behind the tip (map px) and to the side (texels).
      const back = -(rx * dx + ry * dy) / L;
      const side = rx * nx + ry * ny;
      const sm = side / L;
      if (back < to - 0.5 / L || back > from + 0.5 / L) continue;
      // Lit and shaded sides only where the shaft is two texels or more across: on a one-texel
      // line they would alternate along it as single-texel noise.
      const wide = shaftHalf >= 0.8;
      const lit = wide && side * litSide > 0.25;
      const shade = wide && side * litSide < -0.25;
      let col = 0;
      // Head: a leaf of iron (a bodkin for bolts), its lit edge catching the light.
      if (to === 0 && back < s.head) {
        const hw = look === 'bolt' ? Math.min(s.headW, (back / s.head) * s.headW * 2.2) : (back / s.head) * s.headW;
        if (Math.abs(sm) <= Math.max(hw, 0.5 / L)) col = lit ? C.ironLit : shade ? C.ironDark : C.iron;
        // The socket where the head meets the shaft.
        if (!col && back > s.head * 0.85 && Math.abs(side) <= shaftHalf + 0.6) col = C.ironDark;
      }
      if (!col && back >= s.head * (to === 0 ? 0.9 : 0) && Math.abs(side) <= shaftHalf) {
        col = lit ? C.woodLit : shade ? C.woodDark : C.wood;
        // Javelin: a leather grip binding at the balance point.
        if (look === 'jav' && Math.abs(back - s.len * 0.55) < 0.5 && Math.floor(back * L) % 2 === 0) col = C.wrap;
      }
      // Fletching: two vanes, swept back, cut square at the nock.
      if (s.fl > 0 && back > s.len - s.fl - 0.1) {
        const f = (back - (s.len - s.fl)) / s.fl; // 0 at the front of the vanes, 1 at the nock
        // A straight raked leading edge, full height behind, cut square at the nock.
        const prof = Math.min(1, f * 1.7);
        if (Math.abs(sm) <= s.flW * prof && Math.abs(side) > shaftHalf * 0.6 && f < 0.97) {
          if (look === 'arrow') {
            const far = side * litSide < 0;
            col = far ? C.featherShade : C.feather;
            // Barbs: a darker line every other texel run on the shaded vane (level 4 up).
            if (L >= 4 && far && Math.floor(back * L * 0.5) % 2 === 0) col = C.featherBarb;
            // A dyed band across the feathers (the fletcher's mark).
            if (L >= 2 && f > 0.5 && f < 0.5 + Math.max(0.16, 1.2 / (s.fl * L))) col = C.featherCock;
          } else col = side * litSide < 0 ? C.vaneShade : C.vane;
        }
        // The nock: a pale notch at the very end.
        if (s.fl > 0 && L >= 4 && back > s.len - 0.5 / L && Math.abs(side) <= shaftHalf) col = C.feather;
      }
      if (col) img.set(x, y, col);
    }
}

function missile(look: MissileLook, a: number, L: number): [Img, number, number] {
  const s = SPEC[look];
  const S = Math.ceil((s.len + 2) * L) + 2;
  const img = new Img(S, S);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const c = S / 2;
  paintMissile(img, c + dx * s.len * L * 0.5, c + dy * s.len * L * 0.5, dx, dy, look, L, s.len);
  if (L >= 2) img.outline(C.out);
  return [img, Math.floor(c), Math.floor(c)];
}

/** A spent missile standing in the ground, leaning, with a crumb of thrown dirt at its foot. */
function stuck(look: MissileLook, k: number, L: number): [Img, number, number] {
  const s = SPEC[look];
  const vis = look === 'jav' ? 5.2 : s.len * 0.6;
  const lean = (k - 1) * 0.45 + (look === 'jav' ? 0.25 : 0);
  // Into the ground: down and a little forward.
  const ln = Math.hypot(lean, 1);
  const dx = -lean / ln;
  const dy = 1 / ln;
  const w = Math.ceil((Math.abs(lean) * vis + 2.5) * L) + 4;
  const h = Math.ceil((vis + 1.2) * L) + 4;
  const img = new Img(w * 2, h);
  const gx = w;
  const gy = h - Math.ceil(0.6 * L) - 2;
  // The visible part runs from the ground (the shaft continues below) back to the nock; the
  // fletching is drawn as on a missile whose tip is buried `s.len - vis` map px deep.
  const buried = s.len - vis;
  // Seen from the side, the vanes are a narrow feather either side of the shaft.
  paintMissile(img, gx + dx * buried * L, gy + dy * buried * L, dx, dy, look, L, s.len, buried, 0.7);
  if (L >= 4) img.outline(C.out);
  // A crumb of thrown dirt at the foot, over the outline, lit on its upper left.
  const dirt = rgba('#4a3b2a');
  const dirtLit = rgba('#7a664a');
  const r = 0.28 * L;
  if (L >= 2)
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
      for (let x = -Math.ceil(r * 2); x <= Math.ceil(r * 2); x++) {
        const q = (x / (r * 2)) ** 2 + (y / r) ** 2;
        if (q > 1 || y < -r * 0.3) continue;
        img.set(gx + x, gy + y, y <= 0 && x < 0 ? dirtLit : dirt);
      }
  return [img, gx, gy];
}

/**
 * A missile standing in a man or his shield: the shaft and fletching out of him, its tip `a` of
 * PIN_ANGLES round (screen), the anchor where it went in. No dirt, and less of it shows than of
 * one in the ground (ref Bayeux: a short shaft and pale feathers jutting from the shield face).
 */
function pin(look: MissileLook, a: number, L: number): [Img, number, number] {
  const s = SPEC[look];
  const vis = look === 'jav' ? 5 : look === 'bolt' ? 3.4 : 5;
  const buried = s.len - vis;
  const ang = (a / PIN_ANGLES) * Math.PI * 2;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const R = Math.ceil((vis + 1.4) * L) + 2;
  const img = new Img(R * 2 + 1, R * 2 + 1);
  paintMissile(img, R + 0.5 + dx * buried * L, R + 0.5 + dy * buried * L, dx, dy, look, L, s.len, buried, 1);
  if (L >= 4) img.outline(C.out);
  return [img, R, R];
}

// ---------------------------------------------------------------------------- puffs

const PUFF_TONES = [rgba('#ffffff'), rgba('#e4e2de'), rgba('#c2bfb8'), rgba('#9c9890')];

/**
 * A billow of dust or smoke `d` map px across: a few overlapping round lumps, each shaded as a
 * ball lit from the upper left, with ordered-dither seams between the tones and a dithered,
 * broken rim (it thins into the air rather than ending in a hard line). White, tinted at draw time.
 */
function puff(d: number, variant: number, L: number): [Img, number, number] {
  const S = Math.max(1, Math.round(d * L));
  const img = new Img(S, S);
  const r = S / 2;
  if (S <= 3) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r + 0.6) img.set(x, y, y < r ? PUFF_TONES[0]! : PUFF_TONES[1]!);
    return [img, Math.floor(r), Math.floor(r)];
  }
  const rnd = rngOf(d * 977 + variant * 131 + 7);
  const blobs: [number, number, number][] = [[r, r * 1.05, r * 0.62]];
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const dist = r * (0.25 + rnd() * 0.3);
    blobs.push([r + Math.cos(a) * dist, r + Math.sin(a) * dist * 0.85, r * (0.3 + rnd() * 0.22)]);
  }
  // Broken rim: the ordered dither only where the lump is thin; finer dither at the larger levels.
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let f = -1;
      let nx = 0;
      let ny = 0;
      let nz = 1;
      for (const [bx, by, br] of blobs) {
        const ux = (x + 0.5 - bx) / br;
        const uy = (y + 0.5 - by) / br;
        const q = 1 - ux * ux - uy * uy;
        if (q > f) {
          f = q;
          nx = ux;
          ny = uy;
          nz = Math.sqrt(Math.max(0, q));
        }
      }
      // Small puffs keep the ordered dither (a texel is all there is); bigger ones break up in
      // clusters of a few texels, ragged like the references' smoke, not a screen door.
      const bd = S < 12 ? bayer(x, y) : clump(x, y, Math.max(1.5, L * 0.35), variant + d * 7) * 0.8 + hash2(x, y, d) * 0.2;
      if (f + (bd - 0.5) * 0.55 <= 0) continue;
      const light = nx * LX + ny * LY + nz * 0.45 + (bd - 0.5) * 0.3;
      const tone = light > 0.62 ? 0 : light > 0.22 ? 1 : light > -0.22 ? 2 : 3;
      img.set(x, y, PUFF_TONES[tone]!);
    }
  return [img, Math.floor(r), Math.floor(r)];
}

// ---------------------------------------------------------------------------- ground decals

const BLOOD = { dark: rgba('#360b09'), mid: rgba('#5a1410'), lit: rgba('#8c2a1e') };

/** Splatter: a clotted centre, droplets thrown outward, each trailing a streak back to the hit. */
function splat(k: number, L: number): [Img, number, number] {
  const W = Math.ceil(9 * L) + 2;
  const H = Math.ceil(5 * L) + 2;
  const img = new Img(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const rnd = rngOf(k * 31 + 5);
  const disc = (x0: number, y0: number, r: number, col: number, lit: boolean) => {
    const R = Math.max(0.5, r);
    for (let y = Math.floor(y0 - R); y <= Math.ceil(y0 + R); y++)
      for (let x = Math.floor(x0 - R * 2); x <= Math.ceil(x0 + R * 2); x++) {
        // Ground decals are squashed to the iso plane: twice as wide as tall.
        const q = ((x + 0.5 - x0) / (R * 2)) ** 2 + ((y + 0.5 - y0) / R) ** 2;
        if (q > 1 && !(R <= 0.5 && Math.abs(x + 0.5 - x0) < 1 && Math.abs(y + 0.5 - y0) < 1)) continue;
        img.set(x, y, lit && x + 0.5 < x0 && y + 0.5 < y0 && R * 2 >= 3 ? BLOOD.lit : col);
      }
  };
  // The clotted centre: a few lumps.
  for (let b = 0; b < 3; b++) disc(cx + (rnd() - 0.5) * L * 1.2, cy + (rnd() - 0.5) * L * 0.5, (0.35 + rnd() * 0.25) * L, b === 0 ? BLOOD.dark : BLOOD.mid, false);
  const n = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = (1.2 + rnd() * 2.6) * L;
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist * 0.5;
    const r = (0.08 + rnd() * 0.22) * L;
    // The streak back toward the centre.
    const sl = Math.min(dist * 0.6, r * 4 + L * 0.3);
    const steps = Math.ceil(sl);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      img.set(Math.floor(x - Math.cos(a) * sl * t), Math.floor(y - Math.sin(a) * sl * t * 0.5), BLOOD.dark);
    }
    disc(x, y, r, BLOOD.mid, true);
  }
  return [img, Math.floor(cx), Math.floor(cy)];
}

/** A stone's crater: a scooped bowl (its upper-left wall in shadow), a rim of thrown earth lit on
 * its upper left, and clods beyond. */
function crater(k: number, L: number): [Img, number, number] {
  const W = Math.ceil(20 * L);
  const H = Math.ceil(10 * L);
  const img = new Img(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const rx = 7 * L;
  const ry = 3.4 * L;
  const rnd = rngOf(k * 17 + 3);
  const lobes = [rnd(), rnd(), rnd(), rnd()];
  const cols = {
    deep: rgba('#16110c'),
    wallDark: rgba('#221a12'),
    wallLit: rgba('#46392a'),
    rimLit: rgba('#7e6a4c'),
    rim: rgba('#5c4b36'),
    rimDark: rgba('#3a2f22'),
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const ang = Math.atan2(dy, dx);
      const wob = 1 + 0.08 * Math.sin(ang * 3 + lobes[0]! * 6) + 0.05 * Math.sin(ang * 5 + lobes[1]! * 6);
      const q = Math.sqrt(dx * dx + dy * dy) / wob;
      const bd = bayer(x, y);
      // Facing: + where the surface faces the light.
      const face = -(dx * LX + dy * LY) / Math.max(0.2, Math.hypot(dx, dy));
      if (q < 0.5 + (bd - 0.5) * 0.06) img.set(x, y, q < 0.28 ? cols.deep : face < -0.2 ? cols.wallLit : cols.wallDark);
      else if (q < 0.62 + (bd - 0.5) * 0.08) img.set(x, y, face < 0 ? cols.wallLit : cols.wallDark);
      else if (q < 0.95 + (bd - 0.5) * 0.18) img.set(x, y, face > 0.35 ? cols.rimLit : face < -0.4 ? cols.rimDark : cols.rim);
    }
  // Clods: lumps of earth thrown past the rim, each lit on its upper left.
  const n = 10 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 1.05 + rnd() * 0.35;
    const x0 = cx + Math.cos(a) * rx * d;
    const y0 = cy + Math.sin(a) * ry * d;
    const r = Math.max(0.6, (0.18 + rnd() * 0.3) * L);
    for (let y = Math.floor(y0 - r); y <= Math.ceil(y0 + r); y++)
      for (let x = Math.floor(x0 - r); x <= Math.ceil(x0 + r); x++) {
        const ux = (x + 0.5 - x0) / r;
        const uy = (y + 0.5 - y0) / r;
        if (ux * ux + uy * uy > 1) continue;
        img.set(x, y, ux * LX + uy * LY > 0.3 ? cols.rimLit : ux * LX + uy * LY < -0.3 ? cols.rimDark : cols.rim);
      }
  }
  return [img, Math.floor(cx), Math.floor(cy)];
}

/** A hoofprint pressed into the soil: a dark crescent, its far lip catching the light. */
function hoof(k: number, L: number): [Img, number, number] {
  const S = Math.max(3, Math.ceil(1.6 * L) + 2);
  const img = new Img(S, S);
  const c = S / 2;
  const a = (k / HOOVES) * Math.PI * 2 + 0.4;
  const ox = Math.cos(a);
  const oy = Math.sin(a);
  const R = Math.max(1, 0.55 * L);
  const dark = rgba('#2a2016');
  const mid = rgba('#433526');
  const lip = rgba('#8a7656');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const ux = (x + 0.5 - c) / R;
      const uy = ((y + 0.5 - c) / R) * 1.7;
      const q = ux * ux + uy * uy;
      if (q > 1) continue;
      // The frog: the open end of the U.
      const along = ux * ox + uy * oy;
      if (along > 0.35 && q < 0.45) continue;
      const lit = ux * LX + uy * LY;
      img.set(x, y, q > 0.62 && lit < -0.2 ? lip : q < 0.4 ? dark : mid);
    }
  return [img, Math.floor(c), Math.floor(c)];
}

/** A sharpened stake driven in at a slant against horse, lit on its left. */
function stake(t: number, L: number): [Img, number, number] {
  const len = 6.4;
  const lean = t === 0 ? 0.5 : -0.5;
  const W = Math.ceil((Math.abs(lean) * len + 2) * L) + 4;
  const H = Math.ceil((len + 1) * L) + 4;
  const img = new Img(W, H);
  const gx = Math.floor(W / 2 - (lean * len * L) / 2);
  const gy = H - 2;
  const ln = Math.hypot(lean, 1);
  const dx = lean / ln;
  const dy = -1 / ln;
  const half = Math.max(0.5, 0.32 * L);
  const cols = { lit: rgba('#9c7a52'), mid: rgba('#6a4c2e'), dark: rgba('#3e2a18'), cut: rgba('#cfb07c'), bark: rgba('#54402a') };
  const nx = -dy;
  const ny = dx;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rx = x + 0.5 - gx;
      const ry = y + 0.5 - gy;
      const along = (rx * dx + ry * dy) / L;
      const side = rx * nx + ry * ny;
      if (along < 0 || along > len) continue;
      // The point: the last map px tapers.
      const taper = along > len - 1.4 ? (len - along) / 1.4 : 1;
      if (Math.abs(side) > Math.max(0.5, half * taper)) continue;
      const litSide = side * (nx * LX + ny * LY >= 0 ? 1 : -1);
      let col = litSide > half * 0.3 ? cols.lit : litSide < -half * 0.3 ? cols.dark : cols.mid;
      if (taper < 1 && litSide > -half * 0.2) col = cols.cut;
      else if (L >= 4 && Math.floor(along * 2.3 + side * 0.3) % 3 === 0 && litSide <= half * 0.3) col = cols.bark;
      img.set(x, y, col);
    }
  if (L >= 2) img.outline(C.out);
  return [img, gx, gy];
}

/** The mangonel's stone: a rough ball, lit upper left. */
function stone(L: number): [Img, number, number] {
  const S = Math.ceil(3.6 * L) + 2;
  const img = new Img(S, S);
  const c = S / 2;
  const r = 1.7 * L;
  const tones = [rgba('#b0a894'), rgba('#857d6c'), rgba('#5e5850'), rgba('#3c3934')];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const ux = (x + 0.5 - c) / r;
      const uy = (y + 0.5 - c) / r;
      const q = ux * ux + uy * uy;
      const rough = 0.08 * Math.sin(Math.atan2(uy, ux) * 5);
      if (q > 1 + rough) continue;
      const light = ux * LX + uy * LY + Math.sqrt(Math.max(0, 1 - q)) * 0.4;
      img.set(x, y, tones[light > 0.75 ? 0 : light > 0.3 ? 1 : light > -0.2 ? 2 : 3]!);
    }
  if (L >= 2) img.outline(C.out);
  return [img, Math.floor(c), Math.floor(c)];
}

/** A small flat ellipse (a missile's shadow), white, tinted at draw time. */
function dot(L: number): [Img, number, number] {
  const w = Math.max(1, Math.round(1.4 * L));
  const h = Math.max(1, Math.round(0.7 * L));
  const img = new Img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (((x + 0.5) / w - 0.5) ** 2 + ((y + 0.5) / h - 0.5) ** 2 <= 0.26 || w * h <= 2) img.set(x, y, rgba('#ffffff'));
  return [img, Math.floor(w / 2), Math.floor(h / 2)];
}

// ---------------------------------------------------------------------------- the sheet

/** Paints the whole HD effects sheet at level L (1, 2, 4 or 8). */
export function buildFxHd(L: number): HdSheet {
  const imgs: [Img, number, number][] = new Array(NAMES.length);
  const put = (n: string, r: [Img, number, number]) => (imgs[fxId(n)] = r);
  for (const look of ['arrow', 'bolt', 'jav'] as const) {
    for (let a = 0; a < ANGLES; a++) put(`${look}${a}`, missile(look, (a / ANGLES) * Math.PI * 2, L));
    for (let k = 0; k < 3; k++) put(`stuck_${look}${k}`, stuck(look, k, L));
  }
  for (const d of PUFF_SIZES) for (let v = 0; v < PUFF_VARIANTS; v++) put(`puff${d}_${v}`, puff(d, v, L));
  for (let k = 0; k < SPLATS; k++) put(`splat${k}`, splat(k, L));
  for (let k = 0; k < 2; k++) put(`crater${k}`, crater(k, L));
  for (let k = 0; k < HOOVES; k++) put(`hoof${k}`, hoof(k, L));
  for (let k = 0; k < 2; k++) put(`stake${k}`, stake(k, L));
  put('stone', stone(L));
  put('dot', dot(L));
  for (const look of ['arrow', 'bolt', 'jav'] as const) for (let a = 0; a < PIN_ANGLES; a++) put(`pin_${look}${a}`, pin(look, a, L));
  const horse = (h: HorseImg): [Img, number, number] => {
    const img = new Img(h.w, h.h);
    for (let i = 0; i < h.px.length; i++) if (h.px[i]) img.px[i] = rgba(h.px[i]!);
    return [img, h.ax, h.ay];
  };
  for (let c = 0; c < HORSE_COATS; c++)
    for (let l = 0; l < 2; l++) {
      for (let f = 0; f < HORSE_FRAMES; f++) put(`horse_run${c}_${l}_${f}`, horse(horseRun(c, f, l === 1, L)));
      put(`horse_dead${c}_${l}`, horse(horseDead(c, l === 1, L)));
    }
  // Shelf-pack, tallest first, into a sheet 2048 texels wide (512 at level 1).
  const W = L >= 4 ? 2048 : L >= 2 ? 1024 : 512;
  const order = imgs.map((_, i) => i).sort((a, b) => imgs[b]![0].h - imgs[a]![0].h);
  const regions: HdRegion[] = new Array(NAMES.length);
  let x = 1;
  let y = 1;
  let row = 0;
  for (const i of order) {
    const [img, ax, ay] = imgs[i]!;
    if (x + img.w + 1 > W) {
      x = 1;
      y += row + 1;
      row = 0;
    }
    regions[i] = { u: x, v: y, w: img.w, h: img.h, ax, ay };
    x += img.w + 1;
    row = Math.max(row, img.h);
  }
  const H = y + row + 1;
  const out = new Uint32Array(W * H);
  for (const i of order) {
    const [img] = imgs[i]!;
    const r = regions[i]!;
    for (let j = 0; j < img.h; j++) out.set(img.px.subarray(j * img.w, (j + 1) * img.w), (r.v + j) * W + r.u);
  }
  return { L, w: W, h: H, pixels: new Uint8ClampedArray(out.buffer), regions };
}
