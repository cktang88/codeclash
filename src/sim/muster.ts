import { CAT_COUNT, Cat, Kind, KIND_COUNT, PURPOSES, type Ledger, type Purpose } from './api.ts';
import { CONQUEST_BONUS, STATS } from './stats.ts';

const sq = Math.sqrt;
const fl = Math.floor;

/**
 * A push's line deltas as the simulation sees them: nine whole numbers within
 * ±1e6. Live inputs and replayed ones pass through this, so a stray fraction,
 * NaN or Infinity can never make them disagree.
 */
export function cleanLines(lines: unknown): number[] {
  const out = new Array<number>(CAT_COUNT).fill(0);
  if (!Array.isArray(lines)) return out;
  for (let c = 0; c < CAT_COUNT; c++) out[c] = int(lines[c]);
  return out;
}

// Conventional-commit prefixes first, then common words. Order matters: a
// "revert" of a fix is a revert, and "fix typo in docs" is still a fix.
const PURPOSE_RULES: readonly [Purpose, RegExp][] = [
  ['revert', /^revert\b|^this reverts commit/i],
  ['fix', /^(fix|hotfix|bugfix)(\(.*?\))?!?:|\b(fix(e[sd]|ing)?|bug|crash(es|ing)?|regression|hotfix|patch(es|ed)?)\b/i],
  ['perf', /^perf(\(.*?\))?!?:|\b(perf(ormance)?|optimi[sz](e[sd]?|ation)|faster|speed ?up)\b/i],
  ['refactor', /^refactor(\(.*?\))?!?:|\b(refactor(ed|ing)?|clean ?up|simplif(y|ied)|restructur(e|ed)|extract(ed)?|remove[sd]?|delete[sd]?|dead code)\b/i],
  ['chore', /^(chore|ci|build|deps?|style)(\(.*?\))?!?:|\b(bump(s|ed)?|upgrade[sd]?|dependenc(y|ies)|lockfile|release v?\d)\b/i],
  ['feature', /^feat(ure)?(\(.*?\))?!?:|\b(add(s|ed)?|implement(s|ed)?|introduce[sd]?|support(s|ed)?|new|enable[sd]?)\b/i],
];

/** What a push is for, from the first line of its newest commit message. */
export function purposeOf(msg: string): Purpose {
  const head = (msg.split('\n')[0] ?? '').trim();
  for (const [purpose, re] of PURPOSE_RULES) if (re.test(head)) return purpose;
  return 'work';
}

export function slotsOf(counts: readonly number[]): number {
  let n = 0;
  for (let k = 0; k < KIND_COUNT; k++) n += (counts[k] ?? 0) * STATS[k]!.slots;
  return n;
}

const LIMIT = 1e6;
/** A whole number from an untrusted field, clamped to ±1e6; NaN becomes 0. */
export function int(n: unknown, min = -LIMIT): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(LIMIT, Math.trunc(n))) : 0;
}

export function emptyLedger(): Ledger {
  return {
    lines: new Array<number>(CAT_COUNT).fill(0),
    files: 0,
    branches: 0,
    churn: 0,
    filler: 0,
    purposeCode: new Array<number>(PURPOSES.length).fill(0),
    purposeRemoved: new Array<number>(PURPOSES.length).fill(0),
  };
}

export interface LedgerDelta {
  lines: readonly number[];
  files: number;
  branches: number;
  churn: number;
  filler: number;
  purpose: Purpose;
}

/** Adds one push's change to a ledger. Totals never go below zero. */
export function applyDelta(ledger: Ledger, d: LedgerDelta): void {
  for (let c = 0; c < CAT_COUNT; c++) ledger.lines[c] = Math.max(0, ledger.lines[c]! + int(d.lines[c]));
  ledger.files = Math.max(0, ledger.files + int(d.files));
  ledger.branches = Math.max(0, ledger.branches + int(d.branches));
  ledger.churn += int(d.churn, 0);
  ledger.filler += int(d.filler, 0);
  const i = PURPOSES.indexOf(d.purpose);
  byPurpose(ledger.purposeCode, i, int(d.lines[Cat.Code]));
  byPurpose(ledger.purposeRemoved, i, int(d.lines[Cat.Removed]));
}

/**
 * Credits a change to one purpose. Undone work comes off that purpose first and
 * then off the others in order, so the purposes always sum to the category's
 * total: writing a feature and deleting it under another message leaves nothing.
 */
function byPurpose(tally: number[], i: number, change: number): void {
  if (change >= 0) {
    tally[i]! += change;
    return;
  }
  let owed = -change;
  for (let k = -1; k < tally.length && owed > 0; k++) {
    const j = k < 0 ? i : k;
    const take = Math.min(owed, tally[j]!);
    tally[j]! -= take;
    owed -= take;
  }
}

/** Code lines needed for each veteran rank, with source files touched. */
export const VETERAN_CODE = [250, 800, 2000];
export const VETERAN_FILES = [5, 12, 25];
export const VETERAN_BONUS = 0.1;

export interface QualityNote {
  kind: 'veteran' | 'tests' | 'comments' | 'filler';
  effect: number;
  text: string;
}

const ramp = (x: number, from: number, to: number) => Math.max(0, Math.min(1, (x - from) / (to - from)));

/**
 * Code (and removed) lines one war's ledger counts. Ingestion caps each UTC day
 * at the same amount; this cap keeps a war that spans UTC midnight from
 * counting two days of pasting.
 */
export const CODE_CAP = 5000;
/** Code lines per credited file: one line in each of two hundred files is not a sweeping change. */
const LINES_PER_FILE = 20;
/** Removed lines per credited file. */
const REMOVED_PER_FILE = 100;
/** Code lines per credited branch point: denser than this is padding (`if (true)`, `&&` chains). */
const LINES_PER_BRANCH = 3;

/**
 * The parts of a ledger that count, each bounded by the real code behind it so
 * that no single metric can be pumped on its own.
 */
export function effectiveLedger(ledger: Ledger): { code: number; removed: number; files: number; branches: number } {
  const code = Math.min(CODE_CAP, ledger.lines[Cat.Code]!);
  const removed = Math.min(CODE_CAP, ledger.lines[Cat.Removed]!);
  const files = Math.min(ledger.files, 1 + fl(code / LINES_PER_FILE) + fl(removed / REMOVED_PER_FILE));
  const branches = Math.min(ledger.branches, fl(code / LINES_PER_BRANCH));
  return { code, removed, files, branches };
}

/**
 * How good a player's soldiers are today. Real code that touches many files
 * earns veteran ranks; drowning a little code in tests, comments or filler
 * makes a ragged army. Depends only on the ledger, so it is the same however
 * the work was split into pushes.
 */
export function armyQuality(ledger: Ledger): { quality: number; veterancy: number; power: number; notes: QualityNote[] } {
  const { code, files } = effectiveLedger(ledger);
  const notes: QualityNote[] = [];
  let quality = 1;
  const testRatio = ledger.lines[Cat.Test]! / (code + 20);
  const commentRatio = ledger.lines[Cat.Comment]! / (code + 20);
  const fillerRatio = ledger.filler / (code + ledger.filler + 20);
  const tests = -0.15 * ramp(testRatio, 3, 8);
  if (tests < 0) notes.push({ kind: 'tests', effect: tests, text: `Tests outweigh the code ${testRatio.toFixed(1)} to 1` });
  else if (testRatio >= 0.2 && code >= 50) {
    quality += 0.05;
    notes.push({ kind: 'tests', effect: 0.05, text: 'Well tested' });
  }
  const comments = -0.1 * ramp(commentRatio, 0.5, 2);
  if (comments < 0) notes.push({ kind: 'comments', effect: comments, text: `Comments outweigh the code ${commentRatio.toFixed(1)} to 1` });
  const filler = -0.15 * ramp(fillerRatio, 0.3, 0.8);
  if (filler < 0) notes.push({ kind: 'filler', effect: filler, text: `${Math.round(fillerRatio * 100)}% of lines were filler` });
  quality = Math.max(0.7, quality + tests + comments + filler);
  let veterancy = 0;
  while (veterancy < VETERAN_CODE.length && code >= VETERAN_CODE[veterancy]! && files >= VETERAN_FILES[veterancy]!) veterancy++;
  if (veterancy > 0) notes.push({ kind: 'veteran', effect: veterancy * VETERAN_BONUS, text: `Veteran rank ${veterancy}` });
  return { quality, veterancy, power: quality * (1 + VETERAN_BONUS * veterancy), notes };
}


/**
 * The army a ledger is worth, as total soldiers by kind. Contribution sets a
 * budget of platoon slots; the purposes of the work spend part of it on
 * specialists, and Footmen take the rest, so a commit message changes what the
 * army is made of but never how big it is. Support from tests, comments, docs
 * and config is small and separate. Generated and vendored code count nothing.
 * `conquered` is how many capitals the player holds beyond its own home.
 */
export function armyFor(ledger: Ledger, pushes: number, conquered = 0): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0);
  if (pushes <= 0) return counts;
  const L = ledger.lines;
  const { code, removed, files, branches } = effectiveLedger(ledger);
  const pc = (p: Purpose) => ledger.purposeCode[PURPOSES.indexOf(p)]!;
  const pr = (p: Purpose) => ledger.purposeRemoved[PURPOSES.indexOf(p)]!;

  // Every capital held beyond its own home multiplies the budget (CONQUEST_BONUS each): conquest snowballs.
  const conquest = 1 + CONQUEST_BONUS * Math.max(0, Math.floor(conquered));
  const budget = code + removed > 0 ? fl((1.1 * sq(code) + 1.5 * sq(files) + 0.5 * sq(branches) + 0.3 * sq(removed)) * conquest) : 0;

  // What the work's purposes and complexity ask for, before it is fitted to the budget.
  const want = new Array<number>(KIND_COUNT).fill(0);
  const fix = pc('fix');
  want[Kind.Cleric] = fl(sq(fix) / 2.5);
  want[Kind.Paladin] = fl(fix / 150);
  want[Kind.Ranger] = fl(fix / 250);
  const feature = pc('feature') + pc('work');
  const dragons = feature >= 4000 && files >= 40 && branches >= 400 ? 2 : feature >= 900 && files >= 10 && branches >= 90 ? 1 : 0;
  want[Kind.Dragon] = dragons;
  want[Kind.Champion] = Math.max(0, Math.min(3, fl(pc('feature') / 400), fl(files / 5)) - dragons);
  const refactor = pr('refactor') + pc('refactor') / 2;
  want[Kind.Outrider] = fl(sq(refactor) / 1.5);
  want[Kind.GriffinRider] = Math.min(3, fl(pr('refactor') / 400));
  want[Kind.Wizard] = Math.min(4, fl(sq(pc('perf')) / 3));
  const revert = pc('revert') + pr('revert');
  want[Kind.Skeleton] = fl(sq(revert));
  want[Kind.BoneGolem] = Math.min(2, fl(revert / 600));
  want[Kind.Mercenary] = Math.min(3, fl(sq(pc('chore')) / 2));
  want[Kind.Knight] = fl(2 * sq(branches / 10));
  if (code >= 200) want[Kind.Troll] = Math.min(3, fl(branches / 150));
  want[Kind.Trebuchet] = Math.min(3, fl(files / 15));

  // Specialists may spend at most 65% of the budget; heroes are paid first.
  const cap = fl(budget * 0.65);
  let spent = 0;
  const order: Kind[] = [Kind.Dragon, Kind.Champion, Kind.Troll, Kind.Trebuchet, Kind.GriffinRider, Kind.BoneGolem, Kind.Paladin, Kind.Ranger, Kind.Wizard, Kind.Knight, Kind.Cleric, Kind.Outrider, Kind.Mercenary, Kind.Skeleton];
  for (const k of order) {
    const per = STATS[k]!.slots;
    const n = Math.min(want[k]!, fl((cap - spent) / per));
    if (n <= 0) continue;
    counts[k] = n;
    spent += n * per;
  }
  counts[Kind.Footman] = budget - spent;
  // Untested, uncommented code fights recklessly. A Berserker outfights a Footman, so each
  // takes the place of two: skipping tests and comments must never make an army stronger.
  if (code >= 50 && L[Cat.Test] === 0 && L[Cat.Comment] === 0) {
    const berserk = fl(counts[Kind.Footman]! / 3);
    counts[Kind.Footman]! -= 2 * berserk;
    counts[Kind.Berserker] = berserk;
  }

  // Support stays small: code is what wins wars.
  counts[Kind.Warden] = Math.min(4, fl(sq(L[Cat.Test]!) / 5));
  counts[Kind.Archer] = Math.min(3, fl(sq(L[Cat.Comment]!) / 5));
  counts[Kind.Herald] = Math.min(2, fl(L[Cat.Docs]! / 120));
  counts[Kind.Sapper] = Math.min(3, fl(L[Cat.Config]! / 80));

  // Every day's first push sends at least a messenger.
  if (slotsOf(counts) === 0) counts[Kind.Footman] = 1;
  return counts;
}
