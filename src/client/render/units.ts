import { FAR_ZOOM } from './lod.ts';
import { Container, Sprite } from 'pixi.js';
import { Kind, PlatoonState, type Unit, type World } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import type { Runner } from '../net/runner.ts';
import { CELL, FEET_Y, type Textures } from './textures.ts';

const SWING_PULL_MS = 110;
const SWING_LUNGE_MS = 230;
const SWING_END_MS = 420;
const FLASH_MS = 90;
const KNOCK_MS = 160;
const STEP_PERIOD_MS = 260;

interface Swing {
  at: number;
  tx: number;
  ty: number;
}

interface View {
  shadow: Sprite;
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
}

export interface UnitPose {
  x: number;
  y: number;
  facing: number;
  kind: Kind;
  p: number;
}

/** Soldiers: interpolated, facing their work, bobbing as they walk. */
export class UnitLayer {
  readonly shadows = new Container();
  readonly bodies = new Container();
  readonly dots = new Container();
  private views = new Map<number, View>();
  private pool: View[] = [];
  private swings = new Map<number, Swing>();
  private flashes = new Map<number, number>();
  private knocks = new Map<number, { at: number; dx: number; dy: number }>();
  private frameNo = 0;
  private tmp = { x: 0, y: 0 };
  private lastPose = new Map<number, UnitPose>();
  tints: number[] = [];
  cryTint: number[] = [];

  constructor(private tex: Textures) {
    this.bodies.sortableChildren = true;
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
    return this.lastPose.get(unitId);
  }

  update(world: World, runner: Runner | null, now: number, zoom: number, bounds: { contains(x: number, y: number): boolean }): void {
    this.frameNo++;
    const far = zoom < FAR_ZOOM;
    const alpha = runner?.alpha ?? 1;
    const platoonState = new Map<number, number>();
    for (const pl of world.platoons) platoonState.set(pl.id, pl.state);
    const unitIndex = new Map<number, Unit>();
    for (const u of world.units) unitIndex.set(u.id, u);
    this.lastPose.clear();

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

      this.lastPose.set(u.id, { x, y, facing: v.facing, kind: u.kind, p: u.p });
      const visible = bounds.contains(x, y);
      if (!visible) {
        v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
        continue;
      }
      const tint = this.tints[u.p] ?? 0xcccccc;
      if (far) {
        v.shadow.visible = v.body.visible = v.mask.visible = false;
        v.dot.visible = true;
        v.dot.position.set(x, y);
        v.dot.tint = tint;
        const big = u.kind === Kind.Champion || u.kind === Kind.Golem;
        v.dot.scale.set(((big ? 7 : 4.5) / zoom / 32) * Math.min(1, zoom * 3.2));
        continue;
      }
      v.dot.visible = false;
      v.shadow.visible = v.body.visible = v.mask.visible = true;

      // Swing: wind up away from the victim, then lunge in as the blow lands.
      let ox = 0;
      let oy = 0;
      const swing = this.swings.get(u.id);
      if (swing) {
        const t = now - swing.at;
        if (t > SWING_END_MS) this.swings.delete(u.id);
        else {
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
      const stepMs = u.kind === Kind.Outrider ? STEP_PERIOD_MS * 0.7 : u.kind === Kind.Golem ? STEP_PERIOD_MS * 1.6 : STEP_PERIOD_MS;
      const cycle = (now / stepMs + v.phase) % 1;
      const frame = walking && cycle > 0.5 ? 1 : 0;
      const bob = walking ? -Math.abs(Math.sin(cycle * Math.PI * 2)) * 1.4 : Math.sin(now / 900 + v.phase * 6) * 0.25;
      const lean = walking ? (routing ? -0.22 : 0.07) * v.facing : Math.sin(now / 1300 + v.phase * 5) * 0.03;

      const size = this.tex.unitScale[u.kind]! / CELL;
      const px = x + ox;
      const py = y + oy;
      const feet = (FEET_Y / CELL - 0.5) * CELL * size;
      v.shadow.position.set(px, py);
      v.shadow.scale.set((this.tex.unitScale[u.kind]! * (u.kind === Kind.Outrider ? 1.3 : 0.75)) / 64, (this.tex.unitScale[u.kind]! * 0.3) / 64);
      const flashing = now - (this.flashes.get(u.id) ?? -1e9) < FLASH_MS;
      v.body.texture = flashing ? this.tex.units[u.kind]!.sil : this.tex.units[u.kind]!.body[frame]!;
      v.mask.texture = this.tex.units[u.kind]!.mask[frame]!;
      for (const s of [v.body, v.mask]) {
        s.position.set(px, py - feet + bob);
        s.scale.set(size * v.facing, size);
        s.rotation = lean;
        s.zIndex = py;
      }
      v.mask.zIndex = py + 0.001;
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
    v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
    return v;
  }

  private create(): View {
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    shadow.alpha = 0.7;
    const body = new Sprite(this.tex.units[0]!.body[0]!);
    body.anchor.set(0.5);
    const mask = new Sprite(this.tex.units[0]!.mask[0]!);
    mask.anchor.set(0.5);
    const dot = new Sprite(this.tex.dot);
    dot.anchor.set(0.5);
    this.shadows.addChild(shadow);
    this.bodies.addChild(body, mask);
    this.dots.addChild(dot);
    return { shadow, body, mask, dot, kind: 0, facing: 1, x: 0, y: 0, speed: 0, phase: 0, seen: 0 };
  }

  private release(v: View): void {
    v.shadow.visible = v.body.visible = v.mask.visible = v.dot.visible = false;
    this.pool.push(v);
  }

  /** The kind's sprite size, for effects that mimic a soldier. */
  scaleOf(kind: Kind): number {
    return this.tex.unitScale[kind]! / CELL;
  }

  isRanged(kind: Kind): boolean {
    return STATS[kind]!.ranged;
  }
}
