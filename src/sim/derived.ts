import type { MapDef } from './api.ts';
import { buildFlowField, cellAt, type FlowField } from './flowfield.ts';

export interface Derived {
  /** One flow field per site, toward its center. */
  flow: FlowField[];
}

const cache = new WeakMap<MapDef, Derived>();

export function derived(map: MapDef): Derived {
  let d = cache.get(map);
  if (!d) {
    d = { flow: map.sites.map((s) => buildFlowField(map, cellAt(map, s.x, s.y))) };
    cache.set(map, d);
  }
  return d;
}
