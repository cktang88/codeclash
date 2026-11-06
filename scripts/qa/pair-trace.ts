// Two friendly blocks on one enemy block: per second, their modes, anchors' distance, and the
// share of A's riders knee to knee with B's (QA round 2 leftover 5).
//   npx tsx scripts/qa/pair-trace.ts <seed> <men> <A> <B> [from] [to]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const [seed, men, A, B, from = 0, to = 3600] = process.argv.slice(2).map(Number);
const b = new Battle(demoSetup(seed!, men!));
const d = (b as any).d;
const ra = b.regiments[A!]!, rb = b.regiments[B!]!;
while (!b.done() && b.tick < to!) {
  b.step();
  if (b.tick < from! || b.tick % 10) continue;
  let n = 0, mg = 0, tA = 0;
  for (const a of ra.members) {
    if (d.state[a] !== State.Fighting) continue;
    n++;
    if (d.target[a] >= 0) tA++;
    let best = 1e9;
    for (const c of rb.members) {
      if (d.state[c] !== State.Fighting) continue;
      best = Math.min(best, Math.hypot(d.x[a] - d.x[c], d.y[a] - d.y[c]) / (d.rad[a] + d.rad[c]));
    }
    if (best < 1.5) mg++;
  }
  const T = ra.targetReg >= 0 ? b.regiments[ra.targetReg]! : null;
  console.log(`t${b.tick} A ${ra.mode} tgt ${ra.targetReg} eng ${ra.engaged ? 1 : 0} alive ${ra.alive} w ${ra.width.toFixed(0)} | B ${rb.mode} tgt ${rb.targetReg} eng ${rb.engaged ? 1 : 0} alive ${rb.alive} w ${rb.width.toFixed(0)} | anchors ${Math.hypot(ra.ax - rb.ax, ra.ay - rb.ay).toFixed(0)} goals ${Math.hypot(ra.tx - rb.tx, ra.ty - rb.ty).toFixed(0)} centres ${Math.hypot(ra.cx - rb.cx, ra.cy - rb.cy).toFixed(0)} | knee ${mg}/${n} (A with foe ${tA}) | T ${T ? `${T.mode} alive ${T.alive}` : '-'}`);
}
