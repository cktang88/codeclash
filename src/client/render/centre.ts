import { Terrain } from '../../sim/api.ts';

// The impassable heart of the ring: a great lake or a mountain massif. Named on the chart, in the
// HUD's ring diagram and in the digest's timelapse, always the same for the same war.

const LAKES = ['the Inkwell', 'the Still Mere', 'the Glass Water', 'the Mere of Echoes', 'the Sunken Sea', 'the Long Lake', 'the Quiet Deep'];
const MASSIFS = ['the Anvil Fells', 'the Greyspine', 'the Crown of Stone', 'the Old Teeth', 'the Thousand Steps', 'the Scriptorium Peaks', 'the Ironcrags'];

export function isLake(centreKind: number | undefined): boolean {
  return centreKind !== Terrain.Rock;
}

/** The centre's name on the chart, from the war's seed. */
export function centreName(seed: number, centreKind: number | undefined): string {
  const list = isLake(centreKind) ? LAKES : MASSIFS;
  let h = Math.imul((seed | 0) ^ 0x2c1b3c6d, 0x297a2d39);
  h ^= h >>> 15;
  return list[(h >>> 0) % list.length]!;
}
