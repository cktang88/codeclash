// Sim throughput and determinism golden for a busy room:
// `pnpm tsx scripts/bench-sim.ts [players] [minutes]` with RATE=<pushes per player per hour> (default 90),
// GOLDEN=<file> to write (or, if it exists, compare) the per-tick checksum chain.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TICKS_PER_MINUTE, type SimInput } from '../src/sim/api.ts';
import { generateMap, slotsFor } from '../src/sim/mapgen.ts';
import { checksum } from '../src/sim/snapshot.ts';
import { createWorld, step } from '../src/sim/world.ts';

const players = Number(process.argv[2] ?? 16);
const minutes = Number(process.argv[3] ?? 12);
const rate = Number(process.env.RATE ?? 90);
const params = { seed: Number(process.env.SEED ?? 42), slots: slotsFor(players), members: players };
const world = createWorld(params, generateMap(params));
let r = 7;
const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = (n: number) => Math.floor(rand() * n);
const MESSAGES = ['fix: crash on empty input', 'feat: add export', 'refactor: split parser', 'perf: cache lookups', 'chore(deps): bump vite', 'Update handler'];
function push(p: number): SimInput {
  const code = pick(260) + (rand() < 0.05 ? 500 : 0);
  const lines = [code, pick(80), Math.floor(code * rand() * 0.15), rand() < 0.2 ? pick(120) : 0, rand() < 0.2 ? pick(80) : 0, pick(120), 0, 0, Math.floor(code * 0.12)];
  return { kind: 'push', p, repo: p * 2 + pick(2), commits: 1, msg: MESSAGES[pick(MESSAGES.length)]!, lines, files: 1 + pick(6), branches: Math.floor(code / (5 + pick(6))), churn: 0, filler: 0 };
}
const total = minutes * TICKS_PER_MINUTE;
const times = new Float64Array(total);
const units = new Uint32Array(total);
const sums: number[] = [];
let chain = 0;
for (let t = 0; t < total; t++) {
  const inputs: SimInput[] = [];
  if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: p, hue: p * 22 });
  if (t === 10) for (let p = 0; p < players; p++) if (p % 5 !== 0) inputs.push({ kind: 'doctrine', p, doctrine: ((p % 4) + 1) as 1 });
  for (let p = 0; p < players; p++) if (rand() < rate / (60 * TICKS_PER_MINUTE)) inputs.push(push(p));
  const t0 = performance.now();
  step(world, inputs);
  times[t] = performance.now() - t0;
  units[t] = world.units.length;
  if (process.env.GOLDEN) {
    chain = (Math.imul(chain ^ checksum(world), 16777619) + t) >>> 0;
    if (t % 50 === 0) sums.push(chain);
  }
}
// Report by unit-count band so runs compare like with like.
const bands = [[0, 400], [400, 800], [800, 1200], [1200, 1600], [1600, 2000], [2000, 99999]] as const;
for (const [lo, hi] of bands) {
  const sel: number[] = [];
  for (let t = 0; t < total; t++) if (units[t]! >= lo && units[t]! < hi) sel.push(times[t]!);
  if (sel.length < 20) continue;
  sel.sort((a, b) => a - b);
  const mean = sel.reduce((a, b) => a + b, 0) / sel.length;
  console.log(`units ${String(lo).padStart(4)}-${String(hi).padEnd(5)} ticks=${String(sel.length).padStart(5)} mean=${mean.toFixed(3)}ms p50=${sel[sel.length >> 1]!.toFixed(3)} p95=${sel[Math.floor(sel.length * 0.95)]!.toFixed(3)} max=${sel[sel.length - 1]!.toFixed(2)}`);
}
let all = 0;
for (let t = 0; t < total; t++) all += times[t]!;
console.log(`ticks=${total} total=${all.toFixed(0)}ms mean=${(all / total).toFixed(3)}ms peakUnits=${Math.max(...units)} final=${world.units.length} platoons=${world.platoons.length}`);
if (process.env.GOLDEN) {
  const file = process.env.GOLDEN;
  if (existsSync(file)) {
    const want = JSON.parse(readFileSync(file, 'utf8')) as number[];
    const bad = want.findIndex((s, i) => sums[i] !== s);
    console.log(bad < 0 && want.length === sums.length ? `golden OK (${sums.length} marks)` : `GOLDEN MISMATCH at tick ${bad * 50}`);
    if (bad >= 0) process.exitCode = 1;
  } else {
    writeFileSync(file, JSON.stringify(sums));
    console.log(`golden written: ${file}`);
  }
}
