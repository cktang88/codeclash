import { NEUTRAL, type Structure, type World } from '../sim/api.ts';
import { breachable } from '../sim/council.ts';
import { pacing } from '../sim/stats.ts';

// What the client tells players about the ring's sieges, read from the world: when the walls can
// first be stormed, how long a founder's gates stay barred, who founded a capital. One place, so
// the battlefield labels, the HUD and the inspector always agree with the simulation's own rules.

/** The tick the sieges open: no walls fall before it. */
export function siegesOpenAt(world: World): number {
  return pacing(world.params.ticks).opens;
}

/**
 * The tick a capital's gates unbar, or -1 when they can be stormed now (or once the sieges open).
 * A founder's gates stay barred for a grace after its first push, or until a fixed hour.
 */
export function gatesUnbarAt(world: World, st: Structure): number {
  if (breachable(world, st)) return -1;
  const pc = pacing(world.params.ticks);
  if (st.taken > 0) return -1;
  const holder = world.players[st.p];
  const grace = holder && holder.firstPushAt >= 0 ? holder.firstPushAt + pc.grace : Infinity;
  const until = Math.min(pc.barredUntil, grace);
  return until > Math.max(world.tick, pc.opens) ? until : -1;
}

/** The player whose home seat this is, or NEUTRAL for an open seat. */
export function founderOf(world: World, slot: number): number {
  for (const pl of world.players) if (pl.slot === slot) return pl.p;
  return NEUTRAL;
}
