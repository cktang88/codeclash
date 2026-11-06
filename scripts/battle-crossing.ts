// Friendly formed blocks passing through each other (the "X" of two regiments crossing), over grand
// battles: each incident (at least 4 men of one in the other's footprint; 'a quarter' when a quarter
// of a block's men stand in the other), when, which blocks, their modes and orders.
//   npx tsx scripts/battle-crossing.ts [--sizes 1500,2800,4000] [--seeds 1,2,3,4,5,6] [--quiet]
import { Battle, MAX_TICKS } from '../src/game/battle.ts';
import { demoSetup } from '../src/client/demo.ts';
import { blockCrossings } from '../src/game/overlap.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const sizes = arg('sizes', '1500,2800,4000').split(',').map(Number);
const seeds = arg('seeds', '1,2,3,4,5,6').split(',').map(Number);
const quiet = process.argv.includes('--quiet');
let total = 0;
let severe = 0;
const severeWhy: Record<string, number> = {};
let samples = 0;
const why: Record<string, number> = {};
// Pairs with a block of horse (or the general's household) in them.
let mounted = 0;
let mountedSevere = 0;
const mountedWhy: Record<string, number> = {};
for (const men of sizes) {
  for (const seed of seeds) {
    const b = new Battle(demoSetup(seed, men));
    const open = new Map<string, number>();
    let n = 0;
    while (!b.done() && b.tick < MAX_TICKS) {
      b.step();
      if (b.tick % 10) continue;
      samples++;
      const now = new Set<string>();
      for (const c of blockCrossings(b)) {
        const key = `${c.a}-${c.b}`;
        now.add(key);
        total++;
        const desc = (id: number) => {
          const r = b.regiments[id]!;
          return `${r.id}:${r.role}/${r.mode}/${r.ord.kind}${r.committed ? '+c' : ''}${r.line ? ' L' + r.line : ''}`;
        };
        const p = b.regiments[c.a]!;
        const q = b.regiments[c.b]!;
        const k = [`${p.role}/${p.mode}/${p.ord.kind}`, `${q.role}/${q.mode}/${q.ord.kind}`].sort().join(' x ');
        why[k] = (why[k] ?? 0) + 1;
        const horse = (r: typeof p) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' || r.role === 'command';
        if (horse(p) || horse(q)) {
          mounted++;
          if (c.share >= 0.25) mountedSevere++;
          mountedWhy[k] = (mountedWhy[k] ?? 0) + 1;
        }
        if (c.share >= 0.25) {
          severe++;
          severeWhy[k] = (severeWhy[k] ?? 0) + 1;
        }
        if (!open.has(key)) {
          open.set(key, b.tick);
          n++;
          if (!quiet) console.log(`${men}/${seed} t${b.tick}: ${desc(c.a)} x ${desc(c.b)} men in ${c.inA}/${c.inB} (${(100 * c.share).toFixed(0)}%)`);
        }
      }
      for (const key of [...open.keys()]) if (!now.has(key)) open.delete(key);
    }
    console.log(`${men}/${seed} ${b.setup.armies[0].faction}-${b.setup.armies[1].faction}: ${n} incidents, ${b.tick} ticks`);
  }
}
console.log(`crossing block-pairs per second sampled: ${(total / samples).toFixed(3)}; through a quarter of a block or more: ${(severe / samples).toFixed(3)}`);
for (const [k, v] of Object.entries(why).sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(String(v).padStart(6), k);
console.log('a quarter or more:');
for (const [k, v] of Object.entries(severeWhy).sort((x, y) => y[1] - x[1]).slice(0, 10)) console.log(String(v).padStart(6), k);
console.log(`with horse in them: ${(mounted / samples).toFixed(3)} a second sampled; through a quarter or more: ${(mountedSevere / samples).toFixed(3)}`);
for (const [k, v] of Object.entries(mountedWhy).sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(String(v).padStart(6), k);
