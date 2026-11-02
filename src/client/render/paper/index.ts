// The 2D paper-doll HD painter: entry point. See README.md for how to add a figure.

import { Anim, type Dir } from '../contract.ts';
import { Paper, palette } from './core.ts';
import { DRAWN_DEFAULT, drawFacing, facingOf } from './facing.ts';
import { paperKindFor, paperSupports } from './registry.ts';
import { BODIES, poseAt } from './rig.ts';
// Faction figures register themselves on import.
import './templar.ts';
import './samurai.ts';
import './undead.ts';

export { paperKindFor, paperSupports, registerPaperKind, PAPER_LEVELS } from './registry.ts';
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

/**
 * Paints one frame of a faction's kind at a detail level (pixels per unit: 1 ≈ the 48 px cell,
 * 8 ≈ a 128 figure), facing `dir`, in the army's heraldic hue. Null when the paper painter does
 * not draw that slot (paperSupports). Paint an animation's frames in order on one surface: each
 * frame's anti-flicker pass follows on from the previous one.
 */
export function paintPaper(faction: string, kind: number, level: number, anim: Anim, frame: number, dir: Dir, hue: number, paper: Paper = SHARED): PaperFrame | null {
  if (!paperSupports(faction, kind, anim, dir, level)) return null;
  const k = paperKindFor(faction, kind)!;
  const body = BODIES[k.body];
  paper.begin(level, body.canvas);
  const pose = poseAt(k.keys, anim, frame);
  drawFacing(paper, facingOf(dir), k.facings ?? DRAWN_DEFAULT, (f) => k.draw(paper, pose, f, anim, frame));
  paper.contact();
  paper.clusters(k.clusterMin?.(level) ?? (level >= 8 ? 4 : 3));
  const id = `${faction}:${kind}:${level}:${anim}:${dir}:${hue}`;
  if (frame > 0 && paper.last === `${id}:${frame - 1}`) paper.steady();
  paper.keep();
  paper.last = `${id}:${frame}`;
  const shadow = (k.noShadow ?? [Anim.Die, Anim.Dead]).includes(anim) ? null : body.shadow;
  const out = paper.colours(palette(hue), shadow);
  return { width: paper.CW, height: paper.CH, pixels: new Uint8ClampedArray(out.buffer), ax: paper.FX, ay: paper.FY };
}
