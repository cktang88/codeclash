// The 3D fight playground: muster units from free animation packs onto a field and let them fight.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { template, type UnitDef } from './assets.ts';
import { Battle, type Fighter } from './battle.ts';
import { KAYKIT } from './packs/kaykit.ts';
import { KEVIN } from './packs/kevin.ts';
import { QUATERNIUS } from './packs/quaternius.ts';
import { inkWidth, lights, setBands, setInk } from './style.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);

// The Kevin Iglesias pack can't be redistributed, so it's only offered when it has been unpacked locally.
const kevinHere = await fetch('/kevin/Textures/HumanAnimations_ColorPalette.png', { method: 'HEAD' })
  .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image'))
  .catch(() => false);
const PACKS: [string, UnitDef[]][] = [
  ['KayKit (CC0)', KAYKIT],
  ['Quaternius (CC0)', QUATERNIUS],
  ...(kevinHere ? ([['Kevin Iglesias (local only)', KEVIN]] as [string, UnitDef[]][]) : []),
];
const ALL = PACKS.flatMap(([, d]) => d);
const byId = (id: string) => ALL.find((d) => d.id === id)!;

// ---- Scene ----

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const key = lights(scene);
const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;

/** A painted field: grass pigment with mottling, worn earth down the middle where the lines meet. */
function fieldTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7f8a4c';
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = ['#8f9656', '#6f7a40', '#9a9a5c', '#76803f'][i % 4]!;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(rnd() * 1024, rnd() * 1024, 4 + rnd() * 26, 0, Math.PI * 2);
    g.fill();
  }
  const mid = g.createLinearGradient(380, 0, 644, 0);
  mid.addColorStop(0, 'rgba(154,122,78,0)');
  mid.addColorStop(0.5, 'rgba(154,122,78,0.5)');
  mid.addColorStop(1, 'rgba(154,122,78,0)');
  g.globalAlpha = 1;
  g.fillStyle = mid;
  g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ map: fieldTexture() }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const battle = new Battle();
scene.add(battle.group);
battle.group.traverse((o) => (o.castShadow = true));

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
function view(pitch: number, dist: number): void {
  const p = THREE.MathUtils.degToRad(pitch);
  camera.position.set(0, Math.sin(p) * dist, Math.cos(p) * dist);
  controls.target.set(0, 0.8, 0);
  controls.update();
}
view(52, 40);
$('cam-game').onclick = () => view(52, 40);
$('cam-low').onclick = () => view(14, 22);
$('cam-top').onclick = () => view(85, 45);

// ---- Look ----

const TOD = {
  day: { key: [0xfff0d2, 2.4], hemi: [0xfff2da, 0x2c3a5a, 1.1], bg: 0x8fa3b8 },
  dusk: { key: [0xffa860, 1.9], hemi: [0xd9a07a, 0x2a2a52, 0.8], bg: 0x5a4a5e },
  night: { key: [0x8fa8ff, 0.7], hemi: [0x4a5a8a, 0x12161f, 0.55], bg: 0x12161f },
} as const;
function setTod(t: keyof typeof TOD): void {
  const v = TOD[t];
  key.color.setHex(v.key[0]);
  key.intensity = v.key[1];
  hemi.color.setHex(v.hemi[0]);
  hemi.groundColor.setHex(v.hemi[1]);
  hemi.intensity = v.hemi[2];
  scene.background = new THREE.Color(v.bg);
  scene.fog = new THREE.Fog(v.bg, 60, 120);
}
setTod((q.get('tod') as keyof typeof TOD) ?? 'day');
$<HTMLSelectElement>('tod').onchange = (e) => setTod((e.target as HTMLSelectElement).value as keyof typeof TOD);
$<HTMLInputElement>('ink').onchange = (e) => setInk((e.target as HTMLInputElement).checked);
$<HTMLSelectElement>('bands').onchange = (e) => setBands(Number((e.target as HTMLSelectElement).value));

// ---- Roster and battles ----

let busy = Promise.resolve();
/** Spawns serially, so a click while a pack loads queues behind it rather than racing. */
function enqueue(f: () => Promise<void>): void {
  busy = busy.then(f).catch((e) => console.error(e)).then(() => shadows());
}
function shadows(): void {
  battle.group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.hull) o.castShadow = true;
  });
}

const count = () => Number($<HTMLSelectElement>('count').value);
const units = $('units');
for (const [name, defs] of PACKS) {
  const h = document.createElement('h3');
  h.textContent = name;
  units.append(h);
  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'unit';
    row.innerHTML = `<span title="${d.pack}">${d.name}</span><button class="blue">+ blue</button><button class="red">+ red</button>`;
    const [b, r] = row.querySelectorAll('button');
    b!.onclick = () => enqueue(() => battle.muster(d, 0, count()));
    r!.onclick = () => enqueue(() => battle.muster(d, 1, count()));
    units.append(row);
  }
}

type Army = [string, number][];
const PRESETS: Record<string, [Army, Army]> = {
  'line battle': [
    [['kaykit-knight', 6], ['kaykit-ranger', 4], ['kaykit-mage', 2], ['kaykit-champion', 1]],
    [['kaykit-barbarian', 5], ['quat-warrior', 4], ['quat-ranger', 3], ['quat-cleric', 2]],
  ],
  'monsters vs men': [
    [['kaykit-knight', 8], ['kaykit-ranger', 5], ['kaykit-mage', 2], ['kaykit-champion', 2]],
    [['own-troll', 2], ['own-golem', 1], ['kaykit-skeleton', 8], ['kaykit-skeleton-mage', 3], ['quat-bat', 4]],
  ],
  'dragon raid': [
    [['kaykit-knight', 6], ['kaykit-ranger', 8], ['kaykit-mage', 3]],
    [['quat-dragon', 1], ['quat-bat', 6]],
  ],
  'undead horde': [
    [['kaykit-champion', 2], ['kaykit-knight', 4], ['quat-cleric', 3]],
    [['kaykit-skeleton', 10], ['kaykit-minion', 10], ['quat-skeleton', 6], ['kaykit-skeleton-mage', 4], ['own-golem', 1]],
  ],
  'one of each': [ALL.filter((_, i) => i % 2 === 0).map((d) => [d.id, 1]), ALL.filter((_, i) => i % 2 === 1).map((d) => [d.id, 1])],
};
if (kevinHere) PRESETS['kevin vs kaykit'] = [KEVIN.map((d) => [d.id, 2]), [['kaykit-knight', 4], ['kaykit-barbarian', 4], ['kaykit-ranger', 3], ['own-troll', 1]]];

/** Every unit in a row facing the camera, side by side, for looking rather than fighting. */
function parade(): void {
  battle.clear();
  inspect(null);
  enqueue(async () => {
    let x = -ALL.reduce((a, d) => a + d.stats.radius * 2 + 0.6, 0) / 2;
    for (const d of ALL) {
      x += d.stats.radius + 0.3;
      const f = await battle.spawn(d, x < 0 ? 0 : 1, new THREE.Vector3(x, 0, 0));
      f.root.rotation.y = 0.35;
      f.state = 'puppet';
      x += d.stats.radius + 0.3;
    }
  });
}

function preset(name: string): void {
  if (name === 'parade') return parade();
  battle.clear();
  inspect(null);
  enqueue(async () => {
    const [a, b] = PRESETS[name]!;
    // Warm the templates first so both sides appear together.
    await Promise.all([...a, ...b].map(([id]) => template(byId(id))));
    for (const [side, army] of [[0, a], [1, b]] as const) for (const [rank, [id, n]] of army.entries()) await battle.muster(byId(id), side, n, rank);
  });
}
for (const name of [...Object.keys(PRESETS), 'parade']) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => preset(name);
  $('presets').append(b);
}

let paused = false;
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? 'fight' : 'pause';
};
$('clear').onclick = () => {
  battle.clear();
  inspect(null);
};
$<HTMLInputElement>('speed').oninput = (e) => (battle.speed = Number((e.target as HTMLInputElement).value));

// ---- Inspector: click a soldier to see its pack and play any of its clips. ----

let picked: Fighter | null = null;
function inspect(f: Fighter | null): void {
  picked?.release();
  picked = f;
  const el = $('inspect');
  el.hidden = !f;
  if (!f) return;
  el.innerHTML = `<h2>${f.def.name}</h2><div>${f.def.pack}</div><div id="ihp"></div><h3>Clips (click to play; release resumes the fight)</h3><div class="clips"></div><div class="row"><button id="release">release</button><button id="close">close</button></div>`;
  const clips = el.querySelector('.clips')!;
  for (const c of f.tpl.all) {
    const b = document.createElement('button');
    b.textContent = c.name.replace(/^.*\|/, '');
    b.onclick = () => f.puppet(c.name);
    clips.append(b);
  }
  el.querySelector<HTMLButtonElement>('#release')!.onclick = () => f.release();
  el.querySelector<HTMLButtonElement>('#close')!.onclick = () => inspect(null);
}
const ray = new THREE.Raycaster();
let down = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  // Pick by distance to each soldier's upright axis: cheaper and kinder than skinned-mesh hits.
  let best: Fighter | null = null;
  let bd = Infinity;
  for (const f of battle.fighters) {
    if (!f.alive) continue;
    const mid = f.pos.clone().setY((f.def.stats.fly ?? 0) + f.height / 2);
    const d = ray.ray.distanceSqToPoint(mid);
    if (d < Math.max(0.6, f.def.stats.radius) ** 2 && d < bd) {
      bd = d;
      best = f;
    }
  }
  inspect(best);
});

// ---- Loop ----

const clock = new THREE.Clock();
let frames = 0;
let fpsAt = 0;
let fps = 0;
function tick(): void {
  const dt = Math.min(0.05, clock.getDelta());
  const w = innerWidth;
  const h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  controls.update();
  // Keep the ink near a constant pixel width at the focus.
  const dist = camera.position.distanceTo(controls.target);
  inkWidth.value = (Number($<HTMLInputElement>('inkw').value) * 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
  if (!paused) battle.update(dt, camera);
  else for (const f of battle.fighters) if (f.state === 'puppet') f.mixer.update(dt);
  renderer.render(scene, camera);
  frames++;
  if (clock.elapsedTime - fpsAt > 1) {
    fps = frames / (clock.elapsedTime - fpsAt);
    frames = 0;
    fpsAt = clock.elapsedTime;
    const alive = [0, 1].map((s) => battle.fighters.filter((f) => f.side === s && f.alive).length);
    $('tally').textContent = `blue ${alive[0]} · red ${alive[1]} · ${fps.toFixed(0)} fps`;
    if (picked) $('ihp').textContent = `hp ${Math.ceil(picked.hp)} / ${picked.def.stats.hp} · ${picked.state}`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
preset(q.get('preset') ?? 'line battle');
if (q.get('cam') === 'low') view(14, 22);
if (q.get('cam') === 'parade') view(8, Number(q.get('dist') ?? 42));
if (q.has('paused')) $('pause').click();
(window as unknown as { pg: unknown }).pg = { battle, preset, camera, controls, view };
