// The interface between the sprite painter (sprites.ts) and the renderers (battle and city).
// Both sides code against this file; change it only together.

import type { FactionId } from '../../game/factions.ts';

/** Animations every figure has. Frame counts per animation come from the atlas. */
export const Anim = {
  Idle: 0,
  Walk: 1,
  /** Charging or fleeing. */
  Run: 2,
  /** A melee blow. */
  Attack: 3,
  /** Loosing a missile (bows, crossbows, javelins, the engine's throw). */
  Shoot: 4,
  /** Flinching from a wound. */
  Hit: 5,
  /** Falling: played once, ends on the corpse. */
  Die: 6,
  /** The corpse, one frame, stamped on the ground. */
  Dead: 7,
} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];
export const ANIM_COUNT = 8;

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
  /** Frames in an animation for a kind (at least 1). */
  frames(kind: number, anim: Anim): number;
  /** Ticks (0.1 s each) per frame for an animation, before the renderer's own speed-up. */
  ticksPerFrame(anim: Anim): number;
  /** Top-left of a frame's cell in `image`. */
  at(kind: number, anim: Anim, frame: number, dir: Dir): [number, number];
}

export type BuildAtlas = (faction: FactionId, hue: number) => Atlas;
