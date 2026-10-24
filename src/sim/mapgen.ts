import { Terrain, type MapDef, type SiteDef, type WarParams } from './api.ts';
import { dcos, dsin, PI, TAU } from './dmath.ts';
import { buildFlowField, cellAt, isPassable } from './flowfield.ts';

export const NAV_CELL = 16;
export const MIN_SLOTS = 3;
export const MAX_SLOTS = 16;
/** Length of the front road between two neighbouring capitals, along the ring. */
const RING_SPACING = 700;
const MIN_RING = 440;
/** The band the war is fought in: from the centre's shore to the ring road, and from it to the map's rim. */
const INNER = 160;
const OUTER = 230;
/** Half the width of the front road kept clear around the ring. */
const ROAD = 22;
const MAX_ATTEMPTS = 12;

/** Radius of the ring the capitals and front roads lie on. */
export function ringRadius(slots: number): number {
  return Math.max(MIN_RING, (slots * RING_SPACING) / TAU);
}

export function mapRadius(slots: number): number {
  return ringRadius(slots) + OUTER;
}

/** Seats for a war of `members` players and bots: one spare for a late joiner, at least three. */
export function slotsFor(members: number): number {
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, members + 1));
}

/**
 * The order seats are handed out in for a war: a seeded shuffle of the slots, so who neighbours
 * whom around the ring changes every day. Pure: the server and any replay agree.
 */
export function seatOrder(seed: number, slots: number): number[] {
  const order = Array.from({ length: slots }, (_, s) => s);
  let h = mixSeed(seed, 0x5eed);
  for (let i = slots - 1; i > 0; i--) {
    h = mixSeed(h, i);
    const j = h % (i + 1);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  return order;
}

/**
 * The map for these params, shared with recent worlds built from the same params. A map is
 * never modified once made, so a restored world (a resync, a replay keyframe, a recovered war)
 * may share it, and with it every cache derived from it (flow fields, hex roads), which would
 * otherwise be rebuilt for each restore.
 */
const recentMaps: { key: string; map: MapDef }[] = [];
const RECENT_MAPS = 4;

export function sharedMap(params: WarParams): MapDef {
  const key = `${params.seed}:${params.slots}:${params.members}`;
  const i = recentMaps.findIndex((m) => m.key === key);
  if (i >= 0) {
    const hit = recentMaps[i]!;
    if (i > 0) {
      recentMaps.splice(i, 1);
      recentMaps.unshift(hit);
    }
    return hit.map;
  }
  const map = generateMap(params);
  recentMaps.unshift({ key, map });
  if (recentMaps.length > RECENT_MAPS) recentMaps.length = RECENT_MAPS;
  return map;
}

/**
 * A ring conquest map: one capital per slot evenly spaced on a ring, an impassable centre (a great
 * lake or a mountain massif) so no army cuts across, and a front road around the ring with a border
 * fort midway between each pair of neighbouring capitals. Forests, rocks and pools are painted in
 * the band from the centre's shore to the rim, the same in every sector.
 */
export function generateMap(params: WarParams): MapDef {
  const slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Math.floor(params.slots)));
  const ring = ringRadius(slots);
  const radius = ring + OUTER;
  const centre = ring - INNER;
  const sites = placeSites(slots, ring);
  const navCols = Math.ceil((radius * 2) / NAV_CELL) + 2;
  const base: Omit<MapDef, 'terrain'> = {
    radius,
    ring,
    centre,
    centreKind: mixSeed(params.seed, 0x1a4e) % 3 === 0 ? Terrain.Rock : Terrain.Water,
    slots,
    navCell: NAV_CELL,
    navCols,
    navRows: navCols,
    originX: -(navCols * NAV_CELL) / 2,
    originY: -(navCols * NAV_CELL) / 2,
    sites,
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = { ...base, terrain: paintTerrain(base, mixSeed(params.seed, attempt), true) };
    if (allSitesReachable(map)) return map;
  }
  return { ...base, terrain: paintTerrain(base, params.seed, false) };
}

/** Angle of slot `s`; slot 0 sits at the top of the map, and slots climb clockwise. */
export function slotAngle(slot: number, slots: number): number {
  return -PI / 2 + (slot * TAU) / slots;
}

/** The fort on the front road between capital `slot` and capital `slot + 1` (wrapping). */
export function fortBetween(slots: number, slot: number): number {
  return slots + (((slot % slots) + slots) % slots);
}

function placeSites(slots: number, ring: number): SiteDef[] {
  const sites: SiteDef[] = [];
  for (let s = 0; s < slots; s++) {
    const a = slotAngle(s, slots);
    sites.push({ id: sites.length, kind: 'capital', x: dcos(a) * ring, y: dsin(a) * ring, radius: 70, slot: s, renown: 0 });
  }
  for (let s = 0; s < slots; s++) {
    const a = slotAngle(s + 0.5, slots);
    sites.push({ id: sites.length, kind: 'fort', x: dcos(a) * ring, y: dsin(a) * ring, radius: 55, slot: -1, renown: 2 });
  }
  return sites;
}

function paintTerrain(map: Omit<MapDef, 'terrain'>, seed: number, obstacles: boolean): Uint8Array {
  const { navCols: cols, navRows: rows, navCell, originX, originY, radius, ring, centre, centreKind, sites, slots } = map;
  const terrain = new Uint8Array(cols * rows);
  // Rotations that carry each sector back onto sector 0, so all slots share one terrain.
  const rot: { c: number; s: number }[] = [];
  for (let k = 0; k < slots; k++) rot.push({ c: dcos((-k * TAU) / slots), s: dsin((-k * TAU) / slots) });
  const edge0 = { x: dcos(slotAngle(-0.5, slots)), y: dsin(slotAngle(-0.5, slots)) };
  const edge1 = { x: dcos(slotAngle(0.5, slots)), y: dsin(slotAngle(0.5, slots)) };
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = originX + (cx + 0.5) * navCell;
      const y = originY + (cy + 0.5) * navCell;
      const i = cy * cols + cx;
      const r = Math.sqrt(x * x + y * y);
      if (r > radius) {
        terrain[i] = Terrain.Void;
        continue;
      }
      let sx = x;
      let sy = y;
      for (const { c, s } of rot) {
        const rx = x * c - y * s;
        const ry = x * s + y * c;
        if (edge0.x * ry - edge0.y * rx >= 0 && rx * edge1.y - ry * edge1.x > 0) {
          sx = rx;
          sy = ry;
          break;
        }
      }
      // The centre: a lake or a massif with a ragged shore, never reaching the front road.
      const shore = centre + (fbm(seed + 31337, sx / 90, sy / 90) - 0.5) * 50;
      if (r < shore) {
        terrain[i] = centreKind;
        continue;
      }
      const dr = r - ring;
      if ((dr < 0 ? -dr : dr) < ROAD || nearSite(sites, x, y)) continue;
      const fade = 1 - Math.max(0, (r - radius * 0.93) / (radius * 0.07));
      const blocker = fbm(seed, sx / 140, sy / 140) * fade;
      const wood = fbm(seed + 7919, sx / 100, sy / 100);
      if (obstacles && blocker > 0.64) {
        terrain[i] = fbm(seed + 104729, sx / 240, sy / 240) > 0.5 ? Terrain.Water : Terrain.Rock;
      } else if (wood > 0.6 || (r < shore + 40 && wood > 0.5)) {
        terrain[i] = Terrain.Forest;
      }
    }
  }
  return terrain;
}

function nearSite(sites: readonly SiteDef[], x: number, y: number): boolean {
  for (const o of sites) {
    const clear = o.radius + 50;
    const dx = x - o.x;
    const dy = y - o.y;
    if (dx * dx + dy * dy < clear * clear) return true;
  }
  return false;
}

function allSitesReachable(map: MapDef): boolean {
  const home = map.sites[0]!;
  const field = buildFlowField(map, cellAt(map, home.x, home.y));
  for (const o of map.sites) {
    const c = cellAt(map, o.x, o.y);
    if (c < 0 || !isPassable(map.terrain[c]!) || field.cost[c] === -1) return false;
  }
  return true;
}

function mixSeed(seed: number, attempt: number): number {
  let h = Math.imul((seed | 0) + Math.imul(attempt, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  return Math.imul(h, 0x85ebca77) >>> 0;
}

function lattice(seed: number, ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = lattice(seed, ix, iy);
  const b = lattice(seed, ix + 1, iy);
  const c = lattice(seed, ix, iy + 1);
  const d = lattice(seed, ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(seed: number, x: number, y: number): number {
  return valueNoise(seed, x, y) * 0.57 + valueNoise(seed + 1, x * 2.03, y * 2.03) * 0.29 + valueNoise(seed + 2, x * 4.1, y * 4.1) * 0.14;
}
