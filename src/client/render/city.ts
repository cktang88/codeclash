// The commandery as a living isometric pixel diorama. Buildings are painted pixel by pixel at
// each level (empty lot, timber, stone, fortified, grand) into small canvases, repainted only when
// a level changes; every frame then draws the ground, sorts the buildings among the people and
// beasts by depth, adds smoke, crows and banners, and lights it for the hour: lit windows,
// torches and the forge at night. A camera zooms by whole pixels and pans over the world.
//
// Two art modes (settings.ts): 'classic' is the original 512×288 commandery, Templar shapes for
// every faction. 'hd' paints at twice the pixel density into a 1280×720 buffer (2× on a 1440p
// screen, whole-number zoom steps), with each faction's own town: the Templar commandery, the
// Samurai castle town (city/samurai.ts) and the Undead necropolis (city/undead.ts).

import type { BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { artMode, type ArtMode } from '../settings.ts';
import { cityAtlas } from './city/atlas.ts';
import { buildAtlas as buildHdAtlas } from './sprites128.ts';
import { CityBuild, sceneKey, type Built, type Levels, type Progress, type PropsBuilt, type Torch } from './city/build.ts';
import { RemoteBuild } from './city/build-remote.ts';
import { WALL, type Art, type Banner } from './city/buildings.ts';
import type { Ground } from './city/ground.ts';
import { Draw, Life, type Ent, type Mood } from './city/life.ts';
import { Folk } from './city/people.ts';
import { FolkHd } from './city/people-hd.ts';
import { CLASSIC, css, HD, WORLD_H, WORLD_W, type Frame } from './city/pixels.ts';
import { FIRE_POOL, lightPools, poolSources, type PoolSource } from './city/pools.ts';
import { styleFor, type CityStyle } from './city/style.ts';
import { Post } from './post.ts';

export const CITY_W = WORLD_W;
export const CITY_H = WORLD_H;

/** What the city shows beyond its building levels. Everything is optional. */
export interface CityMood {
  /** No push yet today. */
  idle?: boolean;
  streak?: number;
  wins?: number;
  /** Today's army per unit class. */
  army?: number[];
  /** 0..1 toward the next level, per building (scaffolding before a new tier). */
  progress?: Partial<Record<BuildingKey, number>>;
  /** The army is marching out to battle. */
  marching?: boolean;
  /** Hour of day 0..24 to show; default the viewer's local time. */
  hour?: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export type { PoolSource };

/** Main-thread budget per frame for a build job (ms), when there is no worker to build in. */
const BUILD_BUDGET = 6;

export class CityScene {
  readonly buffer: HTMLCanvasElement;
  readonly mode: ArtMode;
  readonly frame: Frame;
  private readonly g: CanvasRenderingContext2D;
  private readonly post = new Post();
  private readonly st: CityStyle;
  private readonly draw2: Draw;
  private readonly life: Life;
  private ground: Ground | null = null;
  /** Builds the city for a set of levels (city/build.ts), with the caches of what it painted. */
  private readonly builder: CityBuild;
  /** HD: builds in the worker (city/build-remote.ts); null when there is none. */
  private readonly remote: RemoteBuild | null;
  /** What is shown, and the levels the build for `key` is wanted at (until it is in). */
  private built: Built | null = null;
  private want: { levels: Levels; progress: Progress | undefined } | null = null;
  /** A build being run a slice per frame on the main thread (no worker, or the worker failed). */
  private job: { key: string; gen: Generator<void, Built> } | null = null;
  private populated = '';
  private arts: Art[] = [];
  private banners: Banner[] = [];
  private torches: Torch[] = [];
  private forges: [number, number][] = [];
  private glows: [number, number, number][] = [];
  private mill: { art: Art; hub: [number, number] | null } | null = null;
  /** HD props (city/props.ts): placed and painted once per change of what stands on the ground. */
  private props: PropsBuilt | null = null;
  /** Lantern glass on the props, in world pixels. */
  private lamps: [number, number][] = [];
  /** HD: the night's light pools, painted once per rebuild (see lightPools). */
  private pools: HTMLCanvasElement | null = null;
  private key = '';
  private t = 0;
  /** Stepped halos (rings of flat colour in the light's ramp), by name: see HALOS. */
  private halos: Record<string, Ring[]>;
  private haloCache = new Map<string, HTMLCanvasElement>();
  /** The necropolis's light: green and violet pools, and mist by day and by night. */
  private necropolis = false;
  private ents: Ent[] = [];
  private nightNow = 0;
  /**
   * Milliseconds the last draw took (for the preview's meter); the main-thread build work of the
   * last frame that had any (a synchronous build, a slice of a job, a swap); the time from a
   * level change to its build being shown.
   */
  lastCost = 0;
  lastRebuild = 0;
  lastSettle = 0;
  private asked = 0;

  // Camera: zoom of the world buffer, centred on (cx, cy) in buffer pixels.
  zoom = 1;
  cx: number;
  cy: number;
  private outW = 1;
  private outH = 1;

  constructor(
    readonly faction: FactionId,
    readonly hue: number,
    readonly seed: number,
    mode: ArtMode = artMode(),
  ) {
    this.mode = mode;
    const hd = mode === 'hd';
    this.frame = hd ? HD : CLASSIC;
    this.cx = this.frame.w / 2;
    this.cy = this.frame.h / 2;
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.frame.w;
    this.buffer.height = this.frame.h;
    this.g = this.buffer.getContext('2d')!;
    this.st = styleFor(faction, hue, hd);
    const atlas = hd ? buildHdAtlas(faction, hue) : cityAtlas(faction, hue);
    // HD: ask for every kind's sheet at the city's density now, so the soldiers are crisp by the
    // time the drill starts (the workers paint them in the background).
    if (hd && atlas.sheet) for (let kind = 0; kind < 10; kind++) atlas.sheet(kind, this.frame.k);
    this.draw2 = new Draw(atlas, hd ? new FolkHd(this.st) : new Folk(this.st), this.st, this.frame);
    this.life = new Life(seed, hd ? this.st : null);
    const fire = ramp3([255, 112, 40], [255, 146, 58], [255, 186, 96], 0.55);
    const glow = hd ? ramp3(...lightRamp(this.st.glow)) : fire;
    this.halos = {
      fire,
      glow,
      violet: ramp3([150, 80, 255], [180, 110, 255], [214, 168, 255], 0.65),
      mistDay: [[1, 196, 192, 224, 0.1], [0.6, 200, 196, 228, 0.18]],
      mistNight: [[1, 60, 160, 110, 0.08], [0.6, 80, 190, 130, 0.15]],
      cloud: [[1, 10, 14, 20, 0.07], [0.6, 10, 14, 20, 0.13]],
    };
    this.necropolis = hd && faction === 'undead';
    this.builder = new CityBuild(this.st, this.frame, seed, hd);
    this.remote = hd ? RemoteBuild.create(faction, hue, seed) : null;
  }

  /** A level change is still being built (the old city is shown meanwhile). */
  get busy(): boolean {
    return this.built?.key !== this.key;
  }

  // ---------------------------------------------------------------- camera

  /** Buffer pixels to output pixels right now. */
  scale(): number {
    const W = this.frame.w;
    const H = this.frame.h;
    // Whole numbers only, in both arts (1440p shows the HD 1280×720 buffer at exactly 2×): the fit
    // rounded, letterboxed when it rounds down and cropped (the camera pans) when it rounds up;
    // never below 1×, so a page narrower than the buffer crops instead of shrinking the art.
    const fit = Math.min(this.outW / W, this.outH / H);
    if (this.mode === 'hd') return Math.max(1, Math.round(fit)) * this.zoom;
    return Math.max(this.zoom, Math.round(fit * this.zoom));
  }

  private clamp(): void {
    const W = this.frame.w;
    const H = this.frame.h;
    const s = this.scale();
    const vw = this.outW / s;
    const vh = this.outH / s;
    this.cx = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, this.cx));
    this.cy = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, this.cy));
  }

  /** Zoom by whole steps, keeping the world point under (px, py) (output pixels) in place. */
  zoomAt(steps: number, px = this.outW / 2, py = this.outH / 2): void {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(this.zoom + steps)));
    if (z === this.zoom) return;
    const s0 = this.scale();
    const wx = this.cx + (px - this.outW / 2) / s0;
    const wy = this.cy + (py - this.outH / 2) / s0;
    this.zoom = z;
    const s1 = this.scale();
    this.cx = wx - (px - this.outW / 2) / s1;
    this.cy = wy - (py - this.outH / 2) / s1;
    this.clamp();
  }

  /** Pan by output pixels (a drag). */
  panBy(dx: number, dy: number): void {
    const s = this.scale();
    this.cx -= dx / s;
    this.cy -= dy / s;
    this.clamp();
  }

  /** Centre the camera on a point in world pixels (the classic 512×288 coordinates). */
  lookAt(x: number, y: number): void {
    const f = this.frame;
    this.cx = (x + f.mx) * f.k;
    this.cy = (y + f.my) * f.k;
    this.clamp();
  }

  resetView(): void {
    this.zoom = 1;
    this.cx = this.frame.w / 2;
    this.cy = this.frame.h / 2;
  }

  // ---------------------------------------------------------------- building

  /**
   * A new set of levels: the first build (and every classic one) is made at once; later HD ones in
   * the worker, or a slice per frame here, while the old city stays on screen.
   */
  private schedule(levels: Levels, progress: Progress | undefined): void {
    this.want = { levels: { ...levels }, progress: progress ? { ...progress } : undefined };
    this.asked = performance.now();
    this.job = null;
    if (!this.built || this.mode !== 'hd') {
      const first = !this.built;
      this.adopt(this.builder.run(levels, progress, false));
      // The worker builds the same city too: its caches warm for the next level change, and the
      // night's pools come with it.
      if (first) this.remote?.request(this.key, levels, progress);
      return;
    }
    if (this.remote && !this.remote.failed) this.remote.request(this.key, levels, progress);
    else this.job = { key: this.key, gen: this.builder.steps(levels, progress, true) };
  }

  /** Take in a finished build from the worker, or run the main-thread job for a few ms. */
  private pump(): void {
    if (this.remote) {
      const b = this.remote.take(this.key);
      if (b) {
        this.adopt(b);
        return;
      }
      if (this.remote.failed && !this.job && this.want && this.built?.key !== this.key)
        this.job = { key: this.key, gen: this.builder.steps(this.want.levels, this.want.progress, true) };
    }
    const job = this.job;
    if (!job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < BUILD_BUDGET) {
      const r = job.gen.next();
      if (r.done) {
        this.job = null;
        this.adopt(r.value);
        return;
      }
    }
  }

  /** Show a finished build: everything at once. */
  private adopt(b: Built): void {
    this.built = b;
    this.ground = b.ground;
    this.arts = b.arts;
    this.banners = b.banners;
    this.torches = b.torches;
    this.forges = b.forges;
    this.glows = b.glows;
    this.lamps = b.lamps;
    this.mill = b.mill;
    this.props = b.props;
    this.pools = b.pools;
    this.life.wallFront = b.wall.front;
    this.life.wallBack = b.wall.back;
    this.life.anchors = b.anchors;
    // New people only when the levels changed (not for scaffolding, or the worker's copy of the same city).
    const lk = JSON.stringify(b.levels);
    if (lk !== this.populated) {
      this.populated = lk;
      this.life.populate(b.levels, this.st);
    }
    this.lastSettle = performance.now() - this.asked;
  }

  // ---------------------------------------------------------------- drawing

  draw(out: HTMLCanvasElement, levels: Record<BuildingKey, number>, recruits: number, dt: number, mood: CityMood = {}): void {
    const t0 = performance.now();
    this.outW = out.width;
    this.outH = out.height;
    this.clamp();
    const hd = this.mode === 'hd';
    const f = this.frame;
    // Rebuild only when a level changes or scaffolding goes up (not on every bit of progress).
    const key = sceneKey(levels, mood.progress);
    const r0 = performance.now();
    const had = this.built;
    if (key !== this.key) {
      this.key = key;
      this.schedule(levels, mood.progress);
    } else this.pump();
    if (this.job || this.built !== had) this.lastRebuild = performance.now() - r0;
    dt = Math.max(0, Math.min(0.25, dt));
    this.t += dt;
    const t = this.t;
    const hour = mood.hour ?? localHour();
    const night = nightOf(hour);
    this.nightNow = night;
    const m: Mood = {
      idle: !!mood.idle,
      streak: mood.streak ?? 0,
      wins: mood.wins ?? 0,
      army: mood.army ?? null,
      recruits,
      marching: !!mood.marching,
      night,
    };
    this.life.mood = m;
    if (!m.idle) this.life.drillT += dt;
    this.life.update(dt, t, levels);

    const g = this.g;
    const r = this.draw2;
    r.g = g;
    r.t = t;
    // The part of the buffer the camera shows (HD paints and grades only that).
    const view = this.view(out);
    // World pixels (what life, banners and anchors use) to buffer pixels.
    const world = () => g.setTransform(f.k, 0, 0, f.k, f.mx * f.k, f.my * f.k);
    const flat = () => g.setTransform(1, 0, 0, 1, 0, 0);
    flat();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const ground = this.ground!;
    const ci = Math.floor(t * (m.idle ? 1.5 : 2.5)) % ground.crops.length;
    if (hd) {
      // HD: the ground and each crop frame composed once, so a frame lays one image, not two.
      const gc = this.groundFrame(ground, ci);
      g.drawImage(gc, view.rx, view.ry, view.rw, view.rh, view.rx, view.ry, view.rw, view.rh);
    } else {
      g.drawImage(ground.base, 0, 0);
      g.drawImage(ground.crops[ci]!, ground.cropX ?? 0, ground.cropY ?? 0);
    }
    // The night rig, part 1: the ground falls into the dark further than the buildings (whose own
    // night palette is laid on in the sorted pass), so lit walls and moonlit edges stand off it.
    const night0 = nightOf(mood.hour ?? localHour());
    if (night0 > 0.01) {
      const [gr, gg, gb] = this.necropolis ? [0.72, 0.72, 0.82] : [0.6, 0.64, 0.8];
      const k = night0;
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${Math.round(255 * (1 - (1 - gr) * k))},${Math.round(255 * (1 - (1 - gg) * k))},${Math.round(255 * (1 - (1 - gb) * k))})`;
      g.fillRect(view.rx, view.ry, view.rw, view.rh);
      g.globalCompositeOperation = 'source-over';
    }

    // The sorted pass: buildings, walls, trees, people, beasts.
    const ents = this.ents;
    ents.length = 0;
    for (const a of this.arts) ents.push(a as unknown as Ent);
    this.life.collect(ents, r);
    // HD props' little life (props.ts PropDef.anim / flicker), sorted just in front of their art,
    // only when the camera is in close and the prop is in view.
    if (hd && this.zoom >= 2 && this.props)
      for (const an of this.props.painted.anims) {
        const [x0, y0, x1, y1] = an.box;
        if (x1 < view.rx || y1 < view.ry || x0 > view.rx + view.rw || y0 > view.ry + view.rh) continue;
        ents.push({
          d: an.d,
          draw: () => {
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            an.fn(g, t, an.x, an.y, an.seed, f.k, this.st);
            g.restore();
          },
        });
      }
    ents.sort((a, b) => a.d - b.d || 0);
    let inWorld = false;
    for (const e of ents) {
      if ('canvas' in e) {
        const a = e as unknown as Art;
        if (!a.canvas) continue;
        // HD: skip art wholly outside the view (it matters when zoomed in).
        if (hd && (a.x > view.rx + view.rw || a.y > view.ry + view.rh || a.x + a.canvas.width < view.rx || a.y + a.canvas.height < view.ry)) continue;
        if (inWorld) {
          flat();
          inWorld = false;
        }
        g.drawImage(a.canvas, a.x, a.y);
        if (a.night && night0 > 0.01) {
          g.globalAlpha = Math.min(1, night0);
          g.drawImage(a.night, a.x, a.y);
          g.globalAlpha = 1;
        }
      } else {
        if (!inWorld) {
          world();
          inWorld = true;
        }
        e.draw(r);
      }
    }
    world();

    // Windmill sails.
    if (this.mill?.hub) this.drawSails(r, this.mill.hub, t * (m.idle ? 0.6 : 1.3));
    // Banners in the wind; more of them on a good streak.
    for (let i = 0; i < this.banners.length; i++) {
      if (hd) this.drawBannerHd(r, this.banners[i]!, t, i, m.streak >= 3);
      else this.drawBanner(r, this.banners[i]!, t, i, m.streak >= 3);
    }
    this.life.overlay(r);
    // Cloud shadows drifting over by day.
    if (night < 0.8) {
      flat();
      g.globalAlpha = 1 - night;
      for (let i = 0; i < 2; i++) {
        const x = ((t * 3 + i * 300 + this.seed % 200) % (WORLD_W + 300)) - 150;
        const y = 40 + i * 120 + Math.sin(t * 0.05 + i) * 10;
        this.halo(g, 'cloud', x, y, 140, 70);
      }
      g.globalAlpha = 1;
      world();
    }

    // Light for the hour.
    flat();
    if (hd) this.gradeHd(g, night, view);
    if (this.necropolis) this.lightNecropolis(g, night, t, world, flat);
    else this.light(g, hour, night, t, world, flat);
    // Torch and forge flames: emissive, so laid on after the grade.
    world();
    const q = 1 / f.k;
    for (const [x, y] of this.forges) {
      const fl = 0.6 + 0.4 * Math.sin(t * 13 + x);
      g.fillStyle = fl > 0.7 ? '#ffd27a' : '#e07a2a';
      g.fillRect(x - 1, y - 1, 2, 2);
      g.fillStyle = '#b8401c';
      g.fillRect(x + 1, y, 1, 1);
    }
    const witch = hd && this.st.id === 'undead';
    if (night > 0.3 || witch)
      for (const tc of this.torches) {
        const fl = Math.sin(t * 17 + tc.x * 3) > 0 ? 1 : 0;
        if (hd) {
          // A brazier pole one art pixel wide, a three-step flame (witchfire in the necropolis,
          // which burns by day too).
          g.fillStyle = '#2a1e16';
          g.fillRect(tc.x, tc.y, q, 3);
          g.fillStyle = witch ? '#4fd64a' : '#ff8a2a';
          g.fillRect(tc.x - q, tc.y - 1 - fl * q, 3 * q, 2 * q);
          g.fillStyle = witch ? '#e4ffc8' : '#ffd27a';
          g.fillRect(tc.x, tc.y - 1 - q - fl * q, q, 2 * q);
          continue;
        }
        g.fillStyle = '#3a2a1a';
        g.fillRect(tc.x, tc.y, 1, 3);
        g.fillStyle = '#ffd27a';
        g.fillRect(tc.x, tc.y - 1 - fl, 1, 1);
        g.fillStyle = '#ff8a2a';
        g.fillRect(tc.x - fl, tc.y - 1, 1, 1);
      }
    flat();

    // To the screen through the camera. The finish (grade, vignette, grain) is laid on the
    // visible part of the world buffer, so it costs the same at any screen size.
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const { s, sx0, sy0, ax, ay, bx, by, rx, ry, rw, rh } = view;
    if (!hd) this.post.apply(g, rx, ry, rw, rh, 1, false);
    const dx = Math.round((ax - sx0) * s);
    const dy = Math.round((ay - sy0) * s);
    const dw = Math.round((bx - ax) * s);
    const dh = Math.round((by - ay) * s);
    if (dx > 0 || dy > 0 || dw < out.width || dh < out.height) {
      ctx.fillStyle = '#0b0907';
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(this.buffer, ax, ay, bx - ax, by - ay, dx, dy, dw, dh);
    this.lastCost = performance.now() - t0;
  }

  /** HD: the ground with crop frame `i` laid on it, composed once per ground. */
  private groundFrame(ground: Ground, i: number): HTMLCanvasElement {
    if (this.groundFrames?.ground !== ground) this.groundFrames = { ground, frames: [] };
    let c = this.groundFrames.frames[i];
    if (!c) {
      c = document.createElement('canvas');
      c.width = ground.base.width;
      c.height = ground.base.height;
      const x = c.getContext('2d')!;
      x.drawImage(ground.base, 0, 0);
      x.drawImage(ground.crops[i]!, ground.cropX ?? 0, ground.cropY ?? 0);
      this.groundFrames.frames[i] = c;
    }
    return c;
  }
  private groundFrames: { ground: Ground; frames: HTMLCanvasElement[] } | null = null;

  /** The camera's view of the buffer: scale, origin and the visible rectangle. */
  private view(out: HTMLCanvasElement) {
    const W = this.frame.w;
    const H = this.frame.h;
    const hd = this.mode === 'hd';
    const s = this.scale();
    const vw = out.width / s;
    const vh = out.height / s;
    // HD snaps the camera to whole art pixels (no sub-pixel crawl); classic to screen pixels.
    let sx0 = hd ? Math.round(this.cx - vw / 2) : Math.round((this.cx - vw / 2) * s) / s;
    let sy0 = hd ? Math.round(this.cy - vh / 2) : Math.round((this.cy - vh / 2) * s) / s;
    if (vw >= W) sx0 = -(vw - W) / 2;
    if (vh >= H) sy0 = -(vh - H) / 2;
    const ax = Math.max(0, sx0);
    const ay = Math.max(0, sy0);
    const bx = Math.min(W, sx0 + vw);
    const by = Math.min(H, sy0 + vh);
    const rx = Math.floor(ax);
    const ry = Math.floor(ay);
    return { s, sx0, sy0, ax, ay, bx, by, rx, ry, rw: Math.ceil(bx) - rx, rh: Math.ceil(by) - ry };
  }

  /**
   * HD grade in one pass: the night (or the necropolis's violet-to-teal sky), a cool teal shadow
   * grade, a touch of warmth and the vignette, baked into one canvas per step of the night and laid
   * with a single multiply over the visible part, before the lights. (Classic keeps its Post.)
   */
  private gradeHd(g: CanvasRenderingContext2D, night: number, view: { rx: number; ry: number; rw: number; rh: number }): void {
    const step = Math.round(night * 24);
    const key = `${step}`;
    if (this.grade?.key !== key) {
      const W = this.frame.w;
      const H = this.frame.h;
      const c = this.grade?.canvas ?? document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d')!;
      const k = step / 24;
      // Night darkens less than it used to: the arts' night palette and the ground's own dimming
      // (draw()) carry the dark, so the value steps between roof, wall and ground survive.
      if (this.necropolis) {
        // A lighter day floor (a pale sun through the overcast) so buildings separate from the ground;
        // the night end is unchanged.
        const top = [205 - 105 * k, 198 - 104 * k, 232 - 57 * k];
        const bot = [188 - 102 * k, 206 - 98 * k, 212 - 70 * k];
        const sky = x.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, `rgb(${top.map(Math.round).join(',')})`);
        sky.addColorStop(1, `rgb(${bot.map(Math.round).join(',')})`);
        x.fillStyle = sky;
      } else {
        // Night a cool blue; by day a faint warmth (what the classic amber lift does), and for
        // the commandery a golden-hour sun (town-displate): the warm lift is in its palette and
        // here, the cool is in its shade steps and cast shadows.
        const gold = this.st.id === 'templar';
        const r = 255 - 150 * k;
        const gg = (gold ? 240 : 252) - (gold ? 114 : 126) * k;
        const b = (gold ? 210 : 240) - (gold ? 16 : 46) * k;
        x.fillStyle = `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`;
      }
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = 'rgba(150,170,175,0.18)';
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
      const grd = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.7, 'rgba(6,4,2,0.3)');
      grd.addColorStop(1, 'rgba(4,2,1,0.7)');
      x.fillStyle = grd;
      x.fillRect(0, 0, W, H);
      this.grade = { key, canvas: c };
    }
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.grade.canvas, view.rx, view.ry, view.rw, view.rh, view.rx, view.ry, view.rw, view.rh);
    g.globalCompositeOperation = 'source-over';
  }
  private grade: { key: string; canvas: HTMLCanvasElement } | null = null;

  /**
   * The necropolis's light (HD), after the games that do undead best (HoMM III's Necropolis,
   * Naxxramas, Darkest Dungeon): a dark blue-violet base under a violet-to-teal sky; ground mist
   * that drifts by day and catches the grave-light by night; and saturated emissive sources (green
   * witchfire, windows, the cauldron, grave lanterns, wisps; violet at the spires and the tomb)
   * whose light pools actually light the stone and the ground around them. Gloomy but readable by
   * day; spectacular by night.
   */
  private lightNecropolis(g: CanvasRenderingContext2D, night: number, t: number, world: () => void, flat: () => void): void {
    const k = night;
    void world;
    // (The sky's violet-to-teal light is in the one-pass grade, gradeHd.)
    // Mist banks drifting over the grave fields and the yard: two flat bands each, not a blur.
    flat();
    const banks: [number, number, number][] = [[60, 60, 0], [430, 70, 1], [80, 220, 2], [420, 230, 3], [250, 150, 4], [250, 20, 5]];
    for (const [bx, by, i] of banks) {
      // The banks drift a whole world pixel at a time.
      const x = Math.round(bx + Math.sin(t * 0.04 + i * 1.7) * 30);
      const y = Math.round(by + Math.sin(t * 0.03 + i) * 6);
      // By day the mist lies thin, and only over the grave fields: not the yard or the keep.
      if (k < 0.9 && i < 4) {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.35 * (1 - k);
        this.halo(g, 'mistDay', x, y, 180, 52);
      }
      if (k > 0.1) {
        // A faint green breath of mist at night, not a lit disc over the graves.
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.3 * k;
        this.halo(g, 'mistNight', x, y, 180, 52);
      }
    }
    // Lit windows: faint by day, burning by night.
    g.globalCompositeOperation = 'source-over';
    const wa = 0.45 + 0.55 * Math.min(1, k * 1.5);
    for (const art of this.arts) {
      if (!art.lights) continue;
      g.globalAlpha = wa * (0.85 + 0.15 * Math.sin(t * 3 + art.x));
      g.drawImage(art.lights, art.x, art.y);
    }
    // No discs: the necropolis bakes its own light pools into its arts' lights canvases
    // (Art.pooled); the scene adds only a 1-2 px bloom at each source, green for the grave-light,
    // violet for the arcane, fire for the forges. (lightPools can pool more sources if wanted.)
    g.globalCompositeOperation = 'lighter';
    const pool = 0.18 + 0.47 * k;
    const ramps = [poolRamp(this.st.glow), VIOLET_POOL, FIRE_POOL];
    const srcs: PoolSource[] = [];
    for (const tc of this.torches) srcs.push({ x: tc.x, y: tc.y, z: 8, r: 22 });
    for (const [x, y] of this.ground?.lamps ?? []) srcs.push({ x, y, z: 7, r: 16 });
    for (const [x, y] of this.lamps) srcs.push({ x, y, z: 7, r: 16 });
    for (const [x, y, c] of this.glows) srcs.push({ x, y, z: 6, r: 22, tint: c ? 1 : 0 });
    for (const [x, y] of this.forges) srcs.push({ x, y, z: 2, r: 18, tint: 2 });
    this.bloom(g, srcs, ramps, Math.min(1, 0.35 + pool));
    this.life.nightGlow(g, (x, y, w, h) => this.halo(g, 'glow', x, y, w, h), Math.max(0.25, k), this.frame);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    flat();
  }

  /** Night tint, warm dawn and dusk, then lit windows, torches and forges. */
  private light(g: CanvasRenderingContext2D, hour: number, night: number, t: number, world: () => void, flat: () => void): void {
    const W = this.frame.w;
    const H = this.frame.h;
    void world;
    const warm = Math.max(0, 1 - Math.min(Math.abs(hour - 6.5), Math.abs(hour - 19)) / 1.5);
    if (night > 0.01 && this.mode !== 'hd') {
      // Classic night: a moderate cool multiply; the dark itself is in the arts' night palette and
      // the ground's dimming (draw()).
      g.globalCompositeOperation = 'multiply';
      const k = night;
      g.fillStyle = `rgb(${Math.round(255 - 150 * k)},${Math.round(255 - 128 * k)},${Math.round(255 - 56 * k)})`;
      g.fillRect(0, 0, W, H);
    }
    if (warm > 0.01) {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = `rgba(255,150,80,${0.3 * warm})`;
      g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
    flat();
    if (this.mode === 'hd' && this.st.id === 'templar' && night <= 0.15) {
      // By day the lamps and some windows still glow warm inside the shade (town-displate).
      for (const art of this.arts) {
        if (!art.lights) continue;
        g.globalAlpha = 0.3 + 0.06 * Math.sin(t * 3 + art.x);
        g.drawImage(art.lights, art.x, art.y);
      }
      g.globalCompositeOperation = 'lighter';
      this.bloom(g, this.poolSources().filter((p) => p.z > 2 && p.z < 8), [FIRE_POOL], 0.35);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    if (night > 0.15) {
      const a = Math.min(1, (night - 0.15) / 0.5);
      for (const art of this.arts) {
        if (!art.lights) continue;
        g.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 3 + art.x));
        g.drawImage(art.lights, art.x, art.y);
      }
      g.globalCompositeOperation = 'lighter';
      if (this.mode === 'hd') {
        // HD: warm pools on the surfaces each light reaches, not discs in the air. Buildings that bake
        // their own pools (Art.pooled) push no sources here; props lamps and forges always pool.
        const src = this.poolSources();
        // (Made with the build; only the first, synchronous build leaves them to the first night.)
        this.pools ??= this.lightPools(src);
        g.globalAlpha = a * (0.92 + 0.08 * Math.sin(t * 9));
        g.drawImage(this.pools, 0, 0);
        this.bloom(g, src.filter((p) => p.z > 2), [FIRE_POOL], a * 0.6);
      } else
        for (const tc of this.torches) {
          g.globalAlpha = a * (Math.sin(t * 11 + tc.x) > -0.5 ? 1 : 0.8);
          this.halo(g, 'fire', tc.x, tc.y, 32, 32);
        }
      // (Lit windows are emissive pixels with no pool: a pool at a building's centre lands on its
      // roof, which a window cannot light. Graveyard Keeper's night keeps the windows alone.)
      if (this.mode === 'hd') this.life.nightGlow(g, (x, y, w, h) => this.halo(g, 'glow', x, y, w, h), a, this.frame);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'lighter';
    // (HD forges light their pool in lightPools.)
    if (this.mode !== 'hd')
      for (const [x, y] of this.forges) {
        g.globalAlpha = Math.min(1, 0.4 + 0.6 * night);
        this.halo(g, 'fire', x, y, 48, 48);
      }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    flat();
  }

  /** A 1-2 px bloom on each light source: a small cross of its hot colour (call in the flat transform, 'lighter'). */
  private bloom(g: CanvasRenderingContext2D, sources: PoolSource[], ramps: [number, number, number][][], a: number): void {
    const f = this.frame;
    g.globalAlpha = a;
    for (const s of sources) {
      const c = (ramps[s.tint ?? 0] ?? ramps[0]!)[2]!;
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      const x = Math.floor((s.x + f.mx) * f.k);
      const y = Math.floor((s.y + f.my) * f.k);
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
    }
  }

  /** The light sources for the pools: torches, prop lanterns and forges (world pixels, a height, a reach). */
  private poolSources(): PoolSource[] {
    return poolSources(this.torches, this.lamps, this.forges);
  }

  /** The night's light pools for what is shown now (city/pools.ts). */
  lightPools(sources: PoolSource[], ramps: [number, number, number][][] = [FIRE_POOL]): HTMLCanvasElement {
    return lightPools(this.frame, this.arts, this.props?.casts ?? [], sources, ramps);
  }

  /**
   * A stepped halo (pixel-art-techniques §1.6, §5.1): 2-3 rings of flat colour in the light's
   * ramp, rasterised at buffer resolution at a whole size and drawn at a whole buffer pixel, so
   * the bands keep even widths at every zoom. Call in the flat transform; (x, y) is the centre and
   * (w, h) the size in world pixels.
   */
  private halo(g: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number): void {
    const f = this.frame;
    const bw = Math.max(2, Math.round(w * f.k));
    const bh = Math.max(2, Math.round(h * f.k));
    const key = `${name}:${bw}x${bh}`;
    let c = this.haloCache.get(key);
    if (!c) {
      c = stepped(bw, bh, this.halos[name]!, name.startsWith('mist') || name === 'cloud');
      this.haloCache.set(key, c);
    }
    g.drawImage(c, Math.round((x + f.mx) * f.k - bw / 2), Math.round((y + f.my) * f.k - bh / 2));
  }

  private drawSails(r: Draw, hub: [number, number], a: number): void {
    const [x, y] = hub;
    const g = r.g;
    const hd = this.mode === 'hd';
    const q = 1 / this.frame.k;
    const wood = css(this.st.timber[2]);
    // The necropolis's mill turns rags; the others sailcloth.
    const ragged = hd && this.st.id === 'undead';
    const cloth = ragged ? '#8a869a' : '#d8ceb4';
    const clothS = ragged ? '#5c586c' : '#b3a88c';
    // Its laths are long bones.
    const lathC = ragged ? css(this.st.fine[1]) : null;
    const dark = css(this.st.timber[3]);
    for (let k = 0; k < 4; k++) {
      const an = a + (k * Math.PI) / 2;
      // The sails turn in a plane facing down-left: squash x.
      const cx = Math.cos(an) * 0.75;
      const cy = Math.sin(an);
      const L = 19;
      // The sail cloth on one side of the stock, a lattice of laths.
      const px = -Math.sin(an);
      const py = Math.cos(an);
      const step = hd ? 0.25 : 0.5;
      for (let i = 5; i <= L; i += step) {
        for (let w = step; w <= 4; w += step) {
          const sx = x + cx * i + px * w * 0.75;
          const sy = y + cy * i + py * w;
          const lath = hd ? Math.abs((i % 4) - 0) < step * 0.9 || w >= 4 - step * 0.5 : Math.floor(i) % 4 === 0 || w >= 4;
          if (ragged && !lath && (Math.sin(i * 3.1 + k * 2) * 2 + w > 3.2 || (i > 14 && w > 1.6 + Math.sin(i * 5 + k))))
            continue;
          g.fillStyle = lath ? lathC ?? wood : w < 2 ? cloth : clothS;
          if (hd) g.fillRect(Math.floor(sx * 2) / 2, Math.floor(sy * 2) / 2, q, q);
          else g.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
        }
      }
      r.line(x, y, x + cx * (L + 1), y + cy * (L + 1), dark);
    }
    g.fillStyle = '#2c1e13';
    g.fillRect(x - 1, y - 1, 2, 2);
  }

  private drawBanner(r: Draw, b: Banner, t: number, i: number, festive: boolean): void {
    const g = r.g;
    const st = this.st;
    const w = b.w + (festive ? 2 : 0);
    const h = b.h + (festive && !b.pennon ? 1 : 0);
    const field = css(st.bannerField);
    const fieldS = css(mixC(st.bannerField, st.outline, 0.25));
    const charge = css(st.bannerCharge);
    const team = css(st.team);
    const crossX = Math.floor(w * 0.4);
    const crossY = Math.floor(h * 0.45);
    for (let c = 0; c < w; c++) {
      const ph = t * 3.2 + i * 1.7 - c * 0.7;
      const off = Math.round(Math.sin(ph) * Math.min(1.5, c * 0.3));
      const lit = Math.cos(ph) > 0;
      const hh = b.pennon ? Math.max(1, Math.round(h * (1 - c / (w + 1)))) : h;
      for (let y = 0; y < hh; y++) {
        let col = lit ? field : fieldS;
        if (!b.pennon && (c === crossX || y === crossY)) col = charge;
        if (b.pennon && y === Math.floor(hh / 2)) col = charge;
        if (y === hh - 1 && !b.pennon) col = team;
        g.fillStyle = col;
        g.fillRect(b.x + c, b.y + y + off, 1, 1);
      }
    }
    g.fillStyle = css(st.outline);
    g.fillRect(b.x - 1, b.y - 1, 1, h + 1);
  }

  /**
   * HD banners at the art's own density, each faction its own: the Templar Beauséant with its
   * cross; the Samurai nobori, a tall vertical banner on an L-shaped pole with the clan mon; the
   * Undead a tattered black standard with a green sigil.
   */
  private drawBannerHd(r: Draw, b: Banner, t: number, i: number, festive: boolean): void {
    const g = r.g;
    const st = this.st;
    const q = 0.5;
    const id = st.id;
    const outline = css(st.outline);
    const team = css(st.team);
    const field = st.bannerField;
    const lit = css(field);
    const shade = css(mixC(field, st.outline, 0.3));
    const charge = css(st.bannerCharge);
    if (id === 'samurai' && !b.pennon) {
      // Nobori: hangs from the cross-bar, long and narrow, rippling along its height.
      const W = Math.max(6, Math.round(b.w * 1.4)) + (festive ? 2 : 0);
      const Hh = b.h * 4 + (festive ? 4 : 0);
      g.fillStyle = outline;
      g.fillRect(b.x - 1, b.y - 1, W / 2 + 1, q);
      for (let y = 0; y < Hh; y++) {
        const ph = t * 2.6 + i * 1.3 - y * 0.35;
        const off = Math.round(Math.sin(ph) * Math.min(2, y * 0.25)) * q;
        for (let x = 0; x < W; x++) {
          const fx = b.x - 1 + x * q + off;
          const fy = b.y - 1 + q + y * q;
          let c = Math.cos(ph + x * 0.2) > -0.2 ? lit : shade;
          // Chichi loops down the pole side, the mon in the upper third, team hem at the foot.
          if (x === 0) c = outline;
          const mx = x - W / 2;
          const my = y - Hh * 0.28;
          const d = Math.hypot(mx, my);
          if (d < W * 0.34 && d > W * 0.2) c = charge;
          if (d <= W * 0.12) c = charge;
          if (y >= Hh - 3) c = team;
          if (x === W - 1) c = css(mixC(field, st.outline, 0.45));
          g.fillStyle = c;
          g.fillRect(fx, fy, q, q);
        }
      }
      return;
    }
    const w = (b.w + (festive ? 2 : 0)) * 2;
    const h = (b.h + (festive && !b.pennon ? 1 : 0)) * 2;
    const undead = id === 'undead';
    for (let c = 0; c < w; c++) {
      const ph = t * (undead ? 2.2 : 3.2) + i * 1.7 - c * 0.35;
      const off = Math.round(Math.sin(ph) * Math.min(3, c * 0.3)) * q;
      const isLit = Math.cos(ph) > 0;
      let hh = b.pennon ? Math.max(2, Math.round(h * (1 - c / (w + 2)))) : h;
      // Tattered: the fly end eaten into ragged tongues.
      if (undead && !b.pennon && c > w * 0.55) hh = Math.max(2, h - Math.round(((c * 7) % 5) * 1.2) - (c > w * 0.8 ? 3 : 0));
      for (let y = 0; y < hh; y++) {
        let col = isLit ? lit : shade;
        if (!b.pennon) {
          if (id === 'templar' && (Math.floor(c / 2) === Math.floor(w * 0.2) || Math.floor(y / 2) === Math.floor(h * 0.22))) col = charge;
          if (undead) {
            // A ring and a bar: the sigil of the Hollow Host.
            const d = Math.hypot(c - w * 0.42, y - h * 0.45);
            if ((d > h * 0.2 && d < h * 0.3) || (Math.abs(c - w * 0.42) < 1 && y > h * 0.15 && y < h * 0.8)) col = charge;
          }
          if (y >= hh - 2 && !undead) col = team;
        } else if (Math.abs(y - hh / 2) < 1) col = charge;
        if (y === 0 && c > 0) col = isLit ? css(mixC(field, 0xffffffff, 0.12)) : col;
        g.fillStyle = col;
        g.fillRect(b.x + c * q, b.y + y * q + off, q, q);
      }
    }
    g.fillStyle = outline;
    g.fillRect(b.x - q, b.y - q, q, h * q + q);
  }

  /** How dark it is now (0 day, 1 night). */
  get night(): number {
    return this.nightNow;
  }
  /** World size, for callers. */
  static readonly size = { w: WORLD_W, h: WORLD_H, wall: WALL };
}

function mixC(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >>> s) & 255) * (1 - k) + ((b >>> s) & 255) * k);
  return ((255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

/** A halo ring: outer radius (fraction of the halo), colour and alpha. Outer rings come first. */
type Ring = [number, number, number, number, number];

/** Three rings in a light's ramp: a dim outer band, a mid band, a hot core (alpha scaled by `a`). */
function ramp3(outer: number[], mid: number[], core: number[], a: number): Ring[] {
  return [
    [1, outer[0]!, outer[1]!, outer[2]!, a * 0.18],
    [0.64, mid[0]!, mid[1]!, mid[2]!, a * 0.28],
    [0.32, core[0]!, core[1]!, core[2]!, a * 0.42],
  ];
}

/** A light's ramp from its css rgba colour: the colour itself, then two small steps toward white. */
function lightRamp(css: string): [number[], number[], number[], number] {
  const m = css.match(/[0-9.]+/g)!.map(Number);
  const c = [m[0]!, m[1]!, m[2]!];
  const to = (k: number) => c.map((v) => Math.round(v + (255 - v) * k));
  return [c, to(0.12), to(0.28), m[3] ?? 1];
}

/** A fixed hash of a row index, 0..1 (no Math.random: the same streaks on every load). */
function rowHash(n: number): number {
  let h = Math.imul(n + 17, 2654435761) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** An elliptical halo of flat rings, w×h buffer pixels. */
function stepped(w: number, h: number, rings: Ring[], ragged = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      // Ragged (mist, cloud shadow): each pair of rows reaches its own width, so the bank breaks
      // into horizontal streaks like layered fog instead of a disc.
      const reach = ragged ? 0.7 + 0.45 * rowHash(py >> 1) : 1;
      const d = Math.hypot((px + 0.5 - w / 2) / ((w / 2) * reach), (py + 0.5 - h / 2) / (h / 2));
      let ring: Ring | null = null;
      for (const r of rings) if (d <= r[0]) ring = r;
      if (!ring) continue;
      const i = (py * w + px) * 4;
      img.data[i] = ring[1];
      img.data[i + 1] = ring[2];
      img.data[i + 2] = ring[3];
      img.data[i + 3] = Math.round(ring[4] * 255);
    }
  x.putImageData(img, 0, 0);
  return c;
}

/** Pool bands, dim to hot: the necropolis's arcane violet (warm fire is pools.ts FIRE_POOL). */
const VIOLET_POOL: [number, number, number][] = [[30, 14, 52], [54, 28, 92], [86, 54, 140]];
/** Pool bands from a light's css rgba colour (a style's `glow`). */
function poolRamp(css: string): [number, number, number][] {
  const m = css.match(/[0-9.]+/g)!.map(Number);
  return [0.16, 0.3, 0.5].map((k) => [Math.round(m[0]! * k), Math.round(m[1]! * k), Math.round(m[2]! * k)] as [number, number, number]);
}

function localHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** 0 by day, 1 by night, with an hour or two of dawn and dusk. */
export function nightOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7.5 && h <= 18) return 0;
  if (h >= 21 || h <= 5) return 1;
  if (h < 7.5) return 1 - (h - 5) / 2.5;
  return (h - 18) / 3;
}
