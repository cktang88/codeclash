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
import { B, box, css, G, hash, hex, line3, mix, OX, OY, post, Px, R, rgb, sx, sy, tone, v3, type Col, type Facing } from './pixels.ts';
import { isoOff, registerProp, registerTheme, type Group, type PropAnim, type PropAt } from './props.ts';
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

/**
 * A light source for the necropolis's baked light (the user's town-displate: light shows as pools
 * on the surfaces it reaches, not as discs floating over the scene). `r` is its reach in world
 * units, `tint` the colour it lifts surfaces toward.
 */
export interface Light {
  u: number;
  v: number;
  z: number;
  r: number;
  tint: Col;
}
export const GREEN_LIGHT = hex('#a8f08c');
export const VIOLET_LIGHT = hex('#b494f0');

/** The parts being painted (for the live witchfire flames). */
let sink: BuildingParts | null = null;
export function setSink(p: BuildingParts | null): void {
  sink = p;
}
/** The lights gathered while a building kit paints (null outside a kit: props add none). */
let gathered: Light[] | null = null;
export function beginLights(): Light[] {
  gathered = [];
  return gathered;
}
export function endLights(): void {
  gathered = null;
}
/** A light source: 0 grave-light green, 1 arcane violet. */
export function glow(u: number, v: number, z: number, kind: 0 | 1, r = 9): void {
  gathered?.push({ u, v, z, r, tint: kind ? VIOLET_LIGHT : GREEN_LIGHT });
}
/** A live witchfire flame (city.ts draws it flickering) that also lights what is round it. */
export function flame(u: number, v: number, z: number): void {
  glow(u, v, z, 0, 12);
  if (sink) sink.torches.push([Math.floor(sx(u, v)), Math.floor(sy(u, v, z))]);
}
/** A building's torch: a live flame, and its light. */
export function torch(parts: BuildingParts, u: number, v: number, z: number): void {
  parts.torches.push([Math.floor(sx(u, v)), Math.floor(sy(u, v, z))]);
  glow(u, v, z, 0, 11);
}

/**
 * Bake light pools into what a kit painted: each pixel near a source is lifted up its ramp toward
 * the light's tint, by how near it is (two steps, their border broken in 2×2 clusters, so never a
 * ring), unless something stands between it and the source. A pixel's world point comes back from
 * its depth (u + v + z) and screen place; occlusion is a short march back toward the source that
 * looks for anything painted nearer the viewer than the ray. Lifted pixels take light class 1, so
 * at night they keep their value while the rest of the stone falls into violet shade.
 */
export function bakePools(P: Pt, ls: readonly Light[]): void {
  const px = P.px;
  const k = px.k;
  const { w, h, data, depth } = px;
  const cl = px.cls;
  for (const L of ls) {
    const X = px.X(L.u, L.v);
    const Y = px.Y(L.u, L.v, L.z);
    const rx = L.r * 2 * k;
    const ry = L.r * 1.7 * k;
    for (let y = Math.max(0, Math.floor(Y - ry)); y < Math.min(h, Math.ceil(Y + ry)); y++)
      for (let x = Math.max(0, Math.floor(X - rx)); x < Math.min(w, Math.ceil(X + rx)); x++) {
        const i = y * w + x;
        const c = data[i]!;
        if (!c || cl[i] === 4) continue;
        const d = depth[i]!;
        if (d < -1e8) continue;
        const Sx = (x + 0.5) / k - px.mx - OX;
        const Sy = (y + 0.5) / k - px.my - OY;
        const b = ((Sy + d) * 2) / 3;
        const z = d - b;
        const u = (b + Sx) / 2;
        const v = (b - Sx) / 2;
        const dist = Math.hypot(u - L.u, v - L.v, (z - L.z) * 0.8);
        const a = 1 - dist / L.r + (hash(x >> 1, y >> 1, 61) - 0.5) * 0.3;
        if (a <= 0.12) continue;
        let hidden = false;
        for (let s = 2; s < 5 && !hidden; s++) {
          const t = s / 5;
          const qu = L.u + (u - L.u) * t;
          const qv = L.v + (v - L.v) * t;
          const qz = L.z + (z - L.z) * t;
          const qx = Math.floor(px.X(qu, qv));
          const qy = Math.floor(px.Y(qu, qv, qz));
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const j = qy * w + qx;
          if (data[j] && depth[j]! > qu + qv + qz + 1.5) hidden = true;
        }
        if (hidden) continue;
        data[i] = a > 0.55 ? tone(mix(c, L.tint, 0.42), -0.18) : tone(mix(c, L.tint, 0.24), -0.06);
        cl[i] = 1;
      }
  }
}

/**
 * The lights' pools on the ground, as a translucent decal under everything (so a building drawn
 * over it hides the part its walls would shade): an irregular patch, two steps of the light's
 * tint broken in 2×2 clusters, faint by day and strong by night.
 */
export function groundPools(P: Pt, ls: readonly Light[], depthKey = -999): Art {
  const px = P.px;
  const k = px.k;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const L of ls) {
    const X = px.X(L.u, L.v);
    const Y = px.Y(L.u, L.v, 0);
    x0 = Math.min(x0, X - L.r * 2.4 * k);
    x1 = Math.max(x1, X + L.r * 2.4 * k);
    y0 = Math.min(y0, Y - L.r * 1.3 * k);
    y1 = Math.max(y1, Y + L.r * 1.3 * k);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(px.w, Math.ceil(x1));
  y1 = Math.min(px.h, Math.ceil(y1));
  if (!ls.length || x1 <= x0 || y1 <= y0) return { canvas: null, lights: null, x: 0, y: 0, d: depthKey };
  const W = x1 - x0;
  const H = y1 - y0;
  const lvl = new Uint8Array(W * H);
  const tint = new Uint32Array(W * H);
  for (const L of ls) {
    const X = px.X(L.u, L.v);
    const Y = px.Y(L.u, L.v, 0);
    for (let y = Math.max(y0, Math.floor(Y - L.r * 1.3 * k)); y < Math.min(y1, Math.ceil(Y + L.r * 1.3 * k)); y++)
      for (let x = Math.max(x0, Math.floor(X - L.r * 2.4 * k)); x < Math.min(x1, Math.ceil(X + L.r * 2.4 * k)); x++) {
        const [u, v] = px.ground(x, y);
        const dist = Math.hypot(u - L.u, v - L.v, L.z * 0.45);
        const a = 1 - dist / (L.r * 1.15) + (hash(x >> 1, y >> 1, 67) - 0.5) * 0.35;
        const l = a > 0.5 ? 2 : a > 0.12 ? 1 : 0;
        const j = (y - y0) * W + (x - x0);
        if (l > lvl[j]!) {
          lvl[j] = l;
          tint[j] = L.tint;
        }
      }
  }
  const make = (al: [number, number]): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    const out = new Uint32Array(img.data.buffer);
    for (let j = 0; j < W * H; j++) {
      const l = lvl[j]!;
      if (!l) continue;
      const t = tint[j]!;
      out[j] = rgb(R(t), G(t), B(t), Math.round(255 * al[l - 1]!));
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  return { canvas: make([0.08, 0.16]), lights: null, night: make([0.32, 0.6]), x: x0, y: y0, d: depthKey };
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
    // Highlight, epitaph cut, pale lichen, the contact shadow on the ground.
    H: mix(st.stone[0], st.fine[1], 0.55), E: tone(st.stone[3], 0.1), l: hex('#a6a676'), f: hex('#120e1a'),
    // Marble gone grey-violet, for angels and the better tombs.
    P: hex('#c4bed2'),
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


// ------------------------------------------------------------------ the day's low sun

/**
 * A low pale sun breaking through the overcast (by day only): the lit planes (light class 1) take
 * a cold pale gold and step up, the half-lit ones a touch of it, the shade planes fall a step into
 * deep violet, and every silhouette top (a pixel under the outline) catches a pale-gold rim. It is
 * laid on the finished Art's day canvas alone; its night canvas, made from the same pixels before,
 * stays the moonlit palette. Witchfire-lit pixels (strong green) keep their colour.
 */
export const SUN = hex('#f2dca2');
const SUN_RIM = hex('#fff2c8');
const SHADE = hex('#140f28');
/** A colour lifted by a warm offset (keeps a ramp's contrast, where a mix would flatten it). */
const add = (c: Col, r: number, g: number, b: number): Col => rgb(Math.min(255, R(c) + r), Math.min(255, G(c) + g), Math.min(255, B(c) + b));
export function sunlit(art: Art, P: Pt): void {
  if (!art.canvas) return;
  const px = P.px;
  const { w, data } = px;
  const cl = px.cls;
  const W = art.canvas.width;
  const H = art.canvas.height;
  const g = art.canvas.getContext('2d')!;
  const img = g.createImageData(W, H);
  const out = new Uint32Array(img.data.buffer);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y + art.y) * w + (x + art.x);
      let c = data[i]!;
      if (!c) continue;
      const k = cl[i]!;
      const green = G(c) > R(c) + 30 && G(c) > B(c) + 10;
      if (!green && k !== 4) {
        const top = i >= w && cl[i - w] === 4;
        if (top && k !== 3) c = mix(add(c, 48, 42, 22), SUN_RIM, 0.45);
        else if (k === 1) c = add(c, 44, 38, 20);
        else if (k === 2) c = add(c, 24, 20, 10);
        else if (k === 3) c = mix(c, SHADE, 0.38);
      }
      out[y * W + x] = c;
    }
  g.putImageData(img, 0, 0);
}

/**
 * A pool of pale sun on the flags, broken by the shadows of dead branches (the user's
 * town-displate: a patch of light on the cobbles in the shade). Opaque by day; at night the same
 * pixels fall back to plain flagstone in the ground's own night (decalArt's base colours).
 */
export function sunPool(D: Decal, cu: number, cv: number, r: number, seed: number): void {
  const lit = [hex('#cabca0'), hex('#b6aa92'), hex('#d8caa8'), hex('#8e8476')];
  const flags = [hex('#5f5d74'), hex('#545269'), hex('#6a6880'), hex('#4a4860')];
  const bands: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) bands.push([hash(i, seed, 1) * Math.PI, (hash(i, seed, 2) - 0.5) * r * 1.4, 0.3 + hash(i, seed, 3) * 0.5]);
  D.ellipse(cu, cv, r, r * 0.65, (x, y, u, v, rr) => {
    if (rr > 0.6 && hash(x >> 2, y >> 1, seed + 9) < (rr - 0.6) * 2.4) return;
    let shade = false;
    for (const [a, o, wd] of bands) {
      const d = (u - cu) * Math.cos(a) + (v - cv) * Math.sin(a) - o + Math.sin((u + v) * 0.9 + a * 3) * 0.6;
      if (Math.abs(d) < wd) shade = true;
    }
    if (shade) return;
    const f = flagAt(u, v, seed);
    const j = Math.floor(f.slab * 3);
    const c = f.joint || f.crack ? lit[3]! : lit[j]!;
    const base = f.joint || f.crack ? flags[3]! : flags[j]!;
    D.set(x, y, f.weed ? hex('#76804e') : c, 3, base);
  });
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
  '...HHs...',
  '..HSSssd.',
  '.HSSsssde',
  '.HSEEEsde',
  '.SSsSSsde',
  '.SEEsEEde',
  '.SSssssde',
  '.SEEEssde',
  '.SlSsssde',
  '.SSsslsde',
  '.MSsssMde',
  'MmMMmMmdeff',
];
const CRACKED = [
  '...HH....',
  '..HSSs...',
  '.HSSssE..',
  '.HSEEsEd.',
  '.SSsSEsde',
  '.SEEsEEde',
  '.SSsEssde',
  '.SEEEsEde',
  '.SlSsEsde',
  '.SSssEsde',
  '.MSsssMde',
  'MmMMmMmdeff',
];
const GOTHIC = [
  '....H....',
  '...HSd...',
  '..HSsde..',
  '.HSSssde.',
  '.HSEEEsde',
  '.SSsSSsde',
  '.SEEsEsde',
  '.SSssssde',
  '.SEEEssde',
  '.SSssssde',
  '.SlSsssde',
  '.MSssMsde',
  'MmMMmMmdeff',
];
const CROSS = [
  '...HH...',
  '...Ssd..',
  'HHHSsddd',
  'SsssssdE',
  'eddSsdee',
  '...Ssd..',
  '...Ssd..',
  '...Sld..',
  '...Ssd..',
  '..HSsde.',
  '..SEEde.',
  '.MSssdMe',
  'MmMMmMdeff',
];
const CELTIC = [
  '....HH....',
  '..HHSsdd..',
  '.Hs.Ssd.e.',
  'HSSSSssddd',
  'sssssssdde',
  '.Hs.Ssd.e.',
  '..sdSsdee.',
  '....Ssd...',
  '....Sld...',
  '....Ssd...',
  '....Ssd...',
  '...HSsde..',
  '..HSEEsde.',
  '..SSssdde.',
  '.MSSssdMe.',
  'MmMMmMmdeff',
];
const OBELISK = [
  '...H...',
  '..HSd..',
  '..HSd..',
  '..Ssd..',
  '..Ssd..',
  '..Ssd..',
  '..Sld..',
  '..Ssd..',
  '..Ssd..',
  '..SEd..',
  '..Ssd..',
  '.HSssd.',
  '.HSssde',
  '.SEEsde',
  '.SSssde',
  '.SEEsde',
  'MSlssdM',
  'MmMmMdeff',
];
const SLAB = [
  '..HSSSSs..',
  '.HSsEEsSd.',
  'HSssssssde',
  'SSsEEEssde',
  'MSsssssdd.',
  'mMmMMmMdeff',
];
/** Faceless with weather, head bowed, wings folded behind, hands clasped, robe in folds, streaked black. */
const ANGEL = [
  '.....PA......',
  '....PAAq.....',
  '....AAaq.....',
  '..Pa.Aqq.aq..',
  '.PAaAAAaqAaq.',
  '.PAAaAAAqaAq.',
  '.PAaqAAaqqAq.',
  '.PAaqPAAqqaq.',
  '..AaPAAaqaq..',
  '..AaAaAqqqq..',
  '..PaAAaeqqe..',
  '..PAaAaeAq...',
  '..PAaAaqAqe..',
  '.PAAaAaqAaqe.',
  '.PAAaeaqAaqe.',
  'PAAaAAaqAaaqe',
  'qqqqqqqqqqqqe',
  '.HSSSSSSSSde.',
  '.SEEEEEEEsde.',
  '.SSSSSSSSsde.',
  'MSSlSSSSSsdM.',
  'mMmMMmMMmMdeff',
];
const WREATH = ['.nNn.', 'N.y.n', 'n...N', 'NyY.n', '.nNy.', '..y..'];
/** Dead ivy creeping over a headstone's shoulder and trailing down its face. */
const CREEPER = ['.NNn....', 'NnNNn...', '.nN.Nn..', '..n..N..', '..N.....', '..n.....'];
/** Candle stubs of different heights, wax running down them into a pool, two-tone flames. */
const CANDLES = [
  '.F.....F..',
  '.G..F..G..',
  '.g..G..g..',
  '.X..g..X..',
  '.Xt.X..Xt.',
  'XXt.XtXXt.',
  'XtXXtXXtt.',
  'XttXttXtt.',
  '.tttttttff',
];
/** An iron lantern: a ring, a cap, cage bars over the witchfire, a base. */
const LANTERN = [
  '...j...',
  '..jIj..',
  '.jIIIj.',
  '.iGiGi.',
  '.iFiFi.',
  '.iGiGi.',
  '.igigi.',
  '.jIIIj.',
  '..jjj..',
  '...j...',
];
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
const SKULL = ['.BBb.', 'BbbbK', 'QbQkK', '.kbK.', '..fff'];
/** Skulls heaped on long bones: each skull a cranium, two sockets and a jaw, so they read one by one. */
const SKULLPILE = [
  '....BBb.....',
  '...BbbbK....',
  '...QbQkK....',
  '.BBbkbKBBb..',
  'BbbbKBbbbbK.',
  'QbQkKQbQkKK.',
  'BkbKBkbKBbb.',
  'BbbbKbBbbKbK',
  'QbQkKQbQkKkK',
  '.kbKkkbKkbK.',
  '..ffffffffff',
];
const BONES = ['B.....b', '.bk.kK.', '..BbK..', '.Bk.bk.', 'b.....K'];
const FLOWERS = ['y.Y.y', 'NyNYn', '.nNn.'];
const WEB = ['ZZZZZZZ', 'Z.Z..Z.', 'ZZ.ZZ..', 'Z.Z.Z..', 'ZZ.Z...', 'Z.Z....', 'ZZ.....', 'Z......'];

/** Swap the stone keys for a black polished or a marble headstone. */
function subFor(P: Pt, kind: number): Pal | undefined {
  const p = palOf(P.st);
  if (kind === 1) return { H: hex('#5a5874'), S: hex('#3e3c56'), s: hex('#302e44'), d: hex('#1e1c2e'), e: hex('#14121f'), E: hex('#0e0c16'), L: hex('#56546c'), l: hex('#6e7058') };
  if (kind === 2) return { H: p.P!, S: p.A!, s: p.a!, d: p.q!, e: hex('#3e3854'), E: hex('#4a4460'), L: hex('#c8c4cc') };
  return undefined;
}

// ------------------------------------------------------------------ props

/** A grave marker of a kind picked by n (0..1): rounded, cracked, gothic, cross, Celtic cross, obelisk, slab, angel. */
export function headstone(P: Pt, u: number, v: number, n: number, seed: number): void {
  const m = hash(seed, 3, 17);
  const sub = subFor(P, m < 0.4 ? 1 : m > 0.9 ? 2 : 0);
  const lean = hash(seed, 5, 17) < 0.25 ? (hash(seed, 6, 17) < 0.5 ? 0.18 : -0.18) : 0;
  const art = n < 0.2 ? ROUND : n < 0.32 ? CRACKED : n < 0.46 ? GOTHIC : n < 0.6 ? CROSS : n < 0.72 ? CELTIC : n < 0.8 ? OBELISK : n < 0.985 ? SLAB : ANGEL;
  stamp(P, u, v, 0, art, { sub, lean: art === OBELISK || art === ANGEL ? 0 : lean });
  // Creepers over a shoulder of some; withered flowers or a wreath on many.
  if (hash(seed, 9, 17) < 0.35 && art !== SLAB && art !== OBELISK) stamp(P, u, v, art.length * 0.32, CREEPER, { flip: hash(seed, 10) < 0.5, dz: 0.9 });
  const f = hash(seed, 8, 17);
  if (f < 0.2 && art !== SLAB) stamp(P, u + 0.6, v + 1.2, 1.5, WREATH, { dz: 1 });
  else if (f < 0.5) stamp(P, u + 0.8, v + 1.6, 0, FLOWERS, { dz: 1 });
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
      // A lid of planks, nailed at the ends, with a cross in relief.
      const a = alongU ? s : t;
      const b = alongU ? t : s;
      if ((Math.abs(a - L * 0.35) < 0.3 && Math.abs(b - W / 2) < 0.7) || (Math.abs(b - W / 2) < 0.2 && a > 0.8 && a < L - 0.6)) return p.W!;
      if ((a < 0.4 || a > L - 0.4) && Math.abs(((b * 2) % 1) - 0.5) < 0.25) return p.I!;
      if (Math.abs(b - W / 3) < 0.12 || Math.abs(b - (2 * W) / 3) < 0.12) return p.v!;
      return p.w!;
    }
    // The sides: two planks, a dark seam, nail heads at the ends.
    const len = f === 'left' ? (alongU ? L : W) : alongU ? W : L;
    if (Math.abs(t - 0.6) < 0.12) return p.x!;
    if ((s < 0.35 || s > len - 0.35) && Math.abs(t - 0.3) < 0.2) return p.I!;
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
  stamp(P, u, v, 0, big ? SKULLPILE : hash(seed, 1) < 0.5 ? BONES : SKULL);
}

/** Candles at a shrine: a cluster of stubs over a pool of wax, flames lit, a little light. */
export function candles(P: Pt, u: number, v: number, z: number, seed: number, light = true): void {
  void seed;
  stamp(P, u, v, z, CANDLES, { dz: 0.8 });
  if (light) glow(u, v, z + 3, 0, 6);
}

/** An iron lantern of witchfire on a post with a bracket arm. */
export function lanternPost(P: Pt, u: number, v: number, h = 9): void {
  const p = palOf(P.st);
  post(P.px, u, v, 0, h, p.i!, p.j!);
  line3(P.px, v3(u, v, h), v3(u, v + 1.6, h), p.i!);
  stamp(P, u, v + 1.6, h - 5.4, LANTERN, { dz: 0.6 });
  glow(u, v + 1.6, h - 2.5, 0);
}

/** A lantern hung on a wall bracket. */
export function wallLantern(P: Pt, u: number, v: number, z: number): void {
  stamp(P, u, v, z, LANTERN, { dz: 1.2 });
  glow(u, v, z + 2, 0);
}

/** A gibbet: an upright, an arm and a brace, an iron cage with someone's bones in it. */
export function gibbet(P: Pt, u: number, v: number, h = 16, cage = true): void {
  const p = palOf(P.st);
  post(P.px, u, v, 0, h, p.w!, p.v!);
  line3(P.px, v3(u, v, h), v3(u, v + 6, h), p.w!);
  line3(P.px, v3(u, v, h - 1), v3(u, v + 6, h - 1), p.v!);
  line3(P.px, v3(u, v + 0.4, h - 4), v3(u, v + 3, h - 1), p.v!);
  if (!cage) return;
  // The chain: links one pixel each, light and dark in turn.
  for (let z = h - 1, n = 0; z > h - 3.2; z -= 0.5, n++) P.px.point(v3(u, v + 5.5, z), n % 2 ? p.I! : p.j!);
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
  void flip;
  stamp(P, u, v, 0, ANGEL);
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
  const len = (0.3 + hash(sx0, 1, seed) * 0.7) * h * k;
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
  /** Night colours for pixels that differ from their day (the sun's pools): buffer index → colour. */
  readonly base = new Map<number, Col>();
  constructor(readonly P: Painter) {}
  set(x: number, y: number, c: Col, k = 3, base?: Col): void {
    this.P.px.set(x, y, c);
    cls(this.P, x, y, k);
    if (base !== undefined && x >= 0 && y >= 0 && x < this.P.px.w && y < this.P.px.h) this.base.set(y * this.P.px.w + x, base);
    else this.base.delete(y * this.P.px.w + x);
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
export function decalArt(P: Painter, depth: number, base?: Map<number, Col>): Art {
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
      const c0 = px.data[i]!;
      if (!c0) continue;
      const c = base?.get(i) ?? c0;
      const keep = px.cls[i] === 1;
      const [r, gg, bb] = keep ? [0.82, 0.9, 0.86] : [0.72, 0.72, 0.82];
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
    if (!shade && ring === 0) c = mix(c, hex('#b4ffa0'), 0.08);
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
 * The ground and the trees that shade it, by the town's tier (the clutter and the lights are the
 * prop library's): the yard's cracked flags, bone-strewn dirt, puddles and light pools as one
 * decal, and the dead trees with crows whose branches dapple those pools.
 */
export function yardProps(P: Painter, tier: number, parts: BuildingParts, finish: (d: number, outline?: boolean) => void): void {
  // The ground decal first, below everything (but over the ground).
  const rim = P.rim;
  P.rim = null;
  const D = new Decal(P);
  crackedFlags(D, 56, 22, 80, 60, 5);
  crackedFlags(D, 76, 46, 142, 60, 6);
  lightPool(D, 74, 52, 9, 3, true);
  boneDirt(D, 104, 140, 10, 6, 11);
  if (tier >= 3) boneDirt(D, 186, 196, 9, 6, 12);
  boneDirt(D, 60, 120, 6, 5, 13);
  trodden(D, 86, 70, 150, 148, 14);
  // Pale sun breaking through on the flags before the keep and the chapel, and in the yard.
  sunPool(D, 66, 40, 7, 21);
  sunPool(D, 100, 53, 9, 22);
  sunPool(D, 132, 52, 6, 23);
  if (tier >= 2) sunPool(D, 118, 100, 11, 24);
  parts.arts.push(decalArt(P, -1000, D.base));
  P.reset();
  P.rim = rim;

  // Dead trees with crows over the light pools: their limbs are what dapples them. Trees are not
  // outlined (as the ground's trees are not): an outlined one-pixel twig is a black lattice.
  for (const [u, v, h, s] of [[70, 50, 22, 1], [134, 58, 18, 2], [156, 128, 20, 3]] as const) {
    if (tier < 2 && s > 2) continue;
    deadTree(P, u, v, h, s, 1 + (s % 2));
    finish(u + v, false);
  }
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

/** A fresh grave: a long mound of turned earth, a wooden cross at its head, maybe flowers. */
export function freshGrave(P: Pt, u: number, v: number, seed: number): void {
  const p = palOf(P.st);
  for (let i = 0; i < 5; i++) {
    const h = 0.5 + Math.sin(((i + 0.5) / 5) * Math.PI) * 0.5;
    box(P.px, u + 0.2, v + 0.8 + i * 0.75, 0, 2, 0.8, h, (f) => (f === 'top' ? (hash(i, seed) < 0.3 ? hex('#46424e') : p.D!) : f === 'left' ? p.O! : tone(p.O!, 0.25)));
  }
  stamp(P, u + 1.2, v + 0.5, 0, CROSS, { sub: { S: p.w!, s: p.v!, d: p.x!, L: p.w!, M: p.D!, m: p.O! }, lean: hash(seed, 2) < 0.3 ? 0.15 : 0 });
  if (hash(seed, 3) < 0.25) stamp(P, u + 1.2, v + 3.4, 0.8, FLOWERS, { dz: 1 });
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
  // The fields not yet full are a new burial ground: rows of fresh mounds under wooden crosses,
  // graves open and waiting, spades left standing.
  for (let fi = Math.min(sown, FIELDS.length); fi < FIELDS.length; fi++) {
    const f = FIELDS[fi]!;
    for (let v = f[1] + 2; v < f[3] - 5; v += 8) {
      for (let u = f[0] + 3; u < f[2] - 6; u += 6) {
        const n = hash(Math.floor(u), Math.floor(v), 53 + fi);
        if (n < 0.3) freshGrave(P, u, v, Math.floor(u * 7 + v));
        else if (n < 0.36) openGrave(P, u, v, Math.floor(u + v * 3));
        else if (n < 0.39) spade(P, u, v + 1);
      }
      finish((f[0] + f[2]) / 2 + v + 2);
    }
  }
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
        else if (n < 0.3) candles(P, u, gv + 1, 0, Math.floor(u), false);
      }
      finish((f[0] + f[2]) / 2 + v + 2);
    }
  }
}


// ------------------------------------------------------------------ the props' little life

/** Draw a micro-sprite with a canvas (buffer pixels), its bottom-middle at (x, y). */
function sprite(g: CanvasRenderingContext2D, art: readonly string[], x: number, y: number, pal: Pal): void {
  const ax = Math.floor(art[0]!.length / 2);
  for (let r = 0; r < art.length; r++)
    for (let c = 0; c < art[r]!.length; c++) {
      const ch = art[r]![c]!;
      const col = pal[ch];
      if (ch === '.' || col === undefined) continue;
      g.fillStyle = css(col);
      g.fillRect(x - ax + c, y - (art.length - 1 - r), 1, 1);
    }
}
/** A witchfire flame two pixels tall that flickers: hot core, green body, sometimes a tongue. */
function witchFlame(g: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
  const ph = Math.sin(t * 13 + seed * 40) + Math.sin(t * 7.3 + seed * 17);
  g.fillStyle = ph > 0.5 ? '#f0ffd8' : ph > -0.5 ? '#b4ff8c' : '#7ee06a';
  g.fillRect(x, y, 1, 1);
  g.fillStyle = ph > 0 ? '#5fd64a' : '#3fa83a';
  g.fillRect(x, y + 1, 1, 1);
  if (ph > 1.1) {
    g.fillStyle = '#b4ff8c';
    g.fillRect(x, y - 1, 1, 1);
  }
}
/** Candle flames: each wick of the CANDLES art flickers on its own. */
const candlesAnim = (du: number, dv: number): PropAnim => (g, t, x, y, seed, k) => {
  const [ox, oy] = isoOff(k, du, dv, 0);
  const ax = Math.floor(CANDLES[0]!.length / 2);
  const top = y + oy - (CANDLES.length - 1);
  for (const [c, r] of [[1, 0], [4, 1], [7, 0]] as const) witchFlame(g, x + ox - ax + c, top + r, t, seed + c * 0.13);
};
/** The lantern's flame behind its cage bars. */
const lanternAnim = (du: number, dv: number, z: number): PropAnim => (g, t, x, y, seed, k) => {
  const [ox, oy] = isoOff(k, du, dv, z);
  const top = y + oy - (LANTERN.length - 1);
  const ax = Math.floor(LANTERN[0]!.length / 2);
  witchFlame(g, x + ox - ax + 2, top + 4, t, seed);
  witchFlame(g, x + ox - ax + 4, top + 4, t, seed + 0.37);
};
/** A brazier's fire: a ragged row of tongues that rise and fall. */
const brazierAnim = (du: number, dv: number, z: number): PropAnim => (g, t, x, y, seed, k) => {
  const [ox, oy] = isoOff(k, du, dv, z);
  for (let c = -2; c <= 2; c++) {
    const h = 1 + Math.round(1.5 + Math.sin(t * 9 + c * 1.7 + seed * 30) * 1.5);
    for (let j = 0; j < h; j++) {
      g.fillStyle = j === h - 1 ? '#f0ffd8' : j === 0 ? '#3fa83a' : '#7ee06a';
      g.fillRect(x + ox + c, y + oy - 1 - j, 1, 1);
    }
  }
};
/** A gibbet's chain and cage, swinging a little on the arm. */
const gibbetAnim = (du: number, dv: number, h: number): PropAnim => (g, t, x, y, seed, k, st) => {
  const pal = palOf(st);
  const sw = Math.sin(t * 1.4 + seed * 9);
  const [ox, oy] = isoOff(k, du, dv, h - 1);
  const links = Math.round(2.2 * k);
  for (let i = 0; i < links; i++) {
    g.fillStyle = css(i % 2 ? pal.I! : pal.j!);
    g.fillRect(x + ox + Math.round((sw * i) / links), y + oy + i, 1, 1);
  }
  sprite(g, CAGE, x + ox + Math.round(sw), y + oy + links + CAGE.length - 1, pal);
};
/** A crow on the ground under a dead tree, hopping now and then and turning back. */
const crowAnim = (du: number, dv: number): PropAnim => (g, t, x, y, seed, k, st) => {
  const pal = palOf(st);
  const cyc = (t * 0.6 + seed * 7) % 6;
  const step = Math.floor(cyc);
  const f = cyc - step;
  const hop = f < 0.25 ? Math.round(Math.sin((f / 0.25) * Math.PI) * 2) : 0;
  const along = step < 3 ? step : 6 - step;
  const [ox, oy] = isoOff(k, du + along * 0.8, dv, 0);
  const art = step < 3 ? CROW : CROW.map((r) => [...r].reverse().join(''));
  sprite(g, art, x + ox, y + oy - hop, pal);
};
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
registerProp('undead:deadTree', { lu: 4, lv: 4, h: 14, draw: lib((P, a) => deadTree(P, a.u + 2, a.v + 2, 12 + a.n * 8, seedOf(a), a.n < 0.6 ? 1 : 2)), anim: crowAnim(3.5, 3) });
// The library's gibbet hangs its cage live (it swings); zoomed right out it is a bare gallows.
registerProp('undead:gibbet', { lu: 2, lv: 8, h: 16, draw: lib((P, a) => gibbet(P, a.u + 1, a.v + 1, 15, false)), anim: gibbetAnim(1, 6.5, 15) });
registerProp('undead:shrine', {
  lu: 7, lv: 4, h: 7,
  draw: lib((P, a) => shrine(P, a.u + 0.4, a.v + 0.4)),
  anim: candlesAnim(4.6, 2.2),
});
registerProp('undead:candles', {
  lu: 3, lv: 2, h: 2,
  draw: lib((P, a) => candles(P, a.u + 1.5, a.v + 1, 0, seedOf(a))),
  anim: candlesAnim(1.5, 1),
});
registerProp('undead:brazier', {
  lu: 2, lv: 2, h: 5,
  draw: lib((P, a) => brazier(P, a.u + 1, a.v + 1)),
  anim: brazierAnim(1, 1, 4.4),
});
registerProp('undead:railing', { lu: 12, lv: 1, h: 5, draw: lib((P, a) => railing(P, a.u, a.v + 0.5, a.u + 12, a.v + 0.5)) });
registerProp('undead:railingV', { lu: 1, lv: 12, h: 5, draw: lib((P, a) => railing(P, a.u + 0.5, a.v, a.u + 0.5, a.v + 12)) });
registerProp('undead:plot', { lu: 10.4, lv: 8.4, h: 9, draw: lib((P, a) => plot(P, a.u + 0.2, a.v + 0.2, a.n)) });
registerProp('undead:spade', { lu: 3, lv: 3, h: 4, draw: lib((P, a) => spade(P, a.u, a.v)) });
registerProp('undead:well', { lu: 6.6, lv: 6.6, h: 9, draw: lib((P, a) => well(P, a.u, a.v)) });
registerProp('undead:lantern', {
  lu: 2, lv: 3, h: 10,
  draw: lib((P, a) => lanternPost(P, a.u + 1, a.v + 0.5, 9)),
  anim: lanternAnim(1, 2.1, 3.6),
});

/**
 * The fixed lights: witchfire on posts along the ways, braziers at the keep's door and the gate, a
 * shrine with candles where the way from the well meets the yard. [kind, u, v, tier].
 */
const FIXED_LIGHTS: [string, number, number, number][] = [
  ['undead:lantern', 70, 57.5, 1],
  ['undead:brazier', 61, 31, 1],
  ['undead:brazier', 61, 45, 1],
  ['undead:shrine', 85.6, 65.6, 1],
  ['undead:lantern', 111, 69.5, 1],
  ['undead:lantern', 149, 103.5, 1],
  ['undead:lantern', 117, 149.5, 2],
  ['undead:brazier', WALL - 17, GATE_V - 13, 2],
  ['undead:brazier', WALL - 17, GATE_V + 11, 2],
  ['undead:lantern', 181, 119.5, 3],
  ['undead:lantern', 211, 111.5, 4],
];

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
  fixed: [['undead:well', 75.7, 63.7, 1], ...FIXED_LIGHTS],
});



/** The fixed lights' sources, by tier, for the keep's kit to bake their pools. */
export function fixedLights(tier: number): Light[] {
  const out: Light[] = [];
  for (const [kind, u, v, t] of FIXED_LIGHTS) {
    if (t > tier) continue;
    if (kind === 'undead:lantern') out.push({ u: u + 1, v: v + 2.1, z: 6.5, r: 11, tint: GREEN_LIGHT });
    else if (kind === 'undead:brazier') out.push({ u: u + 1, v: v + 1, z: 5.5, r: 13, tint: GREEN_LIGHT });
    else out.push({ u: u + 4.6, v: v + 2.2, z: 1.5, r: 7, tint: GREEN_LIGHT });
  }
  return out;
}

