// Pixel painting for the commandery: a small software rasteriser for isometric boxes, roofs and
// cones, with a depth buffer, so buildings are painted pixel by pixel and stay crisp.
//
// World space is (u, v, z): u runs down-right on screen, v down-left, z up. One unit of u or v is
// one screen pixel across and half a pixel down (2:1 isometric), one unit of z is one pixel up.
// Anything nearer the viewer has a larger u + v + z.

export const WORLD_W = 512;
export const WORLD_H = 288;
/** Screen position of the world origin (the north corner of the walls). */
export const OX = 256;
export const OY = 30;

export interface V3 {
  u: number;
  v: number;
  z: number;
}

export const sx = (u: number, v: number) => OX + u - v;
export const sy = (u: number, v: number, z = 0) => OY + (u + v) / 2 - z;
/**
 * How a pixel buffer maps the world: a buffer pixel is ((sx + mx) * k, (sy + my) * k). Classic is
 * the original 512×288 buffer; HD paints at twice the density with a margin, 1280×720, so a
 * 2560×1440 screen shows it at exactly 2× and every zoom step is a whole number.
 */
export interface Frame {
  k: number;
  mx: number;
  my: number;
  w: number;
  h: number;
}
export const CLASSIC: Frame = { k: 1, mx: 0, my: 0, w: WORLD_W, h: WORLD_H };
export const HD: Frame = { k: 2, mx: 64, my: 36, w: 1280, h: 720 };

/** Ground point under a screen pixel. */
export const groundAt = (x: number, y: number): [number, number] => {
  const a = x - OX;
  const b = 2 * (y - OY);
  return [(a + b) / 2, (b - a) / 2];
};

// ------------------------------------------------------------------ colour

/** Colours are packed 0xAABBGGRR, ImageData's byte order on little-endian machines. */
export type Col = number;

export function hex(h: string): Col {
  const n = parseInt(h.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}
export function rgb(r: number, g: number, b: number, a = 255): Col {
  return (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
export const R = (c: Col) => c & 255;
export const G = (c: Col) => (c >>> 8) & 255;
export const B = (c: Col) => (c >>> 16) & 255;
export function css(c: Col): string {
  return `rgb(${R(c)},${G(c)},${B(c)})`;
}
export function mix(a: Col, b: Col, t: number): Col {
  return rgb(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, B(a) + (B(b) - B(a)) * t);
}
const COOL = hex('#1c1a2e');
const WARM = hex('#fff1c8');
/** Darker with a cool shift (k > 0), or lighter with a warm one (k < 0): pixel-art hue shifting. */
export function tone(c: Col, k: number): Col {
  return k >= 0 ? mix(c, COOL, Math.min(1, k)) : mix(c, WARM, Math.min(1, -k));
}
export function hslCol(h: number, s: number, l: number): Col {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgb(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

/** Integer hash of a lattice point, for stable texture noise. */
export function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ the pixel buffer

export class Px {
  readonly data: Uint32Array;
  /** Pixels per world unit, and the margin (world pixels) before the world's origin. */
  readonly k: number;
  readonly mx: number;
  readonly my: number;
  readonly depth: Float32Array;
  /**
   * Light class per pixel, for the night rig: 0 detail (posts, lines, stamps), 1 lit plane, 2 half
   * lit, 3 shade plane (from each face's normal against the key light), 4 outline.
   */
  readonly cls: Uint8Array;
  /** The region written since the last clear (inclusive), so clearing and scanning stay cheap. */
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -1;
  private y1 = -1;
  constructor(
    readonly w: number,
    readonly h: number,
    frame?: Frame,
  ) {
    this.k = frame?.k ?? 1;
    this.mx = frame?.mx ?? 0;
    this.my = frame?.my ?? 0;
    this.data = new Uint32Array(w * h);
    this.depth = new Float32Array(w * h).fill(-1e9);
    this.cls = new Uint8Array(w * h);
  }
  private touch(x: number, y: number): void {
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }
  clear(): void {
    if (this.x1 < 0) return;
    for (let y = this.y0; y <= this.y1; y++) {
      this.data.fill(0, y * this.w + this.x0, y * this.w + this.x1 + 1);
      this.depth.fill(-1e9, y * this.w + this.x0, y * this.w + this.x1 + 1);
      // The light classes too: a painter that reads a neighbour's class (undead sunlit) must not
      // see the last building's, or a building's art would depend on what was painted before it.
      this.cls.fill(0, y * this.w + this.x0, y * this.w + this.x1 + 1);
    }
    this.x0 = this.y0 = Infinity;
    this.x1 = this.y1 = -1;
  }
  get(x: number, y: number): Col {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x]!;
  }
  set(x: number, y: number, c: Col): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
    this.cls[y * this.w + x] = 0;
    this.touch(x, y);
  }
  /** Buffer x of a world point. */
  X(u: number, v: number): number {
    return (sx(u, v) + this.mx) * this.k;
  }
  /** Buffer y of a world point. */
  Y(u: number, v: number, z = 0): number {
    return (sy(u, v, z) + this.my) * this.k;
  }
  /** The world ground point under a buffer pixel's centre. */
  ground(x: number, y: number): [number, number] {
    return groundAt((x + 0.5) / this.k - this.mx, (y + 0.5) / this.k - this.my);
  }
  /** Set if nearer than what is there (depth u+v+z). */
  plot(x: number, y: number, d: number, c: Col): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (d < this.depth[i]! - 0.01) return;
    this.depth[i] = d;
    this.data[i] = c;
    this.cls[i] = 0;
    this.touch(x, y);
  }
  rect(x: number, y: number, w: number, h: number, c: Col): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Blend a translucent colour over what is there (a = 0..1). */
  tint(x: number, y: number, c: Col, a: number): void {
    const o = this.get(x, y);
    if (!o) return;
    this.set(x, y, mix(o, c, a));
  }
  /** A world point, depth tested. */
  point(p: V3, c: Col): void {
    this.plot(Math.floor(this.X(p.u, p.v)), Math.floor(this.Y(p.u, p.v, p.z)), p.u + p.v + p.z, c);
  }
  /**
   * A planar patch o + s·a + t·b (s, t in 0..1, or the triangle s + t ≤ 1), rasterised in screen
   * space. The shader gets the patch coordinates in world units along a and b and the world point,
   * and returns a colour or 0 to leave the pixel alone.
   */
  quad(o: V3, a: V3, b: V3, shade: (s: number, t: number, p: V3) => Col, tri = false): void {
    const k = this.k;
    const ax = (a.u - a.v) * k;
    const ay = ((a.u + a.v) / 2 - a.z) * k;
    const bx = (b.u - b.v) * k;
    const by = ((b.u + b.v) / 2 - b.z) * k;
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-6) return;
    const ox = this.X(o.u, o.v);
    const oy = this.Y(o.u, o.v, o.z);
    const xs = [ox, ox + ax, ox + bx, ox + ax + bx];
    const ys = [oy, oy + ay, oy + by, oy + ay + by];
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(...xs)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)) + 1);
    const la = Math.hypot(a.u, a.v, a.z);
    const lb = Math.hypot(b.u, b.v, b.z);
    const ea = 0.35 / Math.max(1, Math.hypot(ax, ay));
    const eb = 0.35 / Math.max(1, Math.hypot(bx, by));
    const p: V3 = { u: 0, v: 0, z: 0 };
    const lc = lightClass(a, b);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - ox;
        const dy = y + 0.5 - oy;
        const s = (dx * by - dy * bx) / det;
        const t = (ax * dy - ay * dx) / det;
        if (s < -ea || t < -eb || s > 1 + ea || t > 1 + eb) continue;
        if (tri && s + t > 1 + Math.max(ea, eb)) continue;
        const sc = Math.max(0, Math.min(1, s));
        const tc = Math.max(0, Math.min(1, t));
        p.u = o.u + sc * a.u + tc * b.u;
        p.v = o.v + sc * a.v + tc * b.v;
        p.z = o.z + sc * a.z + tc * b.z;
        const d = p.u + p.v + p.z;
        const i = y * this.w + x;
        if (d < this.depth[i]! - 0.01) continue;
        const c = shade(sc * la, tc * lb, p);
        if (!c) continue;
        this.depth[i] = d;
        this.data[i] = c;
        this.cls[i] = lc;
        this.touch(x, y);
      }
  }
  /** One-pixel outline around everything painted, skipping pixels marked transparent. */
  outline(c: Col, onlyBelow = Infinity): void {
    const add: number[] = [];
    const { w, h, data } = this;
    if (this.x1 < 0) return;
    const xa = Math.max(0, this.x0 - 1);
    const xb = Math.min(w - 1, this.x1 + 1);
    for (let y = Math.max(0, this.y0 - 1); y <= Math.min(h - 1, this.y1 + 1); y++)
      for (let x = xa; x <= xb; x++) {
        if (data[y * w + x]) continue;
        if (y > onlyBelow) continue;
        if ((x > 0 && data[y * w + x - 1]) || (x < w - 1 && data[y * w + x + 1]) || (y > 0 && data[(y - 1) * w + x]) || (y < h - 1 && data[(y + 1) * w + x])) add.push(y * w + x);
      }
    for (const i of add) {
      data[i] = c;
      this.cls[i] = 4;
      this.touch(i % w, Math.floor(i / w));
    }
  }
  /** Bounding box of painted pixels, or null. */
  bounds(): [number, number, number, number] | null {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    if (this.x1 < 0) return null;
    for (let y = this.y0; y <= this.y1; y++)
      for (let x = this.x0; x <= this.x1; x++)
        if (this.data[y * this.w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
  }
  /** Copy a region to a new canvas. */
  toCanvas(x0 = 0, y0 = 0, x1 = this.w, y1 = this.h): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, x1 - x0);
    c.height = Math.max(1, y1 - y0);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    const out = new Uint32Array(img.data.buffer);
    for (let y = y0; y < y1; y++) out.set(this.data.subarray(y * this.w + x0, y * this.w + x1), (y - y0) * c.width);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

// ------------------------------------------------------------------ solids

export const v3 = (u: number, v: number, z: number): V3 => ({ u, v, z });

/** Which way a face looks, for lighting from the top-left (the sun behind the viewer's left shoulder). */
export type Facing = 'top' | 'left' | 'right' | 'back';

export interface Shader {
  (face: Facing, s: number, t: number, p: V3): Col;
}

/** A ground footprint: [u0, v0, u1, v1, height] in world units. */
export type Footprint = [number, number, number, number, number];
let footprintSink: ((f: Footprint) => void) | null = null;
/**
 * Record the footprints of solids that stand on the ground (box, drum, frustum, posts) while `fn`
 * runs, so the prop placement (props.ts) and the cast shadows (ground-hd.ts) know where buildings
 * stand without each kit listing them. Paints nothing.
 */
export function recordFootprints<T>(fn: () => T, out: Footprint[]): T {
  const prev = footprintSink;
  footprintSink = (f) => out.push(f);
  try {
    return fn();
  } finally {
    footprintSink = prev;
  }
}
/** Pause recording (scaffolding and other passing things). */
export function unrecorded<T>(fn: () => T): T {
  const prev = footprintSink;
  footprintSink = null;
  try {
    return fn();
  } finally {
    footprintSink = prev;
  }
}
export function noteFootprint(u0: number, v0: number, u1: number, v1: number, z0: number, h: number): void {
  if (footprintSink && z0 < 1.5 && h > 0.5) footprintSink([Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), z0 + h]);
}

/** An axis-aligned box: its three visible faces. s runs along the face, t up it (or along v on top). */
export function box(px: Px, u0: number, v0: number, z0: number, lu: number, lv: number, h: number, shade: Shader, top = true): void {
  noteFootprint(u0, v0, u0 + lu, v0 + lv, z0, h);
  // Left face (v = v0 + lv), s along u.
  px.quad(v3(u0, v0 + lv, z0), v3(lu, 0, 0), v3(0, 0, h), (s, t, p) => shade('left', s, t, p));
  // Right face (u = u0 + lu), s along v from the far end toward the viewer.
  px.quad(v3(u0 + lu, v0, z0), v3(0, lv, 0), v3(0, 0, h), (s, t, p) => shade('right', s, t, p));
  if (top) px.quad(v3(u0, v0, z0 + h), v3(lu, 0, 0), v3(0, lv, 0), (s, t, p) => shade('top', s, t, p));
}

/**
 * A gabled roof over a box. Ridge along u when `alongU`, else along v. `o` is the eave overhang,
 * `rh` the ridge height above the eaves. The shader gets the slope's facing, s along the ridge,
 * t up the slope from the eave (in units), or 'left'/'right' for the gable ends.
 */
export function gable(px: Px, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, alongU: boolean, o: number, roof: Shader, gableEnd: Shader): void {
  if (alongU) {
    const vm = v0 + lv / 2;
    // Back slope (facing -v), then front slope (facing +v, toward the viewer's left).
    px.quad(v3(u0 - o, v0 - o, z - o * 0.6), v3(lu + 2 * o, 0, 0), v3(0, lv / 2 + o, rh + o * 0.6), (s, t, p) => roof('back', s, t, p));
    px.quad(v3(u0 - o, v0 + lv + o, z - o * 0.6), v3(lu + 2 * o, 0, 0), v3(0, -(lv / 2 + o), rh + o * 0.6), (s, t, p) => roof('left', s, t, p));
    // Gable end facing +u (right): a triangle on the wall plane.
    px.quad(v3(u0 + lu, v0, z), v3(0, lv, 0), v3(0, lv / 2, rh), (s, t, p) => gableEnd('right', s, p.z - z, p), true);
    void vm;
  } else {
    // Ridge along v: slopes face -u (back) and +u (right); the gable end faces +v (left).
    px.quad(v3(u0 - o, v0 - o, z - o * 0.6), v3(0, lv + 2 * o, 0), v3(lu / 2 + o, 0, rh + o * 0.6), (s, t, p) => roof('back', s, t, p));
    px.quad(v3(u0 + lu + o, v0 - o, z - o * 0.6), v3(0, lv + 2 * o, 0), v3(-(lu / 2 + o), 0, rh + o * 0.6), (s, t, p) => roof('right', s, t, p));
    px.quad(v3(u0, v0 + lv, z), v3(lu, 0, 0), v3(lu / 2, 0, rh), (s, t, p) => gableEnd('left', s, p.z - z, p), true);
  }
}

/** A pyramid (hipped) roof or spire over a square, apex at height rh above z. */
export function pyramid(px: Px, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, roof: Shader): void {
  const a = v3(u0 + lu / 2, v0 + lv / 2, z + rh);
  const c00 = v3(u0 - o, v0 - o, z - o * 0.5);
  const c10 = v3(u0 + lu + o, v0 - o, z - o * 0.5);
  const c11 = v3(u0 + lu + o, v0 + lv + o, z - o * 0.5);
  const c01 = v3(u0 - o, v0 + lv + o, z - o * 0.5);
  const tri = (p0: V3, p1: V3, f: Facing) =>
    px.quad(p0, v3(p1.u - p0.u, p1.v - p0.v, p1.z - p0.z), v3(a.u - p0.u, a.v - p0.v, a.z - p0.z), (s, t, p) => roof(f, s, t, p), true);
  tri(c00, c10, 'back');
  tri(c01, c00, 'back');
  tri(c01, c11, 'left');
  tri(c10, c11, 'right');
}

/** An upright cylinder of `n` facets (a round tower or the Temple rotunda), then a cone. */
export function drum(px: Px, cu: number, cv: number, z0: number, r: number, h: number, n: number, wall: Shader): void {
  noteFootprint(cu - r * 0.85, cv - r * 0.85, cu + r * 0.85, cv + r * 0.85, z0, h);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = v3(cu + Math.cos(a0) * r, cv + Math.sin(a0) * r, z0);
    const p1 = v3(cu + Math.cos(a1) * r, cv + Math.sin(a1) * r, z0);
    // Normal direction decides the light: toward +v is lit, toward +u is shaded.
    const nm = (a0 + a1) / 2;
    const nu = Math.cos(nm);
    const nv = Math.sin(nm);
    const f: Facing = nu + nv < -0.3 ? 'back' : nv > nu + 0.35 ? 'left' : nu > nv + 0.35 ? 'right' : nv >= nu ? 'left' : 'right';
    const off = (i / n) * Math.PI * 2 * r;
    px.quad(p0, v3(p1.u - p0.u, p1.v - p0.v, 0), v3(0, 0, h), (s, t, p) => wall(f, off + s, t, p));
  }
}

export function cone(px: Px, cu: number, cv: number, z: number, r: number, rh: number, n: number, roof: Shader): void {
  const apex = v3(cu, cv, z + rh);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = v3(cu + Math.cos(a0) * r, cv + Math.sin(a0) * r, z);
    const p1 = v3(cu + Math.cos(a1) * r, cv + Math.sin(a1) * r, z);
    const nm = (a0 + a1) / 2;
    const nu = Math.cos(nm);
    const nv = Math.sin(nm);
    const f: Facing = nu + nv < -0.2 ? 'back' : nv > nu ? 'left' : 'right';
    const off = (i / n) * r * 6.283;
    px.quad(p0, v3(p1.u - p0.u, p1.v - p0.v, 0), v3(apex.u - p0.u, apex.v - p0.v, apex.z - p0.z), (s, t, p) => roof(f, off + s, t, p), true);
  }
}

/** A thin upright post (one or two pixels), depth tested. */
export function post(px: Px, u: number, v: number, z0: number, h: number, c: Col, c2?: Col): void {
  if (h >= 4) noteFootprint(u - 0.5, v - 0.5, u + 0.5, v + 0.5, z0, h);
  const x = Math.floor(px.X(u, v));
  const y = Math.floor(px.Y(u, v, z0));
  for (let k = 0; k < h * px.k; k++) {
    px.plot(x, y - k, u + v + z0 + k / px.k, c);
    if (c2) px.plot(x + 1, y - k, u + v + z0 + k / px.k, c2);
  }
}

/** A line between two world points, depth tested. */
export function line3(px: Px, a: V3, b: V3, c: Col): void {
  const x0 = px.X(a.u, a.v);
  const y0 = px.Y(a.u, a.v, a.z);
  const x1 = px.X(b.u, b.v);
  const y1 = px.Y(b.u, b.v, b.z);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    px.plot(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), a.u + (b.u - a.u) * t + a.v + (b.v - a.v) * t + a.z + (b.z - a.z) * t + 0.5, c);
  }
}

// ------------------------------------------------------------------ the night rig

/** Key light (sun by day, moon by night) from the upper left: lights +v faces and tops, not +u. */
const KEY = (() => {
  const l = [-0.2, 0.6, 0.77];
  const n = Math.hypot(l[0]!, l[1]!, l[2]!);
  return l.map((x) => x / n) as [number, number, number];
})();

/** The light class of a planar patch spanned by a and b: 1 lit, 2 half lit, 3 shade. */
export function lightClass(a: V3, b: V3): number {
  let nu = a.v * b.z - a.z * b.v;
  let nv = a.z * b.u - a.u * b.z;
  let nz = a.u * b.v - a.v * b.u;
  const l = Math.hypot(nu, nv, nz);
  if (l < 1e-9) return 0;
  // Face the viewer (nearer is larger u + v + z).
  if (nu + nv + nz < 0) {
    nu = -nu;
    nv = -nv;
    nz = -nz;
  }
  const d = (nu * KEY[0] + nv * KEY[1] + nz * KEY[2]) / l;
  return d >= 0.55 ? 1 : d >= 0.2 ? 2 : 3;
}

/**
 * Night as a palette and rig change (pixel-art-techniques §1.2, §5.5), not a multiply: the moon is
 * a cool key from the upper left. Lit planes keep their value with a cool shift, half-lit ones step
 * down once and shaded ones twice toward the ambient violet; the outline goes navy; and every edge
 * that faces the moon (sky above it, or sky to its left on an upright edge) gets a 1-px moonlit rim
 * in the colour of the face it bounds (§2.5). Each class maps a source colour to one colour, so the
 * night stays a palette, never a gradient.
 */
export interface NightRig {
  rim: Col;
  lit: Col;
  ambient: Col;
  shade: Col;
  line: Col;
}
export const NIGHT_RIG: NightRig = { rim: hex('#d6e2ff'), lit: hex('#a8b8e0'), ambient: hex('#3c4466'), shade: hex('#2a2448'), line: hex('#10122a') };

function scaleC(c: Col, k: number): Col {
  return rgb(R(c) * k, G(c) * k, B(c) * k);
}

/** The night version of a region of a painted buffer (see NightRig). */
export function nightCanvas(px: Px, x0: number, y0: number, x1: number, y1: number, rig: NightRig = NIGHT_RIG): HTMLCanvasElement {
  const { w, h, data, cls } = px;
  const c = document.createElement('canvas');
  c.width = Math.max(1, x1 - x0);
  c.height = Math.max(1, y1 - y0);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  const out = new Uint32Array(img.data.buffer);
  const memo = new Map<number, Col>();
  const at = (c0: Col, k: number): Col => {
    const key = c0 * 8 + k;
    let r = memo.get(key);
    if (r === undefined) {
      r =
        k === 1 ? mix(c0, rig.lit, 0.14)
        : k === 2 ? scaleC(mix(c0, rig.ambient, 0.2), 0.86)
        : k === 3 ? scaleC(mix(c0, rig.shade, 0.36), 0.66)
        : k === 4 ? mix(c0, rig.line, 0.5)
        : k === 5 ? mix(c0, rig.rim, 0.6)
        : mix(c0, rig.ambient, 0.12);
      memo.set(key, r);
    }
    return r;
  };
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const col = data[i]!;
      if (!col) continue;
      const up = y === 0 || !data[i - w];
      const left = x === 0 || !data[i - 1];
      const down = y < h - 1 && !!data[i + w];
      let k = cls[i]!;
      let base = col;
      if (up || (left && down)) {
        k = 5;
        // An outline pixel takes the colour of the face it bounds.
        if (cls[i] === 4) {
          const j = up && y < h - 1 ? i + w : x < w - 1 ? i + 1 : i;
          if (data[j] && cls[j] !== 4) base = data[j]!;
        }
      }
      out[(y - y0) * c.width + (x - x0)] = at(base, k);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}
