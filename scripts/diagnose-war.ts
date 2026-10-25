// Runs synthetic ring wars and prints how they unfolded.
//
// One war, narrated: `pnpm tsx scripts/diagnose-war.ts [players] [minutes]`, with
// RATE=<pushes per player per hour> (default 20), SEED, QUIET=1.
//
// Whole seeded days, for balance: `DAYS=<n> pnpm tsx scripts/diagnose-war.ts [humans] [bots]` with
// FROM=<first day seed> (default 1). Each human gets a working window (starting within SPREAD hours
// around 09:00, default 2, and 7 to 11 hours long) and a push rate from 0.8 to 6 an hour
// (log-uniform), drawn per day; bots keep the office hours the server gives them (`botDay`: a 7 to 10
// hour window from 08:00-10:00, a rate from 0.8 to 6 an hour, now and then an evening session). Prints one JSON line per day, then a summary: how often the
// day's top committer (most pushes expected) won, when the ring fell, how often anyone fell before noon,
// and the cost of a tick.
//
// MAINTAINERS=<n> makes the first n humans maintainers: small fixes to others' established code in a
// big repository, measured with the difficulty bonus (rules/difficulty.ts) as ingestion would credit
// it (BONUS=0 turns the bonus off, to compare). The summary then says how often a maintainer won,
// against its fair share, and its budget against the greenfield pushers'.
import { KIND_COUNT, TICKS_PER_MINUTE, type SimInput } from '../src/sim/api.ts';
import { Chronicler } from '../src/sim/chronicle.ts';
import { generateMap, seatOrder, slotsFor } from '../src/sim/mapgen.ts';
import { armyFor, effectiveLedger, slotsOf } from '../src/sim/muster.ts';
import { STATS } from '../src/sim/stats.ts';
import { createWorld, dayWinner, step } from '../src/sim/world.ts';
import { bonusMilli, DAILY_BONUS_CAP, FILE_CAP, FILE_CREDIT, fileCreditMilli } from '../src/rules/difficulty.ts';
import { BOTS, botDay, botPush, botPushesPerDay, botRateAt, FUNCTIONS_PER_BRANCH, LINKS_PER_BRANCH, mulberry, type BotDay } from '../src/rules/bots.ts';

const MESSAGES = ['fix: crash on empty input', 'feat: add export', 'refactor: split parser', 'perf: cache lookups', 'revert: "feat: add export"', 'chore(deps): bump vite', 'Update handler'];

/** A developer's push: mostly code, with the purposes real commits have. */
function devPush(p: number, rand: () => number): Extract<SimInput, { kind: 'push' }> {
  const pick = (n: number) => Math.floor(rand() * n);
  const code = pick(260) + (rand() < 0.05 ? 500 : 0);
  const files = 1 + pick(code > 400 ? 14 : 6);
  const lines = [code, pick(80), Math.floor(code * rand() * 0.15), rand() < 0.2 ? pick(120) : 0, rand() < 0.2 ? pick(80) : 0, pick(120), rand() < 0.1 ? pick(4000) : 0, 0, Math.floor(code * 0.12)];
  const roll = rand();
  const msg = MESSAGES[roll < 0.25 ? 0 : roll < 0.5 ? 1 : roll < 0.62 ? 2 : roll < 0.7 ? 3 : roll < 0.73 ? 4 : roll < 0.8 ? 5 : 6]!;
  const branches = Math.floor(code / (5 + pick(6)));
  // Function points and linked names in the proportion this repository's own commits carry them.
  return { kind: 'push', p, repo: p * 2 + pick(2), commits: 1, msg, lines, files, branches, functions: Math.floor(branches * FUNCTIONS_PER_BRANCH), links: Math.floor(branches * LINKS_PER_BRANCH), churn: 0, filler: 0 };
}

const MAINTAINERS = Number(process.env.MAINTAINERS ?? 0);
const BONUS = process.env.BONUS !== '0';
/** Sensitivity only: scales each file's (M − 1), to see what multiplier a maintainer would need. 1 is the rule as built. */
const BONUS_SCALE = Number(process.env.BONUS_SCALE ?? 1);
/** The effort credit's constants, overridable for tuning (FILE_CREDIT=0 turns it off). */
const EFFORT_CREDIT = Number(process.env.FILE_CREDIT ?? FILE_CREDIT);
const EFFORT_CAP = Number(process.env.FILE_CAP ?? FILE_CAP);

type MaintainerDay = { files: Map<number, { modified: number; m: number; bonus: number; effort: number }>; bonus: number; effort: number };

/**
 * A maintainer's push: a small fix (median about 15 lines, now and then 100-200) to 1-4 files of a
 * big, much-worked repository, most of it replacing other people's lines. Each file has a multiplier
 * drawn from what such files measure (×2.2 to ×3.2, the vite fixture's range), and the day's bonus
 * per file follows the ledger's rule: the first 40 modified lines in full, then a square root, the
 * day's total at most DAILY_BONUS_CAP; a file that reaches 3 modified lines earns the effort credit
 * (FILE_CREDIT × (M − 1) / 2.2, at most FILE_CAP files' worth a day). `day` carries the per-file state
 * across the day's pushes.
 */
function maintainerPush(p: number, rand: () => number, day: MaintainerDay): Extract<SimInput, { kind: 'push' }> {
  const pick = (n: number) => Math.floor(rand() * n);
  const big = rand() < 0.1;
  const code = big ? 100 + pick(100) : 3 + Math.floor(Math.pow(rand(), 1.6) * 57);
  const removed = Math.floor(code * (0.6 + rand() * 0.4));
  const nFiles = 1 + pick(big ? 6 : 3);
  // Mostly fixes and refactors; a test now and then.
  const roll = rand();
  const msg = roll < 0.6 ? 'fix: respect build option in css' : roll < 0.8 ? 'refactor: simplify resolver' : roll < 0.9 ? 'perf: cache lookups' : 'feat: add option';
  const lines = [code, rand() < 0.5 ? pick(30) : 0, Math.floor(code * rand() * 0.1), 0, 0, removed, 0, 0, Math.floor(code * 0.1)];
  let before = 0;
  let after = 0;
  let effortBefore = 0;
  let effortAfter = 0;
  // The day's files: a maintainer returns to the same core files (a pool of 25).
  let left = Math.floor(Math.min(code, removed) * 0.8);
  for (let f = 0; f < nFiles && left > 0; f++) {
    const id = pick(25);
    const share = f === nFiles - 1 ? left : Math.max(1, Math.floor(left / (nFiles - f)));
    left -= share;
    let state = day.files.get(id);
    if (!state) day.files.set(id, (state = { modified: 0, m: Math.round(1000 + BONUS_SCALE * (1200 + rand() * 1000)), bonus: 0, effort: 0 }));
    state.modified += share;
    const now = bonusMilli(state.modified, state.m);
    before += state.bonus;
    after += now;
    state.bonus = now;
    const effort = fileCreditMilli(state.modified, state.m, EFFORT_CREDIT);
    effortBefore += state.effort;
    effortAfter += effort;
    state.effort = effort;
  }
  const capped = (x: number, cap: number) => Math.floor(Math.max(0, Math.min(x, cap * 1000)) / 1000);
  const bonus = BONUS
    ? capped(day.bonus + after - before, DAILY_BONUS_CAP) - capped(day.bonus, DAILY_BONUS_CAP) + capped(day.effort + effortAfter - effortBefore, EFFORT_CAP * EFFORT_CREDIT) - capped(day.effort, EFFORT_CAP * EFFORT_CREDIT)
    : 0;
  day.bonus += after - before;
  day.effort += effortAfter - effortBefore;
  const branches = Math.floor(code / (5 + pick(4)));
  return { kind: 'push', p, repo: p * 2, commits: 1, msg, lines, files: nFiles, branches, functions: Math.floor(branches * FUNCTIONS_PER_BRANCH * 0.3), links: 0, churn: 0, filler: 0, bonus };
}

function narrate(): void {
  const players = Number(process.argv[2] ?? 4);
  const minutes = Number(process.argv[3] ?? 20);
  const rate = Number(process.env.RATE ?? 20);
  const quiet = process.env.QUIET === '1';
  const params = { seed: Number(process.env.SEED ?? 42), slots: slotsFor(players), members: players };
  const world = createWorld(params, generateMap(params));
  const seats = seatOrder(params.seed, params.slots);
  const chron = new Chronicler({ player: (p) => `@p${p}`, repo: (r) => `org/repo${r}` });
  const rand = mulberry(7);
  const counts: Record<string, number> = {};
  const raised = new Array<number>(KIND_COUNT).fill(0);
  const deaths = new Array<number>(KIND_COUNT).fill(0);
  const kills = new Array<number>(KIND_COUNT).fill(0);
  const started = performance.now();
  let peak = 0;
  for (let t = 0; t < minutes * TICKS_PER_MINUTE && world.victor < 0; t++) {
    const inputs: SimInput[] = [];
    if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: seats[p]!, hue: p * 60 });
    for (let p = 0; p < players; p++) if (rand() < rate / (60 * TICKS_PER_MINUTE)) inputs.push(devPush(p, rand));
    const ev = step(world, inputs);
    peak = Math.max(peak, world.units.length);
    for (const d of ev.deaths) {
      deaths[d.kind]!++;
      if (d.by >= 0) kills[d.by]!++;
    }
    for (const e of chron.narrate(world, inputs, ev)) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      if (!quiet && !['muster', 'wiped', 'rout', 'capture'].includes(e.kind)) console.log(`${(e.tick / TICKS_PER_MINUTE).toFixed(1)}m ${e.text}`);
    }
  }
  for (const p of world.players) for (let k = 0; k < KIND_COUNT; k++) raised[k]! += p.raised[k]!;
  const ms = performance.now() - started;
  console.log({ ticks: world.tick, msPerTick: +(ms / world.tick).toFixed(3), peakUnits: peak, units: world.units.length, platoons: world.platoons.length, victor: world.victor, victoryMin: world.victoryTick >= 0 ? +(world.victoryTick / TICKS_PER_MINUTE).toFixed(1) : null, counts });
  console.log('kind            raised  kills deaths   k/d');
  for (let k = 0; k < KIND_COUNT; k++) {
    const kd = deaths[k]! > 0 ? (kills[k]! / deaths[k]!).toFixed(2) : '-';
    console.log(`${STATS[k]!.name.padEnd(15)} ${String(raised[k]).padStart(6)} ${String(kills[k]).padStart(6)} ${String(deaths[k]).padStart(6)} ${kd.padStart(5)}`);
  }
  for (const p of world.players) console.log(`p${p.p} slot=${p.slot} renown=${p.renown} kills=${p.kills} losses=${p.losses} pushes=${p.pushes} forts=${p.captures} conquests=${p.conquests} capitals=${p.capitals} rising=${p.rising} queue=${p.queue.length}`);
  console.log('capitals', world.structures.map((s) => `${s.site}:p${s.p} ${Math.round(s.hp)}/${s.maxHp}`).join(' '));
}

interface DayResult {
  day: number;
  seats: number;
  winner: number;
  top: number;
  topWon: boolean;
  victoryHour: number | null;
  firstFallHour: number | null;
  firstCaptureHour: number | null;
  falls: number;
  capitals: number[];
  code: number[];
  bonus: number[];
  rates: number[];
  starts: number[];
  expected: number[];
  raised12: number[];
  raised: number[];
  /** The day's army at the end, in slots, without conquest bonuses: what each player's work was worth. */
  budget: number[];
  /** Effective code: the code the budget counted. */
  effCode: number[];
  /** The top committer's budget over the best other player's. */
  topRatio: number;
  /** The largest budget over the second largest. */
  leadRatio: number;
  msPerTick: number;
  peakUnits: number;
}

/** Hours over which humans' working days start, centred on 09:00 (SPREAD=5 spreads them from 06:30 to 11:30). */
const SPREAD = Number(process.env.SPREAD ?? 2);

function runDay(day: number, humans: number, bots: number): DayResult {
  const rand = mulberry(day * 7919 + 13);
  const players = humans + bots;
  const params = { seed: day, slots: slotsFor(players), members: players };
  const world = createWorld(params, generateMap(params));
  const seats = seatOrder(params.seed, params.slots);
  const hour = 60 * TICKS_PER_MINUTE;
  // Per human: a working window and a rate; per bot: its persona and the server's office hours for it.
  const from: number[] = [];
  const until: number[] = [];
  const rates: number[] = [];
  const persona: (typeof BOTS)[number][] = [];
  const schedule: BotDay[] = [];
  for (let p = 0; p < players; p++) {
    if (p < humans) {
      const start = 9 - SPREAD / 2 + rand() * SPREAD;
      from.push(Math.floor(start * hour));
      until.push(Math.floor((start + 7 + rand() * 4) * hour));
      rates.push(+(0.8 * Math.pow(6 / 0.8, rand())).toFixed(2));
    } else {
      const b = (p - humans) % BOTS.length;
      persona[p] = BOTS[b]!;
      const sched = botDay(params.seed, b);
      schedule[p] = sched;
      from.push(Math.floor(sched.windows[0]![0] * hour));
      until.push(Math.floor(sched.windows[0]![1] * hour));
      rates.push(+sched.rate.toFixed(2));
    }
  }
  const code = new Array<number>(players).fill(0);
  const bonus = new Array<number>(players).fill(0);
  const maintainerDays = Array.from({ length: players }, (): MaintainerDay => ({ files: new Map(), bonus: 0, effort: 0 }));
  let raised12: number[] = [];
  let firstFall: number | null = null;
  let firstCapture: number | null = null;
  let falls = 0;
  let peak = 0;
  const started = performance.now();
  const end = 24 * hour;
  while (world.tick < end && world.victor < 0) {
    const t = world.tick;
    const inputs: SimInput[] = [];
    if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: seats[p]!, hue: p * 40 });
    for (let p = 0; p < players; p++) {
      const rate = p < humans ? (t >= from[p]! && t < until[p]! ? rates[p]! : 0) : botRateAt(schedule[p]!, t / hour);
      if (rate <= 0 || rand() >= rate / hour) continue;
      let push: Extract<SimInput, { kind: 'push' }>;
      if (p < MAINTAINERS && p < humans) push = maintainerPush(p, rand, maintainerDays[p]!);
      else if (p < humans) push = devPush(p, rand);
      else {
        const b = botPush(persona[p]!, rand);
        push = { kind: 'push', p, repo: p * 2, commits: 1, msg: b.message, lines: b.lines, files: b.files, branches: b.branches, functions: b.functions, links: b.links, churn: b.churn, filler: b.filler };
      }
      code[p]! += Math.max(0, push.lines[0]!);
      bonus[p]! += push.bonus ?? 0;
      inputs.push(push);
    }
    const ev = step(world, inputs);
    if (world.tick === 12 * hour) raised12 = world.players.map((p) => p.raised.reduce((a, b) => a + b, 0));
    if (process.env.TRACE && world.tick % (hour / 2) === 0) {
      const alive = new Array<number>(players).fill(0);
      for (const u of world.units) alive[u.p]!++;
      const forts = world.sites.slice(world.map.slots).map((x) => x.owner);
      console.error(`${world.tick / hour}h first=${world.players.map((p) => (p.firstPushAt / hour).toFixed(1)).join(',')} alive=${alive.join(',')} raised=${world.players.map((p) => p.raised.reduce((a, b) => a + b, 0)).join(',')} renown=${world.players.map((p) => p.renown).join(',')} walls=${world.structures.map((st) => `p${st.p}:${Math.round(st.hp / 1000)}k`).join(' ')} forts=${forts.join(',')} seats=${seats.slice(0, players).join(',')}`);
    }
    if (process.env.TRACE) for (const c of ev.conquests) {
      const def = world.map.sites[c.site]!;
      const near = world.units.filter((u) => u.p === c.p && Math.hypot(u.x - def.x, u.y - def.y) < 300);
      const kinds: Record<string, number> = {};
      for (const u of near) kinds[STATS[u.kind]!.name] = (kinds[STATS[u.kind]!.name] ?? 0) + 1;
      console.error('   at walls:', JSON.stringify(kinds), 'siege since', (world.structures.find((st) => st.site === c.site)!.siegeSince / hour).toFixed(2));
    }
    if (process.env.TRACE) for (const c of ev.conquests) console.error(`  ${(world.tick / hour).toFixed(2)}h p${c.p} took slot ${world.map.sites[c.site]!.slot} from p${c.previous}${c.retake ? ' (retake)' : ''}; alive ${world.units.filter((u) => u.p === c.p).length}`);
    if (ev.conquests.length > 0) firstCapture ??= world.tick;
    if (ev.risings.length > 0) {
      falls += ev.risings.length;
      firstFall ??= world.tick;
    }
    if (world.units.length > peak) peak = world.units.length;
  }
  const ms = performance.now() - started;
  // The digest's winner; a day no one fought goes to the first seat, as before.
  const winner = dayWinner(world) ?? 0;
  // The day's top committer: the player expected to push the most (rate times working hours).
  const expected = rates.map((r, p) => (p < humans ? r * (until[p]! - from[p]!) : botPushesPerDay(schedule[p]!) * hour));
  let top = 0;
  for (let p = 1; p < players; p++) if (expected[p]! > expected[top]!) top = p;
  const budget = world.players.map((p) => slotsOf(armyFor(p.ledger, p.pushes, 0)));
  const sorted = budget.slice().sort((a, b) => b - a);
  const others = Math.max(1, ...budget.filter((_, p) => p !== top));
  return {
    day,
    seats: players,
    winner,
    top,
    topWon: winner === top,
    victoryHour: world.victoryTick >= 0 ? +(world.victoryTick / hour).toFixed(2) : null,
    firstFallHour: firstFall !== null ? +(firstFall / hour).toFixed(2) : null,
    firstCaptureHour: firstCapture !== null ? +(firstCapture / hour).toFixed(2) : null,
    falls,
    capitals: world.players.map((p) => p.capitals),
    code,
    bonus,
    rates,
    starts: from.map((t) => +(t / hour).toFixed(2)),
    expected: expected.map((e) => Math.round(e / hour)),
    raised12,
    raised: world.players.map((p) => p.raised.reduce((a, b) => a + b, 0)),
    budget,
    effCode: world.players.map((p) => effectiveLedger(p.ledger).code),
    topRatio: +(budget[top]! / others).toFixed(2),
    leadRatio: +(sorted[0]! / Math.max(1, sorted[1] ?? 1)).toFixed(2),
    msPerTick: +(ms / world.tick).toFixed(4),
    peakUnits: peak,
  };
}

function days(): void {
  const n = Number(process.env.DAYS);
  const first = Number(process.env.FROM ?? 1);
  const humans = Number(process.argv[2] ?? 4);
  const bots = Number(process.argv[3] ?? 0);
  const results: DayResult[] = [];
  for (let d = first; d < first + n; d++) {
    const r = runDay(d, humans, bots);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  const share = (f: (r: DayResult) => boolean) => `${Math.round((100 * results.filter(f).length) / results.length)}%`;
  const median = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    return v.length > 0 ? v[v.length >> 1]! : null;
  };
  const won = results.filter((r) => r.victoryHour !== null).map((r) => r.victoryHour!).sort((a, b) => a - b);
  console.log(JSON.stringify({
    days: results.length,
    humans,
    bots,
    topCommitterWins: share((r) => r.topWon),
    conquered: share((r) => r.victoryHour !== null),
    conquestBefore15h: share((r) => r.victoryHour !== null && r.victoryHour < 15),
    conquestHourMedian: won.length > 0 ? won[won.length >> 1] : null,
    firstCaptureHourMedian: median(results.map((r) => r.firstCaptureHour)),
    fallBeforeNoon: share((r) => r.firstFallHour !== null && r.firstFallHour < 12),
    // Against bots: how often a human won, overall and by the push rate it drew that day (a fair share is humans / seats).
    ...(bots > 0 && humans > 0
      ? {
          humansWin: share((r) => r.winner < humans),
          fairShare: `${Math.round((100 * humans) / (humans + bots))}%`,
          humansWinByRate: Object.fromEntries(
            ([['<1.5', 0, 1.5], ['1.5-3', 1.5, 3], ['>=3', 3, 99]] as const).map(([k, lo, hi]) => {
              const days = results.filter((r) => r.rates[0]! >= lo && r.rates[0]! < hi);
              return [k, days.length > 0 ? `${Math.round((100 * days.filter((r) => r.winner === 0).length) / days.length)}% of ${days.length}` : '-'];
            }),
          ),
        }
      : {}),
    ...(MAINTAINERS > 0 && humans > MAINTAINERS
      ? (() => {
          const greenBudget = (r: DayResult) => median(r.budget.slice(MAINTAINERS, humans)) ?? 1;
          return {
            maintainers: MAINTAINERS,
            bonus: BONUS,
            bonusScale: BONUS_SCALE,
            fileCredit: EFFORT_CREDIT,
            fileCap: EFFORT_CAP,
            maintainerWins: share((r) => r.winner < MAINTAINERS),
            maintainerFairShare: `${Math.round((100 * MAINTAINERS) / (humans + bots))}%`,
            maintainerBudgetVsGreenfieldMedian: median(results.map((r) => +(r.budget[0]! / Math.max(1, greenBudget(r))).toFixed(2))),
            maintainerCodePerDayMedian: median(results.map((r) => r.code[0]!)),
            maintainerBonusPerDayMedian: median(results.map((r) => r.bonus[0]!)),
            greenfieldCodePerDayMedian: median(results.flatMap((r) => r.code.slice(MAINTAINERS, humans))),
            maintainerWinsByRate: Object.fromEntries(
              ([['<1.5', 0, 1.5], ['1.5-3', 1.5, 3], ['>=3', 3, 99]] as const).map(([k, lo, hi]) => {
                const days = results.filter((r) => r.rates[0]! >= lo && r.rates[0]! < hi);
                return [k, days.length > 0 ? `${Math.round((100 * days.filter((r) => r.winner === 0).length) / days.length)}% of ${days.length}` : '-'];
              }),
            ),
            // A maintainer with a normal workday: 2 to 4 pushes an hour.
            maintainerWinsAtNormalRate: (() => {
              const days = results.filter((r) => r.rates[0]! >= 2 && r.rates[0]! < 4);
              return days.length > 0 ? `${Math.round((100 * days.filter((r) => r.winner === 0).length) / days.length)}% of ${days.length}` : '-';
            })(),
          };
        })()
      : {}),
    topRatioMedian: median(results.map((r) => r.topRatio)),
    leadRatioMedian: median(results.map((r) => r.leadRatio)),
    budgetMedian: median(results.flatMap((r) => r.budget)),
    budgetMax: Math.max(...results.flatMap((r) => r.budget)),
    peakUnitsMedian: median(results.map((r) => r.peakUnits)),
    peakUnitsMax: Math.max(...results.map((r) => r.peakUnits)),
    msPerTick: +(results.reduce((a, r) => a + r.msPerTick, 0) / results.length).toFixed(4),
  }));
}

if (process.env.DAYS) days();
else narrate();
