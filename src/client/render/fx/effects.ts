import { Container, Sprite, Text, type Particle, type Texture } from 'pixi.js';
import { BlastKind, Kind, ShotKind, type TickEvents, type World } from '../../../sim/api.ts';
import { STATS } from '../../../sim/stats.ts';
import { makeFxTextures, type FxTextures } from './atlas.ts';
import { ParticlePool, type Spawn } from './particles.ts';

export type PositionOf = (id: number) => { x: number; y: number } | null;

export interface Bounds {
  contains(x: number, y: number): boolean;
}

export interface StepContext {
  posOf: PositionOf;
  /** Army color per player index, 0xRRGGBB. */
  tints: readonly number[];
  /** True when zoomed in enough for small, per-soldier effects. */
  near: boolean;
  bounds: Bounds;
}

/** The old FxLayer burst shape, kept for callers like site smoke. */
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

/** Altitude at which flying kinds are drawn above their ground position. */
export const FLY_HEIGHT: Partial<Record<Kind, number>> = { [Kind.GriffinRider]: 18, [Kind.Dragon]: 34 };

const GOLD = 0xf2cf5b;
const FIRE = 0xff8a2a;
const FEET_FRAC = 84 / 96;
const CORPSE_LIFE = 1.4;
const BREATH_LIFE = 0.85;
const BREATH_HALF_ANGLE = 0.42;
const BURN_LIFE = 1.1;
const MAX_BURNERS = 80;
const MAX_PROJECTILES = 900;
const MAX_CORPSES = 260;

interface Projectile {
  kind: number;
  body: Particle;
  shadow: Particle;
  x0: number;
  y0: number;
  z0: number;
  zTarget: number;
  tx: number;
  ty: number;
  t0: number;
  t1: number;
  height: number;
  to: number;
  spin: number;
  trail: number;
}

interface Breath {
  from: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  range: number;
  age: number;
  acc: number;
}

interface Burner {
  id: number;
  x: number;
  y: number;
  age: number;
  acc: number;
}

interface Corpse {
  s: Sprite;
  age: number;
  facing: number;
  x: number;
  y: number;
  drop: number;
}

interface Float {
  t: Text;
  x: number;
  y: number;
  age: number;
  life: number;
}

const rand = Math.random;
const angleOf = (dx: number, dy: number) => Math.atan2(dy, dx);

/**
 * Every short-lived visual of the battle: projectiles, spells, fire, dust,
 * corpses and decals. Layers are added to the scene by the renderer core:
 * `ground` above terrain, `air` and `glow` above units, `overlay` on top.
 */
export class Effects {
  readonly ground = new Container();
  readonly air = new Container();
  readonly glow = new Container();
  readonly overlay = new Container();
  /** Camera shake intensity, ~0..1.5. Always 0 under reduced motion. */
  shake = 0;

  private readonly tex: FxTextures;
  private readonly decals = new ParticlePool(900, false);
  private readonly corpseLayer = new Container();
  private readonly dust = new ParticlePool(5000, false);
  private readonly fire = new ParticlePool(7000, true);
  private projectiles: Projectile[] = [];
  private breaths: Breath[] = [];
  private burners: Burner[] = [];
  private corpses: Corpse[] = [];
  private floats: Float[] = [];
  private zoom = 1;
  private readonly reduced: boolean;

  constructor(opts: { reducedMotion?: boolean } = {}) {
    this.reduced = opts.reducedMotion ?? false;
    this.tex = makeFxTextures();
    this.ground.addChild(this.decals.container, this.corpseLayer);
    this.air.addChild(this.dust.container);
    this.glow.addChild(this.fire.container);
  }

  get counts(): { particles: number; projectiles: number; decals: number; corpses: number } {
    return { particles: this.dust.count + this.fire.count, projectiles: this.projectiles.length, decals: this.decals.count, corpses: this.corpses.length };
  }

  // ------------------------------------------------------------- events

  onStep(ev: TickEvents, world: World, ctx: StepContext): void {
    const { posOf, tints, near, bounds } = ctx;
    const tick = world.tick - 1;
    const tint = (p: number) => tints[p] ?? 0xe8dcc0;

    let flyers: Map<number, Kind> | null = null;
    const flyerKind = (id: number): Kind | undefined => {
      if (!flyers) {
        flyers = new Map();
        for (const u of world.units) if (STATS[u.kind]!.flying) flyers.set(u.id, u.kind);
      }
      return flyers.get(id);
    };

    for (const s of ev.shots) {
      const target = posOf(s.to);
      if (!target) continue;
      if (!bounds.contains(target.x, target.y) && !bounds.contains(s.x, s.y)) continue;
      const shooterAlt = s.from > 0 ? (FLY_HEIGHT[flyerKind(s.from) ?? Kind.Footman] ?? 0) : 0;
      const targetAlt = s.to > 0 ? (FLY_HEIGHT[flyerKind(s.to) ?? Kind.Footman] ?? 0) : 0;
      this.launch(s.kind, s.x, s.y, shooterAlt, target.x, target.y, targetAlt, tick, Math.max(tick + 1, s.land), s.to);
    }

    for (const b of ev.breaths) {
      if (!bounds.contains(b.x, b.y) && !bounds.contains(b.tx, b.ty)) continue;
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      this.breaths.push({ from: b.from, x: b.x, y: b.y, dx: dx / d, dy: dy / d, range: b.range, age: 0, acc: 0 });
      this.kick(near ? 0.35 : 0.15);
      // Everyone caught in the cone smoulders for a moment.
      for (const u of world.units) {
        if (this.burners.length >= MAX_BURNERS) break;
        const ux = u.x - b.x;
        const uy = u.y - b.y;
        const along = (ux * dx + uy * dy) / d;
        if (along < 0 || along > b.range) continue;
        const across = Math.abs(ux * dy - uy * dx) / d;
        if (across > along * Math.tan(BREATH_HALF_ANGLE) + 6 || u.id === b.from) continue;
        this.burners.push({ id: u.id, x: u.x, y: u.y, age: 0, acc: rand() * 0.05 });
      }
    }

    for (const b of ev.blasts) {
      if (!bounds.contains(b.x, b.y)) continue;
      if (b.kind === BlastKind.Fireball) this.fireballBurst(b.x, b.y, b.radius);
      else if (b.kind === BlastKind.Boulder) this.boulderImpact(b.x, b.y, b.radius, near);
      else this.scorchMark(b.x, b.y, b.radius);
    }

    for (const h of ev.heals) {
      const p = posOf(h.to);
      if (!p || !bounds.contains(p.x, p.y)) continue;
      const healer = world.units.find((u) => u.id === h.from);
      this.heal(p.x, p.y - (FLY_HEIGHT[flyerKind(h.to) ?? Kind.Footman] ?? 0), healer?.kind === Kind.Paladin);
    }

    if (near) {
      for (const h of ev.hits) {
        if (h.structure >= 0) {
          const st = world.structures[h.structure];
          if (!st) continue;
          const site = world.map.sites[st.site]!;
          if (!bounds.contains(site.x, site.y) || rand() > 0.4) continue;
          const x = site.x + (rand() - 0.5) * site.radius;
          const y = site.y - site.radius * (0.2 + rand() * 0.7);
          this.sparks(x, y, 3, 0xffd890, 70);
          this.chips(x, y, 2);
          continue;
        }
        const p = posOf(h.unit);
        if (!p || !bounds.contains(p.x, p.y)) continue;
        const alt = FLY_HEIGHT[flyerKind(h.unit) ?? Kind.Footman] ?? 0;
        this.sparks(p.x, p.y - 8 - alt, h.damage > 18 ? 4 : 2, h.damage > 18 ? 0xffe08a : 0xffffff, 60);
        if (rand() < 0.4 && alt === 0) this.puff(p.x, p.y - 2, 1, 0xb7a888, 8);
      }
    }

    for (const d of ev.deaths) {
      const p = posOf(d.unit);
      const x = p?.x ?? d.x;
      const y = p?.y ?? d.y;
      if (!bounds.contains(x, y)) continue;
      this.death(d.kind, x, y, tint(d.p), near);
    }

    for (const m of ev.marches) {
      const pl = world.platoons.find((x) => x.id === m.platoon);
      if (!pl || !bounds.contains(pl.x, pl.y)) continue;
      const t = tint(pl.p);
      this.puff(pl.x, pl.y, this.n(10), 0xc8b48c, 16, 30);
      this.ring(pl.x, pl.y, t, 10, 90, 0.8);
      this.pillar(pl.x, pl.y, GOLD, 26, 0.5);
      this.sparks(pl.x, pl.y - 20, this.n(10), t, 90);
    }

    for (const r of ev.routs) {
      const pl = world.platoons.find((x) => x.id === r.platoon);
      if (!pl || !bounds.contains(pl.x, pl.y)) continue;
      this.ring(pl.x, pl.y, 0xffffff, 10, 70, 0.6, 0.7);
      for (let i = 0; i < 3; i++) {
        this.dust.spawn({ texture: this.tex.cloth, x: pl.x + (rand() - 0.5) * 20, y: pl.y, z: 26, vx: (rand() - 0.5) * 40, vz: 50 + rand() * 30, gravity: 90, life: 1.4, size: 10, spin: (rand() - 0.5) * 6 });
      }
    }

    for (const r of ev.regroups) {
      const from = world.platoons.find((x) => x.id === r.from);
      const to = world.platoons.find((x) => x.id === r.to);
      const a = from ?? to;
      if (!a || !to || !bounds.contains(a.x, a.y)) continue;
      // The remnant's banner folds into the larger company: a trail of dust and motes between them.
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        this.fire.spawn({ texture: this.tex.mote, x: a.x + (to.x - a.x) * t, y: a.y + (to.y - a.y) * t - 20, vz: 10, life: 0.8, size: 6, tint: tint(to.p), delay: t * 0.4 });
      }
      this.puff(a.x, a.y, this.n(5), 0xc8b48c, 14, 16);
      this.ring(to.x, to.y, tint(to.p), 8, 50, 0.6, 0.7);
    }

    for (const c of ev.captures) {
      const site = world.map.sites[c.site]!;
      const t = tint(c.p);
      this.ring(site.x, site.y, t, site.radius, site.radius * 2.6, 1.2);
      this.ring(site.x, site.y, 0xffffff, site.radius * 0.6, site.radius * 1.8, 0.8, 0.6);
      this.pillar(site.x, site.y, t, site.radius * 0.8, 1.2);
      this.sparks(site.x, site.y - 20, this.n(26), t, 150, 40);
    }

    for (const s of ev.sacks) {
      const site = world.map.sites[s.site]!;
      const top = site.y - site.radius * 0.6;
      this.flash(site.x, top, site.radius * 3, FIRE, 0.4);
      for (let i = 0; i < this.n(40); i++) this.ember(site.x + (rand() - 0.5) * site.radius, top, 160, 80);
      for (let i = 0; i < this.n(26); i++) this.smoke(site.x + (rand() - 0.5) * site.radius, top, 40, 0x2e2a26, 0.8, 4);
      for (let i = 0; i < this.n(18); i++) this.rockFling(site.x, top, 140, 60);
      this.shockwave(site.x, site.y, 0xff8a3a, site.radius, site.radius * 4, 1.2);
      this.floatText('SACKED!', site.x, site.y - site.radius * 2.4, 2.6, 22, 0xffb070);
      this.kick(0.8);
    }

    for (const r of ev.rebuilt) {
      const site = world.map.sites[r.site]!;
      const owner = world.players.find((p) => p.slot === site.slot);
      this.puff(site.x, site.y, this.n(20), 0xcab89a, 26, site.radius);
      this.ring(site.x, site.y, owner ? tint(owner.p) : 0xffffff, site.radius, site.radius * 2.2, 1.2);
      this.sparks(site.x, site.y - site.radius, this.n(16), GOLD, 100, 30);
    }

    if (ev.monolith) {
      this.flash(0, -80, 420, 0x9fe0ff, 0.6);
      for (let i = 0; i < this.n(70); i++) this.smoke((rand() - 0.5) * 160, -30 - rand() * 60, 140, 0x6c6a72, 0.75, 3.5, 2.6);
      for (let i = 0; i < this.n(40); i++) this.rockFling((rand() - 0.5) * 60, -40, 220, 160 + rand() * 200);
      for (let i = 0; i < this.n(50); i++) this.fire.spawn({ texture: this.tex.spark, x: 0, y: -80, vx: (rand() - 0.5) * 520, vy: (rand() - 0.5) * 300, vz: 120 + rand() * 120, gravity: 140, drag: 1.2, life: 1.6, size: 14, tint: 0x9fe0ff, stretch: true });
      this.shockwave(0, 0, 0x9fe0ff, 40, 520, 1.8);
      this.shockwave(0, 0, 0xffffff, 30, 340, 1.2);
      this.floatText('THE MONOLITH FALLS', 0, -220, 3.5, 24, 0xbfe9ff);
      this.kick(1.2);
    }

    for (const c of ev.cries) {
      const p = world.players[c.p];
      if (!p) continue;
      const site = world.map.sites[p.slot]!;
      this.shockwave(site.x, site.y, GOLD, 30, 620, 1.8);
      this.shockwave(site.x, site.y, 0xffffff, 20, 380, 1.2, 0.6);
      this.pillar(site.x, site.y, GOLD, site.radius, 1.6);
      this.sparks(site.x, site.y - 40, this.n(40), GOLD, 240, 60);
      this.floatText('WAR CRY!', site.x, site.y - site.radius * 2.5, 2.6, 22, GOLD);
    }

    // Ruined capitals burn for as long as they lie in ruins.
    if (world.tick % 2 === 0) {
      for (const st of world.structures) {
        if (st.ruinedUntil < 0 || st.p < 0) continue;
        const site = world.map.sites[st.site]!;
        if (!bounds.contains(site.x, site.y)) continue;
        const x = site.x + (rand() - 0.5) * site.radius * 1.2;
        const y = site.y - site.radius * (0.1 + rand() * 0.4);
        this.flame(x, y, 0, 0, 20 + rand() * 14, 0.9);
        this.ember(x, y - 10, 40, 60);
        this.smoke(x, y - 20, 12, 0x2a2622, 0.7, 4.5, 3.2, 26);
      }
    }
  }

  // ------------------------------------------------------------- frame

  update(dtMs: number, simTime: number, posOf: PositionOf, zoom: number, bounds: Bounds): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.zoom = zoom;
    this.shake = this.reduced ? 0 : Math.max(0, this.shake - dt * 1.6);
    this.updateProjectiles(dt, simTime, posOf);
    this.updateBreaths(dt, posOf);
    this.updateBurners(dt, posOf, bounds);
    this.updateCorpses(dt);
    this.updateFloats(dt);
    this.decals.update(dt);
    this.dust.update(dt);
    this.fire.update(dt);
  }

  // ------------------------------------------------------- public extras

  burst(b: Burst): void {
    const count = this.n(b.count);
    const kind = b.texture ?? 'soft';
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const sp = b.speed * (0.35 + rand() * 0.65);
      const spread = b.spread ?? 0;
      const spawn: Spawn = {
        texture: kind === 'smoke' ? this.tex.smoke[i % 3]! : kind === 'ember' ? this.tex.ember : kind === 'spark' ? this.tex.spark : this.tex.soft,
        x: b.x + (rand() - 0.5) * spread,
        y: b.y + (rand() - 0.5) * spread,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6,
        vz: (b.rise ?? 0) * (0.6 + rand() * 0.8),
        gravity: b.gravity ?? 0,
        drag: 2.2,
        life: b.life * (0.7 + rand() * 0.6),
        size: b.size * (0.7 + rand() * 0.6),
        grow: b.grow,
        alpha: b.alpha ?? 1,
        tint: b.tint,
        rotation: rand() * 6.28,
        spin: (rand() - 0.5) * 2,
        fadeIn: 0.08,
      };
      (b.additive ? this.fire : this.dust).spawn(spawn);
    }
  }

  /** A soldier falls and fades. `scale` is world units per texture pixel; feet sit at (x, y). */
  corpse(texture: Texture, x: number, y: number, facing: number, scale: number, tint: number, altitude = 0): void {
    if (this.corpses.length >= MAX_CORPSES) this.dropCorpse(0);
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.tint = tint;
    s.scale.set(scale * facing, scale);
    const feet = (FEET_FRAC - 0.5) * texture.frame.height * scale;
    s.position.set(x, y - feet - altitude);
    this.corpseLayer.addChild(s);
    this.corpses.push({ s, age: 0, facing: facing >= 0 ? 1 : -1, x, y: y - feet, drop: altitude });
    this.decals.spawn({ texture: this.tex.dust, x, y: y + 1, life: 120, size: texture.frame.width * scale * 0.9, squash: 0.45, alpha: 0.32, tint: 0x3b2f22, fadeIn: 0.4 });
  }

  floatText(text: string, x: number, y: number, life: number, size: number, color = 0xffffff): void {
    const t = new Text({
      text,
      style: { fontFamily: 'Cinzel, Inter, "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif', fontSize: size, fontWeight: '800', fill: color, stroke: { color: 0x0b0d10, width: 5, join: 'round' }, letterSpacing: 1 },
      resolution: 2,
    });
    t.anchor.set(0.5);
    this.overlay.addChild(t);
    this.floats.push({ t, x, y, age: 0, life });
  }

  destroy(): void {
    for (const f of this.floats) f.t.destroy();
    for (const c of this.corpses) c.s.destroy();
    for (const p of this.projectiles) {
      this.dust.release(p.body);
      this.fire.release(p.body);
      this.decals.release(p.shadow);
    }
    this.decals.clear();
    this.dust.clear();
    this.fire.clear();
    this.ground.destroy({ children: true });
    this.air.destroy({ children: true });
    this.glow.destroy({ children: true });
    this.overlay.destroy({ children: true });
  }

  // --------------------------------------------------------- projectiles

  private launch(kind: number, x: number, y: number, alt: number, tx: number, ty: number, targetAlt: number, t0: number, t1: number, to: number): void {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const d = Math.hypot(tx - x, ty - y);
    let body: Particle;
    let height: number;
    let z0 = alt;
    if (kind === ShotKind.Fireball) {
      body = this.fire.acquire(this.tex.fireball);
      height = Math.min(70, 16 + d * 0.2);
      z0 += 14;
    } else if (kind === ShotKind.Boulder) {
      body = this.dust.acquire(this.tex.boulder);
      height = Math.max(90, d * 0.5);
      z0 += 18;
    } else if (kind === ShotKind.TowerBolt) {
      body = this.fire.acquire(this.tex.bolt);
      height = d * 0.06;
      z0 += 40;
    } else if (kind === ShotKind.RangerArrow) {
      body = this.dust.acquire(this.tex.rangerArrow);
      height = Math.min(40, 8 + d * 0.14);
      z0 += 10;
    } else {
      body = this.dust.acquire(this.tex.arrow);
      height = Math.min(64, 10 + d * 0.28);
      z0 += 10;
    }
    const shadow = this.decals.acquire(this.tex.shadow);
    shadow.alpha = 0.35;
    body.alpha = 0;
    shadow.alpha = 0;
    this.projectiles.push({ kind, body, shadow, x0: x, y0: y, z0, zTarget: targetAlt + 8, tx, ty, t0, t1, height, to, spin: (rand() - 0.5) * 8, trail: 0 });
  }

  private updateProjectiles(dt: number, simTime: number, posOf: PositionOf): void {
    let w = 0;
    for (const p of this.projectiles) {
      const target = posOf(p.to);
      if (target) {
        p.tx = target.x;
        p.ty = target.y;
      }
      const t = (simTime - p.t0) / Math.max(0.5, p.t1 - p.t0);
      if (t < 0) {
        this.projectiles[w++] = p;
        continue;
      }
      if (t >= 1) {
        this.arrive(p);
        continue;
      }
      const gx = p.x0 + (p.tx - p.x0) * t;
      const gy = p.y0 + (p.ty - p.y0) * t;
      const z = p.z0 + (p.zTarget - p.z0) * t + 4 * p.height * t * (1 - t);
      const dz = p.zTarget - p.z0 + 4 * p.height * (1 - 2 * t);
      const b = p.body;
      b.x = gx;
      b.y = gy - z;
      b.alpha = Math.min(1, t * 8);
      const s = p.shadow;
      s.x = gx;
      s.y = gy + 2;
      s.alpha = 0.3 * Math.min(1, t * 8);
      if (p.kind === ShotKind.Boulder) {
        b.rotation += p.spin * dt;
        const k = 0.9;
        b.scaleX = b.scaleY = k;
        s.scaleX = s.scaleY = 0.5 + 0.6 * (1 - z / (p.height + p.z0 + 1));
      } else if (p.kind === ShotKind.Fireball) {
        const pulse = 0.85 + Math.sin(simTime * 9) * 0.1;
        b.scaleX = b.scaleY = 0.5 * pulse;
        b.tint = 0xffffff;
        s.scaleX = s.scaleY = 0.35;
        p.trail += dt;
        while (p.trail > 0.016) {
          p.trail -= 0.016;
          this.fire.spawn({ texture: this.tex.ember, x: gx + (rand() - 0.5) * 3, y: gy - z + (rand() - 0.5) * 3, vx: (rand() - 0.5) * 20, vy: -10 - rand() * 10, life: 0.35, size: 9, grow: 0.3, tint: 0xffd070, tintTo: 0xc0300a });
          if (rand() < 0.3) this.smoke(gx, gy - z, 6, 0x3a332c, 0.35, 0.7, 1.8, 8);
        }
      } else {
        b.rotation = angleOf(p.tx - p.x0, p.ty - p.y0 - dz);
        b.scaleX = b.scaleY = p.kind === ShotKind.TowerBolt ? 0.6 : 0.42;
        s.rotation = angleOf(p.tx - p.x0, p.ty - p.y0);
        s.scaleX = p.kind === ShotKind.TowerBolt ? 0.2 : 0.35;
        s.scaleY = 0.12;
        if (p.kind === ShotKind.RangerArrow) {
          p.trail += dt;
          while (p.trail > 0.03) {
            p.trail -= 0.03;
            this.fire.spawn({ texture: this.tex.soft, x: gx, y: gy - z, life: 0.3, size: 5, grow: 0.2, alpha: 0.6, tint: 0x6fe08a });
          }
        }
      }
      this.projectiles[w++] = p;
    }
    this.projectiles.length = w;
  }

  private arrive(p: Projectile): void {
    const x = p.tx;
    const y = p.ty - p.zTarget;
    const release = () => {
      if (p.kind === ShotKind.Fireball || p.kind === ShotKind.TowerBolt) this.fire.release(p.body);
      else this.dust.release(p.body);
      this.decals.release(p.shadow);
    };
    if (p.kind === ShotKind.Arrow || p.kind === ShotKind.RangerArrow) {
      // The arrow stays stuck where it struck, briefly.
      this.dust.spawn({ texture: p.kind === ShotKind.Arrow ? this.tex.arrow : this.tex.rangerArrow, x: x + (rand() - 0.5) * 6, y: y + (rand() - 0.5) * 6, life: 0.9, size: 13, rotation: p.body.rotation + (rand() - 0.5) * 0.4, fadeIn: 0 });
    } else if (p.kind === ShotKind.TowerBolt) {
      this.sparks(x, y, 6, 0xffe2a0, 80);
      this.flash(x, y, 30, 0xffe2a0, 0.15);
    }
    release();
  }

  // ---------------------------------------------------------- dragon fire

  private updateBreaths(dt: number, posOf: PositionOf): void {
    let w = 0;
    for (const b of this.breaths) {
      b.age += dt;
      if (b.age >= BREATH_LIFE) continue;
      const pos = posOf(b.from);
      if (pos) {
        b.x = pos.x;
        b.y = pos.y;
      }
      const mouthX = b.x + b.dx * 12;
      const mouthY = b.y + b.dy * 12;
      const alt = FLY_HEIGHT[Kind.Dragon]!;
      const life = 0.5;
      const speed = b.range / life;
      b.acc += dt;
      const rate = this.reduced ? 0.02 : 0.0045;
      const fading = 1 - b.age / BREATH_LIFE;
      while (b.acc > rate) {
        b.acc -= rate;
        const spread = (rand() - 0.5) * 2 * BREATH_HALF_ANGLE * (0.4 + rand() * 0.6);
        const c = Math.cos(spread);
        const s = Math.sin(spread);
        const sp = speed * (0.85 + rand() * 0.35);
        const vx = (b.dx * c - b.dy * s) * sp;
        const vy = (b.dy * c + b.dx * s) * sp;
        // The jet: soft blobs that swell from white-hot to smoky red as they fly.
        const core = rand() < 0.25;
        this.fire.spawn({ texture: core ? this.tex.soft : this.tex.flame[(rand() * 4) | 0]!, x: mouthX, y: mouthY, z: alt, vx, vy, vz: -alt / life, life: life * (0.85 + rand() * 0.3), size: core ? 8 : 10, grow: core ? 3 : 4.5 + rand() * 1.5, tint: core ? 0xfff0c0 : 0xffb040, tintTo: 0x7a1404, alpha: (core ? 0.5 : 0.55) * (0.6 + fading * 0.4), rotation: angleOf(vx, vy) - Math.PI / 2, spin: (rand() - 0.5) * 2, fadeIn: 0.03 });
        if (rand() < 0.35) this.fire.spawn({ texture: this.tex.flame[0]!, frames: this.tex.flame, x: mouthX + vx * life * 0.9, y: mouthY + vy * life * 0.9, life: 0.5 + rand() * 0.3, size: 16 + rand() * 14, grow: 1.4, tint: 0xffe6a0, tintTo: 0xd0380c, alpha: 0.9, anchorY: 0.85, rotation: (rand() - 0.5) * 0.4, delay: life * 0.7, fadeIn: 0.05 });
        if (rand() < 0.4) this.fire.spawn({ texture: this.tex.ember, x: mouthX, y: mouthY, z: alt, vx: vx * 1.05 + (rand() - 0.5) * 50, vy: vy * 1.05 + (rand() - 0.5) * 50, vz: 10 + rand() * 50, gravity: 50, drag: 1.2, life: 0.8 + rand() * 0.6, size: 6, tint: 0xffe0a0, tintTo: 0xff4010 });
        if (rand() < 0.1) this.smoke(mouthX + vx * life, mouthY + vy * life, 14, 0x2e2722, 0.5, 1.8, 3, 26);
      }
      // Heat glow at the jaws.
      if (rand() < 0.5) this.fire.spawn({ texture: this.tex.soft, x: mouthX, y: mouthY - alt, life: 0.12, size: 40, alpha: 0.7, tint: 0xffb050 });
      this.breaths[w++] = b;
    }
    this.breaths.length = w;
  }

  private updateBurners(dt: number, posOf: PositionOf, bounds: Bounds): void {
    let w = 0;
    for (const b of this.burners) {
      b.age += dt;
      if (b.age >= BURN_LIFE) continue;
      const p = posOf(b.id);
      if (p) {
        b.x = p.x;
        b.y = p.y;
      }
      b.acc += dt;
      while (b.acc > 0.06) {
        b.acc -= 0.06;
        if (!bounds.contains(b.x, b.y)) break;
        this.flame(b.x + (rand() - 0.5) * 6, b.y - 2, 0, -8, 9 + rand() * 4, 0.45);
      }
      this.burners[w++] = b;
    }
    this.burners.length = w;
  }

  // ---------------------------------------------------------- explosions

  private fireballBurst(x: number, y: number, radius: number): void {
    this.flash(x, y - 10, radius * 3.2, 0xffd890, 0.25);
    this.shockwave(x, y, FIRE, radius * 0.4, radius * 1.9, 0.45, 0.9);
    for (let i = 0; i < this.n(10); i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * radius * 0.6;
      this.flame(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, Math.cos(a) * 30, Math.sin(a) * 18, 14 + rand() * 10, 0.55);
    }
    for (let i = 0; i < this.n(26); i++) this.ember(x, y - 8, 190, 90);
    for (let i = 0; i < this.n(6); i++) this.smoke(x + (rand() - 0.5) * radius, y - 10, 30, 0x2e2722, 0.6, 1.8, 2.6, 26);
    this.decals.spawn({ texture: this.tex.scorch, x, y, life: 60, size: radius * 2.2, squash: 0.75, alpha: 0.7, rotation: rand() * 0.6 - 0.3, fadeIn: 0.1 });
  }

  private boulderImpact(x: number, y: number, radius: number, near: boolean): void {
    for (let i = 0; i < this.n(18); i++) {
      const a = rand() * Math.PI * 2;
      const sp = 90 + rand() * 90;
      this.dust.spawn({ texture: this.tex.dust, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: 10 + rand() * 30, drag: 3, life: 1.4 + rand() * 0.6, size: 26, grow: 2.8, squash: 0.65, alpha: 0.8, tint: 0xb9a888, spin: (rand() - 0.5) * 2 });
    }
    for (let i = 0; i < this.n(16); i++) this.rockFling(x, y, 150, 80 + rand() * 120);
    this.flash(x, y - 6, radius * 2.2, 0xfff0d0, 0.12);
    this.shockwave(x, y, 0xd8c8a8, radius * 0.5, radius * 3, 0.55, 0.7);
    this.decals.spawn({ texture: this.tex.crater, x, y, life: 90, size: radius * 2.4, squash: 0.7, alpha: 0.9, fadeIn: 0.05 });
    if (near) this.kick(0.15);
  }

  private scorchMark(x: number, y: number, radius: number): void {
    this.decals.spawn({ texture: this.tex.scorch, x, y, life: 60, size: radius * 3, squash: 0.7, alpha: 0.75, rotation: rand() - 0.5, fadeIn: 0.3 });
    for (let i = 0; i < this.n(6); i++) this.flame(x + (rand() - 0.5) * radius * 1.6, y + (rand() - 0.5) * radius, 0, -4, 10 + rand() * 8, 1.2 + rand() * 0.8, 0.3 + rand() * 0.4);
  }

  // ------------------------------------------------------------- healing

  private heal(x: number, y: number, holy: boolean): void {
    const tint = holy ? 0xffe9a0 : 0xd8ffd0;
    for (let i = 0; i < this.n(holy ? 10 : 6); i++) {
      this.fire.spawn({ texture: this.tex.mote, x: x + (rand() - 0.5) * 14, y: y - rand() * 6, vz: 30 + rand() * 30, vx: (rand() - 0.5) * 8, life: 0.9 + rand() * 0.4, size: 7, tint, spin: (rand() - 0.5) * 3, delay: rand() * 0.2 });
    }
    this.ring(x, y, tint, 4, 22, 0.5, 0.8);
    if (holy) this.pillar(x, y, 0xffe9a0, 16, 0.7);
  }

  // -------------------------------------------------------------- deaths

  private death(kind: Kind, x: number, y: number, tint: number, near: boolean): void {
    const alt = FLY_HEIGHT[kind] ?? 0;
    if (kind === Kind.Dragon) {
      this.flash(x, y - 20, 260, 0xffa040, 0.4);
      for (let i = 0; i < this.n(30); i++) this.ember(x, y - 20, 220, 120);
      for (let i = 0; i < this.n(16); i++) this.smoke(x + (rand() - 0.5) * 60, y, 50, 0x3a3028, 0.75, 3, 2.6, 40);
      this.shockwave(x, y, 0xffb070, 30, 220, 1, 0.8);
      this.floatText('DRAGON SLAIN', x, y - 90, 2.8, 20, 0xffb070);
      this.kick(0.6);
      return;
    }
    if (kind === Kind.Skeleton || kind === Kind.BoneGolem) {
      const big = kind === Kind.BoneGolem;
      for (let i = 0; i < this.n(big ? 18 : 7); i++) {
        this.dust.spawn({ texture: this.tex.bone[i % 3]!, x: x + (rand() - 0.5) * 6, y, z: 8 + rand() * (big ? 30 : 12), vx: (rand() - 0.5) * (big ? 120 : 70), vy: (rand() - 0.5) * 40, vz: 30 + rand() * 50, gravity: 260, life: 2.4, size: big ? 10 : 7, spin: (rand() - 0.5) * 12, fadeIn: 0 });
      }
      this.puff(x, y - 3, big ? 8 : 3, 0xd8d0b8, big ? 18 : 10);
      if (big) this.shockwave(x, y, 0xd8d0b8, 8, 70, 0.6, 0.6);
      return;
    }
    if (kind === Kind.Troll || kind === Kind.Knight) {
      this.puff(x, y, this.n(kind === Kind.Troll ? 12 : 7), 0xb7a888, 18, 16);
      this.shockwave(x, y, 0xc8b898, 8, kind === Kind.Troll ? 80 : 50, 0.6, 0.55);
      if (kind === Kind.Troll && near) this.kick(0.12);
    } else if (near) {
      this.puff(x, y - 3, 3, 0x9c8f78, 10);
    }
    if (kind === Kind.Champion) {
      this.shockwave(x, y, tint, 10, 130, 0.9);
      this.sparks(x, y - 10, this.n(18), GOLD, 130);
    }
    if (alt > 0) this.puff(x, y, this.n(8), 0xb7a888, 16, 12);
    // A faint soul rises from the fallen.
    if (near || STATS[kind]!.tier !== 'base') {
      this.fire.spawn({ texture: this.tex.wisp, x, y: y - 10 - alt, vz: 26, vx: (rand() - 0.5) * 6, life: 1.6, size: 12, grow: 1.4, alpha: 0.45, tint: 0xcfe6ff, delay: 0.25, fadeIn: 0.3 });
    }
  }

  private updateCorpses(dt: number): void {
    let w = 0;
    for (const c of this.corpses) {
      c.age += dt;
      if (c.age >= CORPSE_LIFE) {
        c.s.destroy();
        continue;
      }
      const fall = Math.min(1, c.age / 0.35);
      c.s.rotation = c.facing * 1.45 * fall * fall;
      if (c.drop > 0) {
        const t = Math.min(1, c.age / 0.5);
        c.s.y = c.y - c.drop * (1 - t * t);
      }
      c.s.alpha = Math.min(1, 2.2 * (1 - c.age / CORPSE_LIFE));
      const grey = 1 - Math.min(1, c.age / 0.6) * 0.45;
      c.s.tint = Math.round(0x8a * grey) * 0x10101;
      this.corpses[w++] = c;
    }
    this.corpses.length = w;
  }

  private dropCorpse(i: number): void {
    const c = this.corpses[i];
    if (!c) return;
    c.s.destroy();
    this.corpses.splice(i, 1);
  }

  private updateFloats(dt: number): void {
    let w = 0;
    for (const f of this.floats) {
      f.age += dt;
      if (f.age >= f.life) {
        f.t.destroy();
        continue;
      }
      const t = f.age / f.life;
      f.t.position.set(f.x, f.y - (40 * t) / this.zoom);
      f.t.scale.set((1 + Math.min(1, f.age * 6) * 0.15) / this.zoom);
      f.t.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.floats[w++] = f;
    }
    this.floats.length = w;
  }

  // -------------------------------------------------------- primitives

  /** Scales a particle count by reduced motion and current load. */
  private n(base: number): number {
    const load = Math.min(1, Math.min(this.fire.headroom, this.dust.headroom) * 1.6);
    return Math.max(1, Math.round(base * load * (this.reduced ? 0.35 : 1)));
  }

  private kick(amount: number): void {
    if (!this.reduced) this.shake = Math.max(this.shake, amount);
  }

  private sparks(x: number, y: number, count: number, tint: number, speed: number, rise = 0): void {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.4 + rand() * 0.6);
      this.fire.spawn({ texture: this.tex.streak, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rise * rand(), gravity: rise ? 80 : 0, drag: 3, life: 0.25 + rand() * 0.2, size: 9, tint, stretch: true, fadeIn: 0 });
    }
  }

  private chips(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) this.dust.spawn({ texture: this.tex.rock[i % 3]!, x, y, vx: (rand() - 0.5) * 80, vz: 40 + rand() * 50, gravity: 300, life: 0.9, size: 5, spin: (rand() - 0.5) * 10 });
  }

  private rockFling(x: number, y: number, speed: number, up: number): void {
    const a = rand() * Math.PI * 2;
    this.dust.spawn({ texture: this.tex.rock[(rand() * 3) | 0]!, x, y, z: 4, vx: Math.cos(a) * speed * rand(), vy: Math.sin(a) * speed * 0.5 * rand(), vz: up, gravity: 320, life: 1.8 + rand(), size: 6 + rand() * 6, spin: (rand() - 0.5) * 10, fadeIn: 0 });
  }

  private puff(x: number, y: number, count: number, tint: number, size: number, spread = 6): void {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      this.dust.spawn({ texture: this.tex.dust, x: x + (rand() - 0.5) * spread, y: y + (rand() - 0.5) * spread * 0.5, vx: Math.cos(a) * 30, vy: Math.sin(a) * 14, vz: 6, drag: 2.5, life: 0.7 + rand() * 0.5, size, grow: 2, squash: 0.7, alpha: 0.55, tint, spin: (rand() - 0.5) * 1.5 });
    }
  }

  private smoke(x: number, y: number, speed: number, tint: number, alpha: number, life: number, grow = 2.4, size = 34): void {
    const a = rand() * Math.PI * 2;
    this.dust.spawn({ texture: this.tex.smoke[(rand() * 3) | 0]!, x, y, vx: Math.cos(a) * speed * 0.6 + 6, vy: Math.sin(a) * speed * 0.3, vz: 18 + rand() * 20, drag: 1.2, life: life * (0.7 + rand() * 0.6), size: size * (0.7 + rand() * 0.6), grow, alpha, tint, spin: (rand() - 0.5) * 0.8, fadeIn: 0.25 });
  }

  private ember(x: number, y: number, speed: number, up: number): void {
    const a = rand() * Math.PI * 2;
    const sp = speed * (0.3 + rand() * 0.7);
    this.fire.spawn({ texture: this.tex.ember, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: up * (0.4 + rand()), gravity: 70, drag: 1.4, life: 0.9 + rand() * 0.9, size: 5 + rand() * 4, tint: 0xffe2a0, tintTo: 0xff3a10, fadeIn: 0 });
  }

  private flame(x: number, y: number, vx: number, vy: number, size: number, life: number, delay = 0): void {
    this.fire.spawn({ texture: this.tex.flame[0]!, frames: this.tex.flame, x, y, vx, vy, vz: 14, life, size, grow: 1.5, tint: 0xfff0b0, tintTo: 0xd0380c, alpha: 0.95, anchorY: 0.85, delay, fadeIn: 0.05 });
  }

  private flash(x: number, y: number, size: number, tint: number, life: number): void {
    this.fire.spawn({ texture: this.tex.soft, x, y, life, size, grow: 1.3, alpha: 0.9, tint, fadeIn: 0 });
  }

  private ring(x: number, y: number, tint: number, from: number, to: number, life: number, alpha = 0.9): void {
    this.fire.spawn({ texture: this.tex.ring, x, y, life, size: from, grow: to / from, squash: 0.62, alpha, tint, fadeIn: 0 });
  }

  private shockwave(x: number, y: number, tint: number, from: number, to: number, life: number, alpha = 0.95): void {
    this.fire.spawn({ texture: this.tex.shockwave, x, y, life, size: from, grow: to / from, squash: 0.62, alpha, tint, fadeIn: 0 });
  }

  private pillar(x: number, y: number, tint: number, width: number, life: number): void {
    this.fire.spawn({ texture: this.tex.pillar, x, y: y + 4, life, size: width, grow: 1.1, alpha: 0.75, tint, anchorY: 1, fadeIn: 0.08 });
  }
}
