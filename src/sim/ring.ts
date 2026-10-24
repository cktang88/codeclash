// The ring of owned capitals, and the fronts it gives each player. Every army fights only its
// neighbours: the nearest other owners clockwise and counter-clockwise around the ring of claimed
// capitals. A pure function of the world (which player holds which capital), recomputed each
// tick, so every client agrees on it without it being stored.

import { NEUTRAL, type PlayerState, type World } from './api.ts';
import { fortBetween } from './mapgen.ts';

/** One front of a player's realm: the road from one of its capitals to the next foe's. */
export interface Front {
  /** +1 clockwise (toward higher slots), -1 counter-clockwise; 0 for a rising's march on its lost home. */
  dir: number;
  /** Slot of the player's own capital at this end of its realm, or -1 for a rising. */
  from: number;
  /** Slot of the foe's capital at the far end of the road. */
  to: number;
  /** The foe: the owner of `to`. */
  foe: number;
  /** Border fort sites on the road between `from` and `to`, nearest `from` first. */
  forts: number[];
}

export interface Ring {
  /** Per slot: the player holding its capital, or NEUTRAL (an unclaimed seat). */
  owner: Int32Array;
  /** Claimed slots in ring order (ascending: clockwise). */
  order: number[];
  /** Distinct players holding a capital. */
  owners: number;
  /** Per player: its fronts. Normally two (both to one foe when only two owners remain); none once it holds the whole ring. */
  fronts: Front[][];
  /** Per player: bit q set when q is its foe (symmetric). Soldiers fight only foes. */
  foes: Int32Array;
  /** Per player: slots of the capitals it holds, ascending. */
  capitals: number[][];
}

/** The capital each slot's structure stands for, as owners per slot. */
function ownersBySlot(world: World): Int32Array {
  const owner = new Int32Array(world.map.slots).fill(NEUTRAL);
  for (const st of world.structures) {
    const def = world.map.sites[st.site];
    if (def && def.kind === 'capital' && def.slot >= 0 && def.slot < owner.length) owner[def.slot] = st.p;
  }
  return owner;
}

/** Forts on the road from slot `from` to slot `to` going `dir` around the ring of `slots` seats. */
function fortsBetween(slots: number, from: number, to: number, dir: number): number[] {
  const out: number[] = [];
  let s = from;
  for (let guard = 0; guard < slots && s !== to; guard++) {
    if (dir > 0) {
      out.push(fortBetween(slots, s));
      s = (s + 1) % slots;
    } else {
      s = (s - 1 + slots) % slots;
      out.push(fortBetween(slots, s));
    }
  }
  return out;
}

export function computeRing(world: World): Ring {
  const n = world.players.length;
  const slots = world.map.slots;
  const owner = ownersBySlot(world);
  const order: number[] = [];
  for (let s = 0; s < slots; s++) if (owner[s]! >= 0) order.push(s);
  const fronts: Front[][] = Array.from({ length: n }, () => []);
  const capitals: number[][] = Array.from({ length: n }, () => []);
  const foes = new Int32Array(Math.max(1, n));
  const seen = new Int32Array(Math.max(1, n));
  let owners = 0;
  for (const s of order) {
    const o = owner[s]!;
    if (o < 0 || o >= n) continue;
    capitals[o]!.push(s);
    if (seen[o] === 0) owners++;
    seen[o] = 1;
  }
  const m = order.length;
  if (owners >= 2) {
    // Each maximal run of one owner's capitals around the ring has a front at either end.
    for (let i = 0; i < m; i++) {
      const o = owner[order[i]!]!;
      const prev = owner[order[(i - 1 + m) % m]!]!;
      if (o === prev || o < 0 || o >= n) continue;
      let j = i;
      while (owner[order[(j + 1) % m]!] === o) j = (j + 1) % m;
      const head = order[i]!;
      const tail = order[j]!;
      const cw = order[(j + 1) % m]!;
      const ccw = order[(i - 1 + m) % m]!;
      fronts[o]!.push({ dir: 1, from: tail, to: cw, foe: owner[cw]!, forts: fortsBetween(slots, tail, cw, 1) });
      fronts[o]!.push({ dir: -1, from: head, to: ccw, foe: owner[ccw]!, forts: fortsBetween(slots, head, ccw, -1) });
    }
  }
  // A player with no capital rises against whoever holds its home seat.
  for (let p = 0; p < n; p++) {
    if (capitals[p]!.length > 0 || owners === 0) continue;
    const home = world.players[p]!.slot;
    const holder = home >= 0 && home < slots ? owner[home]! : NEUTRAL;
    if (holder < 0 || holder === p) continue;
    fronts[p]!.push({ dir: 0, from: -1, to: home, foe: holder, forts: [] });
  }
  for (let p = 0; p < n; p++) {
    for (const f of fronts[p]!) {
      if (f.foe < 0 || f.foe >= n || f.foe > 30 || p > 30) continue;
      foes[p]! |= 1 << f.foe;
      foes[f.foe]! |= 1 << p;
    }
  }
  return { owner, order, owners, fronts, foes, capitals };
}

/** Whether players `p` and `q` are foes on this ring. */
export function hostile(ring: Ring, p: number, q: number): boolean {
  return p >= 0 && q >= 0 && p < ring.foes.length && q <= 30 && ((ring.foes[p]! >>> q) & 1) === 1;
}

/** A player's neighbours: the distinct foes its fronts face, in front order. */
export function neighbours(ring: Ring, p: number): number[] {
  const out: number[] = [];
  for (const f of ring.fronts[p] ?? []) if (!out.includes(f.foe)) out.push(f.foe);
  return out;
}

/** The front a site lies on for player `p` (a fort on the road, or the foe's capital at its end), or null. */
export function frontOf(ring: Ring, world: World, p: number, site: number): Front | null {
  const def = world.map.sites[site];
  if (!def) return null;
  for (const f of ring.fronts[p] ?? []) {
    if (def.kind === 'capital' ? def.slot === f.to : f.forts.includes(site)) return f;
  }
  return null;
}

/**
 * Whether a player is still in the war: it holds a capital, or it has raised soldiers today (a
 * rising fights on from outside its lost home's walls). A player with neither is out until it pushes.
 */
export function stillIn(player: PlayerState): boolean {
  if (player.capitals > 0) return true;
  for (const n of player.raised) if (n > 0) return true;
  return false;
}
