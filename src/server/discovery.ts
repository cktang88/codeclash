// Discovery: finding a player's pushes before the events feed brings them.
//
// GitHub's events API can lag minutes to hours. For each room member with a usable token of their own
// (server/githubPool.ts), this keeps a small set of recently active public repositories, fed by:
//   - the PushEvents the poller reads (poller.ts `onPushEvent`);
//   - GraphQL `viewer.contributionsCollection(from: now - 7 days)`'s commit contributions by repository,
//     and `GET /user/repos?sort=pushed` (public, owner or collaborator), each read once an hour.
// Every few minutes (2 while the player pushed in the last hour, 5 within the day, 15 when idle) it reads
// each watched repository's branch heads (`GET /repos/{o}/{r}/branches` with its ETag: an unchanged list is
// a free 304). A moved head becomes a push `{ before: old head, head: new head }`, a new branch one from the
// default branch's head (so the compare starts at their merge base), and it goes through the exact same
// `ingestPush` as a PushEvent: classification, the ledger, dedup by commit sha, the difficulty bonus and
// forks' upstream rules all apply, and the PushEvent that arrives later finds its push (or its commits)
// already recorded and counts nothing twice.
//
// Why branches and not `GET /repos/{o}/{r}/events`: a repository's events come from the same delayed
// pipeline as a user's, so they would be no fresher; the branch list is read from the repository itself.
// Both cost one request when changed and nothing when not (a 304).
//
// Everything here runs on the player's own token, never the server's: no token, no discovery (only the
// events feed, as before). The first read of a repository is a baseline (nothing is synthesised from it),
// a repository that answers 404 (deleted, made private, or out of the token's sight) is dropped, a renamed
// one is followed to its new name, and a player's discovery spends at most DISCOVERY.maxChargedPerHour
// requests GitHub charges an hour (304s are free), and stops while their own bucket is below
// DISCOVERY.ownFloor.

import type { Store, UserRow, WatchedRepo } from './db.ts';
import type { GithubClient } from './github.ts';
import { counting, rateLimited, unauthorized, type GithubPool } from './githubPool.ts';
import { errorMessage, type Logger } from './log.ts';
import { ingestPush, type PollerDeps, type PushReport } from './poller.ts';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ZERO = '0'.repeat(40);

export const DISCOVERY = {
  /** Branch-head polls: while the player pushed in the last hour, within the last day, and otherwise. */
  activeMs: 2 * MINUTE,
  warmMs: 5 * MINUTE,
  idleMs: 15 * MINUTE,
  /** Repositories watched per player at most, most recently active first; quiet ones leave after a week. */
  maxRepos: 10,
  quietMs: 7 * DAY,
  /** `/user/repos` and the contributions query are read this often. */
  sourcesEveryMs: HOUR,
  /** Requests GitHub charges (304s are free) a player's discovery may spend an hour, synthesised pushes' compares included. */
  maxChargedPerHour: 250,
  /** Discovery pauses while the player's own REST bucket holds fewer than this. */
  ownFloor: 1_000,
  /** Moved branches read per repository per poll; the rest wait for the next poll. */
  maxMovesPerRepo: 5,
  /** A moved branch whose push keeps failing is given up on (the events feed still has it) after this many tries. */
  maxTries: 3,
  /** The loop wakes this often and polls at most this many players a wake. */
  tickMs: 15_000,
  maxPerTick: 10,
} as const;

/** The contributions query: the player's commit contributions of the last week, by repository. */
export const CONTRIBUTIONS_QUERY = `query($from: DateTime!) { rateLimit { cost remaining } viewer { contributionsCollection(from: $from) { commitContributionsByRepository(maxRepositories: 25) { repository { nameWithOwner isFork isPrivate defaultBranchRef { name } } contributions(first: 1, orderBy: { direction: DESC }) { nodes { occurredAt } } } } } }`;

export interface DiscoveryDeps extends Pick<PollerDeps, 'store' | 'clock' | 'onPush' | 'context' | 'parser'> {
  pool: GithubPool;
  log: Logger;
}

export interface DiscoveryRun {
  /** Requests GitHub charged for this run. */
  charged: number;
  reports: PushReport[];
}

/** A token granted more than public access is never used to look around (it could see private repositories). */
export function publicOnly(scopes: string): boolean {
  return !scopes.split(/[\s,]+/).some((s) => s === 'repo' || s.startsWith('repo:') || s === 'admin:org' || s === 'read:org');
}

type Json = Record<string, unknown> | null;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

export class Discovery {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = new Map<number, Promise<DiscoveryRun>>();
  /** Failed tries per `${userId}:${repo}#${branch}@${head}`. */
  private tries = new Map<string, number>();
  readonly stats = { polls: 0, repoReads: 0, notModified: 0, synthesised: 0, dropped: 0, capped: 0 };

  constructor(private readonly deps: DiscoveryDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), DISCOVERY.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** A PushEvent from the player's feed: its repository is watched (players with a token only), and the player counts as active. */
  noteEvent(userId: number, repo: string, at: number): void {
    const { store } = this.deps;
    if (store.sealedToken(userId) === null) return;
    store.noteRepo(userId, repo, at, 'push');
    store.notePushedAt(userId, at);
  }

  /** How long between a player's polls: faster while they are at work. */
  intervalFor(pushedAt: number | null, now: number): number {
    if (pushedAt !== null && now - pushedAt < HOUR) return DISCOVERY.activeMs;
    if (pushedAt !== null && now - pushedAt < DAY) return DISCOVERY.warmMs;
    return DISCOVERY.idleMs;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.deps.clock();
      const due = this.deps.store.pollableUsers().filter((u) => {
        if (!u.token?.valid) return false;
        const s = this.deps.store.discoveryState(u.id);
        return s.polledAt === null || now - s.polledAt >= this.intervalFor(s.pushedAt, now);
      });
      for (const u of due.slice(0, DISCOVERY.maxPerTick)) await this.pollUser(u.id);
    } catch (err) {
      this.deps.log.warn('discovery tick failed', { error: errorMessage(err) });
    } finally {
      this.running = false;
    }
  }

  /** One discovery pass for a player. Never throws. */
  pollUser(userId: number): Promise<DiscoveryRun> {
    const pending = this.inFlight.get(userId);
    if (pending) return pending;
    const run = this.poll(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, run);
    return run;
  }

  private async poll(userId: number): Promise<DiscoveryRun> {
    const { store, pool, clock, log } = this.deps;
    const out: DiscoveryRun = { charged: 0, reports: [] };
    const user = store.user(userId);
    if (!user || user.bot || !user.token?.valid || !publicOnly(user.token.scopes)) return out;
    const gh = pool.own(userId);
    if (!gh || gh.rateLimit().remaining < DISCOVERY.ownFloor) return out;
    const now = clock();
    const state = store.discoveryState(userId);
    const hour = Math.floor(now / HOUR);
    if (state.hour !== hour) {
      state.hour = hour;
      state.spent = 0;
    }
    const meter = counting(gh);
    const spent = () => state.spent + meter.charged();
    const room = () => spent() < DISCOVERY.maxChargedPerHour;
    this.stats.polls++;
    try {
      if (!room()) {
        this.stats.capped++;
        return out;
      }
      if (state.reposAt === null || now - state.reposAt >= DISCOVERY.sourcesEveryMs) {
        await this.refreshSources(user, gh, now);
        state.reposAt = now;
        state.contribAt = now;
      }
      store.trimWatched(userId, DISCOVERY.maxRepos, now - DISCOVERY.quietMs);
      for (const w of store.watchedRepos(userId)) {
        if (!room()) {
          this.stats.capped++;
          break;
        }
        if (!(await this.pollRepo(user, gh, w, now, room, out))) break;
      }
    } catch (err) {
      log.warn('discovery failed', { user: user.login, error: errorMessage(err) });
    } finally {
      out.charged = meter.charged();
      // A push noted meanwhile (the poller, a webhook) must survive this write.
      const latest = store.discoveryState(userId);
      if (store.user(userId)?.token) {
        store.setDiscoveryState({ ...state, pushedAt: Math.max(latest.pushedAt ?? 0, state.pushedAt ?? 0) || null, spent: spent(), polledAt: now });
      }
    }
    return out;
  }

  /** Reads the player's repositories and last week's contributions; private ones are skipped even if listed. */
  private async refreshSources(user: UserRow, gh: GithubClient, now: number): Promise<void> {
    const { store, log } = this.deps;
    const since = now - DISCOVERY.quietMs;
    if (gh.viewerRepos) {
      try {
        for (const r of await gh.viewerRepos()) {
          if (r.private || r.pushedAt < since) continue;
          store.noteRepo(user.id, r.fullName, r.pushedAt, 'repos', r.defaultBranch);
        }
      } catch (err) {
        if (unauthorized(err)) throw err;
        log.warn('discovery: repositories unread', { user: user.login, error: errorMessage(err) });
      }
    }
    if (gh.graphql && (gh.graphqlRateLimit?.().remaining ?? 0) >= DISCOVERY.ownFloor / 5) {
      try {
        const res = await gh.graphql(CONTRIBUTIONS_QUERY, { from: new Date(since).toISOString() });
        const byRepo = obj(obj(obj(obj(res.data)?.viewer)?.contributionsCollection))?.commitContributionsByRepository;
        for (const entry of Array.isArray(byRepo) ? byRepo : []) {
          const repo = obj(obj(entry)?.repository);
          const name = repo?.nameWithOwner;
          if (typeof name !== 'string' || repo?.isPrivate !== false) continue;
          const nodes = obj(obj(entry)?.contributions)?.nodes;
          const at = Array.isArray(nodes) ? Date.parse(String(obj(nodes[0])?.occurredAt ?? '')) : NaN;
          const branch = obj(repo.defaultBranchRef)?.name;
          store.noteRepo(user.id, name, Number.isFinite(at) ? Math.min(at, now) : since, 'contrib', typeof branch === 'string' ? branch : null);
        }
      } catch (err) {
        if (unauthorized(err)) throw err;
        log.warn('discovery: contributions unread', { user: user.login, error: errorMessage(err) });
      }
    }
  }

  /**
   * Reads one repository's branch heads and turns each moved head into a push. False when the run must
   * stop (the token was refused or ran dry).
   */
  private async pollRepo(user: UserRow, gh: GithubClient, w: WatchedRepo, now: number, room: () => boolean, out: DiscoveryRun): Promise<boolean> {
    const { store, log } = this.deps;
    if (!gh.branchHeads) return false;
    this.stats.repoReads++;
    let res: Awaited<ReturnType<NonNullable<GithubClient['branchHeads']>>>;
    try {
      res = await gh.branchHeads(w.repo, w.heads ? w.etag : null);
    } catch (err) {
      if (unauthorized(err) || rateLimited(err)) return false;
      log.warn('discovery: branches unread', { user: user.login, repo: w.repo, error: errorMessage(err) });
      return true;
    }
    if (res.status === 304) {
      this.stats.notModified++;
      store.setWatchedState(user.id, w.repo, { repo: res.repo ?? w.repo, etag: w.etag, heads: w.heads, defaultBranch: w.defaultBranch, checkedAt: now });
      return true;
    }
    if (res.status === 404) {
      // Deleted, made private, or no longer visible to the token: stop watching it.
      this.stats.dropped++;
      store.unwatchRepo(user.id, w.repo);
      return true;
    }
    const heads: Record<string, string> = {};
    for (const b of res.branches) heads[b.name] = b.sha;
    if (!w.heads) {
      store.setWatchedState(user.id, w.repo, { repo: res.repo, etag: res.etag, heads, defaultBranch: w.defaultBranch, checkedAt: now });
      return true;
    }
    const old = w.heads;
    let defaultBranch = w.defaultBranch;
    // Heads written back: what was read, except moves left for later, which keep their old head so the
    // next poll sees them move again. Deleted branches simply drop out.
    const next: Record<string, string> = { ...heads };
    const keepOld = (name: string) => {
      if (old[name] !== undefined) next[name] = old[name]!;
      else delete next[name];
    };
    let complete = true;
    let go = true;
    let read = 0;
    for (const b of res.branches) {
      if (old[b.name] === b.sha) continue;
      if (!go || read >= DISCOVERY.maxMovesPerRepo || !room()) {
        complete = false;
        keepOld(b.name);
        continue;
      }
      read++;
      const key = `${user.id}:${res.repo.toLowerCase()}#${b.name}@${b.sha}`;
      try {
        let before = old[b.name] ?? null;
        if (before === null) {
          // A new branch is read from its merge base with the default branch, so only its own commits count.
          if (!defaultBranch) defaultBranch = (await gh.repo(res.repo))?.defaultBranch ?? null;
          before = defaultBranch && defaultBranch !== b.name && heads[defaultBranch] ? heads[defaultBranch]! : ZERO;
        }
        // A force-push needs nothing special: compare's base...head reads from their merge base, and
        // commits already counted are left out by sha.
        const report = await ingestPush({ ...this.deps, github: gh }, user, { repo: res.repo, ref: `refs/heads/${b.name}`, before, head: b.sha, at: now });
        this.tries.delete(key);
        if (report) {
          out.reports.push(report);
          this.stats.synthesised++;
          store.notePushedAt(user.id, now);
        }
      } catch (err) {
        if (unauthorized(err) || rateLimited(err)) {
          go = false;
          complete = false;
          keepOld(b.name);
          continue;
        }
        const tries = (this.tries.get(key) ?? 0) + 1;
        log.warn('discovery: push unread', { user: user.login, repo: res.repo, branch: b.name, tries, error: errorMessage(err) });
        if (tries < DISCOVERY.maxTries) {
          if (this.tries.size > 10_000) this.tries.clear();
          this.tries.set(key, tries);
          complete = false;
          keepOld(b.name);
        } else this.tries.delete(key);
      }
    }
    // With moves left over, the ETag is dropped so the next read is a full one that shows them again.
    store.setWatchedState(user.id, w.repo, { repo: res.repo, etag: complete ? res.etag : null, heads: next, defaultBranch, checkedAt: now });
    return go;
  }
}
