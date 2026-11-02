// The commandery as a living isometric pixel diorama. Buildings are painted pixel by pixel at
// each level (empty lot, timber, stone, fortified, grand) into small canvases, repainted only when
// a level changes; every frame then draws the ground, sorts the buildings among the people and
// beasts by depth, adds smoke, crows and banners, and lights it for the hour: lit windows,
// torches and the forge at night. A camera zooms by whole pixels and pans over the world.

import { BUILDINGS, type BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { cityAtlas } from './city/atlas.ts';
import { paintBuilding, paintMill, tierOf, WALL, wallHeights, type Art, type Banner } from './city/buildings.ts';
import { groundKey, paintGround, type Ground } from './city/ground.ts';
import { Draw, Life, type Ent, type Mood } from './city/life.ts';
import { Folk } from './city/people.ts';
import { css, WORLD_H, WORLD_W } from './city/pixels.ts';
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

interface Torch {
  x: number;
  y: number;
}

export class CityScene {
  readonly buffer: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly post = new Post();
  private readonly st: CityStyle;
  private readonly draw2: Draw;
  private readonly life: Life;
  private ground: Ground | null = null;
  private groundKey = '';
  private arts: Art[] = [];
  private banners: Banner[] = [];
  private torches: Torch[] = [];
  private forges: [number, number][] = [];
  private mill: { art: Art; hub: [number, number] } | null = null;
  private key = '';
  private t = 0;
  private glow: HTMLCanvasElement;
  private cloud: HTMLCanvasElement;
  private ents: Ent[] = [];
  private nightNow = 0;
  /** Milliseconds the last draw took (for the preview's meter), and the last repaint of the buildings. */
  lastCost = 0;
  lastRebuild = 0;

  // Camera: whole-pixel zoom of the world buffer, centred on (cx, cy) in world pixels.
  zoom = 1;
  cx = WORLD_W / 2;
  cy = WORLD_H / 2;
  private outW = 1;
  private outH = 1;

  constructor(
    readonly faction: FactionId,
    readonly hue: number,
    readonly seed: number,
  ) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = WORLD_W;
    this.buffer.height = WORLD_H;
    this.g = this.buffer.getContext('2d')!;
    this.st = styleFor(faction, hue);
    this.draw2 = new Draw(cityAtlas(faction, hue), new Folk(this.st), this.st);
    this.life = new Life(seed);
    this.glow = radial(24, 'rgba(255,170,70,0.55)', 'rgba(255,120,40,0)');
    this.cloud = radial(70, 'rgba(10,14,20,0.16)', 'rgba(10,14,20,0)');
  }

  // ---------------------------------------------------------------- camera

  /** World pixels to output pixels right now. */
  scale(): number {
    const fit = Math.min(this.outW / WORLD_W, this.outH / WORLD_H);
    const s = fit * this.zoom;
    return s >= 1.5 ? Math.round(s) : s;
  }

  private clamp(): void {
    const s = this.scale();
    const vw = this.outW / s;
    const vh = this.outH / s;
    this.cx = vw >= WORLD_W ? WORLD_W / 2 : Math.max(vw / 2, Math.min(WORLD_W - vw / 2, this.cx));
    this.cy = vh >= WORLD_H ? WORLD_H / 2 : Math.max(vh / 2, Math.min(WORLD_H - vh / 2, this.cy));
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

  resetView(): void {
    this.zoom = 1;
    this.cx = WORLD_W / 2;
    this.cy = WORLD_H / 2;
  }

  // ---------------------------------------------------------------- building

  private rebuild(levels: Record<BuildingKey, number>, mood: CityMood): void {
    const st = this.st;
    const maxLevel = Math.max(0, ...BUILDINGS.map((b) => levels[b.key] ?? 0));
    // The ground is the slow part: repaint it only when something it shows has changed.
    const gk = groundKey(levels, maxLevel);
    if (!this.ground || gk !== this.groundKey) {
      this.ground = paintGround(st, levels, maxLevel);
      this.groundKey = gk;
    }
    const arts: Art[] = [...this.ground.arts];
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
      const p = paintBuilding(k, { st, level, progress: k === 'keep' ? 0 : mood.progress?.[k] ?? 0, seed: this.seed });
      arts.push(...p.arts);
      banners.push(...p.banners);
      torches.push(...p.torches.map(([x, y]) => ({ x, y })));
      smoke.push(...p.smoke);
      forges.push(...p.forges);
      bells.push(...p.bells);
      stalls.push(...p.stalls);
      targets.push(...p.targets);
    }
    this.mill = levels.granary > 0 ? paintMill(st, levels.granary) : null;
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

  // ---------------------------------------------------------------- drawing

  draw(out: HTMLCanvasElement, levels: Record<BuildingKey, number>, recruits: number, dt: number, mood: CityMood = {}): void {
    const t0 = performance.now();
    this.outW = out.width;
    this.outH = out.height;
    this.clamp();
    // Repaint only when a level changes or scaffolding goes up (not on every bit of progress).
    const scaffold = Object.entries(mood.progress ?? {}).filter(([, p]) => (p ?? 0) > 0.45).map(([k]) => k).sort().join(',');
    const key = JSON.stringify(levels) + '|' + scaffold;
    if (key !== this.key) {
      this.key = key;
      const r0 = performance.now();
      this.rebuild(levels, mood);
      this.lastRebuild = performance.now() - r0;
    }
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
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const ground = this.ground!;
    g.drawImage(ground.base, 0, 0);
    g.drawImage(ground.crops[Math.floor(t * (m.idle ? 1.5 : 2.5)) % ground.crops.length]!, 0, 0);

    // The sorted pass: buildings, walls, trees, people, beasts.
    const ents = this.ents;
    ents.length = 0;
    for (const a of this.arts) ents.push(a as unknown as Ent);
    this.life.collect(ents, r);
    ents.sort((a, b) => a.d - b.d || 0);
    for (const e of ents) {
      if ('canvas' in e) {
        const a = e as unknown as Art;
        if (a.canvas) g.drawImage(a.canvas, a.x, a.y);
      } else e.draw(r);
    }

    // Windmill sails.
    if (this.mill) this.drawSails(r, this.mill.hub, t * (m.idle ? 0.6 : 1.3));
    // Banners in the wind; more of them on a good streak.
    for (let i = 0; i < this.banners.length; i++) this.drawBanner(r, this.banners[i]!, t, i, m.streak >= 3);
    this.life.overlay(r);
    // Torch and forge flames.
    for (const [x, y] of this.forges) {
      const f = 0.6 + 0.4 * Math.sin(t * 13 + x);
      g.fillStyle = f > 0.7 ? '#ffd27a' : '#e07a2a';
      g.fillRect(x - 1, y - 1, 2, 2);
      g.fillStyle = '#b8401c';
      g.fillRect(x + 1, y, 1, 1);
    }
    if (night > 0.3)
      for (const tc of this.torches) {
        const f = Math.sin(t * 17 + tc.x * 3) > 0 ? 1 : 0;
        g.fillStyle = '#3a2a1a';
        g.fillRect(tc.x, tc.y, 1, 3);
        g.fillStyle = '#ffd27a';
        g.fillRect(tc.x, tc.y - 1 - f, 1, 1);
        g.fillStyle = '#ff8a2a';
        g.fillRect(tc.x - f, tc.y - 1, 1, 1);
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
    this.light(g, hour, night, t);

    // To the screen through the camera. The finish (grade, vignette, grain) is laid on the
    // visible part of the low-resolution world, so it costs the same at any screen size.
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const s = this.scale();
    const vw = out.width / s;
    const vh = out.height / s;
    let sx0 = Math.round((this.cx - vw / 2) * s) / s;
    let sy0 = Math.round((this.cy - vh / 2) * s) / s;
    if (vw >= WORLD_W) sx0 = -(vw - WORLD_W) / 2;
    if (vh >= WORLD_H) sy0 = -(vh - WORLD_H) / 2;
    const ax = Math.max(0, sx0);
    const ay = Math.max(0, sy0);
    const bx = Math.min(WORLD_W, sx0 + vw);
    const by = Math.min(WORLD_H, sy0 + vh);
    this.post.apply(g, Math.floor(ax), Math.floor(ay), Math.ceil(bx) - Math.floor(ax), Math.ceil(by) - Math.floor(ay), 1, false);
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

  /** Night tint, warm dawn and dusk, then lit windows, torches and forges. */
  private light(g: CanvasRenderingContext2D, hour: number, night: number, t: number): void {
    const warm = Math.max(0, 1 - Math.min(Math.abs(hour - 6.5), Math.abs(hour - 19)) / 1.5);
    if (night > 0.01) {
      g.globalCompositeOperation = 'multiply';
      const k = night;
      g.fillStyle = `rgb(${Math.round(255 - 190 * k)},${Math.round(255 - 170 * k)},${Math.round(255 - 110 * k)})`;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (warm > 0.01) {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = `rgba(255,150,80,${0.3 * warm})`;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    g.globalCompositeOperation = 'source-over';
    if (night > 0.15) {
      const a = Math.min(1, (night - 0.15) / 0.5);
      for (const art of this.arts) {
        if (!art.lights) continue;
        g.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 3 + art.x));
        g.drawImage(art.lights, art.x, art.y);
      }
      g.globalCompositeOperation = 'lighter';
      for (const tc of this.torches) {
        g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 11 + tc.x));
        g.drawImage(this.glow, tc.x - 24, tc.y - 24);
      }
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of this.forges) {
      g.globalAlpha = (0.25 + 0.6 * night) * (0.8 + 0.2 * Math.sin(t * 9 + x));
      g.drawImage(this.glow, x - 24, y - 24);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawSails(r: Draw, hub: [number, number], a: number): void {
    const [x, y] = hub;
    const g = r.g;
    const wood = css(this.st.timber[2]);
    const cloth = '#d8ceb4';
    const clothS = '#b3a88c';
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
      for (let i = 5; i <= L; i += 0.5) {
        for (let w = 0.5; w <= 4; w += 0.5) {
          const sx = x + cx * i + px * w * 0.75;
          const sy = y + cy * i + py * w;
          const lath = Math.floor(i) % 4 === 0 || w >= 4;
          g.fillStyle = lath ? wood : w < 2 ? cloth : clothS;
          g.fillRect(Math.floor(sx), Math.floor(sy), 1, 1);
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
