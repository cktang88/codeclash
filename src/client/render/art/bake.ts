// Baking unit art: every pose of every layer of a kind, painted, cut out, cropped and packed onto
// atlas pages. Free of the DOM and of Pixi: canvases come from a factory, so the same code bakes
// on the page (HTMLCanvasElement) or in a worker on an OffscreenCanvas (art.worker.ts).
import { Kind } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import type { G } from './draw.ts';
import { CELLS, paintUnit, type Pose, type PoseName } from './units.ts';

/** A 2D canvas of either kind, and its context. */
export type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type MakeCanvas = (w: number, h: number) => [Canvas2D, Ctx2D];

export const domCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

export const offscreenCanvas: MakeCanvas = (w, h) => {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

/** Each kind packs onto its own atlas pages, this wide, trimmed to the rows it uses. */
const PAGE = 2048;
/** Gap between packed sprites, so mipmaps do not bleed. */
const GAP = 4;
export const POSES: readonly PoseName[] = ['idle', 'walk', 'attack', 'die'];
/** Stagger, buckle, fall, lie still. */
const DIE_ANGLES = [0.2, 0.7, 1.28, 1.56];
/** Anticipation, wind-up, strike (the blow lands here), follow-through. */
const SWINGS = [-0.6, -1, 1, 0.45];
const JAWS = [0.25, 0.55, 1, 0.85];
const WIDE = new Set<number>([Kind.Knight, Kind.Outrider, Kind.Troll, Kind.BoneGolem]);

export function isFlyer(kind: number): boolean {
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


type Layer = 'body' | 'mask' | 'gild1' | 'gild2' | 'gild3' | 'torn';

/** Paints one frame of one layer into a cell at the origin, at `res` texture px per logical px. */
function paintCell(ctx: Ctx2D, kind: number, pose: Pose, dieIndex: number, layer: Layer, res: number, lift = 0): void {
  const spec = CELLS[kind]!;
  ctx.save();
  ctx.scale(res, res);
  ctx.translate(0, -lift);
  if (dieIndex >= 0) {
    // Fall over backwards around the feet; flyers tumble forward out of the sky.
    // Wide bodies keel over less: a horse slumps, an engine sags on a broken wheel.
    const a = DIE_ANGLES[dieIndex]! * (kind === Kind.Trebuchet || kind === Kind.Ballista ? 0.15 : WIDE.has(kind) ? 0.55 : 1);
    const fx = spec.size / 2;
    const fy = spec.feetY;
    const flyer = isFlyer(kind);
    const sink = dieIndex === 0 ? 1.5 : 0;
    ctx.translate(fx + (flyer ? a * spec.size * 0.05 : a * spec.size * 0.15), fy + sink);
    ctx.rotate(flyer ? a * 0.45 : -a);
    ctx.scale(0.9, 0.9);
    ctx.translate(-fx, -fy);
  }
  // The offscreen context draws exactly as the page's; the art only uses the drawing calls both have.
  const c = ctx as CanvasRenderingContext2D;
  const g: G = layer === 'body' ? { ctx: c, mask: false }
    : layer === 'mask' ? { ctx: c, mask: true }
    : layer === 'torn' ? { ctx: c, mask: true, over: 'torn' }
    : { ctx: c, mask: true, over: 'gild', rank: Number(layer.slice(4)) };
  paintUnit(g, kind, pose);
  ctx.restore();
}

/** Rim widths in logical art pixels beyond the figure's own outline: the ink band, then the halo. */
const RIM_INK = 2.2;
const RIM_HALO = 7;
/**
 * Replaces the figure painted at the cell origin of `ctx` with its rim: the silhouette dilated
 * by the halo width in white, then by the ink width in ink. The body is drawn over it at runtime.
 * `scratch` holds two canvases at least `px` square.
 */
function rimInto(ctx: Ctx2D, px: number, res: number, scratch: [Canvas2D, Ctx2D, Canvas2D, Ctx2D]): void {
  const [sil, silCtx, out, outCtx] = scratch;
  silCtx.clearRect(0, 0, sil.width, sil.height);
  silCtx.drawImage(ctx.canvas, 0, 0, px, px, 0, 0, px, px);
  silCtx.globalCompositeOperation = 'source-in';
  silCtx.fillStyle = '#fff';
  silCtx.fillRect(0, 0, px, px);
  silCtx.globalCompositeOperation = 'source-over';
  outCtx.clearRect(0, 0, out.width, out.height);
  const stamp = (r: number, n: number) => {
    for (const k of [1, 0.5]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 0.4;
        outCtx.drawImage(sil, Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
    }
  };
  stamp(RIM_HALO * res, 20);
  // Recolour the silhouette ink, then stamp the inner band.
  silCtx.globalCompositeOperation = 'source-in';
  silCtx.fillStyle = INK_RIM;
  silCtx.fillRect(0, 0, px, px);
  silCtx.globalCompositeOperation = 'source-over';
  stamp(RIM_INK * res, 12);
  outCtx.drawImage(sil, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.drawImage(out, 0, 0, px, px, 0, 0, px, px);
}
const INK_RIM = '#1a120b';

/** Tight bounds of the painted pixels, or null if the cell is empty. */
function bounds(ctx: Ctx2D, w: number, h: number): [number, number, number, number] | null {
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
  pages: { canvas: Canvas2D; ctx: Ctx2D; used: number }[] = [];

  constructor(private readonly mk: MakeCanvas) {}
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
    const [c, ctx] = this.mk(PAGE, PAGE);
    this.pages.push({ canvas: c, ctx, used: 0 });
    this.x = 0;
    this.y = 0;
    this.shelf = 0;
  }
}

/** Where a baked sprite sits on its page, and its trim (its offset in the full cell). */
export interface SpriteRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
}

/** One frame's layers, as indices into `sprites`. */
export interface BakedEntry {
  body: number;
  rim: number;
  sil: number;
  mask: number;
  gild: [number, number, number] | null;
  torn: number | null;
}

/** A kind's art: its pages (trimmed to the rows used), the sprites on them, and the frames by pose (POSES order). */
export interface KindBake<C = Canvas2D> {
  kind: number;
  pages: C[];
  sprites: SpriteRect[];
  table: BakedEntry[][];
}

export function cellPx(kind: number, res: number): number {
  return Math.ceil(CELLS[kind]!.size * res);
}

/** Paints, cuts out, crops and packs every frame of one kind. */
export function bakeKindPages(kind: number, res: number, mk: MakeCanvas): KindBake {
  const maxPx = Math.ceil(192 * res);
  const [scratch, sctx] = mk(maxPx, maxPx * 2);
  const px = cellPx(kind, res);
  const [ra, ractx] = mk(px, px);
  const [rb, rbctx] = mk(px, px);
  const rimScratch: [Canvas2D, Ctx2D, Canvas2D, Ctx2D] = [ra, ractx, rb, rbctx];
  const packer = new Packer(mk);
  const sprites: SpriteRect[] = [];
  // A fallen body must lie on the ground line, not below the cell: measure each
  // death frame on a tall canvas and lift it until its lowest point rests there.
  const lifts = new Map<number, number>();
  const liftFor = (pose: Pose, die: number): number => {
    if (die < 0) return 0;
    let l = lifts.get(die);
    if (l === undefined) {
      sctx.clearRect(0, 0, maxPx, maxPx * 2);
      paintCell(sctx, kind, pose, die, 'body', res);
      const b = bounds(sctx, px, Math.min(maxPx * 2, px * 2));
      const ground = (CELLS[kind]!.feetY + 4) * res;
      l = b && b[3] > ground ? (b[3] - ground) / res : 0;
      lifts.set(die, l);
    }
    return l;
  };
  const bake = (pose: Pose, die: number, layer: Layer | 'sil' | 'rim'): number => {
    const lift = liftFor(pose, die);
    sctx.clearRect(0, 0, maxPx, maxPx * 2);
    paintCell(sctx, kind, pose, die, layer === 'sil' || layer === 'rim' ? 'body' : layer, res, lift);
    if (layer === 'rim') rimInto(sctx, px, res, rimScratch);
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
    sprites.push({ page: at.page, x: at.x, y: at.y, w, h, tx: b[0], ty: b[1] });
    return sprites.length - 1;
  };
  const table: BakedEntry[][] = [];
  for (const name of POSES) {
    const list: BakedEntry[] = [];
    posesFor(kind, name).forEach((pose, i) => {
      const die = name === 'die' ? i : -1;
      list.push({
        body: bake(pose, die, 'body'),
        rim: bake(pose, die, 'rim'),
        sil: bake(pose, die, 'sil'),
        mask: bake(pose, die, 'mask'),
        gild: die < 0 ? [bake(pose, die, 'gild1'), bake(pose, die, 'gild2'), bake(pose, die, 'gild3')] : null,
        torn: die < 0 ? bake(pose, die, 'torn') : null,
      });
    });
    table.push(list);
  }
  // Trim each page to the rows it uses.
  const pages = packer.pages.map((pg) => {
    if (pg.used >= PAGE) return pg.canvas;
    const [c, ctx] = mk(PAGE, Math.max(1, pg.used));
    ctx.drawImage(pg.canvas, 0, 0);
    pg.canvas.width = pg.canvas.height = 0;
    return c;
  });
  return { kind, pages, sprites, table };
}

/** How one standing figure is dressed for a portrait. */
export interface PortraitLook {
  /** The army's actor pigment, for the cloth (CSS color). */
  tint: string;
  /** The rim's halo, the pigment mixed toward light (CSS color). */
  halo: string;
  /** Veteran rank shown as gilding, 0–3. */
  rank: number;
  /** A ragged army's faded, torn cloth instead of gilding. */
  ragged: boolean;
}

/** Multiplies the painted pixels of `canvas` by `color`, keeping their alpha (a Pixi tint, on a 2D canvas). */
function tintInto(canvas: Canvas2D, ctx: Ctx2D, color: string, mk: MakeCanvas): void {
  const { width: w, height: h } = canvas;
  const [keep, keepCtx] = mk(w, h);
  keepCtx.drawImage(canvas, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(keep, 0, 0);
  ctx.restore();
}

/**
 * One standing figure as the battlefield draws it, flattened onto a single 2D canvas for pages
 * and the HUD: the cut-out rim (ink band, halo tinted toward the pigment), the body, the cloth in
 * the army's pigment, and a veteran's gilding or a ragged army's wear over it, cropped to the
 * figure. The same layers the field stacks as sprites, so a portrait is the soldier in the field.
 */
export function paintPortrait(kind: number, look: PortraitLook, res: number, mk: MakeCanvas): Canvas2D {
  const px = cellPx(kind, res);
  const pose = posesFor(kind, 'idle')[0]!;
  const layer = (name: Layer | 'rim', color?: string): Canvas2D => {
    const [c, ctx] = mk(px, px);
    paintCell(ctx, kind, pose, -1, name === 'rim' ? 'body' : name, res);
    if (name === 'rim') {
      const [ra, ractx] = mk(px, px);
      const [rb, rbctx] = mk(px, px);
      rimInto(ctx, px, res, [ra, ractx, rb, rbctx]);
    }
    if (color) tintInto(c, ctx, color, mk);
    return c;
  };
  const [out, octx] = mk(px, px);
  octx.drawImage(layer('rim', look.halo), 0, 0);
  octx.drawImage(layer('body'), 0, 0);
  octx.drawImage(layer('mask', look.tint), 0, 0);
  const rank = Math.max(0, Math.min(3, Math.floor(look.rank)));
  if (look.ragged) octx.drawImage(layer('torn'), 0, 0);
  else if (rank > 0) octx.drawImage(layer(`gild${rank}` as Layer), 0, 0);
  const b = bounds(octx, px, px) ?? [0, 0, px, px];
  const [crop, cctx] = mk(b[2] - b[0], b[3] - b[1]);
  cctx.drawImage(out, b[0], b[1], b[2] - b[0], b[3] - b[1], 0, 0, b[2] - b[0], b[3] - b[1]);
  return crop;
}
