// Wires the three layers together: ingestion (GitHub → credited pushes), the league service
// (pushes → cities → battles) and HTTP.

import type { FastifyInstance } from 'fastify';
import { DifficultyContext } from '../ingest/difficulty.ts';
import { Discovery } from '../ingest/discovery.ts';
import { createGithubClient, type GithubClient } from '../ingest/github.ts';
import { GithubPool } from '../ingest/githubPool.ts';
import { consoleLogger, errorMessage, type Logger } from '../ingest/log.ts';
import { Mirror } from '../ingest/mirror.ts';
import { createParser } from '../ingest/parsePool.ts';
import { Poller, type PushReport } from '../ingest/poller.ts';
import { openDb, Store } from '../ingest/store.ts';
import { TokenVault } from '../ingest/tokens.ts';
import { UpstreamWatcher } from '../ingest/upstream.ts';
import type { Config } from './config.ts';
import { GameStore } from './gameStore.ts';
import { buildHttp } from './http.ts';
import { Leagues } from './leagues.ts';

const SEEN_COMMITS_DAYS = 14;
const UPSTREAM_DAYS = 28;
const PRUNE_EVERY_MS = 6 * 3_600_000;
const BATTLE_CHECK_MS = 5_000;

export interface Server {
  app: FastifyInstance;
  leagues: Leagues;
  store: Store;
  game: GameStore;
  pool: GithubPool;
  poller: Poller | null;
  discovery: Discovery | null;
  /** Fights whatever battles are due now (the timer does this in the background). */
  fightDue(): number;
  listen(): Promise<string>;
  shutdown(): Promise<void>;
}

export async function createServer(
  config: Config,
  opts: {
    log?: Logger;
    clock?: () => number;
    fetchImpl?: typeof fetch;
    background?: boolean;
    github?: GithubClient | null;
    tokenClient?: (token: string) => GithubClient;
  } = {},
): Promise<Server> {
  const log = opts.log ?? consoleLogger;
  const clock = opts.clock ?? Date.now;
  const background = opts.background ?? true;
  const db = openDb(config.databasePath);
  const store = new Store(db);
  const game = new GameStore(db);
  const leagues = new Leagues({ store, game, log, config: { dayMs: config.dayMs, maxLeaguesPerUser: config.maxLeaguesPerUser } });
  const github = opts.github !== undefined ? opts.github : config.githubToken ? createGithubClient(config.githubToken, opts.fetchImpl) : null;
  const vault = TokenVault.fromSecrets({ tokenKey: config.tokenKey, sessionSecret: config.sessionSecretGenerated ? null : config.sessionSecret });
  const pool = new GithubPool({ store, vault, server: github, create: opts.tokenClient ?? ((token) => createGithubClient(token, opts.fetchImpl)), clock, log });
  const mirror = config.mirrorDir ? new Mirror({ dir: config.mirrorDir, clock }) : null;
  const context = github ? new DifficultyContext({ github, clock, mirror, log }) : null;
  const parser = createParser(config.parseWorkers);

  const onPush = (report: PushReport) => {
    leagues.onPush(report, clock());
    log.info('push', { user: report.userId, repo: report.repo, lines: report.lines, bonus: report.bonus ?? 0 });
  };
  const discovery = github ? new Discovery({ store, pool, log, clock, onPush, context, parser }) : null;
  const poller = github
    ? new Poller({ store, github, log, clock, onPush, context, parser, pool, onPushEvent: (userId, repo, at) => discovery?.noteEvent(userId, repo, at) })
    : null;
  const upstream = github
    ? new UpstreamWatcher({
        store, github, clock, log, pool,
        onReward: (r) => {
          leagues.onUpstream(r, clock());
          log.info('upstream bonus', { user: r.userId, repo: r.repo, upstream: r.upstream, day: r.day, bonus: r.bonus });
        },
      })
    : null;

  if (!github) log.warn('GITHUB_TOKEN is not set: pushes are not ingested; only sparring bots fight');
  if (config.sessionSecretGenerated) log.warn('SESSION_SECRET is not set: using a random secret, sessions end on restart');
  if (config.devAuth) log.warn('DEV_AUTH=1: /auth/dev signs in as any login without OAuth');
  if (config.oauth && vault.source === 'random') log.warn('TOKEN_KEY is not set: players\' stored GitHub tokens are sealed with a random key and will not survive a restart');

  if (config.commons) leagues.seedCommons(clock());
  const prune = () => {
    try {
      store.pruneSeenCommits(clock() - SEEN_COMMITS_DAYS * 86_400_000);
      store.pruneLedger(clock());
      store.pruneUpstream(clock() - UPSTREAM_DAYS * 86_400_000);
      leagues.prune(clock());
    } catch (err) {
      log.error('prune failed', { error: errorMessage(err) });
    }
  };
  prune();

  const app = await buildHttp({
    config, store, log, clock, fetchImpl: opts.fetchImpl, leagues, game, github, onPush, context, parser, upstream, vault, pool,
    onSignIn: (userId) => {
      poller?.pollUser(userId).catch((err: unknown) => log.warn('first poll failed', { user: userId, error: errorMessage(err) }));
      void discovery?.pollUser(userId);
    },
  });

  let battleTimer: NodeJS.Timeout | null = null;
  let pruneTimer: NodeJS.Timeout | null = null;
  let closing = false;
  const fightDue = () => leagues.tick(clock());
  return {
    app,
    leagues,
    store,
    game,
    pool,
    poller,
    discovery,
    fightDue,
    async listen() {
      if (background) {
        // Battles are fought a slice at a time so a big night never blocks requests for long.
        battleTimer = setInterval(() => {
          try {
            fightDue();
          } catch (err) {
            log.error('battle tick failed', { error: errorMessage(err) });
          }
        }, BATTLE_CHECK_MS);
        battleTimer.unref();
        poller?.start();
        discovery?.start();
        upstream?.start();
        pruneTimer = setInterval(prune, PRUNE_EVERY_MS);
        pruneTimer.unref();
        setImmediate(fightDue);
      }
      const address = await app.listen({ port: config.port, host: config.host });
      log.info('codeclash listening', { address });
      return address;
    },
    async shutdown() {
      if (closing) return;
      closing = true;
      if (battleTimer) clearInterval(battleTimer);
      poller?.stop();
      discovery?.stop();
      upstream?.stop();
      if (pruneTimer) clearInterval(pruneTimer);
      await parser.close();
      await app.close();
      db.close();
      log.info('codeclash stopped');
    },
  };
}
