// What the city scene draws from, built for a set of building levels: every building's art, the
// props, the ground, the mill, the night's light pools, and the anchors life and the lights use.
//
// The build is a job (a generator, like ground-hd.ts groundSteps) that yields between pieces of
// work, so it can be run at once (the first paint, classic), a slice per frame on the main thread,
// or whole in the build worker (build-worker.ts). Only what changed is repainted: each piece is
// cached by what it depends on (a building by its key, level and scaffolding; the props by the
// footprints and tiers; the ground by its key and the shadows; the pools by the arts and lights).
// The scene keeps drawing the last finished Built until the next one is done, then swaps it in
// whole, so the city never shows half a rebuild. Whichever way it runs, the result is the same.

import { BUILDINGS, type BuildingKey } from '../../../game/city.ts';
import { paintBuilding, paintMill, rigFor, tierOf, wallHeights, type Art, type Banner, type BuildingParts } from './buildings.ts';
import { paintGround, type Ground } from './ground.ts';
import { groundKey, groundSteps, treesFor } from './ground-hd.ts';
import type { Footprint, Frame } from './pixels.ts';
import { lightPoolSteps, poolSources } from './pools.ts';
import { paintProps, placeProps, propShadows, shadowAt, sunFor, type PaintedProps } from './props.ts';
import type { CityStyle } from './style.ts';
import './samurai.ts';
import './undead.ts';

export type Levels = Record<BuildingKey, number>;
export type Progress = Partial<Record<BuildingKey, number>>;

export interface Torch {
  x: number;
  y: number;
}

export interface Anchors {
  smoke: [number, number][];
  forges: [number, number][];
  targets: [number, number][];
  stalls: [number, number][];
  bells: [number, number][];
}

export interface PropsBuilt {
  key: string;
  casts: Footprint[];
  painted: PaintedProps;
}

/** A finished build: everything the scene draws that depends on the levels. */
export interface Built {
  /** The scene's key it was built for (levels and scaffolding). */
  key: string;
  levels: Levels;
  /** Ground uprights (trees, fences), buildings, props, then the mill: the order the old rebuild used. */
  arts: Art[];
  ground: Ground;
  banners: Banner[];
  torches: Torch[];
  forges: [number, number][];
  glows: [number, number, number][];
  /** Props lanterns, then the buildings' lamps. */
  lamps: [number, number][];
  anchors: Anchors;
  mill: { art: Art; hub: [number, number] | null } | null;
  props: PropsBuilt | null;
  wall: { front: number; back: number };
  /** HD (not the necropolis): the night's light pools; null when not made yet (the scene makes them when night falls). */
  pools: HTMLCanvasElement | null;
}

const KEYS: (BuildingKey | 'keep')[] = ['keep', ...BUILDINGS.map((b) => b.key)];

/** The scene's cache key for a set of levels and scaffolding (repaint only when one of them changes). */
export function sceneKey(levels: Levels, progress: Progress | undefined): string {
  const scaffold = Object.entries(progress ?? {})
    .filter(([, p]) => (p ?? 0) > 0.45)
    .map(([k]) => k)
    .sort()
    .join(',');
  return JSON.stringify(levels) + '|' + scaffold;
}

let nextId = 1;
const ids = new WeakMap<object, number>();
/** A stable id per object (an art's canvas), for the cache keys. */
export function idOf(o: object): number {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = nextId++));
  return id;
}

/** Builds for one scene (one faction, hue, seed and art mode), with its caches. */
export class CityBuild {
  /** Per building: its parts by `key:level:rising`, the last two kept (a level and the one before). */
  private parts = new Map<string, BuildingParts>();
  private mills = new Map<number, { art: Art; hub: [number, number] | null }>();
  private propsC: PropsBuilt | null = null;
  private grounds: { key: string; ground: Ground }[] = [];
  private poolsC: { key: string; canvas: HTMLCanvasElement } | null = null;

  constructor(
    readonly st: CityStyle,
    readonly frame: Frame,
    readonly seed: number,
    readonly hd: boolean,
  ) {}

  /** The whole build at once. */
  run(levels: Levels, progress: Progress | undefined, pools: boolean): Built {
    const job = this.steps(levels, progress, pools);
    let r = job.next();
    while (!r.done) r = job.next();
    return r.value;
  }

  private part(k: BuildingKey | 'keep', level: number, progress: number): { p: BuildingParts; fresh: boolean } {
    const rising = progress > 0.45 ? 1 : 0;
    const key = `${k}:${level}:${rising}`;
    let p = this.parts.get(key);
    if (p) {
      // Most recent last.
      this.parts.delete(key);
      this.parts.set(key, p);
      return { p, fresh: false };
    }
    p = paintBuilding(k, { st: this.st, level, progress, seed: this.seed }, this.frame);
    const mine = [...this.parts.keys()].filter((old) => old.startsWith(k + ':'));
    for (const old of mine.slice(0, Math.max(0, mine.length - 1))) this.parts.delete(old);
    this.parts.set(key, p);
    return { p, fresh: true };
  }

  /**
   * The build as a job: yields after each piece of real work (a building painted, the props placed
   * or painted, a band of ground, a slice of the pools), never after a cache hit. `pools`: make the
   * night's light pools too (HD, not the necropolis).
   */
  *steps(levels: Levels, progress: Progress | undefined, pools: boolean): Generator<void, Built> {
    const st = this.st;
    const hd = this.hd;
    const key = sceneKey(levels, progress);
    const maxLevel = Math.max(0, ...BUILDINGS.map((b) => levels[b.key] ?? 0));
    const banners: Banner[] = [];
    const torches: Torch[] = [];
    const smoke: [number, number][] = [];
    const forges: [number, number][] = [];
    const bells: [number, number][] = [];
    const stalls: [number, number][] = [];
    const targets: [number, number][] = [];
    const glows: [number, number, number][] = [];
    const buildingArts: Art[] = [];
    const footprints: Partial<Record<BuildingKey | 'keep', Footprint[]>> = {};
    const buildingLamps: [number, number][] = [];
    for (const k of KEYS) {
      const level = k === 'keep' ? maxLevel : levels[k] ?? 0;
      const { p, fresh } = this.part(k, level, k === 'keep' ? 0 : progress?.[k] ?? 0);
      buildingArts.push(...p.arts);
      banners.push(...p.banners);
      torches.push(...p.torches.map(([x, y]) => ({ x, y })));
      smoke.push(...p.smoke);
      forges.push(...p.forges);
      bells.push(...p.bells);
      stalls.push(...p.stalls);
      targets.push(...p.targets);
      if (p.glows) glows.push(...p.glows);
      footprints[k] = p.footprints ?? [];
      if (p.lamps) buildingLamps.push(...p.lamps);
      if (fresh) yield;
    }
    let props: PropsBuilt | null = null;
    let ground: Ground;
    if (hd) {
      // The props and clutter (city/props.ts), placed clear of what the buildings recorded on the
      // ground; their footprints and the buildings' make the cast shadows on the ground. They
      // depend on the footprints and on every building's tier (and the highest).
      const built = Object.values(footprints).flat() as Footprint[];
      const tiers = KEYS.map((k) => tierOf(k === 'keep' ? Math.max(1, maxLevel) : levels[k] ?? 0)).join('') + tierOf(maxLevel);
      const propsKey = built.map((f) => f.map((x) => Math.round(x)).join(',')).join(';') + '|' + tiers;
      if (this.propsC?.key !== propsKey) {
        const placed = placeProps({ faction: st.id, seed: this.seed, levels, footprints, clear: treesFor(st.id).map(([u, v, r]) => [u, v, r * 0.7] as [number, number, number]) });
        yield;
        const painted = paintProps(placed, st, this.frame, (u, v) => shadowAt(u, v, built, sunFor(st.id).dir), rigFor(st.id));
        this.propsC = { key: propsKey, casts: [...built, ...propShadows(placed)], painted };
        yield;
      }
      props = this.propsC;
      const gk = groundKey(st, levels, maxLevel) + '|' + propsKey.length + ':' + hashStr(propsKey);
      const g = this.grounds.find((x) => x.key === gk);
      if (g) ground = g.ground;
      else {
        const job = groundSteps(st, levels, maxLevel, this.frame, props.casts);
        let r = job.next();
        while (!r.done) {
          yield;
          r = job.next();
        }
        ground = r.value;
        this.grounds = [...this.grounds.slice(-1), { key: gk, ground }];
        yield;
      }
    } else {
      // Classic: the same ground as ever, repainted only when something it shows changes.
      const gk = groundKey(st, levels, maxLevel);
      const g = this.grounds.find((x) => x.key === gk);
      if (g) ground = g.ground;
      else {
        ground = paintGround(st, levels, maxLevel);
        this.grounds = [{ key: gk, ground }];
        yield;
      }
    }
    const arts: Art[] = [...ground.arts, ...buildingArts, ...(props?.painted.arts ?? [])];
    const lamps: [number, number][] = [...(props?.painted.lamps ?? []), ...buildingLamps];
    let mill: Built['mill'] = null;
    if (levels.granary > 0) {
      mill = this.mills.get(levels.granary) ?? null;
      if (!mill) {
        mill = paintMill(st, levels.granary, this.frame);
        this.mills.clear();
        this.mills.set(levels.granary, mill);
        yield;
      }
      arts.push(mill.art);
    }
    const wt = tierOf(levels.walls);
    const wall = wallHeights(wt);
    let poolsC: HTMLCanvasElement | null = null;
    if (pools && hd && st.id !== 'undead') {
      const src = poolSources(torches, lamps, forges);
      const pk = arts.map((a) => (a.canvas ? idOf(a.canvas) : 0)).join(',') + '|' + (props?.key ?? '') + '|' + JSON.stringify(src);
      if (this.poolsC?.key !== pk) {
        const canvas = yield* lightPoolSteps(this.frame, arts, props?.casts ?? [], src);
        this.poolsC = { key: pk, canvas };
      }
      poolsC = this.poolsC.canvas;
    }
    return {
      key,
      levels: { ...levels },
      arts,
      ground,
      banners,
      torches,
      forges,
      glows,
      lamps,
      anchors: { smoke, forges, targets, stalls, bells },
      mill,
      props,
      wall: { front: wall.front, back: wall.back },
      pools: poolsC,
    };
  }
}

/** A 32-bit hash of a string (the props key, for the ground's key). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
