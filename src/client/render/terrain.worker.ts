// Computes the chart's pixel layers (terrain.ts, terrainPixels) off the main thread.
import type { MapDef } from '../../sim/api.ts';
import { terrainPixels } from './terrain.ts';

interface Job {
  id: number;
  map: MapDef;
  seed: number;
  maxPx: number;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const { id, map, seed, maxPx } = e.data;
  try {
    const px = terrainPixels(map, seed, maxPx);
    scope.postMessage({ id, px }, [px.field.buffer, px.water.buffer, px.lakes.v.buffer, px.grain.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
