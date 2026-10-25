// GitHub clients by token: the server's (`GITHUB_TOKEN`) and one per player who signed in with OAuth.
//
// Each client tracks its own token's REST and GraphQL buckets (and keeps its own ETag cache, so an
// answer read with one token is never replayed to another). A player's ingestion runs on their own
// client while it is usable and falls back to the server's when the player has no token, GitHub
// refuses it (401: it is marked invalid and never used again), or its bucket runs low.

import type { Store } from './db.ts';
import { GRAPHQL_RESERVE } from './difficulty.ts';
import { GithubError, type GithubClient } from './github.ts';
import type { Logger } from './log.ts';
import type { TokenVault } from './tokens.ts';

/** Below this many REST requests left, a player's own calls go to the server's token instead. */
export const OWN_REST_FLOOR = 300;
/** Below this many GraphQL points left, a player's own queries go to the server's token instead. */
export const OWN_GRAPHQL_FLOOR = GRAPHQL_RESERVE;
/** Players' clients kept in memory at most (each holds an ETag cache), least recently used out. */
const MAX_CLIENTS = 2_000;

const ASYNC_METHODS = [
  'userEvents', 'compare', 'commit', 'repo', 'branches', 'commits', 'graphql', 'repoFacts', 'languages',
  'compareStatus', 'closedPulls', 'pullCommits', 'branchHeads', 'viewerRepos',
] as const satisfies readonly (keyof GithubClient)[];

type AsyncMethod = (typeof ASYNC_METHODS)[number];
type AnyFn = (...args: unknown[]) => Promise<unknown>;

export const unauthorized = (err: unknown): boolean => err instanceof GithubError && err.status === 401;
export const rateLimited = (err: unknown): boolean => err instanceof GithubError && (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.message)));

/** `base` with every call passed through `around`; optional methods stay absent when `base` lacks them. */
function wrap(base: GithubClient, around: (name: AsyncMethod, call: () => Promise<unknown>) => Promise<unknown>, overrides: Partial<GithubClient> = {}): GithubClient {
  const out: Record<string, unknown> = { rateLimit: () => base.rateLimit() };
  if (base.graphqlRateLimit) out.graphqlRateLimit = () => base.graphqlRateLimit!();
  if (base.usage) out.usage = () => base.usage!();
  for (const name of ASYNC_METHODS) {
    const fn = base[name] as AnyFn | undefined;
    if (fn) out[name] = (...args: unknown[]) => around(name, () => fn.apply(base, args));
  }
  return Object.assign(out, overrides) as unknown as GithubClient;
}

export interface PoolDeps {
  store: Store;
  vault: TokenVault;
  /** The server's own client; null when GITHUB_TOKEN is unset. */
  server: GithubClient | null;
  /** Makes a client for a token. */
  create: (token: string) => GithubClient;
  clock: () => number;
  log: Logger;
}

export class GithubPool {
  private clients = new Map<number, { sealed: string; client: GithubClient }>();
  /** Players whose own token was refused or ran dry this boot, for logs and tests. */
  readonly stats = { ownCalls: 0, fallbacks: 0, invalidated: 0 };

  constructor(private readonly deps: PoolDeps) {}

  get server(): GithubClient | null {
    return this.deps.server;
  }

  /**
   * The player's own client, which marks the token invalid on a 401 (and then throws); null when the
   * player has no usable token. Discovery runs on this alone: it never spends the server's budget.
   */
  own(userId: number): GithubClient | null {
    const sealed = this.deps.store.sealedToken(userId);
    if (!sealed) {
      this.clients.delete(userId);
      return null;
    }
    const known = this.clients.get(userId);
    if (known && known.sealed === sealed) {
      this.clients.delete(userId);
      this.clients.set(userId, known);
      return known.client;
    }
    const token = this.deps.vault.open(sealed, userId);
    if (!token) {
      // Sealed under another key (TOKEN_KEY changed, or a random dev key from an earlier boot): unusable,
      // so the player is asked to sign in again, which seals a fresh one under the current key.
      this.deps.log.warn('stored GitHub token does not open; asking the player to sign in again', { user: userId });
      this.invalidate(userId);
      return null;
    }
    const client = wrap(this.deps.create(token), async (_name, call) => {
      try {
        return await call();
      } catch (err) {
        if (unauthorized(err)) this.invalidate(userId);
        throw err;
      }
    });
    if (this.clients.size >= MAX_CLIENTS) this.clients.delete(this.clients.keys().next().value!);
    this.clients.set(userId, { sealed, client });
    return client;
  }

  /** Whether the player's own token can carry a REST call now: stored, accepted, and its bucket above the floor. */
  hasBudget(userId: number, floor = OWN_REST_FLOOR): boolean {
    const own = this.own(userId);
    return own !== null && own.rateLimit().remaining >= floor;
  }

  /**
   * The client for a player's ingestion: their own token while it is usable, else the server's. A call
   * the own token cannot make (401, rate limited) is made again with the server's token. Null when
   * there is neither.
   */
  forUser(userId: number): GithubClient | null {
    const own = this.own(userId);
    const server = this.deps.server;
    if (!own) return server;
    const restOk = () => this.deps.store.sealedToken(userId) !== null && own.rateLimit().remaining >= OWN_REST_FLOOR;
    const gqlOk = () => this.deps.store.sealedToken(userId) !== null && (own.graphqlRateLimit?.().remaining ?? 0) >= OWN_GRAPHQL_FLOOR;
    const ok = (name: AsyncMethod) => (name === 'graphql' ? gqlOk() : restOk());
    const fallback = (name: AsyncMethod, args: unknown[], err?: unknown): Promise<unknown> => {
      const fn = server?.[name] as AnyFn | undefined;
      if (!fn) return err === undefined ? (own[name] as AnyFn).apply(own, args) : Promise.reject(err);
      this.stats.fallbacks++;
      return fn.apply(server, args);
    };
    const out: Record<string, unknown> = {
      rateLimit: () => (restOk() || !server ? own.rateLimit() : server.rateLimit()),
      graphqlRateLimit: () => (gqlOk() || !server?.graphqlRateLimit ? (own.graphqlRateLimit?.() ?? { remaining: 0, resetAtMs: 0 }) : server.graphqlRateLimit()),
    };
    for (const name of ASYNC_METHODS) {
      const fn = own[name] as AnyFn | undefined;
      if (!fn) continue;
      out[name] = async (...args: unknown[]) => {
        if (!ok(name)) return fallback(name, args);
        this.stats.ownCalls++;
        try {
          return await fn.apply(own, args);
        } catch (err) {
          if (unauthorized(err) || rateLimited(err)) return fallback(name, args, err);
          throw err;
        }
      };
    }
    return out as unknown as GithubClient;
  }

  /** GitHub refused the player's token: it is wiped and flagged, and the player is told to sign in again. */
  invalidate(userId: number): void {
    this.clients.delete(userId);
    this.stats.invalidated++;
    this.deps.store.invalidateToken(userId, this.deps.clock());
    this.deps.log.warn('GitHub refused a player token; falling back to the server token', { user: userId });
  }

  /** Drops the player's client (a new token was stored, or the old one deleted). */
  forget(userId: number): void {
    this.clients.delete(userId);
  }
}

/** A client that counts the calls and GitHub charges made through it, for a cost bound. */
export function counting(base: GithubClient): { client: GithubClient; charged: () => number } {
  const before = base.usage?.() ?? { requests: 0, notModified: 0 };
  return {
    client: base,
    charged: () => {
      const now = base.usage?.() ?? before;
      return now.requests - before.requests - (now.notModified - before.notModified);
    },
  };
}
