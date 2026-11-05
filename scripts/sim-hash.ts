// Hashes battle outcomes (winner, ticks, every figure's final x/y/hp/state, events) and times each step:
// a performance change that should not alter results must leave every hash as it was.
//   npx tsx scripts/sim-hash.ts [sizes=450,2000,2800] [seeds=10] [factions=1]
// (cpu is process.cpuUsage: it leaves out other processes on a busy machine, but counts the
// engine's helper threads. Compare timings run back to back: on a shared machine they drift.)
import { Battle, BATTLE_VERSION, type ArmySpec } from '../src/game/battle.ts';
import { UNIT_COUNT } from '../src/game/units.ts';
import type { FactionId } from '../src/game/factions.ts';

const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
function army(name: string, faction: FactionId, hue: number, n: number, tilt: number[] = []): ArmySpec {
  const counts = mix.map((f, i) => Math.round(n * f * (tilt[i] ?? 1)));
  return { name, faction, hue, counts, veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true };
}
const sizes = (process.argv[2] ?? '450,2000,2800').split(',').map(Number);
const seeds = Number(process.argv[3] ?? 10);
const withFactions = (process.argv[4] ?? '1') === '1';
const buf = new Float64Array(1);
const u32 = new Uint32Array(buf.buffer);
let h = 0;
const mixIn = (v: number) => {
  h = Math.imul(h ^ v, 0x01000193) >>> 0;
};
const num = (v: number) => {
  buf[0] = v;
  mixIn(u32[0]!);
  mixIn(u32[1]!);
};
const pairs: [FactionId, FactionId][] = [['templar', 'templar'], ['samurai', 'undead'], ['undead', 'templar']];
const all: number[] = [];
let total = 0;
// (Warm the engine first, so the first battle timed does not pay for compiling the code.)
new Battle({ version: BATTLE_VERSION, seed: 99, kind: 'daily', armies: [army('w', 'templar', 0, 300), army('v', 'undead', 210, 300)] }).run(3600);
for (const men of sizes) {
  const times: number[] = [];
  const cpu: number[] = [];
  const hashes: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const [fa, fb] = withFactions ? pairs[seed % pairs.length]! : pairs[0]!;
    const b = new Battle({ version: BATTLE_VERSION, seed, kind: men > 1500 ? 'grand' : 'daily', armies: [army('ana', fa, 0, men), army('bo', fb, 210, men * 1.05, [1, 1, 1, 1.3])] });
    h = 0x811c9dc5;
    while (!b.done() && b.tick < 3600) {
      const c = process.cpuUsage();
      const s = performance.now();
      b.step();
      times.push(performance.now() - s);
      const e = process.cpuUsage(c);
      cpu.push((e.user + e.system) / 1000);
    }
    const r = b.result ?? b.run(0);
    mixIn(r.winner === null ? 9 : r.winner);
    mixIn(r.ticks);
    for (const s of b.soldiers) {
      num(s.x);
      num(s.y);
      num(s.hp);
      mixIn(s.state);
    }
    for (const e of b.events) {
      mixIn(e.tick);
      mixIn(e.team);
      for (const c of e.kind) mixIn(c.charCodeAt(0));
    }
    hashes.push(h.toString(16).padStart(8, '0'));
  }
  const stats = (xs: number[]) => {
    xs.sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const p = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
    return `mean ${mean.toFixed(3)}  p50 ${p(0.5).toFixed(3)}  p95 ${p(0.95).toFixed(3)}  p99 ${p(0.99).toFixed(3)}  max ${p(1).toFixed(1)}`;
  };
  total += times.reduce((a, b) => a + b, 0);
  console.log(`${String(men).padStart(5)}  wall ms/step ${stats(times)}  | cpu ${stats(cpu)}  | steps ${times.length}`);
  console.log(`       ${hashes.join(' ')}`);
  all.push(...hashes.map((x) => parseInt(x, 16)));
}
console.log(`total ${(total / 1000).toFixed(1)} s`);
