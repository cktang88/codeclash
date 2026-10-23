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

export interface UnitFrames {
  body: Texture[];
  mask: Texture[];
  sil: Texture;
}

export interface Textures {
  units: UnitFrames[];
  /** World height of a soldier sprite, per kind. */
  unitScale: number[];
  dot: Texture;
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

const BONE = '#e6dfc8';
const BONE_DARK = '#b3a988';
const TROLL = '#7d9468';
const TROLL_DARK = '#56684a';
const ROBE = '#d8d2c2';
const FIRE = '#ffb347';

function horse(ctx: CanvasRenderingContext2D, stride: number, coat: string, heavy: boolean): void {
  const s = stride * 4;
  const leg = heavy ? 6 : 5;
  line(ctx, 30, 62, 26 + s, FEET_Y - 1, leg, '#4a3c30');
  line(ctx, 38, 62, 40 - s, FEET_Y - 1, leg, '#4a3c30');
  line(ctx, 60, 62, 56 - s, FEET_Y - 1, leg, '#4a3c30');
  line(ctx, 68, 62, 72 + s, FEET_Y - 1, leg, '#4a3c30');
  blob(ctx, () => ctx.ellipse(48, 56, heavy ? 29 : 27, heavy ? 14 : 12, 0, 0, Math.PI * 2), coat);
  blob(ctx, () => {
    ctx.moveTo(66, 52);
    ctx.lineTo(80, 34);
    ctx.lineTo(90, 38);
    ctx.lineTo(86, 44);
    ctx.lineTo(74, 56);
    ctx.closePath();
  }, coat);
  line(ctx, 22, 52, 14, 64, 4, '#3d3026');
}

function wing(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, lift: number, fill: string): void {
  blob(ctx, () => {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - span * 0.3, y - lift * 1.1, x - span, y - lift);
    ctx.lineTo(x - span * 0.75, y - lift * 0.45);
    ctx.lineTo(x - span * 0.85, y - lift * 0.1);
    ctx.lineTo(x - span * 0.5, y - lift * 0.15);
    ctx.lineTo(x - span * 0.55, y + lift * 0.15);
    ctx.closePath();
  }, fill);
}

const PAINTERS: Record<Kind, Painter> = {
  [Kind.Footman]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride);
      line(ctx, 30, 74, 70, 14, 3.5, WOOD);
      blob(ctx, () => {
        ctx.moveTo(70, 8);
        ctx.lineTo(74, 20);
        ctx.lineTo(66, 18);
        ctx.closePath();
      }, STEEL);
      rrect(ctx, 39, 42, 18, 22, 5, STEEL_DARK);
      head(ctx, 48, 33, STEEL);
      circle(ctx, 40, 54, 13, STEEL);
    } else {
      rrect(ctx, 41, 46, 14, 16, 3, '#fff', 0);
      circle(ctx, 40, 54, 9.5, '#fff', 0);
      circle(ctx, 40, 54, 3.5, '#5a5a5a', 0);
    }
  },
  [Kind.Knight]: (ctx, layer, stride) => {
    if (layer === 'body') {
      horse(ctx, stride, '#7d6a58', true);
      rrect(ctx, 66, 34, 18, 10, 3, STEEL, 2);
      rrect(ctx, 39, 22, 16, 22, 4, STEEL);
      head(ctx, 47, 15, STEEL);
      rrect(ctx, 41, 12, 12, 4, 1, STEEL_DARK, 2);
      line(ctx, 26, 40, 94, 18, 3.5, '#d9d2c0');
      circle(ctx, 36, 36, 9, STEEL);
    } else {
      blob(ctx, () => {
        ctx.moveTo(26, 46);
        ctx.lineTo(70, 46);
        ctx.lineTo(66, 70);
        ctx.lineTo(56, 64);
        ctx.lineTo(46, 70);
        ctx.lineTo(36, 64);
        ctx.lineTo(28, 70);
        ctx.closePath();
      }, '#fff', 0);
      blob(ctx, () => {
        ctx.moveTo(46, 10);
        ctx.quadraticCurveTo(38, -2, 28, 8);
        ctx.quadraticCurveTo(38, 8, 42, 14);
        ctx.closePath();
      }, '#fff', 0);
      circle(ctx, 36, 36, 6.5, '#fff', 0);
    }
  },
  [Kind.Warden]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride * 0.6, 62, STEEL_DARK);
      rrect(ctx, 37, 40, 22, 26, 5, STEEL_DARK);
      head(ctx, 46, 31, STEEL);
      rrect(ctx, 41, 26, 10, 4, 1, STEEL_DARK, 2);
      rrect(ctx, 52, 24, 22, 56, 5, STEEL);
    } else {
      rrect(ctx, 56, 28, 14, 48, 3, '#fff', 0);
      rrect(ctx, 61.5, 31, 3, 42, 1, '#9a9a9a', 0);
      rrect(ctx, 57, 46.5, 12, 3, 1, '#9a9a9a', 0);
    }
  },
  [Kind.Paladin]: (ctx, layer, stride) => {
    if (layer === 'body') {
      ctx.strokeStyle = 'rgba(255,230,140,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(46, 18, 12, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      legs(ctx, stride * 0.7, 64, STEEL_DARK);
      line(ctx, 60, 60, 72, 22, 4, WOOD);
      rrect(ctx, 64, 12, 18, 14, 3, '#e8dcb0');
      rrect(ctx, 34, 38, 26, 30, 6, '#d6dce2');
      head(ctx, 46, 30, '#e3e7eb');
      circle(ctx, 36, 54, 15, '#d6dce2');
    } else {
      rrect(ctx, 38, 44, 18, 20, 3, '#fff', 0);
      circle(ctx, 36, 54, 11.5, '#fff', 0);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(ctx, 36, 54, 36 + Math.cos(a) * 8, 54 + Math.sin(a) * 8, 1, '#c8a840');
      }
      circle(ctx, 36, 54, 3.5, '#e8c25a', 0);
    }
  },
  [Kind.Archer]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride);
      rrect(ctx, 30, 36, 8, 24, 3, LEATHER, 2);
      line(ctx, 33, 34, 31, 28, 2, '#ddd');
      line(ctx, 36, 34, 37, 27, 2, '#ddd');
      rrect(ctx, 40, 42, 15, 22, 5, LEATHER);
      head(ctx, 47, 33, null);
      bow(ctx, 52, 48, 22);
      line(ctx, 50, 50, 64, 46, 2.5, SKIN);
    } else {
      blob(ctx, () => ctx.arc(47, 32, 9.5, Math.PI * 0.95, Math.PI * 2.05), '#fff', 0);
      rrect(ctx, 42, 46, 11, 15, 3, '#fff', 0);
    }
  },
  [Kind.Ranger]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride, 62, '#3e4a32');
      rrect(ctx, 40, 40, 14, 24, 5, '#4f5e3c');
      head(ctx, 47, 31, null);
      blob(ctx, () => {
        ctx.moveTo(41, 30);
        ctx.lineTo(34, 24);
        ctx.lineTo(40, 34);
        ctx.closePath();
      }, SKIN, 2);
      bow(ctx, 54, 44, 30);
      line(ctx, 50, 48, 66, 42, 2.5, SKIN);
    } else {
      blob(ctx, () => {
        ctx.moveTo(38, 24);
        ctx.quadraticCurveTo(47, 16, 56, 26);
        ctx.lineTo(54, 40);
        ctx.quadraticCurveTo(36, 50, 28, 76);
        ctx.lineTo(38, 76);
        ctx.lineTo(42, 42);
        ctx.closePath();
      }, '#fff', 0);
    }
  },
  [Kind.Herald]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride);
      line(ctx, 60, FEET_Y, 60, 6, 3.5, WOOD);
      circle(ctx, 60, 6, 3.5, GOLD, 2);
      blob(ctx, () => {
        ctx.moveTo(38, 42);
        ctx.lineTo(56, 42);
        ctx.lineTo(58, 70);
        ctx.lineTo(36, 70);
        ctx.closePath();
      }, '#cfc6b0');
      head(ctx, 47, 33, null);
      line(ctx, 50, 50, 60, 46, 3, SKIN);
      rrect(ctx, 60, 9, 26, 22, 2, '#ddd');
    } else {
      blob(ctx, () => {
        ctx.moveTo(61, 11);
        ctx.lineTo(84, 11);
        ctx.lineTo(84, 29);
        ctx.lineTo(72, 24);
        ctx.lineTo(61, 29);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 42, 46, 10, 20, 2, '#fff', 0);
    }
  },
  [Kind.Wizard]: (ctx, layer, stride) => {
    if (layer === 'body') {
      blob(ctx, () => {
        ctx.moveTo(36, 40);
        ctx.lineTo(56, 40);
        ctx.lineTo(62, FEET_Y);
        ctx.lineTo(30, FEET_Y);
        ctx.closePath();
      }, '#5b5f8a');
      line(ctx, 62, FEET_Y, 66, 14 + stride, 3, WOOD);
      circle(ctx, 66, 12, 6, '#9fe0ff', 2);
      head(ctx, 46, 33, null);
      blob(ctx, () => {
        ctx.moveTo(44, 36);
        ctx.lineTo(48, 52);
        ctx.lineTo(52, 36);
        ctx.closePath();
      }, '#eeeeee', 2);
      line(ctx, 50, 48, 62, 44, 3, '#5b5f8a');
    } else {
      blob(ctx, () => {
        ctx.moveTo(34, 30);
        ctx.lineTo(58, 30);
        ctx.lineTo(50, 24);
        ctx.lineTo(42, 0);
        ctx.lineTo(40, 24);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 32, 70, 30, 6, 2, '#fff', 0);
    }
  },
  [Kind.Sapper]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride);
      line(ctx, 36, 70, 64, 26, 4, WOOD);
      rrect(ctx, 56, 14, 20, 12, 2, STEEL_DARK);
      rrect(ctx, 39, 42, 18, 23, 5, LEATHER);
      head(ctx, 48, 33, '#c9a54a');
      line(ctx, 52, 50, 58, 38, 3, SKIN);
    } else {
      rrect(ctx, 41, 50, 14, 14, 2, '#fff', 0);
      rrect(ctx, 39.5, 28, 17, 3, 1, '#fff', 0);
    }
  },
  [Kind.Trebuchet]: (ctx, layer, stride) => {
    void stride;
    if (layer === 'body') {
      circle(ctx, 22, 78, 9, '#5a4630');
      circle(ctx, 74, 78, 9, '#5a4630');
      rrect(ctx, 10, 66, 76, 8, 2, WOOD);
      line(ctx, 30, 70, 46, 30, 5, WOOD);
      line(ctx, 66, 70, 50, 30, 5, WOOD);
      line(ctx, 18, 12, 70, 44, 4, '#7a5a34');
      rrect(ctx, 62, 38, 16, 18, 3, STONE_DARK);
      line(ctx, 18, 12, 14, 30, 1.5, '#ccc');
      circle(ctx, 14, 32, 4, STONE, 2);
    } else {
      blob(ctx, () => {
        ctx.moveTo(48, 30);
        ctx.lineTo(48, 4);
        ctx.lineTo(64, 9);
        ctx.lineTo(48, 14);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 14, 67, 68, 3, 1, '#fff', 0);
    }
  },
  [Kind.Outrider]: (ctx, layer, stride) => {
    if (layer === 'body') {
      horse(ctx, stride, '#8a735a', false);
      rrect(ctx, 40, 26, 14, 20, 4, LEATHER);
      head(ctx, 47, 19, STEEL);
      line(ctx, 30, 44, 92, 26, 2.5, WOOD);
    } else {
      blob(ctx, () => {
        ctx.moveTo(34, 46);
        ctx.lineTo(60, 46);
        ctx.lineTo(56, 64);
        ctx.lineTo(38, 64);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 42, 29, 10, 14, 2, '#fff', 0);
    }
  },
  [Kind.GriffinRider]: (ctx, layer, stride) => {
    const flap = stride > 0 ? 1 : 0.55;
    if (layer === 'body') {
      line(ctx, 40, 60, 36, 74, 5, '#8a6a3a');
      line(ctx, 58, 60, 62, 74, 5, '#d8c890');
      blob(ctx, () => ctx.ellipse(48, 54, 24, 11, -0.1, 0, Math.PI * 2), '#a8834a');
      blob(ctx, () => {
        ctx.moveTo(24, 52);
        ctx.quadraticCurveTo(10, 50, 8, 62);
        ctx.quadraticCurveTo(16, 56, 26, 58);
        ctx.closePath();
      }, '#a8834a');
      blob(ctx, () => ctx.arc(74, 44, 9, 0, Math.PI * 2), '#f2ecdc');
      blob(ctx, () => {
        ctx.moveTo(81, 42);
        ctx.lineTo(92, 47);
        ctx.lineTo(81, 49);
        ctx.closePath();
      }, GOLD, 2);
      rrect(ctx, 42, 28, 12, 18, 4, STEEL_DARK);
      head(ctx, 48, 22, STEEL);
      line(ctx, 54, 34, 80, 20, 2.5, WOOD);
    }
    wing(ctx, 46, 48, 44, 40 * flap, layer === 'body' ? '#f0e6cc' : 'rgba(0,0,0,0)');
    if (layer === 'mask') {
      blob(ctx, () => {
        ctx.moveTo(38, 46);
        ctx.lineTo(58, 46);
        ctx.lineTo(56, 60);
        ctx.lineTo(40, 60);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 44, 31, 8, 12, 2, '#fff', 0);
    }
  },
  [Kind.Skeleton]: (ctx, layer, stride) => {
    if (layer === 'body') {
      line(ctx, 46, 62, 42 + stride * 5, FEET_Y - 2, 3, BONE);
      line(ctx, 50, 62, 54 - stride * 5, FEET_Y - 2, 3, BONE);
      for (let i = 0; i < 4; i++) line(ctx, 41, 44 + i * 5, 55, 44 + i * 5, 2.2, BONE);
      line(ctx, 48, 40, 48, 64, 3, BONE_DARK);
      circle(ctx, 48, 32, 8, BONE);
      ctx.fillStyle = INK;
      ctx.fillRect(48, 29, 3, 3);
      ctx.fillRect(53, 29, 2.5, 3);
      line(ctx, 54, 50, 72, 28, 3, '#8a7a5e');
      line(ctx, 50, 50, 56, 50, 2.5, BONE);
    } else {
      blob(ctx, () => {
        ctx.moveTo(30, 44);
        ctx.lineTo(42, 46);
        ctx.lineTo(40, 64);
        ctx.lineTo(32, 60);
        ctx.closePath();
      }, '#fff', 0);
    }
  },
  [Kind.BoneGolem]: (ctx, layer, stride) => {
    if (layer === 'body') {
      line(ctx, 38, 68, 36 + stride * 3, FEET_Y - 2, 10, BONE_DARK);
      line(ctx, 58, 68, 60 - stride * 3, FEET_Y - 2, 10, BONE_DARK);
      rrect(ctx, 22, 28, 52, 44, 14, '#cfc6a8');
      for (let i = 0; i < 5; i++) line(ctx, 28 + i * 10, 36, 32 + i * 9, 64, 3, BONE_DARK);
      circle(ctx, 52, 20, 11, BONE);
      ctx.fillStyle = '#ff5a3a';
      ctx.fillRect(52, 17, 4, 4);
      ctx.fillRect(58, 17, 3, 4);
      line(ctx, 20, 34, 12, 68, 9, BONE_DARK);
      line(ctx, 76, 34, 84, 66, 9, BONE_DARK);
    } else {
      rrect(ctx, 30, 44, 34, 6, 2, '#fff', 0);
      circle(ctx, 48, 58, 5, '#fff', 0);
    }
  },
  [Kind.Mercenary]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride);
      line(ctx, 36, 54, 22, 34, 3, '#d8dde2');
      line(ctx, 58, 54, 74, 36, 3, '#d8dde2');
      rrect(ctx, 39, 42, 18, 22, 5, '#5e4a5e');
      head(ctx, 48, 33, STEEL);
      line(ctx, 38, 52, 34, 56, 3, SKIN);
      line(ctx, 58, 52, 60, 56, 3, SKIN);
    } else {
      blob(ctx, () => {
        ctx.moveTo(44, 26);
        ctx.quadraticCurveTo(40, 8, 26, 16);
        ctx.quadraticCurveTo(36, 18, 40, 28);
        ctx.closePath();
      }, '#fff', 0);
      blob(ctx, () => {
        ctx.moveTo(40, 50);
        ctx.lineTo(56, 44);
        ctx.lineTo(56, 50);
        ctx.lineTo(40, 56);
        ctx.closePath();
      }, '#fff', 0);
    }
  },
  [Kind.Troll]: (ctx, layer, stride) => {
    if (layer === 'body') {
      line(ctx, 38, 66, 34 + stride * 3, FEET_Y - 2, 11, TROLL_DARK);
      line(ctx, 56, 66, 60 - stride * 3, FEET_Y - 2, 11, TROLL_DARK);
      blob(ctx, () => ctx.ellipse(46, 48, 24, 22, 0.2, 0, Math.PI * 2), TROLL);
      circle(ctx, 62, 30, 10, TROLL);
      blob(ctx, () => {
        ctx.moveTo(66, 34);
        ctx.lineTo(70, 28);
        ctx.lineTo(70, 36);
        ctx.closePath();
      }, BONE, 1.5);
      line(ctx, 66, 46, 84, 18, 9, '#6b4b2a');
      circle(ctx, 84, 16, 9, '#6b4b2a');
      line(ctx, 28, 44, 24, 68, 8, TROLL_DARK);
    } else {
      blob(ctx, () => {
        ctx.moveTo(26, 58);
        ctx.lineTo(64, 58);
        ctx.lineTo(60, 72);
        ctx.lineTo(48, 66);
        ctx.lineTo(34, 72);
        ctx.closePath();
      }, '#fff', 0);
    }
  },
  [Kind.Berserker]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride * 1.3, 62, '#5a3c2c');
      rrect(ctx, 39, 40, 18, 24, 6, SKIN);
      head(ctx, 48, 31, STEEL);
      blob(ctx, () => {
        ctx.moveTo(40, 28);
        ctx.quadraticCurveTo(30, 24, 32, 12);
        ctx.quadraticCurveTo(36, 22, 42, 24);
        ctx.closePath();
      }, BONE, 2);
      blob(ctx, () => {
        ctx.moveTo(56, 28);
        ctx.quadraticCurveTo(66, 24, 64, 12);
        ctx.quadraticCurveTo(60, 22, 54, 24);
        ctx.closePath();
      }, BONE, 2);
      line(ctx, 38, 50, 22, 26, 3, WOOD);
      blob(ctx, () => ctx.arc(22, 26, 9, Math.PI * 0.9, Math.PI * 1.9), STEEL, 2);
      line(ctx, 58, 50, 74, 26, 3, WOOD);
      blob(ctx, () => ctx.arc(74, 26, 9, Math.PI * 1.1, Math.PI * 2.1), STEEL, 2);
    } else {
      rrect(ctx, 40, 58, 16, 10, 2, '#fff', 0);
      line(ctx, 42, 44, 54, 52, 2.5, '#fff');
      line(ctx, 54, 44, 42, 52, 2.5, '#fff');
    }
  },
  [Kind.Cleric]: (ctx, layer, stride) => {
    if (layer === 'body') {
      blob(ctx, () => {
        ctx.moveTo(38, 40);
        ctx.lineTo(56, 40);
        ctx.lineTo(60 + stride, FEET_Y);
        ctx.lineTo(34 - stride, FEET_Y);
        ctx.closePath();
      }, ROBE);
      head(ctx, 47, 32, null);
      line(ctx, 54, 50, 66, 34, 3, WOOD);
      circle(ctx, 67, 31, 5, GOLD, 2);
      ctx.fillStyle = 'rgba(160,255,170,0.55)';
      ctx.beginPath();
      ctx.arc(67, 31, 9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      rrect(ctx, 44, 40, 7, 40, 2, '#fff', 0);
      blob(ctx, () => ctx.arc(47, 31, 9.5, Math.PI * 0.95, Math.PI * 2.05), '#fff', 0);
    }
  },
  [Kind.Champion]: (ctx, layer, stride) => {
    if (layer === 'body') {
      legs(ctx, stride, 62, STEEL_DARK);
      line(ctx, 58, 56, 80, 6, 5, '#e6ebf0');
      line(ctx, 54, 52, 64, 58, 3, GOLD);
      rrect(ctx, 37, 38, 22, 28, 6, STEEL);
      head(ctx, 48, 29, STEEL);
      blob(ctx, () => {
        ctx.moveTo(40, 21);
        ctx.lineTo(42, 13);
        ctx.lineTo(45, 18);
        ctx.lineTo(48, 11);
        ctx.lineTo(51, 18);
        ctx.lineTo(54, 13);
        ctx.lineTo(56, 21);
        ctx.closePath();
      }, GOLD, 2);
      line(ctx, 54, 48, 60, 56, 4, SKIN);
    } else {
      blob(ctx, () => {
        ctx.moveTo(40, 38);
        ctx.quadraticCurveTo(22, 56, 24, 80);
        ctx.lineTo(40, 78);
        ctx.lineTo(44, 40);
        ctx.closePath();
      }, '#fff', 0);
      rrect(ctx, 41, 44, 14, 16, 3, '#fff', 0);
    }
  },
  [Kind.Dragon]: (ctx, layer, stride) => {
    const flap = stride > 0 ? 1 : 0.5;
    if (layer === 'body') {
      blob(ctx, () => {
        ctx.moveTo(20, 56);
        ctx.quadraticCurveTo(4, 64, 2, 48);
        ctx.quadraticCurveTo(10, 58, 22, 50);
        ctx.closePath();
      }, '#5a3a3a');
      line(ctx, 40, 62, 38, 76, 6, '#4a2e2e');
      line(ctx, 58, 62, 60, 76, 6, '#4a2e2e');
      blob(ctx, () => ctx.ellipse(44, 54, 26, 13, -0.1, 0, Math.PI * 2), '#6a4040');
      blob(ctx, () => {
        ctx.moveTo(62, 48);
        ctx.quadraticCurveTo(74, 30, 80, 30);
        ctx.lineTo(94, 34);
        ctx.lineTo(84, 40);
        ctx.quadraticCurveTo(76, 44, 68, 58);
        ctx.closePath();
      }, '#6a4040');
      blob(ctx, () => {
        ctx.moveTo(80, 28);
        ctx.lineTo(74, 18);
        ctx.lineTo(84, 26);
        ctx.closePath();
      }, BONE, 1.5);
      circle(ctx, 84, 33, 1.8, FIRE, 0);
      for (let i = 0; i < 5; i++) blob(ctx, () => {
        ctx.moveTo(30 + i * 7, 42);
        ctx.lineTo(33 + i * 7, 36);
        ctx.lineTo(36 + i * 7, 42);
        ctx.closePath();
      }, BONE_DARK, 1.5);
    }
    wing(ctx, 50, 46, 48, 44 * flap, layer === 'body' ? '#6a4040' : 'rgba(0,0,0,0)');
    if (layer === 'mask') {
      blob(ctx, () => {
        ctx.moveTo(48, 44);
        ctx.quadraticCurveTo(26, 46 - 40 * flap, 6, 46 - 42 * flap);
        ctx.lineTo(16, 46 - 22 * flap);
        ctx.lineTo(10, 46 - 6 * flap);
        ctx.lineTo(26, 46 - 8 * flap);
        ctx.closePath();
      }, '#fff', 0);
      blob(ctx, () => ctx.ellipse(46, 60, 14, 4, -0.1, 0, Math.PI * 2), '#fff', 0);
    }
  },
};

function bow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, r, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = '#e8e2d0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + r * Math.cos(-1.15), y + r * Math.sin(-1.15));
  ctx.lineTo(x + r * Math.cos(1.15), y + r * Math.sin(1.15));
  ctx.stroke();
}

/** World height of each kind's sprite cell, grown from the simulation's render size. */
const UNIT_SCALE: number[] = STATS.map((s) => 31 * Math.pow(s.size / 6, 0.8) * (s.flying ? 1.15 : 1));

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

export function makeTextures(): Textures {
  const [atlas, actx] = canvas2d(CELL * FRAMES * LAYERS, CELL * KIND_COUNT);
  for (let k = 0; k < KIND_COUNT; k++) {
    for (let f = 0; f < FRAMES; f++) {
      const stride = f === 0 ? 1 : -1;
      for (const [li, layer] of (['body', 'mask'] as const).entries()) {
        actx.save();
        actx.translate((f * LAYERS + li) * CELL, k * CELL);
        actx.beginPath();
        actx.rect(0, 0, CELL, CELL);
        actx.clip();
        PAINTERS[k as Kind](actx, layer, stride);
        actx.restore();
      }
    }
    // Silhouette: body and mask of frame 0, filled white.
    const [sc, sctx] = canvas2d(CELL, CELL);
    PAINTERS[k as Kind](sctx, 'body', 1);
    PAINTERS[k as Kind](sctx, 'mask', 1);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, CELL, CELL);
    actx.drawImage(sc, 2 * CELL, k * CELL);
  }
  const unitSource = toTexture(atlas);
  const units: UnitFrames[] = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    units.push({
      body: [0, 1].map((f) => frame(unitSource, f * LAYERS * CELL, k * CELL, CELL, CELL)),
      mask: [0, 1].map((f) => frame(unitSource, (f * LAYERS + 1) * CELL, k * CELL, CELL, CELL)),
      sil: frame(unitSource, 2 * CELL, k * CELL, CELL, CELL),
    });
  }

  return {
    units,
    unitScale: UNIT_SCALE,
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
