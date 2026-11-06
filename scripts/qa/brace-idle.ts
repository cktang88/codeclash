// QA round 3 #2: spears standing braced while enemy horse fights a friend beside them. Per demo
// battle: man-seconds of foot blocks in 'brace' whose nearest enemy horse within 60 u (edge to
// edge) is locked in a melee with another of our blocks (not riding at this one), and the same
// for any brace at all. Also (QA3 round 3, the extra case) braced with no horse coming: none within 150
// riding at this block or closing on it (its centre nearing at 5 u/s and more) and none within 40, and
// of that, man-seconds braced under arrows.
//   npx tsx scripts/qa/brace-idle.ts [men] [seed...]
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const [men = 450, ...seeds] = process.argv.slice(2).map(Number);
const isCav = (role: string) => role === 'flank' || role === 'shock-cav' || role === 'horse-archer' || role === 'command';
for (const seed of seeds.length ? seeds : [1, 2, 3, 4]) {
  const b = new Battle(demoSetup(seed, men));
  let brace = 0, idle = 0, longest = 0, noneComing = 0, underFire = 0;
  const last = new Map<number, [number, number]>();
  const run = new Map<number, number>();
  while (!b.done()) {
    b.step();
    if (b.tick % 10) continue;
    const now = new Map(b.regiments.map((o) => [o.id, [o.cx, o.cy] as [number, number]]));
    for (const r of b.regiments) {
      if (r.alive === 0 || r.routed || r.mode !== 'brace') { run.delete(r.id); continue; }
      brace += r.alive;
      let coming = false;
      for (const o of b.regiments) {
        if (o.team === r.team || o.alive === 0 || o.routed || !isCav(o.role) || o.role === 'horse-archer') continue;
        const c = Math.hypot(o.cx - r.cx, o.cy - r.cy);
        const q = c - o.radius - r.radius;
        const prev = last.get(o.id);
        const closing = prev ? (Math.hypot(prev[0] - r.cx, prev[1] - r.cy) - c) : 0;
        if (q < 40 || (q < 150 && ((o.targetReg === r.id && o.mode !== 'withdraw' && o.mode !== 'pursue') || closing > 5))) coming = true;
      }
      if (!coming) { noneComing += r.alive; if (r.arrows > 1) underFire += r.alive; }
      let best = null as null | (typeof r), bd = 60;
      for (const o of b.regiments) {
        if (o.team === r.team || o.alive === 0 || o.routed || !isCav(o.role)) continue;
        const q = Math.hypot(o.cx - r.cx, o.cy - r.cy) - o.radius - r.radius;
        if (q < bd) { bd = q; best = o; }
      }
      if (best && best.mode === 'melee' && best.targetReg !== r.id && best.engaged) {
        idle += r.alive;
        run.set(r.id, (run.get(r.id) ?? 0) + 1);
        longest = Math.max(longest, run.get(r.id)!);
      } else run.delete(r.id);
    }
    for (const [k, v] of now) last.set(k, v);
  }
  console.log(`seed ${seed}/${men}: braced ${brace} man-s; of it with the horse fighting a friend ${idle} (${((100 * idle) / Math.max(1, brace)).toFixed(0)}%), longest ${longest} s; with no horse coming ${noneComing} (${((100 * noneComing) / Math.max(1, brace)).toFixed(0)}%), under arrows ${underFire}`);
}
