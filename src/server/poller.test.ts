import { beforeEach, describe, expect, it } from 'vitest';
import { Cat } from '../sim/api.ts';
import { openDb, Store } from './db.ts';
import { silentLogger } from './log.ts';
import { ingestPush, MAX_PUSH_ATTEMPTS, Poller, pushIdOf, type PushReport } from './poller.ts';
import { FakeGithub, pushEvent, sha, sourceFile, ZERO } from './testing/fakeGithub.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;

function setup() {
  const store = new Store(openDb(':memory:'));
  const github = new FakeGithub();
  const reports: PushReport[] = [];
  let now = NOW;
  const clock = () => now;
  store.upsertUser({ id: 7, nodeId: 'U_7', login: 'Ana', avatarUrl: '', createdAtGithub: 0, joinedAt: 0, bot: false });
  store.insertRoom({ slug: 'room', name: 'Room', ownerId: 7, visibility: 'public', invite: 'x', resetHour: 0, bots: 0, webhookUrl: null, createdAt: 0 });
  store.addMember(1, 7, 'owner', 0);
  const poller = new Poller({ store, github, log: silentLogger, clock, onPush: (r) => reports.push(r) });
  return { store, github, reports, poller, advance: (ms: number) => (now += ms) };
}

const commit = (n: number, login: string | null, message = `commit ${n}`) => ({ sha: sha(n), authorLogin: login, message });

/** Distinct, meaningful code lines. */
const calls = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `handleStep${from + i}(input, output);`);

describe('Poller', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('turns a new push into a report with classified lines', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW - HOUR));
    t.github.setCompare('ana/parser', sha(1), sha(2), {
      commits: [commit(2, 'ana', 'Add tokenizer\n\nLong body')],
      files: [sourceFile('src/tok.ts', ['// lex', 'export const a = ok ? 1 : 2;', 'if (a && b) run();']), sourceFile('src/tok.test.ts', ['it("adds", () => expect(add(1, 2)).toBe(3));'])],
    });
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(1);
    const r = t.reports[0]!;
    expect(r).toMatchObject({ userId: 7, pushId: pushIdOf('ana/parser', sha(2)), repo: 'ana/parser', language: 'TypeScript', commits: 1, message: 'Add tokenizer', at: NOW - HOUR });
    expect(r.lines[Cat.Code]).toBe(2);
    expect(r.lines[Cat.Comment]).toBe(1);
    expect(r.lines[Cat.Test]).toBe(1);
    expect(r.lines).toHaveLength(9);
    expect(r.files).toBe(1);
    expect(r.branches).toBe(3);
  });

  it('on first poll only counts pushes from the last 24 hours, then only newer events', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW - 30 * HOUR));
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [commit(2, 'ana')], files: [] });
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(0);
    expect(t.github.calls.compare).toBe(0);
    expect(t.store.user(7)!.lastEventId).toBe('100');

    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(2), sha(3), NOW));
    t.github.setCompare('ana/parser', sha(2), sha(3), { commits: [commit(3, 'ana')], files: [sourceFile('a.go', ['x()'])] });
    await t.poller.pollUser(7);
    expect(t.reports.map((r) => r.pushId)).toEqual([pushIdOf('ana/parser', sha(3))]);
  });

  it('uses the ETag so an unchanged feed costs nothing', async () => {
    await t.poller.pollUser(7);
    await t.poller.pollUser(7);
    expect(t.github.calls.events).toBe(2);
    expect(t.github.calls.notModified).toBe(1);
  });

  it('reads a new branch from its head commit and falls back to it when compare fails', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', ZERO, sha(5), NOW));
    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(8), sha(9), NOW));
    t.github.setCommit('ana/parser', sha(5), { commits: [commit(5, 'ana')], files: [sourceFile('a.rs', ['fn alpha() { beta() }'])] });
    t.github.setCommit('ana/parser', sha(9), { commits: [commit(9, 'ana')], files: [sourceFile('b.rs', ['fn gamma() { delta() }'])] });
    await t.poller.pollUser(7);
    expect(t.reports.map((r) => r.lines[Cat.Code])).toEqual([1, 1]);
    expect(t.github.calls.commit).toBe(2);
  });

  it('skips tags, branch deletions, and pushes made only of other people’s or already-counted commits', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW, 'refs/tags/v1'));
    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(1), ZERO, NOW));
    t.github.addEvent('Ana', pushEvent('102', 'ana/parser', sha(3), sha(4), NOW));
    t.github.addEvent('Ana', pushEvent('103', 'ana/fork', sha(5), sha(4), NOW));
    t.github.setCompare('ana/parser', sha(3), sha(4), { commits: [commit(4, 'bob')], files: [sourceFile('a.ts', ['x'])] });
    t.github.setCompare('ana/fork', sha(5), sha(4), { commits: [commit(4, 'bob')], files: [sourceFile('a.ts', ['x'])] });
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(0);
  });

  it('counts a commit once even when pushed to two branches, and measures only the user’s own commits in a mixed push', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW));
    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(1), sha(3), NOW, 'refs/heads/feature'));
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [commit(2, 'ana')], files: [sourceFile('a.ts', calls(0, 2))] });
    t.github.setCompare('ana/parser', sha(1), sha(3), {
      commits: [commit(2, 'ana'), commit(3, 'ANA'), commit(4, 'bob'), commit(5, null)],
      files: [sourceFile('a.ts', calls(0, 400))],
    });
    // Ana's own new commits, fetched one by one: three lines and two lines.
    t.github.setCommit('ana/parser', sha(3), { commits: [commit(3, 'ana')], files: [sourceFile('a.ts', calls(2, 5))] });
    t.github.setCommit('ana/parser', sha(5), { commits: [commit(5, null)], files: [sourceFile('b.ts', calls(10, 12))] });
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(2);
    expect(t.reports[1]!.commits).toBe(2);
    // Bob's 400-line merge rides along in the compare but raises nothing: only Ana's 5 lines count.
    expect(t.reports[1]!.lines[Cat.Code]).toBe(5);
  });

  it('ignores merge commits even when the user made them', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW));
    t.github.setCompare('ana/parser', sha(1), sha(2), {
      commits: [commit(2, 'ana'), { ...commit(3, 'ana'), merge: true }],
      files: [sourceFile('a.ts', calls(0, 300))],
    });
    t.github.setCommit('ana/parser', sha(2), { commits: [commit(2, 'ana')], files: [sourceFile('a.ts', calls(0, 4))] });
    await t.poller.pollUser(7);
    expect(t.reports[0]!.lines[Cat.Code]).toBe(4);
  });

  it('cancels work a later push undoes, through the stored ledger', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW));
    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(2), sha(3), NOW));
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [commit(2, 'ana')], files: [sourceFile('a.ts', ['if (ready && armed) fireAll(targets);', ...calls(0, 3)])] });
    t.github.setCompare('ana/parser', sha(2), sha(3), { commits: [commit(3, 'ana')], files: [sourceFile('a.ts', [], ['if (ready && armed) fireAll(targets);'])] });
    await t.poller.pollUser(7);
    const [add, undo] = t.reports;
    expect(add).toMatchObject({ files: 1, branches: 2, churn: 0 });
    expect(add!.lines[Cat.Code]).toBe(4);
    expect(undo).toMatchObject({ files: 0, branches: -2, churn: 2 });
    expect(undo!.lines[Cat.Code]).toBe(-1);
    expect(undo!.lines[Cat.Removed]).toBe(0);
  });

  it('retries a push whose compare failed instead of skipping it', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW));
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [commit(2, 'ana')], files: [] });
    t.github.failCompare = true;
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(0);
    expect(t.store.user(7)!.pollError).toMatch(/down/);
    t.github.failCompare = false;
    await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(1);
    expect(t.store.user(7)!.pollError).toBeNull();
  });

  it('gives up on a push that keeps failing so later pushes still count', async () => {
    t.github.addEvent('Ana', pushEvent('100', 'ana/blocked', sha(1), sha(2), NOW));
    t.github.addEvent('Ana', pushEvent('101', 'ana/parser', sha(3), sha(4), NOW));
    t.github.setCompare('ana/parser', sha(3), sha(4), { commits: [commit(4, 'ana')], files: [sourceFile('a.ts', ['a'])] });
    const compare = t.github.compare.bind(t.github);
    t.github.compare = async (repo, base, head) => {
      if (repo === 'ana/blocked') throw new Error('451 unavailable for legal reasons');
      return compare(repo, base, head);
    };
    for (let i = 0; i < MAX_PUSH_ATTEMPTS - 1; i++) await t.poller.pollUser(7);
    expect(t.reports).toHaveLength(0);
    await t.poller.pollUser(7);
    expect(t.reports.map((r) => r.repo)).toEqual(['ana/parser']);
    expect(t.store.user(7)!.lastEventId).toBe('101');
  });

  it('paces polling per user and honours X-Poll-Interval', async () => {
    t.github.pollInterval = 120;
    await t.poller.tick();
    expect(t.github.calls.events).toBe(1);
    await t.poller.tick();
    expect(t.github.calls.events).toBe(1);
    t.advance(90_000);
    await t.poller.tick();
    expect(t.github.calls.events).toBe(1);
    t.advance(31_000);
    await t.poller.tick();
    expect(t.github.calls.events).toBe(2);
  });

  it('stops polling when the rate limit is nearly spent', async () => {
    t.github.remaining = 10;
    await t.poller.tick();
    expect(t.github.calls.events).toBe(0);
  });

  it('ingestPush is idempotent for the same push', async () => {
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [commit(2, 'ana')], files: [sourceFile('a.ts', ['a'])] });
    const user = t.store.user(7)!;
    const deps = { store: t.store, github: t.github, clock: () => NOW, onPush: (r: PushReport) => t.reports.push(r) };
    const push = { repo: 'ana/parser', ref: 'refs/heads/main', before: sha(1), head: sha(2), at: NOW };
    const [a, b] = await Promise.all([ingestPush(deps, user, push), ingestPush(deps, user, push)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await ingestPush(deps, user, push)).toBeNull();
    expect(t.reports).toHaveLength(1);
  });
});
