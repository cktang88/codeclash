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

describe('seeking off the main thread', () => {
  it('reaches the same world and tells the same chronicle as stepping the replay here', async () => {
    const { runSeek } = await import('./seekcore.ts');
    const { checksum, restore: restoreSnap } = await import('../../sim/snapshot.ts');
    const { startReplay: start } = await import('./local.ts');
    const { GameStore: Store } = await import('../store.ts');
    const { encodeInput } = await import('../../sim/replay.ts');
    const players = [{ login: 'ana', id: 1, hue: 10, slot: 0, bot: false }, { login: 'bo', id: 2, hue: 200, slot: 1, bot: false }];
    const push = (p: number, code: number) => ({ kind: 'push' as const, p, repo: p, lines: [code, 20, 5, 0, 0, 10, 0, 0, 3], commits: 1, msg: 'feat: x', files: 3, branches: 12, churn: 0, filler: 0 });
    const inputs = [
      encodeInput(0, { kind: 'join', p: 0, slot: 0, hue: 10 }),
      encodeInput(0, { kind: 'join', p: 1, slot: 1, hue: 200 }),
      encodeInput(5, push(0, 220)),
      encodeInput(9, push(1, 260)),
      encodeInput(160, push(0, 400)),
    ];
    const replay = { v: 1 as const, seed: 9, slots: 4, members: 2, tickMs: 200, startsAt: 0, endsAt: 3600_000, players, repos: [['ana/a', 'TypeScript'], ['bo/b', 'Go']] as [string, string][], inputs };
    const store = new Store();
    const here = start(store, replay);
    here.fastForward(120);
    // Continue from a mid-way world, as a forward seek does.
    const there = runSeek({ replay, from: (await import('../../sim/snapshot.ts')).snapshot(store.world!), to: 400, players: players.map((p) => p.login), repos: replay.repos.map((r) => r[0]), keep: 400 });
    const before = store.chronicle.length;
    here.fastForward(400);
    expect(checksum(restoreSnap(there.snapshot))).toBe(checksum(store.world!));
    expect(there.chronicle).toEqual(store.chronicle.slice(before));
  });
});
