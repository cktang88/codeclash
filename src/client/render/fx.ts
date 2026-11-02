// The effects sheet: everything the battle draws that is not a soldier. Missiles at sixteen
// angles, blood pools and splatter, craters, spent arrows, smoke puffs, regiment standards in
// each army's hue, and the trees, boulders and ruins around the field. Painted pixel by pixel
// once per battle and packed into one texture.

import { FACTIONS, type FactionId } from '../../game/factions.ts';
import { hsl } from './sprites.ts';

/** An army as the effects sheet needs it: its heraldic hue and its faction's colours. */
export interface FxArmy {
  hue: number;
  faction: FactionId;
}

/** Banner colours: regimental cloth in the army's hue with the faction's light cloth as the
 * emblem; the commander's standard in the faction's own cloth and trim (for the Templars, the
 * white field and red cross). */
interface Colours {
  base: string;
  shade: string;
  light: string;
  mark: string;
}

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(n >> 16)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
}

function colours(army: FxArmy, command: boolean): Colours {
  const pal = FACTIONS[army.faction].palette;
  if (command) return { base: pal.cloth, shade: shadeHex(pal.cloth, 0.78), light: shadeHex(pal.cloth, 1.35), mark: pal.trim };
  return { base: hsl(army.hue, 68, 42), shade: hsl(army.hue, 64, 28), light: hsl(army.hue, 72, 56), mark: shadeHex(pal.cloth, 1.1) };
}

export interface Region {
  u: number;
  v: number;
  w: number;
  h: number;
  /** The anchor: the point that lands on the given map position. */
  ax: number;
  ay: number;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

/** A small pixel grid, blitted into the sheet. */
class Px {
  readonly c: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.c = new Array<string | null>(w * h).fill(null);
  }
  set(x: number, y: number, col: string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = col;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.c[y * this.w + x]!;
  }
  rect(x: number, y: number, w: number, h: number, col: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
  }
  line(x0: number, y0: number, x1: number, y1: number, col: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
  }
  outline(col: string): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
      }
    for (const i of add) this.c[i] = col;
  }
}

/** Shelf packer over a canvas. */
class Sheet {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  private x = 1;
  private y = 1;
  private row = 0;
  readonly regions = new Map<string, Region>();
  constructor(readonly size: number) {
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
  }
  put(name: string, p: Px, ax: number, ay: number): void {
    if (this.x + p.w + 1 > this.size) {
      this.x = 1;
      this.y += this.row + 1;
      this.row = 0;
    }
    const u = this.x;
    const v = this.y;
    for (let j = 0; j < p.h; j++)
      for (let i = 0; i < p.w; i++) {
        const col = p.c[j * p.w + i];
        if (!col) continue;
        this.ctx.fillStyle = col;
        this.ctx.fillRect(u + i, v + j, 1, 1);
      }
    this.regions.set(name, { u, v, w: p.w, h: p.h, ax, ay });
    this.x += p.w + 1;
    this.row = Math.max(this.row, p.h);
  }
}

export interface FxSheet {
  canvas: HTMLCanvasElement;
  get(name: string): Region;
}

const OUT = '#120d09';

function rngOf(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pool(r: () => number, w: number, h: number, dark: string, mid: string, light: string): Px {
  const p = new Px(w, h);
  const blobs = 3 + Math.floor(r() * 3);
  const bs: [number, number, number][] = [];
  for (let k = 0; k < blobs; k++) bs.push([w / 2 + (r() - 0.5) * w * 0.45, h / 2 + (r() - 0.5) * h * 0.35, 0.25 + r() * 0.3]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let f = 0;
      for (const [bx, by, br] of bs) {
        const dx = (x + 0.5 - bx) / (w * br);
        const dy = (y + 0.5 - by) / (h * br);
        f = Math.max(f, 1 - (dx * dx + dy * dy));
      }
      const d = bayer(x, y);
      if (f + (d - 0.5) * 0.3 <= 0.05) continue;
      p.set(x, y, f > 0.55 ? mid : f > 0.25 ? dark : dark);
      if (f > 0.75 && d > 0.85) p.set(x, y, light);
    }
  return p;
}

/** A missile drawn along the screen angle `a` (radians), on a square cell. */
function missile(kind: 'arrow' | 'bolt' | 'jav', a: number): Px {
  const len = kind === 'jav' ? 8 : kind === 'arrow' ? 6 : 4;
  const size = len + 3;
  const p = new Px(size, size);
  const c = (size - 1) / 2;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  for (let i = 0; i < len; i++) {
    const t = i - (len - 1) / 2;
    // Dark iron head, dark shaft, pale fletching: the contrast is what reads at this size.
    const col =
      kind === 'jav' ? (i >= len - 2 ? '#2e2c2a' : i === 0 ? '#c8bfa8' : '#6b4c2c') : kind === 'bolt' ? (i === len - 1 ? '#2a2826' : i === 0 ? '#d8d0bc' : '#4a3a28') : i === len - 1 ? '#262422' : i <= 1 ? '#efe8d8' : '#6e5638';
    p.set(c + dx * t, c + dy * t, col);
  }
  return p;
}

/** A lumpy puff: a few overlapping blobs, lit on top, darker underneath. Tinted at draw time. */
function puff(d: number, seed: number): Px {
  const p = new Px(d, d);
  const r = d / 2;
  const rnd = rngOf(seed);
  const blobs: [number, number, number][] = [[r, r, r * 0.75]];
  if (d >= 4) for (let k = 0; k < 3; k++) blobs.push([r + (rnd() - 0.5) * r, r + (rnd() - 0.5) * r * 0.8, r * (0.4 + rnd() * 0.25)]);
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      let f = 0;
      for (const [bx, by, br] of blobs) f = Math.max(f, 1 - ((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2) / (br * br));
      if (d <= 3 ? (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 > r * r + 0.6 : f + (bayer(x, y) - 0.5) * 0.35 <= 0) continue;
      const lit = (r - y) / r;
      p.set(x, y, lit > 0.3 ? '#ffffff' : lit > -0.35 ? '#dcdcdc' : '#b4b4b4');
    }
  return p;
}

// -------------------------------------------------------------------- props

function cypress(r: () => number, v: number): [Px, number, number] {
  const h = 30 + v * 5;
  const w = 11;
  const p = new Px(w, h + 3);
  const cx = (w - 1) / 2;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    // Flame-shaped crown: narrow tip, widest low, a little ragged.
    const half = Math.max(0.6, Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) * 4.6 + (r() - 0.5) * 0.9);
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      if (Math.abs(dx) > half) continue;
      const light = -dx / half + (1 - t) * 0.4 + (bayer(x, y) - 0.5) * 0.7;
      p.set(x, y, light > 0.7 ? '#4f5e33' : light > 0.05 ? '#33422a' : light > -0.6 ? '#25311f' : '#1a2318');
    }
  }
  p.rect(cx, h, 1, 3, '#3a2a1c');
  p.outline(OUT);
  return [p, Math.round(cx), h + 2];
}

function olive(r: () => number, v: number): [Px, number, number] {
  const w = 24 + v * 3;
  const h = 22 + v * 2;
  const p = new Px(w, h);
  const cx = w / 2;
  // A twisted trunk.
  for (let y = h - 1; y > h - 9; y--) {
    const sx = Math.round(cx + Math.sin(y * 0.7) * 1.2);
    p.rect(sx - 1, y, 2, 1, '#4a3a2a');
    p.set(sx - 1, y, '#6a5a44');
  }
  p.line(cx, h - 8, cx - 5, h - 12, '#4a3a2a');
  p.line(cx, h - 8, cx + 5, h - 13, '#4a3a2a');
  const blobs: [number, number, number][] = [];
  for (let k = 0; k < 7; k++) blobs.push([cx + (r() - 0.5) * w * 0.6, (h - 10) * (0.35 + r() * 0.45), 3.5 + r() * 3]);
  for (let y = 0; y < h - 6; y++)
    for (let x = 0; x < w; x++) {
      let f = -1;
      let lx = 0;
      for (const [bx, by, br] of blobs) {
        const q = 1 - ((x - bx) ** 2 + ((y - by) * 1.3) ** 2) / (br * br);
        if (q > f) {
          f = q;
          lx = (bx - x) / br + (by - y) / br;
        }
      }
      if (f + (bayer(x, y) - 0.5) * 0.5 <= 0) continue;
      const light = lx * 0.6 + f * 0.4 + (bayer(x, y) - 0.5) * 0.6;
      p.set(x, y, light > 0.65 ? '#8a9168' : light > 0.25 ? '#646e4a' : light > -0.1 ? '#475236' : '#323b28');
    }
  p.outline(OUT);
  return [p, Math.round(cx), h - 1];
}

function deadTree(): [Px, number, number] {
  const p = new Px(17, 24);
  p.line(8, 23, 8, 6, '#4a3e33');
  p.line(9, 23, 9, 9, '#2f2720');
  p.line(8, 12, 3, 5, '#4a3e33');
  p.line(3, 5, 2, 1, '#4a3e33');
  p.line(8, 9, 13, 3, '#3d332a');
  p.line(11, 5, 14, 5, '#3d332a');
  p.line(8, 15, 12, 12, '#3d332a');
  p.outline(OUT);
  return [p, 8, 23];
}

function boulder(r: () => number, v: number): [Px, number, number] {
  const w = 10 + v * 4;
  const h = 7 + v * 2;
  const p = new Px(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h * 0.6) / (h * 0.6);
      const q = dx * dx + dy * dy * (dy < 0 ? 1 : 2.2);
      if (q > 1 + (r() - 0.5) * 0.15) continue;
      const light = -dx * 0.5 - dy * 0.7 + (bayer(x, y) - 0.5) * 0.5;
      p.set(x, y, light > 0.55 ? '#a39b88' : light > 0.1 ? '#7c7566' : light > -0.35 ? '#5a554b' : '#3d3a34');
    }
  p.outline(OUT);
  return [p, Math.round(w / 2), h - 1];
}

function ruin(r: () => number, v: number): [Px, number, number] {
  const w = 26 + v * 4;
  const h = 20;
  const p = new Px(w, h + 2);
  // Courses of dressed stone, broken off along a ragged top.
  const tops: number[] = [];
  let top = 4 + r() * 6;
  for (let x = 0; x < w; x++) {
    top = Math.max(2, Math.min(h - 4, top + (r() - 0.5) * 3.5));
    tops.push(Math.round(top));
  }
  for (let x = 0; x < w; x++)
    for (let y = tops[x]!; y < h; y++) {
      const course = Math.floor(y / 3);
      const joint = (x + (course % 2) * 3) % 6 === 0 || y % 3 === 0;
      const face = x > w - 5 ? '#6a6252' : '#8f8670';
      p.set(x, y, joint ? '#5a5244' : y === tops[x] ? '#b4ab92' : face);
      if (!joint && bayer(x, y) > 0.9) p.set(x, y, '#7a7260');
    }
  // Rubble at the foot.
  for (let k = 0; k < 7; k++) p.rect(Math.floor(r() * w), h - 1 + Math.floor(r() * 2), 2, 1, k % 2 ? '#7c7566' : '#5a554b');
  p.outline(OUT);
  return [p, Math.round(w / 2), h];
}

function column(): [Px, number, number] {
  const p = new Px(9, 28);
  p.rect(0, 25, 9, 3, '#7c7566');
  for (let y = 6; y < 25; y++) {
    p.rect(2, y, 5, 1, '#9b927c');
    p.set(2, y, '#b9b09a');
    p.set(6, y, '#6d6656');
    if (y % 4 === 0) p.set(4, y, '#857c68');
  }
  p.rect(1, 4, 7, 2, '#a59c86');
  p.set(5, 4, null);
  p.set(6, 4, null);
  p.outline(OUT);
  return [p, 4, 27];
}

function bush(r: () => number, v: number): [Px, number, number] {
  const w = 9 + v * 2;
  const h = 6 + v;
  const p = new Px(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h) / h;
      if (dx * dx + dy * dy > 1 + (r() - 0.5) * 0.3) continue;
      const light = -dx * 0.4 - dy * 0.3 - 0.2 + (bayer(x, y) - 0.5) * 0.8;
      p.set(x, y, light > 0.3 ? '#6d7446' : light > -0.1 ? '#4a5532' : '#323b24');
    }
  p.outline(OUT);
  return [p, Math.round(w / 2), h - 1];
}

// -------------------------------------------------------------------- standards

/** A standard on its pole, the cloth in four frames of waving. */
function banner(army: FxArmy, command: boolean, frame: number, facingLeft: boolean, tattered = false): Px {
  const W = 12;
  const H = 22;
  const p = new Px(W, H);
  const pole = facingLeft ? W - 2 : 1;
  p.line(pole, 2, pole, H - 1, '#3a2a1a');
  p.set(pole, 1, '#c9a24a');
  p.set(pole, 0, '#e4c46a');
  const cw = command ? 9 : 8;
  const ch = command ? 7 : 6;
  const { base, shade, light, mark } = colours(army, command);
  for (let i = 0; i < cw; i++) {
    const x = facingLeft ? pole - 1 - i : pole + 1 + i;
    const wave = Math.round(Math.sin(i * 0.9 - frame * (Math.PI / 2)) * (i / cw) * 1.6);
    for (let j = 0; j < ch - (i === cw - 1 && !command ? 2 : 0); j++) {
      const y = 2 + j + wave + (i === cw - 1 && !command ? 1 : 0);
      const lit = Math.sin(i * 0.9 - frame * (Math.PI / 2) + 0.8);
      let col = lit > 0.45 ? light : lit < -0.45 ? shade : base;
      // The emblem: a cross of the mark colour (trim on the commander's, pale cloth on the hue).
      const mx = Math.floor(cw / 2) - (command ? 0 : 1);
      if (i === mx || j === Math.floor(ch / 2) - 0) col = mark;
      if (!command && (i === mx || j === Math.floor(ch / 2)) && (i > cw - 3)) col = lit < -0.45 ? shade : base;
      // Wavering: torn, with a ragged tail and holes.
      if (tattered) {
        const h = ((i * 7 + j * 13 + frame * 5) * 2654435761) >>> 28;
        if (i >= cw - 3 && h < (i - cw + 4) * 4) continue;
        if (h === 3 || h === 11) continue;
        if (h < 5) col = shade;
      }
      p.set(x, y, col);
    }
  }
  p.outline(OUT);
  return p;
}

/** The effects sheet for a battle between armies of these two hues. */
export function buildFx(armies: [FxArmy, FxArmy], seed: number): FxSheet {
  const s = new Sheet(512);
  const r = rngOf(seed ^ 0xf00d);
  for (let k = 0; k < 6; k++) {
    const w = 6 + Math.floor(r() * 6);
    s.put(`pool${k}`, pool(r, w, Math.round(w * 0.5) + 1, '#2e0a08', '#43100c', '#5c1a12'), Math.floor(w / 2), Math.floor(w / 4));
  }
  for (let k = 0; k < 4; k++) {
    const p = new Px(7, 4);
    for (let i = 0; i < 4; i++) p.set(Math.floor(r() * 7), Math.floor(r() * 4), r() < 0.5 ? '#3a0c0a' : '#521210');
    s.put(`splat${k}`, p, 3, 2);
  }
  for (let k = 0; k < 2; k++) {
    // A stone's crater: dark scooped centre, a lighter rim of thrown earth, clods around.
    const c = new Px(18, 9);
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 18; x++) {
        const dx = (x + 0.5 - 9) / 7;
        const dy = (y + 0.5 - 4.5) / 3.4;
        const q = Math.sqrt(dx * dx + dy * dy) + (r() - 0.5) * 0.25;
        if (q < 0.55) c.set(x, y, dy < 0 ? '#1e1812' : '#2c241a');
        else if (q < 0.85) c.set(x, y, '#3e3326');
        else if (q < 1.08 && bayer(x, y) > 0.35) c.set(x, y, dy > 0 ? '#6a5a42' : '#54473a');
      }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.15 + r() * 0.3;
      c.set(9 + Math.cos(a) * 7 * d, 4.5 + Math.sin(a) * 3.4 * d, r() < 0.5 ? '#5d5240' : '#3e3528');
    }
    s.put(`crater${k}`, c, 9, 4);
  }
  for (let k = 0; k < 3; k++) {
    const p = new Px(3, 5);
    const lean = k - 1;
    p.line(1, 4, 1 + lean, 1, '#5a4630');
    p.set(1 + lean, 0, '#b9b09a');
    s.put(`stuck${k}`, p, 1, 4);
  }
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    s.put(`arrow${a}`, missile('arrow', ang), 4, 4);
    s.put(`bolt${a}`, missile('bolt', ang), 3, 3);
    s.put(`jav${a}`, missile('jav', ang), 5, 5);
  }
  const stone = new Px(4, 4);
  stone.rect(0, 1, 4, 2, '#4a463e');
  stone.rect(1, 0, 2, 4, '#4a463e');
  stone.set(1, 1, '#8a8474');
  s.put('stone', stone, 2, 2);
  for (const d of [1, 2, 3, 4, 5, 6, 7, 9, 11]) s.put(`puff${d}`, puff(d, d * 31), Math.floor(d / 2), Math.floor(d / 2));

  // Stance glyphs shown over a standard when zoomed in.
  const glyphs: Record<string, string[]> = {
    shieldwall: ['.###.', '#+#+#', '#####', '#+#+#', '.###.', '..#..'],
    pikewall: ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '+.+.+'],
    braced: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
    wedge: ['..#..', '.###.', '.#+#.', '##+##', '#####', '.....'],
    column: ['.###.', '.....', '.###.', '.....', '.###.', '.....'],
    loose: ['#...#', '..#..', '#...#', '..#..', '#...#', '.....'],
  };
  for (const [name, rows] of Object.entries(glyphs)) {
    const g = new Px(7, 8);
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && g.set(x + 1, y + 1, ch === '+' ? '#9a8a64' : '#e8e0c8')));
    g.outline(OUT);
    s.put(`glyph_${name}`, g, 3, 7);
  }
  for (let t = 0; t < 2; t++) {
    const k = new Px(4, 6);
    const lean = t === 0 ? 1 : -1;
    k.line(1.5 - lean, 5, 1.5 + lean, 1, '#5a3e24');
    k.set(1.5 + lean * 1.5, 0, '#8a6a44');
    k.outline(OUT);
    s.put(`stake${t}`, k, 2, 5);
  }
  for (let t = 0; t < 2; t++)
    for (let f = 0; f < 4; f++) {
      const left = t === 1;
      s.put(`ban${t}_${f}`, banner(armies[t]!, false, f, left), left ? 10 : 1, 21);
      s.put(`cmd${t}_${f}`, banner(armies[t]!, true, f, left), left ? 10 : 1, 21);
      s.put(`torn${t}_${f}`, banner(armies[t]!, false, f, left, true), left ? 10 : 1, 21);
      s.put(`torncmd${t}_${f}`, banner(armies[t]!, true, f, left, true), left ? 10 : 1, 21);
    }
  // A dropped standard: the pole in the dirt, the cloth crumpled beside it.
  for (let t = 0; t < 2; t++)
    for (const command of [false, true]) {
      const p = new Px(18, 7);
      p.line(0, 5, 15, 2, '#3a2a1a');
      p.set(16, 2, '#c9a24a');
      const c = colours(armies[t]!, command);
      const base = c.base;
      const shade = c.shade;
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 3; j++) p.set(9 + i, 3 + j - (i > 3 ? 1 : 0), (i + j) % 3 === 0 ? shade : base);
      p.set(11, 4, c.mark);
      p.outline(OUT);
      s.put(`dropped${command ? 'cmd' : ''}${t}`, p, 8, 5);
    }

  for (let v = 0; v < 3; v++) {
    const add = (name: string, [p, ax, ay]: [Px, number, number]) => s.put(name, p, ax, ay);
    add(`cypress${v}`, cypress(r, v));
    add(`olive${v}`, olive(r, v));
    add(`boulder${v}`, boulder(r, v));
    add(`ruin${v}`, ruin(r, v));
    add(`bush${v}`, bush(r, v));
    add(`deadtree${v}`, deadTree());
    add(`column${v}`, column());
  }
  return {
    canvas: s.canvas,
    get: (name) => {
      const g = s.regions.get(name);
      if (!g) throw new Error(`fx: no ${name}`);
      return g;
    },
  };
}
