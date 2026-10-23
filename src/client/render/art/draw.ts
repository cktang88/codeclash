// Drawing kit for unit art. Every painter runs twice: once for the body layer
// (neutral colors, ink outlines) and once for the mask layer (white where the
// army's color goes). Parts drawn in front of a team-colored part erase the mask
// under them, so tabards are hidden behind arms, shields and so on.

export const INK = '#15110d';
export const STEEL = '#b4bcc6';
export const STEEL_DARK = '#6b7581';
export const IRON = '#4b525b';
export const LEATHER = '#7a5a36';
export const LEATHER_DARK = '#4b3620';
export const CLOTH = '#cfc4ad';
export const SKIN = '#e0b88f';
export const WOOD = '#8b6a40';
export const WOOD_DARK = '#5a4126';
export const GOLD = '#ecc35a';
export const BONE = '#e6dcc3';
export const BONE_DARK = '#a99c7c';
export const TROLL = '#7f9479';
export const TROLL_DARK = '#4f6150';
export const HORSE = '#8a6646';
export const HORSE_DARK = '#5a3f2a';
export const FEATHER = '#d9cfb8';
export const SCALE = '#6e4f42';
export const SCALE_DARK = '#3f2c25';

export interface G {
  ctx: CanvasRenderingContext2D;
  mask: boolean;
}

function parseHex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lightens (k > 0) or darkens (k < 0) a #rrggbb color. */
export function tone(c: string, k: number): string {
  const [r, g, b] = parseHex(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Top-left light: a diagonal gradient over the part's bounding box. */
function lit(ctx: CanvasRenderingContext2D, color: string, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, tone(color, 0.28));
  g.addColorStop(0.55, color);
  g.addColorStop(1, tone(color, -0.32));
  return g;
}

export interface PartOptions {
  /** Ink outline width; 0 for none. */
  outline?: number;
  /** Paint this part with the army color. */
  team?: boolean;
  /** For team parts: how strongly the army color shows, 0..1. */
  strength?: number;
  /** Bounding box for the light gradient. */
  box?: [number, number, number, number];
}

/** Fills a closed path drawn by `path`. */
export function part(g: G, path: () => void, color: string, o: PartOptions = {}): void {
  const { ctx } = g;
  const outline = o.outline ?? 2.5;
  const box = o.box ?? [0, 0, 96, 96];
  ctx.beginPath();
  path();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!g.mask) {
    ctx.fillStyle = o.team ? lit(ctx, '#9a9a9a', ...box) : lit(ctx, color, ...box);
    ctx.fill();
    if (outline > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = outline;
      ctx.stroke();
    }
    return;
  }
  if (o.team) {
    const s = o.strength ?? 1;
    const grad = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
    grad.addColorStop(0, `rgba(255,255,255,${s})`);
    grad.addColorStop(1, `rgba(170,170,170,${s})`);
    ctx.fillStyle = grad;
    ctx.fill();
    if (outline > 0) erase(ctx, () => {
      ctx.lineWidth = outline;
      ctx.stroke();
    });
  } else {
    erase(ctx, () => {
      ctx.fill();
      if (outline > 0) {
        ctx.lineWidth = outline;
        ctx.stroke();
      }
    });
  }
}

function erase(ctx: CanvasRenderingContext2D, fn: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  fn();
  ctx.restore();
}

export function circle(g: G, x: number, y: number, r: number, color: string, o: PartOptions = {}): void {
  part(g, () => g.ctx.arc(x, y, r, 0, Math.PI * 2), color, { box: [x - r, y - r, x + r, y + r], ...o });
}

export function ellipse(g: G, x: number, y: number, rx: number, ry: number, rot: number, color: string, o: PartOptions = {}): void {
  part(g, () => g.ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), color, { box: [x - rx, y - ry, x + rx, y + ry], ...o });
}

export function rect(g: G, x: number, y: number, w: number, h: number, r: number, color: string, o: PartOptions = {}): void {
  part(g, () => g.ctx.roundRect(x, y, w, h, r), color, { box: [x, y, x + w, y + h], ...o });
}

export function poly(g: G, pts: readonly number[], color: string, o: PartOptions = {}): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]!);
    x1 = Math.max(x1, pts[i]!);
    y0 = Math.min(y0, pts[i + 1]!);
    y1 = Math.max(y1, pts[i + 1]!);
  }
  part(g, () => {
    g.ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.ctx.lineTo(pts[i]!, pts[i + 1]!);
    g.ctx.closePath();
  }, color, { box: [x0, y0, x1, y1], ...o });
}

/** A rod: spear shafts, limbs, bow strings. Ink-edged unless outline is 0. */
export function stick(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: string, outline = 2.5, team = false): void {
  const { ctx } = g;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  if (!g.mask) {
    if (outline > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = w + outline * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = team ? '#9a9a9a' : color;
    ctx.lineWidth = w;
    ctx.stroke();
    return;
  }
  if (team) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = w;
    ctx.stroke();
    return;
  }
  erase(ctx, () => {
    ctx.lineWidth = w + outline * 2;
    ctx.stroke();
  });
}

/** A curved rod through a control point. */
export function curve(g: G, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, color: string, outline = 2.5): void {
  const { ctx } = g;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  if (!g.mask) {
    if (outline > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = w + outline * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
    return;
  }
  erase(ctx, () => {
    ctx.lineWidth = w + outline * 2;
    ctx.stroke();
  });
}

/** Additive light: halos, embers, glowing eyes. Body layer only. */
export function glow(g: G, x: number, y: number, r: number, color: string, alpha = 0.9): void {
  if (g.mask) return;
  const { ctx } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  const [cr, cg, cb] = parseHex(color);
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
  grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${alpha * 0.45})`);
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Small detail strokes with no outline (rivets, straps, eyes). Erased from the mask. */
export function detail(g: G, fn: (ctx: CanvasRenderingContext2D) => void): void {
  if (!g.mask) {
    g.ctx.save();
    fn(g.ctx);
    g.ctx.restore();
    return;
  }
  erase(g.ctx, () => fn(g.ctx));
}

/** Runs `fn` rotated by `angle` around (x, y). */
export function pivot(g: G, x: number, y: number, angle: number, fn: () => void): void {
  g.ctx.save();
  g.ctx.translate(x, y);
  g.ctx.rotate(angle);
  g.ctx.translate(-x, -y);
  fn();
  g.ctx.restore();
}
