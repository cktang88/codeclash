// The night's light pools (HD), as a job that can be run a slice at a time (build.ts) or at once.
// Moved out of city.ts unchanged so the build worker (build-worker.ts) can make them too.

import type { Art } from './buildings.ts';
import type { Footprint, Frame } from './pixels.ts';

/** A light for the pools: a point in world pixels, its height above the ground and its reach (world units). */
export interface PoolSource {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Which colour ramp (index into lightPools' `ramps`): 0 by default. */
  tint?: number;
}

/** Pool bands, dim to hot: warm fire. */
export const FIRE_POOL: [number, number, number][] = [[40, 20, 4], [78, 42, 10], [124, 74, 22]];

/** The light sources for the pools: torches, prop lanterns and forges (world pixels, a height, a reach). */
export function poolSources(torches: { x: number; y: number }[], lamps: [number, number][], forges: [number, number][]): PoolSource[] {
  const out: PoolSource[] = [];
  for (const tc of torches) out.push({ x: tc.x, y: tc.y, z: 8, r: 22 });
  for (const [x, y] of lamps) out.push({ x, y, z: 7, r: 16 });
  for (const [x, y] of forges) out.push({ x, y, z: 2, r: 18 });
  return out;
}

/** lightPools run at once. */
export function lightPools(frame: Frame, arts: Art[], casts: Footprint[], sources: PoolSource[], ramps: [number, number, number][][] = [FIRE_POOL]): HTMLCanvasElement {
  const job = lightPoolSteps(frame, arts, casts, sources, ramps);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * Light pools (HD), after the user's town-displate target: each light warms the surfaces it
 * reaches instead of hanging a disc in the air. On the ground the pool is an iso ellipse in
 * world units, ragged at its edge (3×2 cell wobble and a low-frequency warp), stepped in three
 * flat bands, and cut off where a building or a prop stands between the light and the ground
 * (the recorded footprints). On walls it is a small upright patch, only on art that stands
 * behind the light. Overlapping pools take the brighter band, never a sum. The result is one
 * canvas laid with 'lighter', so every lit pixel moves up its own ramp, warmer and brighter.
 * `ramps` are the band colours per tint, dim to hot (warm fire by default; the necropolis passes
 * its grave-light green and arcane violet). The brightest band wins a pixel, with its tint.
 * Yields between arts, lights and quarters of the final image (a few ms each).
 */
export function* lightPoolSteps(frame: Frame, allArts: Art[], allCasts: Footprint[], sources: PoolSource[], ramps: [number, number, number][][] = [FIRE_POOL]): Generator<void, HTMLCanvasElement> {
  const f = frame;
  const W = f.w;
  const H = f.h;
  // Which art covers each pixel, and its depth (u + v); ground is -Infinity.
  const cover = new Float32Array(W * H).fill(-Infinity);
  const arts = [...allArts].sort((a, b) => a.d - b.d);
  let area = 0;
  for (const a of arts) {
    if (!a.canvas) continue;
    const m = alphaMask(a.canvas);
    const cw = a.canvas.width;
    const ch = a.canvas.height;
    for (let y = 0; y < ch; y++) {
      const by = a.y + y;
      if (by < 0 || by >= H) continue;
      for (let x = 0; x < cw; x++) {
        if (!m[y * cw + x]) continue;
        const bx = a.x + x;
        if (bx >= 0 && bx < W) cover[by * W + bx] = a.d;
      }
    }
    area += cw * ch;
    if (area > 60000) {
      area = 0;
      yield;
    }
  }
  yield;
  const casts = allCasts.filter((c) => c[4] >= 3);
  const band = new Uint8Array(W * H);
  const tintOf = new Uint8Array(W * H);
  const ground = (x: number, y: number): [number, number] => {
    const a = (x + 0.5) / f.k - f.mx - 256;
    const b = 2 * ((y + 0.5) / f.k - f.my - 30);
    return [(a + b) / 2, (b - a) / 2];
  };
  // Chunky clusters (6×4 buffer pixels, alternate columns dropped) for the ragged edge.
  const cell = (x: number, y: number) => {
    const cx = Math.floor(x / 6);
    return poolHash(cx, (y + (cx & 1) * 2) >> 2);
  };
  for (const src of sources) {
    // The foot of the light on the ground, and the footprints near it (not the one it hangs on).
    const fx = (src.x + f.mx) * f.k;
    const fy = (src.y + src.z + f.my) * f.k;
    const [su, sv] = ground(fx, fy);
    const ds = su + sv;
    const R = src.r;
    const near = casts.filter((c) => c[0] < su + R && c[2] > su - R && c[1] < sv + R && c[3] > sv - R && !(su >= c[0] - 0.5 && su <= c[2] + 0.5 && sv >= c[1] - 0.5 && sv <= c[3] + 0.5));
    const x0 = Math.max(0, Math.floor(fx - 2 * R * f.k));
    const x1 = Math.min(W - 1, Math.ceil(fx + 2 * R * f.k));
    const y0 = Math.max(0, Math.floor(fy - (R + src.z + 6) * f.k));
    const y1 = Math.min(H - 1, Math.ceil(fy + R * f.k));
    const sxB = (src.x + f.mx) * f.k;
    const syB = (src.y + f.my) * f.k;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const wob = (cell(x, y) - 0.5) * 0.14;
        let k = 0;
        const da = cover[i]!;
        if (da === -Infinity) {
          const [u, v] = ground(x, y);
          const warp = 1 + (poolHash(Math.floor(u / 4) + 77, Math.floor(v / 4)) - 0.5) * 0.35;
          const d = (Math.hypot(u - su, v - sv) / R) * warp;
          if (d >= 1) continue;
          if (near.some((c) => blocks(su, sv, u, v, c))) continue;
          k = 1 - d + wob;
        } else {
          // A wall or prop: lit only behind the light (facing it), in a small upright patch.
          if (da > ds + 4 || da < ds - 36) continue;
          const ex = (x - sxB) / (R * 0.55 * f.k);
          const ey = (y - syB) / (R * 0.5 * f.k);
          const d = Math.hypot(ex, ey);
          if (d >= 1) continue;
          k = Math.min(0.6, (1 - d) * 0.75 + wob);
        }
        const b = k > 0.62 ? 3 : k > 0.32 ? 2 : k > 0.06 ? 1 : 0;
        if (b > band[i]!) {
          band[i] = b;
          tintOf[i] = src.tint ?? 0;
        }
      }
    yield;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const N = W * H;
  for (let q = 0; q < 4; q++) {
    for (let i = (q * N) >> 2, e = ((q + 1) * N) >> 2; i < e; i++) {
      const b = band[i]!;
      if (!b) continue;
      const col = (ramps[tintOf[i]!] ?? ramps[0]!)[b - 1]!;
      img.data[i * 4] = col[0];
      img.data[i * 4 + 1] = col[1];
      img.data[i * 4 + 2] = col[2];
      img.data[i * 4 + 3] = 255;
    }
    yield;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const masks = new WeakMap<HTMLCanvasElement, Uint8Array>();
/** The opaque pixels of an art canvas (cached per canvas). */
function alphaMask(c: HTMLCanvasElement): Uint8Array {
  let m = masks.get(c);
  if (!m) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    m = new Uint8Array(c.width * c.height);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]! > 0 ? 1 : 0;
    masks.set(c, m);
  }
  return m;
}

/** Does a footprint stand between a light's foot (a) and a ground point (b)? Liang-Barsky. */
function blocks(au: number, av: number, bu: number, bv: number, f: Footprint): boolean {
  let t0 = 0;
  let t1 = 1;
  const du = bu - au;
  const dv = bv - av;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-du, au - f[0]) && clip(du, f[2] - au) && clip(-dv, av - f[1]) && clip(dv, f[3] - av) && t0 < t1 && t1 < 0.999;
}

function poolHash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + 977) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
