import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { Kind, KIND_COUNT } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import { canvas2d } from './paint.ts';

// Soldiers are drawn side-on, facing right, feet near the bottom of a square cell.
// Each kind has a neutral body layer and a white mask layer that is tinted with the
// army's color, plus a solid silhouette used for hit flashes.
export const CELL = 96;
export const FEET_Y = 84;
const FRAMES = 2;
const LAYERS = 3;

export interface Textures {
  dot: Texture;
  /** Gold rank chevrons for veteran soldiers: one, two and three bars. */
  chevrons: Texture[];
  shadow: Texture;
  soft: Texture;
  spark: Texture;
  ring: Texture;
  arrow: Texture;
  bolt: Texture;
  smoke: Texture;
  slash: Texture;
  decal: Texture;
  ember: Texture;
  keep: { body: Texture; mask: Texture };
  ruins: Texture;
  shrine: { body: Texture; mask: Texture };
  monolith: Texture;
  cracks: Texture;
  altar: { body: Texture; mask: Texture };
}

const INK = '#16130f';
const STEEL = '#aeb6bf';
const STEEL_DARK = '#6c757f';
const LEATHER = '#6f5638';
const LEATHER_DARK = '#4a3824';
const SKIN = '#d9b38a';
const WOOD = '#8a6a42';
const GOLD = '#e8c25a';
const STONE = '#8d8a82';
const STONE_DARK = '#5d5a54';

type Layer = 'body' | 'mask';
type Painter = (ctx: CanvasRenderingContext2D, layer: Layer, stride: number) => void;

function toTexture(canvas: HTMLCanvasElement): CanvasSource {
  return new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
}

function frame(source: CanvasSource, x: number, y: number, w: number, h: number): Texture {
  return new Texture({ source, frame: new Rectangle(x, y, w, h) });
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, path: () => void, fill: string, outline = 3): void {
  ctx.beginPath();
  path();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = outline;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, outline = 3): void {
  blob(ctx, () => ctx.arc(x, y, r, 0, Math.PI * 2), fill, outline);
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, outline = 3): void {
  blob(ctx, () => ctx.roundRect(x, y, w, h, r), fill, outline);
}

function legs(ctx: CanvasRenderingContext2D, stride: number, hipY = 62, color = LEATHER_DARK): void {
  line(ctx, 46, hipY, 42 + stride * 5, FEET_Y - 2, 6, color);
  line(ctx, 50, hipY, 54 - stride * 5, FEET_Y - 2, 6, color);
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, helmet: string | null): void {
  circle(ctx, x, y, 8, SKIN);
  if (helmet) blob(ctx, () => ctx.arc(x, y - 1, 8.5, Math.PI, 0), helmet);
}

function soft(size: number, stops: [number, string][]): HTMLCanvasElement {
  const [c, ctx] = canvas2d(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function single(canvas: HTMLCanvasElement): Texture {
  return new Texture({ source: toTexture(canvas) });
}

function draw(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): Texture {
  const [c, ctx] = canvas2d(w, h);
  paint(ctx);
  return single(c);
}

function chevron(rank: number): Texture {
  return draw(32, 32, (ctx) => {
    for (let i = 0; i < rank; i++) {
      const y = 22 - i * 7;
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(16, y - 7);
      ctx.lineTo(28, y);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#2a1c06';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f2cf62';
      ctx.stroke();
    }
  });
}

export function makeTextures(): Textures {
  return {
    chevrons: [1, 2, 3].map(chevron),
    dot: draw(32, 32, (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(10,10,10,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }),
    shadow: single(soft(64, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']])),
    soft: single(soft(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']])),
    spark: draw(32, 32, (ctx) => {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 16 : 5;
        ctx.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
      }
      ctx.fill();
    }),
    ring: draw(128, 128, (ctx) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(64, 64, 58, 0, Math.PI * 2);
      ctx.stroke();
    }),
    arrow: draw(32, 8, (ctx) => {
      ctx.strokeStyle = '#3b2c1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 4);
      ctx.lineTo(26, 4);
      ctx.stroke();
      ctx.fillStyle = '#d9dee3';
      ctx.beginPath();
      ctx.moveTo(32, 4);
      ctx.lineTo(25, 1);
      ctx.lineTo(25, 7);
      ctx.fill();
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(1, 2, 5, 1.5);
      ctx.fillRect(1, 4.5, 5, 1.5);
    }),
    bolt: draw(48, 12, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 48, 0);
      g.addColorStop(0, 'rgba(255,220,140,0)');
      g.addColorStop(0.7, 'rgba(255,230,170,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(28, 6, 20, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
    smoke: single(soft(64, [[0, 'rgba(255,255,255,0.75)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']])),
    slash: draw(64, 64, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = 5 - i * 1.5;
        ctx.globalAlpha = 1 - i * 0.3;
        ctx.beginPath();
        ctx.arc(20, 32, 26 - i * 4, -1.0, 1.0);
        ctx.stroke();
      }
    }),
    decal: draw(48, 32, (ctx) => {
      ctx.fillStyle = 'rgba(40,22,16,0.55)';
      ctx.beginPath();
      ctx.ellipse(24, 16, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,64,58,0.7)';
      ctx.fillRect(10, 14, 22, 3);
      ctx.fillRect(28, 10, 3, 10);
    }),
    ember: single(soft(32, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,230,180,0.9)'], [1, 'rgba(255,120,40,0)']])),
    keep: keep(),
    ruins: ruins(),
    shrine: shrine(),
    monolith: monolith(),
    cracks: cracks(),
    altar: altar(),
  };
}

function layered(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, layer: Layer) => void): { body: Texture; mask: Texture } {
  const [b, bctx] = canvas2d(w, h);
  paint(bctx, 'body');
  const [m, mctx] = canvas2d(w, h);
  paint(mctx, 'mask');
  return { body: single(b), mask: single(m) };
}

function keep(): { body: Texture; mask: Texture } {
  return layered(256, 256, (ctx, layer) => {
    if (layer === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(128, 214, 110, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      // Curtain wall with towers.
      rrect(ctx, 30, 120, 196, 92, 6, STONE, 5);
      for (let x = 30; x < 226; x += 20) rrect(ctx, x, 110, 12, 14, 2, STONE, 4);
      rrect(ctx, 104, 158, 48, 54, 22, '#2c241a', 4);
      for (const x of [18, 196]) {
        rrect(ctx, x, 90, 42, 122, 6, STONE_DARK, 5);
        for (let i = 0; i < 3; i++) rrect(ctx, x + i * 14, 80, 10, 14, 2, STONE_DARK, 4);
      }
      rrect(ctx, 86, 40, 84, 100, 6, STONE_DARK, 5);
      for (let i = 0; i < 5; i++) rrect(ctx, 86 + i * 17, 30, 12, 14, 2, STONE_DARK, 4);
      ctx.fillStyle = 'rgba(20,16,10,0.85)';
      for (const [x, y] of [[112, 70], [138, 70], [34, 130], [208, 130]] as const) ctx.fillRect(x, y, 8, 16);
      line(ctx, 128, 30, 128, -2, 4, WOOD);
    } else {
      // Banners hung on the walls and towers.
      for (const x of [56, 168]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x, 128);
        ctx.lineTo(x + 24, 128);
        ctx.lineTo(x + 24, 176);
        ctx.lineTo(x + 12, 166);
        ctx.lineTo(x, 176);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(98, 96, 60, 10);
      ctx.fillRect(24, 100, 30, 8);
      ctx.fillRect(202, 100, 30, 8);
    }
  });
}

function ruins(): Texture {
  return draw(256, 256, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(128, 214, 110, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, () => {
      ctx.moveTo(30, 212);
      ctx.lineTo(30, 150);
      ctx.lineTo(52, 132);
      ctx.lineTo(70, 160);
      ctx.lineTo(96, 140);
      ctx.lineTo(120, 170);
      ctx.lineTo(150, 120);
      ctx.lineTo(176, 160);
      ctx.lineTo(200, 128);
      ctx.lineTo(226, 150);
      ctx.lineTo(226, 212);
      ctx.closePath();
    }, '#615d56', 5);
    for (let i = 0; i < 14; i++) {
      const x = 30 + ((i * 53) % 190);
      const y = 190 + ((i * 29) % 26);
      rrect(ctx, x, y, 14, 9, 2, i % 2 ? STONE_DARK : '#4a4640', 3);
    }
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(110, 176, 36, 36);
  });
}

function shrine(): { body: Texture; mask: Texture } {
  return layered(160, 160, (ctx, layer) => {
    if (layer === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(80, 120, 64, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      blob(ctx, () => ctx.ellipse(80, 112, 56, 20, 0, 0, Math.PI * 2), '#77736a', 4);
      blob(ctx, () => ctx.ellipse(80, 108, 44, 14, 0, 0, Math.PI * 2), '#9a958a', 3);
      for (const [x, y, h] of [[34, 100, 34], [126, 100, 34], [56, 92, 40], [104, 92, 40]] as const) rrect(ctx, x - 6, y - h, 12, h, 3, STONE, 3);
      blob(ctx, () => {
        ctx.moveTo(80, 30);
        ctx.lineTo(96, 70);
        ctx.lineTo(80, 106);
        ctx.lineTo(64, 70);
        ctx.closePath();
      }, '#e6e4dc', 4);
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      for (const [x, y, h] of [[34, 100, 34], [126, 100, 34], [56, 92, 40], [104, 92, 40]] as const) {
        ctx.beginPath();
        ctx.moveTo(x - 2, y - h + 8);
        ctx.lineTo(x + 2, y - h + 14);
        ctx.lineTo(x - 2, y - h + 20);
        ctx.moveTo(x, y - h + 24);
        ctx.lineTo(x, y - h + 30);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(80, 36);
      ctx.lineTo(92, 70);
      ctx.lineTo(80, 100);
      ctx.lineTo(68, 70);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function monolith(): Texture {
  return draw(192, 320, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(96, 296, 84, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, () => {
      ctx.moveTo(40, 300);
      ctx.lineTo(152, 300);
      ctx.lineTo(140, 280);
      ctx.lineTo(52, 280);
      ctx.closePath();
    }, '#3b3a44', 5);
    blob(ctx, () => {
      ctx.moveTo(60, 282);
      ctx.lineTo(132, 282);
      ctx.lineTo(120, 40);
      ctx.lineTo(96, 8);
      ctx.lineTo(72, 40);
      ctx.closePath();
    }, '#2a2933', 6);
    const g = ctx.createLinearGradient(60, 0, 132, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(60, 282);
    ctx.lineTo(132, 282);
    ctx.lineTo(120, 40);
    ctx.lineTo(96, 8);
    ctx.lineTo(72, 40);
    ctx.closePath();
    ctx.fill();
    // Glyphs of forgotten code.
    ctx.fillStyle = 'rgba(150,220,255,0.85)';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const glyphs = ['{ }', '</>', 'goto', ';;', '=>', 'NULL', '/* */'];
    glyphs.forEach((t, i) => ctx.fillText(t, 96, 70 + i * 30));
  });
}

function cracks(): Texture {
  return draw(192, 320, (ctx) => {
    ctx.strokeStyle = 'rgba(255,160,80,0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const paths: [number, number][][] = [
      [[96, 30], [90, 70], [104, 110], [92, 150]],
      [[80, 260], [88, 220], [76, 190], [86, 160]],
      [[120, 200], [110, 170], [118, 140]],
      [[70, 120], [82, 100], [74, 80]],
    ];
    for (const p of paths) {
      ctx.beginPath();
      p.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  });
}

function altar(): { body: Texture; mask: Texture } {
  return layered(200, 200, (ctx, layer) => {
    if (layer === 'body') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(100, 150, 84, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      blob(ctx, () => ctx.ellipse(100, 140, 76, 26, 0, 0, Math.PI * 2), '#6f6a60', 5);
      blob(ctx, () => ctx.ellipse(100, 134, 56, 18, 0, 0, Math.PI * 2), '#8f897d', 4);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        rrect(ctx, 100 + Math.cos(a) * 64 - 5, 136 + Math.sin(a) * 22 - 30, 10, 30, 2, STONE_DARK, 3);
      }
      circle(ctx, 100, 104, 22, '#e9e5da', 4);
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(100, 104, 17, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
