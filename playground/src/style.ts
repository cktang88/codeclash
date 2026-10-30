// The playground's look: toon bands lit warm from the upper left, shadows falling to ink-blue,
// and an inverted-hull ink line, applied to whatever model a pack provides.
import * as THREE from 'three';

export const INK = 0x22180f;
/** Army colours as the art direction's actor pigments (the hue bold, mixed 6% toward earth). */
export const TEAMS = [0x3d63c4, 0xc8432c];

/** Ink width in world units; main sets it from the camera so it stays near a pixel width. */
export const inkWidth = { value: 1.5 };

let bands = 3;
const toons: THREE.MeshToonMaterial[] = [];

function gradientMap(n: number): THREE.Texture | null {
  if (n < 2) return null;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) data.fill(Math.round(70 + (185 * i) / (n - 1)), i * 4, i * 4 + 4);
  const t = new THREE.DataTexture(data, n, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function setBands(n: number): void {
  bands = n;
  const g = gradientMap(n);
  for (const m of toons) {
    m.gradientMap = g;
    m.needsUpdate = true;
  }
}

export function toon(params: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ gradientMap: gradientMap(bands), ...params });
  toons.push(m);
  return m;
}

const inkMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
inkMaterial.onBeforeCompile = (s) => {
  s.uniforms.uInk = inkWidth;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uInk;')
    .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uInk / length(modelMatrix[0].xyz);');
};
let inkOn = true;
export function setInk(on: boolean): void {
  inkOn = on;
  inkMaterial.visible = on;
}

/** An inverted hull: the mesh pushed out along its normals, back faces only, in ink. */
export function hullOf(mesh: THREE.Mesh): THREE.Mesh {
  let h: THREE.Mesh;
  if (mesh instanceof THREE.SkinnedMesh) {
    const s = new THREE.SkinnedMesh(mesh.geometry, inkMaterial);
    s.bind(mesh.skeleton, mesh.bindMatrix);
    h = s;
  } else h = new THREE.Mesh(mesh.geometry, inkMaterial);
  h.frustumCulled = false;
  h.position.copy(mesh.position);
  h.quaternion.copy(mesh.quaternion);
  h.scale.copy(mesh.scale);
  h.userData.hull = true;
  inkMaterial.visible = inkOn;
  return h;
}

/** Swaps every material for a toon one that keeps its texture and colour, and inks every mesh. */
export function stylize(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.hull) meshes.push(o);
  });
  const swap = (m: THREE.Material): THREE.Material => {
    const src = m as THREE.MeshStandardMaterial;
    return toon({ map: src.map ?? null, color: src.color?.clone() ?? new THREE.Color(0xffffff), transparent: src.transparent, alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0) });
  };
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.parent?.add(hullOf(mesh));
  }
}

export function lights(scene: THREE.Scene): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(0xfff0d2, 2.4);
  key.position.set(-6, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const c = key.shadow.camera;
  c.left = c.bottom = -30;
  c.right = c.top = 30;
  c.far = 60;
  scene.add(key, key.target, new THREE.HemisphereLight(0xfff2da, 0x2c3a5a, 1.1));
  return key;
}
