// Builds HD cities off the main thread (see build.ts, build-remote.ts): one CityBuild per scene,
// with its caches, so a level change repaints only what changed. Requests for a scene that queue
// up while a build runs are coalesced to the latest. Canvases go to the scene once each, as
// ImageBitmaps; later builds name them by id.

import './worker-dom.ts';
import { CityBuild, idOf, type Built } from './build.ts';
import type { Art } from './buildings.ts';
import type { BuildReply, BuildRequest, WireArt, WireBuilt } from './build-wire.ts';
import { HD } from './pixels.ts';
import { styleFor } from './style.ts';

interface Ctx {
  build: CityBuild;
  /** The canvas ids the scene holds (those of the last build sent). */
  sent: Set<number>;
}

const ctxs = new Map<number, Ctx>();
const queue = new Map<number, BuildRequest>();
let busy = false;

function ctxFor(r: BuildRequest): Ctx {
  let c = ctxs.get(r.scene);
  if (!c) {
    c = { build: new CityBuild(styleFor(r.faction, r.hue, true), HD, r.seed, true), sent: new Set() };
    // A few scenes at a time (the app shows one city; the preview several).
    if (ctxs.size >= 8) ctxs.delete(ctxs.keys().next().value!);
  } else ctxs.delete(r.scene);
  ctxs.set(r.scene, c);
  return c;
}

const post = (m: BuildReply, t: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, t);

async function serve(r: BuildRequest): Promise<void> {
  const t0 = performance.now();
  const ctx = ctxFor(r);
  const b = ctx.build.run(r.levels, r.progress, true);
  const ms = performance.now() - t0;
  const fresh = new Map<number, HTMLCanvasElement>();
  const used = new Set<number>();
  const cid = (c: HTMLCanvasElement | null | undefined): number => {
    if (c === undefined) return -1;
    if (c === null) return 0;
    const id = idOf(c);
    used.add(id);
    if (!ctx.sent.has(id)) fresh.set(id, c);
    return id;
  };
  const art = (a: Art): WireArt => ({ canvas: cid(a.canvas), lights: cid(a.lights), night: cid(a.night), x: a.x, y: a.y, d: a.d, ...(a.pooled !== undefined ? { pooled: a.pooled } : {}) });
  const built: WireBuilt = wire(b, art, cid);
  const bitmaps: NonNullable<BuildReply['bitmaps']> = [];
  for (const [id, c] of fresh) {
    const ok = c.width > 0 && c.height > 0;
    bitmaps.push([id, c.width, c.height, ok ? await createImageBitmap(c as unknown as OffscreenCanvas) : null]);
  }
  ctx.sent = used;
  post({ scene: r.scene, key: r.key, built, bitmaps, ms }, bitmaps.flatMap((x) => (x[3] ? [x[3]] : [])));
}

function wire(b: Built, art: (a: Art) => WireArt, cid: (c: HTMLCanvasElement | null | undefined) => number): WireBuilt {
  const { base, crops, arts, ...ground } = b.ground;
  return {
    key: b.key,
    levels: b.levels,
    arts: b.arts.map(art),
    ground: { ...ground, base: cid(base), crops: crops.map(cid), arts: arts.map(art) },
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
          arts: b.props.painted.arts.map(art),
          lamps: b.props.painted.lamps,
          anims: b.props.painted.anims.map(({ d, x, y, seed, box, kind, flick }) => ({ d, x, y, seed, box, kind: kind!, flick: flick! })),
        }
      : null,
    wall: b.wall,
    pools: cid(b.pools),
  };
}

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    while (queue.size) {
      const [scene, r] = queue.entries().next().value!;
      queue.delete(scene);
      try {
        await serve(r);
      } catch (e) {
        ctxs.delete(r.scene);
        post({ scene: r.scene, key: r.key, error: String((e as Error)?.stack ?? e) });
      }
    }
  } finally {
    busy = false;
  }
}

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  // The latest request per scene wins; the build itself waits a tick so a burst coalesces.
  queue.delete(e.data.scene);
  queue.set(e.data.scene, e.data);
  setTimeout(() => void pump(), 0);
};
