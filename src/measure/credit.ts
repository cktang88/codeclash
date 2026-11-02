// The boundary between measurement and the game.
//
// Ingestion reports each push as signed deltas (ingest/poller.ts PushReport). A day's pushes are
// summed into a DayTally, and `creditOf` turns the tally into Work: the credited, capped amounts
// of each kind of effort, every one bounded by the real code behind it so that no single metric
// can be pumped on its own. The game (src/game) only ever sees Work; it knows nothing of diffs.

import { Cat, CAT_COUNT } from './categories.ts';

const fl = Math.floor;

/**
 * Code lines count in full up to CODE_KNEE a day, and at half value from there up to CODE_CAP,
 * where they stop: at most 6000 lines' worth. A knee rather than a cliff, so a big honest day is
 * not cut flat and padding toward the cap pays half. Ingestion caps each UTC day at CODE_CAP too.
 */
export const CODE_KNEE = 4000;
export const CODE_CAP = 8000;
export const CODE_CREDIT_MAX = CODE_KNEE + (CODE_CAP - CODE_KNEE) / 2;
/** Code lines per credited file: one line in each of two hundred files is not a sweeping change. */
const LINES_PER_FILE = 20;
const REMOVED_PER_FILE = 100;
/** Code lines per point of complexity: denser than this is padding. */
const LINES_PER_COMPLEXITY = 2;
/** Code lines per function point (3 per function): denser than this is code split up to farm functions. */
export const LINES_PER_FUNCTION_POINT = 8;
/** Links (names used from local modules) make at most this share of complexity. */
export const LINK_SHARE = 0.25;
/** Difficulty bonus lines count at most this many times the day's code lines. */
export const BONUS_PER_CODE = 43;
/** Supporting lines (tests, docs, comments, config) count up to this many times the code plus 200. */
export const SUPPORT_PER_CODE = 2;
export const SUPPORT_FLOOR = 200;

/** A day's pushes summed. Totals never go below zero. */
export interface DayTally {
  lines: number[];
  files: number;
  branches: number;
  functions: number;
  links: number;
  bonus: number;
  churn: number;
  filler: number;
  pushes: number;
}

/** One push's signed change, as ingestion reports it. */
export interface TallyDelta {
  lines: readonly number[];
  files: number;
  branches: number;
  functions?: number;
  links?: number;
  bonus?: number;
  churn: number;
  filler: number;
}

const LIMIT = 1e6;
/** A whole number from an untrusted field, clamped to ±1e6; NaN becomes 0. */
export function int(n: unknown, min = -LIMIT): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(LIMIT, Math.trunc(n))) : 0;
}

export function emptyTally(): DayTally {
  return { lines: new Array<number>(CAT_COUNT).fill(0), files: 0, branches: 0, functions: 0, links: 0, bonus: 0, churn: 0, filler: 0, pushes: 0 };
}

/** Adds one push's change to a tally. */
export function addToTally(t: DayTally, d: TallyDelta): void {
  for (let c = 0; c < CAT_COUNT; c++) t.lines[c] = Math.max(0, t.lines[c]! + int(d.lines[c]));
  t.files = Math.max(0, t.files + int(d.files));
  t.branches = Math.max(0, t.branches + int(d.branches));
  t.functions = Math.max(0, t.functions + int(d.functions));
  t.links = Math.max(0, t.links + int(d.links));
  t.bonus = Math.max(0, t.bonus + int(d.bonus));
  t.churn += int(d.churn, 0);
  t.filler += int(d.filler, 0);
  t.pushes += 1;
}

/** Lines' worth of `n` code lines: in full to the knee, half beyond, nothing past the cap. */
export function credited(n: number): number {
  const x = Math.max(0, Math.min(CODE_CAP, fl(n)));
  return x <= CODE_KNEE ? x : CODE_KNEE + fl((x - CODE_KNEE) / 2);
}

/** Complexity in half points: decision points, function points and linked names, each bounded. */
export function complexityOf(t: Pick<DayTally, 'branches' | 'functions' | 'links'>, code: number): { half: number; branches: number; functions: number; links: number } {
  const branches = Math.max(0, t.branches);
  const functions = Math.min(Math.max(0, t.functions), fl(code / LINES_PER_FUNCTION_POINT));
  const links = Math.min(Math.max(0, t.links), fl((2 * (branches + functions) * LINK_SHARE) / (1 - LINK_SHARE)));
  const half = Math.min(2 * branches + 2 * functions + links, fl((2 * code) / LINES_PER_COMPLEXITY));
  return { half, branches, functions, links };
}

/** The credited parts of a tally (the old `effectiveLedger`). */
export function effectiveTally(t: DayTally): { code: number; bonus: number; removed: number; files: number; complexity: number } {
  const raw = Math.max(0, t.lines[Cat.Code]!);
  const code = credited(raw);
  const bonus = credited(raw + Math.min(Math.max(0, t.bonus), BONUS_PER_CODE * raw)) - code;
  const removed = Math.max(0, Math.min(CODE_KNEE, t.lines[Cat.Removed]!));
  const files = Math.min(t.files, 1 + fl(code / LINES_PER_FILE) + fl(removed / REMOVED_PER_FILE));
  return { code, bonus, removed, files, complexity: complexityOf(t, code).half / 2 };
}

/**
 * Credited effort, the only thing the game reads. Every field is a non-negative whole number of
 * "lines' worth" (complexity in points). Supporting work is held to SUPPORT_PER_CODE times the
 * code (plus a floor, so a docs-only day still counts for something).
 */
export interface Work {
  /** Credited code lines, knee and cap applied. */
  code: number;
  /** Difficulty bonus: extra credit for changing others' established code. */
  bonus: number;
  /** Credited removed lines (refactors). */
  removed: number;
  files: number;
  /** Complexity points: branches, functions, linked names. */
  complexity: number;
  /** Function points alone (bounded as in complexity). */
  functions: number;
  tests: number;
  docs: number;
  comments: number;
  config: number;
  /** Share of added lines that were filler, 0..1. */
  filler: number;
  pushes: number;
}

export function emptyWork(): Work {
  return { code: 0, bonus: 0, removed: 0, files: 0, complexity: 0, functions: 0, tests: 0, docs: 0, comments: 0, config: 0, filler: 0, pushes: 0 };
}

export function creditOf(t: DayTally): Work {
  const e = effectiveTally(t);
  const cx = complexityOf(t, e.code);
  const support = SUPPORT_PER_CODE * (e.code + e.removed) + SUPPORT_FLOOR;
  const cap = (n: number) => Math.max(0, Math.min(support, fl(n)));
  const added = t.lines[Cat.Code]! + t.lines[Cat.Test]! + t.lines[Cat.Comment]! + t.lines[Cat.Docs]! + t.lines[Cat.Config]!;
  return {
    code: e.code,
    bonus: e.bonus,
    removed: e.removed,
    files: e.files,
    complexity: fl(e.complexity),
    functions: cx.functions,
    tests: cap(t.lines[Cat.Test]!),
    docs: cap(t.lines[Cat.Docs]!),
    comments: cap(t.lines[Cat.Comment]!),
    config: cap(t.lines[Cat.Config]!),
    filler: t.filler > 0 ? Math.min(1, t.filler / (added + t.filler + 20)) : 0,
    pushes: t.pushes,
  };
}

const ramp = (x: number, from: number, to: number) => Math.max(0, Math.min(1, (x - from) / (to - from)));
/** Filler share of lines at which work starts to count less, and at which the penalty is full. */
export const FILLER_RAMP = [0.15, 0.5] as const;

export interface QualityNote {
  kind: 'tests' | 'comments' | 'filler';
  effect: number;
  text: string;
}

/**
 * How clean a day's work is, 0.7..1.05: drowning a little code in tests, comments or filler
 * counts for less; well-tested code a little more. Depends only on the tally, so it is the same
 * however the work was split into pushes.
 */
export function workQuality(t: DayTally): { quality: number; notes: QualityNote[] } {
  const { code } = effectiveTally(t);
  const notes: QualityNote[] = [];
  let quality = 1;
  const testRatio = t.lines[Cat.Test]! / (code + 20);
  const commentRatio = t.lines[Cat.Comment]! / (code + 20);
  const fillerRatio = t.filler / (code + t.filler + 20);
  const tests = -0.15 * ramp(testRatio, 3, 8);
  if (tests < 0) notes.push({ kind: 'tests', effect: tests, text: `Tests outweigh the code ${testRatio.toFixed(1)} to 1` });
  else if (testRatio >= 0.2 && code >= 50) {
    quality += 0.05;
    notes.push({ kind: 'tests', effect: 0.05, text: 'Well tested' });
  }
  const comments = -0.1 * ramp(commentRatio, 0.5, 2);
  if (comments < 0) notes.push({ kind: 'comments', effect: comments, text: `Comments outweigh the code ${commentRatio.toFixed(1)} to 1` });
  const filler = -0.15 * ramp(fillerRatio, FILLER_RAMP[0], FILLER_RAMP[1]);
  if (filler < 0) notes.push({ kind: 'filler', effect: filler, text: `${Math.round(fillerRatio * 100)}% of lines were filler` });
  return { quality: Math.max(0.7, quality + tests + comments + filler), notes };
}

/**
 * One number for how much a day's work is worth, in code lines' worth: code and its bonus, plus
 * files touched, complexity and removed lines as seasoning. Used by tests and summaries; the game
 * spends each kind of work on its own buildings.
 */
export const VALUE_WEIGHTS = { files: 2.2, complexity: 0.22, removed: 0.125 } as const;
export function workValue(t: DayTally): number {
  const e = effectiveTally(t);
  if (e.code + e.removed <= 0) return 0;
  const v = e.code + e.bonus + VALUE_WEIGHTS.files * e.files + VALUE_WEIGHTS.complexity * e.complexity + VALUE_WEIGHTS.removed * e.removed;
  return v * workQuality(t).quality;
}
