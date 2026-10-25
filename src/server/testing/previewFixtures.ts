// A public repository's recent history for the army preview, with diffs that read like real
// work: a bug fix, a test-only commit, comment padding, a lockfile bump, docs, a refactor that
// deletes code, a merge, a legendary feature, performance work, an untested feature and a
// binary-only commit. Beside it (`previewFixture`): repositories for the difficulty bonus (a
// greenfield commit, a maintainer's fixes to others' code in vite with effort credit, the same fix
// in a fork pending upstream merge and in a small repository the gate holds) and one whose commit
// is mostly filler (a ragged army). Every code line is distinct in name and shape, so the ledger's filters
// (duplicates, shapes, filler) leave it whole, as they would leave honest code.

import type { ChangedFile } from '../../rules/classify.ts';
import { mulberry } from '../../rules/bots.ts';
import type { CommitMeta } from '../github.ts';
import { FORK_REPO, FRESH_BASE, FRESH_HEAD, FRESH_REPO, GATED_REPO, installGreenfield, installViteFork, installViteGated, MAINTAINER, VITE_BASE, VITE_DAY_HEAD, VITE_HEAD, VITE_REPO, viteFiles } from './difficultyFixtures.ts';
import { commitMeta, FakeGithub } from './fakeGithub.ts';

const WORDS = [
  'ledger', 'tally', 'muster', 'banner', 'siege', 'planner', 'route', 'scout', 'herald', 'camp', 'supply', 'wagon', 'gate', 'wall', 'tower', 'keep', 'front',
  'march', 'order', 'rank', 'column', 'flank', 'reserve', 'courier', 'signal', 'beacon', 'ration', 'quarter', 'watch', 'patrol', 'harbor', 'bridge', 'ford',
  'road', 'pass', 'ridge', 'valley', 'forest', 'river', 'anvil', 'forge', 'quiver', 'arrow', 'lance', 'shield', 'helm', 'saddle', 'stable', 'granary',
];

/** A generator of distinct, plausible lines; one per file family so two fixtures never collide. */
export class Scribe {
  private seen = new Set<string>();
  private rand: () => number;
  constructor(seed: number) {
    this.rand = mulberry(seed);
  }
  private word(): string {
    return WORDS[Math.floor(this.rand() * WORDS.length)]!;
  }
  private name(): string {
    const a = this.word();
    const b = this.word();
    return a === b ? a : `${a}${b[0]!.toUpperCase()}${b.slice(1)}`;
  }
  private fresh(make: () => string): string {
    for (;;) {
      const line = make();
      if (!this.seen.has(line)) {
        this.seen.add(line);
        return line;
      }
    }
  }
  /** Code lines; `branchy` of them carry branch points (`if`, `&&`, `?:`, `for`). */
  code(n: number, branchy = 0.4, indent = '  '): string[] {
    const plain = [
      () => `const ${this.name()} = ${this.name()}.${this.name()}(${this.name()}, ${this.name()});`,
      () => `${this.name()}.${this.name()}(${this.name()}, ${this.name()}.${this.name()});`,
      () => `let ${this.name()} = await ${this.name()}(${this.name()}.${this.name()});`,
      () => `return ${this.name()}.${this.name()}((${this.name()}) => ${this.name()}(${this.name()}));`,
    ];
    const branching = [
      () => `if (${this.name()}.${this.name()} && ${this.name()}) return ${this.name()}(${this.name()});`,
      () => `for (const ${this.name()} of ${this.name()}.${this.name()}) ${this.name()}.${this.name()}(${this.name()});`,
      () => `${this.name()}.${this.name()} = ${this.name()} ? ${this.name()}(${this.name()}) : ${this.name()};`,
      () => `while (${this.name()}.${this.name()} || ${this.name()}) ${this.name()}.${this.name()}();`,
    ];
    return Array.from({ length: n }, () => {
      const pool = this.rand() < branchy ? branching : plain;
      return indent + this.fresh(pool[Math.floor(this.rand() * pool.length)]!);
    });
  }
  comments(n: number): string[] {
    return Array.from({ length: n }, () => `  // The ${this.word()} keeps the ${this.name()} ready while the ${this.word()} ${this.fresh(() => this.name())} waits.`);
  }
  tests(n: number): string[] {
    return Array.from({ length: n }, () => `  ${this.fresh(() => `expect(${this.name()}(${this.name()}, ${this.name()})).toEqual(${this.name()});`)}`);
  }
  prose(n: number): string[] {
    return Array.from({ length: n }, () => this.fresh(() => `The ${this.word()} of each ${this.word()} is checked before the ${this.word()} and the ${this.word()} are ${this.word()}ed.`));
  }
  yaml(n: number): string[] {
    return Array.from({ length: n }, () => this.fresh(() => `  ${this.name()}@${Math.floor(this.rand() * 9)}.${Math.floor(this.rand() * 40)}.${Math.floor(this.rand() * 20)}: { resolution: { integrity: sha512-${this.name()}${this.name()} } }`));
  }
}

/** One file's diff: lines removed, then lines added, in one hunk. */
export function diff(filename: string, added: string[], removed: string[] = [], status = removed.length === 0 ? 'added' : 'modified'): ChangedFile {
  const header = `@@ -1,${removed.length} +1,${added.length} @@`;
  return { filename, status, additions: added.length, deletions: removed.length, patch: [header, ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n') };
}

/** Code spread over `files` source files under `dir`. */
function spread(scribe: Scribe, dir: string, files: number, lines: number, branchy: number, ext = 'ts'): ChangedFile[] {
  const names = ['planner', 'routes', 'supply', 'columns', 'beacons', 'quarters', 'couriers', 'granary', 'bridges', 'patrols', 'signals', 'forge', 'stables', 'ridges', 'harbors', 'towers'];
  return Array.from({ length: files }, (_, i) => {
    const n = Math.floor(lines / files) + (i < lines % files ? 1 : 0);
    return diff(`${dir}/${names[i % names.length]}${i >= names.length ? i : ''}.${ext}`, scribe.code(n, branchy));
  });
}

export const FIXTURE_REPO = 'ironquill/siegeworks';

interface FixtureCommit {
  message: string;
  author: string;
  hoursAgo: number;
  files: ChangedFile[];
  merge?: boolean;
}

/** The fixture history, newest first. */
export function fixtureCommits(): FixtureCommit[] {
  const s = new Scribe(7);
  return [
    { message: 'fix: crash when a siege ends with an empty ledger', author: 'mara-quill', hoursAgo: 2, files: [...spread(s, 'src/siege', 5, 520, 0.12), diff('src/siege/ledger.test.ts', s.tests(64))] },
    { message: 'test: cover the tokenizer edge cases', author: 'osric', hoursAgo: 5, files: [diff('src/lang/tokenizer.test.ts', s.tests(140)), diff('src/lang/fixtures/edge.test.ts', s.tests(120))] },
    { message: 'Explain the wagon queue', author: 'thessaly', hoursAgo: 9, files: [diff('src/supply/wagons.ts', [...s.comments(190), ...s.code(64, 0.2)])] },
    { message: 'chore(deps): bump lockfile', author: 'renovate-ish', hoursAgo: 14, files: [diff('pnpm-lock.yaml', s.yaml(1240), s.yaml(1180)), diff('package.json', ['    "zod": "^4.6.7",'], ['    "zod": "^4.6.2",'])] },
    { message: 'docs: write down the release process', author: 'thessaly', hoursAgo: 20, files: [diff('docs/release.md', s.prose(260))] },
    {
      message: 'refactor: collapse the duplicate march handlers',
      author: 'osric',
      hoursAgo: 27,
      files: [
        ...['handlers', 'orders', 'columns', 'flanks', 'reserve'].map((n) => diff(`src/march/${n}.ts`, s.code(22, 0.2), s.code(130, 0.2))),
        diff('src/march/legacy.ts', [], s.code(220, 0.2), 'removed'),
      ],
    },
    { message: 'Merge pull request #42 from mara-quill/siege-planner', author: 'mara-quill', hoursAgo: 30, merge: true, files: [] },
    {
      message: 'feat: add the siege planner',
      author: 'mara-quill',
      hoursAgo: 31,
      files: [
        diff('src/planner/index.ts', [...s.comments(50), ...s.code(100, 0.3)]),
        ...spread(s, 'src/planner', 13, 1320, 0.3),
        diff('src/planner/planner.test.ts', s.tests(180)),
        diff('src/planner/README.md', s.prose(40)),
      ],
    },
    { message: 'perf: cache compiled route templates', author: 'osric', hoursAgo: 40, files: [...spread(s, 'src/routes', 3, 180, 0.2), diff('src/routes/cache.test.ts', s.tests(24))] },
    { message: 'feat: implement courier retry policy', author: 'kestrel-dev', hoursAgo: 52, files: spread(s, 'src/couriers', 4, 230, 0.2) },
    { message: 'Add banner art', author: 'thessaly', hoursAgo: 60, files: [{ filename: 'assets/banner.png', status: 'added', additions: 0, deletions: 0, patch: null }, { filename: 'assets/banner@2x.png', status: 'added', additions: 0, deletions: 0, patch: null }] },
  ];
}

export function fixtureSha(i: number, branch = 'main'): string {
  // Deterministic, hex, distinct per branch.
  let h = 0x811c9dc5;
  for (const ch of `${branch}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return (h.toString(16).padStart(8, '0').repeat(5)).slice(0, 40);
}

/** A FakeGithub holding the fixture repository (main and a release branch) and a private one. */
export function previewFixture(now = Date.now()): FakeGithub {
  const github = new FakeGithub();
  const history: CommitMeta[] = fixtureCommits().map((c, i) => ({
    sha: fixtureSha(i),
    message: c.message,
    authorLogin: c.author,
    authorName: c.author,
    avatarUrl: null,
    date: new Date(now - c.hoursAgo * 3_600_000).toISOString(),
    merge: c.merge ?? false,
  }));
  github.addRepo(FIXTURE_REPO, history);
  fixtureCommits().forEach((c, i) => {
    github.setCommit(FIXTURE_REPO, fixtureSha(i), { commits: [{ sha: fixtureSha(i), authorLogin: c.author, message: c.message, ...(c.merge ? { merge: true } : {}) }], files: c.files });
  });
  // A release branch sharing the older history.
  github.addRepo(FIXTURE_REPO, history.slice(6), { branch: 'release/1.x' });
  github.addRepo('ironquill/war-chest', [], { private: true });
  github.addRepo('ironquill/blank-slate', [], { branch: 'main' });
  installHardEdits(github, now);
  installPadded(github, now);
  return github;
}

export const PADDED_REPO = 'ironquill/sprite-sheet';

/** A commit that is mostly filler: one style rule copied for 312 icons, past the shape cap. Ragged, and its filler penalised. */
export function paddedFiles(): ChangedFile[] {
  const icons = Array.from({ length: 312 }, (_, i) => `.icon-${i.toString(36)}x { background: var(--sprite); }`);
  return [diff('src/client/styles/hud.css', icons), diff('src/client/hud/icons.ts', new Scribe(17).code(40, 0.2))];
}

function installPadded(github: FakeGithub, now: number): void {
  const sha = 'f1'.repeat(20);
  github.addRepo(PADDED_REPO, [commitMeta(sha, 'Add the icon sprite classes', { authorLogin: 'osric', authorName: 'osric', date: new Date(now - 3 * 3_600_000).toISOString() })]);
  github.setCommit(PADDED_REPO, sha, { commits: [], files: paddedFiles() });
}

/**
 * The difficulty bonus's repositories, with the facts, blame and history the preview reads for each
 * commit's context: a greenfield commit (mara/fresh-app), a maintainer's two fixes to others' code in
 * vite (the original 5-line fix, every file under 3 modified lines, and a harder one with effort
 * credit for 3 hard files), the harder one in a fork pending upstream merge (mara/vite), and in a
 * small repository the gate holds to ×1.5 (mara/sourcemap-kit).
 */
function installHardEdits(github: FakeGithub, now: number): void {
  const at = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const by = { authorLogin: MAINTAINER.login, authorName: MAINTAINER.login, authorId: MAINTAINER.id };
  const fresh = installGreenfield(github);
  github.addRepo(FRESH_REPO, [commitMeta(FRESH_HEAD, 'feat: first cut of the app', { ...by, date: at(1), parent: FRESH_BASE })]);
  github.setCommit(FRESH_REPO, FRESH_HEAD, { commits: [], files: fresh.files, base: FRESH_BASE });
  // installViteFork installs the vite fixture and the harder fix too.
  const fork = installViteFork(github);
  github.setCommit(VITE_REPO, VITE_HEAD, { commits: [], files: viteFiles().map((f) => f.file), base: VITE_BASE });
  github.addRepo(VITE_REPO, [
    commitMeta(VITE_DAY_HEAD, 'fix: resolve build.sourcemap per environment', { ...by, date: at(2), parent: VITE_BASE }),
    commitMeta(VITE_HEAD, 'fix: respect build.sourcemap for css and assets', { ...by, date: at(26), parent: VITE_BASE }),
  ]);
  github.addRepo(FORK_REPO, [commitMeta(fork.head, 'fix: resolve build.sourcemap per environment', { ...by, date: at(2), parent: VITE_BASE })]);
  installViteGated(github);
  github.addRepo(GATED_REPO, [commitMeta(VITE_DAY_HEAD, 'fix: resolve build.sourcemap per environment', { ...by, date: at(4), parent: VITE_BASE })]);
}
