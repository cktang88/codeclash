import { Container, Sprite, Text, type Texture } from 'pixi.js';
import type { Kind } from '../../sim/api.ts';
import { CELL, FEET_Y, type Textures } from './textures.ts';

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  /** Height above ground and its velocity, for arcs that fall. */
  z: number;
  vz: number;
  gravity: number;
  drag: number;
  age: number;
  life: number;
  scale0: number;
  scale1: number;
  alpha0: number;
  spin: number;
  fadeIn: number;
}

export interface Burst {
  x: number;
  y: number;
  count: number;
  texture?: 'soft' | 'spark' | 'smoke' | 'ember';
  tint: number;
  speed: number;
  life: number;
  size: number;
  grow?: number;
  alpha?: number;
  rise?: number;
  gravity?: number;
  spread?: number;
  additive?: boolean;
}

interface Arrow {
  s: Sprite;
  shadow: Sprite | null;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  t0: number;
  t1: number;
  height: number;
  stuck: number;
  bolt: boolean;
}

interface Corpse {
  s: Sprite;
  age: number;
  fall: number;
}

interface Decal {
  s: Sprite;
  age: number;
}

interface Ring {
  s: Sprite;
  age: number;
  life: number;
  from: number;
  to: number;
  alpha: number;
}

interface FloatText {
  t: Text;
  x: number;
  y: number;
  age: number;
  life: number;
}

const DECAL_LIMIT = 500;
const DECAL_LIFE = 150;
const CORPSE_LIFE = 1.3;

/** Short-lived effects. All sprites are pooled. */
export class FxLayer {
  readonly decals = new Container();
  readonly corpses = new Container();
  readonly below = new Container();
  readonly above = new Container();
  readonly additive = new Container();
  readonly texts = new Container();
  private particles: Particle[] = [];
  private arrows: Arrow[] = [];
  private corpseList: Corpse[] = [];
  private decalList: Decal[] = [];
  private rings: Ring[] = [];
  private floats: FloatText[] = [];
  private spritePool: Sprite[] = [];
  reduced = false;

  constructor(private tex: Textures) {
    this.additive.blendMode = 'add';
  }

  private sprite(texture: Texture, parent: Container): Sprite {
    const s = this.spritePool.pop() ?? new Sprite(texture);
    s.texture = texture;
    s.anchor.set(0.5);
    s.rotation = 0;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.scale.set(1);
    s.visible = true;
    parent.addChild(s);
    return s;
  }

  private free(s: Sprite): void {
    s.removeFromParent();
    this.spritePool.push(s);
  }

  burst(b: Burst): void {
    const count = this.reduced ? Math.ceil(b.count / 3) : b.count;
    const tex = this.tex[b.texture ?? 'soft'];
    const parent = b.additive ? this.additive : this.above;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = b.speed * (0.35 + Math.random() * 0.65);
      const spread = b.spread ?? 0;
      const s = this.sprite(tex, parent);
      s.tint = b.tint;
      s.rotation = Math.random() * 6.28;
      const size = b.size * (0.7 + Math.random() * 0.6);
      this.particles.push({
        s,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6,
        z: 0,
        vz: (b.rise ?? 0) * (0.6 + Math.random() * 0.8),
        gravity: b.gravity ?? 0,
        drag: 2.2,
        age: 0,
        life: b.life * (0.7 + Math.random() * 0.6),
        scale0: size / 64,
        scale1: (size * (b.grow ?? 1)) / 64,
        alpha0: b.alpha ?? 1,
        spin: (Math.random() - 0.5) * 2,
        fadeIn: 0.08,
      });
      s.position.set(b.x + (Math.random() - 0.5) * spread, b.y + (Math.random() - 0.5) * spread);
    }
  }

  ring(x: number, y: number, tint: number, from: number, to: number, life: number, alpha = 0.9, additive = true): void {
    const s = this.sprite(this.tex.ring, additive ? this.additive : this.below);
    s.position.set(x, y);
    s.tint = tint;
    s.scale.set(from / 64, (from / 64) * 0.62);
    this.rings.push({ s, age: 0, life, from, to, alpha });
  }

  arrow(x0: number, y0: number, tx: number, ty: number, flightMs: number, now: number, bolt: boolean): void {
    const s = this.sprite(bolt ? this.tex.bolt : this.tex.arrow, bolt ? this.additive : this.above);
    const shadow = this.sprite(this.tex.arrow, this.below);
    shadow.tint = 0x000000;
    shadow.alpha = 0.25;
    const d = Math.hypot(tx - x0, ty - y0);
    s.scale.set(bolt ? 0.42 : 0.36);
    shadow.scale.set(0.36, 0.3);
    this.arrows.push({ s, shadow, x0, y0: y0 - (bolt ? 40 : 10), tx, ty: ty - 6, t0: now, t1: now + flightMs, height: bolt ? d * 0.12 : Math.min(60, 10 + d * 0.28), stuck: 0, bolt });
  }

  /** A falling, fading body that leaves a faint decal behind. */
  corpse(texture: Texture, kind: Kind, x: number, y: number, facing: number, size: number, tint: number): void {
    void kind;
    const s = this.sprite(texture, this.corpses);
    s.tint = tint;
    const feet = (FEET_Y / CELL - 0.5) * CELL * size;
    s.position.set(x, y - feet);
    s.scale.set(size * facing, size);
    this.corpseList.push({ s, age: 0, fall: facing });
    const d = this.sprite(this.tex.decal, this.decals);
    d.position.set(x, y + 1);
    d.scale.set((size * CELL) / 70);
    d.rotation = (Math.random() - 0.5) * 0.6;
    d.alpha = 0.75;
    this.decalList.push({ s: d, age: 0 });
    if (this.decalList.length > DECAL_LIMIT) this.free(this.decalList.shift()!.s);
  }

  floatText(text: string, x: number, y: number, life: number, size: number, color = 0xffffff): void {
    const t = new Text({
      text,
      style: { fontFamily: 'Inter, "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif', fontSize: size, fontWeight: '800', fill: color, stroke: { color: 0x0b0d10, width: 4 } },
      resolution: 2,
    });
    t.anchor.set(0.5);
    this.texts.addChild(t);
    this.floats.push({ t, x, y, age: 0, life });
  }

  update(dt: number, now: number, zoom: number): void {
    const fade = (age: number, life: number) => Math.max(0, 1 - age / life);
    let w = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) {
        this.free(p.s);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz -= p.gravity * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt - p.vz * dt * (p.z > 0 ? 1 : 0);
      const t = p.age / p.life;
      const sc = p.scale0 + (p.scale1 - p.scale0) * t;
      p.s.scale.set(sc);
      p.s.rotation += p.spin * dt;
      p.s.alpha = p.alpha0 * Math.min(1, p.age / p.fadeIn) * (1 - t) * (1 - t * 0.3);
      this.particles[w++] = p;
    }
    this.particles.length = w;

    w = 0;
    for (const a of this.arrows) {
      if (a.stuck > 0) {
        a.stuck -= dt;
        a.s.alpha = Math.min(1, a.stuck / 0.4);
        if (a.stuck <= 0) {
          this.free(a.s);
          continue;
        }
        this.arrows[w++] = a;
        continue;
      }
      const t = Math.min(1, (now - a.t0) / Math.max(1, a.t1 - a.t0));
      const gx = a.x0 + (a.tx - a.x0) * t;
      const gy = a.y0 + (a.ty - a.y0) * t;
      const h = 4 * a.height * t * (1 - t);
      a.s.position.set(gx, gy - h);
      const dhdt = 4 * a.height * (1 - 2 * t);
      a.s.rotation = Math.atan2(a.ty - a.y0 - dhdt, a.tx - a.x0);
      if (a.shadow) {
        a.shadow.position.set(gx, gy + 8);
        a.shadow.rotation = Math.atan2(a.ty - a.y0, a.tx - a.x0);
      }
      if (t >= 1) {
        if (a.shadow) this.free(a.shadow);
        a.shadow = null;
        if (a.bolt) {
          this.burst({ x: a.tx, y: a.ty, count: 6, texture: 'spark', tint: 0xffe2a0, speed: 40, life: 0.3, size: 10, additive: true });
          this.free(a.s);
          continue;
        }
        a.stuck = 0.9;
      }
      this.arrows[w++] = a;
    }
    this.arrows.length = w;

    w = 0;
    for (const c of this.corpseList) {
      c.age += dt;
      if (c.age >= CORPSE_LIFE) {
        this.free(c.s);
        continue;
      }
      const fallT = Math.min(1, c.age / 0.35);
      c.s.rotation = c.fall * 1.45 * fallT * fallT;
      c.s.alpha = Math.min(1, 2.2 * (1 - c.age / CORPSE_LIFE));
      this.corpseList[w++] = c;
    }
    this.corpseList.length = w;

    w = 0;
    for (const d of this.decalList) {
      d.age += dt;
      if (d.age >= DECAL_LIFE) {
        this.free(d.s);
        continue;
      }
      d.s.alpha = 0.75 * fade(d.age, DECAL_LIFE);
      this.decalList[w++] = d;
    }
    this.decalList.length = w;

    w = 0;
    for (const r of this.rings) {
      r.age += dt;
      if (r.age >= r.life) {
        this.free(r.s);
        continue;
      }
      const t = r.age / r.life;
      const ease = 1 - (1 - t) * (1 - t);
      const size = r.from + (r.to - r.from) * ease;
      r.s.scale.set(size / 64, (size / 64) * 0.62);
      r.s.alpha = r.alpha * (1 - t);
      this.rings[w++] = r;
    }
    this.rings.length = w;

    w = 0;
    for (const f of this.floats) {
      f.age += dt;
      if (f.age >= f.life) {
        f.t.destroy();
        continue;
      }
      const t = f.age / f.life;
      f.t.position.set(f.x, f.y - (40 * t) / zoom);
      f.t.scale.set((1 + Math.min(1, f.age * 6) * 0.15) / zoom);
      f.t.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.floats[w++] = f;
    }
    this.floats.length = w;
  }

  get counts(): { particles: number; arrows: number; decals: number } {
    return { particles: this.particles.length, arrows: this.arrows.length, decals: this.decalList.length };
  }

  destroy(): void {
    for (const f of this.floats) f.t.destroy();
  }
}
