import { CAT_COUNT } from '../sim/api.ts';
import type { ChangedFile } from '../rules/classify.ts';
import { pusherOf, type PushContext } from '../rules/difficulty.ts';
import { applyPush, dayBonusTotals, type PushDelta } from '../rules/ledger.ts';
import type { Store, UserRow } from './db.ts';
import type { DifficultyContext } from './difficulty.ts';
import { EVENT_PAGES, GithubError, type CompareResult, type GithubClient } from './github.ts';
import type { GithubPool } from './githubPool.ts';
import { errorMessage, type Logger } from './log.ts';
import { inlineParser, type Parser } from './parsePool.ts';
import { firstCheckAt, patchId } from './upstream.ts';

export interface PushReport {
  userId: number;
  pushId: string;
  repo: string;
  language: string | null;
  /** Signed change to the user's daily ledger per line category: undone work arrives negative. */
  lines: number[];
  /** Signed change in source files carrying counted code changes today. */
  files: number;
  /** Signed change in decision points of counted code. */
  branches: number;
  /** Signed change in function points (3 per new function with a real body); absent in pushes recorded before. */
  functions?: number;
  /** Signed change in names used from newly imported local modules; absent in pushes recorded before. */
  links?: number;
  /** Signed change in difficulty bonus lines (rules/difficulty.ts); absent in pushes recorded before, or without context. */
  bonus?: number;
  /** Lines that undid counted work from earlier pushes. */
  churn: number;
  /** Filler: uncounted lines (punctuation, literal tables, duplicates) beyond what the push's code carries, plus pastes past the daily cap. */
  filler: number;
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
  /** Reads each diff's difficulty context before the push is recorded; none: no bonus. */
  context?: DifficultyContext | null;
  /** Parses diffs (off the main thread in production); none: inline. */
  parser?: Parser | null;
  /**
   * Players' own tokens (server/githubPool.ts): a player's polls, diffs and context run on their own
   * buckets while they can, and on `github` (the server's) otherwise. None: everything on `github`.
   */
  pool?: GithubPool | null;
  /** Told of each new push event in a player's feed (discovery watches those repositories). */
  onPushEvent?: (userId: number, repo: string, at: number) => void;
}

/** Players polled on their own tokens per tick at most (each is still polled at most once a minute). */
export const MAX_OWN_PER_TICK = 20;

/** Diffs of one push that get difficulty context (a mixed push is measured commit by commit): the newest. */
export const MAX_CONTEXT_DIFFS = 5;
const INLINE = inlineParser();

export const MIN_POLL_MS = 60_000;
export const FIRST_POLL_WINDOW_MS = 24 * 3_600_000;
export const TICK_MS = 5_000;
const BUDGET_SHARE = 0.6;
/** A push that keeps failing (a blocked repo, a diff GitHub cannot compute) is skipped after this many tries. */
export const MAX_PUSH_ATTEMPTS = 5;
const MESSAGE_MAX = 72;
const ZERO_SHA = /^0+$/;
const ALREADY_RECORDED = new Error('push already recorded');
const CLAIMED_ELSEWHERE = new Error('commits claimed by a concurrent ingestion');

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
/** Most of a user's own commits measured one by one in a push mixed with others' work. */
export const MAX_OWN_COMMITS = 20;

function sumDeltas(deltas: readonly PushDelta[]): PushDelta {
  const out: PushDelta = { lines: new Array<number>(CAT_COUNT).fill(0), files: 0, branches: 0, functions: 0, links: 0, bonus: 0, churn: 0, filler: 0, language: null };
  for (const d of deltas) {
    d.lines.forEach((n, c) => (out.lines[c]! += n));
    out.files += d.files;
    out.branches += d.branches;
    out.functions += d.functions;
    out.links += d.links;
    out.bonus! += d.bonus ?? 0;
    if (d.difficulty) (out.difficulty ??= []).push(...d.difficulty);
    out.churn += d.churn;
    out.filler += d.filler;
    out.language ??= d.language;
  }
  return out;
}

export async function ingestPush(
  deps: Pick<PollerDeps, 'store' | 'github' | 'clock' | 'onPush' | 'context' | 'parser'>,
  user: UserRow,
  push: PushRef,
  /** Webhook deliveries are signed by the user themselves, so only commits GitHub links to them count. */
  strictAuthor = false,
): Promise<PushReport | null> {
  // A concurrent ingestion (the webhook and the poller, or two branches) may claim some of the
  // same commits first; then the push is measured again against what is left.
  for (let attempt = 0; ; attempt++) {
    try {
      return await ingestOnce(deps, user, push, strictAuthor);
    } catch (err) {
      if (err !== CLAIMED_ELSEWHERE || attempt > 0) throw err;
    }
  }
}

async function ingestOnce(
  deps: Pick<PollerDeps, 'store' | 'github' | 'clock' | 'onPush' | 'context' | 'parser'>,
  user: UserRow,
  push: PushRef,
  strictAuthor: boolean,
): Promise<PushReport | null> {
  const { store, github } = deps;
  if (!push.ref.startsWith('refs/heads/') || ZERO_SHA.test(push.head)) return null;
  const pushId = pushIdOf(push.repo, push.head);
  if (store.hasPush(user.id, pushId)) return null;

  let result: CompareResult | null = null;
  if (!ZERO_SHA.test(push.before)) result = await github.compare(push.repo, push.before, push.head);
  result ??= await github.commit(push.repo, push.head);
  if (!result || result.commits.length === 0) return null;

  // GitHub's account id is stable; a login can be renamed and then taken by someone else.
  const login = user.login.toLowerCase();
  const isOwn = (c: CompareResult['commits'][number]) =>
    c.authorId != null ? c.authorId === user.id : c.authorLogin === null ? !strictAuthor : c.authorLogin.toLowerCase() === login;
  const own = result.commits.filter((c) => !c.merge && isOwn(c));
  // Commits are claimed only when the push is recorded, so a failed fetch below leaves them to a retry.
  const unseen = new Set(store.unseenCommits(user.id, own.map((c) => c.sha)));
  const counted = own.filter((c) => unseen.has(c.sha));
  if (counted.length === 0) return null;

  // When the range holds anyone else's commits or merges (a merged base, an upstream sync,
  // a co-worker's work), measure only this user's own commits, one by one, so a large
  // merge never rides on a tiny commit. The ledger sums them exactly as a squash would.
  // Each diff's head and own commits, for finding a fork's diff upstream later (server/upstream.ts).
  let diffs: { files: readonly ChangedFile[]; base?: string | null; head: string; shas: string[] }[] = [{ files: result.files, base: result.base ?? null, head: push.head, shas: counted.map((c) => c.sha) }];
  if (counted.length < result.commits.length) {
    diffs = [];
    for (const c of counted.slice(-MAX_OWN_COMMITS)) {
      const single = await github.commit(push.repo, c.sha);
      if (single) diffs.push({ files: single.files, base: single.base ?? null, head: c.sha, shas: [c.sha] });
    }
    if (diffs.length === 0) return null;
  }
  // Everything that waits happens before the push is recorded: each diff's difficulty context (the
  // bonus it yields is recorded in the push input, so replays never fetch it) and parsing (in a
  // worker thread). Applying the result to the ledger is then synchronous, inside the transaction.
  const pusher = pusherOf(user.id, user.login, counted.map((c) => c.authorEmail));
  const fetchContext = deps.context
    ? Promise.all(diffs.map((d, i) => (i >= diffs.length - MAX_CONTEXT_DIFFS ? deps.context!.forDiff(push.repo, d, pusher, github) : Promise.resolve(null))))
    : Promise.resolve(diffs.map((): PushContext | null => null));
  const [contexts, prepared] = await Promise.all([fetchContext, (deps.parser ?? INLINE).prepare(diffs.map((d) => d.files))]);
  let report: PushReport;
  try {
    report = store.transaction(() => {
      const shas = counted.map((c) => c.sha);
      if (store.claimCommits(user.id, shas, deps.clock()).length !== shas.length) throw CLAIMED_ELSEWHERE;
      // Measuring moves the ledger, so it commits only together with the push record.
      const now = deps.clock();
      const ledger = store.ledgerFor(user.id, push.repo, now);
      const deltas = prepared.map((p, i) => applyPush(p, ledger, contexts[i]));
      const delta = sumDeltas(deltas);
      // A fork's bonus waits on the upstream: each diff's share is frozen now, to be credited once its
      // commits are found there. The day's immediate totals are what that credit is capped against.
      const day = Math.floor(now / 86_400_000);
      deltas.forEach((d, i) => {
        const up = contexts[i]?.upstream;
        if (!d.pending || !up) return;
        const diff = diffs[i]!;
        store.addUpstreamPending({
          userId: user.id, pushId, repo: push.repo, upstream: up.repo, branch: up.branch, ref: push.ref.slice('refs/heads/'.length),
          head: diff.head, shas: diff.shas, patchId: patchId(diff.files), day, at: now,
          bonusMilli: d.pending.bonusMilli, effortMilli: d.pending.effortMilli, nextCheckAt: firstCheckAt(now, diff.head),
        });
      });
      const totals = dayBonusTotals(ledger);
      store.setUpstreamDayTotals(user.id, day, totals.bonusMilli, totals.effortMilli);
      const lines = delta.lines.slice();
      while (lines.length < CAT_COUNT) lines.push(0);
      const r: PushReport = {
        userId: user.id,
        pushId,
        repo: push.repo,
        language: delta.language,
        lines,
        files: delta.files,
        branches: delta.branches,
        functions: delta.functions,
        links: delta.links,
        ...(delta.bonus ? { bonus: delta.bonus } : {}),
        churn: delta.churn,
        filler: delta.filler,
        commits: counted.length,
        message: headline(counted[counted.length - 1]!.message),
        at: push.at,
      };
      if (!store.recordPush(r)) throw ALREADY_RECORDED;
      return r;
    });
  } catch (err) {
    if (err === ALREADY_RECORDED) return null;
    throw err;
  }
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
      // Players with a usable token of their own are polled on their own bucket, outside the server's budget.
      const pool = this.deps.pool;
      const own = pool ? due.filter((u) => u.token?.valid && pool.hasBudget(u.id)) : [];
      const ownIds = new Set(own.map((u) => u.id));
      const shared = due.filter((u) => !ownIds.has(u.id));
      // At least one user per tick keeps the feed moving, even when the budget rounds down.
      const budget = Math.max(this.deps.github.rateLimit().remaining > 50 ? 1 : 0, this.budget(now));
      for (const user of [...own.slice(0, MAX_OWN_PER_TICK), ...shared.slice(0, budget)]) await this.pollUser(user.id);
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
    const { store, log, clock } = this.deps;
    const user = store.user(userId);
    if (!user || user.bot) return;
    const github = this.deps.pool?.forUser(user.id) ?? this.deps.github;
    const deps = { ...this.deps, github };
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
      const since = lastEventId;
      // A busy user, or a long pause in polling, can leave more new events than one page holds.
      const all = res.events.slice();
      let more = res.more;
      for (let page = 2; more && page <= EVENT_PAGES; page++) {
        if (since !== null ? compareIds(more.id, since) <= 0 : more.createdAt < now - FIRST_POLL_WINDOW_MS) break;
        const next = await github.userEvents(user.login, null, page);
        if (next.status !== 200) break;
        all.push(...next.events);
        more = next.more;
      }
      const events = all.sort((a, b) => compareIds(a.id, b.id));
      const fresh = events.filter(
        (e) =>
          (since !== null ? compareIds(e.id, since) > 0 : e.createdAt >= now - FIRST_POLL_WINDOW_MS) &&
          // A renamed login can be taken by someone else: only this account's own pushes count.
          (e.actorId === undefined || e.actorId === user.id),
      );
      etag = res.etag;
      for (const e of fresh) this.deps.onPushEvent?.(user.id, e.repo, e.createdAt);
      for (const e of fresh) {
        const key = `${user.id}:${e.id}`;
        try {
          await ingestPush(deps, user, { repo: e.repo, ref: e.ref, before: e.before, head: e.head, at: e.createdAt });
          this.attempts.delete(key);
        } catch (err) {
          // Being rate limited says nothing about the push itself, so it does not use up its tries.
          const limited = err instanceof GithubError && (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.message)));
          const tries = (this.attempts.get(key) ?? 0) + (limited ? 0 : 1);
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
