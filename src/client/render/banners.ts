import { FAR_ZOOM } from './lod.ts';
import { Container, MeshPlane, Sprite, Text, Texture } from 'pixi.js';
import { PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import type { RepoRef } from '../../sim/replay.ts';
import { FLAG_H, FLAG_W, type FlagCache } from './flags.ts';

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
  barBg: Sprite;
  strength: Sprite;
  morale: Sprite;
  count: Text;
  star: Text;
  seen: number;
  key: string;
  routFlash: number;
  x: number;
  y: number;
}

const BAR_W = FLAG_W;
const BAR_H = 9;

export interface BannerHit {
  platoon: number;
  x: number;
  y: number;
  r: number;
}

/** One banner per platoon, carried over its formation; doubles as the far-zoom token. */
export class BannerLayer {
  readonly root = new Container();
  private views = new Map<number, BannerView>();
  private frameNo = 0;
  hits: BannerHit[] = [];

  constructor(private flags: FlagCache) {
    this.root.sortableChildren = true;
  }

  rout(platoon: number, now: number): void {
    const v = this.views.get(platoon);
    if (v) v.routFlash = now;
  }

  update(world: World, repos: readonly RepoRef[], hues: readonly number[], now: number, zoom: number, centroid: Map<number, { x: number; y: number; n: number }>, bounds: { contains(x: number, y: number): boolean }, selected: number | null): void {
    this.frameNo++;
    this.hits = [];
    const far = zoom < FAR_ZOOM;
    const flagPx = far ? 30 : Math.max(26, Math.min(46, 34 * Math.pow(zoom, 0.35)));
    const scale = flagPx / FLAG_W / zoom;
    for (const pl of world.platoons) {
      if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
      const c = centroid.get(pl.id);
      // Carry the banner at the front of the block, over the soldiers.
      const tx = c ? c.x * 0.6 + pl.x * 0.4 : pl.x;
      const ty = c ? c.y * 0.6 + pl.y * 0.4 : pl.y;
      let v = this.views.get(pl.id);
      if (!v) {
        v = this.create();
        v.x = tx;
        v.y = ty;
        this.views.set(pl.id, v);
      }
      v.seen = this.frameNo;
      v.x += (tx - v.x) * 0.2;
      v.y += (ty - v.y) * 0.2;
      if (!bounds.contains(v.x, v.y)) {
        v.root.visible = false;
        continue;
      }
      v.root.visible = true;
      const hue = hues[pl.p] ?? 0;
      const repo = repos[pl.repo] ?? ['unknown/repo', null];
      const key = `${hue}|${repo[0]}|${pl.ordinal}`;
      if (key !== v.key) {
        v.flag.texture = this.flags.battalion(hue, repo[0], repo[1], pl.ordinal);
        v.key = key;
      }
      const lift = 16 / zoom;
      v.root.position.set(v.x, v.y - lift);
      v.root.scale.set(scale);
      v.root.zIndex = v.y + (pl.id === selected ? 1e6 : 0);
      const routing = pl.state === PlatoonState.Rout;
      const engaged = pl.state === PlatoonState.Engage;
      v.root.rotation = routing ? -0.35 + Math.sin(now / 120) * 0.08 : 0;
      v.flag.update(now / 1000, routing ? 3 : engaged ? 7 : 4.5);
      const flash = now - v.routFlash < 900 ? 1 - (now - v.routFlash) / 900 : 0;
      v.flag.mesh.tint = flash > 0 && Math.floor(now / 90) % 2 === 0 ? 0xffffff : routing ? 0xb8b8b8 : 0xffffff;
      v.flag.mesh.alpha = 1;
      v.strength.width = BAR_W * Math.max(0, Math.min(1, pl.alive / Math.max(1, pl.size)));
      v.morale.width = BAR_W * Math.max(0, Math.min(1, pl.morale / 100));
      v.morale.tint = pl.morale < 30 ? 0xe0603a : pl.morale < 60 ? 0xe8c25a : 0x7fc6ff;
      v.strength.tint = 0x8be38b;
      v.count.visible = far || pl.id === selected;
      v.count.text = String(pl.alive);
      v.star.visible = pl.champion;
      this.hits.push({ platoon: pl.id, x: v.x, y: v.y - lift - (FLAG_H * 0.9 * scale), r: Math.max(FLAG_W * 0.6 * scale, 10 / zoom) });
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frameNo) continue;
      v.root.destroy({ children: true });
      this.views.delete(id);
    }
  }

  private create(): BannerView {
    const root = new Container();
    const pole = new Sprite(Texture.WHITE);
    pole.tint = 0x2a2016;
    pole.width = 5;
    pole.height = FLAG_H * 1.9;
    pole.position.set(-2.5, -FLAG_H * 1.9);
    const finial = new Sprite(Texture.WHITE);
    finial.tint = 0xe8c25a;
    finial.width = 10;
    finial.height = 10;
    finial.position.set(-5, -FLAG_H * 1.9 - 8);
    const flag = new WavingFlag(this.flags.blank());
    flag.mesh.position.set(2, -FLAG_H * 1.85);
    const barBg = new Sprite(Texture.WHITE);
    barBg.tint = 0x0b0d10;
    barBg.alpha = 0.85;
    barBg.width = BAR_W + 4;
    barBg.height = BAR_H * 2 + 6;
    barBg.position.set(-BAR_W / 2 - 2, 4);
    const strength = new Sprite(Texture.WHITE);
    strength.height = BAR_H;
    strength.position.set(-BAR_W / 2, 6);
    const morale = new Sprite(Texture.WHITE);
    morale.height = BAR_H - 2;
    morale.position.set(-BAR_W / 2, 7 + BAR_H);
    const count = new Text({ text: '', style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 30, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x0b0d10, width: 6 } }, resolution: 2 });
    count.anchor.set(0, 0.5);
    count.position.set(BAR_W / 2 + 8, 4 + BAR_H + 3);
    const star = new Text({ text: '★', style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 34, fill: 0xf2cf5b, stroke: { color: 0x0b0d10, width: 6 } }, resolution: 2 });
    star.anchor.set(0.5);
    star.position.set(FLAG_W + 18, -FLAG_H * 1.6);
    root.addChild(pole, flag.mesh, finial, barBg, strength, morale, count, star);
    this.root.addChild(root);
    return { root, pole, finial, flag, barBg, strength, morale, count, star, seen: 0, key: '', routFlash: -1e9, x: 0, y: 0 };
  }

  destroy(): void {
    for (const v of this.views.values()) v.root.destroy({ children: true });
    this.views.clear();
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
