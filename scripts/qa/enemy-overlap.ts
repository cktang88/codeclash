// How deep enemies stand inside each other (centres closer than k of their radii summed), by the
// pair's kind (horse-horse, horse-foot, foot-foot), per 1000 man-samples of men with a foe within 10.
//   npx tsx scripts/qa/enemy-overlap.ts [--seeds 1,2,3] [--sizes 450,1200]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const seeds = arg('seeds', '1,2,3,4').split(',').map(Number);
const sizes = arg('sizes', '450,1200').split(',').map(Number);
const tally: Record<string, [number, number]> = {};
const worst: { k: string; battle: string; tick: number; depth: number; a: number; b: number }[] = [];
for (const men of sizes) for (const seed of seeds) {
  const b = new Battle(demoSetup(seed, men));
  while (!b.done()) {
    b.step();
    if (b.tick % 5) continue;
    for (const s of b.soldiers) {
      if (s.state !== State.Fighting) continue;
      let deep = 0;
      let kind = '';
      let other = -1;
      let any = false;
      b.near(s.x, s.y, 10, (o, d2) => {
        if (o.team === s.team || o.state !== State.Fighting || o.id < 0) return;
        any = true;
        const sum = s.s.radius + o.s.radius;
        const dep = 1 - Math.sqrt(d2) / sum;
        if (dep > deep) { deep = dep; other = o.id; kind = (s.s.mounted ? 'H' : 'F') + (o.s.mounted ? 'H' : 'F'); }
      });
      if (!any) continue;
      const k = (s.s.mounted ? 'horse' : 'foot');
      tally[k] ??= [0, 0];
      tally[k]![1]++;
      if (deep > 0.4) {
        tally[k]![0]++;
        if (deep > 0.6 && worst.length < 400) worst.push({ k: kind, battle: `s${seed}/${men}`, tick: b.tick, depth: deep, a: s.id, b: other });
      }
    }
  }
}
for (const [k, [h, n]] of Object.entries(tally)) console.log(`${k}: ${((1000 * h) / n).toFixed(1)} per 1000 samples (with a foe within 10) stand over 40% inside an enemy`);
const byKind: Record<string, number> = {};
for (const w of worst) byKind[w.k] = (byKind[w.k] ?? 0) + 1;
console.log('over 60% inside, by pair (first 400):', byKind);
for (const w of worst.slice(0, 10)) console.log(`  ${w.battle} t${w.tick} ${w.k} ${w.a}<->${w.b} ${(w.depth * 100).toFixed(0)}% inside`);
