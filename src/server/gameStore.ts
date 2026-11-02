// The game's tables, beside ingestion's in the same SQLite file.

import type { TallyDelta } from '../measure/credit.ts';
import type { BattleResult, BattleSetup } from '../game/battle.ts';
import type { FactionId } from '../game/factions.ts';
import type { Db } from '../ingest/store.ts';
import type { Visibility } from '../protocol.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  visibility TEXT NOT NULL,
  invite TEXT NOT NULL,
  reset_hour INTEGER NOT NULL,
  bots INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS league_members (
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS league_members_user ON league_members(user_id);
CREATE TABLE IF NOT EXISTS players (
  user_id INTEGER PRIMARY KEY,
  faction TEXT NOT NULL,
  hue INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS work_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  repo TEXT,
  message TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_log_user_at ON work_log(user_id, at);
CREATE TABLE IF NOT EXISTS battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  week_start INTEGER NOT NULL,
  day INTEGER NOT NULL,
  kind TEXT NOT NULL,
  a_id INTEGER NOT NULL,
  b_id INTEGER,
  winner INTEGER NOT NULL,
  setup TEXT NOT NULL,
  result TEXT NOT NULL,
  fought_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battles_week ON battles(league_id, week_start);
CREATE TABLE IF NOT EXISTS league_progress (
  league_id INTEGER NOT NULL,
  week_start INTEGER NOT NULL,
  day_done INTEGER NOT NULL,
  grand_done INTEGER NOT NULL,
  PRIMARY KEY (league_id, week_start)
);
CREATE TABLE IF NOT EXISTS week_results (
  league_id INTEGER NOT NULL,
  week_start INTEGER NOT NULL,
  champion_id INTEGER,
  standings TEXT NOT NULL,
  PRIMARY KEY (league_id, week_start)
);
`;

export interface LeagueRow {
  id: number;
  slug: string;
  name: string;
  ownerId: number;
  visibility: Visibility;
  invite: string;
  resetHour: number;
  bots: number;
  seed: number;
  createdAt: number;
}

export interface LeagueMemberRow {
  leagueId: number;
  userId: number;
  role: 'owner' | 'member' | 'bot';
  joinedAt: number;
}

export interface WorkRow {
  id: number;
  userId: number;
  at: number;
  repo: string | null;
  message: string | null;
  delta: TallyDelta;
}

export interface BattleRow {
  id: number;
  leagueId: number;
  weekStart: number;
  day: number;
  kind: 'daily' | 'grand';
  aId: number;
  bId: number | null;
  winner: 0 | 1;
  setup: BattleSetup;
  result: BattleResult;
  foughtAt: number;
}

export interface StandingRow {
  userId: number;
  points: number;
  produced: number;
  grand: 'won' | 'lost' | null;
}

export interface WeekResultRow {
  leagueId: number;
  weekStart: number;
  championId: number | null;
  standings: StandingRow[];
}

type Raw = Record<string, unknown>;

function leagueRow(r: Raw): LeagueRow {
  return {
    id: r.id as number, slug: r.slug as string, name: r.name as string, ownerId: r.owner_id as number, visibility: r.visibility as Visibility,
    invite: r.invite as string, resetHour: r.reset_hour as number, bots: r.bots as number, seed: r.seed as number, createdAt: r.created_at as number,
  };
}

function battleRow(r: Raw): BattleRow {
  return {
    id: r.id as number, leagueId: r.league_id as number, weekStart: r.week_start as number, day: r.day as number, kind: r.kind as BattleRow['kind'],
    aId: r.a_id as number, bId: (r.b_id as number | null) ?? null, winner: r.winner as 0 | 1,
    setup: JSON.parse(r.setup as string) as BattleSetup, result: JSON.parse(r.result as string) as BattleResult, foughtAt: r.fought_at as number,
  };
}

export class GameStore {
  constructor(readonly db: Db) {
    db.exec(SCHEMA);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ------------------------------------------------------------------ leagues

  insertLeague(l: Omit<LeagueRow, 'id'>): number {
    const res = this.db
      .prepare('INSERT INTO leagues (slug, name, owner_id, visibility, invite, reset_hour, bots, seed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(l.slug, l.name, l.ownerId, l.visibility, l.invite, l.resetHour, l.bots, l.seed, l.createdAt);
    return Number(res.lastInsertRowid);
  }

  league(id: number): LeagueRow | null {
    const r = this.db.prepare('SELECT * FROM leagues WHERE id = ?').get(id) as Raw | undefined;
    return r ? leagueRow(r) : null;
  }

  leagueBySlug(slug: string): LeagueRow | null {
    const r = this.db.prepare('SELECT * FROM leagues WHERE slug = ?').get(slug) as Raw | undefined;
    return r ? leagueRow(r) : null;
  }

  leagues(): LeagueRow[] {
    return (this.db.prepare('SELECT * FROM leagues ORDER BY id').all() as Raw[]).map(leagueRow);
  }

  leaguesOf(userId: number): LeagueRow[] {
    return (this.db.prepare('SELECT l.* FROM leagues l JOIN league_members m ON m.league_id = l.id WHERE m.user_id = ? ORDER BY l.id').all(userId) as Raw[]).map(leagueRow);
  }

  deleteLeague(id: number): void {
    this.transaction(() => {
      for (const t of ['league_members', 'battles', 'league_progress', 'week_results']) this.db.prepare(`DELETE FROM ${t} WHERE league_id = ?`).run(id);
      this.db.prepare('DELETE FROM leagues WHERE id = ?').run(id);
    });
  }

  addMember(leagueId: number, userId: number, role: LeagueMemberRow['role'], at: number): boolean {
    return this.db.prepare('INSERT OR IGNORE INTO league_members (league_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(leagueId, userId, role, at).changes > 0;
  }

  removeMember(leagueId: number, userId: number): boolean {
    return this.db.prepare('DELETE FROM league_members WHERE league_id = ? AND user_id = ?').run(leagueId, userId).changes > 0;
  }

  members(leagueId: number): LeagueMemberRow[] {
    return (this.db.prepare('SELECT * FROM league_members WHERE league_id = ? ORDER BY joined_at, user_id').all(leagueId) as Raw[]).map((r) => ({
      leagueId: r.league_id as number, userId: r.user_id as number, role: r.role as LeagueMemberRow['role'], joinedAt: r.joined_at as number,
    }));
  }

  isMember(leagueId: number, userId: number): boolean {
    return this.db.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?').get(leagueId, userId) !== undefined;
  }

  // ------------------------------------------------------------------ players

  look(userId: number): { faction: FactionId; hue: number } | null {
    const r = this.db.prepare('SELECT faction, hue FROM players WHERE user_id = ?').get(userId) as { faction: FactionId; hue: number } | undefined;
    return r ?? null;
  }

  setLook(userId: number, faction: FactionId, hue: number): void {
    this.db.prepare('INSERT INTO players (user_id, faction, hue) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET faction = excluded.faction, hue = excluded.hue').run(userId, faction, hue);
  }

  // ------------------------------------------------------------------ work

  addWork(userId: number, at: number, repo: string | null, message: string | null, delta: TallyDelta): void {
    this.db.prepare('INSERT INTO work_log (user_id, at, repo, message, data) VALUES (?, ?, ?, ?, ?)').run(userId, at, repo, message, JSON.stringify(delta));
  }

  work(userId: number, from: number, until: number): WorkRow[] {
    return (this.db.prepare('SELECT * FROM work_log WHERE user_id = ? AND at >= ? AND at < ? ORDER BY at, id').all(userId, from, until) as Raw[]).map((r) => ({
      id: r.id as number, userId: r.user_id as number, at: r.at as number, repo: (r.repo as string | null) ?? null, message: (r.message as string | null) ?? null,
      delta: JSON.parse(r.data as string) as TallyDelta,
    }));
  }

  pruneWork(before: number): void {
    this.db.prepare('DELETE FROM work_log WHERE at < ?').run(before);
  }

  // ------------------------------------------------------------------ battles

  insertBattle(b: Omit<BattleRow, 'id'>): number {
    const res = this.db
      .prepare('INSERT INTO battles (league_id, week_start, day, kind, a_id, b_id, winner, setup, result, fought_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.leagueId, b.weekStart, b.day, b.kind, b.aId, b.bId, b.winner, JSON.stringify(b.setup), JSON.stringify(b.result), b.foughtAt);
    return Number(res.lastInsertRowid);
  }

  battle(id: number): BattleRow | null {
    const r = this.db.prepare('SELECT * FROM battles WHERE id = ?').get(id) as Raw | undefined;
    return r ? battleRow(r) : null;
  }

  battlesOfWeek(leagueId: number, weekStart: number): BattleRow[] {
    return (this.db.prepare('SELECT * FROM battles WHERE league_id = ? AND week_start = ? ORDER BY day, id').all(leagueId, weekStart) as Raw[]).map(battleRow);
  }

  // ------------------------------------------------------------------ progress and history

  progress(leagueId: number, weekStart: number): { dayDone: number; grandDone: boolean } | null {
    const r = this.db.prepare('SELECT day_done, grand_done FROM league_progress WHERE league_id = ? AND week_start = ?').get(leagueId, weekStart) as Raw | undefined;
    return r ? { dayDone: r.day_done as number, grandDone: r.grand_done === 1 } : null;
  }

  setProgress(leagueId: number, weekStart: number, dayDone: number, grandDone: boolean): void {
    this.db
      .prepare('INSERT INTO league_progress (league_id, week_start, day_done, grand_done) VALUES (?, ?, ?, ?) ON CONFLICT(league_id, week_start) DO UPDATE SET day_done = excluded.day_done, grand_done = excluded.grand_done')
      .run(leagueId, weekStart, dayDone, grandDone ? 1 : 0);
  }

  /** The latest week whose Grand Battle is fought, if any. */
  lastFinishedWeek(leagueId: number): number | null {
    const r = this.db.prepare('SELECT MAX(week_start) AS ws FROM league_progress WHERE league_id = ? AND grand_done = 1').get(leagueId) as Raw | undefined;
    return (r?.ws as number | null | undefined) ?? null;
  }

  saveWeek(w: WeekResultRow): void {
    this.db
      .prepare('INSERT OR REPLACE INTO week_results (league_id, week_start, champion_id, standings) VALUES (?, ?, ?, ?)')
      .run(w.leagueId, w.weekStart, w.championId, JSON.stringify(w.standings));
  }

  weeks(leagueId: number, limit: number): WeekResultRow[] {
    return (this.db.prepare('SELECT * FROM week_results WHERE league_id = ? ORDER BY week_start DESC LIMIT ?').all(leagueId, limit) as Raw[]).map((r) => ({
      leagueId: r.league_id as number, weekStart: r.week_start as number, championId: (r.champion_id as number | null) ?? null,
      standings: JSON.parse(r.standings as string) as StandingRow[],
    }));
  }

  deleteUser(userId: number): void {
    this.transaction(() => {
      for (const t of ['league_members', 'players', 'work_log']) this.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
    });
  }
}
