// The interface between the sprite painter (sprites.ts) and the renderers (battle and city).
// Both sides code against this file; change it only together.

import type { FactionId } from '../../game/factions.ts';

/** Animations every figure has. Frame counts per animation come from the atlas. */
export const Anim = {
  Idle: 0,
  Walk: 1,
  /** Charging or fleeing. */
  Run: 2,
  /**
   * A melee blow. A kind may have several different blows (`Atlas.blows`); they are laid out one
   * after another in this animation's frames (see `Atlas.blows`).
   */
  Attack: 3,
  /** Loosing a missile (bows, crossbows, javelins, the engine's throw). */
  Shoot: 4,
  /** Flinching from a wound. */
  Hit: 5,
  /** Falling: played once, ends on the corpse. */
  Die: 6,
  /** The corpse, one frame, stamped on the ground. */
  Dead: 7,
  /**
   * Braced stance, held in place: shield wall (shields locked forward), spear/pike wall (spears
   * levelled forward), crossbows behind pavises, knights with lances couched at the trot. 1-2 frames.
   */
  Brace: 8,
} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];
export const ANIM_COUNT = 9;

/**
 * Regiment stances (game/battle.ts Regiment.stance): how a block stands and moves. The renderer
 * picks Brace for 'shieldwall', 'pikewall' and 'braced' when not moving.
 */
export type Stance = 'line' | 'column' | 'loose' | 'shieldwall' | 'pikewall' | 'wedge' | 'braced';

/**
 * Facing on the isometric field. 0 = toward the viewer and right (south-east), 1 = toward the
 * viewer and left (south-west), 2 = away and left (north-west), 3 = away and right (north-east).
 */
export type Dir = 0 | 1 | 2 | 3;

/** Unit classes 0..9 (game/units.ts), and the commander's own figure. */
export const COMMANDER_KIND = 10;
export const KIND_COUNT = 11;

export interface Atlas {
  /** One image holding every sprite of one army (faction + heraldic hue). */
  image: HTMLCanvasElement;
  cellW: number;
  cellH: number;
  /** The point of a cell that stands on the ground (between the feet / under the horse). */
  footX: number;
  footY: number;
  /**
   * Frames in an animation for a kind (at least 1). For Attack this is the length of ONE blow,
   * whatever `blows` says, so timing code (play once from actedAt) needs no change.
   */
  frames(kind: number, anim: Anim): number;
  /**
   * How many different melee blows a kind has (default 1 when absent). The Attack animation holds
   * `blows × frames(kind, Attack)` frames, blow after blow: frame `b * n + f` (n = frames(kind,
   * Attack), 0 <= f < n) is frame f of blow b, in `at` and `slot` alike. Frames 0..n-1 are blow 0,
   * so a renderer that never asks for a blow gets exactly what it got before. Only Attack has blows
   * (Shoot falling back to Attack uses blow 0).
   */
  blows?(kind: number): number;
  /** Ticks (0.1 s each) per frame for an animation, before the renderer's own speed-up. */
  ticksPerFrame(anim: Anim): number;
  /** Top-left of a frame's cell in `image`. */
  at(kind: number, anim: Anim, frame: number, dir: Dir): [number, number];
  /**
   * HD painters only: detail levels beyond the cell grid above (texels per map pixel, ascending,
   * e.g. 2, 4, 8). At level L a figure is L times the size it has in `image`.
   */
  levels?: readonly number[];
  /**
   * HD painters only: one kind's frames at a level, or null while it is still being painted (the
   * first call asks for it; painting happens in the background).
   */
  sheet?(kind: number, level: number): KindSheet | null;
  /**
   * Bumped whenever `image` changes after it was built (an HD painter fills its grid in the
   * background); a renderer that uploaded `image` uploads it again.
   */
  version?: number;
  /** HD painters only: the index of a frame in a KindSheet's rects (Shoot falls back, Die holds). */
  slot?(kind: number, anim: Anim, frame: number, dir: Dir): number;
}

/** One kind's frames at a detail level, each trimmed to what it covers and packed into one page. */
export interface KindSheet {
  level: number;
  width: number;
  height: number;
  /** RGBA, width × height. */
  pixels: Uint8ClampedArray;
  /** Six numbers per slot: u, v, w, h of the frame in the page, and its foot point ax, ay inside it. */
  rects: Int32Array;
  /** Milliseconds it took to paint. */
  ms: number;
}

export type BuildAtlas = (faction: FactionId, hue: number) => Atlas;
