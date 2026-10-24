import { Terrain, type MapDef, type SiteDef, type WarParams } from './api.ts';
import { dcos, dsin, PI, TAU } from './dmath.ts';
import { buildFlowField, cellAt, isPassable } from './flowfield.ts';

export const NAV_CELL = 16;
export const MIN_SLOTS = 4;
export const MAX_SLOTS = 16;
const CAPITAL_RING = 0.84;
const SHRINE_RING = 0.46;
const MAX_ATTEMPTS = 12;

export function mapRadius(slots: number): number {
  return 420 + 90 * slots;
}

export function slotsFor(members: number): number {
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, members + 2));
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

export function generateMap(params: WarParams): MapDef {
  const slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Math.floor(params.slots)));
  const radius = mapRadius(slots);
  const sites = placeSites(slots, radius);
  const navCols = Math.ceil((radius * 2) / NAV_CELL) + 2;
  const base: Omit<MapDef, 'terrain'> = {
    radius,
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

/** Angle of slot `s`; slot 0 sits at the top of the map. */
export function slotAngle(slot: number, slots: number): number {
  return -PI / 2 + (slot * TAU) / slots;
}

function placeSites(slots: number, radius: number): SiteDef[] {
  const sites: SiteDef[] = [];
  for (let s = 0; s < slots; s++) {
    const a = slotAngle(s, slots);
    sites.push({ id: sites.length, kind: 'capital', x: dcos(a) * radius * CAPITAL_RING, y: dsin(a) * radius * CAPITAL_RING, radius: 70, slot: s, renown: 0 });
  }
  for (let s = 0; s < slots; s++) {
    const a = slotAngle(s + 0.5, slots);
    sites.push({ id: sites.length, kind: 'shrine', x: dcos(a) * radius * SHRINE_RING, y: dsin(a) * radius * SHRINE_RING, radius: 55, slot: -1, renown: 2 });
  }
  sites.push({ id: sites.length, kind: 'heart', x: 0, y: 0, radius: 85, slot: -1, renown: 5 });
  return sites;
}

function paintTerrain(map: Omit<MapDef, 'terrain'>, seed: number, obstacles: boolean): Uint8Array {
  const { navCols: cols, navRows: rows, navCell, originX, originY, radius, sites, slots } = map;
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
      if (nearSite(sites, x, y) || nearLane(sites, slots, x, y)) continue;
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
      const fade = 1 - Math.max(0, (r - radius * 0.93) / (radius * 0.07));
      const blocker = fbm(seed, sx / 140, sy / 140) * fade;
      const wood = fbm(seed + 7919, sx / 100, sy / 100);
      if (obstacles && blocker > 0.64) {
        terrain[i] = fbm(seed + 104729, sx / 240, sy / 240) > 0.5 ? Terrain.Water : Terrain.Rock;
      } else if (wood > 0.6) {
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

// Keep a clear road from each capital toward the Heart so armies always meet in the middle.
function nearLane(sites: readonly SiteDef[], slots: number, x: number, y: number): boolean {
  for (let s = 0; s < slots; s++) {
    const c = sites[s]!;
    const len2 = c.x * c.x + c.y * c.y;
    const t = Math.max(0, Math.min(1, (x * c.x + y * c.y) / len2));
    const dx = x - c.x * t;
    const dy = y - c.y * t;
    if (dx * dx + dy * dy < 22 * 22) return true;
  }
  return false;
}

function allSitesReachable(map: MapDef): boolean {
  const field = buildFlowField(map, cellAt(map, 0, 0));
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
