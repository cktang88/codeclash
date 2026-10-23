import { CanvasSource, Texture } from 'pixi.js';
import { canvas2d } from './paint.ts';

// Small shared sprites: shadows, glows, sparks, projectiles and rank chevrons.
// Soldiers are painted in ./art; sites in ./siteart.

export interface Textures {
  dot: Texture;
  /** Gold rank chevrons for veteran soldiers: one, two and three bars. */
  chevrons: Texture[];
  shadow: Texture;
  soft: Texture;
  spark: Texture;
  ring: Texture;
  /**
   * A painted miniature's base: a pigment rim (white, to tint) between two ink rules over a
   * faint pigment wash. Seen from above as an ellipse, it tells the side under every soldier.
   */
  base: Texture;
  arrow: Texture;
  bolt: Texture;
  smoke: Texture;
  slash: Texture;
  decal: Texture;
  ember: Texture;
}

function toTexture(canvas: HTMLCanvasElement): CanvasSource {
  return new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
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
      ctx.strokeStyle = 'rgba(34,24,15,0.9)';
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
    base: draw(128, 128, (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(64, 64, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.arc(64, 64, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#22180f';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(64, 64, 59.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(64, 64, 44.5, 0, Math.PI * 2);
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
  };
}
