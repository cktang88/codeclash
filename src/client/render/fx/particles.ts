import { Particle, ParticleContainer, Rectangle, type Texture } from 'pixi.js';

/** How a single particle moves and fades. Sizes are in world units. */
export interface Spawn {
  texture: Texture;
  /** Frames to cycle through over the particle's life (e.g. flames), instead of `texture`. */
  frames?: readonly Texture[];
  x: number;
  y: number;
  /** Height above the ground; drawn upward from y. */
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  gravity?: number;
  drag?: number;
  life: number;
  size: number;
  /** Size at end of life, as a multiple of `size`. */
  grow?: number;
  /** Vertical squash: 1 for round, <1 for ground-hugging ellipses. */
  squash?: number;
  alpha?: number;
  tint?: number;
  /** Tint at end of life, blended from `tint`. */
  tintTo?: number;
  rotation?: number;
  spin?: number;
  /** Seconds to fade in. */
  fadeIn?: number;
  /** Stretch along velocity (sparks, streaks). */
  stretch?: boolean;
  /** Delay before the particle appears, in seconds. */
  delay?: number;
  anchorY?: number;
}

interface Live {
  p: Particle;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  squash: number;
  a0: number;
  tint0: number;
  tint1: number;
  spin: number;
  fadeIn: number;
  stretch: boolean;
  frames: readonly Texture[] | null;
  delay: number;
  baseW: number;
  baseH: number;
}

function mix(a: number, b: number, t: number): number {
  if (a === b) return a;
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** A pool of particles in one ParticleContainer; every texture must come from the FX atlas. */
export class ParticlePool {
  readonly container: ParticleContainer;
  private live: Live[] = [];
  private manual: Particle[] = [];
  private free: Particle[] = [];
  private dirty = false;

  constructor(
    readonly budget: number,
    additive: boolean,
  ) {
    this.container = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, uvs: true, color: true },
    });
    // Effects span the whole map; skip Pixi's bounds culling.
    this.container.boundsArea = new Rectangle(-1e6, -1e6, 2e6, 2e6);
    if (additive) this.container.blendMode = 'add';
  }

  get count(): number {
    return this.live.length + this.manual.length;
  }

  /** A particle the caller positions itself, until `release`. */
  acquire(texture: Texture): Particle {
    const p = this.free.pop() ?? new Particle({ texture });
    p.texture = texture;
    p.anchorX = 0.5;
    p.anchorY = 0.5;
    p.rotation = 0;
    p.alpha = 1;
    p.tint = 0xffffff;
    p.scaleX = 1;
    p.scaleY = 1;
    this.manual.push(p);
    this.dirty = true;
    return p;
  }

  release(p: Particle): void {
    const i = this.manual.indexOf(p);
    if (i < 0) return;
    this.manual[i] = this.manual[this.manual.length - 1]!;
    this.manual.pop();
    this.free.push(p);
    this.dirty = true;
  }

  /** 1 when empty, falling toward 0 as the pool fills, for scaling spawn counts down under load. */
  get headroom(): number {
    return Math.max(0, 1 - this.live.length / this.budget);
  }

  spawn(s: Spawn): void {
    if (this.live.length >= this.budget) return;
    const tex = s.frames ? s.frames[0]! : s.texture;
    const p = this.free.pop() ?? new Particle({ texture: tex });
    p.texture = tex;
    p.anchorX = 0.5;
    p.anchorY = s.anchorY ?? 0.5;
    p.rotation = s.rotation ?? 0;
    const size = s.size;
    const baseW = tex.frame.width;
    const baseH = tex.frame.height;
    this.live.push({
      p,
      x: s.x,
      y: s.y,
      z: s.z ?? 0,
      vx: s.vx ?? 0,
      vy: s.vy ?? 0,
      vz: s.vz ?? 0,
      gravity: s.gravity ?? 0,
      drag: s.drag ?? 0,
      age: 0,
      life: s.life,
      s0: size,
      s1: size * (s.grow ?? 1),
      squash: s.squash ?? 1,
      a0: s.alpha ?? 1,
      tint0: s.tint ?? 0xffffff,
      tint1: s.tintTo ?? s.tint ?? 0xffffff,
      spin: s.spin ?? 0,
      fadeIn: s.fadeIn ?? 0.05,
      stretch: s.stretch ?? false,
      frames: s.frames ?? null,
      delay: s.delay ?? 0,
      baseW,
      baseH,
    });
    p.alpha = 0;
    this.dirty = true;
  }

  update(dt: number): void {
    const list = this.live;
    const kids = this.container.particleChildren;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const l = list[i]!;
      if (l.delay > 0) {
        l.delay -= dt;
        list[w++] = l;
        continue;
      }
      l.age += dt;
      if (l.age >= l.life) {
        this.free.push(l.p);
        this.dirty = true;
        continue;
      }
      if (l.drag > 0) {
        const k = Math.exp(-l.drag * dt);
        l.vx *= k;
        l.vy *= k;
        l.vz *= k;
      }
      l.vz -= l.gravity * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.z += l.vz * dt;
      if (l.z < 0 && l.gravity > 0) {
        // Bounce once, dully, then settle.
        l.z = 0;
        l.vz = -l.vz * 0.3;
        l.vx *= 0.5;
        l.vy *= 0.5;
      }
      const t = l.age / l.life;
      const p = l.p;
      if (l.frames) {
        const f = l.frames[Math.min(l.frames.length - 1, Math.floor(t * l.frames.length))]!;
        if (p.texture !== f) p.texture = f;
      }
      const size = l.s0 + (l.s1 - l.s0) * t;
      let sx = size / l.baseW;
      let sy = (size / l.baseW) * l.squash;
      if (l.stretch) {
        const sp = Math.sqrt(l.vx * l.vx + (l.vy - l.vz) * (l.vy - l.vz));
        sx *= 1 + Math.min(3, sp / 120);
        sy *= 0.7;
        p.rotation = Math.atan2(l.vy - l.vz, l.vx);
      } else p.rotation += l.spin * dt;
      p.scaleX = sx;
      p.scaleY = sy;
      p.x = l.x;
      p.y = l.y - l.z;
      p.tint = mix(l.tint0, l.tint1, t);
      const fadeIn = l.fadeIn > 0 ? Math.min(1, l.age / l.fadeIn) : 1;
      p.alpha = l.a0 * fadeIn * (1 - t * t);
      list[w++] = l;
    }
    list.length = w;
    if (this.dirty) {
      kids.length = 0;
      for (const l of list) kids.push(l.p);
      for (const p of this.manual) kids.push(p);
      this.container.update();
      this.dirty = false;
    }
  }

  clear(): void {
    for (const l of this.live) this.free.push(l.p);
    this.live.length = 0;
    for (const p of this.manual) this.free.push(p);
    this.manual.length = 0;
    this.container.particleChildren.length = 0;
    this.container.update();
  }
}
