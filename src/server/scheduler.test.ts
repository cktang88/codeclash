import { describe, expect, it } from 'vitest';
import { silentLogger } from './log.ts';
import type { Rooms } from './rooms.ts';
import { MAX_STEPS_PER_LOOP, Scheduler } from './scheduler.ts';
import type { War } from './war.ts';

function fakeWar(behindBy: number) {
  const w = { tick: 0, target: behindBy, behind: () => w.tick < w.target, step: () => void w.tick++ };
  return w;
}

describe('Scheduler', () => {
  it('keeps every room at wall-clock time even with more rooms than the step budget', () => {
    const wars = Array.from({ length: MAX_STEPS_PER_LOOP * 3 }, () => fakeWar(1));
    const scheduler = new Scheduler({ wars: () => wars as unknown as War[] } as unknown as Rooms, silentLogger);
    scheduler.tick(0);
    expect(wars.every((w) => w.tick === 1)).toBe(true);
  });

  it('bounds catch-up work per interval', () => {
    const wars = [fakeWar(10_000), fakeWar(10_000)];
    const scheduler = new Scheduler({ wars: () => wars as unknown as War[] } as unknown as Rooms, silentLogger);
    scheduler.tick(0);
    expect(wars[0]!.tick + wars[1]!.tick).toBe(MAX_STEPS_PER_LOOP + 2);
    expect(wars[0]!.tick).toBe(wars[1]!.tick);
  });
});

describe('Scheduler.run (time-sliced)', () => {
  function slowWar(behindBy: number, ms: number) {
    const w = {
      tick: 0,
      target: behindBy,
      behind: () => w.tick < w.target,
      step: () => {
        const until = performance.now() + ms;
        while (performance.now() < until);
        w.tick++;
      },
    };
    return w;
  }

  it('steps the same wars as tick() but lets the event loop in between slices', async () => {
    const wars = Array.from({ length: 12 }, () => slowWar(1, 2));
    const scheduler = new Scheduler({ wars: () => wars as unknown as War[] } as unknown as Rooms, silentLogger);
    let ranBetween = 0;
    const probe = setInterval(() => ranBetween++, 0);
    await new Promise<void>((resolve) => scheduler.run(0, MAX_STEPS_PER_LOOP, resolve));
    clearInterval(probe);
    expect(wars.every((w) => w.tick === 1)).toBe(true);
    // 12 steps of 2 ms in slices of about 8 ms: the loop got in at least twice.
    expect(ranBetween).toBeGreaterThanOrEqual(2);
  });

  it('bounds catch-up work like tick() and skips a war that throws', async () => {
    const wars = [fakeWar(10_000), fakeWar(10_000), { behind: () => true, step: () => { throw new Error('boom'); } }];
    const scheduler = new Scheduler({ wars: () => wars as unknown as War[] } as unknown as Rooms, silentLogger);
    await new Promise<void>((resolve) => scheduler.run(0, MAX_STEPS_PER_LOOP, resolve));
    expect((wars[0] as { tick: number }).tick + (wars[1] as { tick: number }).tick).toBe(MAX_STEPS_PER_LOOP + 2);
  });
});
