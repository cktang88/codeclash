// Mirror matches: two identical armies, many seeds. Each side should win about half; prints
// team 0's share and how many standard deviations it is from a fair coin.
//   pnpm fairness              250 and 120 a side, seeds 1-200
//   pnpm fairness 500 400      500 a side, seeds 1-400
// A side bias in the sim usually comes from an ordering that favours one army (who thinks,
// looks or acts first in a tick, by id or by tick parity) or from rules not mirrored for the
// right-hand army (`dir`). The bias of an ordering often depends on the armies' size, so try
// several sizes; a few hundred seeds at least (the noise at n seeds is 50% / sqrt(n)).
//
// Faction against faction: the same army under two factions, fought both ways round (A as
// team 0, then as team 1) on every seed. Prints A's share of the wins and the battles' length.
//   pnpm fairness --factions undead,templar                  250 and 500 a side, seeds 1-200
//   pnpm fairness --factions undead,samurai --sizes 250 --seeds 400 --jobs 3
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BATTLE_VERSION, fight, MAX_TICKS, type ArmySpec } from '../src/game/battle.ts';
import { isFaction, type FactionId } from '../src/game/factions.ts';
import { emptyCounts } from '../src/game/units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const army = (n: number, hue: number, faction: FactionId = 'templar'): ArmySpec => ({
  name: 'a', faction, hue, counts: MIX.map((f) => Math.round(n * f)), veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander: true,
});

function mirror(men: number, seeds: number): void {
  let wins = 0;
  let draws = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(men, 0), army(men, 200)] });
    if (r.winner === 0) wins++;
    else if (r.winner === null) draws++;
  }
  const n = seeds - draws;
  const z = (wins - n / 2) / Math.sqrt(n / 4);
  console.log(`${String(men).padStart(5)} a side, ${seeds} seeds: team 0 won ${wins} (${((100 * wins) / Math.max(1, n)).toFixed(1)}%), ${draws} draws, z = ${z.toFixed(2)}`);
}

/** One battle of a faction match: whether A won, as which team, and how long it ran (ticks). */
interface Bout {
  seed: number;
  aTeam: 0 | 1;
  aWon: boolean;
  draw: boolean;
  ticks: number;
  time: boolean;
}

function bouts(a: FactionId, b: FactionId, men: number, seeds: number[]): Bout[] {
  const out: Bout[] = [];
  for (const seed of seeds) {
    for (const aTeam of [0, 1] as const) {
      const armies: [ArmySpec, ArmySpec] = aTeam === 0 ? [army(men, 0, a), army(men, 200, b)] : [army(men, 0, b), army(men, 200, a)];
      const r = fight({ version: BATTLE_VERSION, seed, kind: 'daily', armies });
      out.push({ seed, aTeam, aWon: r.winner === aTeam, draw: r.winner === null, ticks: r.ticks, time: r.reason === 'time' });
    }
  }
  return out;
}

function report(a: FactionId, b: FactionId, men: number, all: Bout[]): void {
  const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(1)}%`;
  const share = (list: Bout[]) => list.filter((x) => x.aWon).length;
  const as0 = all.filter((x) => x.aTeam === 0);
  const as1 = all.filter((x) => x.aTeam === 1);
  const n = all.length;
  const z = (share(all) - n / 2) / Math.sqrt(n / 4);
  const len = all.map((x) => x.ticks / 10).sort((p, q) => p - q);
  const at = (q: number) => len[Math.min(len.length - 1, Math.floor(q * len.length))]!.toFixed(0);
  const mean = len.reduce((s, x) => s + x, 0) / Math.max(1, n);
  const meanOf = (list: Bout[]) => (list.reduce((s, x) => s + x.ticks, 0) / Math.max(1, list.length) / 10).toFixed(0);
  console.log(
    `${a} vs ${b}, ${String(men).padStart(4)} a side, ${n} battles: ${a} won ${pct(share(all), n)} (as team 0 ${pct(share(as0), as0.length)}, as team 1 ${pct(share(as1), as1.length)}), z = ${z.toFixed(2)}` +
      ` | length mean ${mean.toFixed(0)}s (${a} won ${meanOf(all.filter((x) => x.aWon))}s, lost ${meanOf(all.filter((x) => !x.aWon))}s), median ${at(0.5)}s, p90 ${at(0.9)}s, max ${len[n - 1]!.toFixed(0)}s, to the time limit (${MAX_TICKS / 10}s) ${all.filter((x) => x.time).length}, draws ${all.filter((x) => x.draw).length}`,
  );
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function factionMatch(): Promise<void> {
  const [a, b] = arg('factions')!.split(',');
  if (!isFaction(a) || !isFaction(b)) throw new Error('--factions takes two of templar, samurai, undead');
  const sizes = (arg('sizes') ?? '250,500').split(',').map(Number);
  const seeds = Number(arg('seeds') ?? 200);
  const jobs = Math.max(1, Number(arg('jobs') ?? 1));
  const shard = arg('shard');
  if (shard) {
    // A worker: its share of the seeds, as JSON lines.
    const [k, of] = shard.split('/').map(Number);
    const mine = Array.from({ length: seeds }, (_, i) => i + 1).filter((s) => s % of! === k);
    for (const men of sizes) process.stdout.write(JSON.stringify({ men, bouts: bouts(a, b, men, mine) }) + '\n');
    return;
  }
  const results = new Map<number, Bout[]>(sizes.map((m) => [m, []]));
  const script = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: jobs }, (_, k) => {
      const args = [...process.execArgv, script, '--factions', `${a},${b}`, '--sizes', sizes.join(','), '--seeds', String(seeds), '--shard', `${k}/${jobs}`];
      return new Promise<void>((done, fail) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let text = '';
        child.stdout.on('data', (c: Buffer) => (text += c.toString()));
        child.on('exit', (code) => {
          if (code !== 0) return fail(new Error(`worker ${k} exited ${code}`));
          for (const line of text.split('\n').filter(Boolean)) {
            const { men, bouts: got } = JSON.parse(line) as { men: number; bouts: Bout[] };
            results.get(men)!.push(...got);
          }
          done();
        });
      });
    }),
  );
  for (const men of sizes) report(a, b, men, results.get(men)!);
}

if (arg('factions')) await factionMatch();
else {
  const sizes = process.argv[2] ? [Number(process.argv[2])] : [250, 120];
  const seeds = Number(process.argv[3] ?? 200);
  for (const men of sizes) mirror(men, seeds);
}
