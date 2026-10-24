import { TICK_MS } from '../sim/api.ts';
import { errorMessage, type Logger } from './log.ts';
import type { Rooms } from './rooms.ts';
import type { War } from './war.ts';

export const MAX_STEPS_PER_LOOP = 60;
const RECONCILE_MS = 1000;
/**
 * Longest the scheduler runs wars before yielding to sockets and HTTP. All wars stepping in one
 * synchronous loop stalled every request for the sum of their steps (about 3.5 ms per busy room);
 * yielding between slices bounds the stall to about one slice whatever the number of rooms.
 */
export const SLICE_MS = 8;

/** One interval's run: wars already given their step, wars that threw, catch-up steps left. */
interface RunState {
  now: number;
  stepped: Set<War>;
  failed: Set<War>;
  extra: number;
}

/** Steps every room's war to wall-clock time and runs the daily lifecycle. */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly rooms: Rooms,
    private readonly log: Logger,
  ) {}

  private running = false;
  /** Bumped by stop(), so a run in progress does not carry on past it. */
  private gen = 0;

  start(clock: () => number = Date.now): void {
    this.timers.push(setInterval(() => this.run(clock()), TICK_MS));
    this.timers.push(setInterval(() => this.reconcile(clock()), RECONCILE_MS));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.gen++;
    this.running = false;
  }

  /**
   * One interval's stepping with the same rules as tick(), but in slices of about SLICE_MS with the
   * event loop let in between. A run still going when the next interval fires is not doubled up;
   * the next run picks up any lag. Each pass takes the war list afresh, so a war ended or removed
   * meanwhile (a rollover or a deletion can run between slices) is not stepped.
   */
  run(now: number, budget: number = MAX_STEPS_PER_LOOP, done?: () => void): void {
    if (this.running) return;
    this.running = true;
    const gen = this.gen;
    const state: RunState = { now, stepped: new Set(), failed: new Set(), extra: budget };
    const slice = (): void => {
      if (gen !== this.gen) return;
      try {
        if (this.slice(state)) {
          setImmediate(slice);
          return;
        }
      } catch (err) {
        // Never leave the scheduler marked busy: the next interval starts afresh.
        this.log.error('tick failed', { error: errorMessage(err) });
      }
      this.running = false;
      done?.();
    };
    slice();
  }

  /** Steps wars for about SLICE_MS. True if work is left for another slice. */
  private slice(st: RunState): boolean {
    const started = performance.now();
    for (;;) {
      const behind = this.rooms.wars().filter((w) => !st.failed.has(w) && w.behind(st.now) && (!st.stepped.has(w) || st.extra > 0));
      if (behind.length === 0) return false;
      for (const w of behind) {
        if (!w.behind(st.now)) continue;
        if (st.stepped.has(w)) {
          if (st.extra <= 0) continue;
          st.extra--;
        } else st.stepped.add(w);
        try {
          w.step();
        } catch (err) {
          this.log.error('tick failed', { war: w.id, error: errorMessage(err) });
          st.failed.add(w);
        }
        if (performance.now() - started >= SLICE_MS) return true;
      }
    }
  }

  // Round-robin one step at a time so a war catching up cannot starve the others.
  // Every war that is behind gets at least one step per interval (otherwise, with more
  // live rooms than the budget, every war would drift further behind wall-clock time
  // forever); the shared budget only bounds the extra catch-up steps.
  tick(now: number, budget: number = MAX_STEPS_PER_LOOP): void {
    let behind = this.rooms.wars().filter((w) => w.behind(now));
    const limit = behind.length + budget;
    let spent = 0;
    while (spent < limit && behind.length > 0) {
      for (const w of behind) {
        if (spent >= limit) break;
        spent++;
        try {
          w.step();
        } catch (err) {
          this.log.error('tick failed', { war: w.id, error: errorMessage(err) });
          behind = behind.filter((x) => x !== w);
        }
      }
      behind = behind.filter((w) => w.behind(now));
    }
  }

  reconcile(now: number): void {
    try {
      this.rooms.reconcile(now);
    } catch (err) {
      this.log.error('reconcile failed', { error: errorMessage(err) });
    }
  }
}
