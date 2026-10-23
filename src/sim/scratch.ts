import { Kind, type World } from './api.ts';
import { createSpatialHash, rebuildSpatialHash, type SpatialHash } from './spatial.ts';
import { MAX_ALIVE, STATS } from './stats.ts';

export const AURA_SHIELD = 1;
export const AURA_HEAL = 2;
export const AURA_VALOR = 4;

/** Per-tick working memory. Rebuilt from World every tick, never serialized. */
export interface Scratch {
  hash: SpatialHash;
  unitIndex: Map<number, number>;
  platoonIndex: Map<number, number>;
  /** Per unit: index of its platoon in world.platoons. */
  unitPlatoon: Int32Array;
  nx: Float64Array;
  ny: Float64Array;
  damage: Float64Array;
  heal: Float64Array;
  lastHit: Int32Array;
  /** Kind of the soldier that struck last, or -1. */
  lastKind: Int32Array;
  aura: Uint8Array;
  engaged: Uint8Array;
  /** Per player: platoon slots alive (big soldiers count for more). */
  alive: Int32Array;
  /** Per platoon: centroid sums, members, heralds, champions. */
  px: Float64Array;
  py: Float64Array;
  members: Int32Array;
  heralds: Int32Array;
  champions: Int32Array;
  slowest: Float64Array;
  /** Platoons that rallied at their capital this tick. */
  rallied: number[];
}

const cache = new WeakMap<World, Scratch>();

export function scratchFor(world: World): Scratch {
  let s = cache.get(world);
  if (!s) {
    const cap = MAX_ALIVE + 64;
    s = {
      hash: createSpatialHash(world.map, cap),
      unitIndex: new Map(),
      platoonIndex: new Map(),
      unitPlatoon: new Int32Array(cap),
      nx: new Float64Array(cap),
      ny: new Float64Array(cap),
      damage: new Float64Array(cap),
      heal: new Float64Array(cap),
      lastHit: new Int32Array(cap),
      lastKind: new Int32Array(cap),
      aura: new Uint8Array(cap),
      engaged: new Uint8Array(cap),
      alive: new Int32Array(64),
      px: new Float64Array(256),
      py: new Float64Array(256),
      members: new Int32Array(256),
      heralds: new Int32Array(256),
      champions: new Int32Array(256),
      slowest: new Float64Array(256),
      rallied: [],
    };
    cache.set(world, s);
  }
  return s;
}

function ensurePlatoonCapacity(s: Scratch, n: number): void {
  if (s.px.length >= n) return;
  const size = Math.max(n, s.px.length * 2);
  s.px = new Float64Array(size);
  s.py = new Float64Array(size);
  s.members = new Int32Array(size);
  s.heralds = new Int32Array(size);
  s.champions = new Int32Array(size);
  s.slowest = new Float64Array(size);
}

export function indexWorld(world: World, s: Scratch, speedOf: (kind: number) => number): void {
  const { units, platoons, players } = world;
  s.platoonIndex.clear();
  ensurePlatoonCapacity(s, platoons.length);
  for (let i = 0; i < platoons.length; i++) {
    s.platoonIndex.set(platoons[i]!.id, i);
    s.px[i] = 0;
    s.py[i] = 0;
    s.members[i] = 0;
    s.heralds[i] = 0;
    s.champions[i] = 0;
    s.slowest[i] = Infinity;
  }
  if (s.alive.length < players.length) s.alive = new Int32Array(players.length * 2);
  s.alive.fill(0);
  s.unitIndex.clear();
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    s.unitIndex.set(u.id, i);
    const pl = s.platoonIndex.get(u.platoon) ?? -1;
    s.unitPlatoon[i] = pl;
    if (u.p >= 0) s.alive[u.p]! += STATS[u.kind]!.slots;
    if (pl < 0) continue;
    s.px[pl]! += u.x;
    s.py[pl]! += u.y;
    s.members[pl]!++;
    if (u.kind === Kind.Herald) s.heralds[pl]!++;
    if (u.kind === Kind.Champion || u.kind === Kind.Dragon) s.champions[pl]!++;
    const sp = speedOf(u.kind);
    if (sp < s.slowest[pl]!) s.slowest[pl] = sp;
  }
  rebuildSpatialHash(s.hash, units);
}
