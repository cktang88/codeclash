import { describe, expect, it } from 'vitest';
import { checksum } from '../sim/snapshot.ts';
import { createServer } from './app.ts';
import { devId } from './auth.ts';
import { loadConfig } from './config.ts';
import { silentLogger } from './log.ts';

async function boot() {
  const now = { t: Date.UTC(2026, 9, 23, 12) };
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', DEV_AUTH: '1', COMMONS: '0', PUBLIC_URL: 'http://pf.test' });
  const server = await createServer(config, { log: silentLogger, clock: () => now.t, background: false, random: () => 0.99 });
  await server.app.ready();
  const res = await server.app.inject({ method: 'GET', url: '/auth/dev?login=ana' });
  const cookie = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('pf_session='))!.split(';')[0]!;
  const created = await server.app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie }, payload: { name: 'Orders', visibility: 'public', resetHour: 0, bots: 0 } });
  const war = server.rooms.wars()[0]!;
  return { server, now, war, cookie, slug: created.json<{ slug: string }>().slug, ana: devId('ana') };
}

describe('there is no manual control', () => {
  it('answers an old client’s command with 410 Gone and leaves the war untouched', async () => {
    const { server, now, war, cookie, slug } = await boot();
    now.t += 2_000;
    war.catchUp(now.t);
    const before = checksum(war.world);
    const payloads = [{ kind: 'rally', site: 0 }, { kind: 'cry' }, { kind: 'doctrine', doctrine: 2 }, {}];
    for (const payload of payloads) {
      const res = await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/command`, headers: { cookie }, payload });
      expect(res.statusCode).toBe(410);
      expect(res.json()).toMatchObject({ error: 'gone' });
    }
    // Signed out, or naming a room that does not exist: the same clean answer.
    expect((await server.app.inject({ method: 'POST', url: `/api/rooms/${slug}/command`, payload: { kind: 'cry' } })).statusCode).toBe(410);
    expect((await server.app.inject({ method: 'POST', url: '/api/rooms/no-such-room/command', headers: { cookie }, payload: { kind: 'cry' } })).statusCode).toBe(410);
    // Nothing reached the war: no input was recorded, and the world runs on exactly as it would have.
    expect(server.store.inputs(war.id, 0).every((r) => r.data[1] === 'join' || r.data[1] === 'push')).toBe(true);
    expect(checksum(war.world)).toBe(before);
    now.t += 2_000;
    war.catchUp(now.t);
    expect(war.world.players[0]).not.toHaveProperty('rallySite');
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
