// Rigs are built on first use (skeleton.ts lazySkeletonKind): loading the painter, asking for blow
// counts and frame support builds none, and every rig, once built, is what its kind declared.

import { describe, expect, it } from 'vitest';
import { Anim, ANIM_COUNT, type Dir } from '../contract.ts';
import { paintPaper, paperBlows, paperKindFor, paperSupports, Paper } from './index.ts';
import { lazyRigsBuilt } from './skeleton.ts';

const FACTIONS = ['templar', 'samurai', 'undead'] as const;

describe('lazily built rigs', () => {
  it('loading the painter and asking about kinds builds no rig', () => {
    for (const f of FACTIONS)
      for (let k = 0; k < 11; k++) {
        expect(paperKindFor(f, k), `${f} ${k}`).toBeDefined();
        paperBlows(f, k);
        for (let a = 0; a < ANIM_COUNT; a++) for (const d of [0, 1, 2, 3] as Dir[]) paperSupports(f, k, a as Anim, d, 8);
      }
    expect(lazyRigsBuilt()).toBe(0);
  });

  it('builds each rig once, on first use, matching its declared body, anims, blows and facings', () => {
    // Painting a frame builds the rigs it needs (its kind's; a faction with one shared palette
    // samples all its kinds for the palette, so builds them all) and checks each against its
    // declared shape: a mismatch throws.
    for (const f of FACTIONS)
      for (let k = 0; k < 11; k++) {
        expect(() => paintPaper(f, k, 1, Anim.Idle, 0, 0, 215, new Paper()), `${f} ${k}`).not.toThrow();
        expect(() => paintPaper(f, k, 2, Anim.Attack, 3 + 12 * (paperBlows(f, k) - 1), 3, 215, new Paper()), `${f} ${k}`).not.toThrow();
      }
    // All 33 kinds are lazy rigs, each built exactly once.
    expect(lazyRigsBuilt()).toBe(33);
  }, 120_000);
});
