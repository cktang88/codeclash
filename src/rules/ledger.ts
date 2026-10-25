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
import { branchesIn, categorizePath, classifyLine, extensionOf, isGeneratedContent, splitPatch, syntaxFor, type ChangedFile, type FileCategory } from './classify.ts';
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
  branches: number;
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

function fileOps(file: ChangedFile, category: FileCategory, patch: ReturnType<typeof splitPatch>, ops: Op[], counts: { uncounted: Tally; blank: number }): void {
  const path = file.filename;
  const family = familyOf(path);
  const push = (kind: Counted, text: string, sign: 1 | -1) => {
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
    ops.push({ key, path, info: { kind, branches, group: `${family}\u0000${branches}\u0000${shapeOf(normalized, family)}` }, sign });
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
  const walk = (lines: readonly { text: string; changed: boolean; hunk: number }[], sign: 1 | -1) => {
    const state: { block: Parameters<typeof classifyLine>[2]['block'] } = { block: null };
    let hunk = -1;
    for (const l of lines) {
      if (l.hunk !== hunk) {
        hunk = l.hunk;
        state.block = null;
      }
      const kind = classifyLine(l.text, syntax, state);
      if (!l.changed) continue;
      if (kind === 'blank') counts.blank += sign === 1 ? 1 : 0;
      // The inside of a multi-line string is text, not code.
      else if (kind === 'data') {
        if (sign === 1) tally(counts.uncounted, 'data', path);
      }
      else push(kind, l.text, sign);
    }
  };
  walk(patch.newFile.map((l) => ({ text: l.text, changed: l.added, hunk: l.hunk })), 1);
  walk(patch.oldFile.map((l) => ({ text: l.text, changed: l.removed, hunk: l.hunk })), -1);
}

/** Measures one push against the user's ledger, updating the ledger. */
export function measurePush(files: readonly ChangedFile[], store: LedgerStore): PushDelta {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const ops: Op[] = [];
  const counts = { uncounted: new Map() as Tally, blank: 0 };
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
    fileOps(file, category, patch, ops, counts);
  }

  // Net change per key across all files (moves between files cancel) and per file (for files touched).
  const net = new Map<string, { info: KeyInfo; delta: number; paths: string[] }>();
  const perFile = new Map<string, Map<string, number>>();
  for (const op of ops) {
    let e = net.get(op.key);
    if (!e) net.set(op.key, (e = { info: op.info, delta: 0, paths: [] }));
    e.delta += op.sign;
    if (op.sign === 1) e.paths.push(op.path);
    if (op.info.kind !== 'code') continue;
    let f = perFile.get(op.path);
    if (!f) perFile.set(op.path, (f = new Map()));
    f.set(op.key, (f.get(op.key) ?? 0) + op.sign);
  }

  const today = store.day ? store.day() : null;
  let code = estimatedCode;
  let style = 0;
  let branches = estimatedBranches;
  let churn = 0;
  // Each key's change in what it is worth today, gathered by group for the shape cap.
  const groups = new Map<string, { info: KeyInfo; gained: number; lost: number; added: number; paths: string[] }>();
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
    const g = groups.get(info.group);
    const credits = Math.max(0, gained) > 0 ? paths.slice(0, Math.max(0, gained)) : [];
    if (g) {
      g.gained += gained;
      g.lost += lost;
      g.added += added;
      g.paths.push(...credits);
    } else groups.set(info.group, { info, gained, lost, added, paths: credits });
  }
  for (const [group, { info, gained, lost, paths }] of groups) {
    let credited = gained;
    if (info.kind === 'code') {
      const a = readShape(store, SHAPE_ADDED, group, today);
      const r = readShape(store, SHAPE_REMOVED, group, today);
      if (gained !== 0) writeShape(store, SHAPE_ADDED, group, today, a + gained);
      if (lost !== 0) writeShape(store, SHAPE_REMOVED, group, today, r + lost);
      credited = Math.min(SHAPE_CAP, a + gained) - Math.min(SHAPE_CAP, a);
      code += credited;
      if (group.startsWith('none\u0000')) style += credited;
      branches += credited * info.branches;
      lines[Cat.Removed]! += Math.min(SHAPE_CAP, r + lost) - Math.min(SHAPE_CAP, r);
      // Lines of this shape gained past the cap are near-duplicates.
      const near = Math.max(0, gained - Math.max(0, credited));
      for (const path of paths.slice(paths.length - near)) tally(counts.uncounted, 'shape', path);
    } else lines[COUNTED_CAT[info.kind]]! += gained;
  }

  // A file counts while any of its code keys carries a net change today. Each file keeps a count
  // of such keys under its own scope, so a push only reads the keys it touches. The scope is the
  // day's, so a file touched yesterday counts again when it is changed today.
  const codeByLanguage = new Map<string, number>();
  let filesDelta = estimatedFiles;
  for (const [path, keys] of perFile) {
    const scope = today === null ? path : `${path}\u0005${today}`;
    let nonzero = store.balance(scope, NONZERO);
    const wasTouched = nonzero > 0;
    let added = 0;
    for (const [key, delta] of keys) {
      if (delta === 0) continue;
      const before = store.balance(scope, key);
      const after = before + delta;
      store.setBalance(scope, key, after);
      nonzero += (after !== 0 ? 1 : 0) - (before !== 0 ? 1 : 0);
      if (delta > 0) added += delta;
    }
    store.setBalance(scope, NONZERO, nonzero);
    filesDelta += (nonzero > 0 ? 1 : 0) - (wasTouched ? 1 : 0);
    const language = languageOfPath(path);
    if (language && added > 0) codeByLanguage.set(language, (codeByLanguage.get(language) ?? 0) + added);
  }

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
  return { lines, files: filesDelta, branches: cappedBranches, churn, filler, language, uncounted };
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
