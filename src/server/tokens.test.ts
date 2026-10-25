import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { MeResponse, ProfileResponse } from '../protocol.ts';
import { loadAllGrammars } from '../rules/complexity.ts';
import { createServer } from './app.ts';
import { openDb, Store } from './db.ts';
import { loadConfig } from './config.ts';
import { errorMessage, redactTokens, type Logger } from './log.ts';
import { FakeGithub } from './testing/fakeGithub.ts';
import { FIXTURE_REPO, previewFixture } from './testing/previewFixtures.ts';
import { TokenVault } from './tokens.ts';

beforeAll(() => loadAllGrammars());

const TOKEN = 'gho_Secret0123456789abcdefGHIJKLmnop';
const TOKEN_KEY = 'test-token-key-0123456789abcdef-0123456789';
const VIEWER = { id: 4242, node_id: 'U_4242', login: 'ana', avatar_url: 'https://avatars.example/ana', created_at: '2015-01-01T00:00:00Z', type: 'User' };

describe('TokenVault', () => {
  const vault = TokenVault.fromSecrets({ tokenKey: TOKEN_KEY, sessionSecret: null });

  it('seals with AES-256-GCM: a fresh nonce each time, and only the same key and user open it', () => {
    const a = vault.seal(TOKEN, 7);
    const b = vault.seal(TOKEN, 7);
    expect(a).not.toBe(b);
    expect(a).not.toContain(TOKEN);
    expect(a.startsWith('v1.')).toBe(true);
    expect(vault.open(a, 7)).toBe(TOKEN);
    // Bound to its user: copied onto another row, it does not open.
    expect(vault.open(a, 8)).toBeNull();
    // Another key (TOKEN_KEY rotated, a random dev key from an earlier boot) cannot open it.
    expect(TokenVault.fromSecrets({ tokenKey: `${TOKEN_KEY}x`, sessionSecret: null }).open(a, 7)).toBeNull();
    expect(TokenVault.fromSecrets({ tokenKey: null, sessionSecret: null }).open(a, 7)).toBeNull();
    // Tampering is caught by the tag.
    const parts = a.split('.');
    parts[3] = Buffer.from('gho_forged').toString('base64url');
    expect(vault.open(parts.join('.'), 7)).toBeNull();
    expect(vault.open('garbage', 7)).toBeNull();
  });

  it('derives its key from TOKEN_KEY, else SESSION_SECRET, else a random per-boot key', () => {
    expect(TokenVault.fromSecrets({ tokenKey: TOKEN_KEY, sessionSecret: 's'.repeat(40) }).source).toBe('TOKEN_KEY');
    const fromSession = TokenVault.fromSecrets({ tokenKey: null, sessionSecret: 's'.repeat(40) });
    expect(fromSession.source).toBe('SESSION_SECRET');
    expect(TokenVault.fromSecrets({ tokenKey: null, sessionSecret: 's'.repeat(40) }).open(fromSession.seal(TOKEN, 1), 1)).toBe(TOKEN);
    expect(TokenVault.fromSecrets({ tokenKey: null, sessionSecret: null }).source).toBe('random');
  });

  it('TOKEN_KEY must be 32+ bytes, and is required in production when OAuth is configured', () => {
    const prod = { NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40), PUBLIC_URL: 'https://cc.test' };
    expect(() => loadConfig({ ...prod, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })).toThrow(/TOKEN_KEY/);
    expect(loadConfig({ ...prod, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', TOKEN_KEY }).tokenKey).toBe(TOKEN_KEY);
    expect(() => loadConfig({ ...prod, TOKEN_KEY: 'short' })).toThrow(/TOKEN_KEY/);
    // Without OAuth no token is ever stored, so production does not need one.
    expect(loadConfig(prod).tokenKey).toBeNull();
    expect(() => loadConfig({ NODE_ENV: 'development', TOKEN_KEY: 'short' })).toThrow(/TOKEN_KEY/);
  });

  it('redacts token-shaped strings from errors and log lines', () => {
    expect(redactTokens(`failed with ${TOKEN}`)).toBe('failed with [redacted]');
    expect(redactTokens('authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toBe('authorization: Bearer [redacted]');
    expect(redactTokens('github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz')).toBe('[redacted]');
    expect(errorMessage(new Error(`boom ${TOKEN}`))).toBe('boom [redacted]');
  });
});

/** A server with GitHub sign-in, whose GitHub is `fake` and whose OAuth endpoints answer with TOKEN. */
async function boot(fake: FakeGithub = new FakeGithub(), lines: string[] = []) {
  const now = { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_PATH: ':memory:', COMMONS: '0', PUBLIC_URL: 'http://cc.test',
    GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'client-secret', TOKEN_KEY, SESSION_SECRET: 'x'.repeat(40),
  });
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: TOKEN, scope: '', token_type: 'bearer' });
    if (url === 'https://api.github.com/user') return Response.json(VIEWER);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const record = (level: string) => (msg: string, extra?: Record<string, unknown>) => void lines.push(JSON.stringify({ level, msg, ...extra }));
  const log: Logger = { info: record('info'), warn: record('warn'), error: record('error') };
  const server = await createServer(config, {
    log, clock: () => now.t, background: false, fetchImpl,
    github: fake, previewGithub: fake, tokenClient: (token) => fake.as(token, VIEWER.login),
  });
  await server.app.ready();
  return { server, now, lines };
}

async function oauthSignIn(server: Awaited<ReturnType<typeof boot>>['server']): Promise<string> {
  const start = await server.app.inject({ url: '/auth/github' });
  const state = new URL(String(start.headers.location)).searchParams.get('state')!;
  const stateCookie = [start.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_oauth='))!.split(';')[0]!;
  const back = await server.app.inject({ url: `/auth/github/callback?code=abc&state=${state}`, headers: { cookie: stateCookie } });
  expect(back.statusCode).toBe(302);
  return [back.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!.split(';')[0]!;
}

describe('players’ sign-in tokens', () => {
  it('a database from before stored tokens gains the columns, and its users read as having none', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cc-tokens-')), 'old.db');
    const old = new Database(path);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, node_id TEXT NOT NULL, login TEXT NOT NULL, avatar_url TEXT NOT NULL, created_at_github INTEGER NOT NULL,
      joined_at INTEGER NOT NULL, resting_day TEXT, hook_secret TEXT, events_etag TEXT, last_event_id TEXT, last_polled_at INTEGER, poll_error TEXT, bot INTEGER NOT NULL DEFAULT 0);
      INSERT INTO users (id, node_id, login, avatar_url, created_at_github, joined_at) VALUES (1, 'U', 'ana', '', 0, 0);`);
    old.close();
    const store = new Store(openDb(path));
    expect(store.user(1)!.token).toBeNull();
    store.setToken(1, 'v1.a.b.c', '', 5);
    expect(store.user(1)!.token).toEqual({ valid: true, scopes: '', storedAt: 5, invalidAt: null });
    store.db.close();
  });

  it('are stored encrypted, with their scopes and time, and never returned by any API or logged', async () => {
    const { server, lines } = await boot();
    const cookie = await oauthSignIn(server);
    const raw = server.store.db.prepare('SELECT * FROM users WHERE id = ?').get(VIEWER.id) as Record<string, unknown>;
    expect(JSON.stringify(raw)).not.toContain(TOKEN);
    expect(String(raw.token_enc)).toMatch(/^v1\./);
    expect(raw.token_scopes).toBe('');
    expect(raw.token_stored_at).toBe(Date.UTC(2026, 9, 23, 12));
    expect(TokenVault.fromSecrets({ tokenKey: TOKEN_KEY, sessionSecret: null }).open(String(raw.token_enc), VIEWER.id)).toBe(TOKEN);
    // Nor is the token in what the store hands the rest of the server.
    expect(JSON.stringify(server.store.user(VIEWER.id))).not.toContain(String(raw.token_enc));

    const bodies: string[] = [];
    for (const url of ['/api/me', `/api/users/${VIEWER.login}`, '/api/rooms', '/api/health']) {
      const res = await server.app.inject({ url, headers: { cookie } });
      bodies.push(res.body);
      expect(res.body).not.toContain(TOKEN);
      expect(res.body).not.toContain(String(raw.token_enc));
    }
    const me = JSON.parse(bodies[0]!) as MeResponse;
    expect(me.user!.github).toEqual({ status: 'ok', storedAt: Date.UTC(2026, 9, 23, 12) });
    const profile = JSON.parse(bodies[1]!) as ProfileResponse;
    expect(profile.own?.github.status).toBe('ok');
    // Someone else's view of the profile says nothing about the token.
    const anon = (await server.app.inject({ url: `/api/users/${VIEWER.login}` })).json<ProfileResponse>();
    expect(anon.own).toBeUndefined();
    expect(lines.join('\n')).not.toContain(TOKEN);
  });

  it('signing out keeps the token; Disconnect GitHub deletes it', async () => {
    const { server } = await boot();
    let cookie = await oauthSignIn(server);
    await server.app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(server.store.sealedToken(VIEWER.id)).not.toBeNull();
    cookie = await oauthSignIn(server);
    expect((await server.app.inject({ method: 'DELETE', url: '/api/me/github' })).statusCode).toBe(401);
    expect((await server.app.inject({ method: 'DELETE', url: '/api/me/github', headers: { cookie } })).statusCode).toBe(204);
    const raw = server.store.db.prepare('SELECT token_enc, token_scopes, token_stored_at FROM users WHERE id = ?').get(VIEWER.id);
    expect(raw).toEqual({ token_enc: null, token_scopes: null, token_stored_at: null });
    expect(server.pool.own(VIEWER.id)).toBeNull();
    const me = (await server.app.inject({ url: '/api/me', headers: { cookie } })).json<MeResponse>();
    expect(me.user!.github.status).toBe('none');
  });

  it('deleting the account deletes the token with the rest of the player', async () => {
    const { server } = await boot();
    const cookie = await oauthSignIn(server);
    const created = await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { name: 'Mine', visibility: 'public', resetHour: 0, bots: 0 } });
    // An owner deletes their rooms first.
    expect((await server.app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie } })).statusCode).toBe(409);
    await server.app.inject({ method: 'DELETE', url: `/api/rooms/${created.json<{ slug: string }>().slug}`, headers: { cookie } });
    const res = await server.app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(server.store.user(VIEWER.id)).toBeNull();
    expect(server.store.db.prepare('SELECT count(*) AS n FROM users WHERE token_enc IS NOT NULL').get()).toEqual({ n: 0 });
    expect((await server.app.inject({ url: '/api/me', headers: { cookie } })).json<MeResponse>().user).toBeNull();
  });

  it('a revoked token (401) is marked invalid, wiped, and the player is told to sign in again', async () => {
    const fake = new FakeGithub();
    const { server } = await boot(fake);
    const cookie = await oauthSignIn(server);
    fake.revoke(TOKEN);
    const own = server.pool.forUser(VIEWER.id)!;
    // The call is made again on the server's token.
    await own.userEvents(VIEWER.login, null);
    expect(fake.charged(null)).toBe(1);
    expect(server.store.sealedToken(VIEWER.id)).toBeNull();
    const raw = server.store.db.prepare('SELECT token_enc, token_invalid_at FROM users WHERE id = ?').get(VIEWER.id) as Record<string, unknown>;
    expect(raw.token_enc).toBe('');
    expect(raw.token_invalid_at).toBe(Date.UTC(2026, 9, 23, 12));
    const me = (await server.app.inject({ url: '/api/me', headers: { cookie } })).json<MeResponse>();
    expect(me.user!.github.status).toBe('invalid');
    // Signing in again stores a fresh token, valid again.
    fake.revoked.clear();
    await oauthSignIn(server);
    expect(server.store.user(VIEWER.id)!.token!.valid).toBe(true);
  });

  it('the army preview reads on a signed-in viewer’s own token, and on the server’s for anyone else', async () => {
    const fake = previewFixture(Date.UTC(2026, 9, 23, 12));
    const { server } = await boot(fake);
    const cookie = await oauthSignIn(server);
    const [owner, repo] = FIXTURE_REPO.split('/') as [string, string];
    const mine = await server.app.inject({ url: `/api/preview/${owner}/${repo}`, headers: { cookie } });
    expect(mine.statusCode).toBe(200);
    expect(fake.charged(TOKEN)).toBeGreaterThan(0);
    expect(fake.charged(null)).toBe(0);
    // Another branch, so the shared cache does not answer; anonymous: the server's token.
    const theirs = await server.app.inject({ url: `/api/preview/${owner}/${repo}?branch=main`, remoteAddress: '10.9.9.9' });
    expect(theirs.statusCode).toBe(200);
    expect(fake.charged(null)).toBeGreaterThan(0);
  });
});
