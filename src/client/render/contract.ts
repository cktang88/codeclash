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
  /**
   * Falling: played once, ends on the corpse. Played backwards it is getting up (see `RISE`): a
   * painter's Die must read in reverse too, from the corpse back to standing.
   */
  Die: 6,
  /** The corpse, one frame, stamped on the ground. */
  Dead: 7,
  /**
   * The guard: braced stance, held in place: shield wall (shields locked forward), spear/pike wall
   * (spears levelled forward), crossbows behind pavises, knights with lances couched at the trot;
   * for every melee kind it is the combat-ready guard (blade cocked, katana in kamae, knees bent).
   * The renderer plays it for a regiment in a bracing stance and for any man in the fight with his
   * foe in reach between blows, and every Attack blow starts and ends on its frame 0
   * (paper/guard.ts), so blows chain from the guard without a pop.
   */
  Brace: 8,
  /**
   * Walking in his guard: the legs of the walk under the arms of the Brace (spear levelled, shield
   * up, blade cocked). The renderer plays it for a man in the fight who steps, presses, gives
   * ground or closes on a foe near at hand, where Walk would shoulder his weapon upright. Melee
   * foot kinds paint it; for every other kind the atlas answers it with Walk (as Shoot falls back
   * to Attack), so painters that have no such clip need nothing.
   */
  Advance: 9,
} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];
export const ANIM_COUNT = 10;

/**
 * Rising from the dead (the undead's "What falls, rises": game Soldier.roseAt). The renderer plays
 * Die backwards from the corpse: the figure lies still for `hold` ticks, then each frame lasts
 * `slow` times its time in the fall (a slow heave off the ground, then up: the CC0 "Skeleton Rise"
 * strip, docs/art-references/doctrines.md). A risen corpse is no longer drawn on the ground.
 */
export const RISE = { hold: 4, slow: 1.5 } as const;

/** Ticks a rise takes for a Die of `frames` frames at `ticksPerFrame`. */
export function riseTicks(frames: number, ticksPerFrame: number): number {
  return RISE.hold + Math.ceil(frames * ticksPerFrame * RISE.slow);
}

/** The Die frame to draw `since` ticks after a figure began to rise (the last frame first), or -1 once he stands. */
export function riseFrame(frames: number, ticksPerFrame: number, since: number): number {
  if (since >= riseTicks(frames, ticksPerFrame)) return -1;
  const k = Math.floor(Math.max(0, since - RISE.hold) / (ticksPerFrame * RISE.slow));
  return Math.max(0, frames - 1 - k);
}

/**
 * Regiment stances (game/battle.ts Regiment.stance): how a block stands and moves. The renderer
 * picks Brace for 'shieldwall', 'pikewall' and 'braced' when not moving, and for a fighting man
 * whose foe is in reach (his guard).
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

/**
 * How much a renderer wants an HD sheet it asks for (Atlas.sheet), most first: 'need' (a kind in
 * view, at the level the view draws), 'fallback' (a kind in view, a cheap coarse level shown
 * while the needed one paints), 'prefetch' (not drawn now: painted once nothing is needed), or
 * 'peek' (the sheet if it is painted already; never starts painting).
 */
export type SheetAsk = 'need' | 'fallback' | 'prefetch' | 'peek';

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
   * The painted box of the cell whose top-left at() returned (u, v): [x, y, w, h] relative to the
   * cell, holding every pixel of it with any alpha (w = h = 0: the cell is empty). A renderer
   * draws just that box (from u + x, v + y, its foot point at footX - x, footY - y), which shows
   * exactly what the whole cell shows, for a fraction of the fill. Null (or no `trim`): not known,
   * e.g. a strip that has not landed yet: draw the whole cell. A box once given never changes.
   */
  trim?(u: number, v: number): CellBox | null;
  /**
   * HD painters only: detail levels beyond the cell grid above (texels per map pixel, ascending,
   * e.g. 2, 4, 8). At level L a figure is L times the size it has in `image`.
   */
  levels?: readonly number[];
  /**
   * HD painters only: one kind's frames at a level, or null while it is still being painted (the
   * first call asks for it; painting happens in the background). `ask` says how much the caller
   * wants it, which orders the painting (SheetAsk; default 'need').
   */
  sheet?(kind: number, level: number, ask?: SheetAsk): KindSheet | null;
  /**
   * Bumped whenever `image` changes after it was built (an HD painter fills its grid in the
   * background); a renderer that uploaded `image` uploads it again.
   */
  version?: number;
  /**
   * HD painters only: the kinds whose strip of `image` (rows kind * 4 * cellH, 4 * cellH tall)
   * has landed, in the order they landed, so a renderer can upload just the new strips.
   */
  landed?: readonly number[];
  /** HD painters only: the index of a frame in a KindSheet's rects (Shoot falls back, Die holds). */
  slot?(kind: number, anim: Anim, frame: number, dir: Dir): number;
}

/** A cell's painted box (Atlas.trim): x, y, w, h relative to the cell. */
export type CellBox = readonly [number, number, number, number];

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
  /**
   * A first look while the rest paints (HD painters): the animations seen most are painted; Run,
   * further blows and Hit borrow Walk, the first blow and the Brace, and Die and Dead are empty
   * (w = 0: the renderer draws those frames from the grid). The whole sheet follows.
   */
  partial?: boolean;
}

/**
 * The painted box of every cols × rows cell of an RGBA strip (`width` px wide, `cellW` × `cellH`
 * cells from its top-left): four numbers a cell, row after row, as Atlas.trim gives them.
 */
export function cellBoxes(pixels: Uint8ClampedArray | Uint32Array, width: number, cellW: number, cellH: number, cols: number, rows: number): Int16Array {
  const px = pixels instanceof Uint32Array ? pixels : new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength >> 2);
  const out = new Int16Array(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let x0 = cellW, y0 = cellH, x1 = -1, y1 = -1;
      for (let y = 0; y < cellH; y++) {
        const row = (r * cellH + y) * width + c * cellW;
        for (let x = 0; x < cellW; x++) {
          // Alpha is the top byte of a little-endian RGBA pixel.
          if (px[row + x]! >>> 24 === 0) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
      const o = (r * cols + c) * 4;
      if (x1 >= 0) {
        out[o] = x0;
        out[o + 1] = y0;
        out[o + 2] = x1 - x0 + 1;
        out[o + 3] = y1 - y0 + 1;
      }
    }
  return out;
}

/**
 * Atlas.trim for an image of KIND_COUNT strips of 4 rows of cells: `land` a kind's strip (its
 * pixels, `width` px wide, so width / cellW cells a row) once it is in the image at x = 0; until
 * then its cells answer null.
 */
export function cellTrims(cellW: number, cellH: number): { land(kind: number, pixels: Uint8ClampedArray | Uint32Array, width: number): void; trim(u: number, v: number): CellBox | null } {
  const boxes: (CellBox[] | null)[] = new Array<CellBox[] | null>(KIND_COUNT).fill(null);
  const cols: number[] = new Array<number>(KIND_COUNT).fill(0);
  return {
    land(kind, pixels, width) {
      const n = Math.floor(width / cellW);
      const b = cellBoxes(pixels, width, cellW, cellH, n, 4);
      const list: CellBox[] = [];
      for (let i = 0; i < b.length; i += 4) list.push([b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!]);
      boxes[kind] = list;
      cols[kind] = n;
    },
    trim(u, v) {
      const row = Math.floor(v / cellH);
      const col = Math.floor(u / cellW);
      const kind = Math.floor(row / 4);
      const list = boxes[kind];
      if (!list || col < 0 || col >= cols[kind]!) return null;
      return list[(row % 4) * cols[kind]! + col] ?? null;
    },
  };
}

/**
 * The quad to draw for the cell whose top-left at() returned (u, v): [sx, sy, w, h, ax, ay], its
 * source in `image`, size and foot point inside it: the trimmed box when the atlas knows it,
 * else the whole cell. w = 0: nothing to draw.
 */
export function cellQuad(atlas: Atlas, u: number, v: number): [number, number, number, number, number, number] {
  const box = atlas.trim?.(u, v);
  if (!box) return [u, v, atlas.cellW, atlas.cellH, atlas.footX, atlas.footY];
  return [u + box[0], v + box[1], box[2], box[3], atlas.footX - box[0], atlas.footY - box[1]];
}

export type BuildAtlas = (faction: FactionId, hue: number) => Atlas;
