// The scene's side of the build worker (build-worker.ts): one shared worker for every city scene,
// a request per level change, and the finished Built handed back whole (its canvases turned back
// into canvas elements, its props animations named again). Unavailable (no Worker or
// OffscreenCanvas) or broken, it says so and the scene builds on the main thread instead.

import type { Art } from './buildings.ts';
import type { Built, Levels, Progress } from './build.ts';
import type { BuildReply, BuildRequest, WireArt, WireBuilt } from './build-wire.ts';
import type { Ground } from './ground.ts';
import { propAnimFn } from './props.ts';

let worker: Worker | null | undefined;
let nextScene = 1;
const remotes = new Map<number, WeakRef<RemoteBuild>>();

function shared(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined' || typeof WeakRef === 'undefined') return null;
  try {
    const w = new Worker(new URL('./build-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<BuildReply>) => {
      const r = remotes.get(e.data.scene)?.deref();
      if (r) r.receive(e.data);
      else for (const [, , , b] of e.data.bitmaps ?? []) b?.close();
    };
    w.onerror = (e) => {
      console.warn('city build worker failed; building on the main thread', e.message);
      worker = null;
      for (const r of remotes.values()) r.deref()?.fail();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

export class RemoteBuild {
  readonly scene = nextScene++;
  /** Set when the worker cannot build for this scene: the scene falls back to its own job. */
  failed = false;
  /** The key last asked for, and the finished build for it once it is in. */
  private wanted = '';
  private done: Built | null = null;
  /** Worker milliseconds of the last build. */
  lastMs = 0;
  private canvases = new Map<number, HTMLCanvasElement>();
  private artCache = new Map<string, Art>();

  private constructor(
    readonly faction: string,
    readonly hue: number,
    readonly seed: number,
  ) {
    remotes.set(this.scene, new WeakRef(this));
  }

  /** A remote for an HD scene, or null when there is no worker to be had. */
  static create(faction: string, hue: number, seed: number): RemoteBuild | null {
    return shared() ? new RemoteBuild(faction, hue, seed) : null;
  }

  request(key: string, levels: Levels, progress: Progress | undefined): void {
    const w = shared();
    if (!w || this.failed) {
      this.failed = true;
      return;
    }
    this.wanted = key;
    if (this.done?.key !== key) this.done = null;
    const m: BuildRequest = { scene: this.scene, faction: this.faction, hue: this.hue, seed: this.seed, key, levels: { ...levels }, progress: { ...(progress ?? {}) } };
    w.postMessage(m);
  }

  /** The finished build for `key`, once (null while it is still on its way). */
  take(key: string): Built | null {
    const b = this.done;
    if (!b || b.key !== key) return null;
    this.done = null;
    return b;
  }

  fail(): void {
    this.failed = true;
  }

  receive(m: BuildReply): void {
    if (m.error) {
      console.warn('city build worker:', m.error);
      this.failed = true;
      return;
    }
    // Every reply's canvases are taken in, in order, even a stale one's: the worker counts on the
    // scene holding exactly the canvases of the last build it sent.
    for (const [id, w, h, bmp] of m.bitmaps ?? []) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      if (bmp) {
        c.getContext('bitmaprenderer')!.transferFromImageBitmap(bmp);
      }
      this.canvases.set(id, c);
    }
    const b = m.built!;
    const used = new Set<number>();
    const arts = new Map<string, Art>();
    const can = (id: number): HTMLCanvasElement | null | undefined => {
      if (id === -1) return undefined;
      if (id === 0) return null;
      used.add(id);
      return this.canvases.get(id)!;
    };
    const art = (w: WireArt): Art => {
      const k = `${w.canvas}:${w.lights}:${w.night}:${w.x}:${w.y}:${w.d}:${w.pooled}`;
      let a = arts.get(k) ?? this.artCache.get(k);
      if (!a) {
        a = { canvas: can(w.canvas) as HTMLCanvasElement | null, x: w.x, y: w.y, lights: can(w.lights) as HTMLCanvasElement | null, d: w.d };
        const night = can(w.night);
        if (night !== undefined) a.night = night;
        if (w.pooled !== undefined) a.pooled = w.pooled;
      } else {
        can(w.canvas);
        can(w.lights);
        can(w.night);
      }
      arts.set(k, a);
      return a;
    };
    const built = this.unwire(b, art, can);
    for (const id of [...this.canvases.keys()]) if (!used.has(id)) this.canvases.delete(id);
    this.artCache = arts;
    this.lastMs = m.ms ?? 0;
    if (m.key === this.wanted) this.done = built;
  }

  private unwire(b: WireBuilt, art: (w: WireArt) => Art, can: (id: number) => HTMLCanvasElement | null | undefined): Built {
    const { base, crops, arts: gArts, ...rest } = b.ground;
    const ground: Ground = { ...rest, base: can(base)!, crops: crops.map((c) => can(c)!), arts: gArts.map(art) };
    const pools = can(b.pools);
    return {
      key: b.key,
      levels: b.levels,
      arts: b.arts.map(art),
      ground,
      banners: b.banners,
      torches: b.torches,
      forges: b.forges,
      glows: b.glows,
      lamps: b.lamps,
      anchors: b.anchors,
      mill: b.mill ? { art: art(b.mill.art), hub: b.mill.hub } : null,
      props: b.props
        ? {
            key: b.props.key,
            casts: b.props.casts,
            painted: {
              arts: b.props.arts.map(art),
              lamps: b.props.lamps,
              anims: b.props.anims.map((a) => ({ ...a, fn: propAnimFn(a.kind, a.flick) })),
            },
          }
        : null,
      wall: b.wall,
      pools: pools ?? null,
    };
  }
}
