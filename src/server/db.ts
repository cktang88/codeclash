import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage, TimelapseFrame, Visibility, WarStatus } from '../protocol.ts';
import type { Digest } from '../rules/digest.ts';
import type { ChronicleEntry } from '../sim/chronicle.ts';
import type { EncodedInput, RepoRef, ReplayPlayer } from '../sim/replay.ts';

export type Db = Database.Database;

export const SNAPSHOTS_KEPT_LIVE = 3;

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
  players: (ReplayPlayer & { avatarUrl: string; userId: number })[];
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
  return db;
}

type Raw = Record<string, unknown>;

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

  // ----------------------------------------------------------- pushes

  /** Records a push once. Returns false if this push id was already recorded. */
  recordPush(p: PushRecord): boolean {
    const res = this.db
      .prepare('INSERT OR IGNORE INTO pushes (user_id, push_id, repo, at, data) VALUES (?, ?, ?, ?, ?)')
      .run(p.userId, p.pushId, p.repo, p.at, JSON.stringify(p));
    return res.changes > 0;
  }

  hasPush(userId: number, pushId: string): boolean {
    return this.db.prepare('SELECT 1 FROM pushes WHERE user_id = ? AND push_id = ?').get(userId, pushId) !== undefined;
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
    return (this.db.prepare('SELECT data FROM chronicle WHERE war_id = ? AND at > ? ORDER BY seq LIMIT ?').all(warId, since, limit) as Raw[]).map(
      (r) => JSON.parse(r.data as string) as ChronicleEntry,
    );
  }

  chronicleAll(warId: number): ChronicleEntry[] {
    return (this.db.prepare('SELECT data FROM chronicle WHERE war_id = ? ORDER BY seq').all(warId) as Raw[]).map((r) => JSON.parse(r.data as string) as ChronicleEntry);
  }

  /** Keeps hourly keyframes and the most recent snapshots; older ones are only a cache. */
  pruneSnapshots(warId: number, keepFromTick: number, keyframeEvery: number): void {
    this.db.prepare('DELETE FROM war_snapshots WHERE war_id = ? AND tick < ? AND tick % ? != 0').run(warId, keepFromTick, keyframeEvery);
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
