// Runs the playground's fight simulation in Node, as a server would: checks that two runs of the
// same inputs stay identical tick by tick, and times a tick at several army sizes.
//   pnpm tsx playground/scripts/simcheck.ts
import { checksum, createWorld, step, type SimInput, type UnitType, type World } from '../src/sim/sim.ts';
import { battleInputs, BATTLES } from '../src/sim/battles.ts';

const types: UnitType[] = BATTLES.types;

/**
 * How badly living ground soldiers overlap: of the pairs touching, the share sunk more than 10%
 * into each other, and the deepest sink as a share of the pair's radii, sampled every 20 ticks.
 */
function overlap(w: World, acc: { pairs: number; deep: number; worst: number }): void {
  const live = w.units.filter((u) => u.st !== 4 && !w.types[u.type]!.fly);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const min = w.types[a.type]!.radius + w.types[b.type]!.radius;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d >= min) continue;
      acc.pairs++;
      const sink = 1 - d / min;
      if (sink > 0.1) acc.deep++;
      acc.worst = Math.max(acc.worst, sink);
    }
}

function run(inputs: SimInput[], ticks: number, seed: number): { w: World; sums: number[]; ms: number[]; ov: { pairs: number; deep: number; worst: number } } {
  const w = createWorld(types, seed);
  const sums: number[] = [];
  const ms: number[] = [];
  const ov = { pairs: 0, deep: 0, worst: 0 };
  for (let t = 0; t < ticks; t++) {
    const t0 = performance.now();
    step(w, inputs.filter((i) => i.tick === w.tick));
    ms.push(performance.now() - t0);
    sums.push(checksum(w));
    if (t % 20 === 0 && w.units.length <= 1200) overlap(w, ov);
  }
  return { w, sums, ms, ov };
}

const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]!.toFixed(2);
for (const [name, perSide] of [['skirmish', 40], ['battle', 300], ['war', 500], ['huge', 1000]] as const) {
  const inputs = battleInputs(perSide, 0);
  const a = run(inputs, 1200, 7);
  const b = run(inputs, 1200, 7);
  const diverged = a.sums.findIndex((s, i) => s !== b.sums[i]);
  const alive = [0, 1].map((s) => a.w.units.filter((u) => u.side === s && u.st !== 4).length);
  console.log(
    `${name.padEnd(8)} ${String(perSide).padStart(4)}/side  ${diverged < 0 ? 'identical over 1200 ticks' : `DIVERGED at tick ${diverged}`}  ` +
      `tick ms: median ${pct(a.ms, 0.5)}, p95 ${pct(a.ms, 0.95)}, max ${pct(a.ms, 0.999)}  ` +
      `after 60 s: ${alive[0]} v ${alive[1]} standing, ${a.w.deaths} fallen, checksum ${a.sums.at(-1)!.toString(16)}` +
      (a.ov.pairs ? `\n${''.padEnd(19)}overlap: ${a.ov.pairs} touching pairs sampled, ${((100 * a.ov.deep) / a.ov.pairs).toFixed(1)}% sunk >10%, worst ${(100 * a.ov.worst).toFixed(0)}%` : ''),
  );
}
