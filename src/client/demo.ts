import { BATTLE_VERSION, type ArmySpec, type BattleSetup } from '../game/battle.ts';
import { Rng } from '../game/rng.ts';
import { emptyCounts } from '../game/units.ts';
import { FACTION_IDS, type FactionId } from '../game/factions.ts';

const MIX = [0.2, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.006];

function army(name: string, faction: FactionId, hue: number, men: number, rng: Rng): ArmySpec {
  const counts = MIX.map((f) => Math.round(men * f * (0.6 + rng.next() * 0.8)));
  return { name, faction, hue, counts, veterans: emptyCounts(), moraleBonus: rng.next() * 8, pavise: rng.next() * 0.2, stakes: rng.next() < 0.5, commander: true };
}

const NAMES: Record<FactionId, string[]> = {
  templar: ['Commandery of Acre', 'Commandery of Tortosa', 'Preceptory of Gaza', 'House of La Rochelle', 'Castle Pilgrim', 'Safed Garrison'],
  samurai: ['Takeda of Kai', 'Uesugi of Echigo', 'Oda of Owari', 'Shimazu of Satsuma', 'Date of Mutsu', 'Mōri of Aki'],
  undead: ['The Barrow of Kings', 'The Drowned Legion', 'Host of the Ninth Grave', 'The Ashen Choir', 'Tomb of Saint Hollow', 'The Bone March'],
};

/** Army sizes the showcase offers (men on the first side). */
export const DEMO_SIZES: readonly { men: number; label: string }[] = [
  { men: 150, label: 'A skirmish (150 men)' },
  { men: 450, label: 'A daily battle (450 men)' },
  { men: 1200, label: 'A strong day (1,200 men)' },
  { men: 4000, label: 'A Grand Battle (4,000 men)' },
];

/**
 * A sparring battle from a seed. `factions` picks either side's faction (null or omitted: the
 * seed picks, as before, so a seed without choices gives the same battle it always did).
 */
export function demoSetup(seed: number, men = 450, factions?: readonly [FactionId | null | undefined, FactionId | null | undefined]): BattleSetup {
  const rng = new Rng(seed);
  // Always draw both picks, so a chosen faction leaves the rest of the seed's battle unchanged.
  const ra = FACTION_IDS[rng.int(FACTION_IDS.length)]!;
  const rb = FACTION_IDS[rng.int(FACTION_IDS.length)]!;
  const fa = factions?.[0] ?? ra;
  const fb = factions?.[1] ?? rb;
  const na = NAMES[fa][rng.int(6)]!;
  let nb = NAMES[fb][rng.int(6)]!;
  if (nb === na) nb = NAMES[fb][(NAMES[fb].indexOf(nb) + 1) % 6]!;
  const hueA = rng.int(360);
  const hueB = (hueA + 120 + rng.int(120)) % 360;
  return { version: BATTLE_VERSION, seed, kind: men > 1500 ? 'grand' : 'daily', armies: [army(na, fa, hueA, men, rng), army(nb, fb, hueB, Math.round(men * (0.85 + rng.next() * 0.3)), rng)] };
}
