import { FAR_ZOOM } from './lod.ts';
import { CanvasSource, Container, MeshPlane, Sprite, Text, Texture } from 'pixi.js';
import { canvas2d } from './paint.ts';
import { PlatoonState, type Platoon, type World } from '../../sim/api.ts';
import type { RepoRef } from '../../sim/replay.ts';
import { FLAG_H, FLAG_W, TOKEN_H, TOKEN_W, gradeOf, type FlagCache, type FlagTrim } from './flags.ts';

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
  /** The far-zoom heraldic token: the battalion's arms on a shield. */
  token: Sprite;
  tokenKey: string;
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

  private folding: { v: BannerView; into: number; at: number; x: number; y: number }[] = [];

  /** A small platoon merges into another: its banner flies over and folds into the survivor's. */
  regroup(from: number, into: number, now: number): void {
    const v = this.views.get(from);
    if (!v) return;
    this.views.delete(from);
    this.folding.push({ v, into, at: now, x: v.x, y: v.y });
  }

  rout(platoon: number, now: number): void {
    const v = this.views.get(platoon);
    if (v) v.routFlash = now;
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
  ): void {
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
      const grade = gradeOf(world.players[pl.p]);
      const trim = trims[pl.p];
      const key = `${hue}|${repo[0]}|${pl.ordinal}|${grade.rank}|${grade.ragged ? 1 : 0}|${trim ?? ''}`;
      if (key !== v.key) {
        v.flag.texture = this.flags.battalion(hue, repo[0], repo[1], pl.ordinal, grade, trim);
        v.key = key;
      }
      // Far out, every platoon becomes a heraldic token; close in, a banner on its staff.
      v.token.visible = far && pl.id !== selected;
      v.pole.visible = v.finial.visible = v.flag.mesh.visible = !v.token.visible;
      if (v.token.visible && v.tokenKey !== key) {
        v.token.texture = this.flags.token(hue, repo[0], repo[1], grade);
        v.tokenKey = key;
      }
      const lift = 16 / zoom;
      v.root.position.set(v.x, v.y - lift);
      v.root.scale.set(scale);
      v.root.zIndex = v.y + (pl.id === selected ? 1e6 : 0);
      const routing = pl.state === PlatoonState.Rout;
      const engaged = pl.state === PlatoonState.Engage;
      v.root.rotation = routing ? -0.35 + Math.sin(now / 120) * 0.08 : 0;
      // Cloth only ripples where it can be seen; far tokens stay still.
      if (!far || pl.id === selected) v.flag.update(now / 1000, routing ? 3 : engaged ? 7 : 4.5);
      const flash = now - v.routFlash < 900 ? 1 - (now - v.routFlash) / 900 : 0;
      v.flag.mesh.tint = flash > 0 && Math.floor(now / 90) % 2 === 0 ? 0xffffff : routing ? 0xb8b8b8 : 0xffffff;
      v.flag.mesh.alpha = 1;
      v.strength.width = BAR_W * Math.max(0, Math.min(1, pl.alive / Math.max(1, pl.size)));
      v.morale.width = BAR_W * Math.max(0, Math.min(1, pl.morale / 100));
      v.morale.tint = pl.morale < 30 ? 0xb8321f : pl.morale < 60 ? 0xd4a93e : 0x5a7fc4;
      v.strength.tint = 0x3f9a84;
      v.count.visible = far || pl.id === selected;
      if (v.count.visible) v.count.text = String(pl.alive);
      v.star.visible = pl.champion;
      this.hits.push({ platoon: pl.id, x: v.x, y: v.y - lift - (FLAG_H * 0.9 * scale), r: Math.max(FLAG_W * 0.6 * scale, 10 / zoom) });
    }
    for (let i = this.folding.length - 1; i >= 0; i--) {
      const f = this.folding[i]!;
      const t = Math.min(1, (now - f.at) / 650);
      const target = this.views.get(f.into);
      if (t >= 1 || !target) {
        f.v.root.destroy({ children: true });
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
      v.root.destroy({ children: true });
      this.views.delete(id);
    }
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
    // Carved channels: an ink trough holding the pigment fill.
    const barBg = new Sprite(Texture.WHITE);
    barBg.tint = 0x22180f;
    barBg.alpha = 0.92;
    barBg.width = BAR_W + 4;
    barBg.height = BAR_H * 2 + 6;
    barBg.position.set(-BAR_W / 2 - 2, 4);
    const strength = new Sprite(Texture.WHITE);
    strength.height = BAR_H;
    strength.position.set(-BAR_W / 2, 6);
    const morale = new Sprite(Texture.WHITE);
    morale.height = BAR_H - 2;
    morale.position.set(-BAR_W / 2, 7 + BAR_H);
    const token = new Sprite();
    token.anchor.set(0.5, 1);
    token.width = TOKEN_W * 1.05;
    token.height = TOKEN_H * 1.05;
    token.position.set(0, 2);
    token.visible = false;
    const count = new Text({ text: '', style: { fontFamily: '"Alegreya SC", Alegreya, Georgia, serif', fontSize: 30, fontWeight: '700', fill: 0xefe4c8, stroke: { color: 0x22180f, width: 7, join: 'round' } }, resolution: 2 });
    count.anchor.set(0, 0.5);
    count.position.set(BAR_W / 2 + 8, 4 + BAR_H + 3);
    const star = new Text({ text: '✦', style: { fontFamily: 'Alegreya, Georgia, serif', fontSize: 38, fill: 0xf6dc8c, stroke: { color: 0x22180f, width: 6, join: 'round' } }, resolution: 2 });
    star.anchor.set(0.5);
    star.position.set(FLAG_W + 18, -FLAG_H * 1.6);
    root.addChild(pole, flag.mesh, finial, token, barBg, strength, morale, count, star);
    this.root.addChild(root);
    return { root, pole, finial, flag, barBg, strength, morale, token, tokenKey: '', count, star, seen: 0, key: '', routFlash: -1e9, x: 0, y: 0 };
  }

  private staff: Texture | null = null;
  private finialTex: Texture | null = null;

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
    for (const f of this.folding) f.v.root.destroy({ children: true });
    this.folding = [];
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
