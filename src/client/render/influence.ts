import { CanvasSource, Sprite, Texture } from 'pixi.js';
import type { World } from '../../sim/api.ts';
import { canvas2d } from './paint.ts';

const GRID = 96;
const UPDATE_MS = 300;

/**
 * A soft wash of each army's color where its soldiers stand: the front line at
 * a glance. Computed in the browser from unit positions; not part of the simulation.
 */
export class InfluenceLayer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private source: CanvasSource;
  private image: ImageData;
  private next = 0;
  private counts = new Float32Array(0);
  private blur = new Float32Array(0);
  private shown = new Float32Array(GRID * GRID * 4);

  constructor(private radius: number) {
    [this.canvas, this.ctx] = canvas2d(GRID, GRID);
    this.image = this.ctx.createImageData(GRID, GRID);
    this.source = new CanvasSource({ resource: this.canvas, scaleMode: 'linear' });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.sprite.height = radius * 2;
    this.sprite.alpha = 0.9;
  }

  update(world: World, colors: readonly [number, number, number][], now: number): void {
    if (now < this.next) return;
    this.next = now + UPDATE_MS;
    const n = world.players.length;
    if (n === 0) return;
    const size = GRID * GRID * n;
    if (this.counts.length !== size) {
      this.counts = new Float32Array(size);
      this.blur = new Float32Array(size);
    }
    this.counts.fill(0);
    const cell = (this.radius * 2) / GRID;
    for (const u of world.units) {
      if (u.p < 0) continue;
      const cx = Math.floor((u.x + this.radius) / cell);
      const cy = Math.floor((u.y + this.radius) / cell);
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
      this.counts[(cy * GRID + cx) * n + u.p]! += 1;
    }
    // A separable box blur (radius 3, sliding sums) spreads each soldier's claim over nearby ground.
    const R = 3;
    const inv = 1 / (R * 2 + 1);
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? this.counts : this.blur;
      const dst = pass === 0 ? this.blur : this.counts;
      // Pass 0 runs along rows, pass 1 down columns.
      const step = pass === 0 ? n : GRID * n;
      const lineStep = pass === 0 ? GRID * n : n;
      for (let line = 0; line < GRID; line++) {
        for (let p = 0; p < n; p++) {
          const base = line * lineStep + p;
          let sum = 0;
          for (let d = 0; d <= R; d++) sum += src[base + d * step]!;
          for (let i = 0; i < GRID; i++) {
            dst[base + i * step] = sum * inv;
            const add = i + R + 1;
            const drop = i - R;
            if (add < GRID) sum += src[base + add * step]!;
            if (drop >= 0) sum -= src[base + drop * step]!;
          }
        }
      }
    }
    const data = this.image.data;
    for (let i = 0; i < GRID * GRID; i++) {
      let best = -1;
      let top = 0;
      let second = 0;
      for (let p = 0; p < n; p++) {
        const v = this.counts[i * n + p]!;
        if (v > top) {
          second = top;
          top = v;
          best = p;
        } else if (v > second) second = v;
      }
      const strength = best < 0 ? 0 : Math.min(1, (top - second * 0.8) * 1.6);
      const [r, g, b] = best >= 0 ? colors[best]! : [0, 0, 0];
      const o = i * 4;
      // Ease toward the new picture so the front line creeps rather than flickers.
      const k = 0.35;
      this.shown[o] = this.shown[o]! + (r - this.shown[o]!) * (best >= 0 ? 1 : 0);
      this.shown[o + 1] = this.shown[o + 1]! + (g - this.shown[o + 1]!) * (best >= 0 ? 1 : 0);
      this.shown[o + 2] = this.shown[o + 2]! + (b - this.shown[o + 2]!) * (best >= 0 ? 1 : 0);
      this.shown[o + 3] = this.shown[o + 3]! + (strength * 0.42 - this.shown[o + 3]!) * k;
      data[o] = this.shown[o]!;
      data[o + 1] = this.shown[o + 1]!;
      data[o + 2] = this.shown[o + 2]!;
      data[o + 3] = Math.round(this.shown[o + 3]! * 255);
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.source.update();
  }
}
