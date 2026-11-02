// The finish over every scene: a cold-shadow, warm-light grade, a heavy vignette, film grain
// and faint scanlines. Plain canvas compositing, no shaders.

export class Post {
  private grain: HTMLCanvasElement[] = [];
  private vignette: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;
  private frame = 0;

  constructor() {
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.grain.push(c);
    }
  }

  private vignetteFor(w: number, h: number): HTMLCanvasElement {
    if (this.vignette && this.vignette.w === w && this.vignette.h === h) return this.vignette.canvas;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(6,4,2,0.38)');
    g.addColorStop(1, 'rgba(4,2,1,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this.vignette = { w, h, canvas: c };
    return c;
  }

  apply(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, px: number, scanlines: boolean): void {
    ctx.save();
    // Grade: lift the light toward amber, push the shadows toward teal.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(214,150,80,0.38)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(150,170,175,0.22)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.vignetteFor(w, h), x, y);
    // Grain, a fresh tile each frame.
    this.frame = (this.frame + 1) % 4;
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.09;
    const tile = this.grain[this.frame]!;
    const ox = Math.floor(Math.random() * tile.width);
    const oy = Math.floor(Math.random() * tile.height);
    for (let ty = y - oy; ty < y + h; ty += tile.height) for (let tx = x - ox; tx < x + w; tx += tile.width) ctx.drawImage(tile, tx, ty);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (scanlines && px >= 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      for (let sy = y; sy < y + h; sy += px) ctx.fillRect(x, sy + px - 1, w, 1);
    }
    ctx.restore();
  }
}
