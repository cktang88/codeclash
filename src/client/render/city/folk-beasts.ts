// HD beasts for the towns: horses (walk, idle, graze, toss), oxen for the castle town's carts,
// bone horses and carrion crows for the necropolis, dogs, hens, crows and the carts, drawn with
// the paper painter's primitives at the HD city's density and posed per frame like the people
// (folk-people.ts): legs in the lateral walk sequence (hind, fore, hind, fore), angles snapped,
// joints on whole pixels.
//
// References (docs/art-references/city-people.md): the CC0 "Animated horse" walk and graze
// (OpenGameArt) for the leg sequence and the silhouette at ~40 px, the CC0 German shepherd walk
// for the dog's trot, the CC0 chicken sheet for the hen, Hiroshige's Mishima for the pack horse.

import type { Paper, P2 } from '../paper/core.ts';
import { dirOf, dot, ip, oval, step, type Mats } from './folk-paint.ts';
import { hex, mix, tone, type Col } from './pixels.ts';

export type HorseClip = 'walk' | 'idle' | 'graze' | 'toss';
export const HORSE_CLIP_FRAMES: Record<HorseClip, number> = { walk: 8, idle: 4, graze: 6, toss: 4 };
export const HORSE_CANVAS = { w: 72, h: 54, footY: 50 / 54 };
export const DOG_CANVAS = { w: 36, h: 28, footY: 25 / 28 };
export const HEN_CANVAS = { w: 18, h: 18, footY: 16 / 18 };
export const CROW_CANVAS = { w: 26, h: 16, footY: 0.5 };
export const CART_CANVAS = { w: 64, h: 44, footY: 40 / 44 };

const TAU = Math.PI * 2;
const HOOF = hex('#2a2018');
const INK = hex('#1e1416');
const BONE = hex('#d4cbb0');

export interface BeastLook {
  /** 'horse' | 'ox' | 'bones' (a bone horse). */
  kind: 'horse' | 'ox' | 'bones';
  coat: Col;
  mane: Col;
  /** Tack: a Templar caparison (white with the cross), a war saddle with tassels, a pack. */
  tack?: 'caparison' | 'saddle' | 'pack' | 'none';
  cloth?: Col;
  charge?: Col;
  eye?: Col;
  /** Socks and a blaze. */
  white?: boolean;
}

interface Leg {
  /** Top joint x (from the body centre), hind or fore, far or near. */
  x: number;
  hind: boolean;
  far: boolean;
  /** Phase offset in the walk. */
  ph: number;
}

/** Paint a horse, ox or bone horse facing east. */
export function paintHorse(c: Paper, M: Mats, H: BeastLook, clip: HorseClip, f: number): void {
  const n = HORSE_CLIP_FRAMES[clip];
  const p = f / n;
  const ox = H.kind === 'ox';
  const bones = H.kind === 'bones';
  const mCoat = M.of(H.coat);
  const mMane = M.of(H.mane);
  const mHoof = M.of(ox ? hex('#3a3028') : HOOF);
  const mBone = M.of(BONE);
  const bodyM = bones ? mBone : mCoat;
  // Body: an ox is longer, lower and deeper; a horse's barrel sits on longer legs.
  const by = ox ? -15 : -18;
  const legLen = ox ? 10 : 13;
  const walk = clip === 'walk';
  const legs: Leg[] = [
    { x: -9, hind: true, far: true, ph: 0.5 },
    { x: 8, hind: false, far: true, ph: 0.75 },
    { x: -7, hind: true, far: false, ph: 0 },
    { x: 10, hind: false, far: false, ph: 0.25 },
  ];
  const bob = walk ? (Math.round(Math.sin(p * TAU * 2)) > 0 ? -1 : 0) : 0;
  const body: P2 = [0, by + bob];
  const drawLeg = (L: Leg) => {
    const t = L.far ? 1 : 2;
    const q = (((walk ? p + L.ph : 0) % 1) + 1) % 1;
    const swingA = walk ? 20 * Math.cos(q * TAU) : 0;
    // Lift the hoof in the swing half (q 0.5..1): the knee folds back (fore), the hock up (hind).
    const lift = walk && q > 0.55 ? Math.sin(((q - 0.55) / 0.45) * Math.PI) : 0;
    const graze = clip === 'graze' && !L.hind && !L.far ? 6 : 0;
    const top: P2 = [L.x + (L.far ? -1 : 0), body[1] + 2];
    const mm = bones ? mBone : L.far ? M.of(tone(H.coat, 0.15)) : mCoat;
    const w = bones ? 1.6 : ox ? 3.6 : 3;
    const upLen = legLen * 0.45, loLen = legLen * 0.55;
    let knee: P2, hoof: P2;
    if (L.hind) {
      knee = ip(step(top, swingA - 14 + lift * 10, upLen));
      hoof = ip(step(knee, swingA + 8 - lift * 50, loLen));
    } else {
      knee = ip(step(top, swingA + graze, upLen));
      hoof = ip(step(knee, swingA - lift * 70 + graze, loLen));
    }
    // A thigh mass for the hind leg, a forearm for the fore.
    c.rod(top, knee, w + (L.hind && !bones ? 1.6 : 0.6), w * 0.8, mm, { tone: t });
    c.rod(knee, hoof, w * 0.7, w * 0.62, mm, { tone: t });
    if (bones) dot(c, knee[0], knee[1], M.code(mBone, 3));
    const sock = H.white && !L.far ? M.of(hex('#e8e2d4')) : -1;
    if (sock >= 0) c.rod([hoof[0], hoof[1] - 2], hoof, w * 0.66, w * 0.66, sock);
    c.rod([hoof[0], hoof[1]], [hoof[0] + 1.2, hoof[1] + 0.6], 2.4, 2.2, mHoof, { tone: t });
  };
  // Ground: drop the body so the lowest hoof stands on the ground line.
  for (const L of legs) if (L.far) drawLeg(L);
  // Tail (behind the body).
  const swish = clip === 'idle' ? [0, 1, 2, 1][f]! : walk ? (f % 4 < 2 ? 0 : 1) : 1;
  const tailTop: P2 = [-11, body[1] - 3];
  if (bones) {
    for (let k = 0; k < 5; k++) dot(c, tailTop[0] - 1 - k * 0.4 - swish * 0.3 * k, tailTop[1] + 1 + k * 1.6, M.code(mBone, k % 2 ? 2 : 3));
  } else if (ox) {
    c.rod(tailTop, [tailTop[0] - 1 - swish, tailTop[1] + 9], 1.2, 1.2, mCoat, { tone: 1 });
    c.blob([tailTop[0] - 1 - swish, tailTop[1] + 10], 1.2, 1.6, mMane);
  } else {
    c.rod(tailTop, [tailTop[0] - 3 - swish, tailTop[1] + 5], 3, 2.6, mMane, { tone: 2 });
    c.rod([tailTop[0] - 3 - swish, tailTop[1] + 5], [tailTop[0] - 2 - swish * 2, tailTop[1] + 12], 2.6, 1.4, mMane, { tone: 1 });
  }
  // Barrel: a long ellipse, deeper at the chest; the ox carries a hump at the withers.
  if (bones) {
    // Ribs: pale bars over a dark hollow, a spine along the top, the pelvis behind.
    oval(c, M, [body[0] + 0.5, body[1]], 11, 5.2, M.of(hex('#3a3236')), () => true, 1);
    c.rod([body[0] - 11, body[1] - 4], [body[0] + 9, body[1] - 5], 1.8, 1.8, mBone, { tone: 3 });
    for (let k = -6; k <= 8; k += 2) c.rod([body[0] + k, body[1] - 4], [body[0] + k + 1, body[1] + 3.5 - Math.abs(k - 2) * 0.2], 1.3, 1.1, mBone, { tone: 2 });
    c.blob([body[0] - 9, body[1] - 2], 3, 2.6, mBone);
  } else {
    c.blob([body[0] + 0.5, body[1]], ox ? 13 : 11.5, ox ? 6.6 : 5.6, mCoat);
    c.blob([body[0] + 6, body[1] - 0.5], ox ? 6 : 5, ox ? 6.6 : 5.4, mCoat);
    c.blob([body[0] - 7, body[1] - 1], ox ? 6 : 5, ox ? 6 : 5.2, mCoat);
    if (ox) c.blob([body[0] + 7, body[1] - 6], 3.4, 2, mCoat);
    // Belly shade and a highlight along the back.
    c.line([body[0] - 6, body[1] - (ox ? 6 : 5)], [body[0] + 4, body[1] - (ox ? 6 : 5)], M.code(mCoat, 3));
  }
  // Tack.
  if (H.tack === 'caparison' && H.cloth !== undefined) {
    const m = M.of(H.cloth);
    c.poly(
      [[-10, body[1] - 5.5], [8, body[1] - 5.5], [10, body[1] + 4], [6, body[1] + 6.5], [-8, body[1] + 6.5], [-11, body[1] + 3]].map((q) => [c.sx(q[0]!), c.sy(q[1]!)] as P2),
      (x, y, u) => M.code(m, y < c.sy(body[1] - 4) ? 3 : (x + y) % 7 === 0 ? 1 : u > 0.3 ? 1 : 2),
    );
    if (H.charge !== undefined) {
      const mc = M.of(H.charge, 0.06);
      c.line([-1, body[1] - 3], [-1, body[1] + 4], M.code(mc, 2));
      c.line([-4, body[1]], [2, body[1]], M.code(mc, 2));
    }
    c.line([-8, body[1] + 6], [6, body[1] + 6], M.code(M.of(H.mane), 1));
  } else if (H.tack === 'saddle' || H.tack === 'pack') {
    const m = M.of(H.cloth ?? hex('#7a2a20'));
    c.rod([-3, body[1] - 5.5], [3, body[1] - 5.5], 3, 3, m);
    c.rod([-2, body[1] - 3], [-2, body[1] + 3], 2.4, 2.2, m, { tone: 1 });
    if (H.tack === 'pack') {
      // Straw-wrapped bales on either side (the pack horse at Mishima).
      c.blob([-4, body[1] - 6.5], 4.5, 2.6, M.of(hex('#c9aa6a')));
      c.line([-7, body[1] - 6.5], [-1, body[1] - 6.5], M.code(M.of(hex('#6a4a2a')), 1));
    } else if (H.charge !== undefined) {
      // Tassels (fusa) on the crupper.
      const mc = M.of(H.charge);
      c.blob([-9, body[1] - 1], 1.2, 1.6, mc);
      c.blob([-6, body[1] + 1], 1.2, 1.6, mc);
    }
  }
  for (const L of legs) if (!L.far) drawLeg(L);

  // Neck and head.
  const down = clip === 'graze';
  const toss = clip === 'toss' ? [0, 2, 1, 0][f]! : 0;
  const chew = down ? f % 2 : 0;
  const nod = walk ? (f % 4 === 1 ? 1 : 0) : clip === 'idle' && f === 2 ? 1 : 0;
  const wither: P2 = [body[0] + (ox ? 9 : 8), body[1] - (ox ? 3 : 4)];
  const poll: P2 = down ? [body[0] + (ox ? 16 : 17), body[1] + (ox ? 6 : 11)] : ox ? [body[0] + 16, body[1] - 4 + nod] : [body[0] + 14, body[1] - 12 - toss * 2 + nod];
  const muzzle: P2 = down ? [poll[0] + 2, poll[1] + 5 - chew] : ox ? [poll[0] + 4, poll[1] + 4] : [poll[0] + 5 - toss, poll[1] + 6 - toss * 2];
  if (bones) {
    c.rod(wither, poll, 2, 1.6, mBone, { tone: 2 });
    for (let k = 1; k <= 3; k++) {
      const q: P2 = [wither[0] + ((poll[0] - wither[0]) * k) / 4, wither[1] + ((poll[1] - wither[1]) * k) / 4];
      dot(c, q[0], q[1] - 1, M.code(mBone, 3));
    }
    c.rod(poll, muzzle, 3.4, 2.2, mBone, { tone: 2 });
    dot(c, poll[0] + 1, poll[1] + 1, M.code(M.of(INK, 0.07, true), 2));
    if (H.eye !== undefined) dot(c, poll[0] + 1, poll[1] + 1, M.code(M.of(H.eye, 0.07, true), 2));
    c.line([poll[0] + 2, muzzle[1] - 0.5], [muzzle[0], muzzle[1] - 0.5], M.code(M.of(INK, 0.07, true), 2));
  } else {
    c.rod(wither, poll, ox ? 7 : 6.5, ox ? 5 : 3.8, mCoat, { tone: 2 });
    c.rod(poll, muzzle, ox ? 4.4 : 4, ox ? 3.6 : 2.8, mCoat, { tone: 2 });
    // Eye, nostril, ear; a dark muzzle on the bay and the ox.
    const mInk = M.of(INK, 0.07, true);
    const ex = poll[0] + (muzzle[0] - poll[0]) * 0.2, ey = poll[1] + (muzzle[1] - poll[1]) * 0.2;
    dot(c, ex + 0.5, ey - 0.5, M.code(mInk, 2));
    dot(c, muzzle[0], muzzle[1], M.code(M.of(mix(H.coat, INK, 0.6)), 2));
    if (H.white) c.line([ex + 1, ey], [muzzle[0] - 1, muzzle[1] - 1], M.code(M.of(hex('#e8e2d4')), 3));
    if (ox) {
      // Horns sweeping forward and up.
      const mh = M.of(hex('#d8ccb0'));
      c.rod([poll[0] - 1, poll[1] - 1.5], [poll[0] + 2, poll[1] - 4], 1.4, 1, mh, { tone: 3 });
      dot(c, poll[0] - 2, poll[1] - 1, M.code(mCoat, 1));
    } else {
      c.rod([poll[0] - 1, poll[1] - 1], [poll[0] - 0.5, poll[1] - 3.5], 1.6, 1, mCoat, { tone: 3 });
      // The mane down the crest of the neck, and the forelock.
      const mm = mMane;
      for (let k = 0; k <= 4; k++) {
        const q: P2 = [wither[0] + ((poll[0] - wither[0]) * k) / 4 - 1.5, wither[1] + ((poll[1] - wither[1]) * k) / 4 - 1.5];
        c.rod(q, [q[0] - 1, q[1] + 2], 1.8, 1.4, mm, { tone: k % 2 ? 1 : 2 });
      }
      dot(c, poll[0] + 1, poll[1] - 1, M.code(mm, 2));
    }
    if (H.tack === 'saddle' || H.tack === 'caparison') c.line([poll[0] + 1, poll[1]], [muzzle[0] - 1, muzzle[1] - 1], M.code(M.of(hex('#3a2418')), 1));
  }
}

/** A dog: walk (a trot, diagonal pairs), sit, stand wagging. */
export function paintDog(c: Paper, M: Mats, coat: Col, clip: 'walk' | 'sit' | 'stand', f: number): void {
  const m = M.of(coat);
  const md = M.of(tone(coat, 0.35));
  const mInk = M.of(INK, 0.07, true);
  const p = f / 8;
  const sit = clip === 'sit';
  const by = sit ? -6 : -8;
  const legs: [number, boolean, number][] = [[-4, true, 0.5], [4, true, 0], [-3, false, 0], [5, false, 0.5]];
  const leg = (x: number, far: boolean, ph: number, hind: boolean) => {
    const q = clip === 'walk' ? (p + ph) % 1 : 0;
    const a = clip === 'walk' ? 26 * Math.cos(q * TAU) : 0;
    const lift = clip === 'walk' && q > 0.5 ? Math.sin(((q - 0.5) / 0.5) * Math.PI) : 0;
    const top: P2 = [x, by + 1];
    if (sit && hind) {
      c.blob([x + 0.5, -2.5], 2.6, 2.2, far ? md : m);
      c.rod([x + 1, -1], [x + 3, -1], 1.6, 1.4, far ? md : m);
      return;
    }
    const k = ip(step(top, a, 3.5));
    const e = ip(step(k, a - (hind ? -20 : 40) * lift, sit ? 4.5 : 3.5));
    c.rod(top, k, 2.2, 1.8, far ? md : m, { tone: far ? 1 : 2 });
    c.rod(k, e, 1.6, 1.4, far ? md : m, { tone: far ? 1 : 2 });
    dot(c, e[0] + 1, e[1] - 0.5, M.code(far ? md : m, 1));
  };
  for (const [x, far, ph] of legs) if (far) leg(x, true, ph, x < 0);
  // Tail: up and wagging.
  const wag = clip === 'stand' ? [0, 1, 2, 1][f % 4]! : clip === 'walk' ? (f % 2) : 0;
  c.rod([-5, by - 1], [-8 + wag * 0.5, by - 4 - wag], 1.6, 1.2, m, { tone: 2 });
  // Body.
  if (sit) {
    c.blob([-1, by + 0.5], 4.4, 3.2, m);
    c.blob([2, by - 1.5], 3, 3.2, m);
  } else {
    c.blob([0.5, by], 5.6, 2.8, m);
    c.blob([3.5, by - 0.5], 2.8, 2.8, m);
  }
  // A darker saddle along the back.
  c.line([-4, by - 2], [3, by - 2.5], M.code(md, 2));
  for (const [x, far, ph] of legs) if (!far) leg(x, false, ph, x < 0);
  // Head: skull, snout, ears up, an eye, a black nose.
  const hx = sit ? 4 : 6, hy = sit ? by - 5 : by - 3;
  c.blob([hx + 0.5, hy + 0.5], 2.4, 2.2, m);
  c.rod([hx + 2, hy + 1.5], [hx + 4.5, hy + 2], 2, 1.6, m, { tone: 2 });
  dot(c, hx + 5, hy + 1.5, M.code(mInk, 2));
  dot(c, hx + 1.5, hy, M.code(mInk, 2));
  c.rod([hx - 0.5, hy - 1], [hx - 0.5, hy - 3.5], 1.6, 1, md, { tone: 2 });
  dot(c, hx + 1, hy - 2.5, M.code(md, 2));
}

/** A hen: stand, peck, step. */
export function paintHen(c: Paper, M: Mats, white: Col, brown: Col, f: number): void {
  const mw = M.of(white);
  const mb = M.of(brown);
  const peck = f === 1;
  const mLeg = M.of(hex('#d8a43a'));
  c.line([-1, -2], [-1, -1], M.code(mLeg, 2));
  c.line([1, -2], [1.5, -1], M.code(mLeg, 2));
  // Tail feathers up and back.
  c.poly([[-2.5, -4], [-5, -8], [-4.5, -4], [-2.5, -2.5]].map((q) => [c.sx(q[0]!), c.sy(q[1]!)] as P2), () => M.code(mb, 1));
  c.blob([0, -4.5], 3.4, 2.4, mw);
  c.line([-2, -4.5], [1, -3.5], M.code(mb, 2));
  const hx = peck ? 3 : 2, hy = peck ? -3 : -7.5;
  c.blob([hx + 0.5, hy + 0.5], 1.5, 1.5, mw);
  dot(c, hx + 2, hy + 1, M.code(M.of(hex('#e0a030')), 2));
  dot(c, hx, hy - 1, M.code(M.of(hex('#c03026'), 0.07, true), 2));
  dot(c, hx + 1, hy - 1, M.code(M.of(hex('#c03026'), 0.07, true), 2));
  dot(c, hx + 1, hy, M.code(M.of(INK, 0.07, true), 2));
}

/** A crow in flight (wings up, level, down, level); the necropolis's carrion birds are bigger and ragged. */
export function paintCrow(c: Paper, M: Mats, f: number, carrion: boolean): void {
  const m = M.of(carrion ? hex('#2a2430') : hex('#24222a'));
  const s = carrion ? 1.3 : 1;
  c.rod([-4 * s, 0], [3 * s, 0], 2.4 * s, 1.8, m, { tone: 2 });
  c.blob([3.5 * s, -0.5], 1.4, 1.4, m);
  dot(c, 5 * s, 0, M.code(M.of(carrion ? hex('#c8bca0') : hex('#5a5048')), 2));
  if (carrion) dot(c, 4 * s, -1, M.code(M.of(hex('#c03a2a'), 0.07, true), 2));
  // Tail fan.
  c.poly([[-4 * s, -0.5], [-7 * s, -1.5], [-7 * s, 1.5], [-4 * s, 0.8]].map((q) => [c.sx(q[0]!), c.sy(q[1]!)] as P2), () => M.code(m, 1));
  const wing = [-5, -1, 4, -1][f % 4]!;
  const span = 7 * s;
  const tip: P2 = [-2 * s, wing * s];
  c.poly(
    [[-1 * s, -0.5], [2 * s, -0.5], [tip[0] + 1, tip[1] + (wing < 0 ? 0 : 0)], [tip[0] - span * 0.3, tip[1]]].map((q) => [c.sx(q[0]!), c.sy(q[1]!)] as P2),
    (x, y) => (carrion && (x + y) % 3 === 0 && Math.abs(y - c.sy(tip[1])) < 1.2 ? -1 : M.code(m, wing < 0 ? 3 : 1)),
  );
}

/** A two-wheeled cart, shafts forward, its load heaped in the bed; the wheel turns (f 0..3). */
export function paintCart(c: Paper, M: Mats, wood: Col, load: [Col, Col], f: number, bales: boolean): void {
  const mw = M.of(wood);
  const ml = M.of(load[0]);
  const ml2 = M.of(load[1]);
  // Shafts out to the beast.
  c.rod([6, -10], [24, -12], 1.6, 1.4, mw, { tone: 1 });
  // Load.
  if (bales) {
    // Straw-wrapped rice bales (tawara), roped at the ends.
    for (const [x, y] of [[-7, -15], [-1, -15], [5, -15], [-4, -19], [2, -19]] as P2[]) {
      c.rod([x - 2, y], [x + 2.5, y], 4.6, 4.6, ml);
      c.line([x - 1, y - 2], [x - 1, y + 2], M.code(ml2, 1));
      c.line([x + 1.5, y - 2], [x + 1.5, y + 2], M.code(ml2, 1));
    }
  } else {
    for (const [x, y, k] of [[-7, -15, 0], [-1, -15, 1], [5, -15, 0], [-4, -19, 1], [2, -19, 0]] as [number, number, number][]) c.blob([x, y], 3.4, 2.6, k ? ml2 : ml);
  }
  // Bed: side boards, lit top edge, plank seams.
  c.poly(
    [[-12, -14], [10, -14], [10, -8], [-12, -8]].map((q) => [c.sx(q[0]!), c.sy(q[1]!)] as P2),
    (x, y) => {
      const ly = y - c.sy(-14);
      if (ly === 0) return M.code(mw, 3);
      if (ly === 3) return M.code(mw, 1);
      return M.code(mw, (x - c.sx(-12)) % 7 === 0 ? 1 : 2);
    },
  );
  // The wheel: a rim of eight segments, four spokes that turn.
  const cx = 0, cy = -6.5, r = 6;
  const mr = M.of(tone(wood, 0.2));
  const pts: P2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i < 16; i++) c.rod(pts[i]!, pts[(i + 1) % 16]!, 1.6, 1.6, mr, { tone: i < 8 ? 1 : 3 });
  const o = (f % 4) * (Math.PI / 8);
  for (let k = 0; k < 4; k++) {
    const a = o + (k * Math.PI) / 4;
    c.line([cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)], [cx - Math.cos(a) * (r - 1), cy - Math.sin(a) * (r - 1)], M.code(mr, 2));
  }
  c.blob([cx + 0.5, cy + 0.5], 1.2, 1.2, M.of(hex('#5a5058')));
  void dirOf;
}
