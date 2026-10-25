import { Kind, type World } from './api.ts';
import { computeRing, type Ring } from './ring.ts';
import { createSpatialHash, rebuildSpatialHash, type SpatialHash } from './spatial.ts';
import { MAX_ALIVE, STATS, isSiege } from './stats.ts';

export const AURA_SHIELD = 1;
export const AURA_HEAL = 2;
export const AURA_VALOR = 4;
/** Within a friendly Cleric's blessing: a fall here costs its platoon half the morale. */
export const AURA_BLESS = 8;

/** Per-tick working memory. Rebuilt from World every tick, never serialized. */
export interface Scratch {
  hash: SpatialHash;
  unitIndex: IdIndex;
  platoonIndex: IdIndex;
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
  /** Slowest marching pace among ground soldiers other than siege engines (siege may trail). */
  slowest: Float64Array;
  slowestAll: Float64Array;
  /** Per platoon: banner position and facing before this tick's move, and how far it moved. */
  ox: Float64Array;
  oy: Float64Array;
  ohx: Float64Array;
  ohy: Float64Array;
  moved: Float64Array;
  /** Per platoon: summed distance of ground soldiers from their places, and how many. */
  errSum: Float64Array;
  errN: Int32Array;
  /** Per platoon: walls whose tower's reach it keeps out of (stance.ts noGoMask), as structure bits. */
  noGo: Int32Array;
  /** Per platoon: index into world.units of the shooter it is going after this tick, or -1. */
  hunt: Int32Array;
  /** Platoon indices grouped by player: player p's are porder[pstart[p] .. pstart[p + 1]). */
  porder: Int32Array;
  pstart: Int32Array;
  /** Coarse grid of which players have soldiers in each PRESENCE_CELL square, as bit masks. */
  presence: Int32Array;
  presenceCols: number;
  /** Soldiers whose owner the presence grid cannot mark (neutral, or past bit 30). */
  presenceMissed: number;
  /** Per unit: melee soldiers striking at it, so attackers spread across the enemy line. */
  attackers: Int32Array;
  /** Platoons that rallied at their capital this tick. */
  rallied: number[];
  /** Per structure: damage its walls have taken this tick, against the breach cap. */
  wallHit: Float64Array;
  /** Who holds which capital and who fights whom, as of the start of this tick. */
  ring: Ring;
}

/**
 * Id to array index, for ids handed out by world.nextId (small, increasing integers). A flat
 * table instead of a Map: the per-tick rebuild was a large share of indexing a busy world.
 * Only lookups are offered, never iteration, so it cannot leak an order into the simulation.
 */
export class IdIndex {
  /** index + 1 per id; 0 means absent. */
  private slots = new Int32Array(1024);
  private keys: number[] = [];

  clear(): void {
    const { slots, keys } = this;
    for (let k = 0; k < keys.length; k++) slots[keys[k]!] = 0;
    keys.length = 0;
  }

  set(id: number, index: number): void {
    if (!(id >= 0 && id <= 0x3fffffff && Number.isInteger(id))) throw new RangeError(`bad id ${id}`);
    if (id >= this.slots.length) {
      let n = this.slots.length;
      while (n <= id) n *= 2;
      const grown = new Int32Array(n);
      grown.set(this.slots);
      this.slots = grown;
    }
    if (this.slots[id] === 0) this.keys.push(id);
    this.slots[id] = index + 1;
  }

  get(id: number): number | undefined {
    const v = id >= 0 && id < this.slots.length ? (this.slots[id] ?? 0) : 0;
    return v === 0 ? undefined : v - 1;
  }
}

const cache = new WeakMap<World, Scratch>();

export function scratchFor(world: World): Scratch {
  let s = cache.get(world);
  if (!s) {
    const cap = MAX_ALIVE + 64;
    s = {
      hash: createSpatialHash(world.map, cap),
      unitIndex: new IdIndex(),
      platoonIndex: new IdIndex(),
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
      slowestAll: new Float64Array(256),
      ox: new Float64Array(256),
      oy: new Float64Array(256),
      ohx: new Float64Array(256),
      ohy: new Float64Array(256),
      moved: new Float64Array(256),
      errSum: new Float64Array(256),
      errN: new Int32Array(256),
      noGo: new Int32Array(256),
      hunt: new Int32Array(256),
      porder: new Int32Array(256),
      pstart: new Int32Array(65),
      attackers: new Int32Array(cap),
      presence: new Int32Array(0),
      presenceCols: 0,
      presenceMissed: 0,
      rallied: [],
      wallHit: new Float64Array(64),
      ring: computeRing(world),
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
  s.slowestAll = new Float64Array(size);
  s.ox = new Float64Array(size);
  s.oy = new Float64Array(size);
  s.ohx = new Float64Array(size);
  s.ohy = new Float64Array(size);
  s.moved = new Float64Array(size);
  s.errSum = new Float64Array(size);
  s.errN = new Int32Array(size);
  s.noGo = new Int32Array(size);
  s.hunt = new Int32Array(size);
  s.porder = new Int32Array(size);
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
    s.slowestAll[i] = Infinity;
    s.errSum[i] = 0;
    s.errN[i] = 0;
    s.moved[i] = 0;
  }
  if (s.alive.length < players.length) s.alive = new Int32Array(players.length * 2);
  if (s.pstart.length < players.length + 1) s.pstart = new Int32Array(players.length * 2 + 1);
  s.pstart.fill(0);
  for (let i = 0; i < platoons.length; i++) {
    const p = platoons[i]!.p;
    if (p >= 0 && p < players.length) s.pstart[p + 1]!++;
  }
  for (let p = 0; p < players.length; p++) s.pstart[p + 1]! += s.pstart[p]!;
  for (let p = players.length + 1; p < s.pstart.length; p++) s.pstart[p] = s.pstart[players.length]!;
  // Counting sort: s.alive serves as each player's cursor before it is reset below.
  for (let p = 0; p < players.length; p++) s.alive[p] = s.pstart[p]!;
  for (let i = 0; i < platoons.length; i++) {
    const p = platoons[i]!.p;
    if (p >= 0 && p < players.length) s.porder[s.alive[p]!++] = i;
  }
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
    if (sp < s.slowestAll[pl]!) s.slowestAll[pl] = sp;
    if (STATS[u.kind]!.flying || isSiege(u.kind)) continue;
    if (sp < s.slowest[pl]!) s.slowest[pl] = sp;
  }
  // A platoon of siege engines and fliers alone marches at its own slowest pace.
  for (let i = 0; i < platoons.length; i++) if (s.slowest[i] === Infinity) s.slowest[i] = s.slowestAll[i]!;
  rebuildSpatialHash(s.hash, units);
  markPresence(world, s);
}

export const PRESENCE_CELL = 64;

function markPresence(world: World, s: Scratch): void {
  const { map, units } = world;
  if (s.presenceCols === 0) {
    s.presenceCols = Math.ceil((map.navCols * map.navCell) / PRESENCE_CELL) + 1;
    s.presence = new Int32Array(s.presenceCols * s.presenceCols);
  }
  const cols = s.presenceCols;
  s.presence.fill(0);
  s.presenceMissed = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.p < 0 || u.p > 30) {
      s.presenceMissed++;
      continue;
    }
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((u.x - map.originX) / PRESENCE_CELL)));
    const cy = Math.min(cols - 1, Math.max(0, Math.floor((u.y - map.originY) / PRESENCE_CELL)));
    s.presence[cy * cols + cx]! |= 1 << u.p;
  }
}

/** Whether any soldier of a foe of player `p` may stand within `r` of (x, y). Conservative: whole cells. */
export function enemyWithin(world: World, s: Scratch, p: number, x: number, y: number, r: number): boolean {
  const { map } = world;
  const cols = s.presenceCols;
  const x0 = Math.max(0, Math.floor((x - r - map.originX) / PRESENCE_CELL));
  const x1 = Math.min(cols - 1, Math.floor((x + r - map.originX) / PRESENCE_CELL));
  const y0 = Math.max(0, Math.floor((y - r - map.originY) / PRESENCE_CELL));
  const y1 = Math.min(cols - 1, Math.floor((y + r - map.originY) / PRESENCE_CELL));
  const others = p >= 0 && p < s.ring.foes.length ? s.ring.foes[p]! : -1;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if ((s.presence[cy * cols + cx]! & others) !== 0) return true;
  return false;
}
