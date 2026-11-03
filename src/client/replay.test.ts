import { describe, expect, it } from 'vitest';
import { replayFit } from './replay.ts';

describe('replayFit', () => {
  it('replays a battle of this version', () => {
    expect(replayFit(14, 14)).toBe('same');
  });

  it('calls a battle of an older version older', () => {
    expect(replayFit(13, 14)).toBe('older');
  });

  it('tells a page left open across a deploy that the game was updated (not that the battle is old)', () => {
    expect(replayFit(15, 14)).toBe('newer');
  });
});
