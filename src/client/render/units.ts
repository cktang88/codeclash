import { FAR_ZOOM } from './lod.ts';
import { Container, Sprite } from 'pixi.js';
import { Kind, PlatoonState, TICK_MS, type Unit, type World } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import type { Runner } from '../net/runner.ts';
import type { UnitArt, UnitFrame } from './art/index.ts';
import { gradeOf } from './flags.ts';
import { knockCurve, knockDistance, knockMs } from './impact.ts';
import { mixColor } from './paint.ts';
import type { Textures } from './textures.ts';
import { addToAcc, blockKey, resetAcc, type BlockAcc } from './blocks.ts';

const SWING_PULL_MS = 110;
const SWING_LUNGE_MS = 230;
const SWING_END_MS = 420;
/** After its first rendered frame of solid light, a hit flash fades over this long. */
const FLASH_FADE_MS = 80;
/** A soldier under a hail of blows flashes at most this often, rather than strobing. */
const FLASH_GAP_MS = 220;
/** At most this many flashes and knockbacks at once, so a great melee never turns to strobe. */
const MAX_FLASHES = 28;
const MAX_KNOCKS = 60;

const STEP_PERIOD_MS = 520;
const ATTACK_FRAME_MS = 105;
const IDLE_FRAME_MS = 700;
/** Rank chevrons show only when soldiers are big enough to carry them. */
const PIP_ZOOM = 1.1;
/** Speeds below are in world units per sim tick (200ms), measured from the interpolated motion. */
const WALK_SPEED = 0.25;
/** Horizontal travel needed before a soldier turns to face its way. */
const TURN_SPEED = 0.3;
/** Below this zoom soldiers are drawn up to 1.45x larger than life, so silhouettes stay legible. */
const MID_ZOOM = 1.4;
/** The largest mid-zoom enlargement. */
const MAX_BOOST = 1.6;
/** At mid zoom, soldiers walk only within this share of the view's half-size (squared) from its centre. */
const WALK_CORE = 0.45 * 0.45;
/** Vellum light the figure halo is mixed toward. */
const HALO_LIGHT = 0xfff6e2;

/** How hard a blow lands, for `impact`. */
export interface Blow {
  /** Direction the victim is pushed (need not be normalised; 0,0 picks one). */
  dx: number;
  dy: number;
  /** Damage over the victim's max hp. */
  share: number;
  /** The attacker's heft: 1 a line soldier; ~1.8 a Troll, a Knight's charge, a Champion; ~2.2 a blast. */
  power: number;
  /** Heavy blows flash ember-gold instead of white. */
  heavy: boolean;
}

interface View {
  shadow: Sprite;
  /** Army-colored ring under big units, so a Dragon's side reads at a glance. */
  halo: Sprite;
  /** A miniature's pigment-rimmed base under every soldier: the side reads even at night. */
  base: Sprite;
  /** Gold chevrons under veterans, at near zoom. */
  pip: Sprite;
  /** The figure's cut-out: an ink band and a light halo, so it reads on any ground at any hour. */
  rim: Sprite;
  body: Sprite;
  mask: Sprite;
  /** Veteran gilding or a ragged army's tears, laid over the pigment. */
  trim: Sprite;
  dot: Sprite;
  kind: Kind;
  facing: number;
  x: number;
  y: number;
  /** Smoothed speed in world units per tick, for the walk cycle. */
  speed: number;
  /** Smoothed horizontal velocity in world units per tick, for facing the way of travel. */
  vx: number;
  phase: number;
  seen: number;
  /** Where this soldier was drawn this frame; reused, never reallocated. */
  pose: UnitPose;
  /** Solid light silhouette over the figure for a hit flash. */
  glow: Sprite;
  /** This soldier's own animation clock (ms): it stands still while the soldier is in hitstop. */
  clock: number;
  freezeUntil: number;
  /** Melee swing, on the soldier's clock; -1 none. */
  swingAt: number;
  stx: number;
  sty: number;
  /** Hit flash, on the layer clock; -1 none. `flashFrame` is the frame it was first drawn. */
  flashAt: number;
  flashFrame: number;
  flashTint: number;
  /** Knockback, on the soldier's clock; -1 none. */
  knockAt: number;
  kdx: number;
  kdy: number;
  kms: number;
}

/** A platoon's interpolated centre this frame: where its soldiers are drawn, not where the last tick left them. */
export interface Centroid {
  x: number;
  y: number;
  n: number;
}

export interface UnitPose {
  x: number;
  y: number;
  facing: number;
  kind: Kind;
  p: number;
}

function place(s: Sprite, anchorY: number, x: number, y: number, sx: number, sy: number, rotation: number, z: number): void {
  s.anchor.set(0.5, anchorY);
  s.position.set(x, y);
  s.scale.set(sx, sy);
  s.rotation = rotation;
  s.zIndex = z;
}

/** Soldiers: interpolated, facing their work, bobbing as they walk. */
export class UnitLayer {
  readonly shadows = new Container();
  /** Miniature bases and elite halos: the army's pigment on the ground, drawn above the hour's grade. */
  readonly bases = new Container();
  readonly bodies = new Container();
  readonly dots = new Container();
  /** Flyers soar above banners; their shadows stay on the ground. */
  readonly air = new Container();
  private views = new Map<number, View>();
  private pool: View[] = [];
  /** Render time (ms): runs slow during a set piece's micro-pause, never touches the sim. */
  private clock = 0;
  /** Multiplier on render time this frame (1 normal, ~0.1 in a micro-pause). */
  timeScale = 1;
  /** 0 by day to 1 at deep night: how strongly emissive lights show. */
  night = 0;
  /** Reduced motion: flashes become a gentle tint, no knockback squash. */
  reduced = false;
  /**
   * Mid zoom (lod.ts): soldiers away from the middle of the view stand in their rest pose
   * instead of stepping through the walk cycle; up close, and near the centre, they all walk.
   */
  mid = false;
  private flashing = 0;
  private knocking = 0;
  private frameNo = 0;
  private tmp = { x: 0, y: 0 };
  // Rebuilt every frame; kept as fields and cleared so the hot loop allocates nothing.
  private platoonState = new Map<number, number>();
  /** Each platoon's heading (or the threat it faces), x component: a battle line faces the front. */
  private platoonHx = new Map<number, number>();
  private unitIndex = new Map<number, Unit>();
  /** The soldier who carries each platoon's rank chevrons: its first in line. */
  private leaders = new Map<number, number>();
  private centroidPool: Centroid[] = [];
  /** Each platoon's interpolated centre this frame, rebuilt in `update`; entries are reused. */
  readonly centroids = new Map<number, Centroid>();
  private lastNow = -1;
  /** Per (platoon, kind) sums for the far-zoom blocks, rebuilt while blocks show; entries are reused. */
  readonly blocks = new Map<number, BlockAcc>();
  private blockPool: BlockAcc[] = [];
  tints: number[] = [];
  /** Per player: the light, pigment-touched halo around each figure. */
  private haloTint: number[] = [];
  /** Per player this frame: veteran rank shown (0-3) and whether the army is ragged. */
  private ranks: number[] = [];
  private raggedTint: number[] = [];

  constructor(
    private tex: Textures,
    private art: UnitArt,
  ) {
    this.bodies.sortableChildren = true;
    this.air.sortableChildren = true;
  }

  /** A soldier winds up and lunges at (tx, ty). */
  swing(unitId: number, tx: number, ty: number): void {
    const v = this.views.get(unitId);
    if (!v) return;
    v.swingAt = v.clock;
    v.stx = tx;
    v.sty = ty;
  }

  /** Hitstop: this soldier's animation (and any knockback) holds still for `ms`. */
  freeze(unitId: number, ms: number): void {
    const v = this.views.get(unitId);
    if (v) v.freezeUntil = Math.max(v.freezeUntil, this.clock + ms);
  }

  /**
   * A blow lands: the victim flashes, then is knocked back from the attacker and eased home.
   * Render-only: an offset on the sprite that decays to the sim position. Returns the push in
   * world units (0 if none), for the caller's spark and shake.
   */
  impact(unitId: number, b: Blow): number {
    const v = this.views.get(unitId);
    if (!v || v.seen !== this.frameNo) return 0;
    if ((b.heavy || this.flashing < MAX_FLASHES) && (v.flashAt < 0 || this.clock - v.flashAt > FLASH_GAP_MS)) {
      if (v.flashAt < 0) this.flashing++;
      v.flashAt = this.clock;
      v.flashFrame = -1;
      v.flashTint = b.heavy ? 0xffc46a : 0xfff8ea;
    }
    if (this.reduced || (!b.heavy && this.knocking >= MAX_KNOCKS)) return 0;
    // Light soldiers fly further; a Golem, Troll or Dragon barely budges.
    const dist = knockDistance(b.share, b.power, STATS[v.kind]!.size);
    let dx = b.dx;
    let dy = b.dy;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-3) {
      const a = ((unitId * 2.399) % 6.283) - 3.14;
      dx = Math.cos(a);
      dy = Math.sin(a);
      d = 1;
    }
    if (v.knockAt < 0) this.knocking++;
    v.kdx = (dx / d) * dist;
    v.kdy = (dy / d) * dist * 0.7;
    v.kms = knockMs(b.share);
    // On the soldier's own clock: if it is in hitstop, the shove waits for the hold to end.
    v.knockAt = v.clock;
    return dist;
  }

  /** Where a soldier was last drawn: for effects that start at a soldier. */
  pose(unitId: number): UnitPose | undefined {
    const v = this.views.get(unitId);
    return v && v.seen === this.frameNo ? v.pose : undefined;
  }

  /**
   * `farMix` (0..1) is how far the view has faded into far zoom, where platoons draw as blocks.
   * At 1 no soldier is drawn: only the interpolated positions are kept (for banners, torches and
   * effects) and summed into `blocks`, so the frame no longer grows with the armies.
   */
  update(world: World, runner: Runner | null, now: number, zoom: number, bounds: { contains(x: number, y: number): boolean }, farMix = 0): void {
    for (const pl of world.players) {
      const g = gradeOf(pl);
      this.ranks[pl.p] = g.rank;
      // Ragged armies wear faded, patched tabards: their color washes toward grey.
      this.raggedTint[pl.p] = g.ragged ? mixColor(this.tints[pl.p] ?? 0xcccccc, 0x8a8478, 0.5) : -1;
      // The halo burns a little brighter as the night comes on, while the ground darkens.
      this.haloTint[pl.p] = mixColor(this.tints[pl.p] ?? 0xcccccc, HALO_LIGHT, 0.62 + 0.16 * this.night);
    }
    this.frameNo++;
    const dtMs = this.lastNow < 0 ? 16.67 : Math.max(1, Math.min(100, now - this.lastNow));
    this.lastNow = now;
    const dtRender = dtMs * this.timeScale;
    this.clock += dtRender;
    const clock = this.clock;
    this.flashing = 0;
    this.knocking = 0;
    // Frame-rate independent smoothing of measured speeds.
    const ease = 1 - Math.pow(0.85, dtMs / 16.67);
    const perTick = TICK_MS / dtMs;
    const far = zoom < FAR_ZOOM;
    // The middle of the view, and how far out (as a share of its half-size, squared) soldiers still walk.
    const b = bounds as { minX?: number; minY?: number; maxX?: number; maxY?: number };
    const midX = b.minX !== undefined && b.maxX !== undefined ? (b.minX + b.maxX) / 2 : 0;
    const midY = b.minY !== undefined && b.maxY !== undefined ? (b.minY + b.maxY) / 2 : 0;
    const halfW = b.minX !== undefined && b.maxX !== undefined ? Math.max(1, (b.maxX - b.minX) / 2) : Infinity;
    const halfH = b.minY !== undefined && b.maxY !== undefined ? Math.max(1, (b.maxY - b.minY) / 2) : Infinity;
    const thin = this.mid && halfW !== Infinity;
    const boost = zoom < MID_ZOOM ? Math.min(MAX_BOOST, Math.pow(MID_ZOOM / zoom, 0.6)) : 1;
    // Bases carry the side most when soldiers are small; up close the cloth does it.
    const baseAlpha = zoom < 1.2 ? 1 : Math.max(0.75, 1 - (zoom - 1.2) * 0.3);
    const alpha = runner?.alpha ?? 1;
    const platoonState = this.platoonState;
    platoonState.clear();
    const platoonHx = this.platoonHx;
    platoonHx.clear();
    for (const pl of world.platoons) {
      platoonState.set(pl.id, pl.state);
      platoonHx.set(pl.id, pl.hx ?? 0);
    }
    const unitIndex = this.unitIndex;
    unitIndex.clear();
    const leaders = this.leaders;
    leaders.clear();
    // Facing foes and rank chevrons are only drawn on soldiers; blocks need neither.
    if (farMix < 1) {
      for (const u of world.units) {
        unitIndex.set(u.id, u);
        if (!leaders.has(u.platoon)) leaders.set(u.platoon, u.id);
      }
    }
    const centroids = this.centroids;
    for (const c of centroids.values()) this.centroidPool.push(c);
    centroids.clear();
    const blocksOn = farMix > 0;
    const soldiersOn = farMix < 1;
    const blocks = this.blocks;
    for (const a of blocks.values()) this.blockPool.push(a);
    blocks.clear();
    this.shadows.visible = this.bases.visible = this.bodies.visible = this.dots.visible = this.air.visible = soldiersOn;
    this.shadows.alpha = this.bases.alpha = this.bodies.alpha = this.dots.alpha = this.air.alpha = 1 - farMix;

    for (const u of world.units) {
      let v = this.views.get(u.id);
      if (!v) {
        v = this.acquire(u.kind);
        this.views.set(u.id, v);
        v.x = u.x;
        v.y = u.y;
        v.phase = (u.id * 0.618) % 1;
      }
      v.seen = this.frameNo;
      // Hitstop: a soldier's own clock stands still while it holds.
      if (clock >= v.freezeUntil) v.clock += dtRender;
      let x = u.x;
      let y = u.y;
      if (runner && runner.previousPosition(u.id, this.tmp)) {
        x = this.tmp.x + (u.x - this.tmp.x) * alpha;
        y = this.tmp.y + (u.y - this.tmp.y) * alpha;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // A soldier with no valid position is not drawn at all, rather than poisoning bounds and centroids.
        v.glow.visible = v.rim.visible = v.pip.visible = v.base.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.trim.visible = v.dot.visible = false;
        continue;
      }
      const dx = x - v.x;
      const dy = y - v.y;
      v.x = x;
      v.y = y;
      let c = centroids.get(u.platoon);
      if (!c) {
        c = this.centroidPool.pop() ?? { x: 0, y: 0, n: 0 };
        c.x = c.y = c.n = 0;
        centroids.set(u.platoon, c);
      }
      c.x += x;
      c.y += y;
      c.n++;
      if (blocksOn) {
        const key = blockKey(u.platoon, u.kind);
        let a = blocks.get(key);
        if (!a) {
          a = this.blockPool.pop() ?? ({} as BlockAcc);
          resetAcc(a, u.platoon, u.kind, u.p, x, y);
          blocks.set(key, a);
        }
        addToAcc(a, x, y);
      }
      if (!soldiersOn) {
        // Fully into far zoom: the soldier is part of its block, and nothing of it is drawn.
        // Effects still start from where it stands.
        v.pose.x = x;
        v.pose.y = y;
        v.pose.kind = u.kind;
        v.pose.p = u.p;
        continue;
      }
      // Measured per sim tick, not per frame, so the walk cycle and facing do not depend on the display's refresh rate.
      v.speed += (Math.sqrt(dx * dx + dy * dy) * perTick - v.speed) * ease;
      v.vx += (dx * perTick - v.vx) * ease;

      // Face the enemy when fighting, otherwise the direction of travel.
      let face = 0;
      if (u.target > 0) {
        const t = unitIndex.get(u.target);
        if (t) face = t.x - x;
      } else if (u.target < 0) {
        const st = world.structures[-u.target - 1];
        if (st) face = world.map.sites[st.site]!.x - x;
      }
      if (Math.abs(face) > 0.5) v.facing = face > 0 ? 1 : -1;
      else {
        // No foe in hand: a formed platoon faces its heading or the threat (pl.hx), so a battle
        // line visibly faces the front; a routing one faces the way it runs.
        const hx = u.target === 0 && platoonState.get(u.platoon) !== PlatoonState.Rout ? (platoonHx.get(u.platoon) ?? 0) : 0;
        if (Math.abs(hx) > 0.05) v.facing = hx > 0 ? 1 : -1;
        else if (Math.abs(v.vx) > TURN_SPEED) v.facing = v.vx > 0 ? 1 : -1;
      }

      const pose = v.pose;
      pose.x = x;
      pose.y = y;
      pose.facing = v.facing;
      pose.kind = u.kind;
      pose.p = u.p;
      const visible = bounds.contains(x, y);
      if (!visible) {
        v.glow.visible = v.rim.visible = v.pip.visible = v.base.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.trim.visible = v.dot.visible = false;
        continue;
      }
      const ragged = this.raggedTint[u.p] ?? -1;
      const tint = ragged >= 0 ? ragged : (this.tints[u.p] ?? 0xcccccc);
      // A kind whose art is still baking stands in as a pigment token until it is ready.
      const baking = !this.art.ready(u.kind);
      if (baking) this.art.want(u.kind);
      if (far || baking) {
        v.glow.visible = v.rim.visible = v.pip.visible = v.base.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.trim.visible = false;
        v.dot.visible = true;
        v.dot.position.set(x, y);
        v.dot.tint = tint;
        const big = STATS[u.kind]!.size;
        // Elites and legends keep their silhouette even from afar.
        if (big >= 9 && !baking) {
          v.dot.texture = this.art.icon(u.kind);
          const k = (10 + big * 0.9) / zoom / this.art.cell(u.kind).h;
          v.dot.scale.set(k);
          // The glyph keeps its cut-out rim: an ink band and a light halo around the pigment.
          v.rim.visible = true;
          v.rim.texture = this.art.frames(u.kind, 'idle')[0]!.rim;
          v.rim.tint = this.haloTint[u.p] ?? HALO_LIGHT;
          v.rim.anchor.set(0.5);
          v.rim.position.set(x, y);
          v.rim.rotation = 0;
          v.rim.scale.set(k);
          v.rim.zIndex = y - 0.001;
        } else {
          v.dot.texture = this.tex.dot;
          const k = ((5 + big * 0.45) / zoom / 32) * (far ? Math.min(1, zoom * 3.2) : 1);
          v.dot.scale.set(k);
          // A light halo behind the bead, so it stands off dark forest and night ground too.
          v.rim.visible = true;
          v.rim.texture = this.tex.dotHalo;
          v.rim.tint = this.haloTint[u.p] ?? HALO_LIGHT;
          v.rim.anchor.set(0.5);
          v.rim.position.set(x, y);
          v.rim.rotation = 0;
          v.rim.scale.set(k);
          v.rim.zIndex = y - 0.001;
        }
        continue;
      }
      v.dot.visible = false;
      v.shadow.visible = v.rim.visible = v.body.visible = v.mask.visible = true;

      // Swing: wind up away from the victim, then lunge in as the blow lands.
      let ox = 0;
      let oy = 0;
      let attackFrame = -1;
      if (v.swingAt >= 0) {
        const t = v.clock - v.swingAt;
        if (t > SWING_END_MS) v.swingAt = -1;
        else {
          attackFrame = Math.min(3, Math.floor(t / ATTACK_FRAME_MS));
          const sx = v.stx - x;
          const sy = v.sty - y;
          const d = Math.sqrt(sx * sx + sy * sy) || 1;
          let k: number;
          if (t < SWING_PULL_MS) k = -2.2 * (t / SWING_PULL_MS);
          else if (t < SWING_LUNGE_MS) k = -2.2 + 6.2 * ((t - SWING_PULL_MS) / (SWING_LUNGE_MS - SWING_PULL_MS));
          else k = 4 * (1 - (t - SWING_LUNGE_MS) / (SWING_END_MS - SWING_LUNGE_MS));
          ox += (sx / d) * k;
          oy += (sy / d) * k;
        }
      }
      // Knockback: a fast shove away from the blow, then an eased return to the sim position.
      let squash = 0;
      if (v.knockAt >= 0) {
        const t = (v.clock - v.knockAt) / v.kms;
        if (t >= 1) v.knockAt = -1;
        else if (t > 0) {
          this.knocking++;
          const e = knockCurve(t);
          ox += v.kdx * e;
          oy += v.kdy * e;
          squash = e * Math.min(1, Math.abs(v.kdx) / 6 + 0.25);
        } else this.knocking++;
      }

      const walking = v.speed > WALK_SPEED;
      const routing = platoonState.get(u.platoon) === PlatoonState.Rout;
      const stats = STATS[u.kind]!;
      const flight = this.art.flight(u.kind);
      const flying = flight !== null;
      let frame: UnitFrame;
      if (attackFrame >= 0) frame = this.art.frames(u.kind, 'attack')[attackFrame]!;
      else if (thin && walking && !flying && ((x - midX) / halfW) ** 2 + ((y - midY) / halfH) ** 2 > WALK_CORE) frame = this.art.frames(u.kind, 'idle')[0]!;
      else if (walking || flying) {
        const frames = this.art.frames(u.kind, 'walk');
        // Big, slow kinds stride slowly; fliers beat their wings at a steady pace.
        const period = flying ? 640 : STEP_PERIOD_MS * Math.max(0.6, Math.min(1.8, 1.6 / stats.speed));
        frame = frames[Math.floor(((v.clock / period + v.phase) % 1) * frames.length)]!;
      } else {
        const frames = this.art.frames(u.kind, 'idle');
        frame = frames[Math.floor(v.clock / IDLE_FRAME_MS + v.phase * 4) % frames.length]!;
      }
      const altitude = flying ? flight.height + Math.sin(v.clock / 520 + v.phase * 6) * 3 : 0;
      const lean = attackFrame >= 0 ? 0 : walking && routing ? -0.2 * v.facing : 0;

      const cell = this.art.cell(u.kind);
      // Soldiers are painted a little larger than life at mid zoom, so kinds still read by silhouette.
      const worldH = this.art.scale(u.kind) * boost;
      const size = worldH / cell.h;
      const px = x + ox;
      const py = y + oy;
      v.shadow.position.set(px, py);
      const wide = stats.slots >= 2 || u.kind === Kind.Outrider ? 0.9 : 0.55;
      v.shadow.scale.set((worldH * wide * (flying ? 0.8 : 1)) / 64, (worldH * 0.22 * (flying ? 0.7 : 1)) / 64);
      v.shadow.alpha = flying ? 0.45 : 0.7;
      v.base.visible = stats.size < 9;
      if (v.base.visible) {
        v.base.position.set(px, py);
        v.base.scale.set((worldH * wide * 0.95) / 128, (worldH * 0.3) / 128);
        v.base.tint = tint;
        v.base.alpha = baseAlpha * (flying ? 0.5 : 1);
      }
      v.halo.visible = stats.size >= 9;
      if (v.halo.visible) {
        v.halo.position.set(px, py);
        v.halo.scale.set((worldH * wide * 1.15) / 128, (worldH * 0.3) / 128);
        v.halo.tint = tint;
        v.halo.alpha = flying ? 0.8 : 1;
      }
      const rank = this.ranks[u.p] ?? 0;
      // Rank is gold on the banner; among the soldiers only the platoon's leader wears the chevrons.
      v.pip.visible = rank > 0 && zoom >= PIP_ZOOM && !flying && this.leaders.get(u.platoon) === u.id;
      if (v.pip.visible) {
        v.pip.texture = this.tex.chevrons[rank - 1]!;
        v.pip.position.set(px, py + 2);
        v.pip.scale.set(Math.max(0.2, 13 / zoom / 32));
      }
      const layer = flying ? this.air : this.bodies;
      if (v.body.parent !== layer) layer.addChild(v.rim, v.body, v.mask, v.trim, v.glow);
      // Hit flash: one rendered frame of solid light over the figure, then a short fade. The rim
      // (ink band and halo) stays, so the soldier never loses its outline.
      let flash = 0;
      if (v.flashAt >= 0) {
        if (v.flashFrame < 0) v.flashFrame = this.frameNo;
        if (this.frameNo === v.flashFrame) flash = 1;
        else flash = Math.max(0, 1 - (clock - v.flashAt - 16) / FLASH_FADE_MS);
        if (flash <= 0 && this.frameNo !== v.flashFrame) v.flashAt = -1;
        else this.flashing++;
        if (this.reduced) flash *= 0.35;
      }
      const sqx = 1 + 0.14 * squash;
      const sqy = 1 - 0.12 * squash;
      v.body.texture = frame.body;
      v.mask.texture = frame.mask;
      const anchorY = cell.feetY / cell.h;
      v.rim.texture = frame.rim;
      v.rim.tint = this.haloTint[u.p] ?? HALO_LIGHT;
      place(v.rim, anchorY, px, py - altitude, size * v.facing * sqx, size * sqy, lean, py - 0.001);
      place(v.body, anchorY, px, py - altitude, size * v.facing * sqx, size * sqy, lean, py);
      place(v.mask, anchorY, px, py - altitude, size * v.facing * sqx, size * sqy, lean, py + 0.001);
      v.mask.visible = true;
      const trim = ragged >= 0 ? frame.torn : rank > 0 ? frame.gild?.[rank - 1] : undefined;
      v.trim.visible = trim !== undefined;
      if (trim) {
        v.trim.texture = trim;
        place(v.trim, anchorY, px, py - altitude, size * v.facing * sqx, size * sqy, lean, py + 0.002);
      }
      v.glow.visible = flash > 0.01;
      if (v.glow.visible) {
        if (v.glow.parent !== layer) layer.addChild(v.glow);
        v.glow.texture = frame.sil;
        v.glow.tint = v.flashTint;
        v.glow.alpha = flash;
        place(v.glow, anchorY, px, py - altitude, size * v.facing * sqx, size * sqy, lean, py + 0.003);
      }
      v.mask.tint = tint;
      const wounded = u.hp / u.maxHp;
      v.body.tint = wounded < 0.35 ? 0xd8b0a8 : 0xffffff;
    }

    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }

    for (const [id, v] of this.views) {
      if (v.seen === this.frameNo) continue;
      this.views.delete(id);
      this.release(v);
    }
  }

  /** Forget every soldier: a new war (or a jump back in time) reuses ids that mean someone else now. */
  reset(): void {
    for (const v of this.views.values()) this.release(v);
    this.views.clear();
    for (const c of this.centroids.values()) this.centroidPool.push(c);
    this.centroids.clear();
  }

  private acquire(kind: Kind): View {
    const v = this.pool.pop() ?? this.create();
    v.kind = kind;
    v.facing = 1;
    v.speed = 0;
    v.vx = 0;
    v.clock = 0;
    v.freezeUntil = -1;
    v.swingAt = v.flashAt = v.knockAt = -1;
    v.flashFrame = -1;
    v.glow.visible = v.rim.visible = v.pip.visible = v.base.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.trim.visible = v.dot.visible = false;
    return v;
  }

  private create(): View {
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    shadow.alpha = 0.7;
    const halo = new Sprite(this.tex.ring);
    halo.anchor.set(0.5);
    halo.visible = false;
    const base = new Sprite(this.tex.base);
    base.anchor.set(0.5);
    base.visible = false;
    const pip = new Sprite(this.tex.chevrons[0]);
    pip.anchor.set(0.5, 0);
    pip.visible = false;
    const rim = new Sprite();
    const body = new Sprite();
    const mask = new Sprite();
    const trim = new Sprite();
    trim.visible = false;
    const glow = new Sprite();
    glow.visible = false;
    const dot = new Sprite(this.tex.dot);
    dot.anchor.set(0.5);
    this.shadows.addChild(shadow, pip);
    this.bases.addChild(base, halo);
    this.bodies.addChild(rim, body, mask, trim, glow);
    this.dots.addChild(dot);
    return { shadow, halo, base, pip, rim, body, mask, trim, dot, kind: 0, facing: 1, x: 0, y: 0, speed: 0, vx: 0, phase: 0, seen: 0, pose: { x: 0, y: 0, facing: 1, kind: 0, p: 0 }, glow, clock: 0, freezeUntil: -1, swingAt: -1, stx: 0, sty: 0, flashAt: -1, flashFrame: -1, flashTint: 0xffffff, knockAt: -1, kdx: 0, kdy: 0, kms: 1 };
  }

  private release(v: View): void {
    v.glow.visible = v.rim.visible = v.pip.visible = v.base.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.trim.visible = v.dot.visible = false;
    this.pool.push(v);
  }

  /** A falling body for this kind, sized and anchored at the feet like the living soldier. */
  corpse(kind: Kind): { texture: UnitFrame['body']; scale: number; anchorY: number; altitude: number } {
    const frames = this.art.frames(kind, 'die');
    const cell = this.art.cell(kind);
    return { texture: frames[frames.length - 1]!.body, scale: this.art.scale(kind) / cell.h, anchorY: cell.feetY / cell.h, altitude: this.art.flight(kind)?.height ?? 0 };
  }

  /** Whether this kind's art is baked: until it is, the kind draws as a token. */
  artReady(kind: Kind): boolean {
    return this.art.ready(kind);
  }

  isRanged(kind: Kind): boolean {
    return STATS[kind]!.ranged;
  }
}
