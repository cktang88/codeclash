// A local mirror of a repository's history: the difficulty bonus's fallback when GitHub's GraphQL
// blame cannot be read (rules/difficulty.ts, server/difficulty.ts).
//
// It stores as little as it can, and only source code:
// - a bare partial clone (`--filter=blob:none`, no working copy, default branch, no tags): commits
//   and trees, no file contents at all
// - then, per file it is asked about, the blobs of that file's own history, fetched in one batch;
//   only paths the classifier treats as source are ever read, so no asset, binary, lockfile,
//   vendored or generated file is fetched or blamed. A file whose blob at the base is over
//   MAX_BLOB_BYTES (256 KB) is not blamed.
// - a repository GitHub reports as over MAX_MIRROR_BYTES is never cloned, and a mirror that grows
//   past it on disk is deleted; a mirror untouched for IDLE_MS (14 days) is pruned.
//
// Git runs through child_process with no shell, a timeout per command, no prompts and no user or
// system config. Repository names, shas and paths are validated before they reach an argument.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { categorizePath } from '../rules/classify.ts';
import type { BlameRange, RawFileFacts } from '../rules/difficulty.ts';

/** On-disk size a mirror may reach; GitHub's reported size must be under it before a clone. */
export const MAX_MIRROR_BYTES = 50 * 1024 * 1024;
/** Larger blobs are not blamed. */
export const MAX_BLOB_BYTES = 256 * 1024;
/** Mirrors untouched this long are deleted. */
export const IDLE_MS = 14 * 86_400_000;
/** One git command may take this long. */
export const GIT_TIMEOUT_MS = 20_000;
/** Commits of a file's history read for its authors. */
const HISTORY_COMMITS = 100;
/** Output one git command may produce. */
const OUTPUT_MAX = 64 * 1024 * 1024;
const MARKER = 'codeclash-used';

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

/** `owner/name` as GitHub allows it, never `.` or `..` as the name. */
export function validRepoName(repo: string): boolean {
  if (!REPO.test(repo)) return false;
  const name = repo.slice(repo.indexOf('/') + 1);
  return name !== '.' && name !== '..';
}

/** A path the mirror may read: a source file by the classifier, and nothing that could pass for an option or climb out. */
export function readablePath(path: string): boolean {
  if (path.length === 0 || path.length > 1024 || /[\0\n\r]/.test(path) || path.startsWith('-') || path.startsWith('/')) return false;
  if (path.split('/').some((p) => p === '..' || p === '.' || p === '')) return false;
  return categorizePath(path) === 'source';
}

export interface MirrorOptions {
  /** Where mirrors live (MIRROR_DIR). */
  dir: string;
  maxBytes?: number;
  maxBlobBytes?: number;
  idleMs?: number;
  timeoutMs?: number;
  /** Clone URL of a repository (tests use file:// remotes). */
  remote?: (repo: string) => string;
  git?: string;
  clock?: () => number;
}

interface GitResult {
  code: number;
  stdout: string;
}

export class Mirror {
  readonly stats = { clones: 0, fetches: 0, blames: 0, dropped: 0, pruned: 0, failures: 0 };
  private readonly maxBytes: number;
  private readonly maxBlob: number;
  private readonly idleMs: number;
  private readonly timeoutMs: number;
  private readonly remote: (repo: string) => string;
  private readonly git: string;
  private readonly clock: () => number;
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly opts: MirrorOptions) {
    this.maxBytes = opts.maxBytes ?? MAX_MIRROR_BYTES;
    this.maxBlob = opts.maxBlobBytes ?? MAX_BLOB_BYTES;
    this.idleMs = opts.idleMs ?? IDLE_MS;
    this.timeoutMs = opts.timeoutMs ?? GIT_TIMEOUT_MS;
    this.remote = opts.remote ?? ((repo) => `https://github.com/${repo}.git`);
    this.git = opts.git ?? 'git';
    this.clock = opts.clock ?? Date.now;
  }

  /** Where a repository's mirror is kept. */
  pathOf(repo: string): string {
    return join(this.opts.dir, `${repo.toLowerCase().replace('/', '__')}.git`);
  }

  /** Bytes a mirror takes on disk. */
  sizeOf(repo: string): number {
    return du(this.pathOf(repo));
  }

  /**
   * Blame and history of `paths` at `base`, for the paths it could read. `sizeKb` is GitHub's
   * reported size of the repository: one over the cap is never cloned. Never throws.
   */
  async facts(repo: string, base: string, paths: readonly string[], sizeKb: number): Promise<Map<string, RawFileFacts>> {
    const out = new Map<string, RawFileFacts>();
    if (!validRepoName(repo) || !SHA.test(base) || sizeKb * 1024 > this.maxBytes) return out;
    const wanted = [...new Set(paths)].filter(readablePath);
    if (wanted.length === 0) return out;
    return this.locked(repo, async () => {
      try {
        const dir = this.pathOf(repo);
        if (!(await this.ensure(repo, dir, base))) return out;
        for (const path of wanted) {
          const facts = await this.readFile(dir, base, path);
          if (facts) out.set(path, facts);
          // A mirror that outgrows the cap is dropped, whatever it was about to answer.
          if (du(dir) > this.maxBytes) {
            this.stats.dropped++;
            rmSync(dir, { recursive: true, force: true });
            return new Map<string, RawFileFacts>();
          }
        }
        touch(dir, this.clock());
        return out;
      } catch {
        this.stats.failures++;
        return out;
      }
    });
  }

  /** Deletes mirrors untouched for `idleMs`; returns the repositories' directory names. */
  prune(now = this.clock()): string[] {
    const dropped: string[] = [];
    let names: string[];
    try {
      names = readdirSync(this.opts.dir);
    } catch {
      return dropped;
    }
    for (const name of names) {
      if (!name.endsWith('.git')) continue;
      const dir = join(this.opts.dir, name);
      let used = 0;
      try {
        used = statSync(join(dir, MARKER)).mtimeMs;
      } catch {
        try {
          used = statSync(dir).mtimeMs;
        } catch {
          continue;
        }
      }
      if (now - used >= this.idleMs) {
        rmSync(dir, { recursive: true, force: true });
        dropped.push(name);
        this.stats.pruned++;
      }
    }
    return dropped;
  }

  private async locked<T>(repo: string, run: () => Promise<T>): Promise<T> {
    const key = repo.toLowerCase();
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(run, run);
    const tail = next.catch(() => undefined);
    this.locks.set(key, tail);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  /** The mirror exists and holds `base` (commits and trees). */
  private async ensure(repo: string, dir: string, base: string): Promise<boolean> {
    if (!existsSync(join(dir, 'HEAD'))) {
      mkdirSync(this.opts.dir, { recursive: true });
      rmSync(dir, { recursive: true, force: true });
      this.stats.clones++;
      const r = await this.run(['clone', '--quiet', '--bare', '--filter=blob:none', '--single-branch', '--no-tags', '--', this.remote(repo), dir], this.opts.dir);
      if (r.code !== 0) {
        this.stats.failures++;
        rmSync(dir, { recursive: true, force: true });
        return false;
      }
      touch(dir, this.clock());
    }
    if ((await this.run(['cat-file', '-e', `${base}^{commit}`], dir)).code === 0) return true;
    // The base is on another branch, or newer than the mirror: fetch it (commits and trees only).
    this.stats.fetches++;
    const f = await this.run(['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--recurse-submodules=no', '--filter=blob:none', 'origin', base], dir);
    return f.code === 0 && (await this.run(['cat-file', '-e', `${base}^{commit}`], dir)).code === 0;
  }

  /** Fetches the blobs of one source file's history, then blames it at `base`. */
  private async readFile(dir: string, base: string, path: string): Promise<RawFileFacts | null> {
    // Which of this file's blobs are missing: path-limited, so no other file's contents are asked for.
    const listed = await this.run(['rev-list', '--objects', '--missing=print', base, '--', path], dir);
    if (listed.code !== 0) return null;
    const missing = listed.stdout.split('\n').filter((l) => l.startsWith('?')).map((l) => l.slice(1).trim()).filter((oid) => SHA.test(oid));
    if (missing.length > 0) {
      this.stats.fetches++;
      const f = await this.run(['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--recurse-submodules=no', '--filter=blob:none', '--stdin', 'origin'], dir, `${missing.join('\n')}\n`);
      if (f.code !== 0) return null;
    }
    const size = await this.run(['cat-file', '-s', `${base}:${path}`], dir);
    if (size.code !== 0 || Number(size.stdout.trim()) > this.maxBlob) return null;
    this.stats.blames++;
    const blame = await this.run(['blame', '--porcelain', '--no-progress', base, '--', path], dir);
    if (blame.code !== 0) return null;
    const log = await this.run(['log', `-n${HISTORY_COMMITS}`, '--format=%at%x09%ae', base, '--', path], dir);
    const count = await this.run(['rev-list', '--count', base, '--', path], dir);
    if (log.code !== 0 || count.code !== 0) return null;
    const commits = log.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [at, email] = l.split('\t');
        return { at: Number(at) * 1000, author: email ? `email:${email.toLowerCase()}` : null };
      });
    return { blame: parsePorcelain(blame.stdout), history: { total: Number(count.stdout.trim()) || commits.length, commits } };
  }

  private run(args: string[], cwd: string, input?: string): Promise<GitResult> {
    return new Promise((resolve) => {
      const child = spawn(this.git, ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', ...args], {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'ignore'],
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          HOME: this.opts.dir,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
          ...(process.env.https_proxy ? { https_proxy: process.env.https_proxy } : {}),
          ...(process.env.GIT_SSL_CAINFO ? { GIT_SSL_CAINFO: process.env.GIT_SSL_CAINFO } : {}),
        },
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let done = false;
      const finish = (code: number) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(-1);
      }, this.timeoutMs);
      child.stdout.on('data', (b: Buffer) => {
        bytes += b.length;
        if (bytes > OUTPUT_MAX) {
          child.kill('SIGKILL');
          finish(-1);
        } else chunks.push(b);
      });
      child.on('error', () => finish(-1));
      child.on('close', (code) => finish(code ?? -1));
      child.stdin.on('error', () => undefined);
      child.stdin.end(input ?? '');
    });
  }
}

/** Blame ranges from `git blame --porcelain`: runs of final lines from one commit. */
export function parsePorcelain(text: string): BlameRange[] {
  const info = new Map<string, { at: number; author: string | null }>();
  const ranges: BlameRange[] = [];
  let sha = '';
  let final = 0;
  let pending: { mail?: string; time?: number } = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('\t')) {
      const known = info.get(sha) ?? { at: (pending.time ?? 0) * 1000, author: pending.mail ? `email:${pending.mail}` : null };
      info.set(sha, known);
      const last = ranges[ranges.length - 1];
      if (last && last.end === final - 1 && last.at === known.at && last.author === known.author) last.end = final;
      else ranges.push({ start: final, end: final, at: known.at, author: known.author });
      pending = {};
      continue;
    }
    const head = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (head) {
      sha = head[1]!;
      final = Number(head[2]);
      continue;
    }
    if (line.startsWith('author-mail ')) pending.mail = line.slice(12).replace(/^<|>$/g, '').toLowerCase();
    else if (line.startsWith('author-time ')) pending.time = Number(line.slice(12));
  }
  return ranges;
}

function touch(dir: string, now: number): void {
  try {
    const marker = join(dir, MARKER);
    if (!existsSync(marker)) writeFileSync(marker, '');
    const t = new Date(now);
    utimesSync(marker, t, t);
  } catch {
    // a mirror that cannot be marked is pruned sooner, which is harmless
  }
}

/** Bytes under a directory (files only, symlinks not followed). */
function du(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += statSync(p).size;
        } catch {
          // gone meanwhile
        }
      }
    }
  }
  return total;
}
