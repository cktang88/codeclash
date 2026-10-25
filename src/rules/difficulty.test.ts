import { beforeAll, describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { applyDelta, BONUS_PER_CODE, budgetOf, effectiveLedger, emptyLedger } from '../sim/muster.ts';
import type { ChangedFile } from './classify.ts';
import { loadAllGrammars } from './complexity.ts';
import {
  bonusMilli,
  changedLinesOf,
  DAILY_BONUS_CAP,
  EFFORT_REPEAT_DAYS,
  EFFORT_REPEAT_LINES,
  FILE_CAP,
  FILE_CREDIT,
  fileContext,
  fileCreditMilli,
  M_MAX,
  MEANINGFUL_LINES,
  FULL_LINES,
  GATE_CAP,
  independentAuthors,
  modifiedCredit,
  multiplier,
  pusherOf,
  repoGate,
  repoOrigin,
  s,
  upstreamOf,
  upstreamReward,
  type FileContext,
  type PushContext,
  type RawFileFacts,
  type RepoFacts,
} from './difficulty.ts';
import { dayBonusTotals, measurePush, MemoryLedger, type PushDelta } from './ledger.ts';

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
    // 5 × 2.2 for the lines, and the hardest file's full effort credit.
    expect(fix.bonus).toBe(11 + FILE_CREDIT);
    // The same multiplier on a file the push only adds to.
    const add: ChangedFile = { filename: CORE, status: 'modified', additions: 200, deletions: 0, patch: ['@@ -100,0 +100,200 @@', ...code(200, 'new').map((l) => `+${l}`)].join('\n') };
    const pure = measurePush([add], new MemoryLedger(), contextOf(ctx(CORE, 3.2, [])));
    expect(pure.lines[Cat.Code]).toBe(200);
    expect(pure.bonus).toBe(0);
    // A big feature beside a two-line fix in the same file: only the two lines are multiplied.
    const both = measurePush([edit(CORE, 100, code(2, 'old'), [...code(2, 'fix'), ...code(300, 'feat')])], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(100, 2))));
    // (2 lines: below the effort credit's threshold.)
    expect(both.bonus).toBe(4);
  });

  it('applies the first-40-lines-then-square-root rule per file', () => {
    const d = measurePush([edit(CORE, 10, code(140, 'old'), code(140, 'new'))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 140))));
    expect(d.lines[Cat.Code]).toBe(140);
    expect(d.bonus).toBe(110 + FILE_CREDIT);
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
    // ×2: 1.0 a line, and 60 × 1 / 2.2 of effort credit.
    const effort = Math.floor((FILE_CREDIT * 1000) / 2200);
    expect(a.bonus).toBe(10 + effort);
    expect(bonusOf([a, b])).toBe(20 + effort);
    // The next day the file is seen afresh: a new multiplier (10 modified lines are enough to earn the effort credit again within the repeat window).
    store.today++;
    const c = measurePush([edit(CORE, 90, code(10, 'e'), code(10, 'f'))], store, contextOf(ctx(CORE, 3.2, range(90, 10))));
    expect(c.bonus).toBe(22 + FILE_CREDIT);
  });

  it('a modification reverted the same day takes its bonus back exactly', () => {
    const store = new MemoryLedger();
    const before = code(25, 'orig');
    const after = code(25, 'patched');
    const context = contextOf(ctx(CORE, 3.2, range(10, 25)));
    const fix = measurePush([edit(CORE, 10, before, after)], store, context);
    expect(fix.bonus).toBe(55 + FILE_CREDIT);
    // The revert removes the pusher's own lines of today and restores the originals.
    const revert = measurePush([edit(CORE, 10, after, before)], store, contextOf(ctx(CORE, 3.2, [])));
    expect(revert.bonus).toBe(-55 - FILE_CREDIT);
    expect(fix.lines[Cat.Code]! + revert.lines[Cat.Code]!).toBe(0);
    // A partial revert takes back its part.
    const store2 = new MemoryLedger();
    measurePush([edit(CORE, 10, before, after)], store2, context);
    const part = measurePush([edit(CORE, 10, after.slice(0, 5), before.slice(0, 5))], store2, contextOf(ctx(CORE, 3.2, [])));
    expect(part.bonus).toBe(Math.floor(20 * 2.2) - 55);
    expect(MEANINGFUL_LINES).toBe(3);
  });

  it('caps the day’s bonus at DAILY_BONUS_CAP lines plus FILE_CAP files of effort, and the army counts it at most BONUS_PER_CODE × the code', () => {
    const store = new MemoryLedger();
    let total = 0;
    for (let f = 0; f < 40; f++) {
      const path = `src/m${f}.ts`;
      total += measurePush([edit(path, 10, code(40, `o${f}x`), code(40, `n${f}y`))], store, contextOf(ctx(path, 3.2, range(10, 40)))).bonus ?? 0;
    }
    expect(total).toBe(DAILY_BONUS_CAP + FILE_CAP * FILE_CREDIT);
    const ledger = emptyLedger();
    applyDelta(ledger, { lines: [40, 0, 0, 0, 0, 40, 0, 0, 0], files: 3, branches: 0, churn: 0, filler: 0, bonus: 50_000, purpose: 'fix' });
    expect(effectiveLedger(ledger).bonus).toBe(BONUS_PER_CODE * 40);
    // Code and bonus share the knee: 3000 code + 3000 bonus is 4000 + 1000.
    const big = emptyLedger();
    applyDelta(big, { lines: [3000, 0, 0, 0, 0, 0, 0, 0, 0], files: 1, branches: 0, churn: 0, filler: 0, bonus: 3000, purpose: 'fix' });
    expect(effectiveLedger(big).code + effectiveLedger(big).bonus).toBe(5000);
    const plain = emptyLedger();
    applyDelta(plain, { lines: [3000, 0, 0, 0, 0, 0, 0, 0, 0], files: 1, branches: 0, churn: 0, filler: 0, purpose: 'fix' });
    expect(budgetOf(big)).toBeGreaterThan(budgetOf(plain));
  });
});

describe('the effort credit', () => {
  const CORE = 'src/core.ts';
  const add = (path: string, lines: readonly string[]): ChangedFile => ({ filename: path, status: 'modified', additions: lines.length, deletions: 0, patch: ['@@ -500,0 +500,' + lines.length + ' @@', ...lines.map((l) => `+${l}`)].join('\n') });

  it('scales with the file’s multiplier, so a gated file earns proportionally little', () => {
    expect(M_MAX).toBeCloseTo(3.2, 10);
    expect(fileCreditMilli(3, 3200)).toBe(FILE_CREDIT * 1000);
    expect(fileCreditMilli(2, 3200)).toBe(0);
    expect(fileCreditMilli(3, 1000)).toBe(0);
    expect(fileCreditMilli(3, 2100)).toBe(FILE_CREDIT * 500);
    // The gate holds M to ×1.5: a quarter or so of the credit.
    const gated = measurePush([edit(CORE, 10, code(5, 'old'), code(5, 'new'))], new MemoryLedger(), contextOf(ctx(CORE, 1.5, range(10, 5))));
    expect(gated.bonus).toBe(Math.floor(5 * 0.5) + Math.floor((FILE_CREDIT * 500) / 2200));
  });

  it('is awarded by the push that reaches 3 modified lines, and a revert below 3 takes it back exactly', () => {
    const store = new MemoryLedger();
    const lines = code(4, 'theirs');
    const mine = code(4, 'mine');
    const c = (from: number, n: number) => contextOf(ctx(CORE, 3.2, range(from, n)));
    const one = measurePush([edit(CORE, 10, lines.slice(0, 2), mine.slice(0, 2))], store, c(10, 2));
    expect(one.bonus).toBe(4);
    const two = measurePush([edit(CORE, 40, lines.slice(2, 3), mine.slice(2, 3))], store, c(40, 1));
    expect(two.bonus).toBe(2 + FILE_CREDIT);
    // A fourth line adds only its line bonus.
    const three = measurePush([edit(CORE, 60, lines.slice(3), mine.slice(3))], store, c(60, 1));
    expect(three.bonus).toBe(Math.floor(4 * 2.2) - 6);
    // Reverting two of them drops the file to 2 lines: the credit goes back.
    const back = measurePush([edit(CORE, 10, mine.slice(0, 2), lines.slice(0, 2))], store, contextOf(ctx(CORE, 3.2, [])));
    expect(back.bonus).toBe(Math.floor(2 * 2.2) - Math.floor(4 * 2.2) - FILE_CREDIT);
    expect(bonusOf([one, two, three, back])).toBe(4);
  });

  it('split = squash across the threshold', () => {
    const lines = code(3, 'theirs');
    const mine = code(3, 'mine');
    const squash = measurePush([edit(CORE, 10, lines, mine)], new MemoryLedger(), contextOf(ctx(CORE, 2.6, range(10, 3))));
    const store = new MemoryLedger();
    // The removals first, one by one, then the replacements in one push with no context at all.
    const parts = [0, 1, 2].map((i) => measurePush([edit(CORE, 10 + i, lines.slice(i, i + 1), [])], store, contextOf(ctx(CORE, 2.6, [10 + i]))));
    parts.push(measurePush([add(CORE, mine)], store));
    expect(bonusOf(parts)).toBe(squash.bonus);
    expect(squash.bonus).toBeGreaterThan(FILE_CREDIT / 2);
  });

  it('is held to FILE_CAP files’ worth a day: spreading 3-line edits over 40 core files', () => {
    const store = new MemoryLedger();
    let total = 0;
    for (let f = 0; f < 40; f++) {
      const path = `src/core${f.toString(36)}x.ts`;
      total += measurePush([edit(path, 10, code(3, `o${f}q`), code(3, `n${f}r`))], store, contextOf(ctx(path, 3.2, range(10, 3)))).bonus ?? 0;
    }
    expect(total).toBe(FILE_CAP * FILE_CREDIT + Math.floor(40 * 3 * 2.2));
  });

  it('whitespace-only edits and one’s own files earn none', () => {
    const lines = code(10, 'core');
    const ws = measurePush([edit(CORE, 10, lines, lines.map((l) => `  ${l}  `))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 10))));
    expect(ws.bonus).toBe(0);
    const own = measurePush([edit(CORE, 10, lines, code(10, 'mine'))], new MemoryLedger(), contextOf(ctx(CORE, 3.2, [])));
    expect(own.bonus).toBe(0);
  });
});

describe('a fork’s bonus waits for the upstream', () => {
  const CORE = 'src/core.ts';
  const UP = { repo: 'big/project', branch: 'main' };
  const forkOf = (...files: FileContext[]): PushContext => ({ ...contextOf(...files), upstream: UP });
  const pendingOf = (deltas: readonly PushDelta[]) => deltas.reduce((n, d) => ({ bonusMilli: n.bonusMilli + (d.pending?.bonusMilli ?? 0), effortMilli: n.effortMilli + (d.pending?.effortMilli ?? 0) }), { bonusMilli: 0, effortMilli: 0 });

  it('a fork push pays no bonus and no effort credit at push time: M counts as 1, and what is owed waits', () => {
    const before = code(25, 'orig');
    const after = code(25, 'patched');
    const plain = measurePush([edit(CORE, 10, before, after)], new MemoryLedger(), contextOf(ctx(CORE, 3.2, range(10, 25))));
    const store = new MemoryLedger();
    const fork = measurePush([edit(CORE, 10, before, after)], store, forkOf(ctx(CORE, 3.2, range(10, 25))));
    expect(plain.bonus).toBe(55 + FILE_CREDIT);
    expect(fork.bonus).toBe(0);
    expect(fork.lines[Cat.Code]).toBe(plain.lines[Cat.Code]);
    expect(fork.pending).toEqual({ bonusMilli: 55_000, effortMilli: FILE_CREDIT * 1000 });
    expect(fork.difficulty!.every((n) => n.pending)).toBe(true);
    // Nothing of it is in the day's immediate totals, which the reward is capped against.
    expect(dayBonusTotals(store)).toEqual({ bonusMilli: 0, effortMilli: 0 });
    // Found upstream, it is worth exactly what the same push earned in a repository of its own.
    expect(upstreamReward(dayBonusTotals(store), [fork.pending!], 0)).toBe(plain.bonus);
    // A repository that is not a fork has no upstream; a fork GitHub names none for waits for ever.
    expect(upstreamOf({ fullName: 'a/b', fork: false, createdAt: 0, stars: 0, forks: 0, sizeKb: 0 })).toBeNull();
    expect(upstreamOf({ fullName: 'a/b', fork: true, createdAt: 0, stars: 0, forks: 0, sizeKb: 0, parent: { fullName: 'x/b', defaultBranch: 'dev' } })).toEqual({ repo: 'x/b', branch: 'dev' });
  });

  it('split = squash for the pending bonus, and a same-day revert takes it back', () => {
    const lines = code(30, 'theirs');
    const mine = code(30, 'mine');
    const squash = measurePush([edit(CORE, 10, lines, mine)], new MemoryLedger(), forkOf(ctx(CORE, 2.6, range(10, 30))));
    const store = new MemoryLedger();
    const parts = [0, 1, 2].map((i) => measurePush([edit(CORE, 10 + 10 * i, lines.slice(10 * i, 10 * i + 10), mine.slice(10 * i, 10 * i + 10))], store, forkOf(ctx(CORE, 2.6, range(10 + 10 * i, 10)))));
    expect(pendingOf(parts)).toEqual(squash.pending);
    expect(bonusOf(parts)).toBe(0);
    const revert = measurePush([edit(CORE, 10, mine, lines)], store, forkOf(ctx(CORE, 2.6, [])));
    expect(pendingOf([...parts, revert])).toEqual({ bonusMilli: 0, effortMilli: 0 });
  });

  it('the reward for a day is capped with the day’s immediate bonus, credited once, and never taken back', () => {
    const cap = (DAILY_BONUS_CAP + FILE_CAP * FILE_CREDIT);
    // A day that already took 1,500 bonus lines and 10 files of effort at once.
    const day = { bonusMilli: 1_500_000, effortMilli: 10 * FILE_CREDIT * 1000 };
    const a = { bonusMilli: 900_000, effortMilli: 8 * FILE_CREDIT * 1000 };
    expect(upstreamReward(day, [a], 0)).toBe(500 + 5 * FILE_CREDIT);
    // A second commit found later adds only what it raises the total by; the first is not paid again.
    const b = { bonusMilli: 50_000, effortMilli: 0 };
    expect(upstreamReward(day, [a, b], 500 + 5 * FILE_CREDIT)).toBe(0);
    expect(upstreamReward({ bonusMilli: 0, effortMilli: 0 }, [b], 0)).toBe(50);
    // Found reverts lower the target but never claw back what was credited.
    expect(upstreamReward({ bonusMilli: 0, effortMilli: 0 }, [b, { bonusMilli: -50_000, effortMilli: 0 }], 50)).toBe(0);
    expect(upstreamReward({ bonusMilli: 0, effortMilli: 0 }, [{ bonusMilli: 9e9, effortMilli: 9e9 }], 0)).toBe(cap);
  });
});

describe('repeat-target dampening', () => {
  const CORE = 'src/core.ts';
  const day = (store: MemoryLedger, d: number, salt: string, context = (from: number, n: number) => contextOf(ctx(CORE, 3.2, range(from, n)))) => {
    store.today = d;
    return measurePush([edit(CORE, 10, code(5, `${salt}-old`), code(5, `${salt}-new`))], store, context(10, 5));
  };

  it('token edits to a file earn effort credit at most once per player per 3 days; its line bonus is not dampened', () => {
    expect(EFFORT_REPEAT_DAYS).toBe(3);
    expect(EFFORT_REPEAT_LINES).toBe(10);
    const store = new MemoryLedger();
    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => day(store, d, `d${d}`).bonus ?? 0);
    const line = 11; // 5 lines × 2.2
    expect(days).toEqual([line + FILE_CREDIT, line, line, line + FILE_CREDIT, line, line, line + FILE_CREDIT]);
    const notes = day(store, 7, 'd7').difficulty!;
    expect(notes[0]).toMatchObject({ repeat: true });
    // Another file is not held back by this one.
    store.today = 7;
    const other = measurePush([edit('src/other.ts', 10, code(5, 'x-old'), code(5, 'x-new'))], store, contextOf(ctx('src/other.ts', 3.2, range(10, 5))));
    expect(other.bonus).toBe(line + FILE_CREDIT);
  });

  it('is keyed by the close of earlier days: an edit reverted the same day leaves the file free, and splitting a day changes nothing', () => {
    const store = new MemoryLedger();
    const theirs = code(5, 'theirs');
    const mine = code(5, 'mine');
    store.today = 0;
    const c = contextOf(ctx(CORE, 3.2, range(10, 5)));
    expect(measurePush([edit(CORE, 10, theirs, mine)], store, c).bonus).toBe(11 + FILE_CREDIT);
    expect(measurePush([edit(CORE, 10, mine, theirs)], store, contextOf(ctx(CORE, 3.2, []))).bonus).toBe(-11 - FILE_CREDIT);
    // Day 0 closed with no effort on the file: day 1 pays.
    expect(day(store, 1, 'a').bonus).toBe(11 + FILE_CREDIT);
    // Day 2, split into single-line pushes, sees the same history as one squashed push: nothing.
    const split = new MemoryLedger();
    day(split, 1, 'a');
    split.today = 2;
    const old2 = code(5, 'b-old');
    const new2 = code(5, 'b-new');
    const parts = [0, 1, 2, 3, 4].map((i) => measurePush([edit(CORE, 10 + i, old2.slice(i, i + 1), new2.slice(i, i + 1))], split, contextOf(ctx(CORE, 3.2, [10 + i]))));
    const squash = day(store, 2, 'b');
    expect(bonusOf(parts)).toBe(squash.bonus);
    expect(squash.bonus).toBe(11);
  });

  it('real work on the same file still pays every day: EFFORT_REPEAT_LINES modified lines, reached in any split', () => {
    const store = new MemoryLedger();
    const big = (d: number) => {
      store.today = d;
      return measurePush([edit(CORE, 10, code(EFFORT_REPEAT_LINES, `big${d}-old`), code(EFFORT_REPEAT_LINES, `big${d}-new`))], store, contextOf(ctx(CORE, 3.2, range(10, EFFORT_REPEAT_LINES))));
    };
    const line = Math.floor(EFFORT_REPEAT_LINES * 2.2);
    expect([0, 1, 2, 3].map((d) => big(d).bonus)).toEqual([line + FILE_CREDIT, line + FILE_CREDIT, line + FILE_CREDIT, line + FILE_CREDIT]);
    // Within the window, the threshold is crossed by the push that reaches it, whatever the split.
    const split = new MemoryLedger();
    split.today = 0;
    measurePush([edit(CORE, 10, code(5, 's-old'), code(5, 's-new'))], split, contextOf(ctx(CORE, 3.2, range(10, 5))));
    split.today = 1;
    const old = code(EFFORT_REPEAT_LINES, 't-old');
    const neu = code(EFFORT_REPEAT_LINES, 't-new');
    const parts = old.map((_, i) => measurePush([edit(CORE, 10 + i, old.slice(i, i + 1), neu.slice(i, i + 1))], split, contextOf(ctx(CORE, 3.2, [10 + i]))));
    expect(parts.slice(0, EFFORT_REPEAT_LINES - 1).every((p) => (p.bonus ?? 0) <= 3)).toBe(true);
    expect(parts[EFFORT_REPEAT_LINES - 1]!.bonus).toBeGreaterThan(FILE_CREDIT);
    const squash = new MemoryLedger();
    squash.today = 0;
    measurePush([edit(CORE, 10, code(5, 's-old'), code(5, 's-new'))], squash, contextOf(ctx(CORE, 3.2, range(10, 5))));
    squash.today = 1;
    const whole = measurePush([edit(CORE, 10, old, neu)], squash, contextOf(ctx(CORE, 3.2, range(10, EFFORT_REPEAT_LINES))));
    expect(bonusOf(parts)).toBe(whole.bonus);
    expect(whole.bonus).toBe(line + FILE_CREDIT);
  });

  it('applies to a fork’s pending effort credit too', () => {
    const store = new MemoryLedger();
    const fork = (from: number, n: number): PushContext => ({ ...contextOf(ctx(CORE, 3.2, range(from, n))), upstream: { repo: 'big/project', branch: 'main' } });
    const a = day(store, 0, 'p', fork);
    const b = day(store, 1, 'q', fork);
    expect(a.pending).toEqual({ bonusMilli: 11_000, effortMilli: FILE_CREDIT * 1000 });
    expect(b.pending).toEqual({ bonusMilli: 11_000, effortMilli: 0 });
  });
});
