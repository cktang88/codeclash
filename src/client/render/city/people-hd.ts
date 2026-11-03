// HD townsfolk and beasts: who lives in each faction's town (the looks, by role) and the cache
// that paints them. Figures are painted by folk-people.ts and folk-beasts.ts with the paper
// painter's primitives, one frame at a time when it is first needed, into one atlas per town
// (folk-paint.ts) with a night twin, and drawn from there with a contact shadow. Classic mode
// keeps people.ts and never comes here.

import { Paper } from '../paper/core.ts';
import type { Dir } from '../contract.ts';
import { rigFor } from './buildings.ts';
import { CART_CANVAS, CROW_CANVAS, DOG_CANVAS, HEN_CANVAS, HORSE_CANVAS, HORSE_CLIP_FRAMES, paintCart, paintCrow, paintDog, paintHen, paintHorse, type BeastLook, type HorseClip } from './folk-beasts.ts';
import { finish, folkRig, FolkAtlas, Mats, type Cell } from './folk-paint.ts';
import { CLIP_FRAMES, CLIP_RATE, paintPerson, PERSON_CANVAS, type FolkClip } from './folk-people.ts';
import { hash, hex, mix, tone, type Col } from './pixels.ts';
import type { CityStyle } from './style.ts';
import type { Look } from './people.ts';

/** Milliseconds of painting allowed per drawn frame before a missing frame borrows a painted one. */
const PAINT_BUDGET = 8;

export class FolkHd {
  /** Sheet pixels per world pixel (Draw reads it to tell HD folk from classic). */
  readonly density = 2;
  readonly atlas: FolkAtlas;
  private c = new Paper();
  private rig;
  private keys = new WeakMap<Look, string>();
  private spent = 0;
  private lastT = -1;
  readonly beasts: BeastLook[];
  readonly cartBeast: BeastLook;

  constructor(readonly st: CityStyle) {
    this.atlas = new FolkAtlas(rigFor(st.id));
    this.rig = folkRig(st.id);
    this.beasts = horsesFor(st);
    this.cartBeast = st.id === 'samurai' ? { kind: 'ox', coat: hex('#4a3a30'), mane: hex('#1e1814') } : this.beasts[3 % this.beasts.length]!;
  }

  /** Start of a drawn frame (by its clock): the painting budget refills. */
  private tick(t: number): void {
    if (t !== this.lastT) {
      this.lastT = t;
      this.spent = 0;
    }
  }

  /** A painted cell, painting it now if the budget allows (or if nothing can stand in). */
  private cell(key0: string, size: { w: number; h: number; footY: number }, paint: (c: Paper, M: Mats) => void, fallback0?: string, mirror = false): Cell | null {
    // A west-facing frame is painted as its own frame, drawn with the light reversed and then
    // flipped (paper/facing.ts), so it is lit from the top-left like the east-facing one.
    const key = mirror ? key0 + '|m' : key0;
    const fallback = fallback0 && mirror ? fallback0 + '|m' : fallback0;
    const got = this.atlas.get(key);
    if (got) return got;
    if (this.spent > PAINT_BUDGET) {
      // Over budget: a painted frame of the same clip stands in; with none yet, the figure waits
      // a frame or two (only while a town is first shown).
      const fb = fallback ? this.atlas.get(fallback) : undefined;
      if (fb || fallback) return fb ?? null;
    }
    const t0 = performance.now();
    const c = this.c;
    c.begin(1, size);
    c.lightX = mirror ? -1 : 1;
    const M = new Mats(this.rig);
    paint(c, M);
    if (mirror) c.mirror();
    c.lightX = 1;
    c.contact();
    c.clusters(2);
    const s = finish(c, M);
    const dt = performance.now() - t0;
    this.spent += dt;
    this.atlas.paintMs += dt;
    this.atlas.painted++;
    if (!s) return null;
    return this.atlas.add(key, s);
  }

  private lookKey(look: Look): string {
    let k = this.keys.get(look);
    if (!k) {
      k = JSON.stringify(look);
      this.keys.set(look, k);
    }
    return k;
  }

  /** A contact shadow under the feet, in art pixels, lying a little toward the sun's cast. */
  private contact(g: CanvasRenderingContext2D, X: number, Y: number, w: number, night: number): void {
    const q = 0.5;
    g.fillStyle = night > 0.5 ? 'rgba(10,10,28,0.32)' : 'rgba(26,20,40,0.30)';
    const half = Math.round(w / 2);
    g.fillRect(X - (half - 1) * q, Y - q, (2 * half - 1) * q, q);
    g.fillRect(X - half * q + q, Y, (2 * half + 1) * q, q);
    g.fillRect(X - (half - 2) * q + q, Y + q, (2 * half - 3) * q, q);
  }

  /**
   * A townsperson. `frame` is the classic frame (0-3 walk, 4 idle, 5-6 work); the HD clip runs
   * from `phase` (the walk, in steps of two) or the clock `t`, offset per figure by `seed`.
   */
  person(g: CanvasRenderingContext2D, look: Look, frame: number, dir: Dir, X: number, Y: number, t: number, night: number, seed: number, phase?: number): void {
    this.tick(t);
    let clip: FolkClip;
    let f: number;
    if (frame <= 3) {
      clip = 'walk';
      f = phase !== undefined ? Math.floor((((phase % 1) + 1) % 1) * 8) % 8 : frame * 2;
    } else if (frame === 4 || look.work === 'none') {
      clip = 'idle';
      f = Math.floor(t * CLIP_RATE.idle * 4 + seed * 4) % 4;
    } else {
      clip = look.work as FolkClip;
      f = Math.floor((t * CLIP_RATE[clip] + seed) * CLIP_FRAMES[clip]) % CLIP_FRAMES[clip];
    }
    const back = dir === 2 || dir === 3;
    const lk = this.lookKey(look);
    const key = `p|${lk}|${clip}|${f}|${back ? 1 : 0}`;
    const cell = this.cell(key, PERSON_CANVAS, (c, M) => paintPerson({ c, M, skin: this.st.skin, faction: this.st.id }, look, clip, f, back), `p|${lk}|${clip}|0|${back ? 1 : 0}`, dir === 1 || dir === 2);
    this.contact(g, X, Y, look.kind === 'child' ? 7 : 9, night);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /**
   * A horse (or the cart's beast): classic frames 0-3 walk, 4 idle, 5 graze, 6 toss; the walk
   * from `phase`, the rest from the clock.
   */
  horse(g: CanvasRenderingContext2D, coat: number, frame: number, dir: Dir, X: number, Y: number, t: number, night: number, seed: number, phase?: number, cart = false): void {
    this.tick(t);
    const H = cart ? this.cartBeast : this.beasts[coat % this.beasts.length]!;
    let clip: HorseClip;
    let f: number;
    if (frame <= 3) {
      clip = 'walk';
      f = phase !== undefined ? Math.floor((((phase % 1) + 1) % 1) * 8) % 8 : frame * 2;
    } else {
      clip = frame === 5 ? 'graze' : frame === 6 ? 'toss' : 'idle';
      const n = HORSE_CLIP_FRAMES[clip];
      f = Math.floor((t * (clip === 'graze' ? 1.2 : 0.8) + seed) * n) % n;
    }
    const key = `h|${cart ? 'cart' : coat % this.beasts.length}|${clip}|${f}`;
    const cell = this.cell(key, HORSE_CANVAS, (c, M) => paintHorse(c, M, H, clip, f), `h|${cart ? 'cart' : coat % this.beasts.length}|${clip}|0`, dir === 1 || dir === 2);
    this.contact(g, X, Y, 22, night);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /** A dog: classic frames 0-1 trot, 2 sitting, 3 standing. */
  dog(g: CanvasRenderingContext2D, frame: number, dir: Dir, X: number, Y: number, t: number, night: number, seed: number, phase?: number): void {
    this.tick(t);
    const clip = frame <= 1 ? 'walk' : frame === 2 ? 'sit' : 'stand';
    const f = clip === 'walk' ? (phase !== undefined ? Math.floor((((phase % 1) + 1) % 1) * 8) % 8 : frame * 4) : clip === 'stand' ? Math.floor(t * 6 + seed * 4) % 4 : 0;
    const coat = this.st.id === 'undead' ? hex('#5a5652') : this.st.id === 'samurai' ? hex('#b07a44') : hex('#7a5838');
    const cell = this.cell(`d|${clip}|${f}`, DOG_CANVAS, (c, M) => paintDog(c, M, coat, clip, f), `d|${clip}|0`, dir === 1 || dir === 2);
    this.contact(g, X, Y, 9, night);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /** A hen: 0 standing, 1 pecking. */
  hen(g: CanvasRenderingContext2D, frame: number, dir: Dir, X: number, Y: number, night: number): void {
    const undead = this.st.id === 'undead';
    const cell = this.cell(`e|${frame}`, HEN_CANVAS, (c, M) => (undead ? paintHen(c, M, hex('#2a2830'), hex('#16141a'), frame) : paintHen(c, M, hex('#d8cfba'), hex('#a0703a'), frame)), undefined, dir === 1 || dir === 2);
    this.contact(g, X, Y, 5, night);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /** The cart: frame 0-3 turns the wheel. */
  cart(g: CanvasRenderingContext2D, frame: number, dir: Dir, X: number, Y: number, night: number): void {
    const id = this.st.id;
    const f = frame % 4;
    const wood = id === 'undead' ? hex('#4a4440') : id === 'samurai' ? hex('#8a6a46') : hex('#7a5434');
    const load: [Col, Col] = id === 'undead' ? [hex('#cfc8b8'), hex('#8a8478')] : id === 'samurai' ? [hex('#d8be82'), hex('#8a7040')] : [hex('#d8c79a'), hex('#b8a372')];
    const cell = this.cell(`c|${f}`, CART_CANVAS, (c, M) => paintCart(c, M, wood, load, f, id === 'samurai'), undefined, dir === 1 || dir === 2);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /** A crow in flight at a screen point (world pixels); `row` 0 flies east, 1 west. */
  crow(g: CanvasRenderingContext2D, f: number, row: number, X: number, Y: number, night: number): void {
    const carrion = this.st.id === 'undead';
    const cell = this.cell(`w|${f % 4}`, CROW_CANVAS, (c, M) => paintCrow(c, M, f % 4, carrion), undefined, row === 1);
    if (cell) this.atlas.blit(g, cell, X, Y, 2, false, night);
  }

  /** Bytes the atlas holds (day and night pages). */
  bytes(): number {
    return this.atlas.bytes();
  }
}

/** Each town's horses (by coat index), with the tack its riders use. */
function horsesFor(st: CityStyle): BeastLook[] {
  if (st.id === 'undead') {
    const bones: BeastLook = { kind: 'bones', coat: hex('#d4cbb0'), mane: hex('#3a3436'), eye: st.accent };
    return [bones, { kind: 'horse', coat: hex('#2e2a2e'), mane: hex('#141216'), tack: 'caparison', cloth: hex('#3a2e3e'), charge: st.accent }, bones, { kind: 'horse', coat: hex('#6a6660'), mane: hex('#2a2626') }, bones];
  }
  if (st.id === 'samurai')
    return [
      { kind: 'horse', coat: hex('#6e4a2c'), mane: hex('#24170f'), tack: 'saddle', cloth: hex('#2a2a34'), charge: st.accent },
      { kind: 'horse', coat: hex('#3a2e26'), mane: hex('#120d0a'), tack: 'saddle', cloth: hex('#7a2a20'), charge: st.accent },
      { kind: 'horse', coat: hex('#a08a64'), mane: hex('#4a3a28'), tack: 'pack' },
      { kind: 'horse', coat: hex('#9a6a3a'), mane: hex('#3a2412') },
      { kind: 'horse', coat: hex('#8f8577'), mane: hex('#3a352f'), white: true },
    ];
  return [
    { kind: 'horse', coat: hex('#6e4a2c'), mane: hex('#24170f'), white: true },
    { kind: 'horse', coat: hex('#3a2e26'), mane: hex('#120d0a'), tack: 'caparison', cloth: hex('#e4dccb'), charge: st.bannerCharge },
    { kind: 'horse', coat: hex('#8f8577'), mane: hex('#3a352f') },
    { kind: 'horse', coat: hex('#9a6a3a'), mane: hex('#3a2412') },
    { kind: 'horse', coat: hex('#d6cfc2'), mane: hex('#8a8378') },
  ];
}

// ------------------------------------------------------------------ faction looks

const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(Math.floor(n)) % xs.length]!;
const h1 = (s: number, k: number) => {
  let h = Math.imul(s ^ (k * 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  return ((Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The people of a faction's town, by role. */
export interface Looks {
  villager(seed: number, carry?: Look['carry']): Look;
  monk(carry?: Look['carry'], work?: Look['work']): Look;
  chaplain(): Look;
  infirmarer(work?: Look['work'], carry?: Look['carry']): Look;
  farmer(seed: number, work?: Look['work']): Look;
  carpenter(seed: number, work?: Look['work'], carry?: Look['carry']): Look;
  sergeant(carry?: Look['carry']): Look;
  squire(): Look;
  /** HD: the smith at the forge (classic uses a carpenter). */
  smith?(): Look;
}

// The commandery's folk, after the Maciejowski Bible and the Tacuinum Sanitatis: men in knee-length
// tunics over coloured hose, hoods, coifs and straw hats; women in long gowns with veil and
// wimple or a kerchief; children; a merchant in a long robe and chaperon.
const TUNICS = ['#6b5a3e', '#5a4a36', '#7a6646', '#4f5a3a', '#6a4436', '#55524a', '#7b5e3a', '#4a4f5a'];
const HOSE = ['#4a3a2a', '#3a3a3a', '#5a4630', '#7a3a2a', '#3e4a5a'];
const GOWNS = ['#3e5a86', '#5a6e3a', '#8a4a32', '#7a6a4a', '#6a3a4a', '#4a5a6a'];
const HAIR = ['#3a2616', '#5a3a1e', '#2a1d14', '#7a5a34', '#4a4040', '#8a6a3a'];
const LINENS = ['#e3dccb', '#d8cfb8', '#c9b48a', '#b8c0c8'];

export function templarLooks(st: CityStyle): Looks {
  return {
    villager: (seed, carry = 'none') => {
      const r = h1(seed, 2);
      const hair = hex(pick(HAIR, h1(seed, 5) * 6));
      if (r < 0.3) {
        const gown = hex(pick(GOWNS, h1(seed, 1) * 6));
        const wimple = h1(seed, 3) < 0.5;
        return {
          kind: 'woman', body: gown, legs: tone(gown, 0.4), robe: true, head: wimple ? 'wimple' : 'kerchief', hair: hex(pick(LINENS, seed)), locks: hair,
          sash: hex('#5a4630'), work: 'none', carry: carry === 'plank' || carry === 'sack' || carry === 'none' ? 'basket' : carry,
        };
      }
      if (r < 0.4)
        return { kind: 'child', body: hex(pick(TUNICS, h1(seed, 1) * 8)), legs: hex(pick(HOSE, seed)), head: 'hair', hair, robe: false, work: 'none', carry: 'none' };
      if (r < 0.48)
        // A merchant: a long robe of good cloth, a chaperon, a beard, a purse at the belt.
        return { body: hex(pick(['#7a2a26', '#2e4a6a', '#4a2e4a'], seed)), legs: hex('#2a2420'), robe: true, head: 'chaperon', hair: hex(pick(['#2a2420', '#6a2420', '#3a4a2a'], seed + 1)), beard: hair, sash: hex('#c8a24a'), trim: hex('#c8b89a'), work: 'none', carry: carry === 'plank' || carry === 'sack' ? 'book' : carry };
      const heads: Look['head'][] = ['hood', 'coif', 'straw', 'hair'];
      const head = pick(heads, h1(seed, 3) * 4);
      return {
        body: hex(pick(TUNICS, h1(seed, 1) * 8)), legs: hex(pick(HOSE, seed)), robe: false, head,
        hair: head === 'hood' ? hex(pick(['#6a4a2a', '#4a5a3a', '#7a3a2a', '#5a5048'], seed)) : head === 'coif' ? hex('#ddd4bf') : head === 'straw' ? hex('#c9a862') : hair,
        locks: hair, beard: h1(seed, 6) < 0.45 ? hair : undefined, work: 'none', carry,
      };
    },
    monk: (carry = 'none', work = 'pray') => ({ body: st.habit, legs: st.habitShade, head: 'hood', hair: tone(st.habit, -0.1), robe: true, sash: hex('#c8b890'), sleeves: 'wide', work, carry }),
    // The chaplain: the white mantle with the red cross, grey hair and beard, his book.
    chaplain: () => ({ body: st.mantle, legs: tone(st.mantle, 0.3), head: 'hair', hair: hex('#9a948a'), beard: hex('#b8b2a8'), robe: true, cross: st.bannerCharge, sleeves: 'wide', work: 'pray', carry: 'book' }),
    infirmarer: (work = 'tend', carry = 'none') => ({ body: mix(st.habit, hex('#6a6a66'), 0.5), legs: st.habitShade, head: 'coif', hair: hex('#e8e2d2'), robe: true, apron: hex('#e8e2d2'), work, carry }),
    farmer: (seed, work) => ({ body: hex(pick(['#7a6646', '#5f6a3c', '#8a7552'], seed)), legs: hex('#4a3a2a'), head: 'straw', hair: hex('#c9a95a'), locks: hex(pick(HAIR, seed)), robe: false, sleeves: 'rolled', work: work ?? (seed % 3 === 2 ? 'dig' : 'scythe'), carry: 'none' }),
    carpenter: (seed, work = 'hammer', carry = 'none') => ({ body: hex(pick(['#6b5a3e', '#5a4a36', '#6a4436'], seed)), legs: hex('#3e3024'), head: 'cap', hair: hex('#5a4630'), locks: hex(pick(HAIR, seed + 2)), robe: false, apron: hex('#8a6a46'), sleeves: 'rolled', beard: seed % 2 ? hex('#4a3420') : undefined, work, carry }),
    smith: () => ({ body: hex('#5a4a3e'), legs: hex('#2e2620'), head: 'hair', hair: hex('#2a1d14'), beard: hex('#2a1d14'), robe: false, apron: hex('#4a3020'), sleeves: 'rolled', work: 'hammer', carry: 'none' }),
    // Serving brothers off duty: the black tunic with the red cross, a mail coif pushed back.
    sergeant: (carry = 'none') => ({ body: st.habit, legs: hex('#2a2420'), head: 'coif', hair: hex('#8a9098'), locks: hex('#3a2616'), beard: hex('#3a2616'), robe: false, cross: st.bannerCharge, work: 'none', carry }),
    squire: () => ({ body: st.team, legs: hex('#3a2e24'), head: 'hair', hair: hex('#6a4a2a'), robe: false, work: 'none', carry: 'none' }),
  };
}

// The castle town, after Hiroshige's Tōkaidō and the Rakuchū rakugai screens: short kimono over
// gaiters or bare legs, kasa and tenugui, topknots; women in long kimono with an obi, the hair up,
// a parasol; carrying poles; black-robed monks with the saffron kesa.
const KIMONO = ['#3a4a6a', '#5a4a3a', '#6a5a46', '#4a5a4a', '#7a4a3a', '#46465a', '#8a7452', '#3e3a44'];
const WOMEN = ['#7a3a4a', '#3e5a7a', '#8a6a3a', '#5a3a5a', '#3a6a5a', '#a0503a'];
const HAKAMA = ['#2e2c34', '#4a4038', '#3a3a46'];

export function samuraiLooks(st: CityStyle): Looks {
  const black = hex('#1e1a1e');
  return {
    villager: (seed, carry = 'none') => {
      const r = h1(seed, 2);
      if (r < 0.38) {
        const kimono = hex(pick(WOMEN, h1(seed, 1) * 6));
        return {
          kind: 'woman', body: kimono, legs: tone(kimono, 0.3), robe: true, head: 'bun', hair: black, locks: black,
          sash: hex(pick(['#d9b24c', '#b5372b', '#e0d8c0', '#4a6a8a'], seed)), pattern: h1(seed, 4) < 0.5 ? 'kasuri' : undefined, sleeves: 'wide',
          trim: hex(pick(['#b5372b', '#d9a03a', '#4a6a9a'], seed + 1)), work: 'none',
          carry: carry === 'none' ? (h1(seed, 3) < 0.6 ? 'parasol' : 'none') : carry === 'plank' || carry === 'sack' ? 'bundle' : carry,
        };
      }
      if (r < 0.46)
        return { kind: 'child', body: hex(pick(KIMONO, seed)), legs: hex('#2e2c34'), lower: 'bare', head: 'topknot', hair: black, robe: false, sash: hex('#d8ceb4'), work: 'none', carry: 'none' };
      if (r < 0.56)
        // A merchant: a dark haori over his kimono, hakama, a topknot, his goods in a cloth bundle.
        return { body: hex(pick(['#3a3430', '#2e3446', '#4a3a2e'], seed)), legs: hex(pick(HAKAMA, seed)), lower: 'hakama', head: 'topknot', hair: black, robe: false, sash: hex('#d8ceb4'), sleeves: 'wide', work: 'none', carry: carry === 'none' ? 'bundle' : carry };
      const kasa = h1(seed, 3) < 0.4;
      return {
        body: hex(pick(KIMONO, h1(seed, 1) * 8)), legs: hex('#2e3a52'), lower: h1(seed, 5) < 0.5 ? 'gaiters' : 'bare', pattern: h1(seed, 6) < 0.35 ? 'kasuri' : undefined,
        head: kasa ? 'kasa' : h1(seed, 4) < 0.5 ? 'topknot' : 'tenugui', hair: kasa ? hex('#c4a266') : h1(seed, 4) < 0.5 ? black : hex('#d8d0bc'), locks: black,
        robe: false, sash: hex('#d8ceb4'), work: 'none',
        carry: carry === 'plank' ? 'yoke' : carry === 'sack' ? 'bundle' : carry,
      };
    },
    // Sōhei and temple monks: a black robe with a saffron kesa, shaven heads.
    monk: (carry = 'none', work = 'pray') => ({ body: hex('#2c2a30'), legs: hex('#1e1c22'), head: 'shaved', hair: hex('#2c2a30'), robe: true, kesa: hex('#c8902c'), sleeves: 'wide', work, carry }),
    // The shrine's kannushi: white robe, pale blue hakama, the black eboshi.
    chaplain: () => ({ body: hex('#ece6d6'), legs: hex('#9ab0c4'), lower: 'hakama', head: 'eboshi', hair: black, robe: false, sash: hex('#ece6d6'), sleeves: 'wide', work: 'pray', carry: 'none' }),
    infirmarer: (work = 'tend', carry = 'none') => ({ body: hex('#4a4038'), legs: hex('#2a2620'), head: 'shaved', hair: hex('#2a2620'), robe: true, apron: hex('#d8d0bc'), work, carry }),
    // Rice planters in sedge hats, sleeves tied back, bent to the paddy, legs bare.
    farmer: (seed, work = 'tend') => ({ body: hex(pick(['#4a5a74', '#5a6a4a', '#6a5a46'], seed)), legs: hex('#2e3440'), lower: 'bare', head: 'kasa', hair: hex('#c9aa6a'), locks: black, robe: false, sash: hex('#d8ceb4'), sleeves: 'rolled', work, carry: 'none' }),
    carpenter: (seed, work = 'hammer', carry = 'none') => ({ body: hex(pick(['#3a4a64', '#5a4632', '#46404a'], seed)), legs: hex('#2a2a30'), head: 'tenugui', hair: hex('#d8d0bc'), locks: black, robe: false, sleeves: 'rolled', pattern: 'stripe', work, carry }),
    smith: () => ({ body: hex('#3a3a44'), legs: hex('#2a2a30'), head: 'tenugui', hair: hex('#d8d0bc'), locks: black, robe: false, apron: hex('#4a3a2e'), sleeves: 'rolled', work: 'hammer', carry: 'none' }),
    // Ashigaru off duty: the clan's lacquered jingasa, a short dark kimono, gaiters, the team sash.
    sergeant: (carry = 'none') => ({ body: hex('#2c3550'), legs: hex('#1e2232'), lower: 'gaiters', head: 'jingasa', hair: hex('#2a2628'), locks: black, robe: false, sash: st.team, work: 'none', carry }),
    squire: () => ({ body: st.team, legs: hex('#2a2a30'), lower: 'hakama', head: 'topknot', hair: black, robe: false, sash: hex('#d8ceb4'), work: 'none', carry: 'none' }),
  };
}

// The necropolis: shambling dead in rags, skeleton labourers, cowled cultists with green-lit eyes,
// gravediggers with spades, the necromancer with his skull-staff.
const RAGS = ['#4a4640', '#3e3a36', '#56504a', '#3a3a40', '#4e4434'];

export function undeadLooks(st: CityStyle): Looks {
  const green = st.accent;
  const dead = [hex('#9aa08a'), hex('#a8a48e'), hex('#8e9684')];
  return {
    villager: (seed, carry = 'none') => {
      const bones = h1(seed, 3) < 0.3;
      if (bones)
        return { kind: 'skeleton', body: hex(pick(RAGS, h1(seed, 1) * 5)), legs: hex('#2e2a28'), head: 'skull', hair: hex('#2a2626'), robe: false, eyes: h1(seed, 4) < 0.5 ? green : undefined, work: 'none', carry };
      return {
        kind: 'zombie', body: hex(pick(RAGS, h1(seed, 1) * 5)), legs: hex('#2e2a28'),
        head: h1(seed, 4) < 0.5 ? 'hair' : 'hood', hair: hex(pick(['#3a3430', '#5a5a52', '#2a2626'], seed)), locks: hex('#3a3430'),
        robe: h1(seed, 2) < 0.3, skin: pick(dead, seed), shamble: carry === 'none', rags: true, work: 'none', carry,
      };
    },
    // Cultists of the Black Chapel: deep cowls, green-lit eyes.
    // A candle held out before them (round 2): the cowl has a lit rim and a face in it now.
    monk: (carry = 'none', work = 'pray') => ({ body: hex('#2e2b36'), legs: hex('#1a181f'), head: 'cowl', hair: hex('#3e3848'), robe: true, sash: hex('#3a5a34'), eyes: green, sleeves: 'wide', skin: dead[0]!, work, carry: carry === 'none' ? 'candle' : carry }),
    // The necromancer: black and violet, a skull-staff.
    chaplain: () => ({ body: hex('#2a2234'), legs: hex('#18141e'), head: 'cowl', hair: hex('#3a2e46'), robe: true, sash: green, trim: hex('#5a4a6a'), eyes: green, sleeves: 'wide', skin: dead[0]!, work: 'none', carry: 'staff' }),
    // Embalmers of the plague house: grey robes and a stained apron.
    infirmarer: (work = 'tend', carry = 'none') => ({ body: hex('#4a4a4e'), legs: hex('#2a2a2e'), head: 'coif', hair: hex('#8a8478'), robe: true, apron: hex('#8a7a62'), skin: hex('#a8a48e'), work, carry }),
    // Gravediggers: battered hats, spades.
    farmer: (seed, work = 'dig') => ({ kind: 'zombie', body: hex(pick(['#4a4034', '#3a3a34', '#504436'], seed)), legs: hex('#2a2622'), head: 'hat', hair: hex('#2e2a26'), locks: hex('#3a3430'), robe: false, skin: pick(dead, seed + 1), rags: true, sleeves: 'rolled', work, carry: 'none' }),
    carpenter: (seed, work = 'hammer', carry = 'none') => ({ kind: 'skeleton', body: hex(pick(['#4a4038', '#3e3a34'], seed)), legs: hex('#2a2622'), head: 'skull', hair: hex('#2a2626'), robe: false, work, carry }),
    smith: () => ({ kind: 'skeleton', body: hex('#3e3a34'), legs: hex('#2a2622'), head: 'skull', hair: hex('#2a2626'), robe: false, eyes: green, work: 'hammer', carry: 'none' }),
    sergeant: (carry = 'none') => ({ kind: 'skeleton', body: hex('#3a3c38'), legs: hex('#24241f'), head: 'skull', hair: hex('#2a2626'), robe: false, sash: st.team, eyes: green, work: 'none', carry }),
    squire: () => ({ kind: 'zombie', body: hex('#3a3436'), legs: hex('#24201f'), head: 'hood', hair: hex('#2a2628'), robe: false, skin: dead[0]!, shamble: false, rags: true, work: 'none', carry: 'none' }),
  };
}

/** A stable per-figure offset in [0, 1) from where it stands (desynchronises the work loops). */
export const folkSeed = (u: number, v: number): number => hash(Math.floor(u * 3), Math.floor(v * 3), 17);
