// Seeded randomness. Everything in src/game is deterministic: the server decides a battle and
// every browser replays the same battle from the same seed and armies, tick for tick. So the
// game uses only + - * / Math.sqrt Math.floor Math.abs Math.min Math.max on numbers, this PRNG,
// and arrays iterated in index order. No Math.sin/cos/atan2/pow/exp/log, Date or Math.random.

/** mulberry32: a small, fast 32-bit generator. State is one uint32. */
export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** 0 <= x < 1 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Whole number in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** A 32-bit hash of a string (FNV-1a), for seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes numbers into one seed. */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
