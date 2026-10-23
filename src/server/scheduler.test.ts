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
