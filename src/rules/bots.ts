// Sparring bots: synthetic developers whose pushes keep a room lively.

import { CAT_COUNT, Cat } from '../sim/api.ts';

export interface BotPersona {
  login: string;
  style: 'balanced' | 'tester' | 'refactorer' | 'scribe' | 'ops' | 'hacker' | 'vendorer';
  repos: [string, string][];
  /** Relative liveliness: the in-browser demo's pushes per 3.5 minutes. A room's bots keep office hours instead (`botDay`). */
  rate: number;
  /**
   * How much each push's lines are scaled by, so that every persona's pushes carry about as much
   * code as a typical developer's (some 150 lines): a tester's or an ops bot's style changes what its
   * army is made of, not that it is outworked by a human pushing as often.
   */
  volume: number;
}

export const BOTS: readonly BotPersona[] = [
  { login: 'ada-bot', style: 'balanced', repos: [['ada-bot/analytical-engine', 'Rust'], ['ada-bot/notes', 'Markdown']], rate: 2.2, volume: 1.3 },
  { login: 'grace-bot', style: 'tester', repos: [['grace-bot/cobol-revival', 'Java'], ['grace-bot/compiler', 'C']], rate: 1.8, volume: 2.8 },
  { login: 'linus-bot', style: 'refactorer', repos: [['linus-bot/kernel-lite', 'C'], ['linus-bot/git-tools', 'Shell']], rate: 2.5, volume: 1.9 },
  { login: 'katherine-bot', style: 'scribe', repos: [['katherine-bot/orbits', 'Python'], ['katherine-bot/handbook', 'Markdown']], rate: 1.5, volume: 2.4 },
  { login: 'margaret-bot', style: 'ops', repos: [['margaret-bot/apollo-ci', 'Go'], ['margaret-bot/infra', 'Nix']], rate: 1.9, volume: 4.2 },
  { login: 'dennis-bot', style: 'hacker', repos: [['dennis-bot/unix-ng', 'C'], ['dennis-bot/tiny-lang', 'TypeScript']], rate: 2.8, volume: 1.25 },
  { login: 'barbara-bot', style: 'vendorer', repos: [['barbara-bot/clu-web', 'JavaScript'], ['barbara-bot/abstractions', 'TypeScript']], rate: 1.6, volume: 2.8 },
];

type Purpose = 'feat' | 'fix' | 'refactor' | 'perf' | 'revert' | 'chore' | 'docs' | 'test';

// Commit headlines per purpose, in conventional-commit style, so the simulation reads each push's intent.
const MESSAGES: Record<Purpose, string[]> = {
  feat: ['feat: add retry policy', 'feat(api): expose metrics endpoint', 'feat: parse config v2', 'feat: implement cache layer', 'feat(ui): new settings panel'],
  fix: ['fix: off-by-one in tokenizer', 'fix(scheduler): race on shutdown', 'fix: crash on empty input', 'hotfix: null session after login', 'fix: flaky integration test'],
  refactor: ['refactor: remove dead code paths', 'refactor: collapse duplicate handlers', 'refactor(core): inline legacy adapter', 'refactor: delete unused feature flags'],
  perf: ['perf: cache compiled templates', 'perf(db): batch inserts', 'perf: avoid quadratic scan'],
  revert: ['revert: "feat: parse config v2"', 'Revert "experimental allocator"'],
  chore: ['chore(ci): pin runner images', 'build: tune container limits', 'chore(deps): bump lockfile', 'chore(deps): vendor charting library'],
  docs: ['docs: release process', 'docs: architecture notes', 'docs(api): annotate public types'],
  test: ['test: property tests for scheduler', 'test: cover tokenizer edge cases', 'test: snapshot rendering'],
};

/** Weights of each purpose per persona; a persona leans on its style but does a bit of everything. */
const MIX: Record<BotPersona['style'], Partial<Record<Purpose, number>>> = {
  balanced: { feat: 5, fix: 2, refactor: 1, perf: 1, test: 1, docs: 1 },
  tester: { test: 4, fix: 4, feat: 1, refactor: 1 },
  refactorer: { refactor: 5, fix: 2, perf: 1, feat: 1, revert: 1 },
  scribe: { docs: 4, feat: 2, fix: 1 },
  ops: { chore: 5, fix: 2, feat: 1 },
  hacker: { feat: 6, fix: 2, perf: 2, revert: 1 },
  vendorer: { chore: 5, feat: 2, fix: 1 },
};

export interface BotPush {
  repo: [string, string];
  lines: number[];
  /** Signed ledger deltas, like a real push's: a revert arrives as negative code. */
  files: number;
  branches: number;
  /** Function points and linked names, in the proportion honest code carries them to branch points. */
  functions: number;
  links: number;
  churn: number;
  filler: number;
  message: string;
}

/**
 * Function points and linked names per branch point, as this repository's own last 80 commits
 * measure them (5317 branch points, 2103 function points, 446 names): together about 0.44 points
 * of complexity for each branch point.
 */
export const FUNCTIONS_PER_BRANCH = 0.4;
export const LINKS_PER_BRANCH = 0.08;

/** A synthetic push for `bot`, drawn from `rand` (a 0..1 generator). */
export function botPush(bot: BotPersona, rand: () => number): BotPush {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const r = (min: number, max: number) => Math.floor(min + rand() * (max - min));
  const mix = MIX[bot.style];
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  let purpose: Purpose = 'feat';
  for (const [k, w] of Object.entries(mix) as [Purpose, number][]) {
    roll -= w;
    if (roll < 0) {
      purpose = k;
      break;
    }
  }
  let files = 1;
  switch (purpose) {
    case 'feat': {
      // Now and then a big feature lands: the stuff Champions and Dragons are made of.
      const legendary = (bot.style === 'balanced' || bot.style === 'hacker') && rand() < 0.02;
      const big = legendary || rand() < 0.12;
      lines[Cat.Code] = legendary ? r(650, 1200) : big ? r(300, 600) : r(30, 260);
      files = legendary ? r(9, 16) : big ? r(5, 11) : r(1, 6);
      if (bot.style !== 'hacker') lines[Cat.Test] = r(10, 90);
      break;
    }
    case 'fix':
      lines[Cat.Code] = rand() < 0.2 ? r(60, 180) : r(3, 50);
      lines[Cat.Removed] = r(1, 40);
      files = r(1, lines[Cat.Code]! > 60 ? 7 : 3);
      if (rand() < 0.6) lines[Cat.Test] = r(5, 40);
      break;
    case 'refactor':
      lines[Cat.Code] = r(20, 200);
      lines[Cat.Removed] = r(80, rand() < 0.2 ? 900 : 300);
      files = r(2, lines[Cat.Removed]! > 300 ? 12 : 7);
      break;
    case 'perf':
      lines[Cat.Code] = r(20, 150);
      lines[Cat.Removed] = r(5, 60);
      files = r(1, 4);
      break;
    case 'revert':
      // Undoing an earlier push today: its code leaves the ledger again.
      files = 0;
      break;
    case 'chore':
      lines[Cat.Config] = r(5, 120);
      if (bot.style === 'vendorer') {
        if (rand() < 0.5) lines[Cat.Vendor] = r(500, 5000);
        else lines[Cat.Generated] = r(800, 9000);
      }
      lines[Cat.Code] = rand() < 0.3 ? r(1, 30) : 0;
      files = lines[Cat.Code]! > 0 ? r(1, 3) : 0;
      break;
    case 'docs':
      lines[Cat.Docs] = r(30, 300);
      lines[Cat.Code] = rand() < 0.4 ? r(5, 60) : 0;
      files = lines[Cat.Code]! > 0 ? r(1, 3) : 0;
      break;
    case 'test':
      lines[Cat.Test] = r(40, 260);
      lines[Cat.Code] = r(0, 40);
      files = lines[Cat.Code]! > 0 ? r(1, 3) : 0;
      break;
  }
  for (const c of [Cat.Code, Cat.Test, Cat.Docs, Cat.Config, Cat.Removed]) lines[c] = Math.floor(lines[c]! * bot.volume);
  files = Math.round(files * Math.min(2, bot.volume));
  const code = lines[Cat.Code]!;
  if (code > 0 && bot.style !== 'hacker') lines[Cat.Comment] = Math.floor(code * (0.03 + rand() * 0.12));
  lines[Cat.Blank] = Math.floor(code * 0.12);
  if (bot.style === 'scribe' && code > 0) lines[Cat.Comment]! += r(10, 40);
  // Branch points scale with code; hackers write denser logic.
  const density = bot.style === 'hacker' ? 6 : 8;
  const branches = code > 0 ? Math.max(0, Math.floor((code / density) * (0.6 + rand() * 0.8))) : 0;
  const repo = bot.repos[Math.floor(rand() * bot.repos.length)]!;
  const pool = MESSAGES[purpose];
  const message = pool[Math.floor(rand() * pool.length)]!;
  if (purpose === 'revert') {
    const undone = Math.floor(r(20, 200) * bot.volume);
    lines.fill(0);
    lines[Cat.Code] = -undone;
    const b = -Math.floor(undone / 8);
    return { repo, lines, files: 0, branches: b, functions: -Math.floor(-b * FUNCTIONS_PER_BRANCH), links: -Math.floor(-b * LINKS_PER_BRANCH), churn: 2 * undone, filler: 0, message };
  }
  // Bots write a little filler, as real code has: closing braces and literal tables.
  return { repo, lines, files, branches, functions: Math.floor(branches * FUNCTIONS_PER_BRANCH), links: Math.floor(branches * LINKS_PER_BRANCH), churn: 0, filler: Math.floor(code * 0.15), message };
}

/** A bot's working day: when it pushes, and how often, in room-local hours (0 at the room's reset). */
export interface BotDay {
  /** Pushes per hour while at work. */
  rate: number;
  /** [from, until) hours of its working window, and of an evening session if it has one. */
  windows: [number, number][];
}

/** Bounds of a bot's push rate, per hour of work: the range of real developers. */
export const BOT_RATE = [0.8, 6] as const;

/**
 * Bot `bot`'s day in the war seeded `seed`: a working window of 7 to 10 hours starting between 08:00
 * and 10:00, now and then an evening session (two days in five, 30 to 90 minutes between 19:00 and
 * 23:00), and a push rate drawn log-uniformly from BOT_RATE, all drawn afresh for every war. Bots
 * keep a person's hours, so a lone human is not out-pushed around the clock.
 */
export function botDay(seed: number, bot: number): BotDay {
  const rand = mulberry(Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(bot + 1, 0x85ebca6b));
  rand();
  const start = 8 + rand() * 2;
  const windows: [number, number][] = [[start, start + 7 + rand() * 3]];
  const rate = BOT_RATE[0] * Math.pow(BOT_RATE[1] / BOT_RATE[0], rand());
  if (rand() < 0.4) {
    const from = 19 + rand() * 2.5;
    windows.push([from, Math.min(23, from + 0.5 + rand())]);
  }
  return { rate, windows };
}

/** Bot pushes per hour at room-local `hour` (taken modulo 24). */
export function botRateAt(day: BotDay, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (const [from, until] of day.windows) if (h >= from && h < until) return day.rate;
  return 0;
}

/** Pushes a bot is expected to make in a whole day. */
export function botPushesPerDay(day: BotDay): number {
  return day.windows.reduce((a, [from, until]) => a + (until - from) * day.rate, 0);
}

/** A small seeded generator for bot schedules and demo wars. */
export function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
