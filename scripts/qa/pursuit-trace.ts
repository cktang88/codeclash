// Knights pursuing routing archers (the pursuit set piece): per second, the pursuing riders'
// targets, gap to the target, speed share, and kills of routers by riders. (QA round 2, #6.)
//   npx tsx scripts/qa/pursuit-trace.ts [seed]
import { Battle, BATTLE_VERSION, State } from '../../src/game/battle.ts';
import { plainArmy, only } from '../../src/game/testing.ts';
const seed = Number(process.argv[2] ?? 3);
const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(7, 48), 0, 'templar'), plainArmy(only(3, 48), 200, 'samurai')] } as any);
const d = (b as any).d;
let kills = 0;
const hurt0 = (b as any).hurt.bind(b);
(b as any).hurt = (v: number, amount: number, a: number) => {
  const was = b.soldiers[v]!.state;
  const res = hurt0(v, amount, a);
  if (was === State.Routing && a >= 0 && b.soldiers[v]!.state !== State.Routing && b.soldiers[v]!.state !== State.Fighting && b.soldiers[a]!.s.mounted) kills++;
  return res;
};
while (!b.done() && b.tick < 900) {
  b.step();
  if (b.tick % 10) continue;
  const rows: string[] = [];
  for (const r of b.regiments) {
    if (r.mode !== 'pursue' || !b.soldiers[r.members[0]!]!.s.mounted) continue;
    let n = 0, tg = 0, gap = 0, sp = 0, imp = 0, rt = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      n++;
      sp += Math.hypot(d.vx[id], d.vy[id]) / d.spd[id];
      const t = d.target[id];
      if (t >= 0) {
        tg++;
        gap += Math.hypot(d.x[t] - d.x[id], d.y[t] - d.y[id]);
        if (d.state[t] === State.Routing) rt++;
      }
      if (d.imp[id] > 0.3) imp++;
    }
    rows.push(`K${r.id} n${n} tgt ${tg} (rout ${rt}) gap ${(gap / Math.max(1, tg)).toFixed(1)} sp ${((100 * sp) / Math.max(1, n)).toFixed(0)}% imp ${imp} goal-a ${Math.hypot(r.tx - r.ax, r.ty - r.ay).toFixed(0)} aspd ${(r as any).aspd?.toFixed?.(1)}`);
  }
  const routers = b.soldiers.filter((s) => s.state === State.Routing).length;
  if (rows.length) console.log(`t${b.tick} routers ${routers} kills ${kills} | ${rows.join(' | ')}`);
}
console.log(`kills of routers by riders: ${kills}`);
