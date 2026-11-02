// The Undead necropolis, HD only: each building of the commandery's plan rebuilt for the Hollow
// Host on the same lots and through the same five tiers (lot → rough → solid → fortified → grand),
// grounded in real funerary architecture (docs/art-references/undead-city.md):
//
//   keep      a long barrow with a dolmen door → a squat black tower → a buttressed Gothic keep
//             with a skull frieze → the lich's needle spire with pinnacles and a grave-light crown
//   chapter   the Black Chapel: a roofless ruin → a steep slate chapel → with a bell tower and
//             spire → an abbey of flying buttresses and a green rose window, one tower left broken
//             (Whitby, Tintern)
//   barracks  the Ossuary: a barrow → a half-sunk crypt hall walled in bone (Sedlec, Évora) →
//             bone pyramids at its corners → a bone tower
//   range     the Bone Butts: a broken lychgate for the archers, targets before a heap of bones
//   granary   the charnel store: a dead-house → a charnel house with grated windows → an ossuary
//             annex → a domed mausoleum
//   stables   the Carrion Stables: rotten boards and ragged thatch → black stone and slate
//   workshop  the Bonewright's Yard: an open shed, bone heaps, a green-lit cauldron, a gibbet crane
//   hospital  the Charnel Pit: a plague hut by an open pit → a half-timbered embalming house →
//             a grated charnel pit → a domed embalming hall
//   walls     stakes crowned with skulls → a rubble wall → black ashlar with a bone band and drum
//             towers → high walls, spired towers and skull merlons
//
// Materials: black basalt ashlar shading violet; bone in Sedlec's patterns (rows of skulls between
// courses of long bones); rubble; moss-slate and verdigris lead; rotten timber. The one saturated
// colour is the grave-light green in the lancets, the cauldron and the crown.

import { GATE_V, registerKit, registerMill, tierOf, wallHeights, WALL, type BuildingParts, type Painter, type PaintArgs } from './buildings.ts';
import { box, cone, drum, gable, hash, hex, line3, mix, post, pyramid, sx, sy, tone, v3, type Col, type Facing, type Shader, type V3 } from './pixels.ts';
import { frustum, mound, type PShader } from './solids.ts';
import type { Ramp } from './style.ts';
import { FIELDS } from './ground.ts';
import { angel, bakePools, beginLights, candles, cobweb, coffinStack, endLights, fixedLights, gargoyle, glow, graveFields, groundPools, ivyAt, plagueSign, railing, sarcophagus, setSink, torch, wallLantern, wreath, yardProps } from './undead-props.ts';

interface Hole {
  face: Facing;
  a: number;
  w: number;
  z: number;
  h: number;
  kind: 'lancet' | 'osslancet' | 'door' | 'slit' | 'rose' | 'grate' | 'stall' | 'shutter';
}

type Mat = 'black' | 'bone' | 'rubble' | 'timber' | 'boards' | 'niche' | 'frieze';

const wrap = (sh: PShader): Shader => (f, _s, _t, p) => sh(f, p);
const lit = (r: Ramp, f: Facing, k = 0): Col => r[Math.min(3, (f === 'left' ? 0 : f === 'top' ? 1 : 2) + k)]!;

// ------------------------------------------------------------------ materials

/** Bone in the ossuaries' patterns: a row of skulls, then courses of long bones laid end-on. */
function boneAt(P: Painter, f: Facing, along: number, zz: number): Col {
  const st = P.st;
  const k = P.k;
  const x = Math.floor(along * k);
  const y = Math.floor(zz * k);
  const band = ((y % 10) + 10) % 10;
  const dark = lit(st.fine, f, 2);
  const deep = tone(st.fine[3], 0.35);
  if (band < 6) {
    // Skulls: 5 wide, 5 high, with a dark gap between; two sockets and a nose.
    const sxk = (((x + (Math.floor(y / 10) % 2) * 3) % 6) + 6) % 6;
    const sy0 = band;
    if (sxk === 5 || sy0 === 5) return deep;
    if (sy0 === 0 && (sxk === 0 || sxk === 4)) return deep;
    if (sy0 === 2 && (sxk === 1 || sxk === 3)) return deep;
    if (sy0 === 3 && sxk === 2) return dark;
    if (sy0 === 4 && (sxk === 0 || sxk === 4)) return dark;
    return sy0 === 0 || sxk === 0 ? lit(st.fine, f) : f === 'left' ? st.fine[1] : st.fine[2];
  }
  // Long bones: knobbed ends every 7 pixels, a shadow under each course.
  const bx = (((x + band * 2) % 7) + 7) % 7;
  if (band === 9) return deep;
  if (bx === 0) return band === 7 ? lit(st.fine, f) : dark;
  return band === 6 ? lit(st.fine, f) : f === 'left' ? st.fine[1] : st.fine[2];
}

/**
 * Black basalt ashlar, block by block (the user's targets: every stone its own, with mortar): each
 * course a hashed block width, every block its own tone and a bevel lit on its top and left edges,
 * dark mortar joints, a few cracked and a few fallen out, black water streaking down from the wall
 * head, moss creeping up from the foot and spots of pale lichen on the lit faces.
 */
function blackAt(P: Painter, f: Facing, along: number, zz: number, seed: number, h = 99): Col {
  const st = P.st;
  const k = P.k;
  const y = Math.floor(zz * k);
  const rowH = 6;
  const row = Math.floor(y / rowH);
  const ry = y - row * rowH;
  const bw = 8 + Math.floor(hash(row, 3, seed) * 3) * 2;
  const x = Math.floor(along * k) + Math.floor(hash(row, 4, seed) * bw);
  const blk = Math.floor(x / bw);
  const rx = x - blk * bw;
  const n = hash(blk, row, seed);
  const base = lit(st.stone, f);
  // A fallen-out block: a dark hole, its floor catching a little light.
  if (n > 0.978 && zz > 1.5 && zz < h - 1.5) return ry >= rowH - 2 ? tone(st.stone[3], 0.5) : ry === 0 ? tone(st.stone[2], 0.15) : tone(st.stone[3], 0.3);
  let c = n < 0.18 ? tone(base, 0.1) : n > 0.86 ? tone(base, -0.08) : n > 0.7 ? tone(base, -0.03) : base;
  if (ry === rowH - 1 || rx === bw - 1) c = tone(base, f === 'left' ? 0.45 : 0.32);
  else if ((ry === 0 || rx === 0) && f !== 'right') c = tone(c, -0.1);
  else if (n < 0.07 && Math.abs(rx - ry * 1.4 - ((n * 50) % 3)) < 0.7) c = tone(base, 0.42);
  // Black water from the wall head.
  const col = Math.floor((along * k) / 2);
  if (hash(col, 7, seed) < 0.14) {
    const L = 2 + hash(col, 8, seed) * Math.min(h, 30) * 0.55;
    const dd = h - zz;
    if (dd >= 0 && dd < L) c = mix(c, STAIN, 0.5 * (1 - dd / L));
  }
  // Moss at the foot (2×2 clusters, a ragged top), lichen on the lit faces.
  if (zz < 1.6 + hash(x >> 1, 0, seed + 3) * 1.8 && hash(x >> 1, y >> 1, seed + 3) < 0.55) c = mix(c, hex('#4a5a3a'), 0.55);
  else if (f !== 'right' && hash(x >> 1, y >> 1, seed + 5) < 0.012) c = hex('#77766a');
  return c;
}
const STAIN = hex('#100e16');
const IRON = hex('#2a2832');
const IRON_L = hex('#5a5868');

/** Rubble: rough uncoursed stones, deep joints, moss in some of them. */
function rubbleAt(P: Painter, f: Facing, along: number, zz: number, seed: number): Col {
  const st = P.st;
  const k = P.k;
  const y = zz * k;
  const row = Math.floor(y / 4);
  const off = hash(row, seed, 1) * 7;
  const bw = 4 + Math.floor(hash(row, seed, 2) * 5);
  const ap = along * k + off;
  const blk = Math.floor(ap / bw);
  let c = mix(lit(st.stone, f), lit(st.daub, f), hash(blk, row, seed) * 0.5);
  if (ap - blk * bw < 1 || y - row * 4 < 1) c = hash(blk, row, seed + 1) < 0.3 ? mix(tone(lit(st.stone, f), 0.4), hex('#4a5a3a'), 0.5) : tone(lit(st.stone, f), 0.45);
  else if (y - row * 4 >= 3 && f !== 'right') c = tone(c, -0.06);
  return c;
}

/** Skull niches over a course of stacked femurs (Évora, the Paris catacombs). 0 = no pixel. */
function nicheAt(P: Painter, f: Facing, along: number, zz: number): Col {
  const st = P.st;
  const x = Math.floor(along * P.k);
  const y = Math.floor(zz * P.k);
  const cx = ((x % 8) + 8) % 8;
  const cy = ((y % 11) + 11) % 11;
  const fine = (j: number) => lit(st.fine, f, j);
  if (cy < 3) {
    // Femurs laid end-on: round knobs in a row.
    if (cy === 0) return tone(st.fine[3], 0.4);
    return cx % 2 === 0 ? fine(cy === 2 ? 0 : 1) : fine(cy === 2 ? 1 : 2);
  }
  const iy = cy - 3;
  const inside = cx >= 1 && cx <= 6 && (iy < 6 || (iy === 6 && cx >= 2 && cx <= 5));
  if (!inside) return iy === 7 || cx === 0 || cx === 7 ? lit(st.stone, f, 1) : lit(st.stone, f);
  // The skull at the niche's foot.
  if (cx >= 2 && cx <= 5 && iy <= 2) {
    if (iy === 2) return cx === 2 || cx === 5 ? fine(1) : fine(0);
    if (iy === 1) return cx === 2 || cx === 4 ? VOID : fine(1);
    if (cx === 3 || cx === 4) return fine(2);
  }
  return VOID;
}
const VOID = hex('#120e14');

/** Skull-and-crossbones carved in a frieze, one every 9 pixels, in relief on dark stone. */
const SCX = ['B..bBb..B', '.k.BBBk..', '..kQbQk..', '..bBkBb..', '.k..b..k.', 'B.......B'];
function friezeAt(P: Painter, f: Facing, along: number, zz: number, top: number): Col {
  const st = P.st;
  const x = Math.floor(along * P.k);
  const y = Math.floor((top - zz) * P.k) - 1;
  const bg = tone(lit(st.stone, f), 0.3);
  if (y < 0 || y >= SCX.length) return y === -1 || y === SCX.length ? lit(st.fine, f, 1) : bg;
  const ch = SCX[y]![((x % 9) + 9) % 9]!;
  if (ch === 'B') return lit(st.fine, f);
  if (ch === 'b') return lit(st.fine, f, 1);
  if (ch === 'k') return lit(st.fine, f, 2);
  if (ch === 'Q') return VOID;
  return bg;
}

interface WallOpts {
  /** Dead ivy hanging from the wall head: the share of strands (0..1). */
  ivy?: number;
}

/** A wall: a material by height band (bone friezes on black stone), with Gothic openings cut in. */
function gwall(P: Painter, z0: number, h: number, holes: Hole[], mat: Mat | ((zz: number) => Mat), seed: number, wo: WallOpts = {}): PShader {
  const st = P.st;
  const k = P.k;
  const ftop = friezeTop(mat, h);
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    if (wo.ivy && h < 900) {
      const c = ivyAt(along, zz, h, k, wo.ivy, seed);
      if (c) return c;
    }
    let stain = 0;
    for (const o of holes) {
      if (o.face !== f) continue;
      const da = along - (o.a + o.w / 2);
      const dz = zz - o.z;
      if (o.kind === 'rose') {
        const r = Math.hypot(da, (zz - (o.z + o.h / 2)) * 1.1);
        if (r < o.w / 2) {
          if (r > o.w / 2 - 0.6) return lit(st.fine, f, 1);
          const spoke = Math.abs(Math.sin(Math.atan2(zz - (o.z + o.h / 2), da) * 4)) < 0.3 || r < 0.8;
          // A ring of foils between the spokes and the rim.
          if (Math.abs(r - o.w * 0.3) < 0.25) return lit(st.stone, f, 1);
          return spoke ? lit(st.stone, f, 1) : P.glassAt(p, st.glass);
        }
        continue;
      }
      const half = o.w / 2;
      // Black water runs down from every sill.
      if (dz < 0 && dz > -4 && Math.abs(da) < half && o.kind !== 'door' && o.kind !== 'stall') stain = Math.max(stain, 0.4 * (1 + dz / 4));
      if (dz < -0.6 || dz >= o.h + 0.5) continue;
      // A sill under the windows.
      if (dz < 0) {
        if (Math.abs(da) < half + 0.6 && o.kind !== 'door' && o.kind !== 'stall' && o.kind !== 'slit') return lit(st.fine, f, 1);
        continue;
      }
      // Pointed arch: the opening narrows to a point over its last half-width.
      const spring = o.h - half * 1.3;
      const square = o.kind === 'slit' || o.kind === 'grate' || o.kind === 'shutter';
      const allowed = square ? half : dz < spring ? half : half * Math.max(0, 1 - ((dz - spring) / (half * 1.3)) ** 1.6);
      if (Math.abs(da) < allowed && dz < o.h) {
        if (o.kind === 'door') return doorAt(P, f, da, dz, half, allowed, o.h);
        if (o.kind === 'stall') return dz < o.h * 0.4 ? lit(st.timber, f, 1) : st.glass;
        if (o.kind === 'shutter') {
          // Closed shutters: two plank leaves, a Z brace, a dark line where they meet.
          const xx = Math.floor((da + half) * k);
          if (Math.abs(da) < 0.5 / k + 0.01) return st.timber[3];
          const leaf = da < 0 ? da + half : da;
          if (Math.abs(dz - (leaf / half) * o.h) < 0.4 || dz < 0.5 || dz > o.h - 0.6) return lit(st.timber, f);
          return xx % 3 === 0 ? st.timber[3] : lit(st.timber, f, 1);
        }
        if (o.kind === 'grate') {
          // Iron bars over a dark hole full of skulls.
          if (Math.floor((da + half) * k) % 2 === 0) return tone(st.slate[2], 0.2);
          return hash(Math.floor(along * k), Math.floor(zz * k), 9) < 0.3 ? lit(st.fine, f, 1) : st.glass;
        }
        if (o.kind === 'lancet' || o.kind === 'osslancet') {
          // Tracery: a mullion, and Y-tracery splitting into the head with a little oculus.
          const ln = 0.5 / k + 0.01;
          if (o.w > 2 && Math.abs(da) < ln && dz < spring + 0.3) return lit(st.stone, f, 1);
          if (o.w > 2 && dz >= spring && Math.abs(Math.abs(da) - (dz - spring) * 0.55) < ln) return lit(st.stone, f, 1);
          if (o.w > 3 && dz >= spring && Math.abs(Math.hypot(da, dz - (spring + half * 0.95)) - half * 0.35) < 0.3) return lit(st.stone, f, 1);
          if (o.kind === 'osslancet') {
            // A bone chandelier hung inside, black against the witchfire, its candles burning.
            const cz = o.h * 0.42;
            const xx = Math.floor((da + half) * k);
            if (Math.abs(da) < ln && dz > cz) return CHAND;
            if (Math.abs(da) < half * 0.8) {
              if (Math.abs(dz - cz) < 0.3) return CHAND;
              if (dz < cz && dz > cz - 1.1 && xx % 2 === 0) return CHAND;
              if (Math.abs(dz - cz - 0.6) < 0.3 && xx % 3 === 1) return hex('#f0ffd8');
            }
          }
        }
        return P.glassAt(p, st.glass);
      }
      // A dressed bone frame round the arches, a timber frame round the square openings.
      if (!square && Math.abs(da) < allowed + 0.6 && dz < o.h + 0.5) return lit(st.fine, f, 1);
      if (square && o.kind !== 'slit' && Math.abs(da) < half + 0.5 && dz < o.h + 0.5) return lit(st.timber, f, 2);
    }
    const m = typeof mat === 'function' ? mat(zz) : mat;
    let c: Col;
    if (m === 'bone') c = boneAt(P, f, along, zz);
    else if (m === 'niche') c = nicheAt(P, f, along, zz);
    else if (m === 'frieze') c = friezeAt(P, f, along, zz, ftop);
    else if (m === 'rubble') c = rubbleAt(P, f, along, zz, seed);
    else if (m === 'timber' || m === 'boards') {
      const x = Math.floor(along * k);
      if (m === 'boards') {
        c = x % 3 === 0 ? lit(st.timber, f, 1) : lit(st.timber, f);
        // Rotten: a few boards gone, black gaps; grain in dashes.
        if (hash(Math.floor(x / 3), Math.floor(zz / 3), seed) < 0.07) c = st.glass;
        else if (x % 3 !== 0 && hash(x, Math.floor((zz * k) / 3), seed + 1) < 0.12) c = tone(c, 0.15);
      } else {
        const beam = x % (8 * k) < k || Math.abs(zz - h / 2) < 0.5 || zz < 0.6 || zz > h - 0.8 || (Math.floor(along / 8) % 2 === 0 && Math.abs((along % 8) - (zz / h) * 8) < 0.6);
        c = beam ? lit(st.timber, f, 1) : lit(st.daub, f);
        // Daub fallen away from the laths, and damp stains.
        if (!beam && hash(x >> 2, Math.floor(zz * k) >> 2, seed) < 0.08) c = Math.floor(zz * k) % 2 ? tone(lit(st.timber, f), 0.2) : lit(st.timber, f, 1);
        else if (!beam && hash(x >> 1, Math.floor(zz * k) >> 1, seed) < 0.06) c = tone(c, 0.12);
      }
    } else c = blackAt(P, f, along, zz, seed, h > 900 ? 99 : h);
    if (zz > h - 0.8) c = tone(c, 0.3);
    if (stain) c = mix(c, STAIN, stain);
    return c;
  };
}
const CHAND = hex('#221a1e');

/** The top of a frieze band (where its carving is laid from), found by scanning the material. */
function friezeTop(mat: Mat | ((zz: number) => Mat), h: number): number {
  if (typeof mat !== 'function') return Math.min(h, 6);
  for (let z = 0; z < Math.min(h, 200); z += 0.25) if (mat(z) === 'frieze' && mat(z + 0.25) !== 'frieze') return z + 0.25;
  return h;
}

/** An iron-banded plank door: a dark reveal, vertical planks, two straps with studs and a ring. */
function doorAt(P: Painter, f: Facing, da: number, dz: number, half: number, allowed: number, h: number): Col {
  const st = P.st;
  const k = P.k;
  if (Math.abs(da) > allowed - 0.45) return tone(st.stone[3], 0.35);
  const xx = Math.floor((da + half) * k);
  if (Math.abs(dz - h * 0.22) < 0.35 || Math.abs(dz - h * 0.6) < 0.35) return xx % 3 === 1 ? IRON_L : IRON;
  const rd = Math.hypot(da - half * 0.4, dz - h * 0.41);
  if (rd < 0.5) return rd < 0.25 ? lit(st.timber, f, 1) : IRON_L;
  if (xx % 3 === 0) return st.timber[3];
  return hash(xx, Math.floor((dz * k) / 3), 5) < 0.15 ? lit(st.timber, f, 2) : lit(st.timber, f, 1);
}

/** A hole fallen in a roof: [s, t] centre along the ridge and up the slope, [rs, rt] radii. */
type Ruin = [number, number, number, number];

/**
 * Steep slate (or lead, or ragged thatch). Slates break and slip: a few gone, showing the dark
 * underlay and a batten; a few new and pale. A ruined roof has a hole fallen in it down to the
 * rafters (black inside), its rim a ragged line of broken slates.
 */
function roofSh(P: Painter, mat: 'slate' | 'lead' | 'thatch', ragged = false, ruin?: Ruin): Shader {
  const st = P.st;
  const k = P.k;
  const base = P.roof(mat === 'lead' ? 'lead' : mat === 'thatch' ? 'thatch' : 'slate', 7);
  return (f, s, t, p) => {
    if (ragged && t < 2.2 && hash(Math.floor(s * k), 0, 3) < 0.35 + (2.2 - t) * 0.1) return 0;
    if (ruin && f !== 'back') {
      const r = Math.hypot((s - ruin[0]) / ruin[2], (t - ruin[1]) / ruin[3]) + (hash(Math.floor((s * k) / 2), Math.floor(t * k), 78) - 0.5) * 0.35;
      if (r < 1) {
        // Rafters down the slope, a purlin across, black between; the rafters lit on their tops.
        const rs = s % 2.4;
        if (rs < 0.5) return rs < 0.25 ? st.timber[0] : st.timber[2];
        if (Math.abs(t - ruin[1]) < 0.35) return st.timber[1];
        return hex('#0c0a10');
      }
      // The broken edge: slates lifted pale, then a dark line under them.
      if (r < 1.12) return tone(st.slate[0], -0.12);
      if (r < 1.2) return st.slate[3];
    }
    let c = base(f, s, t, p);
    if (mat === 'slate') {
      const row = Math.floor(t / 2);
      const off = row % 2;
      const tile = Math.floor((Math.floor(s * k) + off * k) / (3 * k));
      const n = hash(tile, row, 91);
      const tq = Math.floor(t * k);
      if (n < 0.03 && t > 1) return tq % (2 * k) === 0 ? st.timber[2] : hex('#15121c');
      if (n > 0.97) c = tone(c, -0.12);
      // Moss creeping up from the eaves, in clumps.
      if (t < 1.8 && hash(Math.floor((s * k) / 2), Math.floor((t * k) / 2), 4) < 0.4) c = mix(c, hex('#4f5e3a'), 0.5);
    }
    return c;
  };
}

// ------------------------------------------------------------------ parts

interface HallOpts extends WallOpts {
  /** A hole in the roof down to the rafters. */
  ruin?: Ruin;
}

/** A hall: walls of a material, a steep gable roof, openings. */
function hall(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, h: number, alongU: boolean, holes: Hole[], mat: Mat | ((zz: number) => Mat), roof: 'slate' | 'lead' | 'thatch', seed: number, steep = 0.9, ragged = false, ho: HallOpts = {}): number {
  const abs = holes.map((o) => ({ ...o, a: o.a + (o.face === 'left' ? u0 : v0) }));
  const sh = gwall(P, z, h, abs, mat, seed, ho);
  box(P.px, u0, v0, z, lu, lv, h, wrap(sh), false);
  const rh = Math.round((alongU ? lv : lu) * steep);
  gable(P.px, u0, v0, z + h, lu, lv, rh, alongU, roof === 'thatch' ? 1.6 : 1.2, roofSh(P, roof, ragged, ho.ruin), wrap(gwall(P, z, 999, abs.filter((o) => o.kind === 'rose' || o.kind === 'lancet' || o.kind === 'osslancet'), mat, seed + 1)));
  return rh;
}

/** Lancets spaced along a face. */
function lancets(face: Facing, from: number, len: number, n: number, z: number, w = 2, h = 5, kind: Hole['kind'] = 'lancet'): Hole[] {
  const out: Hole[] = [];
  for (let i = 0; i < n; i++) out.push({ face, a: from + ((i + 0.5) * len) / n - w / 2, w, z, h, kind });
  return out;
}

/**
 * Crockets: the hooked stone leaves climbing a spire's hips, a knob every few units on the three
 * hips that make its silhouette (Gothic spires; the lich's needle).
 */
function crockets(P: Painter, u: number, v: number, z: number, l: number, h: number, o = 0.6): void {
  const st = P.st;
  const px = P.px;
  const apex = v3(u + l / 2, v + l / 2, z + h);
  const hips: [V3, number][] = [[v3(u - o, v + l + o, z - o * 0.5), -1], [v3(u + l + o, v - o, z - o * 0.5), 1], [v3(u + l + o, v + l + o, z - o * 0.5), 0]];
  const n = Math.max(3, Math.floor(h / 3));
  for (const [c, dir] of hips)
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = v3(c.u + (apex.u - c.u) * t, c.v + (apex.v - c.v) * t, c.z + (apex.z - c.z) * t);
      const x = Math.floor(px.X(p.u, p.v));
      const y = Math.floor(px.Y(p.u, p.v, p.z));
      const d = p.u + p.v + p.z + 1;
      if (dir === 0) {
        px.plot(x, y, d, st.stone[0]);
        px.plot(x + 1, y, d, st.stone[1]);
      } else {
        px.plot(x + dir, y, d, dir < 0 ? st.stone[0] : st.stone[1]);
        px.plot(x + dir * 2, y - 1, d, dir < 0 ? st.stone[0] : st.stone[2]);
      }
    }
}

/** A spire: a tall slate pyramid with crockets up its hips, a finial and a coal at the tip. */
function spire(P: Painter, u: number, v: number, z: number, l: number, h: number): void {
  pyramid(P.px, u, v, z, l, l, h, 0.6, roofSh(P, 'slate'));
  if (h >= 12) crockets(P, u, v, z, l, h);
  const t = v3(u + l / 2, v + l / 2, z + h);
  line3(P.px, t, v3(t.u, t.v, t.z + 3), P.st.timber[3]);
  // A cross-bar on the finial.
  line3(P.px, v3(t.u - 0.8, t.v + 0.8, t.z + 2.2), v3(t.u + 0.8, t.v - 0.8, t.z + 2.2), P.st.timber[3]);
  P.px.point(v3(t.u, t.v, t.z + 3.5), P.st.violet);
  glow(t.u, t.v, t.z + 3.5, 1);
}

/** A pinnacle: a little square shaft and a crocketed spirelet. */
function pinnacle(P: Painter, u: number, v: number, z: number, h: number, seed: number): void {
  box(P.px, u, v, z, 2.5, 2.5, h, wrap(gwall(P, z, h, [], 'black', seed)));
  pyramid(P.px, u, v, z + h, 2.5, 2.5, 4, 0.2, roofSh(P, 'slate'));
  crockets(P, u, v, z + h, 2.5, 4, 0.2);
}

/** Gargoyles on the three visible corners of a cornice at height z over a square. */
function gargoyles(P: Painter, u: number, v: number, lu: number, lv: number, z: number): void {
  gargoyle(P, u + lu + 0.6, v + lv * 0.08, z, false);
  gargoyle(P, u + lu * 0.08, v + lv + 0.6, z, true);
  gargoyle(P, u + lu + 0.4, v + lv + 0.4, z, false);
}

/** A heap of bones and skulls. */
function bonePile(P: Painter, u: number, v: number, r: number, h: number, seed: number): void {
  const st = P.st;
  mound(P.px, u, v, r, r * 0.8, h, (n, p) => {
    // Skulls and dark gaps as 2-px dashes (rows offset by one), not single-pixel speckle.
    const y = Math.floor(p.v * P.k);
    const q = hash((Math.floor(p.u * P.k) + (y & 1)) >> 1, y, seed);
    const base = n > 0.35 ? st.fine[0] : n > -0.1 ? st.fine[1] : st.fine[2];
    if (q < 0.08) return tone(st.fine[3], 0.4);
    if (q > 0.92) return st.fine[3];
    return base;
  });
}

/** A barrow: a long turfed mound with a dolmen door (two uprights and a capstone) on its +u end. */
function barrow(P: Painter, cu: number, cv: number, ru: number, rv: number, h: number, seed: number, door = true): void {
  const st = P.st;
  const turf = [hex('#6a6c50'), hex('#565a44'), hex('#43473a'), hex('#33372e')];
  mound(P.px, cu, cv, ru, rv, h, (n, p) => {
    let c = turf[n > 0.5 ? 0 : n > 0.15 ? 1 : n > -0.2 ? 2 : 3]!;
    if (hash(Math.floor(p.u * P.k / 2), Math.floor(p.v * P.k), seed) < 0.05) c = tone(c, -0.12);
    return c;
  });
  if (!door) return;
  const du = cu + ru * 0.86;
  const s = (f: Facing) => lit(st.stone, f);
  box(P.px, du - 1, cv - 3.5, 0, 2, 1.6, h * 0.62, (f) => s(f));
  box(P.px, du - 1, cv + 1.9, 0, 2, 1.6, h * 0.62, (f) => s(f));
  box(P.px, du - 1.4, cv - 4, h * 0.62, 2.8, 8, 1.4, (f) => s(f));
  box(P.px, du - 0.8, cv - 1.9, 0, 1.2, 3.8, h * 0.6, () => st.glass, false);
}

// ------------------------------------------------------------------ the buildings

function keep(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier <= 1) {
    // A long barrow, its door toward the yard; a ring of standing stones and a gibbet.
    barrow(P, 34, 36, 16, 12, 9, 3);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const u = 34 + Math.cos(a) * 20;
      const v = 36 + Math.sin(a) * 17;
      if (Math.cos(a) > 0.8) continue;
      box(P.px, u - 1, v - 1, 0, 2, 2, 4 + (i % 3), (f) => lit(st.stone, f));
    }
    line3(P.px, v3(46, 24, 0), v3(46, 24, 16), st.timber[2]);
    line3(P.px, v3(46, 24, 16), v3(46, 30, 16), st.timber[2]);
    line3(P.px, v3(46, 29, 16), v3(46, 29, 12), st.timber[0]);
    P.pole(parts, 30, 34, 9, 9, 6, 5);
    torch(parts, 52, 36, 5);
    return;
  }
  const l = tier === 2 ? 22 : tier === 3 ? 26 : 28;
  const h = tier === 2 ? 30 : tier === 3 ? 42 : 50;
  const u = 36 - l / 2;
  const holes: Hole[] = [
    ...lancets('left', 0, l, 2, h - 14, 2.5, 6), ...lancets('right', 0, l, 2, h - 14, 2.5, 6),
    ...lancets('left', 0, l, 3, h / 2 - 4, 1, 4, 'slit'), ...lancets('right', 0, l, 1, h / 2, 2, 5),
  ];
  // Black stone with a bone frieze under the parapet (and a second at mid-height when grand).
  const mat = (zz: number): Mat => (zz > h - 7 && zz < h - 2 ? 'bone' : tier >= 4 && zz > h * 0.45 && zz < h * 0.45 + 3.6 ? 'frieze' : 'black');
  frustum(P.px, u - 2, u - 2, 0, l + 4, l + 4, 4, 1.2, (f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 13));
  box(P.px, u, u, 4, l, l, h - 4, wrap(gwall(P, 4, h - 4, holes.map((o) => ({ ...o, a: o.a + (o.face === 'left' ? u : u), z: o.z - 4 })), (zz) => mat(zz + 4), 11, { ivy: 0.32 })));
  // Buttresses up the visible corners and faces.
  if (tier >= 3)
    for (const [bu, bv] of [[u + l - 1, u + l - 1], [u + l - 1, u + l / 2 - 1], [u + l / 2 - 1, u + l - 1]] as const) {
      box(P.px, bu, bv, 0, 2.5, 2.5, h - 8, wrap(gwall(P, 0, h - 8, [], 'black', 14)));
      box(P.px, bu - 0.3, bv - 0.3, h - 10, 3.1, 3.1, 2, wrap(gwall(P, h - 10, 2, [], 'bone', 15)));
    }
  // Parapet: skull merlons.
  const merl = wrap(gwall(P, h, 3, [], 'bone', 16));
  for (let i = 0; i + 2 <= l; i += 4) {
    box(P.px, u + i, u + l - 2, h, 2, 2, 2.5, merl);
    box(P.px, u + l - 2, u + i, h, 2, 2, 2.5, merl);
    box(P.px, u + i, u, h, 2, 2, 2.5, merl);
    box(P.px, u, u + i, h, 2, 2, 2.5, merl);
  }
  // The forebuilding: a stair and an iron-bound door toward the yard.
  box(P.px, u + l, u + l / 2 - 5, 0, 6, 10, 9, wrap(gwall(P, 0, 9, [{ face: 'right', a: u + l / 2 - 2, w: 4, z: 0, h: 7, kind: 'door' }], 'black', 12, { ivy: 0.4 })));
  wreath(P, u + l + 6.2, u + l / 2, 5.6);
  wallLantern(P, u + l + 6.4, u + l / 2 - 3.6, 4.6);
  cobweb(P, u + l + 6.05, u + l / 2 - 4.9, 8.8);
  if (tier >= 3) gargoyles(P, u, u, l, l, h - 8);
  if (tier >= 3) {
    for (const [tu, tv] of [[u - 2, u - 2], [u + l - 3, u - 2], [u - 2, u + l - 3], [u + l - 3, u + l - 3]] as const) pinnacle(P, tu, tv, h - 4, 10, tu + tv);
    if (tier >= 4) {
      // The lich's needle: a spire twice the tower's width high, crowned with grave-light.
      // A drum of bone-banded stone carries the needle above the parapet.
      const nl = l * 0.42;
      const nu = 36 - nl / 2;
      box(P.px, u + 2, u + 2, h, l - 4, l - 4, 2, wrap(gwall(P, h, 2, [], 'black', 17)));
      box(P.px, nu - 1, nu - 1, h + 2, nl + 2, nl + 2, 7, wrap(gwall(P, h + 2, 7, [...lancets('left', nu - 1, nl + 2, 2, 1.5, 1.5, 4.5), ...lancets('right', nu - 1, nl + 2, 2, 1.5, 1.5, 4.5)], (zz) => (zz > 4.5 ? 'bone' : 'black'), 18)));
      spire(P, nu - 1, nu - 1, h + 9, nl + 2, 40);
      P.pole(parts, u + l - 2, u + l - 2, h + 6, 10, 7, 5);
    } else {
      pyramid(P.px, u + 1, u + 1, h, l - 2, l - 2, 10, 0.4, roofSh(P, 'slate'));
      P.pole(parts, 36, 36, h + 10, 8, 7, 5);
    }
  } else P.pole(parts, 36, 36, h, 12, 7, 5);
  torch(parts, u + l + 7, u + l / 2, 8);
}

function chapter(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    // A roofless ruin: walls broken off in a ragged line, an empty arch in the east gable.
    const u0 = 92;
    const v0 = 18;
    const lu = 32;
    const lv = 18;
    const h = 11;
    const ruin = (sh: PShader): PShader => (f, p) => {
      const along = f === 'left' ? p.u : p.v;
      const top = h - 4 + Math.sin(along * 0.7) * 2 + hash(Math.floor(along), 0, 5) * 3;
      return p.z > top ? 0 : sh(f, p);
    };
    const holes: Hole[] = [...lancets('left', u0, lu, 3, 3, 2.5, 6), { face: 'right', a: v0 + lv / 2 - 2.5, w: 5, z: 2, h: 8, kind: 'lancet' }];
    box(P.px, u0, v0, 0, lu, lv, h, wrap(ruin(gwall(P, 0, h, holes, 'black', 21))), false);
    bonePile(P, u0 + 10, v0 + lv + 4, 3, 2, 22);
    for (let i = 0; i < 4; i++) box(P.px, u0 + 4 + i * 7, v0 + lv + 6 + (i % 2) * 3, 0, 2, 2, 1 + (i % 2), (f) => lit(st.stone, f));
    torch(parts, u0 + lu + 1, v0 + lv / 2 + 4, 6);
    return;
  }
  const lu = tier === 2 ? 40 : tier === 3 ? 46 : 50;
  const lv = tier === 2 ? 20 : tier === 3 ? 22 : 24;
  const u0 = tier === 4 ? 80 : 84;
  const v0 = 14;
  const h = tier === 2 ? 13 : tier === 3 ? 16 : 18;
  const holes: Hole[] = [
    ...lancets('left', 0, lu, tier >= 3 ? 5 : 4, 3, 3, h - 6, tier >= 3 ? 'osslancet' : 'lancet'),
    { face: 'right', a: lv / 2 - 2.5, w: 5, z: 0, h: 8, kind: 'door' },
    { face: 'right', a: lv / 2 - 3.5, w: 7, z: h + 1, h: 7, kind: 'rose' },
  ];
  const rh = hall(P, u0, v0, 0, lu, lv, h, true, holes, (zz) => (zz > h - 3.5 && zz < h - 0.8 && tier >= 3 ? 'bone' : 'black'), 'slate', 23, 1.0, false, { ivy: 0.3, ruin: tier >= 3 ? [lu * 0.62, lv * 0.32, 5, 3.2] : undefined });
  // The rose window and the west door throw grave-light.
  glow(u0 + lu + 0.3, v0 + lv / 2, h + 4.5, 0);
  // Buttresses down the nave, flying ones when grand.
  if (tier >= 3)
    for (let u = u0 + 5; u < u0 + lu - 3; u += 9) {
      box(P.px, u, v0 + lv, 0, 2.5, 3, h - 2, wrap(gwall(P, 0, h - 2, [], 'black', 24)));
      pyramid(P.px, u, v0 + lv, h - 2, 2.5, 3, 3, 0.1, roofSh(P, 'slate'));
      if (tier >= 4) {
        if ((u - u0) % 18 > 8 || u < u0 + 13) continue;
        box(P.px, u, v0 + lv + 6, 0, 2.5, 2.5, h - 2, wrap(gwall(P, 0, h - 2, [], 'black', 25)));
        pinnacle(P, u, v0 + lv + 6, h - 2, 3, u);
        for (let k = 0; k <= 12; k++) {
          const f = k / 12;
          const z = h - 4 + 5 * f + 2 * Math.sin(f * Math.PI);
          P.px.point(v3(u + 1.2, v0 + lv + 6 - 6 * f, z), st.stone[1]);
          P.px.point(v3(u + 1.2, v0 + lv + 6 - 6 * f, z - 0.5), st.stone[2]);
        }
      }
    }
  if (tier === 2) {
    // A bell-cote over the west gable.
    const z = h + rh - 2;
    box(P.px, u0 + lu - 3, v0 + lv / 2 - 3, z - 3, 3, 6, 8, wrap(gwall(P, z - 3, 8, [{ face: 'right', a: v0 + lv / 2 - 1.5, w: 3, z: 3, h: 4, kind: 'lancet' }], 'black', 26)));
    parts.bells.push([Math.floor(sx(u0 + lu, v0 + lv / 2)), Math.floor(sy(u0 + lu, v0 + lv / 2, z + 2))]);
  } else {
    // A bell tower and spire at the west end; when grand, a second tower left broken.
    const tu = u0 + lu - 2;
    const tv = v0 + lv / 2 - 7;
    const th = h + 20 + (tier >= 4 ? 6 : 0);
    box(P.px, tu, tv, 0, 14, 14, th, wrap(gwall(P, 0, th, [
      { face: 'left', a: tu + 4.5, w: 4, z: th - 9, h: 7, kind: 'lancet' }, { face: 'right', a: tv + 5, w: 4, z: th - 9, h: 7, kind: 'lancet' },
      { face: 'right', a: tv + 5, w: 4, z: 0, h: 8, kind: 'door' }, { face: 'left', a: tu + 6, w: 2, z: 5, h: 6, kind: 'lancet' },
    ], (zz) => (zz > th - 12 && zz < th - 10 ? 'bone' : 'black'), 27)));
    spire(P, tu, tv, th, 14, tier >= 4 ? 30 : 20);
    gargoyles(P, tu, tv, 14, 14, th - 3);
    wallLantern(P, tu + 14.3, tv + 3.6, 5.5);
    wallLantern(P, tu + 14.3, tv + 10.4, 5.5);
    wreath(P, tu + 14.2, tv + 7, 6.2);
    cobweb(P, tu + 14.05, tv + 4.6, 8);
    for (const [pu, pv] of [[tu - 0.5, tv - 0.5], [tu + 12, tv - 0.5], [tu - 0.5, tv + 12], [tu + 12, tv + 12]] as const) pinnacle(P, pu, pv, th - 1, 4, pu + pv);
    parts.bells.push([Math.floor(sx(tu + 14, tv + 7)), Math.floor(sy(tu + 14, tv + 7, th - 5))]);
    if (tier >= 4) {
      // A transept tower on the near side, left broken (Whitby): its top a ragged stair of
      // stone against the sky, an empty lancet, its fallen stones heaped at its foot.
      const bu = u0 + 1;
      const bv = v0 + lv + 1;
      const top = (along: number) => 20 + Math.abs(((along * 0.9) % 6) - 3) * 2.2 + hash(Math.floor(along * 2), 0, 3) * 3 + (along - (bu + bv)) * 0.25;
      const broke: PShader = (f, p) => {
        const along = f === 'left' ? p.u : p.v;
        if (p.z > top(along + (f === 'left' ? bv : bu))) return 0;
        return gwall(P, 0, 34, [
          { face: 'left', a: bu + 3, w: 4, z: 10, h: 9, kind: 'lancet' }, { face: 'right', a: bv + 3, w: 4, z: 10, h: 9, kind: 'lancet' },
        ], (zz) => (zz > 16 && zz < 18 ? 'bone' : 'black'), 28)(f, p);
      };
      box(P.px, bu, bv, 0, 10, 10, 34, wrap(broke), false);
      // The tower is hollow: its inner walls show dark above the break.
      box(P.px, bu + 1.2, bv + 1.2, 12, 7.6, 7.6, 10, () => tone(st.stone[3], 0.2), false);
      bonePile(P, bu + 12, bv + 6, 2.5, 1.6, 29);
      for (let i = 0; i < 6; i++) box(P.px, bu + 10.5 + hash(i, 1) * 4, bv + 1 + hash(i, 2) * 8, 0, 1.6, 1.6, 1 + (i % 2), (f) => lit(st.stone, f));
      P.pole(parts, tu + 1, tv + 13, th, 10, 7, 5);
    }
  }
  torch(parts, u0 + lu + 1, v0 + lv / 2 + 4, 7);
}

function barracks(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const lu = tier === 1 ? 26 : 30;
  const lv = tier === 1 ? 42 : tier === 2 ? 50 : 54;
  const u0 = 14;
  const v0 = 74;
  if (tier === 1) {
    // A long barrow for the risen, its door toward the drill yard.
    barrow(P, u0 + lu / 2, v0 + lv / 2, lu / 2, lv / 2, 8, 31, false);
    const du = u0 + lu - 1;
    const dv = v0 + lv / 2;
    for (const dvv of [-3.5, 2]) box(P.px, du, dv + dvv, 0, 2, 1.6, 6, (f) => lit(st.stone, f));
    box(P.px, du - 0.4, dv - 4, 6, 2.8, 8, 1.4, (f) => lit(st.stone, f));
    box(P.px, du + 0.4, dv - 2, 0, 1.2, 4, 5.8, () => st.glass, false);
  } else {
    // The crypt hall: half sunk, walls of bone over a black plinth, a low slate roof, grated lights.
    const h = tier === 2 ? 9 : 11;
    const holes: Hole[] = [
      ...lancets('right', 0, lv, tier + 1, 3.5, 3, 3.5, 'grate').filter((o) => Math.abs(o.a + o.w / 2 - lv / 2) > 5),
      { face: 'right', a: lv / 2 - 2.5, w: 5, z: 0, h: 7, kind: 'door' },
      ...lancets('left', 0, lu, 2, 3.5, 3, 3.5, 'grate'),
    ];
    frustum(P.px, u0 - 1, v0 - 1, 0, lu + 2, lv + 2, 2, 0.4, (f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 32));
    hall(P, u0, v0, 2, lu, lv, h, false, holes, (zz) => (zz < 1.2 ? 'black' : zz < 6.7 ? 'niche' : 'bone'), 'slate', 33, 0.55, false, { ivy: 0.2 });
    if (tier >= 3) {
      // Bone pyramids at the corners, as in Sedlec's chapel.
      for (const [pu, pv] of [[u0 + lu + 4, v0 + 3], [u0 + lu + 4, v0 + lv - 3]] as const) bonePile(P, pu, pv, 3.6, 7, pu + pv);
      // A squat tower at the yard end, its top a skull frieze.
      const tu = u0 + lu - 9;
      const tv = v0 - 6;
      box(P.px, tu, tv, 0, 12, 12, 22, wrap(gwall(P, 0, 22, [...lancets('left', tu, 12, 1, 11, 3, 6, 'osslancet'), ...lancets('right', tv, 12, 1, 11, 3, 6, 'osslancet')], (zz) => (zz > 17 ? 'frieze' : 'black'), 34, { ivy: 0.3 })));
      gargoyles(P, tu, tv, 12, 12, 16);
      if (tier >= 4) {
        spire(P, tu, tv, 22, 12, 20);
        P.pole(parts, tu + 12, tv + 12, 0, 26, 7, 5);
      } else pyramid(P.px, tu, tv, 22, 12, 12, 7, 0.5, roofSh(P, 'slate'));
    }
    if (tier >= 2) P.pole(parts, u0 + lu + 2, v0 + lv / 2 - 6, 0, 18, 6, 5);
  }
  // The bonewright's hearth at the south end (the smith's place in every town).
  const fv = v0 + lv + 1;
  box(P.px, u0 + 2, fv, 0, 16, 10, 2, wrap(gwall(P, 0, 2, [], 'rubble', 35)));
  for (const [pu, pv] of [[u0 + 2, fv + 10], [u0 + 18, fv + 10], [u0 + 18, fv]] as const) post(P.px, pu, pv, 0, 9, st.timber[1], st.timber[2]);
  P.px.quad(v3(u0 + 1, fv - 1, 11), v3(19, 0, 0), v3(0, 13, -3), (_s, t, p) => roofSh(P, 'slate')('left', _s, 13 - t, p));
  box(P.px, u0 + 4, fv + 2, 0, 5, 5, 5, wrap(gwall(P, 0, 5, [], 'black', 36)));
  P.chimney(parts, u0 + 5, fv + 3, 5, 12);
  parts.forges.push([Math.floor(sx(u0 + 9, fv + 5)), Math.floor(sy(u0 + 9, fv + 5, 2))]);
  box(P.px, u0 + 12, fv + 6, 0, 2, 2, 3, P.flat(st.slate[2]));
  torch(parts, u0 + lu + 1, v0 + lv / 2 - 4, 8);
}

function range(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  // A broken lychgate over the archers' mark: posts, a sagging slate roof.
  const ph = tier === 1 ? 7 : 9;
  for (const v of [40, 52, 64]) post(P.px, 206, v, 0, ph, st.timber[1], st.timber[2]);
  for (const v of [40, 64]) post(P.px, 214, v, 0, ph, st.timber[2]);
  if (tier >= 2) gable(P.px, 204, 39, ph, 12, 26, 6, false, 1, roofSh(P, tier >= 3 ? 'slate' : 'thatch', tier < 4), wrap(gwall(P, ph, 6, [], 'boards', 41)));
  // The fletcher's shed: rotten boards.
  hall(P, 180, 12, 0, 24, 16, tier === 1 ? 7 : 9, true, [{ face: 'left', a: 4, w: 3, z: 0, h: 5, kind: 'door' }], tier >= 3 ? 'black' : 'boards', tier >= 3 ? 'slate' : 'thatch', 42, 0.7, tier < 3);
  // Targets before a bank of bones: round boards on stakes, a skull at the gold.
  const n = Math.min(4, 1 + Math.floor(level / 4));
  for (let i = 0; i < n; i++) bonePile(P, 145, 41 + i * 7, 3, 4, 43 + i);
  for (let i = 0; i < n; i++) {
    const cu = 152.5;
    const cv = 43 + i * 7;
    const cz = 6;
    line3(P.px, v3(cu, cv, 0), v3(cu, cv, cz - 2), st.timber[2]);
    for (let dv = -3; dv <= 3; dv += 0.2)
      for (let dz = -3; dz <= 3; dz += 0.2) {
        const r = Math.hypot(dv, dz);
        if (r > 3) continue;
        const ring = r < 0.9 ? st.fine[0] : r < 1.6 ? hex('#2a2428') : r < 2.3 ? lit(st.timber, 'left') : r < 2.6 ? hex('#2a2428') : st.timber[1];
        P.px.point(v3(cu, cv + dv, cz + dz), ring);
      }
    P.px.point(v3(cu + 0.2, cv - 0.3, cz + 0.2), hex('#2a2428'));
    P.px.point(v3(cu + 0.2, cv + 0.3, cz + 0.2), hex('#2a2428'));
    parts.targets.push([Math.floor(sx(cu, cv)), Math.floor(sy(cu, cv, cz))]);
  }
  if (tier >= 2) P.pole(parts, 204, 30, 0, 16, 6, 4, true);
  if (tier >= 4) P.pole(parts, 150, 36, 0, 18, 7, 5);
}

function granary(P: Painter, tier: number, level: number, parts: BuildingParts): void {
  const st = P.st;
  if (tier === 1) {
    // A dead-house: a board shed on stone feet, a ragged thatch.
    for (const [u, v] of [[166, 80], [186, 80], [166, 94], [186, 94]] as const) box(P.px, u, v, 0, 2, 2, 2, (f) => lit(st.stone, f));
    hall(P, 164, 78, 2, 26, 20, 7, true, [{ face: 'left', a: 10, w: 4, z: 0, h: 5.5, kind: 'door' }], 'boards', 'thatch', 51, 0.6, true);
  } else if (tier < 4) {
    // A charnel house: black stone, grated windows full of skulls; then an ossuary annex in bone.
    hall(P, 162, 78, 0, 30, 20, 11, true, [
      { face: 'left', a: 13, w: 4, z: 0, h: 7, kind: 'door' }, ...lancets('left', 0, 30, 4, 4, 2.5, 4, 'grate').filter((o) => Math.abs(o.a - 13.5) > 3),
      ...lancets('right', 0, 20, 1, 5, 3, 4, 'grate'),
    ], 'black', 'slate', 52, 0.85, false, { ivy: 0.35, ruin: tier === 2 ? [10, 5, 4, 2.6] : undefined });
    wallLantern(P, 177, 98.3, 5.5);
    wreath(P, 177.5, 98.2, 7.6);
    if (tier >= 3) {
      box(P.px, 194, 80, 0, 10, 16, 8, wrap(gwall(P, 0, 8, [], 'bone', 53)));
      pyramid(P.px, 194, 80, 8, 10, 16, 5, 0.6, roofSh(P, 'lead'));
    }
  } else {
    // A domed mausoleum on a stepped plinth, a portico of four columns, urns at its corners.
    const u0 = 166;
    const v0 = 76;
    const l = 22;
    frustum(P.px, u0 - 2, v0 - 2, 0, l + 4, l + 4, 2.5, 1, (f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 54));
    box(P.px, u0, v0, 2.5, l, l, 12, wrap(gwall(P, 2.5, 12, [
      { face: 'right', a: v0 + l / 2 - 2.5, w: 5, z: 0, h: 9, kind: 'door' }, ...lancets('left', u0, l, 2, 3, 2.5, 7),
    ], (zz) => (zz > 8.5 && zz < 11 ? 'bone' : 'black'), 55)));
    drum(P.px, u0 + l / 2, v0 + l / 2, 14.5, 8, 3, 16, wrap(gwall(P, 14.5, 3, [], 'bone', 56)));
    cone(P.px, u0 + l / 2, v0 + l / 2, 17.5, 8.5, 7, 16, roofSh(P, 'lead'));
    P.px.point(v3(u0 + l / 2, v0 + l / 2, 25), st.violet);
    glow(u0 + l / 2, v0 + l / 2, 25, 1);
    // The tomb door breathes violet.
    glow(u0 + l + 0.5, v0 + l / 2, 5, 1);
    for (let i = 0; i < 4; i++) {
      const v = v0 + 3 + i * ((l - 6) / 3);
      box(P.px, u0 + l + 2, v - 0.7, 2.5, 1.4, 1.4, 9.5, (f) => lit(st.fine, f));
    }
    box(P.px, u0 + l, v0 + 1, 12, 4, l - 2, 1.5, (f) => lit(st.stone, f));
    // The pediment over the portico: a lead-roofed gable, a skull in its tympanum.
    gable(P.px, u0 + l - 0.5, v0 + 1, 13.5, 4.5, l - 2, 4, true, 0.4, roofSh(P, 'lead'), (f, _s, t, p) => (Math.hypot(p.v - (v0 + l / 2), t - 1.4) < 0.9 ? st.fine[t > 1.4 ? 0 : 2] : t < 0.4 ? lit(st.fine, f, 1) : lit(st.stone, f)));
    // Steps up to the door.
    for (let i = 0; i < 3; i++) box(P.px, u0 + l + 4 + i * 0.9, v0 + l / 2 - 4, 0, 1, 8, 2.5 - i * 0.8, (f) => lit(st.stone, f, f === 'top' ? 0 : 1));
    // Weeping angels either side, sarcophagi and obelisks before, a railing with a gate round it all.
    angel(P, u0 + l + 6, v0 + 2, false);
    angel(P, u0 + l + 6, v0 + l - 2, true);
    sarcophagus(P, u0 + l + 9, v0 + 1, false);
    sarcophagus(P, u0 + l + 9, v0 + l - 6, false);
    railing(P, u0 - 3, v0 + l + 3, u0 + l + 14, v0 + l + 3, 4);
    railing(P, u0 + l + 14, v0 - 3, u0 + l + 14, v0 + l + 3, 4, true);
    candles(P, u0 + l + 7.5, v0 + l / 2 + 4.5, 0, 3);
    for (const [pu, pv] of [[u0 - 1, v0 + l], [u0 + l, v0 - 1], [u0 + l, v0 + l]] as const) {
      box(P.px, pu - 0.8, pv - 0.8, 14.5, 1.6, 1.6, 2, (f) => lit(st.fine, f));
      P.px.point(v3(pu, pv, 17), st.fine[0]);
    }
    P.pole(parts, 204, 100, 0, 16, 6, 5, true);
  }
  // Shrouded dead laid out by the door, more with the streak.
  const n = Math.min(8, 1 + Math.floor(level / 2));
  for (let i = 0; i < n; i++) {
    const u = 166 + (i % 4) * 3.4;
    const v = 104 + Math.floor(i / 4) * 3;
    box(P.px, u, v, 0, 2.2, 3.4, 1.2, (f) => (f === 'top' ? st.fine[1] : f === 'left' ? st.fine[2] : st.fine[3]));
  }
}

function stables(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const lu = tier <= 2 ? 26 : 30;
  const lv = tier === 1 ? 46 : tier === 2 ? 56 : 62;
  const u0 = 14;
  const v0 = 148;
  const h = tier >= 3 ? 12 : 9;
  const n = tier + 2;
  const holes: Hole[] = [...lancets('right', 0, lv, n, 0, 5, 7, 'stall'), ...lancets('left', 0, lu, 1, 0, 4, 7, 'door')];
  hall(P, u0, v0, 0, lu, lv, h, false, holes, tier >= 3 ? 'black' : 'boards', tier >= 3 ? 'slate' : 'thatch', 61, 0.6, tier < 3);
  for (let i = 0; i < n; i++) {
    const v = v0 + ((i + 0.5) * lv) / n;
    parts.stalls.push([Math.floor(sx(u0 + lu, v)), Math.floor(sy(u0 + lu, v, 5))]);
    // A horse skull nailed over each stall.
    if (tier >= 2) {
      P.px.point(v3(u0 + lu + 0.2, v, 8.2), st.fine[0]);
      P.px.point(v3(u0 + lu + 0.2, v + 0.5, 8.2), st.fine[1]);
      P.px.point(v3(u0 + lu + 0.2, v, 7.7), st.fine[2]);
    }
  }
  if (tier >= 4) P.pole(parts, u0 + lu / 2, v0, h + 18, 9, 7, 5);
  // A trough of black water and a heap of bones for the carrion horses.
  box(P.px, u0 + lu + 6, v0 + 4, 0, 4, 10, 2.5, (f, s, t) => (f === 'top' ? (s > 0.6 && s < 3.4 && t > 0.6 && t < 9.4 ? hex('#1e2420') : st.timber[1]) : lit(st.timber, f)));
  bonePile(P, u0 + lu + 6, v0 + lv - 6, 3.2, 2.5, 62);
}

function workshop(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 172;
  const v0 = 140;
  const lu = tier === 1 ? 30 : 38;
  const lv = tier === 1 ? 26 : 32;
  const h = tier === 1 ? 9 : 12;
  const back = gwall(P, 0, h, [], tier >= 2 ? 'black' : 'boards', 71);
  box(P.px, u0, v0, 0, 3, lv, h, wrap(back));
  box(P.px, u0, v0, 0, lu, 3, h, wrap(back));
  for (let u = u0 + 3; u <= u0 + lu; u += lu / 3) post(P.px, u, v0 + lv, 0, h, st.timber[1], st.timber[2]);
  for (let v = v0 + 3; v <= v0 + lv; v += lv / 3) post(P.px, u0 + lu, v, 0, h, st.timber[2]);
  gable(P.px, u0 - 1, v0 - 1, h, lu + 2, lv + 2, Math.round(lu * 0.5), false, 1.6, roofSh(P, tier >= 2 ? 'slate' : 'thatch', tier < 2), wrap(back));
  // The cauldron: an iron pot on a stone ring, a green fire under it.
  const cu = u0 + 8;
  const cv = v0 + 9;
  drum(P.px, cu, cv, 0, 3.4, 1.5, 12, wrap((f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 72)));
  drum(P.px, cu, cv, 1.5, 3, 3, 12, (f) => (f === 'left' ? hex('#3a3a42') : hex('#22222a')));
  box(P.px, cu - 2.2, cv - 2.2, 4.4, 4.4, 4.4, 0.2, (_f, _s, _t, p) => P.glassAt(p, mix(st.accent, hex('#20301e'), 0.4)), true);
  parts.smoke.push([Math.floor(sx(cu, cv)), Math.floor(sy(cu, cv, 5))]);
  glow(cu, cv, 5, 0);
  torch(parts, cu + 3.5, cv + 3.5, 0);
  // Bone heaps sorted by kind, and planks of black timber.
  bonePile(P, u0 + 22, v0 + 10, 4, 3.5, 73);
  bonePile(P, u0 + 26, v0 + 20, 3, 2.5, 74);
  for (let i = 0; i < 3; i++) box(P.px, u0 - 2 - (i % 2), v0 + lv + 4, i * 2, 20, 3, 2, wrap(gwall(P, i * 2, 2, [], 'boards', i)));
  if (tier >= 3) {
    // A gibbet crane, a cage hanging from it.
    const gu = u0 + lu + 6;
    const gv = v0 + lv + 4;
    line3(P.px, v3(gu, gv, 0), v3(gu, gv, 22), st.timber[2]);
    line3(P.px, v3(gu + 1, gv, 0), v3(gu + 1, gv, 22), st.timber[1]);
    line3(P.px, v3(gu, gv, 22), v3(gu, gv + 9, 22), st.timber[1]);
    line3(P.px, v3(gu, gv + 2, 19), v3(gu, gv + 5, 22), st.timber[2]);
    line3(P.px, v3(gu, gv + 9, 22), v3(gu, gv + 9, 15), hex('#4a4a50'));
    for (let z = 9; z < 15; z += 0.5) for (const dv of [-1.2, 1.2]) P.px.point(v3(gu, gv + 9 + dv, z), hex('#4a4a50'));
    P.px.point(v3(gu, gv + 9, 13), st.fine[0]);
  }
  if (tier >= 4) P.pole(parts, u0 + lu + 2, v0 + 2, 0, 20, 7, 5);
}

function hospital(P: Painter, tier: number, parts: BuildingParts): void {
  const st = P.st;
  const u0 = 98;
  const v0 = 186;
  const lu = tier === 1 ? 28 : 38;
  const lv = tier === 1 ? 18 : 22;
  const h = tier === 1 ? 8 : tier === 2 ? 11 : 13;
  // The pit: a dark hole ringed with stones, bones at its lip; grated over from the fortified tier.
  const pu = 146;
  const pv = 206;
  mound(P.px, pu, pv, 6, 5, 0.6, (n) => (n > 0 ? tone(st.daub[2], 0.1) : st.daub[3]));
  for (let a = 0; a < Math.PI * 2; a += 0.25) {
    const u = pu + Math.cos(a) * 4;
    const v = pv + Math.sin(a) * 3.2;
    P.px.point(v3(u, v, 0.7), tier >= 3 ? lit(st.stone, 'left') : st.fine[1]);
  }
  for (let u = pu - 3.5; u < pu + 3.5; u += 0.5)
    for (let v = pv - 2.8; v < pv + 2.8; v += 0.5) {
      if (((u - pu) / 3.5) ** 2 + ((v - pv) / 2.8) ** 2 > 1) continue;
      const grate = tier >= 3 && (Math.abs((u * 2) % 3) < 0.6 || Math.abs((v * 2) % 3) < 0.6);
      P.px.point(v3(u, v, 0.65), grate ? hex('#3e3e46') : hash(Math.floor(u * 2), Math.floor(v * 2), 9) < 0.18 ? st.fine[2] : hex('#120e10'));
    }
  if (tier === 1) {
    hall(P, u0, v0, 0, lu, lv, h, true, [...lancets('left', 0, lu, 2, 3, 2, 3), { face: 'right', a: lv / 2 - 2, w: 4, z: 0, h: 6, kind: 'door' }], 'boards', 'thatch', 81, 0.65, true);
  } else if (tier < 4) {
    // The embalming house: dark half-timbering, a tall chimney for the fires.
    hall(P, u0, v0, 0, lu, lv, h, true, [
      ...lancets('left', 0, lu, tier + 1, 4, 3, 3.5, 'shutter'),
      { face: 'right', a: lv / 2 - 2, w: 4, z: 0, h: 7, kind: 'door' },
    ], tier >= 3 ? (zz) => (zz < 4 ? 'black' : 'timber') : 'timber', 'slate', 82, 0.75, false, { ivy: 0.22 });
    // The plague doctor's sign over the street, coffins stacked by the door, a chalked cross on it.
    plagueSign(P, u0 + 5, v0 + lv, 10);
    coffinStack(P, u0 + lu + 1.5, v0 + 1, 6, true);
    wallLantern(P, u0 + lu + 0.3, v0 + lv / 2 + 3.4, 5);
  } else {
    // The domed embalming hall: black stone, a bone band, a lead dome with a green lantern.
    box(P.px, u0, v0, 0, lu, lv, h, wrap(gwall(P, 0, h, [
      ...lancets('left', u0, lu, 4, 3, 2.5, 7), { face: 'right', a: v0 + lv / 2 - 2.5, w: 5, z: 0, h: 8, kind: 'door' },
    ], (zz) => (zz > h - 4 && zz < h - 1 ? 'bone' : 'black'), 83)));
    drum(P.px, u0 + lu / 2, v0 + lv / 2, h, 8, 2.5, 16, wrap(gwall(P, h, 2.5, [], 'bone', 84)));
    cone(P.px, u0 + lu / 2, v0 + lv / 2, h + 2.5, 8.6, 7, 16, roofSh(P, 'lead'));
    box(P.px, u0 + lu / 2 - 1, v0 + lv / 2 - 1, h + 9.5, 2, 2, 2, (_f, _s, _t, p) => P.glassAt(p, st.glass));
    P.pole(parts, u0 + lu, v0 + 2, h, 10, 7, 5);
  }
  P.chimney(parts, u0 + 5, v0 + 4, h + 4, tier >= 2 ? 9 : 5);
  torch(parts, u0 + lu + 1, v0 + lv / 2 - 4, 8);
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
  const skull = (u: number, v: number, z: number) => {
    P.px.point(v3(u, v, z), st.fine[0]);
    P.px.point(v3(u + 0.5, v, z), st.fine[1]);
    P.px.point(v3(u, v, z + 0.5), st.fine[0]);
    P.px.point(v3(u + 0.25, v + 0.25, z + 0.1), hex('#1a1416'));
  };
  const run = (u0: number, v0: number, lu: number, lv: number, hh: number) => {
    if (lu <= 0 || lv <= 0) return;
    const along = lu > lv;
    const len = along ? lu : lv;
    if (tier === 1) {
      // Sharpened stakes, every fifth one crowned with a skull, bound with a bone fence between.
      for (let i = 0; i < len; i += 2) {
        const u = along ? u0 + i : u0 + 2;
        const v = along ? v0 + 2 : v0 + i;
        const lh = hh - 2 + (hash(i, u0 + v0) < 0.5 ? 1 : 0);
        box(P.px, u, v, 0, 1.2, 1.2, lh, (f) => (f === 'top' ? st.timber[0] : f === 'left' ? st.timber[1] : st.timber[2]));
        P.px.point(v3(u + 0.6, v + 0.6, lh + 0.6), st.timber[0]);
        if (Math.floor(i / 2) % 5 === 0) skull(u + 0.3, v + 0.3, lh + 0.8);
      }
      for (const z of [2, 4.5]) line3(P.px, along ? v3(u0, v0 + 2.6, z) : v3(u0 + 2.6, v0, z), along ? v3(u0 + lu, v0 + 2.6, z) : v3(u0 + 2.6, v0 + lv, z), st.fine[2]);
      return;
    }
    const mat: Mat | ((zz: number) => Mat) = tier === 2 ? 'rubble' : (zz) => (zz > hh - 3.2 && zz < hh - 1 ? 'bone' : 'black');
    const face = gwall(P, 0, hh, [], mat, u0 + v0, { ivy: 0.16 });
    const top: PShader = (f, p) => (f === 'top' ? tone(st.stone[2], Math.floor(p.u + p.v) % 4 === 0 ? 0.3 : 0.15) : face(f, p));
    box(P.px, u0, v0, 0, lu, lv, hh, wrap(top));
    // Merlons: broken rubble, black stone, or skulls when grand.
    const m = 2;
    for (let i = 0; i + m <= len; i += 4) {
      if (tier === 2 && hash(i, u0 + v0, 7) < 0.3) continue;
      const mh = tier === 2 ? 1.5 + hash(i, u0, 8) * 1.5 : 2.6;
      const ms = wrap(gwall(P, hh, mh, [], tier >= 4 ? 'bone' : tier === 2 ? 'rubble' : 'black', i));
      if (along) {
        box(P.px, u0 + i, v0 + lv - m, hh, m, m, mh, ms);
        box(P.px, u0 + i, v0, hh, m, m, mh, ms);
      } else {
        box(P.px, u0 + lu - m, v0 + i, hh, m, m, mh, ms);
        box(P.px, u0, v0 + i, hh, m, m, mh, ms);
      }
    }
  };
  const towerAt = (u: number, v: number, hh: number) => {
    if (tier === 1) {
      // A watch-platform of poles with a skull-hung rail.
      for (const [du, dv] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) post(P.px, u + du, v + dv, 0, hh + 6, st.timber[1], st.timber[2]);
      box(P.px, u - 1, v - 1, hh + 4, 10, 10, 1, (f) => lit(st.timber, f, 1));
      for (let i = 0; i < 10; i += 2.5) skull(u - 1 + i, v + 9, hh + 6);
      return;
    }
    // Drum towers of black stone, a bone band, and a slate cone (a spire when grand).
    const r = tier >= 3 ? 7 : 6;
    const th2 = hh + (tier >= 3 ? 10 : 6);
    drum(P.px, u + 4, v + 4, 0, r, th2, 16, wrap(gwall(P, 0, th2, [], tier === 2 ? 'rubble' : (zz) => (zz > th2 - 4 && zz < th2 - 1.5 ? 'bone' : 'black'), u + v)));
    if (tier >= 4) cone(P.px, u + 4, v + 4, th2, r + 0.8, 18, 16, roofSh(P, 'slate'));
    else if (tier === 3) cone(P.px, u + 4, v + 4, th2, r + 0.8, 8, 16, roofSh(P, 'slate'));
    else for (let i = 0; i < 16; i += 2) {
      const an = (i / 16) * Math.PI * 2;
      box(P.px, u + 4 + Math.cos(an) * (r - 1) - 0.8, v + 4 + Math.sin(an) * (r - 1) - 0.8, th2, 1.6, 1.6, 1.8, wrap(gwall(P, th2, 2, [], 'rubble', i)));
    }
    if (tier >= 4) P.px.point(v3(u + 4, v + 4, th2 + 19), st.accent);
  };
  if (tier >= 3) towerAt(-4, -4, h);
  run(0, 0, W, th, h);
  run(0, 0, th, W, h);
  if (tier >= 3) {
    towerAt(W - 4, -4, h);
    towerAt(-4, W - 4, h);
  }
  if (tier >= 4) P.pole(parts, 4, 4, h + 10 + 3, 10, 8, 6);
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
  // The gate: skull-topped posts, a rubble arch, then a gatehouse with a portcullis and spires.
  P.reset();
  const gh = front + (tier >= 3 ? 12 : tier === 2 ? 8 : 6);
  if (tier === 1) {
    for (const v of [gate0 - 1.5, gate1]) {
      box(P.px, W - 3, v, 0, 1.5, 1.5, gh, (f) => lit(st.timber, f));
      skull(W - 2.6, v + 0.3, gh + 0.3);
    }
    line3(P.px, v3(W - 2.2, gate0 - 1, gh - 1.5), v3(W - 2.2, gate1 + 0.5, gh - 1.5), st.fine[1]);
  } else {
    const gsh = (s0: number): PShader => gwall(P, 0, gh, [{ face: 'right', a: s0 + 3, w: 2, z: gh - 7, h: 4, kind: 'lancet' }], tier === 2 ? 'rubble' : (zz) => (zz > gh - 4 && zz < gh - 1.5 ? 'bone' : 'black'), 77);
    for (const v of [gate0 - 9, gate1]) {
      box(P.px, W - 8, v, 0, 11, 9, gh, wrap(gsh(v)));
      if (tier >= 4) spire(P, W - 8, v, gh, 9, 16);
      else if (tier >= 3) pyramid(P.px, W - 8, v, gh, 11, 9, 7, 0.6, roofSh(P, 'slate'));
    }
    const arch: PShader = (f, p) => {
      if (f === 'right' && p.z < gh - 7) {
        // The portcullis: a dark iron grid over the passage.
        const along = p.v - gate0;
        return (Math.floor(along * P.k) % 3 === 0 || Math.floor(p.z * P.k) % 3 === 0) && p.z > 0.5 ? hex('#3a3a42') : tone(st.glass, -0.05);
      }
      return gwall(P, 0, gh, [], tier === 2 ? 'rubble' : 'black', 78)(f, p);
    };
    box(P.px, W - 8, gate0, 0, 11, gate1 - gate0, gh, wrap(arch));
    for (let v = gate0; v + 2 <= gate1; v += 4) box(P.px, W - 8, v, gh, 2, 2, 2.5, wrap(gwall(P, gh, 3, [], tier >= 4 ? 'bone' : 'black', v)));
  }
  torch(parts, W + 3, gate0 - 1, 9);
  torch(parts, W + 3, gate1 + 1, 9);
  if (tier >= 2) {
    P.pole(parts, W - 2, gate0 - 4, gh + (tier >= 4 ? 16 : 3), 10, 8, 6);
    P.pole(parts, W - 2, gate1 + 4, gh + (tier >= 4 ? 16 : 3), 10, 8, 6);
  }
  parts.arts.push(P.finish(W + GATE_V + 6));
  if (tier >= 3) {
    P.reset();
    towerAt(W - 4, W - 4, front);
    torch(parts, W + 6, W - 2, front + 8);
    parts.arts.push(P.finish(W * 2 + 4));
  }
  // Stakes before the walls (from level 3), some with the impaled dead's skulls.
  if (a.level >= 3) {
    P.reset();
    for (let v = 8; v < W; v += 6) {
      if (Math.abs(v - GATE_V) < 16) continue;
      line3(P.px, v3(W + 8, v, 0), v3(W + 11, v, 4), st.timber[1]);
      line3(P.px, v3(W + 8, v + 2, 0), v3(W + 11, v + 1, 4), st.timber[2]);
      if (v % 18 === 2) skull(W + 10.8, v + 0.8, 4.2);
    }
    for (let u = 8; u < W; u += 6) {
      line3(P.px, v3(u, W + 8, 0), v3(u, W + 11, 4), st.timber[1]);
      line3(P.px, v3(u + 2, W + 8, 0), v3(u + 1, W + 11, 4), st.timber[2]);
      if (u % 18 === 2) skull(u + 0.8, W + 10.8, 4.2);
    }
    parts.arts.push(P.finish(W * 2 + 30));
  }
  return parts;
}

// ------------------------------------------------------------------ registration

registerKit('undead', (P, key, a, parts) => {
  // Moonlight on every top edge, so the black stone's silhouettes read against the dark.
  P.rim = hex('#8f88cc');
  setSink(parts);
  const lights = beginLights();
  // Props are finished as their own Arts (each sorted at its own depth) before the building.
  const finish = (d: number, outline = true) => {
    parts.arts.push(P.finish(d, outline));
    P.reset();
  };
  const tier = tierOf(a.level);
  if (key === 'keep') lights.push(...fixedLights(Math.max(1, tier)));
  const done = paintKit(P, key, a, parts, tier, finish);
  endLights();
  setSink(null);
  // The light: pools baked on the stone the sources reach, and on the ground round them.
  if (done === true) bakePools(P, lights);
  if (done && lights.length) parts.arts.push(groundPools(P, lights));
  return done;
});

function paintKit(P: Painter, key: string, a: PaintArgs, parts: BuildingParts, tier: number, finish: (d: number, outline?: boolean) => void): BuildingParts | boolean | null {
  switch (key) {
    case 'walls':
      return tier === 0 ? null : walls(P, a, parts);
    case 'keep':
      yardProps(P, Math.max(1, tier), parts, finish);
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
      graveFields(P, Math.min(FIELDS.length, 1 + Math.floor(a.level / 3)), finish);
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
}

/**
 * Where the commandery has its windmill: a bone mill. A drum of black stone with a bone band and a
 * slate cap, its sails laths of long bone hung with shrouds (drawn live, city.ts); a gibbet by
 * its door. It grinds what the grave fields give up.
 */
registerMill('undead', (P, level) => {
  const st = P.st;
  P.rim = hex('#8f88cc');
  const u = 116;
  const v = -46;
  const tier = tierOf(level);
  const h = tier >= 3 ? 22 : 16;
  frustum(P.px, u - 7, v - 7, 0, 14, 14, 2, 0.8, (f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 91));
  drum(P.px, u, v, 2, 6.5, h, 14, wrap(gwall(P, 2, h, [
    { face: 'left', a: 0, w: 2, z: h * 0.55, h: 3.5, kind: 'lancet' },
    { face: 'right', a: 0, w: 3, z: 0, h: 6, kind: 'door' },
  ].map((o) => ({ ...o, face: o.face as Facing, kind: o.kind as Hole['kind'], a: o.face === 'left' ? u - 1 : v - 1.5 })), (zz) => (zz > h - 4 && zz < h - 1.5 ? 'bone' : 'black'), 92)));
  cone(P.px, u, v, h + 2, 7.4, 8, 14, roofSh(P, 'slate'));
  // The cap's finial: a skull.
  P.px.point(v3(u, v, h + 10.5), st.fine[0]);
  P.px.point(v3(u + 0.4, v, h + 10.5), st.fine[1]);
  // A gibbet by the door.
  line3(P.px, v3(u + 10, v + 4, 0), v3(u + 10, v + 4, 13), st.timber[2]);
  line3(P.px, v3(u + 10, v + 4, 13), v3(u + 10, v + 8, 13), st.timber[1]);
  line3(P.px, v3(u + 10, v + 7.5, 13), v3(u + 10, v + 7.5, 10), hex('#4a4a50'));
  for (let z = 6; z < 10; z += 0.5) for (const dv of [-0.8, 0.8]) P.px.point(v3(u + 10, v + 7.5 + dv, z), hex('#4a4a50'));
  P.px.point(v3(u + 10, v + 7.5, 9), st.fine[0]);
  const hub = v3(u + 6.5, v + 6.5, h - 2);
  return [Math.floor(sx(hub.u, hub.v)), Math.floor(sy(hub.u, hub.v, hub.z))];
});
