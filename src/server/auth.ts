import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Store } from './db.ts';
import { fetchViewer, REQUEST_TIMEOUT_MS } from './github.ts';
import type { GithubPool } from './githubPool.ts';
import { errorMessage, type Logger } from './log.ts';
import type { TokenVault } from './tokens.ts';
import { issueSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from './session.ts';

const STATE_COOKIE = 'pf_oauth';

export interface AuthDeps {
  config: Config;
  store: Store;
  log: Logger;
  clock: () => number;
  fetchImpl?: typeof fetch;
  /** Called after every sign-in, e.g. to poll the user's pushes at once. */
  onSignIn?: (userId: number) => void;
  /** Seals players' sign-in tokens for storage (server/tokens.ts); none: tokens are not kept. */
  vault?: TokenVault | null;
  /** Players' GitHub clients: a new token replaces the old client. */
  pool?: GithubPool | null;
}

const CallbackQuery = z.object({ code: z.string().min(1), state: z.string().min(1) });
const TokenResponse = z.object({ access_token: z.string().min(1), scope: z.string().optional() });
const DevQuery = z.object({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/), next: z.string().optional() });
const StartQuery = z.object({ next: z.string().optional() });

/** Only same-origin paths survive as redirect targets. */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next.slice(0, 300);
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  const { config, store } = deps;
  const secure = config.publicUrl.startsWith('https://');
  const redirectUri = `${config.publicUrl}/auth/github/callback`;

  const signIn = (
    reply: FastifyReply,
    account: { id: number; nodeId: string; login: string; avatarUrl: string; createdAt: number },
    next: string,
    grant?: { token: string; scopes: string },
  ) => {
    store.upsertUser({ id: account.id, nodeId: account.nodeId, login: account.login, avatarUrl: account.avatarUrl, createdAtGithub: account.createdAt, joinedAt: deps.clock(), bot: false });
    // The sign-in token reads the player's public activity on their own rate limit: kept sealed, never shown.
    if (grant && deps.vault) {
      store.setToken(account.id, deps.vault.seal(grant.token, account.id), grant.scopes, deps.clock());
      deps.pool?.forget(account.id);
    }
    reply.setCookie(SESSION_COOKIE, issueSession(account.id, deps.clock(), config.sessionSecret), {
      path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_MAX_AGE_S,
    });
    deps.onSignIn?.(account.id);
    deps.log.info('signed in', { user: account.id, login: account.login });
    return reply.redirect(`${config.publicUrl}${next}`);
  };

  app.get('/auth/github', async (req, reply) => {
    if (!config.oauth) return reply.code(503).send({ error: 'unavailable', message: 'GitHub sign-in is not configured on this server.' });
    const next = safeNext(StartQuery.safeParse(req.query).data?.next);
    const state = randomBytes(18).toString('base64url');
    reply.setCookie(STATE_COOKIE, `${state}|${next}`, { path: '/auth', httpOnly: true, sameSite: 'lax', secure, maxAge: 600 });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', config.oauth.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', '');
    url.searchParams.set('allow_signup', 'true');
    return reply.redirect(url.toString());
  });

  app.get('/auth/github/callback', async (req, reply) => {
    if (!config.oauth) return reply.code(503).send({ error: 'unavailable', message: 'GitHub sign-in is not configured on this server.' });
    const query = CallbackQuery.safeParse(req.query);
    const cookie = req.cookies[STATE_COOKIE] ?? '';
    const bar = cookie.indexOf('|');
    const expected = bar >= 0 ? cookie.slice(0, bar) : '';
    const next = safeNext(bar >= 0 ? cookie.slice(bar + 1) : undefined);
    reply.clearCookie(STATE_COOKIE, { path: '/auth' });
    if (!query.success || !expected || !sameString(query.data.state, expected)) {
      return reply.redirect(`${config.publicUrl}/?error=signin_state`);
    }
    try {
      const fetchImpl = deps.fetchImpl ?? fetch;
      const res = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: config.oauth.clientId, client_secret: config.oauth.clientSecret, code: query.data.code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // Parsed quietly: a schema error must not echo the answer (and its token) into a log line.
      const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error(`token exchange failed: ${res.status}`);
      const { access_token: token, scope } = parsed.data;
      const viewer = await fetchViewer(token, fetchImpl);
      if (viewer.type !== 'User') return reply.redirect(`${config.publicUrl}/?error=not_a_user`);
      return signIn(reply, { id: viewer.id, nodeId: viewer.node_id, login: viewer.login, avatarUrl: viewer.avatar_url, createdAt: Date.parse(viewer.created_at) }, next, { token, scopes: scope ?? '' });
    } catch (err) {
      deps.log.warn('OAuth callback failed', { error: errorMessage(err) });
      return reply.redirect(`${config.publicUrl}/?error=signin_failed`);
    }
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect(`${config.publicUrl}/`);
  });

  if (!config.devAuth) return;
  // Local development: sign in as any login. Ids are derived from the login so they stay stable.
  app.get('/auth/dev', async (req, reply) => {
    const query = DevQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid', message: 'login required' });
    const login = query.data.login;
    const existing = store.userByLogin(login);
    const id = existing && !existing.bot ? existing.id : devId(login);
    return signIn(
      reply,
      { id, nodeId: `dev:${login}`, login, avatarUrl: existing?.avatarUrl || `https://github.com/${login}.png?size=96`, createdAt: 0 },
      safeNext(query.data.next),
    );
  });
}

export function devId(login: string): number {
  return 1_000_000_000 + (createHash('sha256').update(login.toLowerCase()).digest().readUInt32BE(0) % 1_000_000_000);
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
