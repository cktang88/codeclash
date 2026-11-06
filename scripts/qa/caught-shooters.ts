// Foot shooters ridden down: how often a block of archers or crossbows (not a screen in front of
// the line) is caught hand to hand by horse, how far the horse was when it turned on them, and
// whether the shooters had moved back toward their own line meanwhile. (QA round 2.)
//   npx tsx scripts/qa/caught-shooters.ts --seeds 1,2,3,4 --men 450 [--pairs]
import { Battle, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { FACTION_IDS, type FactionId } from '../../src/game/factions.ts';
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const MEN = Number(arg('men', '450'));
const PAIRS = process.argv.includes('--pairs');
const CLS = ['heavy', 'spear', 'skirm', 'archer', 'xbow', 'lightcav', 'horsearch', 'knight', 'shock', 'artillery'];
let blocks = 0, caught = 0, lostToHorse = 0, menTotal = 0;
const out: string[] = [];
function run(seed: number, fac?: [FactionId, FactionId]): void {
  const setup = demoSetup(seed, MEN, fac);
  const b = new Battle(setup);
  const name = `s${seed}/${MEN} ${setup.armies[0].faction.slice(0, 3)}-${setup.armies[1].faction.slice(0, 3)}`;
  const shooters = b.regiments.filter((r) => r.role === 'missile');
  blocks += shooters.length;
  for (const r of shooters) menTotal += r.alive;
  const first = new Map<number, number>();
  const watch = new Map<number, { t: number; d: number; ax: number }>();
  const killedBy = new Map<number, number>();
  const hurt0 = (b as any).hurt.bind(b);
  (b as any).hurt = (v: number, amount: number, a: number) => {
    const was = b.soldiers[v]!.state;
    const res = hurt0(v, amount, a);
    const s = b.soldiers[v]!;
    if (was === State.Fighting && s.state !== State.Fighting && a >= 0 && b.regiments[s.reg]!.role === 'missile' && b.soldiers[a]!.s.mounted) killedBy.set(s.reg, (killedBy.get(s.reg) ?? 0) + 1);
    return res;
  };
  while (!b.done()) {
    b.step();
    for (const r of shooters) {
      if (r.alive === 0 || r.routed) continue;
      // The nearest enemy horse (not horse archers) coming at it.
      let best = 1e9;
      for (const o of b.regiments) {
        if (o.team === r.team || o.alive === 0 || o.routed || (o.role !== 'flank' && o.role !== 'shock-cav')) continue;
        const q = Math.hypot(o.cx - r.cx, o.cy - r.cy);
        if (o.targetReg === r.id && q < best) best = q;
      }
      if (best < 300 && !watch.has(r.id)) watch.set(r.id, { t: b.tick, d: best, ax: r.ax });
      if (r.engaged && !first.has(r.id)) {
        let horse = 0, n = 0;
        for (const id of r.members) {
          const t = b.soldiers[id]!.target;
          if (t < 0) continue;
          n++;
          if (b.soldiers[t]!.s.mounted) horse++;
        }
        if (n > 0 && horse >= n * 0.5) {
          first.set(r.id, b.tick);
          const w = watch.get(r.id);
          const dir = r.team === 0 ? 1 : -1;
          out.push(`${name} M${r.id}(t${r.team} ${CLS[r.cls]}) caught by horse at t${b.tick} (${r.mode}/${r.ord.kind}, ${r.alive} men)${w ? `; horse made for it from ${w.d.toFixed(0)} u at t${w.t} (${((b.tick - w.t) / 10).toFixed(1)} s before), it moved ${((r.ax - w.ax) * -dir).toFixed(0)} u back meanwhile` : ''}`);
        }
      }
    }
  }
  caught += first.size;
  for (const v of killedBy.values()) lostToHorse += v;
}
if (PAIRS) for (const a of FACTION_IDS) for (const c of FACTION_IDS) for (const s of SEEDS) run(s, [a, c]);
else for (const s of SEEDS) run(s);
console.log(`foot shooter blocks: ${blocks} (${menTotal} men); caught hand to hand by horse: ${caught} (${((100 * caught) / blocks).toFixed(0)}%); shooters cut down by riders: ${lostToHorse} (${((100 * lostToHorse) / menTotal).toFixed(1)}% of all shooters)`);
for (const l of out) console.log('  ' + l);
