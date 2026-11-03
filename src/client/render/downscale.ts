// Pixel-art 2× reduction for the HD 64 battle art: the 128 (level 8) figures halved to 64 (level 4)
// once per sheet, at paint time, in the worker (see docs/art-references/hd64-downscale.md for the
// candidates compared and why `feature` won).
//
// Every candidate works on 2×2 source blocks laid on the figure's foot point (so a figure that
// stands still keeps the same blocks from frame to frame and does not shimmer), never mixes
// colours (each output pixel is one of its block's own source colours, so the sheet stays on the
// faction palette), and decides alpha by coverage.

import type { KindSheet } from './contract.ts';

/** One frame: packed RGBA (little-endian, alpha in the top byte), its size and foot point. */
export interface HalfTile {
  px: Uint32Array;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** A 2× reduction; (px, py) in {0, 1} moves the block grid by one source pixel. */
export type Halver = (t: HalfTile, px?: number, py?: number) => HalfTile;

const A = (v: number): number => v >>> 24;
/** Perceived lightness, 0..255 (Rec. 601 luma on the sRGB bytes: cheap and good enough to rank). */
const luma = (v: number): number => (v & 255) * 0.299 + ((v >>> 8) & 255) * 0.587 + ((v >>> 16) & 255) * 0.114;

/** The block grid of a tile: block (bx, by) covers source (x0 + 2bx .. +1, y0 + 2by .. +1). */
function grid(t: HalfTile, px = 0, py = 0): { w: number; h: number; x0: number; y0: number; ax: number; ay: number } {
  // Blocks are laid from the foot pixel (anchor-relative), shifted back by the phase: phase 0
  // starts a block at the foot pixel, phase 1 ends one there.
  const ox = t.ax - px, oy = t.ay - py;
  const bx0 = Math.floor(-ox / 2), by0 = Math.floor(-oy / 2);
  const bx1 = Math.floor((t.w - 1 - ox) / 2), by1 = Math.floor((t.h - 1 - oy) / 2);
  return { w: bx1 - bx0 + 1, h: by1 - by0 + 1, x0: ox + 2 * bx0, y0: oy + 2 * by0, ax: -bx0, ay: -by0 };
}

/** Source pixel or 0 (transparent) outside the tile. */
const at = (t: HalfTile, x: number, y: number): number => (x < 0 || y < 0 || x >= t.w || y >= t.h ? 0 : t.px[y * t.w + x]!);

/** The four source pixels of block (bx, by), in reading order. */
function block(t: HalfTile, g: ReturnType<typeof grid>, bx: number, by: number, out: Uint32Array): void {
  const x = g.x0 + 2 * bx, y = g.y0 + 2 * by;
  out[0] = at(t, x, y);
  out[1] = at(t, x + 1, y);
  out[2] = at(t, x, y + 1);
  out[3] = at(t, x + 1, y + 1);
}

/**
 * Alpha by coverage: solid (alpha 255) pixels decide; at 2 of 4 the block is kept (thin parts
 * survive and the silhouette errs a hair fat, as hand reductions do); a translucent ground
 * shadow fills what the figure leaves when it covers at least 2 of 4.
 */
function solidCount(b: Uint32Array): number {
  let n = 0;
  for (let i = 0; i < 4; i++) if (A(b[i]!) === 255) n++;
  return n;
}
function shadowOf(b: Uint32Array): number {
  let n = 0, v = 0;
  for (let i = 0; i < 4; i++) {
    const a = A(b[i]!);
    if (a > 0) {
      n++;
      if (a < 255) v = b[i]!;
    }
  }
  return n >= 2 ? v : 0;
}

/** The most frequent solid colour of a block; ties go to `tie(a, b)` (true: a beats b). */
function modeOf(b: Uint32Array, tie: (a: number, b: number) => boolean): [number, number] {
  let best = 0, bestN = 0;
  for (let i = 0; i < 4; i++) {
    const v = b[i]!;
    if (A(v) !== 255) continue;
    let n = 0;
    for (let j = 0; j < 4; j++) if (b[j] === v) n++;
    if (n > bestN || (n === bestN && v !== best && tie(v, best))) {
      best = v;
      bestN = n;
    }
  }
  return [best, bestN];
}

function simple(pick: (b: Uint32Array, t: HalfTile, x: number, y: number) => number): Halver {
  return (t, px = 0, py = 0) => {
    const g = grid(t, px, py);
    const out = new Uint32Array(g.w * g.h);
    const b = new Uint32Array(4);
    for (let by = 0; by < g.h; by++)
      for (let bx = 0; bx < g.w; bx++) {
        block(t, g, bx, by, b);
        out[by * g.w + bx] = solidCount(b) >= 2 ? pick(b, t, g.x0 + 2 * bx, g.y0 + 2 * by) : shadowOf(b);
      }
    return { px: out, w: g.w, h: g.h, ax: g.ax, ay: g.ay };
  };
}

const darker = (a: number, b: number): boolean => luma(a) < luma(b);

/** Candidate A, nearest: the block's top-left pixel (what a plain 50% nearest-neighbour resize does). */
export const nearest: Halver = (t, px = 0, py = 0) => {
  const g = grid(t, px, py);
  const out = new Uint32Array(g.w * g.h);
  for (let by = 0; by < g.h; by++) for (let bx = 0; bx < g.w; bx++) out[by * g.w + bx] = at(t, g.x0 + 2 * bx, g.y0 + 2 * by);
  return { px: out, w: g.w, h: g.h, ax: g.ax, ay: g.ay };
};

/** Candidate B, mean-snap (k-centroid with k = 1): the block's colour nearest its RGB mean. */
export const meanSnap: Halver = simple((b) => {
  let r = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const v = b[i]!;
    if (A(v) !== 255) continue;
    r += v & 255;
    gg += (v >>> 8) & 255;
    bb += (v >>> 16) & 255;
    n++;
  }
  r /= n;
  gg /= n;
  bb /= n;
  let best = 0, bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const v = b[i]!;
    if (A(v) !== 255) continue;
    const d = ((v & 255) - r) ** 2 + (((v >>> 8) & 255) - gg) ** 2 + (((v >>> 16) & 255) - bb) ** 2;
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
});

/** Candidate C, mode: the block's most frequent colour, ties to the darker. */
export const mode: Halver = simple((b) => modeOf(b, darker)[0]);

/**
 * Candidate D, contrast (after PixelOE's contrast downsampler): on lightness, a block whose
 * median sits below its mean (a few bright pixels in a dark block: keep the dark detail) takes
 * its darkest pixel, the other way round its brightest, otherwise the mode.
 */
export const contrast: Halver = simple((b) => {
  const s: number[] = [];
  for (let i = 0; i < 4; i++) if (A(b[i]!) === 255) s.push(b[i]!);
  const ls = s.map(luma).sort((p, q) => p - q);
  const mean = ls.reduce((p, q) => p + q, 0) / ls.length;
  const med = ls.length % 2 ? ls[ls.length >> 1]! : (ls[ls.length / 2 - 1]! + ls[ls.length / 2]!) / 2;
  const pickL = med < mean - 8 ? ls[0]! : med > mean + 8 ? ls[ls.length - 1]! : -1;
  if (pickL < 0) return modeOf(b, darker)[0];
  return s.find((v) => luma(v) === pickL)!;
});

/**
 * Candidate E, feature-aware mode (the one the game uses). Per 2×2 block:
 * 1. Alpha by coverage (≥ 2 of 4 solid), then a 1-of-4 block is kept where dropping it would cut
 *    the silhouette in two (spear shafts, bow strings, banner poles stay connected).
 * 2. On the reduced silhouette's edge, the outline survives: the block's source rim colour
 *    (a solid pixel with a transparent neighbour) wins, darkest first.
 * 3. Inside, the mode; ties go to the colour rarer in the 12 source pixels ringing the block, so a
 *    1-px line or band crossing the block beats the flat field it crosses; an even tie (the two
 *    sides of a plain edge) goes to the darker, so edges move consistently and stay straight.
 * 4. A lone specular: a single pixel much lighter than everything in the 4×4 around it keeps the
 *    block (the glint on a helm or a blade tip survives the halving).
 */
export const feature: Halver = (t, px = 0, py = 0) => {
  const g = grid(t, px, py);
  const W = g.w, H = g.h;
  const solid = new Uint8Array(W * H);
  const cov = new Uint8Array(W * H);
  const b = new Uint32Array(4);
  for (let by = 0; by < H; by++)
    for (let bx = 0; bx < W; bx++) {
      block(t, g, bx, by, b);
      const n = solidCount(b);
      cov[by * W + bx] = n;
      if (n >= 2) solid[by * W + bx] = 1;
    }
  // Bridges: a 1-of-4 block whose solid neighbours fall into two or more separate runs around it.
  const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const isS = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] === 1;
  const keep: number[] = [];
  for (let by = 0; by < H; by++)
    for (let bx = 0; bx < W; bx++) {
      if (cov[by * W + bx] !== 1) continue;
      let runs = 0;
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = ring[k]!, [px, py] = ring[(k + 7) % 8]!;
        if (isS(bx + dx!, by + dy!) && !isS(bx + px!, by + py!)) runs++;
      }
      if (runs >= 2) keep.push(by * W + bx);
    }
  for (const i of keep) solid[i] = 1;

  const rimMask = rimOf(t);
  const isRim = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < t.w && y < t.h && rimMask[y * t.w + x] === 1;
  const out = new Uint32Array(W * H);
  /** Pixels kept for a lone specular (the clean-up leaves them). */
  const glint = new Uint8Array(W * H);
  const ring12 = new Uint32Array(12);
  for (let by = 0; by < H; by++)
    for (let bx = 0; bx < W; bx++) {
      const o = by * W + bx;
      block(t, g, bx, by, b);
      if (!solid[o]) {
        out[o] = shadowOf(b);
        continue;
      }
      const sx = g.x0 + 2 * bx, sy = g.y0 + 2 * by;
      const edge = !isS(bx - 1, by) || !isS(bx + 1, by) || !isS(bx, by - 1) || !isS(bx, by + 1);
      // Flat inside block: nothing to decide.
      if (!edge && b[0] === b[1] && b[0] === b[2] && b[0] === b[3]) {
        out[o] = b[0]!;
        continue;
      }
      if (edge) {
        let rim = 0, rimN = 0;
        for (let i = 0; i < 4; i++) {
          const x = sx + (i & 1), y = sy + (i >> 1);
          if (!isRim(x, y)) continue;
          const v = b[i]!;
          let n = 0;
          for (let j = 0; j < 4; j++) if (b[j] === v && isRim(sx + (j & 1), sy + (j >> 1))) n++;
          if (n > rimN || (n === rimN && luma(v) < luma(rim))) {
            rim = v;
            rimN = n;
          }
        }
        if (rimN) {
          out[o] = rim;
          continue;
        }
      }
      // The surroundings: the 12 source pixels ringing the block.
      let ctx = 0, cn = 0;
      for (let y = sy - 1; y <= sy + 2; y++)
        for (let x = sx - 1; x <= sx + 2; x++) {
          if (x >= sx && x <= sx + 1 && y >= sy && y <= sy + 1) continue;
          const v = at(t, x, y);
          if (A(v) !== 255) continue;
          ctx += luma(v);
          cn++;
          ring12[cn - 1] = v;
        }
      const c = cn ? ctx / cn : 128;
      // A tie goes to the colour rarer in the ring: a thin line or band crossing a field has few
      // ring pixels of its own, while the two sides of a plain edge have about as many each (and
      // then the darker wins, so an edge moves the same way all along its length, not raggedly).
      const rare = (v: number) => {
        let n = 0;
        for (let i = 0; i < cn; i++) if (ring12[i] === v) n++;
        return n;
      };
      let [best, bestN] = modeOf(b, (p, q) => {
        const rp = rare(p), rq = rare(q);
        return rp < rq - 1 || (Math.abs(rp - rq) <= 1 && luma(p) < luma(q));
      });
      // Lone specular.
      if (bestN < 4) {
        let hi = 0, hiL = -1, second = -1;
        for (let i = 0; i < 4; i++) {
          if (A(b[i]!) !== 255) continue;
          const l = luma(b[i]!);
          if (l > hiL) {
            second = hiL;
            hiL = l;
            hi = b[i]!;
          } else if (l > second) second = l;
        }
        if (hi !== best && hiL - Math.max(second, c) > 40) {
          let brighter = 0;
          for (let y = sy - 1; y <= sy + 2; y++) for (let x = sx - 1; x <= sx + 2; x++) if (luma(at(t, x, y)) >= hiL - 10 && A(at(t, x, y)) === 255) brighter++;
          if (brighter <= 2) {
            best = hi;
            glint[o] = 1;
          }
        }
      }
      out[o] = best;
    }
  return { px: out, w: W, h: H, ax: g.ax, ay: g.ay, glint } as HalfTile & { glint: Uint8Array };
};

/** Solid source pixels with a non-solid side neighbour (the outline), per tile (cached). */
const RIMS = new WeakMap<Uint32Array, Uint8Array>();
function rimOf(t: HalfTile): Uint8Array {
  let r = RIMS.get(t.px);
  if (r) return r;
  r = new Uint8Array(t.w * t.h);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++)
      if (A(t.px[y * t.w + x]!) === 255 && (A(at(t, x - 1, y)) !== 255 || A(at(t, x + 1, y)) !== 255 || A(at(t, x, y - 1)) !== 255 || A(at(t, x, y + 1)) !== 255)) r[y * t.w + x] = 1;
  RIMS.set(t.px, r);
  return r;
}

/**
 * Orphan clean-up after a reduction (mistakes guide 2.2): an inside pixel that matches none of
 * its eight neighbours, where three of its four side neighbours share a colour of nearly the
 * same lightness (a ramp neighbour, ΔL < 28 of 255), takes that colour. High-contrast singles
 * (an eye socket, a rivet, a kept glint) stay: they are detail, not noise.
 */
export function cleanOrphans(t: HalfTile & { glint?: Uint8Array }): HalfTile {
  const { w, h } = t;
  const src = t.px, out = new Uint32Array(src);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, v = src[i]!;
      if (A(v) !== 255 || t.glint?.[i]) continue;
      const n4 = [src[i - 1]!, src[i + 1]!, src[i - w]!, src[i + w]!];
      if (n4.some((q) => A(q) !== 255)) continue;
      let lone = true;
      for (let dy = -1; dy <= 1 && lone; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && src[i + dy * w + dx] === v) lone = false;
      if (!lone) continue;
      for (const q of n4) {
        let n = 0;
        for (const r of n4) if (r === q) n++;
        if (n >= 3 && Math.abs(luma(q) - luma(v)) < 28) {
          out[i] = q;
          break;
        }
      }
    }
  return { px: out, w, h, ax: t.ax, ay: t.ay };
}

/** Candidate F: `feature`, then the orphan clean-up. */
export const featureClean: Halver = (t, px = 0, py = 0) => cleanOrphans(feature(t, px, py));

export const HALVERS: Record<string, Halver> = { nearest, meanSnap, mode, contrast, feature, featureClean };

/** The tile of slot `s` of a sheet (null when the slot is empty). */
export function tileOf(sh: KindSheet, s: number): HalfTile | null {
  const r = sh.rects;
  const w = r[s * 6 + 2]!, h = r[s * 6 + 3]!;
  if (w <= 0 || h <= 0) return null;
  const u = r[s * 6]!, v = r[s * 6 + 1]!;
  const page = new Uint32Array(sh.pixels.buffer, sh.pixels.byteOffset, sh.width * sh.height);
  const px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) px.set(page.subarray((v + y) * sh.width + u, (v + y) * sh.width + u + w), y * w);
  return { px, w, h, ax: r[s * 6 + 4]!, ay: r[s * 6 + 5]! };
}

/** Shelf-packs tiles (by slot) into one page: what paintSheet does for painted frames. */
export function packTiles(tiles: (HalfTile & { slot: number })[], slots: number, level: number, ms: number): KindSheet {
  const area = tiles.reduce((s, t) => s + (t.w + 1) * (t.h + 1), 0);
  const maxW = tiles.reduce((m, t) => Math.max(m, t.w + 1), 0);
  const pageW = Math.min(4096, Math.max(maxW, Math.ceil(Math.sqrt(area) * 1.08)));
  const order = tiles.map((_, i) => i).sort((p, q) => tiles[q]!.h - tiles[p]!.h);
  const pos: [number, number][] = new Array<[number, number]>(tiles.length);
  let x = 0, y = 0, rowH = 0;
  for (const i of order) {
    const t = tiles[i]!;
    if (x + t.w > pageW) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    pos[i] = [x, y];
    x += t.w + 1;
    rowH = Math.max(rowH, t.h);
  }
  const pageH = y + rowH;
  const page = new Uint32Array(pageW * pageH);
  const rects = new Int32Array(slots * 6);
  tiles.forEach((t, i) => {
    const [px0, py0] = pos[i]!;
    for (let r = 0; r < t.h; r++) page.set(t.px.subarray(r * t.w, (r + 1) * t.w), (py0 + r) * pageW + px0);
    rects.set([px0, py0, t.w, t.h, t.ax, t.ay], t.slot * 6);
  });
  return { level, width: pageW, height: pageH, pixels: new Uint8ClampedArray(page.buffer), rects, ms };
}

/**
 * How much of two reduced frames differs (share of their opaque union), feet aligned, after the
 * best shift of up to one pixel either way (the body may have moved on purpose).
 */
export function frameDiff(a: HalfTile, b: HalfTile): number {
  // Both frames on one canvas with a 1-px margin, feet on the same point.
  const x0 = Math.min(-a.ax, -b.ax) - 1, y0 = Math.min(-a.ay, -b.ay) - 1;
  const W = Math.max(a.w - a.ax, b.w - b.ax) + 1 - x0, H = Math.max(a.h - a.ay, b.h - b.ay) + 1 - y0;
  const put = (t: HalfTile): Uint32Array => {
    const c = new Uint32Array(W * H);
    const ox = -t.ax - x0, oy = -t.ay - y0;
    for (let y = 0; y < t.h; y++) c.set(t.px.subarray(y * t.w, (y + 1) * t.w), (oy + y) * W + ox);
    return c;
  };
  const A2 = put(a), B2 = put(b);
  let best = 1;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      let uni = 0, ch = 0;
      const off = dy * W + dx;
      for (let y = 1; y < H - 1; y++)
        for (let i = y * W + 1, e = y * W + W - 1; i < e; i++) {
          const p = A2[i]!, q = B2[i + off]!;
          if (p === q) {
            if (p) uni++;
          } else {
            uni++;
            ch++;
          }
        }
      // A shifted match costs a little, so a still figure prefers to stay put.
      const d = (uni ? ch / uni : 0) + (dx || dy ? 0.01 : 0);
      if (d < best) best = d;
    }
  return best;
}

/**
 * A sheet halved: every frame reduced 2× by `how` (default: the game's choice) and packed
 * again. A level-8 sheet comes back as level 4 (the HD 64 art: same map size, half the texels).
 *
 * Temporal phase: a fixed 2×2 grid turns every 1-px move of the source (a breath, a nod) into a
 * different sampling of the whole part, so a halved idle boils. With `steady` (default) each
 * frame tries the four grid phases and keeps the one closest to the frame before it (the slots
 * of a run of frames are consecutive), which keeps still parts still. The foot point moves by at
 * most one source pixel (1/8 of a map pixel).
 */
export function halveSheet(sh: KindSheet, how: Halver = feature, steady = true): KindSheet {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const slots = sh.rects.length / 6;
  const tiles: (HalfTile & { slot: number })[] = [];
  let prev: HalfTile | null = null;
  for (let s = 0; s < slots; s++) {
    const t = tileOf(sh, s);
    if (!t) {
      prev = null;
      continue;
    }
    // The phase is chosen on the cheap nearest-pixel reduction (it is the most phase-sensitive,
    // so the best match there is the best grid), then the real reduction runs once.
    let phase: readonly [number, number] = [0, 0];
    let probe = nearest(t);
    if (steady && prev) {
      let bestD = frameDiff(probe, prev);
      for (const ph of [[1, 0], [0, 1], [1, 1]] as const) {
        if (bestD === 0) break;
        const o = nearest(t, ph[0], ph[1]);
        // A small bias toward phase 0, so ties do not wander.
        const d = frameDiff(o, prev) + 0.002;
        if (d < bestD) {
          bestD = d;
          probe = o;
          phase = ph;
        }
      }
    }
    tiles.push({ ...how(t, phase[0], phase[1]), slot: s });
    prev = probe;
  }
  const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  return packTiles(tiles, slots, sh.level / 2, sh.ms + ms);
}
