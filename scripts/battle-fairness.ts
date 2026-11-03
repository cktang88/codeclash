// Mirror matches: two identical armies, many seeds. Each side should win about half; prints
// team 0's share and how many standard deviations it is from a fair coin.
//   pnpm fairness              250 and 120 a side, seeds 1-200
//   pnpm fairness 500 400      500 a side, seeds 1-400
// A side bias in the sim usually comes from an ordering that favours one army (who thinks,
// looks or acts first in a tick, by id or by tick parity) or from rules not mirrored for the
// right-hand army (`dir`). The bias of an ordering often depends on the armies' size, so try
// several sizes; a few hundred seeds at least (the noise at n seeds is 50% / sqrt(n)).
import { BATTLE_VERSION, fight, type ArmySpec } from '../src/game/battle.ts';
import { emptyCounts } from '../src/game/units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, hue: number): ArmySpec => ({
  name: 'a', faction: 'templar', hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true,
});

function mirror(men: number, seeds: number): void {
  let wins = 0;
  let draws = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(men, 0), army(men, 200)] });
    if (r.winner === 0) wins++;
    else if (r.winner === null) draws++;
  }
  const n = seeds - draws;
  const z = (wins - n / 2) / Math.sqrt(n / 4);
  console.log(`${String(men).padStart(5)} a side, ${seeds} seeds: team 0 won ${wins} (${((100 * wins) / Math.max(1, n)).toFixed(1)}%), ${draws} draws, z = ${z.toFixed(2)}`);
}

const sizes = process.argv[2] ? [Number(process.argv[2])] : [250, 120];
const seeds = Number(process.argv[3] ?? 200);
for (const men of sizes) mirror(men, seeds);
