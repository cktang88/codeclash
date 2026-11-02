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

import { GATE_V, registerKit, tierOf, wallHeights, WALL, type BuildingParts, type Painter, type PaintArgs } from './buildings.ts';
import { box, cone, drum, gable, hash, hex, line3, mix, post, pyramid, sx, sy, tone, v3, type Col, type Facing, type Shader } from './pixels.ts';
import { frustum, mound, type PShader } from './solids.ts';
import type { Ramp } from './style.ts';

interface Hole {
  face: Facing;
  a: number;
  w: number;
  z: number;
  h: number;
  kind: 'lancet' | 'door' | 'slit' | 'rose' | 'grate' | 'stall';
}

type Mat = 'black' | 'bone' | 'rubble' | 'timber' | 'boards';

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

/** Black basalt ashlar: regular courses, joints only hinted on the shade side. */
function blackAt(P: Painter, f: Facing, along: number, zz: number, seed: number): Col {
  const st = P.st;
  const k = P.k;
  const y = Math.floor(zz * k);
  const rowH = 6;
  const row = Math.floor(y / rowH);
  const bw = 10;
  const x = Math.floor(along * k) + (row % 2) * 5;
  let c = lit(st.stone, f);
  const n = hash(Math.floor(x / bw), row, seed);
  if (n < 0.2) c = tone(c, 0.08);
  else if (n > 0.88) c = tone(c, -0.06);
  if (y % rowH === rowH - 1 || x % bw === 0) c = tone(c, f === 'left' ? 0.32 : 0.18);
  else if (f === 'left' && y % rowH === 0) c = tone(c, -0.1);
  // Streaks of damp and moss low down.
  if (zz < 2.5 && hash(x >> 1, 0, seed + 3) < 0.25) c = mix(c, hex('#4a5a3a'), 0.4);
  return c;
}

/** Rubble: rough uncoursed stones, deep joints. */
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
  if (ap - blk * bw < 1 || y - row * 4 < 1) c = tone(lit(st.stone, f), 0.45);
  return c;
}

/** A wall: a material by height band (bone friezes on black stone), with Gothic openings cut in. */
function gwall(P: Painter, z0: number, h: number, holes: Hole[], mat: Mat | ((zz: number) => Mat), seed: number): PShader {
  const st = P.st;
  const k = P.k;
  return (f, p) => {
    const along = f === 'left' ? p.u : p.v;
    const zz = p.z - z0;
    for (const o of holes) {
      if (o.face !== f) continue;
      const da = along - (o.a + o.w / 2);
      const dz = zz - o.z;
      if (o.kind === 'rose') {
        const r = Math.hypot(da, (zz - (o.z + o.h / 2)) * 1.1);
        if (r < o.w / 2) {
          if (r > o.w / 2 - 0.6) return lit(st.fine, f, 1);
          const spoke = Math.abs(Math.sin(Math.atan2(zz - (o.z + o.h / 2), da) * 4)) < 0.3 || r < 0.8;
          return spoke ? lit(st.stone, f, 1) : P.glassAt(p, st.glass);
        }
        continue;
      }
      if (dz < 0 || dz >= o.h + 0.5) continue;
      // Pointed arch: the opening narrows to a point over its last half-width.
      const half = o.w / 2;
      const spring = o.h - half * 1.3;
      const allowed = o.kind === 'slit' || o.kind === 'grate' ? half : dz < spring ? half : half * Math.max(0, 1 - ((dz - spring) / (half * 1.3)) ** 1.6);
      if (Math.abs(da) < allowed && dz < o.h) {
        if (o.kind === 'door') return Math.floor((da + half) * k) % 3 === 0 ? st.timber[3] : lit(st.timber, f, 1);
        if (o.kind === 'stall') return dz < o.h * 0.4 ? lit(st.timber, f, 1) : st.glass;
        if (o.kind === 'grate') {
          // Iron bars over a dark hole full of skulls.
          if (Math.floor((da + half) * k) % 2 === 0) return tone(st.slate[2], 0.2);
          return hash(Math.floor(along * k), Math.floor(zz * k), 9) < 0.3 ? lit(st.fine, f, 1) : st.glass;
        }
        if (o.kind === 'lancet' && Math.abs(da) < 0.5 / k + 0.01 && o.w > 2) return lit(st.stone, f, 1);
        return P.glassAt(p, st.glass);
      }
      // A dressed bone frame round the openings.
      if (o.kind !== 'slit' && Math.abs(da) < allowed + 0.6 && dz < o.h + 0.5) return lit(st.fine, f, 1);
    }
    const m = typeof mat === 'function' ? mat(zz) : mat;
    let c: Col;
    if (m === 'bone') c = boneAt(P, f, along, zz);
    else if (m === 'rubble') c = rubbleAt(P, f, along, zz, seed);
    else if (m === 'timber' || m === 'boards') {
      const x = Math.floor(along * k);
      if (m === 'boards') {
        c = x % 3 === 0 ? lit(st.timber, f, 1) : lit(st.timber, f);
        // Rotten: a few boards gone, black gaps.
        if (hash(Math.floor(x / 3), Math.floor(zz / 3), seed) < 0.07) c = st.glass;
      } else {
        const beam = x % (8 * k) < k || Math.abs(zz - h / 2) < 0.5 || zz < 0.6 || zz > h - 0.8 || (Math.floor(along / 8) % 2 === 0 && Math.abs((along % 8) - (zz / h) * 8) < 0.6);
        c = beam ? lit(st.timber, f, 1) : lit(st.daub, f);
        if (!beam && hash(x >> 1, Math.floor(zz * k) >> 1, seed) < 0.06) c = tone(c, 0.12);
      }
    } else c = blackAt(P, f, along, zz, seed);
    if (zz > h - 0.8) c = tone(c, 0.3);
    return c;
  };
}

/** Steep slate (or lead, or ragged thatch) on a gable. */
function roofSh(P: Painter, mat: 'slate' | 'lead' | 'thatch', ragged = false): Shader {
  const base = P.roof(mat === 'lead' ? 'lead' : mat === 'thatch' ? 'thatch' : 'slate', 7);
  return (f, s, t, p) => {
    if (ragged && t < 2.2 && hash(Math.floor(s * P.k), 0, 3) < 0.35 + (2.2 - t) * 0.1) return 0;
    let c = base(f, s, t, p);
    // Moss creeping up from the eaves.
    if (mat === 'slate' && t < 1.6 && hash(Math.floor(s * P.k / 2), Math.floor(t * P.k), 4) < 0.35) c = mix(c, hex('#4f5e3a'), 0.45);
    return c;
  };
}

// ------------------------------------------------------------------ parts

/** A hall: walls of a material, a steep gable roof, openings. */
function hall(P: Painter, u0: number, v0: number, z: number, lu: number, lv: number, h: number, alongU: boolean, holes: Hole[], mat: Mat | ((zz: number) => Mat), roof: 'slate' | 'lead' | 'thatch', seed: number, steep = 0.9, ragged = false): number {
  const abs = holes.map((o) => ({ ...o, a: o.a + (o.face === 'left' ? u0 : v0) }));
  const sh = gwall(P, z, h, abs, mat, seed);
  box(P.px, u0, v0, z, lu, lv, h, wrap(sh), false);
  const rh = Math.round((alongU ? lv : lu) * steep);
  gable(P.px, u0, v0, z + h, lu, lv, rh, alongU, roof === 'thatch' ? 1.6 : 1.2, roofSh(P, roof, ragged), wrap(gwall(P, z, 999, abs.filter((o) => o.kind === 'rose' || o.kind === 'lancet'), mat, seed + 1)));
  return rh;
}

/** Lancets spaced along a face. */
function lancets(face: Facing, from: number, len: number, n: number, z: number, w = 2, h = 5, kind: Hole['kind'] = 'lancet'): Hole[] {
  const out: Hole[] = [];
  for (let i = 0; i < n; i++) out.push({ face, a: from + ((i + 0.5) * len) / n - w / 2, w, z, h, kind });
  return out;
}

/** A spire: a tall slate pyramid with a finial and a green coal at the tip. */
function spire(P: Painter, u: number, v: number, z: number, l: number, h: number): void {
  pyramid(P.px, u, v, z, l, l, h, 0.6, roofSh(P, 'slate'));
  const t = v3(u + l / 2, v + l / 2, z + h);
  line3(P.px, t, v3(t.u, t.v, t.z + 3), P.st.timber[3]);
  P.px.point(v3(t.u, t.v, t.z + 3.5), P.st.accent);
}

/** A pinnacle: a little square shaft and a spirelet. */
function pinnacle(P: Painter, u: number, v: number, z: number, h: number, seed: number): void {
  box(P.px, u, v, z, 2.5, 2.5, h, wrap(gwall(P, z, h, [], 'black', seed)));
  pyramid(P.px, u, v, z + h, 2.5, 2.5, 4, 0.2, roofSh(P, 'slate'));
}

/** A heap of bones and skulls. */
function bonePile(P: Painter, u: number, v: number, r: number, h: number, seed: number): void {
  const st = P.st;
  mound(P.px, u, v, r, r * 0.8, h, (n, p) => {
    const q = hash(Math.floor(p.u * P.k), Math.floor(p.v * P.k), seed);
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
    parts.torches.push([Math.floor(sx(52, 36)), Math.floor(sy(52, 36, 5))]);
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
  const mat = (zz: number): Mat => (zz > h - 7 && zz < h - 2 ? 'bone' : tier >= 4 && zz > h * 0.45 && zz < h * 0.45 + 3 ? 'bone' : 'black');
  frustum(P.px, u - 2, u - 2, 0, l + 4, l + 4, 4, 1.2, (f, p) => blackAt(P, f, f === 'left' ? p.u : p.v, p.z, 13));
  box(P.px, u, u, 4, l, l, h - 4, wrap(gwall(P, 4, h - 4, holes.map((o) => ({ ...o, a: o.a + (o.face === 'left' ? u : u), z: o.z - 4 })), (zz) => mat(zz + 4), 11)));
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
  box(P.px, u + l, u + l / 2 - 5, 0, 6, 10, 9, wrap(gwall(P, 0, 9, [{ face: 'right', a: u + l / 2 - 2, w: 4, z: 0, h: 7, kind: 'door' }], 'black', 12)));
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
  parts.torches.push([Math.floor(sx(u + l + 7, u + l / 2)), Math.floor(sy(u + l + 7, u + l / 2, 8))]);
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
    parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 + 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 + 4, 6))]);
    return;
  }
  const lu = tier === 2 ? 40 : tier === 3 ? 46 : 50;
  const lv = tier === 2 ? 20 : tier === 3 ? 22 : 24;
  const u0 = tier === 4 ? 80 : 84;
  const v0 = 14;
  const h = tier === 2 ? 13 : tier === 3 ? 16 : 18;
  const holes: Hole[] = [
    ...lancets('left', 0, lu, tier >= 3 ? 5 : 4, 3, 2.5, h - 6),
    { face: 'right', a: lv / 2 - 2.5, w: 5, z: 0, h: 8, kind: 'door' },
    { face: 'right', a: lv / 2 - 3.5, w: 7, z: h + 1, h: 7, kind: 'rose' },
  ];
  const rh = hall(P, u0, v0, 0, lu, lv, h, true, holes, (zz) => (zz > h - 3.5 && zz < h - 0.8 && tier >= 3 ? 'bone' : 'black'), 'slate', 23, 1.0);
  // Buttresses down the nave, flying ones when grand.
  if (tier >= 3)
    for (let u = u0 + 5; u < u0 + lu - 3; u += 9) {
      box(P.px, u, v0 + lv, 0, 2.5, 3, h - 2, wrap(gwall(P, 0, h - 2, [], 'black', 24)));
      pyramid(P.px, u, v0 + lv, h - 2, 2.5, 3, 3, 0.1, roofSh(P, 'slate'));
      if (tier >= 4) {
        if ((u - u0) % 18 > 8) continue;
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
    for (const [pu, pv] of [[tu - 0.5, tv - 0.5], [tu + 12, tv - 0.5], [tu - 0.5, tv + 12], [tu + 12, tv + 12]] as const) pinnacle(P, pu, pv, th - 1, 4, pu + pv);
    parts.bells.push([Math.floor(sx(tu + 14, tv + 7)), Math.floor(sy(tu + 14, tv + 7, th - 5))]);
    if (tier >= 4) {
      // The broken tower at the east end (Whitby).
      const bu = u0 - 8;
      const bv = v0 + 2;
      const broke: PShader = (f, p) => {
        const along = f === 'left' ? p.u : p.v;
        return p.z > 26 + Math.sin(along * 1.3) * 3 + hash(Math.floor(along * 2), 0, 3) * 4 ? 0 : gwall(P, 0, 34, [
          { face: 'left', a: bu + 3.5, w: 4, z: 14, h: 9, kind: 'lancet' }, { face: 'right', a: bv + 4, w: 4, z: 14, h: 9, kind: 'lancet' },
        ], 'black', 28)(f, p);
      };
      box(P.px, bu, bv, 0, 11, 12, 34, wrap(broke), false);
      bonePile(P, bu + 13, bv + 15, 3.5, 2, 29);
      P.pole(parts, tu + 1, tv + 13, th, 10, 7, 5);
    }
  }
  parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 + 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 + 4, 7))]);
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
    hall(P, u0, v0, 2, lu, lv, h, false, holes, (zz) => (zz < 1.2 ? 'black' : 'bone'), 'slate', 33, 0.55);
    if (tier >= 3) {
      // Bone pyramids at the corners, as in Sedlec's chapel.
      for (const [pu, pv] of [[u0 + lu + 4, v0 + 3], [u0 + lu + 4, v0 + lv - 3]] as const) bonePile(P, pu, pv, 3.6, 7, pu + pv);
      // A squat tower at the yard end, its top a skull frieze.
      const tu = u0 + lu - 9;
      const tv = v0 - 6;
      box(P.px, tu, tv, 0, 12, 12, 22, wrap(gwall(P, 0, 22, [...lancets('left', tu, 12, 1, 12, 2, 5), ...lancets('right', tv, 12, 1, 12, 2, 5)], (zz) => (zz > 17 ? 'bone' : 'black'), 34)));
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
  parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 - 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 - 4, 8))]);
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
    ], 'black', 'slate', 52, 0.85);
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
    P.px.point(v3(u0 + l / 2, v0 + l / 2, 25), st.accent);
    for (let i = 0; i < 4; i++) {
      const v = v0 + 3 + i * ((l - 6) / 3);
      box(P.px, u0 + l + 2, v - 0.7, 2.5, 1.4, 1.4, 9.5, (f) => lit(st.fine, f));
    }
    box(P.px, u0 + l, v0 + 1, 12, 4, l - 2, 1.5, (f) => lit(st.stone, f));
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
  parts.torches.push([Math.floor(sx(cu + 3.5, cv + 3.5)), Math.floor(sy(cu + 3.5, cv + 3.5, 0))]);
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
      ...lancets('left', 0, lu, tier + 1, 4, 2.5, 4),
      { face: 'right', a: lv / 2 - 2, w: 4, z: 0, h: 7, kind: 'door' },
    ], tier >= 3 ? (zz) => (zz < 4 ? 'black' : 'timber') : 'timber', 'slate', 82, 0.75);
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
  parts.torches.push([Math.floor(sx(u0 + lu + 1, v0 + lv / 2 - 4)), Math.floor(sy(u0 + lu + 1, v0 + lv / 2 - 4, 8))]);
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
    const face = gwall(P, 0, hh, [], mat, u0 + v0);
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
  parts.torches.push([Math.floor(sx(W + 3, gate0 - 1)), Math.floor(sy(W + 3, gate0 - 1, 9))]);
  parts.torches.push([Math.floor(sx(W + 3, gate1 + 1)), Math.floor(sy(W + 3, gate1 + 1, 9))]);
  if (tier >= 2) {
    P.pole(parts, W - 2, gate0 - 4, gh + (tier >= 4 ? 16 : 3), 10, 8, 6);
    P.pole(parts, W - 2, gate1 + 4, gh + (tier >= 4 ? 16 : 3), 10, 8, 6);
  }
  parts.arts.push(P.finish(W + GATE_V + 6));
  if (tier >= 3) {
    P.reset();
    towerAt(W - 4, W - 4, front);
    parts.torches.push([Math.floor(sx(W + 6, W - 2)), Math.floor(sy(W + 6, W - 2, front + 8))]);
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
