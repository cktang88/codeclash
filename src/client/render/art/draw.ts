// Drawing kit for unit art, after docs/art-direction.md: warm hand-inked outlines,
// flat pigment in three painted tones (a warm rim of light on the upper left,
// the base, and a cool ink-blue shadow hatched on the lower right).
//
// Every painter runs twice: once for the body layer (neutral pigments, ink) and
// once for the mask layer (white where the army's pigment goes, in three greys so
// the tint keeps its shading). Parts drawn in front of a team-colored part erase
// the mask under them, so tabards hide behind arms, shields and so on.

export const INK = '#22180f';
/** Cool ink-blue that every shadow leans toward. */
export const SHADOW = '#2b3a5c';
/** Warm candle light that every highlight leans toward. */
export const LIGHT = '#fff1cf';

export const STEEL = '#b3b8bd';
export const STEEL_DARK = '#737b86';
export const IRON = '#4d4f57';
export const LEATHER = '#8e6239';
export const LEATHER_DARK = '#583b22';
export const CLOTH = '#d9cba8';
export const SKIN = '#e2b089';
export const WOOD = '#9b6d3d';
export const WOOD_DARK = '#5f4126';
export const GOLD = '#d4a93e';
export const GOLD_HI = '#f6dc8c';
export const BONE = '#e9dec2';
export const BONE_DARK = '#b5a37d';
export const TROLL = '#7c9372';
export const TROLL_DARK = '#4f6248';
export const HORSE = '#8f6745';
export const HORSE_DARK = '#5c3f29';
export const FEATHER = '#e3d6b8';
export const SCALE = '#7d4b38';
export const SCALE_DARK = '#4a2b22';
/** The team placeholder: body-layer grey under the tinted mask. */
export const TEAM = '#9a9a9a';

export interface G {
  ctx: CanvasRenderingContext2D;
  /** True for every layer but the body: parts erase what they cover. */
  mask: boolean;
  /** Veterancy overlays: gold trim for a rank, or the ragged army's wear. */
  over?: 'gild' | 'torn';
  /** For `over: 'gild'`, the rank 1..3. */
  rank?: number;
}

function parseHex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0')}`;
}

/** Mixes `a` toward `b` by t. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Lightens (k > 0) toward warm light or darkens (k < 0) toward cool shadow. */
export function tone(c: string, k: number): string {
  return k >= 0 ? mix(c, LIGHT, k) : mix(mix(c, SHADOW, -k * 0.75), '#000000', -k * 0.35);
}

export function shadeOf(c: string): string {
  return tone(c, -0.42);
}

export function lightOf(c: string): string {
  return tone(c, 0.38);
}

export interface PartOptions {
  /** Ink outline width; 0 for none. */
  outline?: number;
  /** Paint this part with the army's pigment. */
  team?: boolean;
  /** For team parts: how strongly the army pigment shows, 0..1. */
  strength?: number;
  /** Bounding box, for sizing the light and shadow bands. */
  box?: [number, number, number, number];
  /** Skip the painted shading (tiny parts read better flat). */
  flat?: boolean;
  /** For team parts: false keeps rank trim and wear off this part; 'edge' gilds only its hem. */
  trim?: boolean | 'edge';
}

const TEAM_TONES = { hi: '#ffffff', base: '#e2e2e2', shadow: '#9b9b9b', hatch: '#7a7a7a' };

/**
 * Paints a closed path in three tones. The shape is filled with light, then its
 * copy nudged down-right with shadow, then its copy nudged up-left with base, all
 * clipped to the shape: a thin warm rim top-left, a cool hatched band bottom-right.
 */
function shaded(ctx: CanvasRenderingContext2D, path: () => void, box: [number, number, number, number], hi: string, base: string, shadow: string, hatchColor: string, alpha = 1): void {
  const w = Math.max(1, box[2] - box[0]);
  const h = Math.max(1, box[3] - box[1]);
  const m = Math.min(w, h);
  const rim = Math.max(0.6, Math.min(1.8, m * 0.09));
  const dark = Math.max(1.2, Math.min(5, m * 0.2));
  const pad = 8;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  path();
  ctx.clip();
  ctx.fillStyle = hi;
  ctx.fillRect(box[0] - pad, box[1] - pad, w + pad * 2, h + pad * 2);
  ctx.save();
  ctx.translate(rim, rim);
  ctx.beginPath();
  path();
  ctx.restore();
  ctx.clip();
  ctx.fillStyle = shadow;
  ctx.fillRect(box[0] - pad, box[1] - pad, w + pad * 2, h + pad * 2);
  // Engraver's hatching in the shadow band.
  ctx.strokeStyle = hatchColor;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  for (let d = -h - pad; d < w + h + pad; d += 2.4) {
    ctx.moveTo(box[0] + d, box[3] + pad);
    ctx.lineTo(box[0] + d + h + pad * 2, box[1] - pad);
  }
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(rim - dark, rim - dark);
  ctx.beginPath();
  path();
  ctx.restore();
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
}

/** Ink line with a hand-drawn wobble: a full stroke and a thinner, offset echo. */
function ink(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.save();
  ctx.translate(0.35, -0.3);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = width * 0.55;
  ctx.stroke();
  ctx.restore();
}

/** Fills a closed path drawn by `path`. */
export function part(g: G, path: () => void, color: string, o: PartOptions = {}): void {
  const { ctx } = g;
  const outline = o.outline ?? 2.4;
  const box = o.box ?? [0, 0, 96, 96];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!g.mask) {
    const base = o.team ? TEAM : color;
    if (o.flat) {
      ctx.beginPath();
      path();
      ctx.fillStyle = base;
      ctx.fill();
    } else {
      shaded(ctx, path, box, lightOf(base), base, shadeOf(base), tone(base, -0.7));
    }
    if (outline > 0) {
      ctx.beginPath();
      path();
      ink(ctx, outline);
    }
    return;
  }
  if (g.over) {
    ctx.beginPath();
    path();
    erase(ctx, () => {
      ctx.fill();
      if (outline > 0) {
        ctx.lineWidth = outline;
        ctx.stroke();
      }
    });
    if (o.team && o.trim !== false) adorn(g, path, box, outline, o.trim === 'edge');
    else if (g.over === 'torn' && (color === STEEL || color === STEEL_DARK) && Math.min(box[2] - box[0], box[3] - box[1]) >= 9) dent(g, path, box);
    return;
  }
  if (o.team) {
    const s = o.strength ?? 1;
    if (o.flat) {
      ctx.beginPath();
      path();
      ctx.fillStyle = `rgba(226,226,226,${s})`;
      ctx.fill();
    } else {
      shaded(ctx, path, box, TEAM_TONES.hi, TEAM_TONES.base, TEAM_TONES.shadow, TEAM_TONES.hatch, s);
    }
    if (outline > 0) {
      ctx.beginPath();
      path();
      erase(ctx, () => {
        ctx.lineWidth = outline;
        ctx.stroke();
      });
    }
  } else {
    ctx.beginPath();
    path();
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
  const r = Math.max(rx, ry);
  part(g, () => g.ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), color, { box: [x - r, y - Math.min(r, ry * 1.4), x + r, y + Math.min(r, ry * 1.4)], ...o });
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

/** Strokes a rod: ink edge, pigment, a warm highlight on its upper-left side and a cool shade below. */
function rod(g: G, path: () => void, w: number, color: string, outline: number, team: boolean, dx: number, dy: number): void {
  const { ctx } = g;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path();
  if (!g.mask) {
    const base = team ? TEAM : color;
    if (outline > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = w + outline * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = shadeOf(base);
    ctx.lineWidth = w;
    ctx.stroke();
    if (w >= 2) {
      // Base pigment nudged up-left over the shade, then a thin warm rim.
      const off = w * 0.22;
      ctx.save();
      ctx.translate(dx * off, dy * off);
      ctx.beginPath();
      path();
      ctx.strokeStyle = base;
      ctx.lineWidth = w * 0.72;
      ctx.stroke();
      ctx.translate(dx * off, dy * off);
      ctx.beginPath();
      path();
      ctx.strokeStyle = lightOf(base);
      ctx.lineWidth = Math.max(0.6, w * 0.22);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  if (team && !g.over) {
    ctx.strokeStyle = TEAM_TONES.base;
    ctx.lineWidth = w;
    ctx.stroke();
    return;
  }
  erase(ctx, () => {
    ctx.lineWidth = w + outline * 2;
    ctx.stroke();
  });
}

/** Direction (unit vector) toward the light for a segment: perpendicular, pointing up-left. */
function lightSide(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const m = Math.sqrt(dx * dx + dy * dy) || 1;
  let nx = -dy / m;
  let ny = dx / m;
  if (nx + ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** A rod: spear shafts, limbs, bow strings. Ink-edged unless outline is 0. */
export function stick(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: string, outline = 2.2, team = false): void {
  const [nx, ny] = lightSide(x0, y0, x1, y1);
  rod(g, () => {
    g.ctx.moveTo(x0, y0);
    g.ctx.lineTo(x1, y1);
  }, w, color, outline, team, nx, ny);
}

/** A curved rod through a control point. */
export function curve(g: G, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, color: string, outline = 2.2, team = false): void {
  const [nx, ny] = lightSide(x0, y0, x1, y1);
  rod(g, () => {
    g.ctx.moveTo(x0, y0);
    g.ctx.quadraticCurveTo(cx, cy, x1, y1);
  }, w, color, outline, team, nx, ny);
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

/** Detail drawn into the mask too (cloth folds, stitching on team cloth): darker grey there. */
export function teamDetail(g: G, fn: (ctx: CanvasRenderingContext2D, color: string) => void, bodyColor: string): void {
  if (g.over) return;
  g.ctx.save();
  fn(g.ctx, g.mask ? '#8a8a8a' : bodyColor);
  g.ctx.restore();
}

/** Ink rivets along a line. */
export function rivets(g: G, pts: readonly number[], r = 0.9): void {
  detail(g, (ctx) => {
    for (let i = 0; i < pts.length; i += 2) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(pts[i]!, pts[i + 1]!, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LIGHT;
      ctx.beginPath();
      ctx.arc(pts[i]! - r * 0.35, pts[i + 1]! - r * 0.35, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** A glint: a short warm stroke where light catches steel. */
export function glint(g: G, x0: number, y0: number, x1: number, y1: number, w = 1.1): void {
  detail(g, (ctx) => {
    ctx.strokeStyle = LIGHT;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  });
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

/** Body-layer only painting, for strokes that sit on top and need no masking (smears, smoke). */
export function paint(g: G, fn: (ctx: CanvasRenderingContext2D) => void): void {
  if (g.mask) return;
  g.ctx.save();
  fn(g.ctx);
  g.ctx.restore();
}

/** A motion smear: a pale crescent swept behind a striking weapon. */
export function smear(g: G, cx: number, cy: number, r: number, a0: number, a1: number, w: number): void {
  paint(g, (ctx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, a1 < a0);
    ctx.arc(cx, cy, r - w, a1, a0, a1 >= a0);
    ctx.closePath();
    const grad = ctx.createLinearGradient(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    grad.addColorStop(0, 'rgba(255,241,207,0)');
    grad.addColorStop(1, 'rgba(255,241,207,0.85)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0 + (a1 - a0) * 0.35, a1, a1 < a0);
    ctx.strokeStyle = 'rgba(34,24,15,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

/** A deterministic 0..1 hash of a box, so wear lands in the same place every frame. */
function seed(box: readonly number[], i: number): number {
  let h = 2166136261 ^ i;
  for (const v of box) h = Math.imul(h ^ Math.round(v * 4), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

function goldStroke(ctx: CanvasRenderingContext2D, w: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 1.4;
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.save();
  ctx.translate(-w * 0.18, -w * 0.22);
  ctx.strokeStyle = GOLD_HI;
  ctx.lineWidth = Math.max(0.5, w * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** Rank trim or ragged wear on a team cloth, clipped to its shape. */
function adorn(g: G, path: () => void, box: [number, number, number, number], outline: number, edgeOnly: boolean): void {
  const { ctx } = g;
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const big = w >= 8 && h >= 9 && !edgeOnly;
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  if (g.over === 'gild') {
    const rank = g.rank ?? 1;
    if (rank >= 2 || (!big && !edgeOnly) || (edgeOnly && rank >= 1 && w >= 8)) {
      // Gilded hem just inside the ink line.
      ctx.beginPath();
      path();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = outline + (big ? 2.6 : 2);
      ctx.stroke();
      ctx.beginPath();
      path();
      ctx.strokeStyle = GOLD_HI;
      ctx.lineWidth = outline + 0.6;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (big) {
      const cx = (box[0] + box[2]) / 2;
      const cw = Math.min(w * 0.36, 7);
      const ch = cw * 0.62;
      const th = Math.max(1.5, Math.min(2.4, w * 0.12));
      const top = box[1] + h * 0.3;
      for (let i = 0; i < rank; i++) {
        const y = top + i * (th + 1.8);
        ctx.beginPath();
        ctx.moveTo(cx - cw, y + ch);
        ctx.lineTo(cx, y);
        ctx.lineTo(cx + cw, y + ch);
        goldStroke(ctx, th);
      }
      if (rank >= 3) {
        // Filigree: a gold boss and curls under the chevrons.
        const y = top + rank * (th + 1.8) + ch + 2;
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.9, y + 1.5);
        ctx.quadraticCurveTo(cx - cw * 0.45, y - 2, cx, y + 1);
        ctx.quadraticCurveTo(cx + cw * 0.45, y - 2, cx + cw * 0.9, y + 1.5);
        goldStroke(ctx, 0.9);
        ctx.fillStyle = GOLD_HI;
        ctx.beginPath();
        ctx.arc(cx, y + 2.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Faded pigment: a dull vellum wash.
    ctx.fillStyle = 'rgba(176,160,128,0.42)';
    ctx.fillRect(box[0] - 4, box[1] - 4, w + 8, h + 8);
    if (w >= 8 && h >= 9) {
      // A patch of undyed cloth, crookedly stitched.
      const px = box[0] + w * (0.15 + seed(box, 1) * 0.4);
      const py = box[1] + h * (0.2 + seed(box, 2) * 0.35);
      const pw = Math.max(4, w * 0.36);
      const ph = Math.max(4, h * 0.26);
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate((seed(box, 3) - 0.5) * 0.5);
      ctx.fillStyle = '#8f7d5b';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = 'rgba(255,241,207,0.35)';
      ctx.fillRect(-pw / 2, -ph / 2, pw, 1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([1.4, 1.2]);
      ctx.strokeRect(-pw / 2 + 0.8, -ph / 2 + 0.8, pw - 1.6, ph - 1.6);
      ctx.restore();
      // A ragged tear up from the hem, dark inside.
      const tx = box[0] + w * (0.55 + seed(box, 4) * 0.3);
      const ty = box[3] + 1;
      const th = h * 0.4;
      ctx.beginPath();
      ctx.moveTo(tx - 2.6, ty);
      ctx.lineTo(tx - 1, ty - th * 0.45);
      ctx.lineTo(tx - 1.8, ty - th * 0.7);
      ctx.lineTo(tx + 0.4, ty - th);
      ctx.lineTo(tx + 0.9, ty - th * 0.6);
      ctx.lineTo(tx + 2.4, ty - th * 0.35);
      ctx.lineTo(tx + 3, ty);
      ctx.closePath();
      ctx.fillStyle = '#2a2219';
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,228,200,0.5)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A dent and a scratch on battered steel. */
function dent(g: G, path: () => void, box: [number, number, number, number]): void {
  const { ctx } = g;
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  const x = box[0] + w * (0.3 + seed(box, 5) * 0.4);
  const y = box[1] + h * (0.3 + seed(box, 6) * 0.4);
  const r = Math.min(w, h) * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.9, Math.PI * 1.9);
  ctx.strokeStyle = 'rgba(34,24,15,0.85)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 0.6, y + 0.6, r, Math.PI * 0.05, Math.PI * 0.8);
  ctx.strokeStyle = 'rgba(255,241,207,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box[0] + w * 0.2, box[1] + h * (0.6 + seed(box, 7) * 0.2));
  ctx.lineTo(box[0] + w * 0.55, box[1] + h * (0.75 + seed(box, 8) * 0.15));
  ctx.strokeStyle = 'rgba(34,24,15,0.6)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

/** Gilds a helm: a gold crest band and finial, drawn only on the rank-3 gild layer. */
export function gilded(g: G, minRank: number, fn: (ctx: CanvasRenderingContext2D) => void): void {
  if (g.over !== 'gild' || (g.rank ?? 0) < minRank) return;
  g.ctx.save();
  fn(g.ctx);
  g.ctx.restore();
}

/** Gold-leaf stroke of whatever path `fn` builds (for gilded helms and trims). */
export function goldLine(ctx: CanvasRenderingContext2D, w: number, fn: () => void): void {
  ctx.beginPath();
  fn();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  goldStroke(ctx, w);
}
