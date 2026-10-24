// Runs synthetic ring wars and prints how they unfolded.
//
// One war, narrated: `pnpm tsx scripts/diagnose-war.ts [players] [minutes]`, with
// RATE=<pushes per player per hour> (default 20), SEED, QUIET=1.
//
// Whole seeded days, for balance: `DAYS=<n> pnpm tsx scripts/diagnose-war.ts [humans] [bots]` with
// FROM=<first day seed> (default 1). Each human gets a working window (starting within SPREAD hours
// around 09:00, default 2, and 7 to 11 hours long) and a push rate from 0.8 to 6 an hour
// (log-uniform), drawn per day; bots push all day at their
// persona's rate, as the server's do. Prints one JSON line per day, then a summary: how often the
// day's top committer (most code pushed) won, when the ring fell, how often anyone fell before noon,
// and the cost of a tick.
import { KIND_COUNT, TICKS_PER_MINUTE, type SimInput, type World } from '../src/sim/api.ts';
import { Chronicler } from '../src/sim/chronicle.ts';
import { generateMap, seatOrder, slotsFor } from '../src/sim/mapgen.ts';
import { STATS } from '../src/sim/stats.ts';
import { createWorld, step } from '../src/sim/world.ts';
import { BOTS, botPush, mulberry } from '../src/rules/bots.ts';

const MESSAGES = ['fix: crash on empty input', 'feat: add export', 'refactor: split parser', 'perf: cache lookups', 'revert: "feat: add export"', 'chore(deps): bump vite', 'Update handler'];

/** A developer's push: mostly code, with the purposes real commits have. */
function devPush(p: number, rand: () => number): Extract<SimInput, { kind: 'push' }> {
  const pick = (n: number) => Math.floor(rand() * n);
  const code = pick(260) + (rand() < 0.05 ? 500 : 0);
  const files = 1 + pick(code > 400 ? 14 : 6);
  const lines = [code, pick(80), Math.floor(code * rand() * 0.15), rand() < 0.2 ? pick(120) : 0, rand() < 0.2 ? pick(80) : 0, pick(120), rand() < 0.1 ? pick(4000) : 0, 0, Math.floor(code * 0.12)];
  const roll = rand();
  const msg = MESSAGES[roll < 0.25 ? 0 : roll < 0.5 ? 1 : roll < 0.62 ? 2 : roll < 0.7 ? 3 : roll < 0.73 ? 4 : roll < 0.8 ? 5 : 6]!;
  return { kind: 'push', p, repo: p * 2 + pick(2), commits: 1, msg, lines, files, branches: Math.floor(code / (5 + pick(6))), churn: 0, filler: 0 };
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
    if (t === 10) for (let p = 0; p < players; p++) if (p % 5 !== 0) inputs.push({ kind: 'doctrine', p, doctrine: ((p % 4) + 1) as 1 });
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
  falls: number;
  capitals: number[];
  code: number[];
  rates: number[];
  starts: number[];
  expected: number[];
  raised12: number[];
  raised: number[];
  msPerTick: number;
  peakUnits: number;
}

/** The day's winner as the digest names it: the ring's conqueror, else most capitals, renown, first joined. */
function winnerOf(world: World): number {
  if (world.victor >= 0) return world.victor;
  let best = 0;
  for (const p of world.players) {
    const b = world.players[best]!;
    if (p.capitals > b.capitals || (p.capitals === b.capitals && p.renown > b.renown)) best = p.p;
  }
  return best;
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
  // Per human: a working window and a rate; per bot: its persona's rate, all day.
  const from: number[] = [];
  const until: number[] = [];
  const rates: number[] = [];
  const persona: (typeof BOTS)[number][] = [];
  for (let p = 0; p < players; p++) {
    if (p < humans) {
      const start = 9 - SPREAD / 2 + rand() * SPREAD;
      from.push(Math.floor(start * hour));
      until.push(Math.floor((start + 7 + rand() * 4) * hour));
      rates.push(+(0.8 * Math.pow(6 / 0.8, rand())).toFixed(2));
    } else {
      const bot = BOTS[(p - humans) % BOTS.length]!;
      persona[p] = bot;
      from.push(0);
      until.push(24 * hour);
      rates.push(bot.rate);
    }
  }
  const code = new Array<number>(players).fill(0);
  let raised12: number[] = [];
  let firstFall: number | null = null;
  let falls = 0;
  let peak = 0;
  const started = performance.now();
  const end = 24 * hour;
  while (world.tick < end && world.victor < 0) {
    const t = world.tick;
    const inputs: SimInput[] = [];
    if (t === 0) for (let p = 0; p < players; p++) inputs.push({ kind: 'join', p, slot: seats[p]!, hue: p * 40 });
    for (let p = 0; p < players; p++) {
      if (t < from[p]! || t >= until[p]! || rand() >= rates[p]! / hour) continue;
      let push: Extract<SimInput, { kind: 'push' }>;
      if (p < humans) push = devPush(p, rand);
      else {
        const b = botPush(persona[p]!, rand);
        push = { kind: 'push', p, repo: p * 2, commits: 1, msg: b.message, lines: b.lines, files: b.files, branches: b.branches, churn: b.churn, filler: b.filler };
      }
      code[p]! += Math.max(0, push.lines[0]!);
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
    if (ev.risings.length > 0) {
      falls += ev.risings.length;
      firstFall ??= world.tick;
    }
    if (world.units.length > peak) peak = world.units.length;
  }
  const ms = performance.now() - started;
  const winner = winnerOf(world);
  // The day's top committer: the player expected to push the most (rate times working hours).
  const expected = rates.map((r, p) => r * (until[p]! - from[p]!));
  let top = 0;
  for (let p = 1; p < players; p++) if (expected[p]! > expected[top]!) top = p;
  return {
    day,
    seats: players,
    winner,
    top,
    topWon: winner === top,
    victoryHour: world.victoryTick >= 0 ? +(world.victoryTick / hour).toFixed(2) : null,
    firstFallHour: firstFall !== null ? +(firstFall / hour).toFixed(2) : null,
    falls,
    capitals: world.players.map((p) => p.capitals),
    code,
    rates,
    starts: from.map((t) => +(t / hour).toFixed(2)),
    expected: expected.map((e) => Math.round(e / hour)),
    raised12,
    raised: world.players.map((p) => p.raised.reduce((a, b) => a + b, 0)),
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
  const won = results.filter((r) => r.victoryHour !== null).map((r) => r.victoryHour!).sort((a, b) => a - b);
  console.log(JSON.stringify({
    days: results.length,
    humans,
    bots,
    topCommitterWins: share((r) => r.topWon),
    conquered: share((r) => r.victoryHour !== null),
    conquestBefore15h: share((r) => r.victoryHour !== null && r.victoryHour < 15),
    conquestHourMedian: won.length > 0 ? won[won.length >> 1] : null,
    fallBeforeNoon: share((r) => r.firstFallHour !== null && r.firstFallHour < 12),
    msPerTick: +(results.reduce((a, r) => a + r.msPerTick, 0) / results.length).toFixed(4),
  }));
}

if (process.env.DAYS) days();
else narrate();
