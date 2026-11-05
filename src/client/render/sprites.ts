// Pixel sprites for one army, painted at start-up and packed into an atlas (contract.ts).
//
// Every figure is a tiny model built from ellipsoids, boxes, capsules, sticks and cloth sheets,
// posed by a small skeleton (two-bone IK for arms and legs), then ray-cast one ray per pixel
// through an orthographic camera looking down at 30° — the isometric field's 2:1 diamond. Each
// pixel takes one of four tones from its material's colour ramp by how it faces a light at the
// upper left; lone tone specks are cleaned up, and the figure gets a coloured one-pixel outline
// and a soft ground shadow. Because the figures are real (if crude) 3D, the four facings, the
// falls and the horses rolling onto their sides all come out in correct perspective, and the
// art stays procedural: no image assets, every pixel decided here.
//
// Scale: 1 world unit = 1 screen pixel across. A man is ~13 units tall (12-13 px on screen with
// the outline), a horseman ~18 px. Cells are 48×48 with the ground point at (24, 38).

import { FACTIONS, type FactionId } from '../../game/factions.ts';
import { U } from '../../game/units.ts';
import { Anim, ANIM_COUNT, COMMANDER_KIND, KIND_COUNT, type Atlas, type BuildAtlas, type Dir } from './contract.ts';

export type { Atlas } from './contract.ts';

export const CELL_W = 48;
export const CELL_H = 48;
export const FOOT_X = 24;
export const FOOT_Y = 38;

/** Frames per animation, indexed by Anim. */
const FRAMES = [4, 6, 6, 4, 4, 2, 5, 1, 2, 0] as const;
/** Ticks (0.1 s) per frame, indexed by Anim. */
const TICKS = [4, 2, 1, 1, 2, 2, 2, 1, 4, 2] as const;
const COL0: number[] = [];
{
  let c = 0;
  for (let a = 0; a < ANIM_COUNT; a++) {
    COL0.push(c);
    c += FRAMES[a]!;
  }
}
const COLS = COL0[ANIM_COUNT - 1]! + FRAMES[ANIM_COUNT - 1]!;
/** Kinds that loose missiles; the others reuse their Attack frames for Shoot. */
const SHOOTS = new Set<number>([U.Skirmishers, U.Archers, U.Crossbowmen, U.HorseArchers, U.Artillery]);

// ------------------------------------------------------------------ colour

type RGB = [number, number, number];

export interface Palette {
  cloth: string;
  clothShade: string;
  trim: string;
  metal: string;
  metalShade: string;
  metalDark: string;
  leather: string;
  leatherDark: string;
  skin: string;
  wood: string;
  woodDark: string;
  team: string;
  teamShade: string;
  teamLight: string;
  outline: string;
  blood: string;
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** hsl() and #hex strings to RGB. */
function toRgb(c: string): RGB {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /hsl\(([\d.-]+) ([\d.]+)% ([\d.]+)%\)/.exec(c)!;
  return hslRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
}

function hslRgb(h: number, s: number, l: number): RGB {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

function rgbHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Moves hue h toward target by at most amt degrees. */
function toward(h: number, target: number, amt: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}

/**
 * Four tones from a base colour: deep, shade, base, light. Shadows drift cool, lights warm, the
 * way a pixel artist would ramp them. `shine` widens the jump to the light tone (metal).
 */
function ramp(base: string, shine = 1, depth = 1): RGB[] {
  const rgb = toRgb(base);
  const [h, s, l] = rgbHsl(rgb);
  const c = (x: number) => Math.max(0, Math.min(1, x));
  const up = Math.min((1 - l) * 0.32, l * 0.55 + 0.05) * shine;
  return [
    hslRgb(toward(h, 250, 16), c(s + 0.06), c(l * (1 - 0.52 * depth))),
    hslRgb(toward(h, 250, 8), c(s + 0.03), c(l * (1 - 0.28 * depth))),
    rgb,
    hslRgb(toward(h, 50, 8), c(s - 0.04), c(l + up)),
  ];
}

export function paletteFor(faction: FactionId, hue: number): Palette {
  const f = (FACTIONS[faction] ?? FACTIONS.templar).palette;
  return {
    cloth: f.cloth, clothShade: f.clothShade, trim: f.trim, metal: f.metal, metalShade: f.metalShade, metalDark: '#3d4146',
    leather: f.leather, leatherDark: '#36241a', skin: f.skin, wood: '#7a5634', woodDark: '#4e3420',
    team: hsl(hue, 62, 44), teamShade: hsl(hue, 60, 28), teamLight: hsl(hue, 60, 60), outline: '#120e0b', blood: '#7a1010',
  };
}

/** Material ramps, by id. */
const R = {
  ink: 0, white: 1, black: 2, red: 3, mail: 4, plate: 5, dplate: 6, steel: 7, leather: 8, dleather: 9,
  skin: 10, hair: 11, wood: 12, dwood: 13, gambeson: 14, tunic: 15, tunic2: 16, hose: 17, team: 18, teamDark: 19,
  gold: 20, bay: 21, chestnut: 22, grey: 23, dun: 24, points: 25, blood: 26, string: 27, stone: 28, rope: 29,
  // Samurai Clans
  lacquer: 30, vermilion: 31, indigo: 32, paper: 33, bronze: 34, smoke: 35, fire: 36, ochre: 37, darkbay: 38,
  // Hollow Host
  bone: 39, rust: 40, glow: 41, ghoul: 42, bplate: 43, rag: 44, sinew: 45, bonehorse: 46, ash: 47,
} as const;
const RAMP_COUNT = 48;

function makeRamps(p: Palette, hue: number): RGB[][] {
  const r: RGB[][] = [];
  r[R.ink] = [[10, 8, 8], [18, 14, 13], [28, 22, 20], [40, 32, 29]];
  r[R.white] = ramp(p.cloth, 0.7);
  r[R.black] = ramp('#3a3029', 1.2, 0.9);
  r[R.red] = ramp('#a61e1a', 1.1);
  r[R.mail] = ramp('#7d838a', 0.9);
  r[R.plate] = ramp('#9aa0a8', 1.2);
  r[R.dplate] = ramp('#474b54', 1.6);
  r[R.steel] = ramp('#c6ccd2', 1.2);
  r[R.leather] = ramp(p.leather);
  r[R.dleather] = ramp('#3b281b');
  r[R.skin] = ramp(p.skin);
  r[R.hair] = ramp('#3b2a1d');
  r[R.wood] = ramp(p.wood);
  r[R.dwood] = ramp(p.woodDark);
  r[R.gambeson] = ramp('#9d8c66');
  r[R.tunic] = ramp('#73603f');
  r[R.tunic2] = ramp('#5f6446');
  r[R.hose] = ramp('#4c4033');
  // The army's colour: bright enough to read at 1x on grass, with a darker sibling for rims.
  r[R.team] = [hslRgb(toward(hue, 250, 10), 0.62, 0.2), hslRgb(toward(hue, 250, 5), 0.62, 0.32), hslRgb(hue, 0.66, 0.46), hslRgb(toward(hue, 50, 6), 0.7, 0.62)];
  r[R.teamDark] = [hslRgb(hue, 0.55, 0.13), hslRgb(hue, 0.55, 0.2), hslRgb(hue, 0.58, 0.29), hslRgb(hue, 0.6, 0.38)];
  r[R.gold] = ramp('#c9a24a', 1.3);
  r[R.bay] = ramp('#7b4a2a');
  r[R.chestnut] = ramp('#9a5a2e');
  r[R.grey] = ramp('#c9c3b7', 1.2);
  r[R.dun] = ramp('#a58a5e');
  r[R.points] = ramp('#2a201b', 1.2);
  r[R.blood] = [[48, 6, 6], [78, 10, 10], [110, 16, 14], [140, 26, 20]];
  r[R.string] = ramp('#d8cfb4');
  r[R.stone] = ramp('#8b867b');
  r[R.rope] = ramp('#a48e5f');
  r[R.lacquer] = ramp('#2a2a31', 1.5, 0.9);
  r[R.vermilion] = ramp('#b5372b', 1.1);
  r[R.indigo] = ramp('#363c4c');
  r[R.paper] = ramp('#e6e0d0', 0.6);
  r[R.bronze] = ramp('#8a6a32', 1.5);
  r[R.smoke] = ramp('#a8a49a', 0.6, 0.5);
  r[R.fire] = [[200, 80, 20], [235, 140, 30], [250, 200, 70], [255, 245, 190]];
  r[R.ochre] = ramp('#9a7a3a');
  r[R.darkbay] = ramp('#4a2e1e');
  r[R.bone] = ramp('#d8d0b4', 0.7);
  r[R.rust] = ramp('#6e4a32', 1.1);
  r[R.glow] = [[60, 110, 50], [95, 143, 78], [140, 200, 100], [190, 240, 140]];
  r[R.ghoul] = ramp('#8f9a80');
  r[R.bplate] = ramp('#2f3036', 1.6);
  r[R.rag] = ramp('#2e2b2a', 1.4);
  r[R.sinew] = ramp('#6d6a55');
  r[R.bonehorse] = ramp('#a9a28c', 0.8);
  r[R.ash] = ramp('#3a3633', 1.2);
  return r;
}

// ------------------------------------------------------------------ vectors

type V3 = [number, number, number];
type M3 = readonly [number, number, number, number, number, number, number, number, number];

const TAU = Math.PI * 2;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.sqrt(dot(a, a));
const nrm = (a: V3): V3 => scl(a, 1 / (len(a) || 1));
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => madd(a, sub(b, a), t);

const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mm(a: M3, b: M3): M3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}
const mv = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const col = (m: M3, i: number): V3 => [m[i]!, m[3 + i]!, m[6 + i]!];
/** Pitch: positive tips the +z (forward) side down, i.e. leans forward. */
function rx(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
/** Yaw: positive turns +x toward +z. */
function ry(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
/** Roll: positive tips the top toward -x. */
function rz(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** Knee or elbow for a two-bone limb from root to target, bending toward `hint`. */
function ik(root: V3, target: V3, a: number, b: number, hint: V3): V3 {
  const d = sub(target, root);
  const dist = Math.min(Math.max(len(d), 0.01), a + b - 0.001);
  const dir = nrm(d);
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const bend = nrm(madd(hint, dir, -dot(hint, dir)));
  return add(madd(root, dir, x), scl(bend, h));
}

function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ the rasteriser

const W = CELL_W;
const H = CELL_H;
const SQ = Math.sqrt(3) / 2;
const BIG = 200;
/** World (x right, y up, z toward the viewer) to cell space (x right, y down, depth toward the eye). */
const cam = (p: V3): V3 => [FOOT_X + p[0], FOOT_Y + 0.5 * p[2] - SQ * p[1], SQ * p[2] + 0.5 * p[1]];
const camD = (d: V3): V3 => [d[0], 0.5 * d[2] - SQ * d[1], SQ * d[2] + 0.5 * d[1]];
/** Toward the light, in cell space: upper left and a little toward the eye. */
const LC = nrm(camD(nrm([-0.75, 0.7, 0.12])));

const ZB = new Float32Array(W * H);
const PX = new Int16Array(W * H);
let bloodChance = 0;
let bloodSeed = 0;
/** Bounds of what has been painted into the cell. */
let bx0 = W, by0 = H, bx1 = -1, by1 = -1;

/** A material: a ramp id, or a function of the local hit point giving one (-1 = no surface here). */
type Mat = number | ((l: V3, inner: boolean) => number);
/** A ramp with its tone forced: 0 deep .. 3 light. */
const F = (ramp: number, tone: number): number => ramp | ((tone + 1) << 8);

function put(x: number, y: number, s: number, code: number, n: V3 | null, inner: boolean): void {
  if (code < 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (s <= ZB[i]!) return;
  let ramp = code & 255;
  let tone: number;
  if (code >= 256) tone = (code >> 8) - 1;
  else {
    const d = n ? n[0] * LC[0] + n[1] * LC[1] + n[2] * LC[2] : 0.3;
    tone = d > 0.6 ? 3 : d > 0.12 ? 2 : d > -0.32 ? 1 : 0;
    if (inner && tone > 0) tone--;
  }
  if (bloodChance > 0 && ramp !== R.steel && ramp !== R.ink && hash2(x, y, bloodSeed) < bloodChance) {
    ramp = R.blood;
    tone = Math.min(tone, 2);
  }
  ZB[i] = s;
  PX[i] = ramp * 4 + tone;
  if (x < bx0) bx0 = x;
  if (x > bx1) bx1 = x;
  if (y < by0) by0 = y;
  if (y > by1) by1 = y;
}

const NB: V3 = [0, 0, 0];
/** Scratch local hit point handed to materials (they must not keep it). */
const LS: V3 = [0, 0, 0];
const matAt = (mat: Mat, l: V3, inner: boolean): number => (typeof mat === 'number' ? mat : mat(l, inner));

interface Clip {
  lo?: number;
  hi?: number;
  capLo?: boolean;
  capHi?: boolean;
}

/** An ellipsoid with orthogonal semi-axes a1..a3 (cell space), optionally cut by local y planes. */
function rEll(c: V3, a1: V3, a2: V3, a3: V3, mat: Mat, clip?: Clip): void {
  const i1 = 1 / dot(a1, a1), i2 = 1 / dot(a2, a2), i3 = 1 / dot(a3, a3);
  const ex = Math.sqrt(a1[0] * a1[0] + a2[0] * a2[0] + a3[0] * a3[0]);
  const ey = Math.sqrt(a1[1] * a1[1] + a2[1] * a2[1] + a3[1] * a3[1]);
  const x0 = Math.max(0, Math.floor(c[0] - ex)), x1 = Math.min(W - 1, Math.ceil(c[0] + ex));
  const y0 = Math.max(0, Math.floor(c[1] - ey)), y1 = Math.min(H - 1, Math.ceil(c[1] + ey));
  const d0 = a1[2] * i1, d1 = a2[2] * i2, d2 = a3[2] * i3;
  const A = d0 * d0 + d1 * d1 + d2 * d2;
  const lo = clip?.lo ?? -2, hi = clip?.hi ?? 2;
  const qz = -c[2];
  for (let y = y0; y <= y1; y++) {
    const qy = y + 0.5 - c[1];
    for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5 - c[0];
      const o0 = (qx * a1[0] + qy * a1[1] + qz * a1[2]) * i1;
      const o1 = (qx * a2[0] + qy * a2[1] + qz * a2[2]) * i2;
      const o2 = (qx * a3[0] + qy * a3[1] + qz * a3[2]) * i3;
      const B = 2 * (o0 * d0 + o1 * d1 + o2 * d2);
      const C = o0 * o0 + o1 * o1 + o2 * o2 - 1;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let s = (-B + sq) / (2 * A);
      const l = LS;
      l[0] = o0 + s * d0;
      l[1] = o1 + s * d1;
      l[2] = o2 + s * d2;
      let nx = l[0], ny = l[1], nz = l[2];
      let inner = false;
      if (l[1] < lo || l[1] > hi) {
        const top = l[1] > hi;
        const plane = top ? hi : lo;
        let hit = false;
        if ((top ? clip?.capHi : clip?.capLo) && Math.abs(d1) > 1e-6) {
          const sc = (plane - o1) / d1;
          const lx = o0 + sc * d0, lz = o2 + sc * d2;
          if (lx * lx + lz * lz <= 1 - plane * plane) {
            s = sc;
            l[0] = lx;
            l[1] = plane;
            l[2] = lz;
            nx = 0;
            ny = top ? 1 : -1;
            nz = 0;
            hit = true;
          }
        }
        if (!hit) {
          s = (-B - sq) / (2 * A);
          l[0] = o0 + s * d0;
          l[1] = o1 + s * d1;
          l[2] = o2 + s * d2;
          if (l[1] < lo || l[1] > hi) continue;
          nx = -l[0];
          ny = -l[1];
          nz = -l[2];
          inner = true;
        }
      }
      if (s <= ZB[y * W + x]!) continue;
      const code = matAt(mat, l, inner);
      if (code < 0) continue;
      const n0 = a1[0] * nx * i1 + a2[0] * ny * i2 + a3[0] * nz * i3;
      const n1 = a1[1] * nx * i1 + a2[1] * ny * i2 + a3[1] * nz * i3;
      const n2 = a1[2] * nx * i1 + a2[2] * ny * i2 + a3[2] * nz * i3;
      const nn = 1 / Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2);
      NB[0] = n0 * nn;
      NB[1] = n1 * nn;
      NB[2] = n2 * nn;
      put(x, y, s, code, NB, inner);
    }
  }
}

/** A box with orthogonal half-axes a1..a3 (cell space). Local coordinates run -1..1. */
function rBox(c: V3, a1: V3, a2: V3, a3: V3, mat: Mat): void {
  const ax = [a1, a2, a3];
  const inv = [1 / dot(a1, a1), 1 / dot(a2, a2), 1 / dot(a3, a3)];
  const ex = Math.abs(a1[0]) + Math.abs(a2[0]) + Math.abs(a3[0]);
  const ey = Math.abs(a1[1]) + Math.abs(a2[1]) + Math.abs(a3[1]);
  const x0 = Math.max(0, Math.floor(c[0] - ex)), x1 = Math.min(W - 1, Math.ceil(c[0] + ex));
  const y0 = Math.max(0, Math.floor(c[1] - ey)), y1 = Math.min(H - 1, Math.ceil(c[1] + ey));
  const d = [a1[2] * inv[0]!, a2[2] * inv[1]!, a3[2] * inv[2]!];
  const o = [0, 0, 0];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5 - c[0], qy = y + 0.5 - c[1], qz = -c[2];
      let enter = Infinity, exit = -Infinity, k = -1, miss = false;
      for (let a = 0; a < 3; a++) {
        const aa = ax[a]!;
        o[a] = (qx * aa[0] + qy * aa[1] + qz * aa[2]) * inv[a]!;
        const da = d[a]!;
        if (Math.abs(da) < 1e-9) {
          if (Math.abs(o[a]!) > 1) miss = true;
          continue;
        }
        const t1 = (-1 - o[a]!) / da, t2 = (1 - o[a]!) / da;
        const tmax = Math.max(t1, t2), tmin = Math.min(t1, t2);
        if (tmax < enter) {
          enter = tmax;
          k = a;
        }
        if (tmin > exit) exit = tmin;
      }
      if (miss || k < 0 || enter < exit) continue;
      if (enter <= ZB[y * W + x]!) continue;
      const l = LS;
      l[0] = o[0]! + enter * d[0]!;
      l[1] = o[1]! + enter * d[1]!;
      l[2] = o[2]! + enter * d[2]!;
      const code = matAt(mat, l, false);
      if (code < 0) continue;
      const ak = ax[k]!, sg = Math.sign(l[k]!) * inv[k]!;
      const nn = sg / Math.sqrt(ak[0] * ak[0] + ak[1] * ak[1] + ak[2] * ak[2]) / Math.abs(inv[k]!);
      NB[0] = ak[0] * nn;
      NB[1] = ak[1] * nn;
      NB[2] = ak[2] * nn;
      put(x, y, enter, code, NB, false);
    }
}

/** A capsule from pa to pb (cell space). Local x is the position along it, 0..1. */
function rCap(pa: V3, pb: V3, r: number, mat: Mat): void {
  const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0]) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0]) + r));
  const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1]) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1]) + r));
  const b0 = pb[0] - pa[0], b1 = pb[1] - pa[1], b2 = pb[2] - pa[2];
  const baba = b0 * b0 + b1 * b1 + b2 * b2;
  const bard = -b2;
  const a = baba - bard * bard;
  const rr = r * r;
  const LB: V3 = [0, 0, 0];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ox = x + 0.5 - pa[0], oy = y + 0.5 - pa[1], oz = BIG - pa[2];
      let t = -1;
      if (a > 1e-6) {
        const baoa = b0 * ox + b1 * oy + b2 * oz;
        const b = -baba * oz - baoa * bard;
        const c = baba * (ox * ox + oy * oy + oz * oz) - baoa * baoa - rr * baba;
        const h = b * b - a * c;
        if (h < 0) continue;
        t = (-b - Math.sqrt(h)) / a;
        const yy = baoa + t * bard;
        if (!(yy > 0 && yy < baba)) {
          const cx = yy <= 0 ? ox : ox - b0, cy = yy <= 0 ? oy : oy - b1, cz = yy <= 0 ? oz : oz - b2;
          const hh = cz * cz - (cx * cx + cy * cy + cz * cz - rr);
          t = hh > 0 ? cz - Math.sqrt(hh) : -1;
        }
      } else {
        const e = pa[2] > pb[2] ? pa : pb;
        const dx = x + 0.5 - e[0], dy = y + 0.5 - e[1];
        const h = rr - dx * dx - dy * dy;
        if (h > 0) t = BIG - e[2] - Math.sqrt(h);
      }
      if (t < 0) continue;
      const pz = BIG - t;
      if (pz <= ZB[y * W + x]!) continue;
      const qx = x + 0.5 - pa[0], qy = y + 0.5 - pa[1], qz = pz - pa[2];
      const u = Math.max(0, Math.min(1, (qx * b0 + qy * b1 + qz * b2) / baba));
      LB[0] = u;
      const code = matAt(mat, LB, false);
      if (code < 0) continue;
      NB[0] = (qx - b0 * u) / r;
      NB[1] = (qy - b1 * u) / r;
      NB[2] = (qz - b2 * u) / r;
      put(x, y, pz, code, NB, false);
    }
}

/** A one-pixel stick, drawn slightly in front so a shaft in a fist stays whole. */
function rLine(a: V3, b: V3, mat: Mat): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    put(Math.floor(a[0] + dx * t), Math.floor(a[1] + dy * t), a[2] + (b[2] - a[2]) * t + 0.4, matAt(mat, [t, 0, 0], false), null, false);
  }
}

type Wave = (s: number, t: number) => number;
type SheetMat = (s: number, t: number, back: boolean) => number;

/** Fills the transparent pixels of a cell's ground shadow. */
interface Shadow {
  rx: number;
  rz: number;
}

// ------------------------------------------------------------------ the figure builder

class Fig {
  o: V3 = [0, 0, 0];
  m: M3;
  /** Mean scale, for capsule radii. */
  k = 1;
  private readonly st: [V3, M3, number][] = [];
  constructor(m: M3) {
    this.m = m;
  }
  push(off: V3, r: M3 = I3): void {
    this.st.push([this.o, this.m, this.k]);
    this.o = add(this.o, mv(this.m, off));
    this.m = mm(this.m, r);
  }
  pushScale(s: V3): void {
    this.push([0, 0, 0], [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2]]);
    this.k *= (s[0] + s[1] + s[2]) / 3;
  }
  /** Rotates what follows by r about `pivot`, then shifts it by `shift`. Pop twice. */
  pushAbout(pivot: V3, r: M3, shift: V3 = [0, 0, 0]): void {
    this.push(add(pivot, shift), r);
    this.push(scl(pivot, -1));
  }
  pop(): void {
    const s = this.st.pop()!;
    this.o = s[0];
    this.m = s[1];
    this.k = s[2];
  }
  P(p: V3): V3 {
    return cam(add(this.o, mv(this.m, p)));
  }
  D(d: V3): V3 {
    return camD(mv(this.m, d));
  }
  ell(c: V3, r: V3, mat: Mat, clip?: Clip, rot: M3 = I3): void {
    rEll(this.P(c), this.D(scl(col(rot, 0), r[0])), this.D(scl(col(rot, 1), r[1])), this.D(scl(col(rot, 2), r[2])), mat, clip);
  }
  /** An ellipsoid with explicit (orthogonal, scaled) local axes. */
  ellAx(c: V3, ax: V3, ay: V3, az: V3, mat: Mat, clip?: Clip): void {
    rEll(this.P(c), this.D(ax), this.D(ay), this.D(az), mat, clip);
  }
  box(c: V3, ax: V3, ay: V3, az: V3, mat: Mat): void {
    rBox(this.P(c), this.D(ax), this.D(ay), this.D(az), mat);
  }
  /** A timber from a to b, w across and h deep. */
  beam(a: V3, b: V3, w: number, h: number, mat: Mat, up: V3 = [0, 1, 0]): void {
    const az = scl(sub(b, a), 0.5);
    let side = crs(up, az);
    if (len(side) < 1e-4) side = crs([1, 0, 0], az);
    const ax = scl(nrm(side), w / 2);
    const ay = scl(nrm(crs(az, ax)), h / 2);
    this.box(lerp(a, b, 0.5), ax, ay, az, mat);
  }
  cap(a: V3, b: V3, r: number, mat: Mat): void {
    r *= this.k;
    if (r < 0.45) rLine(this.P(a), this.P(b), mat);
    else rCap(this.P(a), this.P(b), r, mat);
  }
  line(a: V3, b: V3, mat: Mat): void {
    rLine(this.P(a), this.P(b), mat);
  }
  poly(pts: V3[], mat: Mat): void {
    for (let i = 1; i < pts.length; i++) this.line(pts[i - 1]!, pts[i]!, mat);
  }
  /** A cloth sheet o + u·s + v·t (+ the normal × wave), splatted point by point. */
  sheet(o: V3, u: V3, v: V3, wave: Wave, mat: SheetMat): void {
    const O = this.P(o), Uc = this.D(u), Vc = this.D(v);
    const Nc = nrm(this.D(crs(u, v)));
    const front = Nc[2] >= 0;
    const nu = Math.ceil(Math.hypot(Uc[0], Uc[1]) * 2.2) + 2;
    const nv = Math.ceil(Math.hypot(Vc[0], Vc[1]) * 2.2) + 2;
    const e = 0.02;
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const s = i / nu, t = j / nv;
        const code = mat(s, t, !front);
        if (code < 0) continue;
        const w = wave(s, t);
        const px = O[0] + Uc[0] * s + Vc[0] * t + Nc[0] * w;
        const py = O[1] + Uc[1] * s + Vc[1] * t + Nc[1] * w;
        const pz = O[2] + Uc[2] * s + Vc[2] * t + Nc[2] * w;
        const ws = (wave(s + e, t) - w) / e, wt = (wave(s, t + e) - w) / e;
        const u0 = Uc[0] + Nc[0] * ws, u1 = Uc[1] + Nc[1] * ws, u2 = Uc[2] + Nc[2] * ws;
        const v0 = Vc[0] + Nc[0] * wt, v1 = Vc[1] + Nc[1] * wt, v2 = Vc[2] + Nc[2] * wt;
        let n0 = u1 * v2 - u2 * v1, n1 = u2 * v0 - u0 * v2, n2 = u0 * v1 - u1 * v0;
        const k = (n2 < 0 ? -1 : 1) / (Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2) || 1);
        n0 *= k;
        n1 *= k;
        n2 *= k;
        NB[0] = n0;
        NB[1] = n1;
        NB[2] = n2;
        put(Math.floor(px), Math.floor(py), pz, code, NB, !front);
      }
  }
}

/** Local-to-world basis for a facing: columns right, up, forward. */
function basis(dir: Dir): M3 {
  const fx = dir === 0 || dir === 3 ? 1 : -1;
  const fz = dir === 0 || dir === 1 ? 1 : -1;
  const f: V3 = nrm([fx, 0, fz]);
  const r: V3 = [-f[2], 0, f[0]];
  return [r[0], 0, f[0], 0, 1, 0, r[2], 0, f[2]];
}

// ------------------------------------------------------------------ people

type Style = 'sword' | 'spear' | 'javelin' | 'bow' | 'xbow' | 'poleaxe' | 'lance' | 'cavspear' | 'horsebow' | 'marshal' | 'crew';
type Helm =
  | 'great' | 'nasal' | 'kettle' | 'hood' | 'cap' | 'turban' | 'sallet' | 'marshal'
  // Samurai
  | 'kabuto' | 'daimyo' | 'jingasa' | 'hachimaki' | 'cowl'
  // Hollow Host
  | 'skull' | 'skullHelm' | 'skullKettle' | 'skullHood' | 'skullCrown' | 'deathHelm' | 'ghoul' | 'wraith' | 'skulls';
/** What the figure is made of: a living man, or the dead in their several kinds. */
type Body = 'man' | 'skel' | 'ghoul' | 'wraith' | 'robe' | 'colossus' | 'armour';
/** How the weapon looks (the style sets how it moves). */
type Weapon = 'katana' | 'yari' | 'yumi' | 'teppo' | 'naginata' | 'saihai' | 'bone' | 'club' | 'staff' | 'sword';
/** The flag or cloak a figure carries on his back, in the team hue. */
type Standard = 'sashimono' | 'small' | 'big' | 'horo' | 'nobori' | 'rag' | 'pennon';

interface Look {
  style: Style;
  cloth: number;
  /** 1: a red cross on chest and back. */
  cross: 0 | 1;
  belt: number;
  collar: number;
  sleeve: number;
  hand: number;
  leg: number;
  boot: number;
  /** The skirt of the coat below the belt (its ramp), or none. */
  skirt: number | null;
  hem?: number;
  helm: Helm;
  hood?: number;
  plume?: number;
  shield?: 'kite' | 'round' | 'buckler';
  pavise?: boolean;
  quiver?: boolean;
  /** Bow stave ramp (pale wood by default). */
  bowWood?: number;
  sash?: boolean;
  beard?: boolean;
  /** Hands empty (the engine crew hauling). */
  noWeapon?: boolean;
  body?: Body;
  weapon?: Weapon;
  /** Blade ramp (steel by default; rust for the dead). */
  blade?: number;
  standard?: Standard;
  /** The mantle's ramp, and whether it is the Templar mantle (cross) or rags. */
  cloak?: { ramp: number; cross?: boolean; ragged?: boolean };
  /** Shield device: 'skull' (3 bone pixels), 'crack' (a dark split), 'mon' (a gold dot). */
  emblem?: 'skull' | 'crack' | 'mon';
  /** Horizontal lacing rows on the torso and skirt (Samurai odoshi), in this ramp. */
  lacing?: number;
  /** Sode: shoulder boards in this ramp. */
  sode?: number;
  /** The skirt flares like a bell (kusazuri, robes) instead of hanging straight. */
  bell?: boolean;
  /** Green glow in the eyes (officers, riders, the lich). */
  glow?: boolean;
  /** Forward stoop added to every pose (ghouls, the colossus). */
  hunch?: number;
  /** Figure scale (the colossus, the lich). */
  scale?: number;
  /** A tate board instead of a pavise when braced. */
  tate?: boolean;
}

interface Pose {
  bob: number;
  lean: number;
  twist: number;
  pz: number;
  fl: V3;
  fr: V3;
  /** Hands, in the chest frame (leaning, not twisted). */
  hl: V3;
  hr: V3;
  /** Main weapon's direction from the right hand. */
  w: V3;
  /** Where a bow or crossbow points. */
  aim: V3;
  draw: number;
  loaded: boolean;
  head: number;
  /** Death: tipped backward this far (radians) about the feet. */
  fall: number;
  drop: boolean;
  spray: number;
  /** A knife in the right hand (archers at close quarters). */
  knife: boolean;
  /** Kneeling on the right knee. */
  kneel: boolean;
  /** The pavise planted on the ground in front, not slung. */
  planted: boolean;
  /** Blood soaked into the figure, 0..1 of its pixels. */
  blood: number;
  /** Seconds-ish phase for cloth waving. */
  wave: number;
  /** Gunfire: 1 flash, 2 smoke, 3 thinning smoke. */
  fx: number;
}

function basePose(): Pose {
  return {
    bob: 0, lean: 0, twist: 0, pz: 0, fl: [-0.95, 0.55, 0.45], fr: [0.95, 0.55, -0.35], hl: [-1.7, -1.2, 1.7], hr: [2.1, -1.8, 1.1],
    w: nrm([0.1, 1, 0.45]), aim: [0, 0, 1], draw: 0, loaded: true, head: 0, fall: 0, drop: false, spray: 0, knife: false, kneel: false, planted: false, blood: 0, wave: 0, fx: 0,
  };
}

/** Where a foot is through a stride: forward (z) and lift (y). */
function gaitFoot(ph: number, stride: number, lift: number, stance: number): [number, number] {
  ph = ((ph % 1) + 1) % 1;
  if (ph < stance) return [stride * (1 - (2 * ph) / stance), 0];
  const k = (ph - stance) / (1 - stance);
  return [stride * (-1 + 2 * k), lift * Math.sin(k * Math.PI)];
}

function stride(p: Pose, ph: number, len: number, lift: number, bob: number, stance: number): void {
  const [zl, yl] = gaitFoot(ph, len, lift, stance);
  const [zr, yr] = gaitFoot(ph + 0.5, len, lift, stance);
  p.fl = [-0.95, 0.55 + yl, zl];
  p.fr = [0.95, 0.55 + yr, zr];
  p.bob = -bob * Math.cos(ph * 2 * TAU) - bob * 0.5;
}

const N = (x: number, y: number, z: number): V3 => nrm([x, y, z]);

/** The pose of a man for a style, animation and frame. */
function manPose(st: Style, anim: Anim, f: number, mounted: boolean): Pose {
  const p = basePose();
  const n = FRAMES[anim];
  const ph = f / n;
  p.wave = ph * TAU;
  let swing = 0;
  if (!mounted) {
    if (anim === Anim.Walk) {
      stride(p, ph, 1.5, 0.9, 0.18, 0.55);
      p.lean = 0.05;
      swing = Math.sin(ph * TAU);
    } else if (anim === Anim.Run) {
      stride(p, ph, 2.4, 1.7, 0.35, 0.4);
      p.lean = 0.26;
      swing = Math.sin(ph * TAU);
    }
  } else if (anim === Anim.Run) p.lean = 0.12;
  if (anim === Anim.Idle) p.bob -= 0.18 * (0.5 - 0.5 * Math.cos(ph * TAU));
  const breathe = anim === Anim.Idle ? 0.15 * Math.sin(ph * TAU) : 0;
  const lunge = (k: number) => {
    if (mounted) return;
    p.fl = [-0.95, 0.55, 0.45 + 1.1 * k];
    p.fr = [0.95, 0.55, -0.35 - 0.6 * k];
    p.pz = 0.5 * k;
    p.bob -= 0.3 * k;
  };
  const moving = anim === Anim.Walk || anim === Anim.Run;
  const run = anim === Anim.Run;

  switch (st) {
    case 'sword':
    case 'marshal':
    case 'crew': {
      p.hr = [2.1, -1.7 + breathe + swing * 0.2, 1.2 - swing * 0.3];
      p.w = N(0.15, 1, 0.5);
      if (st === 'crew') {
        p.hr = [2.2, -2.2 + breathe, 0.7 - swing * 0.9];
        p.w = N(0.1, 0.4, 1);
        p.hl = [-2.2, -2.2, 0.6 + swing * 0.9];
      } else p.hl = [-1.4, -0.9 + breathe, 2.0];
      if (st === 'marshal') p.hl = [-1.9, -0.6, 1.2];
      if (run && st !== 'crew') {
        p.hr = [1.9, -0.4, 1.7];
        p.w = N(0.1, 0.7, 1);
        if (st === 'sword') p.hl = [-1.3, -0.3, 2.1];
      }
      if (anim === Anim.Attack || anim === Anim.Shoot) {
        const A = [
          { hr: [2.0, 2.2, -0.6], w: N(0.4, 0.55, -1), tw: -0.45, ln: -0.08, k: 0 },
          { hr: [1.2, 1.2, 2.3], w: N(-0.2, 0.45, 1), tw: 0.1, ln: 0.12, k: 0.6 },
          { hr: [-0.4, -0.9, 2.5], w: N(-0.6, -0.7, 0.6), tw: 0.45, ln: 0.22, k: 1 },
          { hr: [1.7, -0.9, 1.8], w: N(0.1, 0.5, 1), tw: 0.15, ln: 0.06, k: 0.4 },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.twist = A.tw;
        p.lean += A.ln;
        lunge(A.k);
        if (st === 'crew') p.hl = [-2.0, -1.4, 1.2];
      }
      break;
    }
    case 'spear':
    case 'cavspear': {
      p.hr = [2.0, -1.0 + breathe, 1.0];
      p.w = N(0, 1, 0.1 + swing * 0.04);
      p.hl = [-1.6, -1.1 + breathe, 1.8];
      if (run) {
        p.hr = [1.8, -0.6, 0.2];
        p.w = N(-0.06, -0.06, 1);
        p.hl = [-1.4, -0.4, 2.0];
      }
      if (anim === Anim.Attack || anim === Anim.Shoot) {
        const A = [
          { hr: [1.9, -0.2, -0.9], w: N(-0.05, 0.02, 1), ln: -0.06, k: 0 },
          { hr: [1.5, 0.1, 2.4], w: N(-0.08, -0.05, 1), ln: 0.22, k: 1 },
          { hr: [1.4, 0.0, 2.7], w: N(-0.08, -0.06, 1), ln: 0.26, k: 1 },
          { hr: [1.8, -0.4, 0.6], w: N(-0.05, 0.1, 1), ln: 0.06, k: 0.3 },
        ][f]!;
        if (st === 'cavspear') {
          // Overhand from the saddle: a downward stab.
          const B = [
            { hr: [2.0, 2.4, -0.5], w: N(0, -0.25, 1) },
            { hr: [1.8, 1.6, 2.0], w: N(0, -0.45, 1) },
            { hr: [1.6, 0.8, 2.8], w: N(0, -0.5, 1) },
            { hr: [2.0, 1.2, 0.8], w: N(0, -0.2, 1) },
          ][f]!;
          p.hr = B.hr as V3;
          p.w = B.w;
        } else {
          p.hr = A.hr as V3;
          p.w = A.w;
          p.lean += A.ln;
          lunge(A.k);
        }
      }
      break;
    }
    case 'javelin': {
      p.hr = [2.1, -1.4 + breathe, 1.0 - swing * 0.3];
      p.w = N(0.05, 1, 0.25);
      p.hl = [-1.7, -1.3 + breathe, 1.6];
      if (run) {
        p.hr = [2.0, -0.8, 0.4];
        p.w = N(0, 0.35, 1);
      }
      if (anim === Anim.Shoot) {
        const A = [
          { hr: [2.3, 1.4, -1.7], w: N(0, 0.3, 1), tw: -0.5, ln: -0.12, hl: [-1.4, 0.6, 2.4], k: 0, ld: true },
          { hr: [1.6, 2.0, 0.9], w: N(0, 0.25, 1), tw: 0.1, ln: 0.1, hl: [-1.8, -0.4, 1.8], k: 0.6, ld: true },
          { hr: [0.6, 0.0, 2.6], w: N(0, -0.2, 1), tw: 0.45, ln: 0.28, hl: [-2.0, -1.0, 0.6], k: 1, ld: false },
          { hr: [2.0, -1.3, 1.2], w: N(0.05, 1, 0.25), tw: 0.1, ln: 0.08, hl: [-1.7, -1.2, 1.6], k: 0.4, ld: false },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.twist = A.tw;
        p.lean += A.ln;
        p.hl = A.hl as V3;
        p.loaded = A.ld;
        lunge(A.k);
      } else if (anim === Anim.Attack) {
        const A = [
          { hr: [2.0, 0.0, -0.6], w: N(0, -0.05, 1), k: 0 },
          { hr: [1.6, 0.0, 2.3], w: N(0, -0.1, 1), k: 1 },
          { hr: [1.6, -0.1, 2.5], w: N(0, -0.1, 1), k: 1 },
          { hr: [2.0, -0.6, 0.8], w: N(0, 0.2, 1), k: 0.3 },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.lean += 0.1 * A.k;
        lunge(A.k);
      }
      break;
    }
    case 'bow':
    case 'horsebow': {
      p.hl = [-2.1, -1.6 + breathe, 0.9 + swing * 0.4];
      p.aim = N(0, 0.05, 1);
      p.hr = [2.2, -2.1 + breathe, 0.5 - swing * 0.5];
      if (anim === Anim.Shoot) {
        const aim = N(0, 0.42, 1);
        const A = [
          { tw: 0.55, hl: madd([-0.9, 1.0, 0.6], aim, 3.0), hr: [-0.4, 1.0, 2.2], draw: 0, ld: true },
          { tw: 0.75, hl: madd([-1.0, 1.0, 0.6], aim, 3.2), hr: [0.9, 1.6, -0.3], draw: 1, ld: true },
          { tw: 0.75, hl: madd([-1.0, 1.0, 0.6], aim, 3.2), hr: [1.8, 1.7, -1.1], draw: 0, ld: false },
          { tw: 0.4, hl: madd([-1.0, 0.4, 0.6], aim, 2.6), hr: [1.5, 1.6, -1.4], draw: 0, ld: false },
        ][f]!;
        p.twist = A.tw;
        p.hl = A.hl;
        p.hr = A.hr as V3;
        p.aim = aim;
        p.draw = A.draw;
        p.loaded = A.ld;
        p.head = -0.1;
      } else if (anim === Anim.Attack) {
        // A knife in the right hand, the bow kept low in the left.
        const A = [
          { hr: [2.0, 1.6, -0.2], w: N(0.2, 0.5, 1), k: 0 },
          { hr: [1.0, 0.4, 2.4], w: N(-0.2, 0.1, 1), k: 1 },
          { hr: [0.0, -0.8, 2.2], w: N(-0.5, -0.5, 1), k: 1 },
          { hr: [1.8, -0.9, 1.4], w: N(0, 0.4, 1), k: 0.3 },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.knife = true;
        lunge(A.k);
      }
      break;
    }
    case 'xbow': {
      p.aim = N(0, -0.35, 1);
      p.hr = [1.1, -1.6 + breathe, 1.2];
      p.hl = madd(p.hr, p.aim, 2.1);
      p.draw = 1;
      if (moving) {
        p.aim = N(0.35, 0.85, -0.25);
        p.hr = [1.6, -1.0, 1.0];
        p.hl = [-1.4, -1.3, 1.5];
      }
      if (anim === Anim.Shoot) {
        const A = [
          { aim: N(0, 0.05, 1), hr: [0.9, 1.0, 0.7], draw: 1, ld: true, ln: 0 },
          { aim: N(0, 0.08, 1), hr: [0.8, 1.05, 0.8], draw: 1, ld: true, ln: 0.02 },
          { aim: N(0, 0.2, 1), hr: [0.9, 1.2, 0.3], draw: 0, ld: false, ln: -0.1 },
          { aim: N(0, -0.9, 0.35), hr: [0.7, -1.4, 1.5], draw: 0, ld: false, ln: 0.35 },
        ][f]!;
        p.aim = A.aim;
        p.hr = A.hr as V3;
        p.hl = madd(p.hr, p.aim, 2.0);
        p.draw = A.draw;
        p.loaded = A.ld;
        p.lean += A.ln;
        p.twist = 0.15;
      } else if (anim === Anim.Attack) {
        // Clubbing with the stock.
        const A = [
          { aim: N(0, 0.8, -0.6), hr: [1.4, 1.6, 0.2], ln: -0.08, k: 0 },
          { aim: N(0, 0.4, 1), hr: [1.0, 1.4, 1.8], ln: 0.1, k: 0.6 },
          { aim: N(0, -0.6, 1), hr: [0.8, -0.2, 2.4], ln: 0.25, k: 1 },
          { aim: N(0, -0.3, 1), hr: [1.1, -1.2, 1.4], ln: 0.05, k: 0.3 },
        ][f]!;
        p.aim = A.aim;
        p.hr = A.hr as V3;
        p.hl = madd(p.hr, p.aim, 1.6);
        p.lean += A.ln;
        p.draw = 0;
        p.loaded = false;
        lunge(A.k);
      }
      break;
    }
    case 'poleaxe': {
      p.hr = [1.5, -1.2 + breathe, 1.5];
      p.w = N(0.1, 1, 0.12);
      if (run) {
        p.hr = [1.3, -0.6, 1.4];
        p.w = N(-0.1, 0.4, 1);
      }
      if (anim === Anim.Attack || anim === Anim.Shoot) {
        const A = [
          { hr: [0.7, 2.4, -0.6], w: N(0, 0.55, -1), ln: -0.16, k: 0 },
          { hr: [0.4, 2.0, 1.4], w: N(0, 1, 0.5), ln: 0.0, k: 0.4 },
          { hr: [0.3, -0.5, 2.3], w: N(0, -0.25, 1), ln: 0.36, k: 1 },
          { hr: [0.9, -0.9, 1.8], w: N(0, 0.5, 1), ln: 0.12, k: 0.6 },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.lean += A.ln;
        lunge(A.k);
      }
      p.hl = madd(p.hr, p.w, 1.9);
      break;
    }
    case 'lance': {
      p.hr = [2.0, -0.9 + breathe, 0.7];
      p.w = N(0.04, 1, 0.12);
      p.hl = [-1.5, -1.0 + breathe, 1.8];
      if (run) {
        p.hr = [1.7, -0.7, 0.1];
        p.w = N(-0.14, -0.04, 1);
      }
      if (anim === Anim.Attack || anim === Anim.Shoot) {
        const A = [
          { hr: [1.8, -0.4, 0.1], w: N(-0.08, 0.35, 1), ln: 0.0 },
          { hr: [1.7, -0.7, 0.4], w: N(-0.14, -0.05, 1), ln: 0.1 },
          { hr: [1.5, -0.6, 1.7], w: N(-0.14, -0.08, 1), ln: 0.26 },
          { hr: [1.9, -0.5, 0.6], w: N(-0.05, 0.6, 1), ln: 0.05 },
        ][f]!;
        p.hr = A.hr as V3;
        p.w = A.w;
        p.lean += A.ln;
      }
      break;
    }
  }
  if (mounted && st !== 'bow' && st !== 'horsebow' && st !== 'marshal' && !(anim === Anim.Attack && st === 'lance')) {
    // Reins in the shield hand.
    if (st !== 'lance' && st !== 'cavspear') p.hl = [-1.2, -1.4, 2.0];
  }
  if (anim === Anim.Brace) brace(p, st, f, mounted);
  hurt(p, anim, f, mounted);
  return p;
}

/** Brace: the stance a block holds when it locks up (shield wall, pike wall, pavises, couched lances). */
function brace(p: Pose, st: Style, f: number, mounted: boolean): void {
  const k = f === 1 ? 1 : 0;
  const crouch = (b: number, ln: number) => {
    p.bob = -b - 0.12 * k;
    p.lean = ln;
    if (!mounted) {
      p.fl = [-1.15, 0.55, 1.1];
      p.fr = [1.15, 0.55, -0.9];
    }
  };
  switch (st) {
    case 'sword':
      crouch(0.6, 0.14);
      p.hl = [-0.8, 0.5 - 0.1 * k, 2.4];
      p.hr = [1.8, 1.3 - 0.1 * k, 1.0 + 0.2 * k];
      p.w = N(-0.05, 0.22, 1);
      break;
    case 'spear':
      crouch(1.0, 0.2);
      // Overhand at the shoulder, tips forward and a little up, so they show over the front rank.
      p.hr = [1.7, 1.5 - 0.1 * k, -0.6 + 0.3 * k];
      p.w = N(-0.06, 0.3, 1);
      p.hl = [-1.1, 0.0, 2.2];
      break;
    case 'javelin':
      crouch(0.9, 0.16);
      p.hr = [2.2, 1.6 - 0.1 * k, -1.2];
      p.w = N(0, 0.25, 1);
      p.twist = -0.3;
      p.hl = [-1.4, 0.0, 2.2];
      break;
    case 'bow': {
      p.kneel = true;
      p.bob = -2.6;
      p.fl = [-0.95, 0.55, 1.5];
      p.fr = [0.95, 0.55, -2.6];
      const aim = N(0, 0.3, 1);
      p.twist = 0.7;
      p.aim = aim;
      p.hl = madd([-1.0, 1.0, 0.6], aim, 3.1);
      p.hr = [0.4 + 0.3 * k, 1.4, 0.4 - 0.4 * k];
      p.draw = 1;
      p.loaded = true;
      break;
    }
    case 'horsebow': {
      const aim = N(-0.85, 0.3, 0.45);
      p.twist = 0.15;
      p.aim = aim;
      p.hl = madd([-1.95, 1.15, 0], aim, 3.0);
      p.hr = [0.6 + 0.3 * k, 1.4, -0.2];
      p.draw = 1;
      p.loaded = true;
      break;
    }
    case 'xbow':
      p.planted = true;
      crouch(1.1, 0.12);
      p.aim = N(0, 0.04, 1);
      p.hr = [0.9, 1.0 - 0.05 * k, 0.7];
      p.hl = madd(p.hr, p.aim, 2.0);
      p.draw = 1;
      p.loaded = true;
      break;
    case 'poleaxe':
      crouch(0.4, 0.06);
      p.hr = [0.9, 1.5 + 0.15 * k, 0.8];
      p.w = N(0, 0.78, 0.62);
      p.hl = madd(p.hr, p.w, 1.9);
      break;
    case 'lance':
    case 'cavspear':
      p.hr = [1.7, -0.7 + 0.15 * k, 0.1];
      p.w = N(-0.14, -0.04, 1);
      p.lean = 0.08;
      p.bob = 0.2 * k;
      break;
    case 'marshal':
      p.hl = [-1.4, 2.2 + 0.2 * k, 1.0];
      break;
    case 'crew':
      break;
  }
}

/** The pose for a look: its style's pose, adjusted for the weapon and the body. */
function posed(L: Look, anim: Anim, f: number, mounted: boolean): Pose {
  const p = manPose(L.style, anim, f, mounted);
  const hurtAnim = anim === Anim.Hit || anim === Anim.Die || anim === Anim.Dead;
  const k = f === 1 ? 1 : 0;
  switch (L.weapon) {
    case 'katana':
      if (anim === Anim.Brace) {
        // Hassō: the blade upright by the right shoulder, knees bent.
        p.hr = [1.0, 1.6 - 0.1 * k, 0.6];
        p.w = N(0.2, 1, 0.3);
        p.bob = -0.7;
        p.lean = 0.08;
        if (!mounted) {
          p.fl = [-1.15, 0.55, 1.0];
          p.fr = [1.15, 0.55, -0.9];
        }
      }
      if (!hurtAnim) p.hl = madd(p.hr, p.w, -1.0);
      break;
    case 'naginata':
      if (anim === Anim.Brace) {
        p.hr = [1.3, -0.5 + 0.1 * k, 1.0];
        p.w = N(-0.05, 0.12, 1);
        p.hl = madd(p.hr, p.w, 2.0);
        p.bob = -0.8;
        p.fl = [-1.4, 0.55, 1.2];
        p.fr = [1.4, 0.55, -1.0];
      }
      break;
    case 'teppo':
      if (anim === Anim.Shoot) p.fx = [0, 0, 1, 2][f]!;
      if (anim === Anim.Brace) {
        p.kneel = true;
        p.bob = -2.6;
        p.fl = [-0.95, 0.55, 1.5];
        p.fr = [0.95, 0.55, -2.6];
        p.hr = [0.9, 1.0 - 0.05 * k, 0.7];
        p.aim = N(0, 0.03, 1);
        p.hl = madd(p.hr, p.aim, 2.0);
      }
      break;
    case 'club':
      if (anim === Anim.Brace) {
        p.hr = [1.2, -0.4 + 0.15 * k, 1.6];
        p.w = N(-1, 0.35, 0.35);
        p.hl = madd(p.hr, p.w, 1.6);
      }
      break;
  }
  if (L.hunch && !hurtAnim) {
    p.lean += L.hunch;
    p.head -= L.hunch * 0.8;
  }
  if ((L.body ?? 'man') !== 'man') p.blood = 0;
  return p;
}

/** Hit, Die and Dead override the style's pose. */
function hurt(p: Pose, anim: Anim, f: number, mounted: boolean): void {
  if (anim === Anim.Hit) {
    p.lean = f === 0 ? -0.3 : -0.12;
    p.head = f === 0 ? -0.35 : -0.12;
    p.twist = 0.18;
    p.hr = add(p.hr, f === 0 ? [0.4, 0.5, -0.9] : [0.2, 0.2, -0.4]);
    p.hl = add(p.hl, f === 0 ? [-0.3, 0.5, -0.7] : [-0.1, 0.2, -0.3]);
    p.spray = f + 1;
    if (!mounted) {
      p.fl = [-0.95, 0.55, 0.2];
      p.fr = [0.95, 0.55, f === 0 ? -1.1 : -0.7];
      p.pz = f === 0 ? -0.5 : -0.2;
    }
  } else if (anim === Anim.Die || anim === Anim.Dead) {
    const k = anim === Anim.Dead ? 5 : f;
    const flung = (hi: number) => {
      p.hr = [2.7, hi, -0.4];
      p.hl = [-2.6, hi + 0.2, -0.2];
    };
    p.head = -0.4;
    p.spray = k === 0 ? 1 : 0;
    if (k === 0) {
      p.lean = -0.38;
      p.twist = 0.25;
      flung(0.6);
      if (!mounted) {
        p.fl = [-0.95, 0.55, 0.9];
        p.fr = [0.95, 0.55, -0.9];
      }
    } else {
      p.fall = [0, 0.3, 0.85, 1.3, Math.PI / 2, Math.PI / 2][k]!;
      p.bob = [0, -1.6, -1.1, -0.6, -0.4, -0.4][k]!;
      p.lean = k === 1 ? -0.15 : -0.05;
      if (k === 1) {
        p.hr = [2.4, -1.4, 0.5];
        p.hl = [-2.4, -1.3, 0.7];
      } else flung(k >= 4 ? 1.6 : 1.0);
      if (!mounted) {
        p.fl = [-1.4, 0.55, 0.9];
        p.fr = [1.3, 0.55, k >= 4 ? -0.2 : 0.1];
      }
      p.drop = k >= 3;
      p.blood = k === 5 ? 0.2 : k >= 3 ? 0.07 : 0.03;
    }
  }
}

/** Front of the face: eyes, beard. */
function face(l: V3, beard: boolean, other: number): number {
  if (l[2] > 0.3 && l[1] < 0.42 && l[1] > -0.95 && Math.abs(l[0]) < 0.78) {
    if (l[2] > 0.55 && l[1] > -0.02 && l[1] < 0.3 && Math.abs(l[0]) > 0.15 && Math.abs(l[0]) < 0.62) return F(R.ink, 1);
    if (beard && l[1] < -0.38) return R.hair;
    return R.skin;
  }
  return other;
}

/** A skull: big, dark sockets (green-lit for officers), nose hole, a row of teeth. */
function skullMat(glow: boolean): Mat {
  return (l) => {
    if (l[2] > 0.4) {
      const ax = Math.abs(l[0]);
      if (l[1] > -0.08 && l[1] < 0.38 && ax > 0.1 && ax < 0.66) return glow && ax > 0.22 && ax < 0.5 && l[1] > 0.04 && l[1] < 0.26 ? F(R.glow, 3) : F(R.ink, 0);
      if (ax < 0.12 && l[1] > -0.4 && l[1] < -0.12) return F(R.ink, 1);
      if (l[1] < -0.6) return ax < 0.6 && Math.floor(l[0] * 6) % 2 === 0 ? F(R.ink, 1) : R.bone;
    }
    return R.bone;
  };
}

function skull(f: Fig, glow: boolean, r = 1.0): void {
  f.ell([0, 0.05, 0.05], [1.6 * r, 1.7 * r, 1.7 * r], skullMat(glow));
  f.ell([0, -1.3 * r, 0.55 * r], [0.95 * r, 0.45 * r, 0.85 * r], R.bone);
}

function head(f: Fig, L: Look): void {
  const beard = L.beard ?? true;
  const glow = !!L.glow;
  switch (L.helm) {
    case 'kabuto':
    case 'daimyo': {
      // Menpō (dark lacquer mask, eye slits), a low bowl, the flared shikoro neck guard laced in
      // vermilion, fukigaeshi wings, and the gold maedate crest.
      f.ell([0, -0.1, 0], [1.45, 1.55, 1.5], (l) => (l[2] > 0.55 && l[1] > -0.05 && l[1] < 0.28 && Math.abs(l[0]) > 0.15 && Math.abs(l[0]) < 0.62 ? F(R.ink, 0) : R.lacquer));
      f.ell([0, 0.55, 0], [1.62, 1.25, 1.68], R.lacquer, { lo: 0 });
      f.ell([0, 0.25, -0.25], [2.3, 1.1, 2.2], (l) => (l[2] > 0.3 ? -1 : Math.floor((l[1] + 1) * 2.4) % 2 ? R.vermilion : R.lacquer), { lo: -0.95, hi: 0.25 });
      for (const sx of [-1, 1]) f.box([sx * 1.75, 0.55, 0.55], [0.5, 0, 0], [0, 0.6, 0], [0, 0, 0.14], R.lacquer);
      if (L.helm === 'daimyo') {
        // A great crescent.
        f.poly([[-1.9, 3.2, 1.0], [-1.2, 2.1, 1.15], [0, 1.65, 1.2], [1.2, 2.1, 1.15], [1.9, 3.2, 1.0]], F(R.gold, 3));
        f.poly([[-1.6, 3.0, 0.9], [-0.9, 2.2, 1.05], [0.9, 2.2, 1.05], [1.6, 3.0, 0.9]], F(R.gold, 2));
      } else f.cap([0, 1.5, 0.95], [0, 2.4, 1.15], 0.46, F(R.gold, 3));
      break;
    }
    case 'jingasa':
      f.ell([0, -0.05, 0], [1.45, 1.55, 1.5], (l) => face(l, false, R.hair));
      f.ell([0, 0.75, 0], [2.95, 0.9, 2.95], (l) => (l[1] > 0.55 && l[2] > 0.25 && Math.abs(l[0]) < 0.22 ? F(R.gold, 3) : R.lacquer), { lo: 0 });
      break;
    case 'hachimaki':
      f.ell([0, -0.05, 0], [1.45, 1.55, 1.5], (l) => (l[1] > 0.2 && l[1] < 0.45 ? F(R.paper, 2) : l[1] >= 0.45 ? R.hair : face(l, false, R.hair)));
      f.ell([0, 1.2, -0.6], [0.45, 0.6, 0.6], R.hair);
      break;
    case 'cowl':
      // Sōhei katō: white cloth wrapping head and face, only the eyes showing.
      f.ell([0, 0, 0], [1.6, 1.7, 1.65], (l) => (l[2] > 0.5 && l[1] > -0.02 && l[1] < 0.32 && Math.abs(l[0]) < 0.7 ? (Math.abs(l[0]) > 0.18 && Math.abs(l[0]) < 0.55 ? F(R.ink, 0) : R.skin) : R.paper));
      f.ell([0, -1.6, -0.1], [2.25, 0.95, 1.75], R.paper, { lo: -0.2 });
      break;
    case 'skull':
      skull(f, glow);
      break;
    case 'skullHelm':
      skull(f, glow);
      f.ell([0, 0.45, -0.05], [1.8, 1.35, 1.85], (l) => (l[2] > 0.6 && Math.abs(l[0]) < 0.16 && l[1] < 0.3 ? R.rust : l[2] > 0.35 && l[1] < 0.25 ? -1 : R.rust), { lo: 0 });
      break;
    case 'skullKettle':
      skull(f, glow);
      f.ell([0, 0.55, 0], [1.7, 1.2, 1.7], R.rust, { lo: 0 });
      f.ell([0, 0.55, 0], [2.6, 0.3, 2.6], (l) => (hash2(Math.floor(l[0] * 4), Math.floor(l[2] * 4), 9) < 0.12 ? -1 : R.rust));
      break;
    case 'skullHood':
      skull(f, glow);
      f.ell([0, 0.15, -0.1], [1.85, 1.95, 1.9], (l) => (l[2] > 0.35 ? -1 : R.rag));
      f.cap([0, 0.5, -1.0], [0, -0.8, -2.2], 0.6, R.rag);
      break;
    case 'skullCrown':
      skull(f, glow);
      f.ell([0, 1.1, 0], [1.45, 0.35, 1.45], R.bplate, { lo: -1, hi: 1 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        f.line([Math.sin(a) * 1.35, 1.2, Math.cos(a) * 1.35], [Math.sin(a) * 1.45, 2.1, Math.cos(a) * 1.45], R.bplate);
      }
      break;
    case 'deathHelm':
      f.ell([0, 0.05, 0.05], [1.62, 1.9, 1.7], (l) => (l[2] > 0.45 && l[1] > 0.12 && l[1] < 0.38 ? F(R.glow, 3) : R.bplate), { lo: -1, hi: 0.72, capHi: true });
      f.cap([0, 1.5, -0.2], [0, 2.4, -1.4], 0.45, R.rag);
      break;
    case 'ghoul':
      f.ell([0, -0.1, 0.15], [1.4, 1.5, 1.6], (l) => {
        if (l[2] > 0.5 && l[1] > -0.05 && l[1] < 0.3 && Math.abs(l[0]) > 0.15 && Math.abs(l[0]) < 0.6) return F(R.ink, 0);
        if (l[2] > 0.6 && l[1] < -0.45 && Math.abs(l[0]) < 0.5) return F(R.ink, 1);
        return R.ghoul;
      });
      break;
    case 'wraith':
      // A deep hood: a dark void with a pale skull and two green points inside.
      f.ell([0, -0.05, 0.25], [1.35, 1.45, 1.4], skullMat(true));
      f.ell([0, 0.2, -0.15], [1.95, 2.1, 2.0], (l) => (l[2] > 0.45 && l[1] < 0.55 && Math.abs(l[0]) < 0.72 ? -1 : R.rag));
      f.cap([0, 0.9, -1.2], [0, -0.4, -2.6], 0.65, R.rag);
      break;
    case 'skulls':
      // The colossus: a cluster of skulls fused into one head.
      skull(f, true, 1.1);
      for (const sx of [-1, 1]) {
        f.push([sx * 1.7, -0.8, -0.3], ry(sx * 0.5));
        skull(f, false, 0.75);
        f.pop();
      }
      break;
    case 'great':
    case 'marshal': {
      f.ell([0, 0.05, 0.05], [1.62, 1.9, 1.7], (l) => {
        if (l[2] > 0.45 && l[1] > 0.1 && l[1] < 0.4) return F(R.ink, 0);
        if (l[2] > 0.55 && Math.abs(l[0]) < 0.2 && l[1] < 0.1) return F(R.ink, 1);
        if (L.helm === 'marshal' && l[1] > 0.55) return R.gold;
        return R.plate;
      }, { lo: -1, hi: 0.72, capHi: true });
      if (L.plume !== undefined) {
        f.cap([0, 1.7, 0], [0, 2.6, -0.5], 0.6, L.plume);
        f.cap([0, 2.6, -0.5], [0, 2.1, -1.8], 0.5, L.plume);
      }
      break;
    }
    case 'nasal':
      f.ell([0, 0, 0], [1.5, 1.6, 1.55], (l) => {
        if (l[1] > 0.2) return R.plate;
        if (l[2] > 0.55 && Math.abs(l[0]) < 0.22 && l[1] > -0.5) return R.plate;
        return face(l, beard, R.mail);
      });
      f.ell([0, 1.0, 0], [0.95, 1.0, 0.95], R.plate, { lo: 0 });
      break;
    case 'kettle':
      f.ell([0, -0.05, 0], [1.45, 1.55, 1.5], (l) => face(l, beard, R.mail));
      f.ell([0, 0.55, 0], [1.6, 1.15, 1.6], R.plate, { lo: 0 });
      f.ell([0, 0.55, 0], [2.6, 0.32, 2.6], R.plate);
      break;
    case 'hood': {
      const hc = L.hood ?? R.team;
      f.ell([0, 0, 0], [1.55, 1.65, 1.6], (l) => (l[2] > 0.42 && l[1] < 0.5 && Math.abs(l[0]) < 0.72 ? face(l, beard, hc) : hc));
      f.cap([0, 0.5, -0.9], [0, -0.6, -2.0], 0.55, hc);
      f.ell([0, -1.65, -0.1], [2.3, 0.9, 1.7], hc, { lo: -0.2 });
      break;
    }
    case 'cap':
      f.ell([0, 0, 0], [1.45, 1.55, 1.5], (l) => face(l, beard, R.hair));
      f.ell([0, 0.55, -0.05], [1.6, 1.05, 1.62], R.team, { lo: 0 });
      break;
    case 'turban':
      f.ell([0, 0, 0], [1.45, 1.55, 1.5], (l) => face(l, beard, R.mail));
      f.ell([0, 0.7, 0], [1.25, 1.3, 1.25], R.plate, { lo: 0 });
      f.line([0, 1.9, 0], [0, 2.5, 0], R.plate);
      f.ell([0, 0.55, 0], [1.75, 0.65, 1.75], (l) => (Math.abs(l[1] - l[0] * 0.4) < 0.2 ? R.white : R.team));
      break;
    case 'sallet':
      f.ell([0, 0.1, 0.02], [1.6, 1.95, 1.7], (l) => (l[2] > 0.45 && l[1] > 0.05 && l[1] < 0.3 ? F(R.ink, 0) : R.dplate), { lo: -1, hi: 0.85, capHi: true });
      if (L.plume !== undefined) {
        f.cap([0, 1.9, 0], [0, 2.8, -0.6], 0.6, L.plume);
        f.cap([0, 2.8, -0.6], [0, 2.3, -2.0], 0.55, L.plume);
      }
      break;
  }
}

function arm(f: Fig, L: Look, sh: V3, hand: V3, side: number): void {
  const body = L.body ?? 'man';
  const k = LIMB[body];
  const reach = body === 'colossus' ? 1.3 : 1;
  const elbow = ik(sh, hand, 2.2 * reach, 2.25 * reach, [side * 0.7, -0.5, -0.6]);
  f.cap(sh, elbow, 0.78 * k, L.sleeve);
  f.cap(elbow, hand, 0.68 * k, L.sleeve);
  f.ell(hand, [0.58 * k + 0.1, 0.58 * k + 0.1, 0.58 * k + 0.1], L.hand);
}

/** A shield device at (u, v) on the face (-1..1), or undefined for the plain field. */
function emblemAt(L: Look, u: number, v: number): number | undefined {
  switch (L.emblem) {
    case 'skull':
      if (u * u + (v - 0.15) * (v - 0.15) < 0.09) return Math.abs(u) > 0.08 && Math.abs(u) < 0.2 && v > 0.12 && v < 0.25 ? F(R.ink, 0) : R.bone;
      return undefined;
    case 'crack':
      return Math.abs(u - v * 0.55 - 0.1) < 0.07 ? F(R.ink, 1) : undefined;
    case 'mon':
      return u * u + v * v < 0.06 ? F(R.gold, 3) : undefined;
  }
  return undefined;
}

/** The lich's staff in the left hand, crowned with a green-burning skull. */
function lichStaff(f: Fig, p: Pose): void {
  const hl = p.hl;
  f.line(add(hl, [0, -5.0, 0]), add(hl, [0, 8.6, 0]), R.ash);
  f.push(add(hl, [0, 9.6, 0.1]));
  f.ell([0, 0, 0], [1.6, 1.6, 1.6], (l) => (hash2(Math.floor(l[0] * 3), Math.floor(l[1] * 3), 6 + Math.floor(p.wave)) < 0.5 ? -1 : F(R.glow, 2)));
  skull(f, true, 0.6);
  f.pop();
}

/** Weapons that only look different: the style still sets how they move. */
function weaponLook(f: Fig, L: Look, p: Pose): boolean {
  const hr = p.hr, w = p.w;
  const blade = L.blade ?? R.steel;
  switch (L.weapon) {
    case undefined:
    case 'sword':
      return false;
    case 'katana': {
      // A long, slightly curved blade, held two-handed; a dark tsuba.
      const c = perp(w);
      const back = c[1] > 0 ? c : scl(c, -1);
      f.poly([madd(hr, w, 0.6), add(madd(hr, w, 3.0), scl(back, 0.25)), add(madd(hr, w, 5.4), scl(back, 0.7))], (l) => F(blade, l[0] < 0.5 ? 3 : 2));
      f.ell(madd(hr, w, 0.5), [0.42, 0.42, 0.42], F(R.ink, 2));
      return true;
    }
    case 'yari':
      f.line(madd(hr, w, -5.2), madd(hr, w, 12.6), R.wood);
      f.cap(madd(hr, w, 12.3), madd(hr, w, 14.4), 0.5, (l) => F(blade, l[0] < 0.4 ? 2 : 3));
      return true;
    case 'naginata': {
      f.line(madd(hr, w, -2.8), madd(hr, w, 5.6), R.lacquer);
      const c = perp(w);
      const edge = c[2] > 0 ? c : scl(c, -1);
      const a0 = madd(hr, w, 5.6);
      f.poly([a0, add(madd(hr, w, 7.0), scl(edge, 0.35)), add(madd(hr, w, 8.2), scl(edge, 0.9))], F(blade, 3));
      f.poly([add(a0, scl(edge, 0.4)), add(madd(hr, w, 6.9), scl(edge, 0.85))], F(blade, 2));
      return true;
    }
    case 'saihai':
      f.line(hr, madd(hr, w, 2.2), R.lacquer);
      f.ell(madd(hr, w, 2.6), [0.65, 0.65, 0.65], F(R.paper, 3));
      return true;
    case 'bone':
      if (p.loaded) {
        f.cap(madd(hr, w, -0.4), madd(hr, w, 2.8), 0.45, R.bone);
        f.ell(madd(hr, w, 3.0), [0.45, 0.45, 0.45], R.bone);
      }
      f.ell(add(p.hl, [-0.3, -0.8, -0.4]), [0.9, 1.1, 0.9], R.rag);
      return true;
    case 'club':
      f.cap(madd(hr, w, -1.2), madd(hr, w, 6.4), 0.62, R.bone);
      f.ell(madd(hr, w, 6.8), [1.25, 1.4, 1.25], R.bone);
      f.ell(madd(hr, w, 7.4), [0.7, 0.7, 0.7], R.bone);
      return true;
    case 'staff':
      return true;
    case 'yumi': {
      // The asymmetric bow: the grip a third of the way up, the upper limb towering over the head.
      const a = p.aim;
      const b = nrm(crs(a, nrm(crs([0, 1, 0], a))));
      const hl = p.hl;
      const bend = p.draw > 0.5 ? 1.4 : 0.8;
      const top = madd(madd(hl, b, L.style === 'horsebow' ? 5.6 : 6.4), a, -bend), bot = madd(madd(hl, b, -3.0), a, -bend * 0.7);
      f.poly([top, madd(madd(hl, b, 3.2), a, -0.35), hl, madd(madd(hl, b, -1.6), a, -0.3), bot], F(R.lacquer, 3));
      const nock = p.draw > 0.5 ? hr : madd(madd(hl, a, -bend), b, 1.6);
      f.poly([top, nock, bot], F(R.string, 3));
      if (p.loaded && p.draw > 0) f.line(madd(hr, a, -0.2), madd(hl, a, 1.4), F(R.paper, 3));
      if (p.knife) f.line(madd(hr, p.w, 0.4), madd(hr, p.w, 2.6), F(blade, 3));
      return true;
    }
    case 'teppo': {
      // A long dark barrel at the cheek, a short stock, a gold pan.
      const a = p.aim;
      f.beam(madd(hr, a, -1.4), madd(hr, a, 4.4), 0.7, 0.8, F(R.ochre, 3));
      f.line(madd(madd(hr, a, 0.4), [0, 0.45, 0], 1), madd(madd(hr, a, 6.0), [0, 0.45, 0], 1), F(R.bplate, 2));
      f.ell(madd(hr, a, 0.9), [0.35, 0.35, 0.35], F(R.gold, 3));
      return true;
    }
  }
}

/** A perpendicular to v, preferring the sagittal plane. */
function perp(v: V3): V3 {
  const p = crs(v, [1, 0, 0]);
  return len(p) > 0.2 ? nrm(p) : nrm(crs(v, [0, 0, 1]));
}

function teamPennant(f: Fig, at: V3, w: V3, phase: number, size = 1): void {
  // Streams back from the shaft: along the shaft if it points forward, else straight back.
  const back: V3 = Math.abs(w[2]) > 0.7 ? scl(w, -1) : [0, 0, -1];
  const down: V3 = Math.abs(w[2]) > 0.7 ? [0, -1, 0] : scl(w, -1);
  f.sheet(at, scl(back, 3.2 * size), scl(down, 1.5 * size), (s) => 0.5 * s * Math.sin(s * 7 - phase), (s, t) =>
    Math.abs(t - 0.5) > 0.55 * (1 - s * 0.85) ? -1 : s > 0.55 && Math.abs(t - 0.5) < 0.12 ? -1 : R.team,
  );
}

/** The weapon in the right hand (and the bow in the left), in the chest frame. */
function weapon(f: Fig, L: Look, p: Pose): void {
  if (weaponLook(f, L, p)) return;
  const hr = p.hr, w = p.w;
  const blade = L.blade ?? R.steel;
  const steel = (l: V3) => F(blade, l[0] < 0.4 ? 3 : 2);
  switch (L.style) {
    case 'sword':
    case 'marshal': {
      f.line(madd(hr, w, 0.6), madd(hr, w, 5.0), steel);
      const g = scl(nrm(crs(w, [0, 0, 1])), 0.95);
      f.line(add(madd(hr, w, 0.55), g), sub(madd(hr, w, 0.55), g), F(R.dleather, 1));
      break;
    }
    case 'crew':
      f.line(madd(hr, w, -0.6), madd(hr, w, 2.4), R.wood);
      f.ell(madd(hr, w, 2.7), [0.65, 0.65, 0.65], R.dplate);
      break;
    case 'spear':
    case 'cavspear':
      f.line(madd(hr, w, L.style === 'spear' ? -4.6 : -3.5), madd(hr, w, 11), R.wood);
      f.cap(madd(hr, w, 10.6), madd(hr, w, 12.9), 0.52, (l) => F(R.steel, l[0] < 0.4 ? 2 : 3));
      break;
    case 'javelin':
      if (p.loaded) {
        f.line(madd(hr, w, -2.6), madd(hr, w, 5.2), R.wood);
        f.line(madd(hr, w, 5.2), madd(hr, w, 6.0), F(R.steel, 3));
      }
      // Spares in the shield hand.
      for (const dx of [-0.3, 0.3]) f.line(add(p.hl, [dx, -2.2, -0.5]), add(p.hl, [dx * 2, 4.4, 0.4]), R.wood);
      break;
    case 'poleaxe': {
      f.line(madd(hr, w, -2.6), madd(hr, w, 6.4), R.dwood);
      const b = perp(w);
      const fwd = b[2] > 0 || (Math.abs(b[2]) < 0.1 && b[1] < 0) ? b : scl(b, -1);
      const hc = madd(hr, w, 5.4);
      f.box(madd(hc, fwd, 0.9), [0.22, 0, 0], scl(w, 1.0), scl(fwd, 0.75), R.steel);
      f.box(madd(hc, fwd, -0.6), [0.3, 0, 0], scl(w, 0.4), scl(fwd, 0.45), R.dplate);
      f.line(madd(hr, w, 6.4), madd(hr, w, 7.6), F(R.steel, 3));
      break;
    }
    case 'lance': {
      if (p.drop) {
        // Broken in the fall: the butt end only.
        f.cap(madd(hr, w, -3.4), madd(hr, w, 4.5), 0.5, R.wood);
        f.line(madd(hr, w, 4.5), add(madd(hr, w, 5.3), [0.3, 0.3, 0]), F(R.wood, 3));
        break;
      }
      f.cap(madd(hr, w, -3.4), madd(hr, w, 16.5), 0.5, (l) => (l[0] > 0.17 && l[0] < 0.21 ? R.dwood : R.wood));
      f.cap(madd(hr, w, 16.5), madd(hr, w, 17.6), 0.45, F(R.steel, 3));
      teamPennant(f, madd(hr, w, 15.6), w, p.wave, 1.25);
      break;
    }
    case 'bow':
    case 'horsebow': {
      const a = p.aim;
      const b = nrm(crs(a, nrm(crs([0, 1, 0], a))));
      const hl = p.hl;
      const bend = p.draw > 0.5 ? 1.45 : 0.9;
      const s = L.style === 'horsebow' ? 2.7 : 3.6;
      const top = madd(madd(hl, b, s), a, -bend), bot = madd(madd(hl, b, -s), a, -bend);
      f.poly([top, madd(madd(hl, b, s * 0.55), a, -0.35), hl, madd(madd(hl, b, -s * 0.55), a, -0.35), bot], F(L.bowWood ?? R.rope, 3));
      const nock = p.draw > 0.5 ? hr : madd(hl, a, -bend);
      f.poly([top, nock, bot], F(R.string, 3));
      if (p.loaded && p.draw > 0) {
        f.line(madd(hr, a, -0.2), madd(hl, a, 1.0), F(R.wood, 3));
        f.line(madd(hl, a, 1.0), madd(hl, a, 1.5), F(R.steel, 3));
      }
      if (p.knife) f.line(madd(hr, p.w, 0.4), madd(hr, p.w, 2.4), steel);
      break;
    }
    case 'xbow': {
      const a = p.aim;
      const side = nrm(crs([0, 1, 0], a));
      const front = madd(hr, a, 2.9);
      f.beam(madd(hr, a, -1.0), madd(hr, a, 3.1), 0.8, 0.9, R.rope);
      const e1 = madd(madd(front, side, 2.3), a, -0.6), e2 = madd(madd(front, side, -2.3), a, -0.6);
      f.poly([e1, front, e2], F(R.steel, 2));
      const nut = p.draw > 0.5 ? madd(hr, a, 0.7) : madd(front, a, -0.25);
      f.poly([e1, nut, e2], F(R.string, 1));
      if (p.loaded) f.line(madd(hr, a, 0.7), madd(front, a, 0.5), F(R.wood, 3));
      break;
    }
  }
}

/** The shield on the left forearm, facing out from the body. */
function shield(f: Fig, L: Look, p: Pose): void {
  if (!L.shield) return;
  // Turned partly toward the eye, as pixel artists cheat shields, so the field reads in every facing.
  const m = f.m;
  // The direction to the eye, (0, sin 30°, cos 30°) in the world, brought into this frame (m is a rotation).
  const toEye: V3 = [m[3] * 0.5 + m[6] * SQ, 0, m[5] * 0.5 + m[8] * SQ];
  const n = nrm(madd(N(0.22, 0.04, 1), nrm(toEye), toEye[2] > -0.2 ? 0.75 : 0.35));
  const ax = nrm(crs([0, 1, 0], n));
  const ay = nrm(crs(n, ax));
  const c = add(p.hl, [-0.2, -0.3, 0.55]);
  if (L.shield === 'kite') {
    f.box(c, scl(ax, 2.0), scl(ay, 3.1), scl(n, 0.22), (l) => {
      const u = Math.abs(l[0]), v = l[1];
      const wv = v > 0.35 ? 1 : 0.12 + (0.88 * (v + 1)) / 1.35;
      if (u > wv) return -1;
      if (l[2] < -0.9) return R.teamDark;
      if (Math.abs(l[2]) < 0.9) return F(R.dleather, 1);
      if (u > wv - 0.2 || v > 0.86) return R.teamDark;
      const em = emblemAt(L, l[0], v - 0.2);
      if (em !== undefined) return em;
      if (u < 0.13 && v > 0.15 && v < 0.4 && !L.emblem) return R.plate;
      return R.team;
    });
  } else {
    const r = L.shield === 'round' ? 2.0 : 1.3;
    f.ellAx(c, scl(ax, r), scl(ay, r), scl(n, 0.35), (l) => {
      if (l[2] < 0) return R.teamDark;
      const d = l[0] * l[0] + l[1] * l[1];
      const em = emblemAt(L, l[0], l[1]);
      if (em !== undefined) return em;
      if (d < 0.07) return R.plate;
      if (d > 0.72) return R.dwood;
      return R.team;
    });
  }
}

/** A pavise (or a tate board); `out` is the sign of local z on its painted face. */
function pavise(f: Fig, c: V3, ax: V3, ay: V3, az: V3, out: number, tate = false): void {
  f.box(c, ax, ay, az, (l) => {
    if (l[2] * out < -0.9) return F(R.dwood, 1);
    if (Math.abs(l[2]) <= 0.9) return R.dwood;
    if (tate) {
      // Planks with a team-hue mon.
      if (l[0] * l[0] + (l[1] - 0.3) * (l[1] - 0.3) < 0.12) return R.team;
      return Math.floor((l[0] + 1) * 3) % 2 ? R.wood : F(R.wood, 1);
    }
    if (Math.abs(l[0]) > 0.84 || Math.abs(l[1]) > 0.9) return R.teamDark;
    if (Math.abs(l[0]) < 0.17 || Math.abs(l[1] - 0.25) < 0.12) return R.white;
    return R.team;
  });
}

/** Limb thickness by body: bones are thin, with gaps between them. */
const LIMB: Record<Body, number> = { man: 1, skel: 0.6, ghoul: 0.75, wraith: 0.8, robe: 0.85, colossus: 1.05, armour: 1 };

/** The flag or cloak on his back, in the chest frame (twist Rt). */
function standard(f: Fig, L: Look, p: Pose, Rt: M3): void {
  const st = L.standard;
  if (!st) return;
  const at = (v: V3): V3 => mv(Rt, v);
  if (st === 'horo') {
    // A cloak bellied out by the wind of the gallop.
    f.ell(at([0, 0.4, -2.4]), [2.2, 2.3, 1.5], (l) => (l[1] < -0.75 ? R.teamDark : R.team), undefined, Rt);
    return;
  }
  if (st === 'pennon') {
    f.line(at([1.1, 1.4, -1.6]), at([1.25, 4.6, -1.7]), R.ash);
    f.sheet(at([1.25, 4.5, -1.7]), mv(Rt, [0, 0, -2.4]), [0, -1.4, 0], (s) => 0.3 * s * Math.sin(s * 6 - p.wave), (s, t) =>
      Math.abs(t - 0.5) > 0.55 * (1 - s * 0.7) || (s > 0.6 && hash2(Math.floor(s * 8), Math.floor(t * 4), 2) < 0.35) ? -1 : R.team,
    );
    return;
  }
  const dims: Record<string, [number, number, number]> = { sashimono: [2.2, 4.0, 9.4], small: [1.7, 3.0, 8.4], big: [3.0, 5.0, 10.6], nobori: [2.4, 8.5, 15.0], rag: [3.0, 4.6, 10.6] };
  const [w, h, top] = dims[st]!;
  const ragged = st === 'rag';
  f.line(at([0, -1.4, -1.75]), at([0, top + 0.3, -1.75]), ragged ? R.ash : R.dwood);
  if (st === 'nobori' || ragged) f.line(at([-w / 2, top, -1.8]), at([w / 2, top, -1.8]), ragged ? R.ash : R.dwood);
  f.sheet(at([-w / 2, top, -1.85]), mv(Rt, [w, 0, 0]), [0, -h, 0], (s0, t) => 0.25 * t * Math.sin(s0 * 4 + t * 3 - p.wave), (s0, t) => {
    if (ragged) {
      if (t > 0.6 && hash2(Math.floor(s0 * 7), 0, 13) < (t - 0.6) * 2.6) return -1;
      if (hash2(Math.floor(s0 * 6), Math.floor(t * 6), 17) < 0.08) return -1;
      return t < 0.15 ? R.teamDark : R.team;
    }
    const cx = s0 - 0.5, cy = (t - 0.3) * (h / w);
    const d = cx * cx + cy * cy;
    if ((st === 'nobori' || st === 'big') && d < 0.06 && d > 0.02) return F(R.gold, 3);
    if (st === 'sashimono' && d < 0.03) return F(R.paper, 2);
    return R.team;
  });
}

/** A figure on foot or in the saddle: legs, coat, head, arms, gear. Origin on the ground between the feet. */
function man(f: Fig, L: Look, p: Pose, mounted: boolean): void {
  const fallen = p.fall > 0;
  const body: Body = L.body ?? 'man';
  const lk = LIMB[body];
  const robed = body === 'wraith' || body === 'robe';
  if ((L.pavise || L.tate) && p.planted) {
    // Standing on its foot in front of him, leaning back a little on its prop.
    const t = rx(-0.12);
    if (L.tate) pavise(f, [0.2, 3.0, 2.8], mv(t, [2.6, 0, 0]), mv(t, [0, 3.0, 0]), mv(t, [0, 0, 0.3]), 1, true);
    else pavise(f, [0.2, 3.7, 2.7], mv(t, [2.4, 0, 0]), mv(t, [0, 3.7, 0]), mv(t, [0, 0, 0.3]), 1);
    f.line([0.2, 2.4, 2.2], [0.2, 0.2, 0.6], R.dwood);
  }
  if (fallen) f.push([0, 1.35 * Math.sin(p.fall), 0], rx(-p.fall));
  const pel: V3 = [0, 6.2 + p.bob, p.pz];
  if (!mounted && !robed) {
    for (const side of [-1, 1]) {
      const hip: V3 = [side * 1.0, pel[1] - 0.3, pel[2]];
      const ank = side < 0 ? p.fl : p.fr;
      const knee = ik(hip, ank, 3.1, 3.0, p.kneel && side > 0 ? [0, -1, 0.15] : [side * 0.1, 0, 1]);
      f.cap(hip, knee, 0.92 * lk, L.leg);
      f.cap(knee, ank, 0.8 * lk, L.leg);
      f.ell(add(ank, [0, -0.25, 0.45]), [0.62 * lk, 0.42, 0.98], L.boot);
    }
    if (body === 'skel' || body === 'colossus') f.ell(add(pel, [0, -0.1, 0]), [1.5, 0.6, 0.9], R.bone);
  } else if (mounted) {
    for (const side of [-1, 1]) {
      const hip: V3 = [side * 1.0, pel[1] - 0.2, pel[2]];
      const knee: V3 = [side * 2.35, pel[1] - 1.7, pel[2] + 1.5];
      const ank: V3 = [side * 2.45, pel[1] - 4.3, pel[2] + 0.4];
      f.cap(hip, knee, 0.88 * lk, L.leg);
      f.cap(knee, ank, 0.75 * lk, L.leg);
      f.ell(add(ank, [0, -0.2, 0.45]), [0.55 * lk, 0.4, 0.9], L.boot);
    }
  }
  const laced = (l: V3, base: number): number => (L.lacing !== undefined && Math.floor((l[1] + 1) * 4.2) % 2 === 0 ? L.lacing : base);
  const skirtMat = (l: V3): number => {
    if (body === 'wraith' && l[1] < 0.35 && hash2(Math.floor(Math.atan2(l[0], l[2]) * 6), Math.floor(l[1] * 5), 7) < (0.35 - l[1]) * 1.6) return -1;
    if (L.hem !== undefined && (L.bell ? l[1] < 0.12 : l[1] < -0.68)) return L.hem;
    if (L.cross && Math.abs(l[0]) < 0.2 && Math.abs(l[2]) > 0.4 && l[1] > -0.5) return R.red;
    return L.bell ? laced(l, L.skirt!) : L.skirt!;
  };
  if (L.skirt !== null) {
    if (mounted) f.ell(add(pel, [0, 0.2, 0.2]), [2.55, 2.5, 2.3], skirtMat, { hi: 0.05, lo: -0.8 });
    else if (robed) f.ell([0, 0.1, p.pz * 0.5], [2.7, 6.3 + p.bob, 2.3], skirtMat, { lo: 0, hi: 0.97 }, rx(p.lean * 0.3));
    else if (L.bell) f.ell(add(pel, [0, -3.3, 0]), [2.6, 3.5, 2.2], skirtMat, { lo: 0, hi: 0.95 }, rx(p.lean * 0.4));
    else f.ell(add(pel, [0, 0.4, 0]), [2.05, 3.0, 1.62], skirtMat, { hi: 0.05, lo: -0.84 }, rx(p.lean * 0.4));
  }
  const Rl = rx(p.lean);
  const chest = add(pel, mv(Rl, [0, 3.0, 0]));
  f.push(chest, Rl);
  const Rt = ry(p.twist);
  const shR = mv(Rt, [1.95, 1.15, 0]), shL = mv(Rt, [-1.95, 1.15, 0]);
  const ribs = (body === 'skel' || body === 'colossus') && L.cloth === R.bone;
  f.ell([0, 0, 0], [2.0, 2.2, 1.42], (l, inner) => {
    if (body === 'colossus' && l[2] > 0.55 && Math.abs(l[0]) < 0.32 && Math.abs(l[1] - 0.05) < 0.3) return F(R.glow, inner ? 2 : 3);
    if (ribs) {
      if (inner) return F(R.ink, 0);
      if (l[1] < -0.5) return Math.abs(l[0]) < 0.24 && l[2] < 0 ? R.bone : -1;
      if (l[2] > 0.3 && Math.abs(l[0]) < 0.13) return R.bone;
      return Math.floor((l[1] + 1) * 3.4) % 2 ? R.bone : -1;
    }
    if (l[1] < -0.62 && l[1] > -0.88) return L.belt;
    if (l[1] > 0.84) return L.collar;
    if (L.cross && Math.abs(l[2]) > 0.2 && ((Math.abs(l[0]) < 0.24 && l[1] > -0.62) || (Math.abs(l[1] - 0.2) < 0.17 && Math.abs(l[0]) < 0.66))) return R.red;
    if (L.sash && Math.abs(l[1] + l[0] * 0.75) < 0.22) return R.team;
    if (L.lacing !== undefined && l[1] < 0.55) return laced(l, L.cloth);
    return L.cloth;
  }, { lo: -1, hi: 0.92, capHi: true }, Rt);
  if (L.sode !== undefined) {
    for (const sx of [-1, 1])
      f.box(mv(Rt, [sx * 2.4, 0.55, 0]), mv(Rt, [0.32, 0, 0]), mv(Rt, [0, 1.0, 0]), mv(Rt, [0, 0, 1.15]), (l) => (Math.floor((l[1] + 1) * 2) % 2 ? L.sode! : L.lacing ?? L.sode!));
  }
  if (L.pavise && !p.planted) pavise(f, mv(Rt, [0.1, 0.3, -1.9]), mv(Rt, [2.0, 0, 0]), mv(Rt, [0, 3.0, 0]), mv(Rt, [0, 0, 0.26]), -1);
  if (L.quiver) {
    f.cap(mv(Rt, [1.1, 1.5, -1.6]), mv(Rt, [0.4, -2.2, -1.5]), 0.6, R.leather);
    f.line(mv(Rt, [1.0, 1.6, -1.6]), mv(Rt, [1.3, 2.4, -1.7]), F(R.white, 3));
    f.line(mv(Rt, [0.7, 1.5, -1.5]), mv(Rt, [0.8, 2.3, -1.4]), F(R.white, 2));
  }
  if (L.cloak) {
    const C = L.cloak;
    const back: V3 = mounted ? [0, -4.2, -2.6] : [0, -6.4, -1.1];
    f.sheet(mv(Rt, [2.0, 1.3, -1.0]), mv(Rt, [-4.0, 0, 0]), back, (s0, t) => 0.35 * t * Math.sin(s0 * 5 + t * 3 - p.wave) - 0.3 * t * Math.sin(s0 * Math.PI), (s0, t, bk) => {
      if (C.ragged && t > 0.55 && hash2(Math.floor(s0 * 8), 0, 21) < (t - 0.55) * 2.4) return -1;
      if (C.cross && !bk && s0 > 0.62 && s0 < 0.86 && t > 0.08 && t < 0.3 && (Math.abs(s0 - 0.74) < 0.04 || Math.abs(t - 0.17) < 0.035)) return R.red;
      return C.ramp;
    });
  }
  standard(f, L, p, Rt);
  f.cap([0, 1.6, 0], [0, 2.3, 0.1], 0.72 * lk, L.collar);
  f.push(mv(Rt, [0, 2.85, 0.15]), mm(ry(p.twist * 0.5), rx(p.head)));
  head(f, L);
  f.pop();
  arm(f, L, shR, p.hr, 1);
  arm(f, L, shL, p.hl, -1);
  if (!p.drop && !L.noWeapon) weapon(f, L, p);
  if (L.style === 'marshal' && !p.drop) {
    if (L.weapon === 'staff') lichStaff(f, p);
    else if (!L.standard) beauseant(f, p);
  }
  shield(f, L, p);
  if (p.spray > 0) {
    const sp = p.spray;
    const chip = body === 'man' ? F(R.blood, 2) : body === 'ghoul' ? F(R.sinew, 1) : F(R.bone, 3);
    for (const [x, y, z] of [[0.4, 0.8, 2.0], [1.2, 1.6, 2.8], [-0.6, 1.9, 3.2]] as V3[]) f.ell([x * sp, y + 0.3 * sp, z + 0.5 * sp], [0.45, 0.45, 0.45], chip);
  }
  if (p.fx) gunsmoke(f, p.fx);
  f.pop();
  if (fallen) f.pop();
  if (p.drop) dropWeapon(f, L, p);
}

/** The weapon lies where it fell, beside him. */
function dropWeapon(f: Fig, L: Look, p: Pose): void {
  const q = basePose();
  q.hr = [3.0, 0.35, -3.0];
  q.w = N(0.25, 0, -1);
  q.hl = [-3.0, 0.4, -3.5];
  q.aim = N(0, 0, -1);
  q.loaded = false;
  q.draw = 0;
  q.wave = p.wave;
  q.drop = true;
  weapon(f, L, q);
  if (L.weapon === 'staff') {
    f.line([-3.0, 0.4, 1.0], [-1.0, 0.4, -7.0], R.ash);
    f.ell([-1.0, 0.7, -7.3], [0.8, 0.8, 0.8], R.bone);
  }
}

/** A matchlock's flash and the smoke that hangs after it, in the chest frame, ahead of the muzzle. */
function gunsmoke(f: Fig, fx: number): void {
  const m: V3 = [0.9, 1.4, 6.6];
  if (fx === 1) {
    f.ell(m, [0.9, 0.9, 0.9], F(R.fire, 3));
    f.ell(add(m, [0, 0, 1.0]), [0.6, 0.6, 0.6], F(R.fire, 2));
  }
  const puffs: [V3, number][] = fx === 1 ? [[[0, 0.6, 0.6], 0.9]] : fx === 2 ? [[[0, 1.2, 0.8], 1.4], [[0.8, 0.6, 1.8], 1.1]] : [[[0, 2.6, 1.0], 1.7], [[1.0, 1.6, 2.2], 1.3]];
  for (const [o, r] of puffs) f.ell(add(m, o), [r, r * 0.85, r], (l) => (fx === 3 && hash2(Math.floor(l[0] * 3), Math.floor(l[1] * 3), 4) < 0.35 ? -1 : R.smoke));
}

/** What is left of the dead: a heap of bones with the skull on top, or an empty robe. */
function remains(f: Fig, L: Look, k: number): void {
  const body = L.body ?? 'man';
  const wisp = !!L.glow && k === 4;
  if (body === 'wraith' || body === 'robe') {
    const robe = L.skirt ?? R.rag;
    f.ell([0, 0.3, -2.0], [3.6, 0.6, 4.2], (l) => (l[0] * l[0] + l[2] * l[2] > 0.55 + 0.45 * hash2(Math.floor(l[0] * 4), Math.floor(l[2] * 4), 3) ? -1 : robe));
    f.ell([0.2, 0.8, -0.8], [2.0, 0.7, 1.8], R.rag);
    if (L.cloak) f.ell([-1.2, 0.5, -3.0], [2.2, 0.35, 1.8], (l) => (hash2(Math.floor(l[0] * 3), Math.floor(l[2] * 3), 5) < 0.3 ? -1 : L.cloak!.ramp));
    if (body === 'robe') {
      f.push([0.6, 1.1, -3.4], rx(-1.2));
      head(f, L);
      f.pop();
    }
  } else {
    // Long bones scattered around the ribcage, as if he had come apart where he stood.
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 1.0 + (i % 3) * 1.3;
      const c: V3 = [Math.cos(a) * r, 0.4 + (i % 2) * 0.3, -1.6 + Math.sin(a) * r * 1.3];
      const d: V3 = [Math.cos(a * 1.7), 0.05, Math.sin(a * 1.7)];
      f.cap(madd(c, d, -1.6), madd(c, d, 1.6), 0.5, R.bone);
      f.ell(madd(c, d, 1.7), [0.5, 0.5, 0.5], R.bone);
    }
    f.ell([0, 0.8, -1.8], [1.8, 0.9, 1.5], (l, inner) => (inner ? F(R.ink, 0) : Math.floor((l[2] + 1) * 3.4) % 2 ? R.bone : -1));
    f.push([0.4, 1.7, -0.6], mm(ry(0.6), rx(-0.3)));
    skull(f, !!L.glow && k < 4);
    f.pop();
    if (L.helm === 'skullHelm' || L.helm === 'skullKettle' || L.helm === 'deathHelm') f.ell([-2.2, 0.6, 0.6], [1.6, 1.1, 1.6], L.helm === 'deathHelm' ? R.bplate : R.rust, { lo: 0 });
    if (L.cloth !== R.bone) f.ell([0.8, 0.25, -2.6], [2.0, 0.3, 1.6], L.cloth);
  }
  if (L.shield) f.ellAx([-2.6, 0.3, -1.4], [1.7, 0, 0], [0, 0, 1.9], [0, 0.25, 0], (l) => (l[1] < 0 ? R.teamDark : emblemAt(L, l[0], -l[2]) ?? R.team));
  if (wisp) for (const [x, y, z, r] of [[0.2, 3.5, -1.0, 0.5], [0.6, 5.2, -1.2, 0.4], [0.1, 6.6, -1.0, 0.3]] as [number, number, number, number][]) f.ell([x, y, z], [r, r, r], F(R.glow, 3));
}

// ------------------------------------------------------------------ horses

interface HorseLook {
  coat: number;
  points: number;
  barding: boolean;
  /** Barding ramp (white caparison by default, with the Templar cross). */
  bard?: number;
  /** Ragged hems on the barding or saddle cloth. */
  ragged?: boolean;
  /** Saddle cloth ramp; null for none (team by default). */
  saddle?: number | null;
  tack?: number;
  /** Tassel knots on the harness, in this ramp. */
  tassels?: number;
  /** A bare-bone horse: ribs, vertebrae, a skull head. */
  skeletal?: boolean;
  chanfron?: 'skull';
  glow?: boolean;
}

interface HPose {
  bob: number;
  pitch: number;
  neck: number;
  tail: V3;
  hooves: V3[];
  roll: number;
}

const LEGS: [number, number][] = [
  [-0.95, 3.1],
  [0.95, 3.1],
  [-0.95, -3.1],
  [0.95, -3.1],
];
const HOOF_Z = [3.3, 3.3, -3.2, -3.2];

function horsePose(anim: Anim, f: number, trot = false): HPose {
  const n = FRAMES[anim];
  const ph = f / n;
  const p: HPose = { bob: 0, pitch: 0, neck: 0, tail: [0, -2.8, -1.2], hooves: LEGS.map(([x], i) => [x, 0.45, HOOF_Z[i]!] as V3), roll: 0 };
  const gait = (phases: number[], len: number, lift: number, stance: number) => {
    p.hooves = LEGS.map(([x], i) => {
      const [dz, dy] = gaitFoot(ph + phases[i]!, len, lift, stance);
      return [x, 0.45 + dy, HOOF_Z[i]! + dz] as V3;
    });
  };
  switch (anim) {
    case Anim.Idle:
      p.tail = [0.7 * Math.sin(ph * TAU), -2.8, -1.1];
      p.neck = 0.06 * Math.sin(ph * TAU) - 0.05;
      if (f === 2) p.hooves[1] = [0.95, 1.0, 3.6];
      break;
    case Anim.Walk:
      gait([0.25, 0.75, 0, 0.5], 1.3, 0.9, 0.62);
      p.bob = 0.15 * Math.cos(ph * 2 * TAU);
      p.neck = 0.07 * Math.sin(ph * 2 * TAU);
      break;
    case Anim.Run:
      gait([0.55, 0.67, 0.07, 0.19], 2.5, 2.1, 0.38);
      p.pitch = 0.08 * Math.sin(ph * TAU);
      p.bob = 0.6 * Math.sin(ph * TAU + 1.2) - 0.2;
      p.neck = 0.32 + 0.1 * Math.sin(ph * TAU);
      p.tail = [0, -1.0, -3.0];
      break;
    case Anim.Attack:
      p.pitch = [-0.05, -0.12, 0.05, 0][f]!;
      p.neck = [-0.1, -0.2, 0.15, 0][f]!;
      if (f === 1) {
        p.hooves[0] = [-0.95, 1.9, 4.0];
        p.hooves[1] = [0.95, 1.4, 4.2];
      }
      break;
    case Anim.Shoot:
      p.neck = -0.05 * f;
      p.tail = [0.4 * Math.sin(ph * TAU), -2.8, -1.1];
      break;
    case Anim.Brace:
      if (trot) {
        // A collected trot: diagonal pairs.
        gait([0, 0.5, 0.5, 0], 1.4, 1.3, 0.5);
        p.bob = f === 0 ? 0.25 : -0.05;
        p.neck = 0.1;
        p.tail = [0, -2.2, -1.8];
      } else p.tail = [0.3 * f, -2.8, -1.1];
      break;
    case Anim.Hit:
      p.pitch = f === 0 ? -0.12 : -0.04;
      p.neck = f === 0 ? -0.35 : -0.15;
      break;
    case Anim.Die:
    case Anim.Dead: {
      const k = anim === Anim.Dead ? 4 : f;
      const folded = (i: number, b: number): V3 => [LEGS[i]![0], 0.45 + b + (i < 2 ? 1.3 : 0.9), HOOF_Z[i]! + (i < 2 ? -0.6 : 0.6)];
      if (k === 0) {
        p.pitch = -0.2;
        p.neck = -0.35;
        p.hooves[0] = [-0.95, 2.0, 4.0];
        p.hooves[1] = [0.95, 1.5, 4.3];
      } else if (k === 1) {
        p.pitch = 0.16;
        p.bob = -1.6;
        p.neck = 0.25;
        p.hooves = p.hooves.map((h, i) => (i < 2 ? folded(i, -0.5) : h));
      } else if (k === 2) {
        p.bob = -3.3;
        p.neck = 0.35;
        p.roll = 0.35;
        p.hooves = p.hooves.map((_, i) => folded(i, -3.3));
      } else {
        p.bob = -3.6;
        p.roll = k === 3 ? 1.05 : Math.PI / 2;
        p.neck = k === 3 ? 0.2 : -0.1;
        p.hooves = LEGS.map(([x], i) => [x * 1.4, 0.45 - 3.6 - (k === 4 ? 0.3 : 0), HOOF_Z[i]! + (i < 2 ? 1.6 : -1.4)] as V3);
      }
      break;
    }
  }
  return p;
}

/** A horse with its saddle cloth or caparison. Returns the saddle point and the body's rotation. */
function horse(f: Fig, H: HorseLook, hp: HPose): [V3, M3] {
  const C: V3 = [0, 7.6 + hp.bob, 0];
  const Rb = rx(hp.pitch);
  const body = (v: V3): V3 => add(C, mv(Rb, v));
  const bony = !!H.skeletal;
  for (let i = 0; i < 4; i++) {
    const [x, z] = LEGS[i]!;
    const top = body([x, -1.1, z]);
    const hoof = hp.hooves[i]!;
    const knee = ik(top, hoof, 3.0, 3.3, mv(Rb, [0, 0, i < 2 ? 1 : -1]));
    f.cap(top, knee, bony ? 0.55 : i < 2 ? 0.82 : 0.95, H.coat);
    f.cap(knee, hoof, bony ? 0.46 : 0.5, H.points);
    f.ell(add(hoof, [0, -0.1, 0.2]), [0.55, 0.42, 0.62], bony ? H.coat : F(R.ink, 2));
  }
  f.push(C, Rb);
  const bard = H.bard ?? R.white;
  const cloth = (l: V3): number => {
    if (H.ragged && l[1] < -0.5 && hash2(Math.floor(Math.atan2(l[0], l[2]) * 5), 3, 11) < (-0.5 - l[1]) * 3.2) return -1;
    if (l[1] < -0.62) return H.ragged ? R.teamDark : R.team;
    if (H.bard === undefined && Math.abs(l[0]) > 0.4 && ((Math.abs(l[2] + 0.05) < 0.1 && Math.abs(l[1] - 0.02) < 0.48) || (Math.abs(l[1] - 0.14) < 0.13 && Math.abs(l[2] + 0.05) < 0.3))) return R.red;
    return bard;
  };
  // Ribs: bone bars with the dark of the body cavity between them.
  const ribs = (l: V3, inner: boolean): number => {
    if (inner) return F(R.ink, 0);
    if (l[1] > 0.55) return H.coat;
    return Math.floor((l[2] + 1) * 4.5) % 2 ? H.coat : -1;
  };
  if (bony) {
    f.ell([0, 0.2, 0], [1.7, 2.1, 3.6], ribs);
    f.cap([0, 1.6, -4.0], [0, 1.6, 3.4], 0.5, H.coat);
    f.ell([0, 0.5, -3.1], [1.6, 1.2, 1.3], H.coat);
  } else {
    f.ell([0, 0, 0], [2.0, 2.3, 4.2], H.coat);
    f.ell([0, 0.3, 3.0], [1.9, 2.3, 1.9], H.coat);
    f.ell([0, 0.4, -3.0], [2.05, 2.25, 2.05], H.coat);
  }
  if (H.barding) f.ell([0, 0.1, 0.3], [2.45, 3.25, 6.0], cloth, { lo: -0.8 });
  else {
    if (H.saddle !== null) {
      const sc = H.saddle ?? R.team;
      f.ell([0, 1.0, -0.3], [2.25, 2.0, 2.3], (l) => {
        if (H.ragged && l[1] < -0.2 && hash2(Math.floor(Math.atan2(l[0], l[2]) * 6), 1, 5) < 0.45) return -1;
        return l[1] < -0.55 ? R.teamDark : sc;
      }, { lo: -0.15 });
    }
    f.ell([0, 2.25, -0.3], [1.45, 0.6, 1.75], H.tack ?? R.leather);
  }
  if (H.tassels !== undefined) {
    // Red tassel harness: knots on the breast and the crupper.
    for (const [x, y, z] of [[0, -0.6, 4.3], [-1.3, -0.2, 3.6], [1.3, -0.2, 3.6], [-1.5, 0.2, -3.6], [1.5, 0.2, -3.6], [0, 0.6, -4.5]] as V3[]) f.ell([x, y, z], [0.5, 0.6, 0.5], H.tassels);
  }
  // Neck and head.
  f.push([0, 1.2, 3.4], rx(hp.neck));
  if (bony) {
    for (let i = 0; i < 4; i++) f.ell(lerp([0, 0.2, 0.1], [0, 3.4, 1.9], i / 3), [0.75, 0.6, 0.75], H.coat);
  } else f.cap([0, 0, 0], [0, 3.6, 2.0], 1.22, H.coat);
  if (H.barding) f.cap([0, -0.2, -0.1], [0, 2.0, 1.2], 1.38, (l) => (H.ragged && l[0] > 0.6 ? -1 : bard));
  f.cap([0, 1.3, -0.25], [0, 4.5, 1.6], bony ? 0.45 : 0.5, H.points);
  const skullHead = bony || H.chanfron === 'skull';
  f.cap([0, 3.9, 2.2], [0, 2.4, 4.6], 0.9, skullHead ? R.bone : H.coat);
  f.ell([0, 3.7, 2.35], [1.0, 1.05, 1.05], skullHead ? R.bone : H.coat);
  f.ell([0, 2.25, 4.65], [0.62, 0.55, 0.5], skullHead ? R.bone : H.points);
  if (skullHead) for (const sx of [-0.62, 0.62]) f.ell([sx, 3.85, 2.6], [0.38, 0.38, 0.38], H.glow ? F(R.glow, 3) : F(R.ink, 0));
  if (H.barding && !skullHead) f.cap([0, 4.1, 2.6], [0, 2.8, 4.55], 0.55, R.plate);
  for (const sx of [-1, 1]) f.line([sx * 0.45, 4.5, 2.1], [sx * 0.5, 5.3, 1.8], skullHead ? R.bone : H.coat);
  f.pop();
  // Tail.
  f.cap([0, 1.0, -4.6], add([0, 1.0, -4.6], hp.tail), bony ? 0.45 : 0.55, H.points);
  f.pop();
  return [body([0, 2.6, -0.4]), Rb];
}

// ------------------------------------------------------------------ the engines

interface EngineLook {
  kind: 'trebuchet' | 'bombard';
  timber: number;
  timber2: number;
  rope: number;
  ammo: number;
  crew: Look;
  /** A green wisp trailing the shot (the corpse trebuchet). */
  wisp?: boolean;
}

/**
 * True for the bodies that fall to bones (or an empty robe) instead of bleeding. Their Die runs
 * from standing to a heap of bones; played backwards (contract.ts RISE: a man the Lich-Marshal
 * raises) the bones gather and stand, so keep every Die frame a pose between the two.
 */
const undead = (L: Look): boolean => (L.body ?? 'man') !== 'man' && L.body !== 'ghoul';

/** One of the engine's crew, posed; the dead among the undead crews fall to bones. */
function crewman(f: Fig, L: Look, p: Pose, anim: Anim, fr: number): void {
  if (undead(L) && ((anim === Anim.Die && fr >= 3) || anim === Anim.Dead)) remains(f, L, anim === Anim.Dead ? 5 : fr);
  else man(f, L, p, false);
}

function engine(f: Fig, anim: Anim, fr: number, E: EngineLook): void {
  if (E.kind === 'bombard') bombard(f, anim, fr, E);
  else trebuchet(f, anim, fr, E);
}

/**
 * A traction trebuchet (the 13th-century "mangonel" of the Maciejowski Bible): a trestle, a long
 * beam on an axle with a sling on its long end, and a crew hauling ropes on the short end.
 */
function trebuchet(f: Fig, anim: Anim, fr: number, E: EngineLook): void {
  const n = FRAMES[anim];
  // Beam angle: the long end's direction is (0, sin a, -cos a); negative a is down and back.
  let a = -0.42, loaded = true, flying = false, wreck = 0, pull = 0;
  if (anim === Anim.Shoot) {
    a = [-0.42, 0.5, 1.75, 1.5][fr]!;
    pull = [0, 0.6, 1, 0.7][fr]!;
    loaded = fr < 2;
    flying = fr === 2;
  } else if (anim === Anim.Walk || anim === Anim.Run) {
    loaded = false;
    a = -0.6 + 0.04 * Math.sin((fr / n) * TAU);
  } else if (anim === Anim.Idle) {
    a = -0.42 + 0.03 * Math.sin((fr / n) * TAU);
  } else if (anim === Anim.Die || anim === Anim.Dead) {
    wreck = anim === Anim.Dead ? 4 : fr;
    loaded = false;
    a = [-0.42, -0.7, -1.0, -1.2, -1.3][wreck]!;
  }
  const tilt = [0, 0.04, 0.12, 0.26, 0.3][wreck]!;
  const apex = 8.4;
  const S = 1.7;
  f.pushScale([S, S, S]);
  f.push([0, 0, 0], rz(tilt));
  for (const s of [-1, 1]) {
    f.beam([s * 2.2, 0.35, -3.6], [s * 2.2, 0.35, 3.6], 0.7, 0.7, E.timber2);
    if (wreck >= 3 && s > 0) {
      f.beam([3.0, 0.4, -2.8], [6.5, 0.4, 2.0], 0.6, 0.6, E.timber);
      continue;
    }
    f.beam([s * 2.1, 0.5, 3.0], [s * 1.5, apex, 0], 0.6, 0.6, E.timber, [1, 0, 0]);
    f.beam([s * 2.1, 0.5, -3.0], [s * 1.5, apex, 0], 0.6, 0.6, E.timber, [1, 0, 0]);
    f.beam([s * 1.9, 3.2, -1.9], [s * 1.9, 3.2, 1.9], 0.45, 0.45, E.timber2);
  }
  for (const z of [-3.3, 3.3]) f.beam([-2.4, 0.4, z], [2.4, 0.4, z], 0.6, 0.6, E.timber2, [0, 1, 0.001]);
  const P: V3 = [0, apex, 0];
  f.beam([-2.0, apex, 0], [2.0, apex, 0], 0.55, 0.55, R.dplate, [0, 1, 0.001]);
  const d: V3 = [0, Math.sin(a), -Math.cos(a)];
  const tip = madd(P, d, 8.6);
  const butt = madd(P, d, -3.4);
  f.push([0, 0, 0], wreck >= 2 ? rz(-0.2) : I3);
  f.beam(butt, tip, 0.75, 0.75, (l) => (Math.abs(l[2] + 0.4) < 0.05 || Math.abs(l[2] - 0.3) < 0.05 ? E.rope : E.timber), [1, 0, 0]);
  f.pop();
  if (wreck < 2) {
    const pouch: V3 = a < 0 ? [0, 0.6, Math.min(tip[2] - 1.5, -6.2)] : flying ? madd(tip, d, 2.4) : madd(tip, [0, -1, -0.4], 2.2);
    f.line(tip, pouch, F(E.rope, 2));
    f.ell(pouch, [0.7, 0.45, 0.7], R.leather);
    if (loaded) f.ell(add(pouch, [0, 0.6, 0]), [0.8, 0.8, 0.8], E.ammo);
    if (flying) {
      const shot = madd(tip, d, 4.6);
      f.ell(shot, [0.8, 0.8, 0.8], E.ammo);
      if (E.wisp) for (let i = 1; i <= 3; i++) f.ell(madd(shot, d, -0.9 * i), [0.4, 0.4, 0.4], F(R.glow, 3 - (i >> 1)));
    }
  }
  f.pop();
  f.pop();
  const hauls: V3[] = [
    [-5.6, 0, 3.6],
    [5.8, 0, 4.4],
  ];
  hauls.forEach((at, i) => {
    let p: Pose;
    const crew = E.crew;
    if (anim === Anim.Shoot || anim === Anim.Idle || anim === Anim.Brace) {
      p = posed(crew, Anim.Idle, anim === Anim.Shoot ? 0 : fr % FRAMES[Anim.Idle], false);
      const up = 1 - pull;
      p.hr = [0.4, -1.2 + 3.6 * up, -0.6 - 0.8 * up];
      p.hl = [-0.4, -1.4 + 3.6 * up, -0.4 - 0.8 * up];
      p.lean = -0.1 + 0.45 * pull;
      p.bob = -0.9 * pull;
      p.w = N(0, -1, 0.2);
      p.head = -0.2 + 0.3 * pull;
      p.drop = false;
    } else if ((anim === Anim.Die || anim === Anim.Dead) && i === 1) {
      p = posed(crew, anim, fr, false);
    } else if (anim === Anim.Die || anim === Anim.Dead) {
      p = posed(crew, Anim.Hit, fr % 2, false);
      if (anim === Anim.Dead) p = posed(crew, Anim.Idle, 0, false);
    } else p = posed(crew, anim, fr, false);
    f.push(at, ry(Math.PI));
    const hauling = anim === Anim.Shoot || anim === Anim.Idle || anim === Anim.Brace;
    crewman(f, hauling ? { ...crew, noWeapon: true } : crew, p, i === 1 ? anim : anim === Anim.Dead ? Anim.Idle : anim, fr);
    f.pop();
    if (hauling && wreck === 0) {
      const hand: V3 = [at[0], 9.2 + p.bob + p.hr[1], at[2] - p.hr[2]];
      f.line(scl(butt, S), hand, F(E.rope, 1));
    }
  });
}

/** The ōzutsu: a fat bronze barrel on a timber sledge, three gunners, flash and a great cloud. */
function bombard(f: Fig, anim: Anim, fr: number, E: EngineLook): void {
  let recoil = 0, fx = 0, tilt = 0;
  if (anim === Anim.Shoot) {
    recoil = [0, 0.9, 0.5, 0.1][fr]!;
    fx = [0, 1, 2, 3][fr]!;
  } else if (anim === Anim.Die || anim === Anim.Dead) tilt = [0, 0.1, 0.3, 0.55, 0.62][anim === Anim.Dead ? 4 : fr]!;
  const S = 1.6;
  const el = 0.12;
  f.pushScale([S, S, S]);
  f.push([0, 0, -recoil], rz(tilt));
  for (const sx of [-1, 1]) f.beam([sx * 1.7, 0.4, -4.2], [sx * 1.7, 0.4, 3.4], 0.6, 0.7, E.timber2);
  f.box([0, 1.15, -0.4], [2.1, 0, 0], [0, 0.4, 0], [0, 0, 3.0], E.timber);
  f.box([0, 2.0, 0.6], [1.3, 0, 0], [0, 0.6, 0], [0, 0, 1.3], E.timber2);
  const d: V3 = [0, Math.sin(el), Math.cos(el)];
  const breech: V3 = [0, 2.9, -2.8];
  const muzzle = madd(breech, d, 7.2);
  f.cap(breech, muzzle, 1.45, (l) => (Math.abs(l[0] - 0.33) < 0.04 || Math.abs(l[0] - 0.7) < 0.04 || l[0] > 0.93 ? F(R.bronze, 1) : R.bronze));
  f.ell(muzzle, [1.55, 1.55, 0.5], R.bronze, undefined, I3);
  f.ell(madd(muzzle, d, 0.3), [0.75, 0.75, 0.3], F(R.ink, 0));
  for (const [x, z] of [[2.6, -2.4], [3.2, -1.6], [2.9, -3.2]] as [number, number][]) f.ell([x, 0.6, z], [0.6, 0.6, 0.6], E.ammo);
  f.pop();
  f.pop();
  const m = scl(madd([0, 2.9, -2.8 - recoil], d, 8.0), S);
  if (fx === 1) {
    f.ell(m, [2.4, 2.1, 2.4], F(R.fire, 3));
    f.ell(madd(m, d, 2.6), [1.6, 1.4, 1.6], F(R.fire, 2));
    f.ell(madd(m, d, 4.0), [0.9, 0.8, 0.9], F(R.fire, 1));
  }
  if (fx) {
    const puffs: [V3, number][] =
      fx === 1 ? [[[0, 1.4, 1.6], 1.6]] : fx === 2 ? [[[0, 1.6, 2.2], 2.4], [[1.6, 1.0, 1.0], 1.8], [[-1.4, 2.4, 1.2], 1.6]] : [[[0, 3.6, 2.0], 2.8], [[1.8, 2.6, 0.6], 2.2], [[-1.8, 3.0, 1.4], 2.0]];
    for (const [o, r] of puffs) f.ell(add(m, o), [r, r * 0.85, r], (l) => (fx === 3 && hash2(Math.floor(l[0] * 3), Math.floor(l[1] * 3), 8) < 0.3 ? -1 : R.smoke));
  }
  const crewAt: [V3, number][] = [
    [[-4.6, 0, -6.4], 0.2],
    [[4.6, 0, -7.0], -0.2],
    [[0.4, 0, -10.0], 0],
  ];
  crewAt.forEach(([at, yaw], i) => {
    let a: Anim = anim === Anim.Brace ? Anim.Idle : anim;
    let k = fr;
    if (anim === Anim.Shoot) {
      a = fx === 1 ? Anim.Hit : Anim.Idle;
      k = 0;
    }
    if ((anim === Anim.Die || anim === Anim.Dead) && i !== 1) {
      a = anim === Anim.Dead ? Anim.Dead : Anim.Die;
      k = anim === Anim.Dead ? 0 : Math.min(4, fr + i);
    } else if (anim === Anim.Die || anim === Anim.Dead) {
      a = Anim.Hit;
      k = fr % 2;
    }
    const p = posed(E.crew, a, k, false);
    if (i === 2 && anim === Anim.Shoot && fr === 0) {
      // The gunner reaches the slow-match to the touch-hole.
      p.hr = [1.0, -0.2, 2.6];
      p.lean = 0.3;
    }
    f.push(at, ry(yaw));
    crewman(f, E.crew, p, a, k);
    if (i === 2 && a !== Anim.Die && a !== Anim.Dead) f.ell(add(add([0, 9.2 + p.bob, 0], p.hr), [0, 0.2, 0.5]), [0.4, 0.4, 0.4], F(R.fire, 2));
    f.pop();
  });
}

// ------------------------------------------------------------------ the armies' figures

const base = {
  cross: 0 as const, belt: R.leather, collar: R.mail, sleeve: R.mail, hand: R.skin, leg: R.hose, boot: R.leather,
};

const FOOT: Record<number, Look> = {
  [U.HeavyInfantry]: { ...base, style: 'sword', cloth: R.black, cross: 1, belt: R.dleather, hand: R.mail, leg: R.mail, boot: R.dleather, skirt: R.black, helm: 'nasal', shield: 'kite' },
  [U.Spearmen]: { ...base, style: 'spear', cloth: R.gambeson, collar: R.gambeson, sleeve: R.gambeson, skirt: R.gambeson, hem: R.team, helm: 'kettle', shield: 'round' },
  [U.Skirmishers]: { ...base, style: 'javelin', cloth: R.tunic2, collar: R.tunic2, sleeve: R.skin, skirt: R.tunic2, hem: R.team, helm: 'cap', shield: 'buckler', beard: false },
  [U.Archers]: { ...base, style: 'bow', cloth: R.tunic, collar: R.tunic, sleeve: R.tunic, skirt: R.tunic, helm: 'hood', hood: R.team, quiver: true },
  [U.Crossbowmen]: { ...base, style: 'xbow', cloth: R.gambeson, collar: R.gambeson, sleeve: R.gambeson, skirt: R.gambeson, hem: R.team, helm: 'kettle', pavise: true },
  [U.Shock]: { ...base, style: 'poleaxe', cloth: R.dplate, belt: R.dplate, collar: R.dplate, sleeve: R.dplate, hand: R.dplate, leg: R.dplate, boot: R.dplate, skirt: R.team, hem: R.teamDark, helm: 'sallet', plume: R.red, sash: true },
};

const RIDERS: Record<number, { look: Look; horse: HorseLook }> = {
  [U.LightCavalry]: { look: { ...base, style: 'cavspear', cloth: R.tunic, collar: R.mail, sleeve: R.tunic, skirt: R.tunic, helm: 'turban', shield: 'round' }, horse: { coat: R.chestnut, points: R.points, barding: false } },
  [U.HorseArchers]: { look: { ...base, style: 'horsebow', cloth: R.tunic2, collar: R.tunic2, sleeve: R.tunic2, skirt: R.tunic2, helm: 'turban', quiver: true }, horse: { coat: R.dun, points: R.points, barding: false } },
  [U.Knights]: {
    look: { ...base, style: 'lance', cloth: R.white, cross: 1, hand: R.mail, leg: R.mail, boot: R.mail, skirt: R.white, helm: 'great', shield: 'kite', cloak: { ramp: R.white, cross: true } },
    horse: { coat: R.bay, points: R.points, barding: true },
  },
  [COMMANDER_KIND]: {
    look: { ...base, style: 'marshal', cloth: R.white, cross: 1, hand: R.mail, leg: R.mail, boot: R.mail, skirt: R.white, helm: 'marshal', plume: R.gold, cloak: { ramp: R.white, cross: true } },
    horse: { coat: R.grey, points: R.grey, barding: true },
  },
};

// The Samurai Clans: dark lacquer laced in vermilion, flared kusazuri, and over every soldier a
// sashimono in the team hue (refs: Met gusoku and dō-maru, Kawanakajima print, jingasa).
const sb = {
  cross: 0 as const, belt: R.paper, collar: R.lacquer, sleeve: R.lacquer, hand: R.skin, leg: R.indigo, boot: R.lacquer,
};
const SAMURAI_FOOT: Record<number, Look> = {
  [U.HeavyInfantry]: { ...sb, style: 'sword', weapon: 'katana', cloth: R.lacquer, lacing: R.vermilion, sode: R.lacquer, skirt: R.lacquer, bell: true, helm: 'kabuto', standard: 'sashimono' },
  [U.Spearmen]: { ...sb, style: 'spear', weapon: 'yari', cloth: R.lacquer, sleeve: R.leather, skirt: R.indigo, leg: R.skin, boot: R.paper, helm: 'jingasa', standard: 'sashimono', beard: false },
  [U.Skirmishers]: { ...sb, style: 'javelin', cloth: R.indigo, collar: R.indigo, sleeve: R.indigo, skirt: R.indigo, boot: R.paper, helm: 'hachimaki', standard: 'small', beard: false },
  [U.Archers]: { ...sb, style: 'bow', weapon: 'yumi', cloth: R.lacquer, sleeve: R.indigo, skirt: R.indigo, boot: R.paper, helm: 'jingasa', standard: 'sashimono', quiver: true },
  [U.Crossbowmen]: { ...sb, style: 'xbow', weapon: 'teppo', cloth: R.lacquer, sleeve: R.indigo, skirt: R.indigo, boot: R.paper, helm: 'jingasa', standard: 'sashimono', tate: true },
  [U.Shock]: { ...sb, style: 'poleaxe', weapon: 'naginata', cloth: R.hose, lacing: R.mail, collar: R.paper, sleeve: R.hose, hand: R.skin, leg: R.hose, boot: R.wood, skirt: R.hose, bell: true, helm: 'cowl', sash: true, scale: 1.14 },
};
const SAMURAI_RIDERS: Record<number, { look: Look; horse: HorseLook }> = {
  [U.LightCavalry]: {
    look: { ...sb, style: 'cavspear', weapon: 'yari', cloth: R.lacquer, lacing: R.vermilion, skirt: R.lacquer, helm: 'jingasa', standard: 'sashimono' },
    horse: { coat: R.bay, points: R.points, barding: false, saddle: null, tack: R.lacquer, tassels: R.vermilion },
  },
  [U.HorseArchers]: {
    look: { ...sb, style: 'horsebow', weapon: 'yumi', cloth: R.indigo, lacing: R.paper, skirt: R.indigo, helm: 'kabuto', standard: 'horo', quiver: true },
    horse: { coat: R.chestnut, points: R.points, barding: false, saddle: null, tack: R.lacquer, tassels: R.vermilion },
  },
  [U.Knights]: {
    look: { ...sb, style: 'lance', weapon: 'yari', cloth: R.lacquer, lacing: R.vermilion, sode: R.lacquer, skirt: R.lacquer, helm: 'kabuto', standard: 'big' },
    horse: { coat: R.darkbay, points: R.points, barding: false, saddle: null, tack: R.lacquer, tassels: R.vermilion },
  },
  [COMMANDER_KIND]: {
    look: { ...sb, style: 'marshal', weapon: 'saihai', cloth: R.team, lacing: R.gold, sode: R.lacquer, skirt: R.lacquer, helm: 'daimyo', standard: 'nobori' },
    horse: { coat: R.darkbay, points: R.points, barding: false, saddle: null, tack: R.lacquer, tassels: R.gold },
  },
};
const SAMURAI_CREW: Look = { ...sb, style: 'crew', cloth: R.lacquer, sleeve: R.indigo, skirt: R.indigo, boot: R.paper, helm: 'jingasa', beard: false };

// The Hollow Host: bone, rust and grave-black, one green glow, the team hue on shields and rags
// (refs: Holbein and Hollar's Dance of Death, Kuniyoshi's ghosts, CC0 skeletons and Gate Keeper).
const ub = {
  cross: 0 as const, belt: R.rag, collar: R.bone, sleeve: R.bone, hand: R.bone, leg: R.bone, boot: R.bone, blade: R.rust, body: 'skel' as Body, bowWood: R.ash,
};
const UNDEAD_FOOT: Record<number, Look> = {
  [U.HeavyInfantry]: { ...ub, style: 'sword', cloth: R.rust, collar: R.rust, skirt: R.rag, helm: 'skullHelm', shield: 'kite', emblem: 'crack' },
  [U.Spearmen]: {
    ...ub, body: 'ghoul', style: 'spear', cloth: R.ghoul, collar: R.ghoul, sleeve: R.ghoul, hand: R.ghoul, leg: R.ghoul, boot: R.ghoul, skirt: R.rag, helm: 'ghoul', hunch: 0.35, cloak: { ramp: R.team, ragged: true },
  },
  [U.Skirmishers]: { ...ub, style: 'javelin', weapon: 'bone', cloth: R.bone, skirt: R.team, hem: R.teamDark, helm: 'skull' },
  [U.Archers]: { ...ub, body: 'wraith', style: 'bow', bowWood: R.sinew, cloth: R.rag, collar: R.rag, sleeve: R.rag, skirt: R.rag, helm: 'wraith', glow: true, sash: true, cloak: { ramp: R.team, ragged: true } },
  [U.Crossbowmen]: { ...ub, style: 'xbow', cloth: R.rag, collar: R.rag, skirt: R.rag, hem: R.team, sash: true, helm: 'skullKettle', pavise: true },
  [U.Shock]: { ...ub, body: 'colossus', style: 'poleaxe', weapon: 'club', cloth: R.bone, skirt: null, helm: 'skulls', hunch: 0.4, scale: 1.7, standard: 'rag', glow: true },
  [COMMANDER_KIND]: { ...ub, body: 'robe', style: 'marshal', weapon: 'staff', cloth: R.rag, collar: R.rag, sleeve: R.rag, skirt: R.rag, helm: 'skullCrown', glow: true, standard: 'rag', scale: 1.2 },
};
const boneHorse: HorseLook = { coat: R.bonehorse, points: R.ash, barding: false, skeletal: true, glow: true, saddle: R.team, ragged: true, tack: R.rag };
const UNDEAD_RIDERS: Record<number, { look: Look; horse: HorseLook }> = {
  [U.LightCavalry]: { look: { ...ub, style: 'lance', cloth: R.rag, collar: R.rag, skirt: R.rag, helm: 'skullHood', glow: true }, horse: boneHorse },
  [U.HorseArchers]: { look: { ...ub, style: 'horsebow', cloth: R.bone, skirt: R.rag, helm: 'skull', quiver: true, standard: 'pennon' }, horse: boneHorse },
  [U.Knights]: {
    look: { ...ub, body: 'armour', style: 'lance', cloth: R.bplate, collar: R.bplate, sleeve: R.bplate, hand: R.bplate, leg: R.bplate, boot: R.bplate, skirt: R.rag, helm: 'deathHelm', shield: 'kite', emblem: 'skull', glow: true },
    horse: { coat: R.ash, points: R.ink, barding: true, bard: R.rag, ragged: true, chanfron: 'skull', glow: true },
  },
};
const UNDEAD_CREW: Look = { ...ub, style: 'crew', cloth: R.bone, skirt: R.team, hem: R.teamDark, helm: 'skull' };

/**
 * A faction's look table: what each class wears and carries, the horses and the engine. Bodies,
 * poses and animation are shared, so a new faction is a new table, not new animation code.
 */
export interface FactionLooks {
  foot: Record<number, Look>;
  riders: Record<number, { look: Look; horse: HorseLook }>;
  engine: EngineLook;
  /** Adjusts the army's ramps after the shared ones are made. */
  ramps?: (r: RGB[][], hue: number) => void;
}

const TEMPLAR: FactionLooks = {
  foot: FOOT,
  riders: RIDERS,
  engine: { kind: 'trebuchet', timber: R.wood, timber2: R.dwood, rope: R.rope, ammo: R.stone, crew: { ...base, style: 'crew', cloth: R.tunic, collar: R.tunic, sleeve: R.tunic, skirt: R.tunic, hem: R.team, helm: 'cap' } },
};
const SAMURAI: FactionLooks = {
  foot: SAMURAI_FOOT,
  riders: SAMURAI_RIDERS,
  engine: { kind: 'bombard', timber: R.wood, timber2: R.dwood, rope: R.rope, ammo: R.dplate, crew: SAMURAI_CREW },
};
const UNDEAD: FactionLooks = {
  foot: UNDEAD_FOOT,
  riders: UNDEAD_RIDERS,
  engine: { kind: 'trebuchet', timber: R.ash, timber2: R.rag, rope: R.sinew, ammo: R.rag, crew: UNDEAD_CREW, wisp: true },
};

/** Looks by faction id; an unknown faction borrows the Templar table. */
const LOOKS: Record<string, FactionLooks> = { templar: TEMPLAR, samurai: SAMURAI, undead: UNDEAD };
const looksFor = (faction: string): FactionLooks => LOOKS[faction] ?? TEMPLAR;

const SHADOW_FOOT: Shadow = { rx: 2.4, rz: 2.0 };
const SHADOW_HORSE: Shadow = { rx: 2.8, rz: 7.2 };
const HORSE_SCALE: V3 = [1.12, 1.12, 1.35];
const SHADOW_ENGINE: Shadow = { rx: 3.6, rz: 5.0 };

/** The Beauséant, black over white, on the marshal's lance-pole. */
function beauseant(f: Fig, p: Pose): void {
  const hl = p.hl;
  f.line(add(hl, [0, -4.5, 0]), add(hl, [0, 14.5, 0]), R.dwood);
  f.ell(add(hl, [0, 14.8, 0]), [0.45, 0.45, 0.45], R.gold);
  f.sheet(add(hl, [0, 14.2, -0.2]), [0, 0, -8.0], [0, -6.0, 0], (s) => 0.7 * s * Math.sin(s * 6 - p.wave), (_s, t) => (t < 0.5 ? F(R.ink, 3) : R.white));
}

/** A figure on foot, at its scale; the undead fall to their remains from the fourth frame of Die. */
function footFigure(f: Fig, L: Look, anim: Anim, fr: number): void {
  const sc = L.scale ?? 1;
  if (sc !== 1) f.pushScale([sc, sc, sc]);
  const k = anim === Anim.Dead ? 5 : fr;
  if (undead(L) && (anim === Anim.Dead || (anim === Anim.Die && fr >= 3))) remains(f, L, Math.min(k, 4) + (anim === Anim.Dead ? 1 : 0));
  else {
    const p = posed(L, anim, fr, false);
    bloodChance = p.blood;
    man(f, L, p, false);
  }
  if (sc !== 1) f.pop();
}

function paint(looks: FactionLooks, kind: number, anim: Anim, fr: number, dir: Dir): Shadow {
  ZB.fill(-Infinity);
  PX.fill(-1);
  bx0 = W;
  by0 = H;
  bx1 = by1 = -1;
  bloodChance = 0;
  bloodSeed = kind * 131 + dir * 17 + fr;
  const f = new Fig(basis(dir));
  if (kind === U.Artillery) {
    const living = !undead(looks.engine.crew);
    if (anim === Anim.Dead && living) bloodChance = 0.05;
    engine(f, anim, fr, looks.engine);
    return SHADOW_ENGINE;
  }
  const rider = looks.riders[kind];
  if (!rider) {
    const L = looks.foot[kind]!;
    if (anim === Anim.Dead && (L.body ?? 'man') === 'man') pool(f, [0.6, 0.03, -6.0], 1);
    footFigure(f, L, anim, fr);
    return L.scale && L.scale > 1.4 ? { rx: 3.6, rz: 3.0 } : SHADOW_FOOT;
  }
  const L = rider.look;
  const bleeds = !undead(L);
  const hp = horsePose(anim, fr, L.style === 'lance' || L.style === 'cavspear');
  const dying = anim === Anim.Die || anim === Anim.Dead;
  if (anim === Anim.Dead && bleeds && !rider.horse.skeletal) pool(f, [-1.5, 0.03, 0.5], 1.4);
  const k = anim === Anim.Dead ? 5 : fr;
  if (hp.roll > 0) {
    // Fall onto the side that leaves the legs pointing away from the eye, so they stay in the cell.
    const sg = basis(dir)[6] > 0 ? -1 : 1;
    const r = hp.roll / (Math.PI / 2);
    f.pushAbout([-2.2 * sg, 0, 0], rz(hp.roll * sg), [5.5 * r * sg, 0.3 * r, 0]);
  }
  bloodChance = dying && bleeds && !rider.horse.skeletal ? (anim === Anim.Dead ? 0.12 : 0.04 * fr) : 0;
  f.pushScale(HORSE_SCALE);
  const [s0, Rb] = horse(f, rider.horse, hp);
  const saddle: V3 = [s0[0] * HORSE_SCALE[0], s0[1] * HORSE_SCALE[1], s0[2] * HORSE_SCALE[2]];
  f.pop();
  if (hp.roll > 0) {
    f.pop();
    f.pop();
  }
  if (!dying || k < 2) {
    const p = posed(L, dying ? Anim.Die : anim, dying ? 0 : fr, true);
    if (dying && k === 1) {
      p.lean = -0.5;
      p.twist = 0.4;
    }
    f.push(add(saddle, [0, 0.25 - 6.2, 0]), mm(Rb, dying && k === 1 ? rz(-0.45) : I3));
    bloodChance = 0;
    man(f, L, p, true);
    f.pop();
  } else {
    // Thrown: he falls beside his horse.
    f.push([3.4, 0, -4.2], ry(0.5));
    footFigure(f, L, k >= 5 ? Anim.Dead : Anim.Die, Math.min(4, k));
    f.pop();
  }
  return SHADOW_HORSE;
}

/** A pool of blood on the ground, ragged at the edge. */
function pool(f: Fig, at: V3, size: number): void {
  f.ell(at, [2.6 * size, 0.05, 2.1 * size], (l) => {
    const qx = Math.floor((l[0] + 1) * 4), qz = Math.floor((l[2] + 1) * 4);
    const r = l[0] * l[0] + l[2] * l[2];
    if (r > 0.45 + 0.5 * hash2(qx, qz, 7)) return -1;
    return F(R.blood, hash2(qx, qz, 3) < 0.15 ? 2 : r < 0.25 ? 1 : 0);
  });
}

// ------------------------------------------------------------------ the atlas

function pack([r, g, b]: RGB, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Cleans tone specks, writes the colours, outlines, and lays the shadow under the figure. */
function finish(out: Uint32Array, iw: number, ox: number, oy: number, fill: number[], edge: number[], sh: Shadow | null, dir: Dir): void {
  const x0 = Math.max(1, bx0 - 1), x1 = Math.min(W - 2, bx1 + 1), y0 = Math.max(1, by0 - 1), y1 = Math.min(H - 2, by1 + 1);
  // A pixel whose same-material neighbours all agree on a different tone takes theirs.
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const v = PX[i]!;
      if (v < 0) continue;
      const r = v >> 2;
      let cnt = 0, tone = -1, same = true;
      for (let k = 0; k < 4; k++) {
        const u = PX[k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - W : i + W]!;
        if (u < 0 || u >> 2 !== r) continue;
        cnt++;
        if (tone < 0) tone = u & 3;
        else if ((u & 3) !== tone) same = false;
      }
      if (cnt >= 3 && same && tone !== (v & 3)) PX[i] = r * 4 + tone;
    }
  // Ground shadow first, so the figure and its outline paint over it.
  if (sh) {
    const b = basis(dir);
    const shade = pack([12, 14, 8], 92);
    const ex = Math.ceil(Math.max(sh.rx, sh.rz)) + 1;
    for (let y = Math.max(0, FOOT_Y - ex); y < Math.min(H, FOOT_Y + ex); y++)
      for (let x = Math.max(0, FOOT_X - 2 * ex); x < Math.min(W, FOOT_X + 2 * ex); x++) {
        const wx = x + 0.5 - FOOT_X, wz = (y + 0.5 - FOOT_Y) * 2;
        const lx = wx * b[0] + wz * b[6], lz = wx * b[2] + wz * b[8];
        if ((lx / sh.rx) ** 2 + (lz / sh.rz) ** 2 < 1) out[(oy + y) * iw + ox + x] = shade;
      }
  }
  for (let y = Math.max(0, by0 - 1); y <= Math.min(H - 1, by1 + 1); y++)
    for (let x = Math.max(0, bx0 - 1); x <= Math.min(W - 1, bx1 + 1); x++) {
      const i = y * W + x;
      const v = PX[i]!;
      const o = (oy + y) * iw + ox + x;
      if (v >= 0) {
        out[o] = fill[v]!;
        continue;
      }
      let nb = -1;
      if (x > 0 && PX[i - 1]! >= 0) nb = PX[i - 1]!;
      else if (x < W - 1 && PX[i + 1]! >= 0) nb = PX[i + 1]!;
      else if (y > 0 && PX[i - W]! >= 0) nb = PX[i - W]!;
      else if (y < H - 1 && PX[i + W]! >= 0) nb = PX[i + W]!;
      if (nb >= 0) out[o] = edge[nb >> 2]!;
    }
}

/**
 * One army's atlas. Kinds are painted lazily: a kind's rows are filled the first time at() is asked
 * for it (about 10-15 ms each), and the rest are filled in the background a kind at a time, so
 * building an atlas costs almost nothing up front and no frame ever waits for more than one kind.
 */
export const buildAtlas: BuildAtlas = (faction, hue) => {
  // The last few armies' atlases are kept: a new scene or an art switch back finds them painted.
  const key = `${faction}:${hue}`;
  const got = BUILT.get(key);
  if (got) {
    BUILT.delete(key);
    BUILT.set(key, got);
    return got;
  }
  const atlas = makeAtlas(faction, hue);
  BUILT.set(key, atlas);
  while (BUILT.size > BUILT_KEPT) BUILT.delete(BUILT.keys().next().value!);
  return atlas;
};
const BUILT = new Map<string, Atlas>();
const BUILT_KEPT = 4;

function makeAtlas(faction: FactionId, hue: number): Atlas {
  const looks = looksFor(faction);
  const ramps = makeRamps(paletteFor(faction, hue), hue);
  looks.ramps?.(ramps, hue);
  const fill: number[] = [];
  const edge: number[] = [];
  for (let r = 0; r < RAMP_COUNT; r++) {
    const rp = ramps[r]!;
    for (let t = 0; t < 4; t++) fill.push(pack(rp[t]!));
    const d = rp[0]!;
    edge.push(pack([Math.round(d[0] * 0.45 + 6), Math.round(d[1] * 0.45 + 5), Math.round(d[2] * 0.45 + 5)]));
  }
  const image = document.createElement('canvas');
  image.width = COLS * W;
  image.height = KIND_COUNT * 4 * H;
  const ctx = image.getContext('2d')!;
  const painted: boolean[] = new Array<boolean>(KIND_COUNT).fill(false);
  const ensure = (kind: number): void => {
    if (painted[kind] || kind < 0 || kind >= KIND_COUNT) return;
    painted[kind] = true;
    const img = ctx.createImageData(image.width, 4 * H);
    const out = new Uint32Array(img.data.buffer);
    for (let dir = 0; dir < 4; dir++)
      for (let a = 0; a < ANIM_COUNT; a++) {
        if (a === Anim.Shoot && !SHOOTS.has(kind)) continue;
        for (let fr = 0; fr < FRAMES[a]!; fr++) {
          const sh = paint(looks, kind, a as Anim, fr, dir as Dir);
          finish(out, image.width, (COL0[a]! + fr) * W, dir * H, fill, edge, a === Anim.Dead ? null : sh, dir as Dir);
        }
      }
    ctx.putImageData(img, 0, kind * 4 * H);
  };
  // Fill the remaining kinds in the background, one per slice.
  let next = 0;
  const idle = (): void => {
    while (next < KIND_COUNT && painted[next]) next++;
    if (next >= KIND_COUNT) return;
    ensure(next);
    setTimeout(idle, 16);
  };
  if (typeof setTimeout === 'function') setTimeout(idle, 50);
  // Shoot borrows Attack for kinds that loose nothing; the classic figures walk in guard as they walk (FRAMES[Advance] = 0).
  const anim = (kind: number, a: Anim): Anim => (a === Anim.Shoot && !SHOOTS.has(kind) ? Anim.Attack : a === Anim.Advance ? Anim.Walk : a);
  const atlas: Atlas = {
    image,
    cellW: W,
    cellH: H,
    footX: FOOT_X,
    footY: FOOT_Y,
    frames: (kind, a) => FRAMES[anim(kind, a)],
    ticksPerFrame: (a) => TICKS[a],
    at: (kind, a, frame, dir) => {
      ensure(kind);
      const b = anim(kind, a);
      const n = FRAMES[b];
      const f = b === Anim.Die || b === Anim.Dead ? Math.min(Math.max(0, frame), n - 1) : ((frame % n) + n) % n;
      return [(COL0[b]! + f) * W, (kind * 4 + dir) * H];
    },
  };
  return atlas;
}
