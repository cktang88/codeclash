// Fast-forwarding a replay (seeking) in a worker: the simulation runs at full speed off the main
// thread while the page keeps drawing, and hands back the world it reached plus the chronicle it
// narrated on the way. Same simulation code, same inputs, so the same world; where workers are
// missing or fail, resolves null and the caller steps on the main thread in slices.
import type { WorldSnapshot, World } from '../../sim/api.ts';
import type { ChronicleEntry } from '../../sim/chronicle.ts';
import { restore, snapshot } from '../../sim/snapshot.ts';
import type { Replay } from '../../sim/replay.ts';

export interface SeekJob {
  replay: Replay;
  /** The world to start from, or null for the war's start. */
  from: WorldSnapshot | null;
  to: number;
  /** Logins by player index and repository names, for the chronicle's text. */
  players: string[];
  repos: string[];
  /** Chronicle entries to keep (the newest). */
  keep: number;
}

export type SeekMessage = { type: 'progress'; tick: number } | { type: 'done'; snapshot: WorldSnapshot; chronicle: ChronicleEntry[] } | { type: 'error'; message: string };

export interface SeekResult {
  world: World;
  chronicle: ChronicleEntry[];
}

/**
 * Seeks in a worker. `onProgress` gets the tick reached now and then; `cancelled` is polled, and a
 * cancelled seek stops the worker and resolves null.
 */
export function seekOffThread(job: Omit<SeekJob, 'from'> & { from: World | null }, onProgress: (tick: number) => void, cancelled: () => boolean): Promise<SeekResult | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./seek.worker.ts', import.meta.url), { type: 'module', name: 'seek' });
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const finish = (r: SeekResult | null) => {
      clearInterval(poll);
      worker.terminate();
      resolve(r);
    };
    const poll = setInterval(() => {
      if (cancelled()) finish(null);
    }, 100);
    worker.onmessage = (e: MessageEvent<SeekMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.tick);
      else if (m.type === 'done') finish({ world: restore(m.snapshot), chronicle: m.chronicle });
      else finish(null);
    };
    worker.onerror = () => finish(null);
    const msg: SeekJob = { ...job, from: job.from ? snapshot(job.from) : null };
    worker.postMessage(msg);
  });
}
