// Loads the two sprite painters in Node (through Vite's SSR loader, so the TypeScript and the
// imports resolve exactly as in the app) and hands out frames plus a per-pixel material map.
// A tiny transform plugin re-exports a few module-private tables (ramps, frame counts, ramp ids)
// under `__` names; the art source files are not changed.

import { createServer, type ViteDevServer } from 'vite';
import type { Img, Frame } from './metrics.ts';

export type Art = 'classic' | 'hd';
export const FACTION_IDS = ['templar', 'samurai', 'undead'] as const;
export type Faction = (typeof FACTION_IDS)[number];
export const HUE = 215;

type RGB = [number, number, number];
interface Sheet {
  level: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  rects: Int32Array;
}
interface Looks {
  ramps?: (r: RGB[][], hue: number) => void;
}
interface ClassicMod {
  buildAtlas: (f: string, hue: number) => { image: { width: number; height: number }; at(k: number, a: number, f: number, d: number): [number, number]; frames(k: number, a: number): number };
  paletteFor: (f: string, hue: number) => unknown;
  FOOT_X: number;
  FOOT_Y: number;
  __makeRamps: (p: unknown, hue: number) => RGB[][];
  __looksFor: (f: string) => Looks;
  __R: Record<string, number>;
  __FRAMES: readonly number[];
}
interface HdMod {
  paintSheet: (f: string, hue: number, kind: number, level: number) => Sheet;
  paintGrid: (f: string, hue: number, kind: number) => Sheet;
  slotOf: (kind: number, a: number, frame: number, dir: number, blows?: number) => number;
  gridColOf: (kind: number, a: number, frame: number, dir: number, blows?: number) => number;
  blowsOf: (faction: string, kind: number) => number;
  FOOT_X: number;
  FOOT_Y: number;
  __armyColours: (f: string, hue: number) => { fill: number[]; edge: number[] };
  __R: Record<string, number>;
  __FRAMES: readonly number[];
  __COLS: number;
}
interface PaperMod {
  paperLintPalette: (f: string, hue: number) => { name: string; level: number; tones: RGB[]; edge: RGB }[];
}

/** What a pixel of a sprite is made of. */
export interface Palette {
  /** rgb key → ramp*4+tone for fill colours. */
  fill: Map<number, number>;
  /** rgb key → ramp for outline colours. */
  edge: Map<number, number>;
  /** Ramp id → name. */
  names: string[];
  /** Ramp id → its four tones (deep, shade, base, light). */
  ramps: RGB[][];
}

const unpack = (p: number): RGB => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255];
const rgbKey = ([r, g, b]: RGB): number => (r << 16) | (g << 8) | b;

/** A fake 2D canvas good enough for the classic buildAtlas (createImageData / putImageData). */
class FakeCanvas {
  width = 0;
  height = 0;
  data: Uint8ClampedArray | null = null;
  getContext() {
    const c = this;
    return {
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) => {
        c.data ??= new Uint8ClampedArray(c.width * c.height * 4);
        for (let r = 0; r < img.height; r++) c.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * c.width + x) * 4);
      },
    };
  }
}

export class Painters {
  private constructor(
    private readonly server: ViteDevServer,
    private readonly classic: ClassicMod,
    private readonly hd: HdMod,
    private readonly paper: PaperMod,
  ) {}

  static async load(root: string): Promise<Painters> {
    const g = globalThis as unknown as { document?: unknown };
    g.document ??= { createElement: () => new FakeCanvas() };
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'error',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        {
          name: 'pixel-lint-expose',
          transform(code: string, id: string) {
            if (id.endsWith('/render/sprites128.ts')) return code + '\nexport { armyColours as __armyColours, R as __R, FRAMES as __FRAMES, COLS as __COLS };';
            if (id.endsWith('/render/sprites.ts')) return code + '\nexport { makeRamps as __makeRamps, looksFor as __looksFor, R as __R, FRAMES as __FRAMES };';
            return undefined;
          },
        },
      ],
    });
    const classic = (await server.ssrLoadModule('/src/client/render/sprites.ts')) as unknown as ClassicMod;
    const hd = (await server.ssrLoadModule('/src/client/render/sprites128.ts')) as unknown as HdMod;
    const paper = (await server.ssrLoadModule('/src/client/render/paper/index.ts')) as unknown as PaperMod;
    return new Painters(server, classic, hd, paper);
  }

  close(): Promise<void> {
    return this.server.close();
  }

  frameCount(art: Art, anim: number): number {
    return (art === 'hd' ? this.hd.__FRAMES : this.classic.__FRAMES)[anim]!;
  }

  /** Melee blows of a kind (HD paper kinds may have several; Attack frame b * n + f is frame f of blow b). */
  blows(art: Art, faction: Faction, kind: number): number {
    return art === 'hd' ? this.hd.blowsOf(faction, kind) : 1;
  }

  /** A faction's palette; for HD, `level` limits the paper-doll ramps to those painted at that level. */
  palette(art: Art, faction: Faction, level?: number): Palette {
    const mod = art === 'hd' ? this.hd : this.classic;
    const names: string[] = [];
    for (const [k, v] of Object.entries(mod.__R)) names[v] = k;
    let fillP: number[], edgeP: number[], ramps: RGB[][];
    if (art === 'hd') {
      const c = this.hd.__armyColours(faction, HUE);
      fillP = c.fill;
      edgeP = c.edge;
      ramps = [];
      for (let r = 0; r < c.edge.length; r++) ramps.push([0, 1, 2, 3].map((t) => unpack(c.fill[r * 4 + t]!)));
    } else {
      const looks = this.classic.__looksFor(faction);
      ramps = this.classic.__makeRamps(this.classic.paletteFor(faction, HUE), HUE);
      looks.ramps?.(ramps, HUE);
      fillP = [];
      edgeP = [];
      const pack = ([r, g, b]: RGB) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
      for (const rp of ramps) {
        for (let t = 0; t < 4; t++) fillP.push(pack(rp[t]!));
        const d = rp[0]!;
        edgeP.push(pack([Math.round(d[0] * 0.45 + 6), Math.round(d[1] * 0.45 + 5), Math.round(d[2] * 0.45 + 5)]));
      }
    }
    const fill = new Map<number, number>();
    fillP.forEach((p, i) => {
      const k = rgbKey(unpack(p));
      if (!fill.has(k)) fill.set(k, i);
    });
    const edge = new Map<number, number>();
    edgeP.forEach((p, r) => {
      const k = rgbKey(unpack(p));
      if (!edge.has(k)) edge.set(k, r);
    });
    // Paper-doll kinds (src/client/render/paper/): their ramps as painted at each level, five
    // tones folded into the lint's four (the lightest two share tone 3), and their outlines.
    if (art === 'hd')
      for (const pr of this.paper.paperLintPalette(faction, HUE).filter((x) => level === undefined || x.level === level)) {
        const r = ramps.length;
        names[r] = pr.name;
        ramps.push(pr.tones.slice(0, 4));
        pr.tones.forEach((c, t) => {
          const k = rgbKey(c);
          if (!fill.has(k)) fill.set(k, r * 4 + Math.min(3, t));
        });
        const k = rgbKey(pr.edge);
        if (!edge.has(k) && !fill.has(k)) edge.set(k, r);
      }
    return { fill, edge, names, ramps };
  }

  private classicAtlas = new Map<string, { img: Img; at: ReturnType<ClassicMod['buildAtlas']> }>();

  private classicOf(faction: Faction) {
    let a = this.classicAtlas.get(faction);
    if (!a) {
      const atlas = this.classic.buildAtlas(faction, HUE);
      for (let k = 0; k < 11; k++) atlas.at(k, 0, 0, 0);
      const c = atlas.image as unknown as FakeCanvas;
      a = { img: { w: c.width, h: c.height, d: c.data! }, at: atlas };
      this.classicAtlas.set(faction, a);
    }
    return a;
  }

  private sheets = new Map<string, Sheet>();

  /** Keeps only the sheets of one (faction, level) in memory: level 8 pages are large. */
  private sheetOf(faction: Faction, kind: number, level: number): Sheet {
    const k = `${faction}:${kind}:${level}`;
    let s = this.sheets.get(k);
    if (!s) {
      this.sheets.clear();
      s = level === 1 ? this.hd.paintGrid(faction, HUE, kind) : this.hd.paintSheet(faction, HUE, kind, level);
      this.sheets.set(k, s);
    }
    return s;
  }

  /** One frame of a kind at a level (classic: level 1 only), with its foot point. */
  frame(art: Art, faction: Faction, kind: number, level: number, anim: number, fr: number, dir: number): Frame {
    if (art === 'classic') {
      const { img, at } = this.classicOf(faction);
      const [sx, sy] = at.at(kind, anim, fr, dir);
      return { m: cut(img, sx, sy, 48, 48), ax: this.classic.FOOT_X, ay: this.classic.FOOT_Y };
    }
    const sh = this.sheetOf(faction, kind, level);
    const page: Img = { w: sh.width, h: sh.height, d: sh.pixels };
    const blows = this.hd.blowsOf(faction, kind);
    const slot = this.hd.slotOf(kind, anim, fr, dir, blows);
    if (level === 1) {
      const col = this.hd.gridColOf(kind, anim, fr, dir, blows);
      return { m: cut(page, col * 48, dir * 48, 48, 48), ax: this.hd.FOOT_X, ay: this.hd.FOOT_Y };
    }
    const r = sh.rects.subarray(slot * 6, slot * 6 + 6);
    return { m: cut(page, r[0]!, r[1]!, r[2]!, r[3]!), ax: r[4]!, ay: r[5]! };
  }
}

function cut(src: Img, x0: number, y0: number, w: number, h: number): Img {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) d.set(src.d.subarray(((y0 + y) * src.w + x0) * 4, ((y0 + y) * src.w + x0 + w) * 4), y * w * 4);
  return { w, h, d };
}
