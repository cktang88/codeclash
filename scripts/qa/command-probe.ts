// QA review 2, #5 and #7: how steady the reserves and the household are, how long the line foot
// marches in column inside the enemy's bowshot, and which way the blocks face at deployment.
//   npx tsx scripts/qa/command-probe.ts --seeds 1,2 --men 450 [--pairs] [--verbose]
// Per battle (every 0.5 s):
//   friend-switch  a reserve (second line, not committed, order reserve) changes the friend it backs
//   goal-jump      its goal moves more than 60 u at once (`clearGoal` sidesteps included)
//   path           how far its anchor walks a minute
//   swing          degrees per second its facing turns while its anchor moves under 4 u/s
//   osc-res/osc-G  anchor reversals (legs of 2 s over 6 u) of reserves / the household, per minute
//   col-bow        share of line-foot block-seconds (not engaged) spent in column inside an enemy
//                  foot shooter block's range (edge to edge)
//   wd             mean width/depth of the line foot at t450 (the review's frame)
//   deploy         worst angle between a line block's facing and the enemy's edge over t5-t20
import { Battle, type Regiment } from '../../src/game/battle.ts';
import { demoSetup } from '../../src/client/demo.ts';
import { FACTION_IDS, type FactionId } from '../../src/game/factions.ts';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const MEN = Number(arg('men', '450'));
const PAIRS = process.argv.includes('--pairs');
const VERBOSE = process.argv.includes('--verbose');
const isCav = (r: Regiment) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer';
const ABBR: Record<string, string> = { templar: 'tem', samurai: 'sam', undead: 'und' };

const tot = { resPath: 0, switches: 0, jumps: 0, resSec: 0, swingDeg: 0, swingSec: 0, oscRes: 0, oscG: 0, gMin: 0, colBow: 0, footBow: 0, wSum: 0, dSum: 0, wN: 0, deployBad: 0, deployN: 0, deployWorst: 0 };

function run(seed: number, f?: [FactionId, FactionId]) {
  const b = new Battle(demoSetup(seed, MEN, f));
  const name = `s${seed}/${MEN}${f ? ' ' + ABBR[f[0]] + '-' + ABBR[f[1]] : ''}`;
  const n = b.regiments.length;
  const lastFriend = new Array<number>(n).fill(-2);
  const lastGoal = b.regiments.map((r) => [r.tx, r.ty]);
  const lastF = b.regiments.map((r) => [r.fx, r.fy]);
  const lastA = b.regiments.map((r) => [r.ax, r.ay]);
  const hist: number[][][] = b.regiments.map(() => []);
  let sw = 0;
  let jp = 0;
  let osc = 0;
  let oscG = 0;
  const deployWorst: number[] = new Array(n).fill(0);
  while (!b.done() && b.tick < 3600) {
    b.step();
    if (b.tick % 5 !== 0) continue;
    for (const r of b.regiments) {
      if (r.alive === 0 || r.routed) continue;
      const i = r.id;
      const isRes = r.role === 'line' && r.line === 2 && !r.committed && r.order === 'reserve';
      const isG = r.role === 'command';
      if (isRes) {
        tot.resSec += 0.5;
        if (lastFriend[i] !== -2 && r.ord.friend !== lastFriend[i]) {
          sw++;
          if (VERBOSE) console.log(`  ${name} t${b.tick} L${i} friend ${lastFriend[i]} -> ${r.ord.friend}`);
        }
        const gj = Math.hypot(r.tx - lastGoal[i]![0]!, r.ty - lastGoal[i]![1]!);
        if (gj > 60) {
          jp++;
          if (VERBOSE) console.log(`  ${name} t${b.tick} L${i} goal ${lastGoal[i]![0]!.toFixed(0)},${lastGoal[i]![1]!.toFixed(0)} -> ${r.tx.toFixed(0)},${r.ty.toFixed(0)} friend ${r.ord.friend} mode ${r.mode} a ${r.ax.toFixed(0)},${r.ay.toFixed(0)}`);
        }
        const sp = Math.hypot(r.ax - lastA[i]![0]!, r.ay - lastA[i]![1]!) * 2;
        tot.resPath += sp / 2;
        if (sp < 4) {
          const c = Math.max(-1, Math.min(1, r.fx * lastF[i]![0]! + r.fy * lastF[i]![1]!));
          tot.swingDeg += (Math.acos(c) * 180) / Math.PI;
          tot.swingSec += 0.5;
        }
        lastFriend[i] = r.ord.friend;
      } else lastFriend[i] = -2;
      if (isG) tot.gMin += 0.5 / 60;
      // Reversals: legs of 2 s, over the last 30 s, counted once per leg as it ends.
      const h = hist[i]!;
      h.push([r.ax, r.ay]);
      if (h.length > 9) h.shift();
      if (h.length === 9 && (isRes || isG)) {
        const lx = h[8]![0]! - h[4]![0]!;
        const ly = h[8]![1]! - h[4]![1]!;
        const px = h[4]![0]! - h[0]![0]!;
        const py = h[4]![1]! - h[0]![1]!;
        const lm = Math.hypot(lx, ly);
        const pm = Math.hypot(px, py);
        if (b.tick % 20 === 0 && lm > 6 && pm > 6 && px * lx + py * ly < -0.5 * lm * pm) {
          if (isG) oscG++;
          else osc++;
        }
      }
      if (isRes) tot.resSec += 0;
      // Column inside bowshot.
      if (r.role === 'line' && !isCav(r) && !r.engaged && r.mode !== 'melee') {
        let inBow = false;
        for (const e of b.regiments) {
          if (e.team === r.team || e.alive === 0 || e.routed || e.role !== 'missile') continue;
          const g = Math.hypot(e.cx - r.cx, e.cy - r.cy) - e.radius - r.radius;
          if (g < (b as any).stats[e.team][e.cls].range) inBow = true;
        }
        if (inBow) {
          tot.footBow += 0.5;
          if (r.stance === 'column') tot.colBow += 0.5;
        }
      }
      if (b.tick === 450 && r.role === 'line') {
        tot.wSum += r.width;
        tot.dSum += r.depth;
        tot.wN++;
      }
      if (b.tick >= 5 && b.tick <= 20 && r.role === 'line') {
        const dir = r.team === 0 ? 1 : -1;
        const a = (Math.acos(Math.max(-1, Math.min(1, r.fx * dir))) * 180) / Math.PI;
        deployWorst[i] = Math.max(deployWorst[i]!, a);
      }
      lastGoal[i] = [r.tx, r.ty];
      lastF[i] = [r.fx, r.fy];
      lastA[i] = [r.ax, r.ay];
    }
  }
  let bad = 0;
  for (const r of b.regiments)
    if (r.role === 'line') {
      tot.deployN++;
      if (deployWorst[r.id]! > 45) bad++;
      tot.deployWorst = Math.max(tot.deployWorst, deployWorst[r.id]!);
    }
  tot.deployBad += bad;
  tot.switches += sw;
  tot.jumps += jp;
  tot.oscRes += osc;
  tot.oscG += oscG;
  console.log(`${name.padEnd(18)} winner ${(b as any).result?.winner} switches ${sw} goal-jumps ${jp} rev-res ${osc} rev-G ${oscG} deploy>45 ${bad}`);
}

for (const s of SEEDS) {
  if (PAIRS) for (const a of FACTION_IDS) for (const c of FACTION_IDS) run(s, [a, c]);
  else run(s);
}
const m = tot.resSec / 60;
console.log(
  `TOTAL reserve-min ${m.toFixed(1)}  path ${(tot.resPath / m).toFixed(0)} u/min  switch/min ${(tot.switches / m).toFixed(2)}  goal-jump/min ${(tot.jumps / m).toFixed(2)}  swing ${(tot.swingDeg / Math.max(1, tot.swingSec)).toFixed(1)} deg/s standing  rev/min res ${(tot.oscRes / m).toFixed(2)} G ${(tot.oscG / tot.gMin).toFixed(2)}`,
);
console.log(
  `TOTAL col-in-bowshot ${((100 * tot.colBow) / Math.max(1, tot.footBow)).toFixed(1)}% of ${tot.footBow.toFixed(0)} block-s  w/d@t450 ${(tot.wSum / Math.max(1, tot.wN)).toFixed(1)}/${(tot.dSum / Math.max(1, tot.wN)).toFixed(1)}  deploy>45deg ${tot.deployBad}/${tot.deployN} worst ${tot.deployWorst.toFixed(0)}`,
);
