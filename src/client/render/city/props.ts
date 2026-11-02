// Props and clutter for the HD towns: the barrels, crates, sacks, carts, wood piles, benches,
// flower pots, market stalls, lanterns, wells, troughs, haystacks, hurdles and washing lines that
// make a lived-in town (docs/art-references/city-detail.md), and a deterministic pass that scatters
// them along walls, by doors and road edges, in yards and the market square.
//
// ---------------------------------------------------------------------------------------- API
//
// Everything is in world units (pixels.ts: u down-right, v down-left, z up) and painted at the
// frame's density into a Px, lit from the upper left like the buildings: 3-5 tone ramps from the
// style, a lit left (+v) face, a shaded right (+u) face, a coloured outline, no per-pixel noise.
//
//   registerProp(kind, def)      add a prop to the library. `def.lu × def.lv` is its footprint
//                                from (u, v), its min corner; `def.h` its height (for the cast
//                                shadow); `def.draw(a)` paints it at a.u, a.v into a.px. Faction
//                                kinds are namespaced: 'samurai:toro', 'undead:bonepile'.
//   registerTheme(faction, t)    what a faction scatters: weighted groups of props per site kind
//                                ('wall' along building faces, 'door' by road ends, 'road' along
//                                road edges, 'yard' in open ground, 'market' at the market spots),
//                                optional per-building groups (`near`), market spots and fixed
//                                props (a well). A faction without a theme gets the Templar one
//                                with its own colours.
//   placeProps(o)                the placement pass: pure and deterministic from the seed, the
//                                building levels and the footprints the buildings recorded
//                                (pixels.ts recordFootprints), so props never stand inside a wall,
//                                on a road (roads.ts roadDistance), in the drill yard, the butts,
//                                the fields or the paddock. Density follows each building's tier:
//                                an empty lot is bare, the grand tier busy.
//   paintProps(placed, st, frame) the placed props as depth-sorted Arts (one per group, with a
//                                night canvas and lit glass for lanterns) plus the lamps' points.
//   propShadows(placed)          the ground footprints and heights, for ground-hd's cast shadows.
//
// The drawing helpers (cyl, heap, bush, ivy, windowBox, wallSign, lantern) are exported for the
// building kits: ivy curtains and window boxes go on walls, signs and lanterns on brackets.
//
// Example (a faction kit):
//   registerProp('undead:bones', { lu: 3, lv: 3, h: 2, draw: (a) => heap(a.px, a.u + 1.5, a.v + 1.5, 0, 1.5, 1.5, 2, bone) });
//   registerTheme('undead', { groups: { wall: [{ w: 2, items: [['undead:bones', 0, 0], ['barrel', 3, 0]] }] } });

import type { BuildingKey } from '../../../game/city.ts';
import { tierOf, WALL, type Art } from './buildings.ts';
import { FIELDS, GARDEN, PADDOCK } from './ground.ts';
import { box, hash, hex, line3, mix, nightCanvas, NIGHT_RIG, post, Px, tone, v3, type Col, type Footprint, type Frame, type NightRig, type V3 } from './pixels.ts';
import { EDGES, NODES, roadDistance } from './roads.ts';
import type { CityStyle, Ramp } from './style.ts';

// ---------------------------------------------------------------------------------- palettes

const ramp = (a: string, b: string, c: string, d: string): Ramp => [hex(a), hex(b), hex(c), hex(d)];
/** Fixed ramps the styles do not carry: leaves, terracotta, iron, water, flowers. */
export const LEAF: Ramp = ramp('#c3c860', '#88a03e', '#566f30', '#2f4428');
export const IVY: Ramp = ramp('#a9bc4e', '#6f8e36', '#45602c', '#273a24');
export const POT: Ramp = ramp('#d98a58', '#b4643c', '#83432c', '#52291e');
export const IRON: Ramp = ramp('#8e8c96', '#5c5a66', '#3c3a46', '#24222c');
export const WATER: Ramp = ramp('#b6ccd2', '#7f9eac', '#5a7686', '#3c5262');
export const FLOWERS: Col[] = [hex('#e889aa'), hex('#f4ede0'), hex('#d24a3c'), hex('#f0c84c'), hex('#a07ccc'), hex('#f6c2d2')];
const FLAME: Col = hex('#ffd27a');
const FLAME2: Col = hex('#ff9a3a');

// ------------------------------------------------------------------------- raster helpers

/** A depth-tested world point with a light class for the night rig (1 lit, 2 half, 3 shade). */
export function dot(px: Px, u: number, v: number, z: number, c: Col, cls = 0, bias = 0): void {
  const x = Math.floor(px.X(u, v));
  const y = Math.floor(px.Y(u, v, z));
  if (x < 0 || y < 0 || x >= px.w || y >= px.h) return;
  const i = y * px.w + x;
  const d = u + v + z + bias;
  if (d < px.depth[i]! - 0.01) return;
  px.plot(x, y, d, c);
  px.cls[i] = cls;
}

/** A box shaded from a ramp: top r[0], lit left face r[1], shaded right face r[2]. */
export function rbox(px: Px, u: number, v: number, z: number, lu: number, lv: number, h: number, r: Ramp, detail?: (f: 'top' | 'left' | 'right', s: number, t: number, c: Col) => Col): void {
  box(px, u, v, z, lu, lv, h, (f, s, t) => {
    const ff = f === 'back' ? 'right' : f;
    const c = ff === 'top' ? r[0] : ff === 'left' ? r[1] : r[2];
    return detail ? detail(ff, s, t, c) : c;
  });
}

/**
 * An upright cylinder (barrel, pot, well, chopping block). `side` gets the light term -1..1
 * (lit toward +v, shaded toward +u), the height and the angle; `top` the offset from the centre.
 */
export function cyl(px: Px, cu: number, cv: number, z0: number, r: number, h: number, side: (l: number, z: number, a: number) => Col, top?: (du: number, dv: number) => Col): void {
  const k = px.k;
  const da = 0.3 / (k * Math.max(0.5, r));
  for (let a = 0; a < Math.PI * 2; a += da) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (c + s < -0.25) continue;
    const l = (s * 0.6 - c * 0.2) / 0.632;
    for (let z = 0; z <= h; z += 0.4 / k) {
      const col = side(l, z, a);
      if (col) dot(px, cu + c * r, cv + s * r, z0 + z, col, l > 0.3 ? 1 : l > -0.3 ? 2 : 3);
    }
  }
  if (top)
    for (let du = -r; du <= r; du += 0.4 / k)
      for (let dv = -r; dv <= r; dv += 0.4 / k) {
        if (du * du + dv * dv > r * r) continue;
        const col = top(du, dv);
        if (col) dot(px, cu + du, cv + dv, z0 + h, col, 1);
      }
}

/** A tone from a ramp for a light term -1..1 (a narrow highlight, a wide mid, a shade, a deep edge). */
export function lit(r: Ramp, l: number): Col {
  return l > 0.62 ? r[0] : l > -0.15 ? r[1] : l > -0.7 ? r[2] : r[3];
}

/**
 * A heap (a sack, a haystack, a pile of apples): a half-ellipsoid filled down to the ground so
 * its steep sides have no gaps. `shade` gets the light term -1..1 and the point.
 */
export function heap(px: Px, cu: number, cv: number, z0: number, ru: number, rv: number, h: number, shade: (l: number, p: V3) => Col): void {
  const k = px.k;
  const step = 0.4 / k;
  const p = v3(0, 0, 0);
  for (let u = -ru; u <= ru; u += step)
    for (let v = -rv; v <= rv; v += step) {
      const r2 = (u * u) / (ru * ru) + (v * v) / (rv * rv);
      if (r2 > 1) continue;
      const zt = h * Math.sqrt(1 - r2);
      const nu = (u / (ru * ru)) * h;
      const nv = (v / (rv * rv)) * h;
      const nz = Math.max(0.15, Math.sqrt(1 - r2));
      const l = (nv * 0.6 - nu * 0.2 + nz * 0.77) / Math.hypot(nu, nv, nz);
      // Only the rim needs filling down (the cap covers the inside).
      const zb = r2 > 0.55 ? 0 : zt - 0.6;
      for (let z = zt; z >= zb; z -= step) {
        p.u = cu + u;
        p.v = cv + v;
        p.z = z0 + z;
        const lz = z === zt ? l : Math.min(l, (v / rv) * 0.8 - (u / ru) * 0.5);
        const c = shade(lz, p);
        if (c) dot(px, p.u, p.v, p.z, c, lz > 0.4 ? 1 : lz > -0.1 ? 2 : 3);
      }
    }
}

/**
 * Foliage in screen space (a bush, a potted plant, a canopy, the leaves in a window box): a
 * ragged ellipse of 2×2 leaf clusters, lit yellow-green on top, dark underneath, a darker rim on
 * the shaded side, and flowers dotted in pairs on the lit half. Drawn at one depth (u+v+z).
 */
export function bush(px: Px, u: number, v: number, z: number, rw: number, rh: number, seed: number, r: Ramp = LEAF, flowers: Col[] = [], bloom = 0.12): void {
  const k = px.k;
  const cx = px.X(u, v);
  const cy = px.Y(u, v, z);
  const d = u + v + z + 0.4;
  const RW = rw * k;
  const RH = rh * k;
  for (let y = Math.floor(cy - RH - 1); y <= cy + RH + 1; y++)
    for (let x = Math.floor(cx - RW - 1); x <= cx + RW + 1; x++) {
      const dx = (x + 0.5 - cx) / RW;
      const dy = (y + 0.5 - cy) / RH;
      const wob = hash(x >> 1, y >> 1, seed) * 0.28;
      const dd = Math.hypot(dx, dy);
      if (dd > 1 - wob) continue;
      // Light from the upper left: lit high and left, dark low and right.
      const l = -dy * 0.75 - dx * 0.45 + (hash(x >> 1, y >> 1, seed + 7) - 0.5) * 0.5;
      let c = l > 0.45 ? r[0] : l > -0.1 ? r[1] : l > -0.6 ? r[2] : r[3];
      if (dd > 0.82 - wob && l < 0) c = r[3];
      if (flowers.length && l > -0.2 && hash(x >> 1, y, seed + 3) < bloom) c = flowers[Math.floor(hash(x >> 2, y >> 2, seed + 5) * flowers.length)]!;
      if (x < 0 || y < 0 || x >= px.w || y >= px.h) continue;
      px.plot(x, y, d, c);
      px.cls[y * px.w + x] = l > 0.2 ? 1 : l > -0.3 ? 2 : 3;
    }
}

/** Planks on a face: boards `w` units wide with a dark joint, a lit edge on the lit face. */
function planks(f: 'top' | 'left' | 'right', s: number, t: number, c: Col, k: number, w = 1.2, across = false): Col {
  const q = Math.floor((across ? t : s) * k);
  const wq = Math.max(2, Math.round(w * k));
  if (q % wq === wq - 1) return tone(c, 0.3);
  if (q % wq === 0 && f === 'left') return tone(c, -0.1);
  return c;
}

/** Frame a face: a lighter border `b` units wide (crate battens). */
const border = (s: number, t: number, ls: number, lt: number, b: number) => s < b || t < b || s > ls - b || t > lt - b;

// ------------------------------------------------------------------------------- the props

export interface PropAt {
  px: Px;
  st: CityStyle;
  /** Min corner of the footprint. */
  u: number;
  v: number;
  /** A per-prop hash 0..1 for variants. */
  n: number;
  /** Lamps: world points whose glass glows at night (and a little by day). */
  lights: V3[];
}
export interface PropDef {
  lu: number;
  lv: number;
  h: number;
  draw: (a: PropAt) => void;
}

const LIB = new Map<string, PropDef>();
export function registerProp(kind: string, def: PropDef): void {
  LIB.set(kind, def);
}
export const propDef = (kind: string): PropDef | undefined => LIB.get(kind);

/** A barrel: staves with iron hoops, a lid (or apples, or rainwater). */
export function barrel(px: Px, st: CityStyle, cu: number, cv: number, z0: number, n: number, r = 1.7, h = 4.4): void {
  const k = px.k;
  const wood = st.timber;
  const hoops = [0.5, h * 0.3, h * 0.7, h - 0.5];
  cyl(
    px, cu, cv, z0, r, h,
    (l, z, a) => {
      // Bulge: the light term is lifted at mid height.
      const mid = 1 - Math.abs(z / h - 0.5) * 2;
      const ll = l + mid * 0.15;
      if (hoops.some((hz) => Math.abs(z - hz) < 0.5 / k)) return ll > 0.3 ? IRON[1] : ll > -0.4 ? IRON[2] : IRON[3];
      const stave = Math.floor((a * r * k) / 2.2) % 2;
      const c = lit(wood, ll - stave * 0.12);
      return z < 0.3 ? tone(c, 0.15) : c;
    },
    (du, dv) => {
      const rr = Math.hypot(du, dv);
      if (rr > r - 0.5) return IRON[2];
      if (n > 0.7) return hash(Math.floor((du + 4) * k * 0.6), Math.floor((dv + 4) * k * 0.6), 9) < 0.5 ? hex('#c8402e') : hex('#9a2a22');
      if (n > 0.55) return rr < r * 0.45 && du < 0 ? WATER[0] : WATER[2];
      return Math.floor((du + r) * k) % 3 === 0 ? wood[1] : wood[0];
    },
  );
}

/** A crate: battens round each face, boards inside, a diagonal brace on the lit face. */
export function crate(px: Px, st: CityStyle, u: number, v: number, z: number, l = 3.4, h = 3.2): void {
  const k = px.k;
  rbox(px, u, v, z, l, l, h, st.timber, (f, s, t, c) => {
    const ls = l;
    const lt = f === 'top' ? l : h;
    if (border(s, t, ls, lt, 0.5)) return f === 'right' ? st.timber[1] : f === 'top' ? st.daub[1] : st.timber[0];
    if (f === 'left' && Math.abs(s / ls - t / lt) < 0.6 / Math.max(ls, lt) * 1.6) return st.timber[0];
    const base = f === 'top' ? st.timber[1] : f === 'left' ? st.timber[1] : st.timber[2];
    return planks(f, s, t, base, k, 1.0, f !== 'top');
  });
}

/** A sack of grain or flour, tied at the neck. */
export function sack(px: Px, st: CityStyle, cu: number, cv: number, z: number, n: number): void {
  const r: Ramp = n > 0.6 ? [st.daub[0], st.daub[1], st.daub[2], st.daub[3]] : [mix(st.daub[0], st.thatch[0], 0.3), mix(st.daub[1], st.thatch[1], 0.3), st.daub[2], st.daub[3]];
  heap(px, cu, cv, z, 1.5, 1.3, 3.2, (l) => lit(r, l));
  // The neck and its tie.
  rbox(px, cu - 0.4, cv - 0.4, z + 2.9, 0.8, 0.8, 0.8, [r[1], r[2], r[3], r[3]]);
  dot(px, cu, cv, z + 3.2, st.timber[2], 0, 0.6);
}

/** A wooden bucket. */
export function bucket(px: Px, st: CityStyle, cu: number, cv: number, z: number): void {
  cyl(px, cu, cv, z, 0.8, 1.4, (l, zz) => (Math.abs(zz - 1.0) < 0.25 ? IRON[2] : lit(st.timber, l)), (du, dv) => (Math.hypot(du, dv) > 0.45 ? st.timber[1] : WATER[2]));
}

/** A clay pot of flowers or herbs. */
export function flowerPot(px: Px, cu: number, cv: number, z: number, seed: number, big = false): void {
  const r = big ? 1.4 : 1.0;
  const h = big ? 2.0 : 1.5;
  cyl(px, cu, cv, z, r, h, (l, zz) => (zz > h - 0.35 ? lit(POT, l + 0.3) : lit(POT, l)), (du, dv) => (Math.hypot(du, dv) > r - 0.35 ? POT[1] : hex('#4a3626')));
  const fl = [FLOWERS[Math.floor(hash(seed, 3) * FLOWERS.length)]!, FLOWERS[Math.floor(hash(seed, 4) * FLOWERS.length)]!];
  bush(px, cu, cv, z + h + (big ? 1.4 : 1.0), big ? 2.0 : 1.5, big ? 1.6 : 1.2, seed, LEAF, fl, 0.3);
}

/** A little tree in a big pot or tub (a bay, a box): trunk and a round canopy. */
export function pottedTree(px: Px, st: CityStyle, cu: number, cv: number, seed: number): void {
  cyl(px, cu, cv, 0, 1.6, 2.2, (l, z) => (Math.abs(z - 1.6) < 0.25 ? IRON[2] : lit(st.timber, l)), (du, dv) => (Math.hypot(du, dv) > 1.2 ? st.timber[0] : hex('#4a3626')));
  post(px, cu, cv, 2.2, 3, st.timber[2], st.timber[3]);
  bush(px, cu, cv, 7.2, 2.6, 2.4, seed, LEAF);
}

/** A lantern: an iron cage with warm glass (lit at night, glowing a little by day). */
export function lantern(px: Px, lights: V3[], u: number, v: number, z: number): void {
  // Cap, cage and glass, then the ring it hangs from.
  rbox(px, u - 0.6, v - 0.6, z, 1.2, 1.2, 1.6, IRON, (f, s, t, c) => (t > 0.3 && t < 1.3 && (f === 'left' || f === 'right') && s > 0.25 && s < 0.95 ? (f === 'left' ? FLAME : FLAME2) : c));
  rbox(px, u - 0.8, v - 0.8, z + 1.6, 1.6, 1.6, 0.4, IRON);
  dot(px, u, v, z + 2.3, IRON[2], 0, 0.5);
  lights.push(v3(u, v, z + 0.8));
}

/** A lamp post with an arm and a hanging lantern. */
export function lampPost(px: Px, st: CityStyle, lights: V3[], u: number, v: number): void {
  post(px, u, v, 0, 9, IRON[2], IRON[3]);
  line3(px, v3(u, v, 9), v3(u + 2, v + 0.2, 9), IRON[3]);
  lantern(px, lights, u + 2, v + 0.2, 6.6);
  void st;
}

/** A sign hanging from an iron bracket off a wall, perpendicular to it. */
export function wallSign(px: Px, st: CityStyle, face: 'left' | 'right', u: number, v: number, z: number, emblem: number): void {
  // On a left face (the wall plane v = v) the bracket reaches out along +v; on a right face along +u.
  const out = (d: number): [number, number] => (face === 'left' ? [u, v + d] : [u + d, v]);
  const [bu, bv] = out(3.4);
  line3(px, v3(u, v, z), v3(bu, bv, z), IRON[3]);
  line3(px, v3(...out(0.3), z - 1.2), v3(...out(1.6), z), IRON[3]);
  const [au, av] = out(0.8);
  const a = face === 'left' ? v3(0, 2.4, 0) : v3(2.4, 0, 0);
  const b = v3(0, 0, -2.2);
  const em = [st.gold, st.bannerCharge, hex('#c8402e'), st.daub[0]][emblem % 4]!;
  px.quad(v3(au, av, z - 0.6), a, b, (s, t) => {
    if (s < 0.25 || s > 2.15 || t < 0.25 || t > 1.95) return st.timber[3];
    const cs = s - 1.2;
    const ct = t - 1.1;
    // The emblem: a tankard, a loaf, a cross or a horseshoe as a 2-3 px figure.
    const e = emblem % 4;
    const on = e === 2 ? Math.abs(cs) < 0.25 || Math.abs(ct) < 0.25 : e === 3 ? Math.abs(Math.hypot(cs, ct) - 0.55) < 0.22 && ct < 0.3 : Math.abs(cs) < 0.55 && Math.abs(ct) < 0.4;
    if (on) return em;
    return face === 'left' ? st.timber[1] : st.timber[2];
  });
}

/** A window box of flowers under a window, on a wall face. `s0` along the wall, `z` the sill. */
export function windowBox(px: Px, st: CityStyle, face: 'left' | 'right', u: number, v: number, z: number, w: number, seed: number): void {
  const fl = [FLOWERS[Math.floor(hash(seed, 1) * FLOWERS.length)]!, FLOWERS[Math.floor(hash(seed, 2) * 3)]!];
  if (face === 'left') {
    rbox(px, u, v, z - 1, w, 0.9, 1, st.timber);
    for (let i = 0; i < w; i += 1.5) bush(px, u + i + 0.7, v + 0.5, z + 0.3, 1.1, 0.9, seed + i * 3, LEAF, fl, 0.35);
  } else {
    rbox(px, u, v, z - 1, 0.9, w, 1, st.timber);
    for (let i = 0; i < w; i += 1.5) bush(px, u + 0.5, v + i + 0.7, z + 0.3, 1.1, 0.9, seed + i * 3, LEAF, fl, 0.35);
  }
}

/**
 * Ivy or a vine on a wall plane: a curtain of leaf clusters hanging from `zTop`, each column its
 * own length, lit yellow-green on top and dark in its lower folds, with a few gaps to the wall.
 * `face` 'left' is the plane v = v0 (along u from u0, `len` long); 'right' the plane u = u0.
 */
export function ivy(px: Px, face: 'left' | 'right', u0: number, v0: number, len: number, zTop: number, drop: number, seed: number, r: Ramp = IVY, flowers: Col[] = []): void {
  const k = px.k;
  const step = 0.5 / k;
  for (let a = 0; a < len; a += step) {
    // Column length: two hashed bumps, so the curtain hangs in lobes.
    const lob = Math.sin((a / len) * Math.PI) * 0.6 + 0.4;
    const h = drop * lob * (0.55 + 0.45 * hash(Math.floor((a * k) / 3), seed, 2)) + (hash(Math.floor((a * k) / 2), seed, 4) - 0.5) * 1.2;
    for (let z = 0; z < h; z += step) {
      const x = Math.floor(a * k);
      const y = Math.floor(z * k);
      // Leaf clusters: 2×2 cells, ragged at the hem, the odd gap to the wall.
      if (hash(x >> 1, y >> 1, seed + 9) < 0.12 + (z / Math.max(1, h)) * 0.3) continue;
      const depth = z / Math.max(0.5, h);
      const lt = hash(x >> 1, y >> 1, seed + 11);
      let c = depth < 0.18 ? r[0] : lt < 0.35 - depth * 0.2 ? r[0] : lt < 0.75 ? r[1] : r[2];
      if (depth > 0.75) c = lt < 0.5 ? r[2] : r[3];
      if (flowers.length && hash(x, y >> 1, seed + 13) < 0.05 && depth < 0.6) c = flowers[0]!;
      const zz = zTop - z;
      if (zz < 0.2) continue;
      if (face === 'left') dot(px, u0 + a, v0 + 0.25, zz, c, depth < 0.5 ? 1 : 2, 0.3);
      else dot(px, u0 + 0.25, v0 + a, zz, face === 'right' ? tone(c, 0.12) : c, 3, 0.3);
    }
  }
}

/** A cart wheel in the u-z plane (the near side of a cart facing +v). */
function wheel(px: Px, st: CityStyle, cu: number, v: number, cz: number, r: number): void {
  const k = px.k;
  for (let a = 0; a < Math.PI * 2; a += 0.25 / (k * r)) {
    for (let rr = r - 0.45; rr <= r; rr += 0.4 / k) dot(px, cu + Math.cos(a) * rr, v, cz + Math.sin(a) * rr, Math.sin(a) > 0.2 ? st.timber[1] : st.timber[2], 2, 0.2);
  }
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2 + 0.3;
    line3(px, v3(cu, v, cz), v3(cu + Math.cos(a) * (r - 0.4), v, cz + Math.sin(a) * (r - 0.4)), st.timber[2]);
  }
  dot(px, cu, v, cz, IRON[1], 0, 0.4);
}

/** A cart: a plank bed on two wheels, shafts out front, loaded with hay, sacks or barrels. */
export function cart(px: Px, st: CityStyle, u: number, v: number, load: 'hay' | 'sacks' | 'barrels' | 'none', n: number, small = false): void {
  const L = small ? 6 : 9;
  const W = small ? 3.4 : 4.4;
  const z = small ? 1.8 : 2.4;
  const k = px.k;
  rbox(px, u, v, z, L, W, small ? 1.2 : 1.6, st.timber, (f, s, t, c) => planks(f, s, t, c, k, 1.1, f !== 'top'));
  wheel(px, st, u + L * 0.45, v + W + 0.2, z * 0.95, z * 0.95);
  // Shafts (or handles) and a prop.
  for (const dv of [0.5, W - 0.5]) line3(px, v3(u + L, v + dv, z + 0.8), v3(u + L + (small ? 3.5 : 5.5), v + dv, small ? 2.6 : 0.6), st.timber[1]);
  post(px, u + 0.6, v + 0.6, 0, z, st.timber[3]);
  const top = z + (small ? 1.2 : 1.6);
  if (load === 'hay') heap(px, u + L / 2, v + W / 2, top, L / 2 + 0.3, W / 2 + 0.3, small ? 2.5 : 3.6, (l, p) => straw(st, l, p, k));
  else if (load === 'sacks') for (let i = 0; i < (small ? 2 : 3); i++) sack(px, st, u + 1.6 + i * 2.6, v + W / 2 - 0.3 + (i % 2) * 0.6, top, hash(i, n * 99));
  else if (load === 'barrels') for (let i = 0; i < (small ? 1 : 2); i++) barrel(px, st, u + 2 + i * 4, v + W / 2, top, hash(i, n * 77), 1.5, 3.4);
}

/** Straw: the thatch ramp in short dashes along the slope. */
function straw(st: CityStyle, l: number, p: V3, k: number): Col {
  const c = lit(st.thatch, l);
  const n = hash(Math.floor(p.u * k), Math.floor(p.z * k * 0.5), 31);
  return n < 0.18 ? tone(c, 0.12) : n > 0.9 && l > 0 ? tone(c, -0.1) : c;
}

/** A wood pile: split logs stacked along u, end grain on the shaded face, a chopping block. */
export function woodPile(px: Px, st: CityStyle, u: number, v: number, n: number): void {
  const k = px.k;
  const L = 6 + Math.floor(n * 3);
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++) {
      const vv = v + i * 1.3 + row * 0.65;
      rbox(px, u + (hash(i, row, 3) - 0.5) * 0.6, vv, row * 1.1, L, 1.2, 1.15, st.timber, (f, s, t, c) => {
        if (f === 'right') return Math.hypot(s - 0.6, t - 0.55) < 0.3 ? st.daub[1] : st.daub[0];
        if (f === 'top') return Math.floor(s * k) % 5 === 0 ? st.timber[2] : st.timber[1];
        return Math.floor(s * k) % 7 === 3 ? st.timber[3] : st.timber[2];
      });
    }
  cyl(px, u + L + 2, v + 1.5, 0, 1.1, 1.6, (l) => lit(st.timber, l), (du, dv) => (Math.hypot(du, dv) > 0.7 ? st.daub[1] : st.daub[0]));
}

/** A bench against a wall. */
export function bench(px: Px, st: CityStyle, u: number, v: number, alongU = true): void {
  const [lu, lv] = alongU ? [6, 1.6] : [1.6, 6];
  rbox(px, u, v, 2, lu, lv, 0.6, st.timber, (f, s, t, c) => (f === 'top' && Math.floor(t * px.k) % 3 === 2 ? st.timber[1] : c));
  for (const [a, b] of (alongU ? [[0.4, 0.3], [lu - 1, 0.3]] : [[0.3, 0.4], [0.3, lv - 1]]) as [number, number][]) rbox(px, u + a, v + b, 0, 0.6, 1, 2, st.timber.slice(1).concat(st.timber[3]) as unknown as Ramp);
}

/** A haystack: a tall straw heap with a pole and a darker skirt. */
export function haystack(px: Px, st: CityStyle, cu: number, cv: number, n: number): void {
  const k = px.k;
  const r = 2.8 + n;
  heap(px, cu, cv, 0, r, r * 0.9, 5.5 + n * 1.5, (l, p) => (p.z < 0.8 ? tone(lit(st.thatch, l), 0.2) : straw(st, l, p, k)));
  post(px, cu, cv, 5 + n, 2.5, st.timber[2]);
}

/** Square hay bales, two on one. */
export function bales(px: Px, st: CityStyle, u: number, v: number): void {
  const k = px.k;
  const shade = (f: 'top' | 'left' | 'right', s: number, t: number, c: Col) => (Math.abs(s - 1.4) < 0.3 / k * 1.2 || (f !== 'top' && Math.floor(t * k) % 3 === 0) ? tone(c, 0.18) : c);
  rbox(px, u, v, 0, 4, 2.4, 2, st.thatch, shade);
  rbox(px, u + 4.3, v, 0, 4, 2.4, 2, st.thatch, shade);
  rbox(px, u + 2, v + 0.2, 2, 4, 2.4, 2, st.thatch, shade);
}

/** A water trough on legs. */
export function trough(px: Px, st: CityStyle, u: number, v: number): void {
  rbox(px, u, v, 0, 7, 2.6, 2.2, st.timber, (f, s, t, c) => (f === 'top' ? (s > 0.5 && s < 6.5 && t > 0.5 && t < 2.1 ? (s < 3 ? WATER[1] : WATER[2]) : st.timber[0]) : planks(f, s, t, c, px.k, 1, true)));
}

/** A woven hurdle or a rail fence from (u0, v0) to (u1, v1). */
export function hurdle(px: Px, st: CityStyle, u0: number, v0: number, u1: number, v1: number, woven = true): void {
  const k = px.k;
  const L = Math.hypot(u1 - u0, v1 - v0);
  const du = (u1 - u0) / L;
  const dv = (v1 - v0) / L;
  const along = Math.abs(du) > Math.abs(dv);
  for (let s = 0; s <= L + 0.01; s += 3) post(px, u0 + du * s, v0 + dv * s, 0, 4.2, st.timber[2], along ? undefined : st.timber[3]);
  if (woven)
    px.quad(v3(u0, v0, 0.6), v3(u1 - u0, v1 - v0, 0), v3(0, 0, 3.2), (s, t) => {
      const row = Math.floor(t * k);
      const c = row % 2 === 0 ? st.thatch[2] : st.timber[1];
      return Math.floor(s * k) % 6 === 0 ? st.timber[3] : along ? c : tone(c, 0.15);
    });
  else for (const z of [1.6, 3.4]) line3(px, v3(u0, v0, z), v3(u1, v1, z), st.timber[1]);
}

/** A washing line between two posts with linen hung out to dry. */
export function washingLine(px: Px, st: CityStyle, u: number, v: number, n: number): void {
  const L = 10;
  post(px, u, v, 0, 8, st.timber[2]);
  post(px, u + L, v, 0, 8, st.timber[2]);
  line3(px, v3(u, v, 7.6), v3(u + L, v, 7.2), st.daub[2]);
  const cloth = [st.daub[0], hex('#e8e2d4'), hex('#6a7aa4'), st.bannerField, hex('#a8503c')];
  let s = 0.8;
  for (let i = 0; s < L - 1; i++) {
    const w = 1.4 + hash(i, n * 50) * 1.4;
    const c = cloth[Math.floor(hash(i, n * 51) * cloth.length)]!;
    const h = 2 + hash(i, n * 52) * 1.6;
    px.quad(v3(u + s, v, 7.4 - (s / L) * 0.4), v3(w, 0, 0), v3(0, 0, -h), (ss, t) => (t < 0.4 ? tone(c, 0.15) : ss > w - 0.4 ? tone(c, 0.1) : c));
    s += w + 0.6;
  }
}

/**
 * A market stall: a counter of goods under a striped awning on four posts, crates beneath. The
 * awning slopes down toward +v (the front, which faces the lit side) and ends in a scalloped hem.
 */
export function marketStall(px: Px, st: CityStyle, u: number, v: number, n: number): void {
  const k = px.k;
  const L = 8;
  const D = 3.6;
  rbox(px, u, v, 0, L, D, 3.4, st.timber, (f, s, t, c) => (f === 'top' ? st.timber[0] : planks(f, s, t, c, k, 1.2, true)));
  // Goods on the counter: heaps of apples, cabbages, loaves or cloth.
  const goods: Ramp[] = [
    ramp('#e0604a', '#b83a2e', '#842620', '#521a18'),
    ramp('#b4cc6a', '#7fa04a', '#557236', '#344a26'),
    ramp('#e8bc78', '#c8904c', '#94643a', '#5e3e28'),
    [mix(st.team, 0xffffffff, 0.3), st.team, st.teamShade, mix(st.teamShade, st.outline, 0.4)],
  ];
  for (let i = 0; i < 3; i++) {
    const g = goods[Math.floor(hash(i, n * 97) * goods.length)]!;
    heap(px, u + 1.4 + i * 2.6, v + 1.8, 3.4, 1.2, 1.2, 1.2, (l, p) => (hash(Math.floor(p.u * k), Math.floor(p.v * k), 5) < 0.2 ? g[3] : lit(g, l)));
  }
  for (const [a, b, h] of [[0, 0, 9], [L, 0, 9], [0, D + 1.5, 7.3], [L, D + 1.5, 7.3]] as const) post(px, u + a, v + b, 0, h, st.timber[1], st.timber[2]);
  // The awning: stripes in the faction's colours (or the team's), a scalloped hem at the front.
  const stripeA = n > 0.5 ? st.bannerField : mix(st.daub[0], 0xffffffff, 0.2);
  const stripeB = n > 0.5 ? st.bannerCharge : n > 0.25 ? st.team : hex('#3e6a8a');
  const len = Math.hypot(D + 2.6, 1.9);
  px.quad(v3(u - 0.6, v - 0.4, 9.1), v3(L + 1.2, 0, 0), v3(0, D + 2.6, -1.9), (s, t) => {
    const stripe = Math.floor((s * k) / 3) % 2 === 0;
    let c = stripe ? stripeA : stripeB;
    if (t > len - 0.8) {
      // Scallops: each stripe ends in a rounded tongue.
      const ph = ((s * k) % 3) / 3;
      if (t > len - 0.8 + Math.abs(ph - 0.5) * 1.2) return 0;
      c = tone(c, 0.12);
    }
    // Sun on the cloth, a fold every few stripes.
    if (Math.floor((s * k) / 3) % 4 === 3) c = tone(c, 0.08);
    return t < 0.5 ? tone(c, -0.08) : c;
  });
  crate(px, st, u + L + 0.6, v + 0.3, 0, 2.8, 2.6);
  if (n > 0.4) barrel(px, st, u - 1.8, v + 1.8, 0, n, 1.4, 3.6);
}

/** A well: a round stone kerb, two posts, a little roof and the bucket on its rope. */
export function well(px: Px, st: CityStyle, cu: number, cv: number): void {
  const k = px.k;
  cyl(
    px, cu, cv, 0, 3, 3.2,
    (l, z, a) => {
      const row = Math.floor((z * k) / 2.4);
      const blk = Math.floor((a * 3 * k) / 4.5 + row * 0.5);
      const c = lit(st.stone, l + (hash(blk, row, 3) - 0.5) * 0.3);
      if (Math.floor(z * k) % 3 === 2 || (Math.floor((a * 3 * k + row * 2) % 5) === 0)) return tone(c, 0.22);
      return c;
    },
    (du, dv) => (Math.hypot(du, dv) > 2.2 ? (Math.hypot(du, dv) > 2.7 ? st.stone[0] : st.stone[1]) : Math.hypot(du + 0.4, dv + 0.4) < 1 ? WATER[3] : hex('#14161c')),
  );
  post(px, cu - 2.4, cv, 0, 8.5, st.timber[1], st.timber[2]);
  post(px, cu + 2.4, cv, 0, 8.5, st.timber[2], st.timber[3]);
  line3(px, v3(cu - 2.4, cv, 7.4), v3(cu + 2.4, cv, 7.4), st.timber[0]);
  line3(px, v3(cu, cv, 7.4), v3(cu, cv, 4.6), st.daub[2]);
  bucket(px, st, cu, cv, 3.6);
  // A small gabled roof along u.
  const r = st.shingle;
  for (const [o, b, f] of [[cv - 2.2, 2.2, 0], [cv + 2.2, -2.2, 1]] as const)
    px.quad(v3(cu - 3.4, o, 8.2), v3(6.8, 0, 0), v3(0, b, 2), (s, t) => {
      const c = f ? r[0] : r[2];
      return Math.floor(t * k * 1.3) % 3 === 0 ? tone(c, 0.2) : Math.floor(s * k) % 4 === 0 ? tone(c, 0.1) : c;
    });
}

/** A signpost by a road, its board facing the lit side. */
export function signPost(px: Px, st: CityStyle, u: number, v: number, n: number): void {
  post(px, u, v, 0, 7, st.timber[2], st.timber[3]);
  wallSign(px, st, 'left', u, v - 0.3, 6.5, Math.floor(n * 4));
}

// The library: footprints (from the min corner) and heights, for placement and shadows.
registerProp('barrel', { lu: 3.4, lv: 3.4, h: 4.4, draw: (a) => barrel(a.px, a.st, a.u + 1.7, a.v + 1.7, 0, a.n) });
registerProp('barrels', {
  lu: 6.6, lv: 6.4, h: 4.4,
  draw: (a) => {
    barrel(a.px, a.st, a.u + 1.7, a.v + 1.7, 0, a.n);
    barrel(a.px, a.st, a.u + 4.9, a.v + 1.9, 0, hash(a.n * 100, 1));
    barrel(a.px, a.st, a.u + 2.3, a.v + 4.7, 0, hash(a.n * 100, 2));
  },
});
registerProp('crates', {
  lu: 7.2, lv: 3.6, h: 6.4,
  draw: (a) => {
    crate(a.px, a.st, a.u, a.v, 0);
    crate(a.px, a.st, a.u + 3.6, a.v + 0.2, 0, 3.2, 3);
    if (a.n > 0.3) crate(a.px, a.st, a.u + 0.3, a.v + 0.1, 3.2, 3, 2.8);
  },
});
registerProp('crate', { lu: 3.4, lv: 3.4, h: 3.2, draw: (a) => crate(a.px, a.st, a.u, a.v, 0) });
registerProp('sacks', {
  lu: 6.4, lv: 3.4, h: 4,
  draw: (a) => {
    sack(a.px, a.st, a.u + 1.5, a.v + 1.5, 0, a.n);
    sack(a.px, a.st, a.u + 4.4, a.v + 1.8, 0, hash(a.n * 10, 3));
    if (a.n > 0.4) sack(a.px, a.st, a.u + 2.9, a.v + 1.6, 2.4, hash(a.n * 10, 4));
  },
});
registerProp('hayCart', { lu: 15, lv: 5, h: 8, draw: (a) => cart(a.px, a.st, a.u, a.v, 'hay', a.n) });
registerProp('cart', { lu: 15, lv: 5, h: 6, draw: (a) => cart(a.px, a.st, a.u, a.v, a.n > 0.5 ? 'barrels' : 'sacks', a.n) });
registerProp('handcart', { lu: 10, lv: 4, h: 4.5, draw: (a) => cart(a.px, a.st, a.u, a.v, a.n > 0.6 ? 'sacks' : a.n > 0.3 ? 'barrels' : 'none', a.n, true) });
registerProp('woodPile', { lu: 12, lv: 4, h: 3.4, draw: (a) => woodPile(a.px, a.st, a.u, a.v, a.n) });
registerProp('bench', { lu: 6, lv: 1.6, h: 2.6, draw: (a) => bench(a.px, a.st, a.u, a.v) });
registerProp('benchV', { lu: 1.6, lv: 6, h: 2.6, draw: (a) => bench(a.px, a.st, a.u, a.v, false) });
registerProp('pots', {
  lu: 5, lv: 3, h: 4,
  draw: (a) => {
    flowerPot(a.px, a.u + 1.2, a.v + 1.2, 0, Math.floor(a.n * 1000), true);
    flowerPot(a.px, a.u + 3.6, a.v + 1.8, 0, Math.floor(a.n * 1000) + 1);
  },
});
registerProp('pot', { lu: 2.4, lv: 2.4, h: 3.5, draw: (a) => flowerPot(a.px, a.u + 1.2, a.v + 1.2, 0, Math.floor(a.n * 1000), true) });
registerProp('pottedTree', { lu: 3.4, lv: 3.4, h: 9, draw: (a) => pottedTree(a.px, a.st, a.u + 1.7, a.v + 1.7, Math.floor(a.n * 1000)) });
registerProp('lampPost', { lu: 1.4, lv: 1.4, h: 9, draw: (a) => lampPost(a.px, a.st, a.lights, a.u + 0.7, a.v + 0.7) });
registerProp('signPost', { lu: 1.4, lv: 3.4, h: 7, draw: (a) => signPost(a.px, a.st, a.u + 0.7, a.v + 0.5, a.n) });
registerProp('stall', { lu: 9.6, lv: 6, h: 9, draw: (a) => marketStall(a.px, a.st, a.u, a.v, a.n) });
registerProp('well', { lu: 6.6, lv: 6.6, h: 8, draw: (a) => well(a.px, a.st, a.u + 3.3, a.v + 3.3) });
registerProp('trough', { lu: 7, lv: 2.6, h: 2.2, draw: (a) => trough(a.px, a.st, a.u, a.v) });
registerProp('haystack', { lu: 8, lv: 7.4, h: 7, draw: (a) => haystack(a.px, a.st, a.u + 4, a.v + 3.7, a.n) });
registerProp('bales', { lu: 8.4, lv: 2.6, h: 4, draw: (a) => bales(a.px, a.st, a.u, a.v) });
registerProp('hurdle', { lu: 9, lv: 1, h: 4, draw: (a) => hurdle(a.px, a.st, a.u, a.v + 0.5, a.u + 9, a.v + 0.5) });
registerProp('hurdleV', { lu: 1, lv: 9, h: 4, draw: (a) => hurdle(a.px, a.st, a.u + 0.5, a.v, a.u + 0.5, a.v + 9) });
registerProp('washing', { lu: 10, lv: 1, h: 8, draw: (a) => washingLine(a.px, a.st, a.u, a.v + 0.5, a.n) });
registerProp('bucket', { lu: 1.6, lv: 1.6, h: 1.4, draw: (a) => bucket(a.px, a.st, a.u + 0.8, a.v + 0.8, 0) });
registerProp('bush', { lu: 4, lv: 4, h: 4, draw: (a) => bush(a.px, a.u + 2, a.v + 2, 2, 2.6, 2.2, Math.floor(a.n * 1000), LEAF, a.n > 0.5 ? [FLOWERS[0]!, FLOWERS[5]!] : [FLOWERS[1]!], 0.2) });

// ------------------------------------------------------------------------------ the themes

/** Where a group goes: along a building face, by a road end (a door), along a road, in the open, at the market. */
export type SiteKind = 'wall' | 'door' | 'road' | 'yard' | 'market';
/**
 * A group of props placed together. Items are [kind, a, b]: `a` along the wall (or road), `b`
 * away from it, in world units from the site. `w` weights the pick; `tier` is the lowest tier at
 * which the group appears.
 */
export interface Group {
  w: number;
  items: [string, number, number][];
  tier?: number;
}
export interface Theme {
  groups: Partial<Record<SiteKind, Group[]>>;
  /** Groups for the walls of particular buildings (the granary's sacks, the stables' hay). */
  near?: Partial<Record<BuildingKey | 'keep', Group[]>>;
  /** Market stall spots [u, v] (the min corner of a stall), filled as the town grows. */
  market?: [number, number][];
  /** Props always placed once the given tier is reached: [kind, u, v, tier]. */
  fixed?: [string, number, number, number][];
}
const THEMES = new Map<string, Theme>();
export function registerTheme(faction: string, t: Theme): void {
  THEMES.set(faction, t);
}

const G = (w: number, items: [string, number, number][], tier = 1): Group => ({ w, items, tier });
registerTheme('templar', {
  groups: {
    wall: [
      G(3, [['barrels', 0, 0]]),
      G(3, [['crates', 0, 0], ['barrel', 7.6, 0.2]]),
      G(2, [['sacks', 0, 0]]),
      G(2, [['woodPile', 0, 0]]),
      G(2, [['bench', 0, 0], ['pot', 6.4, 0]], 2),
      G(2, [['pots', 0, 0]], 2),
      G(1, [['pottedTree', 0, 0], ['pot', 3.8, 0.4]], 3),
      G(1, [['handcart', 0, 0.4]]),
      G(1, [['crate', 0, 0], ['bucket', 3.8, 0.6], ['sacks', 5.6, 0]]),
    ],
    door: [G(3, [['lampPost', 0, 0]], 2), G(2, [['pots', 0, 0]], 2), G(1, [['barrel', 0, 0], ['crate', 3.8, 0]]), G(1, [['signPost', 0, 0]], 3)],
    road: [G(3, [['lampPost', 0, 0]], 3), G(1, [['bench', 0, 0]], 2), G(1, [['bush', 0, 0]]), G(1, [['pot', 0, 0]], 2), G(1, [['hurdle', 0, 0]]), G(1, [['crates', 0, 0]])],
    yard: [G(1, [['bush', 0, 0]]), G(1, [['crates', 0, 0]]), G(1, [['bucket', 0, 0], ['barrel', 2, 0]])],
    market: [
      G(3, [['stall', 0, 0]]),
      G(1, [['stall', 0, 0], ['sacks', 10.4, 0.6]], 3),
      G(1, [['cart', 0, 0]]),
      G(1, [['crates', 0, 0], ['barrels', 8, 0]], 2),
    ],
  },
  near: {
    granary: [G(3, [['sacks', 0, 0], ['sacks', 6.8, 0.4]]), G(2, [['hayCart', 0, 0.5]]), G(2, [['barrels', 0, 0], ['sacks', 7, 0]]), G(1, [['crates', 0, 0]])],
    stables: [G(3, [['bales', 0, 0]]), G(2, [['haystack', 0, 0.5]]), G(2, [['trough', 0, 0], ['bucket', 7.6, 0.4]]), G(1, [['hayCart', 0, 0.5]], 2), G(1, [['woodPile', 0, 0]])],
    workshop: [G(3, [['woodPile', 0, 0]]), G(2, [['crates', 0, 0]]), G(2, [['handcart', 0, 0.4]]), G(1, [['barrels', 0, 0]])],
    hospital: [G(3, [['pots', 0, 0]]), G(2, [['bench', 0, 0], ['pottedTree', 6.6, -0.6]]), G(2, [['washing', 0, 1.2]]), G(1, [['bush', 0, 0]])],
    chapter: [G(3, [['pots', 0, 0]], 2), G(2, [['pottedTree', 0, 0]], 2), G(2, [['bench', 0, 0], ['pot', 6.4, 0]]), G(1, [['bush', 0, 0]])],
    barracks: [G(3, [['barrels', 0, 0]]), G(2, [['crates', 0, 0], ['barrel', 7.6, 0]]), G(2, [['woodPile', 0, 0]]), G(1, [['washing', 0, 1.2]], 2), G(1, [['bench', 0, 0]])],
    keep: [G(3, [['barrels', 0, 0]]), G(2, [['crates', 0, 0]]), G(1, [['sacks', 0, 0], ['crate', 6.8, 0]]), G(1, [['pots', 0, 0]], 3)],
    range: [G(3, [['bales', 0, 0]]), G(2, [['crates', 0, 0]]), G(1, [['barrel', 0, 0]])],
    walls: [G(3, [['woodPile', 0, 0]]), G(2, [['barrels', 0, 0]]), G(2, [['crates', 0, 0], ['sacks', 7.6, 0]]), G(1, [['bales', 0, 0]]), G(1, [['handcart', 0, 0.5]])],
  },
  // A fair outside the gate, either side of the road in, and a corner stall by the cross.
  market: [[262, 103], [276, 104], [290, 103], [262, 128], [278, 129], [294, 128], [304, 104], [308, 130], [200, 124]],
  fixed: [['well', 75.7, 63.7, 1]],
});

// ------------------------------------------------------------------------------- placement

export interface Placed {
  kind: string;
  u: number;
  v: number;
  n: number;
  /** The group it belongs to (painted and sorted together). */
  group: number;
}

export interface PlaceOptions {
  faction: string;
  seed: number;
  levels: Record<BuildingKey, number>;
  /** What each building recorded standing on the ground (pixels.ts recordFootprints). */
  footprints: Partial<Record<BuildingKey | 'keep', Footprint[]>>;
  /** Extra ground to keep clear (trees: [u, v, radius]). */
  clear?: [number, number, number][];
}

/** How many groups each tier puts along a building: an empty lot is bare, the grand tier busy. */
const DENSITY = [0, 4, 8, 13, 20];

/** Ground the town's life needs: the drill yard, the butts, the engine's trial ground. */
const KEEP_CLEAR: [number, number, number, number][] = [
  [86, 58, 148, 144],
  [138, 32, 220, 72],
  [146, 154, 172, 178],
  PADDOCK,
  GARDEN,
  ...FIELDS,
];

type Rect = [number, number, number, number];
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** The placement pass (pure, deterministic). */
export function placeProps(o: PlaceOptions): Placed[] {
  const theme = THEMES.get(o.faction) ?? THEMES.get('templar')!;
  const out: Placed[] = [];
  const taken: Rect[] = [];
  const solid: Rect[] = [];
  for (const fs of Object.values(o.footprints)) for (const f of fs ?? []) solid.push([f[0] - 0.4, f[1] - 0.4, f[2] + 0.4, f[3] + 0.4]);
  const clear = o.clear ?? [];
  let group = 0;
  let salt = 0;
  const rnd = () => hash(o.seed, salt++, 4242);
  const fits = (kind: string, u: number, v: number): Rect | null => {
    const d = LIB.get(kind);
    if (!d) return null;
    const r: Rect = [u, v, u + d.lu, v + d.lv];
    // Off the roads (their painted width is 5.5 and people walk ±4 of the line), with a margin.
    const cu = u + d.lu / 2;
    const cv = v + d.lv / 2;
    for (const [pu, pv] of [[u, v], [r[2], v], [u, r[3]], [r[2], r[3]], [cu, cv]] as const) if (roadDistance(pu, pv, 9) < 6.2) return null;
    if (u < -110 || v < -110 || r[2] > 345 || r[3] > 345) return null;
    // Not in the walls' ditch and stakes, inside or out.
    const W = WALL;
    if ((r[2] > W - 1 && u < W + 22 && r[3] > -6 && v < W + 22) || (r[3] > W - 1 && v < W + 22 && r[2] > -6 && u < W + 22)) return null;
    if (u < 5 || v < 5) if (r[2] > -22 && r[3] > -22 && u < W + 4 && v < W + 4) return null;
    for (const k of KEEP_CLEAR) if (overlaps(r, k)) return null;
    for (const s of solid) if (overlaps(r, s)) return null;
    for (const t of taken) if (overlaps(r, t)) return null;
    for (const [tu, tv, tr] of clear) if (Math.max(Math.abs(cu - tu) - d.lu / 2, Math.abs(cv - tv) - d.lv / 2) < tr) return null;
    return r;
  };
  /** Try a group at a site: a = along (u or v), b = away; `axis` 'u' means along u (a left face). */
  const tryGroup = (g: Group, su: number, sv: number, axis: 'u' | 'v', away: number): boolean => {
    const rects: [string, number, number, Rect][] = [];
    for (const [kind, a, b] of g.items) {
      const d = LIB.get(kind);
      if (!d) return false;
      const u = axis === 'u' ? su + a : away > 0 ? su + b : su - b - d.lu;
      const v = axis === 'u' ? (away > 0 ? sv + b : sv - b - d.lv) : sv + a;
      const r = fits(kind, u, v);
      if (!r || rects.some((x) => overlaps(x[3], r))) return false;
      rects.push([kind, u, v, r]);
    }
    for (const [kind, u, v, r] of rects) {
      taken.push([r[0] - 0.6, r[1] - 0.6, r[2] + 0.6, r[3] + 0.6]);
      out.push({ kind, u, v, n: rnd(), group });
    }
    group++;
    return true;
  };
  const pick = (gs: Group[] | undefined, tier: number): Group | null => {
    const ok = (gs ?? []).filter((g) => (g.tier ?? 1) <= tier);
    const sum = ok.reduce((s, g) => s + g.w, 0);
    if (!sum) return null;
    let x = rnd() * sum;
    for (const g of ok) if ((x -= g.w) <= 0) return g;
    return ok[ok.length - 1]!;
  };
  const levelOf = (k: BuildingKey | 'keep') => (k === 'keep' ? Math.max(1, ...Object.values(o.levels)) : o.levels[k] ?? 0);

  // Fixed props first (the well).
  for (const [kind, u, v, t] of theme.fixed ?? []) {
    const d = LIB.get(kind);
    if (!d || tierOf(Math.max(0, ...Object.values(o.levels))) < t) continue;
    taken.push([u - 0.5, v - 0.5, u + d.lu + 0.5, v + d.lv + 0.5]);
    out.push({ kind, u, v, n: rnd(), group: group++ });
  }

  // Along the buildings' lit (+v) and right (+u) faces, the ones the viewer sees.
  const keys = ['keep', 'chapter', 'barracks', 'range', 'granary', 'stables', 'workshop', 'hospital', 'walls'] as (BuildingKey | 'keep')[];
  for (const key of keys) {
    const tier = tierOf(levelOf(key));
    const want = DENSITY[tier] ?? 0;
    if (!want) continue;
    const fps = (o.footprints[key] ?? []).filter((f) => (f[2] - f[0]) * (f[3] - f[1]) >= 30 && f[4] >= 5);
    const sites: [number, number, 'u' | 'v', number][] = [];
    for (const f of fps) {
      for (let a = f[0] + 0.5; a < f[2] - 3; a += 3.5) sites.push([a, f[3] + 0.8, 'u', 1]);
      for (let a = f[1] + 0.5; a < f[3] - 3; a += 3.5) sites.push([f[2] + 0.8, a, 'v', 1]);
      // The back faces too, where a low building leaves them in view.
      if (f[4] < 14) {
        for (let a = f[0] + 0.5; a < f[2] - 3; a += 7) sites.push([a, f[1] - 0.8, 'u', -1]);
        for (let a = f[1] + 0.5; a < f[3] - 3; a += 7) sites.push([f[0] - 0.8, a, 'v', -1]);
      }
    }
    // Shuffle the sites by hash.
    const order = sites.map((s, i) => [hash(i, o.seed, key.length * 31 + key.charCodeAt(0)), s] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    let placed = 0;
    for (const [su, sv, axis, away] of order) {
      if (placed >= want) break;
      const g = pick(theme.near?.[key] ?? theme.groups.wall, tier) ?? pick(theme.groups.wall, tier);
      if (g && tryGroup(g, su, sv, axis, away)) placed++;
    }
  }

  // By the road ends that lead to doors (lanterns, pots, a sign), from the stone tier.
  const deg = new Map<string, number>();
  for (const [a, b] of EDGES) {
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
  }
  const top = tierOf(Math.max(0, ...Object.values(o.levels)));
  for (const [name, [nu, nv]] of Object.entries(NODES)) {
    if (top < 1) break;
    const t = (name in o.levels ? tierOf(o.levels[name as BuildingKey]) : top) || 0;
    if (!t) continue;
    for (const [du, dv] of [[7.2, -1], [-1, 7.2], [-8.6, -1], [-1, -8.6]] as const) {
      const g = pick(theme.groups.door, t);
      if (g && rnd() < 0.25 + t * 0.12) tryGroup(g, nu + du, nv + dv, 'u', 1);
    }
  }

  // Along the road edges, every so often, more as the town grows.
  for (const [a, b] of EDGES) {
    if (top < 1) break;
    const [au, av] = NODES[a];
    const [bu, bv] = NODES[b];
    const L = Math.hypot(bu - au, bv - av);
    const nu = -(bv - av) / L;
    const nv = (bu - au) / L;
    for (let s = 8; s < L - 8; s += 13) {
      if (rnd() > 0.12 + top * 0.12) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      const pu = au + ((bu - au) * s) / L + nu * side * 7.5;
      const pv = av + ((bv - av) * s) / L + nv * side * 7.5;
      const g = pick(theme.groups.road, top);
      if (g) tryGroup(g, pu, pv, 'u', 1);
    }
  }

  // The market: stalls fill their spots as the town grows; the corner stall by the cross last.
  const stalls = [0, 2, 4, 6, 9][top] ?? 0;
  (theme.market ?? []).slice(0, stalls).forEach(([mu, mv]) => {
    const g = pick(theme.groups.market, top);
    if (!g || !tryGroup(g, mu, mv, 'u', 1)) {
      const s = LIB.get('stall');
      if (s) tryGroup(G(1, [['stall', 0, 0]]), mu, mv, 'u', 1);
    }
  });

  // A little clutter in the open ground inside the walls.
  for (let i = 0; i < top * 6; i++) {
    const u = 8 + rnd() * 216;
    const v = 8 + rnd() * 216;
    const g = pick(theme.groups.yard, top);
    if (g) tryGroup(g, u, v, 'u', 1);
  }
  return out;
}

/** Ground footprints and heights of placed props, for the cast shadows (ground-hd.ts). */
export function propShadows(placed: Placed[]): Footprint[] {
  const out: Footprint[] = [];
  for (const p of placed) {
    const d = LIB.get(p.kind);
    if (!d) continue;
    out.push([p.u + d.lu * 0.15, p.v + d.lv * 0.15, p.u + d.lu * 0.85, p.v + d.lv * 0.85, d.h]);
  }
  return out;
}

// -------------------------------------------------------------------------------- painting

export interface PaintedProps {
  arts: Art[];
  /** Lamp glass in world pixels (classic 512×288 coordinates), for halos. */
  lamps: [number, number][];
}

let shared: Px | null = null;

/**
 * Paint placed props: one Art per group (sorted by its centre), outlined, with its night canvas
 * and a lights canvas for its lantern glass. `inShade(u, v)` darkens a group that stands in a
 * building's cast shadow, so the shadow falls over the props too.
 */
export function paintProps(placed: Placed[], st: CityStyle, frame: Frame, inShade?: (u: number, v: number) => number, rig: NightRig = NIGHT_RIG): PaintedProps {
  if (!shared || shared.w !== frame.w || shared.h !== frame.h || shared.k !== frame.k) shared = new Px(frame.w, frame.h, frame);
  const px = shared;
  const arts: Art[] = [];
  const lamps: [number, number][] = [];
  const byGroup = new Map<number, Placed[]>();
  for (const p of placed) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
  const shadeCol = hex('#2c2c4c');
  for (const ps of byGroup.values()) {
    px.clear();
    const lights: V3[] = [];
    let du = 0;
    let dv = 0;
    for (const p of ps) {
      const d = LIB.get(p.kind)!;
      d.draw({ px, st, u: p.u, v: p.v, n: p.n, lights });
      du += p.u + d.lu / 2;
      dv += p.v + d.lv / 2;
    }
    du /= ps.length;
    dv /= ps.length;
    const sh = inShade?.(du, dv) ?? 0;
    const b0 = px.bounds();
    if (!b0) continue;
    if (sh > 0) {
      // In a building's shadow: the cool shade over everything but the lantern glass.
      for (let y = b0[1]; y < b0[3]; y++)
        for (let x = b0[0]; x < b0[2]; x++) {
          const i = y * px.w + x;
          const c = px.data[i]!;
          if (c && c !== FLAME && c !== FLAME2) px.data[i] = mix(c, shadeCol, 0.38 * sh);
        }
    }
    px.outline(st.outline);
    const b = px.bounds()!;
    const canvas = px.toCanvas(...b);
    let lightsC: HTMLCanvasElement | null = null;
    if (lights.length) {
      const lp = new Px(b[2] - b[0], b[3] - b[1]);
      for (let y = b[1]; y < b[3]; y++)
        for (let x = b[0]; x < b[2]; x++) {
          const c = px.data[y * px.w + x];
          if (c === FLAME || c === FLAME2) lp.set(x - b[0], y - b[1], c === FLAME ? hex('#ffe6a0') : FLAME);
        }
      lightsC = lp.toCanvas();
      for (const l of lights) lamps.push([px.X(l.u, l.v) / px.k - px.mx, px.Y(l.u, l.v, l.z) / px.k - px.my]);
    }
    arts.push({ canvas, lights: lightsC, night: nightCanvas(px, ...b, rig), x: b[0], y: b[1], d: du + dv });
  }
  return { arts, lamps };
}

// ------------------------------------------------------------------------------- shadows

/**
 * The sun's cast, per unit of height, on the ground: toward +u and a little toward -v, so a
 * shadow falls to the right of what casts it and a touch up the screen, away from the lit left
 * faces (the key light of pixels.ts, upper left).
 */
export const SUN: [number, number] = [0.62, -0.2];

/** 0..1: how deep in the cast shadow of any footprint (u, v) lies (1 in the umbra, less at the tip). */
export function shadowAt(u: number, v: number, casts: Footprint[]): number {
  let best = 0;
  for (const f of casts) {
    const lu = SUN[0] * f[4];
    const lv = SUN[1] * f[4];
    // Quick reject on the swept box.
    if (u < f[0] || u > f[2] + lu || v > f[3] || v < f[1] + lv) continue;
    // t range where (u, v) - t·L lies inside the footprint.
    let t0 = 0;
    let t1 = 1;
    const span = (p: number, a: number, b: number, l: number) => {
      if (Math.abs(l) < 1e-6) {
        if (p < a || p > b) t1 = -1;
        return;
      }
      const x = (p - b) / l;
      const y = (p - a) / l;
      t0 = Math.max(t0, Math.min(x, y));
      t1 = Math.min(t1, Math.max(x, y));
    };
    span(u, f[0], f[2], lu);
    span(v, f[1], f[3], lv);
    if (t1 < t0) continue;
    // The tip of the shadow (cast by the top) softens one step.
    const s = t0 > 0.82 ? 0.6 : 1;
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}
