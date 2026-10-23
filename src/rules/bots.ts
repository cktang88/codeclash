// Sparring bots: synthetic developers whose pushes keep a room lively.

import { CAT_COUNT, Cat } from '../sim/api.ts';

export interface BotPersona {
  login: string;
  style: 'balanced' | 'tester' | 'refactorer' | 'scribe' | 'ops' | 'hacker' | 'vendorer';
  repos: [string, string][];
  /** Mean pushes per hour. */
  rate: number;
}

export const BOTS: readonly BotPersona[] = [
  { login: 'ada-bot', style: 'balanced', repos: [['ada-bot/analytical-engine', 'Rust'], ['ada-bot/notes', 'Markdown']], rate: 2.2 },
  { login: 'grace-bot', style: 'tester', repos: [['grace-bot/cobol-revival', 'Java'], ['grace-bot/compiler', 'C']], rate: 1.8 },
  { login: 'linus-bot', style: 'refactorer', repos: [['linus-bot/kernel-lite', 'C'], ['linus-bot/git-tools', 'Shell']], rate: 2.5 },
  { login: 'katherine-bot', style: 'scribe', repos: [['katherine-bot/orbits', 'Python'], ['katherine-bot/handbook', 'Markdown']], rate: 1.5 },
  { login: 'margaret-bot', style: 'ops', repos: [['margaret-bot/apollo-ci', 'Go'], ['margaret-bot/infra', 'Nix']], rate: 1.9 },
  { login: 'dennis-bot', style: 'hacker', repos: [['dennis-bot/unix-ng', 'C'], ['dennis-bot/tiny-lang', 'TypeScript']], rate: 2.8 },
  { login: 'barbara-bot', style: 'vendorer', repos: [['barbara-bot/clu-web', 'JavaScript'], ['barbara-bot/abstractions', 'TypeScript']], rate: 1.6 },
];

const MESSAGES: Record<BotPersona['style'], string[]> = {
  balanced: ['Add retry policy with tests and docs', 'Implement cache layer', 'Parse config v2', 'Expose metrics endpoint'],
  tester: ['Cover edge cases in tokenizer', 'Add property tests for scheduler', 'Fix flaky integration test', 'Snapshot rendering tests'],
  refactorer: ['Remove dead code paths', 'Collapse duplicate handlers', 'Inline legacy adapter', 'Delete unused feature flags'],
  scribe: ['Document the release process', 'Explain orbital mechanics module', 'Add architecture notes', 'Annotate public API'],
  ops: ['Pin CI images', 'Add staging deploy workflow', 'Tune container limits', 'Terraform the DNS zone'],
  hacker: ['wip', 'make it fast', 'it compiles', 'try a different allocator', 'yolo'],
  vendorer: ['Vendor charting library', 'Regenerate API client', 'Bump lockfile', 'Update bundled assets'],
};

/** A synthetic push for `bot`, drawn from `rand` (a 0..1 generator). */
export function botPush(bot: BotPersona, rand: () => number): { repo: [string, string]; lines: number[]; message: string } {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const r = (min: number, max: number) => Math.floor(min + rand() * (max - min));
  const code = r(10, 220);
  lines[Cat.Code] = code;
  lines[Cat.Comment] = Math.floor(code * (0.03 + rand() * 0.12));
  lines[Cat.Blank] = Math.floor(code * 0.12);
  if (rand() < 0.45) lines[Cat.Test] = r(5, 80);
  if (rand() < 0.2) lines[Cat.Docs] = r(5, 60);
  if (rand() < 0.15) lines[Cat.Config] = r(3, 40);
  if (rand() < 0.3) lines[Cat.Removed] = r(5, 120);
  switch (bot.style) {
    case 'balanced':
      lines[Cat.Test] = r(20, 90);
      lines[Cat.Docs] = r(5, 40);
      break;
    case 'tester':
      lines[Cat.Test] = r(60, 260);
      lines[Cat.Code] = Math.floor(code / 2);
      break;
    case 'refactorer':
      lines[Cat.Removed] = r(80, 500);
      break;
    case 'scribe':
      lines[Cat.Docs] = r(40, 300);
      lines[Cat.Comment] = r(20, 90);
      break;
    case 'ops':
      lines[Cat.Config] = r(30, 200);
      break;
    case 'hacker':
      lines[Cat.Code] = r(100, 600);
      lines[Cat.Comment] = 0;
      lines[Cat.Test] = 0;
      break;
    case 'vendorer':
      if (rand() < 0.5) lines[Cat.Vendor] = r(500, 5000);
      else lines[Cat.Generated] = r(800, 9000);
      break;
  }
  const repo = bot.repos[Math.floor(rand() * bot.repos.length)]!;
  const pool = MESSAGES[bot.style];
  return { repo, lines, message: pool[Math.floor(rand() * pool.length)]! };
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
