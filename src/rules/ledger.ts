// Squash-equivalent measurement of pushes.
//
// Every counted line is reduced to a key (its category, language family and
// canonical text) and each push only moves per-key balances: +1 for an added
// line, -1 for a removed one. A key's contribution is a function of its
// balance alone, and a push reports the change in contribution it caused. So
// any sequence of pushes sums to the contribution of the net change, which is
// exactly what one squashed push would report: reformatting, moves, add-then-
// delete and delete-then-restore all cancel, and splitting work gains nothing.
//
// Three refinements keep that property while closing loopholes (see
// docs/fair-play.md):
// - Keys are canonical: spacing, quote style, semicolons, commas, trailing
//   comments, invisible characters and look-alike letters do not make a line new.
// - Code lines of the same shape (literals and numbered names blanked out) are
//   credited at most SHAPE_CAP times, so tables, switch arms and numbered copies
//   are filler however they are dressed up.
// - With a day (store.day), work credited on an earlier day is never credited
//   again: deleting it before a reset and restoring it after earns nothing.

import { Cat, CAT_COUNT } from '../sim/api.ts';
import { analyzeFile, FUNCTION_STATEMENTS, lineBranches, LINK_NAMES_PER_IMPORT, parseBudget, type ParseBudget } from './complexity.ts';
import { branchesIn, categorizePath, classifyLine, extensionOf, isGeneratedContent, splitPatch, syntaxFor, type ChangedFile, type FileCategory } from './classify.ts';
import { bonusMilli, DAILY_BONUS_CAP, EFFORT_REPEAT_DAYS, EFFORT_REPEAT_LINES, FILE_CAP, FILE_CREDIT, fileCreditMilli, type DifficultyNote, type PendingBonus, type PushContext } from './difficulty.ts';
import { languageOfPath } from './heraldry.ts';
import { CODE_CAP } from '../sim/muster.ts';

/**
 * Copies of an identical line credited per user. One: a rewritten history
 * (force-push, amend, the same commits pushed to a second branch) shows the
 * same lines added again, and must not pay twice.
 */
export const DUPLICATE_CAP = 1;
/** Code lines of one shape (same text once literals and numbered names are blanked) credited per user. */
export const SHAPE_CAP = 8;
/** Branch points one line can carry: `a && b && c && …` is one decision, not twenty. */
export const LINE_BRANCH_CAP = 2;
/**
 * Code lines one player can be credited with in a day; the rest is treated as a paste. The
 * simulation counts the last third of them at half value (`credited` in sim/muster.ts).
 */
export const DAILY_CODE_CAP = CODE_CAP;
export const DAILY_BRANCH_CAP = 10_000;

/**
 * Per-user storage of balances. Scope '' holds line keys, shared by all of the
 * user's repositories so copies between them count once; a path scope holds one
 * file's keys, and other scopes hold bookkeeping.
 */
export interface LedgerStore {
  balance(scope: string, key: string): number;
  setBalance(scope: string, key: string, balance: number): void;
  /** Credited code and branches so far today, before the daily caps. */
  daily(): { code: number; branches: number };
  setDaily(code: number, branches: number): void;
  /** Today as a whole day number. Without it every push falls on the same day. */
  day?(): number;
}

export interface PushDelta {
  /** Signed change per line category. Generated, vendor and blank lines are counted but never cancel. */
  lines: number[];
  /** Signed change in source files carrying counted code changes. */
  files: number;
  /** Signed change in decision points (from the syntax tree, or keywords where it cannot be parsed) on credited code. */
  branches: number;
  /**
   * Signed change in function points: a new function, method or class with FUNCTION_STATEMENTS or more
   * credited statement lines is worth FUNCTION_POINTS (3), carried by three of its lines and undone when any
   * of them is; complexity adds this as is.
   */
  functions: number;
  /** Signed change in names used from newly imported local modules (half a point each, at most 6 an import). */
  links: number;
  /** Signed change in local modules linked (those names come from), for explaining. */
  modules?: number;
  /** Lines that undid counted work from earlier pushes (both halves of each pair). */
  churn: number;
  /**
   * Added lines left out as filler, which make a ragged army: whatever the push leaves uncounted
   * beyond what its own code carries (`FREE_PER_CODE` a credited line), plus everything past the daily cap.
   */
  filler: number;
  language: string | null;
  /** Every added line left uncounted, by kind, with the files holding most of each (for explaining). */
  uncounted?: Uncounted[];
  /**
   * Signed change in difficulty bonus lines: extra code credit for modifying others' established code
   * (rules/difficulty.ts). Absent or 0 without context.
   */
  bonus?: number;
  /** Per file, what moved the bonus (for explaining). */
  difficulty?: DifficultyNote[];
  /**
   * A fork's bonus and effort credit, deferred until the commit reaches the upstream (signed changes, in
   * thousandths of a line, before the day's caps): `bonus` holds none of it. Absent when zero.
   */
  pending?: PendingBonus;
}

/**
 * Why an added line was not credited:
 * - `structure`: brackets, closing tags, bare keywords
 * - `fragment`: a lone name or call opener
 * - `data`: literal rows, strings, numbers, blobs, the inside of multi-line strings
 * - `prose`: sentences outside comments
 * - `repeat`: a copy of a line already credited
 * - `shape`: a near-duplicate past the shape cap (the same line with other literals or numbered names)
 * - `cap`: past the daily code cap
 */
export type UncountedKind = 'structure' | 'fragment' | 'data' | 'prose' | 'repeat' | 'shape' | 'cap';

export interface Uncounted {
  kind: UncountedKind;
  lines: number;
  /** Files holding the most of them, most first (at most three). */
  files: { path: string; lines: number }[];
}

/**
 * Uncounted lines a push may carry per line of code it is credited with before the excess is
 * filler. Honest code leaves structure (`}`, `</div>`), a few repeated idioms (`ctx.beginPath();`),
 * the odd literal table or style rule uncounted: in this repository's own commits about one line
 * in three, rarely more than one per two credited lines. Padding brings none of the code that
 * would earn the allowance, so it stays filler.
 */
export const FREE_PER_CODE = 0.5;
/**
 * More per credited line of a style sheet (or markup or SQL): declarations repeat from rule to
 * rule (`display: flex;`), every rule closes with `}`, and selectors past the shape cap are not
 * credited, so a hand-written style sheet leaves about three lines uncounted for each it is credited.
 */
export const FREE_PER_STYLE = 2.5;

type Counted = 'code' | 'comment' | 'test' | 'docs' | 'config';

const COUNTED_CAT: Record<Counted, Cat> = { code: Cat.Code, comment: Cat.Comment, test: Cat.Test, docs: Cat.Docs, config: Cat.Config };

// Latin look-alikes from Cyrillic and Greek, which NFKC leaves alone.
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y', І: 'I', Ј: 'J', Ѕ: 'S',
  α: 'a', ο: 'o', ν: 'v', ρ: 'p', τ: 't', ι: 'i', κ: 'k', υ: 'u', χ: 'x',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Χ: 'X', Υ: 'Y',
};
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');
const STRINGS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil', 'NaN', 'Infinity']);

/**
 * Collapses whitespace so reindenting changes nothing, after folding compatibility
 * forms (NFKC), dropping invisible format characters and combining marks, and
 * mapping look-alike letters to Latin.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{M}]/gu, '')
    .replace(CONFUSABLE, (c) => CONFUSABLES[c]!)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * What an added line is when it cannot be credited as code, or null when it can:
 * - `structure`: brackets, punctuation, bare tags and bare keywords (`}`, `);`, `</div>`, `} else {`, `return (`)
 * - `fragment`: a lone name or call opener, as a wrapped argument leaves (`user,`, `{rising}`, `useEffect(() => {`)
 * - `data`: literals with no code (`[-70, -118],`, `'a', 'b',`, `{ id: 7, name: "x", active: true },`), or an encoded blob
 *
 * A line with two names or values and some code around them counts, however short its names
 * (`y += len / 6;`, `v.loss = 0;`, `x: number;`). Style sheets have no literal rows: `margin: 0;` is a declaration.
 */
export function fillerKind(normalized: string, family = 'c'): 'structure' | 'fragment' | 'data' | null {
  const code = withoutStrings(normalized);
  // An encoded blob (base64, hex) outside quotes is data, not names.
  if (/[A-Za-z0-9+/=_-]{40,}/.test(code)) return 'data';
  const bare = code.replace(BARE_TAG, ' ').replace(NUMBER, ' \u0002 ');
  const names = bare.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const literals = bare.match(/[\u0001\u0002]/g)?.length ?? 0;
  const hasLiteral = literals > 0 || names.some((w) => LITERALS.has(w));
  const real = names.filter((w) => !LITERALS.has(w));
  if (real.every((w) => STRUCTURAL.has(w))) {
    if (!hasLiteral) return 'structure';
    // `return 0;`, `case 'open':`, `throw null;` are statements; a row of literals is data.
    return real.some((w) => CONTROL.has(w)) ? null : 'data';
  }
  if (family !== 'none') {
    // Object keys and JSX attribute names are labels: a row of `key: literal` or `name="literal"` is data.
    const values = bare.replace(/[A-Za-z_$][\w$]*\s*:(?!:)/g, ' ').replace(/(^|\s)[A-Za-z_$][\w$-]*=(?=[\u0001\u0002{])/g, ' ').match(/[A-Za-z_$][\w$]*/g) ?? [];
    if (hasLiteral && !values.some((w) => !LITERALS.has(w))) return 'data';
  }
  return names.length + literals < 2 ? 'fragment' : null;
}

/** Whether a line is structure, a fragment or data: anything `fillerKind` would not credit as code. */
export function isFillerText(normalized: string, family = 'c'): boolean {
  return fillerKind(normalized, family) !== null;
}

/** String literals as \u0001; a template literal keeps the code of its interpolations. */
function withoutStrings(text: string): string {
  return text.replace(STRINGS, (m) => (m[0] === '`' ? ` \u0001 ${(m.match(/\$\{[^}]*\}/g) ?? []).map((x) => x.slice(2, -1).replace(STRINGS, ' \u0001 ')).join(' ')} ` : ' \u0001 '));
}

/** Words that shape code without naming anything: a line of only these is structure. */
const STRUCTURAL = new Set(['else', 'return', 'break', 'continue', 'try', 'finally', 'do', 'default', 'case', 'throw', 'yield', 'await', 'end', 'fi', 'done', 'then', 'pass', 'begin']);
/** Of those, the ones that make a statement of a literal (`return 0;`). */
const CONTROL = new Set(['return', 'case', 'throw', 'yield', 'await']);
/** Tags without attributes: `<div>`, `</span>`, `<>`, `</>`. */
const BARE_TAG = /<\/?[A-Za-z][\w.:-]*\s*\/?>|<\/?>/g;
/** Numeric literals, so `0x1f` and `1e9` are not read as names. */
const NUMBER = /(?<![\w$])(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)n?(?![\w$])/gi;

/** A run of eight or more words with none of code's brackets, assignments, colons or member access: prose. */
export function isProse(normalized: string): boolean {
  const text = normalized.replace(STRINGS, ' ').replace(/<[^>]*>/g, ' ');
  if (/[(){}[\];=:]|\w\.\w/.test(text) || /^(import|from|export|using|include|require|use)\b/.test(text)) return false;
  return (text.match(/[A-Za-z_]{2,}/g)?.length ?? 0) >= 8;
}

/** Index of a line comment marker outside quotes, or -1. */
function commentAt(text: string, marker: string): number {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (text.startsWith(marker, i)) return i;
  }
  return -1;
}

/** Drops inline block comments and a trailing line comment. */
function stripComments(normalized: string, family: string): string {
  let s = family === 'c' || family === 'rs' || family === 'none' ? normalized.replace(/\/\*.*?\*\//g, ' ') : normalized;
  const marker = family === 'c' || family === 'rs' ? '//' : family === 'none' ? '' : '#';
  const at = marker ? commentAt(s, marker) : -1;
  if (at > 0) s = s.slice(0, at);
  return s.trim();
}

/** A line's identity: no spacing, one quote style, no semicolons or commas, no comments. */
export function canonical(normalized: string, family: string): string {
  return stripComments(normalized, family).replace(/['`]/g, '"').replace(/[\s;,]+/g, '');
}

/**
 * A line's shape: its canonical form with string literals and numbers (and names
 * containing digits, and selectors in style sheets) blanked out. A template literal keeps its interpolations,
 * which are code.
 */
export function shapeOf(normalized: string, family: string): string {
  const code = stripComments(normalized, family);
  // In style sheets (and markup and SQL), class and id selectors are names too: `.icon-a { … }`
  // and `.icon-b { … }` are one rule copied, however many icons there are.
  return (family === 'none' ? code.replace(/[.#][A-Za-z_-][\w-]*/g, 'N') : code)
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => `T${(m.match(/\$\{[^}]*\}/g) ?? []).join('')}`)
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, 'S')
    .replace(/[A-Za-z_$]*\d[\w$]*/g, 'N')
    .replace(/[\s;,]+/g, '');
}

/** Branch tokens are counted per language family, so a key carries the family. */
function familyOf(path: string): string {
  const ext = extensionOf(path);
  return ext === 'py' || ext === 'pyi' ? 'py' : ext === 'rb' || ext === 'rake' ? 'rb' : ext === 'rs' ? 'rs' : ['sh', 'bash', 'zsh', 'fish'].includes(ext) ? 'sh' : ['css', 'scss', 'sass', 'less', 'html', 'htm', 'sql'].includes(ext) ? 'none' : 'c';
}

/** Per-file scope key holding how many of the file's code keys are nonzero. */
const NONZERO = '\u0002nonzero';

const SAMPLE_PATH: Record<string, string> = { py: 'x.py', rb: 'x.rb', rs: 'x.rs', sh: 'x.sh', none: 'x.css', c: 'x.ts' };

interface KeyInfo {
  kind: Counted;
  branches: number;
  /** Lines of one group share a cap: a code line's shape, otherwise the key itself. */
  group: string;
}

/** Contribution of one key at a balance: credited lines (positive adds, negative removals), capped for duplicates. */
function credit(balance: number): number {
  return balance > 0 ? Math.min(balance, DUPLICATE_CAP) : -Math.min(-balance, DUPLICATE_CAP);
}

// ------------------------------------------------------------ what earlier days already paid

/** Complexity a credited code key carries (its branch points and linked names), packed. */
const WEIGHT = '\u0007weight';
/** Which function (by id) a credited code key carries, if any. */
const FUNCTION_OF = '\u0009fnof';
/** Functions alive: their three carrying lines all still credited. */
const FUNCTION = '\u0009fn';
/** Local modules already linked today. */
const LINKS = '\u0008links';
/** Function points a function is worth: complexity counts a new function as 3. */
export const FUNCTION_POINTS = 3;

function packWeight(w: { branches: number; links: number }): number {
  return w.branches + (LINE_BRANCH_CAP + 1) * w.links;
}

function unpackWeight(v: number): { branches: number; links: number } {
  const x = Math.max(0, Math.floor(v));
  return { branches: x % (LINE_BRANCH_CAP + 1), links: Math.floor(x / (LINE_BRANCH_CAP + 1)) };
}

/** A function's id: a hash of the keys carrying it (never 0). */
function functionId(keys: readonly string[]): number {
  let h = 0x811c9dc5;
  for (const ch of keys.join('\u0000')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h === 0 ? 1 : h;
}

/** Per-key memory, packed into one stored number. */
const MEMORY = '\u0003memory';
/** Per-shape running credit today, for SHAPE_CAP. */
const SHAPE_ADDED = '\u0004added';
const SHAPE_REMOVED = '\u0004removed';
/** The most code credited so far today (packed with the day, like shape tallies): the filler allowance is earned once. */
const HIGH_WATER = '\u0006high';
const BASE = 2 * DUPLICATE_CAP + 1;
const SHAPE_DAY = 2 ** 24;

/**
 * What a key has already earned: `paid` and `paidRemoval` are the most credit and
 * removal credit it reached on any earlier day; `hi` and `lo` its extremes so far
 * on `day`. Only credit beyond what was paid counts, so work is paid once.
 */
interface Memory {
  day: number;
  paid: number;
  paidRemoval: number;
  hi: number;
  lo: number;
}

function readMemory(store: LedgerStore, key: string, balance: number, today: number | null): Memory {
  const c = credit(balance);
  const fresh = { day: today ?? 0, paid: 0, paidRemoval: 0, hi: c, lo: c };
  if (today === null) return fresh;
  let packed = store.balance(MEMORY, key);
  if (packed <= 0) return fresh;
  const lo = (packed % BASE) - DUPLICATE_CAP;
  packed = Math.floor(packed / BASE);
  const hi = (packed % BASE) - DUPLICATE_CAP;
  packed = Math.floor(packed / BASE);
  const paidRemoval = packed % BASE;
  packed = Math.floor(packed / BASE);
  const paid = packed % BASE;
  const day = Math.floor(packed / BASE) - 1;
  if (day === today) return { day, paid, paidRemoval, hi, lo };
  // A new day: whatever the key reached before is paid for.
  return { day: today, paid: Math.max(paid, hi), paidRemoval: Math.max(paidRemoval, -lo), hi: c, lo: c };
}

function writeMemory(store: LedgerStore, key: string, m: Memory): void {
  const empty = m.paid === 0 && m.paidRemoval === 0 && m.hi === 0 && m.lo === 0;
  store.setBalance(MEMORY, key, empty ? 0 : ((((m.day + 1) * BASE + m.paid) * BASE + m.paidRemoval) * BASE + m.hi + DUPLICATE_CAP) * BASE + m.lo + DUPLICATE_CAP);
}

/** New code a key is worth today, beyond what earlier days paid. */
const gain = (balance: number, m: Memory) => Math.max(0, credit(balance) - m.paid);
/** Removal a key is worth today, beyond what earlier days paid. */
const loss = (balance: number, m: Memory) => Math.max(0, -credit(balance) - m.paidRemoval);

function readShape(store: LedgerStore, scope: string, shape: string, today: number | null): number {
  const v = store.balance(scope, shape);
  if (today === null) return Math.max(0, v);
  return Math.floor(v / SHAPE_DAY) === today + 1 ? v % SHAPE_DAY : 0;
}

function writeShape(store: LedgerStore, scope: string, shape: string, today: number | null, n: number): void {
  const v = Math.max(0, Math.min(SHAPE_DAY - 1, n));
  store.setBalance(scope, shape, v === 0 ? 0 : today === null ? v : (today + 1) * SHAPE_DAY + v);
}

// ------------------------------------------------------------ measuring

interface Op {
  key: string;
  path: string;
  info: KeyInfo;
  sign: 1 | -1;
  /** For a removed line, its line number in the old file (to look up who wrote it). */
  oldLine?: number;
}

/** Classified lines of one file's patch, before any ledger is consulted. */
/** Tallies of uncounted added lines, by kind and file. */
type Tally = Map<UncountedKind, Map<string, number>>;

function tally(t: Tally, kind: UncountedKind, path: string, n = 1): void {
  if (n <= 0) return;
  let m = t.get(kind);
  if (!m) t.set(kind, (m = new Map()));
  m.set(path, (m.get(path) ?? 0) + n);
}

/** What a push's parsed files say about complexity, gathered by line key before the ledger is consulted. */
interface ComplexityFacts {
  budget: ParseBudget;
  /** Decision points each added code key carries (its first added line's), capped per line. */
  branches: Map<string, number>;
  /** Definitions wholly added: the key of the first line (if it is code) and the keys of their statement lines. */
  functions: { header: string | undefined; keys: string[] }[];
  /** Local imports on added lines: the import line's key, the module and the names used. */
  imports: { key: string; module: string; used: number }[];
}

function fileOps(file: ChangedFile, category: FileCategory, patch: ReturnType<typeof splitPatch>, ops: Op[], counts: { uncounted: Tally; blank: number }, cx: ComplexityFacts): void {
  const path = file.filename;
  const family = familyOf(path);
  // Which line key each added line of the new side became, for attaching complexity to it.
  const rowKey = new Map<number, string>();
  const facts = category === 'source' ? analyzeFile(path, patch.newFile, cx.budget) : null;
  let row = -1;
  const push = (kind: Counted, text: string, sign: 1 | -1, oldLine?: number) => {
    const normalized = normalize(text);
    if (kind === 'code' || kind === 'test') {
      const why = fillerKind(normalized, family) ?? (kind === 'code' && isProse(normalized) ? 'prose' : null);
      if (why) {
        if (sign === 1) tally(counts.uncounted, why, path);
        return;
      }
    } else if (kind === 'comment' && !/[\p{L}\p{N}]/u.test(normalized)) {
      // `/**`, ` *`, `*/`, `//`: a comment's frame is as empty as a blank line.
      if (sign === 1) counts.blank++;
      return;
    }
    // A comment is its text: the markers are not stripped from it as from code.
    const canon = kind === 'comment' ? normalized.replace(/['`]/g, '"').replace(/[\s;,]+/g, '') : canonical(normalized, family);
    const key = `${kind}\u0000${family}\u0000${canon}`;
    if (kind !== 'code') {
      ops.push({ key, path, info: { kind, branches: 0, group: key }, sign });
      return;
    }
    const branches = Math.min(LINE_BRANCH_CAP, branchesIn(stripComments(normalized, family), SAMPLE_PATH[family]!));
    const op: Op = { key, path, info: { kind, branches, group: `${family}\u0000${branches}\u0000${shapeOf(normalized, family)}` }, sign };
    if (oldLine !== undefined) op.oldLine = oldLine;
    ops.push(op);
    if (sign === 1 && row >= 0) {
      rowKey.set(row, key);
      // Decision points from the syntax tree when the file parsed; otherwise today's keyword count.
      if (!cx.branches.has(key)) {
        // Decision points from the line's syntax tree (a function of its text, like the key);
        // keywords where the language has no grammar or the line will not parse.
        const parsed = lineBranches(path, stripComments(normalized, family), cx.budget);
        cx.branches.set(key, parsed === null ? branches : Math.min(LINE_BRANCH_CAP, parsed));
      }
    }
  };
  if (category !== 'source') {
    const kind = category as Counted;
    for (const text of patch.added) {
      if (text.trim() === '') counts.blank += category === 'test' ? 1 : 0;
      else push(kind, text, 1);
    }
    for (const text of patch.removed) if (text.trim() !== '') push(kind, text, -1);
    return;
  }
  const syntax = syntaxFor(path);
  const walk = (lines: readonly { text: string; changed: boolean; hunk: number; line: number }[], sign: 1 | -1) => {
    const state: { block: Parameters<typeof classifyLine>[2]['block'] } = { block: null };
    let hunk = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.hunk !== hunk) {
        hunk = l.hunk;
        state.block = null;
      }
      const kind = classifyLine(l.text, syntax, state);
      if (!l.changed) continue;
      row = sign === 1 ? i : -1;
      if (kind === 'blank') counts.blank += sign === 1 ? 1 : 0;
      // The inside of a multi-line string is text, not code.
      else if (kind === 'data') {
        if (sign === 1) tally(counts.uncounted, 'data', path);
      }
      else push(kind, l.text, sign, sign === -1 ? l.line : undefined);
    }
  };
  walk(patch.newFile.map((l) => ({ text: l.text, changed: l.added, hunk: l.hunk, line: l.line })), 1);
  walk(patch.oldFile.map((l) => ({ text: l.text, changed: l.removed, hunk: l.hunk, line: l.line })), -1);
  if (!facts) return;
  for (const f of facts.functions) {
    const keys = f.rows.map((r) => rowKey.get(r)).filter((k): k is string => k !== undefined);
    if (keys.length >= FUNCTION_STATEMENTS) cx.functions.push({ header: rowKey.get(f.header), keys });
  }
  for (const imp of facts.imports) {
    const key = rowKey.get(imp.row);
    if (key && imp.used > 0) cx.imports.push({ key, module: imp.module, used: imp.used });
  }
}

/**
 * A push read and classified, with its syntax parsed, before any ledger is consulted: a pure function
 * of the diff (and the parse budget), so it can run in a worker thread (server/parsePool.ts) and be
 * applied to the ledger afterwards with exactly the result measuring inline gives. Plain data:
 * structured-clone safe.
 */
export interface PreparedPush {
  lines: number[];
  ops: Op[];
  uncounted: Tally;
  blank: number;
  branches: Map<string, number>;
  functions: { header: string | undefined; keys: string[] }[];
  imports: { key: string; module: string; used: number }[];
  estimatedCode: number;
  estimatedBranches: number;
  estimatedFiles: number;
}

/** Measures one push against the user's ledger, updating the ledger. `context` carries what the difficulty bonus needs per file. */
export function measurePush(files: readonly ChangedFile[], store: LedgerStore, context?: PushContext | null): PushDelta {
  return applyPush(preparePush(files), store, context);
}

/** Reads, classifies and parses a push: everything that does not depend on the ledger (grammars must be loaded). */
export function preparePush(files: readonly ChangedFile[]): PreparedPush {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const ops: Op[] = [];
  const counts = { uncounted: new Map() as Tally, blank: 0 };
  const cx: ComplexityFacts = { budget: parseBudget(), branches: new Map(), functions: [], imports: [] };
  let estimatedCode = 0;
  let estimatedBranches = 0;
  let estimatedFiles = 0;
  for (const file of files) {
    let category = categorizePath(file.filename);
    if (category === 'ignored') continue;
    const patch = file.patch ? splitPatch(file.patch) : null;
    if (patch && category !== 'vendor' && category !== 'generated' && isGeneratedContent(category, extensionOf(file.filename), patch)) category = 'generated';
    if (category === 'vendor' || category === 'generated') {
      // These raise nothing, so they are counted plainly and never cancel.
      const cat = category === 'vendor' ? Cat.Vendor : Cat.Generated;
      lines[cat]! += patch ? patch.added.filter((t) => t.trim() !== '').length : Math.max(0, file.additions);
      continue;
    }
    if (!patch) {
      // GitHub omitted a diff this large; without lines it cannot be matched, only estimated.
      if (category === 'source') {
        estimatedCode += Math.max(0, file.additions);
        lines[Cat.Removed]! += Math.max(0, file.deletions);
        estimatedBranches += Math.floor(Math.max(0, file.additions) / 12);
        if (file.additions > 0) estimatedFiles++;
      } else lines[COUNTED_CAT[category as Counted]]! += Math.max(0, file.additions);
      continue;
    }
    fileOps(file, category, patch, ops, counts, cx);
  }
  return { lines, ops, uncounted: counts.uncounted, blank: counts.blank, branches: cx.branches, functions: cx.functions, imports: cx.imports, estimatedCode, estimatedBranches, estimatedFiles };
}

/** Keys of a file's day scope that hold its difficulty state (rules/difficulty.ts). */
const MODIFIED_ADDED = '\u000badded';
const MODIFIED_REMOVED = '\u000bremoved';
const MULTIPLIER = '\u000bm';
const FILE_BONUS = '\u000bbonus';
/** The file's effort credit today (a fixed credit once it is meaningfully modified), in thousandths of a line. */
const FILE_EFFORT = '\u000beffort';
/** Prefix of the per-key mark: this key's removal today was of someone else's line. */
const OTHERS = '\u000bothers\u0000';
/** The user's raw bonus today, in thousandths of a line, before DAILY_BONUS_CAP. */
const DAY_BONUS = '\u000ebonus';
/** The user's effort credit today, in thousandths of a line, before the FILE_CAP files' worth. */
const DAY_EFFORT = '\u000eeffort';
/** In a file's day scope: the file is a fork's, so its bonus and effort credit wait on the upstream (frozen with the multiplier). */
const DEFERRED = '\u000bdeferred';
/** In a file's own scope (not the day's): the last day it held effort credit at the day's close, for repeat-target dampening. */
const EFFORT_PAID = '\u000beffortpaid';
const DAY_SPAN = 2 ** 17;

/**
 * A file's effort history: `paid`, the latest earlier day it held effort credit at the day's close;
 * `on`, whether it holds some now (on `day`). A function of earlier days' final states only, so
 * today's pushes, however split, see the same `paid`.
 */
interface EffortHistory {
  paid: number | null;
  day: number;
  on: boolean;
}

function readEffortHistory(store: LedgerStore, path: string, today: number): EffortHistory {
  const v = store.balance(path, EFFORT_PAID);
  if (v <= 0) return { paid: null, day: today, on: false };
  const on = v % 2 === 1;
  const x = Math.floor(v / 2);
  const day = (x % DAY_SPAN) - 1;
  const paid = Math.floor(x / DAY_SPAN) - 1;
  const known = paid >= 0 ? paid : null;
  if (day === today) return { paid: known, day, on };
  // A new day: if the file held effort credit when its last day closed, that day paid it.
  return { paid: on && day >= 0 ? day : known, day: today, on: false };
}

function writeEffortHistory(store: LedgerStore, path: string, h: EffortHistory): void {
  const packed = h.paid === null && !h.on ? 0 : (((h.paid ?? -1) + 1) * DAY_SPAN + h.day + 1) * 2 + (h.on ? 1 : 0);
  if (packed !== store.balance(path, EFFORT_PAID)) store.setBalance(path, EFFORT_PAID, packed);
}

/** The day's raw bonus and effort credit (thousandths of a line, before the caps) that paid at once: what a fork's deferred bonus is capped against. */
export function dayBonusTotals(store: LedgerStore): PendingBonus {
  const today = store.day ? store.day() : null;
  const at = (key: string) => store.balance(today === null ? key : `${key}\u0005${today}`, '');
  return { bonusMilli: at(DAY_BONUS), effortMilli: at(DAY_EFFORT) };
}

/** Applies a prepared push to the user's ledger: the second half of `measurePush`. A prepared push is applied once. */
export function applyPush(prepared: PreparedPush, store: LedgerStore, context?: PushContext | null): PushDelta {
  const lines = prepared.lines.slice();
  const ops = prepared.ops;
  const counts = { uncounted: new Map([...prepared.uncounted].map(([k, m]) => [k, new Map(m)])) as Tally, blank: prepared.blank };
  const cx = { branches: prepared.branches, functions: prepared.functions, imports: prepared.imports };
  const { estimatedCode, estimatedBranches, estimatedFiles } = prepared;

  // Net change per key across all files (moves between files cancel) and per file (for files touched).
  const net = new Map<string, { info: KeyInfo; delta: number; paths: string[] }>();
  const perFile = new Map<string, Map<string, number>>();
  // Removed code keys, per file, that someone else wrote (from the push's context): modified code.
  const othersRemoved = new Map<string, Set<string>>();
  const othersLines = new Map<string, Set<number>>();
  for (const op of ops) {
    let e = net.get(op.key);
    if (!e) net.set(op.key, (e = { info: op.info, delta: 0, paths: [] }));
    e.delta += op.sign;
    if (op.sign === 1) e.paths.push(op.path);
    if (op.info.kind !== 'code') continue;
    let f = perFile.get(op.path);
    if (!f) perFile.set(op.path, (f = new Map()));
    f.set(op.key, (f.get(op.key) ?? 0) + op.sign);
    const fc = context?.files[op.path];
    if (op.sign === -1 && op.oldLine !== undefined && fc && fc.others.length > 0) {
      let theirs = othersLines.get(op.path);
      if (!theirs) othersLines.set(op.path, (theirs = new Set(fc.others)));
      if (theirs.has(op.oldLine)) {
        let keys = othersRemoved.get(op.path);
        if (!keys) othersRemoved.set(op.path, (keys = new Set()));
        keys.add(op.key);
      }
    }
  }

  const today = store.day ? store.day() : null;
  let code = estimatedCode;
  let style = 0;
  let branches = estimatedBranches;
  let functions = 0;
  let links = 0;
  let modules = 0;
  let churn = 0;
  // Each key's change in what it is worth today, gathered by group for the shape cap.
  const groups = new Map<string, { info: KeyInfo; gained: number; lost: number; added: number; paths: string[]; gainers: string[]; losers: string[] }>();
  for (const [key, { info, delta, paths }] of net) {
    if (delta === 0) continue;
    const before = store.balance('', key);
    const after = before + delta;
    const m = readMemory(store, key, before, today);
    store.setBalance('', key, after);
    if (today !== null) {
      m.hi = Math.max(m.hi, credit(after));
      m.lo = Math.min(m.lo, credit(after));
      writeMemory(store, key, m);
    }
    const gained = gain(after, m) - gain(before, m);
    const lost = loss(after, m) - loss(before, m);
    churn += 2 * (Math.max(0, -gained) + Math.max(0, -lost));
    // The copies past what this key is credited with are repeats, in the files that added them last.
    const added = Math.max(0, delta);
    for (const path of paths.slice(paths.length - Math.max(0, added - Math.max(0, gained)))) tally(counts.uncounted, 'repeat', path);
    let g = groups.get(info.group);
    const credits = Math.max(0, gained) > 0 ? paths.slice(0, Math.max(0, gained)) : [];
    if (!g) groups.set(info.group, (g = { info, gained: 0, lost: 0, added: 0, paths: [], gainers: [], losers: [] }));
    g.gained += gained;
    g.lost += lost;
    g.added += added;
    g.paths.push(...credits);
    if (gained > 0) g.gainers.push(key);
    else if (gained < 0) g.losers.push(key);
  }
  // Complexity rides on credited code keys: each key that gains credit stores what it carries, and
  // each key that loses credit gives back exactly what it stored, so any history adds up.
  const carrying = new Set<string>();
  for (const [group, { info, gained, lost, paths, gainers, losers }] of groups) {
    let credited = gained;
    if (info.kind === 'code') {
      const a = readShape(store, SHAPE_ADDED, group, today);
      const r = readShape(store, SHAPE_REMOVED, group, today);
      if (gained !== 0) writeShape(store, SHAPE_ADDED, group, today, a + gained);
      if (lost !== 0) writeShape(store, SHAPE_REMOVED, group, today, r + lost);
      credited = Math.min(SHAPE_CAP, a + gained) - Math.min(SHAPE_CAP, a);
      code += credited;
      if (group.startsWith('none\u0000')) style += credited;
      for (const key of losers) {
        const w = unpackWeight(store.balance(WEIGHT, key));
        branches -= w.branches;
        links -= w.links;
        if (w.links > 0) modules--;
        if (w.branches !== 0 || w.links !== 0) store.setBalance(WEIGHT, key, 0);
        // A function lives while all three of the lines carrying it do: losing any one undoes it.
        const fn = store.balance(FUNCTION_OF, key);
        if (fn !== 0) {
          if (store.balance(FUNCTION, String(fn)) !== 0) functions -= FUNCTION_POINTS;
          store.setBalance(FUNCTION, String(fn), 0);
          store.setBalance(FUNCTION_OF, key, 0);
        }
      }
      // Only as many of the group's new keys carry complexity as the shape cap credits.
      for (const key of gainers.slice(0, Math.max(0, SHAPE_CAP - Math.max(0, a - losers.length)))) carrying.add(key);
      lines[Cat.Removed]! += Math.min(SHAPE_CAP, r + lost) - Math.min(SHAPE_CAP, r);
      // Lines of this shape gained past the cap are near-duplicates.
      const near = Math.max(0, gained - Math.max(0, credited));
      for (const path of paths.slice(paths.length - near)) tally(counts.uncounted, 'shape', path);
    } else lines[COUNTED_CAT[info.kind]]! += gained;
  }

  const weights = new Map<string, { branches: number; links: number }>();
  for (const key of carrying) weights.set(key, { branches: cx.branches.get(key) ?? 0, links: 0 });
  // A definition counts when at least FUNCTION_STATEMENTS of its statement lines are newly credited.
  // Three newly credited lines carry it (its first line when that is new, then statements); a line
  // carries one function only, and the function is undone as soon as any of the three is.
  const carriers = new Map<string, number>();
  for (const f of cx.functions) {
    const free = [...new Set(f.keys)].filter((k) => carrying.has(k) && !carriers.has(k) && k !== f.header);
    if (free.length < FUNCTION_STATEMENTS) continue;
    const head = f.header !== undefined && carrying.has(f.header) && !carriers.has(f.header) ? [f.header] : [];
    const chosen = [...head, ...free].slice(0, FUNCTION_STATEMENTS);
    const id = functionId(chosen);
    for (const k of chosen) carriers.set(k, id);
    store.setBalance(FUNCTION, String(id), 1);
    functions += FUNCTION_POINTS;
  }
  // Only what a key carries is written: a key that lost its credit was cleared then, and one whose
  // credit lapsed with the day cannot be credited again before its rows expire.
  for (const [key, id] of carriers) store.setBalance(FUNCTION_OF, key, id);
  // A local module links once a day: the first credited import of it carries the names it uses.
  const linkScope = today === null ? LINKS : `${LINKS}\u0005${today}`;
  for (const imp of cx.imports) {
    const w = weights.get(imp.key);
    if (!w || w.links > 0 || store.balance(linkScope, imp.module) !== 0) continue;
    w.links = Math.min(LINK_NAMES_PER_IMPORT, imp.used);
    store.setBalance(linkScope, imp.module, 1);
  }
  for (const [key, w] of weights) {
    branches += w.branches;
    links += w.links;
    if (w.links > 0) modules++;
    const packed = packWeight(w);
    if (packed !== 0) store.setBalance(WEIGHT, key, packed);
  }

  // A file counts while any of its code keys carries a net change today. Each file keeps a count
  // of such keys under its own scope, so a push only reads the keys it touches. The scope is the
  // day's, so a file touched yesterday counts again when it is changed today.
  //
  // The same per-file day state carries the difficulty bonus (rules/difficulty.ts). A file counts as
  // modified code the smaller of two tallies, both functions of its keys' net change today:
  // - added: code keys with a net addition today (each once)
  // - removed: code keys with a net removal today whose removed line someone else wrote (each once;
  //   the mark is set when the key first goes negative, from the push's context, and cleared when it
  //   comes back), so the pusher's own lines, today's or older, never count
  // Its multiplier is frozen at the first push that brings context for it that day, and its bonus is a
  // function of (modified, multiplier): any split of the day's edits adds up to the squash, and an
  // edit undone the same day takes its bonus back.
  const codeByLanguage = new Map<string, number>();
  let filesDelta = estimatedFiles;
  let bonusDelta = 0;
  let effortDelta = 0;
  // A fork's files: their bonus and effort credit wait on the upstream (server/upstream.ts).
  let pendingBonus = 0;
  let pendingEffort = 0;
  const notes: DifficultyNote[] = [];
  for (const [path, keys] of perFile) {
    const scope = today === null ? path : `${path}\u0005${today}`;
    let nonzero = store.balance(scope, NONZERO);
    const wasTouched = nonzero > 0;
    let added = 0;
    let modAdded = 0;
    let modRemoved = 0;
    const others = othersRemoved.get(path);
    for (const [key, delta] of keys) {
      if (delta === 0) continue;
      const before = store.balance(scope, key);
      const after = before + delta;
      store.setBalance(scope, key, after);
      nonzero += (after !== 0 ? 1 : 0) - (before !== 0 ? 1 : 0);
      if (delta > 0) added += delta;
      modAdded += (after >= 1 ? 1 : 0) - (before >= 1 ? 1 : 0);
      if (before > -1 && after <= -1) {
        if (others?.has(key)) {
          store.setBalance(scope, OTHERS + key, 1);
          modRemoved++;
        }
      } else if (before <= -1 && after > -1 && store.balance(scope, OTHERS + key) !== 0) {
        store.setBalance(scope, OTHERS + key, 0);
        modRemoved--;
      }
    }
    store.setBalance(scope, NONZERO, nonzero);
    filesDelta += (nonzero > 0 ? 1 : 0) - (wasTouched ? 1 : 0);
    const language = languageOfPath(path);
    if (language && added > 0) codeByLanguage.set(language, (codeByLanguage.get(language) ?? 0) + added);

    const fc = context?.files[path] ?? null;
    if (modAdded === 0 && modRemoved === 0 && !fc) continue;
    const a = store.balance(scope, MODIFIED_ADDED) + modAdded;
    const r = store.balance(scope, MODIFIED_REMOVED) + modRemoved;
    if (modAdded !== 0) store.setBalance(scope, MODIFIED_ADDED, a);
    if (modRemoved !== 0) store.setBalance(scope, MODIFIED_REMOVED, r);
    let m = store.balance(scope, MULTIPLIER);
    if (m === 0 && fc) {
      m = Math.max(1000, Math.round(fc.mMilli));
      store.setBalance(scope, MULTIPLIER, m);
      // Whether the file is a fork's is frozen with its multiplier: the day's state stays one function.
      if (context?.upstream && m > 1000) store.setBalance(scope, DEFERRED, 1);
    }
    const deferred = store.balance(scope, DEFERRED) !== 0;
    const was = store.balance(scope, FILE_BONUS);
    const now = bonusMilli(Math.min(a, r), m);
    if (now !== was) {
      store.setBalance(scope, FILE_BONUS, now);
      if (deferred) pendingBonus += now - was;
      else bonusDelta += now - was;
    }
    // The effort credit: a function of (modified, frozen multiplier) like the bonus, so it is awarded
    // by the push that takes the file to MEANINGFUL_LINES and taken back by one that drops it below.
    // A file that held effort credit at the close of one of the last EFFORT_REPEAT_DAYS − 1 days needs
    // EFFORT_REPEAT_LINES modified lines today, not MEANINGFUL_LINES: token edits to the same file pay once
    // in three days, real work on it every day. A function of earlier days' final states and today's
    // file state, so any split of today's pushes adds up to the squash, crossing the threshold included.
    const history = today === null ? null : readEffortHistory(store, path, today);
    const repeat = history !== null && history.paid !== null && today! - history.paid < EFFORT_REPEAT_DAYS && Math.min(a, r) < EFFORT_REPEAT_LINES;
    const hadEffort = store.balance(scope, FILE_EFFORT);
    const effort = repeat ? 0 : fileCreditMilli(Math.min(a, r), m);
    if (effort !== hadEffort) {
      store.setBalance(scope, FILE_EFFORT, effort);
      if (deferred) pendingEffort += effort - hadEffort;
      else effortDelta += effort - hadEffort;
    }
    if (history) writeEffortHistory(store, path, { ...history, on: effort > 0 });
    if (m > 1000 && (now !== was || effort !== hadEffort || (fc && fc.others.length > 0)))
      notes.push({ path, modified: Math.max(0, Math.min(a, r)), mMilli: m, extraMilli: now - was, creditMilli: effort - hadEffort, ...(deferred ? { pending: true } : {}), ...(repeat && fileCreditMilli(Math.min(a, r), m) > 0 ? { repeat: true } : {}), context: fc });
  }
  // The day's bonus telescopes like the code cap: credit only what the running total gains below DAILY_BONUS_CAP.
  // So does the effort credit, held to FILE_CAP files' worth; both fold into the bonus lines.
  let bonus = 0;
  const daily = (key: string, delta: number, cap: number) => {
    if (delta === 0) return 0;
    const scope = today === null ? key : `${key}\u0005${today}`;
    const before = store.balance(scope, '');
    const after = before + delta;
    store.setBalance(scope, '', after);
    const capped = (x: number) => Math.floor(Math.max(0, Math.min(x, cap * 1000)) / 1000);
    return capped(after) - capped(before);
  };
  bonus += daily(DAY_BONUS, bonusDelta, DAILY_BONUS_CAP);
  bonus += daily(DAY_EFFORT, effortDelta, FILE_CAP * FILE_CREDIT);

  // Daily caps telescope too: credit only what the running total gains below the cap.
  const day = store.daily();
  const codeAfter = day.code + code;
  const branchesAfter = day.branches + branches;
  store.setDaily(codeAfter, branchesAfter);
  const cappedCode = Math.min(Math.max(codeAfter, 0), DAILY_CODE_CAP) - Math.min(Math.max(day.code, 0), DAILY_CODE_CAP);
  const overCap = code > 0 ? code - Math.max(0, cappedCode) : 0;
  // What the push leaves uncounted is free up to what its new code and tests carry; the excess,
  // and everything past the daily cap, is filler. Only code beyond the day's high-water mark is
  // new: writing, deleting and rewriting the same lines does not earn the allowance again.
  const high = Math.max(readShape(store, HIGH_WATER, '', today), day.code, 0);
  const fresh = Math.max(0, Math.min(codeAfter, DAILY_CODE_CAP) - Math.min(high, DAILY_CODE_CAP));
  if (codeAfter > high) writeShape(store, HIGH_WATER, '', today, codeAfter);
  let free = 0;
  for (const m of counts.uncounted.values()) for (const n of m.values()) free += n;
  const allowance = FREE_PER_CODE * (fresh + Math.max(0, lines[Cat.Test]!)) + FREE_PER_STYLE * Math.min(fresh, Math.max(0, style));
  const filler = overCap + Math.max(0, free - Math.floor(allowance));
  if (overCap > 0) tally(counts.uncounted, 'cap', '', overCap);
  lines[Cat.Code] = cappedCode;
  lines[Cat.Blank] = counts.blank;
  const cappedBranches = Math.min(Math.max(branchesAfter, 0), DAILY_BRANCH_CAP) - Math.min(Math.max(day.branches, 0), DAILY_BRANCH_CAP);

  let language: string | null = null;
  let best = 0;
  for (const [lang, n] of codeByLanguage) {
    if (n > best || (n === best && language !== null && lang < language)) {
      language = lang;
      best = n;
    }
  }
  const uncounted: Uncounted[] = [...counts.uncounted].map(([kind, m]) => ({
    kind,
    lines: [...m.values()].reduce((a, b) => a + b, 0),
    files: [...m].filter(([path]) => path !== '').sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([path, n]) => ({ path, lines: n })),
  }));
  uncounted.sort((a, b) => b.lines - a.lines || (a.kind < b.kind ? -1 : 1));
  return {
    lines, files: filesDelta, branches: cappedBranches, functions, links, modules, churn, filler, language, uncounted, bonus,
    ...(notes.length > 0 ? { difficulty: notes } : {}),
    ...(pendingBonus !== 0 || pendingEffort !== 0 ? { pending: { bonusMilli: pendingBonus, effortMilli: pendingEffort } } : {}),
  };
}

/** A ledger in memory: for tests, bots and the browser demo. Set `today` to move to another day. */
export class MemoryLedger implements LedgerStore {
  private balances = new Map<string, number>();
  private days = new Map<number, { code: number; branches: number }>();
  today = 0;

  balance(scope: string, key: string): number {
    return this.balances.get(`${scope}\u0001${key}`) ?? 0;
  }

  setBalance(scope: string, key: string, balance: number): void {
    const k = `${scope}\u0001${key}`;
    if (balance === 0) this.balances.delete(k);
    else this.balances.set(k, balance);
  }

  daily(): { code: number; branches: number } {
    return { ...(this.days.get(this.today) ?? { code: 0, branches: 0 }) };
  }

  setDaily(code: number, branches: number): void {
    this.days.set(this.today, { code, branches });
  }

  day(): number {
    return this.today;
  }
}
