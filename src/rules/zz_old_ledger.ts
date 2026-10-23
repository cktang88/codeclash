// Squash-equivalent measurement of pushes.
//
// Every counted line is reduced to a key (its category, language family and
// whitespace-normalized text) and each push only moves per-key balances: +1 for
// an added line, -1 for a removed one. A key's contribution is a function of its
// balance alone, and a push reports the change in contribution it caused. So
// any sequence of pushes sums to the contribution of the net change, which is
// exactly what one squashed push would report: reformatting, moves, add-then-
// delete and delete-then-restore all cancel, and splitting work gains nothing.

import { Cat, CAT_COUNT } from '../sim/api.ts';
import { branchesIn, categorizePath, classifyLine, extensionOf, isGeneratedContent, splitPatch, syntaxFor, type ChangedFile, type FileCategory } from './zz_old_classify.ts';
import { languageOfPath } from './heraldry.ts';

/** Identical lines beyond this many in one repository count as filler. */
export const DUPLICATE_CAP = 2;
/** Code lines one player can be credited with in a day; the rest is treated as a paste. */
export const DAILY_CODE_CAP = 5000;
export const DAILY_BRANCH_CAP = 10_000;

/** Per-user, per-repository storage of balances. Scopes: '' for the repository, a path for one file. */
export interface LedgerStore {
  balance(scope: string, key: string): number;
  setBalance(scope: string, key: string, balance: number): void;
  /** Credited code and branches so far today, before the daily caps. */
  daily(): { code: number; branches: number };
  setDaily(code: number, branches: number): void;
}

export interface PushDelta {
  /** Signed change per line category. Generated, vendor and blank lines are counted but never cancel. */
  lines: number[];
  /** Signed change in source files carrying counted code changes. */
  files: number;
  branches: number;
  /** Lines that undid counted work from earlier pushes (both halves of each pair). */
  churn: number;
  /** Added lines left out as filler: punctuation-only, literal tables, or duplicates. */
  filler: number;
  language: string | null;
}

type Counted = 'code' | 'comment' | 'test' | 'docs' | 'config';

const COUNTED_CAT: Record<Counted, Cat> = { code: Cat.Code, comment: Cat.Comment, test: Cat.Test, docs: Cat.Docs, config: Cat.Config };

/** Collapses whitespace so reindenting or reformatting changes nothing. */
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** A code line with fewer than two words of two letters or more: `}`, `0x1f, 0x2a,`, `'a', 'b',`. */
export function isFillerText(normalized: string): boolean {
  const words = normalized.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, ' ').match(/[A-Za-z_]{2,}/g);
  return (words?.length ?? 0) < 2;
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
}

/** Contribution of one key at a balance: credited lines (positive adds, negative removals), capped for duplicates. */
function credit(balance: number): number {
  return balance > 0 ? Math.min(balance, DUPLICATE_CAP) : -Math.min(-balance, DUPLICATE_CAP);
}

interface Op {
  key: string;
  path: string;
  info: KeyInfo;
  sign: 1 | -1;
}

/** Classified lines of one file's patch, before any ledger is consulted. */
function fileOps(file: ChangedFile, category: FileCategory, patch: ReturnType<typeof splitPatch>, ops: Op[], counts: { filler: number; blank: number }): void {
  const path = file.filename;
  const family = familyOf(path);
  const push = (kind: Counted, text: string, sign: 1 | -1) => {
    const normalized = normalize(text);
    if ((kind === 'code' || kind === 'test') && isFillerText(normalized)) {
      if (sign === 1) counts.filler++;
      return;
    }
    const key = `${kind}\u0000${family}\u0000${normalized}`;
    const branches = kind === 'code' ? branchesIn(normalized, SAMPLE_PATH[family]!) : 0;
    ops.push({ key, path, info: { kind, branches }, sign });
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
      else push(kind, l.text, sign);
    }
  };
  walk(patch.newFile.map((l) => ({ text: l.text, changed: l.added, hunk: l.hunk })), 1);
  walk(patch.oldFile.map((l) => ({ text: l.text, changed: l.removed, hunk: l.hunk })), -1);
}

/** Measures one push against the user's ledger for its repository, updating the ledger. */
export function measurePush(files: readonly ChangedFile[], store: LedgerStore): PushDelta {
  const lines = new Array<number>(CAT_COUNT).fill(0);
  const ops: Op[] = [];
  const counts = { filler: 0, blank: 0 };
  let estimatedCode = 0;
  let estimatedBranches = 0;
  let estimatedFiles = 0;
  for (const file of files) {
    let category = categorizePath(file.filename);
    if (category === 'ignored') continue;
    const patch = file.patch ? splitPatch(file.patch) : null;
    if (patch && category !== 'vendor' && category !== 'generated' && isGeneratedContent(category, extensionOf(file.filename), patch.added)) category = 'generated';
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

  // Net change per key, repository-wide (moves between files cancel) and per file (for files touched).
  const net = new Map<string, { info: KeyInfo; delta: number }>();
  const perFile = new Map<string, Map<string, number>>();
  for (const op of ops) {
    const e = net.get(op.key);
    if (e) e.delta += op.sign;
    else net.set(op.key, { info: op.info, delta: op.sign });
    if (op.info.kind !== 'code') continue;
    let f = perFile.get(op.path);
    if (!f) perFile.set(op.path, (f = new Map()));
    f.set(op.key, (f.get(op.key) ?? 0) + op.sign);
  }

  let code = estimatedCode;
  let branches = estimatedBranches;
  let churn = 0;
  const codeByLanguage = new Map<string, number>();
  for (const [key, { info, delta }] of net) {
    if (delta === 0) continue;
    const before = store.balance('', key);
    const after = before + delta;
    store.setBalance('', key, after);
    const change = credit(after) - credit(before);
    const cancelled = Math.abs(credit(before)) - (Math.sign(after) === Math.sign(before) ? Math.abs(credit(after)) : 0);
    if (cancelled > 0) churn += 2 * cancelled;
    const added = Math.max(0, credit(after)) - Math.max(0, credit(before));
    const removed = Math.max(0, -credit(after)) - Math.max(0, -credit(before));
    if (info.kind === 'code') {
      code += added;
      branches += added * info.branches;
      lines[Cat.Removed]! += removed;
    } else lines[COUNTED_CAT[info.kind]]! += added;
    if (delta > 0) counts.filler += delta - Math.max(0, change);
  }

  // A file counts while any of its code keys carries a net change today. Each file keeps a count
  // of such keys under its own scope, so a push only reads the keys it touches.
  let filesDelta = estimatedFiles;
  for (const [path, keys] of perFile) {
    let nonzero = store.balance(path, NONZERO);
    const wasTouched = nonzero > 0;
    let added = 0;
    for (const [key, delta] of keys) {
      if (delta === 0) continue;
      const before = store.balance(path, key);
      const after = before + delta;
      store.setBalance(path, key, after);
      nonzero += (after !== 0 ? 1 : 0) - (before !== 0 ? 1 : 0);
      if (delta > 0) added += delta;
    }
    store.setBalance(path, NONZERO, nonzero);
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
  if (code > 0) counts.filler += code - Math.max(0, cappedCode);
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
  return { lines, files: filesDelta, branches: cappedBranches, churn, filler: counts.filler, language };
}

/** A ledger in memory: for tests, bots and the browser demo. */
export class MemoryLedger implements LedgerStore {
  private balances = new Map<string, number>();
  private day = { code: 0, branches: 0 };

  balance(scope: string, key: string): number {
    return this.balances.get(`${scope}\u0001${key}`) ?? 0;
  }

  setBalance(scope: string, key: string, balance: number): void {
    const k = `${scope}\u0001${key}`;
    if (balance === 0) this.balances.delete(k);
    else this.balances.set(k, balance);
  }

  daily(): { code: number; branches: number } {
    return { ...this.day };
  }

  setDaily(code: number, branches: number): void {
    this.day = { code, branches };
  }
}
