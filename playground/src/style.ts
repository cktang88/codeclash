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

// polygonOffset pushes the hull back in depth, so where it lies a hair from a surface (layered hair
// strands, a pauldron on a shoulder) the surface always wins the depth test instead of flickering.
const inkMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
inkMaterial.onBeforeCompile = (s) => {
  s.uniforms.uInk = inkWidth;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uInk;')
    .replace('#include <common>', '#include <common>\nattribute vec3 inkNormal;')
    .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(inkNormal) * uInk / length(modelMatrix[0].xyz);');
};

/**
 * Normals averaged over every vertex at the same position. A model with hard edges keeps split
 * normals there, and pushing the hull along those tears it open at every crease; the averaged
 * normal keeps the hull closed.
 */
function inkNormals(g: THREE.BufferGeometry): void {
  if (g.attributes.inkNormal) return;
  const p = g.attributes.position!;
  const n = g.attributes.normal;
  if (!n) g.computeVertexNormals();
  const nor = g.attributes.normal!;
  const sum = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const v = sum.get(k) ?? sum.set(k, new THREE.Vector3()).get(k)!;
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = sum.get(key(i))!;
    // Opposed normals at one point (a fin's two faces) cancel; fall back to the vertex's own.
    if (v.lengthSq() < 1e-8) v.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    v.normalize();
    out.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('inkNormal', new THREE.BufferAttribute(out, 3));
}

const sheets = new WeakMap<THREE.BufferGeometry, boolean>();
/**
 * An open sheet (a cape, a cloak, a shoelace): many edges belong to one triangle only. It needs
 * both faces drawn, and no hull: a hull a hair in front of a one-sided sheet flickers against it.
 */
export function isSheet(g: THREE.BufferGeometry): boolean {
  let s = sheets.get(g);
  if (s !== undefined) return s;
  const p = g.attributes.position!;
  const ix = g.index;
  const n = ix ? ix.count : p.count;
  const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  const edges = new Map<string, number>();
  for (let f = 0; f < n; f += 3) {
    const k = [0, 1, 2].map((j) => key(ix ? ix.getX(f + j) : f + j));
    for (let e = 0; e < 3; e++) {
      const id = [k[e]!, k[(e + 1) % 3]!].sort().join('|');
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  const open = [...edges.values()].filter((c) => c === 1).length;
  s = edges.size > 0 && open / edges.size > 0.1;
  sheets.set(g, s);
  return s;
}
let inkOn = true;
export function setInk(on: boolean): void {
  inkOn = on;
  inkMaterial.visible = on;
}

/** An inverted hull: the mesh pushed out along its normals, back faces only, in ink. */
export function hullOf(mesh: THREE.Mesh): THREE.Mesh {
  inkNormals(mesh.geometry);
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
  for (const mesh of meshes) {
    if (!mesh.geometry.attributes.position?.count) continue;
    const sheet = isSheet(mesh.geometry);
    // Keep the pack's sidedness (KayKit draws both faces: its heads and bodies are open where
    // parts meet), and always draw both faces of a sheet.
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      return toon({ map: src.map ?? null, color: src.color?.clone() ?? new THREE.Color(0xffffff), side: sheet ? THREE.DoubleSide : src.side, transparent: src.transparent, alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0) });
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    if (!sheet) mesh.parent?.add(hullOf(mesh));
  }
}

export function lights(scene: THREE.Scene): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(0xfff0d2, 2.4);
  key.position.set(-6, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  // Without bias the ground and the soldiers shade themselves in stripes (shadow acne); normalBias
  // pushes the lookup off curved surfaces, a few millimetres at this map's ~3 cm texels.
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  const c = key.shadow.camera;
  c.left = c.bottom = -30;
  c.right = c.top = 30;
  c.far = 60;
  scene.add(key, key.target, new THREE.HemisphereLight(0xfff2da, 0x2c3a5a, 1.1));
  return key;
}
