// The HD townsfolk's painting kit: per-figure materials built as hue-shifted ramps under the
// town's own light (a warm key from the upper left, a cool violet ambient in the shade), the
// finishing pass that turns a paper-doll canvas (paper/core.ts) into coloured pixels closed by a
// coloured outline, and the atlas the finished frames are packed into, by day and by night.
//
// Figures are drawn with the paper painter's primitives (rods, blobs, polygons filled by pixel
// centre, contact lines and small-cluster cleanup), one canvas pixel to one art pixel of the HD
// city (half a world pixel). Each frame is painted once, when it is first needed, and kept.

import { oklchRamp, Paper, rgbOklab, type LightRig, type P2, type RGB } from '../paper/core.ts';
import { B, G, hex, mix, nightCanvas, Px, R, rgb, type Col, type NightRig } from './pixels.ts';

/** Material ids for the folk start here, clear of the battle painter's shared table. */
const MAT0 = 1000;
const DEG = Math.PI / 180;

/**
 * The town's light, per faction: the key is the low golden sun of the commandery, the paler
 * afternoon of the castle town, and the necropolis's thin greenish overcast; shadows go violet.
 */
export function folkRig(id: string): LightRig {
  if (id === 'undead') return { keyHue: 120, keyChroma: 0.03, ambientHue: 295, ambientChroma: 0.06 };
  if (id === 'samurai') return { keyHue: 80, keyChroma: 0.06, ambientHue: 268, ambientChroma: 0.06 };
  return { keyHue: 72, keyChroma: 0.075, ambientHue: 282, ambientChroma: 0.055 };
}

/** A figure's materials: each base colour becomes a five-step ramp (tone 2 is the colour itself). */
export class Mats {
  readonly ramps: RGB[][] = [];
  readonly keep: boolean[] = [];
  private byKey = new Map<string, number>();
  constructor(readonly rig: LightRig) {}
  /** The material for a base colour; `spread` is the lightness step (bigger for metal). */
  of(c: Col, spread = 0.075, keep = false): number {
    const key = `${c}:${spread}:${keep ? 1 : 0}`;
    let m = this.byKey.get(key);
    if (m === undefined) {
      const rgbC: RGB = [R(c), G(c), B(c)];
      let ramp: RGB[];
      if (keep) ramp = [rgbC, rgbC, rgbC, rgbC, rgbC];
      else {
        const [l, a, b] = rgbOklab(rgbC);
        ramp = oklchRamp({ l, c: Math.hypot(a, b), h: Math.atan2(b, a) / DEG, spread, rig: this.rig });
        ramp[2] = rgbC;
      }
      m = MAT0 + this.ramps.length;
      this.ramps.push(ramp);
      this.keep.push(keep);
      this.byKey.set(key, m);
    }
    return m;
  }
  /** A pixel code: material and tone 0..4. */
  code(m: number, t: number): number {
    return m * 8 + Math.max(0, Math.min(4, Math.round(t)));
  }
}

/** A finished frame: trimmed RGBA, light classes for the night rig, and the foot point inside it. */
export interface Sprite {
  w: number;
  h: number;
  data: Uint32Array;
  cls: Uint8Array;
  /** The foot point (the left edge of the foot pixel column, the bottom of the foot row + 1). */
  fx: number;
  fy: number;
}

const OUT = hex('#1a1216');

/**
 * Finish a painted canvas: codes to colours, then a one-pixel outline round the silhouette in a
 * dark of the colour it bounds (the darkest tone on the lit upper-left side, darker still toward
 * the lower right), never pure black (pixel-art-craft §0). Light classes follow the tone: lit,
 * half, shade, outline; glows and inks are detail (0) and keep their colour at night.
 */
export function finish(p: Paper, mats: Mats, outline: Col = OUT): Sprite | null {
  const { CW, CH, pix } = p;
  let x0 = CW, y0 = CH, x1 = -1, y1 = -1;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++)
      if (pix[y * CW + x]! >= 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  x0 -= 1;
  y0 -= 1;
  x1 += 1;
  y1 += 1;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint32Array(w * h);
  const cls = new Uint8Array(w * h);
  const colOf = (v: number): Col => {
    const r = mats.ramps[(v >> 3) - MAT0];
    if (!r) return OUT;
    const c = r[v & 7]!;
    return rgb(c[0], c[1], c[2]);
  };
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= CW || y >= CH ? -1 : pix[y * CW + x]!);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y - y0) * w + (x - x0);
      const v = at(x, y);
      if (v >= 0) {
        data[i] = colOf(v);
        const kept = mats.keep[(v >> 3) - MAT0];
        const t = v & 7;
        cls[i] = kept ? 0 : t >= 3 ? 1 : t === 2 ? 2 : 3;
        continue;
      }
      // Outline: the side facing the light (the pixel is left of or above the figure) takes a
      // step below the edge pixel's own tone (at least tone 1): a coloured, lighter line; the
      // shade side takes the material's darkest tone, pulled toward the outline colour.
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      const nb = [r, d, l, u].find((n) => n >= 0 && !mats.keep[(n >> 3) - MAT0]) ?? [r, d, l, u].find((n) => n >= 0);
      if (nb === undefined) continue;
      const ramp = mats.ramps[(nb >> 3) - MAT0];
      const dark = ramp?.[0];
      const base = dark ? rgb(dark[0], dark[1], dark[2]) : OUT;
      const lit = (r >= 0 || d >= 0) && l < 0 && u < 0;
      const kept = mats.keep[(nb >> 3) - MAT0];
      if (lit && ramp && !kept) {
        // Facing the light: the material's tone 1 (sel-out), one colour per material so the line
        // stays a clean run (a tone that followed the edge pixel speckled it with orphans).
        const c = ramp[1]!;
        data[i] = mix(rgb(c[0], c[1], c[2]), base, 0.35);
      } else data[i] = lit ? base : mix(base, outline, 0.6);
      cls[i] = 4;
    }
  return { w, h, data, cls, fx: p.FX - x0, fy: p.FY - y0 };
}

// ------------------------------------------------------------------ painting helpers

/** Integer point. */
export const ip = (p: P2): P2 => [Math.round(p[0]), Math.round(p[1])];
/** A direction for an angle in the rig's convention (0 down, 90 forward, 180 up), snapped to 7.5°. */
export const dirOf = (deg: number): P2 => {
  const a = Math.round(deg / 7.5) * 7.5 * DEG;
  return [Math.sin(a), Math.cos(a)];
};
export const step = (p: P2, deg: number, len: number): P2 => {
  const d = dirOf(deg);
  return [p[0] + d[0] * len, p[1] + d[1] * len];
};

/** Plot one pixel at figure coordinates (units = pixels, origin at the foot point). */
export function dot(c: Paper, x: number, y: number, code: number): void {
  c.order++;
  c.plot(Math.floor(c.sx(x)), Math.floor(c.sy(y)), code);
}

// ------------------------------------------------------------------ the atlas

export interface Cell {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Foot point inside the cell, in art pixels. */
  fx: number;
  fy: number;
  /** Its mirror image (west-facing), made on first use. */
  m?: Cell;
}

/**
 * Finished frames packed on shelves into a few large pages, with a night twin of every page
 * (the building night rig applied per frame, buildings.ts), so a frame is one drawImage.
 */
export class FolkAtlas {
  readonly pages: HTMLCanvasElement[] = [];
  readonly nights: HTMLCanvasElement[] = [];
  private cells = new Map<string, Cell>();
  private sx = 0;
  private sy = 0;
  private rowH = 0;
  /** Frames painted so far, and the milliseconds that took (for the perf report). */
  painted = 0;
  paintMs = 0;
  constructor(
    readonly night: NightRig,
    readonly W = 1024,
    readonly H = 512,
  ) {}

  get(key: string): Cell | undefined {
    return this.cells.get(key);
  }
  has(key: string): boolean {
    return this.cells.has(key);
  }

  /** Room for a w×h cell on the shelves (a new page when the last one is full). */
  private place(w: number, h: number): { page: number; x: number; y: number } {
    if (this.sx + w + 1 > this.W) {
      this.sx = 0;
      this.sy += this.rowH + 1;
      this.rowH = 0;
    }
    if (!this.pages.length || this.sy + h + 1 > this.H) this.newPage();
    const at = { page: this.pages.length - 1, x: this.sx, y: this.sy };
    this.sx += w + 1;
    this.rowH = Math.max(this.rowH, h);
    return at;
  }

  add(key: string, s: Sprite): Cell {
    const cell: Cell = { ...this.place(s.w, s.h), w: s.w, h: s.h, fx: s.fx, fy: s.fy };
    const page = cell.page;
    const ctx = this.pages[page]!.getContext('2d')!;
    const img = ctx.createImageData(s.w, s.h);
    new Uint32Array(img.data.buffer).set(s.data);
    ctx.putImageData(img, cell.x, cell.y);
    const px = new Px(s.w, s.h);
    px.data.set(s.data);
    px.cls.set(s.cls);
    const nc = nightCanvas(px, 0, 0, s.w, s.h, this.night);
    // The night rig gives the outline its moonlit rim; detail pixels (glows) keep their colour.
    this.nights[page]!.getContext('2d')!.drawImage(nc, cell.x, cell.y);
    this.cells.set(key, cell);
    return cell;
  }

  /** The mirror image of a cell, copied flipped into the atlas once (so a draw needs no transform). */
  private mirrorOf(c: Cell): Cell {
    if (c.m) return c.m;
    const m: Cell = { ...this.place(c.w, c.h), w: c.w, h: c.h, fx: c.w - c.fx, fy: c.fy };
    for (const [src, dst] of [[this.pages, this.pages], [this.nights, this.nights]] as const) {
      const g = dst[m.page]!.getContext('2d')!;
      g.save();
      g.translate(m.x + m.w, m.y);
      g.scale(-1, 1);
      g.drawImage(src[c.page]!, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      g.restore();
    }
    c.m = m;
    return m;
  }

  private newPage(): void {
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = this.W;
      c.height = this.H;
      return c;
    };
    this.pages.push(mk());
    this.nights.push(mk());
    this.sx = 0;
    this.sy = 0;
    this.rowH = 0;
  }

  /** Bytes held by the pages (RGBA, day and night). */
  bytes(): number {
    return this.pages.length * 2 * this.W * this.H * 4;
  }

  /**
   * Draw a cell with its foot at world (X, Y) in a context whose unit is a world pixel and art
   * pixels are 1/k of it; mirrored about the foot line for the west-facing directions; the night
   * twin laid over at `night` opacity.
   */
  blit(g: CanvasRenderingContext2D, c0: Cell, X: number, Y: number, k: number, mirror: boolean, night: number): void {
    const c = mirror ? this.mirrorOf(c0) : c0;
    const dw = c.w / k, dh = c.h / k;
    const top = Y - c.fy / k;
    const one = (img: HTMLCanvasElement) => g.drawImage(img, c.x, c.y, c.w, c.h, X - c.fx / k, top, dw, dh);
    if (night < 0.99) one(this.pages[c.page]!);
    if (night > 0.01) {
      const a = g.globalAlpha;
      g.globalAlpha = a * (night >= 0.99 ? 1 : night);
      one(this.nights[c.page]!);
      g.globalAlpha = a;
    }
  }
}

/**
 * An ellipse shaded like `Paper.blob` (a lit cluster up and left, a shadow crescent down and
 * right), in figure units, painting only the pixels `keep(nx, ny)` allows (nx, ny in -1..1).
 */
export function oval(c: Paper, M: Mats, ctr: P2, rx: number, ry: number, m: number, keep: (nx: number, ny: number) => boolean, base = 2): void {
  const cx = c.sx(ctr[0]), cy = c.sy(ctr[1]);
  const pts: P2[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  c.poly(pts, (x, y) => {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (!keep(nx, ny)) return -1;
    const lx = c.litX(nx);
    const lit = Math.hypot(lx + 0.38, ny + 0.38);
    const dk = lx * 0.7 + ny * 0.7;
    if (lit < 0.62) return M.code(m, base + 1);
    if (dk > 0.72) return M.code(m, base - 2);
    if (dk > 0.32) return M.code(m, base - 1);
    return M.code(m, base);
  });
}
