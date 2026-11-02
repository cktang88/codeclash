// The 2D paper-doll HD painter: entry point. See README.md for how to add a figure.

import { Anim, type Dir } from '../contract.ts';
import { code, figurePalette, materialCount, materialNameOf, Paper, type FigurePalette, type RGB } from './core.ts';
import { DRAWN_DEFAULT, drawFacing, facingOf, type Facing } from './facing.ts';
import { factionPaletteOptions, factionPaletteVersion, paperKindFor, paperKinds, paperSupports, type PaperKind } from './registry.ts';
import { BODIES, poseAt } from './rig.ts';
// Faction figures register themselves on import.
import './templar.ts';
import './samurai.ts';
import './undead.ts';

export { paperKindFor, paperSupports, registerPaperKind, setFactionPaletteOptions, PAPER_LEVELS } from './registry.ts';
export { Paper } from './core.ts';

export interface PaperFrame {
  width: number;
  height: number;
  /** RGBA, width × height. */
  pixels: Uint8ClampedArray;
  /** The foot point. */
  ax: number;
  ay: number;
}

/** This thread's painting surface (each worker has its own module instance). */
const SHARED = new Paper();
const SCRATCH = new Paper();

/** Draws a frame's codes on `paper` (no colours): pose, facing, mirror, contact and cluster passes. */
function drawCodes(paper: Paper, k: PaperKind, level: number, anim: Anim, frame: number, dir: Dir): void {
  paper.begin(level, BODIES[k.body].canvas);
  const pose = poseAt(k.keys, anim, frame);
  drawFacing(paper, facingOf(dir), k.facings ?? DRAWN_DEFAULT, (f: Facing) => k.draw(paper, pose, f, anim, frame));
  paper.contact();
  paper.clusters(k.clusterMin?.(level) ?? (level >= 8 ? 4 : 3));
}

/**
 * The codes a faction's paper figures paint at a level, sampled from a few representative frames
 * (front and back): the faction's master palette for that level is built from these. With `kind`
 * (factions with per-kind palettes), that kind's codes only.
 */
const USED = new Map<string, { n: number; mats: number; codes: Map<number, number> }>();
function usedCodes(faction: string, level: number, kind?: number): Map<number, number> {
  const kinds = paperKinds().filter((k) => k.faction === faction && (kind === undefined || k.kind === kind));
  const key = kind === undefined ? `${faction}:${level}` : `${faction}:${level}:k${kind}`;
  const got = USED.get(key);
  if (got && got.n === kinds.length && got.mats === materialCount()) return got.codes;
  const codes = new Map<number, number>();
  for (const k of kinds)
    for (const [anim, fr] of [[Anim.Idle, 0], [Anim.Attack, 4], [Anim.Die, 6]] as [Anim, number][])
      for (const dir of [0, 3] as Dir[]) {
        if (!paperSupports(faction, k.kind, anim, dir, level)) continue;
        drawCodes(SCRATCH, k, level, anim, fr, dir);
        SCRATCH.codes(codes);
      }
  USED.set(key, { n: kinds.length, mats: materialCount(), codes });
  return codes;
}

const PALETTES = new Map<string, { codes: Map<number, number>; v: number; fp: FigurePalette }>();
/**
 * A faction's master palette at a level for an army hue (cached). For a faction with per-kind
 * palettes (`setFactionPaletteOptions`), `kind` picks that kind's own palette.
 */
export function factionPalette(faction: string, hue: number, level: number, kind?: number): FigurePalette {
  const opts = factionPaletteOptions(faction);
  const k = opts?.perKind ? kind : undefined;
  const codes = usedCodes(faction, level, k);
  const key = k === undefined ? `${faction}:${hue}:${level}` : `${faction}:${hue}:${level}:k${k}`;
  const got = PALETTES.get(key);
  if (got && got.codes === codes && got.v === factionPaletteVersion()) return got.fp;
  const fp = figurePalette(hue, level, codes, opts);
  PALETTES.set(key, { codes, v: factionPaletteVersion(), fp });
  return fp;
}

/**
 * Paints one frame of a faction's kind at a detail level (pixels per unit: 1 ≈ the 48 px cell,
 * 8 ≈ a 128 figure), facing `dir`, in the army's heraldic hue. Null when the paper painter does
 * not draw that slot (paperSupports). Paint an animation's frames in order on one surface: each
 * frame's anti-flicker pass follows on from the previous one.
 */
export function paintPaper(faction: string, kind: number, level: number, anim: Anim, frame: number, dir: Dir, hue: number, paper: Paper = SHARED): PaperFrame | null {
  if (!paperSupports(faction, kind, anim, dir, level)) return null;
  const k = paperKindFor(faction, kind)!;
  const fp = factionPalette(faction, hue, level, kind);
  drawCodes(paper, k, level, anim, frame, dir);
  const id = `${faction}:${kind}:${level}:${anim}:${dir}:${hue}`;
  if (frame > 0 && paper.last === `${id}:${frame - 1}`) paper.steady();
  paper.keep();
  paper.last = `${id}:${frame}`;
  const out = paper.colours(fp);
  return { width: paper.CW, height: paper.CH, pixels: new Uint8ClampedArray(out.buffer), ax: paper.FX, ay: paper.FY };
}

/**
 * For the pixel lint (scripts/pixel-lint/painters.ts): every material ramp a faction's paper
 * figures use, as painted at each level (five tones), with its dark outline colour.
 */
export function paperLintPalette(faction: string, hue: number): { name: string; level: number; tones: RGB[]; edge: RGB }[] {
  const out: { name: string; level: number; tones: RGB[]; edge: RGB }[] = [];
  const kinds = paperKinds().filter((k) => k.faction === faction).map((k) => k.kind);
  if (!kinds.length) return out;
  // Per-kind palettes: every kind's ramps in turn (a colour is then credited to the kind and
  // material that paints it, unless an earlier kind paints the very same colour).
  const sets: (number | undefined)[] = factionPaletteOptions(faction)?.perKind ? kinds.sort((a, b) => a - b) : [undefined];
  for (const level of [1, 2, 4, 8])
    for (const kind of sets) {
      const fp = factionPalette(faction, hue, level, kind);
      const mats = [...new Set([...usedCodes(faction, level, kind).keys()].map((c) => c >> 3))].sort((a, b) => a - b);
      for (const m of mats) {
        const tones = [0, 1, 2, 3, 4].map((t) => fp.rgb[fp.fillOf[code(m, t)]!]!);
        out.push({ name: materialName(m), level, tones, edge: fp.rgb[fp.dark[fp.fillOf[code(m, 2)]!]!]! });
      }
    }
  return out;
}

/** A material's short name (the part after the faction prefix), as the lint's exemptions expect. */
const materialName = (m: number): string => materialNameOf(m).replace(/^.*\./, '');
