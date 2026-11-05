// The Templar Marshal's skinned cloth (templar-rig.ts memoSkin) is memoised across frames, kinds
// and calls: what a thread painted before must not change its pixels.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Anim, COMMANDER_KIND, type Dir } from '../contract.ts';
import { FRAMES } from '../frames.ts';
import { paintPaper, Paper } from './index.ts';
import { clearSkinMemo } from './templar-rig.ts';

type Slot = [level: number, anim: Anim, frame: number, dir: Dir];
const SLOTS: Slot[] = [];
for (const level of [1, 2, 4, 8])
  for (let anim = 0; anim < FRAMES.length; anim++)
    for (let frame = 0; frame < FRAMES[anim]!; frame++) for (const dir of [0, 1, 2, 3] as Dir[]) SLOTS.push([level, anim as Anim, frame, dir]);

/** Each frame on its own surface (no anti-flicker carried over): only the memos carry history. */
function hash(faction: string, kind: number, [level, anim, frame, dir]: Slot): string | null {
  const f = paintPaper(faction, kind, level, anim, frame, dir, 215, new Paper());
  return f ? createHash('sha1').update(f.pixels).digest('hex') : null;
}

describe('skinned cloth memo', () => {
  it('paints the Marshal the same whatever was painted before it', () => {
    // After another kind with skinned cloth (the Knight-Brothers, mounted like the Marshal) and a
    // foot kind, in order.
    clearSkinMemo();
    for (const s of SLOTS) if (s[2] % 3 === 0) hash('templar', 7, s), hash('templar', 0, s);
    const after = SLOTS.map((s) => hash('templar', COMMANDER_KIND, s));
    // From an empty memo, back to front: each skin is first drawn from a different pose.
    clearSkinMemo();
    const fresh = SLOTS.map((_, i) => SLOTS.length - 1 - i).map((i) => [i, hash('templar', COMMANDER_KIND, SLOTS[i]!)] as const);
    let differ = 0;
    const firstDiffs: string[] = [];
    for (const [i, h] of fresh)
      if (h !== after[i]) {
        differ++;
        if (firstDiffs.length < 5) firstDiffs.push(SLOTS[i]!.join(':'));
      }
    expect(firstDiffs, `${differ} of ${SLOTS.length} frames differ`).toEqual([]);
  }, 300_000);
});
