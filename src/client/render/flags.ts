import { CanvasSource, Texture } from 'pixi.js';
import { armyColor, battalionFlag, type Emblem, type Flag, type Pattern } from '../../rules/heraldry.ts';
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
  ctx.fillStyle = '#f4ead0';
  ctx.strokeStyle = INK;
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
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const TITLE_FONT = '"IM Fell English SC", "IM Fell English", Georgia, serif';
const NUMBER_FONT = '"Alegreya SC", Alegreya, Georgia, serif';
const INK = 'rgba(34,24,15,0.92)';

function textOutlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill = '#f4ead0', font = TITLE_FONT): void {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Paints a battalion flag: field, pattern, hoist stripe in the language color, emblem, initials, ordinal. */
/**
 * How a platoon's flag shows its soldiers' quality: veterans fly gilded flags
 * with a star per rank, ragged armies fly torn and faded ones.
 */
export type FlagGrade = { rank: 0 | 1 | 2 | 3; ragged: boolean };

/** An army's grade: its veteran rank, and whether low-quality work has left it ragged. */
export function gradeOf(player: { quality?: number; veterancy?: number } | undefined): FlagGrade {
  const rank = Math.max(0, Math.min(3, Math.floor(player?.veterancy ?? 0))) as FlagGrade['rank'];
  return { rank, ragged: (player?.quality ?? 1) < RAGGED_BELOW };
}

/** Quality below which an army looks ragged. */
export const RAGGED_BELOW = 0.95;

const GOLD = '#e8c25a';

function paintGrade(ctx: CanvasRenderingContext2D, w: number, h: number, grade: FlagGrade): void {
  if (grade.ragged) {
    // Faded cloth with patches, and a frayed, notched free edge.
    ctx.fillStyle = 'rgba(120,112,100,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(60,48,36,0.55)';
    ctx.fillRect(w * 0.55, h * 0.58, 12, 10);
    ctx.fillRect(w * 0.3, h * 0.12, 9, 8);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const y = (i + 0.5) * (h / 6);
      const depth = 10 + ((i * 7) % 3) * 7;
      ctx.moveTo(w, y - h / 12);
      ctx.lineTo(w - depth, y);
      ctx.lineTo(w, y + h / 12);
    }
    ctx.moveTo(w * 0.62 + 4, h * 0.3);
    ctx.arc(w * 0.62, h * 0.3, 4, 0, Math.PI * 2);
    ctx.moveTo(w * 0.4 + 3, h * 0.78);
    ctx.arc(w * 0.4, h * 0.78, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (grade.rank === 0) return;
  // Gold leaf laid along the edges, uneven as if burnished by hand.
  const leaf = ctx.createLinearGradient(0, 0, w, h);
  leaf.addColorStop(0, '#f6dc8c');
  leaf.addColorStop(0.45, '#d4a93e');
  leaf.addColorStop(0.7, '#f6dc8c');
  leaf.addColorStop(1, '#8a6418');
  ctx.strokeStyle = leaf;
  ctx.lineWidth = 2.5 + grade.rank * 1.2;
  ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(5 + grade.rank * 0.8, 5 + grade.rank * 0.8, w - 10 - grade.rank * 1.6, h - 10 - grade.rank * 1.6);
  for (let i = 0; i < grade.rank; i++) star(ctx, w - 13 - i * 17, 13, 8);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export function paintFlag(flag: Flag, ordinal: number | null, grade: FlagGrade = { rank: 0, ragged: false }): HTMLCanvasElement {
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
  textOutlined(ctx, flag.initials, 58, ordinal === null ? 34 : 29, 28);
  if (ordinal !== null) textOutlined(ctx, roman(ordinal), 58, 52, 15, '#f6dc8c', NUMBER_FONT);
  cloth(ctx, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  paintGrade(ctx, w, h, grade);
  return c;
}

/** The army standard flown over a capital: the plain army hue with the player's initial. */
export function paintStandard(hue: number, login: string, arms?: { pattern: Pattern; emblem: Emblem }): HTMLCanvasElement {
  const [c, ctx] = canvas2d(FLAG_W, FLAG_H);
  ctx.fillStyle = armyColor(hue, 46);
  ctx.fillRect(0, 0, FLAG_W, FLAG_H);
  if (arms && arms.pattern !== 'plain') {
    // The player's chosen arms, charged in a darker shade of the army's pigment.
    paintPattern(ctx, { hue, field: armyColor(hue, 46), charge: armyColor(hue, 28), accent: '#000', pattern: arms.pattern, emblem: arms.emblem, initials: '' }, FLAG_W, FLAG_H);
  } else {
    ctx.fillStyle = armyColor(hue, 30);
    ctx.fillRect(0, FLAG_H * 0.72, FLAG_W, FLAG_H * 0.28);
    ctx.fillStyle = '#f4e6b8';
    ctx.fillRect(0, FLAG_H * 0.7, FLAG_W, 3);
  }
  if (arms) paintEmblem(ctx, arms.emblem, FLAG_W / 2, FLAG_H * 0.42, 17);
  else textOutlined(ctx, (login[0] ?? '?').toUpperCase(), FLAG_W / 2, FLAG_H * 0.38, 36);
  cloth(ctx, FLAG_W, FLAG_H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, FLAG_W - 3, FLAG_H - 3);
  return c;
}

/**
 * Turns flat colour into dyed cloth: the dye is muted toward earth, the weave
 * shows, and light falls from the upper left.
 */
function cloth(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(214,190,140,0.35)';
  ctx.fillRect(0, 0, w, h);
  const light = ctx.createLinearGradient(0, 0, w, h);
  light.addColorStop(0, 'rgba(255,250,235,1)');
  light.addColorStop(1, 'rgba(150,150,180,1)');
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(120,100,80,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 2; y < h; y += 3) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The far-zoom token: the battalion's arms on a heater shield, with a gold rim
 * for veterans and a notched edge for ragged armies.
 */
export const TOKEN_W = 64;
export const TOKEN_H = 74;

function paintToken(flag: Flag, grade: FlagGrade): HTMLCanvasElement {
  const res = 2;
  const [c, ctx] = canvas2d(TOKEN_W * res, TOKEN_H * res);
  ctx.scale(res, res);
  const w = TOKEN_W;
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(w - 6, 6);
    ctx.lineTo(w - 6, 36);
    ctx.quadraticCurveTo(w - 8, 58, w / 2, 70);
    ctx.quadraticCurveTo(8, 58, 6, 36);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(2.5, 3);
  shield();
  ctx.fillStyle = 'rgba(20,24,44,0.45)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  shield();
  ctx.clip();
  ctx.fillStyle = flag.field;
  ctx.fillRect(0, 0, w, TOKEN_H);
  paintPattern(ctx, flag, w, TOKEN_H);
  paintEmblem(ctx, flag.emblem, w / 2, 32, 15);
  cloth(ctx, w, TOKEN_H);
  ctx.restore();
  shield();
  if (grade.rank > 0) {
    const leaf = ctx.createLinearGradient(0, 0, w, TOKEN_H);
    leaf.addColorStop(0, '#f6dc8c');
    leaf.addColorStop(0.5, '#d4a93e');
    leaf.addColorStop(1, '#8a6418');
    ctx.strokeStyle = leaf;
    ctx.lineWidth = 3 + grade.rank * 1.4;
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  if (grade.ragged) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(w - 6, 14);
    ctx.lineTo(w - 16, 20);
    ctx.lineTo(w - 6, 26);
    ctx.moveTo(14, 54);
    ctx.lineTo(22, 50);
    ctx.lineTo(20, 60);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(120,112,100,0.35)';
    shield();
    ctx.fill();
  }
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

  battalion(hue: number, repo: string, language: string | null, ordinal: number | null, grade: FlagGrade = { rank: 0, ragged: false }): Texture {
    const key = `${hue}|${repo}|${language ?? ''}|${ordinal ?? ''}|${grade.rank}|${grade.ragged ? 1 : 0}`;
    let t = this.cache.get(key);
    if (!t) {
      t = new Texture({ source: new CanvasSource({ resource: paintFlag(battalionFlag(hue, repo, language), ordinal, grade), autoGenerateMipmaps: true }) });
      this.cache.set(key, t);
    }
    return t;
  }

  token(hue: number, repo: string, language: string | null, grade: FlagGrade): Texture {
    const key = `tok|${hue}|${repo}|${language ?? ''}|${grade.rank}|${grade.ragged ? 1 : 0}`;
    let t = this.cache.get(key);
    if (!t) {
      t = new Texture({ source: new CanvasSource({ resource: paintToken(battalionFlag(hue, repo, language), grade), resolution: 2, autoGenerateMipmaps: true }) });
      this.cache.set(key, t);
    }
    return t;
  }

  standard(hue: number, login: string, arms?: { pattern: Pattern; emblem: Emblem }): Texture {
    const key = `std|${hue}|${login}|${arms?.pattern ?? ''}|${arms?.emblem ?? ''}`;
    let t = this.cache.get(key);
    if (!t) {
      t = new Texture({ source: new CanvasSource({ resource: paintStandard(hue, login, arms), autoGenerateMipmaps: true }) });
      this.cache.set(key, t);
    }
    return t;
  }

  destroy(): void {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}
