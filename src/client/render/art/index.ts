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
  /**
   * Whether a kind's frames are baked. `frames` and `icon` bake an unready kind on the
   * spot; the renderer asks first and draws a pigment token meanwhile, so the first frame
   * never waits on the whole army's art.
   */
  ready(kind: Kind): boolean;
  /** Moves a kind to the front of the background bake. */
  want(kind: Kind): void;
  /** Bakes the kinds still pending, one per slice of idle time. Resolves when all are done. */
  warm(): Promise<void>;
}

/** Each kind packs onto its own atlas pages, this wide, trimmed to the rows it uses. */
const PAGE = 2048;
/** Gap between packed sprites, so mipmaps do not bleed. */
const GAP = 4;
const POSES: readonly PoseName[] = ['idle', 'walk', 'attack', 'die'];
/** Stagger, buckle, fall, lie still. */
const DIE_ANGLES = [0.2, 0.7, 1.28, 1.56];
/** Anticipation, wind-up, strike (the blow lands here), follow-through. */
const SWINGS = [-0.6, -1, 1, 0.45];
const JAWS = [0.25, 0.55, 1, 0.85];
const WIDE = new Set<number>([Kind.Knight, Kind.Outrider, Kind.Troll, Kind.BoneGolem]);

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
function paintCell(ctx: CanvasRenderingContext2D, kind: number, pose: Pose, dieIndex: number, layer: Layer, res: number, lift = 0): void {
  const spec = CELLS[kind]!;
  ctx.save();
  ctx.scale(res, res);
  ctx.translate(0, -lift);
  if (dieIndex >= 0) {
    // Fall over backwards around the feet; flyers tumble forward out of the sky.
    // Wide bodies keel over less: a horse slumps, an engine sags on a broken wheel.
    const a = DIE_ANGLES[dieIndex]! * (kind === Kind.Trebuchet ? 0.15 : WIDE.has(kind) ? 0.55 : 1);
    const fx = spec.size / 2;
    const fy = spec.feetY;
    const flyer = isFlyer(kind);
    const sink = dieIndex === 0 ? 1.5 : 0;
    ctx.translate(fx + (flyer ? a * spec.size * 0.05 : a * spec.size * 0.15), fy + sink);
    ctx.rotate(flyer ? a * 0.45 : -a);
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

/** The order kinds are warmed in: the line infantry every army fields first, legends last. */
const WARM_ORDER: readonly number[] = [
  Kind.Footman, Kind.Archer, Kind.Knight, Kind.Herald, Kind.Outrider, Kind.Wizard, Kind.Mercenary, Kind.Berserker,
  Kind.Champion, Kind.Troll, Kind.Trebuchet, Kind.BoneGolem, Kind.GriffinRider, Kind.Dragon,
];

/**
 * Builds every unit's frames, cropped and packed into per-kind atlas pages. Nothing is
 * painted up front: each kind bakes the first time it is asked for, or in the background
 * through `warm`, so the battlefield's first frame does not wait for twenty kinds of art.
 */
export function makeUnitArt(opts: { resolution?: number } = {}): UnitArt {
  const res = opts.resolution ?? 1.5;
  const maxPx = Math.ceil(192 * res);
  let scratchPair: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
  const scratchCtx = () => (scratchPair ??= canvas(maxPx, maxPx * 2));
  const cellPx = (kind: number) => Math.ceil(CELLS[kind]!.size * res);
  const baked: (UnitFrame[][] | undefined)[] = [];
  const icons: (Texture | undefined)[] = [];

  const bakeKind = (kind: number): UnitFrame[][] => {
    const [scratch, sctx] = scratchCtx();
    const packer = new Packer();
    const sprites: Sprite[] = [];
    // A fallen body must lie on the ground line, not below the cell: measure each
    // death frame on a tall canvas and lift it until its lowest point rests there.
    const lifts = new Map<number, number>();
    const liftFor = (pose: Pose, die: number): number => {
      if (die < 0) return 0;
      let l = lifts.get(die);
      if (l === undefined) {
        const px = cellPx(kind);
        sctx.clearRect(0, 0, maxPx, maxPx * 2);
        paintCell(sctx, kind, pose, die, 'body', res);
        const b = bounds(sctx, px, Math.min(maxPx * 2, px * 2));
        const ground = (CELLS[kind]!.feetY + 4) * res;
        l = b && b[3] > ground ? (b[3] - ground) / res : 0;
        lifts.set(die, l);
      }
      return l;
    };
    const bake = (pose: Pose, die: number, layer: Layer | 'sil'): number => {
      const px = cellPx(kind);
      const lift = liftFor(pose, die);
      sctx.clearRect(0, 0, maxPx, maxPx * 2);
      paintCell(sctx, kind, pose, die, layer === 'sil' ? 'body' : layer, res, lift);
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
    const table: Entry[][] = [];
    const sils: number[] = [];
    for (const name of POSES) {
      const list: Entry[] = [];
      const poses = posesFor(kind, name);
      poses.forEach((pose, i) => {
        const die = name === 'die' ? i : -1;
        list.push({
          body: bake(pose, die, 'body'),
          mask: bake(pose, die, 'mask'),
          gild: die < 0 ? [bake(pose, die, 'gild1'), bake(pose, die, 'gild2'), bake(pose, die, 'gild3')] : null,
          torn: die < 0 ? bake(pose, die, 'torn') : null,
        });
      });
      table.push(list);
      sils.push(bake(poses[0]!, name === 'die' ? 0 : -1, 'sil'));
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
    const px = cellPx(kind);
    const texOf = (index: number): Texture => {
      const s = sprites[index]!;
      return new Texture({ source: sources[s.page]!, frame: s.frame, orig: new Rectangle(0, 0, px, px), trim: s.trim });
    };
    const frames = table.map((list, pi) => {
      const sil = texOf(sils[pi]!);
      return list.map((e) => {
        const f: UnitFrame = { body: texOf(e.body), mask: texOf(e.mask), sil };
        if (e.gild) f.gild = [texOf(e.gild[0]), texOf(e.gild[1]), texOf(e.gild[2])];
        if (e.torn !== null) f.torn = texOf(e.torn);
        return f;
      });
    });
    icons[kind] = frames[0]![0]!.sil;
    return frames;
  };
  const framesOf = (kind: number): UnitFrame[][] => (baked[kind] ??= bakeKind(kind));

  const queue: number[] = [...WARM_ORDER];
  for (let k = 0; k < KIND_COUNT; k++) if (!queue.includes(k)) queue.push(k);
  let warming: Promise<void> | null = null;
  const idle = (): Promise<void> =>
    new Promise((resolve) => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 120 });
      else setTimeout(resolve, 16);
    });

  return {
    frames: (kind, pose) => framesOf(kind)[POSES.indexOf(pose)]!,
    cell: (kind) => {
      const px = cellPx(kind);
      return { w: px, h: px, feetY: CELLS[kind]!.feetY * res };
    },
    scale: (kind) => worldHeight(kind),
    flight: (kind) => (isFlyer(kind) ? { height: worldHeight(kind) * (kind === Kind.Dragon ? 0.55 : 0.45) } : null),
    icon: (kind) => {
      framesOf(kind);
      return icons[kind]!;
    },
    ready: (kind) => baked[kind] !== undefined,
    want: (kind) => {
      if (baked[kind]) return;
      const i = queue.indexOf(kind);
      if (i > 0) {
        queue.splice(i, 1);
        queue.unshift(kind);
      }
    },
    warm() {
      // Shared by every mount on the page, so an unmount does not stop it: the art outlives the field.
      warming ??= (async () => {
        while (queue.length > 0) {
          await idle();
          const kind = queue.shift()!;
          if (!baked[kind]) framesOf(kind);
        }
      })();
      return warming;
    },
  };
}

/** World height of a kind's whole cell: three size tiers, and dragons far above. */
export function worldHeight(kind: number): number {
  return 31 * Math.pow(STATS[kind]!.size / 6, 0.8);
}
