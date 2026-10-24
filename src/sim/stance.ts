// What a platoon is doing and why: the keep-out rings around walls it may not storm yet, whether it
// is under fire it should answer or back away from, and (for the client) a plain-words reason for
// whatever it is doing. Everything here is a pure function of the world, so the simulation and every
// client agree on it without it being stored.

import { Kind, NEUTRAL, PlatoonState, TICKS_PER_SECOND, type Platoon, type Structure, type Unit, type World } from './api.ts';
import { besieging, breachable, gatesOpenAt, sitePresence, siegeNeed, stormable } from './council.ts';
import { computeRing, hostile, type Front, type Ring } from './ring.ts';
import { CAPITAL_TOWER, MORALE_RALLY, STATS, breachPace, pacing } from './stats.ts';

/** How far beyond a tower's reach a platoon waiting on walls it may not storm yet keeps its banner. */
export const STAGING_MARGIN = 45;
/** A missile that landed this recently still counts as being under fire. */
export const UNDER_FIRE = 8 * TICKS_PER_SECOND;
/** A platoon goes after a shooter whose position is within this distance of its banner. */
export const HUNT_REACH = 320;

/** How far a capital's tower reaches from the capital's centre. */
export function towerReach(radius: number): number {
  return CAPITAL_TOWER.range + radius * 0.5;
}

/** How far from a capital's centre a platoon that may not storm it stands: out of its tower's reach, with a margin. */
export function keepOut(radius: number): number {
  return towerReach(radius) + STAGING_MARGIN;
}

/**
 * The capitals platoon `pl` must keep out of the tower's reach of, as a bit mask over
 * world.structures: every foe's walls except the ones it has been sent to storm and may storm now.
 */
export function noGoMask(world: World, ring: Ring, pl: Platoon): number {
  let mask = 0;
  const { structures } = world;
  for (let k = 0; k < structures.length && k < 31; k++) {
    const st = structures[k]!;
    if (st.hp <= 0 || st.p === pl.p || !hostile(ring, pl.p, st.p)) continue;
    if (st.site === pl.site && stormable(world, ring, k, pl.p)) continue;
    mask |= 1 << k;
  }
  return mask;
}

/** The first structure in `mask` whose keep-out ring (grown by `grow`) holds (x, y), or -1. */
export function zoneAt(world: World, mask: number, x: number, y: number, grow = 0): number {
  if (mask === 0) return -1;
  const { structures } = world;
  const sites = world.map.sites;
  for (let k = 0; k < structures.length && k < 31; k++) {
    if (((mask >>> k) & 1) === 0) continue;
    const def = sites[structures[k]!.site]!;
    const r = keepOut(def.radius) + grow;
    const dx = x - def.x;
    const dy = y - def.y;
    if (dx * dx + dy * dy < r * r) return k;
  }
  return -1;
}

/**
 * Whether a foe at (x, y) shelters under walls in `mask`: within the tower's own reach. Soldiers do
 * not go after such a foe, and a platoon it shoots at backs out of its range instead.
 */
export function sheltered(world: World, mask: number, x: number, y: number): boolean {
  return zoneAt(world, mask, x, y, -STAGING_MARGIN) >= 0;
}

/** Whether a missile landed on `pl` recently. */
export function underFire(tick: number, at: number): boolean {
  return at >= 0 && tick - at < UNDER_FIRE;
}

/** What a platoon is doing, and why. */
export const Wait = {
  Marching: 0,
  Fighting: 1,
  /** No walls fall before the sieges open; `eta` ticks to go. */
  Sieges: 2,
  /** The sieges are open but the foe's gates are barred; `eta` ticks to go. */
  Barred: 3,
  /** Gathering on the front until enough soldiers have massed to storm: `n` of `m`. */
  Massing: 4,
  /** The walls can be stormed only from the border fort beside them: it must be taken first. */
  NeedFort: 5,
  Holding: 6,
  /** Under fire from walls (or soldiers behind them) it may not storm yet: backing out of reach. */
  PullBack: 7,
  /** Routed and back at the colours: re-forming at home. */
  Regrouping: 8,
  Rising: 9,
  /** Storming walls; `eta` ticks until they could fall at the siege's pace, or -1. */
  Besieging: 10,
  Routing: 11,
} as const;
export type Wait = (typeof Wait)[keyof typeof Wait];

export const WAIT_NAMES: readonly string[] = ['Marching', 'Fighting', 'Waiting for sieges', 'Gates barred', 'Massing', 'Need the fort first', 'Holding the fort', 'Under fire, pulling back', 'Regrouping', 'Rising', 'Besieging', 'Routing'];

export interface WaitInfo {
  kind: Wait;
  /** Ticks until the thing waited on (sieges open, gates unbar, walls could fall), or -1. */
  eta: number;
  /** Massing: soldiers gathered on the front, and soldiers needed. */
  n: number;
  m: number;
  /** The site it concerns: its objective, the walls it waits on or besieges, the fort it needs. */
  site: number;
  /** The foe it faces there (a player), or -1. */
  foe: number;
  /** The kind of the soldier shooting at it, when it is answering or backing away from one; else -1. */
  by: Kind | -1;
}

/** What `platoonWait` reads once per world state: the ring, who stands near each site, units by id. */
export interface WaitContext {
  world: World;
  ring: Ring;
  presence: Int32Array;
  units: Map<number, Unit>;
  /** Per platoon id: the centre of its soldiers, as the simulation measures a pull-back from. */
  centre: Map<number, { x: number; y: number; n: number }>;
}

export function waitContext(world: World): WaitContext {
  const units = new Map<number, Unit>();
  const centre = new Map<number, { x: number; y: number; n: number }>();
  for (const u of world.units) {
    units.set(u.id, u);
    let c = centre.get(u.platoon);
    if (!c) centre.set(u.platoon, (c = { x: 0, y: 0, n: 0 }));
    c.x += u.x;
    c.y += u.y;
    c.n++;
  }
  for (const c of centre.values()) {
    c.x /= c.n;
    c.y /= c.n;
  }
  return { world, ring: computeRing(world), presence: sitePresence(world), units, centre };
}

/**
 * The tick by which walls could fall at the most the siege pace allows from now on (the ramp after
 * the sieges open, then full pace), or -1 if not within the war.
 */
export function breachAt(world: World, st: Structure): number {
  const pc = pacing(world.params.ticks);
  const perTick = st.maxHp / pc.breach;
  let hp = st.hp;
  let t = Math.max(world.tick, gatesOpenAt(world, st));
  const STEP = 60;
  while (t < pc.ticks) {
    if (t >= pc.full) {
      const left = Math.ceil(hp / perTick);
      return t + left <= pc.ticks ? t + left : -1;
    }
    const cap = perTick * breachPace(pc, t + STEP / 2) * STEP;
    if (cap >= hp) return t + Math.ceil((hp / cap) * STEP);
    hp -= cap;
    t += STEP;
  }
  return -1;
}

/** The front a platoon fights on: the one in its direction, else the first. */
function frontOfPlatoon(ring: Ring, pl: Platoon): Front | null {
  const fronts = ring.fronts[pl.p] ?? [];
  for (const f of fronts) if (f.dir === pl.front) return f;
  return fronts[0] ?? null;
}

const NEAR_SITE = 150;

/** Why platoon `pl` is doing what it is doing. Pure: every client derives the same answer. */
export function platoonWait(ctx: WaitContext, pl: Platoon): WaitInfo {
  const { world, ring } = ctx;
  const out: WaitInfo = { kind: Wait.Marching, eta: -1, n: 0, m: 0, site: pl.site, foe: -1, by: -1 };
  const tick = world.tick;
  const sites = world.map.sites;
  if (pl.state === PlatoonState.Rout) {
    out.kind = Wait.Routing;
    out.site = pl.home;
    return out;
  }
  const mask = noGoMask(world, ring, pl);
  const c = ctx.centre.get(pl.id) ?? pl;
  // Backing out of a tower's reach, or out of bowshot of soldiers sheltering under it.
  if (underFire(tick, pl.towerAt) && pl.towerBy < 0) {
    const k = -pl.towerBy - 1;
    const st = world.structures[k];
    if (st && ((mask >>> k) & 1) === 1) {
      const def = sites[st.site]!;
      const r = keepOut(def.radius) + pl.length * 0.5;
      if ((c.x - def.x) ** 2 + (c.y - def.y) ** 2 < r * r) {
        out.kind = Wait.PullBack;
        out.site = st.site;
        out.foe = st.p;
        return out;
      }
    }
  }
  const shooter = underFire(tick, pl.hitAt) && pl.hitBy > 0 ? ctx.units.get(pl.hitBy) : undefined;
  if (shooter && hostile(ring, pl.p, shooter.p)) {
    out.by = shooter.kind;
    out.foe = shooter.p;
    if (sheltered(world, mask, shooter.x, shooter.y)) {
      const r = STATS[shooter.kind]!.range + STAGING_MARGIN * 0.5 + pl.length * 0.5;
      if ((c.x - shooter.x) ** 2 + (c.y - shooter.y) ** 2 < r * r) {
        out.kind = Wait.PullBack;
        return out;
      }
      out.by = -1;
      out.foe = -1;
    } else if ((pl.x - shooter.x) ** 2 + (pl.y - shooter.y) ** 2 <= HUNT_REACH * HUNT_REACH) {
      out.kind = Wait.Fighting;
      return out;
    } else {
      out.by = -1;
      out.foe = -1;
    }
  }
  if (pl.state === PlatoonState.Engage) {
    out.kind = Wait.Fighting;
    if (pl.threat > 0) {
      const o = world.platoons.find((x) => x.id === pl.threat);
      if (o) out.foe = o.p;
    }
    return out;
  }
  const def = pl.site >= 0 ? sites[pl.site] : undefined;
  if (!def) return out;
  const dist = Math.sqrt((def.x - pl.x) ** 2 + (def.y - pl.y) ** 2);
  const near = pl.state === PlatoonState.Hold || dist <= NEAR_SITE + def.radius;
  // At (or marching on) walls it may storm.
  if (def.kind === 'capital' && ring.owner[def.slot] !== pl.p) {
    const k = world.structures.findIndex((st) => st.site === pl.site);
    if (k >= 0 && stormable(world, ring, k, pl.p)) {
      const st = world.structures[k]!;
      out.foe = st.p;
      if (near || dist < towerReach(def.radius) + 20) {
        out.kind = Wait.Besieging;
        const at = breachAt(world, st);
        out.eta = at >= 0 ? at - tick : -1;
        return out;
      }
      out.kind = pl.rising ? Wait.Rising : Wait.Marching;
      return out;
    }
  }
  // Back to the colours after a rout.
  if (!near && pl.site === pl.home && pl.morale < MORALE_RALLY + 5 && def.kind === 'capital' && ring.owner[def.slot] === pl.p) {
    out.kind = Wait.Regrouping;
    return out;
  }
  // What stands between the front and the foe's walls.
  const f = frontOfPlatoon(ring, pl);
  if (f && f.foe !== NEUTRAL) {
    const capital = f.to;
    const k = world.structures.findIndex((st) => sites[st.site]!.kind === 'capital' && sites[st.site]!.slot === capital);
    const st = k >= 0 ? world.structures[k]! : undefined;
    if (st) {
      out.foe = st.p;
      const approach = f.forts.length > 0 ? f.forts[f.forts.length - 1]! : -1;
      const fortTaken = def.kind === 'fort' && world.sites[pl.site]!.owner !== pl.p;
      // Soldiers gathered on the front, against what storming these walls will take.
      const n = world.players.length;
      let massed = 0;
      for (const fk of f.forts) massed += ctx.presence[fk * n + pl.p]!;
      massed += ctx.presence[capital * n + pl.p]!;
      if (f.from < 0) for (const fk of [world.map.slots + capital, world.map.slots + ((capital - 1 + world.map.slots) % world.map.slots)]) massed += ctx.presence[fk * n + pl.p]!;
      const need = Math.ceil(siegeNeed(st));
      out.n = massed;
      out.m = need;
      if (!breachable(world, st)) {
        if (!near && !fortTaken) {
          out.kind = pl.rising ? Wait.Rising : Wait.Marching;
          return out;
        }
        const pc = pacing(world.params.ticks);
        const opens = gatesOpenAt(world, st);
        out.kind = tick < pc.opens ? Wait.Sieges : Wait.Barred;
        out.eta = (tick < pc.opens ? pc.opens : opens) - tick;
        out.site = pl.site;
        // Taking a fort before the sieges open is its own errand.
        if (fortTaken) {
          out.kind = Wait.Marching;
          out.eta = -1;
        }
        return out;
      }
      if (!besieging(world, ring, pl.p, capital)) {
        out.kind = Wait.NeedFort;
        out.site = approach >= 0 && def.kind !== 'fort' ? approach : pl.site;
        return out;
      }
      if (near && massed < need) {
        out.kind = Wait.Massing;
        out.n = massed;
        out.m = need;
        out.site = pl.site;
        return out;
      }
    }
  }
  if (near && def.kind === 'fort' && world.sites[pl.site]!.owner === pl.p) {
    out.kind = Wait.Holding;
    return out;
  }
  out.kind = pl.rising ? Wait.Rising : Wait.Marching;
  return out;
}
