// HD ground, one per faction, at twice the classic density over the 1280×720 frame: the
// commandery's grass, earth and wheat; the castle town's raked gravel, rice paddies and moat; the
// necropolis's dead turf, ash and grave fields. Clean clusters of 3-4 tones per material and a few
// deliberate tufts, never per-pixel static. Painted a band of rows at a time (a generator), so a
// level change repaints it over a few frames instead of stalling one.

import type { BuildingKey } from '../../../game/city.ts';
import { GATE_V, LOT, tierOf, WALL, type Art } from './buildings.ts';
import { FIELDS, GARDEN, PADDOCK, type Ground } from './ground.ts';
import { box, hash, hex, mix, nightCanvas, post, Px, sx, sy, tone, v3, type Col, type Footprint, type Frame } from './pixels.ts';
import { shadowAt, SUN } from './props.ts';
import { roadDistance } from './roads.ts';
import type { CityStyle } from './style.ts';

const inRect = (u: number, v: number, r: [number, number, number, number], m = 0) => u >= r[0] - m && u < r[2] + m && v >= r[1] - m && v < r[3] + m;

/** The cluster value at a buffer pixel: 3×2 cells, odd columns of cells dropped by a row. */
function cellAt(x: number, y: number): number {
  const cx = Math.floor(x / 3);
  return hash(cx, (y + (cx & 1)) >> 1, 5);
}

/** Everything the ground depends on, so it is repainted only when one of these changes. */
export function groundKey(st: CityStyle, levels: Record<BuildingKey, number>, maxLevel: number): string {
  const tiers = (Object.keys(levels) as BuildingKey[]).sort().map((k) => tierOf(levels[k]));
  return [st.id, tiers.join(''), tierOf(Math.max(maxLevel, 1)), sownOf(levels), levels.stables > 0 ? 1 : 0].join('|');
}

export const sownOf = (levels: Record<BuildingKey, number>) => Math.min(FIELDS.length, 1 + Math.floor(levels.granary / 3));

interface Pal {
  grass: Col[];
  earth: Col[];
  road: Col[];
  flags: Col[];
  soil: Col;
  tuft: Col[];
}

function palette(id: string): Pal {
  if (id === 'samurai')
    return {
      grass: [hex('#5d6a3e'), hex('#53603a'), hex('#687546'), hex('#48542f')],
      earth: [hex('#a59576'), hex('#988869'), hex('#b2a283'), hex('#8a7a5e')],
      road: [hex('#8f8064'), hex('#9a8b6e'), hex('#827358')],
      flags: [hex('#9d978a'), hex('#8f897c'), hex('#aaa496')],
      soil: hex('#4f4232'),
      tuft: [hex('#7a8a4c'), hex('#3f4a2a')],
    };
  if (id === 'undead')
    return {
      // Dead turf gone blue-grey under the necropolis's sky; ash and charcoal within.
      grass: [hex('#3c4446'), hex('#353d40'), hex('#455052'), hex('#2e3538')],
      earth: [hex('#3a3644'), hex('#332f3d'), hex('#433f4e'), hex('#2a2734')],
      road: [hex('#55536a'), hex('#5e5c73'), hex('#4b4960')],
      flags: [hex('#5f5d74'), hex('#545269'), hex('#6a6880')],
      soil: hex('#211e29'),
      tuft: [hex('#56645e'), hex('#262c2e')],
    };
  return {
    grass: [hex('#59613a'), hex('#4f5833'), hex('#646b40'), hex('#454d2e')],
    earth: [hex('#6b5b42'), hex('#62533c'), hex('#736248'), hex('#584a35')],
    road: [hex('#7b6a4e'), hex('#857356'), hex('#6e5e45')],
    flags: [hex('#8f8676'), hex('#857c6c'), hex('#999080')],
    soil: hex('#4e3d2a'),
    tuft: [hex('#737a46'), hex('#3f472a')],
  };
}

/** Trees round the commandery (u, v, radius), also kept clear by the props. */
export const TREES: [number, number, number][] = [
  [262, 40, 7], [280, 70, 6], [300, 160, 8], [290, 200, 6], [258, 228, 7], [284, 250, 6], [236, 272, 7],
  [-30, -20, 7], [-40, 230, 8], [-20, 262, 6], [10, 300, 7], [-50, 12, 6], [70, -84, 6], [236, -40, 7], [258, 4, 6],
  [120, 316, 6], [-24, 120, 5], [252, 100, 5],
  // Beyond the classic frame, in HD's margin.
  [330, 20, 7], [340, 120, 8], [320, 280, 7], [-90, 60, 7], [-96, 180, 8], [30, -120, 6], [190, -110, 7], [60, 352, 7], [200, 340, 6],
];

/** Shade trees inside the commandery's walls (HD Templar): dappled light on the lanes. */
export const INNER_TREES: [number, number, number][] = [[78, 146, 6], [214, 198, 6], [62, 216, 5]];
/** The trees a faction's town has (the commandery adds its yard trees). */
export const treesFor = (id: string): [number, number, number][] => (id === 'templar' ? [...TREES, ...INNER_TREES] : TREES);

/** The level-independent ground (grass, earth, flagstones, roads, the yard, tufts), per faction. */
const STATIC = new Map<string, Uint32Array>();

function* staticGround(id: string, frame: Frame): Generator<void, Uint32Array> {
  const key = `${id}:${frame.w}x${frame.h}:${frame.k}`;
  const done = STATIC.get(key);
  if (done) return done;
  const px = new Px(frame.w, frame.h, frame);
  const P = palette(id);
  const k = frame.k;
  // The per-pixel work lives in a plain function (V8 optimises it; generators it does not).
  const paintRow = (y: number): void => {
    const b = 2 * ((y + 0.5) / k - frame.my - 30);
    for (let x = 0; x < frame.w; x++) {
      const a = (x + 0.5) / k - frame.mx - 256;
      const u = (a + b) / 2;
      const v = (b - a) / 2;
      // Clusters: tone chosen per 3×2-pixel cell, every other column of cells a row lower, so the
      // sod reads at the art-pixel size (1 px), not as 2×2 blocks, and never as a checker.
      const cell = cellAt(x, y);
      if (id === 'templar') {
        px.set(x, y, templarAt(u, v, x, y, cell));
        continue;
      }
      const big = hash(x >> 4, y >> 3, 6);
      const inside = u > 2 && v > 2 && u < WALL - 2 && v < WALL - 2;
      let c: Col;
      if (inside) {
        const edge = Math.min(u, v, WALL - u, WALL - v);
        c = P.earth[cell < 0.55 ? 0 : cell < 0.8 ? 1 : cell < 0.93 ? 2 : 3]!;
        if (edge < 14 && big < 0.6 - edge / 30) c = P.grass[Math.floor(cell * 3)]!;
      } else {
        c = P.grass[cell < 0.5 ? 0 : cell < 0.75 ? 1 : cell < 0.92 ? 2 : 3]!;
        if (big < 0.22) c = tone(c, 0.05);
        if (big > 0.88) c = tone(c, -0.04);
      }
      // Flagstones before the keep and the chapel.
      if ((u > 56 && u < 80 && v > 22 && v < 60) || (u > 76 && u < 142 && v > 46 && v < 60)) {
        const fu = Math.floor(u / 5);
        const fv = Math.floor(v / 4);
        c = P.flags[Math.floor(hash(fu, fv) * P.flags.length)]!;
        if (u % 5 < 0.5 || v % 4 < 0.5) c = tone(c, 0.28);
        else if (u % 5 < 1 || v % 4 < 1) c = tone(c, -0.08);
      }
      // Roads, with wheel ruts (the necropolis's are a bone-grey cobble).
      const rd = roadDistance(u, v);
      if (rd < 5.5) {
        c = P.road[Math.floor(cell * P.road.length)]!;
        if (id === 'undead' && (Math.floor(u * 0.8) + Math.floor(v * 0.8)) % 3 === 0 && rd < 4.5) c = tone(c, 0.18);
        if (Math.abs(rd - 2.6) < 0.35) c = tone(c, 0.16);
        if (rd > 4.6) c = mix(c, P.earth[0]!, 0.5);
      }
      // The yard: well-beaten earth where the recruits drill.
      if (u > 84 && u < 150 && v > 70 && v < 150 && rd > 5) c = mix(c, P.road[2]!, 0.3);
      px.set(x, y, c);
    }
  };
  for (let y = 0; y < frame.h; y++) {
    paintRow(y);
    if (y % 24 === 23) yield;
  }
  // Tufts: small deliberate clumps of 3-5 pixels in the grass (not inside, not on roads).
  const [li, dk] = P.tuft;
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(hash(i, 1, 77) * frame.w);
    const y = Math.floor(hash(i, 2, 77) * frame.h);
    const [u, v] = px.ground(x, y);
    if (u > -2 && v > -2 && u < WALL + 2 && v < WALL + 2) continue;
    if (roadDistance(u, v) < 7) continue;
    if (FIELDS.some((f) => inRect(u, v, f, 2))) continue;
    px.set(x, y, li!);
    px.set(x + 1, y - 1, li!);
    px.set(x + 2, y, li!);
    px.set(x + 1, y, dk!);
    if (id === 'samurai' && i % 9 === 0) px.set(x + 1, y - 2, hex('#e8a8b8'));
    if (id === 'undead' && i % 11 === 0) px.set(x + 1, y - 2, hex('#cfc6aa'));
  }
  if (id === 'templar') {
    yield;
    meadow(px, frame);
    yield;
    treeShade(px, treesFor(id));
  }
  STATIC.set(key, px.data);
  return px.data;
}

// ------------------------------------------------------------------ the commandery's ground (HD)

const TG = {
  // Warm, sunlit materials (golden-hour ochres); the cast shadows cool them later.
  grass: [hex('#717a3c'), hex('#646d36'), hex('#7e8644'), hex('#565f30')],
  earth: [hex('#7e6748'), hex('#735d40'), hex('#8a7250'), hex('#665238')],
  beaten: [hex('#8d7656'), hex('#836c4d'), hex('#977f5c')],
  cobble: [hex('#a69a80'), hex('#988c72'), hex('#b3a78b'), hex('#8a7e66')],
  cobbleLit: hex('#c4b797'),
  cobbleDark: hex('#6f6552'),
  mortar: hex('#4a4134'),
  moss: hex('#66733a'),
  mossLit: hex('#7f8a44'),
  rut: hex('#56452f'),
  rutLit: hex('#9a8460'),
  water: [hex('#9fb4b8'), hex('#7d969e'), hex('#5f7880'), hex('#d8e4dc')],
  wet: hex('#5a4a34'),
  flags: [hex('#a49a86'), hex('#988e7a'), hex('#aea592')],
};

/** Cobbles: rounded stones on a staggered world grid, one tone each, lit at the upper left. */
function cobbleAt(u: number, v: number, rd: number): Col | null {
  const sv = 2.1;
  const su = 2.5;
  const row = Math.floor(v / sv);
  const uu = u + (row & 1) * su * 0.5 + (hash(row, 3, 61) - 0.5) * 0.6;
  const col = Math.floor(uu / su);
  const fu = uu / su - col - 0.5;
  const fv = v / sv - row - 0.5;
  const n = hash(col, row, 62);
  // The verge: stones go missing toward the edge.
  if (rd > 3.6 && n < (rd - 3.6) / 1.9) return null;
  const r = fu * fu * 1.1 + fv * fv;
  const worn = rd < 1.7;
  if (r > (worn ? 0.2 : 0.17) || Math.abs(fu) > 0.43 || Math.abs(fv) > 0.42) {
    // Mortar, with grass in the joints of the less trodden stones.
    if (!worn && hash(col >> 1, row, 63) < 0.12 + rd * 0.05) return hash(col, row >> 1, 64) < 0.5 ? TG.moss : TG.mossLit;
    return worn ? TG.cobble[3]! : TG.mortar;
  }
  let c = worn ? (n < 0.5 ? TG.cobble[0]! : TG.cobble[2]!) : TG.cobble[n < 0.35 ? 0 : n < 0.62 ? 1 : n < 0.85 ? 3 : 2]!;
  // Lit at the upper left (toward -u on screen), shaded at the lower right.
  if (fu < -0.24 && fv < 0.18) c = worn ? TG.cobbleLit : mix(c, TG.cobbleLit, 0.6);
  else if (fu > 0.26 || (fv > 0.28 && fu > -0.1)) c = mix(c, TG.cobbleDark, 0.55);
  return c;
}

/** A puddle in a hollow: water reflecting the sky, a dark wet rim, a glint. */
function puddleAt(u: number, v: number, cu: number, cv: number, ru: number, rv: number): Col | null {
  const d = ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2;
  if (d > 1.35) return null;
  if (d > 1) return TG.wet;
  // The near (upper-left) bank shades the water; the far side catches the sky.
  const t = (u - cu) / ru + (v - cv) / rv * 0.3;
  if (d < 0.12 && t > 0.1) return TG.water[3]!;
  return t < -0.45 ? TG.water[2]! : t < 0.25 ? TG.water[1]! : TG.water[0]!;
}

const PUDDLES: [number, number, number, number][] = [
  [300, 116, 3.2, 1.6], [272, 123, 2.2, 1.2], [318, 125, 2.4, 1.3], [104, 156, 3, 2], [160, 130, 2.4, 1.5], [60, 128, 2.2, 1.5], [200, 210, 2.6, 1.6],
];

/** The commandery's ground at a world point: cobbled lanes, beaten-earth yards, a rutted track outside. */
function templarAt(u: number, v: number, x: number, y: number, cell: number): Col {
  const inside = u > 2 && v > 2 && u < WALL - 2 && v < WALL - 2;
  const big = hash(x >> 4, y >> 3, 6);
  let c: Col;
  if (inside) {
    const edge = Math.min(u, v, WALL - u, WALL - v);
    c = TG.earth[cell < 0.55 ? 0 : cell < 0.8 ? 1 : cell < 0.93 ? 2 : 3]!;
    // Grass creeping in from the foot of the walls, in clumps.
    if (edge < 16 && big < 0.62 - edge / 28) c = TG.grass[Math.floor(cell * 3)]!;
    // The drill yard: beaten flat and pale.
    if (u > 84 && u < 150 && v > 70 && v < 150) c = TG.beaten[cell < 0.6 ? 0 : cell < 0.88 ? 1 : 2]!;
  } else {
    c = TG.grass[cell < 0.5 ? 0 : cell < 0.75 ? 1 : cell < 0.92 ? 2 : 3]!;
    if (big < 0.22) c = tone(c, 0.05);
    if (big > 0.88) c = tone(c, -0.05);
  }
  // Flagstones before the keep and the chapel: big slabs with lit edges.
  if ((u > 56 && u < 80 && v > 22 && v < 60) || (u > 76 && u < 142 && v > 46 && v < 60)) {
    const fv = Math.floor(v / 4);
    const fu = Math.floor((u + (fv & 1) * 2.5) / 5);
    const lu = (u + (fv & 1) * 2.5) % 5;
    const lv = v % 4;
    c = TG.flags[Math.floor(hash(fu, fv) * TG.flags.length)]!;
    if (lu < 0.5 || lv < 0.5) c = TG.mortar;
    else if (lu < 1) c = tone(c, -0.1);
    else if (lu > 4.4) c = tone(c, 0.12);
    if (lu >= 0.5 && lv >= 0.5 && hash(fu, fv, 3) < 0.15 && lu > 2 && lu < 3.2 && lv > 1.5 && lv < 2.2) c = tone(c, 0.18);
  }
  const rd = roadDistance(u, v);
  if (rd < 5.6) {
    if (inside || (u > WALL - 4 && u < WALL + 26 && Math.abs(v - GATE_V) < 12)) {
      // Cobbled lanes inside the walls and through the gate, a worn path down the middle.
      const cc = cobbleAt(u, v, rd);
      if (cc) c = cc;
      else if (rd > 4.6 && inside) c = mix(c, TG.grass[0]!, 0.4);
    } else {
      // Outside: a dirt track, two wheel ruts and a grass crown.
      c = TG.earth[cell < 0.6 ? 2 : cell < 0.9 ? 0 : 1]!;
      const off = Math.abs(rd - 2.1);
      if (off < 0.35) c = TG.rut;
      else if (off < 0.6 && rd > 2.1) c = TG.rutLit;
      if (rd < 0.9 && cell < 0.55) c = TG.grass[2]!;
      if (rd > 4.4) c = cell < 0.5 ? TG.grass[1]! : mix(c, TG.grass[0]!, 0.5);
    }
  }
  for (const [pu, pv, ru, rv] of PUDDLES) {
    if (Math.abs(u - pu) > ru * 1.2 || Math.abs(v - pv) > rv * 1.2) continue;
    const w = puddleAt(u, v, pu, pv, ru, rv);
    if (w) c = w;
  }
  return c;
}

/** Clover patches and wild flowers in the grass outside the walls: stamps on a world lattice. */
function meadow(px: Px, frame: Frame): void {
  const k = frame.k;
  const clover = [hex('#7e8a46'), hex('#5a6634')];
  const flowers = [hex('#f2ecd8'), hex('#f0cc52'), hex('#e48aa8'), hex('#a888cc'), hex('#f2ecd8')];
  const ok = (u: number, v: number) => !(u > -4 && v > -4 && u < WALL + 4 && v < WALL + 4) && roadDistance(u, v) > 6.5 && !FIELDS.some((f) => inRect(u, v, f, 2));
  // Clover: rounded patches of three-leaf clusters, lit leaf over a dark one.
  for (let i = 0; i < 260; i++) {
    const x0 = Math.floor(hash(i, 11, 91) * frame.w);
    const y0 = Math.floor(hash(i, 12, 91) * frame.h);
    const [u, v] = px.ground(x0, y0);
    if (!ok(u, v)) continue;
    for (let j = 0; j < 7; j++) {
      const x = x0 + Math.round((hash(i, j, 92) - 0.5) * 7 * k);
      const y = y0 + Math.round((hash(i, j, 93) - 0.5) * 3 * k);
      px.set(x, y, clover[0]!);
      px.set(x + 1, y, clover[0]!);
      px.set(x, y + 1, clover[1]!);
      px.set(x + 1, y - 1, clover[0]!);
    }
  }
  // Flowers: a pair of petals over a dark stem pixel, in loose drifts of one colour.
  for (let i = 0; i < 520; i++) {
    const x0 = Math.floor(hash(i, 21, 94) * frame.w);
    const y0 = Math.floor(hash(i, 22, 94) * frame.h);
    const [u, v] = px.ground(x0, y0);
    if (!ok(u, v)) continue;
    const fc = flowers[Math.floor(hash(Math.floor(u / 30), Math.floor(v / 30), 95) * flowers.length)]!;
    for (let j = 0; j < 3; j++) {
      const x = x0 + Math.round((hash(i, j, 96) - 0.5) * 10 * k);
      const y = y0 + Math.round((hash(i, j, 97) - 0.5) * 4 * k);
      px.set(x, y, fc);
      px.set(x + 1, y, fc);
      px.set(x, y + 1, hex('#3f4a28'));
    }
  }
}

/**
 * Tree shadows with dappled light: each tree casts a cool shadow along the sun, broken by flecks
 * of warm sunlight that come through the canopy (3×2 cell clusters, never single pixels).
 */
function treeShade(px: Px, trees: [number, number, number][]): void {
  const shade = hex('#2a2c50');
  const sunC = hex('#c8a85a');
  for (const [tu, tv, r] of trees) {
    const h = r * 1.8;
    const cu = tu + SUN[0] * h;
    const cv = tv + SUN[1] * h;
    const ru = r * 1.15;
    const rv = r * 0.95;
    const x0 = Math.floor(px.X(cu - ru, cv + rv)) - 2;
    const x1 = Math.ceil(px.X(cu + ru, cv - rv)) + 2;
    const y0 = Math.floor(px.Y(cu - ru, cv - rv)) - 2;
    const y1 = Math.ceil(px.Y(cu + ru, cv + rv)) + 2;
    for (let y = Math.max(0, y0); y <= Math.min(px.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(px.w - 1, x1); x++) {
        const [u, v] = px.ground(x, y);
        const d = ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2;
        const wob = hash(x >> 2, y >> 1, 98) * 0.25;
        if (d > 1 - wob) continue;
        const i = y * px.w + x;
        const c = px.data[i]!;
        // Sun flecks inside the shadow: 3×2 cells, more toward the rim.
        const cx = Math.floor(x / 3);
        const fleck = hash(cx, (y + (cx & 1)) >> 1, 99) < 0.1 + d * 0.22;
        px.data[i] = fleck ? mix(c, sunC, 0.18) : mix(c, shade, 0.36);
      }
  }
}

/**
 * The ground for one faction, a band of rows per step: the cached static ground, then only the
 * parts that depend on the levels (fields, the herb garden, the paddock, building shadows, the
 * walls' shadow and the moat), each over its own patch of pixels.
 */
export function* groundSteps(st: CityStyle, levels: Record<BuildingKey, number>, maxLevel: number, frame: Frame, casts?: Footprint[]): Generator<void, Ground> {
  const id = st.id;
  const stat = yield* staticGround(id, frame);
  const px = new Px(frame.w, frame.h, frame);
  px.data.set(stat);
  px.set(0, 0, stat[0]!);
  px.set(frame.w - 1, frame.h - 1, stat[stat.length - 1]!);
  const data = px.data;
  const W = frame.w;
  const P = palette(id);
  /** Shadow depth already laid per pixel, and the colour under it, so overlapping casts never double-darken. */
  const shadowed = new Float32Array(casts ? data.length : 0);
  const unshade = new Uint32Array(casts ? data.length : 0);
  const sown = sownOf(levels);
  const wallsT = tierOf(levels.walls);
  const ht = tierOf(levels.hospital);
  const water = [hex('#6f8a8c'), hex('#5f7a7e'), hex('#86a0a0'), hex('#4f686e')];
  const moatW = id === 'undead' ? [hex('#2d3a30'), hex('#26322a'), hex('#3a4a3a'), hex('#1e2822')] : water;
  const herbs =
    id === 'undead'
      ? [hex('#5a3e6a'), hex('#3e4a3a'), hex('#6a5a7a'), hex('#46523e'), hex('#4a3a52'), hex('#56603e')]
      : [hex('#7a6aa0'), hex('#5f7a4a'), hex('#c9883a'), hex('#4f6a5a'), hex('#a8b070'), hex('#9a5a7a')];
  const wheat = hex('#8c7a3a');
  /** Visit the pixels over a ground rectangle; fn gets the pixel index, the world point and a cluster value. */
  const region = (u0: number, v0: number, u1: number, v1: number, fn: (i: number, u: number, v: number, cell: number, x: number, y: number) => void) => {
    const xs = [px.X(u0, v0), px.X(u1, v0), px.X(u0, v1), px.X(u1, v1)];
    const ys = [px.Y(u0, v0), px.Y(u1, v0), px.Y(u0, v1), px.Y(u1, v1)];
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(frame.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const [u, v] = px.ground(x, y);
        if (u < u0 || u >= u1 || v < v0 || v >= v1) continue;
        fn(y * W + x, u, v, cellAt(x, y), x, y);
      }
    }
  };
  // Fields: wheat, rice paddies or grave plots.
  for (let fi = 0; fi < FIELDS.length; fi++) {
    const f = FIELDS[fi]!;
    const Wf = f[2] - f[0];
    const Hf = f[3] - f[1];
    region(f[0], f[1], f[2], f[3], (i, u, v, cell) => {
      const lu = u - f[0];
      const lv = v - f[1];
      let c: Col;
      if (id === 'samurai') {
        // Paddies: flooded plots split by earth bunds (aze); fallow ones are mud.
        const bu = lu % (Wf / 2);
        const bv = lv % (Hf / 2);
        const bund = bu < 1.4 || bv < 1.4 || lu > Wf - 1.4 || lv > Hf - 1.4;
        if (bund) c = bu < 0.7 || bv < 0.7 ? P.grass[2]! : P.grass[0]!;
        else if (fi < sown) {
          c = water[cell < 0.62 ? 0 : cell < 0.9 ? 1 : 2]!;
          if (hash(Math.floor(lu / 7), Math.floor(lv / 3), 21) > 0.95) c = water[2]!;
        } else c = mix(P.soil, water[1]!, cell < 0.7 ? 0.3 : 0.4);
      } else if (id === 'undead') {
        // Grave plots in rows; unworked plots are bare turned earth.
        c = cell < 0.6 ? P.soil : mix(P.soil, P.earth[1]!, 0.3);
        if (fi < sown) {
          const gu = lu % 6;
          const gv = lv % 8;
          if (gu > 1.2 && gu < 5 && gv > 1 && gv < 3.6) c = gu < 2 || gv < 1.6 ? tone(P.earth[2]!, -0.05) : P.earth[3]!;
        } else if (Math.floor(lv * 2) % 6 === 0) c = tone(P.soil, 0.15);
        if (lu < 1 || lv < 1 || lu > Wf - 1 || lv > Hf - 1) c = tone(P.grass[1]!, 0.12);
      } else {
        if (fi < sown) c = Math.floor(v * 2) % 6 === 0 ? tone(P.soil, 0.1) : mix(wheat, P.soil, 0.35 + cell * 0.2);
        else c = Math.floor(v * 2) % 6 === 0 ? tone(P.soil, 0.2) : mix(P.soil, P.grass[0]!, cell * 0.3);
        if (lu < 1 || lv < 1 || lu > Wf - 1 || lv > Hf - 1) c = tone(P.grass[1]!, 0.1);
      }
      data[i] = c;
    });
    yield;
  }
  // Herb garden (the necropolis grows nightshade and wolfsbane).
  if (ht >= 1)
    region(GARDEN[0], GARDEN[1], GARDEN[2], GARDEN[3], (i, u, _v, cell) => {
      const rows = Math.min(6, 2 + ht);
      const bed = Math.floor((u - GARDEN[0]) / 4.5);
      const inBed = (u - GARDEN[0]) % 4.5 > 1.2 && bed < rows;
      if (inBed) {
        const hc = herbs[bed % herbs.length]!;
        data[i] = cell < 0.55 ? hc : cell < 0.85 ? tone(hc, 0.3) : P.soil;
      } else data[i] = P.road[1]!;
    });
  // Paddock: churned earth.
  if (levels.stables > 0) region(PADDOCK[0], PADDOCK[1], PADDOCK[2], PADDOCK[3], (i, _u, _v, cell) => (data[i] = cell < 0.5 ? P.earth[3]! : tone(P.earth[1]!, 0.08)));
  if (casts) {
    // Cast shadows from everything that stands on the ground (the buildings' recorded footprints
    // and the props), swept along the sun: deep and cool, softer at the tip.
    const shade = id === 'undead' ? hex('#1c1830') : id === 'templar' ? hex('#26265a') : hex('#2a2c50');
    for (const f of casts) {
      const lu = SUN[0] * f[4];
      const lv = SUN[1] * f[4];
      region(f[0], Math.min(f[1], f[1] + lv), f[2] + lu, f[3], (i, u, v) => {
        const s = shadowAt(u, v, [f]);
        if (!s || shadowed[i]! >= s) return;
        const was = shadowed[i]!;
        shadowed[i] = s;
        const c = was ? unshade[i]! : data[i]!;
        if (!was) unshade[i] = c;
        data[i] = mix(c, shade, id === 'templar' ? (s >= 1 ? 0.5 : 0.32) : s >= 1 ? 0.42 : 0.26);
      });
    }
  } else
    for (const k of Object.keys(LOT) as (BuildingKey | 'keep')[]) {
      // Building shadows toward the lower right.
      if (k === 'walls') continue;
      const lvl = k === 'keep' ? Math.max(maxLevel, 1) : levels[k];
      if (lvl <= 0) continue;
      const [u0, v0, u1, v1] = LOT[k];
      const len = (k === 'keep' ? 30 + tierOf(lvl) * 8 : 10 + tierOf(lvl) * 3) * 0.6;
      region(Math.max(u0 + 2, u1 - 2), v0 + 2, u1 + len, v1, (i) => (data[i] = tone(data[i]!, 0.26)));
    }
  // The walls' shadow inside.
  if (wallsT > 0 && !casts) region(2, 2, 5 + wallsT * 3, WALL - 2, (i) => (data[i] = tone(data[i]!, 0.16)));
  yield;
  // Ditch (Templar), wet moat (Samurai) or a black mere (Undead) outside stone walls.
  if (wallsT >= 2) {
    const wide = id === 'samurai' ? 5.5 : 3;
    const m = WALL + 16;
    const paint = (i: number, d: number, x: number, y: number) => {
      if (id === 'templar') data[i] = d < 1.5 ? hex('#3a3f3a') : tone(data[i]!, 0.3);
      else {
        let c = d > wide - 1 ? (id === 'samurai' ? P.flags[1]! : tone(P.earth[3]!, 0.2)) : moatW[Math.floor(hash(x >> 3, y, 31) * 4)]!;
        if (id === 'samurai' && d > wide - 1.8 && d <= wide - 1) c = tone(P.flags[2]!, -0.05);
        data[i] = c;
      }
    };
    region(m - wide, -6, m + wide, m + wide, (i, u, v, _c, x, y) => {
      if (Math.abs(v - GATE_V) <= 8) return;
      paint(i, Math.abs(u - m), x, y);
    });
    region(-6, m - wide, m - wide, m + wide, (i, _u, v, _c, x, y) => paint(i, Math.abs(v - m), x, y));
  }
  // The well.
  if (id !== 'templar') box(px, 76, 64, 0, 6, 6, 3, (f) => (f === 'top' ? hex('#1c1a18') : f === 'left' ? P.flags[2]! : P.flags[1]!));
  const base = px.toCanvas();
  yield;

  // Crop layer: wheat, rice seedlings, or headstones (one still frame).
  const crops: HTMLCanvasElement[] = [];
  let cropX = 0;
  let cropY = 0;
  const frames = id === 'undead' ? 1 : 4;
  // The necropolis's grave lanterns: a post and a little iron cage of witchfire, two per worked field.
  const lamps: [number, number][] = [];
  for (let k = 0; k < frames; k++) {
    const cp = new Px(frame.w, frame.h, frame);
    for (let i = 0; i < sown; i++) {
      const f = FIELDS[i]!;
      if (id === 'undead') {
        for (let u = f[0] + 2.5; u < f[2] - 3; u += 6)
          for (let v = f[1] + 1; v < f[3] - 3; v += 8) {
            const n = hash(Math.floor(u), Math.floor(v), 41);
            if (n < 0.12) continue;
            stone(cp, u, v, n, st);
          }
        if (k === 0)
          for (const [fu, fv] of [[0.3, 0.45], [0.75, 0.6]] as const) {
            const u = f[0] + (f[2] - f[0]) * fu;
            const v = f[1] + (f[3] - f[1]) * fv;
            post(cp, u, v, 0, 6, st.timber[1], st.timber[3]);
            box(cp, u - 0.6, v - 0.6, 6, 1.2, 1.2, 1.5, (fc) => (fc === 'top' ? hex('#2a2632') : fc === 'left' ? hex('#d8ffb8') : hex('#8ee070')));
            lamps.push([sx(u, v), sy(u, v, 6.8)]);
          }
      } else {
        const stepU = id === 'samurai' ? 2.5 : 1;
        const stepV = id === 'samurai' ? 2.5 : 3;
        const W = f[2] - f[0];
        const Hh = f[3] - f[1];
        for (let u = f[0] + 2; u < f[2] - 1.5; u += stepU)
          for (let v = f[1] + 2; v < f[3] - 1.5; v += stepV) {
            if (id === 'samurai') {
              const bu = (u - f[0]) % (W / 2);
              const bv = (v - f[1]) % (Hh / 2);
              if (bu < 2 || bv < 2) continue;
            }
            const x = Math.floor(cp.X(u, v));
            const y = Math.floor(cp.Y(u, v));
            const ph = Math.sin((k / 4) * Math.PI * 2 + (u + v) * 0.12);
            const lean = ph > 0.5 ? 1 : ph < -0.5 ? -1 : 0;
            const n = hash(Math.floor(u * 2), Math.floor(v * 2), 11);
            if (id === 'samurai') {
              // A clump of seedlings: three blades, a shade and a lit one.
              const g0 = n < 0.5 ? hex('#8fbf4e') : hex('#7aac40');
              const g1 = hex('#4f7a2e');
              cp.set(x, y, g1);
              cp.set(x - 1, y - 1, g1);
              cp.set(x + 1, y - 1, g0);
              cp.set(x + lean, y - 2, g0);
              cp.set(x + lean, y - 3, tone(g0, -0.15));
              cp.set(x - 1 + lean, y - 2, g1);
            } else {
              const ear = n < 0.3 ? hex('#d6b860') : n < 0.7 ? hex('#c4a24c') : hex('#a88a3a');
              cp.set(x, y - 1, hex('#8a7a38'));
              cp.set(x, y - 2, hex('#8a7a38'));
              cp.set(x + lean, y - 3, ear);
              cp.set(x + lean, y - 4, ear);
              if (n > 0.6) cp.set(x + lean, y - 5, tone(ear, -0.2));
            }
          }
      }
    }
    const b = cp.bounds();
    if (!b) {
      crops.push(document.createElement('canvas'));
      continue;
    }
    if (k === 0) {
      cropX = b[0];
      cropY = b[1];
    }
    // Same bounds for every frame (the first frame's, padded) so they line up.
    crops.push(cp.toCanvas(cropX, cropY, Math.max(b[2], cropX + 1), Math.max(b[3], cropY + 1)));
    yield;
  }

  // Trees and fences.
  const arts: Art[] = [];
  const tp = new Px(frame.w, frame.h, frame);
  const trees = treesFor(id);
  trees.forEach(([u, v, r], i) => {
    tp.clear();
    if (id === 'samurai') (i % 5 === 2 ? sakura : pine)(tp, u, v, r, i, st);
    else if (id === 'undead') (i % 3 === 1 ? yew : deadTree)(tp, u, v, r, i, st);
    else oak(tp, u, v, r, i, st);
    const b = tp.bounds();
    if (b) arts.push({ canvas: tp.toCanvas(...b), lights: null, night: nightCanvas(tp, ...b), x: b[0], y: b[1], d: u + v });
  });
  if (levels.stables > 0) {
    const [u0, v0, u1, v1] = PADDOCK;
    const rail = (pts: [number, number][], depth: number) => {
      tp.clear();
      for (let i = 0; i < pts.length - 1; i++) {
        const [au, av] = pts[i]!;
        const [bu, bv] = pts[i + 1]!;
        const n = Math.ceil(Math.hypot(bu - au, bv - av) / 6);
        for (let k = 0; k <= n; k++) post(tp, au + ((bu - au) * k) / n, av + ((bv - av) * k) / n, 0, 5, st.timber[2], st.timber[3]);
        for (const z of id === 'undead' ? [3] : [2, 4]) {
          const steps = Math.ceil(Math.hypot(bu - au, bv - av) * 2.4);
          for (let s = 0; s <= steps; s++) {
            const u = au + ((bu - au) * s) / steps;
            const v = av + ((bv - av) * s) / steps;
            tp.plot(Math.floor(tp.X(u, v)), Math.floor(tp.Y(u, v, z)), u + v + z, z === 4 ? st.timber[0] : st.timber[1]);
            tp.plot(Math.floor(tp.X(u, v)), Math.floor(tp.Y(u, v, z)) + 1, u + v + z, st.timber[2]);
          }
        }
      }
      const b = tp.bounds();
      if (b) arts.push({ canvas: tp.toCanvas(...b), lights: null, night: nightCanvas(tp, ...b), x: b[0], y: b[1], d: depth });
    };
    rail([[u0, v1], [u0, v0], [u1 - 10, v0]], u0 + v0);
    rail([[u0, v1], [u1, v1], [u1, v0]], u1 + v1);
  }
  void v3;
  return { base, crops, arts, sown, cropX, cropY, lamps };
}

// ------------------------------------------------------------------ trees and headstones

function blob(tp: Px, cx: number, cy: number, rx: number, ry: number, seed: number, ramp: Col[], out: Col): void {
  // A canopy clump lit from the upper left: 3 tones in big clusters, a dark rim on the shade side.
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      const wob = hash(x >> 1, y >> 1, seed) * 0.22;
      if (d > 1 - wob) continue;
      const lit = dx * 0.6 + dy * 0.8 + (hash(x >> 2, y >> 2, seed + 1) - 0.5) * 0.5;
      let c = ramp[lit < -0.45 ? 0 : lit < 0.15 ? 1 : 2]!;
      if (d > 0.86 - wob && lit > 0.2) c = out;
      tp.set(x, y, c);
    }
}

function trunk(tp: Px, u: number, v: number, h: number, a: Col, b: Col): [number, number] {
  const x = Math.floor(tp.X(u, v));
  const y = Math.floor(tp.Y(u, v));
  for (let k = 0; k < h; k++) {
    tp.set(x - 1, y - k, a);
    tp.set(x, y - k, a);
    tp.set(x + 1, y - k, b);
  }
  return [x, y - h];
}

function oak(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.9 * k), hex('#5a3e26'), hex('#36261a'));
  const leaf = [hex('#7d8a44'), hex('#5f6e33'), hex('#425028')];
  blob(tp, x, y - r * k * 0.6, r * k, r * k * 0.85, seed, leaf, hex('#2e3a1e'));
  blob(tp, x - r * k * 0.45, y - r * k * 0.2, r * k * 0.55, r * k * 0.45, seed + 3, leaf, hex('#2e3a1e'));
  void st;
}

/** Japanese black pine: a leaning trunk with flat cloud-pruned pads of needles. */
function pine(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const x0 = Math.floor(tp.X(u, v));
  const y0 = Math.floor(tp.Y(u, v));
  const h = Math.round(r * 2.1 * k);
  const lean = (hash(seed, 3) < 0.5 ? -1 : 1) * 0.35;
  const bark = hex('#5a4234');
  const barkS = hex('#3a2a24');
  const pts: [number, number][] = [];
  for (let i = 0; i < h; i++) {
    const x = Math.round(x0 + lean * i + Math.sin(i * 0.12 + seed) * 1.5);
    const y = y0 - i;
    tp.set(x - 1, y, bark);
    tp.set(x, y, bark);
    tp.set(x + 1, y, barkS);
    pts.push([x, y]);
  }
  const ramp = [hex('#5d7444'), hex('#3f5634'), hex('#2a3a28')];
  const pads = 3 + (seed % 2);
  for (let p = 0; p < pads; p++) {
    const [px, py] = pts[Math.floor(h * (0.45 + (p / pads) * 0.55)) - 1]!;
    const side = p % 2 ? 1 : -1;
    const w = (r * (1.1 - p * 0.15)) * k;
    const cx = px + side * w * 0.45;
    // Branch to the pad.
    for (let i = 0; i < Math.abs(cx - px); i++) tp.set(Math.round(px + side * i), py + 1, barkS);
    blob(tp, cx, py, w, w * 0.32, seed + p * 7, ramp, hex('#1f2a1e'));
  }
  void st;
}

/** A cherry: one pink accent among the pines. */
function sakura(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.8 * k), hex('#4a3230'), hex('#2e1e1e'));
  const pink = [hex('#f2c4cc'), hex('#dc9aaa'), hex('#b4728a')];
  blob(tp, x, y - r * k * 0.5, r * k * 1.05, r * k * 0.75, seed, pink, hex('#8a5068'));
  void st;
}

/** A dead tree: forked bare branches, bark gone grey. */
function deadTree(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const x0 = Math.floor(tp.X(u, v));
  const y0 = Math.floor(tp.Y(u, v));
  const lit = hex('#7a7268');
  const dk = hex('#3a3434');
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let cx = x;
    let cy = y;
    for (let i = 0; i < len; i++) {
      cx += Math.cos(a);
      cy += Math.sin(a);
      for (let j = 0; j < w; j++) tp.set(Math.round(cx) + j, Math.round(cy), j === w - 1 && w > 1 ? dk : lit);
      if (w === 1) tp.set(Math.round(cx) + 1, Math.round(cy), dk);
    }
    if (depth <= 0 || len < 4) return;
    const n = hash(Math.round(cx), Math.round(cy), seed);
    branch(cx, cy, a - 0.45 - n * 0.3, len * 0.62, Math.max(1, w - 1), depth - 1);
    branch(cx, cy, a + 0.4 + n * 0.35, len * 0.58, Math.max(1, w - 1), depth - 1);
  };
  branch(x0, y0, -Math.PI / 2 + (hash(seed, 9) - 0.5) * 0.3, r * 1.3 * k, 3, 3);
  void st;
}

/** A churchyard yew: a dark, dense, round-shouldered column. */
function yew(tp: Px, u: number, v: number, r: number, seed: number, st: CityStyle): void {
  const k = tp.k;
  const [x, y] = trunk(tp, u, v, Math.round(r * 0.5 * k), hex('#4a3630'), hex('#2a1e1c'));
  const ramp = [hex('#3e4a3a'), hex('#2c372c'), hex('#1e2620')];
  blob(tp, x, y - r * k * 0.9, r * k * 0.7, r * k * 1.25, seed, ramp, hex('#141a16'));
  void st;
}

/** A headstone, a slab or a cross in a grave field. */
function stone(cp: Px, u: number, v: number, n: number, st: CityStyle): void {
  const lit = mix(st.stone[0], st.fine[1], 0.3);
  const sh = st.stone[2];
  const top = st.stone[1];
  const moss = hex('#5f6a46');
  const lean = n > 0.8 ? 0.6 : 0;
  if (n < 0.45) {
    // A rounded headstone.
    box(cp, u, v, 0, 1, 2.5, 3.2, (f, s, t) => (f === 'top' ? top : f === 'left' ? (t < 0.6 ? moss : lit) : t < 0.6 ? tone(moss, 0.3) : sh));
    cp.point(v3(u + 0.5, v + 1.25, 3.6), lit);
    cp.point(v3(u + 0.5, v + 0.75, 3.4), lit);
  } else if (n < 0.7) {
    // A wooden or stone cross.
    box(cp, u + lean, v + 1, 0, 0.8, 0.8, 4.6, (f) => (f === 'left' ? lit : f === 'top' ? top : sh));
    box(cp, u + lean, v, 2.8, 0.8, 2.8, 0.8, (f) => (f === 'left' ? lit : f === 'top' ? top : sh));
  } else {
    // A low slab over the grave.
    box(cp, u - 0.5, v - 0.5, 0, 2.2, 3.5, 1, (f) => (f === 'top' ? lit : f === 'left' ? tone(lit, 0.12) : sh));
  }
}
