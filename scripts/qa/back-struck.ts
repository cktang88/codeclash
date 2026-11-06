// QA3 #6: front-rank men struck from behind while fighting the man before them, in a frontal clash
// of two blocks. Per event (every other tick): where the striker stands relative to the struck
// man's block (beyond its end: wrapped round; within its span: came through), how deep behind the
// struck man's front, the striker's own rank and whether he is curling round (cu), and how long
// the striker has had him as his foe. Prints totals and a breakdown.
//   npx tsx scripts/qa/back-struck.ts [--seeds 1-3] [--piece clash|edge|reserve] [--v]
import { Battle, BATTLE_VERSION, State, type Regiment } from '../../src/game/battle.ts';
import { U, UNIT_COUNT } from '../../src/game/units.ts';
import { placeRegiment, plainArmy } from '../../src/game/testing.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const [sa, sb] = arg('seeds', '1-3').split('-').map(Number);
const PIECE = arg('piece', 'clash');
const V = process.argv.includes('--v');
const C = 1200;
const by: Record<string, number> = {};
const add = (k: string, v = 0.2) => { by[k] = (by[k] ?? 0) + v; };
let manS = 0, back = 0;
for (let seed = sa!; seed <= (sb ?? sa!); seed++) {
  const ka = new Array<number>(UNIT_COUNT).fill(0), kb = new Array<number>(UNIT_COUNT).fill(0);
  ka[U.HeavyInfantry] = PIECE === 'edge' ? 90 : 48; kb[U.HeavyInfantry] = PIECE === 'edge' ? 36 : 48;
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(ka), plainArmy(kb, 200, PIECE === 'edge' ? 'samurai' : 'templar')] });
  // Every block of a side side by side, 8 u apart (as soldier-sense.ts places them).
  const line = (team: number, x: number, fx: number) => {
    const g = b.regiments.filter((r) => r.team === team);
    let off = -g.reduce((s2, r) => s2 + r.width + 8, -8) / 2;
    for (const r of g) { const o = off + r.width / 2; placeRegiment(b, r, x, C + fx * o, fx, 0); off += r.width + 8; }
    return g;
  };
  const A = line(0, C - 40, 1)[0]!, B = line(1, C + 40, -1)[0]!;
  const d = (b as any).d;
  const since = new Int32Array(b.soldiers.length).fill(-1);
  const prevT = new Int32Array(b.soldiers.length).fill(-1);
  while (!b.done() && b.tick < 700) {
    b.step();
    for (let j = 0; j < b.soldiers.length; j++) { if (d.target[j] !== prevT[j]) { prevT[j] = d.target[j]; since[j] = b.tick; } }
    if (b.tick % 2) continue;
    for (let i = 0; i < b.soldiers.length; i++) {
      if (d.state[i] !== State.Fighting) continue;
      const r: Regiment = b.regiments[d.reg[i]]!;
      if (r.routed) continue;
      manS += 0.2;
      const t = d.target[i];
      if (t < 0 || d.att[i] <= 0) continue;
      const x = d.x[i], y = d.y[i];
      if ((d.x[t] - x) * r.fx + (d.y[t] - y) * r.fy <= 0) continue;
      let hit = -1;
      b.near(x, y, 20, (o) => {
        const j = o.id;
        if (d.target[j] !== i || j === t || d.team[j] === d.team[i]) return;
        const bf = (d.x[j] - x) * r.fx + (d.y[j] - y) * r.fy;
        if (bf < -2 && Math.hypot(d.x[j] - x, d.y[j] - y) <= d.rad[i] + d.rad[j] + d.rc[j] + 2) { hit = j; return true; }
      });
      if (hit < 0) continue;
      back += 0.2;
      const j = hit;
      const o: Regiment = b.regiments[d.reg[j]]!;
      // Striker relative to the struck man's block: lateral (beyond its half-width = wrapped round its end) and depth behind its front.
      const ex = d.x[j] - r.ax, ey = d.y[j] - r.ay;
      const lat = ex * -r.fy + ey * r.fx, fwd = ex * r.fx + ey * r.fy;
      // Beyond his block's end: in the interval between two friendly blocks, or round the end of the line.
      let inInterval = false;
      for (const f of b.regiments) {
        if (f.team !== r.team || f === r || f.alive === 0) continue;
        const fl = (d.x[j] - f.ax) * -f.fy + (d.y[j] - f.ay) * f.fx;
        const between = (lat > 0) === (((f.ax - r.ax) * -r.fy + (f.ay - r.ay) * r.fx) > 0);
        if (between && Math.abs(fl) < f.width / 2 + 12) inInterval = true;
      }
      const beyond = Math.abs(lat) > r.width / 2 ? (inInterval ? 'interval' : 'roundEnd') : 'withinSpan';
      const depth = fwd > 2 ? 'beforeFront' : fwd > -r.depth / 2 ? 'inFrontHalf' : 'rearHalf';
      // Striker's position relative to his own block's front.
      const ox = d.x[j] - o.ax, oy = d.y[j] - o.ay;
      const ofwd = ox * o.fx + oy * o.fy;
      const strikerPast = ofwd > 4 ? 'aheadOfOwnFront' : 'atOwnFront';
      // Where the struck man is in his file: row 0, his column; is his file's man behind him alive?
      const age = b.tick - since[j]!;
      const struckRow = d.row[i] === 0 ? 'row0' : 'rowN';
      // Angle: striker beside him (|lateral offset from i| > |back offset|) or straight behind.
      const sx = (d.x[j] - x) * -r.fy + (d.y[j] - y) * r.fx, sb2 = -((d.x[j] - x) * r.fx + (d.y[j] - y) * r.fy);
      const side = Math.abs(sx) > sb2 ? 'besideShoulder' : 'behind';
      add(`${beyond} ${depth}`);
      add(`striker ${strikerPast} row${Math.min(2, d.row[j])} cu${d.cu[j]}`);
      add(`struck ${struckRow} ${side}`);
      // The struck man's own foe: his rank, and how far the struck man stands past the enemy's front (the striker's block's anchor line).
      const past = (x - o.ax) * -o.fx + (y - o.ay) * -o.fy;
      add(`struckPastEnemyFront ${past < -2 ? 'no' : past < 3 ? '0-3' : past < 6 ? '3-6' : '6+'}`);
      add(`foeRow ${Math.min(2, d.row[t])} strikerRow ${Math.min(2, d.row[j])}`);
      add(`attOnFrontFoe ${Math.min(3, d.att[t])} attOnStriker ${Math.min(3, d.att[j])}`);
      // Is there a friend of the struck man without a foe within 10 u of the striker?
      let idleMate = false;
      b.near(d.x[j], d.y[j], 10, (o2) => { if (d.team[o2.id] === d.team[i] && d.target[o2.id] < 0 && d.state[o2.id] === State.Fighting) idleMate = true; });
      add(`idleMateNearStriker ${idleMate}`);
      add(`age ${age < 10 ? '<1s' : age < 30 ? '1-3s' : '3s+'}`);
      add(`strikerTargetDist ${Math.round(Math.hypot(d.x[j] - x, d.y[j] - y) / 2) * 2}`);
      if (V && b.tick % 20 === 0) console.log(`s${seed} t${b.tick} man ${i} row ${d.row[i]} sx ${d.sx[i].toFixed(0)} p ${x.toFixed(0)},${y.toFixed(0)} foe ${t}@${d.x[t].toFixed(0)},${d.y[t].toFixed(0)} | striker ${j} row ${d.row[j]} sx ${d.sx[j].toFixed(0)} cu ${d.cu[j]} p ${d.x[j].toFixed(0)},${d.y[j].toFixed(0)} lat ${lat.toFixed(0)} fwd ${fwd.toFixed(0)} age ${age} | A ${A.ax.toFixed(0)} w ${A.width.toFixed(0)} B ${B.ax.toFixed(0)}`);
    }
  }
}
console.log(`man-s ${manS.toFixed(0)}, struck from behind ${back.toFixed(1)} (${((100 * back) / manS).toFixed(2)}%)`);
for (const [k, v] of Object.entries(by).sort((a, c) => (a[0].split(' ')[0]! < c[0].split(' ')[0]! ? -1 : a[0].split(' ')[0]! > c[0].split(' ')[0]! ? 1 : c[1] - a[1]))) console.log(`  ${k.padEnd(40)} ${v.toFixed(1)}`);
