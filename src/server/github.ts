import { z } from 'zod';
import type { ChangedFile } from '../rules/classify.ts';
import type { RepoFacts } from '../rules/difficulty.ts';

const API = 'https://api.github.com';
const USER_AGENT = 'pushfront';
/** Files read from one diff, as ingestion reads them; GitHub itself omits the patch of any very large file. */
export const MAX_FILES = 300;
/** A stalled request must not wedge the poller, which polls one user at a time. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** A GraphQL query for a push's context must answer within the push's latency budget (1–3 s). */
export const GRAPHQL_TIMEOUT_MS = 2_500;

export interface PushEventLite {
  id: string;
  repo: string;
  createdAt: number;
  pushId: string;
  ref: string;
  before: string;
  head: string;
  /** The account that pushed. A login can change hands; this id cannot. */
  actorId?: number;
}

export interface CompareResult {
  commits: {
    sha: string;
    authorLogin: string | null;
    /** The linked author's account id, which survives renames. */
    authorId?: number | null;
    message: string;
    /** More than one parent: a merge. */
    merge?: boolean;
    /** The commit's author email, as git recorded it: it names the pusher in a local mirror's blame. */
    authorEmail?: string | null;
  }[];
  files: ChangedFile[];
  /** The commit the files' old side is: a compare's merge base, a single commit's first parent. */
  base?: string | null;
}

export type EventsResult =
  | { status: 304 }
  | {
      status: 200;
      etag: string | null;
      pollInterval: number | null;
      events: PushEventLite[];
      /** Set when the page was full, so older events may follow on the next page: the page's oldest event of any type. */
      more?: { id: string; createdAt: number };
    };

/** Events per page, and pages GitHub serves at most (300 events). */
export const EVENTS_PER_PAGE = 100;
export const EVENT_PAGES = 3;

/** A repository as the army preview needs it. */
export interface RepoInfo {
  /** `owner/name` as GitHub spells it. */
  fullName: string;
  /** True for private and internal repositories: the preview refuses both. */
  private: boolean;
  defaultBranch: string;
}

/** One commit of a branch's history, as the commit list gives it. */
export interface CommitMeta {
  sha: string;
  message: string;
  authorLogin: string | null;
  /** The commit's own author name, for commits GitHub links to no account. */
  authorName: string | null;
  avatarUrl: string | null;
  /** ISO date the commit was authored. */
  date: string | null;
  merge: boolean;
  /** The linked author's account id, when GitHub links one. */
  authorId?: number | null;
  /** The first parent's sha: the base its diff is read against. */
  parent?: string | null;
}

/** A GraphQL answer: its data, and the errors GitHub reported beside it (a partial answer has both). */
export interface GraphqlResult {
  data: unknown;
  errors: { message: string; path?: (string | number)[] }[];
}

export interface GithubClient {
  /** One page of a user's public events, newest first; the ETag applies to the first page only. */
  userEvents(login: string, etag: string | null, page?: number): Promise<EventsResult>;
  compare(repo: string, base: string, head: string): Promise<CompareResult | null>;
  commit(repo: string, sha: string): Promise<CompareResult | null>;
  /** A repository, or null when it does not exist (or the token cannot see it). */
  repo(repo: string): Promise<RepoInfo | null>;
  /** Branch names, up to `limit`; null when the repository is missing. */
  branches(repo: string, limit: number): Promise<string[] | null>;
  /** The newest `limit` commits reachable from `ref`, newest first; null when the repository or ref is missing, [] when the repository is empty. */
  commits(repo: string, ref: string, limit: number): Promise<CommitMeta[] | null>;
  rateLimit(): { remaining: number; resetAtMs: number };
  /**
   * A GraphQL query (needs a token). Throws on a transport failure, a timeout or a non-200 answer;
   * a partial answer comes back with its errors.
   */
  graphql?(query: string, variables: Record<string, unknown>, timeoutMs?: number): Promise<GraphqlResult>;
  /** GraphQL's own rate-limit bucket (points per hour), tracked apart from REST's. */
  graphqlRateLimit?(): { remaining: number; resetAtMs: number };
  /** What the difficulty bonus needs about a repository (fork, source, age, stars, forks, size); null when missing. */
  repoFacts?(repo: string): Promise<RepoFacts | null>;
  /** Bytes per language; null when missing. */
  languages?(repo: string): Promise<Record<string, number> | null>;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

const EventSchema = z
  .object({
    id: z.string(),
    type: z.string().nullable().optional(),
    public: z.boolean().optional(),
    created_at: z.string(),
    actor: z.object({ id: z.number().int() }).loose().nullable().optional(),
    repo: z.object({ name: z.string() }).loose(),
    payload: z
      .object({
        push_id: z.union([z.number(), z.string()]).optional(),
        ref: z.string().nullable().optional(),
        before: z.string().nullable().optional(),
        head: z.string().nullable().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const FileSchema = z
  .object({
    filename: z.string(),
    status: z.string().optional().default('modified'),
    additions: z.number().optional().default(0),
    deletions: z.number().optional().default(0),
    patch: z.string().nullable().optional(),
  })
  .loose();

const CommitSchema = z
  .object({
    sha: z.string(),
    author: z.object({ login: z.string(), id: z.number().int().optional() }).loose().nullable().optional(),
    commit: z.object({ message: z.string(), author: z.object({ email: z.string().nullable().optional() }).loose().nullable().optional() }).loose(),
    parents: z.array(z.object({ sha: z.string() }).loose()).optional().default([]),
  })
  .loose();

const CompareSchema = z
  .object({
    commits: z.array(CommitSchema).optional().default([]),
    files: z.array(FileSchema).optional().default([]),
    merge_base_commit: z.object({ sha: z.string() }).loose().nullable().optional(),
  })
  .loose();

const SourceSchema = z
  .object({
    full_name: z.string(),
    created_at: z.string().nullable().optional(),
    stargazers_count: z.number().optional().default(0),
    forks_count: z.number().optional().default(0),
  })
  .loose();

const RepoFactsSchema = z
  .object({
    full_name: z.string(),
    fork: z.boolean().optional().default(false),
    created_at: z.string().nullable().optional(),
    stargazers_count: z.number().optional().default(0),
    forks_count: z.number().optional().default(0),
    size: z.number().optional().default(0),
    source: SourceSchema.nullable().optional(),
  })
  .loose();

const GraphqlSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z.array(z.object({ message: z.string(), path: z.array(z.union([z.string(), z.number()])).optional() }).loose()).optional(),
  })
  .loose();

const SingleCommitSchema = CommitSchema.extend({ files: z.array(FileSchema).optional().default([]) });

const RepoSchema = z
  .object({
    full_name: z.string(),
    private: z.boolean().optional().default(false),
    visibility: z.string().optional(),
    default_branch: z.string().nullable().optional(),
  })
  .loose();

const BranchSchema = z.object({ name: z.string() }).loose();

const ListedCommitSchema = z
  .object({
    sha: z.string(),
    author: z.object({ login: z.string(), avatar_url: z.string().optional(), id: z.number().int().optional() }).loose().nullable().optional(),
    commit: z
      .object({
        message: z.string(),
        author: z.object({ name: z.string().optional(), date: z.string().optional() }).loose().nullable().optional(),
      })
      .loose(),
    parents: z.array(z.object({ sha: z.string() }).loose()).optional().default([]),
  })
  .loose();

const ViewerSchema = z.object({
  id: z.number().int(),
  node_id: z.string(),
  login: z.string(),
  avatar_url: z.string(),
  created_at: z.string(),
  type: z.string(),
});

export type Viewer = z.infer<typeof ViewerSchema>;

function headers(token: string | null, extra: Record<string, string> = {}): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': USER_AGENT,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function repoPath(repo: string): string {
  return repo.split('/').map(encodeURIComponent).join('/');
}

function toFiles(files: z.infer<typeof FileSchema>[]): ChangedFile[] {
  return files.slice(0, MAX_FILES).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
  }));
}

function toCommit(c: z.infer<typeof CommitSchema>): CompareResult['commits'][number] {
  return {
    sha: c.sha,
    authorLogin: c.author?.login ?? null,
    ...(c.author?.id !== undefined ? { authorId: c.author.id } : {}),
    message: c.commit.message,
    ...(c.parents.length > 1 ? { merge: true } : {}),
    ...(c.commit.author?.email ? { authorEmail: c.commit.author.email } : {}),
  };
}

const parseDate = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export function createGithubClient(token: string | null, fetchImpl: typeof fetch = fetch): GithubClient {
  const limit = { remaining: token ? 5000 : 60, resetAtMs: 0, total: token ? 5000 : 60 };
  // GraphQL has its own bucket (points, not requests); without a token it is closed.
  const gql = { remaining: token ? 5000 : 0, resetAtMs: 0, total: token ? 5000 : 0 };

  const track = (res: Response) => {
    // Each answer says which bucket it was charged to: REST's core, GraphQL's, or another (search, …).
    const resource = res.headers.get('x-ratelimit-resource');
    const bucket = resource === 'graphql' ? gql : resource === null || resource === 'core' ? limit : null;
    if (!bucket) return;
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    const total = res.headers.get('x-ratelimit-limit');
    if (remaining !== null && Number.isFinite(Number(remaining))) bucket.remaining = Number(remaining);
    if (reset !== null && Number.isFinite(Number(reset))) bucket.resetAtMs = Number(reset) * 1000;
    if (total !== null && Number(total) > 0) bucket.total = Number(total);
  };
  const whole = (b: { remaining: number; resetAtMs: number; total: number }) =>
    b.resetAtMs > 0 && Date.now() >= b.resetAtMs ? { remaining: Math.max(b.remaining, b.total), resetAtMs: b.resetAtMs } : { remaining: b.remaining, resetAtMs: b.resetAtMs };

  const get = async (path: string, extra?: Record<string, string>): Promise<Response> => {
    const res = await fetchImpl(`${API}${path}`, { headers: headers(token, extra), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    track(res);
    return res;
  };

  // Conditional requests for the preview's lookups: an unchanged answer is a 304, which GitHub
  // does not count against the rate limit. Bounded, oldest first out.
  const etags = new Map<string, { etag: string; body: unknown }>();
  const getJson = async (path: string): Promise<{ status: number; body: unknown; res: Response }> => {
    const known = etags.get(path);
    const res = await get(path, known ? { 'if-none-match': known.etag } : {});
    if (res.status === 304 && known) return { status: 200, body: known.body, res };
    if (!res.ok) return { status: res.status, body: null, res };
    const body: unknown = await res.json();
    const etag = res.headers.get('etag');
    if (etag) {
      etags.delete(path);
      if (etags.size >= 500) etags.delete(etags.keys().next().value!);
      etags.set(path, { etag, body });
    }
    return { status: 200, body, res };
  };

  const fail = async (res: Response, what: string): Promise<never> => {
    const body = await res.text().catch(() => '');
    throw new GithubError(`${what} failed: ${res.status} ${body.slice(0, 200)}`, res.status);
  };

  return {
    async userEvents(login, etag, page = 1) {
      const query = page > 1 ? `per_page=${EVENTS_PER_PAGE}&page=${page}` : `per_page=${EVENTS_PER_PAGE}`;
      const res = await get(`/users/${encodeURIComponent(login)}/events/public?${query}`, etag && page === 1 ? { 'if-none-match': etag } : {});
      if (res.status === 304) return { status: 304 };
      if (!res.ok) return fail(res, `events for ${login}`);
      const raw = z.array(z.unknown()).parse(await res.json());
      const events: PushEventLite[] = [];
      let oldest: { id: string; createdAt: number } | null = null;
      for (const item of raw) {
        const parsed = EventSchema.safeParse(item);
        if (!parsed.success) continue;
        const e = parsed.data;
        oldest = { id: e.id, createdAt: Date.parse(e.created_at) };
        if (e.type !== 'PushEvent' || e.public === false || !e.payload) continue;
        const { ref, before, head, push_id } = e.payload;
        if (!ref || !before || !head) continue;
        events.push({ id: e.id, repo: e.repo.name, createdAt: Date.parse(e.created_at), pushId: String(push_id ?? e.id), ref, before, head, ...(e.actor ? { actorId: e.actor.id } : {}) });
      }
      const interval = Number(res.headers.get('x-poll-interval'));
      return {
        status: 200,
        etag: res.headers.get('etag'),
        pollInterval: Number.isFinite(interval) && interval > 0 ? interval : null,
        events,
        ...(raw.length >= EVENTS_PER_PAGE && oldest ? { more: oldest } : {}),
      };
    },

    async compare(repo, base, head) {
      const res = await get(`/repos/${repoPath(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
      if (res.status === 404 || res.status === 422) return null;
      if (!res.ok) return fail(res, `compare ${repo}`);
      const body = CompareSchema.parse(await res.json());
      return { commits: body.commits.map(toCommit), files: toFiles(body.files), base: body.merge_base_commit?.sha ?? base };
    },

    async commit(repo, sha) {
      const res = await get(`/repos/${repoPath(repo)}/commits/${encodeURIComponent(sha)}`);
      if (res.status === 404 || res.status === 422) return null;
      if (!res.ok) return fail(res, `commit ${repo}@${sha}`);
      const body = SingleCommitSchema.parse(await res.json());
      return { commits: [toCommit(body)], files: toFiles(body.files), base: body.parents[0]?.sha ?? null };
    },

    async repo(repo) {
      const r = await getJson(`/repos/${repoPath(repo)}`);
      if (r.status === 404 || r.status === 451) return null;
      if (r.status !== 200) return fail(r.res, `repo ${repo}`);
      const body = RepoSchema.parse(r.body);
      return { fullName: body.full_name, private: body.private || (body.visibility !== undefined && body.visibility !== 'public'), defaultBranch: body.default_branch ?? 'main' };
    },

    async branches(repo, limit) {
      const r = await getJson(`/repos/${repoPath(repo)}/branches?per_page=${Math.max(1, Math.min(100, limit))}`);
      if (r.status === 404) return null;
      if (r.status !== 200) return fail(r.res, `branches of ${repo}`);
      return z.array(z.unknown()).parse(r.body).flatMap((b) => {
        const parsed = BranchSchema.safeParse(b);
        return parsed.success ? [parsed.data.name] : [];
      });
    },

    async commits(repo, ref, limit) {
      const r = await getJson(`/repos/${repoPath(repo)}/commits?sha=${encodeURIComponent(ref)}&per_page=${Math.max(1, Math.min(100, limit))}`);
      // 409: the repository has no commits yet.
      if (r.status === 409) return [];
      if (r.status === 404 || r.status === 422) return null;
      if (r.status !== 200) return fail(r.res, `commits of ${repo}@${ref}`);
      return z.array(z.unknown()).parse(r.body).flatMap((c) => {
        const parsed = ListedCommitSchema.safeParse(c);
        if (!parsed.success) return [];
        const d = parsed.data;
        return [{
          sha: d.sha,
          message: d.commit.message,
          authorLogin: d.author?.login ?? null,
          authorName: d.commit.author?.name ?? null,
          avatarUrl: d.author?.avatar_url ?? null,
          date: d.commit.author?.date ?? null,
          merge: d.parents.length > 1,
          authorId: d.author?.id ?? null,
          parent: d.parents[0]?.sha ?? null,
        }];
      });
    },

    rateLimit() {
      // Past the reset the quota is whole again, even if no response has said so yet:
      // a spent budget must not stop the poller (its only caller) from ever asking again.
      return whole(limit);
    },

    graphqlRateLimit() {
      return whole(gql);
    },

    async graphql(query, variables, timeoutMs = GRAPHQL_TIMEOUT_MS) {
      if (!token) throw new GithubError('GraphQL needs a token', 401);
      const res = await fetchImpl(`${API}/graphql`, {
        method: 'POST',
        headers: headers(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      track(res);
      if (!res.ok) return fail(res, 'graphql');
      const body = GraphqlSchema.parse(await res.json());
      return { data: body.data ?? null, errors: (body.errors ?? []).map((e) => ({ message: e.message, ...(e.path ? { path: e.path } : {}) })) };
    },

    async repoFacts(repo) {
      // The same path as `repo()`: its ETag is shared, so an unchanged repository is a free 304.
      const r = await getJson(`/repos/${repoPath(repo)}`);
      if (r.status === 404 || r.status === 451) return null;
      if (r.status !== 200) return fail(r.res, `repo ${repo}`);
      const b = RepoFactsSchema.parse(r.body);
      const source = b.fork && b.source ? { fullName: b.source.full_name, createdAt: parseDate(b.source.created_at), stars: b.source.stargazers_count, forks: b.source.forks_count } : null;
      return { fullName: b.full_name, fork: b.fork, createdAt: parseDate(b.created_at), stars: b.stargazers_count, forks: b.forks_count, sizeKb: b.size, source };
    },

    async languages(repo) {
      const r = await getJson(`/repos/${repoPath(repo)}/languages`);
      if (r.status === 404 || r.status === 451) return null;
      if (r.status !== 200) return fail(r.res, `languages of ${repo}`);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(z.record(z.string(), z.unknown()).parse(r.body))) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      return out;
    },
  };
}

export async function fetchViewer(token: string, fetchImpl: typeof fetch = fetch): Promise<Viewer> {
  const res = await fetchImpl(`${API}/user`, { headers: headers(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new GithubError(`viewer lookup failed: ${res.status}`, res.status);
  return ViewerSchema.parse(await res.json());
}
