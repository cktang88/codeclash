import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Monument, RosterEntry } from '../../protocol.ts';
import { NEUTRAL, type SiteDef, type World } from '../../sim/api.ts';
import { siteLabel, type Names } from '../../sim/chronicle.ts';
import { CAPTURE_TICKS } from '../../sim/stats.ts';
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

/** Keep styles a player may choose in the Armory: the stone is tinted to suit. */
const KEEP_TINT: Record<string, number> = { stone: 0xffffff, timber: 0xe6caa0, citadel: 0xf4f1ff };

interface SiteView {
  def: SiteDef;
  root: Container;
  art: Container;
  body: Sprite;
  pigment: Sprite | null;
  cracks: Sprite[];
  doors: [Sprite, Sprite] | null;
  ring: Graphics;
  bar: Graphics;
  label: MapLabel;
  flags: WavingFlag[];
  flagKey: string;
  /** Emissive layers, in the light pass. */
  halo: Sprite;
  emissive: Sprite | null;
  scale: number;
  lastHp: number;
  wound: number;
  shake: number;
  gateAt: number;
  nextSmoke: number;
}

export interface SiteFx {
  smoke(x: number, y: number, heavy: boolean): void;
}

interface MonumentView {
  sprite: Sprite;
  label: MapLabel;
  key: string;
}

/** Capitals, shrines and the Heart with its Monolith, plus the statues that stand among them. */
export class SiteLayer {
  readonly ground = new Container();
  readonly root = new Container();
  /** Additive emissive layer: windows, runes, molten cracks, halos. Drawn above the day–night grade. */
  readonly lights = new Container();
  readonly labels = new LabelLayer();
  /** Phone-sized screen: labels letter a size smaller (never below the 15px floor). */
  compact = false;
  /** Under reduced motion struck walls do not shudder. */
  reducedMotion = false;
  private readonly art: SiteArt = siteArt();
  private readonly ownerOfSlot = new Map<number, number>();
  private views: SiteView[] = [];
  private monuments: MonumentView[] = [];
  private monolithFallAt = -1;

  constructor(
    private tex: Textures,
    private flags: FlagCache,
    private world: World,
  ) {
    this.root.sortableChildren = true;
    for (const def of world.map.sites) this.views.push(this.create(def));
  }

  monolithFell(now: number): void {
    this.monolithFallAt = now;
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

  /** Statues of named legends beside their players' capitals, and the Season Victor's obelisk at the Heart. */
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
        // TODO client: the Season Victor's obelisk belongs on the shore of the ring's centre.
        const centre = world.map.centre;
        x = 0;
        y = -centre;
        tex = this.art.obelisk;
        size = 120;
      } else {
        const player = world.players[m.p];
        const site = player ? world.map.sites[player.slot] : undefined;
        if (!site) continue;
        const n = perCapital.get(m.p) ?? 0;
        perCapital.set(m.p, n + 1);
        // Stand on the inward side of the keep, in a row along the road.
        const len = Math.hypot(site.x, site.y) || 1;
        const ix = -site.x / len;
        const iy = -site.y / len;
        const side = n % 2 === 0 ? 1 : -1;
        const step = Math.floor(n / 2) + 1;
        x = site.x + ix * site.radius * 1.35 - iy * side * step * site.radius * 0.5;
        y = site.y + iy * site.radius * 1.35 + ix * side * step * site.radius * 0.5;
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

  private create(def: SiteDef): SiteView {
    const root = new Container();
    root.position.set(def.x, def.y);
    root.zIndex = def.y;
    const art = new Container();
    root.addChild(art);
    const ring = new Graphics();
    ring.position.set(def.x, def.y);
    this.ground.addChild(ring);
    const halo = new Sprite(this.tex.soft);
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    halo.position.set(def.x, def.y - def.radius * 0.6);
    this.lights.addChild(halo);
    let body: Sprite;
    let pigment: Sprite | null = null;
    let emissive: Sprite | null = null;
    let doors: [Sprite, Sprite] | null = null;
    const cracks: Sprite[] = [];
    const flags: WavingFlag[] = [];
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
      art.addChild(body, pigment);
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
      for (const pole of c.poles) {
        const g = new Graphics();
        const top = pole.y - c.feet.y - 34 * pole.size;
        g.moveTo(pole.x - c.feet.x, pole.y - c.feet.y + 2).lineTo(pole.x - c.feet.x, top).stroke({ width: 2.2, color: 0x4a3420 });
        g.circle(pole.x - c.feet.x, top - 1, 2.6).fill(GOLD).stroke({ width: 1, color: INK });
        art.addChild(g);
        const flag = new WavingFlag(this.flags.blank());
        const fw = 40 * pole.size;
        flag.mesh.scale.set(fw / FLAG_W);
        flag.mesh.position.set(pole.x - c.feet.x + 1, top + 1);
        art.addChild(flag.mesh);
        flags.push(flag);
      }
      emissive = place(new Sprite(c.windows), c.feet, c.w, c.h);
      halo.scale.set((def.radius * 4) / 64, (def.radius * 2.6) / 64);
      halo.tint = 0xffb060;
    } else if (def.kind === 'fort') {
      // TODO client: border fort art; the shrine stands in for now.
      const s = this.art.shrine;
      scale = (def.radius * 2.1) / 168;
      body = place(new Sprite(s.body), s.feet, s.w, s.h);
      pigment = place(new Sprite(s.runes), s.feet, s.w, s.h);
      art.addChild(body, pigment);
      emissive = place(new Sprite(s.runes), s.feet, s.w, s.h);
      halo.scale.set((def.radius * 3.4) / 64, (def.radius * 2.2) / 64);
    } else {
      const m = this.art.monolith;
      scale = (def.radius * 1.55) / 150;
      body = place(new Sprite(m.body), m.feet, m.w, m.h);
      art.addChild(body);
      for (const t of m.cracks) {
        const cr = place(new Sprite(t), m.feet, m.w, m.h);
        cr.blendMode = 'add';
        cr.alpha = 0;
        art.addChild(cr);
        cracks.push(cr);
      }
      emissive = place(new Sprite(m.cracks[2]), m.feet, m.w, m.h);
      halo.scale.set((def.radius * 4) / 64, (def.radius * 3) / 64);
      halo.tint = EMBER;
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
    return { def, root, art, body, pigment, cracks, doors, ring, bar, label, flags, flagKey: '', halo, emissive, scale, lastHp: -1, wound: 1, shake: 0, gateAt: -1e9, nextSmoke: 0 };
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
    const tick = world.tick;
    const lights = light.lights;
    const ownerOfSlot = this.ownerOfSlot;
    ownerOfSlot.clear();
    // A capital's holder, which a capture changes, not its founder.
    for (const st of world.structures) ownerOfSlot.set(world.map.sites[st.site]!.slot, st.p);
    for (const v of this.views) {
      const { def } = v;
      const state = world.sites[def.id]!;
      v.shake = Math.max(0, v.shake - dt * 5);
      const jitter = v.shake > 0 && !this.reducedMotion ? (Math.random() - 0.5) * v.shake * 2.5 : 0;
      v.root.position.set(def.x + jitter, def.y);
      v.ring.clear();
      v.bar.clear();
      const visible = light.inView(def.x, def.y - def.radius);
      let title = '';
      let subtitle = '';
      let rubric = false;
      if (def.kind === 'capital') {
        const owner = ownerOfSlot.get(def.slot) ?? NEUTRAL;
        const st = world.structures.find((s) => s.site === def.id);
        const ruined = !st;
        const c = this.art.castle;
        v.body.texture = ruined ? c.ruins : c.body;
        const heraldry = owner !== NEUTRAL ? roster[owner]?.heraldry : undefined;
        v.body.tint = KEEP_TINT[heraldry?.keep ?? 'stone'] ?? 0xffffff;
        v.body.alpha = owner === NEUTRAL ? 0.55 : 1;
        const tint = owner !== NEUTRAL ? tints[owner]! : NEUTRAL_TINT;
        v.pigment!.visible = !ruined;
        v.pigment!.tint = tint;
        v.pigment!.alpha = owner === NEUTRAL ? 0.55 : 1;
        // Windows glow from dusk; a sacked keep smoulders instead.
        v.emissive!.visible = !ruined && owner !== NEUTRAL && lights > 0.02;
        v.emissive!.alpha = lights * (0.85 + Math.sin(now / 900 + def.id * 1.7) * 0.08 + Math.sin(now / 137 + def.id) * 0.04);
        v.halo.tint = ruined ? EMBER : 0xffb060;
        v.halo.alpha = ruined && owner !== NEUTRAL ? 0.25 + lights * 0.35 + Math.sin(now / 160) * 0.05 : owner !== NEUTRAL ? lights * 0.32 : 0;
        // The gates: swing open over 0.6s, hold while the column passes, close over a second.
        const g = (now - v.gateAt) / 1000;
        const open = ruined ? 0 : g < 0.6 ? easeOut(g / 0.6) : g < 3.4 ? 1 : g < 4.4 ? 1 - easeInOut((g - 3.4) / 1) : 0;
        if (v.doors) {
          const half = c.gate.w / 2;
          v.doors[0].width = half * (1 - open * 0.82);
          v.doors[1].width = -half * (1 - open * 0.82);
          v.doors[0].visible = v.doors[1].visible = !ruined;
        }
        for (let i = 0; i < v.flags.length; i++) {
          const f = v.flags[i]!;
          f.mesh.visible = owner !== NEUTRAL && !ruined;
          if (!f.mesh.visible || !visible) continue;
          if (i === 0) {
            const r = roster[owner];
            const arms = r?.heraldry;
            const key = `${world.players[owner]!.hue}|${r?.login ?? ''}|${arms?.pattern ?? ''}|${arms?.emblem ?? ''}|${arms?.trim ?? ''}`;
            if (key !== v.flagKey) {
              const std = this.flags.standard(world.players[owner]!.hue, r?.login ?? '?', arms);
              for (const ff of v.flags) ff.texture = std;
              v.flagKey = key;
            }
          }
          if (light.near) f.update(now / 1000 + i * 0.7, 6);
        }
        if (owner === NEUTRAL) {
          title = 'Open slot';
        } else {
          title = names.player(owner);
          rubric = owner === light.leader;
          const r = roster[owner];
          if (r?.heraldry?.title) subtitle = r.heraldry.title;
          if (st && st.siegeSince >= 0) subtitle = 'besieged';
          if (visible && now >= v.nextSmoke) {
            if (ruined) {
              v.nextSmoke = now + 260;
              fx.smoke(def.x + (Math.random() - 0.5) * def.radius * 1.4, def.y - def.radius * 0.3, true);
            } else if (light.near) {
              v.nextSmoke = now + 900 + Math.random() * 500;
              const ch = c.chimneys[0]!;
              fx.smoke(def.x + (ch.x - c.feet.x) * v.scale, def.y + (ch.y - c.feet.y) * v.scale, false);
            }
          }
          if (st && st.hp < st.maxHp) this.hpBar(v, st.hp / st.maxHp, def.radius * 1.5, -def.radius * 2.3, tint, dt);
          else v.wound = 1;
        }
      } else if (def.kind === 'fort') {
        const held = state.owner !== NEUTRAL;
        const tint = held ? tints[state.owner]! : NEUTRAL_TINT;
        const pulse = 0.5 + Math.sin(now / 700 + def.id) * 0.5;
        v.pigment!.tint = held ? mixColor(tint, 0xffffff, 0.15) : 0x8a8270;
        v.pigment!.alpha = held ? 1 : 0.6;
        const glowTint = held ? mixColor(tint, 0xffffff, 0.35) : 0;
        v.emissive!.tint = glowTint;
        v.emissive!.visible = held;
        v.emissive!.alpha = (0.35 + lights * 0.65) * (0.75 + pulse * 0.25);
        v.halo.tint = tint;
        v.halo.alpha = held ? (0.08 + lights * 0.4) * (0.8 + pulse * 0.2) : 0;
        title = siteLabel(world, def.id, names).replace(/^the /, '');
        subtitle = held ? `held by ${names.player(state.owner)} · +${def.renown}/min` : `unclaimed · +${def.renown}/min`;
        this.captureRing(v, state.owner, state.capturer, state.progress / CAPTURE_TICKS, tints, zoom);
      }
      if (selectedSite === def.id) {
        const pulse = 1 + Math.sin(now / 250) * 0.04;
        v.ring.ellipse(0, 0, def.radius * 1.3 * pulse, def.radius * 0.82 * pulse).stroke({ width: 4 / zoom, color: INK, alpha: 0.6 });
        v.ring.ellipse(0, 0, def.radius * 1.3 * pulse, def.radius * 0.82 * pulse).stroke({ width: 2 / zoom, color: GOLD, alpha: 0.95 });
      }
      const top = def.kind === 'capital' ? def.radius * 2.3 : def.radius * 1.45;
      v.label.set(title, subtitle, rubric);
      v.label.x = def.x;
      v.label.y = def.y - top;
      // An empty slot's ruin is scenery, not news: it yields to everything and only names itself up close.
      const openSlot = def.kind === 'capital' && title === 'Open slot';
      v.label.priority = openSlot ? 2 : def.kind === 'capital' ? 10 : 5;
      v.label.wanted = openSlot ? zoom > 0.7 : def.kind !== 'fort' || zoom > 0.16;
    }
    for (const m of this.monuments) m.label.wanted = zoom > 1.1;
    this.labels.layout(zoom, (l) => l.priority >= 10 || zoom > 0.75, this.compact);
  }

  /** A carved channel with a pigment fill, gilded end caps and a pale wound that drains behind damage. */
  private hpBar(v: SiteView, frac: number, width: number, y: number, tint: number, dt: number): void {
    const f = clamp01(frac);
    if (v.wound < f) v.wound = f;
    v.wound = Math.max(f, v.wound - dt * 0.35);
    const h = Math.max(5, width * 0.07);
    const x = -width / 2;
    v.bar.roundRect(x - 2, y - 2, width + 4, h + 4, 2).fill({ color: INK, alpha: 0.9 });
    v.bar.rect(x, y, width, h).fill({ color: 0x3a2c1c });
    v.bar.rect(x, y, width * v.wound, h).fill({ color: VELLUM, alpha: 0.85 });
    v.bar.rect(x, y, width * f, h).fill({ color: tint });
    v.bar.rect(x, y, width * f, h * 0.35).fill({ color: 0xffffff, alpha: 0.22 });
    for (const cx of [x - 2, x + width + 2]) v.bar.circle(cx, y + h / 2, h * 0.75).fill(GOLD).stroke({ width: 1, color: INK });
  }

  private captureRing(v: SiteView, owner: number, capturer: number, progress: number, tints: readonly number[], zoom: number): void {
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
      arc();
      v.ring.stroke({ width: Math.max(9, 4 / zoom), color: INK, alpha: 0.7 });
      arc();
      v.ring.stroke({ width: Math.max(6, 2.5 / zoom), color, alpha: 1 });
    }
  }

  hit(x: number, y: number): number | null {
    for (const v of this.views) {
      const dx = x - v.def.x;
      const dy = (y - v.def.y) / 0.8;
      const r = v.def.radius * (v.def.kind === 'fort' ? 1 : 1.15);
      if (dx * dx + dy * dy <= r * r) return v.def.id;
      // The keep and the Monolith rise above their footprint.
      if (v.def.kind !== 'fort' && Math.abs(dx) < v.def.radius * 0.9 && y < v.def.y && y > v.def.y - v.def.radius * 2.2) return v.def.id;
    }
    return null;
  }

  /** Where each capital's lit windows are, for night ambience (fireflies gather, moths circle). */
  capitalOf(slot: number): SiteDef | undefined {
    return this.views.find((v) => v.def.kind === 'capital' && v.def.slot === slot)?.def;
  }

  /** Standards flying over the keeps, so the flag cache keeps them painted. */
  texturesInUse(out: Set<Texture>): void {
    for (const v of this.views) for (const f of v.flags) out.add(f.mesh.texture);
  }

  destroy(): void {
    for (const v of this.views) for (const f of v.flags) f.destroy();
    // Site sprites share the painted site art, which outlives any one map.
    this.ground.destroy({ children: true });
    this.root.destroy({ children: true });
    this.lights.destroy({ children: true });
    this.labels.destroy();
  }
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
