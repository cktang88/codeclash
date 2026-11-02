// The commandery's HD materials and dressings (docs/art-references/city-detail.md): what turns the
// Templar HD boxes into a lived-in town after the user's targets. Walls of half-timbering with
// braces and plaster infill (chipped here and there to the brick), rubble and coursed stone with
// bevelled blocks and mortar, roofs of individual tiles with broken eaves and moss; windows with
// mullions, leading, shutters and sills; plank doors with straps under voussoir arches; lancets
// and a traceried rose for the church. Then the dressings a hall gets: a jettied upper storey,
// dormers, a balcony, window boxes, ivy, a sooty chimney, a lantern and a sign by the door.
//
// Only the HD Templar painter uses these (Painter.rich); classic and the other factions' kits keep
// their own shaders, so classic stays pixel-identical.

import type { Hole, Painter } from './buildings.ts';
import { box, gable, hash, hex, line3, mix, post, tone, v3, type Col, type Facing, type Shader, type V3 } from './pixels.ts';
import { ivy, lantern, wallSign, windowBox } from './prop-art.ts';
import type { Ramp } from './style.ts';

const BRICK: Ramp = [hex('#c0704c'), hex('#a0523a'), hex('#7a3c2e'), hex('#4e2620')];
const MOSS: Ramp = [hex('#9aa650'), hex('#74843e'), hex('#55642f'), hex('#364322')];
const SUN = hex('#ffe6a8');
/** Shutter paints: oxblood, a green, a faded blue, or bare oak. */
const SHUTTERS = [hex('#8a3a2c'), hex('#4f6a48'), hex('#4e5f7c'), hex('#6e4a2c')];

type Mat = 'stone' | 'fine' | 'timber' | 'plank';

/** Low-frequency dapple: warm patches of sun on the lit face (as through leaves or broken cloud). */
function dapple(p: V3, seed: number): number {
  const a = hash(Math.floor(p.u / 7), Math.floor(p.z / 5), seed + 300);
  const b = hash(Math.floor((p.u + 3) / 5), Math.floor((p.z + 2) / 4), seed + 301);
  return a < 0.28 && b < 0.6 ? 1 : 0;
}

/** Is (ls, lt) inside an opening of w × h, with a round arch (w ≥ 3) or a pointed lancet head? */
function inside(ls: number, lt: number, w: number, h: number, head: 'flat' | 'round' | 'lancet'): boolean {
  if (ls < 0 || ls >= w || lt < 0 || lt >= h) return false;
  if (head === 'round') {
    const r = w / 2;
    return lt <= h - r || Math.hypot(ls - r, lt - (h - r)) <= r;
  }
  if (head === 'lancet') {
    const top = h - w * 0.9;
    return lt <= top || Math.abs(ls - w / 2) <= (h - lt) * 0.55;
  }
  return true;
}

/**
 * Coursed stone at buffer pixel (sq, tq) on a face: courses of 2-3 art units (or regular for
 * ashlar), blocks of varied widths, each block one tone with a lit top edge and a shaded lower
 * right, mortar a darker line. Returns [colour, isMortar].
 */
function stoneAt(r: Ramp, f: Facing, sq: number, tq: number, q: number, seed: number, mortar: Col, fine: boolean): [Col, boolean] {
  const base = r[f === 'left' ? 1 : 2]!;
  // Courses: bands of 5 art units split into two courses (2+3 or 3+2); ashlar: 4 each.
  let row: number;
  let y: number;
  let ch: number;
  if (fine) {
    ch = 4 * q;
    row = Math.floor(tq / ch);
    y = tq - row * ch;
  } else {
    const band = Math.floor(tq / (5 * q));
    const split = (hash(band, seed, 11) < 0.5 ? 2 : 3) * q;
    const by = tq - band * 5 * q;
    if (by < split) {
      row = band * 2;
      y = by;
      ch = split;
    } else {
      row = band * 2 + 1;
      y = by - split;
      ch = 5 * q - split;
    }
  }
  // Blocks: joints on a 2-unit cell grid, merged by hash (rubble) or every 4 cells (ashlar).
  const cw = 2 * q;
  const off = Math.floor(hash(row, seed, 12) * 4) * q;
  const x = sq + off;
  const cell = Math.floor(x / cw);
  const joint = (c: number) => (fine ? c % 4 === 0 : hash(c, row, seed + 13) < 0.45 || c % 4 === 0);
  let c0 = cell;
  while (!joint(c0) && c0 > cell - 4) c0--;
  let c1 = cell + 1;
  while (!joint(c1) && c1 < cell + 5) c1++;
  const bx = x - c0 * cw;
  const bw = (c1 - c0) * cw;
  if (y === 0 || bx === 0) return [mix(base, mortar, f === 'left' ? 0.6 : 0.42), true];
  const n = hash(c0, row, seed + 14);
  let c = n < 0.2 ? tone(base, 0.12) : n < 0.36 ? tone(base, -0.08) : n < 0.48 ? mix(base, hex('#b08a64'), 0.22) : n < 0.56 ? mix(base, hex('#8a90a0'), 0.2) : base;
  // Bevel: the block's top edge catches the sun, its lower right turns away.
  if (y === ch - 1 && f === 'left') c = tone(c, -0.1);
  else if (bx === bw - 1 || y === 1) c = tone(c, 0.1);
  // The odd weathered pit.
  if (!fine && n > 0.9 && bx === Math.floor(bw / 2) && y === Math.floor(ch / 2)) c = tone(c, 0.2);
  return [c, false];
}

/** Brick showing where the plaster has fallen: courses of 2 px, bricks 4 px, mortar in daub. */
function brickAt(sq: number, tq: number, f: Facing, joint: Col): Col {
  const row = tq >> 1;
  if ((tq & 1) === 0) return joint;
  if ((sq + (row & 1) * 2) % 4 === 0) return joint;
  return BRICK[f === 'left' ? 1 : 2]!;
}

/** The HD Templar wall shader (see Painter.wall). */
export function richWall(P: Painter, mat: Mat, h: number, holes: Hole[], seed: number, gold: number, base: Shader): Shader {
  const st = P.st;
  const q = P.k;
  const shutter = SHUTTERS[Math.floor(hash(seed, 5, 17) * SHUTTERS.length)]!;
  const stoneWall = mat === 'stone' || mat === 'fine';
  return (f, s, t, p) => {
    if (f === 'top' || mat === 'plank') return base(f, s, t, p);
    const sq = Math.floor(s * q);
    const tq = Math.floor(t * q);
    const lit = f === 'left';
    for (const o of holes) {
      if (o.face !== f) continue;
      if (o.kind === 'stall' || o.kind === 'slit') {
        if (s >= o.s - 1 && s < o.s + o.w + 1 && t >= o.t - 1 && t < o.t + o.h + 1) return base(f, s, t, p);
        continue;
      }
      if (o.kind === 'rose') {
        const cs = o.s + o.w / 2;
        const ct = o.t + o.h / 2;
        const R = o.w / 2;
        const dx = s - cs;
        const dz = t - ct;
        const r = Math.hypot(dx, dz);
        if (r >= R + 0.6) continue;
        const ang = Math.atan2(dz, dx);
        // A moulded ring of voussoirs, eight spokes and an inner ring of tracery, then glass.
        if (r >= R - 0.5) return Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 16) % 2 ? P.rampAt(st.fine, f) : P.rampAt(st.fine, f, 1);
        const sector = ((ang + Math.PI) / (Math.PI / 4)) % 1;
        if (Math.abs(r - R * 0.42) < 0.35 || r < 0.5 || sector < 0.16 || sector > 0.92) return P.rampAt(st.fine, f, 1);
        // Glass, with the coloured panes the night lights as well.
        const pane = Math.floor((ang + Math.PI) / (Math.PI / 4));
        return P.glassAt(p, r > R * 0.42 && pane % 2 ? P.glassRed : st.glass);
      }
      const ls = s - o.s;
      const lt = t - o.t;
      if (ls < -2.5 || ls > o.w + 2.5 || lt < -1.2 || lt > o.h + 1.5) continue;
      const head: 'flat' | 'round' | 'lancet' = !stoneWall ? 'flat' : o.w >= 3 ? 'round' : o.h >= 4 ? 'lancet' : 'flat';
      const inOpening = inside(ls, lt, o.w, o.h, head);
      const ring = !inOpening && inside(ls + 0.6, lt + 0.01, o.w + 1.2, o.h + 0.6, head);
      if (o.kind === 'door') {
        if (inOpening) {
          // Planks two art pixels wide, two iron straps with hinge ends and studs, a ring.
          const x = Math.floor(ls * q);
          const y = Math.floor(lt * q);
          const H = Math.floor(o.h * q);
          if (y === 4 || y === H - 6) return x % 3 === 0 ? tone(st.slate[1], -0.15) : st.outline;
          if ((y === 3 || y === H - 5) && x % 3 === 0) return st.slate[1];
          if (x === Math.floor(o.w * q * 0.7) && y === Math.floor(H * 0.45)) return st.gold;
          const pl = x % 2 === 0 ? (x % 4 === 0 ? st.timber[2] : st.timber[1]) : st.timber[3];
          return lit ? pl : tone(pl, 0.1);
        }
        if (ring) {
          if (stoneWall) {
            // Voussoirs round the arch, dressed jambs; a carved order (chevrons) on big portals.
            const big = o.w >= 4 && mat === 'fine';
            const ang = Math.atan2(lt - (o.h - o.w / 2), ls - o.w / 2);
            const k = lt > o.h - o.w / 2 ? Math.floor((ang / Math.PI) * 7) : Math.floor(lt * q / 3);
            if (big && (sq + tq) % 4 < 2) return P.rampAt(st.fine, f, 1);
            return k % 2 ? P.rampAt(st.fine, f) : tone(P.rampAt(st.fine, f), 0.08);
          }
          return lt >= o.h ? st.timber[0] : P.rampAt(st.timber, f);
        }
        continue;
      }
      if (o.kind === 'arch') {
        if (inOpening) return st.glass;
        if (ring) return Math.floor((sq + tq) / 3) % 2 ? P.rampAt(st.fine, f) : P.rampAt(st.fine, f, 1);
        continue;
      }
      // Windows.
      const church = mat === 'fine' && o.h >= 5;
      if (inOpening) {
        const x = Math.floor(ls * q);
        const y = Math.floor(lt * q);
        const W = Math.floor(o.w * q);
        const H = Math.floor(o.h * q);
        const frame = stoneWall ? P.rampAt(st.fine, f, 1) : P.rampAt(st.timber, f, 1);
        if (o.w >= 3 && x === Math.floor(W / 2)) return frame;
        if (o.h >= 3 && y === Math.floor(H * 0.55)) return frame;
        // Leading: diamond quarries in cottage glass, upright panels in the church.
        const lead = church ? x % 3 === 1 && y % 4 === 0 : (x + y) % 4 === 0 || (x - y + 64) % 4 === 0;
        if (lead) return tone(st.glass, -0.16);
        return P.glassAt(p, st.glass);
      }
      if (ring) return stoneWall ? (lt > o.h - 0.6 && head !== 'flat' ? P.rampAt(st.fine, f) : P.rampAt(st.fine, f, lit ? 0 : 0)) : lt >= o.h ? st.timber[0] : P.rampAt(st.timber, f);
      // The sill: lit on top, a shadow line beneath.
      if (ls >= -0.6 && ls < o.w + 0.6 && lt < 0 && lt >= -0.6) return stoneWall ? P.rampAt(st.fine, f) : st.timber[0];
      if (ls >= -0.6 && ls < o.w + 0.6 && lt < -0.6 && lt >= -1.1) {
        // fall through to the wall below, darkened.
        const below = material(P, mat, h, f, s, t, p, seed, gold, sq, tq);
        return tone(below, 0.28);
      }
      // Shutters, folded back either side of small windows.
      if (!church && o.h <= 4.5 && lt >= 0 && lt < o.h) {
        const sw = Math.max(1, o.w / 2);
        const left = ls < -0.25 && ls >= -0.25 - sw;
        const right = ls >= o.w + 0.25 && ls < o.w + 0.25 + sw;
        if (left || right) {
          const a = left ? ls + 0.25 + sw : ls - o.w - 0.25;
          const ax = Math.floor(a * q);
          const ay = Math.floor(lt * q);
          let c = shutter;
          if (ax % 2 === 1) c = tone(c, 0.18);
          // The Z brace: two ledges and a diagonal.
          if (ay === 1 || ay === Math.floor(o.h * q) - 2 || Math.abs(ax - (ay * sw * q) / (o.h * q)) < 0.6) c = tone(c, -0.12);
          return lit ? c : tone(c, 0.2);
        }
      }
    }
    return material(P, mat, h, f, s, t, p, seed, gold, sq, tq, holes);
  };
}

/** The wall's own material at a point (no openings). */
function material(P: Painter, mat: Mat, h: number, f: Facing, s: number, t: number, p: V3, seed: number, gold: number, sq: number, tq: number, holes: Hole[] = []): Col {
  const st = P.st;
  const q = P.k;
  const lit = f === 'left';
  let c: Col;
  if (mat === 'timber') {
    const plinth = t < 2;
    if (plinth) c = stoneAt(st.stone, f, sq, tq, q, seed + 40, st.mortar, false)[0];
    else {
      const half = Math.max(3, Math.floor(h / 2));
      const pw = 4;
      const panel = Math.floor(s / pw);
      const ps = s - panel * pw;
      const lower = t < half;
      const r0 = lower ? 2 : half;
      const r1 = lower ? half : h - 1;
      const pt = (t - r0) / Math.max(1, r1 - r0);
      const post = ps < 1 / q * 2 - 0.01;
      const sill = t < 2.5;
      const rail = Math.abs(t - half) < 0.5;
      const plate = t >= h - 1;
      const kind = hash(panel, lower ? 1 : 2, seed + 20);
      const a = (ps - 1) / (pw - 1);
      const thick = 0.42 / (pw - 1);
      const brace = kind < 0.3 ? Math.abs(a - pt) < thick : kind < 0.6 ? Math.abs(a - (1 - pt)) < thick : kind < 0.72 && lower ? Math.abs(a - pt) < thick || Math.abs(a - (1 - pt)) < thick : false;
      if (post || sill || rail || plate || brace) {
        c = P.rampAt(st.timber, f);
        // A lit top edge on horizontal timbers, a dark lower edge (weight, shadow).
        if ((sill || rail || plate) && !post) {
          const top = sill ? 2.5 : rail ? half + 0.5 : h;
          if (top - t <= 1 / q + 0.01 && lit) c = st.timber[0];
          else if (t - (top - 1) <= 1 / q + 0.01 && !sill) c = st.timber[3];
        }
      } else {
        c = P.rampAt(st.daub, f);
        const pn = hash(panel, lower ? 3 : 4, seed + 21);
        if (pn < 0.3) c = tone(c, 0.05);
        else if (pn > 0.85) c = mix(c, hex('#e8d2a8'), 0.25);
        // Plaster fallen away to the brick in a few panels.
        if (pn > 0.55 && pn < 0.72) {
          const cu = 1.4 + hash(panel, 5, seed) * (pw - 3.2);
          const cv = r0 + 0.8 + hash(panel, 6, seed) * Math.max(0.2, r1 - r0 - 2.6);
          const du = s - panel * pw - cu;
          const dv = t - cv;
          const e = (du / 1.2) ** 2 + (dv / 0.8) ** 2;
          if (e < 1) c = brickAt(sq, tq, f, P.rampAt(st.daub, f, 1));
          else if (e < 1.5 && dv > 0) c = tone(c, 0.14);
        }
        // Hairline cracks: a short dash in some panels.
        if (pn < 0.12 && Math.floor(t * q) === Math.floor((r0 + 1.5) * q) && ps > 1.4 && ps < 2.6) c = tone(c, 0.16);
      }
    }
  } else {
    const fine = mat === 'fine';
    c = stoneAt(fine ? st.fine : st.stone, f, sq, tq, q, seed, st.mortar, fine)[0];
    // Moss and damp at the foot, in clusters.
    if (t < 1.5 && hash(sq >> 2, tq >> 1, seed + 30) < 0.4 - t * 0.2) c = mix(c, MOSS[lit ? 1 : 2]!, 0.55);
  }
  if (gold >= 0 && Math.floor(t) === gold) c = lit ? st.gold : tone(st.gold, 0.25);
  // Rain streaks below window sills, and from the eaves down.
  for (const o of holes) {
    if (o.face !== f || o.kind !== 'window') continue;
    if (s >= o.s && s < o.s + o.w && t < o.t - 1 && t > o.t - 1 - 3 * hash(sq >> 1, seed, 31) && hash(sq >> 1, o.t, 32) < 0.5) c = tone(c, 0.07);
  }
  if (t > h - 4 && hash(sq >> 1, seed, 33) < 0.18 && t > h - 1.5 - 3 * hash(sq >> 1, seed, 34)) c = tone(c, 0.08);
  // Grime at the foot; the eaves' shadow, ragged where the tiles overhang unevenly.
  if (t < 1.5 && p.z < 3) c = tone(c, 0.12);
  if (t > h - 1.2 - hash(sq >> 2, seed, 35) * 0.8) c = tone(c, 0.3);
  // Dappled sun on the lit face.
  else if (lit && dapple(p, seed)) c = mix(c, SUN, 0.14);
  return c;
}

/** The HD Templar roof shader: single tiles, slates or shingles, with broken eaves and moss. */
export function richRoof(P: Painter, mat: 'shingle' | 'tile' | 'slate', seed: number): Shader {
  const st = P.st;
  const q = P.k;
  const r = mat === 'shingle' ? st.shingle : mat === 'tile' ? st.tile : st.slate;
  const tileW = mat === 'slate' ? 2.5 : 2;
  const rowQ = 3;
  return (f, s, t) => {
    const lit = f === 'left';
    let c = f === 'left' ? r[0] : f === 'right' ? r[2] : r[1];
    const tq = Math.floor(t * q);
    const row = Math.floor(tq / rowQ);
    const ry = tq - row * rowQ;
    const W = Math.round(tileW * q);
    const sq = Math.floor(s * q) + (row & 1) * Math.floor(W / 2);
    const tile = Math.floor(sq / W);
    const tx = sq - tile * W;
    const n = hash(tile, row, seed + 50);
    // The ragged eave: the odd tile short or missing at the very edge.
    if (row === 0 && hash(tile, 7, seed) < 0.28 && ry === 0) return 0;
    // A slipped or missing tile shows the dark battens beneath.
    if (n < 0.018 && row > 1) return ry === 1 ? mix(st.timber[2], r[3], 0.4) : mix(st.timber[3], r[3], 0.5);
    if (n < 0.16) c = tone(c, 0.07);
    else if (n > 0.86) c = tone(c, -0.06);
    else if (n > 0.42 && n < 0.5) c = mix(c, mat === 'slate' ? hex('#8a7a90') : hex('#d88a52'), 0.14);
    // Each course's tiles throw a shadow on the course below; the lower lip catches the light.
    if (ry === rowQ - 1) c = tone(c, 0.24);
    else if (ry === 0 && lit) c = tone(c, -0.09);
    // Joints, and the curve of a clay tile: a lit crown, a shaded side.
    if (tx === 0) c = tone(c, 0.16);
    else if (mat === 'tile' && tx === 1 && lit) c = tone(c, -0.06);
    else if (mat === 'tile' && tx === W - 1) c = tone(c, 0.07);
    // Moss in tile-sized clumps, thicker low on the roof and on the slope away from the sun.
    const m = hash(Math.floor(s / 3.2), Math.floor(t / 2.2), seed + 51);
    const mossy = m < (f === 'left' ? 0.08 : 0.15) + (t < 3 ? 0.1 : 0) && hash(tile, row, seed + 52) < 0.7;
    if (mossy && ry !== rowQ - 1) c = mix(c, MOSS[lit ? 0 : 2]!, 0.55);
    // The eave line in shadow.
    if (t < 0.5) c = tone(c, 0.4);
    return c;
  };
}

/** Thatch (HD Templar): the base straw with moss clumps and a ragged eave. */
export function richThatch(P: Painter, base: Shader, seed: number): Shader {
  const q = P.k;
  return (f, s, t, p) => {
    if (t < 0.6 && hash(Math.floor((s * q) / 2), 9, seed) < 0.35 && t < 0.3) return 0;
    let c = base(f, s, t, p);
    if (!c) return c;
    if (hash(Math.floor(s / 3), Math.floor(t / 2), seed + 60) < 0.1 && t > 1) c = mix(c, MOSS[f === 'left' ? 1 : 2]!, 0.45);
    return c;
  };
}

// ------------------------------------------------------------------ dressings

/** Free stretches of a face, between its openings: [from, to] along s. */
function freeRuns(holes: Hole[], face: Facing, len: number): [number, number][] {
  const taken = holes.filter((o) => o.face === face).map((o) => [o.s - 2.6, o.s + o.w + 2.6] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = 1;
  for (const [a, b] of taken) {
    if (a - at >= 3.5) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (len - 1 - at >= 3.5) out.push([at, len - 1]);
  return out;
}

export interface HallDress {
  u0: number;
  v0: number;
  lu: number;
  lv: number;
  /** Height of the eaves, and of the jetty (0: none). */
  h: number;
  jetty: number;
  alongU: boolean;
  tier: number;
  holes: Hole[];
  seed: number;
  ridge: number;
  roof: 'thatch' | 'shingle' | 'tile' | 'slate';
  wall: Mat;
}

/** The dressings on an HD Templar hall: window boxes, ivy, dormers, a balcony, lanterns, a sign. */
export function dressHall(P: Painter, d: HallDress): void {
  const st = P.st;
  const px = P.px;
  const { u0, v0, lu, lv, h, jetty, seed } = d;
  const lights: V3[] = [];
  // Where a face's plane is for a hole at height t (the jettied upper storey stands out by one).
  const plane = (face: Facing, t: number) => (jetty && t >= jetty ? 1 : 0) + (face === 'left' ? v0 + lv : u0 + lu);
  // Window boxes under some windows.
  d.holes.forEach((o, i) => {
    if (o.kind !== 'window' || (o.face !== 'left' && o.face !== 'right') || o.h > 4.5 || o.w > 3) return;
    if (hash(i, seed, 70) > 0.6) return;
    const at = plane(o.face, o.t);
    if (o.face === 'left') windowBox(px, st, 'left', u0 + o.s - 0.3, at, o.t - 0.2, o.w + 0.6, seed + i);
    else windowBox(px, st, 'right', at, v0 + o.s - 0.3, o.t - 0.2, o.w + 0.6, seed + i);
  });
  // A lantern beside each door, and a sign over one of them.
  d.holes.forEach((o, i) => {
    if (o.kind !== 'door' || (o.face !== 'left' && o.face !== 'right')) return;
    const at = plane(o.face, 0);
    const side = o.s + o.w + 0.9;
    if (o.face === 'left') {
      line3(px, v3(u0 + side, at, 5.4), v3(u0 + side, at + 1.2, 5.4), st.outline);
      lantern(px, lights, u0 + side, at + 1.6, 3.4);
    } else {
      line3(px, v3(at, v0 + side, 5.4), v3(at + 1.2, v0 + side, 5.4), st.outline);
      lantern(px, lights, at + 1.6, v0 + side, 3.4);
    }
    if (hash(i, seed, 71) < 0.6) {
      const sg = o.s - 1.2;
      if (o.face === 'left') wallSign(px, st, 'left', u0 + sg, at, o.h + 2.5, Math.floor(hash(seed, 72) * 4));
      else wallSign(px, st, 'right', at, v0 + sg, o.h + 2.5, Math.floor(hash(seed, 72) * 4));
    }
  });
  P.lamps.push(...lights);
  // Ivy curtains on the free stretches of the lit and right faces, more on old stone.
  for (const face of ['left', 'right'] as const) {
    const len = face === 'left' ? lu : lv;
    const runs = freeRuns(d.holes, face, len);
    runs.forEach(([a, b], i) => {
      const chance = d.wall === 'timber' ? 0.3 : 0.62;
      if (hash(i, seed + (face === 'left' ? 1 : 2), 73) > chance) return;
      const w = Math.min(b - a, 4 + hash(i, seed, 74) * 6);
      const s0 = a + (b - a - w) * hash(i, seed, 75);
      const at = plane(face, h - 1);
      const drop = (h - 1) * (0.45 + 0.5 * hash(i, seed, 76));
      const flowers = hash(i, seed, 77) < 0.35 ? [hex('#f2ecd8')] : [];
      if (face === 'left') ivy(px, 'left', u0 + s0, at, w, h - 0.6, drop, seed + i * 7, undefined, flowers);
      else ivy(px, 'right', at, v0 + s0, w, h - 0.6, drop, seed + i * 7, undefined, flowers);
    });
  }
  // Dormers on the visible slope of long roofs (a gabled box with a window), from the stone tier.
  const long = d.alongU ? lu : lv;
  if (d.tier >= 1 && long >= 26 && d.roof !== 'thatch') {
    const n = long >= 40 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const at = Math.round(((i + 0.5) / n) * long - 2.5 + (hash(i, seed, 78) - 0.5) * 4);
      const dh = 5.5;
      const sh = P.wall(d.wall === 'timber' ? 'timber' : d.wall, 99, [], seed + 9);
      const dwin: Shader = (f, s, t, p) => {
        if (f === 'left' || f === 'right') {
          if (s > 1.4 && s < 4.6 && t > 1 && t < 4.4) {
            const x = Math.floor((s - 1.4) * P.k);
            return x === 3 || Math.floor((t - 1) * P.k) === 3 ? P.rampAt(st.timber, f) : P.glassAt(p, st.glass);
          }
          if (s > 0.9 && s < 5.1 && t > 0.5 && t < 4.9) return P.rampAt(st.timber, f);
        }
        return f === 'top' ? sh(f, s, t, p) : P.rampAt(st.daub, f);
      };
      if (d.alongU) {
        // The slope facing +v: the dormer's front (its left face) stands near the eave line.
        const dv0 = v0 + lv / 2;
        const dlv = lv / 2 - 0.4;
        box(px, u0 + at, dv0, h - 0.5, 6, dlv, dh, dwin, false);
        gable(px, u0 + at, dv0, h - 0.5 + dh, 6, dlv, 3, false, 0.6, P.roof(d.roof, seed + 3 + i), dwin);
      } else {
        const du0 = u0 + lu / 2;
        const dlu = lu / 2 - 0.4;
        box(px, du0, v0 + at, h - 0.5, dlu, 6, dh, dwin, false);
        gable(px, du0, v0 + at, h - 0.5 + dh, dlu, 6, 3, true, 0.6, P.roof(d.roof, seed + 3 + i), dwin);
      }
    }
  }
  // A timber balcony on the jettied storey of long timber halls.
  if (jetty && lu >= 24 && hash(seed, 79) < 0.7) {
    const free = freeRuns(d.holes.filter((o) => o.t >= jetty), 'left', lu);
    const run = free.find(([a, b]) => b - a >= 7) ?? null;
    const bu = run ? u0 + run[0] + 0.5 : u0 + lu * 0.5;
    const bv = v0 + lv + 1;
    const z = jetty + 0.2;
    box(px, bu, bv, z, 6, 1.8, 0.5, (f) => P.rampAt(st.timber, f));
    for (let i = 0; i <= 6; i += 1) post(px, bu + i, bv + 1.7, z + 0.5, 2.2, i % 3 === 0 ? st.timber[1] : st.timber[2]);
    line3(px, v3(bu, bv + 1.7, z + 2.7), v3(bu + 6, bv + 1.7, z + 2.7), st.timber[0]);
    line3(px, v3(bu, bv + 0.2, z + 2.7), v3(bu, bv + 1.7, z + 2.7), st.timber[1]);
    // Pots on the rail.
    if (hash(seed, 80) < 0.7) windowBox(px, st, 'left', bu + 1, bv + 1.9, z + 2.9, 4, seed + 81);
    // Joist ends under it.
    for (let i = 0.5; i < 6; i += 1.5) P.px.point(v3(bu + i, bv + 1.8, z - 0.1), st.timber[3]);
  }
}

/** Joist ends under a jettied storey: a row of dark-ended beams along both visible faces. */
export function joists(P: Painter, u0: number, v0: number, lu: number, lv: number, z: number): void {
  const st = P.st;
  for (let u = u0 + 0.5; u < u0 + lu + 1; u += 1.5) {
    box(P.px, u, v0 + lv, z - 0.6, 0.8, 1, 0.6, (f) => (f === 'left' ? st.timber[3] : f === 'top' ? st.timber[0] : st.timber[2]));
  }
  for (let v = v0 + 0.5; v < v0 + lv + 1; v += 1.5) {
    box(P.px, u0 + lu, v, z - 0.6, 1, 0.8, 0.6, (f) => (f === 'right' ? st.timber[3] : f === 'top' ? st.timber[0] : st.timber[2]));
  }
}

/** A chimney stack: rubble, a cap that overhangs, soot at the top, a clay pot. */
export function richChimney(P: Painter, u: number, v: number, z: number, h: number): void {
  const st = P.st;
  const sh = richWall(P, 'stone', h, [], 9, -1, P.wall('stone', h, [], 9));
  box(P.px, u, v, z, 3, 3, h, (f, s, t, p) => {
    const c = sh(f, s, t, p);
    return f !== 'top' && t > h - 2 ? mix(c, hex('#2a2422'), 0.35 + (t - (h - 2)) * 0.2) : c;
  });
  box(P.px, u - 0.4, v - 0.4, z + h, 3.8, 3.8, 0.6, (f) => (f === 'top' ? hex('#2e2826') : P.rampAt(st.fine, f)));
  box(P.px, u + 0.9, v + 0.9, z + h + 0.6, 1.2, 1.2, 1.1, (f) => (f === 'top' ? hex('#1a1614') : f === 'left' ? hex('#a8603e') : hex('#7a4030')));
}

/** Lancet windows round a drum (the rotunda), as holes on its faces. */
export function drumLancets(perimeter: number, n: number, t: number, h: number): Hole[] {
  const out: Hole[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * (perimeter / n) - 1;
    out.push({ face: 'left', s, t, w: 2, h, kind: 'window' }, { face: 'right', s, t, w: 2, h, kind: 'window' });
  }
  return out;
}

export type { Col };
