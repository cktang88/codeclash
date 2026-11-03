// The commandery's folk and beasts, painted pixel by pixel into small sheets: villagers, brothers,
// farmers and carpenters about 15 pixels tall with a four-frame walk, horses, dogs, hens, carts
// and crows. Soldiers come from the battle sprite atlas instead (see atlas.ts).

import { hash, hex, mix, Px, tone, type Col } from './pixels.ts';
import type { CityStyle } from './style.ts';

export const FIG_W = 12;
export const FIG_H = 17;
export const FIG_FX = 6;
export const FIG_FY = 15;
/** Frames: 0-3 walk, 4 idle, 5-6 work (raise, strike). */
export const FIG_FRAMES = 7;

/** The classic painter knows the first seven; 'sweep' is HD only (folk-people.ts). */
export type Work = 'none' | 'hammer' | 'scythe' | 'dig' | 'tend' | 'saw' | 'pray' | 'sweep';
/** The classic painter knows the first seven; the rest are HD only (folk-people.ts). */
export type Carry = 'none' | 'sack' | 'bucket' | 'staff' | 'book' | 'plank' | 'basket' | 'parasol' | 'broom' | 'spade' | 'yoke' | 'lantern' | 'bundle' | 'tongs' | 'candle';

export interface Look {
  body: Col;
  legs: Col;
  /** The classic painter knows the first six; the HD painter (people-hd.ts) knows them all. */
  head:
    | 'hair' | 'hood' | 'coif' | 'hat' | 'cap' | 'veil' | 'jingasa' | 'kasa' | 'shaved' | 'topknot' | 'eboshi' | 'skull' | 'cowl' | 'tenugui'
    | 'straw' | 'wimple' | 'kerchief' | 'bun' | 'chaperon';
  hair: Col;
  robe: boolean;
  apron?: Col;
  cross?: Col;
  work: Work;
  carry: Carry;
  /** HD only: own skin (the dead), a sash or kesa, a hunched shambling gait, glowing eyes, rags. */
  skin?: Col;
  sash?: Col;
  shamble?: boolean;
  eyes?: Col;
  rags?: boolean;
  /** HD (folk-people.ts) only: the body, hair under a hat, a beard, trim, a cloth pattern, the legs' dress, wide sleeves. */
  kind?: 'man' | 'woman' | 'child' | 'old' | 'skeleton' | 'zombie';
  locks?: Col;
  beard?: Col;
  trim?: Col;
  pattern?: 'kasuri' | 'stripe' | 'check';
  lower?: 'hose' | 'hakama' | 'bare' | 'gaiters';
  sleeves?: 'wide' | 'rolled';
  /** A hood or kesa draped over the shoulders, in this colour. */
  cape?: Col;
  /** A sash worn crossways (the monk's kesa). */
  kesa?: Col;
}

const OUT = hex('#140f0b');

function paintFigure(c: Px, L: Look, skin: Col, f: number, back: boolean): void {
  const walk = f <= 3;
  const bob = walk && (f === 1 || f === 3) ? -1 : 0;
  const stride = walk ? (f === 0 ? 1 : f === 2 ? -1 : 0) : 0;
  const body = L.body;
  const bodyS = tone(body, 0.3);
  const bodyL = tone(body, -0.15);
  const legs = L.legs;
  const legsS = tone(legs, 0.35);
  const y = (n: number) => n + bob;
  const tend = L.work === 'tend' && (f === 5 || f === 6);
  const bend = tend ? 2 : 0;

  // Legs.
  if (!L.robe) {
    const nearX = 6 + Math.max(0, stride);
    const farX = 5 - Math.max(0, -stride) + (stride > 0 ? -1 : 0);
    for (let r = 12; r <= 14; r++) {
      c.set(farX + (r === 14 && stride !== 0 ? -Math.sign(stride) * 0 : 0), r, legsS);
      c.set(nearX, r, legs);
    }
    c.set(farX - 1, 15, tone(legs, 0.6));
    c.set(farX, 15, tone(legs, 0.6));
    c.set(nearX, 15, tone(legs, 0.6));
    c.set(nearX + 1, 15, tone(legs, 0.6));
  }
  // Torso (and robe to the ground).
  const top = y(7) + bend;
  const bottom = L.robe ? 14 : y(11);
  for (let r = top; r <= bottom; r++) {
    const flare = L.robe && r >= 12 ? 1 : 0;
    for (let x = 4 - flare; x <= 7 + flare; x++) c.set(x, r, x <= 4 ? bodyL : x >= 7 ? bodyS : body);
  }
  if (L.robe) {
    // The hem swings with the step.
    if (stride > 0) c.set(8, 14, bodyS);
    if (stride < 0) c.set(2, 14, bodyL);
    c.set(4, 15, tone(legs, 0.6));
    c.set(6, 15, tone(legs, 0.6));
  }
  if (L.apron) for (let r = top + 2; r <= Math.min(bottom, top + 6); r++) for (let x = back ? 9 : 5; x <= (back ? 0 : 6); x++) c.set(x, r, L.apron);
  if (L.cross && !back) {
    c.set(5, top + 2, L.cross);
    c.set(5, top + 1, L.cross);
    c.set(5, top + 3, L.cross);
    c.set(4, top + 2, L.cross);
    c.set(6, top + 2, L.cross);
  } else if (L.cross && back) {
    c.set(5, top + 2, L.cross);
    c.set(6, top + 2, L.cross);
    c.set(5, top + 1, L.cross);
    c.set(5, top + 3, L.cross);
  }
  if (!L.robe) for (let x = 4; x <= 7; x++) c.set(x, y(10) + bend, tone(L.legs, 0.5));

  // Head.
  const hy = y(3) + bend;
  const hx = tend ? 6 : 5;
  for (let r = hy; r <= hy + 3; r++) for (let x = hx; x <= hx + 2; x++) c.set(x, r, skin);
  const hair = L.hair;
  switch (L.head) {
    case 'hair':
      for (let x = hx; x <= hx + 2; x++) c.set(x, hy, hair);
      c.set(hx, hy + 1, hair);
      if (back) for (let r = hy; r <= hy + 2; r++) for (let x = hx; x <= hx + 2; x++) c.set(x, r, hair);
      break;
    case 'hood':
    case 'veil':
      for (let x = hx - 1; x <= hx + 3; x++) c.set(x, hy - 1 + (x === hx - 1 || x === hx + 3 ? 1 : 0), hair);
      for (let r = hy; r <= hy + 3; r++) {
        c.set(hx - 1, r, hair);
        c.set(hx, r, hair);
        if (back) {
          c.set(hx + 1, r, hair);
          c.set(hx + 2, r, hair);
          c.set(hx + 3, r, tone(hair, 0.2));
        }
      }
      for (let x = hx; x <= hx + 2; x++) c.set(x, hy, hair);
      break;
    case 'coif':
      for (let x = hx; x <= hx + 2; x++) c.set(x, hy, hair);
      c.set(hx, hy + 1, hair);
      c.set(hx, hy + 2, hair);
      if (back) for (let r = hy; r <= hy + 3; r++) for (let x = hx; x <= hx + 2; x++) c.set(x, r, hair);
      break;
    case 'hat':
      for (let x = hx - 1; x <= hx + 3; x++) c.set(x, hy, hair);
      for (let x = hx; x <= hx + 2; x++) c.set(x, hy - 1, tone(hair, -0.1));
      if (back) for (let r = hy + 1; r <= hy + 2; r++) for (let x = hx; x <= hx + 2; x++) c.set(x, r, hex('#4a3420'));
      break;
    case 'cap':
      for (let x = hx; x <= hx + 2; x++) c.set(x, hy, hair);
      c.set(hx + 3, hy, hair);
      if (back) c.set(hx + 1, hy + 1, hex('#3a2a1c'));
      break;
  }
  if (!back) c.set(hx + 2, hy + 1 + (L.head === 'hat' ? 1 : 0), OUT);

  // Arms and what they hold.
  const swing = walk ? (f === 0 ? 1 : f === 2 ? -1 : 0) : 0;
  const armN = tone(body, 0.12);
  const armF = tone(body, 0.45);
  const ay = top;
  const wood = hex('#6b4a2c');
  const iron = hex('#8d939a');
  const work = f === 5 || f === 6;
  // Far arm.
  c.set(3, ay + 1, armF);
  c.set(3 - (swing > 0 ? 1 : 0), ay + 2, armF);
  c.set(3 - (swing > 0 ? 1 : 0), ay + 3, skin);
  if (work && L.work === 'hammer') {
    if (f === 5) {
      c.set(8, ay, armN);
      c.set(9, ay - 1, skin);
      c.set(9, ay - 2, wood);
      c.set(9, ay - 3, wood);
      c.set(8, ay - 4, iron);
      c.set(9, ay - 4, iron);
      c.set(10, ay - 4, iron);
    } else {
      c.set(8, ay + 1, armN);
      c.set(9, ay + 2, skin);
      c.set(10, ay + 2, wood);
      c.set(11, ay + 2, wood);
      c.set(11, ay + 1, iron);
      c.set(11, ay + 3, iron);
    }
    return;
  }
  if (work && L.work === 'scythe') {
    c.set(8, ay + 1, armN);
    if (f === 5) {
      // Swung back over the shoulder.
      for (let k = 0; k < 6; k++) c.set(8 - k, ay + 3 - k, wood);
      c.set(2, ay - 3, iron);
      c.set(1, ay - 3, iron);
      c.set(0, ay - 2, iron);
      c.set(8, ay + 2, skin);
    } else {
      for (let k = 0; k < 5; k++) c.set(8 + Math.floor(k / 2), ay + 2 + k, wood);
      c.set(9, ay + 2, skin);
      c.set(11, 14, iron);
      c.set(10, 15, iron);
      c.set(9, 15, iron);
      c.set(8, 15, iron);
    }
    return;
  }
  if (work && L.work === 'dig') {
    c.set(8, ay + 1, armN);
    c.set(8, ay + 2, skin);
    const lift = f === 5 ? -2 : 1;
    for (let k = 0; k < 6; k++) c.set(9, ay + lift + k, wood);
    c.set(9, ay + lift + 6, iron);
    c.set(10, ay + lift + 6, iron);
    return;
  }
  if (work && L.work === 'saw') {
    const d = f === 5 ? -1 : 1;
    c.set(8, ay + 2, armN);
    c.set(9 + d, ay + 3, skin);
    for (let k = 0; k < 4; k++) c.set(9 + d + k, ay + 4 + (k >> 1), iron);
    return;
  }
  if (work && L.work === 'tend') {
    c.set(8, ay + 2, armN);
    c.set(9, ay + 4, skin);
    c.set(9, 13 - (f === 5 ? 1 : 0), skin);
    return;
  }
  if (work && L.work === 'pray') {
    c.set(8, ay + 2, armN);
    c.set(8, ay + 1, skin);
    c.set(7, ay + 1, skin);
    return;
  }
  // Near arm, swinging with the walk, and the carried thing.
  c.set(8, ay + 1, armN);
  c.set(8 + (swing < 0 ? 1 : 0), ay + 2, armN);
  c.set(8 + (swing < 0 ? 1 : 0), ay + 3, skin);
  switch (L.carry) {
    case 'sack':
      for (let r = ay - 2; r <= ay + 1; r++) for (let x = 2; x <= 4; x++) c.set(x, r, r === ay - 2 ? hex('#cdb98a') : hex('#b39e70'));
      break;
    case 'bucket':
      c.set(9, ay + 4, iron);
      c.set(9, ay + 5, wood);
      c.set(10, ay + 5, wood);
      c.set(9, ay + 6, tone(wood, 0.3));
      c.set(10, ay + 6, tone(wood, 0.3));
      break;
    case 'staff':
      for (let r = ay - 4; r <= 15; r++) c.set(9, r, wood);
      break;
    case 'book':
      c.set(6, ay + 2, hex('#5a1e1a'));
      c.set(7, ay + 2, hex('#5a1e1a'));
      c.set(7, ay + 3, hex('#d9cfae'));
      break;
    case 'plank':
      for (let x = 1; x <= 11; x++) c.set(x, ay - 1, x % 4 ? hex('#9a7449') : hex('#6b4a2c'));
      break;
    case 'basket':
      c.set(9, ay + 3, wood);
      c.set(10, ay + 3, wood);
      c.set(9, ay + 4, hex('#8b6b2a'));
      c.set(10, ay + 4, hex('#c9a24a'));
      break;
  }
}

/** Paint a sprite facing right on a cell, then fill four facings into a sheet row by row. */
function sheet(w: number, h: number, frames: number, paint: (c: Px, f: number, back: boolean) => void): HTMLCanvasElement {
  const out = new Px(w * frames, h * 4);
  for (let f = 0; f < frames; f++)
    for (let back = 0; back < 2; back++) {
      const c = new Px(w, h);
      paint(c, f, back === 1);
      c.outline(OUT);
      // Rows: 0 front-right, 1 front-left, 2 back-left, 3 back-right (contract.ts Dir order).
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

export class Folk {
  private cache = new Map<string, HTMLCanvasElement>();
  readonly horse: HTMLCanvasElement[];
  readonly dog: HTMLCanvasElement;
  readonly hen: HTMLCanvasElement;
  readonly cart: HTMLCanvasElement;
  readonly crow: HTMLCanvasElement;

  constructor(readonly st: CityStyle) {
    const coats: [string, string][] = [['#6e4a2c', '#24170f'], ['#3a2e26', '#120d0a'], ['#8f8577', '#3a352f'], ['#9a6a3a', '#3a2412'], ['#d6cfc2', '#8a8378']];
    this.horse = coats.map(([c, m], i) => sheet(HORSE_W, HORSE_H, HORSE_FRAMES, (px, f) => paintHorse(px, hex(c), hex(m), f, i === 1 ? st : null)));
    this.dog = sheet(DOG_W, DOG_H, 4, (px, f) => paintDog(px, f));
    this.hen = sheet(HEN_W, HEN_H, 2, (px, f) => paintHen(px, f));
    this.cart = sheet(CART_W, CART_H, 2, (px, f) => paintCart(px, f, st));
    this.crow = sheet(CROW_W, CROW_H, 3, (px, f) => paintCrow(px, f));
  }

  figure(look: Look): HTMLCanvasElement {
    const key = JSON.stringify(look);
    let s = this.cache.get(key);
    if (!s) {
      s = sheet(FIG_W, FIG_H, FIG_FRAMES, (c, f, back) => paintFigure(c, look, this.st.skin, f, back));
      this.cache.set(key, s);
    }
    return s;
  }
}

// ------------------------------------------------------------------ looks

const TUNICS = ['#6b5a3e', '#5a4a36', '#7a6646', '#4f5a3a', '#6a4436', '#55524a', '#7b5e3a', '#4a4f5a'];
const HAIR = ['#3a2616', '#5a3a1e', '#2a1d14', '#7a5a34', '#4a4040', '#8a6a3a'];

export function villagerLook(seed: number, carry: Carry = 'none'): Look {
  const t = hex(TUNICS[Math.floor(hash(seed, 1) * TUNICS.length)]!);
  const woman = hash(seed, 2) < 0.4;
  return {
    body: t,
    legs: hex(woman ? '#3a2e24' : ['#4a3a2a', '#3a3a3a', '#5a4630'][seed % 3]!),
    head: woman ? 'veil' : hash(seed, 3) < 0.5 ? 'hair' : hash(seed, 4) < 0.5 ? 'coif' : 'cap',
    hair: woman ? hex('#e3dccb') : hex(HAIR[Math.floor(hash(seed, 5) * HAIR.length)]!),
    robe: woman,
    work: 'none',
    carry,
  };
}

export function monkLook(st: CityStyle, carry: Carry = 'none', work: Work = 'pray'): Look {
  return { body: st.habit, legs: st.habitShade, head: 'hood', hair: tone(st.habit, -0.1), robe: true, work, carry };
}

export function chaplainLook(st: CityStyle): Look {
  return { body: st.mantle, legs: tone(st.mantle, 0.3), head: 'hair', hair: hex('#9a948a'), robe: true, cross: st.bannerCharge, work: 'pray', carry: 'book' };
}

export function infirmarerLook(st: CityStyle, work: Work = 'tend', carry: Carry = 'none'): Look {
  return { body: mix(st.habit, hex('#6a6a66'), 0.5), legs: st.habitShade, head: 'coif', hair: hex('#e8e2d2'), robe: true, apron: hex('#e8e2d2'), work, carry };
}

export function farmerLook(seed: number, work: Work = 'scythe'): Look {
  return { body: hex(['#7a6646', '#5f6a3c', '#8a7552'][seed % 3]!), legs: hex('#4a3a2a'), head: 'hat', hair: hex('#c9a95a'), robe: false, work, carry: 'none' };
}

export function carpenterLook(seed: number, work: Work = 'hammer', carry: Carry = 'none'): Look {
  return { body: hex(['#6b5a3e', '#5a4a36', '#6a4436'][seed % 3]!), legs: hex('#3e3024'), head: 'cap', hair: hex('#5a4630'), robe: false, apron: hex('#6e5236'), work, carry };
}

export function sergeantLook(st: CityStyle, carry: Carry = 'none'): Look {
  // Serving brothers of the Temple wore black or brown with the red cross.
  return { body: st.habit, legs: hex('#2a2420'), head: 'coif', hair: hex('#7d8288'), robe: false, cross: st.bannerCharge, work: 'none', carry };
}

export function squireLook(st: CityStyle): Look {
  return { body: st.team, legs: hex('#3a2e24'), head: 'hair', hair: hex('#6a4a2a'), robe: false, work: 'none', carry: 'none' };
}

// ------------------------------------------------------------------ beasts

export const HORSE_W = 22;
export const HORSE_H = 16;
export const HORSE_FX = 11;
export const HORSE_FY = 15;
/** 0-3 walk, 4 idle, 5 graze, 6 toss. */
export const HORSE_FRAMES = 7;

export function paintHorse(c: Px, coat: Col, mane: Col, f: number, caparison: CityStyle | null): void {
  const shade = tone(coat, 0.3);
  const light = tone(coat, -0.15);
  const hoof = hex('#1a1410');
  const walk = f <= 3;
  // Legs: hind at 6, 8; fore at 14, 16.
  const legs: [number, number][] = [[6, 0], [8, 0], [14, 0], [16, 0]];
  if (walk) {
    const s = f === 0 ? 1 : f === 2 ? -1 : 0;
    legs[0]![1] = s;
    legs[1]![1] = -s;
    legs[2]![1] = -s;
    legs[3]![1] = s;
  }
  for (const [i, [lx, sw]] of legs.entries()) {
    const col = i % 2 === 0 ? shade : coat;
    c.set(lx, 10, col);
    c.set(lx, 11, col);
    c.set(lx + sw, 12, col);
    c.set(lx + sw, 13, col);
    c.set(lx + sw, 14, tone(col, 0.2));
    c.set(lx + sw, 15, hoof);
  }
  // Barrel.
  for (let y = 6; y <= 10; y++)
    for (let x = 5; x <= 16; x++) {
      if ((y === 6 || y === 10) && (x === 5 || x === 16)) continue;
      c.set(x, y, y === 6 ? light : y >= 9 ? shade : coat);
    }
  // Neck and head.
  const graze = f === 5;
  const toss = f === 6;
  if (graze) {
    for (let k = 0; k < 4; k++) {
      c.set(16 + (k >> 1), 7 + k, coat);
      c.set(17 + (k >> 1), 7 + k, coat);
    }
    c.set(18, 11, coat);
    c.set(19, 12, coat);
    c.set(19, 13, shade);
    c.set(20, 13, tone(coat, 0.5));
    c.set(17, 6, mane);
  } else {
    const dy = toss ? -1 : 0;
    for (let k = 0; k < 4; k++) {
      c.set(16 + (k >> 1), 6 - k + dy, coat);
      c.set(17 + (k >> 1), 6 - k + dy, k === 3 ? coat : light);
    }
    // Head.
    c.set(18, 2 + dy, coat);
    c.set(19, 2 + dy, coat);
    c.set(19, 3 + dy, coat);
    c.set(20, 3 + dy, coat);
    c.set(20, 4 + dy + (toss ? -1 : 0), tone(coat, 0.5));
    c.set(21, 4 + dy + (toss ? -1 : 0), tone(coat, 0.5));
    c.set(18, 1 + dy, coat);
    c.set(19, 2 + dy, OUT);
    // Mane.
    for (let k = 0; k < 4; k++) c.set(16 + (k >> 1) - 1, 6 - k + dy, mane);
    c.set(17, 1 + dy, mane);
  }
  // Tail.
  const sw = f === 1 || f === 3 || f === 6 ? 1 : 0;
  c.set(4, 6, mane);
  c.set(3, 7, mane);
  c.set(3 - sw, 8, mane);
  c.set(3 - sw, 9, mane);
  c.set(4 - sw, 10, mane);
  if (caparison) {
    // A knight's destrier: white cloth with the cross, team-coloured hem.
    for (let y = 5; y <= 11; y++)
      for (let x = 6; x <= 15; x++) {
        if (y === 5 && (x < 9 || x > 12)) continue;
        c.set(x, y, y === 11 ? caparison.team : x === 6 || y >= 10 ? tone(caparison.mantle, 0.2) : caparison.mantle);
      }
    c.set(11, 7, caparison.bannerCharge);
    c.set(11, 8, caparison.bannerCharge);
    c.set(11, 9, caparison.bannerCharge);
    c.set(10, 8, caparison.bannerCharge);
    c.set(12, 8, caparison.bannerCharge);
  } else {
    // Saddle blanket.
    c.set(10, 6, hex('#5a3b24'));
    c.set(11, 6, hex('#5a3b24'));
    c.set(12, 6, hex('#5a3b24'));
  }
}

export const DOG_W = 11;
export const DOG_H = 9;
export const DOG_FX = 5;
export const DOG_FY = 8;
/** 0-1 trot, 2 sit, 3 sniff. */
export function paintDog(c: Px, f: number, coatIn?: Col): void {
  const coat = coatIn ?? hex('#6a5038');
  const shade = tone(coat, 0.35);
  if (f === 2) {
    for (let y = 4; y <= 7; y++) for (let x = 4; x <= 6; x++) c.set(x, y, y > 5 ? shade : coat);
    c.set(6, 3, coat);
    c.set(7, 3, coat);
    c.set(7, 2, coat);
    c.set(8, 3, shade);
    c.set(6, 2, shade);
    c.set(3, 7, coat);
    c.set(4, 8, shade);
    c.set(6, 8, shade);
    return;
  }
  const head = f === 3 ? 1 : 0;
  for (let x = 2; x <= 7; x++) {
    c.set(x, 4, coat);
    c.set(x, 5, x < 4 ? shade : coat);
  }
  c.set(8, 3 + head * 2, coat);
  c.set(9, 4 + head * 2, shade);
  c.set(8, 4 + head * 2, coat);
  c.set(7, 3 + head * 2, shade);
  c.set(1, 3, coat);
  c.set(1, 2, coat);
  const s = f === 1 ? 1 : 0;
  for (const [x, o] of [[2, s], [4, -s], [6, s], [7, -s]] as const) {
    c.set(x, 6, shade);
    c.set(x + o, 7, shade);
    c.set(x + o, 8, OUT);
  }
}

export const HEN_W = 7;
export const HEN_H = 7;
export function paintHen(c: Px, f: number, white?: Col, brown?: Col): void {
  const w = white ?? hex('#d8cfba');
  const b = brown ?? hex('#a08a6a');
  c.set(2, 3, w);
  c.set(3, 3, w);
  c.set(4, 3, w);
  c.set(2, 4, b);
  c.set(3, 4, w);
  c.set(4, 4, w);
  c.set(1, 2, b);
  if (f === 0) {
    c.set(5, 2, w);
    c.set(5, 1, hex('#b02020'));
    c.set(6, 2, hex('#d9a441'));
  } else {
    c.set(5, 4, w);
    c.set(6, 5, hex('#d9a441'));
    c.set(5, 3, hex('#b02020'));
  }
  c.set(3, 5, hex('#d9a441'));
  c.set(3, 6, hex('#d9a441'));
}

export const CART_W = 22;
export const CART_H = 14;
export const CART_FX = 9;
export const CART_FY = 13;
export function paintCart(c: Px, f: number, st: CityStyle, load?: [Col, Col, Col]): void {
  const wood = st.timber[1];
  const dark = st.timber[3];
  // Sacks of grain heaped in the bed: rounded lumps lit from the upper left.
  const sackL = load?.[0] ?? hex('#d8c79a');
  const sack = load?.[1] ?? hex('#b8a372');
  const sackD = load?.[2] ?? hex('#8a7a52');
  const lumps: [number, number][] = [[4, 6], [8, 6], [12, 6], [6, 3], [10, 3]];
  for (const [x0, y0] of lumps)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if ((x === 0 || x === 3) && (y === 0 || y === 3)) continue;
        c.set(x0 + x, y0 + y, x + y <= 1 ? sackL : x + y >= 5 ? sackD : sack);
      }
  // Side boards of the bed.
  for (let x = 2; x <= 16; x++) {
    c.set(x, 8, st.timber[0]);
    c.set(x, 9, x % 5 === 2 ? dark : wood);
    c.set(x, 10, st.timber[2]);
  }
  // Shafts forward.
  for (let x = 17; x <= 21; x++) c.set(x, 9 - (x > 19 ? 1 : 0), wood);
  // The wheel, spokes turning.
  const cx = 9;
  const cy = 10;
  for (let a = 0; a < 20; a++) {
    const t = (a / 20) * Math.PI * 2;
    c.set(Math.round(cx + Math.cos(t) * 3.3), Math.round(cy + Math.sin(t) * 3.3), dark);
  }
  const o = f ? Math.PI / 4 : 0;
  for (let k = 0; k < 2; k++) {
    const t = o + (k * Math.PI) / 2;
    for (let r = -2; r <= 2; r++) c.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), st.timber[0]);
  }
  c.set(cx, cy, dark);
}

export const CROW_W = 7;
export const CROW_H = 5;
/** 0-1 flap, 2 perched. */
export function paintCrow(c: Px, f: number): void {
  const k = hex('#15131a');
  const g = hex('#2c2a33');
  if (f === 2) {
    c.set(3, 2, k);
    c.set(4, 2, k);
    c.set(3, 3, g);
    c.set(5, 1, k);
    c.set(6, 1, hex('#3a3a3a'));
    return;
  }
  c.set(3, 2, k);
  c.set(4, 2, k);
  c.set(5, 2, k);
  c.set(6, 2, hex('#3a3a3a'));
  if (f === 0) {
    c.set(2, 1, g);
    c.set(1, 0, g);
    c.set(4, 1, g);
    c.set(4, 0, g);
  } else {
    c.set(2, 3, g);
    c.set(1, 4, g);
    c.set(4, 3, g);
  }
}
