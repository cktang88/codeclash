import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { KIND_COUNT, PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import { Form, pitch } from '../../sim/formation.ts';
import { unitGlyph } from './art/svg.ts';
import { canvas2d } from './paint.ts';

// Far zoom draws no soldiers. Each platoon becomes its kind-blocks, as the sim lays them out
// (formation.ts): a solid rectangle per kind in the army's colour, ink-outlined, with the kind's
// woodcut glyph. A column reads as a chain of long bars down its road, a line as wide ones, and
// the banner token (banners.ts) rides at the centre. Engaged platoons show a clash mark where
// they meet. The cost is per block, not per soldier, so it stays flat however large the armies.

/** Per (platoon, kind): what the soldiers of that kind add up to this frame. */
export interface BlockAcc {
  platoon: number;
  kind: number;
  p: number;
  n: number;
  /** Position sums relative to (ox, oy), the first soldier seen, for the centre and the spread. */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  sxx: number;
  sxy: number;
  syy: number;
}

export function blockKey(platoon: number, kind: number): number {
  return platoon * KIND_COUNT + kind;
}

export function resetAcc(a: BlockAcc, platoon: number, kind: number, p: number, x: number, y: number): void {
  a.platoon = platoon;
  a.kind = kind;
  a.p = p;
  a.n = 0;
  a.ox = x;
  a.oy = y;
  a.sx = a.sy = a.sxx = a.sxy = a.syy = 0;
}

export function addToAcc(a: BlockAcc, x: number, y: number): void {
  const dx = x - a.ox;
  const dy = y - a.oy;
  a.n++;
  a.sx += dx;
  a.sy += dy;
  a.sxx += dx * dx;
  a.sxy += dx * dy;
  a.syy += dy * dy;
}

/** A block's drawn shape: centre, unit axis of its length, length along it and width across. */
export interface BlockShape {
  x: number;
  y: number;
  ax: number;
  ay: number;
  length: number;
  width: number;
}

/** A scattered block is drawn no larger than this many times the ground its soldiers would hold in rank. */
const MAX_SPREAD = 2.2;

/**
 * Where and how a block is drawn: over its soldiers, as large as their spread (a uniform spread
 * of variance v is sqrt(12 v) across; a rank of n a pitch apart, n pitches), so a block
 * shows what the formation actually holds, not where it should stand. A line faces its heading;
 * a column's blocks bend with the road, each along the spread of its own soldiers. Size follows
 * the headcount: a scattered melee is capped at MAX_SPREAD times the ground its soldiers hold.
 */
export function blockShape(a: BlockAcc, pl: Pick<Platoon, 'form' | 'hx' | 'hy'>, out: BlockShape): void {
  const n = a.n;
  const mx = a.sx / n;
  const my = a.sy / n;
  out.x = a.ox + mx;
  out.y = a.oy + my;
  const g = pitch(a.kind as never);
  const cxx = Math.max(0, a.sxx / n - mx * mx);
  const cyy = Math.max(0, a.syy / n - my * my);
  const cxy = a.sxy / n - mx * my;
  let ax = pl.hx;
  let ay = pl.hy;
  if (pl.form === Form.Column && n >= 3) {
    // Principal axis of the soldiers' spread, if it has one.
    const spread = Math.sqrt((cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy);
    if (spread > 4) {
      const t = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      ax = Math.cos(t);
      ay = Math.sin(t);
    }
  }
  const m = Math.hypot(ax, ay);
  if (m < 1e-6) {
    ax = 1;
    ay = 0;
  } else {
    ax /= m;
    ay /= m;
  }
  const along = Math.max(0, ax * ax * cxx + 2 * ax * ay * cxy + ay * ay * cyy);
  const across = Math.max(0, ay * ay * cxx - 2 * ax * ay * cxy + ax * ax * cyy);
  // n soldiers a pitch apart have variance g²(n² - 1)/12: this gives back exactly n pitches.
  let length = Math.sqrt(12 * along + g * g);
  let width = Math.sqrt(12 * across + g * g);
  const cap = MAX_SPREAD * n * g * g;
  if (length * width > cap) {
    const k = Math.sqrt(cap / (length * width));
    length *= k;
    width *= k;
  }
  out.ax = ax;
  out.ay = ay;
  out.length = length;
  out.width = width;
}

const INK = 0x1a120b;
const VELLUM = 0xf3e7c6;
const EMBER = 0xffb347;
const GLYPH_PX = 48;
/** Smallest a block's glyph is drawn, and largest, in screen pixels. */
const GLYPH_MIN_PX = 9;
const GLYPH_MAX_PX = 18;
/** Ink outline width in screen pixels. */
const OUTLINE_PX = 1.4;

interface BlockView {
  outline: Sprite;
  fill: Sprite;
  glyph: Sprite;
}

interface ClashView {
  bar: Sprite;
  mark: Sprite;
}

let glyphs: { kinds: Texture[]; clash: Texture } | null = null;

/** The kinds' woodcut glyphs (white, to tint) and the crossed-swords clash mark, baked once per page. */
function bakeGlyphs(): { kinds: Texture[]; clash: Texture } {
  if (glyphs) return glyphs;
  const cols = 8;
  const rows = Math.ceil((KIND_COUNT + 1) / cols);
  const [c, ctx] = canvas2d(cols * GLYPH_PX, rows * GLYPH_PX);
  const k = GLYPH_PX / 24;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    const g = unitGlyph(kind);
    ctx.save();
    ctx.translate((kind % cols) * GLYPH_PX, Math.floor(kind / cols) * GLYPH_PX);
    ctx.scale(k, k);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2.2;
    ctx.stroke(new Path2D(g.s));
    if (g.h) {
      ctx.lineWidth = 1.1;
      ctx.globalAlpha = 0.85;
      ctx.stroke(new Path2D(g.h));
      ctx.globalAlpha = 1;
    }
    if (g.i) ctx.fill(new Path2D(g.i));
    ctx.restore();
  }
  // The clash: crossed swords in ember over an ink halo, so it reads on any colour.
  const at = KIND_COUNT;
  ctx.save();
  ctx.translate((at % cols) * GLYPH_PX, Math.floor(at / cols) * GLYPH_PX);
  ctx.scale(k, k);
  const swords = new Path2D('M4 4l11.5 11.5M20 4 8.5 15.5M13 18l5-5M11 18l-5-5M17 19.5l2.5 2.5M7 19.5 4.5 22');
  ctx.strokeStyle = '#1a120b';
  ctx.lineWidth = 5;
  ctx.stroke(swords);
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2.4;
  ctx.stroke(swords);
  ctx.restore();
  const source = new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const cell = (i: number) => new Texture({ source, frame: new Rectangle((i % cols) * GLYPH_PX, Math.floor(i / cols) * GLYPH_PX, GLYPH_PX, GLYPH_PX) });
  glyphs = { kinds: Array.from({ length: KIND_COUNT }, (_, i) => cell(i)), clash: cell(at) };
  return glyphs;
}

function luminance(c: number): number {
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}

/** The far-zoom kind-blocks of every platoon in view. */
export class BlockLayer {
  readonly root = new Container();
  private readonly fills = new Container();
  private readonly marks = new Container();
  private views: BlockView[] = [];
  private clashes: ClashView[] = [];
  private readonly byId = new Map<number, Platoon>();
  private readonly shape: BlockShape = { x: 0, y: 0, ax: 1, ay: 0, length: 0, width: 0 };
  /** Blocks drawn in the last update, for diagnostics. */
  drawn = 0;

  constructor() {
    this.root.addChild(this.fills, this.marks);
    this.root.visible = false;
  }

  /**
   * `mix` is how far the view has crossed into far zoom (0 none, 1 all the way); blocks fade in
   * with it while the soldiers fade out. `tints` are the armies' actor pigments.
   */
  update(world: World, accs: Iterable<BlockAcc>, centroids: ReadonlyMap<number, { x: number; y: number }>, tints: readonly number[], zoom: number, bounds: { contains(x: number, y: number): boolean }, mix: number, now: number): void {
    this.root.visible = mix > 0.001;
    if (!this.root.visible) {
      this.drawn = 0;
      return;
    }
    this.root.alpha = Math.min(1, mix);
    const tex = bakeGlyphs();
    const byId = this.byId;
    byId.clear();
    for (const pl of world.platoons) byId.set(pl.id, pl);
    const s = this.shape;
    const outline = OUTLINE_PX / zoom;
    let used = 0;
    for (const a of accs) {
      if (a.n <= 0) continue;
      const pl = byId.get(a.platoon);
      if (!pl || pl.state === PlatoonState.Queued) continue;
      blockShape(a, pl, s);
      if (!bounds.contains(s.x, s.y)) continue;
      const v = this.views[used] ?? this.create();
      used++;
      const rot = Math.atan2(s.ay, s.ax);
      const tint = tints[a.p] ?? 0xcccccc;
      const routing = pl.state === PlatoonState.Rout;
      v.outline.visible = v.fill.visible = v.glyph.visible = true;
      v.outline.position.set(s.x, s.y);
      v.outline.rotation = rot;
      v.outline.scale.set(s.length + outline * 2, s.width + outline * 2);
      v.fill.position.set(s.x, s.y);
      v.fill.rotation = rot;
      v.fill.scale.set(s.length, s.width);
      v.fill.tint = tint;
      // A broken platoon's blocks pale, as its soldiers scatter.
      v.fill.alpha = routing ? 0.6 : 1;
      v.outline.alpha = routing ? 0.35 : 1;
      v.glyph.texture = tex.kinds[a.kind]!;
      v.glyph.tint = luminance(tint) > 0.55 ? INK : VELLUM;
      v.glyph.position.set(s.x, s.y);
      const px = Math.max(GLYPH_MIN_PX, Math.min(GLYPH_MAX_PX, Math.min(s.length, s.width) * zoom * 0.95));
      v.glyph.scale.set(px / zoom / GLYPH_PX);
    }
    for (let i = used; i < this.views.length; i++) {
      const v = this.views[i]!;
      if (!v.fill.visible) break;
      v.outline.visible = v.fill.visible = v.glyph.visible = false;
    }
    this.drawn = used;

    // Clashes: where an engaged platoon meets the one it faces, an ember front and crossed swords.
    let clashes = 0;
    const pulse = 0.8 + 0.2 * Math.sin(now / 160);
    for (const pl of world.platoons) {
      if (pl.threat <= 0 || pl.alive <= 0 || (pl.form !== Form.Engaged && pl.state !== PlatoonState.Engage)) continue;
      const q = byId.get(pl.threat);
      if (!q || q.alive <= 0) continue;
      // Each pair once: by the lower id when both face each other.
      if (q.threat === pl.id && q.id < pl.id && (q.form === Form.Engaged || q.state === PlatoonState.Engage)) continue;
      const a = centroids.get(pl.id);
      const b = centroids.get(q.id);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 1 || d > 260) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (!bounds.contains(mx, my)) continue;
      const c = this.clashes[clashes] ?? this.createClash();
      clashes++;
      c.bar.visible = c.mark.visible = true;
      c.bar.position.set(mx, my);
      // The front runs across the line between them.
      c.bar.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      c.bar.scale.set(Math.min(90, Math.max(24, pl.width || 40)), 3.2 / zoom);
      c.bar.alpha = 0.85 * pulse;
      c.mark.position.set(mx, my);
      c.mark.scale.set((17 / zoom / GLYPH_PX) * (0.92 + 0.08 * pulse));
      c.mark.texture = tex.clash;
    }
    for (let i = clashes; i < this.clashes.length; i++) {
      const c = this.clashes[i]!;
      if (!c.mark.visible) break;
      c.bar.visible = c.mark.visible = false;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.views = [];
    this.clashes = [];
  }

  private create(): BlockView {
    const outline = new Sprite(Texture.WHITE);
    outline.anchor.set(0.5);
    outline.tint = INK;
    const fill = new Sprite(Texture.WHITE);
    fill.anchor.set(0.5);
    const glyph = new Sprite(Texture.EMPTY);
    glyph.anchor.set(0.5);
    this.fills.addChild(outline, fill);
    this.marks.addChild(glyph);
    const v = { outline, fill, glyph };
    this.views.push(v);
    return v;
  }

  private createClash(): ClashView {
    const bar = new Sprite(Texture.WHITE);
    bar.anchor.set(0.5);
    bar.tint = EMBER;
    const mark = new Sprite(Texture.EMPTY);
    mark.anchor.set(0.5);
    this.marks.addChild(bar, mark);
    const c = { bar, mark };
    this.clashes.push(c);
    return c;
  }
}
