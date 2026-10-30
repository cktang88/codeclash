// Diagnostics for every unit's meshes: mirrored transforms, missing or zero normals, normals
// pointing inward, and material sidedness. Open /diag.html and read the console.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KAYKIT } from './packs/kaykit.ts';
import { QUATERNIUS } from './packs/quaternius.ts';

const urls = new Set<string>();
for (const d of [...KAYKIT, ...QUATERNIUS]) {
  urls.add(d.model);
  for (const e of d.extras ?? []) urls.add(e);
}
const out: string[] = [];
for (const url of urls) {
  const root = /\.fbx$/i.test(url) ? await new FBXLoader().loadAsync(url) : (await new GLTFLoader().loadAsync(url)).scene;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position!;
    const nor = g.attributes.normal;
    const det = o.matrixWorld.determinant();
    let zero = 0;
    let inward = 0;
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    if (nor) {
      for (let i = 0; i < pos.count; i++) {
        n.fromBufferAttribute(nor, i);
        if (n.lengthSq() < 1e-6) zero++;
        p.fromBufferAttribute(pos, i).sub(c);
        if (p.dot(n) < 0) inward++;
      }
    }
    // Winding vs normals: the face normal from winding should agree with the stored normals.
    let flipped = 0;
    let faces = 0;
    const idx = g.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
    for (let t = 0; t < tri && nor; t += 7) {
      const [i0, i1, i2] = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      a.fromBufferAttribute(pos, i0!);
      b.fromBufferAttribute(pos, i1!);
      d.fromBufferAttribute(pos, i2!);
      fn.subVectors(b, a).cross(d.clone().sub(a));
      if (fn.lengthSq() < 1e-12) continue;
      vn.fromBufferAttribute(nor, i0!).add(n.fromBufferAttribute(nor, i1!)).add(n.fromBufferAttribute(nor, i2!));
      faces++;
      if (fn.dot(vn) < 0) flipped++;
    }
    // Open meshes (capes, wings, planes) have edges used by one triangle only, after welding by position.
    const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const edges = new Map<string, number>();
    for (let t = 0; t < tri; t++) {
      const ks = [0, 1, 2].map((k) => key(idx ? idx.getX(t * 3 + k) : t * 3 + k));
      for (let e = 0; e < 3; e++) {
        const [u, v] = [ks[e]!, ks[(e + 1) % 3]!].sort();
        edges.set(`${u}|${v}`, (edges.get(`${u}|${v}`) ?? 0) + 1);
      }
    }
    const open = [...edges.values()].filter((n) => n === 1).length;
    const sides = [o.material].flat().map((m) => ['F', 'B', 'D'][m.side]).join('');
    const flags = [det < 0 && 'MIRRORED', !nor && 'NO-NORMALS', zero && `zero-normals:${zero}`, faces && flipped / faces > 0.2 && `winding-vs-normal-flipped:${Math.round((100 * flipped) / faces)}%`, inward / pos.count > 0.6 && `mostly-inward:${Math.round((100 * inward) / pos.count)}%`, open && `open-edges:${open}/${edges.size}`].filter(Boolean);
    if (flags.length) console.log(`${url.split('/').pop()} :: ${o.name} [${sides}] verts=${pos.count} ${flags.join(' ')}`);
  });
}
console.log('diag done', out.length);
(window as unknown as { diagDone: boolean }).diagDone = true;
