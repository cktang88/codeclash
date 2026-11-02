// HD townsfolk: the same people as people.ts, painted at twice the density (24×34 cells, about
// 28 pixels tall) so they share one pixel scale with the HD buildings. Built from clean clusters
// with short hue-shifted ramps, lit from the upper left, closed by a coloured outline (a dark tint
// of the neighbouring colour, not black). Faces get an eye, a nose pixel and a mouth; hats and
// headgear carry each faction: the Samurai town's jingasa, sedge kasa, eboshi and shaven monks,
// the necropolis's cowls, skulls and grey-skinned shamblers. Beasts are the classic sprites
// doubled with Scale2x (EPX), which keeps their shapes and rounds their diagonals.

import {
  CART_H, CART_W, CROW_H, CROW_W, DOG_H, DOG_W, FIG_FRAMES, FIG_H, FIG_W, HEN_H, HEN_W, HORSE_FRAMES, HORSE_H, HORSE_W,
  paintCart, paintCrow, paintDog, paintHen, paintHorse, type Look,
} from './people.ts';
import { hex, mix, Px, tone, type Col } from './pixels.ts';
import type { CityStyle } from './style.ts';

const OUT = hex('#1c1416');

/** One-pixel coloured outline: each empty pixel touching the figure takes a dark tint of it. */
function outlineHd(c: Px): void {
  const { w, h, data } = c;
  const add: [number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]) continue;
      const r = x < w - 1 ? data[y * w + x + 1]! : 0;
      const l = x > 0 ? data[y * w + x - 1]! : 0;
      const u = y > 0 ? data[(y - 1) * w + x]! : 0;
      const d = y < h - 1 ? data[(y + 1) * w + x]! : 0;
      const n = r || d || u || l;
      if (!n) continue;
      // Lighter where the light falls (the upper-left side of a form), darker below and right.
      const k = l || u ? (r || d ? 0.72 : 0.8) : 0.66;
      add.push([y * w + x, mix(n, OUT, k)]);
    }
  for (const [i, col] of add) data[i] = col;
}

/** Scale2x / EPX: double a sprite, rounding its stair-steps instead of blocking them. */
function epx(src: Px): Px {
  const out = new Px(src.w * 2, src.h * 2);
  const g = (x: number, y: number) => src.get(x, y);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const P = g(x, y);
      const A = g(x, y - 1);
      const B = g(x + 1, y);
      const C = g(x - 1, y);
      const D = g(x, y + 1);
      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;
      // Never grow into empty space with an edge colour that would swallow a 1-pixel limb.
      if (p1) out.set(2 * x, 2 * y, p1);
      if (p2) out.set(2 * x + 1, 2 * y, p2);
      if (p3) out.set(2 * x, 2 * y + 1, p3);
      if (p4) out.set(2 * x + 1, 2 * y + 1, p4);
    }
  return out;
}

/** A sheet of `frames` cells × 4 facings (contract.ts Dir order), painted facing right. */
function sheetHd(w: number, h: number, frames: number, paint: (c: Px, f: number, back: boolean) => void): HTMLCanvasElement {
  const out = new Px(w * frames, h * 4);
  for (let f = 0; f < frames; f++)
    for (let back = 0; back < 2; back++) {
      const c = new Px(w, h);
      paint(c, f, back === 1);
      outlineHd(c);
      const rows = back ? [3, 2] : [0, 1];
      for (let m = 0; m < 2; m++) {
        const r = rows[m]!;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const col = c.get(m ? w - 1 - x : x, y);
            if (col) out.set(f * w + x, r * h + y, col);
          }
      }
    }
  return out.toCanvas();
}

/** A classic beast painter doubled: paint at classic size without outline, EPX, then outline. */
function doubled(w: number, h: number, frames: number, paint: (c: Px, f: number, back: boolean) => void): HTMLCanvasElement {
  return sheetHd(w * 2, h * 2, frames, (c, f, back) => {
    const s = new Px(w, h);
    paint(s, f, back);
    const d = epx(s);
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const col = d.get(x, y);
      if (col) c.set(x, y, col);
    }
  });
}

// ------------------------------------------------------------------ the figure

const WOOD = hex('#7a5434');
const WOOD_S = hex('#4e3422');
const IRON = hex('#a7adb4');
const IRON_S = hex('#5d636c');

function paintFigureHd(c: Px, L: Look, skin0: Col, f: number, back: boolean): void {
  const R = (x0: number, y0: number, x1: number, y1: number, col: Col) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) c.set(x, y, col);
  };
  const P = (x: number, y: number, col: Col) => c.set(x, y, col);
  const line = (x0: number, y0: number, x1: number, y1: number, col: Col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) c.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col);
  };
  const walk = f <= 3;
  const work = f === 5 || f === 6;
  const shamble = !!L.shamble;
  const bob = walk && (f === 1 || f === 3) ? -1 : 0;
  const stride = walk ? (f === 0 ? 1 : f === 2 ? -1 : 0) : 0;
  const tend = L.work === 'tend' && work;
  const bend = tend ? 4 : shamble ? 1 : 0;
  const lean = tend ? 3 : shamble ? 1 : 0;
  const skin = L.skin ?? skin0;
  const skinL = tone(skin, -0.14);
  const skinS = tone(skin, 0.28);
  const body = L.body;
  const bodyL = tone(body, -0.16);
  const bodyS = tone(body, 0.3);
  const bodyD = tone(body, 0.5);
  const legs = L.legs;
  const legsS = tone(legs, 0.32);
  const shoe = tone(legs, 0.62);

  // Legs.
  if (!L.robe) {
    const far = 10;
    const near = 13;
    for (let y = 22; y <= 29; y++) {
      const low = y >= 26;
      const so = low ? 2 * stride : stride;
      R(far - so, y, far + 1 - so, y, legsS);
      R(near + so, y, near + 1 + so, y, y === 22 ? legsS : legs);
    }
    R(far - 2 * stride - 1, 30, far + 1 - 2 * stride, 30, shoe);
    R(near + 2 * stride, 30, near + 2 + 2 * stride, 30, shoe);
  }
  // Torso, or the robe to the ground.
  const top = 12 + bob + bend;
  const bottom = L.robe ? 29 : 22 + bob;
  for (let y = top; y <= bottom; y++) {
    const k = y - top;
    const flare = L.robe ? (y >= 26 ? 2 : y >= 21 ? 1 : 0) : 0;
    const shift = tend ? Math.max(0, 3 - Math.floor(k / 2)) : shamble ? (k < 3 ? 1 : 0) : 0;
    const x0 = 9 - flare + shift;
    const x1 = 15 + flare + shift;
    for (let x = x0; x <= x1; x++) {
      let col = x <= x0 ? bodyL : x >= x1 - 1 ? bodyS : body;
      if (k === 0 && x > x0 && x < x1) col = bodyL;
      // Folds: one shade line down the robe from the waist.
      if (L.robe && y > top + 9 && x === x0 + 3 + (y % 2)) col = bodyS;
      if (L.rags && y >= bottom - 2 && ((x * 3 + y) % 4 === 0)) continue;
      P(x, y, col);
    }
    if (L.robe && stride && y >= 27) P(stride > 0 ? x1 + 1 : x0 - 1, y, stride > 0 ? bodyS : bodyL);
  }
  if (L.robe) {
    P(10 + stride, 30, shoe);
    P(11 + stride, 30, shoe);
    P(13 - stride, 30, shoe);
    P(14 - stride, 30, shoe);
  }
  const sx0 = tend ? 3 : shamble ? 1 : 0;
  // Sash or belt, and a collar.
  const sash = L.sash ?? (L.robe ? null : tone(legs, 0.35));
  if (sash) R(9 + sx0, top + 7, 15 + sx0, top + 8, sash);
  if (sash) P(9 + sx0, top + 7, tone(sash, -0.2));
  if (!back && !L.cross) {
    const collar = L.robe ? tone(body, -0.55) : tone(body, -0.35);
    for (let k = 0; k < 4; k++) P(13 + sx0 - Math.floor(k / 2), top + k, collar);
  }
  if (L.apron) R(back ? 9 : 11 + sx0, top + 3, back ? 9 : 15 + sx0, Math.min(bottom, top + 12), L.apron);
  if (L.cross) {
    const cx = (back ? 12 : 12) + sx0;
    const cy = top + 4;
    R(cx - 2, cy, cx + 2, cy, L.cross);
    R(cx, cy - 2, cx, cy + 3, L.cross);
  }

  // Head.
  const hy = 5 + bob + bend;
  const hx = 10 + lean;
  const hair = L.hair;
  const hairL = tone(hair, -0.18);
  const hairS = tone(hair, 0.3);
  const skull = L.head === 'skull';
  const bone = hex('#d8cfb2');
  const face = skull ? bone : skin;
  // Neck.
  R(hx + 2, hy + 7, hx + 3, hy + 7, skull ? hex('#8a826c') : skinS);
  for (let y = hy; y <= hy + 6; y++)
    for (let x = hx; x <= hx + 5; x++) {
      if ((y === hy || y === hy + 6) && (x === hx || x === hx + 5)) continue;
      P(x, y, x === hx + 5 || y === hy + 6 ? (skull ? hex('#a89c80') : skinS) : x === hx || y === hy ? (skull ? hex('#ece4cc') : skinL) : face);
    }
  if (!back) {
    // Face: nose pixel forward, the eye, a mouth in shade.
    P(hx + 6, hy + 3, skull ? hex('#a89c80') : skinS);
    P(hx + 4, hy + 2, L.eyes ?? hex('#2a1c18'));
    if (L.eyes) P(hx + 3, hy + 2, L.eyes);
    P(hx + 5, hy + 5, skull ? hex('#3a302a') : tone(skin, 0.42));
    if (skull) {
      R(hx + 3, hy + 2, hx + 4, hy + 3, L.eyes ?? hex('#2a2022'));
      P(hx + 5, hy + 4, hex('#3a302a'));
      P(hx + 4, hy + 5, hex('#3a302a'));
    }
  }
  const cloth = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, x === x0 || y === y0 ? hairL : x === x1 ? hairS : hair);
  };
  switch (L.head) {
    case 'hair':
      R(hx, hy - 1, hx + 5, hy, hair);
      R(hx, hy - 1, hx + 4, hy - 1, hairL);
      R(hx, hy + 1, hx + 1, hy + 3, hair);
      if (back) R(hx, hy, hx + 5, hy + 4, hair);
      break;
    case 'topknot':
      // Sakayaki: the pate shaved, hair at the back and sides, the knot laid forward on top.
      R(hx, hy, hx + 1, hy + 4, hair);
      R(hx, hy, hx + 2, hy, hair);
      R(hx + 1, hy - 1, hx + 4, hy - 1, hair);
      P(hx + 4, hy - 1, hairL);
      if (back) R(hx, hy, hx + 5, hy + 4, hair);
      break;
    case 'shaved':
      P(hx + 1, hy, tone(skin, -0.3));
      P(hx + 2, hy, tone(skin, -0.3));
      break;
    case 'hood':
    case 'veil':
    case 'cowl':
      cloth(hx - 1, hy - 1, hx + 2, hy + 7);
      R(hx, hy - 2, hx + 5, hy - 1, hair);
      R(hx + 2, hy - 2, hx + 4, hy - 2, hairL);
      if (L.head === 'cowl') {
        // Deep cowl: the face sunk in shadow, a point at the back.
        R(hx + 3, hy, hx + 5, hy + 5, hex('#1e1a1e'));
        P(hx - 1, hy - 3, hair);
        P(hx - 2, hy - 2, hair);
        if (!back) {
          P(hx + 4, hy + 2, L.eyes ?? hex('#3a3232'));
          P(hx + 5, hy + 2, L.eyes ?? hex('#3a3232'));
        }
        R(hx + 6, hy - 1, hx + 6, hy + 6, hairS);
      }
      if (back) cloth(hx - 1, hy - 1, hx + 5, hy + 7);
      break;
    case 'coif':
      R(hx, hy - 1, hx + 5, hy, hair);
      R(hx, hy + 1, hx + 1, hy + 6, hair);
      if (back) R(hx, hy - 1, hx + 5, hy + 6, hair);
      break;
    case 'hat':
      R(hx - 2, hy, hx + 7, hy, hairS);
      R(hx - 1, hy - 1, hx + 6, hy - 1, hair);
      R(hx, hy - 3, hx + 5, hy - 2, hair);
      R(hx, hy - 3, hx + 4, hy - 3, hairL);
      break;
    case 'cap':
      R(hx, hy - 1, hx + 5, hy, hair);
      R(hx + 5, hy, hx + 7, hy, hairS);
      R(hx, hy - 1, hx + 4, hy - 1, hairL);
      break;
    case 'tenugui':
      R(hx, hy - 1, hx + 5, hy, hex('#2a2420'));
      R(hx, hy + 1, hx + 5, hy + 1, hair);
      P(hx - 1, hy + 1, hair);
      P(hx - 2, hy + 2, hairS);
      break;
    case 'jingasa': {
      // The ashigaru's lacquered conical hat: a wide flat cone, lit on top-left.
      R(hx - 3, hy, hx + 8, hy, hairS);
      R(hx - 1, hy - 1, hx + 6, hy - 1, hair);
      R(hx + 1, hy - 2, hx + 4, hy - 2, hairL);
      P(hx + 2, hy - 3, hairL);
      P(hx + 3, hy - 1, hex('#d9b24c'));
      break;
    }
    case 'kasa': {
      // A sedge hat: broad, shallow, woven in rings.
      R(hx - 4, hy, hx + 9, hy, hairS);
      R(hx - 2, hy - 1, hx + 7, hy - 1, hair);
      R(hx, hy - 2, hx + 5, hy - 2, hairL);
      R(hx + 2, hy - 3, hx + 3, hy - 3, hairL);
      for (let x = hx - 3; x <= hx + 8; x += 3) P(x, hy, tone(hair, 0.45));
      break;
    }
    case 'eboshi':
      // The Shinto priest's tall black lacquered cap.
      R(hx + 1, hy - 5, hx + 4, hy, hex('#24222a'));
      R(hx + 1, hy - 5, hx + 1, hy, hex('#3a3844'));
      P(hx + 4, hy - 6, hex('#24222a'));
      R(hx, hy + 1, hx + 1, hy + 3, hair);
      break;
    case 'skull':
      break;
  }

  // Arms and what they hold.
  const swing = walk ? (f === 0 ? 1 : f === 2 ? -1 : 0) : 0;
  const armN = tone(body, 0.1);
  const armF = tone(body, 0.45);
  const ay = top;
  const ax = 15 + sx0;
  // Far arm (behind), unless shambling with both arms out.
  if (shamble && !work) {
    R(ax - 1, ay + 3, ax + 3, ay + 3, armF);
    P(ax + 4, ay + 3, skinS);
    R(ax, ay + 2, ax + 4, ay + 2, armN);
    R(ax + 5, ay + 2, ax + 5, ay + 3, skin);
    return;
  }
  R(8 + sx0 - (swing > 0 ? 1 : 0), ay + 1, 8 + sx0 - (swing > 0 ? 1 : 0), ay + 6, armF);
  P(8 + sx0 - (swing > 0 ? 1 : 0), ay + 7, skinS);
  if (work && L.work === 'hammer') {
    if (f === 5) {
      line(ax, ay + 1, ax + 2, ay - 2, armN);
      P(ax + 3, ay - 3, skin);
      R(ax + 3, ay - 8, ax + 3, ay - 4, WOOD);
      R(ax + 1, ay - 10, ax + 5, ay - 9, IRON);
      R(ax + 1, ay - 9, ax + 5, ay - 9, IRON_S);
    } else {
      line(ax, ay + 1, ax + 2, ay + 4, armN);
      P(ax + 3, ay + 5, skin);
      R(ax + 4, ay + 5, ax + 7, ay + 5, WOOD);
      R(ax + 8, ay + 3, ax + 8, ay + 7, IRON);
      R(ax + 9, ay + 3, ax + 9, ay + 7, IRON_S);
    }
    return;
  }
  if (work && L.work === 'scythe') {
    line(ax, ay + 1, ax + 1, ay + 4, armN);
    if (f === 5) {
      line(ax + 2, ay + 6, ax - 10, ay - 6, WOOD);
      R(ax - 14, ay - 6, ax - 10, ay - 6, IRON);
      R(ax - 15, ay - 5, ax - 13, ay - 5, IRON_S);
      P(ax + 1, ay + 5, skin);
    } else {
      line(ax + 1, ay + 4, ax + 6, ay + 15, WOOD);
      P(ax + 2, ay + 5, skin);
      R(ax - 1, 30, ax + 7, 30, IRON);
      R(ax - 2, 29, ax - 1, 29, IRON_S);
    }
    return;
  }
  if (work && L.work === 'dig') {
    line(ax, ay + 1, ax + 2, ay + 4, armN);
    P(ax + 2, ay + 5, skin);
    const lift = f === 5 ? -4 : 2;
    R(ax + 3, ay + lift, ax + 3, ay + lift + 12, WOOD);
    R(ax + 2, ay + lift + 13, ax + 4, ay + lift + 15, IRON);
    P(ax + 4, ay + lift + 15, IRON_S);
    return;
  }
  if (work && L.work === 'saw') {
    const d = f === 5 ? -1 : 1;
    line(ax, ay + 1, ax + 2 + d, ay + 5, armN);
    P(ax + 3 + d, ay + 6, skin);
    for (let k = 0; k < 7; k++) {
      P(ax + 4 + d + k, ay + 7 + (k >> 2), IRON);
      if (k % 2) P(ax + 4 + d + k, ay + 8 + (k >> 2), IRON_S);
    }
    return;
  }
  if (work && L.work === 'tend') {
    // Bent double at the planting: both hands down at the water.
    line(ax, ay + 1, ax + 2, ay + 9, armN);
    P(ax + 2, 28 - (f === 5 ? 2 : 0), skin);
    P(ax + 3, 28 - (f === 5 ? 2 : 0), skin);
    if (f === 6) R(ax + 3, 29, ax + 4, 29, hex('#8fbf4e'));
    return;
  }
  if (work && L.work === 'pray') {
    line(ax, ay + 1, ax, ay + 3, armN);
    R(ax - 1, ay + 3, ax, ay + 4, skin);
    return;
  }
  // Near arm, swinging with the walk.
  const hx2 = ax + (swing < 0 ? 1 : 0);
  R(ax, ay + 1, ax, ay + 3, armN);
  R(hx2, ay + 4, hx2, ay + 6, armN);
  P(hx2, ay + 7, skin);
  switch (L.carry) {
    case 'sack':
      R(4 + sx0, ay - 3, 9 + sx0, ay + 2, hex('#b8a372'));
      R(4 + sx0, ay - 3, 9 + sx0, ay - 3, hex('#d8c79a'));
      R(4 + sx0, ay - 2, 4 + sx0, ay + 2, hex('#cdb98a'));
      R(9 + sx0, ay - 2, 9 + sx0, ay + 2, hex('#8a7a52'));
      break;
    case 'bucket':
      P(hx2 + 1, ay + 8, IRON_S);
      R(hx2, ay + 9, hx2 + 3, ay + 12, WOOD);
      R(hx2, ay + 9, hx2 + 3, ay + 9, hex('#9a7449'));
      R(hx2 + 3, ay + 10, hx2 + 3, ay + 12, WOOD_S);
      R(hx2, ay + 11, hx2 + 3, ay + 11, IRON_S);
      break;
    case 'staff':
      R(hx2 + 1, ay - 9, hx2 + 1, 30, WOOD);
      if (L.eyes) {
        // A necromancer's staff: a skull on top with a green coal in it.
        R(hx2, ay - 12, hx2 + 2, ay - 10, hex('#d8cfb2'));
        P(hx2 + 1, ay - 11, L.eyes);
      } else P(hx2 + 1, ay - 9, hex('#9a7449'));
      break;
    case 'book':
      R(12 + sx0, ay + 3, 15 + sx0, ay + 5, hex('#5a1e1a'));
      R(12 + sx0, ay + 3, 15 + sx0, ay + 3, hex('#7a2e26'));
      R(15 + sx0, ay + 4, 15 + sx0, ay + 5, hex('#d9cfae'));
      break;
    case 'plank':
      for (let x = 1; x <= 22; x++) {
        P(x, ay - 1, x % 7 ? hex('#a77f50') : hex('#6b4a2c'));
        P(x, ay, hex('#7a5434'));
      }
      break;
    case 'basket':
      R(hx2 + 1, ay + 7, hx2 + 4, ay + 10, hex('#9a7a3a'));
      R(hx2 + 1, ay + 7, hx2 + 4, ay + 7, hex('#c9a24a'));
      for (let x = hx2 + 1; x <= hx2 + 4; x += 2) P(x, ay + 9, hex('#6a5228'));
      break;
  }
}

// ------------------------------------------------------------------ the folk

export class FolkHd {
  /** Sheet cells are twice the classic cells (life.ts draws them at half size). */
  readonly density = 2;
  private cache = new Map<string, HTMLCanvasElement>();
  readonly horse: HTMLCanvasElement[];
  readonly dog: HTMLCanvasElement;
  readonly hen: HTMLCanvasElement;
  readonly cart: HTMLCanvasElement;
  readonly crow: HTMLCanvasElement;

  constructor(readonly st: CityStyle) {
    const undead = st.id === 'undead';
    const samurai = st.id === 'samurai';
    const coats: [string, string][] = undead
      ? [['#cfc6aa', '#2a2826'], ['#3a3438', '#141214'], ['#bdb498', '#3a3632'], ['#5a5048', '#1a1614'], ['#d6cfbe', '#3a3a3a']]
      : [['#6e4a2c', '#24170f'], ['#3a2e26', '#120d0a'], ['#8f8577', '#3a352f'], ['#9a6a3a', '#3a2412'], ['#d6cfc2', '#8a8378']];
    this.horse = coats.map(([c, m], i) =>
      doubled(HORSE_W, HORSE_H, HORSE_FRAMES, (px, f) => {
        paintHorse(px, hex(c), hex(m), f, i === 1 && !samurai && !undead ? st : null);
        if (samurai && i === 1) {
          // A war saddle with red tassels (fusa) on the crupper.
          px.set(10, 6, st.accent);
          px.set(5, 8, st.accent);
          px.set(5, 9, st.accent);
        }
      }),
    );
    if (undead) {
      // Bone horses: dark gaps between the ribs, a green coal for an eye.
      this.horse = this.horse.map((sheet, i) => (i === 0 || i === 2 || i === 4 ? ribbed(sheet, st.accent) : sheet));
    }
    this.dog = doubled(DOG_W, DOG_H, 4, (px, f) => paintDog(px, f, undead ? hex('#5a5652') : samurai ? hex('#b07a44') : undefined));
    this.hen = doubled(HEN_W, HEN_H, 2, (px, f) => (undead ? paintHen(px, f, hex('#2a2830'), hex('#16141a')) : paintHen(px, f)));
    this.cart = doubled(CART_W, CART_H, 2, (px, f) =>
      paintCart(px, f, st, undead ? [hex('#cfc8b8'), hex('#a8a090'), hex('#6e685c')] : samurai ? [hex('#e0c890'), hex('#c4a466'), hex('#8a7040')] : undefined),
    );
    this.crow = doubled(CROW_W, CROW_H, 3, (px, f) => paintCrow(px, f));
  }

  figure(look: Look): HTMLCanvasElement {
    const key = JSON.stringify(look);
    let s = this.cache.get(key);
    if (!s) {
      s = sheetHd(FIG_W * 2, FIG_H * 2, FIG_FRAMES, (c, f, back) => paintFigureHd(c, look, this.st.skin, f, back));
      this.cache.set(key, s);
    }
    return s;
  }
}

/** Carve rib gaps into a pale horse sheet and give it a glowing eye. */
function ribbed(sheet: HTMLCanvasElement, eye: Col): HTMLCanvasElement {
  const ctx = sheet.getContext('2d')!;
  const img = ctx.getImageData(0, 0, sheet.width, sheet.height);
  const d = new Uint32Array(img.data.buffer);
  const cw = HORSE_W * 2;
  const ch = HORSE_H * 2;
  for (let y = 0; y < sheet.height; y++)
    for (let x = 0; x < sheet.width; x++) {
      const lx = x % cw;
      const ly = y % ch;
      const i = y * sheet.width + x;
      if (!d[i]) continue;
      const row = Math.floor(y / ch);
      const fx = row === 1 || row === 2 ? cw - 1 - lx : lx;
      // The barrel spans x 10..32, y 12..21 of the doubled cell.
      if (fx > 13 && fx < 29 && ly > 13 && ly < 20 && fx % 3 === 0) d[i] = hex('#2a2622');
      if (fx > 10 && fx < 31 && ly === 21) d[i] = hex('#2a2622');
    }
  ctx.putImageData(img, 0, 0);
  void eye;
  return sheet;
}

// ------------------------------------------------------------------ faction looks

const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(Math.floor(n)) % xs.length]!;
const h1 = (s: number, k: number) => {
  let h = Math.imul(s ^ (k * 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  return ((Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The people of a faction's town, by role. Templar uses people.ts's looks unchanged. */
export interface Looks {
  villager(seed: number, carry?: Look['carry']): Look;
  monk(carry?: Look['carry'], work?: Look['work']): Look;
  chaplain(): Look;
  infirmarer(work?: Look['work'], carry?: Look['carry']): Look;
  farmer(seed: number, work?: Look['work']): Look;
  carpenter(seed: number, work?: Look['work'], carry?: Look['carry']): Look;
  sergeant(carry?: Look['carry']): Look;
  squire(): Look;
}

const KIMONO = ['#3a4a6a', '#5a4a3a', '#6a5a46', '#4a5a4a', '#7a4a3a', '#46465a', '#8a7452', '#3e3a44'];
const HAKAMA = ['#2e2c34', '#4a4038', '#3a3a46'];

export function samuraiLooks(st: CityStyle): Looks {
  return {
    villager: (seed, carry = 'none') => {
      const woman = h1(seed, 2) < 0.4;
      const body = hex(pick(KIMONO, h1(seed, 1) * 8));
      return {
        body,
        legs: woman ? tone(body, 0.3) : hex(pick(HAKAMA, seed)),
        head: woman ? 'hair' : h1(seed, 3) < 0.4 ? 'kasa' : h1(seed, 4) < 0.5 ? 'topknot' : 'tenugui',
        hair: woman ? hex('#1e1a1e') : h1(seed, 3) < 0.4 ? hex('#c4a266') : hex('#1e1a1e'),
        robe: woman,
        sash: woman ? hex(pick(['#b5372b', '#d9b24c', '#6a8a5a'], seed)) : hex('#d8ceb4'),
        work: 'none',
        carry,
      };
    },
    // Sōhei and temple monks: a black robe with a saffron kesa, shaven heads.
    monk: (carry = 'none', work = 'pray') => ({ body: hex('#2c2a30'), legs: hex('#1e1c22'), head: 'shaved', hair: hex('#2c2a30'), robe: true, sash: hex('#c8902c'), work, carry }),
    // The shrine's kannushi: white robe, pale blue hakama, the black eboshi.
    chaplain: () => ({ body: hex('#ece6d6'), legs: hex('#9ab0c4'), head: 'eboshi', hair: hex('#1e1a1e'), robe: false, sash: hex('#ece6d6'), work: 'pray', carry: 'none' }),
    // The physician: dark haori, shaven like a monk (as Edo physicians were).
    infirmarer: (work = 'tend', carry = 'none') => ({ body: hex('#4a4038'), legs: hex('#2a2620'), head: 'shaved', hair: hex('#2a2620'), robe: true, apron: hex('#d8d0bc'), work, carry }),
    // Rice planters in sedge hats, sleeves tied back, bent to the paddy.
    farmer: (seed, work = 'tend') => ({ body: hex(pick(['#4a5a74', '#5a6a4a', '#6a5a46'], seed)), legs: hex('#2e3440'), head: 'kasa', hair: hex('#c9aa6a'), robe: false, sash: hex('#d8ceb4'), work, carry: 'none' }),
    carpenter: (seed, work = 'hammer', carry = 'none') => ({ body: hex(pick(['#3a4a64', '#5a4632', '#46404a'], seed)), legs: hex('#2a2a30'), head: 'tenugui', hair: hex('#d8d0bc'), robe: false, work, carry }),
    // Ashigaru in the clan's lacquered jingasa, with the team colour at the sash.
    sergeant: (carry = 'none') => ({ body: hex('#2c3550'), legs: hex('#1e2232'), head: 'jingasa', hair: hex('#2a2628'), robe: false, sash: st.team, work: 'none', carry }),
    squire: () => ({ body: st.team, legs: hex('#2a2a30'), head: 'topknot', hair: hex('#1e1a1e'), robe: false, sash: hex('#d8ceb4'), work: 'none', carry: 'none' }),
  };
}

const RAGS = ['#4a4640', '#3e3a36', '#56504a', '#3a3a40', '#4e4434'];

export function undeadLooks(st: CityStyle): Looks {
  const green = st.accent;
  const dead = [hex('#9aa08a'), hex('#a8a48e'), hex('#8e9684')];
  return {
    // Shambling labourers: grey-green skin, rags, arms out; some are bare skulls.
    villager: (seed, carry = 'none') => {
      const skull = h1(seed, 3) < 0.3;
      return {
        body: hex(pick(RAGS, h1(seed, 1) * 5)),
        legs: hex('#2e2a28'),
        head: skull ? 'skull' : h1(seed, 4) < 0.5 ? 'hair' : 'hood',
        hair: hex(pick(['#3a3430', '#5a5a52', '#2a2626'], seed)),
        robe: h1(seed, 2) < 0.3,
        skin: pick(dead, seed),
        shamble: carry === 'none',
        rags: true,
        work: 'none',
        carry,
      };
    },
    // Cultists of the Black Chapel: deep cowls, green-lit eyes.
    monk: (carry = 'none', work = 'pray') => ({ body: hex('#24222a'), legs: hex('#16141a'), head: 'cowl', hair: hex('#2e2a34'), robe: true, sash: hex('#3a5a34'), eyes: green, work, carry }),
    // The necromancer: black and violet, a skull-staff.
    chaplain: () => ({ body: hex('#2a2234'), legs: hex('#18141e'), head: 'cowl', hair: hex('#3a2e46'), robe: true, sash: green, eyes: green, work: 'none', carry: 'staff' }),
    // Embalmers of the plague house: grey robes and a stained apron.
    infirmarer: (work = 'tend', carry = 'none') => ({ body: hex('#4a4a4e'), legs: hex('#2a2a2e'), head: 'coif', hair: hex('#8a8478'), robe: true, apron: hex('#8a7a62'), skin: hex('#a8a48e'), work, carry }),
    // Gravediggers: battered hats, spades.
    farmer: (seed, work = 'dig') => ({ body: hex(pick(['#4a4034', '#3a3a34', '#504436'], seed)), legs: hex('#2a2622'), head: 'hat', hair: hex('#2e2a26'), robe: false, skin: pick(dead, seed + 1), work, carry: 'none' }),
    carpenter: (seed, work = 'hammer', carry = 'none') => ({ body: hex(pick(['#4a4038', '#3e3a34'], seed)), legs: hex('#2a2622'), head: 'skull', hair: hex('#2a2626'), robe: false, apron: hex('#5a4a3a'), work, carry }),
    sergeant: (carry = 'none') => ({ body: hex('#3a3c38'), legs: hex('#24241f'), head: 'skull', hair: hex('#2a2626'), robe: false, sash: st.team, eyes: green, work: 'none', carry }),
    squire: () => ({ body: hex('#3a3436'), legs: hex('#24201f'), head: 'hood', hair: hex('#2a2628'), robe: false, skin: dead[0]!, shamble: false, work: 'none', carry: 'none' }),
  };
}
