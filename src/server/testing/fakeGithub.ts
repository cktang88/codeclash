import type { ChangedFile } from '../../rules/classify.ts';
import type { RepoFacts } from '../../rules/difficulty.ts';
import { GithubError } from '../github.ts';
import type { CommitMeta, CompareResult, EventsResult, GithubClient, GraphqlResult, PushEventLite, RepoInfo } from '../github.ts';

/** Who wrote a line or a commit, as GraphQL names them: a linked account (with its creation date), or none. */
export interface FakeAuthor {
  id: number | null;
  /** ISO date the account was created. */
  createdAt?: string;
}

/** A file's blame and history at one commit, as the fake's GraphQL answers them. */
export interface FakeFileFacts {
  blame: { start: number; end: number; date: string; author: FakeAuthor }[];
  history: { total: number; commits: { date: string; author: FakeAuthor }[] };
}

/** How the fake's GraphQL misbehaves: every query fails, only batches (more than one file) fail, or queries hang past their timeout. */
export type GraphqlTrouble = 'none' | 'down' | 'batch' | 'slow';

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
  calls = { events: 0, notModified: 0, compare: 0, commit: 0, repo: 0, branches: 0, commits: 0, graphql: 0, repoFacts: 0, languages: 0 };
  /** Blame and history by `owner/name@oid:path`. */
  fileFacts = new Map<string, FakeFileFacts>();
  /** Repository facts and languages by `owner/name` (any case). */
  facts = new Map<string, RepoFacts>();
  langs = new Map<string, Record<string, number>>();
  graphqlTrouble: GraphqlTrouble = 'none';
  /** GraphQL points left, and the variables of every query asked. */
  graphqlRemaining = 5000;
  graphqlAsked: Record<string, unknown>[] = [];
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

  /** Sets a file's blame and history at commit `oid`. */
  setFileFacts(repo: string, oid: string, path: string, facts: FakeFileFacts): void {
    this.fileFacts.set(`${repo.toLowerCase()}@${oid}:${path}`, facts);
  }

  /** Sets a repository's facts (and optionally its languages). */
  setRepoFacts(facts: RepoFacts, languages: Record<string, number> = { TypeScript: 1_000_000 }): void {
    this.facts.set(facts.fullName.toLowerCase(), facts);
    this.langs.set(facts.fullName.toLowerCase(), languages);
  }

  async repoFacts(repo: string): Promise<RepoFacts | null> {
    this.calls.repoFacts++;
    this.limited();
    this.remaining--;
    return this.facts.get(repo.toLowerCase()) ?? null;
  }

  async languages(repo: string): Promise<Record<string, number> | null> {
    this.calls.languages++;
    this.limited();
    this.remaining--;
    return this.langs.get(repo.toLowerCase()) ?? null;
  }

  graphqlRateLimit() {
    return { remaining: this.graphqlRemaining, resetAtMs: 0 };
  }

  /** Answers the difficulty context query (server/difficulty.ts `contextQuery`) from `fileFacts`, by its variables. */
  async graphql(query: string, variables: Record<string, unknown>, timeoutMs = 2500): Promise<GraphqlResult> {
    this.calls.graphql++;
    this.graphqlAsked.push(variables);
    const paths = Object.keys(variables).filter((k) => /^p\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((k) => String(variables[k]));
    if (this.graphqlTrouble === 'down') throw new GithubError('graphql failed: 502', 502);
    if (this.graphqlTrouble === 'batch' && paths.length > 1) throw new GithubError('graphql failed: 502 (timeout)', 502);
    if (this.graphqlTrouble === 'slow') {
      await new Promise((done) => setTimeout(done, timeoutMs + 5));
      throw new Error('The operation was aborted due to timeout');
    }
    if (!/query\(/.test(query)) throw new GithubError('graphql failed: 400', 400);
    const repo = `${String(variables.owner)}/${String(variables.name)}`.toLowerCase();
    const oid = String(variables.oid);
    const user = (a: FakeAuthor) => (a.id === null ? null : { user: { databaseId: a.id, createdAt: a.createdAt ?? '2015-01-01T00:00:00Z' } });
    const commit: Record<string, unknown> = {};
    const errors: GraphqlResult['errors'] = [];
    paths.forEach((path, i) => {
      const f = this.fileFacts.get(`${repo}@${oid}:${path}`);
      if (!f) {
        commit[`h${i}`] = null;
        commit[`b${i}`] = null;
        errors.push({ message: `Could not resolve file for path '${path}'.`, path: ['repository', 'object', `b${i}`] });
        return;
      }
      commit[`h${i}`] = { totalCount: f.history.total, nodes: f.history.commits.map((c) => ({ authoredDate: c.date, author: user(c.author) })) };
      commit[`b${i}`] = { ranges: f.blame.map((r) => ({ startingLine: r.start, endingLine: r.end, commit: { authoredDate: r.date, author: user(r.author) } })) };
    });
    const cost = 1;
    this.graphqlRemaining -= cost;
    return { data: { rateLimit: { cost, remaining: this.graphqlRemaining }, repository: { object: commit } }, errors };
  }
}

/** Blame of a file of `lines` lines, `per` lines to a range, by `authors` in turn, dated `years` back in turn. */
export function blameOf(lines: number, authors: readonly FakeAuthor[], dates: readonly string[], per = 20): FakeFileFacts['blame'] {
  const out: FakeFileFacts['blame'] = [];
  for (let start = 1, i = 0; start <= lines; start += per, i++) {
    out.push({ start, end: Math.min(lines, start + per - 1), date: dates[i % dates.length]!, author: authors[i % authors.length]! });
  }
  return out;
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
