// Diagnostics for balance work: what each kind of man does in a battle, and how one faction's
// men fare against another's, block against block.
//
//   pnpm battle-stats duels --factions undead,templar [--men 30] [--seeds 40]
//       One block against one block, every class of A against every class of B (no generals),
//       both ways round: A's share of the wins, the mean length, and A's and B's men left.
//   pnpm battle-stats types --factions undead,templar [--sizes 500,2800] [--seeds 20]
//       The standard army (as `pnpm fairness`), both ways round, per class and side: blows tried
//       and landed, damage dealt and taken, kills and deaths, figure-seconds fighting (a foe at
//       hand), standing idle and running, and regiments broken. Compare the rows across sizes:
//       whichever moves most with the size of the battle points at what grows with it.
//   pnpm battle-stats ladder --factions undead,templar [--sizes 120,250,500,1000,2000,2800] [--seeds 40]
//       A's share of the wins, the length, how often each general fell, each side's regiments
//       broken, B's rallied and its men fallen in with another regiment, for the standard army at each size: where the curve bends shows
//       at what size a mechanism starts to tell. The last columns give the layout of A's line:
//       blocks in its first line and the men of its biggest Shock block (one block until the
//       class outgrows a line block, so it grows with the army while the others grow with its
//       square root: a step in the layout can move the win rate as much as any rule).
//   pnpm battle-stats mirror --factions undead [--sizes 250,500,1500,2800] [--seeds 400]
//       Side bias: the standard army of one faction against itself, one battle a seed (hues 0
//       and 200): team 0's share of the wins and its z against a fair coin, the length, how often
//       each general fell and how many each side raised. (`pnpm fairness --factions a,a` fights
//       each mirror twice, the same battle both ways round, so it always reads 50%.)
// All take --jobs N (default 4): the seeds are shared among N worker processes.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Battle, BATTLE_VERSION, State, type ArmySpec } from '../src/game/battle.ts';
import { isFaction, type FactionId } from '../src/game/factions.ts';
import { emptyCounts, U, UNIT_COUNT } from '../src/game/units.ts';

const MIX = [0.22, 0.2, 0.08, 0.12, 0.07, 0.07, 0.05, 0.03, 0.03, 0.005];
const NAMES = ['heavy', 'spears', 'skirm', 'archers', 'xbow', 'lighthorse', 'horsebow', 'knights', 'shock', 'engines'];
const army = (counts: number[], faction: FactionId, hue: number, commander: boolean): ArmySpec => ({
  name: faction, faction, hue, counts, veterans: emptyCounts(), moraleBonus: 0, pavise: 0, stakes: false, commander,
});
const standard = (men: number) => MIX.map((f) => Math.round(men * f));

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : dflt;
}
const mode = process.argv[2] ?? 'types';
const given = arg('factions', 'undead,templar').split(',') as FactionId[];
const [fa, fb] = [given[0]!, given[1] ?? given[0]!];
if (!isFaction(fa) || !isFaction(fb)) throw new Error('--factions takes two of templar, samurai, undead');
const seeds = Number(arg('seeds', mode === 'types' ? '20' : '40'));
const jobs = Math.max(1, Number(arg('jobs', '4')));

/** Numbers summed over battles: a flat record, so the workers' shares just add up. */
type Tally = Record<string, number>;
const add = (t: Tally, k: string, v = 1) => (t[k] = (t[k] ?? 0) + v);

/** Fights `a` against `b` both ways round on `seed`, calling `watch` on each battle (A's team) before it runs. */
function both(seed: number, a: ArmySpec, b: ArmySpec, watch: (bt: Battle, aTeam: 0 | 1) => (() => void) | void): void {
  for (const aTeam of [0, 1] as const) {
    const bt = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: aTeam === 0 ? [a, { ...b, hue: 200 }] : [{ ...b, hue: 0 }, { ...a, hue: 200 }] });
    const done = watch(bt, aTeam);
    bt.run();
    done?.();
  }
}

function duels(mine: number[]): Tally {
  const t: Tally = {};
  const men = Number(arg('men', '30'));
  for (let ca = 0; ca < UNIT_COUNT - 1; ca++) {
    for (let cb = 0; cb < UNIT_COUNT - 1; cb++) {
      const k = `${ca}:${cb}`;
      const ca1 = new Array(UNIT_COUNT).fill(0);
      ca1[ca] = men;
      const cb1 = new Array(UNIT_COUNT).fill(0);
      cb1[cb] = men;
      for (const seed of mine) {
        both(seed, army(ca1, fa, 0, false), army(cb1, fb, 200, false), (bt, aTeam) => () => {
          const r = bt.result!;
          add(t, `${k}:n`);
          if (r.winner === aTeam) add(t, `${k}:win`);
          add(t, `${k}:ticks`, r.ticks);
          add(t, `${k}:aLeft`, r.sides[aTeam].alive[ca]! / men);
          add(t, `${k}:bLeft`, r.sides[aTeam === 0 ? 1 : 0].alive[cb]! / men);
        });
      }
    }
  }
  return t;
}

/** Per class and side ('A'/'B'), over the standard army at each size. */
function types(mine: number[]): Tally {
  const t: Tally = {};
  for (const men of arg('sizes', '500,2800').split(',').map(Number)) {
    for (const seed of mine) {
      both(seed, army(standard(men), fa, 0, true), army(standard(men), fb, 200, true), (bt, aTeam) => {
        const inside = bt as unknown as { strike(a: number, t: number): void; hurt(t: number, amount: number, by: number): void };
        const side = (team: number) => (team === aTeam ? 'A' : 'B');
        const key = (team: number, cls: number) => `${men}:${side(team)}:${cls}`;
        const strike = inside.strike;
        const hurt = inside.hurt;
        let landing = -1;
        inside.strike = function (a: number, d: number) {
          add(t, `${key(bt.soldiers[a]!.team, bt.soldiers[a]!.cls)}:blows`);
          landing = a;
          strike.call(this, a, d);
          landing = -1;
        };
        inside.hurt = function (d: number, amount: number, by: number) {
          const s = bt.soldiers[d]!;
          if (s.state > State.Routing) return hurt.call(this, d, amount, by);
          const dealt = Math.min(amount, s.hp);
          hurt.call(this, d, amount, by);
          add(t, `${key(s.team, s.cls)}:taken`, dealt);
          if (by >= 0) {
            const k = key(bt.soldiers[by]!.team, bt.soldiers[by]!.cls);
            add(t, `${k}:dealt`, dealt);
            if (landing === by) add(t, `${k}:landed`);
          }
          if (s.state === State.Dead) {
            add(t, `${key(s.team, s.cls)}:deaths`);
            if (by >= 0) add(t, `${key(bt.soldiers[by]!.team, bt.soldiers[by]!.cls)}:kills`);
          }
        };
        const step = bt.step.bind(bt);
        bt.step = () => {
          step();
          if (bt.tick % 10 !== 0) return;
          for (const s of bt.soldiers) {
            if (s.state === State.Routing) add(t, `${key(s.team, s.cls)}:running`);
            else if (s.state === State.Fighting) add(t, `${key(s.team, s.cls)}:${s.target >= 0 ? 'fighting' : 'idle'}`);
          }
        };
        return () => {
          for (let c = 0; c < UNIT_COUNT; c++) for (const team of [0, 1]) add(t, `${key(team, c)}:men`, bt.startFigures[team as 0 | 1][c]!);
          for (const e of bt.events) if (e.kind === 'rout' || e.kind === 'shattered') if (e.reg !== undefined) add(t, `${key(e.team, e.cls)}:broke`);
          add(t, `${men}:battles`);
          if (bt.result!.winner === aTeam) add(t, `${men}:aWon`);
        };
      });
    }
  }
  return t;
}

function ladder(mine: number[]): Tally {
  const t: Tally = {};
  for (const men of arg('sizes', '120,250,500,1000,2000,2800').split(',').map(Number)) {
    for (const seed of mine) {
      both(seed, army(standard(men), fa, 0, true), army(standard(men), fb, 200, true), (bt, aTeam) => () => {
        const r = bt.result!;
        add(t, `${men}:n`);
        if (r.winner === aTeam) add(t, `${men}:win`);
        if (r.reason === 'time') add(t, `${men}:time`);
        add(t, `${men}:ticks`, r.ticks);
        if (bt.commanderFell[aTeam]) add(t, `${men}:aFell`);
        if (bt.commanderFell[1 - aTeam]) add(t, `${men}:bFell`);
        for (const e of bt.events) {
          const who = e.team === aTeam ? 'a' : 'b';
          if (e.kind === 'rout' || e.kind === 'shattered') add(t, `${men}:${who}Broke`);
          if (e.kind === 'rally' || e.kind === 'reform') add(t, `${men}:${who}Rallied`);
          if (e.kind === 'joins') add(t, `${men}:${who}Joined`, e.count ?? 0);
        }
        add(t, `${men}:regs`, bt.regiments.filter((g) => g.team === aTeam).length);
        const line = bt.regiments.filter((g) => g.team === aTeam && g.role === 'line');
        add(t, `${men}:block`, line.reduce((s, g) => s + g.start, 0) / Math.max(1, line.length));
        add(t, `${men}:first`, line.filter((g) => g.line === 1).length);
        add(t, `${men}:shock`, Math.max(0, ...line.filter((g) => g.cls === U.Shock).map((g) => g.start)));
      });
    }
  }
  return t;
}

function mirror(mine: number[]): Tally {
  const t: Tally = {};
  for (const men of arg('sizes', '250,500,1500,2800').split(',').map(Number)) {
    for (const seed of mine) {
      const r = new Battle({ version: BATTLE_VERSION, seed, kind: 'daily', armies: [army(standard(men), fa, 0, true), army(standard(men), fa, 200, true)] }).run();
      add(t, `${men}:n`);
      if (r.winner === 0) add(t, `${men}:win0`);
      if (r.reason === 'time') add(t, `${men}:time`);
      add(t, `${men}:ticks`, r.ticks);
      for (const side of [0, 1] as const) {
        if (r.sides[side].commanderFell) add(t, `${men}:fell${side}`);
        add(t, `${men}:risen${side}`, (r.sides[side].risen ?? []).reduce((a, b) => a + b, 0));
      }
    }
  }
  return t;
}

const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(0)}%`;
const f1 = (x: number) => x.toFixed(1);

function report(t: Tally): void {
  const g = (k: string) => t[k] ?? 0;
  if (mode === 'duels') {
    console.log(`${fa} (rows) against ${fb} (columns), ${arg('men', '30')} men a block: ${fa}'s share of the wins (mean length s; men left ${fa}/${fb})`);
    console.log(['', ...NAMES.slice(0, UNIT_COUNT - 1)].map((s) => s.padStart(18)).join(''));
    for (let a = 0; a < UNIT_COUNT - 1; a++) {
      const row = [NAMES[a]!.padStart(18)];
      for (let b = 0; b < UNIT_COUNT - 1; b++) {
        const k = `${a}:${b}`;
        const n = g(`${k}:n`);
        row.push(`${pct(g(`${k}:win`), n)} ${(g(`${k}:ticks`) / n / 10).toFixed(0)}s ${(g(`${k}:aLeft`) / n).toFixed(1)}/${(g(`${k}:bLeft`) / n).toFixed(1)}`.padStart(18));
      }
      console.log(row.join(''));
    }
  } else if (mode === 'types') {
    for (const men of arg('sizes', '500,2800').split(',').map(Number)) {
      const n = g(`${men}:battles`);
      console.log(`\n${men} a side, ${n} battles, ${fa} (A) won ${pct(g(`${men}:aWon`), n)}. Per figure of the class (figure-seconds for fighting/idle/running):`);
      console.log(['side', 'class', 'figs', 'blows', 'landed%', 'dealt', 'taken', 'kills', 'deaths', 'fighting', 'idle', 'running', 'broke/batl'].map((s) => s.padStart(9)).join(''));
      for (const side of ['A', 'B']) {
        for (let c = 0; c < UNIT_COUNT; c++) {
          const k = `${men}:${side}:${c}`;
          const figs = g(`${k}:men`);
          if (figs === 0) continue;
          const per = (x: string) => f1(g(`${k}:${x}`) / figs);
          console.log([side, NAMES[c]!, f1(figs / n), per('blows'), pct(g(`${k}:landed`), g(`${k}:blows`)), per('dealt'), per('taken'), (g(`${k}:kills`) / figs).toFixed(2), (g(`${k}:deaths`) / figs).toFixed(2), per('fighting'), per('idle'), per('running'), (g(`${k}:broke`) / n).toFixed(2)].map((s) => s.padStart(9)).join(''));
        }
      }
    }
  } else if (mode === 'mirror') {
    console.log(`${fa} against ${fa}, the standard army, one battle a seed: team 0's share of the wins (z against a fair coin)`);
    console.log(['men', 'battles', 'team 0 won', 'z', 'length', 'timeout', '0 gen fell', '1 gen fell', '0 risen', '1 risen'].map((s) => s.padStart(11)).join(''));
    for (const men of arg('sizes', '250,500,1500,2800').split(',').map(Number)) {
      const n = g(`${men}:n`);
      const z = (g(`${men}:win0`) - n / 2) / Math.sqrt(Math.max(1, n) / 4);
      console.log([men, n, pct(g(`${men}:win0`), n), z.toFixed(2), `${(g(`${men}:ticks`) / n / 10).toFixed(0)}s`, g(`${men}:time`), pct(g(`${men}:fell0`), n), pct(g(`${men}:fell1`), n), f1(g(`${men}:risen0`) / n), f1(g(`${men}:risen1`) / n)].map((s) => String(s).padStart(11)).join(''));
    }
  } else {
    console.log(`${fa} against ${fb}, the standard army: ${fa}'s share of the wins by size`);
    console.log(['men', 'battles', 'won', 'length', 'timeout', 'A gen fell', 'B gen fell', 'A broke', 'B broke', 'B rallied', 'B fell in', 'regs', 'line block', 'first line', 'shock blk'].map((s) => s.padStart(11)).join(''));
    for (const men of arg('sizes', '120,250,500,1000,2000,2800').split(',').map(Number)) {
      const n = g(`${men}:n`);
      console.log([men, n, pct(g(`${men}:win`), n), `${(g(`${men}:ticks`) / n / 10).toFixed(0)}s`, g(`${men}:time`), pct(g(`${men}:aFell`), n), pct(g(`${men}:bFell`), n), f1(g(`${men}:aBroke`) / n), f1(g(`${men}:bBroke`) / n), f1(g(`${men}:bRallied`) / n), f1(g(`${men}:bJoined`) / n), f1(g(`${men}:regs`) / n), f1(g(`${men}:block`) / n), f1(g(`${men}:first`) / n), f1(g(`${men}:shock`) / n)].map((s) => String(s).padStart(11)).join(''));
    }
  }
}

const shard = process.argv.indexOf('--shard');
const run = mode === 'duels' ? duels : mode === 'types' ? types : mode === 'ladder' ? ladder : mode === 'mirror' ? mirror : null;
if (!run) throw new Error('battle-stats duels | types | ladder | mirror');
if (shard >= 0) {
  const [k, of] = process.argv[shard + 1]!.split('/').map(Number);
  const mine = Array.from({ length: seeds }, (_, i) => i + 1).filter((s) => s % of! === k);
  process.stdout.write(JSON.stringify(run(mine)) + '\n');
} else {
  const script = fileURLToPath(import.meta.url);
  const parts = await Promise.all(
    Array.from({ length: jobs }, (_, k) => new Promise<Tally>((done, fail) => {
      const child = spawn(process.execPath, [...process.execArgv, script, ...process.argv.slice(2), '--shard', `${k}/${jobs}`], { stdio: ['ignore', 'pipe', 'inherit'] });
      let text = '';
      child.stdout.on('data', (c: Buffer) => (text += c.toString()));
      child.on('exit', (code) => (code === 0 ? done(JSON.parse(text) as Tally) : fail(new Error(`worker ${k} exited ${code}`))));
    })),
  );
  const all: Tally = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) add(all, k, v);
  report(all);
}
