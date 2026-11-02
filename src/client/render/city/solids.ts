// More solids for the HD faction kits: triangles and any four-sided face, battered stone bases
// (ishigaki, plinths), hipped roofs and rounded mounds. Shaded by world point rather than by
// patch coordinates, since these faces are not parallelograms.

import { type Col, type Facing, type Px, v3, type V3 } from './pixels.ts';

export type PShader = (face: Facing, p: V3) => Col;

/** A triangle p0 p1 p2. */
export function tri3(px: Px, p0: V3, p1: V3, p2: V3, face: Facing, shade: PShader): void {
  px.quad(p0, v3(p1.u - p0.u, p1.v - p0.v, p1.z - p0.z), v3(p2.u - p0.u, p2.v - p0.v, p2.z - p0.z), (_s, _t, p) => shade(face, p), true);
}

/** A planar convex four-sided face as two triangles. */
export function face4(px: Px, a: V3, b: V3, c: V3, d: V3, face: Facing, shade: PShader): void {
  tri3(px, a, b, c, face, shade);
  tri3(px, a, c, d, face, shade);
}

/**
 * A battered block: footprint u0..u0+lu, v0..v0+lv at z0, leaning in by `inset` on every side at
 * height h (ishigaki, a sloped plinth, a tapering spire base).
 */
export function frustum(px: Px, u0: number, v0: number, z0: number, lu: number, lv: number, h: number, inset: number, shade: PShader, top = true): void {
  const u1 = u0 + lu;
  const v1 = v0 + lv;
  const z1 = z0 + h;
  const i = inset;
  face4(px, v3(u0, v1, z0), v3(u1, v1, z0), v3(u1 - i, v1 - i, z1), v3(u0 + i, v1 - i, z1), 'left', shade);
  face4(px, v3(u1, v0, z0), v3(u1, v1, z0), v3(u1 - i, v1 - i, z1), v3(u1 - i, v0 + i, z1), 'right', shade);
  if (top) px.quad(v3(u0 + i, v0 + i, z1), v3(lu - 2 * i, 0, 0), v3(0, lv - 2 * i, 0), (_s, _t, p) => shade('top', p));
}

/**
 * A hipped roof over u0..u0+lu, v0..v0+lv at eave height z, ridge `rh` above, eaves out by `o`
 * (dropping o·drop). The ridge runs along the longer side; `ridgeFrac` < 1 shortens the hips
 * (a steeper hip end), as on irimoya and tenshu roofs.
 */
export function hip(px: Px, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, shade: PShader, drop = 0.5): void {
  const zl = z - o * drop;
  const a0 = v3(u0 - o, v0 - o, zl);
  const a1 = v3(u0 + lu + o, v0 - o, zl);
  const a2 = v3(u0 + lu + o, v0 + lv + o, zl);
  const a3 = v3(u0 - o, v0 + lv + o, zl);
  const zr = z + rh;
  if (lu >= lv) {
    const vm = v0 + lv / 2;
    const d = lv / 2;
    const r0 = v3(u0 + d, vm, zr);
    const r1 = v3(u0 + lu - d, vm, zr);
    face4(px, a0, a1, r1, r0, 'back', shade);
    tri3(px, a3, a0, r0, 'back', shade);
    face4(px, a3, a2, r1, r0, 'left', shade);
    tri3(px, a1, a2, r1, 'right', shade);
  } else {
    const um = u0 + lu / 2;
    const d = lu / 2;
    const r0 = v3(um, v0 + d, zr);
    const r1 = v3(um, v0 + lv - d, zr);
    face4(px, a0, a3, r1, r0, 'back', shade);
    tri3(px, a0, a1, r0, 'back', shade);
    face4(px, a1, a2, r1, r0, 'right', shade);
    tri3(px, a3, a2, r1, 'left', shade);
  }
}

/** A rounded mound (a barrow, a spoil heap): an ellipsoid cap. `shade` gets a light term -1..1. */
export function mound(px: Px, cu: number, cv: number, ru: number, rv: number, h: number, shade: (n: number, p: V3) => Col): void {
  const step = 0.5 / px.k;
  const p = v3(0, 0, 0);
  for (let u = -ru; u <= ru; u += step)
    for (let v = -rv; v <= rv; v += step) {
      const r2 = (u * u) / (ru * ru) + (v * v) / (rv * rv);
      if (r2 > 1) continue;
      const z = h * Math.sqrt(1 - r2);
      // Surface normal of the cap, lit from the upper left: slopes toward +v lit, toward +u shaded.
      const nu = (u / (ru * ru)) * h;
      const nv = (v / (rv * rv)) * h;
      const nz = Math.max(0.15, Math.sqrt(Math.max(0, 1 - r2)));
      const l = (nv * 0.7 - nu * 0.7 + nz * 0.6) / Math.hypot(nu, nv, nz);
      p.u = cu + u;
      p.v = cv + v;
      p.z = z;
      px.point(p, shade(l, p));
    }
}
