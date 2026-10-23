import { Kind } from '../../../sim/api.ts';
import {
  BONE, BONE_DARK, CLOTH, FEATHER, GOLD, HORSE, HORSE_DARK, INK, IRON, LEATHER, LEATHER_DARK, SCALE, SCALE_DARK, SKIN, STEEL, STEEL_DARK,
  TROLL, TROLL_DARK, WOOD, WOOD_DARK,
  circle, curve, detail, ellipse, glow, pivot, poly, rect, stick, type G,
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

// ------------------------------------------------------------- people

function legs(g: G, p: Pose, hx = 48, hy = 62, color = LEATHER_DARK, boot = '#3a2c1d', fy = 84): void {
  const s = p.stride;
  const back = { x: hx - 2 - s * 6, y: fy - 2 + Math.max(0, s) * -3 };
  const front = { x: hx + 2 + s * 6, y: fy - 2 + Math.max(0, -s) * -3 };
  stick(g, hx - 2, hy, back.x, back.y, 6, color);
  rect(g, back.x - 4, back.y - 3, 9, 5, 2, boot, { outline: 2 });
  stick(g, hx + 2, hy, front.x, front.y, 6, tone2(color));
  rect(g, front.x - 3, front.y - 3, 9, 5, 2, boot, { outline: 2 });
}

function tone2(c: string): string {
  return c === LEATHER_DARK ? '#58412a' : c;
}

function torso(g: G, x: number, y: number, w: number, h: number, color: string, team = false): void {
  rect(g, x, y, w, h, 5, color, { team });
}

function tabard(g: G, x: number, y: number, w: number, h: number): void {
  poly(g, [x, y, x + w, y, x + w - 1, y + h, x + w / 2, y + h + 4, x + 1, y + h], '#999', { team: true, outline: 2 });
}

type Helm = 'none' | 'kettle' | 'great' | 'hood' | 'plume' | 'crown' | 'wizard' | 'skull' | 'cowl' | 'horned';

function head(g: G, x: number, y: number, helm: Helm): void {
  const c = g.ctx;
  if (helm === 'skull') {
    circle(g, x, y, 8, BONE);
    detail(g, (ctx) => {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 2.2, 0, TAU);
      ctx.arc(x - 2, y - 1, 2, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - 1, y + 4, 6, 1.5);
    });
    return;
  }
  circle(g, x, y, 8, SKIN);
  detail(g, (ctx) => {
    ctx.fillStyle = INK;
    ctx.fillRect(x + 3, y - 2, 2, 2.4);
  });
  switch (helm) {
    case 'kettle':
      part2(g, () => c.arc(x, y - 1, 9, Math.PI * 1.02, Math.PI * 1.98), STEEL);
      rect(g, x - 11, y - 2, 22, 3, 1.5, STEEL_DARK, { outline: 2 });
      break;
    case 'great':
      rect(g, x - 8.5, y - 9, 17, 17, 4, STEEL);
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.fillRect(x + 1, y - 2, 8, 2.2);
      });
      break;
    case 'plume':
      part2(g, () => c.arc(x, y - 1, 9, Math.PI, 0), STEEL);
      curve(g, x - 2, y - 9, x - 10, y - 22, x - 16, y - 12, 5, '#999', 0);
      plume(g, x - 2, y - 9);
      break;
    case 'hood':
      poly(g, [x - 10, y + 6, x - 8, y - 7, x + 2, y - 11, x + 9, y - 4, x + 6, y - 3, x + 3, y - 7, x - 4, y - 4, x - 4, y + 7], '#999', { team: true, outline: 2 });
      break;
    case 'cowl':
      poly(g, [x - 10, y + 7, x - 9, y - 6, x, y - 11, x + 9, y - 5, x + 8, y + 1, x + 4, y - 6, x - 3, y - 4, x - 3, y + 8], CLOTH, { outline: 2 });
      break;
    case 'crown':
      poly(g, [x - 8, y - 6, x - 8, y - 14, x - 4, y - 9, x, y - 16, x + 4, y - 9, x + 8, y - 14, x + 8, y - 6], GOLD, { outline: 2 });
      glow(g, x, y - 12, 9, '#ffe9a0', 0.55);
      break;
    case 'wizard':
      poly(g, [x - 13, y - 4, x + 12, y - 4, x + 3, y - 8, x - 1, y - 30, x - 9, y - 26, x - 4, y - 9], '#999', { team: true, outline: 2.5 });
      detail(g, (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(x - 3, y - 17, 1.8, 0, TAU);
        ctx.fill();
      });
      break;
    case 'horned':
      part2(g, () => c.arc(x, y - 1, 9, Math.PI, 0), STEEL_DARK);
      curve(g, x - 7, y - 5, x - 14, y - 10, x - 12, y - 18, 3, BONE, 2);
      curve(g, x + 7, y - 5, x + 14, y - 10, x + 12, y - 18, 3, BONE, 2);
      break;
    case 'none':
      detail(g, (ctx) => {
        ctx.fillStyle = '#5b3a22';
        ctx.beginPath();
        ctx.arc(x - 1, y - 3, 8, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      });
      break;
  }
}

function part2(g: G, path: () => void, color: string): void {
  // A closed arc cap (helmets).
  const c = g.ctx;
  poly2(g, path, color);
  void c;
}

function poly2(g: G, path: () => void, color: string): void {
  const { ctx } = g;
  ctx.beginPath();
  path();
  ctx.closePath();
  if (!g.mask) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}

function plume(g: G, x: number, y: number): void {
  if (!g.mask) return;
  const { ctx } = g;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 8, y - 13, x - 14, y - 3);
  ctx.stroke();
  ctx.restore();
}

function arm(g: G, x0: number, y0: number, x1: number, y1: number, color = SKIN): void {
  stick(g, x0, y0, x1, y1, 5, color, 2);
}

/** Upper body lifted by the walk bob. */
function upper(g: G, p: Pose, fn: () => void): void {
  g.ctx.save();
  g.ctx.translate(0, -p.bob);
  fn();
  g.ctx.restore();
}

function swingAngle(p: Pose, back = 1.1, fwd = 1.2): number {
  return p.swing < 0 ? p.swing * back : p.swing * fwd;
}

// ------------------------------------------------------------- mounts

function horse(g: G, p: Pose, o: { barding: boolean; color: string }): void {
  // Logical 128 cell, hooves at y=114, facing right.
  const s = p.stride;
  const gal = (ph: number) => Math.sin((s * Math.PI) / 2 + ph);
  const leg = (hx: number, hy: number, ph: number, shade: string) => {
    const a = gal(ph) * 0.55;
    const kx = hx + Math.sin(a) * 12;
    const ky = hy + Math.cos(a) * 12;
    const fx = kx + Math.sin(a * 1.6 - 0.2) * 13;
    const fy = Math.min(112, ky + Math.cos(a * 1.6 - 0.2) * 13);
    stick(g, hx, hy, kx, ky, 6, shade);
    stick(g, kx, ky, fx, fy, 4.5, shade);
    rect(g, fx - 3, fy - 1, 7, 4, 1.5, '#2b2119', { outline: 1.5 });
  };
  leg(44, 82, 0.9, HORSE_DARK);
  leg(84, 82, 2.4, HORSE_DARK);
  // Tail
  curve(g, 34, 70, 22, 74 + s * 3, 24, 92 + s * 2, 5, '#3b2a1c', 2);
  ellipse(g, 64, 74, 30, 14, 0, o.color, { box: [34, 60, 94, 88] });
  // Neck and head
  poly(g, [82, 70, 90, 50, 98, 42, 108, 46, 112, 54, 104, 56, 98, 54, 94, 74], o.color, { box: [82, 42, 112, 74] });
  detail(g, (ctx) => {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(103, 47, 1.6, 0, TAU);
    ctx.fill();
  });
  curve(g, 88, 52, 92, 44, 98, 40, 4, '#3b2a1c', 1.5);
  if (o.barding) {
    poly(g, [38, 66, 90, 62, 94, 76, 86, 90, 74, 84, 62, 92, 50, 84, 40, 88, 34, 76], '#999', { team: true, outline: 2 });
    poly(g, [92, 54, 100, 44, 106, 46, 100, 56], STEEL, { outline: 2 });
    detail(g, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(44 + i * 12, 68);
        ctx.lineTo(42 + i * 12, 86);
        ctx.stroke();
      }
    });
  } else {
    rect(g, 52, 62, 22, 9, 3, '#999', { team: true, outline: 2 });
  }
  leg(52, 84, 0, HORSE);
  leg(78, 84, 1.6, HORSE);
}

function wing(g: G, x: number, y: number, flap: number, len: number, color: string, membrane: boolean, back: boolean): void {
  // flap 0..1 → angle from raised to lowered.
  const a = Math.cos(flap * TAU);
  const lift = a * 0.95 + (back ? 0.15 : 0);
  const tipX = x - len * 0.55;
  const tipY = y - len * lift;
  const midX = x - len * 0.3;
  const midY = y - len * lift * 0.55 - 6;
  const col = back ? (membrane ? SCALE_DARK : BONE_DARK) : color;
  if (membrane) {
    poly(g, [x, y, midX, midY, tipX, tipY, tipX - len * 0.12, tipY + len * 0.35 * (lift > 0 ? 1 : -0.3), x - len * 0.42, y + 4, x - len * 0.2, y + 6], col, {
      box: [tipX, Math.min(tipY, y), x, y + 6],
    });
    stick(g, x, y, midX, midY, 3.5, back ? SCALE_DARK : SCALE, 2);
    stick(g, midX, midY, tipX, tipY, 2.5, back ? SCALE_DARK : SCALE, 2);
    detail(g, (ctx) => {
      ctx.strokeStyle = 'rgba(30,20,15,0.6)';
      ctx.lineWidth = 1.4;
      for (const t of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.moveTo(midX + (tipX - midX) * t, midY + (tipY - midY) * t);
        ctx.lineTo(x - len * (0.2 + t * 0.25), y + 5);
        ctx.stroke();
      }
    });
  } else {
    poly(g, [x, y, midX, midY, tipX, tipY, tipX + 6, tipY + 10 * Math.sign(lift || 1), x - len * 0.25, y + 8], col, { box: [tipX, Math.min(tipY, y), x, y + 8] });
    detail(g, (ctx) => {
      ctx.strokeStyle = 'rgba(60,45,30,0.55)';
      ctx.lineWidth = 1.2;
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        ctx.beginPath();
        ctx.moveTo(x + (tipX - x) * t, y + (tipY - y) * t);
        ctx.lineTo(x + (tipX - x) * t + 4, y + (tipY - y) * t + 9);
        ctx.stroke();
      }
    });
  }
}

// ------------------------------------------------------------ painters

const PAINTERS: Record<number, Painter> = {
  [Kind.Footman]: (g, p) => {
    legs(g, p);
    upper(g, p, () => {
      const a = swingAngle(p, 0.6, 0.5);
      pivot(g, 50, 46, a, () => {
        stick(g, 26, 66, 78, 22, 3.5, WOOD);
        poly(g, [78, 22, 86, 12, 82, 25], STEEL, { outline: 2 });
      });
      torso(g, 40, 41, 17, 23, STEEL_DARK);
      tabard(g, 42, 45, 13, 16);
      head(g, 48, 32, 'kettle');
      circle(g, 41, 54, 12.5, '#999', { team: true });
      circle(g, 41, 54, 4, STEEL, { outline: 2 });
    });
  },
  [Kind.Knight]: (g, p) => {
    horse(g, p, { barding: true, color: '#d8d2c6' });
    upper(g, p, () => {
      const a = swingAngle(p, 0.25, 0.35);
      stick(g, 62, 60, 58, 74, 6, STEEL_DARK);
      torso(g, 54, 38, 18, 24, STEEL);
      tabard(g, 56, 42, 14, 16);
      head(g, 63, 28, 'plume');
      pivot(g, 66, 48, a, () => {
        poly(g, [62, 50, 122, 38, 122, 41, 64, 55], WOOD, { outline: 2 });
        poly(g, [64, 44, 72, 42, 72, 58, 64, 58], STEEL, { outline: 2 });
        poly(g, [104, 41, 122, 37, 124, 40, 106, 45], '#999', { team: true, outline: 1.5 });
      });
      rect(g, 46, 46, 12, 18, 4, '#999', { team: true });
    });
  },
  [Kind.Warden]: (g, p) => {
    legs(g, { ...p, stride: p.stride * 0.6 }, 48, 62, STEEL_DARK);
    upper(g, p, () => {
      torso(g, 37, 40, 22, 26, STEEL_DARK);
      head(g, 46, 31, 'great');
      const push = p.swing > 0 ? p.swing * 6 : p.swing * 2;
      rect(g, 53 + push, 20, 24, 60, 6, STEEL);
      rect(g, 56 + push, 23, 18, 54, 4, '#999', { team: true, outline: 1.5 });
      detail(g, (ctx) => {
        ctx.fillStyle = '#d7dde3';
        ctx.fillRect(63.5 + push, 26, 3, 48);
        ctx.fillRect(58 + push, 47, 14, 3);
      });
    });
  },
  [Kind.Paladin]: (g, p) => {
    legs(g, p, 48, 62, STEEL_DARK);
    upper(g, p, () => {
      glow(g, 48, 26, 20, '#fff2b0', 0.55);
      part2(g, () => g.ctx.ellipse(48, 19, 10, 3, 0, 0, TAU), GOLD);
      const a = swingAngle(p, 1.2, 1.5);
      pivot(g, 54, 46, a, () => {
        stick(g, 54, 46, 70, 18, 4, WOOD);
        rect(g, 62, 8, 18, 12, 3, GOLD);
        glow(g, 71, 14, 14, '#fff6c0', 0.7);
      });
      torso(g, 39, 40, 20, 25, STEEL);
      tabard(g, 41, 44, 16, 18);
      detail(g, (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.fillRect(48, 46, 2.5, 12);
        ctx.fillRect(44, 50, 10, 2.5);
      });
      head(g, 48, 31, 'great');
      poly(g, [30, 44, 42, 44, 42, 62, 36, 70, 30, 62], STEEL, { outline: 2.5 });
      poly(g, [32, 47, 40, 47, 40, 61, 36, 66, 32, 61], '#999', { team: true, outline: 1.5 });
    });
  },
  [Kind.Archer]: (g, p) => {
    legs(g, p);
    upper(g, p, () => {
      rect(g, 30, 36, 8, 24, 3, LEATHER, { outline: 2 });
      stick(g, 33, 36, 31, 29, 1.5, '#eee', 1);
      stick(g, 36, 36, 37, 28, 1.5, '#eee', 1);
      torso(g, 40, 42, 15, 22, LEATHER);
      tabard(g, 42, 45, 11, 15);
      head(g, 47, 33, 'hood');
      const draw = p.swing < 0 ? -p.swing * 8 : 0;
      bow(g, 58, 47, 22, draw);
      arm(g, 50, 48, 66, 46);
      arm(g, 48, 46, 58 - draw, 47);
    });
  },
  [Kind.Ranger]: (g, p) => {
    legs(g, p, 48, 62, '#3d4a32');
    upper(g, p, () => {
      poly(g, [38, 38, 50, 38, 54, 66, 30, 72], '#999', { team: true });
      torso(g, 40, 42, 15, 22, '#556b45');
      head(g, 47, 33, 'cowl');
      const draw = p.swing < 0 ? -p.swing * 10 : 0;
      bow(g, 60, 46, 30, draw, WOOD_DARK);
      arm(g, 50, 48, 69, 45);
      arm(g, 48, 46, 60 - draw, 46);
      if (p.pose === 'attack' && p.swing < 0) glow(g, 66, 46, 6, '#c8ffd8', 0.6);
    });
  },
  [Kind.Herald]: (g, p) => {
    legs(g, p);
    upper(g, p, () => {
      const sway = Math.sin(p.stride * 1.5) * 2 + p.swing * 3;
      stick(g, 60, 84, 60 + sway * 0.3, 2, 3.5, WOOD);
      circle(g, 60 + sway * 0.3, 2, 3.5, GOLD, { outline: 2 });
      poly(g, [61 + sway * 0.3, 6, 88 + sway, 8, 84 + sway, 18, 90 + sway, 30, 61 + sway * 0.3, 30], '#999', { team: true });
      poly(g, [37, 42, 57, 42, 59, 72, 35, 72], CLOTH);
      tabard(g, 41, 44, 12, 18);
      head(g, 47, 33, 'none');
      arm(g, 50, 48, 60, 44);
    });
  },
  [Kind.Wizard]: (g, p) => {
    upper(g, { ...p, bob: p.bob * 0.5 }, () => {
      poly(g, [36, 42, 56, 42, 62, 84, 30, 84], '#999', { team: true });
      detail(g, (ctx) => {
        ctx.strokeStyle = 'rgba(255,230,150,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(32, 80);
        ctx.lineTo(60, 80);
        ctx.stroke();
      });
      const a = swingAngle(p, 0.5, 0.7);
      pivot(g, 54, 48, a, () => {
        stick(g, 58, 84, 64, 16, 3, WOOD_DARK);
        circle(g, 64, 13, 4.5, '#ffb347', { outline: 2 });
        glow(g, 64, 13, 12 + Math.max(0, -p.swing) * 10, '#ff9a3a', 0.85);
      });
      head(g, 46, 34, 'wizard');
      detail(g, (ctx) => {
        ctx.fillStyle = '#e8e4dc';
        ctx.beginPath();
        ctx.moveTo(44, 38);
        ctx.lineTo(54, 38);
        ctx.lineTo(48, 54);
        ctx.fill();
      });
      arm(g, 50, 48, 61, 48, '#999');
    });
  },
  [Kind.Sapper]: (g, p) => {
    legs(g, p);
    upper(g, p, () => {
      circle(g, 32, 56, 9, WOOD_DARK);
      detail(g, (ctx) => {
        ctx.strokeStyle = IRON;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(24, 53, 16, 1.5);
        ctx.strokeRect(24, 59, 16, 1.5);
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(31, 45, 1.5, 4);
      });
      torso(g, 39, 42, 18, 23, LEATHER);
      tabard(g, 41, 45, 14, 15);
      head(g, 48, 33, 'kettle');
      const a = swingAngle(p, 1.3, 1.6);
      pivot(g, 54, 46, a, () => {
        stick(g, 44, 70, 68, 22, 4, WOOD);
        poly(g, [56, 22, 72, 14, 84, 22, 70, 20], STEEL_DARK, { outline: 2 });
      });
      arm(g, 50, 48, 60, 40);
    });
  },
  [Kind.Trebuchet]: (g, p) => {
    // 128 cell: a wheeled siege engine with a counterweighted throwing arm.
    const roll = p.stride * 0.5;
    poly(g, [24, 98, 104, 98, 100, 90, 28, 90], WOOD_DARK);
    poly(g, [44, 92, 62, 40, 68, 40, 54, 92], WOOD);
    poly(g, [84, 92, 66, 40, 72, 40, 94, 92], WOOD);
    for (const wx of [34, 94]) {
      circle(g, wx, 104, 10, WOOD_DARK);
      detail(g, (ctx) => {
        ctx.strokeStyle = WOOD;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = roll + (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(wx - Math.cos(a) * 9, 104 - Math.sin(a) * 9);
          ctx.lineTo(wx + Math.cos(a) * 9, 104 + Math.sin(a) * 9);
          ctx.stroke();
        }
      });
    }
    // Arm: cocked back (low), released (thrown up and over).
    const cock = p.pose === 'attack' ? (p.swing < 0 ? 0.55 - p.swing * 0.35 : 0.9 - p.swing * 2.1) : 0.6;
    pivot(g, 67, 40, cock, () => {
      stick(g, 67, 40, 112, 40, 4.5, WOOD);
      stick(g, 67, 40, 46, 40, 5, WOOD);
      rect(g, 34, 40, 16, 16, 3, IRON);
      curve(g, 112, 40, 116, 52, 108, 58, 1.5, '#cfc4ad', 1);
      if (p.swing <= 0) circle(g, 108, 60, 5, '#8d8a82', { outline: 2 });
    });
    circle(g, 67, 40, 4, IRON, { outline: 2 });
    stick(g, 28, 90, 28, 58, 2.5, WOOD_DARK);
    poly(g, [29, 58, 50, 62, 29, 70], '#999', { team: true, outline: 2 });
  },
  [Kind.Outrider]: (g, p) => {
    horse(g, p, { barding: false, color: HORSE });
    upper(g, p, () => {
      stick(g, 62, 60, 60, 76, 5, LEATHER_DARK);
      torso(g, 55, 42, 15, 20, LEATHER);
      tabard(g, 57, 45, 11, 13);
      head(g, 62, 32, 'hood');
      const a = swingAngle(p, 1.4, 1.8);
      pivot(g, 66, 48, a, () => {
        curve(g, 66, 48, 84, 40, 92, 26, 2.5, STEEL);
      });
      arm(g, 62, 48, 68, 48);
    });
  },
  [Kind.GriffinRider]: (g, p) => {
    // 128 cell; the creature hovers (renderer lifts it), feet line at y=114.
    const y0 = 70;
    wing(g, 60, y0 - 10, p.flap + 0.08, 52, FEATHER, false, true);
    // Lion hindquarters and tail
    curve(g, 34, y0 + 4, 16, y0 + 2, 14, y0 + 16, 3.5, '#b89a68', 2);
    circle(g, 13, y0 + 17, 4, '#6b5435', { outline: 2 });
    ellipse(g, 54, y0 + 6, 24, 13, 0, '#c8a66e', { box: [30, y0 - 7, 78, y0 + 19] });
    // Legs tucked: lion behind, talons in front
    stick(g, 40, y0 + 14, 34, y0 + 26, 5, '#a8895a');
    stick(g, 70, y0 + 14, 78, y0 + 26, 4, '#d8b25a');
    // Eagle front and head
    ellipse(g, 76, y0 - 2, 14, 12, -0.3, FEATHER, { box: [62, y0 - 14, 90, y0 + 10] });
    circle(g, 90, y0 - 14, 8, FEATHER);
    poly(g, [96, y0 - 16, 106, y0 - 11, 96, y0 - 8], GOLD, { outline: 2 });
    detail(g, (ctx) => {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(92, y0 - 16, 1.8, 0, TAU);
      ctx.fill();
    });
    // Rider
    rect(g, 50, y0 - 12, 18, 7, 2, '#999', { team: true, outline: 2 });
    upper(g, p, () => {
      torso(g, 54, y0 - 34, 13, 20, STEEL_DARK);
      tabard(g, 55, y0 - 31, 11, 12);
      head(g, 60, y0 - 41, 'plume');
      const a = swingAngle(p, 1, 1.5);
      pivot(g, 64, y0 - 26, a, () => {
        stick(g, 60, y0 - 20, 92, y0 - 46, 3, WOOD);
        poly(g, [92, y0 - 46, 100, y0 - 54, 95, y0 - 42], STEEL, { outline: 2 });
      });
    });
    wing(g, 66, y0 - 8, p.flap, 58, FEATHER, false, false);
  },
  [Kind.Skeleton]: (g, p) => {
    legs(g, p, 48, 62, BONE, BONE_DARK);
    upper(g, p, () => {
      detail(g, (ctx) => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(48, 42);
        ctx.lineTo(48, 62);
        ctx.stroke();
        ctx.strokeStyle = BONE;
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      for (let i = 0; i < 3; i++) curve(g, 42, 45 + i * 5, 48, 43 + i * 5, 55, 45 + i * 5, 2, BONE, 1.5);
      poly(g, [40, 60, 56, 60, 58, 70, 52, 66, 46, 71, 38, 67], '#999', { team: true, outline: 2 });
      head(g, 48, 33, 'skull');
      glow(g, 51, 32, 5, '#7fffd0', 0.6);
      const a = swingAngle(p, 1.2, 1.5);
      pivot(g, 52, 46, a, () => {
        stick(g, 52, 50, 60, 40, 2.5, BONE);
        poly(g, [58, 42, 62, 38, 78, 20, 74, 30], '#8a6b4c', { outline: 2 });
      });
      circle(g, 40, 54, 9, WOOD_DARK, { outline: 2 });
      detail(g, (ctx) => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(34, 50);
        ctx.lineTo(44, 58);
        ctx.stroke();
      });
    });
  },
  [Kind.BoneGolem]: (g, p) => {
    // 128 cell, feet at 114.
    const s = p.stride;
    stick(g, 52, 84, 46 - s * 7, 110, 12, BONE_DARK);
    stick(g, 72, 84, 78 + s * 7, 110, 12, BONE);
    upper(g, { ...p, bob: p.bob * 1.4 }, () => {
      const a = swingAngle(p, 0.9, 1.2);
      pivot(g, 40, 52, -a * 0.4, () => {
        stick(g, 40, 52, 30, 90, 11, BONE_DARK);
        circle(g, 29, 94, 9, BONE_DARK);
      });
      ellipse(g, 62, 64, 30, 26, 0, BONE, { box: [32, 38, 92, 90] });
      detail(g, (ctx) => {
        ctx.strokeStyle = 'rgba(80,65,40,0.7)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(62, 70, 8 + i * 4, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
      });
      poly(g, [36, 56, 52, 44, 58, 68, 46, 84, 34, 74], '#999', { team: true });
      circle(g, 80, 40, 13, BONE);
      detail(g, (ctx) => {
        ctx.fillStyle = INK;
        ctx.fillRect(78, 47, 12, 3);
      });
      glow(g, 84, 37, 9, '#7fffd0', 0.95);
      glow(g, 78, 37, 7, '#7fffd0', 0.8);
      pivot(g, 86, 54, a, () => {
        stick(g, 86, 54, 100, 86, 11, BONE);
        circle(g, 102, 90, 10, BONE);
      });
    });
  },
  [Kind.Mercenary]: (g, p) => {
    legs(g, p);
    upper(g, p, () => {
      const a = swingAngle(p, 1.2, 1.4);
      pivot(g, 44, 48, -a * 0.7, () => {
        stick(g, 44, 50, 26, 34, 3, STEEL);
      });
      torso(g, 40, 42, 17, 22, LEATHER_DARK);
      tabard(g, 42, 45, 13, 10);
      head(g, 48, 33, 'plume');
      pivot(g, 54, 48, a, () => {
        stick(g, 54, 50, 76, 32, 3, STEEL);
        stick(g, 52, 52, 57, 47, 3.5, GOLD, 1.5);
      });
      arm(g, 48, 47, 56, 50);
    });
  },
  [Kind.Troll]: (g, p) => {
    // 128 cell, hunched and huge.
    const s = p.stride;
    stick(g, 54, 84, 48 - s * 8, 108, 12, TROLL_DARK);
    rect(g, 40 - s * 8, 104, 18, 8, 3, TROLL_DARK);
    stick(g, 70, 84, 76 + s * 8, 108, 12, TROLL);
    rect(g, 70 + s * 8, 104, 18, 8, 3, TROLL);
    upper(g, { ...p, bob: p.bob * 1.4 }, () => {
      ellipse(g, 58, 62, 30, 26, -0.2, TROLL, { box: [28, 36, 88, 88] });
      poly(g, [36, 76, 82, 76, 80, 92, 68, 88, 58, 94, 46, 88, 36, 92], '#999', { team: true });
      // Head, low and forward
      circle(g, 86, 46, 12, TROLL);
      detail(g, (ctx) => {
        ctx.fillStyle = '#ffde59';
        ctx.beginPath();
        ctx.arc(91, 43, 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillRect(84, 52, 12, 2.5);
      });
      poly(g, [92, 52, 98, 42, 96, 53], BONE, { outline: 1.5 });
      poly(g, [84, 52, 88, 44, 89, 53], BONE, { outline: 1.5 });
      stick(g, 74, 50, 80, 46, 3, '#999', 0, true);
      const a = swingAngle(p, 1.3, 1.7);
      pivot(g, 74, 56, a, () => {
        stick(g, 74, 56, 96, 72, 9, TROLL);
        poly(g, [92, 72, 104, 30, 118, 26, 112, 36, 102, 76], WOOD, { outline: 2.5 });
        detail(g, (ctx) => {
          ctx.fillStyle = '#c9c4b5';
          for (const [x, y] of [[108, 32], [110, 40], [104, 46]] as const) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 6, y - 3);
            ctx.lineTo(x + 2, y + 3);
            ctx.fill();
          }
        });
      });
    });
  },
  [Kind.Berserker]: (g, p) => {
    legs(g, p, 48, 62, '#6b4428');
    upper(g, p, () => {
      const a = swingAngle(p, 1.5, 1.8);
      pivot(g, 42, 46, -a * 0.6, () => axe(g, 42, 48, 24, 26));
      rect(g, 39, 41, 18, 22, 6, SKIN);
      detail(g, (ctx) => {
        ctx.strokeStyle = '#a0332a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(42, 46);
        ctx.lineTo(54, 58);
        ctx.moveTo(54, 46);
        ctx.lineTo(44, 54);
        ctx.stroke();
      });
      rect(g, 39, 58, 18, 7, 2, '#999', { team: true, outline: 2 });
      head(g, 48, 32, 'horned');
      detail(g, (ctx) => {
        ctx.fillStyle = '#b5532d';
        ctx.beginPath();
        ctx.moveTo(44, 36);
        ctx.lineTo(54, 36);
        ctx.lineTo(50, 46);
        ctx.fill();
      });
      pivot(g, 54, 46, a, () => axe(g, 54, 48, 76, 26));
    });
  },
  [Kind.Cleric]: (g, p) => {
    upper(g, { ...p, bob: p.bob * 0.6 }, () => {
      poly(g, [37, 42, 57, 42, 61, 84, 33, 84], CLOTH);
      poly(g, [43, 42, 51, 42, 52, 84, 42, 84], '#999', { team: true, outline: 1.5 });
      head(g, 47, 33, 'cowl');
      const swing = Math.sin(p.stride * 1.6) * 0.3 + p.swing * 0.6;
      pivot(g, 56, 48, swing, () => {
        stick(g, 56, 48, 64, 66, 1.2, '#cfc6b0', 1);
        circle(g, 64, 70, 4.5, GOLD, { outline: 2 });
        glow(g, 64, 70, p.pose === 'attack' ? 22 : 12, '#fff6c8', 0.8);
      });
      arm(g, 50, 48, 57, 50, CLOTH);
    });
  },
  [Kind.Champion]: (g, p) => {
    legs(g, p, 48, 62, STEEL_DARK);
    upper(g, p, () => {
      glow(g, 48, 50, 34, '#ffe08a', 0.35);
      poly(g, [40, 40, 54, 40, 50 - p.stride * 3, 80, 26 - p.stride * 3, 78], '#999', { team: true });
      torso(g, 39, 40, 20, 25, STEEL);
      detail(g, (ctx) => {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.strokeRect(41, 42, 16, 21);
      });
      head(g, 49, 30, 'crown');
      const a = swingAngle(p, 1.3, 1.9);
      pivot(g, 55, 46, a, () => {
        stick(g, 55, 48, 88, 6, 5, '#e4e9ee');
        detail(g, (ctx) => {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(58, 44);
          ctx.lineTo(86, 8);
          ctx.stroke();
        });
        stick(g, 49, 44, 61, 52, 3.5, GOLD, 2);
        glow(g, 80, 16, 14, '#fff3c2', 0.6);
      });
    });
  },
  [Kind.Dragon]: (g, p) => {
    // 192 cell, hovering; belly line near y=130, feet line 168.
    const y0 = 116;
    const tail = Math.sin(p.stride * 1.4 + p.flap * TAU) * 6;
    wing(g, 92, y0 - 26, p.flap + 0.06, 108, SCALE, true, true);
    // Tail
    curve(g, 62, y0 + 4, 30, y0 + 16 + tail, 8, y0 + 2 - tail, 9, SCALE, 2.5);
    poly(g, [8, y0 - 2 - tail, -2 + 6, y0 - 12 - tail, 4, y0 + 8 - tail], SCALE_DARK, { outline: 2 });
    // Hind leg
    stick(g, 72, y0 + 12, 66, y0 + 34, 9, SCALE_DARK);
    poly(g, [60, y0 + 34, 74, y0 + 34, 70, y0 + 40, 62, y0 + 40], BONE_DARK, { outline: 2 });
    // Body
    ellipse(g, 92, y0 + 2, 40, 22, -0.08, SCALE, { box: [52, y0 - 20, 132, y0 + 24] });
    ellipse(g, 92, y0 + 12, 30, 9, -0.08, '#c9a46a', { box: [62, y0 + 3, 122, y0 + 21] });
    detail(g, (ctx) => {
      ctx.strokeStyle = 'rgba(40,28,20,0.55)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(72 + i * 8, y0 + 7);
        ctx.lineTo(74 + i * 8, y0 + 18);
        ctx.stroke();
      }
    });
    // Subtle army tint over the scales.
    ellipse(g, 90, y0 - 4, 36, 14, -0.08, '#999', { team: true, strength: 0.32, outline: 0 });
    // Spines
    for (let i = 0; i < 6; i++) poly(g, [64 + i * 10, y0 - 16 + i * 0.5, 69 + i * 10, y0 - 27, 72 + i * 10, y0 - 15], SCALE_DARK, { outline: 1.5 });
    // Saddle and banner
    rect(g, 82, y0 - 24, 22, 9, 3, '#999', { team: true, outline: 2 });
    stick(g, 86, y0 - 24, 84, y0 - 56, 2.5, WOOD);
    poly(g, [85, y0 - 56, 106, y0 - 52 + tail * 0.3, 85, y0 - 42], '#999', { team: true, outline: 2 });
    // Fore leg
    stick(g, 110, y0 + 12, 118, y0 + 30, 8, SCALE_DARK);
    poly(g, [114, y0 + 30, 128, y0 + 32, 122, y0 + 37, 114, y0 + 36], BONE_DARK, { outline: 2 });
    // Neck and head, rearing back to breathe
    const rear = p.pose === 'attack' ? (p.swing < 0 ? -p.swing * 10 : -p.swing * 6) : 0;
    curve(g, 120, y0 - 6, 140 - rear, y0 - 40, 150 - rear, y0 - 52 + rear * 0.4, 14, SCALE, 2.5);
    pivot(g, 152 - rear, y0 - 54 + rear * 0.4, -p.jaw * 0.25, () => {
      const hx = 152 - rear;
      const hy = y0 - 54 + rear * 0.4;
      poly(g, [hx - 10, hy - 8, hx + 14, hy - 8, hx + 28, hy - 2, hx + 28, hy + 2, hx + 6, hy + 4, hx - 10, hy + 6], SCALE, { box: [hx - 10, hy - 8, hx + 28, hy + 6] });
      // Lower jaw opens for breath
      pivot(g, hx - 4, hy + 4, p.jaw * 0.55, () => {
        poly(g, [hx - 6, hy + 2, hx + 24, hy + 2, hx + 22, hy + 7, hx - 6, hy + 9], SCALE_DARK, { outline: 2 });
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
      curve(g, hx - 4, hy - 6, hx - 14, hy - 16, hx - 22, hy - 14, 3.5, BONE, 2);
      curve(g, hx + 2, hy - 8, hx - 6, hy - 22, hx - 14, hy - 24, 3, BONE, 2);
      detail(g, (ctx) => {
        ctx.fillStyle = '#ffcf4a';
        ctx.beginPath();
        ctx.ellipse(hx + 8, hy - 4, 3, 1.8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillRect(hx + 8, hy - 5.5, 1.2, 3);
      });
      if (p.jaw > 0.2) glow(g, hx + 26, hy + 3, 12 + p.jaw * 22, '#ff8a2a', 0.9);
      glow(g, hx + 8, hy - 4, 6, '#ffcf4a', 0.5);
    });
    wing(g, 98, y0 - 20, p.flap, 122, SCALE, true, false);
  },
};

function bow(g: G, x: number, y: number, r: number, draw: number, color = WOOD): void {
  const a = 1.15;
  const { ctx } = g;
  const top = { x: x + Math.cos(-a) * r - r * 0.4, y: y + Math.sin(-a) * r };
  const bot = { x: x + Math.cos(a) * r - r * 0.4, y: y + Math.sin(a) * r };
  ctx.save();
  ctx.translate(-r * 0.4, 0);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, -a, a);
  if (!g.mask) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();
  stick(g, top.x, top.y, x - draw, y, 1.2, '#efe9d8', 0);
  stick(g, bot.x, bot.y, x - draw, y, 1.2, '#efe9d8', 0);
  if (draw > 0) stick(g, x - draw, y, x + r * 0.7, y - 1, 1.5, WOOD_DARK, 1);
}

function axe(g: G, x0: number, y0: number, x1: number, y1: number): void {
  stick(g, x0, y0, x1, y1, 3, WOOD);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const m = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / m;
  const ny = dx / m;
  poly(g, [x1, y1, x1 + nx * 9 - dx / m * 2, y1 + ny * 9 - dy / m * 2, x1 + nx * 10 - dx / m * 10, y1 + ny * 10 - dy / m * 10, x1 - dx / m * 8, y1 - dy / m * 8], STEEL, { outline: 2 });
}

export function paintUnit(g: G, kind: number, p: Pose): void {
  PAINTERS[kind]!(g, p);
}
