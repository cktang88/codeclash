// Which blocks make first contact in each demo battle, and when.
//   npx tsx scripts/qa/first-contact.ts
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
for (const men of [450, 1200, 2800]) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const b = new Battle(demoSetup(seed, men));
  while (b.tick < 900 && !b.regiments.some((r) => r.engaged)) b.step();
  const e = b.regiments.filter((r) => r.engaged);
  console.log(seed, men, b.tick, e.map((r) => `${r.role}${r.id} t${r.team} ${r.mode} vs ${r.targetReg}:${b.regiments[r.targetReg]?.role}`).join('; '));



}
