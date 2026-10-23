import { describe, expect, it } from 'vitest';
import { runReplay, type EncodedInput, type Replay } from '../sim/replay.ts';
import { buildDigest } from './digest.ts';

function replay(inputs: EncodedInput[], players = 2): Replay {
  return {
    v: 1, seed: 3, slots: 4, members: players, tickMs: 200, startsAt: 0, endsAt: 1,
    players: Array.from({ length: players }, (_, p) => ({ login: `u${p}`, id: p + 1, hue: 0, slot: p, bot: false })),
    repos: [['b/zeta', 'Go'], ['B/alpha', null], ['a/émigré', null]],
    inputs,
  };
}

describe('digest', () => {
  it('handles a quiet war: no pushes, no awards, no division by zero', () => {
    const r = replay([[0, 'join', 0, 0, 0], [0, 'join', 1, 1, 50]]);
    const d = buildDigest(runReplay(r, 20), r, []);
    expect(d.winner).toBeNull();
    expect(d.awards).toEqual([]);
    expect(d.headline).toMatch(/quiet/);
    for (const pl of d.players) expect(pl.best).toBeNull();
  });

  it('survives a world player missing from the replay header', () => {
    const world = runReplay(replay([[0, 'join', 0, 0, 0]], 1), 5);
    const headerless = replay([], 0);
    expect(buildDigest(world, headerless, []).players[0]!.login).toBe('player0');
  });

  it('orders repositories by pushes, then by plain name order, independent of locale', () => {
    const r = replay([
      [0, 'join', 0, 0, 0],
      [1, 'push', 0, 0, [30], 1, 'a'],
      [1, 'push', 0, 1, [30], 1, 'b'],
      [1, 'push', 0, 2, [30], 1, 'c'],
    ], 1);
    const d = buildDigest(runReplay(r, 5), r, []);
    expect(d.repos.map((x) => x.name)).toEqual(['B/alpha', 'a/émigré', 'b/zeta']);
  });

  it('matches the best platoon to its commit message, skipping pushes the war rejected', () => {
    const r = replay([
      [0, 'join', 0, 0, 0],
      [1, 'push', 0, -1, [30], 1, 'rejected: bad repo'],
      [1, 'push', 1, 0, [30], 1, 'rejected: not joined'],
      [2, 'push', 0, 0, [30], 1, 'first'],
      [3, 'push', 0, 0, [30], 1, 'second'],
    ], 1);
    const world = runReplay(r, 10);
    world.players[0]!.best = [0, 2, 5];
    expect(buildDigest(world, r, []).players[0]!.best).toMatchObject({ repo: 'b/zeta', ordinal: 2, message: 'second' });
  });
});
