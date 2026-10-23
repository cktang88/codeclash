// Runs a synthetic war and prints how it unfolded: `pnpm tsx scripts/diagnose-war.ts [players] [minutes]`.
import { TICKS_PER_MINUTE, type SimInput } from '../src/sim/api.ts';
import { Chronicler } from '../src/sim/chronicle.ts';
import { generateMap, slotsFor } from '../src/sim/mapgen.ts';
import { createWorld, step } from '../src/sim/world.ts';

const players = Number(process.argv[2] ?? 4);
const minutes = Number(process.argv[3] ?? 20);
const params = { seed: 42, slots: slotsFor(players), members: players };
const world = createWorld(params, generateMap(params));
const chron = new Chronicler({ player: (p) => `@p${p}`, repo: (r) => `org/repo${r}` });
let r = 7;
const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
const counts: Record<string, number> = {};
const started = performance.now();
let peak = 0;
for (let t = 0; t < minutes * TICKS_PER_MINUTE; t++) {
  const inputs: SimInput[] = [];
  if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: p, hue: p * 60 });
  for (let p = 0; p < players; p++) {
    if (rand() < 1 / (3 * TICKS_PER_MINUTE)) {
      const code = Math.floor(rand() * 300);
      inputs.push({ kind: 'push', p, repo: p * 2 + (rand() < 0.5 ? 1 : 0), commits: 1, msg: 'work', lines: [code, Math.floor(rand() * 80), Math.floor(code * 0.15), rand() < 0.3 ? 40 : 0, rand() < 0.3 ? 20 : 0, Math.floor(rand() * 60), rand() < 0.1 ? 2000 : 0, rand() < 0.05 ? 500 : 0, 30] });
    }
  }
  const ev = step(world, inputs);
  peak = Math.max(peak, world.units.length);
  for (const e of chron.narrate(world, inputs, ev)) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    if (e.kind !== 'muster') console.log(`${(e.tick / TICKS_PER_MINUTE).toFixed(1)}m ${e.text}`);
  }
}
const ms = performance.now() - started;
console.log({ ticks: world.tick, msPerTick: +(ms / world.tick).toFixed(3), peakUnits: peak, units: world.units.length, platoons: world.platoons.length, monolithFallen: world.monolithFallen, counts });
for (const p of world.players) console.log(`p${p.p} renown=${p.renown} kills=${p.kills} losses=${p.losses} pushes=${p.pushes} caps=${p.captures} sacks=${p.sacks} monolith=${Math.round(p.monolithDamage)} queue=${p.queue.length}`);
console.log('structures', world.structures.map((s) => `${s.site}:${Math.round(s.hp)}/${s.maxHp}${s.ruinedUntil >= 0 ? ' ruined' : ''}`).join(' '));
console.log('sites', world.sites.map((s) => s.owner).join(','));
