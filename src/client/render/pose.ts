// Which way a figure faces, from what it is doing (pure: no DOM, testable in Node).

import { Anim, type Dir } from './contract.ts';
import { dirFor } from './iso.ts';

/**
 * A figure's facing this frame: the way he moves (but a man with his foe in reach who is not
 * running keeps facing the foe as he shuffles, gives ground or steps back in the press); else,
 * loosing a missile, where the shot goes (a horse archer wheeling away shoots over his shoulder,
 * archers shoot at a block off their front); else at the foe he strikes or squares up to; else
 * his regiment's front. Flinching from a wound turns nobody (the foe in reach, else as he was).
 *
 * `vx, vy`: his velocity; `tdx, tdy`: toward his foe (NaN: none); `melee`: the foe is in reach
 * (or he has no missile); `adx, ady`: his latest shot (NaN: none yet); `fx, fy`: the regiment's
 * front; `prev`: last frame's facing (hysteresis, see dirFor).
 */
export function facing(anim: Anim, vx: number, vy: number, tdx: number, tdy: number, melee: boolean, adx: number, ady: number, fx: number, fy: number, prev: Dir): Dir {
  const hasTarget = tdx === tdx;
  const engaged = hasTarget && melee;
  if (vx * vx + vy * vy > 9 && anim !== Anim.Attack && anim !== Anim.Shoot && (anim === Anim.Run || !engaged)) return dirFor(vx, vy, prev);
  if (anim === Anim.Hit) return engaged ? dirFor(tdx, tdy, prev) : prev;
  if (engaged && anim !== Anim.Shoot) return dirFor(tdx, tdy, prev);
  if (anim === Anim.Shoot && !hasTarget && adx === adx) return dirFor(adx, ady, prev);
  if (hasTarget && (anim === Anim.Attack || anim === Anim.Shoot || (anim === Anim.Brace && melee))) return dirFor(tdx, tdy, prev);
  return dirFor(fx, fy, prev);
}

/**
 * Ticks a man keeps a new facing before he may turn again: a jostled march, a ragged approach or
 * the shuffling of a melee swings velocities and foes across a quadrant edge every tick or two,
 * and the figure would flicker between two facings.
 */
export const TURN_HOLD = 5;

/**
 * The facing to draw: `next` (from facing()), unless he turned from `prev` less than TURN_HOLD
 * ticks ago (`since`); a blow or a shot turns him at once.
 */
export function settleTurn(next: Dir, prev: Dir, anim: Anim, since: number): Dir {
  if (next === prev || anim === Anim.Attack || anim === Anim.Shoot || since >= TURN_HOLD) return next;
  return prev;
}
