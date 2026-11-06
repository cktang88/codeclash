// Generals over the faction pairings: how often each faction's general falls, when (before or
// after his army broke), how long his household spends in melee, how far from his own line he
// stands on average, and (undead) how many the Lich raises.
//   npx tsx scripts/qa/generals.ts [--seeds 1,2,3,4] [--sizes 450,1200,2800]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { FACTION_IDS } from '../../src/game/factions.ts';
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const seeds = arg('seeds', '1,2,3,4').split(',').map(Number);
const sizes = arg('sizes', '450,1200,2800').split(',').map(Number);
const T: Record<string, { n: number; fell: number; fellEarly: number; melee: number; ticks: number; ahead: number; raised: number; won: number }> = {};
for (const men of sizes) for (const seed of seeds) for (const fa of FACTION_IDS) for (const fb of FACTION_IDS) {
  const b = new Battle(demoSetup(seed, men, [fa, fb]));
  const ts = (b as any).ts;
  const g = [0, 1].map((t) => b.regiments.find((r) => r.team === t && r.role === 'command')!);
  const fellAt = [-1, -1];
  const melee = [0, 0];
  const ahead = [0, 0];
  let ticks = 0;
  while (!b.done()) {
    b.step();
    if (b.tick % 5) continue;
    ticks++;
    for (const t of [0, 1]) {
      const r = g[t]!;
      if (r.alive === 0) { if (fellAt[t]! < 0) fellAt[t] = b.tick; continue; }
      if (r.engaged) melee[t]!++;
      const dir = t === 0 ? 1 : -1;
      if (ts[t].hasLine) ahead[t]! += (r.cx - ts[t].frontX) * dir;
    }
  }
  for (const t of [0, 1]) {
    const f = t === 0 ? fa : fb;
    const k = (T[f] ??= { n: 0, fell: 0, fellEarly: 0, melee: 0, ticks: 0, ahead: 0, raised: 0, won: 0 });
    k.n++;
    if (b.commanderFell[t]) k.fell++;
    if (b.commanderFell[t] && (b.brokenAt < 0 || fellAt[t]! < b.brokenAt)) k.fellEarly++;
    k.melee += melee[t]!;
    k.ticks += ticks;
    k.ahead += ahead[t]! / ticks;
    k.raised += b.risen[t]!.reduce((a, c) => a + c, 0);
    if (b.result!.winner === t) k.won++;
  }
}
console.log('faction   battles  general fell  (before the break)  melee share  mean x vs own line  raised/battle  won');
for (const [f, k] of Object.entries(T)) console.log(`${f.padEnd(9)} ${String(k.n).padStart(6)}  ${(100 * k.fell / k.n).toFixed(0).padStart(10)}%  ${(100 * k.fellEarly / k.n).toFixed(0).padStart(16)}%  ${(100 * k.melee / k.ticks).toFixed(1).padStart(10)}%  ${(k.ahead / k.n).toFixed(0).padStart(18)}  ${(k.raised / k.n).toFixed(1).padStart(12)}  ${(100 * k.won / k.n).toFixed(0)}%`);
