// Horse in pursuit: do riders cut down the men they chase, or ride at their heels? (QA round 2.)
// Over demo battles (and the knights-on-archers set piece), for every rider of a horse block in
// 'pursue' mode, each tick: "at heels" when a routing enemy is within 12 u of him; his speed
// against his top speed; and the routing men killed by riders. Reports rider-seconds at heels,
// kills per rider-minute at heels, and the riders' mean speed share while at heels.
//   npx tsx scripts/qa/pursuit.ts --seeds 1,2,3,4 --men 450 [--pairs] [--piece]
import { Battle, BATTLE_VERSION, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { plainArmy, only } from '../../src/game/testing.ts';
import { FACTION_IDS, type FactionId } from '../../src/game/factions.ts';
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const MEN = Number(arg('men', '450'));
let heels = 0, kills = 0, spShare = 0, footHeels = 0, footKills = 0;
function watch(b: Battle): void {
  const hurt0 = (b as any).hurt.bind(b);
  (b as any).hurt = (v: number, amount: number, a: number) => {
    const was = b.soldiers[v]!.state;
    const res = hurt0(v, amount, a);
    if (was === State.Routing && a >= 0 && b.soldiers[v]!.state !== State.Routing && b.soldiers[v]!.state !== State.Fighting) {
      if (b.soldiers[a]!.s.mounted) kills++;
      else footKills++;
    }
    return res;
  };
  while (!b.done()) {
    b.step();
    for (const s of b.soldiers) {
      if (s.state !== State.Fighting) continue;
      const r = b.regiments[s.reg]!;
      if (r.mode !== 'pursue') continue;
      let near = false;
      b.near(s.x, s.y, 12, (o) => {
        if (o.team !== s.team && o.state === State.Routing) near = true;
      });
      if (!near) continue;
      if (s.s.mounted) {
        heels += 0.1;
        spShare += (0.1 * Math.hypot(s.vx, s.vy)) / s.s.speed;
      } else footHeels += 0.1;
    }
  }
}
if (process.argv.includes('--piece')) {
  for (const s of SEEDS) watch(new Battle({ version: BATTLE_VERSION, seed: s, kind: 'daily', armies: [plainArmy(only(7, 48), 0, 'templar'), plainArmy(only(3, 48), 200, 'samurai')] } as any));
} else if (process.argv.includes('--pairs')) {
  for (const a of FACTION_IDS) for (const c of FACTION_IDS) for (const s of SEEDS) watch(new Battle(demoSetup(s, MEN, [a, c] as [FactionId, FactionId])));
} else for (const s of SEEDS) watch(new Battle(demoSetup(s, MEN)));
console.log(`riders at a router's heels (within 12 u, pursuing): ${heels.toFixed(0)} rider-s, mean speed ${((100 * spShare) / Math.max(1e-9, heels)).toFixed(0)}% of top; routers killed by riders: ${kills} (${((60 * kills) / Math.max(1e-9, heels)).toFixed(1)} per rider-minute at heels)`);
console.log(`foot at a router's heels: ${footHeels.toFixed(0)} man-s; routers killed by foot: ${footKills} (${((60 * footKills) / Math.max(1e-9, footHeels)).toFixed(1)} per man-minute at heels)`);
