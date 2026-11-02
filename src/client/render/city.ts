// The commandery as a pixel diorama: walls, keep and the eight buildings, each drawn at its
// level (an empty lot, a timber hall, a stone hall, a fortified one, a grand one), with the
// day's recruits drilling in the yard and smoke over the forges.

import type { BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { Rng } from '../../game/rng.ts';
import { U } from '../../game/units.ts';
import { Post } from './post.ts';
import { Anim } from './contract.ts';
import { buildAtlas, hsl, type Atlas } from './sprites.ts';

export const CITY_W = 400;
export const CITY_H = 225;

/** Where each building stands (its front-centre, on the ground). */
export const LOTS: Record<BuildingKey, [number, number]> = {
  chapter: [200, 62],
  barracks: [96, 96],
  range: [306, 96],
  stables: [92, 160],
  workshop: [310, 160],
  hospital: [250, 196],
  granary: [150, 196],
  walls: [200, 214],
};

interface Smoke {
  x: number;
  y: number;
  t: number;
}

type G = CanvasRenderingContext2D;

function rect(g: G, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A pitched roof seen from the front: rows narrowing to the ridge. */
function roof(g: G, x: number, y: number, w: number, h: number, c: string, shade: string): void {
  for (let r = 0; r < h; r++) {
    const inset = Math.round((r * w) / (2 * h + 2));
    rect(g, x + inset, y + h - 1 - r, w - 2 * inset, 1, r % 2 ? c : shade);
  }
}

function banner(g: G, x: number, y: number, hue: number, tick: number, templar = true): void {
  rect(g, x, y, 1, 12, '#2a1d12');
  const wave = (tick >> 3) % 2;
  rect(g, x + 1, y, 6, 5, templar ? '#e6e0d0' : hsl(hue, 55, 36));
  rect(g, x + 6 + wave, y + 1, 1, 4, templar ? '#e6e0d0' : hsl(hue, 55, 36));
  rect(g, x + 3, y, 1, 5, '#9c1c1c');
  rect(g, x + 1, y + 2, 6, 1, '#9c1c1c');
  rect(g, x + 1, y + 5, 6, 1, hsl(hue, 55, 30));
}

function windows(g: G, x: number, y: number, w: number, n: number, lit: boolean): void {
  for (let i = 0; i < n; i++) {
    const wx = x + Math.round(((i + 1) * w) / (n + 1)) - 1;
    rect(g, wx, y, 2, 3, lit ? '#d9a441' : '#1a120c');
  }
}

/** A building at `level` with its front-centre at (x, y). Returns where its chimney is, if any. */
function building(g: G, key: BuildingKey, level: number, x: number, y: number, hue: number, tick: number): [number, number] | null {
  if (key === 'walls') return null;
  if (level <= 0) {
    // An empty lot: trodden earth, stakes and a rope.
    rect(g, x - 14, y - 6, 28, 7, '#4a3f2c');
    rect(g, x - 14, y - 6, 28, 1, '#3a3123');
    for (const sx of [-13, 12]) rect(g, x + sx, y - 10, 1, 5, '#6b4a2c');
    rect(g, x - 12, y - 9, 24, 1, '#8c7d5e');
    return null;
  }
  const tier = level >= 15 ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : 1;
  const w = [0, 24, 32, 38, 44][tier]! + Math.min(6, level % 5);
  const h = [0, 9, 12, 14, 16][tier]!;
  const left = x - w / 2;
  const top = y - h;
  const stone = tier >= 2;
  // Walls of the hall.
  rect(g, left, top, w, h, stone ? '#8a8578' : '#6e4e30');
  rect(g, left, top, w, 1, stone ? '#a19c8f' : '#86613d');
  rect(g, left, y - 1, w, 1, stone ? '#5e5a51' : '#4b3420');
  if (!stone) for (let i = 4; i < w; i += 5) rect(g, left + i, top + 1, 1, h - 2, '#5b3f26');
  else for (let r = 2; r < h; r += 3) for (let i = (r % 2) * 3; i < w; i += 6) rect(g, left + i, top + r, 1, 1, '#6f6b61');
  // Roof: thatch, then red tile, then slate.
  const rh = Math.round(h * 0.9) + 2;
  const [rc, rs] = tier === 1 ? ['#9d8650', '#7f6a3d'] : tier <= 3 ? ['#8c3b2a', '#6e2d20'] : ['#4f5560', '#3c414a'];
  roof(g, left - 2, top - rh, w + 4, rh, rc, rs);
  // Door and windows.
  rect(g, x - 2, y - 6, 4, 6, '#2b1d12');
  rect(g, x - 2, y - 6, 4, 1, stone ? '#5e5a51' : '#4b3420');
  if (tier >= 2) windows(g, left, top + 3, w, Math.floor(w / 9), (tick >> 6) % 3 !== 0 && tier >= 3);
  // A tower at the higher tiers.
  if (tier >= 3) {
    const tx = left + w - 4;
    rect(g, tx, top - rh - 8, 9, h + rh + 8, '#7d786c');
    for (let i = 0; i < 9; i += 2) rect(g, tx + i, top - rh - 10, 1, 2, '#7d786c');
    rect(g, tx + 3, top - rh - 2, 2, 3, '#1a120c');
    banner(g, tx + 4, top - rh - 22, hue, tick);
  }
  if (tier >= 4) {
    banner(g, left - 1, top - rh - 12, hue, tick + 5);
    rect(g, left, top + h - 3, w, 1, '#c9a24a');
  }

  // What each building is for.
  switch (key) {
    case 'chapter':
      // A bell-cote and the cross.
      rect(g, x - 1, top - rh - 9, 3, 9, stone ? '#8a8578' : '#6e4e30');
      rect(g, x, top - rh - 15, 1, 6, '#c9c2b0');
      rect(g, x - 2, top - rh - 13, 5, 1, '#c9c2b0');
      if (tier >= 2) rect(g, x - 1, top + 2, 3, 4, '#7a2a2a');
      break;
    case 'range':
      // Butts: straw targets on the green.
      for (let i = 0; i < Math.min(4, 1 + Math.floor(level / 4)); i++) {
        const bx = x + w / 2 + 6 + i * 7;
        rect(g, bx, y - 7, 5, 6, '#a88c4e');
        rect(g, bx + 1, y - 6, 3, 4, '#d8d0b8');
        rect(g, bx + 2, y - 5, 1, 2, '#9c1c1c');
      }
      break;
    case 'stables':
      // A paddock fence and horses.
      rect(g, x + w / 2 + 2, y - 4, 24, 1, '#6b4a2c');
      rect(g, x + w / 2 + 2, y - 1, 24, 1, '#6b4a2c');
      for (let i = 0; i <= 24; i += 6) rect(g, x + w / 2 + 2 + i, y - 6, 1, 6, '#5b3f26');
      break;
    case 'workshop':
      // Timber stacked outside, and an engine under work.
      for (let i = 0; i < 3; i++) rect(g, x - w / 2 - 14, y - 2 - i * 2, 10, 2, i % 2 ? '#7a5634' : '#5e4128');
      if (level >= 3) {
        rect(g, x + w / 2 + 3, y - 3, 14, 2, '#7a5634');
        rect(g, x + w / 2 + 9, y - 10, 1, 8, '#4e3420');
        rect(g, x + w / 2 + 4, y - 9, 12, 1, '#7a5634');
      }
      break;
    case 'granary':
      // Sacks by the door.
      for (let i = 0; i < Math.min(5, 1 + Math.floor(level / 3)); i++) rect(g, x + w / 2 + 2 + i * 4, y - 3, 3, 3, i % 2 ? '#bda877' : '#a8935f');
      break;
    case 'hospital':
      // A white banner with the red cross over the door.
      rect(g, x - 3, top - 5, 7, 5, '#e6e0d0');
      rect(g, x, top - 5, 1, 5, '#9c1c1c');
      rect(g, x - 3, top - 3, 7, 1, '#9c1c1c');
      break;
    case 'barracks':
      // A weapon rack.
      for (let i = 0; i < 4; i++) rect(g, x - w / 2 - 10 + i * 2, y - 8, 1, 8, '#7a5634');
      rect(g, x - w / 2 - 10, y - 9, 8, 1, '#9aa0a6');
      break;
  }
  return key === 'barracks' || key === 'workshop' || key === 'hospital' ? [left + 4, top - rh + 2] : null;
}

function walls(g: G, level: number, hue: number, tick: number): void {
  const x0 = 26;
  const x1 = CITY_W - 26;
  const y0 = 34;
  const y1 = CITY_H - 8;
  if (level <= 0) {
    // A ditch only.
    g.fillStyle = 'rgba(25,18,10,0.6)';
    g.fillRect(x0, y0, x1 - x0, 1);
    g.fillRect(x0, y0, 1, y1 - y0);
    g.fillRect(x1, y0, 1, y1 - y0);
    return;
  }
  const stone = level >= 5;
  const hgt = stone ? (level >= 10 ? 9 : 6) : 5;
  const face = stone ? '#7d786c' : '#6b4a2c';
  const top = stone ? '#9a9588' : '#86613d';
  // Back wall, then the sides, then the front with a gate.
  const run = (ax: number, ay: number, bx: number) => {
    rect(g, ax, ay - hgt, bx - ax, hgt, face);
    rect(g, ax, ay - hgt, bx - ax, 1, top);
    if (stone) for (let i = ax; i < bx; i += 3) rect(g, i, ay - hgt - 2, 2, 2, face);
    else for (let i = ax; i < bx; i += 2) rect(g, i, ay - hgt - 1, 1, 1, '#4b3420');
  };
  run(x0, y0, x1);
  rect(g, x0 - 1, y0 - hgt, 3, y1 - y0 + hgt, face);
  rect(g, x1 - 2, y0 - hgt, 3, y1 - y0 + hgt, face);
  run(x0, y1, 180);
  run(220, y1, x1);
  if (level >= 10) {
    for (const [tx, ty] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
      rect(g, tx - 6, ty - hgt - 10, 12, hgt + 12, '#706b60');
      for (let i = 0; i < 12; i += 3) rect(g, tx - 6 + i, ty - hgt - 12, 2, 2, '#706b60');
    }
    banner(g, 178, y1 - hgt - 20, hue, tick);
    banner(g, 222, y1 - hgt - 20, hue, tick + 3);
  }
  // Gatehouse.
  rect(g, 180, y1 - hgt - 6, 40, hgt + 6, stone ? '#86817a' : '#5b3f26');
  rect(g, 192, y1 - 10, 16, 10, '#1a120c');
  if (stone) rect(g, 192, y1 - 10, 16, 1, '#3b3934');
}

function fields(g: G, level: number, rng: Rng): void {
  // Strips of crops outside the walls, more with the granary.
  const n = Math.min(12, 2 + level);
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const x = left ? 2 : CITY_W - 22;
    const y = 40 + Math.floor(i / 2) * 15;
    for (let r = 0; r < 12; r += 2) rect(g, x, y + r, 20, 1, rng.next() < 0.5 ? '#8f8a45' : '#6f7a3a');
  }
}

export class CityScene {
  readonly buffer: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly atlas: Atlas;
  private readonly post = new Post();
  private smoke: Smoke[] = [];
  private tick = 0;

  constructor(
    readonly faction: FactionId,
    readonly hue: number,
    seed: number,
  ) {
    this.buffer = document.createElement('canvas');
    this.buffer.width = CITY_W;
    this.buffer.height = CITY_H;
    this.g = this.buffer.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = CITY_W;
    this.base.height = CITY_H;
    const b = this.base.getContext('2d')!;
    const rng = new Rng(seed);
    // Earth and grass, dithered.
    const img = b.createImageData(CITY_W, CITY_H);
    for (let y = 0; y < CITY_H; y++)
      for (let x = 0; x < CITY_W; x++) {
        const inside = x > 26 && x < CITY_W - 26 && y > 34 && y < CITY_H - 8;
        const n = rng.next();
        const c = inside ? (n < 0.5 ? [72, 62, 44] : n < 0.85 ? [80, 70, 50] : [62, 54, 38]) : n < 0.6 ? [58, 66, 38] : n < 0.9 ? [66, 72, 42] : [48, 54, 32];
        const i = (y * CITY_W + x) * 4;
        img.data[i] = c[0]!;
        img.data[i + 1] = c[1]!;
        img.data[i + 2] = c[2]!;
        img.data[i + 3] = 255;
      }
    b.putImageData(img, 0, 0);
    // The yard's paths.
    b.fillStyle = 'rgba(40,32,22,0.5)';
    b.fillRect(196, 70, 8, CITY_H - 78);
    b.fillRect(60, 128, CITY_W - 120, 6);
    this.atlas = buildAtlas(faction, hue);
  }

  draw(out: HTMLCanvasElement, levels: Record<BuildingKey, number>, recruits: number, dt: number): void {
    this.tick++;
    const g = this.g;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0);
    fields(g, levels.granary, new Rng(3));
    walls(g, levels.walls, this.hue, this.tick);
    // The keep at the heart of the commandery.
    const keep = Math.max(...Object.values(levels));
    const kh = 22 + Math.min(20, keep);
    rect(g, 186, 132 - kh, 28, kh, '#7f7a6e');
    rect(g, 186, 132 - kh, 28, 1, '#9e998c');
    for (let i = 0; i < 28; i += 4) rect(g, 186 + i, 130 - kh, 2, 2, '#7f7a6e');
    rect(g, 197, 120, 6, 12, '#1a120c');
    windows(g, 186, 140 - kh, 28, 3, (this.tick >> 6) % 2 === 0);
    banner(g, 199, 112 - kh, this.hue, this.tick, true);

    // Buildings, back to front.
    const keys = (Object.keys(LOTS) as BuildingKey[]).sort((a, b) => LOTS[a][1] - LOTS[b][1]);
    for (const key of keys) {
      const [x, y] = LOTS[key];
      const chimney = building(g, key, levels[key] ?? 0, x, y, this.hue, this.tick);
      if (chimney && this.tick % 9 === 0) this.smoke.push({ x: chimney[0], y: chimney[1], t: 0 });
    }

    // Today's recruits drilling in the yard, in a block that marches back and forth.
    const n = Math.min(48, recruits);
    const cols = 8;
    const span = 40;
    const phase = (this.tick % 480) / 480;
    const sweep = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const facingLeft = phase >= 0.5;
    const kinds = [U.HeavyInfantry, U.Spearmen, U.Archers, U.Crossbowmen];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 140 + col * 7 + sweep * span + (row % 2) * 3;
      const y = 140 + row * 6;
      const kind = kinds[row % kinds.length]!;
      const a = this.atlas;
      const frame = Math.floor((this.tick + col * 3) / 6);
      const [sx, sy] = a.at(kind, Anim.Walk, frame, facingLeft ? 1 : 0);
      g.drawImage(a.image, sx, sy, a.cellW, a.cellH, Math.round(x) - a.footX, Math.round(y) - a.footY, a.cellW, a.cellH);
    }

    // Smoke.
    let w = 0;
    for (const s of this.smoke) {
      s.t += dt;
      if (s.t > 3) continue;
      const size = 1 + Math.floor(s.t * 1.5);
      g.globalAlpha = 0.5 * (1 - s.t / 3);
      rect(g, s.x + s.t * 4 - size / 2, s.y - s.t * 8 - size / 2, size, size, '#8a847a');
      this.smoke[w++] = s;
    }
    this.smoke.length = w;
    g.globalAlpha = 1;

    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0907';
    ctx.fillRect(0, 0, out.width, out.height);
    const fit = Math.min(out.width / CITY_W, out.height / CITY_H);
    // Whole pixels when that wastes little room, else fill the frame.
    const px = fit >= 1 && Math.floor(fit) / fit > 0.85 ? Math.floor(fit) : fit;
    const dw = Math.round(CITY_W * px);
    const dh = Math.round(CITY_H * px);
    const dx = Math.round((out.width - dw) / 2);
    const dy = Math.round((out.height - dh) / 2);
    ctx.drawImage(this.buffer, dx, dy, dw, dh);
    this.post.apply(ctx, dx, dy, dw, dh, px, true);
  }
}
