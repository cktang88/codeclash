
// The "horse beats bows at equal value" matchup (game-matchups.test.ts), over a range of days,
// in parallel-friendly slices: prints horse wins of the days run.
//   npx tsx scripts/qa/horse-bows.ts <from> <to>
import { fight } from '../../src/game/battle.ts';
import { U } from '../../src/game/units.ts';
import { setupOf, valued } from '../../src/game/game-test-helpers.ts';
const [a, z] = process.argv.slice(2).map(Number);
const horse = { [U.LightCavalry]: 0.5, [U.Knights]: 0.3, [U.HeavyInfantry]: 0.2 };
const bows = { [U.Archers]: 0.5, [U.Crossbowmen]: 0.2, [U.HeavyInfantry]: 0.3 };
let w = 0;
for (let s = a!; s < z!; s++) if (fight(setupOf(s, valued(450, horse), valued(450, bows))).winner === 0) w++;
console.log(`days ${a}-${z}: horse ${w}/${z! - a!}`);
