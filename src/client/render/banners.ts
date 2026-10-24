import { FADE_MS, FAR_ZOOM } from './lod.ts';
import { CanvasSource, Container, Graphics, MeshPlane, Sprite, Text, Texture } from 'pixi.js';
import { placeMarkers, type MarkerBox } from './declutter.ts';
import { canvas2d } from './paint.ts';
import { PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import { Form } from '../../sim/formation.ts';
import type { RepoRef } from '../../sim/replay.ts';
import { FLAG_H, FLAG_W, gradeOf, type FlagCache, type FlagTrim } from './flags.ts';

const VERTS_X = 10;

/** A cloth flag whose free edge ripples in the wind. Sized in flag pixels (FLAG_W x FLAG_H). */
export class WavingFlag {
  readonly mesh: MeshPlane;
  private base: Float32Array;
  private phase = Math.random() * 10;

  constructor(texture: Texture) {
    this.mesh = new MeshPlane({ texture, verticesX: VERTS_X, verticesY: 2 });
    this.mesh.autoResize = false;
    const buf = this.mesh.geometry.getBuffer('aPosition');
    this.base = new Float32Array(buf.data as Float32Array);
  }

  set texture(t: Texture) {
    if (this.mesh.texture !== t) this.mesh.texture = t;
  }

  /** Frees the mesh and its own vertex buffers (Mesh.destroy leaves the geometry alive). */
  destroy(): void {
    const geometry = this.mesh.geometry;
    this.mesh.destroy();
    geometry.destroy(true);
  }

  update(time: number, strength: number): void {
    const buf = this.mesh.geometry.getBuffer('aPosition');
    const data = buf.data as Float32Array;
    for (let i = 0; i < data.length; i += 2) {
      const x = this.base[i]!;
      const k = x / FLAG_W;
      const wave = Math.sin(time * 4.2 + this.phase - k * 5.5) * k * strength;
      data[i] = x - Math.abs(wave) * 0.12;
      data[i + 1] = this.base[i + 1]! + wave;
    }
    buf.update();
  }
}

interface BannerView {
  root: Container;
  pole: Sprite;
  finial: Sprite;
  flag: WavingFlag;
  /** The strength and morale gauge: a carved channel, counter-scaled so it stays legible far out. */
  gauge: Container;
  strength: Sprite;
  /** The pale lagging wound left behind when the platoon loses soldiers; drains after 400ms. */
  wound: Sprite;
  /** A gilded tick riding the leading edge of the strength fill. */
  edge: Sprite;
  morale: Sprite;
  woundW: number;
  woundAt: number;
  /** The far-zoom marker: the battalion's arms on a small shield, its headcount and a strength bar. */
  token: Sprite;
  tokenKey: string;
  markBack: Sprite;
  markBar: Sprite;
  markCount: Text;
  /** The marker's opacity, easing as it finds or loses room. */
  markAlpha: number;
  count: Text;
  star: Text;
  seen: number;
  key: string;
  routFlash: number;
  /** How high the banner is held, 0 dipped to 1 raised, and where it is easing to. */
  raise: number;
  raiseTarget: number;
  x: number;
  y: number;
  /** The platoon's anchor, eased: the sim moves it in 5Hz steps. */
  ax: number;
  ay: number;
  /** Far-zoom placement: the marker's footprint and screen-pixel offset from its platoon. */
  box: MarkerBox;
  platoon: number;
  /** The top of the staff in world units, where a commander's bark points; NaN while hidden. */
  topX: number;
  topY: number;
}

const BAR_W = FLAG_W;
const BAR_H = 10;
const MORALE_H = 6;
/** Width of the gilded end caps on the gauge channel. */
const CAP = 8;
/** Gauge layout, in flag pixels below the staff foot. */
const GAUGE_Y = 6;
const STRENGTH_Y = 3;
const MORALE_Y = STRENGTH_Y + BAR_H + 3;
const GAUGE_H = MORALE_Y + MORALE_H + 3;
/** The lagging wound holds this long before it drains. */
const WOUND_HOLD_MS = 400;
const WOUND_DRAIN_MS = 380;
/** Screen size of the selected platoon's flag at far zoom: it keeps its full banner there. */
const FAR_FLAG_PX = 40;
/**
 * The far-zoom marker, in screen pixels around its platoon's centre: a small shield planted on
 * the platoon's blocks (its tip just above their middle), the headcount to its right and a thin
 * strength bar under the count. The blocks carry the platoon's colour and shape; the marker
 * only names it.
 */
const MARK_W = 20;
const MARK_H = 23;
const MARK_Y = -MARK_H / 2 - 3;
const MARK_TEXT_X = MARK_W / 2 + 3;
const MARK_TEXT_Y = MARK_Y - 4;
const MARK_BAR_Y = MARK_Y + 5;
const MARK_BAR_W = 16;
const MARK_BAR_H = 3.5;
/** Headcount glyph width in screen pixels, for the marker's footprint. */
const DIGIT_PX = 7;
/** The farthest a marker may stray from its platoon, in screen pixels; beyond it, it hides instead. */
const MARK_REACH = 40;
/** Offsets below this many screen pixels draw no tether back to the platoon. */
const TETHER_PX = 7;
/** How fast a marker fades in or out as room is made or lost. */
const MARK_FADE_MS = 140;
/**
 * Platoons standing (not fighting) within this many world units of their own capital's walls
 * fold into one capital badge at far zoom.
 */
const HOME_REACH = 110;

function markerBox(digits: number, must = false): MarkerBox {
  const x0 = -MARK_W / 2 - 1;
  const x1 = MARK_TEXT_X + Math.max(MARK_BAR_W, digits * DIGIT_PX) + 1;
  const y0 = MARK_Y - MARK_H / 2 - 1;
  const y1 = MARK_BAR_Y + MARK_BAR_H + 1;
  return { x: 0, y: 0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ox: 0, oy: 0, priority: 0, must, shown: false };
}

/** Marker footprints by headcount digits, made once. */
const MARKER_SIZES = Array.from({ length: 6 }, (_, d) => markerBox(d));
const markerSize = (digits: number): MarkerBox => MARKER_SIZES[Math.min(5, digits)]!;

/** Far out, a capital's idle platoons show as one badge: a stack of its shields, the platoons and the soldiers. */
interface CapitalBadge {
  root: Container;
  back: Sprite[];
  front: Sprite;
  count: Text;
  platoons: Text;
  tokenKey: string;
  box: MarkerBox;
  /** The site the badge sits by, in world units. */
  x: number;
  y: number;
  /** Its largest platoon: what a click on the badge selects. */
  lead: number;
  alpha: number;
  seen: number;
}

export interface BannerHit {
  platoon: number;
  x: number;
  y: number;
  r: number;
}

const vellumText = (size: number) => ({ fontFamily: '"Alegreya SC", Alegreya, Georgia, serif', fontSize: size, fontWeight: '700' as const, fill: 0xefe4c8, stroke: { color: 0x22180f, width: size * 0.26, join: 'round' as const } });

/** One banner per platoon, carried over its formation; far out, a small heraldic marker on its blocks. */
export class BannerLayer {
  readonly root = new Container();
  private views = new Map<number, BannerView>();
  private badges = new Map<number, CapitalBadge>();
  private frameNo = 0;
  hits: BannerHit[] = [];
  private hitPool: BannerHit[] = [];
  /** Ink tethers from a nudged far-zoom marker back to its platoon. */
  private readonly tethers = new Graphics();
  private crowd: MarkerBox[] = [];
  private crowdOrder: number[] = [];
  private crowdViews: BannerView[] = [];
  private crowdBadges: CapitalBadge[] = [];
  /** Platoon id -> player, for platoons folded into their capital's badge this frame. */
  private home = new Map<number, number>();
  private homeCount: number[] = [];
  private lastFar: boolean | null = null;
  private modeAt = -1e9;
  /** Markers shown at far zoom in the last frame, for diagnostics. */
  shownMarkers = 0;

  constructor(private flags: FlagCache) {
    this.root.sortableChildren = true;
    this.tethers.zIndex = -1e9;
    this.root.addChild(this.tethers);
  }

  /** Every texture a live banner shows, so the flag cache never frees one in use. */
  texturesInUse(out: Set<Texture>): void {
    for (const v of this.views.values()) {
      out.add(v.flag.mesh.texture);
      if (v.token.texture) out.add(v.token.texture);
    }
    for (const f of this.folding) {
      out.add(f.v.flag.mesh.texture);
      if (f.v.token.texture) out.add(f.v.token.texture);
    }
    for (const b of this.badges.values()) if (b.front.texture) out.add(b.front.texture);
  }

  /** Drop every banner: a new war reuses platoon ids for other companies. */
  reset(): void {
    for (const f of this.folding) this.dispose(f.v);
    this.folding = [];
    for (const v of this.views.values()) this.dispose(v);
    this.views.clear();
    for (const b of this.badges.values()) b.root.destroy({ children: true });
    this.badges.clear();
    this.hits.length = 0;
    this.tethers.clear();
  }

  private dispose(v: BannerView): void {
    v.flag.destroy();
    v.root.destroy({ children: true });
  }

  private hit(platoon: number, x: number, y: number, r: number): void {
    const h = this.hitPool.pop() ?? { platoon: 0, x: 0, y: 0, r: 0 };
    h.platoon = platoon;
    h.x = x;
    h.y = y;
    h.r = r;
    this.hits.push(h);
  }

  private folding: { v: BannerView; into: number; at: number; x: number; y: number }[] = [];

  /** A small platoon merges into another: its banner flies over and folds into the survivor's. */
  regroup(from: number, into: number, now: number): void {
    const v = this.views.get(from);
    if (!v) return;
    this.views.delete(from);
    this.folding.push({ v, into, at: now, x: v.x, y: v.y });
  }

  /** Where platoon `id`'s banner stands this frame, its staff's top in world units; null while not drawn. */
  top(id: number): { x: number; y: number } | null {
    const v = this.views.get(id);
    if (!v || !v.root.visible || !Number.isFinite(v.topY)) return null;
    return { x: v.topX, y: v.topY };
  }

  rout(platoon: number, now: number): void {
    const v = this.views.get(platoon);
    if (v) v.routFlash = now;
  }

  /**
   * Which platoons fold into their capital's badge: those standing (not fighting or fleeing)
   * by their own capital, when there are at least two of them. The selected and followed
   * platoons never fold.
   */
  private foldHome(world: World, centroid: Map<number, { x: number; y: number; n: number }>, selected: number | null, followed: number | null): void {
    const home = this.home;
    home.clear();
    const count = this.homeCount;
    count.length = world.players.length;
    count.fill(0);
    const sites = world.map.sites;
    const capOf = (p: number) => {
      const slot = world.players[p]?.slot ?? -1;
      for (const s of sites) if (s.kind === 'capital' && s.slot === slot) return s;
      return undefined;
    };
    const caps = world.players.map((pl) => capOf(pl.p));
    for (const pl of world.platoons) {
      if (pl.state === PlatoonState.Queued || pl.alive <= 0 || pl.state === PlatoonState.Engage || pl.state === PlatoonState.Rout) continue;
      if (pl.id === selected || pl.id === followed) continue;
      const cap = caps[pl.p];
      if (!cap) continue;
      const c = centroid.get(pl.id) ?? pl;
      const r = cap.radius + HOME_REACH;
      if ((c.x - cap.x) ** 2 + (c.y - cap.y) ** 2 > r * r) continue;
      home.set(pl.id, pl.p);
      count[pl.p]!++;
    }
    for (const [id, p] of home) if (count[p]! < 2) home.delete(id);
  }

  update(
    world: World,
    repos: readonly RepoRef[],
    hues: readonly number[],
    now: number,
    zoom: number,
    centroid: Map<number, { x: number; y: number; n: number }>,
    bounds: { contains(x: number, y: number): boolean },
    selected: number | null,
    trims: readonly (FlagTrim | undefined)[] = [],
    dtMs = 16.67,
    reducedMotion = false,
    /** Whether the view is in far zoom; the renderer passes its level, with hysteresis. */
    farLevel?: boolean,
    /** The platoon the camera follows, if any: its marker always shows. */
    followed: number | null = null,
  ): void {
    this.frameNo++;
    for (const h of this.hits) this.hitPool.push(h);
    this.hits.length = 0;
    this.crowd.length = 0;
    this.crowdViews.length = 0;
    this.crowdBadges.length = 0;
    const far = farLevel ?? zoom < FAR_ZOOM;
    if (far !== this.lastFar) {
      // Crossing between banners and markers: the new set fades in while blocks and soldiers cross-fade.
      if (this.lastFar !== null) this.modeAt = now;
      this.lastFar = far;
    }
    const modeFade = reducedMotion ? 1 : Math.min(1, (now - this.modeAt) / FADE_MS);
    const markFade = reducedMotion ? 1 : Math.min(1, dtMs / MARK_FADE_MS);
    const flagPx = far ? FAR_FLAG_PX : Math.max(26, Math.min(46, 34 * Math.pow(zoom, 0.35)));
    const scale = flagPx / FLAG_W / zoom;
    if (far) this.foldHome(world, centroid, selected, followed);
    else this.home.clear();
    // Frame-rate independent easing: the anchor smooths the sim's 5Hz steps; the banner then
    // follows the (already interpolated) soldiers closely instead of trailing behind them.
    const anchorK = 1 - Math.pow(0.8, dtMs / 16.67);
    const followK = 1 - Math.pow(0.45, dtMs / 16.67);
    for (const pl of world.platoons) {
      if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
      if (!Number.isFinite(pl.x) || !Number.isFinite(pl.y)) continue;
      const c = centroid.get(pl.id);
      let v = this.views.get(pl.id);
      if (!v) {
        v = this.create();
        v.platoon = pl.id;
        v.raise = v.raiseTarget = pl.form === Form.Column ? 0.65 : 1;
        v.ax = pl.x;
        v.ay = pl.y;
        v.x = c ? c.x * 0.6 + pl.x * 0.4 : pl.x;
        v.y = c ? c.y * 0.6 + pl.y * 0.4 : pl.y;
        this.views.set(pl.id, v);
      }
      v.seen = this.frameNo;
      v.ax += (pl.x - v.ax) * anchorK;
      v.ay += (pl.y - v.ay) * anchorK;
      // Close in, the banner is carried at the front of the block, over the soldiers; far out, the
      // marker is planted on the middle of its blocks.
      const front = far && pl.id !== selected ? 0 : 0.4;
      const tx = c ? c.x * (1 - front) + v.ax * front : v.ax;
      const ty = c ? c.y * (1 - front) + v.ay * front : v.ay;
      v.x += (tx - v.x) * followK;
      v.y += (ty - v.y) * followK;
      v.topX = v.topY = NaN;
      if (!bounds.contains(v.x, v.y) || this.home.has(pl.id)) {
        v.root.visible = false;
        v.box.ox = v.box.oy = 0;
        v.box.shown = false;
        v.markAlpha = 0;
        continue;
      }
      v.root.visible = true;
      const hue = hues[pl.p] ?? 0;
      const repo = repos[pl.repo] ?? ['unknown/repo', null];
      const grade = gradeOf(world.players[pl.p]);
      const trim = trims[pl.p];
      const key = `${hue}|${repo[0]}|${pl.ordinal}|${grade.rank}|${grade.ragged ? 1 : 0}|${trim ?? ''}`;
      if (key !== v.key) {
        v.flag.texture = this.flags.battalion(hue, repo[0], repo[1], pl.ordinal, grade, trim);
        v.key = key;
      }
      const routing = pl.state === PlatoonState.Rout;
      const engaged = pl.state === PlatoonState.Engage;
      const hpFrac = Math.max(0, Math.min(1, pl.alive / Math.max(1, pl.size)));
      // Far out, every platoon but the selected one becomes a small marker on its blocks.
      if (far && pl.id !== selected) {
        this.showMarker(v, true);
        if (v.tokenKey !== key) {
          v.token.texture = this.flags.token(hue, repo[0], repo[1], grade);
          v.tokenKey = key;
        }
        v.root.scale.set(1 / zoom);
        v.root.rotation = 0;
        v.token.tint = routing ? 0xb8b8b8 : 0xffffff;
        v.markBar.width = MARK_BAR_W * hpFrac;
        v.markBar.tint = hpFrac < 0.34 ? 0xc8503a : 0x3f9a84;
        const text = String(pl.alive);
        if (v.markCount.text !== text) v.markCount.text = text;
        v.star.visible = pl.champion;
        const b = v.box;
        b.x = v.x * zoom;
        b.y = v.y * zoom;
        const sized = markerSize(text.length);
        b.w = sized.w;
        b.cx = sized.cx;
        b.must = pl.id === followed;
        v.topX = v.x;
        v.topY = v.y - (MARK_H + 6) / zoom;
        // Who keeps a marker when there is no room: fighting first, then the largest.
        b.priority = (engaged ? 20000 : routing ? 8000 : pl.state === PlatoonState.March ? 4000 : 0) + Math.min(3000, pl.alive * 10) + (pl.champion ? 2000 : 0);
        this.crowd.push(b);
        this.crowdViews.push(v);
        continue;
      }
      this.showMarker(v, false);
      v.root.alpha = modeFade;
      v.box.ox = v.box.oy = 0;
      v.box.shown = false;
      v.markAlpha = 0;
      const lift = 16 / zoom;
      v.root.position.set(v.x, v.y - lift);
      v.root.scale.set(scale);
      v.root.zIndex = v.y + (pl.id === selected ? 1e6 : 0);
      // Held by form: dipped on the march, rising as the line deploys, high once formed.
      v.raiseTarget = pl.form === Form.Column ? 0.65 : pl.form === Form.Deploying ? 0.9 : 1;
      v.raise += (v.raiseTarget - v.raise) * (reducedMotion ? 1 : 1 - Math.pow(0.9, dtMs / 16.67));
      const dip = far ? 0 : 1 - v.raise;
      // A dipped banner is carried lower and tilted forward; raised, it stands straight.
      if (dip > 0.01) v.root.position.y += dip * FLAG_H * 0.5 * scale;
      v.root.rotation = routing ? -0.35 + (reducedMotion ? 0 : Math.sin(now / 120) * 0.08) : dip * 0.35;
      // Cloth only ripples where it can be seen. Reduced motion: a breath of wind.
      v.flag.update(now / 1000, (routing ? 3 : engaged ? 7 : 4.5) * (reducedMotion ? 0.25 : 1));
      const flash = now - v.routFlash < 900 ? 1 - (now - v.routFlash) / 900 : 0;
      v.flag.mesh.tint = flash > 0 && Math.floor(now / 90) % 2 === 0 ? 0xffffff : routing ? 0xb8b8b8 : 0xffffff;
      v.flag.mesh.alpha = 1;
      // The gauge is counter-scaled so it never shrinks to a hairline when zoomed out.
      v.gauge.scale.set(Math.max(1, 34 / flagPx));
      const hp = BAR_W * hpFrac;
      if (hp < v.strength.width - 0.01) v.woundAt = now;
      if (hp > v.woundW) v.woundW = hp;
      else if (v.woundW > hp && now - v.woundAt > WOUND_HOLD_MS) {
        const k = Math.min(1, (now - v.woundAt - WOUND_HOLD_MS) / WOUND_DRAIN_MS);
        v.woundW = k >= 1 ? hp : v.woundW + (hp - v.woundW) * k * k;
      }
      v.strength.width = hp;
      v.wound.width = Math.max(0, v.woundW);
      v.wound.visible = v.woundW - hp > 0.5;
      v.edge.visible = hp > 2 && hp < BAR_W - 1;
      v.edge.x = -BAR_W / 2 + hp;
      v.morale.width = BAR_W * Math.max(0, Math.min(1, pl.morale / 100));
      v.morale.tint = pl.morale < 30 ? 0xd04a32 : pl.morale < 60 ? 0xe2b84e : 0x5a78c8;
      v.count.visible = far || pl.id === selected;
      if (v.count.visible) v.count.text = String(pl.alive);
      v.star.visible = pl.champion;
      if (far) {
        // The selected platoon keeps its full banner far out: markers make room around it.
        const b = v.box;
        b.x = v.x * zoom;
        b.y = (v.y - lift) * zoom;
        b.w = FAR_FLAG_PX * 1.25;
        b.h = FAR_FLAG_PX * 1.9;
        b.cx = FAR_FLAG_PX * 0.45;
        b.cy = -FAR_FLAG_PX * 0.75;
        b.must = true;
        b.priority = 0;
        this.crowd.push(b);
        this.crowdViews.push(v);
      }
      this.hit(pl.id, v.x, v.y - lift - FLAG_H * 0.9 * scale, Math.max(FLAG_W * 0.6 * scale, 10 / zoom));
      v.topX = v.x;
      v.topY = v.root.position.y - FLAG_H * 1.55 * scale;
    }
    if (far) this.gatherBadges(world, repos, hues, zoom, bounds);
    else for (const b of this.badges.values()) b.root.visible = false;
    this.placeMarkers(zoom, modeFade, markFade, selected);
    for (let i = this.folding.length - 1; i >= 0; i--) {
      const f = this.folding[i]!;
      const t = Math.min(1, (now - f.at) / 650);
      const target = this.views.get(f.into);
      if (t >= 1 || !target) {
        this.dispose(f.v);
        this.folding.splice(i, 1);
        continue;
      }
      const e = t * t * (3 - 2 * t);
      f.v.root.position.set(f.x + (target.x - f.x) * e, f.y + (target.y - f.y) * e - 16 / zoom - Math.sin(t * Math.PI) * 30 / zoom);
      f.v.root.scale.set(scale * (1 - 0.6 * e));
      f.v.root.alpha = 1 - e * 0.8;
      f.v.root.rotation = e * 0.6;
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frameNo) continue;
      this.dispose(v);
      this.views.delete(id);
    }
    for (const [p, b] of this.badges) {
      if (b.seen === this.frameNo) continue;
      b.root.destroy({ children: true });
      this.badges.delete(p);
    }
  }

  /** Switches a view between its close-in banner and its far marker. */
  private showMarker(v: BannerView, on: boolean): void {
    v.token.visible = v.markBack.visible = v.markBar.visible = v.markCount.visible = on;
    v.pole.visible = v.finial.visible = v.flag.mesh.visible = v.gauge.visible = !on;
    if (on) {
      v.star.position.set(MARK_W / 2 - 1, MARK_Y - MARK_H / 2 + 2);
      v.star.scale.set(0.34);
    } else {
      v.star.position.set(FLAG_W + 18, -FLAG_H * 1.6);
      v.star.scale.set(1);
    }
  }

  /** One badge per capital whose idle platoons were folded, beside its keep. */
  private gatherBadges(world: World, repos: readonly RepoRef[], hues: readonly number[], zoom: number, bounds: { contains(x: number, y: number): boolean }): void {
    if (!this.home.size) {
      for (const b of this.badges.values()) b.root.visible = false;
      return;
    }
    const soldiers = new Map<number, number>();
    const lead = new Map<number, Platoon>();
    for (const pl of world.platoons) {
      const p = this.home.get(pl.id);
      if (p === undefined) continue;
      soldiers.set(p, (soldiers.get(p) ?? 0) + pl.alive);
      const l = lead.get(p);
      if (!l || pl.alive > l.alive) lead.set(p, pl);
    }
    for (const [p, l] of lead) {
      const slot = world.players[p]?.slot ?? -1;
      const site = world.map.sites.find((s) => s.kind === 'capital' && s.slot === slot);
      if (!site) continue;
      // Beside the keep, low on its right, clear of the name cartouche above it.
      const x = site.x + site.radius * 0.95;
      const y = site.y + site.radius * 0.35;
      let b = this.badges.get(p);
      if (!b) {
        b = this.createBadge();
        this.badges.set(p, b);
      }
      b.seen = this.frameNo;
      if (!bounds.contains(x, y)) {
        b.root.visible = false;
        b.box.shown = false;
        b.alpha = 0;
        continue;
      }
      b.root.visible = true;
      b.x = x;
      b.y = y;
      b.lead = l.id;
      const repo = repos[l.repo] ?? ['unknown/repo', null];
      const grade = gradeOf(world.players[p]);
      const key = `${hues[p] ?? 0}|${repo[0]}|${grade.rank}|${grade.ragged ? 1 : 0}`;
      if (key !== b.tokenKey) {
        const t = this.flags.token(hues[p] ?? 0, repo[0], repo[1], grade);
        b.front.texture = t;
        for (const s of b.back) s.texture = t;
        b.tokenKey = key;
      }
      const n = this.homeCount[p] ?? 0;
      const total = String(soldiers.get(p) ?? 0);
      if (b.count.text !== total) b.count.text = total;
      const plText = `×${n}`;
      if (b.platoons.text !== plText) b.platoons.text = plText;
      b.root.scale.set(1 / zoom);
      const box = b.box;
      const sized = markerSize(Math.max(total.length, plText.length));
      box.x = x * zoom;
      box.y = y * zoom;
      box.w = sized.w + 6;
      box.cx = sized.cx + 3;
      box.h = sized.h + 3;
      box.cy = sized.cy - 1.5;
      box.must = false;
      box.priority = 50000 + n;
      this.crowd.push(box);
      this.crowdBadges.push(b);
    }
  }

  /**
   * Far out, markers of nearby platoons would pile on one another: each takes the nearest free
   * spot within a short reach of its platoon, most important first, and a marker with no room
   * fades out rather than wandering off. A nudged marker keeps a short ink tether to its blocks.
   */
  private placeMarkers(zoom: number, modeFade: number, markFade: number, selected: number | null): void {
    const g = this.tethers;
    g.clear();
    this.shownMarkers = 0;
    if (!this.crowd.length) return;
    placeMarkers(this.crowd, MARK_REACH, this.crowdOrder);
    let tethers = 0;
    for (let i = 0; i < this.crowdViews.length; i++) {
      const v = this.crowdViews[i]!;
      if (v.platoon === selected) continue;
      const b = v.box;
      v.markAlpha += ((b.shown ? 1 : 0) - v.markAlpha) * markFade;
      if (!b.shown && v.markAlpha < 0.03) {
        v.root.visible = false;
        v.markAlpha = 0;
        continue;
      }
      v.root.alpha = v.markAlpha * modeFade;
      const x = v.x + b.ox / zoom;
      const y = v.y + b.oy / zoom;
      v.root.position.set(x, y);
      // Lower on screen draws in front; the followed platoon over all.
      v.root.zIndex = y + (b.must ? 1e6 : 0);
      if (!b.shown) continue;
      this.shownMarkers++;
      this.hit(v.platoon, x, y + MARK_Y / zoom, Math.max(MARK_W * 0.6, 8) / zoom);
      if (Math.hypot(b.ox, b.oy) < TETHER_PX) continue;
      // From the middle of the blocks to the shield's tip.
      g.moveTo(v.x, v.y).lineTo(x, y + (MARK_Y + MARK_H / 2) / zoom);
      g.circle(v.x, v.y, 1.5 / zoom);
      tethers++;
    }
    for (const bd of this.crowdBadges) {
      const b = bd.box;
      bd.alpha += ((b.shown ? 1 : 0) - bd.alpha) * markFade;
      bd.root.visible = b.shown || bd.alpha > 0.03;
      bd.root.alpha = bd.alpha * modeFade;
      const x = bd.x + b.ox / zoom;
      const y = bd.y + b.oy / zoom;
      bd.root.position.set(x, y);
      bd.root.zIndex = y + 5e5;
      if (b.shown) {
        this.shownMarkers++;
        this.hit(bd.lead, x, y + MARK_Y / zoom, Math.max(MARK_W * 0.7, 9) / zoom);
      }
    }
    if (tethers) g.stroke({ width: 1.1 / zoom, color: 0x22180f, alpha: 0.7 * modeFade });
  }

  private createBadge(): CapitalBadge {
    const root = new Container();
    // Two shields behind the front one, stepped up and right: a stack of platoons at home.
    const back = [2, 1].map((i) => {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.width = MARK_W;
      s.height = MARK_H;
      s.position.set(i * 3.5, MARK_Y - i * 3.5);
      s.tint = i === 2 ? 0x8f8a80 : 0xb7b1a5;
      root.addChild(s);
      return s;
    });
    const front = new Sprite();
    front.anchor.set(0.5);
    front.width = MARK_W + 2;
    front.height = MARK_H + 2;
    front.position.set(0, MARK_Y);
    const count = new Text({ text: '', style: vellumText(26), resolution: 2 });
    count.anchor.set(0, 0.5);
    count.scale.set(0.5);
    count.position.set(MARK_TEXT_X + 6, MARK_TEXT_Y);
    const platoons = new Text({ text: '', style: { ...vellumText(20), fontStyle: 'italic' as const, fontWeight: '400' as const, fill: 0xf6dc8c }, resolution: 2 });
    platoons.anchor.set(0, 0.5);
    platoons.scale.set(0.5);
    platoons.position.set(MARK_TEXT_X + 6, MARK_TEXT_Y + 11);
    root.addChild(front, count, platoons);
    root.visible = false;
    this.root.addChild(root);
    return { root, back, front, count, platoons, tokenKey: '', box: markerBox(3), x: 0, y: 0, lead: -1, alpha: 0, seen: 0 };
  }

  private create(): BannerView {
    const root = new Container();
    // An oak staff with an ink edge, topped by a gilded spear-point finial.
    const pole = new Sprite(this.staffTexture());
    pole.anchor.set(0.5, 1);
    pole.height = FLAG_H * 1.9 + 4;
    pole.width = 7;
    pole.position.set(0, 2);
    const finial = new Sprite(this.finialTexture());
    finial.anchor.set(0.5, 1);
    finial.width = 14;
    finial.height = 20;
    finial.position.set(0, -FLAG_H * 1.9 + 2);
    const flag = new WavingFlag(this.flags.blank());
    flag.mesh.position.set(2, -FLAG_H * 1.85);
    // Carved channels: an ink trough holding the pigment fill, capped in gold leaf.
    const gauge = new Container();
    gauge.position.set(0, GAUGE_Y);
    const channel = new Sprite(this.channelTexture());
    channel.position.set(-BAR_W / 2 - CAP, 0);
    channel.width = BAR_W + CAP * 2;
    channel.height = GAUGE_H;
    const wound = new Sprite(Texture.WHITE);
    wound.tint = 0xf3e2bc;
    wound.alpha = 0.92;
    wound.height = BAR_H;
    wound.position.set(-BAR_W / 2, STRENGTH_Y);
    wound.visible = false;
    const strength = new Sprite(this.fillTexture('strength'));
    strength.height = BAR_H;
    strength.width = BAR_W;
    strength.position.set(-BAR_W / 2, STRENGTH_Y);
    const edge = new Sprite(this.fillTexture('edge'));
    edge.anchor.set(0.5, 0);
    edge.width = 4;
    edge.height = BAR_H;
    edge.position.set(BAR_W / 2, STRENGTH_Y);
    const morale = new Sprite(this.fillTexture('morale'));
    morale.height = MORALE_H;
    morale.width = BAR_W;
    morale.position.set(-BAR_W / 2, MORALE_Y);
    gauge.addChild(channel, wound, strength, edge, morale);
    // The far marker, laid out in screen pixels (the root is scaled to 1 / zoom far out).
    const token = new Sprite();
    token.anchor.set(0.5);
    token.width = MARK_W;
    token.height = MARK_H;
    token.position.set(0, MARK_Y);
    token.visible = false;
    const markBack = new Sprite(Texture.WHITE);
    markBack.tint = 0x22180f;
    markBack.position.set(MARK_TEXT_X - 1, MARK_BAR_Y - 1);
    markBack.width = MARK_BAR_W + 2;
    markBack.height = MARK_BAR_H + 2;
    const markBar = new Sprite(this.fillTexture('morale'));
    markBar.position.set(MARK_TEXT_X, MARK_BAR_Y);
    markBar.width = MARK_BAR_W;
    markBar.height = MARK_BAR_H;
    const markCount = new Text({ text: '', style: vellumText(25), resolution: 2 });
    markCount.anchor.set(0, 0.5);
    markCount.scale.set(0.5);
    markCount.position.set(MARK_TEXT_X - 1, MARK_TEXT_Y);
    markBack.visible = markBar.visible = markCount.visible = false;
    const count = new Text({ text: '', style: { fontFamily: '"Alegreya SC", Alegreya, Georgia, serif', fontSize: 30, fontWeight: '700', fill: 0xefe4c8, stroke: { color: 0x22180f, width: 7, join: 'round' } }, resolution: 2 });
    count.anchor.set(0, 0.5);
    count.position.set(BAR_W / 2 + CAP + 5, GAUGE_H / 2);
    const star = new Text({ text: '✦', style: { fontFamily: 'Alegreya, Georgia, serif', fontSize: 38, fill: 0xf6dc8c, stroke: { color: 0x22180f, width: 6, join: 'round' } }, resolution: 2 });
    star.anchor.set(0.5);
    star.position.set(FLAG_W + 18, -FLAG_H * 1.6);
    gauge.addChild(count);
    root.addChild(pole, flag.mesh, finial, token, markBack, markBar, markCount, gauge, star);
    this.root.addChild(root);
    return { root, pole, finial, flag, gauge, strength, wound, edge, morale, woundW: BAR_W, woundAt: -1e9, token, tokenKey: '', markBack, markBar, markCount, markAlpha: 0, count, star, seen: 0, key: '', routFlash: -1e9, raise: 1, raiseTarget: 1, x: 0, y: 0, ax: 0, ay: 0, platoon: -1, box: markerBox(2), topX: NaN, topY: NaN };
  }

  private staff: Texture | null = null;
  private finialTex: Texture | null = null;
  private channelTex: Texture | null = null;
  private fills = new Map<string, Texture>();

  /**
   * The gauge's carved channel, baked at 3x: an ink-rimmed trough cut into the wood, a pale
   * lip catching the upper-left light, and gilded end caps that hold both rows.
   */
  private channelTexture(): Texture {
    if (this.channelTex) return this.channelTex;
    const k = 3;
    const w = BAR_W + CAP * 2;
    const [c, ctx] = canvas2d(w * k, GAUGE_H * k);
    ctx.scale(k, k);
    const trough = (y: number, h: number) => {
      ctx.fillStyle = '#22180f';
      ctx.fillRect(CAP - 1.5, y - 1.5, BAR_W + 3, h + 3);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#120c07');
      g.addColorStop(0.45, '#2e2116');
      g.addColorStop(1, '#3d2c1c');
      ctx.fillStyle = g;
      ctx.fillRect(CAP, y, BAR_W, h);
      // The cut's lower lip catches the light.
      ctx.fillStyle = 'rgba(217,199,158,0.55)';
      ctx.fillRect(CAP - 1.5, y + h + 1.5, BAR_W + 3, 0.8);
    };
    trough(STRENGTH_Y, BAR_H);
    trough(MORALE_Y, MORALE_H);
    const cap = (x0: number, flip: boolean) => {
      ctx.save();
      ctx.translate(flip ? w : 0, 0);
      ctx.scale(flip ? -1 : 1, 1);
      ctx.beginPath();
      ctx.moveTo(x0 + CAP + 0.5, 0.8);
      ctx.lineTo(x0 + 2.4, 0.8);
      ctx.quadraticCurveTo(x0 + 0.6, GAUGE_H / 2, x0 + 2.4, GAUGE_H - 0.8);
      ctx.lineTo(x0 + CAP + 0.5, GAUGE_H - 0.8);
      ctx.closePath();
      const g = ctx.createLinearGradient(x0, 0, x0 + CAP, GAUGE_H);
      g.addColorStop(0, '#f6dc8c');
      g.addColorStop(0.5, '#d4a93e');
      g.addColorStop(1, '#8a6418');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#22180f';
      ctx.stroke();
      // A punched rivet in the leaf.
      ctx.fillStyle = '#8a6418';
      ctx.beginPath();
      ctx.arc(x0 + CAP * 0.52, GAUGE_H / 2, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(246,220,140,0.9)';
      ctx.fillRect(x0 + CAP * 0.52 - 1, GAUGE_H / 2 - 1.2, 0.8, 0.8);
      ctx.restore();
    };
    cap(0, false);
    cap(0, true);
    this.channelTex = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
    return this.channelTex;
  }

  /** Pigment fills: verdigris strength with a lit top and a hatched shade, a white morale fill to tint, a gold edge tick. */
  private fillTexture(kind: 'strength' | 'morale' | 'edge'): Texture {
    const hit = this.fills.get(kind);
    if (hit) return hit;
    const [c, ctx] = canvas2d(8, 24);
    const g = ctx.createLinearGradient(0, 0, 0, 24);
    if (kind === 'strength') {
      g.addColorStop(0, '#8fd0b8');
      g.addColorStop(0.22, '#4fa58c');
      g.addColorStop(0.6, '#2f7f6f');
      g.addColorStop(1, '#1b4f45');
    } else if (kind === 'morale') {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#e4e4e4');
      g.addColorStop(1, '#a8a8a8');
    } else {
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, '#f6dc8c');
      g.addColorStop(1, '#b8892a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 24);
    if (kind === 'edge') {
      ctx.fillStyle = '#22180f';
      ctx.fillRect(7, 0, 1, 24);
    }
    const t = new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'linear' }) });
    this.fills.set(kind, t);
    return t;
  }

  private staffTexture(): Texture {
    if (!this.staff) {
      const [c, ctx] = canvas2d(14, 128);
      ctx.fillStyle = '#22180f';
      ctx.fillRect(0, 0, 14, 128);
      const g = ctx.createLinearGradient(2, 0, 12, 0);
      g.addColorStop(0, '#a07a4a');
      g.addColorStop(0.4, '#7a5530');
      g.addColorStop(1, '#4a3420');
      ctx.fillStyle = g;
      ctx.fillRect(3, 0, 8, 128);
      this.staff = new Texture({ source: new CanvasSource({ resource: c }) });
    }
    return this.staff;
  }

  private finialTexture(): Texture {
    if (!this.finialTex) {
      const [c, ctx] = canvas2d(28, 40);
      ctx.beginPath();
      ctx.moveTo(14, 2);
      ctx.quadraticCurveTo(24, 18, 14, 32);
      ctx.quadraticCurveTo(4, 18, 14, 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(4, 0, 24, 0);
      g.addColorStop(0, '#f6dc8c');
      g.addColorStop(0.5, '#d4a93e');
      g.addColorStop(1, '#8a6418');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#22180f';
      ctx.stroke();
      ctx.fillStyle = '#d4a93e';
      ctx.fillRect(7, 31, 14, 7);
      ctx.strokeRect(7, 31, 14, 7);
      this.finialTex = new Texture({ source: new CanvasSource({ resource: c }) });
    }
    return this.finialTex;
  }

  destroy(): void {
    this.staff?.destroy(true);
    this.finialTex?.destroy(true);
    this.channelTex?.destroy(true);
    for (const t of this.fills.values()) t.destroy(true);
    this.fills.clear();
    this.reset();
    this.tethers.destroy();
  }
}

export function platoonCentroids(world: World): Map<number, { x: number; y: number; n: number }> {
  const out = new Map<number, { x: number; y: number; n: number }>();
  for (const u of world.units) {
    const c = out.get(u.platoon);
    if (c) {
      c.x += u.x;
      c.y += u.y;
      c.n++;
    } else out.set(u.platoon, { x: u.x, y: u.y, n: 1 });
  }
  for (const c of out.values()) {
    c.x /= c.n;
    c.y /= c.n;
  }
  return out;
}

export function isActive(pl: Platoon): boolean {
  return pl.state !== PlatoonState.Queued && pl.alive > 0;
}
