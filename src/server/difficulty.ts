// Fetching the difficulty bonus's context for a push (rules/difficulty.ts has the rules).
//
// Per diff, before the push is recorded:
// 1. The repository's facts (fork, source, age, stars, forks, size) and languages over REST, cached
//    per repository per UTC day (and revalidated with ETags, so an unchanged answer is free).
// 2. One GraphQL query at the diff's base commit with aliases for up to CONTEXT_FILES of its most
//    changed source files: each file's `history(first: 100)` and `blame`.
// 3. If that fails or times out, one query per file; then, for files still unread, the local mirror
//    (when MIRROR_DIR is set and the repository is at most 50 MB); otherwise the file has no context
//    and its multiplier stays 1.
// The bonus the ledger computes from this context is recorded in the push input, so a replay never
// fetches anything.

import { categorizePath, extensionOf, isGeneratedContent, splitPatch, type ChangedFile } from '../rules/classify.ts';
import {
  changedLinesOf,
  contextCandidates,
  fileContext,
  independentAuthors,
  repoGate,
  repoOrigin,
  upstreamOf,
  type BlameRange,
  type ContextSource,
  type FileContext,
  type Pusher,
  type PushContext,
  type RawFileFacts,
  type RepoFacts,
} from '../rules/difficulty.ts';
import { GRAPHQL_TIMEOUT_MS, type GithubClient } from './github.ts';
import type { Logger } from './log.ts';
import type { Mirror } from './mirror.ts';

/** Repositories whose code GitHub counts under this many bytes are too small for the bonus to matter: no GraphQL is spent. */
export const MIN_REPO_CODE_BYTES = 20_000;
/** GraphQL points kept back: below this, context comes from the mirror or not at all. */
export const GRAPHQL_RESERVE = 200;
/** A single-file retry gets a little less time than the batch. */
const SINGLE_TIMEOUT_MS = 2_000;
const REPO_CACHE_MAX = 2_000;
const DAY_MS = 86_400_000;

export interface ContextDeps {
  github: GithubClient;
  clock: () => number;
  mirror?: Mirror | null;
  log?: Logger;
  /** Per-request GraphQL timeout. */
  timeoutMs?: number;
}

/** What one fetch cost and where its context came from (for logs, tests and the cost report). */
export interface ContextStats {
  graphqlQueries: number;
  graphqlFailures: number;
  graphqlPoints: number;
  singleQueries: number;
  restRequests: number;
  mirrorFiles: number;
  graphqlFiles: number;
  neutralFiles: number;
}

const AUTHOR = 'author { user { databaseId createdAt } }';

/** The context query for `n` files at one commit; paths travel as variables, never in the query text. */
export function contextQuery(n: number): string {
  const vars = ['$owner: String!', '$name: String!', '$oid: GitObjectID!'];
  const fields: string[] = [];
  for (let i = 0; i < n; i++) {
    vars.push(`$p${i}: String!`);
    fields.push(`h${i}: history(first: 100, path: $p${i}) { totalCount nodes { authoredDate ${AUTHOR} } }`);
    fields.push(`b${i}: blame(path: $p${i}) { ranges { startingLine endingLine commit { authoredDate ${AUTHOR} } } }`);
  }
  return `query(${vars.join(', ')}) { rateLimit { cost remaining } repository(owner: $owner, name: $name) { object(oid: $oid) { ... on Commit { ${fields.join(' ')} } } } }`;
}

type Json = Record<string, unknown> | null | undefined;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
const date = (v: unknown): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Who authored a commit, as `id:<n>` with the account's creation time, or null when GitHub links no account. */
function authorOf(commit: Json): { author: string | null; authorCreatedAt: number | null } {
  const user = obj(obj(obj(commit)?.author)?.user);
  const id = user?.databaseId;
  return typeof id === 'number' ? { author: `id:${id}`, authorCreatedAt: date(user?.createdAt) || null } : { author: null, authorCreatedAt: null };
}

/** One file's blame and history out of a context answer; null when either is missing. */
export function readAliases(commit: Json, i: number): RawFileFacts | null {
  const h = obj(commit?.[`h${i}`]);
  const b = obj(commit?.[`b${i}`]);
  if (!h || !b || !Array.isArray(b.ranges) || !Array.isArray(h.nodes)) return null;
  const blame: BlameRange[] = [];
  for (const r of b.ranges as unknown[]) {
    const range = obj(r);
    const start = range?.startingLine;
    const end = range?.endingLine;
    if (typeof start !== 'number' || typeof end !== 'number' || end < start) continue;
    const c = obj(range?.commit);
    blame.push({ start, end, at: date(c?.authoredDate), ...authorOf(c) });
  }
  const commits = (h.nodes as unknown[]).map((n) => {
    const node = obj(n);
    return { at: date(node?.authoredDate), ...authorOf(node) };
  });
  return { blame, history: { total: typeof h.totalCount === 'number' ? h.totalCount : commits.length, commits } };
}

const isSource = (path: string, patch: string | null | undefined) => categorizePath(path) === 'source' && !(patch && isGeneratedContent('source', extensionOf(path), splitPatch(patch)));

export class DifficultyContext {
  private repos = new Map<string, { facts: RepoFacts | null }>();
  readonly stats: ContextStats = { graphqlQueries: 0, graphqlFailures: 0, graphqlPoints: 0, singleQueries: 0, restRequests: 0, mirrorFiles: 0, graphqlFiles: 0, neutralFiles: 0 };
  private lastPrune = 0;

  constructor(private readonly deps: ContextDeps) {}

  /**
   * Context for one diff of `repo` read against `base`, for the push of `pusher`, or null when
   * nothing could be read (the bonus is then 0). Never throws. `github` overrides the client for this
   * read (a player's own token, server/githubPool.ts); facts are public, so the caches are shared.
   */
  async forDiff(repo: string, diff: { base?: string | null; files: readonly ChangedFile[] }, pusher: Pusher, github?: GithubClient): Promise<PushContext | null> {
    try {
      return await this.read(repo, diff, pusher, github ?? this.deps.github);
    } catch (err) {
      this.deps.log?.warn('difficulty context failed', { repo, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private async read(repo: string, diff: { base?: string | null; files: readonly ChangedFile[] }, pusher: Pusher, github: GithubClient): Promise<PushContext | null> {
    const base = diff.base ?? null;
    if (!base || !/^[0-9a-f]{40}$/.test(base)) return null;
    const candidates = contextCandidates(diff.files, isSource);
    if (candidates.length === 0) return null;
    const facts = await this.repoFacts(repo, github);
    if (!facts) return null;
    if (facts.languages) {
      const bytes = Object.values(facts.languages).reduce((a, b) => a + b, 0);
      if (bytes < MIN_REPO_CODE_BYTES) return null;
    }
    const paths = candidates.map((f) => f.filename);
    const raw = new Map<string, { facts: RawFileFacts; source: ContextSource }>();
    for (const [path, f] of await this.viaGraphql(repo, base, paths, github)) raw.set(path, { facts: f, source: 'graphql' });
    const unread = paths.filter((p) => !raw.has(p));
    if (unread.length > 0 && this.deps.mirror) {
      this.prune();
      for (const [path, f] of await this.deps.mirror.facts(facts.fullName, base, unread, facts.sizeKb)) raw.set(path, { facts: f, source: 'mirror' });
    }
    this.stats.graphqlFiles += [...raw.values()].filter((r) => r.source === 'graphql').length;
    this.stats.mirrorFiles += [...raw.values()].filter((r) => r.source === 'mirror').length;
    this.stats.neutralFiles += paths.length - raw.size;
    if (raw.size === 0) return null;
    const now = this.deps.clock();
    const gate = repoGate(facts, independentAuthors([...raw.values()].map((r) => r.facts), pusher, now));
    const origin = repoOrigin(facts);
    const files: Record<string, FileContext> = {};
    for (const f of candidates) {
      const r = raw.get(f.filename);
      if (!r) continue;
      files[f.filename] = fileContext({ path: f.filename, facts: r.facts, changed: changedLinesOf(f.patch!), pusher, now, origin, gate, source: r.source });
    }
    // A fork's bonus waits until its commits reach the upstream (server/upstream.ts).
    const upstream = upstreamOf(facts);
    return { files, ...(upstream ? { upstream } : {}) };
  }

  /** Blame and history for `paths` at `base`: one batched query, then one per file for any it did not answer. */
  private async viaGraphql(repo: string, base: string, paths: readonly string[], github: GithubClient): Promise<Map<string, RawFileFacts>> {
    const out = new Map<string, RawFileFacts>();
    if (!github.graphql) return out;
    if (github.graphqlRateLimit && github.graphqlRateLimit().remaining < GRAPHQL_RESERVE) return out;
    const [owner, name] = repo.split('/') as [string, string];
    const ask = async (batch: readonly string[], timeoutMs: number): Promise<boolean> => {
      const variables: Record<string, unknown> = { owner, name, oid: base };
      batch.forEach((p, i) => (variables[`p${i}`] = p));
      this.stats.graphqlQueries++;
      try {
        const res = await github.graphql!(contextQuery(batch.length), variables, timeoutMs);
        const data = obj(res.data);
        const cost = obj(data?.rateLimit)?.cost;
        if (typeof cost === 'number') this.stats.graphqlPoints += cost;
        const commit = obj(obj(obj(data?.repository)?.object));
        batch.forEach((p, i) => {
          const facts = readAliases(commit, i);
          if (facts) out.set(p, facts);
        });
        return batch.every((p) => out.has(p));
      } catch {
        this.stats.graphqlFailures++;
        return false;
      }
    };
    const timeout = this.deps.timeoutMs ?? GRAPHQL_TIMEOUT_MS;
    if (await ask(paths, timeout)) return out;
    // One file at a time for what the batch did not answer (a timeout on a huge blame, a partial error).
    const rest = paths.filter((p) => !out.has(p));
    if (rest.length > 1 || out.size > 0) {
      await Promise.all(
        rest.map((p) => {
          this.stats.singleQueries++;
          return ask([p], Math.min(timeout, SINGLE_TIMEOUT_MS));
        }),
      );
    }
    return out;
  }

  /** A repository's facts and languages, read once per UTC day (ETags make the next day's read free when unchanged). */
  async repoFacts(repo: string, github: GithubClient = this.deps.github): Promise<RepoFacts | null> {
    if (!github.repoFacts) return null;
    const day = Math.floor(this.deps.clock() / DAY_MS);
    const key = `${repo.toLowerCase()}#${day}`;
    const known = this.repos.get(key);
    if (known) return known.facts;
    this.stats.restRequests += 2;
    const facts = await github.repoFacts(repo);
    const languages = facts && github.languages ? await github.languages(facts.fullName).catch(() => null) : null;
    const value = facts ? { ...facts, languages } : null;
    if (this.repos.size >= REPO_CACHE_MAX) this.repos.delete(this.repos.keys().next().value!);
    this.repos.set(key, { facts: value });
    return value;
  }

  /** Prunes idle mirrors at most once an hour. */
  private prune(): void {
    const now = this.deps.clock();
    if (!this.deps.mirror || now - this.lastPrune < 3_600_000) return;
    this.lastPrune = now;
    this.deps.mirror.prune(now);
  }
}
