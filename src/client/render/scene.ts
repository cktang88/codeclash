// Draws a running Battle in isometric pixel art with WebGL2.
//
// Projection (iso.ts): the ground plane is turned 30° and squashed to half height; army 0 deploys
// upper left facing the viewer, army 1 lower right facing away.
//
// Each frame:
//   1. Decals queued since the last frame (corpses, blood, spent arrows, craters) are stamped
//      into the ground texture, which is its own render target, so the dead stay where they fell.
//   2. The scene is drawn into a low-resolution buffer (the page's size divided by a whole
//      number), every sprite one instanced quad from one texture per army plus an effects sheet:
//        ground → shadows (each sprite's silhouette sheared along the ground, stencilled so
//        overlaps don't darken twice) → figures, props, missiles, standards (alpha-tested, depth
//        from the foot's screen y, so no sorting) → dust, smoke and missile shadows (blended).
//   3. A post shader blows the buffer up with nearest pixels and grades it.

import { Battle, FIELD_H, FIELD_W, State, type Projectile } from '../../game/battle.ts';
import { Rng } from '../../game/rng.ts';
import { U } from '../../game/units.ts';
import { Anim, ANIM_COUNT, COMMANDER_KIND, KIND_COUNT, type Atlas, type Dir, type KindSheet, type Stance } from './contract.ts';
import { buildFx, type FxSheet, type Region } from './fx.ts';
import { Batch, cornerBuffer, dropTarget, SpriteProgram, target, texture, texturePixels, type Target } from './gl.ts';
import { paintGround, type Ground } from './ground.ts';
import { dirFor, projX, projY, PX, unproject } from './iso.ts';
import { GlPost } from './post.ts';
import { upscaleCanvas } from './upscale.ts';
import { buildAtlas as buildClassic } from './sprites.ts';
import { buildAtlas as buildHd } from './sprites128.ts';
import { artMode, type ArtMode } from '../settings.ts';

export interface Camera {
  /** Whole-number zoom: 1 fits the field, each step adds one screen pixel per scene pixel. */
  zoom: number;
  /** World point at the centre of the view. */
  cx: number;
  cy: number;
}

const enum PK {
  Blood,
  Dust,
  Smoke,
  Debris,
}

interface Particle {
  kind: PK;
  /** World position on the ground, and height above it in map pixels. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A decal waiting to be stamped into the ground: tex 0/1 = an army's atlas, 2 = effects. */
interface Stamp {
  tex: number;
  x: number;
  y: number;
  u: number;
  v: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  shade: number;
  a: number;
  solid: boolean;
  r: number;
  g: number;
  b: number;
}

interface Gfx {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  prog: SpriteProgram;
  post: GlPost;
  corners: WebGLBuffer;
  atlasTex: [WebGLTexture, WebGLTexture];
  fxTex: WebGLTexture;
  ground: Target;
  scene: Target | null;
  /** Figures of each army, effects and props (alpha-tested), blended effects, the ground quad, stamps. */
  team: [Batch, Batch];
  fx: Batch;
  soft: Batch;
  groundQuad: Batch;
  stamp: [Batch, Batch, Batch];
  /** Detaches the context-loss listeners. */
  unlisten: () => void;
}

/** Sun: ground offset of a shadow per pixel of height (long, late-afternoon, toward the viewer's right). */
const SHEAR_X = 0.85;
const SHEAR_Y = 0.32;
const SHADOW: [number, number, number, number] = [0.07, 0.06, 0.1, 0.42];
const MAX_PARTICLES = 3000;
/** Highest zoom level (1 fits the field). */
export const MAX_ZOOM = 8;
/** Highest zoom level with the HD art, where each level doubles the scale (8x: the 128 px sprites 1:1). */
export const MAX_ZOOM_HD = 5;

const BRACING: ReadonlySet<Stance> = new Set<Stance>(['shieldwall', 'pikewall', 'braced']);
/** A regiment's stance; the sim adds `stance` on Regiment (read loosely until it lands). */
const stanceOf = (r: object): Stance => (r as { stance?: Stance }).stance ?? 'line';

type MoraleState = 'steady' | 'wavering' | 'broken' | 'rallying' | 'shattered';
/** A regiment's morale state; the sim is adding `moraleState` (read loosely until it lands). */
const moraleOf = (r: { routed: boolean }): MoraleState => (r as { moraleState?: MoraleState }).moraleState ?? (r.routed ? 'broken' : 'steady');

const MISSILE_CLS = (cls: number, splash: number): 'stone' | 'bolt' | 'jav' | 'arrow' =>
  splash > 0 ? 'stone' : cls === U.Crossbowmen ? 'bolt' : cls === U.Skirmishers ? 'jav' : 'arrow';

export class BattleScene {
  camera: Camera = { zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2 };
  scanlines = true;
  /** Ease the camera toward the thick of the fighting. */
  follow = false;
  /** CPU milliseconds spent in the last draw(), and in filling its instance buffers. */
  lastDrawMs = 0;
  lastBuildMs = 0;

  private readonly ground: Ground;
  private readonly fxSheet: FxSheet;
  private readonly atlases: [Atlas, Atlas];
  private readonly rng = new Rng(7);
  private gfx: Gfx | null = null;
  private failed: string | null = null;
  /** The art the scene was built with: classic 48 px cells, or HD (detail levels up to 8x). */
  readonly art: ArtMode;
  /** HD: per army and kind, the detail level drawn this frame (1 = the cell grid). */
  private hdLevel: Uint8Array[] = [new Uint8Array(KIND_COUNT).fill(1), new Uint8Array(KIND_COUNT).fill(1)];
  /** HD: a batch per army and kind for the hi-res sheets, and their textures by army:kind:level. */
  private hdBatch: Batch[][] = [];
  private hdTex = new Map<string, WebGLTexture>();
  /** HD: the sheet each texture was made from (a sheet the painter dropped and repainted is new). */
  private hdTexSheet = new Map<string, KindSheet>();
  /** HD: the sheet drawn this frame per army and kind (null: the level-1 grid). */
  private hdSheet: (KindSheet | null)[][] = [new Array<KindSheet | null>(KIND_COUNT).fill(null), new Array<KindSheet | null>(KIND_COUNT).fill(null)];
  /** HD: the effects sheet Scale2x'd to 2x and 4x, made when first zoomed that far. */
  private fxHi = new Map<number, { tex: WebGLTexture; w: number; h: number }>();
  /** The atlas image versions last uploaded (HD grids fill in the background). */
  private atlasVer = [0, 0];
  private kindsPresent: number[][] = [[], []];
  /** HD: kinds of each army seen in view last frame (bit per kind): only they get the 8x sheets. */
  private seen = [0, 0];

  private prevX: Float32Array;
  private prevY: Float32Array;
  private prevHp: Float32Array;
  private hurtAt: Float32Array;
  private dirs: Uint8Array;
  private stamped: Uint8Array;
  private regX: Float32Array;
  private frameTab: Uint16Array[] = [];
  private lenTab: Float32Array[] = [];
  private tpfTab: Float32Array[] = [];
  private missileRegions: Record<string, Region[]> = {};
  private puffRegions: Region[] = [];
  private regY: Float32Array;
  private flying = new Set<Projectile>();
  private particles: Particle[] = [];
  private stamps: Stamp[] = [];
  private time = 0;
  /** Last frame's view, for toWorld and pan. */
  private view = { px: 1, m: 1, u: 1, bw: 1, bh: 1, vw: 1, vh: 1, camX: 0, camY: 0, offX: 0, offY: 0, W: 1, H: 1 };

  constructor(readonly battle: Battle, art: ArtMode = artMode()) {
    this.art = art;
    this.ground = paintGround(battle.setup.seed);
    const [a, b] = battle.setup.armies;
    const buildAtlas = art === 'hd' ? buildHd : buildClassic;
    this.atlases = [buildAtlas(a.faction, a.hue), buildAtlas(b.faction, b.hue)];
    // The painter fills kinds lazily, but the atlas goes to the GPU once: paint the kinds on the
    // field first (only those: a kind no one fields is never drawn).
    for (const s of battle.soldiers) {
      const k = s.commander ? COMMANDER_KIND : s.cls;
      if (!this.kindsPresent[s.team]!.includes(k)) this.kindsPresent[s.team]!.push(k);
    }
    this.atlases.forEach((atlas, t) => {
      for (const k of this.kindsPresent[t]!) atlas.at(k, Anim.Idle, 0, 0);
      // HD: once the battle is under way, start the workers on the middle levels, so zooming in
      // finds them ready (not at once: the grids come first, and the start should not stutter).
      if (atlas.sheet && typeof setTimeout === 'function')
        setTimeout(() => {
          for (const lv of [2, 4]) for (const k of this.kindsPresent[t]!) atlas.sheet!(k, lv);
        }, 2500);
    });
    this.fxSheet = buildFx([a, b], battle.setup.seed);
    // Lookup tables, so the per-figure loop calls no atlas closures and builds no strings.
    for (const atlas of this.atlases) {
      const frames = new Uint16Array(KIND_COUNT * ANIM_COUNT);
      const lens = new Float32Array(KIND_COUNT * ANIM_COUNT);
      const tpf = new Float32Array(ANIM_COUNT);
      for (let an = 0; an < ANIM_COUNT; an++) tpf[an] = atlas.ticksPerFrame(an as Anim);
      for (let k = 0; k < KIND_COUNT; k++)
        for (let an = 0; an < ANIM_COUNT; an++) {
          frames[k * ANIM_COUNT + an] = atlas.frames(k, an as Anim);
          lens[k * ANIM_COUNT + an] = frames[k * ANIM_COUNT + an]! * tpf[an]!;
        }
      this.frameTab.push(frames);
      this.lenTab.push(lens);
      this.tpfTab.push(tpf);
    }
    for (const look of ['arrow', 'bolt', 'jav']) this.missileRegions[look] = Array.from({ length: 16 }, (_, i) => this.fxSheet.get(`${look}${i}`));
    const sizes = [1, 2, 3, 4, 5, 6, 7, 9, 11];
    for (let d = 0; d <= 11; d++) this.puffRegions[d] = this.fxSheet.get(`puff${sizes.find((q) => q >= d) ?? 11}`);
    const n = battle.soldiers.length;
    this.prevX = new Float32Array(n);
    this.prevY = new Float32Array(n);
    this.prevHp = new Float32Array(n);
    this.hurtAt = new Float32Array(n).fill(-100);
    this.dirs = new Uint8Array(n);
    this.stamped = new Uint8Array(n);
    this.regX = new Float32Array(battle.regiments.length);
    this.regY = new Float32Array(battle.regiments.length);
    for (let i = 0; i < n; i++) {
      const s = battle.soldiers[i]!;
      this.dirs[i] = s.team === 0 ? 0 : 2;
    }
    this.snapshot();
  }

  /** Whether this browser can draw battles at all. */
  static supported(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  /** Why drawing failed, if it did. */
  get error(): string | null {
    return this.failed;
  }

  // ---------------------------------------------------------------- simulation hooks

  /** Call before each battle.step(), so drawing can interpolate between ticks. */
  snapshot(): void {
    const ss = this.battle.soldiers;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      this.prevX[i] = s.x;
      this.prevY[i] = s.y;
      this.prevHp[i] = s.hp;
    }
    const rs = this.battle.regiments;
    for (let i = 0; i < rs.length; i++) {
      this.regX[i] = rs[i]!.cx;
      this.regY[i] = rs[i]!.cy;
    }
  }

  /** Call after each battle.step(): blood for the wounded, the fallen stamped, missiles landed. */
  afterStep(): void {
    const b = this.battle;
    const ss = b.soldiers;
    const rng = this.rng;
    const tick = b.tick;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Fled) continue;
      if (s.hp < this.prevHp[i]!) {
        this.hurtAt[i] = tick;
        const dead = s.state === State.Dead;
        const n = dead ? 6 : 3;
        const h = s.s.mounted ? 12 : 8;
        // A ring of single drops bursting outward (see docs/art-references/battle-effects.md).
        const a0 = rng.next() * Math.PI * 2;
        for (let k = 0; k < n * 2; k++) {
          const a = a0 + (k / (n * 2)) * Math.PI * 2;
          const sp = 14 + rng.next() * 18;
          this.spawn(PK.Blood, s.x, s.y, h + rng.next() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 6 + rng.next() * 18, 0.9, 1, rng.next() < 0.5 ? 0.42 : 0.6, 0.05, 0.04, 1);
        }
        if (rng.next() < 0.12) this.stampFx(`splat${rng.int(4)}`, s.x + (rng.next() - 0.5) * 4, s.y + (rng.next() - 0.5) * 4, 0.7);
      }
      if (s.state === State.Dead) {
        if (!this.stamped[i] && tick - s.diedAt >= this.dieTicks(s.team, this.kindOf(i))) this.stampCorpse(i);
        continue;
      }
      // Hooves and marching feet raise dust.
      const v2 = s.vx * s.vx + s.vy * s.vy;
      if (s.s.mounted ? v2 > 700 && rng.next() < 0.3 : v2 > 100 && rng.next() < 0.02) {
        const big = s.s.mounted ? 1 : 0;
        this.spawn(PK.Dust, s.x - s.vx * 0.06, s.y - s.vy * 0.06, 1, -s.vx * 0.1 + (rng.next() - 0.5) * 6, -s.vy * 0.1 + (rng.next() - 0.5) * 6, 2 + rng.next() * 3, 1.4 + rng.next() * 1.2 + big, 2 + big * 2, 0.46, 0.4, 0.3, 0.22);
      }
    }
    // Missiles that came down this tick.
    const now = new Set(b.projectiles);
    for (const p of this.flying) {
      if (now.has(p)) continue;
      if (p.splash > 0) this.impact(p.x1, p.y1);
      else if (rng.next() < 0.3) this.stampFx(`stuck${rng.int(3)}`, p.x1, p.y1, 1);
    }
    this.flying = now;
  }

  private kindOf(i: number): number {
    const s = this.battle.soldiers[i]!;
    return s.commander ? COMMANDER_KIND : s.cls;
  }

  private dieTicks(team: number, kind: number): number {
    const a = this.atlases[team as 0 | 1];
    return a.frames(kind, Anim.Die) * a.ticksPerFrame(Anim.Die);
  }

  private impact(x: number, y: number): void {
    const rng = this.rng;
    this.stampFx(`crater${rng.int(2)}`, x, y, 0.85);
    for (let k = 0; k < 9; k++) {
      const g = 0.2 + rng.next() * 0.12;
      this.spawn(PK.Smoke, x + (rng.next() - 0.5) * 6, y + (rng.next() - 0.5) * 6, 2 + rng.next() * 4, (rng.next() - 0.5) * 14, (rng.next() - 0.5) * 14, 6 + rng.next() * 8, 2.2 + rng.next() * 1.6, 3 + rng.int(4), g, g * 0.95, g * 0.88, 0.55);
    }
    for (let k = 0; k < 10; k++) {
      const g = rng.next() < 0.5 ? 0.24 : 0.36;
      this.spawn(PK.Debris, x, y, 2, (rng.next() - 0.5) * 50, (rng.next() - 0.5) * 50, 30 + rng.next() * 40, 1.5, 1, g, g * 0.88, g * 0.7, 1);
    }
  }

  private spawn(kind: PK, x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ kind, x, y, z, vx, vy, vz, life: 0, max, size, r, g, b, a });
  }

  private mapX(x: number, y: number): number {
    return projX(x, y) - this.ground.ox;
  }
  private mapY(x: number, y: number): number {
    return projY(x, y) - this.ground.oy;
  }

  private stampFx(name: string, x: number, y: number, a: number, shade = 1): void {
    const r = this.fxSheet.get(name);
    this.stamps.push({ tex: 2, x: Math.round(this.mapX(x, y)), y: Math.round(this.mapY(x, y)), u: r.u, v: r.v, w: r.w, h: r.h, ax: r.ax, ay: r.ay, shade, a, solid: false, r: 0, g: 0, b: 0 });
  }

  private stampCorpse(i: number): void {
    this.stamped[i] = 1;
    const s = this.battle.soldiers[i]!;
    const rng = this.rng;
    const pools = s.s.mounted ? 2 : 1;
    for (let k = 0; k < pools; k++) this.stampFx(`pool${rng.int(6)}`, s.x + (rng.next() - 0.5) * 3 * pools, s.y + (rng.next() - 0.5) * 3, 0.7);
    this.restampCorpse(i);
  }

  /** The body alone (after a lost context wiped the ground). */
  private restampCorpse(i: number): void {
    const s = this.battle.soldiers[i]!;
    const atlas = this.atlases[s.team as 0 | 1];
    const kind = this.kindOf(i);
    const [u, v] = atlas.at(kind, Anim.Dead, 0, this.dirs[i] as Dir);
    this.stamps.push({ tex: s.team, x: Math.round(this.mapX(s.x, s.y)), y: Math.round(this.mapY(s.x, s.y)), u, v, w: atlas.cellW, h: atlas.cellH, ax: atlas.footX, ay: atlas.footY, shade: 0.78, a: 1, solid: false, r: 0, g: 0, b: 0 });
  }

  // ---------------------------------------------------------------- GL setup

  private init(canvas: HTMLCanvasElement): Gfx | null {
    if (this.gfx && this.gfx.canvas === canvas) {
      if (!this.gfx.gl.isContextLost()) return this.gfx;
      // The GPU dropped the context: every object is gone. Wait for it to come back, then
      // rebuild from scratch (the ground's stamped decals are lost; the corpses are restamped).
      return null;
    }
    if (this.gfx) this.dispose();
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) {
      this.failed = 'WebGL2 is not available in this browser.';
      return null;
    }
    if (gl.isContextLost()) return null;
    // Without preventDefault on the loss the browser never restores the context.
    const onLost = (e: Event) => e.preventDefault();
    const onRestored = () => {
      if (this.gfx?.canvas !== canvas) return;
      this.gfx.unlisten();
      this.gfx = null;
      // The HD sheets' textures and batches died with the context; they are rebuilt on demand.
      this.hdBatch = [];
      this.hdTex.clear();
      this.hdTexSheet.clear();
      this.fxHi.clear();
      this.atlasVer = [-1, -1];
      this.stamps.length = 0;
      for (let i = 0; i < this.stamped.length; i++) if (this.stamped[i]) this.restampCorpse(i);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    const unlisten = () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
    const corners = cornerBuffer(gl);
    const g = this.ground;
    const groundTex = texture(gl, g.canvas);
    const gfx: Gfx = {
      gl,
      canvas,
      prog: new SpriteProgram(gl),
      post: new GlPost(gl),
      corners,
      atlasTex: [texture(gl, this.atlases[0].image), texture(gl, this.atlases[1].image)],
      fxTex: texture(gl, this.fxSheet.canvas),
      ground: target(gl, g.w, g.h, false, groundTex),
      scene: null,
      team: [new Batch(gl, corners, 2048), new Batch(gl, corners, 2048)],
      fx: new Batch(gl, corners, 1024),
      soft: new Batch(gl, corners, 1024),
      groundQuad: new Batch(gl, corners, 1),
      stamp: [new Batch(gl, corners, 64), new Batch(gl, corners, 64), new Batch(gl, corners, 256)],
      unlisten,
    };
    gfx.groundQuad.sprite(0, 0, 0, 0, g.w, g.h, 0, 0, -1e6);
    gfx.groundQuad.upload();
    this.gfx = gfx;
    return gfx;
  }

  /** Frees the GL resources (the canvas's context stays for the next scene). */
  dispose(): void {
    const g = this.gfx;
    if (!g) return;
    g.unlisten();
    this.gfx = null;
    const gl = g.gl;
    const hdBatches = this.hdBatch.flat();
    const hdTextures = [...this.hdTex.values(), ...[...this.fxHi.values()].map((f) => f.tex)];
    this.hdBatch = [];
    this.hdTex.clear();
    this.hdTexSheet.clear();
    this.fxHi.clear();
    // A lost context has already freed everything.
    if (gl.isContextLost()) return;
    for (const b of [...g.team, g.fx, g.soft, g.groundQuad, ...g.stamp, ...hdBatches]) b.dispose();
    for (const t of [...g.atlasTex, g.fxTex, ...hdTextures]) gl.deleteTexture(t);
    dropTarget(gl, g.ground);
    if (g.scene) dropTarget(gl, g.scene);
    gl.deleteBuffer(g.corners);
    gl.deleteProgram(g.prog.prog);
    g.post.dispose();
  }

  // ---------------------------------------------------------------- camera

  private fieldPx(): [number, number] {
    const xs = [projX(0, 0), projX(FIELD_W, 0), projX(0, FIELD_H), projX(FIELD_W, FIELD_H)];
    const ys = [projY(0, 0), projY(FIELD_W, 0), projY(0, FIELD_H), projY(FIELD_W, FIELD_H)];
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }

  /** Device pixels per map pixel for a canvas of this size at the current zoom. */
  pixelScale(W: number, H: number): number {
    return this.scales(W, H).s;
  }

  /** Bytes of sprite textures on the GPU: both armies' grids and the HD sheets uploaded now. */
  get spriteGpuBytes(): number {
    let b = 0;
    for (const a of this.atlases) b += a.image.width * a.image.height * 4;
    for (const sh of this.hdTexSheet.values()) b += sh.width * sh.height * 4;
    return b;
  }

  /** Highest zoom level for this scene's art. */
  get maxZoom(): number {
    return this.art === 'hd' ? MAX_ZOOM_HD : MAX_ZOOM;
  }

  /**
   * The zoom ladder. s: device px per map px; m: scene-buffer px per map px; u: device px per
   * buffer px (the post shader's whole-number upscale). Classic art: m = 1, and each level adds a
   * device pixel. HD art: each level doubles s, and the buffer draws the map m = 2, 4 or 8 times
   * larger, so the 2x, 4x and 8x sprite sheets land texel for pixel and never blur.
   */
  private scales(W: number, H: number): { s: number; m: number; u: number } {
    const [fw, fh] = this.fieldPx();
    // Fit the field, rounding up a little: the parallelogram's far corners are mostly empty.
    const fit = Math.max(1, Math.floor(Math.min(W / (fw * 0.92), H / (fh * 1.15)) + 0.3));
    const z = Math.max(1, Math.round(this.camera.zoom));
    if (this.art !== 'hd') {
      const s = fit + z - 1;
      return { s, m: 1, u: s };
    }
    const s = fit * 2 ** (z - 1);
    const m = [8, 4, 2, 1].find((l) => s % l === 0)!;
    return { s, m, u: s / m };
  }

  /**
   * Zooms to `level` keeping the field point under device pixel (x, y) of `out` where it is
   * (wheel, pinch, double-click). Zoom levels are whole numbers: each adds one device pixel per
   * scene pixel, so the scene buffer shrinks and sprites grow, never blur.
   */
  zoomAt(out: HTMLCanvasElement, level: number, x: number, y: number): void {
    const [bx, by] = this.toWorld(out, x, y);
    this.camera.zoom = Math.max(1, Math.min(this.maxZoom, Math.round(level)));
    this.layout(out.width, out.height);
    const [ax, ay] = this.toWorld(out, x, y);
    this.camera.cx += bx - ax;
    this.camera.cy += by - ay;
    this.layout(out.width, out.height);
  }

  /** The whole field in view. */
  fit(): void {
    this.camera.zoom = 1;
    this.camera.cx = FIELD_W / 2;
    this.camera.cy = FIELD_H / 2;
  }

  /** Moves the view by a drag of (dx, dy) device pixels. */
  pan(dx: number, dy: number): void {
    const px = this.view.px;
    const mx = this.mapX(this.camera.cx, this.camera.cy) - dx / px;
    const my = this.mapY(this.camera.cx, this.camera.cy) - dy / px;
    [this.camera.cx, this.camera.cy] = unproject(mx + this.ground.ox, my + this.ground.oy);
  }

  /** Field coordinates under a device pixel of `out`. */
  toWorld(out: HTMLCanvasElement, x: number, y: number): [number, number] {
    // Lay out afresh: a pan or zoom since the last frame has moved the view (cheap).
    this.layout(out.width, out.height);
    const v = this.view;
    const mx = v.camX + (x - v.offX) / v.px;
    const my = v.camY + (y - v.offY) / v.px;
    return unproject(mx + this.ground.ox, my + this.ground.oy);
  }

  private layout(W: number, H: number): void {
    const { s: px, m, u } = this.scales(W, H);
    // The buffer in its own px, and the map px it covers.
    const bw = Math.ceil(W / u);
    const bh = Math.ceil(H / u);
    const vw = bw / m;
    const vh = bh / m;
    const g = this.ground;
    // The view's centre stays over the field, and the view inside the painted ground.
    this.camera.cx = Math.max(0, Math.min(FIELD_W, this.camera.cx));
    this.camera.cy = Math.max(0, Math.min(FIELD_H, this.camera.cy));
    let mcx = this.mapX(this.camera.cx, this.camera.cy);
    let mcy = this.mapY(this.camera.cx, this.camera.cy);
    mcx = vw >= g.w ? g.w / 2 : Math.max(vw / 2, Math.min(g.w - vw / 2, mcx));
    mcy = vh >= g.h ? g.h / 2 : Math.max(vh / 2, Math.min(g.h - vh / 2, mcy));
    [this.camera.cx, this.camera.cy] = unproject(mcx + g.ox, mcy + g.oy);
    // The camera snaps to whole buffer pixels, so nothing crawls as it pans.
    const camX = Math.round((mcx - vw / 2) * m) / m;
    const camY = Math.round((mcy - vh / 2) * m) / m;
    this.view = { px, m, u, bw, bh, vw, vh, camX, camY, offX: Math.floor((W - bw * u) / 2), offY: Math.floor((H - bh * u) / 2), W, H };
  }

  private followAction(dt: number): void {
    let sx = 0;
    let sy = 0;
    let n = 0;
    const tick = this.battle.tick;
    for (const s of this.battle.soldiers) {
      if (s.state !== State.Fighting || tick - s.actedAt > 20) continue;
      sx += s.x;
      sy += s.y;
      n++;
    }
    if (n < 5) return;
    const k = Math.min(1, dt * 0.8);
    this.camera.cx += (sx / n - this.camera.cx) * k;
    this.camera.cy += (sy / n - this.camera.cy) * k;
  }

  // ---------------------------------------------------------------- drawing

  /** Paints the battle onto `out` (a WebGL2 canvas this scene owns) at tick + alpha. */
  draw(out: HTMLCanvasElement, alpha: number, dt: number): void {
    const t0 = performance.now();
    // A collapsed canvas (display: none, a 0-height flex child) has nothing to draw into, and a
    // 0×0 scene buffer would be an incomplete framebuffer.
    if (out.width < 1 || out.height < 1) return;
    const gfx = this.init(out);
    if (!gfx) return;
    const gl = gfx.gl;
    this.time += dt;
    if (this.follow) this.followAction(dt);
    this.layout(out.width, out.height);
    const v = this.view;
    if (!gfx.scene || gfx.scene.w !== v.bw || gfx.scene.h !== v.bh) {
      if (gfx.scene) dropTarget(gl, gfx.scene);
      gfx.scene = target(gl, v.bw, v.bh, true);
    }
    const zFar = -200;
    const zNear = this.ground.h + 200;

    // HD grids arrive from the workers after the battle starts: upload them as they land.
    this.atlases.forEach((a, t) => {
      if ((a.version ?? 0) === this.atlasVer[t]) return;
      this.atlasVer[t] = a.version ?? 0;
      gl.bindTexture(gl.TEXTURE_2D, gfx.atlasTex[t as 0 | 1]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.image);
    });
    this.flushStamps(gfx, zFar, zNear);
    const tb = performance.now();
    this.build(gfx, alpha, dt);
    this.lastBuildMs = performance.now() - tb;

    // The scene, into the low-resolution buffer.
    const P = gfx.prog;
    gl.bindFramebuffer(gl.FRAMEBUFFER, gfx.scene.fbo);
    gl.viewport(0, 0, v.bw, v.bh);
    gl.clearColor(0.04, 0.035, 0.03, 1);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    P.use(v.camX, v.camY, v.bw, v.bh, zFar, zNear, v.m);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    P.tex(gfx.ground.tex, this.ground.w, this.ground.h);
    // Zoomed past the ground's own resolution (HD), the ground is smoothed rather than blocky.
    const gf = v.m > 1 ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gf);
    gfx.groundQuad.draw();

    // HD zoomed in: standards, missiles and puffs from a Scale2x'd copy of the effects sheet.
    const fxF = this.art === 'hd' ? (v.m >= 4 ? 4 : v.m >= 2 ? 2 : 1) : 1;
    const fxT = this.fxTexture(gfx, fxF);
    const draws: [Batch, WebGLTexture, number, number, number, number][] = [
      [gfx.team[0], gfx.atlasTex[0], this.atlases[0].image.width, this.atlases[0].image.height, 1, 1],
      [gfx.team[1], gfx.atlasTex[1], this.atlases[1].image.width, this.atlases[1].image.height, 1, 1],
      ...this.hdDraws(),
      [gfx.fx, fxT.tex, fxT.w, fxT.h, fxF, fxF],
    ];
    // Shadows: once per pixel, however many fall on it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    P.shadow(true, SHEAR_X, SHEAR_Y, SHADOW);
    for (const [b, t, w, h, tx, sc] of draws) {
      P.tex(t, w, h, tx, sc);
      b.draw();
    }
    P.shadow(false);
    gl.disable(gl.STENCIL_TEST);

    // Everything solid, depth-tested by the foot's screen y.
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    for (const [b, t, w, h, tx, sc] of draws) {
      P.tex(t, w, h, tx, sc);
      b.draw();
    }
    // Dust, smoke, missile shadows.
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    P.tex(fxT.tex, fxT.w, fxT.h, fxF, fxF);
    gfx.soft.draw();
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    gfx.post.apply(gfx.scene.tex, v.W, v.H, v.offX, v.offY, v.u, this.time, this.scanlines);
    this.lastDrawMs = performance.now() - t0;
  }

  private flushStamps(gfx: Gfx, zFar: number, zNear: number): void {
    if (this.stamps.length === 0) return;
    const gl = gfx.gl;
    for (const b of gfx.stamp) b.clear();
    for (const s of this.stamps) {
      const b = gfx.stamp[s.tex]!;
      if (s.solid) b.rect(s.x, s.y, s.w, s.h, 0, s.r, s.g, s.b, s.a);
      else b.sprite(s.x, s.y, s.u, s.v, s.w, s.h, s.ax, s.ay, 0, s.shade, s.shade, s.shade * 0.96, s.a);
    }
    this.stamps.length = 0;
    const g = this.ground;
    gl.bindFramebuffer(gl.FRAMEBUFFER, gfx.ground.fbo);
    gl.viewport(0, 0, g.w, g.h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    const P = gfx.prog;
    P.use(0, 0, g.w, g.h, zFar, zNear);
    const texs: [WebGLTexture, number, number][] = [
      [gfx.atlasTex[0], this.atlases[0].image.width, this.atlases[0].image.height],
      [gfx.atlasTex[1], this.atlases[1].image.width, this.atlases[1].image.height],
      [gfx.fxTex, this.fxSheet.canvas.width, this.fxSheet.canvas.height],
    ];
    // Effects first (blood under the bodies), then the bodies.
    for (const k of [2, 0, 1]) {
      const b = gfx.stamp[k]!;
      if (b.n === 0) continue;
      b.upload();
      P.tex(texs[k]![0], texs[k]![1], texs[k]![2]);
      b.draw();
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  /**
   * HD: picks, per army and kind, the finest painted sheet no finer than the view (m), uploads it
   * once, and asks the painter for the one the view wants. Returns whether any kind is drawn hi-res.
   */
  private pickLevels(gfx: Gfx, m: number): boolean {
    let any = false;
    if (this.hdBatch.length === 0) this.hdBatch = [0, 1].map(() => Array.from({ length: KIND_COUNT }, () => new Batch(gfx.gl, gfx.corners, 256)));
    for (let t = 0; t < 2; t++) {
      const atlas = this.atlases[t as 0 | 1];
      const lv = this.hdLevel[t]!;
      lv.fill(1);
      this.hdSheet[t]!.fill(null);
      for (const b of this.hdBatch[t]!) b.clear();
      // Textures finer than the view are freed (they upload again from the painter's memory in a
      // few ms when the view zooms back in): the GPU holds only what is drawn.
      for (const [key, tex] of this.hdTex) {
        const [kt, , kl] = key.split(':').map(Number);
        if (kt === t && kl! > m) {
          gfx.gl.deleteTexture(tex);
          this.hdTex.delete(key);
          this.hdTexSheet.delete(key);
        }
      }
      if (!atlas.sheet || !atlas.levels || m <= 1) continue;
      for (const k of this.kindsPresent[t]!) {
        const inView = !!(this.seen[t]! & (1 << k));
        // The finest painted level no finer than the view. Asking for the levels keeps them
        // fresh in the painter's memory (and starts painting the ones still missing); the 8x
        // sheets (tens of MB a kind) are asked for only by kinds actually in view.
        let best: KindSheet | null = null;
        let bestL = 1;
        for (const L of atlas.levels) {
          if (L > m || (L >= 8 && !inView)) break;
          const sh = atlas.sheet(k, L);
          if (sh) {
            best = sh;
            bestL = L;
          }
        }
        // Only the drawn level of a kind in view stays on the GPU.
        for (const L of atlas.levels) {
          const key = `${t}:${k}:${L}`;
          const tex = this.hdTex.get(key);
          if (tex && (L !== bestL || this.hdTexSheet.get(key) !== best || !inView)) {
            gfx.gl.deleteTexture(tex);
            this.hdTex.delete(key);
            this.hdTexSheet.delete(key);
          }
        }
        if (!best || !inView) continue;
        const key = `${t}:${k}:${bestL}`;
        if (!this.hdTex.has(key)) {
          this.hdTex.set(key, texturePixels(gfx.gl, best.width, best.height, best.pixels));
          this.hdTexSheet.set(key, best);
        }
        lv[k] = bestL;
        this.hdSheet[t]![k] = best;
        any = true;
      }
    }
    return any;
  }

  /** The effects texture at a Scale2x factor (1: the sheet itself). */
  private fxTexture(gfx: Gfx, f: number): { tex: WebGLTexture; w: number; h: number } {
    const c = this.fxSheet.canvas;
    if (f <= 1) return { tex: gfx.fxTex, w: c.width, h: c.height };
    let hi = this.fxHi.get(f);
    if (!hi) {
      const u = upscaleCanvas(c, Math.log2(f));
      hi = { tex: texturePixels(gfx.gl, u.width, u.height, u.pixels), w: u.width, h: u.height };
      this.fxHi.set(f, hi);
    }
    return hi;
  }

  /** HD batches to draw this frame: [batch, texture, width, height, texels per map px, 1]. */
  private hdDraws(): [Batch, WebGLTexture, number, number, number, number][] {
    const out: [Batch, WebGLTexture, number, number, number, number][] = [];
    for (let t = 0; t < this.hdBatch.length; t++)
      for (let k = 0; k < KIND_COUNT; k++) {
        const b = this.hdBatch[t]![k]!;
        const L = this.hdLevel[t]![k]!;
        const sh = this.hdSheet[t]![k];
        if (b.n === 0 || L <= 1 || !sh) continue;
        out.push([b, this.hdTex.get(`${t}:${k}:${L}`)!, sh.width, sh.height, L, 1]);
      }
    return out;
  }

  /** HD: a fallen man drawn at full detail over his low-res stamp (beneath everyone standing). */
  private hdCorpse(i: number, x0: number, x1: number, y0: number, y1: number): void {
    const s = this.battle.soldiers[i]!;
    const kind = this.kindOf(i);
    const L = this.hdLevel[s.team]![kind]!;
    if (L <= 1) return;
    const mx = this.mapX(s.x, s.y);
    const my = this.mapY(s.x, s.y);
    if (mx < x0 || mx > x1 || my < y0 || my > y1) return;
    const atlas = this.atlases[s.team as 0 | 1];
    const sh = this.hdSheet[s.team]![kind]!;
    const o = atlas.slot!(kind, Anim.Dead, 0, this.dirs[i] as Dir) * 6;
    const r = sh.rects;
    this.hdBatch[s.team]![kind]!.sprite(Math.round(mx), Math.round(my), r[o]!, r[o + 1]!, r[o + 2]! / L, r[o + 3]! / L, r[o + 4]! / L, r[o + 5]! / L, -1e5, 0.78, 0.78, 0.75, 1, 0, 1);
  }

  /** Fills the instance buffers for this frame. */
  private build(gfx: Gfx, alpha: number, dt: number): void {
    const b = this.battle;
    const ss = b.soldiers;
    const T = b.tick + alpha;
    const v = this.view;
    const x0 = v.camX - 40;
    const x1 = v.camX + v.vw + 40;
    const y0 = v.camY - 10;
    const y1 = v.camY + v.vh + 60;
    const team = gfx.team;
    team[0].clear();
    team[1].clear();
    const m = v.m;
    const hd = this.pickLevels(gfx, m);
    this.seen[0] = this.seen[1] = 0;
    gfx.fx.clear();
    gfx.soft.clear();
    const fx = this.fxSheet;

    // Soldiers.
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Fled) continue;
      if (this.stamped[i]) {
        // HD, zoomed in: the corpse stamped into the low-res ground is drawn over at full detail.
        if (hd) this.hdCorpse(i, x0, x1, y0, y1);
        continue;
      }
      const wx = this.prevX[i]! + (s.x - this.prevX[i]!) * alpha;
      const wy = this.prevY[i]! + (s.y - this.prevY[i]!) * alpha;
      const fmx = this.mapX(wx, wy);
      const fmy = this.mapY(wx, wy);
      if (fmx < x0 || fmx > x1 || fmy < y0 || fmy > y1) continue;
      const atlas = this.atlases[s.team as 0 | 1];
      const kind = s.commander ? COMMANDER_KIND : s.cls;
      this.seen[s.team] = this.seen[s.team]! | (1 << kind);
      const lens = this.lenTab[s.team]!;
      let anim: Anim = Anim.Idle;
      let start = 0;
      let loop = true;
      let dir = this.dirs[i] as Dir;
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const hitAt = Math.max(((s as unknown as { hitAt?: number }).hitAt ?? -100), this.hurtAt[i]!);
      const reg = b.regiments[s.reg]!;
      const stance = stanceOf(reg);
      if (s.state === State.Dead) {
        anim = Anim.Die;
        start = s.diedAt;
        loop = false;
      } else {
        const act = T - s.actedAt;
        const tgt = s.target >= 0 ? ss[s.target] : undefined;
        const melee = s.s.range === 0 || (tgt !== undefined && (tgt.x - s.x) ** 2 + (tgt.y - s.y) ** 2 < 14 * 14);
        const actAnim = melee ? Anim.Attack : Anim.Shoot;
        if (act >= 0 && act < lens[kind * ANIM_COUNT + actAnim]!) {
          anim = actAnim;
          start = s.actedAt;
          loop = false;
        } else if (T - hitAt < lens[kind * ANIM_COUNT + Anim.Hit]!) {
          anim = Anim.Hit;
          start = hitAt;
          loop = false;
        } else if (s.state === State.Routing || speed > s.s.speed * 1.2) anim = Anim.Run;
        else if (speed > 3) anim = s.cls === U.Knights && stance === 'wedge' && speed > s.s.speed * 0.7 ? Anim.Run : Anim.Walk;
        else if (s.state === State.Fighting && BRACING.has(stance)) anim = Anim.Brace;
        // Facing: the way they move, else at their foe, else the regiment's front.
        if (speed > 3 && anim !== Anim.Attack && anim !== Anim.Shoot) dir = dirFor(s.vx, s.vy, dir);
        else if (tgt && (anim === Anim.Attack || anim === Anim.Shoot)) dir = dirFor(tgt.x - s.x, tgt.y - s.y, dir);
        else dir = dirFor(reg.fx, reg.fy, dir);
        this.dirs[i] = dir;
      }
      const frames = this.frameTab[s.team]![kind * ANIM_COUNT + anim]!;
      const tpf = this.tpfTab[s.team]![anim]!;
      // Marching blocks step together: one phase per regiment, a hair's offset per file.
      // Everything else (idling, routing) keeps a per-man phase so a crowd doesn't pulse.
      const drilled = s.state === State.Fighting && (anim === Anim.Walk || anim === Anim.Run);
      const phase = drilled ? s.reg * 0.71 + Math.round(s.sx / Math.max(1, reg.spacing)) * 0.12 : (i % 7) * 1.37;
      let f = loop ? Math.floor((T + phase) / tpf) % frames : Math.min(frames - 1, Math.floor((T - start) / tpf));
      if (f < 0) f = 0;
      const [u, vv] = atlas.at(kind, anim, f, dir);
      // No white hit flash: with hundreds of men trading blows it strobed the whole field. The hit
      // animation's recoil carries the blow (as in Total War).
      const flash = 0;
      // Routers stagger: a pixel of jitter that changes every few ticks.
      let jx = 0;
      let jy = 0;
      if (s.state === State.Routing) {
        const h = Math.imul(i * 0x9e3779b1 + Math.floor(T / 3), 0x85ebca6b) >>> 0;
        jx = (h & 3) - 1.5;
        jy = ((h >>> 2) & 1) - 0.5;
      }
      const lv = hd ? this.hdLevel[s.team]![kind]! : 1;
      if (lv > 1) {
        const sh = this.hdSheet[s.team]![kind]!;
        const o = atlas.slot!(kind, anim, f, dir) * 6;
        const r = sh.rects;
        this.hdBatch[s.team]![kind]!.sprite(Math.round((fmx + jx) * m) / m, Math.round((fmy + jy) * m) / m, r[o]!, r[o + 1]!, r[o + 2]! / lv, r[o + 3]! / lv, r[o + 4]! / lv, r[o + 5]! / lv, fmy, 1, 1, 1, 1, flash);
      } else team[s.team as 0 | 1].sprite(Math.round(fmx + jx), Math.round(fmy + jy), u, vv, atlas.cellW, atlas.cellH, atlas.footX, atlas.footY, fmy, 1, 1, 1, 1, flash);
    }

    // Props and stakes.
    for (const p of this.ground.props) {
      const r = fx.get(`${p.kind}${p.variant}`);
      const mx = this.mapX(p.x, p.y);
      const my = this.mapY(p.x, p.y);
      if (mx < x0 - 40 || mx > x1 + 40 || my < y0 || my > y1 + 40) continue;
      gfx.fx.sprite(Math.round(mx), Math.round(my), r.u, r.v, r.w, r.h, r.ax, r.ay, my);
    }
    for (const k of b.stakes) {
      const r = fx.get(`stake${k.team === 0 ? 0 : 1}`);
      for (let y = k.y0; y <= k.y1; y += 3) {
        const mx = this.mapX(k.x, y);
        const my = this.mapY(k.x, y);
        gfx.fx.sprite(Math.round(mx), Math.round(my), r.u, r.v, r.w, r.h, r.ax, r.ay, my);
      }
    }

    // Standards over each regiment, showing its morale: full and waving when steady, torn and
    // flickering when wavering, dropped in the dirt when broken, raised again on a rally. At
    // zoom 2+ a stance glyph above and a morale pip bar beside the pole.
    const closeUp = this.camera.zoom >= 2;
    for (let i = 0; i < b.regiments.length; i++) {
      const r = b.regiments[i]!;
      if (r.alive < 4 || r.role === 'siege' || r.role === 'skirmish') continue;
      const ms = moraleOf(r);
      if (ms === 'shattered') continue;
      const cx = this.regX[i]! + (r.cx - this.regX[i]!) * alpha;
      const cy = this.regY[i]! + (r.cy - this.regY[i]!) * alpha;
      const mx = Math.round(this.mapX(cx, cy));
      const my = this.mapY(cx, cy);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 30) continue;
      const cmd = r.role === 'command';
      if (ms === 'broken') {
        const d = fx.get(`dropped${cmd ? 'cmd' : ''}${r.team}`);
        gfx.fx.sprite(mx, Math.round(my), d.u, d.v, d.w, d.h, d.ax, d.ay, my - 0.5, 1, 1, 1, 1, 0, 1);
        continue;
      }
      const mounted = r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' || cmd;
      const wavering = ms === 'wavering';
      // Wavering cloth flaps fast and fitfully; a rallying standard is hoisted with a bob.
      const frame = wavering ? Math.floor(T * 1.3 + i * 1.3 + Math.sin(T * 0.7 + i) * 2) & 3 : Math.floor(T / 2.5 + i * 1.3) & 3; // & 3, not % 4: never negative (T < 0 before the first tick)
      const bob = ms === 'rallying' ? Math.round(Math.abs(Math.sin(T * 0.6)) * 3) : 0;
      if (wavering && Math.sin(T * 2.1 + i * 5.3) > 0.82) continue;
      const reg = fx.get(`${wavering ? 'torn' : ''}${cmd ? 'cmd' : wavering ? '' : 'ban'}${r.team}_${frame}`);
      const top = Math.round(my) - (mounted ? 14 : 9) - bob;
      gfx.fx.sprite(mx, top, reg.u, reg.v, reg.w, reg.h, reg.ax, reg.ay, my + 0.5, 1, 1, 1, 1, 0, 1);
      if (!closeUp) continue;
      const poleX = mx - reg.ax + (r.team === 1 ? 10 : 1);
      const stance = stanceOf(r);
      if (stance !== 'line' && !cmd) {
        const g = fx.get(`glyph_${stance}`);
        gfx.fx.sprite(poleX, top - reg.ay - 1, g.u, g.v, g.w, g.h, g.ax, g.ay, my + 0.6, 1, 1, 1, 1, 0, 1);
      }
      // Morale pips: five, beside the pole under the cloth, coloured by how close to breaking.
      const morale = Math.max(0, Math.min(100, (r as unknown as { morale?: number }).morale ?? 50));
      const lit = Math.ceil(morale / 20);
      const [pr, pg, pb] = morale > 60 ? [0.55, 0.75, 0.4] : morale > 30 ? [0.9, 0.7, 0.25] : [0.85, 0.2, 0.15];
      const px0 = r.team === 1 ? poleX - 7 : poleX + 2;
      const py = top - reg.ay + 10;
      gfx.fx.rect(px0 - 1, py - 1, 7, 3, my + 0.55, 0.07, 0.05, 0.04, 1);
      for (let k = 0; k < 5; k++) {
        const on = k < lit;
        gfx.fx.rect(px0 + (r.team === 1 ? 4 - k : k), py, 1, 1, my + 0.6, on ? pr : 0.25, on ? pg : 0.22, on ? pb : 0.2, 1);
      }
    }

    // Missiles in flight: an arc in the air, a dot of shadow on the ground.
    const shadowRegion = fx.get('puff1');
    for (const p of b.projectiles) {
      const span = Math.max(1, p.lands - p.born);
      const t = Math.min(1, Math.max(0, (T - p.born) / span));
      const gx = p.x0 + (p.x1 - p.x0) * t;
      const gy = p.y0 + (p.y1 - p.y0) * t;
      const mx = this.mapX(gx, gy);
      const my = this.mapY(gx, gy);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 100) continue;
      const dist = Math.sqrt((p.x1 - p.x0) ** 2 + (p.y1 - p.y0) ** 2);
      const look = MISSILE_CLS(p.cls, p.splash);
      const arc = look === 'bolt' || look === 'jav' ? 0.1 : look === 'stone' ? 0.45 : 0.3;
      const h = dist * arc * PX;
      const lift = 9;
      const z = 4 * h * t * (1 - t) + (1 - t) * lift;
      // Screen velocity of the missile: along the ground, minus the climb.
      const dz = (4 * h * (1 - 2 * t) - lift) / span;
      const sx = (this.mapX(p.x1, p.y1) - this.mapX(p.x0, p.y0)) / span;
      const sy = (this.mapY(p.x1, p.y1) - this.mapY(p.x0, p.y0)) / span - dz;
      gfx.soft.sprite(Math.round(mx), Math.round(my), shadowRegion.u, shadowRegion.v, 1, 1, 0, 0, my, 0.05, 0.04, 0.03, 0.45);
      let r: Region;
      if (look === 'stone') r = fx.get('stone');
      else {
        const a = Math.round((Math.atan2(sy, sx) / (Math.PI * 2)) * 16 + 16) % 16;
        r = this.missileRegions[look]![a]!;
      }
      gfx.fx.sprite(Math.round(mx), Math.round(my - z), r.u, r.v, r.w, r.h, r.ax, r.ay, my, 1, 1, 1, 1, 0, 1);
    }

    // Particles.
    const ps = this.particles;
    let w = 0;
    for (const p of ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === PK.Blood || p.kind === PK.Debris) {
        p.vz -= 120 * dt;
        if (p.z <= 0) {
          if (p.kind === PK.Blood && this.rng.next() < 0.35) {
            this.stamps.push({ tex: 2, x: Math.round(this.mapX(p.x, p.y)), y: Math.round(this.mapY(p.x, p.y)), u: 0, v: 0, w: 1, h: 1, ax: 0, ay: 0, shade: 1, a: 0.75, solid: true, r: 0.24, g: 0.05, b: 0.04 });
          }
          continue;
        }
      } else {
        const damp = Math.exp(-dt * 2.2);
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= Math.exp(-dt * 0.8);
      }
      ps[w++] = p;
      const mx = this.mapX(p.x, p.y);
      const my = this.mapY(p.x, p.y);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 60) continue;
      const fade = 1 - p.life / p.max;
      if (p.kind === PK.Blood || p.kind === PK.Debris) {
        gfx.fx.rect(Math.round(mx), Math.round(my - p.z), p.size, 1, my, p.r, p.g, p.b, 1);
      } else {
        const grow = p.kind === PK.Smoke ? p.life * 3.2 : p.life * 2.2;
        const r = this.puffRegions[Math.min(11, Math.ceil(p.size + grow))]!;
        const a = p.a * Math.min(1, fade * 1.6) * Math.min(1, p.life * 6);
        gfx.soft.sprite(Math.round(mx), Math.round(my - p.z), r.u, r.v, r.w, r.h, r.ax, r.ay, my + 2, p.r, p.g, p.b, a);
      }
    }
    ps.length = w;

    team[0].upload();
    team[1].upload();
    for (const row of this.hdBatch) for (const bt of row) bt.upload();
    gfx.fx.upload();
    gfx.soft.upload();
  }
}

export { TICK_S as SECONDS_PER_TICK } from '../../game/battle.ts';
