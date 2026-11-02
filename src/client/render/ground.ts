// The field, painted once per battle in map pixels (see iso.ts), so that its ordered dithering
// sits exactly on the screen's pixels: a dry Levantine steppe of olive grass, bare earth and wet
// mud, a trodden road between the armies, stones and tufts, and beyond the fighting area a few
// cypresses, olive trees, boulders and ruins (returned as props, drawn as sprites so that men can
// pass behind them). The canvas becomes a texture that the dead are later stamped onto.

import { FIELD_H, FIELD_W } from '../../game/battle.ts';
import { Rng } from '../../game/rng.ts';
import { projX, projY, unproject } from './iso.ts';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

/** World units of ground painted around the field. */
export const MARGIN = 150;

/** Smooth value noise on an unbounded lattice (hashed), so any world point is defined. */
function valueNoise(rng: Rng, _x0: number, _y0: number, _w: number, _h: number, cell: number): (x: number, y: number) => number {
  const salt = Math.floor(rng.next() * 0x7fffffff);
  const lat = (ix: number, iy: number) => {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = sm(fx - ix);
    const ty = sm(fy - iy);
    const a = lat(ix, iy);
    const b = lat(ix + 1, iy);
    const c = lat(ix, iy + 1);
    const d = lat(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

type RGB = [number, number, number];
const DARK: RGB = [84, 80, 46];
const GRASS: RGB = [96, 92, 52];
const GRASS2: RGB = [114, 104, 60];
const DRY: RGB = [146, 126, 80];
const PALE: RGB = [166, 146, 100];
const EARTH: RGB = [124, 96, 64];
const MUD: RGB = [92, 72, 50];
const WET: RGB = [74, 60, 44];
const ROAD: RGB = [158, 134, 96];
const RUT: RGB = [108, 88, 62];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type PropKind = 'cypress' | 'olive' | 'deadtree' | 'boulder' | 'ruin' | 'column' | 'bush';

export interface Prop {
  kind: PropKind;
  /** World position of its foot. */
  x: number;
  y: number;
  variant: number;
}

export interface Ground {
  canvas: HTMLCanvasElement;
  /** Map pixel = projected pixel − (ox, oy). */
  ox: number;
  oy: number;
  w: number;
  h: number;
  props: Prop[];
  /** World y of the road's centre at x. */
  road(x: number): number;
}

export function paintGround(seed: number): Ground {
  const wx0 = -MARGIN;
  const wy0 = -MARGIN;
  const wx1 = FIELD_W + MARGIN;
  const wy1 = FIELD_H + MARGIN;
  const corners: [number, number][] = [
    [wx0, wy0],
    [wx1, wy0],
    [wx0, wy1],
    [wx1, wy1],
  ];
  const xs = corners.map(([x, y]) => projX(x, y));
  const ys = corners.map(([x, y]) => projY(x, y));
  const ox = Math.floor(Math.min(...xs));
  const oy = Math.floor(Math.min(...ys));
  const W = Math.ceil(Math.max(...xs)) - ox;
  const H = Math.ceil(Math.max(...ys)) - oy;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const rng = new Rng(seed ^ 0x51ed);
  const ww = wx1 - wx0;
  const wh = wy1 - wy0;
  const big = valueNoise(rng, wx0, wy0, ww, wh, 110);
  const mid = valueNoise(rng, wx0, wy0, ww, wh, 30);
  const fine = valueNoise(rng, wx0, wy0, ww, wh, 6);
  const mudN = valueNoise(rng, wx0, wy0, ww, wh, 45);
  const roadY0 = FIELD_H * (0.3 + rng.next() * 0.4);
  const roadBend = (rng.next() - 0.5) * 120;
  const roadPhase = rng.next() * Math.PI;
  const road = (x: number) => roadY0 + roadBend * Math.sin((x / FIELD_W) * Math.PI * 1.3 + roadPhase);
  const speck = new Rng(seed ^ 0x77);

  for (let my = 0; my < H; my++) {
    for (let mx = 0; mx < W; mx++) {
      const [x, y] = unproject(mx + ox, my + oy);
      const d = BAYER[(my & 3) * 4 + (mx & 3)]!;
      const inside = x > -20 && x < FIELD_W + 20 && y > -10 && y < FIELD_H + 10;
      const n = big(x, y) * 0.5 + mid(x, y) * 0.32 + fine(x, y) * 0.18;
      const v = Math.min(0.999, Math.max(0, n + (d - 0.5) * 0.14));
      let c: RGB = v < 0.3 ? DARK : v < 0.44 ? GRASS : v < 0.56 ? GRASS2 : v < 0.68 ? mix(GRASS2, DRY, 0.5) : v < 0.8 ? DRY : PALE;
      // Bare earth and mud in the hollows.
      const m = mudN(x, y) * 0.8 + fine(x * 1.7, y * 1.7) * 0.2 + (d - 0.5) * 0.12;
      if (m > 0.68) c = m > 0.75 ? (m > 0.8 ? WET : MUD) : mix(EARTH, c, 0.4);
      // The road and its ruts.
      const ry = road(x);
      const off = Math.abs(y - ry);
      const edge = off / 8 + (fine(x * 2, y * 2) - 0.5) * 0.5 + (d - 0.5) * 0.25;
      if (edge < 1) {
        c = mix(ROAD, c, Math.max(0, edge - 0.5));
        const rut = Math.abs(off - 3.2);
        if (rut < 0.75 && edge < 0.9) c = RUT;
      }
      // Beyond the fighting area the grass is lusher and darker.
      if (!inside) c = mix(c, DARK, 0.12);
      // Single-pixel speckle: blades and grit.
      const s = speck.next();
      if (s < 0.04) c = mix(c, [24, 22, 16], 0.35);
      else if (s > 0.975) c = mix(c, [170, 160, 120], 0.22);
      const i = (my * W + mx) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Tufts, stones and pebbles, painted in map pixels.
  const n = Math.round((W * H) / 260);
  // Clumps: most tufts gather around a few hundred centres, with bare stretches between.
  const clumps: [number, number][] = [];
  for (let i = 0; i < n / 8; i++) clumps.push([rng.next() * W, rng.next() * H]);
  for (let i = 0; i < n; i++) {
    let mx: number;
    let my: number;
    if (rng.next() < 0.7) {
      const c = clumps[rng.int(clumps.length)]!;
      mx = Math.floor(c[0] + (rng.next() - 0.5) * 18);
      my = Math.floor(c[1] + (rng.next() - 0.5) * 9);
    } else {
      mx = Math.floor(rng.next() * W);
      my = Math.floor(rng.next() * H);
    }
    const [x, y] = unproject(mx + ox, my + oy);
    if (Math.abs(y - road(x)) < 7) {
      // Pale pebbles on the road.
      if (rng.next() < 0.5) {
        ctx.fillStyle = rng.next() < 0.5 ? '#c4b898' : '#9a8c6c';
        ctx.fillRect(mx, my, 1, 1);
      }
      continue;
    }
    const k = rng.next();
    if (k < 0.62) {
      // A tuft of grass: a few upright blades, light over dark.
      const dry = rng.next() < 0.4;
      ctx.fillStyle = dry ? '#5f5634' : '#3b4426';
      ctx.fillRect(mx, my, 3, 1);
      ctx.fillStyle = dry ? '#968a58' : '#66703e';
      ctx.fillRect(mx, my - 1, 1, 1);
      ctx.fillRect(mx + 2, my - 1, 1, 1);
      ctx.fillRect(mx + 1, my - 2, 1, 2);
    } else if (k < 0.82) {
      // A stone with a lit top and a shadowed foot.
      ctx.fillStyle = '#2c2a24';
      ctx.fillRect(mx, my + 1, 3, 1);
      ctx.fillStyle = '#6e695c';
      ctx.fillRect(mx, my, 3, 1);
      ctx.fillStyle = '#9a9380';
      ctx.fillRect(mx, my, 1, 1);
    } else if (k < 0.92) {
      ctx.fillStyle = '#8a8270';
      ctx.fillRect(mx, my, 1, 1);
    } else {
      // A dark scrape in the dirt.
      ctx.fillStyle = 'rgba(28,22,14,0.45)';
      ctx.fillRect(mx, my, 3 + Math.floor(rng.next() * 4), 1);
    }
  }

  // Props outside the fighting area, in a few clumps.
  const props: Prop[] = [];
  const kinds: PropKind[] = ['cypress', 'cypress', 'olive', 'olive', 'bush', 'bush', 'boulder', 'deadtree', 'ruin', 'column'];
  const free = (x: number, y: number) => {
    if (x > -30 && x < FIELD_W + 30 && y > -14 && y < FIELD_H + 14) return false;
    if (Math.abs(y - road(x)) < 14) return false;
    const mx = projX(x, y) - ox;
    const my = projY(x, y) - oy;
    return mx > 16 && my > 40 && mx < W - 16 && my < H - 4;
  };
  for (let c = 0; c < 22; c++) {
    const side = rng.int(4);
    const cx = side < 2 ? wx0 + rng.next() * ww : side === 2 ? wx0 + rng.next() * (MARGIN - 30) : FIELD_W + 30 + rng.next() * (MARGIN - 30);
    const cy = side === 0 ? wy0 + rng.next() * (MARGIN - 14) : side === 1 ? FIELD_H + 14 + rng.next() * (MARGIN - 14) : wy0 + rng.next() * wh;
    const ruin = rng.next() < 0.18;
    const count = ruin ? 2 + rng.int(3) : 2 + rng.int(5);
    for (let k = 0; k < count; k++) {
      const x = cx + (rng.next() - 0.5) * 50;
      const y = cy + (rng.next() - 0.5) * 30;
      if (!free(x, y)) continue;
      const kind = ruin ? (rng.next() < 0.6 ? 'ruin' : rng.next() < 0.5 ? 'column' : 'boulder') : kinds[rng.int(kinds.length - 2)]!;
      props.push({ kind, x, y, variant: rng.int(3) });
    }
  }
  return { canvas, ox, oy, w: W, h: H, props, road };
}
