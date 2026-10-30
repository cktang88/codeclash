// Crowds: every soldier of a unit type drawn in one instanced call (plus one for its ink), however
// many there are. At load, each type's pose clips are sampled at 30 fps into a float texture of
// bone matrices, and the model's meshes (skinned parts and rigid kit on bones alike) are merged
// into one skinned geometry per material. The vertex shader skins each instance from the texture
// at the frame the CPU picks for it, cross-fading between two frames when its pose changes.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Pose, Template } from './assets.ts';
import { inkWidth, isSheet, toon } from './style.ts';

const FPS = 30;
const POSES: Pose[] = ['idle', 'walk', 'attack', 'hit', 'die'];
const SENTINEL = new THREE.Color(1, 0, 1);

export interface ClipRows {
  row: number;
  frames: number;
  duration: number;
}

/** Bone slots: one per distinct (bone, inverse) pair across the model's skeletons, plus rigid kit. */
interface Slot {
  bone: THREE.Object3D;
  inverse: THREE.Matrix4;
}

const SKIN_GLSL = /* glsl */ `
uniform sampler2D uAnim;
uniform vec2 uAnimSize;
attribute vec4 aFrames;
attribute vec3 aPigment;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute float aTeam;
varying float vTeam;
varying vec3 vPigment;
mat4 animBone(float slot, float row) {
  float x = slot * 4.0;
  float v = (row + 0.5) / uAnimSize.y;
  float u = 1.0 / uAnimSize.x;
  return mat4(texture2D(uAnim, vec2((x + 0.5) * u, v)), texture2D(uAnim, vec2((x + 1.5) * u, v)),
              texture2D(uAnim, vec2((x + 2.5) * u, v)), texture2D(uAnim, vec2((x + 3.5) * u, v)));
}
mat4 animSkin(float row) {
  mat4 m = skinWeight.x * animBone(skinIndex.x, row);
  if (skinWeight.y > 0.0) m += skinWeight.y * animBone(skinIndex.y, row);
  if (skinWeight.z > 0.0) m += skinWeight.z * animBone(skinIndex.z, row);
  if (skinWeight.w > 0.0) m += skinWeight.w * animBone(skinIndex.w, row);
  return m;
}
mat4 crowdSkin() {
  mat4 m = animSkin(aFrames.x);
  // Cross-fade from the previous pose's frame while a pose change settles.
  if (aFrames.z > 0.0) m = m * (1.0 - aFrames.z) + animSkin(aFrames.y) * aFrames.z;
  return m;
}
`;

function crowdBody(mat: THREE.MeshToonMaterial, uniforms: Record<string, THREE.IUniform>): void {
  mat.vertexColors = true;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_GLSL}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat4 cSkin = crowdSkin();\nobjectNormal = normalize(mat3(cSkin) * objectNormal);\nvTeam = aTeam;\nvPigment = aPigment;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = (cSkin * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTeam;\nvarying vec3 vPigment;')
      // Team regions take the army's pigment at the texture's brightness: a red cape turns blue, not black.
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vPigment * min(1.0, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) * 2.2), vTeam);');
  };
  mat.customProgramCacheKey = () => 'crowd-body';
}

function crowdInk(uniforms: Record<string, THREE.IUniform>): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x22180f, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uInk: inkWidth });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_GLSL}\nuniform float uInk;\nattribute vec3 inkNormal;`)
      .replace('#include <begin_vertex>', 'mat4 cSkin = crowdSkin();\nvec3 transformed = (cSkin * vec4(position, 1.0)).xyz + normalize(mat3(cSkin) * inkNormal) * uInk;\nvTeam = aTeam;\nvPigment = aPigment;');
  };
  m.customProgramCacheKey = () => 'crowd-ink';
  return m;
}

/** Normals averaged over vertices at one position, so the hull doesn't tear at hard edges. */
function averagedNormals(pos: Float32Array, nor: Float32Array): Float32Array {
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number) => `${pos[i * 3]!.toFixed(4)},${pos[i * 3 + 1]!.toFixed(4)},${pos[i * 3 + 2]!.toFixed(4)}`;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const v = sum.get(k) ?? sum.set(k, [0, 0, 0]).get(k)!;
    v[0] += nor[i * 3]!;
    v[1] += nor[i * 3 + 1]!;
    v[2] += nor[i * 3 + 2]!;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let [x, y, z] = sum.get(key(i))!;
    let l = Math.hypot(x, y, z);
    if (l < 1e-6) [x, y, z, l] = [nor[i * 3]!, nor[i * 3 + 1]!, nor[i * 3 + 2]!, 1];
    out.set([x / l, y / l, z / l], i * 3);
  }
  return out;
}

interface Part {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  team: number[];
  si: number[];
  sw: number[];
  sheet: boolean[];
  material: THREE.MeshToonMaterial;
}

/**
 * Detail levels by the share of triangles kept: full near the camera, about a fifth beyond
 * LOD_DISTANCE, where a soldier is a few dozen pixels tall and the difference doesn't show.
 */
const LOD_SHARE = [1, 0.2];
export const LOD_DISTANCE = 28;

interface Level {
  meshes: THREE.InstancedMesh[];
  matrix: THREE.InstancedBufferAttribute;
  frames: THREE.InstancedBufferAttribute;
  pigment: THREE.InstancedBufferAttribute;
  count: number;
}

/** A coarser index over the same vertices, so skinning, UVs and team marks all carry over. */
function simplified(geo: THREE.BufferGeometry, share: number): THREE.BufferAttribute {
  const index = new Uint32Array(geo.index!.array);
  const target = Math.max(3, Math.floor((index.length * share) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(index, geo.attributes.position!.array as Float32Array, 3, target, 0.05, []);
  return new THREE.BufferAttribute(out, 1);
}

export const crowdsReady = MeshoptSimplifier.ready;

export class CrowdType {
  readonly clips = new Map<Pose, ClipRows[]>();
  readonly levels: Level[];

  constructor(
    readonly tpl: Template,
    readonly capacity: number,
    group: THREE.Group,
  ) {
    const rig = SkeletonUtils.clone(tpl.scene);
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    rig.updateMatrixWorld(true);
    // Which meshes wear the army colour: the ones the team hook tints.
    // A clone shares the template's materials; the hook swaps in its own on the meshes it tints.
    const teamed = new Set<string>();
    const probe = SkeletonUtils.clone(tpl.scene);
    const before = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    probe.traverse((o) => {
      if (o instanceof THREE.Mesh) before.set(o, o.material);
    });
    tpl.def.team?.(probe, SENTINEL.clone());
    probe.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.hull && before.get(o) !== o.material) teamed.add(o.name);
    });

    // ---- Slots and merged geometry ----
    const slots: Slot[] = [];
    const slotOf = (bone: THREE.Object3D, inverse: THREE.Matrix4): number => {
      const i = slots.findIndex((s) => s.bone === bone && s.inverse.equals(inverse));
      if (i >= 0) return i;
      slots.push({ bone, inverse: inverse.clone() });
      return slots.length - 1;
    };
    const parts = new Map<string, Part>();
    const meshes: THREE.Mesh[] = [];
    rig.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.hull && o.geometry.attributes.position?.count) meshes.push(o);
    });
    for (const mesh of meshes) {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const P = g.attributes.position!;
      const N = g.attributes.normal;
      const UV = g.attributes.uv;
      const C = g.attributes.color;
      const T = g.attributes.aTeam;
      const sheet = isSheet(mesh.geometry);
      // Into the bind space shared by every slot: a skinned mesh by its bind matrix; rigid kit by its
      // world matrix now, with a slot on its parent bone whose inverse is that bone's world now.
      let toBind: THREE.Matrix4;
      let slotFor: (i: number) => [number[], number[]];
      if (mesh instanceof THREE.SkinnedMesh) {
        toBind = mesh.bindMatrix.clone();
        const sk = mesh.skeleton;
        const map = sk.bones.map((b, i) => slotOf(b, sk.boneInverses[i]!));
        const SI = g.attributes.skinIndex!;
        const SW = g.attributes.skinWeight!;
        slotFor = (i) => [[0, 1, 2, 3].map((k) => map[SI.getComponent(i, k)] ?? 0), [0, 1, 2, 3].map((k) => SW.getComponent(i, k))];
      } else {
        let bone: THREE.Object3D = mesh.parent ?? rig;
        while (!(bone instanceof THREE.Bone) && bone.parent && bone !== rig) bone = bone.parent;
        if (!(bone instanceof THREE.Bone)) bone = rig;
        toBind = mesh.matrixWorld.clone();
        const s = slotOf(bone, bone.matrixWorld.clone().invert());
        slotFor = () => [[s, 0, 0, 0], [1, 0, 0, 0]];
      }
      const normalM = new THREE.Matrix3().getNormalMatrix(toBind);
      const mats = [mesh.material].flat() as THREE.MeshToonMaterial[];
      const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
      const v = new THREE.Vector3();
      for (const gr of groups) {
        const src = mats[gr.materialIndex ?? 0] ?? mats[0]!;
        const side = sheet ? THREE.DoubleSide : src.side;
        const key = `${src.map?.uuid ?? '-'}|${src.color.getHexString()}|${side}`;
        let p = parts.get(key);
        if (!p) parts.set(key, (p = { pos: [], nor: [], uv: [], col: [], team: [], si: [], sw: [], sheet: [], material: src }));
        const isTeam = teamed.has(mesh.name) ? 1 : 0;
        for (let i = gr.start; i < Math.min(P.count, gr.start + gr.count); i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(toBind);
          p.pos.push(v.x, v.y, v.z);
          if (N) v.fromBufferAttribute(N, i).applyMatrix3(normalM).normalize();
          else v.set(0, 1, 0);
          p.nor.push(v.x, v.y, v.z);
          p.uv.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
          if (C) p.col.push(C.getX(i), C.getY(i), C.getZ(i));
          else p.col.push(1, 1, 1);
          p.team.push(T ? T.getX(i) : isTeam);
          const [si, sw] = slotFor(i);
          p.si.push(...si);
          p.sw.push(...sw);
          p.sheet.push(sheet);
        }
      }
    }

    // ---- Bake the pose clips into rows of bone matrices ----
    const mixer = new THREE.AnimationMixer(rig);
    const rows: THREE.Matrix4[][] = [];
    const m = new THREE.Matrix4();
    for (const pose of POSES) {
      const list: ClipRows[] = [];
      for (const clip of tpl.clips.get(pose) ?? []) {
        const frames = Math.max(2, Math.ceil(clip.duration * FPS) + 1);
        const action = mixer.clipAction(clip);
        list.push({ row: rows.length, frames, duration: clip.duration });
        for (let f = 0; f < frames; f++) {
          mixer.stopAllAction();
          action.reset().play();
          action.time = Math.min(clip.duration, f / FPS);
          mixer.update(0);
          rig.updateMatrixWorld(true);
          rows.push(slots.map((s) => m.multiplyMatrices(s.bone.matrixWorld, s.inverse).clone()));
        }
      }
      this.clips.set(pose, list);
    }
    mixer.stopAllAction();
    const width = slots.length * 4;
    const data = new Float32Array(width * rows.length * 4);
    rows.forEach((r, y) => r.forEach((mat, s) => data.set(mat.elements, (y * width + s * 4) * 4)));
    const tex = new THREE.DataTexture(data, width, rows.length, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    const uniforms = { uAnim: { value: tex }, uAnimSize: { value: new THREE.Vector2(width, rows.length) } };
    const ink = crowdInk(uniforms);

    // ---- Per detail level: one instanced mesh per material, one for the ink of its closed parts ----
    // All of a level's meshes share one set of per-instance buffers, written once per soldier.
    this.levels = LOD_SHARE.map(() => {
      const matrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
      const frames = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      const pigment = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      for (const a of [matrix, frames, pigment]) a.setUsage(THREE.DynamicDrawUsage);
      return { meshes: [], matrix, frames, pigment, count: 0 };
    });
    const instanced = (geo: THREE.BufferGeometry, material: THREE.Material, level: number): void => {
      const L = this.levels[level]!;
      // Each level draws the same vertices through its own index, with its own instance buffers.
      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
      g.setIndex(level === 0 ? geo.index : simplified(geo, LOD_SHARE[level]!));
      g.setAttribute('aFrames', L.frames);
      g.setAttribute('aPigment', L.pigment);
      const mesh = new THREE.InstancedMesh(g, material, capacity);
      mesh.instanceMatrix = L.matrix as THREE.InstancedBufferAttribute;
      mesh.frustumCulled = false;
      mesh.count = 0;
      L.meshes.push(mesh);
      group.add(mesh);
    };
    for (const p of parts.values()) {
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
      geo.setAttribute('aTeam', new THREE.Float32BufferAttribute(p.team, 1));
      geo.setAttribute('skinIndex', new THREE.Float32BufferAttribute(p.si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw, 4));
      // Weld identical vertices back together: the GPU skins each vertex once, not once per triangle.
      geo = mergeVertices(geo);
      const mat = toon({ map: p.material.map, color: p.material.color.clone(), side: p.material.side === THREE.DoubleSide || p.sheet[0] ? THREE.DoubleSide : THREE.FrontSide, alphaTest: p.material.alphaTest });
      crowdBody(mat, uniforms);
      // The hull leaves out open sheets: a hull a hair from a one-sided sheet flickers against it.
      const closed = p.sheet.map((sh, i) => (sh ? -1 : i)).filter((i) => i >= 0);
      let hg: THREE.BufferGeometry | null = null;
      if (closed.length) {
        hg = new THREE.BufferGeometry();
        const pick = (src: number[], n: number) => new Float32Array(closed.flatMap((i) => src.slice(i * n, i * n + n)));
        const hp = pick(p.pos, 3);
        hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
        hg.setAttribute('inkNormal', new THREE.BufferAttribute(averagedNormals(hp, pick(p.nor, 3)), 3));
        hg.setAttribute('aTeam', new THREE.BufferAttribute(pick(p.team, 1), 1));
        hg.setAttribute('skinIndex', new THREE.BufferAttribute(pick(p.si, 4), 4));
        hg.setAttribute('skinWeight', new THREE.BufferAttribute(pick(p.sw, 4), 4));
        hg = mergeVertices(hg);
      }
      LOD_SHARE.forEach((_, level) => {
        instanced(geo, mat, level);
        if (hg) instanced(hg, ink, level);
      });
    }
  }

  /** Row (fractional frames are floored on the GPU) of a pose clip at `t` seconds. */
  row(pose: Pose, variant: number, t: number, loop: boolean): number {
    const list = this.clips.get(pose)!;
    const c = list.length ? list[variant % list.length]! : this.clips.get('idle')![0]!;
    let s = t;
    if (loop) s = ((s % c.duration) + c.duration) % c.duration;
    else s = Math.min(c.duration, Math.max(0, s));
    return c.row + Math.min(c.frames - 1, Math.round(s * FPS));
  }

  duration(pose: Pose, variant = 0): number {
    const list = this.clips.get(pose)!;
    return (list[variant % Math.max(1, list.length)] ?? this.clips.get('idle')![0]!).duration;
  }

  /** Writes soldier `i` of a detail level: where it stands, which frames it shows, and its army's pigment. */
  set(level: number, i: number, matrix: THREE.Matrix4, frameA: number, frameB: number, blend: number, pigment: THREE.Color): void {
    const L = this.levels[level]!;
    matrix.toArray(L.matrix.array, i * 16);
    L.frames.setXYZW(i, frameA, frameB, blend, 0);
    L.pigment.setXYZ(i, pigment.r, pigment.g, pigment.b);
  }

  /** Draws the first `counts[level]` soldiers written at each level. */
  commit(counts: number[]): void {
    this.levels.forEach((L, level) => {
      L.count = counts[level] ?? 0;
      for (const m of L.meshes) m.count = L.count;
      for (const a of [L.matrix, L.frames, L.pigment]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, L.count * a.itemSize);
        a.needsUpdate = true;
      }
    });
  }

  get meshes(): THREE.InstancedMesh[] {
    return this.levels.flatMap((L) => L.meshes);
  }
}
