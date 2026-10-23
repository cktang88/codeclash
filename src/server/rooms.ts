import { randomBytes, randomInt } from 'node:crypto';
import type { CreateRoomRequest, RoomCard, RoomDetail, UpdateRoomRequest, UserRef } from '../protocol.ts';
import { BOTS, botPush } from '../rules/bots.ts';
import type { Digest } from '../rules/digest.ts';
import { NEUTRAL } from '../sim/api.ts';
import { MAX_SLOTS, slotsFor } from '../sim/mapgen.ts';
import type { RoomRow, Store, UserRow } from './db.ts';
import type { Logger } from './log.ts';
import type { PushReport } from './poller.ts';
import { War, type Channel, type Enlistee } from './war.ts';
import { postDigest } from './webhook.ts';

export const DAY_MS = 24 * 3600_000;
const MIN_FIRST_WAR_MS = 3600_000;
const BOT_TICK_MS = 2000;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
export const COMMONS_SLUG = 'commons';
export const SYSTEM_USER = 0;

export interface RoomsDeps {
  store: Store;
  log: Logger;
  channelFor: (roomId: number) => Channel;
  viewersOf: (roomId: number) => number;
  config: { dayMs: number | null; maxRoomsPerUser: number; maxLiveRooms: number; publicUrl: string };
  random?: () => number;
  fetchImpl?: typeof fetch;
}

export type RoomError = 'not_found' | 'forbidden' | 'invalid' | 'full' | 'limit' | 'signed_out';

export class RoomFailure extends Error {
  constructor(
    readonly code: RoomError,
    message: string,
  ) {
    super(message);
  }
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The next reset boundary strictly after `ms` for a room resetting at `hour` UTC. */
export function nextReset(ms: number, hour: number): number {
  const d = new Date(ms);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
  while (t <= ms) t += DAY_MS;
  return t;
}

export function slugify(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'room';
  return `${base}-${token(4)}`;
}

export function token(n: number): string {
  let out = '';
  for (const b of randomBytes(n)) out += BASE32[b & 31];
  return out;
}

export class Rooms {
  private readonly live = new Map<number, War>();
  private lastBots = 0;

  constructor(private readonly deps: RoomsDeps) {}

  boot(now: number): void {
    if (!this.deps.store.user(SYSTEM_USER)) {
      this.deps.store.upsertUser({ id: SYSTEM_USER, nodeId: 'system', login: 'pushfront', avatarUrl: '', createdAtGithub: 0, joinedAt: now, bot: true });
    }
    for (const room of this.deps.store.rooms()) this.ensureWar(room, now);
  }

  seedCommons(now: number): void {
    if (this.deps.store.roomBySlug(COMMONS_SLUG)) return;
    const id = this.deps.store.insertRoom({
      slug: COMMONS_SLUG, name: 'The Commons', ownerId: SYSTEM_USER, visibility: 'public', invite: token(10), resetHour: 0, bots: 4, webhookUrl: null, createdAt: now,
    });
    this.ensureWar(this.deps.store.room(id)!, now);
    this.deps.log.info('seeded the commons', { room: id });
  }

  wars(): War[] {
    return [...this.live.values()];
  }

  war(roomId: number): War | null {
    return this.live.get(roomId) ?? null;
  }

  /** Ends wars whose day is over, starts the next ones, and lets bots push. */
  reconcile(now: number): void {
    for (const room of this.deps.store.rooms()) {
      // One broken room must not hold back every other room's rollover (or the bots).
      try {
        const war = this.live.get(room.id);
        if (war && war.over(now)) this.finish(room, war, now);
        else if (!war) this.ensureWar(room, now);
      } catch (err) {
        this.deps.log.error('room lifecycle failed', { room: room.slug, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (now - this.lastBots >= BOT_TICK_MS) {
      this.botsPush(now, this.lastBots === 0 ? BOT_TICK_MS : now - this.lastBots);
      this.lastBots = now;
    }
  }

  snapshotAll(): void {
    for (const w of this.live.values()) w.persistSnapshot();
  }

  // ------------------------------------------------------------ pushes

  onPush(report: PushReport, now: number): number {
    let raised = 0;
    for (const room of this.deps.store.roomsOf(report.userId)) {
      const war = this.live.get(room.id);
      if (war?.push(now, report.userId, report)) raised++;
    }
    return raised;
  }

  private botsPush(now: number, elapsedMs: number): void {
    const rand = this.deps.random ?? Math.random;
    // Short test days compress a whole day of pushes into their length.
    const dayScale = this.deps.config.dayMs !== null ? DAY_MS / this.deps.config.dayMs : 1;
    for (const war of this.live.values()) {
      for (const pl of war.header.players) {
        if (!pl.bot) continue;
        const persona = BOTS.find((b) => b.login === pl.login);
        if (!persona || rand() >= (persona.rate * elapsedMs * dayScale) / 3600_000) continue;
        const push = botPush(persona, rand);
        war.push(now, pl.userId, { repo: push.repo[0], language: push.repo[1], lines: push.lines, files: push.files, branches: push.branches, churn: push.churn, filler: push.filler, commits: 1 + Math.floor(rand() * 3), message: push.message });
      }
    }
  }

  // ------------------------------------------------------------- rooms

  create(owner: UserRow, req: CreateRoomRequest, now: number): RoomRow {
    const { store, config } = this.deps;
    if (store.roomsOf(owner.id).filter((r) => r.ownerId === owner.id).length >= config.maxRoomsPerUser) {
      throw new RoomFailure('limit', `You can own at most ${config.maxRoomsPerUser} rooms.`);
    }
    if (this.live.size >= config.maxLiveRooms) throw new RoomFailure('limit', 'The war office is full. Try again later.');
    let slug = slugify(req.name);
    while (store.roomBySlug(slug)) slug = slugify(req.name);
    const room = store.transaction(() => {
      const id = store.insertRoom({
        slug, name: req.name.trim(), ownerId: owner.id, visibility: req.visibility, invite: token(10),
        resetHour: req.resetHour, bots: req.bots, webhookUrl: null, createdAt: now,
      });
      store.addMember(id, owner.id, 'owner', now);
      return store.room(id)!;
    });
    this.ensureWar(room, now);
    this.deps.log.info('room created', { room: room.slug, owner: owner.login });
    return room;
  }

  update(room: RoomRow, req: UpdateRoomRequest): RoomRow {
    this.deps.store.updateRoom(room.id, {
      name: req.name?.trim(),
      visibility: req.visibility,
      resetHour: req.resetHour,
      bots: req.bots,
      webhookUrl: req.webhookUrl === undefined ? undefined : req.webhookUrl,
    });
    const updated = this.deps.store.room(room.id)!;
    this.broadcastRoom(updated);
    return updated;
  }

  rotateInvite(room: RoomRow): RoomRow {
    this.deps.store.updateRoom(room.id, { invite: token(10) });
    return this.deps.store.room(room.id)!;
  }

  delete(room: RoomRow): void {
    this.live.delete(room.id);
    this.deps.store.deleteRoom(room.id);
    this.deps.log.info('room deleted', { room: room.slug });
  }

  join(room: RoomRow, user: UserRow, invite: string | null, now: number): void {
    const { store } = this.deps;
    if (store.isMember(room.id, user.id)) return;
    if (room.visibility === 'private' && invite !== room.invite) throw new RoomFailure('forbidden', 'This room is private. You need a current invite link.');
    if (store.members(room.id).length + room.bots >= MAX_SLOTS) throw new RoomFailure('full', 'This room is full.');
    store.addMember(room.id, user.id, 'member', now);
    this.live.get(room.id)?.enlist(now, enlistee(user));
    this.broadcastRoom(room);
  }

  leave(room: RoomRow, userId: number): void {
    if (room.ownerId === userId) throw new RoomFailure('invalid', 'The owner cannot leave. Delete the room instead.');
    this.deps.store.removeMember(room.id, userId);
    this.broadcastRoom(room);
  }

  /** Removes a member. In a private room the invite is rotated too, since members could see it. */
  kick(room: RoomRow, userId: number): RoomRow {
    this.leave(room, userId);
    return room.visibility === 'private' ? this.rotateInvite(room) : room;
  }

  /** Whether a viewer may watch: public rooms, members, and holders of the invite. */
  canView(room: RoomRow, userId: number | null, invite: string | null): boolean {
    if (room.visibility === 'public') return true;
    if (invite !== null && invite === room.invite) return true;
    return userId !== null && this.deps.store.isMember(room.id, userId);
  }

  detail(room: RoomRow, viewerId: number | null): RoomDetail {
    const { store } = this.deps;
    const members = store.members(room.id);
    const member = viewerId !== null && members.some((m) => m.userId === viewerId);
    const owner = viewerId !== null && room.ownerId === viewerId;
    const war = this.live.get(room.id);
    return {
      slug: room.slug,
      name: room.name,
      visibility: room.visibility,
      resetHour: room.resetHour,
      bots: room.bots,
      owner: userRef(store.user(room.ownerId)),
      members: members.map((m) => ({ ...userRef(m.user), role: m.role, joinedAt: m.joinedAt, resting: war !== undefined && restedDuring(m.user.restingDay, war.meta) })),
      viewer: { member, owner, signedIn: viewerId !== null },
      invite: owner || (member && room.visibility === 'private') ? room.invite : null,
      webhookUrl: owner ? room.webhookUrl : null,
    };
  }

  card(room: RoomRow): RoomCard {
    const war = this.live.get(room.id);
    const w = war?.world;
    const leader = w && w.leader !== NEUTRAL ? (war.header.players[w.leader]?.login ?? null) : null;
    return {
      slug: room.slug,
      name: room.name,
      visibility: room.visibility,
      resetHour: room.resetHour,
      members: this.deps.store.members(room.id).length,
      bots: room.bots,
      viewers: this.deps.viewersOf(room.id),
      owner: userRef(this.deps.store.user(room.ownerId)),
      war: war ? { id: war.id, endsAt: war.endsAt, leader, units: w!.units.length } : null,
    };
  }

  // ------------------------------------------------------ lifecycle

  private ensureWar(room: RoomRow, now: number): void {
    if (this.live.has(room.id)) return;
    const { store } = this.deps;
    const row = store.activeWar(room.id);
    if (row) {
      const war = War.load(this.warDeps(room.id), row, now);
      this.live.set(room.id, war);
      if (war.over(now)) this.finish(room, war, now);
      return;
    }
    this.startWar(room, now, null);
  }

  private startWar(room: RoomRow, now: number, previousEnd: number | null): War {
    const { store, config } = this.deps;
    let startsAt: number;
    let endsAt: number;
    if (config.dayMs !== null) {
      startsAt = previousEnd !== null && now - previousEnd < config.dayMs ? previousEnd : now;
      endsAt = startsAt + config.dayMs;
    } else {
      const next = nextReset(now, room.resetHour);
      const boundary = next - DAY_MS;
      startsAt = previousEnd !== null && previousEnd >= boundary ? previousEnd : previousEnd === null ? now : boundary;
      endsAt = nextReset(startsAt, room.resetHour);
      if (previousEnd === null && endsAt - startsAt < MIN_FIRST_WAR_MS) endsAt += DAY_MS;
    }
    const enlist: Enlistee[] = store.members(room.id).map((m) => enlistee(m.user));
    for (let b = 0; b < room.bots && b < BOTS.length; b++) enlist.push({ userId: -(b + 1), login: BOTS[b]!.login, avatarUrl: '', bot: true });
    const war = War.open(this.warDeps(room.id), {
      roomId: room.id,
      // A first war stretched past 24 hours is named for the day it ends on, so the next war is the next day.
      day: isoDay(Math.max(startsAt, endsAt - (config.dayMs ?? DAY_MS))),
      seed: randomInt(1, 2 ** 31),
      startsAt,
      endsAt,
      slots: slotsFor(enlist.length),
      enlist,
    });
    this.live.set(room.id, war);
    this.deps.log.info('war started', { room: room.slug, war: war.id, day: war.meta.day, players: war.header.players.length, endsAt: new Date(endsAt).toISOString() });
    return war;
  }

  private finish(room: RoomRow, war: War, now: number): void {
    const digest = war.conclude(now);
    this.recordLifetime(room, war, digest);
    this.deps.channelFor(room.id).send({ type: 'war', war: war.meta, digestReady: true });
    if (room.webhookUrl) {
      postDigest(room.webhookUrl, room, war.meta, digest, this.deps.config.publicUrl, this.deps.fetchImpl).catch((err: unknown) =>
        this.deps.log.warn('digest webhook failed', { room: room.slug, error: err instanceof Error ? err.message : String(err) }),
      );
    }
    this.live.delete(room.id);
    this.startWar(room, now, war.endsAt);
    this.deps.channelFor(room.id).reset();
  }

  private recordLifetime(room: RoomRow, war: War, digest: Digest): void {
    const { store } = this.deps;
    const day = war.meta.day;
    const yesterday = isoDay(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
    store.transaction(() => {
      for (const pl of digest.players) {
        if (pl.bot) continue;
        const userId = war.header.players[pl.p]!.userId;
        const user = store.user(userId);
        const prev = store.lifetime(userId, room.id) ?? {
          userId, roomId: room.id, days: 0, wins: 0, streak: 0, bestStreak: 0, lastDay: null, kills: 0, renown: 0, awards: {},
        };
        const active = pl.pushes > 0 || restedDuring(user?.restingDay ?? null, war.meta);
        // Two wars can share a day (the reset hour moved, or short test days): the second one keeps the streak.
        const streak = active ? (prev.lastDay === day ? Math.max(1, prev.streak) : prev.lastDay === yesterday ? prev.streak + 1 : 1) : 0;
        const awards = { ...prev.awards };
        for (const a of pl.awards) awards[a] = (awards[a] ?? 0) + 1;
        store.saveLifetime({
          userId, roomId: room.id,
          days: prev.days + (pl.pushes > 0 ? 1 : 0),
          wins: prev.wins + (digest.winner === pl.p ? 1 : 0),
          streak,
          bestStreak: Math.max(prev.bestStreak, streak),
          lastDay: active ? day : prev.lastDay,
          kills: prev.kills + pl.kills,
          renown: prev.renown + pl.renown,
          awards,
        });
      }
    });
  }

  private broadcastRoom(room: RoomRow): void {
    // Viewer-specific fields are stripped; clients refetch details they are entitled to.
    const detail = this.detail(room, null);
    this.deps.channelFor(room.id).send({ type: 'room', room: detail });
  }

  private warDeps(roomId: number) {
    return { store: this.deps.store, log: this.deps.log, channel: this.deps.channelFor(roomId) };
  }
}

/** Rest is set per UTC date; it covers a war if that date overlaps the war's day. */
export function restedDuring(restingDay: string | null, war: { startsAt: number; endsAt: number }): boolean {
  return restingDay !== null && (restingDay === isoDay(war.startsAt) || restingDay === isoDay(war.endsAt - 1));
}

export function enlistee(user: UserRow): Enlistee {
  return { userId: user.id, login: user.login, avatarUrl: user.avatarUrl, bot: user.bot };
}

export function userRef(user: UserRow | null): UserRef {
  return user ? { id: user.id, login: user.login, avatarUrl: user.avatarUrl } : { id: -1, login: 'unknown', avatarUrl: '' };
}
