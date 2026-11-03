// Which (faction, kind) pairs the paper painter draws. A faction module registers its kinds at
// load; sprites128.ts asks paperKindFor() and falls back to the ray-cast painter otherwise.

import { Anim, type Dir } from '../contract.ts';
import type { Paper, PaletteOpts } from './core.ts';
import { DRAWN_DEFAULT, facingOf, planFacing, type Facing } from './facing.ts';
import { animsOf, type BasePose, type BodyType, type KeySet } from './rig.ts';

export const PAPER_LEVELS: readonly number[] = [1, 2, 4, 8];

export interface PaperKindDef<P extends BasePose = BasePose> {
  body: BodyType;
  keys: KeySet<P>;
  /**
   * Draws the posed figure facing `facing` (one of `facings`), back to front, on `c`. For Attack,
   * `frame` counts within the blow and `blow` says which blow (0 for every other anim).
   */
  draw(c: Paper, pose: P, facing: Facing, anim: Anim, frame: number, blow: number): void;
  /**
   * How many melee blows the kind has, when the keys cannot say (a lazily built rig). Default:
   * `keys.attacks.length`, else 1. See README.md "Several blows".
   */
  blows?: number;
  /** Facings drawn by hand (default SE and NE); the others are mirrored. */
  facings?: readonly Facing[];
  /** Detail levels drawn (default 1, 2, 4, 8). */
  levels?: readonly number[];
  /** Cluster-merge minimum per level (default 3 below level 8, 4 at 8). */
  clusterMin?: (level: number) => number;
  /** Animations without a ground shadow (default Die and Dead). */
  noShadow?: readonly Anim[];
}

export interface PaperKind extends PaperKindDef<BasePose> {
  faction: string;
  kind: number;
  /** Animations it has keys for. */
  anims: ReadonlySet<Anim>;
  /** Melee blows (1 or more): Attack frame `b * FRAMES[Attack] + f` is frame f of blow b. */
  blows: number;
}

const KINDS = new Map<string, PaperKind>();
const keyOf = (faction: string, kind: number) => `${faction}:${kind}`;

/** Registers (or replaces) the paper figure for a faction's unit kind (game/units.ts U, or COMMANDER_KIND). */
export function registerPaperKind<P extends BasePose>(faction: string, kind: number, def: PaperKindDef<P>): void {
  const d = def as unknown as PaperKindDef<BasePose>;
  const blows = Math.max(1, Math.floor(d.blows ?? d.keys.attacks?.length ?? 1));
  KINDS.set(keyOf(faction, kind), { ...d, faction, kind, anims: new Set(animsOf(d.keys)), blows });
}

/** How many melee blows a faction's kind has (1 for a kind not on paper, or with one attack). */
export const paperBlows = (faction: string, kind: number): number => KINDS.get(keyOf(faction, kind))?.blows ?? 1;

export const paperKindFor = (faction: string, kind: number): PaperKind | undefined => KINDS.get(keyOf(faction, kind));
export const paperKinds = (): PaperKind[] => [...KINDS.values()];

/** Whether the paper painter draws this frame slot (else the ray-cast painter does). */
export function paperSupports(faction: string, kind: number, anim: Anim, dir: Dir, level: number): boolean {
  const k = KINDS.get(keyOf(faction, kind));
  if (!k) return false;
  if (!(k.levels ?? PAPER_LEVELS).includes(level)) return false;
  if (!k.anims.has(anim)) return false;
  return planFacing(facingOf(dir), k.facings ?? DRAWN_DEFAULT) !== null;
}

/**
 * How a faction's master palette is built (opt-in, additive): `perKind` gives every kind its own
 * master palette from its own codes, under the same per-level budget, instead of one palette
 * shared by the faction; the `PaletteOpts` change how colours merge. A faction that sets nothing
 * keeps the shared palette exactly as before.
 */
export interface FactionPaletteOpts extends PaletteOpts {
  perKind?: boolean;
  /** With `perKind`: options for single kinds, over the faction's. */
  kinds?: Partial<Record<number, PaletteOpts>>;
}
const PALETTE_OPTS = new Map<string, FactionPaletteOpts>();
let paletteOptsVersion = 0;
/** Sets a faction's palette options (call at module top level, like the kinds). */
export function setFactionPaletteOptions(faction: string, opts: FactionPaletteOpts): void {
  PALETTE_OPTS.set(faction, opts);
  paletteOptsVersion++;
}
export const factionPaletteOptions = (faction: string): FactionPaletteOpts | undefined => PALETTE_OPTS.get(faction);
/** Bumped whenever a faction's palette options change (palette caches key on it). */
export const factionPaletteVersion = (): number => paletteOptsVersion;
