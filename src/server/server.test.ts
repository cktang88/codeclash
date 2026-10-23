import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DigestResponse, MeResponse, RoomDetail } from '../protocol.ts';
import { Cat } from '../sim/api.ts';
import { runReplay, type Replay } from '../sim/replay.ts';
import { checksum } from '../sim/snapshot.ts';
import { createServer, type Server } from './app.ts';
import { devId } from './auth.ts';
import { loadConfig } from './config.ts';
import { silentLogger } from './log.ts';
import { nextReset } from './rooms.ts';
import { validWebhookUrl } from './webhook.ts';

const DAY = 10 * 60_000;

async function boot(opts: { db?: string; now?: { t: number } } = {}) {
  const now = opts.now ?? { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_PATH: opts.db ?? ':memory:', DEV_AUTH: '1', DAY_MINUTES: String(DAY / 60_000), COMMONS: '0', PUBLIC_URL: 'http://pf.test',
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
    server.rooms.onPush({ userId: devId('ana'), pushId: 'x@1', repo: 'ana/parser', language: 'TypeScript', lines: lines(200, 60, 20), commits: 2, message: 'Tokenizer', at: now.t }, now.t);
    server.rooms.onPush({ userId: devId('bo'), pushId: 'y@1', repo: 'bo/site', language: 'CSS', lines: lines(90), commits: 1, message: 'Styles', at: now.t }, now.t);
    const cmd = await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/command`, headers: { cookie: ana }, payload: { kind: 'doctrine', doctrine: 1 } });
    expect(cmd.statusCode).toBe(200);
    const again = await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/command`, headers: { cookie: ana }, payload: { kind: 'doctrine', doctrine: 2 } });
    expect(again.json()).toMatchObject({ error: 'cooldown' });

    const war = server.rooms.wars()[0]!;
    const warId = war.id;
    for (let i = 0; i < 20; i++) advance(server, now, 30_000);
    expect(server.rooms.wars()[0]!.id).not.toBe(warId);

    const digest = (await server.app.inject({ url: `/api/rooms/${slug}/wars/${warId}/digest` })).json<DigestResponse>();
    expect(digest.digest.totals.pushes).toBeGreaterThanOrEqual(2);
    expect(digest.digest.players.map((p) => p.login)).toEqual(['ana', 'ada-bot', 'bo']);
    expect(digest.digest.awards.length).toBeGreaterThan(0);

    const replay = (await server.app.inject({ url: `/api/rooms/${slug}/wars/${warId}/replay` })).json<Replay>();
    const final = server.store.latestSnapshot(warId)!;
    expect(checksum(runReplay(replay, digest.digest.ticks))).toBe(final.checksum);

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

  it('recovers a war after a restart without losing inputs', async () => {
    const db = join(mkdtempSync(join(tmpdir(), 'pf-')), 'pf.db');
    const now = { t: Date.UTC(2026, 9, 23, 12) };
    const first = await boot({ db, now });
    const ana = await signIn(first.server, 'ana');
    const { slug } = (await first.server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: ana }, payload: { name: 'Durable', visibility: 'public', resetHour: 0, bots: 0 } })).json<{ slug: string }>();
    advance(first.server, now, 20_000);
    first.server.rooms.onPush({ userId: devId('ana'), pushId: 'z@1', repo: 'ana/x', language: null, lines: lines(150), commits: 1, message: 'm', at: now.t }, now.t);
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
