import { Kind, Terrain, type PlayerState, type Unit, type World } from './api.ts';
import { cellAt } from './flowfield.ts';
import { VETERAN_BONUS } from './muster.ts';
import { AURA_BLESS, AURA_HEAL, AURA_SHIELD, AURA_VALOR, type Scratch } from './scratch.ts';
import { bucketX, bucketY, type SpatialHash } from './spatial.ts';
import {
  BALLISTA_CLOSE,
  BALLISTA_CLOSE_FACTOR,
  CHAMPION_AURA,
  CHAMPION_BONUS,
  CLERIC_AURA,
  FOREST_ARROW_FACTOR,
  HERALD_AURA,
  HOME_TURF,
  HOME_TURF_REDUCTION,
  SAPPER_STRUCTURE,
  TREBUCHET_STRUCTURE,
  STATS,
  WARDEN_AURA,
  WARDEN_REDUCTION,
  matchup,
} from './stats.ts';

/** Counts soldiers of player `p`'s foes (bit q of `foes`) within `radius` of a point. */
export function enemiesNear(units: readonly Unit[], hash: SpatialHash, foes: number, x: number, y: number, radius: number): number {
  const reach = Math.floor(radius / hash.cell) + 1;
  const bx = bucketX(hash, x);
  const by = bucketY(hash, y);
  const r2 = radius * radius;
  let n = 0;
  for (let cy = Math.max(0, by - reach); cy <= Math.min(hash.rows - 1, by + reach); cy++) {
    for (let cx = Math.max(0, bx - reach); cx <= Math.min(hash.cols - 1, bx + reach); cx++) {
      for (let j = hash.head[cy * hash.cols + cx]!; j >= 0; j = hash.next[j]!) {
        const v = units[j]!;
        if (v.p < 0 || ((foes >>> v.p) & 1) === 0) continue;
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
  } else if (k === Kind.Cleric) {
    AURA_BIT[k] = AURA_BLESS;
    AURA_RADIUS[k] = CLERIC_AURA;
  }
}

/** Marks every soldier standing in a friendly Warden's, Herald's, Champion's or Cleric's aura. */
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
  let m = powerOf(player);
  const kind = world.units[i]!.kind;
  if ((s.aura[i]! & AURA_VALOR) !== 0 && kind !== Kind.Champion && kind !== Kind.Dragon) m *= 1 + CHAMPION_BONUS;
  return m;
}

/** Damage taken by unit `j` from a blow of `raw` damage. */
/** Army quality and veterancy as one multiplier on HP and damage. */
export function powerOf(player: PlayerState): number {
  return player.quality * (1 + VETERAN_BONUS * player.veterancy);
}

/**
 * Damage soldier `j` takes from a blow of `raw` force: divided by its army's power, less 30% in a
 * Warden's or Paladin's shield aura, half for a missile in forest, less 20% on its holder's home turf.
 *
 * `pierce` (a Ballista's bolt) is armour-piercing: it ignores the shield aura. Armour in this war is
 * the tower shield's aura and the half damage arrows do to Wardens and Paladins (`matchup`, which
 * the Ballista's own matchup never halves); power (the army's quality and veterancy), forest cover
 * and home turf are not armour, and still count.
 */
export function mitigated(world: World, s: Scratch, j: number, raw: number, ranged: boolean, pierce = false): number {
  const v = world.units[j]!;
  // A stronger army's soldiers shrug off more: dividing damage by power scales their effective HP.
  let d = v.p >= 0 ? raw / powerOf(world.players[v.p]!) : raw;
  if (!pierce && (s.aura[j]! & AURA_SHIELD) !== 0) d *= 1 - WARDEN_REDUCTION;
  if (ranged) {
    const cell = cellAt(world.map, v.x, v.y);
    if (cell >= 0 && world.map.terrain[cell] === Terrain.Forest) d *= FOREST_ARROW_FACTOR;
  }
  if (v.p >= 0 && onHomeTurf(world, s, v.p, v.x, v.y)) d *= 1 - HOME_TURF_REDUCTION;
  return d;
}

/** Within HOME_TURF of any capital player `p` holds. */
export function onHomeTurf(world: World, s: Scratch, p: number, x: number, y: number): boolean {
  const held = s.ring.capitals[p];
  if (!held) return false;
  for (let k = 0; k < held.length; k++) {
    const capital = world.map.sites[held[k]!]!;
    const dx = x - capital.x;
    const dy = y - capital.y;
    if (dx * dx + dy * dy <= HOME_TURF * HOME_TURF) return true;
  }
  return false;
}

/**
 * A Ballista bolt's damage to soldier `j`, landing at `dist` from where it was loosed: `raw` force
 * times the Ballista's bonus against the soldier, armour-piercing, and a fraction against a foe too
 * close to lay the bolt on.
 */
export function boltDamage(world: World, s: Scratch, j: number, raw: number, dist: number): number {
  const v = world.units[j]!;
  const close = dist < BALLISTA_CLOSE ? BALLISTA_CLOSE_FACTOR : 1;
  return mitigated(world, s, j, raw * matchup(Kind.Ballista, v.kind) * close, true, true);
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
  return d;
}
