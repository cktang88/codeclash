// Poses one unit at a share of one clip, seen from several sides, to check how it holds its kit.
//   /pose.html?unit=kaykit-ranger&clip=Ranged_Bow_Draw&at=0.9
import * as THREE from 'three';
import { instance, template } from './assets.ts';
import { inkWidth, lights } from './style.ts';
import { UNITS } from './units.ts';

const q = new URLSearchParams(location.search);
const def = UNITS.find((d) => d.id === (q.get('unit') ?? 'kaykit-ranger'))!;
const t = await template(def);
const clip = t.all.find((c) => c.name.endsWith(q.get('clip') ?? '')) ?? t.clips.get('attack')![0]!;
inkWidth.value = 0.012;
const W = 1200;
const H = 420;
const r = new THREE.WebGLRenderer({ antialias: true });
r.setSize(W, H);
r.setScissorTest(true);
document.body.append(r.domElement);
const label = document.createElement('div');
label.style.cssText = 'position:fixed;top:4px;left:8px;font:14px monospace';
label.textContent = `${def.id} · ${clip.name} @ ${q.get('at') ?? 0.8}`;
document.body.append(label);
const s = new THREE.Scene();
s.background = new THREE.Color(0x8fa3b8);
lights(s).castShadow = false;
const m = instance(t);
s.add(m, new THREE.AxesHelper(1));
const mixer = new THREE.AnimationMixer(m);
const a = mixer.clipAction(clip).play();
a.time = clip.duration * Number(q.get('at') ?? 0.8);
mixer.update(0);
// Front (+Z, its facing), its right side, its left side, from above.
const views: [number, number, number][] = [[0, 1, 4], [4, 1, 0], [-4, 1, 0], [0.01, 5, 0]];
views.forEach((p, i) => {
  const cam = new THREE.PerspectiveCamera(30, W / 4 / H, 0.1, 50);
  cam.position.set(...p);
  cam.lookAt(0, 1, 0);
  r.setViewport((i * W) / 4, 0, W / 4, H);
  r.setScissor((i * W) / 4, 0, W / 4, H);
  r.render(s, cam);
});
(window as unknown as { done: boolean }).done = true;
