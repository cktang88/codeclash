import { Doctrine, Kind, Terrain, type PlayerState, type Unit, type World } from './api.ts';
import { cellAt } from './flowfield.ts';
import { VETERAN_BONUS } from './muster.ts';
import { AURA_HEAL, AURA_SHIELD, AURA_VALOR, type Scratch } from './scratch.ts';
import { bucketX, bucketY, type SpatialHash } from './spatial.ts';
import {
  CHAMPION_AURA,
  CHAMPION_BONUS,
  CRY_DAMAGE,
  FOREST_ARROW_FACTOR,
  HERALD_AURA,
  HOLD_RADIUS,
  HOLD_REDUCTION,
  HOME_TURF,
  HOME_TURF_REDUCTION,
  SAPPER_STRUCTURE,
  TREBUCHET_STRUCTURE,
  STATS,
  WARDEN_AURA,
  WARDEN_REDUCTION,
  doctrineDamage,
  doctrineStructure,
  matchup,
} from './stats.ts';

const FAVORED_PULL = 0.65;

/** Nearest enemy within `radius`, favoring soldiers this kind beats. Index or -1. */
export function findTarget(units: readonly Unit[], hash: SpatialHash, i: number, radius: number): number {
  const u = units[i]!;
  const bx = bucketX(hash, u.x);
  const by = bucketY(hash, u.y);
  const rings = Math.floor(radius / hash.cell) + 1;
  const r2 = radius * radius;
  let best = -1;
  let bestScore = Infinity;
  for (let k = 0; k <= rings; k++) {
    if (best >= 0) {
      const floor = (k - 1) * hash.cell * FAVORED_PULL;
      if (floor > 0 && floor * floor >= bestScore) break;
    }
    const y0 = by - k;
    const y1 = by + k;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= hash.rows) continue;
      const step = y === y0 || y === y1 ? 1 : 2 * k;
      for (let x = bx - k; x <= bx + k; x += step === 0 ? 1 : step) {
        if (x < 0 || x >= hash.cols) continue;
        for (let j = hash.head[y * hash.cols + x]!; j >= 0; j = hash.next[j]!) {
          const v = units[j]!;
          if (v.p === u.p) continue;
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const score = matchup(u.kind, v.kind) > 1 ? d2 * FAVORED_PULL * FAVORED_PULL : d2;
          if (score < bestScore || (score === bestScore && j < best)) {
            bestScore = score;
            best = j;
          }
        }
      }
    }
  }
  return best;
}

/** Counts enemies of player `p` within `radius` of a point. */
export function enemiesNear(units: readonly Unit[], hash: SpatialHash, p: number, x: number, y: number, radius: number): number {
  const reach = Math.floor(radius / hash.cell) + 1;
  const bx = bucketX(hash, x);
  const by = bucketY(hash, y);
  const r2 = radius * radius;
  let n = 0;
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = units[j]!;
        if (v.p === p) continue;
        const dx = v.x - x;
        const dy = v.y - y;
        if (dx * dx + dy * dy <= r2) n++;
      }
    }
  }
  return n;
}

/** Aura per kind: [bit, radius], or none. */
const AURA_BIT = new Int32Array(STATS.length);
const AURA_RADIUS = new Float64Array(STATS.length);
for (let k = 0; k < STATS.length; k++) {
  if (k === Kind.Warden || k === Kind.Paladin) {
    AURA_BIT[k] = AURA_SHIELD;
    AURA_RADIUS[k] = WARDEN_AURA;
  } else if (k === Kind.Herald) {
    AURA_BIT[k] = AURA_HEAL;
    AURA_RADIUS[k] = HERALD_AURA;
  } else if (k === Kind.Champion || k === Kind.Dragon) {
    AURA_BIT[k] = AURA_VALOR;
    AURA_RADIUS[k] = CHAMPION_AURA;
  }
}

/** Marks every soldier standing in a friendly Warden's, Herald's or Champion's aura. */
export function computeAuras(world: World, s: Scratch): void {
  const { units } = world;
  const hash = s.hash;
  const { ux, uy, up, uk, head, next, cols, rows } = hash;
  const aura = s.aura;
  aura.fill(0, 0, units.length);
  for (let i = 0; i < units.length; i++) {
    const kind = uk[i]!;
    const bit = AURA_BIT[kind]!;
    if (bit === 0) continue;
    const radius = AURA_RADIUS[kind]!;
    const x0 = ux[i]!;
    const y0 = uy[i]!;
    const p = up[i]!;
    const reach = Math.floor(radius / hash.cell) + 1;
    const bx = bucketX(hash, x0);
    const by = bucketY(hash, y0);
    const r2 = radius * radius;
    // Only the cells the aura's bounding box (grown by 1 for rounding) touches can hold a soldier
    // within it; bucketing is monotonic, so this skips no one the full square would have found.
    const xa = Math.max(0, bx - reach, bucketX(hash, x0 - radius - 1));
    const xb = Math.min(cols - 1, bx + reach, bucketX(hash, x0 + radius + 1));
    const ya = Math.max(0, by - reach, bucketY(hash, y0 - radius - 1));
    const yb = Math.min(rows - 1, by + reach, bucketY(hash, y0 + radius + 1));
    for (let cy = ya; cy <= yb; cy++) {
      for (let cx = xa; cx <= xb; cx++) {
        for (let j = head[cy * cols + cx]!; j >= 0; j = next[j]!) {
          if (up[j] !== p) continue;
          const dx = ux[j]! - x0;
          const dy = uy[j]! - y0;
          if (dx * dx + dy * dy <= r2) aura[j]! |= bit;
        }
      }
    }
  }
}

export function attackerMultiplier(world: World, s: Scratch, i: number, player: PlayerState | undefined): number {
  if (!player) return 1;
  let m = doctrineDamage(player.doctrine) * powerOf(player);
  if (player.cryUntil > world.tick) m *= CRY_DAMAGE;
  const kind = world.units[i]!.kind;
  if ((s.aura[i]! & AURA_VALOR) !== 0 && kind !== Kind.Champion && kind !== Kind.Dragon) m *= 1 + CHAMPION_BONUS;
  return m;
}

/** Damage taken by unit `j` from a blow of `raw` damage. */
/** Army quality and veterancy as one multiplier on HP and damage. */
export function powerOf(player: PlayerState): number {
  return player.quality * (1 + VETERAN_BONUS * player.veterancy);
}

export function mitigated(world: World, s: Scratch, j: number, raw: number, ranged: boolean): number {
  const v = world.units[j]!;
  // A stronger army's soldiers shrug off more: dividing damage by power scales their effective HP.
  let d = v.p >= 0 ? raw / powerOf(world.players[v.p]!) : raw;
  if ((s.aura[j]! & AURA_SHIELD) !== 0) d *= 1 - WARDEN_REDUCTION;
  if (ranged) {
    const cell = cellAt(world.map, v.x, v.y);
    if (cell >= 0 && world.map.terrain[cell] === Terrain.Forest) d *= FOREST_ARROW_FACTOR;
  }
  if (v.p >= 0) {
    const owner = world.players[v.p]!;
    const capital = world.map.sites[owner.slot]!;
    const dx = v.x - capital.x;
    const dy = v.y - capital.y;
    if (dx * dx + dy * dy <= HOME_TURF * HOME_TURF) d *= 1 - HOME_TURF_REDUCTION;
    else if (owner.doctrine === Doctrine.Hold && nearOwnShrine(world, v.p, v.x, v.y)) d *= 1 - HOLD_REDUCTION;
  }
  return d;
}

function nearOwnShrine(world: World, p: number, x: number, y: number): boolean {
  const { sites } = world;
  for (let k = 0; k < sites.length; k++) {
    if (sites[k]!.owner !== p) continue;
    const def = world.map.sites[k]!;
    const dx = x - def.x;
    const dy = y - def.y;
    if (dx * dx + dy * dy <= HOLD_RADIUS * HOLD_RADIUS) return true;
  }
  return false;
}

export function unitDamage(world: World, s: Scratch, i: number, j: number): number {
  const u = world.units[i]!;
  const v = world.units[j]!;
  const player = u.p >= 0 ? world.players[u.p] : undefined;
  const raw = STATS[u.kind]!.damage * matchup(u.kind, v.kind) * attackerMultiplier(world, s, i, player);
  return mitigated(world, s, j, raw, STATS[u.kind]!.ranged);
}

export function structureDamage(world: World, s: Scratch, i: number): number {
  const u = world.units[i]!;
  const player = u.p >= 0 ? world.players[u.p] : undefined;
  let d = STATS[u.kind]!.damage * attackerMultiplier(world, s, i, player);
  if (u.kind === Kind.Sapper) d *= SAPPER_STRUCTURE;
  else if (u.kind === Kind.Trebuchet) d *= TREBUCHET_STRUCTURE;
  if (player) d *= doctrineStructure(player.doctrine);
  return d;
}
