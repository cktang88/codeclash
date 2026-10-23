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
}

export interface CompareResult {
  commits: { sha: string; authorLogin: string | null; message: string }[];
  files: ChangedFile[];
}

export type EventsResult =
  | { status: 304 }
  | { status: 200; etag: string | null; pollInterval: number | null; events: PushEventLite[] };

export interface GithubClient {
  userEvents(login: string, etag: string | null): Promise<EventsResult>;
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
    author: z.object({ login: z.string() }).loose().nullable().optional(),
    commit: z.object({ message: z.string() }).loose(),
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
  return { sha: c.sha, authorLogin: c.author?.login ?? null, message: c.commit.message };
}

export function createGithubClient(token: string | null, fetchImpl: typeof fetch = fetch): GithubClient {
  const limit = { remaining: token ? 5000 : 60, resetAtMs: 0 };

  const track = (res: Response) => {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining !== null && Number.isFinite(Number(remaining))) limit.remaining = Number(remaining);
    if (reset !== null && Number.isFinite(Number(reset))) limit.resetAtMs = Number(reset) * 1000;
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
    async userEvents(login, etag) {
      const res = await get(`/users/${encodeURIComponent(login)}/events/public?per_page=100`, etag ? { 'if-none-match': etag } : {});
      if (res.status === 304) return { status: 304 };
      if (!res.ok) return fail(res, `events for ${login}`);
      const raw = z.array(z.unknown()).parse(await res.json());
      const events: PushEventLite[] = [];
      for (const item of raw) {
        const parsed = EventSchema.safeParse(item);
        if (!parsed.success) continue;
        const e = parsed.data;
        if (e.type !== 'PushEvent' || e.public === false || !e.payload) continue;
        const { ref, before, head, push_id } = e.payload;
        if (!ref || !before || !head) continue;
        events.push({ id: e.id, repo: e.repo.name, createdAt: Date.parse(e.created_at), pushId: String(push_id ?? e.id), ref, before, head });
      }
      const interval = Number(res.headers.get('x-poll-interval'));
      return { status: 200, etag: res.headers.get('etag'), pollInterval: Number.isFinite(interval) && interval > 0 ? interval : null, events };
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
      return { ...limit };
    },
  };
}

export async function fetchViewer(token: string, fetchImpl: typeof fetch = fetch): Promise<Viewer> {
  const res = await fetchImpl(`${API}/user`, { headers: headers(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new GithubError(`viewer lookup failed: ${res.status}`, res.status);
  return ViewerSchema.parse(await res.json());
}
