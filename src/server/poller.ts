import { CAT_COUNT } from '../sim/api.ts';
import { summarizeFiles } from '../rules/classify.ts';
import type { Store, UserRow } from './db.ts';
import type { CompareResult, GithubClient } from './github.ts';
import { errorMessage, type Logger } from './log.ts';

export interface PushReport {
  userId: number;
  pushId: string;
  repo: string;
  language: string | null;
  lines: number[];
  /** Source files touched. */
  files: number;
  /** Branch points added in source code. */
  branches: number;
  commits: number;
  message: string;
  at: number;
}

export interface PollerDeps {
  store: Store;
  github: GithubClient;
  log: Logger;
  clock: () => number;
  onPush: (report: PushReport) => void;
}

export const MIN_POLL_MS = 60_000;
export const FIRST_POLL_WINDOW_MS = 24 * 3_600_000;
export const TICK_MS = 5_000;
const BUDGET_SHARE = 0.6;
/** A push that keeps failing (a blocked repo, a diff GitHub cannot compute) is skipped after this many tries. */
export const MAX_PUSH_ATTEMPTS = 5;
const MESSAGE_MAX = 72;
const ZERO_SHA = /^0+$/;

export interface PushRef {
  repo: string;
  ref: string;
  before: string;
  head: string;
  at: number;
}

export function pushIdOf(repo: string, head: string): string {
  return `${repo}@${head}`;
}

function headline(message: string): string {
  const first = message.split('\n', 1)[0]!.trim();
  return first.length > MESSAGE_MAX ? `${first.slice(0, MESSAGE_MAX - 1)}…` : first;
}

function compareIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Turns one push into a report, once. Shared by the poller and the webhook so a
 * push delivered by both counts a single time: both use `${repo}@${head}` as the
 * push id, and commits already claimed by the user are never counted again.
 */
export async function ingestPush(
  deps: Pick<PollerDeps, 'store' | 'github' | 'clock' | 'onPush'>,
  user: UserRow,
  push: PushRef,
  /** Webhook deliveries are signed by the user themselves, so only commits GitHub links to them count. */
  strictAuthor = false,
): Promise<PushReport | null> {
  const { store, github } = deps;
  if (!push.ref.startsWith('refs/heads/') || ZERO_SHA.test(push.head)) return null;
  const pushId = pushIdOf(push.repo, push.head);
  if (store.hasPush(user.id, pushId)) return null;

  let result: CompareResult | null = null;
  if (!ZERO_SHA.test(push.before)) result = await github.compare(push.repo, push.before, push.head);
  result ??= await github.commit(push.repo, push.head);
  if (!result || result.commits.length === 0) return null;

  const login = user.login.toLowerCase();
  const own = result.commits.filter((c) => (c.authorLogin === null ? !strictAuthor : c.authorLogin.toLowerCase() === login));
  const fresh = new Set(store.claimCommits(user.id, own.map((c) => c.sha), deps.clock()));
  const counted = own.filter((c) => fresh.has(c.sha));
  if (counted.length === 0) return null;

  const summary = summarizeFiles(result.files);
  // Other people's commits in the range (a merged base, a co-worker's work) do not raise soldiers.
  const share = counted.length / result.commits.length;
  const scale = (n: number) => (share < 1 ? Math.floor(n * share) : n);
  const lines = summary.lines.map(scale);
  while (lines.length < CAT_COUNT) lines.push(0);

  const report: PushReport = {
    userId: user.id,
    pushId,
    repo: push.repo,
    language: summary.language,
    lines,
    files: summary.files > 0 ? Math.max(1, scale(summary.files)) : 0,
    branches: scale(summary.branches),
    commits: counted.length,
    message: headline(counted[counted.length - 1]!.message),
    at: push.at,
  };
  if (!store.recordPush(report)) return null;
  deps.onPush(report);
  return report;
}

export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pollIntervalMs = MIN_POLL_MS;
  private inFlight = new Map<number, Promise<void>>();
  /** Failed attempts per `${userId}:${eventId}`, so one poisoned event cannot stall a user's feed forever. */
  private attempts = new Map<string, number>();

  constructor(private readonly deps: PollerDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** How many users this tick may poll without spending more than our share of the rate limit. */
  budget(now: number): number {
    const { remaining, resetAtMs } = this.deps.github.rateLimit();
    const window = Math.max(60_000, resetAtMs - now);
    return Math.max(0, Math.floor((remaining * BUDGET_SHARE * TICK_MS) / window));
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.deps.clock();
      const interval = Math.max(MIN_POLL_MS, this.pollIntervalMs);
      const due = this.deps.store.pollableUsers().filter((u) => u.lastPolledAt === null || now - u.lastPolledAt >= interval);
      // At least one user per tick keeps the feed moving, even when the budget rounds down.
      const budget = Math.max(this.deps.github.rateLimit().remaining > 50 ? 1 : 0, this.budget(now));
      for (const user of due.slice(0, budget)) await this.pollUser(user.id);
    } finally {
      this.running = false;
    }
  }

  pollUser(userId: number): Promise<void> {
    const pending = this.inFlight.get(userId);
    if (pending) return pending;
    const run = this.poll(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, run);
    return run;
  }

  private async poll(userId: number): Promise<void> {
    const { store, github, log, clock } = this.deps;
    const user = store.user(userId);
    if (!user || user.bot) return;
    const now = clock();
    let etag = user.eventsEtag;
    let lastEventId = user.lastEventId;
    try {
      const res = await github.userEvents(user.login, etag);
      if (res.status === 304) {
        store.setPollState(user.id, { etag, lastEventId, at: now, error: null });
        return;
      }
      if (res.pollInterval) this.pollIntervalMs = res.pollInterval * 1000;
      const events = res.events.slice().sort((a, b) => compareIds(a.id, b.id));
      const since = lastEventId;
      const fresh = events.filter((e) => (since !== null ? compareIds(e.id, since) > 0 : e.createdAt >= now - FIRST_POLL_WINDOW_MS));
      etag = res.etag;
      for (const e of fresh) {
        const key = `${user.id}:${e.id}`;
        try {
          await ingestPush(this.deps, user, { repo: e.repo, ref: e.ref, before: e.before, head: e.head, at: e.createdAt });
          this.attempts.delete(key);
        } catch (err) {
          const tries = (this.attempts.get(key) ?? 0) + 1;
          if (tries < MAX_PUSH_ATTEMPTS) {
            if (this.attempts.size > 10_000) this.attempts.clear();
            this.attempts.set(key, tries);
            // Stop here and refetch next time so this push is retried, not skipped.
            store.setPollState(user.id, { etag: null, lastEventId, at: now, error: errorMessage(err) });
            log.warn('push ingestion failed', { user: user.login, repo: e.repo, error: errorMessage(err) });
            return;
          }
          this.attempts.delete(key);
          log.warn('push ingestion gave up', { user: user.login, repo: e.repo, tries, error: errorMessage(err) });
        }
        lastEventId = e.id;
      }
      const newest = events[events.length - 1];
      if (newest && (lastEventId === null || compareIds(newest.id, lastEventId) > 0)) lastEventId = newest.id;
      store.setPollState(user.id, { etag, lastEventId, at: now, error: null });
    } catch (err) {
      store.setPollState(user.id, { etag, lastEventId, at: now, error: errorMessage(err) });
      log.warn('event poll failed', { user: user.login, error: errorMessage(err) });
    }
  }
}
