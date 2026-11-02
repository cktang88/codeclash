// The four facings of a paper figure. A figure is drawn by hand facing south-east (front
// three-quarter) and north-east (back three-quarter); south-west and north-west are those
// drawings mirrored about the foot point, unless the figure draws them itself.
//
// In both hand-drawn facings screen-right is the figure's forward, the light is top-left, and
// the figure's right side (weapon hand) is toward the viewer: in SE we see the face, the chest
// and the shield's face beyond the body; in NE the back of the skull, the spine and shoulder
// blades, and the back of the shield behind the body.

import type { Dir } from '../contract.ts';
import type { Paper } from './core.ts';

export type Facing = 'se' | 'sw' | 'ne' | 'nw';

/** contract.ts Dir to facing: 0 SE, 1 SW, 2 NW, 3 NE. */
export const DIR_FACING: readonly Facing[] = ['se', 'sw', 'nw', 'ne'];
export const facingOf = (dir: Dir): Facing => DIR_FACING[dir]!;

/** Away from the viewer (we see the back). */
export const isBack = (f: Facing): boolean => f === 'ne' || f === 'nw';
/** The mirror partner of a facing. */
export const MIRROR: Record<Facing, Facing> = { se: 'sw', sw: 'se', ne: 'nw', nw: 'ne' };

/** The facings a figure draws by default; the other two mirror them. */
export const DRAWN_DEFAULT: readonly Facing[] = ['se', 'ne'];

/**
 * How to produce a facing from the facings a figure draws: draw that one, or draw its partner and
 * mirror. Null when neither is drawn.
 */
export function planFacing(f: Facing, drawn: readonly Facing[] = DRAWN_DEFAULT): { draw: Facing; mirror: boolean } | null {
  if (drawn.includes(f)) return { draw: f, mirror: false };
  if (drawn.includes(MIRROR[f])) return { draw: MIRROR[f], mirror: true };
  return null;
}

/** Runs a draw for a facing on a fresh canvas, mirroring afterwards when the plan says so. */
export function drawFacing(paper: Paper, f: Facing, drawn: readonly Facing[], draw: (facing: Facing) => void): boolean {
  const plan = planFacing(f, drawn);
  if (!plan) return false;
  draw(plan.draw);
  if (plan.mirror) paper.mirror();
  return true;
}
