import type { MapDef } from './api.ts';
import { buildFlowField, cellAt, type FlowField } from './flowfield.ts';
import { hexGrid } from './hexroute.ts';

export interface Derived {
  /** One flow field per site, toward its center, built the first time it is asked for. */
  flow: (FlowField | undefined)[];
}

const cache = new WeakMap<MapDef, Derived>();

/**
 * Data rebuilt identically from the map. Flow fields are pure functions of the map, so building
 * one when first needed gives the same field as building all of them up front; a 16-slot map has
 * 33 sites, and building every field at once blocked a war's start (and a viewer's first frame).
 */
export function derived(map: MapDef): Derived {
  let d = cache.get(map);
  if (!d) {
    d = { flow: new Array<FlowField | undefined>(map.sites.length) };
    cache.set(map, d);
    // Build the hex road map up front, so the first route planned mid-war costs no more than any other.
    hexGrid(map);
  }
  return d;
}

/** The flow field toward site `site`'s center. */
export function flowTo(map: MapDef, site: number): FlowField {
  const d = derived(map);
  let f = d.flow[site];
  if (!f) {
    const s = map.sites[site];
    if (!s) throw new RangeError(`no site ${site}`);
    f = buildFlowField(map, cellAt(map, s.x, s.y));
    d.flow[site] = f;
  }
  return f;
}
