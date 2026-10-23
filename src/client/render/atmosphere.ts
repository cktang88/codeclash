import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { MapDef } from '../../sim/api.ts';
import type { Daylight } from './daylight.ts';
import { canvas2d, seeded } from './paint.ts';

// Life on the chart that is not the war: cloud shadows drifting over the land,
// birds and butterflies by day, fireflies and ember motes by night, and in the
// margins a little ship sailing the inked sea while a serpent surfaces now and
// then. Everything is pooled and sized by zoom so it costs almost nothing.

const RES = 2;

function paint(w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void): Texture {
  const [c, ctx] = canvas2d(w * RES, h * RES);
  ctx.scale(RES, RES);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  fn(ctx);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: RES, autoGenerateMipmaps: true, scaleMode: 'linear' }) });
}

interface AtmosphereArt {
  cloud: Texture[];
  bird: [Texture, Texture];
  butterfly: [Texture, Texture];
  mote: Texture;
  ship: Texture;
  wake: Texture;
  hump: Texture;
  head: Texture;
}

let cached: AtmosphereArt | null = null;

function art(): AtmosphereArt {
  if (cached) return cached;
  const cloud = [0, 1, 2].map((k) =>
    paint(256, 160, (ctx) => {
      const rand = seeded(900 + k);
      ctx.filter = 'blur(14px)';
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 9; i++) {
        const x = 50 + rand() * 156;
        const y = 50 + rand() * 60;
        ctx.beginPath();
        ctx.ellipse(x, y, 26 + rand() * 30, 18 + rand() * 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
  const bird = [0, 1].map((f) =>
    paint(24, 12, (ctx) => {
      ctx.strokeStyle = '#22180f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const lift = f === 0 ? -4 : 2;
      ctx.moveTo(2, 6 + lift);
      ctx.quadraticCurveTo(7, 3 + lift * 0.5, 12, 7);
      ctx.quadraticCurveTo(17, 3 + lift * 0.5, 22, 6 + lift);
      ctx.stroke();
    }),
  ) as [Texture, Texture];
  const butterfly = [0, 1].map((f) =>
    paint(16, 14, (ctx) => {
      // Forewing and hindwing on each side, inked, with a dark body; closed wings on the second frame.
      const spread = f === 0 ? 1 : 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(34,24,15,0.85)';
      ctx.lineWidth = 0.7;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(8, 6);
        ctx.quadraticCurveTo(8 + s * 6 * spread, 0, 8 + s * 7 * spread, 4);
        ctx.quadraticCurveTo(8 + s * 5 * spread, 7, 8, 7);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, 7);
        ctx.quadraticCurveTo(8 + s * 5 * spread, 8, 8 + s * 4 * spread, 11);
        ctx.quadraticCurveTo(8 + s * 1.5 * spread, 11, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = '#22180f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(8, 4);
      ctx.lineTo(8, 10);
      ctx.stroke();
    }),
  ) as [Texture, Texture];
  const mote = paint(16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
  // A caravel in the engraver's manner: ink hull, vellum sails, a vermilion cross.
  const ship = paint(64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(28,36,66,0.25)';
    ctx.beginPath();
    ctx.ellipse(32, 54, 24, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 42);
    ctx.quadraticCurveTo(32, 58, 58, 40);
    ctx.lineTo(52, 50);
    ctx.quadraticCurveTo(30, 58, 12, 50);
    ctx.closePath();
    ctx.fillStyle = '#7a5532';
    ctx.fill();
    ctx.strokeStyle = '#22180f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 44);
    ctx.lineTo(30, 8);
    ctx.moveTo(44, 42);
    ctx.lineTo(44, 18);
    ctx.stroke();
    const sail = (x: number, top: number, bottom: number, w: number) => {
      ctx.beginPath();
      ctx.moveTo(x - w, top);
      ctx.quadraticCurveTo(x + 3, (top + bottom) / 2, x - w, bottom);
      ctx.lineTo(x + w, bottom);
      ctx.quadraticCurveTo(x + w + 4, (top + bottom) / 2, x + w, top);
      ctx.closePath();
      ctx.fillStyle = '#efe4c8';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    sail(30, 12, 38, 10);
    sail(44, 22, 38, 7);
    ctx.strokeStyle = '#b8321f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 18);
    ctx.lineTo(30, 32);
    ctx.moveTo(24, 25);
    ctx.lineTo(36, 25);
    ctx.stroke();
    ctx.fillStyle = '#b8321f';
    ctx.beginPath();
    ctx.moveTo(30, 8);
    ctx.lineTo(38, 10);
    ctx.lineTo(30, 12);
    ctx.fill();
  });
  const wake = paint(48, 12, (ctx) => {
    ctx.strokeStyle = 'rgba(34,24,15,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(46 - i * 2, 6);
      ctx.quadraticCurveTo(24, 6 - 3 - i * 1.5, 2, 6 - 4 - i * 2);
      ctx.moveTo(46 - i * 2, 6);
      ctx.quadraticCurveTo(24, 6 + 3 + i * 1.5, 2, 6 + 4 + i * 2);
      ctx.stroke();
    }
  });
  const hump = paint(40, 26, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(2, 24);
    ctx.bezierCurveTo(6, 2, 34, 2, 38, 24);
    ctx.lineTo(31, 24);
    ctx.bezierCurveTo(28, 10, 12, 10, 9, 24);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 4, 0, 24);
    g.addColorStop(0, '#5fae94');
    g.addColorStop(1, '#2f7f6f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#22180f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Fin spines along the crest.
    ctx.fillStyle = '#b8321f';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.3 + i * 0.13);
      const x = 20 - Math.cos(a) * 15;
      const y = 15 - Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 1);
      ctx.lineTo(x, y - 5);
      ctx.lineTo(x + 2, y + 1);
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(239,228,200,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 25);
    ctx.lineTo(40, 25);
    ctx.stroke();
  });
  const head = paint(40, 40, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(6, 38);
    ctx.bezierCurveTo(4, 18, 12, 6, 24, 6);
    ctx.quadraticCurveTo(36, 6, 38, 12);
    ctx.lineTo(28, 16);
    ctx.quadraticCurveTo(20, 18, 18, 38);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 6, 0, 38);
    g.addColorStop(0, '#5fae94');
    g.addColorStop(1, '#2f7f6f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#22180f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#f6dc8c';
    ctx.beginPath();
    ctx.arc(25, 10, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8321f';
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(10, 0);
    ctx.lineTo(18, 6);
    ctx.fill();
  });
  cached = { cloud, bird, butterfly, mote, ship, wake, hump, head };
  return cached;
}

interface Mover {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  life: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FLOCKS = 3;
const PER_FLOCK = 7;
const BUTTERFLIES = 18;
const FIREFLIES = 70;
const MOTES = 28;

/** Ambient life. `ground` sits on the map under the units; `air` above them; `glow` in the additive light pass. */
export class Atmosphere {
  readonly ground = new Container();
  readonly air = new Container();
  readonly glow = new Container();
  private readonly art = art();
  private clouds: Mover[] = [];
  private birds: Mover[] = [];
  private flocks: { x: number; y: number; vx: number; vy: number }[] = [];
  private butterflies: Mover[] = [];
  private fireflies: Mover[] = [];
  private motes: Mover[] = [];
  private ship: Sprite;
  private wake: Sprite;
  private shipAngle = 0;
  private serpent: Sprite[] = [];
  private serpentAt = 0;
  private serpentAngle = 0;
  private readonly extent: number;
  private readonly rand = seeded(4242);

  constructor(
    private map: MapDef,
    private sea: number,
    private fires: () => readonly { x: number; y: number }[],
  ) {
    const R = map.radius;
    this.extent = R + sea;
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(this.art.cloud[i % 3]!);
      s.anchor.set(0.5);
      s.tint = 0x1c2444;
      const k = (R * (0.55 + this.rand() * 0.4)) / 256;
      s.scale.set(k, k * 0.8);
      this.air.addChild(s);
      this.clouds.push({ s, x: (this.rand() * 2 - 1) * R * 1.4, y: (this.rand() * 2 - 1) * R * 1.4, vx: 6 + this.rand() * 3, vy: 2.5 + this.rand() * 1.5, phase: this.rand() * 10, life: 0 });
    }
    for (let f = 0; f < FLOCKS; f++) {
      this.flocks.push({ x: 0, y: 0, vx: 0, vy: 0 });
      this.launchFlock(f, true);
      for (let i = 0; i < PER_FLOCK; i++) {
        const s = new Sprite(this.art.bird[0]);
        s.anchor.set(0.5);
        this.air.addChild(s);
        // V formation offsets.
        const rank = Math.ceil(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        this.birds.push({ s, x: -rank * 14, y: side * rank * 10, vx: 0, vy: 0, phase: this.rand() * 6, life: f });
      }
    }
    for (let i = 0; i < BUTTERFLIES; i++) {
      const s = new Sprite(this.art.butterfly[0]);
      s.anchor.set(0.5);
      s.tint = [0xf6dc8c, 0xefe4c8, 0xd98a4a, 0x8fb8e8][i % 4]!;
      this.air.addChild(s);
      this.butterflies.push({ s, x: 0, y: 0, vx: 0, vy: 0, phase: this.rand() * 10, life: -1 });
    }
    for (let i = 0; i < FIREFLIES; i++) {
      const s = new Sprite(this.art.mote);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xd8f07a;
      this.glow.addChild(s);
      this.fireflies.push({ s, x: 0, y: 0, vx: 0, vy: 0, phase: this.rand() * 10, life: -1 });
    }
    for (let i = 0; i < MOTES; i++) {
      const s = new Sprite(this.art.mote);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xff9a3c;
      this.glow.addChild(s);
      this.motes.push({ s, x: 0, y: 0, vx: 0, vy: 0, phase: this.rand() * 10, life: -1 });
    }
    this.wake = new Sprite(this.art.wake);
    this.wake.anchor.set(0, 0.5);
    this.ship = new Sprite(this.art.ship);
    this.ship.anchor.set(0.5, 0.82);
    this.ground.addChild(this.wake, this.ship);
    this.shipAngle = this.rand() * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(i === 0 ? this.art.head : this.art.hump);
      s.anchor.set(0.5, 1);
      s.visible = false;
      this.ground.addChild(s);
      this.serpent.push(s);
    }
    this.serpentAt = 4000;
  }

  private launchFlock(f: number, anywhere: boolean): void {
    const R = this.map.radius;
    const a = this.rand() * Math.PI * 2;
    const dir = a + Math.PI + (this.rand() - 0.5) * 0.9;
    const speed = 55 + this.rand() * 25;
    const fl = this.flocks[f]!;
    const start = anywhere ? this.rand() * R : R * 1.3;
    fl.x = Math.cos(a) * start;
    fl.y = Math.sin(a) * start;
    fl.vx = Math.cos(dir) * speed;
    fl.vy = Math.sin(dir) * speed;
  }

  update(dtMs: number, now: number, zoom: number, view: Bounds, light: Daylight, reducedMotion: boolean): void {
    const dt = dtMs / 1000;
    const t = now / 1000;
    const R = this.map.radius;
    const day = light.day;
    const night = light.lights;
    const motion = reducedMotion ? 0.3 : 1;

    // Cloud shadows: wide, soft and slow; strongest at noon, gone at night.
    const span = R * 1.6;
    for (const c of this.clouds) {
      c.x += c.vx * dt * motion;
      c.y += c.vy * dt * motion;
      if (c.x > span) c.x -= span * 2;
      if (c.y > span) c.y -= span * 2;
      c.s.position.set(c.x, c.y);
      // Clouds shade the land, not the walnut table beyond the sheet.
      const d = Math.hypot(c.x, c.y);
      c.s.alpha = 0.13 * day * (1 - Math.min(1, Math.max(0, (d - R * 0.85) / (R * 0.4))));
      c.s.visible = day > 0.05;
    }

    // Birds in loose V's crossing the map by day.
    const showBirds = day > 0.2 && zoom > 0.18;
    for (let f = 0; f < FLOCKS; f++) {
      const fl = this.flocks[f]!;
      fl.x += fl.vx * dt * motion;
      fl.y += fl.vy * dt * motion;
      if (fl.x * fl.x + fl.y * fl.y > R * R * 2.2 && fl.x * fl.vx + fl.y * fl.vy > 0) this.launchFlock(f, false);
    }
    for (const b of this.birds) {
      const fl = this.flocks[b.life]!;
      b.s.visible = showBirds;
      if (!showBirds) continue;
      const ang = Math.atan2(fl.vy, fl.vx);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const wob = Math.sin(t * 1.3 + b.phase) * 3;
      b.s.position.set(fl.x + b.x * ca - (b.y + wob) * sa, fl.y + b.x * sa + (b.y + wob) * ca);
      b.s.texture = this.art.bird[Math.floor(t * 6 + b.phase) % 2]!;
      const k = Math.max(0.9, 1 / Math.max(zoom, 0.35));
      b.s.scale.set(k);
      b.s.alpha = Math.min(1, (day - 0.2) * 3) * 0.85;
    }

    // Butterflies, only close up: they flutter over the meadow in view.
    const showFlutter = day > 0.4 && zoom > 0.9;
    for (const b of this.butterflies) {
      b.s.visible = showFlutter;
      if (!showFlutter) {
        b.life = -1;
        continue;
      }
      if (b.life < 0 || !inside(view, b.x, b.y, 40)) this.spawnIn(b, view);
      b.phase += dt;
      b.vx += (Math.sin(b.phase * 1.7) * 30 - b.vx) * dt;
      b.vy += (Math.cos(b.phase * 1.3) * 22 - b.vy) * dt;
      b.x += b.vx * dt * motion;
      b.y += b.vy * dt * motion;
      b.s.position.set(b.x, b.y - 10 - Math.abs(Math.sin(b.phase * 3)) * 4);
      b.s.texture = this.art.butterfly[Math.floor(t * 14 + b.phase * 7) % 2]!;
      b.s.scale.set(0.75);
    }

    // Fireflies at night, drifting and blinking; fewer at mid zoom, none far out.
    const flyCount = night < 0.1 || zoom < 0.3 ? 0 : zoom < 0.7 ? FIREFLIES / 2 : FIREFLIES;
    for (let i = 0; i < FIREFLIES; i++) {
      const b = this.fireflies[i]!;
      b.s.visible = i < flyCount;
      if (!b.s.visible) {
        b.life = -1;
        continue;
      }
      if (b.life < 0 || !inside(view, b.x, b.y, 60)) this.spawnIn(b, view);
      b.phase += dt;
      b.x += Math.sin(b.phase * 0.7 + i) * 9 * dt * motion;
      b.y += Math.cos(b.phase * 0.5 + i * 2) * 7 * dt * motion;
      b.s.position.set(b.x, b.y);
      const blink = Math.max(0, Math.sin(b.phase * 1.6 + i * 1.3));
      b.s.alpha = night * blink * blink * 0.95;
      b.s.scale.set(Math.max(0.5, 0.65 / Math.sqrt(zoom)));
    }

    // Ember motes rising from capital fires and sacked ruins at night.
    const fires = this.fires();
    const showMotes = night > 0.1 && zoom > 0.25 && fires.length > 0;
    for (let i = 0; i < MOTES; i++) {
      const m = this.motes[i]!;
      m.s.visible = showMotes;
      if (!showMotes) continue;
      m.life -= dt;
      if (m.life <= 0) {
        const f = fires[i % fires.length]!;
        m.x = f.x + (this.rand() - 0.5) * 50;
        m.y = f.y - this.rand() * 20;
        m.vx = (this.rand() - 0.5) * 10;
        m.vy = -18 - this.rand() * 20;
        m.life = 2 + this.rand() * 2.5;
        m.phase = m.life;
      }
      m.x += (m.vx + Math.sin(t * 2 + i) * 8) * dt * motion;
      m.y += m.vy * dt * motion;
      m.s.position.set(m.x, m.y);
      const k = m.life / m.phase;
      m.s.alpha = night * Math.min(1, k * 2) * (0.6 + Math.sin(t * 9 + i) * 0.3);
      m.s.scale.set(0.45 + k * 0.3);
    }

    // The ship sails slowly round the inked sea, bobbing.
    const shipR = R + this.sea * 0.5;
    this.shipAngle += (dt * motion * 9) / shipR;
    const sx = Math.cos(this.shipAngle) * shipR;
    const sy = Math.sin(this.shipAngle) * shipR;
    const heading = this.shipAngle + Math.PI / 2;
    const facing = Math.cos(heading) >= 0 ? 1 : -1;
    const shipScale = Math.max(1.1, 0.8 / Math.max(zoom, 0.25));
    this.ship.position.set(sx, sy + Math.sin(t * 1.4) * 1.5);
    this.ship.scale.set(shipScale * facing, shipScale);
    this.ship.rotation = Math.sin(t * 1.1) * 0.05;
    this.wake.position.set(sx - Math.cos(heading) * 4 * shipScale, sy + 2);
    this.wake.rotation = heading + Math.PI;
    this.wake.scale.set(shipScale * 0.8);
    this.wake.alpha = 0.6;

    // The serpent surfaces now and then: humps rise in turn, glide, and sink.
    this.serpentAt -= dtMs * motion;
    const cycle = 9000;
    if (this.serpentAt < -cycle) {
      this.serpentAt = 9000 + this.rand() * 14000;
      this.serpentAngle = this.rand() * Math.PI * 2;
    }
    const show = this.serpentAt < 0 && !reducedMotion;
    const st = -this.serpentAt / cycle;
    const serpR = R + this.sea * (0.35 + 0.25 * Math.sin(this.serpentAngle * 3));
    const serpScale = Math.max(1, 0.8 / Math.max(zoom, 0.25));
    for (let i = 0; i < this.serpent.length; i++) {
      const s = this.serpent[i]!;
      s.visible = show;
      if (!show) continue;
      const a = this.serpentAngle + st * 0.12 - (i * 34 * serpScale) / serpR;
      const rise = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, st * 1.25 - i * 0.06))));
      s.position.set(Math.cos(a) * serpR, Math.sin(a) * serpR);
      s.scale.set(serpScale * -1, serpScale * rise);
      s.alpha = Math.min(1, rise * 2);
    }
  }

  private spawnIn(b: Mover, view: Bounds): void {
    const R = this.map.radius;
    for (let tries = 0; tries < 4; tries++) {
      b.x = view.x + this.rand() * view.width;
      b.y = view.y + this.rand() * view.height;
      if (b.x * b.x + b.y * b.y < R * R) break;
    }
    b.vx = 0;
    b.vy = 0;
    b.life = 1;
  }

  destroy(): void {
    this.ground.destroy({ children: true });
    this.air.destroy({ children: true });
    this.glow.destroy({ children: true });
  }
}

function inside(b: Bounds, x: number, y: number, pad: number): boolean {
  return x > b.x - pad && x < b.x + b.width + pad && y > b.y - pad && y < b.y + b.height + pad;
}
