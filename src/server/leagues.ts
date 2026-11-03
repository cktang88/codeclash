// Leagues: who fights whom, and when. The glue between ingestion's work log and the game.
//
// Every push a player makes is logged as work (the time the server received it, never the
// push's own timestamp, so late-arriving events cannot rewrite battles already fought). A city
// is recomputed from that log whenever it is needed. At each league's battle times the
// scheduler fights the day's battles in order, and records them; the browser replays them.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { emptyCounts, total, type Counts } from '../game/units.ts';
import { fight, type ArmySpec, type BattleResult } from '../game/battle.ts';
import { cityAt, grandArmy, type CityState, type DailyOutcome, type WorkEvent, DAYS_PER_WEEK } from '../game/city.ts';
import { botLogin, botWork, BOT_COUNT } from '../game/bots.ts';
import { isFaction, type FactionId } from '../game/factions.ts';
import { battleAt, battleSeed, battleSetup, brigands, DAILY_POINTS, DAY_MS, GRAND_POINTS, HONOUR_POINTS, honourable, pairDaily, pairGrand, rank, walkover, walkoverResult, weekOf, type Standing } from '../game/league.ts';
import { hashString, mixSeed } from '../game/rng.ts';
import { creditOf, addToTally, emptyTally, type TallyDelta } from '../measure/credit.ts';
import type { Store, UserRow } from '../ingest/store.ts';
import type { PushReport } from '../ingest/poller.ts';
import { errorMessage, type Logger } from '../ingest/log.ts';
import type {
  BattleCard, BattleView, CityView, CreateLeagueRequest, LeagueCard, LeagueDetail, MemberSummary, PlayerLook, UserRef, WeekClockView, WeekSummary, WorkEntry,
} from '../protocol.ts';
import type { BattleRow, GameStore, LeagueMemberRow, LeagueRow } from './gameStore.ts';

export const COMMONS_SLUG = 'commons';
export const SYSTEM_USER = 0;
/** Work older than this is deleted: a week and a day of grace. */
export const WORK_KEEP_MS = 8 * DAY_MS;

export type LeagueError = 'not_found' | 'forbidden' | 'invalid' | 'limit' | 'signed_out';

export class LeagueFailure extends Error {
  constructor(
    readonly code: LeagueError,
    message: string,
  ) {
    super(message);
  }
}

export interface LeaguesDeps {
  store: Store;
  game: GameStore;
  log: Logger;
  config: { dayMs: number | null; maxLeaguesPerUser: number };
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s.length >= 3 ? s : `league-${s || 'x'}`;
}

/** Compares invite codes in constant time (hashed first, so neither length nor prefix leaks). */
export function sameInvite(given: string, actual: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(given), digest(actual));
}

const isBot = (id: number) => id < 0;
const botIndex = (id: number) => -id - 1;

export class Leagues {
  readonly dayMs: number;
  constructor(private readonly deps: LeaguesDeps) {
    this.dayMs = deps.config.dayMs ?? DAY_MS;
  }

  // ------------------------------------------------------------------ people

  userRef(id: number): UserRef {
    if (isBot(id)) return { id, login: botLogin(botIndex(id)), avatarUrl: '', bot: true };
    const u = this.deps.store.user(id);
    return u ? { id, login: u.login, avatarUrl: u.avatarUrl, bot: false } : { id, login: 'unknown', avatarUrl: '', bot: false };
  }

  look(id: number): PlayerLook {
    const saved = isBot(id) ? null : this.deps.game.look(id);
    if (saved && isFaction(saved.faction)) return saved;
    return { faction: 'templar', hue: hashString(this.userRef(id).login) % 360 };
  }

  setLook(user: UserRow, faction: FactionId, hue: number): void {
    this.deps.game.setLook(user.id, faction, Math.max(0, Math.min(359, Math.round(hue))));
  }

  // ------------------------------------------------------------------ work

  onPush(report: PushReport, now: number): void {
    const delta: TallyDelta = {
      lines: report.lines, files: report.files, branches: report.branches, functions: report.functions ?? 0, links: report.links ?? 0,
      bonus: report.bonus ?? 0, churn: report.churn, filler: report.filler,
    };
    this.deps.game.addWork(report.userId, now, report.repo, report.message, delta);
  }

  /** A fork's bonus credited once its commits reached the upstream: more code credit, now. */
  onUpstream(reward: { userId: number; repo: string; bonus: number }, now: number): void {
    const lines = new Array<number>(9).fill(0);
    // Held to the caps of the day it was earned already: not to this day's code (a quiet day would void it).
    this.deps.game.addWork(reward.userId, now, reward.repo, 'upstream merge: difficulty bonus', { lines, files: 0, branches: 0, upstream: reward.bonus, churn: 0, filler: 0 });
  }

  private workOf(league: LeagueRow, id: number, from: number, until: number): WorkEvent[] {
    if (isBot(id)) return botWork(league.seed, botIndex(id), from, this.dayMs, until);
    return this.deps.game.work(id, from, until).map((w) => ({ at: w.at, delta: w.delta, repo: w.repo ?? undefined, message: w.message ?? undefined }));
  }

  // ------------------------------------------------------------------ cities

  outcomesOf(battles: readonly BattleRow[], id: number): DailyOutcome[] {
    const out: DailyOutcome[] = [];
    for (const b of battles) {
      if (b.kind !== 'daily') continue;
      const side = b.aId === id ? 0 : b.bId === id ? 1 : -1;
      if (side < 0) continue;
      const s = b.result.sides[side as 0 | 1];
      out.push({ day: b.day, won: b.winner === side, dead: s.dead, survivors: s.alive });
    }
    return out;
  }

  city(league: LeagueRow, id: number, weekStart: number, at: number, battles?: readonly BattleRow[]): CityState {
    const bs = battles ?? this.deps.game.battlesOfWeek(league.id, weekStart);
    return cityAt({ weekStart, dayMs: this.dayMs, now: at, events: this.workOf(league, id, weekStart, at), outcomes: this.outcomesOf(bs, id) });
  }

  private armyOf(id: number, counts: Counts, veterans: Counts, city: CityState): ArmySpec {
    const look = this.look(id);
    return {
      name: this.userRef(id).login, faction: look.faction, hue: look.hue, counts, veterans,
      moraleBonus: city.moraleBonus, pavise: city.pavise, stakes: city.stakes, commander: true,
    };
  }

  // ------------------------------------------------------------------ battles

  /**
   * Fights every battle that is due, in order, spending about `budgetMs` before yielding (the rest
   * is fought on the next call). Returns how many battles were fought.
   */
  tick(now: number, budgetMs = 1500): number {
    const started = Date.now();
    let fought = 0;
    for (const league of this.deps.game.leagues()) {
      try {
        fought += this.resolve(league, now, started + budgetMs);
      } catch (err) {
        this.deps.log.error('league resolution failed', { league: league.slug, error: errorMessage(err) });
      }
      if (Date.now() > started + budgetMs) break;
    }
    return fought;
  }

  private resolve(league: LeagueRow, now: number, deadline: number): number {
    const { game } = this.deps;
    const current = weekOf(now, league.resetHour, this.dayMs);
    // Every unfinished week, oldest first: a server down across several resets catches them all up.
    let fought = 0;
    for (let ws = this.firstUnresolvedWeek(league); ws <= current.weekStart; ws += DAYS_PER_WEEK * this.dayMs) {
      let p = game.progress(league.id, ws) ?? { dayDone: -1, grandDone: false };
      for (let day = p.dayDone + 1; day < DAYS_PER_WEEK; day++) {
        const at = battleAt(ws, day, this.dayMs);
        if (at > now) return fought;
        // A day's battles and its progress are written together, so a crash mid-day never
        // leaves half the day recorded to be fought again; progress is re-read inside, so a
        // second resolver (an overlapping tick or process) that got there first is not repeated.
        fought += game.transaction(() => {
          const done = game.progress(league.id, ws);
          if (done && done.dayDone >= day) return 0;
          // Battles from before the league existed are skipped.
          const n = at > league.createdAt ? this.fightDaily(league, ws, day, at) : 0;
          game.setProgress(league.id, ws, day, false);
          return n;
        });
        p = { dayDone: day, grandDone: false };
        if (Date.now() > deadline) return fought;
      }
      if (!p.grandDone) {
        const at = ws + DAYS_PER_WEEK * this.dayMs;
        if (at > now) return fought;
        fought += game.transaction(() => {
          if (game.progress(league.id, ws)?.grandDone) return 0;
          const n = this.fightGrand(league, ws, at);
          game.setProgress(league.id, ws, DAYS_PER_WEEK - 1, true);
          return n;
        });
        if (Date.now() > deadline) return fought;
      }
    }
    return fought;
  }

  /** The oldest week whose battles are not all fought: the one after the last finished week, or the league's first. */
  firstUnresolvedWeek(league: LeagueRow): number {
    const created = weekOf(league.createdAt, league.resetHour, this.dayMs).weekStart;
    const last = this.deps.game.lastFinishedWeek(league.id);
    if (last === null) return created;
    return Math.max(created, weekOf(last, league.resetHour, this.dayMs).weekStart + DAYS_PER_WEEK * this.dayMs);
  }

  private standings(league: LeagueRow, ws: number, at: number, battles: readonly BattleRow[], members: readonly LeagueMemberRow[]): (Standing & { city: CityState; met: number[] })[] {
    return members.map((m) => {
      const city = this.city(league, m.userId, ws, at, battles);
      let points = 0;
      let wins = 0;
      let losses = 0;
      let grand: Standing['grand'] = null;
      const met: number[] = [];
      for (const b of battles) {
        const side = b.aId === m.userId ? 0 : b.bId === m.userId ? 1 : -1;
        if (side < 0) continue;
        const other = side === 0 ? b.bId : b.aId;
        if (other !== null) met.push(other);
        const won = b.winner === side;
        if (b.kind === 'grand') {
          grand = won ? 'won' : 'lost';
          if (won) points += GRAND_POINTS;
        } else if (won) {
          wins++;
          points += DAILY_POINTS;
        } else {
          losses++;
          if (honourable(b.result, side as 0 | 1)) points += HONOUR_POINTS;
        }
      }
      return { id: m.userId, points, wins, losses, produced: total(city.produced), grand, city, met };
    });
  }

  private fightDaily(league: LeagueRow, ws: number, day: number, at: number): number {
    const { game } = this.deps;
    const battles = game.battlesOfWeek(league.id, ws);
    const members = game.members(league.id).filter((m) => m.joinedAt < at);
    const rows = this.standings(league, ws, at, battles, members);
    // Only those who mustered anyone today take the field.
    const ready = rows.filter((r) => total(r.city.cohorts[day] ?? emptyCounts()) > 0);
    const pairs = pairDaily(ready.map((r) => ({ id: r.id, points: r.points, produced: r.produced, met: r.met })), mixSeed(league.seed, Math.floor(ws / 60_000), day));
    const byId = new Map(rows.map((r) => [r.id, r]));
    let n = 0;
    for (const [a, b] of pairs) {
      const ra = byId.get(a)!;
      const armyA = this.armyOf(a, ra.city.cohorts[day]!, emptyCounts(), ra.city);
      const rb = b === null ? null : byId.get(b)!;
      const seed = battleSeed(league.seed, ws, day, a, b ?? 0, false);
      const armyB = rb ? this.armyOf(b!, rb.city.cohorts[day]!, emptyCounts(), rb.city) : brigands(armyA, seed);
      this.record(league, ws, day, 'daily', a, b, armyA, armyB, seed, at);
      n++;
    }
    this.deps.log.info('daily battles', { league: league.slug, day, battles: n });
    return n;
  }

  private fightGrand(league: LeagueRow, ws: number, at: number): number {
    const { game } = this.deps;
    const battles = game.battlesOfWeek(league.id, ws);
    const members = game.members(league.id).filter((m) => m.joinedAt < at);
    const rows = this.standings(league, ws, at, battles, members);
    const ready = rank(rows.filter((r) => total(grandArmy(r.city).counts) > 0));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pairs = pairGrand(ready.map((r) => r.id));
    let championId: number | null = null;
    const grand = new Map<number, 'won' | 'lost'>();
    pairs.forEach(([a, b], i) => {
      const ra = byId.get(a)!;
      const ga = grandArmy(ra.city);
      const armyA = this.armyOf(a, ga.counts, ga.veterans, ra.city);
      const seed = battleSeed(league.seed, ws, DAYS_PER_WEEK, a, b ?? 0, true);
      let armyB: ArmySpec;
      if (b === null) armyB = brigands(armyA, seed);
      else {
        const rb = byId.get(b)!;
        const gb = grandArmy(rb.city);
        armyB = this.armyOf(b, gb.counts, gb.veterans, rb.city);
      }
      const result = this.record(league, ws, DAYS_PER_WEEK, 'grand', a, b, armyA, armyB, seed, at);
      grand.set(a, result.winner === 0 ? 'won' : 'lost');
      if (b !== null) grand.set(b, result.winner === 1 ? 'won' : 'lost');
      if (i === 0) championId = result.winner === 0 ? a : (b ?? null);
    });
    const final = rank(rows.map((r) => ({ ...r, points: r.points + (grand.get(r.id) === 'won' ? GRAND_POINTS : 0), grand: grand.get(r.id) ?? null })));
    game.saveWeek({ leagueId: league.id, weekStart: ws, championId, standings: final.map((r) => ({ userId: r.id, points: r.points, produced: r.produced, grand: r.grand })) });
    this.deps.log.info('grand battle', { league: league.slug, champion: championId, battles: pairs.length });
    return pairs.length;
  }

  private record(league: LeagueRow, ws: number, day: number, kind: 'daily' | 'grand', a: number, b: number | null, armyA: ArmySpec, armyB: ArmySpec, seed: number, at: number): BattleResult {
    const setup = battleSetup(seed, kind, armyA, armyB);
    const w = walkover(armyA.counts, armyB.counts);
    const result = w === null ? fight(setup) : walkoverResult(w, armyA.counts, armyB.counts);
    this.deps.game.insertBattle({ leagueId: league.id, weekStart: ws, day, kind, aId: a, bId: b, winner: result.winner, setup, result, foughtAt: at });
    return result;
  }

  // ------------------------------------------------------------------ lifecycle

  create(owner: UserRow, req: CreateLeagueRequest, now: number): LeagueRow {
    const { game, config } = { game: this.deps.game, config: this.deps.config };
    const owned = game.leaguesOf(owner.id).filter((l) => l.ownerId === owner.id);
    if (owned.length >= config.maxLeaguesPerUser) throw new LeagueFailure('limit', `You can own at most ${config.maxLeaguesPerUser} leagues.`);
    let slug = slugify(req.name);
    for (let i = 2; game.leagueBySlug(slug); i++) slug = `${slugify(req.name).slice(0, 36)}-${i}`;
    // The league and its members are written together: never a league without its owner.
    return game.transaction(() => {
      const id = game.insertLeague({
        slug, name: req.name, ownerId: owner.id, visibility: req.visibility, invite: randomBytes(9).toString('base64url'), resetHour: req.resetHour,
        bots: Math.min(BOT_COUNT, req.bots), seed: hashString(`${slug}:${now}`), createdAt: now,
      });
      game.addMember(id, owner.id, 'owner', now);
      for (let i = 0; i < Math.min(BOT_COUNT, req.bots); i++) game.addMember(id, -(i + 1), 'bot', now);
      return game.league(id)!;
    });
  }

  /** The public league with sparring bots that every server starts with. */
  seedCommons(now: number): void {
    const { game } = this.deps;
    if (game.leagueBySlug(COMMONS_SLUG)) return;
    const id = game.insertLeague({ slug: COMMONS_SLUG, name: 'The Commons', ownerId: SYSTEM_USER, visibility: 'public', invite: 'commons', resetHour: 0, bots: 4, seed: hashString('commons'), createdAt: now - 8 * this.dayMs });
    for (let i = 0; i < 4; i++) game.addMember(id, -(i + 1), 'bot', now - 8 * this.dayMs);
  }

  canView(league: LeagueRow, userId: number | null, invite: string | null): boolean {
    if (league.visibility === 'public') return true;
    if (userId !== null && (league.ownerId === userId || this.deps.game.isMember(league.id, userId))) return true;
    return invite !== null && sameInvite(invite, league.invite);
  }

  join(league: LeagueRow, user: UserRow, invite: string | null, now: number): void {
    if (league.visibility === 'private' && !(invite !== null && sameInvite(invite, league.invite)) && league.ownerId !== user.id) throw new LeagueFailure('forbidden', 'This league is private: you need its invite link.');
    this.deps.game.addMember(league.id, user.id, 'member', now);
  }

  leave(league: LeagueRow, userId: number): void {
    if (league.ownerId === userId) throw new LeagueFailure('invalid', 'The owner cannot leave; delete the league instead.');
    this.deps.game.removeMember(league.id, userId);
  }

  // ------------------------------------------------------------------ views

  clock(league: LeagueRow, now: number): WeekClockView {
    const w = weekOf(now, league.resetHour, this.dayMs);
    const next = battleAt(w.weekStart, w.day, this.dayMs);
    return { weekStart: w.weekStart, weekEnd: w.weekEnd, dayMs: this.dayMs, day: w.day, now, nextBattleAt: next, grandNext: w.day === DAYS_PER_WEEK - 1 };
  }

  card(league: LeagueRow): LeagueCard {
    const members = this.deps.game.members(league.id);
    const last = this.deps.game.weeks(league.id, 1)[0];
    return {
      slug: league.slug, name: league.name, visibility: league.visibility, resetHour: league.resetHour,
      players: members.filter((m) => m.role !== 'bot').length, bots: members.filter((m) => m.role === 'bot').length,
      owner: league.ownerId === SYSTEM_USER ? { id: 0, login: 'Code Clash', avatarUrl: '', bot: true } : this.userRef(league.ownerId),
      champion: last?.championId != null ? this.userRef(last.championId) : null,
    };
  }

  battleCard(b: BattleRow): BattleCard {
    const men = (i: 0 | 1) => total(b.result.sides[i]!.start);
    const dead = (i: 0 | 1) => total(b.result.sides[i]!.dead);
    return {
      id: b.id, weekStart: b.weekStart, day: b.day, kind: b.kind, foughtAt: b.foughtAt, a: this.userRef(b.aId), b: b.bId === null ? null : this.userRef(b.bId),
      winner: b.winner, men: [men(0), men(1)], dead: [dead(0), dead(1)], walkover: b.result.ticks === 0, ticks: b.result.ticks,
    };
  }

  detail(league: LeagueRow, viewer: UserRow | null, now: number): LeagueDetail {
    const { game } = this.deps;
    const clock = this.clock(league, now);
    const battles = game.battlesOfWeek(league.id, clock.weekStart);
    const members = game.members(league.id);
    const rows = this.standings(league, clock.weekStart, now, battles, members);
    const role = new Map(members.map((m) => [m.userId, m.role]));
    const summaries: MemberSummary[] = rank(rows).map((r) => {
      const c = (r as (typeof rows)[number]).city;
      return {
        user: this.userRef(r.id), ...this.look(r.id), role: role.get(r.id) ?? 'member', points: r.points, wins: r.wins, losses: r.losses, produced: r.produced,
        today: total(c.today), rate: Math.round(total(c.ratePerHour) * 10) / 10, idle: c.idle, levels: c.buildings.map((b) => b.level), grand: r.grand,
      };
    });
    const member = viewer !== null && game.isMember(league.id, viewer.id);
    const owner = viewer !== null && league.ownerId === viewer.id;
    // Last week's battles too, so the morning after a reset still shows the Grand Battle.
    const lastWeek = game.battlesOfWeek(league.id, clock.weekStart - DAYS_PER_WEEK * this.dayMs);
    return {
      ...this.card(league),
      clock,
      viewer: { signedIn: viewer !== null, member, owner, userId: viewer?.id ?? null },
      invite: (league.visibility === 'private' && member) || owner ? league.invite : null,
      members: summaries,
      battles: [...battles, ...lastWeek].sort((a, b) => b.foughtAt - a.foughtAt || a.id - b.id).map((b) => this.battleCard(b)),
      weeks: game.weeks(league.id, 8).map((w): WeekSummary => ({
        weekStart: w.weekStart,
        champion: w.championId !== null ? this.userRef(w.championId) : null,
        standings: w.standings.map((s) => ({ user: this.userRef(s.userId), points: s.points, produced: s.produced, grand: s.grand })),
      })),
    };
  }

  cityView(league: LeagueRow, id: number, now: number): CityView {
    const clock = this.clock(league, now);
    const events = this.workOf(league, id, clock.weekStart, now);
    const city = this.city(league, id, clock.weekStart, now);
    // Each push's own credited work, for the log (per day, as the city credits it).
    const work: WorkEntry[] = [];
    let tally = emptyTally();
    let day = -1;
    let before = creditOf(tally);
    for (const e of events) {
      const d = Math.floor((e.at - clock.weekStart) / this.dayMs);
      if (d !== day) {
        day = d;
        tally = emptyTally();
        before = creditOf(tally);
      }
      addToTally(tally, e.delta);
      const after = creditOf(tally);
      work.push({ at: e.at, repo: e.repo ?? null, message: e.message ?? null, code: after.code - before.code, tests: after.tests - before.tests, docs: after.docs + after.comments - before.docs - before.comments, removed: after.removed - before.removed });
      before = after;
    }
    return { user: this.userRef(id), look: this.look(id), clock, city, grand: grandArmy(city), work: work.reverse().slice(0, 60), weekWork: city.weekWork };
  }

  battleView(b: BattleRow): BattleView {
    const league = this.deps.game.league(b.leagueId)!;
    return { card: this.battleCard(b), league: { slug: league.slug, name: league.name }, setup: b.setup, result: b.result };
  }

  isMember(league: LeagueRow, id: number): boolean {
    return this.deps.game.isMember(league.id, id);
  }

  prune(now: number): void {
    // Work still needed by a week whose battles are not yet fought (a catch-up after downtime) is kept.
    let before = now - WORK_KEEP_MS - DAYS_PER_WEEK * this.dayMs;
    for (const league of this.deps.game.leagues()) before = Math.min(before, this.firstUnresolvedWeek(league));
    this.deps.game.pruneWork(before);
  }
}
