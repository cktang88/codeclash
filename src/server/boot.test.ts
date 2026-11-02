import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configProblems, serveMisconfigured, withPersistedSessionSecret } from './boot.ts';
import { loadConfig } from './config.ts';

describe('booting on a fresh deploy', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'cc-boot-'));

  it('makes a session secret beside the database once, and reuses it on the next boot', () => {
    const d = dir();
    const env = { NODE_ENV: 'production', DATABASE_PATH: join(d, 'db', 'cc.db'), PUBLIC_URL: 'https://cc.example' };
    const first = withPersistedSessionSecret(env);
    expect(first.madeAt).toBe(join(d, 'db', 'session-secret'));
    expect(first.env.SESSION_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(statSync(first.madeAt!).mode & 0o777).toBe(0o600);
    expect(withPersistedSessionSecret(env).env.SESSION_SECRET).toBe(first.env.SESSION_SECRET);
    expect(readFileSync(first.madeAt!, 'utf8').trim()).toBe(first.env.SESSION_SECRET);
    // The production config now loads instead of refusing to boot.
    expect(loadConfig(first.env).sessionSecret).toBe(first.env.SESSION_SECRET);
  });

  it('leaves a set secret, development and in-memory databases alone', () => {
    const set = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), DATABASE_PATH: join(dir(), 'cc.db') };
    expect(withPersistedSessionSecret(set)).toEqual({ env: set, madeAt: null });
    expect(withPersistedSessionSecret({ NODE_ENV: 'development' }).madeAt).toBeNull();
    expect(withPersistedSessionSecret({ NODE_ENV: 'production', DATABASE_PATH: ':memory:' }).madeAt).toBeNull();
  });

  describe('a config that still cannot load', () => {
    let close: (() => void) | null = null;
    afterEach(() => close?.());

    it('is explained on a 503 page instead of a crash loop', async () => {
      let problems: string[] = [];
      try {
        loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), PUBLIC_URL: 'https://cc.example', GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' });
      } catch (err) {
        problems = configProblems(err);
      }
      expect(problems.join()).toMatch(/TOKEN_KEY/);
      const server = serveMisconfigured(0, '127.0.0.1', problems);
      close = () => server.close();
      await new Promise((r) => server.once('listening', r));
      const { port } = server.address() as { port: number };
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(503);
      expect(await page.text()).toMatch(/TOKEN_KEY/);
      const api = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(api.status).toBe(503);
      expect((await api.json()).problems.join()).toMatch(/TOKEN_KEY/);
    });
  });
});
