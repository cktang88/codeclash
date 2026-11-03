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

/** A standard: 12 × 22 map px with its pole foot at (1 or 10, 21), as the classic one. */
function banner(army: StdArmy, command: boolean, frame: number, left: boolean, torn: boolean, L: number): [Img, number, number] {
  const W = 12;
  const H = 22;
  const img = new Img(W * L, H * L);
  const polX = left ? W - 2 : 1;
  const cw = command ? 9 : 8;
  const ch = command ? 7 : 6;
  const c = ramp(army, command);
  const ph = frame * (Math.PI / 2);
  const markW = Math.max(1, Math.round(L * (command ? 1.1 : 0.95)));
  const markX = Math.floor(cw / 2) - (command ? 0 : 1) + 0.5;
  const markY = Math.floor(ch / 2) + 0.5;
  const swallow = !command; // regimental cloths end in a swallowtail, as the classic ones
  for (let ty = 0; ty < H * L; ty++)
    for (let tx = 0; tx < W * L; tx++) {
      // Distance out from the pole along the cloth (map px), and down the cloth.
      const ux = (left ? polX - (tx + 0.5) / L : (tx + 0.5) / L - polX - 1) ;
      if (ux < 0 || ux > cw) continue;
      const wave = Math.sin(ux * 0.9 - ph) * (ux / cw) * 1.6;
      const vy = (ty + 0.5) / L - 2 - wave;
      if (vy < 0 || vy > ch) continue;
      // Swallowtail: a notch cut into the fly end.
      if (swallow && ux > cw - 1.6 && Math.abs(vy - ch / 2) < (ux - (cw - 1.6)) * 0.9) continue;
      // Tattered: ragged tears at the fly and a few holes, from noise at about a map px.
      if (torn) {
        const n = vnoise(ux * 1.3, vy * 1.3 + frame * 0.7, command ? 5 : 3);
        if (ux > cw - 3.2 && n < (ux - (cw - 3.2)) * 0.32) continue;
        if (n > 0.86) continue;
      }
      // Folds: the light along the wave's slope; deeper shade in the troughs.
      const lit = Math.sin(ux * 0.9 - ph + 0.8);
      let col = lit > 0.55 ? c.light : lit > -0.05 ? c.base : lit > -0.6 ? c.shade : c.deep;
      // The emblem: a cross of the mark colour, crisp at this level.
      const onMark = Math.abs(ux - markX) * L < markW / 2 || Math.abs(vy - markY) * L < markW / 2;
      if (onMark && !(!command && ux > cw - 2.5)) col = lit < -0.6 ? shade(c.mark, 0.72) : lit > 0.55 ? shade(c.mark, 1.08) : c.mark;
      // The commander's cloth: a fringe of the mark colour along the foot (level 2 up).
      if (command && L >= 2 && vy > ch - 0.45 && Math.floor(tx / Math.max(1, L / 4)) % 2 === 0) col = shade(c.mark, 0.9);
      img.set(tx, ty, word(col));
    }
  pole(img, L, polX, 2, H);
  if (L >= 2) img.outline(OUT);
  return [img, polX * L, (H - 1) * L];
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
