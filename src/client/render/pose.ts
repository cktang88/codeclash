// Which way a figure faces, from what it is doing (pure: no DOM, testable in Node).

import { Anim, type Dir } from './contract.ts';
import { dirFor, screenDir } from './iso.ts';

/**
 * A figure's facing this frame: the way he moves (but a man with his foe in reach who is not
 * running keeps facing the foe as he shuffles, gives ground or steps back in the press); else,
 * loosing a missile, where the shot goes (a horse archer wheeling away shoots over his shoulder,
 * archers shoot at a block off their front); else at the foe he strikes or squares up to; else
 * his own front (ownFront: his regiment's, its rear for a rear-ranker turned about, the enemy
 * block for a man swinging round its flank). Flinching from a wound turns nobody (the foe in reach, else as he was).
 *
 * `vx, vy`: his velocity; `tdx, tdy`: toward his foe (NaN: none); `melee`: the foe is in reach
 * (or he has no missile); `adx, ady`: his latest shot (NaN: none yet); `fx, fy`: his own
 * front (ownFront); `hold`: he keeps his own front while he steps in his guard (see above); `prev`: last frame's facing (hysteresis, see dirFor).
 */
export function facing(anim: Anim, vx: number, vy: number, tdx: number, tdy: number, melee: boolean, adx: number, ady: number, fx: number, fy: number, prev: Dir, hold = false): Dir {
  const hasTarget = tdx === tdx;
  const engaged = hasTarget && melee;
  // Walking in his guard (pressing, giving ground, closing) he keeps his front to his foe; with
  // none, a man who `hold`s his own front (a rear-ranker turned about, closing on the press
  // behind him) keeps it.
  if (anim === Anim.Advance && hasTarget) return dirFor(tdx, tdy, prev);
  if (anim === Anim.Advance && hold) return dirFor(fx, fy, prev);
  if (vx * vx + vy * vy > 9 && anim !== Anim.Attack && anim !== Anim.Shoot && (anim === Anim.Run || !engaged)) return dirFor(vx, vy, prev);
  if (anim === Anim.Hit) return engaged ? dirFor(tdx, tdy, prev) : prev;
  if (engaged && anim !== Anim.Shoot) return dirFor(tdx, tdy, prev);
  if (anim === Anim.Shoot && !hasTarget && adx === adx) return dirFor(adx, ady, prev);
  if (hasTarget && (anim === Anim.Attack || anim === Anim.Shoot || (anim === Anim.Brace && melee))) return dirFor(tdx, tdy, prev);
  return dirFor(fx, fy, prev);
}

/** A world direction, filled in place (no allocation per figure). */
export interface Vec {
  x: number;
  y: number;
}

/**
 * The front a man with no foe of his own squares to (facing()'s `fx, fy`), filled into `out`:
 * his regiment's front (`fx, fy`), but the rear half of a block locked to its front that has faced
 * about against an enemy at its back (`rear`, battle.ts facesRear) faces its rear; and a man
 * swinging round the enemy's flank (`curling`, Soldier.curling) faces the block he goes round
 * (`ex, ey`: from him to that block; NaN: none). A block that has faced round has its new front at
 * once (battle.ts faceAbout), so its men, standing or re-forming, already face it.
 */
export function ownFront(fx: number, fy: number, rear: boolean, curling: boolean, ex: number, ey: number, out: Vec): Vec {
  if (curling && ex === ex && ex * ex + ey * ey > 1e-6) {
    out.x = ex;
    out.y = ey;
  } else if (rear) {
    out.x = -fx;
    out.y = -fy;
  } else {
    out.x = fx;
    out.y = fy;
  }
  return out;
}

/**
 * Ticks a man keeps a new facing before he may turn again: a jostled march, a ragged approach or
 * the shuffling of a melee swings velocities and foes across a quadrant edge every tick or two,
 * and the figure would flicker between two facings.
 */
export const TURN_HOLD = 5;

/**
 * The facing to draw: `next` (from facing()), unless he turned from `prev` less than TURN_HOLD
 * ticks ago (`since`), or less than twice that if `next` is `left`, the facing he turned from (a
 * man torn between his foe and the way he steps would otherwise swing back and forth at every
 * hold's end); a blow or a shot turns him at once.
 */
export function settleTurn(next: Dir, prev: Dir, anim: Anim, since: number, left: Dir | -1 = -1): Dir {
  if (next === prev || anim === Anim.Attack || anim === Anim.Shoot || since >= (next === left ? 2 * TURN_HOLD : TURN_HOLD)) return next;
  return prev;
}

/**
 * World units a risen man may move from where he lay before his rise is cut short: the fall
 * played backwards is a man on the ground, and one the battle already walks off would slide
 * across the field as a heap of bones.
 */
export const RISE_SLIDE = 3;

/**
 * Whether a man raised from the dead is still drawn getting up: `since` ticks after he rose, of a
 * rise `ticks` long, `dx, dy` from where he lay (NaN: not known, as for a scene made mid-rise).
 */
export function stillRising(since: number, ticks: number, dx: number, dy: number): boolean {
  return since < ticks && dx * dx + dy * dy < RISE_SLIDE * RISE_SLIDE;
}

/**
 * Ticks a man about-facing shows the facing between before he completes the turn (a half turn,
 * SE to NW, is a quarter and then another, not a flip: the figure seems to turn rather than pop).
 */
export const TURN_STEP = 1;

/**
 * The facing to show on the way from `prev` to `next`: for a half turn (opposite facings), the
 * quarter between them nearer the way he turns to (world `dx, dy`); otherwise `next` itself.
 */
export function turnVia(prev: Dir, next: Dir, dx: number, dy: number): Dir {
  if (((next - prev) & 3) !== 2) return next;
  const [sx, sy] = screenDir(dx, dy);
  if (sx === 0 && sy === 0) return ((prev + 1) & 3) as Dir;
  // Near the screen's horizontal: the quarter with the target's left/right; else its up/down.
  return (Math.abs(sy) < Math.abs(sx) ? next ^ 3 : next ^ 1) as Dir;
}
