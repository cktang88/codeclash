// Forks' deferred difficulty bonus: finding a fork's commits in its upstream, and crediting them once.
//
// A fork's edits of established code pay plain code credit at push time; their line bonus and effort
// credit (rules/difficulty.ts) are frozen in a pending row with the push (poller.ts). This watcher
// looks for each pending diff in the upstream's default branch:
//
// 1. `GET /repos/{upstream}/compare/{default}...{head}`: `behind` or `identical` means the diff's
//    head commit is in the default branch (a merge commit or a fast-forward).
// 2. Otherwise the fork branch's closed pull requests (`GET /pulls?state=closed&head=owner:branch`,
//    once a day per branch): one merged into the default branch whose commits
//    (`GET /pulls/{n}/commits`) include all of the diff's commits, or whose merge commit has the diff's
//    patch id (a squash of exactly that diff, or the same patch rebased).
//
// The first check runs right after the push's UTC day closes and then once a day; a webhook's merged
// pull request makes a user's rows for that repository due at once (the payload is signed by the
// user's own secret, so it only wakes rows: the check itself always asks GitHub). A row not found
// within UPSTREAM_GIVE_UP_DAYS is given up on. Answers are cached (a merged pull request's commits
// and a commit's patch id for good, a branch's pull requests for the day), and the checks spend at
// most UPSTREAM_SHARE of the REST budget above UPSTREAM_RESERVE.
//
// A day's reward is settled only once the day has closed (its immediate bonus is then final): the
// bonus the day would have earned had the found commits paid at push time, beyond what was already
// credited for it (`upstreamReward`). It goes to the player's current wars as an `upstream` input:
// difficulty bonus lines added once to that war's ledger.

import { createHash } from 'node:crypto';
import type { ChangedFile } from '../rules/classify.ts';
import { UPSTREAM_GIVE_UP_DAYS, UPSTREAM_PER_DAY, upstreamReward } from '../rules/difficulty.ts';
import type { Store, UpstreamPending } from './db.ts';
import { GithubError, type GithubClient, type PullSummary } from './github.ts';
import { errorMessage, type Logger } from './log.ts';

const DAY_MS = 86_400_000;
export const GIVE_UP_MS = UPSTREAM_GIVE_UP_DAYS * DAY_MS;
/** REST requests the checks always leave to ingestion and the preview. */
export const UPSTREAM_RESERVE = 2_000;
/** Of the REST budget above the reserve, the share the checks may spend until the limit resets (the poller takes 60%). */
export const UPSTREAM_SHARE = 0.1;
/** How often the watcher wakes. */
export const UPSTREAM_RUN_MS = 60_000;
/** Rows checked in one run at most. */
export const MAX_CHECKS_PER_RUN = 25;
/** The first checks after a day closes are spread over this long, by head sha. */
const SPREAD_MS = 2 * 3_600_000;
const CACHE_MAX = 5_000;

/**
 * A diff's patch id, as `git patch-id` reads one: its changed lines without whitespace or line numbers,
 * file by file in path order, hashed. A squash of exactly these changes, or the same changes rebased onto
 * another base, has the same id. A file whose patch GitHub omitted counts by its name and sizes.
 */
export function patchId(files: readonly ChangedFile[]): string | null {
  if (files.length === 0) return null;
  const h = createHash('sha1');
  for (const f of files.slice().sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0))) {
    h.update(`F${f.filename}\n`);
    if (f.patch == null) {
      h.update(`#${f.additions}/${f.deletions}\n`);
      continue;
    }
    for (const line of f.patch.split('\n')) {
      const mark = line[0];
      if (mark !== '+' && mark !== '-') continue;
      const body = line.slice(1).replace(/\s+/g, '');
      if (body !== '') h.update(`${mark}${body}\n`);
    }
  }
  return h.digest('hex');
}

/** When a pending row is first checked: right after its push's UTC day closes, spread by its head sha over the first hours. */
export function firstCheckAt(at: number, head: string): number {
  const next = (Math.floor(at / DAY_MS) + 1) * DAY_MS;
  const spread = Number.parseInt(head.slice(0, 6), 16);
  return next + (Number.isFinite(spread) ? spread % SPREAD_MS : 0);
}

export interface UpstreamRewardEvent {
  userId: number;
  /** The fork the commits were pushed to. */
  repo: string;
  upstream: string;
  /** UTC day number the commits were pushed on. */
  day: number;
  /** Bonus lines credited now. */
  bonus: number;
}

export interface UpstreamDeps {
  store: Store;
  github: GithubClient;
  clock: () => number;
  log?: Logger;
  /** Credits a settled reward to the player's current wars. */
  onReward: (r: UpstreamRewardEvent) => void;
}

export interface UpstreamStats {
  /** Rows checked against GitHub. */
  checks: number;
  /** REST requests the checks made. */
  requests: number;
  found: number;
  expired: number;
  rewards: number;
  rewardLines: number;
}

const rateLimited = (err: unknown) => err instanceof GithubError && (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.message)));

class Lru<V> {
  private map = new Map<string, V>();
  get(k: string): V | undefined {
    return this.map.get(k);
  }
  has(k: string): boolean {
    return this.map.has(k);
  }
  set(k: string, v: V): void {
    this.map.delete(k);
    if (this.map.size >= CACHE_MAX) this.map.delete(this.map.keys().next().value!);
    this.map.set(k, v);
  }
}

export class UpstreamWatcher {
  readonly stats: UpstreamStats = { checks: 0, requests: 0, found: 0, expired: 0, rewards: 0, rewardLines: 0 };
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** A fork branch's closed pull requests into the upstream, for the UTC day they were read. */
  private pulls = new Lru<{ day: number; pulls: PullSummary[] }>();
  /** A merged pull request's commits never change. */
  private pullCommits = new Lru<string[]>();
  /** A commit's patch id never changes. */
  private patchIds = new Lru<string | null>();

  constructor(private readonly deps: UpstreamDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), UPSTREAM_RUN_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Rows this run may check: UPSTREAM_SHARE of the REST budget above the reserve until the limit resets. */
  budget(now: number): number {
    const { remaining, resetAtMs } = this.deps.github.rateLimit();
    const spare = remaining - UPSTREAM_RESERVE;
    if (spare <= 0) return 0;
    const window = Math.max(60_000, resetAtMs - now);
    // A check costs one request, three or four when it has to read pull requests.
    return Math.max(1, Math.min(MAX_CHECKS_PER_RUN, Math.floor((spare * UPSTREAM_SHARE * UPSTREAM_RUN_MS) / window / 2)));
  }

  /** A merged pull request reported in `upstream` (a webhook): the user's pending rows there are checked now. */
  wake(userId: number, upstream: string): Promise<void> {
    const n = this.deps.store.wakeUpstream(userId, upstream, this.deps.clock());
    return n > 0 ? this.run() : Promise.resolve();
  }

  /** Checks the rows that are due, gives up on stale ones, and settles closed days. Never throws, never runs twice at once. */
  run(): Promise<void> {
    this.running ??= this.runOnce().finally(() => (this.running = null));
    return this.running;
  }

  private async runOnce(): Promise<void> {
    const { store, log } = this.deps;
    try {
      const now = this.deps.clock();
      // Stale rows cost no request: give up on them first.
      const due = store.dueUpstream(now, 500);
      const stale = due.filter((r) => now - r.at >= GIVE_UP_MS);
      for (const r of stale) {
        store.updateUpstream(r.id, { status: 'expired', checks: r.checks, nextCheckAt: r.nextCheckAt });
        this.stats.expired++;
      }
      const live = due.filter((r) => now - r.at < GIVE_UP_MS).slice(0, this.budget(now));
      for (const r of live) {
        let found: boolean;
        try {
          found = await this.check(r, now);
        } catch (err) {
          if (rateLimited(err)) break;
          log?.warn('upstream check failed', { user: r.userId, repo: r.repo, upstream: r.upstream, error: errorMessage(err) });
          found = false;
        }
        this.stats.checks++;
        if (found) {
          store.updateUpstream(r.id, { status: 'upstream', checks: r.checks + 1, nextCheckAt: r.nextCheckAt, foundAt: now });
          this.stats.found++;
        } else {
          // Once a day until it is given up on; the last check falls just before the deadline.
          store.updateUpstream(r.id, { status: 'pending', checks: r.checks + 1, nextCheckAt: Math.min(now + DAY_MS, r.at + GIVE_UP_MS) });
        }
      }
      this.settle(now);
    } catch (err) {
      log?.warn('upstream run failed', { error: errorMessage(err) });
    }
  }

  /**
   * Credits each closed day's newly found commits, once, oldest day first and at most UPSTREAM_PER_DAY
   * lines a UTC day to a player: what does not fit waits (unsettled) for the next day.
   */
  settle(now: number): void {
    const { store } = this.deps;
    const today = Math.floor(now / DAY_MS);
    for (const { userId, day } of store.unsettledUpstreamDays(today)) {
      const event = store.transaction(() => {
        const rows = store.confirmedUpstream(userId, day);
        const totals = store.upstreamDay(userId, day);
        const owed = upstreamReward(totals, rows, totals.credited);
        const room = Math.max(0, UPSTREAM_PER_DAY - store.upstreamPaid(userId, today));
        const bonus = Math.min(owed, room);
        if (bonus >= owed) store.settleUpstream(userId, day);
        if (bonus <= 0) return null;
        store.addUpstreamCredit(userId, day, bonus);
        store.addUpstreamPaid(userId, today, bonus);
        const newest = rows[rows.length - 1]!;
        return { userId, repo: newest.repo, upstream: newest.upstream, day, bonus };
      });
      if (!event) continue;
      this.stats.rewards++;
      this.stats.rewardLines += event.bonus;
      this.deps.onReward(event);
    }
  }

  /** Whether the row's diff is in the upstream's default branch. */
  async check(r: UpstreamPending, now: number): Promise<boolean> {
    const { github } = this.deps;
    if (!r.upstream || !r.branch) return false;
    if (github.compareStatus) {
      this.stats.requests++;
      const status = await github.compareStatus(r.upstream, r.branch, r.head);
      if (status === 'behind' || status === 'identical') return true;
    }
    if (!r.ref || !github.closedPulls || !github.pullCommits) return false;
    const owner = r.repo.slice(0, r.repo.indexOf('/'));
    const label = `${owner}:${r.ref}`;
    const key = `${r.upstream.toLowerCase()}#${label.toLowerCase()}`;
    const day = Math.floor(now / DAY_MS);
    let listed = this.pulls.get(key);
    if (!listed || listed.day !== day) {
      this.stats.requests++;
      listed = { day, pulls: (await github.closedPulls(r.upstream, label)) ?? [] };
      this.pulls.set(key, listed);
    }
    // Every commit the diff measured must be in the pull request: one honest commit merged must not
    // carry the rest of a push that never was.
    const mine = [...new Set(r.shas.concat(r.head))];
    for (const pr of listed.pulls) {
      if (pr.mergedAt === null || pr.base !== r.branch) continue;
      const pk = `${r.upstream.toLowerCase()}#${pr.number}`;
      let commits = this.pullCommits.get(pk);
      if (!commits) {
        this.stats.requests++;
        commits = (await github.pullCommits(r.upstream, pr.number)) ?? [];
        this.pullCommits.set(pk, commits);
      }
      const merged = new Set(commits);
      if (mine.every((sha) => merged.has(sha))) return true;
      // A squash of exactly this diff, or the same patch rebased: only a merge after the push can be it.
      if (r.patchId && pr.mergeSha && pr.mergedAt >= r.at) {
        const ck = `${r.upstream.toLowerCase()}@${pr.mergeSha}`;
        let id = this.patchIds.get(ck);
        if (id === undefined && !this.patchIds.has(ck)) {
          this.stats.requests++;
          const commit = await github.commit(r.upstream, pr.mergeSha);
          id = commit ? patchId(commit.files) : null;
          this.patchIds.set(ck, id);
        }
        if (id === r.patchId) return true;
      }
    }
    return false;
  }
}
