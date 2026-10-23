import { describe, expect, it, vi } from 'vitest';
import type { ArmoryResponse, LegendsResponse, OrdersResponse, ProfileResponse, SeasonResponse, ServerMessage } from '../protocol.ts';
import { drawOrders, ORDER_GLORY } from '../rules/meta.ts';
import { Cat, Kind } from '../sim/api.ts';
import { createServer, type Server } from './app.ts';
import { devId } from './auth.ts';
import { loadConfig } from './config.ts';
import { silentLogger } from './log.ts';

const DAY = 10 * 60_000;

async function boot() {
  const now = { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', DEV_AUTH: '1', COMMONS: '0', PUBLIC_URL: 'http://pf.test', DAY_MINUTES: String(DAY / 60_000) });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, random: () => 0.99 });
  await server.app.ready();
  return { server, now };
}

async function signIn(server: Server, login: string): Promise<string> {
  const res = await server.app.inject({ method: 'GET', url: `/auth/dev?login=${login}` });
  return [res.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!.split(';')[0]!;
}

function advance(server: Server, now: { t: number }, ms: number): void {
  now.t += ms;
  for (const w of server.rooms.wars()) w.catchUp(now.t);
  server.rooms.reconcile(now.t);
}

const code = (n: number) => {
  const l = new Array<number>(9).fill(0);
  l[Cat.Code] = n;
  l[Cat.Test] = Math.floor(n / 4);
  return l;
};

async function room(server: Server, owner: string, members: string[], visibility: 'public' | 'private' = 'public') {
  const { slug } = (await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: owner }, payload: { name: 'Hall Test', visibility, resetHour: 0, bots: 0 } })).json<{ slug: string }>();
  const detail = (await server.app.inject({ url: `/api/rooms/${slug}`, headers: { cookie: owner } })).json<{ invite: string | null }>();
  for (const m of members) await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie: m }, payload: { invite: detail.invite } });
  return slug;
}

describe('the long loops', () => {
  it('announces and pays a fulfilled Order once', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const slug = await room(server, ana, []);
    const sent: ServerMessage[] = [];
    server.hub.broadcast = (_roomId: number, msg: ServerMessage) => void sent.push(msg);
    advance(server, now, 5_000);
    const war = server.rooms.wars()[0]!;
    const roomId = server.store.roomBySlug(slug)!.id;
    server.meta.watch(roomId, war, now.t);
    expect(sent.filter((m) => m.type === 'order')).toEqual([]);

    // Fulfil every order by hand: the counters are the sim's own.
    const player = war.world.players[0]!;
    player.kills = 500;
    player.feats = { holdBest: 1e6, routsCaused: 99, cryKills: 99, returns: 9, heartCaptures: 9, leaderTakes: 9, homeKills: 99, ledTicks: 1e6 };
    player.monolithDamage = 1e6;
    player.structureDamage = 1e6;
    player.sacks = 9;
    player.captures = 9;
    player.veterancy = 3;
    player.slain[Kind.Dragon] = 1;
    server.meta.watch(roomId, war, now.t);
    server.meta.watch(roomId, war, now.t);
    const drawn = drawOrders(war.meta.seed, devId('ana')).map((o) => o.id);
    const orders = sent.flatMap((m) => (m.type === 'order' ? [m] : []));
    expect(orders.map((m) => m.order.id)).toEqual(drawn);
    expect(orders.every((m) => m.p === 0 && m.login === 'ana' && m.glory === ORDER_GLORY)).toBe(true);

    const status = (await server.app.inject({ url: `/api/rooms/${slug}/orders` })).json<OrdersResponse>();
    expect(status.orders).toEqual([{ p: 0, login: 'ana', ids: drawn, done: expect.arrayContaining(drawn) }]);
    const armory = (await server.app.inject({ url: '/api/me/armory', headers: { cookie: ana } })).json<ArmoryResponse>();
    expect(armory.rank.glory).toBe(3 * ORDER_GLORY);
    await server.shutdown();
  });

  it('ends a day with Glory, Deeds, rivalries, legends, a season table and monuments', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const bo = await signIn(server, 'bo');
    const slug = await room(server, ana, [bo]);
    advance(server, now, 20_000);
    server.rooms.onPush({ userId: devId('ana'), pushId: 'a@1', repo: 'ana/parser', language: 'TypeScript', lines: code(900), files: 12, branches: 120, churn: 0, filler: 0, commits: 3, message: 'feat: offline mode', at: now.t }, now.t);
    server.rooms.onPush({ userId: devId('bo'), pushId: 'b@1', repo: 'bo/site', language: 'CSS', lines: code(60), files: 2, branches: 4, churn: 0, filler: 0, commits: 1, message: 'fix: typo', at: now.t }, now.t);
    const warId = server.rooms.wars()[0]!.id;
    for (let i = 0; i < 22; i++) advance(server, now, 30_000);
    const next = server.rooms.wars()[0]!;
    expect(next.id).not.toBe(warId);

    const profile = (await server.app.inject({ url: '/api/users/ana' })).json<ProfileResponse>();
    expect(profile.rank!.glory).toBeGreaterThan(0);
    expect(profile.deeds!.length).toBeGreaterThan(0);
    expect(profile.rivalries).toHaveLength(1);
    const r = profile.rivalries![0]!;
    expect(r.rival.login).toBe('bo');
    expect(r.wins + r.losses).toBe(1);
    const boProfile = (await server.app.inject({ url: '/api/users/bo' })).json<ProfileResponse>();
    expect(boProfile.rivalries![0]).toMatchObject({ wins: r.losses, losses: r.wins });

    const season = (await server.app.inject({ url: `/api/rooms/${slug}/season` })).json<SeasonResponse>();
    expect(season.season).toBe('2026-W43');
    expect(season.standings.map((s) => s.user.login).sort()).toEqual(['ana', 'bo']);
    expect(season.standings[0]!.points).toBeGreaterThanOrEqual(season.standings[1]!.points);

    const legends = (await server.app.inject({ url: `/api/rooms/${slug}/legends` })).json<LegendsResponse>();
    for (const l of legends.legends) expect(l.warId).toBe(warId);
    const monuments = server.meta.monuments(server.store.roomBySlug(slug)!, next);
    expect(monuments.filter((m) => m.kind === 'legend')).toHaveLength(legends.legends.length);

    // The honours are paid once, even if the day-end hook runs again.
    const glory = profile.rank!.glory;
    advance(server, now, 30_000);
    expect((await server.app.inject({ url: '/api/users/ana' })).json<ProfileResponse>().rank!.glory).toBe(glory);
    await server.shutdown();
  });

  it('does not rebuild the season table for every hello, yet refreshes it when a war ends', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const slug = await room(server, ana, []);
    const day = async () => {
      advance(server, now, 20_000);
      server.rooms.onPush({ userId: devId('ana'), pushId: `a@${now.t}`, repo: 'ana/parser', language: 'TypeScript', lines: code(200), files: 4, branches: 20, churn: 0, filler: 0, commits: 1, message: 'feat: x', at: now.t }, now.t);
      for (let i = 0; i < 22; i++) advance(server, now, 30_000);
    };
    await day();
    const roomRow = server.store.roomBySlug(slug)!;
    const wars = vi.spyOn(server.store, 'wars');
    const first = server.meta.season(roomRow, server.rooms.wars()[0]!.meta.day);
    expect(first.standings[0]).toMatchObject({ days: 1 });
    const calls = wars.mock.calls.length;
    for (let i = 0; i < 10; i++) server.meta.monuments(roomRow, server.rooms.wars()[0]!);
    // monuments reads the last few wars for legends, but never the whole season again.
    expect(wars.mock.calls.filter((c) => c[1] > 3).length).toBe(calls);
    await day();
    expect(server.meta.season(roomRow, server.rooms.wars()[0]!.meta.day).standings[0]).toMatchObject({ days: 2 });
    await server.shutdown();
  });

  it('lets a player wear only unlocked heraldry, and enlists with it', async () => {
    const { server, now } = await boot();
    const ana = await signIn(server, 'ana');
    const armory = (await server.app.inject({ url: '/api/me/armory', headers: { cookie: ana } })).json<ArmoryResponse>();
    expect(armory.rank.title).toBe('Squire');
    const locked = await server.app.inject({ method: 'POST', url: '/api/me/armory', headers: { cookie: ana }, payload: { keep: 'citadel', pattern: 'chevron' } });
    expect(locked.statusCode).toBe(409);
    expect(locked.json<{ armory: ArmoryResponse }>().armory.heraldry.pattern).toBe('chevron');
    expect((await server.app.inject({ method: 'POST', url: '/api/me/armory', headers: { cookie: ana }, payload: { emblem: 'tower' } })).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'POST', url: '/api/me/armory', payload: { emblem: 'tower' } })).statusCode).toBe(401);
    await room(server, ana, []);
    advance(server, now, 1_000);
    expect(server.rooms.wars()[0]!.roster()[0]!.heraldry).toMatchObject({ pattern: 'chevron', emblem: 'tower', keep: 'stone' });
    await server.shutdown();
  });

  it('keeps private rooms out of public profiles and legends', async () => {
    const { server } = await boot();
    const ana = await signIn(server, 'ana');
    const bo = await signIn(server, 'bo');
    const slug = await room(server, ana, [bo], 'private');
    expect((await server.app.inject({ url: `/api/rooms/${slug}/legends` })).statusCode).toBe(403);
    expect((await server.app.inject({ url: `/api/rooms/${slug}/season` })).statusCode).toBe(403);
    await server.shutdown();
  });
});
