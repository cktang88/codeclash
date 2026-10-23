// Runs a synthetic war and prints how it unfolded:
// `pnpm tsx scripts/diagnose-war.ts [players] [minutes]`, with RATE=<pushes per player per hour> (default 20).
import { KIND_COUNT, TICKS_PER_MINUTE, type SimInput } from '../src/sim/api.ts';
import { Chronicler } from '../src/sim/chronicle.ts';
import { generateMap, slotsFor } from '../src/sim/mapgen.ts';
import { STATS } from '../src/sim/stats.ts';
import { createWorld, step } from '../src/sim/world.ts';

const players = Number(process.argv[2] ?? 4);
const minutes = Number(process.argv[3] ?? 20);
const rate = Number(process.env.RATE ?? 20);
const quiet = process.env.QUIET === '1';
const params = { seed: Number(process.env.SEED ?? 42), slots: slotsFor(players), members: players };
const world = createWorld(params, generateMap(params));
const chron = new Chronicler({ player: (p) => `@p${p}`, repo: (r) => `org/repo${r}` });
let r = 7;
const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = (n: number) => Math.floor(rand() * n);
const counts: Record<string, number> = {};
const raised = new Array<number>(KIND_COUNT).fill(0);
const deaths = new Array<number>(KIND_COUNT).fill(0);
const kills = new Array<number>(KIND_COUNT).fill(0);
const started = performance.now();
let peak = 0;

const MESSAGES = ['fix: crash on empty input', 'feat: add export', 'refactor: split parser', 'perf: cache lookups', 'revert: "feat: add export"', 'chore(deps): bump vite', 'Update handler'];

/** A developer's push: mostly code, with the purposes real commits have. */
function push(p: number): SimInput {
  const code = pick(260) + (rand() < 0.05 ? 500 : 0);
  const files = 1 + pick(code > 400 ? 14 : 6);
  const lines = [code, pick(80), Math.floor(code * rand() * 0.15), rand() < 0.2 ? pick(120) : 0, rand() < 0.2 ? pick(80) : 0, pick(120), rand() < 0.1 ? pick(4000) : 0, 0, Math.floor(code * 0.12)];
  const roll = rand();
  const msg = MESSAGES[roll < 0.25 ? 0 : roll < 0.5 ? 1 : roll < 0.62 ? 2 : roll < 0.7 ? 3 : roll < 0.73 ? 4 : roll < 0.8 ? 5 : 6]!;
  return { kind: 'push', p, repo: p * 2 + pick(2), commits: 1, msg, lines, files, branches: Math.floor(code / (5 + pick(6))), churn: 0, filler: 0 };
}

for (let t = 0; t < minutes * TICKS_PER_MINUTE; t++) {
  const inputs: SimInput[] = [];
  if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: p, hue: p * 60 });
  if (t === 10) for (let p = 0; p < players; p++) if (p % 5 !== 0) inputs.push({ kind: 'doctrine', p, doctrine: (p % 4) + 1 as 1 });
  for (let p = 0; p < players; p++) if (rand() < rate / (60 * TICKS_PER_MINUTE)) inputs.push(push(p));
  const ev = step(world, inputs);
  peak = Math.max(peak, world.units.length);
  for (const d of ev.deaths) {
    deaths[d.kind]!++;
    if (d.by >= 0) kills[d.by]!++;
  }
  for (const e of chron.narrate(world, inputs, ev)) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    if (!quiet && !['muster', 'wiped', 'rout', 'capture'].includes(e.kind)) console.log(`${(e.tick / TICKS_PER_MINUTE).toFixed(1)}m ${e.text}`);
  }
}
for (const p of world.players) for (let k = 0; k < KIND_COUNT; k++) raised[k]! += p.raised[k]!;
const ms = performance.now() - started;
console.log({ ticks: world.tick, msPerTick: +(ms / world.tick).toFixed(3), peakUnits: peak, units: world.units.length, platoons: world.platoons.length, monolithFallen: world.monolithFallen, counts });
console.log('kind            raised  kills deaths   k/d');
for (let k = 0; k < KIND_COUNT; k++) {
  const kd = deaths[k]! > 0 ? (kills[k]! / deaths[k]!).toFixed(2) : '-';
  console.log(`${STATS[k]!.name.padEnd(15)} ${String(raised[k]).padStart(6)} ${String(kills[k]).padStart(6)} ${String(deaths[k]).padStart(6)} ${kd.padStart(5)}`);
}
for (const p of world.players) console.log(`p${p.p} renown=${p.renown} kills=${p.kills} losses=${p.losses} pushes=${p.pushes} caps=${p.captures} sacks=${p.sacks} monolith=${Math.round(p.monolithDamage)} queue=${p.queue.length}`);
console.log('structures', world.structures.map((s) => `${s.site}:${Math.round(s.hp)}/${s.maxHp}${s.ruinedUntil >= 0 ? ' ruined' : ''}`).join(' '));
