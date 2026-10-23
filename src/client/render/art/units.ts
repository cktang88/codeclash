import { Kind } from '../../../sim/api.ts';
import {
  BONE, BONE_DARK, CLOTH, FEATHER, GOLD, GOLD_HI, HORSE, HORSE_DARK, INK, IRON, LEATHER, LEATHER_DARK, LIGHT, SCALE, SCALE_DARK, SKIN, STEEL,
  STEEL_DARK, TROLL, TROLL_DARK, WOOD, WOOD_DARK,
  circle, curve, detail, ellipse, gilded, glint, glow, goldLine, paint, part, pivot, poly, rect, rivets, smear, stick, teamDetail, tone,
  type G, type PartOptions,
} from './draw.ts';

export type PoseName = 'idle' | 'walk' | 'attack' | 'die';

/** Animation parameters a painter reads. */
export interface Pose {
  pose: PoseName;
  /** Leg swing, -1..1. */
  stride: number;
  /** Upper-body lift in px. */
  bob: number;
  /** Weapon arc: negative winds up, positive strikes. */
  swing: number;
  /** Wing beat phase, 0..1. */
  flap: number;
  /** Jaw open, 0..1 (dragon breath). */
  jaw: number;
  /** Where this frame sits in its loop, 0..1: drives gaits and idle personality. */
  t: number;
}

export interface CellSpec {
  /** Logical cell size (square). */
  size: number;
  /** Logical y of the feet (or of the flyer's center of mass). */
  feetY: number;
}

export const CELLS: Record<number, CellSpec> = {};
const STD: CellSpec = { size: 96, feetY: 84 };
const BIG: CellSpec = { size: 128, feetY: 114 };
const HUGE: CellSpec = { size: 192, feetY: 168 };
for (let k = 0; k < 20; k++) CELLS[k] = STD;
for (const k of [Kind.Knight, Kind.Trebuchet, Kind.GriffinRider, Kind.BoneGolem, Kind.Troll, Kind.Outrider]) CELLS[k] = BIG;
CELLS[Kind.Dragon] = HUGE;

type Painter = (g: G, p: Pose) => void;

const TAU = Math.PI * 2;
const BOOT = '#3d2c1c';
const GAMBESON = '#cdb98f';
const MAIL = '#8d949c';
const ROBE_BLUE = '#3f4566';
const GREEN = '#4f6340';
const GREEN_DARK = '#34432c';
const HAIR = '#5a3a20';
const BRASS = '#b58a4c';
const RED_GEM = '#b8321f';
const SPIRIT = '#8fe8c8';
const EMBER = '#ff9a3c';

/** A sine of the frame's loop phase. */
function wave(p: Pose, k = 1, ph = 0): number {
  return Math.sin((p.t * k + ph) * TAU);
}

function isAttack(p: Pose): boolean {
  return p.pose === 'attack';
}

/** Body lean in px: rocks back on the wind-up, lunges into the strike. */
function lean(p: Pose): number {
  if (p.pose === 'attack') return p.swing < 0 ? p.swing * 2.2 : p.swing * 3.4;
  if (p.pose === 'idle') return wave(p) * 0.45;
  return 0;
}

/** Smooth closed outline through points (a hand-cut shape with no hard corners). */
function smooth(g: G, pts: readonly number[], color: string, o: PartOptions = {}): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]!);
    x1 = Math.max(x1, pts[i]!);
    y0 = Math.min(y0, pts[i + 1]!);
    y1 = Math.max(y1, pts[i + 1]!);
  }
  const n = pts.length / 2;
  part(g, () => {
    const c = g.ctx;
    const px = (i: number) => pts[((i + n) % n) * 2]!;
    const py = (i: number) => pts[((i + n) % n) * 2 + 1]!;
    c.moveTo((px(-1) + px(0)) / 2, (py(-1) + py(0)) / 2);
    for (let i = 0; i < n; i++) c.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
    c.closePath();
  }, color, { box: [x0, y0, x1, y1], ...o });
}

/** Ink linework (folds, seams, stitching) drawn on the body and erased from the mask. */
function lines(g: G, w: number, color: string, fn: (ctx: CanvasRenderingContext2D) => void): void {
  detail(g, (ctx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    fn(ctx);
    ctx.stroke();
  });
}

/** Folds in a team cloth: shade lines kept in the mask too, so the pigment folds. */
function folds(g: G, fn: (ctx: CanvasRenderingContext2D) => void): void {
  teamDetail(g, (ctx, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    fn(ctx);
    ctx.stroke();
  }, 'rgba(34,24,15,0.4)');
}

// ------------------------------------------------------------- people

interface LegOptions {
  hx?: number;
  hy?: number;
  fy?: number;
  color?: string;
  boot?: string;
  armor?: boolean;
  spread?: number;
  w?: number;
}

/** Two jointed legs: a stepping gait, a braced lunge on the strike, a slight weight shift at rest. */
function legs(g: G, p: Pose, o: LegOptions = {}): void {
  const hx = o.hx ?? 48;
  const hy = o.hy ?? 62;
  const fy = o.fy ?? 84;
  const color = o.color ?? LEATHER_DARK;
  const boot = o.boot ?? BOOT;
  const spread = o.spread ?? 1;
  const w = o.w ?? 5.6;
  let fd = 3, bd = -3, fl = 0, bl = 0;
  if (p.pose === 'walk') {
    const a = p.t * TAU;
    fd = Math.sin(a) * 7.5 * spread;
    bd = -fd;
    fl = Math.max(0, Math.cos(a)) * 3.6;
    bl = Math.max(0, -Math.cos(a)) * 3.6;
  } else if (p.pose === 'attack') {
    fd = 3 + (p.swing > 0 ? p.swing * 5 : p.swing * 1.5);
    bd = -3 - (p.swing > 0 ? p.swing * 3 : 0);
  } else if (p.pose === 'die') {
    fd = 6;
    bd = -2;
  } else {
    fd = 3 + wave(p) * 0.4;
    bd = -3 + wave(p) * 0.4;
  }
  const leg = (dx: number, lift: number, front: boolean) => {
    const sx = hx + (front ? 2 : -2);
    const fx = hx + dx;
    const ffy = fy - lift;
    const kx = (sx + fx) / 2 + 1.6 + lift * 0.7;
    const ky = (hy + ffy) / 2 - lift * 0.2;
    const c = front ? color : tone(color, -0.18);
    stick(g, sx, hy, kx, ky, w + 0.6, c, 2);
    stick(g, kx, ky, fx, ffy - 3, w, c, 2);
    if (o.armor) {
      circle(g, kx + 0.5, ky, 2.6, STEEL, { outline: 1.4 });
      glint(g, kx - 0.6, ky - 1.2, kx + 0.6, ky - 1.6, 0.7);
    }
    const b = front ? boot : tone(boot, -0.2);
    smooth(g, [fx - 4, ffy - 6, fx + 1.5, ffy - 6.5, fx + 3.5, ffy - 3, fx + 7, ffy - 1.6, fx + 7, ffy + 0.6, fx - 4.5, ffy + 0.6], b, { outline: 1.8 });
  };
  leg(bd, bl, false);
  leg(fd, fl, true);
}

/** Upper body: carried by the gait's bob and the attack's lean. */
function upper(g: G, p: Pose, fn: () => void, k = 1): void {
  g.ctx.save();
  g.ctx.translate(lean(p) * k, -p.bob * k);
  fn();
  g.ctx.restore();
}

/** A jointed arm from shoulder to hand; the elbow drops below the line. */
function arm(g: G, sx: number, sy: number, hx: number, hy: number, color = SKIN, hand = SKIN, bend = 1): void {
  const mx = (sx + hx) / 2;
  const my = (sy + hy) / 2;
  const dx = hx - sx;
  const dy = hy - sy;
  const m = Math.sqrt(dx * dx + dy * dy) || 1;
  let nx = -dy / m;
  let ny = dx / m;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ex = mx + nx * 2.6 * bend;
  const ey = my + ny * 2.6 * bend;
  stick(g, sx, sy, ex, ey, 5, color, 1.9);
  stick(g, ex, ey, hx, hy, 4.4, color, 1.9);
  circle(g, hx, hy, 2.5, hand, { outline: 1.6, flat: true });
}

function face(g: G, x: number, y: number, skin = SKIN, beard: string | null = null): void {
  circle(g, x, y, 7.6, skin);
  poly(g, [x + 6.4, y - 2.4, x + 9.4, y + 1.6, x + 6.4, y + 2.4], skin, { outline: 1.3, flat: true });
  if (beard) smooth(g, [x - 1, y + 2, x + 6, y + 2.5, x + 6.5, y + 6.5, x + 2, y + 10, x - 2, y + 7], beard, { outline: 1.6 });
  lines(g, 1, INK, (ctx) => {
    ctx.moveTo(x + 1.8, y - 3.4);
    ctx.lineTo(x + 5.4, y - 3);
  });
  detail(g, (ctx) => {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 3.8, y - 1, 1.15, 0, TAU);
    ctx.fill();
    // Cool shade on the cheek, warm blush.
    ctx.fillStyle = 'rgba(184,50,31,0.18)';
    ctx.beginPath();
    ctx.arc(x + 3.6, y + 2.6, 1.8, 0, TAU);
    ctx.fill();
  });
}

type Helm = 'none' | 'kettle' | 'great' | 'sallet' | 'hood' | 'crown' | 'wizard' | 'skull' | 'cowl' | 'horned' | 'beret' | 'coif';

function helmCrest(g: G, x: number, y: number, w: number): void {
  gilded(g, 3, (ctx) => {
    goldLine(ctx, 1.6, () => {
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x, y - 2.5, x + w, y);
    });
    goldLine(ctx, 1.4, () => {
      ctx.moveTo(x, y - 1.5);
      ctx.lineTo(x, y - 6);
    });
    ctx.fillStyle = GOLD_HI;
    ctx.beginPath();
    ctx.arc(x, y - 6.5, 1.4, 0, TAU);
    ctx.fill();
  });
}

function head(g: G, x: number, y: number, helm: Helm, p: Pose | null = null): void {
  const c = g.ctx;
  switch (helm) {
    case 'skull': {
      const jaw = p ? (p.pose === 'idle' ? Math.max(0, wave(p, 2)) * 0.5 : isAttack(p) ? 0.8 : 0.2) : 0.2;
      smooth(g, [x - 7, y - 3, x - 4, y - 8.5, x + 3, y - 9, x + 8, y - 4, x + 8, y + 1, x + 4, y + 3, x - 5, y + 3], BONE);
      poly(g, [x - 1, y + 2.5 + jaw, x + 8, y + 2 + jaw * 1.5, x + 7, y + 6.5 + jaw * 2, x, y + 6 + jaw], BONE_DARK, { outline: 1.6 });
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(x + 3.6, y - 2, 2.4, 2.2, 0, 0, TAU);
        ctx.ellipse(x - 2, y - 2, 1.8, 2.2, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 6.6, y + 0.5);
        ctx.lineTo(x + 7.6, y - 0.6);
        ctx.lineTo(x + 7.8, y + 1.4);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + 1.5 + i * 2, y + 2.6 + jaw);
          ctx.lineTo(x + 1.5 + i * 2, y + 4.6 + jaw * 1.4);
          ctx.stroke();
        }
      });
      glow(g, x + 3.6, y - 2, 6, SPIRIT, 0.75);
      glow(g, x + 3.6, y - 2, 2, '#e8fff6', 0.9);
      return;
    }
    case 'none':
      face(g, x, y);
      smooth(g, [x - 8, y + 1, x - 8, y - 6, x - 2, y - 9.5, x + 5, y - 8, x + 7, y - 4.5, x + 1, y - 5, x - 3, y - 2, x - 4, y + 3], HAIR, { outline: 1.8 });
      return;
    case 'crown':
      face(g, x, y, SKIN, '#8a6a44');
      smooth(g, [x - 8, y + 2, x - 8.5, y - 6, x - 2, y - 9, x + 5, y - 8, x + 6.5, y - 5, x - 3, y - 3.5, x - 4, y + 4], '#8a6a44', { outline: 1.8 });
      poly(g, [x - 7.5, y - 5, x - 8, y - 13, x - 4.4, y - 9, x - 0.5, y - 15, x + 3.4, y - 9, x + 7, y - 13, x + 6.8, y - 5], GOLD, { outline: 1.8, box: [x - 8, y - 15, x + 7, y - 5] });
      detail(g, (ctx) => {
        ctx.fillStyle = RED_GEM;
        ctx.beginPath();
        ctx.arc(x - 0.5, y - 7.2, 1.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = GOLD_HI;
        for (const [gx, gy] of [[x - 8, y - 13.4], [x - 0.5, y - 15.4], [x + 7, y - 13.4]] as const) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.1, 0, TAU);
          ctx.fill();
        }
      });
      glow(g, x, y - 10, 8, GOLD_HI, 0.35);
      return;
    case 'horned':
      face(g, x, y, SKIN, '#b5532d');
      part(g, () => c.arc(x, y - 1, 8.8, Math.PI, 0), STEEL_DARK, { box: [x - 9, y - 10, x + 9, y - 1] });
      rect(g, x - 9.5, y - 2.4, 19, 2.8, 1, IRON, { outline: 1.5 });
      stick(g, x + 5.2, y - 2, x + 5.6, y + 4, 2, STEEL, 1.4);
      curve(g, x - 6, y - 6, x - 15, y - 9, x - 13, y - 19, 3.4, BONE, 1.8);
      curve(g, x + 5, y - 7, x + 13, y - 12, x + 9, y - 21, 3.4, BONE, 1.8);
      helmCrest(g, x, y - 9.5, 5);
      return;
    case 'kettle':
      face(g, x, y);
      part(g, () => c.arc(x, y - 1.5, 8.6, Math.PI, 0), STEEL, { box: [x - 9, y - 10, x + 9, y - 1.5] });
      smooth(g, [x - 13, y - 0.5, x - 6, y - 3, x + 6, y - 3, x + 13, y - 0.5, x + 6, y + 0.8, x - 6, y + 0.8], STEEL_DARK, { outline: 1.8 });
      glint(g, x - 4.5, y - 6.5, x - 1, y - 8.6);
      rivets(g, [x - 8, y - 1, x - 3, y - 1.6, x + 2, y - 1.6, x + 7, y - 1], 0.6);
      helmCrest(g, x, y - 9.5, 6);
      return;
    case 'great':
      rect(g, x - 8.5, y - 10, 17.5, 19, 4.5, STEEL, { box: [x - 8.5, y - 10, x + 9, y + 9] });
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.fillRect(x - 0.5, y - 2.6, 9.8, 2.3);
        ctx.fillStyle = 'rgba(34,24,15,0.85)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x + 3 + i * 2.2, y + 3.4, 0.6, 0, TAU);
          ctx.fill();
        }
      });
      stick(g, x + 3.4, y - 9, x + 3.4, y + 8, 1.6, STEEL_DARK, 0.8);
      glint(g, x - 6, y - 6, x - 6, y + 2);
      helmCrest(g, x, y - 10, 6);
      return;
    case 'sallet':
      face(g, x, y);
      part(g, () => {
        c.moveTo(x - 12, y + 1);
        c.quadraticCurveTo(x - 10, y - 11, x + 1, y - 10.5);
        c.quadraticCurveTo(x + 9, y - 9.5, x + 9, y - 1);
        c.lineTo(x + 2, y - 1.5);
        c.lineTo(x - 6, y + 2);
        c.closePath();
      }, STEEL, { box: [x - 12, y - 11, x + 9, y + 2] });
      lines(g, 1.6, INK, (ctx) => {
        ctx.moveTo(x + 1, y - 3.6);
        ctx.lineTo(x + 8.6, y - 3.6);
      });
      glint(g, x - 6, y - 6, x - 1, y - 8.6);
      helmCrest(g, x - 1, y - 10.5, 6);
      return;
    case 'hood':
      face(g, x + 0.5, y + 0.5);
      part(g, () => {
        c.moveTo(x - 10, y + 7);
        c.quadraticCurveTo(x - 12, y - 6, x - 2, y - 10.5);
        c.quadraticCurveTo(x + 7, y - 12, x + 10, y - 4);
        c.lineTo(x + 7, y - 3);
        c.quadraticCurveTo(x + 4, y - 7, x - 1, y - 5);
        c.quadraticCurveTo(x - 3.5, y + 1, x - 2, y + 8);
        c.closePath();
      }, CLOTH, { team: true, box: [x - 12, y - 12, x + 10, y + 8], trim: 'edge' });
      // Liripipe tail falling down the back.
      curve(g, x - 9, y - 4, x - 15, y + 2, x - 13, y + 10, 3, CLOTH, 1.6, true);
      return;
    case 'cowl':
      face(g, x + 0.5, y + 0.5, SKIN, null);
      part(g, () => {
        c.moveTo(x - 10, y + 8);
        c.quadraticCurveTo(x - 11, y - 6, x - 1, y - 11);
        c.quadraticCurveTo(x + 8, y - 11, x + 10, y - 2);
        c.quadraticCurveTo(x + 9, y + 2, x + 7.5, y + 1);
        c.quadraticCurveTo(x + 6, y - 6, x - 0.5, y - 5);
        c.quadraticCurveTo(x - 4, y + 1, x - 2, y + 9);
        c.closePath();
      }, GREEN, { box: [x - 11, y - 11, x + 10, y + 9] });
      return;
    case 'coif':
      face(g, x, y, SKIN, null);
      part(g, () => {
        c.moveTo(x - 9, y + 8);
        c.quadraticCurveTo(x - 10, y - 8, x, y - 9.5);
        c.quadraticCurveTo(x + 8.5, y - 9, x + 8.5, y - 3);
        c.lineTo(x + 5, y - 3);
        c.quadraticCurveTo(x + 1, y - 4, x - 1, y + 1);
        c.quadraticCurveTo(x - 1.5, y + 6, x + 3, y + 9);
        c.closePath();
      }, CLOTH, { box: [x - 10, y - 10, x + 8.5, y + 9] });
      return;
    case 'beret': {
      face(g, x, y, SKIN, HAIR);
      const nod = p && p.pose === 'idle' ? wave(p) * 1.2 : p ? p.stride * 1.5 : 0;
      smooth(g, [x - 10, y - 3, x - 8, y - 9, x + 2, y - 11, x + 11, y - 7, x + 9, y - 3.5, x, y - 4.5], CLOTH, { team: true, outline: 1.8, trim: 'edge' });
      lines(g, 0.9, 'rgba(34,24,15,0.5)', (ctx) => {
        ctx.moveTo(x - 6, y - 8);
        ctx.lineTo(x - 4, y - 4.5);
        ctx.moveTo(x - 1, y - 9.5);
        ctx.lineTo(x + 1, y - 5);
        ctx.moveTo(x + 4, y - 9.5);
        ctx.lineTo(x + 5, y - 5);
      });
      curve(g, x - 4, y - 8, x - 12, y - 18 + nod, x - 22, y - 12 + nod, 3.4, FEATHER, 1.6);
      curve(g, x - 3, y - 8, x - 10, y - 21 + nod, x - 19, y - 18 + nod, 2.6, '#f2ead8', 1.4);
      return;
    }
    case 'wizard': {
      face(g, x, y + 1, SKIN, null);
      const droop = p ? (p.pose === 'idle' ? wave(p) * 1.5 : p.stride * 2 - (isAttack(p) ? p.swing * 2 : 0)) : 0;
      // A long beard that sways.
      smooth(g, [x - 1, y + 3, x + 7, y + 3, x + 7 + droop * 0.3, y + 12, x + 3 + droop, y + 21, x - 1, y + 13], '#e8e1d2', { outline: 1.8 });
      lines(g, 0.8, 'rgba(74,58,40,0.6)', (ctx) => {
        ctx.moveTo(x + 2, y + 6);
        ctx.lineTo(x + 3 + droop * 0.5, y + 15);
        ctx.moveTo(x + 5, y + 6);
        ctx.lineTo(x + 5 + droop * 0.5, y + 13);
      });
      part(g, () => {
        c.moveTo(x - 14, y - 3);
        c.quadraticCurveTo(x, y - 7, x + 14, y - 3.5);
        c.quadraticCurveTo(x + 10, y - 7, x + 5, y - 7.5);
        c.quadraticCurveTo(x + 3, y - 20, x - 4 + droop, y - 30);
        c.quadraticCurveTo(x - 12 + droop, y - 26, x - 7, y - 23);
        c.quadraticCurveTo(x - 6, y - 14, x - 7, y - 7.5);
        c.quadraticCurveTo(x - 11, y - 6, x - 14, y - 3);
        c.closePath();
      }, ROBE_BLUE, { team: true, box: [x - 14, y - 30, x + 14, y - 3] });
      // Hat band and a stitched star.
      stick(g, x - 6.5, y - 7.6, x + 5, y - 7.8, 2, LEATHER_DARK, 1);
      detail(g, (ctx) => {
        ctx.fillStyle = '#efe4c8';
        const sx = x - 2;
        const sy = y - 15;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 1 : 2.6;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        ctx.fill();
      });
      return;
    }
  }
}

/** A heater shield: steel rim, the army's field, an ink charge and a boss. */
function shield(g: G, x: number, y: number, s: number, charge: 'cross' | 'bend' | 'pale' | 'none' = 'cross'): void {
  const pts = (k: number) => [x - 9 * s * k, y - 10 * s * k, x + 9 * s * k, y - 10 * s * k, x + 9 * s * k, y + 1 * s * k, x, y + 13 * s * k, x - 9 * s * k, y + 1 * s * k];
  const shape = (k: number) => () => {
    const c = g.ctx;
    const [ax, ay, bx, by, cx, cy, dx, dy, ex, ey] = pts(k);
    c.moveTo(ax!, ay!);
    c.lineTo(bx!, by!);
    c.lineTo(cx!, cy!);
    c.quadraticCurveTo(cx!, (cy! + dy!) / 2 + 2 * s, dx!, dy!);
    c.quadraticCurveTo(ex!, (ey! + dy!) / 2 + 2 * s, ex!, ey!);
    c.closePath();
  };
  part(g, shape(1), STEEL_DARK, { box: [x - 9 * s, y - 10 * s, x + 9 * s, y + 13 * s] });
  part(g, shape(0.78), CLOTH, { team: true, outline: 1.2, box: [x - 7 * s, y - 8 * s, x + 7 * s, y + 10 * s] });
  detail(g, (ctx) => {
    ctx.fillStyle = 'rgba(34,24,15,0.82)';
    if (charge === 'cross') {
      ctx.fillRect(x - 1.3 * s, y - 7.4 * s, 2.6 * s, 16 * s);
      ctx.fillRect(x - 6.6 * s, y - 2.6 * s, 13.2 * s, 2.6 * s);
    } else if (charge === 'bend') {
      ctx.beginPath();
      ctx.moveTo(x - 7 * s, y - 7.8 * s);
      ctx.lineTo(x - 3.5 * s, y - 7.8 * s);
      ctx.lineTo(x + 7 * s, y + 3 * s);
      ctx.lineTo(x + 5 * s, y + 6 * s);
      ctx.closePath();
      ctx.fill();
    } else if (charge === 'pale') {
      ctx.fillRect(x - 2 * s, y - 7.8 * s, 4 * s, 17 * s);
    }
  });
  glint(g, x - 7 * s, y - 8.6 * s, x - 2 * s, y - 8.6 * s, 0.9);
}

/** A cape whose hem ripples with the gait and the idle breeze. */
function cape(g: G, p: Pose, x: number, y: number, len: number, w: number): void {
  const flow = p.pose === 'walk' ? 3 + wave(p, 2) * 1.4 : p.pose === 'attack' ? -p.swing * 3 : wave(p) * 1.4;
  const hem = y + len;
  smooth(g, [x + 2, y - 1, x + 6, y + 2, x + 2, hem - 2, x - w * 0.3 - flow, hem + 1, x - w * 0.65 - flow, hem - 3 + wave(p, 1, 0.3), x - w - flow * 1.3, hem + 1, x - w * 0.6 - flow * 0.6, y + len * 0.4, x - 3, y], CLOTH, { team: true, box: [x - w - flow * 1.3, y, x + 6, hem + 1] });
  folds(g, (ctx) => {
    ctx.moveTo(x - 2, y + 4);
    ctx.quadraticCurveTo(x - w * 0.3, y + len * 0.5, x - w * 0.4 - flow, hem - 1);
    ctx.moveTo(x - 4, y + 3);
    ctx.quadraticCurveTo(x - w * 0.6, y + len * 0.5, x - w * 0.8 - flow, hem - 1);
  });
}

/** A team tabard over the chest, belted, with a fold or two. */
function tabard(g: G, x: number, y: number, w: number, h: number, belt = LEATHER_DARK): void {
  smooth(g, [x, y, x + w * 0.5, y + 2, x + w, y, x + w + 0.5, y + h, x + w * 0.5, y + h + 3.5, x - 0.5, y + h], CLOTH, { team: true, outline: 1.9, box: [x, y, x + w, y + h + 3] });
  folds(g, (ctx) => {
    ctx.moveTo(x + w * 0.3, y + h * 0.55);
    ctx.lineTo(x + w * 0.25, y + h);
    ctx.moveTo(x + w * 0.7, y + h * 0.55);
    ctx.lineTo(x + w * 0.75, y + h);
  });
  rect(g, x - 1, y + h * 0.45, w + 2, 3, 1, belt, { outline: 1.4, flat: true });
  detail(g, (ctx) => {
    ctx.fillStyle = BRASS;
    ctx.fillRect(x + w * 0.5 - 1.5, y + h * 0.45 - 0.3, 3, 3.6);
  });
}

/** A body: shoulders, chest, waist. */
function torso(g: G, x: number, y: number, w: number, h: number, color: string, o: PartOptions = {}): void {
  smooth(g, [x - 1, y + 2, x + w * 0.5, y - 1, x + w + 1, y + 2, x + w, y + h * 0.7, x + w - 1, y + h, x + 1, y + h, x, y + h * 0.7], color, o);
}

// ------------------------------------------------------------- weapons

function blade(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color = STEEL): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const m = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / m) * w * 0.5;
  const ny = (dx / m) * w * 0.5;
  poly(g, [x0 + nx, y0 + ny, x1 - dx / m * w * 1.4 + nx, y1 - dy / m * w * 1.4 + ny, x1, y1, x1 - dx / m * w * 1.4 - nx, y1 - dy / m * w * 1.4 - ny, x0 - nx, y0 - ny], color, { outline: 1.7 });
  lines(g, 0.8, 'rgba(255,241,207,0.85)', (ctx) => {
    ctx.moveTo(x0 + dx * 0.08 - nx * 0.3, y0 + dy * 0.08 - ny * 0.3);
    ctx.lineTo(x1 - dx / m * w * 2 - nx * 0.3, y1 - dy / m * w * 2 - ny * 0.3);
  });
}

/** A spear from grip, pointing along `ang`, slid by `slide`. */
function spear(g: G, gx: number, gy: number, ang: number, slide: number, back: number, fwd: number, w = 2.8): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const bx = gx + ux * (slide - back);
  const by = gy + uy * (slide - back);
  const tx = gx + ux * (slide + fwd);
  const ty = gy + uy * (slide + fwd);
  stick(g, bx, by, tx, ty, w, WOOD, 1.8);
  const nx = -uy;
  const ny = ux;
  poly(g, [tx - ux * 2, ty - uy * 2, tx + ux * 3 + nx * 2.8, ty + uy * 3 + ny * 2.8, tx + ux * 10, ty + uy * 10, tx + ux * 3 - nx * 2.8, ty + uy * 3 - ny * 2.8], STEEL, { outline: 1.6 });
  glint(g, tx + ux * 2 - nx, ty + uy * 2 - ny, tx + ux * 7 - nx * 0.4, ty + uy * 7 - ny * 0.4, 0.7);
}

function bow(g: G, x: number, y: number, r: number, draw: number, color = WOOD, arrow = true): void {
  const a = 1.12;
  const top = { x: x + Math.cos(-a) * r - r * 0.4, y: y + Math.sin(-a) * r };
  const bot = { x: x + Math.cos(a) * r - r * 0.4, y: y + Math.sin(a) * r };
  g.ctx.save();
  g.ctx.translate(-r * 0.4, 0);
  // Recurved limbs: two arcs meeting at the grip.
  curve(g, x + r, y, x + r * 1.02, y - r * 0.7, x + Math.cos(-a) * r, y + Math.sin(-a) * r, 3, color, 1.8);
  curve(g, x + r, y, x + r * 1.02, y + r * 0.7, x + Math.cos(a) * r, y + Math.sin(a) * r, 3, color, 1.8);
  rect(g, x + r - 2, y - 3, 4, 6, 1.5, LEATHER_DARK, { outline: 1.2, flat: true });
  g.ctx.restore();
  stick(g, top.x, top.y, x - draw, y, 0.9, '#efe6cf', 0);
  stick(g, bot.x, bot.y, x - draw, y, 0.9, '#efe6cf', 0);
  if (arrow && draw >= 0) {
    stick(g, x - draw, y, x + r * 0.75, y - 0.5, 1.4, WOOD_DARK, 1);
    poly(g, [x + r * 0.75, y - 2, x + r * 0.75 + 5, y - 0.5, x + r * 0.75, y + 1], STEEL, { outline: 1, flat: true });
    poly(g, [x - draw, y - 0.5, x - draw - 4, y - 3, x - draw + 1, y - 0.5, x - draw - 4, y + 2], CLOTH, { outline: 0.9, flat: true, team: true, trim: false });
  }
}

function axe(g: G, x0: number, y0: number, x1: number, y1: number): void {
  stick(g, x0, y0, x1, y1, 3, WOOD, 1.8);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const m = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / m;
  const uy = dy / m;
  const nx = -uy;
  const ny = ux;
  part(g, () => {
    const c = g.ctx;
    c.moveTo(x1 - ux * 1, y1 - uy * 1);
    c.lineTo(x1 + nx * 7 + ux * 2, y1 + ny * 7 + uy * 2);
    c.quadraticCurveTo(x1 + nx * 12 - ux * 5, y1 + ny * 12 - uy * 5, x1 + nx * 8 - ux * 13, y1 + ny * 8 - uy * 13);
    c.lineTo(x1 - ux * 8, y1 - uy * 8);
    c.closePath();
  }, STEEL, { box: [Math.min(x1, x1 + nx * 12) - 6, Math.min(y1, y1 + ny * 12) - 6, Math.max(x1, x1 + nx * 12) + 6, Math.max(y1, y1 + ny * 12) + 6] });
  lines(g, 0.9, 'rgba(255,241,207,0.9)', (ctx) => {
    ctx.moveTo(x1 + nx * 10 - ux * 1, y1 + ny * 10 - uy * 1);
    ctx.quadraticCurveTo(x1 + nx * 11.5 - ux * 5, y1 + ny * 11.5 - uy * 5, x1 + nx * 8 - ux * 11, y1 + ny * 8 - uy * 11);
  });
}

// ------------------------------------------------------------- mounts

/** A horse facing right in the 128 cell, hooves on y=114: an 8-beat gallop, a fidget at rest. */
function horse(g: G, p: Pose, o: { barding: boolean; color: string; mane: string }): void {
  const gallop = p.pose === 'walk';
  const ph = p.t;
  // Body rocks on the gallop.
  const rock = gallop ? Math.sin(ph * TAU) * 0.06 : 0;
  const lift = gallop ? Math.abs(Math.cos(ph * TAU)) * -2.5 : p.pose === 'idle' ? (1 - Math.cos(ph * TAU)) * 0.4 : 0;
  const nod = gallop ? Math.sin(ph * TAU + 1) * 3 : p.pose === 'idle' ? Math.max(0, wave(p, 1, 0.2)) * 3.4 : p.pose === 'attack' ? -p.swing * 1.5 : 0;
  const leg = (hx: number, hy: number, phase: number, color: string, fore: boolean) => {
    let a = 0;
    let bend = 0;
    if (gallop) {
      const s = Math.sin((ph + phase) * TAU);
      a = s * 0.62;
      bend = Math.max(0, Math.cos((ph + phase) * TAU)) * 1.1;
    } else if (p.pose === 'idle' && fore && phase > 0.3) {
      // A pawing forehoof.
      bend = Math.max(0, wave(p, 1, 0.1)) * 0.9;
      a = bend * 0.35;
    } else if (p.pose === 'die') {
      a = fore ? 0.7 : -0.5;
      bend = 0.8;
    }
    const kx = hx + Math.sin(a) * 13;
    const ky = hy + Math.cos(a) * 13;
    const b = fore ? a - bend : a + bend * 0.6;
    const fx = kx + Math.sin(b) * 14;
    const fy = Math.min(112, ky + Math.cos(b) * 14);
    stick(g, hx, hy - 4, kx, ky, fore ? 6.5 : 8, color, 2);
    stick(g, kx, ky, fx, fy, 4.4, color, 2);
    poly(g, [fx - 2.6, fy - 2, fx + 3, fy - 2, fx + 4.4, fy + 2.2, fx - 3, fy + 2.2], '#2b2119', { outline: 1.5, flat: true });
  };
  pivot(g, 64, 76, rock, () => {
    g.ctx.save();
    g.ctx.translate(0, lift);
    leg(44, 82, 0.1, tone(o.color, -0.25), false);
    leg(84, 82, 0.55, tone(o.color, -0.25), true);
    // Tail: streams back on the gallop, swishes at rest.
    const swish = gallop ? -4 : p.pose === 'idle' ? wave(p, 1, 0.5) * 6 : 0;
    curve(g, 36, 68, 20 + swish * 0.3, 70 + (gallop ? -4 : 4), 18 + swish, gallop ? 80 : 96, 7, o.mane, 1.9);
    curve(g, 36, 70, 26 + swish * 0.2, 78, 24 + swish * 0.8, gallop ? 86 : 98, 3.5, tone(o.mane, 0.2), 0);
    // Barrel and chest.
    smooth(g, [36, 66, 50, 60, 76, 60, 92, 64, 96, 76, 88, 88, 64, 90, 44, 88, 34, 78], o.color, { box: [34, 60, 96, 90] });
    // Neck and head, nodding.
    pivot(g, 88, 66, nod * 0.04, () => {
      smooth(g, [82, 72, 86, 56, 96, 44, 104, 41, 112, 46, 116, 54, 112, 57, 104, 54, 98, 60, 96, 74], o.color, { box: [82, 41, 116, 74] });
      // Muzzle shade, nostril, eye and ear.
      detail(g, (ctx) => {
        ctx.fillStyle = 'rgba(43,58,92,0.35)';
        ctx.beginPath();
        ctx.ellipse(112, 53, 4, 3, 0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(113.5, 52.5, 0.9, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(104, 47, 1.7, 1.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = LIGHT;
        ctx.beginPath();
        ctx.arc(103.5, 46.6, 0.5, 0, TAU);
        ctx.fill();
      });
      poly(g, [98, 44, 99, 36, 102, 42], o.color, { outline: 1.5 });
      // Mane along the crest.
      const flow = gallop ? 3 : 1 + wave(p) * 0.8;
      smooth(g, [97, 42, 92, 46, 86, 54, 82, 64, 80 - flow, 62, 82 - flow, 52, 88 - flow * 0.5, 44, 96, 39], o.mane, { outline: 1.7 });
      // Bridle.
      lines(g, 1.2, LEATHER_DARK, (ctx) => {
        ctx.moveTo(101, 42);
        ctx.lineTo(108, 55);
        ctx.moveTo(100, 50);
        ctx.lineTo(114, 49);
      });
      if (o.barding) {
        // Chanfron: a steel faceplate.
        poly(g, [99, 43, 108, 45, 115, 51, 112, 53, 102, 49], STEEL, { outline: 1.6 });
        glint(g, 101, 44, 107, 46, 0.8);
      }
    });
    if (o.barding) {
      // Caparison: the army's cloth with a scalloped hem.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(38, 64);
        c.quadraticCurveTo(62, 57, 90, 62);
        c.lineTo(95, 76);
        const hem = [[95, 76], [88, 90], [80, 86], [72, 92], [64, 87], [56, 92], [48, 87], [40, 91], [34, 80]] as const;
        for (let i = 1; i < hem.length; i++) {
          const [hx0, hy0] = hem[i - 1]!;
          const [hx1, hy1] = hem[i]!;
          c.quadraticCurveTo((hx0 + hx1) / 2, Math.max(hy0, hy1) + 3, hx1, hy1);
        }
        c.closePath();
      }, CLOTH, { team: true, box: [34, 57, 95, 92] });
      folds(g, (ctx) => {
        for (const fx of [50, 64, 78]) {
          ctx.moveTo(fx, 68);
          ctx.lineTo(fx - 1, 86);
        }
      });
      // Peytral band with studs.
      stick(g, 38, 66, 90, 63, 3, LEATHER_DARK, 1.2);
      rivets(g, [46, 65.5, 56, 64.6, 66, 64, 76, 63.6, 86, 63.4], 0.8);
    } else {
      // Saddle cloth and girth.
      smooth(g, [50, 61, 76, 60, 78, 72, 66, 76, 52, 74], CLOTH, { team: true, box: [50, 60, 78, 76] });
      stick(g, 64, 74, 64, 88, 2.6, LEATHER_DARK, 1.2);
    }
    rect(g, 54, 56, 22, 7, 3, LEATHER, { outline: 1.7 });
    leg(52, 84, 0, o.color, false);
    leg(80, 84, 0.45, o.color, true);
    g.ctx.restore();
  });
}

function wing(g: G, x: number, y: number, flap: number, len: number, color: string, membrane: boolean, back: boolean, ruffle = 0): void {
  // The span sweeps from raised (up and back) through level to lowered (down and back).
  const lift = Math.cos(flap * TAU);
  const t = (1 - lift) / 2;
  const angle = -2.05 - t * (membrane ? 1.5 : 1.75) + (back ? 0.18 : 0);
  const span = len * (0.62 + 0.38 * Math.abs(lift));
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // v: toward the trailing edge.
  const vx = uy;
  const vy = -ux;
  const at = (a: number, b: number) => [x + ux * span * a + vx * len * b, y + uy * span * a + vy * len * b] as const;
  const fill = back ? tone(color, -0.3) : color;
  const bone = back ? SCALE_DARK : tone(color, -0.45);
  if (membrane) {
    const elbow = at(0.38, -0.06);
    const wrist = at(0.62, -0.02);
    const tips = [at(1, 0.04), at(0.86, 0.34), at(0.64, 0.56), at(0.34, 0.62)];
    const root = at(0.02, 0.42);
    const xs = [x, elbow[0], wrist[0], root[0], ...tips.map((q) => q[0])];
    const ys = [y, elbow[1], wrist[1], root[1], ...tips.map((q) => q[1])];
    part(g, () => {
      const c = g.ctx;
      c.moveTo(x, y);
      c.lineTo(elbow[0], elbow[1]);
      c.lineTo(wrist[0], wrist[1]);
      c.lineTo(tips[0]![0], tips[0]![1]);
      let prev = tips[0]!;
      for (const tip of [...tips.slice(1), root]) {
        // Scalloped edge: bow each span of membrane toward the bones.
        const mx = (prev[0] + tip[0]) / 2 + (wrist[0] - (prev[0] + tip[0]) / 2) * 0.28;
        const my = (prev[1] + tip[1]) / 2 + (wrist[1] - (prev[1] + tip[1]) / 2) * 0.28;
        c.quadraticCurveTo(mx, my, tip[0], tip[1]);
        prev = tip;
      }
      c.closePath();
    }, fill, { box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    // Veins in the membrane.
    lines(g, 0.8, 'rgba(34,24,15,0.35)', (ctx) => {
      for (const tip of tips.slice(1)) {
        const m = at(0.4, 0.3);
        ctx.moveTo(m[0], m[1]);
        ctx.lineTo((m[0] + tip[0]) / 2, (m[1] + tip[1]) / 2);
      }
    });
    stick(g, x, y, elbow[0], elbow[1], len * 0.065, bone, 2);
    stick(g, elbow[0], elbow[1], wrist[0], wrist[1], len * 0.048, bone, 2);
    for (const tip of tips) stick(g, wrist[0], wrist[1], tip[0], tip[1], len * 0.022, bone, 1.4);
    poly(g, [wrist[0] - 2, wrist[1], wrist[0] + ux * 9 - vx * 6, wrist[1] + uy * 9 - vy * 6, wrist[0] + 2, wrist[1] + 2], BONE, { outline: 1.4 });
    return;
  }
  // Feathered wing: a covert shoulder, then a fan of long primaries, each inked.
  const wrist = at(0.55, -0.04);
  const tip = at(1, 0.06);
  const root = at(0.05, 0.42);
  const n = 7;
  for (let i = n - 1; i >= 0; i--) {
    const f0 = at(0.98 - i * 0.13, 0.06 + i * 0.075 + Math.sin(ruffle * TAU + i) * 0.015);
    const base = at(0.5 - i * 0.05, 0.12 + i * 0.03);
    const ex = f0[0] - base[0];
    const ey = f0[1] - base[1];
    const m = Math.sqrt(ex * ex + ey * ey) || 1;
    const nx = (-ey / m) * len * 0.055;
    const ny = (ex / m) * len * 0.055;
    poly(g, [base[0] - nx, base[1] - ny, f0[0] - nx * 0.5, f0[1] - ny * 0.5, f0[0] + ex / m * 2, f0[1] + ey / m * 2, f0[0] + nx * 0.6, f0[1] + ny * 0.6, base[0] + nx, base[1] + ny], i % 2 ? tone(fill, -0.08) : fill, { outline: 1.4 });
  }
  part(g, () => {
    const c = g.ctx;
    c.moveTo(x, y);
    c.quadraticCurveTo(wrist[0], wrist[1] - 2, at(0.75, 0.02)[0], at(0.75, 0.02)[1]);
    const a = at(0.62, 0.22);
    c.quadraticCurveTo(a[0], a[1], root[0], root[1]);
    c.closePath();
  }, tone(fill, 0.08), { box: [Math.min(x, tip[0], root[0]), Math.min(y, tip[1], root[1]), Math.max(x, tip[0], root[0]), Math.max(y, tip[1], root[1])] });
  lines(g, 0.9, 'rgba(34,24,15,0.4)', (ctx) => {
    for (let i = 0; i < 3; i++) {
      const a = at(0.15 + i * 0.16, 0.05);
      const b = at(0.1 + i * 0.16, 0.25);
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + 2, (a[1] + b[1]) / 2, b[0], b[1]);
    }
  });
}

// ------------------------------------------------------------ painters

/** Weapon rotation for an overhead or sweeping attack. */
function swingAngle(p: Pose, back = 1.1, fwd = 1.2): number {
  if (p.pose === 'idle') return wave(p) * 0.03;
  if (p.pose === 'walk') return Math.sin(p.t * TAU) * 0.05;
  return p.swing < 0 ? p.swing * back : p.swing * fwd;
}

/** On the strike frame: a smear behind the weapon's arc. */
function strikeSmear(g: G, p: Pose, cx: number, cy: number, r: number, a0: number, a1: number, w = 5): void {
  if (isAttack(p) && p.swing >= 0.95) smear(g, cx, cy, r, a0, a1, w);
}

const PAINTERS: Record<number, Painter> = {
  [Kind.Footman]: (g, p) => {
    legs(g, p, { color: '#6b5236' });
    upper(g, p, () => {
      // Spear held in the near hand: raised at rest, couched and thrust in attack.
      const atk = isAttack(p);
      const ang = atk ? (p.swing < 0 ? -0.55 + p.swing * 0.1 : -0.12) : -1.12 + swingAngle(p) * 2;
      const slide = atk ? (p.swing < 0 ? p.swing * 7 : p.swing * 13) : 0;
      const gx = atk ? 56 : 58;
      const gy = atk ? 50 : 52;
      arm(g, 45, 44, 37, 52, GAMBESON, SKIN, -1);
      torso(g, 39, 41, 19, 23, GAMBESON);
      lines(g, 0.8, 'rgba(34,24,15,0.4)', (ctx) => {
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(40, 47 + i * 5);
          ctx.lineTo(57, 47 + i * 5);
        }
      });
      tabard(g, 41, 44, 15, 17);
      head(g, 49, 32, 'kettle');
      spear(g, gx, gy, ang, slide, 26, 30);
      arm(g, 52, 44, gx + Math.cos(ang) * slide, gy + Math.sin(ang) * slide, GAMBESON, SKIN, 1);
      if (atk && p.swing >= 0.95) paint(g, (ctx) => {
        ctx.strokeStyle = 'rgba(255,241,207,0.75)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (const dy of [-4, 0, 4]) {
          ctx.beginPath();
          ctx.moveTo(60, gy - 6 + dy);
          ctx.lineTo(78, gy - 8 + dy);
          ctx.stroke();
        }
      });
      shield(g, 39, 53, 0.78, 'cross');
    });
  },
  [Kind.Knight]: (g, p) => {
    horse(g, p, { barding: true, color: '#d8cfbd', mane: '#5b4430' });
    upper(g, p, () => {
      const atk = isAttack(p);
      // Lance: raised on the wind-up, couched level and driven home on the strike.
      const ang = atk ? (p.swing < 0 ? -0.5 * -p.swing - 0.1 : -0.08) : -0.55 + wave(p) * 0.03 + (p.pose === 'walk' ? Math.sin(p.t * TAU) * 0.04 : 0);
      const thrust = atk ? (p.swing < 0 ? p.swing * 5 : p.swing * 12) : 0;
      stick(g, 62, 60, 58, 76, 6, STEEL_DARK, 2);
      cape(g, p, 58, 42, 18, 10);
      torso(g, 54, 38, 18, 24, STEEL, { box: [53, 37, 73, 62] });
      tabard(g, 56, 42, 14, 15);
      head(g, 64, 28, 'great');
      // Team crest plume above the helm.
      const sway = p.pose === 'walk' ? -2 : wave(p) * 1.2;
      smooth(g, [60, 18, 66, 15, 72, 17, 70 - sway, 11, 62 - sway * 1.5, 9, 56 - sway * 2, 13], CLOTH, { team: true, outline: 1.6, trim: 'edge' });
      pivot(g, 68, 50, ang, () => {
        g.ctx.save();
        g.ctx.translate(thrust, 0);
        poly(g, [56, 49, 124, 46.6, 124, 48.4, 56, 53], WOOD, { outline: 1.8 });
        lines(g, 0.9, 'rgba(34,24,15,0.45)', (ctx) => {
          for (let i = 0; i < 6; i++) {
            ctx.moveTo(78 + i * 7, 46.8);
            ctx.lineTo(82 + i * 7, 51.5);
          }
        });
        poly(g, [64, 43, 72, 45, 72, 57, 64, 59], STEEL, { outline: 1.8 });
        const flut = p.pose === 'walk' ? Math.sin(p.t * TAU * 2) * 1.6 : wave(p) * 1;
        part(g, () => {
          const c = g.ctx;
          c.moveTo(98, 47.6);
          c.lineTo(112, 47);
          c.quadraticCurveTo(108, 51 + flut, 113, 55 + flut);
          c.lineTo(104, 53 + flut * 0.6);
          c.quadraticCurveTo(100, 52, 98, 52.5);
          c.closePath();
        }, CLOTH, { team: true, outline: 1.4, box: [98, 47, 113, 55], trim: 'edge' });
        g.ctx.restore();
      });
      arm(g, 62, 42, 68 + thrust * Math.cos(ang), 50 + thrust * Math.sin(ang), STEEL_DARK, STEEL_DARK, 1);
      shield(g, 52, 50, 0.75, 'bend');
    });
    strikeSmear(g, p, 30, 50, 96, -0.06, 0.06, 3);
  },
  [Kind.Warden]: (g, p) => {
    legs(g, { ...p, stride: p.stride * 0.6, t: p.t }, { color: STEEL_DARK, armor: true, spread: 0.6, w: 6.4 });
    upper(g, p, () => {
      const atk = isAttack(p);
      // A shield bash: set back, then slam forward.
      const push = atk ? (p.swing > 0 ? p.swing * 7 : p.swing * 3) : wave(p) * 0.3;
      arm(g, 44, 44, 38, 56, MAIL, STEEL_DARK, -1);
      torso(g, 36, 40, 23, 26, MAIL, { box: [35, 39, 60, 66] });
      lines(g, 0.7, 'rgba(34,24,15,0.4)', (ctx) => {
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 4; j++) {
            const cx = 39 + j * 5 + (i % 2) * 2.5;
            const cy = 45 + i * 4;
            ctx.moveTo(cx + 1.5, cy);
            ctx.arc(cx, cy, 1.5, 0, Math.PI);
          }
        }
      });
      tabard(g, 39, 46, 15, 14);
      head(g, 46, 31, 'great');
      // Tower shield: steel-banded wood, the army's field, a boss and a pale.
      g.ctx.save();
      g.ctx.translate(push, 0);
      rect(g, 52, 19, 25, 62, 6, STEEL_DARK, { box: [52, 19, 77, 81] });
      rect(g, 55, 22, 19, 56, 4, CLOTH, { team: true, outline: 1.3, box: [55, 22, 74, 78] });
      detail(g, (ctx) => {
        ctx.fillStyle = 'rgba(34,24,15,0.82)';
        ctx.fillRect(62.5, 23, 4, 54);
      });
      stick(g, 54, 34, 75, 34, 2.4, STEEL_DARK, 1.2);
      stick(g, 54, 66, 75, 66, 2.4, STEEL_DARK, 1.2);
      rivets(g, [56, 34, 73, 34, 56, 66, 73, 66, 56, 22.5, 73, 22.5, 56, 78, 73, 78], 0.8);
      circle(g, 64.5, 50, 5, STEEL, { outline: 1.8 });
      glint(g, 62.5, 47.8, 64.5, 46.6, 0.9);
      glint(g, 54.5, 24, 54.5, 74, 1);
      g.ctx.restore();
      if (atk && p.swing >= 0.95) paint(g, (ctx) => {
        ctx.strokeStyle = 'rgba(255,241,207,0.8)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (const [x0, y0, x1, y1] of [[86, 30, 92, 26], [88, 50, 96, 50], [86, 70, 92, 74]] as const) {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      });
    });
  },
  [Kind.Paladin]: (g, p) => {
    legs(g, p, { color: STEEL_DARK, armor: true });
    upper(g, p, () => {
      const pulse = p.pose === 'idle' ? 0.45 + wave(p) * 0.12 : 0.5;
      glow(g, 48, 22, 22, '#fff2b0', pulse);
      // Halo: a ring of gold light, not a hat.
      part(g, () => {
        g.ctx.ellipse(47, 18.5, 10, 3, -0.1, 0, TAU);
        g.ctx.ellipse(47, 18.5, 7, 1.6, -0.1, 0, TAU, true);
      }, GOLD_HI, { outline: 1.2, box: [37, 15, 57, 22], flat: true });
      cape(g, p, 42, 41, 26, 12);
      const a = swingAngle(p, 1.25, 1.6);
      strikeSmear(g, p, 54, 46, 30, -1.9, 0.5, 6);
      pivot(g, 54, 46, a, () => {
        stick(g, 54, 54, 66, 16, 3.2, WOOD, 1.8);
        stick(g, 55.5, 49, 57, 44, 3.6, LEATHER_DARK, 1.2);
        // Warhammer head: a square face and a back spike.
        poly(g, [58, 13, 72, 9, 74.5, 19, 61, 23], STEEL, { outline: 1.8 });
        poly(g, [72, 10.5, 79, 12, 74, 18], STEEL_DARK, { outline: 1.5 });
        rivets(g, [64, 15, 68, 14.5], 0.7);
        glint(g, 60, 13.5, 70, 10.5, 0.9);
        if (isAttack(p) && p.swing > 0) glow(g, 68, 16, 16, '#fff6c0', 0.75);
      });
      torso(g, 39, 40, 20, 25, STEEL, { box: [38, 39, 60, 65] });
      tabard(g, 41, 44, 16, 18);
      detail(g, (ctx) => {
        ctx.fillStyle = '#efe4c8';
        ctx.fillRect(47.8, 46, 2.6, 11);
        ctx.fillRect(44.5, 49, 9.2, 2.6);
      });
      head(g, 48, 31, 'great');
      arm(g, 52, 44, 54 + Math.sin(a) * 2, 48, STEEL, STEEL_DARK, 1);
      // Kite shield on the near arm.
      shield(g, 36, 55, 0.68, 'pale');
    });
  },
  [Kind.Archer]: (g, p) => {
    legs(g, p, { color: '#6b5236' });
    upper(g, p, () => {
      const atk = isAttack(p);
      const draw = atk ? (p.swing < 0 ? -p.swing * 9 : p.swing < 0.6 ? 0 : 0) : p.pose === 'idle' ? Math.max(0, wave(p)) * 2 : 0;
      // Quiver with fletching on the back.
      pivot(g, 34, 46, -0.35, () => {
        rect(g, 29, 36, 8, 25, 3, LEATHER, { outline: 1.8 });
        stick(g, 31, 36, 30, 29, 1.3, WOOD_DARK, 0.8);
        stick(g, 34, 36, 35, 28, 1.3, WOOD_DARK, 0.8);
        poly(g, [28.5, 30, 30, 26, 32, 30], CLOTH, { outline: 0.9, flat: true, team: true, trim: false });
        poly(g, [33.5, 29, 35, 25, 37, 29], CLOTH, { outline: 0.9, flat: true, team: true, trim: false });
      });
      torso(g, 40, 42, 16, 22, LEATHER);
      tabard(g, 42, 45, 12, 15);
      head(g, 47, 33, 'hood');
      const loosed = atk && p.swing > 0;
      bow(g, 59, 47, 20, loosed ? -1 : draw, WOOD, !loosed);
      arm(g, 49, 45, 66, 46, LEATHER, SKIN, 0.4);
      arm(g, 47, 45, 58 - draw, 47, LEATHER, SKIN, 1.4);
      if (loosed && p.swing >= 0.95) paint(g, (ctx) => {
        ctx.strokeStyle = 'rgba(255,241,207,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(70, 45);
        ctx.lineTo(92, 44);
        ctx.stroke();
      });
    });
  },
  [Kind.Ranger]: (g, p) => {
    legs(g, p, { color: GREEN_DARK });
    upper(g, p, () => {
      const atk = isAttack(p);
      const draw = atk ? (p.swing < 0 ? -p.swing * 11 : 0) : 0;
      // A long cloak that billows behind.
      const flow = p.pose === 'walk' ? 4 + wave(p, 2) * 1.5 : wave(p) * 1.5;
      smooth(g, [40, 37, 50, 37, 52, 52, 48, 70, 40, 74, 30 - flow, 76, 26 - flow, 66, 33 - flow * 0.4, 50], CLOTH, { team: true, box: [26, 37, 52, 76] });
      folds(g, (ctx) => {
        ctx.moveTo(38, 44);
        ctx.quadraticCurveTo(34, 58, 32 - flow, 72);
        ctx.moveTo(44, 44);
        ctx.quadraticCurveTo(42, 58, 40 - flow * 0.5, 72);
      });
      torso(g, 40, 42, 15, 22, GREEN);
      stick(g, 41, 44, 54, 58, 2.2, LEATHER_DARK, 1);
      head(g, 47, 33, 'cowl');
      const loosed = atk && p.swing > 0;
      bow(g, 61, 46, 28, loosed ? -1 : draw, WOOD_DARK, !loosed);
      arm(g, 50, 45, 72, 45, GREEN, SKIN, 0.3);
      arm(g, 48, 45, 61 - draw, 46, GREEN, SKIN, 1.4);
      if (atk && p.swing < 0) glow(g, 72, 45, 7, '#c8ffd8', 0.65);
      if (loosed && p.swing >= 0.95) paint(g, (ctx) => {
        ctx.strokeStyle = 'rgba(200,255,216,0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(76, 44);
        ctx.lineTo(95, 43);
        ctx.stroke();
      });
    });
  },
  [Kind.Herald]: (g, p) => {
    legs(g, p, { color: '#6b5236' });
    upper(g, p, () => {
      const atk = isAttack(p);
      const raise = atk ? (p.swing < 0 ? p.swing * 3 : -p.swing * 4) : 0;
      const sway = (p.pose === 'walk' ? Math.sin(p.t * TAU) * 1.5 : 0) + (atk ? p.swing * 2.5 : 0);
      const px = 61 + sway * 0.3;
      // Banner pole and finial.
      stick(g, 61, 82 + raise, px, 2 + raise, 3.2, WOOD, 1.8);
      circle(g, px, 1.5 + raise, 3, BRASS, { outline: 1.6 });
      stick(g, px, 6 + raise, px + 28 + sway, 6 + raise, 2, WOOD_DARK, 1.2);
      // The banner breathes: a travelling wave down its fly.
      const ph = p.t * TAU;
      const amp = p.pose === 'walk' ? 2.6 : 1.8;
      const wv = (u: number) => Math.sin(ph - u * 3.2) * amp * u;
      const top = 7 + raise;
      const bot = 36 + raise;
      part(g, () => {
        const c = g.ctx;
        c.moveTo(px, top);
        for (let i = 1; i <= 6; i++) {
          const u = i / 6;
          c.lineTo(px + u * (27 + sway), top + wv(u));
        }
        // Swallowtail fly.
        c.lineTo(px + 27 + sway + wv(1) * 0.4, bot - 9 + wv(1));
        c.lineTo(px + 19 + sway, bot - 13 + wv(0.8));
        c.lineTo(px + 26 + sway, bot + wv(1));
        for (let i = 6; i >= 0; i--) {
          const u = i / 6;
          c.lineTo(px + u * (25 + sway), bot - (u > 0.75 ? 0 : 0) + wv(u) * 1.1 - (u === 1 ? 0 : 0));
        }
        c.closePath();
      }, CLOTH, { team: true, box: [px, top - 3, px + 28, bot + 3] });
      // A device on the banner: an ink tower, and folds that ride the wave.
      detail(g, (ctx) => {
        const cx = px + 12;
        const cy = (top + bot) / 2 + wv(0.45);
        ctx.fillStyle = 'rgba(34,24,15,0.8)';
        ctx.fillRect(cx - 3.5, cy - 4, 7, 10);
        ctx.fillRect(cx - 5, cy - 7, 2.4, 3.5);
        ctx.fillRect(cx - 1.2, cy - 7, 2.4, 3.5);
        ctx.fillRect(cx + 2.6, cy - 7, 2.4, 3.5);
      });
      folds(g, (ctx) => {
        for (const u of [0.35, 0.7]) {
          ctx.moveTo(px + u * 26, top + 2 + wv(u));
          ctx.lineTo(px + u * 26 + 1, bot - 2 + wv(u));
        }
      });
      // Long coat.
      smooth(g, [37, 42, 57, 42, 60, 72, 48, 75, 34, 72], CLOTH, { box: [34, 42, 60, 75] });
      tabard(g, 41, 44, 12, 18);
      head(g, 47, 33, 'none');
      // Horn at the hip, the free hand on the pole.
      curve(g, 38, 58, 34, 64, 40, 66, 3, BONE, 1.4);
      arm(g, 51, 45, 60, 46 + raise, CLOTH, SKIN, 1);
    });
  },
  [Kind.Wizard]: (g, p) => {
    upper(g, { ...p, bob: p.bob * 0.5 }, () => {
      const atk = isAttack(p);
      const hem = p.pose === 'walk' ? Math.sin(p.t * TAU) * 2.5 : wave(p) * 0.8;
      // Robe: flared, team-dyed with a stitched hem.
      smooth(g, [37, 42, 56, 42, 60, 62, 64 + hem, 84, 46, 86, 28 + hem, 84, 33, 62], ROBE_BLUE, { box: [28, 42, 64, 86] });
      part(g, () => {
        const c = g.ctx;
        c.moveTo(30 + hem * 0.9, 78);
        c.lineTo(62 + hem * 0.9, 78);
        c.lineTo(64 + hem, 84);
        c.quadraticCurveTo(46, 87, 28 + hem, 84);
        c.closePath();
      }, CLOTH, { team: true, outline: 1.6, box: [28, 78, 64, 86], trim: 'edge' });
      part(g, () => {
        const c = g.ctx;
        c.moveTo(44, 43);
        c.lineTo(50, 43);
        c.lineTo(53, 78);
        c.lineTo(41, 78);
        c.closePath();
      }, CLOTH, { team: true, outline: 1.5, box: [41, 43, 53, 78] });
      detail(g, (ctx) => {
        ctx.strokeStyle = 'rgba(239,228,200,0.6)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([1.4, 1.4]);
        ctx.beginPath();
        ctx.moveTo(31 + hem, 81);
        ctx.lineTo(62 + hem, 81);
        ctx.stroke();
      });
      stick(g, 38, 60, 56, 60, 2.4, LEATHER_DARK, 1.2);
      const a = swingAngle(p, 0.55, 0.75);
      const charge = atk && p.swing < 0 ? -p.swing : 0;
      pivot(g, 54, 48, a, () => {
        stick(g, 58, 84, 63, 18, 3, WOOD_DARK, 1.8);
        curve(g, 63, 18, 67, 12, 62, 9, 2.6, WOOD_DARK, 1.6);
        const flick = p.pose === 'idle' ? 0.8 + wave(p, 2) * 0.2 : 1;
        glow(g, 63, 12, (12 + charge * 12) * flick, EMBER, 0.85);
        circle(g, 63, 12, 4.2, '#ffcf7a', { outline: 1.6, flat: true });
        glow(g, 63, 12, 4, '#fff1cf', 0.9);
        if (p.pose === 'idle' || charge > 0) {
          // Sparks spiral up from the orb.
          paint(g, (ctx) => {
            ctx.fillStyle = 'rgba(255,200,120,0.95)';
            for (let i = 0; i < 3; i++) {
              const q = (p.t + i / 3) % 1;
              ctx.beginPath();
              ctx.arc(63 + Math.sin(q * TAU * 1.5 + i) * 5, 10 - q * 12, 0.9 + (1 - q) * 0.6, 0, TAU);
              ctx.fill();
            }
          });
        }
      });
      head(g, 46, 34, 'wizard', p);
      arm(g, 50, 46, 60 + Math.sin(a) * 4, 50 - Math.sin(a) * 2, ROBE_BLUE, SKIN, 1);
      if (atk && p.swing >= 0.95) glow(g, 76, 20, 16, EMBER, 0.9);
    });
  },
  [Kind.Sapper]: (g, p) => {
    legs(g, p, { color: '#6b5236' });
    upper(g, p, () => {
      // A powder keg on the back with a lit fuse.
      ellipse(g, 32, 54, 8, 10, 0, WOOD, { box: [24, 44, 40, 64] });
      stick(g, 24.5, 49, 39.5, 49, 1.8, IRON, 1);
      stick(g, 24.5, 59, 39.5, 59, 1.8, IRON, 1);
      curve(g, 32, 44, 30, 40, 33, 37, 1.4, '#cfc4ad', 0.8);
      const spark = p.pose === 'idle' ? 0.6 + Math.abs(wave(p, 2)) * 0.5 : 0.8;
      glow(g, 33, 36.5, 5 * spark + 2, EMBER, 0.95);
      glow(g, 33, 36.5, 1.6, '#fff1cf', 1);
      arm(g, 45, 44, 38, 54, LEATHER, SKIN, -1);
      torso(g, 39, 42, 18, 23, LEATHER);
      tabard(g, 41, 45, 14, 15);
      // Soot on the face, goggles on the helm.
      head(g, 48, 33, 'kettle');
      detail(g, (ctx) => {
        ctx.fillStyle = 'rgba(34,24,15,0.3)';
        ctx.beginPath();
        ctx.arc(52, 37, 2.5, 0, TAU);
        ctx.fill();
      });
      const a = swingAngle(p, 1.3, 1.6);
      strikeSmear(g, p, 54, 46, 30, -1.6, 0.6, 5);
      pivot(g, 54, 46, a, () => {
        stick(g, 44, 70, 66, 22, 3.6, WOOD, 1.8);
        // A miner's pick.
        part(g, () => {
          const c = g.ctx;
          c.moveTo(55, 26);
          c.quadraticCurveTo(66, 15, 82, 20);
          c.lineTo(80, 22.5);
          c.quadraticCurveTo(67, 21, 58, 29);
          c.closePath();
        }, STEEL_DARK, { outline: 1.7, box: [55, 15, 82, 29] });
        glint(g, 60, 23, 70, 18, 0.8);
      });
      arm(g, 51, 44, 55 + Math.sin(a) * 3, 46, LEATHER, SKIN, 1);
    });
  },
  [Kind.Trebuchet]: (g, p) => {
    // 128 cell: a wheeled siege engine with a counterweighted throwing arm.
    const roll = p.pose === 'walk' ? p.t * TAU * 0.5 : 0;
    const jolt = p.pose === 'walk' ? Math.abs(Math.sin(p.t * TAU * 2)) * -1 : 0;
    g.ctx.save();
    g.ctx.translate(0, jolt);
    // Rear wheel and frame.
    const wheel = (wx: number, shade: number) => {
      circle(g, wx, 103, 10.5, tone(WOOD_DARK, shade));
      circle(g, wx, 103, 7.5, tone(WOOD, shade), { outline: 1.4 });
      lines(g, 2, tone(WOOD_DARK, shade - 0.1), (ctx) => {
        for (let i = 0; i < 3; i++) {
          const a = roll + (i * Math.PI) / 3;
          ctx.moveTo(wx - Math.cos(a) * 7, 103 - Math.sin(a) * 7);
          ctx.lineTo(wx + Math.cos(a) * 7, 103 + Math.sin(a) * 7);
        }
      });
      circle(g, wx, 103, 2.4, IRON, { outline: 1.2, flat: true });
      rivets(g, [wx - 9.5, 103, wx + 9.5, 103, wx, 93.5, wx, 112.5], 0.7);
    };
    wheel(40, -0.2);
    wheel(88, -0.2);
    poly(g, [22, 97, 106, 97, 102, 89, 26, 89], WOOD_DARK, { box: [22, 89, 106, 97] });
    lines(g, 0.8, 'rgba(34,24,15,0.4)', (ctx) => {
      for (let x = 30; x < 102; x += 9) {
        ctx.moveTo(x, 90);
        ctx.lineTo(x + 2, 96);
      }
    });
    // A-frame uprights with cross bracing.
    poly(g, [44, 92, 62, 38, 68, 38, 52, 92], WOOD, { box: [44, 38, 68, 92] });
    poly(g, [86, 92, 66, 38, 72, 38, 94, 92], WOOD, { box: [66, 38, 94, 92] });
    stick(g, 50, 74, 88, 74, 3, WOOD_DARK, 1.6);
    rivets(g, [53, 74, 85, 74, 66, 40, 70, 40], 0.8);
    // Arm: cocked back (low), released (thrown up and over).
    const idleSway = p.pose === 'idle' ? wave(p) * 0.04 : p.pose === 'walk' ? Math.sin(p.t * TAU) * 0.05 : 0;
    const cock = isAttack(p) ? (p.swing < 0 ? 0.55 - p.swing * 0.35 : 0.9 - p.swing * 2.1) : 0.6 + idleSway;
    pivot(g, 67, 40, cock, () => {
      stick(g, 67, 40, 114, 40, 5, WOOD, 1.8);
      stick(g, 67, 40, 46, 40, 6, WOOD, 1.8);
      lines(g, 1, 'rgba(34,24,15,0.5)', (ctx) => {
        for (const x of [78, 92, 104]) {
          ctx.moveTo(x, 37.4);
          ctx.lineTo(x, 42.6);
        }
      });
      // Counterweight box, iron-strapped.
      rect(g, 33, 40, 18, 17, 2.5, WOOD_DARK, { box: [33, 40, 51, 57] });
      stick(g, 33.5, 48.5, 50.5, 48.5, 2, IRON, 1);
      rivets(g, [36, 43, 48, 43, 36, 54, 48, 54], 0.7);
      // Sling and stone.
      const sw = p.pose === 'idle' ? wave(p, 1, 0.25) * 2 : 0;
      curve(g, 114, 40, 118 + sw, 52, 108 + sw, 58, 1.2, '#cfc4ad', 0.8);
      if (p.swing <= 0) circle(g, 108 + sw, 61, 5.5, '#8d8a82');
    });
    circle(g, 67, 40, 4.2, IRON, { outline: 1.8 });
    // A team pennant on a pole at the rear.
    stick(g, 26, 90, 26, 52, 2.6, WOOD_DARK, 1.4);
    const fl = (u: number) => Math.sin(p.t * TAU - u * 3) * 2 * u;
    part(g, () => {
      const c = g.ctx;
      c.moveTo(27, 53);
      c.quadraticCurveTo(38, 54 + fl(0.5), 50, 58 + fl(1));
      c.quadraticCurveTo(38, 62 + fl(0.5), 27, 68);
      c.closePath();
    }, CLOTH, { team: true, outline: 1.6, box: [27, 53, 50, 68] });
    g.ctx.restore();
  },
  [Kind.Outrider]: (g, p) => {
    horse(g, p, { barding: false, color: HORSE, mane: '#2e2118' });
    upper(g, p, () => {
      stick(g, 62, 60, 60, 76, 5, LEATHER_DARK, 1.8);
      // Short riding cloak streaming behind.
      cape(g, p, 57, 43, 14, 12);
      torso(g, 55, 42, 15, 20, LEATHER);
      tabard(g, 57, 45, 11, 13);
      head(g, 63, 32, 'hood');
      const a = swingAngle(p, 1.4, 1.8);
      strikeSmear(g, p, 66, 48, 26, -1.8, 0.7, 5);
      pivot(g, 66, 48, a, () => {
        // A curved sabre.
        part(g, () => {
          const c = g.ctx;
          c.moveTo(66, 46);
          c.quadraticCurveTo(84, 42, 94, 26);
          c.quadraticCurveTo(88, 40, 67, 49.5);
          c.closePath();
        }, STEEL, { outline: 1.6, box: [66, 26, 94, 50] });
        lines(g, 0.8, 'rgba(255,241,207,0.9)', (ctx) => {
          ctx.moveTo(70, 46);
          ctx.quadraticCurveTo(84, 41, 91, 30);
        });
        stick(g, 65, 43, 67, 52, 2.2, BRASS, 1);
      });
      arm(g, 62, 46, 66, 48, LEATHER, SKIN, 1);
    });
  },
  [Kind.GriffinRider]: (g, p) => {
    // 128 cell; the creature hovers (renderer lifts it), feet line at y=114.
    const y0 = 70 + Math.sin(p.flap * TAU) * 1.5;
    const ruffle = p.t;
    wing(g, 62, y0 - 6, p.flap + 0.08, 50, FEATHER, false, true, ruffle);
    // Lion hindquarters and tufted tail, flicking.
    const flick = Math.sin(p.t * TAU * 2) * 4;
    curve(g, 34, y0 + 4, 16, y0 + 2 + flick * 0.3, 12, y0 + 14 + flick, 3.4, '#b89a68', 1.8);
    smooth(g, [9, y0 + 12 + flick, 15, y0 + 13 + flick, 14, y0 + 20 + flick, 9, y0 + 19 + flick], '#6b5435', { outline: 1.6 });
    stick(g, 40, y0 + 14, 33, y0 + 26, 6, '#a8895a', 1.8);
    smooth(g, [30, y0 - 4, 54, y0 - 8, 76, y0 - 2, 74, y0 + 16, 50, y0 + 20, 32, y0 + 14], '#c8a66e', { box: [30, y0 - 8, 76, y0 + 20] });
    // Talons tucked.
    stick(g, 70, y0 + 12, 78, y0 + 25, 4, '#d8b25a', 1.6);
    poly(g, [75, y0 + 24, 82, y0 + 26, 78, y0 + 29], '#2b2119', { outline: 1, flat: true });
    // Eagle breast and head, with ruffled neck feathers.
    smooth(g, [62, y0 - 12, 80, y0 - 18, 92, y0 - 8, 86, y0 + 8, 70, y0 + 10], FEATHER, { box: [62, y0 - 18, 92, y0 + 10] });
    lines(g, 0.9, 'rgba(34,24,15,0.4)', (ctx) => {
      for (let i = 0; i < 4; i++) {
        const r = Math.sin(ruffle * TAU + i * 1.7) * 1.2;
        ctx.moveTo(78 + i * 3, y0 - 6 + i * 2);
        ctx.quadraticCurveTo(80 + i * 3 + r, y0 - 3 + i * 2, 77 + i * 3, y0 - 1 + i * 2);
      }
    });
    const look = p.pose === 'attack' ? 0.2 : Math.sin(p.t * TAU) * 0.08;
    pivot(g, 86, y0 - 12, look, () => {
      smooth(g, [80, y0 - 10, 82, y0 - 20, 92, y0 - 23, 98, y0 - 17, 96, y0 - 9, 88, y0 - 6], FEATHER, { box: [80, y0 - 23, 98, y0 - 6] });
      const gape = p.pose === 'attack' ? Math.max(0, p.swing) * 3 : 0;
      poly(g, [96, y0 - 19, 107, y0 - 15, 101, y0 - 11 - gape * 0.2, 96, y0 - 13], GOLD, { outline: 1.6 });
      if (gape > 0) poly(g, [96, y0 - 12, 102, y0 - 10 + gape, 96, y0 - 9 + gape], GOLD, { outline: 1.4 });
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(93, y0 - 17, 1.7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = LIGHT;
        ctx.beginPath();
        ctx.arc(92.5, y0 - 17.6, 0.5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(89, y0 - 19.5);
        ctx.lineTo(96, y0 - 18.5);
        ctx.stroke();
      });
      // Ear tufts that lift with the ruffle.
      poly(g, [82, y0 - 18, 78, y0 - 26 - Math.sin(ruffle * TAU) * 1.5, 86, y0 - 21], FEATHER, { outline: 1.4 });
    });
    // Rider on a team saddle cloth.
    smooth(g, [48, y0 - 12, 70, y0 - 13, 72, y0 - 4, 50, y0 - 3], CLOTH, { team: true, box: [48, y0 - 13, 72, y0 - 3] });
    upper(g, { ...p, bob: 0 }, () => {
      stick(g, 60, y0 - 16, 64, y0 - 4, 5, LEATHER_DARK, 1.8);
      torso(g, 54, y0 - 34, 13, 20, STEEL_DARK);
      tabard(g, 55, y0 - 31, 11, 12);
      head(g, 61, y0 - 41, 'sallet');
      const a = swingAngle(p, 1, 1.5);
      strikeSmear(g, p, 64, y0 - 26, 34, -1.4, 0.4, 4);
      pivot(g, 64, y0 - 26, a, () => spear(g, 66, y0 - 24, -0.68, 0, 14, 26, 2.6));
      arm(g, 60, y0 - 30, 66, y0 - 24, STEEL_DARK, STEEL_DARK, 1);
    });
    wing(g, 68, y0 - 4, p.flap, 58, FEATHER, false, false, ruffle + 0.3);
  },
  [Kind.Skeleton]: (g, p) => {
    // A rattle: bones jitter a hair on every frame.
    const jit = p.pose === 'idle' ? wave(p, 3) * 0.6 : 0;
    legs(g, p, { color: BONE, boot: BONE_DARK, w: 3.4 });
    upper(g, p, () => {
      g.ctx.save();
      g.ctx.translate(jit, 0);
      arm(g, 45, 44, 38, 54, BONE, BONE, -1);
      // Spine, ribs, pelvis.
      stick(g, 48, 42, 48, 62, 3.4, BONE, 1.6);
      for (let i = 0; i < 4; i++) curve(g, 41, 45 + i * 4, 48, 42 + i * 4, 56, 45 + i * 4, 2.2, BONE, 1.3);
      smooth(g, [42, 60, 54, 60, 56, 65, 48, 67, 40, 65], BONE_DARK, { outline: 1.6 });
      // A rotten team rag of a loincloth.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(40, 62);
        c.lineTo(56, 62);
        c.lineTo(57, 70);
        c.lineTo(53, 67);
        c.lineTo(50, 72);
        c.lineTo(46, 67);
        c.lineTo(42, 71);
        c.lineTo(39, 67);
        c.closePath();
      }, CLOTH, { team: true, outline: 1.6, box: [39, 62, 57, 72] });
      head(g, 48, 33, 'skull', p);
      const a = swingAngle(p, 1.2, 1.5);
      strikeSmear(g, p, 52, 46, 28, -1.7, 0.5, 5);
      pivot(g, 52, 46, a, () => {
        // A notched, rusty falchion.
        part(g, () => {
          const c = g.ctx;
          c.moveTo(57, 43);
          c.lineTo(73, 22);
          c.quadraticCurveTo(80, 22, 76, 30);
          c.lineTo(60, 46);
          c.closePath();
        }, '#9c8f7c', { outline: 1.6, box: [57, 22, 80, 46] });
        detail(g, (ctx) => {
          ctx.fillStyle = 'rgba(138,74,32,0.6)';
          ctx.beginPath();
          ctx.arc(66, 34, 2, 0, TAU);
          ctx.arc(71, 29, 1.4, 0, TAU);
          ctx.fill();
        });
        stick(g, 55, 42, 61, 47, 2.4, IRON, 1.2);
      });
      arm(g, 52, 44, 57, 46, BONE, BONE, 1);
      // A cracked round shield.
      circle(g, 39, 54, 8.5, WOOD_DARK, { outline: 1.8 });
      lines(g, 1, INK, (ctx) => {
        ctx.moveTo(33, 50);
        ctx.lineTo(37, 54);
        ctx.lineTo(35, 58);
      });
      circle(g, 39, 54, 2.4, IRON, { outline: 1.2, flat: true });
      g.ctx.restore();
    });
  },
  [Kind.BoneGolem]: (g, p) => {
    // 128 cell, feet at 114: a hulk of fused bones.
    const s = p.pose === 'walk' ? Math.sin(p.t * TAU) : 0;
    const lift = (ph: number) => (p.pose === 'walk' ? Math.max(0, Math.cos(p.t * TAU + ph)) * 4 : 0);
    const foot = (x: number, y: number, c: string) => smooth(g, [x - 8, y - 4, x + 6, y - 6, x + 11, y, x - 9, y + 1], c, { outline: 2 });
    stick(g, 52, 84, 46 - s * 8, 108 - lift(Math.PI), 12, BONE_DARK, 2.2);
    foot(46 - s * 8, 111 - lift(Math.PI), BONE_DARK);
    stick(g, 72, 84, 78 + s * 8, 108 - lift(0), 12, BONE, 2.2);
    foot(78 + s * 8, 111 - lift(0), BONE);
    upper(g, { ...p, bob: p.bob * 1.4 }, () => {
      const a = swingAngle(p, 0.9, 1.2);
      pivot(g, 40, 52, -a * 0.4, () => {
        stick(g, 40, 52, 30, 90, 11, BONE_DARK, 2.2);
        smooth(g, [22, 88, 34, 86, 38, 96, 30, 102, 20, 98], BONE_DARK);
      });
      // Ribcage torso with a soul-fire inside.
      smooth(g, [34, 48, 54, 36, 82, 40, 92, 62, 84, 86, 56, 92, 36, 80], BONE, { box: [34, 36, 92, 92] });
      glow(g, 62, 68, 18 + (p.pose === 'idle' ? wave(p) * 4 : 0), SPIRIT, 0.6);
      lines(g, 3, INK, (ctx) => {
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(48, 54 + i * 8);
          ctx.quadraticCurveTo(64, 48 + i * 8, 80, 56 + i * 8);
        }
      });
      lines(g, 1.4, 'rgba(239,228,200,0.6)', (ctx) => {
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(49, 51.5 + i * 8);
          ctx.quadraticCurveTo(64, 45.5 + i * 8, 79, 53.5 + i * 8);
        }
      });
      // A tattered team banner wrapped round the hip.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(36, 74);
        c.quadraticCurveTo(60, 80, 86, 74);
        c.lineTo(84, 92);
        c.lineTo(76, 88);
        c.lineTo(70, 96);
        c.lineTo(60, 90);
        c.lineTo(50, 97);
        c.lineTo(44, 89);
        c.lineTo(36, 93);
        c.closePath();
      }, CLOTH, { team: true, box: [36, 74, 86, 97] });
      // Skull-head, hunched low, with fused horns.
      curve(g, 74, 32, 70, 22, 76, 18, 4, BONE_DARK, 1.8);
      smooth(g, [68, 36, 74, 26, 88, 26, 94, 36, 92, 48, 80, 50, 70, 46], BONE, { box: [68, 26, 94, 50] });
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(84, 36, 3.4, 3, 0, 0, TAU);
        ctx.ellipse(77, 36, 2.6, 3, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(76, 44, 15, 2.4);
        for (let i = 0; i < 4; i++) ctx.fillRect(78 + i * 3.4, 42, 1, 5);
      });
      const pulse = p.pose === 'idle' ? 0.75 + wave(p, 2) * 0.25 : 0.95;
      glow(g, 84, 36, 9, SPIRIT, pulse);
      glow(g, 77, 36, 7, SPIRIT, pulse * 0.85);
      strikeSmear(g, p, 86, 54, 40, -1.2, 1.4, 8);
      pivot(g, 86, 54, a, () => {
        stick(g, 86, 54, 100, 86, 12, BONE, 2.2);
        // A club-fist of knuckle bones.
        smooth(g, [94, 84, 106, 82, 112, 92, 106, 100, 94, 98], BONE, { box: [94, 82, 112, 100] });
        lines(g, 1, INK, (ctx) => {
          ctx.moveTo(100, 86);
          ctx.lineTo(102, 96);
          ctx.moveTo(106, 86);
          ctx.lineTo(107, 94);
        });
      });
    });
  },
  [Kind.Mercenary]: (g, p) => {
    legs(g, p, { color: '#7b3b2a' });
    upper(g, p, () => {
      const a = swingAngle(p, 1.2, 1.4);
      const idle = p.pose === 'idle';
      pivot(g, 44, 48, idle ? -0.5 : -a * 0.7, () => {
        blade(g, 44, 50, 25, 32, 3);
        stick(g, 42, 48, 46, 53, 2.2, BRASS, 1);
      });
      arm(g, 44, 44, 44, 50, CLOTH, SKIN, -1);
      // Slashed doublet: puffed sleeves showing the army's cloth.
      torso(g, 40, 42, 17, 22, '#7b3b2a');
      lines(g, 1.6, '#e6dccb', (ctx) => {
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(43 + i * 5, 45);
          ctx.lineTo(44 + i * 5, 57);
        }
      });
      tabard(g, 42, 45, 13, 10, LEATHER);
      head(g, 48, 33, 'beret', p);
      strikeSmear(g, p, 54, 48, 26, -1.5, 0.5, 5);
      pivot(g, 54, 48, a, () => {
        blade(g, 54, 50, 78, 30, 3.2);
        stick(g, 51, 47, 57, 54, 2.4, BRASS, 1);
      });
      // Idle: flipping a gold coin.
      if (idle) {
        const h = Math.sin(p.t * Math.PI);
        const cy = 40 - h * 14;
        const squash = Math.abs(Math.cos(p.t * TAU * 2));
        arm(g, 50, 46, 58, 46 - h * 2, CLOTH, SKIN, 1);
        detail(g, (ctx) => {
          ctx.fillStyle = INK;
          ctx.beginPath();
          ctx.ellipse(60, cy, 2.6, 2.6 * squash + 0.6, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          ctx.ellipse(60, cy, 1.8, 1.8 * squash + 0.3, 0, 0, TAU);
          ctx.fill();
        });
        glow(g, 60, cy, 3, GOLD_HI, 0.6);
      } else {
        arm(g, 50, 46, 55 + Math.sin(a) * 2, 49, CLOTH, SKIN, 1);
      }
    });
  },
  [Kind.Troll]: (g, p) => {
    // 128 cell, hunched and huge.
    const s = p.pose === 'walk' ? Math.sin(p.t * TAU) : 0;
    const lift = (ph: number) => (p.pose === 'walk' ? Math.max(0, Math.cos(p.t * TAU + ph)) * 4 : 0);
    stick(g, 54, 84, 48 - s * 8, 106 - lift(Math.PI), 13, TROLL_DARK, 2.2);
    smooth(g, [38 - s * 8, 104 - lift(Math.PI), 54 - s * 8, 103 - lift(Math.PI), 60 - s * 8, 112 - lift(Math.PI), 38 - s * 8, 112 - lift(Math.PI)], TROLL_DARK);
    stick(g, 70, 84, 76 + s * 8, 106 - lift(0), 13, TROLL, 2.2);
    smooth(g, [68 + s * 8, 104 - lift(0), 84 + s * 8, 103 - lift(0), 90 + s * 8, 112 - lift(0), 68 + s * 8, 112 - lift(0)], TROLL);
    upper(g, { ...p, bob: p.bob * 1.4 }, () => {
      // Idle: scratches its head with the free hand.
      const idle = p.pose === 'idle';
      const scratch = idle ? Math.sin(p.t * TAU * 2) : 0;
      if (!idle) stick(g, 44, 54, 34, 82, 10, TROLL_DARK, 2.2);
      // Hunched back with warts and moss.
      smooth(g, [30, 66, 38, 44, 58, 36, 80, 42, 88, 62, 82, 84, 56, 90, 36, 84], TROLL, { box: [30, 36, 88, 90] });
      detail(g, (ctx) => {
        ctx.fillStyle = 'rgba(43,58,92,0.25)';
        for (const [x, y, r] of [[44, 52, 2.4], [54, 46, 1.8], [40, 64, 1.6]] as const) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#5f7a3a';
        ctx.beginPath();
        ctx.ellipse(50, 41, 7, 3, -0.3, 0, TAU);
        ctx.fill();
      });
      // A team loincloth on a rope.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(36, 76);
        c.quadraticCurveTo(60, 82, 84, 76);
        c.lineTo(80, 96);
        c.lineTo(70, 92);
        c.lineTo(60, 98);
        c.lineTo(48, 92);
        c.lineTo(38, 95);
        c.closePath();
      }, CLOTH, { team: true, box: [36, 76, 84, 98] });
      stick(g, 35, 77, 85, 76, 2.6, '#a08a5c', 1.4);
      const a = swingAngle(p, 1.3, 1.7);
      strikeSmear(g, p, 74, 56, 50, -1.5, 0.8, 9);
      pivot(g, 74, 56, a, () => {
        stick(g, 74, 56, 96, 72, 10, TROLL, 2.2);
        // A tree-trunk club, studded with nails.
        part(g, () => {
          const c = g.ctx;
          c.moveTo(91, 74);
          c.quadraticCurveTo(98, 50, 104, 28);
          c.quadraticCurveTo(112, 20, 120, 27);
          c.quadraticCurveTo(114, 52, 101, 77);
          c.closePath();
        }, WOOD, { box: [91, 20, 120, 77] });
        lines(g, 1, 'rgba(34,24,15,0.45)', (ctx) => {
          ctx.moveTo(105, 34);
          ctx.quadraticCurveTo(102, 50, 97, 66);
          ctx.moveTo(112, 30);
          ctx.quadraticCurveTo(108, 46, 103, 60);
        });
        for (const [x, y] of [[110, 28], [115, 36], [106, 42], [111, 46]] as const) poly(g, [x, y, x + 6, y - 2.5, x + 1.5, y + 2.5], STEEL, { outline: 1.1, flat: true });
        circle(g, 96, 72, 6, TROLL, { outline: 2 });
      });
      // Head, low and forward: tusks, a heavy brow, a glint of eye.
      circle(g, 86, 47, 12.5, TROLL);
      smooth(g, [76, 42, 88, 36, 99, 40, 96, 45, 84, 44], TROLL_DARK, { outline: 1.8 });
      detail(g, (ctx) => {
        ctx.fillStyle = '#ffde59';
        ctx.beginPath();
        ctx.arc(91, 46.5, 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(91.5, 46.5, 0.9, 0, TAU);
        ctx.fill();
        ctx.fillRect(84, 54, 13, 2.4);
      });
      poly(g, [92, 55, 97, 45, 96, 56], BONE, { outline: 1.3 });
      poly(g, [85, 55, 88, 48, 89, 55.5], BONE, { outline: 1.3 });
      poly(g, [76, 40, 72, 35, 79, 37], TROLL, { outline: 1.5 });
      if (idle) {
        // The near arm reaches up to scratch behind the ear.
        arm(g, 50, 48, 72 + scratch * 2, 38 + scratch, TROLL_DARK, TROLL_DARK, 1);
        lines(g, 1, INK, (ctx) => {
          ctx.moveTo(70, 33 + scratch);
          ctx.lineTo(68, 30 + scratch);
          ctx.moveTo(74, 32 + scratch);
          ctx.lineTo(74, 29 + scratch);
        });
      }
    });
  },
  [Kind.Berserker]: (g, p) => {
    legs(g, p, { color: '#6b4428' });
    // Shaking with fury at rest.
    const shake = p.pose === 'idle' ? (p.t * 4) % 2 < 1 ? 0.5 : -0.5 : 0;
    upper(g, p, () => {
      g.ctx.save();
      g.ctx.translate(shake, 0);
      const a = swingAngle(p, 1.5, 1.8);
      pivot(g, 42, 46, -a * 0.6, () => axe(g, 42, 48, 24, 26));
      arm(g, 44, 44, 42, 48, SKIN, SKIN, -1);
      // Bare, scarred chest with a fur mantle.
      torso(g, 39, 41, 18, 22, SKIN);
      lines(g, 1.8, '#a0332a', (ctx) => {
        ctx.moveTo(42, 46);
        ctx.lineTo(54, 58);
        ctx.moveTo(54, 46);
        ctx.lineTo(44, 54);
      });
      lines(g, 0.8, 'rgba(34,24,15,0.4)', (ctx) => {
        ctx.moveTo(48, 46);
        ctx.quadraticCurveTo(50, 50, 48, 54);
      });
      smooth(g, [36, 41, 46, 38, 58, 41, 56, 46, 46, 45, 38, 47], '#6e5536', { outline: 1.8 });
      // Team kilt.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(38, 58);
        c.lineTo(58, 58);
        c.lineTo(60, 70);
        c.lineTo(53, 67);
        c.lineTo(48, 71);
        c.lineTo(43, 67);
        c.lineTo(36, 70);
        c.closePath();
      }, CLOTH, { team: true, box: [36, 58, 60, 71] });
      stick(g, 38, 58.5, 58, 58.5, 2.6, LEATHER_DARK, 1.2);
      head(g, 48, 32, 'horned');
      if (p.pose === 'idle') paint(g, (ctx) => {
        // Hot breath.
        ctx.fillStyle = 'rgba(239,228,200,0.45)';
        const q = p.t;
        ctx.beginPath();
        ctx.arc(59 + q * 6, 36 - q * 3, 1.5 + q * 2, 0, TAU);
        ctx.fill();
      });
      strikeSmear(g, p, 54, 46, 30, -1.9, 0.6, 6);
      pivot(g, 54, 46, a, () => axe(g, 54, 48, 76, 26));
      arm(g, 52, 44, 54 + Math.sin(a) * 2, 48, SKIN, SKIN, 1);
      g.ctx.restore();
    });
  },
  [Kind.Cleric]: (g, p) => {
    upper(g, { ...p, bob: p.bob * 0.6 }, () => {
      const hem = p.pose === 'walk' ? Math.sin(p.t * TAU) * 2.2 : 0;
      smooth(g, [37, 42, 57, 42, 60, 64, 62 + hem, 84, 47, 86, 32 + hem, 84, 34, 64], CLOTH, { box: [32, 42, 62, 86] });
      folds(g, (ctx) => {
        ctx.moveTo(40, 56);
        ctx.lineTo(36 + hem, 82);
        ctx.moveTo(56, 56);
        ctx.lineTo(59 + hem, 82);
      });
      // Team stole down the front, with an ink cross.
      part(g, () => {
        const c = g.ctx;
        c.moveTo(43, 42);
        c.lineTo(51, 42);
        c.lineTo(52, 84);
        c.lineTo(47, 81);
        c.lineTo(42, 84);
        c.closePath();
      }, CLOTH, { team: true, outline: 1.5, box: [42, 42, 52, 84] });
      detail(g, (ctx) => {
        ctx.fillStyle = 'rgba(239,228,200,0.9)';
        ctx.fillRect(46, 66, 2, 9);
        ctx.fillRect(43.6, 69, 6.8, 2);
      });
      stick(g, 38, 58, 56, 58, 2, '#a08a5c', 1.1);
      head(g, 47, 33, 'coif');
      // The censer swings: pendulum at rest, a wide arc in the blessing.
      const swing = p.pose === 'attack' ? p.swing * 0.9 : p.pose === 'walk' ? Math.sin(p.t * TAU) * 0.35 : wave(p) * 0.45;
      pivot(g, 58, 48, swing, () => {
        stick(g, 58, 48, 60, 68, 0.9, '#cfc6b0', 0.8);
        smooth(g, [56.5, 68, 63.5, 68, 64.5, 73, 60, 76, 55.5, 73], BRASS, { outline: 1.6 });
        glow(g, 60, 72, p.pose === 'attack' ? 22 : 11, '#fff6c8', 0.8);
        paint(g, (ctx) => {
          ctx.strokeStyle = 'rgba(239,228,200,0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(60, 67);
          ctx.bezierCurveTo(56, 62, 64, 58, 59, 52);
          ctx.stroke();
        });
      });
      arm(g, 51, 45, 58, 48, CLOTH, SKIN, 1);
    });
  },
  [Kind.Champion]: (g, p) => {
    legs(g, p, { color: STEEL_DARK, armor: true });
    upper(g, p, () => {
      glow(g, 48, 50, 34, '#ffe08a', 0.3 + (p.pose === 'idle' ? wave(p) * 0.06 : 0));
      // A great team cloak with an ermine collar.
      const flow = p.pose === 'walk' ? 5 + wave(p, 2) * 2 : p.pose === 'attack' ? -p.swing * 3 : wave(p) * 2;
      smooth(g, [40, 40, 54, 40, 52, 60, 48, 80, 34 - flow, 82, 22 - flow * 1.2, 78, 28 - flow * 0.6, 60], CLOTH, { team: true, box: [22, 40, 54, 82] });
      folds(g, (ctx) => {
        ctx.moveTo(40, 46);
        ctx.quadraticCurveTo(34, 62, 30 - flow, 78);
        ctx.moveTo(46, 46);
        ctx.quadraticCurveTo(42, 62, 40 - flow * 0.6, 79);
      });
      smooth(g, [37, 40, 47, 37, 58, 40, 56, 45, 47, 44, 38, 45], '#f2ead8', { outline: 1.6 });
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        for (const x of [41, 47, 53]) ctx.fillRect(x, 41, 1, 2.2);
      });
      torso(g, 39, 43, 20, 22, STEEL, { box: [38, 42, 60, 65] });
      stick(g, 40, 58, 58, 58, 2.6, LEATHER_DARK, 1.2);
      glint(g, 41, 46, 41, 55, 1);
      head(g, 49, 30, 'crown');
      const a = swingAngle(p, 1.3, 1.9);
      strikeSmear(g, p, 55, 46, 42, -2.0, 0.6, 8);
      pivot(g, 55, 46, a, () => {
        // A two-handed greatsword.
        blade(g, 58, 42, 88, 4, 4.4, '#dfe4e8');
        stick(g, 51, 44, 63, 52, 3.2, GOLD, 1.4);
        stick(g, 52, 51, 58, 44, 3, LEATHER_DARK, 1.2);
        circle(g, 51, 53, 2.2, GOLD, { outline: 1.2, flat: true });
        glow(g, 80, 14, 12, '#fff3c2', 0.5);
      });
      arm(g, 52, 45, 55 + Math.sin(a) * 2, 48, STEEL, STEEL_DARK, 1);
    });
  },
  [Kind.Dragon]: (g, p) => {
    // 192 cell, hovering; belly line near y=122, feet line 168.
    const y0 = 108 + Math.sin(p.flap * TAU) * 2;
    const tail = Math.sin(p.t * TAU) * 7;
    wing(g, 96, y0 - 14, p.flap + 0.06, 92, '#7b4d3c', true, true);
    // Tail: an S that swishes, ending in a spade.
    curve(g, 62, y0 + 4, 36, y0 + 20 + tail, 12, y0 + 4 - tail, 10, SCALE, 2.4);
    curve(g, 66, y0 + 8, 40, y0 + 22 + tail, 16, y0 + 8 - tail, 3, '#c9a46a', 0);
    poly(g, [14, y0 + 2 - tail, 2, y0 - 10 - tail, 0, y0 + 6 - tail, 8, y0 + 12 - tail], SCALE_DARK, { outline: 1.8 });
    // Hind leg, tucked, with talons.
    stick(g, 72, y0 + 10, 66, y0 + 32, 10, SCALE_DARK, 2.2);
    for (let i = 0; i < 3; i++) poly(g, [60 + i * 4, y0 + 32, 66 + i * 4, y0 + 33, 63 + i * 4, y0 + 40], BONE_DARK, { outline: 1.3 });
    // Body.
    smooth(g, [54, y0 - 6, 74, y0 - 18, 110, y0 - 18, 130, y0 - 4, 126, y0 + 16, 96, y0 + 24, 64, y0 + 18], SCALE, { box: [54, y0 - 18, 130, y0 + 24] });
    // Belly plates.
    smooth(g, [64, y0 + 10, 96, y0 + 6, 124, y0 + 4, 120, y0 + 16, 96, y0 + 22, 68, y0 + 18], '#c9a46a', { outline: 1.8 });
    lines(g, 1.2, 'rgba(34,24,15,0.5)', (ctx) => {
      for (let i = 0; i < 7; i++) {
        ctx.moveTo(72 + i * 7, y0 + 9 - i * 0.4);
        ctx.lineTo(73 + i * 7, y0 + 19 - i * 0.4);
      }
    });
    // Scale texture: rows of ink crescents.
    lines(g, 0.9, 'rgba(34,24,15,0.4)', (ctx) => {
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 8; i++) {
          const sx = 66 + i * 7 + (r % 2) * 3.5;
          const sy = y0 - 12 + r * 6;
          ctx.moveTo(sx - 3, sy);
          ctx.quadraticCurveTo(sx, sy + 3, sx + 3, sy);
        }
      }
    });
    // The army's pigment worn as a war-paint stripe and a saddle with a banner.
    smooth(g, [70, y0 - 12, 96, y0 - 16, 122, y0 - 8, 118, y0 - 2, 96, y0 - 8, 72, y0 - 5], CLOTH, { team: true, outline: 1.4, strength: 0.75, box: [70, y0 - 16, 122, y0 - 2], trim: false });
    for (let i = 0; i < 6; i++) poly(g, [64 + i * 10, y0 - 15 + i * 0.5, 69 + i * 10, y0 - 27 + Math.abs(i - 2.5) * 1.2, 73 + i * 10, y0 - 15], SCALE_DARK, { outline: 1.5 });
    rect(g, 82, y0 - 26, 22, 10, 3, CLOTH, { team: true, outline: 1.8, box: [82, y0 - 26, 104, y0 - 16] });
    stick(g, 86, y0 - 24, 84, y0 - 60, 2.6, WOOD, 1.4);
    circle(g, 84, y0 - 61, 2.4, BRASS, { outline: 1.2, flat: true });
    const fl = (u: number) => Math.sin(p.t * TAU * 2 - u * 3) * 2.4 * u;
    part(g, () => {
      const c = g.ctx;
      c.moveTo(85, y0 - 58);
      c.quadraticCurveTo(96, y0 - 58 + fl(0.5), 110, y0 - 55 + fl(1));
      c.lineTo(102, y0 - 50 + fl(0.8));
      c.lineTo(110, y0 - 44 + fl(1));
      c.quadraticCurveTo(96, y0 - 45 + fl(0.5), 85, y0 - 44);
      c.closePath();
    }, CLOTH, { team: true, outline: 1.6, box: [85, y0 - 58, 110, y0 - 44] });
    // Fore leg, reaching.
    stick(g, 112, y0 + 10, 120, y0 + 28, 9, SCALE_DARK, 2.2);
    for (let i = 0; i < 3; i++) poly(g, [116 + i * 4, y0 + 28, 122 + i * 4, y0 + 29, 121 + i * 4, y0 + 36], BONE_DARK, { outline: 1.3 });
    // Neck and head, rearing back to breathe.
    const rear = isAttack(p) ? (p.swing < 0 ? -p.swing * 10 : -p.swing * 6) : 0;
    const bob = Math.sin(p.t * TAU + 0.6) * 1.5;
    const hx = 152 - rear;
    const hy = y0 - 54 + rear * 0.4 + bob;
    curve(g, 116, y0 - 4, 140 - rear, y0 - 34, hx - 2, hy + 2, 18, SCALE, 2.4);
    curve(g, 122, y0 + 2, 146 - rear, y0 - 28, hx + 2, hy + 8, 6, '#c9a46a', 0);
    for (let i = 0; i < 4; i++) {
      const u = i / 4;
      const sx = 116 + (hx - 116) * u - 8 + u * 6;
      const sy = y0 - 10 + (hy - y0 + 10) * u - 6;
      poly(g, [sx, sy, sx - 5, sy - 7, sx + 3, sy - 2], SCALE_DARK, { outline: 1.3 });
    }
    pivot(g, hx, hy, -p.jaw * 0.25, () => {
      // Upper skull and snout.
      smooth(g, [hx - 12, hy - 4, hx - 4, hy - 10, hx + 14, hy - 9, hx + 29, hy - 3, hx + 29, hy + 2, hx + 8, hy + 4, hx - 10, hy + 6], SCALE, { box: [hx - 12, hy - 10, hx + 29, hy + 6] });
      // Lower jaw opens for breath.
      pivot(g, hx - 4, hy + 4, p.jaw * 0.55, () => {
        poly(g, [hx - 6, hy + 2, hx + 24, hy + 2, hx + 22, hy + 7, hx - 6, hy + 9], SCALE_DARK, { outline: 1.8 });
        detail(g, (ctx) => {
          ctx.fillStyle = BONE;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(hx + 4 + i * 5, hy + 2);
            ctx.lineTo(hx + 6 + i * 5, hy - 1);
            ctx.lineTo(hx + 8 + i * 5, hy + 2);
            ctx.fill();
          }
        });
      });
      // Horns sweeping back, and a brow ridge.
      curve(g, hx - 4, hy - 7, hx - 16, hy - 16, hx - 26, hy - 12, 4.2, BONE, 1.8);
      curve(g, hx + 2, hy - 9, hx - 6, hy - 24, hx - 16, hy - 26, 3.4, BONE, 1.6);
      smooth(g, [hx + 2, hy - 8, hx + 14, hy - 10, hx + 15, hy - 6, hx + 4, hy - 5], SCALE_DARK, { outline: 1.4 });
      detail(g, (ctx) => {
        ctx.fillStyle = '#ffcf4a';
        ctx.beginPath();
        ctx.ellipse(hx + 9, hy - 4, 3, 1.8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillRect(hx + 9, hy - 5.5, 1.2, 3);
        ctx.beginPath();
        ctx.arc(hx + 25, hy - 3, 1, 0, TAU);
        ctx.fill();
      });
      glow(g, hx + 9, hy - 4, 6, '#ffcf4a', 0.5);
      if (p.jaw > 0.2) {
        glow(g, hx + 26, hy + 3, 12 + p.jaw * 22, '#ff8a2a', 0.9);
        glow(g, hx + 22, hy + 3, 5 + p.jaw * 6, '#fff1cf', 0.9);
      } else {
        // Smoke curls from the nostrils.
        paint(g, (ctx) => {
          for (let i = 0; i < 2; i++) {
            const q = (p.t + i * 0.5) % 1;
            ctx.strokeStyle = `rgba(90,82,74,${0.6 * (1 - q)})`;
            ctx.lineWidth = 1.6 + q * 2.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const sx = hx + 27 + q * 6;
            const sy = hy - 4 - q * 16;
            ctx.moveTo(hx + 26, hy - 4);
            ctx.bezierCurveTo(hx + 30, hy - 7 - q * 4, sx - 4 + Math.sin(q * TAU) * 3, sy + 5, sx, sy);
            ctx.stroke();
          }
        });
      }
    });
    wing(g, 102, y0 - 10, p.flap, 106, '#8e5843', true, false);
  },
};

export function paintUnit(g: G, kind: number, p: Pose): void {
  PAINTERS[kind]!(g, p);
}
