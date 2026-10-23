import { Application, Container, Graphics, Sprite, Texture, CanvasSource } from 'pixi.js';
import { PlatoonState, type MapDef, type TickEvents, type World } from '../../sim/api.ts';
import { derived } from '../../sim/derived.ts';
import { cellAt, cellCenterX, cellCenterY } from '../../sim/flowfield.ts';
import type { Runner } from '../net/runner.ts';
import type { FloatingEmote, GameStore } from '../store.ts';
import { BannerLayer, platoonCentroids } from './banners.ts';
import { Camera } from './camera.ts';
import { Director } from './director.ts';
import { FlagCache } from './flags.ts';
import { Effects } from './fx/index.ts';
import { FAR_ZOOM } from './lod.ts';
import { InfluenceLayer } from './influence.ts';
import { hslNumber, hslRgb, mixColor } from './paint.ts';
import { SiteLayer } from './sites.ts';
import { paintTerrain } from './terrain.ts';
import { makeTextures, type Textures } from './textures.ts';
import { UnitLayer } from './units.ts';
import { makeUnitArt, type UnitArt } from './art/index.ts';

export interface BattlefieldOptions {
  reducedMotion?: boolean;
}

const GOLD = 0xf2cf5b;

interface MapLayers {
  map: MapDef;
  terrain: Sprite;
  sites: SiteLayer;
  influence: InfluenceLayer;
}

/** The battlefield: owns the Pixi application, the camera and every visual layer. */
export class Battlefield {
  private readonly scene = new Container();
  private readonly groundLayer = new Container();
  private readonly selection = new Graphics();
  private readonly camera: Camera;
  private readonly units: UnitLayer;
  private readonly fx: Effects;
  private readonly banners: BannerLayer;
  private readonly flags = new FlagCache();
  private readonly director: Director;
  private layers: MapLayers | null = null;
  private unsubscribe: (() => void)[] = [];
  private last = performance.now();
  private shake = 0;
  private tints: number[] = [];
  private rgb: [number, number, number][] = [];
  private destroyed = false;
  /** Smoothed milliseconds of JavaScript per frame, for diagnostics. */
  frameMs = 0;
  /** Smoothed milliseconds per stage of the last frames, for diagnostics. */
  readonly timings: Record<string, number> = {};

  private constructor(
    private readonly app: Application,
    private readonly host: HTMLElement,
    private readonly store: GameStore,
    private readonly getRunner: () => Runner | null,
    private readonly tex: Textures,
    art: UnitArt,
    private readonly opts: BattlefieldOptions,
  ) {
    this.units = new UnitLayer(tex, art);
    this.fx = new Effects({ reducedMotion: opts.reducedMotion });
    // Fliers are drawn mid-cell, lifted by their flight height: aim effects at the creature's body.
    this.fx.flyHeight = (kind) => {
      const flight = art.flight(kind);
      if (!flight) return 0;
      const cell = art.cell(kind);
      return flight.height + ((cell.feetY - cell.h / 2) / cell.h) * art.scale(kind);
    };
    this.banners = new BannerLayer(this.flags);
    app.stage.addChild(this.scene);
    this.scene.addChild(
      this.groundLayer,
      this.selection,
      this.fx.ground,
      this.units.shadows,
      this.units.bodies,
      this.units.dots,
      this.fx.air,
      this.fx.glow,
      this.banners.root,
      this.units.air,
      this.fx.overlay,
    );
    this.camera = new Camera(app.canvas, {
      onClick: (sx, sy) => this.click(sx, sy),
      onUserPan: () => store.setFollowing(false),
    });
    this.director = new Director(() => (this.layers ? this.camera.fitZoom(this.layers.map.radius) : 0.5));
    this.unsubscribe.push(
      store.onStep((ev, world) => this.onStep(ev, world)),
      store.onEmote((e) => this.onEmote(e)),
    );
    app.ticker.add(() => this.frame());
  }

  static async create(host: HTMLElement, store: GameStore, getRunner: () => Runner | null, opts: BattlefieldOptions = {}): Promise<Battlefield> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x06090c,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    host.appendChild(app.canvas);
    const reducedMotion = opts.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return new Battlefield(app, host, store, getRunner, makeTextures(), makeUnitArt(), { ...opts, reducedMotion });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const u of this.unsubscribe) u();
    this.camera.destroy();
    this.banners.destroy();
    this.fx.destroy();
    this.flags.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: false });
    void this.host;
  }

  focus(x: number, y: number, zoom?: number): void {
    this.store.setFollowing(false);
    this.camera.panTo(x, y, zoom ?? Math.max(this.camera.zoom, 1.1));
  }

  focusPlayer(p: number): void {
    const world = this.store.world;
    const player = world?.players[p];
    if (!world || !player) return;
    const site = world.map.sites[player.slot]!;
    this.focus(site.x * 0.85, site.y * 0.85, 0.9);
  }

  // ---------------------------------------------------------------- frame

  private frame(): void {
    const started = performance.now();
    this.draw();
    this.frameMs = this.frameMs * 0.95 + (performance.now() - started) * 0.05;
  }

  private draw(): void {
    const now = performance.now();
    const dtMs = Math.min(100, now - this.last);
    this.last = now;
    const runner = this.getRunner();
    let mark = performance.now();
    const time = (name: string) => {
      const t = performance.now();
      this.timings[name] = (this.timings[name] ?? 0) * 0.95 + (t - mark) * 0.05;
      mark = t;
    };
    runner?.frame();
    time('sim');
    this.store.pump();
    time('hud');
    const world = this.store.world;
    this.camera.resize(this.app.screen.width, this.app.screen.height);
    if (!world) {
      this.scene.visible = false;
      return;
    }
    this.scene.visible = true;
    if (!this.layers || this.layers.map !== world.map) {
      this.buildMap(world);
      mark = performance.now();
    }
    const layers = this.layers!;
    this.refreshColors(world);


    if (this.store.following && !this.camera.busy) {
      const shot = this.director.next(dtMs, now);
      this.camera.drift(shot.x, shot.y, shot.zoom, dtMs);
    } else this.director.next(dtMs, now);
    this.camera.update(dtMs);

    const zoom = this.camera.zoom;
    this.shake = Math.max(0, this.shake - dtMs / 600);
    const jx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    const jy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    this.scene.scale.set(zoom);
    this.scene.position.set(this.camera.width / 2 - this.camera.x * zoom + jx, this.camera.height / 2 - this.camera.y * zoom + jy);

    const bounds = this.camera.bounds(60);
    const cry = world.players.map((p) => p.cryUntil > world.tick);
    this.units.tints = this.tints;
    this.units.cryTint = this.tints.map((t, p) => (cry[p] ? mixColor(t, GOLD, 0.45 + Math.sin(now / 140) * 0.3) : t));
    time('camera');
    this.units.update(world, runner, now, zoom, bounds);
    time('units');
    const centroids = platoonCentroids(world);
    const sel = this.store.selection;
    this.banners.update(world, this.store.repos, world.players.map((p) => p.hue), now, zoom, centroids, bounds, sel?.kind === 'platoon' ? sel.id : null);
    time('banners');
    layers.sites.update(world, this.store.roster, this.store.names, this.tints, now, dtMs / 1000, zoom, sel?.kind === 'site' ? sel.id : null, {
      smoke: (x, y) => this.fx.burst({ x, y, count: 1, texture: 'smoke', tint: 0x3a3632, speed: 6, life: 3.2, size: 26, grow: 2.6, alpha: 0.6, rise: 14 }),
    });
    time('sites');
    layers.influence.update(world, this.rgb, now);
    time('influence');
    this.drawSelection(world, centroids, now, zoom);
    this.fx.update(dtMs, world.tick - 1 + (runner?.alpha ?? 1), this.posOf, zoom, bounds);
    if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, this.fx.shake);
    time('fx');
  }

  private buildMap(world: World): void {
    if (this.layers) {
      this.groundLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.layers.sites.labels.destroy({ children: true });
    }
    const map = world.map;
    const art = paintTerrain(map, world.params.seed, 3072);
    const terrain = new Sprite(new Texture({ source: new CanvasSource({ resource: art.canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }) }));
    terrain.anchor.set(0.5);
    terrain.width = terrain.height = art.extent * 2;
    const influence = new InfluenceLayer(map.radius);
    const sites = new SiteLayer(this.tex, this.flags, world);
    this.groundLayer.addChild(terrain, influence.sprite, sites.ground, sites.root);
    this.scene.addChild(sites.labels);
    this.layers = { map, terrain, sites, influence };
    this.camera.fit(map.radius);
  }

  private refreshColors(world: World): void {
    for (const p of world.players) {
      if (this.tints[p.p] !== undefined && this.rgb[p.p]) continue;
      this.tints[p.p] = hslNumber(p.hue, 72, 54);
      this.rgb[p.p] = hslRgb(p.hue, 80, 50);
    }
  }

  // ---------------------------------------------------------------- events

  /** Ground position of a soldier as last drawn, or the top of a structure (id < 0). */
  private posOf = (id: number): { x: number; y: number } | null => {
    const world = this.store.world;
    if (!world) return null;
    if (id < 0) {
      const st = world.structures[-id - 1];
      if (!st) return null;
      const s = world.map.sites[st.site]!;
      return { x: s.x, y: s.y - s.radius * 0.6 };
    }
    return this.units.pose(id) ?? null;
  };

  private onStep(ev: TickEvents, world: World): void {
    if (!this.layers) return;
    this.director.observe(ev, world);
    const now = performance.now();
    const near = this.camera.zoom >= FAR_ZOOM;
    const bounds = this.camera.bounds(120);
    this.fx.onStep(ev, world, { posOf: this.posOf, tints: this.tints, near, bounds });

    for (const s of ev.swings) {
      const target = this.posOf(s.to);
      if (target) this.units.swing(s.from, target.x, target.y, now);
    }
    // Archers, wizards and trebuchets play their attack pose as they loose.
    for (const s of ev.shots) {
      if (s.from <= 0) continue;
      const target = this.posOf(s.to);
      if (target) this.units.swing(s.from, target.x, target.y, now);
    }
    for (const h of ev.hits) {
      if (h.structure >= 0) {
        const st = world.structures[h.structure];
        if (st) this.layers.sites.structureHit(st.site);
        continue;
      }
      this.units.flash(h.unit, now);
      const a = Math.random() * Math.PI * 2;
      this.units.knock(h.unit, Math.cos(a) * 1.6, Math.sin(a) * 1.0, now);
    }
    if (near) {
      for (const d of ev.deaths) {
        const p = this.units.pose(d.unit);
        const x = p?.x ?? d.x;
        const y = p?.y ?? d.y;
        if (!bounds.contains(x, y)) continue;
        const c = this.units.corpse(d.kind);
        this.fx.corpse(c.texture, x, y, p?.facing ?? 1, c.scale, 0xd0d0d0, c.altitude, c.anchorY);
      }
    }
    for (const r of ev.regroups) this.banners.regroup(r.from, r.to, now);
    for (const r of ev.routs) {
      this.banners.rout(r.platoon, now);
      const pl = world.platoons.find((x) => x.id === r.platoon);
      if (pl && bounds.contains(pl.x, pl.y)) this.fx.floatText('ROUT!', pl.x, pl.y - 36, 1.6, 15, 0xffe0d0);
    }
    if (ev.monolith) this.layers.sites.monolithFell(now);
  }

  private onEmote(e: FloatingEmote): void {
    const world = this.store.world;
    if (!world) return;
    const player = e.p !== null ? world.players[e.p] : undefined;
    const site = player ? world.map.sites[player.slot]! : world.map.sites.find((s) => s.kind === 'heart')!;
    this.fx.floatText(e.emote, site.x + (Math.random() - 0.5) * 50, site.y - site.radius * 2.6, 3.5, 30);
  }

  private kick(amount: number): void {
    if (!this.opts.reducedMotion) this.shake = Math.max(this.shake, amount);
  }

  // ------------------------------------------------------------ selection

  private drawSelection(world: World, centroids: Map<number, { x: number; y: number; n: number }>, now: number, zoom: number): void {
    const g = this.selection;
    g.clear();
    const sel = this.store.selection;
    if (sel?.kind === 'player') {
      const p = world.players[sel.p];
      if (!p) return;
      for (const pl of world.platoons) {
        if (pl.p !== sel.p || pl.state === PlatoonState.Queued) continue;
        const c = centroids.get(pl.id);
        if (c) g.circle(c.x, c.y, 26).stroke({ width: 2.5 / zoom, color: 0xffffff, alpha: 0.6 });
      }
      return;
    }
    if (sel?.kind !== 'platoon') return;
    const pl = world.platoons.find((x) => x.id === sel.id);
    const c = centroids.get(sel.id);
    if (!pl || !c) return;
    let r = 12;
    for (const u of world.units) {
      if (u.platoon !== pl.id) continue;
      r = Math.max(r, Math.hypot(u.x - c.x, u.y - c.y));
    }
    r = Math.min(r + 10, 160);
    const pulse = 1 + Math.sin(now / 220) * 0.05;
    const tint = this.tints[pl.p] ?? 0xffffff;
    g.ellipse(c.x, c.y, r * pulse, r * 0.7 * pulse).fill({ color: tint, alpha: 0.12 }).stroke({ width: 3 / zoom, color: 0xffffff, alpha: 0.95 });
    if (pl.site < 0 || pl.state === PlatoonState.Engage) return;
    const goal = pl.state === PlatoonState.Rout ? world.players[pl.p]!.slot : pl.site;
    const field = derived(world.map).flow[goal];
    if (!field) return;
    let cell = cellAt(world.map, pl.x, pl.y);
    const pts: [number, number][] = [[pl.x, pl.y]];
    for (let i = 0; i < 400 && cell >= 0; i++) {
      const next = field.next[cell]!;
      if (next < 0) break;
      cell = next;
      if (i % 2 === 0) pts.push([cellCenterX(world.map, cell), cellCenterY(world.map, cell)]);
    }
    const target = world.map.sites[goal]!;
    pts.push([target.x, target.y]);
    const dash = 10 / zoom;
    const offset = ((now / 40) % 20) / zoom;
    let carry = -offset;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      let t = carry;
      while (t < len) {
        const a = Math.max(0, t);
        const b = Math.min(len, t + dash);
        if (b > a) g.moveTo(x0 + ((x1 - x0) * a) / len, y0 + ((y1 - y0) * a) / len).lineTo(x0 + ((x1 - x0) * b) / len, y0 + ((y1 - y0) * b) / len);
        t += dash * 2;
      }
      carry = t - len - dash * 2;
    }
    g.stroke({ width: 3 / zoom, color: 0xffffff, alpha: 0.85 });
    g.ellipse(target.x, target.y, target.radius * 1.1, target.radius * 0.7).stroke({ width: 2 / zoom, color: tint, alpha: 0.9 });
  }

  // ---------------------------------------------------------------- input

  private click(sx: number, sy: number): void {
    const world = this.store.world;
    if (!world || !this.layers) return;
    const p = this.camera.toWorld(sx, sy);
    for (const h of this.banners.hits) {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      if (dx * dx + dy * dy <= h.r * h.r) {
        this.store.select({ kind: 'platoon', id: h.platoon });
        return;
      }
    }
    let best = -1;
    let bestD = (Math.max(9, 14 / this.camera.zoom)) ** 2;
    for (const u of world.units) {
      const pose = this.units.pose(u.id);
      const ux = pose?.x ?? u.x;
      const uy = (pose?.y ?? u.y) - 6;
      const d = (ux - p.x) ** 2 + (uy - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u.platoon;
      }
    }
    if (best >= 0) {
      this.store.select({ kind: 'platoon', id: best });
      return;
    }
    const site = this.layers.sites.hit(p.x, p.y);
    this.store.select(site === null ? null : { kind: 'site', id: site });
  }
}
