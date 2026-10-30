// Experiment: free 3D animation packs as the source of unit art. Open /anim-lab.html in the dev server.
// Loads Kevin Iglesias' "Human Melee Animations FREE" (FBX, see docs/anim-lab.md for the download),
// paints its mannequin in the codex palette with toon bands and an inverted-hull ink line, plays a
// live skirmish, and bakes each kind's poses into sprite cells beside the procedural art
// (render/art) so the two can be judged at battlefield size.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Kind } from '../sim/api.ts';
import { STATS } from '../sim/stats.ts';
import { bakeKindPages, cellPx, domCanvas, type KindBake } from './render/art/bake.ts';
import { CELLS, type PoseName } from './render/art/units.ts';

const BASE = '/lab/kevin/';
const POSES: PoseName[] = ['idle', 'walk', 'attack', 'die'];
const GAME_FRAMES: Record<PoseName, number> = { idle: 4, walk: 6, attack: 4, die: 4 };
/** The contact sheet's army tints, as render/art/sheet.ts uses. */
const TEAMS = [0x3d63c4, 0xc8432c];
const INK = 0x22180f;
const HALO = 0xfff6e2;
/** Bake resolution: cells are drawn at half this on the sheet. */
const RES = 2;
/** Height of the mannequin in its own units (cm). */
const FIGURE_CM = 182;

interface Loadout {
  kind: Kind;
  right?: string;
  left?: string;
  helm: 'kettle' | 'great' | 'horned' | 'none';
  idle: string;
  attack: string;
  /** A masked upper-body pose laid over the run, so a two-handed weapon is carried, not swung loose. */
  hold?: string;
  scale?: number;
}

/** The pack's weapons are heroic (a 194 cm greatsword); trimmed toward life, still oversized enough to read. */
const WEAPON_SCALE: Record<string, number> = { Sword: 0.8, Greatsword: 0.75, Polearm: 0.85, Shield: 0.9 };

const LOADOUTS: Loadout[] = [
  { kind: Kind.Footman, right: 'Polearm', left: 'Shield', helm: 'kettle', idle: 'CombatIdlePolearm01', attack: 'AttackPolearm01', hold: 'WeaponHoldPolearm01' },
  { kind: Kind.Warden, right: 'Sword', left: 'Shield', helm: 'great', idle: 'CombatIdle1H01', attack: 'AttackShield01' },
  { kind: Kind.Mercenary, right: 'Sword', helm: 'none', idle: 'CombatIdle1H01', attack: 'Attack1H01_R' },
  { kind: Kind.Sapper, right: 'Dagger', helm: 'kettle', idle: 'CombatIdle01', attack: 'Attack1H01_R' },
  { kind: Kind.Berserker, right: 'Warhammer', helm: 'horned', idle: 'CombatIdle2H01', attack: 'Attack2H01', hold: 'WeaponHold2H01' },
  { kind: Kind.Champion, right: 'Greatsword', helm: 'great', idle: 'CombatIdle2H01', attack: 'Attack2H01', hold: 'WeaponHold2H01', scale: 1.15 },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (s: string) => ($('status').textContent = s);
const ui = {
  yaw: () => Number($<HTMLInputElement>('yaw').value),
  elev: () => Number($<HTMLInputElement>('elev').value),
  ink: () => Number($<HTMLInputElement>('ink').value),
  bands: () => Number($<HTMLSelectElement>('bands').value),
  smooth: () => $<HTMLSelectElement>('frames').value === 'smooth',
  night: () => $<HTMLSelectElement>('ground').value === 'night',
};

// ---- Materials: toon bands lit warm from the upper left, shadows toward ink-blue, an ink hull. ----

function gradientMap(bands: number): THREE.Texture | null {
  if (bands < 2) return null;
  const data = new Uint8Array(bands * 4);
  for (let i = 0; i < bands; i++) data.fill(Math.round(70 + (185 * i) / (bands - 1)), i * 4, i * 4 + 4);
  const t = new THREE.DataTexture(data, bands, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const inkUniform = { value: 1.2 };
const toonMaterials: THREE.MeshToonMaterial[] = [];

/** A toon material; with `team`, vertices whose aTeam is 1 wear the army's pigment times their color. */
function toon(opts: { map?: THREE.Texture; color?: number; team?: THREE.Color }): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ map: opts.map ?? null, color: opts.color ?? 0xffffff, gradientMap: gradientMap(ui.bands()) });
  if (opts.team) {
    const pigment = { value: opts.team };
    m.vertexColors = true;
    m.onBeforeCompile = (s) => {
      s.uniforms.uPigment = pigment;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTeam;\nvarying float vTeam;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeam = aTeam;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uPigment;\nvarying float vTeam;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPigment * diffuseColor.rgb, vTeam);');
    };
    m.customProgramCacheKey = () => 'team';
  }
  toonMaterials.push(m);
  return m;
}

const inkMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
inkMaterial.onBeforeCompile = (s) => {
  s.uniforms.uInk = inkUniform;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uInk;').replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uInk;');
};

/** An inverted hull: the same mesh pushed out along its normals, back faces only, in ink. */
function hullOf(mesh: THREE.Mesh): THREE.Mesh {
  if (mesh instanceof THREE.SkinnedMesh) {
    const h = new THREE.SkinnedMesh(mesh.geometry, inkMaterial);
    h.bind(mesh.skeleton, mesh.bindMatrix);
    h.frustumCulled = false;
    return h;
  }
  return new THREE.Mesh(mesh.geometry, inkMaterial);
}

// ---- The mannequin painted as a soldier, region by region from its skin weights. ----

const SKIN = new THREE.Color(0xd9a77c);
const MAIL = new THREE.Color(0x8a8f96);
const LEATHER = new THREE.Color(0x6b4a2b);
const BOOT = new THREE.Color(0x3d2a1a);
const WHITE = new THREE.Color(1, 1, 1);
const SHADE = new THREE.Color(0.68, 0.68, 0.68);

/** [color, team]: team regions store a multiplier on the pigment instead of a color. */
function regionOf(bone: string): [THREE.Color, number] {
  if (/head|neck|jaw|eye/i.test(bone)) return [SKIN, 0];
  if (/finger|thumb|pinky|hand/i.test(bone)) return [LEATHER, 0];
  if (/forearm/i.test(bone)) return [LEATHER, 0];
  if (/shoulder|upperArm/i.test(bone)) return [MAIL, 0];
  if (/toe|foot|lowerLeg|calf|shin/i.test(bone)) return [BOOT, 0];
  if (/upperLeg|thigh/i.test(bone)) return [SHADE, 1];
  return [WHITE, 1];
}

function paintMannequin(mesh: THREE.SkinnedMesh): void {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex!;
  const sw = g.attributes.skinWeight!;
  const n = si.count;
  const color = new Float32Array(n * 3);
  const team = new Float32Array(n);
  const bones = mesh.skeleton.bones.map((b) => b.name);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
    const [c, t] = regionOf(bones[si.getComponent(i, best)] ?? '');
    color.set([c.r, c.g, c.b], i * 3);
    team[i] = t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1));
}

function helmet(kind: Loadout['helm']): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'none') return g;
  const steel = toon({ color: 0x9aa0a6 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, rx = 0) => {
    const piece = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    piece.add(m, hullOf(m));
    piece.position.y = y;
    piece.rotation.x = rx;
    g.add(piece);
    return piece;
  };
  if (kind === 'great') add(new THREE.CylinderGeometry(12.5, 12, 26, 14), steel, 9);
  else add(new THREE.SphereGeometry(12.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, 6);
  if (kind === 'kettle') add(new THREE.CylinderGeometry(19, 19, 1.5, 18), steel, 6);
  if (kind === 'horned') {
    const horn = toon({ color: 0xe8dcc0 });
    for (const s of [-1, 1]) {
      const h = add(new THREE.ConeGeometry(3, 16, 8), horn, 14);
      h.position.x = s * 12;
      h.rotation.z = -s * 0.9;
    }
  }
  return g;
}

// ---- Loading ----

const loader = new FBXLoader();
const palette = await new THREE.TextureLoader().loadAsync(BASE + 'Textures/HumanAnimations_ColorPalette.png').catch(() => null);
if (!palette) {
  document.body.innerHTML = `<div id="missing"><h2>Animation pack not found</h2><p>Download <b>Human Melee Animations FREE</b> by Kevin Iglesias and unpack it into <code>src/client/public/lab/kevin/</code>. See <code>docs/anim-lab.md</code>.</p></div>`;
  throw new Error('pack missing');
}
palette.colorSpace = THREE.SRGBColorSpace;
palette.magFilter = THREE.NearestFilter;

const t0 = performance.now();
const clipNames = [...new Set(LOADOUTS.flatMap((l) => [l.idle, l.attack, l.hold].filter((x): x is string => !!x)).concat(['Run01_Forward', 'Death01', 'CombatDamage01']))];
const weaponNames = [...new Set(LOADOUTS.flatMap((l) => [l.right, l.left].filter((x): x is string => !!x)))];
const [model, clipList, weaponList] = await Promise.all([
  loader.loadAsync(BASE + 'Models/HumanM_Model.fbx'),
  Promise.all(clipNames.map((n) => loader.loadAsync(`${BASE}anim/HumanM@${n}.fbx`).then((f) => f.animations[0]!))),
  Promise.all(weaponNames.map((n) => loader.loadAsync(`${BASE}Models/Weapons/Human_${n}.fbx`))),
]);
// Scale tracks would undo the proportions below every frame; the proxy bone isn't in the rig.
for (const c of clipList) c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && !t.name.startsWith('B-spineProxy'));
const clips = new Map(clipNames.map((n, i) => [n, clipList[i]!]));
const weapons = new Map(weaponNames.map((n, i) => [n, weaponList[i]!]));
model.traverse((o) => {
  if (o instanceof THREE.SkinnedMesh) paintMannequin(o);
});

/** The run with its arms replaced by a held pose's arms. */
function carried(run: THREE.AnimationClip, hold: THREE.AnimationClip): THREE.AnimationClip {
  const upper = (t: THREE.KeyframeTrack) => /shoulder|Arm|forearm|hand|Finger|pinky|thumb/i.test(t.name.split('.')[0]!);
  return new THREE.AnimationClip(`${run.name}+${hold.name}`, run.duration, [...run.tracks.filter((t) => !upper(t)), ...hold.tracks.filter(upper)]);
}

class Rig {
  root = new THREE.Group();
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;

  constructor(readonly loadout: Loadout, team: number) {
    const body = SkeletonUtils.clone(model) as THREE.Group;
    const pigment = new THREE.Color().setHex(TEAMS[team]!, THREE.SRGBColorSpace);
    const bones = new Map<string, THREE.Bone>();
    const meshes: THREE.Mesh[] = [];
    body.traverse((o) => {
      if (o instanceof THREE.Bone) bones.set(o.name, o);
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    for (const m of meshes) {
      m.material = toon({ map: palette!, team: pigment });
      m.parent!.add(hullOf(m));
      m.frustumCulled = false;
    }
    const bone = (re: RegExp) => [...bones.values()].find((b) => re.test(b.name));
    // Miniature proportions: a bigger head and hands carry helmet and weapon at sprite size.
    const big = Number(new URLSearchParams(location.search).get('mini') ?? 1);
    bone(/head$/i)?.scale.setScalar(1 + 0.35 * big);
    for (const h of [bone(/handR$/i), bone(/handL$/i)]) h?.scale.setScalar(1 + 0.25 * big);
    const hold = (name: string | undefined, b: THREE.Bone | undefined) => {
      if (!name || !b) return;
      const w = weapons.get(name)!.clone();
      w.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = toon({ map: palette! });
          o.parent!.add(hullOf(o));
        }
      });
      b.add(w);
      w.scale.setScalar(WEAPON_SCALE[name] ?? 1);
    };
    hold(loadout.right, bone(/handProp.*R$/i) ?? bone(/handR$/i));
    hold(loadout.left, bone(/handProp.*L$/i) ?? bone(/handL$/i));
    const helm = helmet(loadout.helm);
    helm.position.set(0, 12, 1);
    bone(/head$/i)?.add(helm);
    // The FBX is Z-up: its Rig group carries a quarter turn about X that the clips don't undo.
    body.rotation.x = Number(new URLSearchParams(location.search).get('rx') ?? -90) * THREE.MathUtils.DEG2RAD;
    this.root.add(body);
    this.root.scale.setScalar(loadout.scale ?? 1);
    this.mixer = new THREE.AnimationMixer(body);
    const run = clips.get('Run01_Forward')!;
    const sources: Record<string, THREE.AnimationClip> = {
      idle: clips.get(loadout.idle)!,
      walk: loadout.hold ? carried(run, clips.get(loadout.hold)!) : run,
      attack: clips.get(loadout.attack)!,
      die: clips.get('Death01')!,
      hit: clips.get('CombatDamage01')!,
    };
    for (const [k, c] of Object.entries(sources)) {
      const a = this.mixer.clipAction(c);
      if (k === 'walk') a.timeScale = 0.55;
      if (k === 'die' || k === 'attack' || k === 'hit') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(k, a);
    }
  }

  play(name: string, fade = 0.15): THREE.AnimationAction {
    const next = this.actions.get(name)!;
    next.reset().play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    return next;
  }

  /** Poses the rig at a share of a clip, with nothing else playing. */
  poseAt(name: string, share: number): void {
    this.mixer.stopAllAction();
    const a = this.actions.get(name)!;
    a.reset().play();
    a.time = share * a.getClip().duration;
    this.mixer.update(0);
    this.current = a;
  }

  /** Turns the rig to face screen right (dir 1) or left (-1), angled `yaw` degrees toward the viewer. */
  face(dir: number, yaw: number): void {
    this.root.rotation.y = THREE.MathUtils.degToRad(dir * (90 - yaw));
  }
}

function lights(scene: THREE.Scene): void {
  const key = new THREE.DirectionalLight(0xfff0d2, 2.4);
  key.position.set(-1, 1.4, 1.1);
  scene.add(key, new THREE.HemisphereLight(0xfff2da, 0x2c3a5a, 1.1));
}

// ---- Live skirmish: both armies facing across the field, each soldier on its own loop. ----

const live = $<HTMLCanvasElement>('live');
const liveR = new THREE.WebGLRenderer({ canvas: live, antialias: true });
liveR.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
lights(scene);
const groundMat = new THREE.MeshBasicMaterial({ color: 0xa9a46e });
const ground = new THREE.Mesh(new THREE.CircleGeometry(2200, 48), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const liveCam = new THREE.OrthographicCamera();
const rigs: { rig: Rig; dir: number; next: number; step: number }[] = [];
LOADOUTS.forEach((l, i) => {
  for (const team of [0, 1]) {
    const rig = new Rig(l, team);
    const dir = team === 0 ? 1 : -1;
    rig.root.position.set(-dir * (110 + (LOADOUTS.length - 1 - i) * 125), 0, (i % 2) * -70);
    scene.add(rig.root);
    rigs.push({ rig, dir, next: 0, step: (i * 2 + team) % 5 });
  }
});
status(`loaded ${clipNames.length} clips, ${weaponNames.length} weapons in ${Math.round(performance.now() - t0)} ms`);

/** walk, walk, idle, attack, attack, hit, idle, … and now and then a death. */
const SCRIPT = ['walk', 'idle', 'attack', 'idle', 'attack', 'hit', 'idle', 'attack', 'die'];
function advance(r: (typeof rigs)[number], now: number): void {
  const name = SCRIPT[r.step++ % SCRIPT.length]!;
  const a = r.rig.play(name);
  const len = a.getClip().duration / Math.abs(a.timeScale);
  r.next = now + (name === 'walk' ? 2.4 : name === 'idle' ? 0.8 + Math.random() : name === 'die' ? len + 1.5 : len);
}

function frame(cam: THREE.OrthographicCamera, cx: number, cy: number, w: number, h: number): void {
  const e = THREE.MathUtils.degToRad(ui.elev());
  cam.left = -w / 2;
  cam.right = w / 2;
  cam.top = h / 2;
  cam.bottom = -h / 2;
  cam.near = -5000;
  cam.far = 5000;
  cam.position.set(cx, cy + Math.sin(e) * 1000, Math.cos(e) * 1000);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
}

const clock = new THREE.Clock();
function tick(): void {
  const dt = clock.getDelta();
  const now = clock.elapsedTime;
  const w = live.clientWidth;
  const h = live.clientHeight;
  liveR.setSize(w, h, false);
  // Fit both lines across, and at least a man and a half of height.
  const worldW = Math.max(1700, (330 * w) / h);
  frame(liveCam, 0, 100, worldW, (worldW * h) / w);
  inkUniform.value = (ui.ink() * worldW) / w;
  groundMat.color.setHex(ui.night() ? 0x1b2333 : 0xa9a46e);
  for (const r of rigs) {
    r.rig.face(r.dir, ui.yaw());
    if (now >= r.next) advance(r, now);
    r.rig.mixer.update(dt);
  }
  liveR.render(scene, liveCam);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- The bake: each kind's poses as sprite cells, 3D beside procedural. ----

const bakeCanvas = document.createElement('canvas');
const bakeR = new THREE.WebGLRenderer({ canvas: bakeCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
bakeR.setClearColor(0, 0);
const bakeScene = new THREE.Scene();
lights(bakeScene);
const bakeCam = new THREE.OrthographicCamera();

/** Ink rim and a faint light halo hugging the silhouette, under the figure, as the game's `rim` layer. */
function rimmed(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = out.height = px;
  const o = out.getContext('2d')!;
  const layer = (r: number, color: number, alpha: number) => {
    const t = document.createElement('canvas');
    t.width = t.height = px;
    const c = t.getContext('2d')!;
    for (let a = 0; a < 16; a++) c.drawImage(src, Math.cos((a / 16) * Math.PI * 2) * r, Math.sin((a / 16) * Math.PI * 2) * r);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    c.fillRect(0, 0, px, px);
    o.globalAlpha = alpha;
    o.drawImage(t, 0, 0);
  };
  layer(2.6 * RES, HALO, 0.35);
  layer(1.1 * RES, INK, 1);
  o.globalAlpha = 1;
  o.drawImage(src, 0, 0);
  return out;
}

function shares(pose: PoseName): number[] {
  const n = ui.smooth() ? 12 : GAME_FRAMES[pose];
  if (pose === 'die') return Array.from({ length: n }, (_, i) => 0.12 + (0.88 * i) / (n - 1));
  if (pose === 'attack' && !ui.smooth()) return [0.12, 0.32, 0.5, 0.75];
  return Array.from({ length: n }, (_, i) => i / n);
}

/** Bakes one kind's 3D frames into cells of `px`, feet on the game's feet line. */
function bake3d(l: Loadout, team: number): HTMLCanvasElement[][] {
  const rig = new Rig(l, team);
  bakeScene.add(rig.root);
  rig.face(1, ui.yaw());
  const px = cellPx(l.kind, RES);
  const cell = CELLS[l.kind]!;
  bakeR.setSize(px, px, false);
  // The cell spans this many cm; a soldier stands about 0.55 of the cell tall, as the procedural figures do.
  const span = FIGURE_CM / 0.55;
  const feet = cell.feetY / cell.size;
  // Aim above the ground so the feet (y=0) land on the cell's feet line under the camera's tilt.
  frame(bakeCam, 0, (span * (feet - 0.5)) / Math.cos(THREE.MathUtils.degToRad(ui.elev())), span, span);
  inkUniform.value = (ui.ink() * span) / px;
  const rows = POSES.map((pose) =>
    shares(pose).map((s) => {
      rig.poseAt(pose, s);
      bakeR.render(bakeScene, bakeCam);
      const c = document.createElement('canvas');
      c.width = c.height = px;
      c.getContext('2d')!.drawImage(bakeCanvas, 0, 0);
      return rimmed(c, px);
    }),
  );
  bakeScene.remove(rig.root);
  return rows;
}

/** The procedural frames, body plus tinted mask, as render/art/sheet.ts draws them. */
function procedural(kind: Kind, team: number, bake: KindBake): HTMLCanvasElement[][] {
  const px = cellPx(kind, RES);
  const cut = (i: number) => {
    const s = bake.sprites[i]!;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    c.getContext('2d')!.drawImage(bake.pages[s.page] as HTMLCanvasElement, s.x, s.y, s.w, s.h, s.tx, s.ty, s.w, s.h);
    return c;
  };
  return bake.table.map((list) =>
    list.map((e) => {
      const out = cut(e.body);
      const mask = cut(e.mask);
      const m = mask.getContext('2d')!;
      m.globalCompositeOperation = 'multiply';
      m.fillStyle = `#${TEAMS[team]!.toString(16).padStart(6, '0')}`;
      m.fillRect(0, 0, px, px);
      m.globalCompositeOperation = 'destination-in';
      m.drawImage(cut(e.mask), 0, 0);
      out.getContext('2d')!.drawImage(mask, 0, 0);
      return out;
    }),
  );
}

const procCache = new Map<Kind, KindBake>();
function rebake(): void {
  const t = performance.now();
  const sheet = $<HTMLCanvasElement>('sheet');
  const CELL = 96;
  const GAP = 14;
  const LABEL = 120;
  const SMALL = 34;
  const rowsOf = LOADOUTS.map((l) => {
    const pb = procCache.get(l.kind) ?? bakeKindPages(l.kind, RES, domCanvas);
    procCache.set(l.kind, pb);
    return { l, proc: procedural(l.kind, 0, pb), three: bake3d(l, 0), threeB: bake3d(l, 1) };
  });
  const cols = Math.max(...rowsOf.map((r) => r.three.flat().length));
  sheet.width = LABEL + cols * CELL * 0.62 + POSES.length * GAP + 260;
  sheet.height = rowsOf.length * (CELL * 2 + 30) + 20;
  const g = sheet.getContext('2d')!;
  g.fillStyle = ui.night() ? '#1b2333' : '#a9a46e';
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.imageSmoothingQuality = 'high';
  rowsOf.forEach((r, i) => {
    const y0 = 20 + i * (CELL * 2 + 30);
    g.fillStyle = ui.night() ? '#efe4c8' : '#22180f';
    g.font = '700 15px sans-serif';
    g.fillText(STATS[r.l.kind]!.name, 8, y0 + 20);
    g.font = '12px sans-serif';
    g.fillText('procedural', 8, y0 + CELL * 0.75);
    g.fillText('3D baked', 8, y0 + CELL * 1.75);
    for (const [row, frames] of [[0, r.proc], [1, r.three]] as const) {
      let x = LABEL;
      frames.forEach((pose) => {
        for (const f of pose) {
          g.drawImage(f, x - CELL * 0.19, y0 + row * CELL, CELL, CELL);
          x += CELL * 0.62;
        }
        x += GAP;
      });
    }
    // Battlefield size: two of each side facing off, walk and attack frames.
    const bx = sheet.width - 240;
    const s = (SMALL / 0.55) * (r.l.scale ?? 1);
    const at = (img: HTMLCanvasElement, x: number, y: number, flip: boolean) => {
      g.save();
      g.translate(x, y);
      if (flip) g.scale(-1, 1);
      g.drawImage(img, -s / 2, -s * (CELLS[r.l.kind]!.feetY / CELLS[r.l.kind]!.size), s, s);
      g.restore();
    };
    for (const [row, set] of [[0, r.proc], [1, r.three]] as const) {
      const yy = y0 + row * CELL + CELL * 0.8;
      at(set[1]![1 % set[1]!.length]!, bx, yy, false);
      at(set[2]![2 % set[2]!.length]!, bx + 30, yy - 8, false);
      const foe = row === 0 ? procedural(r.l.kind, 1, procCache.get(r.l.kind)!) : r.threeB;
      at(foe[2]![1 % foe[2]!.length]!, bx + 80, yy, true);
      at(foe[1]![3 % foe[1]!.length]!, bx + 110, yy - 8, true);
    }
  });
  status(`${$('status').textContent!.split(' · ')[0]} · sheet baked in ${Math.round(performance.now() - t)} ms`);
  (window as unknown as { labReady: boolean }).labReady = true;
}

for (const id of ['bands']) $(id).addEventListener('change', () => {
  const gm = gradientMap(ui.bands());
  for (const m of toonMaterials) {
    m.gradientMap = gm;
    m.needsUpdate = true;
  }
});
$('rebake').addEventListener('click', rebake);
for (const id of ['frames', 'ground']) $(id).addEventListener('change', rebake);
if (!new URLSearchParams(location.search).has('nobake')) rebake();
