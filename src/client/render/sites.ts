import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { RosterEntry } from '../../protocol.ts';
import { NEUTRAL, type SiteDef, type World } from '../../sim/api.ts';
import { siteLabel, type Names } from '../../sim/chronicle.ts';
import { CAPTURE_TICKS, HEART_CAPTURE_TICKS } from '../../sim/stats.ts';
import { WavingFlag } from './banners.ts';
import type { FlagCache } from './flags.ts';
import type { Textures } from './textures.ts';

const NEUTRAL_TINT = 0xb9b2a2;
const LABEL_STYLE = {
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontWeight: '800' as const,
  fill: 0xffffff,
  stroke: { color: 0x0a0c0f, width: 5, join: 'round' as const },
  dropShadow: { color: 0x000000, alpha: 0.6, blur: 3, distance: 1, angle: Math.PI / 2 },
  letterSpacing: 0.3,
};

interface SiteView {
  def: SiteDef;
  root: Container;
  glow: Sprite;
  body: Sprite;
  mask: Sprite | null;
  overlay: Sprite | null;
  ring: Graphics;
  bar: Graphics;
  label: Text;
  sub: Text;
  flag: WavingFlag | null;
  flagKey: string;
  lastHp: number;
  shake: number;
}

export interface SiteFx {
  smoke(x: number, y: number): void;
}

/** Capitals, shrines and the Heart with its Monolith. */
export class SiteLayer {
  readonly ground = new Container();
  readonly root = new Container();
  readonly labels = new Container();
  private views: SiteView[] = [];
  private monolithFallAt = -1;
  private nextSmoke = 0;

  constructor(
    private tex: Textures,
    private flags: FlagCache,
    private world: World,
  ) {
    this.root.sortableChildren = true;
    for (const def of world.map.sites) this.views.push(this.create(def));
    if (world.monolithFallen) this.monolithFallAt = -1e9;
  }

  monolithFell(now: number): void {
    this.monolithFallAt = now;
  }

  structureHit(site: number): void {
    const v = this.views[site];
    if (v) v.shake = 1;
  }

  private create(def: SiteDef): SiteView {
    const root = new Container();
    root.position.set(def.x, def.y);
    root.zIndex = def.y;
    const glow = new Sprite(this.tex.soft);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.alpha = 0.35;
    const ring = new Graphics();
    ring.position.set(def.x, def.y);
    this.ground.addChild(ring);
    let body: Sprite;
    let mask: Sprite | null = null;
    let overlay: Sprite | null = null;
    let flag: WavingFlag | null = null;
    if (def.kind === 'capital') {
      body = new Sprite(this.tex.keep.body);
      mask = new Sprite(this.tex.keep.mask);
      body.anchor.set(0.5, 0.82);
      mask.anchor.set(0.5, 0.82);
      body.scale.set((def.radius * 2.1) / 256);
      mask.scale.set((def.radius * 2.1) / 256);
      flag = new WavingFlag(this.flags.blank());
      flag.mesh.scale.set(0.42);
      flag.mesh.position.set(2, -def.radius * 1.88);
      glow.scale.set((def.radius * 3.4) / 64, (def.radius * 2) / 64);
    } else if (def.kind === 'shrine') {
      body = new Sprite(this.tex.shrine.body);
      mask = new Sprite(this.tex.shrine.mask);
      body.anchor.set(0.5, 0.72);
      mask.anchor.set(0.5, 0.72);
      body.scale.set((def.radius * 1.9) / 160);
      mask.scale.set((def.radius * 1.9) / 160);
      glow.scale.set((def.radius * 3) / 64, (def.radius * 1.8) / 64);
    } else {
      body = new Sprite(this.tex.monolith);
      body.anchor.set(0.5, 0.93);
      body.scale.set((def.radius * 1.5) / 192);
      overlay = new Sprite(this.tex.cracks);
      overlay.anchor.set(0.5, 0.93);
      overlay.scale.set((def.radius * 1.5) / 192);
      overlay.blendMode = 'add';
      mask = new Sprite(this.tex.altar.mask);
      mask.anchor.set(0.5, 0.6);
      mask.scale.set((def.radius * 2) / 200);
      glow.scale.set((def.radius * 3.4) / 64, (def.radius * 2) / 64);
    }
    root.addChild(glow, body);
    if (mask) root.addChild(mask);
    if (overlay) root.addChild(overlay);
    if (flag) {
      const pole = new Sprite(Texture.WHITE);
      pole.tint = 0x2a2016;
      pole.width = 3;
      pole.height = def.radius * 0.95;
      pole.position.set(-1.5, -def.radius * 1.9);
      root.addChild(pole, flag.mesh);
    }
    const bar = new Graphics();
    root.addChild(bar);
    this.root.addChild(root);
    const label = new Text({ text: '', style: { ...LABEL_STYLE, fontSize: def.kind === 'capital' ? 17 : 14 }, resolution: 2 });
    label.anchor.set(0.5, 1);
    const sub = new Text({ text: '', style: { ...LABEL_STYLE, fontSize: 12, fontWeight: '700', fill: 0xe8dcc0 }, resolution: 2 });
    sub.anchor.set(0.5, 0);
    this.labels.addChild(label, sub);
    return { def, root, glow, body, mask, overlay, ring, bar, label, sub, flag, flagKey: '', lastHp: -1, shake: 0 };
  }

  update(world: World, roster: readonly RosterEntry[], names: Names, tints: readonly number[], now: number, dt: number, zoom: number, selectedSite: number | null, fx: SiteFx): void {
    this.world = world;
    const tick = world.tick;
    const ownerOfSlot = new Map<number, number>();
    for (const p of world.players) ownerOfSlot.set(p.slot, p.p);
    const smokeDue = now >= this.nextSmoke;
    if (smokeDue) this.nextSmoke = now + 180;
    const labelScale = 1 / zoom;
    for (const v of this.views) {
      const { def } = v;
      const state = world.sites[def.id]!;
      v.shake = Math.max(0, v.shake - dt * 5);
      const jitter = v.shake > 0 ? (Math.random() - 0.5) * v.shake * 2.5 : 0;
      v.root.position.set(def.x + jitter, def.y);
      v.ring.clear();
      v.bar.clear();
      let title = '';
      let subtitle = '';
      if (def.kind === 'capital') {
        const owner = ownerOfSlot.get(def.slot) ?? NEUTRAL;
        const st = world.structures.find((s) => s.site === def.id);
        const ruined = !st || st.ruinedUntil >= 0;
        v.body.texture = ruined ? this.tex.ruins : this.tex.keep.body;
        v.mask!.visible = !ruined && owner !== NEUTRAL;
        v.body.alpha = owner === NEUTRAL ? 0.45 : 1;
        const tint = owner !== NEUTRAL ? tints[owner]! : NEUTRAL_TINT;
        v.mask!.tint = tint;
        v.glow.tint = tint;
        v.glow.alpha = owner !== NEUTRAL ? 0.28 : 0;
        if (v.flag) {
          v.flag.mesh.visible = owner !== NEUTRAL && !ruined;
          if (owner !== NEUTRAL) {
            const r = roster[owner];
            const key = `${world.players[owner]!.hue}|${r?.login ?? ''}`;
            if (key !== v.flagKey) {
              v.flag.texture = this.flags.standard(world.players[owner]!.hue, r?.login ?? '?');
              v.flagKey = key;
            }
            v.flag.update(now / 1000, 5);
          }
        }
        if (owner === NEUTRAL) {
          title = 'Open slot';
        } else {
          title = names.player(owner);
          if (st && st.ruinedUntil >= 0) {
            const secs = Math.max(0, Math.ceil(((st.ruinedUntil - tick) * 200) / 1000));
            subtitle = `SACKED · rebuilds in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
            if (smokeDue) fx.smoke(def.x + (Math.random() - 0.5) * def.radius, def.y - def.radius * 0.6);
          }
          if (st && st.ruinedUntil < 0 && st.hp < st.maxHp) this.hpBar(v, st.hp / st.maxHp, def.radius * 1.4, -def.radius * 2.05, tint);
        }
      } else if (def.kind === 'shrine') {
        const tint = state.owner !== NEUTRAL ? tints[state.owner]! : NEUTRAL_TINT;
        v.mask!.tint = tint;
        v.glow.tint = tint;
        v.glow.alpha = state.owner !== NEUTRAL ? 0.4 + Math.sin(now / 600 + def.id) * 0.08 : 0.1;
        title = siteLabel(world, def.id, names).replace(/^the /, '');
        subtitle = state.owner !== NEUTRAL ? `held by ${names.player(state.owner)} · +${def.renown}/min` : `unclaimed · +${def.renown}/min`;
        this.captureRing(v, state.owner, state.capturer, state.progress / CAPTURE_TICKS, tints);
      } else {
        const st = world.structures.find((s) => s.site === def.id);
        const fallen = world.monolithFallen;
        const fallT = this.monolithFallAt < 0 ? 0 : Math.min(1, (now - this.monolithFallAt) / 1600);
        if (!fallen || fallT < 1) {
          v.body.texture = this.tex.monolith;
          v.body.visible = true;
          v.body.alpha = 1 - fallT;
          v.body.rotation = fallT * fallT * 0.5;
          v.body.y = fallT * fallT * def.radius * 0.6;
          v.overlay!.visible = true;
          const dmg = st ? 1 - st.hp / st.maxHp : 1;
          v.overlay!.alpha = Math.min(1, dmg * 1.4) * (0.75 + Math.sin(now / 200) * 0.25) * (1 - fallT);
          v.overlay!.rotation = v.body.rotation;
          v.overlay!.y = v.body.y;
          v.mask!.visible = false;
          v.glow.tint = 0x66c8ff;
          v.glow.alpha = 0.25 + dmg * 0.25;
          title = 'The Legacy Monolith';
          subtitle = 'everyone vs. the past';
          if (st && !fallen) this.hpBar(v, st.hp / st.maxHp, def.radius * 1.6, -def.radius * 2.12, 0x66c8ff);
        } else {
          v.body.texture = this.tex.altar.body;
          v.body.anchor.set(0.5, 0.6);
          v.body.scale.set((def.radius * 2) / 200);
          v.body.rotation = 0;
          v.body.y = 0;
          v.body.alpha = 1;
          v.overlay!.visible = false;
          v.mask!.visible = true;
          const tint = state.owner !== NEUTRAL ? tints[state.owner]! : 0xf4e6b8;
          v.mask!.tint = tint;
          v.glow.tint = tint;
          v.glow.alpha = 0.45 + Math.sin(now / 500) * 0.1;
          title = 'The Heart';
          subtitle = state.owner !== NEUTRAL ? `held by ${names.player(state.owner)} · +${def.renown}/min` : `unclaimed · +${def.renown}/min`;
          this.captureRing(v, state.owner, state.capturer, state.progress / HEART_CAPTURE_TICKS, tints);
        }
      }
      if (selectedSite === def.id) {
        const pulse = 1 + Math.sin(now / 250) * 0.04;
        v.ring.ellipse(0, 0, def.radius * 1.25 * pulse, def.radius * 0.8 * pulse).stroke({ width: 3 / zoom, color: 0xffffff, alpha: 0.9 });
      }
      const top = def.kind === 'capital' ? def.radius * 2.15 : def.kind === 'shrine' ? def.radius * 1.35 : world.monolithFallen ? def.radius * 1.3 : def.radius * 2.25;
      v.label.text = title;
      v.sub.text = subtitle;
      v.label.scale.set(labelScale);
      v.sub.scale.set(labelScale);
      v.label.position.set(def.x, def.y - top - 16 / zoom);
      v.sub.position.set(def.x, def.y - top - 14 / zoom);
      const showSub = def.kind === 'capital' || zoom > 0.75;
      v.sub.visible = showSub && subtitle !== '';
      v.label.visible = zoom > 0.16 || def.kind !== 'shrine';
      v.label.alpha = def.kind === 'capital' && title === 'Open slot' ? 0.55 : 1;
    }
    this.declutter();
  }

  // Capitals outrank the Heart, which outranks shrines: a label whose screen box
  // overlaps a higher-priority one drops its subtitle first, then hides.
  private declutter(): void {
    const rank = (v: SiteView) => (v.def.kind === 'capital' ? 0 : v.def.kind === 'heart' ? 1 : 2);
    const order = this.views.slice().sort((a, b) => rank(a) - rank(b) || a.def.id - b.def.id);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const hits = (b: { x: number; y: number; width: number; height: number }) =>
      placed.some((p) => b.x < p.x1 && b.x + b.width > p.x0 && b.y < p.y1 && b.y + b.height > p.y0);
    const take = (b: { x: number; y: number; width: number; height: number }) => placed.push({ x0: b.x - 2, y0: b.y - 1, x1: b.x + b.width + 2, y1: b.y + b.height + 1 });
    for (const v of order) {
      if (!v.label.visible) continue;
      const lb = v.label.getBounds();
      if (hits(lb)) {
        v.label.visible = false;
        v.sub.visible = false;
        continue;
      }
      take(lb);
      if (!v.sub.visible) continue;
      const sb = v.sub.getBounds();
      if (hits(sb)) v.sub.visible = false;
      else take(sb);
    }
  }

  private hpBar(v: SiteView, frac: number, width: number, y: number, tint: number): void {
    const h = width * 0.06;
    v.bar.rect(-width / 2 - 1.5, y - 1.5, width + 3, h + 3).fill({ color: 0x0a0c0f, alpha: 0.85 });
    v.bar.rect(-width / 2, y, width * Math.max(0, Math.min(1, frac)), h).fill({ color: tint });
    v.bar.rect(-width / 2, y, width * Math.max(0, Math.min(1, frac)), h * 0.35).fill({ color: 0xffffff, alpha: 0.25 });
  }

  private captureRing(v: SiteView, owner: number, capturer: number, progress: number, tints: readonly number[]): void {
    const r = v.def.radius;
    const ownerTint = owner !== NEUTRAL ? tints[owner]! : NEUTRAL_TINT;
    v.ring.ellipse(0, 0, r, r * 0.62).stroke({ width: 3, color: ownerTint, alpha: owner !== NEUTRAL ? 0.85 : 0.35 });
    if (capturer !== NEUTRAL && progress > 0) {
      const color = tints[capturer] ?? 0xffffff;
      const end = -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress);
      const steps = 48;
      v.ring.moveTo(0, -r * 0.62);
      for (let i = 1; i <= steps; i++) {
        const a = -Math.PI / 2 + ((end + Math.PI / 2) * i) / steps;
        v.ring.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 0.62 * 1.08);
      }
      v.ring.stroke({ width: 7, color, alpha: 0.95 });
    }
  }

  hit(x: number, y: number): number | null {
    for (const v of this.views) {
      const dx = x - v.def.x;
      const dy = (y - v.def.y) / 0.8;
      const r = v.def.radius * (v.def.kind === 'shrine' ? 1 : 1.15);
      if (dx * dx + dy * dy <= r * r) return v.def.id;
      // The keep and the Monolith rise above their footprint.
      if (v.def.kind !== 'shrine' && Math.abs(dx) < v.def.radius * 0.8 && y < v.def.y && y > v.def.y - v.def.radius * 2) return v.def.id;
    }
    return null;
  }
}
