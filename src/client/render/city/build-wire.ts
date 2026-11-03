// The build worker's messages (build-worker.ts <-> build-remote.ts). Canvases travel once each, as
// ImageBitmaps with an id; a Built then names them by id (0 null, -1 absent).

import type { Banner } from './buildings.ts';
import type { Anchors, Levels, Progress, Torch } from './build.ts';
import type { Footprint } from './pixels.ts';

export interface BuildRequest {
  scene: number;
  faction: string;
  hue: number;
  seed: number;
  key: string;
  levels: Levels;
  progress: Progress;
}

export interface WireArt {
  canvas: number;
  lights: number;
  night: number;
  x: number;
  y: number;
  d: number;
  pooled?: boolean;
}

export interface WireAnim {
  d: number;
  x: number;
  y: number;
  seed: number;
  box: [number, number, number, number];
  kind: string;
  flick: number;
}

export interface WireBuilt {
  key: string;
  levels: Levels;
  arts: WireArt[];
  ground: { base: number; crops: number[]; arts: WireArt[]; sown: number; cropX?: number; cropY?: number; lamps?: [number, number][] };
  banners: Banner[];
  torches: Torch[];
  forges: [number, number][];
  glows: [number, number, number][];
  lamps: [number, number][];
  anchors: Anchors;
  mill: { art: WireArt; hub: [number, number] | null } | null;
  props: { key: string; casts: Footprint[]; arts: WireArt[]; lamps: [number, number][]; anims: WireAnim[] } | null;
  wall: { front: number; back: number };
  pools: number;
}

export interface BuildReply {
  scene: number;
  key: string;
  built?: WireBuilt;
  /** New canvases: id, size, and the pixels (absent for an empty canvas). */
  bitmaps?: [number, number, number, ImageBitmap | null][];
  /** Milliseconds the build took in the worker. */
  ms?: number;
  error?: string;
}
