import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './db.ts';
import type { GithubClient } from './github.ts';
import { errorMessage, type Logger } from './log.ts';
import { ingestPush, type PushReport } from './poller.ts';

export interface HookDeps {
  store: Store;
  github: GithubClient | null;
  log: Logger;
  clock: () => number;
  onPush: (r: PushReport) => void;
}

const BODY_LIMIT = 5 * 1024 * 1024;

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

      try {
        const report = await ingestPush({ ...deps, github: deps.github }, user, {
          repo: parsed.repository.full_name,
          ref: parsed.ref,
          before: parsed.before,
          head: parsed.after,
          at: deps.clock(),
        });
        return reply.code(202).send({ ok: true, counted: report !== null });
      } catch (err) {
        deps.log.warn('hook push ingestion failed', { user: user.login, repo: parsed.repository.full_name, error: errorMessage(err) });
        return reply.code(502).send({ error: 'could not read the push from GitHub' });
      }
    });
  });
}
