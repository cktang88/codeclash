import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FACTION_IDS } from '../game/factions.ts';
import type { DifficultyContext } from '../ingest/difficulty.ts';
import type { GithubClient } from '../ingest/github.ts';
import { registerHooks } from '../ingest/hooks.ts';
import type { Parser } from '../ingest/parsePool.ts';
import type { PushReport } from '../ingest/poller.ts';
import type { UserRow } from '../ingest/store.ts';
import type { UpstreamWatcher } from '../ingest/upstream.ts';
import type { BattleView, CityView, GithubLink, LeagueCard, LeagueDetail, MeResponse } from '../protocol.ts';
import { registerAuth, type AuthDeps } from './auth.ts';
import type { GameStore, LeagueRow } from './gameStore.ts';
import { LeagueFailure, type Leagues } from './leagues.ts';
import { readSession, SESSION_COOKIE } from './session.ts';

export interface HttpDeps extends AuthDeps {
  leagues: Leagues;
  game: GameStore;
  github: GithubClient | null;
  onPush: (report: PushReport) => void;
  context?: DifficultyContext | null;
  parser?: Parser | null;
  upstream?: UpstreamWatcher | null;
}

/** What the client may know of a player's stored token: whether there is one, never the token. */
export function githubLink(user: UserRow): GithubLink {
  return { status: !user.token ? 'none' : user.token.valid ? 'ok' : 'invalid', storedAt: user.token?.storedAt ?? null };
}

const CreateLeague = z.object({
  name: z.string().trim().min(2).max(48),
  visibility: z.enum(['public', 'private']),
  resetHour: z.number().int().min(0).max(23),
  bots: z.number().int().min(0).max(7),
});
const Look = z.object({ faction: z.enum(FACTION_IDS as [string, ...string[]]), hue: z.number().int().min(0).max(359) });
const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,48}$/) });

/** Fixed-window rate limiter keyed by user or address. */
class Limiter {
  private hits = new Map<string, { at: number; n: number }>();
  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}
  allow(key: string, now: number): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.at >= this.windowMs) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { at: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
}

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

function failure(reply: FastifyReply, err: unknown) {
  if (err instanceof LeagueFailure) {
    const status = { not_found: 404, forbidden: 403, invalid: 400, limit: 429, signed_out: 401 }[err.code];
    return fail(reply, status, err.code, err.message);
  }
  if (err instanceof z.ZodError) return fail(reply, 404, 'not_found', 'Not found.');
  throw err;
}

export async function buildHttp(deps: HttpDeps): Promise<FastifyInstance> {
  const { store, leagues, game, config, clock } = deps;
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 });
  await app.register(cookie);

  const viewerOf = (req: FastifyRequest): UserRow | null => {
    const id = readSession(req.cookies[SESSION_COOKIE], config.sessionSecret, clock());
    return id === null ? null : store.user(id);
  };
  const inviteOf = (req: FastifyRequest): string | null => {
    const q = req.query as Record<string, unknown>;
    return typeof q.invite === 'string' ? q.invite : null;
  };
  const leagueOf = (slug: string): LeagueRow => {
    const l = game.leagueBySlug(slug);
    if (!l) throw new LeagueFailure('not_found', 'No such league.');
    return l;
  };
  const viewable = (req: FastifyRequest, league: LeagueRow) => {
    const user = viewerOf(req);
    if (!leagues.canView(league, user?.id ?? null, inviteOf(req))) throw new LeagueFailure('forbidden', 'This league is private.');
    return user;
  };
  const signedIn = (req: FastifyRequest): UserRow => {
    const user = viewerOf(req);
    if (!user) throw new LeagueFailure('signed_out', 'Sign in first.');
    return user;
  };
  const createLimit = new Limiter(3600_000, 10);

  // ---------------------------------------------------------------- me

  app.get('/api/me', async (req): Promise<MeResponse> => {
    const user = viewerOf(req);
    const base = { oauth: config.oauth !== null, devAuth: config.devAuth };
    if (!user) return { user: null, leagues: [], ...base };
    return {
      user: {
        id: user.id, login: user.login, avatarUrl: user.avatarUrl, bot: false, ...leagues.look(user.id),
        hookUrl: user.hookSecret ? `${config.publicUrl}/hooks/github/${user.id}` : null,
        github: githubLink(user),
      },
      leagues: game.leaguesOf(user.id).map((l) => leagues.card(l)),
      ...base,
    };
  });

  app.post('/api/me/look', async (req, reply) => {
    try {
      const user = signedIn(req);
      const body = Look.safeParse(req.body);
      if (!body.success) return fail(reply, 400, 'invalid', 'Expected { faction, hue }.');
      leagues.setLook(user, body.data.faction as never, body.data.hue);
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.delete('/api/me/github', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
    store.deleteToken(user.id);
    deps.pool?.forget(user.id);
    deps.log.info('github disconnected', { user: user.id });
    return reply.code(204).send();
  });

  app.delete('/api/me', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
    const owned = game.leaguesOf(user.id).filter((l) => l.ownerId === user.id);
    if (owned.length > 0) return fail(reply, 409, 'owns_leagues', `Delete the leagues you own first (${owned.map((l) => l.name).join(', ')}).`);
    game.deleteUser(user.id);
    store.deleteUser(user.id);
    deps.pool?.forget(user.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    deps.log.info('account deleted', { user: user.id });
    return reply.code(204).send();
  });

  app.post('/api/me/hook', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
    const secret = randomBytes(24).toString('hex');
    store.setHookSecret(user.id, secret);
    return { hookUrl: `${config.publicUrl}/hooks/github/${user.id}`, secret };
  });

  // ---------------------------------------------------------------- leagues

  app.get('/api/leagues', async (): Promise<LeagueCard[]> => game.leagues().filter((l) => l.visibility === 'public').map((l) => leagues.card(l)));

  app.post('/api/leagues', async (req, reply) => {
    try {
      const user = signedIn(req);
      if (!createLimit.allow(`u${user.id}`, clock())) return fail(reply, 429, 'limit', 'Too many leagues created; try again later.');
      const body = CreateLeague.safeParse(req.body);
      if (!body.success) return fail(reply, 400, 'invalid', 'Name (2 to 48 characters), visibility, reset hour 0 to 23 and up to 7 bots.');
      const league = leagues.create(user, body.data, clock());
      return reply.code(201).send(leagues.card(league));
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/leagues/:slug', async (req, reply): Promise<LeagueDetail | void> => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const league = leagueOf(slug);
      const user = viewable(req, league);
      return leagues.detail(league, user, clock());
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.delete('/api/leagues/:slug', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const league = leagueOf(slug);
      const user = signedIn(req);
      if (league.ownerId !== user.id) return fail(reply, 403, 'forbidden', 'Only the owner can delete a league.');
      game.deleteLeague(league.id);
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/leagues/:slug/join', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const league = leagueOf(slug);
      const user = signedIn(req);
      const invite = z.object({ invite: z.string().max(64).nullable().optional() }).safeParse(req.body ?? {});
      leagues.join(league, user, (invite.success ? invite.data.invite : null) ?? inviteOf(req), clock());
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/leagues/:slug/leave', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const league = leagueOf(slug);
      leagues.leave(league, signedIn(req).id);
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/leagues/:slug/city/:id', async (req, reply): Promise<CityView | void> => {
    try {
      const p = SlugParams.extend({ id: z.coerce.number().int() }).parse(req.params);
      const league = leagueOf(p.slug);
      viewable(req, league);
      if (!leagues.isMember(league, p.id)) return fail(reply, 404, 'not_found', 'Not a member of this league.');
      return leagues.cityView(league, p.id, clock());
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/battles/:id', async (req, reply): Promise<BattleView | void> => {
    try {
      const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const battle = game.battle(id);
      if (!battle) return fail(reply, 404, 'not_found', 'No such battle.');
      const league = game.league(battle.leagueId)!;
      viewable(req, league);
      // A private league's battle must never sit in a shared cache, where anyone could fetch it.
      reply.header('cache-control', league.visibility === 'public' ? 'public, max-age=3600' : 'private, max-age=3600');
      return leagues.battleView(battle);
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/health', async () => ({ ok: true, leagues: game.leagues().length, ingestion: deps.github !== null }));

  registerAuth(app, deps);
  registerHooks(app, { store, github: deps.github, log: deps.log, clock, onPush: deps.onPush, context: deps.context ?? null, parser: deps.parser ?? null, upstream: deps.upstream ?? null, pool: deps.pool ?? null });

  const clientDir = resolve(config.clientDir);
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      wildcard: false,
      setHeaders: (res, path) => {
        const p = path.replace(/\\/g, '/');
        if (p.includes('/assets/')) res.header('cache-control', 'public, max-age=31536000, immutable');
        else if (p.endsWith('/index.html')) res.header('cache-control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0]!;
      const asset = /\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf('/') + 1));
      if (req.method !== 'GET' || asset || /^\/(api|auth|hooks)(\/|$)/.test(path)) return reply.code(404).send({ error: 'not_found', message: 'Not found.' });
      return reply.type('text/html').sendFile('index.html');
    });
  }
  return app;
}
