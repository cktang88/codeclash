// Perf and screenshot harness for the battle renderer.
//   /battle-perf.html?men=20000&per=2500&seed=3&t=0&speed=1&zoom=1&pause=0&sync=0&cx=&cy=&stances=0&morale=0&hud=1&scan=1&art=classic|hd
//     &fa=templar&fb=undead (either side's faction) &frames=N (stop after N draws: a still for screenshot diffs)
// `per` pads each side to that many figures with clones of the simulated ones (the sim caps a
// side at MAX_FIGURES), so the renderer can be measured at crowd sizes the sim doesn't make.
// `t` fast-forwards to that tick first; `sync=1` waits for the GPU after each draw so the
// measured time covers the whole frame.

import { Battle, TICK_S, type Soldier } from '../game/battle.ts';
import { demoSetup } from './demo.ts';
import type { FactionId } from '../game/factions.ts';
import { BattleScene } from './render/scene.ts';
import { artMode, setArtMode, type ArtMode } from './settings.ts';
import { hdMemory } from './render/sprites128.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const real = new Battle(demoSetup(num('seed', 3), num('men', 20000), [q.get('fa') as FactionId | null, q.get('fb') as FactionId | null]));
const per = num('per', 0);
// Until the sim sets Regiment.stance, `stances=1` fakes one per class to exercise the renderer.
if (q.get('stances') === '1') {
  const byCls = ['shieldwall', 'pikewall', 'loose', 'line', 'braced', 'line', 'loose', 'wedge', 'column', 'line'];
  for (const r of real.regiments) (r as unknown as { stance: string }).stance = byCls[r.cls] ?? 'line';
}

interface Clone {
  c: Soldier;
  src: Soldier;
  dx: number;
  dy: number;
}
const clones: Clone[] = [];
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
for (const team of [0, 1]) {
  const mine = real.soldiers.filter((s) => s.team === team);
  for (let k = mine.length; k < per; k++) {
    const src = mine[k % mine.length]!;
    clones.push({ c: { ...src } as Soldier, src, dx: (rnd() - 0.5) * 8, dy: (rnd() - 0.5) * 8 });
  }
}
const sync = () => {
  for (const { c, src, dx, dy } of clones) {
    c.x = src.x + dx;
    c.y = src.y + dy;
    c.vx = src.vx;
    c.vy = src.vy;
    c.hp = src.hp;
    c.state = src.state;
    c.actedAt = src.actedAt;
    c.diedAt = src.diedAt;
    c.target = src.target;
  }
};
sync();
// The scene sees the real battle with the clones appended.
const view = Object.create(real) as Battle;
Object.defineProperty(view, 'soldiers', { value: [...real.soldiers, ...clones.map((k) => k.c)] });

// Until the sim sets Regiment.moraleState/morale, `morale=1` fakes them from morale and rout.
const fakeMorale = q.get('morale') === '1';
const moraleTick = () => {
  if (!fakeMorale) return;
  for (const r of real.regiments) {
    const x = r as unknown as { moraleState: string; morale: number };
    x.moraleState = r.routed ? 'broken' : r.id % 4 === 1 ? 'wavering' : r.id % 4 === 3 ? 'rallying' : 'steady';
    x.morale = r.routed ? 5 : r.id % 4 === 1 ? 28 : r.id % 4 === 3 ? 45 : 80;
  }
};
moraleTick();
const art: ArtMode = q.get('art') === 'hd' ? 'hd' : q.get('art') === 'classic' ? 'classic' : artMode();
const scene = new BattleScene(view, art);
// The art toggle: classic 48 px sprites or HD (up to 128 px), saved like the game's setting.
const toggle = document.getElementById('art') as HTMLButtonElement | null;
if (toggle) {
  toggle.textContent = `art: ${art === 'hd' ? 'HD 128' : 'classic 48'} (switch)`;
  toggle.onclick = () => {
    const next: ArtMode = art === 'hd' ? 'classic' : 'hd';
    setArtMode(next);
    q.set('art', next);
    location.search = q.toString();
  };
  if (q.get('hud') === '0') toggle.style.display = 'none';
}
const step = () => {
  scene.snapshot();
  real.step();
  sync();
  moraleTick();
  scene.afterStep();
};

scene.camera.zoom = num('zoom', 1);
if (q.has('cx')) scene.camera.cx = num('cx', 0);
if (q.has('cy')) scene.camera.cy = num('cy', 0);
scene.scanlines = q.get('scan') !== '0';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const stats = document.getElementById('stats')!;
const resize = () => {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
};
resize();
addEventListener('resize', resize);

const target = num('t', 0);
for (let i = 0; i < target && !real.done(); i++) step();

// `focus=1`: centre the view on the thick of the fighting once fast-forwarded (screenshots);
// `focus=cls:N[:team]` on soldiers of class N (of that side) shooting, fighting or on the move.
const focus = q.get('focus');
if (focus === '1' || focus?.startsWith('cls:')) {
  const [, c, t] = focus.split(':');
  const cls = focus.startsWith('cls:') ? Number(c) : -1;
  const side = t === undefined ? -1 : Number(t);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const s of real.soldiers)
    if (s.state === 0 && (cls < 0 ? real.tick - s.actedAt < 20 : s.cls === cls && (side < 0 || s.team === side) && (real.tick - s.actedAt < 30 || s.vx * s.vx + s.vy * s.vy > 100))) {
      sx += s.x;
      sy += s.y;
      n++;
    }
  if (n > 0) {
    scene.camera.cx = sx / n + num('dx', 0);
    scene.camera.cy = sy / n + num('dy', 0);
  }
}

const speed = num('speed', 1);
const pause = q.get('pause') === '1';
const finish = q.get('sync') === '1';
let acc = 0;
let last = performance.now();
const draws: number[] = [];
const frames: number[] = [];
const builds: number[] = [];
const perf = { frames: 0, buildMs: 0, drawMs: 0, drawP95: 0, fps: 0, figures: view.soldiers.length, tick: 0, buffer: '' };
const stopAfter = num('frames', 0);
const warmUntil = q.has('warm') ? performance.now() + num('warm', 0) : 0;
const w = window as unknown as { __perf: typeof perf; __scene: BattleScene; __step: (n: number) => void; __done?: boolean };
w.__perf = perf;
w.__scene = scene;
w.__step = (n) => {
  for (let i = 0; i < n && !real.done(); i++) step();
};

let gl: WebGL2RenderingContext | null = null;
const px1 = new Uint8Array(4);
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  frames.push(now - last);
  last = now;
  if (!pause && !real.done()) {
    acc += dt * speed;
    while (acc >= TICK_S) {
      step();
      acc -= TICK_S;
    }
  }
  const t0 = performance.now();
  // `warm=ms` (paused stills): hold the effects still (dt 0) while the HD sheets paint, then run.
  const warming = warmUntil > 0 && now < warmUntil;
  scene.draw(canvas, pause ? 1 : Math.min(1, acc / TICK_S), warming ? 0 : pause ? 1 / 60 : dt);
  if (finish) {
    // finish() alone may return before a software rasteriser has drawn: reading a pixel back can't.
    gl ??= canvas.getContext('webgl2');
    gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
  }
  draws.push(performance.now() - t0);
  builds.push(scene.lastBuildMs);
  if (builds.length > 120) builds.shift();
  perf.buildMs = builds.reduce((a, b) => a + b, 0) / builds.length;
  if (draws.length > 120) draws.shift();
  if (frames.length > 120) frames.shift();
  const sorted = [...draws].sort((a, b) => a - b);
  if (!warming) perf.frames++;
  perf.drawMs = draws.reduce((a, b) => a + b, 0) / draws.length;
  perf.drawP95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  perf.fps = 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length);
  perf.tick = real.tick;
  perf.buffer = `${canvas.width}x${canvas.height} px=${scene.pixelScale(canvas.width, canvas.height)} art=${scene.art} zoom=${scene.camera.zoom}${scene.art === 'hd' ? ` hd-sheets=${hdMemory().sheets} ${(hdMemory().bytes / 1048576).toFixed(0)}MB js, gpu ${(scene.spriteGpuBytes / 1048576).toFixed(0)}MB` : ''}`;
  if (q.get('hud') !== '0') {
    const alive = view.soldiers.filter((s) => s.state < 2).length;
    stats.textContent = `figures ${view.soldiers.length} (alive ${alive})  tick ${real.tick}\ndraw ${perf.drawMs.toFixed(2)} ms (p95 ${perf.drawP95.toFixed(2)})  fps ${perf.fps.toFixed(1)}\n${perf.buffer}${scene.error ? '\n' + scene.error : ''}`;
  } else stats.style.display = 'none';
  if (stopAfter > 0 && perf.frames >= stopAfter) {
    w.__done = true;
    return;
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
