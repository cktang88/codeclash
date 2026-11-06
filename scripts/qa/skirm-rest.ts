// QA round 3 #2: skirmishers fallen back behind their line ('reserve', retired) under arrows.
// Per demo battle: their man-seconds retired, the share of it with arrows falling on them, and
// how many of them die there with no enemy within 30 u (shot).
//   npx tsx scripts/qa/skirm-rest.ts [men] [seed...]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const [men = 450, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3, 4]) {
  const b = new Battle(demoSetup(seed, men));
  const d = (b as any).d;
  let rest = 0, fire = 0, shot = 0, all = 0, start = 0;
  const was = new Uint8Array(b.soldiers.length);
  for (const s of b.soldiers) if (b.regiments[s.reg]!.role === 'skirmish') start++;
  while (!b.done()) {
    b.step();
    for (const r of b.regiments) {
      if (r.role !== 'skirmish' || r.alive === 0) continue;
      const resting = !r.routed && r.retired && (r.mode === 'reserve' || r.mode === 'shoot');
      if (resting) { rest += r.alive / 10; if (r.arrows > 1) fire += r.alive / 10; }
      for (const i of r.members) {
        if (d.state[i] === State.Dead && !was[i]) {
          was[i] = 1; all++;
          if (resting) { let near = false; b.near(d.x[i], d.y[i], 30, (o) => { if (o.team !== d.team[i] && o.state === State.Fighting) near = true; }); if (!near) shot++; }
        }
      }
    }
  }
  console.log(`seed ${seed}/${men}: skirmishers ${start}, dead ${all}; retired ${rest.toFixed(0)} man-s, under arrows ${fire.toFixed(0)} (${((100 * fire) / Math.max(1, rest)).toFixed(0)}%), shot dead while retired ${shot}`);
}
