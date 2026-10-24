import type { ChangedFile } from '../../rules/classify.ts';
import { GithubError } from '../github.ts';
import type { CommitMeta, CompareResult, EventsResult, GithubClient, PushEventLite, RepoInfo } from '../github.ts';

/** An in-memory GitHub: events per login with ETags, and compare/commit results per range. */
export class FakeGithub implements GithubClient {
  events = new Map<string, PushEventLite[]>();
  compares = new Map<string, CompareResult>();
  diffs = new Map<string, CompareResult>();
  pollInterval: number | null = null;
  remaining = 5000;
  /** Repositories by `owner/name` (any case), for the army preview. */
  repos = new Map<string, RepoInfo>();
  /** Each branch's history, newest first, by `owner/name#branch`. */
  histories = new Map<string, CommitMeta[]>();
  calls = { events: 0, notModified: 0, compare: 0, commit: 0, repo: 0, branches: 0, commits: 0 };
  failCompare = false;
  /** Makes every call throw, as GitHub does when the rate limit is spent. */
  rateLimited = false;
  /** Events per page, as GitHub serves them (100). */
  pageSize = 100;

  private etagOf(login: string): string {
    return `"${login}:${(this.events.get(login) ?? []).map((e) => e.id).join(',')}"`;
  }

  addEvent(login: string, e: PushEventLite): void {
    const list = this.events.get(login) ?? [];
    list.unshift(e);
    this.events.set(login, list);
  }

  setCompare(repo: string, base: string, head: string, result: CompareResult): void {
    this.compares.set(`${repo}:${base}...${head}`, result);
  }

  setCommit(repo: string, sha: string, result: CompareResult): void {
    this.diffs.set(`${repo}:${sha}`, result);
  }

  /** Adds a public repository with one branch's history (newest first); each commit's diff is set separately with `setCommit`. */
  addRepo(repo: string, history: CommitMeta[], opts: { branch?: string; private?: boolean } = {}): void {
    const branch = opts.branch ?? 'main';
    const known = this.repos.get(repo.toLowerCase());
    this.repos.set(repo.toLowerCase(), { fullName: repo, private: opts.private ?? false, defaultBranch: known?.defaultBranch ?? branch });
    this.histories.set(`${repo.toLowerCase()}#${branch}`, history);
  }

  private limited(): void {
    if (this.rateLimited) throw new GithubError('API rate limit exceeded', 403);
  }

  async repo(repo: string): Promise<RepoInfo | null> {
    this.calls.repo++;
    this.limited();
    this.remaining--;
    return this.repos.get(repo.toLowerCase()) ?? null;
  }

  async branches(repo: string, limit: number): Promise<string[] | null> {
    this.calls.branches++;
    this.limited();
    this.remaining--;
    if (!this.repos.has(repo.toLowerCase())) return null;
    const prefix = `${repo.toLowerCase()}#`;
    return [...this.histories.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)).slice(0, limit);
  }

  async commits(repo: string, ref: string, limit: number): Promise<CommitMeta[] | null> {
    this.calls.commits++;
    this.limited();
    this.remaining--;
    if (!this.repos.has(repo.toLowerCase())) return null;
    const history = this.histories.get(`${repo.toLowerCase()}#${ref}`);
    if (history) return history.slice(0, limit);
    // A sha: the history of whichever branch holds it, from there back.
    for (const [key, list] of this.histories) {
      if (!key.startsWith(`${repo.toLowerCase()}#`)) continue;
      const at = list.findIndex((c) => c.sha.startsWith(ref));
      if (at >= 0) return list.slice(at, at + limit);
    }
    return null;
  }

  async userEvents(login: string, etag: string | null, page = 1): Promise<EventsResult> {
    this.calls.events++;
    const current = this.etagOf(login);
    if (etag === current && page === 1) {
      this.calls.notModified++;
      return { status: 304 };
    }
    this.remaining--;
    const events = (this.events.get(login) ?? []).slice((page - 1) * this.pageSize, page * this.pageSize);
    const last = events[events.length - 1];
    return { status: 200, etag: current, pollInterval: this.pollInterval, events, ...(events.length >= this.pageSize && last ? { more: { id: last.id, createdAt: last.createdAt } } : {}) };
  }

  async compare(repo: string, base: string, head: string): Promise<CompareResult | null> {
    this.calls.compare++;
    this.remaining--;
    if (this.failCompare) throw new Error('GitHub is down');
    return this.compares.get(`${repo}:${base}...${head}`) ?? null;
  }

  async commit(repo: string, sha: string): Promise<CompareResult | null> {
    this.calls.commit++;
    this.limited();
    this.remaining--;
    return this.diffs.get(`${repo}:${sha}`) ?? null;
  }

  rateLimit() {
    return { remaining: this.remaining, resetAtMs: 0 };
  }
}

export function sourceFile(filename: string, added: string[], removed: string[] = []): ChangedFile {
  const patch = ['@@ -1,1 +1,1 @@', ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
  return { filename, status: 'modified', additions: added.length, deletions: removed.length, patch };
}

export function pushEvent(id: string, repo: string, before: string, head: string, createdAt: number, ref = 'refs/heads/main'): PushEventLite {
  return { id, repo, createdAt, pushId: `p${id}`, ref, before, head };
}

export const sha = (n: number): string => n.toString(16).padStart(40, 'a');
export const ZERO = '0'.repeat(40);

/** A commit as a branch's history lists it. */
export function commitMeta(shaValue: string, message: string, opts: Partial<Omit<CommitMeta, 'sha' | 'message'>> = {}): CommitMeta {
  return { sha: shaValue, message, authorLogin: 'ana', authorName: 'Ana', avatarUrl: null, date: '2026-10-23T12:00:00Z', merge: false, ...opts };
}
