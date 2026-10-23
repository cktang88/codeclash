import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, Store } from './db.ts';
import { HOOK_LIMIT, registerHooks, signatureOf } from './hooks.ts';
import { silentLogger } from './log.ts';
import { Poller, type PushReport } from './poller.ts';
import { FakeGithub, pushEvent, sha, sourceFile, ZERO } from './testing/fakeGithub.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const SECRET = 'hook-secret';

async function setup() {
  const store = new Store(openDb(':memory:'));
  const github = new FakeGithub();
  const reports: PushReport[] = [];
  store.upsertUser({ id: 7, nodeId: 'U_7', login: 'ana', avatarUrl: '', createdAtGithub: 0, joinedAt: 0, bot: false });
  store.setHookSecret(7, SECRET);
  store.insertRoom({ slug: 'room', name: 'Room', ownerId: 7, visibility: 'public', invite: 'x', resetHour: 0, bots: 0, webhookUrl: null, createdAt: 0 });
  store.addMember(1, 7, 'owner', 0);
  const deps = { store, github, log: silentLogger, clock: () => NOW, onPush: (r: PushReport) => reports.push(r) };
  const app = Fastify();
  registerHooks(app, deps);
  await app.ready();
  return { app, store, github, reports, poller: new Poller(deps) };
}

function payload(over: Record<string, unknown> = {}) {
  return {
    ref: 'refs/heads/main',
    before: sha(1),
    after: sha(2),
    deleted: false,
    repository: { full_name: 'ana/parser', private: false },
    sender: { id: 7, login: 'ana' },
    pusher: { name: 'ana' },
    ...over,
  };
}

describe('registerHooks', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [{ sha: sha(2), authorLogin: 'ana', message: 'Ship it' }], files: [sourceFile('a.ts', ['a()', 'b()'])] });
  });
  afterEach(async () => {
    await t.app.close();
  });

  const post = (body: string, headers: Record<string, string>, user = 7) =>
    t.app.inject({ method: 'POST', url: `/hooks/github/${user}`, payload: body, headers: { 'content-type': 'application/json', ...headers } });

  const signed = (event: string, body: unknown, secret = SECRET) => {
    const raw = JSON.stringify(body);
    return post(raw, { 'x-github-event': event, 'x-hub-signature-256': signatureOf(secret, Buffer.from(raw)) });
  };

  it('answers pings', async () => {
    expect((await signed('ping', { zen: 'hi' })).statusCode).toBe(204);
  });

  it('rejects missing and wrong signatures, and unknown users', async () => {
    expect((await post(JSON.stringify(payload()), { 'x-github-event': 'push' })).statusCode).toBe(401);
    expect((await signed('push', payload(), 'wrong')).statusCode).toBe(401);
    const raw = JSON.stringify(payload());
    expect((await post(raw, { 'x-github-event': 'push', 'x-hub-signature-256': signatureOf(SECRET, Buffer.from(raw)) }, 99)).statusCode).toBe(404);
    expect(t.reports).toHaveLength(0);
  });

  it('turns a signed push into a report', async () => {
    const res = await signed('push', payload());
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, counted: true });
    expect(t.reports).toHaveLength(1);
    expect(t.reports[0]).toMatchObject({ repo: 'ana/parser', message: 'Ship it', commits: 1, at: NOW });
  });

  it('only credits commits GitHub links to the hook owner', async () => {
    t.github.setCompare('ana/parser', sha(1), sha(2), { commits: [{ sha: sha(2), authorLogin: null, message: 'Someone else' }], files: [sourceFile('a.ts', ['a()'])] });
    const res = await signed('push', payload());
    expect(res.json()).toEqual({ ok: true, counted: false });
    expect(t.reports).toHaveLength(0);
  });

  it('accepts form-encoded deliveries', async () => {
    const raw = new URLSearchParams({ payload: JSON.stringify(payload()) }).toString();
    const res = await t.app.inject({
      method: 'POST',
      url: '/hooks/github/7',
      payload: raw,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-github-event': 'push', 'x-hub-signature-256': signatureOf(SECRET, Buffer.from(raw)) },
    });
    expect(res.statusCode).toBe(202);
    expect(t.reports).toHaveLength(1);
  });

  it('ignores private repos, deletions, tags and other people’s pushes', async () => {
    await signed('push', payload({ repository: { full_name: 'ana/secret', private: true } }));
    await signed('push', payload({ deleted: true, after: ZERO }));
    await signed('push', payload({ ref: 'refs/tags/v1' }));
    await signed('push', payload({ sender: { id: 8 }, pusher: { name: 'bob' } }));
    expect(t.reports).toHaveLength(0);
    expect(t.github.calls.compare).toBe(0);
  });

  it('counts a push delivered by both the webhook and the event feed once', async () => {
    await signed('push', payload());
    t.github.addEvent('ana', pushEvent('100', 'ana/parser', sha(1), sha(2), NOW));
    await t.poller.pollUser(7);
    await signed('push', payload());
    expect(t.reports).toHaveLength(1);
  });

  it('limits deliveries per hook so one user cannot spend the server’s GitHub budget', async () => {
    for (let i = 0; i < HOOK_LIMIT.max; i++) expect((await signed('push', payload({ after: sha(100 + i) }))).statusCode).toBe(202);
    expect((await signed('push', payload({ after: sha(999) }))).statusCode).toBe(429);
    expect(t.github.calls.compare).toBe(HOOK_LIMIT.max);
  });
});
