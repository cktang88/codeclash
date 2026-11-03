// Life in the commandery: people and beasts going about their business on the road graph,
// workers at every building, the recruits drilling, sentries on the walls, and the little
// effects (arrows, sparks, smoke, dust, crows) that make it worth leaving open.

import type { BuildingKey } from '../../../game/city.ts';
import { U, UNIT_COUNT } from '../../../game/units.ts';
import { Anim, type Atlas, type Dir } from '../contract.ts';
import { GATE_V, tierOf, WALL } from './buildings.ts';
import { FIELDS, GARDEN, PADDOCK } from './ground.ts';
import {
  carpenterLook, CART_FX, CART_FY, CART_H, CART_W, chaplainLook, CROW_H, CROW_W, DOG_FX, DOG_FY, DOG_H, DOG_W, farmerLook, FIG_FX, FIG_FY, FIG_H, FIG_W,
  Folk, HEN_H, HEN_W, HORSE_FX, HORSE_FY, HORSE_H, HORSE_W, infirmarerLook, monkLook, sergeantLook, squireLook, villagerLook, type Look,
} from './people.ts';
import { folkSeed, samuraiLooks, templarLooks, undeadLooks, type FolkHd, type Looks } from './people-hd.ts';
import { CLASSIC, css, hash, sx, sy, WORLD_W, type Frame } from './pixels.ts';
import { NODES, route, type Place } from './roads.ts';
import type { CityStyle } from './style.ts';

export interface Mood {
  /** No push today: fewer hands, thin smoke, a bored sentry. */
  idle: boolean;
  /** Days in a row: festive from 3. */
  streak: number;
  wins: number;
  /** Today's army per unit class (for the drilling block's make-up). */
  army: number[] | null;
  /** Soldiers in the drilling block. */
  recruits: number;
  /** The army marches out of the gate (battle time). */
  marching: boolean;
  /** 0 day .. 1 night. */
  night: number;
}

/** Everything drawn in the sorted pass. */
export interface Ent {
  d: number;
  draw(r: Draw): void;
}

// ------------------------------------------------------------------ drawing helpers

export class Draw {
  g!: CanvasRenderingContext2D;
  t = 0;
  /** Buffer pixels per world pixel (1 classic, 2 HD): the size of one art pixel is 1/k. */
  readonly k: number;
  /** Sheet pixels per world pixel in the folk's sheets. */
  readonly d: number;
  /** HD: the townsfolk painter (folk-*.ts), or null in classic. */
  readonly hdFolk: FolkHd | null;
  /** 0 day .. 1 night (HD folk lay their night palette over at this opacity). */
  night = 0;
  constructor(
    readonly atlas: Atlas,
    readonly folk: Folk | FolkHd,
    readonly st: CityStyle,
    readonly frame: Frame = CLASSIC,
  ) {
    this.k = frame.k;
    this.d = 'density' in folk ? folk.density : 1;
    this.hdFolk = 'density' in folk ? folk : null;
  }
  /** Snap a world-pixel coordinate to the art pixel grid. */
  snap(x: number): number {
    return Math.floor(x * this.k) / this.k;
  }

  sheet(img: HTMLCanvasElement, cw: number, ch: number, fx: number, fy: number, frame: number, dir: Dir, u: number, v: number, z = 0): void {
    const x = this.snap(sx(u, v)) - fx;
    const y = this.snap(sy(u, v, z)) - fy;
    const d = this.d;
    this.g.drawImage(img, frame * cw * d, dir * ch * d, cw * d, ch * d, x, y, cw, ch);
  }
  /** A cell of a folk sheet at a screen point (world pixels), for things not on the ground. */
  cell(img: HTMLCanvasElement, cw: number, ch: number, col: number, row: number, x: number, y: number): void {
    const d = this.d;
    this.g.drawImage(img, col * cw * d, row * ch * d, cw * d, ch * d, this.snap(x), this.snap(y), cw, ch);
  }
  /**
   * A townsperson. `frame` is the classic frame (0-3 walk, 4 idle, 5-6 work); HD folk play their
   * longer clips from `phase` (the walk: one per two steps) or the clock.
   */
  figure(look: Look, frame: number, dir: Dir, u: number, v: number, z = 0, phase?: number): void {
    const hd = this.hdFolk;
    if (hd) {
      hd.person(this.g, look, frame, dir, this.snap(sx(u, v)), this.snap(sy(u, v, z)), this.t, this.night, folkSeed(u, v), phase);
      return;
    }
    const folk = this.folk as Folk;
    this.sheet(folk.figure(look), FIG_W, FIG_H, FIG_FX, FIG_FY, frame, dir, u, v, z);
  }
  /** A horse (`cart`: the beast in the cart's shafts, an ox in the castle town). */
  horse(coat: number, frame: number, dir: Dir, u: number, v: number, z = 0, phase?: number, cart = false): void {
    const hd = this.hdFolk;
    if (hd) {
      hd.horse(this.g, coat, frame, dir, this.snap(sx(u, v)), this.snap(sy(u, v, z)), this.t, this.night, folkSeed(u, v), phase, cart);
      return;
    }
    const folk = this.folk as Folk;
    this.sheet(folk.horse[coat % folk.horse.length]!, HORSE_W, HORSE_H, HORSE_FX, HORSE_FY, frame, dir, u, v, z);
  }
  /** A dog: 0-1 trotting, 2 and 3 standing about. */
  dog(frame: number, dir: Dir, u: number, v: number, phase?: number): void {
    const hd = this.hdFolk;
    if (hd) return hd.dog(this.g, frame, dir, this.snap(sx(u, v)), this.snap(sy(u, v)), this.t, this.night, folkSeed(u, v), phase);
    this.sheet((this.folk as Folk).dog, DOG_W, DOG_H, DOG_FX, DOG_FY, frame, dir, u, v);
  }
  hen(frame: number, dir: Dir, u: number, v: number): void {
    const hd = this.hdFolk;
    if (hd) return hd.hen(this.g, frame, dir, this.snap(sx(u, v)), this.snap(sy(u, v)), this.night);
    this.sheet((this.folk as Folk).hen, HEN_W, HEN_H, 3, 6, frame, dir, u, v);
  }
  cart(frame: number, dir: Dir, u: number, v: number): void {
    const hd = this.hdFolk;
    if (hd) return hd.cart(this.g, frame, dir, this.snap(sx(u, v)), this.snap(sy(u, v)), this.night);
    this.sheet((this.folk as Folk).cart, CART_W, CART_H, CART_FX, CART_FY, frame, dir, u, v);
  }
  /** A crow in flight at a screen point (world pixels). */
  crow(frame: number, row: number, x: number, y: number): void {
    const hd = this.hdFolk;
    if (hd) return hd.crow(this.g, frame, row, this.snap(x), this.snap(y), this.night);
    this.cell((this.folk as Folk).crow, CROW_W, CROW_H, frame, row, x, y);
  }
  /** A soldier from the battle atlas; `time` in seconds drives the animation. */
  soldier(kind: number, anim: Anim, time: number, dir: Dir, u: number, v: number, z = 0): void {
    const a = this.atlas;
    const n = Math.max(1, a.frames(kind, anim));
    const frame = Math.floor((time * 10) / Math.max(1, a.ticksPerFrame(anim))) % n;
    this.atlasFrame(kind, anim, frame, dir, u, v, z);
  }
  /**
   * A soldier's frame. Classic draws the atlas grid cell, one texel to a world pixel. HD draws
   * the HD painter's sheet at the buffer's own density (level k: one texel to a buffer pixel), so
   * soldiers share the townsfolk's pixel scale; until that sheet is painted (in the background),
   * the grid cell stands in at the same size.
   */
  private atlasFrame(kind: number, anim: Anim, frame: number, dir: Dir, u: number, v: number, z: number): void {
    const a = this.atlas;
    const k = this.k;
    const x = this.snap(sx(u, v));
    const y = this.snap(sy(u, v, z));
    if (k > 1 && a.sheet && a.slot) {
      const sh = a.sheet(kind, k);
      if (sh) {
        let page = sheetCanvas.get(sh);
        if (!page) {
          page = document.createElement('canvas');
          page.width = sh.width;
          page.height = sh.height;
          page.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(sh.pixels), sh.width, sh.height), 0, 0);
          sheetCanvas.set(sh, page);
        }
        const i = a.slot(kind, anim, frame, dir) * 6;
        const r = sh.rects;
        const w = r[i + 2]!;
        const h = r[i + 3]!;
        if (w > 0 && h > 0) this.g.drawImage(page, r[i]!, r[i + 1]!, w, h, x - r[i + 4]! / k, y - r[i + 5]! / k, w / k, h / k);
        return;
      }
    }
    const [cx, cy] = a.at(kind, anim, frame, dir);
    // HD, until the sheet lands: the level-1 grid cell at one texel to a buffer pixel (drawn at
    // world scale it was twice the townsfolk's size in doubled pixels, a murky blob).
    if (k > 1) this.g.drawImage(a.image, cx, cy, a.cellW, a.cellH, x - a.footX / k, y - a.footY / k, a.cellW / k, a.cellH / k);
    else this.g.drawImage(a.image, cx, cy, a.cellW, a.cellH, x - a.footX, y - a.footY, a.cellW, a.cellH);
  }
  /** A soldier on a given frame (for scripted actions). */
  soldierFrame(kind: number, anim: Anim, frame: number, dir: Dir, u: number, v: number, z = 0): void {
    const a = this.atlas;
    const n = Math.max(1, a.frames(kind, anim));
    this.atlasFrame(kind, anim, Math.min(n - 1, Math.max(0, frame)), dir, u, v, z);
  }
  /** One art pixel (in HD, half a world pixel). */
  px(x: number, y: number, c: string): void {
    const q = 1 / this.k;
    this.g.fillStyle = c;
    this.g.fillRect(this.snap(x), this.snap(y), q, q);
  }
  /** A one-art-pixel line. */
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const k = this.k;
    const q = 1 / k;
    this.g.fillStyle = c;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * k));
    for (let i = 0; i <= n; i++) this.g.fillRect(this.snap(x0 + ((x1 - x0) * i) / n), this.snap(y0 + ((y1 - y0) * i) / n), q, q);
  }
  /** A timber two pixels thick with a dark outline, so engines read against the ground. */
  beam(x0: number, y0: number, x1: number, y1: number, c: string, out = '#140f0b'): void {
    const g = this.g;
    if (this.k > 1) {
      // HD: a timber two art pixels thick inside a one-pixel outline, on the art grid.
      const q = 1 / this.k;
      const m = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * this.k));
      g.fillStyle = out;
      for (let i = 0; i <= m; i++) g.fillRect(this.snap(x0 + ((x1 - x0) * i) / m) - q, this.snap(y0 + ((y1 - y0) * i) / m) - q, 4 * q, 4 * q);
      g.fillStyle = c;
      for (let i = 0; i <= m; i++) g.fillRect(this.snap(x0 + ((x1 - x0) * i) / m), this.snap(y0 + ((y1 - y0) * i) / m), 2 * q, 2 * q);
      return;
    }
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    g.fillStyle = out;
    for (let i = 0; i <= n; i++) g.fillRect(Math.floor(x0 + ((x1 - x0) * i) / n) - 1, Math.floor(y0 + ((y1 - y0) * i) / n) - 1, 4, 3);
    g.fillStyle = c;
    for (let i = 0; i <= n; i++) g.fillRect(Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(y0 + ((y1 - y0) * i) / n), 2, 1);
  }
  /** A small shadow under a figure. */
  shadow(u: number, v: number, w = 5): void {
    this.g.fillStyle = 'rgba(20,14,8,0.28)';
    if (this.k > 1) {
      // HD: a soft two-row ellipse in art pixels.
      const q = 1 / this.k;
      const x = this.snap(sx(u, v));
      const y = this.snap(sy(u, v));
      this.g.fillRect(x - w / 2, y, w, q);
      this.g.fillRect(x - w / 2 + q, y + q, w - 2 * q, q);
      return;
    }
    this.g.fillRect(Math.floor(sx(u, v)) - (w >> 1), Math.floor(sy(u, v)), w, 1);
  }
  /** A filled rectangle on the art grid (HD) or the world grid (classic), in world pixels. */
  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.g.fillStyle = c;
    this.g.fillRect(this.snap(x), this.snap(y), w, h);
  }
  /**
   * HD: a round puff of `d` art pixels, lit on its upper left (smoke, dust). Built from three
   * rectangles so its corners are cut, not square.
   */
  puff(x: number, y: number, d: number, lit: string, shade: string): void {
    const q = 1 / this.k;
    const g = this.g;
    const D = Math.max(1, Math.round(d));
    const x0 = this.snap(x - (D * q) / 2);
    const y0 = this.snap(y - (D * q) / 2);
    g.fillStyle = shade;
    if (D <= 2) {
      g.fillRect(x0, y0, D * q, D * q);
      return;
    }
    g.fillRect(x0 + q, y0, (D - 2) * q, D * q);
    g.fillRect(x0, y0 + q, D * q, (D - 2) * q);
    g.fillStyle = lit;
    g.fillRect(x0 + q, y0 + q, (D - 2) * q, Math.max(1, D - 3) * q);
  }
}

/** Facing for a step (du, dv) on the ground. */
export function dirOf(du: number, dv: number, prev: Dir): Dir {
  const x = du - dv;
  const y = du + dv;
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return prev;
  if (y >= 0) return x >= 0 ? 0 : 1;
  return x < 0 ? 2 : 3;
}

// ------------------------------------------------------------------ a deterministic-enough random

class Rand {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
}

// ------------------------------------------------------------------ walkers

type Companion = 'none' | 'horse' | 'cart' | 'litter';

class Walker implements Ent {
  d = 0;
  u: number;
  v: number;
  dir: Dir = 0;
  dist = 0;
  path: [number, number][] = [];
  wait: number;
  hidden = false;
  /** Positions every unit walked, for whoever follows. */
  trail: [number, number][] = [];
  litterLook: Look | null = null;
  constructor(
    public place: Place,
    readonly look: Look,
    readonly haunts: readonly Place[],
    readonly speed: number,
    readonly lane: number,
    readonly rand: Rand,
    readonly companion: Companion = 'none',
    readonly coat = 0,
    /** Shown only while the population allows it (0..1). */
    readonly rank = 0,
    readonly workAt: Partial<Record<Place, boolean>> = {},
    readonly enters: Partial<Record<Place, boolean>> = {},
  ) {
    const [u, v] = NODES[place];
    this.u = u + lane;
    this.v = v - lane;
    this.wait = rand.range(0, 6);
  }
  working = false;

  update(dt: number, life: Life): void {
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.hidden = false;
        this.working = false;
        let next = this.rand.pick(this.haunts);
        if (next === this.place) next = this.rand.pick(this.haunts);
        this.path = route(this.place, next).map((p) => {
          const [u, v] = NODES[p];
          return [u + this.lane, v - this.lane] as [number, number];
        });
        this.dest = next;
        // Stand about somewhere near the place, not all on one spot.
        const last = this.path[this.path.length - 1];
        if (last && !this.enters[next] && this.companion === 'none') this.path.push([last[0] + this.rand.range(-4, 4), last[1] + this.rand.range(-4, 4)]);
      }
      return;
    }
    const target = this.path[0];
    if (!target) {
      this.wait = this.rand.range(1, 3);
      return;
    }
    const du = target[0] - this.u;
    const dv = target[1] - this.v;
    const len = Math.hypot(du, dv);
    const step = this.speed * dt * (this.companion === 'cart' || this.companion === 'litter' ? 0.8 : 1);
    if (len <= step) {
      this.u = target[0];
      this.v = target[1];
      this.path.shift();
      if (!this.path.length) {
        this.place = this.dest;
        this.working = !!this.workAt[this.place];
        this.hidden = !!this.enters[this.place];
        this.wait = this.hidden ? this.rand.range(6, 18) : this.rand.range(2, this.working ? 9 : 5);
        if (this.companion === 'cart' && this.place === 'granary') this.wait = 7;
      }
    } else {
      this.u += (du / len) * step;
      this.v += (dv / len) * step;
      this.dir = dirOf(du, dv, this.dir);
    }
    const before = Math.floor(this.dist);
    this.dist += Math.min(step, len);
    if (Math.floor(this.dist) !== before) {
      this.trail.push([this.u, this.v]);
      if (this.trail.length > 24) this.trail.shift();
      if (this.companion === 'cart' && Math.floor(this.dist) % 3 === 0) life.dust(this.u, this.v, 1);
    }
    void life;
  }
  dest: Place = 'yard';

  private behind(n: number): [number, number] {
    const tr = this.trail;
    if (tr.length > n) return tr[tr.length - 1 - n]!;
    return tr[0] ?? [this.u, this.v];
  }

  near(u: number, v: number, r: number): boolean {
    return !this.hidden && Math.hypot(this.u - u, this.v - v) < r;
  }

  draw(r: Draw): void {
    if (this.hidden) return;
    const moving = this.wait <= 0 && this.path.length > 0;
    const frame = moving ? Math.floor(this.dist / 2.2) % 4 : this.working ? 5 + (Math.floor(r.t * 2.5 + this.lane) % 2) : 4;
    if (this.companion === 'horse' || this.companion === 'cart') {
      // The beast walks ahead of the cart, or behind the one leading it.
      const hf = moving ? Math.floor(this.dist / 2) % 4 : 4;
      if (this.companion === 'cart') {
        const [cu, cv] = this.behind(12);
        const cartDir: Dir = this.dir;
        const back = this.dir === 2 || this.dir === 3;
        const drawCart = () => r.cart(r.hdFolk ? Math.floor(this.dist / 1.5) % 4 : Math.floor(this.dist / 3) % 2, cartDir, cu, cv);
        const drawHorse = () => r.horse(this.coat, hf, this.dir, this.u, this.v, 0, this.dist / 9, true);
        r.shadow(cu, cv, 12);
        if (!r.hdFolk) r.shadow(this.u, this.v, 10);
        if (back) {
          drawHorse();
          drawCart();
        } else {
          drawCart();
          drawHorse();
        }
        // The carter walks at the horse's head.
        r.figure(this.look, frame, this.dir, this.u + 3, this.v + 3, 0, this.dist / 8.8);
        return;
      }
      const [hu, hv] = this.behind(8);
      const back = this.dir === 2 || this.dir === 3;
      if (!back) r.horse(this.coat, hf, this.dir, hu, hv, 0, this.dist / 9);
      if (!r.hdFolk) r.shadow(this.u, this.v);
      r.figure(this.look, frame, this.dir, this.u, this.v, 0, this.dist / 8.8);
      if (back) r.horse(this.coat, hf, this.dir, hu, hv, 0, this.dist / 9);
      return;
    }
    if (this.companion === 'litter') {
      // Two brothers carry a wounded man between them.
      const [bu, bv] = this.behind(8);
      const x0 = Math.floor(sx(this.u, this.v));
      const y0 = Math.floor(sy(this.u, this.v)) - 7;
      const x1 = Math.floor(sx(bu, bv));
      const y1 = Math.floor(sy(bu, bv)) - 7;
      const back = this.dir === 2 || this.dir === 3;
      const second = () => r.figure(this.look, (frame + 2) % 4, this.dir, bu, bv, 0, this.dist / 8.8 + 0.5);
      if (!back) second();
      else r.figure(this.look, frame, this.dir, this.u, this.v, 0, this.dist / 8.8);
      r.line(x0, y0, x1, y1, css(r.st.timber[2]));
      r.line(x0, y0 - 1, x1, y1 - 1, '#d8d0bc');
      r.line(Math.round((x0 * 2 + x1) / 3), Math.round((y0 * 2 + y1) / 3) - 2, Math.round((x0 + x1 * 2) / 3), Math.round((y0 + y1 * 2) / 3) - 2, '#6b5a3e');
      r.px((x0 * 2 + x1) / 3, (y0 * 2 + y1) / 3 - 2, css(r.st.skin));
      if (!back) r.figure(this.look, frame, this.dir, this.u, this.v, 0, this.dist / 8.8);
      else second();
      return;
    }
    if (!r.hdFolk) r.shadow(this.u, this.v);
    r.figure(this.look, frame, this.dir, this.u, this.v, 0, this.dist / 8.8);
  }
}

/** A dog or a hen: wanders near a home spot, or follows someone. */
class Beast implements Ent {
  d = 0;
  u: number;
  v: number;
  tu: number;
  tv: number;
  dir: Dir = 0;
  dist = 0;
  wait = 0;
  constructor(
    readonly kind: 'dog' | 'hen',
    readonly home: [number, number],
    readonly radius: number,
    readonly rand: Rand,
    readonly rank: number,
    public follow: Walker | null = null,
  ) {
    this.u = this.tu = home[0] + rand.range(-radius, radius);
    this.v = this.tv = home[1] + rand.range(-radius, radius);
  }
  update(dt: number): void {
    if (this.follow && !this.follow.hidden) {
      this.tu = this.follow.u - 4;
      this.tv = this.follow.v + 3;
    }
    const du = this.tu - this.u;
    const dv = this.tv - this.v;
    const len = Math.hypot(du, dv);
    const speed = this.kind === 'dog' ? (len > 8 ? 26 : 12) : 6;
    if (len < 0.8) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = this.rand.range(1, this.kind === 'dog' ? 6 : 3);
        const c = this.follow && !this.follow.hidden ? [this.follow.u, this.follow.v] : this.home;
        this.tu = c[0]! + this.rand.range(-this.radius, this.radius);
        this.tv = c[1]! + this.rand.range(-this.radius, this.radius);
      }
      return;
    }
    const step = Math.min(len, speed * dt);
    this.u += (du / len) * step;
    this.v += (dv / len) * step;
    this.dist += step;
    this.dir = dirOf(du, dv, this.dir);
  }
  draw(r: Draw): void {
    const moving = Math.hypot(this.tu - this.u, this.tv - this.v) >= 0.8;
    if (this.kind === 'dog') {
      const f = moving ? Math.floor(this.dist / 2) % 2 : this.wait > 3 ? 2 : 3;
      if (!r.hdFolk) r.shadow(this.u, this.v, 6);
      r.dog(f, this.dir, this.u, this.v, this.dist / 7);
    } else {
      const f = moving ? 0 : Math.floor(r.t * 3 + this.home[0]) % 5 === 0 ? 1 : 0;
      r.hen(f, this.dir, this.u, this.v);
    }
  }
}

// ------------------------------------------------------------------ particles

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  kind: 0 | 1 | 2 | 3 | 4; // smoke, dust, spark, sawdust, forge smoke
}

// ------------------------------------------------------------------ life

export interface Anchors {
  smoke: [number, number][];
  forges: [number, number][];
  targets: [number, number][];
  stalls: [number, number][];
  bells: [number, number][];
}

export class Life {
  walkers: Walker[] = [];
  beasts: Beast[] = [];
  parts: Particle[] = [];
  ents: Ent[] = [];
  private rand: Rand;
  private levels: Record<BuildingKey, number> | null = null;
  mood: Mood = { idle: false, streak: 0, wins: 0, army: null, recruits: 0, marching: false, night: 0 };
  /** Arrows in flight and stuck in the butts. */
  private arrows: { from: [number, number, number]; to: [number, number, number]; t: number; target: number }[] = [];
  private stuck: [number, number, number][] = [];
  private shotClock: number[] = [];
  private throwT = 999;
  private armed = false;
  private stone: { t: number; u0: number; u1: number; v: number } | null = null;
  gate = 0;
  bellT = 999;
  private nextBell = 20;
  private crows: { x: number; y: number; vx: number; ph: number }[] = [];
  private nextCrows = 8;
  private marchS = 0;
  private fieldPos: number[] = [];
  anchors: Anchors = { smoke: [], forges: [], targets: [], stalls: [], bells: [] };
  wallFront = 8;
  wallBack = 11;

  /** HD: the faction's own people and night life; null in classic. */
  readonly hd: CityStyle | null;
  /** Who lives here, by role. */
  L: Looks;
  private wisps: { u: number; v: number; ph: number; sp: number }[] = [];

  constructor(seed: number, hd: CityStyle | null = null) {
    this.rand = new Rand(seed);
    this.hd = hd;
    this.L = classicLooks(hd);
    if (hd?.id === 'samurai') this.L = samuraiLooks(hd);
    else if (hd?.id === 'undead') this.L = undeadLooks(hd);
    if (hd?.id === 'undead')
      for (let i = 0; i < 9; i++) {
        const f = FIELDS[i % FIELDS.length]!;
        this.wisps.push({ u: f[0] + hash(i, 1) * (f[2] - f[0]), v: f[1] + hash(i, 2) * (f[3] - f[1]), ph: hash(i, 3) * 6, sp: 0.4 + hash(i, 4) * 0.5 });
      }
  }

  /**
   * HD night light from life: will-o'-wisps drifting over the necropolis's grave fields (drawn
   * additively as a stepped halo, then a bright core), and paper lanterns on the castle town's
   * walkers. Called inside the light pass in the flat (buffer pixel) transform; `halo` lays a halo
   * at a world centre and size, and `f` maps world to buffer pixels.
   */
  nightGlow(g: CanvasRenderingContext2D, halo: (x: number, y: number, w: number, h: number) => void, a: number, f: { k: number; mx: number; my: number }): void {
    if (this.hd?.id !== 'undead' || !this.levels) return;
    const t = this.wispT;
    for (const w of this.wisps) {
      const u = w.u + Math.sin(t * w.sp + w.ph) * 6;
      const v = w.v + Math.cos(t * w.sp * 0.7 + w.ph) * 5;
      const z = 5 + Math.sin(t * 1.7 + w.ph) * 2;
      const x = sx(u, v);
      const y = sy(u, v, z);
      const pulse = 0.6 + 0.4 * Math.sin(t * 3 + w.ph * 2);
      g.globalAlpha = a * pulse * 0.9;
      halo(x, y, 18, 18);
      g.globalAlpha = a * pulse;
      // A bright core: a cross of five art pixels.
      g.fillStyle = '#e8ffd8';
      const cx = Math.floor((x + f.mx) * f.k);
      const cy = Math.floor((y + f.my) * f.k);
      g.fillRect(cx, cy - 1, 1, 3);
      g.fillRect(cx - 1, cy, 3, 1);
    }
  }
  private wispT = 0;

  /** Rebuild the population for new levels (keeps nothing; called rarely). */
  populate(levels: Record<BuildingKey, number>, st: CityStyle): void {
    this.levels = levels;
    if (!this.hd) this.L = classicLooks(st);
    else if (this.hd.id === 'templar') this.L = templarLooks(st);
    const R = this.rand;
    const total = Object.values(levels).reduce((a, b) => a + b, 0);
    this.walkers = [];
    this.beasts = [];
    const workAt: Partial<Record<Place, boolean>> = { well: true, garden: true, granary: true };
    const enters: Partial<Record<Place, boolean>> = { keep: true, chapel: true, hospital: true, barracks: true };
    const nVill = Math.max(2, Math.min(24, Math.round(2 + total / 5)));
    const hauntsV: Place[] = ['well', 'yard', 'granary', 'keep', 'out', 'workshop', 'yardS', 'chapel', 'cross', 'garden'];
    for (let i = 0; i < nVill; i++) {
      const carry = (['none', 'sack', 'bucket', 'basket', 'plank', 'none'] as const)[i % 6]!;
      const start = R.pick(hauntsV);
      this.walkers.push(new Walker(start, this.L.villager(i * 7 + 3, carry), hauntsV, R.range(9, 13), R.range(-2.5, 2.5), new Rand(i * 31 + 7), 'none', 0, i / nVill, workAt, { keep: true, out: true }));
    }
    if (levels.chapter > 0) {
      const n = 1 + tierOf(levels.chapter);
      for (let i = 0; i < n; i++)
        this.walkers.push(new Walker('chapel', i === 0 ? this.L.chaplain() : this.L.monk(i % 2 ? 'book' : 'none'), ['chapel', 'hospital', 'keep', 'yardN', 'garden'], 7, R.range(-1.5, 1.5), new Rand(100 + i), 'none', 0, i / n, { yardN: true }, enters));
    }
    if (levels.hospital > 0) {
      this.walkers.push(new Walker('hospital', this.L.infirmarer('none', 'bucket'), ['hospital', 'well', 'garden'], 8, 1, new Rand(200), 'none', 0, 0.1, { garden: true, well: true }, { hospital: true }));
      if (levels.hospital >= 3) this.walkers.push(new Walker('out', this.L.infirmarer('none'), ['out', 'hospital'], 8, -1, new Rand(201), 'litter', 0, 0.3, {}, { hospital: true, out: true }));
    }
    if (levels.granary > 0) {
      const carts = levels.granary >= 8 ? 2 : 1;
      for (let i = 0; i < carts; i++)
        this.walkers.push(new Walker(i ? 'granary' : 'out', this.L.villager(50 + i, 'none'), ['out', 'granary'], 10, -2 + i * 2, new Rand(300 + i), 'cart', 3, i * 0.4, {}, { out: true }));
      for (let i = 0; i < Math.min(6, 2 + Math.floor(levels.granary / 3)); i++) this.beasts.push(new Beast('hen', i % 2 ? [176, 112] : [150, 186], 7, new Rand(400 + i), i / 6));
    }
    if (levels.stables > 0) {
      const n = levels.stables >= 10 ? 2 : 1;
      for (let i = 0; i < n; i++)
        this.walkers.push(new Walker('stables', i ? this.L.squire() : this.L.villager(60, 'none'), ['stables', 'out', 'yard', 'paddock'], 9, 1 + i, new Rand(500 + i), 'horse', i ? 1 : 0, i * 0.5, {}, {}));
    }
    if (levels.barracks > 0) {
      for (let i = 0; i < Math.min(3, tierOf(levels.barracks)); i++)
        this.walkers.push(new Walker('barracks', this.L.sergeant(i % 2 ? 'none' : 'staff'), ['barracks', 'yard', 'keep', 'forge', 'gateIn'], 10, R.range(-2, 2), new Rand(600 + i), 'none', 0, i / 3, { gateIn: true }, { barracks: true }));
    }
    if (levels.workshop > 0) this.walkers.push(new Walker('workshop', this.L.carpenter(1, 'none', 'plank'), ['workshop', 'yard', 'out', 'forge'], 9, -1.5, new Rand(700), 'none', 0, 0.2, {}, { out: true }));
    const dogs = Math.min(3, 1 + Math.floor(total / 40));
    for (let i = 0; i < dogs; i++) this.beasts.push(new Beast('dog', NODES.yard as unknown as [number, number], 14, new Rand(800 + i), i / 3, this.walkers[i * 3] ?? null));
    this.fieldPos = FIELDS.map((_, i) => hash(i, 3) * 40);
    this.stuck = [];
  }

  dust(u: number, v: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.parts.push({ x: sx(u, v) + this.rand.range(-2, 2), y: sy(u, v) - 1, vx: this.rand.range(-3, 3), vy: -this.rand.range(1, 4), age: 0, life: this.rand.range(0.6, 1.2), kind: 1 });
  }

  private emit(x: number, y: number, kind: Particle['kind'], vx: number, vy: number, life: number): void {
    if (this.parts.length > 400) return;
    this.parts.push({ x, y, vx, vy, age: 0, life, kind });
  }

  update(dt: number, t: number, levels: Record<BuildingKey, number>): void {
    const m = this.mood;
    this.wispT += dt;
    const busy = (m.idle ? 0.55 : m.streak >= 3 ? 1 : 0.85) * (1 - 0.6 * m.night);
    for (const w of this.walkers) if (w.rank <= busy || w.companion !== 'none') w.update(dt, this);
    for (const b of this.beasts) b.update(dt);
    // The gate opens for carts, horses and the marching army.
    const [gu, gv] = NODES.gateIn;
    let want = m.marching && this.marchS > 0 ? 1 : 0;
    for (const w of this.walkers) if (w.companion !== 'none' && (w.near(gu + 10, gv, 30))) want = 1;
    this.gate += Math.sign(want - this.gate) * Math.min(Math.abs(want - this.gate), dt * 0.8);

    // Smoke from the chimneys; thin when the lord has not pushed today.
    const rate = (m.idle ? 0.8 : 2.2) * dt;
    for (const [x, y] of this.anchors.smoke) if (this.rand.next() < rate) this.emit(x, y, 0, 0, -6, this.rand.range(2.5, 4.5));
    for (const [x, y] of this.anchors.forges) if (this.rand.next() < dt * 2) this.emit(x, y - 2, 2, this.rand.range(-6, 6), -this.rand.range(8, 18), 0.5);

    // The bell: every few minutes, and the brothers go in.
    this.nextBell -= dt;
    this.bellT += dt;
    if (this.nextBell <= 0 && levels.chapter > 0) {
      this.bellT = 0;
      this.nextBell = 70 + this.rand.range(0, 40);
      for (const w of this.walkers)
        if (w.haunts.includes('chapel') && w.look.robe && w.wait > 0) {
          w.wait = 0.01 + this.rand.range(0, 2);
        }
    }

    // Archers loose at the butts.
    const archers = this.archerCount(levels);
    for (let i = 0; i < archers; i++) {
      this.shotClock[i] = (this.shotClock[i] ?? hash(i, 9) * 3) + dt * (m.idle ? 0.6 : 1);
      if (this.shotClock[i]! >= 3.2) {
        this.shotClock[i] = 0;
        const v = 42.5 + i * 7;
        const target = this.anchors.targets[i];
        if (target) this.arrows.push({ from: [196, v, 11], to: [152.8, v + 0.5 + this.rand.range(-1.5, 1.5), 7 + this.rand.range(-1.8, 1.8)], t: 0, target: i });
      }
    }
    for (const a of this.arrows) a.t += dt * 2.6;
    for (const a of this.arrows) if (a.t >= 1) this.stuck.push(a.to);
    this.arrows = this.arrows.filter((a) => a.t < 1);
    if (this.stuck.length > archers * 7) this.stuck.splice(0, archers * 4);

    // The mangonel's test throw.
    if (levels.workshop >= 3) {
      this.throwT += dt;
      if (this.throwT > 24 && !m.idle && m.night < 0.65) {
        this.throwT = 0;
        this.armed = true;
      }
      if (this.throwT > 0.35 && this.armed) {
        this.armed = false;
        this.stone = { t: 0, u0: ENGINE[0] + 9, u1: 330, v: ENGINE[1] };
        if (this.hd?.id === 'samurai') {
          // The ōzutsu's report: a cloud of white smoke from the muzzle.
          const mx = sx(ENGINE[0] + 9, ENGINE[1]);
          const my = sy(ENGINE[0] + 9, ENGINE[1], 4);
          for (let i = 0; i < 14; i++) this.emit(mx + this.rand.range(-2, 2), my + this.rand.range(-2, 1), 0, this.rand.range(4, 16), -this.rand.range(1, 6), this.rand.range(1.2, 2.6));
          for (let i = 0; i < 5; i++) this.emit(mx, my, 2, this.rand.range(6, 20), -this.rand.range(2, 10), 0.3);
        }
      }
    }
    if (this.stone) {
      this.stone.t += dt / 2.2;
      if (this.stone.t >= 1) {
        const s = this.stone;
        if (sx(s.u1, s.v) < WORLD_W) this.dust(s.u1, s.v, 8);
        this.stone = null;
      }
    }

    // Carpenters' sawdust and the smith's sparks.
    if (levels.workshop > 0 && m.night < 0.6 && this.rand.next() < dt * 3) this.emit(sx(190, 192), sy(190, 192, 4), 3, this.rand.range(-2, 2), 2, 1.2);

    // Crows fly over now and then.
    this.nextCrows -= dt;
    if (this.nextCrows <= 0) {
      // The necropolis is never without its crows.
      const undead = this.hd?.id === 'undead';
      this.nextCrows = undead ? this.rand.range(8, 20) : this.rand.range(25, 60);
      const n = (undead ? 4 : 2) + Math.floor(this.rand.next() * 4);
      const y = this.rand.range(30, 150);
      const left = this.rand.next() < 0.5;
      for (let i = 0; i < n; i++)
        this.crows.push({ x: left ? -10 - i * 9 - this.rand.range(0, 6) : WORLD_W + 10 + i * 9, y: y + this.rand.range(-8, 8), vx: (left ? 1 : -1) * this.rand.range(22, 30), ph: this.rand.range(0, 6) });
    }
    for (const c of this.crows) c.x += c.vx * dt;
    this.crows = this.crows.filter((c) => c.x > -80 && c.x < WORLD_W + 80);

    // Particles.
    let k = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.kind === 0 || p.kind === 4) {
        p.vx += (3.5 - p.vx) * dt * 0.5;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 2) {
        p.vy += 40 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= 0.96;
      }
      this.parts[k++] = p;
    }
    this.parts.length = k;

    // The army marching out.
    if (m.marching) this.marchS += dt * 9;
    else this.marchS = 0;
    for (let i = 0; i < this.fieldPos.length; i++) this.fieldPos[i] = (this.fieldPos[i]! + dt * (m.idle ? 0.25 : 0.6)) % 1000;
    void t;
  }

  archerCount(levels: Record<BuildingKey, number>): number {
    return levels.range > 0 ? Math.min(4, 1 + Math.floor(levels.range / 4)) : 0;
  }

  /** Fill the sorted pass with everything alive. */
  collect(out: Ent[], r: Draw): void {
    const levels = this.levels;
    if (!levels) return;
    const m = this.mood;
    const busy = (m.idle ? 0.55 : m.streak >= 3 ? 1 : 0.85) * (1 - 0.6 * m.night);
    r.night = m.night;
    for (const w of this.walkers) {
      if (w.hidden || (w.rank > busy && w.companion === 'none')) continue;
      w.d = w.u + w.v;
      out.push(w);
    }
    for (const b of this.beasts) {
      if (b.rank > busy + 0.2) continue;
      b.d = b.u + b.v;
      out.push(b);
    }
    const day = m.night < 0.65;
    const t = r.t;
    const st = r.st;
    const ent = (u: number, v: number, draw: (r: Draw) => void) => out.push({ d: u + v, draw });

    // The drilling block, or the column marching out.
    this.collectArmy(out);

    // Sparring at the pells by the Sergeants' Hall.
    const bt = tierOf(levels.barracks);
    if (bt > 0 && day) {
      const pairs = Math.min(3, bt) - (m.idle ? 1 : 0);
      for (let i = 0; i < Math.max(1, pairs); i++) {
        const v = 86 + i * 14;
        const ph = t * (m.idle ? 0.7 : 1.1) + i * 1.7;
        const step = Math.floor(ph * 2) % 4;
        ent(58, v, (r) => r.soldierFrame(U.HeavyInfantry, step === 0 ? Anim.Attack : step === 2 ? Anim.Hit : Anim.Idle, step === 0 ? Math.floor(ph * 8) % 2 : 0, 0, 58, v));
        ent(65, v, (r) => r.soldierFrame(i % 2 ? U.Spearmen : U.HeavyInfantry, step === 2 ? Anim.Attack : step === 0 ? Anim.Hit : Anim.Idle, step === 2 ? Math.floor(ph * 8) % 2 : 0, 2, 65, v));
      }
      // A pell, and a recruit hacking at it.
      ent(60, 128, (r) => {
        const x = r.k > 1 ? r.snap(sx(60, 128)) : Math.floor(sx(60, 128));
        const y = r.k > 1 ? r.snap(sy(60, 128)) : Math.floor(sy(60, 128));
        if (r.k > 1) {
          // HD: a post three art pixels wide, lit, mid and shaded, with a dark cap.
          r.rect(x - 0.5, y - 9, 0.5, 9, css(st.timber[0]));
          r.rect(x, y - 9, 0.5, 9, css(st.timber[1]));
          r.rect(x + 0.5, y - 9, 0.5, 9, css(st.timber[3]));
          r.rect(x - 0.5, y - 9.5, 1.5, 0.5, css(st.outline));
          return;
        }
        r.g.fillStyle = css(st.timber[1]);
        r.g.fillRect(x, y - 9, 2, 9);
        r.g.fillStyle = css(st.timber[3]);
        r.g.fillRect(x + 1, y - 9, 1, 9);
      });
      ent(56, 126, (r) => r.soldier(U.Spearmen, Math.floor(t * 1.5) % 3 === 0 ? Anim.Idle : Anim.Attack, t, 0, 56, 126));
    }

    // Archers at the mark.
    const archers = this.archerCount(levels);
    if (day)
      for (let i = 0; i < archers; i++) {
        const v = 42.5 + i * 7;
        const c = this.shotClock[i] ?? 0;
        const anim = c > 2.2 ? Anim.Shoot : Anim.Idle;
        ent(198, v, (r) => r.soldierFrame(i === 3 ? U.Crossbowmen : U.Archers, anim, c > 2.8 ? 1 : 0, 2, 198, v));
      }
    for (const a of this.arrows) {
      const p = this.arrowAt(a);
      ent(p[0], p[1], (r) => {
        const x = sx(p[0], p[1]);
        const y = sy(p[0], p[1], p[2]);
        r.line(x, y, x + 3, y + 1, '#d8ccb0');
        r.px(x, y, '#7a7a7a');
      });
    }
    for (const s of this.stuck) ent(s[0], s[1] + 0.1, (r) => {
      const x = Math.floor(sx(s[0], s[1]));
      const y = Math.floor(sy(s[0], s[1], s[2]));
      r.px(x, y, '#3a2a1a');
      r.px(x + 1, y, '#cfc3a6');
      r.px(x + 2, y + 1, '#e8e0cc');
    });

    // The smith at the forge.
    if (levels.barracks > 0) {
      const strike = Math.floor(t * 2.2) % 2;
      const smith = this.L.smith ? this.L.smith() : this.L.carpenter(2, 'hammer');
      ent(24, 136, (r) => r.figure(smith, 5 + strike, 0, 24, 136));
      if (strike && this.rand.next() < 0.3) this.emit(sx(26.5, 136), sy(26.5, 136, 4), 2, this.rand.range(-10, 10), -this.rand.range(10, 20), 0.35);
    }

    // Carpenters at the workshop, and the engine they build.
    const wt = tierOf(levels.workshop);
    if (wt > 0 && day) {
      ent(186, 190, (r) => this.drawFrame(r, 188, 192));
      ent(182, 188, (r) => r.figure(this.L.carpenter(0, 'hammer'), 5 + (Math.floor(t * 2.6) % 2), 0, 182, 188));
      if (wt >= 2 || !m.idle) ent(196, 194, (r) => r.figure(this.L.carpenter(1, 'saw'), 5 + (Math.floor(t * 4) % 2), 1, 196, 194));
      if (wt >= 3) ent(176, 194, (r) => r.figure(this.L.carpenter(2, 'none', 'plank'), 4, 0, 176, 194));
    }
    if (levels.workshop >= 3) ent(ENGINE[0], ENGINE[1], (r) => (this.hd?.id === 'samurai' ? this.drawCannon(r) : this.drawMangonel(r)));
    if (this.stone) {
      const s = this.stone;
      const u = s.u0 + (s.u1 - s.u0) * s.t;
      const z = 24 + 110 * s.t * (1 - s.t) - 24 * s.t;
      ent(u, s.v + 30, (r) => {
        if (r.k > 1) {
          r.shadow(u, s.v, 1.5);
          r.puff(sx(u, s.v), sy(u, s.v, z), 4, this.hd?.id === 'samurai' ? '#3a3632' : '#6a645c', '#2a2420');
          return;
        }
        r.g.fillStyle = 'rgba(20,14,8,0.3)';
        r.g.fillRect(Math.floor(sx(u, s.v)), Math.floor(sy(u, s.v)), 2, 1);
        r.g.fillStyle = '#4a4540';
        r.g.fillRect(Math.floor(sx(u, s.v)), Math.floor(sy(u, s.v, z)), 2, 2);
      });
    }

    // Reapers in the sown fields.
    if (day && levels.granary > 0) {
      const sown = Math.min(FIELDS.length, 1 + Math.floor(levels.granary / 3));
      for (let i = 0; i < Math.min(3, sown); i++) {
        const f = FIELDS[i]!;
        const w = f[2] - f[0] - 8;
        const along = this.fieldPos[i]! % (w * 2);
        const u = f[0] + 4 + (along < w ? along : 2 * w - along);
        const v = f[1] + 6 + (i * 13) % (f[3] - f[1] - 10);
        const dir: Dir = along < w ? 0 : 2;
        ent(u, v, (r) => r.figure(this.L.farmer(i, this.hd ? undefined : i === 2 ? 'dig' : 'scythe'), 5 + (Math.floor(t * 1.8 + i) % 2), dir, u, v));
      }
    }

    // A brother tending the herb garden.
    if (day && levels.hospital > 0) ent(160, 202, (r) => r.figure(this.L.infirmarer(), 5 + (Math.floor(t * 0.8) % 2), 1, 160, 202));

    // Horses in the paddock, a rider schooling one.
    const sl = levels.stables;
    if (sl > 0) {
      const n = Math.min(4, 1 + tierOf(sl));
      for (let i = 0; i < n; i++) {
        const u = PADDOCK[0] + 8 + ((i * 11) % 26);
        const v = PADDOCK[1] + 8 + ((i * 17) % 24);
        const cyc = (t * 0.3 + i * 1.3) % 6;
        const f = cyc < 3 ? 5 : cyc < 3.4 ? 6 : 4;
        ent(u, v, (r) => {
          if (!r.hdFolk) r.shadow(u, v, 10);
          r.horse(i, f, i % 2 ? 1 : 0, u, v);
        });
      }
      const cav = (m.army?.[U.LightCavalry] ?? 0) + (m.army?.[U.Knights] ?? 0) + (m.army?.[U.HorseArchers] ?? 0);
      if (cav > 0 && day) {
        const a = t * 0.5;
        const u = (PADDOCK[0] + PADDOCK[2]) / 2 + Math.cos(a) * 12;
        const v = (PADDOCK[1] + PADDOCK[3]) / 2 + Math.sin(a) * 11;
        const dir = dirOf(-Math.sin(a), Math.cos(a), 0);
        const kind = (m.army?.[U.Knights] ?? 0) > 0 ? U.Knights : U.LightCavalry;
        ent(u, v, (r) => r.soldier(kind, Anim.Walk, t, dir, u, v));
      }
      // Heads looking out of the stalls.
      this.anchors.stalls.forEach(([x, y], i) => {
        if (i % 2 && sl < 5) return;
        const toss = Math.floor(t * 0.7 + i * 2.3) % 7 === 0 ? -1 : 0;
        overlayStall.push([x, y + toss, i]);
      });
    }

    // Sentries on the walls.
    const wl = levels.walls;
    if (wl > 0) {
      const n = Math.min(4, 1 + Math.floor(wl / 5));
      for (let i = 0; i < n; i++) {
        const front = i % 2 === 0;
        const span = front ? (i === 0 ? [16, GATE_V - 20] : [GATE_V + 20, 214]) : [24, 200];
        const z = front ? this.wallFront : this.wallBack;
        const len = span[1]! - span[0]!;
        const bored = m.idle && i === 0;
        const ph = bored ? 0.3 : ((t * 5 + i * 37) % (len * 2)) / len;
        const along = ph < 1 ? ph : 2 - ph;
        const p = span[0]! + along * len;
        const [u, v] = front ? (i === 2 ? [p, WALL - 2.5] : [WALL - 2.5, p]) : i === 1 ? [p, 2.5] : [2.5, p];
        const fwd = ph < 1;
        const dir: Dir = bored ? 1 : front ? (i === 2 ? (fwd ? 0 : 2) : fwd ? 1 : 3) : i === 1 ? (fwd ? 0 : 2) : fwd ? 1 : 3;
        out.push({ d: u + v + (front ? 1 : -0.5), draw: (r) => r.soldier(i % 2 ? U.Crossbowmen : U.Spearmen, bored ? Anim.Idle : Anim.Walk, t, dir, u, v, z) });
      }
    }

    // The gate leaves.
    if (wl > 0) out.push({ d: WALL + GATE_V + 1, draw: (r) => this.drawGate(r) });

    // Festive bunting over the yard on a good streak.
    if (m.streak >= 3) out.push({ d: 250, draw: (r) => this.drawBunting(r) });
    void ent;
  }

  private collectArmy(out: Ent[]): void {
    const m = this.mood;
    const n = Math.min(60, m.recruits);
    if (n <= 0) return;
    // Kinds in proportion to today's army, foot only (riders school in the paddock).
    const foot = [U.HeavyInfantry, U.Spearmen, U.Skirmishers, U.Archers, U.Crossbowmen, U.Shock];
    const weights = foot.map((k) => Math.max(0, m.army?.[k] ?? (k <= U.Spearmen ? 1 : 0.5)));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const kinds: number[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n;
      let k = 0;
      acc = 0;
      for (; k < foot.length; k++) {
        acc += weights[k]! / sum;
        if (x <= acc) break;
      }
      kinds.push(foot[Math.min(k, foot.length - 1)]!);
    }
    const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 1.5))));
    if (m.marching && this.marchS > 0) {
      // In column of fours along the road to the gate and out.
      const pts: [number, number][] = (['yard', 'yardE', 'cross', 'gateIn', 'gateOut', 'bridge', 'out'] as Place[]).map((p) => NODES[p] as unknown as [number, number]);
      const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
      const at = (s: number): [number, number, number, number] => {
        for (let i = 0; i < lens.length; i++) {
          if (s <= lens[i]!) {
            const a = pts[i]!;
            const b = pts[i + 1]!;
            const f = s / lens[i]!;
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
          }
          s -= lens[i]!;
        }
        return [Infinity, 0, 1, 0];
      };
      const total = lens.reduce((a, b) => a + b, 0);
      for (let i = 0; i < n; i++) {
        const rank = Math.floor(i / 4);
        const file = i % 4;
        const s = this.marchS - rank * 6;
        if (s < 0) {
          // Still forming up in the yard.
          const [u, v] = NODES.yard;
          out.push({ d: u + v + file, draw: (r) => r.soldier(kinds[i]!, Anim.Idle, 0, 0, u - rank * 3 + file * 0.5, v + file * 5 - 7) });
          continue;
        }
        if (s > total) continue;
        const [u, v, du, dv] = at(s);
        const l = Math.hypot(du, dv) || 1;
        const pu = u + (-dv / l) * (file - 1.5) * 5;
        const pv = v + (du / l) * (file - 1.5) * 5;
        const dir = dirOf(du, dv, 0);
        out.push({ d: pu + pv, draw: (r) => r.soldier(kinds[i]!, Anim.Walk, r.t + i * 0.13, dir, pu, pv) });
        if (i % 4 === 0 && this.rand.next() < 0.02) this.dust(pu, pv, 1);
      }
      return;
    }
    // Drilling: the block marches up and down the yard along v, halting to turn.
    const rows = Math.ceil(n / cols);
    const cycle = 16;
    const ph = (this.drillT % cycle) / cycle;
    const leg = ph < 0.45 ? ph / 0.45 : ph < 0.5 ? 1 : ph < 0.95 ? 1 - (ph - 0.5) / 0.45 : 0;
    const moving = (ph < 0.45 || (ph >= 0.5 && ph < 0.95)) && !m.idle && m.night < 0.65;
    const fwd = ph < 0.5;
    const cu = 118;
    const cv = 82 + (m.idle ? 18 : leg * 36);
    const dir: Dir = fwd ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const rr = Math.floor(i / cols);
      // HD soldiers carry their banners and spears at full size: give them a pace more room.
      const sp = this.hd ? 8 : 5;
      const u = cu + (c - (cols - 1) / 2) * sp;
      const v = cv + (rr - (rows - 1) / 2) * sp;
      out.push({ d: u + v, draw: (r) => r.soldier(kinds[i]!, moving ? Anim.Walk : Anim.Idle, r.t + c * 0.05, moving ? dir : 1, u, v) });
      if (moving && rr === rows - 1 && this.rand.next() < 0.01) this.dust(u, v, 1);
    }
    // The drill sergeant walks beside them, barking.
    const su = cu - ((cols - 1) / 2) * (this.hd ? 8 : 5) - 9;
    const sv = cv + (moving ? 4 : 0);
    out.push({ d: su + sv, draw: (r) => r.soldier(U.HeavyInfantry, moving ? Anim.Walk : Math.floor(r.t) % 3 === 0 ? Anim.Attack : Anim.Idle, r.t, moving ? dir : 0, su, sv) });
  }
  drillT = 0;

  private arrowAt(a: { from: [number, number, number]; to: [number, number, number]; t: number }): [number, number, number] {
    const t = a.t;
    return [a.from[0] + (a.to[0] - a.from[0]) * t, a.from[1] + (a.to[1] - a.from[1]) * t, a.from[2] + (a.to[2] - a.from[2]) * t + 6 * t * (1 - t)];
  }

  /** The half-built engine the carpenters work on: a frame of beams. */
  private drawFrame(r: Draw, u: number, v: number): void {
    const c = css(r.st.timber[0]);
    const d = css(r.st.timber[2]);
    const P = (du: number, dv: number, z: number): [number, number] => [sx(u + du, v + dv), sy(u + du, v + dv, z)];
    const L = (a: [number, number], b: [number, number], col: string) => r.line(a[0], a[1], b[0], b[1], col);
    L(P(-6, -2, 1), P(6, -2, 1), c);
    L(P(-6, 2, 1), P(6, 2, 1), d);
    L(P(0, -2, 1), P(0, -2, 8), c);
    L(P(0, 2, 1), P(0, 2, 8), d);
    L(P(0, -2, 8), P(0, 2, 8), c);
    // A trestle with a log on it.
    L(P(-4, 6, 0), P(-4, 6, 3), d);
    L(P(4, 6, 0), P(4, 6, 3), d);
    L(P(-6, 6, 3), P(6, 6, 3), c);
  }

  /**
   * The engine by the workshop: a traction trebuchet as in the Maciejowski Bible. The crew haul
   * the short arm down on their ropes, the long arm whips up and the sling lets go; then it settles.
   */
  private drawMangonel(r: Draw): void {
    const [u, v] = ENGINE;
    const tt = this.throwT;
    const pz = 13;
    // Long arm angle in the u-z plane: resting back and down, thrown forward and up.
    const rest = Math.PI + 0.75;
    const thrown = 0.85;
    const a = tt < 0.4 ? rest + (thrown + Math.PI * 2 - rest) * (tt / 0.4) : tt < 1.2 ? thrown : tt < 5 ? thrown + (rest - Math.PI * 2 - thrown) * ((tt - 1.2) / 3.8) : rest;
    const wood = css(r.st.timber[1]);
    const light = css(r.st.timber[0]);
    const dark = css(r.st.timber[3]);
    const P = (du: number, dv: number, z: number): [number, number] => [sx(u + du, v + dv), sy(u + du, v + dv, z)];
    const L = (p: [number, number], q: [number, number], c: string) => r.line(p[0], p[1], q[0], q[1], c);
    const B = (p: [number, number], q: [number, number], c: string) => r.beam(p[0], p[1], q[0], q[1], c);
    // The trestle: two A-frames on a sill, the far one first.
    L(P(-5, -3, 0), P(5, -3, 0), dark);
    for (const dv of [-3, 3]) {
      const c = dv < 0 ? dark : wood;
      B(P(-4, dv, 0), P(0, dv, pz), c);
      B(P(4, dv, 0), P(0, dv, pz), c);
    }
    B(P(-5, 3, 0), P(5, 3, 0), wood);
    // The beam, its sling and stone.
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const long: [number, number] = P(ca * 14, 0, pz + sa * 14);
    const short: [number, number] = P(-ca * 5, 0, pz - sa * 5);
    B(short, long, light);
    if (r.k > 1) r.puff(P(0, 0, pz)[0], P(0, 0, pz)[1], 3, dark, '#140f0b');
    else {
      r.g.fillStyle = dark;
      r.g.fillRect(Math.floor(P(0, 0, pz)[0]) - 1, Math.floor(P(0, 0, pz)[1]) - 1, 3, 3);
    }
    const loaded = tt > 5 || tt < 0.35;
    const sling: [number, number] = loaded ? P(ca * 14 - 1, 0, Math.max(1, pz + sa * 14 - 4)) : [long[0] + 2, long[1] + 3];
    r.line(long[0], long[1], sling[0], sling[1], '#d8ccb0');
    if (loaded && r.k > 1) {
      // HD: the sling's pouch and its load, a round stone (or, for the dead, a bundled corpse).
      r.puff(sling[0], sling[1] + 1, 5, this.hd?.id === 'undead' ? '#b8b09a' : '#7a746a', '#2a2420');
    } else if (loaded) {
      r.g.fillStyle = '#140f0b';
      r.g.fillRect(Math.floor(sling[0]) - 2, Math.floor(sling[1]) - 1, 4, 4);
      r.g.fillStyle = '#6a645c';
      r.g.fillRect(Math.floor(sling[0]) - 1, Math.floor(sling[1]), 2, 2);
    }
    // The crew on the ropes, hauling while the arm comes up.
    const hauling = tt < 0.5;
    for (let k = 0; k < 2; k++) {
      const cu = u + 7 + k * 3;
      const cv = v - 2 + k * 4;
      const hand: [number, number] = [sx(cu, cv), sy(cu, cv, hauling ? 4 : 8)];
      r.line(short[0], short[1], hand[0], hand[1], '#8a7a58');
      r.figure(this.L.carpenter(k, 'dig'), hauling ? 6 : 5, 1, cu, cv);
    }
  }

  /**
   * The Samurai workshop's piece: an ōzutsu, a bronze bombard bound to a timber sled, its crew
   * ramming and touching off. It kicks back when it fires and is run forward again.
   */
  private drawCannon(r: Draw): void {
    const [u, v] = ENGINE;
    const tt = this.throwT;
    const kick = tt < 0.35 ? 0 : tt < 0.8 ? -2.5 : tt < 3 ? -2.5 * (1 - (tt - 0.8) / 2.2) : 0;
    const P = (du: number, dv: number, z: number): [number, number] => [sx(u + du + kick, v + dv), sy(u + du + kick, v + dv, z)];
    const B = (p: [number, number], q: [number, number], c: string) => r.beam(p[0], p[1], q[0], q[1], c);
    const wood = css(r.st.timber[1]);
    const dark = css(r.st.timber[2]);
    // The sled and its cross-pieces.
    B(P(-6, -2.5, 0.5), P(6, -2.5, 0.5), dark);
    B(P(-6, 2.5, 0.5), P(6, 2.5, 0.5), wood);
    B(P(-4, -2.5, 1), P(-4, 2.5, 1), wood);
    B(P(4, -2.5, 1), P(4, 2.5, 1), wood);
    // The barrel: bronze, ringed with reinforcing bands, the muzzle swelling.
    const bronze = '#a57e3c';
    const bronzeL = '#d2a85a';
    const bronzeS = '#6a4c24';
    for (let k = 0; k <= 26; k++) {
      const f = k / 26;
      const [x, y] = P(-5 + f * 13, 0, 3.4 + f * 0.8);
      const band = k % 6 === 0 || k >= 24;
      r.g.fillStyle = '#20160e';
      r.g.fillRect(r.snap(x) - 1, r.snap(y) - 1.5, 2, 3);
      r.g.fillStyle = band ? bronzeS : bronze;
      r.g.fillRect(r.snap(x) - 0.5, r.snap(y) - 1, 1, 2);
      r.g.fillStyle = band ? bronze : bronzeL;
      r.g.fillRect(r.snap(x) - 0.5, r.snap(y) - 1, 1, 0.5);
    }
    const [mx, my] = P(8.2, 0, 4.2);
    r.g.fillStyle = '#100a06';
    r.g.fillRect(r.snap(mx), r.snap(my) - 0.5, 0.5, 1);
    if (tt < 0.5) {
      // Muzzle flash.
      r.g.fillStyle = tt < 0.42 ? '#fff0b0' : '#ff9a3a';
      r.g.fillRect(r.snap(mx) + 0.5, r.snap(my) - 1.5, 2.5, 3);
    }
    // The crew: a loader with a rammer, a gunner with the slow-match.
    const cu = u - 7;
    r.figure(this.L.carpenter(2, 'none', 'staff'), 4, 0, cu, v - 3);
    r.figure(this.L.sergeant('none'), tt < 0.5 ? 6 : 4, 0, cu + 1, v + 4);
  }

  private drawGate(r: Draw): void {
    const g0 = GATE_V - 9;
    const g1 = GATE_V + 9;
    const h = this.wallFront + 2;
    const open = this.gate;
    const u = WALL - 2;
    const k = r.k;
    if (k > 1) {
      // HD: the leaves column by art pixel: planks, two iron bands, nail heads, a dark passage.
      const q = 1 / k;
      const col = (va: number, vb: number, fill: (x: number, y: number, i: number) => void) => {
        const xa = sx(u, va);
        const xb = sx(u, vb);
        let i = 0;
        for (let x = r.snap(Math.min(xa, xb)); x <= Math.max(xa, xb); x += q, i++) {
          const vv = u - (x - 256);
          fill(x, r.snap(sy(u, vv)), i);
        }
      };
      if (open > 0.05) col(g1, g0, (x, y) => r.rect(x, y - h, q, h, 'rgba(12,8,5,0.55)'));
      const half = (g1 - g0) / 2;
      const w = half * (1 - open * 0.85);
      const leafHd = (va: number, vb: number) =>
        col(va, vb, (x, y, i) => {
          r.rect(x, y - h, q, h, i % 5 === 0 ? css(r.st.timber[3]) : i % 5 === 1 ? css(r.st.timber[1]) : css(r.st.timber[2]));
          r.rect(x, y - h + 2, q, q, css(r.st.outline));
          r.rect(x, y - 3, q, q, css(r.st.outline));
          if (i % 4 === 2) {
            r.rect(x, y - h + 2 - q, q, q, '#8a8478');
            r.rect(x, y - 3 - q, q, q, '#8a8478');
          }
        });
      leafHd(g0, g0 + w);
      leafHd(g1 - w, g1);
      return;
    }
    const leaf = (va: number, vb: number) => {
      const xa = Math.floor(sx(u, va));
      const xb = Math.floor(sx(u, vb));
      for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
        const vv = u - (x - 256) ;
        const y = Math.floor(sy(u, vv));
        r.g.fillStyle = x % 3 === 0 ? css(r.st.timber[3]) : css(r.st.timber[2]);
        r.g.fillRect(x, y - h, 1, h);
        r.g.fillStyle = css(r.st.outline);
        r.g.fillRect(x, y - h + 2, 1, 1);
        r.g.fillRect(x, y - 3, 1, 1);
      }
    };
    // The dark of the passage when open.
    if (open > 0.05) {
      for (let x = Math.floor(sx(u, g1)); x <= Math.floor(sx(u, g0)); x++) {
        const vv = u - (x - 256);
        r.g.fillStyle = 'rgba(12,8,5,0.55)';
        r.g.fillRect(x, Math.floor(sy(u, vv)) - h, 1, h);
      }
    }
    const half = (g1 - g0) / 2;
    const w = half * (1 - open * 0.85);
    leaf(g0, g0 + w);
    leaf(g1 - w, g1);
  }

  private drawBunting(r: Draw): void {
    const cols = [css(r.st.bannerField), css(r.st.bannerCharge), css(r.st.team)];
    const lines: [number, number, number, number][] = [
      [62, 64, 150, 64],
      [56, 150, 150, 150],
      [150, 64, 150, 150],
    ];
    const t = r.t;
    for (const [u0, v0, u1, v1] of lines) {
      const x0 = sx(u0, v0);
      const y0 = sy(u0, v0, 18);
      const x1 = sx(u1, v1);
      const y1 = sy(u1, v1, 18);
      if (r.k > 1) {
        // HD: poles one art pixel wide, the cord sagging, little triangular pennants that flutter.
        const q = 1 / r.k;
        r.rect(x0, y0, q, 18, css(r.st.timber[2]));
        r.rect(x1, y1, q, 18, css(r.st.timber[2]));
        const m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * r.k);
        for (let i = 0; i <= m; i++) {
          const f = i / m;
          r.px(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * 6, '#3a2a1a');
        }
        const n2 = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
        for (let i = 0; i < n2; i++) {
          const f = (i + 0.5) / n2;
          const x = x0 + (x1 - x0) * f;
          const y = y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * 6;
          const c = cols[i % 3]!;
          const sw = Math.round(Math.sin(t * 3 + i) * 1.2) * q;
          r.rect(x - q, y + q, 3 * q, q, c);
          r.rect(x - q + (sw > 0 ? q : 0), y + 2 * q, 2 * q, q, c);
          r.rect(x + sw, y + 3 * q, q, q, c);
        }
        continue;
      }
      // Poles.
      r.g.fillStyle = css(r.st.timber[2]);
      r.g.fillRect(Math.floor(x0), Math.floor(y0), 1, 18);
      r.g.fillRect(Math.floor(x1), Math.floor(y1), 1, 18);
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const sag = Math.sin(f * Math.PI) * 6;
        const x = x0 + (x1 - x0) * f;
        const y = y0 + (y1 - y0) * f + sag;
        r.px(x, y, '#3a2a1a');
        if (i % 1 === 0 && i < n) {
          const c = cols[i % 3]!;
          const sw = Math.round(Math.sin(t * 3 + i) * 0.6);
          r.g.fillStyle = c;
          r.g.fillRect(Math.floor(x) + 1, Math.floor(y) + 1, 2, 1);
          r.g.fillRect(Math.floor(x) + 1 + sw, Math.floor(y) + 2, 1, 1);
        }
      }
    }
  }

  /** Things drawn over the sorted pass: smoke, sparks, dust, crows, stall heads, bells. */
  overlay(r: Draw): void {
    const g = r.g;
    const m = this.mood;
    const hd = r.k > 1;
    const q = 1 / r.k;
    for (const p of this.parts) {
      const f = p.age / p.life;
      if (hd) {
        // HD: smoke as round two-tone puffs that grow and thin; dust likewise, smaller; sparks
        // and sawdust single art pixels.
        if (p.kind === 0 || p.kind === 4) {
          g.globalAlpha = (m.idle ? 0.3 : 0.55) * (1 - f) * (f < 0.1 ? f * 10 : 1);
          r.puff(p.x, p.y, 2 + f * 8, f < 0.35 ? '#b4aea4' : '#9a948a', f < 0.35 ? '#8c867c' : '#78726a');
        } else if (p.kind === 1) {
          g.globalAlpha = 0.45 * (1 - f);
          r.puff(p.x, p.y, 1 + f * 4, '#b49e7a', '#8e7a5a');
        } else {
          g.globalAlpha = p.kind === 2 ? 1 - f : 0.8 * (1 - f);
          r.rect(p.x, p.y, q, q, p.kind === 2 ? (f < 0.5 ? '#ffd27a' : '#e0702a') : '#e0cc9a');
        }
        continue;
      }
      if (p.kind === 0 || p.kind === 4) {
        const s = 1 + Math.floor(f * 3.5);
        g.globalAlpha = (m.idle ? 0.3 : 0.5) * (1 - f) * (f < 0.1 ? f * 10 : 1);
        g.fillStyle = f < 0.3 ? '#9a948a' : '#827c74';
        g.fillRect(Math.floor(p.x - s / 2), Math.floor(p.y - s / 2), s, s);
      } else if (p.kind === 1) {
        const s = 1 + Math.floor(f * 2);
        g.globalAlpha = 0.45 * (1 - f);
        g.fillStyle = '#a08a68';
        g.fillRect(Math.floor(p.x), Math.floor(p.y), s, s);
      } else if (p.kind === 2) {
        g.globalAlpha = 1 - f;
        g.fillStyle = f < 0.5 ? '#ffd27a' : '#e0702a';
        g.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
      } else {
        g.globalAlpha = 0.8 * (1 - f);
        g.fillStyle = '#e0cc9a';
        g.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
      }
    }
    g.globalAlpha = 1;
    // Horses' heads at the stall doors.
    for (const [x, y, i] of overlayStall) {
      const coat = ['#6e4a2c', '#3a2e26', '#8f8577', '#9a6a3a'][i % 4]!;
      if (hd) {
        // HD: a head looking out: forelock, an eye, the muzzle darker, an ear.
        const bone = this.hd?.id === 'undead';
        const c = bone ? '#cfc6aa' : coat;
        r.rect(x - 1, y - 1, 2, 3, c);
        r.rect(x + 1, y, q * 2, 2, c);
        r.rect(x + 1, y + 1.5, q * 2, q, bone ? '#3a3632' : '#1a1410');
        r.rect(x - 1, y - 1.5, q * 2, q, '#1a1410');
        r.rect(x, y - q, q, q, bone ? this.hd!.id === 'undead' ? '#86f070' : '#1a1410' : '#1a1410');
        r.rect(x - 1, y - 1, q, 3, 'rgba(255,255,255,0.12)');
        continue;
      }
      g.fillStyle = coat;
      g.fillRect(x - 1, y - 1, 2, 3);
      g.fillRect(x + 1, y, 1, 2);
      g.fillStyle = '#1a1410';
      g.fillRect(x + 1, y + 2, 1, 1);
      g.fillRect(x - 1, y - 2, 1, 1);
    }
    overlayStall.length = 0;
    // Bells swing while they ring.
    for (const [x, y] of this.anchors.bells) {
      const ringing = this.bellT < 6;
      const sw = ringing ? Math.round(Math.sin(this.bellT * 7) * 1.4) : 0;
      if (hd) {
        // HD: a bronze bell with a lit shoulder, a dark mouth and a clapper.
        const s2 = ringing ? Math.round(Math.sin(this.bellT * 7) * 2.6) * q : 0;
        r.rect(x - q + s2, y - q, 3 * q, q, '#c9a44c');
        r.rect(x - 2 * q + s2, y, 5 * q, 2 * q, '#b08a3a');
        r.rect(x - 2 * q + s2, y, q, 2 * q, '#d8b860');
        r.rect(x - 3 * q + s2, y + 2 * q, 7 * q, q, '#6a4e1c');
        r.rect(x + s2 - (s2 > 0 ? q : 0), y + 3 * q, q, q, '#3a2a10');
        if (ringing && Math.floor((this.bellT * 7) / Math.PI) % 2 === 0) {
          r.rect(x - 4, y - 0.5, q, q, 'rgba(255,240,200,0.5)');
          r.rect(x + 4, y - 0.5, q, q, 'rgba(255,240,200,0.5)');
        }
        continue;
      }
      g.fillStyle = '#b08a3a';
      g.fillRect(x - 1 + sw, y, 3, 2);
      g.fillRect(x + sw, y - 1, 1, 1);
      g.fillStyle = '#6a4e1c';
      g.fillRect(x - 1 + sw, y + 2, 3, 1);
      if (ringing && Math.floor(this.bellT * 7 / Math.PI) % 2 === 0) {
        g.fillStyle = 'rgba(255,240,200,0.5)';
        g.fillRect(x - 4, y - 1, 1, 1);
        g.fillRect(x + 4, y - 1, 1, 1);
      }
    }
    // Crows.
    for (const c of this.crows) {
      const f = Math.floor(r.t * 6 + c.ph) % 2;
      const y = c.y + Math.sin(r.t * 2 + c.ph) * 2;
      r.crow(r.hdFolk ? Math.floor(r.t * 9 + c.ph) % 4 : f, c.vx > 0 ? 0 : 1, Math.floor(c.x), Math.floor(y));
      // Their shadow on the ground, far below.
      g.fillStyle = 'rgba(20,14,8,0.15)';
      g.fillRect(Math.floor(c.x) + 8, Math.floor(y) + 40, 3, hd ? q : 1);
    }
    void m;
  }
}

/** The commandery's people (people.ts), as a Looks. */
function classicLooks(st: CityStyle | null): Looks {
  const s = st!;
  return {
    villager: (seed, carry) => villagerLook(seed, carry),
    monk: (carry, work) => monkLook(s, carry, work),
    chaplain: () => chaplainLook(s),
    infirmarer: (work, carry) => infirmarerLook(s, work, carry),
    farmer: (seed, work) => farmerLook(seed, work),
    carpenter: (seed, work, carry) => carpenterLook(seed, work, carry),
    sergeant: (carry) => sergeantLook(s, carry),
    squire: () => squireLook(s),
  };
}

/** Where the workshop tries its engine: clear ground between the yard and the workshop. */
const ENGINE: [number, number] = [158, 166];

const overlayStall: [number, number, number][] = [];
/** HD sheets as canvases, made once per sheet. */
const sheetCanvas = new WeakMap<object, HTMLCanvasElement>();
void UNIT_COUNT;
