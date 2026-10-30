// Measures each unit's footprint from its posed model: the ground-plane bounding box of its body
// (skinned meshes) and of everything (with weapons), over its idle, walk and attack clips. Open
// /footprint.html and read the console; the radii feed the simulation's collision circles.
import * as THREE from 'three';
import { instance, template, type Pose } from './assets.ts';
import { UNITS } from './units.ts';

const rows: string[] = [];
for (const def of UNITS) {
  let t;
  try {
    t = await template(def);
  } catch {
    continue;
  }
  const root = instance(t);
  const mixer = new THREE.AnimationMixer(root);
  const body = new THREE.Box3();
  const all = new THREE.Box3();
  for (const pose of ['idle', 'walk', 'attack'] as Pose[]) {
    for (const clip of t.clips.get(pose) ?? []) {
      const a = mixer.clipAction(clip);
      for (let f = 0; f <= 8; f++) {
        mixer.stopAllAction();
        a.reset().play();
        a.time = (clip.duration * f) / 8;
        mixer.update(0);
        root.updateMatrixWorld(true);
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || o.userData.hull) return;
          let b: THREE.Box3;
          if (o instanceof THREE.SkinnedMesh) {
            o.skeleton.update();
            o.computeBoundingBox();
            b = o.boundingBox!.clone().applyMatrix4(o.matrixWorld);
            body.union(b);
          } else {
            o.geometry.computeBoundingBox();
            b = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
          }
          all.union(b);
        });
      }
    }
  }
  // Half the body's smaller ground extent: the solid core two soldiers shouldn't share.
  const hx = (body.max.x - body.min.x) / 2;
  const hz = (body.max.z - body.min.z) / 2;
  rows.push(`${def.id.padEnd(22)} now ${def.stats.radius.toFixed(2)}  body ${(2 * hx).toFixed(2)}×${(2 * hz).toFixed(2)} m  suggest ${(Math.min(hx, hz) * 1.0).toFixed(2)}–${Math.max(hx, hz).toFixed(2)}  with kit ${(all.max.x - all.min.x).toFixed(2)}×${(all.max.z - all.min.z).toFixed(2)}`);
}
console.log(rows.join('\n'));
