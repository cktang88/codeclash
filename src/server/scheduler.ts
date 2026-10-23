import { TICK_MS } from '../sim/api.ts';
import { errorMessage, type Logger } from './log.ts';
import type { Rooms } from './rooms.ts';

export const MAX_STEPS_PER_LOOP = 60;
const RECONCILE_MS = 1000;

/** Steps every room's war to wall-clock time and runs the daily lifecycle. */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly rooms: Rooms,
    private readonly log: Logger,
  ) {}

  start(clock: () => number = Date.now): void {
    this.timers.push(setInterval(() => this.tick(clock()), TICK_MS));
    this.timers.push(setInterval(() => this.reconcile(clock()), RECONCILE_MS));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
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
