// The difficulty bonus: extra credit for editing established code in a mature repository.
//
// Credit is otherwise linear in new lines, so a greenfield repository outearns a hard five-line fix
// in a big, much-worked file. The bonus pays for *modified* code: lines of other people's code the
// push removes and replaces in the same file. Each file has a multiplier M (1 to 4) read from its
// context at the push's base commit:
//
//   M = clamp(1 + 0.8·s(LT_others/500) + 0.6·s((authors_others−1)/4) + 0.4·s(age_days/365) + 0.4·s(commits/50), 1, 4)
//   s(x) = min(1, log2(1 + x))
//
// - LT_others: the file's lines before the change, not counting lines blamed to the pusher
// - authors_others: distinct earlier authors of the file other than the pusher (accounts at least
//   MIN_ACCOUNT_DAYS old when the account's age is known)
// - age_days: the median age of the exact lines the push changes (from blame; for a pure insertion,
//   the context lines beside it), the pusher's own lines left out, never older than the repository
// - commits: the file's commits (a proxy for how central it is), the pusher's own left out
//
// The extra credit for a file is `f(modified) × (M − 1)` lines, where f counts the first FULL_LINES
// modified lines in full and the rest by a square root. Pure additions are never multiplied. The
// ledger (rules/ledger.ts) keeps the per-file, per-day state, so the bonus telescopes exactly like
// every other count: splitting a day's edits into pushes or squashing them earns the same, and
// undoing an edit the same day takes its bonus back.
//
// This file is pure: no I/O, no Node APIs. Fetching the context lives in server/difficulty.ts.

/** Weights of the four signals, in the order of the formula. */
export const WEIGHTS = { lines: 0.8, authors: 0.6, age: 0.4, commits: 0.4 } as const;
/** Each signal saturates (s = 1) at this much: 500 lines of others' code, 5 authors, a year, 50 commits. */
export const SATURATION = { lines: 500, authors: 4, ageDays: 365, commits: 50 } as const;
/** M is clamped to [1, MAX_MULTIPLIER]. With the weights above, M reaches at most 3.2. */
export const MAX_MULTIPLIER = 4;
/** M when the repository does not pass the gate (`repoGate`). */
export const GATE_CAP = 1.5;
/** Modified lines a file credits at full M; beyond them the bonus grows by a square root. */
export const FULL_LINES = 40;
/** Source files a push fetches context for: the most changed ones that remove lines. */
export const CONTEXT_FILES = 5;
/** Accounts younger than this do not count as independent authors (sockpuppets are made fresh). */
export const MIN_ACCOUNT_DAYS = 30;
/** What the repository (or, for a fork, its source) needs for M above GATE_CAP. */
export const GATE = { contributors: 2, stars: 5, forks: 2 } as const;
/**
 * Bonus lines one player can be credited with in a UTC day, on top of the code cap the simulation
 * applies to code and bonus together. An honest maintainer's day of fixes earns a few hundred.
 */
export const DAILY_BONUS_CAP = 2000;

/**
 * Effort credit: a fixed credit, in lines of code, for each established file of others' code the
 * player meaningfully modifies in a UTC day, scaled by how hard the file is: `FILE_CREDIT × (M − 1) /
 * (M_MAX − 1)`. Lines are a poor measure of a hard fix in a big file, so this part of the bonus is
 * deliberately not proportional to them.
 */
export const FILE_CREDIT = 60;
/** Modified lines of others' code (the file's day pairing) that make a file's edit meaningful. */
export const MEANINGFUL_LINES = 3;
/** Effort credit a day is held to: FILE_CAP files at the full credit (about 15 of the hardest files). */
export const FILE_CAP = 15;
/** The largest multiplier the weights allow (all four signals saturated): the hardest file earns the full credit. */
export const M_MAX = 1 + WEIGHTS.lines + WEIGHTS.authors + WEIGHTS.age + WEIGHTS.commits;

const DAY_MS = 86_400_000;

export const s = (x: number): number => Math.min(1, Math.log2(1 + Math.max(0, x)));

export interface Signals {
  linesOthers: number;
  authorsOthers: number;
  medianAgeDays: number;
  fileCommits: number;
}

/** The file's multiplier from its four signals, before the repository gate. */
export function multiplier(x: Signals): number {
  const m =
    1 +
    WEIGHTS.lines * s(x.linesOthers / SATURATION.lines) +
    WEIGHTS.authors * s((x.authorsOthers - 1) / SATURATION.authors) +
    WEIGHTS.age * s(x.medianAgeDays / SATURATION.ageDays) +
    WEIGHTS.commits * s(x.fileCommits / SATURATION.commits);
  return Math.max(1, Math.min(MAX_MULTIPLIER, m));
}

/** Lines' worth of `n` modified lines: in full up to FULL_LINES, then the square root of the excess. */
export function modifiedCredit(n: number): number {
  const x = Math.max(0, Math.floor(n));
  return x <= FULL_LINES ? x : FULL_LINES + Math.sqrt(x - FULL_LINES);
}

/** The extra credit of a file, in thousandths of a line: `f(modified) × (M − 1)` with M in thousandths. */
export function bonusMilli(modified: number, mMilli: number): number {
  if (mMilli <= 1000) return 0;
  return Math.floor(modifiedCredit(modified) * (mMilli - 1000));
}

/** A file's effort credit for the day, in thousandths of a line: nothing below MEANINGFUL_LINES modified lines. */
export function fileCreditMilli(modified: number, mMilli: number, credit = FILE_CREDIT): number {
  if (modified < MEANINGFUL_LINES || mMilli <= 1000) return 0;
  const hard = Math.min(1, (mMilli - 1000) / Math.round((M_MAX - 1) * 1000));
  return Math.floor(credit * 1000 * hard);
}

// ------------------------------------------------------------------ the repository gate

export interface RepoFacts {
  fullName: string;
  fork: boolean;
  /** ms since the epoch. */
  createdAt: number;
  stars: number;
  forks: number;
  /** Repository size as GitHub reports it, in KB. */
  sizeKb: number;
  /** For a fork, the repository it was forked from (its network's source). */
  source?: { fullName: string; createdAt: number; stars: number; forks: number } | null;
  /** Bytes per language, when known. */
  languages?: Record<string, number> | null;
}

export interface Gate {
  passed: boolean;
  /** Why M is held to GATE_CAP, when it is. */
  reason: string | null;
}

/**
 * A repository earns the full multiplier only when it (or its source, for a fork) has at least two
 * independent contributors with commits before today, and 5 stars or 2 forks. Otherwise M is at
 * most GATE_CAP: a fresh repository with forged history and invented authors earns little.
 */
export function repoGate(repo: RepoFacts | null, independentAuthors: number): Gate {
  if (!repo) return { passed: false, reason: 'the repository could not be read' };
  const popular = repo.source ?? repo;
  const reasons: string[] = [];
  if (independentAuthors < GATE.contributors) reasons.push(`fewer than ${GATE.contributors} other contributors before today`);
  if (popular.stars < GATE.stars && popular.forks < GATE.forks) reasons.push(`fewer than ${GATE.stars} stars and ${GATE.forks} forks`);
  return reasons.length === 0 ? { passed: true, reason: null } : { passed: false, reason: reasons.join(', and ') };
}

/** When the code in the repository can have been written at the earliest: the source's creation for a fork. */
export function repoOrigin(repo: RepoFacts | null): number {
  if (!repo) return Number.POSITIVE_INFINITY;
  return Math.min(repo.createdAt, repo.source?.createdAt ?? Number.POSITIVE_INFINITY);
}

// ------------------------------------------------------------------ what the push changes

export interface ChangedLines {
  /** Old-side line numbers of removed lines. */
  removed: number[];
  /** Old-side line numbers of the context lines beside pure insertions (for line age only). */
  around: number[];
}

/** Old-side line numbers a patch removes, and the context around its pure insertions, from the hunk headers (`@@ -a,b`). */
export function changedLinesOf(patch: string): ChangedLines {
  const removed: number[] = [];
  const around: number[] = [];
  let old = 0;
  // The current run of changed lines: whether it removed or added anything, and the context line before it.
  let lastContext = -1;
  let runRemoved = false;
  let runAdded = false;
  const endRun = (next: number) => {
    if (runAdded && !runRemoved) {
      if (lastContext > 0) around.push(lastContext);
      if (next > 0) around.push(next);
    }
    runRemoved = false;
    runAdded = false;
  };
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      endRun(-1);
      const m = /^@@ -(\d+)/.exec(line);
      old = m ? Number(m[1]) : 1;
      lastContext = -1;
      continue;
    }
    if (line.startsWith('\\')) continue;
    const mark = line[0];
    if (mark === '-') {
      removed.push(old++);
      runRemoved = true;
    } else if (mark === '+') {
      runAdded = true;
    } else {
      endRun(old);
      lastContext = old++;
    }
  }
  endRun(-1);
  return { removed, around: [...new Set(around)].sort((a, b) => a - b) };
}

// ------------------------------------------------------------------ a file's context

/** One blamed range at the base commit. */
export interface BlameRange {
  start: number;
  end: number;
  /** Authored, ms since the epoch. */
  at: number;
  /** Who: `id:<GitHub account id>` when GitHub links the commit to an account, else `email:<address>` from a mirror, else null. */
  author: string | null;
  /** When the author's account was created (ms), when known. */
  authorCreatedAt?: number | null;
}

export interface HistoryFacts {
  /** All commits that touched the file. */
  total: number;
  /** The newest of them (up to 100). */
  commits: { at: number; author: string | null; authorCreatedAt?: number | null }[];
}

export interface RawFileFacts {
  blame: BlameRange[];
  history: HistoryFacts;
}

/** The pusher, as blame and history name people: `id:<n>`, and `email:<address>` for each of their commit emails. */
export interface Pusher {
  keys: readonly string[];
}

export function pusherOf(id: number, login: string, emails: readonly (string | null | undefined)[] = []): Pusher {
  const keys = new Set<string>([`id:${id}`, `email:${id}+${login.toLowerCase()}@users.noreply.github.com`, `email:${login.toLowerCase()}@users.noreply.github.com`]);
  for (const e of emails) if (e) keys.add(`email:${e.toLowerCase()}`);
  return { keys: [...keys] };
}

export type ContextSource = 'graphql' | 'mirror';

/** What the ledger needs to know about one file of a push, and what the preview tells. Plain data. */
export interface FileContext {
  path: string;
  /** The multiplier in thousandths, after the gate: frozen in the ledger at the first sight of the file each day. */
  mMilli: number;
  /** Before the gate. */
  rawMilli: number;
  gate: Gate;
  /** The file's lines before the change, and those not blamed to the pusher. */
  lines: number;
  linesOthers: number;
  authorsOthers: number;
  fileCommits: number;
  medianAgeDays: number;
  /** The year of the oldest changed line of someone else's, for explaining. */
  fromYear: number | null;
  /** Old-side line numbers of removed lines that someone else wrote: these count as modified code. */
  others: number[];
  source: ContextSource;
}

/** Context for the files of one diff, by path. Plain data (JSON and structured-clone safe). */
export interface PushContext {
  files: Record<string, FileContext>;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const v = xs.slice().sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
};

/** Whether an author counts as an independent person: not the pusher, known, and not a fresh account. */
function independent(author: string | null, createdAt: number | null | undefined, pusher: ReadonlySet<string>, now: number): author is string {
  if (author === null || pusher.has(author)) return false;
  return createdAt == null || createdAt <= now - MIN_ACCOUNT_DAYS * DAY_MS;
}

/** Distinct independent authors of these files with commits authored before today (UTC): the gate's count. */
export function independentAuthors(facts: readonly RawFileFacts[], pusher: Pusher, now: number): number {
  const mine = new Set(pusher.keys);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const seen = new Set<string>();
  for (const f of facts) {
    for (const c of f.history.commits) if (c.at < today && independent(c.author, c.authorCreatedAt, mine, now)) seen.add(c.author);
    for (const r of f.blame) if (r.at < today && independent(r.author, r.authorCreatedAt, mine, now)) seen.add(r.author);
  }
  return seen.size;
}

/**
 * A file's context from its blame and history at the base commit. Line ages are clamped to the
 * repository's age (a fork's source's), and to the author account's age when known, so backdated
 * commits in a new repository read as new.
 */
export function fileContext(input: { path: string; facts: RawFileFacts; changed: ChangedLines; pusher: Pusher; now: number; origin: number; gate: Gate; source: ContextSource }): FileContext {
  const { facts, changed, now } = input;
  const mine = new Set(input.pusher.keys);
  const ownerOf = new Map<number, BlameRange>();
  let lines = 0;
  let linesOthers = 0;
  for (const r of facts.blame) {
    const n = Math.max(0, r.end - r.start + 1);
    lines = Math.max(lines, r.end);
    if (r.author === null || !mine.has(r.author)) linesOthers += n;
  }
  const rangeAt = (line: number): BlameRange | undefined => {
    let hit = ownerOf.get(line);
    if (hit) return hit;
    hit = facts.blame.find((r) => r.start <= line && line <= r.end);
    if (hit) ownerOf.set(line, hit);
    return hit;
  };
  const isOthers = (r: BlameRange | undefined): r is BlameRange => !!r && (r.author === null || !mine.has(r.author));
  const authoredAt = (r: BlameRange) => Math.max(r.at, Number.isFinite(input.origin) ? input.origin : r.at, r.authorCreatedAt ?? Number.NEGATIVE_INFINITY);
  const others: number[] = [];
  const ages: number[] = [];
  let oldest = Number.POSITIVE_INFINITY;
  for (const line of changed.removed) {
    const r = rangeAt(line);
    if (!isOthers(r)) continue;
    others.push(line);
    const at = Math.min(now, authoredAt(r));
    ages.push((now - at) / DAY_MS);
    oldest = Math.min(oldest, at);
  }
  for (const line of changed.around) {
    const r = rangeAt(line);
    if (isOthers(r)) ages.push((now - Math.min(now, authoredAt(r))) / DAY_MS);
  }
  const authors = new Set<string>();
  let ownCommits = 0;
  for (const c of facts.history.commits) {
    if (c.author !== null && mine.has(c.author)) ownCommits++;
    else if (independent(c.author, c.authorCreatedAt, mine, now)) authors.add(c.author);
  }
  for (const r of facts.blame) if (independent(r.author, r.authorCreatedAt, mine, now)) authors.add(r.author);
  const signals: Signals = {
    linesOthers,
    authorsOthers: authors.size,
    medianAgeDays: median(ages),
    fileCommits: Math.max(0, facts.history.total - ownCommits),
  };
  const rawMilli = Math.round(multiplier(signals) * 1000);
  const mMilli = input.gate.passed ? rawMilli : Math.min(rawMilli, Math.round(GATE_CAP * 1000));
  return {
    path: input.path,
    mMilli,
    rawMilli,
    gate: input.gate,
    lines,
    linesOthers,
    authorsOthers: signals.authorsOthers,
    fileCommits: signals.fileCommits,
    medianAgeDays: Math.round(signals.medianAgeDays),
    fromYear: Number.isFinite(oldest) ? new Date(oldest).getUTCFullYear() : null,
    others: others.sort((a, b) => a - b),
    source: input.source,
  };
}

/** The files of a diff worth fetching context for: the most changed source files that remove lines, at most CONTEXT_FILES. */
export function contextCandidates<F extends { filename: string; status: string; additions: number; deletions: number; patch?: string | null }>(
  files: readonly F[],
  isSource: (path: string, patch: string | null | undefined) => boolean,
): F[] {
  return files
    .filter((f) => f.patch != null && f.deletions > 0 && f.status !== 'added' && f.status !== 'renamed' && isSource(f.filename, f.patch))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || (a.filename < b.filename ? -1 : 1))
    .slice(0, CONTEXT_FILES);
}

/** Per file, what the bonus was for in one push (for explaining). */
export interface DifficultyNote {
  path: string;
  /** Modified lines of others' code the file carries today, after the push. */
  modified: number;
  /** Multiplier frozen for the file today, in thousandths. */
  mMilli: number;
  /** Change in the file's extra credit, in thousandths of a line. */
  extraMilli: number;
  /** Change in the file's effort credit (a fixed credit per meaningfully modified hard file), in thousandths of a line. */
  creditMilli?: number;
  context: FileContext | null;
}
