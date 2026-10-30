// Z-fight fix, after autobattler-2's proto3d/zfix.ts: where faces of two different meshes lie in the
// same plane, face the same way and overlap (a visor flush on a helmet, a badge on a shield), the depth
// test can't choose between them and the pixels flicker as the camera moves. Bucket every triangle by
// its world plane and lift the smaller of each overlapping pair a hair along its normal, so the detail
// always draws on top. Works on skinned meshes in their bind pose: the lift rides along with skinning.
import * as THREE from 'three';

/** Metres: far above depth precision at the playground's distances, far below anything visible. */
const LIFT = 0.0025;

interface Tri {
  mesh: number;
  f: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  d: THREE.Vector3;
  c: THREE.Vector3;
  n: THREE.Vector3;
  area: number;
}

const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
/** P strictly inside triangle t (P assumed in t's plane). */
function inside(p: THREE.Vector3, t: Tri): boolean {
  const e = (x: THREE.Vector3, y: THREE.Vector3) => _u.subVectors(y, x).cross(_w.subVectors(p, x)).dot(t.n);
  return e(t.a, t.b) > 1e-9 && e(t.b, t.d) > 1e-9 && e(t.d, t.a) > 1e-9;
}

/** Lifts coplanar overlapping faces of different meshes apart; returns how many triangles moved. */
export function fixZFight(root: THREE.Object3D): number {
  // Two passes: a lifted face can land on a third plane.
  return pass(root) + pass(root);
}

function pass(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.hull && o.geometry.attributes.position?.count) meshes.push(o);
  });
  const buckets = new Map<string, Tri[]>();
  meshes.forEach((m, mi) => {
    const g = m.geometry as THREE.BufferGeometry;
    const p = g.attributes.position!;
    const ix = g.index;
    const n = ix ? ix.count : p.count;
    const v = (i: number) => new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let f = 0; f < n; f += 3) {
      const a = v(f);
      const b = v(f + 1);
      const d = v(f + 2);
      const nn = new THREE.Vector3().subVectors(b, a).cross(_w.subVectors(d, a));
      const area = nn.length() / 2;
      if (area < 1e-9) continue;
      nn.normalize();
      const key = `${Math.round(nn.x * 150)},${Math.round(nn.y * 150)},${Math.round(nn.z * 150)},${Math.round(nn.dot(a) * 1500)}`;
      let l = buckets.get(key);
      if (!l) buckets.set(key, (l = []));
      l.push({ mesh: mi, f, a, b, d, n: nn, area, c: a.clone().add(b).add(d).divideScalar(3) });
    }
  });
  const lift = new Map<Tri, number>();
  for (const l of buckets.values()) {
    if (l.length < 2) continue;
    for (let i = 0; i < l.length; i++)
      for (let j = i + 1; j < l.length; j++) {
        const s = l[i]!;
        const t = l[j]!;
        if (s.mesh === t.mesh) continue;
        if (!(inside(s.c, t) || inside(t.c, s))) continue;
        // Several meshes can stack in one plane: lift each by its rank, smallest on top.
        const top = s.area < t.area ? s : t;
        const low = top === s ? t : s;
        lift.set(top, Math.max(lift.get(top) ?? 0, (lift.get(low) ?? 0) + 1));
      }
  }
  if (!lift.size) return 0;
  // A lifted triangle must not drag its neighbours along: give the meshes it touches their own vertices.
  const touched = new Set([...lift.keys()].map((t) => t.mesh));
  for (const mi of touched) {
    const g = meshes[mi]!.geometry as THREE.BufferGeometry;
    if (g.index) meshes[mi]!.geometry = g.toNonIndexed();
  }
  const inv = meshes.map((m) => m.matrixWorld.clone().invert());
  for (const [t, k] of lift) {
    const m = meshes[t.mesh]!;
    const p = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < 3; v++) {
      const w = new THREE.Vector3().fromBufferAttribute(p, t.f + v).applyMatrix4(m.matrixWorld).addScaledVector(t.n, LIFT * Math.min(k, 3));
      w.applyMatrix4(inv[t.mesh]!);
      p.setXYZ(t.f + v, w.x, w.y, w.z);
    }
  }
  for (const mi of touched) {
    meshes[mi]!.geometry.attributes.position!.needsUpdate = true;
    meshes[mi]!.geometry.computeBoundingSphere();
  }
  return lift.size;
}
