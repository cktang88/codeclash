// Prints one block's anchor, centre, facing, mode, order and its side's front every half second.
//   npx tsx scripts/qa/trace-block.ts <seed> <men> <regId> [fromTick] [toTick] [fa fb]
import { Battle } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import type { FactionId } from '../../src/game/factions.ts';
const [seed, men, id, from = 0, to = 3600] = process.argv.slice(2, 7).map(Number);
const fa = process.argv[7] as FactionId | undefined;
const fb = process.argv[8] as FactionId | undefined;
const b = new Battle(demoSetup(seed!, men!, fa ? [fa, fb ?? null] : undefined));
const r = b.regiments[id!]!;
const ts = (b as any).ts;
console.log(`block ${id} team ${r.team} cls ${r.cls} role ${r.role} start ${r.start}`);
while (!b.done() && b.tick < to!) {
  b.step();
  if (b.tick >= from! && b.tick % 5 === 0)
    console.log(`t${b.tick} ax ${r.ax.toFixed(0)},${r.ay.toFixed(0)} c ${r.cx.toFixed(0)},${r.cy.toFixed(0)} goal ${r.tx.toFixed(0)},${r.ty.toFixed(0)} f ${r.fx.toFixed(2)},${r.fy.toFixed(2)} ${r.mode}/${r.order} tgt ${r.targetReg} eng ${r.engaged ? 1 : 0} alive ${r.alive} ammo ${r.ammoLeft} front ${ts[r.team].frontX.toFixed(0)} efront ${ts[1 - r.team].frontX.toFixed(0)} loosed ${r.loosed} short ${r.short}`);
}
