// Rallied and regrouped blocks, measured from the men themselves (not from `r.cx` / `r.radius`,
// which a fix may redefine): finding #1, #12 and #16 of docs/qa/battle-realism-review.md.
//   npx tsx scripts/qa/rally-check.ts [--seeds 1,2,…] [--sizes 450,1200,2800]
//
// Per 0.5 s sample, over blocks not routed (generals left out):
//   runners       routing men still on the roll of a formed block (man-samples)
//   std-off       the standard (r.cx, r.cy, where the renderer draws it) over 40 u from its nearest formed man
//   spread        the formed (Fighting) men spread over 3x the formation's half-diagonal and 150 u+
//   drag          the anchor moving over 6 u/s against its own goal (pulled after men, not marching)
//   jump          the anchor moving faster than 2x its men's speed (and 30 u/s), outside rally and
//                 re-framing in place (`facedAt`)
//   rear-fetch    a formed block not withdrawing whose anchor moves over 6 u/s toward its own edge
//                 while its goal lies toward the enemy's
// And over routing men: running toward the enemy's edge, into an enemy within 10 u, and men who
// left by the enemy's edge.
import { Battle, FIELD_W, MAX_TICKS, State } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2,3,4,5,6,7,8').split(',').map(Number);
const SIZES = arg('sizes', '450,1200,2800').split(',').map(Number);
const tot: Record<string, number> = {};
const add = (k: string, v = 1) => (tot[k] = (tot[k] ?? 0) + v);
const worst: string[] = [];

for (const men of SIZES)
  for (const seed of SEEDS) {
    const b = new Battle(demoSetup(seed, men));
    const d = (b as any).d;
    const regs = b.regiments;
    const prev = regs.map((r) => ({ x: r.ax, y: r.ay }));
    const fled = new Uint8Array(b.soldiers.length);
    const line: Record<string, number> = {};
    const ln = (k: string, v = 1, mode = '') => {
      line[k] = (line[k] ?? 0) + v;
      add(k, v);
      if (mode) add(`${k} [${mode}]`, v);
    };
    while (!b.done() && b.tick < MAX_TICKS + 5) {
      b.step();
      if (b.tick % 5 !== 0) continue;
      for (const r of regs) {
        const p = prev[r.id]!;
        const vx = (r.ax - p.x) * 2;
        const vy = (r.ay - p.y) * 2;
        p.x = r.ax;
        p.y = r.ay;
        if (r.alive === 0 || r.routed || r.role === 'command') continue;
        add('block-samples');
        let n = 0;
        let mx = 0;
        let my = 0;
        let near = Infinity;
        for (const id of r.members) {
          const st = d.state[id];
          if (st === State.Routing) ln('runners');
          if (st !== State.Fighting) continue;
          n++;
          mx += d.x[id];
          my += d.y[id];
          const q = Math.hypot(d.x[id] - r.cx, d.y[id] - r.cy);
          if (q < near) near = q;
        }
        if (n === 0) continue;
        mx /= n;
        my /= n;
        let far = 0;
        for (const id of r.members) if (d.state[id] === State.Fighting && !d.cu[id]) far = Math.max(far, Math.hypot(d.x[id] - mx, d.y[id] - my));
        const span = Math.hypot(r.width, r.depth) / 2 + 30;
        if (near > 40) {
          ln('std-off', 1, r.mode);
          if (worst.length < 12 && near > 100) worst.push(`s${seed}/${men} t${b.tick} B${r.id} ${r.mode} standard ${near.toFixed(0)} u from its nearest man`);
        }
        if (far > Math.max(3 * span, 150)) ln('spread', 1, r.mode);
        const sp = Math.hypot(vx, vy);
        const gx = r.tx - r.ax;
        const gy = r.ty - r.ay;
        const gq = Math.hypot(gx, gy);
        if (sp > 6 && gq > 10 && vx * gx + vy * gy < -0.5 * sp * gq) ln('drag', 1, r.mode);
        const top = Math.max(r.speed, b.soldiers[r.members[0]!]!.s.speed) * 2;
        // (A block facing round in place lays its frame out afresh where its men stand: the anchor
        // moves, the men do not; that is no lurch.)
        if (r.mode !== 'rally' && sp > Math.max(top, 30) && b.tick - r.facedAt > 5) ln('jump', 1, r.mode);
        const edge = r.team === 0 ? -1 : 1;
        if (r.mode !== 'withdraw' && r.mode !== 'skirmish' && r.mode !== 'kite' && r.mode !== 'rally' && vx * edge > 6 && gx * edge < -10) ln('rear-fetch', 1, r.mode);
      }
      for (let i = 0; i < b.soldiers.length; i++) {
        const st = d.state[i];
        if (st === State.Fled && !fled[i]) {
          fled[i] = 1;
          if (Math.abs(d.x[i] - (d.team[i] === 0 ? 0 : FIELD_W)) > FIELD_W / 2) ln('fled-wrong-edge');
        }
        if (st !== State.Routing) continue;
        add('router-samples');
        const edge = d.team[i] === 0 ? -1 : 1;
        const v = Math.hypot(d.vx[i], d.vy[i]);
        if (v > 3 && d.vx[i] * edge < -0.3 * v) ln('rout-wrong');
        let ne = -1;
        let nd = 100;
        b.near(d.x[i], d.y[i], 10, (s, d2) => {
          if (s.team !== d.team[i] && s.state <= State.Routing && d2 < nd) {
            nd = d2;
            ne = s.id;
          }
        });
        if (ne >= 0 && (d.x[ne] - d.x[i]) * d.vx[i] + (d.y[ne] - d.y[i]) * d.vy[i] > 0.5 * Math.sqrt(nd) * v) ln('rout-into');
      }
    }
    console.log(`s${seed}/${men}`.padEnd(9), Object.entries(line).map(([k, v]) => `${k} ${v}`).join('  '));
  }
console.log('\n=== totals ===');
const per = (k: string, of: string) => `${k.padEnd(16)} ${String(tot[k] ?? 0).padStart(7)}  (${((100 * (tot[k] ?? 0)) / Math.max(1, tot[of] ?? 0)).toFixed(2)}% of ${of})`;
for (const k of ['runners', 'std-off', 'spread', 'drag', 'jump', 'rear-fetch']) console.log(per(k, 'block-samples'));
for (const k of ['rout-wrong', 'rout-into']) console.log(per(k, 'router-samples'));
console.log(`fled-wrong-edge  ${tot['fled-wrong-edge'] ?? 0}`);
console.log('\nby mode:');
for (const k of Object.keys(tot).filter((k) => k.includes('[')).sort()) console.log(`  ${k.padEnd(28)} ${tot[k]}`);
console.log('\nworst standards:\n  ' + worst.join('\n  '));
