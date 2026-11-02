// What the server does before its config is known: find or make a session secret that survives
// restarts, and, if the config is still wrong, answer every request with a page that says what is
// missing instead of crash-looping behind the host's proxy (which shows players a blank page).

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { ZodError } from 'zod';

const SECRET_FILE = 'session-secret';

/**
 * In production without a usable SESSION_SECRET, reads one kept beside the database (making it on
 * first boot) and returns the env with it filled in, so sessions survive restarts on a fresh deploy.
 * Anywhere else, or with the secret set, returns the env unchanged.
 */
export function withPersistedSessionSecret(env: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; madeAt: string | null } {
  const set = env.SESSION_SECRET?.trim() ?? '';
  if (env.NODE_ENV !== 'production' || set.length >= 32) return { env, madeAt: null };
  const db = env.DATABASE_PATH?.trim() || 'data/codeclash.db';
  if (db === ':memory:') return { env, madeAt: null };
  const file = join(dirname(db), SECRET_FILE);
  let secret = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  if (secret.length < 32) {
    mkdirSync(dirname(file), { recursive: true });
    secret = randomBytes(32).toString('hex');
    writeFileSync(file, secret + '\n', { mode: 0o600 });
  }
  return { env: { ...env, SESSION_SECRET: secret }, madeAt: file };
}

/** The settings a config error names, without their values. */
export function configProblems(err: unknown): string[] {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`);
  return [err instanceof Error ? err.message : String(err)];
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Answers every request with 503 and the list of problems, until the operator fixes the config. */
export function serveMisconfigured(port: number, host: string, problems: string[]): Server {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Code Clash: not configured</title>
<style>body{background:#0b0907;color:#e8dcc4;font:16px/1.5 Georgia,serif;max-width:40rem;margin:4rem auto;padding:0 1rem}code{color:#f0c060}</style></head>
<body><h1>Code Clash is not configured yet</h1><p>The server could not start because of these settings:</p><ul>${problems.map((p) => `<li><code>${escape(p)}</code></li>`).join('')}</ul>
<p>Set them (on Fly.io: <code>fly secrets set NAME=value</code>) and the server restarts by itself.</p></body></html>`;
  const server = createServer((req, res) => {
    const json = req.url?.startsWith('/api/');
    res.writeHead(503, { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : json ? JSON.stringify({ error: 'not configured', problems }) : body);
  });
  server.listen(port, host);
  return server;
}
