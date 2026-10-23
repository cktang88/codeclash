// Effects lab: plays every effect in a loop against dummy soldiers. Open /render/fx/lab.html?scene=breath&zoom=1.6&stress=300.
import { Application, Container, Graphics, Texture } from 'pixi.js';
import { BlastKind, Kind, NEUTRAL, ShotKind, TICK_MS, type TickEvents, type World } from '../../../sim/api.ts';
import type { ChronicleEntry } from '../../../sim/chronicle.ts';
import { emptyEvents } from '../../../sim/world.ts';
import { loadFxArt } from './atlas.ts';
import { Effects, FLY_HEIGHT } from './effects.ts';

interface Dummy {
  id: number;
  kind: Kind;
  p: number;
  bx: number;
  by: number;
  x: number;
  y: number;
  g: Graphics;
}

const q = new URLSearchParams(location.search);
const only = q.get('scene');
const zoom = Number(q.get('zoom') ?? 1.4);
const stress = Number(q.get('stress') ?? 0);
const cx = Number(q.get('x') ?? 0);
const cy = Number(q.get('y') ?? 0);
const SCENES = ['combat', 'volley', 'fireball', 'boulder', 'breath', 'heal', 'deaths', 'muster', 'rank', 'dragon', 'site', 'desert', 'crack', 'sack', 'monolith', 'dayend'] as const;
type Scene = (typeof SCENES)[number];
const SCENE_TICKS = Number(q.get('ticks') ?? 18);
const TINTS = [0x3d7fd9, 0xd9483d, 0x4cc26a];

const app = new Application();
await app.init({ resizeTo: window, background: 0x7d8452, antialias: true, resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true, preference: 'webgl' });
document.body.style.margin = '0';
document.body.appendChild(app.canvas);

const scene = new Container();
app.stage.addChild(scene);
const ground = new Graphics();
for (let i = 0; i < 40; i++) ground.circle((Math.random() - 0.5) * 1400, (Math.random() - 0.5) * 900, 60 + Math.random() * 120).fill({ color: Math.random() < 0.5 ? 0x6c7444 : 0x8f945e, alpha: 0.6 });
const units = new Container();
if (!q.has('procedural')) await loadFxArt();
const fx = new Effects({ reducedMotion: q.has('reduced') });
const cues: string[] = [];
fx.sound = (name, _x, _y, gain) => {
  cues.push(`${name} ${gain.toFixed(1)}`);
  if (cues.length > 6) cues.shift();
};
fx.cinematic = (shot) => cues.push(`camera: ${shot.reason} @${shot.x | 0},${shot.y | 0} x${shot.zoom}`);
fx.openGate = (site) => cues.push(`gate ${site}`);
fx.viewerP = 0;
scene.addChild(ground, fx.ground, units, fx.air, fx.glow, fx.overlay);

const dummies: Dummy[] = [];
let nextId = 1;
function dummy(kind: Kind, p: number, x: number, y: number): Dummy {
  const g = new Graphics();
  const big = kind === Kind.Dragon ? 18 : kind === Kind.Troll || kind === Kind.BoneGolem ? 11 : 6;
  g.ellipse(0, 0, big, big * 0.45).fill({ color: 0x000000, alpha: 0.35 });
  const alt = FLY_HEIGHT[kind] ?? 0;
  g.roundRect(-big * 0.6, -big * 2 - alt, big * 1.2, big * 2, 3).fill(TINTS[p]!).stroke({ color: 0x111111, width: 1.5 });
  g.circle(0, -big * 2.2 - alt, big * 0.5).fill(0xe8d4b0).stroke({ color: 0x111111, width: 1.5 });
  units.addChild(g);
  const d: Dummy = { id: nextId++, kind, p, bx: x, by: y, x, y, g };
  dummies.push(d);
  return d;
}

// Two armies facing each other, a capital on the right and the Monolith at the center.
const left: Dummy[] = [];
const right: Dummy[] = [];
for (let i = 0; i < 12; i++) left.push(dummy(Kind.Archer, 0, -330 + (i % 3) * 18, -110 + Math.floor(i / 3) * 40));
const wizards = [0, 1, 2].map((i) => dummy(Kind.Wizard, 0, -260, -60 + i * 50));
const trebuchet = dummy(Kind.Trebuchet, 0, -420, 120);
const dragon = dummy(Kind.Dragon, 0, -120, 40);
const clerics = [dummy(Kind.Cleric, 0, -200, 150), dummy(Kind.Paladin, 0, -170, 180)];
for (let i = 0; i < 18; i++) right.push(dummy(Kind.Footman, 1, 120 + (i % 6) * 18, -60 + Math.floor(i / 6) * 22 + (i % 2) * 6));
const casualties: Kind[] = [Kind.Footman, Kind.Skeleton, Kind.BoneGolem, Kind.Troll, Kind.Champion, Kind.Knight, Kind.GriffinRider, Kind.Dragon];
const victims = casualties.map((k, i) => dummy(k, 1, 40 + i * 50, 200));

const home = { id: 0, kind: 'capital' as const, x: -560, y: 40, radius: 70, slot: 0, renown: 0 };
const capital = { id: 1, kind: 'capital' as const, x: 380, y: -40, radius: 70, slot: 1, renown: 0 };
const shrine = { id: 2, kind: 'shrine' as const, x: 0, y: -250, radius: 55, slot: -1, renown: 2 };
const heart = { id: 3, kind: 'heart' as const, x: 0, y: 0, radius: 45, slot: -1, renown: 8 };
interface FakePlatoon {
  id: number;
  p: number;
  x: number;
  y: number;
  mustered: number[];
}
const world = {
  tick: 0,
  units: [] as { id: number; kind: Kind; x: number; y: number; p: number }[],
  structures: [
    { site: 1, p: 1, hp: 8000, maxHp: 8000, cooldown: 0, ruinedUntil: -1 },
    { site: 3, p: NEUTRAL, hp: 20000, maxHp: 20000, cooldown: 0, ruinedUntil: -1 },
  ],
  map: { sites: [home, capital, shrine, heart], radius: 700 },
  platoons: [] as FakePlatoon[],
  players: [
    { p: 0, slot: 0, veterancy: 0 },
    { p: 1, slot: 1, veterancy: 0 },
  ],
  monolithFallen: false,
};
const platoon = (id: number, p: number, x: number, y: number, dragon = false): FakePlatoon => {
  const mustered = new Array<number>(24).fill(0);
  if (dragon) mustered[Kind.Dragon] = 1;
  return { id, p, x, y, mustered };
};
const muster = (pl: FakePlatoon, msg: string): ChronicleEntry => ({
  tick: world.tick, kind: 'muster', p: pl.p, q: -1, site: -1, platoon: pl.id, x: pl.x, y: pl.y,
  text: `ada pushed a bug fix to parser "${msg}". Parser's 3rd Platoon musters: 6 Footmen, 2 Archers.`,
});
const asWorld = world as unknown as World;
const capitalG = new Graphics().rect(capital.x - 40, capital.y - 80, 80, 80).fill(0x6b5f50).stroke({ color: 0x111111, width: 2 });
capitalG.rect(home.x - 40, home.y - 80, 80, 80).fill(0x5b6f90).stroke({ color: 0x111111, width: 2 });
capitalG.poly([heart.x - 18, heart.y, heart.x - 10, heart.y - 110, heart.x + 12, heart.y - 100, heart.x + 18, heart.y]).fill(0x1c1a22).stroke({ color: 0x111111, width: 2 });
units.addChild(capitalG);

const posOf = (id: number): { x: number; y: number } | null => {
  if (id < 0) return { x: capital.x, y: capital.y - capital.radius * 0.6 };
  const d = dummies.find((u) => u.id === id);
  return d && d.g.visible ? { x: d.x, y: d.y } : null;
};

const pending = new Map<number, (ev: TickEvents) => void>();
const at = (tick: number, fn: (ev: TickEvents) => void) => {
  const prev = pending.get(tick);
  pending.set(tick, prev ? (ev) => (prev(ev), fn(ev)) : fn);
};
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

function stage(name: Scene, t0: number): void {
  const t = t0;
  switch (name) {
    case 'volley':
      for (let k = 0; k < 3; k++) {
        at(t + k * 4, (ev) => {
          for (const a of left) {
            const v = pick(right);
            const ranger = a.id % 4 === 0;
            ev.shots.push({ from: a.id, to: v.id, x: a.x, y: a.y, land: t + k * 4 + 2 + (ranger ? 0 : 1), kind: ranger ? ShotKind.RangerArrow : ShotKind.Arrow });
          }
          ev.shots.push({ from: -1, to: left[k]!.id, x: capital.x, y: capital.y, land: t + k * 4 + 3, kind: ShotKind.TowerBolt });
        });
        at(t + k * 4 + 3, (ev) => right.slice(0, 8).forEach((v) => ev.hits.push({ unit: v.id, damage: 8, structure: -1 })));
      }
      break;
    case 'fireball':
      wizards.forEach((w, i) => {
        const v = right[i * 5]!;
        at(t + i * 2, (ev) => ev.shots.push({ from: w.id, to: v.id, x: w.x, y: w.y, land: t + i * 2 + 4, kind: ShotKind.Fireball }));
        at(t + i * 2 + 4, (ev) => ev.blasts.push({ x: v.x, y: v.y, radius: 28, kind: BlastKind.Fireball }));
      });
      at(t + 10, (ev) => ev.shots.push({ from: wizards[0]!.id, to: -1, x: wizards[0]!.x, y: wizards[0]!.y, land: t + 15, kind: ShotKind.Fireball }));
      at(t + 15, (ev) => ev.blasts.push({ x: capital.x, y: capital.y, radius: 28, kind: BlastKind.Fireball }));
      break;
    case 'boulder':
      for (let k = 0; k < 2; k++) {
        const v = right[3 + k * 7]!;
        at(t + k * 6, (ev) => ev.shots.push({ from: trebuchet.id, to: v.id, x: trebuchet.x, y: trebuchet.y, land: t + k * 6 + 8, kind: ShotKind.Boulder }));
        at(t + k * 6 + 8, (ev) => ev.blasts.push({ x: v.x, y: v.y, radius: 22, kind: BlastKind.Boulder }));
      }
      break;
    case 'breath':
      for (let k = 0; k < 2; k++) {
        at(t + k * 8, (ev) => {
          const target = right[7]!;
          const dx = target.x - dragon.x;
          const dy = target.y - dragon.y;
          const d = Math.hypot(dx, dy);
          const range = 240;
          ev.breaths.push({ from: dragon.id, x: dragon.x, y: dragon.y, tx: dragon.x + (dx / d) * range, ty: dragon.y + (dy / d) * range, range });
          ev.blasts.push({ x: dragon.x + (dx / d) * range * 0.5, y: dragon.y + (dy / d) * range * 0.5, radius: 25, kind: BlastKind.Scorch });
        });
      }
      break;
    case 'heal':
      for (let k = 0; k < 4; k++) at(t + k * 3, (ev) => clerics.forEach((c, i) => ev.heals.push({ from: c.id, to: left[(k * 2 + i) % left.length]!.id, amount: 20 })));
      break;
    case 'deaths':
      victims.forEach((v, i) =>
        at(t + 1 + i * 2, (ev) => {
          ev.deaths.push({ unit: v.id, p: 1, kind: v.kind, x: v.x, y: v.y, killer: 0, by: 0, platoon: 0 });
          const g = v.g;
          fx.corpse(dummyTexture, v.x, v.y, i % 2 ? 1 : -1, v.kind === Kind.Dragon ? 1.4 : 0.6, 0xbbbbbb, FLY_HEIGHT[v.kind] ?? 0);
          g.visible = false;
          setTimeout(() => (g.visible = true), 2500);
        }),
      );
      break;
    case 'site':
      at(t + 1, (ev) => {
        world.platoons = [platoon(99, 0, -360, -230)];
        ev.marches.push({ platoon: 99 });
      });
      at(t + 5, (ev) => ev.captures.push({ site: 2, p: 0, previous: -1 }));
      at(t + 9, (ev) => {
        world.platoons = [platoon(98, 1, 200, 120)];
        ev.routs.push({ platoon: 98 });
      });
      at(t + 12, (ev) => ev.cries.push({ p: 1 }));
      break;
    case 'sack':
      at(t + 1, (ev) => {
        ev.sacks.push({ site: 1, p: 0, victim: 1 });
        world.structures[0]!.ruinedUntil = 999999;
      });
      at(t + SCENE_TICKS - 1, (ev) => {
        world.structures[0]!.ruinedUntil = -1;
        ev.rebuilt.push({ site: 1 });
      });
      break;
    case 'monolith':
      at(t + 1, () => (world.structures[1]!.hp = 1500));
      at(t + 8, (ev) => {
        ev.monolith = { p: 0 };
        world.monolithFallen = true;
      });
      at(t + SCENE_TICKS - 1, () => {
        world.monolithFallen = false;
        world.structures[1]!.hp = 20000;
      });
      break;
    case 'combat':
      for (let k = 0; k < 4; k++) {
        at(t + k * 4, (ev) => right.slice(0, 12).forEach((v, i) => ev.swings.push({ from: v.id, to: left[i % left.length]!.id })));
        at(t + k * 4 + 1, (ev) => left.forEach((v, i) => ev.hits.push({ unit: v.id, damage: i % 4 === 0 ? 24 : 9, structure: -1 })));
      }
      break;
    case 'muster': {
      const a = platoon(97, 0, -480, 60);
      const b = platoon(96, 1, 300, 20);
      at(t + 1, (ev) => {
        world.platoons = [a, b];
        fx.onChronicle([muster(a, 'fix: off-by-one in the tokenizer lookahead')], asWorld);
        ev.marches.push({ platoon: 97 });
      });
      // A march that arrives before its chronicle line.
      at(t + 3, (ev) => ev.marches.push({ platoon: 96 }));
      at(t + 4, () => fx.onChronicle([muster(b, 'feat(render): ink-and-pigment smoke, hatched like an engraving')], asWorld));
      break;
    }
    case 'rank':
      at(t + 1, () => {
        world.platoons = [platoon(95, 0, -300, -40), platoon(94, 0, -220, 80), platoon(93, 1, 220, 0)];
      });
      at(t + 3, () => (world.players[0]!.veterancy += 1));
      break;
    case 'dragon':
      at(t + 1, (ev) => {
        world.platoons = [platoon(92, 0, home.x + 40, home.y)];
        fx.onChronicle([muster(world.platoons[0]!, 'perf: summon the wyrm')], asWorld);
        ev.marches.push({ platoon: 92 });
      });
      break;
    case 'desert':
      at(t + 2, (ev) => {
        for (const v of right.slice(6, 12)) v.g.visible = false;
        ev.desertions.push({ p: 1, count: 6 });
        setTimeout(() => right.slice(6, 12).forEach((v) => (v.g.visible = true)), 3000);
      });
      break;
    case 'crack':
      at(t + 1, () => (world.structures[0]!.hp = 900));
      at(t + SCENE_TICKS - 1, () => (world.structures[0]!.hp = 8000));
      break;
    case 'dayend':
      at(t + 1, () => fx.dayEnd(asWorld));
      break;
  }
}

const [dc, dctx] = (() => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 48;
  return [c, c.getContext('2d')!] as const;
})();
dctx.fillStyle = '#aaa';
dctx.fillRect(10, 14, 12, 26);
dctx.beginPath();
dctx.arc(16, 9, 6, 0, Math.PI * 2);
dctx.fill();
const dummyTexture = Texture.from(dc);

const hud = document.createElement('pre');
hud.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;color:#f4e9cc;font:13px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.6);padding:6px 9px;border-radius:6px';
document.body.appendChild(hud);

let tick = 0;
let tickStart = performance.now();
let last = performance.now();
let sceneIndex = 0;
let frameMs = 0;
let fps = 60;

function stepTick(): void {
  if (tick % SCENE_TICKS === 0) {
    const name = only && (SCENES as readonly string[]).includes(only) ? (only as Scene) : SCENES[sceneIndex++ % SCENES.length]!;
    stage(name, tick);
    hud.dataset.scene = name;
  }
  const ev = emptyEvents();
  pending.get(tick)?.(ev);
  pending.delete(tick);
  if (stress > 0) {
    // Keep roughly `stress` effects alive: each tick spawns a slice of mixed effects.
    for (let i = 0; i < stress / 8; i++) {
      const a = pick(left);
      const v = pick(right);
      const r = Math.random();
      if (r < 0.5) ev.shots.push({ from: a.id, to: v.id, x: a.x, y: a.y, land: tick + 3, kind: ShotKind.Arrow });
      else if (r < 0.65) ev.blasts.push({ x: v.x, y: v.y, radius: 26, kind: BlastKind.Fireball });
      else if (r < 0.8) ev.hits.push({ unit: v.id, damage: 20, structure: -1 });
      else if (r < 0.9) ev.deaths.push({ unit: v.id, p: 1, kind: pick([Kind.Footman, Kind.Skeleton, Kind.Troll]), x: v.x, y: v.y, killer: 0, by: 0, platoon: 0 });
      else ev.heals.push({ from: clerics[0]!.id, to: a.id, amount: 10 });
    }
  }
  tick++;
  world.tick = tick;
  world.units = dummies.filter((d) => d.g.visible).map((d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y, p: d.p }));
  fx.onStep(ev, asWorld, { posOf, tints: TINTS, near: zoom >= 0.7, bounds: { contains: () => true } });
}

app.ticker.add(() => {
  const now = performance.now();
  const dt = now - last;
  last = now;
  while (now - tickStart >= TICK_MS) {
    tickStart += TICK_MS;
    stepTick();
  }
  const alpha = (now - tickStart) / TICK_MS;
  for (const d of dummies) {
    d.x = d.bx + (d.p === 1 ? Math.sin(now / 900 + d.id) * 10 : 0);
    d.y = d.by + (d.p === 1 ? Math.cos(now / 1100 + d.id) * 6 : 0);
    d.g.position.set(d.x, d.y);
  }
  const started = performance.now();
  fx.update(dt, tick - 1 + alpha, posOf, zoom, { contains: () => true });
  frameMs = frameMs * 0.9 + (performance.now() - started) * 0.1;
  fps = fps * 0.95 + (1000 / Math.max(1, dt)) * 0.05;
  const jx = (Math.random() - 0.5) * fx.shake * 10;
  const jy = (Math.random() - 0.5) * fx.shake * 10;
  scene.scale.set(zoom);
  scene.position.set(app.screen.width / 2 - cx * zoom + jx, app.screen.height / 2 - cy * zoom + jy);
  const c = fx.counts;
  hud.textContent = `scene ${hud.dataset.scene ?? ''}  fps ${fps.toFixed(0)}  fx ${frameMs.toFixed(2)} ms\nparticles ${c.particles}  projectiles ${c.projectiles}  decals ${c.decals}  corpses ${c.corpses}\n${cues.slice(-6).join('\n')}`;
});

(window as unknown as { fxLab: unknown }).fxLab = { fx, get frameMs() { return frameMs; }, get fps() { return fps; } };
