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

/** A developer's push, varied enough to raise every kind now and then. */
function push(p: number): SimInput {
  const code = pick(260);
  const style = pick(10);
  const lines = [code, 0, Math.floor(code * (0.05 + rand() * 0.2)), 0, 0, pick(60), 0, 0, Math.floor(code * 0.12)];
  if (style < 6) lines[1] = pick(120);
  if (style === 2 || rand() < 0.2) lines[3] = 20 + pick(120);
  if (style === 3 || rand() < 0.2) lines[4] = 10 + pick(120);
  if (style === 4) lines[5] = 80 + pick(300);
  if (style === 5) lines[6] = 1500 + pick(6000);
  if (style === 6) lines[7] = 1500 + pick(4000);
  if (style === 7) lines[1] = lines[2] = 0;
  const msg = rand() < 0.25 ? 'fix the thing' : 'work';
  return { kind: 'push', p, repo: p * 2 + pick(2), commits: 1, msg, lines };
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
