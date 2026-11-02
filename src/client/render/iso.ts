// The isometric projection of the battlefield.
//
// The ground plane (world x, y; armies deploy at the low and high ends of x) is turned 30°
// clockwise and then squashed to half height, the three-quarter look of a camera raised ~30°
// over the field:
//
//     mapX = PX · ( x·cos30 − y·sin30)
//     mapY = PX · ( x·sin30 + y·cos30) · 0.5
//
// so world +x (the way army 0 advances) runs right and a little down the screen, and a battle
// line (along world y) runs from upper right to lower left. Army 0 faces the viewer (Dir 0, SE),
// army 1 faces away (Dir 2, NW), which suits the sprites' four diagonal facings.
//
// "Map pixels" are pixels of the low-resolution scene buffer, before the camera; the ground
// texture is painted in map pixels, so its dithering lines up with the screen pixel for pixel.

import type { Dir } from './contract.ts';

const ANGLE = (30 * Math.PI) / 180;
const C = Math.cos(ANGLE);
const S = Math.sin(ANGLE);
/** Height squash of the ground plane. */
export const SQUASH = 0.5;
/** Map pixels per world unit along the turned axes. */
export const PX = 1.15;

export function projX(x: number, y: number): number {
  return PX * (x * C - y * S);
}
export function projY(x: number, y: number): number {
  return PX * (x * S + y * C) * SQUASH;
}

/** World point under a map pixel. */
export function unproject(mx: number, my: number): [number, number] {
  const u = mx / PX;
  const v = my / (PX * SQUASH);
  return [u * C + v * S, -u * S + v * C];
}

/** Screen direction of a world vector, with the squash. */
export function screenDir(dx: number, dy: number): [number, number] {
  return [dx * C - dy * S, (dx * S + dy * C) * SQUASH];
}

/**
 * The facing for a world-space direction. `prev` gives hysteresis: near a quadrant boundary
 * (within ~12°) the old facing is kept, so a soldier walking along the screen's horizontal
 * does not flicker between SE and NE.
 */
export function dirFor(dx: number, dy: number, prev: Dir): Dir {
  const sx = dx * C - dy * S;
  const sy = (dx * S + dy * C) * SQUASH;
  const n = Math.abs(sx) + Math.abs(sy);
  if (n < 1e-6) return prev;
  const margin = 0.2 * Math.sqrt(sx * sx + sy * sy);
  const d: Dir = sx >= 0 ? (sy >= 0 ? 0 : 3) : sy >= 0 ? 1 : 2;
  if (d === prev) return d;
  // Keep the old facing while the vector sits close to the shared edge of the two quadrants.
  const nearH = Math.abs(sy) < margin && (prev === 0 || prev === 3) === sx >= 0;
  const nearV = Math.abs(sx) < margin && (prev === 0 || prev === 1) === sy >= 0;
  return nearH || nearV ? prev : d;
}
