// The field: a muddy steppe painted once per battle, dithered like old pixel art, onto which
// the dead, the blood and the spent arrows are stamped as they fall, and stay.

import { FIELD_H, FIELD_W } from '../../game/battle.ts';
import { Rng } from '../../game/rng.ts';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

function valueNoise(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = sm(fx - ix);
    const ty = sm(fy - iy);
    const a = g[iy * gw + ix]!;
    const b = g[iy * gw + ix + 1]!;
    const c = g[(iy + 1) * gw + ix]!;
    const d = g[(iy + 1) * gw + ix + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

type RGB = [number, number, number];
const MUD: RGB = [46, 40, 29];
const DARK: RGB = [36, 38, 26];
const GRASS: RGB = [62, 68, 40];
const DRY: RGB = [86, 82, 54];
const PALE: RGB = [104, 98, 66];

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function paintGround(seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD_W;
  canvas.height = FIELD_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(FIELD_W, FIELD_H);
  const rng = new Rng(seed ^ 0x51ed);
  const big = valueNoise(rng, FIELD_W, FIELD_H, 90);
  const mid = valueNoise(rng, FIELD_W, FIELD_H, 24);
  const fine = valueNoise(rng, FIELD_W, FIELD_H, 5);
  // A trodden track across the field.
  const trackY = FIELD_H * (0.3 + rng.next() * 0.4);
  const trackBend = (rng.next() - 0.5) * 80;
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const n = big(x, y) * 0.55 + mid(x, y) * 0.3 + fine(x, y) * 0.15;
      const ty = trackY + trackBend * Math.sin((x / FIELD_W) * Math.PI);
      const track = Math.max(0, 1 - Math.abs(y - ty) / 9) * (0.6 + fine(x * 2, y * 2) * 0.4);
      // Quantize with ordered dithering: four bands of colour, never a smooth gradient.
      const d = BAYER[(y & 3) * 4 + (x & 3)]!;
      const v = Math.min(0.999, Math.max(0, n + (d - 0.5) * 0.12));
      let c: RGB = v < 0.3 ? DARK : v < 0.5 ? GRASS : v < 0.68 ? mix(GRASS, DRY, 0.5) : v < 0.82 ? DRY : PALE;
      if (track + (d - 0.5) * 0.3 > 0.45) c = mix(MUD, c, 0.25);
      // Distance from the centre darkens the edges a touch.
      const i = (y * FIELD_W + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Tufts, stones and old ruts.
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(rng.next() * FIELD_W);
    const y = Math.floor(rng.next() * FIELD_H);
    const k = rng.next();
    if (k < 0.7) {
      ctx.fillStyle = k < 0.35 ? '#56603a' : '#79744a';
      ctx.fillRect(x, y, 1, 2);
      ctx.fillRect(x + 1, y + 1, 1, 1);
    } else if (k < 0.85) {
      ctx.fillStyle = '#5d5a52';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = '#3b3934';
      ctx.fillRect(x, y + 1, 2, 1);
    } else {
      ctx.fillStyle = 'rgba(30,24,16,0.5)';
      ctx.fillRect(x, y, 3 + Math.floor(rng.next() * 4), 1);
    }
  }
  return canvas;
}

/** Stamps a pool of blood under a fallen soldier. */
export function stampBlood(ctx: CanvasRenderingContext2D, x: number, y: number, rng: Rng, size = 1): void {
  const n = Math.round((4 + rng.next() * 6) * size);
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rng.next() - 0.5) * 5 * size);
    const dy = Math.round((rng.next() - 0.5) * 2.5 * size);
    ctx.fillStyle = rng.next() < 0.5 ? '#4e0b0b' : '#6a1010';
    ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1 + (rng.next() < 0.3 ? 1 : 0), 1);
  }
}

/** A spent arrow stuck in the ground. */
export function stampArrow(ctx: CanvasRenderingContext2D, x: number, y: number, left: boolean): void {
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(Math.round(x), Math.round(y) - 2, 1, 2);
  ctx.fillStyle = '#8c8270';
  ctx.fillRect(Math.round(x) + (left ? 1 : -1), Math.round(y) - 3, 1, 1);
}

/** A stone's crater. */
export function stampCrater(ctx: CanvasRenderingContext2D, x: number, y: number, rng: Rng): void {
  ctx.fillStyle = 'rgba(24,18,12,0.7)';
  ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 7, 3);
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? '#3e3528' : '#5d5240';
    ctx.fillRect(Math.round(x + (rng.next() - 0.5) * 12), Math.round(y + (rng.next() - 0.5) * 6), 1, 1);
  }
}
