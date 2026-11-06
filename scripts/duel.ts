// Fast, headless set piece: one block against another (or a few), no renderer, no demo armies.
// For iterating on battle behaviour in seconds (see .claude/skills/fast-sim/SKILL.md).
//
//   npx tsx scripts/duel.ts spearmen:templar:48 spearmen:samurai:48
//   npx tsx scripts/duel.ts heavyInfantry:templar:60 spearmen:undead:60 --gap=120 --ticks=600 --every=50
//   npx tsx scripts/duel.ts knights:templar:20 spearmen:samurai:60 --stanceB=pikewall --seeds=1-5
//   npx tsx scripts/duel.ts archers:templar:60 heavyInfantry:undead:60 --gap=500 --hold=b
//
// A side is `class[:faction[:men]]` (class by its key in units.ts UNIT_KEYS: heavyInfantry,
// spearmen, skirmishers, archers, crossbowmen, lightCavalry, horseArchers, knights, shock,
// artillery; faction templar|samurai|undead; men default 48). Several classes on one side:
// `spearmen:templar:48+archers:templar:30`. Options: --gap (front to front, default 80),
// --ticks (default 600 = 60 s), --every (print every N ticks, default 100; 0 = only the end),
// --seeds (n or a-b, default 1), --stanceA/--stanceB (pin a stance), --hold=a|b|both (that
// side's general holds: it does not advance), --quiet (one line per seed), --ground=hillA|hillB|
// woodA|woodB|woodMid|stream|ford (terrain about the two blocks: `groundPreset` in testing.ts).
import { Battle, BATTLE_VERSION, State, type Stance } from '../src/game/battle.ts';
import { type FactionId } from '../src/game/factions.ts';
import { UNIT_COUNT, UNIT_KEYS } from '../src/game/units.ts';
import { groundPreset, placeRegiment, plainArmy } from '../src/game/testing.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const flag = (k: string) => args.includes(`--${k}`);
const sides = args.filter((a) => !a.startsWith('--'));
if (sides.length !== 2) {
  console.log('usage: npx tsx scripts/duel.ts <sideA> <sideB> [--gap=80] [--ticks=600] [--every=100] [--seeds=1|1-5] [--stanceA=..] [--stanceB=..] [--hold=a|b|both] [--quiet]');
  process.exit(1);
}

function parseSide(s: string): { faction: FactionId; counts: number[] } {
  let faction: FactionId = 'templar';
  const counts = new Array<number>(UNIT_COUNT).fill(0);
  for (const part of s.split('+')) {
    const [cls, fac, men] = part.split(':');
    const k = (UNIT_KEYS as readonly string[]).indexOf(cls!);
    if (k < 0) throw new Error(`unknown class ${cls} (one of ${UNIT_KEYS.join(', ')})`);
    if (fac) faction = fac as FactionId;
    counts[k]! += Number(men ?? 48);
  }
  return { faction, counts };
}

const A = parseSide(sides[0]!);
const B = parseSide(sides[1]!);
const gap = Number(opt('gap', '80'));
const ticks = Number(opt('ticks', '600'));
const every = Number(opt('every', '100'));
const [s0, s1] = opt('seeds', '1').split('-').map(Number);
const hold = opt('hold', '');
const quiet = flag('quiet');

for (let seed = s0!; seed <= (s1 ?? s0!); seed++) {
  const t0 = performance.now();
  const b = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [plainArmy(A.counts, 0, A.faction), plainArmy(B.counts, 200, B.faction)], terrain: groundPreset(opt('ground', ''), 1200, 1200, gap) });
  for (const [team, k] of [[0, 'stanceA'], [1, 'stanceB']] as const) {
    const st = opt(k, '') as Stance | '';
    if (st) for (let c = 0; c < UNIT_COUNT; c++) if ((team === 0 ? A : B).counts[c]) b.pinStance(team, c, st);
  }
  if (hold === 'a' || hold === 'both') b.generals[0].fixedPlan = 'hold';
  if (hold === 'b' || hold === 'both') b.generals[1].fixedPlan = 'hold';
  // Each side's blocks side by side, fronts `gap` apart across the middle of the field.
  const W = 2400, H = 2400, cx = W / 2, cy = H / 2;
  for (const team of [0, 1] as const) {
    const regs = b.regiments.filter((r) => r.team === team);
    let y = cy - regs.reduce((s, r) => s + r.width + 20, -20) / 2;
    for (const r of regs) {
      placeRegiment(b, r, team === 0 ? cx - gap / 2 : cx + gap / 2, y + r.width / 2, team === 0 ? 1 : -1, 0);
      y += r.width + 20;
    }
  }
  const dead = (t: number) => b.soldiers.filter((s) => s.team === t && s.state === State.Dead).length;
  const alive = (t: number) => b.soldiers.filter((s) => s.team === t && s.state === State.Fighting).length;
  const start = [alive(0), alive(1)];
  const report = () => {
    const fronts = [0, 1].map((t) => {
      const xs = b.soldiers.filter((s) => s.team === t && s.state === State.Fighting).map((s) => s.x);
      return xs.length ? (t === 0 ? Math.max(...xs) : Math.min(...xs)) : NaN;
    });
    const modes = b.regiments.map((r) => `${r.team ? 'B' : 'A'}${r.id}:${r.mode}/${r.stance}`).join(' ');
    console.log(`  t=${String(b.tick).padStart(4)} (${(b.tick / 10).toFixed(0)}s)  A ${alive(0)}/${start[0]}  B ${alive(1)}/${start[1]}  front gap ${(fronts[1]! - fronts[0]!).toFixed(1)}  ${modes}`);
  };
  if (!quiet) console.log(`seed ${seed}: ${sides[0]} vs ${sides[1]}, gap ${gap}`);
  while (!b.done() && b.tick < ticks) {
    b.step();
    if (!quiet && every > 0 && b.tick % every === 0) report();
  }
  const ms = performance.now() - t0;
  const res = `A ${alive(0)}/${start[0]}  B ${alive(1)}/${start[1]}  ${b.done() ? `winner ${b.result?.winner === 0 ? 'A' : 'B'}` : 'running'} at t=${b.tick}  dead A ${dead(0)} B ${dead(1)}${b.unhorsed[0] + b.unhorsed[1] > 0 ? `  unhorsed A ${b.unhorsed[0]} B ${b.unhorsed[1]}` : ''}  (${ms.toFixed(0)} ms)`;
  console.log(quiet ? `seed ${seed}: ${res}` : `  end: ${res}`);
}
