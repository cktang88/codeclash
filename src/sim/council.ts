import { Doctrine, NEUTRAL, PlatoonState, type World } from './api.ts';
import type { Scratch } from './scratch.ts';

const PRESENCE_REACH = 130;
const DISTANCE_SCALE = 450;
const CROWD_PENALTY = 0.7;
const OUTMATCHED = 1.6;

/** Per site: soldiers of each player within reach. presence[site * players + p]. */
export function sitePresence(world: World): Int32Array {
  const { sites } = world.map;
  const n = world.players.length;
  const presence = new Int32Array(sites.length * Math.max(1, n));
  for (const u of world.units) {
    if (u.p < 0) continue;
    for (let k = 0; k < sites.length; k++) {
      const def = sites[k]!;
      const reach = def.radius + PRESENCE_REACH;
      const dx = u.x - def.x;
      const dy = u.y - def.y;
      if (dx * dx + dy * dy <= reach * reach) presence[k * n + u.p]!++;
    }
  }
  return presence;
}

/**
 * The war council of player `p`: hands every marching or holding platoon an
 * objective. A rally overrides it. Otherwise each site is scored by renown,
 * distance from the platoon (supply lines), nearby strength, and doctrine, and
 * platoons already sent somewhere make that site less attractive to the next.
 */
export function runCouncil(world: World, s: Scratch, p: number, presence: Int32Array): void {
  const player = world.players[p]!;
  const { sites: defs } = world.map;
  const n = world.players.length;
  const assigned = new Int32Array(defs.length);
  const rallying = player.rallySite >= 0 && player.rallyUntil > world.tick;
  for (const pl of world.platoons) {
    if (pl.p !== p || pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout) continue;
    if (rallying) {
      pl.site = player.rallySite;
      continue;
    }
    let best = player.slot;
    let bestScore = 0;
    for (let k = 0; k < defs.length; k++) {
      const score = siteScore(world, p, k, pl.x, pl.y, pl.alive, presence, n) / (1 + assigned[k]! * CROWD_PENALTY);
      if (score > bestScore || (score === bestScore && k < best)) {
        bestScore = score;
        best = k;
      }
    }
    // Stick with the current objective unless the new one is clearly better.
    const current = pl.site >= 0 ? siteScore(world, p, pl.site, pl.x, pl.y, pl.alive, presence, n) / (1 + assigned[pl.site]! * CROWD_PENALTY) : 0;
    if (pl.site >= 0 && current * 1.25 >= bestScore) best = pl.site;
    pl.site = best;
    assigned[best]!++;
  }
}

function siteScore(world: World, p: number, k: number, x: number, y: number, strength: number, presence: Int32Array, n: number): number {
  const player = world.players[p]!;
  const def = world.map.sites[k]!;
  const state = world.sites[k]!;
  const doctrine = player.doctrine;
  let mine = 0;
  let enemy = 0;
  for (let q = 0; q < n; q++) {
    const c = presence[k * n + q]!;
    if (q === p) mine += c;
    else enemy += c;
  }
  let value = 0;
  if (def.kind === 'capital') {
    if (def.slot === player.slot) {
      value = enemy > 0 ? 3 + enemy * 0.05 : 0;
    } else {
      const owner = capitalOwner(world, def.slot);
      if (owner === NEUTRAL) return 0;
      const structure = world.structures.find((st) => st.site === k);
      if (!structure || structure.ruinedUntil >= 0) return 0;
      value = doctrine === Doctrine.Siege ? 7 : doctrine === Doctrine.Assault ? 3.5 : 1.5;
      if (owner === world.leader && owner !== p) value *= 1.4;
    }
  } else if (def.kind === 'shrine') {
    if (state.owner === p) value = enemy > 0 ? (doctrine === Doctrine.Hold ? 7 : 4) : 0.4;
    else value = state.owner === NEUTRAL ? 4 : 3.5;
    if (doctrine === Doctrine.Hold && state.owner !== p) value *= 0.7;
  } else {
    if (!world.monolithFallen) value = 3.5;
    else if (state.owner === p) value = enemy > 0 ? 8 : 1;
    else value = 7;
    if (doctrine === Doctrine.Assault) value *= 1.5;
  }
  if (value <= 0) return 0;
  if (doctrine === Doctrine.Skirmish) value /= 1 + enemy / 12;
  else if (enemy > (strength + mine) * OUTMATCHED && def.kind !== 'heart') value *= 0.35;
  const dx = def.x - x;
  const dy = def.y - y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = doctrine === Doctrine.Hold ? DISTANCE_SCALE * 0.6 : DISTANCE_SCALE;
  return value / (1 + dist / scale);
}

export function capitalOwner(world: World, slot: number): number {
  for (const pl of world.players) if (pl.slot === slot) return pl.p;
  return NEUTRAL;
}
