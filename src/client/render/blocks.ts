import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { KIND_COUNT, PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import { Form, pitch } from '../../sim/formation.ts';
import { unitGlyph } from './art/svg.ts';
import { canvas2d, hslNumber, mixColor, shade } from './paint.ts';

// Far zoom draws no soldiers. Each platoon becomes its kind-blocks, as the sim lays them out
// (formation.ts): a painted wargame counter per kind in the army's pigment (a darker shade band on
// its lower-right edges, a crisp ink rule and a thin light rim outside it), with the kind's woodcut
// glyph in vellum. A column reads as a chain of long bars down its road, a line as wide ones, and
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
/** The warm earth army hues are mixed toward (as the map's and the soldiers' pigments are). */
const EARTH = 0x9a7a4e;
/** A cool shadow the counter's shade band leans toward. */
const SHADOW = 0x2a2440;
/** The warm light the counter's upper-left edge catches. */
const LIGHT = 0xffe9c0;
const GLYPH_PX = 48;
/** Smallest a block's glyph is drawn, and largest, in screen pixels. */
const GLYPH_MIN_PX = 9;
const GLYPH_MAX_PX = 18;
/** Ink outline width in screen pixels. */
const OUTLINE_PX = 1.9;
/** The light rim outside the ink, in screen pixels: it lifts the counter off dark ground. */
const RIM_PX = 1.6;
/** The shade band on the counter's lower-right edges, in screen pixels (at most a third of the block). */
const BAND_PX = 3;
/** The lit edge on its upper left, in screen pixels. */
const LIT_PX = 1;
/** The smallest a counter is drawn, in screen pixels across, whatever its headcount. */
const MIN_BLOCK_PX = 7;
/** Blocks narrower than this many screen pixels carry no glyph: it would only speckle them. */
const GLYPH_ROOM_PX = 7;
/** The vellum glyph must stand off the pigment by at least this WCAG ratio. */
const GLYPH_CONTRAST = 3.2;

function relLum(c: number): number {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255);
}

export interface CounterPaint {
  base: number;
  shade: number;
  /** The warm lit edge on the upper left. */
  light: number;
  rim: number;
  /** A broken platoon's counter: paled toward vellum. */
  routBase: number;
  routShade: number;
}

/**
 * A counter's paints for an army hue, as the soldiers' cloth is painted: the base pigment strong
 * but not neon (mixed toward earth, a little deeper than the map's), darkened where needed so the
 * vellum glyph reads on it; a cool shade for the lower-right band and a thin warm light on the
 * upper-left edge; and a near-vellum rim outside the ink, as the far tokens carry, so the counter
 * stands off forest, road and night alike.
 */
export function counterPaint(hue: number): CounterPaint {
  let base = mixColor(hslNumber(hue, 58, 42), EARTH, 0.17);
  const vl = relLum(VELLUM);
  for (let i = 0; i < 12 && (vl + 0.05) / (relLum(base) + 0.05) < GLYPH_CONTRAST; i++) base = shade(base, -0.06);
  const shadeC = mixColor(shade(base, -0.42), SHADOW, 0.2);
  const routBase = mixColor(base, 0xb9a477, 0.5);
  return { base, shade: shadeC, light: mixColor(base, LIGHT, 0.36), rim: mixColor(base, VELLUM, 0.86), routBase, routShade: mixColor(shadeC, 0x8a7a5a, 0.5) };
}

interface BlockView {
  rim: Sprite;
  outline: Sprite;
  fill: Sprite;
  /** The shade band along the lower-right long side, and across the lower-right end. */
  side: Sprite;
  end: Sprite;
  /** The lit edges, upper-left: along the other long side and across the other end. */
  litSide: Sprite;
  litEnd: Sprite;
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

/** The far-zoom kind-blocks of every platoon in view. */
export class BlockLayer {
  readonly root = new Container();
  private readonly fills = new Container();
  private readonly marks = new Container();
  private views: BlockView[] = [];
  private clashes: ClashView[] = [];
  private readonly byId = new Map<number, Platoon>();
  private readonly paints = new Map<number, CounterPaint>();
  private readonly shape: BlockShape = { x: 0, y: 0, ax: 1, ay: 0, length: 0, width: 0 };
  /** Blocks drawn in the last update, for diagnostics. */
  drawn = 0;

  constructor() {
    this.root.addChild(this.fills, this.marks);
    this.root.visible = false;
  }

  /**
   * `mix` is how far the view has crossed into far zoom (0 none, 1 all the way); blocks fade in
   * with it while the soldiers fade out. `hues` are the armies' hues, painted as counters.
   */
  update(world: World, accs: Iterable<BlockAcc>, centroids: ReadonlyMap<number, { x: number; y: number }>, hues: readonly number[], zoom: number, bounds: { contains(x: number, y: number): boolean }, mix: number, now: number): void {
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
    const rimW = RIM_PX / zoom;
    let used = 0;
    for (const a of accs) {
      if (a.n <= 0) continue;
      const pl = byId.get(a.platoon);
      if (!pl || pl.state === PlatoonState.Queued) continue;
      blockShape(a, pl, s);
      if (!bounds.contains(s.x, s.y)) continue;
      // A counter is never drawn smaller than it can be read: a lone soldier still gets a token-sized block.
      s.length = Math.max(s.length, MIN_BLOCK_PX / zoom);
      s.width = Math.max(s.width, MIN_BLOCK_PX / zoom);
      const v = this.views[used] ?? this.create();
      used++;
      const rot = Math.atan2(s.ay, s.ax);
      const paint = this.paint(hues[a.p] ?? 30);
      const routing = pl.state === PlatoonState.Rout;
      v.rim.visible = v.outline.visible = v.fill.visible = v.side.visible = v.end.visible = v.litSide.visible = v.litEnd.visible = true;
      v.rim.position.set(s.x, s.y);
      v.rim.rotation = rot;
      v.rim.scale.set(s.length + (outline + rimW) * 2, s.width + (outline + rimW) * 2);
      v.rim.tint = paint.rim;
      v.outline.position.set(s.x, s.y);
      v.outline.rotation = rot;
      v.outline.scale.set(s.length + outline * 2, s.width + outline * 2);
      v.fill.position.set(s.x, s.y);
      v.fill.rotation = rot;
      v.fill.scale.set(s.length, s.width);
      // A broken platoon's counters pale, as its soldiers scatter.
      v.fill.tint = routing ? paint.routBase : paint.base;
      v.rim.alpha = routing ? 0.5 : 0.95;
      v.outline.alpha = routing ? 0.45 : 1;
      // The light falls from the upper left: shade the edges whose outward side faces down-right.
      const band = Math.min(BAND_PX / zoom, s.width / 3, s.length / 3);
      const nx = -s.ay;
      const ny = s.ax;
      const sn = nx + ny >= 0 ? 1 : -1;
      const sa = s.ax + s.ay >= 0 ? 1 : -1;
      const shadeTint = routing ? paint.routShade : paint.shade;
      v.side.position.set(s.x + nx * sn * (s.width - band) * 0.5, s.y + ny * sn * (s.width - band) * 0.5);
      v.side.rotation = rot;
      v.side.scale.set(s.length, band);
      v.side.tint = shadeTint;
      v.end.position.set(s.x + s.ax * sa * (s.length - band) * 0.5, s.y + s.ay * sa * (s.length - band) * 0.5);
      v.end.rotation = rot;
      v.end.scale.set(band, s.width);
      v.end.tint = shadeTint;
      const lit = Math.min(LIT_PX / zoom, s.width / 4, s.length / 4);
      const litTint = routing ? paint.routBase : paint.light;
      v.litSide.position.set(s.x - nx * sn * (s.width - lit) * 0.5, s.y - ny * sn * (s.width - lit) * 0.5);
      v.litSide.rotation = rot;
      v.litSide.scale.set(s.length - band, lit);
      v.litSide.tint = litTint;
      v.litEnd.position.set(s.x - s.ax * sa * (s.length - lit) * 0.5, s.y - s.ay * sa * (s.length - lit) * 0.5);
      v.litEnd.rotation = rot;
      v.litEnd.scale.set(lit, s.width - band);
      v.litEnd.tint = litTint;
      v.glyph.texture = tex.kinds[a.kind]!;
      v.glyph.tint = VELLUM;
      v.glyph.alpha = routing ? 0.7 : 1;
      // Centred on the lit face, clear of the shade band.
      v.glyph.position.set(s.x - (nx * sn + s.ax * sa) * band * 0.3, s.y - (ny * sn + s.ay * sa) * band * 0.3);
      const room = Math.min(s.length, s.width) * zoom;
      v.glyph.visible = room >= GLYPH_ROOM_PX;
      const px = Math.max(GLYPH_MIN_PX, Math.min(GLYPH_MAX_PX, room * 0.95));
      v.glyph.scale.set(px / zoom / GLYPH_PX);
    }
    for (let i = used; i < this.views.length; i++) {
      const v = this.views[i]!;
      if (!v.fill.visible) break;
      v.rim.visible = v.outline.visible = v.fill.visible = v.side.visible = v.end.visible = v.litSide.visible = v.litEnd.visible = v.glyph.visible = false;
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

  private paint(hue: number): CounterPaint {
    let p = this.paints.get(hue);
    if (!p) {
      p = counterPaint(hue);
      this.paints.set(hue, p);
    }
    return p;
  }

  private create(): BlockView {
    const quad = (tint?: number) => {
      const q = new Sprite(Texture.WHITE);
      q.anchor.set(0.5);
      if (tint !== undefined) q.tint = tint;
      return q;
    };
    const rim = quad();
    const outline = quad(INK);
    const fill = quad();
    const side = quad();
    const end = quad();
    const litSide = quad();
    const litEnd = quad();
    const glyph = new Sprite(Texture.EMPTY);
    glyph.anchor.set(0.5);
    this.fills.addChild(rim, outline, fill, side, end, litSide, litEnd);
    this.marks.addChild(glyph);
    const v = { rim, outline, fill, side, end, litSide, litEnd, glyph };
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
