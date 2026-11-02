// Prints a battle as it unfolds: every 10 s each side's regiments (role, mode, stance, order,
// morale, men), and the events between. `pnpm tsx scripts/battle-trace.ts [men] [seed]`.
import { Battle, BATTLE_VERSION, State, type ArmySpec } from '../src/game/battle.ts';
import { UNIT_COUNT } from '../src/game/units.ts';

const men = Number(process.argv[2] ?? 500);
const seed = Number(process.argv[3] ?? 1);
const every = Number(process.argv[4] ?? 100);
const mix = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, hue: number): ArmySpec => ({ name: 'x', faction: 'templar', hue, counts: mix.map((f) => Math.round(n * f)), veterans: new Array(UNIT_COUNT).fill(0), moraleBonus: 3, pavise: 0.1, stakes: true, commander: true });
const custom = (spec: string): ArmySpec => {
  // "5:82,7:49,0:33" = class:count pairs
  const a = army(0, 0);
  for (const kv of spec.split(',')) {
    const [k, v] = kv.split(':').map(Number);
    a.counts[k!] = v!;
  }
  return a;
};
const A = process.argv[5] ? custom(process.argv[5]) : army(men, 0);
const B = process.argv[6] ? { ...custom(process.argv[6]), hue: 200 } : army(men, 200);
const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [A, B] });
console.log('generals', b.generals.map((g) => `${g.personality} skill ${g.skill.toFixed(2)}${g.rashKnights ? ' rash' : ''}`).join(' | '));
let ev = 0;
const short = { line: 'L', missile: 'M', skirmish: 'S', flank: 'C', 'shock-cav': 'K', 'horse-archer': 'H', siege: 'A', command: 'G' } as Record<string, string>;
while (!b.done() && b.tick < 3600) {
  b.step();
  for (; ev < b.events.length; ev++) {
    const e = b.events[ev]!;
    const r = e.reg !== undefined && e.reg >= 0 ? (b.regiments[e.reg] ?? null) : null;
    console.log(`  ${(e.tick / 10).toFixed(1)}s t${e.team} ${e.kind} ${r ? short[r.role]! + r.id : ''} ${e.stance ?? ''} ${e.plan ?? ''} ${e.note ?? ''}`);
  }
  if (b.tick % every === 0) {
    for (let t = 0; t < 2; t++) {
      const f = b.soldiers.filter((s) => s.team === t);
      const n = (st: State) => f.filter((s) => s.state === st).length;
      console.log(`${(b.tick / 10).toFixed(0)}s t${t} fight ${n(State.Fighting)} rout ${n(State.Routing)} dead ${n(State.Dead)} fled ${n(State.Fled)}`);
      console.log('   ' + b.regiments.filter((r) => r.team === t && r.alive > 0).map((r) => `${short[r.role]}${r.id}:${r.mode}/${r.stance}/${r.order}:${r.morale.toFixed(0)}${r.moraleState[0]}:${r.alive}@${r.cx.toFixed(0)},${r.cy.toFixed(0)}`).join(' '));
    }
  }
}
console.log(JSON.stringify(b.result ?? b.run(0)).slice(0, 200));
