import { describe, expect, it } from 'vitest';
import { Chronicler, type ChronicleEntry } from '../sim/chronicle.ts';
import { generateMap } from '../sim/mapgen.ts';
import { decodeInput, replayParams, runReplay, type EncodedInput, type Replay } from '../sim/replay.ts';
import { createWorld, step } from '../sim/world.ts';
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

  it('names the push that raised the best platoon even when one push raised several platoons', () => {
    const r = replay([
      [0, 'join', 0, 0, 0],
      // Big enough to march as two platoons (ordinals I and II).
      [1, 'push', 0, 0, [3000, 10], 1, 'feat: the big one', 40, 100],
      [3, 'push', 0, 0, [0, 10], 1, 'docs: nothing new to raise'],
      [5, 'push', 0, 0, [2000], 1, 'second', 20, 50],
    ], 1);
    const world = createWorld(replayParams(r), generateMap(replayParams(r)));
    const chronicler = new Chronicler({ player: (p) => `u${p}`, repo: (i) => r.repos[i]![0] });
    const chronicle: ChronicleEntry[] = [];
    const inputs = r.inputs.map((e) => decodeInput(e));
    while (world.tick < 10) {
      const due = inputs.filter((x) => x.tick === world.tick).map((x) => x.input);
      chronicle.push(...chronicler.narrate(world, due, step(world, due)));
    }
    const last = world.players[0]!.battalions[0]![1];
    expect(last).toBeGreaterThanOrEqual(3);
    world.players[0]!.best = [0, last, 5];
    expect(buildDigest(world, r, chronicle).players[0]!.best).toMatchObject({ ordinal: last, message: 'second' });
    world.players[0]!.best = [0, 2, 5];
    expect(buildDigest(world, r, chronicle).players[0]!.best).toMatchObject({ ordinal: 2, message: 'feat: the big one' });
  });

  it('lists only repositories of pushes the war accepted', () => {
    const r = replay([
      [0, 'join', 0, 0, 0],
      [1, 'push', 0, -1, [30], 1, 'bad repo'],
      [1, 'push', 1, 1, [30], 1, 'not joined'],
      [2, 'push', 0, 0, [30], 1, 'ok'],
    ], 1);
    const d = buildDigest(runReplay(r, 5), r, []);
    expect(d.repos).toEqual([{ name: 'b/zeta', language: 'Go', pushes: 1, p: 0 }]);
  });
});
