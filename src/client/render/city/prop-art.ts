// Prop painting (split from props.ts so the building kits can use it without the placement
// pass's imports): the raster helpers and every prop's drawing, at the frame's density, lit from
// the upper left. See props.ts for the API.

import { box, hash, hex, line3, mix, post, Px, tone, v3, type Col, type V3 } from './pixels.ts';
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
/** Lantern glass: lit at night (paintProps puts these pixels in the lights canvas). */
export const FLAME: Col = hex('#ffd27a');
export const FLAME2: Col = hex('#ff9a3a');

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
      const sp = (a * r * k) / 2.4;
      if (sp - Math.floor(sp) < 0.22 && ll < 0.75) return z < 0.3 ? wood[3] : tone(lit(wood, ll), 0.22);
      const c = lit(wood, ll);
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
  // Pale sawn deal for the battens and lid, darker boards between, dark gaps and nail heads.
  const deal = mix(st.timber[0], st.daub[1], 0.35);
  rbox(px, u, v, z, l, l, h, st.timber, (f, s, t) => {
    const lt = f === 'top' ? l : h;
    const edge = border(s, t, l, lt, 0.45);
    const xq = Math.floor(s * k);
    const yq = Math.floor(t * k);
    if (f === 'top') {
      if (edge) return tone(deal, -0.06);
      return yq % 3 === 2 ? st.timber[2] : xq % 5 === 0 && yq % 3 === 0 ? st.timber[3] : deal;
    }
    const lit = f === 'left';
    if (edge) {
      return lit ? deal : st.timber[1];
    }
    if (lit && Math.abs(s / l - t / lt) < 0.11) return tone(deal, 0.06);
    if (yq % 3 === 2) return st.timber[3];
    return lit ? st.timber[1] : st.timber[2];
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
  // A pointed cap, an iron cage of four posts round warm glass, a drip at the foot.
  rbox(px, u - 0.8, v - 0.8, z, 1.6, 1.6, 2, IRON, (f, s, t, c) => {
    if (f === 'top') return IRON[1];
    const edge = s < 0.3 || s > 1.3 || t < 0.3 || t > 1.7;
    if (edge) return f === 'left' ? IRON[1] : IRON[2];
    return f === 'left' ? FLAME : FLAME2;
  });
  rbox(px, u - 1, v - 1, z + 2, 2, 2, 0.4, IRON);
  dot(px, u, v, z + 2.8, IRON[1], 0, 0.6);
  dot(px, u, v, z + 3.2, IRON[2], 0, 0.6);
  lights.push(v3(u, v, z + 1));
}

/** A lamp post with an arm and a hanging lantern. */
export function lampPost(px: Px, st: CityStyle, lights: V3[], u: number, v: number): void {
  post(px, u, v, 0, 10, st.timber[1], st.timber[2]);
  line3(px, v3(u, v, 9.6), v3(u + 2.2, v + 0.2, 9.6), IRON[2]);
  line3(px, v3(u, v, 8.2), v3(u + 1.2, v + 0.1, 9.6), IRON[2]);
  lantern(px, lights, u + 2.2, v + 0.2, 6.2);
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
  const d = 1.6;
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++) {
      const vv = v + i * d + row * d * 0.5;
      const uu = u + (hash(i, row, 3) - 0.5) * 0.8;
      // Each log: bark along its length, a pale end with a dark ring and heart on the cut face.
      rbox(px, uu, vv, row * d * 0.85, L, d, d, st.timber, (f, s, t, c) => {
        if (f === 'right') {
          const r = Math.hypot(s - d / 2, t - d / 2);
          return r > d * 0.46 ? st.timber[3] : r < d * 0.14 ? st.daub[2] : r > d * 0.3 ? st.daub[1] : st.daub[0];
        }
        if (f === 'top') return t > d - 0.4 ? st.timber[3] : Math.floor(s * k) % 5 === 0 ? st.timber[2] : st.timber[1];
        return t < 0.4 ? st.timber[3] : Math.floor(s * k) % 7 === 3 ? st.timber[3] : st.timber[2];
      });
    }
  cyl(px, u + L + 2, v + 1.5, 0, 1.2, 1.8, (l) => lit(st.timber, l), (du, dv) => (Math.hypot(du, dv) > 0.8 ? st.daub[1] : st.daub[0]));
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
  // Straw laid along the bale in fine lines, two twine bands round it.
  const shade = (f: 'top' | 'left' | 'right', s: number, t: number, c: Col) => {
    const along = f === 'right' ? t : s;
    const across = f === 'top' ? t : f === 'right' ? s : t;
    if (f !== 'right' && (Math.abs(along - 1.2) < 0.5 / k || Math.abs(along - 2.8) < 0.5 / k)) return st.thatch[3];
    if (f === 'right') return Math.floor(s * k + t * k) % 3 === 0 ? tone(c, 0.12) : c;
    return Math.floor(across * k) % 2 === 1 ? tone(c, 0.1) : c;
  };
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

