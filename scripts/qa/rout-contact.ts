// QA round 3: a block breaking in contact. Team 0 (winner) attacks team 1's block; team 1 keeps a
// far block (out of the fight) so its army does not break. For each man who was within 12 u of a
// foe when his block routed: did he die or lose hp in the next 5 s; and the victors who were in
// contact: how soon they move after the fugitives (pace over 12 u/s toward them).
//   npx tsx scripts/qa/rout-contact.ts [--seeds 1-6] [--pairs heavy:spear,heavy:heavy,...] [--v]
import { Battle, BATTLE_VERSION, State } from '../../src/game/battle.ts';
import { U, UNIT_COUNT } from '../../src/game/units.ts';
import { placeRegiment, plainArmy } from '../../src/game/testing.ts';
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const [s0, s1] = arg('seeds', '1-6').split('-').map(Number);
const V = process.argv.includes('--v');
const K: Record<string, number> = { heavy: U.HeavyInfantry, spear: U.Spearmen, shock: U.Shock, archer: U.Archers, skirm: U.Skirmishers };
const pairs = arg('pairs', 'heavy:spear,heavy:heavy,spear:heavy,shock:heavy').split(',');
for (const pr of pairs) {
  const [wa, lb] = pr.split(':');
  let men = 0, died = 0, hurt = 0, blows = 0, pauses: number[] = [], kills0 = 0, routs = 0;
  for (let seed = s0!; seed <= (s1 ?? s0!); seed++) {
    const ca = new Array(UNIT_COUNT).fill(0); ca[K[wa!]!] = 60;
    const cb = new Array(UNIT_COUNT).fill(0); cb[K[lb!]!] = 26; cb[U.Archers] = 40;
    const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(ca), plainArmy(cb, 200, 'samurai')] });
    b.generals[1]!.fixedPlan = 'hold';
    const A = b.regiments.filter((r) => r.team === 0);
    let y = 1200 - A.reduce((s, r) => s + r.width + 8, -8) / 2;
    for (const r of A) { placeRegiment(b, r, 1160, y + r.width / 2, 1, 0); y += r.width + 8; }
    const L = b.regiments.find((r) => r.team === 1 && r.cls === K[lb!])!;
    placeRegiment(b, L, 1240, 1200, -1, 0);
    for (const r of b.regiments.filter((q) => q.team === 1 && q !== L)) placeRegiment(b, r, 1900, 600, -1, 0);
    b.pinStance(1, U.Archers, 'line');
    const d = (b as any).d;
    let at = -1;
    const watch: number[] = [];
    const hp0 = new Map<number, number>();
    const victors: number[] = [];
    const moved = new Map<number, number>();
    while (!b.done() && b.tick < 1200) {
      b.step();
      if (at < 0 && L.routed) {
        at = b.tick; routs++;
        for (const i of L.members) {
          if (d.state[i] !== State.Routing) continue;
          let near = false;
          for (let j = 0; j < b.soldiers.length; j++) if (d.team[j] === 0 && d.state[j] === State.Fighting && Math.hypot(d.x[j] - d.x[i], d.y[j] - d.y[i]) < 12) { near = true; if (!victors.includes(j)) victors.push(j); }
          if (near) { watch.push(i); hp0.set(i, d.hp[i]); }
        }
        for (const j of victors) kills0 += d.kills[j];
      }
      if (at >= 0) {
        for (const j of victors) {
          if (moved.has(j) || d.state[j] !== State.Fighting) continue;
          // Pace toward the nearest fugitive.
          let bq = 1e9, bx = 0, by = 0;
          for (const i of L.members) if (d.state[i] === State.Routing) { const q = Math.hypot(d.x[i] - d.x[j], d.y[i] - d.y[j]); if (q < bq) { bq = q; bx = d.x[i] - d.x[j]; by = d.y[i] - d.y[j]; } }
          if (bq < 1e9 && (d.vx[j] * bx + d.vy[j] * by) / bq > 12) moved.set(j, b.tick - at);
        }
        if (b.tick - at === 50) break;
      }
    }
    if (at < 0) { if (V) console.log(`  ${pr} s${seed}: no rout by t${b.tick}`); continue; }
    let k = 0; for (const j of victors) k += d.kills[j];
    blows += k - kills0;
    for (const i of watch) { men++; if (d.state[i] === State.Dead) died++; else if (d.hp[i] < hp0.get(i)!) hurt++; }
    for (const j of victors) pauses.push(moved.get(j) ?? 50);
    if (V) console.log(`  ${pr} s${seed}: routed t${at}, ${watch.length} in contact, died ${watch.filter((i) => d.state[i] === State.Dead).length}, victors ${victors.length} median pause ${[...victors.map((j) => moved.get(j) ?? 50)].sort((a, c) => a - c)[victors.length >> 1]} ticks; modes ${A.map((r) => r.mode).join(',')}`);
  }
  pauses.sort((a, c) => a - c);
  console.log(`${pr.padEnd(12)} routs ${routs} | fugitives in contact ${men}: killed in 5 s ${died} (${((100 * died) / Math.max(1, men)).toFixed(0)}%), hurt ${hurt} | victors in contact ${pauses.length}: kills in 5 s ${blows}; set off after them within 1 s ${pauses.filter((p) => p <= 10).length}, median ${(pauses[pauses.length >> 1]! / 10).toFixed(1)} s, never in 5 s ${pauses.filter((p) => p >= 50).length}`);
}
