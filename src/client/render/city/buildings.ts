// The commandery's buildings, painted pixel by pixel at each level: an empty lot with the
// surveyors' stakes, then timber, stone, fortified and grand. Static parts are painted once per
// level change into small canvases; what moves (bells, banners, smoke, lit windows) is returned
// as anchors for the scene to animate.

import type { BuildingKey } from '../../../game/city.ts';
import { box, CLASSIC, cone, drum, gable, hash, hex, line3, mix, nightCanvas, NIGHT_RIG, OX, post, pyramid, Px, sx, sy, tone, v3, type Col, type Facing, type Frame, type NightRig, type Shader, type V3 } from './pixels.ts';
import type { CityStyle, Ramp } from './style.ts';

/** Level to tier: 0 empty lot, 1 timber, 2 stone, 3 fortified, 4 grand. */
export function tierOf(level: number): number {
  return level <= 0 ? 0 : level < 5 ? 1 : level < 10 ? 2 : level < 15 ? 3 : 4;
}
export const TIER_START = [0, 1, 5, 10, 15, 99];

/** Footprints (u0, v0, u1, v1) of each lot inside the walls (0..232). */
export const LOT: Record<BuildingKey | 'keep', [number, number, number, number]> = {
  keep: [14, 14, 58, 58],
  chapter: [76, 10, 138, 46],
  barracks: [12, 72, 46, 130],
  range: [150, 10, 216, 66],
  granary: [158, 74, 206, 102],
  stables: [12, 146, 46, 214],
  workshop: [168, 138, 214, 184],
  hospital: [96, 184, 140, 216],
  walls: [0, 0, 232, 232],
};
export const WALL = 232;
/** The gate in the south-east wall (u = WALL), centred on v. */
export const GATE_V = 118;

export interface Banner {
  /** Pole top on screen. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Long tailed pennon instead of a square banner. */
  pennon?: boolean;
}

export interface Art {
  canvas: HTMLCanvasElement | null;
  x: number;
  y: number;
  /** Window glass, to light at night. */
  lights: HTMLCanvasElement | null;
  /** The same art under the night rig (pixels.ts nightCanvas), laid over it as night falls. */
  night?: HTMLCanvasElement | null;
  /** Sort key: u + v of the part's centre. */
  d: number;
}

export interface BuildingParts {
  arts: Art[];
  smoke: [number, number][];
  banners: Banner[];
  torches: [number, number][];
  /** Bells: screen point of the pivot. */
  bells: [number, number][];
  /** Forge mouths: screen points that glow. */
  forges: [number, number][];
  /** Stall doors where horses look out (stables). */
  stalls: [number, number][];
  /** Straw targets: screen centre (range). */
  targets: [number, number][];
  /** HD: emissive light sources (world pixels) and their colour: 0 grave-light green, 1 arcane violet. */
  glows?: [number, number, number][];
}

export const emptyParts = (): BuildingParts => ({ arts: [], smoke: [], banners: [], torches: [], bells: [], forges: [], stalls: [], targets: [] });

// ------------------------------------------------------------------ materials

export interface Hole {
  face: Facing;
  s: number;
  t: number;
  w: number;
  h: number;
  kind: 'window' | 'door' | 'slit' | 'stall' | 'arch' | 'rose';
}

const LIGHT: Record<Facing, number> = { top: 0, left: 1, right: 2, back: 2 };

export class Painter {
  readonly px: Px;
  /** Pixels per world unit (1 classic, 2 HD). */
  readonly k: number;
  /** Glass pixels painted, as [x, y, colour]. */
  glass: number[] = [];
  /** HD: a cool rim light laid on every top edge before the outline (moonlight on the necropolis). */
  rim: Col | null = null;
  /** Drawing done after the outline in finish(). */
  late: (() => void)[] = [];
  constructor(
    readonly st: CityStyle,
    readonly frame: Frame = CLASSIC,
  ) {
    this.px = new Px(frame.w, frame.h, frame);
    this.k = frame.k;
  }

  reset(): void {
    this.px.clear();
    this.glass = [];
    this.late = [];
  }

  rampAt(r: Ramp, f: Facing, k = 0): Col {
    return r[Math.min(3, LIGHT[f] + k)]!;
  }

  /** A wall face: stone, fine stone, timber frame, or palisade; with windows and doors cut in. */
  wall(mat: 'stone' | 'fine' | 'timber' | 'plank', h: number, holes: Hole[] = [], seed = 0, gold = -1): Shader {
    const st = this.st;
    const q = this.k;
    return (f, s, t, p) => {
      const si = Math.floor(s);
      const ti = Math.floor(t);
      // The same patterns in buffer pixels, so HD gets 1-pixel joints instead of doubled ones.
      const sq = Math.floor(s * q);
      const tq = Math.floor(t * q);
      // HD: flat tops (merlons, wall-walks) without joint noise; a worn lighter rim at the edges.
      if (q > 1 && f === 'top') {
        const r = mat === 'fine' ? st.fine : mat === 'timber' || mat === 'plank' ? st.timber : st.stone;
        return tq % (3 * q) === 0 && mat !== 'timber' && mat !== 'plank' ? r[1] : r[0];
      }
      for (const o of holes) {
        if (o.face !== f) continue;
        if (o.kind === 'rose') {
          const dx = s - (o.s + o.w / 2);
          const dz = t - (o.t + o.h / 2);
          const r = Math.hypot(dx, dz * 1.1);
          if (r < o.w / 2) {
            if (r > o.w / 2 - 1) return this.rampAt(st.fine, f);
            const spoke = Math.abs(Math.sin(Math.atan2(dz, dx) * 4)) < 0.35 || r < 1.2;
            return this.glassAt(p, spoke ? this.rampAt(st.stone, f, 1) : st.glass);
          }
          continue;
        }
        if (s < o.s - 1 || s >= o.s + o.w + 1 || t < o.t - 1 || t >= o.t + o.h + 1) continue;
        const inS = s >= o.s && s < o.s + o.w;
        const inT = t >= o.t && t < o.t + o.h;
        const ls = s - o.s;
        // Round-arched heads on stone openings: the top corners stay wall.
        const arched = mat !== 'timber' && mat !== 'plank' && o.w >= 3 && o.kind !== 'stall';
        if (inS && inT) {
          if (arched && t >= o.t + o.h - 1 && (ls < 1 || ls >= o.w - 1)) return this.rampAt(mat === 'fine' ? st.fine : st.stone, f, 1);
          if (o.kind === 'door' && q > 1) {
            // HD: planks two art pixels wide, two iron straps with hinge ends, nail studs.
            const x = Math.floor(ls * q);
            const y = Math.floor((t - o.t) * q);
            const strap = y === 4 || y === Math.floor(o.h * q) - 5;
            if (strap) return x % 3 === 0 ? tone(st.slate[1], -0.15) : st.outline;
            if ((y === 3 || y === Math.floor(o.h * q) - 4) && x % 3 === 0) return st.slate[1];
            return x % 2 === 0 ? (x % 4 === 0 ? st.timber[2] : st.timber[1]) : st.timber[3];
          }
          if (o.kind === 'door') {
            const plank = Math.floor(ls) % 2 === 0;
            const iron = Math.floor(t - o.t) === 2 || Math.floor(t - o.t) === o.h - 3;
            return iron ? st.outline : plank ? st.timber[2] : st.timber[3];
          }
          if (o.kind === 'stall') return t - o.t > o.h * 0.45 ? st.glass : this.rampAt(st.timber, f, Math.floor(ls) % 2);
          if (o.kind === 'arch') return st.glass;
          // Glass with a mullion for wide windows.
          if (o.w >= 3 && Math.floor(ls) === Math.floor(o.w / 2)) return this.rampAt(mat === 'timber' ? st.timber : st.stone, f, 1);
          // HD tracery: a transom bar, and leading in the glass.
          if (q > 1 && o.w >= 2 && arched && Math.floor((t - o.t) * q) === Math.floor(o.h * q * 0.62)) return this.rampAt(st.fine, f, 1);
          if (q > 1 && (Math.floor(ls * q) + Math.floor((t - o.t) * q)) % 4 === 0 && o.kind === 'window') return this.glassAt(p, tone(st.glass, -0.12));
          return this.glassAt(p, st.glass);
        }
        // HD: a sill under stone windows, lit on top.
        if (q > 1 && arched && o.kind === 'window' && inS && t < o.t && t >= o.t - 0.5) return this.rampAt(st.fine, f);
        // A dressed frame around stone openings, a timber lintel on timber walls.
        if (o.kind === 'slit') continue;
        if (t >= o.t + o.h && t < o.t + o.h + 1 && s >= o.s - 1 && s < o.s + o.w + 1) return mat === 'timber' || mat === 'plank' ? this.rampAt(st.timber, f, 1) : this.rampAt(st.fine, f);
      }
      let c: Col;
      if (mat === 'timber') {
        const beam =
          sq % (8 * q) < q || ti === 0 || ti === Math.floor(h / 2) || t >= h - 1 ||
          (hash(Math.floor(s / 8), seed, 7) < 0.5 && t < h / 2 && Math.abs((s % 8) - (t / (h / 2)) * 8) < 0.9);
        c = beam ? this.rampAt(st.timber, f) : this.rampAt(st.daub, f);
        // Stamps, not speckle: a 2-px crack in some 5×3 cells of daub, on the lit face only.
        if (!beam && f === 'left' && stampAt(sq, tq, 5 * q, 3 * q, seed, 0.3, 2 * q)) c = tone(c, 0.1);
        // HD: a dark inner line along the beams' lower edges.
        if (q > 1 && beam && !(sq % (8 * q) < q) && tq === Math.floor(Math.floor(h / 2) * q)) c = this.rampAt(st.timber, f, 1);
      } else if (mat === 'plank') {
        c = this.rampAt(st.timber, f, Math.floor(sq / q) % 3 === 0 && (q === 1 || sq % q === 0) ? 1 : 0);
        // A knot stamp on a few boards of the lit face.
        if (f === 'left' && stampAt(sq, tq, 3 * q, 4 * q, seed + 1, 0.25, q)) c = tone(c, 0.15);
      } else {
        const r = mat === 'fine' ? st.fine : st.stone;
        const ch = (mat === 'fine' ? 4 : 3) * q;
        const row = Math.floor(tq / ch);
        const bw = (mat === 'fine' ? 8 : 6) * q;
        const off = ((row * (mat === 'fine' ? 4 : 3) + (hash(row, seed, 3) * 3) | 0) * q) % bw;
        const joint = (sq + off) % bw === 0;
        const course = tq % ch === ch - 1;
        c = this.rampAt(r, f);
        const blk = hash(Math.floor((sq + off) / bw), row, seed);
        if (blk < 0.18) c = tone(c, 0.1);
        else if (blk > 0.9) c = tone(c, -0.08);
        // Joints in one colour per face (not per block), so the mortar is one connected net rather
        // than a scatter of differently tinted 1-2 px bits.
        if (q > 1 && f !== 'left' && (course || joint)) c = mix(this.rampAt(r, f), st.mortar, 0.22);
        else if (course || joint) c = mix(this.rampAt(r, f), st.mortar, f === 'left' ? 0.45 : 0.35);
        // HD: a lit top edge on each course of the lit face (sparse, regular texture).
        else if (q > 1 && f === 'left' && tq % ch === 0) c = tone(c, -0.1);
        else if (q > 1 && f === 'left' && (sq + off) % bw === 1) c = tone(c, -0.06);
        // HD: a few weathered blocks carry a darker chip at their lower right.
        if (q > 1 && blk > 0.82 && (sq + off) % bw === bw - 2 && tq % ch === ch - 2) c = tone(c, 0.2);
        if (gold >= 0 && ti === gold) c = f === 'left' ? st.gold : tone(st.gold, 0.25);
      }
      // Grime at the foot of the wall, shadow under the eaves.
      if (t < 2 && p.z < 3) c = tone(c, 0.18);
      if (t > h - 1.5) c = tone(c, 0.3);
      return c;
    };
  }

  /** Mark a glass pixel (it lights at night) and return its colour. */
  glassAt(p: V3, c: Col): Col {
    this.glass.push(Math.floor(this.px.X(p.u, p.v)), Math.floor(this.px.Y(p.u, p.v, p.z)));
    return c;
  }

  /** A roof covering: thatch, shingle, tile or slate, by rows up the slope. */
  roof(mat: 'thatch' | 'shingle' | 'tile' | 'slate' | 'lead', seed = 0): Shader {
    const st = this.st;
    const r = mat === 'thatch' ? st.thatch : mat === 'shingle' ? st.shingle : mat === 'tile' ? st.tile : st.slate;
    const q = this.k;
    return (f, s, t) => {
      const base = f === 'left' ? r[0] : f === 'right' ? r[2] : f === 'top' ? r[1] : r[1];
      const si = Math.floor(s * q) / q;
      const ti = Math.floor(t);
      let c = base;
      if (mat === 'thatch') {
        const sq = Math.floor(s * q);
        const tq = Math.floor(t * q);
        const n = hash((sq + (tq & 1)) >> 1, tq, seed);
        if (ti % 3 === 0) c = tone(c, 0.18);
        // Straw ends: dashes two pixels long, staggered row to row (no checker, no lone pixel);
        // the light ones only where the sun reaches.
        if (n < 0.16) c = tone(c, 0.12);
        else if (n > 0.9 && f !== 'right') c = tone(c, -0.1);
        if (t < 1) c = tone(c, 0.35);
      } else if (mat === 'lead') {
        c = mix(st.slate[LIGHT[f]]!, st.stone[3], 0.2);
        if (si % 5 === 0) c = tone(c, 0.15);
      } else {
        const rowH = 2;
        const row = Math.floor(t / rowH);
        // Classic tiles are 2 px wide between joints (1-px tiles read as a stipple).
        const gap = mat === 'slate' || q === 1 ? 3 : 2;
        const off = row % 2;
        const tq = Math.floor(t * q);
        const sq = Math.floor(s * q);
        if (q === 1 ? ti % rowH === 0 : tq % (rowH * q) === 0) c = tone(c, mat === 'tile' ? 0.28 : 0.22);
        else if (q === 1 ? (si + off) % gap === 0 : (sq + off * q) % (gap * q) === 0) c = tone(c, 0.14);
        else if (q > 1 && tq % (rowH * q) === 1) c = tone(c, -0.06);
        if (q === 1) {
          if (hash(Math.floor(si) >> 1, row, seed) < 0.08) c = tone(c, -0.12);
        } else {
          // HD: whole tiles vary a little (a weathered one here and there), each lit at its left.
          const tile = Math.floor((sq + off * q) / (gap * q));
          const n = hash(tile, row, seed);
          if (n < 0.12) c = tone(c, 0.07);
          else if (n > 0.93) c = tone(c, -0.07);
          if ((sq + off * q) % (gap * q) === 1 && tq % (rowH * q) > 1 && f === 'left') c = tone(c, -0.08);
        }
        if (t < 1) c = tone(c, q > 1 && t < 0.5 ? 0.45 : 0.35);
      }
      return c;
    };
  }

  flat(c: Col): Shader {
    return (f) => (f === 'left' ? c : f === 'top' ? tone(c, -0.12) : tone(c, 0.25));
  }

  // ---------------------------------------------------------------- parts

  /** Merlons along the visible top edges of a box. */
  // (public helpers below are shared with the faction kits in samurai.ts and undead.ts)
  crenels(u0: number, v0: number, z: number, lu: number, lv: number, sh: Shader): void {
    const m = 2;
    for (let u = u0; u <= u0 + lu - m; u += 4) {
      box(this.px, u, v0 + lv - m, z, m, m, 3, sh);
      box(this.px, u, v0, z, m, m, 3, sh);
    }
    for (let v = v0; v <= v0 + lv - m; v += 4) {
      box(this.px, u0 + lu - m, v, z, m, m, 3, sh);
      box(this.px, u0, v, z, m, m, 3, sh);
    }
  }

  /** A banner pole; the cloth is drawn live. */
  pole(parts: BuildingParts, u: number, v: number, z: number, h: number, w = 6, bh = 5, pennon = false): void {
    post(this.px, u, v, z, h, this.st.timber[3]);
    this.px.point(v3(u, v, z + h), this.st.gold);
    // In world pixels, on the art pixel beside the pole (the same as floor(sx) + 1 in classic).
    const { k, mx, my } = this.px;
    parts.banners.push({ x: (Math.floor(this.px.X(u, v)) + 1) / k - mx, y: (Math.floor(this.px.Y(u, v, z + h)) + 1) / k - my, w, h: bh, pennon });
  }

  chimney(parts: BuildingParts, u: number, v: number, z: number, h: number): void {
    const sh = this.wall('stone', h, [], 9);
    box(this.px, u, v, z, 3, 3, h, sh);
    parts.smoke.push([Math.floor(sx(u + 1.5, v + 1.5)), Math.floor(sy(u + 1.5, v + 1.5, z + h)) - 1]);
  }

  /** A cross on a gable or spire. */
  cross(u: number, v: number, z: number, c: Col): void {
    post(this.px, u, v, z, 6, c);
    this.px.point(v3(u - 1, v + 1, z + 4), c);
    this.px.point(v3(u + 1, v - 1, z + 4), c);
  }

  /** Scaffolding: poles and ledgers around a footprint, for a building about to rise a tier. */
  scaffold(u0: number, v0: number, lu: number, lv: number, h: number): void {
    const w = this.st.timber[0];
    const d = this.st.timber[2];
    const pts: [number, number][] = [];
    for (let u = u0 - 2; u <= u0 + lu + 2; u += 8) pts.push([u, v0 + lv + 2]);
    for (let v = v0 - 2; v <= v0 + lv + 2; v += 8) pts.push([u0 + lu + 2, v]);
    for (const [u, v] of pts) post(this.px, u, v, 0, h + 5, w, d);
    for (let z = 5; z < h + 4; z += 6) {
      line3(this.px, v3(u0 - 2, v0 + lv + 2, z), v3(u0 + lu + 2, v0 + lv + 2, z), w);
      line3(this.px, v3(u0 + lu + 2, v0 - 2, z), v3(u0 + lu + 2, v0 + lv + 2, z), d);
    }
    // A ladder.
    line3(this.px, v3(u0 + 3, v0 + lv + 3, 0), v3(u0 + 3, v0 + lv + 3, h), w);
    line3(this.px, v3(u0 + 6, v0 + lv + 3, 0), v3(u0 + 6, v0 + lv + 3, h), w);
  }

  /** An empty lot: surveyors' stakes and a line, a heap of stone and a stack of timber. */
  lot(u0: number, v0: number, u1: number, v1: number, seed: number): void {
    const st = this.st;
    const stake = (u: number, v: number) => {
      post(this.px, u, v, 0, 5, st.timber[1]);
      this.px.point(v3(u, v, 5), hash(u, v) < 0.5 ? st.bannerCharge : st.daub[0]);
    };
    const corners: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const [u, v] of corners) stake(u, v);
    const rope = st.daub[1];
    // The line goes on after the outline: an outlined 1-px diagonal is a checkerboard.
    this.late.push(() => {
      for (let i = 0; i < 4; i++) {
        const [a, b] = [corners[i]!, corners[(i + 1) % 4]!];
        line3(this.px, v3(a[0], a[1], 3), v3(b[0], b[1], 3), rope);
      }
    });
    // Stones and timber waiting.
    const mu = (u0 + u1) / 2;
    const mv = (v0 + v1) / 2;
    for (let i = 0; i < 5; i++) {
      const u = mu - 6 + hash(i, seed) * 8;
      const v = mv + 2 + hash(seed, i) * 6;
      // Plain ashlar: a 3-unit block is too small for coursing (it reads as noise).
      box(this.px, u, v, 0, 3, 3, 2 + (i % 2), (f) => this.rampAt(st.stone, f));
    }
    // Squared timbers, plain faces (plank grain on a 2-unit beam is only speckle).
    for (let i = 0; i < 3; i++) box(this.px, mu + 4, mv - 6 + i * 3, i % 2, 12, 2, 2, (f) => this.rampAt(st.timber, f));
  }

  /** Finish one piece: outline, crop, light canvas. */
  finish(depth: number, outline = true): Art {
    const px = this.px;
    const glass = this.glass;
    if (this.rim) {
      // Top edges catch the moon: a pixel with sky above it is lifted toward the rim colour.
      const bb = px.bounds();
      if (bb) {
        const { w, data } = px;
        const lift: number[] = [];
        for (let y = Math.max(1, bb[1]); y < bb[3]; y++)
          for (let x = bb[0]; x < bb[2]; x++) {
            const i = y * w + x;
            if (!data[i]) continue;
            if (!data[i - w] || (x > 0 && !data[i - w - 1] && !data[i - 1])) lift.push(i);
          }
        for (const i of lift) data[i] = mix(data[i]!, this.rim, 0.42);
      }
    }
    if (outline) px.outline(this.st.outline);
    // Things laid on after the outline (ropes), so a 1-px line is not boxed into a checker.
    for (const f of this.late) f();
    this.late = [];
    const b = px.bounds();
    if (!b) return { canvas: null, lights: null, x: 0, y: 0, d: depth };
    const [x0, y0, x1, y1] = b;
    const canvas = px.toCanvas(x0, y0, x1, y1);
    let lights: HTMLCanvasElement | null = null;
    if (glass.length) {
      const lp = new Px(x1 - x0, y1 - y0);
      const on = new Set<number>();
      for (let i = 0; i < glass.length; i += 2) if (px.get(glass[i]!, glass[i + 1]!) === this.st.glass) on.add(glass[i + 1]! * px.w + glass[i]!);
      for (const j of on) {
        const x = j % px.w;
        const y = (j / px.w) | 0;
        // The top row of each pane burns brightest (a lamp's hot spot), the rest one step down.
        lp.set(x - x0, y - y0, on.has(j - px.w) ? this.st.lit : tone(this.st.lit, -0.3));
      }
      lights = lp.toCanvas();
    }
    const night = nightCanvas(px, x0, y0, x1, y1, rigFor(this.st.id));
    return { canvas, lights, night, x: x0, y: y0, d: depth };
  }
}

/**
 * A texture stamp (pixel-art-techniques §2.4): in a grid of cw×ch cells (buffer pixels on a face),
 * a share `p` of cells, chosen by hash, carry one horizontal dash `len` pixels long at a hashed
 * spot. True where (sq, tq) is on a dash.
 */
export function stampAt(sq: number, tq: number, cw: number, ch: number, seed: number, p: number, len: number): boolean {
  const cu = Math.floor(sq / cw);
  const cv = Math.floor(tq / ch);
  if (hash(cu, cv, seed + 101) >= p) return false;
  const ox = Math.floor(hash(cu, cv, seed + 102) * Math.max(1, cw - len));
  const oy = Math.floor(hash(cu, cv, seed + 103) * ch);
  const lx = sq - cu * cw - ox;
  return tq - cv * ch === oy && lx >= 0 && lx < len;
}

/** The moon rig per faction: the necropolis's moon is violet-white over violet shadow. */
const UNDEAD_RIG: NightRig = { rim: hex('#dcd4ff'), lit: hex('#b4a8e4'), ambient: hex('#3a3458'), shade: hex('#261c40'), line: hex('#120e22') };
export const rigFor = (id: string): NightRig => (id === 'undead' ? UNDEAD_RIG : NIGHT_RIG);

// ------------------------------------------------------------------ the buildings

export interface PaintArgs {
  st: CityStyle;
  level: number;
  /** 0..1 toward the next level. */
  progress: number;
  /** For the keep: the highest level of any building; for the granary: the streak. */
  seed: number;
}

let painter: Painter | null = null;

/** The shared painter for a style and frame (one buffer, reused between buildings). */
export function painterFor(st: CityStyle, frame: Frame = CLASSIC): Painter {
  if (!painter || painter.st !== st || painter.frame !== frame) painter = new Painter(st, frame);
  return painter;
}

/**
 * A faction's own buildings (HD). Return true when it painted the building into P (the lot and
 * scaffolding and the finish are then done as for the commandery), finished parts when it did
 * everything itself (the walls), or null to fall back to the commandery's building.
 */
export type FactionKit = (P: Painter, key: BuildingKey | 'keep', a: PaintArgs, parts: BuildingParts) => BuildingParts | boolean | null;
const KITS: Record<string, FactionKit> = {};
export function registerKit(id: string, kit: FactionKit): void {
  KITS[id] = kit;
}
/** A faction's own building outside the walls where the commandery has its windmill (HD). */
type MillKit = (P: Painter, level: number) => [number, number] | null;
const MILLS: Record<string, MillKit> = {};
export function registerMill(id: string, kit: MillKit): void {
  MILLS[id] = kit;
}

export function paintBuilding(key: BuildingKey | 'keep', a: PaintArgs, frame: Frame = CLASSIC): BuildingParts {
  const P = painterFor(a.st, frame);
  P.reset();
  const parts = emptyParts();
  const tier = tierOf(a.level);
  const [u0, v0, u1, v1] = LOT[key];
  const depth = (u0 + u1 + v0 + v1) / 2;
  const kit = frame.k > 1 && (tier > 0 || key === 'keep' || key === 'walls') ? KITS[a.st.id] : undefined;
  let drawn = false;
  if (kit) {
    const done = kit(P, key, a, parts);
    if (done === true) drawn = true;
    else if (done) return done;
    else P.reset();
  }
  if (key === 'walls' && !drawn) return walls(P, a, parts);
  if (tier === 0 && key !== 'keep') {
    P.lot(u0 + 4, v0 + 4, u1 - 4, v1 - 4, a.seed);
    parts.arts.push(P.finish(depth));
    return parts;
  }
  const rising = a.progress > 0.45 && TIER_START.includes(a.level + 1) && a.level > 0;
  if (!drawn) switch (key) {
    case 'keep':
      keep(P, tier, parts);
      break;
    case 'chapter':
      chapter(P, tier, parts);
      break;
    case 'barracks':
      barracks(P, tier, parts);
      break;
    case 'range':
      range(P, tier, a.level, parts);
      break;
    case 'granary':
      granary(P, tier, a.level, parts);
      break;
    case 'stables':
      stables(P, tier, parts);
      break;
    case 'workshop':
      workshop(P, tier, parts);
      break;
    case 'hospital':
      hospital(P, tier, parts);
      break;
  }
  if (rising) {
    const lu = (u1 - u0) * 0.5;
    P.scaffold(u0 + 4, v0 + 4, lu, (v1 - v0) * 0.5, 14 + tier * 4);
  }
  parts.arts.unshift(P.finish(depth));
  return parts;
}

type M = { wall: 'timber' | 'stone' | 'fine'; roof: 'thatch' | 'shingle' | 'tile' | 'slate' };
const MAT: M[] = [
  { wall: 'timber', roof: 'thatch' },
  { wall: 'timber', roof: 'thatch' },
  { wall: 'stone', roof: 'tile' },
  { wall: 'stone', roof: 'tile' },
  { wall: 'fine', roof: 'slate' },
];

/** A hall: walls, gabled roof, a stone plinth under timber, windows and a door. */
export function hall(
  P: Painter, u0: number, v0: number, lu: number, lv: number, h: number, alongU: boolean, tier: number,
  holes: Hole[], seed: number, rh = 0,
): void {
  const m = MAT[tier]!;
  const st = P.st;
  if (m.wall === 'timber') box(P.px, u0, v0, 0, lu, lv, 2, P.wall('stone', 2, [], seed));
  const gold = tier >= 4 ? h - 4 : -1;
  const wsh = P.wall(m.wall, h, holes, seed, gold);
  box(P.px, u0, v0, 0, lu, lv, h, wsh, false);
  const ridge = rh || Math.round((alongU ? lv : lu) * (m.roof === 'thatch' ? 0.6 : 0.5));
  gable(P.px, u0, v0, h, lu, lv, ridge, alongU, m.roof === 'thatch' ? 2 : 1.5, P.roof(m.roof, seed), P.wall(m.wall, 99, holes.filter((o) => o.kind === 'rose' || o.kind === 'window'), seed + 1));
  if (tier >= 4) {
    // Gilt ridge finials.
    if (alongU) {
      P.px.point(v3(u0, v0 + lv / 2, h + ridge + 1), st.gold);
      P.px.point(v3(u0 + lu, v0 + lv / 2, h + ridge + 1), st.gold);
    } else {
      P.px.point(v3(u0 + lu / 2, v0, h + ridge + 1), st.gold);
      P.px.point(v3(u0 + lu / 2, v0 + lv, h + ridge + 1), st.gold);
    }
  }
}

/** Windows spaced along a face. */
export function row(face: Facing, from: number, len: number, n: number, t: number, w: number, h: number, kind: Hole['kind'] = 'window'): Hole[] {
  const out: Hole[] = [];
  for (let i = 0; i < n; i++) out.push({ face, s: Math.round(from + ((i + 0.5) * len) / n - w / 2), t, w, h, kind });
  return out;
}

function tower(P: Painter, u: number, v: number, l: number, h: number, tier: number, parts: BuildingParts, roofed: 'crenel' | 'pyramid' | 'cone', seed: number, slits = true): void {
  const m = MAT[Math.max(2, tier)]!;
  const holes: Hole[] = slits ? [...row('left', 0, l, 1, h - 8, 1, 3, 'slit'), ...row('right', 0, l, 1, h - 8, 1, 3, 'slit'), ...row('left', 0, l, 1, h / 2 - 2, 1, 3, 'slit')] : [];
  const sh = P.wall(m.wall === 'timber' ? 'stone' : m.wall, h, holes, seed, tier >= 4 ? h - 3 : -1);
  box(P.px, u, v, 0, l, l, h, sh);
  if (roofed === 'crenel') P.crenels(u - 0.5, v - 0.5, h, l + 1, l + 1, sh);
  else if (roofed === 'pyramid') pyramid(P.px, u, v, h, l, l, l * 0.9, 1, P.roof(tier >= 4 ? 'slate' : 'tile', seed));
  else cone(P.px, u + l / 2, v + l / 2, h, l * 0.62, l * 1.1, 10, P.roof('slate', seed));
  void parts;
}

function keep(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier <= 1) {
    // A timber tower on a stone footing, and a hall beside it.
    box(P.px, 22, 22, 0, 16, 16, 4, P.wall('stone', 4, [], 3));
    box(P.px, 23, 23, 4, 14, 14, 22, P.wall('plank', 22, [{ face: 'left', s: 6, t: 14, w: 2, h: 3, kind: 'window' }, { face: 'right', s: 6, t: 14, w: 2, h: 3, kind: 'window' }], 3));
    // Overhanging fighting gallery.
    box(P.px, 21, 21, 26, 18, 18, 4, P.wall('plank', 4, [], 4));
    pyramid(P.px, 21, 21, 30, 18, 18, 12, 1.5, P.roof('shingle', 3));
    hall(P, 40, 18, 14, 26, 9, false, 1, [{ face: 'right', s: 10, t: 0, w: 3, h: 6, kind: 'door' }], 5);
    P.chimney(parts, 46, 24, 9, 9);
    P.pole(parts, 30, 30, 42, 9, 7, 5);
    parts.torches.push([Math.floor(sx(37, 31)), Math.floor(sy(37, 31, 12))]);
    return;
  }
  const l = tier === 2 ? 24 : tier === 3 ? 28 : 30;
  const h = tier === 2 ? 36 : tier === 3 ? 44 : 52;
  const u = 36 - l / 2;
  const holes: Hole[] = [
    ...row('left', 0, l, 2, h - 12, 2, 4), ...row('right', 0, l, 2, h - 12, 2, 4),
    ...row('left', 0, l, 3, h / 2 - 2, 1, 3, 'slit'), ...row('right', 0, l, 1, h / 2, 2, 4),
    { face: 'right', s: l / 2 - 2, t: 0, w: 4, h: 7, kind: 'door' },
  ];
  // Pilaster buttresses up the corners, as on Norman keeps.
  const sh = P.wall(tier >= 4 ? 'fine' : 'stone', h, holes, 11, tier >= 4 ? h - 6 : -1);
  box(P.px, u, u, 0, l, l, h, sh);
  for (const [bu, bv] of [[u + l - 1, u + l - 1], [u + l - 1, u + l / 2 - 1], [u + l / 2 - 1, u + l - 1]] as const) box(P.px, bu, bv, 0, 2, 2, h - 2, sh);
  P.crenels(u - 0.5, u - 0.5, h, l + 1, l + 1, sh);
  // Forebuilding: the stair up to the door.
  box(P.px, u + l, u + l / 2 - 5, 0, 6, 10, 8, P.wall('stone', 8, [{ face: 'right', s: 3, t: 0, w: 4, h: 6, kind: 'door' }], 12));
  if (tier >= 3) {
    // Corner turrets.
    for (const [tu, tv] of [[u - 2, u - 2], [u + l - 4, u - 2], [u - 2, u + l - 4], [u + l - 4, u + l - 4]] as const) {
      box(P.px, tu, tv, h - 6, 6, 6, 12, sh);
      if (tier >= 4) pyramid(P.px, tu, tv, h + 6, 6, 6, 8, 0.5, P.roof('slate', 2));
      else P.crenels(tu, tv, h + 6, 6, 6, sh);
    }
  }
  P.pole(parts, 36, 36, h, 14, tier >= 4 ? 10 : 8, tier >= 4 ? 7 : 6);
  if (tier >= 4) P.pole(parts, u + l - 1, u + l - 1, h + 14, 6, 6, 3, true);
  P.chimney(parts, u + 4, u + l - 7, h, 4);
  parts.torches.push([Math.floor(sx(u + l + 7, u + l / 2)), Math.floor(sy(u + l + 7, u + l / 2, 8))]);
  void st;
}

function chapter(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    const holes: Hole[] = [...row('left', 0, 34, 3, 5, 1, 3), { face: 'right', s: 8, t: 0, w: 4, h: 6, kind: 'door' }];
    hall(P, 90, 16, 34, 20, 11, true, 1, holes, 21);
    // A wooden bell-cote on the ridge at the west end, and the cross at the east.
    const z = 11 + 12;
    box(P.px, 117, 23, z - 2, 4, 4, 6, P.wall('plank', 6, [{ face: 'left', s: 1, t: 2, w: 2, h: 3, kind: 'arch' }, { face: 'right', s: 1, t: 2, w: 2, h: 3, kind: 'arch' }], 2));
    pyramid(P.px, 116.5, 22.5, z + 4, 5, 5, 4, 0.5, P.roof('shingle', 2));
    parts.bells.push([Math.floor(sx(119, 27)), Math.floor(sy(119, 27, z + 3))]);
    P.cross(92, 26, z - 1, st.timber[0]);
    return;
  }
  const lu = tier === 2 ? 44 : 50;
  const lv = tier === 2 ? 22 : 24;
  const u0 = tier === 4 ? 80 : 84;
  const v0 = 14;
  const h = tier === 2 ? 15 : 18;
  const holes: Hole[] = [
    ...row('left', 0, lu, tier >= 3 ? 4 : 3, 5, 2, 6),
    { face: 'right', s: lv / 2 - 2.5, t: 0, w: 5, h: 8, kind: 'door' },
    { face: 'right', s: lv / 2 - 3, t: h + 2, w: 6, h: 6, kind: 'rose' },
  ];
  hall(P, u0, v0, lu, lv, h, true, tier, holes, 23);
  const sh = P.wall(tier >= 4 ? 'fine' : 'stone', h, [], 24);
  if (tier >= 3) for (let u = u0 + 4; u < u0 + lu - 2; u += 11) box(P.px, u, v0 + lv, 0, 3, 2, h - 3, sh);
  // The belfry: a bell-gable wall over the west front (Montsaunès), or a tower.
  const ridge = Math.round(lv * 0.5);
  if (tier === 2) {
    const z = h + ridge - 2;
    box(P.px, u0 + lu - 3, v0 + lv / 2 - 6, z - 4, 3, 12, 12, P.wall('stone', 12, [
      { face: 'right', s: 2, t: 4, w: 3, h: 5, kind: 'arch' }, { face: 'right', s: 7, t: 4, w: 3, h: 5, kind: 'arch' },
    ], 25));
    parts.bells.push([Math.floor(sx(u0 + lu, v0 + lv / 2 - 2.5)), Math.floor(sy(u0 + lu, v0 + lv / 2 - 2.5, z + 4))]);
    parts.bells.push([Math.floor(sx(u0 + lu, v0 + lv / 2 + 2.5)), Math.floor(sy(u0 + lu, v0 + lv / 2 + 2.5, z + 4))]);
    P.cross(u0 + lu - 1.5, v0 + lv / 2, z + 8, st.fine[0]);
    P.cross(u0 + 1, v0 + lv / 2, h + ridge, st.fine[0]);
  } else {
    // A square bell tower at the west end.
    const tu = u0 + lu - 2;
    const tv = v0 + lv / 2 - 7;
    const th = h + 22 + (tier >= 4 ? 6 : 0);
    const tsh = P.wall(tier >= 4 ? 'fine' : 'stone', th, [
      { face: 'left', s: 4, t: th - 9, w: 4, h: 6, kind: 'arch' }, { face: 'right', s: 5, t: th - 9, w: 4, h: 6, kind: 'arch' },
      { face: 'left', s: 6, t: 4, w: 2, h: 5, kind: 'window' }, { face: 'right', s: 6, t: 0, w: 4, h: 8, kind: 'door' },
    ], 26, tier >= 4 ? th - 2 : -1);
    box(P.px, tu, tv, 0, 14, 14, th, tsh);
    pyramid(P.px, tu, tv, th, 14, 14, tier >= 4 ? 20 : 12, 1, P.roof(tier >= 4 ? 'slate' : 'tile', 3));
    P.cross(tu + 7, tv + 7, th + (tier >= 4 ? 20 : 12), tier >= 4 ? st.gold : st.fine[0]);
    parts.bells.push([Math.floor(sx(tu + 14, tv + 7)), Math.floor(sy(tu + 14, tv + 7, th - 4))]);
    if (tier >= 4) {
      // The Templars' round church: an octagonal rotunda at the east end, as at Tomar.
      const ru = u0 - 2;
      const rv = v0 + lv / 2;
      drum(P.px, ru, rv, 0, 15, h + 8, 16, P.wall('fine', h + 8, [], 27, h + 4));
      // The drum's own roof, a low lead cone, then the raised central tower and its cap.
      cone(P.px, ru, rv, h + 8, 16, 5, 16, P.roof('lead', 2));
      drum(P.px, ru, rv, h + 8, 9, 9, 12, P.wall('fine', 9, [{ face: 'left', s: 6, t: 3, w: 2, h: 4, kind: 'window' }, { face: 'right', s: 30, t: 3, w: 2, h: 4, kind: 'window' }, { face: 'left', s: 16, t: 3, w: 2, h: 4, kind: 'window' }], 28));
      cone(P.px, ru, rv, h + 17, 10.5, 12, 12, P.roof('slate', 2));
      // Buttresses round the drum.
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2 + 0.2;
        const bu = ru + Math.cos(an) * 15;
        const bv = rv + Math.sin(an) * 15;
        if (Math.cos(an) + Math.sin(an) < -0.5) continue;
        box(P.px, bu - 1, bv - 1, 0, 2.5, 2.5, h + 4, P.wall('fine', h + 4, [], 29));
      }
      P.cross(ru, rv, h + 29, st.gold);
      P.pole(parts, tu + 1, tv + 13, th, 10, 8, 6);
    }
  }
}

function barracks(P: Painter, tier: number, parts: BuildingParts): void {
  const lu = tier === 1 ? 26 : 30;
  const lv = tier === 1 ? 42 : tier === 2 ? 50 : 54;
  const u0 = 14;
  const v0 = 74;
  const h = tier === 1 ? 10 : tier === 2 ? 14 : 20;
  const holes: Hole[] = [
    ...row('right', 0, lv, tier === 1 ? 3 : 4, tier >= 3 ? 12 : 4, 2, 3),
    ...(tier >= 3 ? row('right', 0, lv, 4, 4, 2, 3) : []),
    { face: 'right', s: lv / 2 - 2, t: 0, w: 4, h: 7, kind: 'door' },
    ...row('left', 0, lu, 1, h - 7, 2, 3),
  ];
  hall(P, u0, v0, lu, lv, h, false, tier, holes, 31);
  P.chimney(parts, u0 + 6, v0 + 8, h + 4, 7);
  if (tier >= 3) {
    // A square tower at the yard end with a crenellated top.
    tower(P, u0 + lu - 6, v0 - 4, 12, h + 14, tier, parts, tier >= 4 ? 'pyramid' : 'crenel', 33);
    if (tier >= 4) P.pole(parts, u0 + lu, v0 + 2, h + 14 + 11, 8, 8, 5);
    else P.pole(parts, u0 + lu, v0 + 2, h + 17, 9, 7, 5);
  }
  if (tier >= 2) P.pole(parts, u0 + lu + 2, v0 + lv / 2 + 4, 0, 18, 6, 5);
  // Weapon racks by the door.
  const st = P.st;
  for (let i = 0; i < 4; i++) post(P.px, u0 + lu + 3, v0 + lv / 2 + 7 + i * 1.5, 0, 9, i % 2 ? st.timber[1] : hex2(st));
  line3(P.px, v3(u0 + lu + 3, v0 + lv / 2 + 6, 6), v3(u0 + lu + 3, v0 + lv / 2 + 13, 6), st.timber[2]);
  // The forge: an open lean-to at the south end with its hearth.
  const fv = v0 + lv + 1;
  box(P.px, u0 + 2, fv, 0, 16, 10, 3, P.wall('stone', 3, [], 34));
  for (const [pu, pv] of [[u0 + 2, fv + 10], [u0 + 18, fv + 10], [u0 + 18, fv]] as const) post(P.px, pu, pv, 0, 9, st.timber[1]);
  P.px.quad(v3(u0 + 1, fv - 1, 11), v3(19, 0, 0), v3(0, 13, -3), (_s, t) => P.roof(tier >= 2 ? 'tile' : 'thatch', 3)('left', _s, 13 - t, v3(0, 0, 0)));
  box(P.px, u0 + 4, fv + 2, 0, 5, 5, 5, P.wall('stone', 5, [{ face: 'right', s: 1.5, t: 1, w: 2, h: 2, kind: 'arch' }], 35));
  P.chimney(parts, u0 + 5, fv + 3, 5, 12);
  parts.forges.push([Math.floor(sx(u0 + 9, fv + 5)), Math.floor(sy(u0 + 9, fv + 5, 2))]);
  // Anvil.
  box(P.px, u0 + 12, fv + 6, 0, 2, 2, 3, P.flat(st.slate[2]));
  parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 - 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 - 4, 8))]);
}

const hex2 = (st: CityStyle) => st.slate[1];

function range(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  // The fletcher's shed at the back.
  hall(P, 180, 12, 24, 16, tier === 1 ? 8 : 10, true, tier, [
    { face: 'left', s: 4, t: 0, w: 3, h: 6, kind: 'door' }, ...row('left', 8, 16, 2, 4, 2, 2),
  ], 41);
  if (tier >= 3) {
    // A covered stand for the archers, open at the front.
    for (const v of [44, 54, 64]) post(P.px, 206, v, 0, 10, st.timber[1]);
    for (const v of [44, 54, 64]) post(P.px, 214, v, 0, 10, st.timber[2]);
    const rs = P.roof(tier >= 4 ? 'slate' : 'tile', 5);
    P.px.quad(v3(204, 42, 10), v3(12, 0, 2), v3(0, 24, 0), (s, t, p) => rs('top', t, s, p));
  }
  // Butts: a turf bank behind straw targets on trestles, facing the archers to the south-east.
  const n = Math.min(4, 1 + Math.floor(level / 4));
  const turf = hex3(st);
  box(P.px, 144, 38, 0, 4, n * 7 + 2, 5, (f, s, t) => (f === 'top' ? tone(turf, -0.1) : t > 3.5 ? (f === 'left' ? turf : tone(turf, 0.25)) : f === 'left' ? st.thatch[3] : tone(st.thatch[3], 0.25)));
  for (let i = 0; i < n; i++) {
    const cu = 152.5;
    const cv = 43 + i * 7;
    const cz = 7;
    line3(P.px, v3(cu - 0.5, cv - 2, 0), v3(cu, cv - 1, cz - 2), st.timber[1]);
    line3(P.px, v3(cu - 0.5, cv + 2, 0), v3(cu, cv + 1, cz - 2), st.timber[1]);
    line3(P.px, v3(cu - 4, cv, 0), v3(cu - 0.5, cv, cz), st.timber[2]);
    for (let dv = -3.5; dv <= 3.5; dv += 0.25)
      for (let dz = -3.5; dz <= 3.5; dz += 0.25) {
        const r = Math.hypot(dv, dz);
        if (r > 3.4) continue;
        const ring = r < 0.9 ? st.bannerCharge : r < 1.7 ? st.daub[0] : r < 2.4 ? st.bannerCharge : r < 2.9 ? st.daub[0] : st.thatch[1];
        P.px.point(v3(cu, cv + dv, cz + dz), ring);
      }
    parts.targets.push([Math.floor(sx(cu, cv)), Math.floor(sy(cu, cv, cz))]);
  }
  // The shooting mark: a line of pegs.
  for (let v = 40; v <= 66; v += 4) post(P.px, 198, v, 0, 1, st.daub[1]);
  if (tier >= 2) P.pole(parts, 204, 30, 0, 16, 6, 4, true);
  if (tier >= 4) P.pole(parts, 150, 38, 0, 18, 7, 5);
}

const hex3 = (st: CityStyle) => mix(st.thatch[2], st.slate[1], 0.1);

function granary(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    // A timber granary raised on staddle stones against rats.
    for (const [u, v] of [[166, 80], [186, 80], [166, 94], [186, 94]] as const) box(P.px, u, v, 0, 2, 2, 3, P.wall('stone', 3, [], 1));
    box(P.px, 164, 78, 3, 26, 20, 8, P.wall('plank', 8, [{ face: 'left', s: 10, t: 0, w: 4, h: 6, kind: 'door' }], 51));
    gable(P.px, 164, 78, 11, 26, 20, 11, true, 2, P.roof('thatch', 5), P.wall('plank', 99, [], 52));
  } else {
    const lu = tier === 2 ? 40 : 46;
    const lv = tier === 2 ? 24 : 26;
    const h = tier === 2 ? 12 : 14;
    const holes: Hole[] = [{ face: 'left', s: lu / 2 - 4, t: 0, w: 8, h: 10, kind: 'door' }, ...row('left', 0, lu, 4, h - 5, 1, 3, 'slit'), ...row('right', 0, lv, 1, h - 4, 1, 3, 'slit')];
    hall(P, 160, 76, lu, lv, h, true, tier, holes, 53, Math.round(lv * 0.6));
    if (tier >= 3) for (let u = 162; u < 160 + lu; u += 9) box(P.px, u, 76 + lv, 0, 3, 2, h - 2, P.wall(tier >= 4 ? 'fine' : 'stone', h, [], 54));
    if (tier >= 4) P.pole(parts, 160 + lu, 76 + lv / 2, 14 + 15, 8, 6, 4, true);
  }
  // Sacks by the door, more with the streak.
  const sacks = Math.min(8, 1 + Math.floor(level / 2));
  for (let i = 0; i < sacks; i++) {
    const u = 166 + (i % 4) * 3.4;
    const v = 104 + Math.floor(i / 4) * 2.5;
    box(P.px, u, v, Math.floor(i / 8) * 3, 3, 2, 3, (f) => (f === 'top' ? st.daub[0] : f === 'left' ? st.daub[1] : st.daub[2]));
  }
}

function stables(P: Painter, tier: number, parts: BuildingParts): void {
  const lu = tier <= 2 ? 26 : 30;
  const lv = tier === 1 ? 46 : tier === 2 ? 56 : 62;
  const u0 = 14;
  const v0 = 148;
  const h = tier >= 3 ? 14 : 10;
  const n = tier + 2;
  const holes: Hole[] = [...row('right', 0, lv, n, 0, 5, 7, 'stall'), ...row('left', 0, lu, 1, 0, 4, 7, 'door')];
  if (tier >= 3) holes.push(...row('right', 0, lv, n, 10, 2, 2));
  hall(P, u0, v0, lu, lv, h, false, tier, holes, 61);
  for (let i = 0; i < n; i++) {
    const v = v0 + ((i + 0.5) * lv) / n;
    parts.stalls.push([Math.floor(sx(u0 + lu, v)), Math.floor(sy(u0 + lu, v, 5))]);
  }
  if (tier >= 3) {
    // Hayloft dormer with its hoist.
    const z = h;
    box(P.px, u0 + lu - 6, v0 + lv / 2 - 4, z, 6, 8, 7, P.wall(tier >= 4 ? 'fine' : 'stone', 7, [{ face: 'right', s: 2, t: 1, w: 4, h: 4, kind: 'arch' }], 62));
    gable(P.px, u0 + lu - 6, v0 + lv / 2 - 4, z + 7, 6, 8, 4, true, 0.5, P.roof(MAT[tier]!.roof, 2), P.wall('stone', 99, [], 63));
  }
  if (tier >= 4) P.pole(parts, u0 + lu / 2, v0, h + 15, 9, 7, 5);
  const st = P.st;
  // Water trough.
  box(P.px, u0 + lu + 6, v0 + 4, 0, 4, 10, 3, (f, s, t) => (f === 'top' ? (s > 0.6 && s < 3.4 && t > 0.6 && t < 9.4 ? st.slate[0] : st.timber[1]) : f === 'left' ? st.timber[1] : st.timber[2]));
  // Hay.
  box(P.px, u0 + lu + 4, v0 + lv - 8, 0, 6, 6, 5, (f, s, t) => {
    const c = f === 'top' ? st.thatch[0] : f === 'left' ? st.thatch[1] : st.thatch[2];
    return hash(Math.floor(s * 2), Math.floor(t * 2)) < 0.3 ? tone(c, 0.15) : c;
  });
}

function workshop(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 172;
  const v0 = 140;
  const lu = tier === 1 ? 30 : 38;
  const lv = tier === 1 ? 26 : 32;
  const h = tier === 1 ? 10 : 13;
  // A back wall (stone from the second tier), open on the yard sides under a long roof.
  const back = P.wall(tier >= 2 ? (tier >= 4 ? 'fine' : 'stone') : 'plank', h, [], 71);
  box(P.px, u0, v0, 0, 3, lv, h, back);
  box(P.px, u0, v0, 0, lu, 3, h, back);
  for (let u = u0 + 3; u <= u0 + lu; u += lu / 3) post(P.px, u, v0 + lv, 0, h, st.timber[1], st.timber[2]);
  for (let v = v0 + 3; v <= v0 + lv; v += lv / 3) post(P.px, u0 + lu, v, 0, h, st.timber[2]);
  gable(P.px, u0 - 1, v0 - 1, h, lu + 2, lv + 2, Math.round(lu * 0.45), false, 2, P.roof(MAT[tier]!.roof, 7), (f, s, t, p) => back(f, s, t, p));
  // Timber stacks outside.
  for (let i = 0; i < 4; i++) box(P.px, u0 - 2 - (i % 2), v0 + lv + 4 + i * 0, i * 2, 22, 3, 2, P.wall('plank', 2, [], i));
  for (let i = 0; i < 3; i++) box(P.px, u0 - 2, v0 + lv + 8 + i * 0, i * 2, 18, 3, 2, P.wall('plank', 2, [], i + 5));
  // A forge corner at the back.
  P.chimney(parts, u0 + 3, v0 + 4, h + 4, 8);
  parts.forges.push([Math.floor(sx(u0 + 6, v0 + 8)), Math.floor(sy(u0 + 6, v0 + 8, 2))]);
  if (tier >= 3) {
    // A wooden crane (shear-legs) by the yard.
    const cu = u0 + lu + 6;
    const cv = v0 + lv + 4;
    line3(P.px, v3(cu - 3, cv, 0), v3(cu, cv, 22), st.timber[1]);
    line3(P.px, v3(cu + 3, cv, 0), v3(cu, cv, 22), st.timber[2]);
    line3(P.px, v3(cu, cv, 22), v3(cu, cv + 10, 18), st.timber[1]);
    line3(P.px, v3(cu, cv + 10, 18), v3(cu, cv + 10, 8), st.daub[2]);
    box(P.px, cu - 1, cv + 9, 4, 2, 2, 4, P.wall('stone', 4, [], 3));
  }
  if (tier >= 4) P.pole(parts, u0 + lu + 2, v0 + 2, 0, 20, 7, 5);
}

function hospital(P: Painter, tier: number, parts: BuildingParts): void {
  const u0 = 98;
  const v0 = 186;
  const lu = tier === 1 ? 32 : 42;
  const lv = tier === 1 ? 20 : 24;
  const h = tier === 1 ? 10 : tier === 2 ? 13 : 16;
  const holes: Hole[] = [
    ...row('left', 0, lu, tier + 1, 4, 2, 4),
    { face: 'right', s: lv / 2 - 2, t: 0, w: 4, h: 7, kind: 'door' },
    ...(tier >= 2 ? [{ face: 'right' as Facing, s: lv / 2 - 2, t: h + 2, w: 4, h: 4, kind: 'window' as const }] : []),
  ];
  hall(P, u0, v0, lu, lv, h, true, tier, holes, 81);
  P.chimney(parts, u0 + 6, v0 + 4, h + 4, 6);
  const st = P.st;
  // A painted cross over the door, the commandery's sign of care.
  const cu = u0 + lu + 0.2;
  const cv = v0 + lv / 2;
  const cz = h - 2;
  for (let k = -2; k <= 2; k++) {
    P.px.point(v3(cu, cv + k * 0.5, cz), st.bannerCharge);
    P.px.point(v3(cu, cv, cz + k * 0.7), st.bannerCharge);
  }
  if (tier >= 3) {
    // A little bell-cote for the infirmary chapel, and an apse.
    box(P.px, u0 + 4, v0 + lv / 2 - 2, h + Math.round(lv * 0.5) - 3, 4, 4, 6, P.wall('stone', 6, [{ face: 'left', s: 1, t: 2, w: 2, h: 3, kind: 'arch' }], 82));
    pyramid(P.px, u0 + 3.5, v0 + lv / 2 - 2.5, h + Math.round(lv * 0.5) + 3, 5, 5, 4, 0.5, P.roof(MAT[tier]!.roof, 1));
  }
  if (tier >= 4) P.pole(parts, u0 + lu, v0 + 2, h + 4, 10, 7, 5);
  parts.torches.push([Math.floor(sx(u0 + lu + 1, cv - 4)), Math.floor(sy(u0 + lu + 1, cv - 4, 8))]);
}

// ------------------------------------------------------------------ walls

/** Heights of the back and front walls' wall-walks at a tier (the front kept low to see over). */
export function wallHeights(tier: number): { back: number; front: number } {
  const back = [0, 10, 10, 12, 13][tier] ?? 0;
  return { back, front: Math.round(back * 0.7) };
}

/** The circuit: back walls drawn early, front walls in chunks sorted among the people. */
function walls(P: Painter, a: PaintArgs, parts: BuildingParts): BuildingParts {
  const tier = tierOf(a.level);
  const st = P.st;
  const W = WALL;
  const gate0 = GATE_V - 9;
  const gate1 = GATE_V + 9;
  if (tier === 0) {
    // Surveyors' stakes along the line of the walls-to-be.
    for (let i = 0; i <= W; i += 16) {
      post(P.px, i, 0, 0, 4, st.timber[1]);
      post(P.px, 0, i, 0, 4, st.timber[1]);
    }
    parts.arts.push(P.finish(0));
    P.reset();
    for (let i = 0; i <= W; i += 16) {
      post(P.px, W, i, 0, 4, st.timber[1]);
      post(P.px, i, W, 0, 4, st.timber[1]);
    }
    // Two posts where the gate will stand.
    post(P.px, W, gate0, 0, 7, st.timber[0]);
    post(P.px, W, gate1, 0, 7, st.timber[0]);
    parts.arts.push(P.finish(W * 2 + 40));
    return parts;
  }
  const { back: h, front } = wallHeights(tier);
  const th = 4;
  const mat = tier === 1 ? 'plank' : tier >= 4 ? 'fine' : 'stone';
  const run = (u0: number, v0: number, lu: number, lv: number, hh: number) => {
    if (lu <= 0 || lv <= 0) return;
    if (tier === 1) {
      // A palisade: sharpened logs.
      const along = lu > lv;
      const len = along ? lu : lv;
      for (let i = 0; i < len; i += 2) {
        const u = along ? u0 + i : u0 + 2;
        const v = along ? v0 + 2 : v0 + i;
        const lh = hh - 1 + (hash(i, u0 + v0) < 0.4 ? 1 : 0);
        box(P.px, u, v, 0, 2, 2, lh, (f) => (f === 'top' ? st.timber[0] : f === 'left' ? (i % 4 ? st.timber[1] : st.timber[0]) : st.timber[2]));
        P.px.point(v3(u + 1, v + 1, lh + 1), st.timber[0]);
      }
      return;
    }
    const face = P.wall(mat, hh, [], u0 + v0, tier >= 4 ? hh - 3 : -1);
    // The wall-walk: worn flags in shadow between the parapets.
    const sh: Shader = (f, s, t, p) => (f === 'top' ? tone(face('left', s, t + 1, p), Math.floor(s) % 4 === 0 ? 0.4 : 0.28) : face(f, s, t, p));
    box(P.px, u0, v0, 0, lu, lv, hh, sh);
    // A dark line along the foot, since the chunks carry no outline.
    for (let i = 0; i < Math.max(lu, lv); i++) {
      const u = lu > lv ? u0 + i : u0 + lu;
      const v = lu > lv ? v0 + lv : v0 + i;
      P.px.point(v3(u, v, 0), tone(st.stone[3], 0.4));
    }
    // Classic merlons are 2×2 units: plain ashlar (coursing at that size is only speckle).
    P.crenels(u0, v0, hh, lu, lv, P.k > 1 ? sh : (f) => P.rampAt(mat === 'fine' ? st.fine : st.stone, f));
  };
  const towerAt = (u: number, v: number, hh: number) => {
    if (tier === 1) {
      // A timber tower on stilts.
      for (const [du, dv] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) post(P.px, u + du, v + dv, 0, hh + 6, st.timber[1], st.timber[2]);
      box(P.px, u - 1, v - 1, hh + 4, 10, 10, 6, P.wall('plank', 6, [], 5));
      pyramid(P.px, u - 1, v - 1, hh + 10, 10, 10, 7, 1, P.roof('shingle', 1));
      return;
    }
    const l = tier >= 3 ? 14 : 12;
    tower(P, u - l / 2 + 4, v - l / 2 + 4, l, hh + (tier >= 3 ? 10 : 6), tier, parts, tier >= 4 ? 'cone' : 'crenel', u * 7 + v);
  };
  // Back: the north-east (v = 0) and north-west (u = 0) walls and the far towers.
  if (tier >= 3) towerAt(-4, -4, h);
  run(0, 0, W, th, h);
  run(0, 0, th, W, h);
  if (tier >= 3) {
    towerAt(W - 4, -4, h);
    towerAt(-4, W - 4, h);
  }
  if (tier >= 4) {
    P.pole(parts, 4, 4, h + 10 + 3, 10, 8, 6);
  }
  // Like the front chunks, the plain back walls carry no outline (their foot has its dark line):
  // outlined, the merlon teeth broke the 2:1 top edge into 1- and 3-pixel runs. Towers (tier 3+)
  // keep theirs.
  parts.arts.push(P.finish(-10, tier >= 3));
  // Front walls in chunks so people inside and outside sort against them.
  const chunk = 29;
  // South-east wall (u = W - th .. W), with the gate.
  for (let v = 0; v < W; v += chunk) {
    P.reset();
    const v1 = Math.min(W, v + chunk);
    const a0 = Math.max(v, th);
    // Leave the gate opening.
    if (v1 > gate0 && v < gate1) {
      run(W - th, a0, th, gate0 - a0, front);
      run(W - th, gate1, th, v1 - gate1, front);
    } else run(W - th, a0, th, v1 - a0, front);
    parts.arts.push(P.finish(W + (v + v1) / 2 - 2, false));
  }
  for (let u = 0; u < W - th; u += chunk) {
    P.reset();
    const u1 = Math.min(W - th, u + chunk);
    run(Math.max(u, th), W - th, u1 - Math.max(u, th), th, front);
    parts.arts.push(P.finish(W + (u + u1) / 2 - 2, false));
  }
  // Gatehouse: two towers flanking the gate (the gate leaves are drawn live), and the south tower.
  P.reset();
  const gh = front + (tier >= 3 ? 12 : tier === 2 ? 8 : 6);
  if (tier === 1) {
    for (const v of [gate0 - 6, gate1 + 1]) {
      for (const [du, dv] of [[0, 0], [5, 0], [0, 5], [5, 5]] as const) post(P.px, W - 5 + du, v + dv, 0, gh, st.timber[1], st.timber[2]);
      box(P.px, W - 6, v - 1, gh - 4, 7, 7, 5, P.wall('plank', 5, [], v));
      pyramid(P.px, W - 6, v - 1, gh + 1, 7, 7, 5, 1, P.roof('shingle', v));
    }
    // A walkway over the gate.
    box(P.px, W - 5, gate0 - 1, gh - 4, 5, gate1 - gate0 + 2, 2, P.wall('plank', 2, [], 7));
  } else {
    const gsh = P.wall(mat, gh, [{ face: 'right', s: 3, t: gh - 7, w: 2, h: 3, kind: 'window' }], 77, tier >= 4 ? gh - 3 : -1);
    for (const v of [gate0 - 9, gate1]) {
      box(P.px, W - 8, v, 0, 11, 9, gh, gsh);
      if (tier >= 4) pyramid(P.px, W - 8, v, gh, 11, 9, 9, 1, P.roof('slate', v));
      else P.crenels(W - 8, v, gh, 11, 9, gsh);
    }
    // The arch over the gate.
    box(P.px, W - 8, gate0, gh - 6, 11, gate1 - gate0, 6, P.wall(mat, 6, [], 78));
    P.crenels(W - 8, gate0, gh, 11, gate1 - gate0, gsh);
  }
  parts.torches.push([Math.floor(sx(W + 3, gate0 - 1)), Math.floor(sy(W + 3, gate0 - 1, 9))]);
  parts.torches.push([Math.floor(sx(W + 3, gate1 + 1)), Math.floor(sy(W + 3, gate1 + 1, 9))]);
  if (tier >= 2) {
    P.pole(parts, W - 2, gate0 - 4, gh + (tier >= 4 ? 9 : 3), 10, 8, 6);
    P.pole(parts, W - 2, gate1 + 4, gh + (tier >= 4 ? 9 : 3), 10, 8, 6);
  }
  parts.arts.push(P.finish(W + GATE_V + 6));
  if (tier >= 3) {
    P.reset();
    towerAt(W - 4, W - 4, front);
    parts.torches.push([Math.floor(sx(W + 6, W - 2)), Math.floor(sy(W + 6, W - 2, front + 8))]);
    parts.arts.push(P.finish(W * 2 + 4));
  }
  // Stakes before the walls against the charge (from level 3, as the game rules have it).
  if (a.level >= 3) {
    P.reset();
    for (let v = 8; v < W; v += 6) {
      if (Math.abs(v - GATE_V) < 16) continue;
      // One sharpened stake every 6 units: a 1-px shaft with a light point. (Two crossed
      // two-tone shafts per stake ran together, outlined, into a checkered band.)
      line3(P.px, v3(W + 8, v, 0), v3(W + 11, v, 4), st.timber[2]);
      P.px.point(v3(W + 11, v, 4), st.timber[0]);
    }
    for (let u = 8; u < W; u += 6) {
      line3(P.px, v3(u, W + 8, 0), v3(u, W + 11, 4), st.timber[2]);
      P.px.point(v3(u, W + 11, 4), st.timber[0]);
    }
    // Classic: no outline round 1-px stakes (outlined, a 1-px diagonal turns into a checkerboard).
    parts.arts.push(P.finish(W * 2 + 30, P.k > 1));
  }
  void OX;
  return parts;
}

// ------------------------------------------------------------------ the windmill

/** The mill outside the walls, its body only (sails turn live). Returns the hub. */
export function paintMill(st: CityStyle, level: number, frame: Frame = CLASSIC): { art: Art; hub: [number, number] | null } {
  const P = painterFor(st, frame);
  const own = frame.k > 1 ? MILLS[st.id] : undefined;
  if (own) {
    P.reset();
    const hub = own(P, level);
    return { art: P.finish(116 - 46), hub };
  }
  P.reset();
  const u = 116;
  const v = -46;
  const tier = tierOf(level);
  let hub: V3;
  if (tier >= 3) {
    // A stone tower mill with a thatched cap.
    drum(P.px, u, v, 0, 7, 22, 12, P.wall(tier >= 4 ? 'fine' : 'stone', 22, [], 91));
    cone(P.px, u, v, 22, 8, 7, 12, P.roof('thatch', 3));
    hub = v3(u + 6, v + 6, 22);
  } else {
    // A post mill: a timber body on a trestle.
    line3(P.px, v3(u - 5, v, 0), v3(u, v, 8), st.timber[2]);
    line3(P.px, v3(u + 5, v, 0), v3(u, v, 8), st.timber[1]);
    line3(P.px, v3(u, v + 5, 0), v3(u, v, 8), st.timber[1]);
    post(P.px, u, v, 0, 10, st.timber[2]);
    box(P.px, u - 5, v - 4, 10, 10, 8, 12, P.wall('plank', 12, [{ face: 'left', s: 4, t: 2, w: 2, h: 3, kind: 'window' }], 92));
    gable(P.px, u - 5, v - 4, 22, 10, 8, 4, true, 0.5, P.roof('shingle', 1), P.wall('plank', 99, [], 93));
    hub = v3(u + 6, v + 3, 18);
  }
  const art = P.finish(u + v);
  return { art, hub: [Math.floor(sx(hub.u, hub.v)), Math.floor(sy(hub.u, hub.v, hub.z))] };
}
