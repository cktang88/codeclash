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

import { Battle, facesRear, FIELD_H, FIELD_W, State, TICK_S, type Projectile } from '../../game/battle.ts';
import { Rng } from '../../game/rng.ts';
import { U } from '../../game/units.ts';
import { Anim, ANIM_COUNT, COMMANDER_KIND, KIND_COUNT, riseFrame, riseTicks, type Atlas, type Dir, type KindSheet, type SheetAsk, type Stance } from './contract.ts';
import { buildFx, type FxSheet, type Region } from './fx.ts';
import { HdField } from './field-hd.ts';
import { ANGLES, fxId, HOOVES, lookOf, PUFF_SIZES, PUFF_VARIANTS, SPLATS } from './fx-hd.ts';
import { Batch, cornerBuffer, dropTarget, SpriteProgram, SpriteStream, target, texture, texturePixels, type Part, type Target } from './gl.ts';
import { paintGround, type Ground } from './ground.ts';
import { projX, projY, PX, unproject } from './iso.ts';
import { GlPost } from './post.ts';
import { facing, ownFront, settleTurn, stillRising, turnVia, TURN_HOLD, TURN_STEP, type Vec } from './pose.ts';
import { AnimTrack, blankFacts, isGait, pickAnim } from './animstate.ts';
import { frameBox, nextZoomFloor, NO_INSETS, zoomOutScale, type Insets, type ZoomFloor } from './fit.ts';
import { upscaleCanvas } from './upscale.ts';
import { buildAtlas as buildClassic } from './sprites.ts';
import { buildAtlas as buildHd, buildAtlas64 as buildHd64 } from './sprites128.ts';
import { artMode, isHdArt, type ArtMode } from '../settings.ts';

export interface Camera {
  /**
   * Whole-number zoom: 1 fits the field, each step adds one screen pixel per scene pixel (HD:
   * doubles). Below 1 (a small screen framing the armies, see frame()): a fraction of zoom 1's scale.
   */
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
  /** HD: a spark off armour, a muzzle flash. */
  Spark,
  /** A mote of grave-light rising where the dead get up (U3): a pixel of green, drifting up and fading. */
  Wisp,
}

/**
 * What a hit body sheds (docs/art-references/undead.md: the dead fall to bone, never blood). The
 * living bleed; of the Hollow Host the ghouls (flesh) ooze a dark ichor, the wraiths (spirit) spill
 * witchfire, and every other (bone) throws bone chips and grave dust.
 */
const enum Shed {
  Blood,
  Ichor,
  Bone,
  Witchfire,
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
  /** HD: which variant of the puff sprite. */
  v: number;
  /** HD: battle second it was raised (steps run without frames when skipping or hidden). */
  t0: number;
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
  /**
   * The batches above go to the GPU through these, each drawn in one call per 4 textures (PARTS): the
   * alpha-tested sprites (twice: shadows, then solid), the blended ones, and the ground stamps.
   */
  solid: SpriteStream;
  softs: SpriteStream;
  stamps: SpriteStream;
  /** Detaches the context-loss listeners. */
  unlisten: () => void;
  /** The largest texture side the GPU takes (an HD sheet over it is drawn from a coarser level). */
  maxTex: number;
}

/** Int32s per entry of BattleScene.uvTab: u, v, w, h, ax, ay of a frame's trimmed quad, and whether the trim is known. */
const QUAD = 7;

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

// HD effects sheet ids (fx-hd.ts), resolved once.
const HD_ID = {
  dot: fxId('dot'),
  stone: fxId('stone'),
  stake: fxId('stake0'),
  puff: fxId(`puff${PUFF_SIZES[0]}_0`),
  arrow: fxId('arrow0'),
  bolt: fxId('bolt0'),
  jav: fxId('jav0'),
  // Decals (consecutive ids per family, see fx-hd.ts).
  splat: fxId('splat0'),
  hoof: fxId('hoof0'),
  crater: fxId('crater0'),
  stuck_arrow: fxId('stuck_arrow0'),
  stuck_bolt: fxId('stuck_bolt0'),
  stuck_jav: fxId('stuck_jav0'),
};

const MISSILE_CLS = (cls: number, splash: number): 'stone' | 'bolt' | 'jav' | 'arrow' =>
  splash > 0 ? 'stone' : cls === U.Crossbowmen ? 'bolt' : cls === U.Skirmishers ? 'jav' : 'arrow';

/** HD: a kind's sheet texture at a level, going up a band of rows at a time. */
interface HdTex {
  tex: WebGLTexture;
  sheet: KindSheet;
  t: number;
  k: number;
  L: number;
  /** Rows of the sheet uploaded so far. */
  rows: number;
  /** The whole sheet going up while this partial one (KindSheet.partial) is drawn. */
  next?: HdTex;
}
/** Frees an HD sheet texture (and the one going up to replace it). */
function dropHd(gl: WebGL2RenderingContext, h: HdTex): void {
  gl.deleteTexture(h.tex);
  if (h.next) gl.deleteTexture(h.next.tex);
}
const hdKey = (t: number, k: number, L: number) => (t * KIND_COUNT + k) * 16 + L;
/**
 * HD: bytes of sprite sheets sent to the GPU per frame at most (a real GPU takes a few ms for
 * this, software GL a few hundred). One band always goes, so a sheet never stalls.
 */
const HD_UPLOAD_BYTES = 8 << 20;
const MIN_BAND_ROWS = 32;

/** Sends the next rows of an HD sheet, within `budget` bytes (at least one band); returns the bytes sent. */
function uploadRows(gl: WebGL2RenderingContext, h: HdTex, budget: number): number {
  const sh = h.sheet;
  const row = sh.width * 4;
  const rows = Math.min(sh.height - h.rows, Math.max(MIN_BAND_ROWS, Math.floor(budget / row)));
  if (rows <= 0) return 0;
  gl.bindTexture(gl.TEXTURE_2D, h.tex);
  const px = sh.pixels;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, h.rows, sh.width, rows, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer, px.byteOffset + h.rows * row, rows * row));
  h.rows += rows;
  return rows * row;
}

/** Fills slot n of a reused parts list (skipping an empty batch); returns the next slot. */
function setPart(out: Part[], n: number, batch: Batch, tex: WebGLTexture, w: number, h: number, texel: number, src: number): number {
  if (batch.n === 0) return n;
  const p = out[n];
  if (p) {
    p.batch = batch;
    p.tex = tex;
    p.w = w;
    p.h = h;
    p.texel = texel;
    p.src = src;
  } else out[n] = { batch, tex, w, h, texel, src };
  return n + 1;
}

export class BattleScene {
  camera: Camera = { zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2 };
  /** The farthest zoom-out: 1, or the fraction below it that frame() needed to show everyone. */
  minZoom = 1;
  /** The floor frame() set and the canvas it was for: reframing on that canvas never raises it. */
  private floor: ZoomFloor | null = null;
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
  private hdTex = new Map<number, HdTex>();
  /** HD: the sheet drawn this frame per army and kind (null: the level-1 grid). */
  private hdSheet: (KindSheet | null)[][] = [new Array<KindSheet | null>(KIND_COUNT).fill(null), new Array<KindSheet | null>(KIND_COUNT).fill(null)];
  /** HD: the effects sheet Scale2x'd to 2x and 4x, made when first zoomed that far. */
  private fxHi = new Map<number, { tex: WebGLTexture; w: number; h: number }>();
  /** HD: the battlefield at the figures' texel density (ground, marks, decals; field-hd.ts). */
  private readonly field: HdField | null = null;
  /** HD: batches for ground decals, missiles and stakes (alpha-tested), and puffs (blended). */
  private hdFxB: { decal: Batch; fx: Batch; soft: Batch; std: Batch } | null = null;
  /** HD: its own randomness, so the classic effects' sequence is untouched. */
  private readonly hdRng = new Rng(11);
  /** HD: blood still spreading from the fallen: map point, radius, amount, tick due. */
  /** HD: dust particles alive (counted each frame). */
  private dustN = 0;
  private pools: { x: number; y: number; r: number; a: number; ichor: boolean; at: number }[] = [];
  /** The atlas image versions last uploaded (HD grids fill in the background). */
  private atlasVer = [0, 0];
  /** How many of each atlas's landed grid strips (Atlas.landed) its texture holds. */
  private atlasStrips = [0, 0];
  private kindsPresent: number[][] = [[], []];
  /** HD: kinds of each army seen in view last frame (bit per kind): only they get the 8x sheets. */
  private seen = [0, 0];
  /** HD art: kinds of each army with corpses in view last frame. */
  private seenDead = [0, 0];
  /** HD: kinds of each army within a screen of the view last frame, not in it (frame-perf: their sheets up to 4x are prefetched for a scroll). */
  private seenNear = [0, 0];

  private prevX: Float32Array;
  private prevY: Float32Array;
  private prevHp: Float64Array;
  private hurtAt: Float32Array;
  private dirs: Uint8Array;
  /** When (tick + alpha) each man last turned (pose.ts settleTurn), and the facing he turned from. */
  private turnAt: Float32Array;
  private leftDir: Uint8Array;
  /** Each man's clip, its start and stride across frames (animstate.ts). */
  private anims: AnimTrack;
  private readonly facts = blankFacts();
  /** Scratch for each man's own front (pose.ts ownFront). */
  private readonly front: Vec = { x: 1, y: 0 };
  /** The way each man last moved (world velocity above a crawl): a walker who pauses a tick keeps facing it. */
  private moveX: Float32Array;
  private moveY: Float32Array;
  /** World direction of each man's latest shot (NaN: none yet): an archer faces where he looses. */
  private aimX: Float32Array;
  private aimY: Float32Array;
  private stamped: Uint8Array;
  /** Figures whose rising from the dead (Soldier.roseAt) has had its grave-light. */
  private rose: Uint8Array;
  /** Where each risen man lay when he rose (NaN: not seen rising; pose.ts stillRising). */
  private riseX: Float32Array;
  private riseY: Float32Array;
  private regX: Float32Array;
  private frameTab: Uint16Array[] = [];
  private lenTab: Float32Array[] = [];
  private tpfTab: Float32Array[] = [];
  /** Melee blows per kind, per army (Atlas.blows; 1 when the painter has one). */
  private blowTab: Uint8Array[] = [];
  /**
   * Per army, the atlas cell (u, v) and HD slot of every (kind, anim, frame, dir), filled on first
   * use (-1: not yet): the atlas answers with a fresh array, and the per-figure loop asks thousands
   * of times a frame. `maxF` is the most frames any kind's animation has (blows included).
   */
  private uvTab: Int32Array[] = [];
  private slotTab: Int32Array[] = [];
  private maxF = 1;
  /** The props' regions and map points (they never move). */
  private propDraw: { r: Region; mx: number; my: number }[] = [];
  private missileRegions: Record<string, Region[]> = {};
  private puffRegions: Region[] = [];
  private stakeRegions: Region[] = [];
  private regY: Float32Array;
  private flying = new Set<Projectile>();
  private particles: Particle[] = [];
  /** Dead particles, for spawn() to reuse. */
  private spare: Particle[] = [];
  private stamps: Stamp[] = [];
  private time = 0;
  /** Last frame's view, for toWorld and pan. */
  /** What the last frame drew (draw() skips a paused frame that would be the same). */
  private last = { canvas: null as HTMLCanvasElement | null, W: 0, H: 0, tick: -1, alpha: -1, zoom: 0, cx: 0, cy: 0, scan: true, v0: -1, v1: -1, settled: false };
  /** Whether the last frame drew everything at its final look (no sheet still painting or going up). */
  private settled = false;
  /** Paused frames not drawn because nothing changed (for tools). */
  skipped = 0;
  /** Stream parts, reused frame to frame (setPart). */
  private readonly solidParts: Part[] = [];
  private readonly softParts: Part[] = [];
  private readonly stampParts: Part[] = [];
  private view = { px: 1, m: 1, u: 1, bw: 1, bh: 1, vw: 1, vh: 1, camX: 0, camY: 0, offX: 0, offY: 0, W: 1, H: 1, direct: false, tw: 1, th: 1 };

  /**
   * `from`: the scene that drew this battle until now (the art was switched mid-battle): its
   * camera, facings, wounds and last snapshot carry over, so nothing turns, jumps or flinches.
   */
  constructor(readonly battle: Battle, art: ArtMode = artMode(), from?: BattleScene) {
    this.art = art;
    this.ground = paintGround(battle.setup.seed);
    if (isHdArt(art)) this.field = new HdField(this.ground, battle.setup.armies);
    const [a, b] = battle.setup.armies;
    const buildAtlas = art === 'hd64' ? buildHd64 : art === 'hd' ? buildHd : buildClassic;
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
          for (const lv of [2, 4]) for (const k of this.kindsPresent[t]!) atlas.sheet!(k, lv, 'prefetch');
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
      const blows = new Uint8Array(KIND_COUNT);
      for (let k = 0; k < KIND_COUNT; k++) blows[k] = Math.max(1, Math.min(255, atlas.blows?.(k) ?? 1));
      this.blowTab.push(blows);
      this.lenTab.push(lens);
      this.tpfTab.push(tpf);
      for (let k = 0; k < KIND_COUNT; k++) for (let an = 0; an < ANIM_COUNT; an++) this.maxF = Math.max(this.maxF, frames[k * ANIM_COUNT + an]! * (an === Anim.Attack ? blows[k]! : 1));
    }
    for (let t = 0; t < 2; t++) {
      this.uvTab.push(new Int32Array(KIND_COUNT * ANIM_COUNT * this.maxF * 4 * QUAD));
      this.slotTab.push(new Int32Array(KIND_COUNT * ANIM_COUNT * this.maxF * 4).fill(-1));
    }
    this.propDraw = this.ground.props.map((p) => ({ r: this.fxSheet.get(`${p.kind}${p.variant}`), mx: this.mapX(p.x, p.y), my: this.mapY(p.x, p.y) }));
    for (const look of ['arrow', 'bolt', 'jav']) this.missileRegions[look] = Array.from({ length: 16 }, (_, i) => this.fxSheet.get(`${look}${i}`));
    this.stakeRegions = [this.fxSheet.get('stake0'), this.fxSheet.get('stake1')];
    const sizes = [1, 2, 3, 4, 5, 6, 7, 9, 11];
    for (let d = 0; d <= 11; d++) this.puffRegions[d] = this.fxSheet.get(`puff${sizes.find((q) => q >= d) ?? 11}`);
    const n = battle.soldiers.length;
    this.prevX = new Float32Array(n);
    this.prevY = new Float32Array(n);
    this.prevHp = new Float64Array(n);
    this.hurtAt = new Float32Array(n).fill(-100);
    this.dirs = new Uint8Array(n);
    this.turnAt = new Float32Array(n).fill(-100);
    this.leftDir = new Uint8Array(n).fill(255);
    this.anims = new AnimTrack(n);
    this.moveX = new Float32Array(n);
    this.moveY = new Float32Array(n);
    this.aimX = new Float32Array(n).fill(NaN);
    this.aimY = new Float32Array(n).fill(NaN);
    this.stamped = new Uint8Array(n);
    this.rose = new Uint8Array(n);
    this.riseX = new Float32Array(n).fill(NaN);
    this.riseY = new Float32Array(n).fill(NaN);
    this.regX = new Float32Array(battle.regiments.length);
    this.regY = new Float32Array(battle.regiments.length);
    for (let i = 0; i < n; i++) {
      const s = battle.soldiers[i]!;
      this.dirs[i] = s.team === 0 ? 0 : 2;
    }
    this.snapshot();
    if (from && from.battle === battle) {
      this.dirs.set(from.dirs);
      this.riseX.set(from.riseX);
      this.riseY.set(from.riseY);
      this.turnAt.set(from.turnAt);
      this.leftDir.set(from.leftDir);
      this.anims.copy(from.anims);
      this.moveX.set(from.moveX);
      this.moveY.set(from.moveY);
      this.hurtAt.set(from.hurtAt);
      this.aimX.set(from.aimX);
      this.aimY.set(from.aimY);
      this.prevX.set(from.prevX);
      this.prevY.set(from.prevY);
      this.prevHp.set(from.prevHp);
      this.regX.set(from.regX);
      this.regY.set(from.regY);
      this.flying = new Set(from.flying);
      this.time = from.time;
      this.camera = { ...from.camera };
      this.minZoom = from.minZoom;
      this.floor = from.floor;
      this.scanlines = from.scanlines;
      this.follow = from.follow;
    }
    // The fallen already down (a scene made mid-battle) lie as corpses at once: afterStep only
    // lays them as they finish falling, and a paused or finished battle steps no more.
    const tick = battle.tick;
    for (let i = 0; i < n; i++) {
      const s = battle.soldiers[i]!;
      if (s.roseAt >= 0) this.rose[i] = 1;
      if (s.state !== State.Dead || tick - s.diedAt < this.dieTicks(s.team, this.kindOf(i))) continue;
      if (!this.field) {
        // A corpse the Lich-Marshal may yet raise stays off the ground (it is drawn as a figure).
        if (battle.mayRise(i)) continue;
        this.stampCorpse(i);
        continue;
      }
      // HD: drawn as a corpse, his pool soaked in already (as dark as its age says).
      this.stamped[i] = 1;
      const big = s.s.mounted ? 1.7 : 1;
      const mx = this.mapX(s.x, s.y);
      const my = this.mapY(s.x, s.y);
      for (let k = 0; k < 4; k++) this.field.mark(mx + (k - 1.5) * 0.8 * big, my, (1.8 + k * 0.85) * big, 0.3, 0, s.diedAt * TICK_S);
    }
  }

  /**
   * After an art switch: the zoom level of this scene's ladder that draws closest to `prev`'s scale
   * on a canvas of W × H (the two arts' ladders differ: classic adds a pixel a level, HD doubles).
   */
  matchZoom(prev: BattleScene, W: number, H: number): void {
    // Below 1 the scale is the same fraction of zoom 1's in every art.
    if (prev.camera.zoom < 1) {
      this.camera.zoom = prev.camera.zoom;
      return;
    }
    const want = prev.pixelScale(W, H);
    let best = 1;
    for (let z = 1; z <= this.maxZoom; z++) if (Math.abs(Math.log(this.scaleAt(W, H, z) / want)) < Math.abs(Math.log(this.scaleAt(W, H, best) / want)) - 1e-9) best = z;
    this.camera.zoom = best;
  }

  /** Whether this browser can draw battles at all. */
  static supported(): boolean {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      // A probe: hand the context back at once (browsers keep only so many).
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!gl;
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
    if (this.field) {
      this.afterStepHd(this.field);
      return;
    }
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
        const shed = this.shedOf(i);
        // A ring of single drops bursting outward (see docs/art-references/battle-effects.md); a ghoul's dark ichor (v 2).
        const ichor = shed === Shed.Ichor;
        const a0 = rng.next() * Math.PI * 2;
        if (shed === Shed.Bone || shed === Shed.Witchfire) this.shedDry(shed, s.x, s.y, h, dead, rng);
        else for (let k = 0; k < n * 2; k++) {
          const a = a0 + (k / (n * 2)) * Math.PI * 2;
          const sp = 14 + rng.next() * 18;
          const dark = rng.next() < 0.5;
          if (ichor) this.spawn(PK.Blood, s.x, s.y, h + rng.next() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 6 + rng.next() * 18, 0.9, 1, dark ? 0.1 : 0.17, dark ? 0.11 : 0.19, dark ? 0.07 : 0.11, 1, 2);
          else this.spawn(PK.Blood, s.x, s.y, h + rng.next() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 6 + rng.next() * 18, 0.9, 1, dark ? 0.42 : 0.6, 0.05, 0.04, 1);
        }
        if (shed === Shed.Blood && rng.next() < 0.12) this.stampFx(`splat${rng.int(4)}`, s.x + (rng.next() - 0.5) * 4, s.y + (rng.next() - 0.5) * 4, 0.7);
      }
      if (s.state === State.Dead) {
        // (Classic stamps corpses into the ground for good: one that may yet rise waits, drawn as a figure.)
        if (!this.stamped[i] && tick - s.diedAt >= this.dieTicks(s.team, this.kindOf(i)) && !b.mayRise(i)) this.stampCorpse(i);
        continue;
      }
      if (s.roseAt >= 0 && !this.rose[i]) this.graveLight(i);
      // Hooves and marching feet raise dust.
      const v2 = s.vx * s.vx + s.vy * s.vy;
      if (s.s.mounted ? v2 > 700 && rng.next() < 0.3 : v2 > 100 && rng.next() < 0.02) {
        const big = s.s.mounted ? 1 : 0;
        this.spawn(PK.Dust, s.x - s.vx * 0.06, s.y - s.vy * 0.06, 1, -s.vx * 0.1 + (rng.next() - 0.5) * 6, -s.vy * 0.1 + (rng.next() - 0.5) * 6, 2 + rng.next() * 3, 1.4 + rng.next() * 1.2 + big, 2 + big * 2, 0.46, 0.4, 0.3, 0.22);
      }
    }
    // Missiles that came down this tick.
    const now = new Set(b.projectiles);
    this.aimShots();
    for (const p of this.flying) {
      if (now.has(p)) continue;
      if (p.splash > 0) this.impact(p.x1, p.y1);
      else if (rng.next() < 0.3) this.stampFx(`stuck${rng.int(3)}`, p.x1, p.y1, 1);
    }
    this.flying = now;
  }

  /** Records the direction of the shots loosed this tick (call before `flying` is replaced). */
  private aimShots(): void {
    for (const p of this.battle.projectiles) {
      if (this.flying.has(p) || p.shooter < 0 || p.shooter >= this.aimX.length) continue;
      this.aimX[p.shooter] = p.x1 - p.x0;
      this.aimY[p.shooter] = p.y1 - p.y0;
    }
  }

  private kindOf(i: number): number {
    const s = this.battle.soldiers[i]!;
    return s.commander ? COMMANDER_KIND : s.cls;
  }

  /** Index of (kind, anim, frame, dir) in uvTab/slotTab, or -1 if the frame is out of the table. */
  private cellIndex(kind: number, anim: Anim, f: number, dir: Dir): number {
    if (f < 0 || f >= this.maxF) return -1;
    return ((kind * ANIM_COUNT + anim) * this.maxF + f) * 4 + dir;
  }

  /**
   * The quad of a frame in the atlas (cached Atlas.at and Atlas.trim): its u, then v, size and
   * foot point in cellV, cellW, cellH, cellAx, cellAy. The quad is the cell trimmed to what it
   * paints (the whole cell while the painter does not know that yet).
   */
  private cellU(team: number, kind: number, anim: Anim, f: number, dir: Dir): number {
    const i = this.cellIndex(kind, anim, f, dir);
    const tab = this.uvTab[team]!;
    if (i < 0) {
      this.cellQuad(team, kind, anim, f, dir, this.quadTmp, 0);
      this.cellV = this.quadTmp[1]!;
      this.cellW = this.quadTmp[2]!;
      this.cellH = this.quadTmp[3]!;
      this.cellAx = this.quadTmp[4]!;
      this.cellAy = this.quadTmp[5]!;
      return this.cellCut(team, this.quadTmp[0]!);
    }
    const o = i * QUAD;
    if (tab[o + 6]! <= 0) this.cellQuad(team, kind, anim, f, dir, tab, o);
    this.cellV = tab[o + 1]!;
    this.cellW = tab[o + 2]!;
    this.cellH = tab[o + 3]!;
    this.cellAx = tab[o + 4]!;
    this.cellAy = tab[o + 5]!;
    return this.cellCut(team, tab[o]!);
  }
  /**
   * The quad's offset in its cell (cellCutX, cellCutY: gl.ts Batch.sprite's cut). Zoomed out
   * (view.direct) the quad also grows a px on each side inside its cell, so its edge runs through
   * clear texels: a pixel whose pick falls a rounding error either side of it shows what the whole
   * cell would show there (nothing). Returns u.
   */
  private cellCut(team: number, u: number): number {
    const a = this.atlases[team as 0 | 1];
    let cx = a.footX - this.cellAx;
    let cy = a.footY - this.cellAy;
    if (this.view.direct && this.cellW > 0 && (this.cellW < a.cellW || this.cellH < a.cellH)) {
      const x0 = Math.max(0, cx - 1), y0 = Math.max(0, cy - 1);
      const x1 = Math.min(a.cellW, cx + this.cellW + 1), y1 = Math.min(a.cellH, cy + this.cellH + 1);
      u -= cx - x0;
      this.cellV -= cy - y0;
      this.cellAx += cx - x0;
      this.cellAy += cy - y0;
      this.cellW = x1 - x0;
      this.cellH = y1 - y0;
      cx = x0;
      cy = y0;
    }
    this.cellCutX = cx;
    this.cellCutY = cy;
    return u;
  }
  /** Writes a frame's quad (u, v, w, h, ax, ay, known) at out[o]; known = 0 while its trim is not known. */
  private cellQuad(team: number, kind: number, anim: Anim, f: number, dir: Dir, out: Int32Array, o: number): void {
    const atlas = this.atlases[team as 0 | 1];
    const [u, v] = atlas.at(kind, anim, f, dir);
    const other = this.atlases[(1 - team) as 0 | 1];
    const box = atlas.trim && other.cellW === atlas.cellW && other.cellH === atlas.cellH ? atlas.trim(u, v) : null;
    const [x, y, w, h] = box ?? [0, 0, atlas.cellW, atlas.cellH];
    out[o] = u + x;
    out[o + 1] = v + y;
    out[o + 2] = w;
    out[o + 3] = h;
    out[o + 4] = atlas.footX - x;
    out[o + 5] = atlas.footY - y;
    out[o + 6] = box || !atlas.trim ? 1 : 0;
  }
  private readonly quadTmp = new Int32Array(QUAD);
  /** v, size and foot point of the last cellU()'s quad. */
  private cellV = 0;
  private cellW = 0;
  private cellH = 0;
  private cellAx = 0;
  private cellAy = 0;
  private cellCutX = 0;
  private cellCutY = 0;

  /** The HD sheet slot of a frame (cached Atlas.slot). */
  private slotOf(team: number, kind: number, anim: Anim, f: number, dir: Dir): number {
    const i = this.cellIndex(kind, anim, f, dir);
    const atlas = this.atlases[team as 0 | 1];
    if (i < 0) return atlas.slot!(kind, anim, f, dir);
    const tab = this.slotTab[team]!;
    let o = tab[i]!;
    if (o < 0) o = tab[i] = atlas.slot!(kind, anim, f, dir);
    return o;
  }

  private riseTicksOf(team: number, kind: number): number {
    return riseTicks(this.frameTab[team]![kind * ANIM_COUNT + Anim.Die]!, this.tpfTab[team]![Anim.Die]!);
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

  private spawn(kind: PK, x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, r: number, g: number, b: number, a: number, v = 0): void {
    // Smoke and sparks (HD), and the grave-light's green (any art), get a reserve of their own
    // (a melee's blood can fill the rest).
    if (this.particles.length >= MAX_PARTICLES + ((this.field && (kind === PK.Smoke || kind === PK.Spark)) || kind === PK.Wisp || (kind === PK.Smoke && g > r * 2) ? 800 : 0)) return;
    // HD: dust gives way, so marching thousands never crowd out blood, sparks and gun smoke.
    if (this.field && kind === PK.Dust && this.dustN++ >= MAX_PARTICLES / 2) return;
    // Dead particles are reused (thousands a second in a melee), all of one shape.
    const p = this.spare.pop();
    const t0 = this.battle.tick * TICK_S;
    if (!p) {
      this.particles.push({ kind, x, y, z, vx, vy, vz, life: 0, max, size, r, g, b, a, v, t0 });
      return;
    }
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = 0;
    p.max = max;
    p.size = size;
    p.r = r;
    p.g = g;
    p.b = b;
    p.a = a;
    p.v = v;
    p.t0 = t0;
    this.particles.push(p);
  }

  private mapX(x: number, y: number): number {
    return projX(x, y) - this.ground.ox;
  }
  private mapY(x: number, y: number): number {
    return projY(x, y) - this.ground.oy;
  }

  /**
   * A man raised from the dead (U3): his corpse is no longer drawn on the ground (he gets up out
   * of it, see `build`), and a faint green grave-light rises from where he lay.
   */
  private graveLight(i: number): void {
    this.rose[i] = 1;
    this.stamped[i] = 0;
    const s = this.battle.soldiers[i]!;
    this.riseX[i] = s.x;
    this.riseY[i] = s.y;
    const rng = this.field ? this.hdRng : this.rng;
    // A wisp of the faction's grave-green (docs/art-references/undead.md: one green light source)
    // seeping up out of the ground as he gets up, thinning as it rises.
    for (let k = 0; k < 6; k++) {
      this.spawn(PK.Smoke, s.x + (rng.next() - 0.5) * 5, s.y + (rng.next() - 0.5) * 3, 1 + k * 1.5, (rng.next() - 0.5) * 3, (rng.next() - 0.5) * 3, 7 + rng.next() * 6, 1.6 + rng.next() * 1.2, 2 + rng.int(3), 0.42, 1, 0.5, 0.6, rng.int(PUFF_VARIANTS));
    }
    for (let k = 0; k < 10; k++) {
      this.spawn(PK.Wisp, s.x + (rng.next() - 0.5) * 6, s.y + (rng.next() - 0.5) * 4, rng.next() * 3, (rng.next() - 0.5) * 4, (rng.next() - 0.5) * 4, 10 + rng.next() * 12, 0.8 + rng.next() * 1.2, 1, 0.55, 1, 0.55, 1);
    }
  }

  private stampFx(name: string, x: number, y: number, a: number, shade = 1): void {
    const r = this.fxSheet.get(name);
    this.stamps.push({ tex: 2, x: Math.round(this.mapX(x, y)), y: Math.round(this.mapY(x, y)), u: r.u, v: r.v, w: r.w, h: r.h, ax: r.ax, ay: r.ay, shade, a, solid: false, r: 0, g: 0, b: 0 });
  }

  private stampCorpse(i: number): void {
    this.stamped[i] = 1;
    const s = this.battle.soldiers[i]!;
    const rng = this.rng;
    // (The undead leave no red pool: bone falls dry, a ghoul's ichor is in the drops.)
    const pools = this.shedOf(i) !== Shed.Blood ? 0 : s.s.mounted ? 2 : 1;
    for (let k = 0; k < pools; k++) this.stampFx(`pool${rng.int(6)}`, s.x + (rng.next() - 0.5) * 3 * pools, s.y + (rng.next() - 0.5) * 3, 0.7);
    this.restampCorpse(i);
  }

  /** The body alone (after a lost context wiped the ground). */
  private restampCorpse(i: number): void {
    const s = this.battle.soldiers[i]!;
    const kind = this.kindOf(i);
    const u = this.cellU(s.team, kind, Anim.Dead, 0, this.dirs[i] as Dir);
    this.stamps.push({ tex: s.team, x: Math.round(this.mapX(s.x, s.y)), y: Math.round(this.mapY(s.x, s.y)), u, v: this.cellV, w: this.cellW, h: this.cellH, ax: this.cellAx, ay: this.cellAy, shade: 0.78, a: 1, solid: false, r: 0, g: 0, b: 0 });
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
      this.last.settled = false;
      // The HD sheets' textures and batches died with the context; they are rebuilt on demand.
      this.hdBatch = [];
      this.hdTex.clear();
      this.fxHi.clear();
      this.field?.lost();
      this.hdFxB = null;
      this.atlasVer = [-1, -1];
      this.stamps.length = 0;
      // HD keeps its marks and decals on the CPU and draws the dead each frame.
      if (!this.field) for (let i = 0; i < this.stamped.length; i++) if (this.stamped[i]) this.restampCorpse(i);
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
      solid: new SpriteStream(gl, corners),
      softs: new SpriteStream(gl, corners),
      stamps: new SpriteStream(gl, corners),
      unlisten,
      maxTex: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096,
    };
    // Trimmed grid quads are cut from cells this size (both armies' atlases come from one painter).
    gfx.prog.cell(this.atlases[0].cellW, this.atlases[0].cellH);
    // The atlas textures hold the grids as they are now.
    for (let t = 0; t < 2; t++) {
      this.atlasVer[t] = this.atlases[t as 0 | 1].version ?? 0;
      this.atlasStrips[t] = this.atlases[t as 0 | 1].landed?.length ?? 0;
    }
    gfx.groundQuad.sprite(0, 0, 0, 0, g.w, g.h, 0, 0, -1e6);
    gfx.groundQuad.upload();
    this.gfx = gfx;
    return gfx;
  }

  /** HD tools: composes the ground at the next draw, from scratch or only what changed (field-hd.ts). */
  invalidateGround(full = true): void {
    this.field?.invalidate(full);
    this.last.settled = false;
  }

  /**
   * Frees the GL resources. The canvas's context stays for the next scene on it, unless `release`
   * (the canvas is going away): then the context is given back too, as the browser keeps only a
   * few and would otherwise hold this one until the canvas is collected.
   */
  dispose(release = false): void {
    const g = this.gfx;
    if (!g) return;
    this.disposeGl(g);
    if (release && !g.gl.isContextLost()) g.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private disposeGl(g: Gfx): void {
    g.unlisten();
    this.gfx = null;
    this.last.settled = false;
    const gl = g.gl;
    const hdBatches = [...this.hdBatch.flat(), ...(this.hdFxB ? [this.hdFxB.decal, this.hdFxB.fx, this.hdFxB.soft, this.hdFxB.std] : [])];
    this.hdFxB = null;
    const hdTextures = [...[...this.hdTex.values()].flatMap((h) => (h.next ? [h.tex, h.next.tex] : [h.tex])), ...[...this.fxHi.values()].map((f) => f.tex)];
    this.hdBatch = [];
    this.hdTex.clear();
    this.fxHi.clear();
    // A lost context has already freed everything.
    if (gl.isContextLost()) {
      this.field?.lost();
      return;
    }
    this.field?.dispose();
    for (const b of [...g.team, g.fx, g.soft, g.groundQuad, ...g.stamp, ...hdBatches]) b.dispose();
    for (const st of [g.solid, g.softs, g.stamps]) st.dispose();
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

  /** Device pixels per map pixel for a canvas of this size at zoom level `zoom`. */
  scaleAt(W: number, H: number, zoom: number): number {
    return this.scales(W, H, zoom).s;
  }

  /** Bytes of sprite textures on the GPU: both armies' grids and the HD sheets uploaded now. */
  get spriteGpuBytes(): number {
    let b = 0;
    for (const a of this.atlases) b += a.image.width * a.image.height * 4;
    for (const h of this.hdTex.values()) b += h.rows * h.sheet.width * 4 + (h.next ? h.next.rows * h.next.sheet.width * 4 : 0);
    return b;
  }

  /**
   * HD art: the most scene-buffer pixels per map pixel (and so the finest sprite, ground and
   * effects level drawn). HD 64 stops at 4, half of HD: its top sprite sheet is the 128 art halved
   * to 4 texels per map pixel, and closer zooms only magnify it, ground and effects included.
   */
  get hdDensity(): number {
    return this.art === 'hd64' ? 4 : 8;
  }

  /** Highest zoom level for this scene's art. */
  get maxZoom(): number {
    return isHdArt(this.art) ? MAX_ZOOM_HD : MAX_ZOOM;
  }

  /**
   * The zoom ladder. s: device px per map px; m: scene-buffer px per map px; u: device px per
   * buffer px (the post shader's whole-number upscale). Classic art: m = 1, and each level adds a
   * device pixel. HD art: each level doubles s, and the buffer draws the map m = 2, 4 or 8 times
   * larger, so the 2x, 4x and 8x sprite sheets land texel for pixel and never blur.
   */
  private scales(W: number, H: number, zoom = this.camera.zoom): { s: number; m: number; u: number } {
    const [fw, fh] = this.fieldPx();
    // Fit the field, rounding up a little: the parallelogram's far corners are mostly empty.
    const fit = Math.max(1, Math.floor(Math.min(W / (fw * 0.92), H / (fh * 1.15)) + 0.3));
    if (zoom < 1) {
      // Zoomed out past 1 (the armies framed on a small screen): whole device px per map px down
      // to 1, then a fraction, the buffer drawn a map px a pixel and blown down nearest (post.ts).
      const s = zoomOutScale(zoom, fit, W, H);
      const m = s >= 1 && isHdArt(this.art) ? [8, 4, 2, 1].find((l) => s % l === 0 && l <= this.hdDensity)! : 1;
      return { s, m, u: s / m };
    }
    const z = Math.max(1, Math.round(zoom));
    if (!isHdArt(this.art)) {
      const s = fit + z - 1;
      return { s, m: 1, u: s };
    }
    const s = fit * 2 ** (z - 1);
    const m = [8, 4, 2, 1].find((l) => s % l === 0 && l <= this.hdDensity)!;
    return { s, m, u: s / m };
  }

  /**
   * Zooms to `level` keeping the field point under device pixel (x, y) of `out` where it is
   * (wheel, pinch, double-click). Zoom levels are whole numbers: each adds one device pixel per
   * scene pixel, so the scene buffer shrinks and sprites grow, never blur.
   */
  zoomAt(out: HTMLCanvasElement, level: number, x: number, y: number): void {
    const [bx, by] = this.toWorld(out, x, y);
    this.camera.zoom = level < 1 ? this.minZoom : Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(level)));
    this.layout(out.width, out.height);
    const [ax, ay] = this.toWorld(out, x, y);
    this.camera.cx += bx - ax;
    this.camera.cy += by - ay;
    this.layout(out.width, out.height);
  }

  /** The next zoom level in (+1) or out (-1) from the current one. */
  nextZoom(dir: 1 | -1): number {
    const z = this.camera.zoom;
    if (dir > 0) return z < 1 ? 1 : Math.min(this.maxZoom, Math.round(z) + 1);
    return z <= 1 ? this.minZoom : Math.round(z) - 1;
  }

  /**
   * The default view: everyone on the field (at the start, the whole deployment) framed in the
   * part of a W × H canvas the HUD leaves clear (`insets`, device px), at zoom 1 when they fit
   * there, else zoomed out below 1 just enough (frameBox). That zoom becomes the floor of the
   * zoom-out, unless an earlier frame on this canvas set a lower one (nextZoomFloor). An empty field: the whole field, as fit().
   */
  frame(W: number, H: number, insets: Insets = NO_INSETS): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of this.battle.soldiers) {
      if (s.state === State.Fled) continue;
      const mx = this.mapX(s.x, s.y);
      const my = this.mapY(s.x, s.y);
      if (!(mx === mx && my === my)) continue;
      if (mx < x0) x0 = mx;
      if (mx > x1) x1 = mx;
      if (my < y0) y0 = my;
      if (my > y1) y1 = my;
    }
    // The figures stand up from their feet, a horseman's standard ~35 map px over him.
    const box = x1 >= x0 ? { x0: x0 - 14, y0: y0 - 38, x1: x1 + 14, y1: y1 + 6 } : null;
    const f = frameBox(box, W, H, insets, this.scaleAt(W, H, 1));
    // The floor only ever goes further out on this canvas (⤢ mid-battle keeps the opening one).
    this.floor = nextZoomFloor(this.floor, f ? f.zoom : 1, W, H);
    this.minZoom = this.floor.zoom;
    if (!f) {
      this.fit();
      return;
    }
    this.camera.zoom = f.zoom;
    [this.camera.cx, this.camera.cy] = unproject(f.mx + this.ground.ox, f.my + this.ground.oy);
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
    // Zoomed out below a device px per buffer px, the buffer would be larger than the canvas (up
    // to 1 / MIN_SCALE² as many px) only for the post pass to keep one px in so many: the scene is
    // drawn at the canvas's size instead, each device px as the buffer px it would show (the
    // same picture, a fraction of the fill).
    const direct = u < 1 && !this.bufferOnly;
    this.view = { px, m, u, bw, bh, vw, vh, camX, camY, offX: Math.floor((W - bw * u) / 2), offY: Math.floor((H - bh * u) / 2), W, H, direct, tw: direct ? W : bw, th: direct ? H : bh };
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

  /** Tools: zoomed out, draw the buffer larger than the canvas as before (to compare). */
  bufferOnly = false;

  /** CPU ms of the last drawn frame's parts (tools: battle-render-bench.mjs). */
  readonly lastPasses = { upload: 0, build: 0, ground: 0, shadows: 0, sprites: 0, post: 0 };
  /** Tools: wait for the GPU after each part of a frame, so lastPasses times the GPU's work too. */
  syncPasses = false;
  private readonly px1 = new Uint8Array(4);
  private fence(gl: WebGL2RenderingContext): void {
    if (this.syncPasses) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px1);
  }

  /** Paints the battle onto `out` (a WebGL2 canvas this scene owns) at tick + alpha. */
  draw(out: HTMLCanvasElement, alpha: number, dt: number): void {
    const t0 = performance.now();
    // A collapsed canvas (display: none, a 0-height flex child) has nothing to draw into, and a
    // 0×0 scene buffer would be an incomplete framebuffer.
    if (out.width < 1 || out.height < 1) return;
    const gfx = this.init(out);
    if (!gfx) return;
    // Paused (no time passes) with nothing changed and nothing still loading: the canvas already
    // shows this frame (the page keeps it until something is drawn), so draw nothing.
    const f = this.last;
    const now = this.battle.tick * TICK_S;
    if (
      dt === 0 &&
      f.settled &&
      f.canvas === out &&
      f.W === out.width &&
      f.H === out.height &&
      f.tick === this.battle.tick &&
      f.alpha === alpha &&
      f.zoom === this.camera.zoom &&
      f.cx === this.camera.cx &&
      f.cy === this.camera.cy &&
      f.scan === this.scanlines &&
      f.v0 === (this.atlases[0].version ?? 0) &&
      f.v1 === (this.atlases[1].version ?? 0) &&
      this.stamps.length === 0 &&
      !this.field?.composePending(now)
    ) {
      this.skipped++;
      this.lastBuildMs = 0;
      this.lastDrawMs = performance.now() - t0;
      return;
    }
    const gl = gfx.gl;
    this.time += dt;
    if (this.follow) this.followAction(dt);
    this.layout(out.width, out.height);
    const v = this.view;
    if (!gfx.scene || gfx.scene.w !== v.tw || gfx.scene.h !== v.th) {
      if (gfx.scene) dropTarget(gl, gfx.scene);
      gfx.scene = target(gl, v.tw, v.th, true);
    }
    const zFar = -200;
    const zNear = this.ground.h + 200;

    // HD grids arrive from the workers after the battle starts: upload them as they land, only
    // the new kinds' strips when the painter says which (the whole grid is tens of MB).
    for (let t = 0; t < 2; t++) {
      const a = this.atlases[t as 0 | 1];
      const ver = a.version ?? 0;
      if (ver === this.atlasVer[t]) continue;
      gl.bindTexture(gl.TEXTURE_2D, gfx.atlasTex[t as 0 | 1]);
      const landed = a.landed;
      if (landed && this.atlasVer[t]! >= 0 && this.atlasStrips[t]! <= landed.length) {
        const h = a.cellH * 4;
        for (let i = this.atlasStrips[t]!; i < landed.length; i++) {
          const y = landed[i]! * h;
          gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, a.image.width, Math.min(h, a.image.height - y), gl.RGBA, gl.UNSIGNED_BYTE, a.image);
        }
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.image);
      this.atlasVer[t] = ver;
      this.atlasStrips[t] = landed?.length ?? 0;
    }
    this.fence(gl);
    const tu = performance.now();
    this.flushStamps(gfx, zFar, zNear);
    const tb = performance.now();
    this.build(gfx, alpha, dt);
    this.lastBuildMs = performance.now() - tb;
    const lp = this.lastPasses;
    lp.upload = tb - tu;
    lp.build = this.lastBuildMs;

    // The scene, into the low-resolution buffer.
    const P = gfx.prog;
    gl.bindFramebuffer(gl.FRAMEBUFFER, gfx.scene.fbo);
    gl.viewport(0, 0, v.tw, v.th);
    gl.clearColor(0.04, 0.035, 0.03, 1);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    this.useView(P, zFar, zNear);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    const tg = performance.now();
    if (this.field) this.drawGroundHd(gfx, this.field);
    else {
      P.tex(gfx.ground.tex, this.ground.w, this.ground.h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gfx.groundQuad.draw();
    }
    this.fence(gl);
    const ts = performance.now();
    lp.ground = ts - tg;

    // HD zoomed in: standards, missiles and puffs from a Scale2x'd copy of the effects sheet.
    const fxF = isHdArt(this.art) ? (v.m >= 4 ? 4 : v.m >= 2 ? 2 : 1) : 1;
    const fxT = this.fxTexture(gfx, fxF);
    // Every alpha-tested batch, in the order they used to be drawn one by one (depth ties).
    const S = this.solidParts;
    let n = 0;
    n = setPart(S, n, gfx.team[0], gfx.atlasTex[0], this.atlases[0].image.width, this.atlases[0].image.height, 1, 1);
    n = setPart(S, n, gfx.team[1], gfx.atlasTex[1], this.atlases[1].image.width, this.atlases[1].image.height, 1, 1);
    n = this.hdParts(S, n);
    n = setPart(S, n, gfx.fx, fxT.tex, fxT.w, fxT.h, fxF, fxF);
    // HD: missiles and stakes from the level-m effects sheet.
    const hdFx = this.field && this.hdFxB ? this.field.sheet(v.m) : null;
    if (this.field && this.hdFxB && hdFx) {
      n = setPart(S, n, this.hdFxB.fx, this.field.sheetTexture(gl, v.m), hdFx.w, hdFx.h, v.m, 1);
      const st = this.field.standards(v.m);
      n = setPart(S, n, this.hdFxB.std, this.field.standardsTexture(gl, v.m), st.w, st.h, v.m, 1);
    }
    gfx.solid.set(S, n);
    // Dust, smoke, missile shadows.
    let ns = setPart(this.softParts, 0, gfx.soft, fxT.tex, fxT.w, fxT.h, fxF, fxF);
    if (this.field && this.hdFxB && hdFx) ns = setPart(this.softParts, ns, this.hdFxB.soft, this.field.sheetTexture(gl, v.m), hdFx.w, hdFx.h, v.m, 1);
    gfx.softs.set(this.softParts, ns);

    // Shadows: once per pixel, however many fall on it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    P.shadow(true, SHEAR_X, SHEAR_Y, SHADOW);
    gfx.solid.draw(P);
    P.shadow(false);
    gl.disable(gl.STENCIL_TEST);
    this.fence(gl);
    const tsh = performance.now();
    lp.shadows = tsh - ts;

    // Everything solid, depth-tested by the foot's screen y.
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gfx.solid.draw(P);
    // Dust, smoke, missile shadows.
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gfx.softs.draw(P);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.fence(gl);
    const tp = performance.now();
    lp.sprites = tp - tsh;
    gfx.post.apply(gfx.scene.tex, v.W, v.H, v.offX, v.offY, v.u, this.time, this.scanlines, v.direct);
    this.fence(gl);
    lp.post = performance.now() - tp;
    f.canvas = out;
    f.W = out.width;
    f.H = out.height;
    f.tick = this.battle.tick;
    f.alpha = alpha;
    // As laid out (the camera is clamped to the field): what the next frame will compare.
    f.zoom = this.camera.zoom;
    f.cx = this.camera.cx;
    f.cy = this.camera.cy;
    f.scan = this.scanlines;
    f.v0 = this.atlases[0].version ?? 0;
    f.v1 = this.atlases[1].version ?? 0;
    f.settled = this.settled;
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
    // Effects first (blood under the bodies), then the bodies: one draw, in that order.
    const T = this.stampParts;
    let n = setPart(T, 0, gfx.stamp[2], gfx.fxTex, this.fxSheet.canvas.width, this.fxSheet.canvas.height, 1, 1);
    n = setPart(T, n, gfx.stamp[0], gfx.atlasTex[0], this.atlases[0].image.width, this.atlases[0].image.height, 1, 1);
    n = setPart(T, n, gfx.stamp[1], gfx.atlasTex[1], this.atlases[1].image.width, this.atlases[1].image.height, 1, 1);
    gfx.stamps.set(T, n);
    gfx.stamps.draw(P);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  /**
   * HD: picks, per army and kind, the finest painted sheet no finer than the view (m), uploads it
   * once, and asks the painter for the one the view wants. Returns whether any kind is drawn hi-res.
   */
  private pickLevels(gfx: Gfx, m: number): boolean {
    let any = false;
    this.settled = true;
    const gl = gfx.gl;
    if (this.hdBatch.length === 0) this.hdBatch = [0, 1].map(() => Array.from({ length: KIND_COUNT }, () => new Batch(gl, gfx.corners, 256)));
    let budget = HD_UPLOAD_BYTES;
    // First, every kind in view with nothing hi-res up gets its coarsest painted sheet up (a few
    // MB), so no kind waits on the grid while another's 8x sheet takes the frame's budget (a
    // second visit reads every sheet from the cache at once).
    for (let t = 0; t < 2 && m > 1; t++) {
      const atlas = this.atlases[t as 0 | 1];
      if (!atlas.sheet || !atlas.levels) continue;
      const L0 = atlas.levels[0]!;
      for (const k of this.kindsPresent[t]!) {
        if (budget <= 0) break;
        if (!((this.seen[t]! | this.seenDead[t]!) & (1 << k))) continue;
        let isUp = false;
        for (const L of atlas.levels) {
          const h = L <= m ? this.hdTex.get(hdKey(t, k, L)) : undefined;
          if (h && h.rows >= h.sheet.height) isUp = true;
        }
        if (isUp) continue;
        const sh = atlas.sheet(k, L0, 'peek');
        if (!sh || sh.width > gfx.maxTex || sh.height > gfx.maxTex) continue;
        const key = hdKey(t, k, L0);
        let h = this.hdTex.get(key);
        if (h && h.sheet !== sh) {
          dropHd(gl, h);
          this.hdTex.delete(key);
          h = undefined;
        }
        if (!h) {
          h = { tex: texture(gl, null, sh.width, sh.height), sheet: sh, t, k, L: L0, rows: 0 };
          this.hdTex.set(key, h);
        }
        budget -= uploadRows(gl, h, budget);
      }
    }
    for (let t = 0; t < 2; t++) {
      const atlas = this.atlases[t as 0 | 1];
      const lv = this.hdLevel[t]!;
      lv.fill(1);
      this.hdSheet[t]!.fill(null);
      for (const b of this.hdBatch[t]!) b.clear();
      // Textures finer than the view are freed (they upload again from the painter's memory when
      // the view zooms back in): the GPU holds only what is drawn.
      for (const [key, h] of this.hdTex)
        if (h.t === t && h.L > m) {
          dropHd(gl, h);
          this.hdTex.delete(key);
        }
      if (!atlas.sheet || !atlas.levels || m <= 1) continue;
      for (const k of this.kindsPresent[t]!) {
        // HD art: a kind with only its dead in view is drawn from the sheets up to 4x (the 8x ones
        // are tens of MB a kind: only the living in view earn them).
        const live = !!(this.seen[t]! & (1 << k));
        const inView = live || !!(this.seenDead[t]! & (1 << k));
        // The level the view draws this kind at: the finest no finer than the view (the 8x sheets,
        // tens of MB a kind, only for the living in view).
        let wantL = 1;
        for (const L of atlas.levels) {
          if (L > m || (L >= 8 && !live)) break;
          wantL = L;
        }
        // Asking keeps a sheet fresh in the painter's memory and orders the painting: for a kind
        // in view, the level drawn is needed and the coarsest is a fallback (cheap: shown in
        // seconds while the needed one paints), the levels between are painted after anything
        // needed; a kind out of view only has its coarsest prefetched (for a pan).
        let best: KindSheet | null = null;
        let bestL = 1;
        let coarse: KindSheet | null = null;
        let coarseL = 1;
        const L0 = atlas.levels[0]!;
        for (const L of atlas.levels) {
          if (L > wantL) break;
          // (Within a screen of the view, every level up to 4x is prefetched: a scroll meets it sharp.)
          const near = !!(this.seenNear[t]! & (1 << k));
          const ask: SheetAsk = !inView ? (L === L0 || near ? 'prefetch' : 'peek') : L === wantL ? 'need' : L === L0 ? 'fallback' : 'prefetch';
          const sh = atlas.sheet(k, L, ask);
          // A sheet larger than the GPU takes (a small GPU, the 8x sheets) is never drawn.
          if (!sh || sh.width > gfx.maxTex || sh.height > gfx.maxTex) continue;
          if (!coarse) {
            coarse = sh;
            coarseL = L;
          }
          best = sh;
          bestL = L;
        }
        // A finer sheet still being painted: the picture will change by itself.
        if (inView && bestL < wantL) this.settled = false;
        // The best sheet goes up a band of rows at a time, within the frame's budget (several
        // 8x sheets landing together are hundreds of MB): until it is all there the kind is
        // drawn from the finest level already up; with none up, the coarsest painted level goes
        // up first (a few MB: one frame), else the level-1 grid.
        let drawn: HdTex | null = null;
        let going: HdTex | null = null;
        let goingCoarse: HdTex | null = null;
        const up = (L: number, sh: KindSheet): HdTex => {
          const key = hdKey(t, k, L);
          let h = this.hdTex.get(key);
          if (h && h.sheet !== sh) {
            // The painter dropped and repainted it: a new sheet.
            dropHd(gl, h);
            this.hdTex.delete(key);
            h = undefined;
          }
          if (!h) {
            h = { tex: texture(gl, null, sh.width, sh.height), sheet: sh, t, k, L, rows: 0 };
            this.hdTex.set(key, h);
          }
          return h;
        };
        const cur = best && inView ? this.hdTex.get(hdKey(t, k, bestL)) : undefined;
        if (best && cur && cur.sheet !== best && cur.sheet.partial && cur.rows >= cur.sheet.height) {
          // The whole sheet replaces a partial one that is up: drawn from the partial one until
          // the whole one is all there.
          if (cur.next && cur.next.sheet !== best) {
            gl.deleteTexture(cur.next.tex);
            cur.next = undefined;
          }
          const nx = (cur.next ??= { tex: texture(gl, null, best.width, best.height), sheet: best, t, k, L: bestL, rows: 0 });
          if (budget > 0) budget -= uploadRows(gl, nx, budget);
          if (nx.rows >= best.height) {
            gl.deleteTexture(cur.tex);
            this.hdTex.set(hdKey(t, k, bestL), nx);
            drawn = going = nx;
          } else {
            drawn = going = cur;
            this.settled = false;
          }
        } else if (best && inView) {
          const h = (going = up(bestL, best));
          if (h.rows >= best.height && !best.partial) drawn = h;
          else if (h.rows >= best.height) {
            // A partial sheet: drawn, but the whole one is still to come.
            drawn = h;
            this.settled = false;
          } else {
            this.settled = false;
            for (const L of atlas.levels) {
              const o = L < bestL ? this.hdTex.get(hdKey(t, k, L)) : undefined;
              if (o && o.rows >= o.sheet.height) drawn = o;
            }
            if (!drawn && coarse && coarseL < bestL) {
              const c = (goingCoarse = up(coarseL, coarse));
              if (c.rows < coarse.height && budget > 0) budget -= uploadRows(gl, c, budget);
              if (c.rows >= coarse.height) drawn = c;
            }
            if (budget > 0) budget -= uploadRows(gl, h, budget);
            if (h.rows >= best.height) drawn = h;
          }
        }
        // Only the drawn level of a kind in view stays on the GPU (and the one going up).
        for (const L of atlas.levels) {
          const key = hdKey(t, k, L);
          const h = this.hdTex.get(key);
          if (h && h !== drawn && h !== going && h !== goingCoarse) {
            dropHd(gl, h);
            this.hdTex.delete(key);
          }
        }
        if (!drawn) continue;
        lv[k] = drawn.L;
        this.hdSheet[t]![k] = drawn.sheet;
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

  /** HD: the per-kind sheet batches drawn this frame, as stream parts from `n` on. */
  private hdParts(out: Part[], n: number): number {
    for (let t = 0; t < this.hdBatch.length; t++)
      for (let k = 0; k < KIND_COUNT; k++) {
        const b = this.hdBatch[t]![k]!;
        const L = this.hdLevel[t]![k]!;
        const sh = this.hdSheet[t]![k];
        if (b.n === 0 || L <= 1 || !sh) continue;
        n = setPart(out, n, b, this.hdTex.get(hdKey(t, k, L))!.tex, sh.width, sh.height, L, 1);
      }
    return n;
  }

  /**
   * HD: a fallen man drawn at full detail over his low-res stamp (beneath everyone standing).
   * False when his kind's sheet has no corpse yet (a partial sheet): he is drawn from the grid.
   */
  private hdCorpse(i: number, x0: number, x1: number, y0: number, y1: number): boolean {
    const s = this.battle.soldiers[i]!;
    const kind = this.kindOf(i);
    const L = this.hdLevel[s.team]![kind]!;
    if (L <= 1) return false;
    const sh = this.hdSheet[s.team]![kind]!;
    const o = this.slotOf(s.team, kind, Anim.Dead, 0, this.dirs[i] as Dir) * 6;
    const r = sh.rects;
    if (r[o + 2]! <= 0) return false;
    const mx = this.mapX(s.x, s.y);
    const my = this.mapY(s.x, s.y);
    if (mx < x0 || mx > x1 || my < y0 || my > y1) return true;
    this.hdBatch[s.team]![kind]!.sprite(Math.round(mx), Math.round(my), r[o]!, r[o + 1]!, r[o + 2]! / L, r[o + 3]! / L, r[o + 4]! / L, r[o + 5]! / L, -1e5, 0.78, 0.78, 0.75, 1, 0, 1);
    return true;
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
    this.seenDead[0] = this.seenDead[1] = 0;
    this.seenNear[0] = this.seenNear[1] = 0;
    gfx.fx.clear();
    gfx.soft.clear();
    const fx = this.fxSheet;

    // HD: kinds within a screen of the view (seenNear) have their sheets up to 4x prefetched
    // (pickLevels; the 8x ones stay for the living in view), so a scroll meets them sharp instead
    // of popping from the level-1 grid.
    const nearHd = this.atlases[0].sheet !== undefined || this.atlases[1].sheet !== undefined;
    const px0 = x0 - v.vw;
    const px1 = x1 + v.vw;
    const py0 = y0 - v.vh;
    const py1 = y1 + v.vh;
    // Soldiers.
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Fled) continue;
      if (this.stamped[i]) {
        // HD, zoomed in: the corpse stamped into the low-res ground is drawn over at full detail.
        if (this.field) this.corpseHd(i, hd, x0, x1, y0, y1, px0, px1, py0, py1);
        else if (hd) this.hdCorpse(i, x0, x1, y0, y1);
        continue;
      }
      const wx = this.prevX[i]! + (s.x - this.prevX[i]!) * alpha;
      const wy = this.prevY[i]! + (s.y - this.prevY[i]!) * alpha;
      const fmx = this.mapX(wx, wy);
      const fmy = this.mapY(wx, wy);
      if (fmx < x0 || fmx > x1 || fmy < y0 || fmy > y1) {
        if (nearHd && fmx >= px0 && fmx <= px1 && fmy >= py0 && fmy <= py1) this.seenNear[s.team] = this.seenNear[s.team]! | (1 << (s.commander ? COMMANDER_KIND : s.cls));
        continue;
      }
      const kind = s.commander ? COMMANDER_KIND : s.cls;
      this.seen[s.team] = this.seen[s.team]! | (1 << kind);
      const lens = this.lenTab[s.team]!;
      let anim: Anim = Anim.Idle;
      let start = 0;
      let dir = this.dirs[i] as Dir;
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const hitAt = Math.max(((s as unknown as { hitAt?: number }).hitAt ?? -100), this.hurtAt[i]!);
      const reg = b.regiments[s.reg]!;
      const stance = stanceOf(reg);
      const rising = s.roseAt >= 0 && s.state !== State.Dead && stillRising(T - s.roseAt, this.riseTicksOf(s.team, kind), s.x - this.riseX[i]!, s.y - this.riseY[i]!);
      const frameRow = this.frameTab[s.team]!;
      const tpfRow = this.tpfTab[s.team]!;
      const track = this.anims;
      if (s.state === State.Dead || rising) {
        // Falling; or raised from the dead: the fall played backwards (contract.ts RISE).
        anim = track.resolve(i, Anim.Die, T, rising ? s.roseAt : s.diedAt, frameRow, kind * ANIM_COUNT, tpfRow, 0);
        start = rising ? s.roseAt : s.diedAt;
      } else {
        const act = T - s.actedAt;
        const tgt = s.target >= 0 ? ss[s.target] : undefined;
        const tdx = tgt ? tgt.x - s.x : NaN;
        const tdy = tgt ? tgt.y - s.y : NaN;
        const reach = tgt !== undefined && tdx * tdx + tdy * tdy < 14 * 14;
        const melee = s.s.range === 0 || reach;
        const actAnim = melee ? Anim.Attack : Anim.Shoot;
        // In the fight: his block is locked in or touching an enemy block, an enemy block is close
        // (closeIn, the eager pull: within ~50 of its edge), or his own foe is near. A man who
        // fights hand to hand keeps his guard there (spear levelled, shield up), standing or
        // stepping, instead of shouldering his weapon upright as on the march: after a charge
        // breaks on the spears and the horse wheels off to come again, the levy stays squared up.
        const near = tgt !== undefined && tdx * tdx + tdy * tdy < 40 * 40;
        const inFight = s.state === State.Fighting && s.s.range === 0 && (reg.engaged || reg.contact || reg.closeIn > 0.4 || near);
        // What the sim calls for (animstate.ts pickAnim): a blow or a shot, a flinch, the run (routing,
        // charging, pursuing), a step (in his guard when in the fight: Anim.Advance, kinds without one
        // walk; a man with his foe in reach who shuffles in the press stands in it), else his guard
        // between blows (Brace) or, out of reach of a foe, idling. The track then holds a clip
        // through a tick's pause, carries the stride across gaits and enters the guard at frame 0.
        const fa = this.facts;
        fa.act = act;
        fa.actAnim = actAnim;
        fa.actLen = this.lenTab[s.team]![kind * ANIM_COUNT + actAnim]!;
        fa.hit = T - hitAt;
        fa.hitLen = this.lenTab[s.team]![kind * ANIM_COUNT + Anim.Hit]!;
        fa.routing = s.state === State.Routing;
        fa.speed = speed;
        fa.top = s.s.speed;
        fa.charging = reg.mode === 'charge' || reg.mode === 'pursue';
        fa.fighting = s.state === State.Fighting;
        fa.reach = reach;
        fa.inFight = inFight;
        fa.wedge = s.cls === U.Knights && stance === 'wedge';
        fa.guard = BRACING.has(stance) || (tgt !== undefined && melee) || inFight;
        const want = pickAnim(fa, track.anim[i] as Anim);
        start = want === Anim.Hit ? hitAt : s.actedAt;
        // Marching blocks step together: one phase per regiment, a hair's offset per file.
        // Everything else (idling, routing) keeps a per-man phase so a crowd doesn't pulse.
        // (A chase or a charge run from too far has lost the step.)
        const drilled = s.state === State.Fighting && (want === Anim.Walk || want === Anim.Run) && reg.mode !== 'pursue' && !reg.ragged;
        const phase = drilled ? s.reg * 0.71 + Math.round(s.sx / Math.max(1, reg.spacing)) * 0.12 : (i % 7) * 1.37;
        anim = track.resolve(i, want, T, start, frameRow, kind * ANIM_COUNT, tpfRow, phase);
        // Facing: the way they move, else where they shoot or at their foe, else his own front
        // (pose.ts ownFront: the regiment's, its rear for a rear-ranker turned about, the enemy
        // block for a man swinging round its flank).
        // A man still in his stride through the sim's pauses keeps facing the way he went.
        if (speed > 3) {
          this.moveX[i] = s.vx;
          this.moveY[i] = s.vy;
        }
        const gait = isGait(anim) && speed <= 3;
        const vx = gait ? this.moveX[i]! : s.vx;
        const vy = gait ? this.moveY[i]! : s.vy;
        const left = this.leftDir[i]!;
        const curling = s.curling === true && !tgt && reg.targetReg >= 0;
        const foeReg = curling ? b.regiments[reg.targetReg] : undefined;
        const rear = facesRear(reg, s.row, s.mounted === true, b.tick);
        const fr = ownFront(reg.fx, reg.fy, rear, curling, foeReg ? foeReg.ax - s.x : NaN, foeReg ? foeReg.ay - s.y : NaN, this.front);
        const next = settleTurn(facing(anim, vx, vy, tdx, tdy, melee, this.aimX[i]!, this.aimY[i]!, fr.x, fr.y, dir, rear && !curling), dir, anim, T - this.turnAt[i]!, left === 255 ? -1 : (left as Dir));
        if (next !== dir) {
          // A half turn goes through the quarter between (pose.ts turnVia), shown for TURN_STEP.
          const via = anim === Anim.Attack || anim === Anim.Shoot ? next : turnVia(dir, next, vx * vx + vy * vy > 9 ? vx : tgt ? tdx : fr.x, vx * vx + vy * vy > 9 ? vy : tgt ? tdy : fr.y);
          this.turnAt[i] = via === next ? T : T - (TURN_HOLD - TURN_STEP);
          this.leftDir[i] = via === next ? dir : 255;
          dir = via;
          this.dirs[i] = dir;
        }
      }
      const frames = frameRow[kind * ANIM_COUNT + anim]!;
      const tpf = tpfRow[anim]!;
      let f = rising ? riseFrame(frames, tpf, T - start) : track.frame(i, T, frames, tpf);
      if (f < 0) f = 0;
      // Several blows (Atlas.blows): each man picks one per swing, from a hash of who he is and
      // when he swung, so a regiment does not strike in lockstep. Blow b's frames follow blow 0's.
      if (anim === Anim.Attack) {
        const nb = this.blowTab[s.team]![kind]!;
        if (nb > 1) f += frames * ((Math.imul(i * 0x9e3779b1 + Math.floor(s.actedAt * 10), 0x85ebca6b) >>> 16) % nb);
      }
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
      // A partial sheet (KindSheet.partial) lacks some frames (w = 0): those come from the grid.
      const o = lv > 1 ? this.slotOf(s.team, kind, anim, f, dir) * 6 : 0;
      if (lv > 1 && this.hdSheet[s.team]![kind]!.rects[o + 2]! > 0) {
        const sh = this.hdSheet[s.team]![kind]!;
        const r = sh.rects;
        this.hdBatch[s.team]![kind]!.sprite(Math.round((fmx + jx) * m) / m, Math.round((fmy + jy) * m) / m, r[o]!, r[o + 1]!, r[o + 2]! / lv, r[o + 3]! / lv, r[o + 4]! / lv, r[o + 5]! / lv, fmy, 1, 1, 1, 1, flash);
      } else {
        const u = this.cellU(s.team, kind, anim, f, dir);
        team[s.team as 0 | 1].sprite(Math.round(fmx + jx), Math.round(fmy + jy), u, this.cellV, this.cellW, this.cellH, this.cellAx, this.cellAy, fmy, 1, 1, 1, 1, flash, 0, this.cellCutX, this.cellCutY);
      }
    }

    // Props and stakes.
    for (const { r, mx, my } of this.propDraw) {
      if (mx < x0 - 40 || mx > x1 + 40 || my < y0 || my > y1 + 40) continue;
      gfx.fx.sprite(Math.round(mx), Math.round(my), r.u, r.v, r.w, r.h, r.ax, r.ay, my);
    }
    if (this.field) this.stakesHd(gfx, m, x0, x1, y0, y1);
    else for (const k of b.stakes) {
      if (!this.stakesInView(k, x0, x1, y0, y1)) continue;
      const r = this.stakeRegions[k.team === 0 ? 0 : 1]!;
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
    // HD art: the standards come from a sheet painted at the view's density, like the figures.
    const std = this.field ? this.field.standards(m) : null;
    const stdB = this.field ? this.hdBatches(gfx).std : gfx.fx;
    const sk = std ? m : 1; // texels per map px of the standards' sheet
    const at = (v: number) => (std ? Math.round(v * m) / m : Math.round(v));
    const flag = (name: string, x: number, y: number, depth: number): Region => {
      const g = std ? std.byName.get(name)! : fx.get(name);
      stdB.sprite(x, y, g.u, g.v, g.w / sk, g.h / sk, g.ax / sk, g.ay / sk, depth, 1, 1, 1, 1, 0, 1);
      return g;
    };
    for (let i = 0; i < b.regiments.length; i++) {
      const r = b.regiments[i]!;
      if (r.alive < 4 || r.role === 'siege' || r.role === 'skirmish') continue;
      const ms = moraleOf(r);
      if (ms === 'shattered') continue;
      const cx = this.regX[i]! + (r.cx - this.regX[i]!) * alpha;
      const cy = this.regY[i]! + (r.cy - this.regY[i]!) * alpha;
      const mx = at(this.mapX(cx, cy));
      const my = this.mapY(cx, cy);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 30) continue;
      const cmd = r.role === 'command';
      if (ms === 'broken') {
        flag(`dropped${cmd ? 'cmd' : ''}${r.team}`, mx, at(my), my - 0.5);
        continue;
      }
      const mounted = r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' || cmd;
      const wavering = ms === 'wavering';
      // Wavering cloth flaps fast and fitfully; a rallying standard is hoisted with a bob.
      const frame = wavering ? Math.floor(T * 1.3 + i * 1.3 + Math.sin(T * 0.7 + i) * 2) & 3 : Math.floor(T / 2.5 + i * 1.3) & 3; // & 3, not % 4: never negative (T < 0 before the first tick)
      const bob = ms === 'rallying' ? Math.round(Math.abs(Math.sin(T * 0.6)) * 3) : 0;
      if (wavering && Math.sin(T * 2.1 + i * 5.3) > 0.82) continue;
      const top = at(my) - (mounted ? 14 : 9) - bob;
      const reg = flag(`${wavering ? 'torn' : ''}${cmd ? 'cmd' : wavering ? '' : 'ban'}${r.team}_${frame}`, mx, top, my + 0.5);
      if (!closeUp) continue;
      const regAx = reg.ax / sk;
      const regAy = reg.ay / sk;
      const poleX = mx - regAx + (r.team === 1 ? 10 : 1);
      const stance = stanceOf(r);
      if (stance !== 'line' && !cmd) flag(`glyph_${stance}`, poleX, top - regAy - 1, my + 0.6);
      // Morale pips: five, beside the pole under the cloth, coloured by how close to breaking.
      // The fearless dead never break: always five, a grave-light green that gutters while the
      // host crumbles (its Lich-Marshal fallen, or the host spent).
      const morale = Math.max(0, Math.min(100, (r as unknown as { morale?: number }).morale ?? 50));
      const fearless = b.fearless[r.team];
      const lit = fearless ? 5 : Math.ceil(morale / 20);
      const glow = b.crumbling[r.team] ? 0.45 + 0.25 * Math.sin(T * 3.1 + i * 2.3) : 1;
      const [pr, pg, pb] = fearless ? [0.4 * glow, 0.85 * glow, 0.5 * glow] : morale > 60 ? [0.55, 0.75, 0.4] : morale > 30 ? [0.9, 0.7, 0.25] : [0.85, 0.2, 0.15];
      const px0 = r.team === 1 ? poleX - 7 : poleX + 2;
      const py = top - regAy + 10;
      stdB.rect(px0 - 1, py - 1, 7, 3, my + 0.55, 0.07, 0.05, 0.04, 1);
      // HD: each pip a texel short of its cell, so they stay separate squares at any density.
      const pip = std && m >= 2 ? 1 - 1 / m : 1;
      for (let k = 0; k < 5; k++) {
        const on = k < lit;
        stdB.rect(px0 + (r.team === 1 ? 4 - k : k), py, pip, pip, my + 0.6, on ? pr : 0.25, on ? pg : 0.22, on ? pb : 0.2, 1);
      }
    }

    if (this.field) this.buildHd(this.field, gfx, T, dt, x0, x1, y0, y1);
    else {
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
        const h = (p.arc ?? dist * arc) * PX;
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
        if (p.direct) {
          // A flat shot leaves a straight streak behind it.
          for (let k = 1; k <= 3; k++) {
            const tk = Math.max(0, t - k * 0.04);
            const zk = 4 * h * tk * (1 - tk) + (1 - tk) * lift;
            const kx = this.mapX(p.x0 + (p.x1 - p.x0) * tk, p.y0 + (p.y1 - p.y0) * tk);
            const ky = this.mapY(p.x0 + (p.x1 - p.x0) * tk, p.y0 + (p.y1 - p.y0) * tk) - zk;
            gfx.soft.sprite(Math.round(kx), Math.round(ky), shadowRegion.u, shadowRegion.v, 1, 1, 0, 0, my, 0.85, 0.82, 0.7, 0.5 - k * 0.12);
          }
        }
      }

      // Particles.
      const ps = this.particles;
      const damp = Math.exp(-dt * 2.2);
      const dampZ = Math.exp(-dt * 0.8);
      let w = 0;
      for (const p of ps) {
        p.life += dt;
        if (p.life >= p.max) {
          this.spare.push(p);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.kind === PK.Blood || p.kind === PK.Debris) {
          p.vz -= 120 * dt;
          if (p.z <= 0) {
            if (p.kind === PK.Blood && this.rng.next() < 0.35) {
              const ichor = p.v === 2;
              this.stamps.push({ tex: 2, x: Math.round(this.mapX(p.x, p.y)), y: Math.round(this.mapY(p.x, p.y)), u: 0, v: 0, w: 1, h: 1, ax: 0, ay: 0, shade: 1, a: 0.75, solid: true, r: ichor ? 0.1 : 0.24, g: ichor ? 0.11 : 0.05, b: ichor ? 0.07 : 0.04 });
            }
            this.spare.push(p);
            continue;
          }
        } else {
          p.vx *= damp;
          p.vy *= damp;
          p.vz *= dampZ;
        }
        ps[w++] = p;
        const mx = this.mapX(p.x, p.y);
        const my = this.mapY(p.x, p.y);
        if (mx < x0 || mx > x1 || my < y0 || my > y1 + 60) continue;
        const fade = 1 - p.life / p.max;
        if (p.kind === PK.Blood || p.kind === PK.Debris) {
          gfx.fx.rect(Math.round(mx), Math.round(my - p.z), p.size, 1, my, p.r, p.g, p.b, 1);
        } else if (p.kind === PK.Wisp) {
          gfx.soft.rect(Math.round(mx), Math.round(my - p.z), 1, 1, my + 3, p.r, p.g, p.b, p.a * Math.min(1, fade * 2));
        } else {
          const grow = p.kind === PK.Smoke ? p.life * 3.2 : p.life * 2.2;
          const r = this.puffRegions[Math.min(11, Math.ceil(p.size + grow))]!;
          const a = p.a * Math.min(1, fade * 1.6) * Math.min(1, p.life * 6);
          gfx.soft.sprite(Math.round(mx), Math.round(my - p.z), r.u, r.v, r.w, r.h, r.ax, r.ay, my + 2, p.r, p.g, p.b, a);
        }
      }
      ps.length = w;
    }

  }

  // ---------------------------------------------------------------- HD battlefield (field-hd.ts)
  //
  // In the HD art the ground, its marks and every effect are drawn at the figures' texel density
  // (m texels per map px). Kept apart from the classic path, which is unchanged.

  /** HD: the batches for ground decals, missiles and stakes, and puffs, made on first use. */
  private hdBatches(gfx: Gfx): { decal: Batch; fx: Batch; soft: Batch; std: Batch } {
    return (this.hdFxB ??= { decal: new Batch(gfx.gl, gfx.corners, 1024), fx: new Batch(gfx.gl, gfx.corners, 1024), soft: new Batch(gfx.gl, gfx.corners, 1024), std: new Batch(gfx.gl, gfx.corners, 256) });
  }

  /** What soldier i sheds when hit (the undead bodies as sprites128.ts's UNDEAD_FOOT and UNDEAD_RIDERS draw them). */
  private shedOf(i: number): Shed {
    const s = this.battle.soldiers[i]!;
    if (this.battle.setup.armies[s.team]?.faction !== 'undead') return Shed.Blood;
    if (s.commander) return Shed.Bone;
    return s.cls === U.Spearmen ? Shed.Ichor : s.cls === U.Archers ? Shed.Witchfire : Shed.Bone;
  }

  /** Bone chips and a breath of grave dust off a struck skeleton; witchfire motes off a wraith. */
  private shedDry(shed: Shed, x: number, y: number, h: number, dead: boolean, rng: Rng): void {
    if (shed === Shed.Witchfire) {
      for (let k = 0; k < (dead ? 10 : 4); k++)
        this.spawn(PK.Wisp, x + (rng.next() - 0.5) * 3, y + (rng.next() - 0.5) * 2, h * (0.4 + rng.next() * 0.6), (rng.next() - 0.5) * 10, (rng.next() - 0.5) * 10, 6 + rng.next() * 10, 0.4 + rng.next() * (dead ? 0.9 : 0.4), 1, 0.55, 1, 0.55, 1);
      return;
    }
    const a0 = rng.next() * Math.PI * 2;
    const n = dead ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (rng.next() - 0.5) * 0.6;
      const sp = 8 + rng.next() * 18;
      const g = rng.next() < 0.6 ? 0.86 : 0.62;
      this.spawn(PK.Debris, x, y, h + rng.next() * 2, Math.cos(a) * sp, Math.sin(a) * sp, 10 + rng.next() * 16, 0.9, 1, g, g * 0.95, g * 0.8, 1);
    }
    if (this.field)
      for (let k = 0; k < (dead ? 3 : 1); k++) {
        const g = 0.74 + rng.next() * 0.08;
        this.spawn(PK.Dust, x + (rng.next() - 0.5) * 3, y + (rng.next() - 0.5) * 3, 1 + rng.next() * (dead ? 4 : h * 0.6), (rng.next() - 0.5) * 6, (rng.next() - 0.5) * 6, 2 + rng.next() * 3, 1 + rng.next() * 0.8, 2 + rng.int(dead ? 3 : 2), g, g * 0.97, g * 0.9, 0.35, rng.int(PUFF_VARIANTS));
      }
  }

  /** HD: whether a man is at grips with a foe (his target within arm's reach, struck at lately): an archer shooting is not. */
  private inMelee(s: Battle['soldiers'][number], tick: number): boolean {
    if (tick - s.actedAt >= 15) return false;
    const t = s.target >= 0 ? this.battle.soldiers[s.target] : undefined;
    if (!t) return false;
    const r = s.s.radius + t.s.radius + 7;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    return dx * dx + dy * dy <= r * r;
  }

  /** HD: what a step did to the field: blood, sparks, dust, hoofprints, trampling, missiles, smoke. */
  private afterStepHd(f: HdField): void {
    const b = this.battle;
    const ss = b.soldiers;
    const rng = this.hdRng;
    const tick = b.tick;
    const now = tick * TICK_S;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Fled) continue;
      const mx = this.mapX(s.x, s.y);
      const my = this.mapY(s.x, s.y);
      if (s.hp < this.prevHp[i]!) {
        this.hurtAt[i] = tick;
        const dead = s.state === State.Dead;
        // What the ground keeps (as on a Total War field, it darkens where the fighting was): the
        // spray of every hit is seen in the air, but only a kill, a hit in the press of a melee or
        // a bad wound leaves blood on the ground. A block walking on under arrows leaves no trail.
        const full = s.s.hp > 0 ? s.s.hp : 1;
        const melee = this.inMelee(s, tick);
        const bad = s.hp < full * 0.4 && this.prevHp[i]! - s.hp > full * 0.15;
        const soaks = dead || melee || bad;
        const n = dead ? 6 : 3;
        const h = s.s.mounted ? 12 : 8;
        const shed = this.shedOf(i);
        const wet = shed === Shed.Blood || shed === Shed.Ichor;
        // A ring of drops bursting outward, some fine, some heavy (v 1 blood, 2 ichor: they stain
        // where they land). Bone and spirit shed dry (chips, dust, witchfire) and stain nothing.
        if (wet) {
          const a0 = rng.next() * Math.PI * 2;
          const ichor = shed === Shed.Ichor;
          for (let k = 0; k < n * 2; k++) {
            const a = a0 + (k / (n * 2)) * Math.PI * 2 + (rng.next() - 0.5) * 0.5;
            const sp = 10 + rng.next() * 24;
            const dark = rng.next() < 0.45;
            const v = dead || melee ? (ichor ? 2 : 1) : 0;
            if (ichor) this.spawn(PK.Blood, s.x, s.y, h + rng.next() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 6 + rng.next() * 18, 0.9, 1 + rng.int(2), dark ? 0.1 : 0.17, dark ? 0.11 : 0.19, dark ? 0.07 : 0.11, 1, v);
            else this.spawn(PK.Blood, s.x, s.y, h + rng.next() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 6 + rng.next() * 18, 0.9, 1 + rng.int(2), dark ? 0.34 : 0.58, dark ? 0.04 : 0.07, 0.04, 1, v);
          }
        } else this.shedDry(shed, s.x, s.y, h, dead, rng);
        // Steel on mail and plate: a few sparks.
        if (!dead && s.s.armour >= 30 && rng.next() < 0.4) {
          const ns = 3 + rng.int(3);
          for (let k = 0; k < ns; k++) this.spawn(PK.Spark, s.x, s.y, h - 1 + rng.next() * 3, (rng.next() - 0.5) * 60, (rng.next() - 0.5) * 60, 12 + rng.next() * 26, 0.16 + rng.next() * 0.16, 1, 1, 0.88, 0.52, 1);
        }
        // Blood soaks in where he stands, and spatters: where he falls, where men fight, or a bad
        // wound now and then (a small dark stain, no splash).
        // Ichor soaks in as blood does (no red splash); bone and spirit only scuff the earth pale
        // where one falls or the press is thick.
        if (wet && soaks && (dead || melee || rng.next() < 0.5)) {
          const amt = dead ? 0.3 : melee ? 0.15 : 0.12;
          const ichor = shed === Shed.Ichor;
          f.mark(mx + (rng.next() - 0.5) * 2.5, my + (rng.next() - 0.5) * 1.2, dead || melee ? 1.1 + rng.next() * 1.4 : 0.9 + rng.next() * 0.6, ichor ? 0 : amt, 0, now, ichor ? amt : 0);
          if (!ichor && rng.next() < (dead ? 0.45 : melee ? 0.22 : 0)) f.decalId(HD_ID.splat + rng.int(SPLATS), mx + (rng.next() - 0.5) * 4, my + (rng.next() - 0.5) * 2, now, true);
        } else if (!wet && (dead || melee)) f.mark(mx + (rng.next() - 0.5) * 2, my + (rng.next() - 0.5) * 1, dead ? 2.6 : 1.3, 0, dead ? 0.32 : 0.07, now);
      }
      if (s.state === State.Dead) {
        if (!this.stamped[i] && tick - s.diedAt >= this.dieTicks(s.team, this.kindOf(i))) {
          // Down: drawn as a corpse from now on, and his pool spreads for a few seconds.
          this.stamped[i] = 1;
          const big = s.s.mounted ? 1.7 : 1;
          const cx = mx + (rng.next() - 0.5) * 2 * big;
          const cy = my + (rng.next() - 0.5) * big;
          // (The bone and the spirit leave no pool; a ghoul's is ichor.)
          const shed = this.shedOf(i);
          if (shed === Shed.Blood || shed === Shed.Ichor)
            for (let k = 0; k < 4; k++) this.pools.push({ x: cx + (rng.next() - 0.5) * 2.4 * big, y: cy + (rng.next() - 0.5) * 1.1 * big, r: (2 + k * 1.05) * big, a: shed === Shed.Ichor ? 0.26 : 0.3, ichor: shed === Shed.Ichor, at: tick + k * 8 });
        }
        continue;
      }
      if (s.roseAt >= 0 && !this.rose[i]) this.graveLight(i);
      const v2 = s.vx * s.vx + s.vy * s.vy;
      // Hooves and marching feet raise dust.
      if (s.s.mounted ? v2 > 700 && rng.next() < 0.22 : v2 > 100 && rng.next() < 0.01) {
        const big = s.s.mounted ? 1 : 0;
        this.spawn(PK.Dust, s.x - s.vx * 0.06 + (rng.next() - 0.5) * 3, s.y - s.vy * 0.06 + (rng.next() - 0.5) * 3, 1, -s.vx * 0.1 + (rng.next() - 0.5) * 6, -s.vy * 0.1 + (rng.next() - 0.5) * 6, 2 + rng.next() * 4, 1.6 + rng.next() * 1.4 + big, 2 + big * 4.5 + rng.next() * 2.5, 0.86, 0.76, 0.6, 0.3 + big * 0.18, rng.int(PUFF_VARIANTS));
      }
      // Hooves print the soil, the open heel behind.
      if (s.s.mounted && v2 > 300 && rng.next() < 0.22) {
        const sx = -projX(s.vx, s.vy);
        const sy = -projY(s.vx, s.vy);
        const k = (Math.round(((Math.atan2(sy, sx) - 0.4) / (Math.PI * 2)) * HOOVES) + HOOVES * 4) % HOOVES;
        f.decalId(HD_ID.hoof + k, mx + (rng.next() - 0.5) * 2.5, my + (rng.next() - 0.5) * 1.2, now);
      }
      // Feet wear the grass flat; where men stand and fight, or horse pass, it churns to mud.
      if ((i + tick) % 2 === 0) {
        const fighting = s.target >= 0 && tick - s.actedAt < 15;
        if (v2 > 30 || fighting) f.mark(mx + (rng.next() - 0.5) * 2.5, my + (rng.next() - 0.5) * 1.2, s.s.mounted ? 3.2 : 2.2, 0, s.s.mounted ? 0.14 : fighting ? 0.1 : 0.035, now);
      }
    }
    if (this.pools.length > 0) {
      let w = 0;
      for (const p of this.pools) {
        if (p.at <= tick) f.mark(p.x, p.y, p.r, p.ichor ? 0 : p.a, 0, now, p.ichor ? p.a : 0);
        else this.pools[w++] = p;
      }
      this.pools.length = w;
    }
    // Missiles that came down this tick: craters, spent arrows standing in the dirt, a kick of dust.
    const live = new Set(b.projectiles);
    this.aimShots();
    for (const p of this.flying) {
      if (live.has(p)) continue;
      if (p.splash > 0) {
        this.impactHd(f, p.x1, p.y1, now);
        continue;
      }
      const look = lookOf(p.cls, p.splash) as 'arrow' | 'bolt' | 'jav';
      if (rng.next() < 0.35) f.decalId((look === 'arrow' ? HD_ID.stuck_arrow : look === 'bolt' ? HD_ID.stuck_bolt : HD_ID.stuck_jav) + rng.int(3), this.mapX(p.x1, p.y1), this.mapY(p.x1, p.y1), now);
      if (rng.next() < 0.3) this.spawn(PK.Dust, p.x1, p.y1, 0.5, (rng.next() - 0.5) * 8, (rng.next() - 0.5) * 8, 3 + rng.next() * 3, 0.7 + rng.next() * 0.5, 1 + rng.int(2), 0.8, 0.7, 0.55, 0.5, rng.int(PUFF_VARIANTS));
    }
    // New shots: the teppō and the ōzutsu fire in a billow of white powder smoke.
    for (const p of b.projectiles) {
      if (this.flying.has(p)) continue;
      const bombard = p.cls === U.Artillery;
      if ((p.cls !== U.Crossbowmen && !bombard) || b.setup.armies[p.team]?.faction !== 'samurai') continue;
      const sh = ss[p.shooter];
      const x = sh ? sh.x : p.x0;
      const y = sh ? sh.y : p.y0;
      const l = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 1;
      const ux = (p.x1 - p.x0) / l;
      const uy = (p.y1 - p.y0) / l;
      const k = bombard ? 2.2 : 1;
      const n = bombard ? 14 : 5;
      for (let j = 0; j < n; j++) {
        const g = 0.8 + rng.next() * 0.12;
        const out = (1 + rng.next() * 3) * k;
        this.spawn(PK.Smoke, x + ux * out, y + uy * out, (bombard ? 4 : 7) + rng.next() * 2, ux * (5 + rng.next() * 12) * k + 2, uy * (5 + rng.next() * 12) * k, 2 + rng.next() * 3, (2.6 + rng.next() * 2.6) * (bombard ? 1.4 : 1), (bombard ? 3 : 2) + rng.int(3), g, g, g * 0.97, 0.75, rng.int(PUFF_VARIANTS));
      }
      for (let j = 0; j < (bombard ? 6 : 3); j++) this.spawn(PK.Spark, x + ux * 2 * k, y + uy * 2 * k, bombard ? 4 : 7, ux * 40 + (rng.next() - 0.5) * 20, uy * 40 + (rng.next() - 0.5) * 20, rng.next() * 10, 0.1 + rng.next() * 0.08, 1, 1, 0.8, 0.4, 1);
    }
    this.flying = live;
  }

  /** HD: a stone comes down: a crater, churned earth, a plume of dust and thrown clods. */
  private impactHd(f: HdField, x: number, y: number, now: number): void {
    const rng = this.hdRng;
    const mx = this.mapX(x, y);
    const my = this.mapY(x, y);
    f.decalId(HD_ID.crater + rng.int(2), mx, my, now);
    f.mark(mx, my, 7, 0, 0.5, now);
    for (let k = 0; k < 12; k++) {
      const g = 0.3 + rng.next() * 0.12;
      this.spawn(PK.Smoke, x + (rng.next() - 0.5) * 7, y + (rng.next() - 0.5) * 7, 2 + rng.next() * 5, (rng.next() - 0.5) * 16, (rng.next() - 0.5) * 16, 6 + rng.next() * 9, 2.2 + rng.next() * 1.8, 3 + rng.int(5), g, g * 0.88, g * 0.72, 0.6, rng.int(PUFF_VARIANTS));
    }
    for (let k = 0; k < 14; k++) {
      const g = rng.next() < 0.5 ? 0.24 : 0.38;
      this.spawn(PK.Debris, x, y, 2, (rng.next() - 0.5) * 55, (rng.next() - 0.5) * 55, 30 + rng.next() * 40, 1.5, 1 + rng.int(2), g, g * 0.86, g * 0.68, 1);
    }
  }

  /** HD: the ground with its marks and the decals flat on it (composed, cached; field-hd.ts). */
  private drawGroundHd(gfx: Gfx, f: HdField): void {
    const v = this.view;
    const gl = gfx.gl;
    const P = gfx.prog;
    f.drawGround(gl, gfx.scene!, v.camX, v.camY, v.bw, v.bh, v.m, this.battle.tick * TICK_S, v.direct ? v : null, (age, camX, camY, w, h) => {
      const d = this.hdFxB?.decal;
      if (!d || d.n === 0) return;
      P.use(camX, camY, w, h, -200, this.ground.h + 200, v.m);
      P.now(age);
      const sh = f.sheet(v.m);
      P.tex(f.sheetTexture(gl, v.m), sh.w, sh.h, v.m, 1);
      d.draw();
    });
    this.useView(P, -200, this.ground.h + 200);
  }

  /**
   * The sprite program on the scene target: the buffer, or zoomed out (view.direct) the canvas's
   * size, each device px drawn as the buffer px it would show (gl.ts useDirect).
   */
  private useView(P: SpriteProgram, zFar: number, zNear: number): void {
    const v = this.view;
    if (v.direct) P.useDirect(v.camX, v.camY, v.W, v.H, zFar, zNear, v.bw, v.bh, v.u, v.offX, v.offY);
    else P.use(v.camX, v.camY, v.bw, v.bh, zFar, zNear, v.m);
  }

  /** HD: a fallen man, every frame (nothing is stamped into the HD ground). */
  private corpseHd(i: number, hd: boolean, x0: number, x1: number, y0: number, y1: number, px0: number, px1: number, py0: number, py1: number): void {
    const s = this.battle.soldiers[i]!;
    const kind = this.kindOf(i);
    const mx = this.mapX(s.x, s.y);
    const my = this.mapY(s.x, s.y);
    if (mx < x0 || mx > x1 || my < y0 || my > y1) {
      // Within a screen: its kind's sheet is kept ready for a scroll (pickLevels).
      if (mx >= px0 && mx <= px1 && my >= py0 && my <= py1) this.seenNear[s.team] = this.seenNear[s.team]! | (1 << kind);
      return;
    }
    // In view: its kind keeps (or gets) a hi-res sheet.
    this.seenDead[s.team] = this.seenDead[s.team]! | (1 << kind);
    if (hd && this.hdLevel[s.team]![kind]! > 1 && this.hdCorpse(i, x0, x1, y0, y1)) return;
    const atlas = this.atlases[s.team as 0 | 1];
    const u = this.cellU(s.team, kind, Anim.Dead, 0, this.dirs[i] as Dir);
    this.gfx!.team[s.team as 0 | 1].sprite(Math.round(mx), Math.round(my), u, this.cellV, this.cellW, this.cellH, this.cellAx, this.cellAy, -1e5, 0.78, 0.78, 0.75, 1, 0, 1, this.cellCutX, this.cellCutY);
  }

  /** HD: the stakes, from the level-m sheet (and the HD batches cleared for the frame). */
  /** Whether any of a line of stakes (its ends' map box, a stake's height and more round it) is in view. */
  private stakesInView(k: { x: number; y0: number; y1: number }, x0: number, x1: number, y0: number, y1: number): boolean {
    const ax = this.mapX(k.x, k.y0);
    const bx = this.mapX(k.x, k.y1);
    const ay = this.mapY(k.x, k.y0);
    const by = this.mapY(k.x, k.y1);
    return Math.max(ax, bx) >= x0 - 40 && Math.min(ax, bx) <= x1 + 40 && Math.max(ay, by) >= y0 - 40 && Math.min(ay, by) <= y1 + 40;
  }

  private stakesHd(gfx: Gfx, m: number, x0: number, x1: number, y0: number, y1: number): void {
    const B = this.hdBatches(gfx);
    B.fx.clear();
    B.soft.clear();
    B.std.clear();
    const R = this.field!.sheet(m).regions;
    for (const k of this.battle.stakes) {
      if (!this.stakesInView(k, x0, x1, y0, y1)) continue;
      const r = R[HD_ID.stake + (k.team === 0 ? 0 : 1)]!;
      for (let y = k.y0; y <= k.y1; y += 3) {
        const mx = this.mapX(k.x, y);
        const my = this.mapY(k.x, y);
        B.fx.sprite(Math.round(mx * m) / m, Math.round(my * m) / m, r.u, r.v, r.w / m, r.h / m, r.ax / m, r.ay / m, my);
      }
    }
  }

  /** HD: decals, missiles in flight and particles, from the level-m sheet. */
  private buildHd(f: HdField, gfx: Gfx, T: number, dt: number, x0: number, x1: number, y0: number, y1: number): void {
    const B = this.hdBatches(gfx);
    const L = this.view.m;
    const R = f.sheet(L).regions;
    const q = (v: number) => Math.round(v * L) / L;
    const now = T * TICK_S;
    f.plan(this.view.camX, this.view.camY, this.view.bw, this.view.bh, L);
    f.buildDecals(B.decal, L);

    // Missiles in flight: an arc in the air, a small shadow on the ground.
    const dotR = R[HD_ID.dot]!;
    for (const p of this.battle.projectiles) {
      const span = Math.max(1, p.lands - p.born);
      const t = Math.min(1, Math.max(0, (T - p.born) / span));
      const gx = p.x0 + (p.x1 - p.x0) * t;
      const gy = p.y0 + (p.y1 - p.y0) * t;
      const mx = this.mapX(gx, gy);
      const my = this.mapY(gx, gy);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 100) continue;
      const dist = Math.sqrt((p.x1 - p.x0) ** 2 + (p.y1 - p.y0) ** 2);
      const look = lookOf(p.cls, p.splash);
      // The sim gives each missile its apex (bows lob higher for longer shots, crossbows a
      // short arc, guns none); older replays fall back on one arc per look.
      const arc = look === 'bolt' || look === 'jav' ? 0.1 : look === 'stone' ? 0.45 : 0.3;
      const h = (p.arc ?? dist * arc) * PX;
      const lift = 9;
      const z = 4 * h * t * (1 - t) + (1 - t) * lift;
      const dz = (4 * h * (1 - 2 * t) - lift) / span;
      const sx = (this.mapX(p.x1, p.y1) - this.mapX(p.x0, p.y0)) / span;
      const sy = (this.mapY(p.x1, p.y1) - this.mapY(p.x0, p.y0)) / span - dz;
      B.soft.sprite(q(mx), q(my), dotR.u, dotR.v, dotR.w / L, dotR.h / L, dotR.ax / L, dotR.ay / L, my, 0.05, 0.04, 0.03, 0.45);
      const id = look === 'stone' ? HD_ID.stone : HD_ID[look] + (Math.round((Math.atan2(sy, sx) / (Math.PI * 2)) * ANGLES + ANGLES) % ANGLES);
      const r = R[id]!;
      B.fx.sprite(q(mx), q(my - z), r.u, r.v, r.w / L, r.h / L, r.ax / L, r.ay / L, my, 1, 1, 1, 1, 0, 1);
      if (p.direct) {
        // A flat shot leaves a straight streak behind it: a line of texels fading back.
        const n = 3 * L;
        for (let k = 1; k <= n; k++) {
          const tk = Math.max(0, t - (k / L) * 0.04);
          const zk = 4 * h * tk * (1 - tk) + (1 - tk) * lift;
          const kx = this.mapX(p.x0 + (p.x1 - p.x0) * tk, p.y0 + (p.y1 - p.y0) * tk);
          const ky = this.mapY(p.x0 + (p.x1 - p.x0) * tk, p.y0 + (p.y1 - p.y0) * tk) - zk;
          B.soft.rect(q(kx), q(ky), 1 / L, 1 / L, my, 0.85, 0.82, 0.7, 0.55 - (k / n) * 0.45);
        }
      }
    }

    // Particles.
    const ps = this.particles;
    const rng = this.hdRng;
    const drop = Math.max(1, Math.round(L * 0.3));
    const damp = Math.exp(-dt * 2.2);
    const dampZ = Math.exp(-dt * 0.8);
    let w = 0;
    this.dustN = 0;
    for (const p of ps) {
      p.life += dt;
      // Raised during steps no frame saw (skipping, a hidden tab): long gone by now.
      if (p.life >= p.max || now - p.t0 > p.max + 0.5) {
        this.spare.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === PK.Blood || p.kind === PK.Debris || p.kind === PK.Spark) {
        p.vz -= (p.kind === PK.Spark ? 160 : 120) * dt;
        if (p.z <= 0) {
          // A drop soaks in where it lands.
          if (p.kind === PK.Blood && p.v > 0 && rng.next() < 0.2) f.mark(this.mapX(p.x, p.y), this.mapY(p.x, p.y), 0.6 + p.size * 0.3, p.v === 1 ? 0.22 : 0, 0, now, p.v === 2 ? 0.22 : 0);
          this.spare.push(p);
          continue;
        }
      } else {
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= dampZ;
      }
      ps[w++] = p;
      if (p.kind === PK.Dust) this.dustN++;
      const mx = this.mapX(p.x, p.y);
      const my = this.mapY(p.x, p.y);
      if (mx < x0 || mx > x1 || my < y0 || my > y1 + 60) continue;
      const fade = 1 - p.life / p.max;
      if (p.kind === PK.Blood || p.kind === PK.Debris) {
        const sz = (drop * p.size) / L;
        B.fx.rect(q(mx), q(my - p.z), sz, sz, my, p.r, p.g, p.b, 1);
      } else if (p.kind === PK.Wisp) {
        const sz = Math.max(1, Math.round(L * 0.25)) / L;
        B.soft.rect(q(mx), q(my - p.z), sz, sz, my + 3, p.r, p.g, p.b, p.a * Math.min(1, fade * 2));
      } else if (p.kind === PK.Spark) {
        // A short streak, hot white at the head.
        const sz = Math.max(1, Math.round(L * 0.2)) / L;
        B.soft.rect(q(mx), q(my - p.z), sz, sz, my + 3, 1, 0.95, 0.75, 1);
        B.soft.rect(q(mx - p.vx * 0.012), q(my - p.z + p.vz * 0.012), sz, sz, my + 3, p.r, p.g * 0.8, p.b * 0.5, Math.min(1, fade * 2));
      } else {
        const grow = p.kind === PK.Smoke ? p.life * 3.2 : p.life * 2.2;
        const d = p.size + grow;
        let si = 0;
        while (si < PUFF_SIZES.length - 1 && PUFF_SIZES[si]! < d) si++;
        const r = R[HD_ID.puff + si * PUFF_VARIANTS + ((p.v ?? 0) % PUFF_VARIANTS)]!;
        const a = p.a * Math.min(1, fade * 1.6) * Math.min(1, p.life * 6);
        B.soft.sprite(q(mx), q(my - p.z), r.u, r.v, r.w / L, r.h / L, r.ax / L, r.ay / L, my + 2, p.r, p.g, p.b, a);
      }
    }
    ps.length = w;
  }
}

export { TICK_S as SECONDS_PER_TICK } from '../../game/battle.ts';
