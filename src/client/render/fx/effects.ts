import { Container, Graphics, Sprite, Text, Texture, type Particle } from 'pixi.js';
import { BlastKind, Kind, NEUTRAL, ShotKind, type TickEvents, type World } from '../../../sim/api.ts';
import type { ChronicleEntry } from '../../../sim/chronicle.ts';
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
  /** Optional override of `Effects.flyHeight`. */
  flyHeight?: (kind: Kind) => number;
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

/** A camera move the renderer may honor: only while following, never against the user's own panning. */
export interface CinematicShot {
  x: number;
  y: number;
  zoom: number;
  holdMs: number;
  reason: 'dragon' | 'sack' | 'monolith' | 'muster';
}

/** Plays a named, positioned sound cue at a relative gain. */
export type SoundCue = (name: string, x: number, y: number, gain: number) => void;

/** Altitude at which flying kinds are drawn above their ground position. */
export const FLY_HEIGHT: Partial<Record<Kind, number>> = { [Kind.GriffinRider]: 18, [Kind.Dragon]: 34 };

const GOLD = 0xd4a93e;
const GOLD_HI = 0xf6dc8c;
const INK = 0x22180f;
const INK_NIGHT = 0x12161f;
const VELLUM = 0xefe4c8;
const EMBER = 0xff9a3c;
const VERMILION = 0xb8321f;
const MAX_SCROLLS = 4;
const SCROLL_HOLD = 4;
/** Fraction of a capital's walls left at which they begin to crack. */
const CRACK_AT = 0.15;
/** Fraction of the Monolith left at which its glyphs flare. */
const GLYPH_FLARE_AT = 0.1;
const GLOW_PER_CELL = 10;
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

/** A herald's scroll unrolled above a newly mustered platoon. */
interface Scroll {
  c: Container;
  paper: Container;
  mask: Graphics;
  left: Graphics;
  right: Graphics;
  platoon: number;
  width: number;
  height: number;
  age: number;
  x: number;
  y: number;
  /** Screen pixels this scroll is lifted so it does not cover an older one; eased. */
  stack: number;
}

/** A full-size sprite eased along a path with an alpha envelope: dims, shadows, washes. */
interface Sweep {
  s: Sprite;
  age: number;
  delay: number;
  life: number;
  fadeIn: number;
  fadeOut: number;
  peak: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  k0: number;
  k1: number;
  sx: number;
  sy: number;
}

/** Dust kicked up behind a platoon marching out of its gates. */
interface Trail {
  platoon: number;
  age: number;
  acc: number;
}

interface Timer {
  at: number;
  fn: () => void;
}

interface Float {
  t: Text;
  x: number;
  y: number;
  age: number;
  life: number;
}

const rand = Math.random;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
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
  /** World height of a flying kind's body above its ground point. Replace to match the unit art. */
  flyHeight: (kind: Kind) => number = (kind) => FLY_HEIGHT[kind] ?? 0;
  // Hooks the renderer fills in. Declared, not initialized, so `'cinematic' in fx` stays false until wired.
  /** Sound cues, wired by the renderer to the audio engine. */
  declare sound?: SoundCue;
  /** Asks the renderer's camera for a set-piece shot. */
  declare cinematic?: (shot: CinematicShot) => void;
  /** Swings a capital's gates open as a platoon marches out. */
  declare openGate?: (site: number) => void;
  /** The watching player, whose own pushes get the grand treatment. */
  viewerP: number | null = null;

  private readonly tex: FxTextures;
  private readonly decals = new ParticlePool(900, false);
  private readonly corpseLayer = new Container();
  private readonly dust = new ParticlePool(5000, false);
  private readonly fire = new ParticlePool(6000, true);
  /** Flame bodies and fire clouds: normal blending, so overlapping fire stays orange instead of blowing out to white. */
  private readonly flames = new ParticlePool(5000, false);
  /** Additive spawns per 32-unit cell in the current window, so dense fights cannot saturate to white. */
  private glowCells = new Map<number, number>();
  private glowWindow = 0;
  private projectiles: Projectile[] = [];
  private breaths: Breath[] = [];
  private burners: Burner[] = [];
  private corpses: Corpse[] = [];
  private floats: Float[] = [];
  private zoom = 1;
  private readonly reduced: boolean;
  private clock = 0;
  private readonly lastCue = new Map<string, number>();
  private scrolls: Scroll[] = [];
  /** Commit messages from the chronicle, by platoon, until the platoon marches. */
  private readonly messages = new Map<number, string>();
  /** Platoons that marched before their chronicle entry arrived, with the time they marched. */
  private readonly awaiting = new Map<number, number>();
  private sweeps: Sweep[] = [];
  private trails: Trail[] = [];
  private timers: Timer[] = [];
  /** Veteran rank last seen per player, or -1 before the first look. */
  private vet: number[] = [];
  /** Structures whose walls have begun to crack. */
  private readonly cracking = new Set<number>();
  private monolithFlaring = false;
  /** Night strength 0..1 from the renderer's daylight: fire and embers bloom brighter in the dark. */
  private night = 0;
  private world: World | null = null;
  // Where every soldier stood at the last step, so those who vanish can be shown leaving.
  private prevN = 0;
  private prevId = new Int32Array(0);
  private prevP = new Int16Array(0);
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);

  constructor(opts: { reducedMotion?: boolean } = {}) {
    this.reduced = opts.reducedMotion ?? false;
    this.tex = makeFxTextures();
    this.ground.addChild(this.decals.container, this.corpseLayer);
    this.air.addChild(this.dust.container);
    this.glow.addChild(this.flames.container, this.fire.container);
  }

  get counts(): { particles: number; projectiles: number; decals: number; corpses: number } {
    return { particles: this.dust.count + this.fire.count + this.flames.count, projectiles: this.projectiles.length, decals: this.decals.count, corpses: this.corpses.length };
  }

  // ------------------------------------------------------------- events

  onStep(ev: TickEvents, world: World, ctx: StepContext): void {
    const { posOf, tints, near, bounds } = ctx;
    if (ctx.flyHeight) this.flyHeight = ctx.flyHeight;
    this.world = world;
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

    let volley = 0;
    for (const s of ev.shots) {
      const target = posOf(s.to);
      if (!target) continue;
      if (!bounds.contains(target.x, target.y) && !bounds.contains(s.x, s.y)) continue;
      if (s.kind === ShotKind.Arrow || s.kind === ShotKind.RangerArrow) {
        if (volley++ === 0) this.cue('bow-volley', s.x, s.y, 0.6);
      } else {
        this.cue(s.kind === ShotKind.Fireball ? 'fireball-cast' : s.kind === ShotKind.Boulder ? 'trebuchet-launch' : 'tower-bolt', s.x, s.y, 0.8);
      }
      const shooterAlt = s.from > 0 ? this.altOf(flyerKind(s.from)) : 0;
      const targetAlt = s.to > 0 ? this.altOf(flyerKind(s.to)) : 0;
      this.launch(s.kind, s.x, s.y, shooterAlt, target.x, target.y, targetAlt, tick, Math.max(tick + 1, s.land), s.to);
    }

    // Wind-ups: a glint of steel raised, the instant before the blow lands.
    if (near) {
      let swings = 0;
      for (const sw of ev.swings) {
        if (swings >= 40) break;
        const p = posOf(sw.from);
        if (!p || !bounds.contains(p.x, p.y)) continue;
        const alt = this.altOf(flyerKind(sw.from));
        this.glowSpawn({ texture: this.tex.spark, x: p.x + (rand() - 0.5) * 6, y: p.y - 16 - alt, life: 0.16, size: 9, grow: 0.5, alpha: 0.9, tint: 0xfff2c8, rotation: rand() * 0.8, fadeIn: 0.04 });
        if (swings++ === 0) this.cue('swing', p.x, p.y, 0.35);
      }
    }

    for (const b of ev.breaths) {
      if (!bounds.contains(b.x, b.y) && !bounds.contains(b.tx, b.ty)) continue;
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      this.breaths.push({ from: b.from, x: b.x, y: b.y, dx: dx / d, dy: dy / d, range: b.range, age: 0, acc: 0 });
      this.kick(near ? 0.35 : 0.15);
      this.cue('dragon-breath', b.x, b.y, 1);
      // The cone leaves the earth scorched where it reached.
      for (let i = 1; i <= 3; i++) {
        const t = 0.35 + i * 0.2;
        this.decals.spawn({ texture: this.tex.scorch, x: b.x + (dx / d) * b.range * t, y: b.y + (dy / d) * b.range * t, life: 45, size: b.range * (0.25 + t * 0.3), squash: 0.6, alpha: 0.6, rotation: angleOf(dx, dy) + (rand() - 0.5) * 0.4, delay: 0.2 + t * 0.3, fadeIn: 0.4 });
      }
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
      if (b.kind === BlastKind.Fireball) {
        this.fireballBurst(b.x, b.y, b.radius);
        this.cue('fireball-blast', b.x, b.y, 1);
      } else if (b.kind === BlastKind.Boulder) {
        this.boulderImpact(b.x, b.y, b.radius, near);
        this.cue('boulder-impact', b.x, b.y, 1);
      }
      else this.scorchMark(b.x, b.y, b.radius);
    }

    for (const h of ev.heals) {
      const p = posOf(h.to);
      if (!p || !bounds.contains(p.x, p.y)) continue;
      const healer = world.units.find((u) => u.id === h.from);
      const holy = healer?.kind === Kind.Paladin;
      this.heal(p.x, p.y - this.altOf(flyerKind(h.to)), holy);
      this.cue(holy ? 'heal-holy' : 'heal', p.x, p.y, 0.6);
    }

    if (near) {
      let hits = 0;
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
          this.cue('hit-heavy', x, y, 0.4);
          continue;
        }
        if (++hits > 80) break;
        const p = posOf(h.unit);
        if (!p || !bounds.contains(p.x, p.y)) continue;
        const alt = this.altOf(flyerKind(h.unit));
        this.impact(p.x, p.y, alt, h.damage > 18);
        this.cue(h.damage > 18 ? 'hit-heavy' : 'hit-steel', p.x, p.y, 0.5);
      }
    }

    for (const d of ev.deaths) {
      const p = posOf(d.unit);
      const x = p?.x ?? d.x;
      const y = p?.y ?? d.y;
      if (!bounds.contains(x, y)) continue;
      this.death(d.kind, x, y, tint(d.p), near);
      const undead = d.kind === Kind.Skeleton || d.kind === Kind.BoneGolem;
      const big = d.kind === Kind.Troll || d.kind === Kind.Knight || d.kind === Kind.Champion || d.kind === Kind.BoneGolem;
      this.cue(d.kind === Kind.Dragon ? 'dragon-slain' : undead ? 'death-bones' : big ? 'death-big' : 'death', x, y, near ? 0.7 : 0.4);
    }

    if (ev.desertions.length || ev.departures.length) this.leavers(ev, world, bounds);
    this.remember(world);

    for (const m of ev.marches) {
      const pl = world.platoons.find((x) => x.id === m.platoon);
      if (pl) this.muster(pl.id, pl.p, pl.x, pl.y, (pl.mustered[Kind.Dragon] ?? 0) > 0, world, bounds, tint(pl.p));
    }

    for (const r of ev.routs) {
      const pl = world.platoons.find((x) => x.id === r.platoon);
      if (!pl || !bounds.contains(pl.x, pl.y)) continue;
      this.rout(pl.x, pl.y, world.map.sites[world.players[pl.p]?.slot ?? -1]);
    }

    for (const r of ev.regroups) {
      const from = world.platoons.find((x) => x.id === r.from);
      const to = world.platoons.find((x) => x.id === r.to);
      const a = from ?? to;
      if (!a || !to || !bounds.contains(a.x, a.y)) continue;
      // The remnant's banner folds into the larger company: a trail of dust and motes between them.
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        this.glowSpawn({ texture: this.tex.mote, x: a.x + (to.x - a.x) * t, y: a.y + (to.y - a.y) * t - 20, vz: 10, life: 0.8, size: 6, tint: tint(to.p), delay: t * 0.4 });
      }
      this.puff(a.x, a.y, this.n(5), 0xc8b48c, 14, 16);
      this.ring(to.x, to.y, tint(to.p), 8, 50, 0.6, 0.7);
      this.cue('regroup', to.x, to.y, 0.6);
    }

    for (const c of ev.captures) {
      const site = world.map.sites[c.site]!;
      const t = tint(c.p);
      this.ring(site.x, site.y, t, site.radius, site.radius * 2.6, 1.2);
      this.ring(site.x, site.y, 0xffffff, site.radius * 0.6, site.radius * 1.8, 0.8, 0.6);
      this.pillar(site.x, site.y, t, site.radius * 0.8, 1.2);
      this.sparks(site.x, site.y - 20, this.n(26), t, 150, 40);
      this.cue('capture', site.x, site.y, 1);
    }

    for (const s of ev.sacks) {
      const site = world.map.sites[s.site]!;
      this.sack(site.x, site.y, site.radius, s.p === this.viewerP || s.victim === this.viewerP);
    }

    for (const r of ev.rebuilt) {
      const site = world.map.sites[r.site]!;
      const owner = world.players.find((p) => p.slot === site.slot);
      this.puff(site.x, site.y, this.n(20), 0xcab89a, 26, site.radius);
      this.ring(site.x, site.y, owner ? tint(owner.p) : 0xffffff, site.radius, site.radius * 2.2, 1.2);
      this.sparks(site.x, site.y - site.radius, this.n(16), GOLD, 100, 30);
      this.cue('rebuilt', site.x, site.y, 1);
    }

    if (ev.monolith) {
      const st = world.structures.find((x) => x.p === NEUTRAL);
      const site = st ? world.map.sites[st.site] : undefined;
      this.monolithFalls(site?.x ?? 0, site?.y ?? 0, site?.radius ?? 40);
    }

    for (const c of ev.cries) {
      const p = world.players[c.p];
      if (!p) continue;
      const site = world.map.sites[p.slot]!;
      this.shockwave(site.x, site.y, GOLD, 30, 620, 1.8);
      this.shockwave(site.x, site.y, 0xffffff, 20, 380, 1.2, 0.6);
      this.pillar(site.x, site.y, GOLD, site.radius, 1.6);
      this.sparks(site.x, site.y - 40, this.n(40), GOLD, 240, 60);
      this.floatText('War Cry!', site.x, site.y - site.radius * 2.5, 2.6, 24, GOLD_HI);
      this.cue('war-cry', site.x, site.y, 1);
    }

    this.watchWalls(world, bounds);
    this.watchRanks(world, bounds, tint);

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
    this.clock += dt;
    this.shake = this.reduced ? 0 : Math.max(0, this.shake - dt * 1.6);
    this.runTimers();
    this.updateScrolls(dt);
    this.updateSweeps(dt);
    this.updateTrails(dt, bounds);
    this.updateProjectiles(dt, simTime, posOf);
    this.updateBreaths(dt, posOf);
    this.updateBurners(dt, posOf, bounds);
    this.updateCorpses(dt);
    this.updateFloats(dt);
    this.decals.update(dt);
    this.dust.update(dt);
    this.flames.update(dt);
    this.fire.update(dt);
    this.glowWindow += dt;
    if (this.glowWindow >= 0.25) {
      this.glowWindow = 0;
      this.glowCells.clear();
    }
  }

  // ------------------------------------------------------- public extras

  /** The hour's light, every frame. */
  setDaylight(light: { lights: number }): void {
    this.night = Math.max(0, Math.min(1, light.lights));
  }

  /** New chronicle lines: muster entries carry the commit message for the herald's scroll. */
  onChronicle(entries: readonly ChronicleEntry[], world: World): void {
    for (const e of entries) {
      if (e.kind !== 'muster' || e.platoon < 0) continue;
      const m = /"(.*)"\.\s[^"]*$/s.exec(e.text);
      const msg = m?.[1]?.trim().split('\n')[0];
      if (!msg) continue;
      if (this.awaiting.has(e.platoon)) {
        this.awaiting.delete(e.platoon);
        const pl = world.platoons.find((x) => x.id === e.platoon);
        if (pl) this.scroll(pl.id, msg, pl.p === this.viewerP, pl.x, pl.y);
      } else {
        if (this.messages.size > 256) this.messages.clear();
        this.messages.set(e.platoon, msg);
      }
    }
  }

  /** The war's end: the sun sets in crimson, then night ink washes across the map. */
  dayEnd(world: World | null = this.world): void {
    if (!world) return;
    const R = world.map.radius;
    this.cue('day-end', 0, 0, 1);
    const hold = 9;
    this.sweep(this.tex.soft, 0, 0, 0, 0, R * 3.2, R * 3.2, { tint: VERMILION, peak: 0.34, life: hold + 3, fadeIn: 1.6, fadeOut: 2.5 });
    this.sweep(Texture.WHITE, 0, 0, 0, 0, R * 4, R * 4, { tint: 0x5a1a10, peak: 0.16, life: hold + 3, fadeIn: 1.4, fadeOut: 2.5 });
    // Ink washes in from the west, blot by blot, then lifts for the dawn.
    const blots = this.reduced ? 5 : 8;
    for (let i = 0; i < blots; i++) {
      const t = i / (blots - 1);
      const x = -R + t * R * 2 + (rand() - 0.5) * R * 0.2;
      const y = (i % 2 ? 0.45 : -0.45) * R + (rand() - 0.5) * R * 0.3;
      const size = R * (1.5 + rand() * 0.4);
      this.sweep(this.tex.inkWash, x - R * 0.2, y, x, y, size, size, { tint: INK_NIGHT, peak: 0.85, delay: 1.4 + t * 1.8, life: hold - t * 1.8, fadeIn: 0.9, fadeOut: 2, k0: 0.6, k1: 1.15 });
    }
  }

  burst(b: Burst): void {
    const count = this.n(b.count);
    const kind = b.texture ?? 'soft';
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const sp = b.speed * (0.35 + rand() * 0.65);
      const spread = b.spread ?? 0;
      const spawn: Spawn = {
        texture: kind === 'smoke' ? this.tex.inkSmoke[i % 3]! : kind === 'ember' ? this.tex.ember : kind === 'spark' ? this.tex.spark : this.tex.soft,
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

  /**
   * A soldier falls and fades. `scale` is world units per texture pixel; feet sit at (x, y).
   * `anchorY` is the feet's fraction of the texture height; without it feet are assumed at 84/96.
   */
  corpse(texture: Texture, x: number, y: number, facing: number, scale: number, tint: number, altitude = 0, anchorY?: number): void {
    if (this.corpses.length >= MAX_CORPSES) this.dropCorpse(0);
    const s = new Sprite(texture);
    s.anchor.set(0.5, anchorY ?? 0.5);
    s.tint = tint;
    s.scale.set(scale * facing, scale);
    const feet = anchorY === undefined ? (FEET_FRAC - 0.5) * texture.frame.height * scale : 0;
    s.position.set(x, y - feet - altitude);
    this.corpseLayer.addChild(s);
    this.corpses.push({ s, age: 0, facing: facing >= 0 ? 1 : -1, x, y: y - feet, drop: altitude });
    this.decals.spawn({ texture: this.tex.dust, x, y: y + 1, life: 120, size: texture.frame.width * scale * 0.9, squash: 0.45, alpha: 0.32, tint: 0x3b2f22, fadeIn: 0.4 });
  }

  floatText(text: string, x: number, y: number, life: number, size: number, color = 0xffffff): void {
    const t = new Text({
      text,
      style: {
        fontFamily: '"IM Fell English SC", "Alegreya SC", Georgia, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif',
        fontSize: Math.max(15, size),
        fill: color,
        stroke: { color: INK, width: Math.max(4, size * 0.22), join: 'round' },
        dropShadow: { color: INK, alpha: 0.45, blur: 2, distance: 2, angle: Math.PI * 0.3 },
        letterSpacing: 1,
      },
      resolution: 2,
    });
    t.anchor.set(0.5);
    this.overlay.addChild(t);
    this.floats.push({ t, x, y, age: 0, life });
  }

  destroy(): void {
    for (const f of this.floats) f.t.destroy();
    for (const sc of this.scrolls) sc.c.destroy({ children: true });
    for (const sw of this.sweeps) sw.s.destroy();
    this.scrolls = [];
    this.sweeps = [];
    this.timers = [];
    for (const c of this.corpses) c.s.destroy();
    for (const p of this.projectiles) {
      this.dust.release(p.body);
      this.fire.release(p.body);
      this.decals.release(p.shadow);
    }
    this.decals.clear();
    this.dust.clear();
    this.flames.clear();
    this.fire.clear();
    this.ground.destroy({ children: true });
    this.air.destroy({ children: true });
    this.glow.destroy({ children: true });
    this.overlay.destroy({ children: true });
  }


  // ---------------------------------------------------------- set pieces

  /** A sound cue, at most one per name every 50 ms; the audio engine throttles and caps voices too. */
  private cue(name: string, x: number, y: number, gain: number): void {
    if (!this.sound) return;
    const last = this.lastCue.get(name) ?? -1;
    if (this.clock - last < 0.05) return;
    this.lastCue.set(name, this.clock);
    this.sound(name, x, y, gain);
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.clock + seconds, fn });
  }

  private runTimers(): void {
    if (!this.timers.length) return;
    let w = 0;
    const due: Timer[] = [];
    for (const t of this.timers) {
      if (t.at <= this.clock) due.push(t);
      else this.timers[w++] = t;
    }
    this.timers.length = w;
    for (const t of due) t.fn();
  }

  /** A blow lands: an inked starburst, flung droplets of ink, and a splatter left on the ground. */
  private impact(x: number, y: number, alt: number, heavy: boolean): void {
    const hy = y - 8 - alt;
    this.flames.spawn({ texture: this.tex.burst, x: x + (rand() - 0.5) * 4, y: hy, life: heavy ? 0.16 : 0.11, size: heavy ? 15 : 9, grow: 1.5, tint: heavy ? GOLD_HI : 0xfff6dc, rotation: rand() * 6.28, fadeIn: 0 });
    for (let i = 0; i < (heavy ? 3 : 2); i++) {
      this.dust.spawn({ texture: this.tex.droplet, x, y: y, z: 8 + alt, vx: (rand() - 0.5) * 90, vy: (rand() - 0.5) * 30, vz: 30 + rand() * 50, gravity: 300, life: 0.45, size: heavy ? 4 : 3, stretch: true, fadeIn: 0 });
    }
    if (heavy) this.sparks(x, hy, 2, GOLD_HI, 70);
    if (alt === 0 && rand() < (heavy ? 0.5 : 0.22)) {
      this.decals.spawn({ texture: this.tex.inkSplat[(rand() * 3) | 0]!, x: x + (rand() - 0.5) * 8, y: y + 1, life: 14, size: heavy ? 17 : 11, squash: 0.55, alpha: 0.6, rotation: rand() * 6.28, delay: 0.2, fadeIn: 0.05 });
    }
  }

  /** Keeps where every soldier stood, so deserters can be shown walking away next step. */
  private remember(world: World): void {
    const n = world.units.length;
    if (this.prevId.length < n) {
      const cap = Math.max(256, n * 2);
      this.prevId = new Int32Array(cap);
      this.prevP = new Int16Array(cap);
      this.prevX = new Float32Array(cap);
      this.prevY = new Float32Array(cap);
    }
    for (let i = 0; i < n; i++) {
      const u = world.units[i]!;
      this.prevId[i] = u.id;
      this.prevP[i] = u.p;
      this.prevX[i] = u.x;
      this.prevY[i] = u.y;
    }
    this.prevN = n;
  }

  /** Deserters and departing mercenaries fade into ink dust, walking away from the war. */
  private leavers(ev: TickEvents, world: World, bounds: Bounds): void {
    const gone = new Set<number>();
    for (const d of ev.departures) gone.add(d.unit);
    if (ev.desertions.length) {
      const deserting = new Set<number>();
      for (const d of ev.desertions) {
        deserting.add(d.p);
        const site = world.map.sites[world.players[d.p]?.slot ?? -1];
        if (site) this.cue('desert', site.x, site.y, 0.8);
      }
      const here = new Set<number>();
      for (const u of world.units) if (deserting.has(u.p)) here.add(u.id);
      for (const d of ev.deaths) here.add(d.unit);
      for (let i = 0; i < this.prevN; i++) if (deserting.has(this.prevP[i]!) && !here.has(this.prevId[i]!)) gone.add(this.prevId[i]!);
    }
    let shown = 0;
    for (let i = 0; i < this.prevN && shown < 40; i++) {
      if (!gone.has(this.prevId[i]!)) continue;
      const x = this.prevX[i]!;
      const y = this.prevY[i]!;
      if (!bounds.contains(x, y)) continue;
      shown++;
      this.fadeAway(x, y);
    }
  }

  private fadeAway(x: number, y: number): void {
    // Away from the heart of the map, toward the margins.
    const d = Math.hypot(x, y) || 1;
    const dx = x / d;
    const dy = y / d;
    // An ink figure walks off and comes apart into dust as it goes.
    this.dust.spawn({ texture: this.tex.wisp, x, y, z: 2, vx: dx * 14, vy: dy * 7, life: 1.3, size: 16, grow: 1.25, alpha: 0.8, tint: INK, tintTo: 0x6a5a48, anchorY: 1, fadeIn: 0 });
    for (let k = 0; k < this.n(8); k++) {
      const t = k / 8;
      this.dust.spawn({ texture: this.tex.inkSmoke[(rand() * 3) | 0]!, x: x + (rand() - 0.5) * 6, y: y - 2, z: 2 + t * 16, vx: dx * 18 + (rand() - 0.5) * 8, vy: dy * 9, vz: 5 + rand() * 6, drag: 0.6, life: 1.5 + rand() * 0.6, size: 10 + rand() * 6, grow: 1.8, alpha: 0.85, tint: 0x2a2018, tintTo: 0xb9a477, spin: (rand() - 0.5) * 0.4, delay: 0.3 + t * 0.5, fadeIn: 0.15 });
    }
    for (let k = 0; k < 3; k++) this.dust.spawn({ texture: this.tex.droplet, x, y: y - 6, vx: dx * 20 + (rand() - 0.5) * 20, vy: dy * 10, vz: 10 + rand() * 20, gravity: 40, life: 1, size: 2.5, alpha: 0.8, delay: rand() * 0.3 });
    this.footprints(x, y, dx, dy, 5, 7);
  }

  private footprints(x: number, y: number, dx: number, dy: number, steps: number, stride: number): void {
    const rot = angleOf(dx, dy) + Math.PI / 2;
    for (let k = 1; k <= steps; k++) {
      const side = k % 2 ? 1.8 : -1.8;
      this.decals.spawn({ texture: this.tex.footprint, x: x + dx * stride * k - dy * side, y: y + dy * stride * k * 0.7 + dx * side, life: 9, size: 4.5, squash: 0.7, alpha: 0.45, rotation: rot, delay: k * 0.12, fadeIn: 0.05 });
    }
  }

  /** A platoon marches out: horn, gates, banner unfurled, the herald's scroll, dust on the road. */
  private muster(id: number, p: number, x: number, y: number, dragon: boolean, world: World, bounds: Bounds, t: number): void {
    const own = p === this.viewerP;
    const slot = world.players[p]?.slot ?? -1;
    const gate = world.map.sites[slot];
    if (gate) {
      this.openGate?.(slot);
      this.cue('muster-horn', gate.x, gate.y, own ? 1 : 0.6);
      this.cue('gate-open', gate.x, gate.y, own ? 0.9 : 0.5);
    }
    if (bounds.contains(x, y) || own) {
      this.after(0.35, () => this.cue('banner-unfurl', x, y, own ? 1 : 0.6));
      this.puff(x, y, this.n(10), 0xc8b48c, 16, 30);
      this.ring(x, y, t, 10, 90, 0.8);
      // The banner unfurls in a flurry of gold leaf and pigment.
      for (let i = 0; i < this.n(own ? 18 : 10); i++) {
        this.dust.spawn({ texture: this.tex.goldLeaf[i % 3]!, x: x + (rand() - 0.5) * 16, y, z: 30 + rand() * 10, vx: (rand() - 0.5) * 70, vz: 30 + rand() * 50, gravity: 40, drag: 1.4, life: 1.4 + rand() * 0.6, size: 4 + rand() * 2, spin: (rand() - 0.5) * 10, delay: rand() * 0.3, fadeIn: 0 });
      }
      this.sparks(x, y - 30, this.n(8), t, 80);
      if (this.trails.length < 24) this.trails.push({ platoon: id, age: 0, acc: 0 });
    }
    const msg = this.messages.get(id);
    if (msg !== undefined) {
      this.messages.delete(id);
      this.scroll(id, msg, own, x, y);
    } else {
      this.awaiting.set(id, this.clock);
    }
    if (own) this.cinematic?.({ x, y, zoom: 1.35, holdMs: 2400, reason: 'muster' });
    if (dragon && gate) this.dragonSummon(gate.x, gate.y, world.map.radius);
  }

  /** The commit message, proclaimed on a herald's scroll above the platoon. */
  private scroll(platoon: number, msg: string, grand: boolean, x: number, y: number): void {
    if (this.scrolls.length >= MAX_SCROLLS) {
      const old = this.scrolls.shift()!;
      old.c.destroy({ children: true });
    }
    const clipped = msg.length > 64 ? `${msg.slice(0, 62).trimEnd()}…` : msg;
    const text = new Text({
      text: clipped,
      style: { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 15, fill: INK, fontWeight: '500', wordWrap: true, breakWords: true, wordWrapWidth: grand ? 320 : 290, align: 'center', lineHeight: 18 },
      resolution: 2,
    });
    text.anchor.set(0.5);
    const w = Math.ceil(text.width) + 40;
    const h = Math.ceil(text.height) + (grand ? 18 : 14);
    const paper = new Container();
    const sheet = new Graphics();
    // Vellum with deckled top and bottom edges, an ink rule inset, and a cool shade along the bottom.
    const pts: number[] = [];
    for (let i = 0; i <= w; i += 6) pts.push(-w / 2 + i, -h / 2 + (i % 12 ? 0.8 : -0.6));
    for (let i = w; i >= 0; i -= 6) pts.push(-w / 2 + i, h / 2 + (i % 12 ? -0.6 : 0.9));
    sheet.poly(pts).fill(VELLUM).stroke({ color: INK, width: 1.5, alpha: 0.9 });
    sheet.rect(-w / 2, h / 2 - 6, w, 5).fill({ color: 0xb9a477, alpha: 0.35 });
    sheet.rect(-w / 2 + 6, -h / 2 + 4, w - 12, h - 8).stroke({ color: grand ? GOLD : 0xb9a477, width: 1 });
    paper.addChild(sheet, text);

    const mask = new Graphics().rect(-w / 2 - 2, -h / 2 - 4, w + 4, h + 8).fill(0xffffff);
    paper.mask = mask;
    const roller = () => {
      const g = new Graphics();
      g.roundRect(-4, -h / 2 - 5, 8, h + 10, 3).fill(0xd9c79e).stroke({ color: INK, width: 1.4 });
      g.rect(-4, -2, 8, 4).fill({ color: 0x8a6418, alpha: 0.5 });
      g.circle(0, -h / 2 - 6, 2.4).fill(grand ? GOLD : 0x8a6418).stroke({ color: INK, width: 1 });
      g.circle(0, h / 2 + 6, 2.4).fill(grand ? GOLD : 0x8a6418).stroke({ color: INK, width: 1 });
      return g;
    };
    const left = roller();
    const right = roller();
    // A vermilion ribbon and a wax seal hang from the scroll toward the banner.
    const seal = new Graphics();
    seal.moveTo(-3, h / 2).lineTo(-6, h / 2 + 16).lineTo(-2, h / 2 + 13).lineTo(0, h / 2 + 18).lineTo(2, h / 2 + 13).lineTo(6, h / 2 + 16).lineTo(3, h / 2).fill(VERMILION).stroke({ color: INK, width: 1 });
    seal.circle(0, h / 2 + 2, 6).fill(0x8f2416).stroke({ color: INK, width: 1.2 });
    seal.circle(-1.5, h / 2 + 0.5, 2).fill({ color: 0xffffff, alpha: 0.25 });
    const c = new Container();
    c.addChild(seal, paper, mask, left, right);
    if (grand) {
      // Your own push gets a rubricated heading, as a herald would cry it.
      const title = new Text({ text: 'Your banner rises', style: { fontFamily: '"IM Fell English SC", "Alegreya SC", Georgia, serif', fontSize: 18, fill: VERMILION, stroke: { color: VELLUM, width: 4, join: 'round' } }, resolution: 2 });
      title.anchor.set(0.5, 1);
      title.y = -h / 2 - 6;
      c.addChild(title);
    }
    c.pivot.set(0, 74 + h / 2);
    c.position.set(x, y);
    c.scale.set(1 / this.zoom);
    c.alpha = 0;
    this.overlay.addChild(c);
    this.scrolls.push({ c, paper, mask, left, right, platoon, width: w, height: h + (grand ? 30 : 12), age: 0, x, y, stack: 0 });
    this.cue('scroll-unroll', x, y, grand ? 0.9 : 0.5);
  }

  private updateScrolls(dt: number): void {
    if (this.awaiting.size) for (const [id, at] of this.awaiting) if (this.clock - at > 2) this.awaiting.delete(id);
    if (!this.scrolls.length) return;
    const pls = this.world?.platoons;
    let w = 0;
    for (const sc of this.scrolls) {
      sc.age += dt;
      const life = SCROLL_HOLD + 0.8;
      if (sc.age >= life) {
        sc.c.destroy({ children: true });
        continue;
      }
      if (pls) {
        for (const pl of pls) {
          if (pl.id !== sc.platoon) continue;
          sc.x = pl.x;
          sc.y = pl.y;
          break;
        }
      }
      // Unroll from the middle with an overshoot, hold, then roll up and lift away.
      const open = this.reduced ? 1 : sc.age < 0.45 ? easeOut(sc.age / 0.45) : sc.age > life - 0.4 ? Math.max(0.02, (life - sc.age) / 0.4) : 1;
      const half = (sc.width / 2) * open;
      sc.mask.scale.x = Math.max(0.02, open);
      sc.left.x = -half - 2;
      sc.right.x = half + 2;
      sc.c.alpha = Math.min(1, sc.age / 0.12, (life - sc.age) / 0.3);
      const lift = sc.age > life - 0.4 ? (sc.age - (life - 0.4)) * 30 : 0;
      // Scrolls give way politely: a newer one rises above any older one it would cover.
      let want = 0;
      for (let i = 0; i < w; i++) {
        const o = this.scrolls[i]!;
        const dx = Math.abs(o.x - sc.x) * this.zoom;
        if (dx >= (o.width + sc.width) / 2 + 8) continue;
        const oTop = o.y * this.zoom - o.stack - o.height;
        const myBottom = sc.y * this.zoom - want;
        if (myBottom > oTop - 6 && sc.y * this.zoom - want - sc.height < o.y * this.zoom - o.stack + 6) want = sc.y * this.zoom - oTop + 6;
      }
      sc.stack += (want - sc.stack) * Math.min(1, dt * 10);
      sc.c.position.set(sc.x, sc.y - (lift + sc.stack) / this.zoom);
      sc.c.scale.set(1 / this.zoom);
      this.scrolls[w++] = sc;
    }
    this.scrolls.length = w;
  }

  private updateTrails(dt: number, bounds: Bounds): void {
    if (!this.trails.length) return;
    const pls = this.world?.platoons;
    let w = 0;
    for (const tr of this.trails) {
      tr.age += dt;
      if (tr.age > 3 || !pls) continue;
      let px = NaN;
      let py = 0;
      for (const pl of pls) {
        if (pl.id !== tr.platoon) continue;
        px = pl.x;
        py = pl.y;
        break;
      }
      if (Number.isNaN(px)) continue;
      tr.acc += dt;
      while (tr.acc > 0.12) {
        tr.acc -= 0.12;
        if (bounds.contains(px, py)) this.dust.spawn({ texture: this.tex.dust, x: px + (rand() - 0.5) * 24, y: py + (rand() - 0.5) * 10, vz: 4, drag: 2, life: 1.2, size: 14, grow: 2.2, squash: 0.6, alpha: 0.35 * (1 - tr.age / 3), tint: 0xc8b48c, fadeIn: 0.2 });
      }
      this.trails[w++] = tr;
    }
    this.trails.length = w;
  }

  /** Eases a large sprite through the overlay: map dims, a dragon's shadow, night washes. */
  private sweep(
    texture: Texture,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    height: number,
    o: { tint: number; peak: number; life: number; fadeIn: number; fadeOut: number; delay?: number; k0?: number; k1?: number; rotation?: number },
  ): void {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.width = width;
    s.height = height;
    s.tint = o.tint;
    s.alpha = 0;
    s.rotation = o.rotation ?? 0;
    s.position.set(x0, y0);
    this.overlay.addChildAt(s, 0);
    this.sweeps.push({ s, age: 0, delay: o.delay ?? 0, life: o.life, fadeIn: o.fadeIn, fadeOut: o.fadeOut, peak: o.peak, x0, y0, x1, y1, k0: o.k0 ?? 1, k1: o.k1 ?? 1, sx: s.scale.x, sy: s.scale.y });
  }

  private updateSweeps(dt: number): void {
    if (!this.sweeps.length) return;
    let w = 0;
    for (const sw of this.sweeps) {
      sw.age += dt;
      const a = sw.age - sw.delay;
      if (a >= sw.life) {
        sw.s.destroy();
        continue;
      }
      if (a >= 0) {
        const t = easeInOut(a / sw.life);
        sw.s.position.set(sw.x0 + (sw.x1 - sw.x0) * t, sw.y0 + (sw.y1 - sw.y0) * t);
        const k = sw.k0 + (sw.k1 - sw.k0) * t;
        sw.s.scale.set(sw.sx * k, sw.sy * k);
        sw.s.alpha = sw.peak * Math.min(1, a / sw.fadeIn, (sw.life - a) / sw.fadeOut);
      }
      this.sweeps[w++] = sw;
    }
    this.sweeps.length = w;
  }

  /** The map dims, a vast shadow sweeps across it, and a dragon dives in with a roar. */
  private dragonSummon(x: number, y: number, R: number): void {
    this.cue('dragon-shadow', x, y, 1);
    this.cinematic?.({ x, y, zoom: 0.85, holdMs: 3200, reason: 'dragon' });
    const life = this.reduced ? 2 : 3.6;
    this.sweep(Texture.WHITE, 0, 0, 0, 0, R * 5, R * 5, { tint: INK_NIGHT, peak: this.reduced ? 0.22 : 0.4, life, fadeIn: 0.6, fadeOut: 1.2 });
    // From beyond the map's rim, across the land, down onto the capital.
    const a = Math.atan2(y, x) + Math.PI * 0.65;
    const sx = Math.cos(a) * R * 1.25;
    const sy = Math.sin(a) * R * 1.25;
    const dir = Math.atan2(y - sy, x - sx);
    if (!this.reduced) {
      this.sweep(this.tex.wingShadow, sx, sy, x, y, R * 0.7, R * 0.35, { tint: 0x0a1020, peak: 0.55, life: 1.7, fadeIn: 0.3, fadeOut: 0.35, delay: 0.3, k0: 1.5, k1: 0.35, rotation: dir + Math.PI / 2 });
    }
    this.after(this.reduced ? 0.2 : 1.6, () => {
      this.cue('dragon-roar', x, y, 1);
      this.kick(0.5);
      this.shockwave(x, y, 0xd8c8a8, 20, 260, 1.1, 0.7);
      this.puff(x, y, this.n(24), 0xc8b48c, 30, 90);
      for (let i = 0; i < this.n(16); i++) this.ember(x, y - 30, 160, 60);
    });
  }

  private rout(x: number, y: number, home: { x: number; y: number } | undefined): void {
    this.cue('rout', x, y, 0.8);
    this.ring(x, y, 0xffffff, 10, 70, 0.6, 0.5);
    // The white flag goes up, then the scraps of a broken company's cloth.
    this.dust.spawn({ texture: this.tex.whiteFlag, x: x + 4, y, z: 30, vz: 18, drag: 1.5, life: 2.2, size: 18, grow: 1.1, rotation: -0.08, spin: 0.08, fadeIn: 0.15, anchorY: 1 });
    this.puff(x, y - 26, this.n(4), 0xf4efe2, 12, 10);
    for (let i = 0; i < this.n(4); i++) {
      this.dust.spawn({ texture: this.tex.cloth, x: x + (rand() - 0.5) * 20, y, z: 26, vx: (rand() - 0.5) * 40, vz: 50 + rand() * 30, gravity: 90, life: 1.4, size: 9, spin: (rand() - 0.5) * 6 });
    }
    // Footprints of the flight, toward home.
    const dx = home ? home.x - x : -x;
    const dy = home ? home.y - y : -y;
    const d = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < 3; i++) this.footprints(x + (i - 1) * 10, y + (i - 1) * 4, dx / d, dy / d, 7, 8);
  }

  /** A capital falls: the bell, fire, collapse, embers and a pall of smoke. */
  private sack(x: number, y: number, radius: number, ours: boolean): void {
    const top = y - radius * 0.6;
    this.cue('sack-bell', x, y, 1);
    this.after(0.45, () => this.cue('sack-collapse', x, y, 1));
    this.cinematic?.({ x, y, zoom: ours ? 1.1 : 0.95, holdMs: 2600, reason: 'sack' });
    this.flash(x, top, radius * 1.4, EMBER, 0.3);
    for (let i = 0; i < 5; i++) this.crackAt(x, y, radius, 0x3a2616, 20);
    for (let i = 0; i < 3; i++) this.cloud(x + (rand() - 0.5) * radius, top + (rand() - 0.5) * radius * 0.5, radius * (1.2 + rand() * 0.5), 1.4 + rand() * 0.5);
    for (let i = 0; i < this.n(40); i++) this.ember(x + (rand() - 0.5) * radius, top, 160, 80);
    for (let i = 0; i < this.n(26); i++) this.smoke(x + (rand() - 0.5) * radius, top, 40, 0x2e2a26, 0.8, 4);
    for (let i = 0; i < this.n(18); i++) this.rockFling(x, top, 140, 60);
    this.shockwave(x, y, EMBER, radius, radius * 4, 1.2);
    this.floatText('Sacked!', x, y - radius * 2.4, 2.6, 26, 0xffb070);
    this.kick(0.8);
  }

  private crackAt(x: number, y: number, radius: number, tint: number, life: number, delay = 0): void {
    this.decals.spawn({ texture: this.tex.crack[(rand() * 2) | 0]!, x: x + (rand() - 0.5) * radius * 1.2, y: y - radius * (0.1 + rand() * 0.6), life, size: radius * (0.35 + rand() * 0.3), alpha: 0.85, tint, rotation: rand() * 6.28, delay, fadeIn: 0.12 });
  }

  /** Walls about to fall crack and shed dust; the Monolith's glyphs flare as it nears its end. */
  private watchWalls(world: World, bounds: Bounds): void {
    for (let i = 0; i < world.structures.length; i++) {
      const st = world.structures[i]!;
      const site = world.map.sites[st.site]!;
      const frac = st.maxHp > 0 ? st.hp / st.maxHp : 1;
      if (st.p === NEUTRAL) {
        if (world.monolithFallen) continue;
        if (frac < GLYPH_FLARE_AT && !this.monolithFlaring) {
          this.monolithFlaring = true;
          this.cue('monolith-crack', site.x, site.y, 0.8);
          for (let k = 0; k < 4; k++) this.crackAt(site.x, site.y, site.radius, EMBER, 600, k * 0.15);
        }
        if (this.monolithFlaring && bounds.contains(site.x, site.y) && world.tick % 2 === 0) {
          this.dust.spawn({ texture: this.tex.glyphs[(rand() * this.tex.glyphs.length) | 0]!, x: site.x + (rand() - 0.5) * site.radius, y: site.y, z: site.radius * (0.3 + rand() * 1.2), vz: 18 + rand() * 14, vx: (rand() - 0.5) * 10, life: 1.4, size: 16, grow: 1.2, tint: rand() < 0.5 ? EMBER : GOLD_HI, fadeIn: 0.2 });
          this.ember(site.x + (rand() - 0.5) * site.radius, site.y - site.radius * rand(), 30, 40);
        }
        continue;
      }
      if (st.ruinedUntil >= 0 || frac >= 0.3) {
        this.cracking.delete(i);
        continue;
      }
      if (frac >= CRACK_AT) continue;
      if (!this.cracking.has(i)) {
        this.cracking.add(i);
        this.cue('sack-bell', site.x, site.y, 0.5);
        for (let k = 0; k < 3; k++) this.crackAt(site.x, site.y, site.radius, 0x3a2616, 30, k * 0.2);
      }
      if (!bounds.contains(site.x, site.y) || world.tick % 3 !== 0) continue;
      this.crackAt(site.x, site.y, site.radius, 0x3a2616, 30);
      this.chips(site.x + (rand() - 0.5) * site.radius, site.y - site.radius * rand() * 0.6, 2);
      this.puff(site.x + (rand() - 0.5) * site.radius, site.y - 4, 1, 0xb7a888, 14, site.radius * 0.5);
    }
  }

  /** The Monolith shatters: cracks race, glyphs scatter, a deep boom and a shockwave. */
  private monolithFalls(x: number, y: number, radius: number): void {
    this.monolithFlaring = false;
    this.cue('monolith-crack', x, y, 1);
    this.after(0.35, () => this.cue('monolith-fall', x, y, 1));
    this.cinematic?.({ x, y, zoom: 0.9, holdMs: 3000, reason: 'monolith' });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const d = radius * (0.3 + (k % 3) * 0.5);
      this.decals.spawn({ texture: this.tex.crack[k % 2]!, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, life: 40, size: radius * (0.8 + rand() * 0.5), alpha: 0.9, tint: EMBER, tintTo: INK, rotation: a, delay: (k % 3) * 0.1, fadeIn: 0.08 });
    }
    const top = y - radius * 1.6;
    this.flash(x, top, radius * 3, GOLD_HI, 0.35);
    for (let i = 0; i < 4; i++) this.cloud(x + (rand() - 0.5) * radius * 2, y - rand() * radius * 2, radius * (2.4 + rand()), 1.8);
    for (let i = 0; i < this.n(60); i++) this.smoke(x + (rand() - 0.5) * radius * 3, y - rand() * radius * 1.5, 140, 0x4a4650, 0.75, 3.5, 2.6);
    for (let i = 0; i < this.n(36); i++) this.rockFling(x + (rand() - 0.5) * radius, y - radius * 0.5, 220, 160 + rand() * 200);
    // The ancient syntax carved on it scatters across the field.
    const glyphs = this.tex.glyphs;
    for (let i = 0; i < this.n(56); i++) {
      const a = rand() * Math.PI * 2;
      const sp = 120 + rand() * 280;
      this.dust.spawn({ texture: glyphs[i % glyphs.length]!, x, y, z: radius * (0.3 + rand() * 1.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55, vz: 80 + rand() * 160, gravity: 160, drag: 1.1, life: 2.2 + rand() * 1.2, size: 28 + rand() * 14, tint: i % 3 === 0 ? GOLD_HI : i % 3 === 1 ? EMBER : VELLUM, spin: (rand() - 0.5) * 3, delay: 0.3 * rand(), fadeIn: 0 });
    }
    this.shockwave(x, y, GOLD_HI, 40, 560, 1.8);
    this.shockwave(x, y, 0xffffff, 30, 340, 1.2, 0.6);
    this.floatText('The Monolith Falls', x, y - radius * 4.5, 3.5, 28, GOLD_HI);
    this.kick(1.2);
  }

  /** A player's veteran rank rises: gold leaf sweeps across their banners and chevrons glint. */
  private watchRanks(world: World, bounds: Bounds, tint: (p: number) => number): void {
    for (const pl of world.players) {
      const was = this.vet[pl.p];
      this.vet[pl.p] = pl.veterancy;
      if (was === undefined || was < 0 || pl.veterancy <= was) continue;
      this.rankUp(pl.p, pl.veterancy, world, bounds, tint(pl.p));
    }
  }

  private rankUp(p: number, rank: number, world: World, bounds: Bounds, t: number): void {
    const site = world.map.sites[world.players[p]?.slot ?? -1];
    if (site) {
      this.cue('rank-up', site.x, site.y, p === this.viewerP ? 1 : 0.6);
      if (bounds.contains(site.x, site.y)) {
        this.ring(site.x, site.y, GOLD, site.radius, site.radius * 2.4, 1.2, 0.8);
        for (let i = 0; i < this.n(30); i++) this.dust.spawn({ texture: this.tex.goldLeaf[i % 3]!, x: site.x + (rand() - 0.5) * site.radius * 2, y: site.y, z: site.radius * (1 + rand() * 1.5), vx: (rand() - 0.5) * 30, vz: -10 - rand() * 20, gravity: 10, drag: 0.8, life: 2.4, size: 5, spin: (rand() - 0.5) * 8, delay: rand() * 0.5, fadeIn: 0.1 });
        for (let k = 0; k < rank; k++) this.dust.spawn({ texture: this.tex.chevron, x: site.x, y: site.y, z: site.radius * 1.6 + k * 16, vz: 8, life: 2.6, size: 34, delay: 0.3 + k * 0.18, fadeIn: 0.15 });
      }
    }
    let shown = 0;
    for (const pl of world.platoons) {
      if (pl.p !== p || shown >= 12 || !bounds.contains(pl.x, pl.y)) continue;
      shown++;
      const d = shown * 0.08;
      // The banner shimmers, then gold leaf sweeps across it left to right.
      this.ring(pl.x, pl.y - 34, t, 6, 26, 0.5, 0.6);
      for (let i = 0; i < this.n(9); i++) {
        this.dust.spawn({ texture: this.tex.goldLeaf[i % 3]!, x: pl.x - 14 + (rand() - 0.5) * 4, y: pl.y, z: 30 + (rand() - 0.5) * 14, vx: 70 + rand() * 30, vz: (rand() - 0.5) * 10, drag: 1.2, life: 0.7, size: 4, spin: (rand() - 0.5) * 8, delay: d + 0.25 + i * 0.03, fadeIn: 0 });
      }
      for (let k = 0; k < rank; k++) {
        this.glowSpawn({ texture: this.tex.mote, x: pl.x, y: pl.y - 54 - k * 10, life: 1.2, size: 26, alpha: 0.35, tint: GOLD, delay: d + 0.45 + k * 0.12, fadeIn: 0.1 });
        this.dust.spawn({ texture: this.tex.chevron, x: pl.x, y: pl.y, z: 54 + k * 10, vz: 5, life: 1.6, size: 22, delay: d + 0.45 + k * 0.12, fadeIn: 0.1 });
      }
      this.glowSpawn({ texture: this.tex.spark, x: pl.x + 5, y: pl.y - 54, life: 0.4, size: 16, grow: 0.4, tint: GOLD_HI, delay: d + 0.6, rotation: 0.4, fadeIn: 0.05 });
    }
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
      body = this.dust.acquire(this.tex.lance);
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
          if (rand() < 0.5) {
            const back = angleOf(p.x0 - p.tx, p.y0 - p.ty - dz * 0.5);
            this.flames.spawn({ texture: this.tex.flame[0]!, frames: this.tex.flame, x: gx, y: gy - z + 2, life: 0.22, size: 11, grow: 0.5, tint: 0xffffff, tintTo: 0x8a4a30, alpha: 0.95, anchorY: 0.85, rotation: back + Math.PI / 2, fadeIn: 0 });
          }
          this.glowSpawn({ texture: this.tex.ember, x: gx + (rand() - 0.5) * 3, y: gy - z + (rand() - 0.5) * 3, vx: (rand() - 0.5) * 20, vy: -10 - rand() * 10, life: 0.35, size: 9, grow: 0.3, tint: 0xffd070, tintTo: 0xc0300a });
          if (rand() < 0.3) this.smoke(gx, gy - z, 6, 0x3a332c, 0.35, 0.7, 1.8, 8);
        }
      } else {
        b.rotation = angleOf(p.tx - p.x0, p.ty - p.y0 - dz);
        b.scaleX = b.scaleY = p.kind === ShotKind.TowerBolt ? 0.55 : 0.42;
        s.rotation = angleOf(p.tx - p.x0, p.ty - p.y0);
        s.scaleX = p.kind === ShotKind.TowerBolt ? 0.2 : 0.35;
        s.scaleY = 0.12;
        if (p.kind === ShotKind.TowerBolt) {
          // A gilded lance sheds gold leaf as it flies.
          p.trail += dt;
          while (p.trail > 0.035) {
            p.trail -= 0.035;
            this.dust.spawn({ texture: this.tex.goldLeaf[(rand() * 3) | 0]!, x: gx, y: gy, z, vx: (rand() - 0.5) * 12, vz: -8, gravity: 30, drag: 1, life: 0.6, size: 3.5, spin: (rand() - 0.5) * 10, fadeIn: 0 });
          }
        } else if (p.kind === ShotKind.RangerArrow) {
          p.trail += dt;
          while (p.trail > 0.03) {
            p.trail -= 0.03;
            this.glowSpawn({ texture: this.tex.soft, x: gx, y: gy - z, life: 0.3, size: 5, grow: 0.2, alpha: 0.6, tint: 0x6fe08a });
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
      if (p.kind === ShotKind.Fireball) this.fire.release(p.body);
      else this.dust.release(p.body);
      this.decals.release(p.shadow);
    };
    if (p.kind === ShotKind.Arrow || p.kind === ShotKind.RangerArrow) {
      // The arrow stays stuck where it struck, briefly.
      this.dust.spawn({ texture: p.kind === ShotKind.Arrow ? this.tex.arrow : this.tex.rangerArrow, x: x + (rand() - 0.5) * 6, y: y + (rand() - 0.5) * 6, life: 0.9, size: 13, rotation: p.body.rotation + (rand() - 0.5) * 0.4, fadeIn: 0 });
      if (p.zTarget <= 8) this.puff(p.tx, p.ty, 1, 0xb7a888, 6, 4);
      this.cue('arrow-thunk', x, y, 0.4);
    } else if (p.kind === ShotKind.TowerBolt) {
      this.sparks(x, y, 5, GOLD_HI, 80);
      this.flash(x, y, 22, GOLD_HI, 0.14);
      for (let i = 0; i < this.n(6); i++) this.dust.spawn({ texture: this.tex.goldLeaf[i % 3]!, x, y: p.ty, z: p.zTarget, vx: (rand() - 0.5) * 70, vy: (rand() - 0.5) * 20, vz: 30 + rand() * 40, gravity: 120, drag: 1.4, life: 0.9, size: 4, spin: (rand() - 0.5) * 10, fadeIn: 0 });
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
      const alt = this.flyHeight(Kind.Dragon);
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
        this.flames.spawn({ texture: this.tex.firePuff[(rand() * 3) | 0]!, x: mouthX, y: mouthY, z: alt, vx, vy, vz: -alt / life, life: life * (0.85 + rand() * 0.3), size: 9, grow: 4.5 + rand() * 1.5, tint: 0xffffff, tintTo: 0x6a3424, alpha: 0.85 * (0.6 + fading * 0.4), rotation: rand() * 6.28, spin: (rand() - 0.5) * 2, fadeIn: 0.03 });
        if (rand() < 0.2) this.glowSpawn({ texture: this.tex.soft, x: mouthX, y: mouthY, z: alt, vx: vx * 0.8, vy: vy * 0.8, vz: -alt / life, life: life * 0.6, size: 8, grow: 2.5, tint: 0xffa830, tintTo: 0x802008, alpha: 0.3, fadeIn: 0.03 });
        if (rand() < 0.16) this.flames.spawn({ texture: this.tex.flame[0]!, frames: this.tex.flame, x: mouthX + vx * life * 0.9, y: mouthY + vy * life * 0.9, life: 0.5 + rand() * 0.3, size: 16 + rand() * 14, grow: 1.4, tint: 0xffffff, tintTo: 0x6a3020, alpha: 0.8, anchorY: 0.85, rotation: (rand() - 0.5) * 0.4, delay: life * 0.7, fadeIn: 0.05 });
        if (rand() < 0.4) this.glowSpawn({ texture: this.tex.ember, x: mouthX, y: mouthY, z: alt, vx: vx * 1.05 + (rand() - 0.5) * 50, vy: vy * 1.05 + (rand() - 0.5) * 50, vz: 10 + rand() * 50, gravity: 50, drag: 1.2, life: 0.8 + rand() * 0.6, size: 6, tint: 0xffe0a0, tintTo: 0xff4010 });
        if (rand() < 0.1) this.smoke(mouthX + vx * life, mouthY + vy * life, 14, 0x2e2722, 0.5, 1.8, 3, 26);
      }
      // Heat at the jaws.
      if (rand() < 0.3) this.glowSpawn({ texture: this.tex.burst, x: mouthX, y: mouthY - alt, life: 0.1, size: 18, alpha: 0.4, tint: EMBER, rotation: rand() * 6.28 });
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
    this.flash(x, y - 10, radius * 2.4, 0xff9a40, 0.22);
    this.cloud(x, y - 6, radius * 1.5, 0.9);
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

  /** A rolling cloud of fire and smoke at the heart of a big blast. */
  private cloud(x: number, y: number, size: number, life: number): void {
    this.flames.spawn({ texture: this.tex.blast[0]!, frames: this.tex.blast, x, y, z: size * 0.15, vz: 12, life, size, grow: 1.6, tint: 0xffffff, tintTo: 0x5a4a42, alpha: 0.9, rotation: rand() * Math.PI * 2, spin: (rand() - 0.5) * 0.6, fadeIn: 0.04 });
  }

  private scorchMark(x: number, y: number, radius: number): void {
    this.decals.spawn({ texture: this.tex.scorch, x, y, life: 60, size: radius * 3, squash: 0.7, alpha: 0.75, rotation: rand() - 0.5, fadeIn: 0.3 });
    for (let i = 0; i < this.n(6); i++) this.flame(x + (rand() - 0.5) * radius * 1.6, y + (rand() - 0.5) * radius, 0, -4, 10 + rand() * 8, 1.2 + rand() * 0.8, 0.3 + rand() * 0.4);
  }

  // ------------------------------------------------------------- healing

  private heal(x: number, y: number, holy: boolean): void {
    // Gold motes drift up from the healed; a Paladin's blessing comes down as a pillar of light.
    for (let i = 0; i < this.n(holy ? 9 : 5); i++) {
      this.dust.spawn({ texture: this.tex.goldLeaf[i % 3]!, x: x + (rand() - 0.5) * 14, y: y, z: rand() * 8, vz: 22 + rand() * 24, vx: (rand() - 0.5) * 8, drag: 0.6, life: 0.9 + rand() * 0.4, size: 4, spin: (rand() - 0.5) * 6, delay: rand() * 0.2, fadeIn: 0.1 });
    }
    for (let i = 0; i < this.n(holy ? 4 : 2); i++) {
      this.glowSpawn({ texture: this.tex.mote, x: x + (rand() - 0.5) * 12, y: y - rand() * 6, vz: 30 + rand() * 30, life: 0.9, size: 6, tint: GOLD_HI, delay: rand() * 0.2 });
    }
    this.ring(x, y, GOLD, 4, 22, 0.5, 0.7);
    if (holy) this.pillar(x, y, GOLD_HI, 16, 0.7);
  }

  // -------------------------------------------------------------- deaths

  private death(kind: Kind, x: number, y: number, tint: number, near: boolean): void {
    const alt = this.altOf(kind);
    if (kind === Kind.Dragon) {
      this.flash(x, y - 20, 90, EMBER, 0.3);
      for (let i = 0; i < this.n(30); i++) this.ember(x, y - 20, 220, 120);
      for (let i = 0; i < this.n(16); i++) this.smoke(x + (rand() - 0.5) * 60, y, 50, 0x3a3028, 0.75, 3, 2.6, 40);
      this.shockwave(x, y, 0xffb070, 30, 220, 1, 0.8);
      this.floatText('Dragon Slain', x, y - 90, 2.8, 24, GOLD_HI);
      for (let i = 0; i < this.n(20); i++) this.dust.spawn({ texture: this.tex.inkSplat[i % 3]!, x, y: y - 20, z: 20, vx: (rand() - 0.5) * 160, vz: 40 + rand() * 60, gravity: 200, life: 1.2, size: 5 + rand() * 4, spin: (rand() - 0.5) * 6, fadeIn: 0 });
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
    if (near && alt === 0) this.decals.spawn({ texture: this.tex.inkSplat[(rand() * 3) | 0]!, x: x + (rand() - 0.5) * 4, y: y + 1, life: 20, size: 14 + rand() * 6, squash: 0.5, alpha: 0.55, rotation: rand() * 6.28, delay: 0.3, fadeIn: 0.1 });
    if (kind === Kind.Champion) {
      this.shockwave(x, y, tint, 10, 130, 0.9);
      this.sparks(x, y - 10, this.n(18), GOLD, 130);
    }
    if (alt > 0) this.puff(x, y, this.n(8), 0xb7a888, 16, 12);
    // A faint soul rises from the fallen.
    if (near || STATS[kind]!.tier !== 'base') {
      this.glowSpawn({ texture: this.tex.wisp, x, y: y - 10 - alt, vz: 26, vx: (rand() - 0.5) * 6, life: 1.6, size: 12, grow: 1.4, alpha: 0.45, tint: 0xcfe6ff, delay: 0.25, fadeIn: 0.3 });
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

  private altOf(kind: Kind | undefined): number {
    return kind === undefined || !STATS[kind]!.flying ? 0 : this.flyHeight(kind);
  }

  /** Additive spawn, refused once its 32-unit cell has had its share this quarter second. */
  private glowSpawn(sp: Spawn, budget = GLOW_PER_CELL): void {
    const key = (Math.floor(sp.x / 32) + 4096) * 8192 + Math.floor((sp.y - (sp.z ?? 0)) / 32) + 4096;
    const used = this.glowCells.get(key) ?? 0;
    if (used >= budget) return;
    this.glowCells.set(key, used + 1);
    this.fire.spawn(sp);
  }

  /** Scales a particle count by reduced motion and current load. */
  private n(base: number): number {
    const load = Math.min(1, Math.min(this.fire.headroom, this.dust.headroom, this.flames.headroom) * 1.6);
    return Math.max(1, Math.round(base * load * (this.reduced ? 0.35 : 1)));
  }

  private kick(amount: number): void {
    if (!this.reduced) this.shake = Math.max(this.shake, amount);
  }

  private sparks(x: number, y: number, count: number, tint: number, speed: number, rise = 0): void {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const sp = speed * (0.4 + rand() * 0.6);
      this.glowSpawn({ texture: this.tex.streak, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rise * rand(), gravity: rise ? 80 : 0, drag: 3, life: 0.25 + rand() * 0.2, size: 9, tint, stretch: true, fadeIn: 0 });
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
    this.dust.spawn({ texture: this.tex.inkSmoke[(rand() * 3) | 0]!, x, y, vx: Math.cos(a) * speed * 0.6 + 6, vy: Math.sin(a) * speed * 0.3, vz: 18 + rand() * 20, drag: 1.2, life: life * (0.7 + rand() * 0.6), size: size * (0.7 + rand() * 0.6), grow, alpha, tint: tint | 0x404040, rotation: (rand() - 0.5) * 0.3, spin: (rand() - 0.5) * 0.15, fadeIn: 0.25 });
  }

  private ember(x: number, y: number, speed: number, up: number): void {
    const a = rand() * Math.PI * 2;
    const sp = speed * (0.3 + rand() * 0.7);
    this.glowSpawn({ texture: this.tex.ember, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: up * (0.4 + rand()), gravity: 70, drag: 1.4, life: 0.9 + rand() * 0.9, size: (5 + rand() * 4) * (1 + this.night * 0.4), alpha: 0.85, tint: 0xffc870, tintTo: 0xff3a10, fadeIn: 0 });
  }

  private flame(x: number, y: number, vx: number, vy: number, size: number, life: number, delay = 0): void {
    if (this.night > 0.2 && rand() < 0.35) this.glowSpawn({ texture: this.tex.soft, x, y: y - size * 0.3, life: life * 0.8, size: size * 2.2, alpha: 0.18 * this.night, tint: EMBER, delay, fadeIn: 0.1 });
    this.flames.spawn({ texture: this.tex.flame[0]!, frames: this.tex.flame, x, y, vx, vy, vz: 14, life, size, grow: 1.4, tint: 0xffffff, tintTo: 0x7a3a26, alpha: 0.95, anchorY: 0.85, delay, fadeIn: 0.05 });
  }

  /** The instant of impact: an inked starburst in pigment, with a faint warm bloom beneath. */
  private flash(x: number, y: number, size: number, tint: number, life: number): void {
    this.flames.spawn({ texture: this.tex.burst, x, y, life: Math.min(0.22, life), size: size * 0.7, grow: 1.5, alpha: 0.95, tint, rotation: rand() * 6.28, fadeIn: 0 });
    this.glowSpawn({ texture: this.tex.soft, x, y, life, size: size * (1 + this.night * 0.5), grow: 1.2, alpha: 0.2 + this.night * 0.25, tint, fadeIn: 0 }, GLOW_PER_CELL * 4);
  }

  /** A hand-inked ring of pigment spreading over the ground. */
  private ring(x: number, y: number, tint: number, from: number, to: number, life: number, alpha = 0.9): void {
    this.decals.spawn({ texture: this.tex.ring, x, y, life, size: from, grow: to / from, squash: 0.62, alpha: alpha * 0.85, tint, rotation: rand() * 6.28, fadeIn: 0 });
  }

  /** Dust thrown outward with a dry-brushed ink edge. */
  private shockwave(x: number, y: number, tint: number, from: number, to: number, life: number, alpha = 0.95): void {
    this.decals.spawn({ texture: this.tex.shockwave, x, y, life, size: from, grow: to / from, squash: 0.62, alpha: alpha * 0.8, tint, rotation: rand() * 6.28, fadeIn: 0 });
  }

  private pillar(x: number, y: number, tint: number, width: number, life: number): void {
    this.glowSpawn({ texture: this.tex.pillar, x, y: y + 4, life, size: width, grow: 1.1, alpha: 0.75, tint, anchorY: 1, fadeIn: 0.08 });
  }
}
