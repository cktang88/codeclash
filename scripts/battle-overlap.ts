// How far men overlap (stand inside each other) over whole battles, and how fast the sim runs.
//   pnpm tsx scripts/battle-overlap.ts [men a side] [battles]
import { Battle, BATTLE_VERSION, type ArmySpec } from '../src/game/battle.ts';
import { UNIT_COUNT } from '../src/game/units.ts';
import { overlapStats, percentile } from '../src/game/overlap.ts';

const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(name: string, hue: number, n: number, faction: 'templar' | 'samurai' | 'undead', tilt: number[] = []): ArmySpec {
  const counts = mix.map((f, i) => Math.round(n * f * (tilt[i] ?? 1)));
  return { name, faction, hue, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true };
}
const men = Number(process.argv[2] ?? 600);
const seeds = Number(process.argv[3] ?? 6);
const facs = ['templar', 'samurai', 'undead'] as const;
let steps = 0;
let ms = 0;
const all: number[] = [];
const enemy: number[] = [];
const friend: number[] = [];
const rout: number[] = [];
let maxAll = 0;
let maxEnemy = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army('a', 0, men, facs[seed % 3]!), army('b', 210, men * 1.05, facs[(seed + 1) % 3]!, [1, 1, 1, 1.3])] });
  while (!b.done() && b.tick < 3600) {
    const t0 = performance.now();
    b.step();
    ms += performance.now() - t0;
    steps++;
    if (b.tick % 5 === 0) {
      const o = overlapStats(b);
      for (const v of o.depth) all.push(v);
      for (const v of o.enemyDepth) enemy.push(v);
      for (const v of o.friendDepth) friend.push(v);
      for (const v of o.routDepth) rout.push(v);
      maxAll = Math.max(maxAll, o.max);
      maxEnemy = Math.max(maxEnemy, o.maxEnemy);
    }
  }
  console.log(`seed ${seed}: winner ${b.result?.winner} at ${b.tick}, routs ${b.events.filter((e) => e.kind === 'rout').length}, charges ${b.events.filter((e) => e.kind === 'charge').length}`);
}
console.log(`${seeds} battles of ${men} men: ${steps} steps, ${(ms / steps).toFixed(3)} ms/step`);
const f = (v: number) => v.toFixed(3);
console.log(`overlap (share of the smaller radius), per man per sample: all p95 ${f(percentile(all, 0.95))} p99 ${f(percentile(all, 0.99))} p999 ${f(percentile(all, 0.999))} max ${f(maxAll)}`);
console.log(`  enemy pairs: p95 ${f(percentile(enemy, 0.95))} p99 ${f(percentile(enemy, 0.99))} p999 ${f(percentile(enemy, 0.999))} max ${f(maxEnemy)} (n ${enemy.length})`);
const line = (name: string, a: number[]) => console.log(`  ${name}: p50 ${f(percentile(a, 0.5))} p95 ${f(percentile(a, 0.95))} p99 ${f(percentile(a, 0.99))} (n ${a.length})`);
line('friends standing', friend);
line('pairs with a runner', rout);
