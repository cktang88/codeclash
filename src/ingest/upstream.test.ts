import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAllGrammars } from '../measure/complexity.ts';
import { UPSTREAM_PER_DAY, upstreamReward } from '../measure/difficulty.ts';
import { openDb, Store } from './store.ts';
import { DifficultyContext } from './difficulty.ts';
import { registerHooks, signatureOf } from './hooks.ts';
import { silentLogger } from './log.ts';
import { ingestPush, type PushReport } from './poller.ts';
import { commitMeta, FakeGithub } from './testing/fakeGithub.ts';
import { FIXTURE_NOW, FORK_REPO, installViteDay, installViteFork, MAINTAINER, VITE_BASE, VITE_DAY_HEAD, VITE_REPO } from './testing/difficultyFixtures.ts';
import { firstCheckAt, GIVE_UP_MS, patchId, UPSTREAM_RESERVE, UpstreamWatcher, type UpstreamRewardEvent } from './upstream.ts';

beforeAll(() => loadAllGrammars());

const DAY = 86_400_000;
const BRANCH = 'fix-sourcemap';

function setup() {
  const github = new FakeGithub();
  const store = new Store(openDb(':memory:'));
  store.upsertUser({ id: MAINTAINER.id, nodeId: 'U', login: MAINTAINER.login, avatarUrl: '', createdAtGithub: 0, joinedAt: 0, bot: false });
  const clock = { now: FIXTURE_NOW };
  const now = () => clock.now;
  const context = new DifficultyContext({ github, clock: now, timeoutMs: 50 });
  const reports: PushReport[] = [];
  const rewards: UpstreamRewardEvent[] = [];
  const watcher = new UpstreamWatcher({ store, github, clock: now, onReward: (r) => rewards.push(r) });
  const ingest = (repo: string, before: string, head: string, ref = `refs/heads/${BRANCH}`) =>
    ingestPush({ store, github, clock: now, onPush: (r) => reports.push(r), context }, store.user(MAINTAINER.id)!, { repo, ref, before, head, at: clock.now });
  return { github, store, clock, reports, rewards, watcher, ingest };
}

/** What the same commit earns pushed straight to vitejs/vite: the bonus a fork's commit is owed once it is upstream. */
async function directBonus(): Promise<number> {
  const t = setup();
  installViteDay(t.github);
  const r = await t.ingest(VITE_REPO, VITE_BASE, VITE_DAY_HEAD, 'refs/heads/main');
  return r!.bonus ?? 0;
}

const pushDay = Math.floor(FIXTURE_NOW / DAY);
const nextDay = (pushDay + 1) * DAY;

describe('a fork’s difficulty bonus waits for the upstream', () => {
  it('a fork push pays plain code credit and no bonus, and freezes what it is owed', async () => {
    const owed = await directBonus();
    expect(owed).toBeGreaterThan(300);
    const t = setup();
    installViteFork(t.github);
    const r = await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    expect(r).not.toBeNull();
    expect(r!.bonus ?? 0).toBe(0);
    expect(r!.lines[0]).toBe(10);
    const rows = t.store.upstreamPendingOf(MAINTAINER.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ repo: FORK_REPO, upstream: VITE_REPO, branch: 'main', ref: BRANCH, head: VITE_DAY_HEAD, shas: [VITE_DAY_HEAD], day: pushDay, status: 'pending' });
    expect(rows[0]!.nextCheckAt).toBeGreaterThanOrEqual(nextDay);
    // Found upstream, the day would be credited exactly what the direct push earned.
    expect(upstreamReward(t.store.upstreamDay(MAINTAINER.id, pushDay), rows, 0)).toBe(owed);
  });

  it('the upstream discovery credits it exactly once, after the push’s day has closed', async () => {
    const owed = await directBonus();
    const t = setup();
    installViteFork(t.github);
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    // Merged the same day (a fast-forward or merge commit: the head is in main).
    t.github.statuses.set(`${VITE_REPO.toLowerCase()}:main...${VITE_DAY_HEAD}`, 'behind');
    // Before the day closes nothing is due.
    await t.watcher.run();
    expect(t.github.calls.compareStatus).toBe(0);
    // A webhook's merged pull request wakes the row: found now, credited only once the day closes.
    await t.watcher.wake(MAINTAINER.id, VITE_REPO);
    expect(t.github.calls.compareStatus).toBe(1);
    expect(t.store.upstreamPendingOf(MAINTAINER.id)[0]!.status).toBe('upstream');
    expect(t.rewards).toHaveLength(0);
    t.clock.now = nextDay + 3 * 3_600_000;
    await t.watcher.run();
    expect(t.rewards).toEqual([{ userId: MAINTAINER.id, repo: FORK_REPO, upstream: VITE_REPO, day: pushDay, bonus: owed }]);
    // Never again: further runs, days and wakes credit nothing and ask nothing.
    for (let d = 0; d < 3; d++) {
      t.clock.now += DAY;
      await t.watcher.run();
      await t.watcher.wake(MAINTAINER.id, VITE_REPO);
    }
    expect(t.rewards).toHaveLength(1);
    expect(t.github.calls.compareStatus).toBe(1);
    expect(t.store.upstreamDay(MAINTAINER.id, pushDay).credited).toBe(owed);
  });

  it('finds a squash merge by patch id, and a rebase merge by the pull request’s commits', async () => {
    const owed = await directBonus();
    for (const how of ['squash', 'rebase', 'other-squash'] as const) {
      const t = setup();
      const fork = installViteFork(t.github);
      await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
      const merge = 'f0'.repeat(20);
      t.github.pulls.set(`${VITE_REPO.toLowerCase()}#mara:${BRANCH}`, [{ number: 7, mergedAt: FIXTURE_NOW + DAY, mergeSha: merge, base: 'main', headSha: 'e1'.repeat(20) }]);
      // The pull request's own commits: rewritten before the merge (squash), or the pushed commit itself (rebase).
      t.github.prCommits.set(`${VITE_REPO.toLowerCase()}#7`, how === 'rebase' ? [VITE_DAY_HEAD] : ['e1'.repeat(20)]);
      const squashed = how === 'other-squash' ? fork.files.slice(1) : fork.files.map((f) => ({ ...f, patch: f.patch!.replace(/^@@ -\d+,\d+ \+\d+,\d+ @@/m, '@@ -9,9 +9,9 @@') }));
      t.github.setCommit(VITE_REPO, merge, { commits: [{ sha: merge, authorLogin: 'evan', message: 'fix: resolve build.sourcemap per environment (#7)' }], files: squashed, base: 'a0'.repeat(20) });
      t.clock.now = nextDay + 3 * 3_600_000;
      await t.watcher.run();
      expect(t.rewards.map((r) => r.bonus), how).toEqual(how === 'other-squash' ? [] : [owed]);
      // compare, the branch's pull requests, their commits, and (unless the commits matched) the merge commit.
      expect(t.watcher.stats.requests, how).toBe(how === 'rebase' ? 3 : 4);
    }
    // Line numbers and whitespace do not change a patch id; content does.
    const f = { filename: 'a.ts', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;' };
    expect(patchId([f])).toBe(patchId([{ ...f, patch: '@@ -40,3 +41,3 @@\n context\n-const  a = 1;\n+const a  = 2;' }]));
    expect(patchId([f])).not.toBe(patchId([{ ...f, patch: '@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 3;' }]));
  });

  it('a fork whose pull request is never merged pays nothing, and is given up on after 14 days', async () => {
    const t = setup();
    installViteFork(t.github);
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    // Closed without merging.
    t.github.pulls.set(`${VITE_REPO.toLowerCase()}#mara:${BRANCH}`, [{ number: 9, mergedAt: null, mergeSha: null, base: 'main', headSha: VITE_DAY_HEAD }]);
    const row = () => t.store.upstreamPendingOf(MAINTAINER.id)[0]!;
    for (let d = 1; d <= 20; d++) {
      t.clock.now = FIXTURE_NOW + d * DAY;
      await t.watcher.run();
    }
    expect(t.rewards).toEqual([]);
    expect(row().status).toBe('expired');
    // About one check a day for 14 days, then none: the closed pull request costs no commit reads.
    expect(row().checks).toBeGreaterThanOrEqual(13);
    expect(row().checks).toBeLessThanOrEqual(14);
    expect(t.github.calls.pullCommits).toBe(0);
    const spent = t.watcher.stats.requests;
    t.clock.now += 5 * DAY;
    await t.watcher.run();
    expect(t.watcher.stats.requests).toBe(spent);
    expect(t.watcher.stats.expired).toBe(1);
    expect(FIXTURE_NOW + GIVE_UP_MS).toBeLessThanOrEqual(FIXTURE_NOW + 14 * DAY);
  });

  it('a merged pull request holding only some of a push’s commits does not carry the rest', async () => {
    const t = setup();
    installViteFork(t.github);
    const extra = 'c3'.repeat(20);
    // One push of two commits; only the first reached the pull request that was merged.
    t.github.compares.get(`${FORK_REPO}:${VITE_BASE}...${VITE_DAY_HEAD}`)!.commits.unshift({ sha: extra, authorLogin: MAINTAINER.login, authorId: MAINTAINER.id, message: 'tweak' });
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    expect(t.store.upstreamPendingOf(MAINTAINER.id)[0]!.shas).toEqual([extra, VITE_DAY_HEAD]);
    t.github.pulls.set(`${VITE_REPO.toLowerCase()}#mara:${BRANCH}`, [{ number: 4, mergedAt: FIXTURE_NOW + DAY, mergeSha: null, base: 'main', headSha: extra }]);
    t.github.prCommits.set(`${VITE_REPO.toLowerCase()}#4`, [extra]);
    t.clock.now = nextDay + 3 * 3_600_000;
    await t.watcher.run();
    expect(t.rewards).toEqual([]);
    // Once the rest is merged too, it pays.
    t.github.pulls.set(`${VITE_REPO.toLowerCase()}#mara:${BRANCH}`, [{ number: 5, mergedAt: FIXTURE_NOW + 2 * DAY, mergeSha: null, base: 'main', headSha: VITE_DAY_HEAD }]);
    t.github.prCommits.set(`${VITE_REPO.toLowerCase()}#5`, [extra, VITE_DAY_HEAD]);
    t.clock.now += DAY;
    await t.watcher.run();
    expect(t.rewards).toHaveLength(1);
  });

  it('a merged pull request that does not hold the pushed commits pays nothing', async () => {
    const t = setup();
    installViteFork(t.github);
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    // A one-line typo fix from the same branch name, merged: its commits and patch are not this diff's.
    t.github.pulls.set(`${VITE_REPO.toLowerCase()}#mara:${BRANCH}`, [{ number: 3, mergedAt: FIXTURE_NOW + DAY, mergeSha: 'd0'.repeat(20), base: 'main', headSha: 'd1'.repeat(20) }]);
    t.github.prCommits.set(`${VITE_REPO.toLowerCase()}#3`, ['d1'.repeat(20)]);
    t.github.setCommit(VITE_REPO, 'd0'.repeat(20), { commits: [], files: [{ filename: 'README.md', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-teh\n+the' }] });
    t.clock.now = nextDay + 3 * 3_600_000;
    await t.watcher.run();
    expect(t.rewards).toEqual([]);
    expect(t.store.upstreamPendingOf(MAINTAINER.id)[0]!.status).toBe('pending');
  });

  it('banked pull requests merged together arrive a day’s caps at a time, the rest on the following days', () => {
    const t = setup();
    const today = pushDay + 10;
    // Five earlier days of fork work, each worth a full day's caps, all found upstream at once.
    for (let d = pushDay; d < pushDay + 5; d++) {
      t.store.addUpstreamPending({ userId: MAINTAINER.id, pushId: `p${d}`, repo: FORK_REPO, upstream: VITE_REPO, branch: 'main', ref: BRANCH, head: `${d}`.padStart(40, '0'), shas: [], patchId: null, day: d, at: d * DAY, bonusMilli: 5_000_000, effortMilli: 5_000_000, nextCheckAt: 0 });
      t.store.setUpstreamDayTotals(MAINTAINER.id, d, 0, 0);
    }
    for (const r of t.store.upstreamPendingOf(MAINTAINER.id)) t.store.updateUpstream(r.id, { status: 'upstream', checks: 1, nextCheckAt: 0, foundAt: today * DAY });
    const paid: number[] = [];
    for (let d = 0; d < 7; d++) {
      t.rewards.length = 0;
      t.watcher.settle((today + d) * DAY + 3_600_000);
      t.watcher.settle((today + d) * DAY + 7_200_000);
      paid.push(t.rewards.reduce((n, r) => n + r.bonus, 0));
    }
    expect(paid).toEqual([UPSTREAM_PER_DAY, UPSTREAM_PER_DAY, UPSTREAM_PER_DAY, UPSTREAM_PER_DAY, UPSTREAM_PER_DAY, 0, 0]);
    for (let d = pushDay; d < pushDay + 5; d++) expect(t.store.upstreamDay(MAINTAINER.id, d).credited).toBe(UPSTREAM_PER_DAY);
  });

  it('keeps within the REST budget: no checks below the reserve, and caches what never changes', async () => {
    const t = setup();
    installViteFork(t.github);
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    t.clock.now = nextDay + 3 * 3_600_000;
    t.github.remaining = UPSTREAM_RESERVE;
    await t.watcher.run();
    expect(t.github.calls.compareStatus).toBe(0);
    expect(t.watcher.budget(t.clock.now)).toBe(0);
    t.github.remaining = 4000;
    expect(t.watcher.budget(t.clock.now)).toBeGreaterThan(0);
    await t.watcher.run();
    expect(t.github.calls.compareStatus).toBe(1);
    // The day's pull request list is read once per branch per day, however many rows share it.
    expect(t.github.calls.closedPulls).toBe(1);
    expect(firstCheckAt(FIXTURE_NOW, VITE_DAY_HEAD) - nextDay).toBeLessThan(2 * 3_600_000);
  });

  it('a non-fork push is untouched: its bonus pays at once and nothing waits', async () => {
    const t = setup();
    installViteDay(t.github);
    const r = await t.ingest(VITE_REPO, VITE_BASE, VITE_DAY_HEAD, 'refs/heads/main');
    expect(r!.bonus).toBeGreaterThan(300);
    expect(t.store.upstreamPendingOf(MAINTAINER.id)).toEqual([]);
  });

  it('a webhook’s merged pull request wakes the checks, and is never trusted on its own', async () => {
    const t = setup();
    installViteFork(t.github);
    await t.ingest(FORK_REPO, VITE_BASE, VITE_DAY_HEAD);
    t.store.setHookSecret(MAINTAINER.id, 'sekrit');
    const app = Fastify();
    registerHooks(app, { store: t.store, github: t.github, log: silentLogger, clock: () => t.clock.now, onPush: () => {}, upstream: t.watcher });
    await app.ready();
    const body = JSON.stringify({ action: 'closed', repository: { full_name: VITE_REPO, private: false }, pull_request: { merged: true, number: 7 } });
    const res = await app.inject({ method: 'POST', url: `/hooks/github/${MAINTAINER.id}`, payload: body, headers: { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-hub-signature-256': signatureOf('sekrit', Buffer.from(body)) } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ woke: true });
    await t.watcher.run();
    // GitHub says the commit is not upstream: the claim alone changes nothing.
    expect(t.github.calls.compareStatus).toBe(1);
    expect(t.store.upstreamPendingOf(MAINTAINER.id)[0]!.status).toBe('pending');
    await app.close();
  });

});
