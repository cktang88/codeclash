// Which horse stand idle near the enemy, when and doing what? (QA round 2, leftover 2.)
// The cavalry-sanity "idle" test (a rider under 15 % of his speed for 2 s+, no foe in reach, an
// enemy within 40), per block and per 1 s window, with the block's mode, its target, and what the
// nearest enemy is (and whether he is already fighting one of ours).
//   npx tsx scripts/qa/cav-idle.ts <seed> <men> [fa fb]
import { Battle, State, type Soldier } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import type { FactionId } from '../../src/game/factions.ts';
const [seed, men] = process.argv.slice(2, 4).map(Number);
const fac = process.argv[4] ? ([process.argv[4], process.argv[5]] as [FactionId, FactionId]) : undefined;
const b = new Battle(demoSetup(seed!, men!, fac));
const CLS = ['heavy', 'spear', 'skirm', 'archer', 'xbow', 'lightcav', 'horsearch', 'knight', 'shock', 'artillery'];
const still = new Map<number, number>();
const rows = new Map<string, { n: number; note: string }>();
const byBlock = new Map<number, number>();
while (!b.done()) {
  b.step();
  for (const s of b.soldiers) {
    if (s.state !== State.Fighting || !s.s.mounted) continue;
    const r = b.regiments[s.reg]!;
    if (r.role === 'command') continue;
    let near: Soldier | null = null;
    let nd = 1e9;
    let inReach = false;
    b.near(s.x, s.y, 40, (o: Soldier, d2: number) => {
      if (o.team === s.team || o.state !== State.Fighting) return;
      if (d2 < nd) {
        nd = d2;
        near = o;
      }
      const reach = s.s.radius + o.s.radius + 3;
      if (d2 < reach * reach) inReach = true;
    });
    if (s.target >= 0) {
      const f = b.soldiers[s.target]!;
      const reach = s.s.radius + f.s.radius + 3;
      if ((f.x - s.x) ** 2 + (f.y - s.y) ** 2 < reach * reach) inReach = true;
    }
    const sp = Math.hypot(s.vx, s.vy);
    const k = sp < s.s.speed * 0.15 && !inReach ? (still.get(s.id) ?? 0) + 1 : 0;
    still.set(s.id, k);
    if (k > 20 && near) {
      const n = near as Soldier;
      const busy = n.target >= 0 && b.soldiers[n.target]!.team === s.team;
      // How many of our own men stand between him and that foe (within 6 of the line)?
      let between = 0;
      const dx = n.x - s.x, dy = n.y - s.y, L = Math.hypot(dx, dy) || 1;
      b.near((s.x + n.x) / 2, (s.y + n.y) / 2, L / 2 + 4, (o: Soldier) => {
        if (o.team !== s.team || o.id === s.id || o.state !== State.Fighting) return;
        const t = ((o.x - s.x) * dx + (o.y - s.y) * dy) / (L * L);
        if (t <= 0 || t >= 1) return;
        const lat = Math.abs((o.x - s.x) * -dy + (o.y - s.y) * dx) / L;
        if (lat < 5) between++;
      });
      const key = `${r.id}@${Math.floor(b.tick / 50) * 5}s`;
      const e = rows.get(key) ?? { n: 0, note: '' };
      e.n++;
      e.note = `K${r.id} t${r.team} ${CLS[r.cls]} ${r.mode}/${r.ord.kind} eng ${r.engaged ? 1 : 0} tgt ${r.targetReg} alive ${r.alive}; nearest foe ${Math.sqrt(nd).toFixed(0)} u (${CLS[n.cls]}, ${busy ? 'busy with ours' : 'free'}), friends in between ${between}`;
      rows.set(key, e);
      byBlock.set(r.id, (byBlock.get(r.id) ?? 0) + 0.1);
    }
  }
}
console.log(`seed ${seed} / ${men}: idle rider-seconds by block`);
for (const [id, v] of [...byBlock].sort((a, c) => c[1] - a[1])) console.log(`  ${id}: ${v.toFixed(1)} rider-s`);
console.log('5 s windows (rider-ticks idle):');
for (const [k, e] of rows) if (e.n >= 10) console.log(`  ${k.padEnd(12)} ${String(e.n).padStart(4)}  ${e.note}`);
