// The army preview: what a public repository's latest commits would raise. Each commit is read
// and measured exactly as ingestion measures a push (`measurePush`), as a standalone push on a
// fresh ledger, then mustered with `armyFor` and `armyQuality`. Nothing here touches a player's
// ledger, the database or a war; it only reads public GitHub data with the server's own token.

import type { PreviewArmy, PreviewCombined, PreviewCommit, PreviewLines, PreviewResponse } from '../protocol.ts';
import type { ChangedFile } from '../rules/classify.ts';
import { measurePush, MemoryLedger, type LedgerStore, type PushDelta } from '../rules/ledger.ts';
import { validRef, validRepo } from '../rules/repoRef.ts';
import { CAT_NAMES, Cat, Kind, type Ledger, type Purpose } from '../sim/api.ts';
import { applyDelta, armyFor, armyQuality, BUDGET_PER_10K, budgetOf, cleanLines, effectiveLedger, emptyLedger, int, purposeOf, slotsOf } from '../sim/muster.ts';
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
  applyDelta(ledger, { lines: cleanLines(delta.lines), files: int(delta.files), branches: int(delta.branches), churn: int(delta.churn, 0), filler: int(delta.filler, 0), purpose });
}

/** What one commit alone raises: a standalone push measured on a fresh ledger. */
export function musterCommit(files: readonly ChangedFile[], message: string, store: LedgerStore = new MemoryLedger()): { delta: PushDelta; ledger: Ledger; army: PreviewArmy; purpose: Purpose } {
  const delta = measurePush(files, store);
  const purpose = purposeOf(message);
  const ledger = emptyLedger();
  credit(ledger, delta, purpose);
  return { delta, ledger, army: armyOf(ledger, 1), purpose };
}

// ------------------------------------------------------------------ explaining

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const unit = (kind: number, n: number) => (n === 1 && (kind === Kind.Dragon || kind === Kind.Troll) ? `a ${STATS[kind]!.name}` : `${fmt(n)} ${n === 1 ? STATS[kind]!.name : STATS[kind]!.plural}`);
const units = (counts: readonly number[], kinds: readonly number[]) => kinds.filter((k) => counts[k]! > 0).map((k) => unit(k, counts[k]!)).join(', ');

/** What each purpose raises, and what a commit must be to raise it. */
const PURPOSE_SPECIALISTS: Record<Exclude<Purpose, 'work'>, string> = {
  fix: 'Bug fix too small for Clerics',
  feature: 'Feature too small for a Champion (400 lines across 5 files)',
  refactor: 'Refactor too small for Outriders',
  perf: 'Performance work too small for Wizards',
  revert: 'Revert too small to raise the dead',
  chore: 'Chore too small for Mercenaries',
};

/** Short lines saying why a ledger raised the army it did. */
export function explain(ledger: Ledger, army: PreviewArmy, purpose: Purpose | null, extra: { filesChanged: number; estimated: number; truncated: boolean; unread?: boolean }): string[] {
  const out: string[] = [];
  const L = ledger.lines;
  const c = army.counts;
  const eff = effectiveLedger(ledger);
  if (extra.unread) return ['GitHub would not give this commit’s diff, so nothing was measured'];
  if (L[Cat.Code]! > 0) out.push(`${plural(L[Cat.Code]!, 'line')} of code across ${plural(ledger.files, 'source file')}${ledger.branches > 0 ? `, ${plural(ledger.branches, 'branch point')}` : ''}`);
  if (L[Cat.Removed]! > 0) out.push(`${plural(L[Cat.Removed]!, 'line')} removed`);
  if (army.budget > 0) {
    const w = BUDGET_PER_10K;
    const parts = [
      ['code', (w.code * eff.code) / 10_000],
      ['files', (w.files * eff.files) / 10_000],
      ['branch points', (w.branches * eff.branches) / 10_000],
      ['removed lines', (w.removed * eff.removed) / 10_000],
    ] as const;
    const shown = parts.filter(([, v]) => v >= 0.5).map(([name, v]) => `${name} ${v < 10 ? v.toFixed(1) : Math.round(v)}`);
    out.push(`Budget of ${plural(army.budget, 'slot')}${shown.length ? ` (${shown.join(', ')})` : ''}`);
  }
  // Specialists, by what raised them.
  const fixers = units(c, [Kind.Cleric, Kind.Paladin, Kind.Ranger]);
  if (fixers) out.push(`${purpose ? 'Bug fix' : 'Bug fixes'} → ${fixers}`);
  if (c[Kind.Dragon]! > 0) out.push(`Legendary ${purpose === 'work' ? 'work' : 'feature'} (900+ lines, 10+ files, 90+ branch points) → ${unit(Kind.Dragon, c[Kind.Dragon]!)}`);
  if (c[Kind.Champion]! > 0) out.push(`Big feature (400 feature lines and 5 files each) → ${unit(Kind.Champion, c[Kind.Champion]!)}`);
  const refactor = units(c, [Kind.Outrider, Kind.GriffinRider]);
  if (refactor) out.push(`Refactor → ${refactor}`);
  if (c[Kind.Wizard]! > 0) out.push(`Performance work → ${unit(Kind.Wizard, c[Kind.Wizard]!)}`);
  const undead = units(c, [Kind.Skeleton, Kind.BoneGolem]);
  if (undead) out.push(`Revert → ${undead}`);
  if (c[Kind.Mercenary]! > 0) out.push(`Chore → ${unit(Kind.Mercenary, c[Kind.Mercenary]!)}`);
  if (c[Kind.Knight]! > 0) out.push(`${plural(eff.branches, 'branch point')} → ${unit(Kind.Knight, c[Kind.Knight]!)}`);
  if (c[Kind.Troll]! > 0) out.push(`Very complex code → ${unit(Kind.Troll, c[Kind.Troll]!)}`);
  if (c[Kind.Trebuchet]! > 0) out.push(`Sweeping change (15 files each) → ${unit(Kind.Trebuchet, c[Kind.Trebuchet]!)}`);
  if (purpose && purpose !== 'work' && army.budget > 0 && !fixers && !refactor && !undead && c[Kind.Wizard] === 0 && c[Kind.Mercenary] === 0 && c[Kind.Champion] === 0 && c[Kind.Dragon] === 0) {
    out.push(`${PURPOSE_SPECIALISTS[purpose]}, or the specialists’ share (65% of the budget) went to others`);
  }
  if (c[Kind.Footman]! > 0 && army.budget > 0) out.push(`The rest of the budget → ${unit(Kind.Footman, c[Kind.Footman]!)}`);
  if (c[Kind.Berserker]! > 0) out.push(`No tests or comments → ${unit(Kind.Berserker, c[Kind.Berserker]!)}, each in place of two Footmen`);
  // Support.
  const support: [number, Cat, string, string][] = [
    [Kind.Warden, Cat.Test, 'test line', 'tests'],
    [Kind.Archer, Cat.Comment, 'comment line', 'comments'],
    [Kind.Herald, Cat.Docs, 'line of docs', 'docs'],
    [Kind.Sapper, Cat.Config, 'line of config', 'config'],
  ];
  for (const [kind, cat, noun] of support) {
    if (L[cat]! <= 0) continue;
    const many = noun.startsWith('line') ? noun.replace('line', 'lines') : `${noun}s`;
    out.push(c[kind]! > 0 ? `${plural(L[cat]!, noun, many)} → ${unit(kind, c[kind]!)} (support)` : `${plural(L[cat]!, noun, many)}: too few for a ${STATS[kind]!.name}`);
  }
  if (L[Cat.Generated]! > 0) out.push(`${plural(L[Cat.Generated]!, 'generated line')} raise nothing`);
  if (L[Cat.Vendor]! > 0) out.push(`${plural(L[Cat.Vendor]!, 'vendored line')} raise nothing`);
  if (ledger.filler > 0) out.push(`${plural(ledger.filler, 'line')} left out as filler (copies, punctuation, tables)`);
  for (const n of army.notes) {
    if (n.kind === 'veteran') out.push(`${n.text}: soldiers fight ${Math.round(n.effect * 100)}% harder`);
    else out.push(`${n.text}: quality ${n.effect > 0 ? '+' : '−'}${Math.round(Math.abs(n.effect) * 100)}%`);
  }
  if (army.budget === 0) {
    const messenger = army.slots === 1 && c[Kind.Footman] === 1;
    const unreadOnly = extra.filesChanged === 0 || (L.every((n, i) => i === Cat.Blank || n === 0) && ledger.filler === 0);
    if (messenger) out.push(unreadOnly ? 'Nothing to count (binary, data or other unread files): a lone messenger marches' : 'No code: a lone messenger marches, as every first push sends one');
    else out.push('No code: only support marches');
  }
  if (extra.estimated > 0) out.push(`GitHub omitted the diff of ${plural(extra.estimated, 'file')}; their additions count as code`);
  if (extra.truncated) out.push(`Only the first ${MAX_FILES} files are read, as ingestion reads them`);
  return out;
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
      const { ledger, army, purpose } = musterCommit(files ?? [], c.message);
      const shape = shapeOf(files ?? []);
      return {
        ...base,
        purpose,
        lines: linesOf(ledger.lines),
        filesChanged: files?.length ?? 0,
        files: ledger.files,
        branches: ledger.branches,
        filler: ledger.filler,
        army,
        reasons: explain(ledger, army, purpose, { filesChanged: files?.length ?? 0, ...shape, unread: files === null }),
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
      combined: combine(chosen, diffs, commits),
      fetchedAt: this.deps.clock(),
    };
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
export function combine(chosen: readonly CommitMeta[], diffs: readonly (ChangedFile[] | null)[], commits: readonly PreviewCommit[]): PreviewCombined | null {
  if (chosen.length === 0) return null;
  const store = new MemoryLedger();
  const ledger = emptyLedger();
  let pushes = 0;
  let filesChanged = 0;
  let estimated = 0;
  for (let i = chosen.length - 1; i >= 0; i--) {
    const files = diffs[i];
    if (!files) continue;
    credit(ledger, measurePush(files, store), purposeOf(chosen[i]!.message));
    pushes++;
    filesChanged += files.length;
    estimated += shapeOf(files).estimated;
  }
  const army = armyOf(ledger, Math.max(1, pushes));
  const separateSlots = commits.reduce((n, c) => n + c.army.slots, 0);
  const reasons = [
    `${plural(pushes, 'commit')} pushed on one day, oldest first`,
    ...explain(ledger, army, null, { filesChanged, estimated, truncated: false }),
    `One by one, each on a fresh day, they would muster ${plural(separateSlots, 'slot')}; together, ${plural(army.slots, 'slot')}`,
  ];
  return {
    commits: pushes,
    lines: linesOf(ledger.lines),
    files: ledger.files,
    branches: ledger.branches,
    filler: ledger.filler,
    army,
    separateSlots,
    reasons,
  };
}

