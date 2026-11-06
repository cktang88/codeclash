// Side bias (QA review 2, leftover 3): the same army under one faction on both sides, or a faction
// pairing fought both ways round on each seed. Prints JSON lines; run shards in parallel.
//   npx tsx scripts/qa/side-mirror.ts --a undead --b undead --men 250 --seeds 1-100 [--every 2]
import { BATTLE_VERSION, fight, type ArmySpec } from '../../src/game/battle.ts';
import type { FactionId } from '../../src/game/factions.ts';
import { emptyCounts } from '../../src/game/units.ts';
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, hue: number, faction: FactionId): ArmySpec => ({ name: 'a', faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true });
const a = arg('a', 'samurai') as FactionId;
const b = arg('b', 'undead') as FactionId;
const men = Number(arg('men', '250'));
const [s0, s1] = arg('seeds', '1-50').split('-').map(Number);
const swap = process.argv.includes('--swap');
for (let seed = s0!; seed <= s1!; seed++) {
  for (const aTeam of swap ? [0, 1] : [0]) {
    const armies: [ArmySpec, ArmySpec] = aTeam === 0 ? [army(men, 0, a), army(men, 200, b)] : [army(men, 0, b), army(men, 200, a)];
    const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies });
    console.log(JSON.stringify({ seed, aTeam, winner: r.winner, ticks: r.ticks }));
  }
}
