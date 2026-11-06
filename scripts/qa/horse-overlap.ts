// Friendly horse blocks that go for the same enemy horse: do their riders run into each other?
// (QA round 2, leftover 5.) For each pair of friendly horse blocks (not the household) with the
// same target block and at least one of them charging or in melee, each tick: the share of A's
// riders with a rider of B within 0.8 of the two radii summed (standing in him: stacked), and
// within 1.5 (knee to knee: the blocks have merged at the edge), plus the distance of the two
// anchors. Read-only.
//   npx tsx scripts/qa/horse-overlap.ts --seeds 1,2,3,4 --men 450 [--factions a,b]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import type { FactionId } from '../../src/game/factions.ts';
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const MEN = Number(arg('men', '450'));
const FAC = arg('factions', '');
let pairTicks = 0, riderTicks = 0, stacked = 0, merged = 0;
const worst: { k: string; v: number; note: string }[] = [];
for (const seed of SEEDS) {
  const b = new Battle(demoSetup(seed, MEN, FAC ? (FAC.split(',') as [FactionId, FactionId]) : undefined));
  const d = (b as any).d;
  const horse = b.regiments.filter((r) => (r.role === 'flank' || r.role === 'shock-cav') && true);
  const ep = new Map<string, { n: number; m: number; s: number; first: number; note: string }>();
  while (!b.done()) {
    b.step();
    for (let i = 0; i < horse.length; i++)
      for (let j = i + 1; j < horse.length; j++) {
        const A = horse[i]!, B = horse[j]!;
        if (A.team !== B.team || A.alive === 0 || B.alive === 0 || A.routed || B.routed) continue;
        if (A.targetReg < 0 || A.targetReg !== B.targetReg) continue;
        const T = b.regiments[A.targetReg]!;
        if (T.role !== 'flank' && T.role !== 'shock-cav' && T.role !== 'horse-archer' && T.role !== 'command') continue;
        if (!['charge', 'melee'].includes(A.mode) && !['charge', 'melee'].includes(B.mode)) continue;
        pairTicks++;
        let st = 0, mg = 0, n = 0;
        for (const a of A.members) {
          if (d.state[a] !== State.Fighting) continue;
          n++;
          const ra = b.soldiers[a]!.s.radius;
          let best = 1e9;
          for (const c of B.members) {
            if (d.state[c] !== State.Fighting) continue;
            const q = Math.hypot(d.x[a] - d.x[c], d.y[a] - d.y[c]) / (ra + b.soldiers[c]!.s.radius);
            if (q < best) best = q;
          }
          if (best < 0.8) st++;
          if (best < 1.5) mg++;
        }
        riderTicks += n;
        stacked += st;
        merged += mg;
        const key = `s${seed} ${A.id}+${B.id}>${T.id}`;
        const e = ep.get(key) ?? { n: 0, m: 0, s: 0, first: b.tick, note: '' };
        e.n += n;
        e.m += mg;
        e.s += st;
        if (mg / Math.max(1, n) >= (e.m - mg) / Math.max(1, e.n - n)) e.note = `t${b.tick} ${A.mode}/${B.mode} anchors ${Math.hypot(A.ax - B.ax, A.ay - B.ay).toFixed(0)} u apart, ${mg}/${n} knee to knee, ${st} stacked`;
        ep.set(key, e);
      }
  }
  for (const [k, e] of ep) worst.push({ k, v: e.m / Math.max(1, e.n), note: `from t${e.first}: ${(100 * e.m / Math.max(1, e.n)).toFixed(1)}% knee to knee, ${(100 * e.s / Math.max(1, e.n)).toFixed(1)}% stacked over ${(e.n / 10).toFixed(0)} rider-s; e.g. ${e.note}` });
}
console.log(`pairs of friendly horse on the same enemy horse: ${(pairTicks / 10).toFixed(0)} pair-seconds`);
console.log(`riders with a rider of the other block knee to knee (<1.5 radii): ${((100 * merged) / Math.max(1, riderTicks)).toFixed(1)}%; inside him (<0.8): ${((1000 * stacked) / Math.max(1, riderTicks)).toFixed(2)}‰`);
for (const w of worst.sort((a, c) => c.v - a.v).slice(0, 10)) console.log(`  ${w.k}: ${w.note}`);
