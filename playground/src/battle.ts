// A small real-time fight: soldiers find the nearest foe, march, strike or shoot on their clip's
// beat, flinch, fall, and sink away. Not the game's simulation; just enough to watch clips fight.
import * as THREE from 'three';
import { instance, template, type Pose, type Template, type UnitDef } from './assets.ts';
import { hullOf, TEAMS, toon } from './style.ts';

const FADE = 0.18;
/** Seconds a body lies before it sinks, and how long the sinking takes. */
const LIE = 5;
const SINK = 1.5;
const RETARGET = 0.5;

type State = 'idle' | 'walk' | 'attack' | 'hit' | 'die' | 'puppet';

export class Fighter {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  hp: number;
  state: State = 'idle';
  target: Fighter | null = null;
  private retarget = 0;
  private cooldown = Math.random() * 0.6;
  private stateLeft = 0;
  /** Seconds into the current attack until its blow lands; -1 once it has. */
  private strikeIn = -1;
  private current: THREE.AnimationAction | null = null;
  private deadFor = 0;
  private knock = new THREE.Vector3();
  private bar: THREE.Sprite;
  private barFill: THREE.Sprite;
  readonly height: number;

  constructor(
    readonly tpl: Template,
    readonly side: number,
    private battle: Battle,
  ) {
    const def = tpl.def;
    this.hp = def.stats.hp;
    this.height = def.height;
    this.body = instance(tpl);
    def.team?.(this.body, new THREE.Color().setHex(TEAMS[side]!, THREE.SRGBColorSpace));
    this.root.add(this.body);
    this.root.add(baseRing(def.stats.radius, side));
    this.mixer = new THREE.AnimationMixer(this.body);
    [this.bar, this.barFill] = healthBar(side);
    this.bar.position.y = this.barFill.position.y = def.height + (def.stats.fly ?? 0) + 0.35;
    this.root.add(this.bar, this.barFill);
    this.root.userData.fighter = this;
    this.play('idle');
  }

  get def(): UnitDef {
    return this.tpl.def;
  }
  get alive(): boolean {
    return this.hp > 0;
  }
  get pos(): THREE.Vector3 {
    return this.root.position;
  }

  /** Plays a pose (a random clip among its matches); returns its length in seconds, 0 if it has none. */
  play(pose: Pose, once = false): number {
    const clips = this.tpl.clips.get(pose)!;
    const clip = clips[Math.floor(Math.random() * clips.length)] ?? (pose === 'hit' ? undefined : this.tpl.clips.get('idle')![0]);
    if (!clip) return 0;
    return this.playClip(clip, this.def.rate?.[pose] ?? 1, once);
  }

  playClip(clip: THREE.AnimationClip, rate = 1, once = false): number {
    const a = this.mixer.clipAction(clip);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = rate;
    if (a !== this.current || once) {
      a.reset().play();
      if (this.current && this.current !== a) this.current.crossFadeTo(a, FADE, false);
      else a.fadeIn(FADE);
      this.current = a;
    }
    return clip.duration / rate;
  }

  /** Inspector: plays any clip by name and freezes the fighter's thinking. */
  puppet(name: string): void {
    const clip = this.tpl.all.find((c) => c.name === name);
    if (!clip) return;
    this.state = 'puppet';
    this.playClip(clip);
  }

  release(): void {
    if (this.state === 'puppet') this.setState('idle');
  }

  private setState(s: State): void {
    this.state = s;
    if (s === 'idle' || s === 'walk') this.play(s);
  }

  damage(n: number, from: THREE.Vector3): void {
    if (!this.alive) return;
    this.hp -= n;
    this.knock.subVectors(this.pos, from).setY(0).normalize().multiplyScalar(Math.min(0.6, (n / this.def.stats.hp) * 4));
    this.battle.popup(this, n);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'die';
      this.play('die', true);
      this.bar.visible = this.barFill.visible = false;
      return;
    }
    // A flinch interrupts only a soldier not mid-swing, so big hitters still land their blows.
    if (this.state !== 'attack' && this.state !== 'puppet') {
      const len = this.play('hit', true);
      if (len > 0) {
        this.state = 'hit';
        this.stateLeft = len * 0.8;
      }
    }
  }

  update(dt: number, foes: Fighter[], friends: Fighter[], camera: THREE.Camera): boolean {
    this.mixer.update(dt);
    const s = this.def.stats;
    this.barFill.scale.x = Math.max(0.001, this.hp / s.hp) * 0.9;
    if (s.fly) this.body.position.y = s.fly + Math.sin(performance.now() / 600 + this.root.id) * 0.15;
    if (this.knock.lengthSq() > 1e-5) {
      this.pos.addScaledVector(this.knock, dt * 6);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    }
    if (this.state === 'die') {
      this.deadFor += dt;
      if (s.fly && this.body.position.y > 0) this.body.position.y = Math.max(0, s.fly * (1 - this.deadFor / 0.8));
      if (this.deadFor > LIE) this.root.position.y = -((this.deadFor - LIE) / SINK) * this.height * 0.6;
      return this.deadFor < LIE + SINK;
    }
    if (this.state === 'puppet') return true;
    this.cooldown -= dt;
    this.stateLeft -= dt;
    this.retarget -= dt;
    if (this.state === 'attack') {
      if (this.strikeIn >= 0) {
        this.strikeIn -= dt;
        if (this.strikeIn < 0 && this.target?.alive) this.battle.strike(this, this.target);
      }
      if (this.stateLeft <= 0) this.setState('idle');
      else if (this.target) this.face(this.target.pos, dt);
      return true;
    }
    if (this.state === 'hit') {
      if (this.stateLeft <= 0) this.setState('idle');
      return true;
    }
    if (!this.target?.alive || this.retarget <= 0) {
      this.retarget = RETARGET;
      this.target = nearest(this, foes);
    }
    const t = this.target;
    if (!t) {
      if (this.state !== 'idle') this.setState('idle');
      return true;
    }
    const to = new THREE.Vector3().subVectors(t.pos, this.pos).setY(0);
    const gap = to.length() - (s.shot ? 0 : t.def.stats.radius + s.radius - 0.9);
    if (gap > s.range) {
      if (this.state !== 'walk') this.setState('walk');
      to.normalize();
      // Keep apart from friends so the line spreads instead of stacking.
      for (const f of friends) {
        if (f === this || !f.alive) continue;
        const d = new THREE.Vector3().subVectors(this.pos, f.pos).setY(0);
        const min = s.radius + f.def.stats.radius;
        const l = d.length();
        if (l > 0 && l < min) to.addScaledVector(d.normalize(), ((min - l) / min) * 1.5);
      }
      to.normalize();
      this.pos.addScaledVector(to, s.speed * dt);
      this.face(this.pos.clone().add(to), dt);
    } else {
      this.face(t.pos, dt);
      if (this.cooldown <= 0) {
        const len = this.play('attack', true);
        this.state = 'attack';
        this.stateLeft = len;
        this.strikeIn = len * s.hitAt;
        this.cooldown = Math.max(s.cooldown, len);
      } else if (this.state !== 'idle') this.setState('idle');
    }
    void camera;
    return true;
  }

  private face(at: THREE.Vector3, dt: number): void {
    const want = Math.atan2(at.x - this.pos.x, at.z - this.pos.z);
    let d = want - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 8);
  }
}

function nearest(me: Fighter, foes: Fighter[]): Fighter | null {
  let best: Fighter | null = null;
  let bd = Infinity;
  for (const f of foes) {
    if (!f.alive) continue;
    const d = f.pos.distanceToSquared(me.pos);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function baseRing(radius: number, side: number): THREE.Object3D {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), new THREE.MeshBasicMaterial({ color: TEAMS[side], transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}

function healthBar(side: number): [THREE.Sprite, THREE.Sprite] {
  const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x22180f, depthTest: false }));
  back.scale.set(1, 0.12, 1);
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: TEAMS[side], depthTest: false }));
  fill.scale.set(0.9, 0.07, 1);
  back.renderOrder = fill.renderOrder = 10;
  fill.renderOrder = 11;
  return [back, fill];
}

interface Shot {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: Fighter;
  by: Fighter;
  t: number;
  dur: number;
  arc: number;
}

export class Battle {
  fighters: Fighter[] = [];
  private shots: Shot[] = [];
  private popups: { s: THREE.Sprite; t: number }[] = [];
  readonly group = new THREE.Group();
  speed = 1;

  async spawn(def: UnitDef, side: number, at: THREE.Vector3): Promise<Fighter> {
    const t = await template(def);
    const f = new Fighter(t, side, this);
    f.pos.copy(at);
    f.root.rotation.y = side === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.fighters.push(f);
    this.group.add(f.root);
    return f;
  }

  /** Spawns `count` in loose ranks around the side's rally point. */
  async muster(def: UnitDef, side: number, count: number, rank = 0): Promise<void> {
    const dir = side === 0 ? -1 : 1;
    const gap = def.stats.radius * 2.4;
    const per = Math.max(1, Math.ceil(Math.sqrt(count * 2)));
    await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / per);
        const col = i % per;
        const at = new THREE.Vector3(dir * (8 + rank * 3 + row * gap + Math.random() * 0.4), 0, (col - (per - 1) / 2) * gap + Math.random() * 0.4);
        return this.spawn(def, side, at);
      }),
    );
  }

  clear(): void {
    for (const f of this.fighters) this.group.remove(f.root);
    for (const s of this.shots) this.group.remove(s.mesh);
    this.fighters = [];
    this.shots = [];
  }

  strike(by: Fighter, target: Fighter): void {
    const s = by.def.stats;
    if (!s.shot) {
      target.damage(s.damage, by.pos);
      return;
    }
    const from = by.pos.clone().setY((s.fly ?? 0) + by.height * 0.7);
    const mesh = missile(s.shot);
    mesh.position.copy(from);
    this.group.add(mesh);
    const d = from.distanceTo(target.pos);
    this.shots.push({ mesh, from, to: target, by, t: 0, dur: Math.max(0.25, d / (s.shot === 'arrow' ? 16 : 9)), arc: s.shot === 'arrow' ? d * 0.18 : 0.3 });
  }

  popup(f: Fighter, n: number): void {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '700 40px "IM Fell English SC", Georgia, serif';
    g.textAlign = 'center';
    g.lineWidth = 6;
    g.strokeStyle = '#22180f';
    g.strokeText(String(Math.round(n)), 64, 46);
    g.fillStyle = n >= 20 ? '#ff9a3c' : '#efe4c8';
    g.fillText(String(Math.round(n)), 64, 46);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(0.9, 0.45, 1);
    s.renderOrder = 12;
    s.position.copy(f.pos).setY(f.height + (f.def.stats.fly ?? 0) + 0.6);
    this.group.add(s);
    this.popups.push({ s, t: 0 });
  }

  update(dt: number, camera: THREE.Camera): void {
    dt *= this.speed;
    if (dt <= 0) return;
    const sides = [this.fighters.filter((f) => f.side === 0), this.fighters.filter((f) => f.side === 1)];
    this.fighters = this.fighters.filter((f) => {
      const keep = f.update(dt, sides[1 - f.side]!, sides[f.side]!, camera);
      if (!keep) this.group.remove(f.root);
      return keep;
    });
    this.shots = this.shots.filter((s) => {
      s.t += dt / s.dur;
      const to = s.to.pos.clone().setY((s.to.def.stats.fly ?? 0) + s.to.height * 0.55);
      const p = s.from.clone().lerp(to, Math.min(1, s.t));
      p.y += Math.sin(Math.min(1, s.t) * Math.PI) * s.arc;
      s.mesh.lookAt(p);
      s.mesh.position.copy(p);
      if (s.t >= 1) {
        s.to.damage(s.by.def.stats.damage, s.by.pos);
        this.group.remove(s.mesh);
        return false;
      }
      return true;
    });
    this.popups = this.popups.filter((p) => {
      p.t += dt;
      p.s.position.y += dt * 0.8;
      p.s.material.opacity = 1 - p.t;
      if (p.t >= 1) this.group.remove(p.s);
      return p.t < 1;
    });
  }
}

let dot: THREE.Texture | null = null;
/** A soft round falloff, so a glow is a halo rather than a square. */
function softDot(): THREE.Texture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return (dot = new THREE.CanvasTexture(c));
}

function missile(kind: 'arrow' | 'fire' | 'bolt'): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'arrow') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), toon({ color: 0x8a6418 }));
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft, hullOf(shaft));
  } else {
    const color = kind === 'fire' ? 0xff9a3c : 0x9ad8ff;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(kind === 'fire' ? 0.25 : 0.15, 12, 8), new THREE.MeshBasicMaterial({ color })));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(kind === 'fire' ? 1.2 : 0.7);
    g.add(glow);
  }
  return g;
}
