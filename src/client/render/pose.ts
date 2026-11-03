// Which way a figure faces, from what it is doing (pure: no DOM, testable in Node).

import { Anim, type Dir } from './contract.ts';
import { dirFor } from './iso.ts';

/**
 * A figure's facing this frame: the way he moves; else, loosing a missile, where the shot goes
 * (a horse archer wheeling away shoots over his shoulder, archers shoot at a block off their
 * front); else at the foe he strikes or squares up to; else his regiment's front.
 *
 * `vx, vy`: his velocity; `tdx, tdy`: toward his foe (NaN: none); `melee`: the foe is in reach
 * (or he has no missile); `adx, ady`: his latest shot (NaN: none yet); `fx, fy`: the regiment's
 * front; `prev`: last frame's facing (hysteresis, see dirFor).
 */
export function facing(anim: Anim, vx: number, vy: number, tdx: number, tdy: number, melee: boolean, adx: number, ady: number, fx: number, fy: number, prev: Dir): Dir {
  const hasTarget = tdx === tdx;
  if (vx * vx + vy * vy > 9 && anim !== Anim.Attack && anim !== Anim.Shoot) return dirFor(vx, vy, prev);
  if (anim === Anim.Shoot && !hasTarget && adx === adx) return dirFor(adx, ady, prev);
  if (hasTarget && (anim === Anim.Attack || anim === Anim.Shoot || (anim === Anim.Brace && melee))) return dirFor(tdx, tdy, prev);
  return dirFor(fx, fy, prev);
}
