import { describe, expect, it } from 'vitest';
import { GameStore } from '../store.ts';
import { startDemo } from './local.ts';

describe('demo runner', () => {
  it('gives the HUD a new repos array when a bot pushes to a new repository', () => {
    const store = new GameStore();
    const runner = startDemo(store, 5, 7);
    const seen = new Set([store.repos]);
    for (let t = 200; t <= 6000 && store.repos.length < 3; t += 200) {
      const before = store.repos;
      const n = before.length;
      runner.fastForward(t);
      if (store.repos.length !== n) {
        expect(store.repos).not.toBe(before);
        seen.add(store.repos);
      }
    }
    expect(store.repos.length).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(1);
  });
});
