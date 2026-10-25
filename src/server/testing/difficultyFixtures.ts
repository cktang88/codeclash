// Hand-built fixtures for the difficulty bonus: a vite-like hard fix in a mature repository, and a
// greenfield commit. They install themselves into a FakeGithub (REST facts, languages, GraphQL blame
// and history) so tests and scripts/measure-difficulty.ts run the same pipeline ingestion runs.
//
// The vite fixture follows the shape of vitejs/vite 82e7aa037 ("fix: respect build.sourcemap…"):
// a 5-line fix across 4 files of 212 to 3,688 lines; css.ts has 519 commits and 127 authors, and the
// lines changed were written by others between 2021 and 2025. Paths, line numbers and code are
// approximations (this environment cannot reach that repository); the sizes and counts are as given.

import type { ChangedFile } from '../../rules/classify.ts';
import type { RepoFacts } from '../../rules/difficulty.ts';
import type { CompareResult } from '../github.ts';
import { blameOf, type FakeAuthor, type FakeGithub } from './fakeGithub.ts';

export const FIXTURE_NOW = Date.parse('2026-10-23T15:00:00Z');
export const MAINTAINER = { id: 4242, login: 'mara' };

/** A patch replacing lines `from…` of the old file, with three lines of context either side. */
export function hunk(from: number, before: readonly string[], removed: readonly string[], added: readonly string[], after: readonly string[]): string {
  const oldStart = from - before.length;
  const header = `@@ -${oldStart},${before.length + removed.length + after.length} +${oldStart},${before.length + added.length + after.length} @@`;
  return [header, ...before.map((l) => ` ${l}`), ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`), ...after.map((l) => ` ${l}`)].join('\n');
}

export function modified(filename: string, patch: string): ChangedFile {
  const lines = patch.split('\n');
  return { filename, status: 'modified', additions: lines.filter((l) => l.startsWith('+')).length, deletions: lines.filter((l) => l.startsWith('-')).length, patch };
}

const authors = (n: number, from = 1000): FakeAuthor[] => Array.from({ length: n }, (_, i) => ({ id: from + i, createdAt: '2014-06-01T00:00:00Z' }));
const years = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i}-0${1 + (i % 9)}-15T10:00:00Z`);

interface FixtureFile {
  file: ChangedFile;
  lines: number;
  commits: number;
  authors: number;
  /** Year the changed lines were written. */
  year: number;
  /** Old-side line numbers the fix changes. */
  at: number;
}

export const VITE_REPO = 'vitejs/vite';
export const VITE_BASE = 'b'.repeat(40);
export const VITE_HEAD = 'c'.repeat(40);

export const VITE_FACTS: RepoFacts = { fullName: VITE_REPO, fork: false, createdAt: Date.parse('2020-04-21T05:53:20Z'), stars: 74_000, forks: 6_900, sizeKb: 41_000 };

const ctx = (xs: string[]) => xs;

export function viteFiles(): FixtureFile[] {
  return [
    {
      lines: 3688, commits: 519, authors: 127, year: 2021, at: 2304,
      file: modified('packages/vite/src/node/plugins/css.ts', hunk(2304,
        ctx(['    const result = await compileCSS(environment, id, code)', '    if (result.modules) {', '      moduleCache.set(id, result.modules)']),
        ['      const sourcemap = config.css.devSourcemap', '      map: sourcemap ? result.map : null,'],
        ['      const sourcemap = environment.config.build.sourcemap || config.css.devSourcemap', '      map: sourcemap ? combineSourcemaps(id, [result.map]) : null,'],
        ctx(['    }', '    return { code: result.code, map }', '  },']))),
    },
    {
      lines: 1580, commits: 402, authors: 96, year: 2023, at: 611,
      file: modified('packages/vite/src/node/build.ts', hunk(611,
        ctx(['  const output = buildOutputOptions(options.rollupOptions.output)', '  const format = output.format || "es"', '  const jsExt =']),
        ['  const sourcemap = options.sourcemap === "inline" ? "inline" : !!options.sourcemap'],
        ['  const sourcemap = resolveSourcemapOption(options.sourcemap, environment.config.build.sourcemap)'],
        ctx(['  return {', '    dir: outDir,', '    format,']))),
    },
    {
      lines: 486, commits: 158, authors: 61, year: 2024, at: 214,
      file: modified('packages/vite/src/node/plugins/asset.ts', hunk(214,
        ctx(['    if (!config.build.ssr) {', '      const url = await fileToBuiltUrl(this, id)', '      return {']),
        ['        map: config.build.sourcemap ? this.getCombinedSourcemap() : null,'],
        ['        map: environment.config.build.sourcemap ? this.getCombinedSourcemap() : null,'],
        ctx(['        code: `export default ${JSON.stringify(url)}`,', '      }', '    }']))),
    },
    {
      lines: 212, commits: 24, authors: 9, year: 2025, at: 88,
      file: modified('packages/vite/src/node/utils/sourcemap.ts', hunk(88,
        ctx(['export function resolveSourcemapOption(', '  option: boolean | "inline" | "hidden",', ') {']),
        ['  return option === true ? "external" : option || false'],
        ['  return option === true || fallback === true ? "external" : option || fallback || false'],
        ctx(['}', '', 'export function injectSourcesContent(']))),
    },
  ];
}

/** Installs the vite fixture: repository facts, each file's blame and history at the base, and the compare. */
export function installVite(github: FakeGithub, opts: { pusherOwnsChangedLines?: boolean } = {}): { repo: string; base: string; head: string; files: ChangedFile[] } {
  github.setRepoFacts(VITE_FACTS, { TypeScript: 3_400_000, JavaScript: 410_000, CSS: 9_000 });
  const files = viteFiles();
  for (const f of files) {
    const people = authors(f.authors);
    const dates = years(2020, 2025);
    const blame = blameOf(f.lines, people, dates, 20);
    // The changed lines: written by others in the file's year (or by the maintainer, for the own-lines case).
    for (const r of blame) {
      if (r.start <= f.at + 1 && f.at <= r.end) {
        r.date = `${f.year}-05-10T12:00:00Z`;
        if (opts.pusherOwnsChangedLines) r.author = { id: MAINTAINER.id, createdAt: '2016-01-01T00:00:00Z' };
      }
    }
    const commits = Array.from({ length: Math.min(100, f.commits) }, (_, i) => ({ date: dates[i % dates.length]!, author: people[i % people.length]! }));
    github.setFileFacts(VITE_REPO, VITE_BASE, f.file.filename, { blame, history: { total: f.commits, commits } });
  }
  const result: CompareResult = {
    commits: [{ sha: VITE_HEAD, authorLogin: MAINTAINER.login, authorId: MAINTAINER.id, message: 'fix: respect build.sourcemap for css and assets', authorEmail: 'mara@example.com' }],
    files: files.map((f) => f.file),
    base: VITE_BASE,
  };
  github.setCompare(VITE_REPO, VITE_BASE, VITE_HEAD, result);
  return { repo: VITE_REPO, base: VITE_BASE, head: VITE_HEAD, files: result.files };
}

export const FRESH_REPO = 'mara/fresh-app';
export const FRESH_BASE = 'd'.repeat(40);
export const FRESH_HEAD = 'e'.repeat(40);

/** A greenfield commit: 500 new lines of honest TypeScript (distinct names, no numbered copies) in six new files of a repository made this week. */
export function greenfieldFiles(): ChangedFile[] {
  const verbs = ['load', 'save', 'parse', 'render', 'build', 'fetch', 'merge', 'apply', 'check', 'format'];
  const nouns = ['user', 'order', 'invoice', 'session', 'token', 'config', 'report', 'cart', 'item', 'route'];
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  const out: ChangedFile[] = [];
  let n = 0;
  for (let f = 0; f < 6; f++) {
    const lines: string[] = [];
    const want = f < 5 ? 84 : 500 - 5 * 84;
    for (let i = 0; lines.length < want; i++, n++) {
      const v = verbs[n % 10]!;
      const a = nouns[Math.floor(n / 10) % 10]!;
      const b = nouns[Math.floor(n / 100) % 10]!;
      if (i % 6 === 0) lines.push(`export function ${v}${cap(a)}${cap(b)}(${a}: ${cap(b)}, options: Options) {`);
      else if (i % 6 === 5) lines.push(`  return ${a}${cap(b)}.${v} ?? options.${b}${cap(v)};`);
      else lines.push(`  const ${a}${cap(b)}${cap(v)} = ${v}${cap(a)}(${b}.${a}, options.${v}${cap(b)});`);
    }
    const patch = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');
    out.push({ filename: `src/feature${f}.ts`, status: 'added', additions: lines.length, deletions: 0, patch });
  }
  return out;
}

export function installGreenfield(github: FakeGithub): { repo: string; base: string; head: string; files: ChangedFile[] } {
  github.setRepoFacts({ fullName: FRESH_REPO, fork: false, createdAt: Date.parse('2026-10-20T09:00:00Z'), stars: 0, forks: 0, sizeKb: 120 }, { TypeScript: 60_000 });
  const files = greenfieldFiles();
  github.setCompare(FRESH_REPO, FRESH_BASE, FRESH_HEAD, {
    commits: [{ sha: FRESH_HEAD, authorLogin: MAINTAINER.login, authorId: MAINTAINER.id, message: 'feat: first cut of the app', authorEmail: 'mara@example.com' }],
    files,
    base: FRESH_BASE,
  });
  return { repo: FRESH_REPO, base: FRESH_BASE, head: FRESH_HEAD, files };
}
