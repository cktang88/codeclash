import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../sim/api.ts';
import { RALLY_COOLDOWN } from '../sim/stats.ts';
import { createServer } from './app.ts';
import { devId } from './auth.ts';
import { loadConfig } from './config.ts';
import { silentLogger } from './log.ts';
import { INPUT_LEAD_TICKS } from './war.ts';

async function boot() {
  const now = { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', DEV_AUTH: '1', COMMONS: '0', PUBLIC_URL: 'http://pf.test' });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, random: () => 0.99 });
  await server.app.ready();
  const res = await server.app.inject({ method: 'GET', url: '/auth/dev?login=ana' });
  const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!.split(';')[0]!;
  await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { name: 'Orders', visibility: 'public', resetHour: 0, bots: 0 } });
  const war = server.rooms.wars()[0]!;
  return { server, now, war, ana: devId('ana') };
}

describe('commands are validated against the server’s state at the tick they land', () => {
  it('accepts an order whose cooldown has run out by its stamped tick even while the world lags wall-clock time', async () => {
    const { server, now, war, ana } = await boot();
    now.t += 60_000;
    war.catchUp(now.t);
    expect(war.command(now.t, ana, { kind: 'rally', site: 0 })).toBeNull();
    now.t += 2_000;
    war.catchUp(now.t);
    const rallyAt = war.world.players[0]!.rallyAt;
    expect(rallyAt).toBeGreaterThan(0);
    // Wall-clock time moves past the cooldown, but the (busy) server has not stepped the world yet.
    now.t = war.meta.startsAt + (rallyAt + RALLY_COOLDOWN - INPUT_LEAD_TICKS + 1) * TICK_MS;
    expect(war.world.tick).toBeLessThan(rallyAt + 20);
    expect(war.command(now.t, ana, { kind: 'rally', site: 1 })).toBeNull();
    now.t += 2_000;
    war.catchUp(now.t);
    expect(war.world.players[0]!.rallySite).toBe(1);
    expect(war.world.players[0]!.rallyAt).toBeGreaterThan(rallyAt);
    await server.shutdown();
  });

  it('refuses an order that would land after the war’s last tick instead of reporting success', async () => {
    const { server, now, war, ana } = await boot();
    now.t += 2_000;
    war.catchUp(now.t);
    now.t = war.meta.endsAt - 100;
    expect(war.command(now.t, ana, { kind: 'cry' })).toBe('ended');
    await server.shutdown();
  });
});

describe('static fallback', () => {
  it('serves the page for app routes but 404s missing assets', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'pf-client-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>pf</title>');
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', DEV_AUTH: '1', COMMONS: '0', PUBLIC_URL: 'http://pf.test', CLIENT_DIR: dir });
    const server = await createServer(config, { log: silentLogger, background: false });
    await server.app.ready();
    const page = await server.app.inject({ url: '/rooms/some-room' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>pf</title>');
    for (const url of ['/audio/x.ogg', '/art/y.png', '/assets/missing.js?v=1']) {
      expect((await server.app.inject({ url })).statusCode, url).toBe(404);
    }
    await server.shutdown();
  });
});
