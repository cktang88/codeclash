// The Samurai castle town (jōkamachi), HD only: each building of the commandery's plan rebuilt as
// a Sengoku-period Japanese one, on the same lots and through the same five tiers (lot → rough →
// solid → fortified → grand). References: docs/art-references/samurai-city.md.
//
//   keep      a wooden yakata with a watch-yagura → a tenshu on an ishigaki base, two, three and
//             finally five storeys (Himeji, Matsumoto), with chidori-hafu gables and gilt shachi
//   chapter   the clan shrine: a hokora and torii → honden → haiden and honden, stone lanterns,
//             a bell house → a vermilion three-storey pagoda (shrine and temple together, as then)
//   barracks  the dōjō: a thatched minka hall → a plastered hall under kawara → a nagaya wing and
//             a corner yagura; the armourer's lean-to at its foot
//   range     the kyūdōjō: the shooters' hall (shajō) and the covered sand bank (azuchi) with mato
//   granary   rice store: a takakura on stilts → white kura with namako-kabe tile-lattice walls
//   stables   the umaya: a long board-walled stable, its stalls open to the yard
//   workshop  the kaji forge: an open smithy with bellows and a smoke-gable on the ridge
//   hospital  the physician's house: a machiya with lattice front, noren and a kura behind
//   walls     a palisade on an earth bank → dobei (plastered earth wall with a tile coping) → the
//             same on ishigaki with corner yagura → taller ishigaki and a yagura-mon gate
//
// Materials: granite ishigaki; shikkui plaster lit cream and shaded lavender-grey; black-stained
// shitamiyita boards; grey kawara tiles in round-tile columns with white ridges; cypress-bark
// (hiwada) roofs for the shrine; shrine vermilion as the one accent.

import type { BuildingKey } from '../../../game/city.ts';
import { GATE_V, LOT, painterFor, registerKit, registerMill, row, tierOf, wallHeights, WALL, type BuildingParts, type Painter, type PaintArgs } from './buildings.ts';
import { box, gable, hash, hex, line3, mix, post, sx, sy, tone, v3, type Col, type Facing, type Shader, type V3 } from './pixels.ts';
import { face4, frustum, hip, tri3, type PShader } from './solids.ts';
import type { Ramp } from './style.ts';

void row;
void painterFor;

/** A window or door cut in a plaster wall, in world units along the face and up from its foot. */
interface Win {
  face: Facing;
  a: number;
  w: number;
  z: number;
  h: number;
  kind?: 'koshi' | 'door' | 'shoji' | 'slit' | 'stall' | 'namako';
}

const wrap = (sh: PShader): Shader => (f, _s, _t, p) => sh(f, p);
const lit = (r: Ramp, f: Facing, k = 0): Col => r[Math.min(3, (f === 'left' ? 0 : f === 'top' ? 1 : 2) + k)]!;

// ------------------------------------------------------------------ materials

/**
 * Plaster (shikkui) over black-stained boards: white above, boards below `boards` units, windows
 * and doors cut in. `z0` is the wall's foot; `h` its height (the top darkens under the eaves).
 */
function plaster(P: Painter, z0: number, h: number, wins: Win[] = [], boards = 0, daub = false): PShader {
  const st = P.st;
  const k = P.k;
  const wall = daub ? st.daub : st.fine;
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    const ap = Math.floor(along * k);
    for (const w of wins) {
      if (w.face !== f) continue;
      const ia = along >= w.a && along < w.a + w.w;
      const iz = zz >= w.z && zz < w.z + w.h;
      if (ia && iz) {
        if (w.kind === 'door' || w.kind === 'stall') {
          if (w.kind === 'stall' && zz < w.h * 0.45) return lit(st.timber, f, ap % 3 === 0 ? 1 : 0);
          return ap % 4 === 0 ? st.timber[3] : w.kind === 'stall' ? st.glass : lit(st.timber, f, 1);
        }
        if (w.kind === 'shoji') {
          // Paper screens: pale squares in a dark wooden grid; they glow at night.
          const zp = Math.floor(zz * k);
          if (ap % 3 === 0 || zp % 3 === 0) return st.timber[2];
          return P.glassAt(p, tone(st.fine[1], 0.05));
        }
        if (w.kind === 'namako') break;
        // Koshi windows: dark openings with vertical wooden bars.
        if (ap % 2 === 0 && w.kind !== 'slit') return lit(st.timber, f, 1);
        return P.glassAt(p, st.glass);
      }
      // A 1-pixel frame round windows (none round doors).
      if (w.kind !== 'door' && w.kind !== 'stall' && w.kind !== 'namako' && along >= w.a - 0.5 && along < w.a + w.w + 0.5 && zz >= w.z - 0.5 && zz < w.z + w.h + 0.5)
        return lit(st.timber, f, 2);
    }
    let c = lit(wall, f);
    // Namako-kabe: a lattice of dark square tiles with raised white joints, set diagonally.
    for (const w of wins)
      if (w.kind === 'namako' && w.face === f && along >= w.a && along < w.a + w.w && zz >= w.z && zz < w.z + w.h) {
        const x = along * k;
        const y = zz * k;
        const d1 = (((x + y) % 6) + 6) % 6;
        const d2 = (((x - y) % 6) + 6) % 6;
        c = d1 < 1 || d2 < 1 ? lit(st.fine, f) : lit(st.slate, f, 1);
      }
    if (boards > 0 && zz < boards) {
      // Shitamiyita: vertical black boards with a batten at the top.
      c = ap % 3 === 0 ? lit(st.timber, f, 2) : lit(st.timber, f, 1);
      if (zz > boards - 0.6) c = lit(st.timber, f, 0);
    }
    if (zz > h - 0.8) c = tone(c, 0.35);
    else if (zz > h - 1.6 && !boards) c = tone(c, 0.12);
    return c;
  };
}

/** Kawara: columns of round tiles down the slope, a white line of end-tiles at the eave. */
function kawara(P: Painter, eave: number, r?: Ramp): PShader {
  const st = P.st;
  const k = P.k;
  const ramp = r ?? st.slate;
  return (f, p) => {
    const along = f === 'left' ? p.u : f === 'right' ? p.v : p.u - p.v;
    const col = ((Math.floor(along * k) % 3) + 3) % 3;
    const base = f === 'left' ? ramp[0] : f === 'right' ? ramp[2] : ramp[1];
    let c = base;
    if (col === 2) c = tone(base, f === 'left' ? 0.32 : 0.24);
    else if (col === 0 && f === 'left') c = tone(base, -0.1);
    if (Math.floor((p.z - eave) * k) % 7 === 6) c = tone(c, 0.1);
    if (p.z - eave < 0.55) c = col === 2 ? tone(ramp[0], 0.2) : mix(st.fine[1], ramp[0], f === 'left' ? 0.2 : 0.5);
    return c;
  };
}

/** Cypress-bark or straw: fine horizontal courses, a thick clipped eave. */
function bark(P: Painter, eave: number, r: Ramp): PShader {
  const k = P.k;
  return (f, p) => {
    const base = f === 'left' ? r[0] : f === 'right' ? r[2] : r[1];
    let c = base;
    const zp = Math.floor((p.z - eave) * k);
    if (zp % 4 === 0) c = tone(c, 0.14);
    if (hash(Math.floor((f === 'left' ? p.u : p.v) * k / 2), zp >> 2, 5) < 0.12) c = tone(c, -0.08);
    if (p.z - eave < 0.7) c = tone(r[3], f === 'left' ? -0.2 : 0);
    return c;
  };
}

/** Ishigaki: big rough granite blocks in uneven courses, dark joints, a little moss. */
function ishigaki(P: Painter, seed: number): PShader {
  const st = P.st;
  const k = P.k;
  return (f, p) => {
    if (f === 'top') return tone(st.stone[1], 0.06);
    const along = f === 'left' ? p.u : p.v;
    const zp = p.z * k;
    const rowH = 5;
    const rw = Math.floor(zp / rowH);
    const off = hash(rw, seed, 1) * 9;
    const bw = 6 + Math.floor(hash(rw, seed, 2) * 5);
    const ap = along * k + off;
    const blk = Math.floor(ap / bw);
    const inRow = zp - rw * rowH;
    const inBlk = ap - blk * bw;
    let c = lit(st.stone, f);
    const n = hash(blk, rw, seed);
    if (n < 0.25) c = tone(c, 0.08);
    else if (n > 0.85) c = tone(c, -0.07);
    if (inRow < 1 || inBlk < 1) c = tone(lit(st.stone, f), f === 'left' ? 0.42 : 0.3);
    else if (f === 'left' && inRow >= rowH - 1) c = tone(c, -0.1);
    if (hash(blk, rw, seed + 9) < 0.06 && inRow < 2.5) c = mix(c, hex('#6a7444'), 0.5);
    return c;
  };
}

// ------------------------------------------------------------------ parts

/** A hipped kawara roof with a white ridge and hip lines, and gilt shachi at the ridge ends. */
function roofHip(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, shachi = false, r?: Ramp): void {
  hip(P.px, u0, v0, z, lu, lv, rh, o, kawara(P, z - o * 0.6, r), 0.6);
  const st = P.st;
  const zr = z + rh;
  const ridge = st.fine[1];
  const hipLine = tone((r ?? st.slate)[0], -0.12);
  const zl = z - o * 0.6;
  if (lu >= lv) {
    const vm = v0 + lv / 2;
    const d = lv / 2;
    line3(P.px, v3(u0 + d, vm, zr + 0.3), v3(u0 + lu - d, vm, zr + 0.3), ridge);
    line3(P.px, v3(u0 + d, vm, zr + 0.8), v3(u0 + lu - d, vm, zr + 0.8), st.fine[0]);
    line3(P.px, v3(u0 + lu + o, v0 + lv + o, zl + 0.3), v3(u0 + lu - d, vm, zr + 0.3), hipLine);
    if (shachi) for (const u of [u0 + d, u0 + lu - d]) shachiAt(P, u, vm, zr);
  } else {
    const um = u0 + lu / 2;
    const d = lu / 2;
    line3(P.px, v3(um, v0 + d, zr + 0.3), v3(um, v0 + lv - d, zr + 0.3), ridge);
    line3(P.px, v3(um, v0 + d, zr + 0.8), v3(um, v0 + lv - d, zr + 0.8), st.fine[0]);
    line3(P.px, v3(u0 + lu + o, v0 + lv + o, zl + 0.3), v3(um, v0 + lv - d, zr + 0.3), hipLine);
    if (shachi) for (const v of [v0 + d, v0 + lv - d]) shachiAt(P, um, v, zr);
  }
}

/** A gilt shachihoko: the tiger-headed carp that guards the ridge against fire. */
function shachiAt(P: Painter, u: number, v: number, z: number): void {
  const g = P.st.gold;
  const gs = tone(g, 0.35);
  const x = Math.floor(P.px.X(u, v));
  const y = Math.floor(P.px.Y(u, v, z));
  const d = u + v + z + 3;
  const pts: [number, number, Col][] = [[0, 0, gs], [0, -1, g], [1, -1, g], [0, -2, g], [1, -2, gs], [-1, -3, g], [0, -3, g], [1, -4, g], [-1, -4, gs]];
  for (const [dx, dy, c] of pts) P.px.plot(x + dx, y + dy, d, c);
}

/**
 * Irimoya: a hip roof whose upper part is a gable. The gable end faces +u (toward the viewer's
 * right) with a white triangle and a gilt fish-fin (gegyo).
 */
function irimoya(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, shachi = false, r?: Ramp, sh?: PShader): void {
  roofHip(P, u0, v0, z, lu, lv, rh * 0.62, o, false, r);
  const st = P.st;
  const zg = z + rh * 0.45;
  const alongU = lu >= lv;
  const roof = sh ?? kawara(P, zg - 1, r);
  if (alongU) {
    const lv2 = lv * 0.55;
    const vb = v0 + (lv - lv2) / 2;
    gable(P.px, u0 + lv * 0.18, vb, zg, lu - lv * 0.36, lv2, rh * 0.55, true, 0.8, wrap(roof), wrap(gableFace(P, zg)));
    if (shachi) for (const u of [u0 + lv * 0.18, u0 + lu - lv * 0.18]) shachiAt(P, u, v0 + lv / 2, zg + rh * 0.55);
  } else {
    const lu2 = lu * 0.55;
    const ub = u0 + (lu - lu2) / 2;
    gable(P.px, ub, v0 + lu * 0.18, zg, lu2, lv - lu * 0.36, rh * 0.55, false, 0.8, wrap(roof), wrap(gableFace(P, zg)));
    if (shachi) for (const v of [v0 + lu * 0.18, v0 + lv - lu * 0.18]) shachiAt(P, u0 + lu / 2, v, zg + rh * 0.55);
  }
  void st;
}

/** A gable's triangle: white plaster, a dark barge-board line and a gilt gegyo at the apex. */
function gableFace(P: Painter, z0: number): PShader {
  const st = P.st;
  return (f, p) => {
    const c = lit(st.fine, f);
    return p.z - z0 < 0.6 ? lit(st.timber, f, 1) : c;
  };
}

/** A chidori-hafu: a small triangular gable dormer standing on a roof slope, facing left or right. */
function hafu(P: Painter, u: number, v: number, z: number, w: number, h: number, faceLeft: boolean): void {
  const st = P.st;
  const face = gableFace(P, z);
  const roof = kawara(P, z);
  const d = w * 0.6;
  if (faceLeft) {
    face4(P.px, v3(u - w / 2 - 0.5, v, z - 0.4), v3(u, v, z + h + 0.3), v3(u, v - d, z + h + 0.3), v3(u - w / 2 - 0.5, v - d, z - 0.4), 'back', roof);
    face4(P.px, v3(u + w / 2 + 0.5, v, z - 0.4), v3(u, v, z + h + 0.3), v3(u, v - d, z + h + 0.3), v3(u + w / 2 + 0.5, v - d, z - 0.4), 'left', roof);
    // The white gable last, a hair in front, with dark barge boards and the gilt fin.
    tri3(P.px, v3(u - w / 2, v + 0.3, z), v3(u + w / 2, v + 0.3, z), v3(u, v + 0.3, z + h), 'left', face);
    gableDepth(P, (a, zz) => v3(u + a, v + 0.3, zz), w, z, h);
  } else {
    face4(P.px, v3(u, v - w / 2 - 0.5, z - 0.4), v3(u, v, z + h + 0.3), v3(u - d, v, z + h + 0.3), v3(u - d, v - w / 2 - 0.5, z - 0.4), 'back', roof);
    face4(P.px, v3(u, v + w / 2 + 0.5, z - 0.4), v3(u, v, z + h + 0.3), v3(u - d, v, z + h + 0.3), v3(u - d, v + w / 2 + 0.5, z - 0.4), 'right', roof);
    tri3(P.px, v3(u + 0.3, v - w / 2, z), v3(u + 0.3, v + w / 2, z), v3(u + 0.3, v, z + h), 'right', face);
    gableDepth(P, (a, zz) => v3(u + 0.3, v + a, zz), w, z, h);
  }
}

/**
 * What gives a small gable its depth: the shadow its projecting roof throws on the plaster just
 * under the barge boards, thick barge boards with a white line of end-tiles along their tops, a
 * dark tie-beam across the foot, and the gilt fish-fin (gegyo) hanging at the apex.
 */
function gableDepth(P: Painter, at: (a: number, z: number) => V3, w: number, z: number, h: number): void {
  const st = P.st;
  const lift = (p: V3, dz: number, out = 0.15): V3 => v3(p.u + out, p.v + out, p.z + dz);
  const L = (a0: number, z0: number, a1: number, z1: number, c: Col, dz = 0, out = 0.15) => line3(P.px, lift(at(a0, z0), dz, out), lift(at(a1, z1), dz, out), c);
  // Shadow under the eaves, two art pixels deep.
  for (const d of [0.55, 1.0]) {
    L(-w / 2 + d * 1.2, z + 0.1, 0, z + h - d * 1.1, tone(st.fine[2], d > 0.6 ? 0.1 : 0.25), 0, 0.12);
    L(w / 2 - d * 1.2, z + 0.1, 0, z + h - d * 1.1, tone(st.fine[2], d > 0.6 ? 0.1 : 0.25), 0, 0.12);
  }
  // Barge boards: dark, two pixels thick, end-tiles white along the top.
  for (const [dz, c] of [[0, st.timber[3]], [0.5, st.timber[2]], [1.0, st.fine[1]]] as const) {
    L(-w / 2 - 0.5, z - 0.4, 0, z + h + 0.1, c, dz, 0.3);
    L(w / 2 + 0.5, z - 0.4, 0, z + h + 0.1, c, dz, 0.3);
  }
  L(-w / 2 + 0.4, z + 0.6, w / 2 - 0.4, z + 0.6, st.timber[2], 0, 0.2);
  P.px.point(lift(at(0, z + h - 0.9), 0, 0.35), st.gold);
  P.px.point(lift(at(0, z + h - 1.4), 0, 0.35), tone(st.gold, 0.3));
}

/** Koshi windows spaced along a face. */
function wins(face: Facing, from: number, len: number, n: number, z: number, w = 2.5, h = 2.5, kind: Win['kind'] = 'koshi'): Win[] {
  const out: Win[] = [];
  for (let i = 0; i < n; i++) out.push({ face, a: from + ((i + 0.5) * len) / n - w / 2, w, z, h, kind });
  return out;
}

/** A plastered box with a roof (the town's basic building): returns nothing; paints into P. */
function house(
  P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, h: number,
  ws: Win[], roof: 'kawara' | 'thatch' | 'bark' | 'irimoya', opts: { boards?: number; daub?: boolean; plank?: boolean; rh?: number; o?: number } = {},
): void {
  const st = P.st;
  const abs = ws.map((w) => ({ ...w, a: w.a + (w.face === 'left' ? u0 : v0) }));
  const sh = opts.plank ? planks(P, z, h, abs) : plaster(P, z, h, abs, opts.boards ?? 0, opts.daub);
  box(P.px, u0, v0, z, lu, lv, h, wrap(sh), false);
  const rh = opts.rh ?? Math.min(lu, lv) * 0.5;
  const o = opts.o ?? 2;
  if (roof === 'kawara') roofHip(P, u0, v0, z + h, lu, lv, rh * 0.8, o);
  else if (roof === 'irimoya') irimoya(P, u0, v0, z + h, lu, lv, rh, o);
  else if (roof === 'bark') irimoya(P, u0, v0, z + h, lu, lv, rh, o, false, st.shingle, bark(P, z + h, st.shingle));
  else hip(P.px, u0, v0, z + h, lu, lv, rh * 1.15, o + 0.5, bark(P, z + h - o * 0.6, st.thatch), 0.5);
}

/** Dark weathered boards (barns, stables, the poor). */
function planks(P: Painter, z0: number, h: number, ws: Win[]): PShader {
  const st = P.st;
  const k = P.k;
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    for (const w of ws)
      if (w.face === f && along >= w.a && along < w.a + w.w && zz >= w.z && zz < w.z + w.h) {
        if (w.kind === 'stall' && zz < w.h * 0.45) return lit(st.timber, f, 1);
        return w.kind === 'door' || w.kind === 'stall' ? st.glass : P.glassAt(p, st.glass);
      }
    const ap = Math.floor(along * k);
    let c = ap % 3 === 0 ? lit(st.timber, f, 1) : lit(st.timber, f);
    if (Math.floor(zz * k) === Math.floor(h * k * 0.5)) c = lit(st.timber, f, 2);
    if (zz > h - 0.8) c = tone(c, 0.3);
    return c;
  };
}

/** A stone lantern (tōrō): a lit fire-box under a little roof, on a post. */
function toro(P: Painter, parts: BuildingParts, u: number, v: number): void {
  const st = P.st;
  const s = (f: Facing) => lit(st.stone, f);
  box(P.px, u - 1, v - 1, 0, 2, 2, 0.8, (f) => s(f));
  box(P.px, u - 0.5, v - 0.5, 0.8, 1, 1, 2.6, (f) => s(f));
  box(P.px, u - 1, v - 1, 3.4, 2, 2, 1.4, (f, _s, t, p) => (f !== 'top' && t > 0.3 && t < 1.1 ? P.glassAt(p, st.glass) : s(f)));
  hip(P.px, u - 1, v - 1, 4.8, 2, 2, 1.2, 0.5, (f) => s(f));
  parts.torches.push([Math.floor(sx(u, v)), Math.floor(sy(u, v, 4))]);
}

/** A torii: two vermilion pillars, the black kasagi lintel curving up at the ends, the nuki below. */
function torii(P: Painter, u: number, v0: number, w: number, h: number, alongV = true): void {
  const st = P.st;
  const red = st.accent;
  const redS = tone(red, 0.3);
  const blk = hex('#221c1e');
  const at = (a: number, z: number) => (alongV ? v3(u, v0 + a, z) : v3(v0 + a, u, z));
  for (const a of [1, w - 1]) {
    const p = at(a, 0);
    box(P.px, p.u - 0.6, p.v - 0.6, 0, 1.2, 1.2, h, (f) => (f === 'left' ? red : redS));
    box(P.px, p.u - 0.8, p.v - 0.8, 0, 1.6, 1.6, 0.8, (f) => (f === 'left' ? blk : tone(blk, 0.2)));
  }
  // Nuki (tie beam) and the kasagi on top, overhanging and lifted at the tips.
  const n0 = at(-0.5, h - 2.6);
  box(P.px, n0.u - 0.4, n0.v, n0.z, alongV ? 0.8 : w + 1, alongV ? w + 1 : 0.8, 0.8, (f) => (f === 'left' ? red : redS));
  const k0 = at(-2, h);
  box(P.px, k0.u - 0.7, k0.v, k0.z, alongV ? 1.4 : w + 4, alongV ? w + 4 : 1.4, 0.9, (f) => (f === 'left' ? red : redS));
  box(P.px, k0.u - 0.8, k0.v, k0.z + 0.9, alongV ? 1.6 : w + 4, alongV ? w + 4 : 1.6, 0.8, (f) => (f === 'top' ? tone(blk, -0.2) : blk));
  for (const a of [-2, w + 2]) {
    const p = at(a, h + 1.7);
    P.px.point(p, blk);
  }
}

// ------------------------------------------------------------------ the buildings

function keep(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier <= 1) {
    // A fortified manor (yakata): a timber watch-yagura on a stone footing, a thatched hall.
    frustum(P.px, 21, 21, 0, 18, 18, 3, 0.8, ishigaki(P, 3));
    house(P, 23, 23, 3, 14, 14, 16, wins('left', 0, 14, 2, 10, 2, 2).concat(wins('right', 0, 14, 2, 10, 2, 2)), 'kawara', { plank: true, rh: 7, o: 1.5 });
    house(P, 40, 18, 0, 14, 26, 8, [{ face: 'right', a: 10, w: 4, z: 0, h: 5, kind: 'door' }, ...wins('left', 2, 10, 2, 3, 2.5, 2.5, 'shoji')], 'thatch', { daub: true, rh: 8 });
    P.pole(parts, 30, 30, 36, 8, 4, 4);
    parts.torches.push([Math.floor(sx(39, 32)), Math.floor(sy(39, 32, 6))]);
    return;
  }
  // A tenshu on its ishigaki, storeys stepping in, each under its own kawara skirt.
  const base = tier === 2 ? 30 : tier === 3 ? 34 : 38;
  const bh = tier === 2 ? 6 : tier === 3 ? 8 : 10;
  const b0 = 36 - base / 2;
  frustum(P.px, b0, b0, 0, base, base, bh, bh * 0.28, ishigaki(P, 11));
  const storeys: [number, number][] =
    tier === 2 ? [[24, 10], [15, 8]] : tier === 3 ? [[27, 10], [21, 9], [14, 8]] : [[30, 10], [25, 9], [20, 9], [15, 8], [11, 7]];
  const black = tier === 3;
  let z = bh;
  storeys.forEach(([l, h], i) => {
    const u0 = 36 - l / 2;
    const last = i === storeys.length - 1;
    const nw = Math.max(1, Math.floor(l / 6));
    const ws: Win[] = [...wins('left', 0, l, nw, h * 0.42, 2.2, 2.6), ...wins('right', 0, l, nw, h * 0.42, 2.2, 2.6)];
    // The topmost storey has the lookout's railed balcony windows, wider and lit.
    if (last) ws.push(...wins('left', 0, l, 2, 2, 3, 3, 'shoji'), ...wins('right', 0, l, 2, 2, 3, 3, 'shoji'));
    house(P, u0, u0, z, l, l, h, last ? ws.filter((w) => w.kind === 'shoji') : ws, last ? 'irimoya' : 'kawara', {
      boards: black ? h * 0.4 : 0,
      rh: last ? l * 0.62 : l * 0.2,
      o: last ? 2 : 2.6,
    });
    if (last) {
      // Re-roof the top with gilt shachi on its ridge.
      irimoya(P, u0, u0, z + h, l, l, l * 0.62, 2, true);
    } else if (i < storeys.length - 2 || tier === 2) {
      // Chidori-hafu on the skirt roofs, facing the town (left and right).
      // Stand each on the slope just above the eave, so its white face shows in front of the tiles.
      const o = 2.6;
      const ze = z + h - o * 0.6;
      const ve = u0 + l + o;
      const slope = (l * 0.16 + o * 0.6) / (l / 2 + o);
      const back = 1.6;
      const zf = ze + back * slope;
      const w = Math.min(9, l * 0.36);
      hafu(P, 36, ve - back, zf, w, 4.2, true);
      if (tier >= 3) hafu(P, ve - back, 36, zf, w, 4.2, false);
    }
    z += h + 2.2;
  });
  // The entrance tower (tsuke-yagura) at the yard side, with its door.
  if (tier >= 3) {
    const tu = b0 + base;
    frustum(P.px, tu - 2, 30, 0, 10, 12, bh * 0.6, 1, ishigaki(P, 12));
    house(P, tu - 1, 31, bh * 0.6, 8, 10, 6, [{ face: 'right', a: 3, w: 4, z: 0, h: 4.5, kind: 'door' }, ...wins('left', 1, 6, 1, 3, 2, 2)], 'kawara', { boards: black ? 3 : 0, rh: 4 });
  } else {
    box(P.px, b0 + base - 1, 32, 0, 5, 8, bh - 1, wrap(ishigaki(P, 13)));
  }
  P.pole(parts, b0 + base - 2, b0 + base - 2, bh, 14, 4, 4);
  parts.torches.push([Math.floor(sx(b0 + base + 7, 36)), Math.floor(sy(b0 + base + 7, 36, 6))]);
  void st;
}

function chapter(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const red = st.accent;
  // The approach: a torii at the yard end of the precinct, facing the town.
  const pillars = (u: number, v: number, l: number, h: number, n: number, alongU: boolean) => {
    for (let i = 0; i <= n; i++) {
      const a = (i * l) / n;
      const p = alongU ? v3(u + a, v, 0) : v3(u, v + a, 0);
      box(P.px, p.u - 0.5, p.v - 0.5, 0, 1, 1, h, (f) => (f === 'left' ? red : tone(red, 0.3)));
    }
  };
  if (tier === 1) {
    // A hokora: a tiny shrine on a stone plinth under a bark roof, with a torii and a rope.
    frustum(P.px, 100, 22, 0, 10, 10, 2, 0.5, ishigaki(P, 21));
    house(P, 101.5, 23.5, 2, 7, 7, 4, [{ face: 'right', a: 2, w: 3, z: 0.5, h: 3, kind: 'door' }], 'bark', { rh: 5, o: 1.2 });
    torii(P, 122, 24, 7, 8);
    toro(P, parts, 116, 21);
    toro(P, parts, 116, 34);
    return;
  }
  // Honden (main hall) raised on posts, vermilion frame, white panels, bark roof.
  const big = tier >= 3;
  const hu = tier >= 4 ? 84 : 88;
  const hv = 16;
  const hl = big ? 20 : 18;
  const hw = big ? 18 : 16;
  frustum(P.px, hu - 2, hv - 2, 0, hl + 4, hw + 4, 2, 0.6, ishigaki(P, 22));
  pillars(hu, hv + hw, hl, 3, 4, true);
  pillars(hu + hl, hv, hw, 3, 4, false);
  box(P.px, hu, hv, 2, hl, hw, 1, (f) => lit(st.timber, f, 1));
  const panel = (f: Facing, p: { u: number; v: number; z: number }) => {
    const along = f === 'left' ? p.u : p.v;
    const ap = Math.floor(along * P.k);
    if (ap % 10 < 2) return f === 'left' ? red : tone(red, 0.3);
    if (Math.floor((p.z - 3) * P.k) % 9 === 0) return f === 'left' ? red : tone(red, 0.3);
    return lit(st.fine, f);
  };
  box(P.px, hu, hv, 3, hl, hw, 7, wrap((f, p) => (p.z > 9.2 ? tone(lit(st.fine, f), 0.35) : panel(f, p))), false);
  irimoya(P, hu, hv, 10, hl, hw, hw * 0.75, 2.5, false, st.shingle, bark(P, 8, st.shingle));
  // Chigi (crossed finials) and katsuogi logs along the ridge.
  const rz = 10 + hw * 0.75 * 0.45 + hw * 0.75 * 0.55;
  for (let i = 1; i <= 3; i++) box(P.px, hu + (hl * i) / 4 - 0.7, hv + hw / 2 - 0.7, rz - 0.2, 1.4, 1.4, 1.2, (f) => (f === 'left' ? st.gold : tone(st.gold, 0.3)));
  for (const u of [hu + hl * 0.2, hu + hl * 0.8]) {
    line3(P.px, v3(u - 1, hv + hw / 2, rz - 1), v3(u + 1.5, hv + hw / 2, rz + 3), st.timber[1]);
    line3(P.px, v3(u + 1, hv + hw / 2, rz - 1), v3(u - 1.5, hv + hw / 2, rz + 3), st.timber[2]);
  }
  // A shimenawa rope with white shide over the door.
  for (let v = hv + 3; v < hv + hw - 3; v += 0.25) P.px.point(v3(hu + hl + 0.3, v, 8.5 - Math.sin(((v - hv - 3) / (hw - 6)) * Math.PI) * 0.8), hex('#d8c48a'));
  for (let v = hv + 5; v < hv + hw - 4; v += 3) line3(P.px, v3(hu + hl + 0.4, v, 7.8), v3(hu + hl + 0.4, v, 6.6), st.fine[0]);
  if (big) {
    // The haiden (oratory) before it: wider, open-fronted, its gable facing the approach.
    const au = hu + hl + 4;
    const av = hv - 1;
    const al = 14;
    const aw = hw + 2;
    frustum(P.px, au - 1, av - 1, 0, al + 2, aw + 2, 1.5, 0.4, ishigaki(P, 23));
    pillars(au, av + aw, al, 6, 3, true);
    pillars(au + al, av, aw, 6, 4, false);
    box(P.px, au, av, 1.5, al, aw, 6.5, wrap((f, p) => (f === 'right' && p.z < 7 && p.z > 2 ? P.glassAt(p, tone(st.glass, -0.1)) : p.z > 7.2 ? tone(lit(st.fine, f), 0.35) : panel(f, p))), false);
    irimoya(P, au, av, 8, al, aw, aw * 0.7, 2.5, false, st.shingle, bark(P, 6, st.shingle));
    // A bell house (shōrō) at the side, and the stone lanterns along the approach.
    house(P, 128, 14, 0, 8, 8, 7, [], 'kawara', { plank: true, rh: 5, o: 1.6 });
    parts.bells.push([Math.floor(sx(132, 22)), Math.floor(sy(132, 22, 5))]);
  } else parts.bells.push([Math.floor(sx(hu + hl + 1, hv + hw / 2)), Math.floor(sy(hu + hl + 1, hv + hw / 2, 9))]);
  torii(P, 136, 22, 9, 10);
  toro(P, parts, 128, 40);
  toro(P, parts, 118, 40);
  if (tier >= 4) {
    // A three-storey pagoda (sanjūnotō) by the hall: vermilion, three skirts, a gilt sōrin spire.
    const pu = 125;
    const pv = 28;
    frustum(P.px, pu - 1, pv - 1, 0, 12, 12, 2, 0.5, ishigaki(P, 24));
    let z = 2;
    for (let i = 0; i < 3; i++) {
      const l = 9 - i * 1.5;
      const o = (10 - l) / 2;
      box(P.px, pu + o, pv + o, z, l, l, 4.5, wrap((f, p) => {
        const along = f === 'left' ? p.u : p.v;
        return Math.abs(along - (f === 'left' ? pu + 5 : pv + 5)) < 1 ? P.glassAt(p, st.glass) : f === 'left' ? red : tone(red, 0.3);
      }), false);
      roofHip(P, pu + o, pv + o, z + 4.5, l, l, 2.2, 2.6);
      z += 6.4;
    }
    for (let k = 0; k < 9; k++) P.px.point(v3(pu + 5, pv + 5, z + k * 0.9), k % 2 ? tone(st.gold, 0.3) : st.gold);
    P.pole(parts, 110, 42, 0, 15, 4, 4);
  }
}

function barracks(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const lu = tier === 1 ? 26 : 30;
  const lv = tier === 1 ? 42 : tier === 2 ? 50 : 54;
  const u0 = 14;
  const v0 = 74;
  const h = tier === 1 ? 8 : tier === 2 ? 11 : 13;
  const door: Win = { face: 'right', a: lv / 2 - 3, w: 6, z: 0, h: 6, kind: 'shoji' };
  const ws: Win[] = [...wins('right', 2, lv - 4, tier + 2, h * 0.4, 3, 3, tier === 1 ? 'koshi' : 'shoji').filter((w) => Math.abs(w.a + w.w / 2 - lv / 2) > 5), door, ...wins('left', 0, lu, 2, h * 0.45, 2.5, 2.5)];
  if (tier === 1) house(P, u0, v0, 0, lu, lv, h, ws, 'thatch', { plank: true, rh: 13 });
  else {
    // A stone plinth, then the plastered hall with black boards below, under an irimoya roof.
    frustum(P.px, u0 - 1, v0 - 1, 0, lu + 2, lv + 2, 1.5, 0.3, ishigaki(P, 31));
    house(P, u0, v0, 1.5, lu, lv, h, ws.map((w) => ({ ...w, z: w.z })), 'irimoya', { boards: tier >= 3 ? 4 : 3, rh: lu * 0.62, o: 2.5 });
  }
  // A wooden sign-board (kanban) by the door and the weapon rack (yari stand).
  const sv = v0 + lv / 2;
  box(P.px, u0 + lu + 0.2, sv + 4, 3, 0.5, 2, 5, (f) => (f === 'right' ? st.fine[1] : st.timber[1]));
  for (let i = 0; i < 4; i++) post(P.px, u0 + lu + 3, sv + 8 + i * 1.5, 0, 12, st.timber[1]);
  for (let i = 0; i < 4; i++) P.px.point(v3(u0 + lu + 3, sv + 8 + i * 1.5, 12.5), hex('#c8ccd2'));
  line3(P.px, v3(u0 + lu + 3, sv + 7, 7), v3(u0 + lu + 3, sv + 14, 7), st.timber[2]);
  if (tier >= 3) {
    // A two-storey corner yagura at the yard end.
    const tu = u0 + lu - 8;
    const tv = v0 - 6;
    frustum(P.px, tu - 1, tv - 1, 0, 14, 14, 4, 1, ishigaki(P, 32));
    house(P, tu, tv, 4, 12, 12, 8, wins('left', 0, 12, 2, 4, 2, 2.5).concat(wins('right', 0, 12, 2, 4, 2, 2.5)), 'kawara', { boards: 4, rh: 3.5, o: 2 });
    house(P, tu + 2, tv + 2, 13.5, 8, 8, 6, wins('left', 0, 8, 1, 2, 2.5, 2.5).concat(wins('right', 0, 8, 1, 2, 2.5, 2.5)), 'irimoya', { rh: 6, o: 1.8 });
    if (tier >= 4) P.pole(parts, tu + 12, tv + 12, 4, 20, 4, 4);
  }
  if (tier >= 2) P.pole(parts, u0 + lu + 2, sv - 6, 0, 18, 4, 4);
  // The armourer's lean-to at the south end: a hearth, an anvil, the bellows.
  const fv = v0 + lv + 1;
  box(P.px, u0 + 2, fv, 0, 16, 10, 2, wrap(ishigaki(P, 34)));
  for (const [pu, pv] of [[u0 + 2, fv + 10], [u0 + 18, fv + 10], [u0 + 18, fv]] as const) post(P.px, pu, pv, 0, 9, st.timber[2], st.timber[3]);
  // A mono-pitch roof, open toward the yard so the hearth's fire shows.
  const lean = tier >= 2 ? kawara(P, 8) : bark(P, 8, st.thatch);
  P.px.quad(v3(u0 + 1, fv - 1, 11), v3(19, 0, 0), v3(0, 13, -3), (_s, _t, p) => lean('left', p));
  box(P.px, u0 + 4, fv + 2, 0, 5, 5, 4, wrap(ishigaki(P, 35)));
  box(P.px, u0 + 10, fv + 2, 0, 3, 5, 3, (f) => lit(st.timber, f, 1));
  P.chimney(parts, u0 + 5, fv + 3, 4, 11);
  parts.forges.push([Math.floor(sx(u0 + 9, fv + 5)), Math.floor(sy(u0 + 9, fv + 5, 2))]);
  box(P.px, u0 + 12, fv + 6, 0, 2, 2, 3, P.flat(st.slate[2]));
  parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 - 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 - 4, 8))]);
}

function range(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  // The shajō: the shooters' hall, open toward the azuchi, its floor raised.
  const su = 200;
  const sv = 36;
  const sl = 14;
  const sw = 34;
  box(P.px, su, sv, 0, sl, sw, 1.2, (f) => lit(st.timber, f, 1));
  const ph = tier === 1 ? 7 : 9;
  for (const v of [sv, sv + sw / 3, (sv + sw * 2 / 3), sv + sw]) post(P.px, su + sl, v, 1.2, ph, st.timber[1], st.timber[2]);
  for (const v of [sv, sv + sw / 2, sv + sw]) post(P.px, su, v, 1.2, ph, st.timber[2]);
  box(P.px, su + sl - 0.5, sv, 1.2, 0.5, sw, ph, wrap(planks(P, 1.2, ph, [])), false);
  if (tier === 1) hip(P.px, su, sv, ph + 1.2, sl, sw, 4, 1.5, bark(P, ph, st.thatch));
  else if (tier < 4) roofHip(P, su, sv, ph + 1.2, sl, sw, 5, 2);
  else irimoya(P, su, sv, ph + 1.2, sl, sw, 9, 2.5);
  // The azuchi: a sand bank under its own little roof, the mato (targets) before it.
  const n = Math.min(4, 1 + Math.floor(level / 4));
  const sand = hex('#d8c8a0');
  frustum(P.px, 142, 38, 0, 6, n * 7 + 2, 6, 1.6, (f) => (f === 'left' ? sand : f === 'top' ? tone(sand, -0.08) : tone(sand, 0.22)));
  for (const v of [38, 38 + n * 7 + 2]) post(P.px, 141, v, 0, 9, st.timber[2]);
  for (const v of [38, 38 + n * 7 + 2]) post(P.px, 148, v, 0, 8, st.timber[1]);
  roofHip(P, 140, 37, 8.5, 9, n * 7 + 4, 2, 1);
  for (let i = 0; i < n; i++) {
    const cu = 152.5;
    const cv = 43 + i * 7;
    const cz = 3.2;
    line3(P.px, v3(cu, cv, 0), v3(cu, cv, cz), st.timber[2]);
    // Mato: concentric black and white rings (kasumi-mato).
    for (let dv = -2.4; dv <= 2.4; dv += 0.2)
      for (let dz = -2.4; dz <= 2.4; dz += 0.2) {
        const r = Math.hypot(dv, dz);
        if (r > 2.3) continue;
        const ring = r < 0.6 ? hex('#1e1a1e') : r < 1.1 ? st.fine[0] : r < 1.5 ? hex('#1e1a1e') : r < 1.9 ? st.fine[0] : hex('#1e1a1e');
        P.px.point(v3(cu, cv + dv, cz + dz), ring);
      }
    parts.targets.push([Math.floor(sx(cu, cv)), Math.floor(sy(cu, cv, cz))]);
  }
  if (tier >= 3) {
    // A bamboo fence (yarai) along the lane.
    for (let u = 156; u < 198; u += 1.5) post(P.px, u, 70, 0, 4, u % 3 < 1.5 ? hex('#8a9a54') : hex('#6a7a40'));
    line3(P.px, v3(156, 70, 3), v3(198, 70, 3), hex('#5a6a34'));
  }
  if (tier >= 2) P.pole(parts, 204, 30, 0, 16, 4, 4);
}

function granary(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    // A takakura: a rice store raised on posts against damp and rats, under thick thatch.
    for (const [u, v] of [[166, 80], [186, 80], [166, 94], [186, 94]] as const) post(P.px, u, v, 0, 5, st.timber[1], st.timber[2]);
    box(P.px, 164, 78, 5, 26, 20, 0.8, (f) => lit(st.timber, f, 1));
    house(P, 165, 79, 5.8, 24, 18, 7, [{ face: 'left', a: 10, w: 4, z: 0, h: 5, kind: 'door' }], 'thatch', { plank: true, rh: 11 });
    line3(P.px, v3(176, 98, 0), v3(176, 98, 5.8), st.timber[0]);
  } else {
    // Kura: thick white plaster storehouses, namako-kabe on the lower walls, heavy doors.
    const n = tier === 2 ? 1 : tier === 3 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const u0 = [184, 160, 172][i]!;
      const v0 = [76, 78, 92][i]!;
      const lu = i === 2 ? 14 : 18;
      const lv = i === 2 ? 10 : 14;
      const h = i === 2 ? 9 : 11;
      frustum(P.px, u0 - 1, v0 - 1, 0, lu + 2, lv + 2, 1.2, 0.3, ishigaki(P, 50 + i));
      house(P, u0, v0, 1.2, lu, lv, h, [
        { face: 'left', a: 0, w: lu, z: 0, h: h * 0.42, kind: 'namako' },
        { face: 'right', a: 0, w: lv, z: 0, h: h * 0.42, kind: 'namako' },
        { face: 'left', a: lu / 2 - 2, w: 4, z: 0, h: 6, kind: 'door' },
        { face: 'right', a: lv / 2 - 1, w: 2, z: h * 0.7, h: 1.8, kind: 'koshi' },
      ], 'kawara', { rh: lv * 0.55, o: 1.5 });
      // A gilt mon on the gable side.
      P.px.point(v3(u0 + lu + 0.2, v0 + lv / 2, h + 1.2 - 1.6), st.gold);
    }
    if (tier >= 4) P.pole(parts, 204, 100, 0, 16, 4, 4);
  }
  // Rice bales (tawara) by the door, more with the streak: straw drums bound with rope.
  const bales = Math.min(8, 1 + Math.floor(level / 2));
  const straw = st.thatch;
  for (let i = 0; i < bales; i++) {
    const u = 166 + (i % 4) * 3.4;
    const v = 104 + Math.floor(i / 4) * 2.5;
    box(P.px, u, v, Math.floor(i / 8) * 3, 3, 2, 2.4, (f, s) => {
      const c = f === 'top' ? straw[0] : f === 'left' ? straw[1] : straw[2];
      return Math.abs(s - 0.8) < 0.25 || Math.abs(s - 2.2) < 0.25 ? tone(c, 0.35) : c;
    });
  }
}

function stables(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const lu = tier <= 2 ? 26 : 30;
  const lv = tier === 1 ? 46 : tier === 2 ? 56 : 62;
  const u0 = 14;
  const v0 = 148;
  const h = tier >= 3 ? 11 : 9;
  const n = tier + 2;
  const ws: Win[] = [];
  for (let i = 0; i < n; i++) ws.push({ face: 'right', a: v0 + ((i + 0.5) * lv) / n - 2.5, w: 5, z: 0, h: 7, kind: 'stall' });
  ws.push({ face: 'left', a: u0 + lu / 2 - 2, w: 4, z: 0, h: 7, kind: 'door' });
  if (tier >= 3) {
    frustum(P.px, u0 - 1, v0 - 1, 0, lu + 2, lv + 2, 1, 0.3, ishigaki(P, 61));
    box(P.px, u0, v0, 1, lu, lv, h, wrap(plaster(P, 1, h, ws.map((w) => ({ ...w, z: w.z })), h * 0.75)), false);
    irimoya(P, u0, v0, h + 1, lu, lv, lu * 0.6, 2.5);
  } else {
    box(P.px, u0, v0, 0, lu, lv, h, wrap(planks(P, 0, h, ws)), false);
    if (tier === 1) hip(P.px, u0, v0, h, lu, lv, 12, 2.2, bark(P, h - 1.3, st.thatch));
    else irimoya(P, u0, v0, h, lu, lv, lu * 0.55, 2.2, false, st.shingle, bark(P, h - 1.3, st.shingle));
  }
  for (let i = 0; i < n; i++) {
    const v = v0 + ((i + 0.5) * lv) / n;
    parts.stalls.push([Math.floor(sx(u0 + lu, v)), Math.floor(sy(u0 + lu, v, 5))]);
  }
  if (tier >= 4) P.pole(parts, u0 + lu + 1, v0 + 2, 0, 18, 4, 4);
  // A wooden trough and a stack of fodder bundles.
  box(P.px, u0 + lu + 6, v0 + 4, 0, 4, 10, 2.5, (f, s, t) => (f === 'top' ? (s > 0.6 && s < 3.4 && t > 0.6 && t < 9.4 ? tone(st.slate[0], -0.1) : st.timber[1]) : lit(st.timber, f)));
  for (let i = 0; i < 3; i++) box(P.px, u0 + lu + 4, v0 + lv - 9 + i * 2.2, 0, 5, 2, 2.2 + (i % 2), (f) => lit(st.thatch, f));
}

function workshop(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 172;
  const v0 = 140;
  const lu = tier === 1 ? 30 : 38;
  const lv = tier === 1 ? 26 : 32;
  const h = tier === 1 ? 8 : 10;
  // The back walls (board, then plaster), open on the yard sides under a long roof.
  const back = tier >= 2 ? plaster(P, 0, h, [], h * 0.5) : planks(P, 0, h, []);
  box(P.px, u0, v0, 0, 3, lv, h, wrap(back));
  box(P.px, u0, v0, 0, lu, 3, h, wrap(back));
  for (let u = u0 + 3; u <= u0 + lu; u += lu / 3) post(P.px, u, v0 + lv, 0, h, st.timber[1], st.timber[2]);
  for (let v = v0 + 3; v <= v0 + lv; v += lv / 3) post(P.px, u0 + lu, v, 0, h, st.timber[2]);
  if (tier === 1) hip(P.px, u0 - 1, v0 - 1, h, lu + 2, lv + 2, 10, 2, bark(P, h - 1.2, st.thatch));
  else irimoya(P, u0 - 1, v0 - 1, h, lu + 2, lv + 2, lu * 0.5, 2.5);
  // The smoke gable (kemuridashi) on the ridge over the hearth.
  const zr = h + (tier === 1 ? 10 : lu * 0.5 * 0.62) - 1;
  box(P.px, u0 + 6, v0 + lv / 2 - 2, zr, 5, 4, 2, (f) => lit(st.timber, f, 2));
  roofHip(P, u0 + 6, v0 + lv / 2 - 2, zr + 2, 5, 4, 1.5, 1);
  parts.smoke.push([Math.floor(sx(u0 + 8.5, v0 + lv / 2)), Math.floor(sy(u0 + 8.5, v0 + lv / 2, zr + 3))]);
  // Hearth, bellows (fuigo), anvil, a quench tub and charcoal sacks.
  box(P.px, u0 + 4, v0 + 5, 0, 6, 6, 3, wrap(ishigaki(P, 71)));
  // (The hearth is under the roof: its fire shows only as smoke from the kemuridashi.)
  box(P.px, u0 + 11, v0 + 5, 0, 5, 3, 3, (f) => lit(st.timber, f));
  box(P.px, u0 + 14, v0 + 12, 0, 2, 2, 2.5, P.flat(st.slate[2]));
  box(P.px, u0 + 18, v0 + 10, 0, 3, 3, 2, (f, _s, _t, p) => (f === 'top' ? tone(st.slate[1], 0.2) : lit(st.timber, f, Math.floor(p.z * 2) % 2)));
  // Timber stacks outside.
  for (let i = 0; i < 3; i++) box(P.px, u0 - 2 - (i % 2), v0 + lv + 4, i * 2, 20, 3, 2, wrap(planks(P, i * 2, 2, [])));
  if (tier >= 4) P.pole(parts, u0 + lu + 2, v0 + 2, 0, 20, 4, 4);
}

function hospital(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 98;
  const v0 = 186;
  const lu = tier === 1 ? 30 : 40;
  const lv = tier === 1 ? 18 : 22;
  const h = tier === 1 ? 8 : 9;
  // A machiya: ochre plaster, a lattice front (koshi), a noren at the door, kawara over all.
  const ws: Win[] = [
    ...wins('left', 2, lu - 4, tier + 1, 1.5, 4, 4, 'koshi'),
    { face: 'right', a: lv / 2 - 2.5, w: 5, z: 0, h: 6.5, kind: 'door' },
  ];
  if (tier === 1) house(P, u0, v0, 0, lu, lv, h, ws, 'thatch', { daub: true, rh: 10 });
  else {
    house(P, u0, v0, 0, lu, lv, h, ws, 'kawara', { daub: true, boards: 2.5, rh: lv * 0.5, o: 1.6 });
    // The low second storey with mushiko-mado slits, its own kawara above.
    house(P, u0 + 2, v0 + 2, h + 1.5, lu - 4, lv - 4, 4.5, wins('left', 2, lu - 8, 4, 1.2, 2.5, 2, 'shoji'), 'kawara', { daub: true, rh: (lv - 4) * 0.45, o: 1.6 });
  }
  // The noren: indigo cloth hanging over the door with the house's white mark.
  const nu = u0 + lu + 0.3;
  for (let v = v0 + lv / 2 - 2.5; v < v0 + lv / 2 + 2.5; v += 0.5)
    for (let z = 4.5; z < 6.5; z += 0.5) P.px.point(v3(nu, v, z), Math.abs(v - (v0 + lv / 2)) < 0.4 && z > 5 ? st.fine[0] : st.bannerCharge);
  // A paper lantern by the door: the one warm light of the street at night.
  box(P.px, nu + 0.5, v0 + lv / 2 + 3.5, 5, 1.2, 1.2, 2, (f, _s, _t, p) => (f === 'top' ? hex('#2a2024') : P.glassAt(p, f === 'left' ? hex('#e8d8b8') : hex('#c8b898'))));
  parts.torches.push([Math.floor(sx(nu + 1, v0 + lv / 2 + 4)), Math.floor(sy(nu + 1, v0 + lv / 2 + 4, 6))]);
  if (tier >= 3) {
    // A small kura for the medicines behind.
    frustum(P.px, u0 + 1, v0 - 9, 0, 10, 9, 1, 0.3, ishigaki(P, 81));
    house(P, u0 + 2, v0 - 8, 1, 8, 7, 8, [
      { face: 'left', a: 0, w: 8, z: 0, h: 3.5, kind: 'namako' },
      { face: 'right', a: 0, w: 7, z: 0, h: 3.5, kind: 'namako' },
    ], 'kawara', { rh: 4, o: 1.2 });
  }
  if (tier >= 4) P.pole(parts, u0 + lu + 2, v0 + 1, 0, 16, 4, 4);
}

// ------------------------------------------------------------------ walls

function walls(P: Painter, a: PaintArgs, parts: BuildingParts): BuildingParts {
  const tier = tierOf(a.level);
  const st = P.st;
  const W = WALL;
  const gate0 = GATE_V - 9;
  const gate1 = GATE_V + 9;
  const { back: h, front } = wallHeights(tier);
  const th = 4;
  const run = (u0: number, v0: number, lu: number, lv: number, hh: number) => {
    if (lu <= 0 || lv <= 0) return;
    const along = lu > lv;
    if (tier === 1) {
      // An earth bank (dorui) with a palisade of sharpened logs on it.
      frustum(P.px, u0, v0, 0, lu, lv, 2.5, 0.8, (f, p) => {
        const c = f === 'top' ? hex('#6a7a46') : f === 'left' ? hex('#7a6a4a') : hex('#5a4e3a');
        // Clods as 2-px dashes, rows offset by one (no lone pixels).
        const y = Math.floor(p.v * 2);
        return hash((Math.floor(p.u * 2) + (y & 1)) >> 1, y, 3) < 0.15 ? tone(c, 0.1) : c;
      });
      const len = along ? lu : lv;
      for (let i = 0; i < len; i += 1.5) {
        const u = along ? u0 + i : u0 + 1.4;
        const v = along ? v0 + 1.4 : v0 + i;
        const lh = hh - 3 + (hash(Math.floor(i * 2), u0 + v0) < 0.4 ? 1 : 0);
        box(P.px, u, v, 2.3, 1.2, 1.2, lh, (f) => (f === 'top' ? st.timber[0] : f === 'left' ? (Math.floor(i) % 3 ? st.timber[1] : st.timber[0]) : st.timber[2]));
      }
      return;
    }
    // Dobei: a plastered earth wall with a kawara coping, on ishigaki from the fortified tier.
    const base = tier >= 3 ? (tier >= 4 ? hh * 0.62 : hh * 0.5) : 1;
    frustum(P.px, u0, v0, 0, lu, lv, base, tier >= 3 ? 0.9 : 0.2, ishigaki(P, u0 * 7 + v0), false);
    const wu = along ? u0 : u0 + 0.9;
    const wv = along ? v0 + 0.9 : v0;
    const wl = along ? lu : 2.2;
    const ww = along ? 2.2 : lv;
    const wh = hh - base;
    // Loopholes (sama): small triangles and squares in a row.
    const sama: Win[] = [];
    const len = along ? lu : lv;
    for (let s = 3; s < len - 2; s += 6) sama.push({ face: along ? 'left' : 'right', a: (along ? wu : wv) + s, w: 1.2, z: wh * 0.35, h: 1.2, kind: 'slit' });
    box(P.px, wu, wv, base, wl, ww, wh, wrap(plaster(P, base, wh, sama, tier >= 3 ? wh * 0.3 : 0)), true);
    hip(P.px, wu, wv, hh, wl, ww, 1.2, 0.8, kawara(P, hh - 0.5), 0.5);
  };
  const towerAt = (u: number, v: number, hh: number) => {
    if (tier === 1) {
      // A timber watch-tower (yagura) on four legs.
      for (const [du, dv] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) post(P.px, u + du, v + dv, 0, hh + 6, st.timber[1], st.timber[2]);
      box(P.px, u - 1, v - 1, hh + 4, 10, 10, 5, wrap(planks(P, hh + 4, 5, [])));
      hip(P.px, u - 1, v - 1, hh + 9, 10, 10, 5, 1.2, bark(P, hh + 8, st.thatch));
      return;
    }
    // A sumi-yagura: a corner turret on its ishigaki, one or two storeys.
    const l = tier >= 3 ? 14 : 12;
    const b = tier >= 3 ? hh * 0.7 : 2;
    const u0 = u - l / 2 + 4;
    const v0 = v - l / 2 + 4;
    frustum(P.px, u0 - 1, v0 - 1, 0, l + 2, l + 2, b, tier >= 3 ? 1.2 : 0.3, ishigaki(P, u * 3 + v));
    house(P, u0, v0, b, l, l, 7, wins('left', 0, l, 2, 2.5, 2, 2.4).concat(wins('right', 0, l, 2, 2.5, 2, 2.4)), tier >= 4 ? 'kawara' : 'irimoya', { boards: 3, rh: tier >= 4 ? 3 : l * 0.55, o: 2 });
    if (tier >= 4) house(P, u0 + 2.5, v0 + 2.5, b + 9, l - 5, l - 5, 5, wins('left', 0, l - 5, 1, 1.5, 2.4, 2.4).concat(wins('right', 0, l - 5, 1, 1.5, 2.4, 2.4)), 'irimoya', { rh: (l - 5) * 0.6, o: 1.6 });
  };
  if (tier >= 3) towerAt(-4, -4, h);
  run(0, 0, W, th, h);
  run(0, 0, th, W, h);
  if (tier >= 3) {
    towerAt(W - 4, -4, h);
    towerAt(-4, W - 4, h);
  }
  parts.arts.push(P.finish(-10));
  const chunk = 29;
  for (let v = 0; v < W; v += chunk) {
    P.reset();
    const v1 = Math.min(W, v + chunk);
    const a0 = Math.max(v, th);
    if (v1 > gate0 && v < gate1) {
      run(W - th, a0, th, gate0 - a0, front);
      run(W - th, gate1, th, v1 - gate1, front);
    } else run(W - th, a0, th, v1 - a0, front);
    parts.arts.push(P.finish(W + (v + v1) / 2 - 2));
  }
  for (let u = 0; u < W - th; u += chunk) {
    P.reset();
    const u1 = Math.min(W - th, u + chunk);
    run(Math.max(u, th), W - th, u1 - Math.max(u, th), th, front);
    parts.arts.push(P.finish(W + (u + u1) / 2 - 2));
  }
  // The gate: a kabuki-mon of posts and a beam, a roofed yakui-mon, then a yagura-mon over the way.
  P.reset();
  const gh = front + (tier >= 3 ? 8 : 5);
  if (tier === 1) {
    for (const v of [gate0 - 1, gate1]) box(P.px, W - 3, v, 0, 1.6, 1.6, gh, (f) => lit(st.timber, f));
    box(P.px, W - 3.5, gate0 - 3, gh - 1.5, 2.6, gate1 - gate0 + 6, 1.4, (f) => lit(st.timber, f));
    hip(P.px, W - 4, gate0 - 3, gh, 3.6, gate1 - gate0 + 6, 1.5, 0.8, bark(P, gh - 0.5, st.shingle));
  } else if (tier === 2) {
    for (const v of [gate0 - 2, gate1 + 0.5]) box(P.px, W - 4, v, 0, 2, 1.6, gh, (f) => lit(st.timber, f));
    box(P.px, W - 5, gate0 - 3, gh, 5, gate1 - gate0 + 6, 1.5, (f) => lit(st.timber, f, 1));
    irimoya(P, W - 5.5, gate0 - 3.5, gh + 1.5, 6, gate1 - gate0 + 7, 5, 1.6);
  } else {
    // Yagura-mon: the gate passes under a long turret resting on the ishigaki either side.
    const b = front * 0.62;
    for (const v of [gate0 - 9, gate1]) frustum(P.px, W - 8, v, 0, 11, 9, b, 0.8, ishigaki(P, v));
    const z = gh - 2;
    box(P.px, W - 7, gate0 - 8, b, 9, gate1 - gate0 + 16, z - b, wrap(plaster(P, b, z - b, [], (z - b) * 0.4)), false);
    house(P, W - 7, gate0 - 8, z, 9, gate1 - gate0 + 16, 6, wins('right', 0, gate1 - gate0 + 16, 4, 2.4, 2, 2.4), 'irimoya', { boards: 2.5, rh: 6.5, o: 2 });
    // The passage's dark mouth under the turret.
    box(P.px, W - 7, gate0, 0, 9.2, gate1 - gate0, b + 1, () => tone(st.glass, -0.05), false);
  }
  parts.torches.push([Math.floor(sx(W + 3, gate0 - 1)), Math.floor(sy(W + 3, gate0 - 1, 7))]);
  parts.torches.push([Math.floor(sx(W + 3, gate1 + 1)), Math.floor(sy(W + 3, gate1 + 1, 7))]);
  if (tier >= 2) {
    P.pole(parts, W + 2, gate0 - 4, 0, gh + 8, 4, 4);
    P.pole(parts, W + 2, gate1 + 4, 0, gh + 8, 4, 4);
  }
  parts.arts.push(P.finish(W + GATE_V + 6));
  if (tier >= 3) {
    P.reset();
    towerAt(W - 4, W - 4, front);
    parts.arts.push(P.finish(W * 2 + 4));
  }
  // Sakamogi: sharpened stakes before the walls against the charge (from level 3).
  if (a.level >= 3) {
    P.reset();
    for (let v = 8; v < W; v += 6) {
      if (Math.abs(v - GATE_V) < 16) continue;
      line3(P.px, v3(W + 8, v, 0), v3(W + 11, v, 4), st.timber[1]);
      line3(P.px, v3(W + 8, v + 2, 0), v3(W + 11, v + 1, 4), st.timber[2]);
    }
    for (let u = 8; u < W; u += 6) {
      line3(P.px, v3(u, W + 8, 0), v3(u, W + 11, 4), st.timber[1]);
      line3(P.px, v3(u + 2, W + 8, 0), v3(u + 1, W + 11, 4), st.timber[2]);
    }
    parts.arts.push(P.finish(W * 2 + 30));
  }
  return parts;
}

// ------------------------------------------------------------------ registration

registerKit('samurai', (P, key, a, parts) => {
  const tier = tierOf(a.level);
  switch (key) {
    case 'walls':
      return tier === 0 ? null : walls(P, a, parts);
    case 'keep':
      keep(P, Math.max(1, tier), parts);
      return true;
    case 'chapter':
      chapter(P, tier, parts);
      return true;
    case 'barracks':
      barracks(P, tier, parts);
      return true;
    case 'range':
      range(P, tier, a.level, parts);
      return true;
    case 'granary':
      granary(P, tier, a.level, parts);
      return true;
    case 'stables':
      stables(P, tier, parts);
      return true;
    case 'workshop':
      workshop(P, tier, parts);
      return true;
    case 'hospital':
      hospital(P, tier, parts);
      return true;
  }
  return null;
});

/** The mill's place outside the walls: a water-raising wheel would need a stream; a fire-watch tower instead. */
registerMill('samurai', samuraiMill);
function samuraiMill(P: Painter, level: number): null {
  const st = P.st;
  const u = 116;
  const v = -46;
  const tier = tierOf(level);
  // A hinomi-yagura (fire-watch tower) by the paddies: four legs, a ladder, a little roof and a bell.
  const hh = tier >= 3 ? 20 : 15;
  for (const [du, dv] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) line3(P.px, v3(u + du * 1.4, v + dv * 1.4, 0), v3(u + du, v + dv, hh), du + dv > 0 ? st.timber[1] : st.timber[2]);
  for (let z = 3; z < hh; z += 4) {
    line3(P.px, v3(u - 3.2, v + 3.2, z), v3(u + 3.2, v + 3.2, z), st.timber[2]);
    line3(P.px, v3(u + 3.2, v - 3.2, z), v3(u + 3.2, v + 3.2, z), st.timber[2]);
  }
  box(P.px, u - 3.5, v - 3.5, hh, 7, 7, 0.8, (f) => lit(st.timber, f, 1));
  for (const [du, dv] of [[-3, 3], [3, 3], [3, -3]] as const) post(P.px, u + du, v + dv, hh, 4, st.timber[1]);
  roofHip(P, u - 3.5, v - 3.5, hh + 4, 7, 7, 3, 1.4);
  box(P.px, u - 0.6, v - 0.6, hh + 1.2, 1.2, 1.2, 1.6, (f) => (f === 'left' ? st.gold : tone(st.gold, 0.35)));
  return null;
}

// The Samurai's lots are the commandery's (LOT); nothing to move.
void LOT;
export type { BuildingKey };
