import type { MapDef } from '../../sim/api.ts';
import type { TerrainPixels } from './terrain.ts';

// The chart's pixel layers, computed in a worker while the page starts (fonts, WebGL, sprites),
// so the first frame no longer waits for seconds of per-pixel painting on the main thread.
// Where workers are missing or fail, resolves null and paintTerrain computes them itself.

let worker: Worker | null = null;
let nextId = 1;
const jobs = new Map<number, (px: TerrainPixels | null) => void>();
const recent: { key: string; promise: Promise<TerrainPixels | null> }[] = [];

function spawn(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module', name: 'terrain' });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; px?: TerrainPixels; error?: string }>) => {
    const done = jobs.get(e.data.id);
    jobs.delete(e.data.id);
    done?.(e.data.px ?? null);
  };
  worker.onerror = () => {
    // A worker that cannot start (blocked, broken bundle): every waiting map paints on the main thread.
    for (const done of jobs.values()) done(null);
    jobs.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Starts (or joins) the computation for this map; repeated asks for one map share the result. */
export function terrainPixelsFor(map: MapDef, seed: number, maxPx: number): Promise<TerrainPixels | null> {
  const key = `${seed}:${map.slots}:${map.radius}:${maxPx}`;
  const known = recent.find((r) => r.key === key);
  if (known) return known.promise;
  const w = spawn();
  const promise: Promise<TerrainPixels | null> = w
    ? new Promise((resolve) => {
        const id = nextId++;
        jobs.set(id, resolve);
        // A worker that never answers must not hold the map back forever.
        setTimeout(() => {
          if (jobs.delete(id)) resolve(null);
        }, 15_000);
        w.postMessage({ id, map, seed, maxPx });
      })
    : Promise.resolve(null);
  recent.unshift({ key, promise });
  // The pixels are big: keep only the latest map's.
  recent.length = Math.min(recent.length, 1);
  return promise;
}
