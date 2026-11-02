// Draws a running Battle: the field at its native 640×360, then blown up with whole-number
// pixels into the page canvas, and finished with a grade, a vignette and film grain.

import { Battle, FIELD_H, FIELD_W, State, TICK_S, type Projectile } from '../../game/battle.ts';
import { Rng } from '../../game/rng.ts';
import { U } from '../../game/units.ts';
import { paintGround, stampArrow, stampBlood, stampCrater } from './ground.ts';
import { Post } from './post.ts';
import { buildAtlas, CELL_H, CELL_W, COMMANDER, FOOT_X, FOOT_Y, Frame, hsl, type Atlas } from './sprites.ts';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  /** Smoke and dust drift and grow; blood falls. */
  kind: 'blood' | 'dust' | 'smoke' | 'spark';
}

export interface Camera {
  /** Whole-number zoom over the fitted scale: 1 shows the whole field. */
  zoom: number;
  /** World point at the centre of the view. */
  cx: number;
  cy: number;
}

export class BattleScene {
  readonly ground: HTMLCanvasElement;
  readonly frame: HTMLCanvasElement;
  private readonly gctx: CanvasRenderingContext2D;
  private readonly fctx: CanvasRenderingContext2D;
  private readonly atlases: [Atlas, Atlas];
  private readonly post = new Post();
  private readonly rng = new Rng(7);
  private prevX: Float32Array;
  private prevY: Float32Array;
  private prevHp: Float32Array;
  private stamped: Uint8Array;
  private flying = new Set<Projectile>();
  private particles: Particle[] = [];
  private order: number[] = [];
  camera: Camera = { zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2 };
  scanlines = true;

  constructor(readonly battle: Battle) {
    this.ground = paintGround(battle.setup.seed);
    this.gctx = this.ground.getContext('2d')!;
    this.frame = document.createElement('canvas');
    this.frame.width = FIELD_W;
    this.frame.height = FIELD_H;
    this.fctx = this.frame.getContext('2d')!;
    const [a, b] = battle.setup.armies;
    this.atlases = [buildAtlas(a.faction, a.hue), buildAtlas(b.faction, b.hue)];
    const n = battle.soldiers.length;
    this.prevX = new Float32Array(n);
    this.prevY = new Float32Array(n);
    this.prevHp = new Float32Array(n);
    this.stamped = new Uint8Array(n);
    this.snapshot();
    this.paintStakes();
  }

  /** Call before each battle.step(), so drawing can interpolate between ticks. */
  snapshot(): void {
    const ss = this.battle.soldiers;
    for (let i = 0; i < ss.length; i++) {
      this.prevX[i] = ss[i]!.x;
      this.prevY[i] = ss[i]!.y;
      this.prevHp[i] = ss[i]!.hp;
    }
  }

  /** Call after each battle.step(): stamps the fallen, spawns blood and dust, sees stones land. */
  afterStep(): void {
    const b = this.battle;
    const ss = b.soldiers;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.hp < this.prevHp[i]! && s.state !== State.Fled) {
        const n = s.state === State.Dead ? 5 : 2;
        for (let k = 0; k < n; k++) this.spawn({ x: s.x, y: s.y, z: s.s.mounted ? 9 : 6, vx: (this.rng.next() - 0.5) * 20, vy: (this.rng.next() - 0.5) * 8, vz: 10 + this.rng.next() * 18, life: 0, max: 0.6, color: k % 2 ? '#7a1212' : '#9c1a16', size: 1, kind: 'blood' });
      }
      if (s.state === State.Dead && !this.stamped[i]) {
        this.stamped[i] = 1;
        const team = s.team;
        const atlas = this.atlases[team]!;
        stampBlood(this.gctx, s.x, s.y, this.rng, s.s.mounted ? 1.8 : 1);
        const [sx, sy] = atlas.at(s.commander ? COMMANDER : s.cls, Frame.Dead, team === 1);
        this.gctx.drawImage(atlas.canvas, sx, sy, CELL_W, CELL_H, Math.round(s.x) - FOOT_X, Math.round(s.y) - FOOT_Y + 2, CELL_W, CELL_H);
      }
      // Hooves kick up dust.
      if (s.s.mounted && s.state !== State.Dead && s.state !== State.Fled && (s.vx * s.vx + s.vy * s.vy) > 900 && this.rng.next() < 0.25) {
        this.spawn({ x: s.x - Math.sign(s.vx) * 4, y: s.y, z: 1, vx: -s.vx * 0.1, vy: (this.rng.next() - 0.5) * 4, vz: 3, life: 0, max: 1.2, color: '#8b7d5c', size: 2, kind: 'dust' });
      }
    }
    // Missiles that came down this tick.
    const now = new Set(b.projectiles);
    for (const p of this.flying) {
      if (now.has(p)) continue;
      if (p.splash > 0) {
        stampCrater(this.gctx, p.x1, p.y1, this.rng);
        for (let k = 0; k < 10; k++) this.spawn({ x: p.x1, y: p.y1, z: 1, vx: (this.rng.next() - 0.5) * 30, vy: (this.rng.next() - 0.5) * 12, vz: 8 + this.rng.next() * 14, life: 0, max: 1.6 + this.rng.next(), color: k % 3 ? '#6f6656' : '#4a4338', size: 2 + (k % 2), kind: 'smoke' });
      } else if (this.rng.next() < 0.15) stampArrow(this.gctx, p.x1, p.y1, p.x1 < p.x0);
    }
    this.flying = now;
  }

  private spawn(p: Particle): void {
    if (this.particles.length > 1500) return;
    this.particles.push(p);
  }

  private paintStakes(): void {
    const g = this.gctx;
    for (const k of this.battle.stakes) {
      const dir = k.team === 0 ? 1 : -1;
      for (let y = k.y0; y <= k.y1; y += 3) {
        g.fillStyle = '#4e3420';
        g.fillRect(Math.round(k.x), Math.round(y), 1, 1);
        g.fillStyle = '#7a5634';
        g.fillRect(Math.round(k.x + dir), Math.round(y) - 1, 1, 1);
        g.fillRect(Math.round(k.x + 2 * dir), Math.round(y) - 2, 1, 1);
      }
    }
  }

  /** Draws the field into `this.frame` at tick + alpha. */
  private compose(alpha: number, dt: number): void {
    const b = this.battle;
    const ctx = this.fctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.ground, 0, 0);
    const ss = b.soldiers;
    const tick = b.tick;

    // Shadows first, under everyone.
    ctx.fillStyle = 'rgba(10,8,5,0.35)';
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]!;
      if (s.state === State.Dead || s.state === State.Fled) continue;
      order.push(i);
      const x = Math.round(this.prevX[i]! + (s.x - this.prevX[i]!) * alpha);
      const y = Math.round(this.prevY[i]! + (s.y - this.prevY[i]!) * alpha);
      ctx.fillRect(x - (s.s.mounted ? 6 : 3), y, s.s.mounted ? 13 : 6, 1);
    }
    // Back to front.
    order.sort((a, c) => ss[a]!.y - ss[c]!.y || a - c);
    for (const i of order) {
      const s = ss[i]!;
      const atlas = this.atlases[s.team]!;
      const x = Math.round(this.prevX[i]! + (s.x - this.prevX[i]!) * alpha);
      const y = Math.round(this.prevY[i]! + (s.y - this.prevY[i]!) * alpha);
      const moving = s.vx * s.vx + s.vy * s.vy > 9;
      let frame: number = Frame.Idle;
      if (s.state === State.Routing) frame = (tick + i) % 4 < 2 ? Frame.Rout : Frame.Idle;
      else if (tick - s.actedAt < 4) frame = Frame.Attack;
      else if (moving) frame = (Math.floor((tick + i) / 2) % 2) === 0 ? Frame.Walk : Frame.Idle;
      const reg = b.regiments[s.reg]!;
      // Face the enemy, or the way they run.
      const left = s.state === State.Routing ? s.team === 0 : Math.abs(s.vx) > 6 && s.target < 0 ? s.vx < 0 : reg.fx < 0;
      const [sx, sy] = atlas.at(s.commander ? COMMANDER : s.cls, frame, left);
      ctx.drawImage(atlas.canvas, sx, sy, CELL_W, CELL_H, x - FOOT_X, y - FOOT_Y, CELL_W, CELL_H);
    }

    // Standards over each regiment still in the fight.
    for (const r of b.regiments) {
      if (r.alive === 0 || r.routed || r.role === 'siege' || r.role === 'skirmish') continue;
      const army = b.setup.armies[r.team]!;
      const x = Math.round(r.cx);
      const y = Math.round(r.cy) - (r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' || r.role === 'command' ? 22 : 15);
      ctx.fillStyle = '#2a1d12';
      ctx.fillRect(x, y, 1, 12);
      const wave = (tick >> 2) % 2;
      const dir = r.team === 0 ? 1 : -1;
      const fx = dir > 0 ? x + 1 : x - 6;
      ctx.fillStyle = r.role === 'command' ? '#e8e2d2' : hsl(army.hue, 55, 36);
      ctx.fillRect(fx, y, 6, 4);
      ctx.fillRect(dir > 0 ? fx + 5 + wave : fx - wave, y + 1, 1, 3);
      ctx.fillStyle = r.role === 'command' ? '#9c1c1c' : '#e8e2d2';
      ctx.fillRect(fx + 2, y, 1, 4);
      ctx.fillRect(fx, y + 1, 6, 1);
    }

    // Missiles in flight: an arc, with a shadow on the ground.
    for (const p of b.projectiles) {
      const span = p.lands - p.born;
      const t = Math.min(1, Math.max(0, (tick - p.born + alpha) / span));
      const gx = p.x0 + (p.x1 - p.x0) * t;
      const gy = p.y0 + (p.y1 - p.y0) * t;
      const dist = Math.sqrt((p.x1 - p.x0) ** 2 + (p.y1 - p.y0) ** 2);
      const flat = p.cls === U.Crossbowmen || p.cls === U.Skirmishers;
      const h = dist * (flat ? 0.08 : p.splash > 0 ? 0.45 : 0.28);
      const z = 4 * h * t * (1 - t) + (1 - t) * 8;
      const x = Math.round(gx);
      const y = Math.round(gy - z);
      ctx.fillStyle = 'rgba(10,8,5,0.3)';
      ctx.fillRect(x, Math.round(gy), 1, 1);
      if (p.splash > 0) {
        ctx.fillStyle = '#3f3a33';
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = '#6c665b';
        ctx.fillRect(x - 1, y - 1, 1, 1);
      } else {
        // Point the shaft along its path: velocity of the arc at t.
        const vx = (p.x1 - p.x0) / span;
        const vy = (p.y1 - p.y0) / span - (4 * h * (1 - 2 * t)) / span;
        const n = Math.sqrt(vx * vx + vy * vy) || 1;
        const len = p.cls === U.Skirmishers ? 4 : 3;
        ctx.fillStyle = p.cls === U.Skirmishers ? '#6b4c2c' : '#cfc6b0';
        for (let k = 0; k < len; k++) ctx.fillRect(Math.round(x - (vx / n) * k), Math.round(y - (vy / n) * k), 1, 1);
      }
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
      if (p.kind === 'blood') {
        p.vz -= 70 * dt;
        if (p.z <= 0) {
          this.gctx.fillStyle = '#5a0d0d';
          this.gctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          continue;
        }
      } else {
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.vz *= 0.9;
      }
      const fade = 1 - p.life / p.max;
      ctx.globalAlpha = p.kind === 'blood' ? 1 : 0.55 * fade;
      ctx.fillStyle = p.color;
      const size = p.kind === 'smoke' ? Math.round(p.size + p.life * 3) : p.size;
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - p.z - size / 2), size, size);
      ps[w++] = p;
    }
    ps.length = w;
    ctx.globalAlpha = 1;
  }

  /** Paints the battle onto `out` (any size), fitting the field with whole-number pixels. */
  draw(out: HTMLCanvasElement, alpha: number, dt: number): void {
    this.compose(alpha, dt);
    const ctx = out.getContext('2d')!;
    const W = out.width;
    const H = out.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0907';
    ctx.fillRect(0, 0, W, H);
    const fit = Math.min(W / FIELD_W, H / FIELD_H);
    const px = Math.max(1, fit * this.camera.zoom >= 1 ? Math.floor(fit * this.camera.zoom) : fit * this.camera.zoom);
    const vw = Math.min(FIELD_W, W / px);
    const vh = Math.min(FIELD_H, H / px);
    const cx = Math.max(vw / 2, Math.min(FIELD_W - vw / 2, this.camera.cx));
    const cy = Math.max(vh / 2, Math.min(FIELD_H - vh / 2, this.camera.cy));
    this.camera.cx = cx;
    this.camera.cy = cy;
    const sx = Math.round(cx - vw / 2);
    const sy = Math.round(cy - vh / 2);
    const dw = Math.round(vw * px);
    const dh = Math.round(vh * px);
    const dx = Math.round((W - dw) / 2);
    const dy = Math.round((H - dh) / 2);
    ctx.drawImage(this.frame, sx, sy, Math.round(vw), Math.round(vh), dx, dy, dw, dh);
    this.post.apply(ctx, dx, dy, dw, dh, px, this.scanlines);
  }

  /** Field coordinates under a point of `out`. */
  toWorld(out: HTMLCanvasElement, x: number, y: number): [number, number] {
    const fit = Math.min(out.width / FIELD_W, out.height / FIELD_H);
    const px = Math.max(1, Math.floor(fit * this.camera.zoom));
    return [this.camera.cx + (x - out.width / 2) / px, this.camera.cy + (y - out.height / 2) / px];
  }
}

export const SECONDS_PER_TICK = TICK_S;
