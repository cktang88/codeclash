// City metrics: iso line ratio on building silhouettes, noise and dither density, light
// direction per building part, building-vs-ground value contrast (day and night), and the
// art-pixel sizes mixed in the finished buffer.

import * as M from './metrics.ts';
import type { Img } from './metrics.ts';
import type { CityShot } from './browser.ts';


export interface CityResult {
  art: 'classic' | 'hd';
  faction: string;
  tier: number;
  level: number;
  time: 'day' | 'night';
  hour: number;
  /** Building art pixel size in buffer pixels (detected). */
  artPx: number;
  iso: { runs: number; frac2: number; hist: Record<number, number> };
  parts: { n: number; orphanFrac: number; meanCluster: number; checkers: number; colours: number; lightOff: number };
  ground: { orphanFrac: number; meanCluster: number; checkers: number } | null;
  contrast: { building: number; ground: number; dL: number; edgeDL: number };
  mix: { tiles: number; at1: number; at2: number };
  errors: string[];
}

function alphaMask(m: Img): M.Mask {
  const k = new Uint8Array(m.w * m.h);
  for (let i = 0; i < k.length; i++) k[i] = m.d[i * 4 + 3]! > 0 ? 1 : 0;
  return k;
}

export function auditCity(shot: CityShot, art: 'classic' | 'hd', faction: string, tier: number, level: number, hour: number): CityResult {
  // Art-pixel size of the building parts: 2×2 blocks in HD if the painter works at world pixels.
  let px = 1;
  {
    let t = 0, two = 0;
    for (const p of shot.parts) {
      const s = M.pixelSizeMix(p.img);
      t += s.tiles;
      two += s.at2 * s.tiles;
    }
    if (t && two / t > 0.6) px = 2;
  }
  let runs = 0, ok = 0;
  const hist: Record<number, number> = {};
  let n = 0, orph = 0, mc = 0, ck = 0, cols = 0, lightOff = 0, area = 0;
  for (const p of shot.parts) {
    const mask = alphaMask(p.img);
    const a = M.count(mask);
    if (a < 200) continue;
    n++;
    const iso = M.isoStats(mask, p.img.w, p.img.h, px);
    runs += iso.runs;
    ok += iso.frac2 * iso.runs;
    for (const [k, v] of Object.entries(iso.hist)) hist[Number(k)] = (hist[Number(k)] ?? 0) + v;
    const native = px > 1 ? M.downsample(p.img, px, 0, 0) : p.img;
    const nm = alphaMask(native);
    const cl = M.clusterStats(native, nm, M.ring(nm, native.w, native.h));
    orph += cl.orphanFrac * a;
    mc += cl.meanCluster * a;
    ck += M.checkers(native, nm).per1000 * a;
    cols += M.colourStats(native, nm).colours;
    // Two-plane lighting (craft §6): with light from the upper left the left-hand walls are
    // lighter than the right-hand ones. Compare the lower 60% (walls, not roofs) of each half.
    {
      let ls = 0, ln = 0, rs = 0, rn = 0;
      const Ln = M.lightness(native);
      let x0 = native.w, x1 = 0, y0 = native.h, y1 = 0;
      for (let i = 0; i < nm.length; i++) if (nm[i]) {
        const x = i % native.w, y = (i / native.w) | 0;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const cx = (x0 + x1) / 2, cy = y0 + (y1 - y0) * 0.4;
      for (let i = 0; i < nm.length; i++) {
        if (!nm[i]) continue;
        const x = i % native.w, y = (i / native.w) | 0;
        if (y < cy) continue;
        if (x < cx) {
          ls += Ln[i]!;
          ln++;
        } else {
          rs += Ln[i]!;
          rn++;
        }
      }
      if (ln > 20 && rn > 20 && rs / rn > ls / ln + 0.02) lightOff++;
    }
    area += a;
  }
  let ground: CityResult['ground'] = null;
  if (shot.ground) {
    const g = px > 1 ? M.downsample(shot.ground, px, 0, 0) : shot.ground;
    const gm = new Uint8Array(g.w * g.h).fill(1);
    const cl = M.clusterStats(g, gm);
    ground = { orphanFrac: cl.orphanFrac, meanCluster: cl.meanCluster, checkers: M.checkers(g, gm).per1000 };
  }
  // Value contrast in the finished buffer: buildings against the ground within 6 art px of them.
  const B = shot.buffer;
  const L = M.lightness(B);
  const bm = alphaMask(shot.mask);
  const near = new Uint8Array(B.w * B.h);
  {
    // Dilate the building mask by 6 art pixels.
    let front: number[] = [];
    const d = new Int32Array(B.w * B.h).fill(-1);
    for (let i = 0; i < bm.length; i++) if (bm[i]) {
      d[i] = 0;
      front.push(i);
    }
    for (let k = 1; k <= 6 * px; k++) {
      const nx: number[] = [];
      for (const i of front) {
        const x = i % B.w;
        for (const j of [x > 0 ? i - 1 : -1, x < B.w - 1 ? i + 1 : -1, i - B.w, i + B.w]) {
          if (j < 0 || j >= B.w * B.h || d[j]! >= 0) continue;
          d[j] = k;
          near[j] = 1;
          nx.push(j);
        }
      }
      front = nx;
    }
  }
  let sb = 0, nb = 0, sg = 0, ng = 0, se = 0, ne = 0;
  for (let i = 0; i < bm.length; i++) {
    if (bm[i]) {
      sb += L[i]!;
      nb++;
      const x = i % B.w;
      for (const j of [x > 0 ? i - 1 : -1, x < B.w - 1 ? i + 1 : -1, i - B.w, i + B.w])
        if (j >= 0 && j < bm.length && !bm[j]) {
          se += Math.abs(L[i]! - L[j]!);
          ne++;
          break;
        }
    } else if (near[i]) {
      sg += L[i]!;
      ng++;
    }
  }
  const mix = M.pixelSizeMix(B);
  return {
    art,
    faction,
    tier,
    level,
    time: hour >= 7 && hour <= 18 ? 'day' : 'night',
    hour,
    artPx: px,
    iso: { runs, frac2: runs ? ok / runs : 0, hist },
    parts: { n, orphanFrac: area ? orph / area : 0, meanCluster: area ? mc / area : 0, checkers: area ? ck / area : 0, colours: n ? cols / n : 0, lightOff: n ? lightOff / n : 0 },
    ground,
    contrast: { building: nb ? sb / nb : 0, ground: ng ? sg / ng : 0, dL: nb && ng ? Math.abs(sb / nb - sg / ng) : 0, edgeDL: ne ? se / ne : 0 },
    mix,
    errors: shot.errors,
  };
}
