// Frame counts and timing shared by the HD painters (sprites128.ts and paper/): every painter
// fills the same slots, so a kind can switch painter without the atlas noticing.

import { Anim } from './contract.ts';

/** Painted frames per animation (indexed by Anim): smooth, ~20-24 fps playback. */
export const FRAMES = [8, 12, 12, 12, 12, 5, 12, 1, 8, 12] as const;
/** Ticks (0.1 s) per frame, indexed by Anim. */
export const TICKS = [2, 0.5, 0.42, 0.42, 0.5, 0.6, 0.42, 1, 1, 0.5] as const;
/** Animations that cycle (the rest play once). */
export const LOOPS: ReadonlySet<number> = new Set<number>([Anim.Idle, Anim.Walk, Anim.Run, Anim.Brace, Anim.Advance]);
