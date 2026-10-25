import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { openDb, Store } from './db.ts';
import { DifficultyContext } from './difficulty.ts';
import { createGithubClient, type GithubClient } from './github.ts';
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

const SEEN_COMMITS_DAYS = 14;
const CHAT_DAYS = 30;
const SNAPSHOT_DAYS = 14;
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
  const github = config.githubToken ? createGithubClient(config.githubToken, opts.fetchImpl) : null;
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
  const poller = github ? new Poller({ store, github, log, clock, onPush, context, parser }) : null;

  if (!github) log.warn('GITHUB_TOKEN is not set: pushes are not ingested; only sparring bots fight');
  if (config.sessionSecretGenerated) log.warn('SESSION_SECRET is not set: using a random secret, sessions end on restart');
  if (config.devAuth) log.warn('DEV_AUTH=1: /auth/dev signs in as any login without OAuth');

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
    } catch (err) {
      log.error('prune failed', { error: errorMessage(err) });
    }
  };
  prune();

  const app = await buildHttp({
    config, store, log, clock, fetchImpl: opts.fetchImpl, hub, rooms, github, onPush, meta, preview, context, parser,
    onSignIn: (userId) => {
      poller?.pollUser(userId).catch((err: unknown) => log.warn('first poll failed', { user: userId, error: errorMessage(err) }));
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
    async listen() {
      if (background) {
        scheduler.start(clock);
        poller?.start();
        pruneTimer = setInterval(prune, PRUNE_EVERY_MS);
        pruneTimer.unref();
      }
      const address = await app.listen({ port: config.port, host: config.host });
      log.info('pushfront listening', { address });
      return address;
    },
    async shutdown() {
      if (closing) return;
      closing = true;
      scheduler.stop();
      poller?.stop();
      if (pruneTimer) clearInterval(pruneTimer);
      rooms.snapshotAll();
      hub.closeAll();
      await parser.close();
      await app.close();
      db.close();
      log.info('pushfront stopped');
    },
  };
}
