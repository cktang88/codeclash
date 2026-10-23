import { describe, expect, it } from 'vitest';
import { createGithubClient, fetchViewer } from './github.ts';

type Route = (url: string, init: RequestInit) => Response;

function fakeFetch(route: Route): { fetch: typeof fetch; calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url, init ?? {});
  }) as typeof fetch;
  return { fetch: impl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('createGithubClient', () => {
  it('maps public push events and skips other event types', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json(
        [
          { id: '3', type: 'PushEvent', public: true, created_at: '2026-10-23T10:00:00Z', repo: { name: 'ana/parser' }, payload: { push_id: 99, ref: 'refs/heads/main', before: 'a', head: 'b' } },
          { id: '2', type: 'WatchEvent', public: true, created_at: '2026-10-23T09:00:00Z', repo: { name: 'x/y' }, payload: {} },
          { id: '1', type: 'PushEvent', public: true, created_at: '2026-10-23T08:00:00Z', repo: { name: 'ana/parser' }, payload: { ref: 'refs/heads/main' } },
        ],
        200,
        { etag: 'W/"abc"', 'x-poll-interval': '90', 'x-ratelimit-remaining': '4321', 'x-ratelimit-reset': '1800000000' },
      ),
    );
    const gh = createGithubClient('tok', fetch);
    const res = await gh.userEvents('ana', null);
    expect(res).toEqual({
      status: 200,
      etag: 'W/"abc"',
      pollInterval: 90,
      events: [{ id: '3', repo: 'ana/parser', createdAt: Date.parse('2026-10-23T10:00:00Z'), pushId: '99', ref: 'refs/heads/main', before: 'a', head: 'b' }],
    });
    expect(gh.rateLimit()).toEqual({ remaining: 4321, resetAtMs: 1800000000000 });
    expect(calls[0]!.url).toBe('https://api.github.com/users/ana/events/public?per_page=100');
    expect(calls[0]!.headers.authorization).toBe('Bearer tok');
  });

  it('sends the ETag and reports 304', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 304 }));
    const res = await createGithubClient('tok', fetch).userEvents('ana', 'W/"abc"');
    expect(res).toEqual({ status: 304 });
    expect(calls[0]!.headers['if-none-match']).toBe('W/"abc"');
  });

  it('reads compare commits and files, and returns null on 404', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.includes('missing')
        ? json({ message: 'Not Found' }, 404)
        : json({
            commits: [{ sha: 's1', author: { login: 'ana' }, commit: { message: 'Fix\n\nbody' } }, { sha: 's2', author: null, commit: { message: 'x' } }],
            files: [{ filename: 'a.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@\n+a' }, { filename: 'b.png', status: 'added', additions: 0, deletions: 0 }],
          }),
    );
    const gh = createGithubClient('tok', fetch);
    const res = await gh.compare('ana/parser', 'base', 'head');
    expect(res!.commits).toEqual([{ sha: 's1', authorLogin: 'ana', message: 'Fix\n\nbody' }, { sha: 's2', authorLogin: null, message: 'x' }]);
    expect(res!.files[1]).toEqual({ filename: 'b.png', status: 'added', additions: 0, deletions: 0, patch: null });
    expect(calls[0]!.url).toBe('https://api.github.com/repos/ana/parser/compare/base...head');
    expect(await gh.compare('ana/missing', 'a', 'b')).toBeNull();
  });

  it('reads a single commit and throws on server errors', async () => {
    const { fetch } = fakeFetch((url) =>
      url.endsWith('/boom') ? json({ message: 'oops' }, 502) : json({ sha: 'h', author: { login: 'ana' }, commit: { message: 'init' }, files: [] }),
    );
    const gh = createGithubClient(null, fetch);
    expect(await gh.commit('ana/parser', 'h')).toEqual({ commits: [{ sha: 'h', authorLogin: 'ana', message: 'init' }], files: [] });
    await expect(gh.commit('ana/parser', 'boom')).rejects.toThrow(/502/);
  });
});

describe('fetchViewer', () => {
  it('returns the signed-in account', async () => {
    const viewer = { id: 7, node_id: 'U_7', login: 'ana', avatar_url: 'https://x/a.png', created_at: '2020-01-01T00:00:00Z', type: 'User' };
    const { fetch } = fakeFetch(() => json({ ...viewer, name: 'Ana' }));
    expect(await fetchViewer('tok', fetch)).toEqual(viewer);
  });
});
