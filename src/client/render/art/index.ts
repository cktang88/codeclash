import { CanvasSource, ImageSource, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { KIND_COUNT, Kind } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import { POSES, bakeKindPages, cellPx, domCanvas, isFlyer, type KindBake } from './bake.ts';
import { CELLS, type PoseName } from './units.ts';

export { unitIconSvg } from './svg.ts';
export type { PoseName } from './units.ts';
export { posesFor } from './bake.ts';

export interface UnitFrame {
  body: Texture;
  /**
   * The figure's cut-out rim, drawn under the body: a crisp ink band hugging the silhouette and,
   * outside it, a white halo to tint (light, toward the army's pigment). Ink pops the figure on
   * light ground, the halo on dark forest and at night: it reads on every terrain.
   */
  rim: Texture;
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

/** The order kinds are warmed in: the line infantry every army fields first, legends last. */
const WARM_ORDER: readonly number[] = [
  Kind.Footman, Kind.Archer, Kind.Knight, Kind.Herald, Kind.Outrider, Kind.Wizard, Kind.Mercenary, Kind.Berserker,
  Kind.Champion, Kind.Troll, Kind.Trebuchet, Kind.BoneGolem, Kind.GriffinRider, Kind.Dragon,
];

/**
 * Wraps a kind's baked pages for the GPU: page canvases from a bake on this thread, or the
 * ImageBitmaps a worker sent.
 */
function wrapKind(bake: KindBake<HTMLCanvasElement | OffscreenCanvas | ImageBitmap>, res: number): UnitFrame[][] {
  const sources: TextureSource[] = bake.pages.map((page) => {
    if (typeof ImageBitmap !== 'undefined' && page instanceof ImageBitmap) {
      const s = new ImageSource({ resource: page, autoGenerateMipmaps: true, scaleMode: 'linear' });
      // Art outlives any one field: never let the texture collector drop it.
      s.autoGarbageCollect = false;
      return s;
    }
    return new CanvasSource({ resource: page as HTMLCanvasElement, autoGenerateMipmaps: true, scaleMode: 'linear' });
  });
  const px = cellPx(bake.kind, res);
  const texOf = (index: number): Texture => {
    const s = bake.sprites[index]!;
    return new Texture({ source: sources[s.page]!, frame: new Rectangle(s.x, s.y, s.w, s.h), orig: new Rectangle(0, 0, px, px), trim: new Rectangle(s.tx, s.ty, s.w, s.h) });
  };
  return bake.table.map((list) =>
    list.map((e) => {
      const f: UnitFrame = { body: texOf(e.body), rim: texOf(e.rim), mask: texOf(e.mask), sil: texOf(e.sil) };
      if (e.gild) f.gild = [texOf(e.gild[0]), texOf(e.gild[1]), texOf(e.gild[2])];
      if (e.torn !== null) f.torn = texOf(e.torn);
      return f;
    }),
  );
}

/** Whether kinds can bake in a worker: module workers and a 2D OffscreenCanvas. */
function canBakeOffThread(): boolean {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof ImageBitmap === 'undefined') return false;
  try {
    return new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
}

/**
 * Builds every unit's frames, cropped and packed into per-kind atlas pages. Nothing is
 * painted up front: kinds bake in the background through `warm`, in a worker on an
 * OffscreenCanvas where the browser has one (art.worker.ts), else one per slice of idle time;
 * a kind asked for before it is ready bakes on the spot. So the battlefield's first frame
 * does not wait for twenty kinds of art, and the frames after it are not broken up by them.
 */
export function makeUnitArt(opts: { resolution?: number; offThread?: boolean } = {}): UnitArt {
  const res = opts.resolution ?? 1.5;
  const baked: (UnitFrame[][] | undefined)[] = [];
  const icons: (Texture | undefined)[] = [];

  const accept = (kind: number, frames: UnitFrame[][]): UnitFrame[][] => {
    baked[kind] = frames;
    icons[kind] = frames[0]![0]!.sil;
    return frames;
  };
  const framesOf = (kind: number): UnitFrame[][] => baked[kind] ?? accept(kind, wrapKind(bakeKindPages(kind, res, domCanvas), res));

  const queue: number[] = [...WARM_ORDER];
  for (let k = 0; k < KIND_COUNT; k++) if (!queue.includes(k)) queue.push(k);
  let warming: Promise<void> | null = null;
  const idle = (): Promise<void> =>
    new Promise((resolve) => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 120 });
      else setTimeout(resolve, 16);
    });

  /** Bakes the queue in a worker, one kind at a time so `want` can reorder it. False if it could not start. */
  const warmOffThread = (): Promise<boolean> =>
    new Promise((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./art.worker.ts', import.meta.url), { type: 'module', name: 'unit-art' });
      } catch {
        resolve(false);
        return;
      }
      let started = false;
      const next = () => {
        while (queue.length > 0 && baked[queue[0]!]) queue.shift();
        const kind = queue.shift();
        if (kind === undefined) {
          worker.terminate();
          resolve(true);
          return;
        }
        worker.postMessage({ kind, res });
      };
      worker.onmessage = (e: MessageEvent<KindBake<ImageBitmap> | { kind: number; error: string }>) => {
        started = true;
        const d = e.data;
        if ('pages' in d) {
          // Baked meanwhile on the page (asked for before the worker got to it): drop the copy.
          if (baked[d.kind]) for (const b of d.pages) b.close();
          else accept(d.kind, wrapKind(d, res));
        } else queue.unshift(d.kind);
        if ('error' in d) {
          // This browser's offscreen canvas cannot paint the art: finish on the page.
          worker.terminate();
          resolve(false);
          return;
        }
        next();
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(started);
      };
      next();
    });

  return {
    frames: (kind, pose) => framesOf(kind)[POSES.indexOf(pose)]!,
    cell: (kind) => {
      const px = cellPx(kind, res);
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
        if ((opts.offThread ?? true) && canBakeOffThread() && (await warmOffThread()) && queue.every((k) => baked[k])) return;
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
