// The 3D fight playground. The fight is simulated in a Web Worker (src/sim), deterministic and
// free of three.js so a server could run it; this page only draws it, interpolating between the
// worker's 20 Hz snapshots, with every unit type drawn as one instanced crowd (src/crowd.ts).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { instance, template, type Pose } from './assets.ts';
import { CrowdType, crowdsReady, LOD_DISTANCE } from './crowd.ts';
import { ARMIES, BATTLES, armyInputs } from './sim/battles.ts';
import { CORPSE_TICKS, St, S_STRIDE, TICK_S, U_STRIDE, type SimInput, type Snapshot } from './sim/sim.ts';
import type { ToWorker } from './sim/sim.worker.ts';
import { inkWidth, lights, setBands, setInk, TEAMS } from './style.ts';
import { PACKS, UNITS } from './units.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);

// The Kevin Iglesias pack can't be redistributed, so it's only offered when unpacked locally.
const kevinHere = await fetch('/kevin/Textures/HumanAnimations_ColorPalette.png', { method: 'HEAD' })
  .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('image'))
  .catch(() => false);
const usable = (id: string) => kevinHere || !id.startsWith('kevin-');

// ---- Scene ----

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
const key = lights(scene);
// Crowds cast no shadow maps (each would need its own skinned depth pass); a blob under each soldier grounds it.
key.castShadow = false;
const hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;

function fieldTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7f8a4c';
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.globalAlpha = 0.35;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = ['#8f9656', '#6f7a40', '#9a9a5c', '#76803f'][i % 4]!;
    g.beginPath();
    g.arc(rnd() * 1024, rnd() * 1024, 4 + rnd() * 26, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: fieldTexture() }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const field = new THREE.Group();
scene.add(field);

// The near plane sets depth precision: at 0.5 a hull a few millimetres off its surface still resolves at 150 m.
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 3;
controls.maxDistance = 160;
function view(pitch: number, dist: number, x = 0): void {
  const p = THREE.MathUtils.degToRad(pitch);
  camera.position.set(x, Math.sin(p) * dist, Math.cos(p) * dist);
  controls.target.set(x, 0.8, 0);
  controls.update();
}
view(52, 60);
$('cam-game').onclick = () => view(52, 60);
$('cam-low').onclick = () => view(14, 26);
$('cam-top').onclick = () => view(85, 90);

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
  scene.fog = new THREE.Fog(v.bg, 120, 260);
}
setTod((q.get('tod') as keyof typeof TOD) ?? 'day');
$<HTMLSelectElement>('tod').onchange = (e) => setTod((e.target as HTMLSelectElement).value as keyof typeof TOD);
$<HTMLInputElement>('ink').onchange = (e) => setInk((e.target as HTMLInputElement).checked);
if (q.get('ink') === '0') setInk(false);
$<HTMLSelectElement>('bands').onchange = (e) => setBands(Number((e.target as HTMLSelectElement).value));

// ---- Instanced extras: base rings with blob shadows, health bars, missiles ----

const MAX = 6000;
/** A dark blob with the army's ring round it, lying on the ground: one draw for every soldier. */
const baseMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  vertexShader: `attribute vec3 aColor; varying vec2 vUv; varying vec3 vColor;
    void main() { vUv = uv; vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec2 vUv; varying vec3 vColor;
    void main() { float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard;
      float ring = smoothstep(0.74, 0.8, r) * (1.0 - smoothstep(0.94, 1.0, r));
      float blob = (1.0 - smoothstep(0.2, 0.85, r)) * 0.38;
      gl_FragColor = vec4(mix(vec3(0.07, 0.05, 0.03), vColor, ring), max(ring * 0.9, blob)); }`,
});
const baseGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const baseColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
baseGeo.setAttribute('aColor', baseColor);
const bases = new THREE.InstancedMesh(baseGeo, baseMat, MAX);
bases.frustumCulled = false;
bases.renderOrder = 1;
field.add(bases);

/** Health bars that face the camera, drawn only for the wounded. */
const barMat = new THREE.ShaderMaterial({
  depthTest: false,
  transparent: true,
  vertexShader: `attribute vec2 aBar; varying vec2 vUv; varying vec2 vBar;
    void main() { vUv = uv; vBar = aBar; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      c.xy += position.xy * vec2(0.9, 0.11) * (1.0 + -c.z * 0.012); gl_Position = projectionMatrix * c; }`,
  fragmentShader: `varying vec2 vUv; varying vec2 vBar;
    void main() { vec3 ink = vec3(0.13, 0.09, 0.06); vec3 col = vBar.y < 0.5 ? vec3(0.24, 0.39, 0.77) : vec3(0.78, 0.26, 0.17);
      bool edge = vUv.x < 0.04 || vUv.x > 0.96 || vUv.y < 0.25 || vUv.y > 0.75;
      gl_FragColor = vec4(edge || vUv.x > vBar.x ? ink : col, 0.92); }`,
});
const barGeo = new THREE.PlaneGeometry(1, 1);
const barData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
barGeo.setAttribute('aBar', barData);
const bars = new THREE.InstancedMesh(barGeo, barMat, MAX);
bars.frustumCulled = false;
bars.renderOrder = 20;
field.add(bars);

const arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.04, 0.75), new THREE.MeshBasicMaterial({ color: 0x5a3d22 }), 4000);
const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1000);
for (const m of [arrows, orbs]) {
  m.frustumCulled = false;
  m.count = 0;
  field.add(m);
}
const ORB_COLORS = [new THREE.Color(0x8a6418), new THREE.Color(0xff9a3c), new THREE.Color(0x9ad8ff)];

// ---- The simulation, in a worker ----

const worker = new Worker(new URL('./sim/sim.worker.ts', import.meta.url), { type: 'module' });
const post = (m: ToWorker) => worker.postMessage(m);
post({ kind: 'init', types: BATTLES.types, seed: Number(q.get('seed') ?? 7) });
let speed = 1;
let prev: Snapshot | null = null;
let cur: Snapshot | null = null;
let curAt = 0;
let prevIndex = new Map<number, number>();
let simMs = 0;
let sum = 0;
const log: SimInput[] = [];
worker.onmessage = (e) => {
  const m = e.data;
  if (m.kind === 'snap') {
    prev = cur;
    cur = m.snap as Snapshot;
    curAt = performance.now();
    simMs = m.simMs;
    sum = m.sum;
    prevIndex = new Map();
    if (prev) for (let i = 0; i < prev.units.length; i += U_STRIDE) prevIndex.set(prev.units[i]!, i);
    for (let i = 0; i < cur.units.length; i += U_STRIDE) want(cur.units[i + 1]!);
  } else if (m.kind === 'logged') log.push(m.input);
  else if (m.kind === 'bench') console.log(`bench: ${m.ms.toFixed(2)} ms/tick over ${m.ticks} ticks`);
};
const send = (input: SimInput) => post({ kind: 'input', input });

// ---- Crowds, built per unit type the first time one appears ----

const crowds = new Map<number, CrowdType>();
const building = new Set<number>();
function want(type: number): void {
  if (crowds.has(type) || building.has(type)) return;
  building.add(type);
  Promise.all([template(UNITS[type]!), crowdsReady])
    .then(([t]) => crowds.set(type, new CrowdType(t, MAX, field)))
    .catch((err) => console.error(UNITS[type]!.id, err))
    .finally(() => building.delete(type));
}

// ---- Battles and muster ----

const size = () => Number(q.get('size') ?? $<HTMLSelectElement>('size').value);
function battle(name: string): void {
  send({ tick: 0, kind: 'clear' });
  const [a, b] = ARMIES[name]!;
  for (const i of [...armyInputs(a.filter(([id]) => usable(id)), 0, size(), 0), ...armyInputs(b.filter(([id]) => usable(id)), 1, size(), 0)]) send(i);
  inspect(null);
}
function parade(): void {
  send({ tick: 0, kind: 'clear' });
  const list = UNITS.map((d, i) => [d, i] as const).filter(([d]) => usable(d.id));
  const radius = (type: number) => BATTLES.types[type]!.radius;
  let z = -list.reduce((a, [, type]) => a + radius(type) * 2 + 0.8, 0) / 2;
  for (const [, type] of list) {
    z += radius(type) + 0.4;
    send({ tick: 0, kind: 'muster', side: 0, type, count: 1, files: 1, x: 0, z });
    z += radius(type) + 0.4;
  }
  controls.target.set(0, 1, 0);
  camera.position.set(28, 4, 0);
  controls.update();
}
for (const name of [...Object.keys(ARMIES), 'parade']) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => (name === 'parade' ? parade() : battle(name));
  $('presets').append(b);
}

const count = () => Number($<HTMLSelectElement>('count').value);
for (const [name, defs] of PACKS) {
  const shown = defs.filter((d) => usable(d.id));
  if (!shown.length) continue;
  const h = document.createElement('h3');
  h.textContent = name;
  $('units').append(h);
  for (const d of shown) {
    const type = UNITS.indexOf(d);
    const row = document.createElement('div');
    row.className = 'unit';
    row.innerHTML = `<span title="${d.pack}">${d.name}</span><button class="blue">+ blue</button><button class="red">+ red</button>`;
    const [b, r] = row.querySelectorAll('button');
    const add = (side: 0 | 1) => {
      const n = count();
      send({ tick: 0, kind: 'muster', side, type, count: n, files: Math.max(1, Math.round(Math.sqrt(n * 3))), x: (side === 0 ? -1 : 1) * (12 + Math.random() * 8), z: (Math.random() - 0.5) * 30 });
    };
    b!.onclick = () => add(0);
    r!.onclick = () => add(1);
    $('units').append(row);
  }
}

let paused = false;
$<HTMLInputElement>('speed').oninput = (e) => {
  speed = Number((e.target as HTMLInputElement).value);
  post({ kind: 'speed', speed: paused ? 0 : speed });
};
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? 'fight' : 'pause';
  post({ kind: 'speed', speed: paused ? 0 : speed });
};
$('clear').onclick = () => send({ tick: 0, kind: 'clear' });

// ---- Inspect: click a soldier for its stats, and a full-detail model viewer with every clip ----

let picked = 0;
const viewer = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 280;
  c.style.cssText = 'display:block;width:280px;height:280px;margin-top:6px;background:#1b2333';
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true });
  const s = new THREE.Scene();
  lights(s).castShadow = false;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  let model: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  const clock = new THREE.Clock();
  const loop = () => {
    if (model && picked) {
      mixer!.update(clock.getDelta());
      model.rotation.y += 0.005;
      r.render(s, cam);
    }
    requestAnimationFrame(loop);
  };
  loop();
  return {
    canvas: c,
    async show(type: number, holder: HTMLElement) {
      const t = await template(UNITS[type]!);
      if (model) s.remove(model);
      model = instance(t);
      t.def.team?.(model, new THREE.Color().setHex(TEAMS[0]!, THREE.SRGBColorSpace));
      s.add(model);
      mixer = new THREE.AnimationMixer(model);
      const h = t.def.height + (t.def.stats.fly ?? 0);
      cam.position.set(0, h * 0.6, h * 2.6);
      cam.lookAt(0, h * 0.5, 0);
      const play = (clip: THREE.AnimationClip) => {
        mixer!.stopAllAction();
        mixer!.clipAction(clip).play();
      };
      play(t.clips.get('idle')![0]!);
      holder.replaceChildren(
        ...t.all.map((clip) => {
          const b = document.createElement('button');
          b.textContent = clip.name.replace(/^.*\|/, '');
          b.onclick = () => play(clip);
          return b;
        }),
      );
    },
  };
})();

function inspect(id: number | null, type?: number): void {
  picked = id ?? 0;
  const el = $('inspect');
  el.hidden = !id;
  if (!id || type === undefined) return;
  const d = UNITS[type]!;
  el.innerHTML = `<h2>${d.name}</h2><div>${d.pack}</div><div id="ihp"></div><h3>Model (every clip it has)</h3><div class="clips"></div><div class="row"><button id="close">close</button></div>`;
  el.insertBefore(viewer.canvas, el.querySelector('h3'));
  void viewer.show(type, el.querySelector('.clips')!);
  el.querySelector<HTMLButtonElement>('#close')!.onclick = () => inspect(null);
}

const ray = new THREE.Raycaster();
let down = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!cur || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  let best: [number, number] | null = null;
  let bd = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < cur.units.length; i += U_STRIDE) {
    if (cur.units[i + 8] === St.Dead) continue;
    const d = UNITS[cur.units[i + 1]!]!;
    p.set(cur.units[i + 3]!, (d.stats.fly ?? 0) + d.height / 2, cur.units[i + 4]!);
    const dist = ray.ray.distanceSqToPoint(p);
    if (dist < Math.max(0.5, BATTLES.types[cur.units[i + 1]!]!.radius) ** 2 && dist < bd) {
      bd = dist;
      best = [cur.units[i]!, cur.units[i + 1]!];
    }
  }
  inspect(best?.[0] ?? null, best?.[1]);
});

// ---- Drawing a frame ----

interface Memory {
  key: number;
  row: number;
  fromRow: number;
  fadeAt: number;
  yaw: number;
}
const memory = new Map<number, Memory>();
const FADE_MS = 160;
const POSE_OF: Pose[] = ['idle', 'walk', 'attack', 'hit', 'die'];
const pigments = TEAMS.map((c) => new THREE.Color().setHex(c, THREE.SRGBColorSpace));
const corpse = new THREE.Color(0x3a3020);
const mat = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const quat = new THREE.Quaternion();
const noTurn = new THREE.Quaternion();
const one = new THREE.Vector3(1, 1, 1);
const up = new THREE.Vector3(0, 1, 0);
const counts = new Map<number, number[]>();
const eye = new THREE.Vector3();
let lodOn = q.get('lod') !== '0';
$<HTMLInputElement>('lod').checked = lodOn;
$<HTMLInputElement>('lod').onchange = (e) => (lodOn = (e.target as HTMLInputElement).checked);

function draw(now: number): void {
  if (!cur) return;
  const tickMs = (TICK_S * 1000) / Math.max(0.05, speed);
  const alpha = paused ? 1 : Math.min(1, (now - curAt) / tickMs);
  // The sim time on show, in ticks (cur.tick is the next tick to run).
  const at = cur.tick - 1 + alpha;
  counts.clear();
  eye.copy(camera.position);
  const far2 = LOD_DISTANCE * LOD_DISTANCE;
  let nb = 0;
  let nbar = 0;
  const U = cur.units;
  const P = prev?.units;
  for (let i = 0; i < U.length; i += U_STRIDE) {
    const id = U[i]!;
    const type = U[i + 1]!;
    const side = U[i + 2]!;
    const def = UNITS[type]!;
    let x = U[i + 3]!;
    let z = U[i + 4]!;
    const pi = prevIndex.get(id);
    if (P && pi !== undefined) {
      x = P[pi + 3]! + (x - P[pi + 3]!) * alpha;
      z = P[pi + 4]! + (z - P[pi + 4]!) * alpha;
    }
    const st = U[i + 8]! as St;
    const since = Math.max(0, (at - U[i + 9]!) * TICK_S);
    const variant = U[i + 10]!;
    // Base ring and blob, even before the crowd's art is ready.
    const r = BATTLES.types[type]!.radius * 2.2;
    mat.compose(pos.set(x, 0.01, z), noTurn, scl.set(r, 1, r));
    bases.setMatrixAt(nb, mat);
    const pc = st === St.Dead ? corpse : pigments[side]!;
    baseColor.setXYZ(nb++, pc.r, pc.g, pc.b);
    const crowd = crowds.get(type);
    if (!crowd) continue;
    const pose = POSE_OF[st]!;
    let row: number;
    if (st === St.Attack) row = crowd.row('attack', variant, (since / BATTLES.types[type]!.swing) * crowd.duration('attack', variant), false);
    else row = crowd.row(pose, 0, since * (def.rate?.[pose] ?? 1), st === St.Idle || st === St.Walk);
    const key = st * 16 + variant;
    let m = memory.get(id);
    if (!m) memory.set(id, (m = { key, row, fromRow: row, fadeAt: -1e9, yaw: Math.atan2(U[i + 5]!, U[i + 6]!) }));
    if (m.key !== key) {
      m.fromRow = m.row;
      m.fadeAt = now;
      m.key = key;
    }
    m.row = row;
    const blend = Math.max(0, 1 - (now - m.fadeAt) / FADE_MS);
    if (st !== St.Dead) {
      // Turn smoothly toward the sim's facing.
      let d = Math.atan2(U[i + 5]!, U[i + 6]!) - m.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.yaw += d * 0.2;
    }
    let y = def.stats.fly ? def.stats.fly + Math.sin(now / 600 + id) * 0.15 : 0;
    if (st === St.Dead) {
      y = def.stats.fly ? Math.max(0, def.stats.fly * (1 - since / 0.8)) : 0;
      const sink = since - (CORPSE_TICKS * TICK_S - 1.5);
      if (sink > 0) y -= (sink / 1.5) * def.height * 0.7;
    }
    mat.compose(pos.set(x, y, z), quat.setFromAxisAngle(up, m.yaw), one);
    const c = counts.get(type) ?? counts.set(type, [0, 0]).get(type)!;
    const dx = x - eye.x;
    const dy = y - eye.y;
    const dz = z - eye.z;
    const level = lodOn && dx * dx + dy * dy + dz * dz > far2 ? 1 : 0;
    crowd.set(level, c[level]!++, mat, row, m.fromRow, blend, pigments[side]!);
    const hp = U[i + 7]!;
    if (st !== St.Dead && hp < 0.999) {
      mat.makeTranslation(x, y + def.height + 0.35, z);
      bars.setMatrixAt(nbar, mat);
      barData.setXY(nbar++, hp, side);
    }
    if (id === picked) $('ihp').textContent = `hp ${Math.ceil(hp * def.stats.hp)} / ${def.stats.hp} · ${pose}`;
  }
  for (const [type, crowd] of crowds) crowd.commit(counts.get(type) ?? [0, 0]);
  if (memory.size > U.length / U_STRIDE + 500) {
    const live = new Set<number>();
    for (let i = 0; i < U.length; i += U_STRIDE) live.add(U[i]!);
    for (const id of memory.keys()) if (!live.has(id)) memory.delete(id);
  }
  bases.count = nb;
  bases.instanceMatrix.needsUpdate = true;
  baseColor.needsUpdate = true;
  bars.count = nbar;
  bars.instanceMatrix.needsUpdate = true;
  barData.needsUpdate = true;
  drawShots(at);
}

const target = new THREE.Vector3();
const from = new THREE.Vector3();
const ahead = new THREE.Vector3();
const shotIndex = new Map<number, number>();
function drawShots(at: number): void {
  let na = 0;
  let no = 0;
  const S = cur!.shots;
  const U = cur!.units;
  shotIndex.clear();
  if (S.length) for (let i = 0; i < U.length; i += U_STRIDE) shotIndex.set(U[i]!, i);
  for (let i = 0; i < S.length; i += S_STRIDE) {
    const kind = S[i + 1]!;
    const ti = shotIndex.get(S[i + 5]!);
    if (ti === undefined) continue;
    const td = UNITS[U[ti + 1]!]!;
    from.set(S[i + 2]!, S[i + 3]!, S[i + 4]!);
    target.set(U[ti + 3]!, (td.stats.fly ?? 0) + td.height * 0.55, U[ti + 4]!);
    const t = Math.min(1, Math.max(0, (at - S[i + 6]!) / (S[i + 7]! - S[i + 6]!)));
    const arc = kind === 0 ? from.distanceTo(target) * 0.15 : 0.3;
    pos.lerpVectors(from, target, t);
    pos.y += Math.sin(t * Math.PI) * arc;
    if (kind === 0) {
      const t2 = Math.min(1, t + 0.02);
      ahead.lerpVectors(from, target, t2);
      ahead.y += Math.sin(t2 * Math.PI) * arc;
      mat.lookAt(ahead, pos, up).setPosition(pos);
      arrows.setMatrixAt(na++, mat);
    } else {
      mat.makeTranslation(pos.x, pos.y, pos.z);
      orbs.setMatrixAt(no, mat);
      orbs.setColorAt(no++, ORB_COLORS[kind]!);
    }
  }
  arrows.count = na;
  orbs.count = no;
  arrows.instanceMatrix.needsUpdate = true;
  orbs.instanceMatrix.needsUpdate = true;
  if (orbs.instanceColor) orbs.instanceColor.needsUpdate = true;
}

// ---- Loop and measurements ----

let frames = 0;
let fpsAt = performance.now();
let cpu = 0;
/** Main-thread time interpolating and writing instances, before the draw calls are issued. */
let js = 0;
function tick(now: number): void {
  const w = innerWidth;
  const h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const t0 = performance.now();
  controls.update();
  const dist = camera.position.distanceTo(controls.target);
  inkWidth.value = (Number($<HTMLInputElement>('inkw').value) * 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
  draw(now);
  const t1 = performance.now();
  renderer.render(scene, camera);
  // CPU time on the main thread for this frame: interpolation, instance writes and issuing draws.
  js = js * 0.9 + (t1 - t0) * 0.1;
  cpu = cpu * 0.9 + (performance.now() - t0) * 0.1;
  frames++;
  if (now - fpsAt > 1000) {
    const fps = (frames * 1000) / (now - fpsAt);
    frames = 0;
    fpsAt = now;
    const info = renderer.info.render;
    const stats = { fps: +fps.toFixed(1), jsMs: +js.toFixed(2), cpuMs: +cpu.toFixed(2), near: [...crowds.values()].reduce((a, c) => a + c.levels[0]!.count, 0), simMs: +simMs.toFixed(2), calls: info.calls, tris: info.triangles, blue: cur?.alive[0] ?? 0, red: cur?.alive[1] ?? 0, tick: cur?.tick ?? 0, checksum: sum.toString(16) };
    $('tally').innerHTML = `blue ${stats.blue} · red ${stats.red}<br>${stats.fps} fps · update ${stats.jsMs} ms · frame ${stats.cpuMs} ms<br>sim ${stats.simMs} ms/tick (worker)<br>${stats.calls} draws · ${(stats.tris / 1e6).toFixed(2)}M tris<br>${stats.near} soldiers in full detail<br>tick ${stats.tick} · ${stats.checksum}`;
    (window as unknown as { stats: unknown }).stats = stats;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

if (q.get('preset') === 'parade') parade();
else battle(q.get('preset') ?? 'men vs monsters');
if (q.has('paused')) $('pause').click();
if (q.get('cam') === 'low') view(12, Number(q.get('dist') ?? 26), Number(q.get('x') ?? 0));
(window as unknown as { pg: unknown }).pg = { renderer, scene, camera, controls, view, crowds, log, battle, post };
