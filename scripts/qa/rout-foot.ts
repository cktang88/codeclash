// Foot routing from foot: per second, routers' pace and the nearest pursuer, pursuers' modes.
//   npx tsx scripts/qa/rout-foot.ts [seed] [winnerMen] [loserMen]
import { Battle, BATTLE_VERSION, State } from '../../src/game/battle.ts';
import { U } from '../../src/game/units.ts';
import { only, placeRegiment, plainArmy } from '../../src/game/testing.ts';
const [seed = 1, wm = 80, lm = 24] = process.argv.slice(2).map(Number);
const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, wm)), plainArmy(only(U.Spearmen, lm), 200, 'samurai')] });
const place = (t: number, x: number, f: number) => { const g = b.regiments.filter((r) => r.team === t); let y = 1200 - g.reduce((s, r) => s + r.width + 8, -8) / 2; for (const r of g) { placeRegiment(b, r, x, y + r.width / 2, f, 0); y += r.width + 8; } };
place(0, 1160, 1); place(1, 1240, -1);
const d = (b as any).d;
while (!b.done() && b.tick < 900) {
  b.step();
  if (b.tick % 10) continue;
  const rt = b.soldiers.filter((s) => s.state === State.Routing);
  const ft = b.soldiers.filter((s) => s.state === State.Fighting);
  let sp = 0, gap = 0;
  for (const s of rt) { sp += Math.hypot(s.vx, s.vy); let q = 1e9; for (const o of ft) if (o.team !== s.team) q = Math.min(q, Math.hypot(o.x - s.x, o.y - s.y)); gap += q; }
  const pursuers = ft.filter((s) => s.team === 0);
  const tg = pursuers.filter((s) => s.target >= 0).length;
  let psp = 0; for (const s of pursuers) psp += Math.hypot(s.vx, s.vy);
  console.log(`t${b.tick} fight ${ft.filter((s) => s.team === 0).length}/${ft.filter((s) => s.team === 1).length} rout ${rt.length} dead1 ${b.soldiers.filter((s) => s.team === 1 && s.state === State.Dead).length} | routers pace ${(sp / Math.max(1, rt.length)).toFixed(1)} gap ${(gap / Math.max(1, rt.length)).toFixed(0)} | pursuers pace ${(psp / Math.max(1, pursuers.length)).toFixed(1)} w/foe ${tg} | ${b.regiments.map((r) => `${r.id}:${r.mode}/${r.order}`).join(' ')}`);
}
console.log(b.result?.winner, b.tick);
