import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { WS_CLOSE_FORBIDDEN, type DigestResponse, type MeResponse, type RoomDetail } from '../protocol.ts';
import { Cat } from '../sim/api.ts';
import { runReplay, type Replay } from '../sim/replay.ts';
import { checksum } from '../sim/snapshot.ts';
import { createServer, type Server } from './app.ts';
import { devId } from './auth.ts';
import { loadConfig } from './config.ts';
import { silentLogger } from './log.ts';
import { nextReset } from './rooms.ts';
import { postDigest, validWebhookUrl } from './webhook.ts';

const DAY = 10 * 60_000;

async function boot(opts: { db?: string; now?: { t: number }; daily?: boolean } = {}) {
  const now = opts.now ?? { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_PATH: opts.db ?? ':memory:', DEV_AUTH: '1', COMMONS: '0', PUBLIC_URL: 'http://pf.test',
    ...(opts.daily ? {} : { DAY_MINUTES: String(DAY / 60_000) }),
  });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, random: () => 0.99 });
  await server.app.ready();
  return { server, now };
}

async function signIn(server: Server, login: string): Promise<string> {
  const res = await server.app.inject({ method: 'GET', url: `/auth/dev?login=${login}` });
  const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!;
  return cookie.split(';')[0]!;
}

function advance(server: Server, now: { t: number }, ms: number): void {
  now.t += ms;
  for (const w of server.rooms.wars()) w.catchUp(now.t);
  server.rooms.reconcile(now.t);
}

const lines = (code: number, test = 0, docs = 0) => {
  const l = new Array<number>(9).fill(0);
  l[Cat.Code] = code;
  l[Cat.Test] = test;
  l[Cat.Docs] = docs;
  return l;
};

describe('rooms and the daily war', () => {
  it('runs a day, writes a digest and lifetime records, and starts the next day', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const bo = await signIn(server, 'bo');
    const created = await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Night Shift', visibility: 'public', resetHour: 0, bots: 1 } });
    expect(created.statusCode).toBe(200);
    const { slug } = created.json<{ slug: string }>();
    expect((await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: bo }, payload: {} })).statusCode).toBe(200);

    const me = (await server.app.inject({ url: '/api/me', headers: { cookie: ana } })).json<MeResponse>();
    expect(me.rooms.map((r) => r.slug)).toEqual([slug]);

    advance(server, now, 30_000);
    server.rooms.onPush({ userId: devId('ana'), pushId: 'x@1', repo: 'ana/parser', language: 'TypeScript', lines: lines(200, 60, 20), files: 3, branches: 12, churn: 0, filler: 0, commits: 2, message: 'Tokenizer', at: now.t }, now.t);
    server.rooms.onPush({ userId: devId('bo'), pushId: 'y@1', repo: 'bo/site', language: 'CSS', lines: lines(90), files: 3, branches: 12, churn: 0, filler: 0, commits: 1, message: 'Styles', at: now.t }, now.t);

    const war = server.rooms.wars()[0]!;
    const warId = war.id;
    for (let i = 0; i < 20; i++) advance(server, now, 30_000);
    expect(server.rooms.wars()[0]!.id).not.toBe(warId);

    const digest = (await server.app.inject({ url: `/api/rooms/${slug}/wars/${warId}/digest` })).json<DigestResponse>();
    expect(digest.digest.totals.pushes).toBeGreaterThanOrEqual(2);
    // The room asked for one bot; a second fills the ring to three seats before bo joins.
    expect(digest.digest.players.map((p) => p.login)).toEqual(['ana', 'ada-bot', 'grace-bot', 'bo']);
    expect(digest.digest.awards.length).toBeGreaterThan(0);

    const replay = (await server.app.inject({ url: `/api/rooms/${slug}/wars/${warId}/replay` })).json<Replay>();
    const final = server.store.latestSnapshot(warId)!;
    expect(checksum(runReplay(replay, digest.digest.ticks))).toBe(final.checksum);

    // Long after the war, only its final snapshot survives pruning; replays still check out.
    server.store.pruneEndedSnapshots(Number.MAX_SAFE_INTEGER);
    expect(server.store.latestSnapshot(warId, final.tick - 1)).toBeNull();
    expect(server.store.latestSnapshot(warId)).toEqual(final);

    const lifetime = server.store.lifetime(devId('ana'), server.store.roomBySlug(slug)!.id)!;
    expect(lifetime).toMatchObject({ days: 1, streak: 1 });
    await server.shutdown();
  });

  it('keeps private rooms private', async () => {
    const { server } = await boot();
    const owner = await signIn(server, 'owner');
    const stranger = await signIn(server, 'stranger');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Secret', visibility: 'private', resetHour: 5, bots: 0 } })).json<{ slug: string }>();
    const detail = (await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: owner } })).json<RoomDetail>();
    expect(detail.invite).toBeTruthy();
    expect((await server.app.inject({ url: `/api/rooms/${slug}` })).statusCode).toBe(403);
    expect((await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: stranger } })).statusCode).toBe(403);
    expect((await server.app.inject({ url: `/api/rooms/${slug}?invite=${detail.invite}` })).statusCode).toBe(200);
    // The room's other pages (past wars, Season, Hall, the away recap) take the invite the same way.
    for (const path of ['wars', 'season', 'legends', 'chronicle?since=0']) {
      const url = `/api/rooms/${slug}/${path}`;
      expect((await server.app.inject({ url, headers: { cookie: stranger } })).statusCode, url).toBe(403);
      expect((await server.app.inject({ url: `${url}${url.includes('?') ? '&' : '?'}invite=${detail.invite}`, headers: { cookie: stranger } })).statusCode, url).toBe(200);
      expect((await server.app.inject({ url: `${url}${url.includes('?') ? '&' : '?'}invite=wrong` })).statusCode, url).toBe(403);
    }
    expect((await server.app.inject({ url: '/api/rooms' })).json<{ rooms: unknown[] }>().rooms).toHaveLength(0);
    expect((await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: stranger }, payload: {} })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: stranger }, payload: { invite: detail.invite } })).statusCode).toBe(200);
    const asMember = (await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: stranger } })).json<RoomDetail>();
    expect(asMember.viewer.member).toBe(true);
    expect(asMember.webhookUrl).toBeNull();
    const patch = await server.app.inject({ method: 'PATCH', url: `/api/rooms/${slug}`, headers: { cookie: stranger }, payload: { name: 'Mine now' } });
    expect(patch.statusCode).toBe(403);
    const bad = await server.app.inject({ method: 'PATCH', url: `/api/rooms/${slug}`, headers: { cookie: owner }, payload: { webhookUrl: 'https://evil.example/hook' } });
    expect(bad.statusCode).toBe(400);
    await server.shutdown();
  });

  it('ends a war won by conquest early, writes its digest, stays locked, and starts the next war at the reset', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'pf-')), 'pf.db');
    const now = { t: Date.UTC(2026, 9, 23, 12) };
    const first = await boot({ db, now, daily: true });
    const ana = await signIn(first.server, 'ana');
    const { slug } = (await first.server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Ring', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const war = first.server.rooms.wars()[0]!;
    // Bots fill the ring to three seats.
    expect(war.header.players.map((p) => p.bot)).toEqual([false, true, true]);
    advance(first.server, now, 20_000);
    first.server.rooms.onPush({ userId: devId('ana'), pushId: 'r@1', repo: 'ana/x', language: null, lines: lines(150), files: 3, branches: 12, churn: 0, filler: 0, commits: 1, message: 'm', at: now.t }, now.t);
    advance(first.server, now, 5_000);
    // The whole ring falls to ana: every capital changes hands at once.
    for (const st of war.world.structures) st.p = 0;
    advance(first.server, now, 5_000);
    expect(war.world.victor).toBe(0);
    expect(war.active).toBe(false);
    const row = first.server.store.war(war.id)!;
    expect(row.status).toBe('ended');
    expect(row.digest!.victory).toEqual({ p: 0, tick: war.world.victoryTick });
    expect(row.digest!.winner).toBe(0);
    // Locked until the reset: no new war, no pushes, no orders.
    const tick = war.world.tick;
    advance(first.server, now, 3_600_000);
    expect(first.server.rooms.wars()[0]!.id).toBe(war.id);
    expect(war.world.tick).toBe(tick);
    expect(war.push(now.t, devId('ana'), { repo: 'ana/x', language: null, lines: lines(10), commits: 1, message: 'm' })).toBe(false);
    const digest = (await first.server.app.inject({ url: `/api/rooms/${slug}/wars/${war.id}/digest` })).json<DigestResponse>();
    expect(digest.digest.victory?.p).toBe(0);
    await first.server.shutdown();

    // A restart before the reset finds the room still standing on its won war.
    const second = await boot({ db, now, daily: true });
    expect(second.server.rooms.wars().map((w) => w.id)).toEqual([war.id]);
    now.t = war.endsAt + 1_000;
    second.server.rooms.reconcile(now.t);
    const next = second.server.rooms.wars()[0]!;
    expect(next.id).not.toBe(war.id);
    expect(next.active).toBe(true);
    expect(next.meta.startsAt).toBe(war.endsAt);
    await second.server.shutdown();
  });

  it('recovers a war after a restart without losing inputs', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'pf-')), 'pf.db');
    const now = { t: Date.UTC(2026, 9, 23, 12) };
    const first = await boot({ db, now });
    const ana = await signIn(first.server, 'ana');
    const { slug } = (await first.server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Durable', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    advance(first.server, now, 20_000);
    first.server.rooms.onPush({ userId: devId('ana'), pushId: 'z@1', repo: 'ana/x', language: null, lines: lines(150), files: 3, branches: 12, churn: 0, filler: 0, commits: 1, message: 'm', at: now.t }, now.t);
    advance(first.server, now, 60_000);
    const before = first.server.rooms.wars()[0]!;
    const units = before.world.units.length;
    const tick = before.world.tick;
    const sum = checksum(before.world);
    await first.server.shutdown();

    const second = await boot({ db, now });
    const after = second.server.rooms.wars().find((w) => w.meta.id === before.id)!;
    expect(after.world.tick).toBe(tick);
    expect(after.world.units.length).toBe(units);
    expect(checksum(after.world)).toBe(sum);
    expect(second.server.store.roomBySlug(slug)).not.toBeNull();
    await second.server.shutdown();
  });
});

function closed(ws: WebSocket): Promise<number> {
  return new Promise((done) => ws.on('close', (code) => done(code)));
}

const settle = () => new Promise((done) => setTimeout(done, 30));

describe('access changes and abuse', () => {
  it('disconnects viewers who lose access and keeps removed members out', async () => {
    const { server } = await boot();
    const owner = await signIn(server, 'owner');
    const guest = await signIn(server, 'guest');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Secret', visibility: 'private', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const { invite } = (await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: owner } })).json<RoomDetail>();
    await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: guest }, payload: { invite } });

    const member = await server.app.injectWS(`/ws?room=${slug}`, { headers: { cookie: guest } });
    const linkHolder = await server.app.injectWS(`/ws?room=${slug}&invite=${invite}`);
    const ownerWs = await server.app.injectWS(`/ws?room=${slug}`, { headers: { cookie: owner } });
    let ownerClosed = false;
    ownerWs.on('close', () => (ownerClosed = true));
    const memberClosed = closed(member);
    // Kicking from a private room rotates the invite, since the kicked member could see it.
    const linkClosed = closed(linkHolder);
    const kicked = await server.app.inject({ method: 'DELETE', url: `/api/rooms/${slug}/members/${devId('guest')}`, headers: { cookie: owner } });
    expect(kicked.statusCode).toBe(200);
    expect(kicked.json<RoomDetail>().invite).not.toBe(invite);
    expect(await memberClosed).toBe(WS_CLOSE_FORBIDDEN);
    expect(await linkClosed).toBe(WS_CLOSE_FORBIDDEN);

    const rejoin = await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: guest }, payload: { invite } });
    expect(rejoin.statusCode).toBe(403);

    const { invite: current } = (await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: owner } })).json<RoomDetail>();
    const second = await server.app.injectWS(`/ws?room=${slug}&invite=${current}`);
    const secondClosed = closed(second);
    await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/invite`, headers: { cookie: owner } });
    expect(await secondClosed).toBe(WS_CLOSE_FORBIDDEN);
    await settle();
    expect(ownerClosed).toBe(false);
    ownerWs.terminate();
    await server.shutdown();
  });

  it('disconnects anonymous viewers when a public room turns private', async () => {
    const { server } = await boot();
    const owner = await signIn(server, 'owner');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Open', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const anon = await server.app.injectWS(`/ws?room=${slug}`);
    const anonClosed = closed(anon);
    await server.app.inject({ method: 'PATCH', url: `/api/rooms/${slug}`, headers: { cookie: owner }, payload: { visibility: 'private' } });
    expect(await anonClosed).toBe(WS_CLOSE_FORBIDDEN);
    await server.shutdown();
  });

  it('throttles resync so a viewer cannot flood the server with snapshots', async () => {
    const { server } = await boot();
    const owner = await signIn(server, 'owner');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Open', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const hellos: unknown[] = [];
    const ws = await server.app.injectWS(`/ws?room=${slug}`, {}, {
      onInit: (s) => s.on('message', (raw: Buffer) => (JSON.parse(raw.toString()) as { type: string }).type === 'hello' && hellos.push(1)),
    });
    for (let i = 0; i < 20; i++) ws.send(JSON.stringify({ type: 'resync' }));
    await settle();
    expect(hellos.length).toBe(2);
    ws.terminate();
    await server.shutdown();
  });

  it('deletes everything a room owns', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Gone', visibility: 'public', resetHour: 0, bots: 1 } })).json<{ slug: string }>();
    const roomId = server.store.roomBySlug(slug)!.id;
    for (let i = 0; i < 25; i++) advance(server, now, 30_000);
    server.store.addChat(roomId, devId('ana'), now.t, 'bye');
    expect((await server.app.inject({ method: 'DELETE', url: `/api/rooms/${slug}`, headers: { cookie: ana } })).statusCode).toBe(204);
    const count = (sql: string) => (server.store.db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT count(*) AS n FROM wars')).toBe(0);
    expect(count('SELECT count(*) AS n FROM war_inputs')).toBe(0);
    expect(count('SELECT count(*) AS n FROM war_snapshots')).toBe(0);
    expect(count('SELECT count(*) AS n FROM war_frames')).toBe(0);
    expect(count('SELECT count(*) AS n FROM chat')).toBe(0);
    expect(count('SELECT count(*) AS n FROM lifetime')).toBe(0);
    await server.shutdown();
  });

  it('keeps rolling other rooms over when one room fails', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    for (const name of ['First', 'Second']) {
      await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name, visibility: 'public', resetHour: 0, bots: 0 } });
    }
    const [broken, healthy] = server.rooms.wars();
    broken!.conclude = () => {
      throw new Error('corrupt');
    };
    const before = healthy!.id;
    for (let i = 0; i < 22; i++) advance(server, now, 30_000);
    expect(server.rooms.wars().map((w) => w.id)).not.toContain(before);
    await server.shutdown();
  });
});

describe('the day\'s end survives failures', () => {
  it('ends a war only together with its lifetime records, and retries a failed finish', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Fragile', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const roomId = server.store.roomBySlug(slug)!.id;
    const warId = server.rooms.wars()[0]!.id;
    advance(server, now, 30_000);
    server.rooms.onPush({ userId: devId('ana'), pushId: 'x@1', repo: 'ana/a', language: null, lines: lines(80), files: 3, branches: 12, churn: 0, filler: 0, commits: 1, message: 'm', at: now.t }, now.t);
    const save = server.store.saveLifetime.bind(server.store);
    server.store.saveLifetime = () => {
      throw new Error('disk I/O error');
    };
    for (let i = 0; i < 21; i++) advance(server, now, 30_000);
    // Nothing of the day's end was kept: the war is still active, not ended without its records.
    expect(server.store.war(warId)!.status).toBe('active');
    expect(server.store.lifetime(devId('ana'), roomId)).toBeNull();
    server.store.saveLifetime = save;
    advance(server, now, 1_000);
    advance(server, now, 1_000);
    expect(server.store.war(warId)!.status).toBe('ended');
    expect(server.store.lifetime(devId('ana'), roomId)).toMatchObject({ days: 1, streak: 1 });
    expect(server.rooms.war(roomId)!.id).not.toBe(warId);
    await server.shutdown();
  });

  it('starts the server when one room cannot be recovered', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'pf-')), 'pf.db');
    const now = { t: Date.UTC(2026, 9, 23, 12) };
    const first = await boot({ db, now });
    const ana = await signIn(first.server, 'ana');
    for (const name of ['Broken', 'Healthy']) {
      await first.server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name, visibility: 'public', resetHour: 0, bots: 0 } });
    }
    const [broken, healthy] = first.server.rooms.wars();
    first.server.store.db.prepare("UPDATE wars SET header = '{corrupt' WHERE id = ?").run(broken!.id);
    await first.server.shutdown();

    const second = await boot({ db, now });
    expect(second.server.rooms.wars().map((w) => w.id)).toEqual([healthy!.id]);
    await second.server.shutdown();
  });
});

describe('lifetime streaks', () => {
  it('keeps a streak on a day of Rest without growing it', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Resting', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const roomId = server.store.roomBySlug(slug)!.id;
    const day = server.rooms.wars()[0]!.meta.day;
    const yesterday = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    server.store.saveLifetime({ userId: devId('ana'), roomId, days: 3, wins: 0, streak: 3, bestStreak: 3, lastDay: yesterday, kills: 0, renown: 0, awards: {} });
    expect((await server.app.inject({ method: 'POST', url: '/api/me/rest', headers: { cookie: ana }, payload: { on: true } })).statusCode).toBe(204);
    for (let i = 0; i < 22; i++) advance(server, now, 30_000);
    expect(server.store.lifetime(devId('ana'), roomId)).toMatchObject({ streak: 3, bestStreak: 3, lastDay: day, days: 3 });
    await server.shutdown();
  });

  it('names a first war stretched past a day for the day it ends', async () => {
    const { server } = await boot({ daily: true, now: { t: Date.UTC(2026, 9, 22, 23, 30) } });
    const ana = await signIn(server, 'ana');
    await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Late', visibility: 'public', resetHour: 0, bots: 0 } });
    const war = server.rooms.wars()[0]!;
    expect(war.endsAt).toBe(Date.UTC(2026, 9, 24));
    // The next war is 2026-10-24, so this one must be 10-23 for the streak to continue.
    expect(war.meta.day).toBe('2026-10-23');
    await server.shutdown();
  });

  it('keeps the streak when a second war falls on the same day', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Twice', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    const roomId = server.store.roomBySlug(slug)!.id;
    const day = server.rooms.wars()[0]!.meta.day;
    server.store.saveLifetime({ userId: devId('ana'), roomId, days: 5, wins: 0, streak: 5, bestStreak: 5, lastDay: day, kills: 0, renown: 0, awards: {} });
    advance(server, now, 30_000);
    server.rooms.onPush({ userId: devId('ana'), pushId: 'x@1', repo: 'ana/a', language: null, lines: lines(40), files: 3, branches: 12, churn: 0, filler: 0, commits: 1, message: 'm', at: now.t }, now.t);
    for (let i = 0; i < 21; i++) advance(server, now, 30_000);
    expect(server.store.lifetime(devId('ana'), roomId)).toMatchObject({ streak: 5, lastDay: day });
    await server.shutdown();
  });
});

describe('input validation', () => {
  it('answers 404, not 500, for malformed room slugs and war ids', async () => {
    const { server } = await boot();
    const owner = await signIn(server, 'owner');
    const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Open', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    for (const url of ['/api/rooms/A!/legends', '/api/rooms/x/season', '/api/rooms/A_B/wars', `/api/rooms/${slug}/wars/abc/digest`, `/api/rooms/${slug}/wars/-1/replay`, '/api/rooms/x/chronicle']) {
      expect((await server.app.inject({ url })).statusCode, url).toBe(404);
    }
    expect((await server.app.inject({ method: 'POST', url: '/api/rooms/x/join', headers: { cookie: owner }, payload: {} })).statusCode).toBe(404);
    await server.shutdown();
  });
});

describe('configuration', () => {
  it('refuses a production server without its public URL', () => {
    const secret = 'x'.repeat(32);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: secret })).toThrow(/PUBLIC_URL/);
    expect(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: secret, PUBLIC_URL: 'https://pushfront.example/' }).publicUrl).toBe('https://pushfront.example');
    expect(() => loadConfig({ PUBLIC_URL: 'not a url' })).toThrow();
  });

  it('reads an empty flag as unset', () => {
    const config = loadConfig({ DEV_AUTH: '', COMMONS: '' });
    expect(config.devAuth).toBe(false);
    expect(config.commons).toBe(true);
    expect(config.publicUrl).toBe('http://localhost:5173');
  });
});

describe('digest webhook', () => {
  const room = { name: 'R', slug: 'r-abcd' } as Parameters<typeof postDigest>[1];
  const war = { id: 1, day: '2026-10-23' } as Parameters<typeof postDigest>[2];
  const digest = { headline: 'h', players: [], awards: [] } as unknown as Parameters<typeof postDigest>[3];
  const url = 'https://discord.com/api/webhooks/1/abc';

  it('retries a transient failure and refuses redirects', async () => {
    const answers = [new Response('', { status: 502 }), new Response(null, { status: 204 })];
    const fetchImpl = vi.fn(async () => answers.shift()!);
    await postDigest(url, room, war, digest, 'https://pf.test', fetchImpl as unknown as typeof fetch, 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('error');
  });

  it('does not retry a rejected webhook', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    await expect(postDigest(url, room, war, digest, 'https://pf.test', fetchImpl as unknown as typeof fetch, 1)).rejects.toThrow(/404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('helpers', () => {
  it('computes the next reset boundary in UTC', () => {
    expect(nextReset(Date.UTC(2026, 0, 1, 10), 9)).toBe(Date.UTC(2026, 0, 2, 9));
    expect(nextReset(Date.UTC(2026, 0, 1, 8), 9)).toBe(Date.UTC(2026, 0, 1, 9));
    expect(nextReset(Date.UTC(2026, 0, 1, 9), 9)).toBe(Date.UTC(2026, 0, 2, 9));
  });

  it('accepts only Slack and Discord webhooks', () => {
    expect(validWebhookUrl('https://hooks.slack.com/services/T/B/x')).toBe(true);
    expect(validWebhookUrl('https://discord.com/api/webhooks/1/abc')).toBe(true);
    expect(validWebhookUrl('http://hooks.slack.com/services/T/B/x')).toBe(false);
    expect(validWebhookUrl('https://hooks.slack.com.evil.io/services/x')).toBe(false);
    expect(validWebhookUrl('https://169.254.169.254/latest')).toBe(false);
  });
});

describe('version handshake and the service worker kill switch', () => {
  it('reports the simulation version, uncached, and offers the worker by default', async () => {
    const { server } = await boot();
    const res = await server.app.inject({ method: 'GET', url: '/api/version' });
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { sim: string; sw: boolean };
    expect(body.sim).toMatch(/^([0-9a-f]{12}|dev)$/);
    expect(body.sw).toBe(true);
    await server.shutdown();
  });

  it('switched off, tells pages to drop the worker and serves one that removes itself', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', COMMONS: '0', PUBLIC_URL: 'http://pf.test', SERVICE_WORKER: '0' });
    const server = await createServer(config, { log: silentLogger, clock: () => Date.UTC(2026, 9, 23, 12), background: false });
    await server.app.ready();
    expect((await server.app.inject({ method: 'GET', url: '/api/version' })).json()).toMatchObject({ sw: false });
    const sw = await server.app.inject({ method: 'GET', url: '/sw.js' });
    expect(sw.statusCode).toBe(200);
    expect(sw.headers['content-type']).toContain('javascript');
    expect(sw.body).toContain('registration.unregister()');
    expect(sw.body).toContain('caches.delete');
    await server.shutdown();
  });
});
