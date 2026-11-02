// Pixel sprites, painted pixel by pixel at start-up and packed into an atlas per army.
//
// Every figure is painted facing right on a 24×20 cell with its feet at (12, 19), then given a
// one-pixel dark outline, so the art reads at any zoom. Colours come from the faction's palette
// and the army's heraldic hue (shields, pennants, horse cloth trim).

import { FACTIONS, type FactionId } from '../../game/factions.ts';
import { U, UNIT_COUNT } from '../../game/units.ts';

export const CELL_W = 24;
export const CELL_H = 20;
export const FOOT_X = 12;
export const FOOT_Y = 19;

export const Frame = { Idle: 0, Walk: 1, Attack: 2, Dead: 3, Rout: 4 } as const;
export const FRAME_COUNT = 5;
/** Class index for the commander's own figure. */
export const COMMANDER = UNIT_COUNT;
const KINDS = UNIT_COUNT + 1;

type Px = (string | null)[];

class Canvas {
  readonly px: Px;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array<string | null>(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x]!;
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** One-pixel outline around everything painted, in `c`. */
  outline(c: string): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
      }
    for (const i of add) this.px[i] = c;
  }
}

export interface Palette {
  cloth: string;
  clothShade: string;
  trim: string;
  metal: string;
  metalShade: string;
  metalDark: string;
  leather: string;
  leatherDark: string;
  skin: string;
  wood: string;
  woodDark: string;
  team: string;
  teamShade: string;
  teamLight: string;
  outline: string;
  blood: string;
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

/** hsl() strings to hex, so the atlas can be written as ImageData. */
function toRgb(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/.exec(c)!;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export function paletteFor(faction: FactionId, hue: number): Palette {
  const f = FACTIONS[faction].palette;
  return {
    cloth: f.cloth, clothShade: f.clothShade, trim: f.trim, metal: f.metal, metalShade: f.metalShade, metalDark: '#3d4146',
    leather: f.leather, leatherDark: '#36241a', skin: f.skin, wood: '#7a5634', woodDark: '#4e3420',
    team: hsl(hue, 55, 38), teamShade: hsl(hue, 55, 25), teamLight: hsl(hue, 50, 55), outline: '#120e0b', blood: '#6e0f0f',
  };
}

// ------------------------------------------------------------------ figures on foot

type Helm = 'great' | 'kettle' | 'coif' | 'hood' | 'plate' | 'cap';
type Body = 'tabard' | 'gambeson' | 'plate' | 'tunic';
type Weapon = 'sword' | 'spear' | 'bow' | 'crossbow' | 'javelin' | 'poleaxe' | 'lance' | 'mace';
type Shield = 'kite' | 'round' | 'pavise' | null;

interface FootLook {
  helm: Helm;
  body: Body;
  weapon: Weapon;
  shield: Shield;
  cross: boolean;
}

/** Paints a figure on foot with its feet at (fx, fy). `frame` sets the pose. */
function paintFoot(c: Canvas, p: Palette, look: FootLook, frame: number, fx: number, fy: number, mounted = false): void {
  const X = (dx: number) => fx + dx;
  const Y = (dy: number) => fy + dy;
  const walk = frame === Frame.Walk || frame === Frame.Rout;
  const attack = frame === Frame.Attack;
  const cloth = look.body === 'plate' ? p.metalShade : look.body === 'gambeson' ? '#8a7a5c' : look.body === 'tunic' ? '#6b5a3e' : p.cloth;
  const clothShade = look.body === 'plate' ? p.metalDark : look.body === 'gambeson' ? '#62553f' : look.body === 'tunic' ? '#4b3e2b' : p.clothShade;

  if (!mounted) {
    // Legs and feet: a stride when walking.
    const l1 = walk ? -2 : -1;
    const l2 = walk ? 2 : 1;
    const hose = look.body === 'plate' ? p.metal : p.leatherDark;
    c.line(X(l1), Y(-3), X(l1), Y(-1), hose);
    c.line(X(l2), Y(-3), X(l2), Y(-1), look.body === 'plate' ? p.metalShade : p.leather);
    c.set(X(l1), Y(0), p.leatherDark);
    c.set(X(l1 - 1), Y(0), p.leatherDark);
    c.set(X(l2), Y(0), p.leatherDark);
    c.set(X(l2 + 1), Y(0), p.leatherDark);
    // Skirt of the tabard.
    c.rect(X(-2), Y(-4), 5, 1, cloth);
    c.set(X(-2), Y(-4), clothShade);
  }
  const top = mounted ? fy : Y(-4);
  // Torso.
  c.rect(X(-2), top - 4, 5, 4, cloth);
  c.line(X(-2), top - 4, X(-2), top - 1, clothShade);
  if (look.cross) {
    c.line(X(0), top - 4, X(0), top - 1, p.trim);
    c.line(X(-1), top - 3, X(1), top - 3, p.trim);
  }
  if (look.body === 'gambeson') {
    c.set(X(-1), top - 2, clothShade);
    c.set(X(1), top - 2, clothShade);
  }
  // Belt.
  c.line(X(-2), top - 1, X(2), top - 1, p.leatherDark);
  // Neck and mail.
  c.rect(X(-1), top - 5, 3, 1, p.metalShade);
  // Head.
  const hy = top - 9;
  switch (look.helm) {
    case 'great':
      c.rect(X(-1), hy, 4, 4, p.metal);
      c.line(X(-1), hy, X(2), hy, p.metalShade);
      c.line(X(1), hy + 2, X(2), hy + 2, p.metalDark);
      c.set(X(2), hy + 3, p.metalShade);
      break;
    case 'plate':
      c.rect(X(-1), hy, 4, 4, p.metalShade);
      c.line(X(1), hy + 2, X(2), hy + 2, '#0c0c0c');
      c.set(X(-1), hy - 1, p.trim);
      c.set(X(0), hy - 1, p.trim);
      c.set(X(-2), hy - 1, p.trim);
      break;
    case 'kettle':
      c.rect(X(-1), hy + 1, 4, 3, p.skin);
      c.set(X(2), hy + 2, '#1b1410');
      c.line(X(-2), hy + 1, X(3), hy + 1, p.metal);
      c.rect(X(-1), hy, 4, 1, p.metalShade);
      c.set(X(-1), hy + 3, p.metalShade);
      break;
    case 'coif':
      c.rect(X(-1), hy, 4, 4, p.metalShade);
      c.rect(X(1), hy + 1, 2, 2, p.skin);
      c.set(X(2), hy + 1, '#1b1410');
      break;
    case 'hood':
      c.rect(X(-1), hy, 4, 4, '#4a3b28');
      c.rect(X(1), hy + 1, 2, 3, p.skin);
      c.set(X(2), hy + 2, '#1b1410');
      c.set(X(-2), hy + 1, '#3a2e1f');
      break;
    case 'cap':
      c.rect(X(-1), hy + 1, 4, 3, p.skin);
      c.set(X(2), hy + 2, '#1b1410');
      c.rect(X(-1), hy, 4, 1, '#5d4a33');
      c.set(X(-1), hy + 1, '#3b2d1e');
      break;
  }

  // Shield on the near arm (drawn behind the weapon arm).
  const sy = top - 4;
  if (look.shield === 'kite') {
    c.rect(X(-4), sy, 3, 4, p.team);
    c.rect(X(-3), sy + 4, 1, 1, p.team);
    c.line(X(-4), sy, X(-4), sy + 3, p.teamShade);
    c.set(X(-3), sy + 1, p.cloth);
    c.set(X(-3), sy + 2, p.cloth);
  } else if (look.shield === 'round') {
    c.rect(X(-4), sy, 3, 3, p.team);
    c.set(X(-3), sy + 1, p.metal);
    c.set(X(-4), sy, p.teamShade);
  } else if (look.shield === 'pavise') {
    // Slung on the back.
    c.rect(X(-4), sy - 1, 2, 6, p.team);
    c.line(X(-4), sy - 1, X(-4), sy + 4, p.teamShade);
  } else {
    // Bare arm.
    c.line(X(-3), top - 4, X(-3), top - 2, p.metalShade);
  }

  // The weapon arm and its weapon.
  const ax = X(3);
  const ay = top - 3;
  c.set(ax, top - 4, p.metalShade);
  c.set(ax, ay, p.skin);
  const W = p.wood;
  switch (look.weapon) {
    case 'sword':
    case 'mace':
      if (attack) {
        c.line(ax + 1, ay, ax + 4, ay, look.weapon === 'mace' ? p.metalShade : p.metal);
        c.set(ax + 1, ay - 1, p.leatherDark);
        c.set(ax + 1, ay + 1, p.leatherDark);
        if (look.weapon === 'mace') c.rect(ax + 4, ay - 1, 2, 3, p.metalDark);
      } else {
        c.line(ax, ay - 1, ax, ay - 4, look.weapon === 'mace' ? W : p.metal);
        c.line(ax - 1, ay - 1, ax + 1, ay - 1, p.leatherDark);
        if (look.weapon === 'mace') c.rect(ax - 1, ay - 6, 3, 2, p.metalDark);
      }
      break;
    case 'spear':
    case 'lance':
      if (attack) {
        c.line(ax - 5, ay, ax + 7, ay, W);
        c.line(ax + 8, ay, ax + 9, ay, p.metal);
      } else {
        c.line(ax, ay + 3, ax, ay - 10, W);
        c.line(ax, ay - 11, ax, ay - 12, p.metal);
        if (look.weapon === 'lance') {
          c.set(ax + 1, ay - 10, p.team);
          c.set(ax + 2, ay - 10, p.teamLight);
          c.set(ax + 1, ay - 9, p.team);
        }
      }
      break;
    case 'poleaxe':
      if (attack) {
        c.line(ax - 3, ay - 3, ax + 4, ay + 1, W);
        c.rect(ax + 4, ay, 2, 3, p.metal);
        c.set(ax + 6, ay + 1, p.metalShade);
      } else {
        c.line(ax, ay + 3, ax, ay - 8, W);
        c.rect(ax + 1, ay - 8, 2, 3, p.metal);
        c.set(ax, ay - 9, p.metal);
      }
      break;
    case 'javelin':
      if (attack) {
        c.line(ax - 2, ay - 5, ax + 4, ay - 8, W);
        c.set(ax + 5, ay - 9, p.metal);
        c.set(ax, ay - 1, p.skin);
      } else {
        c.line(ax, ay + 2, ax, ay - 7, W);
        c.set(ax, ay - 8, p.metal);
        c.line(ax - 4, ay - 2, ax - 4, ay - 6, W);
      }
      break;
    case 'bow':
      if (attack) {
        // Drawn: the bow out in front, string back to the cheek.
        c.line(ax + 2, ay - 4, ax + 3, ay - 2, W);
        c.line(ax + 3, ay - 1, ax + 3, ay + 1, W);
        c.line(ax + 3, ay + 2, ax + 2, ay + 3, W);
        c.line(ax + 2, ay - 4, ax - 1, ay - 1, '#c9bfa6');
        c.line(ax - 1, ay - 1, ax + 2, ay + 3, '#c9bfa6');
        c.line(ax - 1, ay - 1, ax + 4, ay - 1, '#b7a27a');
      } else {
        c.line(ax + 1, ay - 5, ax + 2, ay - 3, W);
        c.line(ax + 2, ay - 2, ax + 2, ay + 1, W);
        c.line(ax + 2, ay + 2, ax + 1, ay + 3, W);
        c.line(ax + 1, ay - 5, ax + 1, ay + 3, '#a89a80');
        // Quiver.
        c.line(X(-2), top - 6, X(-3), top - 2, p.leather);
      }
      break;
    case 'crossbow':
      c.line(ax - 1, ay, ax + 4, ay, W);
      c.line(ax + 4, ay - 2, ax + 4, ay + 2, attack ? p.metal : p.metalShade);
      if (attack) c.set(ax + 5, ay, '#b7a27a');
      break;
  }
}

function paintCorpse(c: Canvas, p: Palette, look: FootLook, fx: number, fy: number): void {
  // Lying on his back, head to the right: legs, torso, head, the weapon beside.
  const y = fy - 1;
  const cloth = look.body === 'plate' ? p.metalShade : look.body === 'gambeson' ? '#8a7a5c' : look.body === 'tunic' ? '#6b5a3e' : p.cloth;
  c.line(fx - 6, y, fx - 3, y, p.leatherDark);
  c.line(fx - 6, y - 1, fx - 4, y - 1, p.leather);
  c.rect(fx - 3, y - 1, 5, 2, cloth);
  if (look.cross) {
    c.line(fx - 1, y - 1, fx - 1, y, p.trim);
  }
  const helm = look.helm === 'hood' ? '#4a3b28' : look.helm === 'kettle' || look.helm === 'cap' ? p.skin : p.metal;
  c.rect(fx + 2, y - 1, 2, 2, helm);
  if (look.shield) c.rect(fx - 2, y - 3, 3, 2, p.team);
  c.line(fx - 4, y + 1, fx + 3, y + 1, look.weapon === 'bow' || look.weapon === 'spear' || look.weapon === 'lance' ? p.wood : p.metalShade);
}

// ------------------------------------------------------------------ horses

interface HorseLook {
  coat: string;
  coatShade: string;
  barding: boolean;
}

function paintHorse(c: Canvas, p: Palette, h: HorseLook, frame: number, fx: number, fy: number): void {
  const walk = frame === Frame.Walk || frame === Frame.Rout;
  const coat = h.coat;
  const shade = h.coatShade;
  // Legs (four), striding when walking.
  const legs = walk ? [[-6, -2], [-4, 1], [4, -1], [6, 2]] : [[-6, 0], [-4, 0], [4, 0], [6, 0]];
  for (const [lx, sw] of legs) {
    c.line(fx + lx! + sw!, fy, fx + lx!, fy - 4, lx! < 0 ? shade : coat);
    c.set(fx + lx! + sw!, fy, '#1a1410');
  }
  // Body.
  c.rect(fx - 7, fy - 8, 15, 4, coat);
  c.line(fx - 7, fy - 5, fx + 7, fy - 5, shade);
  // Neck and head, rising forward.
  c.rect(fx + 6, fy - 11, 3, 4, coat);
  c.rect(fx + 8, fy - 12, 4, 3, coat);
  c.set(fx + 11, fy - 10, shade);
  c.set(fx + 9, fy - 12, '#1a1410');
  c.set(fx + 7, fy - 13, shade);
  // Mane and tail.
  c.line(fx + 6, fy - 12, fx + 6, fy - 8, '#20160f');
  c.line(fx - 8, fy - 8, fx - 9, fy - 4, '#20160f');
  if (h.barding) {
    // White caparison with the cross, falling to the knees.
    c.rect(fx - 7, fy - 9, 15, 6, p.cloth);
    c.line(fx - 7, fy - 4, fx + 7, fy - 4, p.clothShade);
    c.line(fx - 7, fy - 9, fx - 7, fy - 4, p.clothShade);
    c.line(fx, fy - 9, fx, fy - 4, p.trim);
    c.line(fx - 2, fy - 7, fx + 2, fy - 7, p.trim);
    c.rect(fx + 6, fy - 12, 3, 4, p.cloth);
    c.set(fx + 8, fy - 9, p.team);
    c.set(fx - 7, fy - 3, p.team);
    c.set(fx + 7, fy - 3, p.team);
  } else {
    // Saddle cloth in the army's colour.
    c.rect(fx - 2, fy - 9, 5, 3, p.team);
    c.line(fx - 2, fy - 7, fx + 2, fy - 7, p.teamShade);
  }
}

function paintDeadHorse(c: Canvas, h: HorseLook, p: Palette, fx: number, fy: number): void {
  c.rect(fx - 8, fy - 3, 15, 3, h.barding ? p.cloth : h.coat);
  c.line(fx - 8, fy - 1, fx + 6, fy - 1, h.coatShade);
  c.rect(fx + 7, fy - 2, 4, 2, h.coat);
  c.line(fx - 5, fy - 4, fx - 2, fy - 6, h.coatShade);
  c.line(fx + 2, fy - 4, fx + 5, fy - 6, h.coatShade);
}

// ------------------------------------------------------------------ the engine

function paintMangonel(c: Canvas, p: Palette, frame: number, fx: number, fy: number): void {
  const wood = p.wood;
  const dark = p.woodDark;
  // Base frame and wheels.
  c.rect(fx - 9, fy - 3, 18, 2, wood);
  c.line(fx - 9, fy - 1, fx + 8, fy - 1, dark);
  for (const wx of [-7, 6]) {
    c.rect(fx + wx - 1, fy - 2, 3, 3, dark);
    c.set(fx + wx, fy - 1, p.metalShade);
  }
  // Uprights.
  c.line(fx - 2, fy - 3, fx - 2, fy - 9, dark);
  c.line(fx + 2, fy - 3, fx + 2, fy - 9, dark);
  c.line(fx - 2, fy - 9, fx + 2, fy - 9, wood);
  // The arm: cocked back, or thrown forward.
  if (frame === Frame.Attack) {
    c.line(fx, fy - 8, fx + 7, fy - 15, wood);
    c.rect(fx + 7, fy - 17, 2, 2, p.leather);
  } else {
    c.line(fx, fy - 8, fx - 8, fy - 4, wood);
    c.rect(fx - 10, fy - 5, 2, 2, p.leather);
    c.set(fx - 9, fy - 6, '#7d7768');
  }
  // Torsion skein.
  c.rect(fx - 1, fy - 5, 3, 2, p.leatherDark);
  // A crewman in the army's colour.
  paintFoot(c, p, { helm: 'cap', body: 'tunic', weapon: 'mace', shield: null, cross: false }, Frame.Idle, fx + 11, fy);
  c.rect(fx + 10, fy - 7, 3, 1, p.team);
}

// ------------------------------------------------------------------ looks per class

const FOOT: Partial<Record<number, FootLook>> = {
  [U.HeavyInfantry]: { helm: 'great', body: 'tabard', weapon: 'sword', shield: 'kite', cross: true },
  [U.Spearmen]: { helm: 'kettle', body: 'gambeson', weapon: 'spear', shield: 'round', cross: false },
  [U.Skirmishers]: { helm: 'cap', body: 'tunic', weapon: 'javelin', shield: 'round', cross: false },
  [U.Archers]: { helm: 'hood', body: 'tunic', weapon: 'bow', shield: null, cross: false },
  [U.Crossbowmen]: { helm: 'kettle', body: 'gambeson', weapon: 'crossbow', shield: 'pavise', cross: false },
  [U.Shock]: { helm: 'plate', body: 'plate', weapon: 'poleaxe', shield: null, cross: true },
};

const RIDER: Partial<Record<number, { look: FootLook; horse: HorseLook }>> = {
  [U.LightCavalry]: { look: { helm: 'coif', body: 'tunic', weapon: 'spear', shield: 'round', cross: false }, horse: { coat: '#6e4a2c', coatShade: '#4d321d', barding: false } },
  [U.HorseArchers]: { look: { helm: 'cap', body: 'tunic', weapon: 'bow', shield: null, cross: false }, horse: { coat: '#8a6a45', coatShade: '#5f4730', barding: false } },
  [U.Knights]: { look: { helm: 'great', body: 'tabard', weapon: 'lance', shield: 'kite', cross: true }, horse: { coat: '#3a2e26', coatShade: '#241c17', barding: true } },
  [COMMANDER]: { look: { helm: 'great', body: 'tabard', weapon: 'sword', shield: 'kite', cross: true }, horse: { coat: '#d8d2c4', coatShade: '#9d968a', barding: true } },
};

function paint(kind: number, frame: number, p: Palette): Canvas {
  const c = new Canvas(CELL_W, CELL_H);
  const fx = FOOT_X;
  const fy = FOOT_Y;
  if (kind === U.Artillery) {
    if (frame === Frame.Dead) {
      // A wrecked engine.
      c.line(fx - 9, fy - 1, fx + 8, fy - 2, p.woodDark);
      c.line(fx - 3, fy - 1, fx + 4, fy - 5, p.wood);
      c.rect(fx + 5, fy - 2, 3, 2, p.woodDark);
    } else paintMangonel(c, p, frame, fx, fy);
  } else if (RIDER[kind]) {
    const r = RIDER[kind]!;
    if (frame === Frame.Dead) {
      paintDeadHorse(c, r.horse, p, fx, fy);
      paintCorpse(c, p, r.look, fx - 2, fy - 3);
    } else {
      paintHorse(c, p, r.horse, frame, fx, fy);
      paintFoot(c, p, r.look, frame, fx - 1, fy - 8, true);
      // The rider's leg.
      c.line(fx - 1, fy - 7, fx, fy - 5, r.look.body === 'tabard' ? p.metalShade : p.leatherDark);
      if (kind === COMMANDER) {
        // A plume and a banner on his back.
        c.set(fx - 1, fy - 22, '#c9a24a');
        c.set(fx, fy - 22, '#c9a24a');
        c.line(fx - 4, fy - 9, fx - 4, fy - 19, p.woodDark);
        c.rect(fx - 9, fy - 19, 5, 4, '#e8e2d2');
        c.line(fx - 7, fy - 19, fx - 7, fy - 16, p.trim);
        c.line(fx - 9, fy - 18, fx - 5, fy - 18, p.trim);
      }
    }
  } else {
    const look = FOOT[kind]!;
    if (frame === Frame.Dead) paintCorpse(c, p, look, fx, fy);
    else paintFoot(c, p, frame === Frame.Rout ? { ...look, shield: null, weapon: look.weapon === 'bow' ? 'bow' : 'sword' } : look, frame, fx, fy);
  }
  c.outline(p.outline);
  return c;
}

/** One army's sprites: every class and frame, facing right (row 0) and left (row 1). */
export interface Atlas {
  canvas: HTMLCanvasElement;
  /** Source x, y for a sprite. */
  at(kind: number, frame: number, left: boolean): [number, number];
}

export function buildAtlas(faction: FactionId, hue: number): Atlas {
  const p = paletteFor(faction, hue);
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * KINDS * FRAME_COUNT;
  canvas.height = CELL_H * 2;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const cache = new Map<string, [number, number, number]>();
  const rgb = (c: string) => {
    let v = cache.get(c);
    if (!v) cache.set(c, (v = toRgb(c)));
    return v;
  };
  for (let k = 0; k < KINDS; k++) {
    for (let f = 0; f < FRAME_COUNT; f++) {
      const sprite = paint(k, f, p);
      for (let row = 0; row < 2; row++) {
        const ox = (k * FRAME_COUNT + f) * CELL_W;
        const oy = row * CELL_H;
        for (let y = 0; y < CELL_H; y++)
          for (let x = 0; x < CELL_W; x++) {
            const c = sprite.get(row === 0 ? x : CELL_W - 1 - x, y);
            if (!c) continue;
            const [r, g, b] = rgb(c);
            const i = ((oy + y) * canvas.width + ox + x) * 4;
            img.data[i] = r;
            img.data[i + 1] = g;
            img.data[i + 2] = b;
            img.data[i + 3] = 255;
          }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, at: (kind, frame, left) => [(kind * FRAME_COUNT + frame) * CELL_W, left ? CELL_H : 0] };
}
