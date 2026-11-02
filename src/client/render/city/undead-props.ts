// The necropolis's clutter (HD): the small things that make a town look lived in (or died in).
// Headstones of every kind, open graves and shovels, coffins, bone heaps, candles at the shrines,
// witchfire lanterns, gibbet cages, braziers, dead trees with crows, iron railings with spear
// finials, weeping angels, sarcophagi, wreaths, cobwebs, a well with a chained lid, a corpse cart,
// and the ground's own detail: cracked flagstones with weeds, bone-strewn dirt, dead grass and
// pools of sickly light dappled through dead branches.
//
// Small things are hand-drawn micro-sprites (`stamp`) at the art pixel, as the CC0 graveyard sets
// do it (SpiderDave's tombstones, angrysnail's graveyard; docs/art-references/undead-city.md):
// at 2 buffer pixels a world unit a headstone is 7 pixels wide, too small for a lit box to read.
// Bigger things are boxes with shaders, like the buildings.
//
// The clutter is registered with the shared prop library (city/props.ts) as 'undead:*' kinds with
// an Undead theme, so the placement pass scatters it along walls, by doors and roads. What throws
// light (lanterns, braziers, candles at the gate) and the ground decal stay with the building kit
// (`yardProps`), which has the necropolis's own glow and witchfire hooks; the grave fields outside
// the walls are redrawn row by row with the granary (`graveFields`).

import { WALL, GATE_V, type Art, type BuildingParts, type Painter } from './buildings.ts';
import { FIELDS } from './ground.ts';
import { B, box, G, hash, hex, line3, mix, post, Px, R, rgb, sx, sy, tone, v3, type Col, type Facing } from './pixels.ts';
import { registerProp, registerTheme, type Group, type PropAt } from './props.ts';
import { roadDistance } from './roads.ts';
import type { CityStyle } from './style.ts';

/** What a prop painter needs: a buffer, the style, glass and after-outline lists (a Painter has them). */
export interface Pt {
  px: Px;
  st: CityStyle;
  k: number;
  glass: number[];
  late: (() => void)[];
}

// ------------------------------------------------------------------ light sources

/** The parts being painted, for helpers that add light sources. */
let sink: BuildingParts | null = null;
export function setSink(p: BuildingParts | null): void {
  sink = p;
}
/** An emissive point that throws a pool: 0 grave-light green, 1 arcane violet. */
export function glow(u: number, v: number, z: number, kind: 0 | 1): void {
  if (!sink) return;
  (sink.glows ??= []).push([sx(u, v), sy(u, v, z), kind]);
}
/** A live witchfire flame (city.ts draws it flickering, with its pool). */
export function flame(u: number, v: number, z: number): void {
  if (!sink) return;
  sink.torches.push([Math.floor(sx(u, v)), Math.floor(sy(u, v, z))]);
}

// ------------------------------------------------------------------ palette

export type Pal = Record<string, Col>;
const PALS = new WeakMap<CityStyle, Pal>();

/** One palette for every micro-sprite, built on the city's ramps. */
export function palOf(st: CityStyle): Pal {
  let p = PALS.get(st);
  if (p) return p;
  p = {
    // Weathered grey stone (paler than the buildings, so the graves read against the dark turf).
    S: mix(st.stone[0], st.fine[2], 0.3), s: mix(st.stone[1], st.fine[3], 0.2), d: st.stone[2], e: st.stone[3],
    // Marble gone grey-violet, for angels and the better tombs.
    A: hex('#a29cb2'), a: hex('#7a7490'), q: hex('#524c68'),
    // Bone.
    B: st.fine[0], b: st.fine[1], k: st.fine[2], K: st.fine[3],
    // Witchfire.
    G: hex('#b4ff8c'), g: hex('#5fd64a'), h: hex('#2f7a3a'), F: hex('#f0ffd8'),
    V: st.violet,
    // Iron, rust.
    I: hex('#6c6a7c'), i: hex('#3c3a48'), j: hex('#22202a'), r: hex('#6a4038'), R: hex('#8a5a40'),
    // Timber.
    W: st.timber[0], w: st.timber[1], v: st.timber[2], x: st.timber[3],
    // Moss and lichen, dead ivy and withered flowers.
    M: hex('#5a6440'), m: hex('#3e4632'), L: hex('#8c8a6c'),
    N: hex('#7a6c4c'), n: hex('#544a3a'), y: hex('#7a5a8a'), Y: hex('#8a7c4a'), z: hex('#4a3a4e'),
    // Crows.
    C: hex('#141019'), c: hex('#2c2640'),
    // Wax.
    X: hex('#dcd4b4'), t: hex('#a89c80'),
    // Shroud.
    T: hex('#b8b2a2'), u: hex('#847e74'),
    // Dirt and the dark of a hole.
    D: hex('#3a3644'), O: hex('#26222e'), Q: hex('#0c0a10'),
    // Cobweb.
    Z: hex('#9e9ab4'),
  };
  PALS.set(st, p);
  return p;
}

// ------------------------------------------------------------------ the micro-sprite

export interface StampOpts {
  /** Columns to shift per row up from the bottom (a lean), e.g. 0.15. */
  lean?: number;
  /** Mirror left-right. */
  flip?: boolean;
  /** Palette overrides for this stamp (a black or a marble headstone from the same art). */
  sub?: Pal;
  /** Characters whose pixels are glass (lit at night as the city's lit colour). */
  glass?: string;
  /** Extra depth (so a stamp on a wall sits in front of it). */
  dz?: number;
}

/**
 * A little hand-drawn sprite standing at a world point: rows top to bottom, '.' is empty, every
 * other character a palette key. Anchored at the middle of its bottom row; depth tested as an
 * upright thing (each row a little higher, so it stands in front of the ground behind it).
 */
export function stamp(P: Pt, u: number, v: number, z: number, art: readonly string[], o: StampOpts = {}): void {
  const pal = palOf(P.st);
  const px = P.px;
  const k = P.k;
  const x0 = Math.floor(px.X(u, v));
  const y0 = Math.floor(px.Y(u, v, z));
  const rows = art.length;
  const w = art[0]!.length;
  const ax = Math.floor(w / 2);
  const base = u + v + z + (o.dz ?? 0.4);
  for (let r = 0; r < rows; r++) {
    const line = art[r]!;
    const up = rows - 1 - r;
    const shift = o.lean ? Math.round(up * o.lean) : 0;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]!;
      if (ch === '.' || ch === ' ') continue;
      const col = o.sub?.[ch] ?? pal[ch];
      if (col === undefined) continue;
      const xx = x0 - ax + (o.flip ? w - 1 - c : c) + shift;
      const yy = y0 - up;
      px.plot(xx, yy, base + up / k, col);
      if (o.glass?.includes(ch)) P.glass.push(xx, yy);
    }
  }
}

/** Set a buffer pixel's light class (the night rig: 1 keeps its value, 3 falls into the dark). */
function cls(P: Pt, x: number, y: number, c: number): void {
  const px = P.px;
  if (x < 0 || y < 0 || x >= px.w || y >= px.h) return;
  px.cls[y * px.w + x] = c;
}

// ------------------------------------------------------------------ the art

/** Headstones and grave markers, after Glasnevin's crowded rows and SpiderDave's CC0 set. */
const ROUND = [
  '..sSSs..',
  '.sSSSSSd',
  '.SSSSSSd',
  '.SsssSSd',
  '.SSSSSSd',
  '.SssSsSd',
  '.SSSSSSd',
  '.SSLSSSd',
  '.MSSSSMd',
  'MmMMmMmd',
];
const CRACKED = [
  '..sSS...',
  '.sSSSe..',
  '.SSSSSe.',
  '.SssseSd',
  '.SSSeSSd',
  '.SseSsSd',
  '.SSeSSSd',
  '.SSSeSSd',
  '.MSSSeMd',
  'MmMMmMmd',
];
const GOTHIC = [
  '...S....',
  '..sSd...',
  '.sSSSd..',
  '.SSdSSd.',
  '.SsssSd.',
  '.SSsSSd.',
  '.SSSSSd.',
  '.SsssSd.',
  '.SSSSSd.',
  '.SSLSSd.',
  '.MSSSMd.',
  'MmMMmMd.',
];
const CROSS = [
  '...S...',
  '..SSd..',
  '..SSd..',
  'sSSSSdd',
  'ssssddd',
  '..SSd..',
  '..SSd..',
  '..SLd..',
  '..SSd..',
  '.SSSSd.',
  'MmMMmMd',
];
const CELTIC = [
  '....S....',
  '...SSd...',
  '..sSSds..',
  '.s.SSd.d.',
  'SSSSSSSdd',
  'sssSSdsdd',
  '.s.SSd.d.',
  '..sSSdd..',
  '...SSd...',
  '...SLd...',
  '...SSd...',
  '...SSd...',
  '..SSSSd..',
  '..SdddSd.',
  '.MSSSSSdM',
  'MmMMmMmMd',
];
const OBELISK = [
  '...S...',
  '..SSd..',
  '..SSd..',
  '..SSd..',
  '..SSd..',
  '..SSd..',
  '..SSd..',
  '..SLd..',
  '..SSd..',
  '..SSd..',
  '..SSd..',
  '.SSSdd.',
  '.SdddSd',
  '.SSSSdd',
  '.ssssdd',
  'MSSSSdM',
  'MmMmMmd',
];
const SLAB = [
  '..sSSSSs..',
  '.sSSSSSSSd',
  'sSSdSSSSdd',
  'SSSSSSSSdd',
  'MSSSSSSdd.',
  'mMmMMmMd..',
];
const ANGEL = [
  '....aa.....',
  '...aAAq....',
  '...aAAq....',
  '.aA.aAq.Aq.',
  'aAAaAAAqAAq',
  'aAAAAAAAAAq',
  'aAAqAAAqqAq',
  '.aAqAAAqAq.',
  '.aAqAeAAqq.',
  '..aqAeAAq..',
  '..aAAeAAq..',
  '..aAAqAAq..',
  '..aAAqAeq..',
  '.aAAAqAeAq.',
  '.aAAAqAAAq.',
  '.aaaaqqqqq.',
  '.SSSSSSSSd.',
  '.SdddddSSd.',
  '.SSSSSSSSd.',
  'MMSSSSSSSdM',
  'mMmMMmMmMMd',
];
const WREATH = ['.nNn.', 'N.y.n', 'n...N', 'NyY.n', '.nNy.', '..y..'];
const CANDLES = [
  '.F....F.',
  '.G..F.G.',
  '.X..G.X.',
  '.Xt.X.Xt',
  'XXtXXtXt',
  'XtXXtXXt',
  'ttttttt.',
];
const LANTERN = ['..j..', '.iji.', 'iiiii', 'iGFGi', 'iGGGi', 'igGgi', 'iiiii', '..i..'];
const CAGE = [
  '...i...',
  '..iji..',
  '.i.j.i.',
  'i..B..i',
  'i.BkB.i',
  'i..b..i',
  'ibkbkbi',
  'i..b..i',
  'i.b.b.i',
  'i.b.k.i',
  'iiiiiii',
  '...i...',
];
const CROW = ['CC...', 'CCCc.', '.CCCC', '..C..'];
const CROW2 = ['.....C', 'CC..CC', '.CCCC.', '..CC..'];
const GARGOYLE = ['e.....e', 'ddddd..', 'eSsdddd', '.dSSdde', '..ddd..', '..e.e..'];
const PLAGUE = [
  'j.......j',
  'j.......j',
  'xvvvvvvvx',
  'vWWCCWWWv',
  'vWCCCCWWv',
  'vWCGCCCCv',
  'vWWCCWWCv',
  'vWWWCWWWv',
  'xvvvvvvvx',
];
const SHOVEL = ['.v.', 'vvv', '.w.', '.w.', '.w.', '.w.', 'IIi', 'IIi', '.i.'];
const SKULL = ['.BB.', 'BbbK', 'kQkK', '.bK.'];
const SKULLPILE = ['...BB...', '..BkkK..', '.BBQkBK.', 'BkbKBbbK', 'bQkbkQkK', 'kbKBkbKk'];
const BONES = ['B.....b', '.bk.kK.', '..BbK..', '.Bk.bk.', 'b.....K'];
const FLOWERS = ['y.Y.y', 'NyNYn', '.nNn.'];
const WEB = ['ZZZZZZZ', 'Z.Z..Z.', 'ZZ.ZZ..', 'Z.Z.Z..', 'ZZ.Z...', 'Z.Z....', 'ZZ.....', 'Z......'];

/** Swap the stone keys for a black polished or a marble headstone. */
function subFor(P: Pt, kind: number): Pal | undefined {
  const p = palOf(P.st);
  if (kind === 1) return { S: hex('#3a3850'), s: hex('#2c2a3e'), d: hex('#1c1a2a'), L: hex('#56546c') };
  if (kind === 2) return { S: p.A!, s: p.a!, d: p.q!, L: hex('#c8c4cc') };
  return undefined;
}

// ------------------------------------------------------------------ props

/** A grave marker of a kind picked by n (0..1): rounded, cracked, gothic, cross, Celtic cross, obelisk, slab, angel. */
export function headstone(P: Pt, u: number, v: number, n: number, seed: number): void {
  const m = hash(seed, 3, 17);
  const sub = subFor(P, m < 0.4 ? 1 : m > 0.9 ? 2 : 0);
  const lean = hash(seed, 5, 17) < 0.25 ? (hash(seed, 6, 17) < 0.5 ? 0.18 : -0.18) : 0;
  const art = n < 0.2 ? ROUND : n < 0.32 ? CRACKED : n < 0.46 ? GOTHIC : n < 0.6 ? CROSS : n < 0.72 ? CELTIC : n < 0.8 ? OBELISK : n < 0.985 ? SLAB : ANGEL;
  stamp(P, u, v, 0, art, { sub, lean: art === OBELISK || art === ANGEL ? 0 : lean, flip: hash(seed, 7) < 0.5 });
  // Withered flowers or a wreath on some.
  const f = hash(seed, 8, 17);
  if (f < 0.12 && art !== SLAB) stamp(P, u + 0.6, v + 1.2, 1.5, WREATH, { dz: 1 });
  else if (f < 0.3) stamp(P, u + 0.8, v + 1.6, 0, FLOWERS, { dz: 1 });
}

/** An open grave: a black pit, its spoil heaped beside it, a shovel stood in the heap. */
export function openGrave(P: Pt, u: number, v: number, seed: number): void {
  const p = palOf(P.st);
  // The pit: a dark slot, its far wall lit, its near lip a line of turned earth.
  box(P.px, u, v, -2, 2.4, 4.4, 2.05, (f, s, t) => (f === 'top' ? (t < 0.6 || s < 0.4 ? p.D! : p.Q!) : f === 'left' ? p.O! : p.O!), true);
  // The spoil: a mound of earth with stones in it.
  for (let i = 0; i < 18; i++) {
    const a = hash(i, seed, 1) * Math.PI * 2;
    const r = hash(i, seed, 2) * 1.2;
    const du = 3.4 + Math.cos(a) * r;
    const dv = 2 + Math.sin(a) * r * 1.8;
    const h = 1.4 - r;
    box(P.px, u + du - 0.6, v + dv - 0.6, 0, 1.2, 1.2, Math.max(0.3, h), (f) => (f === 'top' ? (hash(i, seed, 4) < 0.2 ? p.s! : p.D!) : f === 'left' ? p.O! : tone(p.O!, 0.3)));
  }
  stamp(P, u + 3.6, v + 2.6, 0.8, SHOVEL, { lean: 0.15, dz: 1 });
}

/** A coffin: a tapered box, lid on (or off, showing a shrouded body). */
export function coffin(P: Pt, u: number, v: number, z: number, alongU: boolean, open = false): void {
  const p = palOf(P.st);
  const L = 4.4;
  const W = 1.6;
  const lu = alongU ? L : W;
  const lv = alongU ? W : L;
  const wood = (f: Facing, s: number, t: number): Col => {
    if (f === 'top') {
      if (open) return s > 0.4 && s < (alongU ? L : W) - 0.4 && t > 0.4 && t < (alongU ? W : L) - 0.4 ? p.T! : p.v!;
      // A lid with a cross in relief.
      const a = alongU ? s : t;
      const b = alongU ? t : s;
      return (Math.abs(a - L * 0.35) < 0.3 && Math.abs(b - W / 2) < 0.7) || (Math.abs(b - W / 2) < 0.2 && a > 0.8 && a < L - 0.6) ? p.W! : p.w!;
    }
    return f === 'left' ? (t > 0.9 ? p.w! : p.v!) : p.x!;
  };
  box(P.px, u, v, z, lu, lv, 1.2, wood);
  if (open) stamp(P, u + lu / 2, v + lv / 2, z + 1.2, ['.Bk.', 'TTTu', 'uTu.'], { dz: 0.8 });
}

/** Coffins stacked against a wall, three high at the back. */
export function coffinStack(P: Pt, u: number, v: number, n: number, alongU: boolean): void {
  for (let i = 0; i < n; i++) {
    const layer = i < 3 ? 0 : i < 5 ? 1 : 2;
    const j = i < 3 ? i : i < 5 ? i - 3 : 0;
    const off = j * 2 + layer;
    coffin(P, u + (alongU ? 0 : off), v + (alongU ? off : 0), layer * 1.2, !alongU ? false : true);
  }
}

/** A heap of skulls and long bones. */
export function bones(P: Pt, u: number, v: number, big: boolean, seed: number): void {
  stamp(P, u, v, 0, big ? SKULLPILE : hash(seed, 1) < 0.5 ? BONES : SKULL, { flip: hash(seed, 2) < 0.5 });
}

/** Candles at a shrine: a cluster of stubs over a pool of wax, flames lit, a little light. */
export function candles(P: Pt, u: number, v: number, z: number, seed: number): void {
  stamp(P, u, v, z, CANDLES, { flip: hash(seed, 1) < 0.5, dz: 0.8 });
  glow(u, v, z + 3, 0);
}

/** An iron lantern of witchfire on a post with a bracket arm. */
export function lanternPost(P: Pt, u: number, v: number, h = 9): void {
  const p = palOf(P.st);
  post(P.px, u, v, 0, h, p.i!, p.j!);
  line3(P.px, v3(u, v, h), v3(u, v + 1.6, h), p.i!);
  stamp(P, u, v + 1.6, h - 4.2, LANTERN, { dz: 0.6 });
  glow(u, v + 1.6, h - 2.5, 0);
}

/** A lantern hung on a wall bracket. */
export function wallLantern(P: Pt, u: number, v: number, z: number): void {
  stamp(P, u, v, z, LANTERN, { dz: 1.2 });
  glow(u, v, z + 2, 0);
}

/** A gibbet: an upright, an arm and a brace, an iron cage with someone's bones in it. */
export function gibbet(P: Pt, u: number, v: number, h = 16): void {
  const p = palOf(P.st);
  post(P.px, u, v, 0, h, p.w!, p.v!);
  line3(P.px, v3(u, v, h), v3(u, v + 6, h), p.w!);
  line3(P.px, v3(u, v, h - 1), v3(u, v + 6, h - 1), p.v!);
  line3(P.px, v3(u, v + 0.4, h - 4), v3(u, v + 3, h - 1), p.v!);
  line3(P.px, v3(u, v + 5.5, h - 1), v3(u, v + 5.5, h - 3), p.i!);
  stamp(P, u, v + 5.5, h - 9, CAGE, { dz: 0.5 });
}

/** A brazier: an iron bowl on three legs, its witchfire drawn live. */
export function brazier(P: Pt, u: number, v: number): void {
  const p = palOf(P.st);
  for (const [du, dv] of [[-0.8, -0.8], [0.8, -0.4], [-0.3, 0.9]] as const) line3(P.px, v3(u + du, v + dv, 0), v3(u, v, 3), p.i!);
  stamp(P, u, v, 3, ['IiiiiiI', 'jIiiiIj', '.jjjjj.'], { dz: 0.4 });
  stamp(P, u, v, 4.4, ['.g.G.g.', 'gGFGFGg'], { dz: 0.2 });
  flame(u, v, 5);
}

/** A dead tree: a gnarled trunk, crooked limbs, crows on the ends. */
export function deadTree(P: Pt, u: number, v: number, h: number, seed: number, crows = 2): void {
  const px = P.px;
  const k = P.k;
  const bark = [hex('#6e6672'), hex('#4c4552'), hex('#302a36')];
  const x0 = Math.floor(px.X(u, v));
  const y0 = Math.floor(px.Y(u, v));
  const d0 = u + v + 0.5;
  const ends: [number, number][] = [];
  const limb = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let cx = x;
    let cy = y;
    let ang = a;
    for (let i = 0; i < len; i++) {
      // Gnarled: the limb wanders as it grows.
      ang += (hash(Math.round(cx), Math.round(cy), seed) - 0.5) * 0.35;
      cx += Math.cos(ang);
      cy += Math.sin(ang);
      for (let j = 0; j < w; j++) px.plot(Math.round(cx) + j - (w >> 1), Math.round(cy), d0 + (y0 - cy) / k / 4, j === 0 ? bark[0]! : j === w - 1 && w > 1 ? bark[2]! : bark[1]!);
    }
    if (depth <= 0 || len < 3) {
      ends.push([Math.round(cx), Math.round(cy)]);
      return;
    }
    const n = hash(Math.round(cx), Math.round(cy), seed + 1);
    limb(cx, cy, ang - 0.5 - n * 0.35, len * 0.64, Math.max(1, w - 1), depth - 1);
    limb(cx, cy, ang + 0.45 + n * 0.3, len * 0.6, Math.max(1, w - 1), depth - 1);
    if (n > 0.6 && depth > 1) limb(cx, cy, ang + (n - 0.8) * 0.4, len * 0.5, 1, depth - 2);
  };
  // Roots splayed at the foot.
  for (const a of [Math.PI * 0.92, Math.PI * 0.08, Math.PI * 0.5]) {
    let cx = x0;
    let cy = y0;
    for (let i = 0; i < 4; i++) {
      cx += Math.cos(a) * 1.2;
      cy += Math.sin(a) * 0.5;
      px.plot(Math.round(cx), Math.round(cy), d0, bark[1]!);
    }
  }
  limb(x0, y0, -Math.PI / 2 + (hash(seed, 9) - 0.5) * 0.25, h * k * 0.55, 4, 4);
  // Crows on the twig ends.
  for (let i = 0; i < crows && ends.length; i++) {
    const [ex, ey] = ends[Math.floor(hash(seed, i, 31) * ends.length)]!;
    const art = i % 2 ? CROW2 : CROW;
    const pal = palOf(P.st);
    for (let r = 0; r < art.length; r++)
      for (let c = 0; c < art[r]!.length; c++) {
        const ch = art[r]![c]!;
        if (ch !== '.') px.plot(ex + c - 2, ey - art.length + r + 1, d0 + 10, pal[ch]!);
      }
  }
}

/** An iron railing between two points: posts with spear finials, two rails, rust at the foot. */
export function railing(P: Pt, u0: number, v0: number, u1: number, v1: number, h = 4.5, gate = false): void {
  const p = palOf(P.st);
  const len = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = u0 + (u1 - u0) * t;
    const v = v0 + (v1 - v0) * t;
    if (gate && Math.abs(t - 0.5) < 0.12) continue;
    const big = i % 5 === 0;
    const hh = h + (big ? 1 : 0);
    post(P.px, u, v, 0, hh, i % 2 ? p.i! : p.j!);
    // The spear point.
    const x = Math.floor(P.px.X(u, v));
    const y = Math.floor(P.px.Y(u, v, hh));
    P.px.plot(x, y - 1, u + v + hh + 0.5, p.I!);
    if (big) {
      P.px.plot(x - 1, y, u + v + hh + 0.4, p.i!);
      P.px.plot(x + 1, y, u + v + hh + 0.4, p.i!);
      P.px.plot(x, y - 2, u + v + hh + 0.6, p.I!);
    }
    if (hash(Math.floor(u * 3), Math.floor(v * 3), 5) < 0.3) P.px.plot(x, Math.floor(P.px.Y(u, v, 0.5)), u + v + 0.6, p.r!);
  }
  for (const z of [h - 0.8, 1]) line3(P.px, v3(u0, v0, z), v3(u1, v1, z), z > 2 ? p.i! : p.j!);
}

/** A carved sarcophagus on a plinth: panels on its side, a gabled lid with acroteria. */
export function sarcophagus(P: Pt, u: number, v: number, alongU: boolean): void {
  const p = palOf(P.st);
  const lu = alongU ? 5 : 2.6;
  const lv = alongU ? 2.6 : 5;
  const side = (f: Facing, s: number, t: number): Col => {
    if (f === 'top') return p.A!;
    const lit = f === 'left' ? p.A! : p.q!;
    // Panels: recessed squares with a dark lower edge.
    const ps = s % 1.6;
    if (t > 0.5 && t < 1.8 && ps > 0.25 && ps < 1.35) return t < 0.75 ? tone(lit, 0.25) : f === 'left' ? p.a! : tone(p.q!, 0.2);
    if (t < 0.4) return f === 'left' ? p.a! : tone(p.q!, 0.2);
    return lit;
  };
  box(P.px, u - 0.3, v - 0.3, 0, lu + 0.6, lv + 0.6, 0.6, (f) => (f === 'top' ? p.s! : f === 'left' ? p.s! : p.d!));
  box(P.px, u, v, 0.6, lu, lv, 2.2, side);
  box(P.px, u - 0.2, v - 0.2, 2.8, lu + 0.4, lv + 0.4, 0.5, (f) => (f === 'top' ? p.A! : f === 'left' ? p.a! : p.q!));
  // Black streaks down the stone.
  for (let i = 0; i < 3; i++) {
    const a = 0.8 + i * 1.6 + hash(i, Math.floor(u + v)) * 0.6;
    line3(P.px, alongU ? v3(u + a, v + lv + 0.01, 2.6) : v3(u + lu + 0.01, v + a, 2.6), alongU ? v3(u + a, v + lv + 0.01, 1.2 + hash(i, 3) * 0.8) : v3(u + lu + 0.01, v + a, 1.2), tone(p.q!, 0.3));
  }
}

/** A weeping angel: faceless with weather, head bowed, wings folded, on a plinth. */
export function angel(P: Pt, u: number, v: number, flip = false): void {
  stamp(P, u, v, 0, ANGEL, { flip });
}

/** A gargoyle crouched on a cornice, peering out (`face` picks which wall it juts from). */
export function gargoyle(P: Pt, u: number, v: number, z: number, flip = false): void {
  stamp(P, u, v, z, GARGOYLE, { flip, dz: 1.5 });
}

/** A hanging sign: a plague doctor's beaked mask on a board, from an iron bracket. */
export function plagueSign(P: Pt, u: number, v: number, z: number): void {
  const p = palOf(P.st);
  line3(P.px, v3(u, v, z + 1), v3(u, v + 3.4, z + 1), p.i!);
  line3(P.px, v3(u, v, z - 1), v3(u, v + 2, z + 1), p.i!);
  stamp(P, u, v + 2.6, z - 7.5, PLAGUE, { dz: 1.5 });
}

/** A withered wreath on a door or a tomb. */
export function wreath(P: Pt, u: number, v: number, z: number): void {
  stamp(P, u, v, z, WREATH, { dz: 1.2 });
}

/** A cobweb in a corner (laid after the outline, so its threads stay one pixel). */
export function cobweb(P: Pt, u: number, v: number, z: number, flip = false): void {
  P.late.push(() => {
    const pal = palOf(P.st);
    const x0 = Math.floor(P.px.X(u, v));
    const y0 = Math.floor(P.px.Y(u, v, z));
    for (let r = 0; r < WEB.length; r++)
      for (let c = 0; c < WEB[r]!.length; c++) if (WEB[r]![c] === 'Z' && hash(r, c, Math.floor(u)) > 0.1) P.px.set(x0 + (flip ? -c : c), y0 + r, pal.Z!);
  });
}

/** Dead ivy hanging in curtains from a wall top: returns a colour, or 0 where the wall shows. */
export function ivyAt(along: number, zz: number, h: number, k: number, density: number, seed: number): Col {
  const x = Math.floor(along * k);
  const y = Math.floor((h - zz) * k);
  if (y < 0) return 0;
  // Strands three pixels wide, each with its own length; neighbours merge into curtains.
  const sx0 = Math.floor(x / 3);
  const n = hash(sx0, 0, seed);
  if (n > density) return 0;
  const len = (0.25 + hash(sx0, 1, seed) * 0.65) * h * k;
  const ragged = hash(x, Math.floor(y / 2), seed + 2) * 4;
  if (y > len - ragged) return 0;
  const cell = hash(x >> 1, y >> 1, seed + 3);
  if (cell < 0.18) return 0;
  // Chunky clusters lit from the upper left; withered violet and dry brown in the shade.
  const lit = (x % 3 === 0 ? 0.2 : 0) + (1 - y / len) * 0.4 + cell * 0.4;
  return lit > 0.75 ? IVY[0]! : lit > 0.52 ? IVY[1]! : cell > 0.9 ? IVY[3]! : IVY[2]!;
}
const IVY = [hex('#9a9462'), hex('#6c6a44'), hex('#44422e'), hex('#5e4866')];

/** A well: a ring of stone, a timber frame and windlass, its lid chained shut. */
export function well(P: Pt, u: number, v: number): void {
  const p = palOf(P.st);
  const cu = u + 3;
  const cv = v + 3;
  // The ring: coursed stone, moss low.
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2;
    const bu = cu + Math.cos(a0) * 3;
    const bv = cv + Math.sin(a0) * 3;
    box(P.px, bu - 0.6, bv - 0.6, 0, 1.2, 1.2, 3, (f, _s, t) => (f === 'top' ? p.S! : t < 0.7 ? (f === 'left' ? p.M! : p.m!) : f === 'left' ? (i % 2 ? p.S! : p.s!) : (i % 2 ? p.d! : p.e!)));
  }
  // The lid: planks, banded and chained.
  box(P.px, cu - 2.6, cv - 2.6, 3, 5.2, 5.2, 0.6, (f, s) => (f === 'top' ? (Math.floor(s * 2) % 3 === 0 ? p.v! : p.w!) : p.x!));
  for (const a of [-1.2, 1.2]) line3(P.px, v3(cu - 2.8, cv + a, 3.7), v3(cu + 2.8, cv + a, 3.7), p.I!);
  line3(P.px, v3(cu - 2.6, cv - 2.6, 3.75), v3(cu + 2.6, cv + 2.6, 3.75), p.i!);
  stamp(P, cu + 1.4, cv + 1.4, 3.6, ['.ii.', 'iIIi', 'iIIi', '.ii.'], { dz: 1 });
  // Posts and the windlass.
  for (const dv of [-3.4, 3.4]) post(P.px, cu, cv + dv, 0, 9, p.w!, p.v!);
  line3(P.px, v3(cu, cv - 3.4, 8), v3(cu, cv + 3.4, 8), p.W!);
  line3(P.px, v3(cu, cv - 3.4, 7.6), v3(cu, cv + 3.4, 7.6), p.v!);
  line3(P.px, v3(cu, cv + 3.4, 8), v3(cu + 1.4, cv + 3.6, 6.6), p.I!);
  // A little roof of slates.
  box(P.px, cu - 1.4, cv - 4.2, 9, 2.8, 8.4, 0.5, (f) => (f === 'top' ? P.st.slate[1] : P.st.slate[2]));
}

/** A cart of the dead: two wheels, sides of rotten board, a shroud over the load, feet showing. */
export function corpseCart(P: Pt, u: number, v: number): void {
  const p = palOf(P.st);
  // The bed and sides.
  box(P.px, u, v, 2.2, 7, 4, 2, (f, s, t) => (f === 'top' ? p.v! : Math.floor(t * 2) === 2 ? p.x! : f === 'left' ? (Math.floor(s * 2) % 4 === 0 ? p.v! : p.w!) : p.v!));
  // The load under the shroud: lumps.
  for (let i = 0; i < 4; i++) box(P.px, u + 0.6 + i * 1.6, v + 0.6, 4.2, 1.5, 2.8, 0.8 + hash(i, 4) * 0.8, (f) => (f === 'top' ? p.T! : f === 'left' ? p.T! : p.u!));
  // Bare feet out of the back, an arm over the side.
  stamp(P, u + 0.1, v + 2, 4.6, ['bB.', 'kbB'], { dz: 1 });
  stamp(P, u + 4, v + 4.1, 3.2, ['T.', 'b.', 'bk', '.k'], { dz: 1 });
  // Wheels: spoked iron-shod rings.
  for (const wu of [u + 2]) {
    const cx = wu;
    const cz = 2.2;
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      P.px.point(v3(cx + Math.cos(ang) * 2, v + 4.2, cz + Math.sin(ang) * 2), a % 6 === 0 ? p.I! : p.i!);
    }
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + 0.4;
      line3(P.px, v3(cx, v + 4.2, cz), v3(cx + Math.cos(ang) * 1.8, v + 4.2, cz + Math.sin(ang) * 1.8), p.w!);
    }
  }
  // The shafts, resting on the ground.
  line3(P.px, v3(u + 7, v + 0.5, 3), v3(u + 12, v + 0.5, 0.4), p.w!);
  line3(P.px, v3(u + 7, v + 3.5, 3), v3(u + 12, v + 3.5, 0.4), p.w!);
}

// ------------------------------------------------------------------ the ground

/**
 * Ground detail laid as a decal: cracked flagstones with weeds in the joints, bone-strewn dirt,
 * dead grass, and pools of sickly light under the lanterns dappled by the shadows of dead
 * branches. A decal pixel falls into the dark at night like the ground (light class 3), except
 * the light pools, which keep their value (class 1): by night they are the brightest ground.
 */
export class Decal {
  constructor(readonly P: Painter) {}
  set(x: number, y: number, c: Col, k = 3): void {
    this.P.px.set(x, y, c);
    cls(this.P, x, y, k);
  }
  /** A world point's buffer pixel. */
  at(u: number, v: number): [number, number] {
    return [Math.floor(this.P.px.X(u, v)), Math.floor(this.P.px.Y(u, v))];
  }
  /** Visit the buffer pixels over a world ellipse: fn gets the pixel and the world point. */
  ellipse(cu: number, cv: number, ru: number, rv: number, fn: (x: number, y: number, u: number, v: number, r: number) => void): void {
    const px = this.P.px;
    const xs = [px.X(cu - ru, cv), px.X(cu + ru, cv), px.X(cu, cv - rv), px.X(cu, cv + rv)];
    const ys = [px.Y(cu - ru, cv - rv), px.Y(cu + ru, cv + rv)];
    for (let y = Math.floor(Math.min(...ys)) - 1; y <= Math.ceil(Math.max(...ys)) + 1; y++)
      for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)) + 1; x++) {
        const [u, v] = px.ground(x, y);
        const r = Math.hypot((u - cu) / ru, (v - cv) / rv);
        if (r <= 1) fn(x, y, u, v, r);
      }
  }
}

/**
 * The decal as an Art. Its night is not the buildings' rig (which rims every pixel with sky above
 * it, and a decal is all edges): it falls by the ground's own night multiply, except the light
 * pools (class 1), which keep their value and so become the brightest ground after dark.
 */
export function decalArt(P: Painter, depth: number): Art {
  const px = P.px;
  const b = px.bounds();
  if (!b) return { canvas: null, lights: null, x: 0, y: 0, d: depth };
  const [x0, y0, x1, y1] = b;
  const canvas = px.toCanvas(x0, y0, x1, y1);
  const night = document.createElement('canvas');
  night.width = x1 - x0;
  night.height = y1 - y0;
  const g = night.getContext('2d')!;
  const img = g.createImageData(night.width, night.height);
  const out = new Uint32Array(img.data.buffer);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * px.w + x;
      const c = px.data[i]!;
      if (!c) continue;
      const keep = px.cls[i] === 1;
      const [r, gg, bb] = keep ? [0.95, 1, 0.98] : [0.72, 0.72, 0.82];
      out[(y - y0) * night.width + (x - x0)] = rgb(R(c) * r, G(c) * gg, B(c) * bb);
    }
  g.putImageData(img, 0, 0);
  return { canvas, lights: null, night, x: x0, y: y0, d: depth };
}

/** Flagstones as irregular slabs (angrysnail's CC0 path): a slab's tone, its joints and cracks. */
function flagAt(u: number, v: number, seed: number): { slab: number; joint: boolean; crack: boolean; weed: boolean } {
  const row = Math.floor(v / 3.2);
  const off = hash(row, 0, seed) * 4;
  const w = 3.6 + hash(row, 1, seed) * 1.6;
  const col = Math.floor((u + off) / w);
  const lu = (u + off) - col * w;
  const lv = v - row * 3.2;
  const slab = hash(col, row, seed);
  const joint = lu < 0.5 || lv < 0.5;
  const crack = slab < 0.22 && Math.abs(lu - lv * (w / 3.2) * (slab < 0.11 ? 1 : -1) - (slab < 0.11 ? 0 : w)) < 0.35;
  const weed = joint && hash(Math.floor(u * 2), Math.floor(v * 2), seed + 4) < 0.16;
  return { slab, joint, crack, weed };
}

/** A pool of witchfire light on flagstones, crossed by the shadows of dead branches. */
export function lightPool(D: Decal, cu: number, cv: number, r: number, seed: number, flags: boolean): void {
  const lit = [hex('#8e9a9c'), hex('#7a8690'), hex('#9cae9e'), hex('#6a7484')];
  const dim = [hex('#646478'), hex('#585a70'), hex('#6c7080'), hex('#4e4e64')];
  // Branch shadows: a few crooked bands across the pool.
  const bands: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) bands.push([hash(i, seed, 1) * Math.PI, (hash(i, seed, 2) - 0.5) * r * 1.2, 0.35 + hash(i, seed, 3) * 0.5]);
  D.ellipse(cu, cv, r, r * 0.8, (x, y, u, v, rr) => {
    // Ragged edge: the pool breaks up in blobs toward its rim (no smooth circle).
    if (rr > 0.65 && hash(x >> 2, y >> 1, seed + 9) < (rr - 0.65) * 2.6) return;
    let shade = false;
    for (const [a, o, w] of bands) {
      const d = (u - cu) * Math.cos(a) + (v - cv) * Math.sin(a) - o + Math.sin((u + v) * 0.9 + a * 3) * 0.6;
      if (Math.abs(d) < w) shade = true;
    }
    const ring = rr < 0.45 ? 0 : 1;
    const ramp = shade ? dim : ring ? dim : lit;
    let c: Col;
    if (flags) {
      const f = flagAt(u, v, seed);
      c = f.joint || f.crack ? tone(ramp[3]!, 0.25) : ramp[Math.floor(f.slab * 3)]!;
      if (f.weed && !shade) c = hex('#5c6a4a');
    } else c = ramp[hash(x >> 1, y >> 1, seed) < 0.6 ? 0 : 1]!;
    if (!shade && ring === 0) c = mix(c, hex('#b4ffa0'), 0.12);
    D.set(x, y, c, shade ? 3 : 1);
  });
}

/** Cracks, weeds and lifted slabs over a stretch of the flagged yard. */
export function crackedFlags(D: Decal, u0: number, v0: number, u1: number, v1: number, seed: number): void {
  const px = D.P.px;
  const xs = [px.X(u0, v0), px.X(u1, v0), px.X(u0, v1), px.X(u1, v1)];
  const ys = [px.Y(u0, v0), px.Y(u1, v0), px.Y(u0, v1), px.Y(u1, v1)];
  const weed = [hex('#4e5a40'), hex('#3a4434'), hex('#66704e')];
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const [u, v] = px.ground(x, y);
      if (u < u0 || u >= u1 || v < v0 || v >= v1) continue;
      // The yard's own flags are 5×4; follow their joints.
      const lu = u % 5;
      const lv = v % 4;
      const fu = Math.floor(u / 5);
      const fv = Math.floor(v / 4);
      const n = hash(fu, fv, seed);
      // A crack across some slabs.
      if (n < 0.3 && Math.abs(lu * 0.8 - lv - (n < 0.15 ? 0 : 1)) < 0.18) D.set(x, y, hex('#2e2c3c'));
      // Weeds and dead grass in the joints.
      else if ((lu < 0.6 || lv < 0.6) && hash(x >> 1, y, seed + 1) < 0.22) D.set(x, y, weed[hash(x, y >> 1, seed + 2) < 0.6 ? 0 : 1]!);
      // A sunk slab, dark.
      else if (n > 0.95 && lu > 0.6 && lv > 0.6) D.set(x, y, hex('#3e3c50'));
    }
  // Tufts of dead grass standing up out of the joints.
  for (let i = 0; i < (u1 - u0) * (v1 - v0) / 22; i++) {
    const u = u0 + hash(i, seed, 5) * (u1 - u0);
    const v = v0 + hash(i, seed, 6) * (v1 - v0);
    const [x, y] = D.at(Math.floor(u / 5) * 5, v);
    D.set(x, y, weed[2]!, 2);
    D.set(x + 1, y - 1, weed[0]!, 2);
    D.set(x - 1, y - 1, weed[1]!, 2);
    D.set(x, y - 2, weed[2]!, 2);
  }
}

/**
 * The drill yard's trodden ground: black puddles with a rim of mud that hold a sliver of sky,
 * scattered stones, a dropped bone, tufts of dead grass where feet seldom go.
 */
export function trodden(D: Decal, u0: number, v0: number, u1: number, v1: number, seed: number): void {
  const pal = palOf(D.P.st);
  for (let i = 0; i < 9; i++) {
    const cu = u0 + 6 + hash(i, seed, 1) * (u1 - u0 - 12);
    const cv = v0 + 6 + hash(i, seed, 2) * (v1 - v0 - 12);
    const ru = 2 + hash(i, seed, 3) * 3;
    D.ellipse(cu, cv, ru, ru * 0.6, (x, y, u, v, r) => {
      if (r > 0.8 && hash(x >> 1, y, seed + i) < 0.5) return;
      // Water: black-violet, its far edge catching the sky (a light line at the top).
      const sky = v - cv < -ru * 0.3 && u - cu < 0 && r > 0.55 && r < 0.8;
      D.set(x, y, r > 0.82 ? pal.O! : sky ? hex('#6c6890') : hex('#1c1a28'), sky ? 1 : 3);
    });
  }
  for (let i = 0; i < (u1 - u0) * (v1 - v0) / 30; i++) {
    const [x, y] = D.at(u0 + hash(i, seed, 5) * (u1 - u0), v0 + hash(i, seed, 6) * (v1 - v0));
    const n = hash(i, seed, 7);
    if (n < 0.5) {
      // A stone: lit top-left, a dark under-edge.
      D.set(x, y, hex('#6a6880'), 2);
      D.set(x + 1, y, hex('#545268'), 2);
      D.set(x, y + 1, hex('#2a2834'));
      D.set(x + 1, y + 1, hex('#2a2834'));
    } else if (n < 0.62) {
      D.set(x, y, pal.B!, 2);
      D.set(x + 1, y, pal.b!, 2);
      D.set(x + 2, y, pal.k!, 2);
    } else if (n < 0.8) {
      // Ruts and scuffs: a short dark dash.
      D.set(x, y, hex('#2c2a38'));
      D.set(x + 1, y, hex('#2c2a38'));
      D.set(x + 2, y, hex('#36344a'));
    }
  }
}

/** Dirt strewn with bones and dead grass. */
export function boneDirt(D: Decal, cu: number, cv: number, ru: number, rv: number, seed: number): void {
  const pal = palOf(D.P.st);
  D.ellipse(cu, cv, ru, rv, (x, y, _u, _v, r) => {
    const n = hash(x >> 1, y, seed);
    if (r > 0.7 && hash(x >> 2, y >> 1, seed + 1) < (r - 0.7) * 3) return;
    D.set(x, y, n < 0.55 ? pal.D! : n < 0.85 ? pal.O! : hex('#46424e'));
  });
  for (let i = 0; i < ru * rv * 0.5; i++) {
    const a = hash(i, seed, 2) * Math.PI * 2;
    const r = Math.sqrt(hash(i, seed, 3)) * 0.85;
    const [x, y] = D.at(cu + Math.cos(a) * ru * r, cv + Math.sin(a) * rv * r);
    const kind = hash(i, seed, 4);
    if (kind < 0.35) {
      // A long bone, two pixels of knob at each end.
      D.set(x, y, pal.b!, 2);
      D.set(x + 1, y, pal.B!, 2);
      D.set(x + 2, y, pal.B!, 2);
      D.set(x + 3, y, pal.k!, 2);
    } else if (kind < 0.5) {
      D.set(x, y, pal.B!, 2);
      D.set(x + 1, y, pal.b!, 2);
      D.set(x, y + 1, pal.k!, 2);
      D.set(x + 1, y + 1, pal.K!, 2);
    } else {
      // Dead grass.
      D.set(x, y, hex('#6a6448'), 2);
      D.set(x + 1, y - 1, hex('#4e4a3a'), 2);
      D.set(x - 1, y - 1, hex('#5a5640'), 2);
    }
  }
}

// ------------------------------------------------------------------ placement

const clearOf = (u: number, v: number, m = 7) => roadDistance(u, v) > m;

/**
 * The light sources and the ground, by the town's tier (the clutter itself is the prop library's):
 * the yard's cracked flags, bone-strewn dirt and light pools as one decal; dead trees with crows
 * whose branches dapple those pools; witchfire lanterns along the ways; braziers at the keep and
 * the gate. Each group is finished as its own Art.
 */
export function yardProps(P: Painter, tier: number, parts: BuildingParts, finish: (d: number, outline?: boolean) => void): void {
  // The ground decal first, below everything (but over the ground).
  const rim = P.rim;
  P.rim = null;
  const D = new Decal(P);
  crackedFlags(D, 56, 22, 80, 60, 5);
  crackedFlags(D, 76, 46, 142, 60, 6);
  lightPool(D, 74, 52, 9, 3, true);
  lightPool(D, 128, 56, 8, 4, true);
  if (tier >= 2) lightPool(D, 160, 120, 8, 8, false);
  if (tier >= 2) lightPool(D, WALL - 18, GATE_V, 9, 9, false);
  boneDirt(D, 104, 140, 10, 6, 11);
  if (tier >= 3) boneDirt(D, 186, 196, 9, 6, 12);
  boneDirt(D, 60, 120, 6, 5, 13);
  trodden(D, 86, 70, 150, 148, 14);
  parts.arts.push(decalArt(P, -1000));
  P.reset();
  P.rim = rim;

  // The well's lantern.
  lanternPost(P, 71, 58, 10);
  finish(71 + 58);
  // Dead trees with crows over the light pools: their limbs are what dapples them. Trees are not
  // outlined (as the ground's trees are not): an outlined one-pixel twig is a black lattice.
  for (const [u, v, h, s] of [[70, 50, 22, 1], [134, 58, 18, 2], [156, 128, 20, 3]] as const) {
    if (tier < 2 && s > 2) continue;
    deadTree(P, u, v, h, s, 1 + (s % 2));
    finish(u + v, false);
  }
  // Lanterns along the ways.
  const lamps: [number, number][] = [[112, 70], [150, 104], [118, 150], [182, 120], [212, 112]];
  for (const [u, v] of lamps.slice(0, 2 + tier)) {
    if (!clearOf(u, v, 4)) continue;
    lanternPost(P, u, v, 9);
    finish(u + v);
  }
  // Braziers flanking the keep's door and, later, the gate; a shrine's candles by the chapel.
  for (const [u, v] of [[62, 32], [62, 46]] as const) {
    brazier(P, u, v);
    finish(u + v);
  }
  if (tier >= 2)
    for (const v of [GATE_V - 12, GATE_V + 12]) {
      brazier(P, WALL - 16, v);
      finish(WALL - 16 + v);
    }
  shrine(P, 86, 66);
  finish(86 + 66 + 4);
}

/** A wayside shrine: a little gabled niche with a skull, candles burning before it, a wreath. */
export function shrine(P: Pt, u: number, v: number): void {
  const p = palOf(P.st);
  box(P.px, u, v, 0, 2.5, 3, 6, (f, _s, t) => (f === 'top' ? p.s! : t < 1 ? (f === 'left' ? p.M! : p.m!) : f === 'left' ? p.S! : p.d!));
  box(P.px, u + 2.45, v + 0.6, 2.4, 0.1, 1.8, 2.6, () => p.Q!, false);
  stamp(P, u + 2.6, v + 1.5, 2.6, ['.BB.', 'BkkK'], { dz: 1 });
  box(P.px, u - 0.4, v - 0.4, 6, 3.3, 3.8, 0.6, (f) => (f === 'top' ? P.st.slate[1] : P.st.slate[2]));
  candles(P, u + 4.2, v + 1.8, 0, Math.floor(u));
  wreath(P, u + 2.6, v + 1.5, 4.8);
}

/** A family plot: iron railings round a little square, two headstones and an angel or obelisk. */
export function plot(P: Pt, u: number, v: number, n: number): void {
  headstone(P, u + 3, v + 2.5, (n * 7) % 0.6, Math.floor(n * 997));
  headstone(P, u + 7, v + 2.5, (n * 13) % 0.6, Math.floor(n * 991));
  if (n < 0.5) angel(P, u + 5, v + 5.5, n < 0.25);
  else stamp(P, u + 5, v + 5.5, 0, OBELISK, { sub: subFor(P, n < 0.75 ? 1 : 2) });
  railing(P, u, v, u + 10, v, 3.6);
  railing(P, u, v, u, v + 8, 3.6);
  railing(P, u + 10, v, u + 10, v + 8, 3.6);
  railing(P, u, v + 8, u + 10, v + 8, 3.6, true);
}

/** A spade stood in a heap of turned earth. */
export function spade(P: Pt, u: number, v: number): void {
  const p = palOf(P.st);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    box(P.px, u + 1.5 + Math.cos(a) * 0.8 - 0.5, v + 1.5 + Math.sin(a) * 0.8 - 0.5, 0, 1, 1, 0.6 + (i % 3) * 0.2, (f) => (f === 'top' ? p.D! : p.O!));
  }
  stamp(P, u + 1.6, v + 1.6, 0.6, SHOVEL, { lean: -0.15, dz: 1 });
}

/**
 * The grave fields outside the walls, richer than the ground's plain markers: every marker
 * redrawn over the ground's own (varied kinds, black and marble and grey, leaning, cracked, some
 * with flowers or a wreath), with open graves, coffins waiting, bone heaps, Celtic crosses and
 * angels in the gaps between rows. One Art per row, so the dead sort with the living.
 */
export function graveFields(P: Painter, sown: number, finish: (d: number, outline?: boolean) => void): void {
  for (let fi = 0; fi < Math.min(sown, FIELDS.length); fi++) {
    const f = FIELDS[fi]!;
    let row = 0;
    for (let v = f[1] + 1; v < f[3] - 3; v += 8, row++) {
      for (let u = f[0] + 2.5; u < f[2] - 3; u += 6) {
        const n = hash(Math.floor(u), Math.floor(v), 41);
        if (n < 0.12) continue;
        const m = hash(Math.floor(u), Math.floor(v), 43);
        headstone(P, u + 0.5, v + 1.25, m, Math.floor(u * 7 + v * 13));
      }
      // The gap after the row: open graves, coffins, bones, a lantern, an angel.
      const gv = v + 4.6;
      if (gv > f[3] - 3) continue;
      for (let u = f[0] + 4; u < f[2] - 6; u += 9) {
        const n = hash(Math.floor(u), Math.floor(gv), 47 + fi);
        if (n < 0.1) openGrave(P, u, gv - 1, Math.floor(u + gv));
        else if (n < 0.16) coffin(P, u, gv, 0, true, n < 0.13);
        else if (n < 0.24) bones(P, u, gv + 1, n < 0.2, Math.floor(u));
        else if (n < 0.255) angel(P, u + 1, gv + 1, n < 0.25);
        else if (n < 0.3) candles(P, u, gv + 1, 0, Math.floor(u));
      }
      finish((f[0] + f[2]) / 2 + v + 2);
    }
  }
}

// ------------------------------------------------------------------ the prop library

/**
 * Paint a prop for the shared library: the library hands a bare buffer, so wrap it as a painter,
 * keep light hooks off (they belong to the building kits), and lay any after-outline work at once.
 */
function lib(draw: (P: Pt, a: PropAt) => void): (a: PropAt) => void {
  return (a) => {
    const prev = sink;
    sink = null;
    const P: Pt = { px: a.px, st: a.st, k: a.px.k, glass: [], late: [] };
    try {
      draw(P, a);
      for (const f of P.late) f();
    } finally {
      sink = prev;
    }
  };
}
const seedOf = (a: PropAt) => Math.floor(a.n * 100000);

registerProp('undead:grave', { lu: 3, lv: 3, h: 4, draw: lib((P, a) => headstone(P, a.u + 1.5, a.v + 1.5, a.n, seedOf(a))) });
registerProp('undead:graves', {
  lu: 10, lv: 4, h: 4,
  draw: lib((P, a) => {
    for (let i = 0; i < 3; i++) headstone(P, a.u + 1.5 + i * 3.4, a.v + 1.5 + (i % 2) * 0.8, hash(seedOf(a), i, 3), seedOf(a) + i);
  }),
});
registerProp('undead:openGrave', { lu: 6, lv: 7, h: 2, draw: lib((P, a) => openGrave(P, a.u + 0.3, a.v + 0.5, seedOf(a))) });
registerProp('undead:coffin', { lu: 4.6, lv: 1.8, h: 1.3, draw: lib((P, a) => coffin(P, a.u, a.v, 0, true, a.n < 0.3)) });
registerProp('undead:coffinV', { lu: 1.8, lv: 4.6, h: 1.3, draw: lib((P, a) => coffin(P, a.u, a.v, 0, false, a.n < 0.3)) });
registerProp('undead:coffins', { lu: 4.6, lv: 6, h: 3.6, draw: lib((P, a) => coffinStack(P, a.u, a.v, 3 + Math.floor(a.n * 4), true)) });
registerProp('undead:bones', { lu: 3, lv: 2, h: 1, draw: lib((P, a) => bones(P, a.u + 1.5, a.v + 1, false, seedOf(a))) });
registerProp('undead:skulls', { lu: 4, lv: 3, h: 2, draw: lib((P, a) => bones(P, a.u + 2, a.v + 1.5, true, seedOf(a))) });
registerProp('undead:cart', { lu: 13, lv: 5, h: 6, draw: lib((P, a) => corpseCart(P, a.u, a.v)) });
registerProp('undead:sarcophagus', { lu: 5.6, lv: 3.2, h: 3.3, draw: lib((P, a) => sarcophagus(P, a.u + 0.3, a.v + 0.3, true)) });
registerProp('undead:angel', { lu: 4, lv: 4, h: 10, draw: lib((P, a) => angel(P, a.u + 2, a.v + 2, a.n < 0.5)) });
registerProp('undead:obelisk', { lu: 3, lv: 3, h: 8, draw: lib((P, a) => stamp(P, a.u + 1.5, a.v + 1.5, 0, OBELISK, { sub: subFor(P, a.n < 0.4 ? 1 : a.n > 0.7 ? 2 : 0) })) });
registerProp('undead:deadTree', { lu: 4, lv: 4, h: 14, draw: lib((P, a) => deadTree(P, a.u + 2, a.v + 2, 12 + a.n * 8, seedOf(a), a.n < 0.6 ? 1 : 2)) });
registerProp('undead:gibbet', { lu: 2, lv: 8, h: 16, draw: lib((P, a) => gibbet(P, a.u + 1, a.v + 1, 15)) });
registerProp('undead:shrine', { lu: 7, lv: 4, h: 7, draw: lib((P, a) => shrine(P, a.u + 0.4, a.v + 0.4)) });
registerProp('undead:candles', { lu: 3, lv: 2, h: 2, draw: lib((P, a) => candles(P, a.u + 1.5, a.v + 1, 0, seedOf(a))) });
registerProp('undead:railing', { lu: 12, lv: 1, h: 5, draw: lib((P, a) => railing(P, a.u, a.v + 0.5, a.u + 12, a.v + 0.5)) });
registerProp('undead:railingV', { lu: 1, lv: 12, h: 5, draw: lib((P, a) => railing(P, a.u + 0.5, a.v, a.u + 0.5, a.v + 12)) });
registerProp('undead:plot', { lu: 10.4, lv: 8.4, h: 9, draw: lib((P, a) => plot(P, a.u + 0.2, a.v + 0.2, a.n)) });
registerProp('undead:spade', { lu: 3, lv: 3, h: 4, draw: lib((P, a) => spade(P, a.u, a.v)) });
registerProp('undead:well', { lu: 6.6, lv: 6.6, h: 9, draw: lib((P, a) => well(P, a.u, a.v)) });
registerProp('undead:lantern', {
  lu: 2, lv: 3, h: 10,
  draw: lib((P, a) => {
    lanternPost(P, a.u + 1, a.v + 0.5, 9);
    a.lights.push(v3(a.u + 1, a.v + 2.1, 6.5));
  }),
});

const GR = (w: number, items: [string, number, number][], tier = 1): Group => ({ w, items, tier });
registerTheme('undead', {
  groups: {
    wall: [
      GR(3, [['undead:coffins', 0, 0]]),
      GR(2, [['undead:coffin', 0, 0.2], ['undead:bones', 5.2, 0]]),
      GR(2, [['undead:skulls', 0, 0]]),
      GR(1, [['undead:coffinV', 0, 0], ['undead:coffinV', 2.4, 0.3]]),
      GR(1, [['undead:cart', 0, 0.4]], 2),
      GR(1, [['undead:bones', 0, 0], ['undead:spade', 3.6, 0]]),
    ],
    door: [GR(3, [['undead:candles', 0, 0]]), GR(2, [['undead:shrine', 0, 0]], 2), GR(1, [['undead:skulls', 0, 0]]), GR(2, [['undead:lantern', 0, 0]], 2)],
    road: [
      GR(2, [['undead:deadTree', 0, 0]]),
      GR(2, [['undead:graves', 0, 0]]),
      GR(1, [['undead:railing', 0, 0]]),
      GR(1, [['undead:gibbet', 0, 0]], 2),
      GR(1, [['undead:angel', 0, 0]], 3),
      GR(1, [['undead:obelisk', 0, 0]], 2),
      GR(2, [['undead:lantern', 0, 0]], 3),
    ],
    yard: [GR(3, [['undead:graves', 0, 0]]), GR(2, [['undead:openGrave', 0, 0]]), GR(1, [['undead:plot', 0, 0]], 2), GR(1, [['undead:sarcophagus', 0, 0]], 3), GR(2, [['undead:bones', 0, 0]]), GR(1, [['undead:deadTree', 0, 0]])],
    market: [
      GR(2, [['undead:cart', 0, 0]]),
      GR(2, [['undead:coffins', 0, 0], ['undead:coffins', 5.4, 0.4]]),
      GR(1, [['undead:shrine', 0, 0]]),
      GR(1, [['undead:sarcophagus', 0, 0], ['undead:candles', 6.4, 0.2]], 2),
    ],
  },
  near: {
    granary: [GR(3, [['undead:coffins', 0, 0]]), GR(2, [['undead:cart', 0, 0.5]], 2), GR(2, [['undead:skulls', 0, 0]]), GR(1, [['undead:coffin', 0, 0], ['undead:coffin', 0, 2.2]])],
    hospital: [GR(3, [['undead:coffins', 0, 0]]), GR(2, [['undead:cart', 0, 0.5]], 2), GR(1, [['undead:bones', 0, 0], ['undead:spade', 3.6, 0]]), GR(1, [['undead:openGrave', 0, 0.5]])],
    chapter: [GR(2, [['undead:plot', 0, 0.5]], 2), GR(3, [['undead:graves', 0, 0.5]]), GR(2, [['undead:angel', 0, 0]], 2), GR(1, [['undead:sarcophagus', 0, 0]], 3), GR(2, [['undead:candles', 0, 0]])],
    workshop: [GR(3, [['undead:coffins', 0, 0]]), GR(2, [['undead:coffin', 0, 0], ['undead:coffinV', 5.4, 0]]), GR(1, [['undead:skulls', 0, 0]])],
    barracks: [GR(3, [['undead:skulls', 0, 0]]), GR(2, [['undead:bones', 0, 0], ['undead:bones', 3.6, 0.4]]), GR(1, [['undead:coffin', 0, 0]])],
    stables: [GR(3, [['undead:bones', 0, 0]]), GR(1, [['undead:skulls', 0, 0]])],
    keep: [GR(2, [['undead:skulls', 0, 0]]), GR(2, [['undead:candles', 0, 0]]), GR(1, [['undead:angel', 0, 0]], 3)],
    range: [GR(3, [['undead:bones', 0, 0]]), GR(2, [['undead:skulls', 0, 0]])],
    walls: [GR(2, [['undead:bones', 0, 0]]), GR(1, [['undead:gibbet', 0, 0]]), GR(1, [['undead:skulls', 0, 0]]), GR(1, [['undead:deadTree', 0, 0]])],
  },
  // Outside the gate, where the Templars hold a fair, the dead are bought and sold.
  market: [[262, 103], [276, 104], [290, 103], [262, 128], [278, 129], [294, 128], [304, 104], [308, 130], [200, 124]],
  fixed: [['undead:well', 75.7, 63.7, 1]],
});
