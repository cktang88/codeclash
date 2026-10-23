import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { KIND_COUNT, type Kind } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import type { G } from './draw.ts';
import { CELLS, paintUnit, type Pose, type PoseName } from './units.ts';

export { unitIconSvg } from './svg.ts';
export type { PoseName } from './units.ts';

export interface UnitFrame {
  body: Texture;
  mask: Texture;
  sil: Texture;
}

export interface UnitArt {
  frames(kind: Kind, pose: PoseName): UnitFrame[];
  /** Cell size and feet line in texture pixels. Every frame of a kind shares it. */
  cell(kind: Kind): { w: number; h: number; feetY: number };
  /** World height of the whole cell. */
  scale(kind: Kind): number;
  /** Hover height in world units for flyers, null for walkers. */
  flight(kind: Kind): { height: number } | null;
  /** White silhouette for far-zoom glyphs; tint it. */
  icon(kind: Kind): Texture;
}

const PAGE_W = 4096;
const POSES: readonly PoseName[] = ['idle', 'walk', 'attack', 'die'];
const DIE_ANGLES = [0.4, 1.05, 1.5];
const SWINGS = [-0.6, -1, 1, 0.45];
const JAWS = [0.25, 0.55, 1, 0.85];

function isFlyer(kind: number): boolean {
  return STATS[kind]!.flying;
}

/** The poses sampled for each animation. */
export function posesFor(kind: number, name: PoseName): Pose[] {
  const rest: Pose = { pose: 'idle', stride: 0, bob: 0, swing: 0, flap: 0, jaw: 0 };
  switch (name) {
    case 'idle':
      return [0, 1].map((i) => ({ ...rest, bob: i, flap: i * 0.5 }));
    case 'walk': {
      const n = isFlyer(kind) ? 8 : 6;
      return Array.from({ length: n }, (_, i) => {
        const t = i / n;
        const s = Math.sin(t * Math.PI * 2);
        return { ...rest, pose: 'walk', stride: s, bob: Math.abs(s) * 1.6, flap: t };
      });
    }
    case 'attack':
      return SWINGS.map((swing, i) => ({ ...rest, pose: 'attack', swing, jaw: JAWS[i]!, flap: i / 4 }));
    case 'die':
      return DIE_ANGLES.map(() => ({ ...rest, pose: 'die' }));
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Paints one frame of one layer into a cell whose top-left is (x, y), at `res` texture px per logical px. */
function paintCell(ctx: CanvasRenderingContext2D, kind: number, pose: Pose, dieIndex: number, mask: boolean, x: number, y: number, res: number): void {
  const spec = CELLS[kind]!;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, spec.size * res, spec.size * res);
  ctx.clip();
  ctx.scale(res, res);
  if (dieIndex >= 0) {
    // Fall over backwards around the feet; flyers tumble forward out of the sky.
    const a = DIE_ANGLES[dieIndex]!;
    const fx = spec.size / 2;
    const fy = spec.feetY;
    ctx.translate(fx + (isFlyer(kind) ? 0 : a * spec.size * 0.16), fy);
    ctx.rotate(isFlyer(kind) ? a * 0.8 : -a);
    ctx.scale(0.88, 0.88);
    ctx.translate(-fx, -fy);
  }
  const g: G = { ctx, mask };
  paintUnit(g, kind, pose);
  ctx.restore();
}

interface Placement {
  kind: number;
  pose: PoseName;
  index: number;
  layer: 'body' | 'mask' | 'sil';
  x: number;
  y: number;
}

/** Builds every unit's frames into a single atlas page. */
export function makeUnitArt(opts: { resolution?: number } = {}): UnitArt {
  const res = opts.resolution ?? 1;
  // Shelf-pack cells, largest kinds first, each kind starting on a fresh row.
  const order = Array.from({ length: KIND_COUNT }, (_, k) => k).sort((a, b) => CELLS[b]!.size - CELLS[a]!.size || a - b);
  const placements: Placement[] = [];
  let y = 0;
  for (const kind of order) {
    const px = Math.ceil(CELLS[kind]!.size * res);
    let x = 0;
    const place = (pose: PoseName, index: number, layer: Placement['layer']) => {
      if (x + px > PAGE_W) {
        x = 0;
        y += px;
      }
      placements.push({ kind, pose, index, layer, x, y });
      x += px;
    };
    for (const pose of POSES) {
      const n = posesFor(kind, pose).length;
      for (let i = 0; i < n; i++) {
        place(pose, i, 'body');
        place(pose, i, 'mask');
      }
      place(pose, 0, 'sil');
    }
    y += px;
  }
  const [page, pctx] = canvas(PAGE_W, y);
  const [scratch, sctx] = canvas(Math.ceil(192 * res), Math.ceil(192 * res));
  for (const pl of placements) {
    const pose = posesFor(pl.kind, pl.pose)[pl.index]!;
    const die = pl.pose === 'die' ? pl.index : -1;
    if (pl.layer !== 'sil') {
      paintCell(pctx, pl.kind, pose, die, pl.layer === 'mask', pl.x, pl.y, res);
      continue;
    }
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    paintCell(sctx, pl.kind, pose, die, false, 0, 0, res);
    sctx.save();
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, scratch.width, scratch.height);
    sctx.restore();
    pctx.drawImage(scratch, pl.x, pl.y);
  }

  const source = new CanvasSource({ resource: page, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const tex = (x: number, yy: number, px: number) => new Texture({ source, frame: new Rectangle(x, yy, px, px) });
  const table: UnitFrame[][][] = Array.from({ length: KIND_COUNT }, () => POSES.map(() => []));
  const sils: Texture[][] = Array.from({ length: KIND_COUNT }, () => []);
  for (const pl of placements) {
    const px = Math.ceil(CELLS[pl.kind]!.size * res);
    const pi = POSES.indexOf(pl.pose);
    if (pl.layer === 'sil') {
      sils[pl.kind]![pi] = tex(pl.x, pl.y, px);
      continue;
    }
    const list = table[pl.kind]![pi]!;
    const f = (list[pl.index] ??= { body: Texture.EMPTY, mask: Texture.EMPTY, sil: Texture.EMPTY });
    f[pl.layer] = tex(pl.x, pl.y, px);
  }
  for (let k = 0; k < KIND_COUNT; k++) {
    POSES.forEach((_, pi) => {
      for (const f of table[k]![pi]!) f.sil = sils[k]![pi]!;
    });
  }

  return {
    frames: (kind, pose) => table[kind]![POSES.indexOf(pose)]!,
    cell: (kind) => {
      const px = Math.ceil(CELLS[kind]!.size * res);
      return { w: px, h: px, feetY: CELLS[kind]!.feetY * res };
    },
    scale: (kind) => worldHeight(kind),
    flight: (kind) => (isFlyer(kind) ? { height: worldHeight(kind) * (kind === 19 ? 0.55 : 0.45) } : null),
    icon: (kind) => sils[kind]![0]!,
  };
}

/** World height of a kind's whole cell: three size tiers, and dragons far above. */
export function worldHeight(kind: number): number {
  return 31 * Math.pow(STATS[kind]!.size / 6, 0.8);
}
