// Pure pixel-art metrics on RGBA images at native resolution (1 art pixel = 1 image pixel).
// The checks follow docs/art-references/pixel-art-mistakes.md (checklist rows 1-17) and the
// measurable items of pixel-art-techniques.md §8. No DOM, no randomness: the same image always
// gives the same numbers.

/** An RGBA image. */
export interface Img {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}

/** Which pixels belong to the subject (the figure, the building, the drawing). */
export type Mask = Uint8Array;

export const img = (w: number, h: number): Img => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

export function crop(src: Img, x0: number, y0: number, w: number, h: number): Img {
  const out = img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const i = (sy * src.w + sx) * 4, o = (y * w + x) * 4;
      out.d[o] = src.d[i]!;
      out.d[o + 1] = src.d[i + 1]!;
      out.d[o + 2] = src.d[i + 2]!;
      out.d[o + 3] = src.d[i + 3]!;
    }
  return out;
}

/** Nearest-neighbour upscale by an integer factor. */
export function upscale(src: Img, k: number): Img {
  const out = img(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const i = (((y / k) | 0) * src.w + ((x / k) | 0)) * 4, o = (y * out.w + x) * 4;
      out.d.set(src.d.subarray(i, i + 4), o);
    }
  return out;
}

/** Composites `src` over a flat background colour (for thumbnails and contrast tests). */
export function over(src: Img, bg: [number, number, number]): Img {
  const out = img(src.w, src.h);
  for (let i = 0; i < src.w * src.h; i++) {
    const a = src.d[i * 4 + 3]! / 255;
    for (let c = 0; c < 3; c++) out.d[i * 4 + c] = Math.round(src.d[i * 4 + c]! * a + bg[c]! * (1 - a));
    out.d[i * 4 + 3] = 255;
  }
  return out;
}

export const key = (m: Img, i: number): number => (m.d[i * 4]! << 16) | (m.d[i * 4 + 1]! << 8) | m.d[i * 4 + 2]!;

// ------------------------------------------------------------------ colour

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LIN = Float64Array.from({ length: 256 }, (_, i) => lin(i));

/** OKLab of an sRGB colour (Ottosson). */
export function oklab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r]!, G = LIN[g]!, B = LIN[b]!;
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLCH: lightness, chroma, hue in degrees. */
export function oklch(r: number, g: number, b: number): [number, number, number] {
  const [L, a, bb] = oklab(r, g, b);
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return [L, Math.hypot(a, bb), (h + 360) % 360];
}

export const hueDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Per-pixel OKLab L. */
export function lightness(m: Img): Float32Array {
  const out = new Float32Array(m.w * m.h);
  const cache = new Map<number, number>();
  for (let i = 0; i < m.w * m.h; i++) {
    const k = key(m, i);
    let L = cache.get(k);
    if (L === undefined) {
      L = oklab(m.d[i * 4]!, m.d[i * 4 + 1]!, m.d[i * 4 + 2]!)[0];
      cache.set(k, L);
    }
    out[i] = L;
  }
  return out;
}

// ------------------------------------------------------------------ masks and shapes

/** Fully opaque pixels (sprites: hard alpha; the ground shadow is partial and left out). */
export function opaque(m: Img): Mask {
  const out = new Uint8Array(m.w * m.h);
  for (let i = 0; i < out.length; i++) out[i] = m.d[i * 4 + 3] === 255 ? 1 : 0;
  return out;
}

/** Pixels that differ from a background colour by more than `tol` per channel. */
export function notBackground(m: Img, bg: number, tol = 10): Mask {
  const out = new Uint8Array(m.w * m.h);
  const br = (bg >> 16) & 255, bgc = (bg >> 8) & 255, bb = bg & 255;
  for (let i = 0; i < out.length; i++) {
    if (m.d[i * 4 + 3]! < 128) continue;
    const dr = Math.abs(m.d[i * 4]! - br), dg = Math.abs(m.d[i * 4 + 1]! - bgc), db = Math.abs(m.d[i * 4 + 2]! - bb);
    out[i] = dr > tol || dg > tol || db > tol ? 1 : 0;
  }
  return out;
}

/** The most common colour on the image border. */
export function borderColour(m: Img): number {
  const n = new Map<number, number>();
  const add = (x: number, y: number) => {
    const k = key(m, y * m.w + x);
    n.set(k, (n.get(k) ?? 0) + 1);
  };
  for (let x = 0; x < m.w; x++) {
    add(x, 0);
    add(x, m.h - 1);
  }
  for (let y = 0; y < m.h; y++) {
    add(0, y);
    add(m.w - 1, y);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export const count = (mask: Mask): number => {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i]!;
  return n;
};

/** Mask pixels with a 4-neighbour outside the mask (or the image edge): the silhouette ring. */
export function ring(mask: Mask, w: number, h: number): Mask {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) out[i] = 1;
    }
  return out;
}

/** 4-connected distance (in erosion steps) from each mask pixel to the outside; 1 on the ring. */
export function distToEdge(mask: Mask, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h).fill(-1);
  let front: number[] = [];
  const r = ring(mask, w, h);
  for (let i = 0; i < w * h; i++) if (r[i]) {
    d[i] = 1;
    front.push(i);
  }
  let k = 1;
  while (front.length) {
    const next: number[] = [];
    k++;
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !mask[j] || d[j]! >= 0) continue;
        d[j] = k;
        next.push(j);
      }
    }
    front = next;
  }
  return d;
}

/** Multi-source BFS distance (4-connected) from `src` pixels, through every pixel. */
function bfs(src: Uint8Array, w: number, h: number, through?: Mask): Int32Array {
  const d = new Int32Array(w * h).fill(-1);
  let front: number[] = [];
  for (let i = 0; i < w * h; i++) if (src[i]) {
    d[i] = 0;
    front.push(i);
  }
  let k = 0;
  while (front.length) {
    k++;
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || d[j]! >= 0 || (through && !through[j])) continue;
        d[j] = k;
        next.push(j);
      }
    }
    front = next;
  }
  return d;
}

const pearson = (u: ArrayLike<number>, v: ArrayLike<number>): number => {
  const n = u.length;
  if (n < 3) return 0;
  let mu = 0, mv = 0;
  for (let i = 0; i < n; i++) {
    mu += u[i]!;
    mv += v[i]!;
  }
  mu /= n;
  mv /= n;
  let su = 0, sv = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const a = u[i]! - mu, b = v[i]! - mv;
    su += a * a;
    sv += b * b;
    c += a * b;
  }
  return su > 0 && sv > 0 ? c / Math.sqrt(su * sv) : 0;
};

// ------------------------------------------------------------------ 5, 7, 14: colours and clusters

export interface ColourStats {
  colours: number;
  /** Colours used by at most two pixels. */
  rare: number;
  /** Pairs of colours closer than ΔE_OK 0.03. */
  nearDup: number;
  pureBlack: number;
  nearBlack: number;
  pureWhite: number;
  nearWhite: number;
}

export function colourStats(m: Img, mask: Mask): ColourStats {
  const n = new Map<number, number>();
  let pureBlack = 0, nearBlack = 0, pureWhite = 0, nearWhite = 0;
  for (let i = 0; i < m.w * m.h; i++) {
    if (!mask[i]) continue;
    const r = m.d[i * 4]!, g = m.d[i * 4 + 1]!, b = m.d[i * 4 + 2]!;
    const k = (r << 16) | (g << 8) | b;
    n.set(k, (n.get(k) ?? 0) + 1);
    if (k === 0) pureBlack++;
    if (Math.max(r, g, b) <= 12) nearBlack++;
    if (k === 0xffffff) pureWhite++;
    if (Math.min(r, g, b) >= 245) nearWhite++;
  }
  const labs = [...n.keys()].map((k) => oklab((k >> 16) & 255, (k >> 8) & 255, k & 255));
  let nearDup = 0;
  if (labs.length <= 600)
    for (let a = 0; a < labs.length; a++)
      for (let b = a + 1; b < labs.length; b++) {
        const p = labs[a]!, q = labs[b]!;
        if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.03) nearDup++;
      }
  let rare = 0;
  for (const v of n.values()) if (v <= 2) rare++;
  return { colours: n.size, rare, nearDup, pureBlack, nearBlack, pureWhite, nearWhite };
}

export interface ClusterStats {
  /** Fraction of counted pixels in same-colour 4-clusters of size 1. */
  orphanFrac: number;
  /** ... of size 1 or 2. */
  smallFrac: number;
  /** Mean same-colour cluster size. */
  meanCluster: number;
  /** Fraction of 4-neighbour pairs inside the mask with different colours. */
  edgeDensity: number;
  /** Indices of orphan pixels (for overlays). */
  orphans: number[];
}

/**
 * Same-colour 4-connected clusters. `skip` pixels (outline, emissive) are neither counted nor
 * merged with; they still bound the clusters.
 */
export function clusterStats(m: Img, mask: Mask, skip?: Uint8Array): ClusterStats {
  const { w, h } = m;
  const lab = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || lab[i0]! >= 0 || skip?.[i0]) continue;
    const id = sizes.length;
    const k0 = key(m, i0);
    let s = 0;
    stack.push(i0);
    lab[i0] = id;
    while (stack.length) {
      const i = stack.pop()!;
      s++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !mask[j] || lab[j]! >= 0 || skip?.[j] || key(m, j) !== k0) continue;
        lab[j] = id;
        stack.push(j);
      }
    }
    sizes.push(s);
  }
  let total = 0, one = 0, two = 0;
  const orphans: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const l = lab[i]!;
    if (l < 0) continue;
    total++;
    if (sizes[l] === 1) {
      one++;
      orphans.push(i);
    }
    if (sizes[l]! <= 2) two++;
  }
  let pairs = 0, diff = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x < w - 1 && mask[i + 1]) {
        pairs++;
        if (key(m, i) !== key(m, i + 1)) diff++;
      }
      if (y < h - 1 && mask[i + w]) {
        pairs++;
        if (key(m, i) !== key(m, i + w)) diff++;
      }
    }
  return {
    orphanFrac: total ? one / total : 0,
    smallFrac: total ? two / total : 0,
    meanCluster: sizes.length ? total / sizes.length : 0,
    edgeDensity: pairs ? diff / pairs : 0,
    orphans,
  };
}

// ------------------------------------------------------------------ 3, 4: jaggies and doubles

/** Run lengths of a profile (one value per column or row, -1 where empty), split into monotone stair segments. */
function profileJaggies(p: number[]): { runs: number; jaggies: number } {
  let runs = 0, jaggies = 0;
  let seg: number[] = [];
  let dir = 0;
  const flush = () => {
    // seg holds run lengths of one monotone staircase; first and last runs are cut by the ends.
    runs += Math.max(0, seg.length - 2);
    // Is seg periodic with period p over [lo, hi]? (A clean line repeats its run pattern.)
    const periodic = (lo: number, hi: number, p: number) => {
      for (let j = lo; j + p <= hi; j++) if (seg[j] !== seg[j + p]) return false;
      return true;
    };
    for (let i = 1; i < seg.length - 1; i++) {
      const a = seg[i - 1]!, b = seg[i]!, c = seg[i + 1]!;
      // A spike: one run far off both neighbours (3,1,3).
      const spike = Math.abs(b - a) > 1 && Math.abs(b - c) > 1;
      // A reversal (the run lengths go up then down, or down then up) that is not part of a
      // regular repeating pattern (2,1,2,1 or 1,1,2,1,1,2): a curve's runs should change
      // monotonically and a line's should repeat.
      let rev = false;
      if ((b - a) * (c - b) < 0 && seg.length >= 5) {
        const lo = Math.max(1, i - 3), hi = Math.min(seg.length - 2, i + 3);
        rev = hi - lo >= 3 && !periodic(lo, hi, 2) && !periodic(lo, hi, 3);
      }
      // Long flat runs (> 8) are straight edges meeting a step, not a broken line.
      if ((spike || rev) && Math.min(a, b, c) <= 8) jaggies++;
    }
    seg = [];
    dir = 0;
  };
  let run = 0;
  for (let i = 0; i < p.length; i++) {
    const v = p[i]!;
    if (v < 0) {
      if (run) seg.push(run);
      flush();
      run = 0;
      continue;
    }
    if (i === 0 || p[i - 1]! < 0) {
      run = 1;
      continue;
    }
    const d = v - p[i - 1]!;
    if (d === 0) {
      run++;
      continue;
    }
    if (Math.abs(d) > 1 || (dir && Math.sign(d) !== dir)) {
      seg.push(run);
      flush();
      run = 1;
      dir = Math.abs(d) > 1 ? 0 : Math.sign(d);
      continue;
    }
    dir = Math.sign(d);
    seg.push(run);
    run = 1;
  }
  if (run) seg.push(run);
  flush();
  return { runs, jaggies };
}

export interface LineStats {
  /** Jaggy runs per 32 px of silhouette edge. */
  jaggiesPer32: number;
  jaggies: number;
  edgePx: number;
  /** Fraction of ring (outline) pixels that are L-corners (doubles). */
  doublesFrac: number;
  doubles: number;
  doubleIdx: number[];
}

/** Jaggies on the four silhouette profiles of each 8-connected part, and L-corner doubles on `line`. */
export function lineStats(mask: Mask, w: number, h: number, line?: Mask): LineStats {
  // Components (8-connected) so separate parts don't share a profile.
  const comp = new Int32Array(w * h).fill(-1);
  const boxes: [number, number, number, number][] = [];
  const st: number[] = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || comp[i0]! >= 0) continue;
    const id = boxes.length;
    const b: [number, number, number, number] = [w, h, -1, -1];
    comp[i0] = id;
    st.push(i0);
    while (st.length) {
      const i = st.pop()!;
      const x = i % w, y = (i / w) | 0;
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!mask[j] || comp[j]! >= 0) continue;
          comp[j] = id;
          st.push(j);
        }
    }
    boxes.push(b);
  }
  let jag = 0;
  boxes.forEach(([x0, y0, x1, y1], id) => {
    if ((x1 - x0 + 1) * (y1 - y0 + 1) < 6) return;
    const top: number[] = [], bot: number[] = [], lef: number[] = [], rig: number[] = [];
    for (let x = x0; x <= x1; x++) {
      let t = -1, b = -1;
      for (let y = y0; y <= y1; y++) if (comp[y * w + x] === id) {
        if (t < 0) t = y;
        b = y;
      }
      top.push(t);
      bot.push(b);
    }
    for (let y = y0; y <= y1; y++) {
      let l = -1, r = -1;
      for (let x = x0; x <= x1; x++) if (comp[y * w + x] === id) {
        if (l < 0) l = x;
        r = x;
      }
      lef.push(l);
      rig.push(r);
    }
    for (const p of [top, bot, lef, rig]) jag += profileJaggies(p).jaggies;
  });
  const rg = ring(mask, w, h);
  const edgePx = count(rg);
  const L = line ?? rg;
  let doubles = 0, lineN = 0;
  const doubleIdx: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!L[i]) continue;
      lineN++;
      const n = L[i - w]!, s = L[i + w]!, e = L[i + 1]!, wv = L[i - 1]!;
      const diag = L[i - w - 1]! + L[i - w + 1]! + L[i + w - 1]! + L[i + w + 1]!;
      const orth = n + s + e + wv;
      // Exactly two line neighbours, one vertical and one horizontal (so they touch diagonally):
      // the pixel is redundant for 8-connectivity, an L-corner "double".
      if (orth === 2 && diag === 0 && n + s === 1 && e + wv === 1) {
        doubles++;
        doubleIdx.push(i);
      }
    }
  return { jaggiesPer32: edgePx ? (jag * 32) / edgePx : 0, jaggies: jag, edgePx, doublesFrac: lineN ? doubles / lineN : 0, doubles, doubleIdx };
}

// ------------------------------------------------------------------ 1, 11: pillow shading, light direction

export interface ShadeStats {
  corrEdge: number;
  corrLight: number;
  /** Degrees between (luminance centroid - mask centroid) and the key light. */
  lightAngleErr: number;
}

/** `light`: unit 2D direction toward the key light in image space (y down). */
export function shadeStats(m: Img, mask: Mask, light: [number, number], regions?: Int32Array): ShadeStats {
  const { w, h } = m;
  const L = lightness(m);
  const corr = (sel: Mask) => {
    const dist = distToEdge(sel, w, h);
    let mx = 0, my = 0, n = 0;
    for (let i = 0; i < w * h; i++) if (sel[i]) {
      mx += i % w;
      my += (i / w) | 0;
      n++;
    }
    mx /= n || 1;
    my /= n || 1;
    const lv: number[] = [], dv: number[] = [], av: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (!sel[i]) continue;
      lv.push(L[i]!);
      dv.push(dist[i]!);
      av.push(((i % w) - mx) * light[0] + (((i / w) | 0) - my) * light[1]);
    }
    return { e: pearson(lv, dv), l: pearson(lv, av), n: lv.length };
  };
  let corrEdge: number, corrLight: number;
  if (regions) {
    // Per material region, weighted by size (regions below 24 px are too small to shade).
    const ids = new Map<number, number>();
    for (let i = 0; i < w * h; i++) if (mask[i] && regions[i]! >= 0) ids.set(regions[i]!, (ids.get(regions[i]!) ?? 0) + 1);
    let se = 0, sl = 0, sn = 0;
    const sel = new Uint8Array(w * h);
    for (const [id, n] of ids) {
      if (n < 24) continue;
      for (let i = 0; i < w * h; i++) sel[i] = regions[i] === id ? 1 : 0;
      const c = corr(sel);
      se += c.e * c.n;
      sl += c.l * c.n;
      sn += c.n;
    }
    corrEdge = sn ? se / sn : 0;
    corrLight = sn ? sl / sn : 0;
  } else {
    const c = corr(mask);
    corrEdge = c.e;
    corrLight = c.l;
  }
  // Light direction: luminance-weighted centroid minus plain centroid. With regions, per region
  // (so a white surcoat beside a dark shield doesn't read as light), summed by size.
  const acc = new Map<number, number[]>();
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const id = regions ? regions[i]! : 0;
    if (id < 0) continue;
    let a = acc.get(id);
    if (!a) acc.set(id, (a = [0, 0, 0, 0, 0, 0]));
    const x = i % w, y = (i / w) | 0;
    a[0]! += x;
    a[1]! += y;
    a[2]!++;
    a[3]! += x * L[i]!;
    a[4]! += y * L[i]!;
    a[5]! += L[i]!;
  }
  let vx = 0, vy = 0;
  for (const [mx, my, n, lx, ly, ls] of acc.values()) {
    if (n! < (regions ? 12 : 1)) continue;
    vx += (lx! / (ls! || 1) - mx! / n!) * n!;
    vy += (ly! / (ls! || 1) - my! / n!) * n!;
  }
  const ang = Math.acos(Math.max(-1, Math.min(1, (vx * light[0] + vy * light[1]) / (Math.hypot(vx, vy) || 1)))) * (180 / Math.PI);
  return { corrEdge, corrLight, lightAngleErr: ang };
}

// ------------------------------------------------------------------ 2: banding

export interface BandStats {
  /** Fraction of interior colour-boundary pixels running at a constant short distance from the silhouette (hugging, concentric bands). */
  hug: number;
  /** Fraction of mask pixels that are one-pixel steps of a monotone 3-colour stack (AA banding, 1-px ramp bands). */
  stack: number;
  /** Fraction of interior colour boundaries whose straight segments end on the same row/column as a parallel boundary (aligned endpoints). */
  aligned: number;
  hugIdx: number[];
}

export function bandStats(m: Img, mask: Mask, exclude?: Mask): BandStats {
  const { w, h } = m;
  const L = lightness(m);
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = mask[i] && !exclude?.[i] ? 1 : 0;
  const dEdge = distToEdge(mask, w, h);
  // Boundary pixels: inside, with a 4-neighbour inside of another colour; tagged by the colour pair.
  const pair = new Float64Array(w * h).fill(-1);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      const k = key(m, i);
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (!inside[j]) continue;
        const q = key(m, j);
        if (q !== k) {
          pair[i] = Math.min(k, q) * 16777216 + Math.max(k, q);
          break;
        }
      }
    }
  let bnd = 0, hug = 0;
  const hugIdx: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (pair[i]! < 0) continue;
      bnd++;
      const d = dEdge[i]!;
      if (d > 4) continue;
      let same = 0;
      for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) if (pair[j] === pair[i] && dEdge[j] === d) same++;
      if (same >= 2) {
        hug++;
        hugIdx.push(i);
      }
    }
  // One-pixel intermediate steps: a pixel between two other colours across one axis, its value
  // between theirs (an AA pixel, or a one-pixel ramp band). Banding is when such steps stack
  // along the edge they soften (NLQGKlc: three greys in a column beside a vertical edge).
  const mid = (i: number, a: number, b: number) => {
    if (!inside[a] || !inside[b]) return false;
    const k = key(m, i), ka = key(m, a), kb = key(m, b);
    if (ka === k || kb === k || ka === kb) return false;
    const la = L[a]!, lb = L[b]!, l = L[i]!;
    return (la < l && l < lb) || (la > l && l > lb);
  };
  const midH = new Uint8Array(w * h), midV = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      if (mid(i, i - 1, i + 1)) midH[i] = 1;
      if (mid(i, i - w, i + w)) midV[i] = 1;
    }
  let stack = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if ((midH[i] && (midH[i - w] || midH[i + w])) || (midV[i] && (midV[i - 1] || midV[i + 1]))) stack++;
    }
  let n = 0;
  for (let i = 0; i < w * h; i++) if (pair[i]! >= 0) n++;
  // Aligned endpoints (Pixel Fixer's definition of banding: "adjacent segments aligning their
  // endpoints"): a run of one colour down a column (>= 2 px) whose top or bottom row is also the
  // top or bottom row of a run of a different cluster one or two columns away (likewise for rows).
  const comp = sameColourClusters(m, inside);
  let segs = 0, al = 0;
  for (const vertical of [true, false]) {
    const A = vertical ? w : h, B = vertical ? h : w;
    const idx = (a: number, b: number) => (vertical ? b * w + a : a * w + b);
    // Runs per line: [start, end, cluster].
    const runs: [number, number, number][][] = [];
    for (let a = 0; a < A; a++) {
      const line: [number, number, number][] = [];
      let b = 0;
      while (b < B) {
        const c = comp[idx(a, b)]!;
        let e = b;
        while (e + 1 < B && comp[idx(a, e + 1)] === c) e++;
        if (c >= 0 && e - b >= 1) line.push([b, e, c]);
        b = e + 1;
      }
      runs.push(line);
    }
    for (let a = 0; a < A; a++)
      for (const [b0, e0, c0] of runs[a]!) {
        segs++;
        let hit = false;
        for (const da of [1, 2]) {
          for (const [b1, e1, c1] of runs[a + da] ?? []) {
            if (c1 === c0) continue;
            // A run that only meets this one end-to-end is a step, not a parallel band.
            if (e1 < b0 || b1 > e0) continue;
            if ((b1 === b0 && b0 > 0) || (e1 === e0 && e0 < B - 1)) hit = true;
          }
          if (hit) break;
        }
        if (hit) al++;
      }
  }
  // Hugging is judged against the length of the silhouette it hugs.
  const per = count(ring(mask, w, h));
  return { hug: per ? hug / per : bnd ? hug / bnd : 0, stack: n ? stack / n : 0, aligned: segs ? al / segs : 0, hugIdx };
}

/** Same-colour 4-connected cluster id per pixel inside `mask` (-1 outside). */
export function sameColourClusters(m: Img, mask: Mask): Int32Array {
  const { w, h } = m;
  const lab = new Int32Array(w * h).fill(-1);
  const st: number[] = [];
  let id = 0;
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || lab[i0]! >= 0) continue;
    const k0 = key(m, i0);
    lab[i0] = id;
    st.push(i0);
    while (st.length) {
      const i = st.pop()!;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || !mask[j] || lab[j]! >= 0 || key(m, j) !== k0) continue;
        lab[j] = id;
        st.push(j);
      }
    }
    id++;
  }
  return lab;
}

// ------------------------------------------------------------------ 6: dither

/** 2x2 checker windows (a b / b a, a != b) per 1000 mask pixels, and their indices. */
export function checkers(m: Img, mask: Mask): { per1000: number; idx: number[] } {
  const { w, h } = m;
  let c = 0, n = 0;
  const idx: number[] = [];
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      n++;
      if (!mask[i + 1] || !mask[i + w] || !mask[i + w + 1]) continue;
      const a = key(m, i), b = key(m, i + 1);
      if (a !== b && key(m, i + w) === b && key(m, i + w + 1) === a) {
        c++;
        idx.push(i);
      }
    }
  return { per1000: n ? (c * 1000) / n : 0, idx };
}

// ------------------------------------------------------------------ 9, 15: outline

export interface OutlineStats {
  /** Fraction of silhouette ring pixels darker than the pixel inside them (a closed line). */
  continuity: number;
  /** Fraction of ring pixels that are (near) pure black. */
  black: number;
  /** Distinct colours on the ring. */
  colours: number;
  /** Mean chroma of the dark ring pixels (tinted outlines > 0.02). */
  chroma: number;
  /** L of ring pixels facing the light minus L facing away (selective outline > 0). */
  litMinusDark: number;
  /** Ring pixels lighter than both inside and the ground (halo / outer AA). */
  halo: number;
  /** Pixels with alpha strictly between 0 and 255, other than the ground shadow. */
  partialAlpha: number;
}

export function outlineStats(m: Img, mask: Mask, light: [number, number], ground?: number, shadowAlpha = -1): OutlineStats {
  const { w, h } = m;
  const L = lightness(m);
  const rg = ring(mask, w, h);
  const dist = distToEdge(mask, w, h);
  let n = 0, dark = 0, black = 0, chroma = 0, cn = 0, halo = 0;
  const cols = new Set<number>();
  let litS = 0, litN = 0, drkS = 0, drkN = 0;
  const gL = ground !== undefined ? oklab((ground >> 16) & 255, (ground >> 8) & 255, ground & 255)[0] : -1;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!rg[i]) continue;
      n++;
      cols.add(key(m, i));
      // The inside neighbour: the 4-neighbour deepest in the mask.
      let best = -1, bd = 0, ox = 0, oy = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const j = (y + dy) * w + x + dx;
        if (!mask[j]) {
          ox += dx;
          oy += dy;
        } else if (dist[j]! > bd) {
          bd = dist[j]!;
          best = j;
        }
      }
      const r = m.d[i * 4]!, g = m.d[i * 4 + 1]!, b = m.d[i * 4 + 2]!;
      if (Math.max(r, g, b) <= 16) black++;
      const isDark = best >= 0 ? L[i]! < L[best]! - 0.03 || L[i]! < 0.25 : L[i]! < 0.3;
      if (isDark) {
        dark++;
        chroma += oklch(r, g, b)[1];
        cn++;
      }
      if (best >= 0 && L[i]! > L[best]! + 0.05 && (gL < 0 || L[i]! > gL + 0.05)) halo++;
      const o = Math.hypot(ox, oy);
      if (o > 0) {
        const f = (ox * light[0] + oy * light[1]) / o;
        if (f > 0.3) {
          litS += L[i]!;
          litN++;
        } else if (f < -0.3) {
          drkS += L[i]!;
          drkN++;
        }
      }
    }
  let partialAlpha = 0;
  for (let i = 0; i < w * h; i++) {
    const a = m.d[i * 4 + 3]!;
    if (a > 0 && a < 255 && a !== shadowAlpha) partialAlpha++;
  }
  return {
    continuity: n ? dark / n : 0,
    black: n ? black / n : 0,
    colours: cols.size,
    chroma: cn ? chroma / cn : 0,
    litMinusDark: litN && drkN ? litS / litN - drkS / drkN : 0,
    halo: n ? halo / n : 0,
    partialAlpha,
  };
}

// ------------------------------------------------------------------ 12: value

export interface ValueStats {
  /** k-means (k=5) bands of OKLab L that cover more than 5% each. */
  bands: number;
  /** L distance between the lightest and darkest of those bands. */
  spread: number;
  /** 3-value thumbnail readability: 0..1 (balance of 3 posterised values × their spread). */
  thumb3: number;
  meanL: number;
  /** |mean L of the outer ring - ground L| (when a ground colour is given). */
  edgeVsGround: number;
  /** |mean L of the figure - ground L|. */
  meanVsGround: number;
}

function kmeans1(v: number[], k: number): { c: number[]; n: number[] } {
  const s = [...v].sort((a, b) => a - b);
  let c = Array.from({ length: k }, (_, i) => s[Math.min(s.length - 1, Math.floor(((i + 0.5) / k) * s.length))]!);
  let n: number[] = [];
  for (let it = 0; it < 30; it++) {
    const sum = new Array<number>(k).fill(0);
    n = new Array<number>(k).fill(0);
    for (const x of s) {
      let b = 0;
      for (let j = 1; j < k; j++) if (Math.abs(x - c[j]!) < Math.abs(x - c[b]!)) b = j;
      sum[b]! += x;
      n[b]!++;
    }
    const nc = c.map((cc, j) => (n[j] ? sum[j]! / n[j]! : cc));
    if (nc.every((x, j) => Math.abs(x - c[j]!) < 1e-6)) break;
    c = nc;
  }
  return { c, n };
}

export function valueStats(m: Img, mask: Mask, ground?: number): ValueStats {
  const L = lightness(m);
  const v: number[] = [];
  for (let i = 0; i < m.w * m.h; i++) if (mask[i]) v.push(L[i]!);
  if (!v.length) return { bands: 0, spread: 0, thumb3: 0, meanL: 0, edgeVsGround: 0, meanVsGround: 0 };
  const { c, n } = kmeans1(v, 5);
  const big = c.filter((_, j) => n[j]! > 0.05 * v.length);
  const spread = big.length ? Math.max(...big) - Math.min(...big) : 0;
  const k3 = kmeans1(v, 3);
  const p = k3.n.map((x) => x / v.length);
  const ent = -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0) / Math.log(3);
  const sp3 = Math.max(...k3.c) - Math.min(...k3.c);
  const thumb3 = ent * Math.min(1, sp3 / 0.4);
  const meanL = v.reduce((a, b) => a + b, 0) / v.length;
  let edgeVsGround = 0, meanVsGround = 0;
  if (ground !== undefined) {
    const gL = oklab((ground >> 16) & 255, (ground >> 8) & 255, ground & 255)[0];
    const rg = ring(mask, m.w, m.h);
    let s = 0, k = 0;
    for (let i = 0; i < m.w * m.h; i++) if (rg[i]) {
      s += L[i]!;
      k++;
    }
    edgeVsGround = Math.abs((k ? s / k : 0) - gL);
    meanVsGround = Math.abs(meanL - gL);
  }
  return { bands: big.length, spread, thumb3, meanL, edgeVsGround, meanVsGround };
}

/** Value contrast between adjacent material regions: share of shared boundary where ΔL < 0.06. */
export function partContrast(m: Img, mask: Mask, regionOf: Int32Array): { lowFrac: number; meanDL: number } {
  const { w, h } = m;
  const L = lightness(m);
  const sum = new Map<number, [number, number]>();
  for (let i = 0; i < w * h; i++) {
    const r = regionOf[i]!;
    if (!mask[i] || r < 0) continue;
    const e = sum.get(r) ?? [0, 0];
    e[0] += L[i]!;
    e[1]++;
    sum.set(r, e);
  }
  const mean = new Map<number, number>();
  for (const [r, [s, n]] of sum) mean.set(r, s / n);
  let tot = 0, low = 0, dls = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      for (const j of [y * w + x + 1, y < h - 1 ? (y + 1) * w + x : -1]) {
        const i = y * w + x;
        if (j < 0 || !mask[i] || !mask[j]) continue;
        const a = regionOf[i]!, b = regionOf[j]!;
        if (a < 0 || b < 0 || a === b) continue;
        const dl = Math.abs(mean.get(a)! - mean.get(b)!);
        tot++;
        dls += dl;
        if (dl < 0.06) low++;
      }
    }
  return { lowFrac: tot ? low / tot : 0, meanDL: tot ? dls / tot : 0 };
}

// ------------------------------------------------------------------ 13: silhouettes

/** IoU of two masks placed with their anchors on the same point; also the best IoU over ±2 px shifts. */
export function iou(a: Mask, aw: number, ah: number, ax: number, ay: number, b: Mask, bw: number, bh: number, bx: number, by: number): { iou: number; best: number } {
  const at = (dx: number, dy: number) => {
    let inter = 0, uni = 0;
    const x0 = Math.min(-ax, -bx + dx), y0 = Math.min(-ay, -by + dy);
    const x1 = Math.max(aw - ax, bw - bx + dx), y1 = Math.max(ah - ay, bh - by + dy);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const xa = x + ax, ya = y + ay, xb = x + bx - dx, yb = y + by - dy;
        const pa = xa >= 0 && ya >= 0 && xa < aw && ya < ah ? a[ya * aw + xa]! : 0;
        const pb = xb >= 0 && yb >= 0 && xb < bw && yb < bh ? b[yb * bw + xb]! : 0;
        if (pa || pb) uni++;
        if (pa && pb) inter++;
      }
    return uni ? inter / uni : 0;
  };
  const base = at(0, 0);
  let best = base;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) best = Math.max(best, at(dx, dy));
  return { iou: base, best };
}

// ------------------------------------------------------------------ 16: temporal

export interface Frame {
  m: Img;
  /** Anchor (foot point) in the frame. */
  ax: number;
  ay: number;
}

/** Colour at a point relative to the anchor (0 outside). */
const at = (f: Frame, x: number, y: number): number => {
  const xx = x + f.ax, yy = y + f.ay;
  if (xx < 0 || yy < 0 || xx >= f.m.w || yy >= f.m.h) return -1;
  const i = yy * f.m.w + xx;
  return f.m.d[i * 4 + 3] === 255 ? key(f.m, i) : -1;
};

export interface TemporalStats {
  /** Mean fraction of the union of two consecutive frames that changed, after the best ±2 px shift. */
  churn: number;
  /** ... in the top quarter of the figure (head and helm: should move rigidly). */
  headChurn: number;
  /** Fraction of pixels flipping A-B-A over three consecutive frames (a looping clip wraps). */
  flicker: number;
  /** Silhouette change between consecutive frames (fraction of union), unshifted. */
  shapeChange: number;
}

export function temporalStats(frames: Frame[], loop: boolean): TemporalStats {
  if (frames.length < 2) return { churn: 0, headChurn: 0, flicker: 0, shapeChange: 0 };
  // Common box relative to the anchor.
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of frames) {
    x0 = Math.min(x0, -f.ax);
    y0 = Math.min(y0, -f.ay);
    x1 = Math.max(x1, f.m.w - f.ax);
    y1 = Math.max(y1, f.m.h - f.ay);
  }
  // The figure's top (for the head region): highest opaque row over the clip.
  let top = 1e9, bottom = -1e9;
  for (const f of frames)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (at(f, x, y) >= 0) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
  const headY = top + (bottom - top) * 0.25;
  const diff = (a: Frame, b: Frame, ys: number, ye: number) => {
    let best = 1, bestShape = 1;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        let uni = 0, ch = 0;
        for (let y = Math.max(y0, ys); y < Math.min(y1, ye); y++)
          for (let x = x0; x < x1; x++) {
            const p = at(a, x, y), q = at(b, x + dx, y + dy);
            if (p < 0 && q < 0) continue;
            uni++;
            if (p !== q) ch++;
          }
        if (uni && ch / uni < best) best = ch / uni;
        if (dx === 0 && dy === 0) {
          let u2 = 0, c2 = 0;
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const p = at(a, x, y) >= 0, q = at(b, x, y) >= 0;
              if (p || q) u2++;
              if (p !== q) c2++;
            }
          bestShape = u2 ? c2 / u2 : 0;
        }
      }
    return { c: best, s: bestShape };
  };
  const pairs = loop ? frames.length : frames.length - 1;
  let churn = 0, head = 0, shape = 0;
  for (let i = 0; i < pairs; i++) {
    const a = frames[i]!, b = frames[(i + 1) % frames.length]!;
    const d = diff(a, b, y0, y1);
    churn += d.c;
    shape += d.s;
    head += diff(a, b, top, Math.ceil(headY) + 1).c;
  }
  let flick = 0, tot = 0;
  const trip = loop ? frames.length : frames.length - 2;
  for (let i = 0; i < trip && frames.length >= 3; i++) {
    const a = frames[i]!, b = frames[(i + 1) % frames.length]!, c = frames[(i + 2) % frames.length]!;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = at(a, x, y), q = at(b, x, y), r = at(c, x, y);
        if (p < 0 && q < 0 && r < 0) continue;
        tot++;
        // A lone flip: the pixel changes for one frame while its four neighbours stay put (a
        // band or texture flicker, not a moving edge).
        if (p === r && p !== q && p >= 0 && q >= 0) {
          let still = true;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const)
            if (at(a, x + dx, y + dy) !== at(b, x + dx, y + dy) || at(b, x + dx, y + dy) !== at(c, x + dx, y + dy)) still = false;
          if (still) flick++;
        }
      }
  }
  return { churn: churn / pairs, headChurn: head / pairs, flicker: tot ? flick / tot : 0, shapeChange: shape / pairs };
}

// ------------------------------------------------------------------ 10: mixels and scaling

export interface GridStats {
  /** The art-pixel size the image is drawn at (the largest g dividing 80% of colour runs). */
  grid: number;
  ox: number;
  oy: number;
  /** Fraction of grid-aligned blocks (at the detected grid and offset) that are not one flat colour. */
  impure: number;
  /** Mean |deviation| of pixels from their block's mode colour, 0..255 (grain, smoothing). */
  deviation: number;
}

/** Same colour within `tol` per channel. */
const near = (m: Img, i: number, j: number, tol: number): boolean =>
  tol <= 0
    ? key(m, i) === key(m, j)
    : Math.abs(m.d[i * 4]! - m.d[j * 4]!) <= tol && Math.abs(m.d[i * 4 + 1]! - m.d[j * 4 + 1]!) <= tol && Math.abs(m.d[i * 4 + 2]! - m.d[j * 4 + 2]!) <= tol;

/**
 * Detects the art-pixel grid of a picture (a screenshot, or a magnified tutorial image). `tol`
 * lets grain or JPEG noise count as one colour. `force` skips detection (a known scale).
 */
export function gridStats(m: Img, maxGrid = 32, tol = 0, force = 0): GridStats {
  const { w, h } = m;
  let grid = force;
  if (!grid) {
    // Colour-change positions along rows and columns; the grid is the largest g for which both
    // fall on one phase mod g (85%; captions and grain may break the rest).
    const xs: number[] = [], ys: number[] = [];
    for (let y = 0; y < h; y += 2) for (let x = 1; x < w; x++) if (!near(m, y * w + x, y * w + x - 1, tol)) xs.push(x);
    for (let x = 0; x < w; x += 2) for (let y = 1; y < h; y++) if (!near(m, y * w + x, (y - 1) * w + x, tol)) ys.push(y);
    const fit = (pos: number[], g: number) => {
      if (!pos.length) return 1;
      const n = new Array<number>(g).fill(0);
      for (const p of pos) n[p % g]!++;
      return Math.max(...n) / pos.length;
    };
    grid = 1;
    for (let g = maxGrid; g >= 2; g--)
      if (fit(xs, g) >= 0.8 && fit(ys, g) >= 0.8) {
        grid = g;
        break;
      }
  }
  // Offset: the phase where colour changes happen most.
  const phase = (horiz: boolean) => {
    const n = new Array<number>(grid).fill(0);
    if (horiz) {
      for (let y = 0; y < h; y += 2) for (let x = 1; x < w; x++) if (!near(m, y * w + x, y * w + x - 1, tol)) n[x % grid]!++;
    } else for (let x = 0; x < w; x += 2) for (let y = 1; y < h; y++) if (!near(m, y * w + x, (y - 1) * w + x, tol)) n[y % grid]!++;
    return n.indexOf(Math.max(...n));
  };
  const ox = phase(true), oy = phase(false);
  let blocks = 0, impure = 0, dev = 0, dn = 0;
  const g = Math.max(grid, 2);
  for (let by = oy % g; by + g <= h; by += g)
    for (let bx = ox % g; bx + g <= w; bx += g) {
      const cnt = new Map<number, number>();
      for (let y = by; y < by + g; y++) for (let x = bx; x < bx + g; x++) cnt.set(key(m, y * w + x), (cnt.get(key(m, y * w + x)) ?? 0) + 1);
      blocks++;
      if (cnt.size > 1) impure++;
      const mode = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const mr = (mode >> 16) & 255, mg = (mode >> 8) & 255, mb = mode & 255;
      for (let y = by; y < by + g; y++)
        for (let x = bx; x < bx + g; x++) {
          const i = (y * w + x) * 4;
          dev += (Math.abs(m.d[i]! - mr) + Math.abs(m.d[i + 1]! - mg) + Math.abs(m.d[i + 2]! - mb)) / 3;
          dn++;
        }
    }
  return { grid, ox: ox % Math.max(1, grid), oy: oy % Math.max(1, grid), impure: blocks ? impure / blocks : 0, deviation: dn ? dev / dn : 0 };
}

/** Samples one pixel per art pixel (the block centre) of a magnified image. */
export function downsample(m: Img, g: number, ox: number, oy: number): Img {
  if (g <= 1) return m;
  const w = Math.floor((m.w - ox) / g), h = Math.floor((m.h - oy) / g);
  const out = img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((oy + y * g + (g >> 1)) * m.w + ox + x * g + (g >> 1)) * 4;
      out.d.set(m.d.subarray(i, i + 4), (y * w + x) * 4);
    }
  return out;
}

/**
 * Art-pixel size map of a buffer: for each 8×8 tile with detail, whether it is made of 2×2 flat
 * blocks (a 2-px art grid) or not. Returns the share of detailed tiles at each size.
 */
export function pixelSizeMix(m: Img, tile = 8, tol = 0): { tiles: number; at2: number; at1: number } {
  const { w, h } = m;
  let tiles = 0, at2 = 0, at1 = 0;
  for (let ty = 0; ty + tile <= h; ty += tile)
    for (let tx = 0; tx + tile <= w; tx += tile) {
      let changes = 0;
      for (let y = ty; y < ty + tile; y++) for (let x = tx + 1; x < tx + tile; x++) if (!near(m, y * w + x, y * w + x - 1, tol)) changes++;
      if (changes < 4) continue;
      tiles++;
      // Best of the four 2×2 phases.
      let bestPure = 0;
      for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        let pure = 0, all = 0;
        for (let y = ty + py; y + 1 < ty + tile; y += 2)
          for (let x = tx + px; x + 1 < tx + tile; x += 2) {
            const i = y * w + x;
            all++;
            if (near(m, i, i + 1, tol) && near(m, i, i + w, tol) && near(m, i, i + w + 1, tol)) pure++;
          }
        bestPure = Math.max(bestPure, all ? pure / all : 0);
      }
      if (bestPure >= 0.9) at2++;
      else if (bestPure < 0.6) at1++;
    }
  return { tiles, at2: tiles ? at2 / tiles : 0, at1: tiles ? at1 / tiles : 0 };
}

// ------------------------------------------------------------------ 17: isometric lines

export interface IsoStats {
  /** Horizontal runs measured on shallow (|slope| = 1 step) silhouette edges. */
  runs: number;
  /** Fraction of those runs equal to 2 × the art-pixel size. */
  frac2: number;
  /** Histogram of run lengths (in art pixels). */
  hist: Record<number, number>;
}

/** Run lengths along the top and bottom silhouette profiles of `mask`, for runs on shallow stairs. */
export function isoStats(mask: Mask, w: number, h: number, px = 1, bad?: number[]): IsoStats {
  const hist: Record<number, number> = {};
  let runs = 0, ok = 0;
  const prof = (top: boolean) => {
    const p: number[] = [];
    for (let x = 0; x < w; x++) {
      let v = -1;
      if (top) {
        for (let y = 0; y < h; y++) if (mask[y * w + x]) {
          v = y;
          break;
        }
      } else for (let y = h - 1; y >= 0; y--) if (mask[y * w + x]) {
        v = y;
        break;
      }
      p.push(v);
    }
    // Stairs: runs of equal value between single-step (|Δ| = px) changes of the same sign. A stair
    // of >= 3 interior runs whose median is 2-3 art px is a ground-plane (2:1) line; steeper ones
    // (roof pitches, cones, 45° edges) and flat ones are not iso lines and are skipped.
    const stairs: [number, number][][] = [];
    let cur: [number, number][] = [];
    let dir = 0;
    let i = 0;
    while (i < p.length) {
      if (p[i]! < 0) {
        if (cur.length) stairs.push(cur);
        cur = [];
        dir = 0;
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < p.length && p[j + 1] === p[i]) j++;
      const before = i > 0 && p[i - 1]! >= 0 ? p[i]! - p[i - 1]! : 99, after = j + 1 < p.length && p[j + 1]! >= 0 ? p[j + 1]! - p[j]! : 99;
      const interior = Math.abs(before) === px && Math.abs(after) === px && Math.sign(before) === Math.sign(after);
      if (interior && (dir === 0 || Math.sign(after) === dir)) {
        cur.push([i, j]);
        dir = Math.sign(after);
      } else {
        if (cur.length) stairs.push(cur);
        cur = interior ? [[i, j]] : [];
        dir = interior ? Math.sign(after) : 0;
      }
      i = j + 1;
    }
    if (cur.length) stairs.push(cur);
    for (const st of stairs) {
      if (st.length < 3) continue;
      const lens = st.map(([a, b]) => Math.round((b - a + 1) / px)).sort((a, b) => a - b);
      const med = lens[lens.length >> 1]!;
      if (med < 2 || med > 3) continue;
      for (const [a, b] of st) {
        const len = b - a + 1;
        const r = Math.round(len / px);
        hist[r] = (hist[r] ?? 0) + 1;
        runs++;
        if (len === 2 * px) ok++;
        else if (bad) for (let x = a; x <= b; x++) bad.push(p[x]! * w + x);
      }
    }
  };
  prof(true);
  prof(false);
  return { runs, frac2: runs ? ok / runs : 0, hist };
}
