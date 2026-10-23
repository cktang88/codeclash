import { FAR_ZOOM } from './lod.ts';
import { Container, Sprite } from 'pixi.js';
import { Kind, PlatoonState, type Unit, type World } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import type { Runner } from '../net/runner.ts';
import type { UnitArt, UnitFrame } from './art/index.ts';
import { gradeOf } from './flags.ts';
import { mixColor } from './paint.ts';
import type { Textures } from './textures.ts';

const SWING_PULL_MS = 110;
const SWING_LUNGE_MS = 230;
const SWING_END_MS = 420;
const FLASH_MS = 90;
const KNOCK_MS = 160;
const STEP_PERIOD_MS = 520;
const ATTACK_FRAME_MS = 105;
const IDLE_FRAME_MS = 700;
/** Rank chevrons show only when soldiers are big enough to carry them. */
const PIP_ZOOM = 1.1;

interface Swing {
  at: number;
  tx: number;
  ty: number;
}

interface View {
  shadow: Sprite;
  /** Army-colored ring under big units, so a Dragon's side reads at a glance. */
  halo: Sprite;
  /** Gold chevrons under veterans, at near zoom. */
  pip: Sprite;
  body: Sprite;
  mask: Sprite;
  dot: Sprite;
  kind: Kind;
  facing: number;
  x: number;
  y: number;
  /** Smoothed speed, for the walk cycle. */
  speed: number;
  phase: number;
  seen: number;
  /** Where this soldier was drawn this frame; reused, never reallocated. */
  pose: UnitPose;
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
  readonly bodies = new Container();
  readonly dots = new Container();
  /** Flyers soar above banners; their shadows stay on the ground. */
  readonly air = new Container();
  private views = new Map<number, View>();
  private pool: View[] = [];
  private swings = new Map<number, Swing>();
  private flashes = new Map<number, number>();
  private knocks = new Map<number, { at: number; dx: number; dy: number }>();
  private frameNo = 0;
  private tmp = { x: 0, y: 0 };
  // Rebuilt every frame; kept as fields and cleared so the hot loop allocates nothing.
  private platoonState = new Map<number, number>();
  private unitIndex = new Map<number, Unit>();
  tints: number[] = [];
  cryTint: number[] = [];
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

  swing(unitId: number, tx: number, ty: number, now: number): void {
    this.swings.set(unitId, { at: now, tx, ty });
  }

  flash(unitId: number, now: number): void {
    this.flashes.set(unitId, now);
  }

  knock(unitId: number, dx: number, dy: number, now: number): void {
    this.knocks.set(unitId, { at: now, dx, dy });
  }

  /** Where a soldier was last drawn: for effects that start at a soldier. */
  pose(unitId: number): UnitPose | undefined {
    const v = this.views.get(unitId);
    return v && v.seen === this.frameNo ? v.pose : undefined;
  }

  update(world: World, runner: Runner | null, now: number, zoom: number, bounds: { contains(x: number, y: number): boolean }): void {
    for (const pl of world.players) {
      const g = gradeOf(pl);
      this.ranks[pl.p] = g.rank;
      // Ragged armies wear faded, patched tabards: their color washes toward grey.
      this.raggedTint[pl.p] = g.ragged ? mixColor(this.tints[pl.p] ?? 0xcccccc, 0x8a8478, 0.5) : -1;
    }
    this.frameNo++;
    const far = zoom < FAR_ZOOM;
    const alpha = runner?.alpha ?? 1;
    const platoonState = this.platoonState;
    platoonState.clear();
    for (const pl of world.platoons) platoonState.set(pl.id, pl.state);
    const unitIndex = this.unitIndex;
    unitIndex.clear();
    for (const u of world.units) unitIndex.set(u.id, u);

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
      let x = u.x;
      let y = u.y;
      if (runner && runner.previousPosition(u.id, this.tmp)) {
        x = this.tmp.x + (u.x - this.tmp.x) * alpha;
        y = this.tmp.y + (u.y - this.tmp.y) * alpha;
      }
      const dx = x - v.x;
      const dy = y - v.y;
      const moved = Math.sqrt(dx * dx + dy * dy);
      v.speed = v.speed * 0.85 + moved * 0.15;
      v.x = x;
      v.y = y;

      // Face the enemy when fighting, otherwise the direction of travel.
      let face = 0;
      if (u.target > 0) {
        const t = unitIndex.get(u.target);
        if (t) face = t.x - x;
      } else if (u.target < 0) {
        const st = world.structures[-u.target - 1];
        if (st) face = world.map.sites[st.site]!.x - x;
      }
      if (face === 0 && Math.abs(dx) > 0.02) face = dx;
      if (Math.abs(face) > 0.5) v.facing = face > 0 ? 1 : -1;

      const pose = v.pose;
      pose.x = x;
      pose.y = y;
      pose.facing = v.facing;
      pose.kind = u.kind;
      pose.p = u.p;
      const visible = bounds.contains(x, y);
      if (!visible) {
        v.pip.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
        continue;
      }
      const ragged = this.raggedTint[u.p] ?? -1;
      const tint = ragged >= 0 ? ragged : (this.tints[u.p] ?? 0xcccccc);
      if (far) {
        v.pip.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = false;
        v.dot.visible = true;
        v.dot.position.set(x, y);
        v.dot.tint = tint;
        const big = STATS[u.kind]!.size;
        // Elites and legends keep their silhouette even from afar.
        if (big >= 9) {
          v.dot.texture = this.art.icon(u.kind);
          v.dot.scale.set((10 + big * 0.9) / zoom / this.art.cell(u.kind).h);
        } else {
          v.dot.texture = this.tex.dot;
          v.dot.scale.set(((3 + big * 0.35) / zoom / 32) * Math.min(1, zoom * 3.2));
        }
        continue;
      }
      v.dot.visible = false;
      v.shadow.visible = v.body.visible = v.mask.visible = true;

      // Swing: wind up away from the victim, then lunge in as the blow lands.
      let ox = 0;
      let oy = 0;
      let attackFrame = -1;
      const swing = this.swings.get(u.id);
      if (swing) {
        const t = now - swing.at;
        if (t > SWING_END_MS) this.swings.delete(u.id);
        else {
          attackFrame = Math.min(3, Math.floor(t / ATTACK_FRAME_MS));
          const sx = swing.tx - x;
          const sy = swing.ty - y;
          const d = Math.sqrt(sx * sx + sy * sy) || 1;
          let k: number;
          if (t < SWING_PULL_MS) k = -2.2 * (t / SWING_PULL_MS);
          else if (t < SWING_LUNGE_MS) k = -2.2 + 6.2 * ((t - SWING_PULL_MS) / (SWING_LUNGE_MS - SWING_PULL_MS));
          else k = 4 * (1 - (t - SWING_LUNGE_MS) / (SWING_END_MS - SWING_LUNGE_MS));
          ox += (sx / d) * k;
          oy += (sy / d) * k;
        }
      }
      const knock = this.knocks.get(u.id);
      if (knock) {
        const t = now - knock.at;
        if (t > KNOCK_MS) this.knocks.delete(u.id);
        else {
          const k = 1 - t / KNOCK_MS;
          ox += knock.dx * k;
          oy += knock.dy * k;
        }
      }

      const walking = v.speed > 0.12;
      const routing = platoonState.get(u.platoon) === PlatoonState.Rout;
      const stats = STATS[u.kind]!;
      const flight = this.art.flight(u.kind);
      const flying = flight !== null;
      let frame: UnitFrame;
      if (attackFrame >= 0) frame = this.art.frames(u.kind, 'attack')[attackFrame]!;
      else if (walking || flying) {
        const frames = this.art.frames(u.kind, 'walk');
        // Big, slow kinds stride slowly; fliers beat their wings at a steady pace.
        const period = flying ? 640 : STEP_PERIOD_MS * Math.max(0.6, Math.min(1.8, 1.6 / stats.speed));
        frame = frames[Math.floor(((now / period + v.phase) % 1) * frames.length)]!;
      } else {
        const frames = this.art.frames(u.kind, 'idle');
        frame = frames[Math.floor(now / IDLE_FRAME_MS + v.phase * 4) % frames.length]!;
      }
      const altitude = flying ? flight.height + Math.sin(now / 520 + v.phase * 6) * 3 : 0;
      const lean = attackFrame >= 0 ? 0 : walking && routing ? -0.2 * v.facing : 0;

      const cell = this.art.cell(u.kind);
      const worldH = this.art.scale(u.kind);
      const size = worldH / cell.h;
      const px = x + ox;
      const py = y + oy;
      v.shadow.position.set(px, py);
      const wide = stats.slots >= 2 || u.kind === Kind.Outrider ? 0.9 : 0.55;
      v.shadow.scale.set((worldH * wide * (flying ? 0.8 : 1)) / 64, (worldH * 0.22 * (flying ? 0.7 : 1)) / 64);
      v.shadow.alpha = flying ? 0.45 : 0.7;
      v.halo.visible = stats.size >= 9;
      if (v.halo.visible) {
        v.halo.position.set(px, py);
        v.halo.scale.set((worldH * wide * 1.15) / 128, (worldH * 0.3) / 128);
        v.halo.tint = tint;
        v.halo.alpha = flying ? 0.6 : 0.85;
      }
      const rank = this.ranks[u.p] ?? 0;
      v.pip.visible = rank > 0 && zoom >= PIP_ZOOM && !flying;
      if (v.pip.visible) {
        v.pip.texture = this.tex.chevrons[rank - 1]!;
        v.pip.position.set(px, py + 2);
        v.pip.scale.set(Math.max(0.16, 7 / zoom / 32));
      }
      const layer = flying ? this.air : this.bodies;
      if (v.body.parent !== layer) layer.addChild(v.body, v.mask);
      const flashing = now - (this.flashes.get(u.id) ?? -1e9) < FLASH_MS;
      v.body.texture = flashing ? frame.sil : frame.body;
      v.mask.texture = frame.mask;
      const anchorY = cell.feetY / cell.h;
      place(v.body, anchorY, px, py - altitude, size * v.facing, size, lean, py);
      place(v.mask, anchorY, px, py - altitude, size * v.facing, size, lean, py + 0.001);
      v.mask.visible = !flashing;
      v.mask.tint = this.cryTint[u.p] ?? tint;
      const wounded = u.hp / u.maxHp;
      v.body.tint = flashing ? 0xffffff : wounded < 0.35 ? 0xd8b0a8 : 0xffffff;
    }

    for (const [id, v] of this.views) {
      if (v.seen === this.frameNo) continue;
      this.views.delete(id);
      this.swings.delete(id);
      this.flashes.delete(id);
      this.knocks.delete(id);
      this.release(v);
    }
  }

  private acquire(kind: Kind): View {
    const v = this.pool.pop() ?? this.create();
    v.kind = kind;
    v.facing = 1;
    v.speed = 0;
    v.pip.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
    return v;
  }

  private create(): View {
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    shadow.alpha = 0.7;
    const halo = new Sprite(this.tex.ring);
    halo.anchor.set(0.5);
    halo.visible = false;
    const pip = new Sprite(this.tex.chevrons[0]);
    pip.anchor.set(0.5, 0);
    pip.visible = false;
    const body = new Sprite();
    const mask = new Sprite();
    const dot = new Sprite(this.tex.dot);
    dot.anchor.set(0.5);
    this.shadows.addChild(shadow, halo, pip);
    this.bodies.addChild(body, mask);
    this.dots.addChild(dot);
    return { shadow, halo, pip, body, mask, dot, kind: 0, facing: 1, x: 0, y: 0, speed: 0, phase: 0, seen: 0, pose: { x: 0, y: 0, facing: 1, kind: 0, p: 0 } };
  }

  private release(v: View): void {
    v.pip.visible = v.halo.visible = v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
    this.pool.push(v);
  }

  /** A falling body for this kind, sized and anchored at the feet like the living soldier. */
  corpse(kind: Kind): { texture: UnitFrame['body']; scale: number; anchorY: number; altitude: number } {
    const frames = this.art.frames(kind, 'die');
    const cell = this.art.cell(kind);
    return { texture: frames[frames.length - 1]!.body, scale: this.art.scale(kind) / cell.h, anchorY: cell.feetY / cell.h, altitude: this.art.flight(kind)?.height ?? 0 };
  }

  isRanged(kind: Kind): boolean {
    return STATS[kind]!.ranged;
  }
}
