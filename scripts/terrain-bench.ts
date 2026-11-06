// Per-tick cost of a 450-a-side demo battle, flat or on generated ground (battle v17 terrain).
//   npx tsx scripts/terrain-bench.ts [--men=450] [--seeds=1-3] [--terrain=flat|field] [--ticks=2000]
import { Battle } from '../src/game/battle.ts';
import { demoSetup } from '../src/client/demo.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const men = Number(opt('men', '450'));
const [s0, s1] = opt('seeds', '1-3').split('-').map(Number);
const terrain = opt('terrain', 'field');
const ticks = Number(opt('ticks', '2000'));
let all = 0;
let n = 0;
for (let seed = s0!; seed <= (s1 ?? s0!); seed++) {
  const setup = { ...demoSetup(seed, men), terrain } as ReturnType<typeof demoSetup>;
  const b = new Battle(setup);
  let sum = 0;
  while (!b.done() && b.tick < ticks) {
    const t = performance.now();
    b.step();
    sum += performance.now() - t;
  }
  all += sum;
  n += b.tick;
  console.log(`seed ${seed} ${terrain}: ${b.soldiers.length} figs, ${b.tick} ticks, ${((sum * 1000) / b.tick).toFixed(0)} us/tick${b.result ? `, winner ${b.result.winner} at ${b.result.ticks}` : ''}`);
}
console.log(`mean ${((all * 1000) / n).toFixed(0)} us/tick`);
