import { describe, expect, it } from 'vitest';
import { Battle } from '../game/battle.ts';
import { DAY_MS, weekOf } from '../game/league.ts';
import type { PushReport } from '../ingest/poller.ts';
import { silentLogger } from '../ingest/log.ts';
import type { BattleView, CityView, LeagueCard, LeagueDetail, MeResponse } from '../protocol.ts';
import { createServer } from './app.ts';
import { loadConfig } from './config.ts';

async function boot(start: number) {
  const now = { t: start };
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', COMMONS: '0', DEV_AUTH: '1', PUBLIC_URL: 'http://cc.test' });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, github: null });
  await server.app.ready();
  const signIn = async (login: string) => {
    const res = await server.app.inject({ url: `/auth/dev?login=${login}` });
    return [res.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!.split(';')[0]!;
  };
  return { server, now, signIn };
}

function push(userId: number, code: number): PushReport {
  return {
    userId, pushId: `p${Math.random()}`, repo: 'ana/app', language: 'TypeScript', lines: [code, Math.round(code * 0.3), 20, 10, 5, Math.round(code * 0.2), 0, 0, 0],
    files: Math.ceil(code / 40), branches: Math.round(code * 0.2), functions: Math.round(code * 0.08), links: 2, churn: 0, filler: 0, commits: 1, message: 'feat: things', at: 0,
  };
}

describe('a league week', () => {
  it('signs in, founds a league with bots, logs work, and fights each day', async () => {
    const monday = weekOf(Date.UTC(2026, 10, 3), 0).weekStart;
    const { server, now, signIn } = await boot(monday + 2 * 3_600_000);
    const cookie = await signIn('ana');
    const me = (await server.app.inject({ url: '/api/me', headers: { cookie } })).json<MeResponse>();
    expect(me.user!.login).toBe('ana');
    expect(me.user!.faction).toBe('templar');

    const created = await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie }, payload: { name: 'Night Watch', visibility: 'private', resetHour: 0, bots: 3 } });
    expect(created.statusCode).toBe(201);
    const card = created.json<LeagueCard>();
    expect(card.bots).toBe(3);

    // Private: strangers see nothing without the invite.
    expect((await server.app.inject({ url: `/api/leagues/${card.slug}` })).statusCode).toBe(403);
    const detail0 = (await server.app.inject({ url: `/api/leagues/${card.slug}`, headers: { cookie } })).json<LeagueDetail>();
    expect(detail0.members).toHaveLength(4);
    expect(detail0.invite).toBeTruthy();

    // Work arrives through ingestion's onPush.
    const id = me.user!.id;
    for (let h = 3; h < 12; h += 3) {
      now.t = monday + h * 3_600_000;
      server.leagues.onPush(push(id, 400), now.t);
    }
    now.t = monday + 20 * 3_600_000;
    const city = (await server.app.inject({ url: `/api/leagues/${card.slug}/city/${id}`, headers: { cookie } })).json<CityView>();
    expect(city.city.buildings.find((b) => b.key === 'barracks')!.level).toBeGreaterThan(0);
    expect(city.work).toHaveLength(3);
    expect(city.city.today.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    // The first daily battle at Tuesday 00:00.
    now.t = monday + DAY_MS + 1000;
    expect(server.fightDue()).toBeGreaterThanOrEqual(1);
    expect(server.fightDue()).toBe(0);
    const detail1 = (await server.app.inject({ url: `/api/leagues/${card.slug}`, headers: { cookie } })).json<LeagueDetail>();
    const mine = detail1.battles.find((b) => b.a.id === id || b.b?.id === id)!;
    expect(mine).toBeTruthy();
    expect(mine.day).toBe(0);
    const view = (await server.app.inject({ url: `/api/battles/${mine.id}`, headers: { cookie } })).json<BattleView>();
    // The browser replays the same battle from the setup and gets the same result.
    const replay = new Battle(view.setup).run();
    expect(replay).toEqual(view.result);

    // The rest of the week, then the Grand Battle and the reset.
    now.t = monday + 7 * DAY_MS + 1000;
    for (let i = 0; i < 20 && server.fightDue() > 0; i++);
    const detail2 = (await server.app.inject({ url: `/api/leagues/${card.slug}`, headers: { cookie } })).json<LeagueDetail>();
    expect(detail2.clock.weekStart).toBe(monday + 7 * DAY_MS);
    expect(detail2.weeks).toHaveLength(1);
    expect(detail2.weeks[0]!.standings.length).toBeGreaterThan(0);
    expect(detail2.battles.some((b) => b.kind === 'grand')).toBe(true);
    // A new week: every city starts from nothing.
    const fresh = (await server.app.inject({ url: `/api/leagues/${card.slug}/city/${id}`, headers: { cookie } })).json<CityView>();
    expect(fresh.city.buildings.every((b) => b.level === 0)).toBe(true);
    await server.shutdown();
  }, 120_000);

  it('others join public leagues; private ones need the invite', async () => {
    const { server, signIn } = await boot(Date.UTC(2026, 10, 3, 9));
    const ana = await signIn('ana');
    const bo = await signIn('bo');
    const pub = (await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie: ana }, payload: { name: 'Open Field', visibility: 'public', resetHour: 6, bots: 0 } })).json<LeagueCard>();
    const priv = (await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie: ana }, payload: { name: 'Closed Door', visibility: 'private', resetHour: 6, bots: 0 } })).json<LeagueCard>();
    expect((await server.app.inject({ method: 'POST', url: `/api/leagues/${pub.slug}/join`, headers: { cookie: bo } })).statusCode).toBe(204);
    expect((await server.app.inject({ method: 'POST', url: `/api/leagues/${priv.slug}/join`, headers: { cookie: bo } })).statusCode).toBe(403);
    const invite = (await server.app.inject({ url: `/api/leagues/${priv.slug}`, headers: { cookie: ana } })).json<LeagueDetail>().invite!;
    expect((await server.app.inject({ method: 'POST', url: `/api/leagues/${priv.slug}/join`, headers: { cookie: bo }, payload: { invite } })).statusCode).toBe(204);
    const list = (await server.app.inject({ url: '/api/leagues' })).json<LeagueCard[]>();
    expect(list.map((l) => l.slug)).toEqual([pub.slug]);
    expect((await server.app.inject({ method: 'POST', url: '/api/me/look', headers: { cookie: bo }, payload: { faction: 'templar', hue: 120 } })).statusCode).toBe(204);
    expect((await server.app.inject({ url: '/api/me', headers: { cookie: bo } })).json<MeResponse>().user!.hue).toBe(120);
    await server.shutdown();
  });
});

describe('server bug sweep regressions', () => {
  it('a crash part way through a day does not fight that day twice', async () => {
    const monday = weekOf(Date.UTC(2026, 10, 3), 0).weekStart;
    const { server, now, signIn } = await boot(monday + 3_600_000);
    const cookie = await signIn('ana');
    const card = (await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie }, payload: { name: 'Crash Test', visibility: 'public', resetHour: 0, bots: 5 } })).json<LeagueCard>();
    const league = server.game.leagueBySlug(card.slug)!;
    now.t = monday + DAY_MS + 1000;
    // The second battle of the day fails to save, as if the process died between the two.
    const insert = server.game.insertBattle.bind(server.game);
    let calls = 0;
    server.game.insertBattle = (b) => {
      if (++calls === 2) throw new Error('disk full');
      return insert(b);
    };
    server.fightDue();
    server.game.insertBattle = insert;
    expect(server.game.battlesOfWeek(league.id, monday)).toHaveLength(0);
    expect(server.fightDue()).toBeGreaterThanOrEqual(2);
    const day0 = server.game.battlesOfWeek(league.id, monday).filter((b) => b.day === 0);
    const fighters = day0.flatMap((b) => [b.aId, b.bId]).filter((id) => id !== null);
    expect(new Set(fighters).size).toBe(fighters.length);
    expect(server.fightDue()).toBe(0);
    await server.shutdown();
  }, 60_000);

  it("a private league's battles are not offered to shared caches", async () => {
    const monday = weekOf(Date.UTC(2026, 10, 3), 0).weekStart;
    const { server, now, signIn } = await boot(monday + 3_600_000);
    const cookie = await signIn('ana');
    const priv = (await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie }, payload: { name: 'Hidden', visibility: 'private', resetHour: 0, bots: 2 } })).json<LeagueCard>();
    const pub = (await server.app.inject({ method: 'POST', url: '/api/leagues', headers: { cookie }, payload: { name: 'Shown', visibility: 'public', resetHour: 0, bots: 2 } })).json<LeagueCard>();
    now.t = monday + DAY_MS + 1000;
    server.fightDue();
    const battleOf = (slug: string) => server.game.battlesOfWeek(server.game.leagueBySlug(slug)!.id, monday)[0]!.id;
    const hidden = await server.app.inject({ url: `/api/battles/${battleOf(priv.slug)}`, headers: { cookie } });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.headers['cache-control']).not.toMatch(/public/);
    const shown = await server.app.inject({ url: `/api/battles/${battleOf(pub.slug)}` });
    expect(shown.headers['cache-control']).toMatch(/public/);
    await server.shutdown();
  }, 60_000);

  it('a battle tick that throws at boot is logged, not thrown from a timer', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', COMMONS: '0', PORT: '0', HOST: '127.0.0.1', PUBLIC_URL: 'http://cc.test' });
    const errors: string[] = [];
    const log = { info() {}, warn() {}, error: (msg: string) => void errors.push(msg) };
    const server = await createServer(config, { log, background: true, github: null });
    server.leagues.tick = () => {
      throw new Error('database is locked');
    };
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => void uncaught.push(err);
    process.prependListener('uncaughtException', onUncaught);
    try {
      await server.listen();
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.off('uncaughtException', onUncaught);
      await server.shutdown();
    }
    expect(uncaught).toEqual([]);
    expect(errors).toContain('battle tick failed');
  });

  it('empty settings in a .env file mean their defaults', () => {
    const c = loadConfig({ PORT: '', HOST: '', DATABASE_PATH: '', CLIENT_DIR: ' ', MAX_LEAGUES_PER_USER: '', NODE_ENV: '' });
    expect(c.port).toBe(8787);
    expect(c.host).toBe('0.0.0.0');
    expect(c.databasePath).toBe('data/codeclash.db');
    expect(c.clientDir).toBe('dist/client');
    expect(c.maxLeaguesPerUser).toBe(5);
    expect(c.production).toBe(false);
  });

  it('a sign-in return path that cannot go in a header falls back to the home page', async () => {
    const { server } = await boot(Date.UTC(2026, 10, 3, 9));
    for (const next of ['/x%0d%0aSet-Cookie:%20a=b', '/%E6%97%A5']) {
      const res = await server.app.inject({ url: `/auth/dev?login=ana&next=${next}` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('http://cc.test/');
    }
    await server.shutdown();
  });
});
