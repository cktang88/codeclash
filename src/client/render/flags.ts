import { CanvasSource, Texture } from 'pixi.js';
import { armyColor, battalionFlag, type Emblem, type Flag } from '../../rules/heraldry.ts';
import { roman } from '../../sim/chronicle.ts';
import { canvas2d } from './paint.ts';

export const FLAG_W = 96;
export const FLAG_H = 64;

function paintPattern(ctx: CanvasRenderingContext2D, flag: Flag, w: number, h: number): void {
  ctx.fillStyle = flag.charge;
  switch (flag.pattern) {
    case 'chevron':
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w / 2, h * 0.38);
      ctx.lineTo(w, h);
      ctx.lineTo(w, h * 0.78);
      ctx.lineTo(w / 2, h * 0.14);
      ctx.lineTo(0, h * 0.78);
      ctx.closePath();
      ctx.fill();
      break;
    case 'saltire':
      ctx.lineWidth = h * 0.18;
      ctx.strokeStyle = flag.charge;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();
      break;
    case 'pale':
      ctx.fillRect(w * 0.38, 0, w * 0.24, h);
      break;
    case 'fess':
      ctx.fillRect(0, h * 0.36, w, h * 0.28);
      break;
    case 'quarterly':
      ctx.fillRect(w / 2, 0, w / 2, h / 2);
      ctx.fillRect(0, h / 2, w / 2, h / 2);
      break;
    case 'bend':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w * 0.3, 0);
      ctx.lineTo(w, h * 0.7);
      ctx.lineTo(w, h);
      ctx.lineTo(w * 0.7, h);
      ctx.lineTo(0, h * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'chief':
      ctx.fillRect(0, 0, w, h * 0.3);
      break;
    case 'plain':
      break;
  }
}

function paintEmblem(ctx: CanvasRenderingContext2D, emblem: Emblem, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (emblem) {
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case 'tower':
      ctx.rect(-r * 0.6, -r * 0.5, r * 1.2, r * 1.4);
      ctx.rect(-r * 0.8, -r, r * 0.45, r * 0.6);
      ctx.rect(r * 0.35, -r, r * 0.45, r * 0.6);
      break;
    case 'key':
      ctx.arc(-r * 0.45, 0, r * 0.45, 0, Math.PI * 2);
      ctx.rect(-r * 0.1, -r * 0.15, r * 1.1, r * 0.3);
      ctx.rect(r * 0.6, 0, r * 0.2, r * 0.5);
      break;
    case 'crown':
      ctx.moveTo(-r, r * 0.6);
      ctx.lineTo(-r, -r * 0.4);
      ctx.lineTo(-r * 0.5, r * 0.1);
      ctx.lineTo(0, -r * 0.8);
      ctx.lineTo(r * 0.5, r * 0.1);
      ctx.lineTo(r, -r * 0.4);
      ctx.lineTo(r, r * 0.6);
      break;
    case 'bolt':
      ctx.moveTo(r * 0.2, -r);
      ctx.lineTo(-r * 0.6, r * 0.15);
      ctx.lineTo(0, r * 0.15);
      ctx.lineTo(-r * 0.2, r);
      ctx.lineTo(r * 0.6, -r * 0.15);
      ctx.lineTo(0, -r * 0.15);
      break;
    case 'leaf':
      ctx.ellipse(0, 0, r * 0.5, r, 0.6, 0, Math.PI * 2);
      break;
    case 'sun':
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65);
        ctx.lineTo(Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r);
        ctx.lineTo(Math.cos(a - 0.2) * r, Math.sin(a - 0.2) * r);
      }
      break;
    case 'moon':
      ctx.arc(0, 0, r * 0.85, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(r * 0.35, 0, r * 0.65, Math.PI * 1.6, Math.PI * 0.4, true);
      break;
    case 'anchor':
      ctx.rect(-r * 0.1, -r * 0.8, r * 0.2, r * 1.5);
      ctx.rect(-r * 0.5, -r * 0.5, r, r * 0.18);
      ctx.moveTo(-r * 0.8, r * 0.2);
      ctx.quadraticCurveTo(0, r * 1.2, r * 0.8, r * 0.2);
      ctx.lineTo(r * 0.6, r * 0.5);
      ctx.quadraticCurveTo(0, r * 0.9, -r * 0.6, r * 0.5);
      break;
    case 'eye':
      ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
      break;
    case 'wing':
      ctx.moveTo(-r, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.6, -r, r, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.2, r * 0.6, 0);
      ctx.quadraticCurveTo(0, r * 0.2, r * 0.3, r * 0.5);
      break;
    case 'flame':
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, 0, r * 0.4, r);
      ctx.lineTo(-r * 0.4, r);
      ctx.quadraticCurveTo(-r, 0, 0, -r);
      break;
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  if (emblem === 'eye') {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function textOutlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = '#fff'): void {
  ctx.font = `800 ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeStyle = 'rgba(8,8,10,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Paints a battalion flag: field, pattern, hoist stripe in the language color, emblem, initials, ordinal. */
export function paintFlag(flag: Flag, ordinal: number | null): HTMLCanvasElement {
  const [c, ctx] = canvas2d(FLAG_W, FLAG_H);
  const w = FLAG_W;
  const h = FLAG_H;
  ctx.fillStyle = flag.field;
  ctx.fillRect(0, 0, w, h);
  paintPattern(ctx, flag, w, h);
  ctx.fillStyle = flag.accent;
  ctx.fillRect(0, 0, 10, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(10, 0, 2, h);
  paintEmblem(ctx, flag.emblem, 28, 18, 10);
  textOutlined(ctx, flag.initials, 58, ordinal === null ? 34 : 28, 26);
  if (ordinal !== null) textOutlined(ctx, roman(ordinal), 58, 52, 15, '#f4e6b8');
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  return c;
}

/** The army standard flown over a capital: the plain army hue with the player's initial. */
export function paintStandard(hue: number, login: string): HTMLCanvasElement {
  const [c, ctx] = canvas2d(FLAG_W, FLAG_H);
  ctx.fillStyle = armyColor(hue, 46);
  ctx.fillRect(0, 0, FLAG_W, FLAG_H);
  ctx.fillStyle = armyColor(hue, 30);
  ctx.fillRect(0, FLAG_H * 0.72, FLAG_W, FLAG_H * 0.28);
  ctx.fillStyle = '#f4e6b8';
  ctx.fillRect(0, FLAG_H * 0.7, FLAG_W, 3);
  textOutlined(ctx, (login[0] ?? '?').toUpperCase(), FLAG_W / 2, FLAG_H * 0.38, 34, '#fff');
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, FLAG_W - 3, FLAG_H - 3);
  return c;
}

/** Caches flag textures by battalion and ordinal. */
export class FlagCache {
  private cache = new Map<string, Texture>();
  private blankFlag: Texture | null = null;

  /** A transparent flag-sized texture, so meshes get flag-sized geometry before their flag is known. */
  blank(): Texture {
    if (!this.blankFlag) {
      const [c] = canvas2d(FLAG_W, FLAG_H);
      this.blankFlag = new Texture({ source: new CanvasSource({ resource: c }) });
    }
    return this.blankFlag;
  }

  battalion(hue: number, repo: string, language: string | null, ordinal: number | null): Texture {
    const key = `${hue}|${repo}|${language ?? ''}|${ordinal ?? ''}`;
    let t = this.cache.get(key);
    if (!t) {
      t = new Texture({ source: new CanvasSource({ resource: paintFlag(battalionFlag(hue, repo, language), ordinal), autoGenerateMipmaps: true }) });
      this.cache.set(key, t);
    }
    return t;
  }

  standard(hue: number, login: string): Texture {
    const key = `std|${hue}|${login}`;
    let t = this.cache.get(key);
    if (!t) {
      t = new Texture({ source: new CanvasSource({ resource: paintStandard(hue, login), autoGenerateMipmaps: true }) });
      this.cache.set(key, t);
    }
    return t;
  }

  destroy(): void {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}
