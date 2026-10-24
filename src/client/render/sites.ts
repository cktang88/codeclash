import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Monument, RosterEntry } from '../../protocol.ts';
import { NEUTRAL, TICK_MS, type SiteDef, type Structure, type World } from '../../sim/api.ts';
import { siteLabel, type Names } from '../../sim/chronicle.ts';
import { breachable } from '../../sim/council.ts';
import { slotAngle } from '../../sim/mapgen.ts';
import { CAPITAL_TOWER, CAPTURE_TICKS } from '../../sim/stats.ts';
import { gatesUnbarAt, siegesOpenAt } from '../ringinfo.ts';
import { WavingFlag } from './banners.ts';
import { FLAG_W, type FlagCache } from './flags.ts';
import { LabelLayer, MapLabel } from './labels.ts';
import { mixColor } from './paint.ts';
import { siteArt, type SiteArt } from './siteart.ts';
import type { Textures } from './textures.ts';

const NEUTRAL_TINT = 0xc9bea2;
const INK = 0x22180f;
const GOLD = 0xd4a93e;
const EMBER = 0xff9a3c;
const VELLUM = 0xefe4c8;
const VERMILION = 0xb8321f;

/** Keep styles a player may choose in the Armory: the stone is tinted to suit. */
const KEEP_TINT: Record<string, number> = { stone: 0xffffff, timber: 0xe6caa0, citadel: 0xf4f1ff };
/** How long the old banners take to come down, and the new ones to go up, in seconds. */
const LOWER_S = 0.9;
const RAISE_S = 1.3;
/** Campfires along a siege line. */
const SIEGE_FIRES = 5;
/** Seconds between samples of a besieged wall's HP, for its breach estimate. */
const BREACH_SAMPLE_MS = 4000;

interface FlagPole {
  flag: WavingFlag;
  /** The pole's length in art pixels, which the flag travels when lowered and raised. */
  length: number;
  /** The flag's resting position. */
  x: number;
  y: number;
  scale: number;
}

interface SiteView {
  def: SiteDef;
  root: Container;
  art: Container;
  body: Sprite;
  pigment: Sprite | null;
  scorch: Sprite | null;
  doors: [Sprite, Sprite] | null;
  ring: Graphics;
  /** Earthworks, stakes and the wall-HP ring of a siege, on the ground. */
  siege: Graphics;
  bar: Graphics;
  label: MapLabel;
  poles: FlagPole[];
  flagKey: string;
  /** Emissive layers, in the light pass. */
  halo: Sprite;
  emissive: Sprite | null;
  /** Campfires of a siege camp, in the light pass. */
  fires: Sprite[];
  scale: number;
  wound: number;
  shake: number;
  gateAt: number;
  nextSmoke: number;
  /** Who flew the banners last frame, to raise new ones when the holder changes. */
  holder: number;
  /** The holder's standard. */
  std: Texture | null;
  /** When the banners last changed hands (or were raised in triumph), and what flew before. */
  swapAt: number;
  swapFrom: Texture | null;
  /** A besieged wall's HP a few seconds ago, for the breach estimate. */
  sampleHp: number;
  sampleTick: number;
  /** Smoothed HP lost per tick while besieged. */
  loss: number;
}

/** A rising's standard, planted on the ring road outside the lost home it means to retake. */
interface RisingView {
  p: number;
  root: Container;
  flag: WavingFlag;
  key: string;
  at: number;
  x: number;
  y: number;
  label: MapLabel;
}

export interface SiteFx {
  smoke(x: number, y: number, heavy: boolean): void;
}

interface MonumentView {
  sprite: Sprite;
  label: MapLabel;
  key: string;
}

/** Capitals, border forts and the risings' standards, plus the statues that stand among them. */
export class SiteLayer {
  readonly ground = new Container();
  readonly root = new Container();
  /** Additive emissive layer: windows, braziers, siege fires, halos. Drawn above the day–night grade. */
  readonly lights = new Container();
  readonly labels = new LabelLayer();
  /** Phone-sized screen: labels letter a size smaller (never below the 15px floor). */
  compact = false;
  /** Under reduced motion struck walls do not shudder and banners change without ceremony. */
  reducedMotion = false;
  private readonly art: SiteArt = siteArt();
  private views: SiteView[] = [];
  private monuments: MonumentView[] = [];
  private risings = new Map<number, RisingView>();
  /** Structures by site, rebuilt each frame. */
  private readonly structureAt = new Map<number, Structure>();

  constructor(
    private tex: Textures,
    private flags: FlagCache,
    private world: World,
  ) {
    this.root.sortableChildren = true;
    for (const def of world.map.sites) this.views.push(this.create(def));
  }

  structureHit(site: number): void {
    const v = this.views[site];
    if (v) v.shake = 1;
  }

  /** Swing a capital's gates open for a muster; they close again on their own. */
  openGate(site: number, now: number): void {
    const v = this.views[site];
    if (v?.doors) v.gateAt = now;
  }

  /** Banners raised afresh over a site: the holder's own in triumph (the ring won), or a new holder's. */
  raiseBanners(site: number, now: number): void {
    const v = this.views[site];
    if (!v || this.reducedMotion) return;
    v.swapAt = now - LOWER_S * 1000;
    v.swapFrom = null;
  }

  /** Statues of named legends beside their players' capitals, and the Season Victor's obelisk on the centre's shore. */
  setMonuments(list: readonly Monument[], world: World, names: Names): void {
    for (const m of this.monuments) {
      m.sprite.destroy();
      this.labels.remove(m.label);
    }
    this.monuments = [];
    const perCapital = new Map<number, number>();
    for (const m of list) {
      let x: number;
      let y: number;
      let tex: Texture;
      let size: number;
      if (m.kind === 'season' || m.p < 0) {
        // On the shore of the lake or at the foot of the massif, below the centre, facing the south road.
        const shore = world.map.centre > 0 ? world.map.centre + 34 : world.map.ring * 0.6;
        x = 0;
        y = shore;
        tex = this.art.obelisk;
        size = 120;
      } else {
        const player = world.players[m.p];
        const site = player ? world.map.sites[player.slot] : undefined;
        if (!site) continue;
        const n = perCapital.get(m.p) ?? 0;
        perCapital.set(m.p, n + 1);
        // Stand on the outward side of the keep, off the ring road, in a row along it.
        const len = Math.hypot(site.x, site.y) || 1;
        const ox = site.x / len;
        const oy = site.y / len;
        const side = n % 2 === 0 ? 1 : -1;
        const step = Math.floor(n / 2) + 1;
        x = site.x + ox * site.radius * 1.35 - oy * side * step * site.radius * 0.5;
        y = site.y + oy * site.radius * 1.35 + ox * side * step * site.radius * 0.5;
        tex = this.art.statue;
        size = site.radius * 0.95;
      }
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.55, 0.93);
      sprite.scale.set(size / tex.height);
      sprite.position.set(x, y);
      sprite.zIndex = y;
      this.root.addChild(sprite);
      const label = this.labels.add(new MapLabel(15));
      label.x = x;
      label.y = y - size * 1.02;
      label.priority = 1;
      const who = m.p >= 0 ? names.player(m.p) : '';
      label.set(m.name, m.kind === 'season' ? `Season Victor${who ? ` · ${who}` : ''}` : m.epithet);
      this.monuments.push({ sprite, label, key: m.name });
    }
  }

  private pole(art: Container, x: number, y: number, size: number, length: number): FlagPole {
    const g = new Graphics();
    const top = y - length;
    g.moveTo(x, y + 2).lineTo(x, top).stroke({ width: 2.2, color: 0x4a3420 });
    g.circle(x, top - 1, 2.6).fill(GOLD).stroke({ width: 1, color: INK });
    art.addChild(g);
    const flag = new WavingFlag(this.flags.blank());
    const scale = (40 * size) / FLAG_W;
    flag.mesh.scale.set(scale);
    flag.mesh.position.set(x + 1, top + 1);
    art.addChild(flag.mesh);
    return { flag, length: length - 8, x: x + 1, y: top + 1, scale };
  }

  private create(def: SiteDef): SiteView {
    const root = new Container();
    root.position.set(def.x, def.y);
    root.zIndex = def.y;
    const art = new Container();
    root.addChild(art);
    const ring = new Graphics();
    ring.position.set(def.x, def.y);
    const siege = new Graphics();
    siege.position.set(def.x, def.y);
    this.ground.addChild(siege, ring);
    const halo = new Sprite(this.tex.soft);
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    halo.position.set(def.x, def.y - def.radius * 0.6);
    this.lights.addChild(halo);
    let body: Sprite;
    let pigment: Sprite | null = null;
    let scorch: Sprite | null = null;
    let emissive: Sprite | null = null;
    let doors: [Sprite, Sprite] | null = null;
    const poles: FlagPole[] = [];
    const fires: Sprite[] = [];
    let scale: number;
    const place = (s: Sprite, feet: { x: number; y: number }, w: number, h: number) => {
      s.anchor.set(feet.x / w, feet.y / h);
      return s;
    };
    if (def.kind === 'capital') {
      const c = this.art.castle;
      scale = (def.radius * 2.25) / 252;
      body = place(new Sprite(c.body), c.feet, c.w, c.h);
      pigment = place(new Sprite(c.pigment), c.feet, c.w, c.h);
      scorch = place(new Sprite(this.art.scorch), c.feet, c.w, c.h);
      scorch.visible = false;
      art.addChild(body, scorch, pigment);
      const left = new Sprite(c.door);
      const right = new Sprite(c.door);
      left.anchor.set(0, 1);
      right.anchor.set(0, 1);
      left.position.set(c.gate.x - c.gate.w / 2 - c.feet.x, c.gate.y - c.feet.y);
      right.position.set(c.gate.x + c.gate.w / 2 - c.feet.x, c.gate.y - c.feet.y);
      left.width = c.gate.w / 2;
      left.height = c.gate.h;
      right.width = -c.gate.w / 2;
      right.height = c.gate.h;
      art.addChild(left, right);
      doors = [left, right];
      for (const p of c.poles) poles.push(this.pole(art, p.x - c.feet.x, p.y - c.feet.y + 2, p.size, 34 * p.size));
      emissive = place(new Sprite(c.windows), c.feet, c.w, c.h);
      halo.scale.set((def.radius * 4) / 64, (def.radius * 2.6) / 64);
      halo.tint = 0xffb060;
      for (let i = 0; i < SIEGE_FIRES; i++) {
        const f = new Sprite(this.tex.soft);
        f.anchor.set(0.5);
        f.blendMode = 'add';
        f.tint = EMBER;
        f.visible = false;
        this.lights.addChild(f);
        fires.push(f);
      }
    } else {
      const f = this.art.fort;
      scale = (def.radius * 2.3) / 180;
      body = place(new Sprite(f.body), f.feet, f.w, f.h);
      pigment = place(new Sprite(f.pigment), f.feet, f.w, f.h);
      art.addChild(body, pigment);
      poles.push(this.pole(art, f.pole.x - f.feet.x, f.pole.y - f.feet.y, 0.9, 34));
      emissive = place(new Sprite(f.windows), f.feet, f.w, f.h);
      halo.scale.set((def.radius * 3.2) / 64, (def.radius * 2.4) / 64);
      halo.position.set(def.x, def.y - def.radius * 1.1);
    }
    art.scale.set(scale);
    if (emissive) {
      emissive.blendMode = 'add';
      emissive.scale.set(scale);
      emissive.position.set(def.x, def.y);
      this.lights.addChild(emissive);
    }
    const bar = new Graphics();
    root.addChild(bar);
    this.root.addChild(root);
    const label = this.labels.add(new MapLabel(def.kind === 'fort' ? 16 : 19));
    label.priority = def.kind === 'capital' ? 10 : 5;
    return {
      def, root, art, body, pigment, scorch, doors, ring, siege, bar, label, poles, flagKey: '', halo, emissive, fires, scale,
      wound: 1, shake: 0, gateAt: -1e9, nextSmoke: 0, holder: NaN, std: null, swapAt: -1e9, swapFrom: null, sampleHp: -1, sampleTick: -1, loss: 0,
    };
  }

  update(
    world: World,
    roster: readonly RosterEntry[],
    names: Names,
    tints: readonly number[],
    now: number,
    dt: number,
    zoom: number,
    selectedSite: number | null,
    fx: SiteFx,
    light: { lights: number; leader: number; near: boolean; inView(x: number, y: number): boolean },
  ): void {
    this.world = world;
    const lights = light.lights;
    const structureAt = this.structureAt;
    structureAt.clear();
    for (const st of world.structures) structureAt.set(st.site, st);
    for (const v of this.views) {
      const { def } = v;
      const state = world.sites[def.id]!;
      v.shake = Math.max(0, v.shake - dt * 5);
      const jitter = v.shake > 0 && !this.reducedMotion ? (Math.random() - 0.5) * v.shake * 2.5 : 0;
      v.root.position.set(def.x + jitter, def.y);
      v.ring.clear();
      v.siege.clear();
      v.bar.clear();
      const visible = light.inView(def.x, def.y - def.radius);
      let title = '';
      let subtitle = '';
      let rubric = false;
      if (def.kind === 'capital') {
        const st = structureAt.get(def.id);
        const owner = st ? st.p : NEUTRAL;
        const founder = world.players.find((pl) => pl.slot === def.slot)?.p ?? NEUTRAL;
        const ruined = !st;
        const captured = !!st && founder !== NEUTRAL && owner !== founder;
        const c = this.art.castle;
        v.body.texture = ruined ? c.ruins : c.body;
        // The founder's architecture stands whoever holds it; only the banners and pigment change.
        const heraldry = founder !== NEUTRAL ? roster[founder]?.heraldry : undefined;
        v.body.tint = KEEP_TINT[heraldry?.keep ?? 'stone'] ?? 0xffffff;
        v.body.alpha = owner === NEUTRAL ? 0.55 : 1;
        const tint = owner !== NEUTRAL ? tints[owner]! : NEUTRAL_TINT;
        v.pigment!.visible = !ruined;
        v.pigment!.tint = tint;
        v.pigment!.alpha = owner === NEUTRAL ? 0.55 : 1;
        v.scorch!.visible = !ruined && (captured || (st?.taken ?? 0) > 0);
        // Windows glow from dusk.
        v.emissive!.visible = !ruined && owner !== NEUTRAL && lights > 0.02;
        v.emissive!.alpha = lights * (0.85 + Math.sin(now / 900 + def.id * 1.7) * 0.08 + Math.sin(now / 137 + def.id) * 0.04);
        // Once the ring is won the field stands still: no siege goes on.
        const besieged = !!st && st.siegeSince >= 0 && world.victor < 0;
        v.halo.tint = besieged ? EMBER : 0xffb060;
        v.halo.alpha = owner === NEUTRAL ? 0 : besieged ? 0.18 + lights * 0.3 + Math.sin(now / 160) * 0.04 : lights * 0.32;
        // The gates: swing open over 0.6s, hold while the column passes, close over a second.
        const g = (now - v.gateAt) / 1000;
        const open = ruined ? 0 : g < 0.6 ? easeOut(g / 0.6) : g < 3.4 ? 1 : g < 4.4 ? 1 - easeInOut((g - 3.4) / 1) : 0;
        if (v.doors) {
          const half = c.gate.w / 2;
          v.doors[0].width = half * (1 - open * 0.82);
          v.doors[1].width = -half * (1 - open * 0.82);
          v.doors[0].visible = v.doors[1].visible = !ruined;
        }
        this.flagsFor(v, world, roster, owner, now, visible, light.near);
        if (owner === NEUTRAL) {
          title = 'Open seat';
        } else {
          title = names.player(owner);
          rubric = owner === light.leader;
          const r = roster[owner];
          if (r?.heraldry?.title) subtitle = r.heraldry.title;
          if (captured) subtitle = `taken from ${names.player(founder)}`;
          const rising = founder !== NEUTRAL && captured && world.players[founder]?.rising;
          if (rising) subtitle = `${names.player(founder)} rises at the gates`;
          if (st && besieged) subtitle = `besieged · ${this.breachText(v, world, st)}`;
          else {
            v.sampleTick = -1;
            v.loss = 0;
          }
          if (visible && now >= v.nextSmoke && light.near) {
            v.nextSmoke = now + 900 + Math.random() * 500;
            const ch = c.chimneys[0]!;
            fx.smoke(def.x + (ch.x - c.feet.x) * v.scale, def.y + (ch.y - c.feet.y) * v.scale, false);
          }
          if (st) this.wallRing(v, st, tint, zoom, now, dt, besieged);
          if (st && besieged) this.siegeCamp(v, world, tints, zoom, now, lights, visible, fx);
          else for (const f of v.fires) f.visible = false;
        }
        if (ruined) for (const f of v.fires) f.visible = false;
      } else {
        const owner = state.owner;
        const held = owner !== NEUTRAL;
        const tint = held ? tints[owner]! : NEUTRAL_TINT;
        const contested = state.capturer !== NEUTRAL && state.progress > 0;
        const pulse = 0.5 + Math.sin(now / (contested ? 180 : 700) + def.id) * 0.5;
        v.pigment!.tint = held ? tint : 0x9a9078;
        v.pigment!.alpha = held ? 1 : 0.7;
        v.body.alpha = 1;
        this.flagsFor(v, world, roster, owner, now, visible, light.near);
        // The brazier and slits: lit by night while held, flaring while the fort is contested.
        const glowTint = contested ? mixColor(tints[state.capturer] ?? EMBER, EMBER, 0.5) : held ? mixColor(tint, 0xffc070, 0.6) : 0;
        v.emissive!.tint = glowTint || 0xffffff;
        v.emissive!.visible = contested || (held && lights > 0.05);
        v.emissive!.alpha = contested ? 0.65 + pulse * 0.35 : lights * (0.7 + pulse * 0.2);
        v.halo.tint = contested ? glowTint : tint;
        v.halo.alpha = contested ? 0.35 + pulse * 0.35 : held ? lights * 0.35 * (0.8 + pulse * 0.2) : 0;
        title = siteLabel(world, def.id, names).replace(/^the /, '');
        subtitle = contested
          ? `${names.player(state.capturer)} taking it · ${Math.round(Math.min(1, state.progress / CAPTURE_TICKS) * 100)}%`
          : held
            ? `held by ${names.player(owner)} · +${def.renown}/min`
            : `unclaimed · +${def.renown}/min`;
        this.captureRing(v, owner, state.capturer, state.progress / CAPTURE_TICKS, tints, zoom, contested ? pulse : 0);
      }
      if (selectedSite === def.id) {
        const pulse = 1 + Math.sin(now / 250) * 0.04;
        v.ring.ellipse(0, 0, def.radius * 1.3 * pulse, def.radius * 0.82 * pulse).stroke({ width: 4 / zoom, color: INK, alpha: 0.6 });
        v.ring.ellipse(0, 0, def.radius * 1.3 * pulse, def.radius * 0.82 * pulse).stroke({ width: 2 / zoom, color: GOLD, alpha: 0.95 });
      }
      const top = def.kind === 'capital' ? def.radius * 2.3 : def.radius * 1.75;
      v.label.set(title, subtitle, rubric);
      v.label.x = def.x;
      v.label.y = def.y - top;
      // An empty seat's ruin is scenery, not news: it yields to everything and only names itself up close.
      const openSeat = def.kind === 'capital' && title === 'Open seat';
      v.label.priority = openSeat ? 2 : def.kind === 'capital' ? 10 : 5;
      v.label.wanted = openSeat ? zoom > 0.7 : def.kind !== 'fort' || zoom > 0.16;
    }
    this.updateRisings(world, roster, names, now, zoom, light.near);
    for (const m of this.monuments) m.label.wanted = zoom > 1.1;
    this.labels.layout(zoom, (l) => l.priority >= 10 || zoom > 0.75, this.compact);
  }

  /**
   * The banners over a site, in its holder's arms. When the holder changes the old banners come
   * down the poles and the new ones go up; nothing flies over an unclaimed fort or an open seat.
   */
  private flagsFor(v: SiteView, world: World, roster: readonly RosterEntry[], owner: number, now: number, visible: boolean, near: boolean): void {
    if (Number.isNaN(v.holder)) v.holder = owner;
    if (owner !== v.holder) {
      v.swapFrom = v.holder !== NEUTRAL ? v.std : null;
      v.swapAt = this.reducedMotion ? -1e9 : now;
      v.holder = owner;
    }
    if (owner !== NEUTRAL) {
      const r = roster[owner];
      const arms = r?.heraldry;
      const hue = world.players[owner]?.hue ?? 0;
      const key = `${hue}|${r?.login ?? ''}|${arms?.pattern ?? ''}|${arms?.emblem ?? ''}|${arms?.trim ?? ''}`;
      if (key !== v.flagKey || !v.std) {
        v.flagKey = key;
        v.std = this.flags.standard(hue, r?.login ?? '?', arms);
      }
    } else {
      v.flagKey = '';
      v.std = null;
    }
    const t = (now - v.swapAt) / 1000;
    const lowering = v.swapFrom !== null && t >= 0 && t < LOWER_S;
    const raising = !lowering && t >= LOWER_S && t < LOWER_S + RAISE_S;
    if (!lowering && t >= LOWER_S) v.swapFrom = null;
    for (let i = 0; i < v.poles.length; i++) {
      const p = v.poles[i]!;
      const f = p.flag;
      const tex = lowering ? v.swapFrom : v.std;
      f.mesh.visible = !!tex;
      if (!tex) continue;
      f.texture = tex;
      // The old banner comes down its pole, sagging; the new one runs up, unfurling as it
      // climbs, each tower a beat after the last.
      const drop = lowering ? easeInOut(t / LOWER_S) : raising ? 1 - easeOut(clamp01((t - LOWER_S - i * 0.15) / (RAISE_S - 0.3))) : 0;
      f.mesh.position.set(p.x, p.y + drop * p.length);
      f.mesh.scale.set(p.scale * (1 - drop * 0.35), p.scale * (1 - drop * 0.5));
      if (visible && (near || lowering || raising)) f.update(now / 1000 + i * 0.7, lowering ? 2 : 6);
    }
  }

  /** "breach in ~12 min", "gates barred for 1h 20m", "sieges open in 3h": what the walls can expect. */
  private breachText(v: SiteView, world: World, st: Structure): string {
    if (!breachable(world, st)) {
      v.sampleTick = -1;
      const unbar = gatesUnbarAt(world, st);
      const opens = siegesOpenAt(world);
      if (unbar > opens) return `gates barred for ${span(unbar - world.tick)}`;
      return world.tick < opens ? `sieges open in ${span(opens - world.tick)}` : 'the walls hold';
    }
    if (v.sampleTick < 0 || world.tick < v.sampleTick) {
      v.sampleTick = world.tick;
      v.sampleHp = st.hp;
    } else if ((world.tick - v.sampleTick) * TICK_MS >= BREACH_SAMPLE_MS) {
      const rate = Math.max(0, (v.sampleHp - st.hp) / (world.tick - v.sampleTick));
      v.loss = v.loss > 0 ? v.loss * 0.6 + rate * 0.4 : rate;
      v.sampleTick = world.tick;
      v.sampleHp = st.hp;
    }
    if (v.loss <= 1e-6) return 'the walls hold';
    const ticks = st.hp / v.loss;
    const min = Math.max(1, Math.round((ticks * TICK_MS) / 60_000));
    return min > 180 ? 'the walls hold' : `breach in ~${min} min`;
  }

  /**
   * The walls' strength as a carved ring round the capital: the holder's pigment for what stands,
   * a pale wound draining behind fresh damage, and the lost arc cracked open in ink. Shown while
   * the walls are down or besieged.
   */
  private wallRing(v: SiteView, st: Structure, tint: number, zoom: number, now: number, dt: number, besieged: boolean): void {
    const frac = clamp01(st.maxHp > 0 ? st.hp / st.maxHp : 1);
    if (v.wound < frac) v.wound = frac;
    v.wound = Math.max(frac, v.wound - dt * 0.3);
    if (frac >= 0.999 && !besieged) return;
    const r = v.def.radius;
    const rx = r * 1.32;
    const ry = r * 0.8;
    const w = Math.max(5, 2.8 / zoom);
    const start = -Math.PI / 2;
    const arc = (g: Graphics, from: number, to: number) => {
      const steps = Math.max(2, Math.ceil(Math.abs(to - from) * 18));
      for (let i = 0; i <= steps; i++) {
        const a = start + from + ((to - from) * i) / steps;
        const x = Math.cos(a) * rx;
        const y = Math.sin(a) * ry;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    const full = Math.PI * 2;
    const g = v.siege;
    // The carved channel.
    arc(g, 0, full);
    g.stroke({ width: w + 3 / zoom, color: INK, alpha: 0.75 });
    arc(g, 0, full);
    g.stroke({ width: w, color: 0x3a2c1c, alpha: 0.85 });
    if (v.wound > frac) {
      arc(g, full * frac, full * v.wound);
      g.stroke({ width: w * 0.8, color: VELLUM, alpha: 0.85 });
    }
    if (frac > 0) {
      arc(g, 0, full * frac);
      g.stroke({ width: w * 0.8, color: tint, alpha: 1 });
    }
    // Cracks spreading from the broken end, wider as the walls weaken.
    const cracks = besieged ? 3 + Math.round((1 - frac) * 5) : 2;
    for (let i = 0; i < cracks; i++) {
      const a = start + full * frac + (i - cracks / 2) * 0.05;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      const len = (r * 0.18 + (1 - frac) * r * 0.25) * (0.6 + ((i * 37) % 10) / 20);
      const out = i % 2 === 0 ? 1 : -1;
      g.moveTo(x, y)
        .lineTo(x * (1 + (out * len) / rx / 2) + Math.sin(i * 7.1) * 3, y * (1 + (out * len) / ry / 2))
        .lineTo(x * (1 + (out * len) / rx), y * (1 + (out * len) / ry) + Math.cos(i * 3.3) * 3);
    }
    g.stroke({ width: Math.max(1.4, 1.2 / zoom), color: INK, alpha: 0.85 });
    // Gilded studs at the quarters, and a throb of vermilion while the siege lasts.
    for (let q = 0; q < 4; q++) {
      const a = start + (q * Math.PI) / 2;
      g.circle(Math.cos(a) * rx, Math.sin(a) * ry, w * 0.55).fill(GOLD).stroke({ width: 1 / zoom, color: INK });
    }
    if (besieged) {
      const throb = 0.25 + Math.sin(now / 220) * 0.15;
      arc(g, 0, full);
      g.stroke({ width: w * 2.6, color: VERMILION, alpha: throb * 0.35 });
    }
  }

  /**
   * A siege camp before besieged walls: an earthwork line in the besiegers' pigment on the side
   * they press from, stakes along it, and campfires burning behind it.
   */
  private siegeCamp(v: SiteView, world: World, tints: readonly number[], zoom: number, now: number, lights: number, visible: boolean, fx: SiteFx): void {
    const { def } = v;
    const holder = this.structureAt.get(def.id)?.p ?? NEUTRAL;
    // The besiegers: the strongest foe banner near the walls.
    let bx = 0;
    let by = 0;
    let n = 0;
    let who = NEUTRAL;
    let best = 0;
    const reach = def.radius + CAPITAL_TOWER.range + 120;
    const weight = new Map<number, number>();
    for (const pl of world.platoons) {
      if (pl.p === holder || pl.alive <= 0) continue;
      const dx = pl.x - def.x;
      const dy = pl.y - def.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const w = (weight.get(pl.p) ?? 0) + pl.alive;
      weight.set(pl.p, w);
      if (w > best) {
        best = w;
        who = pl.p;
      }
      bx += dx * pl.alive;
      by += dy * pl.alive;
      n += pl.alive;
    }
    if (n === 0) {
      // Foes at the walls but no banner in reach (the last of them just left): face along the road.
      const a = slotAngle(def.slot, world.map.slots) + Math.PI / 2;
      bx = Math.cos(a);
      by = Math.sin(a);
    }
    const dir = Math.atan2(by, bx);
    const tint = who !== NEUTRAL ? tints[who] ?? NEUTRAL_TINT : NEUTRAL_TINT;
    const g = v.siege;
    const R = def.radius * 2.05;
    const span = 0.85;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const a = dir - span + (span * 2 * i) / 24;
      const wob = Math.sin(i * 1.7 + def.id) * 3;
      pts.push([Math.cos(a) * (R + wob), Math.sin(a) * (R + wob) * 0.72]);
    }
    const line = (width: number, color: number, alpha: number) => {
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
    };
    // The earthwork: an ink-edged bank of ochre spoil, a palisade of stakes leaning toward the
    // walls, and the besiegers' pennants planted along it.
    line(Math.max(14, 7 / zoom), INK, 0.55);
    line(Math.max(10, 5 / zoom), 0x9a7a4a, 0.95);
    line(Math.max(3, 1.4 / zoom), 0x6e5634, 0.7);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      const len = Math.hypot(x, y) || 1;
      const ix = -x / len;
      const iy = -y / len;
      g.moveTo(x - ix * 3, y - iy * 3).lineTo(x + ix * 10 - iy * 1.5, y + iy * 10 + ix * 1.5 - 4);
    }
    g.stroke({ width: Math.max(2.2, 1.2 / zoom), color: 0x3a2818, alpha: 0.95, cap: 'round' });
    for (const i of [4, 12, 20]) {
      const [x, y] = pts[i]!;
      const flag = Math.max(10, 6 / zoom);
      g.moveTo(x, y + 2).lineTo(x, y - flag * 2.2).stroke({ width: Math.max(1.8, 1 / zoom), color: 0x3a2818 });
      g.poly([x, y - flag * 2.2, x + flag * 1.3, y - flag * 1.85, x, y - flag * 1.5]).fill(tint).stroke({ width: Math.max(1.2, 0.7 / zoom), color: INK });
    }
    // Campfires behind the line: a ring of hearth stones and a painted flame, lit brighter at night.
    for (let i = 0; i < v.fires.length; i++) {
      const f = v.fires[i]!;
      const a = dir - span * 0.8 + (span * 1.6 * (i + 0.5)) / v.fires.length;
      const x = def.x + Math.cos(a) * (R + 30);
      const y = def.y + Math.sin(a) * (R + 30) * 0.72;
      f.visible = true;
      f.position.set(x, y - 4);
      const flicker = 0.85 + Math.sin(now / 90 + i * 1.9) * 0.1 + Math.sin(now / 41 + i) * 0.05;
      f.scale.set(0.7 * flicker, 0.55 * flicker);
      f.alpha = (0.3 + lights * 0.6) * flicker;
      const lx = x - def.x;
      const ly = y - def.y;
      g.ellipse(lx, ly, 6, 3).fill({ color: 0x2a1c12, alpha: 0.9 });
      const h = 9 * flicker;
      g.poly([lx - 4, ly, lx - 1.5, ly - h, lx + 0.5, ly - h * 0.55, lx + 2.5, ly - h * 1.1, lx + 4, ly]).fill(EMBER).stroke({ width: 1, color: INK, alpha: 0.8 });
      g.poly([lx - 1.8, ly, lx, ly - h * 0.55, lx + 1.8, ly]).fill(0xffd88a);
      if (visible && Math.random() < 0.012) fx.smoke(x, y - 8, false);
    }
  }

  private captureRing(v: SiteView, owner: number, capturer: number, progress: number, tints: readonly number[], zoom: number, contested: number): void {
    const r = v.def.radius;
    const held = owner !== NEUTRAL;
    const ownerTint = held ? tints[owner]! : NEUTRAL_TINT;
    if (held) v.ring.ellipse(0, 0, r, r * 0.62).fill({ color: ownerTint, alpha: 0.12 });
    v.ring.ellipse(0, 0, r, r * 0.62).stroke({ width: 4, color: INK, alpha: held ? 0.55 : 0.25 });
    v.ring.ellipse(0, 0, r, r * 0.62).stroke({ width: 2.2, color: ownerTint, alpha: held ? 0.95 : 0.5 });
    if (capturer !== NEUTRAL && progress > 0) {
      const color = tints[capturer] ?? 0xffffff;
      const end = -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress);
      const steps = 48;
      const arc = () => {
        v.ring.moveTo(0, -r * 0.62 * 1.1);
        for (let i = 1; i <= steps; i++) {
          const a = -Math.PI / 2 + ((end + Math.PI / 2) * i) / steps;
          v.ring.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 0.62 * 1.1);
        }
      };
      // The contested fort throbs: a glow of the attackers' pigment under the arc.
      v.ring.ellipse(0, 0, r * 1.1, r * 0.68).stroke({ width: Math.max(14, 8 / zoom), color, alpha: 0.12 + contested * 0.18 });
      arc();
      v.ring.stroke({ width: Math.max(9, 4 / zoom), color: INK, alpha: 0.7 });
      arc();
      v.ring.stroke({ width: Math.max(6, 2.5 / zoom), color, alpha: 1 });
    }
  }

  /**
   * Each rising's standard, planted on the ring road just beyond bowshot of the lost home, in a
   * ring of smoke-blackened stones: it rises from the smoke when the home falls and stays while
   * the rising lasts.
   */
  private updateRisings(world: World, roster: readonly RosterEntry[], names: Names, now: number, zoom: number, near: boolean): void {
    for (const pl of world.players) {
      const view = this.risings.get(pl.p);
      if (!pl.rising || pl.slot < 0) {
        if (view) this.dropRising(view);
        continue;
      }
      const home = world.map.sites[pl.slot];
      if (!home) continue;
      const r = roster[pl.p];
      const key = `${pl.hue}|${r?.login ?? ''}|${r?.heraldry?.pattern ?? ''}|${r?.heraldry?.emblem ?? ''}`;
      let v = view;
      if (!v) {
        const a = slotAngle(home.slot, world.map.slots) + (home.radius + CAPITAL_TOWER.range * 0.75) / world.map.ring;
        const x = Math.cos(a) * (world.map.ring + 34);
        const y = Math.sin(a) * (world.map.ring + 34);
        const root = new Container();
        root.position.set(x, y);
        root.zIndex = y;
        const base = new Graphics();
        // A cairn of soot-black stones, and a crooked pole lashed upright in it.
        for (let i = 0; i < 7; i++) {
          const sa = (i / 7) * Math.PI * 2;
          base.ellipse(Math.cos(sa) * 9, Math.sin(sa) * 4 + 1, 4.2, 3).fill(i % 2 ? 0x4a4038 : 0x3a322c).stroke({ width: 1, color: INK });
        }
        base.moveTo(0, 2).lineTo(-2, -30).lineTo(1, -62).stroke({ width: 3, color: 0x3a2818 });
        base.moveTo(-7, -54).lineTo(9, -56).stroke({ width: 2, color: 0x3a2818 });
        base.circle(1, -63, 2.6).fill(0x8a8070).stroke({ width: 1, color: INK });
        root.addChild(base);
        const flag = new WavingFlag(this.flags.blank());
        flag.mesh.scale.set(46 / FLAG_W);
        flag.mesh.position.set(2, -61);
        root.addChild(flag.mesh);
        this.root.addChild(root);
        const label = this.labels.add(new MapLabel(15));
        label.priority = 4;
        label.x = x;
        label.y = y - 70;
        v = { p: pl.p, root, flag, key: '', at: this.reducedMotion || world.tick - pl.fallenAt > 60 ? -1e9 : now, x, y, label };
        this.risings.set(pl.p, v);
      }
      if (v.key !== key) {
        v.key = key;
        v.flag.texture = this.flags.standard(pl.hue, r?.login ?? '?', r?.heraldry);
      }
      const t = (now - v.at) / 1000;
      // It rises out of the smoke (Effects.rising, 2.4s after the walls fall) over two seconds.
      const k = easeOut(clamp01((t - 2.7) / 1.8));
      v.root.alpha = clamp01((t - 2.5) / 0.5);
      v.root.scale.set(1, 0.2 + k * 0.8);
      v.label.set(`${names.player(pl.p)} rises`, 'to retake their home');
      v.label.wanted = zoom > 0.55;
      if (near || t < 3) v.flag.update(now / 1000 + pl.p, 7);
    }
  }

  private dropRising(v: RisingView): void {
    v.flag.destroy();
    v.root.destroy({ children: true });
    this.labels.remove(v.label);
    this.risings.delete(v.p);
  }

  /** Where a rising's standard stands, for its set piece. */
  risingAt(p: number): { x: number; y: number } | null {
    const v = this.risings.get(p);
    return v ? { x: v.x, y: v.y } : null;
  }

  hit(x: number, y: number): number | null {
    for (const v of this.views) {
      const dx = x - v.def.x;
      const dy = (y - v.def.y) / 0.8;
      const r = v.def.radius * (v.def.kind === 'fort' ? 1.05 : 1.15);
      if (dx * dx + dy * dy <= r * r) return v.def.id;
      // Keeps rise above their footprint.
      const tall = v.def.kind === 'fort' ? 1.7 : 2.2;
      if (Math.abs(dx) < v.def.radius * 0.8 && y < v.def.y && y > v.def.y - v.def.radius * tall) return v.def.id;
    }
    return null;
  }

  /** Where each capital's lit windows are, for night ambience (fireflies gather, moths circle). */
  capitalOf(slot: number): SiteDef | undefined {
    return this.views.find((v) => v.def.kind === 'capital' && v.def.slot === slot)?.def;
  }

  /** Standards flying over the keeps, forts and risings, so the flag cache keeps them painted. */
  texturesInUse(out: Set<Texture>): void {
    for (const v of this.views) {
      for (const p of v.poles) out.add(p.flag.mesh.texture);
      if (v.swapFrom) out.add(v.swapFrom);
    }
    for (const r of this.risings.values()) out.add(r.flag.mesh.texture);
  }

  destroy(): void {
    for (const v of this.views) for (const p of v.poles) p.flag.destroy();
    for (const r of this.risings.values()) r.flag.destroy();
    this.risings.clear();
    // Site sprites share the painted site art, which outlives any one map.
    this.ground.destroy({ children: true });
    this.root.destroy({ children: true });
    this.lights.destroy({ children: true });
    this.labels.destroy();
  }
}

/** A stretch of war time, as "2h 10m" or "25 min". */
function span(ticks: number): string {
  const min = Math.max(1, Math.ceil((Math.max(0, ticks) * TICK_MS) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function easeOut(t: number): number {
  const k = clamp01(t);
  return 1 - (1 - k) * (1 - k) * (1 - k);
}

function easeInOut(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

