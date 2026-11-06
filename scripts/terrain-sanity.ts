// What the ground does, in numbers (battle v17 terrain; set pieces in src/game/terrain-pieces.ts).
//   npx tsx scripts/terrain-sanity.ts
import { archersEdge, chargeAt, crossing, hillFight, holdCrest, horseAtWood, march, volley } from '../src/game/terrain-pieces.ts';

const f = (o: object) => Object.entries(o).map(([k, v]) => `${k} ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`).join(', ');
console.log('march 260 east, heavy foot:');
for (const g of ['flat', 'up', 'wood', 'stream'] as const) console.log(`  ${g.padEnd(6)} ${f(march(g))}`);
console.log('march 260 east, light horse:');
for (const g of ['flat', 'up', 'wood', 'stream'] as const) console.log(`  ${g.padEnd(6)} ${f(march(g, true))}`);
console.log('60 heavy foot attack 60 holding (6 seeds):');
for (const g of ['flat', 'hill', 'below'] as const) {
  let w = 0;
  let da = 0;
  let db = 0;
  for (let s = 1; s <= 6; s++) {
    const r = hillFight(g, s);
    if (r.winner === 0) w++;
    da += r.deadA;
    db += r.deadB;
  }
  console.log(`  holder ${g === 'hill' ? 'on the hill' : g === 'below' ? 'below it' : 'on the flat'}: attacker wins ${w}/6, dead attacker ${da} holder ${db}`);
}
console.log('16 knights charge 48 heavy foot (foot hp lost in 2 s from contact, impetus on contact; seeds 1-4):');
for (const g of ['flat', 'down', 'wood'] as const) {
  let hp = 0;
  let im = 0;
  for (let s = 1; s <= 4; s++) {
    const r = chargeAt(g, s);
    hp += r.hpLost / 4;
    im += r.impetus / 4;
  }
  console.log(`  ${g.padEnd(5)} hpLost ${hp.toFixed(0)}, impetus ${im.toFixed(2)}`);
}
console.log('60 archers at 60 heavy foot, both holding:');
for (const gap of [400, 610]) for (const g of ['flat', 'edge', 'deep', 'below', 'above'] as const) {
  const v = [1, 2, 3, 4].map((s) => volley(g, gap, s));
  console.log(`  gap ${gap} target ${g.padEnd(5)} first shot at ${v.map((x) => x.first).join('/')}, hp lost ${(v.reduce((a, x) => a + x.hpLost, 0) / 4).toFixed(0)} (mean of 4)`);
}
console.log('crossing a stream to a point 400 east:');
for (const fire of [false, true]) {
  console.log(`  ${fire ? 'under fire' : 'no fire'}, no ford: ${f(crossing(false, fire))}`);
  console.log(`  ${fire ? 'under fire' : 'no fire'}, a ford 250 aside: ${f(crossing(true, fire))}`);
}
console.log(`holding foot, crest 160 ahead: ${f(holdCrest())}`);
console.log(`holding archers, a wood beside them: ${f(archersEdge())}`);
console.log(`light horse sent at foot in a wood: deepest rider in it ${horseAtWood().toFixed(0)}`);
