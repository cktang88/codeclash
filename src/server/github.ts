import { z } from 'zod';
import type { ChangedFile } from '../rules/classify.ts';

const API = 'https://api.github.com';
const USER_AGENT = 'pushfront';
const MAX_FILES = 300;
/** A stalled request must not wedge the poller, which polls one user at a time. */
export const REQUEST_TIMEOUT_MS = 20_000;

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
  }[];
  files: ChangedFile[];
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

export interface GithubClient {
  /** One page of a user's public events, newest first; the ETag applies to the first page only. */
  userEvents(login: string, etag: string | null, page?: number): Promise<EventsResult>;
  compare(repo: string, base: string, head: string): Promise<CompareResult | null>;
  commit(repo: string, sha: string): Promise<CompareResult | null>;
  rateLimit(): { remaining: number; resetAtMs: number };
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
    commit: z.object({ message: z.string() }).loose(),
    parents: z.array(z.object({ sha: z.string() }).loose()).optional().default([]),
  })
  .loose();

const CompareSchema = z
  .object({
    commits: z.array(CommitSchema).optional().default([]),
    files: z.array(FileSchema).optional().default([]),
  })
  .loose();

const SingleCommitSchema = CommitSchema.extend({ files: z.array(FileSchema).optional().default([]) });

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
  };
}

export function createGithubClient(token: string | null, fetchImpl: typeof fetch = fetch): GithubClient {
  const limit = { remaining: token ? 5000 : 60, resetAtMs: 0, total: token ? 5000 : 60 };

  const track = (res: Response) => {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    const total = res.headers.get('x-ratelimit-limit');
    if (remaining !== null && Number.isFinite(Number(remaining))) limit.remaining = Number(remaining);
    if (reset !== null && Number.isFinite(Number(reset))) limit.resetAtMs = Number(reset) * 1000;
    if (total !== null && Number(total) > 0) limit.total = Number(total);
  };

  const get = async (path: string, extra?: Record<string, string>): Promise<Response> => {
    const res = await fetchImpl(`${API}${path}`, { headers: headers(token, extra), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    track(res);
    return res;
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
      return { commits: body.commits.map(toCommit), files: toFiles(body.files) };
    },

    async commit(repo, sha) {
      const res = await get(`/repos/${repoPath(repo)}/commits/${encodeURIComponent(sha)}`);
      if (res.status === 404 || res.status === 422) return null;
      if (!res.ok) return fail(res, `commit ${repo}@${sha}`);
      const body = SingleCommitSchema.parse(await res.json());
      return { commits: [toCommit(body)], files: toFiles(body.files) };
    },

    rateLimit() {
      // Past the reset the quota is whole again, even if no response has said so yet:
      // a spent budget must not stop the poller (its only caller) from ever asking again.
      if (limit.resetAtMs > 0 && Date.now() >= limit.resetAtMs) return { remaining: Math.max(limit.remaining, limit.total), resetAtMs: limit.resetAtMs };
      return { remaining: limit.remaining, resetAtMs: limit.resetAtMs };
    },
  };
}

export async function fetchViewer(token: string, fetchImpl: typeof fetch = fetch): Promise<Viewer> {
  const res = await fetchImpl(`${API}/user`, { headers: headers(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new GithubError(`viewer lookup failed: ${res.status}`, res.status);
  return ViewerSchema.parse(await res.json());
}
