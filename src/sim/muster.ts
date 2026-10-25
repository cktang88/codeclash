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
    functions: 0,
    links: 0,
    bonus: 0,
    churn: 0,
    filler: 0,
    purposeCode: new Array<number>(PURPOSES.length).fill(0),
    purposeRemoved: new Array<number>(PURPOSES.length).fill(0),
    purposeBonus: new Array<number>(PURPOSES.length).fill(0),
  };
}

export interface LedgerDelta {
  lines: readonly number[];
  files: number;
  branches: number;
  /** Function points (3 per new function with a real body); absent in older inputs. */
  functions?: number;
  /** Names used from newly imported local modules; absent in older inputs. */
  links?: number;
  /** Difficulty bonus lines; absent in older inputs. */
  bonus?: number;
  churn: number;
  filler: number;
  purpose: Purpose;
}

/** Adds one push's change to a ledger. Totals never go below zero. */
export function applyDelta(ledger: Ledger, d: LedgerDelta): void {
  for (let c = 0; c < CAT_COUNT; c++) ledger.lines[c] = Math.max(0, ledger.lines[c]! + int(d.lines[c]));
  ledger.files = Math.max(0, ledger.files + int(d.files));
  ledger.branches = Math.max(0, ledger.branches + int(d.branches));
  ledger.functions = Math.max(0, (ledger.functions || 0) + int(d.functions));
  ledger.links = Math.max(0, (ledger.links || 0) + int(d.links));
  ledger.bonus = Math.max(0, (ledger.bonus || 0) + int(d.bonus));
  ledger.churn += int(d.churn, 0);
  ledger.filler += int(d.filler, 0);
  const i = PURPOSES.indexOf(d.purpose);
  byPurpose(ledger.purposeCode, i, int(d.lines[Cat.Code]));
  byPurpose(ledger.purposeRemoved, i, int(d.lines[Cat.Removed]));
  if (int(d.bonus) !== 0) byPurpose((ledger.purposeBonus ??= new Array<number>(PURPOSES.length).fill(0)), i, int(d.bonus));
}

/**
 * Fix work: the day's fix code plus the share of its counted difficulty bonus earned by fixes. A
 * maintainer's careful fix to others' established code is worth its bonus in fix specialists too,
 * not only in Footmen. A ledger from before the bonus was kept by purpose shares it like its code.
 */
export function fixWork(ledger: Ledger): number {
  const i = PURPOSES.indexOf('fix');
  const fix = ledger.purposeCode[i]!;
  const { bonus } = effectiveLedger(ledger);
  if (bonus <= 0) return fix;
  const by = ledger.purposeBonus;
  let total = 0;
  let mine = 0;
  if (by && by.length === PURPOSES.length) {
    for (const n of by) total += n;
    mine = by[i]!;
  }
  if (total <= 0) {
    for (const n of ledger.purposeCode) total += n;
    mine = fix;
  }
  return total > 0 ? fix + fl((bonus * mine) / total) : fix;
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
 * Filler share of lines at which the army starts to fray, and at which the penalty is full.
 * Filler is only what a push leaves uncounted beyond what its code carries (`FREE_PER_CODE` in
 * rules/ledger.ts), so honest work sits near zero and the ramp can start low.
 */
export const FILLER_RAMP = [0.15, 0.5] as const;

/**
 * Code lines count in full up to CODE_KNEE a war, and at half value from there up
 * to CODE_CAP, where they stop: at most 6000 lines' worth. With a linear budget the
 * cap is what stops runaway volume; a knee rather than a cliff, so a big honest day
 * is not cut flat at one line and padding toward the cap pays half. Removed lines
 * stop at CODE_KNEE: they are seasoning, and deleting is cheap. Ingestion caps each
 * UTC day at CODE_CAP lines; this cap keeps a war that spans UTC midnight from
 * counting two days of pasting.
 */
export const CODE_KNEE = 4000;
export const CODE_CAP = 8000;
/** The most lines' worth `credited` can return: CODE_KNEE plus half the stretch above it. */
export const CODE_CREDIT_MAX = CODE_KNEE + (CODE_CAP - CODE_KNEE) / 2;
/** Code lines per credited file: one line in each of two hundred files is not a sweeping change. */
const LINES_PER_FILE = 20;
/** Removed lines per credited file. */
const REMOVED_PER_FILE = 100;
/**
 * Code lines per point of complexity: denser than this is padding. Honest work in this repository
 * runs at about one point per three lines (b0f0ae9: 617.5 points over 1770 lines), the densest real
 * commits at about one per two.
 */
const LINES_PER_COMPLEXITY = 2;
/** Code lines per function point (3 per function): denser than this is code split up to farm functions. */
export const LINES_PER_FUNCTION_POINT = 8;
/** Links (names used from local modules) make at most this share of complexity: branches and functions dominate. */
export const LINK_SHARE = 0.25;

/**
 * Difficulty bonus lines count at most this many times the day's code lines, so a tiny day cannot
 * explode. The bonus has two parts (rules/difficulty.ts): `(M − 1)` per modified line (at most 2.2),
 * and the effort credit, a fixed 120 lines for each hard file meaningfully modified, which needs at
 * least 3 modified lines: at most 40 a line. Together at most about 42 per code line; honest days sit
 * far below, and ingestion's own caps (2,000 bonus lines and 15 files' effort a day) bind first.
 */
export const BONUS_PER_CODE = 43;

/** Lines' worth of `n` code lines: in full to the knee, half beyond, nothing past the cap. */
export function credited(n: number): number {
  const x = Math.max(0, Math.min(CODE_CAP, Math.floor(n)));
  return x <= CODE_KNEE ? x : CODE_KNEE + fl((x - CODE_KNEE) / 2);
}

/**
 * Complexity in half points: decision points, plus function points (3 per new function with a
 * real body), plus half a point per name used from a newly imported local module. Links are held
 * to LINK_SHARE of the whole, and the whole to one point per LINES_PER_COMPLEXITY lines of code.
 */
export function complexityOf(ledger: Ledger, code: number): { half: number; branches: number; functions: number; links: number } {
  const branches = Math.max(0, ledger.branches);
  // Splitting code into many small functions must not pay: function points are held to one per
  // LINES_PER_FUNCTION_POINT lines of code (a function every 24 lines; honest code here has one every 32).
  const functions = Math.min(Math.max(0, ledger.functions || 0), fl(code / LINES_PER_FUNCTION_POINT));
  // links ≤ LINK_SHARE of (2·branches + 2·functions + links), in half points.
  const links = Math.min(Math.max(0, ledger.links || 0), fl((2 * (branches + functions) * LINK_SHARE) / (1 - LINK_SHARE)));
  const half = Math.min(2 * branches + 2 * functions + links, fl((2 * code) / LINES_PER_COMPLEXITY));
  return { half, branches, functions, links };
}

/**
 * The parts of a ledger that count, each bounded by the real code behind it so
 * that no single metric can be pumped on its own. `complexity` is in points (it may end in .5).
 */
export function effectiveLedger(ledger: Ledger): { code: number; bonus: number; removed: number; files: number; complexity: number } {
  const raw = Math.max(0, ledger.lines[Cat.Code]!);
  const code = credited(raw);
  // The difficulty bonus is code credit: it shares the knee and the cap with the code lines, and is
  // held to BONUS_PER_CODE times them. Files, complexity and veteran ranks stay with the real lines.
  const bonus = credited(raw + Math.min(Math.max(0, ledger.bonus || 0), BONUS_PER_CODE * raw)) - code;
  const removed = Math.max(0, Math.min(CODE_KNEE, ledger.lines[Cat.Removed]!));
  const files = Math.min(ledger.files, 1 + fl(code / LINES_PER_FILE) + fl(removed / REMOVED_PER_FILE));
  return { code, bonus, removed, files, complexity: complexityOf(ledger, code).half / 2 };
}

/**
 * Platoon slots per 10,000 of each effective metric. The budget is linear: twice
 * the real code raises twice the army. Code is most of it; files touched and
 * complexity season it, and removed lines count a little (a typical day of 2000
 * code lines, 60 files, 570 points of complexity and 750 removed lines is worth
 * 150 slots, of which code is 128). A point of complexity is worth 0.014 slots:
 * honest code carries about 1.4 points for every branch point the keyword count
 * found, so the complexity term raises what the branch term (0.01 a point, at
 * half today's army size) did.
 */
export const BUDGET_PER_10K = { code: 640, files: 1400, complexity: 140, removed: 80 } as const;

/** The army's size in platoon slots before specialists are chosen, with CONQUEST_BONUS per capital held beyond home. */
export function budgetOf(ledger: Ledger, conquered = 0): number {
  const { code, bonus, removed, files } = effectiveLedger(ledger);
  if (code + removed <= 0) return 0;
  const w = BUDGET_PER_10K;
  // Whole numbers until the end (complexity in half points), and the conquest factor is a multiple of 1/4, so the product is exact.
  const sum = w.code * (code + bonus) + w.files * files + (w.complexity / 2) * complexityOf(ledger, code).half + w.removed * removed;
  const conquest = 1 + CONQUEST_BONUS * Math.max(0, Math.floor(conquered));
  return fl((sum * conquest) / 10_000);
}

/**
 * How good a player's soldiers are today. Real code that touches many files
 * earns veteran ranks; drowning a little code in tests, comments or filler
 * makes a ragged army. Depends only on the ledger, so it is the same however
 * the work was split into pushes.
 */
export function armyQuality(ledger: Ledger): { quality: number; veterancy: number; power: number; notes: QualityNote[] } {
  const { code, bonus, files } = effectiveLedger(ledger);
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
  const filler = -0.15 * ramp(fillerRatio, FILLER_RAMP[0], FILLER_RAMP[1]);
  if (filler < 0) notes.push({ kind: 'filler', effect: filler, text: `${Math.round(fillerRatio * 100)}% of lines were filler` });
  quality = Math.max(0.7, quality + tests + comments + filler);
  let veterancy = 0;
  // The difficulty bonus is code credit, so it counts toward a veteran's lines (the files must still be real).
  while (veterancy < VETERAN_CODE.length && code + bonus >= VETERAN_CODE[veterancy]! && files >= VETERAN_FILES[veterancy]!) veterancy++;
  if (veterancy > 0) notes.push({ kind: 'veteran', effect: veterancy * VETERAN_BONUS, text: `Veteran rank ${veterancy}` });
  return { quality, veterancy, power: quality * (1 + VETERAN_BONUS * veterancy), notes };
}


// Honest code carries about 1.42 points of complexity for every branch point the keyword count
// found (this repository's last 81 commits: 7994 points, 5636 keyword branch points), so the
// thresholds that were in branch points are those times 1.42.

/** Knights: twice `2·√(complexity / KNIGHT_COMPLEXITY)` (was `2·√(branches / 10)`). */
export const KNIGHT_COMPLEXITY = 14;
/** Trolls, with 200+ code lines: two per TROLL_COMPLEXITY points, up to 6 (was one per 150 branch points, up to 3). */
export const TROLL_COMPLEXITY = 215;
/** Complexity the first and the second Dragon need (were 90 and 400 branch points). */
export const DRAGON_COMPLEXITY = [130, 570] as const;

/**
 * Fix work per pair of each fix specialist: Clerics by a square root (`2·floor(√fix / cleric)`), the
 * rest linear (`2·floor(fix / n)`).
 */
export const FIX = { cleric: 4.5, ballista: 250, paladin: 500, ranger: 900 } as const;

/**
 * The order specialists are paid in while their share of the budget lasts: heroes first, then the
 * big kinds; Ballistae before the other fix specialists so a fixer's army always has its answer to
 * the big; Clerics before Knights, so a small fix still raises its Clerics.
 */
export const PAY_ORDER: readonly Kind[] = [
  Kind.Dragon, Kind.Champion, Kind.Troll, Kind.Trebuchet, Kind.GriffinRider, Kind.BoneGolem, Kind.Ballista, Kind.Paladin, Kind.Ranger, Kind.Wizard,
  Kind.Cleric, Kind.Knight, Kind.Outrider, Kind.Mercenary, Kind.Skeleton,
];

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
  const { code, files, complexity } = effectiveLedger(ledger);
  const pc = (p: Purpose) => ledger.purposeCode[PURPOSES.indexOf(p)]!;
  const pr = (p: Purpose) => ledger.purposeRemoved[PURPOSES.indexOf(p)]!;

  // Every capital held beyond its own home multiplies the budget (CONQUEST_BONUS each): conquest snowballs.
  const budget = budgetOf(ledger, conquered);

  // What the work's purposes and complexity ask for, before it is fitted to the budget.
  const want = new Array<number>(KIND_COUNT).fill(0);
  // Armies are twice the size they were, and so is every count: each kind comes in pairs where
  // one came before, so the make-up of an army (and the share each kind takes) is what it was.
  // Fix work (fix code and the difficulty bonus its fixes earned) raises a mix: Ballistae to bring
  // down the big, Paladins and Rangers, and Clerics.
  const fix = fixWork(ledger);
  want[Kind.Cleric] = 2 * fl(sq(fix) / FIX.cleric);
  want[Kind.Ballista] = 2 * fl(fix / FIX.ballista);
  want[Kind.Paladin] = 2 * fl(fix / FIX.paladin);
  want[Kind.Ranger] = 2 * fl(fix / FIX.ranger);
  const feature = pc('feature') + pc('work');
  // At most one Dragon per 900 feature lines. A second still needs 4000 (twice that would be the
  // cap, out of reach), and only one lives at a time: an extra marches as a Champion.
  const dragons = feature >= 4000 && files >= 40 && complexity >= DRAGON_COMPLEXITY[1] ? 2 : feature >= 900 && files >= 10 && complexity >= DRAGON_COMPLEXITY[0] ? 1 : 0;
  want[Kind.Dragon] = dragons;
  want[Kind.Champion] = Math.max(0, 2 * Math.min(3, fl(pc('feature') / 400), fl(files / 5)) - dragons);
  const refactor = pr('refactor') + pc('refactor') / 2;
  want[Kind.Outrider] = 2 * fl(sq(refactor) / 1.5);
  want[Kind.GriffinRider] = 2 * Math.min(3, fl(pr('refactor') / 400));
  want[Kind.Wizard] = 2 * Math.min(4, fl(sq(pc('perf')) / 3));
  const revert = pc('revert') + pr('revert');
  want[Kind.Skeleton] = 2 * fl(sq(revert));
  want[Kind.BoneGolem] = 2 * Math.min(2, fl(revert / 600));
  want[Kind.Mercenary] = 2 * Math.min(3, fl(sq(pc('chore')) / 2));
  want[Kind.Knight] = 2 * fl(2 * sq(complexity / KNIGHT_COMPLEXITY));
  if (code >= 200) want[Kind.Troll] = 2 * Math.min(3, fl(complexity / TROLL_COMPLEXITY));
  want[Kind.Trebuchet] = 2 * Math.min(3, fl(files / 15));

  // Specialists may spend at most 65% of the budget; heroes are paid first.
  const cap = fl(budget * 0.65);
  let spent = 0;
  for (const k of PAY_ORDER) {
    const per = STATS[k]!.slots;
    // Paid in pairs, as they are counted (the Dragon alone), so the share left to each kind is what it was.
    const n = k === Kind.Dragon ? Math.min(want[k]!, fl((cap - spent) / per)) : Math.min(want[k]!, 2 * fl((cap - spent) / (2 * per)));
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
  counts[Kind.Warden] = 2 * Math.min(4, fl(sq(L[Cat.Test]!) / 5));
  counts[Kind.Archer] = 2 * Math.min(3, fl(sq(L[Cat.Comment]!) / 5));
  counts[Kind.Herald] = 2 * Math.min(2, fl(L[Cat.Docs]! / 120));
  counts[Kind.Sapper] = 2 * Math.min(3, fl(L[Cat.Config]! / 80));

  // Every day's first push sends at least a messenger.
  if (slotsOf(counts) === 0) counts[Kind.Footman] = 1;
  return counts;
}
