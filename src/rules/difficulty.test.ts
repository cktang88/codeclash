import { beforeAll, describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { applyDelta, BONUS_PER_CODE, budgetOf, effectiveLedger, emptyLedger } from '../sim/muster.ts';
import type { ChangedFile } from './classify.ts';
import { loadAllGrammars } from './complexity.ts';
import {
  bonusMilli,
  changedLinesOf,
  DAILY_BONUS_CAP,
  fileContext,
  FULL_LINES,
  GATE_CAP,
  independentAuthors,
  modifiedCredit,
  multiplier,
  pusherOf,
  repoGate,
  repoOrigin,
  s,
  type FileContext,
  type PushContext,
  type RawFileFacts,
  type RepoFacts,
} from './difficulty.ts';
import { measurePush, MemoryLedger, type PushDelta } from './ledger.ts';

beforeAll(() => loadAllGrammars());

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-23T15:00:00Z');

/** A modified file: `removed` lines at old line `at` replaced by `added`, with a line of context on either side. */
function edit(path: string, at: number, removed: readonly string[], added: readonly string[]): ChangedFile {
  const header = `@@ -${at - 1},${removed.length + 2} +${at - 1},${added.length + 2} @@`;
  const patch = [header, ' const before = prepare(input);', ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`), ' const after = finish(output);'].join('\n');
  return { filename: path, status: 'modified', additions: added.length, deletions: removed.length, patch };
}

/** Context for a file whose removed lines from `at` on (n of them) are someone else's, with multiplier `m`. */
function ctx(path: string, m: number, others: number[]): FileContext {
  return { path, mMilli: Math.round(m * 1000), rawMilli: Math.round(m * 1000), gate: { passed: true, reason: null }, lines: 3000, linesOthers: 3000, authorsOthers: 100, fileCommits: 500, medianAgeDays: 900, fromYear: 2021, others, source: 'graphql' };
}
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
const contextOf = (...files: FileContext[]): PushContext => ({ files: Object.fromEntries(files.map((f) => [f.path, f])) });

/** Distinct code lines (no numbered names: each line has its own shape). */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'];
function code(n: number, salt: string): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) {
    const a = WORDS[i % 16]!;
    const b = WORDS[Math.floor(i / 16) % 16]!;
    const c = WORDS[Math.floor(i / 256) % 16]!;
    out.push(`${salt}${a}.${b} = compute${c[0]!.toUpperCase()}${c.slice(1)}(${b}, ${a}.${c});`);
  }
  return out;
}

const bonusOf = (deltas: readonly PushDelta[]) => deltas.reduce((n, d) => n + (d.bonus ?? 0), 0);

describe('the multiplier', () => {
  it('follows the formula and its bounds', () => {
    expect(s(0)).toBe(0);
    expect(s(1)).toBe(1);
    expect(s(100)).toBe(1);
    expect(s(-5)).toBe(0);
    expect(multiplier({ linesOthers: 0, authorsOthers: 0, medianAgeDays: 0, fileCommits: 0 })).toBe(1);
    expect(multiplier({ linesOthers: 0, authorsOthers: 1, medianAgeDays: 0, fileCommits: 0 })).toBe(1);
    // Every signal saturated: 1 + 0.8 + 0.6 + 0.4 + 0.4.
    expect(multiplier({ linesOthers: 1e6, authorsOthers: 1e3, medianAgeDays: 1e4, fileCommits: 1e4 })).toBeCloseTo(3.2, 10);
    // Half of each saturation point: s(0.5) = log2(1.5).
    const half = Math.log2(1.5);
    expect(multiplier({ linesOthers: 250, authorsOthers: 3, medianAgeDays: 182.5, fileCommits: 25 })).toBeCloseTo(1 + 2.2 * half, 10);
    // Never below 1, never above 4, monotone in every signal.
    for (let i = 0; i < 200; i++) {
      const x = { linesOthers: (i * 37) % 900, authorsOthers: i % 11, medianAgeDays: (i * 13) % 800, fileCommits: (i * 7) % 90 };
      const m = multiplier(x);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(4);
      expect(multiplier({ ...x, linesOthers: x.linesOthers + 50 })).toBeGreaterThanOrEqual(m);
      expect(multiplier({ ...x, fileCommits: x.fileCommits + 5 })).toBeGreaterThanOrEqual(m);
    }
  });

  it('credits the first 40 modified lines in full, then the square root of the rest', () => {
    expect(modifiedCredit(0)).toBe(0);
    expect(modifiedCredit(5)).toBe(5);
    expect(modifiedCredit(FULL_LINES)).toBe(40);
    expect(modifiedCredit(41)).toBe(41);
    expect(modifiedCredit(140)).toBe(50);
    expect(modifiedCredit(10_040)).toBe(140);
    expect(bonusMilli(5, 3200)).toBe(11_000);
    expect(bonusMilli(140, 3200)).toBe(110_000);
    expect(bonusMilli(140, 1000)).toBe(0);
  });
});

describe('context from blame and history', () => {
  const repo: RepoFacts = { fullName: 'org/core', fork: false, createdAt: Date.parse('2019-01-01T00:00:00Z'), stars: 900, forks: 80, sizeKb: 9000 };
  const PUSHER = pusherOf(7, 'ana', ['ana@example.com']);
  const old = Date.parse('2021-03-01T00:00:00Z');

  it('reads the old line numbers a patch changes from its hunk headers, and the context beside pure insertions', () => {
    const patch = ['@@ -10,4 +10,4 @@', ' a', '-b', '+B', ' c', ' d', '@@ -40,3 +40,5 @@', ' x', '+new1', '+new2', ' y', ' z'].join('\n');
    expect(changedLinesOf(patch)).toEqual({ removed: [11], around: [40, 41] });
  });

  it('leaves the pusher out of lines, authors, age and commits, and ignores accounts made last week', () => {
    const facts: RawFileFacts = {
      blame: [
        { start: 1, end: 100, at: old, author: 'id:1' },
        { start: 101, end: 200, at: old, author: 'id:7' },
        { start: 201, end: 300, at: old, author: 'id:2' },
        { start: 301, end: 400, at: old, author: 'id:3', authorCreatedAt: NOW - 5 * DAY },
      ],
      history: { total: 40, commits: [{ at: old, author: 'id:7' }, { at: old, author: 'id:7' }, { at: old, author: 'id:1' }, { at: old, author: 'id:9', authorCreatedAt: NOW - 2 * DAY }] },
    };
    const gate = repoGate(repo, independentAuthors([facts], PUSHER, NOW));
    const c = fileContext({ path: 'src/core.ts', facts, changed: { removed: [50, 150, 250], around: [] }, pusher: PUSHER, now: NOW, origin: repoOrigin(repo), gate, source: 'graphql' });
    expect(c.lines).toBe(400);
    expect(c.linesOthers).toBe(300);
    // id:7 is the pusher; id:3 and id:9 are fresh accounts.
    expect(c.authorsOthers).toBe(2);
    expect(c.fileCommits).toBe(38);
    // Line 150 is the pusher's own: not modified code of others.
    expect(c.others).toEqual([50, 250]);
    expect(c.fromYear).toBe(2021);
    expect(gate.passed).toBe(true);
  });

  it('clamps backdated lines to the repository’s age (its source’s, for a fork) and to the author’s account', () => {
    const fresh: RepoFacts = { ...repo, createdAt: NOW - 2 * DAY };
    const facts: RawFileFacts = { blame: [{ start: 1, end: 900, at: Date.parse('2012-01-01T00:00:00Z'), author: 'id:1' }], history: { total: 900, commits: [] } };
    const gate = { passed: true, reason: null };
    const forged = fileContext({ path: 'a.ts', facts, changed: { removed: [5], around: [] }, pusher: PUSHER, now: NOW, origin: repoOrigin(fresh), gate, source: 'graphql' });
    expect(forged.medianAgeDays).toBeLessThanOrEqual(2);
    // A fork made yesterday of an old repository keeps its source's history.
    const fork: RepoFacts = { ...fresh, fork: true, source: { fullName: 'up/stream', createdAt: Date.parse('2011-01-01T00:00:00Z'), stars: 50_000, forks: 9000 } };
    const real = fileContext({ path: 'a.ts', facts, changed: { removed: [5], around: [] }, pusher: PUSHER, now: NOW, origin: repoOrigin(fork), gate, source: 'graphql' });
    expect(real.medianAgeDays).toBeGreaterThan(5000);
    // A line can be no older than its author's account.
    const young = fileContext({ path: 'a.ts', facts: { ...facts, blame: [{ ...facts.blame[0]!, authorCreatedAt: NOW - 10 * DAY }] }, changed: { removed: [5], around: [] }, pusher: PUSHER, now: NOW, origin: repoOrigin(fork), gate, source: 'graphql' });
    expect(young.medianAgeDays).toBeLessThanOrEqual(10);
  });

  it('gates the full multiplier on independent contributors before today and 5 stars or 2 forks', () => {
    expect(repoGate({ ...repo, stars: 4, forks: 1 }, 10)).toEqual({ passed: false, reason: 'fewer than 5 stars and 2 forks' });
    expect(repoGate({ ...repo, stars: 0, forks: 2 }, 2).passed).toBe(true);
    expect(repoGate(repo, 1).reason).toBe('fewer than 2 other contributors before today');
    expect(repoGate({ ...repo, stars: 0, forks: 0, fork: true, source: { fullName: 'up/stream', createdAt: 0, stars: 10, forks: 0 } }, 3).passed).toBe(true);
    // Commits made today, or by the pusher, do not make a contributor.
    const today = NOW - 3_600_000;
    const facts: RawFileFacts = { blame: [{ start: 1, end: 10, at: today, author: 'id:1' }], history: { total: 3, commits: [{ at: today, author: 'id:2' }, { at: old, author: 'id:7' }] } };
    expect(independentAuthors([facts], PUSHER, NOW)).toBe(0);
    // A failed gate holds M to 1.5.
    const big: RawFileFacts = { blame: [{ start: 1, end: 5000, at: old, author: 'id:1' }], history: { total: 900, commits: [] } };
    const held = fileContext({ path: 'a.ts', facts: big, changed: { removed: [1], around: [] }, pusher: PUSHER, now: NOW, origin: repoOrigin(repo), gate: repoGate({ ...repo, stars: 0, forks: 0 }, 5), source: 'graphql' });
    expect(held.rawMilli).toBeGreaterThan(2000);
    expect(held.mMilli).toBe(GATE_CAP * 1000);
  });
});

describe('the bonus in the ledger', () => {
  const CORE = 'src/core.ts';

  it('pays for modified lines of others’ code, and nothing for pure additions', () => {
    const before = code(5, 'old');
    const after = code(5, 'fix');
    const fix = measurePush([edit(CORE, 100, before, after)], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(100, 5))));
    expect(fix.lines[Cat.Code]).toBe(5);
    expect(fix.bonus).toBe(11);
    // The same multiplier on a file the push only adds to.
    const add: ChangedFile = { filename: CORE, status: 'modified', additions: 200, deletions: 0, patch: ['@@ -100,0 +100,200 @@', ...code(200, 'new').map((l) => `+${l}`)].join('\n') };
    const pure = measurePush([add], new MemoryLedger(), contextOf(ctx(CORE, 3.2, [])));
    expect(pure.lines[Cat.Code]).toBe(200);
    expect(pure.bonus).toBe(0);
    // A big feature beside a two-line fix in the same file: only the two lines are multiplied.
    const both = measurePush([edit(CORE, 100, code(2, 'old'), [...code(2, 'fix'), ...code(300, 'feat')])], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(100, 2))));
    expect(both.bonus).toBe(4);
  });

  it('applies the first-40-lines-then-square-root rule per file', () => {
    const d = measurePush([edit(CORE, 10, code(140, 'old'), code(140, 'new'))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 140))));
    expect(d.lines[Cat.Code]).toBe(140);
    expect(d.bonus).toBe(110);
  });

  it('gives the pusher’s own lines nothing: blamed to them, or written by them today', () => {
    // Blame says the removed lines are the pusher's own (not in `others`).
    const own = measurePush([edit(CORE, 100, code(10, 'old'), code(10, 'fix'))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, [])));
    expect(own.bonus).toBe(0);
    // Written today in an earlier push, then rewritten: even a context that names them as others' pays nothing,
    // because the ledger knows the lines are today's.
    const store = new MemoryLedger();
    const first = measurePush([{ filename: CORE, status: 'modified', additions: 10, deletions: 0, patch: ['@@ -100,0 +100,10 @@', ...code(10, 'mine').map((l) => `+${l}`)].join('\n') }], store);
    const second = measurePush([edit(CORE, 100, code(10, 'mine'), code(10, 'mine2'))], store, contextOf(ctx(CORE, 3.2, range(100, 10))));
    expect(bonusOf([first, second])).toBe(0);
  });

  it('gives trivial whitespace or comment edits to a core file about nothing', () => {
    const lines = code(40, 'core');
    const reindented = lines.map((l) => `    ${l.replace(/ = /, '  =  ')}`);
    const reformat = measurePush([edit(CORE, 10, lines, reindented)], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 40))));
    expect(reformat.bonus).toBe(0);
    expect(reformat.lines[Cat.Code]).toBe(0);
    const comments = Array.from({ length: 40 }, (_, i) => `// explains the ${WORDS[i % 16]} step of the ${WORDS[(i * 5) % 16]} loop`);
    const reworded = comments.map((c) => c.replace('explains', 'describes'));
    const commented = measurePush([edit(CORE, 10, comments, reworded)], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 40))));
    expect(commented.bonus).toBe(0);
    // A trailing comment changed on code lines is the same code.
    const trailing = measurePush([edit(CORE, 10, lines.map((l) => `${l} // old note`), lines.map((l) => `${l} // new note`))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 40))));
    expect(trailing.bonus).toBe(0);
  });

  it('a day split into pushes earns exactly its squash, including a removal and its replacement in separate pushes', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    const removed = files.map((f, i) => code(12 + 9 * i, `old${i}`));
    const added = files.map((f, i) => code(12 + 9 * i, `new${i}`));
    const context = contextOf(...files.map((f, i) => ctx(f, 2 + i * 0.5, range(10, 12 + 9 * i))));
    const squash = measurePush(files.map((f, i) => edit(f, 10, removed[i]!, added[i]!)), new MemoryLedger(), context);

    const split = new MemoryLedger();
    const deltas: PushDelta[] = [];
    // a.ts in one push; b.ts in two halves; c.ts's removal first and its replacement later.
    deltas.push(measurePush([edit(files[0]!, 10, removed[0]!, added[0]!)], split, context));
    deltas.push(measurePush([edit(files[1]!, 10, removed[1]!.slice(0, 10), added[1]!.slice(0, 10))], split, context));
    deltas.push(measurePush([edit(files[1]!, 20, removed[1]!.slice(10), added[1]!.slice(10))], split, contextOf(ctx(files[1]!, 2.5, range(20, 11)))));
    deltas.push(measurePush([edit(files[2]!, 10, removed[2]!, [])], split, context));
    deltas.push(measurePush([{ filename: files[2]!, status: 'modified', additions: added[2]!.length, deletions: 0, patch: [`@@ -9,1 +9,${added[2]!.length + 1} @@`, ' keep();', ...added[2]!.map((l) => `+${l}`)].join('\n') }], split));
    expect(bonusOf(deltas)).toBe(squash.bonus);
    expect(squash.bonus).toBeGreaterThan(0);
    const sum = (k: number) => deltas.reduce((n, d) => n + d.lines[k]!, 0);
    expect(sum(Cat.Code)).toBe(squash.lines[Cat.Code]);
    expect(sum(Cat.Removed)).toBe(squash.lines[Cat.Removed]);
  });

  it('freezes a file’s multiplier at its first sight of the day', () => {
    const store = new MemoryLedger();
    const a = measurePush([edit(CORE, 10, code(10, 'a'), code(10, 'b'))], store, contextOf(ctx(CORE, 2, range(10, 10))));
    // A later push brings a different context for the same file: the day keeps the first.
    const b = measurePush([edit(CORE, 50, code(10, 'c'), code(10, 'd'))], store, contextOf(ctx(CORE, 3.2, range(50, 10))));
    expect(a.bonus).toBe(10);
    expect(bonusOf([a, b])).toBe(20);
    // The next day the file is seen afresh.
    store.today++;
    const c = measurePush([edit(CORE, 90, code(10, 'e'), code(10, 'f'))], store, contextOf(ctx(CORE, 3.2, range(90, 10))));
    expect(c.bonus).toBe(22);
  });

  it('a modification reverted the same day takes its bonus back exactly', () => {
    const store = new MemoryLedger();
    const before = code(25, 'orig');
    const after = code(25, 'patched');
    const context = contextOf(ctx(CORE, 3.2, range(10, 25)));
    const fix = measurePush([edit(CORE, 10, before, after)], store, context);
    expect(fix.bonus).toBe(55);
    // The revert removes the pusher's own lines of today and restores the originals.
    const revert = measurePush([edit(CORE, 10, after, before)], store, contextOf(ctx(CORE, 3.2, [])));
    expect(revert.bonus).toBe(-55);
    expect(fix.lines[Cat.Code]! + revert.lines[Cat.Code]!).toBe(0);
    // A partial revert takes back its part.
    const store2 = new MemoryLedger();
    measurePush([edit(CORE, 10, before, after)], store2, context);
    const part = measurePush([edit(CORE, 10, after.slice(0, 5), before.slice(0, 5))], store2, contextOf(ctx(CORE, 3.2, [])));
    expect(part.bonus).toBe(Math.floor(20 * 2.2) - 55);
  });

  it('caps the day’s bonus at DAILY_BONUS_CAP lines, and the army counts it at most 3× the code', () => {
    const store = new MemoryLedger();
    let total = 0;
    for (let f = 0; f < 40; f++) {
      const path = `src/m${f}.ts`;
      total += measurePush([edit(path, 10, code(40, `o${f}x`), code(40, `n${f}y`))], store, contextOf(ctx(path, 3.2, range(10, 40)))).bonus ?? 0;
    }
    expect(total).toBe(DAILY_BONUS_CAP);
    const ledger = emptyLedger();
    applyDelta(ledger, { lines: [100, 0, 0, 0, 0, 100, 0, 0, 0], files: 3, branches: 0, churn: 0, filler: 0, bonus: 5000, purpose: 'fix' });
    expect(effectiveLedger(ledger).bonus).toBe(BONUS_PER_CODE * 100);
    // Code and bonus share the knee: 3000 code + 3000 bonus is 4000 + 1000.
    const big = emptyLedger();
    applyDelta(big, { lines: [3000, 0, 0, 0, 0, 0, 0, 0, 0], files: 1, branches: 0, churn: 0, filler: 0, bonus: 3000, purpose: 'fix' });
    expect(effectiveLedger(big).code + effectiveLedger(big).bonus).toBe(5000);
    const plain = emptyLedger();
    applyDelta(plain, { lines: [3000, 0, 0, 0, 0, 0, 0, 0, 0], files: 1, branches: 0, churn: 0, filler: 0, purpose: 'fix' });
    expect(budgetOf(big)).toBeGreaterThan(budgetOf(plain));
  });
});
