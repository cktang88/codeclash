// Which (faction, kind) pairs the paper painter draws. A faction module registers its kinds at
// load; sprites128.ts asks paperKindFor() and falls back to the ray-cast painter otherwise.

import { Anim, type Dir } from '../contract.ts';
import type { Paper } from './core.ts';
import { DRAWN_DEFAULT, facingOf, planFacing, type Facing } from './facing.ts';
import { animsOf, type BasePose, type BodyType, type KeySet } from './rig.ts';

export const PAPER_LEVELS: readonly number[] = [1, 2, 4, 8];

export interface PaperKindDef<P extends BasePose = BasePose> {
  body: BodyType;
  keys: KeySet<P>;
  /** Draws the posed figure facing `facing` (one of `facings`), back to front, on `c`. */
  draw(c: Paper, pose: P, facing: Facing, anim: Anim, frame: number): void;
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
}

const KINDS = new Map<string, PaperKind>();
const keyOf = (faction: string, kind: number) => `${faction}:${kind}`;

/** Registers (or replaces) the paper figure for a faction's unit kind (game/units.ts U, or COMMANDER_KIND). */
export function registerPaperKind<P extends BasePose>(faction: string, kind: number, def: PaperKindDef<P>): void {
  const d = def as unknown as PaperKindDef<BasePose>;
  KINDS.set(keyOf(faction, kind), { ...d, faction, kind, anims: new Set(animsOf(d.keys)) });
}

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
