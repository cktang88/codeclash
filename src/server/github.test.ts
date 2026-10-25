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

  it('reports the pushing account and commit authors by id', async () => {
    const { fetch } = fakeFetch((url) =>
      url.includes('/events/')
        ? json([{ id: '5', type: 'PushEvent', created_at: '2026-10-23T10:00:00Z', actor: { id: 7, login: 'ana' }, repo: { name: 'ana/p' }, payload: { ref: 'refs/heads/main', before: 'a', head: 'b' } }])
        : json({ commits: [{ sha: 's1', author: { login: 'ana', id: 7 }, commit: { message: 'm' } }], files: [] }),
    );
    const gh = createGithubClient('tok', fetch);
    const res = await gh.userEvents('ana', null);
    expect(res.status === 200 && res.events[0]!.actorId).toBe(7);
    expect((await gh.compare('ana/p', 'a', 'b'))!.commits[0]!.authorId).toBe(7);
  });

  it('treats a spent rate limit as whole again once its reset time has passed', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const { fetch } = fakeFetch(() => json([], 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(past), 'x-ratelimit-limit': '5000' }));
    const gh = createGithubClient('tok', fetch);
    await gh.userEvents('ana', null);
    expect(gh.rateLimit().remaining).toBe(5000);
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

describe('request timeouts', () => {
  it('gives every GitHub request an abort signal so a stalled call cannot wedge the poller', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      return json([]);
    }) as typeof fetch;
    await createGithubClient('tok', impl).userEvents('ana', null);
    await fetchViewer('tok', (async (_u: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      return json({ id: 1, node_id: 'n', login: 'a', avatar_url: '', created_at: '2020-01-01T00:00:00Z', type: 'User' });
    }) as typeof fetch);
    expect(signals).toHaveLength(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });
});

describe('createGithubClient for the difficulty bonus', () => {
  it('tracks GraphQL’s rate-limit bucket apart from REST’s, and returns partial answers with their errors', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith('/graphql')
        ? json({ data: { repository: { object: { b0: null } } }, errors: [{ message: 'Could not resolve file', path: ['repository', 'object', 'b0'] }] }, 200, { 'x-ratelimit-resource': 'graphql', 'x-ratelimit-remaining': '4990', 'x-ratelimit-reset': '1800000000' })
        : json({ full_name: 'Up/Stream', fork: true, created_at: '2024-01-01T00:00:00Z', stargazers_count: 1, forks_count: 0, size: 2048, source: { full_name: 'big/stream', created_at: '2012-05-01T00:00:00Z', stargazers_count: 9000, forks_count: 800, default_branch: 'trunk' }, parent: { full_name: 'mid/stream', default_branch: 'dev' } }, 200, { 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': '1800000000' }),
    );
    const gh = createGithubClient('tok', fetch);
    const res = await gh.graphql!('query { x }', { p0: 'a.ts' });
    expect(res.errors).toEqual([{ message: 'Could not resolve file', path: ['repository', 'object', 'b0'] }]);
    expect(gh.graphqlRateLimit!().remaining).toBe(4990);
    expect(gh.rateLimit().remaining).toBe(5000);
    const facts = await gh.repoFacts!('up/stream');
    expect(facts).toEqual({ fullName: 'Up/Stream', fork: true, createdAt: Date.parse('2024-01-01T00:00:00Z'), stars: 1, forks: 0, sizeKb: 2048, source: { fullName: 'big/stream', createdAt: Date.parse('2012-05-01T00:00:00Z'), stars: 9000, forks: 800, defaultBranch: 'trunk' }, parent: { fullName: 'mid/stream', defaultBranch: 'dev' } });
    expect(gh.rateLimit().remaining).toBe(4000);
    expect(gh.graphqlRateLimit!().remaining).toBe(4990);
    expect(calls[0]!.url).toBe('https://api.github.com/graphql');
  });

  it('refuses GraphQL without a token', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await expect(createGithubClient(null, fetch).graphql!('query { x }', {})).rejects.toThrow(/token/);
    expect(calls).toHaveLength(0);
  });

  it('reads branch heads with an ETag, follows a rename, and reads a missing or private repository as 404', async () => {
    const redirected = (res: Response) => Object.defineProperty(res, 'redirected', { value: true });
    const { fetch, calls } = fakeFetch((url, init) => {
      const h = (init.headers ?? {}) as Record<string, string>;
      if (url.includes('/repos/ana/gone/')) return json({ message: 'Not Found' }, 404);
      if (url.includes('/repos/ana/old/branches')) return redirected(json([{ name: 'main', commit: { sha: 's9' } }], 200, { etag: '"r"' }));
      if (url.endsWith('/repos/ana/old')) return json({ full_name: 'ana/new', private: false, default_branch: 'main' });
      if (h['if-none-match'] === '"b1"') return new Response(null, { status: 304 });
      return json([{ name: 'main', commit: { sha: 's1' } }, { name: 'dev', commit: { sha: 's2' } }, { name: 'odd' }], 200, { etag: '"b1"' });
    });
    const gh = createGithubClient('tok', fetch);
    expect(await gh.branchHeads!('ana/p', null)).toEqual({ status: 200, repo: 'ana/p', etag: '"b1"', branches: [{ name: 'main', sha: 's1' }, { name: 'dev', sha: 's2' }] });
    expect(calls[0]!.url).toBe('https://api.github.com/repos/ana/p/branches?per_page=100');
    expect(await gh.branchHeads!('ana/p', '"b1"')).toEqual({ status: 304 });
    expect(await gh.branchHeads!('ana/gone', null)).toEqual({ status: 404 });
    expect(await gh.branchHeads!('ana/old', null)).toEqual({ status: 200, repo: 'ana/new', etag: '"r"', branches: [{ name: 'main', sha: 's9' }] });
    expect(gh.usage!()).toEqual({ requests: 5, notModified: 1 });
  });

  it('lists the token owner’s public repositories, most recently pushed first', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json([
        { full_name: 'ana/a', private: false, fork: false, pushed_at: '2026-10-23T10:00:00Z', default_branch: 'main' },
        { full_name: 'ana/b', private: false, visibility: 'internal', fork: true, pushed_at: null, default_branch: 'dev' },
      ]),
    );
    const gh = createGithubClient('tok', fetch);
    expect(await gh.viewerRepos!()).toEqual([
      { fullName: 'ana/a', private: false, fork: false, pushedAt: Date.parse('2026-10-23T10:00:00Z'), defaultBranch: 'main' },
      { fullName: 'ana/b', private: true, fork: true, pushedAt: 0, defaultBranch: 'dev' },
    ]);
    expect(calls[0]!.url).toBe('https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=20&visibility=public&affiliation=owner,collaborator');
  });

  it('never echoes a token in an error', async () => {
    const { fetch } = fakeFetch(() => new Response('bad token gho_abcdefghijklmnopqrstuvwxyz0123', { status: 500 }));
    await expect(createGithubClient('tok', fetch).compare('a/b', 'x', 'y')).rejects.toThrow('compare a/b failed: 500 bad token [redacted]');
  });
});
