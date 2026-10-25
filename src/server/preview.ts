// The army preview: what a public repository's latest commits would raise. Each commit is read
// and measured exactly as ingestion measures a push (`measurePush`), as a standalone push on a
// fresh ledger, then mustered with `armyFor` and `armyQuality`. Nothing here touches a player's
// ledger, the database or a war; it only reads public GitHub data with the server's own token.

import type { PreviewArmy, PreviewCombined, PreviewCommit, PreviewDifficulty, PreviewLines, PreviewNearMiss, PreviewResponse, PreviewSource, PreviewUncounted, PreviewUnit, PreviewWhy } from '../protocol.ts';
import type { ChangedFile } from '../rules/classify.ts';
import { loadGrammars } from '../rules/complexity.ts';
import { DAILY_BONUS_CAP, EFFORT_REPEAT_LINES, FILE_CAP, FILE_CREDIT, GATE_CAP, MEANINGFUL_LINES, pusherOf, type DifficultyNote, type PushContext } from '../rules/difficulty.ts';
import type { DifficultyContext } from './difficulty.ts';
import { DAILY_CODE_CAP, measurePush, MemoryLedger, SHAPE_CAP, type LedgerStore, type PushDelta, type Uncounted, type UncountedKind } from '../rules/ledger.ts';
import { validRef, validRepo } from '../rules/repoRef.ts';
import { CAT_NAMES, Cat, Kind, PURPOSES, type Ledger, type Purpose } from '../sim/api.ts';
import { applyDelta, armyFor, armyQuality, BONUS_PER_CODE, BUDGET_PER_10K, budgetOf, cleanLines, CODE_CAP, CODE_KNEE, complexityOf, credited, DRAGON_COMPLEXITY, effectiveLedger, emptyLedger, fixWork, int, LINK_SHARE, PAY_ORDER, purposeOf, slotsOf, VETERAN_CODE, VETERAN_FILES } from '../sim/muster.ts';
import { STATS } from '../sim/stats.ts';
import { GithubError, MAX_FILES, type CommitMeta, type GithubClient } from './github.ts';

/** Commits previewed per repository. */
export const PREVIEW_COMMITS = 10;
/** Commits listed to find them, so a run of merges does not leave the page short. */
const LIST_DEPTH = 40;
/** Branches offered in the selector. */
const BRANCH_LIMIT = 30;
/** A branch's head is read again after this long. */
export const HEAD_TTL_MS = 5 * 60_000;
/** Repository + branch answers kept. */
const HEAD_ENTRIES = 300;
/** Bytes of diffs kept by commit sha (a sha's diff never changes). */
const SHA_BYTES = 48 * 1024 * 1024;
/** Diffs fetched at once for one preview. */
const CONCURRENCY = 4;
/** GitHub requests one uncached preview can take: the repository, its branches, the history and ten diffs. */
export const PREVIEW_COST = 3 + PREVIEW_COMMITS;
const SHORT_SHA = 7;

export type PreviewFailureCode = 'invalid' | 'not_found' | 'no_branch' | 'github_limited' | 'github_error';

export class PreviewFailure extends Error {
  constructor(
    readonly code: PreviewFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export const PREVIEW_STATUS: Record<PreviewFailureCode, number> = { invalid: 400, not_found: 404, no_branch: 404, github_limited: 503, github_error: 502 };

/** A least-recently-used map bounded by the summed weight of its values. */
export class WeightedLru<V> {
  private map = new Map<string, { value: V; weight: number }>();
  private total = 0;
  constructor(
    private readonly capacity: number,
    private readonly weigh: (v: V) => number = () => 1,
  ) {}
  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key: string, value: V): void {
    this.delete(key);
    const weight = Math.max(1, this.weigh(value));
    if (weight > this.capacity) return;
    this.map.set(key, { value, weight });
    this.total += weight;
    while (this.total > this.capacity) {
      const oldest = this.map.keys().next().value!;
      this.delete(oldest);
    }
  }
  delete(key: string): void {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.total -= e.weight;
  }
  get size(): number {
    return this.map.size;
  }
}

/** One commit's diff as fetched, kept by sha so the next preview of the same history reads only new commits. */
interface Diff {
  files: ChangedFile[] | null;
  bytes: number;
}

/** The body of a preview, shared by every viewer; `viewerHue` is added per request. */
export type PreviewBody = Omit<PreviewResponse, 'viewerHue'>;

export interface PreviewDeps {
  github: GithubClient;
  clock: () => number;
  /** Rate-limit headroom kept for ingestion: a preview that would dip below it is refused. */
  reserve?: number;
  /** Reads each commit's difficulty context, as ingestion does; none: no bonus. */
  context?: DifficultyContext | null;
}

// ------------------------------------------------------------------ measuring

function linesOf(lines: readonly number[]): PreviewLines {
  const out = {} as Record<(typeof CAT_NAMES)[number], number>;
  CAT_NAMES.forEach((name, c) => (out[name] = Math.max(0, lines[c] ?? 0)));
  return out;
}

function armyOf(ledger: Ledger, pushes: number): PreviewArmy {
  const counts = armyFor(ledger, pushes);
  const q = armyQuality(ledger);
  return {
    counts,
    slots: slotsOf(counts),
    budget: budgetOf(ledger),
    quality: q.quality,
    veterancy: q.veterancy,
    power: q.power,
    ragged: q.quality < 0.95,
    notes: q.notes,
  };
}

/** Applies one measured push to a ledger exactly as the war does (`musterPush` in sim/world.ts). */
function credit(ledger: Ledger, delta: PushDelta, purpose: Purpose): void {
  applyDelta(ledger, { lines: cleanLines(delta.lines), files: int(delta.files), branches: int(delta.branches), functions: int(delta.functions), links: int(delta.links), bonus: int(delta.bonus), churn: int(delta.churn, 0), filler: int(delta.filler, 0), purpose });
}

/** A ledger's complexity parts, and the complexity the army counts from them. */
function complexityFields(ledger: Ledger): { branches: number; functions: number; links: number; complexity: number } {
  return { branches: ledger.branches, functions: ledger.functions, links: ledger.links, complexity: effectiveLedger(ledger).complexity };
}

/** What one commit alone raises: a standalone push measured on a fresh ledger. */
export function musterCommit(files: readonly ChangedFile[], message: string, store: LedgerStore = new MemoryLedger(), context: PushContext | null = null): { delta: PushDelta; ledger: Ledger; army: PreviewArmy; purpose: Purpose } {
  const delta = measurePush(files, store, context);
  const purpose = purposeOf(message);
  const ledger = emptyLedger();
  credit(ledger, delta, purpose);
  return { delta, ledger, army: armyOf(ledger, 1), purpose };
}

// ------------------------------------------------------------------ explaining

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A count of points, which may end in a half. */
const pts = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const unit = (kind: number, n: number) => (n === 1 && (kind === Kind.Dragon || kind === Kind.Troll) ? `a ${STATS[kind]!.name}` : `${fmt(n)} ${n === 1 ? STATS[kind]!.name : STATS[kind]!.plural}`);
const units = (counts: readonly number[], kinds: readonly number[]) => kinds.filter((k) => counts[k]! > 0).map((k) => unit(k, counts[k]!)).join(', ');

/** What each purpose raises, and what a commit must be to raise it. */
const PURPOSE_SPECIALISTS: Record<Exclude<Purpose, 'work'>, string> = {
  fix: 'Bug fix too small for Clerics',
  feature: 'Feature too small for Champions (400 lines across 5 files)',
  refactor: 'Refactor too small for Outriders',
  perf: 'Performance work too small for Wizards',
  revert: 'Revert too small to raise the dead',
  chore: 'Chore too small for Mercenaries',
};

/** Kinds of soldier that are support: they come on top of the army size. */
const SUPPORT: readonly Kind[] = [Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper];

/** Room in the army the support takes, on top of what the code raised. */
export function supportOf(counts: readonly number[]): number {
  return SUPPORT.reduce<number>((n, k) => n + counts[k]! * STATS[k]!.slots, 0);
}

/** Whole numbers that add up to `total`, as near to `parts` as can be (largest remainders). */
export function apportion(parts: readonly number[], total: number): number[] {
  const out = parts.map((v) => Math.floor(Math.max(0, v)));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = parts.map((v, i) => [Math.max(0, v) - out[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; left > 0 && order.length > 0; j = (j + 1) % order.length, left--) out[order[j]![1]]!++;
  return out;
}

/** What each kind of uncounted line is called in the reasons. */
const UNCOUNTED_LABEL: Record<UncountedKind, (n: number) => string> = {
  structure: (n) => `${plural(n, 'line')} of brackets, closing tags and bare keywords`,
  fragment: (n) => plural(n, 'one-word fragment'),
  data: (n) => `${plural(n, 'line')} of literal data (tables, strings, numbers)`,
  prose: (n) => `${plural(n, 'line')} of prose`,
  repeat: (n) => `${plural(n, 'repeated line')} (each counts once)`,
  shape: (n) => `${plural(n, 'near-duplicate line')} (the same line with other names or numbers, counted ${SHAPE_CAP} times a day)`,
  cap: (n) => `${plural(n, 'line')} past the daily cap of ${fmt(DAILY_CODE_CAP)}`,
};

/** A path as the reasons show it: its last two parts. */
const shortPath = (path: string) => path.split('/').slice(-2).join('/');

/** "312 near-duplicate lines (…) in styles/hud.css", "401 lines of … , most in render/sites.ts and ui/RingFigure.tsx". */
function uncountedText(u: Uncounted): string {
  const where = u.files.length === 0 ? '' : u.files.length === 1 || u.files[0]!.lines * 2 >= u.lines ? ` in ${shortPath(u.files[0]!.path)}` : `, most in ${shortPath(u.files[0]!.path)} and ${shortPath(u.files[1]!.path)}`;
  return `${UNCOUNTED_LABEL[u.kind](u.lines)}${where}`;
}

/** Uncounted tallies of several pushes, merged by kind and file. */
export function mergeUncounted(all: readonly (readonly Uncounted[] | undefined)[]): Uncounted[] {
  const by = new Map<UncountedKind, { lines: number; files: Map<string, number> }>();
  for (const list of all) {
    for (const u of list ?? []) {
      let e = by.get(u.kind);
      if (!e) by.set(u.kind, (e = { lines: 0, files: new Map() }));
      e.lines += u.lines;
      for (const f of u.files) e.files.set(f.path, (e.files.get(f.path) ?? 0) + f.lines);
    }
  }
  return [...by]
    .map(([kind, e]) => ({ kind, lines: e.lines, files: [...e.files].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([path, lines]) => ({ path, lines })) }))
    .sort((a, b) => b.lines - a.lines || (a.kind < b.kind ? -1 : 1));
}

/** Short lines saying why a ledger raised the army it did. */
/**
 * "Complexity 182: 120 branch points, 14 new functions (+42), 9 imported names used from 4 local
 * modules (+4.5)", and what held it back, or null when there is none.
 */
export function complexityText(ledger: Ledger, modules?: number): string | null {
  const code = credited(ledger.lines[Cat.Code]!);
  const cx = complexityOf(ledger, code);
  const raw = ledger.branches + ledger.functions + ledger.links / 2;
  if (raw <= 0) return null;
  const parts = [plural(ledger.branches, 'branch point')];
  if (ledger.functions > 0) parts.push(`${plural(Math.max(1, Math.round(ledger.functions / 3)), 'new function')} (+${fmt(ledger.functions)})`);
  if (ledger.links > 0) {
    const from = modules && modules > 0 ? ` from ${plural(modules, 'local module')}` : ' from local modules';
    parts.push(`${plural(ledger.links, 'imported name')} used${from} (+${pts(ledger.links / 2)})`);
  }
  const held: string[] = [];
  if (cx.links < ledger.links) held.push(`imported names count for at most ${Math.round(LINK_SHARE * 100)}% of it`);
  if (cx.half < 2 * cx.branches + 2 * cx.functions + cx.links) held.push(`held to ${pts(cx.half / 2)}, one point per 2 lines of code`);
  return `Complexity ${pts(raw)}: ${parts.join(', ')}${held.length ? `; ${held.join(', and ')}` : ''}`;
}

/** A file's name as the difficulty lines show it. */
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** The context of one file's bonus, for the page. */
export function difficultyOf(n: DifficultyNote): PreviewDifficulty {
  const c = n.context;
  return {
    path: n.path,
    modified: n.modified,
    multiplier: n.mMilli / 1000,
    extra: Math.round(n.extraMilli / 100) / 10,
    ...(n.creditMilli ? { credit: Math.round(n.creditMilli / 100) / 10 } : {}),
    lines: c?.lines ?? 0,
    authors: c?.authorsOthers ?? 0,
    commits: c?.fileCommits ?? 0,
    fromYear: c?.fromYear ?? null,
    gate: c && !c.gate.passed && c.rawMilli > c.mMilli ? c.gate.reason : null,
    source: c?.source ?? 'graphql',
    ...(n.pending ? { pending: true } : {}),
    ...(n.repeat ? { repeat: true } : {}),
  };
}

/** "Edited 5 lines of others' code in css.ts (3,688 lines, 127 authors, lines from 2021) ×3.2 → +11 lines of credit". */
export function difficultyText(d: PreviewDifficulty): string {
  const facts = [d.lines > 0 ? plural(d.lines, 'line') : '', d.authors > 0 ? plural(d.authors, 'author') : '', d.fromYear ? `lines from ${d.fromYear}` : ''].filter(Boolean).join(', ');
  const held = d.gate ? ` (held to ×${GATE_CAP}: ${d.gate})` : '';
  const extra = d.extra >= 10 || Number.isInteger(d.extra) ? fmt(d.extra) : d.extra.toFixed(1);
  const pending = d.pending ? ' pending upstream merge' : '';
  return `Edited ${plural(d.modified, 'line')} of others’ code in ${fileName(d.path)}${facts ? ` (${facts})` : ''} ×${d.multiplier.toFixed(1)}${pending}${held} → +${extra} ${d.extra === 1 ? 'line' : 'lines'} of credit${d.pending ? ' once merged' : ''}`;
}

/** "Fixed 3 hard files in vite (css.ts ×3.2, build.ts ×3.2, asset.ts ×2.9) → +172 lines of effort credit", or null. */
export function effortText(files: readonly PreviewDifficulty[], repo?: string): string | null {
  const hard = files.filter((d) => (d.credit ?? 0) > 0).sort((a, b) => b.multiplier - a.multiplier || (a.path < b.path ? -1 : 1));
  if (hard.length === 0) return null;
  const total = Math.floor(hard.reduce((n, d) => n + (d.credit ?? 0), 0));
  const named = hard.slice(0, 3).map((d) => `${fileName(d.path)} ×${d.multiplier.toFixed(1)}`).join(', ');
  const where = repo ? ` in ${repo.slice(repo.indexOf('/') + 1)}` : '';
  const pending = hard.every((d) => d.pending);
  return `Fixed ${plural(hard.length, 'hard file')}${where} (${named}${hard.length > 3 ? ', …' : ''})${pending ? ' pending upstream merge' : ''} → +${plural(total, 'line')} of effort credit${pending ? ' once merged' : ''}`;
}

export function explain(ledger: Ledger, army: PreviewArmy, purpose: Purpose | null, extra: { filesChanged: number; estimated: number; truncated: boolean; unread?: boolean; uncounted?: readonly Uncounted[]; modules?: number; difficulty?: readonly PreviewDifficulty[]; repo?: string }): string[] {
  const out: string[] = [];
  const L = ledger.lines;
  const c = army.counts;
  const eff = effectiveLedger(ledger);
  if (extra.unread) return ['GitHub would not give this commit’s diff, so nothing was measured'];
  // How big the army is, and what each part of the work added to it.
  if (army.budget > 0) {
    const w = BUDGET_PER_10K;
    const raw = [(w.code * eff.code) / 10_000, (w.code * eff.bonus) / 10_000, (w.files * eff.files) / 10_000, (w.complexity * eff.complexity) / 10_000, (w.removed * eff.removed) / 10_000];
    const [code, bonus, files, complexity, removed] = apportion(raw, army.budget) as [number, number, number, number, number];
    const knee = L[Cat.Code]! + eff.bonus > CODE_KNEE ? `; past ${fmt(CODE_KNEE)} a line counts half` : '';
    const rest = [
      eff.bonus > 0 ? `a difficulty bonus of ${plural(eff.bonus, 'line')} for editing established code (+${bonus})` : '',
      files > 0 ? `${plural(eff.files, 'file')} (+${files})` : '',
      complexity > 0 ? `complexity ${pts(eff.complexity)} (+${complexity})` : '',
      removed > 0 ? `${plural(eff.removed, 'removed line')} of cleanup (+${removed})` : '',
    ].filter(Boolean);
    const lead = `${plural(L[Cat.Code]!, 'line')} of code (+${code}${knee})`;
    const tail = rest.length === 0 ? '' : `, plus ${rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest.at(-1)}`}`;
    out.push(`Army size: ${fmt(army.budget)} — ${code * 2 > army.budget ? 'mostly ' : ''}from ${lead}${tail}`);
  } else if (L[Cat.Code]! > 0) {
    out.push(`${plural(L[Cat.Code]!, 'line')} of code: too few for a soldier (about ${Math.ceil(10_000 / BUDGET_PER_10K.code)} lines each)`);
  }
  const cxText = complexityText(ledger, extra.modules);
  if (cxText && L[Cat.Code]! > 0) out.push(cxText);
  // The difficulty bonus, file by file, most first.
  const hard = (extra.difficulty ?? []).filter((d) => d.modified > 0).sort((a, b) => b.extra - a.extra || (a.path < b.path ? -1 : 1));
  for (const d of hard.slice(0, 3)) out.push(difficultyText(d));
  if (hard.length > 3) out.push(`…and ${plural(hard.length - 3, 'more file')} of others’ code`);
  const effort = effortText(extra.difficulty ?? [], extra.repo);
  if (effort) out.push(effort);
  if ((ledger.bonus ?? 0) > eff.bonus) out.push(`The difficulty bonus counts at most ${BONUS_PER_CODE}× the code (and ${fmt(DAILY_BONUS_CAP)} lines a day)`);
  // How the army size was spent: specialists by what raised them, Footmen for the rest.
  const specialists: string[] = [];
  const fixers = units(c, [Kind.Ballista, Kind.Cleric, Kind.Paladin, Kind.Ranger]);
  if (fixers) {
    // A hard fix's difficulty bonus is fix work too: say how much of it raised the fixers.
    const work = fixWork(ledger);
    const code = ledger.purposeCode[PURPOSES.indexOf('fix')]!;
    const from = work > code ? ` (${plural(code, 'line')} of fix code and ${plural(work - code, 'line')} of its difficulty bonus)` : '';
    specialists.push(`${purpose ? 'bug fix' : 'bug fixes'}${from} → ${fixers}`);
  }
  if (c[Kind.Dragon]! > 0) specialists.push(`legendary ${purpose === 'work' ? 'work' : 'feature'} (900+ lines, 10+ files, complexity ${DRAGON_COMPLEXITY[0]}+) → ${unit(Kind.Dragon, c[Kind.Dragon]!)}`);
  if (c[Kind.Champion]! > 0) specialists.push(`big feature (two per 400 feature lines and 5 files) → ${unit(Kind.Champion, c[Kind.Champion]!)}`);
  const refactor = units(c, [Kind.Outrider, Kind.GriffinRider]);
  if (refactor) specialists.push(`refactor → ${refactor}`);
  if (c[Kind.Wizard]! > 0) specialists.push(`performance work → ${unit(Kind.Wizard, c[Kind.Wizard]!)}`);
  const undead = units(c, [Kind.Skeleton, Kind.BoneGolem]);
  if (undead) specialists.push(`revert → ${undead}`);
  if (c[Kind.Mercenary]! > 0) specialists.push(`chore → ${unit(Kind.Mercenary, c[Kind.Mercenary]!)}`);
  if (c[Kind.Knight]! > 0) specialists.push(`complexity ${pts(eff.complexity)} → ${unit(Kind.Knight, c[Kind.Knight]!)}`);
  if (c[Kind.Troll]! > 0) specialists.push(`very complex code → ${unit(Kind.Troll, c[Kind.Troll]!)}`);
  if (c[Kind.Trebuchet]! > 0) specialists.push(`sweeping change (two per 15 files) → ${unit(Kind.Trebuchet, c[Kind.Trebuchet]!)}`);
  if (army.budget > 0) {
    // Each Berserker took the place of two Footmen, so the specialists spent the rest.
    const spent = army.budget - c[Kind.Footman]! - 2 * c[Kind.Berserker]!;
    const footmen = c[Kind.Berserker]! > 0 ? `${unit(Kind.Footman, c[Kind.Footman]!)} and ${unit(Kind.Berserker, c[Kind.Berserker]!)} (no tests or comments: each Berserker fights in place of two Footmen)` : unit(Kind.Footman, c[Kind.Footman]!);
    if (specialists.length > 0) out.push(`Specialists: ${fmt(spent)} of ${fmt(army.budget)} (${specialists.join('; ')}); the rest are ${footmen}`);
    else if (c[Kind.Berserker]! > 0) out.push(`No specialists: the army is ${footmen}`);
    else out.push(`No specialists: ${army.budget === 1 ? 'the one soldier is a Footman' : army.budget === 2 ? 'both are Footmen' : `all ${fmt(army.budget)} are Footmen`}`);
  }
  if (purpose && purpose !== 'work' && army.budget > 0 && !fixers && !refactor && !undead && c[Kind.Wizard] === 0 && c[Kind.Mercenary] === 0 && c[Kind.Champion] === 0 && c[Kind.Dragon] === 0) {
    out.push(`${PURPOSE_SPECIALISTS[purpose]}, or the specialists’ share (65% of the army size) went to others`);
  }
  // Support, on top of the army size.
  const support: [number, Cat, string, string][] = [
    [Kind.Warden, Cat.Test, 'test line', 'tests'],
    [Kind.Archer, Cat.Comment, 'comment line', 'comments'],
    [Kind.Herald, Cat.Docs, 'line of docs', 'docs'],
    [Kind.Sapper, Cat.Config, 'line of config', 'config'],
  ];
  for (const [kind, cat, noun] of support) {
    if (L[cat]! <= 0) continue;
    const many = noun.startsWith('line') ? noun.replace('line', 'lines') : `${noun}s`;
    out.push(c[kind]! > 0 ? `${plural(L[cat]!, noun, many)} → ${unit(kind, c[kind]!)} (support, on top of the army size)` : `${plural(L[cat]!, noun, many)}: too few for a ${STATS[kind]!.name}`);
  }
  if (L[Cat.Generated]! > 0) out.push(`${plural(L[Cat.Generated]!, 'generated line')} raise nothing`);
  if (L[Cat.Vendor]! > 0) out.push(`${plural(L[Cat.Vendor]!, 'vendored line')} raise nothing`);
  // What was not counted, and whether any of it was filler.
  const uncounted = extra.uncounted ?? [];
  if (ledger.filler > 0) {
    const shown = uncounted.filter((u) => u.kind !== 'structure' || uncounted.length === 1).slice(0, 3);
    out.push(`${plural(ledger.filler, 'line')} of filler, more than the code carries${shown.length ? `: ${shown.map(uncountedText).join('; ')}` : ''}`);
  } else if (uncounted.length > 0) {
    out.push(`Not counted, as in any code (no penalty): ${uncounted.slice(0, 3).map(uncountedText).join('; ')}${uncounted.length > 3 ? '; and a few more' : ''}`);
  }
  for (const n of army.notes) {
    if (n.kind === 'veteran') out.push(`${n.text}: soldiers fight ${Math.round(n.effect * 100)}% harder`);
    else out.push(`${n.text}: quality ${n.effect > 0 ? '+' : '−'}${Math.round(Math.abs(n.effect) * 100)}%`);
  }
  if (army.budget === 0) {
    const messenger = army.slots === 1 && c[Kind.Footman] === 1;
    const unreadOnly = extra.filesChanged === 0 || (L.every((n, i) => i === Cat.Blank || n === 0) && ledger.filler === 0 && uncounted.length === 0);
    if (messenger) out.push(unreadOnly ? 'Nothing to count (binary, data or other unread files): a lone messenger marches' : L[Cat.Code]! > 0 ? 'Too little code for a soldier: a lone messenger marches, as every first push sends one' : 'No code: a lone messenger marches, as every first push sends one');
    else out.push('No code: only support marches');
  }
  if (extra.estimated > 0) out.push(`GitHub omitted the diff of ${plural(extra.estimated, 'file')}; their additions count as code, estimated`);
  if (extra.truncated) out.push(`Only the first ${MAX_FILES} files are read, as ingestion reads them`);
  return out;
}

// ------------------------------------------------------------------ the figures

/** What `whyOf` needs beside the ledger and the army. */
export interface WhyExtra {
  /** The difficulty notes behind the bonus (a fork's pending ones included). */
  notes?: readonly DifficultyNote[];
  /** The contexts read for the work: none of their files' removed lines were someone else's. */
  ownOnly?: boolean;
  uncounted?: readonly Uncounted[];
  modules?: number;
  filesChanged: number;
  estimated: number;
  truncated: boolean;
  unread?: boolean;
}

/** Whether contexts were read for some file and none of the removed lines they saw were someone else's. */
export function ownOnly(contexts: readonly (PushContext | null | undefined)[]): boolean {
  const files = contexts.flatMap((c) => Object.values(c?.files ?? {}));
  return files.length > 0 && files.every((f) => f.others.length === 0);
}

/** Lines of credit from a sum in thousandths, after a day's cap of `cap` lines. */
const capLines = (milli: number, cap: number) => Math.floor(Math.max(0, Math.min(milli, cap * 1000)) / 1000);
const sumOf = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const tenths = (milli: number) => Math.round(milli / 100) / 10;

/** The few words a kind of soldier is raised for, on the page. */
const UNIT_REASON: Partial<Record<number, string>> = {
  [Kind.Champion]: 'big feature',
  [Kind.Troll]: 'very complex code',
  [Kind.Knight]: 'complex logic',
  [Kind.Ballista]: 'bug fixes',
  [Kind.Paladin]: 'bug fixes',
  [Kind.Ranger]: 'bug fixes',
  [Kind.Cleric]: 'bug fixes',
  [Kind.Wizard]: 'performance work',
  [Kind.GriffinRider]: 'big refactor',
  [Kind.Outrider]: 'refactoring',
  [Kind.Skeleton]: 'reverts',
  [Kind.BoneGolem]: 'big revert',
  [Kind.Mercenary]: 'chores',
  [Kind.Trebuchet]: 'sweeping change',
  [Kind.Footman]: 'the rest',
  [Kind.Berserker]: 'untested code',
};

/** Specialists in the order they are paid, then the line. */
const SPEND_ORDER: readonly number[] = [...PAY_ORDER, Kind.Footman, Kind.Berserker];

/** The least work each support kind needs for its first pair: Wardens and Archers √n ÷ 5 ≥ 1, Heralds 120 lines, Sappers 80. */
const SUPPORT_NEED: readonly [Kind, Cat, number, string, string][] = [
  [Kind.Warden, Cat.Test, 25, 'test lines', 'test line'],
  [Kind.Archer, Cat.Comment, 25, 'comments', 'comment'],
  [Kind.Herald, Cat.Docs, 120, 'docs lines', 'docs line'],
  [Kind.Sapper, Cat.Config, 80, 'config lines', 'config line'],
];

/**
 * Why a ledger raised the army it did, as figures: the size and where it came from (each source's
 * share, whole numbers that add up to the size), what it was spent on, the power and the rank,
 * and what did not count. The page draws these; `explain` tells the same in sentences.
 */
export function whyOf(ledger: Ledger, army: PreviewArmy, purpose: Purpose | null, extra: WhyExtra): PreviewWhy {
  const L = ledger.lines;
  const c = army.counts;
  const eff = effectiveLedger(ledger);
  const cx = complexityOf(ledger, eff.code);
  const support = supportOf(c);
  const notes = extra.notes ?? [];
  const live = notes.filter((n) => !n.pending);
  const waiting = notes.filter((n) => n.pending);
  const w = BUDGET_PER_10K;

  // The bonus in its two parts, as the ledger credited them (each held to its day's cap).
  const bonus = Math.max(0, ledger.bonus || 0);
  const lineMilli = sumOf(live, (n) => n.extraMilli);
  const effortMilli = sumOf(live, (n) => n.creditMilli ?? 0);
  let lineCredit = capLines(lineMilli, DAILY_BONUS_CAP);
  let effortCredit = capLines(effortMilli, FILE_CAP * FILE_CREDIT);
  if (live.length === 0) [lineCredit, effortCredit] = [bonus, 0];
  else if (lineCredit + effortCredit !== bonus) [lineCredit, effortCredit] = [Math.min(lineCredit, bonus), Math.max(0, bonus - Math.min(lineCredit, bonus))];
  // What counts of it (the knee, the cap and BONUS_PER_CODE), shared between the parts.
  const lineEff = bonus > 0 ? (eff.bonus * lineCredit) / bonus : 0;
  const effortEff = eff.bonus - lineEff;
  const raw = [w.code * eff.code, w.files * eff.files, w.complexity * eff.complexity, w.removed * eff.removed, w.code * lineEff, w.code * effortEff].map((v) => v / 10_000);
  const [sCode, sFiles, sCx, sRemoved, sOthers, sEffort] = (army.budget > 0 ? apportion(raw, army.budget) : raw.map(() => 0)) as [number, number, number, number, number, number];

  const sources: PreviewSource[] = [];
  const capped = (extra.uncounted ?? []).find((u) => u.kind === 'cap')?.lines ?? 0;
  if (L[Cat.Code]! > 0 || army.budget > 0) {
    const chips: string[] = [];
    if (army.budget === 0 && L[Cat.Code]! > 0) chips.push(`too few: about ${Math.ceil(10_000 / w.code)} lines a soldier`);
    if (L[Cat.Code]! > CODE_KNEE) chips.push(`past the ${fmt(CODE_KNEE)}-line knee: half value`);
    if (capped > 0) chips.push('daily cap reached');
    sources.push({
      key: 'code',
      amount: L[Cat.Code]!,
      size: sCode,
      chips,
      detail: [
        `${plural(L[Cat.Code]!, 'line')} of code${eff.code !== L[Cat.Code] ? `, counted as ${fmt(eff.code)}` : ''}${capped > 0 ? `; ${plural(capped, 'more line')} past the daily cap of ${fmt(CODE_CAP)}` : ''}`,
        `Code counts in full up to ${fmt(CODE_KNEE)} lines a day and at half value beyond; about ${Math.ceil(10_000 / w.code)} lines raise one place in the ranks`,
      ],
    });
  }
  if (ledger.files > 0) {
    const held = eff.files < ledger.files;
    sources.push({
      key: 'files',
      amount: ledger.files,
      size: sFiles,
      chips: held ? [`held to ${fmt(eff.files)}: one per 20 code lines`] : [],
      detail: [`${plural(ledger.files, 'source file')} carrying counted code${held ? `, held to ${fmt(eff.files)}: one file per 20 lines of code (and per 100 removed), so a line in each of many files is not a sweeping change` : ''}`],
    });
  }
  const rawCx = ledger.branches + ledger.functions + ledger.links / 2;
  if (rawCx > 0) {
    const chips: string[] = [];
    if (cx.links < ledger.links) chips.push(`imported names: at most ${Math.round(LINK_SHARE * 100)}%`);
    if (cx.half < 2 * cx.branches + 2 * cx.functions + cx.links) chips.push('held to 1 point per 2 code lines');
    sources.push({
      key: 'complexity',
      amount: eff.complexity,
      size: sCx,
      parts: { branches: ledger.branches, functions: ledger.functions, links: ledger.links, modules: extra.modules ?? 0 },
      chips,
      detail: [complexityText(ledger, extra.modules) ?? `Complexity ${pts(eff.complexity)}`],
    });
  }
  if (L[Cat.Removed]! > 0) {
    sources.push({
      key: 'removed',
      amount: L[Cat.Removed]!,
      size: sRemoved,
      chips: L[Cat.Removed]! > CODE_KNEE ? [`counts up to ${fmt(CODE_KNEE)}`] : [],
      detail: [`${plural(L[Cat.Removed]!, 'removed line')} of cleanup: deleting counts a little, up to ${fmt(CODE_KNEE)} lines a day`],
    });
  }

  // The bonus's own holds: the knee it shares with the code, and BONUS_PER_CODE.
  const bonusHeld: string[] = [];
  if (bonus > 0 && eff.bonus < bonus) bonusHeld.push(bonus > BONUS_PER_CODE * L[Cat.Code]! ? `held to ${BONUS_PER_CODE}× the code` : `past the ${fmt(CODE_KNEE)}-line knee: half value`);
  const fileRow = (n: DifficultyNote, milli: number) => ({ path: n.path, modified: n.modified, multiplier: n.mMilli / 1000, credit: tenths(milli) });

  // Others' code: the line bonus for modifying others' established code.
  {
    const modified = sumOf(live, (n) => n.modified);
    const chips: string[] = [];
    // A fork's whole bonus is in the pending row.
    if (notes.length === 0) {
      if (extra.ownOnly) chips.push('your own code');
      else if (L[Cat.Code]! > 0 && L[Cat.Removed]! === 0) chips.push('only new lines: never multiplied');
    } else if (live.length > 0 && modified === 0) chips.push('removed, not rewritten');
    const gated = notes.find((n) => n.context && !n.context.gate.passed && n.context.rawMilli > n.mMilli);
    if (gated) chips.push(`repo gate ×${GATE_CAP}: ${gated.context!.gate.reason}`);
    if (lineMilli > DAILY_BONUS_CAP * 1000) chips.push('daily cap reached');
    if (lineCredit > 0) chips.push(...bonusHeld);
    const files = live.filter((n) => n.modified > 0).sort((a, b) => b.extraMilli - a.extraMilli || (a.path < b.path ? -1 : 1));
    if (modified > 0 || chips.length > 0) {
      sources.push({
        key: 'others',
        amount: modified,
        credit: lineCredit,
        size: sOthers,
        files: files.map((n) => fileRow(n, n.extraMilli)),
        chips,
        detail: files.length > 0 ? files.map((n) => difficultyText(difficultyOf(n))) : ['Lines of other people’s established code that a commit replaces earn extra credit, up to ×3.2 in a big, old, much-worked file; new lines and your own never do'],
      });
    }
  }

  // The effort credit: a fixed credit for each hard file meaningfully modified.
  {
    const hard = live.filter((n) => (n.creditMilli ?? 0) > 0).sort((a, b) => (b.creditMilli ?? 0) - (a.creditMilli ?? 0) || (a.path < b.path ? -1 : 1));
    const chips: string[] = [];
    const few = live.filter((n) => n.modified > 0 && n.modified < MEANINGFUL_LINES && !n.repeat && !((n.creditMilli ?? 0) > 0) && n.mMilli > 1000).sort((a, b) => b.modified - a.modified);
    if (few.length > 0) chips.push(hard.length === 0 ? `only ${plural(few[0]!.modified, 'line')} changed (needs ${MEANINGFUL_LINES})` : `${plural(few.length, 'more file')} under ${MEANINGFUL_LINES} lines`);
    if (live.some((n) => n.repeat)) chips.push(`credited recently — needs ${EFFORT_REPEAT_LINES}+ lines`);
    if (effortMilli > FILE_CAP * FILE_CREDIT * 1000) chips.push('daily cap reached');
    if (effortCredit > 0) chips.push(...bonusHeld);
    if (hard.length > 0 || chips.length > 0) {
      const text = effortText(hard.map(difficultyOf));
      sources.push({
        key: 'effort',
        amount: hard.length,
        credit: effortCredit,
        size: sEffort,
        files: hard.map((n) => fileRow(n, n.creditMilli ?? 0)),
        chips,
        detail: [
          ...(text ? [text] : []),
          `Each established file of others’ code modified by ${MEANINGFUL_LINES}+ lines earns up to ${FILE_CREDIT} lines of credit, by how hard it is; a file credited in the last 3 days needs ${EFFORT_REPEAT_LINES}+ lines`,
        ],
      });
    }
  }

  // A fork's credit, waiting for the upstream: what it would add once merged, outside the total.
  {
    const pLine = capLines(lineMilli + sumOf(waiting, (n) => n.extraMilli), DAILY_BONUS_CAP) - capLines(lineMilli, DAILY_BONUS_CAP);
    const pEffort = capLines(effortMilli + sumOf(waiting, (n) => n.creditMilli ?? 0), FILE_CAP * FILE_CREDIT) - capLines(effortMilli, FILE_CAP * FILE_CREDIT);
    const pend = pLine + pEffort;
    if (pend > 0) {
      const files = waiting.filter((n) => n.extraMilli + (n.creditMilli ?? 0) > 0).sort((a, b) => b.extraMilli + (b.creditMilli ?? 0) - a.extraMilli - (a.creditMilli ?? 0) || (a.path < b.path ? -1 : 1));
      const text = effortText(waiting.map(difficultyOf));
      sources.push({
        key: 'pending',
        amount: pend,
        credit: pend,
        size: Math.max(0, budgetOf({ ...ledger, bonus: bonus + pend }) - army.budget),
        files: files.map((n) => fileRow(n, n.extraMilli + (n.creditMilli ?? 0))),
        chips: [],
        detail: [...files.map((n) => difficultyText(difficultyOf(n))), ...(text ? [text] : []), 'A fork’s credit for others’ code pays once the commit reaches the upstream’s default branch (within 14 days)'],
        pending: true,
      });
    }
  }

  // How the size was spent.
  const fix = fixWork(ledger);
  const pc = (p: Purpose) => ledger.purposeCode[PURPOSES.indexOf(p)]!;
  const pr = (p: Purpose) => ledger.purposeRemoved[PURPOSES.indexOf(p)]!;
  const feature = pc('feature') + pc('work');
  const messengerOnly = army.budget === 0 && c[Kind.Footman] === 1;
  const unitDetail = (k: number): string => {
    const why = STATS[k]!.source;
    if (k === Kind.Ballista || k === Kind.Paladin || k === Kind.Ranger || k === Kind.Cleric) {
      const code = pc('fix');
      return `${fmt(fix)} lines of fix work${fix > code ? ` (${fmt(code)} of fix code, ${fmt(fix - code)} of its difficulty bonus)` : ''}. ${why}`;
    }
    if (k === Kind.Knight || k === Kind.Troll) return `Complexity ${pts(eff.complexity)}. ${why}`;
    if (k === Kind.Dragon || k === Kind.Champion) return `${plural(feature, 'line')} of feature work, ${plural(eff.files, 'file')}, complexity ${pts(eff.complexity)}. ${why}`;
    if (k === Kind.Trebuchet) return `${plural(eff.files, 'file')}. ${why}`;
    if (k === Kind.Footman) return messengerOnly ? 'Every first push of the day sends at least a messenger' : `What the specialists left of the size: they take at most 65% of it. ${why}`;
    return why;
  };
  const units: PreviewUnit[] = SPEND_ORDER.filter((k) => c[k]! > 0).map((k) => ({
    kind: k,
    count: c[k]!,
    reason: k === Kind.Dragon ? (purpose === 'work' ? 'legendary work' : 'legendary feature') : k === Kind.Footman && messengerOnly ? 'lone messenger' : UNIT_REASON[k]!,
    detail: unitDetail(k),
  }));
  const supportUnits: PreviewUnit[] = SUPPORT_NEED.filter(([k]) => c[k]! > 0).map(([k, cat, , many, one]) => ({ kind: k, count: c[k]!, reason: `${fmt(L[cat]!)} ${L[cat] === 1 ? one : many}`, detail: STATS[k]!.source }));

  // What the work came close to.
  const nearMisses: PreviewNearMiss[] = [];
  for (const [k, cat, need, unit] of SUPPORT_NEED) if (L[cat]! > 0 && c[k] === 0) nearMisses.push({ kind: k, have: L[cat]!, need, unit });
  if (army.budget > 0) {
    const none = (...ks: number[]) => ks.every((k) => c[k] === 0);
    const miss = (kind: number, have: number, need: number, unit: string) => nearMisses.push({ kind, have: Math.floor(have), need, unit, ...(have >= need ? { crowded: true } : {}) });
    if (fix > 0 && none(Kind.Cleric, Kind.Ballista, Kind.Paladin, Kind.Ranger)) miss(Kind.Cleric, fix, 21, 'fix lines');
    else if (fix >= 125 && c[Kind.Ballista] === 0) miss(Kind.Ballista, fix, 250, 'fix lines');
    if (pc('feature') > 0 && none(Kind.Champion, Kind.Dragon)) {
      if (pc('feature') < 400) miss(Kind.Champion, pc('feature'), 400, 'feature lines');
      else miss(Kind.Champion, eff.files, 5, 'files');
    }
    if (feature >= 450 && c[Kind.Dragon] === 0) {
      const gaps: [number, number, string][] = [[feature, 900, 'feature lines'], [eff.files, 10, 'files'], [eff.complexity, DRAGON_COMPLEXITY[0], 'complexity']];
      const gap = gaps.find(([have, need]) => have < need) ?? gaps[0]!;
      miss(Kind.Dragon, gap[0], gap[1], gap[2]);
    }
    const refactor = pr('refactor') + pc('refactor') / 2;
    if (refactor > 0 && none(Kind.Outrider, Kind.GriffinRider)) miss(Kind.Outrider, refactor, 3, 'refactor lines');
    if (pc('perf') > 0 && c[Kind.Wizard] === 0) miss(Kind.Wizard, pc('perf'), 9, 'perf lines');
    if (pc('revert') + pr('revert') > 0 && none(Kind.Skeleton, Kind.BoneGolem)) miss(Kind.Skeleton, pc('revert') + pr('revert'), 1, 'reverted lines');
    if (pc('chore') > 0 && c[Kind.Mercenary] === 0) miss(Kind.Mercenary, pc('chore'), 4, 'chore lines');
  }

  // Rank: code counted with the bonus, and real files.
  const max = VETERAN_CODE.length;
  const rank = army.veterancy;
  const t = Math.min(rank, max - 1);

  // What did not count.
  const kinds: PreviewUncounted[] = (extra.uncounted ?? []).map((u) => ({ kind: u.kind, lines: u.lines, text: uncountedText(u) }));
  if (L[Cat.Generated]! > 0) kinds.push({ kind: 'generated', lines: L[Cat.Generated]!, text: `${plural(L[Cat.Generated]!, 'generated line')} (lockfiles, builds, snapshots)` });
  if (L[Cat.Vendor]! > 0) kinds.push({ kind: 'vendor', lines: L[Cat.Vendor]!, text: `${plural(L[Cat.Vendor]!, 'vendored line')} (other people’s code copied in)` });
  kinds.sort((a, b) => b.lines - a.lines || (a.kind < b.kind ? -1 : 1));
  const penalty = army.notes.find((n) => n.kind === 'filler')?.effect ?? 0;

  const unreadOnly = extra.filesChanged === 0 || (L.every((n, i) => i === Cat.Blank || n === 0) && ledger.filler === 0 && kinds.length === 0);
  const extras: string[] = [];
  if (extra.estimated > 0) extras.push(`GitHub omitted the diff of ${plural(extra.estimated, 'file')}; their additions count as code, estimated`);
  if (extra.truncated) extras.push(`Only the first ${MAX_FILES} files are read, as ingestion reads them`);
  return {
    size: army.budget > 0 ? army.budget : army.slots - support,
    support,
    power: army.power,
    parts: army.notes.map((n) => ({ kind: n.kind, effect: n.effect, detail: n.text })),
    sources,
    units,
    supportUnits,
    nearMisses,
    rank: { rank, max, code: eff.code + eff.bonus, files: eff.files, target: { rank: t + 1, code: VETERAN_CODE[t]!, files: VETERAN_FILES[t]! } },
    uncounted: { lines: sumOf(kinds, (k) => k.lines), kinds, filler: ledger.filler, penalty },
    ...(army.budget === 0 ? { messenger: extra.unread || unreadOnly ? ('nothing-read' as const) : L[Cat.Code]! > 0 ? ('too-few' as const) : ('no-code' as const) } : {}),
    notes: extras,
  };
}

// ------------------------------------------------------------------ the service

const limitedError = (err: unknown) => err instanceof GithubError && (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.message)));

function asFailure(err: unknown): PreviewFailure {
  if (err instanceof PreviewFailure) return err;
  if (limitedError(err)) return new PreviewFailure('github_limited', 'GitHub’s scouts are spent for the hour. Try again later.');
  return new PreviewFailure('github_error', 'GitHub did not answer the scouts. Try again in a moment.');
}

/** Patches GitHub omitted from a diff, and whether it held more files than are read. */
function shapeOf(files: readonly ChangedFile[]): { estimated: number; truncated: boolean } {
  return { estimated: files.filter((f) => f.patch === null && f.additions + f.deletions > 0).length, truncated: files.length >= MAX_FILES };
}

export class Preview {
  private heads = new WeightedLru<{ at: number; body: PreviewBody | PreviewFailure }>(HEAD_ENTRIES);
  private diffs = new WeightedLru<Diff>(SHA_BYTES, (d) => d.bytes);
  private inflight = new Map<string, Promise<PreviewBody>>();
  private contexts = new WeightedLru<{ context: PushContext | null }>(2_000);
  /** Diffs fetched from GitHub, and answered from the sha cache: for tests and logs. */
  readonly stats = { diffFetches: 0, diffHits: 0, headHits: 0 };

  constructor(private readonly deps: PreviewDeps) {}

  /** A repository's latest commits and the armies they raise, from cache when fresh. */
  async preview(owner: string, repo: string, ref: string | null): Promise<{ body: PreviewBody; cached: boolean }> {
    if (!validRepo(owner, repo)) throw new PreviewFailure('invalid', 'That is not an owner/repository name.');
    if (ref !== null && !validRef(ref)) throw new PreviewFailure('invalid', 'That is not a branch name.');
    const key = `${owner}/${repo}#${ref ?? ''}`.toLowerCase();
    const now = this.deps.clock();
    const hit = this.heads.get(key);
    if (hit && now - hit.at < HEAD_TTL_MS) {
      this.stats.headHits++;
      if (hit.body instanceof PreviewFailure) throw hit.body;
      return { body: hit.body, cached: true };
    }
    let run = this.inflight.get(key);
    if (!run) {
      run = this.read(`${owner}/${repo}`, ref).then(
        (body) => {
          this.heads.set(key, { at: this.deps.clock(), body });
          return body;
        },
        (err: unknown) => {
          const failure = asFailure(err);
          // A missing repository stays missing for a while; GitHub trouble is worth asking again.
          if (failure.code === 'not_found' || failure.code === 'no_branch') this.heads.set(key, { at: this.deps.clock(), body: failure });
          throw failure;
        },
      );
      run = run.finally(() => this.inflight.delete(key));
      this.inflight.set(key, run);
    }
    return { body: await run, cached: false };
  }

  private async read(full: string, ref: string | null): Promise<PreviewBody> {
    const { github } = this.deps;
    if (github.rateLimit().remaining < (this.deps.reserve ?? 0) + PREVIEW_COST) {
      throw new PreviewFailure('github_limited', 'GitHub’s scouts are spent for the hour. Try again later.');
    }
    const info = await github.repo(full);
    // A private repository answers exactly as a missing one: nothing about it is told.
    if (!info || info.private) throw new PreviewFailure('not_found', 'No public repository by that name. Only public repositories can be previewed.');
    const name = info.fullName;
    let branch = ref ?? info.defaultBranch;
    let history = await github.commits(name, branch, LIST_DEPTH);
    // `/tree/feature/x/src` names the branch `feature/x` or `feature/x/src`: try shorter prefixes.
    for (let cut = branch.lastIndexOf('/'); history === null && ref !== null && cut > 0; cut = branch.lastIndexOf('/')) {
      branch = branch.slice(0, cut);
      history = await github.commits(name, branch, LIST_DEPTH);
    }
    if (history === null) throw new PreviewFailure('no_branch', `No branch named “${ref ?? branch}” in ${name}.`);
    const listed = (await github.branches(name, BRANCH_LIMIT)) ?? [];
    const branches = [info.defaultBranch, ...listed.filter((b) => b !== info.defaultBranch)];

    const chosen: CommitMeta[] = [];
    let skippedMerges = 0;
    for (const c of history) {
      if (chosen.length >= PREVIEW_COMMITS) break;
      if (c.merge) skippedMerges++;
      else chosen.push(c);
    }
    const diffs = await this.fetchDiffs(name, chosen);
    await loadGrammars(diffs.flatMap((d) => d ?? []));
    const contexts = await this.fetchContexts(name, chosen, diffs);

    const commits: PreviewCommit[] = chosen.map((c, i) => {
      const files = diffs[i]!;
      const base = {
        sha: c.sha,
        shortSha: c.sha.slice(0, SHORT_SHA),
        message: (c.message.split('\n', 1)[0] ?? '').trim().slice(0, 200),
        author: { login: c.authorLogin, name: c.authorName, avatarUrl: c.avatarUrl },
        date: c.date,
        htmlUrl: `https://github.com/${name}/commit/${c.sha}`,
      };
      const { ledger, army, purpose, delta } = musterCommit(files ?? [], c.message, new MemoryLedger(), contexts[i] ?? null);
      const shape = shapeOf(files ?? []);
      const difficulty = (delta.difficulty ?? []).map(difficultyOf);
      return {
        ...base,
        purpose,
        lines: linesOf(ledger.lines),
        filesChanged: files?.length ?? 0,
        files: ledger.files,
        ...complexityFields(ledger),
        filler: ledger.filler,
        ...(ledger.bonus ? { bonus: ledger.bonus } : {}),
        ...(difficulty.length > 0 ? { difficulty } : {}),
        army,
        why: whyOf(ledger, army, purpose, { filesChanged: files?.length ?? 0, ...shape, unread: files === null, uncounted: delta.uncounted, modules: delta.modules, notes: delta.difficulty, ownOnly: ownOnly([contexts[i]]) }),
        reasons: explain(ledger, army, purpose, { filesChanged: files?.length ?? 0, ...shape, unread: files === null, uncounted: delta.uncounted, modules: delta.modules, difficulty, repo: name }),
        ...(files === null ? { unread: true } : {}),
        ...(shape.truncated ? { truncated: true } : {}),
        ...(shape.estimated > 0 ? { estimated: shape.estimated } : {}),
      };
    });

    return {
      repo: name,
      htmlUrl: `https://github.com/${name}`,
      branch,
      defaultBranch: info.defaultBranch,
      branches,
      commits,
      skippedMerges,
      combined: combine(chosen, diffs, commits, contexts),
      fetchedAt: this.deps.clock(),
    };
  }

  /**
   * Each commit's difficulty context, read against its parent and for its author exactly as ingestion
   * reads a push's, kept by sha for the day (a commit's history does not change; its age does).
   */
  private async fetchContexts(repo: string, commits: readonly CommitMeta[], diffs: readonly (ChangedFile[] | null)[]): Promise<(PushContext | null)[]> {
    const out: (PushContext | null)[] = new Array(commits.length).fill(null);
    const context = this.deps.context;
    if (!context) return out;
    const day = Math.floor(this.deps.clock() / 86_400_000);
    let next = 0;
    const worker = async () => {
      while (next < commits.length) {
        const i = next++;
        const c = commits[i]!;
        const files = diffs[i];
        if (!files || !c.parent) continue;
        const key = `${repo.toLowerCase()}@${c.sha}#${day}`;
        const known = this.contexts.get(key);
        if (known) {
          out[i] = known.context;
          continue;
        }
        const pusher = pusherOf(c.authorId ?? -1, c.authorLogin ?? '', []);
        const ctx = await context.forDiff(repo, { base: c.parent, files }, pusher);
        this.contexts.set(key, { context: ctx });
        out[i] = ctx;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, commits.length) }, worker));
    return out;
  }

  /** Each commit's files, from the sha cache or GitHub, a few at a time. Null for a commit GitHub would not give. */
  private async fetchDiffs(repo: string, commits: readonly CommitMeta[]): Promise<(ChangedFile[] | null)[]> {
    const out: (ChangedFile[] | null)[] = new Array(commits.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < commits.length) {
        const i = next++;
        const sha = commits[i]!.sha;
        const key = `${repo.toLowerCase()}@${sha}`;
        const known = this.diffs.get(key);
        if (known) {
          this.stats.diffHits++;
          out[i] = known.files;
          continue;
        }
        this.stats.diffFetches++;
        const result = await this.deps.github.commit(repo, sha);
        const files = result ? result.files : null;
        const bytes = 256 + (files ?? []).reduce((n, f) => n + f.filename.length + (f.patch?.length ?? 0) + 64, 0);
        if (files) this.diffs.set(key, { files, bytes });
        out[i] = files;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, commits.length) }, worker));
    return out;
  }
}

/**
 * All the commits pushed today, oldest first, on one ledger: what ingestion would credit
 * whether they came as ten pushes or one squashed push (the ledger telescopes). Each commit's
 * code is credited to its own purpose, as ten pushes would be.
 */
export function combine(chosen: readonly CommitMeta[], diffs: readonly (ChangedFile[] | null)[], commits: readonly PreviewCommit[], contexts: readonly (PushContext | null)[] = []): PreviewCombined | null {
  if (chosen.length === 0) return null;
  const store = new MemoryLedger();
  const ledger = emptyLedger();
  let pushes = 0;
  let filesChanged = 0;
  let estimated = 0;
  const uncounted: (readonly Uncounted[] | undefined)[] = [];
  let modules = 0;
  const notes = new Map<string, DifficultyNote>();
  for (let i = chosen.length - 1; i >= 0; i--) {
    const files = diffs[i];
    if (!files) continue;
    const delta = measurePush(files, store, contexts[i] ?? null);
    // A file's latest note carries the day's state (modified lines so far); its extra and effort credit add up.
    for (const n of delta.difficulty ?? []) {
      const was = notes.get(n.path);
      notes.set(n.path, { ...n, extraMilli: (was?.extraMilli ?? 0) + n.extraMilli, creditMilli: (was?.creditMilli ?? 0) + (n.creditMilli ?? 0), context: n.context ?? was?.context ?? null });
    }
    uncounted.push(delta.uncounted);
    modules += delta.modules ?? 0;
    credit(ledger, delta, purposeOf(chosen[i]!.message));
    pushes++;
    filesChanged += files.length;
    estimated += shapeOf(files).estimated;
  }
  const army = armyOf(ledger, Math.max(1, pushes));
  const separateSlots = commits.reduce((n, c) => n + c.army.slots, 0);
  const merged = mergeUncounted(uncounted);
  const reasons = [
    `${plural(pushes, 'commit')} pushed on one day, oldest first`,
    ...explain(ledger, army, null, { filesChanged, estimated, truncated: false, uncounted: merged, modules, difficulty: [...notes.values()].map(difficultyOf) }),
    `One by one, each on a fresh day, their armies would add up to a size of ${fmt(separateSlots)}; together, ${fmt(army.slots)}`,
  ];
  return {
    commits: pushes,
    lines: linesOf(ledger.lines),
    files: ledger.files,
    ...complexityFields(ledger),
    filler: ledger.filler,
    army,
    separateSlots,
    ...(ledger.bonus ? { bonus: ledger.bonus } : {}),
    why: whyOf(ledger, army, null, { filesChanged, estimated, truncated: false, uncounted: merged, modules, notes: [...notes.values()], ownOnly: ownOnly(contexts) }),
    reasons,
  };
}

