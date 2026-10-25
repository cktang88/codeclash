import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage, TimelapseFrame, Visibility, WarStatus } from '../protocol.ts';
import type { Digest } from '../rules/digest.ts';
import type { Heraldry } from '../rules/meta.ts';
import type { LedgerStore } from '../rules/ledger.ts';
import type { ChronicleEntry } from '../sim/chronicle.ts';
import type { EncodedInput, RepoRef, ReplayPlayer } from '../sim/replay.ts';

export type Db = Database.Database;

export const SNAPSHOTS_KEPT_LIVE = 3;
/** A ledger balance stops counting 7 days after it last moved, and is deleted after 8. */
export const LEDGER_LIVE_MS = 7 * 24 * 3_600_000;
export const LEDGER_KEEP_MS = 8 * 24 * 3_600_000;

export interface UserRow {
  id: number;
  nodeId: string;
  login: string;
  avatarUrl: string;
  createdAtGithub: number;
  joinedAt: number;
  restingDay: string | null;
  hookSecret: string | null;
  eventsEtag: string | null;
  lastEventId: string | null;
  lastPolledAt: number | null;
  pollError: string | null;
  bot: boolean;
  /**
   * The player's stored GitHub sign-in token, described: never the token itself, which only
   * `Store.sealedToken` reads (encrypted) for the GitHub pool. Null: none stored.
   */
  token: TokenState | null;
}

export interface TokenState {
  /** False once GitHub refused it (401): the player must sign in again. */
  valid: boolean;
  /** The scopes GitHub granted (none is asked for: an empty string). */
  scopes: string;
  storedAt: number;
  invalidAt: number | null;
}

/** A repository the discovery poller watches for a player (server/discovery.ts). */
export interface WatchedRepo {
  userId: number;
  /** `owner/name` as last seen. */
  repo: string;
  /** Latest sign of the player's activity there (ms). */
  activeAt: number;
  source: 'push' | 'contrib' | 'repos';
  etag: string | null;
  /** Branch heads as last read; null until the first read (a baseline, nothing is synthesised from it). */
  heads: Record<string, string> | null;
  defaultBranch: string | null;
  checkedAt: number | null;
}

export interface DiscoveryState {
  userId: number;
  /** When `/user/repos` and the contributions query were last read. */
  reposAt: number | null;
  contribAt: number | null;
  /** The newest push of the player's we know of (events or discovery). */
  pushedAt: number | null;
  polledAt: number | null;
  /** The hour (ms / 3,600,000) the spend counter is for, and requests GitHub charged in it. */
  hour: number;
  spent: number;
}

export interface RoomRow {
  id: number;
  slug: string;
  name: string;
  ownerId: number;
  visibility: Visibility;
  invite: string;
  resetHour: number;
  bots: number;
  webhookUrl: string | null;
  createdAt: number;
}

export interface MemberRow {
  roomId: number;
  userId: number;
  role: 'owner' | 'member';
  joinedAt: number;
}

export interface WarHeader {
  players: (ReplayPlayer & { avatarUrl: string; userId: number; heraldry?: Heraldry })[];
  repos: RepoRef[];
}

export interface WarRow {
  id: number;
  roomId: number;
  day: string;
  status: WarStatus;
  seed: number;
  slots: number;
  members: number;
  startsAt: number;
  endsAt: number;
  header: WarHeader;
  digest: Digest | null;
  winnerLogin: string | null;
  winnerHue: number | null;
  winnerRenown: number | null;
  pushes: number;
}

export interface PushRecord {
  userId: number;
  pushId: string;
  repo: string;
  language: string | null;
  lines: number[];
  commits: number;
  message: string;
  at: number;
}

export interface LifetimeRow {
  userId: number;
  roomId: number;
  days: number;
  wins: number;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  kills: number;
  renown: number;
  awards: Record<string, number>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  node_id TEXT NOT NULL,
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at_github INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  resting_day TEXT,
  hook_secret TEXT,
  events_etag TEXT,
  last_event_id TEXT,
  last_polled_at INTEGER,
  poll_error TEXT,
  bot INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_login ON users(lower(login));
CREATE TABLE IF NOT EXISTS watched_repos (
  user_id INTEGER NOT NULL,
  repo_key TEXT NOT NULL,
  repo TEXT NOT NULL,
  active_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  etag TEXT,
  heads TEXT,
  default_branch TEXT,
  checked_at INTEGER,
  PRIMARY KEY (user_id, repo_key)
);
CREATE TABLE IF NOT EXISTS discovery (
  user_id INTEGER PRIMARY KEY,
  repos_at INTEGER,
  contrib_at INTEGER,
  pushed_at INTEGER,
  polled_at INTEGER,
  hour INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  visibility TEXT NOT NULL,
  invite TEXT NOT NULL,
  reset_hour INTEGER NOT NULL,
  bots INTEGER NOT NULL,
  webhook_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_members (
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_members_user ON room_members(user_id);
CREATE TABLE IF NOT EXISTS wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  seed INTEGER NOT NULL,
  slots INTEGER NOT NULL,
  members INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  header TEXT NOT NULL,
  digest TEXT,
  winner_login TEXT,
  winner_hue INTEGER,
  winner_renown INTEGER,
  pushes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wars_room ON wars(room_id, starts_at);
CREATE TABLE IF NOT EXISTS war_inputs (
  war_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (war_id, seq)
);
CREATE TABLE IF NOT EXISTS war_snapshots (
  war_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  json TEXT NOT NULL,
  checksum INTEGER NOT NULL,
  PRIMARY KEY (war_id, tick)
);
CREATE TABLE IF NOT EXISTS chronicle (
  war_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (war_id, seq)
);
CREATE TABLE IF NOT EXISTS pushes (
  user_id INTEGER NOT NULL,
  push_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, push_id)
);
CREATE TABLE IF NOT EXISTS seen_commits (
  user_id INTEGER NOT NULL,
  sha TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, sha)
);
CREATE TABLE IF NOT EXISTS war_frames (
  war_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (war_id, tick)
);
CREATE TABLE IF NOT EXISTS line_ledger (
  user_id INTEGER NOT NULL,
  repo TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  balance INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, repo, scope, key)
);
CREATE INDEX IF NOT EXISTS line_ledger_at ON line_ledger(at);
CREATE TABLE IF NOT EXISTS code_tally (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  code INTEGER NOT NULL,
  branches INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS upstream_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  push_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  upstream TEXT NOT NULL,
  branch TEXT NOT NULL,
  ref TEXT NOT NULL,
  head TEXT NOT NULL,
  shas TEXT NOT NULL,
  patch_id TEXT,
  day INTEGER NOT NULL,
  at INTEGER NOT NULL,
  bonus_milli INTEGER NOT NULL,
  effort_milli INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  checks INTEGER NOT NULL DEFAULT 0,
  next_check_at INTEGER NOT NULL,
  found_at INTEGER,
  settled INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, push_id, head)
);
CREATE INDEX IF NOT EXISTS upstream_pending_due ON upstream_pending(status, next_check_at);
CREATE INDEX IF NOT EXISTS upstream_pending_day ON upstream_pending(user_id, day);
CREATE TABLE IF NOT EXISTS upstream_days (
  user_id INTEGER NOT NULL,
  day INTEGER NOT NULL,
  bonus_milli INTEGER NOT NULL DEFAULT 0,
  effort_milli INTEGER NOT NULL DEFAULT 0,
  credited INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS upstream_paid (
  user_id INTEGER NOT NULL,
  day INTEGER NOT NULL,
  lines INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_room ON chat(room_id, id);
CREATE TABLE IF NOT EXISTS lifetime (
  user_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  days INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,
  kills INTEGER NOT NULL DEFAULT 0,
  renown INTEGER NOT NULL DEFAULT 0,
  awards TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, room_id)
);
`;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = OFF');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Columns added after a table first shipped; CREATE TABLE IF NOT EXISTS leaves older files without them. */
const ADDED_COLUMNS: Record<string, [string, string][]> = {
  users: [
    // The player's sign-in token, AES-256-GCM sealed (server/tokens.ts); never selected into a UserRow.
    ['token_enc', 'TEXT'],
    ['token_scopes', 'TEXT'],
    ['token_stored_at', 'INTEGER'],
    ['token_invalid_at', 'INTEGER'],
  ],
};

function migrate(db: Db): void {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    for (const [name, type] of columns) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

type Raw = Record<string, unknown>;

/** A fork's diff whose bonus waits until its commits reach the upstream (server/upstream.ts). */
export interface UpstreamPending {
  id: number;
  userId: number;
  pushId: string;
  /** The fork. */
  repo: string;
  /** Where its commits must land: the upstream repository and its default branch. */
  upstream: string;
  branch: string;
  /** The fork's branch the push went to (for finding its pull requests). */
  ref: string;
  /** The diff's newest commit, and all of the user's own commits it measured. */
  head: string;
  shas: string[];
  /** The diff's patch id (server/upstream.ts `patchId`): a squash or rebase of it has the same one. */
  patchId: string | null;
  /** UTC day number of the push, and when it was pushed (ms). */
  day: number;
  at: number;
  /** The bonus waiting, frozen at push time (rules/difficulty.ts `PendingBonus`): signed, before the day's caps. */
  bonusMilli: number;
  effortMilli: number;
  status: 'pending' | 'upstream' | 'expired';
  checks: number;
  nextCheckAt: number;
  foundAt: number | null;
  settled: boolean;
}

function pendingRow(r: Raw): UpstreamPending {
  return {
    id: r.id as number,
    userId: r.user_id as number,
    pushId: r.push_id as string,
    repo: r.repo as string,
    upstream: r.upstream as string,
    branch: r.branch as string,
    ref: r.ref as string,
    head: r.head as string,
    shas: JSON.parse(r.shas as string) as string[],
    patchId: (r.patch_id as string | null) ?? null,
    day: r.day as number,
    at: r.at as number,
    bonusMilli: r.bonus_milli as number,
    effortMilli: r.effort_milli as number,
    status: r.status as UpstreamPending['status'],
    checks: r.checks as number,
    nextCheckAt: r.next_check_at as number,
    foundAt: (r.found_at as number | null) ?? null,
    settled: r.settled === 1,
  };
}

function userRow(r: Raw): UserRow {
  return {
    id: r.id as number,
    nodeId: r.node_id as string,
    login: r.login as string,
    avatarUrl: r.avatar_url as string,
    createdAtGithub: r.created_at_github as number,
    joinedAt: r.joined_at as number,
    restingDay: (r.resting_day as string | null) ?? null,
    hookSecret: (r.hook_secret as string | null) ?? null,
    eventsEtag: (r.events_etag as string | null) ?? null,
    lastEventId: (r.last_event_id as string | null) ?? null,
    lastPolledAt: (r.last_polled_at as number | null) ?? null,
    pollError: (r.poll_error as string | null) ?? null,
    bot: r.bot === 1,
    token:
      r.token_enc != null
        ? { valid: r.token_invalid_at == null, scopes: (r.token_scopes as string | null) ?? '', storedAt: (r.token_stored_at as number | null) ?? 0, invalidAt: (r.token_invalid_at as number | null) ?? null }
        : null,
  };
}

function watchedRow(r: Raw): WatchedRepo {
  return {
    userId: r.user_id as number,
    repo: r.repo as string,
    activeAt: r.active_at as number,
    source: r.source as WatchedRepo['source'],
    etag: (r.etag as string | null) ?? null,
    heads: r.heads ? (JSON.parse(r.heads as string) as Record<string, string>) : null,
    defaultBranch: (r.default_branch as string | null) ?? null,
    checkedAt: (r.checked_at as number | null) ?? null,
  };
}

function roomRow(r: Raw): RoomRow {
  return {
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    ownerId: r.owner_id as number,
    visibility: r.visibility as Visibility,
    invite: r.invite as string,
    resetHour: r.reset_hour as number,
    bots: r.bots as number,
    webhookUrl: (r.webhook_url as string | null) ?? null,
    createdAt: r.created_at as number,
  };
}

function warRow(r: Raw): WarRow {
  return {
    id: r.id as number,
    roomId: r.room_id as number,
    day: r.day as string,
    status: r.status as WarStatus,
    seed: r.seed as number,
    slots: r.slots as number,
    members: r.members as number,
    startsAt: r.starts_at as number,
    endsAt: r.ends_at as number,
    header: JSON.parse(r.header as string) as WarHeader,
    digest: r.digest ? (JSON.parse(r.digest as string) as Digest) : null,
    winnerLogin: (r.winner_login as string | null) ?? null,
    winnerHue: (r.winner_hue as number | null) ?? null,
    winnerRenown: (r.winner_renown as number | null) ?? null,
    pushes: r.pushes as number,
  };
}

function lifetimeRow(r: Raw): LifetimeRow {
  return {
    userId: r.user_id as number,
    roomId: r.room_id as number,
    days: r.days as number,
    wins: r.wins as number,
    streak: r.streak as number,
    bestStreak: r.best_streak as number,
    lastDay: (r.last_day as string | null) ?? null,
    kills: r.kills as number,
    renown: r.renown as number,
    awards: JSON.parse(r.awards as string) as Record<string, number>,
  };
}

export class Store {
  constructor(readonly db: Db) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ------------------------------------------------------------ users

  upsertUser(u: Pick<UserRow, 'id' | 'nodeId' | 'login' | 'avatarUrl' | 'createdAtGithub' | 'joinedAt' | 'bot'>): void {
    this.db
      .prepare(
        `INSERT INTO users (id, node_id, login, avatar_url, created_at_github, joined_at, bot)
         VALUES (@id, @nodeId, @login, @avatarUrl, @createdAtGithub, @joinedAt, @bot)
         ON CONFLICT(id) DO UPDATE SET node_id = excluded.node_id, login = excluded.login, avatar_url = excluded.avatar_url`,
      )
      .run({ ...u, bot: u.bot ? 1 : 0 });
  }

  user(id: number): UserRow | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Raw | undefined;
    return r ? userRow(r) : null;
  }

  userByLogin(login: string): UserRow | null {
    const r = this.db.prepare('SELECT * FROM users WHERE lower(login) = lower(?) ORDER BY bot, id LIMIT 1').get(login) as Raw | undefined;
    return r ? userRow(r) : null;
  }

  /** Real users who belong to at least one room: the ones worth polling. */
  pollableUsers(): UserRow[] {
    return (this.db
      .prepare('SELECT u.* FROM users u WHERE u.bot = 0 AND EXISTS (SELECT 1 FROM room_members m WHERE m.user_id = u.id) ORDER BY coalesce(u.last_polled_at, 0), u.id')
      .all() as Raw[]).map(userRow);
  }

  setPollState(id: number, s: { etag: string | null; lastEventId: string | null; at: number; error: string | null }): void {
    this.db
      .prepare('UPDATE users SET events_etag = ?, last_event_id = ?, last_polled_at = ?, poll_error = ? WHERE id = ?')
      .run(s.etag, s.lastEventId, s.at, s.error, id);
  }

  setRestingDay(id: number, day: string | null): void {
    this.db.prepare('UPDATE users SET resting_day = ? WHERE id = ?').run(day, id);
  }

  setHookSecret(id: number, secret: string): void {
    this.db.prepare('UPDATE users SET hook_secret = ? WHERE id = ?').run(secret, id);
  }

  // ------------------------------------------------------------ players' GitHub tokens

  /** Stores a player's sealed sign-in token (server/tokens.ts), replacing any earlier one, valid again. */
  setToken(id: number, sealed: string, scopes: string, at: number): void {
    this.db.prepare('UPDATE users SET token_enc = ?, token_scopes = ?, token_stored_at = ?, token_invalid_at = NULL WHERE id = ?').run(sealed, scopes, at, id);
  }

  /** The player's sealed token while GitHub still accepts it; null when none is stored or it was refused. */
  sealedToken(id: number): string | null {
    const r = this.db.prepare('SELECT token_enc FROM users WHERE id = ? AND token_invalid_at IS NULL').get(id) as { token_enc: string | null } | undefined;
    return r?.token_enc ?? null;
  }

  /** GitHub refused the token (401): it is kept only as a flag for the player, never used again. */
  invalidateToken(id: number, at: number): void {
    this.db.prepare('UPDATE users SET token_invalid_at = coalesce(token_invalid_at, ?), token_enc = CASE WHEN token_enc IS NULL THEN NULL ELSE \'\' END WHERE id = ?').run(at, id);
  }

  /** Disconnect: the token and everything discovery kept with it are deleted. */
  deleteToken(id: number): void {
    this.transaction(() => {
      this.db.prepare('UPDATE users SET token_enc = NULL, token_scopes = NULL, token_stored_at = NULL, token_invalid_at = NULL WHERE id = ?').run(id);
      this.db.prepare('DELETE FROM watched_repos WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM discovery WHERE user_id = ?').run(id);
    });
  }

  /**
   * Deletes a player's account: their token, discovery state, memberships, push records, seen commits,
   * ledger, forks' pending rows and lifetime records, then the user row. Wars already fought keep their
   * headers (the room's history), where the player then reads as unknown.
   */
  deleteUser(id: number): void {
    this.transaction(() => {
      for (const table of ['watched_repos', 'discovery', 'room_members', 'pushes', 'seen_commits', 'line_ledger', 'code_tally', 'upstream_pending', 'upstream_days', 'upstream_paid', 'lifetime', 'chat']) {
        this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
      }
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
  }

  // ------------------------------------------------------------ discovery (server/discovery.ts)

  /** Notes the player's activity in a repository; the newest sign wins, and the row keeps its read state. */
  noteRepo(userId: number, repo: string, at: number, source: WatchedRepo['source'], defaultBranch: string | null = null): void {
    this.db
      .prepare(
        `INSERT INTO watched_repos (user_id, repo_key, repo, active_at, source, default_branch) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, repo_key) DO UPDATE SET active_at = max(active_at, excluded.active_at),
           source = CASE WHEN excluded.active_at > active_at THEN excluded.source ELSE source END,
           default_branch = coalesce(excluded.default_branch, default_branch)`,
      )
      .run(userId, repo.toLowerCase(), repo, at, source, defaultBranch);
  }

  /** The player's watched repositories, most recently active first. */
  watchedRepos(userId: number): WatchedRepo[] {
    return (this.db.prepare('SELECT * FROM watched_repos WHERE user_id = ? ORDER BY active_at DESC, repo_key').all(userId) as Raw[]).map(watchedRow);
  }

  /** Records a read of a watched repository; `repo` may be its new name after a rename. */
  setWatchedState(userId: number, repoKey: string, s: { repo: string; etag: string | null; heads: Record<string, string> | null; defaultBranch: string | null; checkedAt: number }): void {
    const key = s.repo.toLowerCase();
    this.transaction(() => {
      if (key !== repoKey.toLowerCase()) {
        // Renamed: the row moves to the new name (merging into it if the new name is watched already).
        const old = this.db.prepare('SELECT active_at, source FROM watched_repos WHERE user_id = ? AND repo_key = ?').get(userId, repoKey.toLowerCase()) as Raw | undefined;
        this.db.prepare('DELETE FROM watched_repos WHERE user_id = ? AND repo_key = ?').run(userId, repoKey.toLowerCase());
        if (old) this.noteRepo(userId, s.repo, old.active_at as number, old.source as WatchedRepo['source'], s.defaultBranch);
      }
      this.db
        .prepare('UPDATE watched_repos SET repo = ?, etag = ?, heads = ?, default_branch = ?, checked_at = ? WHERE user_id = ? AND repo_key = ?')
        .run(s.repo, s.etag, s.heads ? JSON.stringify(s.heads) : null, s.defaultBranch, s.checkedAt, userId, key);
    });
  }

  unwatchRepo(userId: number, repo: string): void {
    this.db.prepare('DELETE FROM watched_repos WHERE user_id = ? AND repo_key = ?').run(userId, repo.toLowerCase());
  }

  /** Keeps the player's `keep` most recently active repositories, and none quiet since `before`. */
  trimWatched(userId: number, keep: number, before: number): void {
    this.db
      .prepare('DELETE FROM watched_repos WHERE user_id = ? AND (active_at < ? OR repo_key NOT IN (SELECT repo_key FROM watched_repos WHERE user_id = ? ORDER BY active_at DESC, repo_key LIMIT ?))')
      .run(userId, before, userId, keep);
  }

  discoveryState(userId: number): DiscoveryState {
    const r = this.db.prepare('SELECT * FROM discovery WHERE user_id = ?').get(userId) as Raw | undefined;
    return {
      userId,
      reposAt: (r?.repos_at as number | null | undefined) ?? null,
      contribAt: (r?.contrib_at as number | null | undefined) ?? null,
      pushedAt: (r?.pushed_at as number | null | undefined) ?? null,
      polledAt: (r?.polled_at as number | null | undefined) ?? null,
      hour: (r?.hour as number | undefined) ?? 0,
      spent: (r?.spent as number | undefined) ?? 0,
    };
  }

  setDiscoveryState(s: DiscoveryState): void {
    this.db
      .prepare(
        `INSERT INTO discovery (user_id, repos_at, contrib_at, pushed_at, polled_at, hour, spent) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET repos_at = excluded.repos_at, contrib_at = excluded.contrib_at, pushed_at = excluded.pushed_at,
           polled_at = excluded.polled_at, hour = excluded.hour, spent = excluded.spent`,
      )
      .run(s.userId, s.reposAt, s.contribAt, s.pushedAt, s.polledAt, s.hour, s.spent);
  }

  /** Notes a push of the player's (from any path), so discovery polls faster while they are at work. */
  notePushedAt(userId: number, at: number): void {
    this.db
      .prepare('INSERT INTO discovery (user_id, pushed_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET pushed_at = max(coalesce(pushed_at, 0), excluded.pushed_at)')
      .run(userId, at);
  }

  // ----------------------------------------------------------- pushes

  /** Records a push once. Returns false if this push id was already recorded. */
  recordPush(p: PushRecord): boolean {
    const res = this.db
      .prepare('INSERT OR IGNORE INTO pushes (user_id, push_id, repo, at, data) VALUES (?, ?, ?, ?, ?)')
      .run(p.userId, p.pushId, p.repo, p.at, JSON.stringify(p));
    return res.changes > 0;
  }

  // ----------------------------------------------------------- forks' deferred bonus

  /** Records a fork diff's pending bonus, once per (push, head). */
  addUpstreamPending(p: Omit<UpstreamPending, 'id' | 'status' | 'checks' | 'foundAt' | 'settled'>): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO upstream_pending (user_id, push_id, repo, upstream, branch, ref, head, shas, patch_id, day, at, bonus_milli, effort_milli, next_check_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(p.userId, p.pushId, p.repo, p.upstream, p.branch, p.ref, p.head, JSON.stringify(p.shas), p.patchId, p.day, p.at, p.bonusMilli, p.effortMilli, p.nextCheckAt);
  }

  /** Pending rows due for a check, oldest due first. */
  dueUpstream(now: number, limit: number): UpstreamPending[] {
    return (this.db.prepare("SELECT * FROM upstream_pending WHERE status = 'pending' AND next_check_at <= ? ORDER BY next_check_at, id LIMIT ?").all(now, limit) as Raw[]).map(pendingRow);
  }

  upstreamPendingOf(userId: number): UpstreamPending[] {
    return (this.db.prepare('SELECT * FROM upstream_pending WHERE user_id = ? ORDER BY id').all(userId) as Raw[]).map(pendingRow);
  }

  updateUpstream(id: number, u: { status: UpstreamPending['status']; checks: number; nextCheckAt: number; foundAt?: number | null }): void {
    this.db.prepare('UPDATE upstream_pending SET status = ?, checks = ?, next_check_at = ?, found_at = coalesce(?, found_at) WHERE id = ?').run(u.status, u.checks, u.nextCheckAt, u.foundAt ?? null, id);
  }

  /** Makes a user's pending rows for `upstream` due now (a merged pull request was reported there). */
  wakeUpstream(userId: number, upstream: string, now: number): number {
    return this.db.prepare("UPDATE upstream_pending SET next_check_at = ? WHERE user_id = ? AND lower(upstream) = lower(?) AND status = 'pending' AND next_check_at > ?").run(now, userId, upstream, now).changes;
  }

  /** (user, day) pairs with rows found upstream and not yet settled, for days before `beforeDay`. */
  unsettledUpstreamDays(beforeDay: number): { userId: number; day: number }[] {
    return (this.db.prepare("SELECT DISTINCT user_id, day FROM upstream_pending WHERE status = 'upstream' AND settled = 0 AND day < ? ORDER BY day, user_id").all(beforeDay) as Raw[]).map((r) => ({ userId: r.user_id as number, day: r.day as number }));
  }

  /** Every row of a user's day found upstream, settled or not: what that day's reward is computed from. */
  confirmedUpstream(userId: number, day: number): UpstreamPending[] {
    return (this.db.prepare("SELECT * FROM upstream_pending WHERE user_id = ? AND day = ? AND status = 'upstream' ORDER BY id").all(userId, day) as Raw[]).map(pendingRow);
  }

  settleUpstream(userId: number, day: number): void {
    this.db.prepare("UPDATE upstream_pending SET settled = 1 WHERE user_id = ? AND day = ? AND status = 'upstream'").run(userId, day);
  }

  /** The day's bonus that paid at once (raw, before the caps) and the upstream reward credited for it so far. */
  upstreamDay(userId: number, day: number): { bonusMilli: number; effortMilli: number; credited: number } {
    const r = this.db.prepare('SELECT bonus_milli, effort_milli, credited FROM upstream_days WHERE user_id = ? AND day = ?').get(userId, day) as Raw | undefined;
    return r ? { bonusMilli: r.bonus_milli as number, effortMilli: r.effort_milli as number, credited: r.credited as number } : { bonusMilli: 0, effortMilli: 0, credited: 0 };
  }

  /** Records the day's raw immediate bonus totals as they stand after a push. */
  setUpstreamDayTotals(userId: number, day: number, bonusMilli: number, effortMilli: number): void {
    this.db
      .prepare('INSERT INTO upstream_days (user_id, day, bonus_milli, effort_milli) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET bonus_milli = excluded.bonus_milli, effort_milli = excluded.effort_milli')
      .run(userId, day, bonusMilli, effortMilli);
  }

  addUpstreamCredit(userId: number, day: number, lines: number): void {
    this.db.prepare('INSERT INTO upstream_days (user_id, day, credited) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET credited = credited + excluded.credited').run(userId, day, lines);
  }

  /** Upstream reward lines credited to the user on UTC day `day` (whatever days they were for). */
  upstreamPaid(userId: number, day: number): number {
    return ((this.db.prepare('SELECT lines FROM upstream_paid WHERE user_id = ? AND day = ?').get(userId, day) as Raw | undefined)?.lines as number | undefined) ?? 0;
  }

  addUpstreamPaid(userId: number, day: number, lines: number): void {
    this.db.prepare('INSERT INTO upstream_paid (user_id, day, lines) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET lines = lines + excluded.lines').run(userId, day, lines);
  }

  /** Drops forks' pending rows and day totals older than `before` (ms). */
  pruneUpstream(before: number): void {
    this.db.prepare('DELETE FROM upstream_paid WHERE day < ?').run(Math.floor(before / 86_400_000));
    this.db.prepare('DELETE FROM upstream_pending WHERE at < ?').run(before);
    this.db.prepare('DELETE FROM upstream_days WHERE day < ?').run(Math.floor(before / 86_400_000));
  }

  hasPush(userId: number, pushId: string): boolean {
    return this.db.prepare('SELECT 1 FROM pushes WHERE user_id = ? AND push_id = ?').get(userId, pushId) !== undefined;
  }

  /** The commits not yet seen for this user, without claiming them. */
  unseenCommits(userId: number, shas: readonly string[]): string[] {
    const seen = this.db.prepare('SELECT 1 FROM seen_commits WHERE user_id = ? AND sha = ?');
    return shas.filter((sha) => seen.get(userId, sha) === undefined);
  }

  /** Marks commits as seen and returns the ones that were new. */
  claimCommits(userId: number, shas: readonly string[], at: number): string[] {
    const insert = this.db.prepare('INSERT OR IGNORE INTO seen_commits (user_id, sha, at) VALUES (?, ?, ?)');
    const fresh: string[] = [];
    this.transaction(() => {
      for (const sha of shas) if (insert.run(userId, sha, at).changes > 0) fresh.push(sha);
    });
    return fresh;
  }

  /**
   * The user's line ledger for one repository. Balances last LEDGER_LIVE_MS since they
   * last moved; the code tally is per UTC day. Keys are hashed to bound row size.
   */
  ledgerFor(userId: number, repo: string, now: number): LedgerStore {
    const live = now - LEDGER_LIVE_MS;
    const day = new Date(now).toISOString().slice(0, 10);
    const get = this.db.prepare('SELECT balance FROM line_ledger WHERE user_id = ? AND repo = ? AND scope = ? AND key = ? AND at >= ?');
    const put = this.db.prepare('INSERT INTO line_ledger (user_id, repo, scope, key, balance, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, repo, scope, key) DO UPDATE SET balance = excluded.balance, at = excluded.at');
    const drop = this.db.prepare('DELETE FROM line_ledger WHERE user_id = ? AND repo = ? AND scope = ? AND key = ?');
    const tally = this.db.prepare('SELECT code, branches FROM code_tally WHERE user_id = ? AND day = ?');
    const setTally = this.db.prepare('INSERT INTO code_tally (user_id, day, code, branches) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET code = excluded.code, branches = excluded.branches');
    const hash = (text: string) => createHash('sha1').update(text).digest('base64url');
    // A file's scope belongs to its repository; every other scope is the user's across all
    // repositories, so code copied or moved between repositories counts once.
    const repoOf = (scope: string) => (scope === '' || /^[\u0000-\u001f]/.test(scope) ? '*' : repo.toLowerCase());
    return {
      balance: (scope, key) => ((get.get(userId, repoOf(scope), hash(scope), hash(key), live) as { balance: number } | undefined)?.balance ?? 0),
      setBalance: (scope, key, balance) => {
        if (balance === 0) drop.run(userId, repoOf(scope), hash(scope), hash(key));
        else put.run(userId, repoOf(scope), hash(scope), hash(key), balance, now);
      },
      daily: () => (tally.get(userId, day) as { code: number; branches: number } | undefined) ?? { code: 0, branches: 0 },
      setDaily: (code, branches) => void setTally.run(userId, day, code, branches),
      day: () => Math.floor(now / 86_400_000),
    };
  }

  pruneLedger(now: number): void {
    this.db.prepare('DELETE FROM line_ledger WHERE at < ?').run(now - LEDGER_KEEP_MS);
    this.db.prepare('DELETE FROM code_tally WHERE day < ?').run(new Date(now - LEDGER_KEEP_MS).toISOString().slice(0, 10));
  }

  pruneSeenCommits(before: number): void {
    this.db.prepare('DELETE FROM seen_commits WHERE at < ?').run(before);
    this.db.prepare('DELETE FROM pushes WHERE at < ?').run(before);
  }

  pruneChat(before: number): void {
    this.db.prepare('DELETE FROM chat WHERE at < ?').run(before);
  }

  // ------------------------------------------------------------ rooms

  insertRoom(r: Omit<RoomRow, 'id'>): number {
    const res = this.db
      .prepare(
        `INSERT INTO rooms (slug, name, owner_id, visibility, invite, reset_hour, bots, webhook_url, created_at)
         VALUES (@slug, @name, @ownerId, @visibility, @invite, @resetHour, @bots, @webhookUrl, @createdAt)`,
      )
      .run(r);
    return Number(res.lastInsertRowid);
  }

  updateRoom(id: number, r: Partial<Pick<RoomRow, 'name' | 'visibility' | 'resetHour' | 'bots' | 'webhookUrl' | 'invite'>>): void {
    const cols: Record<string, string> = { name: 'name', visibility: 'visibility', resetHour: 'reset_hour', bots: 'bots', webhookUrl: 'webhook_url', invite: 'invite' };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(r)) {
      if (v === undefined || !cols[k]) continue;
      sets.push(`${cols[k]} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }

  /** Deletes a room and everything it owns: wars and their logs, chat, and lifetime records. */
  deleteRoom(id: number): void {
    this.transaction(() => {
      for (const table of ['war_inputs', 'war_snapshots', 'chronicle', 'war_frames']) {
        this.db.prepare(`DELETE FROM ${table} WHERE war_id IN (SELECT id FROM wars WHERE room_id = ?)`).run(id);
      }
      this.db.prepare('DELETE FROM wars WHERE room_id = ?').run(id);
      this.db.prepare('DELETE FROM chat WHERE room_id = ?').run(id);
      this.db.prepare('DELETE FROM lifetime WHERE room_id = ?').run(id);
      this.db.prepare('DELETE FROM room_members WHERE room_id = ?').run(id);
      this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    });
  }

  room(id: number): RoomRow | null {
    const r = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Raw | undefined;
    return r ? roomRow(r) : null;
  }

  roomBySlug(slug: string): RoomRow | null {
    const r = this.db.prepare('SELECT * FROM rooms WHERE slug = ?').get(slug) as Raw | undefined;
    return r ? roomRow(r) : null;
  }

  rooms(): RoomRow[] {
    return (this.db.prepare('SELECT * FROM rooms ORDER BY id').all() as Raw[]).map(roomRow);
  }

  roomsOf(userId: number): RoomRow[] {
    return (this.db
      .prepare('SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id WHERE m.user_id = ? ORDER BY r.id')
      .all(userId) as Raw[]).map(roomRow);
  }

  addMember(roomId: number, userId: number, role: 'owner' | 'member', at: number): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(roomId, userId, role, at).changes > 0;
  }

  removeMember(roomId: number, userId: number): boolean {
    return this.db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, userId).changes > 0;
  }

  members(roomId: number): (MemberRow & { user: UserRow })[] {
    return (this.db
      .prepare('SELECT m.room_id, m.user_id, m.role, m.joined_at, u.* FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? ORDER BY m.joined_at, m.user_id')
      .all(roomId) as Raw[]).map((r) => ({
      roomId: r.room_id as number,
      userId: r.user_id as number,
      role: r.role as 'owner' | 'member',
      joinedAt: r.joined_at as number,
      user: userRow(r),
    }));
  }

  isMember(roomId: number, userId: number): boolean {
    return this.db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId) !== undefined;
  }

  // ------------------------------------------------------------- wars

  insertWar(w: Omit<WarRow, 'id' | 'digest' | 'winnerLogin' | 'winnerHue' | 'winnerRenown' | 'pushes'>): number {
    const res = this.db
      .prepare(
        `INSERT INTO wars (room_id, day, status, seed, slots, members, starts_at, ends_at, header)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(w.roomId, w.day, w.status, w.seed, w.slots, w.members, w.startsAt, w.endsAt, JSON.stringify(w.header));
    return Number(res.lastInsertRowid);
  }

  war(id: number): WarRow | null {
    const r = this.db.prepare('SELECT * FROM wars WHERE id = ?').get(id) as Raw | undefined;
    return r ? warRow(r) : null;
  }

  activeWar(roomId: number): WarRow | null {
    const r = this.db.prepare("SELECT * FROM wars WHERE room_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(roomId) as Raw | undefined;
    return r ? warRow(r) : null;
  }

  wars(roomId: number, limit: number): WarRow[] {
    return (this.db.prepare('SELECT * FROM wars WHERE room_id = ? ORDER BY starts_at DESC LIMIT ?').all(roomId, limit) as Raw[]).map(warRow);
  }

  updateWarHeader(id: number, header: WarHeader, pushes: number): void {
    this.db.prepare('UPDATE wars SET header = ?, pushes = ? WHERE id = ?').run(JSON.stringify(header), pushes, id);
  }

  endWar(id: number, end: { digest: Digest; winnerLogin: string | null; winnerHue: number | null; winnerRenown: number | null }): void {
    this.db
      .prepare("UPDATE wars SET status = 'ended', digest = ?, winner_login = ?, winner_hue = ?, winner_renown = ? WHERE id = ?")
      .run(JSON.stringify(end.digest), end.winnerLogin, end.winnerHue, end.winnerRenown, id);
  }

  appendInputs(warId: number, inputs: readonly { seq: number; tick: number; data: EncodedInput }[]): void {
    const stmt = this.db.prepare('INSERT INTO war_inputs (war_id, seq, tick, data) VALUES (?, ?, ?, ?)');
    for (const i of inputs) stmt.run(warId, i.seq, i.tick, JSON.stringify(i.data));
  }

  inputs(warId: number, fromTick = 0): { seq: number; tick: number; data: EncodedInput }[] {
    return (this.db.prepare('SELECT seq, tick, data FROM war_inputs WHERE war_id = ? AND tick >= ? ORDER BY tick, seq').all(warId, fromTick) as Raw[]).map((r) => ({
      seq: r.seq as number,
      tick: r.tick as number,
      data: JSON.parse(r.data as string) as EncodedInput,
    }));
  }

  maxSeq(warId: number): number {
    const r = this.db.prepare('SELECT max(seq) AS m FROM war_inputs WHERE war_id = ?').get(warId) as { m: number | null };
    return r.m ?? 0;
  }

  saveSnapshot(warId: number, tick: number, json: string, checksum: number): void {
    this.db.prepare('INSERT OR REPLACE INTO war_snapshots (war_id, tick, json, checksum) VALUES (?, ?, ?, ?)').run(warId, tick, json, checksum);
  }

  latestSnapshot(warId: number, atOrBefore = Number.MAX_SAFE_INTEGER): { tick: number; json: string; checksum: number } | null {
    const r = this.db.prepare('SELECT tick, json, checksum FROM war_snapshots WHERE war_id = ? AND tick <= ? ORDER BY tick DESC LIMIT 1').get(warId, atOrBefore) as Raw | undefined;
    return r ? { tick: r.tick as number, json: r.json as string, checksum: r.checksum as number } : null;
  }

  // ------------------------------------------------------- chronicle

  appendChronicle(warId: number, firstSeq: number, at: (tick: number) => number, entries: readonly ChronicleEntry[]): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO chronicle (war_id, seq, tick, at, data) VALUES (?, ?, ?, ?, ?)');
    entries.forEach((e, i) => stmt.run(warId, firstSeq + i, e.tick, at(e.tick), JSON.stringify(e)));
  }

  chronicleCount(warId: number): number {
    const r = this.db.prepare('SELECT count(*) AS n FROM chronicle WHERE war_id = ?').get(warId) as { n: number };
    return r.n;
  }

  chronicleTail(warId: number, limit: number): ChronicleEntry[] {
    return (this.db.prepare('SELECT data FROM chronicle WHERE war_id = ? ORDER BY seq DESC LIMIT ?').all(warId, limit) as Raw[])
      .map((r) => JSON.parse(r.data as string) as ChronicleEntry)
      .reverse();
  }

  chronicleSince(warId: number, since: number, limit: number): ChronicleEntry[] {
    // The newest entries matter most to a returning viewer; return them in order.
    return (this.db.prepare('SELECT data FROM chronicle WHERE war_id = ? AND at > ? ORDER BY seq DESC LIMIT ?').all(warId, since, limit) as Raw[])
      .map((r) => JSON.parse(r.data as string) as ChronicleEntry)
      .reverse();
  }

  chronicleAll(warId: number): ChronicleEntry[] {
    return (this.db.prepare('SELECT data FROM chronicle WHERE war_id = ? ORDER BY seq').all(warId) as Raw[]).map((r) => JSON.parse(r.data as string) as ChronicleEntry);
  }

  /** Keeps hourly keyframes and the most recent snapshots; older ones are only a cache. */
  pruneSnapshots(warId: number, keepFromTick: number, keyframeEvery: number): void {
    this.db.prepare('DELETE FROM war_snapshots WHERE war_id = ? AND tick < ? AND tick % ? != 0').run(warId, keepFromTick, keyframeEvery);
  }

  /** Drops all but the final snapshot of wars that ended before `before`; replays reseek from the inputs. */
  pruneEndedSnapshots(before: number): void {
    this.db
      .prepare(
        `DELETE FROM war_snapshots WHERE war_id IN (SELECT id FROM wars WHERE status = 'ended' AND ends_at < ?)
         AND tick < (SELECT MAX(s.tick) FROM war_snapshots s WHERE s.war_id = war_snapshots.war_id)`,
      )
      .run(before);
  }

  // ----------------------------------------------------------- frames

  saveFrame(warId: number, frame: TimelapseFrame): void {
    this.db.prepare('INSERT OR REPLACE INTO war_frames (war_id, tick, data) VALUES (?, ?, ?)').run(warId, frame.t, JSON.stringify(frame));
  }

  frames(warId: number): TimelapseFrame[] {
    return (this.db.prepare('SELECT data FROM war_frames WHERE war_id = ? ORDER BY tick').all(warId) as Raw[]).map((r) => JSON.parse(r.data as string) as TimelapseFrame);
  }

  // ------------------------------------------------------------- chat

  addChat(roomId: number, userId: number, at: number, text: string): number {
    return Number(this.db.prepare('INSERT INTO chat (room_id, user_id, at, text) VALUES (?, ?, ?, ?)').run(roomId, userId, at, text).lastInsertRowid);
  }

  chat(roomId: number, limit: number): ChatMessage[] {
    return (this.db
      .prepare('SELECT c.id, c.at, c.text, u.id AS uid, u.login, u.avatar_url FROM chat c JOIN users u ON u.id = c.user_id WHERE c.room_id = ? ORDER BY c.id DESC LIMIT ?')
      .all(roomId, limit) as Raw[])
      .map((r) => ({ id: r.id as number, at: r.at as number, text: r.text as string, user: { id: r.uid as number, login: r.login as string, avatarUrl: r.avatar_url as string } }))
      .reverse();
  }

  // --------------------------------------------------------- lifetime

  lifetime(userId: number, roomId: number): LifetimeRow | null {
    const r = this.db.prepare('SELECT * FROM lifetime WHERE user_id = ? AND room_id = ?').get(userId, roomId) as Raw | undefined;
    return r ? lifetimeRow(r) : null;
  }

  lifetimesOf(userId: number): LifetimeRow[] {
    return (this.db.prepare('SELECT * FROM lifetime WHERE user_id = ? ORDER BY room_id').all(userId) as Raw[]).map(lifetimeRow);
  }

  saveLifetime(l: LifetimeRow): void {
    this.db
      .prepare(
        `INSERT INTO lifetime (user_id, room_id, days, wins, streak, best_streak, last_day, kills, renown, awards)
         VALUES (@userId, @roomId, @days, @wins, @streak, @bestStreak, @lastDay, @kills, @renown, @awards)
         ON CONFLICT(user_id, room_id) DO UPDATE SET days = excluded.days, wins = excluded.wins, streak = excluded.streak,
           best_streak = excluded.best_streak, last_day = excluded.last_day, kills = excluded.kills, renown = excluded.renown, awards = excluded.awards`,
      )
      .run({ ...l, awards: JSON.stringify(l.awards) });
  }

  bestStreak(userId: number): number {
    const r = this.db.prepare('SELECT max(streak) AS s FROM lifetime WHERE user_id = ?').get(userId) as { s: number | null };
    return r.s ?? 0;
  }
}
