// The regiments' standards in the HD art, painted natively at a detail level L like the figures
// they fly over (one map pixel = L texels): the same shapes, colours, waving frames and anchors as
// the classic standards (fx.ts `banner`), but the cloth is shaded fold by fold with a dark and a
// light ramp step, the emblem has crisp edges, the pole has a lit edge and a gilt finial, the
// commander's cloth a fringe; a wavering standard is torn by ragged holes, not missing squares;
// the stance glyphs are drawn at the same density. Without the DOM, so it is testable in Node.

import { FACTIONS, type FactionId } from '../../game/factions.ts';
import type { HdRegion, HdSheet } from './fx-hd.ts';

export interface StdArmy {
  hue: number;
  faction: FactionId;
}

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** fx.ts shadeHex: k < 1 darkens, k > 1 lightens toward white. */
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)))) as RGB;
function hsl(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const word = (c: RGB): number => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;

/** The cloth's ramp (deep, shade, base, light) and the emblem colour, as fx.ts `colours`. */
function ramp(army: StdArmy, command: boolean): { deep: RGB; shade: RGB; base: RGB; light: RGB; mark: RGB } {
  const pal = FACTIONS[army.faction].palette;
  if (command) {
    const base = hex(pal.cloth);
    return { deep: shade(base, 0.6), shade: shade(base, 0.78), base, light: shade(base, 1.35), mark: hex(pal.trim) };
  }
  return { deep: hsl(army.hue, 60, 20), shade: hsl(army.hue, 64, 28), base: hsl(army.hue, 68, 42), light: hsl(army.hue, 72, 56), mark: shade(hex(pal.cloth), 1.1) };
}

const OUT = word([18, 13, 9]);
const POLE = word([58, 42, 26]);
const POLE_LIT = word([110, 84, 54]);
const GOLD = word([201, 162, 74]);
const GOLD_LIT = word([240, 214, 128]);
const GOLD_DARK = word([140, 104, 40]);

class Img {
  readonly px: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(w * h);
  }
  set(x: number, y: number, c: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x]! : 0;
  }
  outline(c: number): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!this.get(x, y) && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) add.push(y * this.w + x);
    for (const i of add) this.px[i] = c;
  }
}

/** A lattice hash in 0..1. */
function h2(x: number, y: number, k: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, k: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = x - ix;
  const ty = y - iy;
  const a = h2(ix, iy, k);
  const b = h2(ix + 1, iy, k);
  const c = h2(ix, iy + 1, k);
  const d = h2(ix + 1, iy + 1, k);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** The pole from map row y0 to the foot, with a gilt finial on top, at column px (map px). */
function pole(img: Img, L: number, px: number, y0: number, H: number): void {
  const pw = Math.max(1, Math.round(0.55 * L));
  const x0 = Math.round(px * L);
  for (let y = Math.round(y0 * L); y < H * L; y++)
    for (let i = 0; i < pw; i++) img.set(x0 + i, y, i === 0 && pw > 1 ? POLE_LIT : POLE);
  // Finial: a small gilt spearhead lit upper left.
  const fh = Math.max(2, Math.round(1.9 * L));
  const fw = Math.max(1, Math.round(0.9 * L));
  const cx = x0 + pw / 2;
  const top = Math.round(y0 * L) - fh;
  for (let y = 0; y < fh; y++) {
    const t = y / fh;
    const half = Math.max(0.5, (t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4 * 0.6) * fw * 0.5);
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) img.set(x, top + y, x + 0.5 < cx - half * 0.3 && t < 0.6 ? GOLD_LIT : x + 0.5 > cx + half * 0.4 ? GOLD_DARK : GOLD);
  }
}

/**
 * A standard: 12 × 22 map px with its pole foot at (1 or 10, 21), as the classic one. Each faction
 * flies its own cloth, as Total War's unit banners tell the armies apart by shape before colour
 * (docs/art-references/banners.md): the Templars a swallowtailed pennon with a cross pattée (the
 * Marshal the Beauséant, sable over argent); the samurai the nobori, a tall cloth hung down the pole
 * from a crossbar, the mon near its head; the undead a ragged gonfalon hung from a crossbar, cut to
 * a point and tattered, a skull on it. The hanging cloths stay above row 9, where the morale pips sit.
 */
function banner(army: StdArmy, command: boolean, frame: number, left: boolean, torn: boolean, L: number): [Img, number, number] {
  const W = 12;
  const H = 22;
  const img = new Img(W * L, H * L);
  const polX = left ? W - 2 : 1;
  const c = ramp(army, command);
  const ph = frame * (Math.PI / 2);
  const draw = army.faction === 'samurai' ? nobori : army.faction === 'undead' ? gonfalon : pennon;
  const top = draw(img, c, army, command, ph, frame, left, torn, L, polX);
  pole(img, L, polX, top, H);
  if (L >= 2) img.outline(OUT);
  return [img, polX * L, (H - 1) * L];
}

type Ramp = ReturnType<typeof ramp>;
/** Calls `px(ux, vy, tx, ty)` for every texel: ux map px out from the pole (0 at its outer edge), vy map px down. */
function cloth(img: Img, L: number, polX: number, left: boolean, px: (ux: number, vy: number) => RGB | null): void {
  for (let ty = 0; ty < img.h; ty++)
    for (let tx = 0; tx < img.w; tx++) {
      const ux = left ? polX - (tx + 0.5) / L : (tx + 0.5) / L - polX - 1;
      if (ux < -0.6) continue;
      const col = px(ux, (ty + 0.5) / L);
      if (col) img.set(tx, ty, word(col));
    }
}
const tone = (c: Ramp, lit: number): RGB => (lit > 0.55 ? c.light : lit > -0.05 ? c.base : lit > -0.6 ? c.shade : c.deep);
const markTone = (mark: RGB, lit: number): RGB => (lit < -0.6 ? shade(mark, 0.72) : lit > 0.55 ? shade(mark, 1.08) : mark);

/** The Templars: a swallowtailed pennon, flying out from the pole, a cross pattée on it; the Marshal's Beauséant. */
function pennon(img: Img, c: Ramp, _army: StdArmy, command: boolean, ph: number, frame: number, left: boolean, torn: boolean, L: number, polX: number): number {
  const cw = command ? 9 : 8;
  const ch = command ? 7 : 6;
  const markW = Math.max(1, Math.round(L * (command ? 1.1 : 0.95)));
  const markX = cw / 2 - 0.3;
  const markY = ch / 2;
  // The Beauséant: the upper half sable, the lower argent (the Order's war banner).
  const sable: Ramp = { deep: [14, 12, 12], shade: [26, 23, 22], base: [40, 36, 34], light: [62, 57, 52], mark: c.mark };
  const argent: Ramp = { deep: [140, 132, 116], shade: [182, 174, 156], base: [222, 214, 196], light: [244, 239, 226], mark: c.mark };
  cloth(img, L, polX, left, (ux, y) => {
    if (ux < 0 || ux > cw) return null;
    const wave = Math.sin(ux * 0.9 - ph) * (ux / cw) * 1.6;
    const vy = y - 2 - wave;
    if (vy < 0 || vy > ch) return null;
    if (!command && ux > cw - 1.6 && Math.abs(vy - ch / 2) < (ux - (cw - 1.6)) * 0.9) return null; // the swallowtail
    if (torn) {
      const n = vnoise(ux * 1.3, vy * 1.3 + frame * 0.7, command ? 5 : 3);
      if (ux > cw - 3.2 && n < (ux - (cw - 3.2)) * 0.32) return null;
      if (n > 0.86) return null;
    }
    const lit = Math.sin(ux * 0.9 - ph + 0.8);
    if (command) {
      if (L >= 2 && vy > ch - 0.45 && Math.floor(ux * L / Math.max(1, L / 4)) % 2 === 0) return shade(c.mark, 0.9); // the fringe
      return tone(vy < ch / 2 ? sable : argent, lit);
    }
    // The cross pattée: arms that flare toward their ends, clear of the cloth's edges.
    const dx = Math.abs(ux - markX), dy = Math.abs(vy - markY);
    const half = (d: number) => markW / 2 / L + 0.22 * d;
    if ((dx < half(dy) && dy < 2.2) || (dy < half(dx) && dx < 2.5)) return markTone(c.mark, lit);
    return tone(c, lit);
  });
  return 2;
}

/**
 * The samurai: the nobori, a tall cloth down the pole from a crossbar at its head. Every samurai
 * already carries a sashimono in the army colour, so a regiment's nobori is the paper-white cloth
 * with the army colour in a band at its head and a large mon (Met 53912, a nobori: pale cloth, the
 * mon dark and big); the lord's is his own dark cloth with a gilt mon.
 */
function nobori(img: Img, c: Ramp, _army: StdArmy, command: boolean, ph: number, frame: number, left: boolean, torn: boolean, L: number, polX: number): number {
  const cw = command ? 5.2 : 4.4;
  const y0 = 1.2;
  const y1 = 8.8;
  const paper: Ramp = { deep: [120, 112, 96], shade: [176, 168, 148], base: [226, 220, 202], light: [244, 241, 230], mark: c.mark };
  const field = command ? c : paper;
  const mark: RGB = command ? [226, 186, 92] : c.base;
  const monY = y0 + cw * 0.5 + 1.1;
  const monR = cw * (command ? 0.3 : 0.36);
  cloth(img, L, polX, left, (ux, y) => {
    // The crossbar (the yokoage) along the cloth's head.
    if (y >= y0 - 0.55 && y < y0 && ux >= -0.2 && ux < cw + 0.5) return ux > cw * 0.5 ? [58, 42, 26] : [110, 84, 54];
    if (y < y0 || y > y1) return null;
    // Tied to the pole along one side, the free edge swaying a little, more toward the foot.
    const k = (y - y0) / (y1 - y0);
    const sway = Math.sin(y * 0.8 - ph) * 0.45 * k;
    if (ux < 0 || ux > cw + sway) return null;
    if (torn) {
      const n = vnoise(ux * 1.4, y * 1.3 + frame * 0.7, command ? 6 : 4);
      if (y > y1 - 2.6 && n < (y - (y1 - 2.6)) * 0.3) return null;
      if (n > 0.87) return null;
    }
    // Folds run down the cloth: light on the crests of the sway.
    const lit = Math.sin(y * 0.8 - ph + 0.8 + ux * 0.5) * 0.8 + (ux < 0.6 ? -0.3 : 0);
    // The mon: a pale disc with a ring of the cloth inside it (level 4 up), crisp.
    const d = Math.hypot(ux - cw / 2, y - monY);
    if (d < monR) return L >= 4 && Math.abs(d - monR * 0.55) < 0.5 / L + 0.12 ? tone(field, lit) : command ? markTone(mark, lit) : tone(c, lit);
    // The army colour in a band across the head of a regiment's cloth.
    if (!command && y < y0 + 1.15) return tone(c, lit);
    return tone(field, lit);
  });
  return y0 - 0.55;
}

/** The undead: a gonfalon hung from a crossbar, cut to a point and always ragged, a skull on it. */
function gonfalon(img: Img, c0: Ramp, army: StdArmy, command: boolean, ph: number, frame: number, left: boolean, torn: boolean, L: number, polX: number): number {
  // The army colour gone dull and dark, as dyed cloth left in a grave.
  const c: Ramp = command ? c0 : { deep: hsl(army.hue, 34, 10), shade: hsl(army.hue, 38, 17), base: hsl(army.hue, 42, 27), light: hsl(army.hue, 44, 38), mark: c0.mark };
  const bone: RGB = [216, 206, 178];
  const cw = command ? 7.4 : 6.6;
  const y0 = 2.0;
  const mid = cw / 2;
  cloth(img, L, polX, left, (ux, y) => {
    // The crossbar, standing out past the cloth on both sides.
    if (y >= y0 - 0.5 && y < y0 && ux >= -0.2 && ux < cw + 0.4) return ux > cw * 0.6 ? [58, 42, 26] : [96, 74, 50];
    if (y < y0) return null;
    // It hangs and swings as one sheet from the bar, the foot furthest.
    const sway = Math.sin(ph) * 0.55 * ((y - y0) / 7);
    const x = ux - sway;
    if (x < 0.15 || x > cw) return null;
    // Cut to a point at the foot, the edge chewed: tatters always, more when wavering.
    const bottom = 6.3 + 2.4 * (1 - Math.abs(x - mid) / mid);
    const n = vnoise(x * 1.6, y * 1.1 + frame * 0.5, command ? 8 : 6);
    if (y > bottom - (torn ? 1.6 : 0.7) * n) return null;
    if (y > bottom - 2.4 && n > 0.78) return null;
    if (torn && n > 0.84) return null;
    if ((x < 0.6 || x > cw - 0.45) && n > 0.7) return null;
    const lit = Math.sin(x * 1.1 - ph * 0.5 + 0.4) * 0.7 + (y > bottom - 1.2 ? -0.5 : 0);
    // The skull: a pale dome over a jaw, two dark sockets (level 2 up), a crisp edge.
    const sx = x - mid, sy = y - (y0 + 2.4);
    const dome = Math.hypot(sx / 1.15, sy / 1.0) < 1;
    const jaw = Math.abs(sx) < 0.62 && sy >= 0.4 && sy < 1.4;
    if (dome || jaw) {
      if (L >= 2 && Math.abs(sy - 0.15) < 0.32 && Math.abs(Math.abs(sx) - 0.45) < 0.28) return [24, 18, 14];
      if (L >= 2 && jaw && sy > 0.85 && Math.floor((sx + 2) * L * 1.5) % 2 === 0) return shade(bone, 0.6);
      return markTone(bone, lit);
    }
    return tone(c, lit);
  });
  return y0 - 0.5;
}

/** A broken regiment's standard in the dirt: the pole down, the cloth crumpled beside it. */
function dropped(army: StdArmy, command: boolean, L: number): [Img, number, number] {
  const W = 18;
  const H = 7;
  const img = new Img(W * L, H * L);
  const c = ramp(army, command);
  const pw = Math.max(0.5, 0.28 * L);
  for (let ty = 0; ty < H * L; ty++)
    for (let tx = 0; tx < W * L; tx++) {
      const x = (tx + 0.5) / L;
      const y = (ty + 0.5) / L;
      // The pole, (0, 5) to (15, 2).
      const t = Math.max(0, Math.min(1, ((x - 0) * 15 + (y - 5) * -3) / (15 * 15 + 9)));
      const d = Math.hypot(x - 15 * t, y - (5 - 3 * t)) * L;
      if (d < pw && t < 1) img.set(tx, ty, d < pw * 0.4 && pw > 0.6 ? POLE_LIT : POLE);
      // The crumpled cloth: lumps shaded upper left.
      if (x > 8.6 && x < 15.4 && y > 2 && y < 6.2) {
        const n = vnoise(x * 0.9, y * 0.9, command ? 9 : 7);
        if (n < 0.2) continue;
        const lit = vnoise(x * 0.9 - 0.3, y * 0.9 - 0.3, command ? 9 : 7) - n;
        let col = lit > 0.05 ? c.light : lit < -0.06 ? c.shade : c.base;
        if (Math.abs(x - 11.5) < 0.45 && Math.abs(y - 4.5) < 0.9) col = c.mark;
        img.set(tx, ty, word(col));
      }
    }
  const g = Math.max(1, Math.round(0.6 * L));
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) img.set(Math.round(15.8 * L) + x, Math.round(1.8 * L) + y, x + y < g / 2 ? GOLD_LIT : GOLD);
  if (L >= 2) img.outline(OUT);
  return [img, 8 * L, 5 * L];
}

const GLYPHS: Record<string, string[]> = {
  shieldwall: ['.###.', '#+#+#', '#####', '#+#+#', '.###.', '..#..'],
  pikewall: ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '+.+.+'],
  braced: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  wedge: ['..#..', '.###.', '.#+#.', '##+##', '#####', '.....'],
  column: ['.###.', '.....', '.###.', '.....', '.###.', '.....'],
  loose: ['#...#', '..#..', '#...#', '..#..', '#...#', '.....'],
};

/** A stance glyph: the classic 5 × 6 icon, each cell an L-texel tile with a lit top edge. */
function glyph(rows: string[], L: number): [Img, number, number] {
  const img = new Img(7 * L, 8 * L);
  const pale = word([232, 224, 200]);
  const paleLit = word([252, 248, 232]);
  const tan = word([154, 138, 100]);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      for (let j = 0; j < L; j++)
        for (let i = 0; i < L; i++) img.set((x + 1) * L + i, (y + 1) * L + j, ch === '+' ? tan : j === 0 && L >= 4 && !rows[y - 1]?.[x]?.match(/[#+]/) ? paleLit : pale);
    }),
  );
  img.outline(OUT);
  return [img, 3 * L, 7 * L];
}

/** Names on a standards sheet, in order. */
export function stdNames(): string[] {
  const out: string[] = [];
  for (let t = 0; t < 2; t++) for (let f = 0; f < 4; f++) out.push(`ban${t}_${f}`, `cmd${t}_${f}`, `torn${t}_${f}`, `torncmd${t}_${f}`);
  for (let t = 0; t < 2; t++) out.push(`dropped${t}`, `droppedcmd${t}`);
  for (const g of Object.keys(GLYPHS)) out.push(`glyph_${g}`);
  return out;
}

/** The standards of a battle's two armies, at level L; regions keyed as the classic fx sheet. */
export function buildStandardsHd(armies: readonly [StdArmy, StdArmy], L: number): HdSheet & { byName: Map<string, HdRegion> } {
  const imgs: [string, [Img, number, number]][] = [];
  for (let t = 0; t < 2; t++)
    for (let f = 0; f < 4; f++) {
      const left = t === 1;
      imgs.push([`ban${t}_${f}`, banner(armies[t]!, false, f, left, false, L)]);
      imgs.push([`cmd${t}_${f}`, banner(armies[t]!, true, f, left, false, L)]);
      imgs.push([`torn${t}_${f}`, banner(armies[t]!, false, f, left, true, L)]);
      imgs.push([`torncmd${t}_${f}`, banner(armies[t]!, true, f, left, true, L)]);
    }
  for (let t = 0; t < 2; t++) {
    imgs.push([`dropped${t}`, dropped(armies[t]!, false, L)]);
    imgs.push([`droppedcmd${t}`, dropped(armies[t]!, true, L)]);
  }
  for (const [g, rows] of Object.entries(GLYPHS)) imgs.push([`glyph_${g}`, glyph(rows, L)]);
  const W = Math.max(256, 16 * 12 * L);
  const regions: HdRegion[] = [];
  const byName = new Map<string, HdRegion>();
  let x = 1;
  let y = 1;
  let row = 0;
  for (const [n, [img, ax, ay]] of imgs) {
    if (x + img.w + 1 > W) {
      x = 1;
      y += row + 1;
      row = 0;
    }
    const r = { u: x, v: y, w: img.w, h: img.h, ax, ay };
    regions.push(r);
    byName.set(n, r);
    x += img.w + 1;
    row = Math.max(row, img.h);
  }
  const H = y + row + 1;
  const out = new Uint32Array(W * H);
  imgs.forEach(([, [img]], i) => {
    const r = regions[i]!;
    for (let j = 0; j < img.h; j++) out.set(img.px.subarray(j * img.w, (j + 1) * img.w), (r.v + j) * W + r.u);
  });
  return { L, w: W, h: H, pixels: new Uint8ClampedArray(out.buffer), regions, byName };
}
