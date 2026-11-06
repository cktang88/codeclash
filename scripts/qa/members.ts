// A block's first members every 2 s: state, place, slot, velocity, target.
//   npx tsx scripts/qa/members.ts <seed> <men> <regId> <fromTick> <toTick>
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
const [seed, men, id, t0, t1] = process.argv.slice(2).map(Number);
const b = new Battle(demoSetup(seed!, men!));
const r = b.regiments[id!]!;
const d = (b as any).d;
while (b.tick < t1!) { b.step(); if (b.tick >= t0! && b.tick % 20 === 0) {
  const ms = r.members.filter((i) => d.state[i] < 2);
  const gx = (i: number) => r.ax + r.fx * d.sy[i] - r.fy * d.sx[i];
  const gy = (i: number) => r.ay + r.fy * d.sy[i] + r.fx * d.sx[i];
  console.log(b.tick, r.mode, 'ax', r.ax.toFixed(0), r.ay.toFixed(0), ms.slice(0, 8).map((i) => `${i}:st${d.state[i]} p${d.x[i].toFixed(0)},${d.y[i].toFixed(0)} slot${gx(i).toFixed(0)},${gy(i).toFixed(0)} v${d.vx[i].toFixed(0)},${d.vy[i].toFixed(0)} t${d.target[i]} cu${d.cu[i]} wd${d.wd[i]}`).join(' | '));
} }
