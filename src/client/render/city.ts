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

import { BUILDINGS, type BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { artMode, type ArtMode } from '../settings.ts';
import { cityAtlas } from './city/atlas.ts';
import { paintBuilding, paintMill, tierOf, WALL, wallHeights, type Art, type Banner, type BuildingParts } from './city/buildings.ts';
import { paintGround, type Ground } from './city/ground.ts';
import { groundKey, groundSteps } from './city/ground-hd.ts';
import { Draw, Life, type Ent, type Mood } from './city/life.ts';
import { Folk } from './city/people.ts';
import { FolkHd } from './city/people-hd.ts';
import { CLASSIC, css, HD, WORLD_H, WORLD_W, type Frame } from './city/pixels.ts';
import { styleFor, type CityStyle } from './city/style.ts';
import './city/samurai.ts';
import './city/undead.ts';
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

interface Torch {
  x: number;
  y: number;
}

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
  /** HD: a ground being repainted a band at a time, and the key it is for. */
  private groundJob: Generator<void, Ground> | null = null;
  private groundJobKey = '';
  private groundShownKey = '';
  private arts: Art[] = [];
  private banners: Banner[] = [];
  private torches: Torch[] = [];
  private forges: [number, number][] = [];
  private mill: { art: Art; hub: [number, number] | null } | null = null;
  private partCache = new Map<string, BuildingParts>();
  private key = '';
  private t = 0;
  private glow: HTMLCanvasElement;
  private fire: HTMLCanvasElement;
  private cloud: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  private ents: Ent[] = [];
  private nightNow = 0;
  /** Milliseconds the last draw took (for the preview's meter), and the last repaint of the buildings. */
  lastCost = 0;
  lastRebuild = 0;

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
    this.draw2 = new Draw(cityAtlas(faction, hue), hd ? new FolkHd(this.st) : new Folk(this.st), this.st, this.frame);
    this.life = new Life(seed, hd ? this.st : null);
    this.fire = radial(24, 'rgba(255,170,70,0.55)', 'rgba(255,120,40,0)');
    this.glow = hd ? radial(20, this.st.glow, this.st.glow.replace(/[\d.]+\)$/, '0)')) : this.fire;
    this.cloud = radial(70, 'rgba(10,14,20,0.16)', 'rgba(10,14,20,0)');
  }

  // ---------------------------------------------------------------- camera

  /** Buffer pixels to output pixels right now. */
  scale(): number {
    const W = this.frame.w;
    const H = this.frame.h;
    if (this.mode === 'hd') {
      // Whole numbers only: the fit rounded (1440p shows the 1280×720 buffer at exactly 2×).
      const fit = Math.min(this.outW / W, this.outH / H);
      const base = fit >= 1 ? Math.max(1, Math.round(fit)) : fit;
      return base * this.zoom;
    }
    const fit = Math.min(this.outW / W, this.outH / H);
    const s = fit * this.zoom;
    return s >= 1.5 ? Math.round(s) : s;
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

  /** A building's parts, repainted only when its own level (or scaffolding) changes. */
  private parts(k: BuildingKey | 'keep', level: number, progress: number): BuildingParts {
    const rising = progress > 0.45 ? 1 : 0;
    const key = `${k}:${level}:${rising}`;
    let p = this.partCache.get(key);
    if (!p) {
      p = paintBuilding(k, { st: this.st, level, progress, seed: this.seed }, this.frame);
      // Keep one entry per building: drop this building's older levels.
      for (const old of this.partCache.keys()) if (old.startsWith(k + ':')) this.partCache.delete(old);
      this.partCache.set(key, p);
    }
    return p;
  }

  private rebuild(levels: Record<BuildingKey, number>, mood: CityMood): void {
    const st = this.st;
    const maxLevel = Math.max(0, ...BUILDINGS.map((b) => levels[b.key] ?? 0));
    if (this.mode === 'hd') {
      const gk = groundKey(st, levels, maxLevel);
      if (!this.ground) {
        // The first ground is painted at once; later ones a band per frame (see draw()).
        const job = groundSteps(st, levels, maxLevel, this.frame);
        let r = job.next();
        while (!r.done) r = job.next();
        this.ground = r.value;
        this.groundShownKey = gk;
      } else if (gk !== this.groundShownKey && gk !== this.groundJobKey) {
        this.groundJob = groundSteps(st, levels, maxLevel, this.frame);
        this.groundJobKey = gk;
      }
    } else {
      // Classic: the same ground as ever, repainted only when something it shows changes.
      const gk = groundKey(st, levels, maxLevel);
      if (!this.ground || gk !== this.groundShownKey) {
        this.ground = paintGround(st, levels, maxLevel);
        this.groundShownKey = gk;
      }
    }
    const arts: Art[] = [...this.ground!.arts];
    const banners: Banner[] = [];
    const torches: Torch[] = [];
    const smoke: [number, number][] = [];
    const forges: [number, number][] = [];
    const bells: [number, number][] = [];
    const stalls: [number, number][] = [];
    const targets: [number, number][] = [];
    const keys: (BuildingKey | 'keep')[] = ['keep', ...BUILDINGS.map((b) => b.key)];
    for (const k of keys) {
      const level = k === 'keep' ? maxLevel : levels[k] ?? 0;
      const p = this.parts(k, level, k === 'keep' ? 0 : mood.progress?.[k] ?? 0);
      arts.push(...p.arts);
      banners.push(...p.banners);
      torches.push(...p.torches.map(([x, y]) => ({ x, y })));
      smoke.push(...p.smoke);
      forges.push(...p.forges);
      bells.push(...p.bells);
      stalls.push(...p.stalls);
      targets.push(...p.targets);
    }
    const millKey = `mill:${tierOf(levels.granary)}`;
    if (levels.granary > 0) {
      if (!this.mill || this.partCache.get(millKey) === undefined) {
        const m = paintMill(st, levels.granary, this.frame);
        this.mill = m;
        for (const old of this.partCache.keys()) if (old.startsWith('mill:')) this.partCache.delete(old);
        this.partCache.set(millKey, { arts: [m.art], smoke: [], banners: [], torches: [], bells: [], forges: [], stalls: [], targets: [] });
      }
    } else this.mill = null;
    if (this.mill) arts.push(this.mill.art);
    this.arts = arts;
    this.banners = banners;
    this.torches = torches;
    this.forges = forges;
    const wt = tierOf(levels.walls);
    const wh = wallHeights(wt);
    this.life.wallFront = wh.front;
    this.life.wallBack = wh.back;
    this.life.anchors = { smoke, forges, targets, stalls, bells };
    this.life.populate(levels, st);
  }

  /** HD: carry on repainting the ground a few bands at a time; swap it in when done. */
  private stepGround(levels: Record<BuildingKey, number>, mood: CityMood): void {
    const job = this.groundJob;
    if (!job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 4) {
      const r = job.next();
      if (r.done) {
        this.ground = r.value;
        this.groundShownKey = this.groundJobKey;
        this.groundJob = null;
        this.groundJobKey = '';
        // The trees and fences come with the ground: refresh the sorted arts.
        this.rebuild(levels, mood);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  draw(out: HTMLCanvasElement, levels: Record<BuildingKey, number>, recruits: number, dt: number, mood: CityMood = {}): void {
    const t0 = performance.now();
    this.outW = out.width;
    this.outH = out.height;
    this.clamp();
    const hd = this.mode === 'hd';
    const f = this.frame;
    // Repaint only when a level changes or scaffolding goes up (not on every bit of progress).
    const scaffold = Object.entries(mood.progress ?? {}).filter(([, p]) => (p ?? 0) > 0.45).map(([k]) => k).sort().join(',');
    const key = JSON.stringify(levels) + '|' + scaffold;
    if (key !== this.key) {
      this.key = key;
      const r0 = performance.now();
      this.rebuild(levels, mood);
      this.lastRebuild = performance.now() - r0;
    } else if (this.groundJob) this.stepGround(levels, mood);
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
    // World pixels (what life, banners and anchors use) to buffer pixels.
    const world = () => g.setTransform(f.k, 0, 0, f.k, f.mx * f.k, f.my * f.k);
    const flat = () => g.setTransform(1, 0, 0, 1, 0, 0);
    flat();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const ground = this.ground!;
    g.drawImage(ground.base, 0, 0);
    const crop = ground.crops[Math.floor(t * (m.idle ? 1.5 : 2.5)) % ground.crops.length]!;
    g.drawImage(crop, ground.cropX ?? 0, ground.cropY ?? 0);

    // The sorted pass: buildings, walls, trees, people, beasts.
    const ents = this.ents;
    ents.length = 0;
    for (const a of this.arts) ents.push(a as unknown as Ent);
    this.life.collect(ents, r);
    ents.sort((a, b) => a.d - b.d || 0);
    let inWorld = false;
    for (const e of ents) {
      if ('canvas' in e) {
        const a = e as unknown as Art;
        if (!a.canvas) continue;
        if (inWorld) {
          flat();
          inWorld = false;
        }
        g.drawImage(a.canvas, a.x, a.y);
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
    // Torch and forge flames.
    const q = 1 / f.k;
    for (const [x, y] of this.forges) {
      const fl = 0.6 + 0.4 * Math.sin(t * 13 + x);
      g.fillStyle = fl > 0.7 ? '#ffd27a' : '#e07a2a';
      g.fillRect(x - 1, y - 1, 2, 2);
      g.fillStyle = '#b8401c';
      g.fillRect(x + 1, y, 1, 1);
    }
    if (night > 0.3)
      for (const tc of this.torches) {
        const fl = Math.sin(t * 17 + tc.x * 3) > 0 ? 1 : 0;
        if (hd) {
          // A brazier pole one art pixel wide, a three-step flame.
          g.fillStyle = '#2a1e16';
          g.fillRect(tc.x, tc.y, q, 3);
          g.fillStyle = '#ff8a2a';
          g.fillRect(tc.x - q, tc.y - 1 - fl * q, 3 * q, 2 * q);
          g.fillStyle = '#ffd27a';
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
    // Cloud shadows drifting over by day.
    if (night < 0.8) {
      g.globalAlpha = 1 - night;
      for (let i = 0; i < 2; i++) {
        const x = ((t * 3 + i * 300 + this.seed % 200) % (WORLD_W + 300)) - 150;
        const y = 40 + i * 120 + Math.sin(t * 0.05 + i) * 10;
        g.drawImage(this.cloud, x - 70, y - 35, 140, 70);
      }
      g.globalAlpha = 1;
    }

    // Light for the hour.
    flat();
    this.light(g, hour, night, t, world, flat);
    flat();

    // To the screen through the camera. The finish (grade, vignette, grain) is laid on the
    // visible part of the world buffer, so it costs the same at any screen size.
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const W = f.w;
    const H = f.h;
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
    const rw = Math.ceil(bx) - rx;
    const rh = Math.ceil(by) - ry;
    if (hd) this.finishHd(g, rx, ry, rw, rh);
    else this.post.apply(g, rx, ry, rw, rh, 1, false);
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

  /**
   * HD finish: the same amber-light, teal-shadow grade and vignette as the classic Post, without
   * the film grain (noise fights the clean pixel clusters at this density).
   */
  private finishHd(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = 'rgba(214,150,80,0.30)';
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(150,170,175,0.18)';
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'source-over';
    // The vignette belongs to the whole world, not the view, so it does not swim as you pan.
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = this.frame.w;
      c.height = this.frame.h;
      const v = c.getContext('2d')!;
      const W = c.width;
      const H = c.height;
      const grd = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.7, 'rgba(6,4,2,0.3)');
      grd.addColorStop(1, 'rgba(4,2,1,0.7)');
      v.fillStyle = grd;
      v.fillRect(0, 0, W, H);
      this.vignette = c;
    }
    g.drawImage(this.vignette, x, y, w, h, x, y, w, h);
    g.restore();
  }

  /** Night tint, warm dawn and dusk, then lit windows, torches and forges. */
  private light(g: CanvasRenderingContext2D, hour: number, night: number, t: number, world: () => void, flat: () => void): void {
    const W = this.frame.w;
    const H = this.frame.h;
    const undead = this.mode === 'hd' && this.st.id === 'undead';
    const warm = Math.max(0, 1 - Math.min(Math.abs(hour - 6.5), Math.abs(hour - 19)) / 1.5) * (undead ? 0.4 : 1);
    if (night > 0.01 || undead) {
      g.globalCompositeOperation = 'multiply';
      const k = night;
      // The necropolis's night is bluer and greener, and even its day is overcast (a grey-violet
      // veil, folded into the same pass); the others' night a cool blue.
      const [r, gg, b] = undead ? [255 - 200 * k, 255 - 165 * k, 255 - 120 * k] : [255 - 190 * k, 255 - 170 * k, 255 - 110 * k];
      const veil = undead ? [214 / 255, 210 / 255, 222 / 255] : [1, 1, 1];
      g.fillStyle = `rgb(${Math.round(r * veil[0]!)},${Math.round(gg * veil[1]!)},${Math.round(b * veil[2]!)})`;
      g.fillRect(0, 0, W, H);
    }
    if (warm > 0.01) {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = `rgba(255,150,80,${0.3 * warm})`;
      g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
    if (night > 0.15) {
      const a = Math.min(1, (night - 0.15) / 0.5);
      for (const art of this.arts) {
        if (!art.lights) continue;
        g.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 3 + art.x));
        g.drawImage(art.lights, art.x, art.y);
      }
      world();
      g.globalCompositeOperation = 'lighter';
      for (const tc of this.torches) {
        g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 11 + tc.x));
        g.drawImage(this.fire, tc.x - 24, tc.y - 24);
      }
      // Lit windows throw a little light of their own colour (lanterns, grave-light).
      if (this.mode === 'hd') {
        for (const art of this.arts) {
          if (!art.lights || !art.canvas) continue;
          g.globalAlpha = a * 0.35;
          const f = this.frame;
          const cx = (art.x + art.canvas.width / 2) / f.k - f.mx;
          const cy = (art.y + art.canvas.height / 2) / f.k - f.my;
          g.drawImage(this.glow, cx - 30, cy - 22, 60, 44);
        }
        this.life.nightGlow(g, this.glow, a);
      }
      g.globalAlpha = 1;
      flat();
    }
    world();
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of this.forges) {
      g.globalAlpha = (0.25 + 0.6 * night) * (0.8 + 0.2 * Math.sin(t * 9 + x));
      g.drawImage(this.fire, x - 24, y - 24);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    flat();
  }

  private drawSails(r: Draw, hub: [number, number], a: number): void {
    const [x, y] = hub;
    const g = r.g;
    const hd = this.mode === 'hd';
    const q = 1 / this.frame.k;
    const wood = css(this.st.timber[2]);
    // The necropolis's mill turns rags; the others sailcloth.
    const ragged = hd && this.st.id === 'undead';
    const cloth = ragged ? '#8a8270' : '#d8ceb4';
    const clothS = ragged ? '#5e584c' : '#b3a88c';
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
          g.fillStyle = lath ? wood : w < 2 ? cloth : clothS;
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

function radial(r: number, inner: string, outer: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const x = c.getContext('2d')!;
  const grd = x.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  x.fillStyle = grd;
  x.fillRect(0, 0, r * 2, r * 2);
  return c;
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
