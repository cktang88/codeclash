// Loading packs: a unit's model and clips (glTF or FBX, from one file or several), styled once,
// cloned per soldier.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { stylize } from './style.ts';
import { fixZFight } from './zfix.ts';

export type Pose = 'idle' | 'walk' | 'attack' | 'hit' | 'die';

export interface UnitStats {
  hp: number;
  damage: number;
  /** Metres from centre to centre at which it strikes or shoots. */
  range: number;
  /** Metres a second. */
  speed: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** Share of the attack at which the blow lands or the shot leaves. */
  hitAt: number;
  /**
   * Seconds an attack takes (default 0.9). It's game data, not the clip's length: the simulation
   * must not depend on art, so a server can run it without models. The renderer fits the clip to it.
   */
  swing?: number;
  /** Missile for ranged units. */
  shot?: 'arrow' | 'fire' | 'bolt';
  /** Hover height in metres for flyers. */
  fly?: number;
  /** Footprint radius in metres, for spacing. */
  radius: number;
}

export interface UnitDef {
  id: string;
  name: string;
  pack: string;
  /** Model file; its own clips are used too. */
  model: string;
  /** Further files whose clips the model can play (same skeleton). */
  clipFiles?: string[];
  /** Height to scale the model to, in metres. */
  height: number;
  /** Regexes matched against clip names; the first match wins, and attack picks among all matches. */
  clips: Record<Pose, RegExp>;
  /** Playback rate per pose (e.g. a run slowed to a march). */
  rate?: Partial<Record<Pose, number>>;
  /** Fixes and kit applied to the template before styling. */
  prep?: (root: THREE.Object3D, extra: Map<string, THREE.Object3D>) => void;
  /** Extra files `prep` needs (weapons and props), loaded beside the model. */
  extras?: string[];
  /** Puts an army's colour on a clone. Without it only the base ring shows the side. */
  team?: (root: THREE.Object3D, color: THREE.Color) => void;
  /** Rewrites clips once loaded (masking, dropping tracks). */
  clipFix?: (clips: THREE.AnimationClip[]) => THREE.AnimationClip[];
  /** Turn so the model faces +Z, in degrees, if it doesn't. */
  yaw?: number;
  stats: UnitStats;
}

export interface Template {
  def: UnitDef;
  scene: THREE.Object3D;
  clips: Map<Pose, THREE.AnimationClip[]>;
  /** Every clip the model can play, for the inspector. */
  all: THREE.AnimationClip[];
}

const gltf = new GLTFLoader();
const fbx = new FBXLoader();
const files = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>>();

function loadFile(url: string): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  let p = files.get(url);
  if (!p) {
    p = /\.fbx$/i.test(url)
      ? fbx.loadAsync(url).then((g) => ({ scene: g, clips: g.animations }))
      : gltf.loadAsync(url).then((g) => ({ scene: g.scene, clips: g.animations }));
    files.set(url, p);
  }
  return p;
}

/** The bounds of the body alone (its skinned meshes), so a raised staff or a plume doesn't shrink the soldier. */
function bodyBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();
      box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));
    }
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(root, true) : box;
}

const templates = new Map<string, Promise<Template>>();

export function template(def: UnitDef): Promise<Template> {
  let t = templates.get(def.id);
  if (!t) {
    t = (async () => {
      const [main, ...more] = await Promise.all([def.model, ...(def.clipFiles ?? [])].map(loadFile));
      const extras = new Map(await Promise.all((def.extras ?? []).map(async (u) => [u, (await loadFile(u)).scene] as const)));
      // Each def gets its own copy: two defs may share a model file and kit it differently.
      const scene = SkeletonUtils.clone(main!.scene);
      let clips = [...main!.clips, ...more.flatMap((m) => m.clips)];
      if (def.clipFix) clips = def.clipFix(clips);
      def.prep?.(scene, extras);
      // Scale to the def's height, feet on the ground, centred.
      const holder = new THREE.Group();
      holder.add(scene);
      scene.rotation.y += THREE.MathUtils.degToRad(def.yaw ?? 0);
      holder.updateMatrixWorld(true);
      const box = bodyBox(scene);
      const s = def.height / Math.max(1e-6, box.max.y - box.min.y);
      scene.scale.multiplyScalar(s);
      holder.updateMatrixWorld(true);
      const b2 = bodyBox(scene);
      scene.position.y -= b2.min.y;
      const lifted = fixZFight(holder);
      if (lifted) console.info(`zfix ${def.id}: lifted ${lifted} coplanar triangles`);
      stylize(holder);
      const byPose = new Map<Pose, THREE.AnimationClip[]>();
      for (const pose of ['idle', 'walk', 'attack', 'hit', 'die'] as Pose[]) {
        const found = clips.filter((c) => def.clips[pose].test(c.name));
        byPose.set(pose, pose === 'attack' ? found : found.slice(0, 1));
      }
      // A pose with no match falls back (idle to the walk, anything to the idle), so a missing clip
      // shows as stillness rather than breaking the frame. Flinches may be missing: they're skipped.
      for (const pose of ['idle', 'walk', 'attack', 'die'] as Pose[]) {
        if (byPose.get(pose)!.length) continue;
        const fallback = byPose.get(pose === 'idle' ? 'walk' : 'idle')!.slice(0, 1);
        byPose.set(pose, fallback.length ? fallback : clips.slice(0, 1));
        console.warn(`${def.id}: no ${pose} clip matches ${def.clips[pose]}; using ${byPose.get(pose)![0]?.name ?? 'nothing'}`);
      }
      return { def, scene: holder, clips: byPose, all: clips };
    })();
    templates.set(def.id, t);
  }
  return t;
}

export function instance(t: Template): THREE.Object3D {
  return SkeletonUtils.clone(t.scene);
}
