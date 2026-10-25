import { describe, expect, it } from 'vitest';
import { openDb, Store } from './db.ts';
import { DISCOVERY, Discovery } from './discovery.ts';
import { GithubPool, OWN_REST_FLOOR } from './githubPool.ts';
import { silentLogger } from './log.ts';
import { Poller, pushIdOf, type PushReport } from './poller.ts';
import { commitMeta, FakeGithub, pushEvent, sha, sourceFile } from './testing/fakeGithub.ts';
import { TokenVault } from './tokens.ts';
import { UpstreamWatcher } from './upstream.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 3_600_000;
const ANA = 7;
const BO = 8;
const TOKEN = 'gho_anaOwnToken0123456789abcdef';
const REPO = 'ana/parser';

/** Distinct, meaningful code lines. */
const calls = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `handleStep${from + i}(input, output);`);
const own = (n: number, message = `commit ${n}`) => ({ sha: sha(n), authorLogin: 'ana', authorId: ANA, message });

function setup(opts: { token?: boolean } = {}) {
  const store = new Store(openDb(':memory:'));
  const github = new FakeGithub();
  const vault = TokenVault.fromSecrets({ tokenKey: 'k'.repeat(40), sessionSecret: null });
  let now = NOW;
  const clock = () => now;
  for (const [id, login] of [[ANA, 'Ana'], [BO, 'Bo']] as const) {
    store.upsertUser({ id, nodeId: `U_${id}`, login, avatarUrl: '', createdAtGithub: 0, joinedAt: 0, bot: false });
  }
  store.insertRoom({ slug: 'room', name: 'Room', ownerId: ANA, visibility: 'public', invite: 'x', resetHour: 0, bots: 0, webhookUrl: null, createdAt: 0 });
  store.addMember(1, ANA, 'owner', 0);
  store.addMember(1, BO, 'member', 0);
  if (opts.token !== false) store.setToken(ANA, vault.seal(TOKEN, ANA), '', NOW);
  const pool = new GithubPool({ store, vault, server: github, create: (t) => github.as(t, 'Ana'), clock, log: silentLogger });
  const reports: PushReport[] = [];
  const onPush = (r: PushReport) => reports.push(r);
  const discovery = new Discovery({ store, pool, log: silentLogger, clock, onPush });
  const poller = new Poller({ store, github, log: silentLogger, clock, onPush, pool, onPushEvent: (u, repo, at) => discovery.noteEvent(u, repo, at) });
  github.addRepo(REPO, [commitMeta(sha(1), 'start', { authorId: ANA })]);
  github.userRepos.set('ana', [{ fullName: REPO, private: false, fork: false, pushedAt: NOW - HOUR, defaultBranch: 'main' }]);
  return { store, github, vault, pool, reports, discovery, poller, advance: (ms: number) => (now += ms), now: () => now };
}

/** Ana pushes `n` on top of `prev` to `branch`: the branch moves, and its compare and diff are known. */
function push(t: ReturnType<typeof setup>, prev: number, n: number, branch = 'main', lines = calls(n * 10, n * 10 + 6)) {
  t.github.pushTo(REPO, branch, [commitMeta(sha(n), `commit ${n}`, { authorId: ANA })]);
  t.github.setCompare(REPO, sha(prev), sha(n), { commits: [own(n)], files: [sourceFile(`src/f${n}.ts`, lines)], base: sha(prev) });
  t.github.setCommit(REPO, sha(n), { commits: [own(n)], files: [sourceFile(`src/f${n}.ts`, lines)], base: sha(prev) });
}

describe('per-player GitHub buckets', () => {
  it('polls each player on their own token, and those without one on the server’s', async () => {
    const t = setup();
    t.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), NOW - MINUTE));
    push(t, 1, 2);
    t.github.addEvent('Bo', pushEvent('200', 'bo/site', sha(8), sha(9), NOW - MINUTE));
    t.github.setCompare('bo/site', sha(8), sha(9), { commits: [{ sha: sha(9), authorLogin: 'bo', authorId: BO, message: 'Styles' }], files: [sourceFile('a.ts', calls(0, 5))] });
    await t.poller.tick();
    expect(t.reports.map((r) => r.userId).sort()).toEqual([ANA, BO]);
    // Ana: her events and her compare; Bo: his, on the server's bucket.
    expect(t.github.charged(TOKEN)).toBe(2);
    expect(t.github.charged(null)).toBe(2);
    expect(t.github.buckets.get(TOKEN)!.remaining).toBe(4998);
  });

  it('falls back to the server’s token when the player’s bucket runs low', async () => {
    const t = setup();
    t.github.as(TOKEN);
    t.github.buckets.get(TOKEN)!.remaining = OWN_REST_FLOOR - 1;
    await t.poller.pollUser(ANA);
    expect(t.github.charged(TOKEN)).toBe(0);
    expect(t.github.charged(null)).toBe(1);
  });

  it('a 401 invalidates the token, and the call is made again on the server’s', async () => {
    const t = setup();
    t.github.revoke(TOKEN);
    t.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), NOW - MINUTE));
    push(t, 1, 2);
    await t.poller.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
    expect(t.store.user(ANA)!.token).toMatchObject({ valid: false, invalidAt: NOW });
    expect(t.store.sealedToken(ANA)).toBeNull();
    expect(t.pool.own(ANA)).toBeNull();
    expect(t.github.charged(null)).toBe(2);
    // Never asked again.
    const before = t.github.requestsBy.get(TOKEN) ?? 0;
    await t.poller.pollUser(ANA);
    expect(t.github.requestsBy.get(TOKEN) ?? 0).toBe(before);
  });

  it('GraphQL and upstream checks run on the player’s own buckets too', async () => {
    const t = setup();
    const gh = t.pool.forUser(ANA)!;
    await gh.graphql!('query($x: Int) { viewer { contributionsCollection { x } } }', {});
    expect(t.github.buckets.get(TOKEN)!.graphqlRemaining).toBe(4999);
    expect(t.github.graphqlRemaining).toBe(5000);

    const watcher = new UpstreamWatcher({ store: t.store, github: t.github, clock: t.now, pool: t.pool, onReward: () => {} });
    t.github.remaining = 100; // the server's bucket is too low to check anything itself
    t.store.addUpstreamPending({
      userId: ANA, pushId: 'p', repo: 'ana/fork', upstream: 'up/lib', branch: 'main', ref: 'fix', head: sha(5), shas: [sha(5)],
      patchId: null, day: Math.floor(NOW / 86_400_000), at: NOW, bonusMilli: 1000, effortMilli: 0, nextCheckAt: NOW,
    });
    t.github.statuses.set(`up/lib:main...${sha(5)}`, 'behind');
    const before = t.github.charged(TOKEN);
    await watcher.run();
    expect(t.store.upstreamPendingOf(ANA)[0]!.status).toBe('upstream');
    expect(t.github.charged(TOKEN) - before).toBe(1);
  });
});

describe('discovery beyond the events feed', () => {
  it('finds a push before its PushEvent, and the PushEvent later counts nothing twice', async () => {
    const t = setup();
    await t.discovery.pollUser(ANA); // reads the sources and takes a baseline of the heads
    expect(t.reports).toHaveLength(0);
    expect(t.store.watchedRepos(ANA).map((w) => w.repo)).toEqual([REPO]);

    push(t, 1, 2);
    t.advance(2 * MINUTE);
    const run = await t.discovery.pollUser(ANA);
    expect(run.reports.map((r) => r.pushId)).toEqual([pushIdOf(REPO, sha(2))]);
    expect(t.reports[0]).toMatchObject({ userId: ANA, repo: REPO, commits: 1, message: 'commit 2' });

    // The delayed PushEvent: the same push id, so no compare is even asked for.
    const compares = t.github.calls.compare;
    t.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), NOW));
    await t.poller.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
    expect(t.github.calls.compare).toBe(compares);

    // Two pushes between discovery polls: found as one; their two PushEvents then find their commits seen.
    push(t, 2, 3);
    t.github.pushTo(REPO, 'main', [commitMeta(sha(4), 'commit 4', { authorId: ANA })]);
    t.github.setCompare(REPO, sha(2), sha(4), { commits: [own(3), own(4)], files: [sourceFile('src/f3.ts', calls(30, 36)), sourceFile('src/f4.ts', calls(40, 46))], base: sha(2) });
    t.github.setCompare(REPO, sha(3), sha(4), { commits: [own(4)], files: [sourceFile('src/f4.ts', calls(40, 46))], base: sha(3) });
    t.advance(2 * MINUTE);
    await t.discovery.pollUser(ANA);
    expect(t.reports.map((r) => r.commits)).toEqual([1, 2]);
    t.github.addEvent('Ana', pushEvent('101', REPO, sha(2), sha(3), NOW));
    t.github.addEvent('Ana', pushEvent('102', REPO, sha(3), sha(4), NOW));
    await t.poller.pollUser(ANA);
    expect(t.reports).toHaveLength(2);
    // All of it on Ana's own token.
    expect(t.github.charged(null)).toBe(0);
  });

  it('a force-push is read from the merge base and counts only commits not yet seen', async () => {
    const t = setup();
    await t.discovery.pollUser(ANA);
    push(t, 1, 2);
    await t.discovery.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
    // Rewritten: sha(2) kept, sha(5) new, on a history where sha(2)'s old head is no ancestor.
    t.github.setBranch(REPO, 'main', [commitMeta(sha(5), 'rewrite', { authorId: ANA }), commitMeta(sha(1), 'start', { authorId: ANA })]);
    t.github.setCompare(REPO, sha(2), sha(5), { commits: [own(2), own(5, 'rewrite')], files: [sourceFile('src/f2.ts', calls(20, 26)), sourceFile('src/f5.ts', calls(50, 54))], base: sha(1) });
    t.github.setCommit(REPO, sha(5), { commits: [own(5, 'rewrite')], files: [sourceFile('src/f5.ts', calls(50, 54))], base: sha(1) });
    await t.discovery.pollUser(ANA);
    expect(t.reports).toHaveLength(2);
    expect(t.reports[1]).toMatchObject({ pushId: pushIdOf(REPO, sha(5)), commits: 1, message: 'rewrite' });
    // Measured alone (the range also held a commit already counted): sha(2)'s lines are not credited again.
    expect(t.github.calls.commit).toBeGreaterThan(0);
    expect(t.reports[1]!.files).toBe(1);
  });

  it('a new branch is read from its merge base with the default branch; a deleted one is forgotten', async () => {
    const t = setup();
    await t.discovery.pollUser(ANA);
    t.github.pushTo(REPO, 'feature', [commitMeta(sha(6), 'feature work', { authorId: ANA }), commitMeta(sha(1), 'start', { authorId: ANA })]);
    t.github.setCompare(REPO, sha(1), sha(6), { commits: [own(6, 'feature work')], files: [sourceFile('src/feat.ts', calls(60, 65))], base: sha(1) });
    await t.discovery.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
    expect(t.reports[0]).toMatchObject({ pushId: pushIdOf(REPO, sha(6)), message: 'feature work' });
    expect(t.store.watchedRepos(ANA)[0]!.heads).toEqual({ feature: sha(6), main: sha(1) });

    t.github.setBranch(REPO, 'feature', null);
    await t.discovery.pollUser(ANA);
    expect(t.store.watchedRepos(ANA)[0]!.heads).toEqual({ main: sha(1) });
    expect(t.reports).toHaveLength(1);
  });

  it('skips private repositories, drops one made private, and follows a rename', async () => {
    const t = setup();
    t.github.addRepo('ana/secret', [commitMeta(sha(1), 'x')], { private: true });
    t.github.addRepo('ana/hidden', [commitMeta(sha(1), 'x')], { private: true });
    t.github.userRepos.set('ana', [
      { fullName: REPO, private: false, fork: false, pushedAt: NOW - HOUR, defaultBranch: 'main' },
      { fullName: 'ana/secret', private: true, fork: false, pushedAt: NOW, defaultBranch: 'main' },
    ]);
    t.github.contributions.set('ana', [
      { repo: 'ana/hidden', isPrivate: true, occurredAt: '2026-10-23T00:00:00Z' },
      { repo: 'ana/lib-fork', isFork: true, occurredAt: '2026-10-22T00:00:00Z' },
    ]);
    t.github.addRepo('ana/lib-fork', [commitMeta(sha(1), 'x')]);
    await t.discovery.pollUser(ANA);
    expect(t.store.watchedRepos(ANA).map((w) => w.repo).sort()).toEqual(['ana/lib-fork', REPO]);

    // Made private: GitHub answers 404 to a token with no scopes, and the repository is dropped.
    t.github.repos.get('ana/lib-fork')!.private = true;
    // Renamed: GitHub redirects, and the new name is watched from then on.
    t.github.addRepo('ana/lexer', [commitMeta(sha(1), 'start', { authorId: ANA })]);
    t.github.renames.set(REPO, 'ana/lexer');
    await t.discovery.pollUser(ANA);
    expect(t.store.watchedRepos(ANA).map((w) => w.repo)).toEqual(['ana/lexer']);
    expect(t.discovery.stats.dropped).toBe(1);
    // A token granted private access is never used to look around.
    t.store.setToken(ANA, t.vault.seal(TOKEN, ANA), 'repo', NOW);
    const calls = t.github.calls.branchHeads;
    await t.discovery.pollUser(ANA);
    expect(t.github.calls.branchHeads).toBe(calls);
  });

  it('without a token of the player’s own there is no discovery: only the events feed', async () => {
    const t = setup({ token: false });
    const run = await t.discovery.pollUser(ANA);
    expect(run.charged).toBe(0);
    expect(t.github.calls.branchHeads + t.github.calls.viewerRepos + t.github.calls.contributions).toBe(0);
    // Its PushEvents are not even noted for later.
    t.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), NOW));
    push(t, 1, 2);
    await t.poller.pollUser(ANA);
    expect(t.store.watchedRepos(ANA)).toEqual([]);
  });

  it('polls faster while the player is at work, and costs at most its hourly bound', async () => {
    const t = setup();
    expect(t.discovery.intervalFor(NOW - 10 * MINUTE, NOW)).toBe(DISCOVERY.activeMs);
    expect(t.discovery.intervalFor(NOW - 5 * HOUR, NOW)).toBe(DISCOVERY.warmMs);
    expect(t.discovery.intervalFor(null, NOW)).toBe(DISCOVERY.idleMs);

    // Twelve busy repositories where others push all the time: every poll reads every list and compares every move.
    const repos = Array.from({ length: 12 }, (_, i) => `team/r${i}`);
    for (const r of repos) t.github.addRepo(r, [commitMeta(sha(1), 'start')]);
    t.github.userRepos.set('ana', repos.map((r, i) => ({ fullName: r, private: false, fork: false, pushedAt: NOW - i * MINUTE, defaultBranch: 'main' })));
    t.store.notePushedAt(ANA, NOW);
    let n = 100;
    const hourStart = Math.floor(NOW / HOUR) * HOUR;
    const charged = () => t.github.charged(TOKEN);
    for (let at = NOW; at < hourStart + HOUR; at += DISCOVERY.activeMs) {
      for (const r of repos) {
        const prev = t.github.histories.get(`${r}#main`)![0]!.sha;
        const next = sha(n++);
        t.github.pushTo(r, 'main', [commitMeta(next, 'theirs', { authorId: 99 })]);
        t.github.setCompare(r, prev, next, { commits: [{ sha: next, authorLogin: 'zed', authorId: 99, message: 'theirs' }], files: [sourceFile('a.ts', calls(0, 3))] });
      }
      await t.discovery.tick();
      t.advance(DISCOVERY.activeMs);
    }
    expect(t.store.watchedRepos(ANA)).toHaveLength(DISCOVERY.maxRepos);
    // A move already being read finishes: at most one compare (and a few reads) past the bound.
    expect(charged()).toBeGreaterThan(DISCOVERY.maxChargedPerHour - 20);
    expect(charged()).toBeLessThanOrEqual(DISCOVERY.maxChargedPerHour + 25);
    expect(t.discovery.stats.capped).toBeGreaterThan(0);
    expect(t.reports).toHaveLength(0);
    expect(t.github.charged(null)).toBe(0);
    // The next hour it reads again.
    const before = charged();
    t.advance(HOUR);
    await t.discovery.pollUser(ANA);
    expect(charged()).toBeGreaterThan(before);
  });

  it('a push found before the day’s reset is not counted again when its PushEvent arrives after it', async () => {
    const t = setup();
    t.advance(Date.parse('2026-10-23T23:50:00Z') - NOW);
    await t.discovery.pollUser(ANA);
    push(t, 1, 2);
    t.advance(8 * MINUTE);
    await t.discovery.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
    t.advance(10 * MINUTE); // the UTC day (and a room's 00:00 reset) has passed
    t.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), t.now() - 15 * MINUTE));
    await t.poller.pollUser(ANA);
    expect(t.reports).toHaveLength(1);
  });

  it('records exactly the report the PushEvent would have: determinism is unaffected', async () => {
    const viaEvents = setup();
    push(viaEvents, 1, 2);
    viaEvents.github.addEvent('Ana', pushEvent('100', REPO, sha(1), sha(2), NOW));
    await viaEvents.poller.pollUser(ANA);

    const viaDiscovery = setup();
    await viaDiscovery.discovery.pollUser(ANA);
    push(viaDiscovery, 1, 2);
    await viaDiscovery.discovery.pollUser(ANA);

    expect(viaDiscovery.reports).toHaveLength(1);
    // The same push input (only its time differs: when it was found, not GitHub's event time).
    expect({ ...viaDiscovery.reports[0], at: 0 }).toEqual({ ...viaEvents.reports[0], at: 0 });
  });
});
