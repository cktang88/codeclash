import { CanvasSource, Texture } from 'pixi.js';
import { canvas2d, seeded } from './paint.ts';

// Painted miniatures for the map's sites, in the chronicle's hand: warm ink
// outlines, light from the upper left, cool hatched shadow on the right. Each
// site comes as layers: a neutral body, a white "pigment" mask tinted with the
// holder's army colour, and emissive layers (windows, runes, molten cracks)
// that the night lighting brightens. Coordinates are logical pixels; canvases
// are painted at RES× for crisp close-ups.

const RES = 2;
const INK = '#2a1d12';
const INK_SOFT = 'rgba(42,29,18,0.55)';
const HATCH = 'rgba(38,40,66,0.42)';
const SHADOW = 'rgba(28,36,66,0.36)';
const STONE_HI = '#d8ccb0';
const STONE = '#b5a78a';
const STONE_MID = '#978a70';
const STONE_LO = '#6e6656';

export interface Anchor {
  x: number;
  y: number;
}

export interface CastleArt {
  body: Texture;
  /** Roofs and wall hangings, tinted with the army's pigment. */
  pigment: Texture;
  /** Lit windows, drawn additively at night. */
  windows: Texture;
  ruins: Texture;
  /** One gate leaf (the left); the right is the same, mirrored. */
  door: Texture;
  /** Size of the painted cell; anchors below are relative to its feet. */
  w: number;
  h: number;
  feet: Anchor;
  gate: { x: number; y: number; w: number; h: number };
  /** Flag pole tips: the keep's turret first, then the towers. */
  poles: { x: number; y: number; size: number }[];
  chimneys: Anchor[];
}

export interface ShrineArt {
  body: Texture;
  /** The carved code-glyph runes: tinted in the holder's hue, and drawn again additively as glow. */
  runes: Texture;
  w: number;
  h: number;
  feet: Anchor;
}

export interface MonolithArt {
  body: Texture;
  /** Molten cracks at three stages of ruin. */
  cracks: [Texture, Texture, Texture];
  w: number;
  h: number;
  feet: Anchor;
}

export interface HeartArt {
  body: Texture;
  pigment: Texture;
  w: number;
  h: number;
  feet: Anchor;
}

export interface SiteArt {
  castle: CastleArt;
  shrine: ShrineArt;
  monolith: MonolithArt;
  heart: HeartArt;
  /** A legend's statue on its plinth, in gilded bronze. */
  statue: Texture;
  /** The Season Victor's obelisk. */
  obelisk: Texture;
  /** A vellum scroll for map labels; nine-slice it with `cartouche.slice`. */
  cartouche: Texture;
  cartoucheSlice: { left: number; right: number; top: number; bottom: number };
  /** A heraldic shield token for far zoom, tinted with the army's pigment. */
  shield: { body: Texture; pigment: Texture };
}

function paint(w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void): Texture {
  const [c, ctx] = canvas2d(w * RES, h * RES);
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn(ctx);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: RES, autoGenerateMipmaps: true, scaleMode: 'linear' }) });
}

function outline(ctx: CanvasRenderingContext2D, width = 2.2, color = INK): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** Diagonal hatching inside the current path, in its right-hand part. */
function hatch(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, gap = 3, color = HATCH, width = 0.9): void {
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let x = x0 - (y1 - y0); x < x1; x += gap) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x + (y1 - y0), y0);
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, SHADOW);
  g.addColorStop(0.7, 'rgba(28,36,66,0.22)');
  g.addColorStop(1, 'rgba(28,36,66,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ashlar courses on a wall face, offset per row. */
function courses(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rand: () => number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,46,30,0.38)';
  ctx.lineWidth = 0.8;
  let row = 0;
  for (let y = y0 + 7; y < y1; y += 7, row++) {
    ctx.beginPath();
    ctx.moveTo(x0, y + (rand() - 0.5) * 0.6);
    ctx.lineTo(x1, y + (rand() - 0.5) * 0.6);
    ctx.stroke();
    for (let x = x0 + (row % 2 ? 6 : 0) + rand() * 3; x < x1; x += 11 + rand() * 4) {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function merlons(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, fill: string, size = 9, gap = 6): void {
  for (let x = x0; x + size <= x1 + 0.5; x += size + gap) {
    ctx.beginPath();
    ctx.rect(x, y - size * 0.9, size, size * 0.9 + 1);
    ctx.fillStyle = fill;
    ctx.fill();
    outline(ctx, 1.6);
  }
}

/** A round tower: a shaded cylinder with arrow slits. Returns nothing; roof is pigment. */
function tower(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, r: number, rand: () => number): void {
  ctx.beginPath();
  ctx.rect(cx - r, top, r * 2, bottom - top);
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, STONE_MID);
  g.addColorStop(0.28, STONE_HI);
  g.addColorStop(0.62, STONE);
  g.addColorStop(1, STONE_LO);
  ctx.fillStyle = g;
  ctx.fill();
  courses(ctx, cx - r, top, cx + r, bottom, rand);
  ctx.beginPath();
  ctx.rect(cx + r * 0.25, top, r * 0.75, bottom - top);
  hatch(ctx, cx + r * 0.25, top, cx + r, bottom, 3.2);
  ctx.beginPath();
  ctx.moveTo(cx - r, bottom);
  ctx.lineTo(cx - r, top);
  ctx.lineTo(cx + r, top);
  ctx.lineTo(cx + r, bottom);
  ctx.quadraticCurveTo(cx, bottom + r * 0.35, cx - r, bottom);
  outline(ctx);
  // Corbelled walkway under the roof.
  ctx.beginPath();
  ctx.rect(cx - r - 3, top - 2, r * 2 + 6, 7);
  ctx.fillStyle = STONE;
  ctx.fill();
  outline(ctx, 1.6);
  for (let x = cx - r - 1; x < cx + r + 2; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, top + 5);
    ctx.lineTo(x + 1.5, top + 9);
    ctx.lineTo(x + 3, top + 5);
    ctx.fillStyle = STONE_MID;
    ctx.fill();
    outline(ctx, 0.8);
  }
}

function cone(ctx: CanvasRenderingContext2D, cx: number, base: number, tip: number, r: number, mode: 'body' | 'pigment'): void {
  ctx.beginPath();
  ctx.moveTo(cx - r - 4, base);
  ctx.quadraticCurveTo(cx - r * 0.4, base - (base - tip) * 0.45, cx, tip);
  ctx.quadraticCurveTo(cx + r * 0.4, base - (base - tip) * 0.45, cx + r + 4, base);
  ctx.quadraticCurveTo(cx, base + 6, cx - r - 4, base);
  ctx.closePath();
  if (mode === 'pigment') {
    const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    g.addColorStop(0, '#d8d8d8');
    g.addColorStop(0.3, '#ffffff');
    g.addColorStop(0.65, '#bdbdbd');
    g.addColorStop(1, '#7a7a7a');
    ctx.fillStyle = g;
    ctx.fill();
    // Slate shingles: curved ink courses.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,30,30,0.45)';
    ctx.lineWidth = 0.8;
    for (let y = base - 5; y > tip + 6; y -= 6) {
      const k = (y - tip) / (base - tip);
      ctx.beginPath();
      ctx.moveTo(cx - r * k - 4, y);
      ctx.quadraticCurveTo(cx, y + 4 * k, cx + r * k + 4, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(cx + r * 0.2, tip, r + 6, base - tip + 6);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - r - 4, base);
    ctx.quadraticCurveTo(cx - r * 0.4, base - (base - tip) * 0.45, cx, tip);
    ctx.quadraticCurveTo(cx + r * 0.4, base - (base - tip) * 0.45, cx + r + 4, base);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    for (let x = cx + r * 0.15 - (base - tip); x < cx + r + 6; x += 3) {
      ctx.moveTo(x, base + 4);
      ctx.lineTo(x + (base - tip), tip);
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(30,30,50,0.35)';
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(cx - r - 4, base);
    ctx.quadraticCurveTo(cx - r * 0.4, base - (base - tip) * 0.45, cx, tip);
    ctx.quadraticCurveTo(cx + r * 0.4, base - (base - tip) * 0.45, cx + r + 4, base);
    ctx.quadraticCurveTo(cx, base + 6, cx - r - 4, base);
    outline(ctx, 2, '#2a2420');
  }
}

/** A hanging wall banner, swallow-tailed. */
function hanging(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h * 0.8);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#a8a8a8');
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx, 1.6, '#2a2420');
  // A gold rod and a stitched emblem (a simple chevron) in pale thread.
  ctx.beginPath();
  ctx.moveTo(x + w * 0.22, y + h * 0.52);
  ctx.lineTo(x + w / 2, y + h * 0.3);
  ctx.lineTo(x + w * 0.78, y + h * 0.52);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(70,60,50,0.55)';
  ctx.stroke();
}

const WINDOWS: [number, number, number, number][] = [
  // x, y, w, h (arched windows and slits)
  [136, 112, 7, 12],
  [157, 112, 7, 12],
  [146, 138, 8, 13],
  [44, 168, 4, 11],
  [44, 200, 4, 11],
  [252, 168, 4, 11],
  [252, 200, 4, 11],
  [150, 60, 5, 9],
];

function windowPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

const CW = 300;
const CH = 280;

function castle(): CastleArt {
  const gate = { x: 150, y: 252, w: 34, h: 44 };
  const walls = (ctx: CanvasRenderingContext2D, rand: () => number) => {
    groundShadow(ctx, 168, 256, 150, 30);
    // The keep behind the curtain wall, with a slender turret.
    ctx.beginPath();
    ctx.rect(138, 50, 26, 50);
    const tg = ctx.createLinearGradient(138, 0, 164, 0);
    tg.addColorStop(0, STONE_HI);
    tg.addColorStop(0.55, STONE);
    tg.addColorStop(1, STONE_LO);
    ctx.fillStyle = tg;
    ctx.fill();
    courses(ctx, 138, 50, 164, 100, rand);
    ctx.beginPath();
    ctx.rect(152, 50, 12, 50);
    hatch(ctx, 152, 50, 164, 100, 3);
    ctx.beginPath();
    ctx.rect(138, 50, 26, 50);
    outline(ctx);
    ctx.beginPath();
    ctx.rect(104, 96, 94, 100);
    const kg = ctx.createLinearGradient(104, 0, 198, 0);
    kg.addColorStop(0, STONE_HI);
    kg.addColorStop(0.5, STONE);
    kg.addColorStop(1, STONE_MID);
    ctx.fillStyle = kg;
    ctx.fill();
    courses(ctx, 104, 96, 198, 196, rand);
    // The keep's right face, in shadow.
    ctx.beginPath();
    ctx.moveTo(198, 96);
    ctx.lineTo(214, 88);
    ctx.lineTo(214, 188);
    ctx.lineTo(198, 196);
    ctx.closePath();
    ctx.fillStyle = STONE_LO;
    ctx.fill();
    hatch(ctx, 198, 88, 214, 196, 2.6, 'rgba(30,32,58,0.5)');
    ctx.beginPath();
    ctx.moveTo(198, 96);
    ctx.lineTo(214, 88);
    ctx.lineTo(214, 188);
    ctx.lineTo(198, 196);
    outline(ctx);
    ctx.beginPath();
    ctx.rect(104, 96, 94, 100);
    outline(ctx);
    merlons(ctx, 104, 198, 96, STONE_HI, 10, 6);
    // Chimney on the keep's roof.
    ctx.beginPath();
    ctx.rect(116, 70, 10, 18);
    ctx.fillStyle = STONE_MID;
    ctx.fill();
    outline(ctx, 1.6);
    for (const [x, y, w, h] of WINDOWS.slice(0, 3)) {
      windowPath(ctx, x, y, w, h);
      ctx.fillStyle = '#2b1d12';
      ctx.fill();
      outline(ctx, 1.2);
    }
    windowPath(ctx, ...WINDOWS[7]!);
    ctx.fillStyle = '#2b1d12';
    ctx.fill();
    // Curtain wall.
    ctx.beginPath();
    ctx.rect(46, 176, 208, 78);
    const wg = ctx.createLinearGradient(46, 176, 254, 254);
    wg.addColorStop(0, STONE_HI);
    wg.addColorStop(0.6, STONE);
    wg.addColorStop(1, STONE_MID);
    ctx.fillStyle = wg;
    ctx.fill();
    courses(ctx, 46, 176, 254, 254, rand);
    // Cool shadow under the wall walk and at the foot.
    const sg = ctx.createLinearGradient(0, 176, 0, 192);
    sg.addColorStop(0, 'rgba(30,36,66,0.35)');
    sg.addColorStop(1, 'rgba(30,36,66,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(46, 176, 208, 16);
    ctx.beginPath();
    ctx.rect(46, 176, 208, 78);
    outline(ctx);
    merlons(ctx, 48, 252, 176, STONE_HI, 9, 6);
    // Gatehouse: an arched opening with a voussoir ring and a dark passage.
    ctx.beginPath();
    ctx.moveTo(gate.x - gate.w / 2 - 6, gate.y);
    ctx.lineTo(gate.x - gate.w / 2 - 6, gate.y - gate.h + gate.w / 2);
    ctx.arc(gate.x, gate.y - gate.h + gate.w / 2, gate.w / 2 + 6, Math.PI, 0);
    ctx.lineTo(gate.x + gate.w / 2 + 6, gate.y);
    ctx.closePath();
    ctx.fillStyle = STONE_HI;
    ctx.fill();
    outline(ctx, 1.8);
    ctx.beginPath();
    ctx.moveTo(gate.x - gate.w / 2, gate.y);
    ctx.lineTo(gate.x - gate.w / 2, gate.y - gate.h + gate.w / 2);
    ctx.arc(gate.x, gate.y - gate.h + gate.w / 2, gate.w / 2, Math.PI, 0);
    ctx.lineTo(gate.x + gate.w / 2, gate.y);
    ctx.closePath();
    const dg = ctx.createLinearGradient(0, gate.y - gate.h, 0, gate.y);
    dg.addColorStop(0, '#1f150d');
    dg.addColorStop(1, '#4a3622');
    ctx.fillStyle = dg;
    ctx.fill();
    outline(ctx, 2);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const r0 = gate.w / 2;
      const r1 = gate.w / 2 + 6;
      const cy = gate.y - gate.h + gate.w / 2;
      ctx.beginPath();
      ctx.moveTo(gate.x + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(gate.x + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = INK_SOFT;
      ctx.stroke();
    }
    // Round towers at the corners.
    tower(ctx, 46, 150, 258, 22, rand);
    tower(ctx, 254, 150, 258, 22, rand);
    for (const [x, y, w, h] of WINDOWS.slice(3, 7)) {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fillStyle = '#2b1d12';
      ctx.fill();
    }
  };
  const body = paint(CW, CH, (ctx) => walls(ctx, seeded(41)));
  const pigment = paint(CW, CH, (ctx) => {
    cone(ctx, 151, 52, 6, 16, 'pigment');
    cone(ctx, 46, 152, 96, 25, 'pigment');
    cone(ctx, 254, 152, 96, 25, 'pigment');
    hanging(ctx, 74, 192, 20, 36);
    hanging(ctx, 206, 192, 20, 36);
    hanging(ctx, 160, 150, 18, 30);
  });
  const windows = paint(CW, CH, (ctx) => {
    for (const [x, y, w, h] of WINDOWS) {
      const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, h * 1.4);
      g.addColorStop(0, 'rgba(255,190,110,0.55)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - h, y - h, w + h * 2, h * 3);
      windowPath(ctx, x + 0.8, y + 0.8, w - 1.6, h - 1.6);
      ctx.fillStyle = '#ffcf7a';
      ctx.fill();
    }
  });
  const ruins = paint(CW, CH, (ctx) => {
    const rand = seeded(77);
    groundShadow(ctx, 168, 256, 150, 30);
    // Scorched ground.
    const sg = ctx.createRadialGradient(150, 240, 10, 150, 240, 140);
    sg.addColorStop(0, 'rgba(30,20,14,0.55)');
    sg.addColorStop(1, 'rgba(30,20,14,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(150, 240, 140, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Broken keep stump and jagged curtain wall.
    const jag = (x0: number, x1: number, top: number, bottom: number, fill: string) => {
      ctx.beginPath();
      ctx.moveTo(x0, bottom);
      ctx.lineTo(x0, top + rand() * 20);
      for (let x = x0 + 8; x < x1; x += 8 + rand() * 8) ctx.lineTo(x, top + rand() * 34);
      ctx.lineTo(x1, top + rand() * 20);
      ctx.lineTo(x1, bottom);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      courses(ctx, x0, top, x1, bottom, rand);
      ctx.beginPath();
      ctx.moveTo(x0, bottom);
      ctx.lineTo(x0, top + 10);
      ctx.lineTo(x1, top + 10);
      ctx.lineTo(x1, bottom);
      ctx.closePath();
    };
    jag(108, 196, 130, 200, STONE_MID);
    outline(ctx, 0.01);
    jag(46, 254, 196, 254, STONE);
    // Soot streaks rising from the breaches.
    for (let i = 0; i < 9; i++) {
      const x = 60 + rand() * 180;
      const g = ctx.createLinearGradient(0, 250, 0, 180);
      g.addColorStop(0, 'rgba(20,14,10,0.6)');
      g.addColorStop(1, 'rgba(20,14,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 180, 10 + rand() * 12, 70);
    }
    // Ink silhouettes of the broken walls.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(46, 254);
    ctx.lineTo(254, 254);
    ctx.stroke();
    // Rubble piles.
    for (let i = 0; i < 40; i++) {
      const x = 40 + rand() * 220;
      const y = 236 + rand() * 26;
      const s = 4 + rand() * 6;
      ctx.beginPath();
      ctx.moveTo(x - s, y + s * 0.4);
      ctx.lineTo(x - s * 0.4, y - s * 0.5);
      ctx.lineTo(x + s * 0.6, y - s * 0.4);
      ctx.lineTo(x + s, y + s * 0.4);
      ctx.closePath();
      ctx.fillStyle = rand() < 0.5 ? STONE_MID : STONE_LO;
      ctx.fill();
      outline(ctx, 1.1);
    }
    // Stumps of the towers, burnt.
    for (const cx of [46, 254]) {
      ctx.beginPath();
      ctx.moveTo(cx - 22, 258);
      ctx.lineTo(cx - 22, 200 + rand() * 10);
      ctx.lineTo(cx - 6, 190 + rand() * 12);
      ctx.lineTo(cx + 8, 210 + rand() * 10);
      ctx.lineTo(cx + 22, 196 + rand() * 10);
      ctx.lineTo(cx + 22, 258);
      ctx.closePath();
      const g = ctx.createLinearGradient(cx - 22, 0, cx + 22, 0);
      g.addColorStop(0, STONE_MID);
      g.addColorStop(0.3, STONE);
      g.addColorStop(1, '#4e463c');
      ctx.fillStyle = g;
      ctx.fill();
      hatch(ctx, cx, 180, cx + 22, 260, 3);
      ctx.beginPath();
      ctx.moveTo(cx - 22, 258);
      ctx.lineTo(cx - 22, 205);
      ctx.moveTo(cx + 22, 205);
      ctx.lineTo(cx + 22, 258);
      outline(ctx);
    }
    // Charred beams.
    for (let i = 0; i < 6; i++) {
      const x = 90 + rand() * 120;
      const y = 226 + rand() * 24;
      const a = (rand() - 0.5) * 1.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.rect(-16, -2.5, 32, 5);
      ctx.fillStyle = '#2e2018';
      ctx.fill();
      outline(ctx, 1);
      ctx.restore();
    }
  });
  const door = paint(20, 46, (ctx) => {
    // One oak leaf of the gate with iron straps, hinged on its left edge.
    ctx.beginPath();
    ctx.moveTo(1, 45);
    ctx.lineTo(1, 17);
    ctx.arc(18, 17, 17, Math.PI, Math.PI * 1.5);
    ctx.lineTo(18, 45);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 18, 0);
    g.addColorStop(0, '#8a6538');
    g.addColorStop(1, '#5c4122');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,26,14,0.6)';
    ctx.lineWidth = 0.8;
    for (let x = 5; x < 18; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 46);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a342e';
    ctx.fillRect(0, 22, 18, 2.4);
    ctx.fillRect(0, 36, 18, 2.4);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(1, 45);
    ctx.lineTo(1, 17);
    ctx.arc(18, 17, 17, Math.PI, Math.PI * 1.5);
    ctx.lineTo(18, 45);
    outline(ctx, 1.4);
  });
  return {
    body,
    pigment,
    windows,
    ruins,
    door,
    w: CW,
    h: CH,
    feet: { x: 150, y: 256 },
    gate,
    poles: [
      { x: 151, y: 6, size: 1 },
      { x: 46, y: 96, size: 0.7 },
      { x: 254, y: 96, size: 0.7 },
    ],
    chimneys: [{ x: 121, y: 68 }],
  };
}

const GLYPHS = ['{ }', '=>', 'λ', '&&', '</>', '::', '#!', '[ ]', '!=', '>>'];

function stone(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, lean: number): void {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.lineTo(x - w / 2 + lean - 1, base - h * 0.82);
    ctx.quadraticCurveTo(x + lean, base - h * 1.04, x + w / 2 + lean, base - h * 0.86);
    ctx.lineTo(x + w / 2, base);
    ctx.quadraticCurveTo(x, base + 3, x - w / 2, base);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#b9b4a4');
  g.addColorStop(0.35, '#d6d0bc');
  g.addColorStop(0.7, '#9d9888');
  g.addColorStop(1, '#6b6858');
  ctx.fillStyle = g;
  ctx.fill();
  // Lichen speckles in verdigris, and the shadow side hatched.
  path();
  ctx.save();
  ctx.clip();
  const rand = seeded(Math.round(x * 13 + h));
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * w, base - rand() * h, 1 + rand() * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70,120,96,0.45)';
    ctx.fill();
  }
  ctx.restore();
  path();
  hatch(ctx, x + w * 0.1, base - h * 1.1, x + w / 2 + lean + 2, base + 2, 2.6);
  path();
  outline(ctx, 2);
}

function shrine(): ShrineArt {
  const W = 200;
  const H = 190;
  const feet = { x: 100, y: 156 };
  // Back row first, then the menhir, then the front row: painter's order.
  const ring: [number, number, number, number, number][] = [
    [46, 140, 16, 40, -1],
    [72, 132, 15, 34, 1],
    [128, 132, 15, 36, -1],
    [154, 140, 16, 42, 1],
  ];
  const front: [number, number, number, number, number][] = [
    [58, 166, 17, 30, 1],
    [142, 166, 17, 32, -1],
  ];
  const menhir = { x: 100, base: 160, w: 30, h: 112 };
  const glyphAt = (i: number) => GLYPHS[i % GLYPHS.length]!;
  const body = paint(W, H, (ctx) => {
    groundShadow(ctx, 110, 160, 92, 26);
    // A worn stone platform.
    ctx.beginPath();
    ctx.ellipse(100, 154, 84, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#a99d82';
    ctx.fill();
    outline(ctx, 1.8);
    ctx.beginPath();
    ctx.ellipse(100, 150, 62, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c4b89a';
    ctx.fill();
    outline(ctx, 1.2, INK_SOFT);
    for (const [x, b, w, h, l] of ring) stone(ctx, x, b, w, h, l);
    stone(ctx, menhir.x, menhir.base, menhir.w, menhir.h, 0);
    // Carved grooves where the runes are cut.
    ctx.font = `700 13px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(46,38,30,0.7)';
    for (let i = 0; i < 5; i++) ctx.fillText(glyphAt(i), menhir.x + 0.6, menhir.base - 22 - i * 17 + 0.6);
    for (const [x, b, w, h, l] of front) stone(ctx, x, b, w, h, l);
  });
  const runes = paint(W, H, (ctx) => {
    ctx.font = `700 13px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) ctx.fillText(glyphAt(i), menhir.x, menhir.base - 22 - i * 17);
    ctx.font = `700 9px "JetBrains Mono", monospace`;
    ring.forEach(([x, b, , h], i) => ctx.fillText(glyphAt(i + 5), x, b - h * 0.55));
    front.forEach(([x, b, , h], i) => ctx.fillText(glyphAt(i + 7), x, b - h * 0.5));
  });
  return { body, runes, w: W, h: H, feet };
}

function monolith(): MonolithArt {
  const W = 180;
  const H = 320;
  const feet = { x: 90, y: 300 };
  const shard = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(52, 286);
    ctx.lineTo(60, 120);
    ctx.lineTo(78, 30);
    ctx.lineTo(96, 12);
    ctx.lineTo(108, 40);
    ctx.lineTo(124, 132);
    ctx.lineTo(130, 286);
    ctx.closePath();
  };
  const body = paint(W, H, (ctx) => {
    groundShadow(ctx, 104, 298, 96, 22);
    // Plinth of three worn steps.
    for (const [w, y, h, c] of [[150, 300, 12, '#5d5662'], [124, 289, 10, '#4b4552'], [100, 280, 8, '#3c3744']] as const) {
      ctx.beginPath();
      ctx.rect(90 - w / 2, y - h, w, h);
      ctx.fillStyle = c;
      ctx.fill();
      hatch(ctx, 90, y - h, 90 + w / 2, y, 3);
      ctx.beginPath();
      ctx.rect(90 - w / 2, y - h, w, h);
      outline(ctx, 1.8, '#1a1420');
    }
    // The obsidian shard: a lit facet on the left, glassy black on the right.
    shard(ctx);
    ctx.fillStyle = '#17121c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(52, 286);
    ctx.lineTo(60, 120);
    ctx.lineTo(78, 30);
    ctx.lineTo(96, 12);
    ctx.lineTo(90, 150);
    ctx.lineTo(86, 286);
    ctx.closePath();
    const lg = ctx.createLinearGradient(52, 0, 96, 0);
    lg.addColorStop(0, '#4a3f5a');
    lg.addColorStop(0.5, '#2d2638');
    lg.addColorStop(1, '#201a28');
    ctx.fillStyle = lg;
    ctx.fill();
    // A glassy specular streak down the ridge, and a cool rim on the far edge.
    ctx.beginPath();
    ctx.moveTo(95, 16);
    ctx.lineTo(89, 150);
    ctx.lineTo(86, 284);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(190,180,220,0.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(66, 100);
    ctx.lineTo(80, 36);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(220,210,240,0.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(108, 42);
    ctx.lineTo(124, 132);
    ctx.lineTo(129, 284);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(110,130,190,0.45)';
    ctx.stroke();
    shard(ctx);
    outline(ctx, 2.6, '#140f18');
    // Ancient syntax, carved and dim.
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(150,136,170,0.55)';
    const lines = ['goto', 'NULL', '/* */', '0xDEAD', ';;', 'GOSUB', '#if 0', 'eval'];
    lines.forEach((t, i) => ctx.fillText(t, 92 - (i % 2) * 4, 70 + i * 26, 50));
  });
  const crackPaths: [number, number][][][] = [
    [
      [[96, 26], [92, 60], [99, 92]],
      [[74, 250], [80, 222], [74, 200]],
    ],
    [
      [[96, 26], [92, 60], [99, 92], [90, 128], [96, 160]],
      [[74, 278], [80, 222], [74, 200], [82, 176]],
      [[118, 210], [110, 182], [116, 160]],
      [[68, 128], [78, 110], [72, 88]],
    ],
    [
      [[96, 18], [92, 60], [99, 92], [90, 128], [96, 160], [88, 196], [94, 236], [86, 282]],
      [[74, 282], [80, 222], [74, 200], [82, 176], [72, 150]],
      [[124, 250], [110, 182], [116, 160], [106, 130], [112, 100]],
      [[62, 150], [78, 110], [72, 88], [80, 60]],
      [[96, 160], [110, 170], [122, 168]],
      [[90, 128], [76, 136], [62, 134]],
    ],
  ];
  const cracks = crackPaths.map((paths, stage) =>
    paint(W, H, (ctx) => {
      const width = 2 + stage * 1.6;
      ctx.save();
      shard(ctx);
      ctx.clip();
      for (const [w, color] of [[width * 4, 'rgba(255,110,30,0.22)'], [width * 2, 'rgba(255,140,50,0.55)'], [width, 'rgba(255,200,110,0.95)'], [width * 0.4, 'rgba(255,245,210,1)']] as const) {
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        for (const p of paths) {
          ctx.beginPath();
          p.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
          ctx.stroke();
        }
      }
      ctx.restore();
    }),
  ) as [Texture, Texture, Texture];
  return { body, cracks, w: W, h: H, feet };
}

function heart(): HeartArt {
  const W = 220;
  const H = 200;
  const feet = { x: 110, y: 160 };
  const crystal = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(110, 40);
    ctx.lineTo(132, 86);
    ctx.lineTo(110, 132);
    ctx.lineTo(88, 86);
    ctx.closePath();
  };
  const body = paint(W, H, (ctx) => {
    groundShadow(ctx, 120, 160, 104, 28);
    ctx.beginPath();
    ctx.ellipse(110, 150, 90, 28, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8e8270';
    ctx.fill();
    hatch(ctx, 110, 120, 200, 180, 3);
    ctx.beginPath();
    ctx.ellipse(110, 150, 90, 28, 0, 0, Math.PI * 2);
    outline(ctx, 2);
    ctx.beginPath();
    ctx.ellipse(110, 142, 66, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#b3a68c';
    ctx.fill();
    outline(ctx, 1.6);
    // The broken stump of the Monolith, obsidian shards at the rim.
    const rand = seeded(5);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.05 + (i / 8) * 0.9) + Math.PI;
      const x = 110 + Math.cos(a) * 70;
      const y = 146 + Math.sin(a) * 20;
      const h = 10 + rand() * 18;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 2);
      ctx.lineTo(x - 1 + (rand() - 0.5) * 6, y - h);
      ctx.lineTo(x + 5, y + 2);
      ctx.closePath();
      ctx.fillStyle = '#251e2c';
      ctx.fill();
      outline(ctx, 1.4, '#140f18');
    }
    // Pedestal under the crystal.
    ctx.beginPath();
    ctx.moveTo(94, 146);
    ctx.lineTo(98, 120);
    ctx.lineTo(122, 120);
    ctx.lineTo(126, 146);
    ctx.closePath();
    ctx.fillStyle = STONE;
    ctx.fill();
    hatch(ctx, 110, 118, 128, 148, 2.6);
    ctx.beginPath();
    ctx.moveTo(94, 146);
    ctx.lineTo(98, 120);
    ctx.lineTo(122, 120);
    ctx.lineTo(126, 146);
    outline(ctx, 1.8);
  });
  const pigment = paint(W, H, (ctx) => {
    crystal(ctx);
    const g = ctx.createLinearGradient(88, 40, 132, 132);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#d0d0d0');
    g.addColorStop(1, '#7c7c7c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(110, 40);
    ctx.lineTo(110, 132);
    ctx.moveTo(88, 86);
    ctx.lineTo(132, 86);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,50,40,0.45)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(98, 70);
    ctx.lineTo(108, 48);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    crystal(ctx);
    outline(ctx, 2, '#2a2420');
  });
  return { body, pigment, w: W, h: H, feet };
}

function statue(): Texture {
  return paint(70, 140, (ctx) => {
    groundShadow(ctx, 40, 130, 34, 9);
    // Plinth.
    ctx.beginPath();
    ctx.rect(14, 100, 42, 30);
    ctx.fillStyle = STONE;
    ctx.fill();
    hatch(ctx, 38, 100, 56, 130, 2.6);
    ctx.beginPath();
    ctx.rect(14, 100, 42, 30);
    outline(ctx, 1.8);
    ctx.beginPath();
    ctx.rect(10, 96, 50, 6);
    ctx.fillStyle = STONE_HI;
    ctx.fill();
    outline(ctx, 1.4);
    // A gilded champion, sword raised.
    const g = ctx.createLinearGradient(20, 0, 52, 0);
    g.addColorStop(0, '#f6dc8c');
    g.addColorStop(0.45, '#d4a93e');
    g.addColorStop(1, '#8a6418');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(26, 96);
    ctx.lineTo(28, 72);
    ctx.lineTo(24, 56);
    ctx.lineTo(28, 42);
    ctx.lineTo(35, 38);
    ctx.arc(35, 30, 7, Math.PI * 0.5, Math.PI * 2.5);
    ctx.lineTo(42, 40);
    ctx.lineTo(48, 26);
    ctx.lineTo(52, 8);
    ctx.lineTo(55, 9);
    ctx.lineTo(52, 30);
    ctx.lineTo(47, 46);
    ctx.lineTo(44, 58);
    ctx.lineTo(46, 72);
    ctx.lineTo(44, 96);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1.6, '#3a2810');
    // A shield on the off arm.
    ctx.beginPath();
    ctx.moveTo(18, 50);
    ctx.lineTo(30, 50);
    ctx.lineTo(30, 62);
    ctx.quadraticCurveTo(24, 70, 18, 62);
    ctx.closePath();
    ctx.fillStyle = '#c99a32';
    ctx.fill();
    outline(ctx, 1.4, '#3a2810');
  });
}

function obelisk(): Texture {
  return paint(80, 200, (ctx) => {
    groundShadow(ctx, 44, 190, 40, 10);
    ctx.beginPath();
    ctx.rect(14, 170, 52, 20);
    ctx.fillStyle = STONE;
    ctx.fill();
    hatch(ctx, 40, 170, 66, 190, 2.6);
    ctx.beginPath();
    ctx.rect(14, 170, 52, 20);
    outline(ctx, 1.8);
    ctx.beginPath();
    ctx.moveTo(24, 170);
    ctx.lineTo(30, 30);
    ctx.lineTo(40, 14);
    ctx.lineTo(50, 30);
    ctx.lineTo(56, 170);
    ctx.closePath();
    const g = ctx.createLinearGradient(24, 0, 56, 0);
    g.addColorStop(0, STONE_HI);
    g.addColorStop(0.5, STONE);
    g.addColorStop(1, STONE_LO);
    ctx.fillStyle = g;
    ctx.fill();
    hatch(ctx, 42, 14, 56, 170, 2.6);
    ctx.beginPath();
    ctx.moveTo(24, 170);
    ctx.lineTo(30, 30);
    ctx.lineTo(40, 14);
    ctx.lineTo(50, 30);
    ctx.lineTo(56, 170);
    ctx.closePath();
    outline(ctx, 2);
    // Gilded capstone and laurel.
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(40, 14);
    ctx.lineTo(50, 30);
    ctx.closePath();
    ctx.fillStyle = '#d4a93e';
    ctx.fill();
    outline(ctx, 1.4, '#3a2810');
    ctx.strokeStyle = '#d4a93e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(40, 74, 10, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.2 + i * 0.12) + Math.PI;
      ctx.beginPath();
      ctx.ellipse(40 + Math.cos(a) * 10, 74 - Math.sin(a) * 10, 3, 1.4, a, 0, Math.PI * 2);
      ctx.fillStyle = '#d4a93e';
      ctx.fill();
    }
  });
}

function cartouche(): Texture {
  // A short vellum scroll, its ends curled and shaded; the middle stretches.
  return paint(72, 34, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.lineTo(64, 4);
    ctx.lineTo(64, 30);
    ctx.lineTo(8, 30);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 4, 0, 30);
    g.addColorStop(0, '#f4ead0');
    g.addColorStop(1, '#e2d3ac');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(42,29,18,0.85)';
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.lineTo(64, 4);
    ctx.moveTo(8, 30);
    ctx.lineTo(64, 30);
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(184,50,31,0.55)';
    ctx.beginPath();
    ctx.moveTo(8, 7);
    ctx.lineTo(64, 7);
    ctx.moveTo(8, 27);
    ctx.lineTo(64, 27);
    ctx.stroke();
    for (const s of [-1, 1]) {
      const x = s < 0 ? 8 : 64;
      ctx.beginPath();
      ctx.ellipse(x, 17, 5, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#d6c398';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(42,29,18,0.85)';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + s * 1, 17, 2, 7, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  });
}

function shield(): { body: Texture; pigment: Texture } {
  const path = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(50, 6);
    ctx.lineTo(50, 30);
    ctx.quadraticCurveTo(50, 50, 28, 60);
    ctx.quadraticCurveTo(6, 50, 6, 30);
    ctx.closePath();
  };
  const body = paint(56, 64, (ctx) => {
    ctx.save();
    ctx.translate(2, 3);
    path(ctx);
    ctx.fillStyle = 'rgba(20,24,44,0.4)';
    ctx.fill();
    ctx.restore();
  });
  const pigment = paint(56, 64, (ctx) => {
    path(ctx);
    const g = ctx.createLinearGradient(6, 6, 50, 60);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#d6d6d6');
    g.addColorStop(1, '#8c8c8c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2a2420';
    ctx.stroke();
  });
  return { body, pigment };
}

let cached: SiteArt | null = null;

/** Painted once per page; shared by every map. */
export function siteArt(): SiteArt {
  cached ??= {
    castle: castle(),
    shrine: shrine(),
    monolith: monolith(),
    heart: heart(),
    statue: statue(),
    obelisk: obelisk(),
    cartouche: cartouche(),
    cartoucheSlice: { left: 14, right: 14, top: 8, bottom: 8 },
    shield: shield(),
  };
  return cached;
}
