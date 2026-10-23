import { Application, CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Monument } from '../../protocol.ts';
import { BlastKind, Kind, PlatoonState, type MapDef, type TickEvents, type World } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import type { ChronicleEntry } from '../../sim/chronicle.ts';
import { derived } from '../../sim/derived.ts';
import { cellAt, cellCenterX, cellCenterY } from '../../sim/flowfield.ts';
import type { Runner } from '../net/runner.ts';
import type { FloatingEmote, GameStore } from '../store.ts';
import { sound } from '../audio/index.ts';
import { Atmosphere } from './atmosphere.ts';
import { BannerLayer } from './banners.ts';
import { Camera } from './camera.ts';
import { dayPhase, daylightAt, type Daylight } from './daylight.ts';
import { Director } from './director.ts';
import { FlagCache, type FlagTrim } from './flags.ts';
import { Effects } from './fx/index.ts';
import { loadFxArt } from './fx/atlas.ts';
import { FAR_ZOOM } from './lod.ts';
import { InfluenceLayer } from './influence.ts';
import { canvas2d, hslNumber, hslRgb, mixColor } from './paint.ts';
import { WaterGlints } from './shaders/water.ts';
import { siteArt } from './siteart.ts';
import { SiteLayer } from './sites.ts';
import { hitstopMs } from './impact.ts';
import { PostFx, postAllowed } from './post.ts';
import { paintTerrain } from './terrain.ts';
import { makeTextures, type Textures } from './textures.ts';
import { UnitLayer, type Blow } from './units.ts';
import { makeUnitArt, type UnitArt } from './art/index.ts';

export interface BattlefieldOptions {
  reducedMotion?: boolean;
}

/** A choreographed camera move, for set pieces: glide to a point, hold, then hand the camera back. */
export interface CinematicShot {
  x: number;
  y: number;
  zoom?: number;
  /** How long to hold on the subject once there. */
  holdMs?: number;
  /** 0..1: how far to dim the world around the subject. */
  dim?: number;
  /** Travel time; defaults by distance. */
  travelMs?: number;
  /** Why the shot was called (muster, dragon, sack, monolith…). */
  reason?: string;
}

/** Optional hooks the effects layer may expose. Read loosely so either side can land first. */
interface FxHooks {
  sound?: (name: string, x: number, y: number, gain: number) => void;
  onChronicle?(entries: readonly ChronicleEntry[], world: World): void;
  dayEnd?(): void;
  viewerP?: number | null;
  cinematic?: (shot: CinematicShot) => void;
  openGate?: (site: number) => void;
  setDaylight?(light: Daylight): void;
}

const GOLD = 0xf2cf5b;
/** Render time runs this slow during a big blow's micro-pause. */
const PAUSE_SCALE = 0.1;
/** At most one micro-pause in this long. */
const PAUSE_GAP_MS = 1500;
/** How hard each kind hits, for knockback: heavy hitters shove further. */
const HEFT: Partial<Record<number, number>> = {
  [Kind.Troll]: 1.9,
  [Kind.Knight]: 1.6,
  [Kind.Champion]: 1.8,
  [Kind.BoneGolem]: 1.6,
  [Kind.Berserker]: 1.4,
  [Kind.Dragon]: 2,
  [Kind.Trebuchet]: 2.2,
  [Kind.Wizard]: 1.8,
};
/** Multiply tint of the ground pool under platoons: a cool ink-blue shade, never grey. */
const POOL_TINT = 0x5a6684;
/**
 * How much of the hour's colour the actors (soldiers, bases, banners) take. Low, so a unit at
 * night or dusk keeps near-day contrast while the stage around it darkens.
 */
const ACTOR_GRADE = 0.14;
const MAX_TORCHES = 220;
/** How often unused flag textures are swept from the cache. */
const FLAG_PRUNE_MS = 15_000;

interface MapLayers {
  map: MapDef;
  /** The war parameters the map was generated from. */
  key: string;
  terrain: Sprite;
  water: WaterGlints;
  sites: SiteLayer;
  influence: InfluenceLayer;
  atmosphere: Atmosphere;
}

function mapKey(world: World): string {
  const { seed, slots, members } = world.params;
  return `${seed}:${slots}:${members}`;
}

/** Army colours as pigments: the hue mixed toward a warm earth, never raw neon. */
export function pigmentOf(hue: number): number {
  return mixColor(hslNumber(hue, 66, 50), 0x9a7a4e, 0.16);
}

/** The pigment the actors wear: the same hue as the map's, bolder and closer to pure, still not neon. */
export function actorPigmentOf(hue: number): number {
  return mixColor(hslNumber(hue, 80, 52), 0x9a7a4e, 0.06);
}

// A page's fonts must be ready before anything is lettered onto a canvas.
async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const faces = ['20px "IM Fell English SC"', 'italic 20px "IM Fell English"', '20px "IM Fell English"', 'italic 15px Alegreya', '15px "Alegreya SC"', '700 13px "JetBrains Mono"'];
  const timeout = new Promise<void>((r) => setTimeout(r, 2500));
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => []))).then(() => undefined), timeout]);
}

let sharedTextures: Textures | null = null;
let sharedUnitArt: UnitArt | null = null;
let sunTex: Texture | null = null;
function sunGradient(): Texture {
  if (sunTex) return sunTex;
  const [c, ctx] = canvas2d(256, 4);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(90,90,90,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 4);
  sunTex = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
  return sunTex;
}

let vignetteTex: Texture | null = null;
function vignette(): Texture {
  if (vignetteTex) return vignetteTex;
  const [c, ctx] = canvas2d(256, 256);
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(70,80,120,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  vignetteTex = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
  return vignetteTex;
}

/** The battlefield: owns the Pixi application, the camera and every visual layer. */
export class Battlefield {
  /** The painted world, under the day–night grade. */
  private readonly world = new Container();
  private readonly groundLayer = new Container();
  private readonly selection = new Graphics();
  /** Screen-space grade: a multiply wash for the hour, a screen lift so the night stays legible. */
  private readonly grade = new Container();
  private readonly gradeMult = new Sprite(Texture.WHITE);
  private readonly gradeLift = new Sprite(Texture.WHITE);
  private readonly gradeVignette: Sprite;
  private readonly gradeDim = new Sprite(Texture.WHITE);
  /** The low sun's glow raking in from the east at dawn and the west at dusk. */
  private readonly gradeSun: Sprite;
  /** Emissive lights and the readable overlays, above the grade with the same camera transform. */
  private readonly top = new Container();
  private readonly lights = new Container();
  private readonly actors = new Container();
  /** Fliers soar over the banners; they take the same share of the hour's colour as the soldiers. */
  private readonly sky = new Container();
  private readonly torches: Sprite[] = [];
  /** A soft cool shade pooled on the ground under each platoon: the stage dims where the actors stand. */
  private readonly pools: Sprite[] = [];
  /** Army pigments as worn by the actors: the same hue, more vivid than the map's pigment. */
  private actorTints: number[] = [];
  private readonly camera: Camera;
  private readonly units: UnitLayer;
  private readonly fx: Effects;
  private readonly banners: BannerLayer;
  private readonly flags = new FlagCache();
  private readonly director: Director;
  /** Emissive bloom, filmic tone and vibrance over the finished field. */
  private readonly post: PostFx;
  private layers: MapLayers | null = null;
  private unsubscribe: (() => void)[] = [];
  private last = performance.now();
  private started = performance.now();
  private shake = 0;
  private tints: number[] = [];
  private rgb: [number, number, number][] = [];
  private hues: number[] = [];
  /** Each player's Armory trim, sewn onto their flags. */
  private trims: (FlagTrim | undefined)[] = [];
  private destroyed = false;
  private timeOverride: number | null = null;
  private light: Daylight = daylightAt(0.3);
  private cine: { until: number; dim: number; resume: boolean } | null = null;
  private dim = 0;
  private monumentKey = '';
  private audioAt = 0;
  private fires: { x: number; y: number }[] = [];
  private warStatus = '';
  /** The last sim tick drawn: a step back in time means a new war or a rewound replay. */
  private lastTick = -1;
  private flagPruneAt = 0;
  private readonly flagsInUse = new Set<Texture>();
  private detachEnv: (() => void)[] = [];
  private drawnResolve: () => void = () => {};
  private drawnOnce = false;
  /** Resolves once the painted map has reached the screen, so the page can lift its loading leaf. */
  readonly drawn: Promise<void> = new Promise((resolve) => {
    this.drawnResolve = resolve;
  });
  /** Smoothed milliseconds of JavaScript per frame, for diagnostics. */
  frameMs = 0;
  /** Smoothed milliseconds per stage of the last frames, for diagnostics. */
  readonly timings: Record<string, number> = {};

  private constructor(
    private readonly app: Application,
    private readonly host: HTMLElement,
    private readonly store: GameStore,
    private readonly getRunner: () => Runner | null,
    private readonly tex: Textures,
    art: UnitArt,
    private readonly opts: BattlefieldOptions,
  ) {
    this.units = new UnitLayer(tex, art);
    this.fx = new Effects({ reducedMotion: opts.reducedMotion });
    // Fliers are drawn mid-cell, lifted by their flight height: aim effects at the creature's body.
    this.fx.flyHeight = (kind) => {
      const flight = art.flight(kind);
      if (!flight) return 0;
      const cell = art.cell(kind);
      return flight.height + ((cell.feetY - cell.h / 2) / cell.h) * art.scale(kind);
    };
    this.banners = new BannerLayer(this.flags);
    this.gradeVignette = new Sprite(vignette());
    this.gradeSun = new Sprite(sunGradient());
    this.gradeSun.blendMode = 'screen';
    this.gradeMult.blendMode = 'multiply';
    this.gradeLift.blendMode = 'screen';
    this.gradeVignette.blendMode = 'multiply';
    this.gradeDim.tint = 0x0c1020;
    this.gradeDim.alpha = 0;
    this.grade.addChild(this.gradeMult, this.gradeVignette, this.gradeLift, this.gradeSun, this.gradeDim);
    this.lights.blendMode = 'add';
    for (let i = 0; i < MAX_TORCHES; i++) {
      const s = new Sprite(tex.soft);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xffa448;
      s.visible = false;
      this.torches.push(s);
    }
    const torchLayer = new Container();
    torchLayer.addChild(...this.torches);
    app.stage.addChild(this.world, this.grade, this.top);
    for (let i = 0; i < MAX_TORCHES; i++) {
      const s = new Sprite(tex.soft);
      s.anchor.set(0.5);
      s.blendMode = 'multiply';
      s.tint = POOL_TINT;
      s.visible = false;
      this.pools.push(s);
    }
    const poolLayer = new Container();
    poolLayer.addChild(...this.pools);
    this.world.addChild(
      this.groundLayer,
      poolLayer,
      this.selection,
      this.fx.ground,
      this.units.shadows,
    );
    // Soldiers ride above the grade with only part of the hour's colour, so dark ink
    // silhouettes never sink into the night ground.
    this.actors.addChild(this.units.bodies, this.units.dots, this.fx.air);
    this.sky.addChild(this.units.air);
    this.top.addChild(this.lights, torchLayer, this.units.bases, this.actors, this.fx.glow, this.banners.root, this.sky, this.fx.overlay);
    this.camera = new Camera(app.canvas, {
      onClick: (sx, sy) => this.click(sx, sy),
      onUserPan: () => {
        store.setFollowing(false);
        store.setFollowMine(false);
        this.cine = null;
      },
      // Zooming while riding with your own banner keeps the ride; it ends a set piece and the director's tour.
      onUserZoom: () => {
        store.setFollowing(false);
        this.cine = null;
      },
      onFollowKey: () => this.toggleFollowMine(),
    });
    const post = postAllowed(app.renderer, !!opts.reducedMotion);
    this.post = new PostFx(app.renderer, app.stage, [this.lights, this.fx.glow], post.allowed, post.forced);
    this.director = new Director(() => (this.layers ? this.camera.fitZoom(this.layers.map.radius) : 0.5));
    const hooks = this.fx as unknown as FxHooks;
    this.unsubscribe.push(
      store.onStep((ev, world) => this.onStep(ev, world)),
      store.onEmote((e) => this.onEmote(e)),
      store.onChronicle((entries) => {
        const world = store.world;
        if (world) hooks.onChronicle?.(entries, world);
      }),
    );
    // Effects may ask the camera for a set-piece shot, or a capital to open its gates.
    hooks.cinematic = (shot) => this.cinematic(shot);
    // Effects name a capital by its slot; capitals are the first sites, one per slot.
    hooks.openGate = (slot) => this.layers?.sites.openGate(slot, performance.now());
    hooks.sound = (name, x, y, gain) => {
      // Audio is a garnish: a failing sound must never break the frame that asked for it.
      try {
        sound.play(name, { x, y, gain });
      } catch {
        /* ignored */
      }
    };
    app.ticker.add(this.tick);
    this.watchEnvironment();
  }

  /**
   * Things the page can change under a running field: the host's size (Pixi only watches the
   * window), the screen's pixel density (a window dragged to another monitor), the reduced-motion
   * preference, and a lost WebGL context.
   */
  private watchEnvironment(): void {
    const off = this.detachEnv;
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.app.queueResize?.());
      ro.observe(this.host);
      off.push(() => ro.disconnect());
    }
    const mm = typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined;
    if (mm) {
      let dpr: MediaQueryList | null = null;
      const onDpr = () => {
        const res = Math.min(2, window.devicePixelRatio || 1);
        if (res !== this.app.renderer.resolution) this.app.renderer.resize(this.app.screen.width, this.app.screen.height, res);
        watchDpr();
      };
      const watchDpr = () => {
        dpr?.removeEventListener('change', onDpr);
        dpr = mm(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        dpr.addEventListener?.('change', onDpr);
      };
      watchDpr();
      off.push(() => dpr?.removeEventListener('change', onDpr));
      const rm = mm('(prefers-reduced-motion: reduce)');
      const onRm = () => this.setReducedMotion(rm.matches);
      rm.addEventListener?.('change', onRm);
      off.push(() => rm.removeEventListener?.('change', onRm));
    }
    // Pixi restores a lost context itself and re-uploads every canvas-backed texture; meanwhile
    // nothing is drawn, so skip the frame work until it is back.
    const canvas = this.app.canvas;
    const lost = () => {
      this.contextLost = true;
    };
    const restored = () => {
      this.contextLost = false;
      this.last = performance.now();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    off.push(() => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    });
  }

  private contextLost = false;
  /** Who swung at whom, this step and the step before (a melee blow lands a tick after its swing). */
  private swungNow = new Map<number, number>();
  private swungPrev = new Map<number, number>();
  private readonly byId = new Map<number, World['units'][number]>();
  private readonly blow: Blow = { dx: 0, dy: 0, share: 0, power: 1, heavy: false };
  /** Sim steps applied since the last frame: more than one means catch-up or a seek. */
  private stepsThisFrame = 0;
  /** A big blow's micro-pause: render time runs at a tenth until then. */
  private pauseUntil = 0;
  private pausedAt = -1e9;

  /** Follows the viewer's reduced-motion setting as it changes. */
  setReducedMotion(on: boolean): void {
    this.opts.reducedMotion = on;
    this.fx.setReducedMotion(on);
    this.post.setAllowed(postAllowed(this.app.renderer, on).allowed);
    if (on) this.shake = 0;
  }

  /**
   * Starts the renderer. Safe against being torn down mid-start (React StrictMode
   * mounts, unmounts and remounts): pass a signal, and an aborted start cleans up
   * after itself and rejects with an AbortError instead of leaking a WebGL context.
   */
  static async create(host: HTMLElement, store: GameStore, getRunner: () => Runner | null, opts: BattlefieldOptions & { signal?: AbortSignal } = {}): Promise<Battlefield> {
    const { signal } = opts;
    const aborted = () => signal?.aborted || !host.isConnected;
    const abort = () => new DOMException('The battlefield was unmounted while starting.', 'AbortError');
    // Paint shared art and load fonts before touching WebGL, so an early unmount costs nothing.
    await fontsReady();
    await loadFxArt();
    if (aborted()) throw abort();
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x1a120b,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    if (aborted()) {
      // Nothing of ours was added yet: drop the context and the canvas, keep shared textures.
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      throw abort();
    }
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    host.appendChild(app.canvas);
    const reducedMotion = opts.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    siteArt();
    // Baked once per page: a remount (StrictMode, route changes) reuses the atlases.
    sharedTextures ??= makeTextures();
    sharedUnitArt ??= makeUnitArt();
    const field = new Battlefield(app, host, store, getRunner, sharedTextures, sharedUnitArt, { reducedMotion });
    if (signal) signal.addEventListener('abort', () => field.destroy(), { once: true });
    // The first frame draws at once; soldiers' art bakes kind by kind in idle time behind it.
    void sharedUnitArt.warm();
    return field;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.app.ticker.stop();
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
    for (const off of this.detachEnv) off();
    this.detachEnv = [];
    // The battle's murmur belongs to the field: leaving it should not leave the din playing.
    try {
      sound.setBattleIntensity?.(0);
    } catch {
      /* ignored */
    }
    this.camera.destroy();
    this.dropMap();
    this.banners.destroy();
    this.post.destroy();
    this.fx.destroy();
    this.flags.destroy();
    // Shared atlases (unit art, site art, fx sheets) outlive this field: never destroy texture
    // sources from here, or a remount would draw from (and hang on) freed GPU resources.
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    void this.host;
  }

  focus(x: number, y: number, zoom?: number): void {
    this.store.setFollowing(false);
    this.store.setFollowMine(false);
    this.camera.panTo(x, y, zoom ?? Math.max(this.camera.zoom, 1.1));
  }

  focusPlayer(p: number): void {
    const world = this.store.world;
    const player = world?.players[p];
    if (!world || !player) return;
    const site = world.map.sites[player.slot]!;
    this.focus(site.x * 0.85, site.y * 0.85, 0.9);
  }

  /**
   * A set-piece camera move: ease to the subject, optionally dim the world around it,
   * hold, then give the camera back to whoever had it (the director or the player).
   */
  cinematic(shot: CinematicShot): void {
    if (this.destroyed) return;
    const zoom = shot.zoom ?? Math.max(this.camera.zoom, 1.2);
    const dist = Math.hypot(shot.x - this.camera.x, shot.y - this.camera.y) * Math.min(this.camera.zoom, zoom);
    const travel = this.opts.reducedMotion ? 1 : shot.travelMs ?? Math.max(700, Math.min(1800, 500 + dist * 1.1));
    const resume = this.cine?.resume ?? this.store.following;
    this.store.setFollowing(false);
    this.camera.shot(shot.x, shot.y, zoom, travel);
    // The dragon's summoning paints its own dimming and wing shadow: don't double it.
    const dim = shot.reason === 'dragon' ? 0 : Math.max(0, Math.min(1, shot.dim ?? (shot.reason === 'monolith' || shot.reason === 'sack' ? 0.5 : 0)));
    this.cine = { until: performance.now() + travel + (shot.holdMs ?? 2200), dim, resume };
  }

  /** Force the hour (0 dawn … 1 night), for previews and tests; null follows the war clock. */
  setTimeOverride(phase: number | null): void {
    this.timeOverride = phase === null ? null : ((phase % 1) + 1) % 1;
  }

  /** Statues of named legends and the Season Victor's obelisk. */
  setMonuments(list: readonly Monument[]): void {
    const world = this.store.world;
    if (!world || !this.layers) return;
    this.layers.sites.setMonuments(list, world, this.store.names);
    this.monumentKey = monumentKey(list);
  }

  /** Ride along with the viewer's freshest platoon (key F). */
  toggleFollowMine(): void {
    this.store.setFollowMine(!this.store.followMine);
  }

  // ---------------------------------------------------------------- frame

  private tick = (): void => {
    if (this.destroyed) return;
    if (this.contextLost) {
      // Keep the war and the HUD moving while the GPU is away.
      this.getRunner()?.frame();
      this.store.pump();
      this.last = performance.now();
      return;
    }
    const started = performance.now();
    this.draw();
    this.frameMs = this.frameMs * 0.95 + (performance.now() - started) * 0.05;
  };

  private draw(): void {
    const now = performance.now();
    const dtMs = Math.min(100, now - this.last);
    this.last = now;
    const runner = this.getRunner();
    let mark = performance.now();
    const time = (name: string) => {
      const t = performance.now();
      this.timings[name] = (this.timings[name] ?? 0) * 0.95 + (t - mark) * 0.05;
      mark = t;
    };
    this.stepsThisFrame = 0;
    runner?.frame();
    time('sim');
    this.store.pump();
    time('hud');
    if (this.destroyed) return;
    const world = this.store.world;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.camera.resize(sw, sh);
    if (!world) {
      this.world.visible = this.top.visible = this.grade.visible = false;
      return;
    }
    this.world.visible = this.top.visible = this.grade.visible = true;
    // A resync restores a new world object with an identical map: keep the painted terrain and the
    // camera. Only a different war (rollover) needs a new map.
    if (!this.layers || this.layers.key !== mapKey(world)) {
      this.buildMap(world);
      this.resetTransient();
      mark = performance.now();
    } else if (world.tick < this.lastTick) {
      // Same map, earlier hour (a rewound replay, a war restarted on the same seed): soldier and
      // platoon ids now name others, so nothing may glide over from where the old ones stood.
      this.resetTransient();
    }
    this.lastTick = world.tick;
    const layers = this.layers!;
    this.refreshColors(world);
    const monuments = this.store.monuments;
    if (monumentKey(monuments) !== this.monumentKey) this.setMonuments(monuments);
    this.watchWar();

    // ---- the hour
    const phase = this.timeOverride ?? dayPhase(this.store, world.tick);
    this.light = daylightAt(phase);
    const light = this.light;
    (this.fx as unknown as FxHooks).setDaylight?.(light);

    // ---- camera
    if (this.cine && now >= this.cine.until && !this.camera.busy) {
      if (this.cine.resume) this.store.setFollowing(true);
      this.cine = null;
    }
    if (this.store.followMine && !this.camera.busy && !this.cine) {
      const target = this.myBanner(world);
      if (target) this.camera.drift(target.x, target.y, Math.max(0.6, Math.min(this.camera.zoom, 2.4)), dtMs * 1.6);
      this.director.next(dtMs, now);
    } else if (this.store.following && !this.camera.busy && !this.cine) {
      const shot = this.director.next(dtMs, now);
      this.camera.drift(shot.x, shot.y, shot.zoom, dtMs);
    } else this.director.next(dtMs, now);
    this.camera.update(dtMs);

    const zoom = this.camera.zoom;
    this.shake = Math.max(0, this.shake - dtMs / 600);
    const jx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    const jy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    const px = sw / 2 - this.camera.x * zoom + jx;
    const py = sh / 2 - this.camera.y * zoom + jy;
    this.world.scale.set(zoom);
    this.world.position.set(px, py);
    this.top.scale.set(zoom);
    this.top.position.set(px, py);

    // ---- grade: multiply wash, night vignette, a cool screen lift, and the cinematic dim
    this.gradeMult.width = this.gradeLift.width = this.gradeVignette.width = this.gradeDim.width = sw;
    this.gradeMult.height = this.gradeLift.height = this.gradeVignette.height = this.gradeDim.height = sh;
    this.gradeMult.tint = light.mult;
    this.gradeMult.visible = light.mult !== 0xffffff;
    this.gradeLift.tint = light.screen;
    this.gradeLift.visible = light.screen !== 0;
    // The vignette deepens only with the night; dawn's lit windows must not darken the page edge.
    const night = light.phase >= 0.7 ? light.lights : 0;
    this.gradeVignette.alpha = 0.18 + night * 0.6;
    const dawn = 1 - Math.min(1, light.phase / 0.14);
    const dusk = Math.max(0, 1 - Math.abs(light.phase - 0.76) / 0.08);
    this.gradeSun.visible = dawn + dusk > 0.01;
    if (this.gradeSun.visible) {
      // A luminous gold sunrise from the east; a crimson sunset from the west.
      const east = dawn > dusk;
      this.gradeSun.tint = east ? 0xb07a1c : 0xb01430;
      this.gradeSun.alpha = Math.max(dawn, dusk) * (east ? 0.5 : 0.5);
      this.gradeSun.height = sh;
      this.gradeSun.width = east ? -sw : sw;
      this.gradeSun.x = east ? sw : 0;
    }
    const dimTarget = this.cine ? this.cine.dim : 0;
    this.dim += (dimTarget - this.dim) * (1 - Math.pow(0.02, dtMs / 1000));
    this.gradeDim.alpha = this.dim * 0.55;
    this.gradeDim.visible = this.dim > 0.01;
    // Banners and labels stay readable at night, but still take a little of the hour's colour.
    this.banners.root.tint = mixColor(0xffffff, light.mult, ACTOR_GRADE);
    this.actors.tint = mixColor(0xffffff, light.mult, ACTOR_GRADE);
    this.units.bases.tint = this.actors.tint;

    const bounds = this.camera.bounds(60);
    const cry = world.players.map((p) => p.cryUntil > world.tick);
    this.units.tints = this.actorTints;
    this.units.cryTint = this.actorTints.map((t, p) => (cry[p] ? mixColor(t, GOLD, 0.45 + Math.sin(now / 140) * 0.3) : t));
    time('camera');
    const timeScale = now < this.pauseUntil ? PAUSE_SCALE : 1;
    this.units.timeScale = timeScale;
    this.units.reduced = !!this.opts.reducedMotion;
    this.units.night = light.lights;
    this.units.update(world, runner, now, zoom, bounds);
    time('units');
    // Interpolated, as the soldiers are drawn: banners, torches and the selection ride with them.
    const centroids = this.units.centroids;
    const sel = this.store.selection;
    for (const r of this.store.roster) this.trims[r.p] = r.heraldry?.trim;
    this.banners.update(world, this.store.repos, this.hues, now, zoom, centroids, bounds, sel?.kind === 'platoon' ? sel.id : null, this.trims, dtMs, !!this.opts.reducedMotion);
    this.sky.tint = this.actors.tint;
    if (now >= this.flagPruneAt) {
      this.flagPruneAt = now + FLAG_PRUNE_MS;
      const inUse = this.flagsInUse;
      inUse.clear();
      this.banners.texturesInUse(inUse);
      layers.sites.texturesInUse(inUse);
      this.flags.prune(inUse);
      inUse.clear();
    }
    time('banners');
    const near = zoom >= FAR_ZOOM;
    layers.sites.compact = Math.min(sw, sh) < 600;
    layers.sites.reducedMotion = !!this.opts.reducedMotion;
    layers.sites.update(
      world,
      this.store.roster,
      this.store.names,
      this.tints,
      now,
      dtMs / 1000,
      zoom,
      sel?.kind === 'site' ? sel.id : null,
      {
        smoke: (x, y, heavy) =>
          heavy
            ? this.fx.burst({ x, y, count: 1, texture: 'smoke', tint: 0x3a3230, speed: 6, life: 3.4, size: 30, grow: 2.8, alpha: 0.6, rise: 16 })
            : this.fx.burst({ x, y, count: 1, texture: 'smoke', tint: 0x9a9286, speed: 3, life: 3.6, size: 9, grow: 3.2, alpha: 0.42, rise: 12, spread: 2 }),
      },
      { lights: light.lights, leader: world.leader, near, inView: (x, y) => bounds.contains(x, y) },
    );
    time('sites');
    layers.influence.update(world, this.rgb, now);
    time('influence');
    layers.water.update((now - this.started) / 1000, light.day, zoom);
    const view = { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
    this.collectFires(world);
    layers.atmosphere.update(dtMs, now, zoom, view, light, !!this.opts.reducedMotion);
    time('atmosphere');
    this.updateTorches(world, centroids, zoom, bounds, now);
    time('world');
    this.drawSelection(world, centroids, now, zoom);
    const hud = this.camera.hudInsets();
    this.fx.view = { ox: px, oy: py, width: sw, height: sh, top: hud.top, bottom: hud.bottom };
    this.fx.update(dtMs * (now < this.pauseUntil ? PAUSE_SCALE : 1), world.tick - 1 + (runner?.alpha ?? 1), this.posOf, zoom, bounds);
    if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, this.fx.shake);
    time('fx');
    this.feedAudio(now, world, light);
    this.post.update(dtMs, sw, sh, zoom, px, py);
    time('post');
    if (!this.drawnOnce) {
      this.drawnOnce = true;
      // The renderer paints after this tick: the frame after next has the map on screen.
      requestAnimationFrame(() => requestAnimationFrame(() => this.drawnResolve()));
    }
  }

  /** The platoon the "Follow my banner" camera rides with: the viewer's newest one in the field. */
  private myBanner(world: World): { x: number; y: number } | null {
    const p = this.store.viewerP ?? (this.store.war && this.store.war.id !== 0 ? null : world.leader);
    if (p === null || p < 0) return null;
    let best: { x: number; y: number } | null = null;
    let bestId = -1;
    for (const pl of world.platoons) {
      if (pl.p !== p || pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
      if (pl.id > bestId) {
        bestId = pl.id;
        best = pl;
      }
    }
    if (best) return { x: best.x, y: best.y };
    const site = world.map.sites[world.players[p]?.slot ?? -1];
    return site ? { x: site.x, y: site.y } : null;
  }

  /** Fires for night embers: sacked capitals smoulder, held ones keep their hearths lit. */
  private collectFires(world: World): void {
    this.fires.length = 0;
    for (const st of world.structures) {
      const s = world.map.sites[st.site];
      if (!s || s.kind !== 'capital') continue;
      this.fires.push({ x: s.x, y: s.y - s.radius * (st.ruinedUntil >= 0 ? 0.4 : 1.2) });
    }
  }

  /** At night every platoon in the field carries torches: a warm pool of light over the block. */
  private updateTorches(world: World, centroids: Map<number, { x: number; y: number; n: number }>, zoom: number, bounds: { contains(x: number, y: number): boolean }, now: number): void {
    const strength = this.light.lights;
    // The stage dims under the actors: a soft cool pool of shade below every platoon in view, so
    // the light figure halos stand out from busy grass, forest and road alike.
    let pooled = 0;
    if (zoom >= FAR_ZOOM) {
      const fade = Math.min(1, (zoom - FAR_ZOOM) / 0.25);
      for (const pl of world.platoons) {
        if (pooled >= MAX_TORCHES) break;
        if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
        const c = centroids.get(pl.id);
        if (!c || !bounds.contains(c.x, c.y)) continue;
        const s = this.pools[pooled++]!;
        s.visible = true;
        const r = 30 + Math.sqrt(c.n) * 11;
        s.position.set(c.x, c.y - 4);
        s.scale.set(r / 32, (r * 0.72) / 32);
        s.alpha = 0.42 * fade;
      }
    }
    for (let i = pooled; i < MAX_TORCHES; i++) {
      const s = this.pools[i]!;
      if (!s.visible) break;
      s.visible = false;
    }
    let used = 0;
    if (strength > 0.04) {
      for (const pl of world.platoons) {
        if (used >= MAX_TORCHES) break;
        if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
        const c = centroids.get(pl.id);
        if (!c || !bounds.contains(c.x, c.y)) continue;
        const s = this.torches[used++]!;
        s.visible = true;
        const r = 26 + Math.sqrt(c.n) * 9;
        s.position.set(c.x, c.y - 6);
        s.scale.set(r / 32, (r * 0.7) / 32);
        const flicker = 0.88 + Math.sin(now / 90 + pl.id * 1.3) * 0.06 + Math.sin(now / 37 + pl.id) * 0.04;
        s.alpha = strength * 0.46 * flicker * (zoom < FAR_ZOOM ? 0.7 : 1);
      }
    }
    for (let i = used; i < MAX_TORCHES; i++) {
      const s = this.torches[i]!;
      if (!s.visible) break;
      s.visible = false;
    }
  }

  private watchWar(): void {
    const status = `${this.store.war?.id ?? -1}:${this.store.war?.status ?? ''}:${this.store.digestReady ? 1 : 0}`;
    if (status === this.warStatus) return;
    const ended = this.warStatus !== '' && (this.store.war?.status === 'ended' || this.store.digestReady);
    this.warStatus = status;
    if (ended) (this.fx as unknown as FxHooks).dayEnd?.();
    (this.fx as unknown as FxHooks).viewerP = this.store.viewerP;
  }

  private feedAudio(now: number, world: World, light: Daylight): void {
    try {
      sound.setListener?.(this.camera.x, this.camera.y, this.camera.zoom);
      if (now < this.audioAt) return;
      this.audioAt = now + 250;
      let engaged = 0;
      for (const pl of world.platoons) if (pl.state === PlatoonState.Engage) engaged += pl.alive;
      sound.setBattleIntensity?.(Math.min(1, engaged / 400));
      sound.setTimeOfDay?.(light.phase);
    } catch {
      // Same rule as cues: the audio engine can never stop the render tick.
    }
  }

  /** Forget everything tied to the old field's soldiers, platoons and set pieces. */
  private resetTransient(): void {
    this.units.reset();
    this.banners.reset();
    this.fx.reset();
    this.director.reset();
    this.shake = 0;
  }

  private dropMap(): void {
    if (!this.layers) return;
    const { terrain, influence, water, sites, atmosphere } = this.layers;
    this.groundLayer.removeChildren();
    // The terrain canvas and influence textures belong to this map alone; the site
    // sprites share the painted site art, so only their display objects are destroyed.
    terrain.destroy({ texture: true, textureSource: true });
    influence.sprite.destroy({ texture: true, textureSource: true });
    water.destroy();
    sites.destroy();
    atmosphere.destroy();
    this.layers = null;
  }

  private buildMap(world: World): void {
    this.dropMap();
    const map = world.map;
    const day = this.store.war?.day;
    const art = paintTerrain(map, world.params.seed, 3072, {
      title: 'The Field of Pushes',
      subtitle: day ? `as the war stood on ${day}` : 'a sparring war, in the scribe’s hand',
    });
    const terrain = new Sprite(new Texture({ source: new CanvasSource({ resource: art.canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }) }));
    terrain.anchor.set(0.5);
    terrain.width = terrain.height = art.extent * 2;
    const water = new WaterGlints(new Texture({ source: new CanvasSource({ resource: art.water, scaleMode: 'linear' }) }), art.extent);
    const influence = new InfluenceLayer(map.radius);
    const sites = new SiteLayer(this.tex, this.flags, world);
    const atmosphere = new Atmosphere(map, art.sea, () => this.fires);
    this.groundLayer.addChild(terrain, water.mesh, atmosphere.ground, influence.sprite, sites.ground, sites.root);
    // Cloud shadows and birds pass over the ground; their glow joins the lights.
    this.world.addChild(atmosphere.air);
    this.lights.addChild(sites.lights, atmosphere.glow);
    this.top.addChild(sites.labels.root);
    this.top.setChildIndex(sites.labels.root, this.top.children.indexOf(this.fx.overlay));
    this.layers = { map, key: mapKey(world), terrain, water, sites, influence, atmosphere };
    this.monumentKey = '';
    this.camera.fit(map.radius);
  }

  private refreshColors(world: World): void {
    for (const p of world.players) {
      if (this.tints[p.p] !== undefined && this.hues[p.p] === p.hue) continue;
      this.hues[p.p] = p.hue;
      this.tints[p.p] = pigmentOf(p.hue);
      this.actorTints[p.p] = actorPigmentOf(p.hue);
      this.rgb[p.p] = hslRgb(p.hue, 62, 46);
    }
  }

  // ---------------------------------------------------------------- events

  /** Ground position of a soldier as last drawn, or the top of a structure (id < 0). */
  private posOf = (id: number): { x: number; y: number } | null => {
    const world = this.store.world;
    if (!world) return null;
    if (id < 0) {
      const st = world.structures[-id - 1];
      if (!st) return null;
      const s = world.map.sites[st.site]!;
      return { x: s.x, y: s.y - s.radius * 0.6 };
    }
    return this.units.pose(id) ?? null;
  };

  private onStep(ev: TickEvents, world: World): void {
    if (!this.layers || this.destroyed) return;
    this.stepsThisFrame++;
    this.director.observe(ev, world);
    const now = performance.now();
    const near = this.camera.zoom >= FAR_ZOOM;
    const bounds = this.camera.bounds(120);
    this.fx.onStep(ev, world, { posOf: this.posOf, tints: this.tints, near, bounds });

    // A muster swings its capital's gates open as the column marches out.
    for (const m of ev.musters) {
      if (m.queued) continue;
      const slot = world.players[m.p]?.slot;
      if (slot !== undefined) this.layers.sites.openGate(slot, now);
    }
    for (const m of ev.marches) {
      const pl = world.platoons.find((x) => x.id === m.platoon);
      const slot = pl ? world.players[pl.p]?.slot : undefined;
      if (slot !== undefined) this.layers.sites.openGate(slot, now);
    }
    // A melee blow winds up one tick and lands the next: remember who swung at whom.
    const swung = this.swungPrev;
    this.swungPrev = this.swungNow;
    this.swungNow = swung;
    swung.clear();
    for (const s of ev.swings) {
      swung.set(s.to, s.from);
      const target = this.posOf(s.to);
      if (target) this.units.swing(s.from, target.x, target.y);
    }
    // Archers, wizards and trebuchets play their attack pose as they loose.
    for (const s of ev.shots) {
      if (s.from <= 0) continue;
      const target = this.posOf(s.to);
      if (target) this.units.swing(s.from, target.x, target.y);
    }
    this.impacts(ev, world, now, bounds);
    if (near) {
      for (const d of ev.deaths) {
        const p = this.units.pose(d.unit);
        const x = p?.x ?? d.x;
        const y = p?.y ?? d.y;
        // A kind still baking was drawn as a token: no body to fall, and no synchronous bake mid-step.
        if (!bounds.contains(x, y) || !this.units.artReady(d.kind)) continue;
        const c = this.units.corpse(d.kind);
        this.fx.corpse(c.texture, x, y, p?.facing ?? 1, c.scale, 0xd0d0d0, c.altitude, c.anchorY);
      }
    }
    for (const r of ev.regroups) this.banners.regroup(r.from, r.to, now);
    for (const r of ev.routs) {
      this.banners.rout(r.platoon, now);
      const pl = world.platoons.find((x) => x.id === r.platoon);
      if (pl && bounds.contains(pl.x, pl.y)) this.fx.floatText('ROUT!', pl.x, pl.y - 36, 1.6, 15, 0xffe0d0);
    }
    if (ev.monolith) this.layers.sites.monolithFell(now);
  }

  /**
   * Combat impact, render-only: hit flashes, knockback, per-soldier hitstop, a rare global
   * micro-pause and camera shake on the biggest blows. Nothing here touches the sim.
   */
  private impacts(ev: TickEvents, world: World, now: number, bounds: { contains(x: number, y: number): boolean }): void {
    // Several steps in one frame means catch-up, fast-forward or a seek: no pauses, no shake.
    const live = this.stepsThisFrame <= 1;
    const reduced = !!this.opts.reducedMotion;
    const byId = this.byId;
    if (ev.hits.length || ev.blasts.length) {
      byId.clear();
      for (const u of world.units) byId.set(u.id, u);
    }
    let big = 0;
    let bigX = 0;
    let bigY = 0;
    const blow = this.blow;
    for (const h of ev.hits) {
      if (h.structure >= 0) {
        const st = world.structures[h.structure];
        if (!st) continue;
        this.layers?.sites.structureHit(st.site);
        const site = world.map.sites[st.site];
        // A capital or the Monolith taking a real blow is a big moment.
        if (site && (site.kind === 'capital' || site.kind === 'heart') && h.damage >= 30 && bounds.contains(site.x, site.y) && h.damage > big) {
          big = h.damage;
          bigX = site.x;
          bigY = site.y;
        }
        continue;
      }
      const v = byId.get(h.unit);
      const vp = this.units.pose(h.unit);
      if (!v || !vp || !bounds.contains(vp.x, vp.y)) continue;
      const from = this.swungPrev.get(h.unit) ?? this.swungNow.get(h.unit) ?? 0;
      const a = from > 0 ? byId.get(from) : v.target > 0 ? byId.get(v.target) : undefined;
      const ap = a ? this.units.pose(a.id) : undefined;
      const akind = a?.kind ?? -1;
      const power = HEFT[akind] ?? 1;
      const share = h.damage / Math.max(1, v.maxHp);
      const charge = akind === Kind.Knight && h.damage > STATS[Kind.Knight]!.damage * 1.3;
      blow.dx = ap ? vp.x - ap.x : 0;
      blow.dy = ap ? vp.y - ap.y : 0;
      blow.share = share;
      blow.power = charge ? 2.2 : power;
      blow.heavy = charge || power >= 1.6 || h.damage > 18;
      this.units.impact(h.unit, blow);
      if (from > 0) {
        // Hitstop: attacker and victim hold for a beat, scaled by the blow.
        const hold = hitstopMs(share, blow.heavy);
        this.units.freeze(h.unit, hold);
        this.units.freeze(from, hold);
      }
      const weight = charge ? 60 : akind === Kind.Champion || akind === Kind.Troll ? h.damage * 0.8 : 0;
      if (weight > big) {
        big = weight;
        bigX = vp.x;
        bigY = vp.y;
      }
    }
    // Bursts throw everyone near them outward.
    for (const b of ev.blasts) {
      if (!bounds.contains(b.x, b.y)) continue;
      const r = b.radius + 6;
      let n = 0;
      for (const u of world.units) {
        const p = this.units.pose(u.id);
        if (!p) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        if (++n > 40) break;
        blow.dx = dx;
        blow.dy = dy;
        blow.share = 0.25 * (1 - Math.sqrt(d2) / r) + 0.08;
        blow.power = 2.2;
        blow.heavy = true;
        this.units.impact(u.id, blow);
      }
      if (b.kind === BlastKind.Fireball || b.kind === BlastKind.Boulder) {
        const w = b.kind === BlastKind.Boulder ? 70 : 55;
        if (w > big) {
          big = w;
          bigX = b.x;
          bigY = b.y;
        }
      }
    }
    for (const d of ev.deaths) {
      if (d.kind !== Kind.Champion && d.kind !== Kind.Dragon) continue;
      const p = this.units.pose(d.unit);
      const x = p?.x ?? d.x;
      const y = p?.y ?? d.y;
      if (!bounds.contains(x, y)) continue;
      big = 100;
      bigX = x;
      bigY = y;
    }
    if (big <= 0 || !live || reduced) return;
    // The camera kicks on the biggest blows, less when far out or when the blow is off-centre.
    const s = this.camera.toScreen(bigX, bigY);
    const half = Math.hypot(this.camera.width, this.camera.height) / 2;
    const off = Math.hypot(s.x - this.camera.width / 2, s.y - this.camera.height / 2) / half;
    const zoomK = Math.max(0.35, Math.min(1, this.camera.zoom / 1.2));
    this.shake = Math.max(this.shake, Math.min(1, big / 100) * 0.9 * zoomK / (1 + off * 2));
    // A micro-pause only for the rarest blows, at most one every 1.5s.
    if (big >= 55 && now - this.pausedAt > PAUSE_GAP_MS) {
      this.pausedAt = now;
      this.pauseUntil = now + 60 + Math.min(1, big / 100) * 60;
    }
  }

  private onEmote(e: FloatingEmote): void {
    const world = this.store.world;
    if (!world) return;
    const player = e.p !== null ? world.players[e.p] : undefined;
    const site = player ? world.map.sites[player.slot]! : world.map.sites.find((s) => s.kind === 'heart')!;
    this.fx.floatText(e.emote, site.x + (Math.random() - 0.5) * 50, site.y - site.radius * 2.6, 3.5, 30);
  }

  // ------------------------------------------------------------ selection

  private drawSelection(world: World, centroids: Map<number, { x: number; y: number; n: number }>, now: number, zoom: number): void {
    const g = this.selection;
    g.clear();
    const sel = this.store.selection;
    if (sel?.kind === 'player') {
      const p = world.players[sel.p];
      if (!p) return;
      for (const pl of world.platoons) {
        if (pl.p !== sel.p || pl.state === PlatoonState.Queued) continue;
        const c = centroids.get(pl.id);
        if (c) {
          g.circle(c.x, c.y, 26).stroke({ width: 4 / zoom, color: 0x22180f, alpha: 0.5 });
          g.circle(c.x, c.y, 26).stroke({ width: 2 / zoom, color: 0xf6dc8c, alpha: 0.9 });
        }
      }
      return;
    }
    if (sel?.kind !== 'platoon') return;
    const pl = world.platoons.find((x) => x.id === sel.id);
    const c = centroids.get(sel.id);
    if (!pl || !c) return;
    let r = 12;
    for (const u of world.units) {
      if (u.platoon !== pl.id) continue;
      r = Math.max(r, Math.hypot(u.x - c.x, u.y - c.y));
    }
    r = Math.min(r + 10, 160);
    const pulse = 1 + Math.sin(now / 220) * 0.05;
    const tint = this.tints[pl.p] ?? 0xffffff;
    g.ellipse(c.x, c.y, r * pulse, r * 0.7 * pulse).fill({ color: tint, alpha: 0.14 }).stroke({ width: 5 / zoom, color: 0x22180f, alpha: 0.55 });
    g.ellipse(c.x, c.y, r * pulse, r * 0.7 * pulse).stroke({ width: 2.5 / zoom, color: 0xf6dc8c, alpha: 0.95 });
    if (pl.site < 0 || pl.state === PlatoonState.Engage) return;
    const goal = pl.state === PlatoonState.Rout ? world.players[pl.p]!.slot : pl.site;
    const field = derived(world.map).flow[goal];
    if (!field) return;
    let cell = cellAt(world.map, pl.x, pl.y);
    const pts: [number, number][] = [[pl.x, pl.y]];
    for (let i = 0; i < 400 && cell >= 0; i++) {
      const next = field.next[cell]!;
      if (next < 0) break;
      cell = next;
      if (i % 2 === 0) pts.push([cellCenterX(world.map, cell), cellCenterY(world.map, cell)]);
    }
    const target = world.map.sites[goal]!;
    pts.push([target.x, target.y]);
    // The route is inked on the chart like a cartographer's dotted march line.
    const dash = 10 / zoom;
    const offset = ((now / 40) % 20) / zoom;
    let carry = -offset;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      let t = carry;
      while (t < len) {
        const a = Math.max(0, t);
        const b = Math.min(len, t + dash);
        if (b > a) g.moveTo(x0 + ((x1 - x0) * a) / len, y0 + ((y1 - y0) * a) / len).lineTo(x0 + ((x1 - x0) * b) / len, y0 + ((y1 - y0) * b) / len);
        t += dash * 2;
      }
      carry = t - len - dash * 2;
    }
    g.stroke({ width: 3.4 / zoom, color: 0x22180f, alpha: 0.85 });
    g.ellipse(target.x, target.y, target.radius * 1.1, target.radius * 0.7).stroke({ width: 2.5 / zoom, color: tint, alpha: 0.9 });
  }

  // ---------------------------------------------------------------- input

  private click(sx: number, sy: number): void {
    const world = this.store.world;
    if (!world || !this.layers) return;
    const p = this.camera.toWorld(sx, sy);
    for (const h of this.banners.hits) {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      if (dx * dx + dy * dy <= h.r * h.r) {
        this.store.select({ kind: 'platoon', id: h.platoon });
        return;
      }
    }
    let best = -1;
    let bestD = Math.max(9, 14 / this.camera.zoom) ** 2;
    for (const u of world.units) {
      const pose = this.units.pose(u.id);
      const ux = pose?.x ?? u.x;
      const uy = (pose?.y ?? u.y) - 6;
      const d = (ux - p.x) ** 2 + (uy - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u.platoon;
      }
    }
    if (best >= 0) {
      this.store.select({ kind: 'platoon', id: best });
      return;
    }
    const site = this.layers.sites.hit(p.x, p.y);
    this.store.select(site === null ? null : { kind: 'site', id: site });
  }
}

function monumentKey(list: readonly Monument[] | undefined): string {
  return list?.map((m) => `${m.kind}:${m.p}:${m.name}`).join('|') ?? '';
}
