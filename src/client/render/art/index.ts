import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { KIND_COUNT, Kind } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import type { G } from './draw.ts';
import { CELLS, paintUnit, type Pose, type PoseName } from './units.ts';

export { unitIconSvg } from './svg.ts';
export type { PoseName } from './units.ts';

export interface UnitFrame {
  body: Texture;
  mask: Texture;
  sil: Texture;
  /** Veteran trim for rank 1..3 (show only the army's rank); absent on death frames. */
  gild?: [Texture, Texture, Texture];
  /** A ragged army's wear: faded cloth, patches, tears and dents; absent on death frames. */
  torn?: Texture;
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

const PAGE = 4096;
/** Gap between packed sprites, so mipmaps do not bleed. */
const GAP = 4;
const POSES: readonly PoseName[] = ['idle', 'walk', 'attack', 'die'];
/** Stagger, buckle, fall, lie still. */
const DIE_ANGLES = [0.2, 0.7, 1.28, 1.56];
/** Anticipation, wind-up, strike (the blow lands here), follow-through. */
const SWINGS = [-0.6, -1, 1, 0.45];
const JAWS = [0.25, 0.55, 1, 0.85];

function isFlyer(kind: number): boolean {
  return STATS[kind]!.flying;
}

function gallops(kind: number): boolean {
  return kind === Kind.Knight || kind === Kind.Outrider || isFlyer(kind);
}

/** The poses sampled for each animation. */
export function posesFor(kind: number, name: PoseName): Pose[] {
  const rest: Pose = { pose: 'idle', stride: 0, bob: 0, swing: 0, flap: 0, jaw: 0, t: 0 };
  switch (name) {
    case 'idle':
      // A breath: rise and settle over the loop.
      return [0, 1, 2, 3].map((i) => {
        const t = i / 4;
        return { ...rest, t, bob: ((1 - Math.cos(t * Math.PI * 2)) / 2) * 0.9, flap: t };
      });
    case 'walk': {
      const n = gallops(kind) ? 8 : 6;
      return Array.from({ length: n }, (_, i) => {
        const t = i / n;
        const a = t * Math.PI * 2;
        // Highest when the legs pass, lowest at each footfall.
        return { ...rest, pose: 'walk', t, stride: Math.sin(a), bob: Math.abs(Math.cos(a)) * 1.6, flap: t };
      });
    }
    case 'attack':
      return SWINGS.map((swing, i) => ({ ...rest, pose: 'attack', t: i / 4, swing, jaw: JAWS[i]!, flap: i / 4 }));
    case 'die':
      return DIE_ANGLES.map((_, i) => ({ ...rest, pose: 'die', t: i / 3, swing: 0.2, flap: 0.3 + i * 0.1 }));
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

type Layer = 'body' | 'mask' | 'gild1' | 'gild2' | 'gild3' | 'torn';

/** Paints one frame of one layer into a cell at the origin, at `res` texture px per logical px. */
function paintCell(ctx: CanvasRenderingContext2D, kind: number, pose: Pose, dieIndex: number, layer: Layer, res: number): void {
  const spec = CELLS[kind]!;
  ctx.save();
  ctx.scale(res, res);
  if (dieIndex >= 0) {
    // Fall over backwards around the feet; flyers tumble forward out of the sky.
    const a = DIE_ANGLES[dieIndex]!;
    const fx = spec.size / 2;
    const fy = spec.feetY;
    const flyer = isFlyer(kind);
    const sink = dieIndex === 0 ? 1.5 : 0;
    ctx.translate(fx + (flyer ? a * spec.size * 0.05 : a * spec.size * 0.15), fy + sink);
    ctx.rotate(flyer ? a * 1.15 : -a);
    ctx.scale(0.9, 0.9);
    ctx.translate(-fx, -fy);
  }
  const g: G = layer === 'body' ? { ctx, mask: false }
    : layer === 'mask' ? { ctx, mask: true }
    : layer === 'torn' ? { ctx, mask: true, over: 'torn' }
    : { ctx, mask: true, over: 'gild', rank: Number(layer.slice(4)) };
  paintUnit(g, kind, pose);
  ctx.restore();
}

/** Tight bounds of the painted pixels, or null if the cell is empty. */
function bounds(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number, number, number] | null {
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3]! > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return [Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(w, x1 + 2), Math.min(h, y1 + 2)];
}

/** Shelf-packs cropped sprites onto as many 4096 pages as they need. */
class Packer {
  pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; used: number }[] = [];
  private x = 0;
  private y = 0;
  private shelf = 0;

  place(w: number, h: number): { page: number; x: number; y: number } {
    if (this.pages.length === 0) this.newPage();
    if (this.x + w > PAGE) {
      this.x = 0;
      this.y += this.shelf + GAP;
      this.shelf = 0;
    }
    if (this.y + h > PAGE) this.newPage();
    const at = { page: this.pages.length - 1, x: this.x, y: this.y };
    this.x += w + GAP;
    this.shelf = Math.max(this.shelf, h);
    this.pages[at.page]!.used = Math.max(this.pages[at.page]!.used, this.y + h);
    return at;
  }

  private newPage(): void {
    const [c, ctx] = canvas(PAGE, PAGE);
    this.pages.push({ canvas: c, ctx, used: 0 });
    this.x = 0;
    this.y = 0;
    this.shelf = 0;
  }
}

interface Sprite {
  page: number;
  frame: Rectangle;
  trim: Rectangle;
}

/** Builds every unit's frames, cropped and packed into atlas pages. */
export function makeUnitArt(opts: { resolution?: number } = {}): UnitArt {
  const res = opts.resolution ?? 1.5;
  const packer = new Packer();
  const maxPx = Math.ceil(192 * res);
  const [scratch, sctx] = canvas(maxPx, maxPx);
  const sprites: Sprite[] = [];

  const bake = (kind: number, pose: Pose, die: number, layer: Layer | 'sil'): number => {
    const px = Math.ceil(CELLS[kind]!.size * res);
    sctx.clearRect(0, 0, maxPx, maxPx);
    paintCell(sctx, kind, pose, die, layer === 'sil' ? 'body' : layer, res);
    if (layer === 'sil') {
      sctx.save();
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, px, px);
      sctx.restore();
    }
    const b = bounds(sctx, px, px) ?? [0, 0, 1, 1];
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    const at = packer.place(w, h);
    packer.pages[at.page]!.ctx.drawImage(scratch, b[0], b[1], w, h, at.x, at.y, w, h);
    sprites.push({ page: at.page, frame: new Rectangle(at.x, at.y, w, h), trim: new Rectangle(b[0], b[1], w, h) });
    return sprites.length - 1;
  };

  interface Entry {
    body: number;
    mask: number;
    gild: [number, number, number] | null;
    torn: number | null;
  }
  const table: Entry[][][] = [];
  const sils: number[][] = [];
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    table.push([]);
    sils.push([]);
    for (const name of POSES) {
      const list: Entry[] = [];
      const poses = posesFor(kind, name);
      poses.forEach((pose, i) => {
        const die = name === 'die' ? i : -1;
        list.push({
          body: bake(kind, pose, die, 'body'),
          mask: bake(kind, pose, die, 'mask'),
          gild: die < 0 ? [bake(kind, pose, die, 'gild1'), bake(kind, pose, die, 'gild2'), bake(kind, pose, die, 'gild3')] : null,
          torn: die < 0 ? bake(kind, pose, die, 'torn') : null,
        });
      });
      table[kind]!.push(list);
      sils[kind]!.push(bake(kind, poses[0]!, name === 'die' ? 0 : -1, 'sil'));
    }
  }

  // Trim each page to the rows it uses, then wrap them for the GPU.
  const sources = packer.pages.map((pg) => {
    let resource = pg.canvas;
    if (pg.used < PAGE) {
      const [c, ctx] = canvas(PAGE, Math.max(1, pg.used));
      ctx.drawImage(pg.canvas, 0, 0);
      resource = c;
      pg.canvas.width = pg.canvas.height = 0;
    }
    return new CanvasSource({ resource, autoGenerateMipmaps: true, scaleMode: 'linear' });
  });
  const cellPx = (kind: number) => Math.ceil(CELLS[kind]!.size * res);
  const texOf = (kind: number, index: number): Texture => {
    const s = sprites[index]!;
    const px = cellPx(kind);
    return new Texture({ source: sources[s.page]!, frame: s.frame, orig: new Rectangle(0, 0, px, px), trim: s.trim });
  };
  const frames: UnitFrame[][][] = table.map((poses, kind) =>
    poses.map((list, pi) => {
      const sil = texOf(kind, sils[kind]![pi]!);
      return list.map((e) => {
        const f: UnitFrame = { body: texOf(kind, e.body), mask: texOf(kind, e.mask), sil };
        if (e.gild) f.gild = [texOf(kind, e.gild[0]), texOf(kind, e.gild[1]), texOf(kind, e.gild[2])];
        if (e.torn !== null) f.torn = texOf(kind, e.torn);
        return f;
      });
    }),
  );
  const icons = frames.map((poses) => poses[0]![0]!.sil);

  return {
    frames: (kind, pose) => frames[kind]![POSES.indexOf(pose)]!,
    cell: (kind) => {
      const px = cellPx(kind);
      return { w: px, h: px, feetY: CELLS[kind]!.feetY * res };
    },
    scale: (kind) => worldHeight(kind),
    flight: (kind) => (isFlyer(kind) ? { height: worldHeight(kind) * (kind === Kind.Dragon ? 0.55 : 0.45) } : null),
    icon: (kind) => icons[kind]!,
  };
}

/** World height of a kind's whole cell: three size tiers, and dragons far above. */
export function worldHeight(kind: number): number {
  return 31 * Math.pow(STATS[kind]!.size / 6, 0.8);
}
