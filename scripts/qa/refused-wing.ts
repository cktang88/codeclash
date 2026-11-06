// A refused wing that stays back while the rest of its line fights (QA round 2). For each block of
// the first line under the order 'hold' (the refused wing of `plan === 'refuse'`, REFUSE_UNTIL),
// the seconds it holds while friendly line blocks are locked in melee, and how many of those
// friends broke meanwhile. Also the plain set piece of battle-perf.html `piece=1` (one class
// against one, `plainArmy` at 0 and 200: two blocks a side, 1,300 apart on the v17 field).
//   npx tsx scripts/qa/refused-wing.ts --seeds 1,2,3,4 --men 450 [--pairs] [--piece 1,1]
import { Battle, BATTLE_VERSION } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { plainArmy, only } from '../../src/game/testing.ts';
import { FACTION_IDS, type FactionId } from '../../src/game/factions.ts';
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const MEN = Number(arg('men', '450'));
const PAIRS = process.argv.includes('--pairs');
const PIECE = arg('piece', '');
let battles = 0, withHold = 0;
const rows: string[] = [];
function watch(name: string, b: Battle): void {
  battles++;
  const held = new Map<number, { s: number; broke: number; from: number; plan: string }>();
  const routedAt = new Set<number>();
  while (!b.done() && b.tick < 6000) {
    b.step();
    for (const r of b.regiments) {
      if (r.role !== 'line' || r.line !== 1 || r.alive === 0 || r.routed || r.engaged || r.ord.kind !== 'hold') continue;
      const fighting = b.regiments.filter((o) => o.team === r.team && o.role === 'line' && o.engaged && !o.routed).length;
      if (fighting === 0) continue;
      const e = held.get(r.id) ?? { s: 0, broke: 0, from: b.tick, plan: (b as any).generals[r.team]?.plan ?? '?' };
      e.s += 0.1;
      e.broke = b.regiments.filter((o) => o.team === r.team && o.role === 'line' && o.routed).length;
      held.set(r.id, e);
    }
    for (const o of b.regiments) if (o.routed) routedAt.add(o.id);
  }
  if ([...held.values()].some((e) => e.s >= 10)) withHold++;
  for (const [id, e] of held) if (e.s >= 10) rows.push(`${name} L${id} (t${b.regiments[id]!.team}, plan ${e.plan}) held ${e.s.toFixed(0)} s from t${e.from} while friends fought; ${e.broke} friendly line blocks broke meanwhile; battle ${(b.tick / 10).toFixed(0)} s`);
}
if (PIECE) {
  const [ca, cb] = PIECE.split(',').map(Number);
  for (const s of SEEDS) for (const [fa, fb] of [['templar', 'samurai'], ['samurai', 'templar'], ['undead', 'samurai']] as [FactionId, FactionId][])
    watch(`piece ${ca}v${cb} s${s} ${fa}-${fb}`, new Battle({ version: BATTLE_VERSION, seed: s, kind: 'daily', armies: [plainArmy(only(ca!, 48), 0, fa), plainArmy(only(cb!, 48), 200, fb)] } as any));
} else if (PAIRS) {
  for (const a of FACTION_IDS) for (const c of FACTION_IDS) for (const s of SEEDS) {
    const setup = demoSetup(s, MEN, [a, c]);
    watch(`s${s}/${MEN} ${a.slice(0, 3)}-${c.slice(0, 3)}`, new Battle(setup));
  }
} else for (const s of SEEDS) watch(`s${s}/${MEN}`, new Battle(demoSetup(s, MEN)));
console.log(`battles ${battles}; with a first-line block holding 10 s+ while its friends fight: ${withHold}`);
for (const r of rows) console.log('  ' + r);
