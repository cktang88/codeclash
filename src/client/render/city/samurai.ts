// The Samurai castle town (jōkamachi), HD only: each building of the commandery's plan rebuilt as
// a Sengoku-period Japanese one, on the same lots and through the same five tiers (lot → rough →
// solid → fortified → grand). References: docs/art-references/samurai-city.md.
//
//   keep      a wooden yakata with a watch-yagura → a tenshu on an ishigaki base, two, three and
//             finally five storeys (Himeji, Matsumoto), with chidori- and kara-hafu gables, gilt
//             shachihoko, a karahafu porch on the entrance tower, raked gravel and stepping stones
//   chapter   the clan shrine: a hokora and torii → honden → haiden and honden, komainu, stone
//             lanterns, an ema rack, offering casks, a bell tower with its bronze bell → a
//             vermilion three-storey pagoda with its sōrin spire (shrine and temple together)
//   barracks  the dōjō: a thatched minka hall → a plastered hall under kawara → a nagaya wing and
//             a corner yagura; the armourer's lean-to at its foot; nobori, fire barrels, firewood
//   range     the kyūdōjō: the shooters' hall (shajō) and the covered sand bank (azuchi) with mato
//   granary   rice store: a takakura on stilts → white kura with namako-kabe and iron doors;
//             tawara bales, a hasa drying rack and a handcart
//   stables   the umaya: a long board-walled stable, its stalls open to the yard
//   workshop  the kaji forge: an open smithy with bellows and a smoke-gable on the ridge
//   hospital  the physician's house: a machiya with kōshi lattice, noren, sudare, potted plants,
//             a wisteria trellis and a kura behind
//   walls     a palisade on an earth bank → dobei (plastered earth wall with a tile coping) → the
//             same on curved ishigaki with corner yagura (ishi-otoshi, sama loopholes) → taller
//             ishigaki and a yagura-mon gate with iron-banded doors
//
// Materials, all at the HD buffer's pixel (k = 2 per world unit): granite ishigaki of fitted
// stones lit on their upper edges with moss in the joints; shikkui plaster lit warm cream and
// shaded blue-lavender, darkened deep under the eaves; black shitamiita clapboards with battens;
// grey kawara in round-tile columns with seams, moss and lichen, a row of end tiles carrying a mon,
// a noshi ridge with onigawara; cypress-bark roofs for the shrine; shrine vermilion as the accent.
// Light: the sun is warm and the shade cool (samurai-props.ts finishLit), the trees dapple what
// is under them, and shōji, lanterns and tōrō glow warm in the eave shadow.

import type { BuildingKey } from '../../../game/city.ts';
import { GATE_V, LOT, painterFor, registerKit, registerMill, row, tierOf, TIER_START, wallHeights, WALL, type BuildingParts, type Painter, type PaintArgs } from './buildings.ts';
import { box, gable, hash, hex, line3, mix, post, sx, sy, tone, v3, type Col, type Facing, type Shader, type V3 } from './pixels.ts';
import { face4, frustum, hip, tri3, type PShader } from './solids.ts';
import type { Ramp } from './style.ts';
import * as S from './samurai-props.ts';
import { emitAt, finishLit, PAL, sunlit } from './samurai-props.ts';

void row;
void painterFor;

/** A window or door cut in a plaster wall, in world units along the face and up from its foot. */
interface Win {
  face: Facing;
  a: number;
  w: number;
  z: number;
  h: number;
  kind?: 'koshi' | 'door' | 'shoji' | 'slit' | 'stall' | 'namako' | 'mushiko' | 'sudare' | 'irondoor' | 'sama';
}

const wrap = (sh: PShader): Shader => (f, _s, _t, p) => sh(f, p);
const lit = (r: Ramp, f: Facing, k = 0): Col => r[Math.min(3, (f === 'left' ? 0 : f === 'top' ? 1 : 2) + k)]!;
const ramp = (a: string, b: string, c: string, d: string): Ramp => [hex(a), hex(b), hex(c), hex(d)];

/** Black-stained shitamiita clapboards (yakisugi): charcoal with a violet cast. */
const BOARD = ramp('#4c4450', '#35303a', '#25212a', '#16141a');
/** The deep cool shadow under the eaves (and the lantern's glow is in it). */
const EAVE = hex('#20225a');
const PAPER: [Col, Col] = [hex('#f2e6c8'), hex('#d4c6a6')];
const PAPER_LIGHT = hex('#ffd690');

// ------------------------------------------------------------------ materials

/**
 * Plaster (shikkui) over black shitamiita: white above, boards below `boards` units, posts and a
 * beam where `frame` > 0, windows and doors cut in with sills and frames, rain streaks below the
 * windows, and the eave's overhang `o` casting a deep cool shadow down the top of the wall.
 */
function plaster(P: Painter, z0: number, h: number, wins: Win[] = [], boards = 0, daub = false, o = 2, frame = 0): PShader {
  const st = P.st;
  const k = P.k;
  const wall = daub ? st.daub : st.fine;
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    const ap = Math.floor(along * k);
    const zp = Math.floor(zz * k);
    const es = o * (f === 'left' ? 0.75 : 1.05) + 0.4;
    const shade = zz > h - es;
    const dark = (c: Col) => (shade ? mix(c, EAVE, f === 'left' ? 0.42 : 0.3) : c);
    for (const w of wins) {
      if (w.face !== f) continue;
      const ia = along >= w.a && along < w.a + w.w;
      const iz = zz >= w.z && zz < w.z + w.h;
      const xa = Math.floor((along - w.a) * k);
      const xz = Math.floor((zz - w.z) * k);
      const ww = Math.round(w.w * k);
      const wh = Math.round(w.h * k);
      if (ia && iz) {
        switch (w.kind) {
          case 'door': {
            // Planks with dark joints, two iron bands with rivet heads, a ring pull.
            if (xa === 0 || xa === ww - 1) return dark(lit(st.timber, f, 2));
            const band = Math.abs(xz - Math.floor(wh * 0.25)) < 1 || Math.abs(xz - Math.floor(wh * 0.7)) < 1;
            if (band) return dark(xa % 3 === 1 ? tone(PAL.iron, -0.25) : PAL.iron);
            if (xa === Math.floor(ww / 2) && xz === Math.floor(wh * 0.45)) return hex('#8a7a5a');
            return dark(xa % 3 === 0 ? lit(st.timber, f, 2) : lit(st.timber, f, 1));
          }
          case 'irondoor': {
            // A kura's door: stepped plaster jambs round a black-lacquered leaf with studs.
            if (xa < 2 || xa >= ww - 2 || xz >= wh - 2) return dark(xa === 1 || xa === ww - 2 || xz === wh - 2 ? lit(wall, f, 1) : lit(wall, f));
            if (xa === Math.floor(ww / 2)) return hex('#141216');
            if (xz % 4 === 1 && xa % 3 === 1) return hex('#8a7448');
            return dark(f === 'left' ? hex('#2e2a30') : hex('#222026'));
          }
          case 'stall': {
            // An open shop front: a raised board floor with wares, the dark shop behind, lit.
            if (zz < w.h * 0.4) {
              if (xz === Math.floor(w.h * 0.4 * k) - 1) return lit(st.timber, f, 0);
              const n = hash(xa >> 1, xz >> 1, 7);
              return n < 0.18 ? PAL.straw[1]! : n < 0.28 ? PAL.red[1]! : n < 0.36 ? PAL.indigo[1]! : lit(st.timber, f, 1);
            }
            if (xa % 5 === 0) return lit(st.timber, f, 2);
            return P.glassAt(p, st.glass);
          }
          case 'shoji': {
            // Paper screens in a wooden grid: they glow warm in the eave shade, and at night.
            if (xa % 3 === 0 || xz % 4 === 0) return dark(lit(st.timber, f, 1));
            return emitAt(P, p, f === 'left' ? PAPER[0] : PAPER[1], PAPER_LIGHT);
          }
          case 'sudare': {
            // A bamboo blind rolled two-thirds down: fine horizontal slats with cords; the dark
            // room shows under it.
            if (xz < Math.floor(wh * 0.3)) return P.glassAt(p, st.glass);
            if (xa % 5 === 2) return dark(hex('#5a4630'));
            return dark(xz % 2 ? PAL.bamboo[f === 'left' ? 0 : 1]! : PAL.bamboo[f === 'left' ? 1 : 2]!);
          }
          case 'mushiko':
            // Mushiko-mado: thick plastered bars with dark slots between.
            return xa % 3 === 2 ? P.glassAt(p, st.glass) : dark(lit(wall, f, xa % 3 === 1 ? 1 : 0));
          case 'sama':
          case 'slit': {
            // Sama: a triangle (yazama) or square loophole, dark, with a lit lower lip.
            const tri = w.kind === 'sama' && Math.floor(w.a) % 2 === 0;
            if (tri && Math.abs(xa - ww / 2 + 0.5) > xz * 0.6 + 0.4) return dark(lit(wall, f));
            return xz === 0 ? lit(wall, f, 1) : st.glass;
          }
          case 'namako':
            break;
          default:
            // Kōshi windows: wooden bars over a dark opening that lights at night.
            if (xa % 2 === 0) return dark(lit(st.timber, f, 0));
            return P.glassAt(p, st.glass);
        }
      }
      if (w.kind === 'namako' || w.kind === 'stall' || w.kind === 'irondoor') continue;
      // A frame round windows (doors have a heavy lintel only), a lit sill under each.
      const fa = along >= w.a - 0.5 && along < w.a + w.w + 0.5;
      if (w.kind === 'door') {
        if (fa && zz >= w.z + w.h && zz < w.z + w.h + 0.6) return dark(lit(st.timber, f, 1));
        continue;
      }
      if (fa && zz >= w.z - 0.5 && zz < w.z) return zp === Math.floor((w.z - 0.5) * k) ? dark(lit(st.timber, f, 2)) : dark(lit(wall, f, -1 + 1));
      if (fa && zz >= w.z - 0.5 && zz < w.z + w.h + 0.5) return dark(lit(st.timber, f, 2));
      // Rain streaks from the sill down.
      if (!boards && along >= w.a + w.w * 0.3 && along < w.a + w.w * 0.3 + 0.5 && zz < w.z - 0.5 && zz > w.z - 3 && hash(Math.floor(w.a), 3) < 0.7) {
        return dark(tone(lit(wall, f), 0.1));
      }
    }
    let c = lit(wall, f);
    // Namako-kabe: square tiles set on the diagonal, raised white joints lit on their upper edge.
    for (const w of wins)
      if (w.kind === 'namako' && w.face === f && along >= w.a && along < w.a + w.w && zz >= w.z && zz < w.z + w.h) {
        const x = Math.floor(along * k);
        const y = zp;
        const d1 = (((x + y) % 8) + 8) % 8;
        const d2 = (((x - y) % 8) + 8) % 8;
        if (d1 < 2 || d2 < 2) c = d1 === 1 || d2 === 1 ? lit(st.fine, f, 1) : lit(st.fine, f);
        else c = (d1 + d2) % 8 < 3 ? lit(st.slate, f, 0) : lit(st.slate, f, 1);
      }
    if (boards > 0 && zz < boards) {
      // Shitamiita: overlapping horizontal boards, each lit on its lower lip and shadowed under
      // the next, with vertical battens every two units; some boards bleached.
      const r = zp % 3;
      const bi = Math.floor(zp / 3);
      c = lit(BOARD, f, r === 0 ? 1 : 0);
      if (r === 2) c = tone(c, -0.08);
      if (hash(ap >> 3, bi, 5) < 0.12) c = tone(c, -0.12);
      const bt = ((ap % (2 * k * 2)) + 2 * k * 2) % (2 * k * 2);
      if (bt === 0) c = lit(BOARD, f, -1 + 1);
      else if (bt === 1) c = lit(BOARD, f, 2);
      if (zp >= Math.floor(boards * k) - 2) c = zp === Math.floor(boards * k) - 1 ? lit(BOARD, f, 0) : lit(BOARD, f, 2);
    } else if (frame > 0) {
      // Posts (hashira) and a tie-beam (nagéshi) of dark timber standing proud of the plaster.
      const fp = Math.round(frame * k);
      const pm = ((ap % fp) + fp) % fp;
      const beam = Math.floor(h * 0.58 * k);
      if (pm < 2) c = pm === 0 ? lit(st.timber, f, 0) : lit(st.timber, f, 1);
      else if (zp === beam || zp === beam + 1) c = zp === beam + 1 ? lit(st.timber, f, 0) : lit(st.timber, f, 1);
      else if (zp === beam - 1) c = tone(c, 0.12);
    }
    // A splash of dirt along the foot of the plaster.
    if (!boards && zz < 0.6) c = mix(c, hex('#8a7a62'), 0.35);
    if (shade) return mix(c, EAVE, zz > h - 0.6 ? 0.64 : f === 'left' ? 0.5 : 0.38);
    return sunlit(c, p, f);
  };
}

/**
 * Kawara: columns of round tiles (lit edge, crown, shaded side, the flat tile's trough) with a
 * seam where each overlaps the next, bleached and dark tiles, moss in the troughs, lichen spots;
 * at the eave a dark fascia line and a row of round end tiles each carrying a mon.
 */
function kawara(P: Painter, eave: number, r?: Ramp, seed = 0): PShader {
  const k = P.k;
  const rp = r ?? P.st.slate;
  return (f, p) => {
    const along = f === 'left' ? p.u : f === 'right' ? p.v : p.u - p.v;
    const ap = Math.floor(along * k);
    const col = ((ap % 4) + 4) % 4;
    const tz = Math.floor((p.z - eave) * k);
    const base = f === 'left' ? rp[0] : f === 'right' ? rp[2] : rp[1];
    if (tz <= 0) return tone(rp[3], 0.15);
    if (tz <= 2) {
      // Nokigawara: the round end tiles, the mon in the middle of each.
      if (col === 3) return tone(base, 0.5);
      if (col === 1 && tz === 2) return tone(base, 0.32);
      return tone(base, f === 'right' ? -0.12 : -0.2);
    }
    let c = col === 0 ? tone(base, f === 'right' ? -0.05 : -0.14) : col === 1 ? base : col === 2 ? tone(base, 0.16) : tone(base, 0.36);
    if (tz % 4 === 3 && col < 3) c = tone(c, 0.24);
    const tile = hash(ap >> 2, tz >> 2, seed);
    if (tile < 0.07) c = tone(c, -0.08);
    else if (tile > 0.95) c = tone(c, 0.12);
    const m = hash(ap >> 3, tz >> 3, seed + 5);
    if (m < 0.09 && col >= 2) c = mix(c, f === 'right' ? hex('#4a5a30') : PAL.moss, 0.75);
    else if (hash(ap >> 1, tz >> 1, seed + 9) < 0.012) c = hex('#b8b078');
    return sunlit(c, p, f);
  };
}

/** Cypress-bark or straw: fine horizontal courses, a thick clipped eave. */
function bark(P: Painter, eave: number, r: Ramp): PShader {
  const k = P.k;
  return (f, p) => {
    const base = f === 'left' ? r[0] : f === 'right' ? r[2] : r[1];
    let c = base;
    const zp = Math.floor((p.z - eave) * k);
    if (zp % 3 === 0) c = tone(c, 0.16);
    if (hash(Math.floor((f === 'left' ? p.u : p.v) * k / 2), zp >> 2, 5) < 0.12) c = tone(c, -0.08);
    if (hash(Math.floor((f === 'left' ? p.u : p.v) * k / 4), zp >> 3, 8) < 0.05) c = mix(c, PAL.moss, 0.6);
    if (p.z - eave < 0.7) c = zp === 0 ? tone(r[3], 0.1) : tone(r[0], f === 'left' ? -0.15 : 0.05);
    return sunlit(c, p, f);
  };
}

/**
 * Ishigaki: fitted granite in uneven courses. Each stone is lit along its upper and left edges and
 * shadowed under, the joints are dark, moss and a weed grow in the low joints, and the corner is
 * laid in long and short blocks alternating (sangi-zumi). `corner` is the along-coordinate of the
 * visible corner on each face (u for the left face, v for the right), if any.
 */
function ishigaki(P: Painter, seed: number, corner?: { left: number; right: number }): PShader {
  const st = P.st;
  const k = P.k;
  const STONE: Ramp = ramp('#c6bca4', '#9c9380', '#72707c', '#4a4854');
  return (f, p) => {
    if (f === 'top') return sunlit(tone(STONE[1], 0.04), p, 'top');
    const along = f === 'left' ? p.u : p.v;
    const zp = Math.floor(p.z * k);
    // Course heights 4-7 px, by hash.
    let rw = 0;
    let z0 = 0;
    let rh = 5;
    for (;;) {
      rh = 4 + Math.floor(hash(rw, seed, 1) * 4);
      if (zp < z0 + rh) break;
      z0 += rh;
      rw++;
      if (rw > 60) break;
    }
    const inRow = zp - z0;
    let ap = along * k;
    let bw: number;
    let blk: number;
    let inBlk: number;
    const cn = corner ? (f === 'left' ? corner.left : corner.right) : null;
    const dc = cn === null ? 99 : (cn - along) * k;
    if (dc >= 0 && dc < 14) {
      // Sangi-zumi: on alternate courses the corner stone is long on this face, short on the other.
      const long = (rw + (f === 'left' ? 0 : 1)) % 2 === 0;
      const cw = long ? 12 : 6;
      blk = dc < cw ? -1 : -2;
      inBlk = dc < cw ? cw - 1 - Math.floor(dc) : 99;
      bw = cw;
      if (blk === -2) {
        ap += hash(rw, seed, 3) * 9;
        bw = 6 + Math.floor(hash(rw, seed, 2) * 6);
        blk = Math.floor(ap / bw);
        inBlk = ap - blk * bw;
      }
    } else {
      ap += hash(rw, seed, 3) * 9;
      bw = 5 + Math.floor(hash(rw, seed, 2) * 7);
      blk = Math.floor(ap / bw);
      inBlk = ap - blk * bw;
    }
    const n = hash(blk, rw, seed);
    let c = f === 'left' ? STONE[1] : STONE[2];
    if (n < 0.22) c = tone(c, -0.06);
    else if (n > 0.8) c = tone(c, 0.08);
    if (blk === -1) c = f === 'left' ? tone(STONE[0], 0.04) : tone(STONE[1], 0.12);
    const lift = hash(blk, rw, seed + 2) < 0.35 ? 1 : 0;
    const joint = inRow < 1 + lift || inBlk < 1;
    if (joint) {
      c = f === 'left' ? hex('#3a3640') : hex('#2a2632');
      if (rw < 5 && hash(blk, rw, seed + 9) < 0.45 - rw * 0.06) c = f === 'left' ? PAL.moss : hex('#4a5428');
    } else if (inRow === 1 + lift || inBlk < 2) c = f === 'left' ? tone(c, -0.14) : tone(c, -0.06);
    else if (inRow === rh - 1) c = tone(c, 0.14);
    // Moss creeping over the faces of the lowest stones, from their upper edges.
    if (!joint && rw < 3 && hash(blk, rw, seed + 11) < 0.3 && inRow > rh - 3 + rw) c = mix(c, f === 'left' ? PAL.moss : hex('#3e4a26'), 0.7);
    // A weed or a fern in a joint near the foot.
    if (rw < 2 && inRow < 3 && hash(blk, rw, seed + 4) < 0.08 && inBlk < 3) c = PAL.leaf[inRow === 0 ? 1 : 0]!;
    void st;
    return sunlit(c, p, f);
  };
}

/**
 * A curved ishigaki base: three battered courses, the lowest leaning most and the top nearly
 * upright (the fan slope, ōgi-no-kōbai), so the wall flares out at its foot.
 */
function stoneBase(P: Painter, u0: number, v0: number, lu: number, lv: number, h: number, inset: number, seed: number, top = true): void {
  const sh = ishigaki(P, seed, { left: u0 + lu, right: v0 + lv });
  const parts = [0.4, 0.33, 0.27];
  const lean = [0.55, 0.3, 0.15];
  let z = 0;
  let i0 = 0;
  for (let i = 0; i < 3; i++) {
    const hh = h * parts[i]!;
    const di = inset * lean[i]!;
    frustum(P.px, u0 + i0, v0 + i0, z, lu - 2 * i0, lv - 2 * i0, hh, di, (f, p) => sh(f, p), top && i === 2);
    z += hh;
    i0 += di;
  }
  if (h >= 2.5) {
    const n = 2 + Math.floor(hash(seed, 7) * 2);
    for (let j = 0; j < n; j++) {
      const wl = 3 + hash(seed, j, 8) * 5;
      if (lu > wl + 2) S.ivyUp(P, 'left', v0 + lv, u0 + 1 + hash(seed, j, 9) * (lu - wl - 2), wl, h * 0.9, inset, seed + j);
      if (lv > wl + 2 && hash(seed, j, 10) < 0.6) S.ivyUp(P, 'right', u0 + lu, v0 + 1 + hash(seed, j, 11) * (lv - wl - 2), wl, h * 0.9, inset, seed + j + 5);
    }
  }
}

// ------------------------------------------------------------------ parts

/**
 * A noshi ridge: a stack of tiles with white mortar lines under a round cap, from a to b (along u
 * or v), and an onigawara (a demon-faced end tile, flaring) at each end unless shachi stand there.
 */
function noshi(P: Painter, a: V3, b: V3, r: Ramp, oni = true): void {
  const st = P.st;
  const alongU = Math.abs(b.u - a.u) > Math.abs(b.v - a.v);
  const len = alongU ? b.u - a.u : b.v - a.v;
  if (len <= 0.2) return;
  const w = 1.2;
  const h = 1.5;
  const z0 = a.z - 0.3;
  box(P.px, alongU ? a.u : a.u - w / 2, alongU ? a.v - w / 2 : a.v, z0, alongU ? len : w, alongU ? w : len, h, (f, _s, _t, p) => {
    const zq = Math.floor((p.z - z0) * P.k);
    if (f === 'top') return tone(r[0], -0.1);
    if (zq >= Math.floor(h * P.k) - 1) return f === 'left' ? tone(r[0], -0.06) : r[1];
    if (zq % 2 === 0) return f === 'left' ? st.fine[1] : st.fine[2];
    return f === 'left' ? r[1] : r[2];
  });
  if (!oni) return;
  for (const e of [a, b]) {
    const ou = alongU ? e.u - 0.8 : e.u - 1;
    const ov = alongU ? e.v - 1 : e.v - 0.8;
    box(P.px, ou, ov, z0 - 0.1, alongU ? 1.6 : 2, alongU ? 2 : 1.6, 1.9, (f, _s, t) => {
      if (f === 'top') return r[1];
      const tq = Math.floor(t * P.k);
      if (tq === Math.floor(1.9 * P.k) - 1) return r[0];
      return f === 'left' ? tone(r[2], 0.1) : r[3];
    });
    // Its flaring ears, a lit pixel each side.
    P.px.point(v3(ou, ov, z0 + 1.9), r[0]);
    P.px.point(v3(ou + (alongU ? 1.6 : 2), ov + (alongU ? 2 : 1.6), z0 + 1.9), r[0]);
  }
}

/** A short hip ridge (sumimune) from the eave corner up to the ridge: a light top line over a dark one. */
function hipRidge(P: Painter, from: V3, to: V3, r: Ramp): void {
  line3(P.px, v3(from.u, from.v, from.z + 0.2), v3(to.u, to.v, to.z + 0.2), tone(r[3], 0.05));
  line3(P.px, v3(from.u, from.v, from.z + 0.7), v3(to.u, to.v, to.z + 0.7), tone(r[0], -0.08));
  // The corner tile turned up at the tip (the sumi-onigawara), two pixels.
  P.px.point(v3(from.u, from.v, from.z + 1.2), r[0]);
  P.px.point(v3(from.u, from.v, from.z + 0.8), tone(r[3], 0.05));
}

/**
 * The eave's edge seen from below: a dark fascia (kayaoi) under the tiles' lip and the ends of the
 * rafters (taruki) in a row, lit on the sunny side, along the two eaves that face the viewer.
 */
function eaveEdge(P: Painter, u0: number, v0: number, lu: number, lv: number, o: number, zl: number): void {
  const st = P.st;
  const a = v3(u0 - o, v0 + lv + o, zl);
  const b = v3(u0 + lu + o, v0 + lv + o, zl);
  const c = v3(u0 + lu + o, v0 - o, zl);
  for (const [p0, p1, side] of [[a, b, 'left'], [c, b, 'right']] as const) {
    line3(P.px, v3(p0.u, p0.v, p0.z - 0.3), v3(p1.u, p1.v, p1.z - 0.3), st.timber[3]);
    const len = side === 'left' ? p1.u - p0.u : p1.v - p0.v;
    for (let i = 0.5; i < len - 0.3; i += 1) {
      const p = side === 'left' ? v3(p0.u + i, p0.v - 0.2, p0.z - 0.8) : v3(p0.u - 0.2, p0.v + i, p0.z - 0.8);
      P.px.point(p, side === 'left' ? hex('#c8a882') : st.timber[1]);
    }
  }
}

/** A hipped kawara roof: tiles, a noshi ridge with onigawara or shachi, hip ridges and the eave's edge. */
function roofHip(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, shachi = false, r?: Ramp): void {
  const rp = r ?? P.st.slate;
  hip(P.px, u0, v0, z, lu, lv, rh, o, kawara(P, z - o * 0.6, r, Math.round(u0 * 3 + v0)), 0.6);
  const zr = z + rh;
  const zl = z - o * 0.6;
  eaveEdge(P, u0, v0, lu, lv, o, zl);
  if (lu >= lv) {
    const vm = v0 + lv / 2;
    const d = lv / 2;
    hipRidge(P, v3(u0 + lu + o, v0 + lv + o, zl), v3(u0 + lu - d, vm, zr), rp);
    hipRidge(P, v3(u0 - o, v0 + lv + o, zl), v3(u0 + d, vm, zr), rp);
    noshi(P, v3(u0 + d, vm, zr), v3(u0 + lu - d, vm, zr), rp, !shachi);
    if (shachi) for (const u of [u0 + d, u0 + lu - d]) shachiAt(P, u, vm, zr + 1);
  } else {
    const um = u0 + lu / 2;
    const d = lu / 2;
    hipRidge(P, v3(u0 + lu + o, v0 + lv + o, zl), v3(um, v0 + lv - d, zr), rp);
    hipRidge(P, v3(u0 + lu + o, v0 - o, zl), v3(um, v0 + d, zr), rp);
    noshi(P, v3(um, v0 + d, zr), v3(um, v0 + lv - d, zr), rp, !shachi);
    if (shachi) for (const v of [v0 + d, v0 + lv - d]) shachiAt(P, um, v, zr + 1);
  }
}

/**
 * A gilt shachihoko: the tiger-headed carp that guards the ridge against fire, head down on the
 * ridge, tail flung up, fins out; 9 by 12 buffer pixels, gold lit on its left.
 */
const SHACHI = [
  '...gg....',
  '..gGg....',
  '...gg.g..',
  '....gGg..',
  '....gg...',
  '...gGg...',
  '..ggGgg..',
  '.gGGggd..',
  '.gGggdd..',
  '..gggdd..',
  '.dgGgd...',
  'ddgggd...',
];
function shachiAt(P: Painter, u: number, v: number, z: number): void {
  const g = P.st.gold;
  const G = tone(g, -0.3);
  const d = tone(g, 0.35);
  const x = Math.floor(P.px.X(u, v)) - 4;
  const y = Math.floor(P.px.Y(u, v, z)) - SHACHI.length;
  const dep = u + v + z + 4;
  SHACHI.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      P.px.plot(x + i, y + j, dep, ch === 'G' ? G : ch === 'd' ? d : g);
    }
  });
}

/**
 * Irimoya: a hip roof whose upper part is a gable. The gable end faces +u (or +v) with a white
 * triangle, barge boards, a shadow under them and a gilt fish-fin (gegyo).
 */
function irimoya(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, rh: number, o: number, shachi = false, r?: Ramp, sh?: PShader): void {
  const rp = r ?? P.st.slate;
  const zl = z - o * 0.6;
  hip(P.px, u0, v0, z, lu, lv, rh * 0.62, o, sh ?? kawara(P, zl, r, Math.round(u0 * 3 + v0)), 0.6);
  eaveEdge(P, u0, v0, lu, lv, o, zl);
  const zg = z + rh * 0.45;
  const alongU = lu >= lv;
  const roof = sh ?? kawara(P, zg - 1, r, Math.round(u0 + v0 * 3));
  const gh = rh * 0.55;
  if (alongU) {
    const lv2 = lv * 0.55;
    const vb = v0 + (lv - lv2) / 2;
    const ga = u0 + lv * 0.18;
    const gl = lu - lv * 0.36;
    gable(P.px, ga, vb, zg, gl, lv2, gh, true, 0.8, wrap(roof), wrap(gableFace(P, zg)));
    gableDepth(P, (a, zz) => v3(ga + gl, vb + lv2 / 2 + a, zz), lv2, zg, gh);
    hipRidge(P, v3(u0 + lu + o, v0 + lv + o, zl), v3(ga + gl, vb + lv2 + 0.8, zg - 0.5), rp);
    noshi(P, v3(ga, vb + lv2 / 2, zg + gh), v3(ga + gl, vb + lv2 / 2, zg + gh), rp, !shachi);
    if (shachi) for (const u of [ga, ga + gl]) shachiAt(P, u, v0 + lv / 2, zg + gh + 1);
  } else {
    const lu2 = lu * 0.55;
    const ub = u0 + (lu - lu2) / 2;
    const ga = v0 + lu * 0.18;
    const gl = lv - lu * 0.36;
    gable(P.px, ub, ga, zg, lu2, gl, gh, false, 0.8, wrap(roof), wrap(gableFace(P, zg)));
    gableDepth(P, (a, zz) => v3(ub + lu2 / 2 + a, ga + gl, zz), lu2, zg, gh);
    hipRidge(P, v3(u0 + lu + o, v0 + lv + o, zl), v3(ub + lu2 + 0.8, ga + gl, zg - 0.5), rp);
    noshi(P, v3(u0 + lu / 2, ga, zg + gh), v3(u0 + lu / 2, ga + gl, zg + gh), rp, !shachi);
    if (shachi) for (const v of [ga, ga + gl]) shachiAt(P, u0 + lu / 2, v, zg + gh + 1);
  }
}

/** A gable's triangle: white plaster over a band of dark lattice (kitsune-gōshi) and a tie-beam. */
function gableFace(P: Painter, z0: number): PShader {
  const st = P.st;
  return (f, p) => {
    const zz = p.z - z0;
    if (zz < 0.6) return lit(st.timber, f, 1);
    const along = Math.floor((f === 'left' ? p.u : p.v) * P.k);
    if (zz < 2) return along % 2 ? lit(st.timber, f, 2) : lit(st.timber, f, 0);
    return lit(st.fine, f);
  };
}

/** A chidori-hafu: a small triangular gable dormer standing on a roof slope, facing left or right. */
function hafu(P: Painter, u: number, v: number, z: number, w: number, h: number, faceLeft: boolean): void {
  const face = gableFace(P, z);
  const roof = kawara(P, z);
  const d = w * 0.6;
  if (faceLeft) {
    face4(P.px, v3(u - w / 2 - 0.5, v, z - 0.4), v3(u, v, z + h + 0.3), v3(u, v - d, z + h + 0.3), v3(u - w / 2 - 0.5, v - d, z - 0.4), 'back', roof);
    face4(P.px, v3(u + w / 2 + 0.5, v, z - 0.4), v3(u, v, z + h + 0.3), v3(u, v - d, z + h + 0.3), v3(u + w / 2 + 0.5, v - d, z - 0.4), 'left', roof);
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
  for (const d of [0.55, 1.0, 1.45]) {
    const c = mix(st.fine[2], EAVE, d > 1.2 ? 0.2 : d > 0.6 ? 0.4 : 0.55);
    L(-w / 2 + d * 1.2, z + 0.1, 0, z + h - d * 1.1, c, 0, 0.12);
    L(w / 2 - d * 1.2, z + 0.1, 0, z + h - d * 1.1, c, 0, 0.12);
  }
  for (const [dz, c] of [[0, st.timber[3]], [0.5, st.timber[2]], [1.0, st.fine[1]]] as const) {
    L(-w / 2 - 0.5, z - 0.4, 0, z + h + 0.1, c, dz, 0.3);
    L(w / 2 + 0.5, z - 0.4, 0, z + h + 0.1, c, dz, 0.3);
  }
  L(-w / 2 + 0.4, z + 0.6, w / 2 - 0.4, z + 0.6, st.timber[2], 0, 0.2);
  P.px.point(lift(at(0, z + h - 0.9), 0, 0.35), st.gold);
  P.px.point(lift(at(0, z + h - 1.4), 0, 0.35), tone(st.gold, 0.3));
  P.px.point(lift(at(-0.5, z + h - 1.2), 0, 0.35), tone(st.gold, 0.15));
  P.px.point(lift(at(0.5, z + h - 1.2), 0, 0.35), tone(st.gold, 0.15));
}

/**
 * A karahafu: the cusped, bow-shaped gable of a porch or gate. The tiled roof band follows a
 * curve high in the middle that dips and flicks up at the ends; under it a white-and-gold barge
 * board and a dark gable. Faces +v (left) or +u (right) from the plane at (u, v); runs `d` back.
 */
function karahafu(P: Painter, u: number, v: number, z: number, w: number, h: number, d: number, faceLeft: boolean): void {
  const st = P.st;
  const r = st.slate;
  const at = (a: number, zz: number, back = 0) => (faceLeft ? v3(u + a, v - back, zz) : v3(u - back, v + a, zz));
  const prof = (a: number) => {
    const t = Math.min(1, Math.abs(a) / (w / 2));
    return h * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.08))) + (t > 0.82 ? (t - 0.82) * 4 : 0);
  };
  const stp = 0.5 / P.k;
  for (let a = -w / 2 - 0.6; a <= w / 2 + 0.6; a += stp) {
    const y = z + prof(a);
    // The roof band running back: tiles in columns.
    for (let b = 0; b <= d; b += stp) {
      const col = Math.floor((a + w) * P.k) % 4;
      const c0 = faceLeft ? r[0] : r[2];
      const c = col === 3 ? tone(c0, 0.35) : col === 2 ? tone(c0, 0.15) : c0;
      P.px.point(at(a, y + 1.2 + b * 0.05, b), sunlit(c, at(a, y, b), faceLeft ? 'left' : 'right'));
    }
    // The front: end tiles, the white barge board with a gilt line, the dark gable under it.
    P.px.point(at(a, y + 1.2, -0.05), tone(r[0], -0.2));
    P.px.point(at(a, y + 0.7, -0.05), st.fine[0]);
    P.px.point(at(a, y + 0.2, -0.05), Math.abs(a) < w / 2 - 0.3 ? st.gold : st.fine[1]);
    for (let zz = z; zz < y - 0.2; zz += stp) P.px.point(at(a, zz, 0.2), zz > y - 1.2 ? EAVE : lit(st.timber, faceLeft ? 'left' : 'right', 1));
  }
  // The gilt ornament at the crown (a hanging gegyo).
  P.px.point(at(0, z + h - 0.4, -0.1), st.gold);
  P.px.point(at(0, z + h - 0.9, -0.1), tone(st.gold, 0.3));
}

/** Windows spaced along a face. */
function wins(face: Facing, from: number, len: number, n: number, z: number, w = 2.5, h = 2.5, kind: Win['kind'] = 'koshi'): Win[] {
  const out: Win[] = [];
  for (let i = 0; i < n; i++) out.push({ face, a: from + ((i + 0.5) * len) / n - w / 2, w, z, h, kind });
  return out;
}

/** A plastered box with a roof (the town's basic building): returns nothing; paints into P. */
function house(
  P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, h: number,
  ws: Win[], roof: 'kawara' | 'thatch' | 'bark' | 'irimoya', opts: { boards?: number; daub?: boolean; plank?: boolean; rh?: number; o?: number; frame?: number } = {},
): void {
  const st = P.st;
  const abs = ws.map((w) => ({ ...w, a: w.a + (w.face === 'left' ? u0 : v0) }));
  const rh = opts.rh ?? Math.min(lu, lv) * 0.5;
  const o = opts.o ?? 2;
  const sh = opts.plank ? planks(P, z, h, abs, o) : plaster(P, z, h, abs, opts.boards ?? 0, opts.daub, o, opts.frame ?? 0);
  box(P.px, u0, v0, z, lu, lv, h, wrap(sh), false);
  if (roof === 'kawara') roofHip(P, u0, v0, z + h, lu, lv, rh * 0.8, o);
  else if (roof === 'irimoya') irimoya(P, u0, v0, z + h, lu, lv, rh, o);
  else if (roof === 'bark') irimoya(P, u0, v0, z + h, lu, lv, rh, o, false, st.shingle, bark(P, z + h, st.shingle));
  else hip(P.px, u0, v0, z + h, lu, lv, rh * 1.15, o + 0.5, bark(P, z + h - o * 0.6, st.thatch), 0.5);
}

/** Dark weathered boards (barns, stables, the poor): vertical planks with battens, deep eave shade. */
function planks(P: Painter, z0: number, h: number, ws: Win[], o = 2): PShader {
  const st = P.st;
  const k = P.k;
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    const shade = zz > h - (o * 0.8 + 0.4);
    for (const w of ws)
      if (w.face === f && along >= w.a && along < w.a + w.w && zz >= w.z && zz < w.z + w.h) {
        if (w.kind === 'stall' && zz < w.h * 0.45) return lit(st.timber, f, 1);
        if (w.kind === 'shoji') return Math.floor((along - w.a) * k) % 3 === 0 ? lit(st.timber, f, 2) : emitAt(P, p, f === 'left' ? PAPER[0] : PAPER[1], PAPER_LIGHT);
        return w.kind === 'door' || w.kind === 'stall' ? st.glass : P.glassAt(p, st.glass);
      }
    const ap = Math.floor(along * k);
    let c = ap % 3 === 0 ? lit(st.timber, f, 1) : lit(st.timber, f);
    if (ap % 3 === 1 && f === 'left') c = tone(c, -0.06);
    if (hash(ap >> 1, Math.floor(zz * k) >> 3, 4) < 0.08) c = tone(c, -0.1);
    const zq = Math.floor(zz * k);
    if (zq === Math.floor(h * k * 0.5) || zq === 1) c = lit(st.timber, f, 2);
    if (shade) return mix(c, EAVE, f === 'left' ? 0.4 : 0.3);
    return sunlit(c, p, f);
  };
}

/** A torii: two vermilion pillars on black feet, the nuki, the black kasagi curving up at the ends, a shimenawa. */
function torii(P: Painter, u: number, v0: number, w: number, h: number, alongV = true): void {
  const st = P.st;
  const red = st.accent;
  const redS = tone(red, 0.3);
  const blk = hex('#221c1e');
  const at = (a: number, z: number) => (alongV ? v3(u, v0 + a, z) : v3(v0 + a, u, z));
  const R = (f: Facing, p: V3) => sunlit(f === 'left' ? red : f === 'top' ? tone(red, -0.1) : redS, p, f);
  for (const a of [1, w - 1]) {
    const p = at(a, 0);
    box(P.px, p.u - 0.6, p.v - 0.6, 0, 1.2, 1.2, h, (f, _s, _t, q) => R(f, q));
    box(P.px, p.u - 0.8, p.v - 0.8, 0, 1.6, 1.6, 0.8, (f) => (f === 'left' ? blk : tone(blk, 0.2)));
  }
  const n0 = at(-0.5, h - 2.6);
  box(P.px, n0.u - 0.4, n0.v, n0.z, alongV ? 0.8 : w + 1, alongV ? w + 1 : 0.8, 0.8, (f, _s, _t, q) => R(f, q));
  // The gakuzuka: the little tablet between the beams.
  const g0 = at(w / 2 - 0.5, h - 1.8);
  box(P.px, g0.u - 0.2, g0.v, g0.z, alongV ? 0.4 : 1, alongV ? 1 : 0.4, 1.8, (f) => (f === 'left' ? hex('#e8dcbc') : blk));
  const k0 = at(-2, h);
  box(P.px, k0.u - 0.7, k0.v, k0.z, alongV ? 1.4 : w + 4, alongV ? w + 4 : 1.4, 0.9, (f, _s, _t, q) => R(f, q));
  box(P.px, k0.u - 0.8, k0.v, k0.z + 0.9, alongV ? 1.6 : w + 4, alongV ? w + 4 : 1.6, 0.8, (f) => (f === 'top' ? tone(blk, -0.2) : blk));
  for (const a of [-2, w + 2]) P.px.point(at(a, h + 1.9), blk);
  for (const a of [-1.6, w + 1.6]) P.px.point(at(a, h + 1.75), blk);
  // The shimenawa slung between the pillars, its shide hanging.
  const l = at(1, h - 3);
  const r = at(w - 1, h - 3);
  S.shimenawa(P, v3(l.u + 0.7, l.v + 0.7, l.z), v3(r.u + 0.7, r.v + 0.7, r.z), 1, 0.9, 3);
}

/** Paper lanterns hung under an eave along a face: the plane `at` (u of a right face, v of a left). */
function lanterns(P: Painter, face: 'left' | 'right', at: number, from: number, len: number, z: number, n: number, red = false): void {
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.5) * len) / n;
    if (face === 'left') S.chochin(P, a, at + 0.9, z, red && i % 2 === 0);
    else S.chochin(P, at + 0.9, a, z, red && i % 2 === 0);
  }
}

/** A noren: indigo cloth panels with slits, hung over a doorway, the house's white mon on them. */
function noren(P: Painter, face: 'left' | 'right', at: number, a0: number, w: number, z: number, cloth: Ramp = PAL.indigo): void {
  const k = P.k;
  for (let a = 0; a < w; a += 0.5 / k)
    for (let dz = 0; dz < 2.2; dz += 0.5 / k) {
      const ai = Math.floor(a * k);
      const panel = Math.floor((a / w) * 3);
      const slit = Math.floor(((a / w) * 3 - panel) * 10) === 0 && panel > 0;
      if (slit && dz < 1.6) continue;
      const mon = Math.hypot(a - w / 2, dz - 1.1) < 0.55 && Math.hypot(a - w / 2, dz - 1.1) > 0.25;
      let c: Col = mon ? hex('#efe8d8') : ai % 6 === 0 ? cloth[2]! : cloth[1]!;
      if (face === 'right' && !mon) c = tone(c, 0.12);
      const p = face === 'left' ? v3(a0 + a, at + 0.5, z - dz) : v3(at + 0.5, a0 + a, z - dz);
      P.px.point(p, c);
    }
}

// ------------------------------------------------------------------ the buildings

function keep(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier <= 1) {
    // A fortified manor (yakata): a timber watch-yagura on a stone footing, a thatched hall.
    stoneBase(P, 21, 21, 18, 18, 3, 0.8, 3);
    house(P, 23, 23, 3, 14, 14, 16, wins('left', 0, 14, 2, 10, 2, 2).concat(wins('right', 0, 14, 2, 10, 2, 2)), 'kawara', { plank: true, rh: 7, o: 1.5 });
    house(P, 40, 18, 0, 14, 26, 8, [{ face: 'right', a: 10, w: 4, z: 0, h: 5, kind: 'door' }, ...wins('left', 2, 10, 2, 3, 2.5, 2.5, 'shoji'), ...wins('right', 16, 8, 1, 3, 3, 2.5, 'shoji')], 'thatch', { daub: true, rh: 8 });
    noren(P, 'right', 54, 28.5, 4, 5);
    P.pole(parts, 30, 30, 36, 8, 4, 4);
    return;
  }
  // A tenshu on its ishigaki, storeys stepping in, each under its own kawara skirt.
  const base = tier === 2 ? 30 : tier === 3 ? 34 : 38;
  const bh = tier === 2 ? 6 : tier === 3 ? 8 : 10;
  const b0 = 36 - base / 2;
  stoneBase(P, b0, b0, base, base, bh, bh * 0.32, 11);
  const storeys: [number, number][] =
    tier === 2 ? [[24, 10], [15, 8]] : tier === 3 ? [[27, 10], [21, 9], [14, 8]] : [[30, 10], [25, 9], [20, 9], [15, 8], [11, 7]];
  const black = tier === 3;
  let z = bh;
  storeys.forEach(([l, h], i) => {
    const u0 = 36 - l / 2;
    const last = i === storeys.length - 1;
    const nw = Math.max(1, Math.floor(l / 6));
    const ws: Win[] = [...wins('left', 0, l, nw, h * 0.42, 2.2, 2.6), ...wins('right', 0, l, nw, h * 0.42, 2.2, 2.6)];
    // Sama loopholes between the windows on the lower storeys.
    if (i === 0) ws.push(...wins('left', l / (2 * nw), l - l / nw, Math.max(1, nw - 1), h * 0.25, 1.2, 1.2, 'sama'), ...wins('right', l / (2 * nw), l - l / nw, Math.max(1, nw - 1), h * 0.25, 1.2, 1.2, 'sama'));
    if (last) ws.push(...wins('left', 0, l, 2, 2, 3, 3, 'shoji'), ...wins('right', 0, l, 2, 2, 3, 3, 'shoji'));
    house(P, u0, u0, z, l, l, h, last ? ws.filter((w) => w.kind === 'shoji') : ws, last ? 'irimoya' : 'kawara', {
      boards: black ? h * 0.4 : 0,
      rh: last ? l * 0.62 : l * 0.2,
      o: last ? 2 : 2.6,
      frame: last ? 3 : 0,
    });
    if (last) {
      // Re-roof the top with gilt shachi on its ridge, a railed lookout under it.
      irimoya(P, u0, u0, z + h, l, l, l * 0.62, 2, true);
      for (let a = 0; a <= l; a += 1) {
        P.px.point(v3(u0 + a, u0 + l + 0.6, z + 1.4), st.timber[1]);
        P.px.point(v3(u0 + l + 0.6, u0 + a, z + 1.4), st.timber[2]);
      }
      line3(P.px, v3(u0, u0 + l + 0.6, z + 1.8), v3(u0 + l + 0.6, u0 + l + 0.6, z + 1.8), st.timber[0]);
      line3(P.px, v3(u0 + l + 0.6, u0, z + 1.8), v3(u0 + l + 0.6, u0 + l + 0.6, z + 1.8), st.timber[1]);
    } else if (i < storeys.length - 2 || tier === 2) {
      // Chidori-hafu on the skirt roofs, facing the town (left and right), each on the slope just
      // above the eave so its white face shows in front of the tiles; a karahafu on the second
      // skirt of the grand keep.
      const o = 2.6;
      const ze = z + h - o * 0.6;
      const ve = u0 + l + o;
      const slope = (l * 0.16 + o * 0.6) / (l / 2 + o);
      const back = 1.6;
      const zf = ze + back * slope;
      const w = Math.min(9, l * 0.36);
      if (tier >= 4 && i === 1) karahafu(P, 36, ve - back + 0.6, zf - 0.6, w, 3.2, 3, true);
      else hafu(P, 36, ve - back, zf, w, 4.2, true);
      if (tier >= 3) hafu(P, ve - back, 36, zf, w, 4.2, false);
    }
    z += h + 2.2;
  });
  // The ishi-otoshi: a projecting bay with a slanted floor at the first storey's corner.
  if (tier >= 3) {
    const l = storeys[0]![0];
    const u0 = 36 - l / 2;
    const zb = bh + 1;
    const c = u0 + l;
    box(P.px, c - 4, c, zb + 1.6, 4, 1.4, 4.4, wrap(plaster(P, zb + 1.6, 4.4, [], black ? 4.4 : 0, false, 2.6)));
    P.px.quad(v3(c - 4, c, zb + 1.6), v3(4, 0, 0), v3(0, 1.4, 1.6), (s) => (Math.floor(s * P.k) % 3 === 0 ? BOARD[3] : BOARD[1]));
  }
  // The entrance tower (tsuke-yagura) at the yard side, with its door under a karahafu porch.
  if (tier >= 3) {
    const tu = b0 + base;
    stoneBase(P, tu - 2, 30, 10, 12, bh * 0.6, 1.2, 12);
    house(P, tu - 1, 31, bh * 0.6, 8, 10, 6, [{ face: 'right', a: 3, w: 4, z: 0, h: 4.5, kind: 'door' }, ...wins('left', 1, 6, 1, 3, 2, 2)], 'kawara', { boards: black ? 3 : 0, rh: 4 });
    karahafu(P, tu + 7.4, 36, bh * 0.6 + 4.6, 6, 1.8, 2.4, false);
  } else {
    box(P.px, b0 + base - 1, 32, 0, 5, 8, bh - 1, wrap(ishigaki(P, 13)));
  }
  P.pole(parts, b0 + base - 2, b0 + base - 2, bh, 14, 4, 4);
}

/**
 * The keep's ground decal: raked gravel round the tenshu with stepping stones to its door, moss
 * at the kerb, petals under the cherries, and the dappled shade of every tree in the town. (The
 * trees, the well and the lanterns are props: samurai-props.ts registers them with props.ts.)
 */
function keepGrounds(P: Painter, tier: number, parts: BuildingParts): void {
  S.decal(P, parts, () => {
    if (tier >= 2) {
      S.gravel(P, 12, 12, 62, 62, true, [[60, 36, 1.2], [62.5, 38.5, 1], [65, 41, 1.2], [67.5, 43, 1]], [[17, 57, 3]]);
      S.tufts(P, 12, 60, 62, 62, 0.6, 3);
    }
    for (const t of S.TREES) if (t.kind === 'sakura') S.petals(P, t.u + 4, t.v - 1, 5, Math.round(t.u));
    S.treeShade(P);
  });
}

function chapter(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const red = st.accent;
  const pillars = (u: number, v: number, l: number, h: number, n: number, alongU: boolean) => {
    for (let i = 0; i <= n; i++) {
      const a = (i * l) / n;
      const p = alongU ? v3(u + a, v, 0) : v3(u, v + a, 0);
      box(P.px, p.u - 0.5, p.v - 0.5, 0, 1, 1, h, (f, _s, _t, q) => sunlit(f === 'left' ? red : tone(red, 0.3), q, f));
    }
  };
  if (tier === 1) {
    // A hokora: a tiny shrine on a stone plinth under a bark roof, with a torii and a rope.
    stoneBase(P, 100, 22, 10, 10, 2, 0.5, 21);
    house(P, 101.5, 23.5, 2, 7, 7, 4, [{ face: 'right', a: 2, w: 3, z: 0.5, h: 3, kind: 'door' }], 'bark', { rh: 5, o: 1.2 });
    torii(P, 122, 24, 7, 8);
    return;
  }
  // Honden (main hall) raised on posts, vermilion frame, white panels, bark roof.
  const big = tier >= 3;
  const hu = tier >= 4 ? 84 : 88;
  const hv = 16;
  const hl = big ? 20 : 18;
  const hw = big ? 18 : 16;
  stoneBase(P, hu - 2, hv - 2, hl + 4, hw + 4, 2, 0.6, 22);
  pillars(hu, hv + hw, hl, 3, 4, true);
  pillars(hu + hl, hv, hw, 3, 4, false);
  box(P.px, hu, hv, 2, hl, hw, 1, (f) => lit(st.timber, f, 1));
  // A railed veranda (engawa) round the hall.
  for (let a = 0; a <= hl; a += 1) P.px.point(v3(hu + a, hv + hw + 1, 3.6), a % 4 === 0 ? red : st.timber[1]);
  for (let a = 0; a <= hw; a += 1) P.px.point(v3(hu + hl + 1, hv + a, 3.6), a % 4 === 0 ? tone(red, 0.3) : st.timber[2]);
  const panel = (f: Facing, p: { u: number; v: number; z: number }) => {
    const along = f === 'left' ? p.u : p.v;
    const ap = Math.floor(along * P.k);
    if (ap % 10 < 2) return f === 'left' ? red : tone(red, 0.3);
    if (Math.floor((p.z - 3) * P.k) % 9 === 0) return f === 'left' ? red : tone(red, 0.3);
    // Gilt hardware at the joints.
    if (ap % 10 === 2 && Math.floor((p.z - 3) * P.k) % 9 === 1) return st.gold;
    return lit(st.fine, f);
  };
  box(P.px, hu, hv, 3, hl, hw, 7, wrap((f, p) => (p.z > 8.6 ? mix(lit(st.fine, f), EAVE, p.z > 9.4 ? 0.6 : 0.4) : sunlit(panel(f, p), v3(p.u, p.v, p.z), f))), false);
  irimoya(P, hu, hv, 10, hl, hw, hw * 0.75, 2.5, false, st.shingle, bark(P, 8, st.shingle));
  // Chigi (crossed finials) and katsuogi logs along the ridge.
  const rz = 10 + hw * 0.75 * 0.45 + hw * 0.75 * 0.55;
  for (let i = 1; i <= 3; i++) box(P.px, hu + (hl * i) / 4 - 0.7, hv + hw / 2 - 0.7, rz - 0.2, 1.4, 1.4, 1.2, (f) => (f === 'left' ? st.gold : tone(st.gold, 0.3)));
  for (const u of [hu + hl * 0.2, hu + hl * 0.8]) {
    line3(P.px, v3(u - 1, hv + hw / 2, rz - 1), v3(u + 1.5, hv + hw / 2, rz + 3), st.timber[1]);
    line3(P.px, v3(u + 1, hv + hw / 2, rz - 1), v3(u - 1.5, hv + hw / 2, rz + 3), st.timber[2]);
  }
  // A shimenawa with shide over the door, a big bell-rope (suzu) hanging.
  S.shimenawa(P, v3(hu + hl + 0.6, hv + 3, 8.8), v3(hu + hl + 0.6, hv + hw - 3, 8.8), 0.9, 0.9, 4);
  if (big) {
    // The haiden (oratory) before it: wider, open-fronted, its gable facing the approach, a
    // karahafu over its step, lanterns under its eaves.
    const au = hu + hl + 4;
    const av = hv - 1;
    const al = 14;
    const aw = hw + 2;
    stoneBase(P, au - 1, av - 1, al + 2, aw + 2, 1.5, 0.4, 23);
    pillars(au, av + aw, al, 6, 3, true);
    pillars(au + al, av, aw, 6, 4, false);
    box(P.px, au, av, 1.5, al, aw, 6.5, wrap((f, p) => {
      if (p.z > 6.4) return mix(lit(st.fine, f), EAVE, 0.5);
      if (f === 'right' && p.z < 6 && p.z > 2) {
        // The open front: a dim hall with the offering box and a glow of lamps inside.
        const a = Math.floor(p.v * P.k);
        if (p.z < 3 && a % 4 < 3) return lit(st.timber, f, 1);
        return a % 9 === 4 && p.z > 4 ? emitAt(P, p, hex('#6a4a30'), hex('#ffb060')) : P.glassAt(p, tone(st.glass, -0.1));
      }
      return sunlit(panel(f, p), v3(p.u, p.v, p.z), f);
    }), false);
    irimoya(P, au, av, 8, al, aw, aw * 0.7, 2.5, false, st.shingle, bark(P, 6, st.shingle));
    karahafu(P, au + al + 2.4, av + aw / 2, 6.6, 7, 2, 2.4, false);
    lanterns(P, 'right', au + al + 1.2, av + 1, aw - 2, 7.4, 3);
    // The bell house (shōrō): four splayed posts on stone, open sides, a bronze bell and its striker log.
    const bu = 128;
    const bv = 12;
    stoneBase(P, bu - 1, bv - 1, 10, 10, 1.6, 0.4, 25);
    for (const [du, dv] of [[0.5, 0.5], [7.5, 0.5], [0.5, 7.5], [7.5, 7.5]] as const) post(P.px, bu + du, bv + dv, 1.6, 8, red, tone(red, 0.3));
    line3(P.px, v3(bu, bv + 8, 8.5), v3(bu + 8, bv + 8, 8.5), red);
    line3(P.px, v3(bu + 8, bv, 8.5), v3(bu + 8, bv + 8, 8.5), tone(red, 0.3));
    S.cyl(P, bu + 4, bv + 4, 4.2, 1.6, 4, (l, t) => {
      const tz = Math.floor(t * P.k);
      // Bands and a grid of nipples (chi) on the bronze.
      if (tz === 2 || tz === 5) return S.step(PAL.bronze, l - 0.4);
      if (tz > 5 && Math.floor((l + 1) * 6) % 2 === 0) return S.step(PAL.bronze, l + 0.3);
      return S.step(PAL.bronze, l);
    });
    line3(P.px, v3(bu + 4, bv + 4, 8.2), v3(bu + 4, bv + 4, 9.4), st.timber[3]);
    line3(P.px, v3(bu + 6, bv + 1, 6.2), v3(bu + 6, bv + 7, 6.2), hex('#b8925e'));
    line3(P.px, v3(bu + 6, bv + 1, 8.6), v3(bu + 6, bv + 1, 6.2), PAL.rope);
    line3(P.px, v3(bu + 6, bv + 7, 8.6), v3(bu + 6, bv + 7, 6.2), PAL.rope);
    irimoya(P, bu, bv, 9.6, 8, 8, 5, 1.8);
    parts.bells.push([Math.floor(sx(bu + 4, bv + 4)), Math.floor(sy(bu + 4, bv + 4, 6))]);
  } else parts.bells.push([Math.floor(sx(hu + hl + 1, hv + hw / 2)), Math.floor(sy(hu + hl + 1, hv + hw / 2, 9))]);
  torii(P, 136, 22, 9, 10);
  if (tier >= 4) {
    // A three-storey pagoda (sanjūnotō): vermilion bays, deep layered eaves with dark bracketing
    // under each, railed balconies, and the gilt sōrin of nine rings with its flame.
    const pu = 125;
    const pv = 28;
    stoneBase(P, pu - 1, pv - 1, 12, 12, 2, 0.5, 24);
    let z = 2;
    for (let i = 0; i < 3; i++) {
      const l = 9 - i * 1.5;
      const o = (10 - l) / 2;
      box(P.px, pu + o, pv + o, z, l, l, 4.5, wrap((f, p) => {
        const along = f === 'left' ? p.u : p.v;
        const mid = f === 'left' ? pu + 5 : pv + 5;
        const zq = p.z - z;
        if (zq > 3.6) return mix(f === 'left' ? hex('#e8dcc0') : hex('#b8ae9c'), EAVE, 0.45);
        if (zq > 3) return Math.floor(along * P.k) % 2 ? hex('#2a2024') : st.gold;
        if (Math.abs(along - mid) < 1) return Math.floor(along * P.k) % 2 ? P.glassAt(p, st.glass) : lit(st.timber, f, 1);
        if (Math.abs(along - mid) < 1.4) return st.gold;
        return sunlit(f === 'left' ? red : tone(red, 0.3), v3(p.u, p.v, p.z), f);
      }), false);
      roofHip(P, pu + o, pv + o, z + 4.5, l, l, 2.2, 2.8);
      // A railed balcony.
      for (let a = 0; a <= l + 1; a += 1) {
        P.px.point(v3(pu + o - 0.5 + a, pv + o + l + 0.8, z + 0.8), red);
        P.px.point(v3(pu + o + l + 0.8, pv + o - 0.5 + a, z + 0.8), tone(red, 0.3));
      }
      z += 6.4;
    }
    for (let k = 0; k < 9; k++) {
      const p = v3(pu + 5, pv + 5, z + 0.6 + k * 0.85);
      P.px.point(p, k % 2 ? tone(st.gold, 0.3) : st.gold);
      P.px.point(v3(p.u + 0.5, p.v - 0.5, p.z), k % 2 ? tone(st.gold, 0.5) : tone(st.gold, 0.15));
    }
    P.px.point(v3(pu + 5, pv + 5, z + 8.6), tone(st.gold, -0.4));
    P.px.point(v3(pu + 5, pv + 5, z + 9.2), st.gold);
    P.pole(parts, 110, 42, 0, 15, 4, 4);
  }
}

/** The shrine's ground decal: raked gravel with a stepping-stone approach and ripples round a rock. */
function chapterGrounds(P: Painter, tier: number, parts: BuildingParts): void {
  if (tier < 2) return;
  S.decal(P, parts, () => {
    S.gravel(P, 80, 12, 136, 44, false, [[132, 26.5, 1.1], [129, 26, 1], [126, 26.8, 1.1], [123, 26.2, 1]], tier >= 4 ? [] : [[124, 38, 4]]);
  });
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
    stoneBase(P, u0 - 1, v0 - 1, lu + 2, lv + 2, 1.5, 0.3, 31);
    house(P, u0, v0, 1.5, lu, lv, h, ws, 'irimoya', { boards: tier >= 3 ? 4 : 3, rh: lu * 0.62, o: 2.5, frame: 5 });
    noren(P, 'right', u0 + lu, v0 + lv / 2 - 3, 6, 1.5 + 6);
    S.vines(P, 'left', v0 + lv, u0 + 2, 7, 1.5 + h - 0.6, 1.5, 51);
  }
  // A kanban by the door and the weapon rack (yari stand).
  const sv = v0 + lv / 2;
  S.kanban(P, u0 + lu + 1.2, sv + 4, false, 5);
  for (let i = 0; i < 4; i++) post(P.px, u0 + lu + 3, sv + 8 + i * 1.5, 0, 12, st.timber[1]);
  for (let i = 0; i < 4; i++) P.px.point(v3(u0 + lu + 3, sv + 8 + i * 1.5, 12.5), hex('#c8ccd2'));
  line3(P.px, v3(u0 + lu + 3, sv + 7, 7), v3(u0 + lu + 3, sv + 14, 7), st.timber[2]);
  if (tier >= 2) lanterns(P, 'right', u0 + lu + 1.5, sv - 5, 10, 1.5 + h - 0.6, 2, true);
  if (tier >= 3) {
    // A two-storey corner yagura at the yard end.
    const tu = u0 + lu - 8;
    const tv = v0 - 6;
    stoneBase(P, tu - 1, tv - 1, 14, 14, 4, 1.2, 32);
    house(P, tu, tv, 4, 12, 12, 8, wins('left', 0, 12, 2, 4, 2, 2.5).concat(wins('right', 0, 12, 2, 4, 2, 2.5), wins('left', 3, 6, 1, 1.5, 1.2, 1.2, 'sama')), 'kawara', { boards: 4, rh: 3.5, o: 2 });
    house(P, tu + 2, tv + 2, 13.5, 8, 8, 6, wins('left', 0, 8, 1, 2, 2.5, 2.5).concat(wins('right', 0, 8, 1, 2, 2.5, 2.5)), 'irimoya', { rh: 6, o: 1.8 });
    if (tier >= 4) P.pole(parts, tu + 12, tv + 12, 4, 20, 4, 4);
  }
  if (tier >= 2) P.pole(parts, u0 + lu + 2, sv - 6, 0, 18, 4, 4);
  // The armourer's lean-to at the south end: a hearth, an anvil, the bellows.
  const fv = v0 + lv + 1;
  box(P.px, u0 + 2, fv, 0, 16, 10, 2, wrap(ishigaki(P, 34)));
  for (const [pu, pv] of [[u0 + 2, fv + 10], [u0 + 18, fv + 10], [u0 + 18, fv]] as const) post(P.px, pu, pv, 0, 9, st.timber[2], st.timber[3]);
  const lean = tier >= 2 ? kawara(P, 8) : bark(P, 8, st.thatch);
  P.px.quad(v3(u0 + 1, fv - 1, 11), v3(19, 0, 0), v3(0, 13, -3), (_s, _t, p) => lean('left', p));
  box(P.px, u0 + 4, fv + 2, 0, 5, 5, 4, wrap(ishigaki(P, 35)));
  box(P.px, u0 + 10, fv + 2, 0, 3, 5, 3, (f) => lit(st.timber, f, 1));
  P.chimney(parts, u0 + 5, fv + 3, 4, 11);
  parts.forges.push([Math.floor(sx(u0 + 9, fv + 5)), Math.floor(sy(u0 + 9, fv + 5, 2))]);
  box(P.px, u0 + 12, fv + 6, 0, 2, 2, 3, P.flat(st.slate[2]));
}

function range(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  // The shajō: the shooters' hall, open toward the azuchi, its floor raised.
  const su = 200;
  const sv = 36;
  const sl = 14;
  const sw = 34;
  box(P.px, su, sv, 0, sl, sw, 1.2, (f, s) => (f === 'top' && Math.floor(s * P.k) % 3 === 0 ? st.timber[1] : lit(st.timber, f, f === 'top' ? -1 + 1 : 1)));
  const ph = tier === 1 ? 7 : 9;
  for (const v of [sv, sv + sw / 3, (sv + sw * 2 / 3), sv + sw]) post(P.px, su + sl, v, 1.2, ph, st.timber[1], st.timber[2]);
  for (const v of [sv, sv + sw / 2, sv + sw]) post(P.px, su, v, 1.2, ph, st.timber[2]);
  box(P.px, su + sl - 0.5, sv, 1.2, 0.5, sw, ph, wrap(planks(P, 1.2, ph, [])), false);
  if (tier === 1) hip(P.px, su, sv, ph + 1.2, sl, sw, 4, 1.5, bark(P, ph, st.thatch));
  else if (tier < 4) roofHip(P, su, sv, ph + 1.2, sl, sw, 5, 2);
  else irimoya(P, su, sv, ph + 1.2, sl, sw, 9, 2.5);
  if (tier >= 2) lanterns(P, 'left', sv + sw, su + 1, sl - 2, ph + 0.6, 2);
  // The azuchi: a sand bank under its own little roof, the mato (targets) before it.
  const n = Math.min(4, 1 + Math.floor(level / 4));
  const sand = hex('#d8c8a0');
  frustum(P.px, 142, 38, 0, 6, n * 7 + 2, 6, 1.6, (f, p) => sunlit(f === 'left' ? sand : f === 'top' ? tone(sand, -0.08) : tone(sand, 0.22), p, f));
  for (const v of [38, 38 + n * 7 + 2]) post(P.px, 141, v, 0, 9, st.timber[2]);
  for (const v of [38, 38 + n * 7 + 2]) post(P.px, 148, v, 0, 8, st.timber[1]);
  roofHip(P, 140, 37, 8.5, 9, n * 7 + 4, 2, 1);
  for (let i = 0; i < n; i++) {
    const cu = 152.5;
    const cv = 43 + i * 7;
    const cz = 3.2;
    line3(P.px, v3(cu, cv, 0), v3(cu, cv, cz), st.timber[2]);
    for (let dv = -2.4; dv <= 2.4; dv += 0.2)
      for (let dz = -2.4; dz <= 2.4; dz += 0.2) {
        const r = Math.hypot(dv, dz);
        if (r > 2.3) continue;
        const ring = r < 0.6 ? hex('#1e1a1e') : r < 1.1 ? st.fine[0] : r < 1.5 ? hex('#1e1a1e') : r < 1.9 ? st.fine[0] : hex('#1e1a1e');
        P.px.point(v3(cu, cv + dv, cz + dz), ring);
      }
    parts.targets.push([Math.floor(sx(cu, cv)), Math.floor(sy(cu, cv, cz))]);
  }
  if (tier >= 2) P.pole(parts, 204, 30, 0, 16, 4, 4);
}

function granary(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    // A takakura: a rice store raised on posts against damp and rats, under thick thatch.
    for (const [u, v] of [[166, 80], [186, 80], [166, 94], [186, 94]] as const) post(P.px, u, v, 0, 5, st.timber[1], st.timber[2]);
    box(P.px, 164, 78, 5, 26, 20, 0.8, (f) => lit(st.timber, f, 1));
    house(P, 165, 79, 5.8, 24, 18, 7, [{ face: 'left', a: 10, w: 4, z: 0, h: 5, kind: 'door' }], 'thatch', { plank: true, rh: 11 });
    line3(P.px, v3(176, 98, 0), v3(176, 98, 5.8), st.timber[0]);
    return;
  }
  // Kura: thick white plaster storehouses, namako-kabe on the lower walls, iron-studded doors.
  const n = tier === 2 ? 1 : tier === 3 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const u0 = [184, 160, 172][i]!;
    const v0 = [76, 78, 92][i]!;
    const lu = i === 2 ? 14 : 18;
    const lv = i === 2 ? 10 : 14;
    const h = i === 2 ? 9 : 11;
    stoneBase(P, u0 - 1, v0 - 1, lu + 2, lv + 2, 1.2, 0.3, 50 + i);
    house(P, u0, v0, 1.2, lu, lv, h, [
      { face: 'left', a: 0, w: lu, z: 0, h: h * 0.42, kind: 'namako' },
      { face: 'right', a: 0, w: lv, z: 0, h: h * 0.42, kind: 'namako' },
      { face: 'left', a: lu / 2 - 2.2, w: 4.4, z: 0, h: 6.2, kind: 'irondoor' },
      { face: 'right', a: lv / 2 - 1.2, w: 2.4, z: h * 0.68, h: 2, kind: 'irondoor' },
    ], 'kawara', { rh: lv * 0.55, o: 1.5 });
    if (i === 0) S.vines(P, 'right', u0 + lu, v0 + 1, 4, 1.2 + h - 0.4, 1.2, 61, PAL.wisteria);
    // A little tiled hood over the door (the kura's kirizuma-yane).
    box(P.px, u0 + lu / 2 - 3, v0 + lv, 1.2 + 6.6, 6, 1.4, 0.5, (f) => lit(st.slate, f));
    // The owner's mon in white on the gable side, under the eave.
    P.px.point(v3(u0 + lu + 0.2, v0 + lv / 2, h - 0.6), st.fine[0]);
    P.px.point(v3(u0 + lu + 0.2, v0 + lv / 2 + 0.5, h - 0.6), st.fine[0]);
  }
  if (tier >= 4) P.pole(parts, 204, 100, 0, 16, 4, 4);
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
    stoneBase(P, u0 - 1, v0 - 1, lu + 2, lv + 2, 1, 0.3, 61);
    box(P.px, u0, v0, 1, lu, lv, h, wrap(plaster(P, 1, h, ws, h * 0.75, false, 2.5)), false);
    irimoya(P, u0, v0, h + 1, lu, lv, lu * 0.6, 2.5);
  } else {
    box(P.px, u0, v0, 0, lu, lv, h, wrap(planks(P, 0, h, ws, 2.2)), false);
    if (tier === 1) hip(P.px, u0, v0, h, lu, lv, 12, 2.2, bark(P, h - 1.3, st.thatch));
    else irimoya(P, u0, v0, h, lu, lv, lu * 0.55, 2.2, false, st.shingle, bark(P, h - 1.3, st.shingle));
  }
  S.vines(P, 'left', v0 + lv, u0 + 1, 6, h - 0.5, 0.5, 71);
  for (let i = 0; i < n; i++) {
    const v = v0 + ((i + 0.5) * lv) / n;
    parts.stalls.push([Math.floor(sx(u0 + lu, v)), Math.floor(sy(u0 + lu, v, 5))]);
  }
  if (tier >= 4) P.pole(parts, u0 + lu + 1, v0 + 2, 0, 18, 4, 4);
}

function workshop(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 172;
  const v0 = 140;
  const lu = tier === 1 ? 30 : 38;
  const lv = tier === 1 ? 26 : 32;
  const h = tier === 1 ? 8 : 10;
  const back = tier >= 2 ? plaster(P, 0, h, [], h * 0.5, false, 2.5) : planks(P, 0, h, [], 2.5);
  box(P.px, u0, v0, 0, 3, lv, h, wrap(back));
  box(P.px, u0, v0, 0, lu, 3, h, wrap(back));
  for (let u = u0 + 3; u <= u0 + lu; u += lu / 3) post(P.px, u, v0 + lv, 0, h, st.timber[1], st.timber[2]);
  for (let v = v0 + 3; v <= v0 + lv; v += lv / 3) post(P.px, u0 + lu, v, 0, h, st.timber[2]);
  if (tier === 1) hip(P.px, u0 - 1, v0 - 1, h, lu + 2, lv + 2, 10, 2, bark(P, h - 1.2, st.thatch));
  else irimoya(P, u0 - 1, v0 - 1, h, lu + 2, lv + 2, lu * 0.5, 2.5);
  const zr = h + (tier === 1 ? 10 : lu * 0.5 * 0.62) - 1;
  box(P.px, u0 + 6, v0 + lv / 2 - 2, zr, 5, 4, 2, (f) => lit(st.timber, f, 2));
  roofHip(P, u0 + 6, v0 + lv / 2 - 2, zr + 2, 5, 4, 1.5, 1);
  parts.smoke.push([Math.floor(sx(u0 + 8.5, v0 + lv / 2)), Math.floor(sy(u0 + 8.5, v0 + lv / 2, zr + 3))]);
  box(P.px, u0 + 4, v0 + 5, 0, 6, 6, 3, wrap(ishigaki(P, 71)));
  box(P.px, u0 + 11, v0 + 5, 0, 5, 3, 3, (f) => lit(st.timber, f));
  box(P.px, u0 + 14, v0 + 12, 0, 2, 2, 2.5, P.flat(st.slate[2]));
  box(P.px, u0 + 18, v0 + 10, 0, 3, 3, 2, (f, _s, _t, p) => (f === 'top' ? tone(st.slate[1], 0.2) : lit(st.timber, f, Math.floor(p.z * 2) % 2)));
  if (tier >= 2) lanterns(P, 'left', v0 + lv, u0 + lu / 2, lu / 2, h - 0.4, 2);
  if (tier >= 4) P.pole(parts, u0 + lu + 2, v0 + 2, 0, 20, 4, 4);
}

function hospital(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 98;
  const v0 = 186;
  const lu = tier === 1 ? 30 : 40;
  const lv = tier === 1 ? 18 : 22;
  const h = tier === 1 ? 8 : 9;
  // A machiya: ochre plaster, posts and beams, a kōshi lattice front, a noren at the door.
  const ws: Win[] = [
    ...wins('left', 2, lu - 4, tier + 1, 1.5, 4, 4, 'koshi'),
    { face: 'right', a: lv / 2 - 2.5, w: 5, z: 0, h: 6.5, kind: 'door' },
    ...wins('right', 1, 5, 1, 2, 3, 3.5, 'shoji'),
  ];
  if (tier === 1) house(P, u0, v0, 0, lu, lv, h, ws, 'thatch', { daub: true, rh: 10, frame: 6 });
  else {
    house(P, u0, v0, 0, lu, lv, h, ws, 'kawara', { daub: true, boards: 2.5, rh: lv * 0.5, o: 1.6, frame: 6 });
    // The low second storey: mushiko-mado slits and a sudare-hung window, its own kawara above.
    house(P, u0 + 2, v0 + 2, h + 1.5, lu - 4, lv - 4, 4.5, [...wins('left', 2, lu - 8, 3, 1, 3, 2.2, 'mushiko'), ...wins('right', 2, lv - 8, 1, 0.8, 4, 2.8, 'sudare')], 'kawara', { daub: true, rh: (lv - 4) * 0.45, o: 1.6 });
  }
  // The noren over the door and a red paper lantern by it.
  const nu = u0 + lu;
  noren(P, 'right', nu, v0 + lv / 2 - 2.5, 5, 6.6);
  S.chochin(P, nu + 1.2, v0 + lv / 2 + 3.8, 7.4, true);
  S.chochin(P, nu + 1.2, v0 + lv / 2 - 3.8, 7.4, false);
  // Ivy up the lit wall.
  S.vines(P, 'left', v0 + lv, u0 + 1, 5, h - 0.4, 1, 33);
  if (tier >= 3) {
    // A small kura for the medicines behind.
    stoneBase(P, u0 + 1, v0 - 9, 10, 9, 1, 0.3, 81);
    house(P, u0 + 2, v0 - 8, 1, 8, 7, 8, [
      { face: 'left', a: 0, w: 8, z: 0, h: 3.5, kind: 'namako' },
      { face: 'right', a: 0, w: 7, z: 0, h: 3.5, kind: 'namako' },
      { face: 'left', a: 2.5, w: 3, z: 0, h: 4.6, kind: 'irondoor' },
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
        const y = Math.floor(p.v * 2);
        return sunlit(hash((Math.floor(p.u * 2) + (y & 1)) >> 1, y, 3) < 0.15 ? tone(c, 0.1) : c, p, f);
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
    // Dobei: a plastered earth wall with a kawara coping, on curved ishigaki from the fortified tier.
    const base = tier >= 3 ? (tier >= 4 ? hh * 0.62 : hh * 0.5) : 1;
    if (tier >= 3) stoneBase(P, u0, v0, lu, lv, base, 1.1, u0 * 7 + v0, false);
    else frustum(P.px, u0, v0, 0, lu, lv, base, 0.2, ishigaki(P, u0 * 7 + v0), false);
    const wu = along ? u0 : u0 + 0.9;
    const wv = along ? v0 + 0.9 : v0;
    const wl = along ? lu : 2.2;
    const ww = along ? 2.2 : lv;
    const wh = hh - base;
    // Sama: triangles and squares alternating.
    const sama: Win[] = [];
    const len = along ? lu : lv;
    for (let s = 3; s < len - 2; s += 4) sama.push({ face: along ? 'left' : 'right', a: (along ? wu : wv) + s, w: 1.4, z: wh * 0.38, h: 1.3, kind: 'sama' });
    box(P.px, wu, wv, base, wl, ww, wh, wrap(plaster(P, base, wh, sama, tier >= 3 ? wh * 0.3 : 0, false, 0.8)), true);
    hip(P.px, wu, wv, hh, wl, ww, 1.2, 0.8, kawara(P, hh - 0.5, undefined, u0 + v0), 0.5);
    // Ivy over the coping here and there.
    if (tier >= 2 && hash(u0, v0, 5) < 0.8) {
      const a0 = (along ? wu : wv) + 4 + hash(u0, v0, 6) * Math.max(1, len - 14);
      S.vines(P, along ? 'left' : 'right', (along ? wv + ww : wu + wl) + 0.2, a0, 6, hh - 0.3, base, Math.round(u0 + v0), hash(u0, v0, 7) < 0.65 ? PAL.wisteria : null);
    }
  };
  const towerAt = (u: number, v: number, hh: number) => {
    if (tier === 1) {
      for (const [du, dv] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) post(P.px, u + du, v + dv, 0, hh + 6, st.timber[1], st.timber[2]);
      box(P.px, u - 1, v - 1, hh + 4, 10, 10, 5, wrap(planks(P, hh + 4, 5, [], 1.2)));
      hip(P.px, u - 1, v - 1, hh + 9, 10, 10, 5, 1.2, bark(P, hh + 8, st.thatch));
      return;
    }
    // A sumi-yagura: a corner turret on its ishigaki, one or two storeys, with ishi-otoshi bays.
    const l = tier >= 3 ? 14 : 12;
    const b = tier >= 3 ? hh * 0.7 : 2;
    const u0 = u - l / 2 + 4;
    const v0 = v - l / 2 + 4;
    if (tier >= 3) stoneBase(P, u0 - 1, v0 - 1, l + 2, l + 2, b, 1.6, u * 3 + v);
    else frustum(P.px, u0 - 1, v0 - 1, 0, l + 2, l + 2, b, 0.3, ishigaki(P, u * 3 + v));
    const ws = wins('left', 0, l, 2, 2.5, 2, 2.4).concat(wins('right', 0, l, 2, 2.5, 2, 2.4), wins('left', l / 2 - 0.7, 1.4, 1, 1.6, 1.4, 1.3, 'sama'), wins('right', l / 2 - 0.7, 1.4, 1, 1.6, 1.4, 1.3, 'sama'));
    house(P, u0, v0, b, l, l, 7, ws, tier >= 4 ? 'kawara' : 'irimoya', { boards: 3, rh: tier >= 4 ? 3 : l * 0.55, o: 2 });
    if (tier >= 3) {
      // Ishi-otoshi: a bay projecting at the corner, its floor slanting back to the wall so stones
      // can be dropped on whoever climbs the ishigaki; boarded black like the shitamiita.
      for (const side of ['left', 'right'] as const) {
        const bu = side === 'left' ? u0 + l - 4 : u0 + l;
        const bv = side === 'left' ? v0 + l : v0 + l - 4;
        box(P.px, bu, bv, b + 1.4, side === 'left' ? 3 : 1.2, side === 'left' ? 1.2 : 3, 3.6, wrap(plaster(P, b + 1.4, 3.6, [], 3.6, false, 0.6)));
        P.px.quad(v3(bu, bv, b + 1.4), side === 'left' ? v3(3, 0, 0) : v3(0, 3, 0), side === 'left' ? v3(0, 1.2, 1.4) : v3(1.2, 0, 1.4), (s) => (Math.floor(s * P.k) % 3 === 0 ? BOARD[3] : BOARD[2]));
      }
    }
    if (tier >= 4) house(P, u0 + 2.5, v0 + 2.5, b + 9, l - 5, l - 5, 5, wins('left', 0, l - 5, 1, 1.5, 2.4, 2.4).concat(wins('right', 0, l - 5, 1, 1.5, 2.4, 2.4)), 'irimoya', { rh: (l - 5) * 0.6, o: 1.6 });
  };
  if (tier >= 3) towerAt(-4, -4, h);
  run(0, 0, W, th, h);
  run(0, 0, th, W, h);
  if (tier >= 3) {
    towerAt(W - 4, -4, h);
    towerAt(-4, W - 4, h);
  }
  parts.arts.push(finishLit(P, -10));
  const chunk = 29;
  for (let v = 0; v < W; v += chunk) {
    P.reset();
    const v1 = Math.min(W, v + chunk);
    const a0 = Math.max(v, th);
    if (v1 > gate0 && v < gate1) {
      run(W - th, a0, th, gate0 - a0, front);
      run(W - th, gate1, th, v1 - gate1, front);
    } else run(W - th, a0, th, v1 - a0, front);
    parts.arts.push(finishLit(P, W + (v + v1) / 2 - 2));
  }
  for (let u = 0; u < W - th; u += chunk) {
    P.reset();
    const u1 = Math.min(W - th, u + chunk);
    run(Math.max(u, th), W - th, u1 - Math.max(u, th), th, front);
    parts.arts.push(finishLit(P, W + (u + u1) / 2 - 2));
  }
  // The gate: a kabuki-mon of posts and a beam, a roofed yakui-mon, then a yagura-mon over the way.
  P.reset();
  const gh = front + (tier >= 3 ? 8 : 5);
  const doors = (u: number, z0: number, hgt: number) => {
    // Two leaves swung open against the passage walls: planks, three iron bands, studs.
    for (const [v, dir] of [[gate0 + 0.4, 1], [gate1 - 0.4, -1]] as const)
      P.px.quad(v3(u, v, z0), v3(-5, 0, 0), v3(0, 0, hgt), (s, t) => {
        const sq = Math.floor(s * P.k);
        const tq = Math.floor(t * P.k);
        const band = [0.2, 0.5, 0.8].some((f) => Math.abs(tq - Math.floor(hgt * P.k * f)) < 1);
        if (band) return sq % 3 === 1 ? hex('#6a6670') : PAL.iron;
        return sq % 3 === 0 ? st.timber[2] : dir > 0 ? st.timber[1] : st.timber[0];
      });
  };
  if (tier === 1) {
    for (const v of [gate0 - 1, gate1]) box(P.px, W - 3, v, 0, 1.6, 1.6, gh, (f) => lit(st.timber, f));
    box(P.px, W - 3.5, gate0 - 3, gh - 1.5, 2.6, gate1 - gate0 + 6, 1.4, (f) => lit(st.timber, f));
    hip(P.px, W - 4, gate0 - 3, gh, 3.6, gate1 - gate0 + 6, 1.5, 0.8, bark(P, gh - 0.5, st.shingle));
  } else if (tier === 2) {
    for (const v of [gate0 - 2, gate1 + 0.5]) box(P.px, W - 4, v, 0, 2, 1.6, gh, (f) => lit(st.timber, f));
    box(P.px, W - 5, gate0 - 3, gh, 5, gate1 - gate0 + 6, 1.5, (f) => lit(st.timber, f, 1));
    doors(W - 2, 0, gh - 1);
    irimoya(P, W - 5.5, gate0 - 3.5, gh + 1.5, 6, gate1 - gate0 + 7, 5, 1.6);
  } else {
    // Yagura-mon: the gate passes under a long turret resting on the ishigaki either side.
    const b = front * 0.62;
    for (const v of [gate0 - 9, gate1]) stoneBase(P, W - 8, v, 11, 9, b, 1, v);
    const z = gh - 2;
    box(P.px, W - 7, gate0 - 8, b, 9, gate1 - gate0 + 16, z - b, wrap(plaster(P, b, z - b, [], (z - b) * 0.4, false, 2)), false);
    house(P, W - 7, gate0 - 8, z, 9, gate1 - gate0 + 16, 6, wins('right', 0, gate1 - gate0 + 16, 4, 2.4, 2, 2.4).concat(wins('right', 2, gate1 - gate0 + 12, 3, 0.6, 1.2, 1.2, 'sama')), 'irimoya', { boards: 2.5, rh: 6.5, o: 2 });
    box(P.px, W - 7, gate0, 0, 9.2, gate1 - gate0, b + 1, () => tone(st.glass, -0.05), false);
    doors(W + 1.8, 0, b + 0.8);
  }
  // Paper lanterns on the gateposts and the gate's fire barrels.
  S.chochin(P, W + 2.4, gate0 - 2, front + 2.5, true);
  S.chochin(P, W + 2.4, gate1 + 2, front + 2.5, true);
  if (tier >= 2) {
    S.tenbosui(P, W + 6, gate0 - 7);
    S.toro(P, W + 7, gate1 + 6, 0.9);
  }
  if (tier >= 2) {
    P.pole(parts, W + 2, gate0 - 4, 0, gh + 8, 4, 4);
    P.pole(parts, W + 2, gate1 + 4, 0, gh + 8, 4, 4);
  }
  parts.arts.push(finishLit(P, W + GATE_V + 6));
  if (tier >= 3) {
    P.reset();
    towerAt(W - 4, W - 4, front);
    parts.arts.push(finishLit(P, W * 2 + 4));
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
    parts.arts.push(finishLit(P, W * 2 + 30));
  }
  return parts;
}

// ------------------------------------------------------------------ registration

registerKit('samurai', (P, key, a, parts) => {
  const tier = tierOf(a.level);
  if (key === 'walls') return tier === 0 ? null : walls(P, a, parts);
  // Ground decals first (each its own flat art; P is reset between), then the building. The
  // free-standing props are placed by props.ts from the Samurai theme (samurai-props.ts).
  if (key === 'keep') keepGrounds(P, Math.max(1, tier), parts);
  else if (key === 'chapter') chapterGrounds(P, tier, parts);
  P.reset();
  switch (key) {
    case 'keep':
      keep(P, Math.max(1, tier), parts);
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
      granary(P, tier, parts);
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
  // The finish as the commandery's (scaffolding when about to rise a tier), in the Samurai light.
  const [u0, v0, u1, v1] = LOT[key];
  if (a.progress > 0.45 && TIER_START.includes(a.level + 1) && a.level > 0) P.scaffold(u0 + 4, v0 + 4, (u1 - u0) * 0.5, (v1 - v0) * 0.5, 14 + tier * 4);
  parts.arts.unshift(finishLit(P, (u0 + u1 + v0 + v1) / 2));
  return parts;
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
  S.hasa(P, u + 8, v - 2, 10, false);
  return null;
}

void LOT;
export type { BuildingKey };
