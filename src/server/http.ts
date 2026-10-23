import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CHAT_MAX,
  EMOTES,
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_NOT_FOUND,
  type ArmoryResponse,
  type DigestResponse,
  type LegendsResponse,
  type OrdersResponse,
  type SeasonResponse,
  type HookResponse,
  type KeyframeResponse,
  type LobbyResponse,
  type MeResponse,
  type ProfileResponse,
  type UserRef,
  type WarSummary,
} from '../protocol.ts';
import { AWARDS } from '../rules/digest.ts';
import { generateMap } from '../sim/mapgen.ts';
import type { MapDef } from '../sim/api.ts';
import { decodeInput, type Replay } from '../sim/replay.ts';
import { registerAuth, type AuthDeps } from './auth.ts';
import type { RoomRow, Store, UserRow, WarRow } from './db.ts';
import { registerHooks } from './hooks.ts';
import type { Meta } from './meta.ts';
import { DEFAULT_HERALDRY, FANFARES, KEEPS, TRIMS } from '../rules/meta.ts';
import { EMBLEMS, PATTERNS } from '../rules/heraldry.ts';
import type { Hub } from './hub.ts';
import type { GithubClient } from './github.ts';
import type { PushReport } from './poller.ts';
import { isoDay, RoomFailure, Rooms, userRef } from './rooms.ts';
import { readSession, SESSION_COOKIE } from './session.ts';
import { TICK_MS } from '../sim/api.ts';
import { validWebhookUrl } from './webhook.ts';

export interface HttpDeps extends AuthDeps {
  hub: Hub;
  rooms: Rooms;
  github: GithubClient | null;
  onPush: (report: PushReport) => void;
  meta?: Meta;
}

const Name = z.string().trim().min(2).max(48);
const CreateRoom = z.object({
  name: Name,
  visibility: z.enum(['public', 'private']),
  resetHour: z.number().int().min(0).max(23),
  bots: z.number().int().min(0).max(6),
});
const UpdateRoom = z.object({
  name: Name.optional(),
  visibility: z.enum(['public', 'private']).optional(),
  resetHour: z.number().int().min(0).max(23).optional(),
  bots: z.number().int().min(0).max(6).optional(),
  webhookUrl: z.string().trim().max(500).nullable().optional(),
});
const Command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('doctrine'), doctrine: z.number().int().min(0).max(4) }),
  z.object({ kind: z.literal('rally'), site: z.number().int().min(0).max(64) }),
  z.object({ kind: z.literal('cry') }),
]);
const ArmoryRequest = z
  .object({
    pattern: z.enum(PATTERNS),
    emblem: z.enum(EMBLEMS),
    keep: z.enum(KEEPS),
    trim: z.enum(TRIMS),
    fanfare: z.enum(FANFARES),
    tassel: z.boolean(),
    title: z.string().max(60).nullable(),
  })
  .partial();
const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,48}$/) });
const WarParams = SlugParams.extend({ warId: z.coerce.number().int().positive() });
const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resync') }),
  z.object({ type: z.literal('emote'), emote: z.enum(EMOTES) }),
  z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(CHAT_MAX) }),
]);

const RESYNC_MIN_MS = 2000;

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
  if (err instanceof RoomFailure) {
    const status = { not_found: 404, forbidden: 403, invalid: 400, full: 409, limit: 429, signed_out: 401 }[err.code];
    return fail(reply, status, err.code, err.message);
  }
  // A malformed slug or war id in the path names nothing.
  if (err instanceof z.ZodError) return fail(reply, 404, 'not_found', 'Not found.');
  throw err;
}

export async function buildHttp(deps: HttpDeps): Promise<FastifyInstance> {
  const { store, rooms, hub, config, clock } = deps;
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 2048 } });

  const viewerOf = (req: FastifyRequest): UserRow | null => {
    const id = readSession(req.cookies[SESSION_COOKIE], config.sessionSecret, clock());
    return id === null ? null : store.user(id);
  };
  const roomOf = (slug: string): RoomRow => {
    const room = store.roomBySlug(slug);
    if (!room) throw new RoomFailure('not_found', 'No such room.');
    return room;
  };
  const viewable = (req: FastifyRequest, slug: string): { room: RoomRow; user: UserRow | null } => {
    const room = roomOf(slug);
    const user = viewerOf(req);
    const invite = typeof (req.query as Record<string, unknown>).invite === 'string' ? ((req.query as Record<string, string>).invite ?? null) : null;
    if (!rooms.canView(room, user?.id ?? null, invite)) throw new RoomFailure('forbidden', 'This room is private.');
    return { room, user };
  };
  const ownerOf = (req: FastifyRequest, slug: string): { room: RoomRow; user: UserRow } => {
    const user = viewerOf(req);
    if (!user) throw new RoomFailure('signed_out', 'Sign in first.');
    const room = roomOf(slug);
    if (room.ownerId !== user.id) throw new RoomFailure('forbidden', 'Only the room owner can do that.');
    return { room, user };
  };
  /** Drops live sockets that lost access to a room (removed member, now private, rotated invite). */
  const recheckViewers = (roomId: number) => {
    const room = store.room(roomId);
    if (room) hub.revalidate(roomId, (userId, invite) => rooms.canView(room, userId, invite), WS_CLOSE_FORBIDDEN, 'this room is private');
  };
  const createLimit = new Limiter(3600_000, 10);
  const commandLimit = new Limiter(10_000, 6);
  const chatLimit = new Limiter(10_000, 6);
  const emoteLimit = new Limiter(10_000, 6);

  // ------------------------------------------------------------- socket

  hub.setHello((roomId, _socket, user) => {
    const room = store.room(roomId);
    const war = room ? rooms.war(roomId) : null;
    if (!room || !war) return null;
    return war.hello(
      rooms.detail(room, user?.id ?? null),
      user?.id ?? null,
      { chat: store.chat(roomId, 50), presence: hub.presence(roomId), monuments: deps.meta?.monuments(room, war) ?? [] },
      clock(),
    );
  });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const q = req.query as Record<string, unknown>;
    const slug = typeof q.room === 'string' ? q.room : '';
    const invite = typeof q.invite === 'string' ? q.invite : null;
    const room = /^[a-z0-9-]{3,48}$/.test(slug) ? store.roomBySlug(slug) : null;
    if (!room || !rooms.war(room.id)) return socket.close(WS_CLOSE_NOT_FOUND, 'room not found');
    const user = viewerOf(req);
    if (!rooms.canView(room, user?.id ?? null, invite)) return socket.close(WS_CLOSE_FORBIDDEN, 'this room is private');
    const ref: UserRef | null = user ? { id: user.id, login: user.login, avatarUrl: user.avatarUrl } : null;
    hub.add(room.id, socket, ref, invite);
    let lastResync = -Infinity;
    socket.on('message', (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const msg = ClientMessage.safeParse(parsed);
      if (!msg.success) return;
      const now = clock();
      if (msg.data.type === 'resync') {
        // A hello carries a full snapshot; anyone, signed in or not, could otherwise flood the event loop with them.
        if (now - lastResync < RESYNC_MIN_MS) return;
        lastResync = now;
        return hub.sendHello(room.id, socket);
      }
      if (!user) return;
      const key = `u${user.id}`;
      if (msg.data.type === 'emote') {
        if (!emoteLimit.allow(key, now)) return;
        const war = rooms.war(room.id);
        hub.broadcast(room.id, { type: 'emote', login: user.login, p: war?.playerOf(user.id) ?? null, emote: msg.data.emote });
        return;
      }
      if (!store.isMember(room.id, user.id) || !chatLimit.allow(key, now)) return;
      const text = msg.data.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (!text) return;
      const id = store.addChat(room.id, user.id, now, text);
      hub.broadcast(room.id, { type: 'chat', message: { id, at: now, user: ref!, text } });
    });
  });

  // ---------------------------------------------------------------- me

  app.get('/api/me', async (req): Promise<MeResponse> => {
    const user = viewerOf(req);
    const base = { oauth: config.oauth !== null, devAuth: config.devAuth };
    if (!user) return { user: null, rooms: [], ...base };
    return {
      user: {
        ...userRef(user),
        resting: user.restingDay === isoDay(clock()),
        hookUrl: user.hookSecret ? `${config.publicUrl}/hooks/github/${user.id}` : null,
        streak: store.bestStreak(user.id),
      },
      rooms: store.roomsOf(user.id).map((r) => rooms.card(r)),
      ...base,
    };
  });

  app.post('/api/me/rest', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
    const on = z.object({ on: z.boolean() }).safeParse(req.body);
    if (!on.success) return fail(reply, 400, 'invalid', 'Expected { on: boolean }.');
    store.setRestingDay(user.id, on.data.on ? isoDay(clock()) : null);
    return reply.code(204).send();
  });

  app.post('/api/me/hook', async (req, reply): Promise<HookResponse | void> => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
    const secret = randomBytes(24).toString('hex');
    store.setHookSecret(user.id, secret);
    return { hookUrl: `${config.publicUrl}/hooks/github/${user.id}`, secret };
  });

  app.get('/api/users/:login', async (req, reply): Promise<ProfileResponse | void> => {
    const login = z.object({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/) }).safeParse(req.params);
    const user = login.success ? store.userByLogin(login.data.login) : null;
    if (!user || user.bot) return fail(reply, 404, 'not_found', 'No such player.');
    const viewer = viewerOf(req);
    const records = store.lifetimesOf(user.id).flatMap((l) => {
      const room = store.room(l.roomId);
      if (!room || !rooms.canView(room, viewer?.id ?? null, null)) return [];
      return [{ room: { slug: room.slug, name: room.name }, days: l.days, wins: l.wins, streak: l.streak, bestStreak: l.bestStreak, kills: l.kills, renown: l.renown, awards: l.awards }];
    });
    const totals = new Map<string, number>();
    for (const r of records) for (const [k, v] of Object.entries(r.awards)) totals.set(k, (totals.get(k) ?? 0) + v);
    const titles = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${n > 1 ? `${n}× ` : ''}${AWARDS.find((a) => a.id === id)?.title ?? id}`);
    const meta = deps.meta;
    if (!meta) return { user: userRef(user), records, titles };
    const visible = (roomId: number) => {
      const room = store.room(roomId);
      return room !== null && rooms.canView(room, viewer?.id ?? null, null);
    };
    return {
      user: userRef(user),
      records,
      titles,
      rank: meta.rank(user.id),
      deeds: meta.deeds(user.id, visible),
      rivalries: meta.rivalries(user.id, visible),
      heraldry: meta.heraldryOf(user.id) ?? DEFAULT_HERALDRY,
    };
  });

  // ------------------------------------------------------- the long loops

  app.get('/api/me/armory', async (req, reply): Promise<ArmoryResponse | void> => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in to visit your Armory.');
    if (!deps.meta) return fail(reply, 404, 'not_found', 'The Armory is closed.');
    return deps.meta.armory(user.id);
  });

  app.post('/api/me/armory', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in to visit your Armory.');
    if (!deps.meta) return fail(reply, 404, 'not_found', 'The Armory is closed.');
    const body = ArmoryRequest.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'invalid', 'Choose a pattern, emblem, keep, trim, fanfare, tassel or title.');
    const { armory, refused } = deps.meta.setArmory(user.id, body.data);
    if (refused.length > 0) return reply.code(409).send({ error: 'locked', message: `Not yet unlocked: ${refused.join(', ')}.`, armory });
    return armory;
  });

  app.get('/api/rooms/:slug/legends', async (req, reply): Promise<LegendsResponse | void> => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = viewable(req, slug);
      return deps.meta?.legends(room.id) ?? { legends: [] };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/season', async (req, reply): Promise<SeasonResponse | void> => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = viewable(req, slug);
      const day = rooms.war(room.id)?.meta.day ?? isoDay(clock());
      return deps.meta?.season(room, day) ?? { season: day, standings: [], champion: null };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/orders', async (req, reply): Promise<OrdersResponse | void> => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = viewable(req, slug);
      const war = rooms.war(room.id);
      return war && deps.meta ? deps.meta.orders(war) : { orders: [] };
    } catch (err) {
      return failure(reply, err);
    }
  });

  // ------------------------------------------------------------- rooms

  app.get('/api/rooms', async (): Promise<LobbyResponse> => ({
    rooms: store
      .rooms()
      .filter((r) => r.visibility === 'public')
      .map((r) => rooms.card(r))
      .sort((a, b) => b.viewers - a.viewers || b.members - a.members),
  }));

  app.post('/api/rooms', async (req, reply) => {
    const user = viewerOf(req);
    if (!user) return fail(reply, 401, 'signed_out', 'Sign in to create a room.');
    const body = CreateRoom.safeParse(req.body);
    if (!body.success) return fail(reply, 400, 'invalid', 'Give the room a name of 2–48 characters, a visibility, a reset hour 0–23 and 0–6 bots.');
    if (!createLimit.allow(`u${user.id}`, clock())) return fail(reply, 429, 'limit', 'Too many rooms created. Try again later.');
    try {
      const room = rooms.create(user, body.data, clock());
      return { slug: room.slug };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room, user } = viewable(req, slug);
      return rooms.detail(room, user?.id ?? null);
    } catch (err) {
      if (err instanceof z.ZodError) return fail(reply, 404, 'not_found', 'No such room.');
      return failure(reply, err);
    }
  });

  app.patch('/api/rooms/:slug', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room, user } = ownerOf(req, slug);
      const body = UpdateRoom.safeParse(req.body);
      if (!body.success) return fail(reply, 400, 'invalid', 'Invalid room settings.');
      const webhookUrl = body.data.webhookUrl === '' ? null : body.data.webhookUrl;
      if (webhookUrl && !validWebhookUrl(webhookUrl)) return fail(reply, 400, 'invalid', 'Use a Slack (hooks.slack.com/services/…) or Discord (discord.com/api/webhooks/…) webhook URL.');
      const updated = rooms.update(room, { ...body.data, webhookUrl });
      recheckViewers(room.id);
      return rooms.detail(updated, user.id);
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.delete('/api/rooms/:slug', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = ownerOf(req, slug);
      if (room.slug === 'commons') return fail(reply, 400, 'invalid', 'The Commons cannot be deleted.');
      rooms.delete(room);
      deps.meta?.deleteRoom(room.id);
      hub.closeRoom(room.id, WS_CLOSE_NOT_FOUND, 'room deleted');
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/rooms/:slug/join', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const user = viewerOf(req);
      if (!user) return fail(reply, 401, 'signed_out', 'Sign in to join.');
      const room = roomOf(slug);
      const invite = z.object({ invite: z.string().nullable().optional() }).safeParse(req.body).data?.invite ?? null;
      rooms.join(room, user, invite, clock());
      return rooms.detail(room, user.id);
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/rooms/:slug/leave', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const user = viewerOf(req);
      if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
      const room = roomOf(slug);
      rooms.leave(room, user.id);
      recheckViewers(room.id);
      return reply.code(204).send();
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/rooms/:slug/invite', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room, user } = ownerOf(req, slug);
      const rotated = rooms.rotateInvite(room);
      recheckViewers(room.id);
      return rooms.detail(rotated, user.id);
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.delete('/api/rooms/:slug/members/:userId', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const target = z.coerce.number().int().safeParse((req.params as { userId?: string }).userId);
      const { room, user } = ownerOf(req, slug);
      if (!target.success || target.data === user.id) return fail(reply, 400, 'invalid', 'You cannot remove yourself.');
      const updated = rooms.kick(room, target.data);
      recheckViewers(room.id);
      return rooms.detail(updated, user.id);
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.post('/api/rooms/:slug/command', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const user = viewerOf(req);
      if (!user) return fail(reply, 401, 'signed_out', 'Sign in first.');
      const cmd = Command.safeParse(req.body);
      if (!cmd.success) return fail(reply, 400, 'invalid', 'Unknown command.');
      if (!commandLimit.allow(`u${user.id}`, clock())) return fail(reply, 429, 'limit', 'Slow down.');
      const room = roomOf(slug);
      // A removed member keeps their capital for the day but no longer gives orders.
      if (!store.isMember(room.id, user.id)) return fail(reply, 403, 'forbidden', 'Only members of this room can give orders.');
      const war = rooms.war(room.id);
      if (!war) return fail(reply, 409, 'ended', 'No war is running in this room.');
      const error = war.command(clock(), user.id, cmd.data);
      if (error) {
        const message = {
          not_in_war: 'You are not fighting in today\'s war. Join the room; you will fight from the next free capital or tomorrow.',
          cooldown: 'That order is still on cooldown.',
          used: 'You have already sounded your War Cry today.',
          invalid: 'That order is not valid now.',
          ended: 'Today\'s war is over.',
        }[error];
        return fail(reply, 409, error, message);
      }
      return { tick: war.world.tick };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/chronicle', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = viewable(req, slug);
      const since = z.coerce.number().int().min(0).catch(0).parse((req.query as { since?: string }).since);
      const war = rooms.war(room.id);
      return { entries: war ? war.chronicleSince(since, 500) : [] };
    } catch (err) {
      return failure(reply, err);
    }
  });

  // -------------------------------------------------------------- wars

  const summary = (w: WarRow): WarSummary => ({
    id: w.id,
    day: w.day,
    status: w.status,
    startsAt: w.startsAt,
    endsAt: w.endsAt,
    winner: w.winnerLogin ? { login: w.winnerLogin, hue: w.winnerHue ?? 0, renown: w.winnerRenown ?? 0 } : null,
    players: w.header.players.length,
    pushes: w.pushes,
  });
  const warOf = (req: FastifyRequest): { room: RoomRow; war: WarRow } => {
    const { slug, warId } = WarParams.parse(req.params);
    const { room } = viewable(req, slug);
    const war = store.war(warId);
    if (!war || war.roomId !== room.id) throw new RoomFailure('not_found', 'No such war.');
    return { room, war };
  };

  app.get('/api/rooms/:slug/wars', async (req, reply) => {
    try {
      const { slug } = SlugParams.parse(req.params);
      const { room } = viewable(req, slug);
      return { wars: store.wars(room.id, 60).map(summary) };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/wars/:warId/digest', async (req, reply): Promise<DigestResponse | void> => {
    try {
      const { room, war } = warOf(req);
      if (!war.digest) return fail(reply, 404, 'not_ready', 'This war is still being fought. Its digest is written at the reset hour.');
      const map = generateMap({ seed: war.seed, slots: war.slots, members: war.members });
      return {
        room: { slug: room.slug, name: room.name },
        war: summary(war),
        digest: war.digest,
        map: { radius: map.radius, sites: map.sites.map((s) => ({ kind: s.kind, x: Math.round(s.x), y: Math.round(s.y), slot: s.slot })), terrain: coarseTerrain(map, 2) },
        players: war.header.players.map((pl, p) => ({ p, login: pl.login, hue: pl.hue, slot: pl.slot })),
        timelapse: store.frames(war.id),
      };
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/wars/:warId/replay', async (req, reply): Promise<Replay | void> => {
    try {
      const { war } = warOf(req);
      if (war.status !== 'ended') return fail(reply, 404, 'not_ready', 'Replays are available once the day is over.');
      const replay: Replay = {
        v: 1,
        seed: war.seed,
        slots: war.slots,
        members: war.members,
        tickMs: TICK_MS,
        startsAt: war.startsAt,
        endsAt: war.endsAt,
        players: war.header.players.map(({ login, id, hue, slot, bot }) => ({ login, id, hue, slot, bot })),
        repos: war.header.repos,
        inputs: store.inputs(war.id).map((i) => i.data),
      };
      // Sanity: every input decodes, so a corrupt row fails here rather than in a viewer's browser.
      for (const e of replay.inputs) decodeInput(e);
      reply.header('content-disposition', `inline; filename="pushfront-${war.day}-${war.id}.json"`);
      return replay;
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/rooms/:slug/wars/:warId/keyframe', async (req, reply): Promise<KeyframeResponse | null | void> => {
    try {
      const { war } = warOf(req);
      const tick = z.coerce.number().int().min(0).catch(0).parse((req.query as { tick?: string }).tick);
      const snap = store.latestSnapshot(war.id, tick);
      return snap ? { tick: snap.tick, snapshot: JSON.parse(snap.json) as KeyframeResponse['snapshot'] } : null;
    } catch (err) {
      return failure(reply, err);
    }
  });

  app.get('/api/health', async () => ({ ok: true, rooms: rooms.wars().length, spectators: hub.size, ingestion: deps.github !== null }));

  registerAuth(app, deps);
  registerHooks(app, { store, github: deps.github, log: deps.log, clock, onPush: deps.onPush });

  const clientDir = resolve(config.clientDir);
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0]!;
      if (req.method !== 'GET' || /^\/(api|auth|ws|hooks)(\/|$)/.test(path)) return reply.code(404).send({ error: 'not_found', message: 'Not found.' });
      return reply.type('text/html').sendFile('index.html');
    });
  }
  return app;
}

/** The nav grid sampled every `step` cells, for the digest's painted timelapse. */
export function coarseTerrain(map: MapDef, step: number): NonNullable<DigestResponse['map']['terrain']> {
  const cols = Math.ceil(map.navCols / step);
  const rows = Math.ceil(map.navRows / step);
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = Math.min(map.navCols - 1, c * step + (step >> 1));
      const row = Math.min(map.navRows - 1, r * step + (step >> 1));
      const t = map.terrain[row * map.navCols + col] ?? 255;
      cells += t === 255 ? '.' : String(Math.min(3, t));
    }
  }
  return { cols, cell: map.navCell * step, originX: map.originX, originY: map.originY, cells };
}
