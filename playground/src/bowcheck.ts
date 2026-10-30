// Which way does each archer hold its bow? A bow's tips lie on the string; its grip bulges away
// from it, so the grip-to-tips-midpoint vector points to the string side. Held right, that side
// faces the archer (toward the drawing hand at full draw), not the target. Open /bowcheck.html.
import * as THREE from 'three';
import { instance, template } from './assets.ts';
import { UNITS } from './units.ts';

function bowMesh(root: THREE.Object3D): THREE.Mesh | undefined {
  let m: THREE.Mesh | undefined;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.hull && /bow/i.test(o.name)) m ??= o;
  });
  return m;
}

/** World positions of a mesh's vertices, skinned if it is skinned. */
function worldVerts(m: THREE.Mesh): THREE.Vector3[] {
  const p = m.geometry.attributes.position!;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3();
    if (m instanceof THREE.SkinnedMesh) m.getVertexPosition(i, v);
    else v.fromBufferAttribute(p, i);
    out.push(v.applyMatrix4(m.matrixWorld));
  }
  return out;
}

const lines: string[] = [];
for (const id of ['kaykit-ranger', 'quat-ranger']) {
  const t = await template(UNITS.find((d) => d.id === id)!);
  const root = instance(t);
  const mixer = new THREE.AnimationMixer(root);
  for (const clip of t.all.filter((c) => /bow|idle|walk|run/i.test(c.name))) {
    for (const at of [0.5, 0.95]) {
      mixer.stopAllAction();
      const a = mixer.clipAction(clip).play();
      a.time = clip.duration * at;
      mixer.update(0);
      root.updateMatrixWorld(true);
      root.traverse((o) => o instanceof THREE.SkinnedMesh && o.skeleton.update());
      const bow = bowMesh(root);
      if (!bow) continue;
      const vs = worldVerts(bow);
      // The bow's long axis: the two vertices farthest apart are its tips.
      const c = vs.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(vs.length);
      const tipA = vs.reduce((b, v) => (v.distanceToSquared(c) > b.distanceToSquared(c) ? v : b));
      const tipB = vs.reduce((b, v) => (v.distanceToSquared(tipA) > b.distanceToSquared(tipA) ? v : b));
      const mid = tipA.clone().add(tipB).multiplyScalar(0.5);
      const axis = tipB.clone().sub(tipA).normalize();
      // The grip: the vertex farthest from the string line, on the bulging side.
      const grip = vs.reduce((b, v) => {
        const off = (x: THREE.Vector3) => x.clone().sub(mid).sub(axis.clone().multiplyScalar(x.clone().sub(mid).dot(axis))).length();
        return off(v) > off(b) ? v : b;
      });
      const stringSide = mid.clone().sub(grip).setY(0).normalize();
      // The archer faces +Z: a string side toward -Z (the archer) is right; toward +Z is backwards.
      lines.push(`${id.padEnd(14)} ${clip.name.replace(/^.*\|/, '').padEnd(26)} @${at}  string side faces ${stringSide.z < -0.3 ? 'archer  ok' : stringSide.z > 0.3 ? 'TARGET  backwards' : `sideways (${stringSide.x.toFixed(2)}, ${stringSide.z.toFixed(2)})`}`);
    }
  }
}
for (const id of ['kaykit-ranger', 'quat-ranger']) {
  const mine = lines.filter((l) => l.startsWith(id) && /Bow|Idle_Weapon|Run_Holding|Walk$|Walk /.test(l));
  console.log(`${id}: ${mine.filter((l) => l.endsWith('ok')).length} ok, ${mine.filter((l) => l.includes('backwards')).length} backwards, ${mine.filter((l) => l.includes('sideways')).length} sideways of ${mine.length} bow and march poses`);
  for (const l of mine.filter((x) => !x.endsWith('ok'))) console.log('  ' + l);
}
