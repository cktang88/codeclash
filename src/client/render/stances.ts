import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import { Wait, type WaitInfo } from '../../sim/stance.ts';

// What each platoon is about, drawn on the chart at mid zoom and closer, so a viewer can tell at a
// glance whether a platoon by the border is besieging, waiting on the clock, massing, holding a
// fort or backing away:
//
//  - waiting or massing: a camp behind its line (two tents, a campfire, a stack of spears), and on
//    its banner a vellum tag with an hourglass when it waits on the siege clock and its muster
//    count ("24/50");
//  - holding a fort: its standard planted at the fort's edge and sentry pickets round its side;
//  - besieging: a dashed siege line in its pigment from the line to the walls it batters;
//  - pulling back: chevrons in its pigment trailing the way it withdraws.

const INK = 0x22180f;
const VELLUM = 0xefe4c8;
const VELLUM_SHADE = 0xd9c79e;
const EMBER = 0xff9a3c;
const SPEAR = 0x5a4126;
const MAX_FIRES = 24;
const MAX_TAGS = 24;

interface Tag {
  root: Container;
  bg: Graphics;
  text: Text;
  key: string;
}

export interface StanceView {
  world: World;
  waits: ReadonlyMap<number, WaitInfo>;
  centroids: ReadonlyMap<number, { x: number; y: number; n: number }>;
  /** Where each banner's staff tops out this frame, or null. */
  top: (id: number) => { x: number; y: number } | null;
  tints: readonly number[];
  zoom: number;
  now: number;
  /** 0 by day, 1 at night: campfires burn brighter. */
  lights: number;
  far: boolean;
  reducedMotion: boolean;
  inView: (x: number, y: number) => boolean;
}

export class StanceLayer {
  /** Camps, pickets, siege lines and chevrons, on the ground under the soldiers. */
  readonly ground = new Graphics();
  /** Campfire glow, for the additive light pass. */
  readonly glow = new Container();
  /** Banner tags: hourglass and muster count, above the banners. */
  readonly marks = new Container();
  private fires: Sprite[] = [];
  private tags: Tag[] = [];

  constructor(soft: Texture) {
    for (let i = 0; i < MAX_FIRES; i++) {
      const s = new Sprite(soft);
      s.anchor.set(0.5);
      s.tint = 0xffa448;
      s.blendMode = 'add';
      s.visible = false;
      this.fires.push(s);
      this.glow.addChild(s);
    }
  }

  update(v: StanceView): void {
    const g = this.ground;
    g.clear();
    for (const f of this.fires) f.visible = false;
    for (const t of this.tags) t.root.visible = false;
    if (v.far) return;
    const { world, zoom } = v;
    let fires = 0;
    let tags = 0;
    const planted = new Set<string>();
    for (const pl of world.platoons) {
      if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
      const w = v.waits.get(pl.id);
      const c = v.centroids.get(pl.id);
      if (!w || !c || !v.inView(c.x, c.y)) continue;
      const tint = v.tints[pl.p] ?? 0xd9c79e;
      // Standing at a fort it holds (waiting on the walls beyond, massing, or simply holding it):
      // its standard planted at the fort's edge and pickets round its side, once per army and fort.
      if (w.kind === Wait.Holding || w.kind === Wait.Sieges || w.kind === Wait.Barred || w.kind === Wait.Massing) {
        const def = world.map.sites[pl.site];
        const key = `${pl.p}:${pl.site}`;
        if (def && def.kind === 'fort' && world.sites[pl.site]!.owner === pl.p && Math.hypot(c.x - def.x, c.y - def.y) < def.radius + 150 && !planted.has(key)) {
          planted.add(key);
          this.holdFort(pl, c, tint, v);
        }
      }
      switch (w.kind) {
        case Wait.Sieges:
        case Wait.Barred:
        case Wait.Massing: {
          if (fires < MAX_FIRES) this.camp(pl, c, tint, v, this.fires[fires++]!);
          const top = v.top(pl.id);
          if (top && tags < MAX_TAGS) this.tag(tags++, top, w, v);
          break;
        }
        case Wait.Besieging:
          this.siegeLine(pl, c, w, tint, v);
          break;
        case Wait.PullBack:
          this.chevrons(pl, c, w, tint, v);
          break;
        default:
      }
    }
    void zoom;
  }

  /** A camp behind the line: two tents, a stack of spears and a campfire. */
  private camp(pl: Platoon, c: { x: number; y: number }, tint: number, v: StanceView, fire: Sprite): void {
    const g = this.ground;
    const z = v.zoom;
    // Behind the line and out past its flank, so the soldiers standing to do not hide it.
    const sx = -pl.hy;
    const sy = pl.hx;
    const back = pl.length * 0.5 + 26;
    const side = Math.min(90, pl.width * 0.5 + 30);
    const bx = c.x - pl.hx * back + sx * side;
    const by = c.y - pl.hy * back + sy * side;
    const ink = Math.max(1.4, 1 / z);
    for (const side of [-1, 1]) {
      const tx = bx + sx * side * 18;
      const ty = by + sy * side * 18 * 0.72;
      const w = 12;
      const h = 15;
      // A ridge tent in vellum, its side shaded, a band of the army's pigment over the ridge.
      g.ellipse(tx, ty + 1, w + 3, 3.5).fill({ color: INK, alpha: 0.28 });
      g.poly([tx - w, ty, tx, ty - h, tx + w, ty]).fill(VELLUM).stroke({ width: ink, color: INK, alpha: 0.9, join: 'round' });
      g.poly([tx, ty - h, tx + w, ty, tx + 2, ty]).fill({ color: VELLUM_SHADE });
      g.moveTo(tx - 3, ty - h * 0.7).lineTo(tx + 3, ty - h * 0.7).stroke({ width: Math.max(2.4, 1.6 / z), color: tint });
      g.moveTo(tx, ty - h).lineTo(tx, ty).stroke({ width: ink * 0.8, color: INK, alpha: 0.8 });
    }
    // Spears stacked in a tripod beside the fire.
    const px = bx + sx * 2 - pl.hx * 10;
    const py = by + sy * 2 - pl.hy * 10;
    for (const d of [-4, 0, 4]) g.moveTo(px + d, py + 1).lineTo(px - d * 0.25, py - 15).stroke({ width: Math.max(1.4, 0.9 / z), color: SPEAR, cap: 'round' });
    g.poly([px - 1.6, py - 15, px + 1.6, py - 15, px, py - 19]).fill(0x9aa3a8).stroke({ width: 0.8, color: INK });
    // The campfire: hearth stones and a painted flame; its glow is added in the light pass.
    const fx = bx - pl.hx * 4;
    const fy = by - pl.hy * 4 + 4;
    const flicker = v.reducedMotion ? 1 : 0.85 + Math.sin(v.now / 90 + pl.id) * 0.1 + Math.sin(v.now / 41 + pl.id * 1.3) * 0.05;
    g.ellipse(fx, fy, 6, 3).fill({ color: 0x2a1c12, alpha: 0.9 });
    const h = 9 * flicker;
    g.poly([fx - 4, fy, fx - 1.5, fy - h, fx + 0.5, fy - h * 0.55, fx + 2.5, fy - h * 1.1, fx + 4, fy]).fill(EMBER).stroke({ width: 1, color: INK, alpha: 0.8 });
    g.poly([fx - 1.8, fy, fx, fy - h * 0.55, fx + 1.8, fy]).fill(0xffd88a);
    fire.visible = true;
    fire.position.set(fx, fy - 4);
    fire.scale.set(0.55 * flicker, 0.42 * flicker);
    fire.alpha = (0.25 + v.lights * 0.6) * flicker;
  }

  /** A vellum tag on the banner: an hourglass while the siege clock runs, and the muster count. */
  private tag(i: number, top: { x: number; y: number }, w: WaitInfo, v: StanceView): void {
    let t = this.tags[i];
    if (!t) {
      const root = new Container();
      const bg = new Graphics();
      const text = new Text({ text: '', style: { fontFamily: '"Alegreya SC", Alegreya, Georgia, serif', fontSize: 15, fontWeight: '700', fill: INK }, resolution: 2 });
      text.anchor.set(0, 0.5);
      root.addChild(bg, text);
      t = { root, bg, text, key: '' };
      this.tags.push(t);
      this.marks.addChild(root);
    }
    const clock = w.kind !== Wait.Massing;
    const count = w.m > 0 ? `${w.n}/${w.m}` : '';
    const key = `${clock ? 1 : 0}|${count}`;
    if (key !== t.key) {
      t.key = key;
      t.text.text = count;
      const iw = clock ? 14 : 0;
      const tw = count ? t.text.width : 0;
      const W = 8 + iw + (iw && tw ? 4 : 0) + tw + 8;
      const H = 22;
      const bg = t.bg;
      bg.clear();
      // A scrap of vellum, ink-ruled, with a deckled right edge.
      bg.poly([0, 0, W - 2, 0, W, 4, W - 2, 9, W, 14, W - 2, H, 0, H]).fill(VELLUM).stroke({ width: 1.6, color: INK, alpha: 0.9, join: 'round' });
      if (clock) {
        // The hourglass: two ink triangles in a frame, sand in the lower bulb.
        const x = 8;
        bg.moveTo(x, 4).lineTo(x + 12, 4).moveTo(x, H - 4).lineTo(x + 12, H - 4).stroke({ width: 1.8, color: INK });
        bg.poly([x + 1.5, 5, x + 10.5, 5, x + 6, H / 2, x + 10.5, H - 5, x + 1.5, H - 5, x + 6, H / 2]).stroke({ width: 1.3, color: INK });
        bg.poly([x + 3.2, H - 5.5, x + 8.8, H - 5.5, x + 6, H / 2 + 2]).fill(0xb8862e);
      }
      t.text.position.set(8 + iw + (iw && count ? 4 : 0), H / 2 + 0.5);
      bg.pivot.set(0, H);
      t.text.pivot.set(0, H);
    }
    t.root.visible = true;
    t.root.position.set(top.x + 10 / v.zoom, top.y + 22 / v.zoom);
    t.root.scale.set(1 / v.zoom);
  }

  /** Its standard planted at the fort's edge on its side, and sentry pickets round that side. */
  private holdFort(pl: Platoon, c: { x: number; y: number }, tint: number, v: StanceView): void {
    const def = v.world.map.sites[pl.site];
    if (!def) return;
    const g = this.ground;
    const z = v.zoom;
    let dx = c.x - def.x;
    let dy = c.y - def.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const r = def.radius * 1.12;
    const base = Math.atan2(dy, dx);
    // Pickets: sharpened stakes leaning outward round the half of the fort it holds.
    for (let i = -4; i <= 4; i++) {
      const a = base + i * 0.28;
      const x = def.x + Math.cos(a) * r;
      const y = def.y + Math.sin(a) * r * 0.72;
      const ox = Math.cos(a);
      const oy = Math.sin(a) * 0.72;
      g.moveTo(x, y).lineTo(x + ox * 7, y + oy * 7 - 6).stroke({ width: Math.max(2, 1.1 / z), color: 0x3a2818, cap: 'round' });
    }
    // The standard: a tall staff at the fort's edge, its pennant in the army's pigment.
    const x = def.x + dx * r;
    const y = def.y + dy * r * 0.72;
    const H = Math.max(26, 14 / z);
    const flag = Math.max(12, 7 / z);
    const wave = v.reducedMotion ? 0 : Math.sin(v.now / 260 + pl.id) * 1.5;
    g.ellipse(x, y + 1, 5, 2).fill({ color: INK, alpha: 0.35 });
    g.moveTo(x, y).lineTo(x, y - H).stroke({ width: Math.max(2.2, 1.2 / z), color: 0x3a2818, cap: 'round' });
    g.poly([x, y - H, x + flag * 1.6, y - H + flag * 0.35 + wave, x + flag * 1.1, y - H + flag * 0.6, x + flag * 1.6, y - H + flag * 0.95 + wave, x, y - H + flag * 1.1]).fill(tint).stroke({ width: Math.max(1.2, 0.7 / z), color: INK, join: 'round' });
    g.circle(x, y - H - 1.5, Math.max(2, 1.2 / z)).fill(0xd4a93e).stroke({ width: 0.8, color: INK });
  }

  /** A dashed siege line from the besieging line to the walls it batters, marching toward them. */
  private siegeLine(pl: Platoon, c: { x: number; y: number }, w: WaitInfo, tint: number, v: StanceView): void {
    const def = v.world.map.sites[w.site];
    if (!def) return;
    const g = this.ground;
    const z = v.zoom;
    let dx = def.x - c.x;
    let dy = def.y - c.y;
    const d = Math.hypot(dx, dy);
    const len = d - def.radius * 0.85;
    if (len < 8) return;
    dx /= d;
    dy /= d;
    const dash = 9;
    const off = v.reducedMotion ? 0 : (v.now / 60) % (dash * 2);
    for (const pass of [0, 1]) {
      for (let t = -dash * 2 + off; t < len; t += dash * 2) {
        const a = Math.max(0, t);
        const b = Math.min(len, t + dash);
        if (b <= a) continue;
        g.moveTo(c.x + dx * a, c.y + dy * a).lineTo(c.x + dx * b, c.y + dy * b);
      }
      g.stroke(pass === 0 ? { width: Math.max(5, 3.4 / z), color: INK, alpha: 0.7, cap: 'round' } : { width: Math.max(2.6, 1.7 / z), color: tint, alpha: 1, cap: 'round' });
    }
    // An arrowhead at the walls.
    const ex = c.x + dx * len;
    const ey = c.y + dy * len;
    const s = Math.max(7, 4 / z);
    g.poly([ex + dx * s, ey + dy * s, ex - dy * s * 0.7, ey + dx * s * 0.7, ex + dy * s * 0.7, ey - dx * s * 0.7]).fill(tint).stroke({ width: Math.max(1.4, 0.9 / z), color: INK });
  }

  /** Chevrons trailing the way a platoon withdraws, fading as they go. */
  private chevrons(pl: Platoon, c: { x: number; y: number }, w: WaitInfo, tint: number, v: StanceView): void {
    const g = this.ground;
    const z = v.zoom;
    // Away from the walls whose tower it backs out of; else back from its facing.
    const def = v.world.map.sites[w.site];
    let dx = -pl.hx;
    let dy = -pl.hy;
    if (def && def.kind === 'capital') {
      const d = Math.hypot(c.x - def.x, c.y - def.y) || 1;
      dx = (c.x - def.x) / d;
      dy = (c.y - def.y) / d;
    }
    const s = Math.max(9, 5 / z);
    const drift = v.reducedMotion ? 0 : ((v.now / 400) % 1) * 14;
    for (let i = 0; i < 3; i++) {
      const at = pl.length * 0.5 + 16 + i * 14 + drift;
      const x = c.x + dx * at;
      const y = c.y + dy * at;
      const alpha = 1 - i * 0.28 - drift / 40;
      const px = -dy;
      const py = dx;
      const pts = [x - dx * s * 0.5 + px * s, y - dy * s * 0.5 + py * s, x + dx * s * 0.5, y + dy * s * 0.5, x - dx * s * 0.5 - px * s, y - dy * s * 0.5 - py * s];
      g.poly(pts, false).stroke({ width: Math.max(5.5, 3.6 / z), color: INK, alpha: 0.7 * alpha, cap: 'round', join: 'round' });
      g.poly(pts, false).stroke({ width: Math.max(3, 2 / z), color: tint, alpha, cap: 'round', join: 'round' });
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.glow.destroy({ children: true });
    this.marks.destroy({ children: true });
  }
}
