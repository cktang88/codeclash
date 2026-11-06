// When and where the undead Lich-Marshal falls: his last 12 s (mode, household left, x ahead of his own line, foes within 80).
//   npx tsx scripts/qa/lich-deaths.ts
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
for (const men of [450, 1200]) for (const seed of [1, 2, 3, 4]) for (const fb of ['templar', 'samurai'] as const) {
  const b = new Battle(demoSetup(seed, men, ['undead', fb]));
  const g = b.regiments.find((r) => r.team === 0 && r.role === 'command')!;
  const ts = (b as any).ts;
  const log: string[] = [];
  while (!b.done() && g.alive > 0) {
    b.step();
    if (b.tick % 20 === 0) {
      const foes = b.regiments.filter((o) => o.team === 1 && o.alive > 0 && !o.routed && Math.hypot(o.cx - g.cx, o.cy - g.cy) < 80).map((o) => `${o.role}${o.id}:${o.mode}`);
      log.push(`t${b.tick} ${g.mode} alive${g.alive} x-front ${(g.cx - ts[0].frontX).toFixed(0)} eng${g.engaged ? 1 : 0} foes[${foes.join(',')}]`);
    }
  }
  if (g.alive === 0) console.log(`s${seed}/${men} vs ${fb}: Lich fell t${b.tick} brokenAt ${b.brokenAt}\n   ` + log.slice(-6).join('\n   '));
}
