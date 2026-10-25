import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './db.ts';
import type { DifficultyContext } from './difficulty.ts';
import type { GithubClient } from './github.ts';
import type { GithubPool } from './githubPool.ts';
import { errorMessage, type Logger } from './log.ts';
import type { Parser } from './parsePool.ts';
import { ingestPush, type PushReport } from './poller.ts';
import type { UpstreamWatcher } from './upstream.ts';

export interface HookDeps {
  store: Store;
  github: GithubClient | null;
  log: Logger;
  clock: () => number;
  onPush: (r: PushReport) => void;
  context?: DifficultyContext | null;
  parser?: Parser | null;
  /** Forks' deferred bonus: a merged pull request makes the member's pending rows there due now. */
  upstream?: UpstreamWatcher | null;
  /** Players' own tokens: a delivery's compare runs on the member's own bucket when it can. */
  pool?: GithubPool | null;
}

const BODY_LIMIT = 5 * 1024 * 1024;
/** Each delivery spends the server's GitHub budget on a compare, so one hook may not drain it. */
export const HOOK_LIMIT = { windowMs: 60_000, max: 20 };

const Params = z.object({ userId: z.coerce.number().int() });

const PushPayload = z
  .object({
    ref: z.string(),
    before: z.string(),
    after: z.string(),
    deleted: z.boolean().optional().default(false),
    repository: z.object({ full_name: z.string(), private: z.boolean().optional().default(false) }).loose(),
    sender: z.object({ id: z.number().int() }).loose().nullable().optional(),
    pusher: z.object({ name: z.string().nullable().optional() }).loose().nullable().optional(),
  })
  .loose();

/**
 * A pull request event. Signed with the member's own secret, so it is never trusted: a merge it
 * reports only makes the member's pending fork rows for that repository due, and the check asks GitHub.
 */
const PullPayload = z
  .object({
    action: z.string(),
    repository: z.object({ full_name: z.string(), private: z.boolean().optional().default(false) }).loose(),
    pull_request: z.object({ merged: z.boolean().nullable().optional() }).loose(),
  })
  .loose();

export function signatureOf(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function validSignature(secret: string, body: Buffer, given: string | undefined): boolean {
  if (!given) return false;
  const expected = Buffer.from(signatureOf(secret, body));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function payloadOf(raw: Buffer, contentType: string | undefined): unknown {
  const text = raw.toString('utf8');
  if (contentType?.startsWith('application/x-www-form-urlencoded')) return JSON.parse(new URLSearchParams(text).get('payload') ?? 'null');
  return JSON.parse(text);
}

/** POST /hooks/github/:userId receives a member's repository push webhooks. */
export function registerHooks(app: FastifyInstance, deps: HookDeps): void {
  const hits = new Map<number, { at: number; n: number }>();
  const allow = (userId: number, now: number): boolean => {
    const h = hits.get(userId);
    if (!h || now - h.at >= HOOK_LIMIT.windowMs) {
      if (hits.size > 10_000) hits.clear();
      hits.set(userId, { at: now, n: 1 });
      return true;
    }
    return ++h.n <= HOOK_LIMIT.max;
  };
  app.register(async (scope) => {
    const keepRaw = (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body);
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: BODY_LIMIT }, keepRaw);
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer', bodyLimit: BODY_LIMIT }, keepRaw);

    scope.post('/hooks/github/:userId', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
      const params = Params.safeParse(req.params);
      const user = params.success ? deps.store.user(params.data.userId) : null;
      if (!user || user.bot || !user.hookSecret) return reply.code(404).send({ error: 'unknown hook' });
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!validSignature(user.hookSecret, raw, req.headers['x-hub-signature-256'] as string | undefined)) {
        return reply.code(401).send({ error: 'bad signature' });
      }
      const event = req.headers['x-github-event'];
      if (event === 'ping') return reply.code(204).send();
      if (event === 'pull_request') {
        let pr: z.infer<typeof PullPayload>;
        try {
          pr = PullPayload.parse(payloadOf(raw, req.headers['content-type']));
        } catch {
          return reply.code(400).send({ error: 'malformed pull request payload' });
        }
        if (pr.action !== 'closed' || pr.pull_request.merged !== true || pr.repository.private) return reply.code(202).send({ ok: true, ignored: 'pull_request' });
        if (!deps.upstream) return reply.code(202).send({ ok: true, ignored: 'upstream' });
        if (!allow(user.id, deps.clock())) return reply.code(429).send({ error: 'too many deliveries' });
        // The check runs in the background; the delivery is answered at once.
        deps.upstream.wake(user.id, pr.repository.full_name).catch((err: unknown) => deps.log.warn('upstream wake failed', { user: user.login, error: errorMessage(err) }));
        return reply.code(202).send({ ok: true, woke: true });
      }
      if (event !== 'push') return reply.code(202).send({ ok: true, ignored: 'event' });

      let parsed: z.infer<typeof PushPayload>;
      try {
        parsed = PushPayload.parse(payloadOf(raw, req.headers['content-type']));
      } catch {
        return reply.code(400).send({ error: 'malformed push payload' });
      }
      if (parsed.repository.private) return reply.code(202).send({ ok: true, ignored: 'private' });
      if (parsed.deleted || !parsed.ref.startsWith('refs/heads/')) return reply.code(202).send({ ok: true, ignored: 'ref' });
      const bySender = parsed.sender?.id === user.id;
      const byPusher = parsed.pusher?.name?.toLowerCase() === user.login.toLowerCase();
      if (!bySender && !byPusher) return reply.code(202).send({ ok: true, ignored: 'pusher' });
      if (!deps.github) return reply.code(503).send({ error: 'GitHub ingestion is not configured' });
      if (!allow(user.id, deps.clock())) return reply.code(429).send({ error: 'too many deliveries' });

      try {
        const report = await ingestPush({ ...deps, github: deps.pool?.forUser(user.id) ?? deps.github }, user, {
          repo: parsed.repository.full_name,
          ref: parsed.ref,
          before: parsed.before,
          head: parsed.after,
          at: deps.clock(),
        }, true);
        // The member is at work: discovery polls their repositories faster for the next hour.
        if (report) deps.store.notePushedAt(user.id, deps.clock());
        return reply.code(202).send({ ok: true, counted: report !== null });
      } catch (err) {
        deps.log.warn('hook push ingestion failed', { user: user.login, repo: parsed.repository.full_name, error: errorMessage(err) });
        return reply.code(502).send({ error: 'could not read the push from GitHub' });
      }
    });
  });
}
