// Why are loaded foot shooters silent? (QA round 2, leftover 1.) For every foot missile block
// (archers, crossbows; not horse archers nor engines), every tick: if it has a loaded man (ammo,
// cooldown 0) and an enemy block (not routed) whose nearest man is within its range, the tick is
// "could shoot". Each such tick is put in one bucket, by what the block is doing:
//   loosed        it loosed a shot this tick or in the last reload (not silent)
//   walking       mode advance / hold / reserve... (not shoot): marching (to its spot, or with the line)
//   no-target     mode shoot but no target block
//   danger        mode shoot, target, and its men held for danger close (dangerShots rose)
//   blocked       mode shoot, target, friends on the line (blockedShots rose)
//   short         mode shoot, target out of reach of the men who tried (short rose)
//   engaged-tgt   its target is in melee (flat shot waits)
//   other         none of these, split: 'shuffling' (the block moved within 0.2 s, so its volley
//                 clock restarts), 'clock waits, most loaded' (the next volley is over 0.8 s off
//                 though over 60 % of the men are loaded: they held their last shot), 'clock waits',
//                 'beat'
// Read-only: it only watches.
//   npx tsx scripts/qa/missile-silence.ts --seeds 1,2,3,4 --men 450 [--factions templar,samurai] [--verbose]
import { Battle, type Regiment } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import type { FactionId } from '../../src/game/factions.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const MEN = Number(arg('men', '450'));
const FAC = arg('factions', '');
const VERBOSE = process.argv.includes('--verbose');
const CLS = ['heavy', 'spear', 'skirm', 'archer', 'xbow', 'lightcav', 'horsearch', 'knight', 'shock', 'artillery'];

const total: Record<string, Record<string, number>> = {};
for (const seed of SEEDS) {
  const setup = demoSetup(seed, MEN, FAC ? (FAC.split(',') as [FactionId, FactionId]) : undefined);
  const b = new Battle(setup);
  const d = (b as any).d;
  const shooters = b.regiments.filter((r) => r.role === 'missile');
  const prev = new Map<number, { danger: number; blocked: number; short: number; loosed: number; lastShot: number }>();
  for (const r of shooters) prev.set(r.id, { danger: 0, blocked: 0, short: 0, loosed: 0, lastShot: -999 });
  const per: Record<number, Record<string, number>> = {};
  const walkSpots: Record<number, { from: number; to: number; mode: string; dist: number }[]> = {};
  while (!b.done()) {
    b.step();
    for (const r of shooters) {
      const p = prev.get(r.id)!;
      const dd = r.dangerShots - p.danger, db = r.blockedShots - p.blocked, ds = r.short - p.short, dl = r.loosed - p.loosed;
      p.danger = r.dangerShots;
      p.blocked = r.blockedShots;
      p.short = r.short;
      p.loosed = r.loosed;
      if (dl > 0) p.lastShot = b.tick;
      if (r.alive === 0 || r.routed || r.engaged) continue;
      const st = b.soldiers[r.members[0]!]?.s;
      if (!st || !st.range) continue;
      let loaded = 0;
      for (const id of r.members) if (d.ammo[id] > 0 && d.cd[id] === 0 && d.state[id] === 0) loaded++;
      if (loaded === 0) continue;
      // An enemy (not routed) whose nearest man to our centre is in range.
      let near = Infinity;
      let freeNear = Infinity;
      for (const o of b.regiments) {
        if (o.team === r.team || o.alive === 0 || o.routed) continue;
        let best = Infinity;
        for (const id of o.members) {
          if (d.state[id] !== 0) continue;
          const q = Math.hypot(d.x[id] - r.cx, d.y[id] - r.cy);
          if (q < best) best = q;
        }
        if (best < near) near = best;
        if (!o.engaged && best < freeNear) freeNear = best;
      }
      if (near > st.range * 0.95) continue;
      const reload = (st.reload ?? 30) + 6;
      let k: string;
      if (b.tick - p.lastShot <= reload) k = 'loosed';
      else if (r.mode !== 'shoot' && r.mode !== 'kite') k = `walking(${r.mode})`;
      else if (r.targetReg < 0) k = 'no-target';
      else if (dd > 0) k = 'danger';
      else if (db > 0) k = 'blocked';
      else if (ds > 0) k = 'short';
      else if (b.regiments[r.targetReg]!.engaged) k = 'engaged-tgt';
      else {
        // What holds it: the block shuffling (its volley clock restarts each tick it moves), the
        // volley clock still running after a volley most of its men held back from, or a beat.
        const share = loaded / Math.max(1, r.alive);
        if (b.tick - r.movedAt <= 2) k = 'other: shuffling (clock restarts)';
        else if (r.volleyAt - b.tick > 8 && share > 0.6) k = 'other: clock waits, most loaded';
        else if (r.volleyAt - b.tick > 8) k = 'other: clock waits';
        else k = 'other: beat';
      }
      if (k !== 'loosed') k += freeNear <= st.range * 0.95 ? ' [free foe in range]' : ' [only engaged foes]';
      const pr = (per[r.id] ??= {});
      pr[k] = (pr[k] ?? 0) + 1;
      const key = `${CLS[r.cls]}`;
      const t = (total[key] ??= {});
      t[k] = (t[k] ?? 0) + 1;
      if (k.startsWith('walking')) {
        const w = (walkSpots[r.id] ??= []);
        const last = w[w.length - 1];
        if (last && last.to >= b.tick - 2) last.to = b.tick;
        else w.push({ from: b.tick, to: b.tick, mode: r.mode, dist: near });
      }
    }
  }
  if (VERBOSE) {
    console.log(`\n== seed ${seed} / ${MEN} ${setup.armies[0].faction}-${setup.armies[1].faction}, ${b.tick} ticks`);
    for (const r of shooters) {
      const pr = per[r.id];
      if (!pr) continue;
      const sum = Object.values(pr).reduce((a, c) => a + c, 0);
      const parts = Object.entries(pr).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / sum).toFixed(0)}%`);
      console.log(`  M${r.id} t${r.team} ${CLS[r.cls]} could-shoot ${(sum / 10).toFixed(0)} s: ${parts.join(', ')}`);
      for (const w of (walkSpots[r.id] ?? []).filter((w) => w.to - w.from >= 30)) console.log(`     walking ${w.mode} t${w.from}-${w.to} (${((w.to - w.from) / 10).toFixed(0)} s), nearest foe ${w.dist.toFixed(0)}`);
    }
  }
}
console.log(`\n=== share of "could shoot" ticks by cause, seeds ${SEEDS.join(',')} / ${MEN}${FAC ? ' ' + FAC : ''} ===`);
for (const [cls, t] of Object.entries(total)) {
  const sum = Object.values(t).reduce((a, c) => a + c, 0);
  console.log(`${cls}: ${(sum / 10).toFixed(0)} block-seconds`);
  for (const [k, v] of Object.entries(t).sort((a, c) => c[1] - a[1])) console.log(`   ${k.padEnd(44)} ${((100 * v) / sum).toFixed(1).padStart(5)}%`);
}
