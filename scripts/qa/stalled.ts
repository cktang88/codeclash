// QA round 3 #4: formed foot that cannot get where it is going. Per demo battle: block-seconds
// (and man-seconds) of foot blocks not in a fight, in advance/reserve/hold, whose goal is 40 u+
// off and whose anchor moved under 12 u in the last 5 s (a march goes 55); the longest such stall, and who held it up.
//   npx tsx scripts/qa/stalled.ts [men] [seed...]
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const [men = 450, ...seeds] = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3, 4]) {
  const b = new Battle(demoSetup(seed, men));
  const B = b as any;
  const hist = new Map<number, [number, number][]>();
  const run = new Map<number, number>();
  const by = new Map<string, number>();
  let blockS = 0, manS = 0, longest = 0, worst = '';
  while (!b.done()) {
    b.step();
    if (b.tick % 10) continue;
    for (const r of b.regiments) {
      if (r.alive === 0 || r.routed || (r.role !== 'line' && r.role !== 'missile')) continue;
      const h = hist.get(r.id) ?? [];
      h.push([r.ax, r.ay]);
      if (h.length > 6) h.shift();
      hist.set(r.id, h);
      const far = Math.hypot(r.tx - r.ax, r.ty - r.ay) > 40;
      const moved = h.length === 6 ? Math.hypot(h[5]![0] - h[0]![0], h[5]![1] - h[0]![1]) : 99;
      if (!r.engaged && !r.contact && far && moved < 12 && (r.mode === 'advance' || r.mode === 'reserve' || r.mode === 'hold')) {
        blockS++; manS += r.alive;
        // Who is in its way: a friend its next step toward the goal would walk into.
        const gq = Math.hypot(r.tx - r.ax, r.ty - r.ay) || 1;
        const pen = B.crowded(r, r.ax + ((r.tx - r.ax) / gq) * 3, r.ay + ((r.ty - r.ay) / gq) * 3, r.fx, r.fy, true);
        if (pen > 0) { const o = b.regiments[B.gWho]!; const k = `${o.role}${o.stance === 'loose' ? '(loose)' : ''}`; by.set(k, (by.get(k) ?? 0) + 1); } else by.set('nobody', (by.get('nobody') ?? 0) + 1);
        const k = (run.get(r.id) ?? 0) + 1;
        run.set(r.id, k);
        if (k > longest) {
          longest = k;
          const pen = B.crowded(r, r.ax, r.ay, r.fx, r.fy, true);
          worst = `${r.role}${r.id} ${r.mode}/${r.ord.kind} t${b.tick} at ${r.ax.toFixed(0)},${r.ay.toFixed(0)} goal ${r.tx.toFixed(0)},${r.ty.toFixed(0)} by ${pen > -1 && B.gWho >= 0 ? b.regiments[B.gWho]!.role + B.gWho + ':' + b.regiments[B.gWho]!.mode : '-'}`;
        }
      } else run.delete(r.id);
    }
  }
  console.log(`seed ${seed}/${men}: stalled foot ${blockS} block-s, ${manS} man-s; longest ${longest} s (${worst}); in its way: ${[...by].map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
