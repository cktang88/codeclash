import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { openDb, Store } from './db.ts';
import { DifficultyContext } from './difficulty.ts';
import { Discovery } from './discovery.ts';
import { createGithubClient, type GithubClient } from './github.ts';
import { GithubPool } from './githubPool.ts';
import { TokenVault } from './tokens.ts';
import { buildHttp } from './http.ts';
import { Hub } from './hub.ts';
import { Meta } from './meta.ts';
import { consoleLogger, errorMessage, type Logger } from './log.ts';
import { Mirror } from './mirror.ts';
import { createParser } from './parsePool.ts';
import { Poller, type PushReport } from './poller.ts';
import { Preview } from './preview.ts';
import { Rooms } from './rooms.ts';
import { Scheduler } from './scheduler.ts';
import { UpstreamWatcher } from './upstream.ts';

const SEEN_COMMITS_DAYS = 14;
const CHAT_DAYS = 30;
const SNAPSHOT_DAYS = 14;
/** Forks' pending bonus rows outlive their 14-day search by a fortnight, for the record. */
const UPSTREAM_DAYS = 28;
const PRUNE_EVERY_MS = 6 * 3_600_000;
/** GitHub requests the army preview leaves to ingestion when it shares the server's token. */
const PREVIEW_RESERVE = 1500;

export interface Server {
  app: FastifyInstance;
  rooms: Rooms;
  scheduler: Scheduler;
  store: Store;
  hub: Hub;
  meta: Meta;
  pool: GithubPool;
  poller: Poller | null;
  discovery: Discovery | null;
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
    random?: () => number;
    /** GitHub for the army preview only (tests, fixtures); by default the server's own client. */
    previewGithub?: GithubClient;
    /** The server's GitHub client (tests); by default one for GITHUB_TOKEN. */
    github?: GithubClient | null;
    /** Makes a player's GitHub client from their token (tests); by default a real one. */
    tokenClient?: (token: string) => GithubClient;
  } = {},
): Promise<Server> {
  const log = opts.log ?? consoleLogger;
  const clock = opts.clock ?? Date.now;
  const background = opts.background ?? true;
  const db = openDb(config.databasePath);
  const store = new Store(db);
  const hub = new Hub(clock);
  const meta = new Meta({ store, log, channelFor: (roomId) => hub.channel(roomId) });
  const rooms = new Rooms({
    store,
    log,
    channelFor: (roomId) => hub.channel(roomId),
    viewersOf: (roomId) => hub.viewers(roomId),
    config: { dayMs: config.dayMs, maxRoomsPerUser: config.maxRoomsPerUser, maxLiveRooms: config.maxLiveRooms, publicUrl: config.publicUrl },
    random: opts.random,
    fetchImpl: opts.fetchImpl,
    meta,
  });
  const scheduler = new Scheduler(rooms, log);
  const github = opts.github !== undefined ? opts.github : config.githubToken ? createGithubClient(config.githubToken, opts.fetchImpl) : null;
  // Players' sign-in tokens, sealed at rest; each player's ingestion runs on their own token when it can.
  const vault = TokenVault.fromSecrets({ tokenKey: config.tokenKey, sessionSecret: config.sessionSecretGenerated ? null : config.sessionSecret });
  const pool = new GithubPool({ store, vault, server: github, create: opts.tokenClient ?? ((token) => createGithubClient(token, opts.fetchImpl)), clock, log });
  // The preview reads with the server's token and leaves ingestion a fair share of its rate limit;
  // with no token it reads anonymously (60 requests an hour, about four uncached previews).
  // The difficulty bonus reads each push's context (GraphQL blame, then a local mirror) before it is
  // recorded; parsing runs in worker threads so tree-sitter never blocks the wars.
  const mirror = config.mirrorDir ? new Mirror({ dir: config.mirrorDir, clock }) : null;
  const context = github ? new DifficultyContext({ github, clock, mirror, log }) : null;
  const parser = createParser(config.parseWorkers);
  const previewGithub = opts.previewGithub ?? github ?? createGithubClient(null, opts.fetchImpl);
  const preview = new Preview({
    github: previewGithub,
    clock,
    reserve: !opts.previewGithub && github ? PREVIEW_RESERVE : 0,
    context: previewGithub === github && context ? context : new DifficultyContext({ github: previewGithub, clock, mirror, log }),
  });
  const onPush = (report: PushReport) => {
    const raised = rooms.onPush(report, clock());
    log.info('push', { user: report.userId, repo: report.repo, lines: report.lines, bonus: report.bonus ?? 0, rooms: raised });
  };
  // Discovery finds pushes before the events feed brings them, on players' own tokens only.
  const discovery = github ? new Discovery({ store, pool, log, clock, onPush, context, parser }) : null;
  const poller = github
    ? new Poller({ store, github, log, clock, onPush, context, parser, pool, onPushEvent: (userId, repo, at) => discovery?.noteEvent(userId, repo, at) })
    : null;
  // Forks' deferred bonus: found upstream once a day (or when a webhook reports a merge), credited once.
  const upstream = github
    ? new UpstreamWatcher({
        store, github, clock, log, pool,
        onReward: (r) => {
          const rooms_ = rooms.onUpstream(r, clock());
          log.info('upstream bonus', { user: r.userId, repo: r.repo, upstream: r.upstream, day: r.day, bonus: r.bonus, rooms: rooms_ });
        },
      })
    : null;

  if (!github) log.warn('GITHUB_TOKEN is not set: pushes are not ingested; only sparring bots fight');
  if (config.sessionSecretGenerated) log.warn('SESSION_SECRET is not set: using a random secret, sessions end on restart');
  if (config.devAuth) log.warn('DEV_AUTH=1: /auth/dev signs in as any login without OAuth');
  if (config.oauth && vault.source === 'random') log.warn('TOKEN_KEY is not set: players\' stored GitHub tokens are sealed with a random key and will not survive a restart');
  else if (config.oauth && vault.source === 'SESSION_SECRET') log.warn('TOKEN_KEY is not set: players\' GitHub tokens are sealed with a key derived from SESSION_SECRET (development only)');

  const now = clock();
  rooms.boot(now);
  if (config.commons) rooms.seedCommons(now);
  const prune = () => {
    // Runs from a timer: a throw here would be an uncaught exception and take the whole server down.
    try {
      store.pruneSeenCommits(clock() - SEEN_COMMITS_DAYS * 86_400_000);
      store.pruneChat(clock() - CHAT_DAYS * 86_400_000);
      store.pruneLedger(clock());
      store.pruneEndedSnapshots(clock() - SNAPSHOT_DAYS * 86_400_000);
      store.pruneUpstream(clock() - UPSTREAM_DAYS * 86_400_000);
    } catch (err) {
      log.error('prune failed', { error: errorMessage(err) });
    }
  };
  prune();

  const app = await buildHttp({
    config, store, log, clock, fetchImpl: opts.fetchImpl, hub, rooms, github, onPush, meta, preview, context, parser, upstream, vault, pool,
    onSignIn: (userId) => {
      poller?.pollUser(userId).catch((err: unknown) => log.warn('first poll failed', { user: userId, error: errorMessage(err) }));
      void discovery?.pollUser(userId);
    },
  });

  // Dedupe records and chat only matter while recent; keep them bounded on a long-running server too.
  let pruneTimer: NodeJS.Timeout | null = null;
  let closing = false;
  return {
    app,
    rooms,
    scheduler,
    store,
    hub,
    meta,
    pool,
    poller,
    discovery,
    async listen() {
      if (background) {
        scheduler.start(clock);
        poller?.start();
        discovery?.start();
        upstream?.start();
        pruneTimer = setInterval(prune, PRUNE_EVERY_MS);
        pruneTimer.unref();
      }
      const address = await app.listen({ port: config.port, host: config.host });
      log.info('codeclash listening', { address });
      return address;
    },
    async shutdown() {
      if (closing) return;
      closing = true;
      scheduler.stop();
      poller?.stop();
      discovery?.stop();
      upstream?.stop();
      if (pruneTimer) clearInterval(pruneTimer);
      rooms.snapshotAll();
      hub.closeAll();
      await parser.close();
      await app.close();
      db.close();
      log.info('codeclash stopped');
    },
  };
}
