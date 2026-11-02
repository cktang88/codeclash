// Fights sample battles and prints outcome, timing and the battle's phases.
//   pnpm bench                 several sizes, two seeds each
//   pnpm bench 2800 3          one battle of 2800 men a side, seed 3, with its event log
import { Battle, BATTLE_VERSION, type ArmySpec } from '../src/game/battle.ts';
import { UNIT_COUNT } from '../src/game/units.ts';

const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(name: string, hue: number, n: number, tilt: number[] = []): ArmySpec {
  const counts = mix.map((f, i) => Math.round(n * f * (tilt[i] ?? 1)));
  return { name, faction: 'templar', hue, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true };
}

const fmt = (t: number) => (t < 0 ? '  -  ' : `${(t / 10).toFixed(0).padStart(4)}s`);

function bench(men: number, seed: number, log = false): void {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: men > 1500 ? 'grand' : 'daily', armies: [army('ana', 0, men), army('bo', 210, men * 1.05, [1, 1, 1, 1.3])] });
  let worst = 0;
  let sum = 0;
  const t0 = performance.now();
  while (!b.done() && b.tick < 3600) {
    const s = performance.now();
    b.step();
    const dt = performance.now() - s;
    sum += dt;
    if (dt > worst) worst = dt;
  }
  const r = b.result ?? b.run(0);
  const ms = performance.now() - t0;
  const first = (kind: string) => b.events.find((e) => e.kind === kind)?.tick ?? -1;
  const routs = b.events.filter((e) => e.kind === 'rout').length;
  const rallies = b.events.filter((e) => e.kind === 'rally').length;
  const charges = b.events.filter((e) => e.kind === 'charge').length;
  console.log(
    `${String(men).padStart(5)} men  ${String(b.soldiers.length).padStart(5)} figs  scale ${r.scale}  seed ${seed}  ` +
      `${(ms / 1000).toFixed(2)}s total  ${(sum / Math.max(1, r.ticks)).toFixed(2)} ms/step avg  ${worst.toFixed(1)} worst  ` +
      `| contact ${fmt(first('contact'))} first rout ${fmt(first('rout'))} break ${fmt(first('break'))} end ${fmt(r.ticks)}  ` +
      `| winner ${r.winner} by ${r.reason}, ${routs} routs, ${rallies} rallies, ${charges} charges`,
  );
  if (!log) return;
  for (const [i, s] of r.sides.entries()) console.log(i, 'dead', s.dead.join(','), '| fled', s.fled.join(','), '| alive', s.alive.join(','), '| cmdr fell', s.commanderFell);
  console.log(b.events.map((e) => `${(e.tick / 10).toFixed(0)}s ${e.team} ${e.kind} ${e.cls}`).join('\n'));
}

if (process.argv[2]) bench(Number(process.argv[2]), Number(process.argv[3] ?? 1), true);
else for (const men of [250, 500, 1000, 1500, 2800]) for (const seed of [1, 2]) bench(men, seed);
