// Parsing pushes off the main thread.
//
// Measuring a push has two halves (rules/ledger.ts): `preparePush` reads, classifies and parses the
// diff (tree-sitter: up to ~0.7 s for a huge push), and `applyPush` moves the ledger inside the
// store's transaction (fast). The first half is a pure function of the diff, so it runs here, in a
// pool of worker threads, and the second on the main thread: the result is exactly what measuring
// inline gives. A worker that fails or takes too long falls back to parsing inline.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { ChangedFile } from '../rules/classify.ts';
import { loadGrammars } from '../rules/complexity.ts';
import { preparePush, type PreparedPush } from '../rules/ledger.ts';

/** A job that takes longer than this is abandoned and parsed inline. */
export const PARSE_TIMEOUT_MS = 30_000;

export interface Parser {
  /** Each diff prepared on its own (a push measured commit by commit has several). */
  prepare(diffs: readonly (readonly ChangedFile[])[]): Promise<PreparedPush[]>;
  close(): Promise<void>;
  readonly threads: number;
}

/** Parsing on the calling thread (tests, scripts, PARSE_WORKERS=0). */
export function inlineParser(): Parser {
  return {
    threads: 0,
    async prepare(diffs) {
      await loadGrammars(diffs.flat());
      return diffs.map((files) => preparePush(files));
    },
    async close() {},
  };
}

/** The worker's entry: the bundled .js beside the server in a build, the .ts source otherwise (Node strips its types). */
function workerUrl(): URL {
  return new URL(import.meta.url.endsWith('.ts') ? './parseWorker.ts' : './parseWorker.js', import.meta.url);
}

interface Pending {
  resolve: (p: PreparedPush[]) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

interface Slot {
  worker: Worker;
  busy: number;
  pending: Map<number, Pending>;
}

export class ParsePool implements Parser {
  private slots: Slot[] = [];
  private next = 1;
  private closed = false;
  private inline = inlineParser();
  readonly stats = { jobs: 0, fallbacks: 0, restarts: 0 };

  constructor(
    readonly threads: number,
    private readonly timeoutMs = PARSE_TIMEOUT_MS,
    private readonly url: URL = workerUrl(),
  ) {
    for (let i = 0; i < threads; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.url), busy: 0, pending: new Map() };
    slot.worker.unref();
    slot.worker.on('message', (msg: { id: number; prepared?: PreparedPush[]; error?: string }) => {
      const p = slot.pending.get(msg.id);
      if (!p) return;
      slot.pending.delete(msg.id);
      slot.busy--;
      clearTimeout(p.timer);
      if (msg.prepared) p.resolve(msg.prepared);
      else p.reject(new Error(msg.error ?? 'parse failed'));
    });
    const fail = (err: Error) => {
      for (const p of slot.pending.values()) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      slot.pending.clear();
      slot.busy = 0;
      if (this.closed) return;
      // A worker that died is replaced, so the pool keeps its size.
      const i = this.slots.indexOf(slot);
      if (i >= 0) {
        this.stats.restarts++;
        this.slots[i] = this.spawn();
      }
    };
    slot.worker.on('error', fail);
    slot.worker.on('exit', (code) => {
      if (code !== 0 || slot.pending.size > 0) fail(new Error(`parse worker exited with ${code}`));
    });
    return slot;
  }

  async prepare(diffs: readonly (readonly ChangedFile[])[]): Promise<PreparedPush[]> {
    if (this.closed || this.slots.length === 0) return this.inline.prepare(diffs);
    this.stats.jobs++;
    const slot = this.slots.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = this.next++;
    try {
      return await new Promise<PreparedPush[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!slot.pending.delete(id)) return;
          slot.busy--;
          reject(new Error('parse timed out'));
          // A stuck worker holds a parse that will never finish: replace it.
          void slot.worker.terminate();
        }, this.timeoutMs);
        timer.unref();
        slot.pending.set(id, { resolve, reject, timer });
        slot.busy++;
        slot.worker.postMessage({ id, diffs });
      });
    } catch {
      this.stats.fallbacks++;
      return this.inline.prepare(diffs);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
    this.slots = [];
  }
}

/** The pool for `threads` workers (0: parse inline). The default leaves a core for the wars. */
export function createParser(threads: number | null = null): Parser {
  const n = threads ?? Math.max(1, Math.min(2, availableParallelism() - 1));
  return n <= 0 ? inlineParser() : new ParsePool(n);
}
