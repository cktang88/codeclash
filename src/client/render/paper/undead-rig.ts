// The Hollow Host on bones: the machinery that turns the approved key art (undead-static.ts) into
// parts on a skeleton.
//
// The key art is drawn with the paper primitives at fixed points. To pose it, each piece of a
// figure (a thigh, the bascinet, the shield) rides one bone: the piece makes exactly the key art's
// drawing calls, and every polygon those calls fill is intercepted (`mapped`): its corners are
// carried from the key art (the rest pose) to where the bone has them now, it is re-rasterised
// there, and each pixel it covers is shaded by asking the key art's own shading what it painted at
// the matching rest pixel. So:
// - at rest a piece is the key art pixel for pixel;
// - moved by whole pixels it is the same pixels moved (no boil);
// - turned, its outline is redrawn crisp at the snapped angle, while its texture, folds, rivets
//   and painted skulls ride on it (the light turns with the part, as with any rotated sprite).
// Cloth over two bones uses a skinned map (templar-rig.ts skinMap) through the same interception.
//
// Back views (NE): the key art is a front view. A piece drawn `mirror` has its key-art x mirrored
// about the body's axis (the torso, the hood, the robe), so the back is the front's outline with
// the back's details (`back` flag); limbs are drawn from the NE rest joints (sides swapped) and
// keep their toes and blades pointing forward. The light stays top-left either way, because the
// primitives shade in canvas space.

import { hash, type P2, type Paper, type Shade } from './core.ts';
import type { PartXf } from './skeleton.ts';

/** A map of key-art units (rest pose, this facing) to figure units now, and back. */
export interface UMap {
  f(p: P2): P2;
  inv(p: P2): P2;
  /** The map bends (skinned cloth): long edges are split so the outline follows it. */
  bend?: boolean;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** A cached part's map: its bone's transform from the rest pose (exactly affine, rounded so rest is exact). */
export function boneMap(x: PartXf): UMap {
  const o = x.r([0, 0]), ex = x.r([1, 0]), ey = x.r([0, 1]);
  const a = r6(ex[0] - o[0]), b = r6(ey[0] - o[0]), c = r6(ex[1] - o[1]), d = r6(ey[1] - o[1]);
  const e = o[0], f = o[1];
  const det = a * d - b * c || 1e-9;
  return {
    f: (p) => [a * p[0] + b * p[1] + e, c * p[0] + d * p[1] + f],
    inv: (p) => {
      const X = p[0] - e, Y = p[1] - f;
      return [(d * X - b * Y) / det, (-c * X + a * Y) / det];
    },
  };
}

/** A pure offset (a whole-pixel move of the key art). */
export const shiftMap = (dx: number, dy: number): UMap => ({ f: (p) => [p[0] + dx, p[1] + dy], inv: (p) => [p[0] - dx, p[1] - dy] });

/** A map composed after another (first `a`, then `b`). */
export const thenMap = (a: UMap, b: UMap): UMap => ({ f: (p) => b.f(a.f(p)), inv: (p) => a.inv(b.inv(p)), bend: a.bend || b.bend });

interface Saved {
  poly?: PropertyDescriptor;
  line?: PropertyDescriptor;
  sx?: PropertyDescriptor;
}

/**
 * Draws key-art calls on `c` through a map (null: in place) and, with `mirror`, with the key art's
 * x mirrored about `axis` (units). Nests.
 */
export function mapped(c: Paper, m: UMap | null, mirror: boolean | number, draw: () => void): void {
  const own = c as unknown as Record<string, unknown>;
  const saved: Saved = {
    poly: Object.getOwnPropertyDescriptor(c, 'poly'),
    line: Object.getOwnPropertyDescriptor(c, 'line'),
    sx: Object.getOwnPropertyDescriptor(c, 'sx'),
  };
  const prevSx = c.sx.bind(c);
  if (mirror !== false) {
    const ax = typeof mirror === 'number' ? mirror : 0;
    // x' = 2·axis − x, through the canvas transform in force (nested maps see mirrored units).
    own.sx = (x: number) => prevSx(2 * ax - x);
  }
  if (m) {
    const prevPoly = c.poly.bind(c);
    const L = c.L;
    const toU = (p: P2): P2 => [(p[0] - c.FX) / L, (p[1] - c.FY) / L];
    const toP = (u: P2): P2 => [c.FX + u[0] * L, c.FY + u[1] * L];
    void prevPoly;
    own.poly = (pts: P2[], shade: Shade, axis?: { a: P2; b: P2; w: number }) => mappedPoly(c, m, toU, toP, pts, shade, axis);
    own.line = (a: P2, b: P2, code: number) => {
      const A = toP(m.f(toU([c.sx(a[0]), c.sy(a[1])]))), B = toP(m.f(toU([c.sx(b[0]), c.sy(b[1])])));
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]))));
      for (let i = 0; i <= n; i++) c.plot(Math.floor(A[0] + ((B[0] - A[0]) * i) / n), Math.floor(A[1] + ((B[1] - A[1]) * i) / n), code);
    };
  }
  try {
    draw();
  } finally {
    for (const k of ['poly', 'line', 'sx'] as const) {
      const d = saved[k];
      if (d) Object.defineProperty(c, k, d);
      else delete own[k];
    }
  }
}

/** Paper.poly through a map: rasterised where the map puts the polygon, shaded at the rest pixel. */
function mappedPoly(c: Paper, m: UMap, toU: (p: P2) => P2, toP: (u: P2) => P2, pts: P2[], shade: Shade, axis?: { a: P2; b: P2; w: number }): void {
  c.order++;
  c.band = (hash(c.order, 7, 99) - 0.5) * 0.36;
  const CW = c.CW, CH = c.CH, L = c.L;
  let ry0 = Infinity, rx0 = Infinity;
  for (const p of pts) {
    ry0 = Math.min(ry0, p[1]);
    rx0 = Math.min(rx0, p[0]);
  }
  // Texture is keyed to the part at rest (lx, ly from the rest box), so it rides on the part.
  c.ox = Math.floor(rx0 + 1e-6);
  c.oy = Math.floor(ry0 + 1e-6);
  // Corners carried to where the bone has them (edges split where the map bends).
  let src = pts;
  if (m.bend) {
    src = [];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.6 * L)));
      for (let k = 0; k < n; k++) src.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    });
  }
  const fw = src.map((p) => toP(m.f(toU(p))));
  let y0 = Infinity, y1 = -Infinity;
  for (const p of fw) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  let ux = 0, uy = 0, vx = 0, vy = 0, len = 1;
  if (axis) {
    vx = axis.b[0] - axis.a[0];
    vy = axis.b[1] - axis.a[1];
    len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;
    ux = -vy;
    uy = vx;
    if (ux * -1 + uy * -1 > 0) {
      ux = -ux;
      uy = -uy;
    }
  }
  const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(CH - 1, Math.ceil(y1));
  const xs: number[] = [];
  const FX = c.FX, FY = c.FY;
  // The pixel centre in units, handed to the map (one array, refilled per pixel: the map reads it
  // at once, and its answer is read before the next pixel).
  const at: P2 = [0, 0];
  for (let y = iy0; y <= iy1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < fw.length; i++) {
      const a = fw[i]!, b = fw[i + 1 === fw.length ? 0 : i + 1]!;
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    // Ascending (an insertion sort: a row crosses a handful of edges).
    for (let i = 1; i < xs.length; i++) {
      const t = xs[i]!;
      let j = i - 1;
      while (j >= 0 && xs[j]! > t) {
        xs[j + 1] = xs[j]!;
        j--;
      }
      xs[j + 1] = t;
    }
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]! - 0.5)), xb = Math.min(CW - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = xa; x <= xb; x++) {
        // The rest pixel this one shows: toP(m.inv(toU([x + 0.5, cy]))), written out.
        at[0] = (x + 0.5 - FX) / L;
        at[1] = (cy - FY) / L;
        const rest = m.inv(at);
        const xr = Math.floor(FX + rest[0] * L), yr = Math.floor(FY + rest[1] * L);
        let u = 0, v = 0;
        if (axis) {
          const dx = xr + 0.5 - axis.a[0], dy = yr + 0.5 - axis.a[1];
          u = (dx * ux + dy * uy) / (axis.w / 2);
          v = (dx * vx + dy * vy) / len;
        }
        c.plot(x, y, shade(xr, yr, u, v));
      }
    }
  }
}
