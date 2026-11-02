import { BATTLE_VERSION, type ArmySpec, type BattleSetup } from '../game/battle.ts';
import { Rng } from '../game/rng.ts';
import { emptyCounts } from '../game/units.ts';

const MIX = [0.2, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.006];

function army(name: string, hue: number, men: number, rng: Rng): ArmySpec {
  const counts = MIX.map((f) => Math.round(men * f * (0.6 + rng.next() * 0.8)));
  return { name, faction: 'templar', hue, counts, veterans: emptyCounts(), moraleBonus: rng.next() * 8, pavise: rng.next() * 0.2, stakes: rng.next() < 0.5, commander: true };
}

const NAMES = ['Commandery of Acre', 'Commandery of Tortosa', 'Preceptory of Gaza', 'House of La Rochelle', 'Castle Pilgrim', 'Safed Garrison'];

export function demoSetup(seed: number, men = 450): BattleSetup {
  const rng = new Rng(seed);
  const i = rng.int(NAMES.length);
  const j = (i + 1 + rng.int(NAMES.length - 1)) % NAMES.length;
  const hueA = rng.int(360);
  const hueB = (hueA + 120 + rng.int(120)) % 360;
  return { version: BATTLE_VERSION, seed, kind: men > 1500 ? 'grand' : 'daily', armies: [army(NAMES[i]!, hueA, men, rng), army(NAMES[j]!, hueB, Math.round(men * (0.85 + rng.next() * 0.3)), rng)] };
}
