// Weapon reach sanity: how far apart the front ranks stand in a melee, and who gets inside the points.
//   npx tsx scripts/reach-sanity.ts [--root <checkout>] [--seeds 3,7,11] [--demo 4] [--men 450]
//
// Set pieces (two blocks of 48 men 160 apart, one of each matchup; each run on `--seeds`):
//   spear-spear     Templar spear levy against Templar spear levy, both advancing.
//   yari-yari       Yari ashigaru against yari ashigaru.
//   yari-spear      Yari ashigaru against Templar spear levy.
//   sword-spear     Templar sergeants advancing on Templar spears standing to receive them.
//   katana-yari     Katana samurai advancing on yari ashigaru standing.
//   sword-disorder  Sergeants on spears still re-forming (`formedAt` 30 s on): no wall.
//   sword-flank     Spears locked to their front with sergeants; a second block of sergeants on their flank.
// And `--demo` /demo battles of `--men` a side (demoSetup, seeds 1..n).
//
// For each, over the 60 s after the first blow:
//   gap     median distance, centre to centre, from each front-rank man fighting to his foe (by
//           side: a / b), and in the demo battles by matchup of weapon (long: reach 9 and more).
//   inside  share of the men fighting a long-weapon foe who stand inside his point (closer than
//           the two bodies and half his reach), by side.
//   lost    share of each side's men dead after 10, 30 and 60 s from the first blow.
// `--root` runs another checkout's sim (for the before and after); reach comes from the stats
// (`UnitStats.reach`) where the sim has it, else from REACH below (the same table).
import { pathToFileURL } from 'node:url';

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const root = arg('root', new URL('..', import.meta.url).pathname);
const seeds = arg('seeds', '3,7,11').split(',').map(Number);
const demoN = Number(arg('demo', '4'));
const demoMen = Number(arg('men', '450'));
const at = (p: string) => pathToFileURL(`${root.replace(/\/$/, '')}/${p}`).href;
const B = await import(at('src/game/battle.ts'));
const T = await import(at('src/game/testing.ts'));
const D = await import(at('src/client/demo.ts'));
const { U } = await import(at('src/game/units.ts'));
const { Battle, BATTLE_VERSION } = B;
const { only, placeRegiment, plainArmy } = T;

/** The reach table of src/game/units.ts and factions.ts (world units beyond the two bodies). */
const REACH: Record<string, number[]> = {
  templar: [1.6, 15, 1.6, 1.6, 1.6, 5, 1.6, 1.6, 4, 1.6],
  samurai: [1.6, 19.5, 1.6, 1.6, 1.6, 5, 1.6, 1.6, 9, 1.6],
  undead: [1.6, 13, 1.6, 1.6, 1.6, 5, 1.6, 1.6, 4, 1.6],
};
type S = { id: number; actedAt: number; team: number; cls: number; x: number; y: number; state: number; target: number; reg: number; row: number; s: { radius: number; reach?: number } };
const LONG = 9;

interface Tally {
  gap: [number[], number[]];
  inside: [number, number];
  vsLong: [number, number];
  lost: [number[], number[]];
  byPair: Map<string, number[]>;
  pairInside: Map<string, [number, number]>;
}
const tally = (): Tally => ({ gap: [[], []], inside: [0, 0], vsLong: [0, 0], lost: [[], []], byPair: new Map(), pairInside: new Map() });

function reachOf(b: { armies?: unknown }, factions: string[], s: S): number {
  return s.s.reach ?? REACH[factions[s.team]!]![s.cls]!;
}

/** Watches `b` for 60 s from its first blow, adding to `t`. */
function watch(b: any, factions: string[], t: Tally, pairs: boolean, limit = 2400): void {
  const ss: S[] = b.soldiers;
  const start = [0, 0];
  for (const s of ss) start[s.team]!++;
  let first = -1;
  const marks = [100, 300, 600];
  while (!b.done() && b.tick < limit && (first < 0 || b.tick - first <= 600)) {
    b.step();
    if (first < 0 && ss.some((s) => s.state === 0 && s.actedAt >= b.tick - 1 && s.target >= 0 && s.s.radius > 0 && (s as any).s.range === 0)) first = b.tick;
    if (first < 0) continue;
    const k = b.tick - first;
    for (const m of marks) if (k === m) for (const team of [0, 1]) t.lost[team]!.push(ss.filter((s) => s.team === team && s.state >= 2).length / start[team]!);
    if (b.done()) fillLost(ss, start, t, marks.filter((m) => m > k).length);
    if (k % 5) continue;
    for (const s of ss) {
      if (s.state !== 0 || s.target < 0 || (s as any).mounted) continue;
      const f = ss[s.target]!;
      if ((f as any).mounted) continue;
      const q = Math.hypot(f.x - s.x, f.y - s.y);
      if (q > 60) continue;
      const wf = reachOf(b, factions, f);
      if (s.row === 0) t.gap[s.team]!.push(q);
      if (wf >= LONG) {
        t.vsLong[s.team]!++;
        const inside = q < s.s.radius + f.s.radius + wf * 0.5;
        if (inside) t.inside[s.team]!++;
        if (pairs) {
          const key = `${reachOf(b, factions, s) >= LONG ? 'long' : 'short'} on long`;
          const pi = t.pairInside.get(key) ?? [0, 0];
          pi[0] += inside ? 1 : 0;
          pi[1]++;
          t.pairInside.set(key, pi);
        }
      }
      if (pairs && s.row === 0) {
        const key = `${reachOf(b, factions, s) >= LONG ? 'long' : 'short'}-${wf >= LONG ? 'long' : 'short'}`;
        if (!t.byPair.has(key)) t.byPair.set(key, []);
        t.byPair.get(key)!.push(q);
      }
    }
  }
}

/** A battle over before the last marks: its losses as they stand, for each mark left. */
function fillLost(ss: S[], start: number[], t: Tally, left: number): void {
  for (let n = 0; n < left; n++) for (const team of [0, 1]) t.lost[team]!.push(ss.filter((s) => s.team === team && s.state >= 2).length / start[team]!);
}

const med = (a: number[]) => (a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1]!.toFixed(1) : '-');
const mean = (a: number[]) => (a.length ? ((100 * a.reduce((s, x) => s + x, 0)) / a.length).toFixed(0) + '%' : '-');
const pct = (x: number, n: number) => (n ? `${((100 * x) / n).toFixed(0)}%` : '-');

interface Piece {
  name: string;
  a: [string, number];
  b: [string, number];
  /** b holds, else both advance. */
  hold: boolean;
  setup?: (bt: any) => void;
}
const pieces: Piece[] = [
  { name: 'spear-spear', a: ['templar', U.Spearmen], b: ['templar', U.Spearmen], hold: false },
  { name: 'yari-yari', a: ['samurai', U.Spearmen], b: ['samurai', U.Spearmen], hold: false },
  { name: 'yari-spear', a: ['samurai', U.Spearmen], b: ['templar', U.Spearmen], hold: false },
  { name: 'sword-spear', a: ['templar', U.HeavyInfantry], b: ['templar', U.Spearmen], hold: true },
  { name: 'katana-yari', a: ['samurai', U.HeavyInfantry], b: ['samurai', U.Spearmen], hold: true },
  {
    name: 'sword-disorder', a: ['templar', U.HeavyInfantry], b: ['templar', U.Spearmen], hold: true,
    setup: (bt) => {
      for (const r of bt.regiments) if (r.team === 1) r.formedAt = 300;
    },
  },
];

function piece(p: Piece, seed: number, t: Tally): void {
  const bt = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(p.a[1], 48), 0, p.a[0]), plainArmy(only(p.b[1], 48), 200, p.b[0])] });
  bt.generals[0].fixedPlan = 'advance';
  bt.generals[1].fixedPlan = p.hold ? 'hold' : 'advance';
  const ra = bt.regiments.find((r: any) => r.team === 0);
  const rb = bt.regiments.find((r: any) => r.team === 1);
  placeRegiment(bt, ra, 1120, 1200, 1, 0);
  placeRegiment(bt, rb, 1280, 1200, -1, 0);
  p.setup?.(bt);
  watch(bt, [p.a[0], p.b[0]], t, false);
}

/** Sergeants on the spears' front and a second block on their flank. */
function flank(seed: number, t: Tally, tf: Tally): void {
  const bt = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(only(U.HeavyInfantry, 80), 0, 'templar'), plainArmy(only(U.Spearmen, 48), 200, 'templar')] });
  bt.generals[0].fixedPlan = 'advance';
  bt.generals[1].fixedPlan = 'hold';
  const rs = bt.regiments.filter((r: any) => r.team === 0);
  const rb = bt.regiments.find((r: any) => r.team === 1);
  placeRegiment(bt, rb, 1280, 1200, -1, 0);
  placeRegiment(bt, rs[0], 1250, 1200, 1, 0);
  if (rs[1]) placeRegiment(bt, rs[1], 1290, 1200 - rb.width * 0.5 - 70, 0, 1);
  // Only the flank block is tallied apart: men of block 2 fighting.
  const ss: S[] = bt.soldiers;
  const flankIds = new Set<number>(rs[1] ? rs[1].members : []);
  const start = [0, 0];
  for (const s of ss) start[s.team]!++;
  let first = -1;
  while (!bt.done() && bt.tick < 2400 && (first < 0 || bt.tick - first <= 600)) {
    bt.step();
    if (first < 0 && ss.some((s) => s.team === 0 && s.state === 0 && s.actedAt >= bt.tick - 1 && s.target >= 0)) first = bt.tick;
    if (first < 0) continue;
    const k = bt.tick - first;
    for (const m of [100, 300, 600]) if (k === m) for (const team of [0, 1]) t.lost[team]!.push(ss.filter((s) => s.team === team && s.state >= 2).length / start[team]!);
    if (bt.done()) fillLost(ss, start, t, [100, 300, 600].filter((m) => m > k).length);
    if (k % 5) continue;
    for (const s of ss) {
      if (s.state !== 0 || s.target < 0) continue;
      const f = ss[s.target]!;
      const q = Math.hypot(f.x - s.x, f.y - s.y);
      if (q > 60) continue;
      const into = s.team === 0 && flankIds.has(s.id) ? tf : t;
      if (s.row === 0) into.gap[s.team]!.push(q);
      const wf = reachOf(bt, ['templar', 'templar'], f);
      if (wf >= LONG) {
        into.vsLong[s.team]!++;
        if (q < s.s.radius + f.s.radius + wf * 0.5) into.inside[s.team]!++;
      }
    }
  }
}

function line(name: string, t: Tally): void {
  const lost = (team: number) => [0, 1, 2].map((m) => mean(t.lost[team]!.filter((_, i) => i % 3 === m))).join('/');
  console.log(
    `${name.padEnd(16)} gap a ${med(t.gap[0])} b ${med(t.gap[1])} | inside a ${pct(t.inside[0], t.vsLong[0])} b ${pct(t.inside[1], t.vsLong[1])} | lost at 10/30/60 s a ${lost(0)} b ${lost(1)}`,
  );
}

console.log(`root ${root}`);
for (const p of pieces) {
  const t = tally();
  for (const s of seeds) piece(p, s, t);
  line(p.name, t);
}
{
  const t = tally();
  const tf = tally();
  for (const s of seeds) flank(s, t, tf);
  line('sword-flank', t);
  console.log(`${'  flank block'.padEnd(16)} gap ${med(tf.gap[0])} | inside ${pct(tf.inside[0], tf.vsLong[0])}`);
}
if (demoN > 0) {
  const t = tally();
  let melee = 0;
  let lostMelee = 0;
  for (let seed = 1; seed <= demoN; seed++) {
    const setup = D.demoSetup(seed, demoMen);
    const bt = new Battle(setup);
    const fs = setup.armies.map((a: any) => a.faction);
    watch(bt, fs, t, true, 6000);
    void melee;
    void lostMelee;
  }
  line(`demo ${demoMen} x${demoN}`, t);
  for (const [k, v] of [...t.byPair].sort()) console.log(`  front gap ${k.padEnd(12)} ${med(v)} (n ${v.length})`);
  for (const [k, v] of [...t.pairInside].sort()) console.log(`  inside ${k.padEnd(14)} ${pct(v[0], v[1])} (n ${v[1]})`);
}
