// The Samurai castle town's clutter and light, HD only: the props that make a jōkamachi lived in
// (komodaru sake barrels, tawara rice bales, oke buckets and the tenbōsui fire barrels, chōchin
// lanterns, nobori banners, kanban signboards, handcarts, bamboo fences, stone basins, a well with
// its pulley, hasa rice racks, pines, cherries, azaleas, wisteria and vines, bonsai), the shrine's
// furniture (tōrō, komainu, an ema rack, a shimenawa), the castle's raked gravel and stepping
// stones, and the light: a warm sun and cool shade on every face, dappled shade under the trees,
// and lanterns and shōji that glow warm in the eave shadows (by day a little, by night fully).
// References: docs/art-references/samurai-city.md (the "Detail pass" section).
//
// Props are painted into the shared Painter as their own small arts (`cluster`), so people sort
// in front of and behind them by depth; ground decals (gravel, stones, tree shade) are one flat
// art under everything (`decal`).

import type { Art, BuildingParts, Painter } from './buildings.ts';
import { registerProp, registerTheme, SUN as CAST, type Group } from './props.ts';
import type { CityStyle } from './style.ts';
import { box, drum, hash, hex, line3, mix, post, Px, rgb, tone, v3, type Col, type Facing, type V3 } from './pixels.ts';
import { frustum, hip, tri3 } from './solids.ts';
import type { Ramp } from './style.ts';

/**
 * What the painters draw with: a building Painter (its px, density and style), or a prop's
 * context from props.ts (`ctx(a)`). Emissive pixels go to the Painter's lights, or, for a prop,
 * become the library's flame colours, which paintProps lights (and its `lights` get halos).
 */
export interface PP {
  readonly px: Px;
  readonly k: number;
  readonly st: CityStyle;
  lights?: V3[];
}
/** The drawing context of a prop from props.ts. */
export const ctx = (a: { px: Px; st: CityStyle; lights: V3[] }): PP => ({ px: a.px, k: a.px.k, st: a.st, lights: a.lights });
/** The colours props.ts lights at night (and a little by day). */
const FLAME = hex('#ffd27a');
const FLAME2 = hex('#ff9a3a');

// ------------------------------------------------------------------ palette

const ramp = (a: string, b: string, c: string, d: string): Ramp => [hex(a), hex(b), hex(c), hex(d)];
export const PAL = {
  straw: ramp('#e6cf8e', '#c7a865', '#977a48', '#5e4a30'),
  rope: hex('#8a6a3c'),
  paperW: ramp('#f6efdc', '#e2d6b8', '#b4a88e', '#7a705e'),
  red: ramp('#e0583c', '#c23c2a', '#8c2620', '#561a1a'),
  indigo: ramp('#4a5f8e', '#34466e', '#24304e', '#161c30'),
  pine: ramp('#7f9a4a', '#4f7038', '#2f4a2c', '#1a2a20'),
  leaf: ramp('#9ab452', '#6a8a3c', '#3f5a2e', '#22331f'),
  sakura: ramp('#fde0e6', '#f2b0c2', '#d0809a', '#8e5068'),
  azalea: ramp('#ff9ac0', '#e8588e', '#b03466', '#6e2040'),
  wisteria: ramp('#d8c4f4', '#b496e0', '#8668b8', '#4e3e7a'),
  bamboo: ramp('#c8c06a', '#a09a48', '#6e6a34', '#3e3c22'),
  bronze: ramp('#9ab08a', '#6a8670', '#46604e', '#28382e'),
  water: hex('#2a3c4a'),
  gravel: ramp('#fde8b8', '#efd09c', '#c6a47a', '#8a7058'),
  moss: hex('#6a7a3a'),
  iron: hex('#3a3a42'),
};

/** Light from a world-space normal against the key (upper left): -1 (away) .. 1 (facing). */
const KEY = [-0.2 / 0.996, 0.6 / 0.996, 0.77 / 0.996] as const;
export const lightOf = (nu: number, nv: number, nz: number): number => {
  const l = Math.hypot(nu, nv, nz) || 1;
  return (nu * KEY[0] + nv * KEY[1] + nz * KEY[2]) / l;
};
/** A ramp step for a light value: highlight, lit, shade, deep. */
export const step = (r: Ramp, l: number): Col => r[l > 0.62 ? 0 : l > 0.25 ? 1 : l > -0.15 ? 2 : 3]!;
/** The step of a ramp for a flat face. */
export const faceCol = (r: Ramp, f: Facing, k = 0): Col => r[Math.min(3, (f === 'top' ? 0 : f === 'left' ? 1 : 2) + k)]!;

// ------------------------------------------------------------------ sun, shade and glow

/** A tree whose canopy shades what is under it: centre, canopy radius and canopy height. */
export interface Tree {
  u: number;
  v: number;
  r: number;
  h: number;
}

/**
 * The trees of the town (fixed; the keep's art paints them). Every building's walls and roofs take
 * the dappled shade of these canopies, so plaster and tile are broken by leaf shadow where a pine
 * stands near, as in the user's golden-hour target.
 */
export const TREES: (Tree & { kind: 'pine' | 'sakura' | 'maple' })[] = [
  { u: 66, v: 24, r: 6, h: 14, kind: 'pine' },
  { u: 144, v: 16, r: 5, h: 12, kind: 'sakura' },
  { u: 28, v: 64, r: 5, h: 13, kind: 'pine' },
  { u: 72, v: 206, r: 6, h: 14, kind: 'pine' },
  { u: 92, v: 218, r: 5, h: 12, kind: 'sakura' },
  { u: 150, v: 212, r: 5, h: 11, kind: 'maple' },
  { u: 220, v: 196, r: 6, h: 14, kind: 'pine' },
  { u: 220, v: 30, r: 5, h: 12, kind: 'sakura' },
  { u: 160, v: 128, r: 4, h: 14, kind: 'pine' },
];

/**
 * Sun at a world point: -1 in leaf shade, 1 in a sun fleck at a canopy's edge, 0 in open sun. The
 * point is walked toward the sun to the height of each canopy; the canopy is lumpy (clusters a
 * unit and a half across) with holes the sun comes through.
 */
export function sunAt(p: V3): number {
  let out = 0;
  for (const t of TREES) {
    if (p.z >= t.h) continue;
    // Walk back up the sun's cast (props.ts SUN, the ground shadows' direction) to the canopy.
    const s = t.h - p.z;
    const qu = p.u - CAST[0] * s;
    const qv = p.v - CAST[1] * s;
    const du = qu - t.u;
    const dv = qv - t.v;
    const d = Math.hypot(du, dv);
    if (d > t.r * 1.3) continue;
    const cu = Math.floor(qu / 1.5);
    const cv = Math.floor(qv / 1.5);
    const r = t.r * (0.8 + hash(cu, cv, 71) * 0.4);
    if (d < r) {
      if (hash(cu, cv, 73) < 0.16 && d > t.r * 0.3) return 1;
      return -1;
    }
    if (d < r + 0.8) out = 1;
  }
  return out;
}

const SHADE = hex('#20245e');
const SUN = hex('#ffc25a');
/** A colour as the sun leaves it at p: leaf shade cool and deep, sun flecks warm. */
export function sunlit(c: Col, p: V3, f: Facing = 'left'): Col {
  const s = sunAt(p);
  if (s < 0) return mix(c, SHADE, f === 'right' ? 0.38 : 0.52);
  if (s > 0 && f !== 'right') return mix(c, SUN, 0.42);
  return c;
}

/** Emissive pixels of the art being painted: [x, y, day colour, light colour]. */
let EMIT: number[] = [];
/** A pixel that glows: drawn in its day colour, lit at night (and a little by day). */
export function emitAt(P: PP, p: V3, day: Col, light: Col = P.st.lit): Col {
  if (P.lights) {
    // A prop: the paper takes the flame colours props.ts lights (pale lit side, orange shade).
    const lum = (day & 255) + ((day >>> 8) & 255) + ((day >>> 16) & 255);
    return lum > 520 ? FLAME : lum > 260 ? FLAME2 : day;
  }
  EMIT.push(Math.floor(P.px.X(p.u, p.v)), Math.floor(P.px.Y(p.u, p.v, p.z)), day, light);
  return day;
}
/** A point that glows. */
export function glowPoint(P: PP, p: V3, day: Col, light: Col = P.st.lit): void {
  P.px.point(p, emitAt(P, p, day, light));
}

const WARM = hex('#ffc46c');
const COOL = hex('#24266c');
/**
 * Finish the art in P with the Samurai light: lit planes warmed toward the golden sun, half-lit a
 * touch cool and shaded planes pushed toward blue-violet (a strong warm/cool split), then the
 * outline and crop, then a lights canvas for every emissive pixel still showing.
 */
export function finishLit(P: Painter, depth: number, outline = true): Art {
  const px = P.px;
  const b = px.bounds();
  const glass = P.st.glass;
  const keep = new Set<number>();
  for (let i = 0; i < EMIT.length; i += 4) keep.add(EMIT[i + 1]! * px.w + EMIT[i]!);
  if (b) {
    const { w, data, cls } = px;
    for (let y = b[1]; y < b[3]; y++)
      for (let x = b[0]; x < b[2]; x++) {
        const i = y * w + x;
        const c = data[i]!;
        if (!c || c === glass || keep.has(i) || c >>> 24 !== 255) continue;
        const k = cls[i]!;
        data[i] = k === 1 ? mix(c, WARM, 0.4) : k === 2 ? mix(c, WARM, 0.14) : k === 3 ? mix(c, COOL, 0.48) : c;
      }
  }
  const art = P.finish(depth, outline);
  const emit = EMIT;
  EMIT = [];
  if (!art.canvas || (!emit.length && !art.lights)) return art;
  const cw = art.canvas.width;
  const ch = art.canvas.height;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  if (art.lights) g.drawImage(art.lights, 0, 0);
  const img = g.getImageData(0, 0, cw, ch);
  const out = new Uint32Array(img.data.buffer);
  // The glowing pixels themselves: paper, lantern, tōrō windows (and the windows P.finish lit).
  const src = new Uint8Array(cw * ch);
  for (let i = 0; i < out.length; i++) if (out[i]! >>> 24) src[i] = 1;
  for (let i = 0; i < emit.length; i += 4) {
    const x = emit[i]!;
    const y = emit[i + 1]!;
    if (px.get(x, y) !== emit[i + 2]) continue;
    const lx = x - art.x;
    const ly = y - art.y;
    if (lx < 0 || ly < 0 || lx >= cw || ly >= ch) continue;
    out[ly * cw + lx] = emit[i + 3]!;
    // Shōji paper glows and blooms; lanterns, andon and tōrō also throw a pool.
    src[ly * cw + lx] = emit[i + 3] === SHOJI_LIGHT ? 1 : 2;
  }
  pools(px, art.x, art.y, cw, ch, out, src);
  const gp = groundPools(px, art.x, art.y, cw, ch, src);
  if (gp) EXTRA.push(gp);
  g.putImageData(img, 0, 0);
  art.lights = c;
  // The light falls as pools on what is round it (baked above); the scene's generic round halo
  // is not wanted on these arts (see city.ts, `pooled`).
  (art as Art & { pooled?: boolean }).pooled = true;
  return art;
}

const POOL = hex('#ffc27a');
/** The light colour of shōji paper (samurai.ts PAPER_LIGHT): a broad soft glow, no pool. */
const SHOJI_LIGHT = hex('#ffd690');
/**
 * Light pools round each glowing source, baked into the lights canvas: the wall, eave and roof
 * pixels near a lantern or a lit shōji are raised up their ramp (warmer and brighter, two steps
 * falling off), the bare ground under it gets a soft warm patch, and the source a 1-pixel bloom.
 * The pool's edge is ragged (hashed per 2-pixel cell), it reaches further down than up (the
 * light falls), and it is cut where the surface turns away (the outline and the far side of an
 * outline stop it). No discs, no rings.
 */
function pools(px: Px, ax: number, ay: number, cw: number, ch: number, out: Uint32Array, src: Uint8Array): void {
  // One pool per 4×4 cell of sources, centred on them.
  const cells = new Map<number, [number, number, number, number]>();
  const depthAt = (x: number, y: number) => px.depth[(y + ay) * px.w + x + ax]!;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      if (src[y * cw + x] !== 2) continue;
      const key = (y >> 2) * 4096 + (x >> 2);
      const c = cells.get(key);
      const d = depthAt(x, y);
      if (c) {
        c[0] += x;
        c[1] += y;
        c[2]++;
        c[3] = Math.max(c[3], d);
      } else cells.set(key, [x, y, 1, d]);
    }
  const lift = new Float32Array(cw * ch);
  for (const [sx0, sy0, n, sd] of cells.values()) {
    const cx = sx0 / n;
    const cy = sy0 / n;
    const rx = 7 + Math.min(4, n * 0.4);
    const ry = 6 + Math.min(4, n * 0.4);
    for (let y = Math.max(0, Math.floor(cy - 2)); y < Math.min(ch, Math.ceil(cy + ry * 1.4)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(cw, Math.ceil(cx + rx)); x++) {
        const dy = y - cy;
        const e = ((x - cx) / rx) ** 2 + (dy / (dy < 0 ? ry * 0.6 : ry * 1.4)) ** 2;
        const rag = (hash((x + ax) >> 1, (y + ay) >> 1, 77) - 0.5) * 0.5;
        if (e > 1 + rag) continue;
        // Cut by geometry: nothing nearer the viewer than the source (an eave or a roof skirt in
        // front of a window) is lit by it.
        if (px.data[(y + ay) * px.w + x + ax] && Math.abs(depthAt(x, y) - sd) > 1.5) continue;
        const v = e < 0.35 + rag * 0.5 ? 2 : 1;
        if (v > lift[y * cw + x]!) lift[y * cw + x] = v;
      }
  }
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (src[i]) continue;
      const near = (x > 0 && src[i - 1]) || (x < cw - 1 && src[i + 1]) || (y > 0 && src[i - cw]) || (y < ch - 1 && src[i + cw]);
      const day = px.data[(y + ay) * px.w + x + ax]!;
      if (near && day) {
        // The bloom: one pixel round the source.
        out[i] = mix(day, POOL, 0.55);
        continue;
      }
      const l = lift[i]!;
      if (!l) continue;
      // (Bare ground is lit by groundPools, on its own art.)
      if (!day) continue;
      if (px.cls[(y + ay) * px.w + x + ax] === 4) continue;
      out[i] = mix(day, POOL, l > 1 ? 0.3 : 0.15);
    }
}

/** Ground-pool arts made by finishLit since the last take (the kit adds them to its parts). */
let EXTRA: Art[] = [];
export function takeExtra(): Art[] {
  const e = EXTRA;
  EXTRA = [];
  return e;
}

/**
 * The warm patches each light lays on the ground: every lantern, andon, tōrō, shōji and lit
 * window throws an iso ellipse (twice as wide as deep, ragged, two flat bands) centred on the
 * ground below it, which is found by walking down from the source to the foot of what it hangs
 * on. They go on their own art (a lights canvas over a transparent one, under everything else),
 * so a pool can reach past the building's own pixels; they cover only ground, never the
 * building's own walls or roofs.
 */
function groundPools(px: Px, ax: number, ay: number, cw: number, ch: number, src: Uint8Array): Art | null {
  const cells = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const s = src[y * cw + x]!;
      if (!s) continue;
      const key = Math.floor(y / 6) * 4096 + Math.floor(x / 6);
      const c = cells.get(key);
      if (c) {
        c[0] += x;
        c[1] += y;
        c[2]++;
        if (s === 2) c[3]++;
      } else cells.set(key, [x, y, 1, s === 2 ? 1 : 0]);
    }
  if (!cells.size) return null;
  const M = 18;
  const W = cw + 2 * M;
  const H = ch + 2 * M;
  const lift = new Uint8Array(W * H);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && !!px.data[(y + ay) * px.w + x + ax];
  for (const [sx0, sy0, n, lamps] of cells.values()) {
    const cx = Math.round(sx0 / n);
    let y = Math.round(sy0 / n);
    // Down to the foot of what the light hangs on (or just below a free-hanging lantern).
    while (solid(cx, y + 1) || solid(cx, y + 2)) y++;
    const lamp = lamps > n / 2;
    const gy = y + (lamp ? 4 : 2) + M;
    const gx = cx + M;
    const rx = lamp ? 12 : Math.min(12, 6 + n * 0.25);
    const ry = rx * 0.5;
    for (let yy = Math.max(0, Math.floor(gy - ry - 2)); yy < Math.min(H, Math.ceil(gy + ry + 2)); yy++)
      for (let xx = Math.max(0, Math.floor(gx - rx - 2)); xx < Math.min(W, Math.ceil(gx + rx + 2)); xx++) {
        if (solid(xx - M, yy - M)) continue;
        const e = ((xx - gx) / rx) ** 2 + ((yy - gy) / ry) ** 2;
        const rag = (hash((xx + ax) >> 1, (yy + ay) >> 1, 79) - 0.5) * 0.45;
        if (e > 1 + rag) continue;
        const v = e < 0.38 + rag * 0.5 ? 2 : 1;
        if (v > lift[yy * W + xx]!) lift[yy * W + xx] = v;
      }
  }
  const lights = new Px(W, H);
  let any = false;
  for (let i = 0; i < W * H; i++) {
    const v = lift[i]!;
    if (!v) continue;
    lights.data[i] = rgb(255, 188, 104, v > 1 ? 86 : 44);
    any = true;
  }
  if (!any) return null;
  const blank = document.createElement('canvas');
  blank.width = W;
  blank.height = H;
  return { canvas: blank, lights: lights.toCanvas(), night: null, x: ax - M, y: ay - M, d: -1e5, pooled: true } as Art;
}

/** Paint a group of props as their own art at depth d (P is reset before and after). */
export function cluster(P: Painter, parts: BuildingParts, d: number, draw: () => void): void {
  P.reset();
  EMIT = [];
  draw();
  const art = finishLit(P, d);
  if (art.canvas) parts.arts.push(art);
  P.reset();
}

/**
 * Ground decals (gravel, stepping stones, petals, the shade of trees) as one flat art under
 * everything else. Pixels may be translucent (shade); the decal has no night canvas of its own
 * (the scene's night grade darkens it with the ground).
 */
export function decal(P: Painter, parts: BuildingParts, draw: () => void): void {
  P.reset();
  EMIT = [];
  draw();
  const art = P.finish(-1e5, false);
  EMIT = [];
  art.night = null;
  if (art.canvas) parts.arts.push(art);
  P.reset();
}

// ------------------------------------------------------------------ small solids

/** A filled disc (a barrel top, a basin, a pad of moss) at height z. */
export function disc(P: PP, cu: number, cv: number, z: number, r: number, c: (p: V3, e: number) => Col): void {
  const st = 0.5 / P.k;
  const p = v3(0, 0, z);
  for (let u = -r; u <= r; u += st)
    for (let v = -r; v <= r; v += st) {
      const e = Math.hypot(u, v) / r;
      if (e > 1) continue;
      p.u = cu + u;
      p.v = cv + v;
      P.px.point(p, c(p, e));
    }
}

/** An upright cylinder with a lit top; `side` gets the light value, the height up it and the point. */
export function cyl(P: PP, cu: number, cv: number, z0: number, r: number, h: number, side: (l: number, t: number, p: V3, s: number) => Col, top?: (p: V3, e: number) => Col): void {
  const n = Math.max(8, Math.round(r * 6));
  drum(P.px, cu, cv, z0, r, h, n, (_f, s, t, p) => {
    const nu = p.u - cu;
    const nv = p.v - cv;
    return side(lightOf(nu, nv, 0) * 0.9 + 0.1, t, p, s);
  });
  if (top) disc(P, cu, cv, z0 + h, r, top);
}

/** A cylinder lying along u or v (a rice bale, a log), its axis at height zc. */
export function logAlong(P: PP, u: number, v: number, zc: number, len: number, r: number, alongU: boolean, side: (l: number, a: number, p: V3) => Col, end?: (p: V3, e: number) => Col): void {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    // The cross-section in (w, z), w across the axis.
    const w0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
    const w1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const nw = Math.cos(am);
    const nz = Math.sin(am);
    const l = alongU ? lightOf(0, nw, nz) : lightOf(nw, 0, nz);
    const o = alongU ? v3(u, v + w0, zc + z0) : v3(u + w0, v, zc + z0);
    const ax = alongU ? v3(len, 0, 0) : v3(0, len, 0);
    const bx = alongU ? v3(0, w1 - w0, z1 - z0) : v3(w1 - w0, 0, z1 - z0);
    P.px.quad(o, ax, bx, (s, _t, p) => side(l, s, p));
  }
  if (end) {
    // The near end cap (facing +u or +v), a disc in the vertical plane.
    const st = 0.5 / P.k;
    for (let a = -r; a <= r; a += st)
      for (let b = -r; b <= r; b += st) {
        const e = Math.hypot(a, b) / r;
        if (e > 1) continue;
        const p = alongU ? v3(u + len, v + a, zc + b) : v3(u + a, v + len, zc + b);
        P.px.point(p, end(p, e));
      }
  }
}

// ------------------------------------------------------------------ props

/** Komodaru: straw-wrapped sake casks, stacked in rows, each with a painted label and rope bands. */
export function komodaru(P: PP, u: number, v: number, cols: number, rows: number, alongU: boolean, seed = 0): void {
  const r = 1.6;
  const h = 3.3;
  const k = P.k;
  const H = Math.floor(h * k);
  const labels: Ramp[] = [PAL.red, ramp('#58a070', '#2f6a4a', '#1f4a34', '#12301f'), PAL.indigo, ramp('#f0c860', '#d0a030', '#9a7420', '#5e4614')];
  const ink = hex('#1e1a1c');
  const rope = ramp('#c8a46a', '#a07c48', '#76582e', '#4a361c');
  for (let row = 0; row < rows; row++)
    for (let c = 0; c < cols - row; c++) {
      const a = c * 3.3 + row * 1.65;
      const cu = alongU ? u + a : u;
      const cv = alongU ? v : v + a;
      const z = row * h;
      const lab = labels[Math.floor(hash(c, row, seed) * labels.length)]!;
      const glyph = Math.floor(hash(c, row, seed + 1) * 4);
      cyl(P, cu, cv, z, r, h, (l, tt, _p, s) => {
        const tz = Math.floor(tt * k);
        const sp = Math.floor(s * k);
        // The straw mat's rims, top and foot: strands in alternating columns.
        if (tz <= 1 || tz >= H - 1) return step(PAL.straw, l + (sp & 1 ? 0.18 : -0.12));
        // Two rope bands with a twist, and the rope ties running up the cask.
        if (tz === 2 || tz === H - 2) return step(rope, l + ((sp + tz) % 3 === 0 ? -0.35 : 0.1));
        if (((sp % 9) + 9) % 9 === 0) return step(rope, l - 0.1);
        // The brewer's label on the lit face: a bordered badge with brush strokes.
        const lx = ((sp % 9) + 9) % 9;
        if (l > 0.15 && lx >= 2 && lx <= 7 && tz >= 3 && tz <= H - 3) {
          if (lx === 2 || lx === 7 || tz === 3 || tz === H - 3) return lab[1]!;
          const gx = lx - 3;
          const gy = tz - 4;
          const strokes = [[1, 0], [1, 1], [1, 2], [0, 1], [2, 1], [0, 2], [2, 0]];
          const on = strokes.slice(0, 3 + glyph).some(([x, y]) => x === gx && y === gy);
          return on ? ink : PAL.paperW[0]!;
        }
        // The straw mat: faint vertical strands on the paper-white wrap.
        return step(PAL.paperW, l + (sp % 3 === 0 ? -0.12 : 0));
      }, (p, e) => {
        if (e > 0.78) return (Math.floor((p.u + p.v) * k) & 1) ? PAL.straw[0]! : PAL.straw[1]!;
        // The lid: straw, with the rope cross.
        const du = p.u - cu;
        const dv = p.v - cv;
        if (Math.abs(du - dv) < 0.25 || Math.abs(du + dv) < 0.25) return rope[1]!;
        return PAL.paperW[1]!;
      });
    }
}

/** Tawara rice bales lying in a heap: straw drums with three rope bands and woven end caps. */
export function tawara(P: PP, u: number, v: number, n: number, alongU: boolean, seed = 0): void {
  const r = 0.95;
  const len = 3;
  let i = 0;
  for (let row = 0; i < n; row++)
    for (let c = 0; c < 4 - row && i < n; c++, i++) {
      const a = c * 2 + row;
      const bu = alongU ? u : u + a;
      const bv = alongU ? v + a : v;
      logAlong(P, bu, bv, r + row * 1.6, len, r, !alongU, (l, s) => {
        const sq = Math.floor(s * P.k);
        if (sq === 1 || sq === Math.floor(len * P.k / 2) || sq === Math.floor(len * P.k) - 2) return tone(PAL.rope, l < 0 ? 0.25 : 0);
        const c0 = step(PAL.straw, l);
        return hash(sq, i, seed) < 0.15 ? tone(c0, 0.08) : c0;
      }, (_p, e) => (e > 0.75 ? PAL.straw[2] : e < 0.3 ? PAL.straw[1] : PAL.straw[0]));
    }
}

/** An oke: a wooden bucket of staves with two bamboo hoops, water dark in it. */
export function oke(P: PP, u: number, v: number, z = 0, r = 0.8, h = 1.3, water = true): void {
  const wood = ramp('#c08a54', '#9a6a3e', '#6e4a2c', '#43301e');
  cyl(P, u, v, z, r, h, (l, t) => {
    const tz = Math.floor(t * P.k);
    if (tz === 0 || tz === Math.floor(h * P.k) - 1) return step(PAL.bamboo, l);
    return step(wood, l);
  }, (_p, e) => (e > 0.72 ? wood[0] : water ? PAL.water : wood[2]));
}

/** Tenbōsui: the town's fire barrel, a big tub of water with a pyramid of buckets on its lid. */
export function tenbosui(P: PP, u: number, v: number): void {
  const wood = ramp('#b07c4a', '#8a5e38', '#5e3e26', '#3a2618');
  box(P.px, u - 1.8, v - 1.8, 0, 3.6, 3.6, 0.6, (f) => faceCol(wood, f, 1));
  const ironR = ramp('#8a8a96', '#5a5a66', '#3a3a44', '#22222a');
  cyl(P, u, v, 0.6, 1.7, 3, (l, t, _p, s) => {
    const tz = Math.floor(t * P.k);
    if (tz === 1 || tz === 4) return step(ironR, l);
    // Staves: a darker joint every third pixel round, the wood grain lighter between.
    const sp = Math.floor(s * P.k);
    return step(wood, l + (((sp % 3) + 3) % 3 === 0 ? -0.35 : 0));
  }, (p, e) => (e > 0.8 ? wood[0] : (Math.floor((p.u - p.v) * 2) & 1) ? PAL.water : tone(PAL.water, -0.15)));
  // Buckets: three on the rim, one on top, each lacquered red round its rim.
  for (const [du, dv, dz] of [[-0.75, 0.65, 3.6], [0.75, 0.65, 3.6], [0, -0.65, 3.6], [0, 0.1, 4.95]] as const) {
    oke(P, u + du, v + dv, dz, 0.68, 1.3, false);
    P.px.point(v3(u + du, v + dv + 0.68, dz + 1.1), PAL.red[1]!);
  }
  // 水 (water) painted in white on the tub's front: a stroke down and two sweeps.
  const W = hex('#f2ead6');
  for (const [dz, da] of [[2.6, 0], [2.1, 0], [1.6, 0], [2.3, -0.5], [1.8, 0.5], [1.6, -0.6]] as const) P.px.point(v3(u - 0.4 + da, v + 1.72 - da * 0.2, dz), W);
}

/**
 * A chōchin paper lantern hanging at (u, v, z) (z is its top): a ribbed paper drum, black lid and
 * foot, a mon on its face. It glows warm (emissive), and a red one carries the shop's sign.
 */
export function chochin(P: PP, u: number, v: number, z: number, red = false, r = 0.8, h = 2): void {
  const paper = red ? ramp('#ff7a50', '#e0482e', '#a42c22', '#661c1a') : ramp('#fff4d8', '#f6e2b4', '#dcbc86', '#a07e52');
  const lightC = red ? hex('#ff9a5a') : hex('#ffe0a0');
  const ink = red ? hex('#2a1418') : hex('#2c2024');
  P.lights?.push(v3(u, v, z - h / 2));
  line3(P.px, v3(u, v, z), v3(u, v, z + 1.2), hex('#1e1a1c'));
  const H = Math.floor(h * P.k);
  cyl(P, u, v, z - h, r, h, (l, t, p) => {
    const tz = Math.floor(t * P.k);
    // The black lacquered lid and foot, a gilt line at the lid.
    if (tz === 0 || tz === H - 1) return hex('#1e1a1c');
    if (tz === H - 2 && l > 0.2) return hex('#c89a40');
    // The paper bulges: lighter in the middle rows; a bamboo rib every other row.
    const mid = 1 - Math.abs(tz - H / 2) / (H / 2);
    let c = step(paper, l + 0.25 + mid * 0.2);
    if (tz % 2 === 0) c = tone(c, l < 0.2 ? 0.14 : 0.07);
    // The mon on the lit face: a dark ring round a paper centre.
    if (l > 0.5 && Math.abs(tz - H / 2) <= 1) c = l > 0.66 && tz === Math.floor(H / 2) ? step(paper, 1) : ink;
    return emitAt(P, p, c, lightC);
  });
  // A tassel under it.
  P.px.point(v3(u, v, z - h - 0.4), red ? hex('#e0482e') : hex('#c89a40'));
}

/** A nobori: a tall narrow banner on a pole with a cross-arm, a mon on the cloth. */
export function nobori(P: PP, u: number, v: number, h: number, cloth: Ramp, alongU = false, mark: Col = hex('#f4ecd8')): void {
  post(P.px, u, v, 0, h + 1, hex('#2a1e18'));
  const w = 1.6;
  const top = h;
  const bot = h * 0.35;
  // The cloth hangs from the arm on the side away from the viewer's left.
  const at = (a: number, z: number) => (alongU ? v3(u + 0.2 + a, v, z) : v3(u, v + 0.2 + a, z));
  P.px.quad(at(0, bot), alongU ? v3(w, 0, 0) : v3(0, w, 0), v3(0, 0, top - bot), (s, t, p) => {
    const tz = t / (top - bot);
    // A lighter band at the top (the chichi loops), the mon a third of the way down.
    if (Math.floor(t * P.k) % 5 === 0 && s < 0.3) return hex('#e8e0cc');
    if (tz > 0.55 && tz < 0.72 && s > 0.35 && s < 1.25) return mark;
    void p;
    return alongU ? cloth[2]! : cloth[1]!;
  });
  line3(P.px, at(-0.1, top), at(w + 0.1, top), hex('#2a1e18'));
}

/** A kanban: a signboard on two legs with a little roof, black strokes on pale wood. */
export function kanban(P: PP, u: number, v: number, alongU: boolean, h = 4.2): void {
  const wood = ramp('#e2c89a', '#c8a876', '#957650', '#5e4a34');
  const w = 2.4;
  for (const a of [0, w]) post(P.px, alongU ? u + a : u, alongU ? v : v + a, 0, h, hex('#3a2a20'));
  const o = alongU ? v3(u, v + 0.1, 1.2) : v3(u + 0.1, v, 1.2);
  P.px.quad(o, alongU ? v3(w, 0, 0) : v3(0, w, 0), v3(0, 0, h - 1.6), (s, t) => {
    const sq = Math.floor(s * P.k);
    const tq = Math.floor(t * P.k);
    // Characters: a column of short black strokes down the middle.
    if (sq >= 2 && sq <= 3 && tq % 3 !== 0 && tq > 0 && tq < (h - 1.6) * P.k - 1) return tq % 3 === 1 ? hex('#1e1a1c') : wood[1]!;
    return alongU ? wood[1]! : wood[2]!;
  });
  hip(P.px, alongU ? u - 0.3 : u - 0.5, alongU ? v - 0.5 : v - 0.3, h, alongU ? w + 0.6 : 1, alongU ? 1 : w + 0.6, 0.6, 0.3, (f) => faceCol(ramp('#6a7280', '#4e5462', '#383c48', '#22242c'), f));
}

/** A daihachi-guruma: a long handcart, two big spoked wheels, a load of bales and a cask. */
export function handcart(P: PP, u: number, v: number, alongU: boolean): void {
  const wood = ramp('#b48a5a', '#8e6a42', '#644a30', '#3e2e20');
  const L = 7;
  const W = 2.6;
  const at = (a: number, b: number, z: number) => (alongU ? v3(u + a, v + b, z) : v3(u + b, v + a, z));
  // The bed: slats across, two long shafts running out in front.
  const o = at(0, 0, 1.8);
  box(P.px, o.u, o.v, 1.6, alongU ? L : W, alongU ? W : L, 0.4, (f, s) => (Math.floor(s * P.k) % 3 === 0 && f === 'top' ? wood[2]! : faceCol(wood, f)));
  for (const b of [0.2, W - 0.2]) line3(P.px, at(L, b, 2), at(L + 3, b, 1.4), wood[1]!);
  line3(P.px, at(L + 3, -0.2, 1.4), at(L + 3, W + 0.2, 1.4), wood[2]!);
  // Wheels on the near side and the far side: a rim of two rings, eight spokes.
  for (const b of [-0.2, W + 0.2]) {
    const c = at(L / 2, b, 1.8);
    const near = b > W / 2;
    const rimC = near ? wood[1]! : wood[3]!;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const dz = Math.sin(a) * 1.8;
      const da = Math.cos(a) * 1.8;
      P.px.point(alongU ? v3(c.u + da, c.v, c.z + dz) : v3(c.u, c.v + da, c.z + dz), rimC);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI;
      const dz = Math.sin(a) * 1.7;
      const da = Math.cos(a) * 1.7;
      line3(P.px, alongU ? v3(c.u - da, c.v, c.z - dz) : v3(c.u, c.v - da, c.z - dz), alongU ? v3(c.u + da, c.v, c.z + dz) : v3(c.u, c.v + da, c.z + dz), near ? wood[2]! : wood[3]!);
    }
    P.px.point(c, PAL.iron);
  }
  // The load.
  const l0 = at(0.6, 0.1, 0);
  tawara(P, l0.u, l0.v, 3, !alongU, 9);
  const c1 = at(5.3, W / 2, 0);
  komodaru(P, c1.u, c1.v + 0.2, 1, 1, alongU, 3);
  void tri3;
}

/** Yotsume-gaki: a bamboo fence of upright canes and three rails, tied with black rope. */
export function bambooFence(P: PP, u: number, v: number, len: number, alongU: boolean, h = 3.2): void {
  const at = (a: number, z: number) => (alongU ? v3(u + a, v, z) : v3(u, v + a, z));
  for (let a = 0; a <= len; a += 1) {
    const p = at(a, 0);
    const big = Math.round(a) % 4 === 0;
    post(P.px, p.u, p.v, 0, big ? h + 0.4 : h, big ? PAL.bamboo[1] : PAL.bamboo[0], big ? PAL.bamboo[2] : undefined);
    // Nodes: a darker pixel every so often up the cane.
    P.px.point(at(a, h * 0.45), PAL.bamboo[2]!);
  }
  for (const z of [h * 0.25, h * 0.6, h * 0.9]) {
    line3(P.px, at(-0.3, z), at(len + 0.3, z), PAL.bamboo[1]!);
    for (let a = 0; a <= len; a += 2) P.px.point(at(a + 0.25, z + 0.05), hex('#1a1416'));
  }
}

/** A tsukubai: a low rough stone basin brimming, a bamboo spout dripping into it, stones round it. */
export function tsukubai(P: PP, u: number, v: number): void {
  const stone = ramp('#b4ae9e', '#8e887a', '#666270', '#423f4a');
  cyl(P, u, v, 0, 1.4, 1.4, (l, t, p) => {
    const c0 = step(stone, l);
    return hash(Math.floor(p.u * 4), Math.floor(t * 4), 5) < 0.12 ? PAL.moss : c0;
  }, (_p, e) => (e > 0.7 ? stone[0] : e > 0.55 ? stone[2] : PAL.water));
  line3(P.px, v3(u - 2.8, v - 0.6, 2.2), v3(u - 0.3, v - 0.2, 1.8), PAL.bamboo[1]!);
  post(P.px, u - 2.8, v - 0.6, 0, 2.4, PAL.bamboo[2]!);
  for (const [du, dv, s] of [[1.8, 1.4, 1], [-1.6, 1.9, 0.8], [2.2, -1.2, 0.7]] as const) box(P.px, u + du - s / 2, v + dv - s / 2, 0, s, s, s * 0.6, (f) => faceCol(stone, f));
  // A wooden ladle laid across the rim.
  line3(P.px, v3(u - 1.1, v + 0.3, 1.5), v3(u + 1.2, v - 0.3, 1.5), hex('#c09a62'));
}

/** Ido: a well with a plank curb, two posts, a beam with a pulley, a little roof and a bucket. */
export function well(P: PP, u: number, v: number): void {
  const wood = ramp('#a8865a', '#82623e', '#5a4230', '#38281e');
  const stone = ramp('#bab2a0', '#948c7c', '#6a6670', '#44424c');
  box(P.px, u - 3.4, v - 3.4, 0, 6.8, 6.8, 0.6, (f, s, t) => (f === 'top' ? (Math.floor((s + t) * 2) % 3 ? stone[0]! : stone[1]!) : faceCol(stone, f)));
  box(P.px, u - 2.4, v - 2.4, 0.6, 4.8, 4.8, 2.4, (f, s, _t, p) => {
    if (f === 'top') {
      const inner = Math.abs(p.u - u) < 1.8 && Math.abs(p.v - v) < 1.8;
      return inner ? PAL.water : wood[0]!;
    }
    const tq = Math.floor((p.z - 0.6) * P.k);
    if (tq % 2 === 0) return faceCol(wood, f, 1);
    return Math.floor(s * P.k) % 5 === 0 ? PAL.iron : faceCol(wood, f);
  });
  for (const dv of [-2.6, 2.6]) post(P.px, u, v + dv, 0.6, 7, wood[1]!, wood[2]!);
  line3(P.px, v3(u, v - 3, 7.4), v3(u, v + 3, 7.4), wood[2]!);
  // The pulley wheel (kassha) and its rope down to a bucket hanging at the rim.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    P.px.point(v3(u + 0.2, v + Math.cos(a) * 0.6, 7 + Math.sin(a) * 0.6), k % 4 ? wood[1]! : PAL.iron);
  }
  line3(P.px, v3(u + 0.2, v + 0.6, 7), v3(u + 0.2, v + 0.6, 4.5), PAL.rope);
  oke(P, u + 0.2, v + 0.6, 3.2, 0.6, 1.2, false);
  hip(P.px, u - 1.5, v - 3.6, 8.2, 3, 7.2, 1.6, 0.6, (f, p) => sunlit(faceCol(ramp('#5e5e48', '#4a4a38', '#34342a', '#22221c'), f), p, f));
}

/** Hasa: a rice-drying rack, poles and rails hung with straw sheaves. */
export function hasa(P: PP, u: number, v: number, len: number, alongU: boolean): void {
  const at = (a: number, z: number) => (alongU ? v3(u + a, v, z) : v3(u, v + a, z));
  for (let a = 0; a <= len; a += len / 3) {
    const p = at(a, 0);
    post(P.px, p.u, p.v, 0, 6, hex('#5a4630'));
  }
  for (const z of [3, 5.4]) {
    line3(P.px, at(-0.4, z), at(len + 0.4, z), hex('#6e5638'));
    for (let a = 0.4; a < len; a += 0.75) {
      const n = hash(Math.floor(a * 4), z, 3);
      const p0 = at(a, z);
      const ln = 1.8 + n * 0.6;
      const c = n < 0.35 ? PAL.straw[0]! : n < 0.8 ? PAL.straw[1]! : PAL.straw[2]!;
      for (let k = 0; k < ln * P.k; k++) P.px.point(v3(p0.u + 0.1, p0.v + 0.1, z - k / P.k), k < 2 ? PAL.straw[2]! : c);
    }
  }
}

/** A stack of firewood (maki) under a lean-to board: cut ends as small light rings. */
export function woodpile(P: PP, u: number, v: number, len: number, alongU: boolean): void {
  const bark = ramp('#8a6a48', '#6a4e34', '#4a3424', '#2e2018');
  const cut = ramp('#e8cc96', '#d4b07a', '#b08a5a', '#7a5e3e');
  for (let row = 0; row < 3; row++)
    for (let a = 0.6; a < len; a += 1.2) {
      const o = alongU ? v3(u + a, v, 0.6 + row * 1.1) : v3(u, v + a, 0.6 + row * 1.1);
      logAlong(P, o.u - (alongU ? 0 : 0), o.v, o.z, 2.6, 0.55, !alongU, (l) => step(bark, l), (_p, e) => (e > 0.7 ? bark[1]! : e < 0.25 ? cut[2]! : cut[0]!));
    }
  const end = alongU ? v3(u + len, v + 2.8, 0) : v3(u + 2.8, v + len, 0);
  void end;
}

/** A stack of wooden crates and a sack or two. */
export function crates(P: PP, u: number, v: number, n: number, seed = 0): void {
  const wood = ramp('#c49a64', '#a07a4a', '#745636', '#4a3624');
  for (let i = 0; i < n; i++) {
    const s = 1.6 + hash(i, seed) * 0.6;
    const du = (i % 2) * 2.2;
    const dv = Math.floor(i / 2) * 2.2;
    const z = i >= 3 ? 1.8 : 0;
    box(P.px, u + du, v + dv, z, s, s, s, (f, a, b) => {
      const S = Math.floor(s * P.k);
      const qa = Math.floor(a * P.k);
      const qb = Math.floor(b * P.k);
      // Corner battens down each side, boards across (a seam every 3 pixels), grain dashes.
      if (f !== 'top' && (qa === 0 || qa === S - 1)) return faceCol(wood, f, 2);
      if (f === 'top' && qa % 3 === 2) return wood[2]!;
      if (f !== 'top' && qb % 3 === 2) return faceCol(wood, f, 1);
      if (hash(qa >> 1, qb, seed + i) < 0.18) return faceCol(wood, f, 1);
      return faceCol(wood, f);
    });
  }
}

/** A tōrō: a stone lantern (Kasuga type): base, post, a fire-box with lit windows, a curled roof, a jewel. */
export function toro(P: PP, u: number, v: number, s = 1): void {
  const stone = ramp('#c4bca8', '#9c9484', '#706c74', '#4a4852');
  const S = (f: Facing, p: V3) => {
    let c = faceCol(stone, f);
    const n = hash(Math.floor((p.u + p.v) * 4), Math.floor(p.z * 4), 31);
    if (n < 0.14) c = tone(c, 0.12);
    else if (n > 0.92) c = mix(c, hex('#c8c088'), 0.45);
    if (f === 'top' && hash(Math.floor(p.u * 3), Math.floor(p.v * 3), 33) < 0.35) c = mix(c, PAL.moss, 0.65);
    return sunlit(c, p, f);
  };
  box(P.px, u - 1.3 * s, v - 1.3 * s, 0, 2.6 * s, 2.6 * s, 0.7 * s, (f, _a, _b, p) => S(f, p));
  box(P.px, u - 0.9 * s, v - 0.9 * s, 0.7 * s, 1.8 * s, 1.8 * s, 0.5 * s, (f, _a, _b, p) => S(f, p));
  cyl(P, u, v, 1.2 * s, 0.55 * s, 2.2 * s, (l, _t, p) => sunlit(step(stone, l), p));
  box(P.px, u - 1.1 * s, v - 1.1 * s, 3.4 * s, 2.2 * s, 2.2 * s, 0.4 * s, (f, _a, _b, p) => S(f, p));
  P.lights?.push(v3(u, v, 4.4 * s));
  // The fire-box: a window on each visible face.
  box(P.px, u - 0.8 * s, v - 0.8 * s, 3.8 * s, 1.6 * s, 1.6 * s, 1.3 * s, (f, a, t, p) => {
    if (f !== 'top' && a > 0.35 * s && a < 1.25 * s && t > 0.25 * s && t < 1.05 * s) return emitAt(P, p, f === 'left' ? hex('#5a3a28') : hex('#3a2820'), hex('#ffc070'));
    return S(f, p);
  });
  hip(P.px, u - 1.1 * s, v - 1.1 * s, 5.1 * s, 2.2 * s, 2.2 * s, 1.1 * s, 0.6 * s, (f, p) => S(f, p), 0.2);
  // Warabide: the curled corners, a lit pixel at each.
  for (const [du, dv] of [[1.7, 1.7], [-1.7, 1.7], [1.7, -1.7]] as const) P.px.point(v3(u + du * s, v + dv * s, 5.2 * s), stone[0]!);
  box(P.px, u - 0.3 * s, v - 0.3 * s, 6.1 * s, 0.6 * s, 0.6 * s, 0.7 * s, (f) => faceCol(stone, f));
}

/** A komainu: a stone guardian lion-dog sitting on a plinth, mane and tail in curls. */
export function komainu(P: PP, u: number, v: number, facingU: boolean, open: boolean): void {
  const stone = ramp('#cfc6b0', '#a8a08c', '#787480', '#4e4c58');
  box(P.px, u - 1.2, v - 1.2, 0, 2.4, 2.4, 1.6, (f, _a, t, p) => (f !== 'top' && Math.floor(t * P.k) === 1 ? faceCol(stone, f, 1) : sunlit(faceCol(stone, f), p, f)));
  // Haunches, chest and head as stacked lumps.
  const blob = (cu: number, cv: number, cz: number, r: number, h: number) => {
    const st = 0.5 / P.k;
    for (let a = -r; a <= r; a += st)
      for (let b = -r; b <= r; b += st)
        for (let c = 0; c <= h; c += st) {
          const e = (a * a + b * b) / (r * r) + ((c - h / 2) * (c - h / 2)) / ((h / 2) * (h / 2));
          if (e > 1) continue;
          const l = lightOf(a, b, (c - h / 2) * 0.8);
          P.px.point(v3(cu + a, cv + b, cz + c), step(stone, l + (hash(Math.floor((cu + a) * 3), Math.floor((cz + c) * 3), 9) < 0.15 ? -0.3 : 0)));
        }
  };
  const fu = facingU ? 1 : 0;
  const fv = facingU ? 0 : 1;
  blob(u - fu * 0.4, v - fv * 0.4, 1.6, 0.9, 1.6);
  blob(u + fu * 0.3, v + fv * 0.3, 2.2, 0.7, 1.8);
  blob(u + fu * 0.55, v + fv * 0.55, 3.6, 0.65, 1.2);
  // Eyes and the open (a-) or closed (un-) mouth.
  const face = v3(u + fu * 1.15, v + fv * 1.15, 4.3);
  P.px.point(face, hex('#2a2630'));
  if (open) P.px.point(v3(face.u, face.v, 3.9), hex('#5a3030'));
}

/** An ema rack: a little roofed frame hung with rows of wooden prayer plaques on red strings. */
export function emaRack(P: PP, u: number, v: number, len: number, alongU: boolean): void {
  const red = PAL.red;
  const at = (a: number, z: number) => (alongU ? v3(u + a, v, z) : v3(u, v + a, z));
  for (const a of [0, len]) {
    const p = at(a, 0);
    post(P.px, p.u, p.v, 0, 5, red[1]!, red[2]!);
  }
  const plank = ramp('#f0dcb0', '#dcc090', '#b09468', '#7a6448');
  for (const z of [2.2, 3.6]) {
    line3(P.px, at(0, z + 0.3), at(len, z + 0.3), red[2]!);
    for (let a = 0.6; a < len - 0.4; a += 1.2) {
      const n = hash(Math.floor(a * 10), z * 10, 7);
      const o = at(a, z - 1);
      const q = alongU ? v3(o.u, o.v + 0.2, o.z) : v3(o.u + 0.2, o.v, o.z);
      P.px.quad(q, alongU ? v3(1, 0, 0) : v3(0, 1, 0), v3(0, 0, 1), (s, t) => {
        // A pentagon top, a few brush marks.
        if (t > 0.8 && (s < 0.2 || s > 0.8)) return 0;
        if (Math.floor(t * P.k) === 0 && Math.floor(s * P.k) === 1 && n < 0.6) return hex('#3a2a24');
        return alongU ? plank[1]! : plank[2]!;
      });
      P.px.point(at(a + 0.5, z + 0.15), hex('#f4f0e8'));
    }
  }
  const r0 = at(-0.6, 5);
  hip(P.px, r0.u - (alongU ? 0 : 0.7), r0.v - (alongU ? 0.7 : 0), 5, alongU ? len + 1.2 : 1.4, alongU ? 1.4 : len + 1.2, 0.8, 0.4, (f, p) => sunlit(faceCol(ramp('#8a6a50', '#6a4c38', '#4a3428', '#2e201a'), f), p, f));
}

/**
 * A shimenawa: a thick twisted straw rope hung between two points with a sag, and white zig-zag
 * shide paper strips hanging from it.
 */
export function shimenawa(P: PP, a: V3, b: V3, sag: number, thick = 0.8, shide = 3): void {
  const n = Math.max(8, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) * P.k * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 4 * t * (1 - t);
    const thk = thick * (0.55 + 0.45 * s);
    const p = v3(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t, a.z + (b.z - a.z) * t - sag * s);
    for (let k = 0; k < thk * P.k; k++) {
      // The twist: diagonal light and dark strands.
      const tw = (i + k) % 4;
      const c = tw < 2 ? PAL.straw[0]! : tw === 2 ? PAL.straw[1]! : PAL.straw[2]!;
      P.px.point(v3(p.u, p.v, p.z - k / P.k), k === 0 ? PAL.straw[0]! : c);
    }
  }
  for (let j = 1; j <= shide; j++) {
    const t = j / (shide + 1);
    const s = 4 * t * (1 - t);
    const p = v3(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t, a.z + (b.z - a.z) * t - sag * s - thick);
    // A zig-zag strip of white paper: steps down and across.
    for (let k = 0; k < 6; k++) {
      const off = Math.floor(k / 2) % 2 ? 0.5 : 0;
      P.px.point(v3(p.u + off, p.v - off, p.z - k * 0.5), k % 2 ? hex('#e6e0d4') : hex('#fbf8f0'));
    }
  }
}

// ------------------------------------------------------------------ plants

/**
 * A foliage pad: a flattened lumpy dome at height cz (the cloud-pruned layers of a Japanese pine,
 * a cherry's crown). The light is from the dome's normal, broken by clusters a unit or so across so
 * it reads as clumps of needles or blossom, not a smooth ball; the rim is ragged.
 */
export function pad(P: PP, cu: number, cv: number, cz: number, ru: number, rv: number, h: number, r: Ramp, seed: number, accent?: Col): void {
  const st = 0.5 / P.k;
  const p = v3(0, 0, 0);
  for (let u = -ru - 0.6; u <= ru + 0.6; u += st)
    for (let v = -rv - 0.6; v <= rv + 0.6; v += st) {
      const cu1 = Math.floor((cu + u) * 1.4);
      const cv1 = Math.floor((cv + v) * 1.4);
      const lump = hash(cu1, cv1, seed);
      const rr = (u * u) / (ru * ru) + (v * v) / (rv * rv);
      if (rr > 1 + (lump - 0.5) * 0.7) continue;
      const q = Math.max(0, 1 - Math.min(1, rr));
      const z = h * Math.sqrt(q) + (lump - 0.5) * 0.6;
      const nu = (u / (ru * ru)) * h;
      const nv = (v / (rv * rv)) * h;
      const nz = Math.max(0.2, Math.sqrt(q));
      let l = lightOf(nu, nv, nz);
      // Clumps: each cluster lit as a little dome of its own (its lit corner toward the key).
      const fu = (cu + u) * 1.4 - cu1 - 0.5;
      const fv = (cv + v) * 1.4 - cv1 - 0.5;
      l += (fv - fu) * 0.5 + (lump - 0.5) * 0.25;
      p.u = cu + u;
      p.v = cv + v;
      p.z = cz + Math.max(0, z);
      let c = step(r, l);
      if (accent && hash(Math.floor(p.u * 4), Math.floor(p.v * 4), seed + 3) < 0.05 && l > 0) c = accent;
      P.px.point(p, sunlit(c, p));
    }
}

/** A trunk: a crooked line of bark two pixels wide from (u, v, 0) up to (u2, v2, h). */
function trunk(P: PP, u: number, v: number, u2: number, v2: number, h: number, bark: Ramp): void {
  const n = Math.ceil(h * P.k);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * 0.8;
    const pu = u + (u2 - u) * t + bend;
    const pv = v + (v2 - v) * t;
    const x = Math.floor(P.px.X(pu, pv));
    const y = Math.floor(P.px.Y(pu, pv, t * h));
    const d = pu + pv + t * h;
    P.px.plot(x, y, d, bark[1]!);
    P.px.plot(x + 1, y, d, bark[2]!);
    if (t < 0.25) P.px.plot(x - 1, y, d, bark[1]!);
  }
}

/** A black pine (kuromatsu): a leaning trunk and four or five cloud-pruned pads of needles. */
export function pine(P: PP, u: number, v: number, h: number, seed: number): void {
  const bark = ramp('#7a5a48', '#5a4034', '#3a2a26', '#221816');
  const lean = (hash(seed, 1) - 0.5) * 3;
  trunk(P, u, v, u + lean, v - 1, h * 0.85, bark);
  const pads: [number, number, number, number][] = [
    [lean, -1, h * 0.9, 1],
    [lean - 2.5, 1, h * 0.68, 0.8],
    [lean + 2.4, -2, h * 0.6, 0.75],
    [lean - 0.8, 2.5, h * 0.45, 0.65],
  ];
  for (const [du, dv, z, s] of pads) {
    line3(P.px, v3(u + lean * (z / h), v - z / h, z - 0.5), v3(u + du, v + dv, z), bark[1]!);
    pad(P, u + du, v + dv, z, 3.6 * s + 1, 3 * s + 1, 1.6 * s + 0.6, PAL.pine, seed + Math.round(z));
  }
}

/** A cherry (sakura): a dark trunk forking into a broad crown of blossom clumps. */
export function sakura(P: PP, u: number, v: number, h: number, seed: number, maple = false): void {
  const bark = ramp('#6a4a44', '#4a3232', '#30222a', '#1c1418');
  trunk(P, u, v, u + 0.5, v - 0.5, h * 0.6, bark);
  line3(P.px, v3(u + 0.5, v - 0.5, h * 0.55), v3(u - 2, v + 1, h * 0.75), bark[1]!);
  line3(P.px, v3(u + 0.5, v - 0.5, h * 0.55), v3(u + 2.5, v - 1.5, h * 0.8), bark[1]!);
  const r: Ramp = maple ? ramp('#f0a04a', '#d86a30', '#a8402a', '#6a2a22') : PAL.sakura;
  pad(P, u - 1.6, v + 1, h * 0.68, 3.4, 3, 2.2, r, seed, maple ? hex('#f4d070') : hex('#ffffff'));
  pad(P, u + 2, v - 1.4, h * 0.72, 3.2, 2.8, 2.4, r, seed + 5);
  pad(P, u + 0.3, v - 0.2, h * 0.86, 3.4, 3.2, 2.2, r, seed + 9, maple ? undefined : hex('#ffffff'));
}

/** A low flowering bush (tsutsuji azalea) or a clipped box shrub. */
export function bush(P: PP, u: number, v: number, r: number, seed: number, flowers: Ramp | null = PAL.azalea): void {
  pad(P, u, v, 0, r, r * 0.85, r * 0.9, PAL.leaf, seed);
  if (!flowers) return;
  // Blossom clumps laid on top: little 2-pixel clusters on the lit side.
  for (let i = 0; i < r * 10; i++) {
    const a = hash(i, seed, 1) * Math.PI * 2;
    const d = Math.sqrt(hash(i, seed, 2)) * r * 0.85;
    const pu = u + Math.cos(a) * d;
    const pv = v + Math.sin(a) * d * 0.85;
    const z = r * 0.9 * Math.sqrt(Math.max(0, 1 - (d * d) / (r * r))) + 0.2;
    const lit = pv - pu > -r * 0.3;
    P.px.point(v3(pu, pv, z), lit ? flowers[1]! : flowers[2]!);
    P.px.point(v3(pu + 0.5, pv - 0.5, z), lit ? flowers[0]! : flowers[1]!);
    P.px.point(v3(pu, pv, z + 0.5), lit ? flowers[0]! : flowers[1]!);
    if (i % 3 === 0) P.px.point(v3(pu + 0.25, pv - 0.25, z + 0.25), flowers[3]!);
  }
}

/** A glazed pot with a plant: a bonsai pine, a bush in flower, or a fern. */
export function potted(P: PP, u: number, v: number, kind: 'bonsai' | 'azalea' | 'fern', seed: number): void {
  const glaze = kind === 'bonsai' ? ramp('#7c94a8', '#566e86', '#3c4e62', '#263242') : ramp('#c8794a', '#a45a36', '#743e28', '#4a281c');
  if (kind === 'bonsai') {
    box(P.px, u - 1.2, v - 0.9, 0.5, 2.4, 1.8, 0.8, (f) => faceCol(glaze, f));
    box(P.px, u - 1, v - 0.7, 0, 0.4, 0.4, 0.5, (f) => faceCol(glaze, f, 1));
    box(P.px, u + 0.6, v + 0.3, 0, 0.4, 0.4, 0.5, (f) => faceCol(glaze, f, 1));
    trunk(P, u, v, u - 0.8, v + 0.4, 2, ramp('#7a5a48', '#5a4034', '#3a2a26', '#221816'));
    pad(P, u - 0.9, v + 0.5, 2.2, 1.4, 1.1, 0.7, PAL.pine, seed);
    pad(P, u + 0.7, v - 0.4, 1.6, 1, 0.8, 0.5, PAL.pine, seed + 1);
    return;
  }
  cyl(P, u, v, 0, 0.9, 1.3, (l, t) => (Math.floor(t * P.k) === Math.floor(1.3 * P.k) - 1 ? glaze[0]! : step(glaze, l)), () => hex('#3a2a20'));
  if (kind === 'azalea') bush(P, u, v + 0.1, 1.2, seed);
  else {
    // A fern: arching fronds as short green strokes.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      line3(P.px, v3(u, v, 1.4), v3(u + Math.cos(a) * 1.4, v + Math.sin(a) * 1.4, 1.9 + (i % 2) * 0.5), i % 2 ? PAL.leaf[1]! : PAL.leaf[0]!);
    }
  }
}

/**
 * Vines: a curtain of ivy or wisteria hanging down a wall face from its top edge, thick at the top
 * and thinning in ragged strands toward the foot. `face` is the wall face it grows on; `along0`
 * and `len` place it along the wall; the wall plane is at `at` (u for a right face, v for a left).
 */
export function vines(P: PP, face: 'left' | 'right', at: number, along0: number, len: number, ztop: number, zmin: number, seed: number, flowers: Ramp | null = null): void {
  const k = P.k;
  for (let a = 0; a < len; a += 1 / k) {
    const col = Math.floor((along0 + a) * k);
    const n = hash(col >> 1, seed, 11);
    const drop = (ztop - zmin) * (0.25 + 0.75 * n * n) * (0.6 + 0.4 * Math.sin((a / len) * Math.PI));
    for (let z = ztop; z > ztop - drop; z -= 1 / k) {
      const zi = Math.floor(z * k);
      const leafy = hash(col >> 1, zi >> 1, seed + 2);
      const depth = (ztop - z) / Math.max(1, drop);
      if (depth > 0.5 && leafy < depth * 0.6) continue;
      const p = face === 'left' ? v3(along0 + a, at + 0.25, z) : v3(at + 0.25, along0 + a, z);
      let c = leafy < 0.3 ? PAL.leaf[0]! : leafy < 0.7 ? PAL.leaf[1]! : PAL.leaf[2]!;
      if (face === 'right') c = tone(c, 0.18);
      if (flowers && hash(col >> 1, zi >> 2, seed + 5) < 0.3 && depth < 0.8) c = flowers[(zi & 1) + (face === 'right' ? 1 : 0)]!;
      P.px.point(p, sunlit(c, p, face));
    }
  }
}

/**
 * Ivy climbing a battered stone face from its foot: ragged strands of leaf clusters rising to
 * different heights, thick low down and thinning upward, following the face's lean (`lean` units
 * inward over the height `h`). The face is at `at` (v of a left face, u of a right) at its foot.
 */
export function ivyUp(P: PP, face: 'left' | 'right', at: number, along0: number, len: number, h: number, lean: number, seed: number): void {
  const k = P.k;
  for (let a = 0; a < len; a += 1 / k) {
    const col = Math.floor((along0 + a) * k);
    const n = hash(col >> 1, seed, 13);
    const top = h * (0.45 + 0.55 * n) * (0.55 + 0.45 * Math.sin((a / len) * Math.PI));
    for (let z = 0; z < top; z += 1 / k) {
      const zi = Math.floor(z * k);
      const leafy = hash(col >> 1, zi >> 1, seed + 3);
      if (z / top > 0.6 && leafy < (z / top) * 0.5) continue;
      const off = at - lean * (z / Math.max(1, h)) + 0.25;
      const p = face === 'left' ? v3(along0 + a, off, z) : v3(off, along0 + a, z);
      let c = leafy < 0.3 ? PAL.leaf[0]! : leafy < 0.7 ? PAL.leaf[1]! : PAL.leaf[2]!;
      if (face === 'right') c = tone(c, 0.18);
      P.px.point(p, sunlit(c, p, face));
    }
  }
}

/** A wisteria trellis (fuji-dana): posts, a grid of poles, racemes of lilac hanging under it. */
export function wisteria(P: PP, u: number, v: number, lu: number, lv: number, h: number, seed: number): void {
  const wood = hex('#4a3a2c');
  for (const [du, dv] of [[0, 0], [lu, 0], [0, lv], [lu, lv]] as const) post(P.px, u + du, v + dv, 0, h, wood);
  for (let a = 0; a <= lu; a += 2) line3(P.px, v3(u + a, v, h), v3(u + a, v + lv, h), wood);
  for (let b = 0; b <= lv; b += 2) line3(P.px, v3(u, v + b, h), v3(u + lu, v + b, h), wood);
  pad(P, u + lu / 2, v + lv / 2, h - 0.2, lu / 2 + 0.6, lv / 2 + 0.6, 0.8, PAL.leaf, seed);
  for (let i = 0; i < lu * lv * 0.9; i++) {
    const pu = u + hash(i, seed, 3) * lu;
    const pv = v + hash(i, seed, 4) * lv;
    const ln = 1.2 + hash(i, seed, 5) * 1.8;
    for (let k = 0; k < ln * P.k; k++) {
      const t = k / (ln * P.k);
      const z = h - 0.3 - k / P.k;
      P.px.point(v3(pu, pv, z), PAL.wisteria[t < 0.3 ? 0 : t < 0.7 ? 1 : 2]!);
      if (t < 0.55) P.px.point(v3(pu + 0.5, pv - 0.5, z), PAL.wisteria[t < 0.25 ? 1 : 2]!);
    }
    // A few leaves at the raceme's top.
    P.px.point(v3(pu - 0.5, pv + 0.5, h - 0.3), PAL.leaf[1]!);
  }
}

// ------------------------------------------------------------------ ground decals

/** Shade: a translucent cool colour (an art pixel of shadow over whatever ground is there). */
const shadeA = (a: number): Col => rgb(30, 34, 74, a);

/**
 * Gravel over a ground rectangle, raked in lines along u or v with ripples round stones; `stones`
 * are stepping stones laid on it (u, v, size). Painted as a flat ground decal.
 */
export function gravel(P: PP, u0: number, v0: number, u1: number, v1: number, alongU: boolean, stones: [number, number, number][] = [], ripples: [number, number, number][] = []): void {
  const k = P.k;
  const st = 0.5 / k;
  const p = v3(0, 0, 0);
  for (let u = u0; u < u1; u += st)
    for (let v = v0; v < v1; v += st) {
      p.u = u;
      p.v = v;
      let c = PAL.gravel[1]!;
      // Raked furrows: a line every 1.5 units (light crest, shaded trough), rings round stones.
      let a = (alongU ? v : u) * k;
      for (const [ru, rv, rr] of ripples) {
        const d = Math.hypot(u - ru, v - rv);
        if (d < rr) a = d * k;
      }
      const ph = Math.floor(a) % 3;
      if (ph === 0) c = PAL.gravel[0]!;
      else if (ph === 2) c = PAL.gravel[2]!;
      if (hash(Math.floor(u * k), Math.floor(v * k), 3) < 0.04) c = PAL.gravel[3]!;
      // The edge: a kerb of dark stones along the near sides.
      if (u1 - u < 0.5 || v1 - v < 0.5) c = hex('#6a6670');
      // A little translucent, so the buildings' cast shadows on the ground show through.
      const g = sunlit(c, p, 'top');
      P.px.point(p, ((g & 0xffffff) | (215 << 24)) >>> 0);
    }
  for (const [su, sv, s] of stones) stone(P, su, sv, s);
  for (const [ru, rv, rr] of ripples) if (rr > 2) rock(P, ru, rv, rr * 0.45);
}

/** A flat stepping stone (tobi-ishi), a rounded slab lit on its upper edge. */
export function stone(P: PP, u: number, v: number, s: number): void {
  const r = ramp('#c8c0ae', '#a49c8a', '#7a7480', '#4e4c56');
  disc(P, u, v, 0.15, s, (p, e) => {
    const n = hash(Math.floor(p.u * 3), Math.floor(p.v * 3), 17);
    if (e > 0.82) return p.v - v > p.u - u ? r[2]! : r[1]!;
    return sunlit(n < 0.2 ? r[1]! : r[0]!, p, 'top');
  });
}

/** A garden rock: a lumpy boulder with moss on its crown. */
export function rock(P: PP, u: number, v: number, s: number): void {
  pad(P, u, v, 0, s, s * 0.8, s * 0.9, ramp('#b6ae9c', '#8c8676', '#605c66', '#3c3a44'), Math.round(u * 7 + v), PAL.moss);
}

/** Moss and grass tufts along the foot of a wall or between stones: small 2-3 pixel clusters. */
export function tufts(P: PP, u0: number, v0: number, u1: number, v1: number, density: number, seed: number): void {
  const n = Math.round((u1 - u0 + v1 - v0) * density);
  for (let i = 0; i < n; i++) {
    const u = u0 + hash(i, seed, 1) * (u1 - u0);
    const v = v0 + hash(i, seed, 2) * (v1 - v0);
    const c = hash(i, seed, 3) < 0.5 ? PAL.leaf[1]! : PAL.moss;
    P.px.point(v3(u, v, 0.3), c);
    P.px.point(v3(u + 0.5, v - 0.5, 0.3), PAL.leaf[0]!);
    P.px.point(v3(u, v, 0.8), PAL.leaf[2]!);
  }
}

/** The shade of each tree's canopy on the ground, dappled, as translucent decal pixels. */
export function treeShade(P: PP): void {
  const st = 0.5 / P.k;
  const p = v3(0, 0, 0);
  for (const t of TREES) {
    // The canopy's shadow lands away from the sun, offset by its height.
    const cu = t.u + CAST[0] * t.h;
    const cv = t.v + CAST[1] * t.h;
    for (let u = cu - t.r * 1.4; u <= cu + t.r * 1.4; u += st)
      for (let v = cv - t.r * 1.4; v <= cv + t.r * 1.4; v += st) {
        p.u = u;
        p.v = v;
        const sh = sunAt(p);
        if (sh < 0) P.px.point(p, shadeA(118));
        else if (sh > 0) P.px.point(p, rgb(255, 200, 104, 140));
      }
    // The trunk's own shadow, a dark stroke from the foot.
    line3(P.px, v3(t.u, t.v, 0), v3(cu, cv, 0), shadeA(110));
  }
}

/** Fallen petals under the cherries: a scatter of pink pixels on the ground. */
export function petals(P: PP, u: number, v: number, r: number, seed: number): void {
  for (let i = 0; i < r * r * 3; i++) {
    const a = hash(i, seed, 1) * Math.PI * 2;
    const d = Math.sqrt(hash(i, seed, 2)) * r;
    P.px.point(v3(u + Math.cos(a) * d, v + Math.sin(a) * d, 0.05), i % 3 ? PAL.sakura[1]! : PAL.sakura[0]!);
  }
}

// ------------------------------------------------------------------ more street furniture

/** An andon: a paper lantern in a wooden frame on a post, by a door or a lane; it glows. */
export function andon(P: PP, u: number, v: number, h = 4.6): void {
  const wood = ramp('#6a4a34', '#4e3628', '#36261e', '#221814');
  post(P.px, u, v, 0, h - 1.6, wood[1]!, wood[2]!);
  box(P.px, u - 0.7, v - 0.7, h - 1.8, 1.4, 1.4, 1.8, (f, a, t, p) => {
    if (f === 'top') return wood[1]!;
    const aq = Math.floor(a * P.k);
    const tq = Math.floor(t * P.k);
    if (aq === 0 || tq === 0 || tq === Math.floor(1.8 * P.k) - 1 || aq === Math.floor(1.4 * P.k) - 1) return faceCol(wood, f);
    return emitAt(P, p, f === 'left' ? hex('#fff0d0') : hex('#e8c890'), hex('#ffe0a0'));
  });
  box(P.px, u - 0.9, v - 0.9, h, 1.8, 1.8, 0.3, (f) => faceCol(wood, f, 1));
  P.lights?.push(v3(u, v, h - 0.9));
}

/**
 * A yatai: a street stall with a board counter of wares, four posts, a cloth awning with the
 * vendor's mon, and a red paper lantern hanging at its corner.
 */
export function yatai(P: PP, u: number, v: number, seed: number): void {
  const wood = ramp('#b48a5a', '#8e6a42', '#644a30', '#3e2e20');
  const L = 7;
  const W = 3.6;
  box(P.px, u, v, 0, L, W, 2.4, (f, a, t) => {
    if (f === 'top') {
      // Wares in little heaps and baskets on the counter: radishes, fish, pots, cloth.
      const n = hash(Math.floor(a * 1.4), Math.floor(t * 1.4), seed);
      return n < 0.2 ? hex('#e8e0c8') : n < 0.35 ? PAL.red[1]! : n < 0.5 ? hex('#7aa050') : n < 0.6 ? PAL.indigo[0]! : n < 0.7 ? PAL.straw[0]! : wood[0]!;
    }
    return Math.floor(a * P.k) % 3 === 0 ? faceCol(wood, f, 1) : faceCol(wood, f);
  });
  for (const [du, dv] of [[0, 0], [L, 0], [0, W], [L, W]] as const) post(P.px, u + du, v + dv, 0, 6, wood[2]!);
  // The awning: a cloth roof sloping toward the lane, its hem cut in noren tabs.
  const cloth = seed % 2 ? PAL.indigo : ramp('#d8c8a4', '#b8a684', '#8a7c62', '#5a5040');
  P.px.quad(v3(u - 0.4, v - 0.4, 6.4), v3(L + 0.8, 0, 0), v3(0, W + 1.4, -1.2), (a, t) => {
    const aq = Math.floor(a * P.k);
    if (t > W + 0.9 && aq % 6 === 0) return 0;
    if (Math.abs(a - L / 2) < 0.7 && Math.abs(t - W * 0.6) < 0.6) return hex('#f0e8d8');
    return aq % 6 === 0 ? cloth[2]! : cloth[0]!;
  });
  chochin(P, u + L + 0.4, v + W + 0.6, 5.6, true, 0.6, 1.4);
}

// ------------------------------------------------------------------ registration (props.ts)

/** The trees' heights by kind (the canopy the dappled shade is cast from). */
const TREE_H = { pine: 14, sakura: 12, maple: 11 } as const;
for (const t of TREES) t.h = TREE_H[t.kind];

type Draw = (P: PP, u: number, v: number, n: number) => void;
/**
 * The Samurai light on a prop painted by props.ts: the pixels this prop changed (its screen
 * rectangle, compared before and after) take the same warm/cool grade as the buildings
 * (`finishLit`), lantern flame colours excepted.
 */
function gradeProp(px: Px, u: number, v: number, lu: number, lv: number, h: number, draw: () => void): void {
  const x0 = Math.max(0, Math.floor(px.X(u, v + lv)) - 2);
  const x1 = Math.min(px.w, Math.ceil(px.X(u + lu, v)) + 2);
  const y0 = Math.max(0, Math.floor(px.Y(u, v, h + 16)) - 2);
  const y1 = Math.min(px.h, Math.ceil(px.Y(u + lu, v + lv, 0)) + 2);
  if (x1 <= x0 || y1 <= y0) return draw();
  const w = x1 - x0;
  const before = new Uint32Array(w * (y1 - y0));
  for (let y = y0; y < y1; y++) before.set(px.data.subarray(y * px.w + x0, y * px.w + x1), (y - y0) * w);
  draw();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * px.w + x;
      const c = px.data[i]!;
      if (!c || c === before[(y - y0) * w + x - x0] || c === FLAME || c === FLAME2 || c >>> 24 !== 255) continue;
      const k = px.cls[i]!;
      px.data[i] = k === 1 ? mix(c, WARM, 0.4) : k === 2 ? mix(c, WARM, 0.14) : k === 3 ? mix(c, COOL, 0.48) : mix(c, WARM, 0.2);
    }
}

const reg = (kind: string, lu: number, lv: number, h: number, draw: Draw) =>
  registerProp('samurai:' + kind, { lu, lv, h, draw: (a) => gradeProp(a.px, a.u, a.v, lu, lv, h, () => draw(ctx(a), a.u, a.v, a.n)) });

reg('komodaru', 10.2, 3.4, 6.6, (P, u, v, n) => komodaru(P, u + 1.6, v + 1.7, 3, 2, true, Math.floor(n * 50)));
reg('komodaru2', 6.8, 3.4, 3.3, (P, u, v, n) => komodaru(P, u + 1.6, v + 1.7, 2, 1, true, Math.floor(n * 50)));
reg('tawara', 8, 3.2, 3.4, (P, u, v, n) => tawara(P, u + 1, v, 5 + Math.floor(n * 3), false, Math.floor(n * 40)));
reg('tawara3', 5.4, 3.2, 3.4, (P, u, v, n) => tawara(P, u + 1, v, 3, false, Math.floor(n * 40)));
reg('oke', 1.8, 1.8, 1.3, (P, u, v) => oke(P, u + 0.9, v + 0.9));
reg('oke2', 3.6, 1.8, 1.3, (P, u, v) => {
  oke(P, u + 0.9, v + 0.9);
  oke(P, u + 2.7, v + 0.9, 0, 0.7, 1.1, false);
});
reg('tenbosui', 4, 4, 6, (P, u, v) => tenbosui(P, u + 2, v + 2));
reg('andon', 1.8, 1.8, 4.8, (P, u, v) => andon(P, u + 0.9, v + 0.9));
reg('nobori', 2.4, 2.4, 13, (P, u, v, n) => nobori(P, u + 0.6, v + 0.4, 12, n < 0.5 ? PAL.indigo : ramp('#f0e8d4', '#e2d8c0', '#b8ae98', '#7c7466'), false, n < 0.5 ? hex('#efe6d0') : P.st.accent));
reg('kanban', 1.2, 3, 4.8, (P, u, v) => kanban(P, u + 0.4, v, false, 4.6));
reg('handcart', 10.5, 3.6, 4, (P, u, v) => handcart(P, u, v + 0.5, true));
reg('fence', 8.6, 0.8, 3.4, (P, u, v) => bambooFence(P, u + 0.3, v + 0.4, 8, true));
reg('tsukubai', 5.4, 4.4, 1.6, (P, u, v) => tsukubai(P, u + 3.2, v + 2));
reg('well', 6.8, 6.8, 8, (P, u, v) => well(P, u + 3.4, v + 3.4));
reg('hasa', 12.8, 1.2, 6, (P, u, v) => hasa(P, u + 0.4, v + 0.6, 12, true));
reg('woodpile', 6.6, 3, 3.4, (P, u, v) => woodpile(P, u, v + 0.2, 6, true));
reg('crates', 4.4, 4.4, 3.6, (P, u, v, n) => crates(P, u, v, 2 + Math.floor(n * 3), Math.floor(n * 9)));
reg('toro', 3, 3, 7, (P, u, v) => toro(P, u + 1.5, v + 1.5, 0.9));
reg('komainuA', 2.6, 2.6, 4.4, (P, u, v) => komainu(P, u + 1.3, v + 1.3, true, true));
reg('komainuUn', 2.6, 2.6, 4.4, (P, u, v) => komainu(P, u + 1.3, v + 1.3, true, false));
reg('ema', 8.4, 2, 5.8, (P, u, v) => emaRack(P, u + 0.6, v + 1, 7, true));
reg('pots', 7.2, 2.4, 2.6, (P, u, v, n) => {
  potted(P, u + 1.2, v + 1.2, 'bonsai', Math.floor(n * 20));
  potted(P, u + 3.6, v + 1.2, 'azalea', Math.floor(n * 20) + 1);
  potted(P, u + 6, v + 1.2, 'fern', Math.floor(n * 20) + 2);
});
reg('bonsai', 2.8, 2.2, 2.8, (P, u, v, n) => potted(P, u + 1.4, v + 1.1, 'bonsai', Math.floor(n * 20)));
reg('azalea', 4, 3.6, 1.6, (P, u, v, n) => bush(P, u + 2, v + 1.8, 1.7, Math.floor(n * 50), n < 0.7 ? PAL.azalea : PAL.sakura));
reg('shrub', 3.6, 3.2, 1.6, (P, u, v, n) => bush(P, u + 1.8, v + 1.6, 1.5, Math.floor(n * 50), null));
reg('wisteria', 9, 13, 7, (P, u, v, n) => wisteria(P, u + 0.5, v + 0.5, 8, 12, 7, Math.floor(n * 50)));
reg('rock', 3, 3, 1.2, (P, u, v, n) => rock(P, u + 1.5, v + 1.5, 1.1 + n * 0.4));
reg('yatai', 8.2, 5, 6.4, (P, u, v, n) => yatai(P, u, v, Math.floor(n * 7)));
// Trees: a small cast footprint (the trunk); the canopy's dappled shade is the keep's decal.
reg('pine', 4, 4, 1.5, (P, u, v, n) => {
  pine(P, u + 2, v + 2, TREE_H.pine, Math.floor(n * 99));
  tufts(P, u, v, u + 4, v + 4, 0.8, 3);
});
reg('sakura', 4, 4, 1.5, (P, u, v, n) => sakura(P, u + 2, v + 2, TREE_H.sakura, Math.floor(n * 99)));
reg('maple', 4, 4, 1.5, (P, u, v, n) => sakura(P, u + 2, v + 2, TREE_H.maple, Math.floor(n * 99), true));

const G = (w: number, items: [string, number, number][], tier = 1): Group => ({ w, items, tier });
const sk = (k: string) => 'samurai:' + k;
/**
 * What the castle town scatters: casks, bales, buckets and fire barrels along the walls; pots,
 * signboards, andon and nobori by the doors; stone lanterns, azaleas and bamboo fences along the
 * lanes; yatai stalls at the fair outside the gate; and fixed: the well, the trees, the shrine's
 * komainu, lanterns, basin and ema rack, the keep's lanterns, the physician's wisteria.
 */
registerTheme('samurai', {
  groups: {
    wall: [
      G(3, [[sk('komodaru'), 0, 0]]),
      G(3, [[sk('tawara'), 0, 0]]),
      G(2, [[sk('crates'), 0, 0], [sk('oke'), 5, 0.6]]),
      G(2, [[sk('woodpile'), 0, 0]]),
      G(2, [[sk('tenbosui'), 0, 0]], 2),
      G(2, [[sk('pots'), 0, 0]], 2),
      G(2, [[sk('bonsai'), 0, 0], [sk('azalea'), 3.4, 0]]),
      G(2, [[sk('azalea'), 0, 0], [sk('pots'), 4.4, 0]], 2),
      G(1, [[sk('handcart'), 0, 0.4]], 2),
      G(1, [[sk('komodaru2'), 0, 0], [sk('oke2'), 6.2, 0.4]]),
    ],
    door: [G(3, [[sk('andon'), 0, 0], [sk('azalea'), 2.4, 0]], 2), G(3, [[sk('pots'), 0, 0]]), G(2, [[sk('azalea'), 0, 0], [sk('bonsai'), 4.4, 0]]), G(2, [[sk('kanban'), 0, 0], [sk('azalea'), 1.8, 0]], 2), G(2, [[sk('nobori'), 0, 0], [sk('nobori'), 3, 0]], 3), G(1, [[sk('oke2'), 0, 0]])],
    road: [G(3, [[sk('toro'), 0, 0]], 2), G(3, [[sk('azalea'), 0, 0]]), G(2, [[sk('andon'), 0, 0]], 2), G(1, [[sk('fence'), 0, 0]], 2), G(1, [[sk('shrub'), 0, 0], [sk('rock'), 4, 0]]), G(1, [[sk('nobori'), 0, 0]], 2)],
    yard: [G(2, [[sk('rock'), 0, 0], [sk('shrub'), 3.4, 0]]), G(1, [[sk('oke2'), 0, 0]]), G(1, [[sk('tawara3'), 0, 0]])],
    market: [
      G(3, [[sk('yatai'), 0, 0]]),
      G(1, [[sk('yatai'), 0, 0], [sk('komodaru2'), 9, 0.4]], 3),
      G(1, [[sk('handcart'), 0, 0]]),
      G(1, [[sk('tawara'), 0, 0], [sk('oke2'), 9, 0.4]], 2),
    ],
  },
  near: {
    granary: [G(3, [[sk('tawara'), 0, 0], [sk('tawara3'), 9, 0]]), G(2, [[sk('hasa'), 0, 0.6]], 2), G(2, [[sk('handcart'), 0, 0.5]], 2), G(2, [[sk('komodaru'), 0, 0]]), G(1, [[sk('oke2'), 0, 0]])],
    stables: [G(3, [[sk('tawara'), 0, 0]]), G(2, [[sk('oke2'), 0, 0], [sk('tawara3'), 4.4, 0]]), G(2, [['trough', 0, 0], [sk('oke'), 7.6, 0.4]]), G(1, [[sk('woodpile'), 0, 0]]), G(1, [[sk('handcart'), 0, 0.5]], 2)],
    workshop: [G(3, [[sk('woodpile'), 0, 0]]), G(2, [[sk('crates'), 0, 0], [sk('oke'), 5, 0.4]]), G(2, [[sk('tawara3'), 0, 0]]), G(1, [[sk('handcart'), 0, 0.4]], 2), G(1, [[sk('kanban'), 0, 0]], 2)],
    hospital: [G(3, [[sk('pots'), 0, 0]]), G(2, [[sk('bonsai'), 0, 0], [sk('azalea'), 3.4, 0]]), G(2, [[sk('azalea'), 0, 0]]), G(1, [[sk('oke2'), 0, 0]]), G(1, [[sk('andon'), 0, 0]], 2)],
    chapter: [G(3, [[sk('komodaru'), 0, 0]], 2), G(2, [[sk('toro'), 0, 0]]), G(2, [[sk('azalea'), 0, 0]]), G(1, [[sk('bonsai'), 0, 0]], 2)],
    barracks: [G(3, [[sk('tenbosui'), 0, 0], [sk('oke'), 4.6, 0.6]]), G(2, [[sk('crates'), 0, 0], [sk('oke2'), 5, 0]]), G(2, [[sk('woodpile'), 0, 0]]), G(2, [[sk('nobori'), 0, 0], [sk('nobori'), 3, 0]], 2), G(1, [[sk('kanban'), 0, 0]], 2)],
    keep: [G(3, [[sk('tenbosui'), 0, 0]], 2), G(2, [[sk('komodaru'), 0, 0]]), G(2, [[sk('nobori'), 0, 0], [sk('nobori'), 3, 0], [sk('nobori'), 6, 0]], 2), G(1, [[sk('pots'), 0, 0]], 3)],
    range: [G(3, [[sk('tawara'), 0, 0]]), G(2, [[sk('oke2'), 0, 0]]), G(1, [[sk('fence'), 0, 0]], 2)],
    walls: [G(3, [[sk('woodpile'), 0, 0]]), G(2, [[sk('komodaru'), 0, 0]]), G(2, [[sk('tenbosui'), 0, 0]], 2), G(1, [[sk('tawara'), 0, 0]]), G(1, [[sk('handcart'), 0, 0.5]], 2)],
  },
  market: [[262, 103], [276, 104], [290, 103], [262, 128], [278, 129], [294, 128], [304, 104], [308, 130], [200, 124]],
  fixed: [
    [sk('well'), 75.6, 63.6, 1],
    ...TREES.map((t) => [sk(t.kind), t.u - 2, t.v - 2, 0] as [string, number, number, number]),
    // The shrine's approach (from the stone tier): lanterns and guardians in pairs, the basin, the ema.
    [sk('komainuA'), 127.7, 18.2, 2],
    [sk('komainuUn'), 127.7, 32.2, 2],
    [sk('toro'), 131.5, 16.5, 2],
    [sk('toro'), 131.5, 34, 2],
    [sk('tsukubai'), 116, 38.5, 2],
    [sk('ema'), 95.6, 39.8, 3],
    // The keep's entrance lanterns and the physician's wisteria arbour.
    [sk('toro'), 57.5, 25.5, 2],
    [sk('toro'), 57.5, 45, 2],
    [sk('wisteria'), 87, 189, 2],
  ],
});

/** Unused-import guard for helpers kept for the kit. */
export const _keep = { frustum };
