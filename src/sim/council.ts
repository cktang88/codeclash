import { NEUTRAL, PlatoonState, type Platoon, type Structure, type World } from './api.ts';
import { pacing } from './stats.ts';
import { frontOf, hostile, type Front, type Ring } from './ring.ts';
import type { Scratch } from './scratch.ts';

const PRESENCE_REACH = 130;
const DISTANCE_SCALE = 450;
const CROWD_PENALTY = 0.7;
const OUTMATCHED = 1.6;
/** Soldiers massed on a front before its foe's full-strength walls are stormed; fewer for walls already breached. */
export const SIEGE_MASS = 25;
export const SIEGE_MIN = 10;

/** Soldiers that must have massed on the front before walls at this strength are stormed. */
export function siegeNeed(walls: Structure): number {
  return SIEGE_MIN + (SIEGE_MASS - SIEGE_MIN) * (walls.hp / walls.maxHp);
}

/**
 * Per presence cell, the sites whose reach could cover a point in it, so each soldier is tested
 * against a few nearby sites instead of all of them. Built once per map. A cell lists a site when
 * the site's reach circle, grown by a cell's diagonal, contains the cell's centre: a superset, so
 * the exact distance test below still decides every count.
 */
const SITE_GRID = 64;
interface SiteGrid {
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  start: Int32Array;
  list: Int32Array;
}
const siteGrids = new WeakMap<object, SiteGrid>();

function siteGrid(world: World): SiteGrid {
  const map = world.map;
  let g = siteGrids.get(map);
  if (g) return g;
  const { sites } = map;
  const cols = Math.ceil((map.navCols * map.navCell) / SITE_GRID) + 1;
  const rows = Math.ceil((map.navRows * map.navCell) / SITE_GRID) + 1;
  const start = new Int32Array(cols * rows + 1);
  const lists: number[][] = [];
  const half = SITE_GRID * 0.75;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = map.originX + (cx + 0.5) * SITE_GRID;
      const y = map.originY + (cy + 0.5) * SITE_GRID;
      const here: number[] = [];
      for (let k = 0; k < sites.length; k++) {
        const def = sites[k]!;
        const reach = def.radius + PRESENCE_REACH + half;
        const dx = x - def.x;
        const dy = y - def.y;
        if (dx * dx + dy * dy <= reach * reach) here.push(k);
      }
      lists.push(here);
    }
  }
  let n = 0;
  for (let c = 0; c < lists.length; c++) {
    start[c] = n;
    n += lists[c]!.length;
  }
  start[lists.length] = n;
  const list = new Int32Array(n);
  for (let c = 0, o = 0; c < lists.length; c++) for (const k of lists[c]!) list[o++] = k;
  g = { cols, rows, ox: map.originX, oy: map.originY, start, list };
  siteGrids.set(map, g);
  return g;
}

/** Per site: soldiers of each player within reach. presence[site * players + p]. */
export function sitePresence(world: World): Int32Array {
  const { sites } = world.map;
  const n = world.players.length;
  const presence = new Int32Array(sites.length * Math.max(1, n));
  const g = siteGrid(world);
  for (const u of world.units) {
    if (u.p < 0) continue;
    const cx = Math.floor((u.x - g.ox) / SITE_GRID);
    const cy = Math.floor((u.y - g.oy) / SITE_GRID);
    if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) {
      // Off the grid (never on a real map): test every site.
      for (let k = 0; k < sites.length; k++) countIfNear(presence, sites[k]!, k, n, u.x, u.y, u.p);
      continue;
    }
    const c = cy * g.cols + cx;
    for (let o = g.start[c]!; o < g.start[c + 1]!; o++) {
      const k = g.list[o]!;
      countIfNear(presence, sites[k]!, k, n, u.x, u.y, u.p);
    }
  }
  return presence;
}

function countIfNear(presence: Int32Array, def: { x: number; y: number; radius: number }, k: number, n: number, x: number, y: number, p: number): void {
  const reach = def.radius + PRESENCE_REACH;
  const dx = x - def.x;
  const dy = y - def.y;
  if (dx * dx + dy * dy <= reach * reach) presence[k * n + p]!++;
}

/** The front a platoon fights on: the nearest of its player's fronts in its direction, else the nearest at all. */
function frontFor(world: World, ring: Ring, p: number, pl: Platoon): Front | null {
  const sites = world.map.sites;
  let best: Front | null = null;
  let bestD = Infinity;
  let bestMatch = false;
  for (const f of ring.fronts[p] ?? []) {
    const at = sites[f.from >= 0 ? f.from : f.to]!;
    const dx = at.x - pl.x;
    const dy = at.y - pl.y;
    const d = dx * dx + dy * dy;
    const match = f.dir === pl.front;
    if ((match && !bestMatch) || (match === bestMatch && d < bestD)) {
      best = f;
      bestD = d;
      bestMatch = match;
    }
  }
  return best;
}

/**
 * Which front a new platoon of player `p` marches to: the one under the most pressure for the strength already sent there, so musters alternate between two quiet
 * fronts and lean toward the one the foe is pressing.
 */
export function musterFront(world: World, s: Scratch, p: number, presence: Int32Array): Front | null {
  const ring = s.ring;
  const fronts = ring.fronts[p] ?? [];
  if (fronts.length === 0) return null;
  const n = world.players.length;
  let best: Front | null = null;
  let bestScore = -Infinity;
  for (const f of fronts) {
    let foes = 0;
    const count = (k: number) => {
      for (let q = 0; q < n; q++) if (q !== p && hostile(ring, p, q)) foes += presence[k * n + q]!;
    };
    if (f.from >= 0) count(f.from);
    for (const k of f.forts) count(k);
    let mine = 0;
    for (const pl of world.platoons) if (pl.p === p && pl.state !== PlatoonState.Queued && pl.front === f.dir) mine += pl.alive;
    const score = (1 + foes / 10) / (1 + mine / 24);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/**
 * The war council of player `p`: hands every marching or holding platoon an objective on its
 * front. Each site of the platoon's front (its forts, the foe's capital at the far end, its own capital at
 * this end) and every capital it holds is scored by renown, distance (supply lines), nearby
 * strength; platoons already sent somewhere make that site less attractive to the
 * next. A rising's platoons march on its lost home.
 */
export function runCouncil(world: World, s: Scratch, p: number, presence: Int32Array): void {
  const player = world.players[p]!;
  const ring = s.ring;
  const { sites: defs, slots } = world.map;
  const n = world.players.length;
  const assigned = new Int32Array(defs.length);
  const held = ring.capitals[p] ?? [];
  const candidates: number[] = [];
  for (const pl of world.platoons) {
    if (pl.p !== p || pl.state === PlatoonState.Queued || pl.state === PlatoonState.Rout) continue;
    pl.rising = held.length === 0;
    const f = frontFor(world, ring, p, pl);
    candidates.length = 0;
    let massed = 0;
    if (f) {
      pl.front = f.dir;
      for (const k of f.forts) {
        candidates.push(k);
        massed += presence[k * n + p]!;
      }
      candidates.push(f.to);
      massed += presence[f.to * n + p]!;
      if (f.from >= 0) candidates.push(f.from);
      else {
        // A rising gathers at the forts either side of its lost home before it storms the walls.
        for (const k of [slots + f.to, slots + ((f.to - 1 + slots) % slots)]) {
          candidates.push(k);
          massed += presence[k * n + p]!;
        }
      }
    }
    for (const c of held) {
      if (!candidates.includes(c)) candidates.push(c);
      // A fort between two of its own capitals is its to keep.
      const next = (c + 1) % slots;
      const fort = slots + c;
      if (ring.owner[next] === p && world.sites[fort]!.owner !== p && !candidates.includes(fort)) candidates.push(fort);
    }
    if (candidates.length === 0) {
      pl.site = player.slot;
      continue;
    }
    let best = -1;
    let bestScore = 0;
    for (const k of candidates) {
      const score = siteScore(world, ring, p, k, pl.x, pl.y, pl.alive, massed, presence, n) / (1 + assigned[k]! * CROWD_PENALTY);
      if (best < 0 || score > bestScore || (score === bestScore && k < best)) {
        bestScore = score;
        best = k;
      }
    }
    // Nothing worth marching on: hold the nearest capital it holds (or keep marching home).
    if (bestScore <= 0) best = nearestHeld(world, held, pl) ?? pl.home;
    // Stick with the current objective unless the new one is clearly better.
    if (pl.site >= 0 && pl.site !== best && candidates.includes(pl.site)) {
      const current = siteScore(world, ring, p, pl.site, pl.x, pl.y, pl.alive, massed, presence, n) / (1 + assigned[pl.site]! * CROWD_PENALTY);
      if (current * 1.25 >= bestScore && current > 0) best = pl.site;
    }
    pl.site = best;
    assigned[best]!++;
  }
}

function nearestHeld(world: World, held: readonly number[], pl: Platoon): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const c of held) {
    const def = world.map.sites[c]!;
    const dx = def.x - pl.x;
    const dy = def.y - pl.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * How much player `p`'s platoon at (x, y), `strength` strong, wants site `k`. `massed` counts p's
 * soldiers already gathered on the platoon's front (at its forts and the foe's walls): walls are
 * stormed only once enough have gathered, so an army masses at the border fort and then goes in
 * together rather than feeding the tower one platoon at a time.
 */
function siteScore(world: World, ring: Ring, p: number, k: number, x: number, y: number, strength: number, massed: number, presence: Int32Array, n: number): number {
  const player = world.players[p]!;
  const def = world.map.sites[k]!;
  const state = world.sites[k]!;
  let mine = 0;
  let enemy = 0;
  for (let q = 0; q < n; q++) {
    const c = presence[k * n + q]!;
    if (q === p) mine += c;
    else if (hostile(ring, p, q)) enemy += c;
  }
  let value = 0;
  if (def.kind === 'capital') {
    const owner = ring.owner[def.slot]!;
    if (owner === p) {
      // Walls under siege call every platoon on the front home: a capital lost is a front lost.
      value = enemy > 0 ? 9 + enemy * 0.1 : 0;
    } else {
      if (owner === NEUTRAL || !hostile(ring, p, owner)) return 0;
      const walls = world.structures.find((st) => st.site === k);
      if (!walls || !breachable(world, walls) || !besieging(world, ring, p, def.slot)) return 0;
      value = 1;
      // A rising has one aim: its lost home.
      if (player.rising && def.slot === player.slot) value = Math.max(value, 5);
      // Too few gathered yet: hold the approach (a held fort is worth 0.4) and mass there.
      if (strength + massed < siegeNeed(walls)) value = Math.min(value * 0.1, 0.3);
    }
  } else {
    if (state.owner === p) value = enemy > 0 ? 4 : 0.4;
    else value = state.owner === NEUTRAL ? 4 : 3.5;
  }
  if (value <= 0) return 0;
  if (enemy > (strength + mine) * OUTMATCHED) value *= 0.35;
  const dx = def.x - x;
  const dy = def.y - y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return value / (1 + dist / DISTANCE_SCALE);
}

/** The player holding the capital of seat `slot`, or NEUTRAL if no one has claimed it. */
export function capitalOwner(world: World, slot: number): number {
  for (const st of world.structures) if (world.map.sites[st.site]?.slot === slot && world.map.sites[st.site]!.kind === 'capital') return st.p;
  return NEUTRAL;
}

/**
 * Whether player `p` holds the approach to the capital of seat `slot`: the border fort beside it on
 * one of p's fronts (for a rising, either fort beside its lost home). Walls can be stormed only from
 * a held approach, so every siege begins with a field battle for the fort.
 */
export function besieging(world: World, ring: Ring, p: number, slot: number): boolean {
  const { slots } = world.map;
  for (const f of ring.fronts[p] ?? []) {
    if (f.to !== slot) continue;
    if (f.forts.length === 0) {
      if (world.sites[slots + slot]!.owner === p || world.sites[slots + ((slot - 1 + slots) % slots)]!.owner === p) return true;
    } else if (world.sites[f.forts[f.forts.length - 1]!]!.owner === p) return true;
  }
  return false;
}

/**
 * Whether a capital's walls can be stormed now. None can before the sieges open; a founder's gates
 * stay barred until it has had a grace since its first push to raise a levy, or until the barred
 * gates open for all, so an early riser cannot take the ring while its neighbours sleep. All of it
 * is paced by the war's length (`pacing`).
 */
export function breachable(world: World, st: Structure): boolean {
  return world.tick >= gatesOpenAt(world, st);
}

/**
 * The tick from which a capital's walls can be stormed: when the sieges open, or later while a
 * founder's gates stay barred (until a grace after its first push, or the hour all gates open; a
 * founder that has not pushed yet keeps them barred until that hour).
 */
export function gatesOpenAt(world: World, st: Structure): number {
  const pc = pacing(world.params.ticks);
  if (st.taken > 0) return pc.opens;
  const owner = world.players[st.p];
  if (!owner) return pc.opens;
  const grace = owner.firstPushAt >= 0 ? owner.firstPushAt + pc.grace : Infinity;
  return Math.max(pc.opens, Math.min(pc.barredUntil, grace));
}

/** Whether player `p` may storm structure `k` now: a foe's capital, standing, breachable, its approach won. */
export function stormable(world: World, ring: Ring, k: number, p: number): boolean {
  const st = world.structures[k]!;
  return st.p !== p && st.hp > 0 && hostile(ring, p, st.p) && breachable(world, st) && besieging(world, ring, p, world.map.sites[st.site]!.slot);
}
