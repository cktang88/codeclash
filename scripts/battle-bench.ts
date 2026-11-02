// Fights sample battles and prints the outcome and timing: `pnpm tsx scripts/battle-bench.ts [men] [seed]`.
import { Battle, BATTLE_VERSION, type ArmySpec } from '../src/game/battle.ts';
import { U, UNIT_COUNT } from '../src/game/units.ts';

const men = Number(process.argv[2] ?? 450);
const seed = Number(process.argv[3] ?? 1);
const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(name: string, hue: number, n: number, tilt: number[] = []): ArmySpec {
  const counts = mix.map((f, i) => Math.round(n * f * (tilt[i] ?? 1)));
  return { name, faction: 'templar', hue, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true };
}
const t0 = performance.now();
const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army('ana', 0, men), army('bo', 210, men * 1.1, [1, 1, 1, 1.5])] });
const r = b.run();
const ms = performance.now() - t0;
console.log(`${b.soldiers.length} figures, scale ${r.scale}, ${r.ticks} ticks (${(r.ticks / 10).toFixed(0)}s), ${ms.toFixed(0)} ms; winner ${r.winner} by ${r.reason}`);
for (const [i, s] of r.sides.entries()) console.log(i, 'dead', s.dead.join(','), '| fled', s.fled.join(','), '| alive', s.alive.join(','), '| cmdr fell', s.commanderFell);
console.log(b.events.map((e) => `${(e.tick / 10).toFixed(0)}s ${e.team} ${e.kind} ${e.cls}`).join('\n'));
void U;
